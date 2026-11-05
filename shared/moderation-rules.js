// ============================================================
//  SHARED / MODERATION-RULES.JS — бан/мут/репорт: чистые правила.
//  UMD. Сервер хранит санкции по yid с TTL; клиент рисует отказ.
// ============================================================
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var api = factory();
  if (isNode) module.exports = api;
  else root.MOD_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var REASON_MAX = 80;
  var REPORT_MAX = 200;
  var REPORT_COOLDOWN_MS = 15000;
  var HEALTH_STALE_MS = 1000;
  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;

  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  function sanitizeYid(raw) {
    var s = String(raw == null ? '' : raw).slice(0, 64);
    if (!s || isBadKey(s)) return null;
    return s;
  }

  function sanitizeReason(raw) {
    var s = String(raw == null ? '' : raw).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    s = s.slice(0, REASON_MAX);
    return s;
  }

  /**
   * until === null → бессрочно.
   * until <= 0 или мусор → не действует.
   * until > now → действует.
   */
  function isActive(until, now) {
    now = now != null ? now : Date.now();
    if (until == null) return true;
    var n = +until;
    if (!Number.isFinite(n) || n <= 0) return false;
    return n > now;
  }

  function untilFromTtl(ttlSec, now) {
    now = now != null ? now : Date.now();
    var n = Math.floor(+ttlSec);
    if (!Number.isFinite(n) || n <= 0) return null;
    return now + n * 1000;
  }

  function healthOk(now, lastTickAt, staleMs) {
    var lim = staleMs != null ? staleMs : HEALTH_STALE_MS;
    if (lastTickAt == null) return false;
    return (now - lastTickAt) <= lim;
  }

  return {
    REASON_MAX: REASON_MAX,
    REPORT_MAX: REPORT_MAX,
    REPORT_COOLDOWN_MS: REPORT_COOLDOWN_MS,
    HEALTH_STALE_MS: HEALTH_STALE_MS,
    sanitizeYid: sanitizeYid,
    sanitizeReason: sanitizeReason,
    isActive: isActive,
    untilFromTtl: untilFromTtl,
    healthOk: healthOk,
    isBadKey: isBadKey
  };
});
