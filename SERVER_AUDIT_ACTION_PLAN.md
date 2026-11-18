pij# План действий по итогам живого аудита серверной части (Project Steam: Origins)

> **Основание:** Живой аудит исходного кода `server/`, `native/src/`, `shared/`, `scripts/`, `ecosystem.config.js`, `binding.gyp` (без использования старой документации).
> **Ограничение архитектуры (`AGENTS.md`):** Все исправления выполняются со строгим сохранением нативного C++ SIMD (`project_steam_native.node`), `uWebSockets.js` (`STRICT_UWS=1`), `Worker Threads` (`persistence-worker.js`) и инвариантов троттлинга синтетических ботов.

---

## Этап 1. Критические блокеры сохранности данных и безопасности (CRITICAL)

### Задача 1.1. Исключить перезапись живой БД игроков на VPS при деплое
- **Файл:** `scripts/deploy-vps.js` (строки 30–72)
- **Проблема:** В массив `targets` включена вся папка `'data'`. При каждом деплое `tar -xzf` на боевом VPS перезаписывает боевые файлы `data/players.json`, `data/characters.json`, `data/clans.json`, `data/gm-access.json`, `data/moderation/sanctions.json` локальными файлами с машины разработчика.
- **Действия:**
  1. Добавить в список `excludes` в `scripts/deploy-vps.js`:
     - `--exclude="data/players.json*"`
     - `--exclude="data/characters.json*"`
     - `--exclude="data/clans.json*"`
     - `--exclude="data/gm-access.json*"`
     - `--exclude="data/moderation/*"`
     - `--exclude="data/local_*.json"`
  2. Оставить в `data/` для деплоя только статические карты террейна (`data/terrain-paint-1.png`, `data/terrain-paint-2.png`), если они требуются серверу.
- **Критерий готовности:** Архив `temp_deploy_package.tar.gz` при проверке `tar -ztf` не содержит пользовательских профилей, реестра персонажей, кланов и санкций.

---

### Задача 1.2. Починить Anti-Combat-Log (15-секундное удержание в бою при дисконнекте)
- **Файлы:**
  - `server/server.js` (строки 4833–4850, `zombiePlayerSweeper`)
  - `server/session/disconnect-manager.js` (строки 231–264, `handleSocketClose`)
- **Проблема:** `handleSocketClose` удаляет `wsByPid.delete(pid)` до запуска 15-секундного `p._combatLogoutTimer`. Каждые 10 секунд `zombiePlayerSweeper` проверяет `!wsByPid.get(pid)` без проверки `p._combatLogoutTimer` и принудительно выкидывает персонажа из мира через 0–10 секунд после Alt+F4.
- **Действия:**
  1. В `server/server.js` внутри цикла `zombiePlayerSweeper` добавить проверку перед удалением:
     ```javascript
     if (p._combatLogoutTimer) continue;
     ```
  2. В `server/session/disconnect-manager.js` убедиться, что при повторном входе игрока (`reconnect`) до истечения 15 секунд `clearTimeout(p._combatLogoutTimer)` корректно сбрасывает таймер, а при смерти персонажа во время `_combatLogoutTimer` таймер очищается и профиль сохраняется.
- **Критерий готовности:** Юнит-тест: игрок в состоянии боя (`_lastCombatAt` < 15 с назад) закрывает сокет -> вызов `zombiePlayerSweeper` не удаляет его из `players` до истечения 15 секунд.

---

### Задача 1.3. Устранить гонку записи `PlayerDb` и файловой БД между воркерами кластера (`CLUSTER_WORKERS=4`)
- **Файлы:**
  - `server/player-db.js` (строки 735–841)
  - `server/cluster-manager.js` (строки 270–410)
  - `server/ipc-hub.js`
  - `server/db.js` (строки 121–165)
- **Проблема:** В кластере работают 4 зонных воркера. Каждый держит свою копию `Map` `characters` в `PlayerDb`. Когда воркер вызывает `PlayerDb.touch(p)` -> `saveIndex()`, он перезаписывает `data/characters.json` (и ключ `characters_registry` в таблице `system_state` PostgreSQL) только своим состоянием, стирая обновления с других 3 воркеров. Аналогично при `DB=file` все 4 воркера параллельно перезаписывают `data/players.json`.
- **Действия:**
  1. **Централизация записи `PlayerDb` через MasterGateway (или атомарное слияние):**
     - В кластерном режиме (`process.env.CLUSTER_WORKER === '1'`) при вызове `PlayerDb.touch(p)` и `PlayerDb.setAccessLevel(...)` зонный воркер отправляет дельту записи персонажа (`{ key, record }`) в `MasterGateway` по IPC (`player_db_touch`), а также рассылает её соседним воркерам для консистентности локального кэша.
     - Запись полного индекса `characters.json` / `system_state.characters_registry` на диск/БД выполняет **только один процесс** (`MasterGateway` либо выделенный воркер №1, получающий дельты от всех воркеров).
  2. **Защита `data/players.json` в режиме `DB=file` при кластеризации:**
     - В `server/db.js` / `persistence-client.js` для режима `DB=file` в кластере: либо маршрутизировать `DB.set(yid, data)` через единый процесс записи (`MasterGateway` persistence worker), либо перед дампом мержить ключи аккаунтов, чтобы воркер не затирал профили игроков с других зон.
- **Критерий готовности:** Одновременное создание/прокачка персонажей на Worker 1 и Worker 2 не приводит к потере записей в `data/characters.json` и `data/players.json`.

---

### Задача 1.4. Убрать обход production-защит и дыру `*.onrender.com` в `ecosystem.config.js`
- **Файлы:**
  - `ecosystem.config.js` (строки 15–38)
  - `server/security-config.js` (строки 180–195)
- **Проблема:**
  - В `ecosystem.config.js` захардкожен `CORS_ORIGINS` со значением `*.onrender.com`, что позволяет любому чужому поддомену на `onrender.com` подключаться к серверу.
  - Флаги `ALLOW_FILE_DB_IN_PROD: '1'` и `ALLOW_INSECURE_AUTH: '1'` заданы по умолчанию прямо в `env` продакшен-конфига.
- **Действия:**
  1. В `ecosystem.config.js` заменить `*.onrender.com` в `CORS_ORIGINS` на точный боевой домен клиента Render (`https://project-steam-client.onrender.com`, плюс `*.yandex.ru,*.yandex.net,*.yandex.com,https://yandex.ru`).
  2. Перевести `ALLOW_FILE_DB_IN_PROD` и `ALLOW_INSECURE_AUTH` на чтение из `process.env` без принудительного `'1'` по умолчанию, либо явно задокументировать их через `.secrets.env` на VPS.
- **Критерий готовности:** `SEC.originAllowed('https://attacker.onrender.com')` возвращает `false`; боевой клиент `https://project-steam-client.onrender.com` и домены Яндекс Игр проходят проверку.

---

## Этап 2. Синхронизация кластера и межзонного взаимодействия (HIGH)

### Задача 2.1. Исправить синхронизацию кланов при кике, выходе и роспуске (`clan_sync`)
- **Файлы:**
  - `server/server.js` (строки 2965–2977)
  - `server/handlers/clan-handler.js` (строки 93–108)
- **Проблема:** Обработчик `clusterIpc.on('clan_sync')` вызывает `clanHandler.bindPlayerClan(pl, c)` только если `c` найден, но не очищает `pl.clanId`, если игрок был исключён из клана или клан распущен на другом воркере.
- **Действия:**
  1. В `server/server.js` в `clusterIpc.on('clan_sync')`:
     ```javascript
     for (const [, pl] of players) {
       const c = Clans.memberOf(updated, pl.yid, pl.charId);
       if (c) {
         clanHandler.bindPlayerClan(pl, c);
       } else if (pl.clanId) {
         clanHandler.bindPlayerClan(pl, null);
         clanHandler.pushClanState(pl, null);
         clanHandler.broadcastClanTag(pl);
       }
     }
     ```
- **Критерий готовности:** При кике игрока на Worker 1 у этого игрока на Worker 2 немедленно пропадает тег клана и очищается `pl.clanId`.

---

### Задача 2.2. Добавить поддержку кластерного IPC для `/clan_invite`, `world-time` и GM-команд
- **Файлы:**
  - `server/handlers/clan-handler.js` (строки 218–260)
  - `server/handlers/gm-handler.js` (строки 261–497)
  - `server/handlers/world-time-handler.js` (строки 58–157)
  - `server/cluster-manager.js` / `server/server.js`
- **Проблема:**
  - `doClanInvite` ищет цель только локально (`findPlayerByName`), не находя игроков в других зонах.
  - GM-команды `//announce`, `//heal`, `//res`, `//give`, `//setgm`, `//revokegm` работают только в пределах текущего воркера GM-а.
  - Смена мирового времени (`set_time`, `set_time_pause`) меняет время только на одном воркере.
- **Действия:**
  1. Для `//announce` и `set_time` / `set_time_pause`: пробрасывать событие через `clusterIpc.sendToMaster('meta_sync', ...)` на все воркеры кластера.
  2. Для `//setgm` и `//revokegm`: после обновления `PlayerDb` транслировать IPC-событие на все воркеры, чтобы онлайн-цель на другом воркере сразу получила `p.gm = true/false` и `p.accessLevel`.
  3. Для `doClanInvite` и целевых GM-команд (`//heal`, `//res`, `//give`): добавить пересылку через `clusterIpc` по аналогии с `party_op` / `gm_cmd`.
- **Критерий готовности:** GM в Городе (Worker 1) делает `//announce` и меняет время суток — изменения применяются на всех 4 воркерах одновременно.

---

## Этап 3. Сетевой транспорт `uWebSockets.js` и C++ `NativeSpatialGrid` (HIGH)

### Задача 3.1. Защита от Backpressure в `MasterGateway` и защита кольцевого буфера `NET_PACK_BINARY`
- **Файлы:**
  - `server/cluster-manager.js` (строки 858–968)
  - `server/net-transport.js` (строки 150–175, 254–275)
  - `shared/net-pack-binary.js` (строки 112–157)
- **Проблема:**
  1. В `MasterGateway` (`cluster-manager.js`) у `app.ws('/*', ...)` не заданы `maxBackpressure` и `closeOnBackpressureLimit: false`, нет обработчика `drain`.
  2. В `net-transport.js` при попадании бинарного пакета `upd` в отложенную очередь `this._sendQueue` (при переполнении буфера сокета) сохраняется ссылка на `subarray` кольцевого буфера `_ringBuffers`, который перезаписывается через 4096 вызовов `encodeUpd`.
- **Действия:**
  1. В `server/cluster-manager.js` добавить в конфигурацию `app.ws`:
     - `maxBackpressure: 1024 * 1024`, `closeOnBackpressureLimit: false`.
     - Проверять `clientWs.getBufferedAmount()` перед пересылкой non-critical пакетов (`OP_UPD = 0x01`) медленным клиентам (дропать устаревший `upd` кадр при переполнении буфера сокета свыше 256 КБ, пропуская важные JSON-сообщения).
  2. В `server/net-transport.js` в методе `send()` при постановке бинарного `Buffer`/`Uint8Array` в `this._sendQueue` (медленная ветка при backpressure) делать копию `Buffer.from(data)`, чтобы кольцевой буфер `NET_PACK_BINARY` никогда не мутировал отложенную очередь.
- **Критерий готовности:** При искусственном замедлении чтения сокета бинарные пакеты в очереди не портятся, а `MasterGateway` не течёт по памяти.

---

### Задача 3.2. Увеличить буфер выборки `NativeSpatialGrid::queryRadius` и защитить приоритеты AOI
- **Файлы:**
  - `server/server.js` (строки 276–277, 2300–2420)
  - `native/src/spatial_grid.h` (строки 127–163)
- **Проблема:** Буферы `_nativePBuf` и `_nativeMBuf` имеют размер `1024`. При скоплении > 1024 сущностей в радиусе запроса `queryRadius` обрезает выдачу по порядку ячеек сетки (слева направо) до того, как `recomputeAOI` отфильтрует реальных игроков, сопартийцев и цель в таргете от синтетических ботов.
- **Действия:**
  1. Расширить `_nativePBuf` и `_nativeMBuf` в `server/server.js` с `1024` до `4096` (`new Int32Array(4096)` — всего 16 КБ статической памяти).
  2. В `recomputeAOI` гарантировать, что текущая боевая цель игрока (`p.combatTargetPid` / `p.targetPid`) и члены его группы (`party`) проверяются и включаются в кандидаты AOI даже при экстремальной плотности ботов.
- **Критерий готовности:** При 3000 ботах в одной зоне реальные игроки и члены группы всегда попадают в `aoiPlayers` друг друга.

---

## Этап 4. Боевая логика, геймплейные баги и унификация констант (MEDIUM)

### Задача 4.1. Сброс истёкшего PvP-флага и оповещение AOI об отмытии кармы PK
- **Файлы:**
  - `server/handlers/player-regen-handler.js` (или `duel-handler.js` / главный тик в `server.js`)
  - `server/handlers/mob-handler.js` (строки 1200–1208)
- **Проблема:**
  1. Когда `Date.now() >= p.flagUntil`, клиенту и в AOI не отправляется пакет о снятии фиолетового PvP-флага.
  2. Когда убийство моба снижает `dropWinner.karma` до `0`, в AOI не рассылается обновление состояния PK (`player_flag` / `p_update`).
- **Действия:**
  1. В тике игрока отслеживать переход `p.flagUntil > 0 && now >= p.flagUntil`: обнулять `p.flagUntil = 0`, отправлять `send(p, { t: 'flag', flagged: false, flagUntil: 0, karma: p.karma, pk: p.pk })` и `broadcastAOI(p, { t: 'player_flag', pid: p.pid, flagged: false, karma: p.karma })`.
  2. В `server/handlers/mob-handler.js` при уменьшении `dropWinner.karma` (особенно при переходе `karma === 0`) вызывать `broadcastAOI(dropWinner, { t: 'player_flag', pid: dropWinner.pid, flagged: dropWinner.isFlagged, karma: dropWinner.karma })`.
- **Критерий готовности:** Через 40 секунд после прекращения PvP фиолетовый ник гаснет у самого игрока и у всех наблюдателей в AOI; после отмытия кармы красный ник PK меняется на обычный у всех вокруг.

---

### Задача 4.2. Защита заточки (`plusById`) при сдаче collect-квестов
- **Файл:** `server/handlers/quest-handler.js` (строки 178–195, 207–212)
- **Проблема:** Если по квесту сдаётся предмет (`o.type === 'collect'`), не проверяется наличие на нём заточки в `p.plusById`, и при списании предмета запись в `p.plusById` бесследно удаляется.
- **Действия:**
  1. В `doQuestComplete` при проверке `o.type === 'collect'` проверять, не остаётся ли у игрока 0 копий предмета при `p.plusById[o.target] > 0` (либо запрещать сдачу заточенного предмета по collect-квесту с причиной `enchanted`, если заточка > 0).
- **Критерий готовности:** Сдача квеста не уничтожает молча заточку экипировки/предмета.

---

### Задача 4.3. Унификация разошедшихся констант между `server.js` и модулями
- **Файлы:**
  - `server/combat/combat-resolver.js` (строка 14)
  - `server/combat/skill-caster.js` (строка 12)
  - `server/core/player.js` (строки 37–38, 149)
  - `server/handlers/social-handler.js` (строка 10)
  - `server/cluster-manager.js` (строка 874) и `server/net-transport.js` (строка 762)
- **Действия:**
  1. Прокинуть `MELEE_RANGE` (`4.0`) из `server.js` через `deps` в `createCombatResolver`, убрав локальный хардкод `3.5`.
  2. Прокинуть `MAGIC_EFFECT_RANGE_DEFAULT` (`55`) из `server.js` через `deps` в `createSkillCaster`, убрав локальный хардкод `40`.
  3. Выровнять `MOVE_TOLERANCE` (`1.25`) и `MOVE_BURST_SEC` (`0.8`) между `server/core/player.js` и `server/handlers/movement-handler.js`.
  4. Выровнять `MAX_FRIENDS` (`64`) между `server/core/player.js` и `server/handlers/social-handler.js`.
  5. Выровнять дефолтный `MAX_CONNS_PER_IP` (`64`) в `cluster-manager.js` и `net-transport.js`.
- **Критерий готовности:** Ни один хендлер не использует теневые дубликаты констант, противоречащие `server.js`.

---

### Задача 4.4. Синхронизация формулы блока щитом в C++ `resolveHitFast` и защита `PersistenceClient`
- **Файлы:**
  - `native/src/combat_engine.h` (строки 218–228)
  - `server/workers/persistence-client.js` (строки 69–106)
- **Действия:**
  1. В `native/src/combat_engine.h` в `resolveHitFast` привести расчёт эффективной защиты при блоке щитом к канонической формуле `shared/l2-combat.js`: `pDefEff = (pDef + shieldDef) * (1.0 - ignoreDef)` вместо `dmg / 2`.
  2. В `server/workers/persistence-client.js` обернуть `this.worker.postMessage(...)` внутри `Promise` в `try / catch` с немедленным вызовом `clearTimeout(timer)` и `this.pending.delete(id)` при синхронной ошибке отправки.
- **Критерий готовности:** Формулы C++ и JS идентичны на 100%; `PersistenceClient` не оставляет висящих таймеров при сбое `postMessage`.

---

## Этап 5. Верификация, тестирование и деплой

1. **Автоматическая проверка инвариантов:**
   - Запуск `node scripts/guard-anti-rollback.js` (должны проходить все 22 проверки: C++ SIMD, uWS, Worker Threads, Bot Throttling, Zero-Stutter).
2. **Модульные и интеграционные тесты:**
   - Запуск `node tests/run.js` + добавление регрессионных тестов на:
     - сохранение игрока в мире при `_combatLogoutTimer` во время работы `zombiePlayerSweeper`;
     - снятие `clanId` при `clan_sync` после исключения из клана;
     - истечение `flagUntil` с рассылкой в AOI;
     - единый `MELEE_RANGE` и `MAGIC_EFFECT_RANGE_DEFAULT`.
3. **Сборка нативного модуля и деплой (по протоколу `AGENTS.md`):**
   - Локальная проверка и коммит изменений.
   - Деплой на боевой VPS через исправленный `node scripts/deploy-vps.js` (с проверкой сохранности боевых файлов в `/var/www/project-steam/data/`).

