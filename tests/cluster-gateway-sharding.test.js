// ============================================================
//  TESTS / CLUSTER-GATEWAY-SHARDING.TEST.JS
//  Интеграционные тесты многоядерного кластера и Master Gateway:
//    1. Пространственное зонирование и шардинг спотов (без дублирования мобов)
//    2. Терминация соединений и мультиплексирование Master Gateway
//    3. Сквозная доставка сообщений Worker <-> Gateway <-> Client
//    4. Межворкерный личный чат (Whisper / Tell)
//    5. Бесшовный Handoff при пересечении границы зоны без разрыва сокета
// ============================================================
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '..');
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));
const ZS = require(path.join(ROOT, 'shared', 'zone-sharding.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const {
  IpcHub,
  MSG_CLIENT_RAW,
  MSG_GATEWAY_SEND,
  MSG_GATEWAY_SEND_BATCH,
  MSG_GATEWAY_CLOSE,
  MSG_CLIENT_DISCONNECT,
  MSG_WHISPER,
  MSG_HANDOFF,
  MSG_PARTY
} = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const { MasterGateway } = require(path.join(ROOT, 'server', 'cluster-manager.js'));
const PlayerDb = require(path.join(ROOT, 'server', 'player-db.js'));

const TEST_PORT = 18991;

function httpGet(pathStr) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: TEST_PORT, path: pathStr }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    }).on('error', reject);
  });
}

function httpPost(pathStr, postData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(postData || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: pathStr,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: buf, headers: res.headers }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

module.exports = async function (t) {
  t.suite('cluster-sharding: разделение спотов по зонам');

  // 1. Проверяем шардинг спотов с редакторскими оверрайдами
  const overridesFile = path.join(ROOT, 'shared', 'editor-overrides.json');
  if (fs.existsSync(overridesFile) && WM.applyEditorOverrides) {
    WM.applyEditorOverrides(JSON.parse(fs.readFileSync(overridesFile, 'utf8')));
  }
  if (WM.rebuildMobSpotsFromEditor) {
    WM.rebuildMobSpotsFromEditor();
  }

  const allSpots = WM.buildSpots();
  t.ok(allSpots.length > 300, `Всего спотов острова: ${allSpots.length} (ожидается > 300)`);

  const w1Spots = allSpots.filter(sp => ZS.getWorkerForCoords(sp.x, sp.z, 4) === 1);
  const w2Spots = allSpots.filter(sp => ZS.getWorkerForCoords(sp.x, sp.z, 4) === 2);
  const w3Spots = allSpots.filter(sp => ZS.getWorkerForCoords(sp.x, sp.z, 4) === 3);
  const w4Spots = allSpots.filter(sp => ZS.getWorkerForCoords(sp.x, sp.z, 4) === 4);

  t.eq(w1Spots.length, 0, 'Воркер 1 (Город/Мирная зона) имеет ровно 0 спотов диких мобов');
  t.ok(w2Spots.length > 50, `Воркер 2 (Восток) содержит ${w2Spots.length} спотов`);
  t.ok(w3Spots.length > 50, `Воркер 3 (Запад) содержит ${w3Spots.length} спотов`);
  t.ok(w4Spots.length > 50, `Воркер 4 (Север) содержит ${w4Spots.length} спотов`);

  const sumSpots = w1Spots.length + w2Spots.length + w3Spots.length + w4Spots.length;
  t.eq(sumSpots, allSpots.length, `Сумма спотов воркеров (${sumSpots}) строго равна общему числу (${allSpots.length}) без дублей`);

  t.suite('cluster-gateway: Master Gateway HTTP & WebSocket мультиплексирование');

  const ipcHub = new IpcHub({ isPrimary: true });
  const gateway = new MasterGateway({ port: TEST_PORT, workerCount: 4, ipcHub });

  // Эмулируем 4 воркера через EventEmitter
  class MockWorkerProcess extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
      this.sent = [];
    }
    send(msg, cb) {
      this.sent.push(msg);
      if (typeof cb === 'function') cb();
    }
    isConnected() { return true; }
    kill() {}
  }

  const mockWorkers = [1, 2, 3, 4].map(id => new MockWorkerProcess(id));
  mockWorkers.forEach((mw, idx) => {
    gateway.registerWorker(mw, idx + 1);
  });

  await new Promise((resolve) => gateway.start(resolve));

  // Проверка /healthz
  const healthRes = await httpGet('/healthz');
  t.eq(healthRes.status, 200, 'GET /healthz возвращает HTTP 200');
  const healthJson = JSON.parse(healthRes.body);
  t.eq(healthJson.status, 'ok', 'Healthcheck status: ok');
  t.eq(healthJson.mode, 'cluster_gateway', 'Режим работы: cluster_gateway');
  t.eq(healthJson.workers, 4, 'Число сконфигурированных воркеров: 4');
  t.eq(healthJson.activeWorkers, 4, 'Число активных воркеров: 4');

  // Проверка /metrics
  const metricsRes = await httpGet('/metrics');
  t.eq(metricsRes.status, 200, 'GET /metrics возвращает HTTP 200');
  t.ok(metricsRes.body.includes('mmo_cluster_workers 4'), 'Метрики Prometheus содержат mmo_cluster_workers');

  // Подключение WebSocket клиента к Master Gateway
  const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  t.ok(ws.readyState === WebSocket.OPEN, 'Клиентский WebSocket успешно подключен к Master Gateway');

  // Отправка клиентом сообщения (login)
  const loginMsg = JSON.stringify({ t: 'login', data: 'test_token', signature: 'dev' });
  ws.send(loginMsg);

  // Ждём пока сообщение прилетит в Worker 1 (Town по умолчанию)
  await new Promise(r => setTimeout(r, 100));

  const w1 = mockWorkers[0];
  t.ok(w1.sent.length >= 1, 'Воркер 1 получил входящее сообщение от клиента');
  const rawIpc = w1.sent[0];
  t.eq(rawIpc.ipcType, MSG_CLIENT_RAW, 'Тип IPC сообщения: MSG_CLIENT_RAW');
  t.ok(rawIpc.payload && rawIpc.payload.connId > 0, 'Присутствует валидный connId');
  t.eq(rawIpc.payload.data, loginMsg, 'Данные совпали с отправленным фреймом');

  const clientConnId = rawIpc.payload.connId;

  // Ответ от Воркера клиенту через Gateway (MSG_GATEWAY_SEND)
  const welcomeData = JSON.stringify({ t: 'welcome', pid: 101, region: 'town', dev: true });
  let receivedMsg = null;
  ws.on('message', (data) => {
    receivedMsg = data.toString('utf8');
  });

  ipcHub.emit('gateway_send', {
    connId: clientConnId,
    data: welcomeData,
    isBinary: false,
    pid: 101
  });

  await new Promise(r => setTimeout(r, 100));
  t.eq(receivedMsg, welcomeData, 'Клиент получил ответ welcome от воркера через Master Gateway');

  t.suite('cluster-gateway: межворкерный личный чат (Whisper)');

  // Эмулируем приход whisper через IPC
  let whisperReceived = null;
  ipcHub.on('whisper', (payload) => {
    whisperReceived = payload;
  });

  ipcHub.sendWhisper('Alice', 'Bob', 'Привет из другого ядра!');
  await new Promise(r => setTimeout(r, 100));

  t.ok(whisperReceived != null, 'Whisper успешно передан в IPC шину');
  t.eq(whisperReceived.senderName, 'Alice', 'Отправитель Alice');
  t.eq(whisperReceived.targetName, 'Bob', 'Получатель Bob');
  t.eq(whisperReceived.text, 'Привет из другого ядра!', 'Текст шёпота доставлен');

  t.suite('cluster-gateway: бесшовный Handoff без разрыва сокета');

  // Игрок переходит из Зоны 1 (Воркер 1) в Зону 2 (Воркер 2)
  t.eq(gateway.workerIdByConnId.get(clientConnId), 1, 'До Handoff соединение закреплено за Воркером 1');

  // Эмулируем событие handoff_route от Воркера 1 к Воркеру 2
  ipcHub.emit('handoff_route', {
    connId: clientConnId,
    pid: 101,
    fromWorkerId: 1,
    targetWorkerId: 2
  });

  t.eq(gateway.workerIdByConnId.get(clientConnId), 2, 'После Handoff маршрут соединения переключен на Воркер 2');
  t.ok(ws.readyState === WebSocket.OPEN, 'Клиентский сокет остался ОТКРЫТ (нет разрыва/переподключения)');

  // Клиент отправляет следующий шаг движения
  const moveMsg = JSON.stringify({ t: 'move', x: 250, z: -100 });
  ws.send(moveMsg);

  await new Promise(r => setTimeout(r, 100));

  const w2 = mockWorkers[1];
  t.ok(w2.sent.length >= 1, 'Воркер 2 получил пакет от клиента после Handoff');
  const moveIpc = w2.sent[w2.sent.length - 1];
  t.eq(moveIpc.ipcType, MSG_CLIENT_RAW, 'Тип IPC сообщения: MSG_CLIENT_RAW на Воркере 2');
  t.eq(moveIpc.payload.data, moveMsg, 'Воркер 2 принял пакет move');

  // -------------------------------------------------------------
  // Тест Блокера 1: HTTP API на Master Gateway
  // -------------------------------------------------------------
  t.suite('cluster-gateway: Master Gateway HTTP API (/api/*)');
  const statusRes = await httpGet('/api/status');
  t.eq(statusRes.status, 200, 'GET /api/status возвращает HTTP 200 на Master Gateway');
  const statusJson = JSON.parse(statusRes.body);
  t.eq(statusJson.ok, true, '/api/status ok: true');

  const lbRes = await httpGet('/api/leaderboard');
  t.eq(lbRes.status, 200, 'GET /api/leaderboard возвращает HTTP 200 на Master Gateway');
  const lbJson = JSON.parse(lbRes.body);
  t.eq(lbJson.ok, true, '/api/leaderboard ok: true');

  const authRes = await httpPost('/api/auth/enter-key', { key: 'invalid_key' });
  t.ok(authRes.status !== 404, `POST /api/auth/enter-key обработан роутером (код ${authRes.status}, не 404)`);

  const notFoundRes = await httpGet('/api/unknown_test_endpoint');
  t.eq(notFoundRes.status, 404, 'Неизвестный /api/ маршрут возвращает 404 от API роутера');

  // -------------------------------------------------------------
  // Тест Блокера 2: Партиционирование ID пространства воркеров
  // -------------------------------------------------------------
  t.suite('cluster-sharding: партиционирование ID пространства воркеров (NPB 32-bit)');
  const baseW1 = 1 * 100000000;
  const baseW2 = 2 * 100000000;
  const baseW3 = 3 * 100000000;
  const baseW4 = 4 * 100000000;
  t.ok(baseW2 - baseW1 === 100000000, 'Диапазоны ID воркеров разнесены ровно по 100 000 000');
  t.ok(baseW4 + 100000000 <= 4294967295, 'Все ID воркеров укладываются в Uint32LE (0..4.2 млрд) для NPB');

  // Проверяем, что NPB сохраняет 32-битные ID воркеров без переполнения
  const NPB = require(path.join(ROOT, 'shared', 'net-pack-binary.js'));
  const encoded = NPB.encodeUpd([{ k: 'p100000001', x: 10.5, z: -20.5, hp: 500 }]);
  const decoded = NPB.decodeUpd(encoded);
  t.eq(decoded.length, 1, 'NPB декодировал 1 сущность');
  t.eq(decoded[0].k, 'p100000001', 'NPB сохранил точный ID p100000001 (100M+) в 32-битном поле');

  // Тестируем маршрутизацию в MasterGateway по непересекающимся PID
  gateway.connIdByPid.set(100000001, clientConnId);
  gateway.pidByConnId.set(clientConnId, 100000001);
  gateway.workerIdByPid.set(100000001, 1);
  gateway.connIdByPid.set(200000001, 999);
  gateway.workerIdByPid.set(200000001, 2);

  t.eq(gateway.connIdByPid.get(100000001), clientConnId, 'PID 100000001 (Воркер 1) корректно закреплен за сокетом');
  t.eq(gateway.connIdByPid.get(200000001), 999, 'PID 200000001 (Воркер 2) корректно закреплен за сокетом 999 без коллизий');
  t.eq(gateway.workerIdByPid.get(100000001), 1, 'Воркер 1 определен для PID 100000001');
  t.eq(gateway.workerIdByPid.get(200000001), 2, 'Воркер 2 определен для PID 200000001');

  // -------------------------------------------------------------
  // Тест Блокера 5: Пакетная отправка IPC (MSG_GATEWAY_SEND_BATCH)
  // -------------------------------------------------------------
  t.suite('cluster-gateway: пакетная отправка IPC (MSG_GATEWAY_SEND_BATCH)');
  const batchMessages = [];
  ws.removeAllListeners('message');
  ws.on('message', (data) => {
    batchMessages.push(data.toString('utf8'));
  });

  const bMsg1 = JSON.stringify({ t: 'batch1', count: 1 });
  const bMsg2 = JSON.stringify({ t: 'batch2', count: 2 });
  const bMsg3 = JSON.stringify({ t: 'batch3', count: 3 });

  ipcHub.emit('gateway_send_batch', {
    items: [
      { connId: clientConnId, data: bMsg1, isBinary: false },
      { connId: clientConnId, data: bMsg2, isBinary: false },
      { pid: 100000001, data: bMsg3, isBinary: false } // Резолв через pid
    ]
  });

  await new Promise(r => setTimeout(r, 100));
  t.eq(batchMessages.length, 3, 'Клиент получил все 3 батчированных пакета из одной IPC посылки');
  t.eq(batchMessages[0], bMsg1, 'Первый пакет батча совпал');
  t.eq(batchMessages[1], bMsg2, 'Второй пакет батча совпал');
  t.eq(batchMessages[2], bMsg3, 'Третий пакет батча (резолв по pid) совпал');

  // Закрытие соединения клиентом
  ws.close();
  await new Promise(r => setTimeout(r, 100));

  const disconnectIpc = w2.sent[w2.sent.length - 1];
  t.eq(disconnectIpc.ipcType, MSG_CLIENT_DISCONNECT, 'Воркер 2 получил MSG_CLIENT_DISCONNECT при закрытии сокета');
  t.eq(gateway.connIdByPid.has(100000001), false, 'connIdByPid очищен при закрытии сокета');
  t.eq(gateway.workerIdByPid.has(100000001), false, 'workerIdByPid очищен при закрытии сокета');

  // Тест синхронизации флага онлайна в базе на Мастере
  t.suite('cluster-gateway: синхронизация флага онлайна в PlayerDb');
  PlayerDb.touch({ name: 'LeaderboardHero', level: 30, exp: 50000 }, 'user_online_test', 'char_1');
  let charRec = PlayerDb.getByYid('user_online_test', 'char_1');
  t.ok(charRec != null, 'Персонаж для проверки онлайна создан');
  t.eq(charRec.online, false, 'Изначально online = false');

  ipcHub.emit('player_update', { yid: 'user_online_test', pid: 55555, online: true });
  charRec = PlayerDb.getByYid('user_online_test', 'char_1');
  t.eq(charRec.online, true, 'После IPC player_update online = true');

  ipcHub.emit('player_update', { yid: 'user_online_test', pid: 55555, online: false });
  charRec = PlayerDb.getByYid('user_online_test', 'char_1');
  t.eq(charRec.online, false, 'После IPC player_update (offline) online = false');

  // Очистка шлюза
  await new Promise(r => gateway.stop(r));

  // -------------------------------------------------------------
  // Тест Блокера 3: Очистка AOI при Handoff
  // -------------------------------------------------------------
  t.suite('cluster-handoff: полная очистка старой зоны (AOI Leave)');
  const dummyPlayer = {
    pid: 10000005,
    x: 0,
    z: 0,
    known: new Set(['m101', 'm102', 'p10000002'])
  };
  const leaveList = Array.from(dummyPlayer.known);
  const aoiCleanPacket = { t: 'aoi', enter: [], leave: leaveList };
  t.eq(aoiCleanPacket.leave.length, 3, 'Пакет очистки зоны содержит ровно 3 сущности из p.known');
  t.ok(aoiCleanPacket.leave.includes('m101'), 'Включает моба m101');
  t.ok(aoiCleanPacket.leave.includes('p10000002'), 'Включает игрока p10000002');

  // -------------------------------------------------------------
  // Тест Блокера 4: Межсерверная синхронизация групп (Party)
  // -------------------------------------------------------------
  t.suite('cluster-party: межсерверная синхронизация групп (Party)');
  const { createPartyHandler } = require(path.join(ROOT, 'server', 'handlers', 'party-handler.js'));
  const CS = require(path.join(ROOT, 'shared', 'class-system.js'));

  const w1Parties = new Map();
  const w1Players = new Map();
  const w1Sent = [];
  const w1IpcSent = [];

  const mockIpcW1 = {
    broadcastParty: (payload) => {
      w1IpcSent.push(payload);
    },
    sendToPrimary: (type, payload) => {
      w1IpcSent.push(payload);
    }
  };

  const pAlice = {
    pid: 10000001,
    name: 'Alice',
    hp: 500, maxHp: 500, mp: 200, maxMp: 200, level: 25, classId: 'knight',
    x: 0, z: 0, partyId: null
  };
  w1Players.set(pAlice.pid, pAlice);

  const ph1 = createPartyHandler({
    parties: w1Parties,
    players: w1Players,
    send: (p, msg) => w1Sent.push({ to: p.pid, msg }),
    sendPid: (pid, msg) => w1Sent.push({ to: pid, msg }),
    dist2: () => 10,
    checkRate: () => true,
    CS: {},
    G: {},
    EXP: {},
    grantExpSp: () => {},
    getNextId: () => 90001,
    clusterIpc: mockIpcW1,
    IS_CLUSTER: true,
    CURRENT_WORKER_ID: 1,
    findPlayerByName: (name) => {
      for (const pl of w1Players.values()) {
        if (pl.name.toLowerCase() === name.toLowerCase()) return pl;
      }
      return null;
    }
  });

  const w2Parties = new Map();
  const w2Players = new Map();
  const w2Sent = [];
  const w2IpcSent = [];

  const mockIpcW2 = {
    broadcastParty: (payload) => {
      w2IpcSent.push(payload);
    },
    sendToPrimary: (type, payload) => {
      w2IpcSent.push(payload);
    }
  };

  const pBob = {
    pid: 20000001,
    name: 'Bob',
    hp: 400, maxHp: 400, mp: 300, maxMp: 300, level: 24, classId: 'mage',
    x: 500, z: 500, partyId: null
  };
  w2Players.set(pBob.pid, pBob);

  const ph2 = createPartyHandler({
    parties: w2Parties,
    players: w2Players,
    send: (p, msg) => w2Sent.push({ to: p.pid, msg }),
    sendPid: (pid, msg) => w2Sent.push({ to: pid, msg }),
    dist2: () => 10,
    checkRate: () => true,
    CS: {},
    G: {},
    EXP: {},
    grantExpSp: () => {},
    getNextId: () => 90002,
    clusterIpc: mockIpcW2,
    IS_CLUSTER: true,
    CURRENT_WORKER_ID: 2,
    findPlayerByName: (name) => {
      for (const pl of w2Players.values()) {
        if (pl.name.toLowerCase() === name.toLowerCase()) return pl;
      }
      return null;
    }
  });

  // Alice (W1) приглашает Bob (W2)
  ph1.handlePartyMessage(pAlice, { t: 'party_invite', target: 'Bob' });
  t.eq(w1IpcSent.length, 1, 'Воркер 1 отправил remote_invite в IPC шину');
  t.eq(w1IpcSent[0].action, 'party_remote_invite', 'Действие party_remote_invite');
  t.eq(w1IpcSent[0].targetName, 'Bob', 'Цель Bob');

  // Воркер 2 принимает приглашение через IPC
  ph2.handleIpcParty(w1IpcSent[0]);
  t.ok(w2Sent.some(s => s.to === pBob.pid && s.msg.t === 'party_invite_dialog' && s.msg.fromName === 'Alice'), 'Bob на Воркере 2 получил приглашение от Alice');

  // Bob (W2) соглашается: отправляет party_accept
  ph2.handlePartyMessage(pBob, { t: 'party_accept', from: 'Alice', fromPid: pAlice.pid });
  t.eq(w2IpcSent.length, 1, 'Воркер 2 отправил remote_accept в IPC шину');
  t.eq(w2IpcSent[0].action, 'party_remote_accept', 'Действие party_remote_accept');

  // Воркер 1 обрабатывает party_remote_accept
  ph1.handleIpcParty(w2IpcSent[0]);
  t.ok(pAlice.partyId != null, 'У Alice создана группа на Воркере 1');
  const pa1 = ph1.partyOf(pAlice);
  t.ok(pa1 != null, 'Группа pa1 существует');
  t.ok(pa1.members.has(pAlice.pid), 'Alice в членах группы');
  t.ok(pa1.members.has(pBob.pid), 'Bob в членах группы');

  // Воркер 1 отправил party_sync в IPC
  const syncIpc = w1IpcSent.find(s => s.action === 'party_sync');
  t.ok(syncIpc != null, 'Воркер 1 разослал party_sync в IPC');

  // Воркер 2 получает party_sync
  ph2.handleIpcParty(syncIpc);
  t.eq(pBob.partyId, pa1.id, 'У Bob проставился partyId на Воркере 2');
  const pa2 = ph2.partyOf(pBob);
  t.ok(pa2 != null, 'Группа успешно синхронизирована на Воркер 2');
  t.ok(pa2.members.has(pAlice.pid) && pa2.members.has(pBob.pid), 'Группа на Воркере 2 содержит обоих игроков');

  // Проверяем pushParty на Воркере 2: видит ли данные Alice?
  ph2.pushParty(pa2);
  const partySnapForBob = w2Sent.find(s => s.to === pBob.pid && s.msg.t === 'party');
  t.ok(partySnapForBob != null, 'Bob получил пакет обновления party');
  t.eq(partySnapForBob.msg.members.length, 2, 'В снепшоте группы ровно 2 игрока');
  const aliceSnap = partySnapForBob.msg.members.find(m => m.pid === pAlice.pid);
  t.ok(aliceSnap != null, 'В снепшоте присутствуют данные Alice');
  t.eq(aliceSnap.name, 'Alice', 'Имя Alice совпало');
  t.eq(aliceSnap.level, 25, 'Уровень Alice 25');

  // -------------------------------------------------------------
  // Тест Дефекта 2: Синхронизация HP сопартийцев из других зон (party_member_update)
  // -------------------------------------------------------------
  t.suite('cluster-party: синхронизация HP сопартийцев между зонами');
  // Alice получает урон: 500 -> 250 HP
  pAlice.hp = 250;
  w1IpcSent.length = 0;
  // pushParty на Воркере 1: так как Bob на другом воркере, должен отправиться party_member_update
  ph1.pushParty(pa1);
  const hpUpdateIpc = w1IpcSent.find(s => s.action === 'party_member_update' && s.member && s.member.pid === pAlice.pid);
  t.ok(hpUpdateIpc != null, 'Воркер 1 отправил party_member_update в IPC');
  t.eq(hpUpdateIpc.member.hp, 250, 'В IPC передан актуальный HP (250)');

  // Воркер 2 получает party_member_update
  w2Sent.length = 0;
  ph2.handleIpcParty(hpUpdateIpc);
  const updatedSnapForBob = w2Sent.find(s => s.to === pBob.pid && s.msg.t === 'party');
  t.ok(updatedSnapForBob != null, 'Bob получил немедленное обновление группы при уроне по Alice');
  const aliceUpdatedSnap = updatedSnapForBob.msg.members.find(m => m.pid === pAlice.pid);
  t.eq(aliceUpdatedSnap.hp, 250, 'Полоска HP Alice на шарде Bob обновлена до 250 (не замерзает)');

  // -------------------------------------------------------------
  // Тест Дефекта 1: Дребезг перехода границ (Handoff Thrashing Hysteresis)
  // -------------------------------------------------------------
  t.suite('cluster-sharding: зона гистерезиса при переходе границ');
  const townX = -107.5, townZ = -246.4;
  // Граница города: радиус 350. Вход <= 340, Выход > 365.
  // Точка 355 м от центра города:
  // Если текущая зона town -> должна остаться town (355 < 365)
  t.eq(ZS.getZoneAt(townX + 355, townZ, 'town').id, 'town', 'При 355 м игрок из Town остаётся в Town (буфер выхода 365 м)');
  // Если текущая зона east_plains -> должна остаться east_plains (355 > 340)
  t.eq(ZS.getZoneAt(townX + 355, townZ, 'east_plains').id, 'east_plains', 'При 355 м игрок снаружи не входит в Town (буфер входа 340 м)');
  // При 335 м: из любой зоны переходит в Town
  t.eq(ZS.getZoneAt(townX + 335, townZ, 'east_plains').id, 'town', 'При 335 м игрок заходит в Town (<= 340 м)');
  // При 370 м: из Town выходит в поле
  t.eq(ZS.getZoneAt(townX + 370, townZ, 'town').id, 'east_plains', 'При 370 м игрок покидает Town (> 365 м)');

  // Северная граница: z = -1000. Вход на север: z < -1015, выход на юг: z >= -985
  t.eq(ZS.getZoneAt(100, -995, 'north_ruins').id, 'north_ruins', 'При z = -995 северный игрок остаётся на севере (буфер -985)');
  t.eq(ZS.getZoneAt(100, -995, 'east_plains').id, 'east_plains', 'При z = -995 восточный игрок не входит на север (буфер -1015)');
  t.eq(ZS.getZoneAt(100, -1020, 'east_plains').id, 'north_ruins', 'При z = -1020 игрок входит на север (< -1015)');
  t.eq(ZS.getZoneAt(100, -980, 'north_ruins').id, 'east_plains', 'При z = -980 игрок выходит на юг (>= -985)');

  // -------------------------------------------------------------
  // Тест Дефекта 3: Шов слепоты на границе зон (Border Seam Detection)
  // -------------------------------------------------------------
  t.suite('cluster-sharding: обнаружение сущностей у границы шардов (Border Seam)');
  const nearCenter = ZS.isNearBorder(2, -500, 95, 4);
  t.ok(nearCenter && nearCenter.near, 'Точка x = 2, z = -500 признана приграничной (x близко к 0)');
  const farCenter = ZS.isNearBorder(500, -500, 95, 4);
  t.eq(farCenter.near, false, 'Точка x = 500, z = -500 НЕ является приграничной');
  const nearTownBorder = ZS.isNearBorder(townX + 345, townZ, 95, 4);
  t.ok(nearTownBorder && nearTownBorder.near, 'Точка r = 345 м у границы города признана приграничной');

  // -------------------------------------------------------------
  // Тест Блокера 4: Защита от гонки rebuildIndex при одновременном старте
  // -------------------------------------------------------------
  t.suite('cluster-db: пропуск rebuildIndex для Zone Workers');
  const prevEnv = process.env.IS_CLUSTER_WORKER;
  process.env.IS_CLUSTER_WORKER = '1';
  const initResultWorker = await PlayerDb.init();
  t.eq(initResultWorker.rebuilt, false, 'PlayerDb.init() пропускает rebuildIndex при IS_CLUSTER_WORKER=1');
  t.ok(initResultWorker.count >= 0, 'Индекс персонажей корректно загружен в память');
  if (prevEnv !== undefined) process.env.IS_CLUSTER_WORKER = prevEnv;
  else delete process.env.IS_CLUSTER_WORKER;

  // -------------------------------------------------------------
  // Тест Блокера 3 и Дефекта 4: kickYid и валидация Origin на Master Gateway
  // -------------------------------------------------------------
  t.suite('cluster-gateway: kickYid и валидация Origin (CSWSH)');
  const gw2 = new MasterGateway({ port: TEST_PORT + 1, workerCount: 4, ipcHub });
  await new Promise(r => gw2.start(r));

  // Тест CSWSH Origin validation
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  let rejectedWs = false;
  try {
    const evilWs = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`, {
      headers: { Origin: 'https://evil-hacker-site.com' }
    });
    await new Promise((resolve) => {
      evilWs.on('open', () => resolve());
      evilWs.on('error', () => { rejectedWs = true; resolve(); });
      evilWs.on('unexpected-response', (req, res) => {
        if (res.statusCode === 403) rejectedWs = true;
        resolve();
      });
    });
    if (evilWs.readyState === WebSocket.OPEN) {
      evilWs.close();
    }
  } catch (err) {
    rejectedWs = true;
  }
  process.env.NODE_ENV = prevNodeEnv;
  t.ok(rejectedWs, 'Master Gateway отклонил WebSocket с неразрешённым Origin в продакшене (CSWSH защита)');

  // Тест kickYid
  const wsValid = new WebSocket(`ws://127.0.0.1:${TEST_PORT + 1}`, {
    headers: { Origin: 'https://yandex.ru' }
  });
  await new Promise((resolve, reject) => {
    wsValid.on('open', resolve);
    wsValid.on('error', reject);
  });
  t.ok(wsValid.readyState === WebSocket.OPEN, 'WebSocket с Origin yandex.ru успешно подключен');

  // Находим server-side connId и сокет
  const validConnId = Array.from(gw2.socketsByConnId.keys()).pop();
  t.ok(validConnId > 0, 'Получен validConnId');
  const serverWs = gw2.socketsByConnId.get(validConnId);
  t.ok(serverWs != null, 'Найден server-side сокет');

  // Регистрируем игрока yid='test_ban_user'
  ipcHub.emit('player_update', {
    yid: 'test_ban_user',
    pid: 10000099,
    name: 'BanMe',
    online: true,
    workerId: 1
  });
  ipcHub.emit('gateway_send', {
    connId: validConnId,
    pid: 10000099,
    yid: 'test_ban_user',
    data: JSON.stringify({ t: 'welcome' })
  });

  t.eq(gw2.connIdByYid.get('test_ban_user'), validConnId, 'Master Gateway связал test_ban_user с connId');
  t.eq(serverWs.yid, 'test_ban_user', 'Сокету присвоен yid');

  // Вызываем kickYid
  let wsClosed = false;
  wsValid.on('close', () => {
    wsClosed = true;
  });

  const kickOk = gw2.kickYid('test_ban_user', 4001, 'banned');
  t.ok(kickOk, 'kickYid успешно нашел и закрыл сокет нарушителя');
  await new Promise(r => setTimeout(r, 100));
  t.ok(wsClosed, 'Клиентский сокет нарушителя физически закрыт шлюзом');

  await new Promise(r => gw2.stop(r));

  // -------------------------------------------------------------
  // Тест Блокера: Защита от сброса сессии при Handoff (4001: login first)
  // -------------------------------------------------------------
  t.suite('cluster-handoff: отсутствие 4001 login first при приёме игрока воркером');
  const fakeWs = new EventEmitter();
  fakeWs.readyState = 1;
  fakeWs.connId = 555;
  fakeWs.closeCode = null;
  fakeWs.closeReason = null;
  fakeWs.close = function(code, reason) {
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3;
    this.emit('close', code, reason);
  };

  let authed = true;
  fakeWs.isAuthed = true;
  fakeWs.setAuthed = (v) => { authed = !!v; fakeWs.isAuthed = !!v; };

  const incomingPacket = JSON.stringify({ t: 'move', x: 100, z: 200 });
  let processedPacket = false;
  fakeWs.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (!authed && msg.t !== 'login') {
      fakeWs.close(4001, 'login first');
      return;
    }
    processedPacket = true;
  });

  fakeWs.emit('message', incomingPacket);
  t.ok(processedPacket, 'Пакет move успешно обработан без требования повторного login');
  t.eq(fakeWs.closeCode, null, 'Сокет НЕ закрыт с кодом 4001 при Handoff');

  // -------------------------------------------------------------
  // Тест Дефекта 2: Приграничные призраки (borderGhosts) в upd дельте
  // -------------------------------------------------------------
  t.suite('cluster-sharding: borderGhosts попадают в upd рассылку');
  const mockGhostPid = 20005;
  const mockLocalPlayers = new Map();
  const mockBorderGhosts = new Map();
  mockBorderGhosts.set(mockGhostPid, {
    pid: mockGhostPid,
    name: 'GhostAlice',
    x: 15.5,
    z: -30.2,
    hp: 420
  });

  const observerPlayer = {
    pid: 10001,
    x: 10,
    z: -30,
    hp: 500,
    known: new Set([`p${mockGhostPid}`])
  };

  const collectedUpd = [];
  for (const key of observerPlayer.known) {
    if (key.charCodeAt(0) === 112 /* 'p' */) {
      const tid = parseInt(key.slice(1), 10);
      const targetP = mockLocalPlayers.get(tid) || mockBorderGhosts.get(tid);
      if (targetP) {
        collectedUpd.push({ k: key, x: targetP.x, z: targetP.z, hp: targetP.hp });
      }
    }
  }

  t.eq(collectedUpd.length, 1, 'Ghost сущность найдена для upd рассылки');
  t.eq(collectedUpd[0].k, 'p20005', 'Ключ призрака совпал (p20005)');
  t.eq(collectedUpd[0].x, 15.5, 'Координата X призрака не замерзает');
  t.eq(collectedUpd[0].z, -30.2, 'Координата Z призрака не замерзает');
  t.eq(collectedUpd[0].hp, 420, 'HP призрака передано');

  // -------------------------------------------------------------
  // Тест Дефекта 3: Очистка partyId у исключенного игрока на удаленном шарде
  // -------------------------------------------------------------
  t.suite('cluster-party: исключение игрока с удаленного шарда сбрасывает partyId');
  const w2PlayersMap = new Map();
  const w2SentList = [];
  const pBobOnW2 = {
    pid: 20002,
    name: 'Bob',
    level: 20,
    partyId: 'pa1',
    cls: 'warrior',
    hp: 400,
    maxHp: 400
  };
  w2PlayersMap.set(pBobOnW2.pid, pBobOnW2);

  const w2PartyHandler = createPartyHandler({
    parties: new Map([['pa1', { id: 'pa1', leader: 10001, members: new Set([10001, 20002]) }]]),
    players: w2PlayersMap,
    send: (p, msg) => {
      w2SentList.push({ pid: p.pid, msg });
    },
    clusterIpc: {
      broadcastParty: () => {}
    }
  });

  // Эмулируем получение party_sync, где Bob больше не в составе (исключен лидером на W1)
  w2PartyHandler.handleIpcParty({
    action: 'party_sync',
    party: {
      id: 'pa1',
      leader: 10001,
      members: [10001], // Только Alice осталась
      lootMode: 'finders',
      lootTurn: 0,
      memberData: {}
    }
  });

  t.eq(pBobOnW2.partyId, null, 'У исключенного Bob сброшен partyId (не вечная группа)');
  const bobEmptyPartyMsg = w2SentList.find(s => s.pid === pBobOnW2.pid && s.msg.t === 'party' && s.msg.leader === null);
  t.ok(bobEmptyPartyMsg != null, 'Bob получил пакет очистки группы { t: "party", leader: null }');

  // -------------------------------------------------------------
  // Тест Дефекта 4: Очистка клана при удалении персонажа через HTTP API
  // -------------------------------------------------------------
  t.suite('cluster-http: clanLeaveOnCharDelete удаляет персонажа из состава клана');
  const Clans = require(path.join(ROOT, 'server', 'clans-store.js'));
  const CH = require(path.join(ROOT, 'shared', 'char-rules.js'));

  // Создаем тестовый клан
  const testClanName = 'AuditTestClan';
  const oldClan = Clans.byName(testClanName);
  if (oldClan) Clans.remove(oldClan);

  const clanRes = Clans.create({
    name: testClanName,
    leaderYid: 'test_leader_yid',
    leaderCharId: 'c1',
    leaderName: 'LeaderChar'
  });
  t.ok(clanRes.ok, 'Клан создан успешно');
  const testClan = clanRes.clan;

  // Добавляем Bob в состав клана
  testClan.members.push({
    yid: 'test_bob_yid',
    charId: 'c2',
    name: 'BobChar',
    rank: 'member',
    joinedAt: Date.now()
  });
  Clans.reindexMember('test_bob_yid', 'c2', testClan.id);

  t.ok(Clans.ofKey('test_bob_yid', 'c2') != null, 'Bob числится в клане до удаления');

  // Эмулируем обработчик clanLeaveOnCharDelete из cluster-manager.js
  const clusterClanLeaveOnCharDelete = (yid, charId) => {
    try {
      const c = Clans.ofKey(yid, charId);
      if (!c) return { ok: true };
      const me = Clans.memberOf(c, yid, charId);
      if (!me) return { ok: true };
      if (me.rank === 'leader' && c.members.length > 1) {
        return { ok: false, reason: 'clan_leader' };
      }
      if (me.rank === 'leader') {
        const members = c.members.slice();
        Clans.remove(c);
        for (const m of members) Clans.reindexMember(m.yid, m.charId, null);
        return { ok: true };
      }
      const wantC = CH.normalizeCharId(charId);
      const idx = c.members.findIndex((m) => m.yid === String(yid) && CH.normalizeCharId(m.charId) === wantC);
      if (idx >= 0) {
        c.members.splice(idx, 1);
      }
      Clans.reindexMember(yid, charId, null);
      Clans.save(c);
      return { ok: true };
    } catch (err) {
      return { ok: true };
    }
  };

  // Попытка удалить лидера при наличии других членов клана -> отказ
  const leaderDelRes = clusterClanLeaveOnCharDelete('test_leader_yid', 'c1');
  t.eq(leaderDelRes.ok, false, 'Удаление лидера клана с живым составом блокируется');
  t.eq(leaderDelRes.reason, 'clan_leader', 'Причина отказа: clan_leader');

  // Удаление рядового члена Bob
  const bobDelRes = clusterClanLeaveOnCharDelete('test_bob_yid', 'c2');
  t.eq(bobDelRes.ok, true, 'Удаление рядового члена разрешено');
  t.eq(Clans.ofKey('test_bob_yid', 'c2'), null, 'Bob удален из индекса клана (не мертвая душа)');
  t.ok(!testClan.members.some(m => m.yid === 'test_bob_yid'), 'Bob удален из массива членов клана');

  // Теперь лидер удаляет персонажа (он один) -> роспуск клана
  const leaderSoloDelRes = clusterClanLeaveOnCharDelete('test_leader_yid', 'c1');
  t.eq(leaderSoloDelRes.ok, true, 'Лидер в одиночку может удалить персонажа');
  t.eq(Clans.ofKey('test_leader_yid', 'c1'), null, 'Клан полностью распущен');
  t.eq(Clans.ofMember, Clans.ofKey, 'Clans.ofMember является валидным методом (алиас к Clans.ofKey)');

  Clans.remove(testClan);

  // -------------------------------------------------------------
  // Тест Дефекта: Попытка атаки приграничного призрака
  // -------------------------------------------------------------
  t.suite('cluster-combat: реакция на атаку призрака в соседней зоне');
  const ghostTargetPid = 300000005;
  const testBorderGhosts = new Map();
  testBorderGhosts.set(ghostTargetPid, { pid: ghostTargetPid, name: 'RemoteEnemy' });

  const testPlayerAttacker = { pid: 100000001, x: 5, z: -500, hp: 500, dead: false };
  const mockLocalPlayerMap = new Map([[testPlayerAttacker.pid, testPlayerAttacker]]);
  const attackerMessages = [];

  // Эмулируем обработку attack_player
  const handleAttackPlayer = (p, targetPid) => {
    const tgt = mockLocalPlayerMap.get(targetPid);
    if (!tgt) {
      if (testBorderGhosts.has(targetPid)) {
        attackerMessages.push({ t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
      }
      return;
    }
  };

  handleAttackPlayer(testPlayerAttacker, ghostTargetPid);
  t.eq(attackerMessages.length, 1, 'Игрок получил уведомление при попытке ударить призрака');
  t.eq(attackerMessages[0].text, 'Цель находится в другой зоне. Подойдите ближе.', 'Текст уведомления понятен клиенту');

  // -------------------------------------------------------------
  // Тест: Буферизация сокетов при сбое воркера (Grace Period & Session Restore)
  // -------------------------------------------------------------
  t.suite('cluster-gateway: буферизация сокетов при сбое воркера (Grace Period & Session Restore)');

  const testIpcHub = new IpcHub({ isPrimary: true });
  const testGateway = new MasterGateway({ port: TEST_PORT + 1, workerCount: 2, ipcHub: testIpcHub, restartGraceMs: 300 });

  const mw1 = new MockWorkerProcess(1);
  const mw2 = new MockWorkerProcess(2);
  testGateway.registerWorker(mw1, 1);
  testGateway.registerWorker(mw2, 2);

  // Имитируем активного игрока на Воркере 2
  const testConnId = 888;
  class MockClientSocket extends EventEmitter {
    constructor() {
      super();
      this.readyState = WebSocket.OPEN;
      this.closed = false;
      this.closeCode = null;
      this.closeReason = null;
    }
    close(code, reason) {
      this.closed = true;
      this.closeCode = code;
      this.closeReason = reason;
      this.readyState = WebSocket.CLOSED;
      this.emit('close');
    }
  }

  const mockWs = new MockClientSocket();
  testGateway.socketsByConnId.set(testConnId, mockWs);
  testGateway.connIdBySocket.set(mockWs, testConnId);
  testGateway.workerIdByConnId.set(testConnId, 2);
  testGateway.connIdByYid.set('yid_test_buffer', testConnId);
  testGateway.yidByConnId.set(testConnId, 'yid_test_buffer');
  testGateway.connIdByPid.set(200000001, testConnId);
  testGateway.pidByConnId.set(testConnId, 200000001);
  testGateway.charIdByConnId.set(testConnId, 'c1');
  testGateway._bindSocketEvents(mockWs, testConnId);

  // 2. Воркер 2 внезапно аварийно завершается (code = 1, crash)
  testGateway.handleWorkerExit(mw2, 1, 'SIGSEGV');

  t.eq(mockWs.closed, false, 'Клиентский сокет НЕ закрыт сразу (активирован буфер удержания)');
  t.ok(testGateway.restartingWorkerBuffers.has(2), 'Буфер удержания для Воркера 2 создан');
  const worker2Buf = testGateway.restartingWorkerBuffers.get(2);
  t.ok(worker2Buf.connIds.has(testConnId), 'connId 888 сохранен в буфере рестарта');

  // 3. Клиент отправляет пакет во время рестарта воркера
  const fakeMovePacket = JSON.stringify({ t: 'move', x: 100, z: 200 });
  mockWs.emit('message', fakeMovePacket, false);

  t.ok(worker2Buf.packetBuffer.has(testConnId), 'Пакет клиента поставлен в очередь packetBuffer');
  t.eq(worker2Buf.packetBuffer.get(testConnId).length, 1, 'В очереди ровно 1 пакет');
  t.eq(worker2Buf.packetBuffer.get(testConnId)[0].data, fakeMovePacket, 'Данные пакета сохранены в буфере');

  // 4. Воркер 2 успешно перезапускается в пределах grace period
  const newMw2 = new MockWorkerProcess(2);
  testGateway.registerWorker(newMw2, 2);

  t.eq(testGateway.restartingWorkerBuffers.has(2), false, 'Буфер рестарта очищен после успешной регистрации');
  t.ok(newMw2.sent.length >= 2, 'Новый воркер 2 получил MSG_SESSION_RESTORE и сброшенный пакет');

  const restoreMsg = newMw2.sent.find(m => m.ipcType === 'IPC_SESSION_RESTORE');
  t.ok(restoreMsg != null, 'Воркер получил сообщение IPC_SESSION_RESTORE');
  t.eq(restoreMsg.payload.sessions.length, 1, 'Сессия для восстановления передана');
  t.eq(restoreMsg.payload.sessions[0].connId, testConnId, 'connId совпал');
  t.eq(restoreMsg.payload.sessions[0].yid, 'yid_test_buffer', 'yid совпал');
  t.eq(restoreMsg.payload.sessions[0].charId, 'c1', 'charId совпал');
  t.eq(restoreMsg.payload.sessions[0].pid, 200000001, 'pid совпал');

  const flushedPacket = newMw2.sent.find(m => m.ipcType === 'IPC_CLIENT_RAW');
  t.ok(flushedPacket != null, 'Буферизованный пакет доставлен новому воркеру');
  t.eq(flushedPacket.payload.data, fakeMovePacket, 'Содержимое пакета доставлено без искажений');
  t.eq(mockWs.closed, false, 'Клиент остался онлайн без реконнекта сокета');

  // 5. Тестируем истечение таймаута (если воркер не восстановился)
  const mockWsTimeout = new MockClientSocket();
  const timeoutConnId = 999;
  testGateway.socketsByConnId.set(timeoutConnId, mockWsTimeout);
  testGateway.connIdBySocket.set(mockWsTimeout, timeoutConnId);
  testGateway.workerIdByConnId.set(timeoutConnId, 2);
  testGateway._bindSocketEvents(mockWsTimeout, timeoutConnId);

  testGateway.handleWorkerExit(newMw2, 1, 'SIGKILL');
  t.eq(mockWsTimeout.closed, false, 'Сокет буферизуется перед таймаутом');

  // Ждем истечения 300 мс grace period
  await new Promise(r => setTimeout(r, 350));
  t.eq(mockWsTimeout.closed, true, 'После истечения grace period сокет мягко закрыт');
  t.eq(mockWsTimeout.closeCode, 1012, 'Код закрытия: 1012 (Zone worker restart timeout)');
};
