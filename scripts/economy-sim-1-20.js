#!/usr/bin/env node
// ============================================================
//  SCRIPTS / ECONOMY-SIM-1-20.JS — прогон экономики фазы 1 (1→20) по коду игры.
//
//  Только читает модули и печатает отчёт; ничего не пишет и не меняет.
//  Модель собрана на тех же функциях, что и сервер:
//   - споты мира: WM.applyEditorOverrides + rebuildMobSpotsFromEditor (как server.js);
//   - персонаж: server/core/player.js Player.combatPack (статы, пассивки, скорость атаки);
//   - бой: L2.resolveHit в обе стороны, интервал атаки, каст по Casting Spd, MP;
//   - EXP: L2.expModifier, EXP.expToNext; добыча: LT.rollMobLoot / LT.rollSpoil;
//   - витрины: NPCS.shopCatalog, продажа хлама: NPCS.sellPrice; квесты: QUEST_DB.
//
//  Запуск:  node scripts/economy-sim-1-20.js [--seed=1] [--kills=250] [--overhead=0.25]
//                                            [--session=3] [--json]
//  --overhead — доля времени боя на поиск цели и перебежки; --session — часов игры в день
//  (для ежедневных); --kills — выборка убийств на оценку спота.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ARGS = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] == null ? true : m[2]] : [a, true];
}));
const SEED = +ARGS.seed || 1;
const KILL_SAMPLES = +ARGS.kills || 250;
const OVERHEAD = ARGS.overhead != null ? +ARGS.overhead : 0.25;
const SESSION_H = +ARGS.session || 3;
const TARGET_H = [30, 50];
// Ручки «что если» для подбора темпа (в игре не меняют ничего):
// --expMult  — множитель опыта с мобов (как рейт сервера), --questExpMult — множитель наград квестов,
// --regenMult — множитель регена HP/MP, --mobAtkMult — множитель урона мобов.
const EXP_MULT = ARGS.expMult != null ? +ARGS.expMult : 1;
const QUEST_EXP_MULT = ARGS.questExpMult != null ? +ARGS.questExpMult : 1;
const REGEN_MULT = ARGS.regenMult != null ? +ARGS.regenMult : 1;
const MOB_ATK_MULT = ARGS.mobAtkMult != null ? +ARGS.mobAtkMult : 1;

// ─── детерминированный RNG (лут и бой используют Math.random) ───
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(SEED);

// Нативный C++ урон берёт свой генератор случайных чисел — отчёт бы не воспроизводился.
// Формулы те же (shared/l2-combat.js держит JS-копию), поэтому в прогоне берём JS-путь.
// --native — оставить C++ (результат будет плавать от запуска к запуску).
if (!ARGS.native) {
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request) {
    if (/project_steam_native.node$/.test(String(request))) throw new Error('economy-sim: JS-путь формул');
    return origLoad.apply(this, arguments);
  };
}

// ─── модули игры ───
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
WM.applyEditorOverrides(JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'editor-overrides.json'), 'utf8')));
WM.rebuildMobSpotsFromEditor();
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
if (NPCS.rebuild) NPCS.rebuild();
const MOB_DB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const EXP = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));
const PC = require(path.join(ROOT, 'server', 'core', 'player.js'));

const MAX_LEVEL = EXP.MAX_LEVEL || 20;
const SOLO_ROLES = new Set(['solo_passive', 'solo_norm', 'solo_aggro', 'pack']);
const MOB_SWING_SEC = (L2.swingTimeMs ? L2.swingTimeMs(L2.NPC_BASE_ATK_SPD || 253, 100) : 1900) / 1000;
const REST_BELOW = 0.6; // садимся отдыхать, когда HP < 60%
const priceOf = (id) => { const m = NPCS.itemMeta(id); return (m && +m.price) || 0; };
const fmt = (n, d) => (n == null || !Number.isFinite(n) ? '—' : Number(n).toLocaleString('ru-RU', { maximumFractionDigits: d == null ? 0 : d }));
const hours = (sec) => sec / 3600;

// ─── категории предметов ───
const RECIPE_MATS = new Set();
Object.values(G.RECIPES).forEach((r) => r.mats.forEach((m) => RECIPE_MATS.add(m.id)));
function category(id) {
  if (id === 'copper_parts') return 'copper';
  if (/^recipe_/.test(id)) return 'recipe';
  if (/^(blade|parts|pattern)_/.test(id)) return 'dpart';
  if (id === 'crystal_d') return 'crystal_d';
  if (RECIPE_MATS.has(id)) return 'mat';
  const m = NPCS.itemMeta(id);
  if (m && (m.type === 'quest' || /^quest_/.test(id))) return 'quest';
  return 'junk';
}

// ─── споты: мобы соло-ролей и их уровни ───
const SPOTS = WM.buildSpots().filter((s) => {
  const m = MOB_DB.get(s.mob);
  return m && SOLO_ROLES.has(m.role) && !s.boss;
});
function spotCandidates(L) {
  const out = new Map();
  for (const s of SPOTS) {
    const lo = s.lvl[0], hi = s.lvl[1];
    if (hi < L - 2 || lo > L + 3) continue;
    const key = s.mob + '@' + lo + '-' + hi;
    if (!out.has(key)) out.set(key, { mob: s.mob, lo, hi, zone: s.zone || s.region || '' });
  }
  return [...out.values()];
}

// ─── персонаж из серверного Player ───
function makePlayer(cls, L, st) {
  const pr = G.newProfile('Sim', { cls });
  pr.level = L;
  pr.equip = JSON.parse(JSON.stringify(st.equip));
  pr.skills = Object.assign({}, st.skills);
  pr.devices = { valve: 4, wrist: 4, circuit: 4, nano: 4 };
  const p = new PC.Player(1, 'sim_' + cls, pr, { isStressBot: true });
  p.cls = st.cls || cls;
  p.classTier = (CS.getClass(p.cls) || {}).tier || 0;
  p._combatPack = null;
  return p;
}

// ─── бой: одно убийство ───
const ATTACK_SKILLS = {
  operator: ['op_iron_punch', 'op_power_strike'],
  craftsman: ['cr_rivet_blow', 'cr_hammer_strike'],
  engineer: ['eng_pressure_bolt']
};
/**
 * Мистик (Инженер) открывает бой нюком с дистанции каста — моб бежит к нему.
 * Скорость погони как в mob-handler.js: ×1.22 дальше 14 м, ×1.1 на 8–14 м, ×1 вблизи.
 */
const ENG_CAST_RANGE = 30, MELEE_RANGE = 3;
function approachSec(spd) {
  const v = Math.max(0.5, +spd || 3.5);
  const far = Math.max(0, ENG_CAST_RANGE - 14), mid = Math.max(0, Math.min(14, ENG_CAST_RANGE) - 8), near = Math.max(0, Math.min(8, ENG_CAST_RANGE) - MELEE_RANGE);
  return far / (v * 1.22) + mid / (v * 1.1) + near / v;
}
/** Лечилки мистика: между боями HP восстанавливается за MP, а не долгим отдыхом. */
const HEAL_SKILLS = { engineer: ['eng_battle_repair', 'eng_field_repair', 'eng_self_repair'] };
function bestHeal(p, cls) {
  const pack = p.combatPack;
  const pas = PC.passiveBonuses(p);
  let best = null;
  for (const id of HEAL_SKILLS[cls] || []) {
    const rank = p.skills[id] | 0;
    if (rank < 1) continue;
    const tpl = SK.get(id);
    const row = SK.rankData(tpl, rank);
    const power = (row && row.healPower != null) ? row.healPower : (SK.valueAtLevel(tpl, 'healPower', rank) || 0);
    const mpBase = (row && row.energyCost != null) ? row.energyCost : (tpl.energyCost || 0);
    const mp = L2.mpCostFinal ? L2.mpCostFinal(mpBase, pack.weaponClass, p.level, tpl.levelReq || 1) : mpBase;
    const heal = L2.healAmount(power, pack.cAtk, 1 + (pas.healPower || 0));
    const cast = L2.castTimeSec((row && row.chargeTime != null) ? row.chargeTime : (tpl.chargeTime || 0),
      L2.mAtkSpd(pack.primary.WIT || 20, pas.chargeSpeed, pas.castSpeedSet));
    const per = heal / Math.max(1, mp);
    if (!best || per > best.per) best = { id, heal, mp, cast, per };
  }
  return best;
}
function simulateKill(p, cls, mobId, ml, useShots, noSkills) {
  const pack = p.combatPack;
  const mob = MOB_DB.statsAtLevel(mobId, ml);
  const pas = PC.passiveBonuses(p);
  let mobHp = mob.hp;
  let t = 0, hpLost = 0, mpUsed = 0, shots = 0;
  let nextAtk = 0;
  const cd = {};
  const isEng = cls === 'engineer';
  let nextMob = isEng ? approachSec(mob.speed) : 0;
  const shotPer = useShots ? (PC.equippedWeaponShotCount ? PC.equippedWeaponShotCount(p, isEng ? 'sps' : 'ss') : 1) || 1 : 0;
  const atk = {
    pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate,
    critDamage: pack.critDamage, level: L2Level(p), dex: pack.dex, wit: pack.wit, classTier: pack.tier
  };
  const def = { pDef: mob.pDef, cDef: mob.cDef, evasion: mob.evasion, level: ml };
  const mobAtk = { pAtk: mob.pAtk * MOB_ATK_MULT, accuracy: mob.accuracy, critRate: mob.critRate > 1 ? mob.critRate * 10 : 80, level: ml };
  const meDef = { pDef: pack.pDef, evasion: pack.evasion, hasShield: !!pack.hasShield, shieldDef: pack.shieldDef || 0, level: p.level };
  const skills = noSkills ? [] : (ATTACK_SKILLS[cls] || []).filter((id) => (p.skills[id] | 0) > 0);
  let guard = 0;
  while (mobHp > 0 && guard++ < 5000) {
    if (nextMob <= nextAtk) {
      // удар моба
      t = nextMob;
      const h = L2.resolveHit(mobAtk, meDef, { skillPower: 1, damageType: 'physical' });
      if (!h.missed) hpLost += ml <= 5 ? Math.min(h.damage, h.crit ? 24 : 18) : h.damage;
      nextMob = t + MOB_SWING_SEC;
      continue;
    }
    t = nextAtk;
    // скилл, если готов и хватает MP
    let used = false;
    for (const id of skills) {
      const tpl = SK.get(id);
      const rank = p.skills[id] | 0;
      if ((cd[id] || 0) > t) continue;
      const row = SK.rankData(tpl, rank);
      const baseMp = (row && row.energyCost != null) ? row.energyCost : (SK.valueAtLevel(tpl, 'energyCost', rank) || tpl.energyCost || 0);
      const mp = L2.mpCostFinal ? L2.mpCostFinal(baseMp, pack.weaponClass, p.level, tpl.levelReq || 1) : baseMp;
      const castBase = (row && row.chargeTime != null) ? row.chargeTime : (tpl.chargeTime || 0);
      const magic = tpl.damageType === 'circuit';
      const castSec = castBase > 0
        ? L2.castTimeSec(castBase, magic ? L2.mAtkSpd(pack.primary.WIT || 20, pas.chargeSpeed, pas.castSpeedSet) : pack.atkSpdL2)
        : 0;
      const tHit = t + castSec;
      while (nextMob <= tHit) {
        const hm = L2.resolveHit(mobAtk, meDef, { skillPower: 1, damageType: 'physical' });
        if (!hm.missed) hpLost += ml <= 5 ? Math.min(hm.damage, hm.crit ? 24 : 18) : hm.damage;
        nextMob += MOB_SWING_SEC;
      }
      const h = L2.resolveHit(atk, def, {
        skillPower: SK.skillPowerAtLevel(tpl, rank), damageType: tpl.damageType || 'physical',
        shotMod: shotPer ? (magic ? (useShots === 'bsps' ? (L2.BLESSED_SPIRITSHOT_MULT || 2) : (L2.SPIRITSHOT_MULT || Math.SQRT2)) : L2.SOULSHOT_MULT || 2) : 1
      });
      t = tHit;
      if (!h.missed) mobHp -= h.damage;
      mpUsed += mp; shots += shotPer;
      cd[id] = (t - castSec) + Math.max(tpl.cooldown || 0, castSec);
      nextAtk = castSec > 0 ? t + 0.3 : t + pack.atkIntervalMs / 1000;
      used = true;
      break;
    }
    if (used) continue;
    const h = L2.resolveHit(atk, def, {
      skillPower: 1, damageType: 'physical', shotMod: (shotPer && !isEng) ? (L2.SOULSHOT_MULT || 2) : 1
    });
    if (!h.missed) mobHp -= h.damage;
    if (!isEng) shots += shotPer;
    nextAtk = t + pack.atkIntervalMs / 1000;
  }
  return { t, hpLost, mpUsed, shots, mob };
}
function L2Level(p) { return p.level || 1; }

/** Средние по выборке убийств + отдых (HP сидя, MP у Инженера). */
function evalHunt(p, cls, cand, L, useShots, n, noSkills) {
  const pack = p.combatPack;
  // пассивки регена, как в player-regen-handler.js: MP × (1 + energyRegen), HP × (1 + hpRegenPercent)
  const pasR = PC.passiveBonuses(p);
  const mpPas = 1 + (pasR.energyRegen || 0);
  const hpPas = 1 + (pasR.hpRegenPercent || 0);
  const hpSit = REGEN_MULT * hpPas * L2.hpRegenPerSec(pack.baseHpReg, pack.primary.CON, p.level, 'sit');
  const hpRun = REGEN_MULT * hpPas * L2.hpRegenPerSec(pack.baseHpReg, pack.primary.CON, p.level, 'run');
  const mpSit = REGEN_MULT * mpPas * L2.mpRegenPerSec(pack.baseMpReg, pack.primary.MEN, p.level, 'sit');
  const mpRun = REGEN_MULT * mpPas * L2.mpRegenPerSec(pack.baseMpReg, pack.primary.MEN, p.level, 'stand');
  let tFight = 0, tRest = 0, exp = 0, sp = 0, shots = 0, deaths = 0, hpLostSum = 0;
  let hp = pack.maxHp, mp = pack.maxEnergy;
  for (let i = 0; i < n; i++) {
    const ml = cand.lo + Math.floor(Math.random() * (cand.hi - cand.lo + 1));
    const k = simulateKill(p, cls, cand.mob, ml, useShots, noSkills);
    const walk = k.t * OVERHEAD;
    tFight += k.t + walk;
    hp -= k.hpLost; hpLostSum += k.hpLost;
    mp -= k.mpUsed;
    hp = Math.min(pack.maxHp, hp + hpRun * walk);
    mp = Math.min(pack.maxEnergy, mp + mpRun * (k.t + walk));
    if (hp <= 0) { deaths++; hp = pack.maxHp; mp = pack.maxEnergy; tRest += 120; }
    // мистик сначала лечится за MP, отдых — только когда MP кончился
    const heal = bestHeal(p, cls);
    while (heal && hp < pack.maxHp * 0.9 && mp >= heal.mp + 15) {
      hp = Math.min(pack.maxHp, hp + heal.heal); mp -= heal.mp; tRest += heal.cast;
    }
    if (hp < pack.maxHp * REST_BELOW || mp < pack.maxEnergy * 0.25) {
      const need = Math.max((pack.maxHp - hp) / Math.max(0.1, hpSit), (pack.maxEnergy - mp) / Math.max(0.1, mpSit));
      tRest += need; hp = pack.maxHp; mp = pack.maxEnergy;
    }
    const mod = L2.expModifier ? L2.expModifier(p.level, ml) : 1;
    exp += Math.floor(k.mob.exp * mod * EXP_MULT);
    sp += Math.floor(k.mob.exp * mod * (k.mob.sp / Math.max(1, k.mob.exp)));
    shots += k.shots;
  }
  const secPerKill = (tFight + tRest) / n;
  return {
    noSkills: !!noSkills,
    mob: cand.mob, zone: cand.zone, lo: cand.lo, hi: cand.hi,
    ttk: tFight / n / (1 + OVERHEAD), secPerKill, restShare: tRest / (tFight + tRest),
    expPerKill: exp / n, spPerKill: sp / n, shotsPerKill: shots / n,
    deathsPerKill: deaths / n, hpLostPct: hpLostSum / n / pack.maxHp,
    expPerHour: (exp / n) / secPerKill * 3600
  };
}

// ─── ожидаемая добыча за убийство (аналитически по таблицам) ───
function expectedLoot(mobId, pl, ml, spoil) {
  const T = LT.MOB_LOOT_TABLES[mobId];
  const out = {};
  if (!T) return { adena: 0, items: out };
  const lm = LT.levelMod(pl, ml);
  let adena = 0;
  (T.adena && T.adena.groups || []).forEach((g) => { adena += Math.min(1, g.chance * lm.adena) * (g.min + g.max) / 2; });
  ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special'].forEach((sec) => {
    ((T[sec] && T[sec].groups) || []).forEach((g) => {
      const items = g.items || [];
      const sum = items.reduce((a, b) => a + b.weight, 0) || 1;
      const ch = Math.min(1, g.chance * lm.drop);
      items.forEach((it) => { out[it.id] = (out[it.id] || 0) + ch * it.weight / sum * (it.min + it.max) / 2; });
    });
  });
  if (spoil && T.spoil && T.spoil.chance) {
    const pool = (T.spoil.groups || []).flatMap((g) => g.items || []);
    const sum = pool.reduce((a, b) => a + b.weight, 0) || 1;
    const land = L2.magicSuccessChance ? L2.magicSuccessChance(pl, ml) : 1;
    const ch = Math.min(1, T.spoil.chance * (spoil.mult || 1)) * land;
    pool.forEach((it) => { out[it.id] = (out[it.id] || 0) + ch * it.weight / sum * (it.min + it.max) / 2; });
  }
  return { adena, items: out };
}

// ─── снаряжение: жадная покупка из витрин ───
const SHOP_ITEMS = (() => {
  const seen = new Map();
  for (const n of NPCS.allNpcs()) {
    const cat = NPCS.shopCatalog(n.id);
    const list = Array.isArray(cat) ? cat : ((cat && (cat.items || cat.list)) || []);
    for (const e of list) {
      const id = e.id || e.itemId;
      const it = ITEMS.get(id);
      if (!it || (it.type !== 'weapon' && it.type !== 'armor')) continue;
      if (!seen.has(id) || seen.get(id).price > e.price) seen.set(id, { id, price: e.price, it });
    }
  }
  return [...seen.values()];
})();
function slotOf(it) { return it.type === 'weapon' ? 'weapon' : it.slot; }
function gearCandidates(cls, L) {
  const eng = cls === 'engineer';
  return SHOP_ITEMS.filter(({ it }) => {
    if ((it.levelReq || 1) > L) return false;
    if (it.type === 'weapon') {
      if (eng) return !!it.isEngineerWeapon;
      return !it.isEngineerWeapon && it.weaponClass !== 'bow' && it.weaponClass !== 'dagger';
    }
    if (it.slot === 'shield') return false; // двуручное оружие и упрощение: без щита
    if (eng) return it.armorType === 'robe';
    return it.armorType === 'heavy' || it.armorType === 'light';
  });
}
/** Оценка снаряжения: урон в секунду × выживаемость (по серверному combatPack). */
function gearScore(cls, L, st) {
  const p = makePlayer(cls, L, st);
  const k = p.combatPack;
  const dmg = cls === 'engineer' ? k.cAtk * 2.2 : k.pAtk / (k.atkIntervalMs / 1000);
  return dmg * Math.sqrt(k.pDef * k.maxHp);
}
function buyGear(cls, L, st, reserve) {
  const bought = [];
  for (let iter = 0; iter < 8; iter++) {
    const base = gearScore(cls, L, st);
    let best = null;
    for (const c of gearCandidates(cls, L)) {
      const slot = slotOf(c.it);
      const cur = st.equip[slot];
      if (cur && (cur.id === c.id)) continue;
      if (c.price > st.copper - reserve) continue;
      const trial = Object.assign({}, st, { equip: Object.assign({}, st.equip, { [slot]: { id: c.id, templateId: c.id } }) });
      if (c.it.twoHanded || c.it.weaponClass === '2h_blunt' || c.it.weaponClass === '2h_sword') delete trial.equip.shield;
      const gain = gearScore(cls, L, trial) / base - 1;
      if (gain <= 0.02) continue;
      const value = gain / Math.max(1, c.price);
      if (!best || value > best.value) best = { c, slot, value, gain };
    }
    if (!best) break;
    st.equip[best.slot] = { id: best.c.id, templateId: best.c.id };
    st.copper -= best.c.price;
    st.spent.gear += best.c.price;
    bought.push(best.c.id + ' (' + fmt(best.c.price) + ')');
  }
  return bought;
}

// ─── скиллы за SP: жадно, по стоимости ранга ───
function learnSkills(cls, L, st) {
  const line = CS.classLineage(st.cls || cls);
  const pool = SK.list().filter((s) => line.indexOf(s.class) !== -1 && !s.futureUpdate && !s.autoGrant &&
    (s.type === 'passive' || ATTACK_SKILLS[cls].indexOf(s.id) !== -1 || (HEAL_SKILLS[cls] || []).indexOf(s.id) !== -1));
  let changed = true;
  while (changed) {
    changed = false;
    let best = null;
    for (const s of pool) {
      const cur = st.skills[s.id] | 0;
      const max = (s.ranks && s.ranks.length) ? s.ranks.length : (s.maxLevel || 1);
      if (cur >= max) continue;
      const row = s.ranks && s.ranks[cur];
      const need = (row && row.levelReq != null) ? row.levelReq : (s.levelReq || 1);
      if (need > L) continue;
      const cost = (row && row.spCost != null) ? row.spCost : (s.free && cur === 0 ? 0 : (s.spCost != null ? s.spCost : 100));
      if (cost > st.sp) continue;
      if (!best || cost < best.cost) best = { s, cost };
    }
    if (best) {
      st.skills[best.s.id] = (st.skills[best.s.id] | 0) + 1;
      st.sp -= best.cost;
      st.spent.sp += best.cost;
      changed = true;
    }
  }
}

// ─── квесты ───
/** Соло-мобы мира и их уровни (по спотам). */
const SOLO_MOB_LVL = {};
SPOTS.forEach((sp) => {
  const cur = SOLO_MOB_LVL[sp.mob];
  SOLO_MOB_LVL[sp.mob] = cur ? [Math.min(cur[0], sp.lvl[0]), Math.max(cur[1], sp.lvl[1])] : [sp.lvl[0], sp.lvl[1]];
});
/** Цель квеста → {mob, kills}; null — нет соло-источника (групповой/рейдовый квест). */
function questKillsFor(o, qLvl) {
  if (o.type === 'kill') return SOLO_MOB_LVL[o.target] ? { mob: o.target, kills: o.count } : null;
  if (o.type === 'collect') {
    let best = null;
    for (const mob of Object.keys(SOLO_MOB_LVL)) {
      const lv = SOLO_MOB_LVL[mob];
      if (lv[1] < qLvl - 4 || lv[0] > qLvl + 4) continue;
      const ml = Math.max(lv[0], Math.min(lv[1], qLvl));
      const e = expectedLoot(mob, qLvl, ml, null).items[o.target] || 0;
      if (e > 0 && (!best || e > best.e)) best = { mob, e };
    }
    if (!best) return null;
    return { mob: best.mob, kills: Math.ceil(o.count / best.e) };
  }
  return { mob: null, kills: 0 };
}
/** Уровень, на котором соло-игрок делает квест: не ниже levelReq и не ниже (мин. уровень целей − 1). */
function questDoLevel(q) {
  let L = Math.max(1, q.levelReq || 1);
  for (const o of q.objectives || []) {
    const need = questKillsFor(o, Math.max(1, q.levelReq));
    if (need && need.mob && SOLO_MOB_LVL[need.mob]) L = Math.max(L, SOLO_MOB_LVL[need.mob][0] - 1);
  }
  return Math.min(MAX_LEVEL, L);
}
function questSoloOk(q) {
  return (q.objectives || []).every((o) => questKillsFor(o, Math.max(1, q.levelReq)) !== null);
}
const ALL_ONE_OFF = QD.all().filter((q) => !q.repeatable && !q.daily && q.type !== 'event')
  .sort((a, b) => (a.levelReq - b.levelReq));
const ONE_OFF = ALL_ONE_OFF.filter(questSoloOk);
const GROUP_QUESTS = ALL_ONE_OFF.filter((q) => !questSoloOk(q)).map((q) => q.id);
const REPEATABLE = QD.all().filter((q) => q.repeatable && q.type !== 'event' && questSoloOk(q));

/** Время на квест (убийства целей на своём уровне + 3 мин дорога/разговоры) и побочный опыт. */
function questCost(q, p, cls, L, cache) {
  let sec = 180, exp = 0, copper = 0;
  const kills = [];
  // Цели на одного и того же моба выполняются одними убийствами: берём максимум, а не сумму
  const perMob = {};
  for (const o of q.objectives || []) {
    const need = questKillsFor(o, Math.max(1, q.levelReq));
    if (!need || !need.mob) continue;
    perMob[need.mob] = Math.max(perMob[need.mob] || 0, need.kills);
  }
  for (const mob of Object.keys(perMob)) {
    const need = { mob, kills: perMob[mob] };
    const m = MOB_DB.get(need.mob);
    if (!m) continue;
    const lv = SOLO_MOB_LVL[need.mob] || [L, L];
    const ml = Math.max(lv[0], Math.min(lv[1], L));
    const key = need.mob + ':' + ml + ':' + L;
    if (!cache[key]) cache[key] = evalHunt(p, cls, { mob: need.mob, lo: ml, hi: ml, zone: '' }, L, false, 40);
    const h = cache[key];
    sec += need.kills * h.secPerKill;
    exp += need.kills * h.expPerKill;
    copper += need.kills * expectedLoot(need.mob, L, ml, null).adena;
    kills.push({ mob: need.mob, ml, n: need.kills });
  }
  return { sec, exp, copper, kills };
}

/** Учесть ожидаемую добычу n убийств (медь — отдельно, хлам — в продажу). Возвращает медь от хлама. */
function addLoot(st, items, n) {
  let junk = 0;
  for (const [id, per] of Object.entries(items)) {
    const tot = per * n;
    const cat = category(id);
    if (cat === 'recipe') st.loot.recipe[id] = (st.loot.recipe[id] || 0) + tot;
    else if (cat === 'dpart') st.loot.dpart[id] = (st.loot.dpart[id] || 0) + tot;
    else if (cat === 'crystal_d') st.loot.crystal_d += tot;
    else if (cat === 'mat') st.loot.mat += tot;
    else if (cat === 'junk') junk += tot * NPCS.sellPrice(id);
  }
  st.loot.junkSold += junk;
  return junk;
}

// ─── основной прогон одного класса ───
function runClass(cls, scenario) {
  const st = {
    cls, copper: 0, sp: 0, exp: 0,
    equip: JSON.parse(JSON.stringify(G.newProfile('Sim', { cls }).equip)),
    skills: {}, spent: { gear: 0, shots: 0, forge: 0, sp: 0 },
    loot: { recipe: {}, dpart: {}, crystal_d: 0, mat: 0, junkSold: 0 },
    questsDone: new Set(), timeSec: 0, playSec: 0, questSec: 0, questExp: 0, questRewardExp: 0, questLog: [], repeatSec: 0, deaths: 0
  };
  const startP = makePlayer(cls, 1, st);
  st.skills = Object.assign({}, startP.skills);
  const rows = [];
  const qCache = {};
  let lastDayCredit = 0;
  for (let L = 1; L < MAX_LEVEL; L++) {
    learnSkills(cls, L, st);
    const bought = buyGear(cls, L, st, 1500);
    let p = makePlayer(cls, L, st);
    // квесты уровня
    let lvlQuestSec = 0, lvlQuestExp = 0;
    for (const q of ONE_OFF) {
      if (st.questsDone.has(q.id) || questDoLevel(q) > L) continue;
      if (q.classReq && q.classReq !== CS.rootClass(cls)) continue;
      if (q.requires && !st.questsDone.has(q.requires) && QD.get(q.requires)) continue;
      const c = questCost(q, p, cls, L, qCache);
      const r = q.rewards || {};
      st.questsDone.add(q.id);
      lvlQuestSec += c.sec;
      for (const k of c.kills) {
        const sp = (CS.isCraftsman(cls) && L >= 10) ? { mult: SK.spoilChanceMult(st.skills) } : null;
        st.copper += addLoot(st, expectedLoot(k.mob, L, k.ml, sp).items, k.n);
        if (sp) lvlQuestSec += k.n * (L2.castTimeSec(1.2, p.combatPack.atkSpdL2) + 1);
      }
      const qexp = (r.exp || 0) * QUEST_EXP_MULT + c.exp;
      lvlQuestExp += qexp;
      st.questRewardExp += (r.exp || 0) * QUEST_EXP_MULT;
      st.questLog.push({ id: q.id, L, min: c.sec / 60, rewardExp: r.exp || 0, killExp: c.exp, copper: (r.currency || 0) + c.copper });
      st.copper += (r.currency || 0) + c.copper;
      st.sp += (r.sp || 0) + Math.floor((r.exp || 0) / (EXP.spDivisor ? EXP.spDivisor(L) : 28));
    }
    st.exp += lvlQuestExp;
    st.questSec += lvlQuestSec; st.questExp += lvlQuestExp;
    // лучший соло-спот по EXP/ч (со снаряжением и зарядами по средствам)
    const useShots = st.copper > 3000 ? (cls === 'engineer' && st.copper > 8000 ? 'bsps' : true) : false;
    let best = null, safest = null;
    const modes = cls === 'engineer' ? [false] : [false, true];
    for (const cand of spotCandidates(L)) {
      for (const noSk of modes) {
        const h = evalHunt(p, cls, cand, L, useShots, Math.max(60, Math.floor(KILL_SAMPLES / 3)), noSk);
        if (!safest || h.deathsPerKill < safest.deathsPerKill) safest = h;
        if (h.deathsPerKill > 0.02) continue;
        if (!best || h.expPerHour > best.expPerHour) best = h;
      }
    }
    if (!best) best = safest;
    if (!best) { rows.push({ L, note: 'нет соло-спота' }); continue; }
    const hunt = evalHunt(p, cls, { mob: best.mob, lo: best.lo, hi: best.hi, zone: best.zone }, L, useShots, KILL_SAMPLES, best.noSkills);
    st.restShareSum = (st.restShareSum || 0) + hunt.restShare; st.restShareN = (st.restShareN || 0) + 1;
    const need = Math.max(0, EXP.expToNext(L) - st.exp);
    const kills = need > 0 ? Math.ceil(need / Math.max(1, hunt.expPerKill)) : 0;
    const huntSec = kills * hunt.secPerKill;
    st.exp = Math.max(0, st.exp + kills * hunt.expPerKill - EXP.expToNext(L));
    st.sp += kills * hunt.spPerKill;
    // добыча
    const ml = Math.round((hunt.lo + hunt.hi) / 2);
    const spoil = (CS.isCraftsman(cls) && L >= 10) ? { mult: SK.spoilChanceMult(st.skills) } : null;
    const exL = expectedLoot(hunt.mob, L, ml, spoil);
    let copperIn = kills * exL.adena;
    copperIn += addLoot(st, exL.items, kills);
    // спойл стоит времени: каст «Оценки узлов» + «Демонтаж»
    const spoilSec = spoil ? kills * (L2.castTimeSec(1.2, p.combatPack.atkSpdL2) + 1) : 0;
    const shotCost = useShots ? kills * hunt.shotsPerKill * (cls === 'engineer'
      ? priceOf(useShots === 'bsps' ? 'blessed_spiritshot_no_grade' : 'spiritshot_no_grade') : priceOf('soulshot_no_grade')) : 0;
    st.copper += copperIn - shotCost;
    st.spent.shots += shotCost;
    const levelSec = huntSec + spoilSec + lvlQuestSec;
    st.timeSec += levelSec;
    st.playSec += levelSec;
    // сценарий B: повторяемые раз в «игровой день» (сессия SESSION_H часов)
    let repCopper = 0;
    if (scenario === 'B') {
      const days = st.playSec / 3600 / SESSION_H;
      const credits = Math.floor(days) - lastDayCredit;
      if (credits > 0) {
        lastDayCredit += credits;
        for (const q of REPEATABLE) {
          if (questDoLevel(q) > L) continue;
          const c = questCost(q, p, cls, L, qCache);
          if (c.sec > 45 * 60) continue;
          const r = q.rewards || {};
          const items = (r.items || []).reduce((a, it) => a + priceOf(it.id) * 0.4 * it.count, 0);
          repCopper += credits * ((r.currency || 0) + items + c.copper);
          st.repeatSec += credits * c.sec;
          st.timeSec += credits * c.sec;
          st.exp += credits * ((r.exp || 0) + c.exp);
        }
        st.copper += repCopper;
      }
    }
    rows.push({
      L, mob: hunt.mob, zone: hunt.zone, ml: hunt.lo + '–' + hunt.hi, ttk: hunt.ttk, rest: hunt.restShare,
      hpLost: hunt.hpLostPct, kills, expH: hunt.expPerHour, min: levelSec / 60, questMin: lvlQuestSec / 60,
      copperH: (copperIn - shotCost) / Math.max(1, huntSec + spoilSec) * 3600, copper: st.copper,
      shots: useShots, bought, repCopper, deaths: hunt.deathsPerKill * kills
    });
  }
  st.rows = rows;
  return st;
}

// ─── доход предмета в час на лучшем соло-споте (для D-крафта) ───
const CRAFTED = new Set(Object.values(G.RECIPES).map((r) => r.result.id));
function itemPerHour(itemId, cls, st, L) {
  const p = makePlayer(cls, L, st);
  let best = null;
  for (const s of SPOTS) {
    if (s.lvl[0] > L + 2) continue;
    const ml = Math.round((s.lvl[0] + s.lvl[1]) / 2);
    const spoil = CS.isCraftsman(cls) ? { mult: SK.spoilChanceMult(st.skills) } : null;
    const per = expectedLoot(s.mob, L, ml, spoil).items[itemId] || 0;
    if (!per) continue;
    const h = evalHunt(p, cls, { mob: s.mob, lo: s.lvl[0], hi: s.lvl[1], zone: s.zone }, L, true, 60);
    const extra = spoil ? L2.castTimeSec(1.2, p.combatPack.atkSpdL2) + 1 : 0;
    const rate = per / (h.secPerKill + extra) * 3600;
    if (!best || rate > best.rate) best = { rate, mob: s.mob, per };
  }
  return best;
}

// ─── отчёт ───
function report() {
  const out = [];
  const say = (s) => out.push(s == null ? '' : s);
  const results = {};
  for (const scen of ['A', 'B']) {
    results[scen] = {};
    for (const cls of ['operator', 'engineer', 'craftsman']) {
      Math.random = mulberry32(SEED + cls.length * 7 + (scen === 'B' ? 1000 : 0));
      results[scen][cls] = runClass(cls, scen);
    }
  }
  const A = results.A;
  say('# Экономика фазы 1 (1→20) — прогон по коду');
  say('');
  say('Зерно ' + SEED + ', выборка ' + KILL_SAMPLES + ' убийств на спот, накладные на поиск цели +' + Math.round(OVERHEAD * 100) +
    '%, отдых сидя при HP < ' + Math.round(REST_BELOW * 100) + '%. Соло, без пати и рейдов. Цель — ' + TARGET_H.join('–') + ' ч.');
  say('');
  say('## 1. Время 1→20');
  say('');
  say('| Класс | A: гринд + разовые квесты | B: + повторяемые раз в ' + SESSION_H + ' ч | EXP наград квестов | EXP убийств по квестам | Время на квесты (A) | Медь заработано (A / B) | Отдых, доля времени |');
  say('|---|---|---|---|---|---|---|---|');
  for (const cls of Object.keys(A)) {
    const a = A[cls], b = results.B[cls];
    let totalExp = 0; for (let l = 1; l < MAX_LEVEL; l++) totalExp += EXP.expToNext(l);
    say('| ' + CS.getClassName(cls) + ' | ' + fmt(hours(a.timeSec), 1) + ' ч | ' + fmt(hours(b.timeSec), 1) + ' ч | ' +
      fmt(a.questRewardExp / totalExp * 100, 0) + '% | ' + fmt((a.questExp - a.questRewardExp) / totalExp * 100, 0) + '% | ' +
      fmt(hours(a.questSec), 1) + ' ч | ' + fmt(a.copper + a.spent.gear + a.spent.shots) + ' / ' + fmt(b.copper + b.spent.gear + b.spent.shots) +
      ' | ' + fmt((a.restShareSum || 0) / Math.max(1, a.restShareN || 1) * 100) + '% |');
  }
  say('');
  say('Квесты, которые соло не сделать (цели — групповые мобы, элита или боссы), в расчёт не вошли: ' + GROUP_QUESTS.join(', ') + '.');
  for (const cls of Object.keys(A)) {
    const st = A[cls];
    say('');
    say('## 2. ' + CS.getClassName(cls) + ' — по уровням (сценарий A)');
    say('');
    say('| Ур. | Спот (моб, ур.) | Бой, с | Отдых | Урон за бой | Убийств | EXP/ч | Мин. на уровень (квесты) | Медь/ч | Медь | Заряды | Покупки |');
    say('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of st.rows) {
      if (r.note) { say('| ' + r.L + ' | ' + r.note + ' |||||||||||'); continue; }
      say('| ' + r.L + ' | ' + r.mob + ' ' + r.ml + ' | ' + fmt(r.ttk, 1) + ' | ' + fmt(r.rest * 100) + '% | ' + fmt(r.hpLost * 100) + '% HP | ' +
        fmt(r.kills) + ' | ' + fmt(r.expH) + ' | ' + fmt(r.min) + ' (' + fmt(r.questMin) + ') | ' + fmt(r.copperH) + ' | ' + fmt(r.copper) +
        ' | ' + (r.shots ? 'да' : 'нет') + ' | ' + (r.bought.join(', ') || '') + ' |');
    }
    say('');
    const earned = st.copper + st.spent.gear + st.spent.shots;
    say('Итог: ' + fmt(hours(st.timeSec), 1) + ' ч. Заработано меди ' + fmt(earned) + ' (из них хлам ' + fmt(st.loot.junkSold) +
      '); потрачено на снаряжение ' + fmt(st.spent.gear) + ', на заряды ' + fmt(st.spent.shots) + '; на руках к 20 ур. ' + fmt(st.copper) +
      '. Кристаллов D собрано ' + fmt(st.loot.crystal_d, 1) + ', деталей D ' + fmt(Object.values(st.loot.dpart).reduce((a, b) => a + b, 0), 1) + '.');
  }
  say('');
  say('## 2а. Квесты Оператора: где и сколько стоят');
  say('');
  say('| Квест | Делается на ур. | Минут | EXP награды | EXP убийств | Медь |');
  say('|---|---|---|---|---|---|');
  for (const q of A.operator.questLog) {
    say('| ' + q.id + ' | ' + q.L + ' | ' + fmt(q.min) + ' | ' + fmt(q.rewardExp) + ' | ' + fmt(q.killExp) + ' | ' + fmt(q.copper) + ' |');
  }
  // повторяемые: медь в час против гринда
  say('');
  say('## 3. Повторяемые квесты (без отката) — медь в час');
  say('');
  say('| Квест | Ур. | Награда | Время сдачи | Медь/ч | Медь/ч гринда на том же уровне (Оператор) |');
  say('|---|---|---|---|---|---|');
  for (const q of REPEATABLE) {
    const L = Math.max(q.levelReq, 1);
    const st = A.operator;
    const p = makePlayer('operator', L, Object.assign({}, st, { equip: st.equip, skills: st.skills }));
    const c = questCost(q, p, 'operator', L, {});
    const r = q.rewards || {};
    const items = (r.items || []).reduce((a, it) => a + priceOf(it.id) * 0.4 * it.count, 0);
    const per = (r.currency || 0) + items + c.copper;
    // медь в час чистого гринда на лучшем по меди соло-споте этого уровня
    let grind = 0;
    for (const cand of spotCandidates(L)) {
      const h = evalHunt(p, 'operator', cand, L, false, 60);
      const ml = Math.round((cand.lo + cand.hi) / 2);
      const ex = expectedLoot(cand.mob, L, ml, null);
      let v = ex.adena;
      for (const [id, n] of Object.entries(ex.items)) if (category(id) === 'junk') v += n * NPCS.sellPrice(id);
      grind = Math.max(grind, v / h.secPerKill * 3600);
    }
    say('| ' + q.id + (q.daily ? ' (ежедн.)' : '') + ' | ' + q.levelReq + ' | ' + fmt(r.currency || 0) + ' + предметы ~' + fmt(items) + ' | ' +
      fmt(c.sec / 60, 1) + ' мин | ' + fmt(per / c.sec * 3600) + ' | ' + fmt(grind) + ' |');
  }
  // чертежи и D-крафт
  const cr = A.craftsman, op = A.operator;
  say('');
  say('## 4. Чертежи за путь 1→20 (ожидаемое число)');
  say('');
  say('| Чертёж | Ур. | Оператор (дроп) | Мастеровой (дроп + спойл) |');
  say('|---|---|---|---|');
  for (const rid of Object.keys(G.RECIPES)) {
    const id = 'recipe_' + rid;
    say('| ' + rid + ' | ' + G.recipeLevel(rid) + ' | ' + fmt(op.loot.recipe[id] || 0, 2) + ' | ' + fmt(cr.loot.recipe[id] || 0, 2) + ' |');
  }
  say('');
  say('## 5. D-крафт на 20 ур.: сколько часов фарма на одну вещь (лучший соло-спот)');
  say('');
  const dItems = ['revolution_sword', 'heavy_doom_hammer', 'scale_mail_breastplate', 'steam_helmet'];
  say('| Вещь | Компонент | Нужно | Оператор: шт/ч (моб) | Часов | Мастеровой: шт/ч (моб) | Часов |');
  say('|---|---|---|---|---|---|---|');
  const smithSt = Object.assign({}, cr, { cls: 'boiler_smith', skills: Object.assign({}, cr.skills, { bs_guild_recipes: 1, cr_expertise_d: 1 }) });
  for (const rid of dItems) {
    const rec = G.RECIPES[rid];
    const comps = [{ id: 'recipe_' + rid, n: 1 }].concat(rec.mats);
    for (const m of comps) {
      const a = itemPerHour(m.id, 'operator', op, 20);
      const b = itemPerHour(m.id, 'craftsman', smithSt, 20);
      const none = CRAFTED.has(m.id) ? 'только крафт' : 'нет соло-источника';
      say('| ' + rid + ' | ' + m.id + ' | ' + m.n + ' | ' + (a ? fmt(a.rate, 2) + ' (' + a.mob + ')' : none) + ' | ' +
        (a ? fmt(m.n / a.rate, 1) : '—') + ' | ' + (b ? fmt(b.rate, 2) + ' (' + b.mob + ')' : none) + ' | ' + (b ? fmt(m.n / b.rate, 1) : '—') + ' |');
    }
    const fee = G.forgeFee(rid, priceOf, []);
    say('| ' + rid + ' | Горн: плата за попытку / шанс | — | ' + fmt(fee) + ' / ' + Math.round(G.forgeChance(rid) * 100) + '% | ожидаемо ' +
      fmt(fee / G.forgeChance(rid)) + ' меди на вещь | Мастерская: шанс ' + Math.round(rec.chance * 100) + '% | — |');
  }
  return { text: out.join('\n'), results };
}

const r = report();
if (ARGS.json) {
  const slim = {};
  for (const s of Object.keys(r.results)) {
    slim[s] = {};
    for (const c of Object.keys(r.results[s])) {
      const st = r.results[s][c];
      slim[s][c] = { hours: hours(st.timeSec), copper: st.copper, spent: st.spent, loot: st.loot, rows: st.rows };
    }
  }
  console.log(JSON.stringify(slim, null, 2));
} else {
  console.log(r.text);
}
setTimeout(() => process.exit(0), 50);
