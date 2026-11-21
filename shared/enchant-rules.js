// ============================================================
//  SHARED / ENCHANT-RULES.JS — кристаллизация при сломе заточки (L2 C1).
//
//  Выше ENCHANT_SAFE вещь не «исчезает в никуда»: она становится кристаллами
//  своего грейда. NG в C1 — crystal_type NONE, count 0 (просто ломается).
//  D+: crystalCount из цены (price / (10×цена_кристалла), кап как у топ-D),
//  плюс надбавка за заточку выше +3.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ENCHANT_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ---- Правила заточки (единый источник: сервер, клиентская подсказка, game-rules) ----
  // L2: до safe — 100%; цельная броня (fullBody) safe +4; выше safe — постоянный шанс 2/3.
  var SAFE = 3;
  var SAFE_FULL_BODY = 4;
  var SUCCESS_OVER_SAFE = 2 / 3;
  // Потолок по грейду. No-Grade в L2 не точится; у нас — до +3 и без риска (safe = max),
  // чтобы NG-усилители из дропа и крафта не превратились в мусор. D — до +6 (граница фазы 1).
  var MAX_BY_GRADE = { no_grade: 3, d: 6, c: 9, b: 12, a: 16, s: 20 };

  function isFullBody(tpl) {
    return !!(tpl && (tpl.fullBody || String(tpl.slot || '').toLowerCase() === 'fullbody'));
  }

  /** Безопасный уровень: попытки plus → plus+1 при plus < safe всегда успешны. */
  function safeLevel(tpl) {
    return isFullBody(tpl) ? SAFE_FULL_BODY : SAFE;
  }

  /** Потолок заточки предмета по его грейду. */
  function maxLevel(tpl) {
    var g = gradeKey(tpl && tpl.grade);
    return MAX_BY_GRADE[g] != null ? MAX_BY_GRADE[g] : MAX_BY_GRADE.no_grade;
  }

  /** Шанс успеха попытки plus → plus+1. */
  function successChance(plus, tpl) {
    var p = Math.max(0, Math.floor(+plus || 0));
    return p < safeLevel(tpl) ? 1 : SUCCESS_OVER_SAFE;
  }

  var CRYSTAL_ID = {
    no_grade: 'crystal_no_grade',
    d: 'crystal_d',
    c: 'crystal_c',
    b: 'crystal_b',
    a: 'crystal_a',
    s: 'crystal_s'
  };
  var CRYSTAL_VALUE = { no_grade: 10, d: 50, c: 200, b: 800, a: 3000, s: 10000 };
  var CRYSTAL_CAP = { no_grade: 0, d: 1400, c: 2500, b: 4000, a: 6000, s: 9000 };

  function gradeKey(g) {
    if (g == null || g === '') return 'no_grade';
    var s = String(g).toLowerCase().replace(/-/g, '_');
    if (s === 'ng' || s === 'none' || s === 'nograde' || s === 'no_grade') return 'no_grade';
    if (s === 'd' || s === 'c' || s === 'b' || s === 'a' || s === 's') return s;
    return 'no_grade';
  }

  function crystalId(grade) {
    var g = gradeKey(grade);
    return CRYSTAL_ID[g] || 'crystal_no_grade';
  }

  function defaultCrystalCount(item) {
    if (!item || typeof item !== 'object') return 0;
    var g = gradeKey(item.grade);
    if (g === 'no_grade') return 0;
    var unit = CRYSTAL_VALUE[g] || 50;
    var cap = CRYSTAL_CAP[g] != null ? CRYSTAL_CAP[g] : 1400;
    var price = Math.floor(+item.price || 0);
    var n = 0;
    if (price > 0) {
      n = Math.floor(price / (unit * 10));
      if (n < 1) n = Math.max(1, Math.floor(price / unit));
    } else {
      var t = String(item.type || '').toLowerCase();
      var slot = String(item.slot || '').toLowerCase();
      if (t === 'weapon' || slot === 'weapon') n = g === 'd' ? 90 : 250;
      else if (slot === 'shield') n = g === 'd' ? 50 : 150;
      else if (t === 'armor') n = g === 'd' ? 40 : 120;
      else n = g === 'd' ? 15 : 40;
    }
    if (n > cap) n = cap;
    if (n < 1) n = 1;
    return n;
  }

  function itemCrystalCount(item) {
    if (!item || typeof item !== 'object') return 0;
    if (item.crystalCount != null && item.crystalCount !== '') {
      var n = Math.floor(+item.crystalCount);
      return n > 0 ? n : 0;
    }
    return defaultCrystalCount(item);
  }

  function stampCrystalCount(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.crystalCount == null) item.crystalCount = defaultCrystalCount(item);
    return item;
  }

  function stampMap(map) {
    if (!map || typeof map !== 'object') return 0;
    var n = 0;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var it = map[keys[i]];
      if (!it || typeof it !== 'object') continue;
      if (it.crystalCount == null) {
        it.crystalCount = defaultCrystalCount(it);
        n++;
      }
    }
    return n;
  }

  /**
   * Кристаллы за слом на текущем plus (попытка plus→plus+1 провалилась).
   * @returns {{crystalId:string, count:number, grade:string}|null}
   */
  function crystalize(item, plus) {
    var g = gradeKey(item && item.grade);
    var base = itemCrystalCount(item);
    if (base <= 0) return null;
    plus = Math.max(0, Math.floor(+plus || 0));
    var extra = 0;
    if (plus > SAFE) {
      extra = (plus - SAFE) * Math.max(1, Math.floor(base * 0.1));
    }
    var count = base + extra;
    var cap = CRYSTAL_CAP[g] != null ? CRYSTAL_CAP[g] : 1400;
    if (count > cap * 2) count = cap * 2;
    return { crystalId: crystalId(g), count: count, grade: g };
  }

  return {
    SAFE: SAFE,
    SAFE_FULL_BODY: SAFE_FULL_BODY,
    SUCCESS_OVER_SAFE: SUCCESS_OVER_SAFE,
    MAX_BY_GRADE: MAX_BY_GRADE,
    isFullBody: isFullBody,
    safeLevel: safeLevel,
    maxLevel: maxLevel,
    successChance: successChance,
    CRYSTAL_ID: CRYSTAL_ID,
    CRYSTAL_VALUE: CRYSTAL_VALUE,
    gradeKey: gradeKey,
    crystalId: crystalId,
    defaultCrystalCount: defaultCrystalCount,
    itemCrystalCount: itemCrystalCount,
    stampCrystalCount: stampCrystalCount,
    stampMap: stampMap,
    crystalize: crystalize
  };
});
