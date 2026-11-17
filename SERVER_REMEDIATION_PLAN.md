# Детальный технический план устранения уязвимостей и ошибок сервера (Project Steam)

> **Статус документа:** Актуальный живой план исправлений по результатам прямого аудита исходного кода (`server/`, `native/`, `shared/`, `scripts/`, `ecosystem.config.js`, `data/gm-access.json`).
> **Архитектурный контракт (`AGENTS.md`):** Все исправления выполняются **строго без откатов** (`uWebSockets.js` v20.70.0, C++ AVX2 `project_steam_native.node`, `Worker Threads` и инварианты троттлинга ботов сохраняются на 100%).

---

## Сводная таблица задач (25 пунктов в 6 этапах)

| ID | Приоритет | Этап | Модуль / Файл | Краткое описание проблемы |
| :--- | :--- | :--- | :--- | :--- |
| **CRIT-01** | CRITICAL | Этап 1 | `server/net-transport.js`, `server/cluster-manager.js` | Неограниченная буферизация тела HTTP-запроса в `res.onData` внутри прокси `uWebSockets.js` (OOM DoS до попадания в `admin-api.js`). |
| **HIGH-07** | HIGH | Этап 1 | `server/cluster-manager.js` | Захардкоженный фоллбэк `ps_bench_2026` для заголовка `x-stress-key` обходит `MAX_CONNS_PER_IP` в кластере. |
| **HIGH-08** | HIGH | Этап 1 | `server/security-config.js` | Безусловное доверие заголовку `cf-connecting-ip` при работе за локальным прокси (спуфинг IP) и слабая регулярка IPv6 в `isValidIp`. |
| **MED-05** | MEDIUM | Этап 1 | `server/net-transport.js`, `server/editor-guard.js`, `server/security-config.js` | Внутренний прокси uWS принудительно инжектит `x-real-ip` и `x-forwarded-for`, ломая `isLoopbackReq` и `/metrics` с `127.0.0.1`. |
| **CRIT-02** | CRITICAL | Этап 2 | `data/gm-access.json`, `server/guest-auth.js`, `server/player-db.js` | Тестовые GM-аккаунты (`local_34b2a5845c92`, `itest_gm`) в `gm-access.json` + пропуск проверки `GUEST_TOFU=0` при `profiles.length === 0`. |
| **MED-04** | MEDIUM | Этап 2 | `ecosystem.config.js`, `package-lock.json` | Авто-включение `ALLOW_INSECURE_AUTH: '1'` при отсутствии `YANDEX_APP_SECRET`, маска `*.sslip.io` в `CORS_ORIGINS`, рассинхрон `package-lock.json`. |
| **HIGH-01** | HIGH | Этап 3 | `server/db.js`, `server/session/disconnect-manager.js` | Гонка `DB.save` и `DB.load` при быстром реконнекте: `DB.load` не ждёт `writeChains`, а `pidByYid` очищается до завершения сохранения. |
| **HIGH-02** | HIGH | Этап 3 | `server/db.js`, `server/workers/persistence-client.js` | Синхронный `JSON.stringify(data)` в главном потоке `FileBackend.save` и `PgBackend.save` перед отправкой в воркер. |
| **HIGH-04** | HIGH | Этап 3 | `server/http/admin-api.js` | Параллельные запросы `/api/chars/create` и `/api/chars/delete` не блокируют `loggingIn`, позволяя перезаписать слот или обойти лимит. |
| **MED-06** | MEDIUM | Этап 3 | `server/session/session-manager.js` | Отсутствие проверки `ws.readyState === 1` после `await` в `doLoginInner` создаёт «зомби-игрока» при закрытии сокета во время входа. |
| **HIGH-03** | HIGH | Этап 4 | `native/src/spatial_grid.h`, `server/server.js`, `server/handlers/mob-handler.js` | `bulkInsert` вставляет пустые слоты `type == 0`; `entityTransforms.updateHp` не вызывается для игроков; `borderGhosts` теряются при `nativeSpatialGrid`; утечка слотов в `rebuildServerSpots`. |
| **CRIT-04** | CRITICAL | Этап 4 | `server/cluster-manager.js`, `server/http/admin-api.js`, `server/server.js` | В режиме кластера `/api/chars/delete` на шлюзе не кикает онлайн-игрока на воркере (воскрешение удалённого персонажа / дюп), а `/api/status` всегда показывает `players: 0`. |
| **MED-01** | MEDIUM | Этап 4 | `server/server.js` | Сломанные IPC-обработчики `mod_sync` (`ban_ip` vs `banIp`, обращение к несуществующему `pl._ws`), `gm_sync` и дубль `account_key_sync`. |
| **MED-02** | MEDIUM | Этап 4 | `shared/zone-sharding.js` | Смешение 0-based и 1-based индексов зон в `getZoneAt` (`currentZoneOrWorker === 1` включает гистерезис сразу двух зон). |
| **CRIT-03** | CRITICAL | Этап 5 | `server/server.js`, `server/handlers/quest-handler.js` | Дюп заточки `+N`: `doLootPickup` вызывает `NPCS.plusMoveOk` только при `L.plus > 0`, позволяя смешать `+0` с земли с `+15` в сумке (и превратить оба в `+15`). |
| **HIGH-05** | HIGH | Этап 5 | `server/handlers/enchant-handler.js` | `doEnchant` не проверяет грейд предмета, тип свитка и боевой слот (позволяет точить `title`/`costume` и любой грейд базовым свитком). |
| **HIGH-09** | HIGH | Этап 5 | `server/handlers/store-handler.js`, `server/handlers/npc-services-handler.js` | Продажа в личную лавку (`doStoreDeal`) и NPC-магазин (`doShopSell`) не проверяет переполнение `MAX_CURRENCY_CAP` (`2 147 483 647`) у получателя денег. |
| **HIGH-06** | HIGH | Этап 5 | `server/combat/skill-caster.js` | Списание сосок (`consumeArmedShot`) происходит до проверки валидности цели/дистанции/LoS/мирной зоны; рассинхрон `castSec` vs `baseCastSec`; AOE не работает в PvP. |
| **MED-07** | MEDIUM | Этап 5 | `server/server.js`, `server/handlers/movement-handler.js` | `elHistogram` никогда не сбрасывается, завышая `moveBudget` до `4.0x`; `loadLeaderboardIndex` читает `.json` даже при `postgres` бэкенде. |
| **LOW-01** | LOW | Этап 5 | `server/handlers/gm-handler.js` | `//oneshot <player>` ставит `tgt.hp = 0; tgt.dead = true` без вызова `onPvpLethal` / `onPlayerDeath`, оставляя игрока без окна воскрешения. |
| **LOW-02** | LOW | Этап 5 | `server/handlers/mob-handler.js` | После наложения дебаффов мобом на игрока вызывается `pushEffects(tgt)`, но не вызывается `pushCombatStats(tgt)`. |
| **LOW-03** | LOW | Этап 5 | `server/server.js`, `server/editor-guard.js` | Двойная подписка `ws.on('pong')` в `setupSocketConnection` и отсутствие фоновой очистки истёкших токенов в `EditorGuard.tokens`. |
| **LOW-04** | LOW | Этап 5 | `server/combat/skill-caster.js` | Кулдаун скиллов рассчитывается как `effCdSec * 900` мс вместо `1000` мс (кроме `spoil`). |
| **CRIT-05** | CRITICAL | Этап 6 | `scripts/watchdog.js` | При зависании сервера Watchdog вызывает `pm2 restart project-steam-mmo`, тогда как в `ecosystem.config.js` процесс называется `project-steam`. |
| **MED-03** | MEDIUM | Этап 6 | `scripts/sync-client-vps.js`, `scripts/auto-deploy-all.js` | `sync-client-vps.js` заливает `server/` без `guard-anti-rollback.js` и копирует `client/*.html` на VPS; `auto-deploy-all.js` теряет `hasServerMods` после коммита. |

---

## Этап 1. Сетевой периметр, защита от OOM и корректное определение IP

### 1.1. [CRIT-01] Ограничение буферизации HTTP-тела в uWS-прокси
- **Файлы:** [net-transport.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/net-transport.js#L447-L460), [cluster-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/cluster-manager.js#L892-L898)
- **Было (в коде сейчас):**
  ```javascript
  const bodyChunks = [];
  res.onData((ab, isLast) => {
    const chunk = Buffer.from(ab.slice(0));
    if (chunk.length > 0) bodyChunks.push(chunk);
    if (isLast) {
      const fullBody = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;
      this._forwardToHttpServer(method, fullUrl, headers, fullBody, res, aborted);
    }
  });
  ```
- **Механика уязвимости:** `uWebSockets.js` принимает HTTP-поток и копирует каждый кусок в массив `bodyChunks` в памяти V8 до прихода `isLast`. Все проверки размера тела в `admin-api.js` срабатывают только после того, как всё тело уже аллоцировано в RAM.
- **План исправления:**
  1. Выделить функцию `maxHttpBodyBytesForUrl(urlPath)`:
     - Для `/api/editor/*` (только если `process.env.NODE_ENV !== 'production'`): `32 * 1024 * 1024` (32 МБ).
     - Для `/api/admin/*`, `/api/chars/*`, `/api/account/*`: `16 * 1024` (16 КБ).
     - Для всех остальных маршрутов: `8 * 1024` (8 КБ).
  2. До подписки на `res.onData` проверять `Number(headers['content-length']) > maxBytes`. Если превышено — немедленно возвращать `413 Payload Too Large` и завершать ответ.
  3. Внутри `res.onData` вести счётчик `receivedBytes += chunk.byteLength`. При `receivedBytes > maxBytes` очищать `bodyChunks.length = 0`, выставлять флаг `overLimit = true`, отправлять `413 Payload Too Large` и закрывать соединение (`res.close()`).
  4. Применить идентичную защиту в `MasterGateway` ([cluster-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/cluster-manager.js#L885-L905)).

---

### 1.2. [HIGH-07] Удаление хардкод-фоллбэка `ps_bench_2026` в `cluster-manager.js`
- **Файл:** [cluster-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/cluster-manager.js#L760), [cluster-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/cluster-manager.js#L975)
- **Было (в коде сейчас):**
  ```javascript
  const isStressBypass = req.getHeader('x-stress-key') === (process.env.STRESS_KEY || 'ps_bench_2026');
  ```
- **План исправления:**
  Привести к единому стандарту с `net-transport.js`:
  ```javascript
  const stressSecret = process.env.STRESS_SECRET;
  const reqStressKey = req.getHeader('x-stress-key') || req.getHeader('x-stress-test');
  const isStressBypass = process.env.ALLOW_UNLIMITED_WS === '1' ||
    (process.env.STRESS_TEST === '1' && (
      (stressSecret && reqStressKey && SEC.secretEquals(reqStressKey, stressSecret)) ||
      (!stressSecret && !SEC.isProd())
    ));
  ```

---

### 1.3. [HIGH-08] Защита от спуфинга IP через `CF-Connecting-IP` и строгий `isValidIp`
- **Файл:** [security-config.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/security-config.js#L71-L100)
- **Было (в коде сейчас):**
  - В `isValidIp`: `/^[0-9a-fA-F:]{2,45}$/.test(s)` пропускает невалидные строки вроде `"::::"`.
  - В `resolveClientIp`: `cf-connecting-ip` проверяется раньше `x-forwarded-for` всегда, когда запрос пришёл от локального прокси (`127.0.0.1`).
- **План исправления:**
  1. Подключить `const net = require('net');` и в `isValidIp(str)` использовать `net.isIP(s) !== 0` (после снятия префикса `::ffff:`).
  2. В `resolveClientIp` учитывать `cf-connecting-ip` только если `process.env.TRUST_CLOUDFLARE === '1'`, иначе использовать `x-real-ip` и `x-forwarded-for`.

---

### 1.4. [MED-05] Исправление Loopback-проверки и `/metrics` за внутренним прокси uWS
- **Файлы:** [net-transport.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/net-transport.js#L430-L436), [editor-guard.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/editor-guard.js#L129-L136), [security-config.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/security-config.js#L153-L154)
- **Было (в коде сейчас):** `_proxyHttpRequest` всегда дописывает `headers['x-real-ip'] = remoteIp` и `headers['x-forwarded-for']`, а `EditorGuard.isLoopbackReq` и `SEC.metricsAuthorized` отклоняют любой запрос, где эти заголовки непустые.
- **План исправления:**
  В `_proxyHttpRequest` ([net-transport.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/net-transport.js#L430-L436)) не инжектить `x-real-ip` и `x-forwarded-for`, если сам клиент подключился к uWS напрямую с loopback-адреса (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) и не прислал этих заголовков снаружи.

---

## Этап 2. Авторизация, защита GM-доступа и конфигурация продакшена

### 2.1. [CRIT-02] Закрытие эскалации привилегий GM через `data/gm-access.json` и `GuestAuth`
- **Файлы:** [gm-access.json](file:///d:/games/yandex/лайнэйдж/project-steam1/data/gm-access.json#L16-L19), [guest-auth.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/guest-auth.js#L133-L137), [player-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/player-db.js#L172-L182)
- **Было (в коде сейчас):**
  1. В `data/gm-access.json` прописаны `"itest_gm": 100` и `"local_34b2a5845c92": 100`.
  2. В `GuestAuth.verifyGuestOwnership` проверка `!tofuAllowed()` выполняется только внутри `if (profiles.length > 0 && !tofuAllowed())`. Если профилей на диске/в БД ещё нет (`profiles.length === 0`), любой гость захватывает `local_34b2a5845c92` и получает права GM 100.
- **План исправления:**
  1. В `data/gm-access.json` очистить поле `"accounts": {}` (оставив только авторизацию по защищённому персонажу/кодовому слову или явному назначению на сервере).
  2. В `GuestAuth.verifyGuestOwnership` ([guest-auth.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/guest-auth.js#L133-L140)):
     - Проверять, имеет ли `yid` привилегии в `GMTool` (`GMTool.getAccountAccessLevel(yid) > 0`). Для привилегированных `yid` категорически запрещать первичную TOFU-привязку (`return { ok: false, reason: 'guest_tofu_disabled' }`), если `SEC.isProd() || !tofuAllowed()`.
     - Если `!tofuAllowed()`, блокировать захват существующих аккаунтов и привилегированных идентификаторов независимо от `profiles.length`.

---

### 2.2. [MED-04] Защита production-конфига в `ecosystem.config.js` и синхронизация `package-lock.json`
- **Файлы:** [ecosystem.config.js](file:///d:/games/yandex/лайнэйдж/project-steam1/ecosystem.config.js#L25), [ecosystem.config.js](file:///d:/games/yandex/лайнэйдж/project-steam1/ecosystem.config.js#L39-L40), [package-lock.json](file:///d:/games/yandex/лайнэйдж/project-steam1/package-lock.json)
- **Было (в коде сейчас):**
  ```javascript
  ALLOW_INSECURE_AUTH: process.env.ALLOW_INSECURE_AUTH || (process.env.YANDEX_APP_SECRET ? '0' : '1'),
  ```
- **План исправления:**
  1. В `ecosystem.config.js` установить `ALLOW_INSECURE_AUTH: process.env.ALLOW_INSECURE_AUTH || '0'`, чтобы в продакшене сервер не переключался молча в небезопасный режим при сбое чтения `.secrets.env`.
  2. Обновить `package-lock.json` (`npm install --package-lock-only`), чтобы зафиксировать `pg` и `uWebSockets.js`.

---

## Этап 3. Консистентность БД, сессий и реальная разгрузка Worker Threads

### 3.1. [HIGH-01] Устранение гонки `DB.save` vs `DB.load` при дисконнекте и быстром реконнекте
- **Файлы:** [db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/db.js#L141-L152), [db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/db.js#L449-L469), [disconnect-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/session/disconnect-manager.js#L173-L184)
- **Было (в коде сейчас):**
  - В `FileBackend.load(id, charId)` и `PgBackend.load(id, charId)` чтение выполняется сразу, не дожидаясь завершения `this.writeChains.get(key)`.
  - В `detachPlayer` игрок удаляется из `players` и `pidByYid` до завершения `await DB.save(p.yid, pr, p.charId)`.
- **План исправления:**
  1. В `FileBackend.load` и `PgBackend.load` перед чтением добавить:
     ```javascript
     const key = profileKey(id, charId);
     const pending = this.writeChains.get(key);
     if (pending) {
       try { await pending; } catch (_) {}
     }
     ```
  2. В `detachPlayer` ([disconnect-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/session/disconnect-manager.js#L173-L189)) добавлять `p.yid` в `loggingIn` (передав `loggingIn` в контекст `createDisconnectManager`) на время `await DB.save(...)` и снимать в `finally`, чтобы новый вход того же аккаунта гарантированно дождался окончания сохранения старой сессии.

---

### 3.2. [HIGH-02] Перенос `JSON.stringify` из главного потока в `persistence-worker.js`
- **Файлы:** [db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/db.js#L148-L155), [persistence-client.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/workers/persistence-client.js#L120-L128), [persistence-worker.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/workers/persistence-worker.js#L44-L48)
- **Было (в коде сейчас):**
  В `FileBackend.save` ([db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/db.js#L149)):
  ```javascript
  const json = JSON.stringify(data);
  if (this.useWorker && this.persistenceClient) {
    await this.persistenceClient.writeAtomic(file, { json });
  }
  ```
- **План исправления:**
  Если `this.useWorker && this.persistenceClient`, вызывать `await this.persistenceClient.writeAtomic(file, { payload: data })` без вызова `JSON.stringify(data)` в главном потоке — тогда `persistence-worker.js` выполнит `JSON.stringify(task.payload)` во втором потоке vCPU. Синхронный `JSON.stringify` оставить только в fallback-ветке, когда воркер отключён.

---

### 3.3. [HIGH-04] Блокировка параллельных запросов в `/api/chars/create` и `/api/chars/delete`
- **Файл:** [admin-api.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/http/admin-api.js#L440-L499)
- **План исправления:**
  В `handleCharsApiBody` после проверки `if (loggingIn.has(yid))` немедленно выполнять `loggingIn.add(yid)` и оборачивать тело обработки `create` и `delete` в `try { ... } finally { loggingIn.delete(yid); }`.

---

### 3.4. [MED-06] Защита от создания «зомби-игроков» при обрыве сокета во время `doLogin`
- **Файл:** [session-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/session/session-manager.js#L470-L490)
- **План исправления:**
  В `doLoginInner` сразу после завершения всех `await` (перед выделением `entityTransforms.allocate` и записью в `players.set(pid, p)`) проверять:
  ```javascript
  if (!ws || ws.readyState !== 1) {
    return;
  }
  ```

---

## Этап 4. Нативный C++ `NativeSpatialGrid`, `EntityTransformTable` и Кластерный режим

### 4.1. [HIGH-03] Синхронизация `EntityTransformTable` и фильтрация пустых слотов в C++ `NativeSpatialGrid`
- **Файлы:** [spatial_grid.h](file:///d:/games/yandex/лайнэйдж/project-steam1/native/src/spatial_grid.h#L79-L93), [server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L297-L311), [server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L2046-L2058), [death-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/death-handler.js), [player-regen-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/player-regen-handler.js)
- **Было (в коде сейчас):**
  1. В `native/src/spatial_grid.h:bulkInsert`:
     ```cpp
     int32_t type = static_cast<int32_t>(transformData[offset + 6]);
     int32_t id = int32Data[offset + 7];
     bool dead = (hp <= 0.0f);
     insert(id, type, x, z, hp, dead);
     ```
     Освобождённые слоты (`type == 0`) не пропускаются и вставляются в ячейки сетки каждый тик.
  2. `entityTransforms.updateHp` никогда не вызывается для игроков (при смерти, уроне, регене и воскрешении) и при получении урона мобами.
  3. В `rebuildServerSpots` (`server.js:305`) мобы удаляются через `mobs.delete(mid)` без `entityTransforms.free(m.transformSlot)`.
  4. В `recomputeAOI` (`server.js:2046`) при активном `nativeSpatialGrid` игнорируются `borderGhosts`.
- **План исправления:**
  1. В `native/src/spatial_grid.h:bulkInsert` добавить проверку:
     ```cpp
     int32_t type = static_cast<int32_t>(transformData[offset + 6]);
     if (type <= 0) continue;
     ```
     И пересобрать C++ аддон (`npx node-gyp rebuild`).
  2. В `tick()` ([server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L4534-L4545)) перед `nativeSpatialGrid.bulkInsert` синхронизировать актуальный `hp` (с учётом `pl.dead ? 0 : pl.hp`) и координаты в `entityTransforms` для живых/мёртвых игроков и активных мобов, а также вызывать `entityTransforms.updateHp` в `onPlayerDeath` и `doRevive`/`resurrectPlayer`.
  3. В `rebuildServerSpots` перед `mobs.delete(mid)` освобождать слот `if (entityTransforms && m.transformSlot >= 0) { entityTransforms.free(m.transformSlot); m.transformSlot = -1; }`.
  4. В `recomputeAOI` ([server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L2046-L2058)) при `IS_CLUSTER && borderGhosts.size > 0` обходить `borderGhosts` и передавать подходящих кандидатов в `_aoiOnPlayer`.

---

### 4.2. [CRIT-04, MED-01, MED-02] Починка кластерного удаления персонажей, `/api/status`, IPC и шардинга
- **Файлы:** [cluster-manager.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/cluster-manager.js), [server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L3465-L3501), [zone-sharding.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/zone-sharding.js#L65-L68)
- **План исправления:**
  1. **`CRIT-04` (`/api/chars/delete` и `/api/status` в кластере):**
     - В `MasterGateway` прокидывать агрегированное число игроков со всех воркеров в `admin-api.js` (для `/api/status`).
     - При вызове `/api/chars/delete` на шлюзе рассылать воркерам IPC-сообщение `char_delete_kick` (`{ yid, charId }`), чтобы воркер немедленно удалил игрока из `_dirtyProfiles` и отключил без перезаписи удалённого профиля в БД.
  2. **`MED-01` (Кластерный IPC в `server.js:3465-3501`):**
     - В `mod_sync` проверять `payload.action === 'banIp' || payload.action === 'ban_ip'`, а для закрытия сокета использовать `const ws = wsByPid.get(pl.pid); if (ws) ws.close(4003, 'banned');`.
     - Удалить дублирующий нерабочий блок `clusterIpc.on('account_key_sync')` из `server.js:3486` (так как рабочий обработчик уже зарегистрирован внутри `AccountKeys.setIpcHub`).
     - В `gm_sync` ставить `pl.gm = (payload.accessLevel >= 50)` и поддерживать поиск цели по имени персонажа (`payload.target`).
  3. **`MED-02` (`shared/zone-sharding.js:65-68`):**
     - Исправить определение текущей зоны в `getZoneAt(x, z, currentZoneOrWorker)`:
       - Если передано число `1..4` (1-based `workerId`), сопоставлять `1 -> Town`, `2 -> East`, `3 -> West`, `4 -> North` без пересечения с 0-based индексами.

---

## Этап 5. Экономика, Заточка (`+N`) и Боевая система

### 5.1. [CRIT-03] Закрытие дюпа заточки `+N` при подборе лута с земли и сдаче квестов
- **Файлы:** [server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L1546-L1559), [quest-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/quest-handler.js#L190)
- **Было (в коде сейчас):**
  ```javascript
  if ((L.plus | 0) > 0) {
    if (!NPCS.plusMoveOk(recipient.inv, recipient.plusById, L.itemId, L.plus | 0)) { ... }
  }
  grantLootToPlayer(recipient, L.itemId, L.count);
  ```
- **План исправления:**
  1. В `doLootPickup` ([server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L1546)) вызывать `NPCS.plusMoveOk(recipient.inv, recipient.plusById, L.itemId, L.plus | 0)` **всегда** (и при `L.plus === 0`, и при `L.plus > 0`). Если у получателя в сумке уже лежит заточенный экземпляр этого же предмета (`plusById[itemId] > 0`), а поднимаемый имеет другой `+`, блокировать подбор с понятным сообщением («В сумке уже есть этот предмет с другой заточкой — уберите его на склад»).
  2. В `doQuestComplete` ([quest-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/quest-handler.js#L190)) перед начислением наградных предметов проверять `canCarryMore` и `NPCS.plusMoveOk(p.inv, p.plusById, itemId, 0)`.

---

### 5.2. [HIGH-05] Валидация боевого слота и типа/грейда свитка в `enchant-handler.js`
- **Файл:** [enchant-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/enchant-handler.js#L20-L60)
- **План исправления:**
  1. Разрешать заточку только для боевых слотов экипировки (`weapon`, `shield`, `head`/`helmet`, `chest`, `legs`, `gloves`/`hands`, `feet`/`boots`, `necklace`, `earring_l`, `earring_r`, `ring_l`, `ring_r`), явно отклоняя `title`, `costume`, `bracelet` и классовые приборы (`reason: 'not_enchantable'`).
  2. Проверять соответствие свитка (`msg.scrollId` или доступного свитка в `p.inv`) грейду предмета (`tpl.grade`) и типу (`weapon` vs `armor`), сохраняя поддержку `pressure_amplifier` как универсального/базового усилителя там, где профильный грейдовый свиток не требуется.

---

### 5.3. [HIGH-09] Защита от сгорания валюты выше `MAX_CURRENCY_CAP`
- **Файлы:** [store-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/store-handler.js#L180-L195), [npc-services-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/npc-services-handler.js#L155-L170)
- **План исправления:**
  Перед проведением сделки в `doStoreDeal` и `doShopSell` проверять `if (currencyOf(moneyReceiver) + total > 2147483647)`, и если лимит превышается — отменять сделку с `reason: 'currency_cap'` до списания вещей.

---

### 5.4. [HIGH-06, MED-07, LOW-01..04] Исправления в боевой системе и обработчиках
- **Файлы:** [skill-caster.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/combat/skill-caster.js), [mob-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/mob-handler.js), [gm-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/gm-handler.js), [server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js)
- **План исправления:**
  1. **`skill-caster.js` (`HIGH-06`):**
     - На строке 657 заменить `if (baseCastSec > 0.05)` на `if (castSec > 0.05)`, чтобы скиллы, ускоренные баффами/WIT до мгновенного каста (`castSec <= 0.05`), не падали с `no_cast`.
     - Перенести списание соски (`consumeArmedShot`) внутрь веток подтверждённого попадания по валидной цели (после проверок `target`, `range`, `los`, `peace`), чтобы соски не сгорали при ошибке каста.
     - В ветке `if (tpl.target === 'aoe')` добавить поражение вражеских игроков в радиусе `radius` (с исключением сопартийцев, соклановцев, мирной зоны и синтетических ботов).
  2. **`gm-handler.js` (`LOW-01`):** В `//oneshot` при убийстве игрока вызывать `onPvpLethal(tgt, p)` (или `onPlayerDeath`), чтобы жертва получала пакет `you_died` и могла воскреснуть.
  3. **`mob-handler.js` (`LOW-02`):** На строке 783 после `pushEffects(tgt)` добавить `if (typeof deps.pushCombatStats === 'function') deps.pushCombatStats(tgt);`.
  4. **`server.js` и `editor-guard.js` (`MED-07`, `LOW-03`):**
     - Сбрасывать `elHistogram.reset()` каждые 10 секунд, чтобы старые пики не раздували `moveBudget` навсегда.
     - Удалить дублирующий `ws.on('pong')` на строке 5338 в `server.js`.
     - Добавить очистку просроченных токенов в `EditorGuard`.

---

## Этап 6. Починка Watchdog, деплой-скриптов и финальная верификация

### 6.1. [CRIT-05] Исправление имени процесса PM2 в `scripts/watchdog.js`
- **Файл:** [watchdog.js](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/watchdog.js#L96)
- **Было (в коде сейчас):**
  ```javascript
  exec('pm2 restart project-steam-mmo --update-env', (err, stdout, stderr) => {
  ```
- **Станет:**
  ```javascript
  const PM2_APP_NAME = process.env.PM2_APP_NAME || 'project-steam';
  exec(`pm2 restart ${PM2_APP_NAME} --update-env`, (err, stdout, stderr) => {
  ```

---

### 6.2. [MED-03] Выравнивание `scripts/sync-client-vps.js` и `scripts/auto-deploy-all.js`
- **Файлы:** [sync-client-vps.js](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/sync-client-vps.js), [auto-deploy-all.js](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/auto-deploy-all.js)
- **План исправления:**
  1. В `sync-client-vps.js` добавить обязательный пред-прогон `node scripts/guard-anti-rollback.js` и убрать из архива `client/css` и `client/*.html` (так как VPS является выделенным бэкендом с `SERVE_CLIENT=0`).
  2. В `auto-deploy-all.js` проверять затронутые файлы сервера как по `git status --porcelain`, так и по `git diff --name-only origin/main..HEAD`, чтобы даже после предварительного локального коммита изменения в `server/` или `native/` гарантированно вызывали полный `deploy-vps.js` со сборкой `node-gyp`.

---

### 6.3. Порядок тестирования и приёмки
1. Сборка нативного C++ модуля: `npx node-gyp rebuild`.
2. Проверка всех 22 архитектурных инвариантов: `node scripts/guard-anti-rollback.js`.
3. Добавление регрессионных тестов на все исправленные пункты (`CRIT-01..05`, `HIGH-01..09`, `MED-01..07`, `LOW-01..04`) и прогон полного набора `node tests/run.js` (100% зелёный результат).
4. Сборка клиента и деплой на боевой сервер по протоколу `AGENTS.md`.

