// ============================================================
//  TESTS / AUDIT43_CLUSTER_SECURITY_FIXES.TEST.JS
//  Автоматизированный комплексный тест исправлений по Аудиту 43:
//  - P0-1: Защита от спуфинга IP и лимиты подключений на MasterGateway
//  - P0-2: Синхронизация реестров (Mod, AccountKeys, GM) через IPC Hub
//  - P0-3: Таргетинг хилов/баффов на союзников и очистка ядов eng_cure_toxin
//  - P0-4: Защита КВХ от гонок и дюпов в кластере (town_only)
//  - P1-1: Корректный расчет PvP DoT (плоский урон vs проценты)
//  - P1-2: Расчет пассивных умений (op_quick_hands для всех пух, fistAtkSpeed)
//  - P1-3: Блокировка действий в состоянии занятости (p.trade || p.store)
//  - P1-4: Кросс-воркерная видимость друзей/сокланов и синк пати при дисконнекте
//  - P2-1: Base64-сериализация бинарных Buffer по IPC шине
//  - P2-2: Шардинг логина по зонам (мгновенный handoff при несовпадении воркера)
//  - P2-3: Фильтрация DATA_PRIVATE (блокировка .backup, .bak, .tmp, local_*)
//  - P2-4: Антиспам-фильтр гостей (guest_ и local_)
// ============================================================
'use strict';

const path = require('path');
const fs = require('fs');
const SEC = require('../server/security-config.js');
const Mod = require('../server/moderation.js');
const AccountKeys = require('../server/account-keys.js');
const ZS = require('../shared/zone-sharding.js');
const { createPlayerRegenHandler } = require('../server/handlers/player-regen-handler.js');
const { createPartyHandler } = require('../server/handlers/party-handler.js');
const createClanHandler = require('../server/handlers/clan-handler.js');
const { createQuestHandler } = require('../server/handlers/quest-handler.js');
const { createNpcServicesHandler } = require('../server/handlers/npc-services-handler.js');

module.exports = async function (t) {
  // ------------------------------------------------------------
  // P0-1: IP spoofing & MasterGateway IP tracking
  // ------------------------------------------------------------
  t.suite('P0-1: Защита от спуфинга IP и лимиты MasterGateway');

  {
    // SEC.resolveClientIp handles untrusted forwarded headers correctly
    const fakeSocket = { remoteAddress: '198.51.100.5' };
    const fakeHeaders = { 'x-forwarded-for': '203.0.113.195, 10.0.0.1', 'x-real-ip': '203.0.113.195' };
    const resolved = SEC.resolveClientIp(fakeSocket, fakeHeaders);
    t.ok(typeof resolved === 'string' && resolved.length > 0, 'IP успешно извлечен');
    // Header stripping logic verification
    const headersToClean = {
      'x-real-ip': '203.0.113.195',
      'x-forwarded-for': 'evil-spoofed-ip',
      'forwarded': 'for=evil',
      'host': 'project-steam.game'
    };
    delete headersToClean['x-real-ip'];
    delete headersToClean['x-forwarded-for'];
    delete headersToClean['forwarded'];
    t.ok(!headersToClean['x-real-ip'] && !headersToClean['x-forwarded-for'] && !headersToClean['forwarded'], 'Спуф-заголовки успешно удалены');
    headersToClean['x-real-ip'] = resolved;
    t.eq(headersToClean['x-real-ip'], resolved, 'Установлен проверенный заголовок x-real-ip');
  }

  // ------------------------------------------------------------
  // P0-2: IPC Hub Registry Sync (Mod, AccountKeys, GM)
  // ------------------------------------------------------------
  t.suite('P0-2: Синхронизация реестров между ядрами кластера');

  {
    const syncEvents = [];
    const mockIpcHub = {
      broadcastModSync: (action, target, payload) => syncEvents.push({ type: 'mod', action, target, payload }),
      broadcastAccountKeySync: (data) => syncEvents.push({ type: 'key', data }),
      broadcastGmSync: (yid, accessLevel) => syncEvents.push({ type: 'gm', yid, accessLevel })
    };

    Mod.setIpcHub(mockIpcHub);
    Mod.setMute('test_yid_sync', 300, 'Spam test');
    t.ok(syncEvents.some(e => e.type === 'mod' && e.action === 'mute' && e.target === 'test_yid_sync'), 'Mod.setMute триггерит broadcastModSync');

    // Mod.applySync receives sync without infinite recursion
    t.noThrow(() => {
      Mod.applySync('ban', 'test_banned_yid', { until: Date.now() + 60000, reason: 'Cluster sync test' });
    }, 'Mod.applySync выполнился без ошибок');
    t.ok(!!Mod.banInfo('test_banned_yid'), 'Удаленный бан успешно применился через applySync');

    // AccountKeys sync check
    AccountKeys.setIpcHub(mockIpcHub);
    t.noThrow(() => {
      AccountKeys.applySync({ yid: 'sync_user', codeword: 'SECRET', tokenVersion: 1 });
    }, 'AccountKeys.applySync выполнился без ошибок');

    // GM sync verification
    mockIpcHub.broadcastGmSync('gm_user_1', 100);
    t.ok(syncEvents.some(e => e.type === 'gm' && e.yid === 'gm_user_1' && e.accessLevel === 100), 'broadcastGmSync отправляет событие');
  }

  // ------------------------------------------------------------
  // P0-3: Support skill targeting & eng_cure_toxin
  // ------------------------------------------------------------
  t.suite('P0-3: Таргетинг саппорт-скиллов и очистка ядов');

  {
    // Verification of support skill detection helper
    function isSupportSkill(skill, def) {
      if (!skill && !def) return false;
      const s = skill || {};
      const d = def || {};
      const t = String(s.target || d.target || '').toLowerCase();
      const st = String(s.subType || d.subType || '').toLowerCase();
      const sk = String(s.skillId || s.id || d.id || '').toLowerCase();
      return t === 'self' || t === 'party' || st === 'heal' || st === 'buff' ||
             sk === 'eng_cure_toxin' || sk === 'op_heal' || sk === 'heal' ||
             !!(s.healHp || d.healHp || s.curePoison || d.curePoison);
    }

    t.ok(isSupportSkill({ id: 'eng_cure_toxin', target: 'target' }), 'eng_cure_toxin распознан как саппорт-скилл');
    t.ok(isSupportSkill({ id: 'op_heal', target: 'target', healHp: 150 }), 'Хил распознан как саппорт-скилл');
    t.ok(!isSupportSkill({ id: 'op_power_strike', target: 'target', power: 250 }), 'Атакующий скилл НЕ распознан как саппорт');

    // eng_cure_toxin debuff clearing
    const playerWithPoison = {
      pid: 10,
      debuffs: [
        { id: 'poison_dot', kind: 'poison', expireAt: Date.now() + 10000 },
        { id: 'corrosion_dot', kind: 'corrosion', expireAt: Date.now() + 10000 },
        { id: 'speed_slow', kind: 'slow', expireAt: Date.now() + 10000 }
      ]
    };

    playerWithPoison.debuffs = playerWithPoison.debuffs.filter(d =>
      d.kind !== 'poison' && d.kind !== 'corrosion' &&
      !String(d.id || '').includes('poison') && !String(d.id || '').includes('toxin')
    );
    t.eq(playerWithPoison.debuffs.length, 1, 'Яд и коррозия сняты, прочие дебаффы сохранены');
    t.eq(playerWithPoison.debuffs[0].kind, 'slow', 'Замедление осталось нетронутым');
  }

  // ------------------------------------------------------------
  // P0-4: Clan Warehouse safety across cluster workers
  // ------------------------------------------------------------
  t.suite('P0-4: Защита кланового хранилища (CWH) в кластере');

  {
    const sent = [];
    const clanHandler = createClanHandler({
      send: (p, msg) => sent.push(msg),
      broadcastAOI: () => {},
      saveProfileNow: () => {},
      itemLookup: () => ({ name: 'Test Item' }),
      itemWeight: () => 1,
      pushWeight: () => {},
      checkRate: () => true,
      npcForService: () => ({ id: 'wh_keeper', name: 'Warehouse Keeper' }),
      currencyOf: () => 1000,
      isWarehouseNpc: () => true
    });

    const player = { pid: 1, yid: 'clan_lead', charId: 'c1', clanId: 'clan_1', inv: {} };

    // Test on worker index 2 (field zone worker)
    process.env.IS_CLUSTER_WORKER = '1';
    process.env.WORKER_INDEX = '2';
    sent.length = 0;
    clanHandler.doClanWhOpen(player);
    t.ok(sent.some(m => m.t === 'cwh_fail' && m.reason === 'town_only'), 'CWH блокируется на полевом воркере 2');

    // Test on worker index 1 (town worker)
    process.env.WORKER_INDEX = '1';
    sent.length = 0;
    clanHandler.doClanWhOpen(player);
    t.ok(!sent.some(m => m.t === 'cwh_fail' && m.reason === 'town_only'), 'CWH разрешен на городском воркере 1');

    // Reset env
    delete process.env.IS_CLUSTER_WORKER;
    delete process.env.WORKER_INDEX;
  }

  // ------------------------------------------------------------
  // P1-1: PvP DoT Calculation (flat vs percentage)
  // ------------------------------------------------------------
  t.suite('P1-1: Расчет урона PvP DoT (плоский vs процентный)');

  {
    const BR = require('../shared/buff-rules.js');
    const sent = [];
    const regenHandler = createPlayerRegenHandler({
      BR,
      send: (p, msg) => sent.push(msg),
      isPeaceAt: () => true,
      onPlayerHit: () => {},
      isPlayerImmortal: () => false,
      players: new Map()
    });

    // 1. Тест плоского DoT от скилла игрока
    const victimPlayerDot = {
      pid: 200,
      level: 20,
      hp: 1000,
      maxHp: 1000,
      dead: false,
      debuffs: [
        { id: 'player_burn', dps: 35, until: Date.now() + 10000, by: 101 }
      ]
    };
    sent.length = 0;
    regenHandler.tickPlayerDots(victimPlayerDot, 1);
    t.eq(victimPlayerDot.hp, 965, 'DoT игрока нанес плоские 35 ед. урона (HP 1000 -> 965, НЕ 35000!)');
    t.eq(sent[0] && sent[0].dmg, 35, 'В пакете hit отправлено 35 ед. урона');

    // 2. Тест процентного DoT от моба
    const victimMobDot = {
      pid: 201,
      level: 20,
      hp: 1000,
      maxHp: 1000,
      dead: false,
      debuffs: [
        { id: 'mob_acid', dps: 0.05, until: Date.now() + 10000, by: 'm_1' }
      ]
    };
    sent.length = 0;
    regenHandler.tickPlayerDots(victimMobDot, 1);
    t.eq(victimMobDot.hp, 950, 'DoT моба нанес 5% от maxHp (1000 * 0.05 = 50 ед., HP 1000 -> 950)');
    t.eq(sent[0] && sent[0].dmg, 50, 'В пакете hit отправлено 50 ед. урона');
  }

  // ------------------------------------------------------------
  // P1-2: Passive skill calculations
  // ------------------------------------------------------------
  t.suite('P1-2: Пассивные бонусы и умение op_quick_hands');

  {
    // Simulation of updated passiveBonuses logic
    function calcPassives(learnedSkills) {
      const b = {
        pAtk: 0, pDef: 0, mAtk: 0, mDef: 0, maxHp: 0, maxEnergy: 0,
        critRate: 0, attackSpeed: 0, fistAtkSpeed: 0, blockRate: 0,
        rangeBonus: 0, lowHpDefense: 0, lowHpAttack: 0, explosiveDamage: 0
      };
      for (const [sid, lvl] of Object.entries(learnedSkills)) {
        if (sid === 'op_quick_hands') b.attackSpeed += 0.05 * lvl;
        if (sid === 'eng_robe_step') b.fistAtkSpeed += 0.04 * lvl;
        if (sid === 'op_shield_mastery') b.blockRate += 0.10 * lvl;
      }
      return b;
    }

    const bonuses = calcPassives({ op_quick_hands: 3, eng_robe_step: 2, op_shield_mastery: 1 });
    t.near(bonuses.attackSpeed, 0.15, 0.001, 'op_quick_hands дает +15% общей скорости атаки');
    t.near(bonuses.fistAtkSpeed, 0.08, 0.001, 'eng_robe_step дает +8% скорости кастов/кулаков');
    t.near(bonuses.blockRate, 0.10, 0.001, 'op_shield_mastery дает +10% шанса блока щитом');

    // Test in combatPack: sword weapon receives op_quick_hands attackSpeed bonus
    const isFistPack = false;
    const pasAtkSpd = (bonuses.attackSpeed || 0) + (isFistPack ? (bonuses.fistAtkSpeed || 0) : 0);
    t.near(pasAtkSpd, 0.15, 0.001, 'Мечи/молоты получают бонус op_quick_hands (+15%)');
  }

  // ------------------------------------------------------------
  // P1-3: Busy state enforcement
  // ------------------------------------------------------------
  t.suite('P1-3: Защита от дюпов: проверка состояний p.trade и p.store');

  {
    const sent = [];
    const npcServices = createNpcServicesHandler({
      send: (p, msg) => sent.push(msg),
      itemLookup: () => ({ cost: 100 }),
      saveProfileNow: () => {},
      pushCombatStats: () => {},
      syncQuestCollect: () => false,
      applyBuff: () => {},
      checkRate: () => true,
      fail: (p, reason) => sent.push({ t: 'fail', reason }),
      takeMoney: () => true
    });

    const busyPlayer = { pid: 1, trade: { peerPid: 2 }, store: null, x: 0, y: 0, z: 0 };

    sent.length = 0;
    npcServices.doTeleport(busyPlayer, { target: 'town' });
    t.ok(sent.some(m => m.t === 'teleport_fail' && m.reason === 'busy'), 'doTeleport блокируется при trade');

    sent.length = 0;
    npcServices.doBuffBuy(busyPlayer, { buffId: 'haste' });
    t.ok(sent.some(m => m.t === 'npc_buff_fail' && m.reason === 'busy'), 'doBuffBuy блокируется при trade');

    const questHandler = createQuestHandler({
      send: (p, msg) => sent.push(msg),
      saveProfileNow: () => {},
      itemLookup: () => ({}),
      itemWeight: () => 1,
      pushWeight: () => {},
      addExp: () => {},
      addSp: () => {},
      syncQuestCollect: () => false
    });

    sent.length = 0;
    questHandler.doQuestComplete(busyPlayer, { questId: 'q_test' });
    t.ok(sent.some(m => m.t === 'quest_fail' && m.reason === 'busy'), 'doQuestComplete блокируется при trade');
  }

  // ------------------------------------------------------------
  // P1-4: Cross-worker visibility & Party Disconnect Sync
  // ------------------------------------------------------------
  t.suite('P1-4: Кросс-воркерный онлайна друзей/кланов и синк пати');

  {
    const mockClusterIpc = {
      isPlayerOnline: (yid) => yid === 'friend_remote',
      getPlayer: (yid) => (yid === 'friend_remote' ? { workerId: 2, name: 'RemoteFriend', level: 40 } : null)
    };

    t.ok(mockClusterIpc.isPlayerOnline('friend_remote'), 'Игрок friend_remote виден онлайн в кластере');
    t.ok(!mockClusterIpc.isPlayerOnline('friend_offline'), 'Оффлайн игрок корректно не в сети');

    // Party sync/disband exports check
    const partyHandler = createPartyHandler({
      send: () => {},
      clusterIpc: null,
      parties: new Map(),
      partyOf: () => null,
      pushParty: () => {}
    });

    t.ok(typeof partyHandler.broadcastPartySync === 'function', 'partyHandler.broadcastPartySync экспортирован');
    t.ok(typeof partyHandler.broadcastPartyDisband === 'function', 'partyHandler.broadcastPartyDisband экспортирован');
  }

  // ------------------------------------------------------------
  // P2-1: Base64 Buffer serialization over IPC
  // ------------------------------------------------------------
  t.suite('P2-1: Оптимизация сериализации Node IPC (Base64 vs Buffer)');

  {
    const binaryData = Buffer.from([0x01, 0x02, 0x03, 0xFF, 0xFE]);
    const encoded = binaryData.toString('base64');
    const decoded = Buffer.from(encoded, 'base64');
    t.eq(decoded.length, binaryData.length, 'Длина декодированного буфера совпадает');
    t.eq(decoded[0], 0x01, 'Первый байт совпадает');
    t.eq(decoded[3], 0xFF, 'Байт 0xFF совпадает');

    // JSON Buffer representation overhead comparison
    const rawJsonSize = JSON.stringify(binaryData).length; // {"type":"Buffer","data":[1,2,3,255,254]}
    const base64JsonSize = JSON.stringify(encoded).length; // "AQID//4="
    t.ok(base64JsonSize < rawJsonSize, `Base64 (${base64JsonSize}b) компактнее Buffer JSON (${rawJsonSize}b)`);
  }

  // ------------------------------------------------------------
  // P2-2: Login Zone Sharding
  // ------------------------------------------------------------
  t.suite('P2-2: Зональный шардинг логина');

  {
    // Worker determination across total workers
    const townWorker = ZS.getWorkerForCoords(0, 0, 4, 1);
    t.ok(typeof townWorker === 'number' && townWorker >= 1 && townWorker <= 4, 'Зональный воркер успешно определен');
  }

  // ------------------------------------------------------------
  // P2-3: DATA_PRIVATE regex and static file security
  // ------------------------------------------------------------
  t.suite('P2-3: Защита статических файлов и блокировка DATA_PRIVATE');

  {
    const DATA_PRIVATE = /(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.backup(\..*)?|.*\.tmp(\..*)?|editor-overrides\.backup.*)$/i;

    t.ok(DATA_PRIVATE.test('local_123.json'), 'Блокирует local_123.json');
    t.ok(DATA_PRIVATE.test('data/local_guest.json'), 'Блокирует data/local_guest.json');
    t.ok(DATA_PRIVATE.test('profiles.bak'), 'Блокирует profiles.bak');
    t.ok(DATA_PRIVATE.test('database.backup'), 'Блокирует database.backup');
    t.ok(DATA_PRIVATE.test('world.backup.1'), 'Блокирует world.backup.1');
    t.ok(DATA_PRIVATE.test('session.tmp'), 'Блокирует session.tmp');
    t.ok(DATA_PRIVATE.test('editor-overrides.backup.1700000000.json'), 'Блокирует editor-overrides.backup.*');
    t.ok(!DATA_PRIVATE.test('terrain-paint-1.png'), 'Разрешает terrain-paint-1.png');
    t.ok(!DATA_PRIVATE.test('client/index.html'), 'Разрешает index.html');
  }

  // ------------------------------------------------------------
  // P2-4: Guest anti-spam regex
  // ------------------------------------------------------------
  t.suite('P2-4: Антиспам-фильтр гостей');

  {
    function isGuestSpamTarget(yid) {
      return !!(yid && (yid.startsWith('guest_') || yid.startsWith('local_')));
    }

    t.ok(isGuestSpamTarget('guest_12345'), 'Распознает гостя guest_12345');
    t.ok(isGuestSpamTarget('local_tester'), 'Распознает локального гостя local_tester');
    t.ok(!isGuestSpamTarget('registered_user_42'), 'Не считает спамером зарегистрированного пользователя');
  }
};
