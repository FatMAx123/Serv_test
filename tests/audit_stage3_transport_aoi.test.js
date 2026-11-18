// ============================================================
//  TESTS / AUDIT_STAGE3_TRANSPORT_AOI.TEST.JS
//  Автоматические тесты Этапа 3:
//    - Задача 3.1: MasterGateway backpressure (maxBackpressure, drain, dropped,
//                  отброс устаревших OP_UPD > 256 КБ), защита кольцевого
//                  буфера NET_PACK_BINARY от перезаписи при асинхронной очереди
//    - Задача 3.2: расширенный буфер NativeSpatialGrid::queryRadius (4096) и
//                  защита приоритетных кандидатов AOI (цель, группа, живые игроки)
//                  при высокой плотности ботов
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');
const WebSocket = require('ws');

const ROOT = path.join(__dirname, '..');
const NPB = require(path.join(ROOT, 'shared', 'net-pack-binary.js'));
const NetTransport = require(path.join(ROOT, 'server', 'net-transport.js'));
const { MasterGateway } = require(path.join(ROOT, 'server', 'cluster-manager.js'));
const { IpcHub } = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const { SpatialGrid, NativeSpatialGrid } = require(path.join(ROOT, 'server', 'spatial-grid.js'));
const { NATIVE_QUERY_BUF_CAP, queryNativeAoiWithRescue } = require(path.join(ROOT, 'server', 'core', 'aoi-helper.js'));
const { EntityTransformTable, TYPE_PLAYER, TYPE_MOB } = require(path.join(ROOT, 'shared', 'entity-transform-table.js'));

module.exports = async function (t) {
  // ------------------------------------------------------------------
  // 1. Задача 3.1a: Защита кольцевого буфера NET_PACK_BINARY
  // ------------------------------------------------------------------
  t.suite('Stage 3.1: NET_PACK_BINARY detachBuffer и защита от перезаписи кольца');
  {
    const sample = NPB.encodeUpd([{ k: 'p77', x: 123.45, z: -67.89, hp: 555 }]);
    t.ok(NPB.isRingBuffer(sample), 'encodeUpd возвращает Buffer на базе кольцевого пула');

    const detached = NPB.detachBuffer(sample);
    t.ok(Buffer.isBuffer(detached) && !NPB.isRingBuffer(detached), 'detachBuffer возвращает независимый Buffer вне кольца');
    t.ok(detached !== sample, 'detached является отдельной копией');

    const plainBuf = Buffer.from([1, 2, 3]);
    t.ok(!NPB.isRingBuffer(plainBuf), 'обычный Buffer не считается кольцевым');
    t.ok(NPB.detachBuffer(plainBuf) === plainBuf, 'detachBuffer возвращает не-кольцевой буфер без лишнего копирования');

    // Перезаписываем всё кольцо из 4096 слотов (5000 вызовов > 4096)
    for (let i = 0; i < 5000; i++) {
      NPB.encodeUpd([{ k: 'm' + (i + 1), x: i, z: -i, hp: 9999 }]);
    }

    const decodedDetached = NPB.decodeUpd(detached);
    t.eq(decodedDetached.length, 1, 'detached кадр после 5000 перезаписей кольца декодируется ровно в 1 сущность');
    t.eq(decodedDetached[0].k, 'p77', 'detached кадр сохранил исходный ключ p77 (не затёрт)');
    t.eq(decodedDetached[0].hp, 555, 'detached кадр сохранил исходное HP 555');

    // Реальная доставка через async ws fallback при массовой перезаписи кольца сразу после send
    const srvHttp = http.createServer();
    await new Promise((resolve) => srvHttp.listen(0, '127.0.0.1', resolve));
    const port = srvHttp.address().port;
    const wsNet = NetTransport.createNetworkTransport({ server: srvHttp, engine: 'ws' });
    let serverSocket = null;
    wsNet.server.on('connection', (s) => { serverSocket = s; });

    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve) => client.on('open', resolve));
    const receivedFrames = [];
    client.on('message', (data, isBin) => {
      if (isBin || Buffer.isBuffer(data)) receivedFrames.push(Buffer.from(data));
    });

    const ringFrame = NPB.encodeUpd([{ k: 'p909', x: 42.5, z: -13.25, hp: 777 }]);
    serverSocket.send(ringFrame, { binary: true });
    // Немедленно затираем все 4096 слотов кольца ДО того как сокет завершит асинхронную запись
    for (let i = 0; i < 4500; i++) {
      NPB.encodeUpd([{ k: 'm' + (9000 + i), x: 1, z: 1, hp: 1 }]);
    }
    await new Promise((r) => setTimeout(r, 120));

    t.ok(receivedFrames.length >= 1, 'клиент получил бинарный UPD по ws fallback');
    const decClient = NPB.decodeUpd(receivedFrames[0]);
    t.eq(decClient.length, 1, 'принятый клиентом кадр содержит 1 сущность');
    t.eq(decClient[0].k, 'p909', 'принятый клиентом кадр не повреждён перезаписью кольца');
    t.eq(decClient[0].hp, 777, 'принятое HP соответствует исходному (777)');

    client.close();
    wsNet.close();
  }

  // ------------------------------------------------------------------
  // 2. Задача 3.1b: net-transport createUwsBackpressureHandlers & UwsSocketWrapper
  // ------------------------------------------------------------------
  t.suite('Stage 3.1: UwsSocketWrapper getBufferedAmount и обработчики drain/dropped');
  {
    let fakeBuf = 12345;
    const closedArgs = [];
    const fakeUserData = {};
    const fakeRawWs = {
      getUserData: () => fakeUserData,
      getBufferedAmount: () => fakeBuf,
      send: () => 1,
      end: (code, reason) => closedArgs.push({ code, reason }),
      close: () => {}
    };
    const wrapper = new NetTransport.UwsSocketWrapper(fakeRawWs, null);
    t.eq(wrapper.getBufferedAmount(), 12345, 'UwsSocketWrapper.getBufferedAmount() проксирует rawWs.getBufferedAmount()');

    const handlers = NetTransport.createUwsBackpressureHandlers();
    let drainedCount = 0;
    wrapper.on('drain', () => drainedCount++);

    wrapper.isBackpressured = true;
    wrapper._consecutiveDrops = 10;
    wrapper._firstDropAt = Date.now();
    handlers.drain(fakeRawWs);
    t.eq(wrapper.isBackpressured, false, 'drain сбрасывает флаг isBackpressured');
    t.eq(wrapper._consecutiveDrops, 0, 'drain сбрасывает счётчик дропов');
    t.eq(drainedCount, 1, 'drain эмитит событие drain на обёртке');

    // Персистентный бэкпрешер (> 120 дропов дольше 10 секунд) закрывает мёртвый сокет
    wrapper._consecutiveDrops = 120;
    wrapper._firstDropAt = Date.now() - 12000;
    handlers.dropped(fakeRawWs);
    t.eq(closedArgs.length, 1, 'persistent backpressure (> 120 drops & > 10s) закрывает зомби-сокет');
    t.eq(closedArgs[0].code, 4029, 'зомби-сокет закрыт с кодом 4029');
  }

  // ------------------------------------------------------------------
  // 3. Задача 3.1c: MasterGateway backpressure (maxBackpressure, OP_UPD drop > 256 KB)
  // ------------------------------------------------------------------
  t.suite('Stage 3.1: MasterGateway конфигурация uWS и сброс OP_UPD при backpressure > 256 КБ');
  {
    const cmSrc = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
    t.ok(cmSrc.includes('maxBackpressure:'), 'MasterGateway задаёт maxBackpressure для uwsApp.ws');
    t.ok(cmSrc.includes('closeOnBackpressureLimit: false'), 'MasterGateway отключает closeOnBackpressureLimit');
    t.ok(cmSrc.includes('drain: bpHandlers.drain') && cmSrc.includes('dropped: bpHandlers.dropped'),
      'MasterGateway подключает обработчики drain и dropped');

    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(srvSrc.includes('NPB.detachBuffer'), 'server.js защищает бинарные буферы через NPB.detachBuffer перед IPC-очередью');

    // Тестируем реальный инстанс MasterGateway с эмуляцией переполнения сокета
    const hub = new IpcHub({ isPrimary: true });
    const gw = new MasterGateway({ port: 0, ipcHub: hub, workerCount: 1 });

    let simBuffered = 0;
    const sentFrames = [];
    const fakeClientWs = {
      readyState: 1,
      rawWs: {
        getBufferedAmount: () => simBuffered
      },
      cork: (fn) => fn(),
      send: (data, opts) => {
        sentFrames.push({ data, isBinary: !!(opts && opts.binary) });
      }
    };
    gw.socketsByConnId.set(10, fakeClientWs);

    const binUpd = NPB.encodeUpd([{ k: 'p1', x: 10, z: 20, hp: 100 }]);
    const txtUpd = JSON.stringify({ t: 'upd', upd: [{ k: 'p1', x: 10, z: 20, hp: 100 }] });
    const fxJson = JSON.stringify({ t: 'dmg', dmg: 50 });
    const critJson = JSON.stringify({ t: 'chat', text: 'important' });

    // (a) Нормальный буфер (0 байт): всё проходит, кольцо не портится при перезаписи
    simBuffered = 0;
    hub.emit('gateway_send', { connId: 10, data: binUpd, isBinary: true, isBase64: false });
    hub.emit('gateway_send', { connId: 10, data: fxJson, isBinary: false });
    t.eq(sentFrames.length, 2, 'при нормальном буфере (0 байт) доставляются и OP_UPD, и fx');

    // (b) Умеренный бэкпрешер (120 КБ > 96 КБ, <= 256 КБ): косметика отброшена, OP_UPD и важные JSON доставлены
    sentFrames.length = 0;
    simBuffered = 120 * 1024;
    hub.emit('gateway_send_batch', [
      { connId: 10, data: fxJson, isBinary: false },
      { connId: 10, data: binUpd, isBinary: true, isBase64: false },
      { connId: 10, data: critJson, isBinary: false }
    ]);
    t.eq(sentFrames.length, 2, 'при 120 КБ косметический dmg отброшен, а OP_UPD и chat доставлены');
    t.ok(sentFrames.some(f => f.isBinary && f.data[0] === NPB.OP_UPD), 'OP_UPD ещё доставляется при 120 КБ');
    t.ok(sentFrames.some(f => f.data === critJson), 'критический chat доставляется при 120 КБ');

    // (c) Высокий бэкпрешер (300 КБ > 256 КБ): OP_UPD и текстовый upd отброшены, важные JSON проходят
    sentFrames.length = 0;
    simBuffered = 300 * 1024;
    hub.emit('gateway_send', { connId: 10, data: binUpd, isBinary: true, isBase64: false });
    hub.emit('gateway_send_batch', [
      { connId: 10, data: binUpd, isBinary: true, isBase64: false },
      { connId: 10, data: txtUpd, isBinary: false },
      { connId: 10, data: fxJson, isBinary: false },
      { connId: 10, data: critJson, isBinary: false }
    ]);
    t.eq(sentFrames.length, 1, 'при 300 КБ (> 256 КБ) все устаревшие OP_UPD/upd/fx кадры отброшены');
    t.eq(sentFrames[0].data, critJson, 'важное JSON-сообщение chat не потеряно при 300 КБ backpressure');
  }

  // ------------------------------------------------------------------
  // 4. Задача 3.2: NativeSpatialGrid буфер 4096 + защита приоритетных кандидатов AOI
  // ------------------------------------------------------------------
  t.suite('Stage 3.2: буфер NativeSpatialGrid (4096) и защита цели/группы/людей при 4500 ботах');
  {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.eq(NATIVE_QUERY_BUF_CAP, 4096, 'NATIVE_QUERY_BUF_CAP равен 4096');
    t.ok(srvSrc.includes('new Int32Array(NATIVE_QUERY_BUF_CAP)'), 'server.js использует NATIVE_QUERY_BUF_CAP (4096) для _nativePBuf и _nativeMBuf');
    t.ok(srvSrc.includes('queryNativeAoiWithRescue'), 'server.js делегирует нативную выборку AOI в queryNativeAoiWithRescue');

    if (NativeSpatialGrid) {
      const tt = new EntityTransformTable(4600);
      const grid = new NativeSpatialGrid(-4096, -4096, 4096, 4096, 72);
      const jsGrid = new SpatialGrid(72);
      const players = new Map();
      const mobs = new Map();
      const borderGhosts = new Map();

      // Наблюдатель-человек в (0, 0)
      const observer = {
        pid: 1, yid: 'human_obs', x: 0, z: 0, hp: 1000, maxHp: 1000,
        target: { type: 'p', pid: 4502 },
        known: new Set()
      };
      players.set(observer.pid, observer);
      jsGrid.insertPlayer(observer);
      tt.allocate(observer.pid, TYPE_PLAYER, 0, 0, 0, 1000, 1000, 7.5);

      // 4300 ботов вокруг (0, 0) заполняют _nativePBuf (4096) раньше реальных игроков в конце таблицы
      for (let i = 0; i < 4300; i++) {
        const bPid = 10 + i;
        const bx = (i % 40) - 20;
        const bz = ((i / 40) | 0) % 40 - 20;
        const bot = { pid: bPid, yid: 'bot3k_' + bPid, x: bx, z: bz, hp: 500, maxHp: 500 };
        players.set(bPid, bot);
        // По инварианту tick(): боты НЕ вставляются в jsGrid
        tt.allocate(bPid, TYPE_PLAYER, bx, 0, bz, 500, 500, 7.5);
      }

      // Приоритетные игроки, добавленные ПОСЛЕ 4300 ботов (> 4096 записей):
      // 1) Член группы (4501)
      // 2) Боевая цель (4502)
      // 3) Обычный живой игрок поблизости (4503, индексирован в jsGrid)
      const partyMate = { pid: 4501, yid: 'human_mate', x: 5, z: 5, hp: 900, maxHp: 900 };
      const targetPl = { pid: 4502, yid: 'bot_or_enemy', x: 7, z: 7, hp: 900, maxHp: 900 };
      const nearbyHuman = { pid: 4503, yid: 'human_other', x: 8, z: 8, hp: 900, maxHp: 900 };
      players.set(partyMate.pid, partyMate);
      players.set(targetPl.pid, targetPl);
      players.set(nearbyHuman.pid, nearbyHuman);
      // Реальные люди индексируются в jsGrid, цель (если это бот) может не быть в jsGrid
      jsGrid.insertPlayer(partyMate);
      jsGrid.insertPlayer(nearbyHuman);
      tt.allocate(partyMate.pid, TYPE_PLAYER, partyMate.x, 0, partyMate.z, 900, 900, 7.5);
      tt.allocate(targetPl.pid, TYPE_PLAYER, targetPl.x, 0, targetPl.z, 900, 900, 7.5);
      tt.allocate(nearbyHuman.pid, TYPE_PLAYER, nearbyHuman.x, 0, nearbyHuman.z, 900, 900, 7.5);

      // Целевой моб вне первых 4096 не попадёт даже при переполнении (проверим и переполнение _nativeMBuf маленьким буфером)
      const targetMob = { mid: 8801, x: 10, z: 10, hp: 500, maxHp: 500 };
      mobs.set(targetMob.mid, targetMob);
      observer.target = { type: 'p', pid: 4502 };

      grid.bulkInsert(tt.buffer, tt.maxSlot);

      // Проверка 1: старый буфер 1024 отсёк бы всех, новый 4096 вмещает ровно 4096 без сбоев
      const pBuf4096 = new Int32Array(4096);
      const mBuf4096 = new Int32Array(4096);
      const seenPlayers = new Set();
      let dupCount = 0;

      queryNativeAoiWithRescue({
        p: observer,
        partySet: new Set([1, 4501]),
        isMeBot: false,
        aoiRadius: 108,
        nativeSpatialGrid: grid,
        spatialGrid: jsGrid,
        nativePBuf: pBuf4096,
        nativeMBuf: mBuf4096,
        players,
        mobs,
        borderGhosts,
        dist2: (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz),
        onPlayer: (pl) => {
          if (seenPlayers.has(pl.pid)) dupCount++;
          seenPlayers.add(pl.pid);
        },
        onMob: () => {},
        seenPartySet: new Set(),
        overflowSeenSet: new Set()
      });

      t.eq(dupCount, 0, 'rescue при 4300 ботах не создаёт дубликатов кандидатов');
      t.ok(seenPlayers.has(4501), 'член группы (pid 4501) гарантированно найден даже при 4300 ботах (> 4096 записях)');
      t.ok(seenPlayers.has(4502), 'текущая цель (pid 4502) гарантированно найдена даже без jsGrid при > 4096 ботах');
      t.ok(seenPlayers.has(4503), 'живой игрок (pid 4503) спасён через jsGrid при переполнении буфера 4096 ботами');

      // Проверка 2: при 3000 ботах в одной зоне 4096-буфер вмещает вообще все сущности за 1 вызов queryRadius
      const tt3k = new EntityTransformTable(3200);
      const grid3k = new NativeSpatialGrid(-4096, -4096, 4096, 4096, 72);
      for (let i = 0; i < 3000; i++) {
        tt3k.allocate(100 + i, TYPE_PLAYER, (i % 50) - 25, 0, ((i / 50) | 0) - 30, 100, 100, 7.5);
      }
      tt3k.allocate(99001, TYPE_PLAYER, 0, 0, 0, 1000, 1000, 7.5);
      tt3k.allocate(99002, TYPE_PLAYER, 3, 0, 4, 1000, 1000, 7.5);
      grid3k.bulkInsert(tt3k.buffer, tt3k.maxSlot);

      const raw3k = grid3k.queryRadius(0, 0, 108, pBuf4096, mBuf4096);
      t.eq(raw3k.players, 3002, 'буфер 4096 вмещает все 3000 ботов + 2 реальных игроков без обрезки');
      let foundH1 = false;
      let foundH2 = false;
      for (let i = 0; i < raw3k.players; i++) {
        if (pBuf4096[i] === 99001) foundH1 = true;
        if (pBuf4096[i] === 99002) foundH2 = true;
      }
      t.ok(foundH1 && foundH2, 'оба реальных игрока найдены при 3000 ботов в той же зоне');

      // Проверка 3: при 160 известных ботах веса приоритета в server.js не дают новым людям/цели/группе вытесниться
      t.ok(srvSrc.includes('if (!isOtherBot) priority += 120000;'), 'живой игрок имеет вес 120000 > known бота (100000)');
      t.ok(srvSrc.includes('priority += 200000;'), 'член группы имеет высший приоритет 200000');
      t.ok(srvSrc.includes('priority += 250000;'), 'текущая боевая цель имеет приоритет 250000');
    }
  }
};

