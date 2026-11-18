// ============================================================
//  SHARED / LOOT-RULES.JS — Каталог и грейды предметов (клиент + сервер).
//  Таблицы шансов дропа (MOB_LOOT_TABLES, LOOT_CONFIG) и ролл
//  вынесены в server/data/loot-tables.js и подключаются только в Node.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.LOOT_RULES = api;
    root.LOOT_ITEMS = api.LOOT_ITEMS;
    root.ITEM_GRADE_CONFIG = api.ITEM_GRADE_CONFIG;
    if (api.MOB_LOOT_TABLES) root.MOB_LOOT_TABLES = api.MOB_LOOT_TABLES;
    if (api.LOOT_CONFIG) root.LOOT_CONFIG = api.LOOT_CONFIG;
    // НЕ затирать полный client ITEM_DATABASE (inventory.js).
    // Нормализация grade/stack — через inventory.mergeAllLootTemplates / mergeLootItemTemplate.
    if (typeof root.mergeAllLootTemplates === 'function') {
      try { root.mergeAllLootTemplates(); } catch (e) { /* ignore */ }
    } else if (!root.ITEM_DATABASE) {
      // loot.js до inventory — временный алиас
      root.ITEM_DATABASE = api.LOOT_ITEMS;
    }
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ============================================
  // ГРЕЙДЫ ПРЕДМЕТОВ (L2 Classic)
  // ============================================
  const ITEM_GRADE_CONFIG = {
    NO_GRADE: {
      id: 'no_grade',
      name: 'No-Grade',
      levelRange: [1, 19],
      crystalId: 'crystal_no_grade',
      crystalName: 'Кристалл: Механизм',
      enchantMax: 3,
      enchantSafe: 3,
      dropWeight: 100
    },
    D: {
      id: 'd',
      name: 'D-Grade',
      levelRange: [20, 39],
      crystalId: 'crystal_d',
      crystalName: 'Кристалл: Паровой двигатель',
      enchantMax: 6,
      enchantSafe: 4,
      dropWeight: 60
    },
    C: {
      id: 'c',
      name: 'C-Grade',
      levelRange: [40, 51],
      crystalId: 'crystal_c',
      crystalName: 'Кристалл: Гидравлика',
      enchantMax: 9,
      enchantSafe: 6,
      dropWeight: 30
    },
    B: {
      id: 'b',
      name: 'B-Grade',
      levelRange: [52, 60],
      crystalId: 'crystal_b',
      crystalName: 'Кристалл: Высокое давление',
      enchantMax: 12,
      enchantSafe: 8,
      dropWeight: 15
    },
    A: {
      id: 'a',
      name: 'A-Grade',
      levelRange: [61, 75],
      crystalId: 'crystal_a',
      crystalName: 'Кристалл: Плазменный',
      enchantMax: 16,
      enchantSafe: 12,
      dropWeight: 5
    },
    S: {
      id: 's',
      name: 'S-Grade',
      levelRange: [76, 85],
      crystalId: 'crystal_s',
      crystalName: 'Кристалл: Ядро Колосса',
      enchantMax: 20,
      enchantSafe: 16,
      dropWeight: 1
    }
  };

  // ============================================
  // ПОЛНАЯ БАЗА ПРЕДМЕТОВ ДРОПА (ССЫЛКА НА ЕДИНЫЙ shared/item-db.js)
  // ============================================
  const LOOT_ITEMS = (function () {
    var _itemDb = null;
    try { if (typeof require !== 'undefined') _itemDb = require('./item-db.js'); } catch (e) { _itemDb = null; }
    if (!_itemDb && typeof window !== 'undefined') _itemDb = window.ITEM_DB;
    return (_itemDb && _itemDb.ITEMS) ? _itemDb.ITEMS : {};
  })();

  function itemById(id) { return LOOT_ITEMS[id] || null; }
  function gradeOf(id) { var it = LOOT_ITEMS[id]; return it ? it.grade : 'no_grade'; }

  try {
    var GRLoot = null;
    if (typeof require !== 'undefined') GRLoot = require('./grade-rules.js');
    if (!GRLoot) {
      var gGr = (typeof window !== 'undefined') ? window : globalThis;
      GRLoot = gGr.GRADE_RULES || null;
    }
    if (GRLoot && GRLoot.stampMap) GRLoot.stampMap(LOOT_ITEMS);
    var WRLoot = null;
    if (typeof require !== 'undefined') {
      try { WRLoot = require('./weight-rules.js'); } catch (eWr) { WRLoot = null; }
    }
    if (!WRLoot) {
      var gWr = (typeof window !== 'undefined') ? window : globalThis;
      WRLoot = gWr.WEIGHT_RULES || null;
    }
    if (WRLoot && WRLoot.stampMap) WRLoot.stampMap(LOOT_ITEMS);
    var ERLoot = null;
    if (typeof require !== 'undefined') {
      try { ERLoot = require('./enchant-rules.js'); } catch (eEr) { ERLoot = null; }
    }
    if (!ERLoot) {
      var gEr = (typeof window !== 'undefined') ? window : globalThis;
      ERLoot = gEr.ENCHANT_RULES || null;
    }
    if (ERLoot && ERLoot.stampMap) ERLoot.stampMap(LOOT_ITEMS);
  } catch (eStamp) { /* grade-rules опционален при изолированном импорте */ }

  // цвет по грейду (L2: цвет имени = грейд) — для клиентских уведомлений
  function gradeColor(g) {
    return { no_grade: '#aaaaaa', d: '#44ff44', c: '#4488ff', b: '#aa44ff', a: '#ffaa44', s: '#ff4444' }[g] || '#aaaaaa';
  }

  var api = {
    ITEM_GRADE_CONFIG: ITEM_GRADE_CONFIG,
    LOOT_ITEMS: LOOT_ITEMS,
    itemById: itemById,
    gradeOf: gradeOf,
    gradeColor: gradeColor
  };

  // Серверные таблицы дропа и генераторы — только в Node (server/data/loot-tables.js)
  if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
    try {
      var srvLoot = null;
      try { srvLoot = require('../server/data/loot-tables.js'); }
      catch (_e0) { srvLoot = require('../../server/data/loot-tables.js'); }
      if (srvLoot && typeof srvLoot === 'object') {
        Object.assign(api, srvLoot);
      }
    } catch (_eLoot) { /* client/isolated env */ }
  }

  return api;
});
