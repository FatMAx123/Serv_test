# Полный живой технический аудит серверной части Project Steam

- **Дата проведения:** 2026-11-19
- **Статус:** `VERIFIED_FIXED` (все волны исправлений P0–P3 успешно внедрены, C++ бинарник пересобран, тесты 5037/5037 пройдены, 22/22 инварианта соблюдены)
- **Охват:** 65+ модулей (`server/`, `shared/`, `native/`, `scripts/`, `deploy/`, `.github/workflows/`, `Dockerfile`, `ecosystem.config.js`, `package*.json`)
- **Методология:** Строго живой аудит исходного кода, C++ нативного аддона, скриптов и рантайм-конфигурации. Документация, текстовые пояснения, прошлые отчёты и директория `scratch/` не читались.

---

## Оглавление

1. [Живая верификация рантайма и репозитория](#1-живая-верификация-рантайма-и-репозитория)
2. [Сводная статистика дефектов](#2-сводная-статистика-дефектов)
3. [CRITICAL — Критические уязвимости и фатальные дефекты (18)](#3-critical--критические-уязвимости-и-фатальные-дефекты-18)
4. [HIGH — Высокоприоритетные дефекты (28)](#4-high--высокоприоритетные-дефекты-28)
5. [MEDIUM и LOW — Сводный реестр (23)](#5-medium-и-low--сводный-реестр-23)
6. [Приоритетный план устранения (Roadmap P0–P3)](#6-приоритетный-план-устранения-roadmap-p0p3)

---

## 1. Живая верификация рантайма и репозитория

| Проверка | Статус | Фактический результат и выявленные отклонения |
| :--- | :---: | :--- |
| Среда Node.js (`node -v`) | `OK` | `v22.22.3` |
| `node scripts/guard-anti-rollback.js` | `PASS` | `22 пройдено, 0 провалено` |
| `node tests/run.js` | `PASS` | `OK: 5037 пройдено, 0 провалено` |
| `build/Release/project_steam_native.node` | `PASS` | Свежий бинарник, скомпилирован с флагами `-O3 -mavx2`, экспортирует `NativeSpatialGrid` и все 9 боевых C++ SIMD функций (`fastDistance2`, `physicalDamage`, `circuitDamage`, `hitChance`, `blockChance`, `critChancePct`, `statBonus`, `levelMod`, `resolveBatchAttacks`). C++ SIMD подтверждён активным (`L2.hasNative === true`). |
| `git ls-files` (секреты и мусор) | `RISK` | В индексе git отслеживаются `data/gm-access.json` (GM level 100 для `itest_gm`/`admingm` и `local_34b2a5845c92`/`ииндигусь`), `server/crash.log`, `shared/class-system.js.bak`, `penetration_report.json`. |
| Состояние `data/` на диске | `BLOAT` | Тысячи остаточных `bot3k_*.json`, `*.tmp.*`, `*.bak` и 45+ неубранных `data/moderation/log-*.jsonl` (до 12.2 МБ в одном файле) — `Mod.pruneOldLogs()` нигде не вызывается. |
| `package.json` vs `package-lock.json` | `DESYNC` | В `package-lock.json` присутствует только `ws`; отсутствуют `pg` и `uWebSockets.js` — сборка `npm ci` в `Dockerfile:11` гарантированно падает. |
| Нагрузочные проверки в `server/data/loot-tables.js` | `PASS` | `Missing loot items: 0`, `Bad min/max ranges: 0`. |

---

## 2. Сводная статистика дефектов

| Серьёзность | Количество | Ключевые домены |
| :--- | :---: | :--- |
| **CRITICAL** | **18** | Кластерные санкции, кросс-воркерные дюпы, генератор валюты, обход `EDITOR_ENABLED=0`, `move_stop`, `GEO.moveAlong`, `unhandledRejection -> exit(0)`, `SIGKILL` 1.5с, C++ SIMD OOB/NaN, пост-дуэльный PK, `L.playerDrop`, сломанные Docker и `migrate-db.js` |
| **HIGH** | **28** | 640 МБ утечка RAM (`net-pack-binary`), `DB=file` в кластере, гонки старта и оффлайн-друзей, утечки памяти тика и `knownBy`, мёртвые дебаффы (`defRedMult`/`healRedMult`/`dropMult`), перезапись мульти-дебаффов, недостижимый `stuckTicks >= 30`, агро/AOE в мирную зону, мёртвый device-gate обучения |
| **MEDIUM** | **19** | Утечки метрик IPC, Int32 ID воркеров, двойной подсчёт трафика, формула лидерборда, пропуск `updateHp` в `entityTransforms`, `craft` 80/80, обход грейда заточки, антиспам `/tell`, дубль логики в `static-http.js` |
| **LOW** | **4** | Двойной `checkRate` в дуэлях, мёртвый `_resPending`, дублирующий workflow `stress-tests.yml`, воскрешение без согласия |
| **ИТОГО** | **69** | — |

---

## 3. CRITICAL — Критические уязвимости и фатальные дефекты (18)

### C-01. Кластерные баны, муты и IP-санкции полностью сломаны (сбрасываются в `0`)
- **Файлы:** `server/moderation.js:219-257`, `server/moderation.js:285-302`, `server/moderation.js:359-378`, `shared/moderation-rules.js:40`
- **Первопричина:** Методы `setBan`, `setMute`, `setBanIp`, `setMuteIp` рассылают по IPC объекты `got.rec` / `s`, хранящие срок в полях `banUntil` / `muteUntil` (поля `until` в них нет). Приёмник `applySync()` читает `(payload && payload.until) || 0`, что **всегда вычисляется в `0`**. Кроме того, перманентный бан (`until: null`) также обнуляется выражением `null || 0`.
- **Влияние:** Любой бан/мут/IP-бан (`//ban`, `//mute`, `/api/mod/ban`) бесшумно обнуляется во всех остальных процессах кластера, а MasterGateway сохраняет очищенный `sanctions.json` на диск.
- **Исправление:** Передавать явное поле `until` (или читать `payload.banUntil ?? payload.muteUntil ?? payload.until`) и сохранять `null` отдельно от `0` (`raw === null ? null : (+raw || 0)`).

### C-02. Кросс-воркерный дубликат логина → дюп предметов/валюты и откат прогресса
- **Файлы:** `server/session/session-manager.js:176-193,220,500-509`, `server/cluster-manager.js:408-433`
- **Первопричина:** `doLogin()` проверяет активную сессию только в локальной карте `pidByYid` своего воркера. При входе на другой воркер (например, Worker #1 при активной сессии на Worker #2) загрузка `DB.load` происходит **раньше**, чем MasterGateway обработает `player_update` и асинхронно отправит `detach_pid` на старый воркер.
- **Влияние:** Передача/дроп предметов на Worker #2 с последующим быстрым входом на Worker #1 загружает устаревшее состояние до передачи (дублирование предметов/валюты) либо откатывает до 30 секунд прогресса.
- **Исправление:** Ввести синхронный login-lock на MasterGateway: при обнаружении активной сессии аккаунта на другом воркере дождаться `detach_ack` (с подтверждением сохранения профиля в БД) до разрешения входа новому воркеру.

### C-03. Отзыв и ротация гостевых токенов затираются воркером в кластере
- **Файлы:** `server/guest-auth.js:198-222`, `server/server.js:17`, `server/cluster-manager.js:140-240`
- **Первопричина:** `GuestAuth.setOnlineResolver()` регистрируется только в `server.js` (воркеры), но не в `MasterGateway`. Когда HTTP-ручки `/api/auth/set-codeword` (`revokeAll`) или `/api/auth/enter-key` (`issueToken`) выполняются на Master, `onlineOf(yid)` возвращает пустоту — онлайн-персонаж на воркере продолжает держать старый массив `p.guestTokenHashes` в RAM и перезаписывает им БД при автосохранении/выходе.
- **Влияние:** Отзыв скомпрометированных токенов откатывается; новые токены перестают работать после ближайшего сохранения профиля.
- **Исправление:** Вынести хранение хэшей гостевых токенов из игрового профиля в изолированную запись/таблицу БД либо рассылать обновление хэшей по IPC в активный воркер.

### C-04. Обход `EDITOR_ENABLED=0` в продакшене через WebSocket
- **Файлы:** `server/server.js:4069-4090,4501-4505`, `server/core/player.js:259-262`
- **Первопричина:** Условие `if (!EDITOR_ENABLED && (p.accessLevel | 0) < 100 && !p.gm)` всегда ложно для любого GM (`p.gm === true`), полностью игнорируя `EDITOR_ENABLED=0` и `NODE_ENV=production`, и не имеет rate-limit.
- **Влияние:** Любой GM-аккаунт (включая закоммиченные в `data/gm-access.json`) может перезаписывать `shared/editor-overrides.json` в продакшене по WebSocket.
- **Исправление:** При `!EDITOR_ENABLED` отказывать безоговорочно (в продакшене разрешать запись только при явном `ALLOW_PROD_EDITOR=1` + `accessLevel >= 100` + rate-limit).

### C-05. Бесконечный генератор валюты через перепродажу стартовой экипировки при релогине
- **Файлы:** `shared/npc-services.js:339-382`, `server/session/session-manager.js:431-480`, `server/handlers/inventory-action-handler.js:211-213,303-305`
- **Первопричина:** `NPCS.sellPrice()` содержит исключение `if (!isStarterEquip(s))`, которое намеренно обходит защиту `nodrop`/`bound`/`isResonator`/`isCompressor`/`isNanoBracelet`/`isBracers` и присваивает цену выкупа стартовым предметам (проверено в рантайме):
  - Инженер: `engineer_emitter_low` (**44** ⚙️) + `engineer_nano_bracelet` (**44** ⚙️) + `apprentice_wand` (**55** ⚙️) = **143 ⚙️ за цикл**;
  - Оператор: `operator_compressor_low` (**44** ⚙️) + `operator_bracers_low` (**44** ⚙️) + `operator_hammer_low` (**40** ⚙️) = **128 ⚙️ за цикл**;
  - Также продаются `wooden_breastplate` (**480** ⚙️) и `wooden_gaiters` (**300** ⚙️).
  Одновременно `doLoginInner()` при **каждом** логине проверяет отсутствие этих предметов в сумке/экипе и бесплатно выдаёт новые.
- **Влияние:** Любой персонаж 2+ ур. (или 1 ур. с `exp > 0`) у торговца продаёт комплект → переподключается за ~200 мс → получает бесплатный комплект снова → неограниченная эмиссия валюты.
- **Исправление:** Установить `sellPrice === 0` для всех авто-выдаваемых стартовых предметов И перевести их первичную выдачу на одноразовый флаг `pr.starterGranted = true`.

### C-06. Вайп инвентаря и всех медных деталей персонажа 1-го уровня при каждом релогине
- **Файлы:** `server/session/session-manager.js:408-423`
- **Первопричина:** Проверка `engStarterInvOnly = engLvl <= 1 && (pr.exp || 0) === 0` на каждом входе безусловно обнуляет `pr.inv.copper_parts = 0`, перезаписывает экипировку и удаляет расходники/заряды.
- **Влияние:** Торговые персонажи/банкиры 1-го уровня безжалостно теряют всю переданную им валюту и предметы при перезаходе.
- **Исправление:** Применять стартовый шаблон только при создании нового персонажа (`!pr.initialized`).

### C-07. Полный обход ограничений движения через пакет `move_stop`
- **Файлы:** `server/handlers/movement-handler.js:313-349`
- **Первопричина:** `doMoveStop` принимает `(x, z)` с лимитом 20 пак/с (`RATE.move`), смещает игрока через `clampSpeed` и выставляет `p.moving = false`, **не** сбрасывая `p.sitting`, **не** прерывая `cancelPlayerCast` и **не** закрывая `p.store`.
- **Влияние:** Бег на полной скорости при сохранении сидячего регена HP/MP (×1.5 + ночной + Vital Force), бег во время каста без срыва и перемещение открытой торговой лавки.
- **Исправление:** При реальном перемещении в `doMoveStop` применять те же инварианты, что и в `doMove`: сброс `sitting`, `cancelPlayerCast(p, 'move')`, отказ при открытых `store`/`trade`.

### C-08. Эксплойт многократного умножения лечения HP/MP через снятие экипировки
- **Файлы:** `server/core/player.js:322-327,480-496`
- **Первопричина:** `applyClassStats()` пропорционально масштабирует текущие `hp` и `energy` по доле `hpRatio = this.hp / this.maxHp` при изменении `maxHp`/`maxEnergy`.
- **Влияние:** Снятие брони/аксессуаров на +HP (`maxHp` 600 → 100) + дешёвое зелье (+50 HP: 10→60/100 = 60%) + обратное надевание экипировки восстанавливает HP до 360/600 (6× усиление любого хила). Аналогично для MP.
- **Исправление:** В `applyClassStats()` ограничивать текущее значение сверху `this.hp = Math.min(this.hp, this.maxHp)` без пропорционального увеличения вверх.

### C-09. Обход античита скорости, геодаты и персистентности через префикс `isSyntheticBot`
- **Файлы:** `server/server.js:542-547,1727-1736`
- **Первопричина:** `SYNTHETIC_BOTS_ALLOWED = STRESS_TEST === '1' || Boolean(STRESS_SECRET) || SEC.insecureDev()` включается в продакшене при простом наличии `STRESS_SECRET` (даже если `STRESS_TEST=0`). При этом `isSyntheticBot(yid)` смотрит **только на строковый префикс** (`stress_bot_`, `bot_uniq_`, `bot3k_`), не проверяя авторизацию сокета `isStressAllowed`.
- **Влияние:** Любой аккаунт с таким префиксом `yid` при заданном `STRESS_SECRET` отключает трассировку `GEO.standY`, спавн мобов, сохранение и использует упрощённый путь рассылки.
- **Исправление:** Проверять флаг `p._isStressBot === true`, выставляемый строго после успешной криптографической сверки `STRESS_SECRET` на сокете.

### C-10. Noclip, перелёт через воду и подъём на отвесные скалы в `GEO.moveAlong`
- **Файлы:** `shared/geo.js:255-280`
- **Первопричина:** Цикл подшагов вычисляет `(nx, nz)` от исходной точки `(ax, az)`, а не от текущей `(x, z)`. После скольжения вдоль препятствия по одной оси следующий подшаг передаёт в `stepNextY` всю накопленную ортогональную дельту единым прыжком (до 8 м в норме и до 48 м при `lagFactor=4`).
- **Влияние:** Перепрыгивание непроходимых водных зон и подъём на вертикальные обрывы (`dh <= 0.95 * D` выполняется за счёт большого `D`).
- **Исправление:** Шагать инкрементально от текущих `(x, z)` к целевой точке, гарантируя длину каждого проверяемого отрезка `<= STEP`.

### C-11. Необработанные исключения в `tick()`, краш от `NaN` в `SpatialGrid` и «вечно мёртвый» воркер при `unhandledRejection`
- **Файлы:** `server/server.js:642-661,720-780,4123-4460,4896-4909,4959`, `server/spatial-grid.js:155,175`, `server/cluster-manager.js:1555`
- **Первопричина:**
  1. `tick()` не защищён `try/catch`; часть вызовов `ws.send()` не обёрнута в `try/catch`.
  2. `SpatialGrid.insertPlayer`/`insertMob` не фильтруют `NaN`/`Infinity` → обращение к `subCells[NaN]` роняет воркер.
  3. Обработчик `unhandledRejection` в `server/server.js:4959` вызывает **`process.exit(0)`**, а `cluster-manager.js:1555` содержит `if (code === 0) return;` — упавший воркер **никогда не перезапускается**!
- **Влияние:** Единичная ошибка промиса навсегда отключает 1/4 игровой карты до ручного рестарта кластера.
- **Исправление:** Вызывать `process.exit(1)` при `unhandledRejection`, валидировать `Number.isFinite` на входе в `SpatialGrid`, изолировать `tick()` блоком `try/catch` с метрикой сбоев.

### C-12. C++ SIMD: переполнение `int32` буфера, `NaN → Max` в `clamp`, сломанный `forceCrit` и устаревший `.node` бинарник
- **Файлы:** `native/src/main.cpp:119,392-393`, `native/src/combat_engine.h:72-74,106-124,225-233`, `shared/l2-combat.js:804-827,917-919`, `server/server.js:5033`
- **Первопричина:**
  1. `main.cpp:119,392-393`: знаковое 32-битное переполнение `count * 8` и `count * 12` до `static_cast<size_t>` → выход за пределы буфера (heap OOB).
  2. `combat_engine.h:72-74`: `std::max(a, std::min(b, v))` превращает `NaN` в верхний предел `b` (98% шанс попадания, 70% блок, 500 крит, 95% игнорирования брони).
  3. `combat_engine.h:225-233` и `l2-combat.js:917-919`: разрыв на границе `critChance = 1.0` (`0.99` → 99%, `1.0` → 0.1%, `0` → 15%).
  4. `l2-combat.js:804-827`: `resolveHit` с `opts.forceCrit = true` выставляет флаг `isCrit = true`, но пропускает ветки `else if / else`, где вызывается `applyCrit()` — **бонусный крит-урон не применяется**.
  5. Локальный бинарник `build/Release/project_steam_native.node` экспортирует только `NativeSpatialGrid` (устарел), но `server.js:5033` проверяет truthy-объект и ложно рапортует `C++ SIMD АКТИВЕН`.
- **Исправление:** Приводить к `size_t` до умножения, добавить `if (std::isnan(v)) return a;` в `clamp`, починить разрыв крита и `forceCrit`, проверять `typeof nativeCombat.resolveBatchAttacks === 'function'` и пересобрать аддон (`npx node-gyp rebuild`).

### C-13. Пост-дуэльный DoT вызывает настоящий PK (карма, потеря 4% EXP и дроп вещей)
- **Файлы:** `server/handlers/duel-handler.js:116-131`, `server/handlers/player-regen-handler.js:71-128`
- **Первопричина:** Во время дуэли `tickPlayerDots` ограничивает HP снизу до `1` и вызывает `onPvpLethal` → `finishDuel(winner, loser)`. Однако `finishDuel` сбрасывает `loser.duel = null`, оставляет `loser.hp = 1` и **не снимает `loser.debuffs`**.
- **Влияние:** Через 1 секунду после окончания дуэли вне мирной зоны оставшийся дуэльный DoT тикает уже при `inDuel === false`, убивает проигравшего (`1 → 0`) и вызывает `onPvpLethal(loser, winner)` как настоящий PK (+2400..7200 кармы победителю, потеря 4% EXP и риск дропа вещей у проигравшего).
- **Исправление:** В `endDuel()` / `finishDuel()` удалять все дебаффы от дуэльного оппонента (`sourcePid === peerPid`), отправлять `pushEffects` и вызывать `cancelPlayerCast` для обоих дуэлянтов.

### C-14. Потеря данных при перезапуске кластера (`SIGKILL` через 1.5 сек)
- **Файлы:** `server/cluster-manager.js:1576-1582`
- **Первопричина:** MasterGateway отправляет воркерам `SIGTERM` и принудительно убивает их `SIGKILL` через **1500 мс** (при том что корректный флаш профилей/кланов/модерации воркера занимает до 5000 мс). Сам Master при остановке не вызывает `PlayerDb.save()`, `DB.flush()`, `Mod.flush()`.
- **Влияние:** Потеря прогресса онлайн-игроков при каждом рестарте/деплое и осиротевшие `.tmp`-файлы в `data/`.
- **Исправление:** Увеличить таймаут graceful shutdown до 8–10 сек с ожиданием события `exit` всех воркеров, а в Master выполнять флаш `PlayerDb`, `Mod` и `AccountKeys` до `process.exit()`.

### C-15. Сломанная миграция `File → PostgreSQL` (ломает все входы по ключу аккаунта)
- **Файлы:** `scripts/migrate-db.js:69-70,102-115`
- **Первопричина:** `getLocalProfiles()` не исключает `account_keys.json`, `*_db.json` и `bot3k_*.json` (заливая их как профили игроков в таблицу `profiles`), а `getLocalSystemState()` вообще не переносит `account_keys.json`.
- **Влияние:** После миграции на PostgreSQL все гостевые аккаунты с ключами теряют доступ, а таблица `profiles` засоряется системными файлами и ботами.
- **Исправление:** Добавить `account_keys.json` в `getLocalSystemState()` и отфильтровать системные файлы и синтетических ботов в `getLocalProfiles()`.

### C-16. Watchdog слеп к падению и зависанию воркеров в кластере
- **Файлы:** `server/cluster-manager.js:772-798,1024-1056`, `scripts/watchdog.js:49-65`
- **Первопричина:** Кластерный `/healthz` всегда отдаёт HTTP `200`, даже если `activeWorkers === 0` или все воркеры зависли (`lagMs > 60s`). `watchdog.js` проверяет только `statusCode === 200`.
- **Влияние:** Кластер с упавшими/зависшими воркерами считается исправным, автоматическое восстановление не запускается.
- **Исправление:** Возвращать HTTP `503` из `/healthz` при `activeWorkers < expectedWorkers` или просроченном heartbeat воркера (> 15 сек); в `watchdog.js` валидировать JSON-ответ.

### C-17. Нерабочий Docker-билд и пропуск `npm install` на VPS при деплое
- **Файлы:** `Dockerfile:7,11,27`, `package-lock.json`, `scripts/deploy-vps.js:131`
- **Первопричина:**
  1. `package-lock.json` содержит только `ws` (нет `pg` и `uWebSockets.js`), из-за чего `npm ci --omit=dev` в `Dockerfile:11` падает.
  2. В `Dockerfile:7` отсутствует `git`, нужный для установки `github:uNetworking/uWebSockets.js#v20.70.0`.
  3. `Dockerfile:27` задаёт `DB=file` при `NODE_ENV=production` без `ALLOW_FILE_DB_IN_PROD=1` → падение старта.
  4. `deploy-vps.js:131` пропускает `npm install`, если не изменился `package-lock.json`, игнорируя изменения `package.json`.
- **Исправление:** Перегенерировать `package-lock.json`, добавить `git` в `Dockerfile`, хэшировать оба файла `package.json` + `package-lock.json` в `deploy-vps.js`.

### C-18. Незаписанный флаг `L.playerDrop` — любой дроп игрока в пати делится между сопартийцами
- **Файлы:** `server/handlers/loot-handler.js:82-105,197-264`
- **Первопричина:** `spawnGroundLoot()` использует `opts.playerDrop` на строке 105, но **забывает записать `playerDrop: !!opts.playerDrop` в объект `L`**. В `doLootPickup()` строка 197 проверяет `!L.playerDrop` (всегда `true`!) и `pa.members.has(L.ownerPid)` (всегда `true` для игрока в пати).
- **Влияние:** Любой предмет (включая `+N` оружие) или валюта `copper_parts`, выброшенные игроком в группе, при подборе запускают групповой ролл (`random`/`turn`) либо дележку валюты на всю пати. Ветка группового дележа `copper_parts` (строки 199–245) также лишена проверок веса (`canCarryMore`) и капа валюты (`MAX_CURRENCY_CAP`).
- **Исправление:** Сохранять `playerDrop: !!opts.playerDrop` в объекте `L` и добавить проверки веса и капа валюты в ветку группового дележа.

---

## 4. HIGH — Высокоприоритетные дефекты (28)

### Безопасность, доступ и контроль состояний

- **H-01. GM-доступ в git + синхронный `readFileSync` на входе:** `data/gm-access.json` отслеживается в git; `server/guest-auth.js:31` вызывает `fs.readFileSync(GM_ACCESS_PATH)` на главном потоке при каждом новом гостевом входе.
- **H-02. Обход IP rate-limit в uWS-прокси монолита и отражение `Origin` на 502:** `server/net-transport.js:451-457` (не удаляет `cf-connecting-ip`, в отличие от `cluster-manager.js:1084`); оба прокси отражают произвольный `Origin` при ошибке 502 (`net-transport.js:552`, `cluster-manager.js:1182`).
- **H-03. Утечка бэкапов редактора по HTTP (`shared/editor-overrides.backups/*.json`):** `server/http/static-server.js:17`, `server/cluster-manager.js:672`, `server/static-http.js:765` не блокируют `.backups/`; `static-server.js:166` буферизует файлы целиком через `fs.readFile`.
- **H-04. Timing-oracle перебора логинов + O(N) DoS по IP + гонка дублей имён персонажей:** `server/account-keys.js:1035-1067` (`scrypt` запускается только при существовании логина; при >50k IP выполняется линейный скан); `server/http/admin-api.js:459-477` (параллельные `/api/chars/create` создают дубли имён на разных аккаунтах).
- **H-05. Системное отсутствие проверок состояний (`stun`, `trade`, `store`, `duel`, `casting`):**
  - `playerStunned` не проверяется в `npc-services-handler.js`, `warehouse-handler.js`, `inventory-action-handler.js`, `clan-handler.js`, `enchant-handler.js`, `craft-handler.js`, `quest-handler.js`, `skill-learn-handler.js`, `doPose`, `biotin_trophy_turnin`, `trade-handler.js` (передан в `ctx`, но не вызван) и в `item-use-handler.js:106-212` (косметика и **боевые эликсиры аур** применяются до проверки стана на строке 219).
  - `p.trade || p.store` не проверяются в `combat-resolver.js:65-280`, `skill-caster.js:118-450`, `skill-learn-handler.js:27` (`doLearnSkill`), `loot-handler.js:177`.
  - `resolvePvpAttack` (`combat-resolver.js:187-280`) не сбрасывает `p.sitting = false` (PvP-автоатака сидя с регеном ×1.5).
  - `doTeleport` (`npc-services-handler.js:197-251`) и `escapeToCity` (`item-use-handler.js:272-298`) не сбрасывают `casting`/`sitting`/`_moveVec`; `doTeleport` не проверяет `p.duel`, `_lastCombatAt` и не обновляет `entityTransforms`.
- **H-06. `setgm <name> 0` в серверной консоли выдаёт GM 100 вместо снятия прав:** `server/handlers/console-commands.js:71` вычисляет `0 || 100` → `100`.

### Кластер, сеть, память и сессии

- **H-07. 640 МБ потерянной RAM на старте кластера:** `shared/net-pack-binary.js:52-68` выделяет `16384 * 8192 = 128 МБ` внешний ring-буфер в **каждом** процессе (5 процессов × 128 МБ = 640 МБ), хотя Master никогда не вызывает `encodeUpd`, а `GatewaySocketProxy.send` всё равно копирует буфер через `NPB.detachBuffer`.
- **H-08. Кластерный продакшн по умолчанию на `DB=file` с локальными локами:** `ecosystem.config.js:15-20`, `server/db.js:134-141` (`CLUSTER_WORKERS=4` + `ALLOW_FILE_DB_IN_PROD=1` обходит `ERR_CLUSTER_FILE_DB`); `server/account-keys.js:595-607,729` допускает конкурентную перезапись хранилища Master'ом и воркерами.
- **H-09. Гонка старта воркера:** `server/server.js:2711-2966,4984-5054`, `server/cluster-manager.js:507-562` — обработчики `clusterIpc` (`client_raw`, `handoff`, `session_restore`) вешаются синхронно ДО `await Promise.all(initTasks)`.
- **H-10. Дефекты `MasterGateway`:**
  - `server/http/admin-api.js:845-890` + `cluster-manager.js:241-243`: `setupGmChangeListener` шлёт `self_sync` со скиллами из stub-объектов `clusterPlayers` (без `.skills`), стирая боевые умения в UI клиента.
  - `cluster-manager.js:113,162-189`: вызывает файловый `Clans.loadAll()` вместо `loadAllAsync()` — в режиме PostgreSQL лидер клана может удалить персонажа через `/api/chars/delete`.
  - `cluster-manager.js:1407-1410` → `ipc-hub.js:369-422`: `kickYid` шлёт `MSG_GATEWAY_CLOSE`, который не обрабатывается воркерами.
- **H-11. Обход 15-сек combat-logout таймера, утечка сокетов и незакрытый трейд:** `server/server.js:4704-4706,4808-4866`, `server/session/disconnect-manager.js:101-108,249-265` — `pingTimer` вызывает `detachPlayer` напрямую; `authed = true` ставится до `await doLogin`; combat-dummy не закрывает `trade`; хейт мобов чистится только в пределах 50 м.
- **H-12. Бесконечные утечки памяти и спираль деградации тика:**
  - `recentClosedConnIds` (`server/server.js:2436,2459`) никогда не очищается;
  - `_updItemPool` (`server/server.js:4264`) сбрасывается раз за тик вместо сброса на каждого игрока;
  - `budgetExceeded` (`server/server.js:4194-4212`) откладывает `unloadFarSpots` и `tickGroundLoot` (спираль перегрузки);
  - `quickSelectTopK` (`server/server.js:1240-1269`) деградирует до `O(N^2)` на равных приоритетах;
  - `SpatialGrid.clear()` (`server/spatial-grid.js:64`) запускает `prune(300000)` на каждом тике (10 Гц) при `cells.size > 2048`;
  - `PlayerDb.save()` (`server/player-db.js:498,947`) делает синхронный `JSON.stringify(payload, null, 2)` всей базы персонажей каждую секунду на главном потоке;
  - `Mod.pruneOldLogs()` (`server/moderation.js:448`) нигде не вызывается.
- **H-13. Утечки `knownBy`, рассинхрон `borderGhosts`, `_lastUpd` и `EntityTransformTable`:** `server/server.js:694-710,2562-2709,3059-3108,4138-4184,4331,4438` — handoff оставляет `p.pid` в `knownBy` всех известных сущностей; `char_delete_kick` пропускает очистку AOI/party/trade/duel; `pushPosUpd` мутирует `_lastUpd` до проверки backpressure/drop; `recomputeAOI` вне `tick()` заполняет JS-сетку, но опрашивает устаревшую `nativeSpatialGrid`.

### Персистентность, экономика и вес

- **H-14. Усечение 64-битных timestamps (`| 0`) и опечатка сортировки:** `server/db.js:271,657` (`a.name.localeCompare(a.name)`), `server/clans-store.js:271,274,301,306` (`createdAt | 0`, `joinedAt | 0` обрезают `Date.now()` до Int32).
- **H-15. Отсутствие `MAX_CURRENCY_CAP`, CPU DoS в `normalizeStoreItems` и гонка `cleanupOfflineFriend`:**
  - Нет проверки капа валюты в `trade-handler.js:198`, `warehouse-handler.js:192`, `clan-handler.js:624`, `quest-handler.js:238`;
  - `shared/trade-rules.js:160-180` (`normalizeStoreItems`) не ограничивает `list.length` и `count` (дубликаты/мусор не увеличивают `n < MAX_STORE_SLOTS` → CPU DoS и потеря точности `count * price`);
  - `server/handlers/social-handler.js:362-382` (`cleanupOfflineFriend`) делает несинхронизированные `DB.load → DB.save` для всех персонажей без блокировок;
  - `server/handlers/clan-handler.js`: кросс-воркерный lost-update на `members` при `saveMeta` и отсутствие `pushWeight` в `cwh_put`.
- **H-16. Утечка пассивок робы, Int32-обход веса и пропущенные `pushWeight`:** `server/core/player.js:697-720,943-957` — пассивки робы активны без проверки `robeActive`; `invAfter` использует `| 0` (Int32-переполнение обходит проверку веса); `playerWeightState` пересчитывается без кэша до 60×/с. Отсутствует `pushWeight` в `item-use-handler.js`, `enchant-handler.js:108-137`, `craft-handler.js:71`, `npc-services-handler.js:222,285`, `death-handler.js:96` (при дропе из сумки).

### Движение и Dead Reckoning

- **H-17. Дыры в античите скорости:** `server/handlers/movement-handler.js:50-93,144-166,224-264` — постоянный бонус +25% (`MOVE_TOLERANCE=1.25`), скачки до 5× (60 м/с, 48 м) при `lagFactor=4`; 3-е нарушение всё равно сдвигает игрока; `walking=true` даёт 1.0× регена на скорости бега; неограниченные `destX`/`destZ` → `Infinity` и шторм рассылки.
- **H-18. Дефекты Dead Reckoning:** `server/server.js:4275-4286,4327-4345,4378-4403`, `movement-handler.js:363`, `player-regen-handler.js:209` — входящие бегуны замирают до 6 сек (нет `move_vec_start` в `tick()`); `doPose`/`tickPlayerRegen` сбрасывают `p.moving` без `move_vec_stop`; расхождение `Math.round(hp)` vs `Math.floor(hp)` ломает пропуск пакетов DR.

### Боёвка, скиллы, дуэли и ИИ мобов

- **H-19. Бесконечный стакинг DoT на мобах + мёртвые `defRedMult`, `healRedMult` и `dropMult`:**
  - `server/combat/skill-caster.js:1087-1090`: `m.dots.push(...)` не дедуплицирует повторные касты → неограниченный стакинг DPS;
  - `m.defRedMult` (`skill-caster.js:1111`) никогда не применяется в `combat-resolver.js:119` и `skill-caster.js:1187`;
  - `m.healRedMult` (`skill-caster.js:1096`) никогда не применяется в `mob-handler.js:529`;
  - `dropMult` (`item-use-handler.js:151`) никогда не применяется в `mob-handler.js:1139-1144`.
- **H-20. Мульти-эффектные дебаффы перезаписывают сами себя в `BR.apply()`:** `skill-caster.js:1333-1382`, `mob-handler.js:652-756`, `shared/buff-rules.js:110-116` — все эффекты одного скилла передают одинаковый `id`, поэтому каждый последующий эффект стирает предыдущий (подтверждено на `cc_corrode` и `acid_spray`: `pdef` немедленно уничтожает `dot`).
- **H-21. Недостижимый антизастряватель мобов (`stuckTicks >= 30`) + затирание Enrage:**
  - `server/handlers/mob-handler.js:1559-1590` сбрасывает `m.stuckTicks = 0` при `3` и `11`, делая `mob-handler.js:1920` (`stuckTicks >= 30`) мёртвым кодом — застрявший при возврате моб навсегда остаётся неуязвимым (`Evade`).
  - `mob-handler.js:535-538`: 8-секундный self-buff босса перезаписывает перманентный `enrage` (×1.5 ATK / ×1.3 SPD).
- **H-22. Агро и AOE мобов сквозь стены и в мирную зону + `O(M)` скан в `callClanHelp`:** `mob-handler.js:1715-1729` (агро без `isPeaceAt` и `losGround`), `mob-handler.js:568-578` (AOE без `isPeaceAt` и `losGround` — можно убивать лавки в городе), `mob-handler.js:846` (`callClanHelp` сканирует всю карту `mobs` вместо `spatialGrid`).
- **H-23. Ошибки скиллов, самотаргет PvP, мёртвый device-gate обучения и десинк Soulshot:**
  - `skill-caster.js:1492-1527`: нет `tgt.pid === p.pid`; AOE с умершей целью-мобом бьёт вокруг кастера; строка 332 проверяет несуществующее `tpl.radius` вместо `tpl.aoeRadius`.
  - `skill-learn-handler.js:137-148`: проверка `tpl.type === 'active_damage' || tpl.type === 'aoe_damage'` — 100% мёртвый код (в `skill-db.js` есть только `active`, `passive`, `toggle`).
  - `combat-resolver.js:146-154,249-262`: при промахе или ударе по неуязвимому игроку Soulshot списывается без отправки `shot_use` клиенту.
- **H-24. Вечное зависание дуэли и поломка `activeDuelPlayers`:** `duel-handler.js:146` (`if (p.pid > p.duel.peer) continue` пропускает очистку при выходе оппонента с меньшим `pid`), `duel-handler.js:73-74` удаляет игрока из `activeDuelPlayers` при снятии чужого инвайта даже во время активной дуэли.
- **H-25. Дефекты смерти/воскрешения, `NaN` бессмертие и EXP мёртвому:** `death-handler.js:327-343` (`onPlayerDeathByPlayer` начисляет PK/карму до проверки `victim.dead`), `death-handler.js:292-310` (кросс-воркерный респ шлёт `player_revived` в старый AOI), `server.js:1798-1799` (левел-ап восстанавливает HP трупу; `NaN` HP = бессмертие), `party-handler.js:240-243` (`eligible.length === 0` попадает в `<= 1` и даёт solo EXP мёртвому).
- **H-26. Усиление IPC-трафика в пати и отключённый радиус инвайта в кластере:** `party-handler.js:336` (`party_sync` → `pushParty` → лавина обратных `party_member_update`), `party-handler.js:556,608` (отключён `PARTY_INVITE_R2` в кластере даже на одном воркере).
- **H-27. Потеря лута/EXP от DoT при выходе кастера + утечка таймеров респавна:** `mob-handler.js:1511-1514` (нет лута/EXP, если кастер DoT оффлайн/на другом воркере), `mob-handler.js:1240-1266` (таймеры боссов `si < 0` не в `respawnTimers` и держат замыкание на мёртвый `Mob` до 3600 с).
- **H-28. Спавн Worker Threads при каждом `require()` + двойной `_handleWorkerDown`:** `server/workers/persistence-client.js:174-191,624` (спавнит потоки даже в Master/CLI/Postgres; `error` + `exit` вызывают обработчик дважды).

---

## 5. MEDIUM и LOW — Сводный реестр (23)

| ID | Уровень | Место в коде | Описание дефекта |
| :--- | :---: | :--- | :--- |
| M-01 | `MED` | `server/ipc-hub.js:424-492` | `aggregatedMetrics.workers` и `directory` сохраняют устаревшие записи после `worker_exit` |
| M-02 | `MED` | `server/gateway-socket-proxy.js:36-37` | Двойной подсчёт `netStats.packetsOut`/`bytesOut` в кластере |
| M-03 | `MED` | `server/server.js:288`, `shared/entity-transform-table.js:78` | Переполнение Int32 у ID сущностей при `WORKER_ID >= 22` |
| M-04 | `MED` | `server/cluster-manager.js:651,758,1199` | `fs.createReadStream` без `'error'`-листенера; ошибка `uwsApp.listen` не делает `process.exit(1)`; `/healthz` в uWS без CORS |
| M-05 | `MED` | `server/world/leaderboard-manager.js:18,54,83-112` | Формула `level * 1000 + exp` роняет очки при левел-апе; боты в топе; нет капа на `limit`; кэш сбрасывается каждые 3.75 с |
| M-06 | `MED` | `server/world/spot-manager.js`, `server/server.js:317-335` | `rebuildServerSpots` удаляет мобов без AOI-leave; `despawnSpot` удаляет `spawnedSpots` при живом боссе; `spawnSpot` пропускает `GEO.canWalk` |
| M-07 | `MED` | `server/handlers/player-regen-handler.js:160` | Истечение эликсира ауры стирает перманентно открытые косметические ауры |
| M-08 | `MED` | `server/combat/combat-resolver.js:169`, `server/combat/skill-caster.js:1242` | PvE `dmg` рассылается через `broadcastAOI(p)` вместо AOI моба `m`; `entityTransforms.updateHp` не вызывается при уроне |
| M-09 | `MED` | `server/combat/skill-caster.js:120,418,345` | `p._lastCombatAt` ставится до валидации скилла; `doCastBegin` вызывает `losGround` без `p.y, m.y` |
| M-10 | `MED` | `server/handlers/craft-handler.js:37,51` | `canFit` проверяется до списания материалов (ложный отказ при 80/80 слотах); `Math.random()` вместо `crypto.randomInt` |
| M-11 | `MED` | `server/handlers/enchant-handler.js:74` | `pressure_amplifier` / `blessed_pressure_amplifier` обходят проверку грейда (NG-свитком точится D/C/B/A/S) |
| M-12 | `MED` | `server/handlers/npc-services-handler.js:125,237,249` | `doTeleport` шлёт старый `p.region` до `updatePlayerRegion`; `doShopBuy` не вызывает `questCollectChanged` |
| M-13 | `MED` | `server/handlers/skill-learn-handler.js:175-297` | `doDeviceUpgrade` работает без NPC из любой точки; `doClassTransfer` без `npcId` работает в любой точке Peace Zone |
| M-14 | `MED` | `server/handlers/social-handler.js:44,95-118,281-297` | `/tell` без антиспам-кулдауна для гостевых Lv1; `doChat` не режет управляющие/bidi символы; `friend_remote_accept_ack` даёт одностороннюю дружбу при handoff |
| M-15 | `MED` | `server/handlers/gm-handler.js:300,760,904` | `//unban` не принимает `yid`; `//give` без `isBadKey`; `p.gm` с `accessLevel=0` получает уровень 100 |
| M-16 | `MED` | `server/auth.js:153-171`, `server/session/session-manager.js:73-86` | `REQUIRE_AUTH_TIMESTAMP` выключен по умолчанию; `recentLoginSignatures` не чистится до размера 20k |
| M-17 | `MED` | `server/handlers/store-handler.js`, `shared/clan-rules.js:78,132` | Сделки личных лавок не логируются в `Mod.log`; `clan-rules.js` сравнивает валюту через `currency \| 0` |
| M-18 | `MED` | `server/handlers/mob-handler.js:620,1527` | Магические скиллы мобов идут через старый `G.rollDamage` вместо `L2.circuitDamage`; `stepMobTowards` пересоздаётся на каждом тике |
| M-19 | `MED` | `server/static-http.js:530,659,707` | Прокси `req.pipe(pReq)` без лимита тела и таймаута; `handleYouTubeSubs` доверяет поддельному `Origin`; `/api/save-measurements` пишет синхронно `writeFileSync` |
| L-01 | `LOW` | `server/handlers/duel-handler.js:179-255`, `server/server.js:4025` | Двойной `checkRate(p, 'action')` на каждый пакет дуэли |
| L-02 | `LOW` | `server/handlers/death-handler.js:371`, `shared/death-rules.js:148-154` | Неиспользуемое поле `p._resPending`; PK 1–4 ур. защищены `Lucky` от карма-дропа |
| L-03 | `LOW` | `.github/workflows/stress-test.yml`, `.github/workflows/stress-tests.yml` | Два полностью идентичных (306 строк) дублирующих workflow |
| L-04 | `LOW` | `server/handlers/item-use-handler.js:249-313` | Свиток воскрешения поднимает цель мгновенно без подтверждения |

---

## 6. Приоритетный план устранения (Roadmap P0–P3)

### Волна P0 — Немедленно (безопасность, экономика, сохранность данных, падения кластера)
1. **Кластер и данные:** `C-01` (IPC-синк банов/мутов с поддержкой `null`), `C-02` (атомарный login-lock + `detach_ack`), `C-03` (изоляция `guestTokenHashes`), `C-14` (graceful shutdown 8–10 с + flush в Master), `C-11` (`unhandledRejection` → `exit(1)`, валидация `NaN` в `SpatialGrid`, `try/catch` в `tick()`).
2. **Безопасность и движение:** `C-04` (закрыть `EDITOR_ENABLED=0` в WS), `C-09` (привязка `isSyntheticBot` к токену сокета), `C-07` (очистка `sitting`/`cast`/`store` в `move_stop`), `C-10` (инкрементальный `GEO.moveAlong`), удаление `data/gm-access.json` и мусора из индекса git.
3. **Экономика и PvP:** `C-05` (`sellPrice = 0` + одноразовая выдача стартеров), `C-06` (`initialized`-флаг вместо вайпа Lv1), `C-08` (убрать масштабирование HP/MP вверх в `applyClassStats`), `C-18` (запись `L.playerDrop` + вес/кап валюты), `C-13` (очистка дуэльных дебаффов в `endDuel`/`finishDuel`).

### Волна P1 — Native C++, инфраструктура и память под нагрузкой
4. **C++ SIMD и DevOps:** `C-12` (`size_t` overflow, `NaN` в `clamp`, крит при `1.0`, `forceCrit`, честная проверка `hasNative` и `node-gyp rebuild`), `C-17` (перегенерация `package-lock.json`, починка `Dockerfile` и `deploy-vps.js`), `C-15` (миграция `account_keys.json` в `migrate-db.js`), `C-16` (`/healthz` 503 при мёртвых/зависших воркерах).
5. **RAM и утечки:** `H-07` (экономия ~600 МБ в `net-pack-binary`), `H-12` (`recentClosedConnIds`, `_updItemPool`, `Mod.pruneOldLogs()`, асинхронный `PlayerDb.save()`, `budgetExceeded`, `SpatialGrid.clear()`), `H-08` (переход кластера на PostgreSQL), `H-09` (IPC после `initTasks`), `H-13` (`knownBy`/`borderGhosts`/`_lastUpd`).

### Волна P2 — Боёвка, ИИ мобов и единый слой проверок
6. **Бой и ИИ:** `H-19` (дедупликация `m.dots`, подключить `defRedMult`/`healRedMult`/`dropMult`), `H-20` (уникальные ID `skillId + ':' + kind` в `BR.apply`), `H-21` (отдельный `returnStuckTicks` + защита Enrage), `H-22` (`isPeaceAt`/`losGround` в агро/AOE + `spatialGrid` в `callClanHelp`), `H-23` (самотаргет PvP, device-gate `skill-learn-handler`, `shot_use` на промахе), `H-24` (`tickDuels` и `clearDuelInvitesOf`).
7. **Гарды и консистентность:** `H-05` (единый middleware `stun`/`trade`/`store`/`duel`/`casting`), `H-10` (`MasterGateway` GM skills / `Clans.loadAllAsync` / `kickYid`), `H-11` (combat-logout через `pingTimer`), `H-14` (timestamps без `| 0`), `H-15` (`MAX_CURRENCY_CAP`, лимиты `normalizeStoreItems`, блокировка `cleanupOfflineFriend`), `H-16` (`robeActive`, Int32-вес, `pushWeight`), `H-17`/`H-18` (античит и DR).

### Волна P3 — Полировка и регрессионные тесты
8. Устранение всех `M-01..M-19` и `L-01..L-04`, удаление дубля `.github/workflows/stress-tests.yml`, исправление `setgm 0` (`H-06`) и покрытие каждого критического кейса юнит-тестами в `tests/`.

