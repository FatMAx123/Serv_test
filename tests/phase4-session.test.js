// TESTS / PHASE4-SESSION.TEST.JS
// Модульное тестирование Фазы 4: session-manager и disconnect-manager
'use strict';

const { createSessionManager } = require('../server/session/session-manager.js');
const { createDisconnectManager, fastIdFromKey } = require('../server/session/disconnect-manager.js');

module.exports = async function runPhase4Tests(t) {
  t.suite('Фаза 4: disconnect-manager (fastIdFromKey & socket close & combat-log)');

  // 1. fastIdFromKey
  t.eq(fastIdFromKey('p42'), 42, 'fastIdFromKey для игрока p42 -> 42');
  t.eq(fastIdFromKey('m108'), 108, 'fastIdFromKey для моба m108 -> 108');
  t.eq(fastIdFromKey(''), 0, 'fastIdFromKey для пустой строки -> 0');
  t.eq(fastIdFromKey(null), 0, 'fastIdFromKey для null -> 0');

  // 2. handleSocketClose - мирный игрок
  {
    const players = new Map();
    const wsByPid = new Map();
    const sessions = new Map();

    const mockWs = { pid: 101 };
    sessions.set(mockWs, { lastPong: Date.now() });
    wsByPid.set(101, mockWs);

    const p = {
      pid: 101,
      yid: 'y101',
      name: 'PeacefulPlayer',
      dead: false,
      isFlagged: false,
      flagUntil: 0,
      _lastCombatAt: 0,
      duel: null
    };
    players.set(101, p);

    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid: new Map([[p.yid, 101]]),
      mobs: new Map(),
      parties: new Map(),
      isSyntheticBot: () => false,
      DB: { save: async () => {} },
      PlayerDb: { setOnline: () => {} }
    });

    await dm.handleSocketClose(mockWs, sessions);

    t.ok(!sessions.has(mockWs), 'сессия удалена из sessions');
    t.ok(!wsByPid.has(101), 'ws удален из wsByPid');
    t.ok(!players.has(101), 'мирный игрок немедленно детачится из мира');
  }

  // 3. handleSocketClose - игрок в бою (Anti Combat-Log 15s)
  {
    const players = new Map();
    const wsByPid = new Map();
    const sessions = new Map();

    const mockWs = { pid: 102 };
    sessions.set(mockWs, { lastPong: Date.now() });
    wsByPid.set(102, mockWs);

    let storeBroadcast = false;
    const p = {
      pid: 102,
      yid: 'y102',
      name: 'CombatPlayer',
      dead: false,
      isFlagged: true, // В бою!
      flagUntil: Date.now() + 10000,
      _lastCombatAt: Date.now(),
      duel: null,
      moving: true,
      casting: { skillId: 'strike' },
      store: { title: 'shop' }
    };
    players.set(102, p);

    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid: new Map([[p.yid, 102]]),
      mobs: new Map(),
      parties: new Map(),
      broadcastStoreState: () => { storeBroadcast = true; },
      isSyntheticBot: () => false,
      DB: { save: async () => {} }
    });

    await dm.handleSocketClose(mockWs, sessions);

    t.ok(!sessions.has(mockWs), 'сессия сокета удалена');
    t.ok(!wsByPid.has(102), 'ws удален из wsByPid');
    t.ok(players.has(102), 'персонаж остаётся в мире "манекеном" (combat-log protection)');
    t.ok(p._combatLogoutTimer !== null, 'таймер комбат-лога запущен');
    t.eq(p.moving, false, 'движение остановлено');
    t.eq(p.casting, null, 'каст прерван');
    t.eq(p.store, null, 'лавка закрыта при разрыве');
    t.ok(storeBroadcast, 'состояние лавки разослано');

    clearTimeout(p._combatLogoutTimer);
  }

  // 4. detachPlayer: пати из 3 игроков (передача лидерства)
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const mobs = new Map();
    const parties = new Map();
    let partyPushed = false;

    const pLeader = { pid: 201, yid: 'y201', name: 'Leader', charId: 'c1', partyId: 'party_tri' };
    const pMember1 = { pid: 202, yid: 'y202', name: 'M1', charId: 'c2', partyId: 'party_tri' };
    const pMember2 = { pid: 203, yid: 'y203', name: 'M2', charId: 'c3', partyId: 'party_tri' };

    const party = {
      id: 'party_tri',
      leader: 201,
      members: new Set([201, 202, 203])
    };

    players.set(201, pLeader);
    players.set(202, pMember1);
    players.set(203, pMember2);
    parties.set('party_tri', party);

    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid,
      mobs,
      parties,
      isSyntheticBot: () => false,
      closeTrade: () => {},
      interruptDuel: () => {},
      broadcastStoreState: () => {},
      notifyFriends: () => {},
      notifyClan: () => {},
      partyOf: () => party,
      pushParty: () => { partyPushed = true; },
      send: () => {},
      sendPid: () => {},
      profileOf: (pl) => pl,
      DB: { save: async () => {} }
    });

    await dm.detachPlayer(201);

    t.eq(party.leader, 202, 'лидерство пати передано следующему члену');
    t.ok(!party.members.has(201), 'ушедший лидер удален из состава пати');
    t.eq(party.members.size, 2, 'в пати осталось 2 участника');
    t.ok(partyPushed, 'состав обновленной пати разослан (pushParty)');
  }

  // 5. detachPlayer: пати из 2 игроков (роспуск пати при выходе до 1)
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const mobs = new Map();
    const parties = new Map();
    let sentDisband = false;

    const p1 = { pid: 301, yid: 'y301', name: 'P1', partyId: 'party_duo' };
    const p2 = { pid: 302, yid: 'y302', name: 'P2', partyId: 'party_duo' };

    const party = {
      id: 'party_duo',
      leader: 301,
      members: new Set([301, 302])
    };

    players.set(301, p1);
    players.set(302, p2);
    parties.set('party_duo', party);

    let partyHandlerCalled = false;
    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid,
      mobs,
      parties,
      partyHandler: {
        broadcastPartyDisband: () => { partyHandlerCalled = true; }
      },
      isSyntheticBot: () => false,
      closeTrade: () => {},
      interruptDuel: () => {},
      broadcastStoreState: () => {},
      notifyFriends: () => {},
      notifyClan: () => {},
      partyOf: () => party,
      pushParty: () => {},
      send: (pl, msg) => {
        if (msg.t === 'party' && msg.leader === null) sentDisband = true;
      },
      sendPid: () => {},
      profileOf: (pl) => pl,
      DB: { save: async () => {} }
    });

    await dm.detachPlayer(301);

    t.ok(!parties.has('party_duo'), 'пати из 1 человека распущена и удалена из parties');
    t.ok(sentDisband, 'оставшемуся участнику отправлено уведомление о роспуске пати');
    t.ok(partyHandlerCalled, 'вызван broadcastPartyDisband');
  }

  // 6. detachPlayer: хейт мобов, AOI leave, сейв
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const mobs = new Map();
    const parties = new Map();
    let sentMessages = [];
    let savedProfiles = [];

    const p = {
      pid: 401,
      yid: 'y401',
      name: 'Hero',
      charId: 'c1',
      x: 10,
      z: 20,
      knownBy: new Set([402]),
      known: new Set(['p402', 'm501'])
    };
    const observer = {
      pid: 402,
      yid: 'y402',
      name: 'Observer',
      known: new Set(['p401']),
      _lastUpd: new Map([['p401', Date.now()]])
    };
    const mob = {
      id: 501,
      hate: { '401': 500, '402': 100 },
      target: 401,
      knownBy: new Set([401])
    };

    players.set(401, p);
    players.set(402, observer);
    pidByYid.set(p.yid, 401);
    pidByYid.set(observer.yid, 402);
    mobs.set(501, mob);

    const dm = createDisconnectManager({
      players,
      wsByPid,
      pidByYid,
      mobs,
      parties,
      isSyntheticBot: () => false,
      closeTrade: () => {},
      interruptDuel: () => {},
      broadcastStoreState: () => {},
      notifyFriends: () => {},
      notifyClan: () => {},
      send: () => {},
      sendPid: (tgtPid, msg) => { sentMessages.push({ tgtPid, msg }); },
      profileOf: (pl) => ({ yid: pl.yid, name: pl.name, charId: pl.charId }),
      lbTouch: () => {},
      DB: {
        save: async (yid, pr, charId) => {
          savedProfiles.push({ yid, pr, charId });
        }
      },
      PlayerDb: { setOnline: () => {} }
    });

    await dm.detachPlayer(401);

    t.ok(!players.has(401), 'игрок удален из players');
    t.ok(!pidByYid.has('y401'), 'yid удален из pidByYid');
    t.eq(mob.hate['401'], undefined, 'хейт моба к игроку очищен');
    t.eq(mob.target, null, 'таргет моба сброшен с ушедшего игрока');
    t.ok(!mob.knownBy.has(401), 'ушедший удален из knownBy моба');

    // AOI leave
    const leaveMsg = sentMessages.find(m => m.tgtPid === 402 && m.msg.t === 'aoi');
    t.ok(!!leaveMsg, 'наблюдатель получил сообщение AOI');
    t.eq(leaveMsg.msg.leave[0], 'p401', 'сообщение AOI содержит leave p401');
    t.ok(!observer.known.has('p401'), 'у наблюдателя p401 удален из known');

    // Сохранение
    t.eq(savedProfiles.length, 1, 'профиль сохранен в DB при детаче');
    t.eq(savedProfiles[0].yid, 'y401', 'сохранен корректный yid');
  }

  t.suite('Фаза 4: session-manager (подписи, replay-защита, doLogin)');

  // 7. checkSignatureReplay
  {
    const sm = createSessionManager({
      players: new Map(),
      wsByPid: new Map(),
      pidByYid: new Map(),
      loggingIn: new Set(),
      getNextPid: () => 1
    });

    t.eq(sm.checkSignatureReplay(null), true, 'пустая подпись пропускается в auth');
    t.eq(sm.checkSignatureReplay('sig_unique_1'), true, 'новая уникальная подпись принята');
    t.eq(sm.checkSignatureReplay('sig_unique_1'), false, 'повтор подписи (Replay attack) отклонён');
    t.eq(sm.checkSignatureReplay('sig_unique_2'), true, 'другая уникальная подпись принята');
  }

  // 8. doLogin: валидация payload и loggingIn барьер
  {
    const loggingIn = new Set();
    let sent = [];
    let closedCode = null;
    let closedReason = null;
    const mockWs = {
      send: (data) => { sent.push(JSON.parse(data)); },
      close: (code, reason) => { closedCode = code; closedReason = reason; }
    };

    const mockAuth = {
      verifySignature: () => ({ ok: true }),
      parseLoginData: require('../server/auth.js').parseLoginData
    };

    const sm = createSessionManager({
      AUTH: mockAuth,
      players: new Map(),
      wsByPid: new Map(),
      pidByYid: new Map(),
      loggingIn,
      getNextPid: () => 1,
      sendJson: (ws, msg) => { ws.send(JSON.stringify(msg)); }
    });

    // Пустой payload
    await sm.doLogin(mockWs, null);
    t.eq(sent[0].t, 'login_fail', 'пустой payload возвращает login_fail');
    t.eq(sent[0].reason, 'empty_payload', 'причина empty_payload');

    // Блокировка параллельного входа (loggingIn lock barrier)
    loggingIn.add('user_busy');
    sent = [];
    const busyPayload = Buffer.from(JSON.stringify({ uniqueID: 'user_busy', publicName: 'Busy' })).toString('base64url');
    await sm.doLogin(mockWs, { data: busyPayload, signature: '' });
    t.eq(closedCode, 4009, 'сокет закрыт с кодом 4009 при параллельном входе');
    t.eq(closedReason, 'login in progress', 'причина закрытия login in progress');
  }

  // 9. doLogin: успешный вход и инициализация игрока
  {
    const players = new Map();
    const wsByPid = new Map();
    const pidByYid = new Map();
    const loggingIn = new Set();
    let nextPid = 50;

    let sent = [];
    const mockWs = {
      send: (data) => { sent.push(JSON.parse(data)); },
      readyState: 1
    };

    const mockAuth = {
      verifySignature: () => ({ ok: true }),
      parseLoginData: require('../server/auth.js').parseLoginData
    };

    const sm = createSessionManager({
      AUTH: mockAuth,
      AccountKeys: { isBanned: () => false },
      PlayerDb: {
        getProfile: () => ({ name: 'Hero', level: 1 }),
        setOnline: () => {}
      },
      DB: {
        load: async () => ({
          name: 'Hero',
          level: 1,
          exp: 0,
          hp: 100,
          maxHp: 100,
          mp: 50,
          maxMp: 50,
          inv: {},
          gear: {},
          skills: []
        }),
        save: async () => {}
      },
      sanitizeCharName: (n) => n || 'Hero',
      getNextPid: () => nextPid++,
      players,
      wsByPid,
      pidByYid,
      loggingIn,
      detachPlayer: async () => {},
      sendJson: (ws, msg) => { ws.send(JSON.stringify(msg)); },
      send: (p, msg) => {
        const ws = wsByPid.get(p.pid);
        if (ws) ws.send(JSON.stringify(msg));
      },
      selfPayload: (p) => ({ t: 'self', pid: p.pid, name: p.name }),
      effectsPayload: () => ({ t: 'effects', buffs: [] }),
      questsPayload: () => ({ t: 'quests', active: {} }),
      syncPlayerRegionSubscription: () => {},
      recomputeAOI: () => {},
      isSyntheticBot: () => false
    });

    const loginData = Buffer.from(JSON.stringify({ uniqueID: 'user_hero_99', publicName: 'Hero' })).toString('base64url');
    await sm.doLogin(mockWs, { data: loginData, signature: '' });

    t.ok(mockWs.pid != null, 'сокету присвоен pid');
    t.ok(players.has(mockWs.pid), 'игрок зарегистрирован в players');
    t.eq(pidByYid.get('user_hero_99'), mockWs.pid, 'pid зарегистрирован в pidByYid');
    t.ok(!loggingIn.has('user_hero_99'), 'loggingIn блокировка снята после логина');

    const welcomeMsg = sent.find(m => m.t === 'welcome');
    t.ok(!!welcomeMsg, 'клиент получил welcome сообщение');
    t.eq(welcomeMsg.pid, mockWs.pid, 'welcome содержит корректный pid');
  }
};
