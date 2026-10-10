// ============================================================
//  SHARED / BUFF-RULES.JS — слоты, стакинг, диспел (L2 C1).
//
//  C1 EffectList: 20 баффов + 10 дебаффов. Один skillId — refresh.
//  Один abnormal-тип (stackGroup) — выше приоритет вытесняет, равный
//  заменяет. Свободный слот кончился — выпадает самый старый не-sticky.
//  DoT разных id стакаются (как у мобов); один id — refresh.
//  Смерть снимает всё, кроме persistOnDeath. Cancel/диспел — случайные N.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BUFF_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MAX_BUFFS = 20;
  var MAX_DEBUFFS = 10;

  function prune(list, now) {
    now = now || Date.now();
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].until > now) out.push(list[i]);
    }
    return out;
  }

  function inferGroup(e) {
    if (!e) return 'unique:none';
    if (e.stackGroup) return String(e.stackGroup);
    if (e.immortal || e.invulnerable) return 'immortal';
    if (e.kind === 'stun' || e.stun) return 'stun';
    if (e.kind === 'silence' || e.silence) return 'silence';
    if (e.kind === 'slow' || (e.slowMult != null && +e.slowMult < 1)) return 'slow';
    if (e.kind === 'dot' || +e.dps > 0) return 'dot:' + String(e.id || 'dot');
    if (e.kind === 'pdef' || (e.pDefMult != null && +e.pDefMult < 1)) return 'pd_down';
    if (e.kind === 'blind' || e.accFlat) return 'accuracy_down';
    if (e.kind === 'weakness' || (e.atkMult != null && +e.atkMult < 1)) return 'pa_down';
    if (e.attackMult && +e.attackMult !== 1) return 'pa_up';
    if (e.defenseMult && +e.defenseMult !== 1) return 'pd_up';
    if (e.speedMult && +e.speedMult > 1) return 'speed_up';
    if (e.atkSpdMult && +e.atkSpdMult !== 1) return 'attack_time_down';
    if (e.expMult && +e.expMult !== 1) return 'exp_up';
    return 'unique:' + String(e.id || 'fx');
  }

  function inferKind(e) {
    if (!e) return 'buff';
    if (e.kind === 'debuff' || e.debuff) return 'debuff';
    if (e.kind === 'buff') return 'buff';
    if (e.stun || e.silence || e.kind === 'stun' || e.kind === 'silence' ||
        e.kind === 'slow' || e.kind === 'dot' || e.kind === 'pdef' ||
        e.kind === 'blind' || e.kind === 'weakness' || +e.dps > 0 ||
        (e.slowMult != null && +e.slowMult < 1)) {
      return 'debuff';
    }
    return 'buff';
  }

  function normalize(raw, now) {
    now = now || Date.now();
    var e = {};
    var src = raw && typeof raw === 'object' ? raw : {};
    var k;
    for (k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k) && k !== '__proto__' && k !== 'constructor') {
        e[k] = src[k];
      }
    }
    e.id = String(e.id || 'fx').toLowerCase();
    e.until = +e.until || 0;
    e.appliedAt = e.appliedAt != null ? +e.appliedAt : now;
    e.priority = e.priority | 0;
    if (!e.stackGroup) e.stackGroup = inferGroup(e);
    e.kind = inferKind(e);
    e.sticky = !!e.sticky;
    e.persistOnDeath = !!e.persistOnDeath;
    if (e.immortal || e.invulnerable) {
      e.sticky = true;
      if (e.priority < 100) e.priority = 100;
    }
    return e;
  }

  function capFor(kind) {
    return kind === 'debuff' ? MAX_DEBUFFS : MAX_BUFFS;
  }

  function countKind(list, kind) {
    var n = 0;
    for (var i = 0; i < list.length; i++) {
      if ((list[i].kind || 'buff') === kind) n++;
    }
    return n;
  }

  /**
   * Применить эффект. list не мутируется — возвращается новый.
   * @returns {{ok:boolean, reason?:string, list:Array, replaced?:string, dropped:Array, kept?:string}}
   */
  function apply(list, incoming, now) {
    now = now || Date.now();
    var next = prune(list, now);
    var e = normalize(incoming, now);
    if (!(e.until > now)) return { ok: false, reason: 'expired', list: next, dropped: [] };

    var i, old;
    for (i = 0; i < next.length; i++) {
      if (next[i].id === e.id) {
        e.appliedAt = next[i].appliedAt;
        next[i] = e;
        return { ok: true, replaced: e.id, list: next, dropped: [] };
      }
    }

    var g = e.stackGroup;
    if (g.indexOf('unique:') !== 0 && g.indexOf('dot:') !== 0) {
      for (i = 0; i < next.length; i++) {
        if (next[i].stackGroup === g) {
          old = next[i];
          if ((e.priority | 0) < (old.priority | 0)) {
            return { ok: false, reason: 'priority', list: next, dropped: [], kept: old.id };
          }
          next[i] = e;
          return { ok: true, replaced: old.id, list: next, dropped: [old] };
        }
      }
    }

    var dropped = [];
    if (countKind(next, e.kind) >= capFor(e.kind)) {
      var dropIdx = -1;
      var oldest = Infinity;
      for (i = 0; i < next.length; i++) {
        if ((next[i].kind || 'buff') !== e.kind) continue;
        if (next[i].sticky) continue;
        var t = next[i].appliedAt || 0;
        if (t < oldest) { oldest = t; dropIdx = i; }
      }
      if (dropIdx < 0) return { ok: false, reason: 'full', list: next, dropped: [] };
      dropped.push(next[dropIdx]);
      next.splice(dropIdx, 1);
    }
    next.push(e);
    return { ok: true, list: next, dropped: dropped };
  }

  /**
   * Снять до n эффектов. По умолчанию случайные, не-sticky.
   * opts: { kind, n, all, stackGroup, includeSticky, rng, now }
   */
  function dispel(list, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var next = prune(list, now);
    var kind = opts.kind || null;
    var n = opts.all ? next.length : Math.max(0, opts.n == null ? 1 : (opts.n | 0));
    var rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    var removed = [];

    function candidates() {
      var c = [];
      for (var i = 0; i < next.length; i++) {
        var e = next[i];
        if (e.sticky && !opts.includeSticky) continue;
        if (kind && (e.kind || 'buff') !== kind) continue;
        if (opts.stackGroup && e.stackGroup !== opts.stackGroup) continue;
        c.push(i);
      }
      return c;
    }

    while (n > 0) {
      var c = candidates();
      if (!c.length) break;
      var pick = Math.floor(rng() * c.length);
      if (pick >= c.length) pick = c.length - 1;
      if (pick < 0) pick = 0;
      var idx = c[pick];
      removed.push(next[idx]);
      next.splice(idx, 1);
      n--;
    }
    return { list: next, removed: removed };
  }

  function clearDeath(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].persistOnDeath) out.push(list[i]);
    }
    return out;
  }

  function hasKind(list, kind, now) {
    now = now || Date.now();
    if (!Array.isArray(list)) return false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.kind === kind || (kind === 'stun' && e.stun) || (kind === 'silence' && e.silence)) return true;
    }
    return false;
  }

  function untilOf(list, kind, now) {
    now = now || Date.now();
    var best = 0;
    if (!Array.isArray(list)) return 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.kind === kind || (kind === 'stun' && e.stun) || (kind === 'silence' && e.silence)) {
        if (e.until > best) best = e.until;
      }
    }
    return best;
  }

  function slowMult(list, now) {
    now = now || Date.now();
    var m = 1;
    if (!Array.isArray(list)) return 1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.kind === 'slow' || (e.slowMult != null && +e.slowMult < 1)) {
        var sm = e.slowMult != null ? +e.slowMult : 0.6;
        if (sm < m) m = sm;
      }
    }
    if (m < 0.35) m = 0.35;
    return m;
  }

  function foldMult(list, field, now) {
    now = now || Date.now();
    var m = 1;
    if (!Array.isArray(list)) return 1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      var v = +e[field];
      if (v > 0) m *= v;
    }
    return m;
  }

  function pDefMult(list, now) {
    now = now || Date.now();
    var m = 1;
    if (!Array.isArray(list)) return 1;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.pDefMult != null && +e.pDefMult > 0 && +e.pDefMult < 1) m *= +e.pDefMult;
    }
    if (m < 0.5) m = 0.5;
    return m;
  }

  function accFlat(list, now) {
    now = now || Date.now();
    var n = 0;
    if (!Array.isArray(list)) return 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.accFlat) n += +e.accFlat;
    }
    return n;
  }

  function dots(list, now) {
    now = now || Date.now();
    var out = [];
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      if (e.kind === 'dot' || +e.dps > 0) out.push(e);
    }
    return out;
  }

  function publicView(e, now) {
    now = now || Date.now();
    if (!e) return null;
    var until = +e.until || 0;
    var out = {
      id: e.id,
      name: e.name || e.id,
      kind: e.kind || 'buff',
      stackGroup: e.stackGroup,
      until: until,
      duration: Math.max(0, (until - now) / 1000),
      icon: e.icon || e.kind || e.id,
      sticky: !!e.sticky
    };
    if (e.attackMult != null) out.attackMult = e.attackMult;
    if (e.defenseMult != null) out.defenseMult = e.defenseMult;
    if (e.speedMult != null) out.speedMult = e.speedMult;
    if (e.expMult != null) out.expMult = e.expMult;
    if (e.atkSpdMult != null) out.atkSpdMult = e.atkSpdMult;
    if (e.slowMult != null) out.slowMult = e.slowMult;
    if (e.pDefMult != null) out.pDefMult = e.pDefMult;
    if (e.critDamageBoost != null) out.critDamageBoost = e.critDamageBoost;
    if (e.vampiric != null) out.vampiric = e.vampiric;
    if (e.stunResist != null) out.stunResist = e.stunResist;
    if (e.maxEnergyBonus != null) out.maxEnergyBonus = e.maxEnergyBonus;
    if (e.energyRegenMult != null) out.energyRegenMult = e.energyRegenMult;
    if (e.hpRegenFlat != null) out.hpRegenFlat = e.hpRegenFlat;
    if (e.energyRegenFlat != null) out.energyRegenFlat = e.energyRegenFlat;
    if (e.adenaMult != null) out.adenaMult = e.adenaMult;
    if (e.dropMult != null) out.dropMult = e.dropMult;
    if (e.auraId != null) out.auraId = e.auraId;
    return out;
  }

  function foldAdd(list, field, now) {
    now = now || Date.now();
    var n = 0;
    if (!Array.isArray(list)) return 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !(e.until > now)) continue;
      var v = +e[field];
      if (v) n += v;
    }
    return n;
  }

  return {
    MAX_BUFFS: MAX_BUFFS,
    MAX_DEBUFFS: MAX_DEBUFFS,
    prune: prune,
    inferGroup: inferGroup,
    inferKind: inferKind,
    normalize: normalize,
    capFor: capFor,
    apply: apply,
    dispel: dispel,
    clearDeath: clearDeath,
    hasKind: hasKind,
    untilOf: untilOf,
    slowMult: slowMult,
    foldMult: foldMult,
    foldAdd: foldAdd,
    pDefMult: pDefMult,
    accFlat: accFlat,
    dots: dots,
    publicView: publicView
  };
});
