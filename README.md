# Project Steam: Origins (Остров поющей стали)
### Каноническая MMORPG Lineage 2 Classic C1 x1 в стимпанк-сеттинге

[![Tests Status](https://img.shields.io/badge/Tests-4%2C532%20PASS%20(100%25)-00f076?style=for-the-badge&logo=checkmarx)](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/run.js)
[![C++ AVX2 SIMD](https://img.shields.io/badge/C%2B%2B%20Engine-AVX2%20SIMD%20(-O3)-00e5ff?style=for-the-badge&logo=c%2B%2B)](file:///d:/games/yandex/лайнэйдж/project-steam1/native/)
[![Network Engine](https://img.shields.io/badge/Network-uWebSockets.js%20Zero--GC-38bdf8?style=for-the-badge)](file:///d:/games/yandex/лайнэйдж/project-steam1/server/net-transport.js)
[![Zero Rollback Guard](https://img.shields.io/badge/Guard-22%2F22%20Invariants%20OK-f6c344?style=for-the-badge&logo=shield)](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/guard-anti-rollback.js)
[![Target CCU](https://img.shields.io/badge/Cluster%20Scale-5%2C000%2B%20CCU-a855f7?style=for-the-badge)](file:///d:/games/yandex/лайнэйдж/project-steam1/docs/index.html)

---

## 🌟 Главный Единый Портал Документации

> 📖 **[Открыть Интерактивный Портал Документации Проекта (docs/index.html)](file:///d:/games/yandex/лайнэйдж/project-steam1/docs/index.html)**
> 
> Полный интерактивный веб-сайт, объединяющий 12 разделов архитектуры, калькулятор боевой математики L2 C1, интерактивный справочник GM-команд, реестр 43 системных аудитов и документацию декомпозиции монолита.

---

## 🏛️ Ключевые Архитектурные Особенности

1. **Строгий Серверный Авторитет (Strict Server Authority / Zero-Trust Client)**:
   - Клиент (Three.js r185) отправляет на сервер исключительно *намерения* (`intents`).
   - Все расчеты формул урона, коллизий, шансов крафта, заточки, видимости (AOI) и начисления опыта производятся исключительно на сервере.
2. **Нативный C++ SIMD AVX2 Движок (`project_steam_native.node`)**:
   - `NativeSpatialGrid`: пространственная сетка с ячейками 36 м и линейной выборкой QuickSelect Top-K ($O(N)$). Время выборки кандидатов &lt; 0.1 мс на 2 000 сущностей.
   - `NativeCombatEngine`: пакетный расчет боевых атак Lineage 2 C1 ускорен в 35–40 раз за счет векторизации `-O3 -mavx2`.
3. **C++ Zero-GC Сетевой Транспорт (`uWebSockets.js` v20.70.0)**:
   - Прямой Pub/Sub на epoll, нулевая нагрузка на сборщик мусора V8 (Zero-GC), аппаратная поддержка 5000+ сокетов.
4. **Разгрузка через Worker Threads (vCPU 2 Offload)**:
   - Сериализация баз данных, сохранение персонажей и дисковое I/O вынесены в фоновый поток `persistence-worker.js`. Нулевой лаг тика симуляции.
5. **Алгоритмический Tick-LOD**:
   - Tier 0 (10 Hz, бой/активные игроки), Tier 1 (2 Hz, блуждающие мобы), Tier 2 (0.33 Hz, спящие мобы &gt; 155м). Снижение вычислений CPU на 65–70%.
6. **Data-Oriented Design (DOD)**:
   - Float32Array SoA непрерывная таблица трансформов (32 байта/слот) под L2 Cache Line процессора. Задержка Event Loop &le; 10 мс.

---

## ⚔️ Боевой Баланс и 3 Базовых Класса (Фаза 1: 1–20 ур.)

- **Каноническая Математика L2 C1**: $P.Atk / P.Def \times 70$, $\sqrt{M.Atk} / M.Def \times 91$, Соулшоты $\times 2.0$, Спиритшоты $\times 4.0$.
- **Асимметрия «Давид против Голиафа»**:
  - *Голиаф (Оператор)*: тяжелые латы, блок щитом до 70%, огромный урон вблизи, низкая мобильность и слабый $C.Def$.
  - *Давид (Инженер)*: роба, высокая скорость маневра, кайт (Stutter-Step), замедление Ice Bolt ($-20\%$), пробивающий урон эфира.
- **3 Классовые Школы**:
  - **Оператор (Operator)**: Механик, Разрушитель, Стрелок.
  - **Инженер (Engineer)**: Конструктор, Наладчик / Техномаг.
  - **Мастеровой (Craftsman)**: Вольная Гильдия Векса и Доры. Утилизатор (Spoil/Sweep) и Котловой Кузнец (Dwarven Craft, голем, мануфактура).

---

## 📁 Структура Репозитория

- [`docs/index.html`](file:///d:/games/yandex/лайнэйдж/project-steam1/docs/index.html) — **Единый официальный портал документации проекта**.
- [`docs/KEYS_INSTRUCTION.md`](file:///d:/games/yandex/лайнэйдж/project-steam1/docs/KEYS_INSTRUCTION.md) — Руководство по шифрованию секретов, KDF и ключей игроков.
- [`audits/`](file:///d:/games/yandex/лайнэйдж/project-steam1/audits/) — Реестр 43 официальных системных аудитов и технических спецификаций.
- [`native/`](file:///d:/games/yandex/лайнэйдж/project-steam1/native/) — Исходные тексты C++ SIMD движка (`main.cpp`, `combat_engine.h`, `spatial_grid.h`).
- [`server/`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/) — Серверная кодовая база MMO (uWebSockets, Worker Threads, Handlers).
- [`client/`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/) — Исходники клиентской части (Three.js WebGL, 3D Scene Editor, HUD).
- [`shared/`](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/) — Единые правила мира, боевые формулы, базы данных мобов, квестов и предметов.
- [`scripts/`](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/) — Скрипты авто-сборки (`build-client.js`), деплоя на VPS (`deploy-vps.js`, `auto-deploy-all.js`) и проверки инвариантов (`guard-anti-rollback.js`).
- [`tests/`](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/) — Регрессионный сьют из 56 тестовых файлов (**4 532 теста, 100% PASS**).
- [`AGENTS.md`](file:///d:/games/yandex/лайнэйдж/project-steam1/AGENTS.md) — Неизменяемые правила архитектуры и регламент Zero Rollback Policy.

---

## 🚀 Быстрый Запуск

### Установка зависимостей и сборка C++ движка:
```bash
npm install
npx node-gyp rebuild
```

### Проверка работоспособности тестов и инвариантов:
```bash
# 1. Проверка 22 архитектурных инвариантов
node scripts/guard-anti-rollback.js

# 2. Запуск 4 532 модульных и интеграционных тестов
node tests/run.js
```

### Запуск серверов:
```bash
# Запуск MMO сервера на порту 8080:
node server/server.js

# Сборка чистого релизного клиента (< 100 МБ для Яндекс Игр):
node scripts/build-client.js
```

### Единый авто-деплой проекта:
```bash
node scripts/auto-deploy-all.js "Сообщение коммита"
```

---

## 🔒 Политика Zero Rollback

В проекте действует **жесткий запрет на откаты (Zero Rollback Policy)**. Запрещена замена нативного C++ SIMD кода на медленные JS-заглушки, откат uWebSockets.js на `ws` или возврат синхронного дискового I/O в главный поток симуляции. Все изменения проверяются автоматическим скриптом `scripts/guard-anti-rollback.js`.
