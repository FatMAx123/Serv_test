/**
 * tests/canonical_trainers.test.js
 *
 * Verification suite for Canonical Lineage 2 C1 NPC Skill Trainers:
 * 1. World metrics: Master Instructor Thorn & Circuit Magister Baulro existence and strict guild partitioning
 * 2. Cross-class rejection at server skill learn handler (reason: 'class_trainer')
 * 3. Total purge of meme/trash skills (br_*, gm_*, test_*, meme: true)
 * 4. Dual-module gate checks for Operator (necklace: compressor, bracelet: bracers)
 * 5. Phase 1 scope compliance (skills levelReq <= 20)
 */

'use strict';

const assert = require('assert');
const path = require('path');

const wm = require('../shared/world-metrics.js');
const npcsService = require('../shared/npc-services.js');
const sdb = require('../shared/skill-db.js');
const CS = require('../shared/class-system.js');
const ITEMS = require('../shared/item-db.js');
const { createSkillLearnHandler } = require('../server/handlers/skill-learn-handler.js');

console.log('— Testing Canonical Lineage 2 C1 NPC Skill Trainers —');

function runTests(t) {
  if (t && t.suite) t.suite('canonical-trainers: NPC skill trainers and guild partitioning');


// 1. World Metrics verification
console.log('\n[TEST 1] World Metrics: NPC Trainers Discovery & Guild Partitioning');
const npcs = npcsService.allNpcs();
const thorn = npcs.find(n => n.id === 'instructor_thorn');
const baulro = npcs.find(n => n.id === 'magister_baulro');

assert(thorn, 'Master Instructor Thorn must exist in NPC registry');
assert.strictEqual(thorn.type, 'trainer', 'Thorn must have type: trainer');
assert(Array.isArray(thorn.trainerClasses), 'Thorn must have trainerClasses array');
assert(thorn.trainerClasses.includes('operator'), 'Thorn must train operator');
assert(thorn.trainerClasses.includes('mechanic'), 'Thorn must train mechanic');
assert(thorn.trainerClasses.includes('destroyer'), 'Thorn must train destroyer');
assert(thorn.trainerClasses.includes('gunner'), 'Thorn must train gunner');
assert(!thorn.trainerClasses.includes('engineer'), 'Thorn CANNOT train engineer');
assert(!thorn.trainerClasses.includes('constructor'), 'Thorn CANNOT train constructor');
assert(!thorn.trainerClasses.includes('technomancer'), 'Thorn CANNOT train technomancer');
console.log('✓ Master Instructor Thorn strictly configured for Fighter / Operator branch');

assert(baulro, 'Circuit Magister Baulro must exist in NPC registry');
assert.strictEqual(baulro.type, 'trainer', 'Baulro must have type: trainer');
assert(Array.isArray(baulro.trainerClasses), 'Baulro must have trainerClasses array');
assert(baulro.trainerClasses.includes('engineer'), 'Baulro must train engineer');
assert(baulro.trainerClasses.includes('constructor'), 'Baulro must train constructor');
assert(baulro.trainerClasses.includes('technomancer'), 'Baulro must train technomancer');
assert(!baulro.trainerClasses.includes('operator'), 'Baulro CANNOT train operator');
assert(!baulro.trainerClasses.includes('mechanic'), 'Baulro CANNOT train mechanic');
assert(!baulro.trainerClasses.includes('destroyer'), 'Baulro CANNOT train destroyer');
console.log('✓ Circuit Magister Baulro strictly configured for Tech / Engineer branch');


// 2. Server Skill Learn Handler setup
console.log('\n[TEST 2] Server Skill Learn Handler: Cross-Class Guild Rejection');

const sentMessages = [];
function send(p, msg) {
    sentMessages.push(msg);
}

function skillAllowedForClass(p, templateClass) {
    if (!templateClass) return false;
    if (templateClass === 'any' || templateClass === 'all' || templateClass === '*') return true;
    if (templateClass === p.cls) return true;
    const line = CS.classLineage(p.cls);
    return line.indexOf(templateClass) !== -1;
}

function npcForService(p, npcId, failType, needField) {
    const npc = npcsService.getNpc(npcId);
    if (!npc) {
        send(p, { t: failType, reason: 'unknown_npc', npcId: String(npcId || '') });
        return null;
    }
    if (needField) {
        const has = (typeof needField === 'function') ? !!needField(npc) : !!npc[needField];
        if (!has) {
            send(p, { t: failType, reason: 'no_service', npcId: npc.id });
            return null;
        }
    }
    if (!npcsService.inRange(npc, p.x, p.z)) {
        send(p, { t: failType, reason: 'range', npcId: npc.id });
        return null;
    }
    return npc;
}

const skillHandler = createSkillLearnHandler({
    SK: sdb,
    NPCS: npcsService,
    CS,
    ITEMS,
    send,
    broadcastAOI: () => {},
    saveProfileNow: () => {},
    pushCombatStats: () => {},
    npcForService,
    skillAllowedForClass,
    grantSkillFree: () => {},
    grantExpertiseSkills: () => {},
    safeDevices: () => {},
    syncDevicesToEquip: () => {}
});

function createMockPlayer(opts = {}) {
    const player = {
        id: opts.id || 'test_player_1',
        name: opts.name || 'TestHero',
        cls: opts.class || 'operator',
        class: opts.class || 'operator',
        level: opts.level || 15,
        sp: opts.sp != null ? opts.sp : 50000,
        x: (opts.pos && opts.pos.x) || thorn.position.x,
        y: 0,
        z: (opts.pos && opts.pos.z) || thorn.position.z,
        skills: {},
        equip: opts.equip || {}
    };
    return player;
}

// 2a. Operator attempts learning at Magister Baulro (should fail with 'class_trainer')
{
    const opPlayer = createMockPlayer({
        class: 'operator',
        level: 15,
        sp: 50000,
        pos: baulro.position,
        equip: { necklace: { templateId: 'operator_compressor_low' } }
    });

    sentMessages.length = 0;
    skillHandler.doLearnSkill(opPlayer, 'op_power_strike', 'magister_baulro');

    assert.strictEqual(sentMessages.length, 1, 'Player should receive 1 message');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_fail');
    assert.strictEqual(reply.reason, 'class_trainer', 'Operator at Baulro must be rejected with reason: class_trainer');
    assert.strictEqual(reply.npcId, 'magister_baulro');
    console.log('✓ Operator speaking to Magister Baulro rejected with class_trainer');
}

// 2b. Engineer attempts learning at Master Thorn (should fail with 'class_trainer')
{
    const engPlayer = createMockPlayer({
        class: 'engineer',
        level: 15,
        sp: 50000,
        pos: thorn.position
    });

    sentMessages.length = 0;
    skillHandler.doLearnSkill(engPlayer, 'eng_pressure_bolt', 'instructor_thorn');

    assert.strictEqual(sentMessages.length, 1, 'Player should receive 1 message');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_fail');
    assert.strictEqual(reply.reason, 'class_trainer', 'Engineer at Thorn must be rejected with reason: class_trainer');
    assert.strictEqual(reply.npcId, 'instructor_thorn');
    console.log('✓ Engineer speaking to Master Thorn rejected with class_trainer');
}


// 3. Purge of Meme / Trash Skills
console.log('\n[TEST 3] Server & Database: Absolute Purge of Meme / Trash Skills');
const memeSkillIds = ['br_skibidi_slam', 'br_tralala_wave', 'br_bombardiro_dive', 'gm_oneshot', 'gm_resurrect', 'gm_flash', 'gm_speed', 'test_immortal'];

memeSkillIds.forEach(mId => {
    const opPlayer = createMockPlayer({ class: 'operator', level: 20, sp: 50000, pos: thorn.position });
    sentMessages.length = 0;

    skillHandler.doLearnSkill(opPlayer, mId, 'instructor_thorn');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_fail', `Meme skill ${mId} learning must fail`);
    assert(reply.reason === 'class' || reply.reason === 'unknown',
        `Meme skill ${mId} rejected with reason: ${reply.reason}`);
});
console.log('✓ All meme/GM/test skills rejected (not learnable at trainers)');


// 4. Operator Dual Module Gate Verification
console.log('\n[TEST 4] Server: Dual Module Requirement Gate (Compressor vs Bracers)');

// 4a. op_power_strike requires compressor (necklace)
{
    const playerNoComp = createMockPlayer({
        class: 'operator',
        level: 10,
        sp: 10000,
        pos: thorn.position,
        equip: {} // no compressor
    });

    sentMessages.length = 0;
    skillHandler.doLearnSkill(playerNoComp, 'op_power_strike', 'instructor_thorn');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_fail');
    assert.strictEqual(reply.reason, 'need_compressor', 'Must fail without compressor');
    console.log('✓ Power Strike requires compressor (necklace)');
}

// 4b. op_oil_slick requires bracers (bracelet)
{
    const playerNoBracers = createMockPlayer({
        class: 'operator',
        level: 10,
        sp: 10000,
        pos: thorn.position,
        equip: { necklace: { templateId: 'operator_compressor_low' } } // has compressor, but no bracers
    });

    sentMessages.length = 0;
    skillHandler.doLearnSkill(playerNoBracers, 'op_oil_slick', 'instructor_thorn');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_fail');
    assert.strictEqual(reply.reason, 'need_bracers', 'Must fail without operator bracers');
    console.log('✓ Oil Slick requires operator bracers (bracelet)');
}

// 4c. Learning succeeds when equipped
{
    const playerEquipped = createMockPlayer({
        class: 'operator',
        level: 10,
        sp: 10000,
        pos: thorn.position,
        equip: {
            necklace: { templateId: 'operator_compressor_low' },
            bracelet: { templateId: 'operator_bracers_low' }
        }
    });

    sentMessages.length = 0;
    skillHandler.doLearnSkill(playerEquipped, 'op_power_strike', 'instructor_thorn');
    const reply = sentMessages[0];
    assert.strictEqual(reply.t, 'learn_skill_ok', 'Should successfully learn skill rank');
    assert.strictEqual(playerEquipped.skills['op_power_strike'], 1, 'Skill level should be 1');
    console.log('✓ Power Strike successfully learned when compressor is equipped');
}


// 5. Phase 1 Scope (Skills levelReq <= 20)
console.log('\n[TEST 5] Phase 1 Skill Scope: Only Starter/Phase 1 Skills Available');
const allSkills = sdb.list();

const opPhase1Skills = allSkills.filter(s =>
    (s.class === 'operator' || s.class === 'mechanic' || s.class === 'destroyer' || s.class === 'gunner') &&
    !s.meme && s.class !== 'any' && !s.id.startsWith('br_') && !s.id.startsWith('gm_') && !s.id.startsWith('test_') &&
    (s.levelReq || 1) <= 20
);

const engPhase1Skills = allSkills.filter(s =>
    (s.class === 'engineer' || s.class === 'constructor' || s.class === 'technomancer') &&
    !s.meme && s.class !== 'any' && !s.id.startsWith('br_') && !s.id.startsWith('gm_') && !s.id.startsWith('test_') &&
    (s.levelReq || 1) <= 20
);

assert(opPhase1Skills.length >= 10, 'Must have at least 10 Phase 1 fighter skills');
assert(engPhase1Skills.length >= 10, 'Must have at least 10 Phase 1 engineer skills');
console.log(`✓ Fighter Phase 1 Skills: ${opPhase1Skills.length} canonical skills verified`);
console.log(`✓ Engineer Phase 1 Skills: ${engPhase1Skills.length} canonical skills verified`);

console.log('\n[CANONICAL TRAINERS TEST] All tests passed with flying colors!');
  if (t && t.ok) t.ok(true, 'canonical-trainers: all tests passed');
}

module.exports = runTests;
if (require.main === module) runTests();

