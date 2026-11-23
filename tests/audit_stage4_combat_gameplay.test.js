// ============================================================
//  TESTS / AUDIT_STAGE4_COMBAT_GAMEPLAY.TEST.JS
//  Автоматические тесты Этапа 4:
//    - Задача 4.1: сброс истёкшего PvP-флага (flagUntil) и оповещение AOI
//                  при истечении флага / отмытии кармы PK (+ клиентские правки)
//    - Задача 4.2: защита заточки (plusById) при сдаче collect-квестов
//    - Задача 4.3: унификация констант (MELEE_RANGE=4.0, MAGIC_EFFECT_RANGE_DEFAULT=55,
//                  MOVE_TOLERANCE=1.25, MOVE_BURST_SEC=0.8, MAX_FRIENDS=64,
//                  MAX_CONNS_PER_IP=64)
//    - Задача 4.4: паритет формулы блока щитом в C++ SIMD (pDef + shieldDef)*(1 - ignoreDef)
//                  и очистка таймеров/pendingJobs PersistenceClient при сбое postMessage
// ============================================================
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const { createPlayerRegenHandler } = require(path.join(ROOT, 'server', 'handlers', 'player-regen-handler.js'));
const { createMobHandler } = require(path.join(ROOT, 'server', 'handlers', 'mob-handler.js'));
const createDuelHandler = require(path.join(ROOT, 'server', 'handlers', 'duel-handler.js'));
const { createQuestHandler } = require(path.join(ROOT, 'server', 'handlers', 'quest-handler.js'));
const { createCombatResolver, MELEE_RANGE: CR_MELEE_RANGE } = require(path.join(ROOT, 'server', 'combat', 'combat-resolver.js'));
const { createSkillCaster, MAGIC_EFFECT_RANGE_DEFAULT: SC_MAGIC_EFF } = require(path.join(ROOT, 'server', 'combat', 'skill-caster.js'));
const playerCore = require(path.join(ROOT, 'server', 'core', 'player.js'));
const createMovementHandler = require(path.join(ROOT, 'server', 'handlers', 'movement-handler.js'));
const createSocialHandler = require(path.join(ROOT, 'server', 'handlers', 'social-handler.js'));
const { PersistenceClient } = require(path.join(ROOT, 'server', 'workers', 'persistence-client.js'));

const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const COS = require(path.join(ROOT, 'shared', 'cosmetics-db.js'));
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const BR = require(path.join(ROOT, 'shared', 'buff-rules.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const MOB_DB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));

module.exports = async function (t) {
  // ------------------------------------------------------------------
  // 1. Задача 4.1: Сброс истёкшего PvP-флага и оповещение AOI об отмытии кармы PK
  // ------------------------------------------------------------------
  t.suite('Stage 4.1: сброс истёкшего flagUntil в тике игрока (в т.ч. на fast-path)');
  {
    const sent = [];
    const aoi = [];
    const players = new Map();

    const regen = createPlayerRegenHandler({
      BR,
      isPlayerImmortal: () => false,
      onPlayerHit: () => {},
      onPlayerDeath: () => {},
      onPvpLethal: () => {},
      onPlayerDeathByPlayer: () => {},
      isPeaceAt: () => false,
      players,
      send: (p, msg) => sent.push({ pid: p.pid, msg }),
      broadcastAOI: (p, msg) => aoi.push({ pid: p.pid, msg }),
      cosmeticsPublic: () => ({}),
      saveProfileNow: () => {},
      playerWeightState: () => ({ noRegen: false }),
      passiveBonuses: () => ({}),
      L2,
      isNight: () => false,
      invalidateCombatPack: () => {},
      pushEffects: () => {},
      pushCombatStats: () => {}
    });

    // Игрок с полным HP/MP/CP (сработал бы fast-path return) и истёкшим PvP-флагом
    const flaggedPlayer = {
      pid: 101,
      name: 'PvpHero',
      hp: 500,
      maxHp: 500,
      energy: 300,
      maxEnergy: 300,
      cp: 200,
      maxCp: 200,
      dead: false,
      buffs: [],
      debuffs: [],
      karma: 0,
      pk: 2,
      flagUntil: Date.now() - 50
    };
    players.set(101, flaggedPlayer);

    regen.tickPlayerRegen(flaggedPlayer, 0.1);

    t.eq(flaggedPlayer.flagUntil, 0, 'истёкший flagUntil обнулён до 0 даже при полном HP/MP/CP');
    t.ok(sent.some(s => s.pid === 101 && s.msg.t === 'flag' && s.msg.flagged === false && s.msg.flagUntil === 0 && s.msg.pk === 2),
      'игроку отправлен пакет flag { flagged: false, flagUntil: 0, karma, pk }');
    t.ok(aoi.some(a => a.pid === 101 && a.msg.t === 'player_flag' && a.msg.pid === 101 && a.msg.flagged === false && a.msg.karma === 0),
      'в AOI отправлен пакет player_flag { pid, flagged: false, karma }');

    // Неистёкший флаг НЕ сбрасывается
    sent.length = 0;
    aoi.length = 0;
    const activeUntil = Date.now() + 25000;
    flaggedPlayer.flagUntil = activeUntil;
    regen.tickPlayerRegen(flaggedPlayer, 0.1);
    t.eq(flaggedPlayer.flagUntil, activeUntil, 'активный PvP-флаг не сбрасывается раньше срока');
    t.eq(sent.length, 0, 'при активном флаге лишний пакет flag не отправляется');
    t.eq(aoi.length, 0, 'при активном флаге лишний пакет player_flag не отправляется');
  }

  t.suite('Stage 4.1: отмытие кармы PK в mob-handler оповещает самого игрока и AOI');
  {
    const sent = [];
    const aoi = [];
    const players = new Map();
    const mobs = new Map();

    const pkPlayer = {
      pid: 202,
      name: 'RedKiller',
      level: 10,
      x: 10,
      z: 10,
      dead: false,
      hp: 400,
      maxHp: 400,
      karma: 5,
      pk: 1,
      flagUntil: 0,
      get isFlagged() { return Date.now() < this.flagUntil; },
      buffs: []
    };
    players.set(202, pkPlayer);

    const mob = {
      mid: 9001,
      mobId: 'scrapper',
      level: 5,
      exp: 100,
      x: 12,
      z: 10,
      hp: 0,
      maxHp: 100,
      dead: false,
      summoned: true,
      damages: { 202: 100 },
      hate: new Map()
    };
    mobs.set(9001, mob);

    const mh = createMobHandler({
      mobs,
      players,
      activeEvents: new Map(),
      respawnTimers: new Map(),
      spawnedSpots: new Set(),
      getServerSpots: () => [],
      getNextId: () => 9999,
      GEO: { ready: () => false, standY: () => 0 },
      MOB_DB,
      G,
      L2,
      LR,
      EV: {},
      WM,
      dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
      send: (p, msg) => sent.push({ pid: p.pid, msg }),
      broadcastAOI: (p, msg) => aoi.push({ pid: p.pid, msg }),
      playerNear: () => [],
      geoStepMob: () => {},
      mobDisplayNameServer: (id) => String(id),
      spawnMobDropPiles: () => {},
      splitExpToParty: () => {},
      partyMembers: (p) => [p],
      questOnKill: () => false,
      saveProfileNow: () => {},
      regionNameById: () => 'wild',
      zoneLabelAt: () => 'wild',
      losGround: () => true,
      onPlayerHit: () => {},
      onPlayerDeath: () => {},
      applyPlayerDebuff: () => {},
      pushEffects: () => {},
      isPlayerImmortal: () => false
    });

    mh.onMobDeath(pkPlayer, mob);

    t.eq(pkPlayer.karma, 0, 'карма PK отмыта до 0 после убийства моба');
    t.ok(sent.some(s => s.pid === 202 && s.msg.t === 'flag' && s.msg.karma === 0 && s.msg.flagged === false),
      'игроку отправлено обновление flag с karma=0');
    t.ok(aoi.some(a => a.pid === 202 && a.msg.t === 'player_flag' && a.msg.pid === 202 && a.msg.karma === 0 && a.msg.flagged === false),
      'в AOI отправлено player_flag с karma=0 для снятия красного ника PK у наблюдателей');
  }

  t.suite('Stage 4.1: клиентская обработка flag / player_flag и цвета ника (PK красный, PvP фиолетовый)');
  {
    const fills = [];
    const mockCtx = {
      clearRect: () => {},
      strokeText: () => {},
      fillText: (txt) => { fills.push({ txt, fillStyle: mockCtx.fillStyle }); },
      fillStyle: '#ffffff'
    };
    const mockCanvas = { width: 1024, height: 256, getContext: () => mockCtx };
    mockCtx.canvas = mockCanvas;

    fills.length = 0;
    COS.paintNameplate(mockCanvas, { name: 'PKDude', karma: 1200, flagged: false, ctx: mockCtx });
    t.ok(fills.some(f => f.txt === 'PKDude' && f.fillStyle === '#ff4444'), 'PK (karma > 0) рисуется красным #ff4444');

    fills.length = 0;
    COS.paintNameplate(mockCanvas, { name: 'FlagDude', karma: 0, flagged: true, ctx: mockCtx });
    t.ok(fills.some(f => f.txt === 'FlagDude' && f.fillStyle === '#d060ff'), 'PvP-флаг (flagged=true) рисуется фиолетовым #d060ff');

    fills.length = 0;
    COS.paintNameplate(mockCanvas, { name: 'CleanDude', karma: 0, flagged: false, ctx: mockCtx });
    t.ok(fills.some(f => f.txt === 'CleanDude' && f.fillStyle === '#ffffff'), 'после снятия флага/кармы ник возвращается к обычному #ffffff');

    const netWsSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'net-ws.js'), 'utf8');
    t.ok(netWsSrc.includes("case 'player_flag':"), 'net-ws.js обрабатывает пакет player_flag');
    t.ok(netWsSrc.includes('this._refreshRemoteNameTag(r)'), 'net-ws.js перерисовывает плашку наблюдаемого игрока');
    t.ok(netWsSrc.includes('g.player.refreshNameplate()'), 'net-ws.js обновляет собственную плашку при смене flag');
  }

  // ------------------------------------------------------------------
  // 2. Задача 4.2: Защита заточки (plusById) при сдаче collect-квестов
  // ------------------------------------------------------------------
  t.suite('Stage 4.2: защита plusById при сдаче collect-квестов');
  {
    const sent = [];
    const qh = createQuestHandler({
      QD,
      NPCS,
      EXP,
      send: (_p, m) => sent.push(m),
      invCount: (p, id) => (p.inv && p.inv[id]) | 0,
      giveCurrency: (p, amt) => { p.inv.adena = (p.inv.adena | 0) + amt; },
      grantExpSp: (p, exp) => ({ exp, sp: 0 }),
      applyPlayerBuff: () => {},
      pushEffects: () => {},
      pushCombatStats: () => {},
      saveProfileNow: () => {},
      pruneInv: (p) => {
        for (const k of Object.keys(p.inv)) {
          if ((p.inv[k] | 0) <= 0) delete p.inv[k];
        }
      },
      pushWeight: () => {}
    });

    const npc = NPCS.getNpc('gilbert');
    const qPlayer = {
      pid: 303,
      name: 'Quester',
      level: 5,
      exp: 0,
      sp: 0,
      cls: 'operator',
      x: npc.position.x,
      z: npc.position.z,
      inv: { quest_perimeter_coal: 5, apprentice_wand: 1 },
      plusById: { quest_perimeter_coal: 5, apprentice_wand: 4 },
      equip: {},
      quests: {
        active: { main_02_perimeter: { p: [10, 5], at: Date.now() } },
        done: {}
      }
    };

    // Попытка сдать заточенный предмет по collect-цели должна блокироваться
    sent.length = 0;
    qh.doQuestComplete(qPlayer, { questId: 'main_02_perimeter' });
    t.ok(sent.some(m => m.t === 'quest_fail' && m.reason === 'enchanted' && m.itemId === 'quest_perimeter_coal'),
      'doQuestComplete отклонил сдачу заточенного collect-предмета с reason=enchanted');
    t.eq(qPlayer.inv.quest_perimeter_coal, 5, 'количество предмета не списано при отказе');
    t.eq(qPlayer.plusById.quest_perimeter_coal, 5, 'заточка plusById не уничтожена при отказе');
    t.ok(!!qPlayer.quests.active.main_02_perimeter, 'квест остался активным');

    // Снятие заточки с collect-предмета позволяет сдать квест, не затрагивая заточку других предметов
    delete qPlayer.plusById.quest_perimeter_coal;
    sent.length = 0;
    qh.doQuestComplete(qPlayer, { questId: 'main_02_perimeter' });
    t.ok(sent.some(m => m.t === 'quest_complete_ok' && m.questId === 'main_02_perimeter'),
      'незаточенный collect-предмет успешно сдан');
    t.eq(qPlayer.inv.quest_perimeter_coal, undefined, 'collect-предмет списан из сумки');
    t.eq(qPlayer.plusById.apprentice_wand, 4, 'заточка других предметов в plusById не пострадала');
  }

  // ------------------------------------------------------------------
  // 3. Задача 4.3: Унификация констант между server.js и модулями
  // ------------------------------------------------------------------
  t.suite('Stage 4.3: унификация констант (MELEE_RANGE, MAGIC_EFFECT_RANGE_DEFAULT, MOVE_*, MAX_FRIENDS, MAX_CONNS_PER_IP)');
  {
    const srvSrc = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    const cmSrc = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
    const ntSrc = fs.readFileSync(path.join(ROOT, 'server', 'net-transport.js'), 'utf8');

    t.eq(CR_MELEE_RANGE, 4.0, 'combat-resolver.js MELEE_RANGE унифицирован на 4.0');
    t.eq(SC_MAGIC_EFF, 55, 'skill-caster.js MAGIC_EFFECT_RANGE_DEFAULT унифицирован на 55');
    t.eq(playerCore.MOVE_TOLERANCE, 1.25, 'player.js MOVE_TOLERANCE унифицирован на 1.25');
    t.eq(playerCore.MOVE_BURST_SEC, 0.8, 'player.js MOVE_BURST_SEC унифицирован на 0.8');
    t.eq(playerCore.MAX_FRIENDS, 64, 'player.js MAX_FRIENDS равен 64');
    t.eq(createSocialHandler.MAX_FRIENDS, 64, 'social-handler.js MAX_FRIENDS унифицирован на 64');

    const mhDefault = createMovementHandler({});
    t.eq(mhDefault.MOVE_TOLERANCE, 1.25, 'movement-handler.js MOVE_TOLERANCE по умолчанию = 1.25');
    t.eq(mhDefault.MOVE_BURST_SEC, 0.8, 'movement-handler.js MOVE_BURST_SEC по умолчанию = 0.8');

    // Проверка проброса в server.js
    t.ok(srvSrc.includes('MELEE_RANGE,') && srvSrc.includes('MAGIC_EFFECT_RANGE_DEFAULT,'),
      'server.js прокидывает MELEE_RANGE и MAGIC_EFFECT_RANGE_DEFAULT в фабрики');
    t.ok(srvSrc.includes('MOVE_TOLERANCE,') && srvSrc.includes('MOVE_BURST_SEC,'),
      'server.js прокидывает MOVE_TOLERANCE и MOVE_BURST_SEC в createMovementHandler');
    t.ok(srvSrc.includes('MAX_FRIENDS: playerCore.MAX_FRIENDS'),
      'server.js прокидывает MAX_FRIENDS из playerCore в createSocialHandler');

    // Нет теневых дефолтов '16' для MAX_CONNS_PER_IP
    t.ok(!/MAX_CONNS_PER_IP\s*\|\|\s*['"]16['"]/.test(cmSrc),
      'cluster-manager.js не содержит теневого дефолта MAX_CONNS_PER_IP=16');
    t.ok(!/MAX_CONNS_PER_IP\s*\|\|\s*['"]16['"]/.test(ntSrc),
      'net-transport.js не содержит теневого дефолта MAX_CONNS_PER_IP=16');

    // Проверка реального радиуса ближнего боя 3.8 м (между старым 3.5 и каноническим 4.0)
    const mobs = new Map([[1, { mid: 1, mobId: 'scrapper', hp: 500, maxHp: 500, pDef: 10, cDef: 10, evasion: 1, level: 1, x: 3.8, z: 0 }]]);
    const attacker = {
      pid: 1, name: 'MeleeCheck', level: 5, cls: 'operator', hp: 200, maxHp: 200, x: 0, z: 0,
      cd: {}, buffs: [], combatPack: { pAtk: 50, cAtk: 10, accuracy: 99, critRate: 40, atkIntervalMs: 500, weaponClass: '1h_sword' }
    };
    const cr = createCombatResolver({
      mobs,
      players: new Map([[1, attacker]]),
      playerWeightState: () => ({ canAttack: true }),
      checkRate: () => true
    });
    t.eq(cr.MELEE_RANGE, 4.0, 'инстанс combatResolver использует MELEE_RANGE=4.0');
    const hitInRange = cr.resolvePveAttack(attacker, { mid: 1 });
    t.eq(hitInRange, true, 'атака ближнего боя на 3.8 м (<= 4.0 м) проходит');
    mobs.get(1).x = 4.2;
    attacker.cd.atk = 0;
    const hitOutRange = cr.resolvePveAttack(attacker, { mid: 1 });
    t.eq(hitOutRange, false, 'атака ближнего боя на 4.2 м (> 4.0 м) отклонена');

    // Проверка лимита друзей 64 в social-handler
    const socialMsgs = [];
    const sh = createSocialHandler({
      players: new Map(),
      pidByYid: new Map(),
      send: (_p, m) => socialMsgs.push(m),
      sendPid: () => {},
      broadcastAOI: () => {},
      broadcastRegion: () => {},
      partyOf: () => null,
      sendClan: () => {},
      isGM: () => false,
      handleGmCommand: () => {},
      sanitizeCharName: (s) => s,
      saveProfileNow: () => {},
      isBadKey: () => false,
      TR: { TRADE_TTL_MS: 30000 }
    });
    const fp = { pid: 1, yid: 'f_owner', name: 'Owner', friends: Array.from({ length: 55 }, (_, i) => ({ yid: 'y' + i, name: 'F' + i })) };
    t.eq(sh.friendsPayload(fp).max, 64, 'friendsPayload сообщает max=64');
    const p55 = { pid: 2, yid: 'y_new', name: 'NewF', friends: [] };
    const fMap = new Map([[1, fp], [2, p55]]);
    const sh2 = createSocialHandler({
      players: fMap,
      pidByYid: new Map([['f_owner', 1], ['y_new', 2]]),
      send: (_p, m) => socialMsgs.push(m),
      sendPid: () => {},
      broadcastAOI: () => {},
      broadcastRegion: () => {},
      partyOf: () => null,
      sendClan: () => {},
      isGM: () => false,
      handleGmCommand: () => {},
      sanitizeCharName: (s) => s,
      saveProfileNow: () => {},
      isBadKey: () => false,
      TR: { TRADE_TTL_MS: 30000 }
    });
    sh2.doFriendAdd(p55, { name: 'Owner' });
    sh2.doFriendAccept(fp, { pid: 2 });
    t.eq(fp.friends.length, 56, 'при 55 друзьях разрешено добавить 56-го (лимит 64, не 50)');

    // Заполняем до 64 и проверяем отказ на 65-го
    while (fp.friends.length < 64) {
      const idx = fp.friends.length;
      fp.friends.push({ yid: 'y_fill_' + idx, name: 'Fill' + idx });
    }
    const p65 = { pid: 3, yid: 'y_65', name: 'Extra65', friends: [] };
    fMap.set(3, p65);
    socialMsgs.length = 0;
    sh2.doFriendAdd(p65, { name: 'Owner' });
    t.ok(socialMsgs.some(m => m.t === 'friend_fail' && m.reason === 'full'),
      'при 64 друзьях 65-й запрос дружбы отклонён (reason=full)');
  }

  // ------------------------------------------------------------------
  // 4. Задача 4.4: Паритет блока щитом в C++ SIMD и очистка PersistenceClient
  // ------------------------------------------------------------------
  t.suite('Stage 4.4: C++ SIMD формула блока щитом (dDef + shieldDef)*(1 - ignoreDef)');
  {
    const nativePath = path.join(ROOT, 'build', 'Release', 'project_steam_native.node');
    let nativeAddon = null;
    try { nativeAddon = require(nativePath); } catch (_) { nativeAddon = null; }
    t.ok(!!nativeAddon && typeof nativeAddon.resolveBatchAttacks === 'function',
      'нативный бинарник project_steam_native.node загружен и экспортирует resolveBatchAttacks');

    if (nativeAddon && typeof nativeAddon.resolveBatchAttacks === 'function') {
      // Паритет blockChance между C++ и JS
      t.near(nativeAddon.blockChance(120, 80, 10), L2.blockChance(120, 80, 10), 1e-4, 'C++ blockChance совпадает с L2.blockChance');

      // Вход: dDef=50, shieldDef=450, ignoreDef=0.2, blockBonus=100 -> bChance=70%
      // Без блока: effDef = 50 * 0.8 = 40 -> dmg ~ 70*200/40 * [0.85..1.15] = [297..402]
      // С блоком по канону: effDef = (50 + 450) * 0.8 = 400 -> dmg ~ 70*200/400 * [0.85..1.15] = [29..40]
      // (Если бы стоял бажный dmg/2, урон при блоке был бы [148..201])
      const N = 200;
      const inBuf = new Float32Array(N * 12);
      const outBuf = new Int32Array(N * 4);
      for (let i = 0; i < N; i++) {
        const o = i * 12;
        inBuf[o + 0] = 0;     // physical
        inBuf[o + 1] = 200;   // pAtk
        inBuf[o + 2] = 50;    // dDef
        inBuf[o + 3] = 200;   // acc (98% hit)
        inBuf[o + 4] = 0;     // eva
        inBuf[o + 5] = 1.0;   // skillPower
        inBuf[o + 6] = 1.0;   // shotMod
        inBuf[o + 7] = 0.0001; // ~0.01% crit
        inBuf[o + 8] = 2.0;   // critMult
        inBuf[o + 9] = 450;   // shieldDef
        inBuf[o + 10] = 100;  // blockBonus -> cap 70%
        inBuf[o + 11] = 0.2;  // ignoreDef
      }
      nativeAddon.resolveBatchAttacks(inBuf, outBuf, N);

      let blockedNonCrit = 0;
      let unblockedNonCrit = 0;
      let badBlockedDmg = 0;
      for (let i = 0; i < N; i++) {
        const dmg = outBuf[i * 4 + 0];
        const missed = outBuf[i * 4 + 1];
        const crit = outBuf[i * 4 + 2];
        const blocked = outBuf[i * 4 + 3];
        if (missed || crit) continue;
        if (blocked) {
          blockedNonCrit++;
          if (dmg < 29 || dmg > 41) badBlockedDmg++;
        } else {
          unblockedNonCrit++;
        }
      }
      t.ok(blockedNonCrit > 50 && unblockedNonCrit > 10,
        `статистика C++ resolveBatchAttacks: blocked=${blockedNonCrit}, unblocked=${unblockedNonCrit}`);
      t.eq(badBlockedDmg, 0,
        'все заблокированные удары C++ строго в диапазоне [29..40] по формуле (pDef + shieldDef)*(1 - ignoreDef)');
    }
  }

  t.suite('Stage 4.4: PersistenceClient очищает таймеры и pendingJobs при синхронной ошибке postMessage');
  {
    const pc = new PersistenceClient({ disabled: true });
    pc.disabled = false;
    pc.workers = [{
      postMessage: () => { throw new Error('EPIPE simulated postMessage failure'); }
    }];

    const tmpFile = path.join(os.tmpdir(), 'ps-stage4-pc-test-' + process.pid + '.json');
    const createdTimers = new Set();
    let clearedJobCount = 0;
    const origClearTimeout = global.clearTimeout;
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) => {
      const h = origSetTimeout(fn, ms, ...args);
      if (ms >= 2000 && (new Error().stack || '').includes('persistence-client')) {
        createdTimers.add(h);
      }
      return h;
    };
    global.clearTimeout = (id) => {
      if (createdTimers.delete(id)) clearedJobCount++;
      return origClearTimeout(id);
    };

    try {
      const wr = await pc.writeAtomic(tmpFile, { payload: { ok: true }, makeBak: false });
      t.eq(wr.ok, true, 'writeAtomic перешёл на inline fallback при падении postMessage');
      t.eq(wr.inline, true, 'writeAtomic выполнен через inline fallback');
      t.eq(pc.pendingJobs.size, 0, 'pendingJobs пуст после сбоя postMessage в writeAtomic');

      const enc = await pc.encryptVault({ secret: '42' }, Buffer.alloc(32, 7));
      t.eq(enc.enc, 'aes-256-gcm', 'encryptVault перешёл на inline fallback при падении postMessage');
      t.eq(pc.pendingJobs.size, 0, 'pendingJobs пуст после сбоя postMessage в encryptVault');

      const sb = await pc.stringifyBatch([{ a: 1 }, { b: 2 }]);
      t.eq(sb, ['{"a":1}', '{"b":2}'], 'stringifyBatch перешёл на inline fallback при падении postMessage');
      t.eq(pc.pendingJobs.size, 0, 'pendingJobs пуст после сбоя postMessage в stringifyBatch');

      const ul = await pc.unlink(tmpFile, { makeBak: false });
      t.eq(ul.ok, true, 'unlink перешёл на inline fallback при падении postMessage');
      t.eq(pc.pendingJobs.size, 0, 'pendingJobs пуст после сбоя postMessage в unlink');

      const pg = await pc.ping();
      t.eq(pg.ok, false, 'ping вернул ok=false без зависания при сбое postMessage');
      t.eq(pc.pendingJobs.size, 0, 'pendingJobs пуст после сбоя postMessage в ping');

      t.eq(createdTimers.size, 0, 'висящих таймеров PersistenceClient не осталось (size === 0)');
      t.eq(clearedJobCount, 5, 'все 5 таймеров job-ов немедленно очищены через clearTimeout');
    } finally {
      global.clearTimeout = origClearTimeout;
      global.setTimeout = origSetTimeout;
      try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (_) {}
      try { if (fs.existsSync(tmpFile + '.bak')) fs.unlinkSync(tmpFile + '.bak'); } catch (_) {}
    }
  }
};
