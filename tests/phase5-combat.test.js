// TESTS / PHASE5-COMBAT.TEST.JS
// Комплексное тестирование Фазы 5: buff-manager, combat-resolver, skill-caster, combat-handler
'use strict';

const { createBuffManager } = require('../server/combat/buff-manager.js');
const { createCombatResolver, BLOCK_CAP, SOULSHOT_MULT } = require('../server/combat/combat-resolver.js');
const { createSkillCaster } = require('../server/combat/skill-caster.js');
const { createCombatHandler } = require('../server/handlers/combat-handler.js');
const L2 = require('../shared/l2-combat.js');
const BR = require('../shared/buff-rules.js');

module.exports = async function runPhase5Tests(t) {
  // ─── 1. Buff Manager Tests ───
  t.suite('Фаза 5.1: buff-manager (баффы, дебаффы, диспел, контроль)');
  {
    const sent = [];
    const broadcasted = [];
    let invalidated = false;

    const bm = createBuffManager({
      send: (p, msg) => sent.push({ pid: p.pid, msg }),
      broadcastAOI: (origin, msg) => broadcasted.push({ origin, msg }),
      invalidateCombatPack: () => { invalidated = true; }
    });

    const player = {
      pid: 1,
      name: 'Tester',
      buffs: [],
      debuffs: []
    };

    // 1.1. Наложение баффа
    const now = 1000000;
    bm.applyPlayerBuff(player, { id: 'might', attackMult: 1.15, until: now + 60000, priority: 10 }, now);
    t.eq(player.buffs.length, 1, 'Бафф успешно добавлен в player.buffs');
    t.eq(invalidated, true, 'invalidateCombatPack вызван при наложении баффа');

    // 1.2. Проверка бессмертия
    t.eq(bm.isPlayerImmortal(player, now), false, 'Игрок без баффа бессмертия не бессмертен');
    bm.applyPlayerBuff(player, { id: 'test_immortal', immortal: true, until: now + 30000, priority: 20 }, now);
    t.eq(bm.isPlayerImmortal(player, now), true, 'Игрок с баффом immortal=true бессмертен');

    // 1.3. Наложение дебаффов и контроль
    t.eq(bm.playerStunned(player, now), false, 'До дебаффа игрок не в стане');
    t.eq(bm.playerSilenced(player, now), false, 'До дебаффа игрок не в немоте');
    t.eq(bm.playerRooted(player, now), false, 'До дебаффа игрок не в руте');

    bm.applyPlayerDebuff(player, { id: 'stun', kind: 'stun', until: now + 5000, priority: 10 }, now);
    t.eq(bm.playerStunned(player, now), true, 'После наложения стана playerStunned === true');
    t.eq(bm.playerStunned(player, now + 6000), false, 'После истечения времени стан спадает');

    bm.applyPlayerDebuff(player, { id: 'silence', kind: 'silence', until: now + 8000, priority: 10 }, now);
    t.eq(bm.playerSilenced(player, now), true, 'playerSilenced === true при активном silence');

    // 1.4. Диспел
    const dispRes = bm.dispelPlayer(player, { kind: 'buff', now });
    t.ok(dispRes.buffsRemoved >= 1, 'dispelPlayer успешно снял баффы');
    t.eq(bm.isPlayerImmortal(player), false, 'После диспела бессмертие снято');

    // 1.5. Эффекты моба
    const mob = { mid: 42, hp: 100, maxHp: 100, effects: [] };
    bm.applyMobEffect(mob, { id: 'slow_oil', kind: 'slow', slowMult: 0.7, until: now + 10000 }, now);
    const mEffs = bm.getMobEffects(mob, now);
    t.eq(mEffs.length, 1, 'Моб получил 1 активный эффект');
    t.eq(mEffs[0].id, 'slow_oil', 'ID эффекта моба slow_oil');

    bm.broadcastMobEffects(mob);
    t.ok(broadcasted.some(b => b.msg && b.msg.t === 'mob_effects'), 'broadcastMobEffects отправил пакет mob_effects');
  }

  // ─── 2. Combat Resolver Tests ───
  t.suite('Фаза 5.2: combat-resolver (C++ SIMD, BLOCK_CAP, PvE и PvP автоатаки)');
  {
    t.eq(BLOCK_CAP, 70, 'BLOCK_CAP равен 70% (канонический C1 кап блока щитом)');
    t.eq(SOULSHOT_MULT, 2.0, 'SOULSHOT_MULT равен 2.0x (C1 множитель урона соулшота)');

    // 2.1. resolveHit через L2
    const atkStats = { pAtk: 100, cAtk: 50, accuracy: 80, critRate: 100, level: 20, dex: 25, wit: 20, classTier: 1 };
    const defStats = { pDef: 80, cDef: 60, evasion: 60, level: 20, hasShield: true, shieldDef: 50 };
    const hitRes = L2.resolveHit(atkStats, defStats, { skillPower: 1.0, damageType: 'physical', shotMod: 2.0 });
    t.ok(typeof hitRes.damage === 'number' && hitRes.damage >= 0, 'resolveHit вернул числовой урон');
    t.ok(typeof hitRes.missed === 'boolean', 'resolveHit вернул флаг missed');

    // 2.2. PvE атака моба
    const sent = [];
    const aoi = [];
    const mobs = new Map();
    const players = new Map();
    let recordedDmg = 0;
    let mobDied = false;

    const mob = {
      mid: 10,
      mobId: 'gremlin_1',
      hp: 100,
      maxHp: 100,
      pDef: 30,
      cDef: 20,
      evasion: 10,
      level: 1,
      x: 0,
      z: 2
    };
    mobs.set(10, mob);

    const player = {
      pid: 2,
      name: 'Warrior',
      level: 5,
      cls: 'operator',
      hp: 200,
      maxHp: 200,
      x: 0,
      z: 0,
      cd: {},
      buffs: [],
      combatPack: { pAtk: 50, cAtk: 20, accuracy: 70, critRate: 40, atkIntervalMs: 800, weaponClass: '1h_sword' }
    };
    players.set(2, player);

    const cr = createCombatResolver({
      mobs,
      players,
      send: (p, msg) => sent.push(msg),
      broadcastAOI: (origin, msg) => aoi.push(msg),
      consumeArmedShot: () => ({ shotMod: 2.0, consumed: 'ss_d' }),
      recordMobDamage: (m, pid, dmg) => { recordedDmg += dmg; },
      onMobDeath: () => { mobDied = true; },
      playerWeightState: () => ({ canAttack: true }),
      checkRate: () => true
    });

    const pveOk = cr.resolvePveAttack(player, { mid: 10 });
    t.eq(pveOk, true, 'resolvePveAttack успешно выполнен');
    t.ok(recordedDmg > 0, 'Урон по мобу записан в recordMobDamage');
    t.ok(mob.hp < 100, 'Здоровье моба уменьшилось после удара');
    t.ok(aoi.some(a => a.t === 'dmg' && a.mid === 10), 'AOI получил пакет dmg');

    // 2.3. PvE блокировка дистанции
    mob.x = 100; // вне радиуса
    const pveOutOfRange = cr.resolvePveAttack(player, { mid: 10 });
    t.eq(pveOutOfRange, false, 'Атака вне дистанции отклонена');

    // 2.4. PvP атака игрока
    mob.x = 0;
    const tgtPlayer = {
      pid: 3,
      name: 'Defender',
      level: 5,
      hp: 300,
      maxHp: 300,
      x: 0,
      z: 2,
      combatPack: { pDef: 50, cDef: 40, evasion: 20, level: 5 }
    };
    players.set(3, tgtPlayer);

    player.cd.atk = 0;
    const pvpOk = cr.resolvePvpAttack(player, { pid: 3 });
    t.eq(pvpOk, true, 'resolvePvpAttack успешно выполнен');
    t.ok(tgtPlayer.hp < 300, 'Здоровье цели PvP уменьшилось после удара');
    t.ok(aoi.some(a => a.t === 'dmg_player' && a.pid === 3), 'AOI получил пакет dmg_player');
  }

  // ─── 3. Skill Caster Tests ───
  t.suite('Фаза 5.3: skill-caster (каст, прерывание, поддержка и боевые умения)');
  {
    const sent = [];
    const aoi = [];
    const mobs = new Map();
    const players = new Map();

    const mob = { mid: 20, mobId: 'wolf_1', hp: 200, maxHp: 200, pDef: 40, cDef: 30, evasion: 20, level: 3, x: 0, z: 2 };
    mobs.set(20, mob);

    const caster = {
      pid: 5,
      name: 'CasterMage',
      cls: 'engineer',
      level: 10,
      hp: 150,
      maxHp: 150,
      energy: 200,
      maxEnergy: 200,
      skills: { eng_pressure_bolt: 1, eng_self_repair: 1, gm_flash: 1 },
      cd: {},
      buffs: [],
      debuffs: [],
      devices: { nano: 2, circuit: 2 },
      equip: {
        weapon: { id: 'apprentice_wand', templateId: 'apprentice_wand', isEngineerWeapon: true },
        necklace: { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low', isResonator: true },
        bracelet: { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet', isNanoBracelet: true }
      },
      combatPack: { pAtk: 40, cAtk: 80, accuracy: 75, critRate: 30, primary: { MEN: 25, WIT: 25 } },
      x: 0,
      z: 0
    };
    players.set(5, caster);

    const sc = createSkillCaster({
      send: (p, msg) => sent.push(msg),
      broadcastAOI: (origin, msg) => aoi.push(msg),
      players,
      mobs,
      partyMembers: (p) => [p],
      consumeArmedShot: () => ({ shotMod: 1.5, consumed: 'sps_d' }),
      applyPlayerBuff: (p, b) => { p.buffs.push(b); },
      applyPlayerDebuff: (p, d) => { p.debuffs.push(d); },
      recordMobDamage: (m, pid, dmg) => {},
      addMobHate: () => {},
      hateFromHit: () => 10,
      playerWeightState: () => ({ canAttack: true }),
      checkRate: () => true,
      isGM: () => true
    });

    // 3.1. Прерывание каста
    caster.casting = { skillId: 'eng_pressure_bolt', endsAt: Date.now() + 2000 };
    sc.cancelPlayerCast(caster, 'move');
    t.eq(caster.casting, null, 'cancelPlayerCast сбросил состояние casting');
    t.ok(sent.some(s => s.t === 'cast_cancel' && s.reason === 'move'), 'Отправлен пакет cast_cancel');

    // 3.2. Хил / Селф-ремонт (eng_self_repair)
    caster.hp = 80;
    caster.casting = { skillId: 'eng_self_repair', endsAt: Date.now() - 200 };
    sc.doSkillCast(caster, { skillId: 'eng_self_repair' });
    t.ok(caster.hp > 80, 'eng_self_repair восстановил здоровье заклинателя');
    t.ok(sent.some(s => s.t === 'skill_ok' && s.skillId === 'eng_self_repair'), 'Получен пакет skill_ok для self_repair');

    // 3.3. GM Flash переключение
    caster.cd = {};
    caster.energy = 100;
    sc.doSkillCast(caster, { skillId: 'gm_flash' });
    t.eq(caster.gmSpeedMul, 3.5, 'gm_flash активировал 3.5x скорость');
    t.eq(caster.flashSpeed, true, 'flashSpeed установлен в true');

    sc.doSkillCast(caster, { skillId: 'gm_flash' });
    t.eq(caster.gmSpeedMul, 1, 'Повторный gm_flash выключил скорость (1.0x)');
    t.eq(caster.flashSpeed, false, 'flashSpeed установлен в false');
  }

  // ─── 4. Combat Handler Routing Tests ───
  t.suite('Фаза 5.4: combat-handler (маршрутизация входящих сетевых пакетов)');
  {
    let attackHandled = false;
    let attackPlayerHandled = false;
    let castBeginHandled = false;
    let castCompleteHandled = false;
    let castCancelHandled = false;

    const mockCombatResolver = {
      resolvePveAttack: () => { attackHandled = true; return true; },
      resolvePvpAttack: () => { attackPlayerHandled = true; return true; }
    };

    const mockSkillCaster = {
      doCastBegin: () => { castBeginHandled = true; },
      doSkillCast: () => { castCompleteHandled = true; },
      cancelPlayerCast: () => { castCancelHandled = true; }
    };

    const ch = createCombatHandler({
      combatResolver: mockCombatResolver,
      skillCaster: mockSkillCaster,
      checkRate: () => true
    });

    const dummyPlayer = { pid: 99 };

    ch.handleCombatMessage(dummyPlayer, { t: 'attack', mid: 1 });
    t.eq(attackHandled, true, "пакет 'attack' направлен в combatResolver.resolvePveAttack");

    ch.handleCombatMessage(dummyPlayer, { t: 'attack_player', pid: 2 });
    t.eq(attackPlayerHandled, true, "пакет 'attack_player' направлен в combatResolver.resolvePvpAttack");

    ch.handleCombatMessage(dummyPlayer, { t: 'cast_begin', skillId: 'strike' });
    t.eq(castBeginHandled, true, "пакет 'cast_begin' направлен в skillCaster.doCastBegin");

    ch.handleCombatMessage(dummyPlayer, { t: 'skill', skillId: 'strike' });
    t.eq(castCompleteHandled, true, "пакет 'skill' направлен в skillCaster.doSkillCast");

    ch.handleCombatMessage(dummyPlayer, { t: 'cast_cancel' });
    t.eq(castCancelHandled, true, "пакет 'cast_cancel' направлен в skillCaster.cancelPlayerCast");
  }
};
