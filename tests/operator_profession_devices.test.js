'use strict';
const assert = require('assert');
const SKILL_DB = require('../shared/skill-db.js');
const CS = require('../shared/class-system.js');
const ITEMS = require('../shared/item-db.js');

console.log('— Operator & Professions Dual Module System: Test Suite');

function runTests(t) {
  if (t && t.suite) t.suite('operator-profession-devices: dual module system');

const fighterClasses = [
  'operator', 'mechanic', 'destroyer', 'gunner',
  'boiler_guardian', 'repair_engineer', 'demolitionist',
  'steam_berserker', 'pneumatic_sniper', 'artillery_engineer'
];

// 1. Check class tree lineage
for (const cls of fighterClasses) {
  const root = CS.rootClass ? CS.rootClass(cls) : null;
  assert.strictEqual(root, 'operator', `Expected rootClass of ${cls} to be 'operator'`);
}
console.log('ok   All 10 fighter classes belong to root "operator"');

// 2. Check all skills metadata
let ddCount = 0;
let supportCount = 0;
let passiveCount = 0;

for (const [id, sk] of Object.entries(SKILL_DB.SKILLS)) {
  if (!fighterClasses.includes(sk.class)) continue;
  if (sk.type === 'passive') {
    passiveCount++;
    assert.strictEqual(sk.deviceReq, undefined, `Passive ${id} should not have deviceReq`);
  } else if (sk.category === 'attack') {
    ddCount++;
    assert(sk.deviceReq, `DD skill ${id} (${sk.name}) missing deviceReq`);
    assert.strictEqual(sk.deviceReq.type, 'compressor', `DD skill ${id} must require compressor`);
    assert.strictEqual(sk.deviceReq.slot, 'necklace', `DD skill ${id} must mount in necklace slot`);
  } else {
    supportCount++;
    assert(sk.deviceReq, `Support skill ${id} (${sk.name}) missing deviceReq`);
    assert.strictEqual(sk.deviceReq.type, 'bracers', `Support skill ${id} must require bracers`);
    assert.strictEqual(sk.deviceReq.slot, 'bracelet', `Support skill ${id} must mount in bracelet slot`);
  }
}

assert.strictEqual(ddCount, 21, 'Must have exactly 21 DD skills');
assert.strictEqual(supportCount, 22, 'Must have exactly 22 support skills');
assert.strictEqual(passiveCount, 19, 'Must have exactly 19 passive skills');
console.log(`ok   Skill catalog verified: 21 DD (Compressor), 22 Support (Bracers), 19 Passives`);

// 3. Check item definitions and recognition
const compTpl = ITEMS.get('operator_compressor_low');
const bracersTpl = ITEMS.get('operator_bracers_low');

assert(compTpl, 'operator_compressor_low must exist');
assert.strictEqual(compTpl.slot, 'necklace', 'Compressor slot must be necklace');
assert(compTpl.isCompressor || compTpl.isOperatorDevice, 'Compressor must be flagged');

assert(bracersTpl, 'operator_bracers_low must exist');
assert.strictEqual(bracersTpl.slot, 'bracelet', 'Bracers slot must be bracelet');
assert(bracersTpl.isBracers || bracersTpl.isOperatorBracers, 'Bracers must be flagged');

assert(ITEMS.isResonatorTpl(compTpl), 'isResonatorTpl must recognize operator compressor');
assert(ITEMS.isNanoBraceletTpl(bracersTpl), 'isNanoBraceletTpl must recognize operator bracers');
console.log('ok   Operator devices recognized by items database and upgrade predicates');

// 4. Test gearFromEquip stats progression for operator devices
const equipWithDevices = {
  necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low', shellIndex: 0 },
  bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low', casingIndex: 0 }
};

let gear0 = ITEMS.gearFromEquip(equipWithDevices, { isMagePath: false });
assert.strictEqual(gear0.armorCDef, 15 + 8, 'Base shell 0 (15) + casing 0 (8) = 23 cDef');
assert.strictEqual(gear0.hpBonus, 0, 'Base shell 0 + casing 0 = 0 hpBonus');
assert.strictEqual(gear0.energyBonus, 0, 'Base shell 0 + casing 0 = 0 energyBonus');

// Upgrade compressor to shell 1 (NG II) and bracers to casing 1 (NG II)
equipWithDevices.necklace.shellIndex = 1;
equipWithDevices.bracelet.casingIndex = 1;
let gear1 = ITEMS.gearFromEquip(equipWithDevices, { isMagePath: false });
assert.strictEqual(gear1.armorCDef, 18 + 10, 'NG II shell (18) + casing (10) = 28 cDef');
assert.strictEqual(gear1.hpBonus, 20 + 25, 'NG II shell (20) + casing (25) = 45 hpBonus');
assert.strictEqual(gear1.energyBonus, 0 + 25, 'NG II shell (0) + casing (25) = 25 energyBonus');
console.log('ok   Stats ladder verified: Shell and Casing upgrades apply cDef, HP, and Energy bonuses');

// 5. Test jewelry defense routing to armorCDef
const earringTpl = ITEMS.get('copper_earring');
assert(earringTpl, 'copper_earring must exist');
assert.strictEqual(earringTpl.defense, 9, 'copper_earring defense must be canonical 9');

const equipJewelry = {
  earring: { id: 'copper_earring', templateId: 'copper_earring' }
};
let gearJewelry = ITEMS.gearFromEquip(equipJewelry, { isMagePath: false });
assert.strictEqual(gearJewelry.armorDef, 0, 'Jewelry defense must NOT be added to armorDef (P.Def)');
assert.strictEqual(gearJewelry.nakedMDefSub, 9, 'Naked M.Def for ear must subtract 9');
console.log('ok   Jewelry defense routing verified: strictly armorCDef (M.Def), not armorDef');

// 6. Test handler skill learning & device upgrade
const mockDeps = {
  SK: SKILL_DB,
  NPCS: {
    allNpcs: () => [{ id: 'instructor_thorn', type: 'trainer', trainerClasses: ['operator'] }],
    inRange: () => true
  },
  CS: CS,
  QD: { get: () => null },
  ITEMS: ITEMS,
  send: (p, msg) => { p._lastMsg = msg; },
  broadcastAOI: () => {},
  saveProfileNow: () => {},
  pushCombatStats: () => {},
  npcForService: (p, id) => ({ id: 'instructor_thorn', type: 'trainer', trainerClasses: ['operator'] }),
  skillAllowedForClass: (p, cls) => cls === p.cls || (CS.rootClass && CS.rootClass(cls) === CS.rootClass(p.cls)),
  grantSkillFree: () => {},
  grantExpertiseSkills: () => {},
  safeDevices: (src, eq, lvl) => {
    return {
      circuit: (src && src.circuit) || 1,
      nano: (src && src.nano) || 1,
      valve: (src && src.circuit) || 1,
      wrist: (src && src.nano) || 1,
      shell: (src && src.shell) || 0,
      casing: (src && src.casing) || 0
    };
  },
  syncDevicesToEquip: (p) => {
    if (p.equip && p.equip.necklace) {
      p.equip.necklace.circuitLevel = p.devices.circuit;
      p.equip.necklace.valveLevel = p.devices.valve;
      p.equip.necklace.shellIndex = p.devices.shell;
    }
    if (p.equip && p.equip.bracelet) {
      p.equip.bracelet.nanoLevel = p.devices.nano;
      p.equip.bracelet.wristLevel = p.devices.wrist;
      p.equip.bracelet.casingIndex = p.devices.casing;
    }
  }
};

const { createSkillLearnHandler } = require('../server/handlers/skill-learn-handler.js');
const handler = typeof createSkillLearnHandler === 'function' ? createSkillLearnHandler(mockDeps) : null;

if (handler) {
  const p = {
    cls: 'operator',
    level: 20,
    sp: 50000,
    skills: {},
    equip: {
      necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
      bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
    },
    devices: { circuit: 1, nano: 1, valve: 1, wrist: 1, shell: 0, casing: 0 },
    inv: { copper_parts: 500, synthetic_oil: 50, pressure_amplifier: 10 }
  };

  // Skill with levelReq 20 requires device level 4 (valve_level 4 for DD, wrist_level 4 for support)
  // dest_power_smash is levelReq 20 DD
  handler.doLearnSkill(p, 'dest_power_smash', 'instructor_thorn');
  assert(p._lastMsg, 'Must receive message');
  assert.strictEqual(p._lastMsg.t, 'learn_skill_fail');
  assert.strictEqual(p._lastMsg.reason, 'valve_level', 'Must fail with valve_level when valve is level 1');
  assert.strictEqual(p._lastMsg.need, 4, 'Need device level 4 for level 20 skill');

  // Upgrade valve track via SP:
  handler.doDeviceUpgrade(p, 'valve');
  assert.strictEqual(p._lastMsg.t, 'device_ok');
  assert.strictEqual(p.devices.valve, 2);

  handler.doDeviceUpgrade(p, 'valve');
  assert.strictEqual(p.devices.valve, 3);

  handler.doDeviceUpgrade(p, 'valve');
  assert.strictEqual(p.devices.valve, 4);

  // Now learning dest_power_smash should succeed:
  handler.doLearnSkill(p, 'dest_power_smash', 'instructor_thorn');
  assert.strictEqual(p._lastMsg.t, 'learn_skill_ok', 'Skill learning must succeed once valve level is 4');
  assert.strictEqual(p.skills['dest_power_smash'], 1);

  // Support skill with levelReq 20: mech_aggression (requires wrist_level 4)
  handler.doLearnSkill(p, 'mech_aggression', 'instructor_thorn');
  assert.strictEqual(p._lastMsg.t, 'learn_skill_fail');
  assert.strictEqual(p._lastMsg.reason, 'wrist_level', 'Must fail with wrist_level when wrist is level 1');

  handler.doDeviceUpgrade(p, 'wrist');
  handler.doDeviceUpgrade(p, 'wrist');
  handler.doDeviceUpgrade(p, 'wrist');
  assert.strictEqual(p.devices.wrist, 4);

  handler.doLearnSkill(p, 'mech_aggression', 'instructor_thorn');
  assert.strictEqual(p._lastMsg.t, 'learn_skill_ok', 'Support skill learning must succeed once wrist level is 4');
  assert.strictEqual(p.skills['mech_aggression'], 1);

  // Upgrade shell track via materials:
  handler.doDeviceUpgrade(p, 'shell');
  assert.strictEqual(p._lastMsg.t, 'device_ok');
  assert.strictEqual(p.devices.shell, 1);
  assert.strictEqual(p.inv.copper_parts, 500 - 40, 'Shell 1 costs 40 copper_parts');

  console.log('ok   Server authoritative skill learn & device upgrade verified for Operator');
}

// 7. Test bound / non-droppable protections for Operator and Engineer devices
const DR = require('../shared/death-rules.js');
const TR = require('../shared/trade-rules.js');
const NPCS = require('../shared/npc-services.js');

const devices = [
  'operator_compressor_low',
  'operator_bracers_low',
  'engineer_emitter_low',
  'engineer_nano_bracelet'
];

for (const devId of devices) {
  const meta = ITEMS.get(devId);
  assert(meta, `Device ${devId} must exist in item-db`);
  assert(meta.nodrop && meta.undroppable && meta.bound, `Device ${devId} must have nodrop/bound flags`);
  assert.strictEqual(DR.isDropable(devId, meta), false, `Device ${devId} must not be droppable upon death`);
  assert.strictEqual(TR.tradable(devId).ok, false, `Device ${devId} must not be tradable`);
  assert.strictEqual(NPCS.sellPrice(devId), 0, `Device ${devId} must not be sold to NPC`);
}
console.log('ok   Complete undroppable, bound, and non-tradable protections verified for all devices');

console.log('\n[OPERATOR DUAL MODULE TEST] All tests passed with flying colors!');
  if (t && t.ok) t.ok(true, 'operator-profession-devices: all tests passed');
}

module.exports = runTests;
if (require.main === module) runTests();

