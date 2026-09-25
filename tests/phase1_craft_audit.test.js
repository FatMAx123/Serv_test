// tests/phase1_craft_audit.test.js
// Complete audit test for Crafting, Recipes, Materials, and Drops in Phase 1 (Levels 1-20)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const gameRules = require('../shared/game-rules.js');
const itemDb = require('../shared/item-db.js');
const recipesDb = require('../data/crafting_recipes_db.json');
const matsDb = require('../data/crafting_materials_db.json');
const { MOB_LOOT_TABLES } = require('../shared/loot-rules.js');
const wm = require('../shared/world-metrics.js');

module.exports = async function (t) {
  const ok = t ? t.ok : (c, name) => assert(c, name);
  const suite = t ? t.suite : (name) => console.log('\n— ' + name);

  suite('Phase 1 Crafting Authority: game-rules.js RECIPES Integrity');
  {
    const recipes = gameRules.RECIPES;
    ok(Object.keys(recipes).length >= 11, `Expected >= 11 recipes in game-rules.js (found ${Object.keys(recipes).length})`);

    for (const [rid, rec] of Object.entries(recipes)) {
      // 1. Result item must exist in itemDb
      const resItem = itemDb.get(rec.result.id);
      ok(!!resItem, `Recipe ${rid}: result item ${rec.result.id} exists in item-db.js`);
      ok(rec.result.n > 0, `Recipe ${rid}: result count > 0`);

      // 2. Scroll item recipe_<rid> must exist in itemDb so players can learn it
      const scrollId = 'recipe_' + rid;
      const scrollItem = itemDb.get(scrollId);
      ok(!!scrollItem, `Recipe ${rid}: learnable scroll ${scrollId} exists in item-db.js`);

      // 3. All materials must exist in itemDb
      ok(Array.isArray(rec.mats) && rec.mats.length > 0, `Recipe ${rid}: has materials array`);
      for (const m of rec.mats) {
        const matItem = itemDb.get(m.id);
        ok(!!matItem, `Recipe ${rid}: material ${m.id} exists in item-db.js`);
        ok(m.n > 0, `Recipe ${rid}: material ${m.id} count > 0`);
      }

      // 4. Craft chance must be between 0 and 1
      ok(rec.chance > 0 && rec.chance <= 1, `Recipe ${rid}: chance ${rec.chance} is valid`);
    }
  }

  suite('Phase 1 Crafting JSON Catalog: data/crafting_recipes_db.json');
  {
    ok(recipesDb.length >= 11, `crafting_recipes_db.json has >= 11 recipes (found ${recipesDb.length})`);
    for (const r of recipesDb) {
      ok(!!gameRules.RECIPES[r.id], `JSON recipe ${r.id} exists in game-rules.js authority`);
      ok(Array.isArray(r.materials) && r.materials.length > 0, `JSON recipe ${r.id} has materials`);
    }

    ok(matsDb.length >= 20, `crafting_materials_db.json has >= 20 materials (found ${matsDb.length})`);
    for (const m of matsDb) {
      const it = itemDb.get(m.id);
      ok(!!it, `Material ${m.id} in materials_db exists in item-db.js`);
    }
  }

  suite('Phase 1 Supply Shops: Recipe Scrolls in Stores');
  {
    const skrip = (wm.CITY_NPCS || []).find(n => n.id === 'archivist_skrip');
    ok(!!skrip && Array.isArray(skrip.shop), 'Archivist Skrip exists with shop list');
    const skripShop = (skrip && skrip.shop) || [];

    const expectedSkripRecipes = [
      'recipe_synthetic_oil',
      'recipe_pressure_canister',
      'recipe_soulshot_no_grade',
      'recipe_leather_gloves',
      'recipe_work_boots',
      'recipe_copper_shield',
      'recipe_pressure_amplifier',
      'recipe_piston',
      'recipe_soulshot_d',
      'recipe_steel_plate'
    ];
    for (const rec of expectedSkripRecipes) {
      ok(skripShop.includes(rec), `Archivist Skrip sells recipe scroll ${rec}`);
    }
  }

  suite('Phase 1 Loot & Spoil: Craft Materials & Recipes Distribution');
  {
    const coreCraftMats = [
      'gear_fragment', 'iron_scrap', 'steam_valve', 'piston_ring',
      'spark_plug', 'coal_briquette', 'copper_cable', 'varnish_seal'
    ];

    for (const mat of coreCraftMats) {
      const dropCount = Object.keys(MOB_LOOT_TABLES).filter(mId => {
        const t = MOB_LOOT_TABLES[mId];
        let found = false;
        ['common', 'rare', 'crystals', 'equipment', 'special'].forEach(sec => {
          if (t[sec] && t[sec].groups) {
            t[sec].groups.forEach(g => {
              if ((g.items || []).some(i => i.id === mat)) found = true;
            });
          }
        });
        return found;
      }).length;
      ok(dropCount >= 3, `Craft material ${mat} drops from >= 3 mobs (found ${dropCount})`);
    }
  }

  suite('Phase 1 Database Webpage: crafting-database.html & database.html');
  {
    const craftHtmlPath = path.join(__dirname, '../client/crafting-database.html');
    ok(fs.existsSync(craftHtmlPath), 'client/crafting-database.html exists');
    const craftContent = fs.readFileSync(craftHtmlPath, 'utf8');
    ok(craftContent.includes('piston_component'), 'crafting-database.html renders piston_component');
    ok(!craftContent.includes('Босс-Бур (6%)'), 'crafting-database.html does not claim Boss-Bur drops C-grade blade');

    const dbHtmlPath = path.join(__dirname, '../client/database.html');
    ok(fs.existsSync(dbHtmlPath), 'client/database.html exists');
    const dbContent = fs.readFileSync(dbHtmlPath, 'utf8');
    ok(dbContent.includes('33 Оружия (Оператор + Инженер)'), 'client/database.html reflects 33 weapons count');
  }
};

if (require.main === module) {
  module.exports(null).then(() => {
    console.log('\n[CRAFT AUDIT TEST] All Phase 1 Craft Audit checks passed successfully!');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
