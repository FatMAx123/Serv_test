// scripts/update_loot_drops.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../shared/loot-rules.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. UPDATE 4 RAID BOSSES (scrap_tyrant, drill_worm, press_hammer, boiler_sovereign)
// Add fighter weapons to rare lists

// scrap_tyrant: bastard_sword, steam_hammer, assassin_knife
const stTarget = "id: 'scrap_tyrant', name: 'Тиран Свалки'";
const stIdx = content.indexOf(stTarget);
if (stIdx !== -1) {
  const rareIdx = content.indexOf('rare: [', stIdx);
  const voodooIdx = content.indexOf("{ id: 'voodoo_doll', ch: 0.10, min: 1, max: 1 },", rareIdx);
  if (voodooIdx !== -1 && !content.includes("{ id: 'bastard_sword', ch: 0.12")) {
    const insert = `\n      { id: 'bastard_sword', ch: 0.12, min: 1, max: 1 },` +
                   `\n      { id: 'steam_hammer', ch: 0.12, min: 1, max: 1 },` +
                   `\n      { id: 'assassin_knife', ch: 0.10, min: 1, max: 1 },`;
    content = content.substring(0, voodooIdx) + voodooIdx_str(voodooIdx, insert, content);
    console.log('Updated scrap_tyrant rare drops');
  }
}

function voodooIdx_str(idx, ins, full) {
  const match = "{ id: 'voodoo_doll', ch: 0.10, min: 1, max: 1 },";
  return match + ins;
}

// drill_worm: heavy_doom_hammer, bastard_sword, steam_pistol
const dwTarget = "id: 'drill_worm', name: 'Босс-Бур'";
const dwIdx = content.indexOf(dwTarget);
if (dwIdx !== -1) {
  const rareIdx = content.indexOf('rare: [', dwIdx);
  const match = "{ id: 'magic_mace', ch: 0.15, min: 1, max: 1 },";
  const mIdx = content.indexOf(match, rareIdx);
  if (mIdx !== -1 && !content.includes("{ id: 'heavy_doom_hammer', ch: 0.15")) {
    const insert = `\n      { id: 'heavy_doom_hammer', ch: 0.15, min: 1, max: 1 },` +
                   `\n      { id: 'bastard_sword', ch: 0.14, min: 1, max: 1 },` +
                   `\n      { id: 'steam_pistol', ch: 0.12, min: 1, max: 1 },`;
    content = content.substring(0, mIdx + match.length) + insert + content.substring(mIdx + match.length);
    console.log('Updated drill_worm rare drops');
  }
}

// press_hammer: revolution_sword, heavy_doom_hammer, prowler_dagger
const phTarget = "id: 'press_hammer', name: 'Автономный Пресс-Молот'";
const phIdx = content.indexOf(phTarget);
if (phIdx !== -1) {
  const rareIdx = content.indexOf('rare: [', phIdx);
  const match = "{ id: 'magic_mace', ch: 0.18, min: 1, max: 1 },";
  const mIdx = content.indexOf(match, rareIdx);
  if (mIdx !== -1 && !content.includes("{ id: 'revolution_sword', ch: 0.18")) {
    const insert = `\n      { id: 'revolution_sword', ch: 0.18, min: 1, max: 1 },` +
                   `\n      { id: 'heavy_doom_hammer', ch: 0.18, min: 1, max: 1 },` +
                   `\n      { id: 'prowler_dagger', ch: 0.15, min: 1, max: 1 },`;
    content = content.substring(0, mIdx + match.length) + insert + content.substring(mIdx + match.length);
    console.log('Updated press_hammer rare drops');
  }
}

// boiler_sovereign: revolution_sword, heavy_doom_hammer, prowler_dagger, reinforced_bow
const bsTarget = "id: 'boiler_sovereign', name: 'Суверен Котла'";
const bsIdx = content.indexOf(bsTarget);
if (bsIdx !== -1) {
  const rareIdx = content.indexOf('rare: [', bsIdx);
  const match = "{ id: 'magic_mace', ch: 0.18, min: 1, max: 1 }";
  const mIdx = content.indexOf(match, rareIdx);
  if (mIdx !== -1 && !content.includes("{ id: 'reinforced_bow', ch: 0.16")) {
    const insert = `,\n      { id: 'revolution_sword', ch: 0.18, min: 1, max: 1 },` +
                   `\n      { id: 'heavy_doom_hammer', ch: 0.18, min: 1, max: 1 },` +
                   `\n      { id: 'prowler_dagger', ch: 0.16, min: 1, max: 1 },` +
                   `\n      { id: 'reinforced_bow', ch: 0.16, min: 1, max: 1 }`;
    content = content.substring(0, mIdx + match.length) + insert + content.substring(mIdx + match.length);
    console.log('Updated boiler_sovereign rare drops');
  }
}

// Helper function to add items to equip or create equip
function addMobEquip(mobId, newEquips) {
  const searchStr = `id: '${mobId}',`;
  const mIdx = content.indexOf(searchStr);
  if (mIdx === -1) {
    console.warn('Mob not found:', mobId);
    return;
  }
  const nextMobIdx = content.indexOf("id: '", mIdx + searchStr.length);
  const mobChunk = content.substring(mIdx, nextMobIdx !== -1 ? nextMobIdx : mIdx + 1500);

  const equipIdx = mobChunk.indexOf('equip: [');
  if (equipIdx !== -1) {
    // Has equip array
    const endEquip = mobChunk.indexOf(']', equipIdx);
    const equipSection = mobChunk.substring(equipIdx, endEquip);
    const itemsToAdd = newEquips.filter(e => !equipSection.includes(`'${e.id}'`));
    if (itemsToAdd.length > 0) {
      const formatted = itemsToAdd.map(e => `      { id: '${e.id}', ch: ${e.ch} }`).join(',\n');
      const insertPos = mIdx + endEquip;
      const prevChar = content.substring(insertPos - 10, insertPos).trim();
      const prefix = prevChar.endsWith('{') || prevChar.endsWith('[') ? '\n' : ',\n';
      content = content.substring(0, insertPos) + prefix + formatted + '\n    ' + content.substring(insertPos);
      console.log(`Added ${itemsToAdd.length} equip drops to ${mobId}`);
    }
  } else {
    // No equip array, add equip: [ ... ]
    const matsIdx = mobChunk.indexOf('mats: [');
    if (matsIdx !== -1) {
      const endMats = mobChunk.indexOf('],', matsIdx);
      if (endMats !== -1) {
        const formatted = newEquips.map(e => `      { id: '${e.id}', ch: ${e.ch} }`).join(',\n');
        const equipBlock = `,\n    equip: [\n${formatted}\n    ]`;
        const insertPos = mIdx + endMats + 2;
        content = content.substring(0, insertPos) + equipBlock + content.substring(insertPos);
        console.log(`Created equip block with ${newEquips.length} items for ${mobId}`);
      }
    }
  }
}

// Low NG (1-10)
addMobEquip('scrapper', [{ id: 'operator_hammer_low', ch: 0.0003 }]);
addMobEquip('steam_hound', [{ id: 'operator_hammer_low', ch: 0.0004 }]);
addMobEquip('meadow_mower', [{ id: 'short_sword', ch: 0.0004 }]);
addMobEquip('rust_mite', [{ id: 'mage_dagger', ch: 0.0004 }]);
addMobEquip('survey_beacon', [{ id: 'copper_pipe', ch: 0.00035 }]);

// Mid NG (8-15)
addMobEquip('bridge_toll_bot', [{ id: 'long_sword', ch: 0.0003 }]);
addMobEquip('scrap_picker', [{ id: 'long_sword', ch: 0.00025 }]);
addMobEquip('welding_automaton', [{ id: 'iron_hammer', ch: 0.00025 }]);
addMobEquip('hill_presser', [{ id: 'iron_hammer', ch: 0.0003 }]);
addMobEquip('welding_drone', [{ id: 'dirk', ch: 0.00025 }]);
addMobEquip('rust_sentry', [{ id: 'steam_pistol', ch: 0.00025 }]);

// Top NG (12-18)
addMobEquip('forge_apprentice', [{ id: 'bastard_sword', ch: 0.00018 }]);
addMobEquip('yard_cranelet', [{ id: 'bastard_sword', ch: 0.00018 }, { id: 'steam_hammer', ch: 0.00018 }]);
addMobEquip('memory_scrubber', [{ id: 'steam_hammer', ch: 0.0002 }]);
addMobEquip('green_fault_drone', [{ id: 'assassin_knife', ch: 0.00018 }, { id: 'pneumatic_rifle', ch: 0.00018 }]);

// Low D (17-20)
addMobEquip('rezdiq_private', [{ id: 'revolution_sword', ch: 0.00018 }, { id: 'prowler_dagger', ch: 0.00016 }]);
addMobEquip('limit_guard', [{ id: 'revolution_sword', ch: 0.00018 }]);
addMobEquip('boiler_elemental', [{ id: 'revolution_sword', ch: 0.00018 }]);
addMobEquip('drill_sergeant', [{ id: 'heavy_doom_hammer', ch: 0.00018 }]);
addMobEquip('fort_enforcer', [{ id: 'heavy_doom_hammer', ch: 0.0002 }]);
addMobEquip('pressure_fiend', [{ id: 'heavy_doom_hammer', ch: 0.0002 }]);
addMobEquip('green_steam_wraith', [{ id: 'prowler_dagger', ch: 0.00018 }]);
addMobEquip('fort_turret', [{ id: 'reinforced_bow', ch: 0.00018 }]);
addMobEquip('boiler_overpress', [{ id: 'reinforced_bow', ch: 0.00018 }]);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Saved shared/loot-rules.js with updated mob and boss drops!');
