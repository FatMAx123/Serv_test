// ============================================================
//  TESTS / DEATH.TEST.JS — дроп при смерти (PLAN 5.10 / L2 C1).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DR = require(path.join(ROOT, 'shared', 'death-rules.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));

function meta(id) {
  return NPCS.itemMeta(id) || ITEMS.get(id) || (LR.LOOT_ITEMS && LR.LOOT_ITEMS[id]) || null;
}

function seq(vals) {
  let i = 0;
  return function () {
    const v = vals[Math.min(i, vals.length - 1)];
    i++;
    return v;
  };
}

module.exports = function (t) {
  t.suite('death-rules: константы C1/Interlude');
  t.eq(DR.ADENA_ID, 'copper_parts', 'адена = copper_parts');
  t.eq(DR.LUCKY_UNTIL, 4, 'Lucky / newbie floor = 4 (дроп с 5+)');
  t.eq(DR.KARMA_PK_LIMIT, 5, 'KARMA_PK_LIMIT = 5');
  t.eq(DR.PLAYER.rateDrop, 5, 'PLAYER first-roll 5 %');
  t.eq(DR.PLAYER.dropLimit, 3, 'PLAYER limit 3');
  t.eq(DR.KARMA.rateDrop, 40, 'KARMA first-roll 40 %');
  t.eq(DR.KARMA.dropLimit, 10, 'KARMA limit 10');
  t.ok(DR.PLAYER.rateItem > DR.PLAYER.rateEquip && DR.PLAYER.rateEquip > DR.PLAYER.rateWeapon,
    'сумка падает чаще экипа, экип чаще оружия');

  t.suite('death-rules: что не дропается');
  t.ok(!DR.isDropable('copper_parts', meta('copper_parts')), 'адена не дропается');
  t.ok(!DR.isDropable('adena', { type: 'adena' }), 'id adena тоже');
  t.ok(!DR.isDropable('blue_capacitor', meta('blue_capacitor')), 'квест не дропается');
  t.ok(!DR.isDropable('engineer_emitter_low', meta('engineer_emitter_low')), 'резонатор инженера не дропается');
  t.ok(!DR.isDropable('engineer_nano_bracelet', meta('engineer_nano_bracelet')), 'нано-браслет инженера не дропается');
  t.ok(!DR.isDropable('operator_compressor_low', meta('operator_compressor_low')), 'нагнетатель оператора не дропается');
  t.ok(!DR.isDropable('operator_bracers_low', meta('operator_bracers_low')), 'наручи оператора не дропаются');
  t.ok(DR.isDevice('engineer_emitter_low'), 'isDevice: emitter');
  t.ok(DR.isDevice('engineer_nano_bracelet'), 'isDevice: bracelet');
  t.ok(DR.isDevice('operator_compressor_low'), 'isDevice: compressor');
  t.ok(DR.isDevice('operator_bracers_low'), 'isDevice: bracers');
  t.ok(DR.isDropable('synthetic_oil', meta('synthetic_oil')), 'масло в сумке — да');
  t.ok(DR.isDropable('operator_hammer_low', meta('operator_hammer_low')), 'молот — да');
  t.eq(DR.kindOf(meta('operator_hammer_low'), true), 'weapon', 'надетый молот = weapon');
  t.eq(DR.kindOf(meta('worker_overalls'), true), 'equip', 'надетая роба = equip');
  t.eq(DR.kindOf(meta('operator_hammer_low'), false), 'item', 'молот в сумке = item');

  t.suite('death-rules: выбор таблицы');
  const keep4 = DR.luckyUntil({ eng_lucky: 1 }, (id) => SK.get(id), 'engineer');
  t.eq(keep4, 4, 'eng_lucky держит до 4');
  t.eq(DR.luckyUntil({ op_sturdy_frame: 1 }, (id) => SK.get(id), 'operator'), 4,
    'op Lucky (ranks.lucky) тоже до 4');
  t.eq(DR.luckyUntil({}, null, 'operator'), 4, 'пол 4 даже без скилла');

  t.eq(DR.pickTable({ peace: true, level: 10, byMob: true }).reason, 'peace',
    'в деревне вещей нет');
  t.eq(DR.pickTable({ level: 4, byMob: true, keepItemsUntil: 4 }).reason, 'lucky',
    'ур. 4 + Lucky — нет дропа (в т.ч. карма бы не прошла)');
  t.eq(DR.pickTable({ level: 10, byMob: true, keepItemsUntil: 4 }).table, 'player',
    'белая смерть от моба → PLAYER');
  t.eq(DR.pickTable({ level: 10, byPlayer: true, keepItemsUntil: 4 }).reason, 'pvp',
    'белая смерть от игрока — вещей нет');
  t.eq(DR.pickTable({
    level: 10, karma: 200, pk: 5, byPlayer: true, keepItemsUntil: 4
  }).table, 'karma', 'хаотик pk≥5 → KARMA даже в PvP');
  t.eq(DR.pickTable({
    level: 10, karma: 200, pk: 5, byMob: true, keepItemsUntil: 4
  }).table, 'karma', 'KARMA перекрывает PLAYER');
  t.eq(DR.pickTable({
    level: 10, karma: 50, pk: 2, byMob: true, keepItemsUntil: 4
  }).table, 'player', 'карма без pk≥5 — ещё PLAYER (моб)');

  t.suite('death-rules: ролл — полный стак, не 10 %');
  const bag = {
    copper_parts: 9999,
    synthetic_oil: 40,
    blue_capacitor: 3
  };
  const hit = DR.rollDeathDrops(
    { inv: bag, equip: {}, plusById: {}, level: 10, karma: 0, pk: 0 },
    { byMob: true, itemMeta: meta },
    seq([0, 0, 0, 0])
  );
  t.eq(hit.table, 'player', 'force-hit: таблица PLAYER');
  t.ok(hit.dropped.some((d) => d.id === 'synthetic_oil' && d.count === 40),
    'падает весь стак масла, не 10 %',
    JSON.stringify(hit.dropped));
  t.ok(!hit.dropped.some((d) => d.id === 'copper_parts'), 'адена не в кандидатах');
  t.ok(!hit.dropped.some((d) => d.id === 'blue_capacitor'), 'квест не в кандидатах');

  const miss = DR.rollDeathDrops(
    { inv: bag, equip: {}, level: 10 },
    { byMob: true, itemMeta: meta },
    seq([0.99])
  );
  t.eq(miss.dropped.length, 0, 'first-roll мимо — ничего');
  t.eq(miss.reason, 'rate', 'причина rate');

  const pvp = DR.rollDeathDrops(
    { inv: bag, equip: {}, level: 10 },
    { byPlayer: true, itemMeta: meta },
    seq([0, 0, 0])
  );
  t.eq(pvp.dropped.length, 0, 'белый PvP не роняет даже при force rng');
  t.eq(pvp.reason, 'pvp', 'причина pvp');

  t.suite('death-rules: экип и лимит');
  const eq = {
    weapon: { templateId: 'operator_hammer_low', plus: 2 },
    chest: { templateId: 'worker_overalls', plus: 0 }
  };
  const eqHit = DR.rollDeathDrops(
    { inv: { synthetic_oil: 8 }, equip: eq, plusById: { operator_hammer_low: 2 }, level: 12 },
    { byMob: true, itemMeta: meta },
    seq([0, 0, 0, 0, 0])
  );
  t.ok(eqHit.dropped.length >= 1 && eqHit.dropped.length <= DR.PLAYER.dropLimit,
    'лимит PLAYER ≤ 3', 'n=' + eqHit.dropped.length);
  const weap = eqHit.dropped.find((d) => d.kind === 'weapon');
  t.ok(weap && weap.equipped && weap.plus === 2 && weap.count === 1,
    'надетый молот падает целиком с plus',
    weap ? JSON.stringify(weap) : 'нет оружия в дропе (шанс 5 %, но rng=0)');

  const karmaHit = DR.rollDeathDrops(
    { inv: { synthetic_oil: 1, steam_hammer: 1, coal_briquette: 1 }, equip: eq, level: 12, karma: 400, pk: 8 },
    { byPlayer: true, itemMeta: meta },
    seq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  );
  t.eq(karmaHit.table, 'karma', 'хаотик в PvP — KARMA');
  t.ok(karmaHit.dropped.length >= 1, 'KARMA force-hit что-то снял');

  t.suite('death-rules: приборы инженера и оператора никогда не падают при смерти и ПК');
  const allDevicesEquip = {
    necklace: { templateId: 'operator_compressor_low', plus: 5 },
    bracelet: { templateId: 'operator_bracers_low', plus: 5 },
    weapon: { templateId: 'operator_hammer_low', plus: 3 }
  };
  const allDevicesBag = {
    engineer_emitter_low: 1,
    engineer_nano_bracelet: 1,
    synthetic_oil: 10
  };
  const pkAllDrop = DR.rollDeathDrops(
    { inv: allDevicesBag, equip: allDevicesEquip, level: 25, karma: 10000, pk: 20 },
    { byPlayer: true, itemMeta: meta },
    seq([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  );
  t.eq(pkAllDrop.table, 'karma', 'при карме 10000 и 20 ПК — таблица KARMA');
  t.ok(!pkAllDrop.dropped.some((d) => d.id === 'operator_compressor_low'), 'компрессор не упал');
  t.ok(!pkAllDrop.dropped.some((d) => d.id === 'operator_bracers_low'), 'наручи оператора не упали');
  t.ok(!pkAllDrop.dropped.some((d) => d.id === 'engineer_emitter_low'), 'резонатор инженера не упал');
  t.ok(!pkAllDrop.dropped.some((d) => d.id === 'engineer_nano_bracelet'), 'браслет инженера не упал');
  t.ok(pkAllDrop.dropped.some((d) => d.id === 'operator_hammer_low'), 'обычный молот выпал');

  t.suite('death-rules: сервер подключён');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/death-rules\.js'\)/.test(srv), 'server.js требует death-rules');
  t.ok(/DR\.rollDeathDrops/.test(srv), 'штраф смерти зовёт rollDeathDrops');
  t.ok(/byMob/.test(srv) && /byPlayer/.test(srv), 'killer type доходит до ролла');
  t.ok(!/droppedParts/.test(srv) && !/copper_parts \|\| 0\) \* 0\.05/.test(srv),
    'PvP больше не крадёт 5 % адены');
  t.ok(/case 'debug_die'/.test(srv), 'dev debug_die для проверки дропа');
  t.ok(/send\(p, \{ t: 'drop_fail', reason: 'nodrop'/.test(srv), 'server.js блокирует drop_item для персональных приборов');
  t.ok(/send\(p, \{ t: 'destroy_fail', reason: 'nodrop'/.test(srv), 'server.js блокирует destroy_item для персональных приборов');

  t.suite('death-rules: скилл Lucky в каталоге');
  t.eq(SK.get('eng_lucky').deathKeepItemsUntilLevel, 4, 'инженер Lucky = 4');
  t.ok(SK.get('op_sturdy_frame').ranks[0].lucky || SK.get('op_sturdy_frame').deathKeepItemsUntilLevel,
    'операторский Lucky помечен');
};
