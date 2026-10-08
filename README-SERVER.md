# Сервер Project Steam: Origins — Запуск, Архитектура и Эксплуатация

> 📚 **Интерактивный Портал Документации Сервера:**  
> [**Открыть Главный Портал Документации (server_docs/index.html)**](file:///d:/games/yandex/лайнэйдж/project-steam1/server_docs/index.html) — 8 интерактивных глав: Zero-GC C++ транспорт, C++ SIMD AVX2 боевой движок, Worker Threads I/O, 3 класса и экономика C1 x1, античит, DDoS-защита и регламент Zero Rollback.

Сервер = авторитетный «ведущий» MMO. Клиент шлёт исключительно намерения (`intents`), сервер производит все расчёты мира, геодаты, боевой математики и сохраняет прогресс.  
Архитектура оптимизирована для удержания **до 5 000+ активных игроков (CCU)** на едином VPS узле без межпроцессных задержек благодаря нативному C++ SIMD движку и Zero-GC транспорту.

---

## 1. Системные требования

- **Node.js:** v18+ LTS / v20+ / v22+ LTS (`node -v`).
- **Компилятор C++ (для нативного модуля):** GCC/G++ 11+ (`-mavx2`), Clang 13+ или MSVC 2022 v143+.
- **RAM:** от 2 ГБ для локальной разработки / 4–8 ГБ для production (нагрузка 5000 CCU).
- **ОС:** Linux (Ubuntu 22.04 / 24.04 LTS рекомендуется для продакшена), Windows 10/11, macOS.
- **Инструмент сборки нативных модулей:** `node-gyp` (входит в `npm`).

---

## 2. Установка зависимостей и сборка C++ движка

В корне проекта выполните:

```bash
# Установка JS-зависимостей и автоматическая сборка C++ модуля
npm install

# Ручная пересборка C++ SIMD движка при необходимости:
npx node-gyp rebuild
```

Проверка компиляции C++ модуля:
```bash
node -e "const n = require('./native/build/Release/project_steam_native.node'); console.log('C++ AVX2 SIMD OK:', !!n.SpatialGrid);"
```

---

## 3. Режимы запуска сервера

### 3.1. Локальная разработка (Dev / Standalone)

```bash
npm start
```

Сервер запускается с оптимизированными параметрами V8 V8 (`--max-semi-space-size=64 --max-old-space-size=2048`) на порту `8080`.  
- Статус: `http://localhost:8080` — `Project Steam MMO server is running.`
- Метрики реального времени: `http://localhost:8080/metrics`
- Healthcheck для балансировщиков: `http://localhost:8080/healthz`

Локальный клиентский интерфейс и меню отладки запускаются отдельно:
```bash
npm run menu
# Доступно по адресу: http://localhost:3000/menu.html?server=127.0.0.1:8080
```

### 3.2. Боевой продакшен (PM2 Cluster / Dedicated VPS)

В продакшене сервер работает под управлением **PM2** в режиме Zero-IPC Single-Instance с изоляцией дискового I/O через Worker Threads:

```bash
# Запуск через PM2 с полным профилем продакшена
pm2 start ecosystem.config.js --env production

# Мониторинг процессов и ресурсов в консоли
pm2 status
pm2 logs project-steam-mmo

# Мягкий перезапуск процессов
pm2 reload ecosystem.config.js --env production
```

Процессы в продакшене:
1. `project-steam-mmo` — главное игровое ядро (Event Loop 10 Hz, uWebSockets.js v20.70.0, C++ AVX2 SIMD, Worker Threads).
2. `project-steam-watchdog` — сторожевой процесс проверки `/healthz` (автоперезапуск при залипании тика).

---

## 4. Ключевые Архитектурные Подсистемы

### 4.1. C++ Zero-GC Сетевой Транспорт (`uWebSockets.js` v20.70.0)
- **Файл:** `server/net-transport.js`.
- **Инвариант:** В продакшене работает исключительно uWebSockets.js (`NET_ENGINE=uws`, `STRICT_UWS=1`).
- Обеспечивает прямое сокетное взаимодействие без сборки мусора V8 (Zero-GC), встроенный быстрый Pub/Sub и пропускную способность свыше 100 000 пакетов в секунду при потреблении RAM менее 200 МБ.
- Откаты на чистый JavaScript `ws` в продакшене строго заблокированы (fail-fast с кодом `ERR_UWS_NOT_AVAILABLE`).

### 4.2. Нативный C++ SIMD Боевой Движок (`project_steam_native.node`)
- **Исходники:** `native/src/combat_engine.h`, `native/src/spatial_grid.h`, `native/src/main.cpp`.
- Компилируется с флагами максимальной векторизации `-O3 -mavx2`.
- Пакетный расчет 8/16 боевых формул за одну инструкцию CPU.
- Ускорение поиска целей, расчета коллизий и геометрии Spatial Grid в 35–40 раз относительно pure JS.

### 4.3. Разгрузка диска через Worker Threads (vCPU 2 Offload)
- **Файлы:** `server/workers/persistence-client.js`, `server/workers/persistence-worker.js`.
- Сохранение профилей игроков, сериализация в JSON и тяжелые файловые операции (`atomicWrite`, `sync`, `copyFile`) вынесены в фоновый поток `worker_threads`.
- Нулевое влияние дисковых задержек (IOPS / fsync) на тайминг игрового тика (тик стабилен в пределах 1–5 мс).

### 4.4. Защита от DDoS и Сетевой Харденинг
- **Файлы:** `server/server.js`, `tests/ddos-defense.test.js`, аудит `audits/36_ddos_defense_and_server_hardening_audit_final.md`.
- Двухуровневый Rate Limiter: защита от flood-подключений и пакетов по IP и по сокету.
- Строгий лимит максимального размера фрейма (64 КБ).
- Защита от медленных атак (Slowloris) и мгновенный бан флудящих адресов.

---

## 5. Классовая Система и Экономика (Канон C1 x1)

### 5.1. Три базовых класса и ветвление 1-х профессий
1. **Оператор (Operator):** мастер паровых механизмов и тяжелой брони.
   - 1-я профессия: Паровой Рыцарь (Steam Knight) / Штурмовик (Assault Specialist).
2. **Инженер (Engineer):** тактик дальнего боя, тесла-установок и эфирной энергии.
   - 1-я профессия: Тесла-Стрелок (Tesla Gunner) / Эфирный Технолог (Aether Tech).
3. **Мастеровой (Craftsman / Вольная Гильдия Векса и Доры):**
   - 1-я профессия: **Утилизатор (Scrapper)** — демонтаж мобов, извлечение ценных ресурсов, спойл деталей.
   - 1-я профессия: **Котловой Кузнец (Boiler Blacksmith)** — ковка брони и оружия D-ранга, создание Зарядов Души и Духа, оффлайн-мануфактура.

### 5.2. Каноничный Закон Зарядов (Soulshots / Spiritshots)
- **Физические заряды (Soulshots):** увеличивают физический урон на **+100%** (множитель 2.0x).
- **Магические заряды (Spiritshots):** увеличивают магическую атаку на **+100%** (урон заклинаний $\approx +41.4\%$).
- **Динамический расход зарядов оружием (Канон Lineage 2 C1):**
  - Кинжалы, Мечи, Дубины: 1 Soulshot / 1 Spiritshot.
  - Двуручные молоты: 3 Soulshots.
  - Луки (в зависимости от грейда): 2 / 3 / 4 / 6 Soulshots.
  - Боевые магические посохи: 2 Spiritshots.
  - Молитвенные булавы: 3 Spiritshots.

---

## 6. Деплой на боевой VPS и Регламент Zero Rollback

Деплой на боевой сервер автоматизирован и защищен от регрессий:

```bash
# 1. Запуск комплексной проверки инвариантов
node scripts/guard-anti-rollback.js

# 2. Запуск полного набора автотестов (4 025+ тестов)
node tests/run.js

# 3. Автоматический деплой на VPS (сборка, перенос, компиляция C++, PM2 reload)
node scripts/deploy-vps.js
```

Скрипт деплоя:
- Проверяет все 22 архитектурных инварианта C++, uWS и Worker Threads.
- Собирает архив и переносит на VPS `/var/www/project-steam`.
- Выполняет удаленную установку и компиляцию C++ модуля через `npm install --production && npx node-gyp rebuild`.
- Перезапускает процессы PM2 (`pm2 restart ecosystem.config.js --env production`).
- Проводит контрольный guard-тест на удаленном сервере и опрашивает `/healthz`.

---

## 7. Переменные окружения

| Переменная | Описание | Значение в Production | Значение по умолчанию |
|---|---|:---:|:---:|
| `PORT` | Порт HTTP и WebSocket сервера | `8080` | `8080` |
| `NODE_ENV` | Режим работы окружения | `production` | `development` |
| `NET_ENGINE` | Сетевой движок (`uws` обязателен в prod) | `uws` | `uws` |
| `STRICT_UWS` | Запрет на откат к старому `ws` | `1` | `1` |
| `WS_DEFLATE` | Сжатие WebSocket (0 = отключено для снижения CPU) | `0` | `0` |
| `UV_THREADPOOL_SIZE` | Размер пула системных потоков libuv | `8` | `4` |
| `DB` | Слой хранения (`file` с Worker Threads или `postgres`) | `file` | `file` |
| `ALLOW_FILE_DB_IN_PROD` | Разрешение файлового бэкенда с Worker Threads | `1` | `0` |
| `ALLOW_INSECURE_AUTH` | Разрешение dev-авторизации (только для тестов) | `0` | `1` |
| `YANDEX_APP_SECRET` | Секретный ключ HMAC для верификации игроков Яндекс Игр | Секрет приложения | `""` |
| `EDITOR_ENABLED` | Активация инструментов браузерного редактора | `0` | `0` |
| `CORS_ORIGINS` | Белый список доменов для CORS (через запятую) | Домены игры | `*` |

---

## 8. Мониторинг и Телеметрия (`GET /metrics`)

Эндпоинт `GET /metrics` возвращает JSON с метриками здоровья в реальном времени:
```json
{
  "online": 1420,
  "tickMs": 3.42,
  "tickAvgMs": 2.85,
  "eventLoopLagMs": 1.15,
  "dirtyProfiles": 14,
  "cxxSimdActive": true,
  "netEngine": "uws",
  "packetsOut": 451200,
  "bytesOut": 3841920,
  "rssMb": 148.5,
  "heapUsedMb": 86.2
}
```

- **`tickMs` / `tickAvgMs`:** длительность шага симуляции (норма < 10 мс при 10 Hz).
- **`eventLoopLagMs`:** задержка очереди событий (норма < 5 мс).
- **`cxxSimdActive`:** флаг активности C++ SIMD движка.
- **`dirtyProfiles`:** очередь профилей в очереди воркера на сохранение.