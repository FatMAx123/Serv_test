// ============================================================
//  TESTS / P2-SECURITY-WORKERS-ANTICHEAT.TEST.JS
//  Тесты P2: Сетевая безопасность, Auth/Admin API, AccountKeyManager,
//  Worker Threads, PostgreSQL saveBatch/PlayerDb, античит движения и фильтр трупа.
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const SEC = require('../server/security-config.js');
const AUTH = require('../server/auth.js');
const AccountKeys = require('../server/account-keys.js');
const DB = require('../server/db.js');
const PlayerDb = require('../server/player-db.js');
const EditorGuard = require('../server/editor-guard.js');
const createHttpRouter = require('../server/http/admin-api.js');
const { PersistenceClient } = require('../server/workers/persistence-client.js');
const createMovementHandler = require('../server/handlers/movement-handler.js');
const { createQuestHandler } = require('../server/handlers/quest-handler.js');
const createItemUseHandler = require('../server/handlers/item-use-handler.js');
const G = require('../shared/game-rules.js');
const COS = require('../shared/cosmetics-db.js');
const QD = require('../shared/quest-db.js');
const NPCS = require('../shared/npc-services.js');
const EXP = require('../shared/l2-exp-table.js');
const WM = require('../shared/world-metrics.js');

module.exports = async function (t) {
  const gmAccessPath = path.join(__dirname, '../data/gm-access.json');
  const charsPath = path.join(__dirname, '../data/characters.json');
  const savedGmAccess = fs.existsSync(gmAccessPath) ? fs.readFileSync(gmAccessPath, 'utf8') : null;
  const savedChars = fs.existsSync(charsPath) ? fs.readFileSync(charsPath, 'utf8') : null;
  try {
  // ============================================================
  // 1. resolveClientIp: защита от спуфинга с приватных IP и приоритет CF-Connecting-IP
  // ============================================================
  t.suite('P2-1: resolveClientIp (ограничение isPrivateIp и приоритет CF-Connecting-IP)');
  {
    const savedTrustProxy = process.env.TRUST_PROXY;
    const savedTrustCf = process.env.TRUST_CLOUDFLARE;
    const savedTrustReal = process.env.TRUST_REAL_IP;
    try {
      delete process.env.TRUST_PROXY;
      delete process.env.TRUST_CLOUDFLARE;
      delete process.env.TRUST_REAL_IP;

      // Приватный IP без TRUST_PROXY=1 больше не считается доверенным прокси по умолчанию
      const lanSpoof = SEC.resolveClientIp('10.0.0.45', (h) => {
        if (h === 'x-real-ip') return '1.2.3.4';
        if (h === 'x-forwarded-for') return '1.2.3.4';
        return '';
      });
      t.eq(lanSpoof, '10.0.0.45', 'приватный IP без TRUST_PROXY=1 не может подделать X-Real-IP / X-Forwarded-For');

      // При TRUST_CLOUDFLARE=1 заголовок CF-Connecting-IP проверяется ДО X-Real-IP
      process.env.TRUST_CLOUDFLARE = '1';
      const cfBeforeReal = SEC.resolveClientIp('127.0.0.1', (h) => {
        if (h === 'x-real-ip') return '172.68.10.1'; // IP ноды Cloudflare от Nginx
        if (h === 'cf-connecting-ip') return '203.0.113.88'; // реальный IP игрока
        return '';
      });
      t.eq(cfBeforeReal, '203.0.113.88', 'при TRUST_CLOUDFLARE=1 CF-Connecting-IP имеет приоритет над X-Real-IP');
    } finally {
      if (savedTrustProxy === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = savedTrustProxy;
      if (savedTrustCf === undefined) delete process.env.TRUST_CLOUDFLARE;
      else process.env.TRUST_CLOUDFLARE = savedTrustCf;
      if (savedTrustReal === undefined) delete process.env.TRUST_REAL_IP;
      else process.env.TRUST_REAL_IP = savedTrustReal;
    }
  }

  // ============================================================
  // 2. admin-api.js: checkSignatureReplay + oldCode в /api/auth/set-codeword,
  //    Buffer.concat в POST /api/admin/gm и полный сброс GM в setupGmChangeListener
  // ============================================================
  t.suite('P2-2: admin-api.js (set-codeword replay/oldCode, Buffer.concat, setupGmChangeListener)');
  {
    const adminCode = fs.readFileSync(path.join(__dirname, '../server/http/admin-api.js'), 'utf8');
    t.ok(adminCode.includes('checkSignatureReplay'), 'admin-api.js проверяет checkSignatureReplay для подписанных запросов');
    t.ok(adminCode.includes('Buffer.concat(chunks)'), 'POST /api/admin/gm использует Buffer.concat(chunks)');
    t.ok(adminCode.includes('EditorGuard.revokePid(p.pid)'), 'setupGmChangeListener отзывает токен редактора при снятии GM');

    await AccountKeys.resetForTesting();
    const yandexSecret = 'test_yandex_secret_p2_32bytes_long_key';
    const testYid = 'ya_user_p2_test';
    const makeSignedPayload = (yid, nonce) => {
      const raw = Buffer.from(JSON.stringify({
        uniqueID: yid,
        publicName: 'Tester',
        issuedAt: Date.now(),
        nonce
      }), 'utf8').toString('base64url');
      const sig = crypto.createHmac('sha256', yandexSecret).update(raw).digest('base64url');
      return { data: raw, signature: sig };
    };

    const playersMap = new Map();
    const sentPackets = [];
    const router = createHttpRouter({
      getLastTickAt: () => Date.now(),
      metricsPayload: () => ({}),
      worldTimePayload: () => ({}),
      buildLeaderboard: () => [],
      players: playersMap,
      pidByYid: new Map(),
      wsByPid: new Map(),
      loggingIn: new Set(),
      lbTouch: () => { },
      lbDrop: () => { },
      clanLeaveOnCharDelete: () => ({ ok: true }),
      send: (p, msg) => sentPackets.push({ pid: p.pid, msg }),
      detachPlayer: async () => { },
      kickYid: () => { },
      isGM: (p) => (p.accessLevel | 0) >= 50,
      rebuildServerSpots: () => { },
      sanitizeCharName: (s) => String(s || '').trim(),
      isBadKey: () => false,
      YANDEX_SECRET: yandexSecret,
      EDITOR_ENABLED: false,
      CLIENT_DIR: path.join(__dirname, '../client'),
      SHARED_DIR: path.join(__dirname, '../shared')
    });
    router.setupGmChangeListener();

    // Симулируем HTTP-вызов /api/auth/set-codeword через handleRequest
    const invokeAuthPost = (url, payloadObj) => new Promise((resolve) => {
      const bodyBuf = Buffer.from(JSON.stringify(payloadObj), 'utf8');
      const listeners = {};
      const req = {
        method: 'POST',
        url,
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: '127.0.0.1' },
        on(ev, fn) { listeners[ev] = fn; },
        destroy() { }
      };
      let status = 200;
      const res = {
        setHeader() { },
        writeHead(c) { status = c; },
        end(str) {
          let parsed = null;
          try { parsed = JSON.parse(str); } catch (_) { }
          resolve({ code: status, body: parsed });
        }
      };
      router.handleRequest(req, res);
      if (listeners.data) listeners.data(bodyBuf);
      if (listeners.end) listeners.end();
    });

    // 2.1 Первая установка пароля по валидной подписи
    const sig1 = makeSignedPayload(testYid, 1);
    const r1 = await invokeAuthPost('/api/auth/set-codeword', {
      yid: testYid,
      login: 'ya_p2_login',
      codeword: 'ValidKey#2026A',
      data: sig1.data,
      signature: sig1.signature
    });
    t.eq(r1.code, 200, 'первая подписанная установка ключа успешна');

    // 2.2 Повторная отправка той же подписи блокируется защитой от replay
    const rReplay = await invokeAuthPost('/api/auth/set-codeword', {
      yid: testYid,
      login: 'ya_p2_login',
      codeword: 'AnotherKey#2026B',
      oldCodeword: 'ValidKey#2026A',
      data: sig1.data,
      signature: sig1.signature
    });
    t.eq(rReplay.code, 403, 'повторное использование подписи отклонено (403)');
    t.eq(rReplay.body && rReplay.body.error, 'signature_replay', 'код ошибки signature_replay');

    // 2.3 Новая подпись без oldCodeword для аккаунта с уже установленным ключом отклоняется
    const sig2 = makeSignedPayload(testYid, 2);
    const rNoOld = await invokeAuthPost('/api/auth/set-codeword', {
      yid: testYid,
      login: 'ya_p2_login',
      codeword: 'AnotherKey#2026B',
      data: sig2.data,
      signature: sig2.signature
    });
    t.eq(rNoOld.code, 400, 'смена ключа по подписи без oldCodeword отклонена (400)');
    t.eq(rNoOld.body && rNoOld.body.error, 'old_codeword_required', 'требуется old_codeword_required даже при наличии подписи');

    // 2.4 Снятие GM через setupGmChangeListener очищает скиллы, скорость и EditorGuard
    const gmPlayer = {
      pid: 777,
      yid: 'gm_revoke_yid',
      name: 'GmTester',
      accessLevel: 100,
      gm: true,
      editorKey: 'ed_tok_123',
      gmSpeedMul: 4,
      flashSpeed: true,
      skills: {
        test_immortal: 1,
        gm_oneshot: 1,
        gm_resurrect: 1,
        gm_speed: 1,
        gm_flash: 1,
        power_strike: 1
      }
    };
    playersMap.set(gmPlayer.pid, gmPlayer);
    const issuedToken = EditorGuard.issue(gmPlayer);
    t.ok(EditorGuard.valid(issuedToken), 'токен редактора активен до снятия GM');

    PlayerDb.touch({ name: 'GmTester', level: 10 }, 'gm_revoke_yid', 'c0');
    await PlayerDb.setAccessLevel('GmTester', 0, 'test_revoke');

    t.eq(gmPlayer.gm, false, 'флаг gm сброшен');
    t.eq(gmPlayer.editorKey, '', 'p.editorKey очищен');
    t.eq(EditorGuard.valid(issuedToken), false, 'токен EditorGuard отозван по pid');
    t.eq(gmPlayer.gmSpeedMul, 1, 'gmSpeedMul сброшен в 1');
    t.eq(gmPlayer.flashSpeed, false, 'flashSpeed сброшен в false');
    t.ok(!gmPlayer.skills.test_immortal && !gmPlayer.skills.gm_oneshot && !gmPlayer.skills.gm_speed, 'GM-скиллы удалены');
    t.eq(gmPlayer.skills.power_strike, 1, 'обычные боевые скиллы сохранены');
  }

  // ============================================================
  // 3. AccountKeyManager: per-login lock, applySync cleanup, rate-limit sweeper, worker _persist
  // ============================================================
  t.suite('P2-3: AccountKeyManager (per-login lock, applySync очистка, sweeper, _persist)');
  {
    await AccountKeys.resetForTesting();

    // 3.1 Конкурентная регистрация одного и того же логина
    const [c1, c2] = await Promise.all([
      AccountKeys.enterKey('StrongKey#100A', '127.0.0.1', '', 'create', 'race_login_p2'),
      AccountKeys.enterKey('StrongKey#200B', '127.0.0.1', '', 'create', 'race_login_p2')
    ]);
    const createdCount = (c1.ok ? 1 : 0) + (c2.ok ? 1 : 0);
    t.eq(createdCount, 1, 'ровно один из двух параллельных запросов создал логин race_login_p2 (per-login lock)');
    const rejected = c1.ok ? c2 : c1;
    t.eq(rejected.error, 'login_taken', 'второй параллельный запрос получил login_taken');

    // 3.2 Очистка устаревших ключей в applySync
    const syncYid = 'local_sync_p2';
    AccountKeys.applySync({
      kind: 'legacy',
      yid: syncYid,
      hash: 'old_hash_111',
      entry: { yid: syncYid, createdAt: 1000 }
    });
    t.ok(AccountKeys.byHash.has('old_hash_111'), 'старый хэш добавлен в byHash');
    AccountKeys.applySync({
      kind: 'login',
      yid: syncYid,
      login: 'upgraded_user',
      entry: { yid: syncYid, login: 'upgraded_user', legacyKeyHashes: ['old_hash_111'] }
    });
    t.ok(!AccountKeys.byHash.has('old_hash_111'), 'applySync удалил устаревший хэш из byHash при переходе на логин');
    AccountKeys.applySync({
      kind: 'login',
      yid: syncYid,
      login: 'renamed_user',
      entry: { yid: syncYid, login: 'renamed_user' }
    });
    t.ok(!AccountKeys.byLogin.has('upgraded_user'), 'applySync удалил прежний логин из byLogin при смене логина');
    t.ok(AccountKeys.byLogin.has('renamed_user'), 'новый логин присутствует в byLogin');

    // 3.3 Периодическая очистка failedAttempts и loginFails
    AccountKeys.failedAttempts.set('198.51.100.1', { count: 2, lastAt: Date.now() - 600000, lockedUntil: 0 });
    AccountKeys.loginFails.set('stale_login', { count: 3, lastAt: Date.now() - 1200000, lockedUntil: 0 });
    AccountKeys._sweepRateLimits(Date.now());
    t.ok(!AccountKeys.failedAttempts.has('198.51.100.1'), '_sweepRateLimits очистил просроченную запись failedAttempts');
    t.ok(!AccountKeys.loginFails.has('stale_login'), '_sweepRateLimits очистил просроченную запись loginFails');
  }

  // ============================================================
  // 4. PersistenceClient & Worker Threads: авто-респавн, per-worker трекинг и защита от гонки таймаута
  // ============================================================
  t.suite('P2-4: PersistenceClient (авто-респавн воркеров, трекинг задач, защита от гонок)');
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-p2-worker-'));
    const pc = new PersistenceClient({ poolSize: 2, respawnDelayMs: 20 });
    try {
      t.eq(pc.workers.length, 2, 'пул из 2 воркеров инициализирован');
      const w0 = pc.workers[0];
      // Принудительно завершаем первого воркера с ненулевым статусом через эмуляцию краша
      await w0.terminate();
      await new Promise(r => setTimeout(r, 120));
      t.eq(pc.workers.length, 2, 'упавший воркер автоматически перезапущен (auto-respawn)');
      t.ok(pc.stats.respawns >= 1, 'счётчик respawns увеличен');

      // Проверяем параллельную запись в один и тот же файл через _withFileLock + SharedArrayBuffer
      const targetFile = path.join(tmpDir, 'race_profile.json');
      const writes = [];
      for (let i = 1; i <= 10; i++) {
        writes.push(pc.writeAtomic(targetFile, { payload: { seq: i, name: 'Test_' + i }, makeBak: true }));
      }
      await Promise.all(writes);
      const saved = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
      t.eq(saved.seq, 10, 'последовательность атомарных записей в один файл сохранила последнюю ревизию (seq=10)');

      // Проверяем encryptVault на воркере
      const vaultKey = crypto.randomBytes(32);
      const env = await pc.encryptVault({ accounts: { test: { yid: '1' } } }, vaultKey);
      t.ok(env && env.v === 2 && env.enc === 'aes-256-gcm' && env.iv && env.tag && env.data, 'encryptVault в воркере вернул валидный AES-256-GCM конверт');
    } finally {
      await pc.terminate();
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { }
    }
  }

  // ============================================================
  // 5. PgBackend.saveBatch (writeChains + BEGIN/COMMIT) и PlayerDb (skeletons + DB.load/DB.save)
  // ============================================================
  t.suite('P2-5: PgBackend.saveBatch (транзакция + writeChains) и PlayerDb (skeletons + DB I/O)');
  {
    const txLog = [];
    const store = new Map();
    const mockPool = {
      async connect() {
        return {
          async query(sql, params = []) {
            const s = sql.trim();
            txLog.push(s.split(/\s+/)[0].toUpperCase());
            if (s.startsWith('INSERT INTO profiles') && s.includes('UNNEST')) {
              const [keys, snaps] = params;
              for (let i = 0; i < keys.length; i++) {
                store.set(keys[i], JSON.parse(snaps[i]));
              }
            } else if (s.startsWith('INSERT INTO profiles')) {
              store.set(params[0], params[1]);
            } else if (s.startsWith('SELECT data FROM profiles')) {
              const d = store.get(params[0]);
              return { rowCount: d ? 1 : 0, rows: d ? [{ data: d }] : [] };
            }
            return { rowCount: 0, rows: [] };
          },
          release() {
            txLog.push('RELEASE');
          }
        };
      },
      async query(sql, params = []) {
        const c = await this.connect();
        try { return await c.query(sql, params); } finally { c.release(); }
      }
    };

    const pg = DB.createPgBackend(mockPool);
    await pg.saveBatch([
      { yid: 'pg_batch_1', charId: 'c0', data: { name: 'BatchOne', level: 7 } },
      { yid: 'pg_batch_2', charId: 'c0', data: { name: 'BatchTwo', level: 9 } }
    ]);
    t.ok(txLog.includes('BEGIN') && txLog.includes('COMMIT') && txLog.includes('RELEASE'), 'PgBackend.saveBatch выполняется внутри транзакции BEGIN/COMMIT с освобождением клиента');
    const b1 = await pg.load('pg_batch_1', 'c0');
    t.eq(b1 && b1.level, 7, 'данные из saveBatch прочитаны через pg.load');
    t.eq(pg.writeChains.size, 0, 'writeChains очищены после завершения saveBatch');

    // PlayerDb: проверка заполнения skeletons при загрузке из postgres и использования DB.load/DB.save
    let dbLoadCalled = 0;
    let dbSaveCalled = 0;
    const mockDbForPlayerDb = {
      MODE: 'postgres',
      async loadSystemState(key) {
        if (key === 'gm_access') return { accounts: {}, characters: {} };
        if (key === 'characters_registry') {
          return {
            characters: {
              alex: { name: 'Alex', yid: 'yid_alex', charId: 'c0', level: 12, cosmetics: {} }
            }
          };
        }
        return null;
      },
      async saveSystemState() { },
      async load(yid, charId) {
        dbLoadCalled++;
        return { name: 'Alex', yid, charId, level: 12, cosmetics: {} };
      },
      async save(yid, data, charId) {
        dbSaveCalled++;
        return { ok: true };
      }
    };

    PlayerDb.setDb(mockDbForPlayerDb);
    await PlayerDb.init({ skipRebuild: true });
    // 'Аlex' с русской буквой 'А' (U+0410) должен блокироваться скелетоном латинского 'Alex'
    t.eq(PlayerDb.isNameTaken('Аlex', 'other_yid'), true, 'PlayerDb.init в режиме postgres заполняет skeletons (защита от омоглифов)');

    await PlayerDb.setAccessLevel('Alex', 80, 'test_pg');
    await PlayerDb.setAura('Alex', 'gold');
    t.ok(dbLoadCalled >= 2 && dbSaveCalled >= 2, 'setAccessLevel и setAura используют DB.load / DB.save вместо прямого чтения ФС');

    // Возвращаем стандартный DB адаптер
    PlayerDb.setDb(DB);
  }

  // ============================================================
  // 6. Античит движения (moveBudget без dt=0.05 буста, троттлинг doMove) и фильтр мёртвых игроков
  // ============================================================
  t.suite('P2-6: Античит движения (moveBudget, троттлинг doMove) и строгий фильтр трупа');
  {
    let regionChecks = 0;
    let mobChecks = 0;
    const origRegionAt = WM.regionAt;
    WM.regionAt = function (x, z) {
      regionChecks++;
      return origRegionAt ? origRegionAt.call(WM, x, z) : { id: 'talking_island' };
    };

    try {
      const mh = createMovementHandler({
        GEO: { ready: () => false },
        WM,
        ZS: null,
        NPB: null,
        IS_CLUSTER: false,
        TOTAL_WORKERS: 1,
        CURRENT_WORKER_ID: 0,
        MOVE_TOLERANCE: 1.35,
        MOVE_BURST_SEC: 1.5,
        SPEED_MAX: 20,
        MOVE_CORRECT_EPS: 0.25,
        MOVE_CORRECT_MS: 200,
        send: () => { },
        broadcastAOI: () => { },
        broadcastRawAOI: () => { },
        checkRate: () => true,
        isSyntheticBot: () => false,
        isGM: () => false,
        playerStunned: () => false,
        playerWeightState: () => ({ speedMult: 1 }),
        isPeaceAt: () => true,
        zoneLabelAt: () => 'TestZone',
        syncPlayerRegionSubscription: () => { },
        ensureNearbyMobs: () => { mobChecks++; },
        markProfileDirty: () => { },
        initiateClusterHandoff: () => { },
        entityTransforms: null,
        getElHistogram: () => null,
        getTickMsLast: () => 10
      });

      const p = {
        pid: 1,
        yid: 'p2_mover',
        x: 0,
        y: 0,
        z: 0,
        speed: 4,
        speedBase: 4,
        combatPack: { speed: 4, speedBase: 4 },
        _moveBudget: 0,
        _moveBudgetAt: 1000
      };

      // При спаме пакетов каждые 5 мс (dt = 0.005 < 0.04) бюджет начисляется строго по реальному dt (0.005), а не 0.05
      const bAfter5ms = mh.moveBudget(p, 1005);
      const expectedMax = 4 * 1.35 * 0.005 + 1e-6;
      t.ok(bAfter5ms <= expectedMax, `moveBudget при dt=5мс начислил ${bAfter5ms.toFixed(4)} м (без искусственного dt=0.05)`);

      // Проверяем троттлинг проверок региона и мобов при микро-шагах
      mh.resetMoveBudget(p);
      regionChecks = 0;
      mobChecks = 0;
      mh.doMove(p, { x: 0.5, z: 0.5 }); // первый шаг -> проверяет
      mh.doMove(p, { x: 1.0, z: 1.0 }); // микро-шаг < 3м в пределах 400мс -> кэш
      mh.doMove(p, { x: 1.5, z: 1.5 }); // микро-шаг < 3м в пределах 400мс -> кэш
      t.eq(regionChecks, 1, 'WM.regionAt вызван только 1 раз на серию близких микро-шагов');
      t.eq(mobChecks, 1, 'ensureNearbyMobs вызван только 1 раз на серию близких микро-шагов');
    } finally {
      WM.regionAt = origRegionAt;
    }

    // Проверка запрета квестов и предметов (включая косметику и соски) для мёртвого персонажа
    const questOut = [];
    const qh = createQuestHandler({
      QD,
      NPCS,
      EXP,
      send: (_p, m) => questOut.push(m),
      invCount: () => 0,
      giveCurrency: () => { },
      grantExpSp: () => ({ exp: 0, sp: 0 }),
      applyPlayerBuff: () => { },
      pushEffects: () => { },
      pushCombatStats: () => { },
      saveProfileNow: () => { },
      pruneInv: () => { },
      pushWeight: () => { }
    });
    qh.doQuestAccept({ dead: true, hp: 0, quests: { active: {}, done: {} } }, { questId: 'q1' });
    t.ok(questOut.some(m => m.t === 'quest_fail' && m.reason === 'dead'), 'doQuestAccept блокирует мёртвого игрока (reason: dead)');

    const useOut = [];
    const iuh = createItemUseHandler({
      players: new Map(),
      send: (_p, m) => useOut.push(m),
      broadcastAOI: () => { },
      snapStandY: () => { },
      isPeaceAt: () => true,
      zoneLabelAt: () => '',
      updatePlayerRegion: () => { },
      ensureNearbyMobs: () => { },
      resetMoveBudget: () => { },
      entityTransforms: null,
      saveProfileNow: () => { },
      pushEffects: () => { },
      pushCombatStats: () => { },
      applyPlayerBuff: () => { },
      resurrectPlayer: () => { },
      deathSelfPayload: () => ({}),
      grantSkillFree: () => ({ ok: true }),
      cosmeticsPublic: () => ({}),
      tableGet: (tbl, k) => (tbl ? tbl[k] : undefined),
      itemLookup: () => null,
      isBadKey: () => false,
      checkRate: () => true,
      playerStunned: () => false,
      dist2: () => 0,
      toggleShotArm: () => ({ ok: true, armed: true })
    });
    const deadCorpse = {
      dead: true,
      hp: 0,
      inv: { title_scroll_novice: 1, soulshot_ng: 100 },
      cosmetics: {}
    };
    iuh.doItemUse(deadCorpse, { id: 'title_scroll_novice' });
    iuh.doItemUse(deadCorpse, { id: 'soulshot_ng' });
    t.eq(useOut.filter(m => m.t === 'use_fail' && m.reason === 'dead').length, 2, 'doItemUse блокирует косметику и переключение сосок у мёртвого игрока');
    t.eq(deadCorpse.inv.title_scroll_novice, 1, 'косметический свиток не списан у трупа');

    const srvCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    t.ok(
      srvCode.includes("if (p.dead && msg.t !== 'revive' && msg.t !== 'chat' && msg.t !== 'ping' && msg.t !== 'pong')"),
      'server.js использует строгий whitelist команд для мёртвого игрока'
    );
  }
  } finally {
    PlayerDb.setDb(DB);
    if (savedGmAccess !== null) fs.writeFileSync(gmAccessPath, savedGmAccess, 'utf8');
    if (savedChars !== null) fs.writeFileSync(charsPath, savedChars, 'utf8');
    PlayerDb.loadGmAccessSync();
    await PlayerDb.init({ skipRebuild: true });
  }
};
