// ============================================================
//  TESTS / P1-CLUSTER-INTEGRITY.TEST.JS
//  Проверка кластерной целостности P1:
//    1. MasterGateway: EditorGuard в serveStatic, реальный httpRouter (worldTime/isGM/clan_sync), ws.cork() батчинг
//    2. Кланы: дельта-синхронизация (rep_delta, meta_sync, wh_sync) и защита CWH владельца (Worker 1)
//    3. Группы (Party): валидация remote invite/accept, выход из старой пати, межворкерный XP, party_decline
//    4. Социалка (Social): межворкерные друзья и репорты через ipcHub
//    5. GM: межворкерные //kick, //ban, //goto, //recall и //teleport handoff
//    6. Телепорты и логин: handoff в doTeleport / scroll_escape / village и полный login на целевом воркере
//    7. Серверные контракты: очистка sessions при handoff/char_delete_kick, буфер client_raw и nextId в session_restore
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const stream = require('stream');
const EventEmitter = require('events');

const ROOT = path.join(__dirname, '..');
const { IpcHub, MSG_FRIEND, MSG_GM_ACTION } = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const { MasterGateway } = require(path.join(ROOT, 'server', 'cluster-manager.js'));
const EditorGuard = require(path.join(ROOT, 'server', 'editor-guard.js'));
const Clans = require(path.join(ROOT, 'server', 'clans-store.js'));
const { createPartyHandler } = require(path.join(ROOT, 'server', 'handlers', 'party-handler.js'));
const createSocialHandler = require(path.join(ROOT, 'server', 'handlers', 'social-handler.js'));
const createGmHandler = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));
const { createNpcServicesHandler } = require(path.join(ROOT, 'server', 'handlers', 'npc-services-handler.js'));
const { createItemUseHandler } = require(path.join(ROOT, 'server', 'handlers', 'item-use-handler.js'));
const { createDeathHandler } = require(path.join(ROOT, 'server', 'handlers', 'death-handler.js'));
const { createSessionManager } = require(path.join(ROOT, 'server', 'session', 'session-manager.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const ZS = require(path.join(ROOT, 'shared', 'zone-sharding.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));

function testGatewayStatic(gateway, reqPath, headers) {
  return new Promise((resolve) => {
    const req = { url: reqPath, headers: headers || {}, socket: { remoteAddress: '203.0.113.10' } };
    let statusCode = 200;
    const resHeaders = {};
    const res = new stream.PassThrough();
    let body = '';
    res.writeHead = (code, h) => {
      statusCode = code;
      if (h) Object.assign(resHeaders, h);
    };
    res.on('data', (d) => { body += d; });
    res.on('end', () => resolve({ status: statusCode, headers: resHeaders, body }));
    gateway.serveStatic(req, res);
  });
}

function testRouterJson(httpRouter, urlPath) {
  return new Promise((resolve) => {
    const req = { url: urlPath, method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    let statusCode = 200;
    const resHeaders = {};
    const res = new stream.PassThrough();
    res.setHeader = (k, v) => { resHeaders[String(k).toLowerCase()] = v; };
    res.writeHead = (code, h) => {
      statusCode = code;
      if (h) Object.assign(resHeaders, h);
    };
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
      let json = null;
      try { json = JSON.parse(body); } catch (_) {}
      resolve({ status: statusCode, body, json, headers: resHeaders });
    });
    const handled = httpRouter.handleRequest(req, res);
    if (!handled) resolve({ status: 404, handled: false });
  });
}

module.exports = async function (t) {
  // ------------------------------------------------------------------
  // 1. MasterGateway: EditorGuard, HTTP router, editor_key_sync, cork()
  // ------------------------------------------------------------------
  t.suite('P1: MasterGateway — EditorGuard, HttpRouter, editor_key_sync, ws.cork()');
  {
    const ipcHub = new IpcHub({ isPrimary: true });
    const gateway = new MasterGateway({ port: 19981, workerCount: 4, ipcHub });
    const prevBroadcaster = null;
    try {
      const rEd = await testGatewayStatic(gateway, '/editor.html');
      t.eq(rEd.status, 404, 'MasterGateway.serveStatic скрывает editor.html без прав (404)');
      const rEdCss = await testGatewayStatic(gateway, '/css/editor-engine.css');
      t.eq(rEdCss.status, 404, 'MasterGateway.serveStatic скрывает editor-engine.css без прав (404)');
      const rIdx = await testGatewayStatic(gateway, '/index.html');
      t.eq(rIdx.status, 200, 'MasterGateway.serveStatic отдает index.html (200)');

      const wtRes = await testRouterJson(gateway.httpRouter, '/api/world-time');
      t.eq(wtRes.status, 200, 'GET /api/world-time работает на MasterGateway');
      t.ok(wtRes.json && typeof wtRes.json.phase === 'string' && wtRes.json.server === true, 'worldTimePayload не заглушка (содержит phase и server: true)');

      // Проверяем editor_key_sync с воркера в Master
      const testTok = 'a'.repeat(40);
      ipcHub._handleWorkerMessage(2, {
        ipcType: 'IPC_EDITOR_KEY_SYNC',
        payload: { action: 'issue', token: testTok, yid: 'gm_yid', pid: 200000010 }
      });
      t.ok(EditorGuard.valid(testTok), 'MasterGateway принял токен редактора через editor_key_sync');
      ipcHub._handleWorkerMessage(2, {
        ipcType: 'IPC_EDITOR_KEY_SYNC',
        payload: { action: 'revokePid', pid: 200000010 }
      });
      t.ok(!EditorGuard.valid(testTok), 'MasterGateway отозвал токен редактора через revokePid');

      // Проверяем группировку + ws.cork() в gateway_send_batch
      let corkCalls = 0;
      const sentFrames = [];
      const corkWs = {
        readyState: 1,
        bufferedAmount: 0,
        cork(fn) { corkCalls++; fn(); },
        send(data, opts) { sentFrames.push({ data: Buffer.isBuffer(data) ? Buffer.from(data) : data, isBinary: !!(opts && opts.binary) }); }
      };
      gateway.socketsByConnId.set(777, corkWs);
      ipcHub.emit('gateway_send_batch', [
        { connId: 777, data: JSON.stringify({ t: 'a' }), isBinary: false },
        { connId: 777, data: Buffer.from([1, 2, 3]), isBinary: true, isBase64: false },
        { connId: 777, data: JSON.stringify({ t: 'b' }), isBinary: false }
      ]);
      t.eq(corkCalls, 1, 'gateway_send_batch объединяет отправку на сокет в один ws.cork()');
      t.eq(sentFrames.length, 3, 'Все 3 фрейма батча доставлены в сокет');
      t.ok(Buffer.isBuffer(sentFrames[1].data) && sentFrames[1].data[1] === 2, 'Бинарный Buffer передан без порчи');

      // Проверка client_raw ретрансляции в IpcHub (reroute на targetWorkerId)
      const w2Mock = { sent: [], isConnected: () => true, send: (m) => w2Mock.sent.push(m) };
      ipcHub.workers.set(2, w2Mock);
      ipcHub._handleWorkerMessage(1, {
        ipcType: 'IPC_CLIENT_RAW',
        targetWorkerId: 2,
        payload: { connId: 501, data: '{"t":"move"}', isBinary: false, clientIp: '1.2.3.4' }
      });
      t.eq(w2Mock.sent.length, 1, 'IpcHub перенаправил переходный client_raw на целевой воркер 2');
      t.eq(w2Mock.sent[0].payload.connId, 501, 'connId переходного пакета сохранен');

      // Проверка res.onAborted -> proxyReq.destroy в cluster-manager.js
      const cmSrc = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
      t.ok(cmSrc.includes('proxyReq.destroy()'), 'MasterGateway уничтожает proxyReq при обрыве HTTP-соединения клиента (res.onAborted)');
    } finally {
      Clans.setSyncBroadcaster(prevBroadcaster);
      await new Promise((r) => gateway.stop(r));
    }
  }

  // ------------------------------------------------------------------
  // 2. Кланы: дельта-синхронизация и защита CWH на владельце (Worker 1)
  // ------------------------------------------------------------------
  t.suite('P1: Кланы — дельты (rep_delta, meta_sync, wh_sync) и защита CWH');
  {
    const prevIsCluster = process.env.IS_CLUSTER_WORKER;
    const prevWorkerIdx = process.env.WORKER_INDEX;
    const syncedEvents = [];
    Clans.setSyncBroadcaster((action, payload) => syncedEvents.push({ action, payload }));

    let testClan = null;
    try {
      process.env.IS_CLUSTER_WORKER = '1';
      process.env.WORKER_INDEX = '1';
      const mk = Clans.create({ name: 'P1DeltaClan', leaderYid: 'p1_leader', leaderCharId: 'c1', leaderName: 'Leader' });
      t.ok(mk.ok && mk.clan, 'Тестовый клан создан');
      testClan = mk.clan;
      testClan.wh.bastard_sword = 2;
      testClan.whPlusById.bastard_sword = 4;
      Clans.saveWh(testClan);
      t.ok(syncedEvents.some(e => e.action === 'wh_sync'), 'saveWh отправляет wh_sync');

      // Удалённый 'save' без whAuthoritative НЕ должен перезаписывать c.wh на Town Worker 1
      Clans.applySync('save', {
        id: testClan.id,
        name: testClan.name,
        level: 0,
        reputation: 100,
        leaderYid: testClan.leaderYid,
        leaderCharId: testClan.leaderCharId,
        members: testClan.members,
        wh: {},
        whPlusById: {},
        whAuthoritative: false
      });
      t.eq(testClan.wh.bastard_sword, 2, 'Устаревший save с другого воркера НЕ затер CWH на Worker 1');
      t.eq(testClan.whPlusById.bastard_sword, 4, 'Заточка на складе CWH не затерта');

      // rep_delta прибавляет репутацию не трогая склад
      syncedEvents.length = 0;
      Clans.applySync('rep_delta', { id: testClan.id, delta: 35 });
      t.eq(testClan.reputation, 135, 'rep_delta корректно увеличил репутацию клана (+35)');
      t.eq(testClan.wh.bastard_sword, 2, 'rep_delta не трогает склад CWH');

      // meta_sync обновляет уровень и состав без перезаписи CWH
      Clans.applySync('meta_sync', {
        id: testClan.id,
        level: 3,
        repDelta: -20,
        members: [
          ...testClan.members,
          { yid: 'p1_member', charId: 'c2', name: 'Member', rank: 'member', joinedAt: Date.now() }
        ]
      });
      t.eq(testClan.level, 3, 'meta_sync обновил уровень клана');
      t.eq(testClan.reputation, 115, 'meta_sync применил repDelta (-20)');
      t.eq(testClan.members.length, 2, 'meta_sync обновил состав клана');
      t.eq(testClan.wh.bastard_sword, 2, 'meta_sync сохранил склад CWH нетронутым');

      // С Field Worker 2 addReputation шлёт rep_delta, а не полный снимок с устаревшим wh
      process.env.WORKER_INDEX = '2';
      syncedEvents.length = 0;
      Clans.addReputation(testClan, 50);
      t.eq(syncedEvents.length, 1, 'addReputation отправляет ровно 1 дельта-событие');
      t.eq(syncedEvents[0].action, 'rep_delta', 'addReputation использует action rep_delta вместо полного save');
      t.eq(syncedEvents[0].payload.delta, 50, 'Передана точная дельта репутации 50');
      t.eq(syncedEvents[0].payload.wh, undefined, 'Поле wh не передается в rep_delta');
    } finally {
      if (testClan) Clans.remove(testClan);
      Clans.setSyncBroadcaster(null);
      if (prevIsCluster !== undefined) process.env.IS_CLUSTER_WORKER = prevIsCluster; else delete process.env.IS_CLUSTER_WORKER;
      if (prevWorkerIdx !== undefined) process.env.WORKER_INDEX = prevWorkerIdx; else delete process.env.WORKER_INDEX;
    }
  }

  // ------------------------------------------------------------------
  // 3. Группы: remote invite validation, remote accept old party leave, remote XP, party_decline
  // ------------------------------------------------------------------
  t.suite('P1: Party — проверки инвайта, выход из старой пати, межворкерный XP и party_decline');
  {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(srvSrc.includes("case 'party_decline':"), 'server.js маршрутизирует case party_decline в partyHandler');

    const w1Players = new Map();
    const w1Parties = new Map();
    const w2Players = new Map();
    const w2Parties = new Map();
    const w1Sent = [];
    const w2Sent = [];
    const ipcQueue = [];

    const mkExp = [];
    const pAlice = { pid: 10001, name: 'Alice', level: 20, x: 10, z: 10, hp: 500, maxHp: 500, exp: 0, sp: 0, dead: false, partyId: null };
    const pLeader1 = { pid: 10002, name: 'OtherLead', level: 20, x: 20, z: 20, hp: 500, maxHp: 500, exp: 0, sp: 0, dead: false, partyId: 'old_p' };
    const pBob = { pid: 20001, name: 'Bob', level: 20, x: 15, z: 15, hp: 400, maxHp: 400, exp: 0, sp: 0, dead: false, partyId: null };
    const pCarl = { pid: 20002, name: 'Carl', level: 20, x: 16, z: 16, hp: 400, maxHp: 400, exp: 0, sp: 0, dead: false, partyId: 'old_w2' };

    w1Players.set(pAlice.pid, pAlice);
    w1Players.set(pLeader1.pid, pLeader1);
    w2Players.set(pBob.pid, pBob);
    w2Players.set(pCarl.pid, pCarl);
    w2Parties.set('old_w2', { id: 'old_w2', leader: pCarl.pid, members: new Set([pCarl.pid, 20009]), lootMode: 'random', memberData: new Map() });
    w2Players.set(20009, { pid: 20009, name: 'OldBuddy', level: 18, x: 30, z: 30, hp: 300, maxHp: 300, partyId: 'old_w2' });

    const dir = new Map([
      ['alice', { yid: 'y_a', pid: 10001, name: 'Alice', online: true, workerId: 1 }],
      ['bob', { yid: 'y_b', pid: 20001, name: 'Bob', online: true, workerId: 2 }],
      ['carl', { yid: 'y_c', pid: 20002, name: 'Carl', online: true, workerId: 2 }]
    ]);
    const mkIpc = (wId) => ({
      broadcastParty: (p) => ipcQueue.push({ from: wId, payload: p }),
      findPlayerByName: (name) => dir.get(String(name || '').toLowerCase()) || null
    });

    const ph1 = createPartyHandler({
      parties: w1Parties, players: w1Players, IS_CLUSTER: true, CURRENT_WORKER_ID: 1,
      send: (p, m) => w1Sent.push({ pid: p.pid, msg: m }),
      sendPid: (pid, m) => { if (w1Players.has(pid)) w1Sent.push({ pid, msg: m }); },
      dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
      G, EXP,
      grantExpSp: (p, exp) => { p.exp += exp; mkExp.push({ pid: p.pid, exp }); return { exp, sp: 1 }; },
      getNextId: () => 'pt_p1',
      clusterIpc: mkIpc(1),
      findPlayerByName: (n) => [...w1Players.values()].find(x => x.name.toLowerCase() === n.toLowerCase())
    });
    const ph2 = createPartyHandler({
      parties: w2Parties, players: w2Players, IS_CLUSTER: true, CURRENT_WORKER_ID: 2,
      send: (p, m) => w2Sent.push({ pid: p.pid, msg: m }),
      sendPid: (pid, m) => { if (w2Players.has(pid)) w2Sent.push({ pid, msg: m }); },
      dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
      G, EXP,
      grantExpSp: (p, exp) => { p.exp += exp; mkExp.push({ pid: p.pid, exp }); return { exp, sp: 1 }; },
      getNextId: () => 'pt_p2',
      clusterIpc: mkIpc(2),
      findPlayerByName: (n) => [...w2Players.values()].find(x => x.name.toLowerCase() === n.toLowerCase())
    });

    // Нелидер не может приглашать игрока с другого воркера
    w1Parties.set('p_not_lead', { id: 'p_not_lead', leader: pLeader1.pid, members: new Set([pLeader1.pid, pAlice.pid]), lootMode: 'random' });
    pAlice.partyId = 'p_not_lead';
    ph1.handlePartyMessage(pAlice, { t: 'party_invite', target: 'Bob' });
    t.eq(ipcQueue.length, 0, 'Не-лидер заблокирован до отправки party_remote_invite в IPC');
    pAlice.partyId = null;
    w1Parties.delete('p_not_lead');

    // Alice (W1) приглашает Carl (W2), который уже в старой группе old_w2
    ph1.handlePartyMessage(pAlice, { t: 'party_invite', target: 'Carl' });
    t.eq(ipcQueue.length, 1, 'Лидер Alice отправила party_remote_invite');
    ph2.handleIpcParty(ipcQueue.shift().payload); // Carl уже в пати -> получит отказ, если пати реальная
    const oldW2Pa = w2Parties.get('old_w2');
    t.eq(oldW2Pa.members.size, 2, 'Старая пати Carl сохранялась до приглашения');

    // Сценарий remote_accept с выходом из старой пати: ставим Carl приглашение от Alice и он принимает
    pCarl._inviteFrom = pAlice.pid;
    pCarl._inviteFromAt = Date.now();
    ipcQueue.length = 0;
    ph2.handlePartyMessage(pCarl, { t: 'party_accept' });
    t.ok(!w2Parties.has('old_w2'), 'Carl вышел и распустил свою старую группу old_w2 при party_remote_accept');
    const acceptMsg = ipcQueue.find(m => m.payload.action === 'party_remote_accept');
    t.ok(acceptMsg != null, 'Отправлен party_remote_accept в IPC');
    ph1.handleIpcParty(acceptMsg.payload);
    // Доставим sync на W2
    while (ipcQueue.length > 0) {
      const ev = ipcQueue.shift();
      if (ev.from === 1) ph2.handleIpcParty(ev.payload);
    }
    const newPa1 = ph1.partyOf(pAlice);
    t.ok(newPa1 && newPa1.members.has(pAlice.pid) && newPa1.members.has(pCarl.pid), 'Alice и Carl в общей пати на W1');

    // Распределение опыта между воркерами в splitExpToParty
    mkExp.length = 0;
    ipcQueue.length = 0;
    ph1.splitExpToParty(pAlice, 1000, 20, { mobId: 'wolf' });
    t.ok(mkExp.some(e => e.pid === pAlice.pid && e.exp > 0), 'Alice на W1 получила свою долю опыта');
    const remoteExpIpc = ipcQueue.find(m => m.payload.action === 'party_remote_exp' && m.payload.targetPid === pCarl.pid);
    t.ok(remoteExpIpc != null, 'Для удалённого сопартийца Carl сгенерирован IPC party_remote_exp');
    ph2.handleIpcParty(remoteExpIpc.payload);
    t.ok(mkExp.some(e => e.pid === pCarl.pid && e.exp > 0), 'Carl на W2 получил межворкерный XP через party_remote_exp');
  }

  // ------------------------------------------------------------------
  // 4. Социалка: межворкерные друзья и репорты
  // ------------------------------------------------------------------
  t.suite('P1: Social — межворкерные друзья и репорты');
  {
    const w1Players = new Map();
    const w2Players = new Map();
    const w1PidByYid = new Map();
    const w2PidByYid = new Map();
    const s1Msgs = [];
    const s2Msgs = [];

    const a = { pid: 101, yid: 'y_alice', name: 'Alice', level: 10, region: 'town', friends: [] };
    const b = { pid: 202, yid: 'y_bob', name: 'Bob', level: 12, region: 'east', friends: [] };
    w1Players.set(a.pid, a); w1PidByYid.set(a.yid, a.pid);
    w2Players.set(b.pid, b); w2PidByYid.set(b.yid, b.pid);

    const directory = new Map([
      ['y_alice', { yid: 'y_alice', pid: a.pid, name: 'Alice', online: true, workerId: 1 }],
      ['y_bob', { yid: 'y_bob', pid: b.pid, name: 'Bob', online: true, workerId: 2 }]
    ]);
    let s1 = null, s2 = null;
    const mkSocial = (players, pidByYid, wId, sink) => createSocialHandler({
      players, pidByYid, IS_CLUSTER: true, CURRENT_WORKER_ID: wId,
      send: (p, m) => sink.push({ to: p.pid, m }),
      sendPid: (pid, m) => { if (players.has(pid)) sink.push({ to: pid, m }); },
      broadcastAOI: () => {}, broadcastRegion: () => {},
      partyOf: () => null, sendClan: () => {}, isGM: () => false, handleGmCommand: () => {},
      sanitizeCharName: (n) => (typeof n === 'string' ? n.trim() : null),
      saveProfileNow: () => {}, isBadKey: () => false, TR: { TRADE_TTL_MS: 30000 },
      clusterIpc: {
        isPlayerOnline: (yid) => directory.has(yid),
        getPlayer: (yid) => directory.get(yid) || null,
        findPlayerByName: (name) => [...directory.values()].find(r => r.name.toLowerCase() === name.toLowerCase()) || null,
        sendFriendIpc: (payload, targetWorkerId) => {
          if (targetWorkerId === 1) s1.handleIpcFriend(payload);
          else if (targetWorkerId === 2) s2.handleIpcFriend(payload);
          else { s1.handleIpcFriend(payload); s2.handleIpcFriend(payload); }
        }
      }
    });
    s1 = mkSocial(w1Players, w1PidByYid, 1, s1Msgs);
    s2 = mkSocial(w2Players, w2PidByYid, 2, s2Msgs);

    // Репорт с W1 на Bob (W2)
    s1.doReport(a, { name: 'Bob', text: 'spam' });
    t.ok(s1Msgs.some(x => x.to === a.pid && x.m.t === 'report_ok' && x.m.name === 'Bob'), 'Межворкерный репорт на игрока с W2 принят');

    // Добавление в друзья W1 -> W2
    s1.doFriendAdd(a, { name: 'Bob' });
    t.ok(b._friendFrom && b._friendFrom.yid === 'y_alice', 'Bob на W2 получил межворкерный friend_request');
    s2.doFriendAccept(b, {});
    t.ok(a.friends.some(f => f.yid === 'y_bob'), 'Alice добавила Bob в друзья после remote_accept');
    t.ok(b.friends.some(f => f.yid === 'y_alice'), 'Bob добавил Alice в друзья после remote_accept_ack');

    // Уведомление статуса друзей между воркерами
    s2Msgs.length = 0;
    s1.notifyFriends(a, false);
    const fsMsg = s2Msgs.find(x => x.to === b.pid && x.m.t === 'friend_status');
    t.ok(fsMsg && fsMsg.m.name === 'Alice' && fsMsg.m.online === false && fsMsg.m.yid === undefined, 'friend_status доставлен на W2 без утечки yid');

    // Удаление из друзей W1 -> W2
    s1.doFriendRemove(a, { name: 'Bob' });
    t.eq(a.friends.length, 0, 'Alice удалила Bob');
    t.eq(b.friends.length, 0, 'Bob удалён из списка Alice и на W2');
  }

  // ------------------------------------------------------------------
  // 5. GM межворкерные команды & Телепорты -> initiateClusterHandoff
  // ------------------------------------------------------------------
  t.suite('P1: GM кросс-воркер и телепорты с initiateClusterHandoff');
  {
    const w1Players = new Map();
    const w2Players = new Map();
    const gmSent = [];
    const detachedPids = [];
    const closedWs = [];
    const gmHandoffs = [];

    const gm = { pid: 1001, yid: 'y_gm', name: 'Admin', gm: true, accessLevel: 100, x: -107, y: 0, z: -246, inv: {} };
    const tgt = { pid: 2001, yid: 'y_badguy', name: 'BadGuy', gm: false, accessLevel: 0, x: 700, y: 0, z: -200, inv: {} };
    w1Players.set(gm.pid, gm);
    w2Players.set(tgt.pid, tgt);
    const tgtWs = { close: (code, reason) => closedWs.push({ pid: tgt.pid, code, reason }) };

    const dir = new Map([
      ['badguy', { yid: 'y_badguy', pid: tgt.pid, name: 'BadGuy', online: true, workerId: 2 }]
    ]);
    let gm1 = null, gm2 = null;
    const mkGm = (players, wsMap, wId) => createGmHandler({
      players,
      wsByPid: wsMap,
      IS_CLUSTER: true,
      TOTAL_WORKERS: 4,
      CURRENT_WORKER_ID: wId,
      ZS,
      send: (p, m) => gmSent.push({ to: p.pid, m }),
      sendPid: (pid, m) => gmSent.push({ to: pid, m }),
      sendJson: () => {},
      broadcastAll: () => {},
      broadcastAOI: () => {},
      findPlayerByName: (name) => [...players.values()].find(x => x.name.toLowerCase() === name.toLowerCase()) || null,
      sanitizeCharName: (s) => (typeof s === 'string' ? s.trim() : null),
      snapStandY: () => {},
      updatePlayerRegion: () => {},
      resetMoveBudget: () => {},
      detachPlayer: (pid) => detachedPids.push(pid),
      saveProfileNow: () => {},
      cosmeticsPublic: () => ({}),
      itemLookup: () => null,
      mobs: new Map(),
      Mob: function () {},
      getNextId: () => 1,
      initiateClusterHandoff: (pl, targetW) => gmHandoffs.push({ pid: pl.pid, targetW }),
      clusterIpc: {
        findPlayerByName: (n) => dir.get(String(n || '').toLowerCase()) || null,
        sendGmAction: (payload, targetWorkerId) => {
          if (targetWorkerId === 1) gm1.handleIpcGmAction(payload);
          else if (targetWorkerId === 2) gm2.handleIpcGmAction(payload);
          else { gm1.handleIpcGmAction(payload); gm2.handleIpcGmAction(payload); }
        }
      }
    });
    gm1 = mkGm(w1Players, new Map(), 1);
    gm2 = mkGm(w2Players, new Map([[tgt.pid, tgtWs]]), 2);

    // //goto BadGuy -> переход GM с W1 на W2 через handoff
    gm1.handleGmCommand(gm, '//goto BadGuy');
    t.ok(gmHandoffs.some(h => h.pid === gm.pid && h.targetW === 2), '//goto на удалённого игрока вызывает handoff на Worker 2');
    t.eq(gm.x, 700, 'Координата X GM обновлена до цели');

    // //recall BadGuy -> телепорт цели с W2 к GM на W1
    gmHandoffs.length = 0;
    gm.x = -107; gm.z = -246;
    gm1.handleGmCommand(gm, '//recall BadGuy');
    t.ok(gmHandoffs.some(h => h.pid === tgt.pid && h.targetW === 1), '//recall вызывает handoff цели на Worker 1');

    // //teleport 800 -300 с W1 -> немедленный handoff на Worker 2
    gmHandoffs.length = 0;
    gm1.handleGmCommand(gm, '//teleport 800 -300');
    t.ok(gmHandoffs.some(h => h.pid === gm.pid && h.targetW === 2), '//teleport <x> <z> в другую зону сразу вызывает initiateClusterHandoff');

    // //kick BadGuy с W1 -> кик + detach на W2
    gm1.handleGmCommand(gm, '//kick BadGuy');
    t.ok(closedWs.some(c => c.pid === tgt.pid && c.code === 4011), 'Межворкерный //kick закрывает сокет на W2');
    t.ok(detachedPids.includes(tgt.pid), 'Межворкерный //kick вызывает detachPlayer на W2');

    // //ban BadGuy -> Mod.setBan + ban_kick на W2
    const Mod = require(path.join(ROOT, 'server', 'moderation.js'));
    closedWs.length = 0;
    gm1.handleGmCommand(gm, '//ban BadGuy 10 testban');
    t.ok(!!Mod.banInfo('y_badguy'), 'Межворкерный //ban записывает бан по yid с W2');
    t.ok(closedWs.some(c => c.pid === tgt.pid && c.code === 4012), 'Межворкерный //ban закрывает сокет нарушителя (4012)');
    Mod.clearBan('y_badguy');

    // doTeleport / escapeToCity / village respawn handoff
    const roxy = NPCS.getNpc('dispatcher_roxy');
    const tpDst = NPCS.teleportPoints('dispatcher_roxy')[0];
    const tpHandoffs = [];
    const tpPlayer = {
      pid: 3001, name: 'Teleporter', x: roxy.position.x, y: 0, z: roxy.position.z,
      inv: { copper_parts: 100000, scroll_escape: 1 }, plusById: {}, equip: {},
      dead: false, region: 'village', buffs: [], combatPack: { maxHp: 500, maxEnergy: 200 }
    };
    const nsh = createNpcServicesHandler({
      NPCS, WM, ZS, IS_CLUSTER: true, TOTAL_WORKERS: 4, CURRENT_WORKER_ID: 1,
      send: () => {}, broadcastAOI: () => {},
      currencyOf: (p) => p.inv.copper_parts,
      takeCurrency: (p, n) => { p.inv.copper_parts -= n; },
      giveCurrency: () => {}, invCount: () => 0, pruneInv: () => {},
      canCarryMore: () => ({ ok: true }), pushWeight: () => {},
      saveProfileNow: () => {}, isBadKey: () => false, snapStandY: () => {},
      updatePlayerRegion: () => {}, resetMoveBudget: () => {},
      ensureNearbyMobs: () => { throw new Error('ensureNearbyMobs не должен вызываться до handoff'); },
      isPeaceAt: () => false, zoneLabelAt: () => 'zone',
      applyPlayerBuff: () => {}, pushEffects: () => {}, pushCombatStats: () => {},
      initiateClusterHandoff: (pl, tw) => tpHandoffs.push({ kind: 'npc', pid: pl.pid, tw })
    });
    nsh.doTeleport(tpPlayer, { npcId: 'dispatcher_roxy', index: 0 });
    t.ok(tpHandoffs.some(h => h.kind === 'npc' && h.tw === ZS.getWorkerForCoords(tpDst.x, tpDst.z, 4, 1)), 'doTeleport при смене шарда вызывает initiateClusterHandoff без ensureNearbyMobs');

    const iuh = createItemUseHandler({
      players: new Map([[tpPlayer.pid, tpPlayer]]), ZS, IS_CLUSTER: true, TOTAL_WORKERS: 4, CURRENT_WORKER_ID: 2,
      send: () => {}, broadcastAOI: () => {}, snapStandY: () => {}, isPeaceAt: () => true, zoneLabelAt: () => 'town',
      updatePlayerRegion: () => {}, resetMoveBudget: () => {}, entityTransforms: null,
      ensureNearbyMobs: () => { throw new Error('ensureNearbyMobs при escapeToCity в город с W2 лишний до handoff'); },
      saveProfileNow: () => {}, pushEffects: () => {}, pushCombatStats: () => {},
      applyPlayerBuff: () => {}, resurrectPlayer: () => {}, deathSelfPayload: () => ({}),
      grantSkillFree: () => {}, cosmeticsPublic: () => ({}),
      tableGet: (tb, k) => tb[k],
      itemLookup: () => ({ id: 'scroll_escape', type: 'consumable', effect: { escapeToCity: true } }),
      isBadKey: () => false, checkRate: () => true, playerStunned: () => false, dist2: () => 0, toggleShotArm: () => {},
      initiateClusterHandoff: (pl, tw) => tpHandoffs.push({ kind: 'escape', pid: pl.pid, tw })
    });
    iuh.doItemUse(tpPlayer, { id: 'scroll_escape' });
    t.ok(tpHandoffs.some(h => h.kind === 'escape' && h.tw === 1), 'Свиток возврата в город (escapeToCity) с W2 вызывает handoff на Worker 1');

    const dh = createDeathHandler({
      WM, ZS, IS_CLUSTER: true, TOTAL_WORKERS: 4, CURRENT_WORKER_ID: 2,
      NPCS, itemLookup: () => null, equippedCount: () => 0, spawnGroundLoot: () => {},
      pushCombatStats: () => {}, pushWeight: () => {}, L2: {}, EXP, levelExpReq: () => 100, ITEMS: {}, CS: {},
      passiveBonuses: () => ({}), DR: {}, SK: {}, isPeaceAt: () => true, BR: {},
      pushEffects: () => {}, closeTrade: () => {}, closeStore: () => {}, interruptDuel: () => {},
      Mod: {}, saveProfileNow: () => {}, send: () => {}, broadcastAOI: () => {},
      snapStandY: () => {}, updatePlayerRegion: () => false, resetMoveBudget: () => {},
      ensureNearbyMobs: () => {}, cancelPlayerCast: () => {}, checkRate: () => true,
      initiateClusterHandoff: (pl, tw) => tpHandoffs.push({ kind: 'village', pid: pl.pid, tw })
    });
    tpPlayer.dead = true;
    dh.revivePlayerToVillage(tpPlayer);
    t.ok(tpHandoffs.some(h => h.kind === 'village' && h.tw === 1), 'Воскрешение в город с W2 вызывает handoff на Worker 1');
  }

  // ------------------------------------------------------------------
  // 6. SessionManager: полный логин при начальном handoff + server.js контракты
  // ------------------------------------------------------------------
  t.suite('P1: Начальный handoff-логин (welcome/you_died) и инварианты server.js');
  {
    const handoffs = [];
    const sentPackets = [];
    const touched = [];
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const loggingIn = new Set();

    const sm = createSessionManager({
      AUTH: { verifySignature: () => ({ ok: true }), parseLoginData: require(path.join(ROOT, 'server', 'auth.js')).parseLoginData },
      AccountKeys: { isBanned: () => false },
      PlayerDb: {
        getProfile: () => ({ name: 'FieldHero', level: 15, x: 750, z: -200, dead: true }),
        touch: (pr, yid) => touched.push(yid),
        setOnline: () => {}
      },
      DB: {
        load: async () => ({ name: 'FieldHero', level: 15, x: 750, z: -200, dead: true, hp: 0, energy: 20, inv: {}, equip: {}, skills: {} }),
        save: async () => {}
      },
      sanitizeCharName: (n) => n || 'FieldHero',
      getNextPid: () => 100000123,
      players, wsByPid, pidByYid, loggingIn,
      detachPlayer: async () => {},
      sendJson: () => {},
      send: (p, m) => sentPackets.push({ pid: p.pid, m }),
      selfPayload: (p) => ({ name: p.name }),
      deathSelfPayload: (p) => ({ dead: !!p.dead }),
      effectsPayload: () => ([]),
      worldTimePayload: () => ({ hour: 10 }),
      friendsPayload: () => ({ t: 'friends', friends: [] }),
      clanPayload: () => ({ t: 'clan', clan: null }),
      IS_CLUSTER: true, TOTAL_WORKERS: 4, CURRENT_WORKER_ID: 1, ZS,
      clusterIpc: { updatePlayerDirectory: () => {}, sendToPrimary: () => {} },
      initiateClusterHandoff: (p, tw, opts) => {
        players.delete(p.pid);
        handoffs.push({ p, tw, opts });
      }
    });

    const loginB64 = Buffer.from(JSON.stringify({ uniqueID: 'user_field_login', publicName: 'FieldHero' })).toString('base64url');
    const mockWs = { connId: 444, readyState: 1, send: () => {} };
    await sm.doLogin(mockWs, { data: loginB64, signature: '' });

    t.eq(handoffs.length, 1, 'Вход в зоне Worker 2 инициирует initial login handoff');
    t.eq(handoffs[0].tw, 2, 'Целевой воркер — 2');
    t.eq(handoffs[0].opts && handoffs[0].opts.isInitialLogin, true, 'Передан флаг isInitialLogin: true');
    t.ok(touched.includes('user_field_login'), 'PlayerDb.touch выполнен перед handoff');

    // Целевой воркер вызывает completePostLogin -> клиент получает welcome и you_died!
    const adoptedP = handoffs[0].p;
    players.set(adoptedP.pid, adoptedP);
    sm.completePostLogin(adoptedP, mockWs, { isDevSession: handoffs[0].opts.isDevSession, guestToken: handoffs[0].opts.guestToken });
    t.ok(sentPackets.some(x => x.pid === adoptedP.pid && x.m.t === 'welcome'), 'После initial handoff клиент получает пакет welcome');
    t.ok(sentPackets.some(x => x.pid === adoptedP.pid && x.m.t === 'you_died' && x.m.reconnect === true), 'Мертвый персонаж после initial handoff получает you_died (reconnect)');

    // Проверка ключевых инвариантов server/server.js
    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(srvSrc.includes('function releaseSocketSession(') && srvSrc.includes('sessions.delete(ws);'), 'Централизованный releaseSocketSession удаляет ws из sessions');
    t.ok(srvSrc.includes('recentHandoffsByConnId') && srvSrc.includes('restoringConnIds'), 'client_raw защищен от гонок после handoff и при async session_restore');
    t.ok(srvSrc.includes('advanceNextIdForPid(pid)'), 'session_restore сдвигает nextId');
    t.ok(srvSrc.includes('if (ws._handedOff)'), 'close переданного сокета не вызывает ложный detachPlayer');
  }
};

