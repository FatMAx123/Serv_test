// SHARED / GAME-RULES.JS — единый источник правил (сервер=авторитет, клиент=предсказание)
// Бой: формулы классических MMO C1 (shared/l2-combat.js). C.Atk = схемы, не «магия».
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GAME_RULES = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function rng(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

  // class-system (shared): раса/пол/профессии
  var CS = null;
  var L2 = null;
  var EV = null;
  try {
    if (typeof require !== 'undefined') {
      CS = require('./class-system.js');
      try { L2 = require('./l2-combat.js'); } catch (e2) { L2 = null; }
      try { EV = require('./event-rules.js'); } catch (eEv) { EV = null; }
    }
  } catch (e) { CS = null; }
  var _g = (typeof window !== 'undefined') ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (!CS && _g && _g.CLASS_SYSTEM) CS = _g.CLASS_SYSTEM;
  if (!L2 && _g && _g.L2_COMBAT) L2 = _g.L2_COMBAT;
  if (!EV && _g && _g.EVENT_RULES) EV = _g.EVENT_RULES;

  // Регионы: только WorldMetrics (деревня + hunt-zones редактора). Здесь — fallback.
  var REGIONS = [
    { id: 'village', name: 'Деревня поющей стали', bounds: [-400, -420, 160, -83], peace: true, level: [0, 0] }
  ];
  function regionAt(x, z) {
    if (typeof window !== 'undefined' && window.WorldMetrics && window.WorldMetrics.regionAt) {
      return window.WorldMetrics.regionAt(x, z);
    }
    try {
      var WM = require('./world-metrics.js');
      if (WM && WM.regionAt) return WM.regionAt(x, z);
    } catch (e) {}
    // fallback: деревня или wild
    for (var i = 0; i < REGIONS.length; i++) {
      var r = REGIONS[i];
      if (x >= r.bounds[0] && x <= r.bounds[2] && z >= r.bounds[1] && z <= r.bounds[3]) {
        return { id: r.id, name: r.name, peace: true, bounds: r.bounds, levelRange: r.level };
      }
    }
    return { id: 'wild', name: 'Остров поющей стали', peace: false, bounds: [-2000, -2000, 2000, 2000] };
  }

  // Споты мобов — только WorldMetrics.MOB_SPOTS (зоны редактора).
  // Здесь пусто: сервер/клиент читают WM.buildSpots().
  var MOB_SPOTS = [];

  /**
   * Мобы 1–40: HP/P.Atk/P.Def ≈ C1-ish curve.
   * cDef калиброван под L2j magic: 91×√C.Atk×Power/C.Def
   * Цели TTK Wind Strike (инженер starter gear + Power по рангу):
   *   L1 P12 ~2–3 · L7 P15 ~4–7 · L14 P21 ~7–12 · L20 P21 ~10–16
   * (bare без экипа чуть медленнее; constructor relative skills сильнее WS)
   */
  function mobStats(level, mobId) {
    // Если есть MOB_DB и конкретный id — роль × кривая (баланс solo/party/raid)
    var MDB = null;
    try {
      if (typeof require !== 'undefined') {
        try { MDB = require('./mob-db.js'); } catch (e0) { MDB = null; }
      }
    } catch (e1) { MDB = null; }
    if (!MDB && _g && _g.MOB_DB) MDB = _g.MOB_DB;
    if (MDB && mobId && MDB.statsAtLevel) {
      var st = MDB.statsAtLevel(mobId, level);
      return {
        hp: st.hp, pAtk: st.pAtk, pDef: st.pDef,
        cAtk: st.cAtk, cDef: st.cDef, mAtk: st.mAtk, mDef: st.mDef,
        accuracy: st.accuracy, evasion: st.evasion,
        exp: st.exp, aggro: st.aggro, speed: st.speed,
        sp: st.sp, critRate: st.critRate, respawn: st.respawn
      };
    }
    // Fallback = L2 curve из MOB_DB (Mob Scaling CSV + C1 pDef)
    if (MDB && MDB.baseCurve) {
      var st0 = MDB.baseCurve(level);
      return {
        hp: st0.hp, pAtk: st0.pAtk, pDef: st0.pDef,
        cAtk: st0.cAtk, cDef: st0.cDef, mAtk: st0.mAtk, mDef: st0.mDef,
        accuracy: st0.accuracy, evasion: st0.evasion,
        exp: st0.exp, aggro: st0.aggro, speed: st0.speed
      };
    }
    var L = Math.max(1, level | 0);
    // emergency anchors (sync with mob-db L2_MOB_ANCHORS)
    var hp = Math.floor(40 + L * 20 + Math.pow(L, 2.1) * 3.2);
    var pAtk = Math.floor(6 + L * 3.2 + Math.pow(L, 1.45) * 0.9);
    var pDef = Math.floor(48 + L * 1.9 + Math.pow(L, 1.22) * 0.85);
    var cDef = Math.floor(52 + L * 1.55 + Math.pow(L, 1.12) * 0.72);
    var cAtk = Math.floor(4 + L * 1.6 + Math.pow(L, 1.3) * 0.4);
    var exp = Math.floor(20 + L * 12 + Math.pow(L, 2.2) * 2.4);
    return {
      hp: hp, pAtk: pAtk, pDef: pDef, cAtk: cAtk, cDef: cDef,
      mAtk: cAtk, mDef: cDef,
      accuracy: Math.floor(18 + L * 1.4),
      evasion: Math.floor(12 + L * 1.1),
      exp: exp,
      aggro: L <= 5 ? 0 : (L <= 15 ? 8 : 12),
      speed: 3.2 + L * 0.04
    };
  }

  function _bossFromDb(id, fallback) {
    var MDB = null;
    try {
      if (typeof require !== 'undefined') {
        try { MDB = require('./mob-db.js'); } catch (e0) { MDB = null; }
      }
    } catch (e1) { MDB = null; }
    if (!MDB && _g && _g.MOB_DB) MDB = _g.MOB_DB;
    if (MDB && MDB.get && MDB.statsAtLevel) {
      var m = MDB.get(id);
      if (m) {
        var mid = Math.floor((m.level[0] + m.level[1]) / 2);
        var s = MDB.statsAtLevel(id, mid);
        return {
          name: m.name, hp: s.hp, pAtk: s.pAtk, pDef: s.pDef, exp: s.exp,
          aggro: s.aggro || 25, speed: s.speed || 2
        };
      }
    }
    return fallback;
  }

  // Статы босса для спавна. Лут НЕ здесь — только shared/loot-rules.js (rollMobLoot).
  var BOSSES = {
    // ─── Phase 1 raids (1–20) ───
    scrap_tyrant: _bossFromDb('scrap_tyrant', {
      name: 'Тиран Свалки', hp: 14000, pAtk: 95, pDef: 28, cAtk: 70, cDef: 26, exp: 9000, aggro: 26, speed: 2.8
    }),
    drill_worm: _bossFromDb('drill_worm', {
      name: 'Босс-Бур', hp: 22000, pAtk: 115, pDef: 32, cAtk: 90, cDef: 30, exp: 14000, aggro: 30, speed: 4.2
    }),
    press_hammer: _bossFromDb('press_hammer', {
      name: 'Автономный Пресс-Молот', hp: 32000, pAtk: 140, pDef: 38, cAtk: 110, cDef: 34, exp: 22000, aggro: 28, speed: 2.2
    }),
    boiler_sovereign: _bossFromDb('boiler_sovereign', {
      name: 'Суверен Котла', hp: 42000, pAtk: 155, pDef: 42, cAtk: 125, cDef: 38, exp: 32000, aggro: 32, speed: 2.0
    }),
    // ─── Phase 1 High & Pinnacle Bosses (20–23) ───
    cruna_overseer: _bossFromDb('cruna_overseer', {
      name: 'Надзиратель Круны', hp: 50400, pAtk: 255, pDef: 159, exp: 35200, aggro: 24, speed: 2.8
    }),
    rezdiq_colonel: _bossFromDb('rezdiq_colonel', {
      name: 'Полковник Рездик-VII', hp: 57960, pAtk: 277, pDef: 164, exp: 40960, aggro: 24, speed: 3.5
    }),
    green_protocol: _bossFromDb('green_protocol', {
      name: 'Протокол «Зелёный»', hp: 145600, pAtk: 343, pDef: 186, exp: 93440, aggro: 30, speed: 2.5
    }),
    steel_colossus: _bossFromDb('steel_colossus', {
      name: 'Стальной Колосс Предела', hp: 145600, pAtk: 343, pDef: 186, exp: 93440, aggro: 32, speed: 2.0
    }),
    // ─── Future expansions (Phase 2+) ───
    directive_overmind: _bossFromDb('directive_overmind', {
      name: 'Коллективный Разум', hp: 120000, pAtk: 320, pDef: 70, exp: 90000, aggro: 40, speed: 2.2
    })
  };

  /**
   * L2 physical roll. critChance: 0–1 fraction or 0–100 percent.
   * opts: { skillPower, damageType: 'physical'|'circuit' }
   */
  function rollDamage(aAtk, dDef, critChance, opts) {
    if (L2 && L2.rollDamage) {
      var r = L2.rollDamage(aAtk, dDef, critChance, opts);
      return { dmg: r.dmg, crit: r.crit, damage: r.dmg, isCrit: r.crit };
    }
    var power = (opts && opts.skillPower != null) ? opts.skillPower : 1.0;
    var norm = (opts && opts.damageType === 'circuit') ? 90 : 70;
    var rmin = (opts && opts.damageType === 'circuit') ? 0.90 : 0.85;
    var rspan = (opts && opts.damageType === 'circuit') ? 0.20 : 0.30;
    var base = ((aAtk * power) / (dDef + aAtk)) * norm * (rmin + Math.random() * rspan);
    var cp = critChance;
    if (cp == null) cp = 0.15;
    if (cp > 1) cp = cp / 100;
    var crit = Math.random() < cp;
    if (crit) base *= 2;
    var dmg = Math.max(1, Math.floor(base));
    return { dmg: dmg, crit: crit, damage: dmg, isCrit: crit };
  }
  function playerPAtk(lv, cls) {
    if (CS && CS.statsAtLevel) return CS.statsAtLevel(cls || 'operator', lv).pAtk;
    return 10 + lv * 3;
  }
  function playerPDef(lv, cls) {
    if (CS && CS.statsAtLevel) return CS.statsAtLevel(cls || 'operator', lv).pDef;
    return 5 + lv * 2;
  }
  function playerMaxHp(lv, cls) {
    if (CS && CS.statsAtLevel) return CS.statsAtLevel(cls || 'operator', lv).maxHp;
    return 100 + lv * 20;
  }
  function playerMaxEnergy(lv, cls) {
    if (CS && CS.statsAtLevel) return CS.statsAtLevel(cls || 'operator', lv).maxEnergy;
    return 50 + lv * 8;
  }
  function playerCAtk(lv, cls) {
    if (CS && CS.statsAtLevel) {
      var s = CS.statsAtLevel(cls || 'operator', lv);
      return s.cAtk != null ? s.cAtk : s.mAtk;
    }
    return 6 + lv * 1;
  }
  function playerCDef(lv, cls) {
    if (CS && CS.statsAtLevel) {
      var s = CS.statsAtLevel(cls || 'operator', lv);
      return s.cDef != null ? s.cDef : s.mDef;
    }
    return 5 + lv * 1;
  }
  // legacy aliases
  function playerMAtk(lv, cls) { return playerCAtk(lv, cls); }
  function playerMDef(lv, cls) { return playerCDef(lv, cls); }

  function expModifier(pl, ml) {
    if (L2 && L2.expModifier) return L2.expModifier(pl, ml);
    var d = ml - pl;
    if (d >= 9) return 1.5; if (d >= 6) return 1.3; if (d >= 3) return 1.1; if (d >= -3) return 1.0;
    if (d >= -6) return 0.7; if (d >= -9) return 0.4; return 0.1;
  }

  var DROP = {
    scrapper:          { adena:[12,38],   items:[{id:'gear_fragment',c:0.7,a:[1,2]},{id:'copper_cable',c:0.2,a:[1,1]},{id:'synthetic_oil',c:0.25,a:[1,2]}] },
    steam_hound:       { adena:[35,95],   items:[{id:'gear_fragment',c:0.7,a:[1,3]},{id:'piston_ring',c:0.2,a:[1,1]},{id:'pressure_canister',c:0.3,a:[1,2]},{id:'copper_earring',c:0.02,a:[1,1]}] },
    welding_automaton: { adena:[80,220],  items:[{id:'gear_fragment',c:0.8,a:[2,5]},{id:'boiler_plate',c:0.2,a:[1,1]},{id:'pressure_amplifier',c:0.12,a:[1,2]},{id:'steam_hammer',c:0.008,a:[1,1]},{id:'mage_staff',c:0.004,a:[1,1]},{id:'mace_prayer',c:0.002,a:[1,1]},{id:'recipe_piston',c:0.02,a:[1,1]}] },
    welding_drone:     { adena:[65,180],  items:[{id:'gear_fragment',c:0.78,a:[1,4]},{id:'spark_plug',c:0.3,a:[1,2]},{id:'pressure_amplifier',c:0.1,a:[1,2]},{id:'pneumatic_rifle',c:0.006,a:[1,1]},{id:'magic_mace',c:0.003,a:[1,1]},{id:'mace_prayer',c:0.002,a:[1,1]},{id:'recipe_steel_plate',c:0.02,a:[1,1]}] },
    steam_crane_spider:{ adena:[100,280], items:[{id:'gear_fragment',c:0.82,a:[2,5]},{id:'hydraulic_fluid',c:0.25,a:[1,2]},{id:'pressure_amplifier',c:0.15,a:[1,2]},{id:'boiler_plate',c:0.2,a:[1,2]},{id:'colossus_fragment',c:0.08,a:[1,1]},{id:'demon_fangs',c:0.003,a:[1,1]},{id:'tears_fairy',c:0.002,a:[1,1]}] }
  };
  function rollDrop(mobId, pl, ml, bossDrop) {
    var t = bossDrop || DROP[mobId]; if (!t) return { adena: 0, items: [] };
    var mult = bossDrop ? 1 : expModifier(pl, ml);
    var adena = Math.floor(rng(t.adena[0], t.adena[1]) * (bossDrop ? 1 : Math.max(0.3, mult)));
    var items = [];
    for (var i = 0; i < t.items.length; i++) {
      var it = t.items[i];
      if (Math.random() < it.c * (bossDrop ? 1 : Math.min(1.5, mult + 0.3))) items.push({ id: it.id, count: rng(it.a[0], it.a[1]) });
    }
    return { adena: adena, items: items };
  }

  // Крафт-лестница C1-стиля: соски/банки из ресов (не с моба пачкой), эквип — mid+
  var RECIPES = {
    // Low: двор/холмы
    synthetic_oil:     { result:{id:'synthetic_oil',n:5},      chance:1.0, mats:[{id:'gear_fragment',n:2},{id:'oil_filter',n:1}] },
    pressure_canister: { result:{id:'pressure_canister',n:3},  chance:1.0, mats:[{id:'iron_scrap',n:3},{id:'steam_valve',n:1}] },
    soulshot_no_grade: { result:{id:'soulshot_no_grade',n:100}, chance:1.0, mats:[{id:'crystal_no_grade',n:1},{id:'spark_plug',n:1},{id:'coal_briquette',n:2}] },
    leather_gloves:    { result:{id:'leather_gloves',n:1},     chance:1.0, mats:[{id:'rubber_skin',n:8},{id:'gasket_suede',n:4},{id:'copper_cable',n:2}] },
    work_boots:        { result:{id:'work_boots',n:1},         chance:1.0, mats:[{id:'rubber_skin',n:10},{id:'coal_briquette',n:5},{id:'iron_scrap',n:4}] },
    piston:            { result:{id:'piston_component',n:1},   chance:0.9, mats:[{id:'iron_scrap',n:10},{id:'piston_ring',n:2},{id:'crystal_d',n:1}] },
    // Mid: големы / заводь
    copper_shield:     { result:{id:'copper_shield',n:1},      chance:0.9, mats:[{id:'iron_scrap',n:15},{id:'copper_cable',n:8},{id:'coal_briquette',n:6}] },
    pressure_amplifier:{ result:{id:'pressure_amplifier',n:1}, chance:0.8, mats:[{id:'steam_valve',n:2},{id:'pressure_gauge',n:1},{id:'crystal_no_grade',n:3},{id:'varnish_seal',n:2}] },
    soulshot_d:        { result:{id:'soulshot_d',n:100},       chance:0.95, mats:[{id:'crystal_d',n:1},{id:'spark_plug',n:2},{id:'varnish_seal',n:3}] },
    steel_plate:       { result:{id:'boiler_plate',n:2},       chance:0.7, mats:[{id:'iron_scrap',n:20},{id:'coal_briquette',n:10},{id:'crystal_d',n:3}] },
    // High-low: котлы / руины
    hydraulic_fluid:   { result:{id:'hydraulic_fluid',n:3},    chance:0.85, mats:[{id:'varnish_seal',n:4},{id:'oil_filter',n:3},{id:'drive_bone',n:2}] },
    hydraulic_blade:   { result:{id:'hydraulic_blade',n:1},    chance:0.4, mats:[{id:'boiler_plate',n:3},{id:'hydraulic_fluid',n:8},{id:'crystal_c',n:5},{id:'pressure_amplifier_d',n:3},{id:'silver_flux',n:2}] }
  };

  var ENCHANT_RATE = { 0:1,1:1,2:1,3:0.7,4:0.6,5:0.5,6:0.4,7:0.35,8:0.3,9:0.25,10:0.2 };
  var ENCHANT_SAFE = 3;
  function enchantSuccess(p) { return ENCHANT_RATE[p] != null ? ENCHANT_RATE[p] : 0.08; }

  var CONSUMABLES = {
    synthetic_oil: { healHp: 50 },
    emergency_repair_kit: { healHp: 150 },
    pressure_canister: { healEnergy: 30 },
    high_pressure_tank: { healEnergy: 80 },
    potion_alacrity: { atkSpdMult: 1.15, duration: 1200, icon: 'potion_alacrity' },
    potion_wind_walk: { speedMult: 1.20, duration: 1200, icon: 'potion_wind_walk' },
    scroll_escape: { escapeToCity: true },
    scroll_resurrection: { resurrection: true },
    antidote: { curePoison: true },
    bandage: { cureBleed: true },
    rubber_duck_debug: { healHp: 80 },
    coffee_grounds_oil: { healEnergy: 45 },
    energy_drink_skibidi: { damageBoost: 1.25, duration: 60, icon: 'energy_skibidi' },
    paper_jam_coupon: { healHp: 120 },
    bluetooth_pairing_charm: { damageBoost: 1.35, duration: 90, icon: 'bluetooth_charm' },
    // Soulshot/Spiritshot/BSPS: arm toggle on server (C1 ×2 / ×1.5 / ×2), not timed buff
    soulshot_d: { shotKind: 'ss', shotMult: 2.0, grade: 'd' },
    soulshot_no_grade: { shotKind: 'ss', shotMult: 2.0, grade: 'no_grade' },
    spiritshot_d: { shotKind: 'sps', shotMult: 1.5, grade: 'd' },
    spiritshot_no_grade: { shotKind: 'sps', shotMult: 1.5, grade: 'no_grade' },
    blessed_spiritshot_d: { shotKind: 'bsps', shotMult: 2.0, grade: 'd' },
    blessed_spiritshot_no_grade: { shotKind: 'bsps', shotMult: 2.0, grade: 'no_grade' },
    // Italian brainrot cosmetics / scrolls (effects applied via COSMETICS_DB)
    dye_pink_brainrot: { cosmetic: true },
    dye_fire_blend: { cosmetic: true },
    dye_vacuum_violet: { cosmetic: true },
    dye_cappuccino_gold: { cosmetic: true },
    dye_skibidi_green: { cosmetic: true },
    aura_tralala_neon: { cosmetic: true, auraId: 'tralala_neon', duration: 1200, persistOnDeath: true, atkSpdMult: 1.12, critDamageBoost: 0.15, speedMult: 1.08, icon: 'elixir_tralala' },
    aura_bombardiro_fire: { cosmetic: true, auraId: 'bombardiro_fire', duration: 1200, persistOnDeath: true, attackMult: 1.15, vampiric: 0.08, stunResist: 0.25, icon: 'elixir_bombardiro' },
    aura_vacuum_void: { cosmetic: true, auraId: 'vacuum_void', duration: 1200, persistOnDeath: true, defenseMult: 1.20, maxEnergyBonus: 35, energyRegenMult: 1.25, icon: 'elixir_vacuum' },
    aura_cappuccino_gold: { cosmetic: true, auraId: 'cappuccino_gold', duration: 1200, persistOnDeath: true, adenaMult: 1.20, dropMult: 1.15, speedMult: 1.10, icon: 'elixir_cappuccino' },
    aura_skibidi_steam: { cosmetic: true, auraId: 'skibidi_steam', duration: 1200, persistOnDeath: true, hpRegenFlat: 10, energyRegenFlat: 5, defenseMult: 1.10, icon: 'elixir_skibidi' },
    scroll_br_tralala_wave: { cosmetic: true },
    scroll_br_bombardiro_dive: { cosmetic: true },
    scroll_br_tung_suction: { cosmetic: true },
    scroll_br_cappuccino_spin: { cosmetic: true },
    scroll_br_skibidi_slam: { cosmetic: true }
  };

  // Каталог — shared/event-rules.js. Пустой объект оставлял tickWorldEvents мёртвым.
  var WORLD_EVENTS = (EV && EV.EVENTS) ? EV.EVENTS : {};

  /**
   * Новый профиль.
   * opts: { race, gender, cls|classId, name }
   */
  function newProfile(name, opts) {
    opts = opts || {};
    var targetCls = opts.cls || opts.classId || 'operator';
    var isEngineer = targetCls === 'engineer' || targetCls === 'constructor' || targetCls === 'technomancer';
    if (!isEngineer && CS && CS.rootClass) {
      isEngineer = CS.rootClass(targetCls) === 'engineer';
    }

    var identity;
    if (CS && CS.createIdentity) {
      identity = CS.createIdentity({
        name: name || opts.name || 'Operator',
        race: opts.race,
        gender: opts.gender,
        cls: targetCls
      });
    } else {
      identity = {
        name: name || 'Operator',
        race: 'human',
        gender: 'male',
        cls: targetCls,
        classTier: 0,
        classHistory: [targetCls],
        level: 1,
        exp: 0,
        sp: 0,
        maxHp: 100, hp: 100,
        maxEnergy: 50, energy: 50,
        pAtk: 10, pDef: 5, cAtk: 6, cDef: 5, mAtk: 6, mDef: 5
      };
    }

    // Инженер: резонатор (атаки) + нано-браслеты (heal/drain/buff/debuff) + куртка + штаны.
    // Оператор: пока прежний стартовый набор (можно сузить отдельно).
    var starterEquip = isEngineer ? {
      weapon: { id: 'apprentice_wand', templateId: 'apprentice_wand' },
      necklace: { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' },
      bracelet: { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' },
      chest: { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' },
      legs: { id: 'engineer_pants_low', templateId: 'engineer_pants_low' }
    } : {
      weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
      necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
      bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' },
      chest: { id: 'wooden_breastplate', templateId: 'wooden_breastplate' },
      legs: { id: 'wooden_gaiters', templateId: 'wooden_gaiters' }
    };

    var starterInv = isEngineer ? {
      copper_parts: 0
    } : {
      copper_parts: 500, synthetic_oil: 10, pressure_canister: 5, pressure_amplifier: 5,
      goggles: 1, leather_gloves: 1, work_boots: 1
    };

    return {
      name: identity.name,
      race: identity.race,
      gender: identity.gender,
      cls: identity.cls,
      classTier: identity.classTier || 0,
      classHistory: identity.classHistory || [identity.cls],
      level: identity.level || 1,
      exp: identity.exp || 0,
      sp: identity.sp || 0,
      x: -107.5,
      z: -246.4,
      hp: identity.hp,
      maxHp: identity.maxHp,
      energy: identity.energy,
      maxEnergy: identity.maxEnergy,
      pAtk: identity.pAtk,
      pDef: identity.pDef,
      cAtk: identity.cAtk != null ? identity.cAtk : identity.mAtk,
      cDef: identity.cDef != null ? identity.cDef : identity.mDef,
      mAtk: identity.cAtk != null ? identity.cAtk : identity.mAtk,
      mDef: identity.cDef != null ? identity.cDef : identity.mDef,
      accuracy: identity.accuracy,
      evasion: identity.evasion,
      primary: identity.primary,
      karma: 0,
      pk: 0,
      inv: starterInv,
      equip: starterEquip,
      appearance: opts.appearance || null,
      learned: []
    };
  }

  return {
    REGIONS:REGIONS, regionAt:regionAt, MOB_SPOTS:MOB_SPOTS, BOSSES:BOSSES,
    mobStats:mobStats, rollDamage:rollDamage, playerPAtk:playerPAtk, playerPDef:playerPDef,
    playerMaxHp:playerMaxHp, playerMaxEnergy:playerMaxEnergy,
    playerCAtk:playerCAtk, playerCDef:playerCDef,
    playerMAtk:playerMAtk, playerMDef:playerMDef,
    expModifier:expModifier,
    rollDrop:rollDrop, DROP:DROP, RECIPES:RECIPES, ENCHANT_SAFE:ENCHANT_SAFE,
    enchantSuccess:enchantSuccess, CONSUMABLES:CONSUMABLES, WORLD_EVENTS:WORLD_EVENTS,
    // 3-Tier Visibility & Clipping Range configuration
    L2_VISIBILITY_CONFIG: {
      clippingRange: {
        terrain: 2500.0,
        actorsMax: 120.0,
        actorsMin: 40.0,
        nameplate: 40.0,
        nameplateFade: 8.0,
        foliage: 100.0
      },
      massPvp: {
        enabled: true,
        characterLimit: 45
      },
      serverAoi: {
        radius: 90.0,
        leaveRadius: 108.0,
        maxSyncPlayers: 64,
        maxSyncMobs: 64
      }
    },
    newProfile:newProfile, rng:rng, CLASS_SYSTEM: CS, L2_COMBAT: L2
  };
});