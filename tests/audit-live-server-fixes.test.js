// ============================================================
//  TESTS / AUDIT-LIVE-SERVER-FIXES.TEST.JS
//  Регрессии живого аудита сервера:
//   HIGH-1  — ревизия saveRev: устаревший снимок профиля не затирает свежий
//             (handoff между воркерами больше не даёт дюп/откат);
//   HIGH-2  — кластер на файловой БД только с явным opt-in;
//   MEDIUM-1 — мастер-шлюз не присваивает getter-свойствам UwsSocketWrapper;
//   MEDIUM-2 — GM-права не применяются по совпадению имени;
//   MEDIUM-3 — префикс itest_ не даёт dev-возможностей вне insecure dev.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TMP_DIR = path.join(ROOT, 'data', 'test_audit_live_tmp');

function withEnv(patch, fn) {
  const saved = {};
  for (const k of Object.keys(patch)) {
    saved[k] = process.env[k];
    if (patch[k] == null) delete process.env[k];
    else process.env[k] = patch[k];
  }
  const restore = () => {
    for (const k of Object.keys(saved)) {
      if (saved[k] == null) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(restore);
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

module.exports = async function (t) {
  await fs.promises.mkdir(TMP_DIR, { recursive: true });

  // ---------------------------------------------------------------
  t.suite('HIGH-1: profileOf ставит монотонную ревизию saveRev');
  const playerCore = require('../server/core/player.js');
  const { Player, profileOf } = playerCore;
  const p = new Player(9001, 'local_auditrev01', { name: 'RevTester', level: 3, saveRev: 41, inv: { copper_parts: 10 } }, { charId: 'c0' });
  t.eq(p._saveRev, 41, 'Player берёт ревизию из загруженного профиля');
  const s1 = profileOf(p);
  const s2 = profileOf(p);
  t.eq(s1.saveRev, 42, 'первый снимок — следующая ревизия');
  t.ok(s2.saveRev > s1.saveRev, 'каждый следующий снимок получает ревизию выше');
  const adopted = new Player(9001, 'local_auditrev01', s2, { charId: 'c0' });
  t.ok(profileOf(adopted).saveRev > s2.saveRev, 'воркер-получатель продолжает ревизию выше переданной');
  const fresh = new Player(9002, 'local_auditrev02', { name: 'Fresh' }, { charId: 'c0' });
  t.eq(profileOf(fresh).saveRev, 1, 'профиль без ревизии начинает с 1');

  // ---------------------------------------------------------------
  t.suite('HIGH-1: persistence-worker отклоняет снимок старее, чем на диске');
  const { defaultClient, PersistenceClient } = require('../server/workers/persistence-client.js');
  const wf = path.join(TMP_DIR, 'rev_worker.json');
  try { fs.unlinkSync(wf); } catch (_) { }
  await defaultClient.writeAtomic(wf, { payload: { saveRev: 10, item: 'new' }, label: 'rev10', rev: 10 });
  const stale = await defaultClient.writeAtomic(wf, { payload: { saveRev: 7, item: 'stale' }, label: 'rev7', rev: 7 });
  t.ok(stale && stale.ok, 'устаревшая запись завершается без ошибки');
  t.eq(stale && stale.skipped, 'stale_rev', 'устаревшая запись помечена skipped=stale_rev');
  t.eq(JSON.parse(fs.readFileSync(wf, 'utf8')).item, 'new', 'на диске остался свежий снимок');
  await defaultClient.writeAtomic(wf, { payload: { saveRev: 10, item: 'same' }, label: 'rev10b', rev: 10 });
  t.eq(JSON.parse(fs.readFileSync(wf, 'utf8')).item, 'same', 'та же ревизия принимается (повторная запись того же снимка)');
  await defaultClient.writeAtomic(wf, { payload: { saveRev: 11, item: 'newer' }, label: 'rev11', rev: 11 });
  t.eq(JSON.parse(fs.readFileSync(wf, 'utf8')).item, 'newer', 'более новая ревизия записывается');
  await defaultClient.writeAtomic(wf, { payload: { item: 'norev' }, label: 'norev' });
  t.eq(JSON.parse(fs.readFileSync(wf, 'utf8')).item, 'norev', 'запись без ревизии работает как раньше');
  const leftovers = fs.readdirSync(TMP_DIR).filter((f) => f.startsWith('rev_worker.json.tmp'));
  t.eq(leftovers.length, 0, 'отклонённая запись не оставляет tmp-файлов');

  t.suite('HIGH-1: inline-фоллбэк (без Worker Thread) отклоняет устаревший снимок');
  const inline = new PersistenceClient({ disabled: true });
  const inf = path.join(TMP_DIR, 'rev_inline.json');
  try { fs.unlinkSync(inf); } catch (_) { }
  await inline.writeAtomic(inf, { payload: { saveRev: 5, item: 'new' }, rev: 5 });
  const inStale = await inline.writeAtomic(inf, { payload: { saveRev: 4, item: 'stale' }, rev: 4 });
  t.eq(inStale && inStale.skipped, 'stale_rev', 'inline: устаревшая запись отклонена');
  t.eq(JSON.parse(fs.readFileSync(inf, 'utf8')).item, 'new', 'inline: на диске свежий снимок');

  t.suite('HIGH-1: DB.save (file) — сценарий handoff: старый воркер пишет позже нового');
  const DB = require('../server/db.js');
  if (DB.MODE === 'file') {
    const yid = 'local_auditrevdb' + Date.now().toString(36);
    const src = new Player(9100, yid, { name: 'HandoffSrc', inv: { rare_gear: 1 } }, { charId: 'c0' });
    const staleSnap = profileOf(src);                 // снимок старого воркера (предмет ещё есть)
    const shipped = profileOf(src);                   // снимок, ушедший получателю
    const dst = new Player(9100, yid, shipped, { charId: 'c0' });
    delete dst.inv.rare_gear;                         // на новом воркере предмет отдан в трейде
    await DB.save(yid, profileOf(dst), 'c0');         // новый воркер сохранил
    await DB.save(yid, staleSnap, 'c0');              // запоздалая запись старого воркера
    const onDisk = await DB.load(yid, 'c0');
    t.ok(onDisk && !(onDisk.inv && onDisk.inv.rare_gear), 'запоздалый снимок старого воркера не вернул отданный предмет (нет дюпа)');
    try { await DB.removeChar(yid, 'c0'); } catch (_) { }
  } else {
    t.ok(true, 'DB не в file-режиме — сценарий пропущен');
  }

  t.suite('HIGH-1: Postgres UPSERT профиля защищён проверкой saveRev');
  const queries = [];
  const mockPool = {
    query: async (sql, params) => { queries.push({ sql: String(sql), params }); return { rows: [] }; },
    connect: async () => ({
      query: async (sql, params) => { queries.push({ sql: String(sql), params }); return { rows: [] }; },
      release: () => { }
    }),
    on: () => { }
  };
  const pg = DB.createPgBackend(mockPool);
  pg.useWorker = false;
  await pg.save('local_pgrev', { saveRev: 3, name: 'X' }, 'c0');
  await pg.saveBatch([{ yid: 'local_pgrev2', data: { saveRev: 2, name: 'Y' }, charId: 'c0' }]);
  const single = queries.find((q) => q.sql.startsWith('INSERT INTO profiles(yid, data, updated)'));
  const batch = queries.find((q) => q.sql.includes('UNNEST($1::text[], $2::text[])'));
  t.ok(single && single.sql.includes("saveRev") && single.sql.includes('WHERE'), 'одиночный save содержит условие по saveRev');
  t.ok(batch && batch.sql.includes("saveRev") && batch.sql.includes('WHERE'), 'батч saveBatch содержит условие по saveRev');

  // ---------------------------------------------------------------
  t.suite('HIGH-2: 4 воркера на файловой БД — через мастер-писателя; без прокси — 1 воркер');
  const { resolveWorkerCount } = require('../server/cluster-manager.js');
  t.eq(resolveWorkerCount('4', { DB: 'file' }).count, 4, 'DB=file + прокси (по умолчанию) → 4 воркера');
  t.ok(resolveWorkerCount('4', { DB: 'file' }).fileProxy, 'режим мастера-писателя отмечен флагом fileProxy');
  t.eq(resolveWorkerCount('4', {}).count, 4, 'DB не задан (file по умолчанию) → 4 воркера через прокси');
  t.eq(resolveWorkerCount('4', { DB: 'file', CLUSTER_FILE_DB_PROXY: '0' }).count, 1, 'прокси выключен → 1 воркер');
  t.ok(resolveWorkerCount('4', { DB: 'file', CLUSTER_FILE_DB_PROXY: '0' }).downgraded, 'понижение отмечено флагом downgraded');
  t.eq(resolveWorkerCount('4', { DB: 'file', CLUSTER_FILE_DB_PROXY: '0', ALLOW_FILE_DB_CLUSTER: '1' }).count, 4, 'явный ALLOW_FILE_DB_CLUSTER=1 без прокси оставляет 4');
  t.eq(resolveWorkerCount('4', { DB: 'postgres' }).count, 4, 'DB=postgres → 4 воркера');
  t.throws(() => DB.assertProductionDatabase({ env: 'production', mode: 'file', clusterWorkers: 4, allowFileInProd: true, clusterFileProxy: false }),
    'без прокси ALLOW_FILE_DB_IN_PROD не разрешает кластер на файлах');
  t.noThrow(() => DB.assertProductionDatabase({ env: 'production', mode: 'file', clusterWorkers: 4, allowFileInProd: true, clusterFileProxy: true }),
    'с мастером-писателем кластер на файлах разрешён');
  t.noThrow(() => DB.assertProductionDatabase({ env: 'production', mode: 'file', clusterWorkers: 1, allowFileInProd: true, clusterFileProxy: false }),
    'один воркер на файлах в проде разрешён и без прокси');
  const eco = fs.readFileSync(path.join(ROOT, 'ecosystem.config.js'), 'utf8');
  t.ok(/CLUSTER_WORKERS:\s*process\.env\.CLUSTER_WORKERS\s*\|\|\s*'4'/.test(eco), 'ecosystem.config.js: 4 воркера по умолчанию');
  t.ok(/CLUSTER_FILE_DB_PROXY:\s*process\.env\.CLUSTER_FILE_DB_PROXY\s*\|\|\s*'1'/.test(eco), 'ecosystem.config.js: мастер-писатель включён');

  // ---------------------------------------------------------------
  t.suite('HIGH-2: воркер кластера пишет и читает файловую БД через мастер');
  if (DB.MODE === 'file' && typeof DB.attachClusterIpc === 'function') {
    const IPC = require('../server/ipc-hub.js');
    // «Мастер» — отдельный экземпляр db.js (как отдельный процесс): своя очередь writeChains.
    const dbPath = require.resolve('../server/db.js');
    const cachedDb = require.cache[dbPath];
    delete require.cache[dbPath];
    const MasterDB = require('../server/db.js');
    require.cache[dbPath] = cachedDb;
    const masterCalls = [];
    let hubMode = 'master';
    const fakeHub = {
      // имитация IPC: запрос асинхронно исполняет «мастер» (обработчик того же модуля db.js)
      dbRequest(op, args) {
        masterCalls.push(op);
        if (hubMode === 'down') {
          const e = new Error('no ipc channel'); e.remote = false;
          return Promise.reject(e);
        }
        if (hubMode === 'corrupt' && op === 'loadProfile') {
          const e = new Error('profile corrupted: x'); e.remote = true;
          return Promise.reject(e);
        }
        return new Promise((resolve, reject) => setImmediate(() => MasterDB.handleClusterDbRequest(op, args).then(resolve, reject)));
      }
    };
    await withEnv({ IS_CLUSTER_WORKER: '1', CLUSTER_FILE_DB_PROXY: '1' }, async () => {
      DB.attachClusterIpc(fakeHub);
      try {
        t.ok(DB.isClusterProxyActive(), 'прокси активен в воркере кластера на DB=file');
        const yid = 'local_auditproxy' + Date.now().toString(36);
        await DB.save(yid, { name: 'ProxyGuy', saveRev: 5, level: 2 }, 'c0');
        t.ok(masterCalls.includes('saveProfile'), 'сохранение ушло в мастер (saveProfile)');
        const loaded = await DB.load(yid, 'c0');
        t.ok(masterCalls.includes('loadProfile') && loaded && loaded.level === 2, 'загрузка идёт через мастер и видит запись');
        const listed = await DB.listChars(yid);
        t.ok(masterCalls.includes('listChars') && listed.length === 1, 'список персонажей — через мастер');

        // Два «воркера» шлют снимки одного профиля: устаревший приходит в мастер последним.
        await MasterDB.handleClusterDbRequest('saveProfile', [yid, { name: 'ProxyGuy', saveRev: 9, level: 9 }, 'c0']);
        await MasterDB.handleClusterDbRequest('saveProfile', [yid, { name: 'ProxyGuy', saveRev: 7, level: 7 }, 'c0']);
        t.eq((await DB.load(yid, 'c0')).level, 9, 'запоздалый снимок другого воркера не затёр свежий');

        // Пачка сохранений подряд: пишется только самый свежий снимок (коалесинг очереди мастера).
        const before = masterCalls.length;
        const burst = [];
        for (let r = 10; r <= 15; r++) burst.push(DB.save(yid, { name: 'ProxyGuy', saveRev: r, level: r }, 'c0'));
        await Promise.all(burst);
        const sent = masterCalls.length - before;
        t.ok(sent < 6, 'серия сохранений склеена (отправлено в мастер ' + sent + ' из 6)');
        t.eq((await DB.load(yid, 'c0')).level, 15, 'на диске последний снимок серии');

        // Мастер недоступен → локальный фоллбэк с проверкой ревизии.
        hubMode = 'down';
        await DB.save(yid, { name: 'ProxyGuy', saveRev: 20, level: 20 }, 'c0');
        hubMode = 'master';
        t.eq((await DB.load(yid, 'c0')).level, 20, 'при недоступном мастере запись выполнена локально');

        // Ошибка бэкенда мастера (битый профиль) не глушится фоллбэком.
        hubMode = 'corrupt';
        let threw = false;
        try { await DB.load(yid, 'c0'); } catch (e) { threw = /corrupted/.test(e.message); }
        hubMode = 'master';
        t.ok(threw, 'ошибка «профиль повреждён» из мастера доходит до вызывающего');

        await DB.removeChar(yid, 'c0');
        t.eq((await DB.listChars(yid)).length, 0, 'удаление персонажа — через мастер');
      } finally {
        DB.attachClusterIpc(null);
      }
    });
    t.ok(!DB.isClusterProxyActive(), 'вне воркера кластера прокси выключен');

    t.suite('HIGH-2: IPC-канал запросов к БД (мастер ↔ воркер)');
    const EventEmitter = require('events');
    const primary = new IPC.IpcHub({ isPrimary: true });
    const fakeWorker = new EventEmitter();
    const toWorker = [];
    fakeWorker.send = (m, cb) => { toWorker.push(m); if (cb) cb(); return true; };
    fakeWorker.isConnected = () => true;
    primary.registerWorker(3, fakeWorker);
    primary.setDbRequestHandler(async (op, args) => ({ op, n: args.length }));
    primary._handleWorkerMessage(3, { ipcType: IPC.MSG_DB_REQ, payload: { reqId: 'r1', op: 'loadProfile', args: ['a', 'b'] } });
    await new Promise((r) => setImmediate(r));
    const res = toWorker.find((m) => m.ipcType === IPC.MSG_DB_RES);
    t.ok(res && res.payload.reqId === 'r1' && res.payload.ok && res.payload.result.n === 2, 'мастер исполнил запрос и ответил воркеру');
    primary.setDbRequestHandler(async () => { const e = new Error('boom'); e.code = 'EBOOM'; throw e; });
    primary._handleWorkerMessage(3, { ipcType: IPC.MSG_DB_REQ, payload: { reqId: 'r2', op: 'saveProfile', args: [] } });
    await new Promise((r) => setImmediate(r));
    const resErr = toWorker.find((m) => m.ipcType === IPC.MSG_DB_RES && m.payload.reqId === 'r2');
    t.ok(resErr && !resErr.payload.ok && resErr.payload.code === 'EBOOM', 'ошибка бэкенда передаётся воркеру с кодом');

    const workerHub = new IPC.IpcHub({ isPrimary: false, workerId: 3 });
    let pendingErr = null;
    const pending = new Promise((resolve) => {
      workerHub._pendingDbReqs.set('w1', { timer: setTimeout(() => { }, 1), resolve, reject: (e) => { pendingErr = e; resolve(null); } });
    });
    workerHub._handleDbRes({ reqId: 'w1', ok: false, error: 'profile corrupted', code: 'X' });
    await pending;
    t.ok(pendingErr && pendingErr.remote === true, 'ошибка из мастера помечена remote (без локального фоллбэка)');
    if (typeof process.send !== 'function') {
      let noIpc = null;
      try { await workerHub.dbRequest('loadProfile', []); } catch (e) { noIpc = e; }
      t.ok(noIpc && noIpc.remote === false, 'без IPC-канала запрос отклоняется как транспортный (будет локальный фоллбэк)');
    }
  } else {
    t.ok(true, 'DB не в file-режиме — проверки прокси пропущены');
  }

  // ---------------------------------------------------------------
  t.suite('MEDIUM-1: мастер-шлюз не присваивает getter-свойствам UwsSocketWrapper');
  const cmSrc = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
  t.ok(!/wrapper\.isStressAllowed\s*=/.test(cmSrc), 'нет присваивания wrapper.isStressAllowed');
  t.ok(!/wrapper\.stressKey\s*=/.test(cmSrc), 'нет присваивания wrapper.stressKey');
  t.ok(/process\.on\('uncaughtException'/.test(cmSrc), 'у мастера есть обработчик uncaughtException');
  const NT = require('../server/net-transport.js');
  const fakeRaw = { _u: { isStressAllowed: true, stressKey: 'k1', clientIp: '1.2.3.4' }, getUserData() { return this._u; } };
  let wrapper = null;
  t.noThrow(() => { wrapper = new NT.UwsSocketWrapper(fakeRaw, null); }, 'обёртка создаётся без исключения');
  t.ok(wrapper && wrapper.isStressAllowed === true && wrapper.stressKey === 'k1', 'stress-флаги читаются из userData');

  // ---------------------------------------------------------------
  t.suite('MEDIUM-2: смена GM-прав не задевает игрока с тем же именем и другим yid');
  const PlayerDb = require('../server/player-db.js');
  const createHttpRouter = require('../server/http/admin-api.js');
  const owner = { pid: 1, yid: 'local_gmowner01', name: 'SameName', accessLevel: 0, skills: {}, applyClassStats() { } };
  const impostor = { pid: 2, yid: 'local_impostor1', name: 'samename', accessLevel: 0, skills: {}, applyClassStats() { } };
  const routerPlayers = new Map([[1, owner], [2, impostor]]);
  const router = createHttpRouter({
    getLastTickAt: () => Date.now(), metricsPayload: () => ({}), worldTimePayload: () => ({}), buildLeaderboard: () => [],
    players: routerPlayers, pidByYid: new Map(), wsByPid: new Map(), loggingIn: new Set(),
    lbTouch: () => { }, lbDrop: () => { }, clanLeaveOnCharDelete: async () => ({ ok: true }),
    send: () => { }, detachPlayer: async () => { }, kickYid: () => false,
    isGM: (pl) => (pl.accessLevel | 0) >= 50, rebuildServerSpots: () => { },
    sanitizeCharName: (n) => n, isBadKey: () => false,
    YANDEX_SECRET: '', EDITOR_ENABLED: false, CLIENT_DIR: path.join(ROOT, 'client'), SHARED_DIR: path.join(ROOT, 'shared')
  });
  const origOnGm = PlayerDb.onGmChanged;
  let gmCb = null;
  PlayerDb.onGmChanged = (cb) => { gmCb = cb; };
  try { router.setupGmChangeListener(); } finally { PlayerDb.onGmChanged = origOnGm; }
  t.ok(typeof gmCb === 'function', 'обработчик смены GM зарегистрирован');
  if (gmCb) gmCb({ yid: 'local_gmowner01', name: 'SameName', accessLevel: 100 });
  t.eq(owner.accessLevel, 100, 'владелец аккаунта получил права');
  t.eq(impostor.accessLevel, 0, 'игрок с тем же именем и другим yid прав НЕ получил');
  const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  const gmSyncBlock = srvSrc.slice(srvSrc.indexOf("clusterIpc.on('gm_sync'"), srvSrc.indexOf("clusterIpc.on('char_delete_kick'"));
  t.ok(gmSyncBlock.length > 0 && !/matchName/.test(gmSyncBlock), 'gm_sync на воркерах не сравнивает имена');

  // ---------------------------------------------------------------
  t.suite('MEDIUM-3: itest_ не даёт dev-возможностей вне insecure dev');
  const createEnchantHandler = require('../server/handlers/enchant-handler.js');
  const mkEnchanter = (msgs) => createEnchantHandler({
    send: (_p, m) => msgs.push(m), checkRate: () => true, isBadKey: () => false,
    pushCombatStats: () => { }, pushWeight: () => { }, saveProfileNow: () => { },
    invCount: (pl, id) => (pl.inv[id] | 0), canCarryMore: () => ({ ok: true }), spawnGroundLoot: () => null
  });
  const mkItestPlayer = () => ({
    pid: 7, yid: 'itest_enchanter', dev: false, dead: false, hp: 100,
    inv: { pressure_amplifier: 1 }, equip: { weapon: { id: 'revolution_sword', templateId: 'revolution_sword', plus: 0 } }
  });
  await withEnv({ NODE_ENV: 'production' }, () => {
    const msgs = [];
    const pl = mkItestPlayer();
    mkEnchanter(msgs).doEnchant(pl, { slot: 'weapon' });
    t.eq(pl.inv.pressure_amplifier, 1, 'production: itest_ не может точить D-грейд обычным усилителем');
  });
  await withEnv({ NODE_ENV: 'test', ALLOW_INSECURE_DEV: '1' }, () => {
    const msgs = [];
    const pl = mkItestPlayer();
    mkEnchanter(msgs).doEnchant(pl, { slot: 'weapon' });
    t.ok(!(pl.inv.pressure_amplifier > 0), 'insecure dev: тестовый обход для itest_ сохранён');
  });
  const smSrc = fs.readFileSync(path.join(ROOT, 'server', 'session', 'session-manager.js'), 'utf8');
  t.ok(/const isDevSession = SEC\.insecureDev\(\) && \(/.test(smSrc), 'dev-сессия целиком под SEC.insecureDev()');

  // ---------------------------------------------------------------
  t.suite('HIGH-1: handoff блокирует запись устаревшей копии игрока');
  const hoBlock = srvSrc.slice(srvSrc.indexOf('function initiateClusterHandoff'), srvSrc.indexOf('function adoptClusterHandoff'));
  t.ok(/p\._handedOff = true/.test(hoBlock), 'initiateClusterHandoff помечает объект как переданный');
  t.ok(hoBlock.indexOf('saveProfileNow(p)') >= 0 && hoBlock.indexOf('saveProfileNow(p)') < hoBlock.indexOf('const pr = profileOf(p)'),
    'профиль сохраняется до снимка для получателя');
  const saveNowBlock = srvSrc.slice(srvSrc.indexOf('function saveProfileNow'), srvSrc.indexOf('function flushDirtyProfiles'));
  t.ok(/if \(p\._handedOff\) return;/.test(saveNowBlock), 'saveProfileNow не пишет переданную копию');

  try { await fs.promises.rm(TMP_DIR, { recursive: true, force: true }); } catch (_) { }
};
