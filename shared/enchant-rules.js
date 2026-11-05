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

  var SAFE = 3;
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
