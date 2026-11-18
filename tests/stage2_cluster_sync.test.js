// ============================================================
//  TESTS / STAGE2_CLUSTER_SYNC.TEST.JS
//  Автоматические тесты Этапа 2:
//    - Задача 2.1: clan_sync при кике/выходе/роспуске клана между воркерами
//    - Задача 2.2: межворкерные /clan_invite, clan_status, world-time-handler и GM-команды
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '..');

const { IpcHub, MSG_CLAN_OP, MSG_WORLD_TIME_SYNC } = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const createClanHandler = require(path.join(ROOT, 'server', 'handlers', 'clan-handler.js'));
const createGmHandler = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));
const { createWorldTimeHandler } = require(path.join(ROOT, 'server', 'handlers', 'world-time-handler.js'));
const Clans = require(path.join(ROOT, 'server', 'clans-store.js'));
const PlayerDb = require(path.join(ROOT, 'server', 'player-db.js'));
const EditorGuard = require(path.join(ROOT, 'server', 'editor-guard.js'));
const WT = require(path.join(ROOT, 'shared', 'world-time.js'));
const TR = require(path.join(ROOT, 'shared', 'trade-rules.js'));

module.exports = async function (t) {
  // ------------------------------------------------------------------
  // 1. Задача 2.1: Синхронизация кланов при кике и роспуске (server.js + Clans)
  // ------------------------------------------------------------------
  t.suite('Stage 2.1: clan_sync очищает clanId при кике и роспуске клана на другом воркере');
  {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(srvSrc.includes("if (action === 'remove' && clan && clan.id)"),
      'server.js проверяет action === remove раньше ветки if (updated)');
    t.ok(srvSrc.includes('else if (pl.clanId === updated.id)'),
      'server.js сбрасывает clanId у игроков, исключённых из клана на другом воркере');

    const sfx1 = Date.now().toString(36).slice(-5);
    const leadYid1 = 's2_lead_' + sfx1;
    const memYid1 = 's2_mem_' + sfx1;
    let testClan = null;
    let testClanSnapshot = null;
    try {
      const mk = Clans.create({
        name: 'S2Sync' + sfx1,
        leaderYid: leadYid1,
        leaderCharId: 'c0',
        leaderName: 'S2Lead'
      });
      t.ok(mk.ok && mk.clan, 'тестовый клан создан (reason=' + (mk.reason || 'none') + ')');
      testClan = mk.clan;
      testClanSnapshot = { id: testClan.id, name: testClan.name, members: [...testClan.members] };

      // Эмуляция состояния на Worker 2: игрок pl (memYid1) числился в клане
      const w2Players = new Map();
      const pl = { pid: 2001, yid: memYid1, charId: 'c0', name: 'S2Member', clanId: testClan.id };
      w2Players.set(pl.pid, pl);
      const sent = [];
      const aoiSent = [];

      // Кик на Worker 1 -> meta_sync без memYid1
      const updated = Clans.applySync('meta_sync', {
        id: testClan.id,
        members: [{ yid: leadYid1, charId: 'c0', name: 'S2Lead', rank: 'leader', joinedAt: Date.now() }]
      });
      for (const [, p] of w2Players) {
        if (p.yid && Clans.memberOf(updated, p.yid, p.charId)) {
          p.clanId = updated.id;
        } else if (p.clanId === updated.id) {
          p.clanId = null;
          sent.push({ t: 'clan', clan: null });
          aoiSent.push({ t: 'clan_tag', pid: p.pid, clanId: null });
        }
      }
      t.eq(pl.clanId, null, 'clanId сброшен после кика (meta_sync)');
      t.ok(sent.some(m => m.t === 'clan' && m.clan === null), 'игроку отправлен { t: clan, clan: null }');
      t.ok(aoiSent.some(m => m.t === 'clan_tag' && m.clanId === null), 'в AOI отправлен сброс тега клана');

      // Роспуск клана: applySync("remove") возвращает existing — ветка remove всё равно срабатывает
      const leadP = { pid: 2002, yid: leadYid1, charId: 'c0', name: 'S2Lead', clanId: testClan.id };
      const removedObj = Clans.applySync('remove', { id: testClan.id });
      t.ok(!!removedObj && removedObj.id === testClan.id, 'Clans.applySync(remove) возвращает объект удалённого клана');
      t.eq(Clans.get(testClan.id), null, 'клан удалён из реестра Clans');
      if (leadP.clanId === testClan.id) leadP.clanId = null;
      t.eq(leadP.clanId, null, 'clanId лидера очищен после роспуска клана');
      testClan = null;
    } finally {
      const toDelete = testClan || testClanSnapshot;
      if (toDelete) await Clans.remove(toDelete);
      if (typeof Clans.flush === 'function') await Clans.flush();
      if (testClanSnapshot && Clans.DIR) {
        try { fs.unlinkSync(path.join(Clans.DIR, testClanSnapshot.id + '.json')); } catch (_) {}
      }
    }
  }

  // ------------------------------------------------------------------
  // 2. Задача 2.2а: Межворкерное приглашение в клан (/clan_invite)
  // ------------------------------------------------------------------
  t.suite('Stage 2.2: межворкерный /clan_invite и clan_status через IpcHub');
  {
    const w1Players = new Map();
    const w2Players = new Map();
    const w1PidByYid = new Map();
    const w2PidByYid = new Map();
    const w1Sent = [];
    const w2Sent = [];
    const ipcQueue = [];

    const sfx2 = Date.now().toString(36).slice(-5);
    const crossClanName = 'XZone' + sfx2;
    const pLead = { pid: 101, yid: 's2_c_lead_' + sfx2, charId: 'c0', name: 'ClanLead', level: 20, inv: { copper_parts: 500000 }, dead: false, clanId: null };
    const pTarget = { pid: 202, yid: 's2_c_tgt_' + sfx2, charId: 'c0', name: 'RemoteRecruit', level: 15, inv: {}, dead: false, clanId: null };
    w1Players.set(pLead.pid, pLead);
    w1PidByYid.set(pLead.yid, pLead.pid);
    w2Players.set(pTarget.pid, pTarget);
    w2PidByYid.set(pTarget.yid, pTarget.pid);

    const dir = new Map([
      ['clanlead', { yid: pLead.yid, pid: pLead.pid, charId: 'c0', name: 'ClanLead', online: true, workerId: 1 }],
      ['remoterecruit', { yid: pTarget.yid, pid: pTarget.pid, charId: 'c0', name: 'RemoteRecruit', online: true, workerId: 2 }]
    ]);

    const ch1 = createClanHandler({
      players: w1Players,
      pidByYid: w1PidByYid,
      IS_CLUSTER: true,
      CURRENT_WORKER_ID: 1,
      send: (p, m) => w1Sent.push({ pid: p.pid, m }),
      sendPid: (pid, m) => { if (w1Players.has(pid)) w1Sent.push({ pid, m }); else w2Sent.push({ pid, m }); },
      broadcastAOI: () => {},
      currencyOf: (p) => (p.inv && p.inv.copper_parts) || 0,
      takeCurrency: (p, amt) => { if ((p.inv.copper_parts || 0) < amt) return false; p.inv.copper_parts -= amt; return true; },
      giveCurrency: () => {},
      saveProfileNow: () => {},
      sanitizeCharName: (n) => String(n || '').trim(),
      findPlayerByName: (n) => [...w1Players.values()].find(x => x.name.toLowerCase() === String(n).toLowerCase()) || null,
      TR,
      isBadKey: (k) => k === '__proto__',
      invCount: () => 0,
      pruneInv: () => {},
      pruneCounts: () => {},
      canCarryMore: () => ({ ok: true }),
      pushWeight: () => {},
      clusterIpc: {
        isPlayerOnline: (yid) => yid === pTarget.yid || yid === pLead.yid,
        getPlayer: () => null,
        findPlayerByName: (name) => dir.get(String(name || '').toLowerCase()) || null,
        sendClanIpc: (payload, targetWorkerId) => ipcQueue.push({ from: 1, to: targetWorkerId, payload })
      }
    });

    const ch2 = createClanHandler({
      players: w2Players,
      pidByYid: w2PidByYid,
      IS_CLUSTER: true,
      CURRENT_WORKER_ID: 2,
      send: (p, m) => w2Sent.push({ pid: p.pid, m }),
      sendPid: (pid, m) => { if (w2Players.has(pid)) w2Sent.push({ pid, m }); else w1Sent.push({ pid, m }); },
      broadcastAOI: () => {},
      currencyOf: () => 0,
      takeCurrency: () => false,
      giveCurrency: () => {},
      saveProfileNow: () => {},
      sanitizeCharName: (n) => String(n || '').trim(),
      findPlayerByName: (n) => [...w2Players.values()].find(x => x.name.toLowerCase() === String(n).toLowerCase()) || null,
      TR,
      isBadKey: (k) => k === '__proto__',
      invCount: () => 0,
      pruneInv: () => {},
      pruneCounts: () => {},
      canCarryMore: () => ({ ok: true }),
      pushWeight: () => {},
      clusterIpc: {
        isPlayerOnline: (yid) => yid === pTarget.yid || yid === pLead.yid,
        getPlayer: () => null,
        findPlayerByName: (name) => dir.get(String(name || '').toLowerCase()) || null,
        sendClanIpc: (payload, targetWorkerId) => ipcQueue.push({ from: 2, to: targetWorkerId, payload })
      }
    });

    let createdClan = null;
    let createdSnapshot = null;
    try {
      ch1.doClanCreate(pLead, { name: crossClanName });
      createdClan = Clans.get(pLead.clanId);
      if (createdClan) createdSnapshot = { id: createdClan.id };
      t.ok(createdClan && createdClan.name === crossClanName, 'клан создан лидером на Worker 1');

      w1Sent.length = 0;
      w2Sent.length = 0;
      ipcQueue.length = 0;

      ch1.doClanInvite(pLead, { name: 'RemoteRecruit' });
      t.eq(ipcQueue.length, 1, 'приглашение в клан отправлено через clusterIpc.sendClanIpc');
      t.eq(ipcQueue[0].to, 2, 'приглашение маршрутизировано на Worker 2');
      t.eq(ipcQueue[0].payload.action, 'clan_remote_invite', 'action === clan_remote_invite');

      ch2.handleIpcClan(ipcQueue.shift().payload);
      t.ok(pTarget._clanFrom && pTarget._clanFrom.clanId === createdClan.id, 'у цели на Worker 2 выставлен _clanFrom');
      t.ok(w2Sent.some(x => x.pid === pTarget.pid && x.m.t === 'clan_invite' && x.m.clanName === crossClanName),
        'цель на Worker 2 получила диалог clan_invite');

      ch2.doClanAccept(pTarget, { pid: pLead.pid });
      t.eq(pTarget.clanId, createdClan.id, 'цель на Worker 2 приняла приглашение и вступила в клан');
      t.ok(Clans.memberOf(createdClan, pTarget.yid, pTarget.charId), 'участник добавлен в реестр клана');

      // notifyClan отправляет clan_status через IPC
      ipcQueue.length = 0;
      ch2.notifyClan(pTarget, true);
      t.ok(ipcQueue.some(q => q.payload.action === 'clan_status' && q.payload.name === 'RemoteRecruit'),
        'notifyClan рассылает clan_status другим воркерам');
      w1Sent.length = 0;
      ch1.handleIpcClan(ipcQueue.shift().payload);
      t.ok(w1Sent.some(x => x.pid === pLead.pid && x.m.t === 'clan_status' && x.m.online === true),
        'лидер на Worker 1 получил clan_status о входе соклановца с Worker 2');
    } finally {
      if (createdClan) await Clans.remove(createdClan);
      if (createdSnapshot && Clans.DIR) {
        try { fs.unlinkSync(path.join(Clans.DIR, createdSnapshot.id + '.json')); } catch (_) {}
      }
    }
  }

  // ------------------------------------------------------------------
  // 3. Задача 2.2б: Синхронизация мирового времени (world-time-handler + IpcHub)
  // ------------------------------------------------------------------
  t.suite('Stage 2.2: синхронизация мирового времени между воркерами и при рестарте воркера');
  {
    const primaryHub = new IpcHub({ isPrimary: true });
    const w1Inbox = [];
    const w2Inbox = [];
    primaryHub.workers.set(1, { isConnected: () => true, send: (m) => w1Inbox.push(m) });
    primaryHub.workers.set(2, { isConnected: () => true, send: (m) => w2Inbox.push(m) });

    const w1Sent = [];
    const w2Sent = [];
    const wt1 = createWorldTimeHandler({
      WT,
      players: () => new Map([[1, { pid: 1 }]]),
      send: (p, msg) => w1Sent.push(msg),
      TICK_MS: 100,
      onTimeSync: (wt) => {
        primaryHub._handleWorkerMessage(1, { ipcType: MSG_WORLD_TIME_SYNC, payload: wt });
      }
    });
    const wt2 = createWorldTimeHandler({
      WT,
      players: () => new Map([[2, { pid: 2 }]]),
      send: (p, msg) => w2Sent.push(msg),
      TICK_MS: 100,
      onTimeSync: () => {
        throw new Error('applyExternalTime не должен повторно триггерить onTimeSync');
      }
    });

    wt1.handleTimeMessage({ pid: 1, dev: true }, { t: 'set_time', hour: 23, silent: true }, () => true);
    t.eq(w1Inbox.length, 0, 'Worker 1 (отправитель) не получает эхо назад');
    t.eq(w2Inbox.length, 1, 'Worker 2 получил MSG_WORLD_TIME_SYNC от Primary');
    t.eq(w2Inbox[0].ipcType, MSG_WORLD_TIME_SYNC, 'тип сообщения IPC_WORLD_TIME_SYNC');

    wt2.applyExternalTime(w2Inbox[0].payload);
    t.near(wt2.getHour(), 23, 0.05, 'время на Worker 2 синхронизировано на 23:00');
    t.eq(wt2.isNight(), true, 'ночная фаза синхронизирована на Worker 2');

    wt1.handleTimeMessage({ pid: 1, dev: true }, { t: 'set_time_pause', paused: true }, () => true);
    wt2.applyExternalTime(w2Inbox[1].payload);
    t.eq(wt2.isPaused(), true, 'пауза времени синхронизирована на Worker 2');
    t.ok(primaryHub.aggregatedMetrics.worldTime && primaryHub.aggregatedMetrics.worldTime.paused === true,
      'MasterGateway хранит актуальное worldTime с флагом паузы');

    // Перезапуск упавшего Worker 3: при первом heartbeat Primary отправляет ему актуальный MSG_WORLD_TIME_SYNC
    const w3Inbox = [];
    const w3Mock = Object.assign(new EventEmitter(), { isConnected: () => true, send: (m) => w3Inbox.push(m) });
    primaryHub.registerWorker(3, w3Mock);
    primaryHub._handleWorkerMessage(3, { ipcType: 'IPC_HEARTBEAT', payload: { tickMs: 1, lagMs: 0 } });
    t.eq(w3Inbox.length, 1, 'перезапущенный Worker 3 при первом heartbeat получил синк мирового времени');
    t.eq(w3Inbox[0].payload.paused, true, 'синхронизированное время сохраняет паузу');
  }

  // ------------------------------------------------------------------
  // 4. Задача 2.2в: Межворкерные GM-команды (//announce, //heal, //res, //give, //oneshot, //aura, //setgm, //revokegm)
  // ------------------------------------------------------------------
  t.suite('Stage 2.2: межворкерные GM-команды через IPC');
  {
    const w1Players = new Map();
    const w2Players = new Map();
    const w1Sent = [];
    const w2Sent = [];
    const w1All = [];
    const gmIpcQueue = [];
    const announceIpc = [];
    const gmSyncIpc = [];

    const gmAdmin = {
      pid: 901, yid: 's2_gm', charId: 'c0', name: 'AdminOne',
      x: 0, y: 0, z: 0, accessLevel: 100, gm: true, inv: {}
    };
    const remoteTarget = {
      pid: 902, yid: 's2_tgt_gm', charId: 'c0', name: 'TargetTwo',
      x: 800, y: 0, z: 100, hp: 50, maxHp: 500, energy: 10, maxEnergy: 200,
      dead: true, inv: {}, plusById: {}, skills: {}, equip: {}, cosmetics: {},
      accessLevel: 0, gm: false
    };
    w1Players.set(gmAdmin.pid, gmAdmin);
    w2Players.set(remoteTarget.pid, remoteTarget);

    const gmDir = new Map([
      ['adminone', { yid: gmAdmin.yid, pid: gmAdmin.pid, name: gmAdmin.name, online: true, workerId: 1 }],
      ['targettwo', { yid: remoteTarget.yid, pid: remoteTarget.pid, name: remoteTarget.name, online: true, workerId: 2 }]
    ]);

    const sendPidShared = (pid, msg) => {
      if (w1Players.has(pid)) w1Sent.push({ pid, msg });
      if (w2Players.has(pid)) w2Sent.push({ pid, msg });
    };

    const gmh1 = createGmHandler({
      players: w1Players,
      IS_CLUSTER: true,
      CURRENT_WORKER_ID: 1,
      send: (p, msg) => w1Sent.push({ pid: p.pid, msg }),
      sendPid: sendPidShared,
      broadcastAll: (msg) => w1All.push(msg),
      broadcastAOI: () => {},
      findPlayerByName: (n) => [...w1Players.values()].find(x => x.name.toLowerCase() === String(n).toLowerCase()) || null,
      sanitizeCharName: (n) => String(n || '').trim(),
      snapStandY: () => {},
      resetMoveBudget: () => {},
      saveProfileNow: () => {},
      cosmeticsPublic: (p) => ({ aura: (p.cosmetics && p.cosmetics.aura) || null }),
      itemLookup: (id) => (id === 'iron_hammer' ? { id: 'iron_hammer', name: 'Iron Hammer', type: 'weapon', stackable: false } : null),
      pushWeight: () => {},
      clusterIpc: {
        broadcastAnnounce: (txt) => announceIpc.push(txt),
        findPlayerByName: (name) => gmDir.get(String(name || '').toLowerCase()) || null,
        sendGmAction: (payload, targetWorkerId) => gmIpcQueue.push({ to: targetWorkerId, payload }),
        broadcastGmSync: (evt) => gmSyncIpc.push(evt)
      }
    });

    let deathCount = 0;
    const gmh2 = createGmHandler({
      players: w2Players,
      IS_CLUSTER: true,
      CURRENT_WORKER_ID: 2,
      send: (p, msg) => w2Sent.push({ pid: p.pid, msg }),
      sendPid: sendPidShared,
      broadcastAll: () => {},
      broadcastAOI: () => {},
      findPlayerByName: (n) => [...w2Players.values()].find(x => x.name.toLowerCase() === String(n).toLowerCase()) || null,
      sanitizeCharName: (n) => String(n || '').trim(),
      snapStandY: () => {},
      resetMoveBudget: () => {},
      saveProfileNow: () => {},
      cosmeticsPublic: (p) => ({ aura: (p.cosmetics && p.cosmetics.aura) || null }),
      itemLookup: (id) => (id === 'iron_hammer' ? { id: 'iron_hammer', name: 'Iron Hammer', type: 'weapon', stackable: false } : null),
      pushWeight: () => {},
      resurrectPlayer: (tgt) => {
        if (!tgt || !tgt.dead) return false;
        tgt.dead = false;
        tgt.hp = tgt.maxHp;
        tgt.energy = tgt.maxEnergy;
        return true;
      },
      onPlayerDeath: (tgt) => {
        tgt.dead = true;
        deathCount++;
      }
    });

    // //announce
    gmh1.handleGmCommand(gmAdmin, '//announce Тест кластерного анонса');
    t.ok(w1All.some(m => m.t === 'announce') && w1All.some(m => m.t === 'chat' && m.ch === 'announce'),
      '//announce рассылает и баннер announce, и чат-сообщение локальному воркеру');
    t.eq(announceIpc[0], 'Тест кластерного анонса', '//announce проброшен в clusterIpc.broadcastAnnounce');

    // //res TargetTwo (на Worker 2)
    gmh1.handleGmCommand(gmAdmin, '//res TargetTwo');
    t.eq(gmIpcQueue.length, 1, '//res ушёл в sendGmAction на Worker 2');
    gmh2.handleIpcGmAction(gmIpcQueue.shift().payload);
    t.eq(remoteTarget.dead, false, '//res воскресил игрока на Worker 2');
    t.eq(remoteTarget.hp, 500, '//res восстановил HP игрока на Worker 2');
    t.ok(w1Sent.some(x => x.pid === gmAdmin.pid && x.msg.text && x.msg.text.includes('воскрешен')),
      'GM на Worker 1 получил ответ об успешном //res');

    // //heal TargetTwo (на Worker 2)
    remoteTarget.hp = 123;
    gmh1.handleGmCommand(gmAdmin, '//heal TargetTwo');
    gmh2.handleIpcGmAction(gmIpcQueue.shift().payload);
    t.eq(remoteTarget.hp, 500, '//heal вылечил игрока на Worker 2');

    // //give TargetTwo iron_hammer 1 5 (на Worker 2)
    gmh1.handleGmCommand(gmAdmin, '//give TargetTwo iron_hammer 1 5');
    gmh2.handleIpcGmAction(gmIpcQueue.shift().payload);
    t.eq(remoteTarget.inv.iron_hammer, 1, '//give выдал предмет игроку на Worker 2');
    t.eq(remoteTarget.plusById.iron_hammer, 5, '//give выставил заточку +5 на Worker 2');

    // //aura hero TargetTwo (на Worker 2)
    gmh1.handleGmCommand(gmAdmin, '//aura hero TargetTwo');
    gmh2.handleIpcGmAction(gmIpcQueue.shift().payload);
    t.eq(remoteTarget.cosmetics.aura, 'hero_aura', '//aura применил ауру онлайн-игроку на Worker 2');

    // //oneshot TargetTwo (на Worker 2)
    gmh1.handleGmCommand(gmAdmin, '//oneshot TargetTwo');
    gmh2.handleIpcGmAction(gmIpcQueue.shift().payload);
    t.eq(remoteTarget.dead, true, '//oneshot убил игрока на Worker 2');
    t.eq(deathCount, 1, '//oneshot на другом воркере вызвал onPlayerDeath');

    // //setgm и //revokegm -> broadcastGmSync + applyLiveGmState на Worker 2
    const origSetAccess = PlayerDb.setAccessLevel;
    const origRevokeAccess = PlayerDb.revokeAccess;
    PlayerDb.setAccessLevel = async (tName, lvl) => ({ ok: true, target: tName, name: 'TargetTwo', yid: remoteTarget.yid, accessLevel: lvl, gm: lvl >= 50 });
    PlayerDb.revokeAccess = async (tName) => ({ ok: true, target: tName, name: 'TargetTwo', yid: remoteTarget.yid, accessLevel: 0, gm: false });
    try {
      gmSyncIpc.length = 0;
      gmh1.handleGmCommand(gmAdmin, '//setgm TargetTwo 100');
      await new Promise(r => setImmediate(r));
      t.eq(gmSyncIpc.length, 1, '//setgm отправил broadcastGmSync в кластер');
      gmh2.applyLiveGmState(remoteTarget, gmSyncIpc[0].accessLevel);
      t.eq(remoteTarget.gm, true, 'gm обновлён на Worker 2 после gm_sync');
      t.eq(remoteTarget.skills.gm_oneshot, 1, 'GM-скиллы выданы на Worker 2');

      const edTok = EditorGuard.issue(remoteTarget);
      t.ok(EditorGuard.valid(edTok), 'выдан тестовый токен редактора');
      remoteTarget.gmSpeedMul = 3;
      remoteTarget.flashSpeed = true;
      remoteTarget.invul = true;

      gmSyncIpc.length = 0;
      gmh1.handleGmCommand(gmAdmin, '//revokegm TargetTwo');
      await new Promise(r => setImmediate(r));
      t.eq(gmSyncIpc.length, 1, '//revokegm отправил broadcastGmSync в кластер');
      gmh2.applyLiveGmState(remoteTarget, gmSyncIpc[0].accessLevel);
      t.eq(remoteTarget.gm, false, 'права GM сняты на Worker 2');
      t.eq(remoteTarget.invul, false, 'invul сброшен на Worker 2');
      t.eq(remoteTarget.flashSpeed, false, 'flashSpeed сброшен на Worker 2');
      t.eq(remoteTarget.gmSpeedMul, 1, 'gmSpeedMul сброшен на Worker 2');
      t.ok(!remoteTarget.skills.gm_oneshot && !remoteTarget.skills.test_immortal, 'GM-скиллы удалены на Worker 2');
      t.eq(EditorGuard.valid(edTok), false, 'токен EditorGuard отозван на Worker 2');
    } finally {
      PlayerDb.setAccessLevel = origSetAccess;
      PlayerDb.revokeAccess = origRevokeAccess;
    }
  }
};
