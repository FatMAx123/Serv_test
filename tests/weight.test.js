// ============================================================
//  TESTS / WEIGHT.TEST.JS — лимит нагрузки L2 C1 (PLAN 5.2).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WR = require(path.join(ROOT, 'shared', 'weight-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));

module.exports = function (t) {
  t.suite('weight-rules: дефолты');
  t.eq(WR.itemWeight(ITEMS.get('operator_hammer_low')), 1200, '1H молот ≈ 1200');
  t.eq(WR.itemWeight(ITEMS.get('steam_hammer')), 2000, '2H молот ≈ 2000');
  t.eq(WR.itemWeight(ITEMS.get('pneumatic_rifle')), 2000, 'ружьё (bow) как 2H');
  t.ok(WR.itemWeight(ITEMS.get('worker_overalls')) > 0, 'роба грудь имеет вес');
  t.eq(WR.stackWeight({ type: 'adena', id: 'copper_parts' }, 99, 'copper_parts'), 0,
    '99 адены — 0 веса');
  t.eq(WR.stackWeight({ type: 'adena', id: 'copper_parts' }, 100, 'copper_parts'), 1,
    '100 адены = 1 вес');
  t.eq(WR.stackWeight({ type: 'adena', id: 'copper_parts' }, 100000, 'copper_parts'), 1000,
    '100k адены = 1000');
  t.eq(WR.itemWeight({ type: 'quest', id: 'q_flag' }), 0, 'квестовые не весят');
  t.eq(WR.itemWeight({ type: 'consumable', id: 'soulshot_no_grade', shotKind: 'ss' }), 4,
    'соулшот 4 (C1)');

  t.suite('weight-rules: MaxLoad из CON (aCis ×69000)');
  const opLoad = WR.maxLoad(43);
  t.ok(opLoad > 100000 && opLoad < 120000, 'оператор CON43 ≈ 108k', 'max=' + opLoad);
  const engLoad = WR.maxLoad(27);
  t.ok(engLoad > 60000 && engLoad < 75000, 'инженер CON27 ≈ 67k', 'max=' + engLoad);
  t.ok(opLoad > engLoad, 'больше CON — больше предел');

  t.suite('weight-rules: пороги');
  const max = 1000;
  t.ok(!WR.penalty(600, max).noRegen, '60% — реген идёт');
  t.ok(WR.penalty(667, max).noRegen, '66.7% — реген стоп');
  t.eq(WR.penalty(799, max).speedMult, 1, '79% — бег');
  t.eq(WR.penalty(800, max).speedMult, 0.5, '80% — шаг');
  t.ok(WR.penalty(1000, max).canAttack, 'ровно 100% — ещё можно бить (aCis > max)');
  t.ok(!WR.penalty(1001, max).canAttack && WR.penalty(1001, max).overloaded,
    'сверх капа — нельзя атаковать');
  t.eq(WR.canAdd({ copper_parts: 0 }, {}, 'copper_parts', 100000, 43, function () {
    return { type: 'adena', id: 'copper_parts' };
  }).ok, true, '100k адены влезают в CON43');

  t.suite('weight-rules: каталоги проштампованы');
  t.ok(ITEMS.get('operator_hammer_low').weight === 1200, 'item-db штамп');
  t.ok((LR.LOOT_ITEMS.copper_parts.weight | 0) === 0, 'адена weight 0, считается /100');
  let missing = 0, nLoot = 0;
  Object.keys(LR.LOOT_ITEMS).forEach((id) => {
    const it = LR.LOOT_ITEMS[id];
    if (!it) return;
    nLoot++;
    if (it.weight == null) missing++;
  });
  t.eq(missing, 0, 'у всех loot-предметов есть weight', 'позиций: ' + nLoot);
  t.ok(nLoot >= 100, 'каталог не пуст');

  t.suite('weight-rules: сервер считает нагрузку');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/weight-rules\.js'\)/.test(srv), 'server.js требует weight-rules');
  t.ok(/function playerWeightState/.test(srv) && /WR\.totalLoad/.test(srv),
    'нагрузка = сумка + экип');
  t.ok(/noRegen/.test(srv) && /canAttack/.test(srv), 'пороги регена и атаки на сервере');
  t.ok(/case 'debug_give'/.test(srv), 'dev-выдача для тестов перегруза');
};
