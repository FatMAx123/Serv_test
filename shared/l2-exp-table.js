// SHARED / L2-EXP-TABLE.JS
// Таблица EXP классических хроник C1 (уровни 1–40).
// Источник: стандартная таблица C1:
//   ExpToNext[level] = опыт, нужный НА этом уровне, чтобы получить level+1.
// SP: SP начисляется с мобов (не % от level-up). Здесь:
//   - spFromKill(expGained, mobLevel) ≈ C1-like доля
//   - skillSpCost — стоимость изучения/ранга (шкала C1 1–40)
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.L2_EXP_TABLE = api; root.EXP_TABLE = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /**
   * Exp needed while at level N to reach N+1.
   * Index = level (1..40). Level 40 = cap (0 more for our content).
   * Values: Canonical C1 table «Exp to 100%».
   */
  var EXP_TO_NEXT = {
    1: 68,
    2: 296,
    3: 805,
    4: 1716,
    5: 3154,
    6: 5249,
    7: 8136,
    8: 11955,
    9: 16851,
    10: 22973,
    11: 30475,
    12: 39516,
    13: 50261,
    14: 62876,
    15: 77537,
    16: 94421,
    17: 113712,
    18: 135596,
    19: 160267,
    20: 187921,
    21: 218762,
    22: 252997,
    23: 290836,
    24: 332497,
    25: 378201,
    26: 428173,
    27: 482647,
    28: 541857,
    29: 606042,
    30: 675450,
    31: 750330,
    32: 830937,
    33: 917531,
    34: 1010378,
    35: 1109744,
    36: 1215906,
    37: 1329143,
    38: 1449736,
    39: 1577978,
    40: 0 // cap 40 в Project Steam
  };

  /** Cumulative EXP to REACH level N (level 1 = 0). */
  var CUMULATIVE = (function () {
    var c = { 1: 0 };
    var sum = 0;
    for (var lv = 1; lv < 40; lv++) {
      sum += EXP_TO_NEXT[lv] || 0;
      c[lv + 1] = sum;
    }
    return c;
  })();

  // Phase 1 content cap: open world 1–20 + 1st class transfer @20.
  // FUTURE: raise to 40 for 2nd class (C/B gear, dungeons 20–40).
  var MAX_LEVEL = 20;

  function expToNext(level) {
    var lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    if (lv >= MAX_LEVEL) return 0;
    return EXP_TO_NEXT[lv] || 0;
  }

  /**
   * Exp-to-next for death penalty (ignores content cap zeroing).
   * At max content level still uses table value so delevel can fire.
   */
  function expToNextRaw(level) {
    var lv = Math.max(1, Math.min(40, level | 0));
    var v = EXP_TO_NEXT[lv];
    if (v != null && v > 0) return v;
    // fallback: last positive below
    for (var i = lv - 1; i >= 1; i--) {
      if (EXP_TO_NEXT[i] > 0) return EXP_TO_NEXT[i];
    }
    return 0;
  }

  function cumulativeExp(level) {
    var lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
    return CUMULATIVE[lv] != null ? CUMULATIVE[lv] : 0;
  }

  /**
   * L2 death EXP: lose pct of current level's expToNext; if bar insufficient → delevel.
   * @param {number} level
   * @param {number} exp - progress on current level bar (0..expToNext)
   * @param {number} [pct=0.04] - C1 default 4%
   * @returns {{ level, exp, loss, delevels, expToNext }}
   */
  function applyDeathExpLoss(level, exp, pct) {
    var lv = Math.max(1, level | 0);
    var bar = Math.max(0, Math.floor(+exp || 0));
    var rate = pct != null ? +pct : 0.04;
    if (!(rate > 0)) rate = 0.04;
    // Loss is computed once from the level you died at (L2: % of that level's curve)
    var need = expToNextRaw(lv);
    var loss = Math.floor(need * rate);
    if (loss <= 0) {
      return { level: lv, exp: bar, loss: 0, delevels: 0, expToNext: expToNext(lv) };
    }

    var rem = loss;
    var delevels = 0;
    // Cap delevels to avoid pathological loops
    var guard = 80;
    while (rem > 0 && guard-- > 0) {
      if (lv <= 1) {
        bar = Math.max(0, bar - rem);
        rem = 0;
        break;
      }
      if (bar >= rem) {
        bar -= rem;
        rem = 0;
        break;
      }
      // Not enough on bar → drop a level, land on full previous bar, keep subtracting
      rem -= bar;
      lv -= 1;
      delevels += 1;
      bar = expToNextRaw(lv); // full bar of the new (lower) level
    }

    // Never below 1 / never negative exp
    if (lv < 1) lv = 1;
    if (bar < 0) bar = 0;

    return {
      level: lv,
      exp: bar,
      loss: loss,
      delevels: delevels,
      expToNext: expToNext(lv)
    };
  }

  /**
   * SP с убийства (hp_mp_sp_exp_formulas.md):
   * ≈ 1 SP на 20–37 EXP (среднее ~1/28 ≈ 0.036). Жёсткой формулы в коде L2 нет.
   * Низкие уровни чуть щедрее (~1/24), высокие ~1/32.
   */
  /**
   * L2 Classic party EXP bonus on the pot before level-split.
   * 1 + 0.10×(n−1), cap 9 человек (×1.80). Соло = 1.00.
   */
  function partyExpBonus(n) {
    var k = Math.max(1, Math.min(9, n | 0));
    return +(1 + 0.1 * (k - 1)).toFixed(2);
  }

  function spFromKill(expGained, playerLevel, mobLevel) {
    expGained = Math.max(0, +expGained || 0);
    var pl = +playerLevel || 1;
    // 1 SP / N EXP → ratio = 1/N
    var per = 28;
    if (pl <= 10) per = 24;
    else if (pl <= 20) per = 28;
    else if (pl <= 30) per = 30;
    else per = 32;
    return Math.max(0, Math.floor(expGained / per));
  }

  /**
   * Стоимость изучения умения (C1-шкала).
   * nextRank: 1 = первый ранг, 2 = второй…
   * baseSp: явная база из skill-db; иначе оценка по levelReq.
   */
  function skillSpCost(levelReq, nextRank, baseSp, maxLevel) {
    nextRank = Math.max(1, nextRank | 0);
    levelReq = Math.max(1, levelReq | 0);
    var base = baseSp != null
      ? +baseSp
      : Math.max(40, levelReq * 35 + 20);
    // каждый ранг дороже ~×1.5–1.8 (как C1 skill books)
    var mult = 1;
    for (var i = 1; i < nextRank; i++) mult *= 1.65;
    return Math.floor(base * mult);
  }

  /** Собрать таблицу для UI/LevelSystem (совместимость с EXP_TABLE[]). */
  function buildClientTable() {
    var table = [];
    for (var level = 1; level <= MAX_LEVEL; level++) {
      table.push({
        level: level,
        expToNext: expToNext(level),
        cumulativeExp: cumulativeExp(level),
        spReward: 0, // SP только с мобов в L2
        hpBonus: 0,
        mpBonus: 0,
        statPoints: 0
      });
    }
    return table;
  }

  return {
    MAX_LEVEL: MAX_LEVEL,
    EXP_TO_NEXT: EXP_TO_NEXT,
    CUMULATIVE: CUMULATIVE,
    expToNext: expToNext,
    expToNextRaw: expToNextRaw,
    cumulativeExp: cumulativeExp,
    applyDeathExpLoss: applyDeathExpLoss,
    partyExpBonus: partyExpBonus,
    spFromKill: spFromKill,
    skillSpCost: skillSpCost,
    buildClientTable: buildClientTable
  };
});
