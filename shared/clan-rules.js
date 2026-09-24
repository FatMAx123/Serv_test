// ============================================================
//  SHARED / CLAN-RULES.JS — клан 1–20: создание, ранги, ёмкость,
//  клан-склад, крест. UMD: сервер = require, клиент = <script>.
//
//  ЗАЧЕМ: членство нельзя держать только в профиле игрока — правка чужого
//  файла на диске рассинхронизирует состав, как только двое онлайн.
//  Источник истины — запись клана. Здесь чистые правила, по которым сервер
//  отказывает, а клиент гасит недоступные кнопки.
//
//  Осады и клан-войны — вне границ 1–20 (PLAN 2.5).
// ============================================================
(function (root, factory) {
  var isNode = (typeof module !== 'undefined' && module.exports);
  var api = factory();
  if (isNode) module.exports = api;
  else { root.CLAN_RULES = api; root.CLAN = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /** L2 Classic: создание клана с 10 уровня. */
  var CREATE_LEVEL = 10;
  /**
   * Плата за создание (в Project Steam: 30 000 медных деталей); островная экономика на 2–3
   * порядка меньше (телепорт 300–800, склад 30), поэтому 5 000⚙️ — тот же
   * порядок, что пачка телепортов, а не недостижимый кап.
   */
  var CREATE_COST = 5000;
  /** Уровни клана в границах 1–20. Выше — замок и осады, их нет. */
  var MAX_CLAN_LEVEL = 3;
  /** Потолок состава по уровню клана: 0→10, 1→15, 2→20, 3→30. */
  var MEMBER_CAPS = [10, 15, 20, 30];
  /** Репутация на повышение 0→1, 1→2, 2→3. */
  var LEVELUP_REP = [0, 200, 600, 1500];
  /** Плата ⚙️ на повышение. */
  var LEVELUP_COST = [0, 2000, 5000, 10000];
  /** Репутация клану, когда член повышает уровень персонажа. */
  var REP_PER_CHAR_LEVEL = 10;
  /** Клан-склад: база как личный (80) + 20 за уровень клана. */
  var WH_SLOTS_BASE = 80;
  var WH_SLOTS_PER_LEVEL = 20;
  /** Крест: L2 C1 16×12, альянсный ряд 24×12. Только эти два размера. */
  var CREST_SIZES = { '16x12': 1, '24x12': 1 };
  var CREST_MAX_BYTES = 24 * 12 * 4;
  var NAME_MIN = 3;
  var NAME_MAX = 16;
  var NAME_RE = /^[\w\u0400-\u04FF\- ]+$/;
  var RANK_POWER = { leader: 3, officer: 2, member: 1 };
  var BAD_KEY_RE = /^(?:__proto__|constructor|prototype)$/;

  function isBadKey(k) { return BAD_KEY_RE.test(String(k)); }

  function rankPower(rank) {
    return RANK_POWER[rank] || 0;
  }

  function memberCap(level) {
    var lv = Math.max(0, Math.min(MAX_CLAN_LEVEL, level | 0));
    return MEMBER_CAPS[lv];
  }

  function whSlots(level) {
    var lv = Math.max(0, Math.min(MAX_CLAN_LEVEL, level | 0));
    return WH_SLOTS_BASE + WH_SLOTS_PER_LEVEL * lv;
  }

  function sanitizeClanName(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028-\u202f\u3000]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
    if (s.length < NAME_MIN) return null;
    if (!NAME_RE.test(s)) return null;
    return s;
  }

  function canCreate(level, currency, alreadyInClan) {
    if (alreadyInClan) return { ok: false, reason: 'already' };
    if ((level | 0) < CREATE_LEVEL) return { ok: false, reason: 'level', need: CREATE_LEVEL };
    if ((currency | 0) < CREATE_COST) return { ok: false, reason: 'funds', need: CREATE_COST };
    return { ok: true, reason: '', cost: CREATE_COST };
  }

  function canInvite(actorRank, memberCount, clanLevel) {
    if (rankPower(actorRank) < rankPower('officer')) return { ok: false, reason: 'rank' };
    var cap = memberCap(clanLevel);
    if ((memberCount | 0) >= cap) return { ok: false, reason: 'full', cap: cap };
    return { ok: true, reason: '' };
  }

  function canKick(actorRank, targetRank) {
    if (rankPower(actorRank) < rankPower('officer')) return { ok: false, reason: 'rank' };
    if (rankPower(actorRank) <= rankPower(targetRank)) return { ok: false, reason: 'rank' };
    return { ok: true, reason: '' };
  }

  function canLeave(rank, memberCount) {
    if (rank === 'leader' && (memberCount | 0) > 1) return { ok: false, reason: 'leader' };
    return { ok: true, reason: '' };
  }

  function canDisband(rank) {
    return rank === 'leader' ? { ok: true, reason: '' } : { ok: false, reason: 'rank' };
  }

  function canSetCrest(rank) {
    return rank === 'leader' ? { ok: true, reason: '' } : { ok: false, reason: 'rank' };
  }

  function canPromote(actorRank, targetRank, nextRank) {
    if (actorRank !== 'leader') return { ok: false, reason: 'rank' };
    if (targetRank === 'leader') return { ok: false, reason: 'leader' };
    if (nextRank !== 'officer' && nextRank !== 'member') return { ok: false, reason: 'args' };
    return { ok: true, reason: '' };
  }

  function canTransferLeader(actorRank) {
    return actorRank === 'leader' ? { ok: true, reason: '' } : { ok: false, reason: 'rank' };
  }

  function canWhTake(actorRank) {
    if (rankPower(actorRank) < rankPower('officer')) return { ok: false, reason: 'rank' };
    return { ok: true, reason: '' };
  }

  function canLevelUp(actorRank, clanLevel, reputation, currency) {
    if (actorRank !== 'leader') return { ok: false, reason: 'rank' };
    var lv = clanLevel | 0;
    if (lv >= MAX_CLAN_LEVEL) return { ok: false, reason: 'max' };
    var next = lv + 1;
    var needRep = LEVELUP_REP[next] | 0;
    var needCur = LEVELUP_COST[next] | 0;
    if ((reputation | 0) < needRep) return { ok: false, reason: 'rep', need: needRep };
    if ((currency | 0) < needCur) return { ok: false, reason: 'funds', need: needCur };
    return { ok: true, reason: '', cost: needCur, rep: needRep, next: next };
  }

  function fnv1aHex(bytes) {
    var h = 2166136261;
    for (var i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 16777619);
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  function b64ToBytes(s) {
    if (typeof s !== 'string') return null;
    var t = s.replace(/\s+/g, '');
    if (!t || t.length > 4096) return null;
    try {
      if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function' &&
          typeof window === 'undefined') {
        return Buffer.from(t, 'base64');
      }
      if (typeof atob === 'function') {
        var bin = atob(t);
        var u = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        return u;
      }
    } catch (e) { return null; }
    return null;
  }

  function bytesToB64(bytes) {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function' &&
        typeof window === 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  /**
   * Крест — только сырые RGBA пиксели, не PNG и не data-URL.
   * Иначе это канал произвольных данных в AOI, как было с appearance.
   * @returns {{ok:true, w:number, h:number, rgba:string, hash:string}|{ok:false, reason:string}}
   */
  function normalizeCrest(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'args' };
    var w = raw.w | 0, h = raw.h | 0;
    if (!CREST_SIZES[w + 'x' + h]) return { ok: false, reason: 'size' };
    var bytes = b64ToBytes(raw.rgba || raw.data || '');
    if (!bytes) return { ok: false, reason: 'args' };
    if (bytes.length !== w * h * 4) return { ok: false, reason: 'size' };
    if (bytes.length > CREST_MAX_BYTES) return { ok: false, reason: 'size' };
    var clean = bytesToB64(bytes);
    return { ok: true, w: w, h: h, rgba: clean, hash: fnv1aHex(bytes) };
  }

  function publicCrest(crest) {
    if (!crest || !crest.ok && !(crest.w && crest.rgba)) return null;
    return { w: crest.w | 0, h: crest.h | 0, rgba: String(crest.rgba || ''), hash: String(crest.hash || '') };
  }

  return {
    CREATE_LEVEL: CREATE_LEVEL,
    CREATE_COST: CREATE_COST,
    MAX_CLAN_LEVEL: MAX_CLAN_LEVEL,
    MEMBER_CAPS: MEMBER_CAPS,
    LEVELUP_REP: LEVELUP_REP,
    LEVELUP_COST: LEVELUP_COST,
    REP_PER_CHAR_LEVEL: REP_PER_CHAR_LEVEL,
    WH_SLOTS_BASE: WH_SLOTS_BASE,
    WH_SLOTS_PER_LEVEL: WH_SLOTS_PER_LEVEL,
    CREST_MAX_BYTES: CREST_MAX_BYTES,
    NAME_MIN: NAME_MIN,
    NAME_MAX: NAME_MAX,
    rankPower: rankPower,
    memberCap: memberCap,
    whSlots: whSlots,
    sanitizeClanName: sanitizeClanName,
    canCreate: canCreate,
    canInvite: canInvite,
    canKick: canKick,
    canLeave: canLeave,
    canDisband: canDisband,
    canSetCrest: canSetCrest,
    canPromote: canPromote,
    canTransferLeader: canTransferLeader,
    canWhTake: canWhTake,
    canLevelUp: canLevelUp,
    normalizeCrest: normalizeCrest,
    publicCrest: publicCrest,
    fnv1aHex: fnv1aHex
  };
});
