// scripts/migrate_firearms_to_bows.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// 1. UPDATE shared/item-db.js
console.log('1. Updating shared/item-db.js...');
const itemDbPath = path.join(root, 'shared/item-db.js');
let itemDbContent = fs.readFileSync(itemDbPath, 'utf8');

// Replace steam_pistol block
const steamPistolRegex = /"steam_pistol":\s*\{[\s\S]*?"spiritshotUse":\s*1\s*\}/;
const springBowBlock = `"spring_bow": {
          "id": "spring_bow",
          "name": "Рессорный Лук",
          "l2Name": "Short Bow",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/spring_bow.webp",
          "price": 32000,
          "weight": 1750,
          "description": "Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.",
          "attack": 18,
          "cAtk": 10,
          "weaponClass": "bow",
          "baseAtkSpd": 293,
          "atkSpdGrade": "Normal",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    }`;
itemDbContent = itemDbContent.replace(steamPistolRegex, springBowBlock);

// Replace pneumatic_rifle block
const pneumaticRifleRegex = /"pneumatic_rifle":\s*\{[\s\S]*?"spiritshotUse":\s*1\s*\}/;
const compositeBowBlock = `"composite_bow": {
          "id": "composite_bow",
          "name": "Композитный Лук",
          "l2Name": "Composite Bow",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/composite_bow.webp",
          "price": 136000,
          "weight": 2000,
          "description": "Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.",
          "attack": 42,
          "cAtk": 17,
          "weaponClass": "bow",
          "baseAtkSpd": 293,
          "atkSpdGrade": "Normal",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 2,
          "spiritshotUse": 1
    }`;
itemDbContent = itemDbContent.replace(pneumaticRifleRegex, compositeBowBlock);

// Ensure legacy aliases exist right before return
if (!itemDbContent.includes("ITEMS['steam_pistol'] = ITEMS['spring_bow']")) {
  const returnPattern = "  return {\n    ITEMS: ITEMS,";
  const aliasCode = "  // Backwards-compatible aliases for bows\n  if (ITEMS['spring_bow']) ITEMS['steam_pistol'] = ITEMS['spring_bow'];\n  if (ITEMS['composite_bow']) ITEMS['pneumatic_rifle'] = ITEMS['composite_bow'];\n\n  return {\n    ITEMS: ITEMS,";
  itemDbContent = itemDbContent.replace(returnPattern, aliasCode);
}
fs.writeFileSync(itemDbPath, itemDbContent, 'utf8');
console.log('✓ shared/item-db.js updated with spring_bow & composite_bow + aliases');

// 2. UPDATE data/weapons_db.json
console.log('2. Updating data/weapons_db.json...');
const weaponsDbPath = path.join(root, 'data/weapons_db.json');
let weaponsDb = JSON.parse(fs.readFileSync(weaponsDbPath, 'utf8'));

weaponsDb = weaponsDb.map(w => {
  if (w.id === 'steam_pistol') {
    return {
      ...w,
      id: 'spring_bow',
      name: 'Рессорный Лук',
      description: 'Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.',
      icon: 'assets/props/icons_weapon/spring_bow.webp',
      classRu: 'Дистанционное оружие (Лук)'
    };
  }
  if (w.id === 'pneumatic_rifle') {
    return {
      ...w,
      id: 'composite_bow',
      name: 'Композитный Лук',
      description: 'Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.',
      icon: 'assets/props/icons_weapon/composite_bow.webp',
      classRu: 'Дистанционное оружие (Лук)'
    };
  }
  return w;
});
fs.writeFileSync(weaponsDbPath, JSON.stringify(weaponsDb, null, 2), 'utf8');
console.log('✓ data/weapons_db.json updated');

// 3. UPDATE client/js/inventory.js
console.log('3. Updating client/js/inventory.js...');
const inventoryPath = path.join(root, 'client/js/inventory.js');
let invContent = fs.readFileSync(inventoryPath, 'utf8');

// Replace STEAM_PISTOL definition
const invSteamPistolRegex = /STEAM_PISTOL:\s*\{[\s\S]*?price:\s*32000\s*\}/;
const invSpringBow = `SPRING_BOW: {
        id: 'spring_bow',
        name: 'Рессорный Лук',
        l2Name: "Short Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 18,
        cAtk: 10,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 1750,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.',
        icon: 'assets/props/icons_weapon/spring_bow.webp',
        price: 32000
    },
    STEAM_PISTOL: {
        id: 'steam_pistol',
        name: 'Рессорный Лук',
        l2Name: "Short Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 18,
        cAtk: 10,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 1750,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.',
        icon: 'assets/props/icons_weapon/spring_bow.webp',
        price: 32000
    }`;
invContent = invContent.replace(invSteamPistolRegex, invSpringBow);

// Replace PNEUMATIC_RIFLE definition
const invPneumaticRifleRegex = /PNEUMATIC_RIFLE:\s*\{[\s\S]*?price:\s*136000\s*\}/;
const invCompositeBow = `COMPOSITE_BOW: {
        id: 'composite_bow',
        name: 'Композитный Лук',
        l2Name: "Composite Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 42,
        cAtk: 17,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 2000,
        levelReq: 1,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.',
        icon: 'assets/props/icons_weapon/composite_bow.webp',
        price: 136000
    },
    PNEUMATIC_RIFLE: {
        id: 'pneumatic_rifle',
        name: 'Композитный Лук',
        l2Name: "Composite Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 42,
        cAtk: 17,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 2000,
        levelReq: 1,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.',
        icon: 'assets/props/icons_weapon/composite_bow.webp',
        price: 136000
    }`;
invContent = invContent.replace(invPneumaticRifleRegex, invCompositeBow);
fs.writeFileSync(inventoryPath, invContent, 'utf8');
console.log('✓ client/js/inventory.js updated with SPRING_BOW & COMPOSITE_BOW');

// 4. UPDATE shared/world-metrics.js
console.log('4. Updating shared/world-metrics.js...');
const wmPath = path.join(root, 'shared/world-metrics.js');
let wmContent = fs.readFileSync(wmPath, 'utf8');
wmContent = wmContent.replace("'steam_pistol'", "'spring_bow'");
wmContent = wmContent.replace("'pneumatic_rifle'", "'composite_bow'");
fs.writeFileSync(wmPath, wmContent, 'utf8');
console.log('✓ shared/world-metrics.js shop updated');

// 5. UPDATE shared/loot-rules.js
console.log('5. Updating shared/loot-rules.js...');
const lootPath = path.join(root, 'shared/loot-rules.js');
let lootContent = fs.readFileSync(lootPath, 'utf8');
lootContent = lootContent.replace(/\{ id: 'steam_pistol'/g, "{ id: 'spring_bow'");
lootContent = lootContent.replace(/\{ id: 'pneumatic_rifle'/g, "{ id: 'composite_bow'");
fs.writeFileSync(lootPath, lootContent, 'utf8');
console.log('✓ shared/loot-rules.js drops updated');

// 6. UPDATE tests/phase1_weapon_audit.test.js
console.log('6. Updating tests/phase1_weapon_audit.test.js...');
const testPath = path.join(root, 'tests/phase1_weapon_audit.test.js');
let testContent = fs.readFileSync(testPath, 'utf8');
testContent = testContent.replace("'steam_pistol'", "'spring_bow'");
testContent = testContent.replace("'pneumatic_rifle'", "'composite_bow'");
testContent = testContent.replace("ok(htmlContent.includes('pneumatic_rifle'), 'pneumatic_rifle present in weapons-database.html');", "ok(htmlContent.includes('composite_bow'), 'composite_bow present in weapons-database.html');");
fs.writeFileSync(testPath, testContent, 'utf8');
console.log('✓ tests/phase1_weapon_audit.test.js updated');

console.log('All code updates completed successfully!');
