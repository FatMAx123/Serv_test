// ============================================================
//  SHARED / DUEL-RULES.JS — дуэль 1v1 (классические правила, границы 1–20).
//
//  В ранних хрониках дуэли не было: любой удар в городе — карма.
//  Механика дуэли: согласие обеих сторон, бой даже в мирной зоне, без
//  кармы, PK и дропа вещей. Осады и олимпиада — вне скоупа.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DUEL_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** Вызов — в радиусе инвайта группы / обмена (50 м). */
  var RANGE = 50;
  var RANGE2 = RANGE * RANGE;
  /** Диалог «принять» не висит вечно. */
  var INVITE_TTL_MS = 30000;
  /** Лимит боя: 5 мин, иначе ничья. */
  var DUEL_TTL_MS = 300000;
  /** Проигравший не труп: 1 HP на месте (без штрафа EXP/вещей). */
  var LOSER_HP_MIN = 1;

  function inRange(ax, az, bx, bz) {
    var dx = (+ax || 0) - (+bx || 0);
    var dz = (+az || 0) - (+bz || 0);
    return (dx * dx + dz * dz) <= RANGE2;
  }

  function inviteExpired(at, now) {
    now = now || Date.now();
    return !at || (now - at) > INVITE_TTL_MS;
  }

  function duelExpired(at, now) {
    now = now || Date.now();
    return !at || (now - at) > DUEL_TTL_MS;
  }

  /**
   * Можно ли вызвать. Поля a/b: pid, dead, flagged, dueling, trading, storing, x, z.
   * @returns {{ok:boolean, reason?:string}}
   */
  function canChallenge(a, b) {
    if (!a || !b) return { ok: false, reason: 'no_target' };
    if (a.pid === b.pid) return { ok: false, reason: 'self' };
    if (a.dead || b.dead) return { ok: false, reason: 'dead' };
    if (a.flagged || b.flagged) return { ok: false, reason: 'flagged' };
    if (a.dueling || b.dueling) return { ok: false, reason: 'busy' };
    if (a.trading || b.trading) return { ok: false, reason: 'busy' };
    if (a.storing || b.storing) return { ok: false, reason: 'busy' };
    if (!inRange(a.x, a.z, b.x, b.z)) return { ok: false, reason: 'range' };
    return { ok: true };
  }

  function loserHp(maxHp) {
    var m = Math.max(1, maxHp | 0);
    return Math.max(LOSER_HP_MIN, 1);
  }

  return {
    RANGE: RANGE,
    RANGE2: RANGE2,
    INVITE_TTL_MS: INVITE_TTL_MS,
    DUEL_TTL_MS: DUEL_TTL_MS,
    LOSER_HP_MIN: LOSER_HP_MIN,
    inRange: inRange,
    inviteExpired: inviteExpired,
    duelExpired: duelExpired,
    canChallenge: canChallenge,
    loserHp: loserHp
  };
});
