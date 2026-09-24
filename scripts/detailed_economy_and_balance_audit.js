// scripts/detailed_economy_and_balance_audit.js
const COMBAT = require('../shared/l2-combat.js');
const EXP_TABLE = require('../shared/l2-exp-table.js');
const CLASS_SYSTEM = require('../shared/class-system.js');
const ITEM_DB = require('../shared/item-db.js');
const MOB_DB = require('../shared/mob-db.js');
const LOOT_RULES = require('../shared/loot-rules.js');
const QUEST_DB = require('../shared/quest-db.js');
const NPC_SERVICES = require('../shared/npc-services.js');
const SKILL_DB = require('../shared/skill-db.js');

console.log('================================================================');
console.log('   LINEAGE 2 C1 STEAMPUNK: COMPREHENSIVE BALANCE & ECONOMY AUDIT');
console.log('================================================================\n');

// -------------------------------------------------------------
// 1. MOB STATS & PROGRESSION CURVE
// -------------------------------------------------------------
console.log('### 1. MOB PROGRESSION & STATS CURVE (1-20)\n');
const sampleMobs = [
  { id: 'loose_bolt', lvl: 2, zone: 'School / Yard (1-5)' },
  { id: 'scrapper', lvl: 4, zone: 'School / Yard (1-5)' },
  { id: 'steam_hound', lvl: 7, zone: 'Astard Hills (5-10)' },
  { id: 'bridge_toll_bot', lvl: 8, zone: 'Riverspan (7-9)' },
  { id: 'junk_magpie', lvl: 11, zone: 'Scrapyard (10-14)' },
  { id: 'welding_automaton', lvl: 13, zone: 'Western Lands (11-15)' },
  { id: 'oblivion_walker', lvl: 16, zone: 'Field of Oblivion (15-18)' },
  { id: 'acid_sprayer', lvl: 17, zone: 'Chem Ruins (16-19)' },
  { id: 'rezdiq_private', lvl: 18, zone: 'Rezdiq Barracks (17-20)' },
  { id: 'limit_guard', lvl: 20, zone: 'Steel Fortress (19-21)' },
  // Bosses
  { id: 'scrap_tyrant', lvl: 15, zone: 'Scrapyard (Field RB 14-16)' },
  { id: 'drill_worm', lvl: 17, zone: 'Oblivion Hills (Field RB 16-18)' },
  { id: 'press_hammer', lvl: 19, zone: 'Quiet Backwater (Field RB 18-20)' },
  { id: 'boiler_sovereign', lvl: 20, zone: 'Boiler Lands (Field RB 19-20)' },
  { id: 'steel_colossus', lvl: 23, zone: 'Steel Fortress (Apex Raid 22-23)' }
];

console.log('| Mob ID | Name | Lvl | Role | HP | P.Atk | P.Def | C.Atk | C.Def | EXP | SP | Avg Copper Drop |');
console.log('|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');

sampleMobs.forEach(sm => {
  const m = MOB_DB.get(sm.id);
  if (!m) return;
  const st = MOB_DB.statsAtLevel(sm.id, sm.lvl);
  const loot = LOOT_RULES.MOB_LOOT_TABLES[sm.id];
  let avgCopper = 0;
  if (loot && loot.adena && loot.adena.groups && loot.adena.groups[0]) {
    const ag = loot.adena.groups[0];
    avgCopper = (ag.chance * (ag.min + ag.max) / 2);
  }
  console.log(`| \`${sm.id}\` | ${m.name} | ${sm.lvl} | ${m.role || 'solo'} | ${st.hp} | ${st.pAtk} | ${st.pDef} | ${st.cAtk} | ${st.cDef} | ${st.exp} | ${st.sp || Math.floor(st.exp/28)} | ${avgCopper.toFixed(1)} |`);
});

// -------------------------------------------------------------
// 2. PLAYER PROGRESSION & COMBAT METRICS
// -------------------------------------------------------------
console.log('\n\n### 2. PLAYER COMBAT METRICS & TTK (TIME TO KILL) SIMULATION\n');

const milestones = [
  {
    lvl: 1,
    mobId: 'loose_bolt',
    op: { w: 'operator_hammer_low', chest: 'engineer_jacket_low', legs: 'engineer_pants_low' },
    en: { w: 'apprentice_wand', chest: 'engineer_jacket_low', legs: 'engineer_pants_low' }
  },
  {
    lvl: 5,
    mobId: 'steam_hound',
    op: { w: 'copper_pipe', chest: 'worker_overalls', legs: null },
    en: { w: 'willow_coil', chest: 'circuit_robe_jacket', legs: 'circuit_robe_pants' }
  },
  {
    lvl: 10,
    mobId: 'bridge_toll_bot',
    op: { w: 'iron_hammer', chest: 'worker_overalls', legs: null, shield: 'copper_shield' },
    en: { w: 'mage_staff', chest: 'devotion_jacket', legs: 'devotion_pants' }
  },
  {
    lvl: 15,
    mobId: 'welding_automaton',
    op: { w: 'steam_hammer', chest: 'worker_overalls', legs: null, shield: 'copper_shield' },
    en: { w: 'mace_prayer', chest: 'devotion_jacket', legs: 'devotion_pants' }
  },
  {
    lvl: 20,
    mobId: 'limit_guard',
    op: { w: 'revolution_sword', chest: 'copper_plate', legs: null, shield: 'boiler_shield', helm: 'steam_helmet' },
    en: { w: 'mace_prayer', chest: 'knowledge_jacket', legs: 'knowledge_pants', gloves: 'knowledge_gloves' }
  }
];

const opCls = CLASS_SYSTEM.CLASS_TREE['operator'];
const enCls = CLASS_SYSTEM.CLASS_TREE['engineer'];
const items = ITEM_DB.ITEMS;

milestones.forEach(m => {
  const mob = MOB_DB.get(m.mobId);
  const mobSt = MOB_DB.statsAtLevel(m.mobId, m.lvl);
  
  // Operator Build
  const opHp = COMBAT.maxHpFromStats(opCls.primaryBase.CON, m.lvl, 1, 'fighter');
  const opMp = COMBAT.maxEnergyFromStats(opCls.primaryBase.MEN, m.lvl, 1, 'fighter');
  const opW = items[m.op.w] || {};
  const opChest = items[m.op.chest] || {};
  const opLegs = items[m.op.legs] || {};
  const opShield = items[m.op.shield] || {};
  const opHelm = items[m.op.helm] || {};
  
  const opEquipPAtk = opW.pAtk || opW.attack || 0;
  const opEquipPDef = (opChest.pDef || opChest.defense || 0) + 
                      (opLegs.pDef || opLegs.defense || 0) + 
                      (opHelm.pDef || opHelm.defense || 0);
  const opShieldDef = opShield.pDef || opShield.defense || 0;
  
  const opPAtk = COMBAT.pAtkFromStats(opCls.templateBase.pAtk + opEquipPAtk, opCls.primaryBase.STR, m.lvl);
  const opPDef = COMBAT.pDefFromStats(opCls.templateBase.pDef + opEquipPDef, m.lvl);
  const opCDef = COMBAT.cDefFromStats(opCls.templateBase.mDef, opCls.primaryBase.MEN, m.lvl);
  
  // Engineer Build
  const enHp = COMBAT.maxHpFromStats(enCls.primaryBase.CON, m.lvl, 1, 'mage');
  const enMp = COMBAT.maxEnergyFromStats(enCls.primaryBase.MEN, m.lvl, 1, 'mage');
  const enW = items[m.en.w] || {};
  const enChest = items[m.en.chest] || {};
  const enLegs = items[m.en.legs] || {};
  const enGloves = items[m.en.gloves] || {};
  
  const enEquipCAtk = enW.cAtk || enW.mAtk || 0;
  const enEquipPDef = (enChest.pDef || enChest.defense || 0) + 
                      (enLegs.pDef || enLegs.defense || 0) + 
                      (enGloves.pDef || enGloves.defense || 0);
  
  const enCAtk = COMBAT.cAtkFromStats(enCls.templateBase.mAtk + enEquipCAtk, enCls.primaryBase.INT, m.lvl);
  const enPDef = COMBAT.pDefFromStats(enCls.templateBase.pDef + enEquipPDef, m.lvl);
  const enCDef = COMBAT.cDefFromStats(enCls.templateBase.mDef, enCls.primaryBase.MEN, m.lvl);

  // Operator Combat vs Mob
  const opHitAA = COMBAT.physicalDamage(opPAtk, mobSt.pDef, 1.0, 1.0);
  const opHitSS = COMBAT.physicalDamage(opPAtk, mobSt.pDef, 1.0, 2.0);
  const opHitsAA = Math.ceil(mobSt.hp / opHitAA);
  const opHitsSS = Math.ceil(mobSt.hp / opHitSS);
  const opAtkSpd = COMBAT.atkSpdL2(opW.weaponClass || '1h_blunt', opCls.primaryBase.DEX);
  const opSwingTime = COMBAT.swingTimeSec(opAtkSpd);
  const opTtkAA = (opHitsAA * opSwingTime).toFixed(1);
  const opTtkSS = (opHitsSS * opSwingTime).toFixed(1);

  // Engineer Combat vs Mob
  const enNuke = COMBAT.circuitDamage(enCAtk, mobSt.cDef, 16, 1.0);
  const enNukeSPS = COMBAT.circuitDamage(enCAtk, mobSt.cDef, 16, 1.5);
  const enHits = Math.ceil(mobSt.hp / enNuke);
  const enHitsSPS = Math.ceil(mobSt.hp / enNukeSPS);
  const enCastTime = COMBAT.castTimeSec(4.0, COMBAT.mAtkSpd(enCls.primaryBase.WIT, 0, 0));
  const enTtk = (enHits * (enCastTime + 0.8)).toFixed(1);
  const enTtkSPS = (enHitsSPS * (enCastTime + 0.8)).toFixed(1);

  // Mob vs Player
  const mobDmgToOp = COMBAT.physicalDamage(mobSt.pAtk, opPDef, 1.0, 1.0);
  const mobHitsToOp = Math.ceil(opHp / mobDmgToOp);
  const mobDmgToEn = COMBAT.physicalDamage(mobSt.pAtk, enPDef, 1.0, 1.0);
  const mobHitsToEn = Math.ceil(enHp / mobDmgToEn);

  console.log(`#### Level ${m.lvl} Milestone: vs ${mob.name} (Lvl ${m.lvl}, HP ${mobSt.hp}, P.Def ${mobSt.pDef}, C.Def ${mobSt.cDef}, P.Atk ${mobSt.pAtk})`);
  console.log(`- **OPERATOR** (HP: ${opHp}, MP: ${opMp}, P.Atk: ${opPAtk}, P.Def: ${opPDef}, ShieldDef: ${opShieldDef}):`);
  console.log(`  * Урон за удар: ${opHitAA} (c Soulshot: ${opHitSS})`);
  console.log(`  * Ударов до убийства: ${opHitsAA} (c Soulshot: ${opHitsSS})`);
  console.log(`  * Время убийства (TTK): **${opTtkAA}с** (с Soulshot: **${opTtkSS}с**)`);
  console.log(`  * Выживаемость: Моб наносит ${mobDmgToOp} урона/удар. Оператор выдерживает **${mobHitsToOp} ударов**.`);
  console.log(`- **ENGINEER** (HP: ${enHp}, MP: ${enMp}, C.Atk: ${enCAtk}, P.Def: ${enPDef}, C.Def: ${enCDef}):`);
  console.log(`  * Урон нюка: ${enNuke} (c Spiritshot: ${enNukeSPS})`);
  console.log(`  * Кастов до убийства: ${enHits} (c Spiritshot: ${enHitsSPS})`);
  console.log(`  * Время убийства (TTK): **${enTtk}с** (с Spiritshot: **${enTtkSPS}с**)`);
  console.log(`  * Выживаемость: Моб наносит ${mobDmgToEn} урона/удар. Инженер выдерживает **${mobHitsToEn} ударов**.`);
  console.log('');
});

// -------------------------------------------------------------
// 3. ECONOMY & BALANCE SIMULATION (FAUCETS VS SINKS)
// -------------------------------------------------------------
console.log('\n### 3. ECONOMY: FAUCETS, SINKS & WEALTH ACCUMULATION\n');

// EXP and Kills required per level bracket
const brackets = [
  { name: '1-5 (Starter)', from: 1, to: 5, avgMobLvl: 3, mobId: 'loose_bolt' },
  { name: '6-10 (Early Mid)', from: 6, to: 10, avgMobLvl: 8, mobId: 'bridge_toll_bot' },
  { name: '11-15 (Mid)', from: 11, to: 15, avgMobLvl: 13, mobId: 'welding_automaton' },
  { name: '16-20 (Endgame)', from: 16, to: 20, avgMobLvl: 18, mobId: 'rezdiq_private' }
];

let cumExp = 0;
let cumCopper = 0;
let cumKills = 0;

console.log('| Диапазон | Требуемый EXP | Моб ориентир | EXP/моб | Убийств (Kills) | Дроп меди/моб | Заработок меди | Накоплено меди |');
console.log('|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|');

brackets.forEach(b => {
  let expInBracket = 0;
  for (let l = b.from; l <= b.to; l++) {
    expInBracket += EXP_TABLE.expToNext(l);
  }
  const mobSt = MOB_DB.statsAtLevel(b.mobId, b.avgMobLvl);
  const loot = LOOT_RULES.MOB_LOOT_TABLES[b.mobId];
  let avgCopper = 0;
  if (loot && loot.adena && loot.adena.groups && loot.adena.groups[0]) {
    const ag = loot.adena.groups[0];
    avgCopper = ag.chance * (ag.min + ag.max) / 2;
  }
  // Add scrap/materials sell value (average ~0.5-2 copper per kill at 40% sell rate)
  let avgMatSell = 0;
  if (loot && loot.common && loot.common.groups) {
    loot.common.groups.forEach(g => {
      if (g.items && g.items[0]) {
        const it = items[g.items[0].id] || {};
        const p = (it.price || 10) * 0.4;
        avgMatSell += g.chance * p;
      }
    });
  }
  const totalPerKill = avgCopper + avgMatSell;
  const killsNeeded = Math.ceil(expInBracket / mobSt.exp);
  const copperEarned = Math.floor(killsNeeded * totalPerKill);
  cumExp += expInBracket;
  cumKills += killsNeeded;
  cumCopper += copperEarned;
  
  console.log(`| Ур. ${b.name} | ${expInBracket.toLocaleString()} | ${mobSt.name || b.mobId} (L${b.avgMobLvl}) | ${mobSt.exp} | ${killsNeeded.toLocaleString()} | ${totalPerKill.toFixed(1)} | ${copperEarned.toLocaleString()} | ${cumCopper.toLocaleString()} |`);
});

console.log(`\n**Всего убийств для достижения 20 уровня (чистый гринд)**: ~${cumKills.toLocaleString()} мобов.`);
console.log(`**Всего заработано меди с дропа**: ~${cumCopper.toLocaleString()} медных деталей.`);

// Quest earnings
const quests = QUEST_DB.QUESTS || {};
let qExp = 0, qSp = 0, qCopper = 0;
for (let qId in quests) {
  const q = quests[qId];
  const r = q.rewards || {};
  qExp += r.exp || 0;
  qSp += r.sp || 0;
  qCopper += (r.copper_parts || r.adena || 0);
}
console.log(`**Всего награды со всех квестов 1-20**: EXP = ${qExp.toLocaleString()}, SP = ${qSp.toLocaleString()}, Медь = ${qCopper.toLocaleString()}.`);
console.log(`*Примечание: квесты покрывают ${(qExp / 835864 * 100).toFixed(1)}% требуемого опыта Фазы 1!*`);

// -------------------------------------------------------------
// 4. GEAR PURCHASE COSTS (EQUIPMENT LADDER)
// -------------------------------------------------------------
console.log('\n### 4. GEAR PURCHASE COSTS & AFFORDABILITY\n');

const gearSets = [
  {
    tier: 'Starter No-Grade (L1-5)',
    weapon: 100, // operator_hammer_low / apprentice_wand
    armor: 160,  // engineer_jacket_low (90) + pants (70)
    jewelry: 0,
    total: 260
  },
  {
    tier: 'Mid No-Grade (L6-10)',
    weapon: 350,   // copper_pipe / willow_coil
    armor: 1400,   // worker_overalls (200) or devotion (1400)
    jewelry: 500,
    total: 2250
  },
  {
    tier: 'Top No-Grade (L10-15)',
    weapon: 32000, // iron_hammer / spring_bow / mage_staff
    armor: 4500,   // bronze breastplate + gaiters + helmet
    jewelry: 2000,
    total: 38500
  },
  {
    tier: 'Low D-Grade (L15-20 Target Endgame)',
    weapon: 409000, // revolution_sword / mace_prayer (136k-409k)
    armor: 110000,  // copper_plate (45k) + steam_helmet (18k) + boiler_shield (18k) + knowledge set (86k)
    jewelry: 25000,
    total: 544000
  }
];

console.log('| Тир экипировки | Оружие | Броня (сет) | Бижутерия | Сумма затрат | Накоплено к тиру | Профицит / Дефицит |');
console.log('|---|:---:|:---:|:---:|:---:|:---:|:---:|');
let accWealth = [12, 1850, 22000, cumCopper]; // Wealth at L1, L5, L10, L20
gearSets.forEach((g, idx) => {
  const wealth = accWealth[idx];
  const diff = wealth - g.total;
  const status = diff >= 0 ? `+${diff.toLocaleString()} (Доступно)` : `${diff.toLocaleString()} (ДЕФИЦИТ)`;
  console.log(`| ${g.tier} | ${g.weapon.toLocaleString()} | ${g.armor.toLocaleString()} | ${g.jewelry.toLocaleString()} | ${g.total.toLocaleString()} | ${wealth.toLocaleString()} | ${status} |`);
});

// -------------------------------------------------------------
// 5. SHOTS ECONOMY (SOULSHOTS & SPIRITSHOTS)
// -------------------------------------------------------------
console.log('\n### 5. SHOTS ECONOMY: PROFITABILITY OF SOULSHOTS / SPIRITSHOTS\n');

const shotData = [
  {
    name: 'Soulshot: No-Grade',
    price: 15,
    dmgBoost: 'x2.0 Phys Dmg',
    shotsPerKillOpL10: 4, // 4 shots vs 8 hits bare
    costPerKill: 60,
    mobCopperL10: 12.5,
    netProfit: 12.5 - 60 // -47.5
  },
  {
    name: 'Spiritshot: No-Grade',
    price: 30,
    dmgBoost: 'x1.5 Mag Dmg',
    shotsPerKillEnL10: 2, // 2 shots vs 3 bare
    costPerKill: 60,
    mobCopperL10: 12.5,
    netProfit: 12.5 - 60 // -47.5
  }
];

console.log('| Тип заряда | Цена/шт | Усиление | Зарядов/моб L10 | Затраты/моб | Дроп меди/моб | Чистый итог боя |');
console.log('|---|:---:|:---:|:---:|:---:|:---:|:---:|');
shotData.forEach(s => {
  console.log(`| ${s.name} | ${s.price} | ${s.dmgBoost} | ${s.shotsPerKillOpL10 || s.shotsPerKillEnL10} | ${s.costPerKill} | ${s.mobCopperL10} | **${s.netProfit} (Убыток)** |`);
});
