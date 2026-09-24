// scripts/apply_production_craft_fixes.js
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log('=== APPLYING PRODUCTION CRAFT & DATABASE FIXES ===\n');

// 1. COPY/ENSURE ICONS
const iconsDir = path.join(rootDir, 'client/assets/inventar/icons');
const iconCopies = [
  { src: 'recipe_synthetic_oil.webp', dest: 'recipe_leather_gloves.webp' },
  { src: 'recipe_steel_plate.webp', dest: 'recipe_work_boots.webp' },
  { src: 'recipe_steel_plate.webp', dest: 'recipe_copper_shield.webp' },
  { src: 'recipe_pressure_canister.webp', dest: 'recipe_pressure_amplifier.webp' },
  { src: 'recipe_soulshot_no_grade.webp', dest: 'recipe_soulshot_d.webp' },
  { src: 'recipe_synthetic_oil.webp', dest: 'recipe_hydraulic_fluid.webp' },
  { src: 'piston_ring.webp', dest: 'piston_component.webp' }
];

iconCopies.forEach(({ src, dest }) => {
  const destPath = path.join(iconsDir, dest);
  const srcPath = path.join(iconsDir, src);
  if (!fs.existsSync(destPath) && fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Icon created: ${dest} (from ${src})`);
  }
});

// 2. UPDATE shared/item-db.js
const itemDbPath = path.join(rootDir, 'shared/item-db.js');
let itemDbContent = fs.readFileSync(itemDbPath, 'utf8');

const newRecipeItems = {
  "recipe_leather_gloves": {
    "id": "recipe_leather_gloves",
    "name": "Чертеж: Кожаные перчатки",
    "type": "recipe",
    "slot": null,
    "grade": "no_grade",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 400,
    "weight": 100,
    "description": "Схема раскроя и клепки легких кожаных перчаток наладчика.",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "rubber_skin", "count": 8 },
      { "id": "gasket_suede", "count": 4 },
      { "id": "copper_cable", "count": 2 }
    ],
    "craftResult": "leather_gloves",
    "levelReq": 1
  },
  "recipe_work_boots": {
    "id": "recipe_work_boots",
    "name": "Чертеж: Рабочие ботинки",
    "type": "recipe",
    "slot": null,
    "grade": "no_grade",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 600,
    "weight": 100,
    "description": "Схема усиления подошвы тяжелых рабочих ботинок со стальным носком.",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "rubber_skin", "count": 10 },
      { "id": "coal_briquette", "count": 5 },
      { "id": "iron_scrap", "count": 4 }
    ],
    "craftResult": "work_boots",
    "levelReq": 1
  },
  "recipe_copper_shield": {
    "id": "recipe_copper_shield",
    "name": "Чертеж: Медный щит",
    "type": "recipe",
    "slot": null,
    "grade": "no_grade",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 1500,
    "weight": 120,
    "description": "Чертеж штамповки и клепки тяжелого медного защитного щита.",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "iron_scrap", "count": 15 },
      { "id": "copper_cable", "count": 8 },
      { "id": "coal_briquette", "count": 6 }
    ],
    "craftResult": "copper_shield",
    "levelReq": 5
  },
  "recipe_pressure_amplifier": {
    "id": "recipe_pressure_amplifier",
    "name": "Чертеж: Усилитель давления",
    "type": "recipe",
    "slot": null,
    "grade": "no_grade",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 2000,
    "weight": 120,
    "description": "Схема калибровки и сборки базового усилителя давления контура (заточка NG).",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "steam_valve", "count": 2 },
      { "id": "pressure_gauge", "count": 1 },
      { "id": "crystal_no_grade", "count": 3 },
      { "id": "varnish_seal", "count": 2 }
    ],
    "craftResult": "pressure_amplifier",
    "levelReq": 10
  },
  "recipe_soulshot_d": {
    "id": "recipe_soulshot_d",
    "name": "Чертеж: Заряды Души (D)",
    "type": "recipe",
    "slot": null,
    "grade": "d",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 5000,
    "weight": 120,
    "description": "Технологический регламент прессования боевых зарядов души D-грейда.",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "crystal_d", "count": 1 },
      { "id": "spark_plug", "count": 2 },
      { "id": "varnish_seal", "count": 3 }
    ],
    "craftResult": "soulshot_d",
    "levelReq": 20
  },
  "recipe_hydraulic_fluid": {
    "id": "recipe_hydraulic_fluid",
    "name": "Чертеж: Гидравлическая жидкость",
    "type": "recipe",
    "slot": null,
    "grade": "d",
    "icon": "assets/inventar/icons/scroll.webp",
    "price": 6000,
    "weight": 120,
    "description": "Рецепт химической дистилляции огнеупорной гидравлической жидкости.",
    "stackable": true,
    "maxStack": 100,
    "craftMaterials": [
      { "id": "varnish_seal", "count": 4 },
      { "id": "oil_filter", "count": 3 },
      { "id": "drive_bone", "count": 2 }
    ],
    "craftResult": "hydraulic_fluid",
    "levelReq": 20
  },
  "piston_component": {
    "id": "piston_component",
    "name": "Поршневой узел высокого давления",
    "type": "material",
    "slot": null,
    "grade": "d",
    "icon": "assets/inventar/icons/piston_ring.webp",
    "price": 4500,
    "weight": 50,
    "description": "Высокоточный механический поршневой узел в сборе для гидравлических приводов и паровых машин.",
    "stackable": true,
    "maxStack": 9999,
    "levelReq": 20,
    "crystalCount": 0
  }
};

// Check if recipe_leather_gloves is already in itemDbContent
if (!itemDbContent.includes('"recipe_leather_gloves": {')) {
  const insertPos = itemDbContent.indexOf('    "recipe_synthetic_oil": {');
  if (insertPos !== -1) {
    const formatted = Object.entries(newRecipeItems).map(([id, item]) => {
      const lines = JSON.stringify(item, null, 6).split('\n');
      const indented = lines.map((l, i) => (i === 0 ? l : '    ' + l)).join('\n');
      return '    ' + JSON.stringify(id) + ': ' + indented;
    }).join(',\n') + ',\n';
    itemDbContent = itemDbContent.substring(0, insertPos) + formatted + itemDbContent.substring(insertPos);
    fs.writeFileSync(itemDbPath, itemDbContent, 'utf8');
    console.log('✓ Injected 6 missing recipe items + piston_component into shared/item-db.js');
  }
}

// 3. UPDATE shared/game-rules.js (Add piston recipe)
const gameRulesPath = path.join(rootDir, 'shared/game-rules.js');
let grContent = fs.readFileSync(gameRulesPath, 'utf8');

if (!grContent.includes('piston: {')) {
  const target = "    // Mid: големы / заводь";
  const pistonEntry = "    piston:            { result:{id:'piston_component',n:1},   chance:0.9, mats:[{id:'iron_scrap',n:10},{id:'piston_ring',n:2},{id:'crystal_d',n:1}] },\n";
  if (grContent.includes(target)) {
    grContent = grContent.replace(target, pistonEntry + target);
    fs.writeFileSync(gameRulesPath, grContent, 'utf8');
    console.log("✓ Added 'piston' recipe to shared/game-rules.js RECIPES");
  }
}

// 4. UPDATE shared/world-metrics.js (shops inventory)
const wmPath = path.join(rootDir, 'shared/world-metrics.js');
let wmContent = fs.readFileSync(wmPath, 'utf8');

// Update archivist_skrip shop
const skripOld = "shop:['recipe_synthetic_oil','recipe_pressure_canister','recipe_soulshot_no_grade','recipe_piston','recipe_steel_plate']";
const skripNew = "shop:['recipe_synthetic_oil','recipe_pressure_canister','recipe_soulshot_no_grade','recipe_leather_gloves','recipe_work_boots','recipe_copper_shield','recipe_pressure_amplifier','recipe_piston','recipe_soulshot_d','recipe_steel_plate','recipe_hydraulic_fluid']";
if (wmContent.includes(skripOld)) {
  wmContent = wmContent.replace(skripOld, skripNew);
  fs.writeFileSync(wmPath, wmContent, 'utf8');
  console.log('✓ Updated archivist_skrip shop with full Phase 1 recipe scrolls in shared/world-metrics.js');
}

// Update grocer_spark shop
const sparkOld = "shop:['synthetic_oil','copper_cable','steam_valve','piston_ring','spark_plug','gear_fragment','iron_scrap','pressure_canister','recipe_synthetic_oil','recipe_pressure_canister','recipe_piston']";
const sparkNew = "shop:['synthetic_oil','copper_cable','steam_valve','piston_ring','spark_plug','gear_fragment','iron_scrap','pressure_canister','recipe_synthetic_oil','recipe_pressure_canister','recipe_leather_gloves','recipe_work_boots','recipe_piston']";
if (wmContent.includes(sparkOld)) {
  wmContent = wmContent.replace(sparkOld, sparkNew);
  fs.writeFileSync(wmPath, wmContent, 'utf8');
  console.log('✓ Updated grocer_spark shop with beginner recipes in shared/world-metrics.js');
}

// 5. UPDATE shared/loot-rules.js (mob recipe drops)
const lootPath = path.join(rootDir, 'shared/loot-rules.js');
let lootContent = fs.readFileSync(lootPath, 'utf8');

// In _enrichPhase1Loot, add recipe drops to suitable Phase 1 mobs
if (!lootContent.includes('recipe_leather_gloves')) {
  const enrichTarget = "    // 1. Обогащаем регулярных мобов оружием оператора (No-Grade и Low D)";
  const recipeDropsInjection = `    // Рецепты крафта Phase 1 для мобов
    const mobRecipeMap = {
      scrap_picker: 'recipe_leather_gloves',
      welding_automaton: 'recipe_leather_gloves',
      hill_presser: 'recipe_work_boots',
      welding_drone: 'recipe_work_boots',
      bridge_toll_bot: 'recipe_copper_shield',
      rust_sentry: 'recipe_copper_shield',
      dry_dock_welder: 'recipe_pressure_amplifier',
      yard_cranelet: 'recipe_pressure_amplifier',
      rezdiq_private: 'recipe_soulshot_d',
      drill_sergeant: 'recipe_soulshot_d',
      boiler_elemental: 'recipe_hydraulic_fluid',
      pressure_fiend: 'recipe_hydraulic_fluid'
    };
    for (const [mId, recId] of Object.entries(mobRecipeMap)) {
      const mobSpec = _C1_SPECS.find(s => s.id === mId);
      if (mobSpec) {
        if (!mobSpec.recipes) mobSpec.recipes = [];
        if (!mobSpec.recipes.some(r => r.id === recId)) {
          mobSpec.recipes.push({ id: recId, ch: 0.025, min: 1, max: 1 });
        }
      }
    }\n\n`;

  if (lootContent.includes(enrichTarget)) {
    lootContent = lootContent.replace(enrichTarget, recipeDropsInjection + enrichTarget);
    fs.writeFileSync(lootPath, lootContent, 'utf8');
    console.log('✓ Injected recipe drops into shared/loot-rules.js');
  }
}

// 6. UPDATE data/crafting_recipes_db.json & data/crafting_materials_db.json
const recipesDbPath = path.join(rootDir, 'data/crafting_recipes_db.json');
const recipesData = JSON.parse(fs.readFileSync(recipesDbPath, 'utf8'));

// Fix hydraulic_blade blueprintSource
const hb = recipesData.find(r => r.id === 'hydraulic_blade');
if (hb) {
  hb.blueprintSource = 'Осколок Ядра Круны (10%), Коллективный Разум (20%)';
}

// Add piston recipe if missing
if (!recipesData.some(r => r.id === 'piston')) {
  recipesData.splice(8, 0, {
    "id": "piston",
    "name": "Схема: Поршневой узел высокого давления",
    "category": "Сырьё и Сплавы",
    "grade": "D-Grade",
    "gradeClass": "d",
    "result": {
      "id": "piston_component",
      "name": "Поршневой узел",
      "count": 1,
      "icon": "assets/inventar/icons/piston_ring.webp"
    },
    "chance": 90,
    "blueprintSource": "Архивариус Скрип (2 000 дет.) / Тиран Свалки, Босс-Бур (15%)",
    "description": "Сборка герметичного механического поршневого узла высокого давления из кованого лома, колец и кристаллов D-ранга.",
    "materials": [
      { "id": "iron_scrap", "name": "Железный лом", "count": 10, "icon": "assets/inventar/icons/iron_scrap.webp" },
      { "id": "piston_ring", "name": "Поршневое кольцо", "count": 2, "icon": "assets/inventar/icons/piston_ring.webp" },
      { "id": "crystal_d", "name": "Кристалл: D", "count": 1, "icon": "assets/inventar/icons/crystal_d.webp" }
    ]
  });
  console.log("✓ Added 'piston' recipe to data/crafting_recipes_db.json");
}
fs.writeFileSync(recipesDbPath, JSON.stringify(recipesData, null, 2), 'utf8');

// Update materials db
const matsDbPath = path.join(rootDir, 'data/crafting_materials_db.json');
const matsData = JSON.parse(fs.readFileSync(matsDbPath, 'utf8'));
if (!matsData.some(m => m.id === 'piston_component')) {
  matsData.push({
    "id": "piston_component",
    "name": "Поршневой узел",
    "category": "Механизмы и Приводы",
    "grade": "D-Grade",
    "gradeClass": "d",
    "icon": "assets/inventar/icons/piston_ring.webp",
    "price": 4500,
    "weight": 50,
    "source": "Крафт инженера, Сборка поршня",
    "description": "Высокоточный механический поршневой узел в сборе для гидравлических приводов и паровых машин."
  });
  fs.writeFileSync(matsDbPath, JSON.stringify(matsData, null, 2), 'utf8');
  console.log("✓ Added 'piston_component' to data/crafting_materials_db.json");
}

// 7. UPDATE client/database.html badge
const dbHtmlPath = path.join(rootDir, 'client/database.html');
let dbHtmlContent = fs.readFileSync(dbHtmlPath, 'utf8');
const oldBadge = '<span class="badge-chip">⚔️ 17 Оружий Инженера (NG / D)</span>';
const newBadge = '<span class="badge-chip">⚔️ 33 Оружия (Оператор + Инженер)</span>';
const oldDesc = 'Полная спецификация контурного оружия и тактических щитов класса Инженер (уровни 1–39). Физическая атака (P.Atk), контурная мощность (C.Atk), безопасная калибровка до +3, таблицы кристаллизации и тактические щиты.';
const newDesc = 'Полная спецификация вооружения и тактических щитов классов Оператор (Human Fighter) и Инженер (уровни 1–20): мечи, молоты, кинжалы, луки/огнестрел и резонансные булавы. Точные статы L2 C1, соулшоты, криты и кристаллизация.';

if (dbHtmlContent.includes(oldBadge)) {
  dbHtmlContent = dbHtmlContent.replace(oldBadge, newBadge);
}
if (dbHtmlContent.includes(oldDesc)) {
  dbHtmlContent = dbHtmlContent.replace(oldDesc, newDesc);
}
fs.writeFileSync(dbHtmlPath, dbHtmlContent, 'utf8');
console.log('✓ Updated weapons gateway card in client/database.html');

console.log('\nAll production craft & database fixes applied successfully.');
