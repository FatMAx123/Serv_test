// ============================================================
//  TESTS / DUEL.TEST.JS — дуэль 1v1 (PLAN 5.7 / L2 Interlude).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DU = require(path.join(ROOT, 'shared', 'duel-rules.js'));

module.exports = function (t) {
  t.suite('duel-rules: константы Interlude');
  t.eq(DU.RANGE, 50, 'вызов в 50 м (как инвайт группы)');
  t.eq(DU.INVITE_TTL_MS, 30000, 'приглашение 30 с');
  t.eq(DU.DUEL_TTL_MS, 300000, 'бой 5 мин');
  t.eq(DU.loserHp(500), 1, 'проигравший — 1 HP, не труп');

  t.suite('duel-rules: дистанция');
  t.ok(DU.inRange(0, 0, 49, 0), '49 м — в радиусе');
  t.ok(!DU.inRange(0, 0, 51, 0), '51 м — слишком далеко');

  t.suite('duel-rules: canChallenge');
  const a = { pid: 1, x: 0, z: 0, dead: false, flagged: false };
  const b = { pid: 2, x: 10, z: 0, dead: false, flagged: false };
  t.eq(DU.canChallenge(a, a).reason, 'self', 'нельзя вызвать себя');
  t.eq(DU.canChallenge(a, null).reason, 'no_target', 'нет цели');
  t.eq(DU.canChallenge(a, Object.assign({}, b, { dead: true })).reason, 'dead', 'мёртвый');
  t.eq(DU.canChallenge(a, Object.assign({}, b, { flagged: true })).reason, 'flagged', 'в PvP-флаге');
  t.eq(DU.canChallenge(a, Object.assign({}, b, { dueling: true })).reason, 'busy', 'уже в дуэли');
  t.eq(DU.canChallenge(a, Object.assign({}, b, { trading: true })).reason, 'busy', 'в обмене');
  t.eq(DU.canChallenge(a, { pid: 2, x: 80, z: 0 }).reason, 'range', 'далеко');
  t.eq(DU.canChallenge(a, b).ok, true, 'рядом, живые, не в бою — можно');

  t.suite('duel-rules: TTL');
  t.ok(!DU.inviteExpired(1000, 1000 + 10000), 'инвайт свежий');
  t.ok(DU.inviteExpired(1000, 1000 + 31000), 'инвайт просрочен');
  t.ok(!DU.duelExpired(1000, 1000 + 60000), 'бой ещё идёт');
  t.ok(DU.duelExpired(1000, 1000 + 301000), '5 мин — ничья');

  t.suite('duel-rules: сервер подключён');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/require\('\.\.\/shared\/duel-rules\.js'\)/.test(srv), 'server.js требует duel-rules');
  t.ok(/case 'duel_offer'/.test(srv) && /case 'duel_accept'/.test(srv),
    'интенты вызова и согласия');
  t.ok(/areDuelists/.test(srv) && /finishDuel/.test(srv),
    'пара дуэлянтов и финиш без кармы');
  t.ok(/pvpPeaceBlocked/.test(srv), 'мирная зона пускает только дуэлянтов');
};
