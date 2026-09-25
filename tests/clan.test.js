// ============================================================
//  TESTS / CLAN.TEST.JS — правила клана 1–20.
//  Регресс, который тут закрывается: членство в профиле игрока расходится
//  между членами; крест без лимита размера — канал произвольных данных в AOI.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CL = require(path.join(ROOT, 'shared', 'clan-rules.js'));

function rgbaB64(w, h, fill) {
  const n = w * h * 4;
  const buf = Buffer.alloc(n, fill == null ? 0 : fill);
  return buf.toString('base64');
}

module.exports = function (t) {
  t.suite('clan-rules: создание');
  t.eq(CL.CREATE_LEVEL, 10, 'создание с 10 уровня (L2 Classic)');
  t.ok(CL.CREATE_COST > 0, 'создание платное — money sink', CL.CREATE_COST + '⚙️');
  t.eq(CL.canCreate(9, 999999, false).reason, 'level', '9 уровень — рано');
  t.eq(CL.canCreate(10, CL.CREATE_COST - 1, false).reason, 'funds', 'без ⚙️ не создать');
  t.eq(CL.canCreate(10, CL.CREATE_COST, true).reason, 'already', 'уже в клане — нельзя');
  t.eq(CL.canCreate(10, CL.CREATE_COST, false).ok, true, '10 ур. и плата — можно');

  t.suite('clan-rules: имя');
  t.eq(CL.sanitizeClanName('Iron Coil'), 'Iron Coil', 'пробел в имени допустим');
  t.eq(CL.sanitizeClanName('Ж'), null, 'короче 3 букв — отказ');
  t.eq(CL.sanitizeClanName('<script>'), null, 'HTML в имени отбит');
  t.eq(CL.sanitizeClanName('x'.repeat(40)).length, CL.NAME_MAX, 'имя режется до капа');
  t.eq(CL.sanitizeClanName('__proto__'), '__proto__', 'строка-имя не ключ объекта');

  t.suite('clan-rules: состав и склад');
  t.eq(CL.memberCap(0), 10, 'уровень 0 — 10 человек');
  t.eq(CL.memberCap(3), 30, 'уровень 3 — 30 человек');
  t.eq(CL.memberCap(99), 30, 'выше капа — зажим');
  t.eq(CL.whSlots(0), 80, 'клан-склад 0 ур. = личный склад');
  t.eq(CL.whSlots(3), 140, 'клан-склад растёт с уровнем клана');
  t.eq(CL.canInvite('member', 1, 0).reason, 'rank', 'рядовой не приглашает');
  t.eq(CL.canInvite('officer', 10, 0).reason, 'full', 'полный клан 0 ур. не принимает');
  t.eq(CL.canInvite('leader', 9, 0).ok, true, 'лидер приглашает, пока есть место');
  t.eq(CL.canKick('officer', 'member').ok, true, 'офицер может исключить рядового');
  t.eq(CL.canKick('officer', 'leader').reason, 'rank', 'офицер не исключает лидера');
  t.eq(CL.canKick('member', 'member').reason, 'rank', 'рядовой не исключает');
  t.eq(CL.canLeave('leader', 3).reason, 'leader', 'лидер с составом не уходит — передай или распусти');
  t.eq(CL.canLeave('leader', 1).ok, true, 'последний лидер может уйти (клан распускается)');
  t.eq(CL.canLeave('member', 5).ok, true, 'рядовой уходит свободно');
  t.eq(CL.canDisband('leader').ok, true, 'распуск — лидер');
  t.eq(CL.canDisband('officer').reason, 'rank', 'офицер не распускает');
  t.eq(CL.canWhTake('member').reason, 'rank', 'рядовой не может забирать с клан-склада');
  t.eq(CL.canWhTake('officer').ok, true, 'офицер может забирать с клан-склада');
  t.eq(CL.canWhTake('leader').ok, true, 'лидер может забирать с клан-склада');

  t.suite('clan-rules: уровень и репутация');
  t.eq(CL.canLevelUp('member', 0, 9999, 9999).reason, 'rank', 'уровень клана поднимает лидер');
  t.eq(CL.canLevelUp('leader', 3, 9999, 9999).reason, 'max', 'кап уровня клана в границах 1–20');
  t.eq(CL.canLevelUp('leader', 0, 0, 9999).reason, 'rep', 'без репутации не поднять');
  t.eq(CL.canLevelUp('leader', 0, CL.LEVELUP_REP[1], 0).reason, 'funds', 'репутации мало без ⚙️');
  t.eq(CL.canLevelUp('leader', 0, CL.LEVELUP_REP[1], CL.LEVELUP_COST[1]).ok, true,
    '0→1 при репутации и плате');
  t.eq(CL.REP_PER_CHAR_LEVEL, 10, 'уровень персонажа даёт клану репутацию');

  t.suite('clan-rules: крест');
  const ok16 = CL.normalizeCrest({ w: 16, h: 12, rgba: rgbaB64(16, 12, 255) });
  t.ok(ok16.ok && ok16.w === 16 && ok16.h === 12 && ok16.hash, '16×12 RGBA принимается');
  const ok24 = CL.normalizeCrest({ w: 24, h: 12, rgba: rgbaB64(24, 12, 1) });
  t.ok(ok24.ok && ok24.hash !== ok16.hash, '24×12 принимается и хеш другой');
  t.eq(CL.normalizeCrest({ w: 8, h: 8, rgba: rgbaB64(8, 8, 0) }).reason, 'size',
    'произвольный размер отбит — иначе канал данных в AOI');
  t.eq(CL.normalizeCrest({ w: 16, h: 12, rgba: rgbaB64(16, 11, 0) }).reason, 'size',
    'длина буфера должна совпасть с w×h×4');
  t.ok(!CL.normalizeCrest({ w: 16, h: 12, rgba: '%%%' }).ok, 'мусорный base64 отбит');
  t.eq(CL.normalizeCrest(null).reason, 'args', 'null → отказ');
  t.eq(CL.normalizeCrest({ w: 16, h: 12, rgba: ok16.rgba }).hash, ok16.hash,
    'хеш стабилен (кэш клиента по нему)');
};
