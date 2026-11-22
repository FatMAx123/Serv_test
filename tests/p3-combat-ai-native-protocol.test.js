// ============================================================
//  TESTS / P3-COMBAT-AI-NATIVE-PROTOCOL.TEST.JS
//  Тесты P3: Боевые формулы, дебафф weakness (atkMult), PvP параметры,
//  death/resurrect/duel/store/regen, AI мобов (flee leash, losGround Y),
//  C++ SIMD (FastRng seed=0, GridQueryRadius reusable ref, std::isfinite, elementMod)
//  и протокольные контракты (doWarehousePut weight, quest buff, skill-learn).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const BR = require('../shared/buff-rules.js');
const DU = require('../shared/duel-rules.js');
const L2 = require('../shared/l2-combat.js');
const CS = require('../shared/class-system.js');
const ITEMS = require('../shared/item-db.js');
const SK = require('../shared/skill-db.js');
const QD = require('../shared/quest-db.js');
const NPCS = require('../shared/npc-services.js');
const EXP = require('../shared/l2-exp-table.js');
const G = require('../shared/game-rules.js');
const WM = require('../shared/world-metrics.js');
const { Player, passiveBonuses } = require('../server/core/player.js');
const { createCombatResolver } = require('../server/combat/combat-resolver.js');
const { createSkillCaster } = require('../server/combat/skill-caster.js');
const { createDeathHandler } = require('../server/handlers/death-handler.js');
const createDuelHandler = require('../server/handlers/duel-handler.js');
const createStoreHandler = require('../server/handlers/store-handler.js');
const { createPlayerRegenHandler } = require('../server/handlers/player-regen-handler.js');
const { createMobHandler } = require('../server/handlers/mob-handler.js');
const createGmHandler = require('../server/handlers/gm-handler.js');
const createWarehouseHandler = require('../server/handlers/warehouse-handler.js');
const { createQuestHandler } = require('../server/handlers/quest-handler.js');
const { createSkillLearnHandler } = require('../server/handlers/skill-learn-handler.js');

module.exports = async function (t) {
  // ============================================================
  // 1. player.js & buff-rules.js: дебафф atkMult / atkRedMult (weakness)
  // ============================================================
  t.suite('P3-1: player.js & buff-rules.js (дебафф weakness / atkMult снижает pAtk и cAtk)');
  {
    const now = Date.now();
    const p = new Player(101, 'p3_weak_yid', { name: 'WeakTest', level: 15, cls: 'operator' });
    const basePAtk = p.combatPack.pAtk;
    const baseCAtk = p.combatPack.cAtk;
    t.ok(basePAtk > 0 && baseCAtk > 0, 'базовые pAtk и cAtk положительные');

    const r = BR.apply(p.debuffs, {
      id: 'curse_weakness',
      name: 'Weakness',
      kind: 'weakness',
      atkRedMult: 0.75,
      until: now + 30000
    }, now);
    p.debuffs = r.list;
    p._combatPack = null;
    p._combatPackExpiry = 0;

    t.eq(BR.atkMult(p.debuffs, now), 0.75, 'BR.atkMult возвращает 0.75 для активного weakness');
    t.eq(p.combatPack.pAtk, Math.floor(basePAtk * 0.75), 'pAtk снижен дебаффом weakness на 25%');
    t.eq(p.combatPack.cAtk, Math.floor(baseCAtk * 0.75), 'cAtk снижен дебаффом weakness на 25%');
  }

  // ============================================================
  // 2. combat-resolver.js & skill-caster.js: проброс PvP параметров
  // ============================================================
  t.suite('P3-2: combat-resolver.js & skill-caster.js (проброс critDamage, wit, hasShield, shieldDef, blockBonus, ignoreDef)');
  {
    const crCode = fs.readFileSync(path.join(__dirname, '../server/combat/combat-resolver.js'), 'utf8');
    const scCode = fs.readFileSync(path.join(__dirname, '../server/combat/skill-caster.js'), 'utf8');
    t.ok(crCode.includes('blockBonus: tPack.blockBonus') && crCode.includes('critDamage: pack.critDamage'),
      'combat-resolver.js передаёт critDamage и blockBonus в L2.resolveHit');
    t.ok(scCode.includes('hasShield: tPack.hasShield, shieldDef: tPack.shieldDef, blockBonus: tPack.blockBonus') &&
         scCode.includes('ignoreDef: ignore, shotMod: skillShotMod'),
      'skill-caster.js передаёт hasShield, shieldDef, blockBonus, critDamage, wit и ignoreDef в PvP L2.resolveHit');
  }

  // ============================================================
  // 3. death-handler.js: cancelPlayerCast в onPlayerDeathByPlayer, запрет хила живых и сброса flagUntil в resurrectPlayer
  // ============================================================
  t.suite('P3-3: death-handler.js (cancelPlayerCast при PvP смерти, строгий resurrectPlayer)');
  {
    let castCancelledFor = null;
    const dh = createDeathHandler({
      WM,
      NPCS,
      itemLookup: () => null,
      equippedCount: () => 0,
      spawnGroundLoot: () => {},
      pushCombatStats: () => {},
      pushWeight: () => {},
      L2,
      EXP,
      levelExpReq: () => 1000,
      ITEMS,
      CS,
      passiveBonuses: () => ({}),
      DR: { luckyUntil: () => 4, rollDeathDrops: () => ({ dropped: [] }) },
      SK,
      isPeaceAt: () => false,
      BR,
      pushEffects: () => {},
      closeTrade: () => {},
      closeStore: () => {},
      interruptDuel: () => {},
      Mod: { log: () => {} },
      saveProfileNow: () => {},
      send: () => {},
      broadcastAOI: () => {},
      snapStandY: () => {},
      updatePlayerRegion: () => true,
      resetMoveBudget: () => {},
      ensureNearbyMobs: () => {},
      cancelPlayerCast: (p, reason) => { castCancelledFor = { pid: p.pid, reason }; },
      checkRate: () => true
    });

    const victim = { pid: 10, yid: 'v_yid', name: 'Victim', level: 10, exp: 500, hp: 0, maxHp: 200, energy: 10, maxEnergy: 100, dead: false, isFlagged: true, karma: 0, buffs: [], debuffs: [], inv: {}, equip: {} };
    const killer = { pid: 11, yid: 'k_yid', name: 'Killer', level: 10, karma: 0, pk: 0 };
    dh.onPlayerDeathByPlayer(victim, killer);
    t.ok(castCancelledFor && castCancelledFor.pid === 10 && castCancelledFor.reason === 'dead',
      'onPlayerDeathByPlayer вызывает cancelPlayerCast(victim, "dead")');

    // Живой игрок с неполным HP не должен лечиться через resurrectPlayer
    const alivePlayer = { pid: 12, name: 'Alive', dead: false, hp: 50, maxHp: 300, energy: 20, maxEnergy: 100, flagUntil: Date.now() + 20000 };
    const resAlive = dh.resurrectPlayer(alivePlayer, killer);
    t.eq(resAlive, false, 'resurrectPlayer возвращает false для живого игрока');
    t.eq(alivePlayer.hp, 50, 'HP живого игрока не изменён вызовом resurrectPlayer');

    // Мёртвый игрок воскрешается, но его flagUntil не затирается принудительно в resurrectPlayer
    victim.flagUntil = 123456;
    const resDead = dh.resurrectPlayer(victim, killer);
    t.eq(resDead, true, 'resurrectPlayer успешно воскрешает мёртвого игрока');
    t.eq(victim.dead, false, 'флаг dead снят');
    t.eq(victim.flagUntil, 123456, 'resurrectPlayer не сбрасывает flagUntil');
  }

  // ============================================================
  // 4. duel-handler.js: не вешать PvP-флаг при атаке PK (tgt.karma > 0) и контроль дистанции в tickDuels
  // ============================================================
  t.suite('P3-4: duel-handler.js (атака PK без флага, прерывание дуэли по дистанции)');
  {
    const players = new Map();
    const sent = [];
    const duh = createDuelHandler({
      players,
      send: (p, m) => sent.push({ pid: p.pid, m }),
      broadcastAOI: () => {},
      isPeaceAt: () => false,
      saveProfileNow: () => {},
      onPlayerDeathByPlayer: () => {},
      findPlayerByName: () => null,
      checkRate: () => true
    });

    const hero = { pid: 1, name: 'Hero', x: 0, z: 0, karma: 0, flagUntil: 0 };
    const pkTarget = { pid: 2, name: 'RedPK', x: 2, z: 2, karma: 2400, flagUntil: 0 };
    duh.maybeFlagPvp(hero, pkTarget);
    t.eq(hero.flagUntil, 0, 'атака по PK (karma > 0) не вешает PvP-флаг на атакующего');

    const normalTarget = { pid: 3, name: 'White', x: 2, z: 2, karma: 0, flagUntil: 0 };
    duh.maybeFlagPvp(hero, normalTarget);
    t.ok(hero.flagUntil > Date.now(), 'атака по мирному игроку (karma == 0) вешает PvP-флаг');

    // Проверка разрыва дистанции в tickDuels
    const d1 = { pid: 21, name: 'DuelA', x: 0, z: 0, hp: 100, maxHp: 100, dead: false };
    const d2 = { pid: 22, name: 'DuelB', x: 10, z: 0, hp: 100, maxHp: 100, dead: false };
    players.set(d1.pid, d1);
    players.set(d2.pid, d2);
    duh.doDuelOffer(d1, { pid: d2.pid });
    duh.doDuelAccept(d2, { pid: d1.pid });
    t.ok(d1.duel && d2.duel, 'дуэль начата');

    // Разводим дуэлянтов на 150 м (> MAX_DIST 120 м)
    d2.x = 150;
    duh.tickDuels();
    t.ok(!d1.duel && !d2.duel, 'tickDuels прервал дуэль при превышении максимальной дистанции');
    t.ok(sent.some(s => s.m.t === 'duel_end' && s.m.reason === 'range'), 'отправлен пакет duel_end с reason: range');
  }

  // ============================================================
  // 5. store-handler.js & player-regen-handler.js: проверка p.trade/p.store/stun в doStoreDeal, смерть от DoT и разделение регена
  // ============================================================
  t.suite('P3-5: store-handler.js (busy/stun в doStoreDeal) и player-regen-handler.js (DoT смерть, prune и реген)');
  {
    const storePlayers = new Map();
    const storeMsgs = [];
    const owner = {
      pid: 31, name: 'Merchant', x: 0, z: 0, dead: false,
      inv: { coal_briquette: 10 }, plusById: {},
      store: { mode: 'sell', title: 'Shop', items: { coal_briquette: { count: 5, price: 100 } } }
    };
    const buyer = {
      pid: 32, name: 'Buyer', x: 1, z: 1, dead: false,
      inv: { adena: 5000 }, plusById: {},
      trade: { peer: 99 }, store: null, stunned: false
    };
    storePlayers.set(owner.pid, owner);
    storePlayers.set(buyer.pid, buyer);

    const sth = createStoreHandler({
      players: storePlayers,
      send: (p, m) => storeMsgs.push({ pid: p.pid, m }),
      broadcastAOI: () => {},
      currencyOf: (p) => p.inv.adena || 0,
      takeCurrency: (p, n) => { p.inv.adena -= n; },
      giveCurrency: (p, n) => { p.inv.adena = (p.inv.adena || 0) + n; },
      invCount: (p, id) => p.inv[id] || 0,
      isBadKey: () => false,
      canCarryMore: () => ({ ok: true }),
      pruneInv: () => {},
      saveProfileNow: () => {},
      pushWeight: () => {},
      playerStunned: (p) => !!p.stunned
    });

    sth.doStoreDeal(buyer, { pid: owner.pid, itemId: 'coal_briquette', count: 1, expectedPrice: 100 }, 'buy');
    t.ok(storeMsgs.some(x => x.m.t === 'store_fail' && x.m.reason === 'busy'), 'doStoreDeal блокирует покупателя с активным p.trade (reason: busy)');

    buyer.trade = null;
    buyer.stunned = true;
    storeMsgs.length = 0;
    sth.doStoreDeal(buyer, { pid: owner.pid, itemId: 'coal_briquette', count: 1, expectedPrice: 100 }, 'buy');
    t.ok(storeMsgs.some(x => x.m.t === 'store_fail' && x.m.reason === 'stunned'), 'doStoreDeal блокирует оглушённого покупателя (reason: stunned)');

    // player-regen-handler: DoT не убивает (L2) — HP зажато на 1, игрок жив; истёкший DoT вызывает pushEffects
    let effectsPushed = 0;
    const prh = createPlayerRegenHandler({
      BR,
      isPlayerImmortal: () => false,
      onPlayerHit: () => {},
      onPlayerDeath: (p) => { p.dead = true; p.hp = 0; },
      onPvpLethal: () => {},
      onPlayerDeathByPlayer: () => {},
      isPeaceAt: () => false,
      players: new Map(),
      send: () => {},
      broadcastAOI: () => {},
      cosmeticsPublic: () => ({}),
      saveProfileNow: () => {},
      playerWeightState: () => ({ noRegen: false }),
      passiveBonuses: () => ({ hpRegenPercent: 0.5, hpRegenFlat: 6 }),
      L2,
      isNight: () => false,
      invalidateCombatPack: () => {},
      pushEffects: () => { effectsPushed++; },
      pushCombatStats: () => {}
    });

    const dotVictim = {
      pid: 41, level: 20, hp: 5, maxHp: 500, energy: 50, maxEnergy: 200, dead: false,
      debuffs: [{ id: 'corrode', kind: 'dot', dps: 20, tickAcc: 0.9, until: Date.now() + 5000 }],
      buffs: []
    };
    prh.tickPlayerRegen(dotVictim, 0.2);
    t.eq(dotVictim.dead, false, 'игрок не погиб от тика DoT (L2: DoT не убивает)');
    t.ok(dotVictim.hp >= 1 && dotVictim.hp < 5, 'DoT опустил HP до 1, дальше только реген', 'hp=' + dotVictim.hp);

    const expiringDotPlayer = {
      pid: 42, level: 20, hp: 400, maxHp: 500, energy: 100, maxEnergy: 200, dead: false,
      debuffs: [{ id: 'corrode', kind: 'dot', dps: 10, until: Date.now() - 10 }],
      buffs: []
    };
    prh.tickPlayerRegen(expiringDotPlayer, 0.1);
    t.eq(expiringDotPlayer.debuffs.length, 0, 'истёкший DoT удалён');
    t.ok(effectsPushed >= 1, 'снятие истёкшего DoT вызвало pushEffects');
  }

  // ============================================================
  // 6. mob-handler.js, gm-handler.js & server.js AOI/borderGhosts
  // ============================================================
  t.suite('P3-6: mob-handler.js (flee leashT, losGround Y), gm-handler.js (grid insert) и server.js (target/borderGhosts)');
  {
    const mobCode = fs.readFileSync(path.join(__dirname, '../server/handlers/mob-handler.js'), 'utf8');
    t.ok(!mobCode.includes("m.state = 'flee';\n        m.fleeUntil = nowDot + 9000;\n        m.target = near.pid;\n        m.oocRegenT = 0;\n        m.lostTargetT = 0;\n        m.leashT = 0;"),
      'в цикле flee убран безусловный сброс m.leashT = 0');
    t.ok(mobCode.includes('losGround(m.x, m.z, near.x, near.z, m.y, near.y)'),
      'mob-handler.js передаёт высоты m.y и near.y в losGround');

    const gmCode = fs.readFileSync(path.join(__dirname, '../server/handlers/gm-handler.js'), 'utf8');
    t.ok(gmCode.includes('spatialGrid.insertMob(nm)') && gmCode.includes('nativeSpatialGrid.insert(nm.mid'),
      'gm-handler.js регистрирует заспавненных через //spawn мобов в spatialGrid и nativeSpatialGrid');

    const srvCode = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    t.ok(srvCode.includes('m.target === _aoiObsPid') && srvCode.includes('targetM.target === p.pid'),
      'server.js проверяет m.target / targetM.target при приоритизации AOI');
    t.ok(srvCode.includes('appearance: ghost.appearance || null, equip: ghost.equip || null'),
      'snapshot() для borderGhosts передаёт реальные appearance и equip');
  }

  // ============================================================
  // 7. C++ модуль (combat_engine.h, spatial_grid.h, main.cpp) и мелкие контракты
  // ============================================================
  t.suite('P3-7: C++ SIMD (FastRng seed, std::isfinite, GridQueryRadius ref, elementMod) и контракты');
  {
    const ceCode = fs.readFileSync(path.join(__dirname, '../native/src/combat_engine.h'), 'utf8');
    const sgCode = fs.readFileSync(path.join(__dirname, '../native/src/spatial_grid.h'), 'utf8');
    const mainCpp = fs.readFileSync(path.join(__dirname, '../native/src/main.cpp'), 'utf8');
    const l2Code = fs.readFileSync(path.join(__dirname, '../shared/l2-combat.js'), 'utf8');

    t.ok(ceCode.includes('std::chrono::high_resolution_clock') && mainCpp.includes('g_combatRng(0ULL)'),
      'FastRng инициализируется случайным сидом при seed == 0');
    t.ok(sgCode.includes('std::isfinite(x)') && sgCode.includes('clampCellCoord'),
      'spatial_grid.h проверяет std::isfinite перед кастом координат в int32_t');
    t.ok(mainCpp.includes('resultObjRef') && mainCpp.includes('napi_get_reference_value(env, wrap->resultObjRef, &resultObj)'),
      'GridQueryRadius переиспользует ссылку resultObjRef без аллокации нового объекта на каждый вызов');
    t.ok(l2Code.includes('nativeCombat.circuitDamage(cAtk, cDef, skillPower, shotMod, elementMod == null ? 1.0 : +elementMod, 0)'),
      'l2-combat.js пробрасывает elementMod в nativeCombat.circuitDamage');

    // Проверка doWarehousePut -> pushWeight(p)
    let weightPushed = 0;
    const wh = createWarehouseHandler({
      send: () => {},
      isBadKey: () => false,
      invCount: (p, id) => p.inv[id] || 0,
      currencyOf: (p) => p.inv.adena || 0,
      takeCurrency: (p, n) => { p.inv.adena -= n; },
      pruneInv: () => {},
      pruneCounts: () => {},
      canCarryMore: () => ({ ok: true }),
      pushWeight: () => { weightPushed++; },
      saveProfileNow: () => {},
      npcForService: () => ({ id: 'wh_keeper', name: 'Keeper', type: 'warehouse' })
    });
    const whPlayer = {
      dead: false, trade: null, store: null, isFlagged: false,
      inv: { coal_briquette: 5, adena: 1000 }, wh: {}, plusById: {}, whPlusById: {}, equip: {}
    };
    wh.doWarehousePut(whPlayer, { npcId: 'wh_keeper', itemId: 'coal_briquette', count: 2 });
    t.eq(weightPushed, 1, 'doWarehousePut вызывает pushWeight(p) после перемещения предмета на склад');

    // Проверка quest-handler: сохранение реальных полей rewards.buff
    let appliedBuff = null;
    const origGet = QD.get;
    QD.get = (qid) => {
      if (qid === 'test_custom_buff_q') {
        return {
          id: 'test_custom_buff_q',
          name: 'Custom Buff Quest',
          objectives: [],
          rewards: {
            exp: 10,
            buff: { id: 'overdrive', name: 'Overdrive', duration: 600, attackMult: 1.25, speedMult: 1.15, priority: 15 }
          }
        };
      }
      return origGet.call(QD, qid);
    };
    try {
      const qh = createQuestHandler({
        QD,
        NPCS,
        EXP,
        send: () => {},
        invCount: () => 0,
        giveCurrency: () => {},
        grantExpSp: () => ({ exp: 10, sp: 0 }),
        applyPlayerBuff: (_p, b) => { appliedBuff = b; },
        pushEffects: () => {},
        pushCombatStats: () => {},
        saveProfileNow: () => {},
        pruneInv: () => {},
        pushWeight: () => {}
      });
      const qp = {
        dead: false, trade: null, store: null, level: 10, exp: 0, sp: 0,
        inv: {}, equip: {}, plusById: {},
        quests: { active: { test_custom_buff_q: { p: [], at: Date.now() } }, done: {} }
      };
      qh.doQuestComplete(qp, { questId: 'test_custom_buff_q' });
      t.ok(appliedBuff && appliedBuff.attackMult === 1.25 && appliedBuff.speedMult === 1.15 && appliedBuff.priority === 15,
        'doQuestComplete передаёт реальные поля rewards.buff (attackMult, speedMult, priority)');
      t.eq(appliedBuff.expMult, undefined, 'doQuestComplete не навязывает expMult: 1.15, если у баффа заданы собственные статы');
    } finally {
      QD.get = origGet;
    }

    // Проверка skill-learn-handler: единые поля learn_skill_ok и pushCombatStats в doClassTransfer
    const slCode = fs.readFileSync(path.join(__dirname, '../server/handlers/skill-learn-handler.js'), 'utf8');
    t.ok(slCode.includes('level: next,') && slCode.includes('rank: next,') && slCode.includes('spRemaining: p.sp,') && slCode.includes('sp: p.sp,'),
      'learn_skill_ok содержит унифицированные поля level/rank и sp/spRemaining');
    t.ok(slCode.includes("if (typeof pushCombatStats === 'function') pushCombatStats(p);"),
      'doClassTransfer вызывает pushCombatStats(p) после смены профессии');
  }
};

