# Project Steam: Origins — Структура проекта

## 📁 Общая архитектура (Client / Server / Native / Shared / Audits)

```
project-steam1/
│
├── 📄 package.json               # Node.js зависимости и npm-скрипты
├── 📄 binding.gyp                # Сборка нативного C++ модуля (-O3 -mavx2)
├── 📄 ecosystem.config.js        # PM2 продакшен профиль (Zero-GC uWS, watchdog)
├── 📄 Dockerfile                 # Деплой production-контейнера
├── 📄 AGENTS.md                  # Строгий регламент Zero Rollback и архитектурные инварианты
├── 📄 README.md                  # GitHub Actions 5000 CCU Stress Suite
├── 📄 README-SERVER.md           # Главное руководство по запуску и эксплуатации сервера
├── 📄 SERVER_5000_CCU_AUDIT.md   # Аудит масштабирования и ликвидации узких мест
├── 📄 FINAL_PRODUCTION_SERVER_AUDIT.md # Финальный продакшен-аудит готовности к релизу
├── 📄 SECURITY_AUDIT.md          # Аудит информационной безопасности
├── 📄 STRUCTURE.md               # Архитектурное дерево проекта
│
├── ⚡ native/                    # === НАТИВНЫЙ C++ SIMD AVX2 ДВИЖОК ===
│   ├── binding.gyp               # Конфиг сборки с векторизацией (-mavx2 -O3)
│   └── src/
│       ├── main.cpp              # Инициализация модуля project_steam_native.node
│       ├── combat_engine.h       # Векторизованный расчет урона и статов (SIMD)
│       └── spatial_grid.h        # C++ пространственная сетка и коллизии (35x ускорение)
│
├── 🧩 shared/                    # === ИЗОМОРФНЫЕ МОДУЛИ (Сервер + Клиент) ===
│   ├── net-pack-binary.js        # Zero-Copy бинарный кодек (upd, move)
│   ├── combat-formulas.js        # Математика урона, шансов крита, физ/маг защиты
│   ├── l2-combat.js              # Каноничный расчет L2 C1 (заряды, дебаффы 5-95%)
│   ├── skill-db.js               # Реестр умений, дальности каста, тайминги
│   ├── quest-db.js               # Квесты 1–20: цепочки, диалоги, награды
│   ├── enchant-rules.js          # Правила заточки, шансы, кристаллы при сломе
│   ├── trade-rules.js            # Правила двухфазного обмена между игроками
│   ├── wh-rules.js               # Личный и клановый склады, комиссия
│   ├── clan-rules.js             # Иерархия кланов, ранги, права, кресты
│   ├── weight-rules.js           # Лимиты веса CON и штрафы движения/боя
│   ├── loot-rules.js             # База предметов, таблицы дропа и спойла
│   ├── game-rules.js             # Базовые константы, статы 3 классов, EXP-таблицы
│   ├── class-system.js           # Оператор, Инженер, Мастеровой (Вольная Гильдия)
│   ├── item-db.js                # Каноничный расход Soulshot / Spiritshot
│   └── world-metrics.js          # Геометрия мира, регионы, NPC, спавн-споты
│
├── 🖥️ server/                    # === АВТОРИТЕТНЫЙ MMO-СЕРВЕР (Node.js + uWS) ===
│   ├── server.js                 # Игровое ядро: uWS транспорт, цикл 10Hz, AOI
│   ├── net-transport.js          # C++ Zero-GC uWebSockets.js транспорт (STRICT_UWS=1)
│   ├── spatial-grid.js           # Мост к C++ SpatialGrid / JS QuickSelect Top-K
│   ├── db.js                     # Слой данных: PostgreSQL / JSON с Worker Threads
│   ├── auth.js                   # HMAC-валидация сессий Яндекс SDK
│   ├── gm-commands.js            # Панель и команды администратора (//)
│   ├── editor-guard.js           # Изоляция инструментов сцены от обычных игроков
│   ├── static-http.js            # Раздача клиента и ассетов
│   ├── workers/                  # === РАЗГРУЗКА ДИСКА (WORKER THREADS vCPU 2) ===
│   │   ├── persistence-client.js # Клиент очереди для главного потока
│   │   └── persistence-worker.js # Фоновый поток дискового I/O (fsync, bak, json)
│   └── handlers/                 # === ДОМЕННЫЕ ОБРАБОТЧИКИ ПАКЕТОВ ===
│       ├── mob-handler.js        # AI мобов, агро-лист, патрули, спойл
│       ├── party-handler.js      # Группы, приглашения, распределение опыта/лута
│       ├── clan-handler.js       # Создание кланов, ранги, кресты
│       ├── trade-handler.js      # Синхронный защищённый обмен игроками (анти-дюп)
│       ├── wh-handler.js         # Личный и клановый склады
│       ├── duel-handler.js       # Дуэли 1 на 1 до 1 HP без PK
│       ├── private-store-handler.js # Лавки и Оффлайн-Мануфактура (Craftsman)
│       ├── chat-handler.js       # Каналы чата (all, shout, tell, party, clan)
│       ├── quest-handler.js      # Диалоги с NPC, прогресс и сдача квестов
│       └── friend-handler.js     # Списки друзей и статусы онлайна
│
├── 📜 scripts/                   # === РЕГЛАМЕНТ ДЕПЛОЯ И ЗАЩИТА ОТКАТОВ ===
│   ├── guard-anti-rollback.js    # Автоматическая проверка 22 инвариантов
│   ├── deploy-vps.js             # Деплой на боевой VPS с компиляцией C++
│   └── watchdog.js               # Сторож PM2: проверка /healthz и авторестарт
│
├── 📚 audits/                    # === 39 АРХИТЕКТУРНЫХ АУДИТОВ И СПЕЦИФИКАЦИЙ ===
│   ├── 01_architecture_and_network.md # uWS, C++ SIMD, Worker Threads, 5100 CCU
│   ├── 03_combat_math.md         # Формулы урона, дебаффов и расход зарядов
│   ├── 04_classes_and_devices.md # Древо 3 классов: Оператор, Инженер, Мастеровой
│   ├── 06_economy_and_craft.md   # Канон C1 x1, крафт Вольной Гильдии, горн
│   ├── 11_verification_and_tests.md # Реестр 4025+ тестов (56 сьютов)
│   ├── 36_ddos_defense_and_server_hardening_audit_final.md # DDoS защита L4/L7
│   ├── 39_crafting_guild_craftsman_class_and_lore_plan.md # Вольная Гильдия
│   └── README.md                 # Генеральный реестр всех 39 спецификаций
│
├── 🌐 client/                    # === КЛИЕНТ (Three.js r185, WebGL) ===
│   ├── index.html                # Разметка HUD, стимпанк/L2 интерфейс
│   ├── css/                      # Стили HUD и адаптивность
│   └── js/                       # Модули клиента (ES6 Modules)
│       ├── boot.module.js        # Загрузчик модулей и прогрев шейдеров
│       ├── net-ws.js             # WebSocket клиент и декодер NPB дельт
│       ├── char-model.js         # Zero-Stutter рендеринг, LOD 0-2, кэш моделей
│       ├── combat.js             # Визуализация боя, зарядов и эффектов
│       ├── ui.js                 # HUD, инвентарь, скиллы, окно крафта
│       └── i18n.js               # Двуязычная локализация (RU / EN)
│
└── 🧪 tests/                     # === НАБОР АВТОТЕСТОВ (4 025+ тестов / 56 сьютов) ===
    ├── run.js                    # Тест-раннер с цветным выводом
    ├── anti-rollback.test.js     # Валидация 22 архитектурных инвариантов
    ├── shots_c1_canon.test.js    # Каноничный расход Soulshot/Spiritshot оружием
    ├── ddos-defense.test.js      # Тестирование защиты от флуда и атак
    ├── server.test.js            # Интеграционный WS-тест античита и систем
    ├── db.test.js                # Атомарность дисковых операций и retryFs
    └── ... (56 тест-сьютов, 100% PASS)
```

---

## 🔄 Архитектура клиент-серверного взаимодействия

```
┌─────────────────────────────────────────────────────────────┐
│                    Браузер (WebGL Client)                   │
│                                                             │
│   • Интерполяция движения (Dead Reckoning 10 Hz)            │
│   • 3D-рендер Three.js r185 + L2 Zero-Stutter пайплайн      │
│   • Отправка намерений (Intents) + Прогрев VRAM 1x1         │
└──────────────────────────────┬──────────────────────────────┘
                               │
            WebSocket (Zero-Copy Binary NPB + uWebSockets.js)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Node.js Авторитетный Сервер                 │
│                                                             │
│   • uWebSockets.js v20.70.0 (C++ Zero-GC Transport)         │
│   • Нативный C++ SIMD AVX2 Движок (35x ускорение расчетов)  │
│   • Spatial Grid (36м ячейки + QuickSelect Top-K O(N))      │
│   • L2 C1 Канон Боя (Soulshots/Spiritshots, 5-95% дебаффы)  │
│   • 3 Класса: Оператор, Инженер, Мастеровой (Крафт/Спойл)   │
│   • DDoS Rate Limiter (L4/L7 защита и харденинг)            │
│   • Защита от откатов (22 инварианта Zero Rollback Guard)   │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC Сообщения (Zero Lag)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              Worker Threads (vCPU 2 Offload)                │
│                                                             │
│   • Изолированный сброс базы (persistence-worker.js)        │
│   • Write-Behind Dirty Cache с динамическим батчингом       │
│   • Атомарные дисковые операции (JSON, fsync, .bak)         │
│   • Полная изоляция от Event Loop тика симуляции            │
└─────────────────────────────────────────────────────────────┘
```
