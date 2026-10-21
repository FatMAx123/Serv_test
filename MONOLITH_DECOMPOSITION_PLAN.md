# План декомпозиции монолита игрового сервера (server.js)
## Project Steam: Origins — Архитектурная реструктуризация без даунтайма

> **Статус:** Черновик архитектурного плана (Approved Roadmap)  
> **Исходный объём `server/server.js`:** 9 748 строк  
> **Целевой объём `server/server.js`:** ~1 200 – 1 500 строк (чистый оркестратор)  
> **Главный принцип:** Strangler Fig Pattern (постепенное удушение монолита без единовременного переписывания, 100% сохранение C++ SIMD и uWS инвариантов).

---

## 1. Анатомия текущего монолита (`server.js`)

Анализ кодовой базы показывает, что 9 748 строк распределены по следующим ключевым секциям:

| Диапазон строк | Объём | Назначение секции | Степень связанности | Сложность выноса |
|---|---|---|---|---|
| **1 – 530** | ~530 строк | Импорты, системные константы, конфиги лимитов | Низкая (Core config) | 🟢 Низкая |
| **531 – 1330** | ~800 строк | Доменная модель `class Player` и вспомогательные структуры | Средняя (Domain entity) | 🟡 Средняя |
| **1331 – 1500** | ~170 строк | DI и инициализация существующих 16 хэндлеров | Низкая (Wireup) | 🟢 Низкая |
| **1501 – 3200** | ~1 700 строк | Вспомогательные функции (AOI, broadcast, token-bucket, гео-утилиты) | Средняя (Shared logic) | 🟡 Средняя |
| **3201 – 5925** | ~2 725 строк | **Боевой движок и скиллы** (`doSkillCast`, `resolveHit`, `applyClassStats`) | **Высокая (Hot Path)** | 🔴 Высокая |
| **5926 – 7765** | ~1 840 строк | **Центральный роутер `handle(p, msg)`** (остаточные ~20 switch-кейсов) | Средняя (Message routing) | 🟡 Средняя |
| **7766 – 8100** | ~335 строк | Главный игровой цикл (`scheduleNextTick`, `tick`, Spatial Grid) | **Критическая (Engine loop)** | 🔴 Высокая |
| **8101 – 9300** | ~1 200 строк | Сессионный слой, вход в игру (`doLogin`), дисконнекты | Средняя (Session lifecycle)| 🟡 Средняя |
| **9301 – 9748** | ~448 строк | Bootstrap сервера, uWS routing, graceful shutdown | Низкая (Bootstrap) | 🟢 Низкая |

---

## 2. Неизменяемые инварианты при декомпозиции (AGENTS.md)

При любых манипуляциях с кодом **категорически запрещено нарушать архитектурные инварианты**:
1. **C++ AVX2 SIMD модуль (`project_steam_native.node`)**:
   - `NativeSpatialGrid` и `NativeCombatEngine` остаются авторитетными fast-path ядрами.
   - Запрещено заменять их обратно на чистый JS или менять бинарный буфер `entityTransforms`.
2. **Zero-GC uWebSockets.js транспорт**:
   - Сеть работает на uWS (`NET_ENGINE: 'uws'`, `STRICT_UWS: '1'`).
   - Память uWS-буфера валидна только внутри колбэка (копирование `Buffer.from(new Uint8Array(message))`).
3. **Разгрузка БД через Worker Threads**:
   - Вся дисковая персистентность остаётся в `persistence-worker.js`.
4. **Бюджет тика 100 мс (10 Hz)**:
   - Лимит выполнения тика — строго <= 80 мс (`TICK_BUDGET_MS = 80`).
   - Никаких блокирующих операций (I/O, тяжелые синхронные циклы) в основном потоке.

---

## 3. Целевая архитектура директорий

```
server/
├── server.js                      # ~1200 строк: Bootstrap, Tick loop, Packet router
├── security-config.js             # Политики безопасности, env-проверки
├── net-transport.js               # uWebSockets.js Zero-GC транспорт
├── spatial-grid.js                # Обертка Native + JS spatial grid
├── core/                          # Ядро игровых сущностей
│   ├── player.js                  # class Player, статы, детекция оборудования
│   ├── entity-transforms.js       # Таблица сущностей для SIMD C++
│   └── game-loop.js               # scheduleNextTick, тайминги, метрики тика
├── session/                       # Жизненный цикл сессий
│   ├── auth-session.js            # doLogin, создание персонажа, валидация ключей
│   └── disconnect-manager.js      # onPlayerDisconnect, очистка хейта, AOI leave
├── combat/                        # Боевая подсистема
│   ├── skill-caster.js            # doSkillCast, кулдауны, проверка зарядов/маны
│   ├── combat-resolver.js         # resolveHit, формулы P.Atk/M.Atk, соулшоты
│   └── buff-manager.js            # applyBuff, dispel, тики яда/кровотечения
└── handlers/                      # Обработчики сетевых команд (Packets)
    ├── inventory-handler.js       # equip, unequip, drop_item, destroy_item
    ├── item-use-handler.js        # use (банки HP/MP, свитки телепорта/реса)
    ├── enchant-handler.js         # enchant (заточка оружия и брони, усилители)
    ├── movement-handler.js        # move, move_stop, pose, clampSpeed
    ├── combat-handler.js          # attack, attack_player, skill
    ├── quest-handler.js           # (существует) квесты, NPC диалоги
    ├── mob-handler.js             # (существует) ИИ и спавн мобов
    ├── trade-handler.js           # (существует) обмен между игроками
    ├── store-handler.js           # (существует) частные лавки
    ├── warehouse-handler.js       # (существует) личный склад
    ├── clan-handler.js            # (существует) кланы и клан-склад
    ├── party-handler.js           # (существует) группы игроков
    ├── duel-handler.js            # (существует) дуэли 1x1
    ├── social-handler.js          # (существует) друзья, списки
    ├── npc-services-handler.js    # (существует) магазины, телепорты, баффы
    ├── gm-handler.js              # (существует) GM-команды
    └── world-time-handler.js      # (существует) цикл дня и ночи
```

---

## 4. Поэтапный план декомпозиции (5 фаз)

### Фаза 1: Низковисящие изолированные хэндлеры инвентаря
*Цель: быстро и безопасно убрать ~750 строк из функции `handle()` без риска для боевого тика.*

- [x] **1.1. Создать `handlers/item-use-handler.js` (~330 строк)**
  - Вынести обработку `case 'use'` (строки 7297–7625):
    - Зелья HP / Energy с кулдаунами.
    - Свитки телепорта (SOE) в город с проверкой боя/флага/дуэли.
    - Свитки воскрешения союзников (`resurrection`).
    - Противоядия и бинты (`curePoison`, `cureBleed`).
  - *Зависимости:* `players`, `send`, `broadcastAOI`, `snapStandY`, `isPeaceAt`.
- [x] **1.2. Создать `handlers/enchant-handler.js` (~65 строк)**
  - Вынести обработку `case 'enchant'` (строки 7232–7296):
    - Проверка предмета, лимита `ITEMS.ENCHANT_MAX`.
    - Списание `pressure_amplifier`, расчет шанса заточки `G.enchantSuccess`.
    - Безопасная точка `G.ENCHANT_SAFE`, поломка на кристаллы.
  - *Зависимости:* `send`, `pushCombatStats`, `ITEMS`, `G`, `LR`.
- [x] **1.3. Создать `handlers/inventory-action-handler.js` (~350 строк)**
  - Вынести обработку:
    - `case 'equip'` и `case 'unequip'` (проверка слота, статов, веса).
    - `case 'drop_item'` (выброс лута на землю в `groundLoot`).
    - `case 'destroy_item'` (удаление предмета из инвентаря).
  - *Зависимости:* `groundLoot`, `broadcastNear`, `pushCombatStats`, `checkWeight`.
- [x] **1.4. Верификация Фазы 1**:
  - Запуск `node tests/run.js` (4370 тестов пройдено, 0 провалено).
  - Проверка инвариантов `node scripts/guard-anti-rollback.js` (22/22 PASS).
  - Деплой через `node scripts/auto-deploy-all.js`.

---

### Фаза 2: Вынос доменной модели `Player`
*Цель: освободить 800 строк из верхней части `server.js`, инкапсулировав свойства персонажа.*

- [x] **2.1. Создать `core/player.js` (~800 строк)**
  - Вынести определение `class Player` (строки 531–1330):
    - Инициализация базовых характеристик, accessLevel, gm-флагов.
    - Геттеры боевых пакетов (`combatPack`, `speedBase`).
    - Методы сброса бюджетов движения (`resetMoveBudget`).
    - Сериализация `profileOf(p)` и подготовка снимка для клиента.
- [x] **2.2. Замена `new Player(...)` в `server.js` на импорт из `core/player.js`**.
- [x] **2.3. Верификация Фазы 2**:
  - Создан модульный тестовый набор `tests/phase2-player.test.js` (42 проверки).
  - Прогон тестов `tests/chars.test.js` (20 PASS), `tests/grade.test.js` (28 PASS), `tests/buff.test.js` (130 PASS).
  - Полный регрессионный прогон `tests/run.js` (4412+ проверок).
  - Проверка инвариантов `guard-anti-rollback.js` (22/22 PASS).
  - Деплой на боевой VPS.

---

### Фаза 3: Вынос движения, позиционирования и дуэлей
*Цель: вынести еще ~350 строк, изолировав сетевую физику.*

- [x] **3.1. Создать `handlers/movement-handler.js` (~350 строк)**
  - Вынести кейсы `move`, `move_stop`, `pose`, `editor_set_pos`.
  - Инкапсулировать `clampSpeed`, `moveBudget`, `resetMoveBudget`, `snapStandY`, `geoClamp`.
  - Сохранить инвариант: *«Боты перемещаются дискретно, вызовы GEO.standY только для реальных игроков»*.
- [x] **3.2. Доработать `handlers/duel-handler.js` (~120 строк)**
  - Перенести остаточные кейсы `duel_offer`, `duel_accept`, `duel_decline`, `duel_cancel` в `duel-handler.js`.
- [x] **3.3. Верификация Фазы 3**:
  - Создан тестовый набор `tests/phase3-movement-duel.test.js` (34 проверки).
  - Тесты `tests/duel.test.js` (22 PASS), `tests/dead-reckoning.test.js` (36 PASS), `tests/gm_flash.test.js` (23 PASS).
  - Полный регрессионный прогон `tests/run.js` (4446 PASS, 0 FAIL).
  - Проверка инвариантов `guard-anti-rollback.js` (22/22 PASS).

---

### Фаза 4: Сессионный слой и жизненный цикл подключений
*Цель: вынести авторизацию, очереди логина и дисконнекты (~1 200 строк).*

- [x] **4.1. Создать `session/session-manager.js` (~650 строк)**
  - Логика `doLogin`:
    - Проверка JWT/гостевых токенов через `auth.js` и защита от Replay (`checkSignatureReplay`).
    - Барьер `loggingIn` против race condition двойного входа (до 2000 мс с retry и кодом 4009).
    - Выгрузка профиля из `DB.load`, инициализация стартовой экипировки и косметики.
    - Перенос старых титулов, сборка snapshot квестов и отправка `welcome`.
- [x] **4.2. Создать `session/disconnect-manager.js` (~250 строк)**
  - Логика `handleSocketClose` (таймаут anti-combat log 15s при выходе из боя).
  - Логика `detachPlayer`:
    - Сброс активного трейда (`closeTrade`) и дуэли (`interruptDuel`).
    - Закрытие торговой лавки (`broadcastStoreState`) и роспуск/передача лидерства в пати.
    - Очистка хейт-листов мобов через spatial grid в радиусе 50м (O(1)).
    - Оповещение соседей в AOI (`leave`).
    - Освобождение слота в `entityTransforms` (C++ бинарная таблица).
    - Персист профиля в базу (`DB.save` и `PlayerDb.setOnline`).
- [x] **4.3. Верификация Фазы 4**:
  - Создан модульный тестовый набор `tests/phase4-session.test.js` (46 проверок, 100% PASS).
  - Тесты `tests/security-auth.test.js` (35 проверок, 100% PASS).
  - Тесты `tests/server.test.js` (137 проверок, 100% PASS).
  - Полный регрессионный прогон `tests/run.js` (4492+ проверок, 0 FAIL).
  - Проверка инвариантов `guard-anti-rollback.js` (22/22 PASS).

---

### Фаза 5: Боевая подсистема и расчет скиллов (Hot Path)
*Цель: вынести самую объемную секцию (~2 700 строк), соблюдая Zero-GC.*

- [x] **5.1. Создать `combat/skill-caster.js` (~1 200 строк)**
  - Вынесены `doSkillCast`, `doCastBegin`, тайминги каста, прерывание при получении урона (`cancelPlayerCast`, `checkCastCancelOnDamage`, `onPlayerHit`).
  - Проверка условий применения (оружие, приборы инженера/оператора, MP, радиус, LOS).
- [x] **5.2. Создать `combat/combat-resolver.js` (~1 000 строк)**
  - Вынесены `resolveHit`, расчет шанса попадания, срез щитом (`BLOCK_CAP = 70`), криты, соулшоты (`SOULSHOT_MULT = 2.0`).
  - Полная реализация авторитетных PvE (`resolvePveAttack`) и PvP (`resolvePvpAttack`) атак.
  - Связка с нативным C++ аддоном `project_steam_native.node`.
- [x] **5.3. Создать `combat/buff-manager.js` (~500 строк)**
  - Наложение баффов и дебаффов, расчет стеков, периодический урон (DoT), дебаффы замедления, стана, немоты.
  - Функции `applyPlayerBuff`, `applyPlayerDebuff`, `pushEffects`, `effectsPayload`, `dispelPlayer`, `isPlayerImmortal`.
  - Управление эффектами мобов (`applyMobEffect`, `getMobEffects`, `broadcastMobEffects`).
- [x] **5.4. Создать `handlers/combat-handler.js` (~100 строк)**
  - Сетевая маршрутизация пакетов `attack`, `attack_player`, `cast_begin`, `cast_complete`, `skill`, `cast_cancel`.
- [x] **5.5. Верификация Фазы 5**:
  - Создан тестовый набор `tests/phase5-combat.test.js` (40 проверок, 100% PASS).
  - Полный регрессионный прогон всей тестовой батареи (`node tests/run.js` — 4532 пройдено, 0 провалено).
  - Проверка инвариантов `node scripts/guard-anti-rollback.js` (22/22 PASS).
  - Объем `server.js` сокращен с 7 229 до 5 732 строк (-1 497 строк).

---

## 5. Контрольный регламент безопасного рефакторинга

1. **Правило одного коммита:** Каждая подзадача (например, 1.1 `item-use-handler`) выполняется в **отдельной изолированной итерации**.
2. **Обязательный тест-чек:** Перед коммитом запускается `node tests/run.js`. Количество пройденных тестов должно быть строго >= 4348.
3. **Guard-валидация:** Скрипт `node scripts/guard-anti-rollback.js` обязан возвращать `22 пройдено, 0 провалено`.
4. **Непрерывный деплой:** Завершение каждой задачи сопровождается вызовом:
   ```bash
   node scripts/auto-deploy-all.js "Refactor Phase X.Y: Extract [domain] handler"
   ```
5. **Откат при малейшем сбое:** Если после деплоя на VPS в логах `/var/log/project-steam/out.log` появляются unhandled exceptions или спайки задержки тика (>80 мс), производится мгновенный rollback коммита.
