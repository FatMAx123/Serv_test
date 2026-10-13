// ============================================================
//  SHARED / GRADE-RULES.JS — levelReq по грейду + штраф Expertise (L2 C1).
//
//  В L2 надеть вещь выше своей экспертизы можно, но бьёшь «как сквозь патоку»:
//  −точность, −Atk.Spd, −Cast.Spd. Гейт уровня (D с 20) — отдельный жёсткий
//  порог: до 20 D-грейд даже не надевается.
//
//  Expertise D выдаётся при 1-й профессии (tier ≥ 1), не просто за 20 уровень.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GRADE_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var RANK = { no_grade: 0, ng: 0, d: 1, c: 2, b: 3, a: 4, s: 5 };
  var LEVEL_REQ = { no_grade: 1, d: 20, c: 40, b: 52, a: 61, s: 76 };
  var ACC_PER_GAP = 16;
  var ATKSPD_PER_WEAPON_GAP = 0.16;
  var ATKSPD_PER_ARMOR_GAP = 0.10;
  var CASTSPD_PER_ARMOR_GAP = 0.16;
  var ATKSPD_FLOOR = 0.40;
  var EXPERTISE_SKILLS = {
    1: ['op_expertise_d', 'eng_expertise_d', 'op_expertise', 'eng_expertise'],
    2: ['op_expertise_c', 'eng_expertise_c'],
    3: ['op_expertise_b', 'eng_expertise_b'],
    4: ['op_expertise_a', 'eng_expertise_a'],
    5: ['op_expertise_s', 'eng_expertise_s']
  };

  function normalize(g) {
    if (g == null || g === '') return 'no_grade';
    var s = String(g).toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_');
    if (s === 'none' || s === 'ng' || s === 'no' || s === 'nograde' || s === 'no_grade' || s === 'n') {
      return 'no_grade';
    }
    if (s === 'd' || s === 'c' || s === 'b' || s === 'a' || s === 's') return s;
    if (s.indexOf('no_grade') >= 0) return 'no_grade';
    return 'no_grade';
  }

  function rank(g) {
    var n = normalize(g);
    return RANK[n] != null ? RANK[n] : 0;
  }

  function levelReqForGrade(g) {
    var n = normalize(g);
    return LEVEL_REQ[n] != null ? LEVEL_REQ[n] : 1;
  }

  function itemLevelReq(item) {
    if (!item || typeof item !== 'object') return 1;
    if (item.levelReq != null && item.levelReq !== '') {
      var n = Math.floor(+item.levelReq);
      return n > 0 ? n : 1;
    }
    return levelReqForGrade(item.grade);
  }

  function stampLevelReq(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.levelReq == null) item.levelReq = levelReqForGrade(item.grade);
    return item;
  }

  function stampMap(map) {
    if (!map || typeof map !== 'object') return 0;
    var n = 0;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var it = map[keys[i]];
      if (!it || typeof it !== 'object') continue;
      if (it.levelReq == null) {
        it.levelReq = levelReqForGrade(it.grade);
        n++;
      }
    }
    return n;
  }

  function expertiseRank(skills) {
    var best = 0;
    if (!skills || typeof skills !== 'object') return 0;
    var id, r, list, j;
    for (r = 5; r >= 1; r--) {
      list = EXPERTISE_SKILLS[r];
      if (!list) continue;
      for (j = 0; j < list.length; j++) {
        id = list[j];
        if ((skills[id] | 0) >= 1) return r;
      }
    }
    for (id of Object.keys(skills)) {
      if ((skills[id] | 0) < 1) continue;
      if (/expertise_s/.test(id)) best = Math.max(best, 5);
      else if (/expertise_a/.test(id)) best = Math.max(best, 4);
      else if (/expertise_b/.test(id)) best = Math.max(best, 3);
      else if (/expertise_c/.test(id)) best = Math.max(best, 2);
      else if (/expertise/.test(id)) best = Math.max(best, 1);
    }
    return best;
  }

  function expertiseSkillId(rootClass) {
    return rootClass === 'engineer' ? 'eng_expertise_d' : 'op_expertise_d';
  }

  function penalty(expRank, weaponGrade, armorGrade) {
    var er = Math.max(0, expRank | 0);
    var wg = rank(weaponGrade);
    var ag = rank(armorGrade);
    var wGap = Math.max(0, wg - er);
    var aGap = Math.max(0, ag - er);
    var atkSpdMult = (1 - ATKSPD_PER_WEAPON_GAP * wGap) * (1 - ATKSPD_PER_ARMOR_GAP * aGap);
    if (atkSpdMult < ATKSPD_FLOOR) atkSpdMult = ATKSPD_FLOOR;
    var castSpdMult = 1 - CASTSPD_PER_ARMOR_GAP * aGap;
    if (castSpdMult < ATKSPD_FLOOR) castSpdMult = ATKSPD_FLOOR;
    return {
      expertise: er,
      weaponRank: wg,
      armorRank: ag,
      weaponGap: wGap,
      armorGap: aGap,
      accuracy: -(ACC_PER_GAP * wGap),
      atkSpdMult: atkSpdMult,
      castSpdMult: castSpdMult,
      active: (wGap > 0 || aGap > 0)
    };
  }

  return {
    RANK: RANK,
    LEVEL_REQ: LEVEL_REQ,
    ACC_PER_GAP: ACC_PER_GAP,
    normalize: normalize,
    rank: rank,
    levelReqForGrade: levelReqForGrade,
    itemLevelReq: itemLevelReq,
    stampLevelReq: stampLevelReq,
    stampMap: stampMap,
    expertiseRank: expertiseRank,
    expertiseSkillId: expertiseSkillId,
    penalty: penalty
  };
});
