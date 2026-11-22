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
  // L2: до safe — 100 %; цельная броня (fullBody) safe +4; выше safe — шанс по типу предмета.
  var SAFE = 3;
  var SAFE_FULL_BODY = 4;
  // L2J (Interlude): EnchantChanceWeapon 68, EnchantChanceArmor 52, EnchantChanceJewelry 54.
  var SUCCESS_BY_KIND = { weapon: 0.68, armor: 0.52, jewelry: 0.54 };
  var SUCCESS_OVER_SAFE = SUCCESS_BY_KIND.weapon; // совместимость со старым экспортом
  // Потолок по грейду. В L2 NG не точится — у нас осознанный отход: NG до +3 и без риска
  // (safe = max), NG-усилители (оружие / броня) остаются. Грейд D и выше — до +16, как на серверах L2.
  var MAX_BY_GRADE = { no_grade: 3, d: 16, c: 16, b: 16, a: 16, s: 16 };

  var JEWELRY_SLOTS = { necklace: 1, earring: 1, earring_l: 1, earring_r: 1, ring: 1, ring_l: 1, ring_r: 1 };

  /** Тип для шанса и кристаллов: weapon | jewelry | armor (щиты — броня). */
  function itemKind(tpl, slot) {
    if (slot === 'weapon' || (tpl && (tpl.type === 'weapon' || tpl.slot === 'weapon'))) return 'weapon';
    var t = String((tpl && tpl.type) || '').toLowerCase();
    var s = String((tpl && tpl.slot) || slot || '').toLowerCase();
    if (t === 'accessory' || t === 'jewelry' || JEWELRY_SLOTS[s]) return 'jewelry';
    return 'armor';
  }

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
  function successChance(plus, tpl, slot) {
    var p = Math.max(0, Math.floor(+plus || 0));
    if (p < safeLevel(tpl)) return 1;
    return SUCCESS_BY_KIND[itemKind(tpl, slot)];
  }

  // ---- Усилители (L2: Scroll: Enchant Weapon / Enchant Armor раздельно) ----
  // Броня, щиты и бижутерия точатся усилителем брони; оружие — только оружейным.
  var SCROLLS = {
    weapon: { no_grade: ['pressure_amplifier', 'blessed_pressure_amplifier'], d: ['pressure_amplifier_d'] },
    armor: { no_grade: ['armor_pressure_amplifier', 'blessed_armor_pressure_amplifier'], d: ['armor_pressure_amplifier_d'] }
  };
  var BLESSED_SCROLLS = { blessed_pressure_amplifier: true, blessed_armor_pressure_amplifier: true };

  /** Оружие ли это для заточки (щит и бижутерия — броня). */
  function isWeaponTarget(tpl, slot) {
    if (slot === 'weapon') return true;
    return !!(tpl && (tpl.type === 'weapon' || tpl.slot === 'weapon'));
  }

  /**
   * Подходящие усилители для предмета по порядку предпочтения (обычный, затем благословлённый).
   * @returns {string[]} пусто — для этого грейда усилителя нет
   */
  function scrollCandidates(tpl, slot) {
    var kind = isWeaponTarget(tpl, slot) ? 'weapon' : 'armor';
    var g = gradeKey(tpl && tpl.grade);
    var list = SCROLLS[kind][g];
    return list ? list.slice() : [];
  }

  function isBlessedScroll(id, sTpl) {
    return !!(BLESSED_SCROLLS[String(id || '').toLowerCase()] || (sTpl && sTpl.blessed));
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

  // L2J ItemTemplate: CRYSTAL_ENCHANT_BONUS_ARMOR / _WEAPON по грейду
  var CRYSTAL_ENCHANT_BONUS = {
    armor: { no_grade: 0, d: 11, c: 6, b: 11, a: 19, s: 25 },
    weapon: { no_grade: 0, d: 90, c: 45, b: 67, a: 144, s: 250 }
  };

  /**
   * Кристаллы за слом на текущем plus (L2J getCrystalCount(enchant)):
   *   +1..+3: база + бонус × plus;
   *   выше +3: оружие — база + бонус × (2·plus − 3), броня и бижутерия — база + бонус × (3·plus − 6).
   * @returns {{crystalId:string, count:number, grade:string}|null}
   */
  function crystalize(item, plus) {
    var g = gradeKey(item && item.grade);
    var base = itemCrystalCount(item);
    if (base <= 0) return null;
    plus = Math.max(0, Math.floor(+plus || 0));
    var isWeapon = itemKind(item) === 'weapon';
    var bonus = (isWeapon ? CRYSTAL_ENCHANT_BONUS.weapon : CRYSTAL_ENCHANT_BONUS.armor)[g] || 0;
    var count = base;
    if (plus > 3) count = base + bonus * (isWeapon ? (2 * plus - 3) : (3 * plus - 6));
    else if (plus > 0) count = base + bonus * plus;
    return { crystalId: crystalId(g), count: count, grade: g };
  }

  return {
    SAFE: SAFE,
    SAFE_FULL_BODY: SAFE_FULL_BODY,
    SUCCESS_OVER_SAFE: SUCCESS_OVER_SAFE,
    SUCCESS_BY_KIND: SUCCESS_BY_KIND,
    CRYSTAL_ENCHANT_BONUS: CRYSTAL_ENCHANT_BONUS,
    itemKind: itemKind,
    MAX_BY_GRADE: MAX_BY_GRADE,
    isFullBody: isFullBody,
    safeLevel: safeLevel,
    maxLevel: maxLevel,
    successChance: successChance,
    SCROLLS: SCROLLS,
    isWeaponTarget: isWeaponTarget,
    scrollCandidates: scrollCandidates,
    isBlessedScroll: isBlessedScroll,
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
