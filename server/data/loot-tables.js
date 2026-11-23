// ============================================================
//  SERVER / DATA / LOOT-TABLES.JS — Серверные таблицы дропа и ролл лута.
//  Не включается в клиентскую сборку (скрывает шансы и таблицы дропа).
// ============================================================
'use strict';

const LOOT_CONFIG = {
    // Базовые множители (глобальные knobs поверх таблиц)
    BASE_DROP_RATE: 1.0,
    BASE_SPOIL_RATE: 1.0,
    BASE_ADENA_RATE: 1.0,
    
    // Разница уровней — правило deep blue из L2 (calculateLevelModifierForDrop):
    // пока игрок выше моба не больше чем на 8 — шанс дропа и адены 100%;
    // с 9+ шанс режется на 9% за каждый уровень сверх 8 и делится на 3.
    // Бонуса за мобов выше уровнем нет (раньше был ×1.1–1.5, а штраф шёл уже с +1).
    DEEP_BLUE: {
        START_DIFF: 9,
        PCT_PER_LEVEL: 9,
        DIVISOR: 3
    },
    
    // «Крит-дроп» (3% → количество ×2) убран: в L2 такого нет; дроп — только таблицы и множители.
    CRIT_DROP_CHANCE: 0,
    CRIT_DROP_MULT: 1,
    
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
  // ─── 18–20: соло-треш Котловых земель (Silent Horror / Ol Mahum tier, solo) ───
  {
    id: 'kettle_stalker', name: 'Чайник-Свистун', level: [18, 20], type: 'aggressive',
    l2Ref: 'solo high-low', zone: 'boiler',
    adenaCh: 0.56, adenaMin: 105, adenaMax: 230,
    mats: [
      { id: 'steam_valve', ch: 0.07, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.06, min: 1, max: 2 },
      { id: 'hydraulic_fluid', ch: 0.03, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.012, min: 1, max: 1 }],
    equip: [{ id: 'leather_gloves', ch: 0.0009 }, { id: 'ghost_manifold', ch: 0.00018 }],
    rare: [{ id: 'pressure_amplifier', ch: 0.0005, min: 1, max: 1 }]
  },
  {
    id: 'iron_crawler', name: 'Утюг-Отпариватель', level: [18, 20], type: 'aggressive',
    l2Ref: 'solo high-low', zone: 'boiler',
    adenaCh: 0.55, adenaMin: 100, adenaMax: 220,
    mats: [
      { id: 'iron_scrap', ch: 0.07, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.02, min: 1, max: 1 },
      { id: 'gasket_suede', ch: 0.05, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.012, min: 1, max: 1 }],
    equip: [{ id: 'leather_cap', ch: 0.0009 }, { id: 'atuba_mace', ch: 0.00015 }],
    rare: [{ id: 'pressure_amplifier', ch: 0.0005, min: 1, max: 1 }]
  },
  // ─── Этап 6: бытовая техника 6–20 (медь — по уровню спота, copperLevelMult) ───
  {
    id: 'mouse_ball', name: 'Мышь-Шарик', level: [6, 8], type: 'aggressive',
    l2Ref: 'rat pack', zone: 'eastern',
    adenaCh: 0.68, adenaMin: 6, adenaMax: 15,
    mats: [
      { id: 'copper_cable', ch: 0.05, min: 1, max: 1 },
      { id: 'rubber_skin', ch: 0.03, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'alarm_snooze', name: 'Будильник «Ещё 5 минут»', level: [7, 9], type: 'aggressive',
    l2Ref: 'goblin', zone: 'riverspan',
    adenaCh: 0.70, adenaMin: 9, adenaMax: 21,
    mats: [
      { id: 'spark_plug', ch: 0.035, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.05, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'brick_phone', name: 'Кнопочный Кирпич', level: [8, 10], type: 'aggressive',
    l2Ref: 'golem low', zone: 'scrapyard',
    adenaCh: 0.68, adenaMin: 13, adenaMax: 30,
    mats: [
      { id: 'iron_scrap', ch: 0.05, min: 1, max: 2 },
      { id: 'copper_cable', ch: 0.03, min: 1, max: 1 },
      { id: 'spark_plug', ch: 0.025, min: 1, max: 1 }
    ]
  },
  {
    id: 'garland_tangle', name: 'Гирлянда-Путаница', level: [9, 11], type: 'aggressive',
    l2Ref: 'entangle low', zone: 'scrapyard',
    adenaCh: 0.66, adenaMin: 16, adenaMax: 36,
    mats: [
      { id: 'copper_cable', ch: 0.07, min: 1, max: 2 },
      { id: 'spark_plug', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'keyboard_centipede', name: 'Клавиатура-Сороконожка', level: [10, 12], type: 'aggressive',
    l2Ref: 'crawler', zone: 'western',
    adenaCh: 0.64, adenaMin: 22, adenaMax: 50,
    mats: [
      { id: 'gear_fragment', ch: 0.05, min: 1, max: 2 },
      { id: 'rubber_skin', ch: 0.035, min: 1, max: 1 },
      { id: 'copper_cable', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'intercom_whois', name: 'Домофон «Кто там?»', level: [12, 14], type: 'aggressive',
    l2Ref: 'sentry mid', zone: 'cruna',
    adenaCh: 0.66, adenaMin: 36, adenaMax: 80,
    mats: [
      { id: 'copper_cable', ch: 0.05, min: 1, max: 2 },
      { id: 'spark_plug', ch: 0.035, min: 1, max: 1 },
      { id: 'iron_scrap', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'cash_register', name: 'Касса-Чекострел', level: [12, 14], type: 'aggressive',
    l2Ref: 'ranged thief', zone: 'cruna',
    adenaCh: 0.72, adenaMin: 40, adenaMax: 90,
    mats: [
      { id: 'iron_scrap', ch: 0.045, min: 1, max: 2 },
      { id: 'steam_valve', ch: 0.025, min: 1, max: 1 },
      { id: 'boiler_plate', ch: 0.015, min: 1, max: 1 }
    ]
  },
  {
    id: 'vhs_rewinder', name: 'Видик-Перемотчик', level: [13, 15], type: 'aggressive',
    l2Ref: 'undead mid', zone: 'backwater',
    adenaCh: 0.62, adenaMin: 44, adenaMax: 96,
    mats: [
      { id: 'rubber_skin', ch: 0.04, min: 1, max: 2 },
      { id: 'varnish_seal', ch: 0.03, min: 1, max: 1 },
      { id: 'gear_fragment', ch: 0.04, min: 1, max: 1 }
    ]
  },
  {
    id: 'flash_camera', name: 'Мыльница-Вспышка', level: [15, 17], type: 'aggressive',
    l2Ref: 'blinder', zone: 'monument',
    adenaCh: 0.64, adenaMin: 55, adenaMax: 122,
    mats: [
      { id: 'spark_plug', ch: 0.04, min: 1, max: 1 },
      { id: 'varnish_seal', ch: 0.025, min: 1, max: 1 }
    ],
    stack: [{ id: 'rivet_pack', ch: 0.07, min: 2, max: 5 }]
  },
  {
    id: 'power_meter', name: 'Счётчик-Наматыватель', level: [15, 17], type: 'aggressive',
    l2Ref: 'caster low', zone: 'monument',
    adenaCh: 0.64, adenaMin: 58, adenaMax: 128,
    mats: [
      { id: 'copper_cable', ch: 0.06, min: 1, max: 2 },
      { id: 'steam_valve', ch: 0.03, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.03, min: 1, max: 1 }
    ]
  },
  {
    id: 'phone_one_percent', name: 'Смартфон «1%»', level: [17, 19], type: 'aggressive',
    l2Ref: 'coward caster', zone: 'eastern',
    adenaCh: 0.58, adenaMin: 95, adenaMax: 210,
    mats: [
      { id: 'spark_plug', ch: 0.045, min: 1, max: 1 },
      { id: 'drive_bone', ch: 0.05, min: 1, max: 2 },
      { id: 'gasket_suede', ch: 0.03, min: 1, max: 1 }
    ],
    rare: [{ id: 'pressure_amplifier', ch: 0.0005, min: 1, max: 1 }]
  },
  {
    id: 'laptop_update', name: 'Ноутбук «Обновление 1 из 347»', level: [18, 20], type: 'aggressive',
    l2Ref: 'heavy brute', zone: 'eastern',
    adenaCh: 0.56, adenaMin: 105, adenaMax: 230,
    mats: [
      { id: 'iron_scrap', ch: 0.06, min: 1, max: 2 },
      { id: 'boiler_plate', ch: 0.02, min: 1, max: 1 },
      { id: 'gasket_suede', ch: 0.04, min: 1, max: 1 }
    ],
    rare: [{ id: 'pressure_amplifier', ch: 0.0005, min: 1, max: 1 }]
  },
  // ─── пасхалки (секретные споты; медь своя, без пересчёта по уровню) ───
  {
    id: 'tv_remote_lost', name: 'Пульт «Где он?»', level: [9, 9], type: 'boss',
    l2Ref: 'secret easter', zone: 'secret',
    adenaCh: 1.0, adenaMin: 200, adenaMax: 400,
    stack: [{ id: 'trophy_aa_batteries', ch: 1.0, min: 1, max: 2 }],
    spoilCh: 0
  },
  {
    id: 'atm_greedy', name: 'Банкомат «Наличных нет»', level: [13, 13], type: 'boss',
    l2Ref: 'secret easter', zone: 'secret',
    adenaCh: 1.0, adenaMin: 2500, adenaMax: 5000,
    spoilCh: 0
  },
  {
    id: 'retro_console', name: 'Приставка «Продуй картридж»', level: [17, 17], type: 'boss',
    l2Ref: 'secret easter', zone: 'secret',
    adenaCh: 1.0, adenaMin: 600, adenaMax: 1200,
    stack: [{ id: 'trophy_cartridge_999', ch: 1.0, min: 1, max: 1 }],
    spoilCh: 0
  },
  {
    id: 'gauge_warden', name: 'Манометр-Часовой', level: [19, 20], type: 'aggressive',
    l2Ref: 'solo ranged high-low', zone: 'boiler',
    adenaCh: 0.56, adenaMin: 115, adenaMax: 245,
    mats: [
      { id: 'pressure_gauge', ch: 0.05, min: 1, max: 1 },
      { id: 'spark_plug', ch: 0.06, min: 1, max: 1 },
      { id: 'hydraulic_fluid', ch: 0.03, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.014, min: 1, max: 1 }],
    equip: [{ id: 'ghost_manifold', ch: 0.0002 }],
    rare: [{ id: 'pressure_amplifier', ch: 0.0006, min: 1, max: 1 }]
  },
  {
    id: 'dryer_hound', name: 'Фен-Гончая', level: [18, 20], type: 'aggressive',
    l2Ref: 'wolf pack high-low', zone: 'boiler',
    adenaCh: 0.52, adenaMin: 90, adenaMax: 200,
    mats: [
      { id: 'copper_cable', ch: 0.07, min: 1, max: 2 },
      { id: 'drive_bone', ch: 0.05, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_d', ch: 0.01, min: 1, max: 1 }]
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
    l2Ref: 'field RB', zone: 'riverspan',
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
          { id: 'operator_gauntlets_low', w: 100 },
          { id: 'steam_helmet', w: 100 },
          { id: 'steam_boots', w: 100 },
          { id: 'knowledge_gloves', w: 100 }
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
      { id: 'blessed_pressure_amplifier', ch: 0.12, min: 1, max: 2 }
    ],
    crystal: [{ id: 'crystal_c', ch: 0.9, min: 6, max: 15 }],
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
      { id: 'hydraulic_blade', ch: 0.08, min: 1, max: 1 }
    ],
    crystal: [{ id: 'crystal_c', ch: 1.0, min: 8, max: 18 }],
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

  // ─── Серьги: единственная «обычная» бижутерия игры (2 слота) ───
  // Ожерелье и кольца L2 заменены приборами (резонатор/компрессор, браслет/наручи),
  // поэтому M.Def от бижутерии сверх приборов дают только серьги.
  // Медная серьга (NG) продаётся у Бронника Доры — дроп лишь бонус на NG-охоте 8–18.
  // Фреоновая серьга (D, 20+) в витрину не попадает (D-экип — крафт/дроп): основной
  // источник — боссы 18–23 (×BOSS_RARE_MULT), редкий — элиты и агро-мобы зон 18–22.
  var earringMobDrops = {
    memory_scrubber: [{ id: 'copper_earring', ch: 0.004 }],
    repair_drone: [{ id: 'copper_earring', ch: 0.006 }],
    field_howitzer: [{ id: 'copper_earring', ch: 0.01 }],
    boiler_overpress: [{ id: 'coral_earring', ch: 0.006 }],
    pressure_fiend: [{ id: 'coral_earring', ch: 0.003 }],
    boiler_elemental: [{ id: 'coral_earring', ch: 0.003 }],
    green_steam_wraith: [{ id: 'coral_earring', ch: 0.003 }]
  };
  var earringBossDrops = {
    scrap_tyrant: [{ id: 'copper_earring', ch: 0.15, min: 1, max: 1 }],
    drill_worm: [{ id: 'copper_earring', ch: 0.12, min: 1, max: 1 }],
    steam_roller_bogatyr: [{ id: 'coral_earring', ch: 0.06, min: 1, max: 1 }],
    press_hammer: [{ id: 'coral_earring', ch: 0.10, min: 1, max: 1 }],
    boiler_sovereign: [{ id: 'coral_earring', ch: 0.12, min: 1, max: 1 }],
    cruna_overseer: [{ id: 'coral_earring', ch: 0.10, min: 1, max: 1 }],
    rezdiq_colonel: [{ id: 'coral_earring', ch: 0.10, min: 1, max: 1 }],
    green_protocol: [{ id: 'coral_earring', ch: 0.12, min: 1, max: 1 }],
    steel_colossus: [{ id: 'coral_earring', ch: 0.15, min: 1, max: 1 }]
  };
  Object.keys(earringMobDrops).forEach(function (id) {
    mobEquipAdditions[id] = (mobEquipAdditions[id] || []).concat(earringMobDrops[id]);
  });
  Object.keys(earringBossDrops).forEach(function (id) {
    bossRareAdditions[id] = (bossRareAdditions[id] || []).concat(earringBossDrops[id]);
  });

  var mobSpoilAdditions = {
    welding_automaton: [
      { id: 'pattern_scale_mail_breastplate', min: 1, max: 1, w: 10 },
      { id: 'pattern_scale_mail_gaiters', min: 1, max: 1, w: 10 }
    ],
    forge_apprentice: [
      { id: 'parts_heavy_doom_hammer', min: 1, max: 1, w: 10 },
      { id: 'boiler_plate', min: 1, max: 1, w: 15 }
    ],
    yard_cranelet: [
      { id: 'parts_heavy_doom_hammer', min: 1, max: 1, w: 10 },
      { id: 'boiler_plate', min: 1, max: 1, w: 15 }
    ],
    dry_dock_welder: [
      { id: 'parts_reinforced_bow', min: 1, max: 1, w: 10 },
      { id: 'pattern_reinforced_leather', min: 1, max: 1, w: 10 }
    ],
    oblivion_walker: [
      { id: 'blade_prowler_dagger', min: 1, max: 1, w: 10 },
      { id: 'parts_mace_prayer', min: 1, max: 1, w: 10 },
      { id: 'pattern_knowledge_jacket', min: 1, max: 1, w: 10 }
    ],
    memory_scrubber: [
      { id: 'blade_prowler_dagger', min: 1, max: 1, w: 10 },
      { id: 'parts_mace_prayer', min: 1, max: 1, w: 10 },
      { id: 'pattern_knowledge_jacket', min: 1, max: 1, w: 10 }
    ],
    rezdiq_private: [
      { id: 'blade_revolution_sword', min: 1, max: 1, w: 12 }
    ],
    limit_guard: [
      { id: 'blade_revolution_sword', min: 1, max: 1, w: 12 }
    ]
  };

  var mobRecipeAdditions = {
    rezdiq_private: [
      { id: 'recipe_revolution_sword', ch: 0.003 }
    ],
    limit_guard: [
      { id: 'recipe_revolution_sword', ch: 0.003 },
      { id: 'recipe_reinforced_leather_shirt', ch: 0.004 }
    ],
    drill_sergeant: [
      { id: 'recipe_revolution_sword', ch: 0.003 },
      { id: 'recipe_heavy_doom_hammer', ch: 0.003 },
      { id: 'recipe_scale_mail_breastplate', ch: 0.004 },
      { id: 'recipe_scale_mail_gaiters', ch: 0.004 }
    ],
    fort_enforcer: [
      { id: 'recipe_heavy_doom_hammer', ch: 0.003 },
      { id: 'recipe_scale_mail_breastplate', ch: 0.004 }
    ],
    pressure_fiend: [
      { id: 'recipe_heavy_doom_hammer', ch: 0.003 }
    ],
    fort_turret: [
      { id: 'recipe_reinforced_bow', ch: 0.003 },
      { id: 'recipe_scale_mail_gaiters', ch: 0.004 }
    ],
    boiler_overpress: [
      { id: 'recipe_reinforced_bow', ch: 0.003 },
      { id: 'recipe_reinforced_leather_shirt', ch: 0.004 }
    ],
    dry_dock_welder: [
      { id: 'recipe_reinforced_bow', ch: 0.003 },
      { id: 'recipe_reinforced_leather_shirt', ch: 0.004 }
    ],
    green_steam_wraith: [
      { id: 'recipe_prowler_dagger', ch: 0.003 },
      { id: 'recipe_knowledge_jacket', ch: 0.004 }
    ],
    oblivion_walker: [
      { id: 'recipe_prowler_dagger', ch: 0.003 },
      { id: 'recipe_mace_prayer', ch: 0.003 },
      { id: 'recipe_knowledge_jacket', ch: 0.004 }
    ],
    memory_scrubber: [
      { id: 'recipe_prowler_dagger', ch: 0.003 },
      { id: 'recipe_mace_prayer', ch: 0.003 },
      { id: 'recipe_knowledge_jacket', ch: 0.004 }
    ],
    boiler_elemental: [
      { id: 'recipe_mace_prayer', ch: 0.003 }
    ],
    welding_automaton: [
      { id: 'recipe_scale_mail_breastplate', ch: 0.004 },
      { id: 'recipe_scale_mail_gaiters', ch: 0.004 }
    ]
  };

  // ─── D-шлем, D-сапоги, D-перчатки мага ───
  // После того как D-экип ушёл из витрин (только крафт/дроп), у трёх вещей не осталось
  // источника. Схема как у остального D-доспеха: редкий дроп с элит 17–21, боссы 18–23,
  // лекала — спойлом (вес 10, как у выкроек курток), чертежи — 0.4% с тех же мобов.
  var dPieceMobDrops = {
    fort_enforcer: [{ id: 'steam_helmet', ch: 0.00018 }],
    limit_guard: [{ id: 'steam_helmet', ch: 0.00016 }],
    fort_turret: [{ id: 'steam_boots', ch: 0.00018 }],
    drill_sergeant: [{ id: 'steam_boots', ch: 0.00016 }],
    green_steam_wraith: [{ id: 'knowledge_gloves', ch: 0.00016 }],
    boiler_elemental: [{ id: 'knowledge_gloves', ch: 0.00016 }]
  };
  var dPieceBossDrops = {
    press_hammer: [{ id: 'steam_helmet', ch: 0.12, min: 1, max: 1 }],
    rezdiq_colonel: [{ id: 'steam_helmet', ch: 0.10, min: 1, max: 1 }],
    cruna_overseer: [{ id: 'steam_boots', ch: 0.10, min: 1, max: 1 }],
    steam_roller_bogatyr: [{ id: 'steam_boots', ch: 0.08, min: 1, max: 1 }],
    green_protocol: [{ id: 'knowledge_gloves', ch: 0.12, min: 1, max: 1 }],
    boiler_sovereign: [{ id: 'knowledge_gloves', ch: 0.10, min: 1, max: 1 }]
  };
  var dPieceSpoil = {
    fort_enforcer: [{ id: 'pattern_steam_helmet', min: 1, max: 1, w: 10 }],
    limit_guard: [{ id: 'pattern_steam_helmet', min: 1, max: 1, w: 10 }],
    drill_sergeant: [{ id: 'pattern_steam_boots', min: 1, max: 1, w: 10 }],
    fort_turret: [{ id: 'pattern_steam_boots', min: 1, max: 1, w: 10 }],
    oblivion_walker: [{ id: 'pattern_knowledge_gloves', min: 1, max: 1, w: 10 }],
    memory_scrubber: [{ id: 'pattern_knowledge_gloves', min: 1, max: 1, w: 10 }]
  };
  var dPieceRecipes = {
    fort_enforcer: [{ id: 'recipe_steam_helmet', ch: 0.004 }],
    limit_guard: [{ id: 'recipe_steam_helmet', ch: 0.004 }],
    drill_sergeant: [{ id: 'recipe_steam_boots', ch: 0.004 }],
    fort_turret: [{ id: 'recipe_steam_boots', ch: 0.004 }],
    green_steam_wraith: [{ id: 'recipe_knowledge_gloves', ch: 0.004 }],
    memory_scrubber: [{ id: 'recipe_knowledge_gloves', ch: 0.004 }]
  };
  [[dPieceMobDrops, mobEquipAdditions], [dPieceBossDrops, bossRareAdditions],
   [dPieceSpoil, mobSpoilAdditions], [dPieceRecipes, mobRecipeAdditions]].forEach(function (pair) {
    Object.keys(pair[0]).forEach(function (id) {
      pair[1][id] = (pair[1][id] || []).concat(pair[0][id]);
    });
  });

  // ─── Чертежи: только дроп и спойл (эталон L2 — в магазинах чертежей нет) ───
  // Мастеровой учит чертёж один раз навсегда, поэтому ценность чертежу даёт дефицит:
  // уровень чертежа ↔ уровень мобов (1-й — 2–12, 2-й — 10–17, 3-й — 12–22, D — 13–22).
  // Дроп редкий, спойл Мастерового — основной путь: вес чертежа в пуле спойла
  // (материалы весят по 20, детали D — 10–12). Боссы не спойлятся — у них только дроп.
  var RECIPE_DROP_CH = { 1: 0.008, 2: 0.006, 3: 0.004 };
  var RECIPE_SPOIL_W = { 1: 4, 2: 3, 3: 2, 4: 1 };
  var RECIPE_LEVEL = {
    recipe_synthetic_oil: 1, recipe_soulshot_no_grade: 1, recipe_leather_gloves: 1,
    recipe_work_boots: 1, recipe_piston: 1,
    recipe_copper_shield: 2, recipe_pressure_amplifier: 2, recipe_soulshot_d: 2, recipe_steel_plate: 2,
    recipe_hydraulic_fluid: 3, recipe_hydraulic_blade: 3
  };
  /** Мобы-источники чертежей 1–3 уровня: drop — дроп и спойл, spoilOnly — только спойл. */
  var recipeMobSources = {
    recipe_synthetic_oil:      { drop: ['steam_hound', 'rivulet_pump', 'scrap_picker'] },
    recipe_soulshot_no_grade:  { drop: ['spark_sprite', 'survey_beacon', 'apiary_drone_bee'] },
    recipe_leather_gloves:     { drop: ['steam_hound', 'hill_presser', 'vine_cable'] },
    recipe_work_boots:         { drop: ['rust_mite', 'meadow_mower', 'junk_magpie'] },
    recipe_piston:             { drop: ['hill_presser', 'welding_automaton', 'forge_apprentice'] },
    recipe_copper_shield:      { drop: ['rust_sentry', 'yard_cranelet', 'vine_cable'] },
    recipe_pressure_amplifier: { drop: ['repair_drone', 'dry_dock_welder', 'field_howitzer'] },
    recipe_soulshot_d:         { drop: ['welding_drone', 'garden_sprinkler', 'sparkweld_elite'] },
    recipe_steel_plate:        { drop: ['rust_sentry', 'forge_apprentice', 'yard_cranelet'] },
    recipe_hydraulic_fluid:    { drop: ['steam_crane_spider', 'acid_sprayer', 'kettle_stalker'] },
    recipe_hydraulic_blade:    { spoilOnly: ['kettle_stalker', 'gauge_warden'] }
  };
  /** Боссы фазы 1 (и будущие рейды) — только дроп. */
  var recipeBossDrops = {
    scrap_tyrant: [{ id: 'recipe_piston', ch: 0.08 }],
    drill_worm: [{ id: 'recipe_piston', ch: 0.08 }],
    press_hammer: [{ id: 'recipe_steel_plate', ch: 0.10 }, { id: 'recipe_hydraulic_blade', ch: 0.06 }],
    boiler_sovereign: [{ id: 'recipe_steel_plate', ch: 0.10 }, { id: 'recipe_hydraulic_blade', ch: 0.06 }],
    cruma_core: [{ id: 'recipe_hydraulic_blade', ch: 0.10 }],
    directive_overmind: [{ id: 'recipe_hydraulic_blade', ch: 0.20 }]
  };
  function addRecipeDrop(mobId, add) {
    mobRecipeAdditions[mobId] = (mobRecipeAdditions[mobId] || []).concat([add]);
  }
  function addRecipeSpoil(mobId, recipeId, w) {
    mobSpoilAdditions[mobId] = (mobSpoilAdditions[mobId] || []).concat([{ id: recipeId, min: 1, max: 1, w: w }]);
  }
  Object.keys(recipeMobSources).forEach(function (rid) {
    var src = recipeMobSources[rid];
    var lvl = RECIPE_LEVEL[rid];
    (src.drop || []).forEach(function (mobId) {
      addRecipeDrop(mobId, { id: rid, ch: RECIPE_DROP_CH[lvl] });
      addRecipeSpoil(mobId, rid, RECIPE_SPOIL_W[lvl]);
    });
    (src.spoilOnly || []).forEach(function (mobId) { addRecipeSpoil(mobId, rid, 1); });
  });
  // D-чертежи (дроп 0.3–0.4% выше): спойлом с тех же мобов, вес 1.
  Object.keys(mobRecipeAdditions).forEach(function (mobId) {
    mobRecipeAdditions[mobId].forEach(function (r) {
      if (!RECIPE_LEVEL[r.id]) addRecipeSpoil(mobId, r.id, RECIPE_SPOIL_W[4]);
    });
  });
  Object.keys(recipeBossDrops).forEach(function (mobId) {
    recipeBossDrops[mobId].forEach(function (add) { addRecipeDrop(mobId, add); });
  });

  // ─── Кристаллы D: соло-мобы 15–20 (раньше ~1% только у четырёх мобов 18–20) ───
  // На D-вещь нужно 10–45 кристаллов; прогон экономики показал ~60 ч фарма на одно D-оружие.
  // Цель: D-оружие ≈ 10 ч соло-фарма кристаллов, у Мастерового со спойлом ≈ 5–6 ч.
  // Полоса 15–17 — по 1 шт. 2%, полоса 18–20 — 1–2 шт. 5%; спойл (вес в пуле) — 2 и 4.
  var crystalDBands = [
    { mobs: ['oblivion_walker', 'memory_scrubber', 'range_spotter', 'rogue_target', 'steam_crane_spider', 'flash_camera', 'power_meter'],
      drop: { ch: 0.02, min: 1, max: 1 }, spoil: { w: 2, min: 1, max: 1 } },
    { mobs: ['rezdiq_private', 'gauge_warden', 'kettle_stalker', 'iron_crawler', 'dryer_hound', 'phone_one_percent', 'laptop_update'],
      drop: { ch: 0.05, min: 1, max: 2 }, spoil: { w: 4, min: 1, max: 2 } }
  ];
  var mobCrystalDOverride = {};
  crystalDBands.forEach(function (band) {
    band.mobs.forEach(function (mobId) {
      mobCrystalDOverride[mobId] = { id: 'crystal_d', ch: band.drop.ch, min: band.drop.min, max: band.drop.max };
      mobSpoilAdditions[mobId] = (mobSpoilAdditions[mobId] || []).concat([
        { id: 'crystal_d', min: band.spoil.min, max: band.spoil.max, w: band.spoil.w }
      ]);
    });
  });

  var mobQuestAdditions = {
    // Квестовые предметы целей «собрать» (эталон L2: падают с квестовых мобов и только
    // тем, у кого квест взят — фильтр в server/handlers/mob-handler.js)
    scrapper: [{ id: 'quest_perimeter_coal', ch: 0.5, min: 1, max: 1 }],
    // цепочка «Принято в ремонт» (этап 7): бирки и чеки Приёмщика на технике
    brick_phone: [{ id: 'quest_repair_receipt', ch: 0.5, min: 1, max: 1 }],
    garland_tangle: [{ id: 'quest_repair_receipt', ch: 0.5, min: 1, max: 1 }],
    cash_register: [{ id: 'quest_window0_check', ch: 0.55, min: 1, max: 1 }],
    intercom_whois: [{ id: 'quest_window0_check', ch: 0.4, min: 1, max: 1 }],
    power_meter: [{ id: 'quest_repair_log_page', ch: 0.5, min: 1, max: 1 }],
    flash_camera: [{ id: 'quest_repair_log_page', ch: 0.4, min: 1, max: 1 }],
    laptop_update: [{ id: 'quest_pickup_tag', ch: 0.35, min: 1, max: 1 }],
    phone_one_percent: [{ id: 'quest_pickup_tag', ch: 0.3, min: 1, max: 1 }],
    rivulet_pump: [{ id: 'quest_pump_echo_valve', ch: 0.5, min: 1, max: 1 }],
    scrap_picker: [{ id: 'quest_vex_scrap_sample', ch: 0.6, min: 1, max: 1 }],
    apiary_drone_bee: [{ id: 'quest_bee_wax_seal', ch: 0.5, min: 1, max: 1 }],
    iron_crawler: [{ id: 'quest_branded_drive_bone', ch: 0.6, min: 1, max: 1 }],
    steam_crane_spider: [
      { id: 'quest_contour_filter', ch: 0.5, min: 1, max: 1 },
      { id: 'quest_adjuster_filter', ch: 0.5, min: 1, max: 1 },
      { id: 'spark_resonator', ch: 0.35, min: 1, max: 1 },
      { id: 'oil_crystal', ch: 0.30, min: 1, max: 1 }
    ],
    // repeatable_cable_raiders (Gilbert lvl 6+)
    steam_hound: [{ id: 'quest_copper_wire', ch: 1.0, min: 1, max: 2 }, { id: 'quest_hound_reel', ch: 0.5, min: 1, max: 1 }],
    meadow_mower: [{ id: 'quest_copper_wire', ch: 1.0, min: 1, max: 2 }],
    survey_beacon: [{ id: 'quest_copper_wire', ch: 1.0, min: 1, max: 2 }],
    bridge_toll_bot: [{ id: 'quest_copper_wire', ch: 1.0, min: 1, max: 2 }],

    // repeatable_heavy_nodes (Vex lvl 10+)
    hill_presser: [{ id: 'quest_bent_piston', ch: 0.8, min: 1, max: 1 }],
    welding_automaton: [{ id: 'quest_bent_piston', ch: 0.8, min: 1, max: 1 }, { id: 'quest_certification_seal', ch: 0.5, min: 1, max: 1 }],
    welding_drone: [{ id: 'quest_bent_piston', ch: 0.8, min: 1, max: 1 }],
    rust_sentry: [{ id: 'quest_bent_piston', ch: 0.8, min: 1, max: 1 }],

    // repeatable_oblivion_collector (Biotin lvl 14+)
    oblivion_walker: [
      { id: 'quest_rezdiq_patrol_log', ch: 0.5, min: 1, max: 1 },
      { id: 'quest_memory_gear', ch: 0.65, min: 1, max: 1 },
      { id: 'quest_acid_valve', ch: 0.50, min: 1, max: 1 },
      { id: 'quest_corrupted_chip', ch: 0.35, min: 1, max: 1 }
    ],
    memory_scrubber: [
      { id: 'quest_memory_gear', ch: 0.65, min: 1, max: 1 },
      { id: 'quest_acid_valve', ch: 0.50, min: 1, max: 1 },
      { id: 'quest_corrupted_chip', ch: 0.35, min: 1, max: 1 }
    ],
    rogue_target: [
      { id: 'quest_memory_gear', ch: 0.65, min: 1, max: 1 },
      { id: 'quest_acid_valve', ch: 0.50, min: 1, max: 1 },
      { id: 'quest_corrupted_chip', ch: 0.35, min: 1, max: 1 }
    ],
    acid_sprayer: [
      { id: 'quest_memory_gear', ch: 0.65, min: 1, max: 1 },
      { id: 'quest_acid_valve', ch: 0.50, min: 1, max: 1 },
      { id: 'quest_corrupted_chip', ch: 0.35, min: 1, max: 1 }
    ],

    // repeatable_rezdiq_tags (Rid lvl 17+)
    rezdiq_private: [{ id: 'quest_rezdiq_dogtag', ch: 0.75, min: 1, max: 1 }],
    drill_sergeant: [{ id: 'quest_rezdiq_dogtag', ch: 0.75, min: 1, max: 1 }],
    limit_guard: [{ id: 'quest_rezdiq_dogtag', ch: 0.75, min: 1, max: 1 }]
  };
  // Сюжетные и групповые квесты «Песнь и порча» (этап 2): квестовый дроп 50%
  [
    ['loose_bolt', 'quest_rattling_bolt', 0.5],
    ['rust_mite', 'quest_rattling_bolt', 0.5],
    ['junk_magpie', 'quest_singing_gear', 0.5],
    ['memory_scrubber', 'quest_erased_plate', 0.5],
    ['acid_sprayer', 'quest_protocol_fragment', 0.5],
    ['dryer_hound', 'quest_cold_boiler_valve', 0.5],
    ['field_howitzer', 'quest_targeting_map', 0.5],
    ['green_fault_drone', 'quest_memory_canister', 0.5],
    ['pressure_fiend', 'quest_voice_clot', 0.5],
  ].forEach(function (r) {
    mobQuestAdditions[r[0]] = (mobQuestAdditions[r[0]] || []).concat([{ id: r[1], ch: r[2], min: 1, max: 1 }]);
  });

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

    if (mobSpoilAdditions[sp.id]) {
      var baseMats = (sp.spoil || sp.mats || []).slice();
      mobSpoilAdditions[sp.id].forEach(function (add) {
        if (!baseMats.some(function (m) { return m.id === add.id; })) {
          baseMats.push(add);
        }
      });
      sp.spoil = baseMats;
    }

    if (mobRecipeAdditions[sp.id]) {
      sp.recipe = sp.recipe || [];
      mobRecipeAdditions[sp.id].forEach(function (add) {
        if (!sp.recipe.some(function (r) { return r.id === add.id; })) {
          sp.recipe.push(add);
        }
      });
    }

    if (mobCrystalDOverride[sp.id]) {
      sp.crystal = (sp.crystal || []).filter(function (c) { return c.id !== 'crystal_d'; })
        .concat([mobCrystalDOverride[sp.id]]);
    }

    if (mobQuestAdditions[sp.id]) {
      sp.quest = sp.quest || [];
      mobQuestAdditions[sp.id].forEach(function (add) {
        if (!sp.quest.some(function (q) { return q.id === add.id; })) {
          sp.quest.push(add);
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

/**
 * L2: усилители заточки раздельные — оружие (Enchant Weapon) и броня (Enchant Armor).
 * Каждый источник оружейного усилителя даёт и бронный с тем же ожидаемым шансом:
 * к группе добавляется парная группа с шансом chance × (вес усилителей / вес группы),
 * поэтому остальной дроп группы не меняется.
 */
const ARMOR_AMPLIFIER_OF = {
  pressure_amplifier: 'armor_pressure_amplifier',
  pressure_amplifier_d: 'armor_pressure_amplifier_d',
  blessed_pressure_amplifier: 'blessed_armor_pressure_amplifier'
};
function mirrorArmorAmplifiers(T) {
  ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special'].forEach(function (key) {
    var sec = T[key];
    if (!sec || !Array.isArray(sec.groups)) return;
    var extra = [];
    sec.groups.forEach(function (g) {
      var items = g.items || [];
      var total = 0, ampW = 0;
      items.forEach(function (it) { total += it.weight; if (ARMOR_AMPLIFIER_OF[it.id]) ampW += it.weight; });
      if (!ampW || !total) return;
      extra.push({
        id: g.id + '_armor_amp',
        chance: g.chance * (ampW / total),
        items: items.filter(function (it) { return ARMOR_AMPLIFIER_OF[it.id]; })
          .map(function (it) { return Object.assign({}, it, { id: ARMOR_AMPLIFIER_OF[it.id] }); })
      });
    });
    if (extra.length) sec.groups = sec.groups.concat(extra);
  });
  if (T.spoil && Array.isArray(T.spoil.groups)) {
    T.spoil.groups.forEach(function (g) {
      var add = (g.items || []).filter(function (it) { return ARMOR_AMPLIFIER_OF[it.id]; })
        .map(function (it) { return Object.assign({}, it, { id: ARMOR_AMPLIFIER_OF[it.id] }); });
      if (add.length) g.items = g.items.concat(add);
    });
  }
  return T;
}
Object.keys(MOB_LOOT_TABLES).forEach(function (k) { mirrorArmorAmplifiers(MOB_LOOT_TABLES[k]); });

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

  // Модификатор шанса дропа/адены по разнице уровней (pl — старший уровень группы-победителя)
  function levelMod(pl, ml) {
    var DB = LOOT_CONFIG.DEEP_BLUE;
    var diff = (+pl || 1) - (+ml || 1);
    if (diff < DB.START_DIFF) return { drop: 1, adena: 1 };
    var m = Math.max(0, 1 - (diff - (DB.START_DIFF - 1)) * DB.PCT_PER_LEVEL / 100) / DB.DIVISOR;
    return { drop: m, adena: m };
  }

  // Медь от уровня спавна. Таблицы _C1_SPECS — медь C1 на «родном» уровне моба, а уровень
  // спота берётся из полосы зоны (Бумбокс с таблицей 10-го ур. стоял на спотах 5–17).
  // Множитель = COPPER_TARGET(ур. спавна) / COPPER_C1(середина уровней спеки): моб богаче или
  // беднее соседей — так и остаётся, но медь идёт за уровнем спота.
  // COPPER_C1 — средняя медь соло-треша C1 по таблицам. COPPER_TARGET с 6 ур. выше: заряды
  // стоят 15 × 6–10 ударов, и гринд с зарядами уходил в минус; цель — медь ≈ 1.1–1.4× зарядов
  // (как в L2: заряды окупаются, но не кормят). До 5 ур. включительно — как было.
  var COPPER_C1 = [[1, 1.2], [5, 4.5], [8, 12], [10, 19], [12, 30], [14, 46], [16, 62], [18, 84], [20, 98], [25, 140], [40, 260]];
  var COPPER_TARGET = [[1, 1.2], [5, 4.5], [6, 55], [8, 92], [10, 100], [12, 118], [14, 128], [16, 136], [18, 150], [20, 163], [25, 210], [40, 350]];
  function curveAt(tbl, L) {
    L = +L || 1;
    if (L <= tbl[0][0]) return tbl[0][1];
    for (var i = 1; i < tbl.length; i++) {
      if (L <= tbl[i][0]) {
        var a = tbl[i - 1], b = tbl[i];
        return a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0]);
      }
    }
    return tbl[tbl.length - 1][1];
  }
  /** Множитель меди моба на уровне спавна ml. specLevel — [lo,hi] из спеки (нет — берём ml). */
  function copperLevelMult(specLevel, ml) {
    var mid = Array.isArray(specLevel) ? (specLevel[0] + specLevel[1]) / 2 : (+ml || 1);
    return curveAt(COPPER_TARGET, ml || mid) / curveAt(COPPER_C1, mid);
  }

  // Взвешенный выбор одного предмета из группы
  function weightedPick(items) {
    var s = 0, i; for (i = 0; i < items.length; i++) s += items[i].weight;
    var r = Math.random() * s, acc = 0;
    for (i = 0; i < items.length; i++) { acc += items[i].weight; if (r <= acc) return items[i]; }
    return items[items.length - 1];
  }

  // Выведенные из экономики предметы (item-db: retired) не выпадают — их просто нет в группе.
  var _itemDb = null;
  function isRetired(id) {
    if (!_itemDb) { try { _itemDb = require('../../shared/item-db.js'); } catch (e) { _itemDb = { get: function () { return null; } }; } }
    var t = _itemDb.get ? _itemDb.get(id) : null;
    return !!(t && t.retired);
  }
  function liveItems(items) {
    var out = [];
    for (var i = 0; i < (items || []).length; i++) if (!isRetired(items[i].id)) out.push(items[i]);
    return out;
  }

  function rollGroup(grp, lm, extraMult) {
    var items = liveItems(grp.items);
    if (!items.length) return null;
    var ch = grp.chance * lm.drop * (extraMult || 1);
    if (ch <= 0 || Math.random() > Math.min(1, ch)) return null;
    var it = weightedPick(items);
    return { id: it.id, count: rng(it.min, it.max) };
  }

  // Основной дроп моба -> {adena, items:[{id,count}], crit}  (контракт с server.onMobDeath)
  // Множители: BASE_* × (boss ? BOSS_* : 1) × (event ? EVENT_* : 1) × levelMod.
  // Таблицы RB/raid уже финальные → BOSS_ADENA/DROP = 1.0; BOSS_RARE даёт лёгкий luck на cores.
  function rollMobLoot(mobId, pl, ml, opts) {
    opts = opts || {};
    var T = MOB_LOOT_TABLES[mobId] || (typeof lootFallbackByLevel === 'function' ? lootFallbackByLevel(ml || 1) : null);
    if (!T) return { adena: 0, items: [], crit: false };
    var lm = levelMod(pl, ml);
    var isBoss = !!opts.boss;
    var isEvent = !!opts.event;
    var isChamp = !!opts.champion && !isBoss;
    var adenaMult = (LOOT_CONFIG.BASE_ADENA_RATE || 1) *
      (isBoss ? (LOOT_CONFIG.BOSS_ADENA_MULT || 1) : 1) *
      (isEvent ? (LOOT_CONFIG.EVENT_ADENA_MULT || 1) : 1) *
      (isChamp ? 1.5 : 1);
    var extraDropMult = opts.dropMult != null && +opts.dropMult > 0 ? +opts.dropMult : 1;
    var dropMult = (LOOT_CONFIG.BASE_DROP_RATE || 1) *
      (isBoss ? (LOOT_CONFIG.BOSS_DROP_MULT || 1) : 1) *
      (isEvent ? (LOOT_CONFIG.EVENT_DROP_MULT || 1) : 1) *
      (isChamp ? 1.35 : 1) * extraDropMult;
    // rare/special: dropMult + дополнительный boss rare luck
    var rareMult = dropMult * (isBoss ? (LOOT_CONFIG.BOSS_RARE_MULT || 1) : 1);
    var adena = 0, items = [];
    // боссы, рейды и именные — свои финальные таблицы, без пересчёта по уровню
    var copperMult = isBoss ? 1 : copperLevelMult(T.level, ml);
    if (T.adena && T.adena.groups) T.adena.groups.forEach(function (g) {
      if (Math.random() < Math.min(1, g.chance * lm.adena)) {
        var v = rng(g.min, g.max) * adenaMult;
        adena += copperMult === 1 ? Math.floor(v) : Math.round(v * copperMult);
      }
    });
    ['common', 'equipment', 'rare', 'recipes', 'crystals', 'special'].forEach(function (key) {
      var sec = T[key]; if (!sec || !sec.groups) return;
      var em = (key === 'rare' || key === 'special') ? rareMult : dropMult;
      sec.groups.forEach(function (g) {
        var res = rollGroup(g, lm, em);
        if (res) items.push(res);
      });
    });
    return { adena: Math.floor(adena), items: items, crit: false };
  }

  // Spoil -> массив [{id,count}] или null (неудача) / [] (успех но пусто)
  // opts.chanceMult — «Намётанный глаз» Утилизатора (×1.3), шанс не выше 100%.
  function rollSpoil(mobId, pl, ml, opts) {
    var T = MOB_LOOT_TABLES[mobId];
    if (!T || !T.spoil || !T.spoil.chance) return null;
    var mult = opts && +opts.chanceMult > 0 ? +opts.chanceMult : 1;
    if (Math.random() > Math.min(1, T.spoil.chance * mult)) return [];
    var pool = [];
    (T.spoil.groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { pool.push(it); }); });
    pool = liveItems(pool);
    if (!pool.length) return [];
    var it = weightedPick(pool);
    return [{ id: it.id, count: rng(it.min, it.max) }];
  }

module.exports = {
  LOOT_CONFIG,
  MOB_LOOT_TABLES,
  levelMod,
  copperLevelMult,
  rollMobLoot,
  rollSpoil,
  weightedPick,
  lootFallbackByLevel,
  ARMOR_AMPLIFIER_OF,
  mirrorArmorAmplifiers
};
