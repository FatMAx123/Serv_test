// scripts/audit_databases_and_craft.js
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log('====================================================');
console.log('     PROJECT STEAM: PRODUCTION AUDIT REPORT');
console.log('====================================================\n');

// 1. DATABASE WEB PAGES & NAVIGATION AUDIT
console.log('--- 1. DATABASE PAGES & NAVIGATION AUDIT ---');
const dbPages = [
  'database.html',
  'weapons-database.html',
  'armor-database.html',
  'crafting-database.html',
  'mobs-database.html',
  'skills-database.html'
];
const requiredNavLinks = [
  'database.html',
  'weapons-database.html',
  'armor-database.html',
  'crafting-database.html',
  'mobs-database.html',
  'skills-database.html',
  'index.html',
  'menu.html'
];

dbPages.forEach(page => {
  const fullPath = path.join(rootDir, 'client', page);
  if (!fs.existsSync(fullPath)) {
    console.error(`[ERROR] File missing: client/${page}`);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const sizeKb = (content.length / 1024).toFixed(1);
  const missingLinks = requiredNavLinks.filter(target => {
    return !content.includes(`href="${target}"`) && !content.includes(`href='${target}'`);
  });
  if (missingLinks.length === 0) {
    console.log(`✓ client/${page} (${sizeKb} KB) — All 8 header links present`);
  } else {
    console.warn(`⚠ client/${page} (${sizeKb} KB) — Missing links: ${missingLinks.join(', ')}`);
  }
});

// 2. RECIPES & CRAFTING AUTHORITY AUDIT
console.log('\n--- 2. RECIPES & CRAFTING AUTHORITY AUDIT ---');
const gameRules = require('../shared/game-rules.js');
const itemDb = require('../shared/item-db.js');
const recipesDb = require('../data/crafting_recipes_db.json');
const matsDb = require('../data/crafting_materials_db.json');

const grRecipes = gameRules.RECIPES || {};
console.log(`game-rules.js RECIPES: ${Object.keys(grRecipes).length}`);
console.log(`data/crafting_recipes_db.json: ${recipesDb.length}`);

// Check recipes in game-rules vs item-db
Object.entries(grRecipes).forEach(([rid, rec]) => {
  const resultItem = itemDb.get(rec.result.id);
  const scrollId = 'recipe_' + rid;
  const scrollItem = itemDb.get(scrollId);
  const inRecipesJson = recipesDb.some(r => r.id === rid);

  const status = [];
  if (!resultItem) status.push(`MISSING result item '${rec.result.id}'`);
  if (!scrollItem) status.push(`MISSING scroll item '${scrollId}' (cannot be learned)`);
  if (!inRecipesJson) status.push(`MISSING in crafting_recipes_db.json`);

  rec.mats.forEach(m => {
    if (!itemDb.get(m.id)) status.push(`MISSING mat '${m.id}'`);
  });

  if (status.length === 0) {
    console.log(`✓ Recipe '${rid}': result '${rec.result.id}', scroll '${scrollId}', all mats exist, in json`);
  } else {
    console.log(`❌ Recipe '${rid}': ${status.join('; ')}`);
  }
});

// Check recipe items in item-db that have no recipe in game-rules
const allRecipeItems = Object.keys(itemDb.ITEMS).filter(k => k.startsWith('recipe_'));
allRecipeItems.forEach(ri => {
  const rid = ri.replace('recipe_', '');
  if (!grRecipes[rid]) {
    console.warn(`⚠ Orphan scroll in item-db: '${ri}' exists, but no recipe '${rid}' in game-rules.js RECIPES`);
  }
});

// 3. DROP & SPOIL AUDIT (PHASE 1 1-20 SCOPE)
console.log('\n--- 3. DROP & SPOIL AUDIT (PHASE 1 1-20 SCOPE) ---');
const { MOB_LOOT_TABLES } = require('../shared/loot-rules.js');

const bannedHighTierItems = [
  'demon_staff', 'sentinel_staff', 'goat_staff', // Top D
  'ghost_manifold', 'atuba_mace',                 // High D
  'bone_resonator', 'life_manifold',              // Mid-High D
  'demon_fangs', 'tears_fairy'                    // Mid D
];

let illegalDropCount = 0;
for (const [mobId, table] of Object.entries(MOB_LOOT_TABLES)) {
  const mobLevel = Array.isArray(table.level) ? table.level[1] : (table.level || 0);
  if (mobLevel <= 20) {
    const allLoot = [];
    ['common', 'rare', 'crystals', 'equipment', 'special', 'recipes'].forEach(sec => {
      if (table[sec] && table[sec].groups) {
        table[sec].groups.forEach(g => (g.items || []).forEach(i => allLoot.push(i.id)));
      }
    });

    const foundBanned = allLoot.filter(id => bannedHighTierItems.includes(id));
    if (foundBanned.length > 0) {
      console.error(`❌ Illegal high-tier drop in mob '${mobId}' (lvl ${mobLevel}): ${foundBanned.join(', ')}`);
      illegalDropCount++;
    }
  }
}
if (illegalDropCount === 0) {
  console.log(`✓ Strict Phase 1 isolation verified: 0 illegal high-tier items dropped by mobs <= 20 lvl.`);
}

// 4. BOSS DROP AUDIT
console.log('\n--- 4. RAID BOSS DROPS AUDIT (PHASE 1) ---');
const phase1Bosses = [
  { id: 'scrap_tyrant', name: 'Тиран Свалки', lvl: '14-16' },
  { id: 'drill_worm', name: 'Босс-Бур', lvl: '16-18' },
  { id: 'press_hammer', name: 'Автономный Пресс-Молот', lvl: '18-20' },
  { id: 'boiler_sovereign', name: 'Суверен Котла', lvl: '19-20' }
];

phase1Bosses.forEach(b => {
  const table = MOB_LOOT_TABLES[b.id];
  if (!table) {
    console.error(`❌ Missing loot table for boss ${b.name} (${b.id})`);
    return;
  }
  const weapons = [];
  const armors = [];
  const cores = [];
  const recipes = [];

  ['rare', 'equipment', 'recipes'].forEach(sec => {
    if (table[sec] && table[sec].groups) {
      table[sec].groups.forEach(g => {
        (g.items || []).forEach(i => {
          const it = itemDb.get(i.id);
          if (it) {
            if (it.type === 'weapon') weapons.push(`${it.name} (${it.grade.toUpperCase()})`);
            else if (it.type === 'armor') armors.push(`${it.name} (${it.grade.toUpperCase()})`);
            else if (i.id.endsWith('_core')) cores.push(it.name);
            else if (it.type === 'recipe') recipes.push(it.name);
          } else {
            console.warn(`Unknown item in boss ${b.id}: ${i.id}`);
          }
        });
      });
    }
  });

  console.log(`👑 ${b.name} (${b.lvl}):`);
  console.log(`   - Оружие (${weapons.length}): ${weapons.join(', ') || 'нет'}`);
  console.log(`   - Броня (${armors.length}): ${armors.join(', ') || 'нет'}`);
  console.log(`   - Ядро: ${cores.join(', ') || 'нет'}`);
  console.log(`   - Чертежи: ${recipes.join(', ') || 'нет'}`);
});

console.log('\n====================================================');
console.log('             AUDIT COMPLETED');
console.log('====================================================');
