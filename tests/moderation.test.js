// ============================================================
//  TESTS / MODERATION.TEST.JS — бан/мут TTL, healthz по lastTickAt.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MR = require(path.join(ROOT, 'shared', 'moderation-rules.js'));

module.exports = function (t) {
  t.suite('moderation-rules: TTL санкций');
  const now = 1_700_000_000_000;
  t.eq(MR.isActive(null, now), true, 'until=null — бессрочный бан');
  t.eq(MR.isActive(0, now), false, 'until=0 — санкции нет');
  t.eq(MR.isActive(now + 1000, now), true, 'until в будущем — действует');
  t.eq(MR.isActive(now - 1, now), false, 'until в прошлом — истекла');
  t.eq(MR.isActive('nope', now), false, 'мусорный until не действует');
  t.eq(MR.untilFromTtl(60, now), now + 60000, 'ttl 60 с → абсолютное время');
  t.eq(MR.untilFromTtl(0, now), null, 'ttl 0 → бессрочно');
  t.eq(MR.untilFromTtl(-5, now), null, 'отрицательный ttl → бессрочно');

  t.suite('moderation-rules: ввод');
  t.eq(MR.sanitizeYid('__proto__'), null, 'prototype-ключ не yid');
  t.eq(MR.sanitizeYid('itest_mod_a'), 'itest_mod_a', 'нормальный yid проходит');
  t.eq(MR.sanitizeReason('<script>').indexOf('<'), 0, 'reason не HTML-escape (это лог, не UI)');
  t.ok(MR.sanitizeReason('x'.repeat(200)).length === MR.REASON_MAX, 'reason режется');
  t.eq(MR.REPORT_COOLDOWN_MS >= 5000, true, 'репорт не чаще чем раз в несколько секунд');

  t.suite('moderation-rules: healthz');
  t.eq(MR.HEALTH_STALE_MS, 1000, 'порог застывшего тика — 1 с');
  t.eq(MR.healthOk(now, now, 1000), true, 'тикнули только что — живы');
  t.eq(MR.healthOk(now, now - 999, 1000), true, 'лаг 999 мс — ещё 200');
  t.eq(MR.healthOk(now, now - 1001, 1000), false, 'лаг 1001 мс — 503');
  t.eq(MR.healthOk(now, null, 1000), false, 'тиков не было — нездоровы');

  t.suite('moderation: сервер сохраняет всех при uncaughtException');
  const srv = require('fs').readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/uncaughtException[\s\S]{0,250}shutdown\s*\(\s*'uncaughtException'/.test(srv),
    'uncaughtException зовёт shutdown, а не только логирует');
  t.ok(/sig === 'uncaughtException' \? 1 : 0/.test(srv),
    'после фатала процесс выходит с кодом 1, чтобы оркестратор перезапустил');
};
