// TESTS / PHASE1_WEAPON_AUDIT.TEST.JS
// Complete audit test for Operator & Engineer weapons in Phase 1 (Levels 1-20, No-Grade & Low D)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const weaponsDb = require('../data/weapons_db.json');
const itemDb = require('../shared/item-db.js');
const { MOB_LOOT_TABLES } = require('../shared/loot-rules.js');
const wm = require('../shared/world-metrics.js');

const OPERATOR_WEAPON_IDS = [
  // Low NG (1 ур.)
  'operator_hammer_low', 'short_sword', 'mage_dagger', 'copper_pipe',
  // Mid NG (5–15 ур.)
  'long_sword', 'iron_hammer', 'dirk', 'spring_bow',
  // Top NG (15–20 ур.)
  'bastard_sword', 'steam_hammer', 'assassin_knife', 'composite_bow',
  // Low D (20 ур.)
  'revolution_sword', 'heavy_doom_hammer', 'prowler_dagger', 'reinforced_bow'
];

module.exports = async function (t) {
  const ok = t ? t.ok : (c, name) => assert(c, name);
  const suite = t ? t.suite : (name) => console.log('\n— ' + name);

  suite('Phase 1 Weapons DB: Operator Lineup & Canonical Metrics');
  {
    ok(weaponsDb.length === 33, `weapons_db.json has 33 weapons (got ${weaponsDb.length})`);
    const opWeapons = weaponsDb.filter(w => w.isOperatorWeapon);
    ok(opWeapons.length === 16, `weapons_db.json has 16 operator weapons (got ${opWeapons.length})`);

    for (const opId of OPERATOR_WEAPON_IDS) {
      const w = weaponsDb.find(x => x.id === opId);
      ok(!!w, `Operator weapon ${opId} exists in data/weapons_db.json`);
      ok(w && w.attack > 0, `${opId} has positive P.Atk (${w ? w.attack : 0})`);
      ok(w && w.baseAtkSpd > 0, `${opId} has valid baseAtkSpd (${w ? w.baseAtkSpd : 0})`);
      ok(w && w.price > 0, `${opId} has valid price (${w ? w.price : 0})`);
      ok(w && w.weight > 0, `${opId} has valid weight (${w ? w.weight : 0})`);
      ok(w && ['no_grade', 'd'].includes(w.grade), `${opId} has valid Phase 1 grade: ${w ? w.grade : ''}`);
    }
  }

  suite('Phase 1 Server Item-DB: Authority Combat Sync');
  {
    for (const opId of OPERATOR_WEAPON_IDS) {
      const item = itemDb.get(opId) || itemDb.ITEMS[opId];
      ok(!!item, `Weapon ${opId} exists in shared/item-db.js`);
      ok(item && item.attack > 0, `${opId} has attack stat in item-db.js`);
      ok(item && item.price > 0, `${opId} has price in item-db.js`);
      ok(item && item.weight > 0, `${opId} has weight in item-db.js`);
      ok(item && ['no_grade', 'd'].includes(item.grade), `${opId} grade valid in item-db.js`);
    }
  }

  suite('Phase 1 Client Inventory: Templates Sync');
  {
    const inventoryContent = fs.readFileSync(path.join(__dirname, '../client/js/inventory.js'), 'utf8');
    for (const opId of OPERATOR_WEAPON_IDS) {
      ok(inventoryContent.includes(opId), `Operator weapon ${opId} present in client/js/inventory.js`);
    }
  }

  suite('Phase 1 Blacksmith Vex: Shop Supply Alignment');
  {
    const traderVex = (wm.CITY_NPCS || []).find(n => n.id === 'trader_vex');
    ok(!!traderVex && Array.isArray(traderVex.shop), 'trader_vex has shop array in world-metrics.js');
    const vexShop = (traderVex && traderVex.shop) || [];
    for (const opId of OPERATOR_WEAPON_IDS) {
      ok(vexShop.includes(opId), `Vex sells operator weapon ${opId}`);
    }
    const illegalShopItems = ['demon_fangs', 'tears_fairy', 'bone_resonator', 'life_manifold', 'crystal_staff', 'staff_life'];
    for (const ill of illegalShopItems) {
      ok(!vexShop.includes(ill), `Illegal weapon ${ill} is NOT sold by Vex in Phase 1`);
    }
  }

  suite('Phase 1 Loot Rules: Mob & Boss Weapon Drops');
  {
    function getAllDropIds(table) {
      const ids = [];
      ['rare', 'equipment', 'common', 'special'].forEach(sec => {
        if (table[sec] && table[sec].groups) {
          table[sec].groups.forEach(g => (g.items || []).forEach(i => ids.push(i.id)));
        }
      });
      return ids;
    }

    const bossMobIds = ['scrap_tyrant', 'drill_worm', 'press_hammer', 'boiler_sovereign'];
    for (const bId of bossMobIds) {
      const table = MOB_LOOT_TABLES[bId];
      ok(!!table, `Boss ${bId} has drop table`);
      const drops = getAllDropIds(table);
      const hasFighterDrop = drops.some(d => OPERATOR_WEAPON_IDS.includes(d));
      ok(hasFighterDrop, `Boss ${bId} drops at least one Operator weapon`);
    }

    const regularDropCount = Object.keys(MOB_LOOT_TABLES).filter(mId => {
      const table = MOB_LOOT_TABLES[mId];
      const drops = getAllDropIds(table);
      return drops.some(d => OPERATOR_WEAPON_IDS.includes(d));
    }).length;
    ok(regularDropCount >= 10, `At least 10 mobs drop operator weapons (found ${regularDropCount})`);
  }

  suite('Phase 1 Database Webpage: weapons-database.html');
  {
    const htmlPath = path.join(__dirname, '../client/weapons-database.html');
    ok(fs.existsSync(htmlPath), 'client/weapons-database.html exists');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    ok(htmlContent.includes('ТЕХНИЧЕСКИЙ АРСЕНАЛ: ОПЕРАТОР И ИНЖЕНЕР'), 'Title matches benchmark in weapons-database.html');
    ok(htmlContent.includes('role-operator'), 'Operator role badge present in weapons-database.html');
    ok(htmlContent.includes('revolution_sword'), 'revolution_sword present in weapons-database.html');
    ok(htmlContent.includes('reinforced_bow'), 'reinforced_bow present in weapons-database.html');
  }
};

if (require.main === module) {
  module.exports(null).then(() => {
    console.log('\n[AUDIT TEST] All Phase 1 Weapon Audit tests passed successfully!');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
