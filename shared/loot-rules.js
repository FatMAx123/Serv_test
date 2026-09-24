// ============================================================
//  SHARED / LOOT-RULES.JS — ЕДИНАЯ база дропа + серверный ролл.
//  UMD: сервер = require, клиент = <script>. Сервер катает дроп
//  САМ (античит). Формула = L2 Classic: drop-groups по весам,
//  level-diff модификатор, crit-drop, spoil, boss/event-множители.
//  СЕРЕДИНА ФАЙЛА (LOOT_CONFIG..MOB_LOOT_TABLES) = данные, не трогать.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.LOOT_RULES = api;
    root.LOOT_ITEMS = api.LOOT_ITEMS;
    root.MOB_LOOT_TABLES = api.MOB_LOOT_TABLES;
    root.LOOT_CONFIG = api.LOOT_CONFIG;
    root.ITEM_GRADE_CONFIG = api.ITEM_GRADE_CONFIG;
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
const LOOT_CONFIG = {
    // Базовые множители (глобальные knobs поверх таблиц)
    BASE_DROP_RATE: 1.0,
    BASE_SPOIL_RATE: 1.0,
    BASE_ADENA_RATE: 1.0,
    
    // Модификаторы разницы уровней (L2 Classic)
    LEVEL_DIFF: {
        9:  { drop: 1.50, adena: 1.50, exp: 1.50 },  // Моб на 9+ выше
        6:  { drop: 1.30, adena: 1.30, exp: 1.30 },
        3:  { drop: 1.10, adena: 1.10, exp: 1.10 },
        0:  { drop: 1.00, adena: 1.00, exp: 1.00 },  // Равный
        '-3': { drop: 0.80, adena: 0.80, exp: 0.80 },
        '-6': { drop: 0.50, adena: 0.50, exp: 0.50 },
        '-9': { drop: 0.20, adena: 0.20, exp: 0.20 },
        '-12': { drop: 0.05, adena: 0.05, exp: 0.05 }  // Серый моб
    },
    
    // Критический дроп
    CRIT_DROP_CHANCE: 0.03,     // 3% шанс
    CRIT_DROP_MULT: 2.0,        // x2 количество
    
    // Защита лута
    DROP_PROTECTION_TIME: 30,   // сек
    DROP_LIFETIME: 180,         // сек (3 мин)
    
    // Spoil
    SPOIL_BASE_CHANCE: 0.70,    // 70% базовый шанс
    SPOIL_LEVEL_BONUS: 0.02,    // +2% за уровень спойлера
    
    // Death EXP (клиентский оффлайн-стаб). Живой дроп вещей — shared/death-rules.js
    // (PLAYER 5 % + KARMA 40 %, не плоский 3 %).
    DEATH_EXP_LOSS: 0.10,
    DEATH_ITEM_DROP: 0.03,
    DEATH_EQUIP_DROP: 0.005,
    
    // Боссы (применяются в rollMobLoot при opts.boss)
    // Таблицы field_rb/raid уже содержат финальные adena/common/equip —
    // ADENA/DROP default 1.0, иначе двойной inflate. >1 = ивент «xN boss».
    // RARE: × к rare/special (cores/уники) — лёгкий boss-luck поверх таблицы.
    BOSS_DROP_MULT: 1.0,
    BOSS_ADENA_MULT: 1.0,
    BOSS_RARE_MULT: 1.5,
    
    // Мировые события (opts.event)
    EVENT_DROP_MULT: 2.0,
    EVENT_ADENA_MULT: 2.0
};

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
// ПОЛНАЯ БАЗА ПРЕДМЕТОВ ДРОПА
// ============================================
// ============================================
// ПОЛНАЯ БАЗА ПРЕДМЕТОВ ДРОПА (ССЫЛКА НА ЕДИНЫЙ shared/item-db.js)
// ============================================
const LOOT_ITEMS = (function () {
  var _itemDb = null;
  try { if (typeof require !== 'undefined') _itemDb = require('./item-db.js'); } catch (e) { _itemDb = null; }
  if (!_itemDb && typeof window !== 'undefined') _itemDb = window.ITEM_DB;
  return (_itemDb && _itemDb.ITEMS) ? _itemDb.ITEMS : {};
})();

// ============================================
// ПОЛНЫЕ ТАБЛИЦЫ ДРОПА ПО МОБАМ
// L2 C1 механика: медные детали часто/мало, ресы 0.5–5%, эквип ультраредко,
// соски почти не дропают (крафт из ресов). Имена — steampunk Project Steam.
// ============================================

/** Одна группа: {chance, items:[{id,weight,min,max}]} */
function _g(chance, items) {
  return { chance: chance, items: items };
}
function _it(id, min, max, weight) {
  return { id: id, weight: weight == null ? 100 : weight, min: min == null ? 1 : min, max: max == null ? 1 : max };
}
function _adena(chance, min, max) {
  return { groups: [{ id: 'adena_main', chance: chance, min: min, max: max, levelMod: true }] };
}
/** Собрать таблицу из C1-спеки */
function _mkLoot(spec) {
  var common = [];
  (spec.mats || []).forEach(function (m, i) {
    common.push(Object.assign({ id: 'mat_' + i }, _g(m.ch, [_it(m.id, m.min, m.max)])));
  });
  (spec.pots || []).forEach(function (m, i) {
    common.push(Object.assign({ id: 'pot_' + i }, _g(m.ch, [_it(m.id, m.min, m.max)])));
  });
  (spec.stack || []).forEach(function (m, i) {
    common.push(Object.assign({ id: 'stk_' + i }, _g(m.ch, [_it(m.id, m.min, m.max)])));
  });

  var equipment = { groups: [] };
  (spec.equip || []).forEach(function (m, i) {
    if (m.items && Array.isArray(m.items)) {
      equipment.groups.push(Object.assign({ id: m.id || ('eq_' + i) }, _g(m.ch, m.items.map(function (it) {
        return _it(it.id, it.min || 1, it.max || 1, it.weight || it.w || 100);
      }))));
    } else {
      equipment.groups.push(Object.assign({ id: 'eq_' + i }, _g(m.ch, [_it(m.id, 1, 1)])));
    }
  });

  var rare = { groups: [] };
  (spec.rare || []).forEach(function (m, i) {
    if (m.items && Array.isArray(m.items)) {
      rare.groups.push(Object.assign({ id: m.id || ('rare_' + i) }, _g(m.ch, m.items.map(function (it) {
        return _it(it.id, it.min || 1, it.max || 1, it.weight || it.w || 100);
      }))));
    } else {
      rare.groups.push(Object.assign({ id: 'rare_' + i }, _g(m.ch, [_it(m.id, m.min || 1, m.max || 1)])));
    }
  });

  var special = { groups: [] };
  (spec.quest || []).forEach(function (m, i) {
    special.groups.push(Object.assign({ id: 'q_' + i }, _g(m.ch, [_it(m.id, m.min || 1, m.max || 1)])));
  });

  var crystals = { groups: [] };
  (spec.crystal || []).forEach(function (m, i) {
    crystals.groups.push(Object.assign({ id: 'cr_' + i }, _g(m.ch, [_it(m.id, m.min || 1, m.max || 1)])));
  });

  var recipes = { groups: [] };
  (spec.recipe || []).forEach(function (m, i) {
    recipes.groups.push(Object.assign({ id: 'rc_' + i }, _g(m.ch, [_it(m.id, 1, 1)])));
  });

  // Spoil: C1 ~70% — чуть богаче basic mats (для будущего spoil-скилла)
  var spoilItems = (spec.spoil || spec.mats || []).map(function (m) {
    return _it(m.id, Math.max(1, (m.min || 1)), Math.max(2, (m.max || 1) + 1), m.w || 20);
  });
  if (!spoilItems.length) spoilItems = [_it('gear_fragment', 1, 2), _it('iron_scrap', 1, 2)];

  return {
    mobId: spec.id,
    name: spec.name || spec.id,
    level: spec.level || [1, 1],
    type: spec.type || 'aggressive',
    zone: spec.zone || '',
    l2Ref: spec.l2Ref || '',
    adena: _adena(spec.adenaCh, spec.adenaMin, spec.adenaMax),
    common: { groups: common },
    equipment: equipment,
    rare: rare,
    recipes: recipes,
    crystals: crystals,
    special: special,
    spoil: {
      chance: spec.spoilCh != null ? spec.spoilCh : 0.70,
      groups: [{ id: 'spoil_main', items: spoilItems }]
    }
  };
}

/**
 * C1-референс → steampunk.
 * Шансы и min/max медных деталей как у L2 C1 (доли 0.01 = 1%).
 * Ресы — craft ladder Project Steam.
 */
var _C1_SPECS = [
  // ─── 1–5: дворы / школа (Gremlin → Keltir) ───
  {
    id: 'loose_bolt', name: 'Сбежавший Болт', level: [1, 3], type: 'passive',
    l2Ref: 'Gremlin 1', zone: 'hub',
    adenaCh: 0.714, adenaMin: 1, adenaMax: 3,
    pots: [{ id: 'synthetic_oil', ch: 0.025, min: 1, max: 1 }],
    quest: [{ id: 'blue_capacitor', ch: 0.10, min: 1, max: 1 }],
    mats: [{ id: 'gear_fragment', ch: 0.08, min: 1, max: 1 }]
  },
  {
    id: 'tutorial_target', name: 'Мишень-бунтарь', level: [1, 4], type: 'passive',
    l2Ref: 'Gremlin (dummy)', zone: 'hub',
    adenaCh: 0.70, adenaMin: 1, adenaMax: 4,
    pots: [{ id: 'synthetic_oil', ch: 0.025, min: 1, max: 1 }],
    quest: [{ id: 'blue_capacitor', ch: 0.09, min: 1, max: 1 }],
    mats: [{ id: 'gear_fragment', ch: 0.09, min: 1, max: 1 }]
  },
  {
    id: 'scrapper', name: 'Скраппер', level: [1, 5], type: 'passive',
    l2Ref: 'Bearded Keltir 3', zone: 'hub',
    adenaCh: 0.662, adenaMin: 2, adenaMax: 6,
    quest: [{ id: 'protocol_punchcards', ch: 0.35, min: 1, max: 1 }],
    mats: [
      { id: 'copper_cable', ch: 0.04, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.025, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.045, min: 1, max: 1 }
    ]
  },
  {
    id: 'rust_mite', name: 'Ржавый Клещ', level: [2, 5], type: 'passive',
    l2Ref: 'Elder Keltir', zone: 'hub',
    adenaCh: 0.65, adenaMin: 2, adenaMax: 7,
    mats: [
      { id: 'copper_cable', ch: 0.04, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.03, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.035, min: 1, max: 1 }
    ],
    pots: [{ id: 'synthetic_oil', ch: 0.02, min: 1, max: 1 }]
  },
  {
    id: 'spark_sprite', name: 'Искровой Спрайт', level: [3, 5], type: 'passive',
    l2Ref: 'Imp (weak)', zone: 'hub',
    adenaCh: 0.64, adenaMin: 3, adenaMax: 8,
    mats: [
      { id: 'spark_plug', ch: 0.04, min: 1, max: 1 },
      { id: 'copper_cable', ch: 0.035, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.04, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.015, min: 1, max: 1 }]
  },

  // ─── 5–10: холмы / свалка (Wolf → Goblin → Orc) ───
  {
    id: 'steam_hound', name: 'Паровая Гончая', level: [5, 10], type: 'aggressive',
    l2Ref: 'Ashen Wolf 4', zone: 'astard',
    adenaCh: 0.68, adenaMin: 6, adenaMax: 15,
    mats: [
      { id: 'gasket_suede', ch: 0.04, min: 1, max: 1 },
      { id: 'rubber_skin', ch: 0.05, min: 1, max: 1 },
      { id: 'oil_filter', ch: 0.025, min: 1, max: 1 }
    ],
    quest: [{ id: 'astard_survey_token', ch: 0.5, min: 1, max: 1 }]
  },
  {
    id: 'meadow_mower', name: 'Бешеная Газонокосилка', level: [6, 10], type: 'aggressive',
    l2Ref: 'Goblin 5', zone: 'astard',
    adenaCh: 0.70, adenaMin: 8, adenaMax: 21,
    mats: [
      { id: 'gear_fragment', ch: 0.07, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 1 }
    ],
    equip: [
      { id: 'copper_pipe', ch: 0.0003 },
      { id: 'willow_coil', ch: 0.0004 }
    ]
  },
  {
    id: 'survey_beacon', name: 'Геодезический Маяк', level: [7, 11], type: 'aggressive',
    l2Ref: 'Goblin Scout', zone: 'astard',
    adenaCh: 0.70, adenaMin: 10, adenaMax: 22,
    mats: [
      { id: 'copper_cable', ch: 0.04, min: 1, max: 1 },
      { id: 'spark_plug', ch: 0.03, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    id: 'rivulet_pump', name: 'Буйный Насос', level: [7, 9], type: 'aggressive',
    l2Ref: 'water low', zone: 'riverspan',
    adenaCh: 0.68, adenaMin: 11, adenaMax: 25,
    mats: [
      { id: 'steam_valve', ch: 0.035, min: 1, max: 1 },
      { id: 'oil_filter', ch: 0.04, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'bridge_toll_bot', name: 'Сборщик Пошлины', level: [8, 9], type: 'aggressive',
    l2Ref: 'Orc Grunt 7', zone: 'riverspan',
    adenaCh: 0.64, adenaMin: 14, adenaMax: 34,
    mats: [{ id: 'iron_scrap', ch: 0.045, min: 1, max: 1 }, { id: 'copper_cable', ch: 0.05, min: 1, max: 1 }],
    equip: [
      { id: 'work_boots', ch: 0.0015 },
      { id: 'cedar_manifold', ch: 0.00035 }
    ]
  },
  {
    id: 'junk_magpie', name: 'Сорока-Магнит', level: [8, 10], type: 'aggressive',
    l2Ref: 'thief low', zone: 'scrapyard',
    adenaCh: 0.66, adenaMin: 13, adenaMax: 31,
    mats: [
      { id: 'copper_cable', ch: 0.04, min: 1, max: 2 },
      { id: 'gear_fragment', ch: 0.035, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.03, min: 1, max: 1 }
    ],
    rare: [{ id: 'copper_earring', ch: 0.0012, min: 1, max: 1 }]
  },
  {
    id: 'scrap_picker', name: 'Разборщик Лома', level: [8, 10], type: 'aggressive',
    l2Ref: 'scavenger orc', zone: 'scrapyard',
    adenaCh: 0.66, adenaMin: 14, adenaMax: 32,
    mats: [
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'coal_briquette', ch: 0.03, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.035, min: 1, max: 1 }
    ],
    equip: [
      { id: 'mage_staff', ch: 0.00025 },
      { id: 'crucifix_blood', ch: 0.0002 }
    ]
  },
  {
    id: 'hill_presser', name: 'Холмовой Трамбовщик', level: [9, 12], type: 'aggressive',
    l2Ref: 'Werewolf 9', zone: 'astard',
    adenaCh: 0.64, adenaMin: 20, adenaMax: 43,
    mats: [
      { id: 'coal_briquette', ch: 0.035, min: 1, max: 1 },
      { id: 'gasket_suede', ch: 0.045, min: 1, max: 1 },
      { id: 'piston_ring', ch: 0.03, min: 1, max: 1 }
    ]
  },

  // ─── 8–15: запад / сварка (Orc Fighter → mid) ───
  {
    id: 'welding_automaton', name: 'Сварочный Автомат', level: [8, 15], type: 'aggressive',
    l2Ref: 'Orc Fighter 10', zone: 'western',
    adenaCh: 0.62, adenaMin: 22, adenaMax: 49,
    mats: [
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 1 },
      { id: 'piston_ring', ch: 0.045, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.025, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.02, min: 1, max: 1 }],
    equip: [
      { id: 'mage_staff', ch: 0.00035 },
      { id: 'voodoo_doll', ch: 0.00025 },
      { id: 'mace_prayer', ch: 0.00012 }
    ],
    // Phase1: mid~11 → Low D only (не steam_hammer D mid-tier)
    rare: [{ id: 'magic_mace', ch: 0.0008, min: 1, max: 1 }]
  },
  {
    id: 'welding_drone', name: 'Дрон-Сварщик', level: [10, 16], type: 'aggressive',
    l2Ref: 'Werewolf Hunter 12', zone: 'western',
    adenaCh: 0.60, adenaMin: 31, adenaMax: 67,
    mats: [
      { id: 'varnish_seal', ch: 0.035, min: 1, max: 1 },
      { id: 'rubber_skin', ch: 0.05, min: 1, max: 2 },
      { id: 'spark_plug', ch: 0.03, min: 1, max: 1 }
    ],
    equip: [
      { id: 'magic_mace', ch: 0.0002 },
      { id: 'mace_prayer', ch: 0.0002 }
    ],
    // Phase1: mid~13 → Low/Mid D circuit, не pneumatic_rifle
    rare: [{ id: 'demon_fangs', ch: 0.0006, min: 1, max: 1 }]
  },
  {
    id: 'rust_sentry', name: 'Ржавый Часовой', level: [10, 13], type: 'aggressive',
    l2Ref: 'sentry golem low', zone: 'western',
    adenaCh: 0.62, adenaMin: 28, adenaMax: 59,
    mats: [
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.02, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    // elite (×2.2 HP / ×2.4 EXP) — лут ×~2 vs mid-solo соседей (dock/crane)
    id: 'repair_drone', name: 'Дрон-Ремонтник', level: [12, 18], type: 'elite',
    l2Ref: 'healer mid elite', zone: 'backwater',
    adenaCh: 0.62, adenaMin: 50, adenaMax: 120,
    mats: [
      { id: 'varnish_seal', ch: 0.045, min: 1, max: 2 },
      { id: 'steam_valve', ch: 0.04, min: 1, max: 2 },
      { id: 'oil_filter', ch: 0.04, min: 1, max: 2 },
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 3 }
    ],
    pots: [{ id: 'emergency_repair_kit', ch: 0.02, min: 1, max: 2 }],
    recipe: [{ id: 'recipe_synthetic_oil', ch: 0.015 }],
    quest: [
      { id: 'audio_log_01', ch: 0.05, min: 1, max: 1 },
      { id: 'spark_resonator', ch: 0.35, min: 1, max: 1 },
      { id: 'protocol_punchcards', ch: 0.35, min: 1, max: 1 },
      { id: 'oil_crystal', ch: 0.30, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.06, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.004, min: 1, max: 1 },
      { id: 'demon_fangs', ch: 0.008, min: 1, max: 1 },
      { id: 'tears_fairy', ch: 0.007, min: 1, max: 1 }
    ]
  },

  // ─── 11–13: сады / пасека / дворы ───
  {
    id: 'garden_sprinkler', name: 'Поливная Турель', level: [11, 12], type: 'aggressive',
    l2Ref: 'plant mid', zone: 'gardens',
    adenaCh: 0.62, adenaMin: 25, adenaMax: 56,
    quest: [{ id: 'pure_condensate', ch: 0.35, min: 1, max: 1 }],
    mats: [
      { id: 'rubber_skin', ch: 0.045, min: 1, max: 1 },
      { id: 'varnish_seal', ch: 0.03, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.04, min: 1, max: 1 }
    ],
    // mid~11 → Low D (mace), не Mid D fangs
    equip: [
      { id: 'mace_prayer', ch: 0.00025 },
      { id: 'magic_mace', ch: 0.0002 }
    ]
  },
  {
    id: 'vine_cable', name: 'Плющ-Кабель', level: [11, 12], type: 'aggressive',
    l2Ref: 'entangle', zone: 'gardens',
    adenaCh: 0.62, adenaMin: 25, adenaMax: 56,
    mats: [
      { id: 'copper_cable', ch: 0.07, min: 1, max: 2 },
      { id: 'gasket_suede', ch: 0.04, min: 1, max: 1 }
    ],
    equip: [
      { id: 'mace_prayer', ch: 0.00022 },
      { id: 'magic_mace', ch: 0.00018 }
    ]
  },
  {
    id: 'apiary_drone_bee', name: 'Мех-Пчела', level: [11, 12], type: 'aggressive',
    l2Ref: 'Stinger pack', zone: 'apiary',
    adenaCh: 0.60, adenaMin: 24, adenaMax: 53,
    mats: [
      { id: 'gasket_suede', ch: 0.04, min: 1, max: 1 },
      { id: 'spark_plug', ch: 0.035, min: 1, max: 1 },
      { id: 'oil_filter', ch: 0.035, min: 1, max: 1 }
    ],
    // mid~11 → Low D, не HiMid life_manifold
    equip: [
      { id: 'magic_mace', ch: 0.00015 }
    ]
  },
  {
    id: 'forge_apprentice', name: 'Горн-Подмастерье', level: [12, 13], type: 'aggressive',
    l2Ref: 'Stone Golem 13 (lite)', zone: 'cruna',
    adenaCh: 0.66, adenaMin: 36, adenaMax: 77,
    mats: [
      { id: 'coal_briquette', ch: 0.05, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 2 },
      { id: 'piston_ring', ch: 0.025, min: 1, max: 1 }
    ],
    quest: [
      { id: 'boiler_heart', ch: 0.12, min: 1, max: 1 },
      { id: 'superheated_core', ch: 0.35, min: 1, max: 1 },
      { id: 'cruna_forges_alloy', ch: 0.5, min: 1, max: 1 }
    ],
    // mid~12 → Low D only (fangs с 13+)
    equip: [
      { id: 'copper_shield', ch: 0.0006 },
      { id: 'mace_prayer', ch: 0.00022 },
      { id: 'magic_mace', ch: 0.00018 }
    ]
  },
  {
    id: 'yard_cranelet', name: 'Кран-Малыш', level: [12, 13], type: 'aggressive',
    l2Ref: 'Stone Golem 13', zone: 'cruna',
    adenaCh: 0.68, adenaMin: 39, adenaMax: 84,
    mats: [
      { id: 'coal_briquette', ch: 0.055, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.02, min: 1, max: 1 }
    ],
    quest: [{ id: 'boiler_heart', ch: 0.20, min: 1, max: 1 }],
    equip: [
      { id: 'copper_shield', ch: 0.0008 },
      { id: 'mace_prayer', ch: 0.00025 },
      { id: 'magic_mace', ch: 0.00015 }
    ]
  },

  // ─── 13–17: заводь / полигон / забвение (Spider / ruins entry) ───
  {
    id: 'steam_crane_spider', name: 'Кран-Паук', level: [12, 19], type: 'aggressive',
    l2Ref: 'Giant Spider 15', zone: 'backwater',
    adenaCh: 0.60, adenaMin: 49, adenaMax: 109,
    mats: [
      { id: 'varnish_seal', ch: 0.04, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.055, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.02, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.03, min: 1, max: 2 }]
  },
  {
    id: 'dry_dock_welder', name: 'Доковый Сварщик', level: [13, 15], type: 'aggressive',
    l2Ref: 'dock mid', zone: 'backwater',
    adenaCh: 0.62, adenaMin: 45, adenaMax: 98,
    mats: [
      { id: 'iron_scrap', ch: 0.045, min: 1, max: 2 },
      { id: 'varnish_seal', ch: 0.035, min: 1, max: 1 },
      { id: 'steam_valve', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'oblivion_walker', name: 'Ходок Забвения', level: [13, 16], type: 'aggressive',
    l2Ref: 'Skeleton Archer 15 (x2 feel)', zone: 'oblivion',
    adenaCh: 0.65, adenaMin: 60, adenaMax: 130,
    mats: [
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'drive_bone', ch: 0.04, min: 1, max: 2 }
    ],
    rare: [{ id: 'silver_flux', ch: 0.004, min: 1, max: 1 }],
    stack: [{ id: 'rivet_pack', ch: 0.10, min: 2, max: 6 }],
    quest: [{ id: 'fallen_memorial_dogtag', ch: 0.5, min: 1, max: 1 }]
  },
  {
    id: 'memory_scrubber', name: 'Стиратель Памяти', level: [14, 17], type: 'aggressive',
    l2Ref: 'Dungeon Spider 16', zone: 'oblivion',
    adenaCh: 0.62, adenaMin: 72, adenaMax: 155,
    mats: [
      { id: 'varnish_seal', ch: 0.061, min: 1, max: 2 },
      { id: 'copper_cable', ch: 0.085, min: 1, max: 3 },
      { id: 'drive_bone', ch: 0.03, min: 1, max: 2 }
    ]
  },
  {
    id: 'rogue_target', name: 'Живая Мишень', level: [15, 17], type: 'aggressive',
    l2Ref: 'range mid', zone: 'eastern',
    adenaCh: 0.64, adenaMin: 56, adenaMax: 126,
    mats: [
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 2 },
      { id: 'spark_plug', ch: 0.025, min: 1, max: 1 },
      { id: 'piston_ring', ch: 0.03, min: 1, max: 1 }
    ],
    stack: [{ id: 'rivet_pack', ch: 0.08, min: 2, max: 6 }]
  },
  {
    id: 'range_spotter', name: 'Споттер Полигона', level: [15, 16], type: 'aggressive',
    l2Ref: 'scout mid', zone: 'eastern',
    adenaCh: 0.64, adenaMin: 53, adenaMax: 119,
    quest: [{ id: 'kinetic_valve', ch: 0.35, min: 1, max: 1 }],
    mats: [
      { id: 'copper_cable', ch: 0.03, min: 1, max: 2 },
      { id: 'varnish_seal', ch: 0.022, min: 1, max: 1 }
    ],
    stack: [{ id: 'rivet_pack', ch: 0.08, min: 2, max: 6 }]
  },
  {
    // party_elite (×2.6 HP / ×2.8 EXP) — лут ×~2 vs party-соседей oblivion
    id: 'field_howitzer', name: 'Полевая Гаубица', level: [15, 17], type: 'party_elite',
    l2Ref: 'artillery mid elite', zone: 'eastern',
    adenaCh: 0.62, adenaMin: 110, adenaMax: 240,
    mats: [
      { id: 'iron_scrap', ch: 0.06, min: 1, max: 3 },
      { id: 'boiler_plate', ch: 0.03, min: 1, max: 1 },
      { id: 'pressure_gauge', ch: 0.04, min: 1, max: 2 },
      { id: 'drive_bone', ch: 0.05, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.04, min: 1, max: 1 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.006, min: 1, max: 1 },
      { id: 'demon_fangs', ch: 0.01, min: 1, max: 1 },
      { id: 'tears_fairy', ch: 0.009, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.006, min: 1, max: 1 }
    ],
    stack: [{ id: 'rivet_pack', ch: 0.12, min: 3, max: 8 }]
  },

  // ─── 16–18: хим / бараки / крепость (Skeleton Marksman / Silent Horror) ───
  {
    id: 'acid_sprayer', name: 'Кислотный Разбрызгиватель', level: [16, 17], type: 'aggressive',
    l2Ref: 'chem ruins', zone: 'chem',
    adenaCh: 0.58, adenaMin: 80, adenaMax: 175,
    mats: [
      { id: 'varnish_seal', ch: 0.07, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.05, min: 1, max: 1 },
      { id: 'oil_filter', ch: 0.05, min: 1, max: 1 }
    ],
    quest: [{ id: 'chem_toxic_sample', ch: 0.5, min: 1, max: 1 }]
  },
  {
    id: 'green_fault_drone', name: 'Дрон Зелёного Сбоя', level: [16, 18], type: 'aggressive',
    l2Ref: 'Skeleton Marksman 18', zone: 'chem',
    adenaCh: 0.58, adenaMin: 90, adenaMax: 210,
    mats: [
      { id: 'coal_briquette', ch: 0.07, min: 1, max: 2 },
      { id: 'spark_plug', ch: 0.05, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.05, min: 1, max: 2 }
    ],
    equip: [
      { id: 'leather_cap', ch: 0.0012 },
      { id: 'ghost_manifold', ch: 0.0002 },
      { id: 'atuba_mace', ch: 0.00018 }
    ]
  },
  {
    // party_elite (×2.6 HP) — жирный chem: ресы + rare, не «как acid_sprayer»
    id: 'spill_containment', name: 'Аварийный Контейнер', level: [17, 17], type: 'party_elite',
    l2Ref: 'tank mid elite', zone: 'chem',
    adenaCh: 0.62, adenaMin: 150, adenaMax: 320,
    mats: [
      { id: 'boiler_plate', ch: 0.045, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.06, min: 1, max: 2 },
      { id: 'pressure_gauge', ch: 0.045, min: 1, max: 2 },
      { id: 'varnish_seal', ch: 0.07, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.05, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.01, min: 1, max: 1 },
      { id: 'silver_flux', ch: 0.015, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.01, min: 1, max: 1 },
      { id: 'life_manifold', ch: 0.01, min: 1, max: 1 }
    ],
    quest: [{ id: 'boiler_heart', ch: 0.1, min: 1, max: 1 }]
  },
  {
    id: 'rezdiq_private', name: 'Рядовой Рездика', level: [17, 18], type: 'aggressive',
    l2Ref: 'Silent Horror 19 (lite)', zone: 'barracks',
    adenaCh: 0.55, adenaMin: 100, adenaMax: 220,
    mats: [
      { id: 'drive_bone', ch: 0.08, min: 1, max: 2 },
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'gasket_suede', ch: 0.04, min: 1, max: 1 }
    ],
    equip: [
      { id: 'leather_gloves', ch: 0.0009 },
      { id: 'ghost_manifold', ch: 0.00018 },
      { id: 'atuba_mace', ch: 0.00015 }
    ],
    rare: [{ id: 'pressure_amplifier', ch: 0.0005, min: 1, max: 1 }]
  },
  {
    // party_elite — сильнее rezdiq_private: crystal/amp/mats ×~2
    id: 'drill_sergeant', name: 'Дрель-Сержант', level: [17, 18], type: 'party_elite',
    l2Ref: 'Silent Horror 19 elite', zone: 'barracks',
    adenaCh: 0.6, adenaMin: 160, adenaMax: 340,
    mats: [
      { id: 'drive_bone', ch: 0.08, min: 1, max: 3 },
      { id: 'piston_ring', ch: 0.04, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.03, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 3 }
    ],
    equip: [{ id: 'leather_gloves', ch: 0.002 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.015, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.012, min: 1, max: 1 },
      { id: 'atuba_mace', ch: 0.01, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.04, min: 1, max: 2 }],
    stack: [{ id: 'rivet_pack', ch: 0.12, min: 2, max: 8 }]
  },
  {
    id: 'limit_guard', name: 'Страж Предела', level: [17, 18], type: 'aggressive',
    l2Ref: 'fort guard', zone: 'fort',
    adenaCh: 0.54, adenaMin: 105, adenaMax: 230,
    mats: [
      { id: 'iron_scrap', ch: 0.07, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.04, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.06, min: 1, max: 2 }
    ],
    equip: [
      { id: 'copper_plate', ch: 0.0007 },
      { id: 'ghost_manifold', ch: 0.00016 },
      { id: 'atuba_mace', ch: 0.00014 }
    ]
  },
  {
    id: 'fort_turret', name: 'Крепостная Турель', level: [17, 18], type: 'aggressive',
    l2Ref: 'turret', zone: 'fort',
    adenaCh: 0.53, adenaMin: 100, adenaMax: 220,
    mats: [
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'steam_valve', ch: 0.04, min: 1, max: 1 },
      { id: 'pressure_gauge', ch: 0.04, min: 1, max: 1 }
    ],
    stack: [{ id: 'rivet_pack', ch: 0.08, min: 2, max: 6 }]
  },
  {
    // party_elite fort — ×~1.8 vs limit_guard
    id: 'fort_enforcer', name: 'Каратель Предела', level: [17, 19], type: 'party_elite',
    l2Ref: 'fort champion', zone: 'fort',
    adenaCh: 0.6, adenaMin: 170, adenaMax: 360,
    mats: [
      { id: 'boiler_plate', ch: 0.04, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.06, min: 1, max: 3 },
      { id: 'drive_bone', ch: 0.06, min: 1, max: 2 },
      { id: 'coal_briquette', ch: 0.05, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.045, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.012, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.012, min: 1, max: 1 },
      { id: 'atuba_mace', ch: 0.01, min: 1, max: 1 }
    ],
    equip: [{ id: 'copper_plate', ch: 0.0025 }],
    stack: [{ id: 'rivet_pack', ch: 0.12, min: 3, max: 8 }]
  },

  // ─── 18–22: котловые земли ───
  {
    id: 'boiler_elemental', name: 'Котловой Элементаль', level: [18, 21], type: 'aggressive',
    l2Ref: 'elemental high-low', zone: 'boiler',
    adenaCh: 0.52, adenaMin: 120, adenaMax: 260,
    mats: [
      { id: 'boiler_plate', ch: 0.06, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.055, min: 1, max: 1 },
      { id: 'steam_valve', ch: 0.05, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.025, min: 1, max: 2 }],
    quest: [{ id: 'boiler_heart', ch: 0.08, min: 1, max: 1 }],
    // 1–20 scope: только D (C+ — future content)
    equip: [
      { id: 'ghost_manifold', ch: 0.0002 },
      { id: 'atuba_mace', ch: 0.00018 }
    ]
  },
  {
    id: 'pressure_fiend', name: 'Бес Давления', level: [19, 22], type: 'aggressive',
    l2Ref: 'fiend high-low', zone: 'boiler',
    adenaCh: 0.50, adenaMin: 140, adenaMax: 300,
    mats: [
      { id: 'pressure_gauge', ch: 0.06, min: 1, max: 1 },
      { id: 'hydraulic_fluid', ch: 0.06, min: 1, max: 2 },
      { id: 'varnish_seal', ch: 0.05, min: 1, max: 2 }
    ],
    rare: [{ id: 'pressure_amplifier', ch: 0.0015, min: 1, max: 1 }],
    crystal: [{ id: 'crystal_d', ch: 0.03, min: 1, max: 2 }],
    recipe: [{ id: 'recipe_pressure_canister', ch: 0.006 }],
    equip: [
      { id: 'ghost_manifold', ch: 0.00022 },
      { id: 'atuba_mace', ch: 0.0002 }
    ]
  },
  {
    // party_elite boiler — ×~1.8 vs pressure_fiend
    id: 'boiler_overpress', name: 'Перегретый Страж Котла', level: [19, 22], type: 'party_elite',
    l2Ref: 'boiler champion', zone: 'boiler',
    adenaCh: 0.58, adenaMin: 200, adenaMax: 420,
    mats: [
      { id: 'boiler_plate', ch: 0.07, min: 1, max: 3 },
      { id: 'hydraulic_fluid', ch: 0.07, min: 1, max: 3 },
      { id: 'pressure_gauge', ch: 0.055, min: 1, max: 2 },
      { id: 'steam_valve', ch: 0.05, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.05, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.014, min: 1, max: 1 },
      { id: 'silver_flux', ch: 0.012, min: 1, max: 1 },
      { id: 'demon_staff', ch: 0.008, min: 1, max: 1 },
      { id: 'sentinel_staff', ch: 0.007, min: 1, max: 1 },
      { id: 'goat_staff', ch: 0.007, min: 1, max: 1 }
    ],
    quest: [{ id: 'boiler_heart', ch: 0.12, min: 1, max: 2 }],
    recipe: [{ id: 'recipe_pressure_canister', ch: 0.012 }]
  },
  {
    id: 'green_steam_wraith', name: 'Зелёный Паро-Призрак', level: [18, 21], type: 'aggressive',
    l2Ref: 'wraith', zone: 'boiler',
    adenaCh: 0.51, adenaMin: 125, adenaMax: 270,
    mats: [
      { id: 'silver_flux', ch: 0.03, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.08, min: 1, max: 2 },
      { id: 'crystal_no_grade', ch: 0.06, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.02, min: 1, max: 1 }]
  },

  // ─── ITALIAN BRAINROT SECRET (скрытые боссы, видимые награды) ───
  {
    id: 'tralalero_toasterino', name: 'Tralalero Toasterino', level: [6, 8], type: 'named',
    l2Ref: 'italian brainrot secret', zone: 'secret',
    adenaCh: 1.0, adenaMin: 400, adenaMax: 900,
    mats: [
      { id: 'gear_fragment', ch: 0.22, min: 2, max: 4 },
      { id: 'iron_scrap', ch: 0.16, min: 1, max: 3 }
    ],
    pots: [
      { id: 'synthetic_oil', ch: 0.12, min: 1, max: 2 }
    ],
    rare: [
      { id: 'title_tralalero', ch: 0.12, min: 1, max: 1 },
      { id: 'dye_pink_brainrot', ch: 0.06, min: 1, max: 1 },
      { id: 'aura_tralala_neon', ch: 0.05, min: 1, max: 1 },
      { id: 'scroll_br_tralala_wave', ch: 0.05, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.4, min: 1, max: 3 }],
    spoilCh: 0
  },
  {
    id: 'skibidi_steamino', name: 'Skibidi Steamino', level: [8, 10], type: 'named',
    l2Ref: 'italian brainrot secret', zone: 'secret',
    adenaCh: 1.0, adenaMin: 600, adenaMax: 1400,
    mats: [
      { id: 'gear_fragment', ch: 0.22, min: 2, max: 5 },
      { id: 'copper_cable', ch: 0.16, min: 1, max: 2 }
    ],
    pots: [
      { id: 'pressure_canister', ch: 0.12, min: 1, max: 2 }
    ],
    rare: [
      { id: 'title_skibidi_steam', ch: 0.12, min: 1, max: 1 },
      { id: 'dye_skibidi_green', ch: 0.06, min: 1, max: 1 },
      { id: 'aura_skibidi_steam', ch: 0.05, min: 1, max: 1 },
      { id: 'scroll_br_skibidi_slam', ch: 0.05, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.45, min: 2, max: 4 }],
    spoilCh: 0
  },
  {
    id: 'bombardiro_blendodilo', name: 'Bombardiro Blendodilo', level: [10, 12], type: 'named',
    l2Ref: 'italian brainrot secret', zone: 'secret',
    adenaCh: 1.0, adenaMin: 1000, adenaMax: 2400,
    mats: [
      { id: 'iron_scrap', ch: 0.20, min: 2, max: 5 },
      { id: 'gear_fragment', ch: 0.18, min: 2, max: 5 },
      { id: 'piston_ring', ch: 0.10, min: 1, max: 1 }
    ],
    pots: [
      { id: 'emergency_repair_kit', ch: 0.08, min: 1, max: 1 }
    ],
    rare: [
      { id: 'title_bombardiro', ch: 0.12, min: 1, max: 1 },
      { id: 'dye_fire_blend', ch: 0.06, min: 1, max: 1 },
      { id: 'aura_bombardiro_fire', ch: 0.05, min: 1, max: 1 },
      { id: 'scroll_br_bombardiro_dive', ch: 0.05, min: 1, max: 1 },
      { id: 'soulshot_d', ch: 0.08, min: 10, max: 25 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.35, min: 1, max: 3 }],
    spoilCh: 0
  },
  {
    id: 'tung_tung_vacuumer', name: 'Tung Tung Vacuum Sahur', level: [13, 15], type: 'named',
    l2Ref: 'italian brainrot secret', zone: 'secret',
    adenaCh: 1.0, adenaMin: 1600, adenaMax: 3600,
    mats: [
      { id: 'gear_fragment', ch: 0.20, min: 2, max: 5 },
      { id: 'boiler_plate', ch: 0.10, min: 1, max: 1 },
      { id: 'copper_cable', ch: 0.14, min: 1, max: 3 }
    ],
    pots: [
      { id: 'high_pressure_tank', ch: 0.08, min: 1, max: 1 }
    ],
    rare: [
      { id: 'title_tung_tung', ch: 0.12, min: 1, max: 1 },
      { id: 'dye_vacuum_violet', ch: 0.06, min: 1, max: 1 },
      { id: 'aura_vacuum_void', ch: 0.05, min: 1, max: 1 },
      { id: 'scroll_br_tung_suction', ch: 0.05, min: 1, max: 1 },
      { id: 'meme_usb_16gb', ch: 0.06, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.45, min: 1, max: 4 }],
    spoilCh: 0
  },
  {
    id: 'ballerina_cappuccino', name: 'Ballerina Cappuccino', level: [16, 18], type: 'named',
    l2Ref: 'italian brainrot secret', zone: 'secret',
    adenaCh: 1.0, adenaMin: 2500, adenaMax: 6000,
    mats: [
      { id: 'drive_bone', ch: 0.14, min: 1, max: 2 },
      { id: 'copper_cable', ch: 0.16, min: 1, max: 3 },
      { id: 'gear_fragment', ch: 0.18, min: 2, max: 5 }
    ],
    pots: [
      { id: 'coffee_grounds_oil', ch: 0.10, min: 1, max: 1 }
    ],
    rare: [
      { id: 'title_ballerina_cap', ch: 0.12, min: 1, max: 1 },
      { id: 'dye_cappuccino_gold', ch: 0.06, min: 1, max: 1 },
      { id: 'aura_cappuccino_gold', ch: 0.05, min: 1, max: 1 },
      { id: 'scroll_br_cappuccino_spin', ch: 0.05, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.06, min: 1, max: 1 },
      { id: 'soulshot_d', ch: 0.08, min: 15, max: 40 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.55, min: 2, max: 6 }],
    spoilCh: 0
  },

  // ─── EASTER MINI-RAIDS (пасхалки 1–20, мемные техноген-брейнроты) ───
  {
    id: 'toaster_overlord', name: 'Тостер-Оверлорд', level: [4, 6], type: 'named',
    l2Ref: 'easter mini-raid', zone: 'operators_yard',
    adenaCh: 1.0, adenaMin: 180, adenaMax: 420,
    mats: [
      { id: 'gear_fragment', ch: 0.20, min: 2, max: 4 },
      { id: 'iron_scrap', ch: 0.14, min: 1, max: 3 },
      { id: 'toaster_crumb_core', ch: 0.18, min: 1, max: 1 }
    ],
    pots: [
      { id: 'synthetic_oil', ch: 0.10, min: 1, max: 2 }
    ],
    rare: [
      { id: 'rubber_duck_debug', ch: 0.12, min: 1, max: 1 },
      { id: 'coffee_grounds_oil', ch: 0.10, min: 1, max: 1 },
      { id: 'energy_drink_skibidi', ch: 0.08, min: 1, max: 1 },
      { id: 'soulshot_no_grade', ch: 0.10, min: 10, max: 30 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.4, min: 1, max: 3 }],
    spoilCh: 0
  },
  {
    id: 'coffee_berserker', name: 'Кофемашина-Берсерк', level: [8, 10], type: 'named',
    l2Ref: 'easter mini-raid', zone: 'astard_hills',
    adenaCh: 1.0, adenaMin: 450, adenaMax: 1100,
    mats: [
      { id: 'gear_fragment', ch: 0.20, min: 2, max: 5 },
      { id: 'iron_scrap', ch: 0.14, min: 1, max: 3 },
      { id: 'coffee_berserk_filter', ch: 0.18, min: 1, max: 1 }
    ],
    pots: [
      { id: 'coffee_grounds_oil', ch: 0.12, min: 1, max: 2 }
    ],
    rare: [
      { id: 'energy_drink_skibidi', ch: 0.10, min: 1, max: 1 },
      { id: 'emergency_repair_kit', ch: 0.10, min: 1, max: 1 },
      { id: 'soulshot_no_grade', ch: 0.10, min: 20, max: 50 },
      { id: 'sticky_note_urgent', ch: 0.08, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.45, min: 2, max: 4 }],
    spoilCh: 0
  },
  {
    id: 'wifi_router_404', name: 'Wi-Fi Роутер 404', level: [11, 13], type: 'named',
    l2Ref: 'easter mini-raid', zone: 'western_lands',
    adenaCh: 1.0, adenaMin: 900, adenaMax: 2200,
    mats: [
      { id: 'copper_cable', ch: 0.18, min: 2, max: 4 },
      { id: 'gear_fragment', ch: 0.16, min: 2, max: 5 },
      { id: 'wifi_antenna_broken', ch: 0.18, min: 1, max: 1 }
    ],
    pots: [
      { id: 'pressure_canister', ch: 0.10, min: 1, max: 2 }
    ],
    rare: [
      { id: 'broken_airpods_one', ch: 0.10, min: 1, max: 1 },
      { id: 'qr_code_of_chaos', ch: 0.10, min: 1, max: 1 },
      { id: 'meme_usb_16gb', ch: 0.08, min: 1, max: 1 },
      { id: 'soulshot_d', ch: 0.08, min: 10, max: 25 },
      { id: 'spiritshot_no_grade', ch: 0.06, min: 8, max: 20 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.35, min: 1, max: 3 }],
    spoilCh: 0
  },
  {
    id: 'printer_of_doom', name: 'Принтер Судьбы', level: [13, 15], type: 'named',
    l2Ref: 'easter mini-raid', zone: 'cruna_yards',
    adenaCh: 1.0, adenaMin: 1400, adenaMax: 3200,
    mats: [
      { id: 'iron_scrap', ch: 0.18, min: 2, max: 5 },
      { id: 'gear_fragment', ch: 0.16, min: 2, max: 5 },
      { id: 'printer_toner_soul', ch: 0.18, min: 1, max: 1 }
    ],
    pots: [
      { id: 'paper_jam_coupon', ch: 0.10, min: 1, max: 1 }
    ],
    rare: [
      { id: 'sticky_note_urgent', ch: 0.12, min: 1, max: 3 },
      { id: 'meme_usb_16gb', ch: 0.08, min: 1, max: 1 },
      { id: 'energy_drink_skibidi', ch: 0.08, min: 1, max: 1 },
      { id: 'soulshot_d', ch: 0.10, min: 15, max: 40 },
      { id: 'pressure_amplifier', ch: 0.08, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.45, min: 1, max: 4 }],
    spoilCh: 0
  },
  {
    id: 'bluetooth_oracle', name: 'Bluetooth-Оракул', level: [16, 18], type: 'named',
    l2Ref: 'easter mini-raid', zone: 'eastern_range',
    adenaCh: 1.0, adenaMin: 2200, adenaMax: 5500,
    mats: [
      { id: 'copper_cable', ch: 0.18, min: 2, max: 4 },
      { id: 'drive_bone', ch: 0.14, min: 1, max: 2 },
      { id: 'bluetooth_oracle_chip', ch: 0.18, min: 1, max: 1 }
    ],
    pots: [
      { id: 'bluetooth_pairing_charm', ch: 0.10, min: 1, max: 1 }
    ],
    rare: [
      { id: 'energy_drink_skibidi', ch: 0.08, min: 1, max: 1 },
      { id: 'meme_usb_16gb', ch: 0.08, min: 1, max: 1 },
      { id: 'qr_code_of_chaos', ch: 0.06, min: 1, max: 1 },
      { id: 'soulshot_d', ch: 0.10, min: 20, max: 50 },
      { id: 'spiritshot_d', ch: 0.08, min: 10, max: 25 },
      { id: 'pressure_amplifier_d', ch: 0.06, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.55, min: 2, max: 6 }],
    spoilCh: 0
  },

  // ─── ЭШЕЛОН 1: 6 ОБЫЧНЫХ ПОЛЕВЫХ РБ (1–19 УР.) ───
  {
    id: 'boiler_exploder_b1', name: 'Бойлер-Взрывник Б-1', level: [6, 7], type: 'field_rb',
    l2Ref: 'field RB', zone: 'astard_hills',
    adenaCh: 1.0, adenaMin: 2000, adenaMax: 3500,
    mats: [
      { id: 'synthetic_oil', ch: 0.9, min: 6, max: 12 },
      { id: 'pressure_canister', ch: 0.7, min: 3, max: 6 }
    ],
    equip: [
      { id: 'operator_hammer_low', ch: 0.25 },
      { id: 'short_sword', ch: 0.25 },
      { id: 'worker_overalls', ch: 0.25 },
      { id: 'copper_shield', ch: 0.2 }
    ],
    rare: [
      { id: 'pressure_amplifier', ch: 0.4, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.5, min: 2, max: 6 }],
    spoilCh: 0
  },
  {
    id: 'grinder_ripper_m9', name: 'Мясорубка-Потрошитель М-9', level: [9, 10], type: 'field_rb',
    l2Ref: 'field RB', zone: 'interfluve',
    adenaCh: 1.0, adenaMin: 4000, adenaMax: 7000,
    mats: [
      { id: 'copper_cable', ch: 0.85, min: 5, max: 12 },
      { id: 'iron_scrap', ch: 0.8, min: 6, max: 14 }
    ],
    equip: [
      { id: 'copper_pipe', ch: 0.25 },
      { id: 'mage_dagger', ch: 0.25 },
      { id: 'leather_armor', ch: 0.2 },
      { id: 'leather_pants', ch: 0.2 },
      { id: 'copper_shield', ch: 0.2 },
      { id: 'copper_earring', ch: 0.15 }
    ],
    rare: [
      { id: 'pressure_amplifier', ch: 0.5, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.6, min: 3, max: 8 }],
    spoilCh: 0
  },
  {
    id: 'vacuum_cyclone_3000', name: 'Супер-Пылесос Циклон-3000', level: [12, 13], type: 'field_rb',
    l2Ref: 'field RB', zone: 'scrapyard',
    adenaCh: 1.0, adenaMin: 8000, adenaMax: 14000,
    mats: [
      { id: 'iron_scrap', ch: 0.9, min: 10, max: 20 },
      { id: 'gear_fragment', ch: 0.8, min: 6, max: 14 }
    ],
    equip: [
      { id: 'iron_hammer', ch: 0.2 },
      { id: 'long_sword', ch: 0.2 },
      { id: 'spring_bow', ch: 0.15 },
      { id: 'reinforced_leather_shirt', ch: 0.15 },
      { id: 'reinforced_leather_gaiters', ch: 0.15 }
    ],
    recipe: [{ id: 'recipe_piston', ch: 0.2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.6, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_no_grade', ch: 0.7, min: 4, max: 10 }],
    spoilCh: 0
  },
  {
    id: 'chainsaw_lumberjack_x14', name: 'Бензопила-Дровосек Х-14', level: [14, 15], type: 'field_rb',
    l2Ref: 'field RB', zone: 'lost_gardens',
    adenaCh: 1.0, adenaMin: 12000, adenaMax: 20000,
    mats: [
      { id: 'varnish_seal', ch: 0.8, min: 3, max: 8 },
      { id: 'spark_plug', ch: 0.7, min: 2, max: 6 },
      { id: 'boiler_plate', ch: 0.6, min: 2, max: 5 }
    ],
    equip: [
      { id: 'bastard_sword', ch: 0.14 },
      { id: 'steam_hammer', ch: 0.14 },
      { id: 'composite_bow', ch: 0.12 },
      { id: 'copper_chainmail', ch: 0.15 },
      { id: 'copper_chainmail_gaiters', ch: 0.15 },
      { id: 'boiler_shield', ch: 0.15 }
    ],
    rare: [
      { id: 'pressure_amplifier', ch: 0.7, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.6, min: 3, max: 7 }],
    spoilCh: 0
  },
  {
    id: 'fridge_frost_sever', name: 'Холодильник-Морозильник «Север»', level: [16, 17], type: 'field_rb',
    l2Ref: 'field RB', zone: 'chem_ruins',
    adenaCh: 1.0, adenaMin: 18000, adenaMax: 30000,
    mats: [
      { id: 'steam_valve', ch: 0.8, min: 4, max: 9 },
      { id: 'hydraulic_fluid', ch: 0.7, min: 3, max: 7 }
    ],
    equip: [
      { id: 'composite_bow', ch: 0.15 },
      { id: 'bastard_sword', ch: 0.15 },
      { id: 'ring_mail_breastplate', ch: 0.14 },
      { id: 'hoplon', ch: 0.15 }
    ],
    rare: [
      { id: 'pressure_amplifier', ch: 0.8, min: 2, max: 4 },
      { id: 'pressure_amplifier_d', ch: 0.35, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.75, min: 4, max: 10 }],
    spoilCh: 0
  },
  {
    id: 'steam_roller_bogatyr', name: 'Паровой Каток-Утюг «Богатырь»', level: [18, 19], type: 'field_rb',
    l2Ref: 'field RB', zone: 'rezdiq_barracks',
    adenaCh: 1.0, adenaMin: 25000, adenaMax: 45000,
    mats: [
      { id: 'boiler_plate', ch: 0.9, min: 6, max: 14 },
      { id: 'drive_bone', ch: 0.8, min: 5, max: 12 }
    ],
    equip: [
      { id: 'steam_hammer', ch: 0.16 },
      { id: 'bastard_sword', ch: 0.16 },
      { id: 'scale_mail_breastplate', ch: 0.12 },
      { id: 'scale_mail_shield', ch: 0.16 }
    ],
    rare: [
      { id: 'pressure_amplifier_d', ch: 0.6, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.85, min: 5, max: 12 }],
    spoilCh: 0
  },

  // ─── PHASE 1 RAIDS (1–20) ───
  // Единственный источник лута боссов (сервер: rollMobLoot). game-rules.BOSSES без drop.
  {
    id: 'scrap_tyrant', name: 'Тиран Свалки', level: [14, 16], type: 'raid',
    l2Ref: 'phase1 intro raid', zone: 'scrapyard',
    adenaCh: 1.0, adenaMin: 2500, adenaMax: 7000,
    mats: [
      { id: 'iron_scrap', ch: 0.9, min: 8, max: 20 },
      { id: 'gear_fragment', ch: 0.85, min: 6, max: 16 },
      { id: 'boiler_plate', ch: 0.45, min: 2, max: 5 },
      { id: 'coal_briquette', ch: 0.5, min: 3, max: 8 }
    ],
    rare: [
      { id: 'scrap_tyrant_core', ch: 1.0, min: 1, max: 1 },
      { id: 'pressure_amplifier', ch: 0.35, min: 2, max: 6 },
      { id: 'demon_fangs', ch: 0.14, min: 1, max: 1 },
      { id: 'tears_fairy', ch: 0.12, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.10, min: 1, max: 1 },
      { id: 'life_manifold', ch: 0.09, min: 1, max: 1 },
      { id: 'mace_prayer', ch: 0.08, min: 1, max: 1 },
      { id: 'magic_mace', ch: 0.08, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.55, min: 2, max: 6 }],
    recipe: [{ id: 'recipe_piston', ch: 0.08 }],
    spoilCh: 0
  },
  {
    id: 'drill_worm', name: 'Босс-Бур', level: [16, 18], type: 'raid',
    l2Ref: 'phase1 mid raid', zone: 'field_of_oblivion',
    adenaCh: 1.0, adenaMin: 4000, adenaMax: 12000,
    mats: [
      { id: 'iron_scrap', ch: 0.9, min: 10, max: 24 },
      { id: 'boiler_plate', ch: 0.65, min: 3, max: 8 },
      { id: 'hydraulic_fluid', ch: 0.55, min: 2, max: 6 },
      { id: 'drive_bone', ch: 0.5, min: 2, max: 6 }
    ],
    rare: [
      { id: 'drill_worm_core', ch: 1.0, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.18, min: 1, max: 2 },
      { id: 'blessed_pressure_amplifier', ch: 0.06, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.12, min: 1, max: 1 },
      { id: 'atuba_mace', ch: 0.11, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.10, min: 1, max: 1 },
      { id: 'life_manifold', ch: 0.10, min: 1, max: 1 },
      { id: 'demon_fangs', ch: 0.08, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.65, min: 3, max: 9 }],
    // Phase1: D-recipe only (не C hydraulic_armor)
    recipe: [{ id: 'recipe_piston', ch: 0.12 }],
    spoilCh: 0
  },
  {
    id: 'press_hammer', name: 'Автономный Пресс-Молот', level: [18, 20], type: 'raid',
    l2Ref: 'phase1 main raid', zone: 'backwater',
    adenaCh: 1.0, adenaMin: 7000, adenaMax: 18000,
    mats: [
      { id: 'boiler_plate', ch: 0.75, min: 4, max: 10 },
      { id: 'hydraulic_fluid', ch: 0.6, min: 3, max: 8 },
      { id: 'iron_scrap', ch: 0.85, min: 8, max: 20 },
      { id: 'pressure_gauge', ch: 0.45, min: 2, max: 5 }
    ],
    rare: [
      { id: 'press_hammer_core', ch: 1.0, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.22, min: 1, max: 3 },
      { id: 'demon_staff', ch: 0.12, min: 1, max: 1 },
      { id: 'sentinel_staff', ch: 0.11, min: 1, max: 1 },
      { id: 'goat_staff', ch: 0.11, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.10, min: 1, max: 1 },
      { id: 'atuba_mace', ch: 0.10, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.75, min: 4, max: 12 }],
    // Phase1: D-recipe only (не C hydraulic_blade)
    recipe: [{ id: 'recipe_steel_plate', ch: 0.15 }],
    spoilCh: 0
  },
  {
    id: 'boiler_sovereign', name: 'Суверен Котла', level: [19, 20], type: 'raid',
    l2Ref: 'phase1 epic raid', zone: 'boiler',
    adenaCh: 1.0, adenaMin: 10000, adenaMax: 26000,
    mats: [
      { id: 'boiler_plate', ch: 0.9, min: 6, max: 14 },
      { id: 'hydraulic_fluid', ch: 0.75, min: 4, max: 10 },
      { id: 'silver_flux', ch: 0.35, min: 1, max: 3 },
      { id: 'pressure_gauge', ch: 0.5, min: 2, max: 6 }
    ],
    rare: [
      { id: 'boiler_sovereign_core', ch: 1.0, min: 1, max: 1 },
      { id: 'blessed_pressure_amplifier', ch: 0.18, min: 1, max: 2 },
      { id: 'pressure_amplifier_d', ch: 0.3, min: 2, max: 4 },
      { id: 'demon_staff', ch: 0.16, min: 1, max: 1 },
      { id: 'sentinel_staff', ch: 0.15, min: 1, max: 1 },
      { id: 'goat_staff', ch: 0.15, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.12, min: 1, max: 1 },
      { id: 'atuba_mace', ch: 0.12, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.85, min: 5, max: 14 }],
    // Phase1: только D-рецепты
    recipe: [
      { id: 'recipe_steel_plate', ch: 0.12 },
      { id: 'recipe_piston', ch: 0.1 }
    ],
    spoilCh: 0
  },


  // ─── Named / RB / Raid (high) ───
  {
    id: 'rustclaw_overseer', name: 'Смотритель Ржавый Коготь', level: [12, 14], type: 'named',
    l2Ref: 'named mid', zone: 'named',
    adenaCh: 0.95, adenaMin: 180, adenaMax: 380,
    mats: [
      { id: 'iron_scrap', ch: 0.22, min: 2, max: 4 },
      { id: 'coal_briquette', ch: 0.16, min: 1, max: 3 },
      { id: 'boiler_plate', ch: 0.10, min: 1, max: 1 }
    ],
    quest: [{ id: 'boiler_heart', ch: 0.35, min: 1, max: 2 }],
    crystal: [{ id: 'crystal_no_grade', ch: 0.2, min: 1, max: 3 }],
    equip: [{ id: 'copper_shield', ch: 0.008 }],
    rare: [
      { id: 'demon_fangs', ch: 0.04, min: 1, max: 1 },
      { id: 'tears_fairy', ch: 0.035, min: 1, max: 1 }
    ]
  },
  {
    id: 'sparkweld_elite', name: 'Элита Искросварка', level: [14, 16], type: 'named',
    l2Ref: 'named mid+', zone: 'named',
    adenaCh: 0.95, adenaMin: 220, adenaMax: 450,
    mats: [
      { id: 'varnish_seal', ch: 0.20, min: 1, max: 3 },
      { id: 'spark_plug', ch: 0.16, min: 1, max: 2 },
      { id: 'drive_bone', ch: 0.14, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.1, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier', ch: 0.03, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.04, min: 1, max: 1 },
      { id: 'life_manifold', ch: 0.035, min: 1, max: 1 }
    ]
  },
  {
    id: 'logic_corruptor', name: 'Повреждатель Логики', level: [20, 21], type: 'named',
    l2Ref: 'named high', zone: 'dungeon',
    adenaCh: 0.75, adenaMin: 220, adenaMax: 480,
    mats: [
      { id: 'silver_flux', ch: 0.08, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.2, min: 1, max: 3 },
      { id: 'boiler_plate', ch: 0.18, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.25, min: 1, max: 4 }],
    rare: [
      { id: 'pressure_amplifier_d', ch: 0.08, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'branded_warden', name: 'Клеймёный Смотритель', level: [27, 30], type: 'named',
    l2Ref: 'named high+', zone: 'dungeon',
    adenaCh: 0.72, adenaMin: 350, adenaMax: 700,
    mats: [
      { id: 'colossus_fragment', ch: 0.15, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.25, min: 2, max: 4 },
      { id: 'silver_flux', ch: 0.1, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.08, min: 1, max: 2 }],
    rare: [
      { id: 'pressure_amplifier_d', ch: 0.07, min: 1, max: 1 },
      { id: 'sentinel_staff', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    id: 'tower_dispatcher', name: 'Диспетчер Башни', level: [32, 35], type: 'named',
    l2Ref: 'tower named', zone: 'tower',
    adenaCh: 0.92, adenaMin: 550, adenaMax: 1100,
    mats: [
      { id: 'colossus_fragment', ch: 0.16, min: 1, max: 2 },
      { id: 'silver_flux', ch: 0.12, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.22, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.12, min: 1, max: 3 }],
    rare: [
      { id: 'tower_circuit_ring', ch: 0.08, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    id: 'directive_node', name: 'Узел Коллектива', level: [36, 39], type: 'named',
    l2Ref: 'end named', zone: 'bunker',
    adenaCh: 0.92, adenaMin: 800, adenaMax: 1600,
    mats: [
      { id: 'colossus_fragment', ch: 0.18, min: 1, max: 2 },
      { id: 'silver_flux', ch: 0.14, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.22, min: 1, max: 3 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.15, min: 1, max: 3 }],
    rare: [
      { id: 'blessed_pressure_amplifier', ch: 0.07, min: 1, max: 1 },
      { id: 'hydraulic_blade', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    id: 'cruna_overseer', name: 'Надзиратель Круны', level: [21, 21], type: 'field_rb',
    l2Ref: 'field RB', zone: 'rb',
    adenaCh: 1.0, adenaMin: 3500, adenaMax: 8000,
    mats: [
      { id: 'boiler_plate', ch: 0.7, min: 4, max: 10 },
      { id: 'hydraulic_fluid', ch: 0.6, min: 3, max: 8 },
      { id: 'colossus_fragment', ch: 0.45, min: 2, max: 5 }
    ],
    rare: [
      { id: 'cruna_overseer_core', ch: 1.0, min: 1, max: 1 },
      { id: 'heavy_doom_hammer', ch: 0.12, min: 1, max: 1 },
      { id: 'boiler_shield', ch: 0.15, min: 1, max: 1 },
      { id: 'life_manifold', ch: 0.05, min: 1, max: 1 },
      { id: 'bone_resonator', ch: 0.04, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.25, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.95, min: 6, max: 14 }],
    spoilCh: 0
  },
  {
    id: 'rezdiq_colonel', name: 'Полковник Рездик-VII', level: [22, 22], type: 'field_rb',
    l2Ref: 'field RB', zone: 'rb',
    adenaCh: 1.0, adenaMin: 4500, adenaMax: 9500,
    mats: [
      { id: 'drive_bone', ch: 0.7, min: 5, max: 12 },
      { id: 'boiler_plate', ch: 0.65, min: 4, max: 9 },
      { id: 'colossus_fragment', ch: 0.5, min: 2, max: 6 }
    ],
    rare: [
      { id: 'rezdiq_seal', ch: 1.0, min: 1, max: 1 },
      { id: 'rezdiq_shield', ch: 0.15, min: 1, max: 1 },
      { id: 'scale_mail_breastplate', ch: 0.12, min: 1, max: 1 },
      { id: 'scale_mail_gaiters', ch: 0.12, min: 1, max: 1 },
      { id: 'steam_hammer', ch: 0.08, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.25, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 1.0, min: 8, max: 18 }],
    spoilCh: 0
  },
  {
    id: 'branded_boiler', name: 'Брендованный Котёл', level: [30, 33], type: 'field_rb',
    l2Ref: 'field RB high', zone: 'rb',
    adenaCh: 1.0, adenaMin: 3500, adenaMax: 7500,
    mats: [
      { id: 'boiler_plate', ch: 0.8, min: 6, max: 14 },
      { id: 'hydraulic_fluid', ch: 0.7, min: 4, max: 10 },
      { id: 'colossus_fragment', ch: 0.55, min: 3, max: 7 }
    ],
    rare: [
      { id: 'branded_boiler_core', ch: 0.35, min: 1, max: 1 },
      { id: 'blessed_pressure_amplifier', ch: 0.08, min: 1, max: 1 },
      { id: 'boiler_shield', ch: 0.06, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.4, min: 2, max: 5 }],
    recipe: [{ id: 'recipe_steel_plate', ch: 0.1 }],
    spoilCh: 0
  },
  {
    id: 'green_protocol', name: 'Протокол «Зелёный»', level: [22, 22], type: 'raid',
    l2Ref: 'raid', zone: 'raid',
    adenaCh: 1.0, adenaMin: 8000, adenaMax: 16000,
    mats: [
      { id: 'colossus_fragment', ch: 0.9, min: 5, max: 12 },
      { id: 'silver_flux', ch: 0.6, min: 3, max: 8 },
      { id: 'hydraulic_fluid', ch: 0.8, min: 6, max: 15 }
    ],
    rare: [
      { id: 'green_protocol_core', ch: 1.0, min: 1, max: 1 },
      { id: 'prowler_dagger', ch: 0.10, min: 1, max: 1 },
      { id: 'ghost_manifold', ch: 0.08, min: 1, max: 1 },
      { id: 'demon_staff', ch: 0.06, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.35, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_d', ch: 1.0, min: 12, max: 24 }],
    spoilCh: 0
  },
  {
    id: 'steel_colossus', name: 'Стальной Колосс Предела', level: [22, 23], type: 'raid',
    l2Ref: 'raid', zone: 'raid',
    adenaCh: 1.0, adenaMin: 15000, adenaMax: 35000,
    mats: [
      { id: 'colossus_fragment', ch: 1.0, min: 8, max: 16 },
      { id: 'boiler_plate', ch: 0.9, min: 8, max: 18 },
      { id: 'silver_flux', ch: 0.65, min: 4, max: 10 }
    ],
    rare: [
      { id: 'steel_colossus_core', ch: 1.0, min: 1, max: 1 },
      { id: 'pressure_amplifier_d', ch: 0.80, min: 2, max: 4 },
      { id: 'blessed_pressure_amplifier', ch: 0.35, min: 1, max: 2 },
      {
        id: 'colossus_weapon_group',
        ch: 0.50,
        items: [
          { id: 'revolution_sword', w: 100 },
          { id: 'heavy_doom_hammer', w: 100 },
          { id: 'reinforced_bow', w: 100 },
          { id: 'prowler_dagger', w: 100 },
          { id: 'magic_mace', w: 100 }
        ]
      },
      {
        id: 'colossus_armor_group',
        ch: 0.60,
        items: [
          { id: 'scale_mail_breastplate', w: 100 },
          { id: 'scale_mail_gaiters', w: 100 },
          { id: 'scale_mail_shield', w: 100 },
          { id: 'mithril_jacket', w: 100 },
          { id: 'mithril_pants', w: 100 },
          { id: 'knowledge_jacket', w: 100 },
          { id: 'knowledge_pants', w: 100 },
          { id: 'operator_gauntlets_low', w: 100 }
        ]
      }
    ],
    crystal: [{ id: 'crystal_d', ch: 1.0, min: 150, max: 300 }],
    spoilCh: 0
  },
  {
    id: 'cruma_core', name: 'Ядро Башни Круны', level: [36, 38], type: 'raid',
    l2Ref: 'epic raid', zone: 'raid',
    adenaCh: 1.0, adenaMin: 18000, adenaMax: 35000,
    mats: [
      { id: 'colossus_fragment', ch: 1.0, min: 10, max: 20 },
      { id: 'silver_flux', ch: 0.8, min: 5, max: 12 },
      { id: 'hydraulic_fluid', ch: 0.9, min: 8, max: 16 }
    ],
    rare: [
      { id: 'cruma_core_shard', ch: 0.45, min: 1, max: 2 },
      { id: 'tower_circuit_ring', ch: 0.08, min: 1, max: 1 },
      { id: 'blessed_pressure_amplifier', ch: 0.12, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.9, min: 6, max: 15 }],
    recipe: [
      { id: 'recipe_hydraulic_armor', ch: 0.12 },
      { id: 'recipe_hydraulic_blade', ch: 0.1 }
    ],
    spoilCh: 0
  },
  {
    id: 'directive_overmind', name: 'Коллективный Разум', level: [40, 40], type: 'raid',
    l2Ref: 'epic raid end', zone: 'raid',
    adenaCh: 1.0, adenaMin: 25000, adenaMax: 50000,
    mats: [
      { id: 'colossus_fragment', ch: 1.0, min: 12, max: 25 },
      { id: 'silver_flux', ch: 0.9, min: 6, max: 15 },
      { id: 'boiler_plate', ch: 1.0, min: 10, max: 22 }
    ],
    rare: [
      { id: 'overmind_chip', ch: 0.5, min: 1, max: 1 },
      { id: 'directive_seal', ch: 0.1, min: 1, max: 1 },
      { id: 'hydraulic_blade', ch: 0.08, min: 1, max: 1 },
      { id: 'engine_necklace', ch: 0.06, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_c', ch: 1.0, min: 8, max: 18 }],
    recipe: [
      { id: 'recipe_hydraulic_blade', ch: 0.2 },
      { id: 'recipe_hydraulic_armor', ch: 0.15 },
      { id: 'recipe_colossus_plating', ch: 0.12 }
    ],
    spoilCh: 0
  }
];

// ─── PHASE 1 LOOT AUDIT & OPERATOR WEAPON DROPS (No-Grade и Low D эталон L2 C1) ───
(function _enrichPhase1Loot() {
  // 1. Убираем запрещенное оружие и щиты выше Low D (Mid D, HiMid D, High D, Top D) для мобов 1–20 ур. и боссов Фазы 1
  var banned = [
    'demon_staff', 'sentinel_staff', 'goat_staff', // Top D
    'ghost_manifold', 'atuba_mace',                 // High D
    'bone_resonator', 'life_manifold',              // Mid-High D
    'demon_fangs', 'tears_fairy',                   // Mid D
    'elven_shield', 'kite_shield_d', 'blood_shield', 'lion_shield' // Mid/Top D Shields
  ];

  var mobEquipAdditions = {
    // Low NG (ур. 1–10)
    scrapper: [
      { id: 'operator_hammer_low', ch: 0.0003 },
      { id: 'wooden_breastplate', ch: 0.0004 },
      { id: 'wooden_gaiters', ch: 0.0004 }
    ],
    steam_hound: [
      { id: 'operator_hammer_low', ch: 0.0004 },
      { id: 'wooden_helmet', ch: 0.0004 },
      { id: 'wooden_breastplate', ch: 0.0004 }
    ],
    meadow_mower: [
      { id: 'short_sword', ch: 0.0004 },
      { id: 'leather_armor', ch: 0.00035 },
      { id: 'wooden_gaiters', ch: 0.0004 }
    ],
    rust_mite: [
      { id: 'mage_dagger', ch: 0.0004 },
      { id: 'leather_pants', ch: 0.00035 },
      { id: 'leather_vest', ch: 0.00035 }
    ],
    survey_beacon: [
      { id: 'copper_pipe', ch: 0.00035 },
      { id: 'leather_armor', ch: 0.0003 },
      { id: 'leather_pants', ch: 0.0003 }
    ],

    // Mid NG (ур. 8–15)
    bridge_toll_bot: [
      { id: 'long_sword', ch: 0.0003 },
      { id: 'copper_chainmail', ch: 0.00025 },
      { id: 'copper_chainmail_gaiters', ch: 0.00025 }
    ],
    scrap_picker: [
      { id: 'long_sword', ch: 0.00025 },
      { id: 'copper_chainmail', ch: 0.00025 },
      { id: 'leather_pants', ch: 0.0003 }
    ],
    welding_automaton: [
      { id: 'iron_hammer', ch: 0.00025 },
      { id: 'iron_helmet', ch: 0.00025 },
      { id: 'copper_chainmail', ch: 0.00025 }
    ],
    hill_presser: [
      { id: 'iron_hammer', ch: 0.0003 },
      { id: 'copper_chainmail_gaiters', ch: 0.00025 },
      { id: 'iron_helmet', ch: 0.00025 }
    ],
    welding_drone: [
      { id: 'dirk', ch: 0.00025 },
      { id: 'operator_gauntlets_low', ch: 0.0003 },
      { id: 'copper_chainmail', ch: 0.0002 }
    ],
    rust_sentry: [
      { id: 'spring_bow', ch: 0.00025 },
      { id: 'bone_breastplate', ch: 0.0002 },
      { id: 'bone_gaiters', ch: 0.0002 }
    ],
    apiary_drone_bee: [
      { id: 'spring_bow', ch: 0.0002 },
      { id: 'bone_gaiters', ch: 0.0002 },
      { id: 'bone_breastplate', ch: 0.0002 }
    ],

    // Top NG (ур. 12–18)
    forge_apprentice: [
      { id: 'bastard_sword', ch: 0.00018 },
      { id: 'ring_mail_breastplate', ch: 0.00018 },
      { id: 'ring_mail_gaiters', ch: 0.00018 }
    ],
    yard_cranelet: [
      { id: 'bastard_sword', ch: 0.00018 },
      { id: 'steam_hammer', ch: 0.00018 },
      { id: 'ring_mail_boots', ch: 0.0002 },
      { id: 'ring_mail_gloves', ch: 0.0002 }
    ],
    memory_scrubber: [
      { id: 'steam_hammer', ch: 0.0002 },
      { id: 'bone_breastplate', ch: 0.0002 },
      { id: 'ring_mail_breastplate', ch: 0.00018 }
    ],
    green_fault_drone: [
      { id: 'assassin_knife', ch: 0.00018 },
      { id: 'composite_bow', ch: 0.00018 },
      { id: 'ring_mail_gaiters', ch: 0.00018 },
      { id: 'bone_gaiters', ch: 0.0002 }
    ],
    range_spotter: [
      { id: 'assassin_knife', ch: 0.0002 },
      { id: 'ring_mail_gloves', ch: 0.0002 },
      { id: 'ring_mail_boots', ch: 0.0002 }
    ],
    field_howitzer: [
      { id: 'composite_bow', ch: 0.00018 },
      { id: 'ring_mail_breastplate', ch: 0.00018 },
      { id: 'ring_mail_gaiters', ch: 0.00018 }
    ],

    // Low D (ур. 17–20)
    rezdiq_private: [
      { id: 'revolution_sword', ch: 0.00018 },
      { id: 'prowler_dagger', ch: 0.00016 },
      { id: 'scale_mail_breastplate', ch: 0.00016 },
      { id: 'scale_mail_gaiters', ch: 0.00016 }
    ],
    limit_guard: [
      { id: 'revolution_sword', ch: 0.00018 },
      { id: 'reinforced_leather_shirt', ch: 0.00016 },
      { id: 'reinforced_leather_gaiters', ch: 0.00016 }
    ],
    boiler_elemental: [
      { id: 'revolution_sword', ch: 0.00018 },
      { id: 'scale_mail_shield', ch: 0.00018 },
      { id: 'scale_mail_breastplate', ch: 0.00016 }
    ],
    drill_sergeant: [
      { id: 'heavy_doom_hammer', ch: 0.00018 },
      { id: 'reinforced_leather_boots', ch: 0.00018 },
      { id: 'scale_mail_gaiters', ch: 0.00016 }
    ],
    fort_enforcer: [
      { id: 'heavy_doom_hammer', ch: 0.0002 },
      { id: 'scale_mail_breastplate', ch: 0.00018 },
      { id: 'scale_mail_shield', ch: 0.00018 }
    ],
    pressure_fiend: [
      { id: 'heavy_doom_hammer', ch: 0.0002 },
      { id: 'reinforced_leather_shirt', ch: 0.00016 },
      { id: 'reinforced_leather_gaiters', ch: 0.00016 }
    ],
    green_steam_wraith: [
      { id: 'prowler_dagger', ch: 0.00018 },
      { id: 'reinforced_leather_boots', ch: 0.00018 },
      { id: 'reinforced_leather_shirt', ch: 0.00016 }
    ],
    fort_turret: [
      { id: 'reinforced_bow', ch: 0.00018 },
      { id: 'scale_mail_gaiters', ch: 0.00016 },
      { id: 'scale_mail_shield', ch: 0.00018 }
    ],
    boiler_overpress: [
      { id: 'reinforced_bow', ch: 0.00018 },
      { id: 'scale_mail_breastplate', ch: 0.00016 },
      { id: 'reinforced_leather_gaiters', ch: 0.00016 }
    ]
  };

  var bossRareAdditions = {
    scrap_tyrant: [
      { id: 'bastard_sword', ch: 0.12, min: 1, max: 1 },
      { id: 'steam_hammer', ch: 0.12, min: 1, max: 1 },
      { id: 'assassin_knife', ch: 0.10, min: 1, max: 1 },
      { id: 'copper_chainmail', ch: 0.12, min: 1, max: 1 },
      { id: 'copper_chainmail_gaiters', ch: 0.12, min: 1, max: 1 },
      { id: 'iron_helmet', ch: 0.10, min: 1, max: 1 },
      { id: 'operator_gauntlets_low', ch: 0.12, min: 1, max: 1 }
    ],
    drill_worm: [
      { id: 'heavy_doom_hammer', ch: 0.15, min: 1, max: 1 },
      { id: 'bastard_sword', ch: 0.14, min: 1, max: 1 },
      { id: 'spring_bow', ch: 0.12, min: 1, max: 1 },
      { id: 'bone_breastplate', ch: 0.12, min: 1, max: 1 },
      { id: 'bone_gaiters', ch: 0.12, min: 1, max: 1 },
      { id: 'ring_mail_breastplate', ch: 0.10, min: 1, max: 1 },
      { id: 'ring_mail_gaiters', ch: 0.10, min: 1, max: 1 }
    ],
    press_hammer: [
      { id: 'revolution_sword', ch: 0.18, min: 1, max: 1 },
      { id: 'heavy_doom_hammer', ch: 0.18, min: 1, max: 1 },
      { id: 'prowler_dagger', ch: 0.15, min: 1, max: 1 },
      { id: 'ring_mail_breastplate', ch: 0.14, min: 1, max: 1 },
      { id: 'ring_mail_gaiters', ch: 0.14, min: 1, max: 1 },
      { id: 'ring_mail_boots', ch: 0.12, min: 1, max: 1 },
      { id: 'ring_mail_gloves', ch: 0.12, min: 1, max: 1 }
    ],
    boiler_sovereign: [
      { id: 'revolution_sword', ch: 0.18, min: 1, max: 1 },
      { id: 'heavy_doom_hammer', ch: 0.18, min: 1, max: 1 },
      { id: 'prowler_dagger', ch: 0.16, min: 1, max: 1 },
      { id: 'reinforced_bow', ch: 0.16, min: 1, max: 1 },
      { id: 'scale_mail_breastplate', ch: 0.15, min: 1, max: 1 },
      { id: 'scale_mail_gaiters', ch: 0.15, min: 1, max: 1 },
      { id: 'scale_mail_shield', ch: 0.15, min: 1, max: 1 },
      { id: 'reinforced_leather_shirt', ch: 0.15, min: 1, max: 1 },
      { id: 'reinforced_leather_gaiters', ch: 0.15, min: 1, max: 1 },
      { id: 'reinforced_leather_boots', ch: 0.15, min: 1, max: 1 }
    ]
  };

  _C1_SPECS.forEach(function (sp) {
    var maxLvl = Math.max.apply(null, sp.level || [1]);
    // Фаза 1 острова: 1–22 (хранители + field RB). Колосс 22–23 уже на Low-D группах.
    if (maxLvl <= 22) {
      if (sp.equip) {
        sp.equip = sp.equip.filter(function (e) { return banned.indexOf(e.id) === -1; });
      }
      if (sp.rare) {
        sp.rare = sp.rare.filter(function (r) { return banned.indexOf(r.id) === -1; });
      }
    }

    if (mobEquipAdditions[sp.id]) {
      sp.equip = sp.equip || [];
      mobEquipAdditions[sp.id].forEach(function (add) {
        if (!sp.equip.some(function (e) { return e.id === add.id; })) {
          sp.equip.push(add);
        }
      });
    }

    if (bossRareAdditions[sp.id]) {
      sp.rare = sp.rare || [];
      bossRareAdditions[sp.id].forEach(function (add) {
        if (!sp.rare.some(function (r) { return r.id === add.id; })) {
          sp.rare.push(add);
        }
      });
    }
  });
})();

// Build map
const MOB_LOOT_TABLES = {};
_C1_SPECS.forEach(function (sp) {
  MOB_LOOT_TABLES[sp.id] = _mkLoot(sp);
});

/** Fallback по уровню, если у моба нет своей таблицы (новые id). C1-кривая. */
function lootFallbackByLevel(ml) {
  ml = Math.max(1, ml | 0);
  var band;
  if (ml <= 3) {
    band = { adenaCh: 0.71, adenaMin: 1, adenaMax: 3, mats: [
      { id: 'gear_fragment', ch: 0.07, min: 1, max: 1 },
      { id: 'copper_cable', ch: 0.04, min: 1, max: 1 }
    ], quest: [{ id: 'blue_capacitor', ch: 0.08, min: 1, max: 1 }] };
  } else if (ml <= 7) {
    band = { adenaCh: 0.64, adenaMin: 4, adenaMax: 12, mats: [
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 1 },
      { id: 'rubber_skin', ch: 0.045, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.04, min: 1, max: 1 }
    ] };
  } else if (ml <= 12) {
    band = { adenaCh: 0.55, adenaMin: 14, adenaMax: 35, mats: [
      { id: 'iron_scrap', ch: 0.04, min: 1, max: 1 },
      { id: 'piston_ring', ch: 0.04, min: 1, max: 1 },
      { id: 'coal_briquette', ch: 0.035, min: 1, max: 1 }
    ] };
  } else if (ml <= 16) {
    band = { adenaCh: 0.55, adenaMin: 35, adenaMax: 90, mats: [
      { id: 'varnish_seal', ch: 0.03, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.04, min: 1, max: 2 },
      { id: 'iron_scrap', ch: 0.035, min: 1, max: 2 }
    ], stack: [{ id: 'rivet_pack', ch: 0.2, min: 2, max: 8 }] };
  } else {
    band = { adenaCh: 0.54, adenaMin: 90, adenaMax: 220, mats: [
      { id: 'boiler_plate', ch: 0.015, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.06, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.02, min: 1, max: 1 }
    ], crystal: [{ id: 'crystal_d', ch: 0.015, min: 1, max: 1 }] };
  }
  return _mkLoot(Object.assign({
    id: '_fallback_lv' + ml,
    name: 'Fallback L' + ml,
    level: [ml, ml]
  }, band));
}


  // ============================================================
  //  СЕРВЕРНЫЕ ФУНКЦИИ РОЛЛА (чистые, без window — работают на Node)
  // ============================================================
  function rng(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // Модификатор по разнице уровней (mob - player)
  function levelMod(pl, ml) {
    var d = ml - pl, L = LOOT_CONFIG.LEVEL_DIFF, keys = [9, 6, 3, 0, -3, -6, -9, -12], m = L['0'];
    for (var i = 0; i < keys.length; i++) { if (d >= keys[i]) { m = L[String(keys[i])]; break; } }
    return m || { drop: 1, adena: 1, exp: 1 };
  }

  // Взвешенный выбор одного предмета из группы
  function weightedPick(items) {
    var s = 0, i; for (i = 0; i < items.length; i++) s += items[i].weight;
    var r = Math.random() * s, acc = 0;
    for (i = 0; i < items.length; i++) { acc += items[i].weight; if (r <= acc) return items[i]; }
    return items[items.length - 1];
  }

  function rollGroup(grp, lm, extraMult) {
    var ch = grp.chance * lm.drop * (extraMult || 1);
    if (ch <= 0 || Math.random() > Math.min(1, ch)) return null;
    var it = weightedPick(grp.items);
    return { id: it.id, count: rng(it.min, it.max) };
  }

  // Основной дроп моба -> {adena, items:[{id,count}], crit}  (контракт с server.onMobDeath)
  // Множители: BASE_* × (boss ? BOSS_* : 1) × (event ? EVENT_* : 1) × levelMod × crit.
  // Таблицы RB/raid уже финальные → BOSS_ADENA/DROP = 1.0; BOSS_RARE даёт лёгкий luck на cores.
  function rollMobLoot(mobId, pl, ml, opts) {
    opts = opts || {};
    var T = MOB_LOOT_TABLES[mobId] || (typeof lootFallbackByLevel === 'function' ? lootFallbackByLevel(ml || 1) : null);
    if (!T) return { adena: 0, items: [], crit: false };
    var lm = levelMod(pl, ml);
    var crit = Math.random() < LOOT_CONFIG.CRIT_DROP_CHANCE;
    var cm = crit ? LOOT_CONFIG.CRIT_DROP_MULT : 1;
    var isBoss = !!opts.boss;
    var isEvent = !!opts.event;
    var isChamp = !!opts.champion && !isBoss;
    var adenaMult = (LOOT_CONFIG.BASE_ADENA_RATE || 1) *
      (isBoss ? (LOOT_CONFIG.BOSS_ADENA_MULT || 1) : 1) *
      (isEvent ? (LOOT_CONFIG.EVENT_ADENA_MULT || 1) : 1) *
      (isChamp ? 1.5 : 1);
    var dropMult = (LOOT_CONFIG.BASE_DROP_RATE || 1) *
      (isBoss ? (LOOT_CONFIG.BOSS_DROP_MULT || 1) : 1) *
      (isEvent ? (LOOT_CONFIG.EVENT_DROP_MULT || 1) : 1) *
      (isChamp ? 1.35 : 1);
    // rare/special: dropMult + дополнительный boss rare luck
    var rareMult = dropMult * (isBoss ? (LOOT_CONFIG.BOSS_RARE_MULT || 1) : 1);
    var adena = 0, items = [];
    if (T.adena && T.adena.groups) T.adena.groups.forEach(function (g) {
      if (Math.random() < Math.min(1, g.chance * lm.adena)) {
        adena += Math.floor(rng(g.min, g.max) * adenaMult);
      }
    });
    ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special'].forEach(function (key) {
      var sec = T[key]; if (!sec || !sec.groups) return;
      var em = (key === 'rare' || key === 'special') ? rareMult : dropMult;
      sec.groups.forEach(function (g) {
        var res = rollGroup(g, lm, em);
        if (res) { res.count = Math.max(1, Math.floor(res.count * cm)); items.push(res); }
      });
    });
    return { adena: Math.floor(adena * cm), items: items, crit: crit };
  }

  // Spoil -> массив [{id,count}] или null (неудача) / [] (успех но пусто)
  function rollSpoil(mobId, pl, ml) {
    var T = MOB_LOOT_TABLES[mobId];
    if (!T || !T.spoil || !T.spoil.chance) return null;
    if (Math.random() > T.spoil.chance) return [];
    var pool = [];
    (T.spoil.groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { pool.push(it); }); });
    if (!pool.length) return [];
    var it = weightedPick(pool);
    return [{ id: it.id, count: rng(it.min, it.max) }];
  }

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

  return {
    LOOT_CONFIG: LOOT_CONFIG, ITEM_GRADE_CONFIG: ITEM_GRADE_CONFIG,
    LOOT_ITEMS: LOOT_ITEMS, MOB_LOOT_TABLES: MOB_LOOT_TABLES,
    levelMod: levelMod, rollMobLoot: rollMobLoot, rollSpoil: rollSpoil,
    itemById: itemById, gradeOf: gradeOf, gradeColor: gradeColor, weightedPick: weightedPick,
    lootFallbackByLevel: lootFallbackByLevel
  };
});