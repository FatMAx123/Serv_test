// tests/phase1_armor_audit.test.js
const itemDb = require('../shared/item-db.js');
const engineerArmors = require('../data/engineer_armor_db.json');

module.exports = async function (t) {
  const { suite, ok, eq } = t;

  suite('shield mechanics: no passive armorDef, only shieldDef');
  {
    const equipWithShield = {
      chest: 'copper_plate',
      shield: 'boiler_shield'
    };
    const gear = itemDb.gearFromEquip(equipWithShield);
    ok(gear.hasShield === true, 'gear.hasShield === true');
    eq(gear.armorDef, 75, 'gear.armorDef is 75 (copper_plate only, shield excluded)');
    eq(gear.shieldDef, 75, 'gear.shieldDef is 75 (boiler_shield)');
  }

  suite('armor sets: shield exploit prevention');
  {
    const equipSneakyShield = {
      chest: 'devotion_jacket',
      shield: { id: 'sneaky_shield', setId: 'devotion', isShield: true, slot: 'shield' }
    };
    const sets = itemDb.evaluateSets(equipSneakyShield);
    ok(!sets.active.includes('devotion'), 'Shield with setId cannot activate devotion set');
    const count = itemDb.countSetPieces(equipSneakyShield, 'devotion');
    eq(count, 1, 'Set pieces count is 1 (chest only)');
  }

  {
    const equipDevotion = {
      chest: 'devotion_jacket',
      legs: 'devotion_pants'
    };
    const sets = itemDb.evaluateSets(equipDevotion);
    ok(sets.active.includes('devotion'), 'Devotion set active with chest + legs');
    eq(sets.castSpeedSet, 0.15, 'Devotion set gives +15% cast speed');
  }

  {
    const equipKnowledge = {
      chest: 'knowledge_jacket',
      legs: 'knowledge_pants',
      gloves: 'knowledge_gloves'
    };
    const sets = itemDb.evaluateSets(equipKnowledge);
    ok(sets.active.includes('knowledge'), 'Knowledge set active with 3 pieces');
    eq(sets.cAtkPercent, 0.10, 'Knowledge set gives +10% C.Atk');
  }

  suite('Phase 1 item stats audit (1-20 lvl)');
  {
    const items = itemDb.ITEMS || itemDb;
    
    // copper_plate
    const cp = items.copper_plate;
    ok(!!cp, 'copper_plate exists');
    eq(cp.defense, 75, 'copper_plate defense is 75');
    eq(cp.grade, 'd', 'copper_plate is D-grade');
    eq(cp.levelReq, 20, 'copper_plate levelReq is 20');
    eq(cp.price, 45000, 'copper_plate price is 45000');
    eq(cp.crystalCount, 80, 'copper_plate crystalCount is 80');

    // steam_helmet
    const sh = items.steam_helmet;
    ok(!!sh, 'steam_helmet exists');
    eq(sh.defense, 38, 'steam_helmet defense is 38');
    eq(sh.levelReq, 20, 'steam_helmet levelReq is 20');
    eq(sh.grade, 'd', 'steam_helmet is D-grade');

    // steam_boots
    const sb = items.steam_boots;
    ok(!!sb, 'steam_boots exists');
    eq(sb.defense, 25, 'steam_boots defense is 25');
    eq(sb.levelReq, 20, 'steam_boots levelReq is 20');
    eq(sb.grade, 'd', 'steam_boots is D-grade');

    // NG pieces
    eq(items.goggles.defense, 12, 'goggles defense is 12');
    eq(items.leather_cap.defense, 12, 'leather_cap defense is 12');
    eq(items.leather_gloves.defense, 8, 'leather_gloves defense is 8');
    eq(items.work_boots.defense, 7, 'work_boots defense is 7');
  }

  suite('Phase 1 grade isolation');
  {
    const items = itemDb.ITEMS || itemDb;
    let leakFound = false;
    for (const [k, v] of Object.entries(items)) {
      const g = (v.grade || '').toLowerCase();
      const req = v.levelReq || 1;
      if (g === 'c' && req < 40) leakFound = true;
      if (g === 'b' && req < 52) leakFound = true;
      if (g === 'a' && req < 61) leakFound = true;
      if (g === 's' && req < 76) leakFound = true;
    }
    ok(!leakFound, 'no C/B/A/S items can be equipped in Phase 1 (levelReq >= 40)');
  }

  suite('engineer_armor_db.json catalog integrity');
  {
    eq(engineerArmors.length, 19, 'engineer_armor_db has 19 items');
    const cp = engineerArmors.find(a => a.id === 'copper_plate');
    ok(!!cp, 'copper_plate is in engineer_armor_db.json');
    eq(cp.defense, 75, 'copper_plate in json defense is 75');
    eq(cp.levelReq, 20, 'copper_plate in json levelReq is 20');

    const sh = engineerArmors.find(a => a.id === 'steam_helmet');
    eq(sh.defense, 38, 'steam_helmet in json defense is 38');
    eq(sh.levelReq, 20, 'steam_helmet in json levelReq is 20');

    const sb = engineerArmors.find(a => a.id === 'steam_boots');
    eq(sb.defense, 25, 'steam_boots in json defense is 25');
    eq(sb.levelReq, 20, 'steam_boots in json levelReq is 20');

    const g = engineerArmors.find(a => a.id === 'goggles');
    eq(g.defense, 12, 'goggles in json defense is 12');

    const lc = engineerArmors.find(a => a.id === 'leather_cap');
    eq(lc.defense, 12, 'leather_cap in json defense is 12');

    const lg = engineerArmors.find(a => a.id === 'leather_gloves');
    eq(lg.defense, 8, 'leather_gloves in json defense is 8');

    const wb = engineerArmors.find(a => a.id === 'work_boots');
    eq(wb.defense, 7, 'work_boots in json defense is 7');
  }

  suite('Operator Armor Sets: 7 Sets Canonical L2 C1 Audit');
  {
    // 1. Wooden Set (L1 Low NG Heavy)
    const eqWooden = { chest: 'wooden_breastplate', legs: 'wooden_gaiters' };
    const setsWooden = itemDb.evaluateSets(eqWooden);
    ok(setsWooden.active.includes('wooden'), 'Wooden set active with chest + legs');
    eq(setsWooden.pDefPercent, 0.0526, 'Wooden set gives +5.26% P.Def');
    eq(setsWooden.hpFlat, 41, 'Wooden set gives +41 HP in evaluateSets');
    const gearWooden = itemDb.gearFromEquip(eqWooden);
    eq(gearWooden.hpBonus, 41, 'Wooden set gives +41 HP via gearFromEquip');

    // 2. Leather Set (L5 Mid NG Light)
    const eqLeather = { chest: 'leather_armor', legs: 'leather_pants' };
    const setsLeather = itemDb.evaluateSets(eqLeather);
    ok(setsLeather.active.includes('leather'), 'Leather set active with chest + legs');
    eq(setsLeather.pDefPercent, 0.0526, 'Leather set gives +5.26% P.Def');

    // 3. Bronze / Iron Set (L10 Mid NG Heavy)
    const eqBronze = { chest: 'copper_chainmail', legs: 'copper_chainmail_gaiters' };
    const setsBronze = itemDb.evaluateSets(eqBronze);
    ok(setsBronze.active.includes('bronze_ng'), 'Bronze set active with chest + legs');
    eq(setsBronze.pDefPercent, 0.0526, 'Bronze set gives +5.26% P.Def');
    eq(setsBronze.hpFlat, 50, 'Bronze set gives +50 HP in evaluateSets');
    const gearBronze = itemDb.gearFromEquip(eqBronze);
    eq(gearBronze.hpBonus, 50, 'Bronze set gives +50 HP via gearFromEquip');

    // 4. Bone Set (L15 Top NG Light)
    const eqBone = { chest: 'bone_breastplate', legs: 'bone_gaiters' };
    const setsBone = itemDb.evaluateSets(eqBone);
    ok(setsBone.active.includes('bone'), 'Bone set active with chest + legs');
    eq(setsBone.pDefPercent, 0.0526, 'Bone set gives +5.26% P.Def');
    eq(setsBone.hpFlat, 40, 'Bone set gives +40 HP in evaluateSets');
    const gearBone = itemDb.gearFromEquip(eqBone);
    eq(gearBone.hpBonus, 40, 'Bone set gives +40 HP via gearFromEquip');

    // 5. Ring Mail Set (L15 Top NG Heavy)
    const eqRing = { chest: 'ring_mail_breastplate', legs: 'ring_mail_gaiters', boots: 'ring_mail_boots' };
    const setsRing = itemDb.evaluateSets(eqRing);
    ok(setsRing.active.includes('ring_mail'), 'Ring Mail set active with 3 pieces');
    eq(setsRing.pDefPercent, 0.0526, 'Ring Mail set gives +5.26% P.Def');
    eq(setsRing.hpFlat, 30, 'Ring Mail set gives +30 HP in evaluateSets');
    const gearRing = itemDb.gearFromEquip(eqRing);
    eq(gearRing.hpBonus, 30, 'Ring Mail set gives +30 HP via gearFromEquip');

    // 6. Reinforced Leather Set (L20 Low D Light)
    const eqReinf = { chest: 'reinforced_leather_shirt', legs: 'reinforced_leather_gaiters', boots: 'reinforced_leather_boots' };
    const setsReinf = itemDb.evaluateSets(eqReinf);
    ok(setsReinf.active.includes('reinforced_leather'), 'Reinforced Leather set active with 3 pieces');
    eq(setsReinf.pDefPercent, 0.0526, 'Reinforced Leather set gives +5.26% P.Def');
    eq(setsReinf.energyFlat, 80, 'Reinforced Leather set gives +80 Energy in evaluateSets');
    const gearReinf = itemDb.gearFromEquip(eqReinf);
    eq(gearReinf.energyBonus, 80, 'Reinforced Leather set gives +80 Energy via gearFromEquip');

    // 7. Scale Mail Set (L20 Low D Heavy)
    const eqScale = { chest: 'scale_mail_breastplate', legs: 'scale_mail_gaiters' };
    const setsScale = itemDb.evaluateSets(eqScale);
    ok(setsScale.active.includes('scale_mail'), 'Scale Mail set active with chest + legs');
    eq(setsScale.pDefPercent, 0.0526, 'Scale Mail set gives +5.26% P.Def');
    eq(setsScale.hpFlat, 80, 'Scale Mail set gives +80 HP in evaluateSets');
    const gearScale = itemDb.gearFromEquip(eqScale);
    eq(gearScale.hpBonus, 80, 'Scale Mail set gives +80 HP via gearFromEquip');
  }

  suite('operator_armor_db.json & operator_sets_db.json databases');
  {
    const operatorArmors = require('../data/operator_armor_db.json');
    const operatorSets = require('../data/operator_sets_db.json');

    eq(operatorSets.length, 7, 'operator_sets_db has 7 sets');
    ok(operatorArmors.length >= 22, 'operator_armor_db has at least 22 armor items');

    const setIds = operatorSets.map(s => s.id);
    ok(setIds.includes('wooden'), 'wooden in operator_sets');
    ok(setIds.includes('leather'), 'leather in operator_sets');
    ok(setIds.includes('bronze_ng'), 'bronze_ng in operator_sets');
    ok(setIds.includes('bone'), 'bone in operator_sets');
    ok(setIds.includes('ring_mail'), 'ring_mail in operator_sets');
    ok(setIds.includes('reinforced_leather'), 'reinforced_leather in operator_sets');
    ok(setIds.includes('scale_mail'), 'scale_mail in operator_sets');

    for (const a of operatorArmors) {
      ok(!!a.id, `Item has id (${a.id})`);
      ok(typeof a.defense === 'number' && a.defense > 0, `Item ${a.id} has positive defense (${a.defense})`);
      ok(['no_grade', 'd'].includes(a.grade), `Item ${a.id} is NG or D (got ${a.grade})`);
      ok(['heavy', 'light', 'robe'].includes(a.armorType), `Item ${a.id} has valid armorType (${a.armorType})`);
    }
  }

  suite('Armor Database HTML Portal');
  {
    const fs = require('fs');
    const path = require('path');
    const htmlPath = path.join(__dirname, '../client/armor-database.html');
    ok(fs.existsSync(htmlPath), 'client/armor-database.html exists');
    const content = fs.readFileSync(htmlPath, 'utf-8');
    ok(content.includes('Комплект «Клёпаный Каркас»'), 'HTML contains Wooden Set');
    ok(content.includes('Комплект «Чешуйчатый Доспех»'), 'HTML contains Scale Mail Set');
    ok(content.includes('Комплект «Турбо-Контур»'), 'HTML contains Devotion Set');
    ok(content.includes('data-set-class="operator"'), 'HTML has Operator set filter');
    ok(content.includes('data-set-class="engineer"'), 'HTML has Engineer set filter');
  }
};

