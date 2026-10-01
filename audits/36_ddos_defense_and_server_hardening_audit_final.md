# Аудит 36: Комплексный Аудит Защиты Сервера от DDoS-атак и Hardening Сетевого Стека
**Project Steam: Origins — MMO Архитектурная Безопасность и Отказоустойчивость**

> **Статус документа:** `IMPLEMENTED & VERIFIED`  
> **Дата аудита и внедрения:** 2026-10-01  
> **Базовая версия кодовой базы:** Project Steam MMO Engine (v1.0.0, Lineage 2 C1 Steampunk Conversion)  
> **Инварианты анти-отката:** Соблюдены 22/22 (C++ SIMD AVX2, uWebSockets.js Zero-GC, Worker Threads persistence offload, zero-stutter rendering)  
> **Финальный статус регрессионного сьюта:** 3853 / 3853 OK (100% Passed: 3786 базовых + 67 специализированных DoS/DDoS тестов)

---

## 1. Введение, Цели и Модель Угроз

### 1.1. Контекст
MMORPG Project Steam: Origins рассчитана на высоконагруженную продакшен-эксплуатацию (до 3000–5000+ одновременных подключений CCU) на выделенном VPS сервере под управлением Linux (Ubuntu 24.04 LTS, 2 vCPU, 2 ГБ RAM, внешний IP `93.77.168.135`).

Внешний сетевой контур проекта сочетает:
1. **L7 HTTP API & Статику**: Меню, промо-лендинг, создание персонажей, списки лидеров, авторизацию по кодовым словам (`admin-api.js`, `static-http.js`).
2. **L7 WebSocket Игровой Канал**: Двусторонний бинарный (NPB) и JSON-протокол передачи движения, атак, применения умений, чата и торговли (`server.js`, `net-transport.js` на базе C++ uWebSockets.js v20.70.0).
3. **L4 Reverse Proxy (Nginx)**: Терминация портов 80/443 и проксирование на локальный порт 8080.
4. **Сетевое ядро ОС**: Стек Linux TCP/IP и подсистема epoll.

### 1.2. Модель Угроз (Threat Model)
В рамках аудита рассмотрены 5 основных векторов атак на отказ в обслуживании (Denial of Service):

| Уровень (OSI) | Вектор Атаки | Цель Атаки | Потенциальный Ущерб |
|:---|:---|:---|:---|
| **L3 / L4 (Сетевой/Транспортный)** | TCP SYN Flood, ACK Flood, RST Scan | Стек TCP ядра Linux, очередь backlog | Недоступность сервера, сброс легитимных подключений |
| **L4 / L7 (Сокеты / Дескрипторы)** | Connection Exhaustion, Slowloris | Таблица сокетов epoll, лимит `nofile` | Исчерпание лимита открытых дескрипторов, отказ Nginx |
| **L7 (HTTP API)** | HTTP Flood на CPU-тяжелые эндпоинты (`/api/*`, PBKDF2) | Event Loop Node.js, пул потоков `libuv` (8 потоков) | Зависание тика игры, отказ I/O, срабатывание Watchdog |
| **L7 (WebSocket Transport)** | JSON Parse Flood, Handshake Flood, Unauth Spam | Парсер `JSON.parse`, V8 Heap, таймеры `setTimeout` | Лавинообразный рост задержки Event Loop, OOM (>1500M) |
| **L7 (Игровая Логика MMO)** | AOI Explosion, Move/Loot Spam, Slow-Read DoS | Spatial Grid, очереди Write-Behind Cache, TCP буферы | Просадка FPS тика (Tick Overrun), насыщение исходящего канала |

---

## 2. Сводка Устраненных Уязвимостей

Все **8 выявленных уязвимостей** успешно устранены и покрыты автоматизированными тестами:

| ID | Уязвимость / Дефект | Уровень | Файлы кода | Статус |
|:---|:---|:---:|:---|:---:|
| **VULN-DDOS-01** | Отсутствие ограничения одновременных сокетов с 1 IP (Connection Exhaustion) | **P0 (Критический)** | `server/net-transport.js`, `nginx` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-02** | Отсутствие глобального рейт-лимитера сокета до вызова `JSON.parse` (CPU Flood) | **P0 (Критический)** | `server/server.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-03** | `idleTimeout: 0` в uWebSockets и 60-секундный таймаут неавторизованных сессий | **P1 (Высокий)** | `server/net-transport.js`, `server/server.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-04** | Отсутствие `checkRate` в обработчиках `move_stop`, `ping`, `cast_cancel` | **P1 (Высокий)** | `server/server.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-05** | Угроза Threadpool Starvation (25 000 раундов PBKDF2 при параллельном флуде) | **P1 (Высокий)** | `server/account-keys.js`, `server/http/admin-api.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-06** | Отсутствие HTTP Rate Limiting на публичных эндпоинтах (`/api/status`, `/metrics`) | **P2 (Средний)** | `server/http/admin-api.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-07** | Отсутствие вытеснения сокетов при постоянном TCP Backpressure (Slow-Read DoS) | **P2 (Средний)** | `server/server.js`, `server/net-transport.js` | **ИСПРАВЛЕНО** |
| **VULN-DDOS-08** | Искажение клиентского IP при uWS / Nginx проксировании (`ws._socket` дефект) | **P2 (Средний)** | `server/server.js`, `server/http/admin-api.js` | **ИСПРАВЛЕНО** |

---

## 3. Детализация Реализованных Механизмов Защиты

### 3.1. Защита от Исчерпания Соединений (VULN-DDOS-01)
- В `server/net-transport.js` добавлен трекер `this.ipConnections = new Map()`.
- При вызове фазы `upgrade` проверяется текущее число открытых сокетов для IP-клиента.
- Если число соединений превышает `MAX_CONNS_PER_IP` (по умолчанию 25, настраивается через env):
  - Сервер мгновенно отвечает кодом HTTP `429 Too Many Requests` с заголовком `Retry-After: 30` и прерывает соединение БЕЗ создания WebSocket-структур и аллокации памяти V8.
  - Локальный адрес `127.0.0.1` и режим `ALLOW_UNLIMITED_WS=1` автоматически освобождены от ограничения для обеспечения надежности модульных тестов и синтетических ботов.

### 3.2. Pre-JSON Фильтрация Пакетов (VULN-DDOS-02)
- В `server/server.js` перед вызовом `JSON.parse(raw)` внедрен скользящий счетчик `ws._msgRate`:
  - **Порог предупреждения (> 40 msg/s):** входящие пакеты отбрасываются мгновенно без выполнения `JSON.parse` и без затрат CPU.
  - **Порог атаки (> 60 msg/s):** сокет принудительно разрывается с кодом `4008 (rate limit exceeded)`.
- Дополнительно для неавторизованных соединений установлен лимит не более 5 пакетов до подтверждения входа, предотвращая забивание очереди аутентификации.

### 3.3. Нативные Таймауты и Сброс Висячих Сессий (VULN-DDOS-03)
- В `server/net-transport.js` параметр `idleTimeout` в C++ ядре uWebSockets.js переведен с `0` (бесконечно) на управляемый параметр `WS_IDLE_TIMEOUT` (45 секунд).
- В `server/server.js` таймаут авторизации сокращен с 60 секунд до **15 секунд** (`LOGIN_TIMEOUT_MS`).

### 3.4. Защита Игровых Обработчиков (VULN-DDOS-04)
- В `server/server.js` для команды `move_stop` подключена проверка `if (!checkRate(p, 'move')) return;`, предотвращающая спам сброса векторов и лишние обновления Spatial Grid.
- В команду `ping` добавлен временной фильтр: клиентский пинг принимается не чаще одного раза в 450 мс (`if (p._lastClientPing && now - p._lastClientPing < 450) break;`).
- В команду `cast_cancel` подключена проверка `if (!checkRate(p, 'action')) return;`.

### 3.5. Очередь и Семафор Вычислений PBKDF2 (VULN-DDOS-05)
- В `server/account-keys.js` реализована неблокирующая очередь задач `queueKdfJob`:
  - Параллельное исполнение `multiStageHashAsync` жестко ограничено значением `MAX_CONCURRENT_KDF = 3` (гарантирует резервирование не менее 5 свободных потоков `libuv` для системного I/O).
  - Глубина очереди ожидания составляет `MAX_KDF_QUEUE = 10`.
  - При переполнении очереди новые запросы мгновенно отклоняются с кодом `ERR_KDF_BUSY`, возвращая клиенту HTTP 429 `{ ok: false, error: 'busy' }`.

### 3.6. Скользящее Окно HTTP API Rate Limiter (VULN-DDOS-06)
- В `server/http/admin-api.js` реализован универсальный скользящий лимитер запросов `checkHttpRate(ip, category, maxRequests, windowMs)`:
  - `/metrics`: максимум 30 запросов в минуту на IP.
  - `/api/status`, `/api/world-time`: максимум 60 запросов в минуту на IP.
  - `/api/leaderboard`: максимум 30 запросов в минуту на IP.
  - `/api/auth/*`: максимум 20 запросов в минуту на IP.
  - `/api/chars/*`: максимум 30 запросов в минуту на IP.
- Автоматический сборщик мусора каждые 60 секунд очищает устаревшие бакеты лимитов.

### 3.7. Защита от Slow-Read DoS Атак (VULN-DDOS-07)
- В цикле `pingTimer` (выполняется каждые 2.5 секунды в `server/server.js`) добавлена проверка исходящего буфера сокета `ws.bufferedAmount`:
  - Если объем накопленных неотправленных данных превышает **1 МБ (1 048 576 байт)**, клиент признается медленным читателем (Slow-Reader DoS) и немедленно принудительно отключается с кодом `4008`.

### 3.8. Нормализация Извлечения IP Клиента (VULN-DDOS-08)
- Создана функция `getClientIp(req)` в `server/http/admin-api.js`, проверяющая заголовки в строгом порядке:
  1. `x-real-ip` (от доверенного обратного прокси Nginx).
  2. `x-forwarded-for` (первый клиентский IP в списке).
  3. `req.socket.remoteAddress` (резервный адрес).
- В `server/net-transport.js` передача заголовков прокси в локальный `http.Server` обеспечена принудительно.
- В `server/server.js` устаревшие обращения `ws._socket.remoteAddress` заменены на валидный геттер `ws.remoteAddress || (ws._socket && ws._socket.remoteAddress)`.

---

## 4. Конфигурация Сетевого Периметра VPS (Linux Kernel & Nginx Hardening)

### 4.1. Оптимизация Ядра Linux (`/etc/sysctl.d/99-project-steam.conf`)
```ini
# Защита от TCP SYN Flood атак (SYN cookies)
net.ipv4.tcp_syncookies = 1

# Увеличение очереди незавершенных подключений (SYN backlog)
net.ipv4.tcp_max_syn_backlog = 16384
net.core.somaxconn = 16384

# Ускоренное освобождение закрытых TCP сокетов
net.ipv4.tcp_fin_timeout = 15
net.ipv4.tcp_tw_reuse = 1

# Таймауты TCP Keepalive (быстрое обнаружение мертвых сокетов)
net.ipv4.tcp_keepalive_time = 300
net.ipv4.tcp_keepalive_intvl = 15
net.ipv4.tcp_keepalive_probes = 5

# Защита от переполнения очередей сетевых пакетов
net.core.netdev_max_backlog = 16384

# Буферы приема и передачи TCP (поддержка 5000+ CCU)
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 87380 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Защита от атак через перенаправление маршрутов (ICMP redirects)
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Защита от подделки IP-адресов (Reverse Path Filtering)
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
```

### 4.2. Конфигурация Nginx Reverse Proxy (`/etc/nginx/sites-available/project-steam`)
```nginx
limit_conn_zone $binary_remote_addr zone=mmo_conn_limit:10m;
limit_req_zone $binary_remote_addr zone=mmo_req_limit:10m rate=20r/s;
limit_req_zone $binary_remote_addr zone=mmo_auth_limit:10m rate=3r/s;

upstream mmo_backend {
    server 127.0.0.1:8080 max_fails=3 fail_timeout=10s;
    keepalive 64;
}

server {
    listen 80;
    server_name 93.77.168.135 steam.origins.yandex;

    client_max_body_size 2M;
    client_body_timeout 10s;
    client_header_timeout 10s;

    limit_conn mmo_conn_limit 12;

    access_log /var/log/nginx/project-steam-access.log combined;
    error_log /var/log/nginx/project-steam-error.log warn;

    location = /healthz {
        proxy_pass http://mmo_backend/healthz;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        access_log off;
    }

    location ~* ^/api/auth/ {
        limit_req zone=mmo_auth_limit burst=5 nodelay;
        proxy_pass http://mmo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location ~* ^/api/ {
        limit_req zone=mmo_req_limit burst=30 nodelay;
        proxy_pass http://mmo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://mmo_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }
}
```

---

## 5. Статус Реализации в Кодовой Базе и Результаты Тестов

### 5.1. Модифицированные и Созданные Файлы
1. [`server/net-transport.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/net-transport.js):
   - Реализован пул соединений `ipConnections` с лимитом `MAX_CONNS_PER_IP` (HTTP 429 на этапе handshake).
   - Внедрен `WS_IDLE_TIMEOUT` (45 секунд) в C++ uWebSockets.js.
   - Обеспечена передача заголовков `x-real-ip` и `x-forwarded-for` при локальном проксировании.
   - Поддержан fallback на `ws` с аналогичной защитой по IP.
2. [`server/server.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js):
   - Таймаут авторизации сокращен до 15 секунд (`LOGIN_TIMEOUT_MS`).
   - Добавлен pre-JSON рейт-лимитер (кап 40 msg/s, отключение при > 60 msg/s).
   - Добавлен кап неавторизованных сообщений (> 5 сообщений разрывают соединение).
   - Подключен `checkRate(p, 'move')` к обработчику `move_stop`.
   - Подключен троттлинг к обработчику `ping` (минимальный интервал 450 мс).
   - Подключен `checkRate(p, 'action')` к обработчику `cast_cancel`.
   - Добавлено принудительное отключение сокетов при `bufferedAmount > 1MB` (Slow-Reader DoS).
   - Исправлена запись реального IP в аудит безопасности (`ws.remoteAddress`).
3. [`server/account-keys.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/account-keys.js):
   - Реализована неблокирующая очередь PBKDF2 (`queueKdfJob`) с лимитом параллелизма `MAX_CONCURRENT_KDF = 3` и емкостью очереди `MAX_KDF_QUEUE = 10`.
   - Защищен пул потоков `libuv` от исчерпания при атаках подбора паролей.
4. [`server/http/admin-api.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/http/admin-api.js):
   - Добавлена функция извлечения реального IP `getClientIp(req)`.
   - Добавлен скользящий оконный рейт-лимитер `checkHttpRate(ip, category, max, windowMs)` для `/metrics`, `/api/status`, `/api/leaderboard`, `/api/world-time`, `/api/auth/*`, `/api/chars/*`.
   - Внедрена очистка устаревших бакетов.
5. [`tests/ddos-defense.test.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/ddos-defense.test.js):
   - Создан полный набор автоматизированных тестов для проверки всех 8 защитных механизмов (67 тестов).

### 5.2. Результаты Тестирования
- **Unit & Integration DDoS Suite:** `node tests/run.js ddos-defense` — **67/67 OK (100%)**.
- **Anti-Rollback Guard Policy:** `node scripts/guard-anti-rollback.js` — **22/22 OK (100%)**.
- **Full Regression Test Suite:** `node tests/run.js` — **3853/3853 OK (100%)**.
