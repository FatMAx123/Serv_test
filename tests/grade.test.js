// ============================================================
//  TESTS / GRADE.TEST.JS — levelReq по грейду + штраф Expertise (PLAN 5.1).
//  Регресс: 0 предметов с levelReq, на 1 уровне надевался D-грейд без штрафа.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GR = require(path.join(ROOT, 'shared', 'grade-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));

module.exports = function (t) {
  t.suite('grade-rules: порог уровня');
  t.eq(GR.levelReqForGrade('no_grade'), 1, 'NG с 1 уровня');
  t.eq(GR.levelReqForGrade('d'), 20, 'D с 20 (1-я профессия)');
  t.eq(GR.levelReqForGrade('c'), 40, 'C с 40');
  t.eq(GR.itemLevelReq({ grade: 'd' }), 20, 'вещь без явного levelReq берёт грейд');
  t.eq(GR.itemLevelReq({ grade: 'd', levelReq: 22 }), 22, 'явный levelReq важнее грейда');
  t.eq(GR.rank('D'), 1, 'нормализация D');
  t.eq(GR.rank('no_grade'), 0, 'NG = 0');

  t.suite('grade-rules: штраф L2');
  const none = GR.penalty(0, 'no_grade', 'no_grade');
  t.ok(!none.active, 'NG без экспертизы — штрафа нет');
  const dWeap = GR.penalty(0, 'd', 'no_grade');
  t.ok(dWeap.active && dWeap.weaponGap === 1, 'D-оружие без Expertise D — gap 1');
  t.eq(dWeap.accuracy, -16, '−16 точности за один грейд (C1)');
  t.eq(Math.round(dWeap.atkSpdMult * 100), 84, 'Atk.Spd ×0.84 за D-оружие без экспертизы');
  const withD = GR.penalty(1, 'd', 'd');
  t.ok(!withD.active, 'Expertise D снимает штраф с D-экипа');
  t.eq(GR.expertiseRank({ op_expertise_d: 1 }), 1, 'скилл op_expertise_d = ранг 1');
  t.eq(GR.expertiseRank({}), 0, 'без скилла ранг 0');

  t.suite('item-db: levelReq проставлен по грейду');
  t.eq(GR.normalize(ITEMS.get('steam_hammer').grade), 'no_grade',
    'паровой молот — NG в combat-каталоге (не D из loot-rules)');
  t.eq(GR.normalize(ITEMS.get('pneumatic_rifle').grade), 'no_grade',
    'винтовка — NG в combat-каталоге');
  t.eq(ITEMS.get('operator_hammer_low').levelReq, 1, 'стартовый молот NG — 1 ур.');
  t.eq(ITEMS.get('mace_prayer').levelReq, 20, 'D-булава — 20 ур.');
  t.eq(ITEMS.get('apprentice_wand').levelReq, 1, 'учебный жезл NG — 1 ур.');
  let dCount = 0, dBad = 0, ngBad = 0, total = 0;
  Object.keys(ITEMS.ITEMS).forEach((id) => {
    const it = ITEMS.get(id);
    if (!it) return;
    total++;
    const g = GR.normalize(it.grade);
    if (g === 'd') {
      dCount++;
      if (it.levelReq !== 20) dBad++;
    }
    if (g === 'no_grade' && it.levelReq !== 1 && it.levelReq != null && it.levelReq < 1) ngBad++;
  });
  t.ok(dCount >= 8, 'в item-db есть D-оружие', 'D: ' + dCount);
  t.eq(dBad, 0, 'все D в item-db имеют levelReq 20');
  t.ok(total >= 40, 'каталог не пуст', 'предметов: ' + total);

  t.suite('loot-rules: levelReq проставлен по грейду');
  let lootD = 0, lootDBad = 0, lootN = 0;
  Object.keys(LR.LOOT_ITEMS).forEach((id) => {
    const it = LR.LOOT_ITEMS[id];
    if (!it) return;
    lootN++;
    if (GR.normalize(it.grade) === 'd') {
      lootD++;
      if ((it.levelReq | 0) !== 20) lootDBad++;
    }
  });
  t.ok(lootN >= 100, 'каталог дропа не пуст', 'позиций: ' + lootN);
  t.ok(lootD >= 5, 'в дропе есть D-предметы', 'D: ' + lootD);
  t.eq(lootDBad, 0, 'все D в loot-rules имеют levelReq 20');

  t.suite('expertise-скиллы');
  t.ok(SK.get('op_expertise_d') && SK.get('op_expertise_d').classChange, 'оператор: Expertise D');
  t.ok(SK.get('eng_expertise_d') && SK.get('eng_expertise_d').expertise === 1, 'инженер: Expertise D');
  t.eq(SK.get('op_expertise_d').levelReq, 20, 'Expertise D с 20 уровня');
};
