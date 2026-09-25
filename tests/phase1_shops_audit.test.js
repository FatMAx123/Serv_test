'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const itemDb = require(path.join(ROOT, 'shared', 'item-db.js'));
const npcServices = require(path.join(ROOT, 'shared', 'npc-services.js'));
const gameRules = require(path.join(ROOT, 'shared', 'game-rules.js'));
const skillDb = require(path.join(ROOT, 'shared', 'skill-db.js'));

module.exports = async function (t) {
  const ok = (cond, msg) => {
    if (t && t.ok) t.ok(cond, msg);
    else if (!cond) throw new Error('FAIL: ' + msg);
  };
  const eq = (a, b, msg) => {
    if (t && t.eq) t.eq(a, b, msg);
    else if (a !== b) throw new Error(`FAIL: ${msg} (expected ${b}, got ${a})`);
  };
  const suite = (name) => {
    if (t && t.suite) t.suite(name);
    else console.log(`\n— ${name}`);
  };

  suite('Phase 1 Weaponsmith (Vex): Operator & Engineer Arsenal');
  {
    const vexCatalog = npcServices.shopCatalog('trader_vex');
    ok(vexCatalog.length >= 24, `Vex sells full arsenal (got ${vexCatalog.length})`);

    // Weapons of all grades up to Low D (no C/B grade)
    for (const entry of vexCatalog) {
      const def = itemDb.get(entry.itemId);
      ok(def, `Vex weapon ${entry.itemId} exists in item-db`);
      ok(def.grade === 'no_grade' || def.grade === 'd', `Vex weapon ${entry.itemId} is Phase 1 grade (${def.grade})`);
      ok(entry.price > 0, `Vex weapon ${entry.itemId} has valid price (${entry.price} ⚙️)`);
    }

    // Key archetypes
    const requiredArchetypes = [
      'operator_hammer_low', 'apprentice_wand',
      'short_sword', 'long_sword', 'bastard_sword',
      'iron_hammer', 'heavy_doom_hammer',
      'spring_bow', 'composite_bow',
      'mage_staff', 'magic_mace', 'mace_prayer'
    ];
    for (const id of requiredArchetypes) {
      ok(vexCatalog.some(x => x.itemId === id), `Vex sells required weapon ${id}`);
    }
  }

  suite('Phase 1 Armorsmith (Dora): Sets & Canonical Earrings (No fantasy rings/necklaces)');
  {
    const doraCatalog = npcServices.shopCatalog('trader_dora');
    ok(doraCatalog.length >= 35, `Dora sells full armor roster (got ${doraCatalog.length})`);

    // Key armor sets
    const keyArmors = [
      'circuit_robe_jacket', 'circuit_robe_pants',
      'devotion_jacket', 'devotion_pants',
      'mithril_jacket', 'mithril_pants',
      'knowledge_jacket', 'knowledge_pants', 'knowledge_gloves',
      'wooden_breastplate', 'copper_chainmail', 'bone_breastplate',
      'ring_mail_breastplate', 'scale_mail_breastplate', 'copper_plate',
      'copper_shield', 'scale_mail_shield', 'boiler_shield'
    ];
    for (const id of keyArmors) {
      ok(doraCatalog.some(x => x.itemId === id), `Dora sells armor ${id}`);
    }

    // Canonical Jewelry: strictly earrings!
    ok(doraCatalog.some(x => x.itemId === 'copper_earring'), 'Dora sells copper_earring (No-Grade)');
    ok(doraCatalog.some(x => x.itemId === 'coral_earring'), 'Dora sells coral_earring (Low D)');

    // Ensure no fantasy rings or necklaces in Dora's shop
    ok(!doraCatalog.some(x => x.itemId === 'copper_necklace'), 'Dora does NOT sell fantasy copper_necklace');
    ok(!doraCatalog.some(x => x.itemId === 'copper_ring'), 'Dora does NOT sell fantasy copper_ring');
    ok(!doraCatalog.some(x => x.itemId === 'iron_necklace'), 'Dora does NOT sell fantasy iron_necklace');
    ok(!doraCatalog.some(x => x.itemId === 'pressure_ring'), 'Dora does NOT sell obsolete pressure_ring');
  }

  suite('Phase 1 Grocery (Milly): Supplies, Bow Arrows, Scrolls & Shot Balance');
  {
    const millyCatalog = npcServices.shopCatalog('milly');
    ok(millyCatalog.length >= 25, `Milly sells expanded supplies (got ${millyCatalog.length})`);

    // 1. Arrows for archers (only for bows, no firearms)
    const woodenArrow = millyCatalog.find(x => x.itemId === 'wooden_arrow');
    ok(!!woodenArrow, 'Milly sells wooden_arrow (No-Grade)');
    eq(woodenArrow.price, 1, 'wooden_arrow price is 1 copper_parts (⚙️)');
    ok(woodenArrow.stackable, 'wooden_arrow is stackable');
    eq(itemDb.get('wooden_arrow').name, 'Деревянная стрела', 'wooden_arrow is named Деревянная стрела');

    const ironArrow = millyCatalog.find(x => x.itemId === 'iron_arrow');
    ok(!!ironArrow, 'Milly sells iron_arrow (D-Grade)');
    eq(ironArrow.price, 3, 'iron_arrow price is 3 copper_parts (⚙️)');
    eq(itemDb.get('iron_arrow').name, 'Кованая стрела (D)', 'iron_arrow is named Кованая стрела (D)');
    ok(!itemDb.get('iron_arrow').description.includes('патрон'), 'iron_arrow has no firearm/patron words');

    // 2. Utility & Teleport Scrolls
    const soe = millyCatalog.find(x => x.itemId === 'scroll_escape');
    ok(!!soe, 'Milly sells scroll_escape (SOE)');
    eq(soe.price, 650, 'scroll_escape price is 650 copper_parts (⚙️)');

    const res = millyCatalog.find(x => x.itemId === 'scroll_resurrection');
    ok(!!res, 'Milly sells scroll_resurrection');
    eq(res.price, 2800, 'scroll_resurrection price is 2800 copper_parts (⚙️)');

    // 3. Medical & Mobility Cures
    const antidote = millyCatalog.find(x => x.itemId === 'antidote');
    ok(!!antidote, 'Milly sells antidote');

    const bandage = millyCatalog.find(x => x.itemId === 'bandage');
    ok(!!bandage, 'Milly sells bandage');

    const alacrity = millyCatalog.find(x => x.itemId === 'potion_alacrity');
    ok(!!alacrity, 'Milly sells potion_alacrity');

    const windWalk = millyCatalog.find(x => x.itemId === 'potion_wind_walk');
    ok(!!windWalk, 'Milly sells potion_wind_walk');

    // 4. Canonical Shot Pricing Balance
    const ssD = millyCatalog.find(x => x.itemId === 'soulshot_d');
    const spsD = millyCatalog.find(x => x.itemId === 'spiritshot_d');
    const bspsD = millyCatalog.find(x => x.itemId === 'blessed_spiritshot_d');

    ok(!!ssD && !!spsD && !!bspsD, 'All D-grade shots present at Milly');
    eq(ssD.price, 30, 'soulshot_d price reduced to canonical 30 ⚙️');
    eq(spsD.price, 80, 'spiritshot_d price is canonical 80 ⚙️');
    eq(bspsD.price, 180, 'blessed_spiritshot_d price is canonical 180 ⚙️');
    ok(ssD.price < spsD.price, 'soulshot_d is significantly cheaper than spiritshot_d (canonical L2 C1)');
  }

  suite('Phase 1 Operator Technomodules & Quartermaster (Rid)');
  {
    const ridCatalog = npcServices.shopCatalog('intendant_rid');
    ok(ridCatalog.some(x => x.itemId === 'wooden_arrow'), 'Intendant Rid sells wooden_arrow');
    ok(ridCatalog.some(x => x.itemId === 'iron_arrow'), 'Intendant Rid sells iron_arrow');
    ok(ridCatalog.some(x => x.itemId === 'operator_hammer_low'), 'Intendant Rid sells starter hammer');
    ok(ridCatalog.some(x => x.itemId === 'copper_shield'), 'Intendant Rid sells copper_shield');

    // Operator technomodules in Rid shop
    ok(ridCatalog.some(x => x.itemId === 'operator_compressor_low'), 'Rid sells operator_compressor_low (necklace)');
    ok(ridCatalog.some(x => x.itemId === 'operator_bracers_low'), 'Rid sells operator_bracers_low (bracelet)');

    // Check operator technomodule item definitions
    const comp = itemDb.get('operator_compressor_low');
    ok(comp && comp.isCompressor && comp.isOperatorDevice, 'operator_compressor_low has compressor & operator flags');
    eq(comp.slot, 'necklace', 'operator_compressor_low fits necklace slot');

    const bracers = itemDb.get('operator_bracers_low');
    ok(bracers && bracers.isBracers && bracers.isOperatorBracers, 'operator_bracers_low has bracers & operator flags');
    eq(bracers.slot, 'bracelet', 'operator_bracers_low fits bracelet slot');

    // Starter equip has both modules
    const opProfile = gameRules.newProfile('OperatorHero', { cls: 'operator' });
    ok(opProfile.equip && opProfile.equip.necklace, 'Operator starter equip has necklace device');
    eq(opProfile.equip.necklace.id, 'operator_compressor_low', 'Operator necklace is operator_compressor_low');
    ok(opProfile.equip && opProfile.equip.bracelet, 'Operator starter equip has bracelet device');
    eq(opProfile.equip.bracelet.id, 'operator_bracers_low', 'Operator bracelet is operator_bracers_low');

    // Check gear calculation gives cDef/hpBonus
    const opGear = itemDb.gearFromEquip({
      necklace: { templateId: 'operator_compressor_low', shellIndex: 0 },
      bracelet: { templateId: 'operator_bracers_low', casingIndex: 0 },
      earring_l: 'copper_earring',
      earring_r: 'coral_earring'
    });
    ok(opGear.armorCDef > 0, `Operator technomodules provide cDef defense (${opGear.armorCDef})`);

    // Check skill device requirements
    const pStrike = skillDb.get('op_power_strike');
    ok(pStrike && pStrike.deviceReq && pStrike.deviceReq.slot === 'necklace', 'op_power_strike requires necklace compressor');

    const rep = skillDb.get('op_emergency_repair');
    ok(rep && rep.deviceReq && rep.deviceReq.slot === 'bracelet', 'op_emergency_repair requires bracelet bracers');
  }
};

if (require.main === module) {
  module.exports(null).then(() => {
    console.log('\n[PHASE 1 SHOPS AUDIT TEST] All tests passed successfully!');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
