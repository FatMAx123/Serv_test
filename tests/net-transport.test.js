// ============================================================
//  TESTS / NET-TRANSPORT.TEST.JS
//  Тестирование сетевого транспорта: ws fallback и uWebSockets.js
//  с поддержкой нативного Pub/Sub, corking, drain, единого HTTP+WS порта
//  и бинарных Zero-Copy сообщений.
// ============================================================
'use strict';

const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const ROOT = path.join(__dirname, '..');
const NetTransport = require(path.join(ROOT, 'server', 'net-transport.js'));
const NPB = require(path.join(ROOT, 'shared', 'net-pack-binary.js'));

module.exports = async function (t) {
  t.suite('net-transport: ws fallback транспорт и эмуляция pub/sub');
  const httpServer = http.createServer();
  await new Promise((resolve) => httpServer.listen(18091, '127.0.0.1', resolve));

  const wsTransport = NetTransport.createNetworkTransport({
    server: httpServer,
    engine: 'ws'
  });

  t.eq(wsTransport.type, 'ws', 'создан транспорт типа ws');

  let wsReceivedTopicMsg = null;
  wsTransport.server.on('connection', (socket) => {
    socket.subscribe('chat_global');
  });

  const client1 = new WebSocket('ws://127.0.0.1:18091');
  await new Promise((resolve) => client1.on('open', resolve));

  client1.on('message', (data) => {
    wsReceivedTopicMsg = String(data);
  });

  wsTransport.server.publish('chat_global', 'hello-from-ws-pubsub');
  await new Promise((r) => setTimeout(r, 100));

  t.eq(wsReceivedTopicMsg, 'hello-from-ws-pubsub', 'ws pub/sub эмуляция успешно доставила сообщение');

  client1.close();
  wsTransport.close();

  // ── uWebSockets.js ───────────────────────────────────────────
  t.suite('net-transport: uWebSockets.js C++ транспорт');
  t.ok(NetTransport.hasUws, 'uWebSockets.js успешно подключён');

  if (NetTransport.hasUws) {
    let uwsGotBin = null;
    let uwsGotText = null;
    let connectedSocket = null;

    const uwsTransport = NetTransport.createNetworkTransport({
      engine: 'uws',
      maxPayload: 64 * 1024
    });

    t.eq(uwsTransport.type, 'uws', 'создан транспорт типа uws');

    uwsTransport.server.on('connection', (socket) => {
      connectedSocket = socket;
      socket.subscribe('zone_island');
      socket.subscribe('world');
      socket.on('message', (msg, isBin) => {
        if (isBin) {
          const opcode = NPB.getOpcode(msg);
          if (opcode === NPB.OP_MOVE) {
            uwsGotBin = NPB.decodeMove(msg);
          }
        } else {
          uwsGotText = String(msg);
        }
      });
    });

    await new Promise((resolve, reject) => {
      uwsTransport.server.listen(18092, '127.0.0.1', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    let clientGotPubSub = null;
    const client2 = new WebSocket('ws://127.0.0.1:18092');
    await new Promise((resolve) => client2.on('open', resolve));

    client2.on('message', (data) => {
      if (Buffer.isBuffer(data) && data.length > 0 && data[0] === NPB.OP_UPD) {
        clientGotPubSub = 'binary_upd_received';
      } else {
        clientGotPubSub = data.toString('utf8');
      }
    });

    // 1. Проверка текстового сообщения
    client2.send('test-text-message');
    await new Promise((r) => setTimeout(r, 80));
    t.eq(uwsGotText, 'test-text-message', 'uWS принял текстовое сообщение');

    // 2. Проверка бинарного Zero-Copy MOVE пакета
    const binMove = NPB.encodeMove(250.5, -400.25, false, 77);
    client2.send(binMove);
    await new Promise((r) => setTimeout(r, 80));
    t.ok(uwsGotBin && uwsGotBin.seq === 77 && uwsGotBin.x === 250.5, 'uWS принял и распаковал бинарный MOVE пакет');

    // 3. Проверка нативного C++ Pub/Sub через publish
    uwsTransport.publish('zone_island', 'c++-pubsub-broadcast');
    await new Promise((r) => setTimeout(r, 80));
    t.eq(clientGotPubSub, 'c++-pubsub-broadcast', 'uWS C++ Pub/Sub мгновенно доставил широковещательный пакет');

    // 4. Проверка нативной рассылки бинарного UPD через publish
    const binUpd = NPB.encodeUpd([{ k: 'p5', x: 10, z: 20, hp: 100 }]);
    uwsTransport.publish('zone_island', binUpd, true);
    await new Promise((r) => setTimeout(r, 80));
    t.eq(clientGotPubSub, 'binary_upd_received', 'uWS C++ Pub/Sub доставил бинарный UPD');

    // 5. Проверка corking и подписок (isSubscribed / numSubscribers)
    t.ok(connectedSocket && connectedSocket.isSubscribed('world'), 'connectedSocket.isSubscribed("world") возвращает true');
    t.ok(connectedSocket.isSubscribed('zone_island'), 'connectedSocket.isSubscribed("zone_island") возвращает true');
    t.ok(!connectedSocket.isSubscribed('non_existent_topic'), 'connectedSocket.isSubscribed на чужой топик false');

    let corkExecuted = false;
    connectedSocket.cork(() => {
      connectedSocket.send('corked-message-test');
      corkExecuted = true;
    });
    t.ok(corkExecuted, 'connectedSocket.cork успешно выполнил коллбэк');

    let serverCorkExecuted = false;
    uwsTransport.cork(() => {
      uwsTransport.publish('world', 'corked-pubsub');
      serverCorkExecuted = true;
    });
    t.ok(serverCorkExecuted, 'uwsTransport.cork успешно выполнил коллбэк');

    // 6. Проверка отписки unsubscribe
    connectedSocket.unsubscribe('zone_island');
    t.ok(!connectedSocket.isSubscribed('zone_island'), 'после unsubscribe("zone_island") топик снят');

    client2.close();
    await new Promise((r) => setTimeout(r, 80));
    uwsTransport.close();

    // 7. Проверка безопасности закрытого сокета (защита от use-after-free)
    t.eq(connectedSocket.readyState, 3, 'после закрытия readyState === 3');
    t.eq(connectedSocket.bufferedAmount, 0, 'bufferedAmount на закрытом сокете возвращает 0 без сбоев');
    connectedSocket.send('no-op');
    connectedSocket.ping();
    connectedSocket.cork(() => {});
    t.ok(true, 'вызовы send/ping/cork на закрытом сокете безопасны и не вызывают segfault');
  }

  // ── Unified HTTP + WebSocket на одном порту ────────────────
  t.suite('net-transport: единый HTTP+WS порт через uWebSockets.js');
  if (NetTransport.hasUws) {
    const internalApp = http.createServer((req, res) => {
      if (req.url === '/api/test-data') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', server: 'internal-node' }));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    });

    const unifiedTransport = NetTransport.createNetworkTransport({
      server: internalApp,
      engine: 'uws'
    });

    t.eq(unifiedTransport.type, 'uws', 'создан гибридный uws транспорт при наличии server');

    let wsReceivedEcho = null;
    unifiedTransport.server.on('connection', (ws) => {
      ws.on('message', (msg) => {
        wsReceivedEcho = 'echo:' + msg.toString();
        ws.send(wsReceivedEcho);
      });
    });

    await new Promise((resolve) => unifiedTransport.listen(18093, '127.0.0.1', resolve));

    // Проверяем HTTP через тот же порт 18093
    const httpRes = await fetch('http://127.0.0.1:18093/api/test-data');
    t.eq(httpRes.status, 200, 'HTTP GET /api/test-data вернул 200 OK через uWS прокси');
    const httpData = await httpRes.json();
    t.eq(httpData.status, 'ok', 'HTTP тело ответа корректно передано');

    // Проверяем WebSocket через тот же порт 18093
    const wsClient = new WebSocket('ws://127.0.0.1:18093/');
    await new Promise((resolve) => wsClient.on('open', resolve));
    wsClient.send('ping-unified');
    const wsClientEcho = await new Promise((resolve) => wsClient.on('message', (d) => resolve(d.toString())));

    t.eq(wsReceivedEcho, 'echo:ping-unified', 'uWS принял WebSocket сообщение на общем порту');
    t.eq(wsClientEcho, 'echo:ping-unified', 'Клиент получил ответ от uWS сокета');

    wsClient.close();
    await new Promise((r) => setTimeout(r, 50));
    await new Promise((resolve) => unifiedTransport.close(resolve));
  }

  // ── assertProductionTransport & Strict Mode ────────────────
  t.suite('net-transport: assertProductionTransport и строгий контроль в Production');

  const prodCheck = NetTransport.assertProductionTransport({ engine: 'uws', strict: false });
  t.ok(prodCheck.ok, 'assertProductionTransport: uWS успешно подтвержден для продакшена');
  t.eq(prodCheck.engine, 'uws', 'assertProductionTransport: выбран uws');

  // Проверка автовыбора: при наличии uWS фабрика должна предпочитать uws даже при наличии opts.server
  const autoTransport = NetTransport.createNetworkTransport({ server: http.createServer() });
  t.eq(autoTransport.type, NetTransport.hasUws ? 'uws' : 'ws', 'createNetworkTransport: автовыбор предпочитает uws при наличии аддона даже с server');
  autoTransport.close();

  // Проверка выброса ошибки при строгом требовании uws и запросе ws
  let strictWsThrew = false;
  try {
    NetTransport.assertProductionTransport({ engine: 'ws', strict: true });
  } catch (e) {
    strictWsThrew = e.message.includes('[NET_TRANSPORT_FATAL]');
  }
  t.ok(strictWsThrew, 'assertProductionTransport: strict: true выбрасывает FATAL при попытке использовать ws');
};

