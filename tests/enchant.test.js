// ============================================================
//  TESTS / ENCHANT.TEST.JS — кристаллизация при сломе (PLAN 5.6 / L2 C1).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ER = require(path.join(ROOT, 'shared', 'enchant-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));

module.exports = function (t) {
  t.suite('enchant-rules: NG не кристаллизуется');
  t.eq(G.ENCHANT_SAFE, ER.SAFE, 'safe = 3, как в game-rules');
  t.eq(ER.crystalize(ITEMS.get('operator_hammer_low'), 5), null,
    'стартовый молот NG — 0 кристаллов (C1 NONE)');
  t.eq(ER.crystalId('d'), 'crystal_d', 'D → crystal_d');
  t.eq(ER.crystalId('no_grade'), 'crystal_no_grade', 'NG id на всякий случай есть');

  t.suite('enchant-rules: D из цены');
  const mace = Object.assign({}, ITEMS.get('mace_prayer') || {}, LR.LOOT_ITEMS.mace_prayer || {});
  t.eq(ER.gradeKey(mace.grade), 'd', 'булава D');
  const c3 = ER.crystalize(mace, 3);
  t.ok(c3 && c3.crystalId === 'crystal_d' && c3.count >= 80 && c3.count <= 1400,
    'слом +3 → D-кристаллы в диапазоне C1',
    c3 ? JSON.stringify(c3) : 'null');
  const c6 = ER.crystalize(mace, 6);
  t.ok(c6 && c6.count > c3.count, 'выше +3 — больше кристаллов (надбавка за заточку)',
    c3.count + ' → ' + (c6 && c6.count));

  t.suite('enchant-rules: каталоги проштампованы');
  t.eq(ITEMS.get('operator_hammer_low').crystalCount, 0, 'NG в item-db = 0');
  t.ok(ITEMS.get('mace_prayer').crystalCount > 0, 'D-булава в item-db имеет crystalCount');
  t.ok(LR.LOOT_ITEMS.mace_prayer.crystalCount >= 80, 'loot D-булава считает от цены');
  let dBad = 0, dN = 0;
  Object.keys(LR.LOOT_ITEMS).forEach((id) => {
    const it = LR.LOOT_ITEMS[id];
    if (!it || ER.gradeKey(it.grade) !== 'd') return;
    if (it.type !== 'weapon' && it.type !== 'armor' && it.type !== 'accessory') return;
    dN++;
    if ((it.crystalCount | 0) < 1) dBad++;
  });
  t.ok(dN >= 5, 'в дропе есть D-экип', 'D: ' + dN);
  t.eq(dBad, 0, 'весь D-экип в loot имеет crystalCount ≥ 1');

  t.suite('enchant-rules: сервер отдаёт кристаллы при сломе');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/enchant-rules\.js'\)/.test(srv), 'server.js требует enchant-rules');
  t.ok(/ER\.crystalize/.test(srv) && /enchant_break/.test(srv),
    'слом зовёт crystalize и кладёт кристаллы в пакет');
};
