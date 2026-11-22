// ============================================================
//  TESTS / L2-CRITICAL-RULES.TEST.JS — критичные правила L2 Classic:
//  CP (поглощает только урон игроков), дроп вещей при смерти по циклу L2J,
//  потеря EXP по уровню (Lucky до 9), DoT не убивает, урон срывает только магию.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const DR = require(path.join(ROOT, 'shared', 'death-rules.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const { applyPlayerDamage, vitalsFields } = require(path.join(ROOT, 'server', 'combat', 'player-damage.js'));
const { createCombatResolver } = require(path.join(ROOT, 'server', 'combat', 'combat-resolver.js'));
const { createSkillCaster } = require(path.join(ROOT, 'server', 'combat', 'skill-caster.js'));
const { createDeathHandler } = require(path.join(ROOT, 'server', 'handlers', 'death-handler.js'));

function meta(id) { return NPCS.itemMeta(id) || ITEMS.get(id) || null; }

function seq(vals) {
  let i = 0;
  return function () { const v = vals[Math.min(i, vals.length - 1)]; i++; return v; };
}

/** Детерминированный PRNG (mulberry32) для статистики. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withRandom(fn, impl) {
  const orig = Math.random;
  Math.random = impl;
  try { return fn(); } finally { Math.random = orig; }
}

module.exports = function (t) {
  // ---------------------------------------------------------------- CP
  t.suite('L2 CP: расчёт из HP-таблицы × доля × CON');
  const con = 43;
  const cpF = L2.maxCpFromStats(con, 1, 'fighter');
  t.eq(cpF, Math.floor(80 * 0.4 * L2.statBonus(con, 'CON')), 'боец L1: 80 × 0.4 × CON_bonus');
  t.eq(L2.maxCpFromStats(27, 1, 'mage'), Math.floor(101 * 0.5 * L2.statBonus(27, 'CON')), 'мистик L1: 101 × 0.5 × CON_bonus');
  t.ok(L2.maxCpFromStats(con, 20, 'fighter') > cpF, 'CP растёт с уровнем');

  const op = CS.statsAtLevel('operator', 10);
  t.ok(op.maxCp > 0, 'statsAtLevel отдаёт maxCp', 'maxCp=' + op.maxCp);
  t.ok(Math.abs(op.maxCp - op.maxHp * 0.4) <= 2, 'у оператора CP ≈ 0.4 × HP', op.maxCp + ' vs ' + op.maxHp);
  const eng = CS.statsAtLevel('engineer', 10);
  t.ok(Math.abs(eng.maxCp - eng.maxHp * 0.5) <= 2, 'у инженера CP ≈ 0.5 × HP', eng.maxCp + ' vs ' + eng.maxHp);

  t.suite('L2 CP: поглощает только урон игроков');
  const v1 = { hp: 100, maxHp: 100, cp: 30, maxCp: 40 };
  const r1 = applyPlayerDamage(v1, 50, { fromPlayer: true });
  t.eq([v1.cp, v1.hp, r1.cpDmg, r1.hpDmg], [0, 80, 30, 20], 'урон игрока: 30 в CP, остаток 20 в HP');
  const v2 = { hp: 100, maxHp: 100, cp: 30, maxCp: 40 };
  applyPlayerDamage(v2, 50, {});
  t.eq([v2.cp, v2.hp], [30, 50], 'урон моба идёт сразу в HP, CP цел');
  const v3 = { hp: 5, maxHp: 100, cp: 0, maxCp: 40 };
  applyPlayerDamage(v3, 50, { minHp: 1 });
  t.eq(v3.hp, 1, 'minHp = 1 зажимает HP (DoT не убивает)');
  t.eq(vitalsFields({ hp: 10.7, cp: 3.2, maxCp: 40 }), { hp: 10, cp: 3, maxCp: 40 }, 'поля hit: hp/cp/maxCp');
  t.eq(vitalsFields({ hp: 10, maxCp: 0 }), { hp: 10 }, 'без CP поля cp нет');

  t.suite('L2 CP: PvP-автоатака сначала снимает CP');
  {
    const sent = [];
    const attacker = {
      pid: 1, yid: 'a', hp: 100, level: 10, cd: {}, x: 0, z: 0, inv: {},
      combatPack: { weaponClass: 'fist', atkIntervalMs: 1000, pAtk: 50, cAtk: 10, accuracy: 9999, critRate: 0, critDamage: 2, dex: 20, wit: 20 }
    };
    const victim = {
      pid: 2, yid: 'b', hp: 100, maxHp: 100, cp: 100000, maxCp: 100000, level: 10, x: 1, z: 0,
      combatPack: { pDef: 50, cDef: 50, evasion: 0, hasShield: false }
    };
    const players = new Map([[1, attacker], [2, victim]]);
    const cr = createCombatResolver({ players, mobs: new Map(), send: (p, m) => sent.push({ p, m }) });
    withRandom(() => cr.resolvePvpAttack(attacker, { pid: 2 }), () => 0.01);
    t.eq(victim.hp, 100, 'HP цел, пока есть CP');
    t.ok(victim.cp < 100000, 'CP уменьшился', 'cp=' + victim.cp);
    const hitPkt = sent.find((s) => s.p === victim && s.m.t === 'hit');
    t.ok(hitPkt && hitPkt.m.hp === 100 && hitPkt.m.cp === Math.floor(victim.cp), 'в hit пришли авторитетные hp и cp');
  }

  // ---------------------------------------------------------------- Дроп при смерти
  t.suite('L2 death drop: одна вещь за проход, rateDrop заново');
  const bag = { synthetic_oil: 10, coal_briquette: 5, iron_scrap: 7, rubber_skin: 3, copper_cable: 2 };
  const one = DR.rollDeathDrops(
    { inv: bag, equip: {}, level: 20 },
    { byMob: true, itemMeta: meta },
    seq([0, 0, 0.99])
  );
  t.eq(one.dropped.length, 1, 'rateDrop прошёл, вещь упала, второй rateDrop мимо — ровно 1 вещь (раньше 3)');

  const rng = mulberry32(12345);
  let passedTrials = 0;
  let totalDrops = 0;
  for (let i = 0; i < 20000; i++) {
    const r = DR.rollDeathDrops({ inv: bag, equip: {}, level: 20 }, { byMob: true, itemMeta: meta }, rng);
    if (r.dropped.length > 0) { passedTrials++; totalDrops += r.dropped.length; }
  }
  const avg = passedTrials ? totalDrops / passedTrials : 0;
  t.ok(passedTrials > 600 && passedTrials < 1400, 'вещи падают примерно в 5 % смертей', passedTrials + ' / 20000');
  t.ok(avg >= 1 && avg < 1.2, 'в среднем ~1 вещь за смерть с дропом (L2J ≈ 1.05)', 'avg=' + avg.toFixed(3));

  const pk = DR.rollDeathDrops(
    { inv: bag, equip: {}, level: 20, karma: 5000, pk: 10 },
    { byPlayer: true, itemMeta: meta },
    seq([0, 0, 0, 0, 0.99])
  );
  t.eq(pk.dropped.length, 2, 'PK: каждый проход — одна вещь, пока проходит rateDrop');

  // ---------------------------------------------------------------- Потеря EXP
  t.suite('L2 death EXP: доля по уровню, Lucky до 9');
  t.eq([1, 9, 10, 39, 40, 75, 76, 77, 78].map(L2.deathExpLossPct),
    [0, 0, 0.07, 0.07, 0.04, 0.04, 0.025, 0.02, 0.015], 'шкала 0 / 7 % / 4 % / 2.5 / 2 / 1.5 %');
  t.eq(EXP.applyDeathExpLoss(9, 500, 0).loss, 0, 'доля 0 больше не подменяется на 4 %');

  const dh = createDeathHandler({
    L2, EXP, DR, SK, CS, ITEMS,
    levelExpReq: (lv) => EXP.expToNext(lv),
    isPeaceAt: () => true,
    itemLookup: () => null,
    NPCS,
    spawnGroundLoot: () => {}, pushCombatStats: () => {}, pushWeight: () => {},
    passiveBonuses: () => ({})
  });
  const lv9 = { level: 9, exp: 1000, cls: 'operator', inv: {}, equip: {}, skills: {} };
  t.eq(dh.applyDeathPenalty(lv9, { byMob: true }).loss, 0, 'ур. 9 — Lucky, EXP не теряется');
  t.eq(lv9.exp, 1000, 'EXP на 9 ур. не изменился');
  const lv15 = { level: 15, exp: 20000, cls: 'operator', inv: {}, equip: {}, skills: {} };
  t.eq(dh.applyDeathPenalty(lv15, { byMob: true }).loss, Math.floor(EXP.expToNext(15) * 0.07), 'ур. 15 — 7 % от expToNext');

  // ---------------------------------------------------------------- Срыв каста
  t.suite('L2 cast break: урон срывает только магию');
  {
    const sc = createSkillCaster({ players: new Map(), mobs: new Map() });
    const phys = { pid: 1, casting: { skillId: 'dest_power_smash', magic: false }, combatPack: { primary: { MEN: 10 } } };
    withRandom(() => sc.checkCastCancelOnDamage(phys, 500), () => 0);
    t.ok(!!phys.casting, 'физический скилл не сбит уроном');
    const mag = { pid: 2, casting: { skillId: 'eng_bolt', magic: true }, combatPack: { primary: { MEN: 10 } } };
    withRandom(() => sc.checkCastCancelOnDamage(mag, 500), () => 0);
    t.ok(mag.casting === null, 'магия сбита уроном (calcCastCancel)');
  }
};
