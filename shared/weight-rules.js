// ============================================================
//  SHARED / WEIGHT-RULES.JS — вес предметов и лимит нагрузки (Classic C1).
//
//  MaxLoad = floor(CON_bonus × 69000)  (канонический PlayerStat.getMaxLoad).
//  Пороги Classic: ≥2/3 — стоп регена HP/MP; ≥80% — нельзя бежать (×0.5);
//  >100% — нельзя атаковать/кастовать. Подбор/покупка не пускают выше капа.
//  Медные детали (copper_parts): 1 вес на 100 штук. Склад в нагрузку не входит.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WEIGHT_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ADENA_ID = 'copper_parts';
  var ADENA_PER_WEIGHT = 100;
  var BASE_LOAD = 69000;
  var CON_BASE = 1.030;
  var CON_REF = 27.632;
  var RATIO_REGEN = 2 / 3;
  var RATIO_SPEED = 0.80;

  var GRADE_ARMOR_MUL = { no_grade: 1, d: 1.35, c: 1.7, b: 2.1, a: 2.5, s: 3 };
  var SLOT_ARMOR = {
    chest: 830, legs: 540, head: 420, helmet: 420,
    gloves: 180, hands: 180, feet: 180, boots: 180,
    shield: 1210
  };
  var SLOT_ROBE = { chest: 430, legs: 280 };
  var SLOT_ACC = { necklace: 150, earring: 150, bracelet: 150, ring: 150, accessory: 150 };

  function gradeKey(g) {
    if (g == null || g === '') return 'no_grade';
    var s = String(g).toLowerCase().replace(/-/g, '_');
    if (s === 'ng' || s === 'none' || s === 'nograde' || s === 'no_grade') return 'no_grade';
    if (s === 'd' || s === 'c' || s === 'b' || s === 'a' || s === 's') return s;
    return 'no_grade';
  }

  function isAdena(item, id) {
    var tid = String((item && item.id) || id || '').toLowerCase();
    if (tid === ADENA_ID) return true;
    return !!(item && (item.type === 'adena' || item.currency));
  }

  function isTwoHanded(item) {
    if (!item) return false;
    if (item.twoHanded) return true;
    var wc = String(item.weaponClass || '').toLowerCase();
    if (wc === '2h_blunt' || wc === '2h_staff' || wc === 'bow' || wc === 'pole' || wc === 'dual' || wc === 'fist') {
      return wc !== 'fist';
    }
    if (item.ranged) return true;
    return false;
  }

  function defaultWeight(item) {
    if (!item || typeof item !== 'object') return 20;
    if (isAdena(item)) return 0;
    var t = String(item.type || '').toLowerCase();
    if (t === 'quest') return 0;
    var g = gradeKey(item.grade);
    var mul = GRADE_ARMOR_MUL[g] != null ? GRADE_ARMOR_MUL[g] : 1;
    if (t === 'weapon' || item.slot === 'weapon' || item.weaponClass) {
      var two = isTwoHanded(item);
      var baseW = two ? 2000 : 1200;
      if (g === 'd') baseW += two ? 300 : 200;
      else if (g === 'c') baseW += two ? 700 : 450;
      else if (g === 'b' || g === 'a' || g === 's') baseW += two ? 1100 : 700;
      return baseW;
    }
    var slot = String(item.slot || '').toLowerCase();
    if (t === 'armor' || SLOT_ARMOR[slot] || slot === 'shield') {
      var robe = String(item.armorType || '').toLowerCase() === 'robe';
      var sw = robe && SLOT_ROBE[slot] != null ? SLOT_ROBE[slot]
        : (SLOT_ARMOR[slot] != null ? SLOT_ARMOR[slot] : 500);
      return Math.max(1, Math.round(sw * mul));
    }
    if (t === 'accessory' || SLOT_ACC[slot]) {
      var aw = SLOT_ACC[slot] != null ? SLOT_ACC[slot] : 150;
      return Math.max(1, Math.round(aw * mul));
    }
    if (t === 'consumable') {
      if (item.shotKind || /shot/.test(String(item.id || ''))) return 4;
      if (item.healHp || item.healEnergy) return 80;
      return 50;
    }
    if (t === 'material') return 20;
    if (t === 'crystal') return 20;
    if (t === 'recipe' || t === 'enchant') return 120;
    return 20;
  }

  function itemWeight(item) {
    if (!item || typeof item !== 'object') return 20;
    if (item.weight != null && item.weight !== '') {
      var n = Math.floor(+item.weight);
      return n >= 0 ? n : 0;
    }
    return defaultWeight(item);
  }

  function stampWeight(item) {
    if (!item || typeof item !== 'object') return item;
    if (item.weight == null) item.weight = defaultWeight(item);
    return item;
  }

  function stampMap(map) {
    if (!map || typeof map !== 'object') return 0;
    var n = 0;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
      var it = map[keys[i]];
      if (!it || typeof it !== 'object') continue;
      if (it.weight == null) {
        it.weight = defaultWeight(it);
        n++;
      }
    }
    return n;
  }

  function stackWeight(item, count, id) {
    count = Math.max(0, Math.floor(+count || 0));
    if (count <= 0) return 0;
    if (isAdena(item, id)) return Math.floor(count / ADENA_PER_WEIGHT);
    return itemWeight(item) * count;
  }

  function inventoryLoad(inv, lookup) {
    if (!inv || typeof inv !== 'object') return 0;
    var total = 0;
    var keys = Object.keys(inv);
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i];
      if (id === '__proto__' || id === 'constructor') continue;
      var n = Math.floor(+inv[id] || 0);
      if (n <= 0) continue;
      var it = typeof lookup === 'function' ? lookup(id) : null;
      total += stackWeight(it, n, id);
    }
    return total;
  }

  function equipLoad(equip, lookup) {
    if (!equip || typeof equip !== 'object') return 0;
    var total = 0;
    var keys = Object.keys(equip);
    for (var i = 0; i < keys.length; i++) {
      var e = equip[keys[i]];
      if (!e || typeof e !== 'object') continue;
      var id = String(e.templateId || e.id || '').toLowerCase();
      if (!id || id === '__proto__' || id === 'constructor') continue;
      var it = typeof lookup === 'function' ? lookup(id) : null;
      total += stackWeight(it || e, 1, id);
    }
    return total;
  }

  function totalLoad(inv, equip, lookup) {
    return inventoryLoad(inv, lookup) + equipLoad(equip, lookup);
  }

  function conBonus(con) {
    var raw = Math.pow(CON_BASE, (+con || 0) - CON_REF);
    return Math.floor(raw * 100 + 0.5) / 100;
  }

  function maxLoad(con, extraPct) {
    var base = Math.floor(conBonus(con) * BASE_LOAD);
    extraPct = extraPct || 0;
    var n = Math.floor(base * (1 + extraPct));
    return n > 0 ? n : 1;
  }

  function penalty(load, max) {
    max = Math.max(1, Math.floor(+max || 1));
    load = Math.max(0, Math.floor(+load || 0));
    var ratio = load / max;
    var speedMult = 1;
    if (ratio > 1) speedMult = 0.15;
    else if (ratio >= RATIO_SPEED) speedMult = 0.5;
    return {
      load: load,
      max: max,
      ratio: ratio,
      noRegen: ratio >= RATIO_REGEN,
      speedMult: speedMult,
      canAttack: load <= max,
      canAdd: load <= max,
      overloaded: load > max
    };
  }

  function loadAfterAdd(inv, equip, itemId, count, lookup) {
    var next = {};
    if (inv && typeof inv === 'object') {
      var k;
      for (k in inv) {
        if (Object.prototype.hasOwnProperty.call(inv, k)) next[k] = inv[k];
      }
    }
    var id = String(itemId || '').toLowerCase();
    next[id] = (Math.floor(+next[id] || 0)) + Math.max(0, Math.floor(+count || 0));
    return totalLoad(next, equip, lookup);
  }

  function canAdd(inv, equip, itemId, count, con, lookup, extraPct) {
    var max = maxLoad(con, extraPct);
    var next = loadAfterAdd(inv, equip, itemId, count, lookup);
    return { ok: next <= max, load: next, max: max };
  }

  return {
    ADENA_ID: ADENA_ID,
    ADENA_PER_WEIGHT: ADENA_PER_WEIGHT,
    BASE_LOAD: BASE_LOAD,
    RATIO_REGEN: RATIO_REGEN,
    RATIO_SPEED: RATIO_SPEED,
    defaultWeight: defaultWeight,
    itemWeight: itemWeight,
    stampWeight: stampWeight,
    stampMap: stampMap,
    stackWeight: stackWeight,
    inventoryLoad: inventoryLoad,
    equipLoad: equipLoad,
    totalLoad: totalLoad,
    conBonus: conBonus,
    maxLoad: maxLoad,
    penalty: penalty,
    loadAfterAdd: loadAfterAdd,
    canAdd: canAdd
  };
});
