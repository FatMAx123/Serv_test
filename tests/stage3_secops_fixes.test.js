// ============================================================
//  TESTS / STAGE3_SECOPS_FIXES.TEST.JS
//  Модульные тесты для Этапа 3: SecOps, защита секретов и обратного прокси.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const SEC = require('../server/security-config.js');
const SecretsLoader = require('../server/secrets-loader.js');

module.exports = async function(t) {
  t.suite('stage3: secrets-loader (стойкие криптографические секреты)');

  // 1. Парсер .env
  const parsed = SecretsLoader.parseEnvText(`
    # Комментарий
    KEY_TEST=hello_world
    KEY_QUOTED="quoted value"
    KEY_SINGLE='single quoted'
    INVALID_LINE
    EMPTY_VAL=
  `);
  t.ok(parsed.KEY_TEST === 'hello_world', 'KEY_TEST спарсен корректно');
  t.ok(parsed.KEY_QUOTED === 'quoted value', 'Двойные кавычки сняты');
  t.ok(parsed.KEY_SINGLE === 'single quoted', 'Одинарные кавычки сняты');
  t.ok(parsed.EMPTY_VAL === '', 'Пустое значение спарсено как пустая строка');
  t.ok(!('INVALID_LINE' in parsed), 'Невалидная строка проигнорирована');

  // 2. Наличие стойких ключей после вызова initSecrets
  const res = SecretsLoader.initSecrets();
  t.ok(res.hasPepper === true, 'KEY_PEPPER инициализирован (длина >= 32)');
  t.ok(res.hasVaultSecret === true, 'KEY_VAULT_SECRET инициализирован (длина >= 32)');
  t.ok((process.env.KEY_PEPPER || '').length >= 32, 'process.env.KEY_PEPPER заполнен');
  t.ok((process.env.KEY_VAULT_SECRET || '').length >= 32, 'process.env.KEY_VAULT_SECRET заполнен');

  t.suite('stage3: account-keys (интеграция с persistent secrets)');
  const AccountKeys = require('../server/account-keys.js');
  t.ok(typeof AccountKeys.hash === 'function', 'AccountKeys.hash доступен');
  t.ok(typeof AccountKeys.multiStageHash === 'function', 'AccountKeys.multiStageHash доступен');
  const h1 = AccountKeys.hash('MySecretPassword123');
  t.ok(h1 && h1.length >= 64, 'multiStageHash генерирует устойчивый хэш');

  t.suite('stage3: security-config (валидация IP и защита от спуфинга)');

  // 3. isValidIp
  t.ok(SEC.isValidIp('127.0.0.1') === true, '127.0.0.1 валиден');
  t.ok(SEC.isValidIp('192.168.1.100') === true, '192.168.1.100 валиден');
  t.ok(SEC.isValidIp('8.8.8.8') === true, '8.8.8.8 валиден');
  t.ok(SEC.isValidIp('256.1.1.1') === false, '256.1.1.1 невалиден (октет > 255)');
  t.ok(SEC.isValidIp('abc.def.ghi.jkl') === false, 'буквенный адрес невалиден');
  t.ok(SEC.isValidIp('1.2.3.4.5') === false, '5 октетов невалидны');
  t.ok(SEC.isValidIp('') === false, 'пустая строка невалидна');
  t.ok(SEC.isValidIp(null) === false, 'null невалиден');
  t.ok(SEC.isValidIp('::1') === true, 'IPv6 loopback валиден');
  t.ok(SEC.isValidIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334') === true, 'IPv6 адрес валиден');

  // 4. resolveClientIp с недоверенного адреса (напрямую от клиента без TRUST_PROXY)
  const untrustedRemote = '203.0.113.195';
  const savedTrust = process.env.TRUST_PROXY;
  delete process.env.TRUST_PROXY;
  try {
    const spoofedIp = SEC.resolveClientIp(untrustedRemote, (header) => {
      if (header === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
      if (header === 'x-real-ip') return '1.1.1.1';
      return '';
    });
    t.ok(spoofedIp === untrustedRemote, 'Недоверенное подключение игнорирует прокси-заголовки (защита от спуфинга)', 'получен: ' + spoofedIp);
  } finally {
    if (savedTrust !== undefined) process.env.TRUST_PROXY = savedTrust;
  }

  // 5. resolveClientIp с доверенного прокси (127.0.0.1 / Nginx)
  const loopbackRemote = '127.0.0.1';

  // 5.1 Приоритет X-Real-IP (установлен Nginx)
  const realIpResult = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-real-ip') return '198.51.100.42';
    if (header === 'x-forwarded-for') return '10.0.0.1, 198.51.100.42';
    return '';
  });
  t.ok(realIpResult === '198.51.100.42', 'Доверенное подключение с X-Real-IP возвращает реальный IP клиента');

  // 5.2 X-Forwarded-For: клиент подделал заголовок '8.8.8.8', прокси дописал '198.51.100.77'
  const xffAntiSpoof = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-forwarded-for') return '8.8.8.8, 198.51.100.77';
    return '';
  });
  t.ok(xffAntiSpoof === '198.51.100.77', 'X-Forwarded-For выбирает реальный адрес справа, блокируя спуфинг слева', 'получен: ' + xffAntiSpoof);

  // 5.3 X-Forwarded-For с промежуточным доверенным прокси на loopback
  const xffChainWithProxy = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'x-forwarded-for') return 'attacker.spoof, 198.51.100.99, 127.0.0.1';
    return '';
  });
  t.ok(xffChainWithProxy === '198.51.100.99', 'Цепочка X-Forwarded-For корректно пропускает loopback прокси справа');

  // 5.4 CF-Connecting-IP (Cloudflare)
  const cfResult = SEC.resolveClientIp(loopbackRemote, (header) => {
    if (header === 'cf-connecting-ip') return '172.68.1.20';
    return '';
  });
  t.ok(cfResult === '172.68.1.20', 'CF-Connecting-IP распознаётся от доверенного прокси');

  t.suite('stage3: dev-binding (привязка хоста 127.0.0.1 в dev-режиме)');
  const srvCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  t.ok(srvCode.includes("const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');"),
    'server.js динамически выбирает BIND_HOST: 127.0.0.1 в dev и 0.0.0.0 в prod');
  t.ok(srvCode.includes('netTransport.listen(PORT, BIND_HOST'),
    'netTransport.listen слушает BIND_HOST');
  t.ok(srvCode.includes('server.listen(PORT, BIND_HOST'),
    'server.listen слушает BIND_HOST');

  const clCode = fs.readFileSync(path.join(__dirname, '../server/cluster-manager.js'), 'utf8');
  t.ok(clCode.includes("const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');"),
    'cluster-manager.js динамически выбирает BIND_HOST');
  t.ok(clCode.includes('uwsApp.listen(BIND_HOST, self.port'),
    'uwsApp.listen слушает BIND_HOST');
  t.ok(clCode.includes('this.httpServer.listen(this.port, BIND_HOST'),
    'cluster httpServer.listen слушает BIND_HOST');

  t.suite('stage3: ecosystem.config.js & deploy sanitization');
  const ecoCode = fs.readFileSync(path.join(__dirname, '../ecosystem.config.js'), 'utf8');
  t.ok(ecoCode.includes("ALLOW_DEFAULT_KEY_SECRETS: process.env.ALLOW_DEFAULT_KEY_SECRETS || '0'"),
    'ecosystem.config.js требует строгие секреты по умолчанию в продакшене (fail-closed)');
  t.ok(ecoCode.includes("ALLOW_INSECURE_AUTH: process.env.ALLOW_INSECURE_AUTH || (process.env.YANDEX_APP_SECRET ? '0' : '1')"),
    'ecosystem.config.js автоматически отключает ALLOW_INSECURE_AUTH при наличии YANDEX_APP_SECRET');

  const gitignoreCode = fs.readFileSync(path.join(__dirname, '../.gitignore'), 'utf8');
  t.ok(gitignoreCode.includes('.env*') || (gitignoreCode.includes('.env') && gitignoreCode.includes('.env.*')),
    '.gitignore защищает все варианты .env файлов');
  t.ok(gitignoreCode.includes('data/.secrets.env'),
    '.gitignore защищает data/.secrets.env');

  const deployCode = fs.readFileSync(path.join(__dirname, '../scripts/deploy-vps.js'), 'utf8');
  t.ok(deployCode.includes('--exclude="data/.secrets.env"'),
    'deploy-vps.js исключает data/.secrets.env из архива (защита продакшн-секретов VPS)');
  t.ok(deployCode.includes('--exclude=".env*"'),
    'deploy-vps.js исключает .env файлы из архива');

  t.suite('stage1 remediation: CRIT-01, HIGH-07, HIGH-08, MED-05');
  t.ok(SEC.isValidIp('::::') === false, 'HIGH-08: net.isIP отклоняет невалидный IPv6 "::::"');
  const xffOverCf = SEC.resolveClientIp(loopbackRemote, (h) => {
    if (h === 'cf-connecting-ip') return '1.1.1.1';
    if (h === 'x-forwarded-for') return '8.8.8.8, 198.51.100.55';
    return '';
  });
  t.ok(xffOverCf === '198.51.100.55', 'HIGH-08: X-Forwarded-For имеет приоритет над поддельным CF-Connecting-IP без TRUST_CLOUDFLARE=1');
  t.ok(SEC.maxHttpBodyBytes('/api/chars/create') === 16384 && SEC.maxHttpBodyBytes('/api/admin/gm') === 4096,
    'CRIT-01: maxHttpBodyBytes возвращает строгие лимиты для маршрутов uWS-прокси');
  t.ok(!clCode.includes('ps_bench_2026'), 'HIGH-07: хардкод ps_bench_2026 удалён из cluster-manager.js');
  const ntCode = fs.readFileSync(path.join(__dirname, '../server/net-transport.js'), 'utf8');
  t.ok(ntCode.includes('isDirectLoopback') && ntCode.includes('SEC.maxHttpBodyBytes'),
    'CRIT-01 & MED-05: net-transport.js защищает буфер тела uWS и сохраняет прямой loopback');

  t.suite('stage2 remediation: CRIT-02 & MED-04');
  const GuestAuth = require('../server/guest-auth.js');
  const PlayerDb = require('../server/player-db.js');
  PlayerDb.loadGmAccessSync();
  const savedNodeEnv = process.env.NODE_ENV;
  const savedGuestTofu = process.env.GUEST_TOFU;
  try {
    process.env.NODE_ENV = 'production';
    process.env.GUEST_TOFU = '0';
    // Даже при пустой БД (listChars -> []) привилегированный гостевой yid из gm-access.json не может быть захвачен через TOFU
    const emptyDb = { listChars: async () => [], load: async () => null };
    const hijackAttempt = await GuestAuth.verifyGuestOwnership(emptyDb, { byYid: new Map() }, 'local_34b2a5845c92', '0123456789abcdef0123456789abcdef');
    t.ok(hijackAttempt.ok === false && hijackAttempt.reason === 'tofu_disabled',
      'CRIT-02: попытка захвата привилегированного GM yid через TOFU при пустой БД отклонена в продакшене');
    // Обычный новый гость не из gm-access.json может создать новый профиль
    const normalNewGuest = await GuestAuth.verifyGuestOwnership(emptyDb, { byYid: new Map() }, 'local_normalnewguest99', '0123456789abcdef0123456789abcdef');
    t.ok(normalNewGuest.ok === true && normalNewGuest.tofu === true,
      'CRIT-02: обычный новый гость без записей в gm-access.json проходит штатно');
    // Тестовый аккаунт itest_gm в продакшене не получает права GM
    const prodLvl = PlayerDb.getAccessLevel('itest_gm', 'AdminGM');
    t.ok(prodLvl === 0 && PlayerDb.isGM('itest_gm', 'AdminGM') === false,
      'CRIT-02: тестовый аккаунт itest_gm заблокирован в NODE_ENV=production');
  } finally {
    if (savedNodeEnv !== undefined) process.env.NODE_ENV = savedNodeEnv; else delete process.env.NODE_ENV;
    if (savedGuestTofu !== undefined) process.env.GUEST_TOFU = savedGuestTofu; else delete process.env.GUEST_TOFU;
  }
  const devLvl = PlayerDb.getAccessLevel('itest_gm', 'AdminGM');
  t.ok(devLvl === 100 && PlayerDb.isGM('itest_gm', 'AdminGM') === true,
    'CRIT-02: в тестовом окружении itest_gm сохраняет работоспособность для автотестов');
  t.ok(ecoCode.includes("CORS_ALLOW_LOCALHOST: process.env.CORS_ALLOW_LOCALHOST || '0'"),
    'MED-04: ecosystem.config.js по умолчанию отключает CORS_ALLOW_LOCALHOST в продакшене');

  t.suite('stage3 remediation: HIGH-01, HIGH-02, HIGH-04, MED-06');
  const DB = require('../server/db.js');
  const { createDisconnectManager } = require('../server/session/disconnect-manager.js');
  const { createSessionManager } = require('../server/session/session-manager.js');
  const createHttpRouter = require('../server/http/admin-api.js');

  // 1. HIGH-01: PgBackend.load ожидает завершения pending writeChains
  {
    let queryOrder = [];
    const slowPool = {
      async query(sql, params) {
        if (sql.includes('INSERT INTO profiles')) {
          await new Promise(r => setTimeout(r, 40));
          queryOrder.push('insert_done');
          return { rowCount: 1, rows: [] };
        }
        if (sql.includes('SELECT data FROM profiles')) {
          queryOrder.push('select_run');
          return { rowCount: 1, rows: [{ data: { name: 'SavedHero', level: 25 } }] };
        }
        return { rowCount: 0, rows: [] };
      }
    };
    const pgB = DB.createPgBackend(slowPool);
    const savePromise = pgB.save('race_reconnect_yid', { name: 'SavedHero', level: 25 }, 'c0');
    const loadPromise = pgB.load('race_reconnect_yid', 'c0');
    const [, loaded] = await Promise.all([savePromise, loadPromise]);
    t.eq(queryOrder, ['insert_done', 'select_run'], 'HIGH-01: DB.load ожидает завершения активного DB.save в writeChains');
    t.eq(loaded && loaded.level, 25, 'HIGH-01: DB.load прочитал актуальный профиль после завершения записи');
  }

  // 2. HIGH-01: detachPlayer удерживает loggingIn во время await DB.save и очищает dirtyProfiles
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const loggingIn = new Set();
    const dirtyProfiles = new Map();
    const p = { pid: 701, yid: 'yid_detach_race', charId: 'c0', name: 'DetachHero' };
    players.set(701, p);
    pidByYid.set('yid_detach_race', 701);
    dirtyProfiles.set('yid_detach_race:c0', p);

    let lockedDuringSave = false;
    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid,
      loggingIn,
      dirtyProfiles,
      mobs: new Map(),
      parties: new Map(),
      isSyntheticBot: () => false,
      DB: {
        save: async () => {
          lockedDuringSave = loggingIn.has('yid_detach_race');
          await new Promise(r => setTimeout(r, 20));
        }
      }
    });

    await dm.detachPlayer(701);
    t.ok(lockedDuringSave === true, 'HIGH-01: detachPlayer блокирует loggingIn на время сохранения профиля в БД');
    t.ok(loggingIn.has('yid_detach_race') === false, 'HIGH-01: detachPlayer снимает блокировку loggingIn после завершения DB.save');
    t.ok(dirtyProfiles.has('yid_detach_race:c0') === false, 'HIGH-01: detachPlayer удаляет профиль из dirtyProfiles');
  }

  // 3. HIGH-02: FileBackend.save передаёт payload в persistenceClient без синхронного JSON.stringify в главном потоке
  {
    const origClient = DB.FileBackend.persistenceClient;
    let receivedOpts = null;
    DB.FileBackend.persistenceClient = {
      isWorkerActive: () => true,
      writeAtomic: async (file, opts) => {
        receivedOpts = opts;
        return { ok: true, file };
      }
    };
    try {
      const payloadObj = { name: 'WorkerOffloadHero', level: 30 };
      await DB.FileBackend.save('worker_offload_yid', payloadObj, 'c0');
      t.ok(receivedOpts && receivedOpts.payload === payloadObj && receivedOpts.json === undefined,
        'HIGH-02: FileBackend.save передаёт объект payload напрямую в воркер без синхронного JSON.stringify в главном потоке');
    } finally {
      DB.FileBackend.persistenceClient = origClient;
    }

    if (origClient && typeof origClient.stringifyBatch === 'function') {
      const batchStrs = await origClient.stringifyBatch([{ a: 1 }, { b: 2 }]);
      t.eq(batchStrs, ['{"a":1}', '{"b":2}'], 'HIGH-02: persistenceClient.stringifyBatch корректно сериализует батч для PgBackend.saveBatch');
    }
  }

  // 4. HIGH-04: параллельные запросы /api/chars/create и /api/chars/delete блокируются через loggingIn
  {
    const loggingIn = new Set();
    const origListChars = DB.listChars;
    const origSave = DB.save;
    const origIsNameTaken = PlayerDb.isNameTaken;
    let lockedDuringCreate = false;
    DB.listChars = async () => {
      lockedDuringCreate = loggingIn.has('char_race_yid');
      await new Promise(r => setTimeout(r, 30));
      return [];
    };
    DB.save = async () => {};
    PlayerDb.isNameTaken = () => false;

    try {
      const api = createHttpRouter({
        players: new Map(),
        pidByYid: new Map(),
        wsByPid: new Map(),
        loggingIn,
        sanitizeCharName: (n) => String(n || '').trim(),
        isBadKey: () => false,
        YANDEX_SECRET: ''
      });

      const loginPayload = Buffer.from(JSON.stringify({ uniqueID: 'char_race_yid', publicName: 'Hero' })).toString('base64url');
      const reqData1 = { data: loginPayload, signature: '', name: 'CharOne', race: 'human', gender: 'male', cls: 'operator' };
      const reqData2 = { data: loginPayload, signature: '', name: 'CharTwo', race: 'human', gender: 'male', cls: 'operator' };

      const [res1, res2] = await Promise.all([
        api.handleCharsApiBody('/api/chars/create', reqData1),
        api.handleCharsApiBody('/api/chars/create', reqData2)
      ]);
      t.ok(lockedDuringCreate === true, 'HIGH-04: /api/chars/create устанавливает блокировку loggingIn.add(yid) перед асинхронными операциями');
      t.ok((res1.code === 200 && res2.code === 409) || (res1.code === 409 && res2.code === 200),
        'HIGH-04: параллельный запрос /api/chars/create отклонён с кодом 409 busy');
      t.ok(!loggingIn.has('char_race_yid'), 'HIGH-04: блокировка loggingIn снята после завершения /api/chars/create');
    } finally {
      DB.listChars = origListChars;
      DB.save = origSave;
      PlayerDb.isNameTaken = origIsNameTaken;
    }
  }

  // 5. MED-06: обрыв сокета во время await DB.load в doLogin не создаёт «зомби-игрока»
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const loggingIn = new Set();
    let allocatedSlots = 0;

    const closingWs = {
      readyState: 1,
      send: () => {},
      close: () => { closingWs.readyState = 3; }
    };

    const sm = createSessionManager({
      AUTH: {
        verifySignature: () => ({ ok: true }),
        parseLoginData: require('../server/auth.js').parseLoginData
      },
      DB: {
        load: async () => {
          // Симулируем закрытие сокета клиентом во время ожидания чтения БД
          closingWs.readyState = 3;
          return { name: 'ZombieCandidate', level: 10, hp: 100, maxHp: 100, inv: {}, equip: {} };
        },
        save: async () => {}
      },
      entityTransforms: {
        allocate: () => { allocatedSlots++; return 0; }
      },
      players,
      wsByPid,
      pidByYid,
      loggingIn,
      getNextPid: () => 999
    });

    const loginData = Buffer.from(JSON.stringify({ uniqueID: 'zombie_test_yid', publicName: 'ZombieCandidate' })).toString('base64url');
    await sm.doLogin(closingWs, { data: loginData, signature: '' });

    t.eq(players.size, 0, 'MED-06: закрытый во время логина сокет не добавляет зомби-игрока в players');
    t.eq(pidByYid.size, 0, 'MED-06: закрытый во время логина сокет не занимает pidByYid');
    t.eq(allocatedSlots, 0, 'MED-06: закрытый во время логина сокет не выделяет слот в entityTransforms');
    t.ok(!loggingIn.has('zombie_test_yid'), 'MED-06: блокировка loggingIn корректно очищена');
  }

  t.suite('stage4 remediation: HIGH-03, CRIT-04, MED-01, MED-02');
  const ZS = require('../shared/zone-sharding.js');
  const { IpcHub, MSG_CHAR_DELETE_KICK } = require('../server/ipc-hub.js');
  const Mod = require('../server/moderation.js');
  const { createDeathHandler } = require('../server/handlers/death-handler.js');
  const { EntityTransformTable, TYPE_PLAYER } = require('../shared/entity-transform-table.js');

  // 1. HIGH-03: spatial_grid.h пропускает освобожденные слоты (type <= 0) и синхронизирует HP в deathHandler
  const sgCppCode = fs.readFileSync(path.join(__dirname, '../native/src/spatial_grid.h'), 'utf8');
  t.ok(sgCppCode.includes('if (type <= 0) continue;'), 'HIGH-03: spatial_grid.h фильтрует пустые слоты type <= 0 в bulkInsert');

  {
    const tt = new EntityTransformTable(16);
    const slot = tt.allocate(501, TYPE_PLAYER, 10, 0, 20, 400, 400, 7);
    const dummyP = {
      pid: 501, yid: 'yid_501', name: 'TestP', level: 5, exp: 0, hp: 400, maxHp: 400,
      energy: 100, maxEnergy: 100, cls: 'operator', x: 10, y: 0, z: 20,
      transformSlot: slot, inv: {}, equip: {}, buffs: [], debuffs: [], skills: {}
    };
    const dh = createDeathHandler({
      WM: { buildRegions: () => [{ id: 'village', bounds: [-200, -300, 0, -100] }] },
      NPCS: { itemMeta: () => null },
      itemLookup: () => null,
      equippedCount: () => 0,
      spawnGroundLoot: () => {},
      pushCombatStats: () => {},
      pushWeight: () => {},
      L2: {},
      EXP: { applyDeathExpLoss: () => ({ level: 5, exp: 0, loss: 0, delevels: 0 }) },
      levelExpReq: () => 1000,
      ITEMS: { gearFromEquip: () => ({}) },
      CS: { rootClass: () => 'operator', statsAtLevel: () => ({ maxHp: 400, maxEnergy: 100 }) },
      passiveBonuses: () => ({}),
      DR: { luckyUntil: () => 9, rollDeathDrops: () => ({ dropped: [] }) },
      SK: { get: () => null },
      isPeaceAt: () => true,
      BR: { clearDeath: () => [] },
      pushEffects: () => {},
      closeTrade: () => {},
      closeStore: () => {},
      interruptDuel: () => {},
      Mod: { log: () => {} },
      saveProfileNow: () => {},
      send: () => {},
      broadcastAOI: () => {},
      snapStandY: () => {},
      resetMoveBudget: () => {},
      ensureNearbyMobs: () => {},
      cancelPlayerCast: () => {},
      checkRate: () => true,
      entityTransforms: tt
    });

    dh.beginPlayerDeath(dummyP, { byMob: true });
    t.eq(tt.getHp(slot), 0, 'HIGH-03: beginPlayerDeath обнуляет HP в EntityTransformTable');
    dh.revivePlayerToVillage(dummyP);
    t.eq(tt.getHp(slot), 400, 'HIGH-03: revivePlayerToVillage восстанавливает HP в EntityTransformTable');
  }

  // 2. CRIT-04: IPC char_delete_kick и /api/status с getOnlineCount в кластере
  {
    const hub = new IpcHub({ isPrimary: true });
    let receivedKick = null;
    hub.on('char_delete_kick', (p) => { receivedKick = p; });
    hub.broadcastCharDeleteKick('yid_del_test', 'c2');
    t.ok(receivedKick && receivedKick.yid === 'yid_del_test' && receivedKick.charId === 'c2',
      'CRIT-04: IpcHub.broadcastCharDeleteKick рассылает событие char_delete_kick');
    t.eq(MSG_CHAR_DELETE_KICK, 'IPC_CHAR_DELETE_KICK', 'CRIT-04: константа MSG_CHAR_DELETE_KICK экспортирована');
  }

  // 3. MED-01: Mod.applySync поддерживает banIp / ban_ip, а server.js корректно обрабатывает mod_sync и gm_sync
  {
    Mod.applySync('ban_ip', '203.0.113.88', { until: Date.now() + 60000, reason: 'test_ip_ban' });
    const ipBan = Mod.banIpInfo('203.0.113.88');
    t.ok(ipBan && ipBan.reason === 'test_ip_ban', 'MED-01: Mod.applySync поддерживает как banIp, так и ban_ip');
    Mod.applySync('unban_ip', '203.0.113.88', {});
    t.eq(Mod.banIpInfo('203.0.113.88'), null, 'MED-01: Mod.applySync снимает бан по unban_ip');

    const latestSrvCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    t.ok(!latestSrvCode.includes("clusterIpc.on('account_key_sync'"),
      'MED-01: дублирующий обработчик account_key_sync удалён из server.js');
    t.ok(latestSrvCode.includes("ws.close(4003, 'banned')") && latestSrvCode.includes('pl.gm = (lvl >= 50)'),
      'MED-01: mod_sync закрывает сокет через wsByPid, а gm_sync проверяет lvl >= 50 и имя персонажа');
  }

  // 4. MED-02: getZoneAt не смешивает 0-based индекс и 1-based workerId
  {
    // Точка x = ±5, z = 200 (вне купола Town, южнее Севера, внутри 15-метрового буфера гистерезиса границы Восток/Запад x=0):
    // Для воркера 1 (Town) гистерезис Востока (worker 2) НЕ должен активироваться!
    const zoneFromTownWorker = ZS.getZoneAt(-5, 200, 1);
    t.eq(zoneFromTownWorker.id, 'west_wasteland',
      'MED-02: currentZoneOrWorker=1 (Town) не активирует ложный гистерезис Восточной зоны при x=-5');
    const zoneFromEastWorker = ZS.getZoneAt(-5, 200, 2);
    t.eq(zoneFromEastWorker.id, 'east_plains',
      'MED-02: currentZoneOrWorker=2 (East) удерживает игрока в east_plains в пределах гистерезиса x=-5');
    const zoneFromWestWorker = ZS.getZoneAt(5, 200, 3);
    t.eq(zoneFromWestWorker.id, 'west_wasteland',
      'MED-02: currentZoneOrWorker=3 (West) удерживает игрока в west_wasteland в пределах гистерезиса x=5');
  }

  t.suite('stage5 remediation: CRIT-03, HIGH-05, HIGH-06, HIGH-09, MED-07, LOW-01..04');
  const NPCS = require('../shared/npc-services.js');
  const { createEnchantHandler } = require('../server/handlers/enchant-handler.js');
  const createStoreHandler = require('../server/handlers/store-handler.js');
  const { createNpcServicesHandler } = require('../server/handlers/npc-services-handler.js');
  const { createSkillCaster } = require('../server/combat/skill-caster.js');
  const createGmHandler = require('../server/handlers/gm-handler.js');
  const EditorGuard = require('../server/editor-guard.js');

  // 1. CRIT-03: запрет смешивания +0 лута с земли или награды квеста с +N копией в сумке
  {
    const bagInv = { operator_hammer_low: 1 };
    const bagPlus = { operator_hammer_low: 7 };
    const fromCounts = { operator_hammer_low: 1 };
    const fromPlus = {}; // +0 предмет с земли
    t.eq(NPCS.plusMoveOk(fromCounts, fromPlus, bagInv, bagPlus, 'operator_hammer_low', 1, {}), false,
      'CRIT-03: plusMoveOk блокирует добавление +0 предмета в сумку, где уже лежит +7 копия');
    const srvText = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    t.ok(!srvText.includes('if ((L.plus | 0) > 0) {\n    const fromCounts') && srvText.includes('const lootPlus = L.plus | 0;'),
      'CRIT-03: doLootPickup вызывает plusMoveOk безусловно (и при L.plus === 0)');
  }

  // 2. HIGH-05: валидация боевого слота и грейда свитка в enchant-handler.js
  {
    const enchMsgs = [];
    const ench = createEnchantHandler({
      send: (p, m) => enchMsgs.push(m),
      checkRate: () => true,
      isBadKey: (k) => k === '__proto__',
      pushCombatStats: () => {},
      pushWeight: () => {},
      saveProfileNow: () => {},
      invCount: (p, id) => (p.inv && p.inv[id]) || 0,
      canCarryMore: () => ({ ok: true }),
      spawnGroundLoot: () => {}
    });

    const pTitle = {
      pid: 801, inv: { pressure_amplifier: 5 },
      equip: { title: { id: 'title_pioneer', templateId: 'title_pioneer', plus: 0 } }
    };
    ench.doEnchant(pTitle, { slot: 'title' });
    t.ok(enchMsgs[0] && enchMsgs[0].t === 'enchant_fail' && enchMsgs[0].reason === 'not_enchantable',
      'HIGH-05: заточка небоевого слота title отклонена с reason=not_enchantable');

    enchMsgs.length = 0;
    const pWrongGrade = {
      pid: 802, inv: { pressure_amplifier_d: 2 },
      equip: { weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low', plus: 0 } }
    };
    ench.doEnchant(pWrongGrade, { slot: 'weapon', scrollId: 'pressure_amplifier_d' });
    t.ok(enchMsgs[0] && enchMsgs[0].t === 'enchant_fail' && enchMsgs[0].reason === 'wrong_grade',
      'HIGH-05: свиток D-грейда отклонён при попытке заточить NG-оружие');
  }

  // 3. HIGH-09: защита от сгорания валюты выше MAX_CURRENCY_CAP (2147483647) в лавке и магазине NPC
  {
    const storeMsgs = [];
    const seller = {
      pid: 810, name: 'RichSeller', x: 0, z: 0, dead: false,
      inv: { synthetic_oil: 5, copper_parts: 2147483600 },
      plusById: {},
      store: { mode: 'sell', title: 'Shop', items: { synthetic_oil: { count: 5, price: 100 } } }
    };
    const buyer = {
      pid: 811, name: 'Buyer', x: 1, z: 1, dead: false,
      inv: { copper_parts: 1000 },
      plusById: {}
    };
    const sh = createStoreHandler({
      players: new Map([[810, seller], [811, buyer]]),
      send: (p, m) => storeMsgs.push(m),
      broadcastAOI: () => {},
      currencyOf: (p) => (p.inv && p.inv.copper_parts) || 0,
      takeCurrency: (p, n) => { p.inv.copper_parts -= n; },
      giveCurrency: (p, n) => { p.inv.copper_parts = Math.min(2147483647, (p.inv.copper_parts || 0) + n); },
      invCount: (p, id) => (p.inv && p.inv[id]) || 0,
      isBadKey: () => false,
      canCarryMore: () => ({ ok: true }),
      pruneInv: () => {},
      saveProfileNow: () => {},
      pushWeight: () => {}
    });
    sh.doStoreDeal(buyer, { pid: 810, itemId: 'synthetic_oil', count: 1, expectedPrice: 100 }, 'buy');
    t.ok(storeMsgs[0] && storeMsgs[0].t === 'store_fail' && storeMsgs[0].reason === 'currency_cap',
      'HIGH-09: сделка в лавке блокируется с reason=currency_cap при переполнении лимита валюты продавца');
    t.eq(seller.inv.synthetic_oil, 5, 'HIGH-09: предмет продавца не списан при отмене сделки по currency_cap');

    const shopMsgs = [];
    const richVendorPlayer = {
      pid: 812, name: 'RichPlayer', x: -107.5, z: -246.4, dead: false,
      inv: { synthetic_oil: 5, copper_parts: 2147483645 },
      plusById: {}
    };
    const npcSh = createNpcServicesHandler({
      NPCS: {
        getNpc: () => ({ id: 'trader_1', name: 'Trader', shop: [{}], position: { x: -107.5, z: -246.4 } }),
        inRange: () => true,
        sellPrice: () => 50,
        plusMapCount: () => 0
      },
      send: (p, m) => shopMsgs.push(m),
      currencyOf: (p) => p.inv.copper_parts || 0,
      giveCurrency: () => {},
      invCount: (p, id) => p.inv[id] || 0,
      pruneInv: () => {},
      saveProfileNow: () => {},
      pushWeight: () => {},
      isBadKey: () => false
    });
    npcSh.doShopSell(richVendorPlayer, { npcId: 'trader_1', itemId: 'synthetic_oil', count: 1 });
    t.ok(shopMsgs[0] && shopMsgs[0].t === 'shop_fail' && shopMsgs[0].reason === 'currency_cap',
      'HIGH-09: продажа NPC блокируется с reason=currency_cap до списания предмета');
    t.eq(richVendorPlayer.inv.synthetic_oil, 5, 'HIGH-09: предмет в сумке сохранён при отказе currency_cap');
  }

  // 4. HIGH-06 & LOW-04: соски не списываются при ошибке цели/дистанции, AOE бьёт врагов в PvP, CD = 1000мс
  {
    let shotsConsumed = 0;
    const skMsgs = [];
    const caster = {
      pid: 820, yid: 'y820', name: 'Caster', cls: 'operator', level: 20, dev: true,
      x: 0, z: 0, hp: 500, maxHp: 500, energy: 200, maxEnergy: 200,
      skills: { op_power_strike: 1, op_steam_vent: 1 },
      equip: {
        weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
        necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
        bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
      },
      devices: { valve: 6, wrist: 6 },
      cd: {},
      combatPack: { pAtk: 150, cAtk: 100, accuracy: 120, critRate: 100, critDamage: 2, level: 20, dex: 30, primary: { STR: 30, INT: 25, WIT: 25 } }
    };
    const enemyPlayer = {
      pid: 821, yid: 'y821', name: 'Enemy', cls: 'operator', level: 20,
      x: 2, z: 2, hp: 500, maxHp: 500, energy: 100, maxEnergy: 100,
      combatPack: { pDef: 80, cDef: 80, evasion: 10, level: 20, primary: { CON: 25, MEN: 25 } }
    };
    const pMap = new Map([[820, caster], [821, enemyPlayer]]);
    const sc = createSkillCaster({
      send: (p, m) => skMsgs.push({ to: p.pid, m }),
      broadcastAOI: () => {},
      players: pMap,
      mobs: new Map(),
      partyMembers: (p) => [p],
      consumeArmedShot: () => { shotsConsumed++; return { shotMod: 2.0, consumed: 'soulshot_no_grade' }; },
      pvpPeaceBlocked: () => false
    });

    // Вызов скилла по несуществующему мобу — соска НЕ должна списаться
    sc.doSkillCast(caster, { skillId: 'op_power_strike', mid: 999999 });
    t.eq(shotsConsumed, 0, 'HIGH-06: соска не сгорает при ошибке валидации цели');

    // Вызов AOE скилла op_steam_vent рядом с вражеским игроком вне мирной зоны
    sc.doSkillCast(caster, { skillId: 'op_steam_vent' });
    t.eq(shotsConsumed, 1, 'HIGH-06: соска списывается ровно 1 раз при валидном AOE попадании');
    const aoeOkMsg = skMsgs.find(x => x.to === 820 && x.m && x.m.t === 'skill_ok');
    const aoeHitOrMiss = enemyPlayer.hp < 500 || (aoeOkMsg && Array.isArray(aoeOkMsg.m.results) && aoeOkMsg.m.results.some(r => r.pid === 821 && r.kind === 'miss'));
    t.ok(aoeHitOrMiss, 'HIGH-06: AOE скилл разрешает атаку по вражескому игроку в радиусе (урон или 2% HIT_MAX-промах)');
    t.ok(caster.cd.sk_op_steam_vent >= Date.now() + 950, 'LOW-04: кулдаун рассчитывается по * 1000 мс');
  }

  // 5. LOW-01, LOW-03: //oneshot вызывает onPvpLethal, а EditorGuard.pruneExpired очищает истекшие токены
  {
    let lethalCalled = false;
    const victim = { pid: 830, yid: 'y830', name: 'Victim', hp: 300, maxHp: 300, dead: false };
    const gmAdmin = { pid: 831, yid: 'y831', name: 'Admin', accessLevel: 100, gm: true };
    const gmh = createGmHandler({
      send: () => {},
      sendJson: () => {},
      broadcastAll: () => {},
      broadcastAOI: () => {},
      findPlayerByName: (n) => (n === 'Victim' ? victim : null),
      sanitizeCharName: (n) => String(n || '').trim(),
      onPvpLethal: (v) => { lethalCalled = true; v.dead = true; },
      mobs: new Map(),
      players: new Map([[830, victim], [831, gmAdmin]])
    });
    gmh.handleGmCommand(gmAdmin, '//oneshot Victim');
    t.ok(lethalCalled === true && victim.dead === true, 'LOW-01: //oneshot <player> вызывает обработчик смерти onPvpLethal');

    const tok = EditorGuard.issue({ pid: 840, yid: 'y840' });
    const rec = EditorGuard.tokens.get(tok);
    if (rec) rec.exp = Date.now() - 1000;
    const pruned = EditorGuard.pruneExpired(Date.now());
    t.ok(pruned >= 1 && !EditorGuard.tokens.has(tok), 'LOW-03: EditorGuard.pruneExpired удаляет просроченные токены');
  }

  // =========================================================================
  // ЭТАП 6: Watchdog (CRIT-05) и выравнивание деплой-скриптов (MED-03)
  // =========================================================================
  {
    const watchdogCode = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'watchdog.js'), 'utf8');
    t.ok(
      watchdogCode.includes("const PM2_APP_NAME = process.env.PM2_APP_NAME || 'project-steam-mmo'") &&
      watchdogCode.includes('pm2 restart ${PM2_APP_NAME} --update-env'),
      'CRIT-05: scripts/watchdog.js использует конфигурируемый PM2_APP_NAME'
    );

    const syncClientCode = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'sync-client-vps.js'), 'utf8');
    const tarLineMatch = syncClientCode.match(/const tarCmd\s*=\s*`([^`]+)`/);
    const tarLine = tarLineMatch ? tarLineMatch[1] : '';
    t.ok(
      syncClientCode.includes('guard-anti-rollback.js') &&
      !tarLine.includes('client/css') &&
      !tarLine.includes('client/*.html'),
      'MED-03: scripts/sync-client-vps.js вызывает guard-anti-rollback.js и не пакует client/css и client/*.html на VPS'
    );

    const autoDeployCode = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'auto-deploy-all.js'), 'utf8');
    t.ok(
      autoDeployCode.includes('git status --porcelain') &&
      autoDeployCode.includes('git diff --name-only origin/main..HEAD'),
      'MED-03: scripts/auto-deploy-all.js определяет hasServerMods как по рабочей копии, так и по локальным коммитам'
    );
  }
};
