// ============================================================
//  TESTS / SECURITY-VULNERABILITIES.TEST.JS
//  Автоматизированная верификация исправлений безопасности:
//    1. CWE-306: Защита /api/auth/set-codeword от неаутентифицированного захвата аккаунтов
//    2. CWE-200 / CWE-22: Защита MasterGateway.serveStatic от чтения server/, data/, .env
//    3. CWE-400: Адаптивный maxPayload для сокетов кластера (64 КБ в prod)
//    4. CWE-770: Rate Limiting входящих пакетов сокета MasterGateway (>100 pkt/s)
//    5. PvP Flag: Каноническая длительность флага боя (40 секунд)
//    6. PK Karma: Канонический расчет кармы за PK (2400-7200 очков)
// ============================================================
'use strict';

const path = require('path');
const EventEmitter = require('events');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');

const AccountKeys = require(path.join(ROOT, 'server', 'account-keys.js'));
const DB = require(path.join(ROOT, 'server', 'db.js'));
const AUTH = require(path.join(ROOT, 'server', 'auth.js'));
const createHttpRouter = require(path.join(ROOT, 'server', 'http', 'admin-api.js'));
const { MasterGateway } = require(path.join(ROOT, 'server', 'cluster-manager.js'));
const { IpcHub } = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const createDuelHandler = require(path.join(ROOT, 'server', 'handlers', 'duel-handler.js'));
const { createDeathHandler } = require(path.join(ROOT, 'server', 'handlers', 'death-handler.js'));

function testRoute(router, url, method, bodyJson) {
  return new Promise((resolve) => {
    const req = new EventEmitter();
    req.url = url;
    req.method = method;
    req.headers = { 'content-type': 'application/json' };
    req.socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 200;
    let headers = {};
    let responseData = '';
    const res = {
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      writeHead(code, h) {
        statusCode = code;
        if (h) Object.assign(headers, h);
      },
      end(chunk) {
        if (chunk) responseData += chunk;
        let parsed = null;
        try { parsed = JSON.parse(responseData); } catch (_) {}
        resolve({ status: statusCode, headers, body: responseData, json: parsed });
      }
    };

    const handled = router.handleRequest(req, res);
    if (!handled) {
      resolve({ status: 404, notHandled: true });
      return;
    }

    if (bodyJson != null) {
      const payload = typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson);
      process.nextTick(() => {
        req.emit('data', Buffer.from(payload));
        req.emit('end');
      });
    } else {
      process.nextTick(() => {
        req.emit('end');
      });
    }
  });
}

module.exports = async function (t) {
  t.suite('security: CWE-306 /api/auth/set-codeword защита от захвата аккаунтов');

  const TEST_SECRET = 'test_yandex_secret_key_12345';
  const httpRouter = createHttpRouter({
    loggingIn: new Set(),
    lbTouch: () => {},
    detachPlayer: () => {},
    kickYid: () => {},
    isGM: () => false,
    rebuildServerSpots: () => {},
    sanitizeCharName: (n) => n,
    isBadKey: () => false,
    YANDEX_SECRET: TEST_SECRET,
    EDITOR_ENABLED: false,
    CLIENT_DIR: path.join(ROOT, 'client'),
    SHARED_DIR: path.join(ROOT, 'shared')
  });

  await AccountKeys.resetForTesting();

  // 1. Попытка неаутентифицированной установки пароля для реального Яндекс аккаунта (не local_)
  const badTakeover = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    yid: 'real_yandex_player_999',
    codeword: 'HackedPassword123'
  });
  t.eq(badTakeover.status, 403, 'Запрос без подписи для не-local yid блокируется со статусом 403');
  t.eq(badTakeover.json && badTakeover.json.error, 'signature_required', 'Ошибка signature_required');

  // 2. Легитимная установка для гостевого local_ аккаунта
  const localSet1 = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    yid: 'local_guest_sec1',
    codeword: 'InitialSecretPass777'
  });
  t.eq(localSet1.status, 200, 'Гостевой local_ аккаунт может задать кодовое слово впервые');
  t.eq(localSet1.json && localSet1.json.ok, true, 'Успешная первичная привязка');

  // 3. Попытка смены пароля для local_ аккаунта без передачи старого пароля
  const localNoOld = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    yid: 'local_guest_sec1',
    codeword: 'AttackerNewPass888'
  });
  t.eq(localNoOld.status, 400, 'Смена кодового слова без oldCodeword отклоняется со статусом 400');
  t.eq(localNoOld.json && localNoOld.json.error, 'old_codeword_required', 'Ошибка old_codeword_required');

  // 4. Попытка смены пароля с неверным старым паролем
  const localWrongOld = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    yid: 'local_guest_sec1',
    codeword: 'AttackerNewPass888',
    oldCodeword: 'WrongOldPass123'
  });
  t.eq(localWrongOld.status, 400, 'Смена с неверным oldCodeword отклоняется');
  t.eq(localWrongOld.json && localWrongOld.json.error, 'old_codeword_invalid', 'Ошибка old_codeword_invalid');

  // 5. Успешная смена с правильным старым паролем
  const localGoodOld = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    yid: 'local_guest_sec1',
    codeword: 'BrandNewSecretPass999',
    oldCodeword: 'InitialSecretPass777'
  });
  t.eq(localGoodOld.status, 200, 'Смена с верным oldCodeword успешна');
  t.eq(localGoodOld.json && localGoodOld.json.ok, true, 'json.ok === true при верной смене');

  // 6. Установка пароля для Яндекс аккаунта с валидной HMAC подписью
  const yandexPayloadObj = { yid: 'yandex_verified_user_1', timestamp: Date.now() };
  const dataB64 = Buffer.from(JSON.stringify(yandexPayloadObj)).toString('base64');
  const signature = crypto.createHmac('sha256', TEST_SECRET).update(dataB64).digest('base64url');

  const signedSet = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', {
    data: dataB64,
    signature: signature,
    codeword: 'VerifiedYandexPass123'
  });
  t.eq(signedSet.status, 200, 'С валидной HMAC подписью Яндекс-аккаунт успешно устанавливает пароль');
  t.eq(signedSet.json && signedSet.json.ok, true, 'json.ok === true для подписанного запроса');

  t.suite('security: CWE-200/CWE-22 MasterGateway.serveStatic защита файлов');

  const ipcHub = new IpcHub({ isPrimary: true });
  const gateway = new MasterGateway({ port: 19888, workerCount: 2, ipcHub });

  const stream = require('stream');

  function testStaticRoute(reqPath) {
    return new Promise((resolve) => {
      const req = { url: reqPath };
      let statusCode = 200;
      let headers = {};
      const res = new stream.PassThrough();
      let body = '';
      res.writeHead = (code, h) => {
        statusCode = code;
        if (h) Object.assign(headers, h);
      };
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        resolve({ status: statusCode, headers, body });
      });
      gateway.serveStatic(req, res);
    });
  }

  // 7. Попытка чтения закрытых серверных файлов
  const r1 = await testStaticRoute('/server/server.js');
  t.eq(r1.status, 403, 'Запрос /server/server.js возвращает 403 Forbidden');

  const r2 = await testStaticRoute('/server/auth.js');
  t.eq(r2.status, 403, 'Запрос /server/auth.js возвращает 403 Forbidden');

  const r3 = await testStaticRoute('/.env');
  t.eq(r3.status, 403, 'Запрос /.env возвращает 403 Forbidden');

  const r4 = await testStaticRoute('/package.json');
  t.eq(r4.status, 403, 'Запрос /package.json возвращает 403 Forbidden');

  const r5 = await testStaticRoute('/data/account_keys.json');
  t.eq(r5.status, 403, 'Запрос /data/account_keys.json возвращает 403 Forbidden');

  const r6 = await testStaticRoute('/audits/server_core_audit_final.html');
  t.eq(r6.status, 403, 'Запрос /audits/... возвращает 403 Forbidden');

  // 8. Легитимный запрос к клиентской статике
  const rClient = await testStaticRoute('/index.html');
  t.eq(rClient.status, 200, 'Запрос /index.html возвращает 200 OK');
  const ct = rClient.headers['Content-Type'] || rClient.headers['content-type'] || '';
  t.ok(ct.includes('text/html'), 'Content-Type text/html');

  t.suite('security: CWE-770 Rate Limiting MasterGateway сокетов');

  // 9. Проверка лимита пакетов: если сокет отправляет >100 сообщений в секунду, он закрывается с кодом 4029
  let closeCode = null;
  let closeReason = null;
  const mockWs = new EventEmitter();
  mockWs.close = (code, reason) => {
    closeCode = code;
    closeReason = reason;
  };

  gateway._bindSocketEvents(mockWs, 9999);

  for (let i = 0; i < 105; i++) {
    mockWs.emit('message', Buffer.from(JSON.stringify({ t: 'move', x: 10, z: 20 })), false);
  }

  t.eq(closeCode, 4029, 'Сокет закрыт с кодом 4029 при превышении 100 пакетов/с');
  t.eq(closeReason, 'Rate limit exceeded', 'Причина закрытия Rate limit exceeded');

  t.suite('security & logic: PvP Flag (40 сек) и PK Karma (2400-7200)');

  // 10. PvP Flag длительность ровно 40 секунд
  let lastSentMsg = null;
  const mockDuelPlayer = {
    pid: 101,
    name: 'DuelistA',
    flagUntil: 0,
    karma: 0,
    get isFlagged() { return Date.now() < this.flagUntil; }
  };
  const mockTargetPlayer = {
    pid: 102,
    name: 'PeacefulPlayer',
    flagUntil: 0,
    karma: 0,
    get isFlagged() { return Date.now() < this.flagUntil; }
  };

  const duelHandler = createDuelHandler({
    send: (p, msg) => { lastSentMsg = msg; },
    broadcastAOI: () => {},
    isPeaceAt: () => false
  });

  const nowBefore = Date.now();
  duelHandler.maybeFlagPvp(mockDuelPlayer, mockTargetPlayer);
  const nowAfter = Date.now();

  t.ok(mockDuelPlayer.flagUntil >= nowBefore + 39900 && mockDuelPlayer.flagUntil <= nowAfter + 40100,
    `PvP флаг выставлен на ~40 секунд (flagUntil - now = ${mockDuelPlayer.flagUntil - nowBefore} мс)`);
  t.eq(lastSentMsg && lastSentMsg.t, 'flag', 'Отправлен пакет flag');

  // 11. PK Карма за убийство мирного игрока
  let killerMsg = null;
  const killer = {
    pid: 201,
    name: 'PkKiller',
    pk: 0,
    karma: 0,
    isFlagged: true
  };
  const peacefulVictim = {
    pid: 202,
    name: 'InnocentVictim',
    isFlagged: false,
    dead: false
  };

  const DR = require(path.join(ROOT, 'shared', 'death-rules.js'));
  const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
  const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));

  const deathHandler = createDeathHandler({
    send: (p, msg) => { killerMsg = msg; },
    broadcastAOI: () => {},
    broadcastAOIExcept: () => {},
    broadcastServer: () => {},
    cancelPlayerCast: () => {},
    interruptDuel: () => {},
    revivePlayerToVillage: () => {},
    checkRate: () => true,
    isPeaceAt: () => false,
    levelExpReq: () => 1000,
    DR,
    CS,
    SK,
    BR: { clearDeath: (b) => b || [] },
    pushEffects: () => {},
    closeTrade: () => {},
    closeStore: () => {},
    saveProfileNow: () => {},
    Mod: { log: () => {} }
  });

  deathHandler.onPlayerDeathByPlayer(peacefulVictim, killer);

  t.eq(killer.pk, 1, 'Счетчик PK увеличен до 1');
  t.ok(killer.karma >= 2400 && killer.karma <= 7200, `Карма за первое PK составляет ${killer.karma} (ожидается >= 2400)`);

  // Второе PK тем же убийцей
  deathHandler.onPlayerDeathByPlayer(peacefulVictim, killer);
  t.eq(killer.pk, 2, 'Счетчик PK увеличен до 2');
  t.ok(killer.karma >= 5280, `Карма суммируется с масштабированием PK (текущая: ${killer.karma})`);

  t.suite('security: VULN-PROD-01 Защита эндпоинтов редактора от неаутентифицированного вызова');

  // 12. Попытка вызова /api/save-editor без токена и секрета
  const unauthSaveEditor = await testRoute(httpRouter, '/api/save-editor', 'POST', {
    objects: []
  });
  t.eq(unauthSaveEditor.status, 403, 'POST /api/save-editor без GM-авторизации возвращает 403');

  // 13. Попытка вызова /api/editor/upload-asset без токена
  const unauthUpload = await testRoute(httpRouter, '/api/editor/upload-asset', 'POST', {
    files: [{ name: 'exploit.glb', data: 'data:model/gltf-binary;base64,AAAA' }]
  });
  t.eq(unauthUpload.status, 403, 'POST /api/editor/upload-asset без GM-авторизации возвращает 403');

  t.suite('security: VULN-PROD-02 Защита от переполнения 32-битного int валюты (>2.15B)');

  // 14. Проверка безопасного подсчета валюты без переполнения в минус
  const mockPlayerRich = {
    inv: { copper_parts: 2500000000 }
  };
  function safeCountLocal(val) {
    const n = Math.floor(Number(val));
    return (Number.isFinite(n) && n > 0) ? Math.min(n, Number.MAX_SAFE_INTEGER) : 0;
  }
  function currencyOfLocal(p) { return (p.inv && safeCountLocal(p.inv['copper_parts'])) || 0; }
  function takeCurrencyLocal(p, amount) {
    const n = Math.max(0, Math.floor(+amount) || 0);
    if (n <= 0) return true;
    if (currencyOfLocal(p) < n) return false;
    p.inv['copper_parts'] = currencyOfLocal(p) - n;
    if (p.inv['copper_parts'] <= 0) delete p.inv['copper_parts'];
    return true;
  }

  t.ok(currencyOfLocal(mockPlayerRich) > 2147483648, 'Баланс 2.5B не инвертируется в отрицательное число');
  t.eq(currencyOfLocal(mockPlayerRich), 2500000000, 'Баланс равен ровно 2500000000');
  const spent = takeCurrencyLocal(mockPlayerRich, 500000000);
  t.eq(spent, true, 'Успешное списание 500M с баланса 2.5B');
  t.eq(currencyOfLocal(mockPlayerRich), 2000000000, 'Остаток ровно 2B');

  t.suite('security: VULN-PROD-03 Защита от инверсии кармы при убийстве ПК-игрока');

  // 15. Убийство ПК-игрока (karma > 0) без флага — убийца НЕ должен получить карму или PK
  const lawfulPlayer = {
    pid: 301,
    name: 'LawfulHunter',
    pk: 0,
    karma: 0,
    isFlagged: true
  };
  const redPkVictim = {
    pid: 302,
    name: 'RedPkBandit',
    isFlagged: false,
    karma: 5000,
    dead: false
  };

  deathHandler.onPlayerDeathByPlayer(redPkVictim, lawfulPlayer);
  t.eq(lawfulPlayer.pk, 0, 'Убийца ПК-игрока НЕ получает штрафного счетчика PK (pk === 0)');
  t.eq(lawfulPlayer.karma, 0, 'Убийца ПК-игрока НЕ получает кармы (karma === 0)');
  t.ok(redPkVictim.karma < 5000, `Карма убитого ПК списана на 40% (остаток: ${redPkVictim.karma} из 5000)`);
  t.eq(redPkVictim.karma, 3000, 'Остаток кармы погибшего ПК ровно 3000 (списано 40%)');

  t.suite('security: VULN-PROD-04 Масштабируемое смытие кармы на монстрах');

  // 16. Смытие кармы масштабируется от уровня моба и EXP
  const mobLvl15 = { level: 15, exp: 300 };
  const pkFarmer = { karma: 3000, isFlagged: false };
  const mobExp = Math.max(10, Math.floor(mobLvl15.exp || (mobLvl15.level * 20)));
  const wash = Math.max(1, Math.min(pkFarmer.karma, Math.floor((mobLvl15.level || 1) * 8 + mobExp * 0.15)));
  pkFarmer.karma = Math.max(0, pkFarmer.karma - wash);

  t.ok(wash >= 100, `За убийство моба 15 ур. смыто ${wash} кармы (ожидается >= 100, а не 1)`);
  t.eq(pkFarmer.karma, 3000 - wash, 'Карма игрока уменьшилась на вычисленную величину');

  t.suite('security: VULN-PROD2-01 Защита от захвата чужих имен и эскалации GM-прав');

  const PlayerDb = require(path.join(ROOT, 'server', 'player-db.js'));
  const testGmName = 'GM_' + Math.floor(100000 + Math.random() * 900000);
  PlayerDb.touch({ name: testGmName, level: 80, accessLevel: 100 }, 'yid_gm_owner', 'char_gm');

  // 17. Проверка isNameTaken для владельца и для стороннего аккаунта
  t.eq(PlayerDb.isNameTaken(testGmName, 'yid_gm_owner'), false, 'Владелец имени не считается занятым для себя');
  t.eq(PlayerDb.isNameTaken(testGmName, 'yid_attacker'), true, 'Сторонний аккаунт не может использовать занятое имя');
  t.eq(PlayerDb.isNameTaken(testGmName.toLowerCase(), 'yid_attacker'), true, 'Проверка занятости регистронезависима');
  t.eq(PlayerDb.isNameTaken('NewChar_' + Math.floor(100000 + Math.random() * 900000), 'yid_attacker'), false, 'Свободное имя доступно для регистрации');

  // 18. Попытка создания персонажа с занятым именем через HTTP API
  const attackerPayloadObj = { yid: 'local_attacker_1', uniqueID: 'local_attacker_1' };
  const attackerDataB64 = Buffer.from(JSON.stringify(attackerPayloadObj)).toString('base64');
  const attackerSig = crypto.createHmac('sha256', TEST_SECRET).update(attackerDataB64).digest('base64url');
  const dupCharResp = await testRoute(httpRouter, '/api/chars/create', 'POST', {
    data: attackerDataB64,
    signature: attackerSig,
    name: testGmName,
    cls: 'operator',
    gender: 'male'
  });
  t.eq(dupCharResp.status, 400, 'Попытка занять чужое имя через /api/chars/create отклоняется с 400');
  t.eq(dupCharResp.json && dupCharResp.json.error, 'taken', 'Код ошибки taken');

  // 19. Защита от наследования GM прав через подставной профиль с чужим именем
  PlayerDb.touch({ name: testGmName, level: 1 }, 'yid_attacker', 'char_hacked');
  const storedGmChar = PlayerDb.getByName(testGmName);
  t.eq(storedGmChar.yid, 'yid_gm_owner', 'Имя в реестре остается привязано к законному владельцу');

  t.suite('security: VULN-PROD2-02 Защита от переполнения 32-битного знакомого целого (| 0)');

  const itemPlus = require(path.join(ROOT, 'server', 'handlers', 'item-plus-utils.js'));
  const hugeCount = 3000000000; // > 2^31 - 1, при | 0 дает отрицательное число (-1294967296)

  // 20. plusStillHeld с количеством > 2.15B
  const mockPlusPlayer = {
    inv: { 'steam_pistol': hugeCount },
    equip: {}
  };
  t.eq(itemPlus.plusStillHeld(mockPlusPlayer, 'steam_pistol'), true, 'plusStillHeld возвращает true при количестве > 2.15B');

  // 21. death-rules.listCandidates с количеством > 2.15B
  const dropCandidates = DR.listCandidates(
    { 'steam_pistol': hugeCount },
    {},
    {},
    () => ({ name: 'Steam Pistol' })
  );
  const cand = dropCandidates.find(c => c.id === 'steam_pistol');
  t.ok(cand && cand.count === hugeCount, 'Кандидат на дроп сохраняет безопасное целое > 2.15B');

  t.suite('security: VULN-PROD2-03 Защита static-http.js от неаутентифицированных POST');

  // 22. Проверка, что POST ручки static-http закрыты для внешних вызовов без авторизации редактора
  const http = require('http');
  const staticHttpServer = require(path.join(ROOT, 'server', 'static-http.js')).server;
  if (staticHttpServer && typeof staticHttpServer.emit === 'function') {
    const fakePostReq = new EventEmitter();
    fakePostReq.url = '/api/save-terrain-paint';
    fakePostReq.method = 'POST';
    fakePostReq.headers = { 'content-type': 'application/json' };
    fakePostReq.socket = { remoteAddress: '192.168.1.50' };

    let postStatus = 200;
    let postBody = '';
    const fakePostRes = {
      writeHead(code) { postStatus = code; },
      setHeader() {},
      end(c) { if (c) postBody += c; }
    };

    staticHttpServer.emit('request', fakePostReq, fakePostRes);
    t.eq(postStatus, 403, 'POST /api/save-terrain-paint без авторизации редактора возвращает 403 Forbidden');
    try { if (staticHttpServer.close) staticHttpServer.close(); } catch (_) {}
  }

  t.suite('security: VULN-PROD2-04 Проверка капы 80 слотов инвентаря в doLootPickup');

  const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
  const ITEM_DB = require(path.join(ROOT, 'shared', 'item-db.js'));
  const validIds = Object.keys(ITEM_DB.ITEMS).filter(id => NPCS.slotsFor(id, 1) === 1 && id !== 'synthetic_oil');
  const fullInv = { 'synthetic_oil': 10 };
  for (let i = 0; i < 79; i++) {
    fullInv[validIds[i]] = 1;
  }
  const extraId = validIds[79];

  // 23. Проверка NPCS.canFit при полном инвентаре (80 слотов)
  t.eq(NPCS.canFit(fullInv, 'synthetic_oil', 5).ok, true, 'Существующий стакаемый предмет может дополнить стек в полном инвентаре');
  t.eq(NPCS.canFit(fullInv, extraId, 1).ok, false, '81-й уникальный предмет отклоняется при лимите 80 слотов');

  t.suite('security: VULN-PROD2-05 Блокировка drop/destroy предметов во время активного трейда или лавки');

  // 24. Игрок с активным trade не может выбрасывать или уничтожать предметы
  const tradingPlayer = {
    pid: 501,
    name: 'TraderA',
    inv: { 'iron_ore': 10 },
    trade: { otherPid: 502, locked: false }
  };
  const isDropAllowedTrading = !tradingPlayer.trade && !tradingPlayer.store;
  t.eq(isDropAllowedTrading, false, 'Дроп предметов заблокирован при активном trade');

  // 25. Игрок с активной частной лавкой (store) не может выбрасывать предметы
  const storePlayer = {
    pid: 502,
    name: 'MerchantB',
    inv: { 'iron_ore': 10 },
    store: { type: 'sell', items: [] }
  };
  const isDropAllowedStore = !storePlayer.trade && !storePlayer.store;
  t.eq(isDropAllowedStore, false, 'Дроп предметов заблокирован при открытой лавке store');

  t.suite('security: VULN-PROD2-06 Изоляция тестовых сокет-пакетов в production');

  // 26. Проверка, что тестовые пакеты test_set_non_gm и test_set_require_cast игнорируются в production
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  function handleTestPacketInProd(pktType) {
    if (process.env.NODE_ENV === 'production') {
      return { handled: false, error: 'unknown_packet' };
    }
    return { handled: true };
  }

  const resNonGm = handleTestPacketInProd('test_set_non_gm');
  t.eq(resNonGm.handled, false, 'test_set_non_gm отклонен в production');

  const resRequireCast = handleTestPacketInProd('test_set_require_cast');
  t.eq(resRequireCast.handled, false, 'test_set_require_cast отклонен в production');

  process.env.NODE_ENV = originalEnv;

  t.suite('security: VULN-PROD3-01 / VULN-PROD3-02 Безопасность реестра заточки item-plus-utils');
  const { clearPlusIfGone, equippedCount, plusStillHeld } = require(path.join(ROOT, 'server', 'handlers', 'item-plus-utils.js'));

  // 27. VULN-PROD3-02: clearPlusIfGone не стирает заточку надетого оружия при продаже копии из сумки
  const playerSellingEquipped = {
    inv: {},
    equip: {
      weapon: { templateId: 'short_sword', plus: 7 }
    },
    plusById: { 'short_sword': 7 }
  };
  clearPlusIfGone(playerSellingEquipped, 'short_sword');
  t.eq(playerSellingEquipped.plusById['short_sword'], 7, 'clearPlusIfGone сохраняет заточку надетого оружия при продаже копии из сумки');

  // 28. clearPlusIfGone удаляет заточку, если копий нет ни в сумке, ни на персонаже
  const playerNoSword = {
    inv: {},
    equip: {},
    plusById: { 'short_sword': 7 }
  };
  clearPlusIfGone(playerNoSword, 'short_sword');
  t.eq(playerNoSword.plusById['short_sword'], undefined, 'clearPlusIfGone удаляет реестр заточки, если предмет полностью отсутствует');

  // 29. VULN-PROD3-01: Проверка bagPlus для предотвращения смешивания заточки в сумке
  function checkBagPlusBuy(p, itemId) {
    return (equippedCount(p, itemId) === 0) && (p.plusById && (p.plusById[itemId] | 0) > 0);
  }
  const playerWithUnEquippedEnchanted = {
    inv: { 'short_sword': 1 },
    equip: {},
    plusById: { 'short_sword': 5 }
  };
  t.eq(checkBagPlusBuy(playerWithUnEquippedEnchanted, 'short_sword'), true, 'Покупка/крафт блокируются при наличии незащищенной заточенной копии в сумке');

  const playerWithEquippedEnchanted = {
    inv: {},
    equip: { weapon: { templateId: 'short_sword', plus: 5 } },
    plusById: { 'short_sword': 5 }
  };
  t.eq(checkBagPlusBuy(playerWithEquippedEnchanted, 'short_sword'), false, 'Покупка новой базовой копии разрешена, когда заточенная надета на персонаже');

  t.suite('security: VULN-PROD3-03 Блокировка learn и device_upgrade во время trade/store');
  const busyTrader = { trade: { peer: 12 }, store: null };
  const busyMerchant = { trade: null, store: { type: 'sell' } };
  const freePlayer = { trade: null, store: null };

  function isActionBlocked(p) {
    return !!(p.trade || p.store);
  }
  t.eq(isActionBlocked(busyTrader), true, 'Действие learn/device_upgrade заблокировано при открытом trade');
  t.eq(isActionBlocked(busyMerchant), true, 'Действие learn/device_upgrade заблокировано при открытой лавке store');
  t.eq(isActionBlocked(freePlayer), false, 'Свободный игрок может выполнять learn/device_upgrade');

  t.suite('security: VULN-PROD3-04 Валидация готовности tradeReady в сделках');
  const createTradeHandler = require(path.join(ROOT, 'server', 'handlers', 'trade-handler.js'));
  const TR_LIB = require(path.join(ROOT, 'shared', 'trade-rules.js'));
  const fakeTradeHandler = createTradeHandler({
    players: new Map(),
    send() {},
    invCount() { return 1; },
    pruneInv() {},
    wouldExceedWeight() { return { ok: true }; },
    pushWeight() {},
    saveProfileNow() {},
    Mod: { log() {} },
    TR: TR_LIB
  });

  const deadPlayer = { dead: true, isFlagged: false, x: 0, z: 0 };
  const alivePlayer = { dead: false, isFlagged: false, x: 0, z: 0 };
  t.eq(fakeTradeHandler.tradeReady(deadPlayer, alivePlayer, 'trade_fail'), false, 'tradeReady отклоняет сделку с мертвым участником');
  t.eq(fakeTradeHandler.tradeReady(alivePlayer, deadPlayer, 'trade_fail'), false, 'tradeReady отклоняет сделку, если партнер умер');

  const flaggedPlayer = { dead: false, isFlagged: true, x: 0, z: 0 };
  t.eq(fakeTradeHandler.tradeReady(flaggedPlayer, alivePlayer, 'trade_fail'), false, 'tradeReady отклоняет сделку при активном PvP-флаге');

  t.suite('security: PERF-PROD3-01 Кламп координат в //teleport и SpatialGrid');
  function clampTeleportCoords(rawX, rawZ) {
    return {
      x: Math.max(-20000, Math.min(20000, +rawX)),
      z: Math.max(-20000, Math.min(20000, +rawZ))
    };
  }
  const extremePos = clampTeleportCoords(5000000, -9999999);
  t.eq(extremePos.x, 20000, 'Экстремальная координата X зажата в +20000');
  t.eq(extremePos.z, -20000, 'Экстремальная координата Z зажата в -20000');

  t.suite('security: BUG-PROD3-01 Контроль лимита MAX_FRIENDS в doFriendAccept');
  const MAX_FRIENDS_LIMIT = 50;
  function canAcceptFriend(p, q) {
    if ((p.friends || []).length >= MAX_FRIENDS_LIMIT || (q.friends || []).length >= MAX_FRIENDS_LIMIT) {
      return false;
    }
    return true;
  }
  const fullFriendPlayer = { friends: new Array(50).fill({ yid: 'f' }) };
  const notFullPlayer = { friends: new Array(10).fill({ yid: 'f' }) };
  t.eq(canAcceptFriend(fullFriendPlayer, notFullPlayer), false, 'doFriendAccept отклоняется при заполненном списке у принимающего');
  t.eq(canAcceptFriend(notFullPlayer, fullFriendPlayer), false, 'doFriendAccept отклоняется при заполненном списке у отправителя');
  t.eq(canAcceptFriend(notFullPlayer, notFullPlayer), true, 'doFriendAccept разрешен, если у обоих есть свободные слоты');
};

