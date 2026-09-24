// scripts/sync_operator_weapons.js
const fs = require('fs');
const path = require('path');

const weaponsDb = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/weapons_db.json'), 'utf8'));
const opWeapons = weaponsDb.filter(w => w.isOperatorWeapon);

const l2Names = {
  operator_hammer_low: "Apprentice's Hammer",
  short_sword: "Short Sword",
  mage_dagger: "Dagger",
  copper_pipe: "Willow Staff",
  long_sword: "Long Sword",
  iron_hammer: "Heavy Club",
  dirk: "Dirk",
  steam_pistol: "Short Bow",
  bastard_sword: "Bastard Sword",
  steam_hammer: "Morning Star",
  assassin_knife: "Assassin Knife",
  pneumatic_rifle: "Bow of Forest",
  revolution_sword: "Sword of Revolution",
  heavy_doom_hammer: "Heavy Doom Hammer",
  prowler_dagger: "Prowler",
  reinforced_bow: "Reinforced Bow"
};

// 1. UPDATE shared/item-db.js
const itemDbPath = path.join(__dirname, '../shared/item-db.js');
let itemDbContent = fs.readFileSync(itemDbPath, 'utf8');

// Build weapon entries dictionary
const weaponEntries = {};
opWeapons.forEach(w => {
  weaponEntries[w.id] = {
    id: w.id,
    name: w.name,
    l2Name: l2Names[w.id] || w.name,
    type: "weapon",
    slot: "weapon",
    grade: w.grade,
    icon: w.icon,
    price: w.price,
    weight: w.weight,
    description: w.description,
    attack: w.attack,
    cAtk: w.cAtk,
    weaponClass: w.weaponClass,
    baseAtkSpd: w.baseAtkSpd,
    atkSpdGrade: w.atkSpdGrade,
    twoHanded: !!w.twoHanded,
    isOperatorWeapon: true,
    isLivePhase1: true,
    levelReq: w.levelReq,
    crystalCount: w.crystalCount,
    soulshotUse: w.soulshotUse,
    spiritshotUse: w.spiritshotUse
  };
});

// Remove old partial entries from item-db.js
const block1Start = itemDbContent.indexOf('    "mage_dagger": {');
const block1End = itemDbContent.indexOf('    "hydraulic_blade": {');
if (block1Start !== -1 && block1End !== -1) {
  itemDbContent = itemDbContent.substring(0, block1Start) + itemDbContent.substring(block1End);
  console.log('Removed old block 1 (mage_dagger, steam_hammer, pneumatic_rifle) from item-db.js');
}

const block2Start = itemDbContent.indexOf('    "iron_hammer": {');
const block2End = itemDbContent.indexOf('    "leather_vest": {');
if (block2Start !== -1 && block2End !== -1) {
  itemDbContent = itemDbContent.substring(0, block2Start) + itemDbContent.substring(block2End);
  console.log('Removed old block 2 (iron_hammer, copper_pipe, steam_pistol) from item-db.js');
}

const formattedEntries = Object.entries(weaponEntries).map(([id, item]) => {
  const jsonLines = JSON.stringify(item, null, 6).split('\n');
  const indented = jsonLines.map((l, i) => i === 0 ? l : '    ' + l).join('\n');
  return '    ' + JSON.stringify(id) + ': ' + indented;
}).join(',\n');

const opStart = itemDbContent.indexOf('    "operator_hammer_low": {');
const opEnd = itemDbContent.indexOf('    "worker_overalls": {');
if (opStart !== -1 && opEnd !== -1) {
  itemDbContent = itemDbContent.substring(0, opStart) + formattedEntries + ',\n' + itemDbContent.substring(opEnd);
  console.log('Replaced operator_hammer_low with all 16 operator weapons in item-db.js');
}

fs.writeFileSync(itemDbPath, itemDbContent, 'utf8');
console.log('Saved shared/item-db.js');

// 2. UPDATE client/js/inventory.js
const invPath = path.join(__dirname, '../client/js/inventory.js');
let invContent = fs.readFileSync(invPath, 'utf8');

// Build client templates format
const clientTemplates = opWeapons.map(w => {
  const key = w.id.toUpperCase();
  const gradeVal = w.grade === 'no_grade' ? 'NO_GRADE' : 'D';
  const rangedField = (w.weaponClass === 'bow') ? '\n        ranged: true,' : '';
  const twoHandedField = w.twoHanded ? '\n        twoHanded: true,' : '';
  const crystalsField = (w.crystalCount > 0) ? `\n        crystalCount: ${w.crystalCount},\n        crystalId: 'crystal_d',` : '';

  return `    ${key}: {
        id: '${w.id}',
        name: '${w.name}',
        l2Name: "${l2Names[w.id] || w.name}",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: '${gradeVal}',
        attack: ${w.attack},
        cAtk: ${w.cAtk},
        weaponClass: '${w.weaponClass}',
        baseAtkSpd: ${w.baseAtkSpd},
        atkSpdGrade: '${w.atkSpdGrade}',${rangedField}${twoHandedField}${crystalsField}
        weight: ${w.weight},
        levelReq: ${w.levelReq},
        soulshotUse: ${w.soulshotUse},
        spiritshotUse: ${w.spiritshotUse},
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: '${w.description.replace(/'/g, "\\'")}',
        icon: '${w.icon}',
        price: ${w.price}
    }`;
}).join(',\n');

// In inventory.js, remove the old OPERATOR_HAMMER_LOW at line 226
const oldOpHammerStart = invContent.indexOf('    OPERATOR_HAMMER_LOW: {');
const oldOpHammerEnd = invContent.indexOf('    // ─── Контурное оружие LIVE 1–20: mag ladder 1:1 (топ D @20) ───');
if (oldOpHammerStart !== -1 && oldOpHammerEnd !== -1) {
  invContent = invContent.substring(0, oldOpHammerStart) + invContent.substring(oldOpHammerEnd);
  console.log('Removed standalone OPERATOR_HAMMER_LOW from inventory.js');
}

// Replace old MAGE_DAGGER, STEAM_HAMMER, PNEUMATIC_RIFLE block with all 16 operator weapons
const opBlockStart = invContent.indexOf('    // ─── Оператор / гибрид (не контур) ───');
const opBlockEnd = invContent.indexOf('    HYDRAULIC_BLADE: {');
if (opBlockStart !== -1 && opBlockEnd !== -1) {
  const replacement = `    // ─── Оружие Оператора LIVE 1–20 (эталон L2 C1) ───\n${clientTemplates},\n`;
  invContent = invContent.substring(0, opBlockStart) + replacement + invContent.substring(opBlockEnd);
  console.log('Injected 16 Operator weapons into client/js/inventory.js');
}

fs.writeFileSync(invPath, invContent, 'utf8');
console.log('Saved client/js/inventory.js');
