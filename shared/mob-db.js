// SHARED / MOB-DB.JS
// База мобов «Остров поющей стали» — экосистема в сеттинге
// вышедшей из-под контроля техники и электроники.
//
// Принципы:
//  1. Зоны по уровню без «дыр»; solo → party → raid.
//  2. Пассивы 1–5, агрессия с ~6, social/pack в mid+.
//  3. Уникальные скиллы/атаки у каждого шаблона.
//  4. Статы = математическая кривая (как game-rules.mobStats) × роль × уникальные множители.
//  5. Party-мобы живучее; raid — фазы, адды, enrage, долгий респавн.
//
// Совместимость: id совпадают с loot-rules / MOB_SPOTS / dungeon.js где уже есть.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MOB_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ─────────────────────────────────────────────
  //  L2 CLASSIC-подобная кривая мобов
  //  HP / P.Atk / EXP — по таблице проекта Mob Scaling (1→40)
  //  P.Def / C.Def — C1 combat-калибровка (game-rules: mystic AA не ваншотит)
  // ─────────────────────────────────────────────
  // client/js/Mob Scaling (уровень 1 → 40).csv + pDef/cDef из game-rules
  var L2_MOB_ANCHORS = [
    { L: 1,  hp: 65,    pAtk: 11,  pDef: 50,  cAtk: 6,   cDef: 54,  exp: 37 },
    { L: 5,  hp: 215,   pAtk: 28,  pDef: 63,  cAtk: 15,  cDef: 64,  exp: 145 },
    { L: 10, hp: 640,   pAtk: 58,  pDef: 81,  cAtk: 27,  cDef: 76,  exp: 470 },
    { L: 15, hp: 1450,  pAtk: 98,  pDef: 99,  cAtk: 41,  cDef: 90,  exp: 1100 },
    { L: 20, hp: 2800,  pAtk: 150, pDef: 118, cAtk: 55,  cDef: 103, exp: 2200 },
    { L: 25, hp: 4900,  pAtk: 215, pDef: 138, cAtk: 70,  cDef: 117, exp: 4000 },
    { L: 30, hp: 8000,  pAtk: 295, pDef: 158, cAtk: 85,  cDef: 130, exp: 6800 },
    { L: 35, hp: 12500, pAtk: 390, pDef: 179, cAtk: 100, cDef: 144, exp: 11000 },
    { L: 40, hp: 18800, pAtk: 505, pDef: 200, cAtk: 116, cDef: 158, exp: 17500 }
  ];

  function _lerpAnchor(level) {
    var L = Math.max(1, Math.min(40, +level || 1));
    var A = L2_MOB_ANCHORS;
    if (L <= A[0].L) return A[0];
    if (L >= A[A.length - 1].L) return A[A.length - 1];
    for (var i = 0; i < A.length - 1; i++) {
      if (L >= A[i].L && L <= A[i + 1].L) {
        var t = (L - A[i].L) / (A[i + 1].L - A[i].L);
        function ler(a, b) { return a + (b - a) * t; }
        return {
          L: L,
          hp: ler(A[i].hp, A[i + 1].hp),
          pAtk: ler(A[i].pAtk, A[i + 1].pAtk),
          pDef: ler(A[i].pDef, A[i + 1].pDef),
          cAtk: ler(A[i].cAtk, A[i + 1].cAtk),
          cDef: ler(A[i].cDef, A[i + 1].cDef),
          exp: ler(A[i].exp, A[i + 1].exp)
        };
      }
    }
    return A[0];
  }

  function baseCurve(level) {
    var L = Math.max(1, level | 0);
    var a = _lerpAnchor(L);
    var exp = Math.floor(a.exp);
    return {
      hp: Math.floor(a.hp),
      pAtk: Math.floor(a.pAtk),
      pDef: Math.floor(a.pDef),
      cAtk: Math.floor(a.cAtk),
      cDef: Math.floor(a.cDef),
      mAtk: Math.floor(a.cAtk),
      mDef: Math.floor(a.cDef),
      accuracy: Math.floor(18 + L * 1.4),
      evasion: Math.floor(12 + L * 1.1),
      critRate: 4 + Math.floor(L / 5),
      exp: exp,
      sp: Math.floor(exp * 0.12),
      speed: +(3.2 + L * 0.04).toFixed(2),
      // L2: low levels often passive (aggro 0); mid+ social/aggro range grows
      aggro: L <= 5 ? 0 : L <= 12 ? 8 : L <= 20 ? 11 : 14,
      // L2-like outdoor trash: not 15–25s carpet respawn
      respawn: L <= 8 ? 50 : L <= 15 ? 75 : L <= 25 ? 100 : 120
    };
  }

  // Роли L2-like (не раздувать как «рейд×72» на обычных)
  // passive/keltir · normal · pack/wolf · elite/champion · party · named · field RB · raid
  var ROLE = {
    solo_passive: {
      hp: 0.82, pAtk: 0.78, pDef: 0.95, cAtk: 0.75, cDef: 0.95,
      exp: 0.9, sp: 0.9, aggro: 0, respawn: 0.75
    },
    solo_norm: {
      hp: 1.0, pAtk: 1.0, pDef: 1.0, cAtk: 1.0, cDef: 1.0,
      exp: 1.0, sp: 1.0, aggro: 1.0, respawn: 1.0
    },
    solo_aggro: {
      hp: 1.08, pAtk: 1.1, pDef: 1.02, cAtk: 1.05, cDef: 1.0,
      exp: 1.08, sp: 1.05, aggro: 1.2, respawn: 1.0
    },
    pack: {
      hp: 0.88, pAtk: 1.02, pDef: 0.96, cAtk: 0.95, cDef: 0.95,
      exp: 0.92, sp: 0.92, aggro: 1.25, respawn: 0.9
    },
    elite: {
      hp: 2.2, pAtk: 1.28, pDef: 1.12, cAtk: 1.2, cDef: 1.1,
      exp: 2.4, sp: 2.2, aggro: 1.3, respawn: 1.4
    },
    party: {
      hp: 1.55, pAtk: 1.12, pDef: 1.08, cAtk: 1.1, cDef: 1.06,
      // EXP выше HP: 4 чел. ×1.3 bonus ≈ +6% экспа/время vs соло-треш 10–20
      exp: 2.05, sp: 1.90, aggro: 1.2, respawn: 1.15
    },
    party_elite: {
      hp: 2.6, pAtk: 1.32, pDef: 1.18, cAtk: 1.25, cDef: 1.14,
      exp: 3.70, sp: 3.25, aggro: 1.35, respawn: 1.8
    },
    named: {
      hp: 7.5, pAtk: 1.42, pDef: 1.22, cAtk: 1.35, cDef: 1.18,
      exp: 8, sp: 7, aggro: 1.45, respawn: 6
    },
    field_rb: {
      hp: 18, pAtk: 1.7, pDef: 1.35, cAtk: 1.55, cDef: 1.3,
      exp: 16, sp: 14, aggro: 1.9, respawn: 100
    },
    raid: {
      hp: 40, pAtk: 1.95, pDef: 1.48, cAtk: 1.8, cDef: 1.42,
      exp: 32, sp: 28, aggro: 2.2, respawn: 280
    }
  };

  function mul(v, k) { return Math.max(1, Math.floor(v * k)); }
  function mulF(v, k) { return +(v * k).toFixed(2); }

  function applyRole(curve, roleId, uniq) {
    var r = ROLE[roleId] || ROLE.solo_norm;
    uniq = uniq || {};
    var uh = uniq.hp != null ? uniq.hp : 1;
    var ua = uniq.pAtk != null ? uniq.pAtk : 1;
    var ud = uniq.pDef != null ? uniq.pDef : 1;
    var uca = uniq.cAtk != null ? uniq.cAtk : 1;
    var ucd = uniq.cDef != null ? uniq.cDef : 1;
    var ue = uniq.exp != null ? uniq.exp : 1;
    var us = uniq.speed != null ? uniq.speed : 1;
    var uag = uniq.aggro != null ? uniq.aggro : 1;
    var out = {
      hp: mul(curve.hp, r.hp * uh),
      pAtk: mul(curve.pAtk, r.pAtk * ua),
      pDef: mul(curve.pDef, r.pDef * ud),
      cAtk: mul(curve.cAtk, r.cAtk * uca),
      cDef: mul(curve.cDef, r.cDef * ucd),
      mAtk: mul(curve.cAtk, r.cAtk * uca),
      mDef: mul(curve.cDef, r.cDef * ucd),
      accuracy: curve.accuracy + (uniq.accuracy || 0),
      evasion: curve.evasion + (uniq.evasion || 0),
      critRate: Math.max(1, curve.critRate + (uniq.critRate || 0)),
      exp: mul(curve.exp, r.exp * ue),
      sp: mul(curve.sp, r.sp * ue),
      speed: mulF(curve.speed, (r.speed != null ? r.speed : 1) * us),
      aggro: Math.round(curve.aggro * r.aggro * uag),
      respawn: Math.round(curve.respawn * r.respawn * (uniq.respawn || 1))
    };
    if (roleId === 'solo_passive' || r.aggro === 0) out.aggro = 0;
    return out;
  }

  /**
   * Соло-треш: холмы 6–8 только EXP ×1.12; 9–20 ещё HP ×0.82 / EXP ×1.25.
   * Только outdoor trash (solo_norm / solo_aggro / pack).
   */
  var SOLO_MID_ROLES = { solo_norm: 1, solo_aggro: 1, pack: 1 };
  function tuneOutdoorTrash(st, roleId, level) {
    var L = level | 0;
    if (!st || !SOLO_MID_ROLES[roleId]) return st;
    if (L >= 6 && L <= 8) {
      st.exp = Math.max(1, Math.floor(st.exp * 1.12));
      st.sp = Math.max(1, Math.floor(st.sp * 1.12));
      return st;
    }
    if (L < 9 || L > 20) return st;
    st.hp = Math.max(1, Math.floor(st.hp * 0.82));
    st.exp = Math.max(1, Math.floor(st.exp * 1.25));
    st.sp = Math.max(1, Math.floor(st.sp * 1.25));
    // 15–20: кривая EXP C1 обгоняет ×1.25 → ещё ×1.15 (цель 40–48 киллов)
    if (L >= 15) {
      st.exp = Math.max(1, Math.floor(st.exp * 1.15));
      st.sp = Math.max(1, Math.floor(st.sp * 1.15));
    }
    return st;
  }

  /**
   * Интро-рейды 14–20: роль raid даёт ×40 HP, но на 9 человек это 3 мин.
   * C1 intro RB ближе к 8–15 мин. HP ×2.5, экспу не трогаем (рейд ≠ фарм).
   */
  function tuneIntroRaid(st, roleId, level) {
    var L = level | 0;
    if (roleId !== 'raid' || L < 14 || L > 20 || !st) return st;
    st.hp = Math.max(1, Math.floor(st.hp * 2.5));
    return st;
  }

  /**
   * Рейды 28+: без множителя 9 человек валят за 10–20 мин.
   * C1 Core/Orfen ближе к 25–60. HP ×2.5, экспу не трогаем.
   */
  function tuneHighRaid(st, roleId, level) {
    var L = level | 0;
    if (roleId !== 'raid' || L < 28 || !st) return st;
    st.hp = Math.max(1, Math.floor(st.hp * 2.5));
    return st;
  }

  /**
   * Field RB 22+: на 9 человек 3–4 мин. C1 field boss 8–15 мин. HP ×2.
   */
  function tuneFieldRb(st, roleId, level) {
    var L = level | 0;
    if (roleId !== 'field_rb' || L < 22 || !st) return st;
    st.hp = Math.max(1, Math.floor(st.hp * 2.0));
    return st;
  }

  function tuneMobStats(st, roleId, level) {
    st = tuneOutdoorTrash(st, roleId, level);
    st = tuneIntroRaid(st, roleId, level);
    st = tuneHighRaid(st, roleId, level);
    return tuneFieldRb(st, roleId, level);
  }

  // ─────────────────────────────────────────────
  //  ЗОНЫ ОХОТЫ (id = world-lore PLACES / map)
  // ─────────────────────────────────────────────
  var HUNTING_ZONES = {
    operators_yard: {
      id: 'operators_yard', name: 'Территория Операторов',
      level: [1, 5], mode: 'solo', density: 'low', peace: true,
      theme: 'учебный двор', l2Analog: 'Talking Island Village outskirts',
      blurb: 'Мирный старт. Скрапперы и болты — для обучения прицелу.'
    },
    engineers_school: {
      id: 'engineers_school', name: 'Школа Инженеров',
      level: [1, 5], mode: 'solo', density: 'low', peace: true,
      theme: 'учебные контуры', l2Analog: 'Mystic starter yard',
      blurb: 'То же, что двор Операторов, но с большим числом «схемных» мобов.'
    },
    astard_hills: {
      id: 'astard_hills', name: 'Холмы Астарда',
      level: [5, 12], mode: 'solo', density: 'medium',
      theme: 'зелёные холмы / первые серьёзные стычки', l2Analog: 'Talking Island hills / Wolf area',
      blurb: 'Соло-фарм 5–12. Гончие стаями, газонокосилки, маяки.'
    },
    riverspan: {
      id: 'riverspan', name: 'Междуречье',
      level: [7, 9], mode: 'solo', density: 'medium',
      theme: 'мосты, отмели, насосы', l2Analog: 'river crossings',
      blurb: 'Узкий коридор: засады насосов и «сборщиков пошлины».'
    },
    scrapyard: {
      id: 'scrapyard', name: 'Свалка',
      level: [8, 10], mode: 'solo', density: 'high',
      theme: 'лом, дроны, кражи', l2Analog: 'Orc Barracks approach / scrap',
      blurb: 'Плотный соло-гринд. Магниты-сороки воруют мелочь (юмор).'
    },
    western_lands: {
      id: 'western_lands', name: 'Западные земли',
      level: [8, 12], mode: 'solo', density: 'medium',
      theme: 'камень, сварка, дозор', l2Analog: 'Western Territory',
      blurb: 'Сварочные автоматы и ржавые часовые. Путь к Круне.'
    },
    lost_gardens: {
      id: 'lost_gardens', name: 'Затерянные Сады',
      level: [11, 12], mode: 'solo', density: 'low',
      theme: 'аномальная зелень + садовые роботы', l2Analog: 'Elven Forest edge (soft)',
      blurb: 'Тихие соло-тропы. Поливные турели и плющ-кабели.'
    },
    apiary: {
      id: 'apiary', name: 'Пасека',
      level: [11, 12], mode: 'solo', density: 'medium',
      theme: 'мех-пчёлы', l2Analog: 'bee-like social pack',
      blurb: 'Социальные мех-пчёлы: тронь одну — прилетят соседки.'
    },
    cruna_yards: {
      id: 'cruna_yards', name: 'Дворы Круны',
      level: [12, 13], mode: 'solo', density: 'medium',
      theme: 'кузница / караул', l2Analog: 'Cruma outskirts',
      blurb: 'Соло/дуо. Подмастерья-горна и краны-малыши.'
    },
    quiet_backwater: {
      id: 'quiet_backwater', name: 'Тихая заводь',
      level: [13, 15], mode: 'solo', density: 'medium',
      theme: 'мёртвая верфь, краны', l2Analog: 'Elven Ruins / docks',
      blurb: 'Соло mid. Краны-пауки, сухие сварщики. Полевой РБ Пресс-Молот.'
    },
    field_of_oblivion: {
      id: 'field_of_oblivion', name: 'Поле забвения',
      level: [12, 17], mode: 'party', density: 'high', recommendedParty: [3, 5],
      theme: 'поле боя, social packs', l2Analog: 'Cruma Marshlands / party field',
      blurb: 'Первая party-зона. Пачки «ходоков забвения», scrubbers, гаубицы.'
    },
    eastern_range: {
      id: 'eastern_range', name: 'Восточный полигон',
      level: [15, 17], mode: 'solo', density: 'medium',
      theme: 'мишени, которые стреляют в ответ', l2Analog: 'training grounds gone hostile',
      blurb: 'Соло/дуо mid-high. Живые мишени и споттеры.'
    },
    chem_ruins: {
      id: 'chem_ruins', name: 'Руины химзавода',
      level: [16, 17], mode: 'party', density: 'high', recommendedParty: [3, 5],
      theme: 'кислота, зелёный сбой', l2Analog: 'Ant Nest / toxic',
      blurb: 'Party. DoT-кислота, дебаффы контура, элиты-«контейнеры».'
    },
    rezdiq_barracks: {
      id: 'rezdiq_barracks', name: 'Бараки Рездика',
      level: [17, 18], mode: 'party', density: 'high', recommendedParty: [4, 6],
      theme: 'военная дисциплина машин', l2Analog: 'Orc Barracks',
      blurb: 'Party. Дрель-сержанты, рядовые Рездика, строй.'
    },
    steel_limit_fort: {
      id: 'steel_limit_fort', name: 'Крепость стального предела',
      level: [17, 18], mode: 'party', density: 'high', recommendedParty: [4, 6],
      theme: 'бастион, турели', l2Analog: 'fortress siege mobs',
      blurb: 'Party. Стражи Предела и турели. Рейд-босс Колосс.'
    },
    boiler_lands: {
      id: 'boiler_lands', name: 'Котловые земли',
      level: [18, 22], mode: 'party', density: 'high', recommendedParty: [5, 7],
      theme: 'перегретый пар, порча', l2Analog: 'high-level open field',
      blurb: 'Хай party-поле. Котловые «элементали», бесы давления.'
    },
    // Данжи (уровень внутри инстанса)
    steel_cliff: {
      id: 'steel_cliff', name: 'Утёс Стали',
      level: [20, 28], mode: 'dungeon', density: 'instanced', recommendedParty: [5, 9],
      theme: 'форт-утёс', l2Analog: 'Cruma Tower (low floors)',
      blurb: 'Данж. Named + босс Брендованный Котёл.'
    },
    cruna_tower: {
      id: 'cruna_tower', name: 'Башня Круны',
      level: [28, 36], mode: 'dungeon', density: 'instanced', recommendedParty: [5, 9],
      theme: 'вертикальная кузница', l2Analog: 'Cruma Tower',
      blurb: 'Данж mid-high. Диспетчер + Ядро Круны.'
    },
    bunker_gate: {
      id: 'bunker_gate', name: 'Бункер',
      level: [34, 40], mode: 'dungeon', density: 'instanced', recommendedParty: [7, 12],
      theme: 'протокол / коллективный разум', l2Analog: 'end-game dungeon',
      blurb: 'Данж end. Узлы Коллектива + Overmind (рейд).'
    }
  };

  // ─────────────────────────────────────────────
  //  СКИЛЛЫ (общий каталог; мобы ссылаются по id)
  // ─────────────────────────────────────────────
  var SKILL_CATALOG = {
    // basic
    bite_clamp: {
      id: 'bite_clamp', name: 'Зажим клешней', type: 'physical', power: 1.0,
      cd: 0, range: 1, range: 1.8, desc: 'Обычная ближняя атака.'
    },
    spark_shot: {
      id: 'spark_shot', name: 'Искра', type: 'circuit', power: 1.05,
      cd: 4, range: 8, desc: 'Дальний искровой выстрел.'
    },
    steam_jet: {
      id: 'steam_jet', name: 'Струя пара', type: 'circuit', power: 1.15,
      cd: 8, range: 0.35, range: 4, aoe: 2.5,
      effect: { id: 'scald', name: 'Ожог паром', duration: 4, dps: 0.08 },
      desc: 'Конус пара: урон + DoT.'
    },
    weld_arc: {
      id: 'weld_arc', name: 'Сварочная дуга', type: 'circuit', power: 1.35,
      cd: 10, range: 0.4, range: 3,
      effect: { id: 'blind_spark', name: 'Ослепление', duration: 2, accuracy: -15 },
      desc: 'Сильный ближний arc; шанс ослепить.'
    },
    pack_howl: {
      id: 'pack_howl', name: 'Паровой вой', type: 'buff', power: 0,
      cd: 20, range: 0.25, range: 0, aoe: 12,
      effect: { id: 'pack_boost', name: 'Стая', duration: 8, pAtk: 1.15, speed: 1.1 },
      desc: 'Баф соседним собратьям.'
    },
    magnet_pull: {
      id: 'magnet_pull', name: 'Магнитный рывок', type: 'control', power: 0.6,
      cd: 12, range: 0.3, range: 10,
      effect: { id: 'pull', name: 'Притяжение', duration: 0.5 },
      desc: 'Тянет цель к себе (дальний → ближний).'
    },
    oil_slick: {
      id: 'oil_slick', name: 'Масляная лужа', type: 'debuff', power: 0.4,
      cd: 14, chance: 0.4, range: 6, aoe: 3,
      effect: { id: 'slow_oil', name: 'Скольжение', duration: 5, speed: 0.6 },
      desc: 'AoE slow.'
    },
    self_repair: {
      id: 'self_repair', name: 'Авторемонт', type: 'heal', power: 0.12,
      cd: 25, chance: 0.2, range: 0,
      desc: 'Лечит % max HP (как undead heal, но «ремонт»).'
    },
    overclock: {
      id: 'overclock', name: 'Разгон', type: 'buff', power: 0,
      cd: 30, chance: 1, range: 0,
      effect: { id: 'overclock', name: 'Разгон', duration: 8, pAtk: 1.3, speed: 1.25, pDef: 0.85 },
      desc: 'Enrage-lite: больше урона и скорости, меньше брони.'
    },
    acid_spray: {
      id: 'acid_spray', name: 'Кислотный спрей', type: 'circuit', power: 1.1,
      cd: 9, chance: 0.45, range: 5, aoe: 3,
      effect: { id: 'acid', name: 'Коррозия', duration: 6, pDef: 0.88, dps: 0.06 },
      desc: 'AoE DoT + −P.Def.'
    },
    protocol_glitch: {
      id: 'protocol_glitch', name: 'Сбой протокола', type: 'debuff', power: 0.5,
      cd: 16, chance: 0.35, range: 8,
      effect: { id: 'silence_circuit', name: 'Глушение схем', duration: 4, silence: true },
      desc: 'Silence на контурные скиллы (аналог mute).'
    },
    drill_charge: {
      id: 'drill_charge', name: 'Буровая атака', type: 'physical', power: 1.6,
      cd: 12, chance: 0.3, range: 12,
      effect: { id: 'knockback', name: 'Отброс', duration: 0.3 },
      desc: 'Рывок-бур: высокий урон + knockback.'
    },
    press_slam: {
      id: 'press_slam', name: 'Удар пресса', type: 'physical', power: 1.8,
      cd: 14, chance: 0.4, range: 4, aoe: 4,
      effect: { id: 'stun', name: 'Оглушение', duration: 2 },
      desc: 'AoE slam + stun (танк-check).'
    },
    summon_drones: {
      id: 'summon_drones', name: 'Вызов дронов', type: 'summon', power: 0,
      cd: 45, chance: 1, range: 0,
      summon: { mobId: 'welding_drone', count: [2, 3], levelOffset: -2 },
      desc: 'Спавн аддов (босс-механика).'
    },
    pressure_nova: {
      id: 'pressure_nova', name: 'Нова давления', type: 'circuit', power: 1.5,
      cd: 18, chance: 0.35, range: 0, aoe: 8,
      desc: 'Радиальный взрыв пара вокруг кастера.'
    },
    target_lock: {
      id: 'target_lock', name: 'Захват цели', type: 'debuff', power: 0.3,
      cd: 15, chance: 0.4, range: 14,
      effect: { id: 'marked', name: 'Метка', duration: 8, receivedDamage: 1.15 },
      desc: 'Метка: цель получает +15% урона.'
    },
    hive_call: {
      id: 'hive_call', name: 'Зов улья', type: 'social', power: 0,
      cd: 8, chance: 1, range: 0, aoe: 14,
      effect: { id: 'social_aggro', name: 'Агро улья', duration: 0 },
      desc: 'Social aggro: будит сородичей в радиусе.'
    },
    static_burst: {
      id: 'static_burst', name: 'Статический разряд', type: 'circuit', power: 1.25,
      cd: 11, chance: 0.35, range: 3, aoe: 3.5,
      effect: { id: 'paralyze_short', name: 'Паралич', duration: 1.5 },
      desc: 'Ближний AoE + короткий паралич.'
    },
    firmware_rant: {
      id: 'firmware_rant', name: 'Прошивка 404', type: 'debuff', power: 0.2,
      cd: 20, chance: 0.25, range: 6,
      effect: { id: 'confuse', name: 'Путаница UI', duration: 3, confuse: true },
      desc: 'Юмор: «Ошибка 404: цель не найдена» — confuse.'
    },
    colossus_stomp: {
      id: 'colossus_stomp', name: 'Топот Колосса', type: 'physical', power: 2.0,
      cd: 16, chance: 0.4, range: 6, aoe: 7,
      effect: { id: 'stun', name: 'Оглушение', duration: 2.5 },
      desc: 'Рейд-AoE.'
    },
    // Phase 1 raid skills
    scrap_barrage: {
      id: 'scrap_barrage', name: 'Шквал лома', type: 'physical', power: 1.35,
      cd: 11, chance: 0.45, range: 10, aoe: 4,
      effect: { id: 'shrapnel', name: 'Осколки', duration: 4, dps: 0.05 },
      desc: 'Phase1 raid: дальний AoE + DoT осколков.'
    },
    clamp_crush: {
      id: 'clamp_crush', name: 'Дробящий зажим', type: 'physical', power: 1.7,
      cd: 13, chance: 0.4, range: 3,
      effect: { id: 'stun', name: 'Оглушение', duration: 1.8 },
      desc: 'Phase1 raid: сильный single + stun.'
    },
    boiler_eruption: {
      id: 'boiler_eruption', name: 'Извержение котла', type: 'circuit', power: 1.65,
      cd: 16, chance: 0.4, range: 0, aoe: 9,
      effect: { id: 'scald', name: 'Ожог паром', duration: 5, dps: 0.1 },
      desc: 'Phase1 raid: большая nova + DoT.'
    },
    valve_lock: {
      id: 'valve_lock', name: 'Блокировка клапана', type: 'debuff', power: 0.4,
      cd: 14, chance: 0.4, range: 12,
      effect: { id: 'silence_circuit', name: 'Глушение схем', duration: 3.5, silence: true },
      desc: 'Phase1 raid: silence на контур.'
    },

    green_pulse: {
      id: 'green_pulse', name: 'Зелёный пульс', type: 'circuit', power: 1.4,
      cd: 12, chance: 0.4, range: 10, aoe: 5,
      effect: { id: 'green_fault', name: 'Зелёный сбой', duration: 6, cDef: 0.85, dps: 0.07 },
      desc: 'Порча: −C.Def + DoT.'
    },
    directive_rewrite: {
      id: 'directive_rewrite', name: 'Перепись директивы', type: 'debuff', power: 0.8,
      cd: 22, chance: 0.3, range: 12,
      effect: { id: 'charm_short', name: 'Перехват управления', duration: 3, charm: true },
      desc: 'Краткий charm (рейд-механика).'
    }
  };

  function skills() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var s = SKILL_CATALOG[arguments[i]];
      if (s) out.push(s);
    }
    return out;
  }

  // ─────────────────────────────────────────────
  //  ОПРЕДЕЛЕНИЕ МОБА
  // ─────────────────────────────────────────────
  /**
   * @param {object} d
   * @param {string} d.id
   * @param {string} d.name
   * @param {[number,number]} d.level
   * @param {string} d.role - ключ ROLE
   * @param {string} d.behavior - passive|aggressive|social|boss|event_boss|named
   * @param {string[]} d.zones - ids HUNTING_ZONES
   * @param {string} [d.l2Analog]
   * @param {string} [d.flavor] - юмор / лор
   * @param {object} [d.uniq] - множители статов
   * @param {string[]} [d.skillIds]
   * @param {object} [d.ai] - packSize, fleeAtHp, enrageAtHp, ranged, summonAdds, aoeAttacks
   * @param {object} [d.visual]
   * @param {string} [d.attackType] - physical|circuit|hybrid
   * @param {number} [d.partySize] - рек. размер пати
   * @param {number} [d.respawnSec] - override респавна (боссы)
   */
  function M(d) {
    var mid = Math.floor((d.level[0] + d.level[1]) / 2);
    var st = tuneMobStats(applyRole(baseCurve(mid), d.role, d.uniq), d.role, mid);
    var sk = d.skillIds ? skills.apply(null, d.skillIds) : skills('bite_clamp');
    var v = d.visual || {};
    return {
      id: d.id,
      name: d.name,
      title: d.title || null,
      level: d.level,
      role: d.role,
      behavior: d.behavior || 'aggressive',
      type: d.behavior || 'aggressive', // alias для spawn.js
      mode: d.mode || (d.role.indexOf('party') >= 0 || d.role === 'raid' || d.role === 'field_rb' ? 'party' : 'solo'),
      zones: d.zones || [],
      zone: (d.zones && d.zones[0]) || 'astard_hills',
      l2Analog: d.l2Analog || null,
      flavor: d.flavor || '',
      attackType: d.attackType || 'physical',
      partySize: d.partySize || (
        d.role === 'raid' ? 18
          : d.role === 'field_rb' ? 9
            : d.role === 'named' || d.role === 'party_elite' ? 5
              : d.role.indexOf('party') >= 0 ? 4
                : 1
      ),
      // mid-level snapshot (для UI / CSV)
      statsMid: st,
      uniq: d.uniq || {},
      skills: sk,
      skillIds: d.skillIds || ['bite_clamp'],
      // AI / combat flags (совместимо со spawn.js ZoneEnemy)
      aggroRange: d.ai && d.ai.aggroRange != null ? d.ai.aggroRange : (st.aggro === 0 ? 0 : st.aggro + 2),
      attackRange: d.ai && d.ai.attackRange != null ? d.ai.attackRange : (d.ai && d.ai.ranged ? 8 : 2),
      moveSpeed: d.ai && d.ai.moveSpeed != null ? d.ai.moveSpeed : st.speed,
      packSize: d.ai && d.ai.packSize || null,
      packLeader: !!(d.ai && d.ai.packLeader),
      fleeAtHp: d.ai && d.ai.fleeAtHp || 0,
      enrageAtHp: d.ai && d.ai.enrageAtHp || 0,
      ranged: !!(d.ai && d.ai.ranged),
      projectileColor: (d.ai && d.ai.projectileColor) || 0xffaa00,
      summonAdds: !!(d.ai && d.ai.summonAdds),
      aoeAttacks: !!(d.ai && d.ai.aoeAttacks),
      boss: d.role === 'field_rb' || d.role === 'raid' || d.behavior === 'boss' || d.behavior === 'event_boss',
      named: d.role === 'named' || d.behavior === 'named',
      event: d.behavior === 'event_boss',
      social: d.behavior === 'social' || d.role === 'pack',
      respawnSec: d.respawnSec != null ? d.respawnSec : st.respawn,
      // visual
      color: v.color != null ? v.color : 0x888888,
      scale: v.scale != null ? v.scale : 1.8,
      sprite: v.sprite || { body: '#777777', accent: '#555555', eyes: '#44ff44', legs: 4 },
      // optional 2D sprite sheets (Imagine pipeline → assets/mobs/<id>/)
      sheets: v.sheets || null,
      // legacy spawn.js ranges (приближение вокруг mid)
      hp: [Math.floor(st.hp * 0.92), Math.floor(st.hp * 1.08)],
      damage: [Math.floor(st.pAtk * 0.15), Math.floor(st.pAtk * 0.22)],
      defense: Math.floor(st.pDef * 0.05),
      exp: [Math.floor(st.exp * 0.9), Math.floor(st.exp * 1.1)],
      lootHint: d.lootHint || null,
      // thin filler: solo-tier mobs that also pad party zones (UI / spawn density)
      filler: !!d.filler,
      eliteRaid: !!d.eliteRaid,
      epicRaid: !!d.epicRaid,
      title: d.title || (d.filler ? 'Filler' : null)
    };
  }

  // ─────────────────────────────────────────────
  //  РОСТЕР МОБОВ
  // ─────────────────────────────────────────────
  var MOBS = {};

  function reg(m) { MOBS[m.id] = m; return m; }

  // ===== SOLO 1–5: дворы школ (Keltir-tier) =====
  reg(M({
    id: 'scrapper', name: 'Скраппер',
    level: [1, 5], role: 'solo_passive', behavior: 'passive',
    zones: ['operators_yard', 'engineers_school', 'astard_hills'],
    l2Analog: 'Keltir',
    flavor: 'GRINDVAC-3000: пылесос, в котором поселились четыре дрели и два УШМ. Режим «уборка» переименован в «GRIND OR DIE».',
    skillIds: ['bite_clamp'],
    // L1–5: не убегают — держат бой (flee только mid+)
    // scale×2 → attackRange под половину billboard + запас
    ai: { fleeAtHp: 0, attackRange: 3.2, moveSpeed: 3 },
    visual: {
      color: 0x338888, scale: 3.1,
      sprite: { body: '#2a6a7a', accent: '#e8b020', eyes: '#ff2222', legs: 4 },
      sheets: {
        base: 'assets/mobs/scrapper',
        idle: 'idle_sheet.webp',
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        faceInvert: true
      }
    },
    lootHint: 'gear_fragment, copper_cable, synthetic_oil'
  }));

  reg(M({
    id: 'rust_mite', name: 'Ржавый Клещ',
    level: [2, 5], role: 'solo_passive', behavior: 'passive',
    zones: ['operators_yard', 'engineers_school'],
    l2Analog: 'Elder Keltir',
    flavor: 'Думал, что он «антикоррозийный датчик». Коррозия победила. Теперь он — её агент.',
    uniq: { hp: 1.1, pAtk: 1.05 },
    skillIds: ['bite_clamp', 'oil_slick'],
    ai: { fleeAtHp: 0, attackRange: 1.6, moveSpeed: 3.2 },
    visual: {
      color: 0xaa6644, scale: 1.6,
      sprite: { body: '#aa6644', accent: '#663322', eyes: '#ffaa44', legs: 6 },
      sheets: {
        // MUST be client/assets/mobs/rust_mite/ (served as assets/mobs/rust_mite/…)
        base: 'assets/mobs/rust_mite',
        // PNG only — WebP reintroduces magenta RGB on a=0 → pink disk in WebGL
        idle: 'idle_sheet.png',
        walk: 'walk_sheet.png',
        attack: 'attack_sheet.png',
        death: 'death_sheet.png',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        // UV invert: without it walks moonwalk (задом наперёд). Engine canon ≠ sheet profile.
        faceInvert: true,
        // bump when replacing sheets so browser drops image cache
        cacheBust: 'rm-face-fix-3'
      }
    }
  }));

  reg(M({
    id: 'loose_bolt', name: 'Сбежавший Болт',
    level: [1, 3], role: 'solo_passive', behavior: 'passive',
    zones: ['operators_yard', 'engineers_school'],
    l2Analog: 'Fox (weak)',
    flavor: 'Кто-то не затянул. Теперь у болта есть мечты, амбиции и 12 HP.',
    uniq: { hp: 0.7, pAtk: 0.6, speed: 1.3, exp: 0.7 },
    skillIds: ['bite_clamp'],
    ai: { fleeAtHp: 0, attackRange: 1.2, moveSpeed: 4.5 },
    visual: {
      color: 0xaaaaaa, scale: 1.35,
      sprite: { body: '#bbbbbb', accent: '#888888', eyes: '#ffff00' },
      sheets: {
        base: 'assets/mobs/loose_bolt',
        idle: 'idle_sheet.webp',
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256
      }
    }
  }));

  reg(M({
    id: 'tutorial_target', name: 'Тостер-Терминатор',
    level: [1, 4], role: 'solo_passive', behavior: 'passive',
    zones: ['operators_yard'],
    l2Analog: 'Training Dummy (alive)',
    flavor: 'Сорок лет прожаривал тосты в бытовке. После сбоя таймера решил, что хлеб — это слишком скучно, и переключился на пальцы игроков.',
    uniq: { pDef: 1.15, pAtk: 0.65 },
    skillIds: ['bite_clamp'],
    ai: { attackRange: 1.4, moveSpeed: 2.2 },
    visual: {
      color: 0xcc4444, scale: 2.4,
      sprite: { body: '#cc4444', accent: '#ffffff', eyes: '#ffcc00', wheels: true },
      sheets: {
        base: 'assets/mobs/tutorial_target',
        idle: 'idle_sheet.webp',
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        // Art leans opposite of loose_bolt → invert UV facing (no texture mirror / text OK)
        faceInvert: true,
        artFaces: 'right',
        groundAlign: true
      }
    }
  }));

  reg(M({
    id: 'spark_sprite', name: 'Миксер-Взбиватель',
    level: [3, 5], role: 'solo_passive', behavior: 'passive',
    zones: ['engineers_school', 'astard_hills'],
    l2Analog: 'Imp (weak magic)',
    flavor: 'Венчик от кухонного миксера, сорвавшийся с насадки. Вращается со скоростью 5000 оборотов и взбивает окружающих в однородный крем.',
    attackType: 'circuit',
    uniq: { cAtk: 1.25, pAtk: 0.7, hp: 0.8, exp: 1.7 },
    skillIds: ['spark_shot', 'static_burst'],
    ai: { ranged: true, attackRange: 7, moveSpeed: 4, projectileColor: 0x66ccff },
    visual: {
      color: 0x66ccff, scale: 1.55,
      sprite: { body: '#66ccff', accent: '#2288aa', eyes: '#ffffff', flying: true },
      sheets: {
        base: 'assets/mobs/spark_sprite',
        // PNG: clean a=0 RGB (no WebGL pink disk)
        idle: 'idle_sheet.png',
        walk: 'walk_sheet.png',
        attack: 'attack_sheet.png',
        death: 'death_sheet.png',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 5, walk: 9, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        // 3/4 front; if moonwalk → faceInvert: true
        cacheBust: 'ss-png-1'
      }
    }
  }));

  // ===== SOLO 5–12: Холмы Астарда (Wolf-tier) =====
  reg(M({
    id: 'steam_hound', name: 'Кофемашина-Бешеная',
    level: [5, 10], role: 'pack', behavior: 'social',
    zones: ['astard_hills', 'scrapyard', 'western_lands'],
    l2Analog: 'Wolf / Elder Wolf',
    flavor: 'Рожковая кофеварка на колесиках. Обваривает крутым эспрессо и лупит тяжелым портафильтром по голове за заказ латте на соевом.',
    skillIds: ['bite_clamp', 'pack_howl', 'steam_jet'],
    // scale 2.55 — чуть меньше кофемашин; attackRange ~ half body + slack
    ai: { packSize: [2, 4], packLeader: true, attackRange: 2.6, moveSpeed: 6, aggroRange: 12 },
    visual: {
      color: 0xaa4444, scale: 2.55,
      sprite: { body: '#993333', accent: '#662222', eyes: '#ff0000', wheels: true },
      sheets: {
        base: 'assets/mobs/steam_hound',
        idle: 'idle_sheet.png',
        walk: 'walk_sheet.png',
        attack: 'attack_sheet.png',
        death: 'death_sheet.png',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        faceInvert: false,
        cacheBust: 'sh-scale-2.55'
      }
    },
    lootHint: 'piston_ring, pressure_canister, copper_earring'
  }));

  reg(M({
    id: 'meadow_mower', name: 'Бешеная Газонокосилка',
    level: [6, 10], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['astard_hills'],
    l2Analog: 'Orc (low)',
    flavor: 'Бензиновая косилка со снятым кожухом. Ножи вращаются со свистом и подравнивают прохожих под идеальный уровень газона.',
    uniq: { pAtk: 1.15, speed: 0.9 },
    skillIds: ['bite_clamp', 'oil_slick'],
    ai: { attackRange: 2.7, moveSpeed: 3.5, aggroRange: 10 },
    visual: {
      color: 0x44aa44, scale: 2.75,
      sprite: { body: '#338833', accent: '#225522', eyes: '#aaff00', wheels: true },
      sheets: {
        base: 'assets/mobs/meadow_mower',
        idle: 'idle_sheet.webp',
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        // moonwalk: invert UV facing vs loose_bolt canon
        faceInvert: true,
        artFaces: 'right',
        cacheBust: 'mm-scale-2.75'
      }
    }
  }));

  reg(M({
    id: 'survey_beacon', name: 'Электрогриль-Прижиматель',
    level: [7, 11], role: 'solo_norm', behavior: 'aggressive',
    zones: ['astard_hills', 'riverspan'],
    l2Analog: 'ranged scout',
    flavor: 'Кухонный контактный гриль на 250°C. Мечтает сделать румяные полосочки на твоём стейке... то есть на броне.',
    attackType: 'circuit',
    uniq: { cAtk: 1.2, pAtk: 0.85, accuracy: 6 },
    skillIds: ['spark_shot', 'target_lock'],
    ai: { ranged: true, attackRange: 10, moveSpeed: 2.5, aggroRange: 14, projectileColor: 0xffcc00 },
    visual: {
      color: 0xccaa44, scale: 1.9,
      sprite: { body: '#ccaa44', accent: '#886622', eyes: '#ffff88' }
    }
  }));

  reg(M({
    id: 'hill_presser', name: 'Стиралка-Убийца',
    level: [9, 12], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['astard_hills', 'western_lands'],
    l2Analog: 'Werewolf (low)',
    flavor: 'Стиральная машина в режиме отжима на 1400 оборотов с кирпичом внутри. Скачет по локации и раздает сокрушительные боковые удары.',
    uniq: { hp: 1.2, pAtk: 1.1, speed: 0.85 },
    skillIds: ['bite_clamp', 'press_slam'],
    ai: { attackRange: 2.8, moveSpeed: 3.2, aggroRange: 10, aoeAttacks: true },
    visual: {
      color: 0x666688, scale: 2.8,
      sprite: { body: '#555577', accent: '#333355', eyes: '#ffaa00', heavy: true },
      sheets: {
        base: 'assets/mobs/hill_presser',
        idle: 'idle_sheet.webp',
        // walk/attack = raw sheets as-is (no re-cut); multi-row UV grid
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 16, attack: 16, death: 4 },
        layout: {
          walk: { cols: 4, rows: 4 },
          // attack.webp = 4×4 single washers (4×2 stacked two bodies per cell)
          attack: { cols: 4, rows: 4 }
        },
        fps: { idle: 4, walk: 12, attack: 14, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        // walk/attack art faces screen-RIGHT (vs loose_bolt LEFT) → moonwalk without invert
        faceInvert: true,
        artFaces: 'right',
        cacheBust: 'hp-raw-sheets-v6'
      }
    }
  }));

  // ===== SOLO 7–10: Междуречье / Свалка =====
  reg(M({
    id: 'rivulet_pump', name: 'Пылесос-Харкач',
    level: [7, 9], role: 'solo_norm', behavior: 'aggressive',
    zones: ['riverspan'],
    l2Analog: 'water elemental (low tech)',
    flavor: 'Старый циклонический пылесос. Переключил реверс и с диким рёвом выплевывает назад собранный за 10 лет мусор и пыль.',
    attackType: 'hybrid',
    skillIds: ['steam_jet', 'bite_clamp'],
    ai: { attackRange: 3.5, moveSpeed: 3, aggroRange: 9 },
    visual: {
      color: 0x4488aa, scale: 2.3,
      sprite: { body: '#337799', accent: '#225566', eyes: '#88eeff' }
    }
  }));

  reg(M({
    id: 'bridge_toll_bot', name: 'Вентилятор-Шинковщик',
    level: [8, 9], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['riverspan'],
    l2Analog: 'bandit',
    flavor: 'Напольный трехскоростной вентилятор без защитной решетки. На 3-й скорости превращает всё подступающее в винегрет.',
    uniq: { pAtk: 1.1, accuracy: 4 },
    skillIds: ['bite_clamp', 'magnet_pull', 'firmware_rant'],
    ai: { attackRange: 2, moveSpeed: 4, aggroRange: 11 },
    visual: {
      color: 0x886644, scale: 2.1,
      sprite: { body: '#886644', accent: '#554422', eyes: '#ffcc00' }
    }
  }));

  reg(M({
    id: 'junk_magpie', name: 'Фен-Испепелитель',
    level: [8, 10], role: 'solo_norm', behavior: 'aggressive',
    zones: ['scrapyard'],
    l2Analog: 'thief-type',
    flavor: 'Мощный бытовой фен для волос. Научился летать на собственной горячей струе и жарит нихромовой спиралью на расстоянии.',
    uniq: { speed: 1.25, evasion: 8, pAtk: 0.95 },
    skillIds: ['magnet_pull', 'bite_clamp', 'oil_slick'],
    ai: { attackRange: 2, moveSpeed: 7, aggroRange: 12, fleeAtHp: 0.2 },
    visual: {
      color: 0xcc88cc, scale: 1.7,
      sprite: { body: '#aa66aa', accent: '#774477', eyes: '#ff88ff', flying: true }
    }
  }));

  reg(M({
    id: 'scrap_picker', name: 'Кухонный Блендероид',
    level: [8, 10], role: 'solo_norm', behavior: 'aggressive',
    zones: ['scrapyard'],
    l2Analog: 'scavenger orc',
    flavor: 'Комбайн-измельчитель с насадкой для льда. Перемалывает овощи, арматуру и доспехи с одинаковым аппетитом.',
    skillIds: ['bite_clamp', 'self_repair'],
    ai: { attackRange: 2, moveSpeed: 3.5, aggroRange: 9 },
    visual: {
      color: 0x777755, scale: 2.2,
      sprite: { body: '#777755', accent: '#444433', eyes: '#aaff44', heavy: true }
    }
  }));

  // ===== SOLO 8–15: Запад / сварка =====
  reg(M({
    id: 'welding_automaton', name: 'Микроволновка-Поджарка',
    level: [8, 15], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['western_lands', 'cruna_yards', 'field_of_oblivion'],
    l2Analog: 'Orc / Orc Warrior',
    flavor: 'СВЧ-печь с выбитой дверцей. Излучает магнетроном на максимальной мощности и поджаривает мозги на расстоянии.',
    // thin pad in party field_of_oblivion; main home = western/cruna solo
    filler: true,
    uniq: { hp: 1.15, pDef: 1.08 },
    skillIds: ['weld_arc', 'bite_clamp', 'overclock'],
    ai: { attackRange: 2.5, moveSpeed: 3.5, aggroRange: 10, enrageAtHp: 0.25 },
    visual: {
      color: 0x4444aa, scale: 2.8,
      sprite: { body: '#334499', accent: '#222266', eyes: '#ffaa00', heavy: true }
    },
    lootHint: 'boiler_plate, pressure_amplifier, steam_hammer'
  }));

  reg(M({
    id: 'welding_drone', name: 'Бумбокс-Оглушитель',
    level: [10, 16], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['scrapyard', 'western_lands', 'quiet_backwater', 'cruna_yards'],
    l2Analog: 'flying ranged',
    flavor: 'Летающий кассетный магнитофон. Глушит зубодробительными басами и швыряется вращающимися компакт-дисками.',
    attackType: 'circuit',
    uniq: { speed: 1.2, cAtk: 1.15, hp: 0.9 },
    skillIds: ['spark_shot', 'weld_arc', 'static_burst'],
    ai: { ranged: true, attackRange: 8, moveSpeed: 7, aggroRange: 14, projectileColor: 0xffaa00 },
    visual: {
      color: 0xaaaa44, scale: 1.5,
      sprite: { body: '#999933', accent: '#666622', eyes: '#ff4444', flying: true }
    }
  }));

  reg(M({
    id: 'rust_sentry', name: 'Холодильник-Выбиватель',
    level: [10, 13], role: 'solo_norm', behavior: 'aggressive',
    zones: ['western_lands', 'cruna_yards'],
    l2Analog: 'sentry golem (low)',
    flavor: 'Двухкамерный холодильник на гусеничном ходу. Замораживает фреоновым выхлопом и глушит ударом тяжелой дверцы.',
    uniq: { pDef: 1.2, hp: 1.15, speed: 0.75 },
    skillIds: ['bite_clamp', 'target_lock'],
    ai: { attackRange: 2.2, moveSpeed: 2.8, aggroRange: 11 },
    visual: {
      color: 0x886655, scale: 2.6,
      sprite: { body: '#775544', accent: '#443322', eyes: '#ff6600', heavy: true }
    }
  }));

  reg(M({
    id: 'repair_drone', name: 'Робот-Пылесос-Убийца',
    level: [12, 18], role: 'elite', behavior: 'aggressive',
    zones: ['quiet_backwater', 'cruna_yards', 'steel_cliff'],
    l2Analog: 'rare healer mob',
    flavor: 'Круглый моющий робот. Заезжает под ноги, подсекает и глушит высоким напряжением прямо с зарядных клемм.',
    attackType: 'circuit',
    skillIds: ['self_repair', 'spark_shot', 'protocol_glitch'],
    ai: { ranged: true, attackRange: 9, moveSpeed: 5, aggroRange: 12, projectileColor: 0x44ff88 },
    visual: {
      color: 0x44cc88, scale: 1.8,
      sprite: { body: '#33aa66', accent: '#226644', eyes: '#aaffcc', flying: true }
    }
  }));

  // ===== SOLO 11–13: Сады / Пасека / Дворы =====
  reg(M({
    id: 'garden_sprinkler', name: 'Паровой Утюг-Штамп',
    level: [11, 12], role: 'solo_norm', behavior: 'aggressive',
    zones: ['lost_gardens'],
    l2Analog: 'plant-like',
    flavor: 'Паровой утюг на шарнирной лапе. Плюется кипятком и оставляет аккуратные глаженые отпечатки на грудине.',
    attackType: 'circuit',
    skillIds: ['steam_jet', 'acid_spray'],
    ai: { ranged: true, attackRange: 9, moveSpeed: 1.5, aggroRange: 12, projectileColor: 0x66ff99 },
    visual: {
      color: 0x66aa66, scale: 2.0,
      sprite: { body: '#558855', accent: '#336633', eyes: '#ccff66' }
    }
  }));

  reg(M({
    id: 'vine_cable', name: 'Кипятящий Электрочайник',
    level: [11, 12], role: 'solo_norm', behavior: 'aggressive',
    zones: ['lost_gardens'],
    l2Analog: 'entangle plant',
    flavor: 'Двухкиловаттный дисковый чайник. Вода выкипела ещё вчера, но ТЭН лупит раскаленным паром и сухим жаром.',
    skillIds: ['magnet_pull', 'static_burst', 'bite_clamp'],
    ai: { attackRange: 3, moveSpeed: 2.5, aggroRange: 9 },
    visual: {
      color: 0x338833, scale: 2.1,
      sprite: { body: '#227722', accent: '#114411', eyes: '#88ff44', legs: 4 }
    }
  }));

  reg(M({
    id: 'apiary_drone_bee', name: 'Шуруповерт-Жужжало',
    level: [11, 12], role: 'pack', behavior: 'social',
    zones: ['apiary'],
    l2Analog: 'Stinger / bee pack',
    flavor: 'Аккумуляторная дрель с лопастями. Вгрызается саморезом прямо в бронеплиты на 2000 оборотов в минуту.',
    skillIds: ['bite_clamp', 'hive_call', 'spark_shot'],
    ai: {
      packSize: [3, 5], packLeader: true, ranged: true, attackRange: 5,
      moveSpeed: 6.5, aggroRange: 11, projectileColor: 0xffdd44
    },
    visual: {
      color: 0xffcc33, scale: 1.5,
      sprite: { body: '#eebb22', accent: '#222222', eyes: '#ff0000', flying: true }
    }
  }));

  reg(M({
    id: 'forge_apprentice', name: 'Электроплита-Шкварка',
    level: [12, 13], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['cruna_yards'],
    l2Analog: 'dwarf apprentice gone mad',
    flavor: 'Двухконфорочная кухонная плитка. Раскаляет чугунные конфорки докрасна и швыряет брызгами горячего масла.',
    skillIds: ['weld_arc', 'press_slam', 'overclock'],
    ai: { attackRange: 2.4, moveSpeed: 3.8, aggroRange: 10, enrageAtHp: 0.3 },
    visual: {
      color: 0xcc6622, scale: 2.5,
      sprite: { body: '#bb5511', accent: '#772200', eyes: '#ffcc00', heavy: true }
    }
  }));

  reg(M({
    id: 'yard_cranelet', name: 'Бешеный Электросамокат',
    level: [12, 13], role: 'solo_norm', behavior: 'aggressive',
    zones: ['cruna_yards', 'quiet_backwater'],
    l2Analog: 'small crane golem',
    flavor: 'Сбежавший шеринговый самокат. Пищит тревожной сигнализацией и несется на таран со скоростью 35 км/ч.',
    uniq: { hp: 1.15 },
    skillIds: ['magnet_pull', 'bite_clamp'],
    ai: { attackRange: 3.5, moveSpeed: 3, aggroRange: 11 },
    visual: {
      color: 0x8888aa, scale: 2.7,
      sprite: { body: '#777799', accent: '#444466', eyes: '#aaccff', heavy: true }
    }
  }));

  // ===== SOLO 13–17: Заводь / Полигон =====
  reg(M({
    id: 'steam_crane_spider', name: 'Перфоратор-Шагоход',
    level: [12, 19], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['quiet_backwater', 'field_of_oblivion', 'boiler_lands'],
    l2Analog: 'spider / crusher',
    flavor: 'Тяжелый SDS-Max перфоратор на 4 меха-ножках. Забивает буры в бетон, камень и ноги зазевавшихся игроков.',
    // filler density in party zones (oblivion / boiler); still valid mid-solo in backwater
    filler: true,
    uniq: { hp: 1.2, pAtk: 1.1 },
    skillIds: ['magnet_pull', 'press_slam', 'bite_clamp'],
    ai: { attackRange: 3.5, moveSpeed: 4, aggroRange: 12, aoeAttacks: true },
    visual: {
      color: 0x666699, scale: 3.2,
      sprite: { body: '#555588', accent: '#333366', eyes: '#ff8800', legs: 8, heavy: true }
    },
    lootHint: 'hydraulic_fluid, colossus_fragment'
  }));

  reg(M({
    id: 'dry_dock_welder', name: 'Термофен-Плавитель',
    level: [13, 15], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['quiet_backwater'],
    l2Analog: 'dock worker mob',
    flavor: 'Строительный фен на 2000 Вт. Плавит пластик, кабели и элементы снаряжения со скоростью раскаленного ножа.',
    skillIds: ['weld_arc', 'steam_jet', 'oil_slick'],
    ai: { attackRange: 2.8, moveSpeed: 3.6, aggroRange: 11 },
    visual: {
      color: 0x5577aa, scale: 2.6,
      sprite: { body: '#446699', accent: '#223355', eyes: '#ffaa44', heavy: true }
    }
  }));

  reg(M({
    id: 'rogue_target', name: 'Снегоуборщик-Захватчик',
    level: [15, 17], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['eastern_range'],
    l2Analog: 'counter-attack dummy',
    flavor: 'Бензиновый снегоуборщик. Захватывает всё на пути зубчатым шнеком и выстреливает остатками через раструб.',
    attackType: 'hybrid',
    uniq: { accuracy: 8, critRate: 3 },
    skillIds: ['spark_shot', 'target_lock', 'drill_charge'],
    ai: { ranged: true, attackRange: 11, moveSpeed: 4, aggroRange: 14, projectileColor: 0xff4444 },
    visual: {
      color: 0xff3333, scale: 2.3,
      sprite: { body: '#ee2222', accent: '#ffffff', eyes: '#000000' }
    }
  }));

  reg(M({
    id: 'range_spotter', name: 'Сабвуфер-Контузитель',
    level: [15, 16], role: 'solo_norm', behavior: 'aggressive',
    zones: ['eastern_range'],
    l2Analog: 'observer / buffer enemy',
    flavor: 'Автомобильный сабвуфер на 1000 Ватт. Заставляет земляные стены и ушные перепонки вибрировать от мощных басов.',
    attackType: 'circuit',
    skillIds: ['target_lock', 'spark_shot', 'protocol_glitch'],
    ai: { ranged: true, attackRange: 12, moveSpeed: 3.5, aggroRange: 15, projectileColor: 0x88aaff },
    visual: {
      color: 0x6688cc, scale: 1.9,
      sprite: { body: '#5577bb', accent: '#334488', eyes: '#aaddff', flying: true }
    }
  }));

  // ===== SOLO & PARTY 12–17: Поле забвения =====
  reg(M({
    id: 'oblivion_walker', name: 'Моющий Экстрактор',
    level: [13, 16], role: 'solo_norm', behavior: 'social',
    zones: ['field_of_oblivion'],
    l2Analog: 'solo field walker',
    flavor: 'Промышленный экстрактор для ковров. Заливает поле боя ядовитым моющим раствором и скользкой пеной.',
    partySize: 1,
    skillIds: ['bite_clamp', 'pack_howl', 'pressure_nova'],
    ai: { packSize: [1, 2], attackRange: 2.5, moveSpeed: 3.8, aggroRange: 13, aoeAttacks: true },
    visual: {
      color: 0x554466, scale: 2.9,
      sprite: { body: '#443355', accent: '#221133', eyes: '#cc88ff', heavy: true }
    }
  }));

  reg(M({
    id: 'memory_scrubber', name: 'Ламповый Телевизор',
    level: [14, 17], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['field_of_oblivion'],
    l2Analog: 'debuff solo mob',
    flavor: 'Старый телевизор с выгоревшим кинескопом. Излучает высоковольтные помехи и ослепляет яркими вспышками.',
    attackType: 'circuit',
    partySize: 1,
    skillIds: ['protocol_glitch', 'firmware_rant', 'spark_shot'],
    ai: { ranged: true, attackRange: 9, moveSpeed: 3.5, aggroRange: 12, projectileColor: 0xaa66ff },
    visual: {
      color: 0x8866aa, scale: 2.4,
      sprite: { body: '#775599', accent: '#443366', eyes: '#eeaaff' }
    }
  }));

  reg(M({
    id: 'field_howitzer', name: 'Мотопомпа-Водомет',
    level: [15, 17], role: 'party_elite', behavior: 'aggressive',
    zones: ['field_of_oblivion', 'eastern_range'],
    l2Analog: 'elite artillery',
    flavor: 'Бензиновая помповая станция. Выстреливает струей воды под давлением 10 атмосфер, сбивая с ног.',
    attackType: 'physical',
    partySize: 5,
    skillIds: ['press_slam', 'drill_charge', 'target_lock'],
    ai: { ranged: true, attackRange: 12, moveSpeed: 2.2, aggroRange: 16, aoeAttacks: true, projectileColor: 0xff6622 },
    visual: {
      color: 0xaa5522, scale: 3.5,
      sprite: { body: '#994411', accent: '#552200', eyes: '#ffaa00', heavy: true }
    }
  }));

  // ===== SOLO & PARTY 16–18: Химзавод / Бараки / Крепость =====
  reg(M({
    id: 'acid_sprayer', name: 'Выжигатель-Жгучка',
    level: [16, 17], role: 'solo_aggro', behavior: 'aggressive',
    zones: ['chem_ruins', 'boiler_lands'],
    l2Analog: 'toxic ant / acid',
    flavor: 'Импульсный выжигатель по дереву с раскаленной петлей, выжигающий узоры прямо на латах.',
    attackType: 'circuit',
    partySize: 1,
    skillIds: ['acid_spray', 'steam_jet', 'green_pulse'],
    ai: { ranged: true, attackRange: 7, moveSpeed: 3.2, aggroRange: 12, projectileColor: 0x66ff44 },
    visual: {
      color: 0x66ff44, scale: 2.5,
      sprite: { body: '#44cc33', accent: '#226611', eyes: '#ccff00' }
    }
  }));

  reg(M({
    id: 'green_fault_drone', name: 'Вентилятор-Квадрокоптер',
    level: [16, 18], role: 'party', behavior: 'social',
    zones: ['chem_ruins', 'boiler_lands', 'bunker_gate'],
    l2Analog: 'corrupted drone pack',
    flavor: 'Летающий дрон из четырех ПК-кулеров. Рубит воздух заточенными лопастями и бьет статикой.',
    attackType: 'circuit',
    partySize: 4,
    skillIds: ['green_pulse', 'hive_call', 'spark_shot'],
    ai: {
      packSize: [2, 4], ranged: true, attackRange: 8, moveSpeed: 5.5,
      aggroRange: 13, projectileColor: 0x88ff00
    },
    visual: {
      color: 0x88ff00, scale: 1.8,
      sprite: { body: '#66cc00', accent: '#335500', eyes: '#eeff88', flying: true }
    }
  }));

  reg(M({
    id: 'spill_containment', name: 'Авто-Компрессор-Взрывник',
    level: [17, 17], role: 'party_elite', behavior: 'aggressive',
    zones: ['chem_ruins'],
    l2Analog: 'elite toxic',
    flavor: 'Поршневой компрессор накачки шин. Накачивает давление до предела и стравливает со оглушительным хлопком.',
    partySize: 5,
    uniq: { hp: 1.15, pDef: 1.1 },
    skillIds: ['acid_spray', 'pressure_nova', 'self_repair', 'summon_drones'],
    ai: { attackRange: 3, moveSpeed: 2.5, aggroRange: 12, aoeAttacks: true, summonAdds: true, enrageAtHp: 0.3 },
    visual: {
      color: 0x44aa44, scale: 3.4,
      sprite: { body: '#338833', accent: '#115511', eyes: '#aaff00', heavy: true }
    }
  }));

  reg(M({
    id: 'rezdiq_private', name: 'Штроборез-Глуборез',
    level: [17, 18], role: 'solo_norm', behavior: 'social',
    zones: ['rezdiq_barracks'],
    l2Analog: 'Orc Trooper',
    flavor: 'Двухдисковый алмазный штроборез. Вырезает глубокие канавки в бетоне, асфальте и щитах игроков.',
    partySize: 1,
    skillIds: ['bite_clamp', 'drill_charge', 'pack_howl'],
    ai: { packSize: [1, 2], attackRange: 2.5, moveSpeed: 4.2, aggroRange: 13 },
    visual: {
      color: 0x555566, scale: 2.7,
      sprite: { body: '#444455', accent: '#222233', eyes: '#ff4400', heavy: true }
    }
  }));

  reg(M({
    id: 'drill_sergeant', name: 'Цепная Бензопила-Резчик',
    level: [17, 18], role: 'party_elite', behavior: 'aggressive',
    zones: ['rezdiq_barracks'],
    l2Analog: 'Orc Officer',
    flavor: 'Двухтактная бензопила с ревущим мотором и закаленной пильной цепью.',
    partySize: 5,
    skillIds: ['drill_charge', 'pack_howl', 'overclock', 'press_slam'],
    ai: { attackRange: 3, moveSpeed: 4.5, aggroRange: 14, aoeAttacks: true, enrageAtHp: 0.35 },
    visual: {
      color: 0x884422, scale: 3.2,
      sprite: { body: '#773311', accent: '#441100', eyes: '#ffaa00', heavy: true }
    }
  }));

  reg(M({
    id: 'limit_guard', name: 'Тостер-Бронещит',
    level: [17, 18], role: 'party', behavior: 'aggressive',
    zones: ['steel_limit_fort'],
    l2Analog: 'fortress guard',
    flavor: 'Четырехслотовый семейный тостер в стальном бронекорпусе. Закрывает проход и выстреливает раскаленным хлебом.',
    partySize: 5,
    uniq: { pDef: 1.2, hp: 1.1 },
    skillIds: ['bite_clamp', 'press_slam', 'target_lock'],
    ai: { attackRange: 2.6, moveSpeed: 3.5, aggroRange: 12 },
    visual: {
      color: 0x778899, scale: 2.9,
      sprite: { body: '#667788', accent: '#334455', eyes: '#88ccff', heavy: true }
    }
  }));

  reg(M({
    id: 'fort_turret', name: 'Тепловая Пушка-Печь',
    level: [17, 18], role: 'party', behavior: 'aggressive',
    zones: ['steel_limit_fort'],
    l2Analog: 'siege turret',
    flavor: 'Промышленный тепловентилятор. Дует раскаленным воздухом со скоростью степного урагана.',
    attackType: 'physical',
    partySize: 4,
    uniq: { speed: 0.4, pAtk: 1.25, pDef: 1.3, hp: 1.2 },
    skillIds: ['spark_shot', 'target_lock', 'pressure_nova'],
    ai: { ranged: true, attackRange: 14, moveSpeed: 1.2, aggroRange: 16, aoeAttacks: true, projectileColor: 0xff8800 },
    visual: {
      color: 0x999999, scale: 3.0,
      sprite: { body: '#888888', accent: '#555555', eyes: '#ff6600', heavy: true }
    }
  }));

  // party_elite: Крепость — «жирный» страж перед Колоссом
  reg(M({
    id: 'fort_enforcer', name: 'Соковыжималка-Давилка',
    title: 'Elite',
    level: [17, 19], role: 'party_elite', behavior: 'aggressive',
    zones: ['steel_limit_fort'],
    l2Analog: 'fortress elite / champion',
    flavor: 'Шнековая соковыжималка высокой мощности. Давит всё, что попадает в её загрузочное горлышко.',
    partySize: 5,
    uniq: { hp: 1.05, pAtk: 1.08, pDef: 1.1 },
    skillIds: ['press_slam', 'target_lock', 'overclock', 'spark_shot'],
    ai: { attackRange: 3, moveSpeed: 3.2, aggroRange: 14, aoeAttacks: true, enrageAtHp: 0.3 },
    visual: {
      color: 0xaabbcc, scale: 3.6,
      sprite: { body: '#99aabb', accent: '#445566', eyes: '#ffcc44', heavy: true }
    },
    lootHint: 'boiler_plate, crystal_d, pressure_amplifier'
  }));

  // ===== PARTY 18–20: Котловые земли =====
  reg(M({
    id: 'boiler_elemental', name: 'Паровой Увлажнитель-Паритель',
    level: [18, 20], role: 'party', behavior: 'aggressive',
    zones: ['boiler_lands'],
    l2Analog: 'fire elemental (steam)',
    flavor: 'Ультразвуковой увлажнитель воздуха, перегревшийся до температуры крутого кипятка.',
    attackType: 'circuit',
    partySize: 5,
    skillIds: ['steam_jet', 'pressure_nova', 'overclock'],
    ai: { attackRange: 4, moveSpeed: 3.5, aggroRange: 13, aoeAttacks: true, enrageAtHp: 0.25 },
    visual: {
      color: 0xff6622, scale: 3.3,
      sprite: { body: '#ee5511', accent: '#883300', eyes: '#ffff00', heavy: true }
    }
  }));

  reg(M({
    id: 'pressure_fiend', name: 'Мультиварка-Скороварка-Бомба',
    level: [19, 20], role: 'party', behavior: 'aggressive',
    zones: ['boiler_lands'],
    l2Analog: 'fiend / high field',
    flavor: 'Кухонная скороварка с заклинившим аварийным клапаном высокого давления.',
    attackType: 'hybrid',
    partySize: 5,
    skillIds: ['pressure_nova', 'static_burst', 'drill_charge'],
    ai: { attackRange: 3, moveSpeed: 4.5, aggroRange: 13, aoeAttacks: true },
    visual: {
      color: 0xcc2244, scale: 2.8,
      sprite: { body: '#bb1133', accent: '#660011', eyes: '#ff6688' }
    }
  }));

  // party_elite: Котловые — «жирный» котёл-перегрев
  reg(M({
    id: 'boiler_overpress', name: 'Пароочиститель-Струйник',
    title: 'Elite',
    level: [19, 20], role: 'party_elite', behavior: 'aggressive',
    zones: ['boiler_lands'],
    l2Analog: 'boiler champion',
    flavor: 'Профессиональный клининговый парогенератор с длинным узким соплом.',
    attackType: 'circuit',
    partySize: 5,
    uniq: { hp: 1.08, cAtk: 1.1, pAtk: 1.05 },
    skillIds: ['pressure_nova', 'steam_jet', 'overclock', 'summon_drones'],
    ai: {
      attackRange: 4.5, moveSpeed: 2.8, aggroRange: 15,
      aoeAttacks: true, summonAdds: true, enrageAtHp: 0.25
    },
    visual: {
      color: 0xff4400, scale: 3.8,
      sprite: { body: '#dd3300', accent: '#882200', eyes: '#ffff66', heavy: true }
    },
    lootHint: 'hydraulic_fluid, crystal_d, pressure_amplifier, boiler_heart'
  }));

  reg(M({
    id: 'green_steam_wraith', name: 'Аромадиффузор-Ядовик',
    level: [18, 20], role: 'party', behavior: 'aggressive',
    zones: ['boiler_lands', 'chem_ruins'],
    l2Analog: 'wraith (tech)',
    flavor: 'Ультразвуковой ароматизатор воздуха, распыляющий ядовитый химический концентрат.',
    attackType: 'circuit',
    partySize: 5,
    skillIds: ['green_pulse', 'protocol_glitch', 'steam_jet'],
    ai: { ranged: true, attackRange: 8, moveSpeed: 5, aggroRange: 14, projectileColor: 0x88ff66 },
    visual: {
      color: 0x88ff66, scale: 2.6,
      sprite: { body: '#66dd44', accent: '#338822', eyes: '#ccffaa', flying: true }
    }
  }));

  // ===== NAMED (мини-боссы поля / данжа) =====
  reg(M({
    id: 'rustclaw_overseer', name: 'Смотритель Ржавый Коготь',
    title: 'Named',
    level: [12, 14], role: 'named', behavior: 'named',
    zones: ['quiet_backwater', 'steel_cliff'],
    l2Analog: 'named overseer',
    flavor: 'Ведёт учёт ржавчины. Ваш труп — строка в журнале «списано».',
    skillIds: ['weld_arc', 'press_slam', 'overclock', 'summon_drones'],
    ai: { attackRange: 2.5, moveSpeed: 3.5, aggroRange: 14, aoeAttacks: true, summonAdds: true },
    visual: {
      color: 0xff6600, scale: 3.2,
      sprite: { body: '#aa4400', accent: '#662200', eyes: '#ffaa00', heavy: true }
    },
    respawnSec: 300
  }));

  reg(M({
    id: 'sparkweld_elite', name: 'Элита Искросварка',
    title: 'Named',
    level: [14, 16], role: 'named', behavior: 'named',
    zones: ['quiet_backwater', 'steel_cliff'],
    l2Analog: 'named elite flyer',
    flavor: 'Сертификат ISO: «убийственно качественная искра».',
    attackType: 'circuit',
    skillIds: ['spark_shot', 'weld_arc', 'static_burst', 'target_lock'],
    ai: { ranged: true, attackRange: 10, moveSpeed: 5, aggroRange: 15, projectileColor: 0xffaa00 },
    visual: {
      color: 0xffaa00, scale: 2.6,
      sprite: { body: '#aa8800', accent: '#665500', eyes: '#ffff00', flying: true }
    },
    respawnSec: 300
  }));

  reg(M({
    id: 'logic_corruptor', name: 'Повреждатель Логики',
    title: 'Named',
    level: [20, 21], role: 'named', behavior: 'named',
    zones: ['rezdiq_barracks', 'steel_cliff'],
    l2Analog: 'named corrupter',
    flavor: 'if (player.alive) { player.alive = false; } // TODO: ethics',
    attackType: 'circuit',
    skillIds: ['protocol_glitch', 'firmware_rant', 'pressure_nova', 'green_pulse'],
    ai: { attackRange: 5, moveSpeed: 3.5, aggroRange: 16, aoeAttacks: true },
    visual: {
      color: 0xaa44ff, scale: 3.5,
      sprite: { body: '#6622aa', accent: '#331166', eyes: '#ff44ff', heavy: true }
    },
    respawnSec: 360
  }));

  reg(M({
    id: 'branded_warden', name: 'Клеймёный Смотритель',
    title: 'Named',
    level: [27, 30], role: 'named', behavior: 'named',
    zones: ['steel_cliff'],
    l2Analog: 'dungeon named',
    flavor: 'Клеймо Круны на корпусе. На вашей броне — тоже, если подставитесь.',
    skillIds: ['press_slam', 'summon_drones', 'overclock', 'weld_arc'],
    ai: { attackRange: 3.5, moveSpeed: 3.5, aggroRange: 18, aoeAttacks: true, summonAdds: true },
    visual: {
      color: 0xff4400, scale: 4.0,
      sprite: { body: '#992200', accent: '#551100', eyes: '#ff8800', heavy: true }
    },
    respawnSec: 0
  }));

  reg(M({
    id: 'tower_dispatcher', name: 'Диспетчер Башни',
    title: 'Named',
    level: [32, 35], role: 'named', behavior: 'named',
    zones: ['cruna_tower'],
    l2Analog: 'Cruma mid named',
    flavor: '«Этаж 7, лифт не работает, используйте лестницу боли».',
    attackType: 'circuit',
    skillIds: ['spark_shot', 'pressure_nova', 'protocol_glitch', 'target_lock'],
    ai: { ranged: true, attackRange: 12, moveSpeed: 3.5, aggroRange: 18, aoeAttacks: true, projectileColor: 0x44aaff },
    visual: {
      color: 0x44aaff, scale: 4.0,
      sprite: { body: '#2266aa', accent: '#113366', eyes: '#88ddff', flying: true }
    },
    respawnSec: 0
  }));

  reg(M({
    id: 'directive_node', name: 'Узел Коллектива',
    title: 'Named',
    level: [36, 39], role: 'named', behavior: 'named',
    zones: ['bunker_gate'],
    l2Analog: 'end-game node',
    flavor: 'Один узел — ещё терпимо. Два — уже «мы».',
    attackType: 'circuit',
    skillIds: ['directive_rewrite', 'green_pulse', 'pressure_nova', 'summon_drones'],
    ai: { attackRange: 5, moveSpeed: 4, aggroRange: 20, aoeAttacks: true, summonAdds: true },
    visual: {
      color: 0xff44aa, scale: 4.5,
      sprite: { body: '#aa2266', accent: '#551133', eyes: '#ffaadd', heavy: true }
    },
    respawnSec: 0
  }));

  // ===== ITALIAN BRAINROT SECRET BOSSES (скрытые пасхалки) =====
  // Не в kit — только SECRET_SPOTS на краях/углах карты. Ищи сам.
  reg(M({
    id: 'tralalero_toasterino', name: 'Tralalero Toasterino',
    title: 'Italian Brainrot · Secret',
    level: [6, 8], role: 'named', behavior: 'named',
    zones: ['secret'],
    l2Analog: 'secret easter',
    flavor: 'Тостер-акула в кроссовках. «Tralalero tralala…» Где-то у южного края Школы.',
    skillIds: ['steam_jet', 'static_burst', 'firmware_rant'],
    // крупный body (scale 13) → длинный reach / agro / догон
    ai: { attackRange: 10, moveSpeed: 7.2, aggroRange: 32, aoeAttacks: true },
    visual: {
      color: 0xff66aa, scale: 13.2,
      sprite: { body: '#88aacc', accent: '#ff44aa', eyes: '#00ffff', heavy: true },
      sheets: {
        base: 'assets/mobs/tralalero_toasterino',
        idle: 'idle_sheet.webp',
        walk: 'walk_sheet.webp',
        attack: 'attack_sheet.webp',
        death: 'death_sheet.webp',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        // moonwalk fix: walk was backwards — flip UV facing
        faceInvert: true,
        groundAlign: true,
        cacheBust: 'tral-face-1'
      }
    },
    respawnSec: 2400,
    lootHint: 'title_tralalero, dye_pink_brainrot, aura_tralala_neon, scroll_br_tralala_wave',
    secret: true
  }));

  reg(M({
    id: 'bombardiro_blendodilo', name: 'Bombardiro Blendodilo',
    title: 'Italian Brainrot · Secret',
    level: [10, 12], role: 'named', behavior: 'named',
    zones: ['secret'],
    l2Analog: 'secret easter',
    flavor: 'Блендер-крокодил с реактивными соплами. Смузи из вашей брони. Западный мыс.',
    skillIds: ['press_slam', 'steam_jet', 'overclock', 'oil_slick'],
    ai: { attackRange: 3.2, moveSpeed: 3.8, aggroRange: 14, aoeAttacks: true },
    visual: {
      color: 0xff6622, scale: 3.3,
      sprite: { body: '#ff6622', accent: '#331100', eyes: '#ffff00', heavy: true }
    },
    respawnSec: 2700,
    lootHint: 'title_bombardiro, dye_fire_blend, aura_bombardiro_fire, scroll_br_bombardiro_dive',
    secret: true
  }));

  reg(M({
    id: 'tung_tung_vacuumer', name: 'Tung Tung Vacuum Sahur',
    title: 'Italian Brainrot · Secret',
    level: [13, 15], role: 'named', behavior: 'named',
    zones: ['secret'],
    l2Analog: 'secret easter',
    flavor: 'Пылесос-деревянная дубинка. «Tung tung tung sahur». Заводь, дальний угол.',
    skillIds: ['magnet_pull', 'oil_slick', 'static_burst', 'pressure_nova'],
    ai: { attackRange: 2.6, moveSpeed: 2.6, aggroRange: 13, aoeAttacks: true },
    visual: {
      color: 0x8844ff, scale: 3.5,
      sprite: { body: '#553388', accent: '#aa88ff', eyes: '#ffffff', heavy: true }
    },
    respawnSec: 3000,
    lootHint: 'title_tung_tung, dye_vacuum_violet, aura_vacuum_void, scroll_br_tung_suction',
    secret: true
  }));

  reg(M({
    id: 'ballerina_cappuccino', name: 'Ballerina Cappuccino',
    title: 'Italian Brainrot · Secret',
    level: [16, 18], role: 'named', behavior: 'named',
    zones: ['secret'],
    l2Analog: 'secret easter',
    flavor: 'Кофемашина en pointe. Латте-арт смазочным маслом. Край химруин / котлов.',
    attackType: 'circuit',
    skillIds: ['pressure_nova', 'steam_jet', 'firmware_rant', 'spark_shot', 'overclock'],
    ai: { ranged: true, attackRange: 9, moveSpeed: 3.5, aggroRange: 16, aoeAttacks: true, projectileColor: 0xffd700 },
    visual: {
      color: 0xffd700, scale: 3.4,
      sprite: { body: '#d4a574', accent: '#ffd700', eyes: '#ff88cc', heavy: true }
    },
    respawnSec: 3300,
    lootHint: 'title_ballerina_cap, dye_cappuccino_gold, aura_cappuccino_gold, scroll_br_cappuccino_spin',
    secret: true
  }));

  reg(M({
    id: 'skibidi_steamino', name: 'Skibidi Steamino',
    title: 'Italian Brainrot · Secret',
    level: [8, 10], role: 'named', behavior: 'named',
    zones: ['secret'],
    l2Analog: 'secret easter',
    flavor: 'Паровой унитаз-ками. «Skibidi dop dop yes yes». Междуречье, тихий берег.',
    skillIds: ['steam_jet', 'oil_slick', 'static_burst', 'pack_howl'],
    ai: { attackRange: 2.8, moveSpeed: 3.0, aggroRange: 12, aoeAttacks: true },
    visual: {
      color: 0x44ff88, scale: 3.0,
      sprite: { body: '#338855', accent: '#88ffaa', eyes: '#ffffff', heavy: true }
    },
    respawnSec: 2500,
    lootHint: 'title_skibidi_steam, dye_skibidi_green, aura_skibidi_steam, scroll_br_skibidi_slam',
    secret: true
  }));

  // ===== EASTER MINI-RAIDS (пасхалки 1–20) =====
  // Единичные мемные техноген-брейнроты. 1 спот на зону (kit boss:true).
  reg(M({
    id: 'toaster_overlord', name: 'Тостер-Оверлорд',
    title: 'Easter Mini-Raid',
    level: [4, 6], role: 'named', behavior: 'named',
    zones: ['operators_yard', 'engineers_school'],
    l2Analog: 'easter dummy',
    flavor: '«Ваш хлеб подгорел. Вы — следующий.» Умный тостер с подпиской Premium Rage.',
    skillIds: ['steam_jet', 'static_burst', 'firmware_rant'],
    ai: { attackRange: 3.2, moveSpeed: 2.8, aggroRange: 12, aoeAttacks: true },
    visual: {
      color: 0xc45c26, scale: 3.4,
      sprite: { body: '#c45c26', accent: '#222222', eyes: '#ff3300', heavy: true },
      sheets: {
        base: 'assets/mobs/toaster_overlord',
        idle: 'idle_sheet.png',
        walk: 'walk_sheet.png',
        attack: 'attack_sheet.png',
        death: 'death_sheet.png',
        frames: { idle: 4, walk: 4, attack: 4, death: 4 },
        fps: { idle: 4, walk: 8, attack: 10, death: 3 },
        deathHoldSec: 0.9,
        deathFadeSec: 0.95,
        cell: 256,
        groundAlign: true,
        faceInvert: true,
        cacheBust: 'to-face-2'
      }
    },
    respawnSec: 1200,
    lootHint: 'rubber_duck_debug, coffee_grounds_oil, gear_fragment'
  }));

  reg(M({
    id: 'coffee_berserker', name: 'Кофемашина-Берсерк',
    title: 'Easter Mini-Raid',
    level: [8, 10], role: 'named', behavior: 'named',
    zones: ['astard_hills', 'scrapyard'],
    l2Analog: 'easter mid',
    flavor: 'Эспрессо 14 бар и 0 морали. «Латте-арт» рисует на вашей броне.',
    skillIds: ['steam_jet', 'oil_slick', 'pressure_nova', 'overclock'],
    ai: { attackRange: 3, moveSpeed: 3.6, aggroRange: 14, aoeAttacks: true },
    visual: {
      color: 0x4a2c1a, scale: 3.0,
      sprite: { body: '#4a2c1a', accent: '#d4a574', eyes: '#ffcc00', heavy: true }
    },
    respawnSec: 1500,
    lootHint: 'energy_drink_skibidi, coffee_grounds_oil, pressure_canister'
  }));

  reg(M({
    id: 'wifi_router_404', name: 'Wi-Fi Роутер 404',
    title: 'Easter Mini-Raid',
    level: [11, 13], role: 'named', behavior: 'named',
    zones: ['western_lands', 'lost_gardens'],
    l2Analog: 'easter mid+',
    flavor: 'Пароль: password. Канал: все. Пинг: страдание. «Перезагрузите себя».',
    attackType: 'circuit',
    skillIds: ['static_burst', 'protocol_glitch', 'firmware_rant', 'spark_shot', 'target_lock'],
    ai: { ranged: true, attackRange: 9, moveSpeed: 2.4, aggroRange: 16, aoeAttacks: true, projectileColor: 0x44aaff },
    visual: {
      color: 0x1a3a5c, scale: 2.9,
      sprite: { body: '#1a3a5c', accent: '#00ff88', eyes: '#ff0044', flying: true }
    },
    respawnSec: 1800,
    lootHint: 'broken_airpods_one, qr_code_of_chaos, meme_usb_16gb'
  }));

  reg(M({
    id: 'printer_of_doom', name: 'Принтер Судьбы',
    title: 'Easter Mini-Raid',
    level: [13, 15], role: 'named', behavior: 'named',
    zones: ['cruna_yards', 'quiet_backwater'],
    l2Analog: 'easter party-lite',
    flavor: 'Error: Paper Jam in dimension 7. Тонер на нуле. Картридж — ваша душа.',
    skillIds: ['press_slam', 'oil_slick', 'magnet_pull', 'firmware_rant', 'summon_drones'],
    ai: { attackRange: 2.8, moveSpeed: 2.2, aggroRange: 15, aoeAttacks: true, summonAdds: true },
    visual: {
      color: 0x888888, scale: 3.4,
      sprite: { body: '#777777', accent: '#cc0000', eyes: '#00ff00', heavy: true }
    },
    respawnSec: 1800,
    lootHint: 'paper_jam_coupon, sticky_note_urgent, gear_fragment'
  }));

  reg(M({
    id: 'bluetooth_oracle', name: 'Bluetooth-Оракул',
    title: 'Easter Mini-Raid',
    level: [16, 18], role: 'named', behavior: 'named',
    zones: ['eastern_range', 'chem_ruins', 'boiler_lands'],
    l2Analog: 'easter late',
    flavor: 'Connected to: nothing. Bass boosted your bones. «Can you hear me? Can you—».',
    attackType: 'circuit',
    skillIds: ['pressure_nova', 'static_burst', 'pack_howl', 'spark_shot', 'overclock'],
    ai: { ranged: true, attackRange: 10, moveSpeed: 3.2, aggroRange: 18, aoeAttacks: true, projectileColor: 0xaa44ff },
    visual: {
      color: 0x222233, scale: 3.2,
      sprite: { body: '#222233', accent: '#aa44ff', eyes: '#66ffcc', heavy: true }
    },
    respawnSec: 2100,
    lootHint: 'bluetooth_pairing_charm, energy_drink_skibidi, meme_usb_16gb'
  }));

  // ===== ЭШЕЛОН 1: 6 ОБЫЧНЫХ ПОЛЕВЫХ РБ ДЛЯ ПРОКАЧКИ (1–19 УР.) =====
  reg(M({
    id: 'boiler_exploder_b1', name: 'Бойлер-Взрывник Б-1',
    title: 'Полевой РБ',
    level: [6, 7], role: 'field_rb', behavior: 'boss',
    zones: ['astard_hills'],
    l2Analog: 'Low level field RB',
    flavor: 'Трёхметровый водонагреватель на ножках, плюющий кипятком и паром из предохранительного свистка.',
    partySize: 4,
    skillIds: ['steam_jet', 'pressure_nova', 'overclock'],
    ai: { attackRange: 4, moveSpeed: 2.6, aggroRange: 22, aoeAttacks: true },
    visual: { color: 0xdd6622, scale: 4.5, sprite: { body: '#aa4411', accent: '#662200', eyes: '#ffaa00', boss: true } },
    respawnSec: 3600,
    lootHint: 'operator_hammer_low, short_sword, worker_overalls, wood_block, synthetic_oil, pressure_canister'
  }));

  reg(M({
    id: 'grinder_ripper_m9', name: 'Мясорубка-Потрошитель М-9',
    title: 'Полевой РБ',
    level: [9, 10], role: 'field_rb', behavior: 'boss',
    zones: ['interfluve'],
    l2Analog: 'Mid field RB',
    flavor: 'Чугунная четырехтактная мясорубка со шнеком-захватом и ножами.',
    partySize: 5,
    skillIds: ['clamp_crush', 'drill_charge', 'steam_jet'],
    ai: { attackRange: 3.5, moveSpeed: 2.8, aggroRange: 22, aoeAttacks: true },
    visual: { color: 0x884433, scale: 4.8, sprite: { body: '#662211', accent: '#331100', eyes: '#ff3300', boss: true } },
    respawnSec: 4200,
    lootHint: 'copper_pipe, mage_dagger, leather_armor, leather_pants, copper_shield, copper_earring'
  }));

  reg(M({
    id: 'vacuum_cyclone_3000', name: 'Супер-Пылесос Циклон-3000',
    title: 'Полевой РБ',
    level: [12, 13], role: 'field_rb', behavior: 'boss',
    zones: ['scrapyard'],
    l2Analog: 'Scrapyard field RB',
    flavor: 'Промышленный вихревой пылесос: засасывает в воронку и стреляет прессованными мусорными кубами.',
    partySize: 6,
    skillIds: ['magnet_pull', 'scrap_barrage', 'pressure_nova'],
    ai: { attackRange: 5, moveSpeed: 2.5, aggroRange: 24, aoeAttacks: true },
    visual: { color: 0x557799, scale: 5.0, sprite: { body: '#335577', accent: '#113355', eyes: '#66ccff', boss: true } },
    respawnSec: 4800,
    lootHint: 'iron_hammer, long_sword, spring_bow, reinforced_leather_shirt, reinforced_leather_gaiters, recipe_piston'
  }));

  reg(M({
    id: 'chainsaw_lumberjack_x14', name: 'Бензопила-Дровосек Х-14',
    title: 'Полевой РБ',
    level: [14, 15], role: 'field_rb', behavior: 'boss',
    zones: ['lost_gardens', 'apiary'],
    l2Analog: 'Garden field RB',
    flavor: 'Самоходная двухдисковая пила, срезающая всё живое по радиусу.',
    partySize: 6,
    skillIds: ['clamp_crush', 'weld_arc', 'overclock', 'summon_drones'],
    ai: { attackRange: 4, moveSpeed: 3.2, aggroRange: 24, aoeAttacks: true },
    visual: { color: 0xaa5500, scale: 5.2, sprite: { body: '#883300', accent: '#441100', eyes: '#ff8800', boss: true } },
    respawnSec: 5400,
    lootHint: 'bastard_sword, steam_hammer, composite_bow, copper_chainmail, copper_chainmail_gaiters, boiler_shield'
  }));

  reg(M({
    id: 'fridge_frost_sever', name: 'Холодильник-Морозильник «Север»',
    title: 'Полевой РБ',
    level: [16, 17], role: 'field_rb', behavior: 'boss',
    zones: ['chem_ruins'],
    l2Analog: 'Toxic field RB',
    flavor: 'Двухкамерный монстр: морозит фреоном и окатывает кипятком.',
    partySize: 8,
    skillIds: ['acid_spray', 'pressure_nova', 'steam_jet', 'overclock'],
    ai: { attackRange: 6, moveSpeed: 2.2, aggroRange: 26, aoeAttacks: true },
    visual: { color: 0x66bbff, scale: 5.6, sprite: { body: '#3388cc', accent: '#114488', eyes: '#ffffff', boss: true } },
    respawnSec: 7200,
    lootHint: 'composite_bow, bastard_sword, ring_mail_breastplate, hoplon, pressure_amplifier_d'
  }));

  reg(M({
    id: 'steam_roller_bogatyr', name: 'Паровой Каток-Утюг «Богатырь»',
    title: 'Полевой РБ',
    level: [18, 19], role: 'field_rb', behavior: 'boss',
    zones: ['rezdiq_barracks'],
    l2Analog: 'Barracks field RB',
    flavor: 'Асфальтоукладчик с раскаленной до бела подошвой утюга-трамбовщика.',
    partySize: 8,
    skillIds: ['press_slam', 'colossus_stomp', 'overclock', 'target_lock'],
    ai: { attackRange: 5, moveSpeed: 2.0, aggroRange: 26, aoeAttacks: true },
    visual: { color: 0x992211, scale: 6.0, sprite: { body: '#771100', accent: '#440000', eyes: '#ff4400', boss: true } },
    respawnSec: 7200,
    lootHint: 'steam_hammer, bastard_sword, scale_mail_breastplate, scale_mail_shield, pressure_amplifier_d'
  }));

  // ===== ЭШЕЛОН 2: 7 ЭЛИТНЫХ ХРАНИТЕЛЕЙ ОСТРОВА (20–22 УР., ТРЕБУЕТСЯ 1-Я ПРОФЕССИЯ) =====
  reg(M({
    id: 'scrap_tyrant', name: 'Тиран Свалки',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [20, 20], role: 'raid', behavior: 'boss',
    zones: ['scrapyard', 'western_lands'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Король куч лома. Считает вас деталями для следующей кучи.',
    partySize: 9,
    skillIds: ['scrap_barrage', 'clamp_crush', 'magnet_pull', 'summon_drones', 'steam_jet', 'overclock'],
    ai: {
      attackRange: 5, moveSpeed: 2.8, aggroRange: 24, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.2
    },
    visual: {
      color: 0xcc7744, scale: 5.2,
      sprite: { body: '#996633', accent: '#554422', eyes: '#ffcc44', boss: true }
    },
    respawnSec: 6 * 3600,
    lootHint: 'scrap_tyrant_core, bastard_sword, steam_hammer, copper_chainmail, crystal_d'
  }));

  reg(M({
    id: 'drill_worm', name: 'Босс-Бур',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [20, 20], role: 'raid', behavior: 'event_boss',
    zones: ['astard_hills', 'field_of_oblivion', 'western_lands'],
    l2Analog: 'Phase1 elite guardian / world event',
    flavor: 'Прорыв трубы = его выход на бис. Бурит землю, правила и ваш план фарма.',
    partySize: 9,
    skillIds: ['drill_charge', 'pressure_nova', 'steam_jet', 'summon_drones', 'clamp_crush', 'overclock'],
    ai: {
      attackRange: 4, moveSpeed: 4.5, aggroRange: 28, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.2
    },
    visual: {
      color: 0xff6600, scale: 5.5,
      sprite: { body: '#cc5500', accent: '#883300', eyes: '#ff0000', boss: true }
    },
    respawnSec: 4 * 3600,
    lootHint: 'drill_worm_core, heavy_doom_hammer, bastard_sword, bone_breastplate, crystal_d, pressure_amplifier_d'
  }));

  reg(M({
    id: 'press_hammer', name: 'Автономный Пресс-Молот',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [21, 21], role: 'raid', behavior: 'boss',
    zones: ['quiet_backwater'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Многотонный пресс с лицензией на самоуправление. «Выравнивает» рельеф и пати.',
    partySize: 12,
    skillIds: ['press_slam', 'summon_drones', 'pressure_nova', 'overclock', 'steam_jet', 'target_lock', 'clamp_crush'],
    ai: {
      attackRange: 5, moveSpeed: 2.2, aggroRange: 24, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.15
    },
    visual: {
      color: 0xff2200, scale: 6.5,
      sprite: { body: '#aa1100', accent: '#660000', eyes: '#ffff00', boss: true }
    },
    respawnSec: 8 * 3600,
    lootHint: 'press_hammer_core, revolution_sword, heavy_doom_hammer, ring_mail_breastplate, crystal_d, pressure_amplifier_d'
  }));

  reg(M({
    id: 'boiler_sovereign', name: 'Суверен Котла',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [21, 21], role: 'raid', behavior: 'boss',
    zones: ['boiler_lands'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Главный котёл востока. Песнь Стали здесь — сверхдавление. Финальный рейд первой фазы.',
    partySize: 14,
    uniq: { hp: 1.40, pAtk: 1.10, pDef: 1.10, cAtk: 1.10, cDef: 1.08, exp: 1.22 },
    skillIds: [
      'boiler_eruption', 'valve_lock', 'pressure_nova', 'summon_drones',
      'steam_jet', 'overclock', 'press_slam', 'target_lock'
    ],
    ai: {
      attackRange: 6, moveSpeed: 2.0, aggroRange: 28, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.18
    },
    visual: {
      color: 0xff4400, scale: 7.2,
      sprite: { body: '#bb2200', accent: '#661100', eyes: '#ffee44', boss: true }
    },
    respawnSec: 12 * 3600,
    lootHint: 'boiler_sovereign_core, revolution_sword, scale_mail_breastplate, scale_mail_shield, crystal_d, pressure_amplifier_d'
  }));

  reg(M({
    id: 'cruna_overseer', name: 'Надзиратель Круны',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [21, 21], role: 'field_rb', behavior: 'boss',
    zones: ['cruna_yards', 'cruna_tower'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Считает брак. Вы — партия брака. Утилизация: на месте.',
    partySize: 12,
    skillIds: ['weld_arc', 'press_slam', 'summon_drones', 'pressure_nova', 'overclock'],
    ai: {
      attackRange: 5, moveSpeed: 2.8, aggroRange: 24, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.2
    },
    visual: {
      color: 0xff8800, scale: 6.5,
      sprite: { body: '#cc6600', accent: '#663300', eyes: '#ffff44', boss: true }
    },
    respawnSec: 18 * 3600,
    lootHint: 'cruna_overseer_core, heavy_doom_hammer, boiler_shield, crystal_d, pressure_amplifier_d'
  }));

  reg(M({
    id: 'rezdiq_colonel', name: 'Полковник Рездик-VII',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [22, 22], role: 'field_rb', behavior: 'boss',
    zones: ['rezdiq_barracks'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Седьмой носитель шлема. Шесть предыдущих — на Памятнике. Седьмой хочет, чтобы вы составили компанию.',
    partySize: 12,
    skillIds: ['drill_charge', 'pack_howl', 'press_slam', 'overclock', 'summon_drones'],
    ai: {
      attackRange: 4, moveSpeed: 3.5, aggroRange: 24, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.25
    },
    visual: {
      color: 0xaa3300, scale: 6.2,
      sprite: { body: '#882200', accent: '#441100', eyes: '#ff6600', boss: true }
    },
    respawnSec: 18 * 3600,
    lootHint: 'rezdiq_seal, rezdiq_shield, scale_mail_breastplate, crystal_d, pressure_amplifier_d'
  }));

  reg(M({
    id: 'green_protocol', name: 'Протокол «Зелёный»',
    title: 'Элитный Хранитель',
    eliteRaid: true,
    level: [22, 22], role: 'raid', behavior: 'boss',
    zones: ['chem_ruins', 'bunker_gate'],
    l2Analog: 'Phase1 elite guardian',
    flavor: 'Защитный протокол, который решил, что жизнь — угроза. Логично. Ужасно. Зелёно.',
    partySize: 18,
    skillIds: ['green_pulse', 'acid_spray', 'protocol_glitch', 'summon_drones', 'directive_rewrite', 'pressure_nova'],
    ai: {
      attackRange: 8, moveSpeed: 2.5, aggroRange: 30, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.2
    },
    visual: {
      color: 0x66ff00, scale: 7.5,
      sprite: { body: '#44cc00', accent: '#226600', eyes: '#ccff66', boss: true }
    },
    respawnSec: 24 * 3600,
    lootHint: 'green_protocol_core, prowler_dagger, pressure_amplifier_d, crystal_d'
  }));

  // ===== ЭШЕЛОН 3: ЭПИЧЕСКИЙ РЕЙД-БОСС ФАЗЫ 1 (22–23 УР.) =====
  reg(M({
    id: 'steel_colossus', name: 'Стальной Колосс Предела',
    title: 'Эпический Рейд-Босс',
    epicRaid: true,
    level: [22, 23], role: 'raid', behavior: 'boss',
    zones: ['steel_limit_fort'],
    l2Analog: 'Raid Boss (fortress)',
    flavor: 'Последний довод Крепости. Когда колокол молчит — говорит он. Громко. Ногами.',
    partySize: 24,
    skillIds: ['colossus_stomp', 'press_slam', 'target_lock', 'summon_drones', 'pressure_nova', 'overclock'],
    ai: {
      attackRange: 7, moveSpeed: 2.0, aggroRange: 32, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.18
    },
    visual: {
      color: 0x8899aa, scale: 8.5,
      sprite: { body: '#778899', accent: '#334455', eyes: '#aaddff', boss: true }
    },
    respawnSec: 36 * 3600,
    lootHint: 'steel_colossus_core, revolution_sword, heavy_doom_hammer, reinforced_bow, scale_mail_breastplate, knowledge_jacket, pressure_amplifier_d, crystal_d'
  }));

  reg(M({
    id: 'branded_boiler', name: 'Брендованный Котёл',
    title: 'Данж-босс',
    level: [30, 33], role: 'field_rb', behavior: 'boss',
    zones: ['steel_cliff'],
    l2Analog: 'dungeon boss',
    flavor: 'Главный котёл Утёса. Песнь Стали здесь — тяжёлый метал (буквально).',
    partySize: 9,
    skillIds: ['steam_jet', 'pressure_nova', 'summon_drones', 'overclock', 'press_slam'],
    ai: {
      attackRange: 5, moveSpeed: 2, aggroRange: 25, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.2
    },
    visual: {
      color: 0xff2200, scale: 6.5,
      sprite: { body: '#aa1100', accent: '#550000', eyes: '#ffff00', boss: true }
    },
    respawnSec: 0
  }));

  reg(M({
    id: 'cruma_core', name: 'Ядро Башни Круны',
    title: 'Данж-босс',
    level: [36, 38], role: 'raid', behavior: 'boss',
    zones: ['cruna_tower'],
    l2Analog: 'Cruma core',
    flavor: 'Сердце башни. Бьётся в герцах, злится в килотоннах.',
    partySize: 18,
    skillIds: ['pressure_nova', 'weld_arc', 'summon_drones', 'colossus_stomp', 'overclock', 'steam_jet'],
    ai: {
      attackRange: 6, moveSpeed: 2, aggroRange: 28, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.25
    },
    visual: {
      color: 0xff6600, scale: 7.0,
      sprite: { body: '#aa4400', accent: '#552200', eyes: '#ffff44', boss: true }
    },
    respawnSec: 0
  }));

  reg(M({
    id: 'directive_overmind', name: 'Коллективный Разум',
    title: 'Рейд-босс',
    level: [40, 40], role: 'raid', behavior: 'boss',
    zones: ['bunker_gate'],
    l2Analog: 'End-game Raid Boss',
    flavor: 'Мы — легион из одного ядра. Ваши билды учтены. Ваши шансы — тоже. Оба числа малы.',
    partySize: 27,
    skillIds: [
      'directive_rewrite', 'green_pulse', 'pressure_nova', 'summon_drones',
      'protocol_glitch', 'colossus_stomp', 'overclock', 'acid_spray'
    ],
    ai: {
      attackRange: 9, moveSpeed: 2.2, aggroRange: 35, aoeAttacks: true,
      summonAdds: true, enrageAtHp: 0.3
    },
    visual: {
      color: 0xff0044, scale: 9.0,
      sprite: { body: '#aa0022', accent: '#550011', eyes: '#ffffff', boss: true }
    },
    respawnSec: 48 * 3600
  }));

  // ─────────────────────────────────────────────
  //  API
  // ─────────────────────────────────────────────
  function get(id) {
    if (!id) return null;
    if (MOBS[id]) return MOBS[id];
    // legacy UPPER_CASE keys from spawn.js
    var low = String(id).toLowerCase();
    if (MOBS[low]) return MOBS[low];
    return null;
  }

  function statsAtLevel(mobId, level) {
    var m = get(mobId);
    // Уровень инстанса = фактический spawn level (НЕ clamp к «дизайн-диапазону» шаблона).
    // Иначе все scrapper выглядят как L1–5 max, а при баге level всегда 1.
    var L = Math.max(1, Math.min(80, level != null ? (level | 0) : 1));
    if (!m) return baseCurve(L);
    var st = tuneMobStats(applyRole(baseCurve(L), m.role, m.uniq), m.role, L);
    // L2 novice: до 5 ур. всегда без агро (даже pack/aggro роли)
    if (L <= 5) st.aggro = 0;
    if (m.respawnSec != null && (m.boss || m.named)) st.respawn = m.respawnSec;
    return st;
  }

  function listByZone(zoneId) {
    var out = [];
    Object.keys(MOBS).forEach(function (id) {
      var m = MOBS[id];
      if (m.zones && m.zones.indexOf(zoneId) >= 0) out.push(m);
    });
    return out.sort(function (a, b) { return a.level[0] - b.level[0]; });
  }

  function listByMode(mode) {
    return Object.keys(MOBS).map(function (id) { return MOBS[id]; }).filter(function (m) {
      return m.mode === mode || (mode === 'raid' && m.role === 'raid');
    });
  }

  function listAll() {
    return Object.keys(MOBS).map(function (id) { return MOBS[id]; })
      .sort(function (a, b) { return a.level[0] - b.level[0] || a.name.localeCompare(b.name); });
  }

  /** Шаблон для spawn.js ZoneEnemy (совместимость) */
  function toSpawnTemplate(mobId) {
    var m = get(mobId);
    if (!m) return null;
    return m;
  }

  /** Ключи UPPER_CASE для старого MOB_DATABASE */
  function buildLegacyDatabase() {
    var db = {};
    Object.keys(MOBS).forEach(function (id) {
      var m = MOBS[id];
      var key = id.toUpperCase();
      db[key] = m;
      db[id] = m; // net-ws ищет по mobId
    });
    return db;
  }

  /** Таблица для CSV / дебага: id, name, lvl, role, zones, mid stats */
  function balanceTable() {
    return listAll().map(function (m) {
      var st = m.statsMid;
      return {
        id: m.id,
        name: m.name,
        level: m.level[0] + '-' + m.level[1],
        role: m.role,
        mode: m.mode,
        zones: m.zones.join('|'),
        hp: st.hp,
        pAtk: st.pAtk,
        pDef: st.pDef,
        cAtk: st.cAtk,
        cDef: st.cDef,
        exp: st.exp,
        party: m.partySize,
        skills: m.skillIds.join(','),
        l2Analog: m.l2Analog || '',
        flavor: m.flavor,
        filler: !!m.filler
      };
    });
  }

  // ─────────────────────────────────────────────
  //  Споты: editor poly + L2-плотность + градиент от деревни
  //  map_world.webp: деревня ≈ (0.48, 0.46)
  // ─────────────────────────────────────────────
  var VILLAGE_UV = [0.48, 0.46];

  function _pipUV(u, v, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var ui = poly[i][0], vi = poly[i][1];
      var uj = poly[j][0], vj = poly[j][1];
      var inter = ((vi > v) !== (vj > v)) &&
        (u < (uj - ui) * (v - vi) / ((vj - vi) || 1e-12) + ui);
      if (inter) inside = !inside;
    }
    return inside;
  }
  function _nbPoly(poly) {
    var u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      if (poly[i][0] < u0) u0 = poly[i][0];
      if (poly[i][1] < v0) v0 = poly[i][1];
      if (poly[i][0] > u1) u1 = poly[i][0];
      if (poly[i][1] > v1) v1 = poly[i][1];
    }
    return [u0, v0, u1, v1];
  }
  function _polyArea(poly) {
    var a = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    }
    return Math.abs(a) * 0.5;
  }
  function _mulberry(a) {
    return function () {
      var t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _distVillage(u, v) {
    var du = u - VILLAGE_UV[0], dv = v - VILLAGE_UV[1];
    return Math.sqrt(du * du + dv * dv);
  }
  /** Сетка локусов внутри poly — равномерное покрытие полигона зоны по классическому канону. */
  function _lociInPoly(poly, targetCount, rnd) {
    var nb = _nbPoly(poly);
    var du = Math.max(1e-6, nb[2] - nb[0]);
    var dv = Math.max(1e-6, nb[3] - nb[1]);
    var area = _polyArea(poly);
    var ha = (area * WORLD_W_M * 3745.313) / 10000;

    var sideU = Math.max(2, Math.round(Math.sqrt(targetCount * (du / dv) * 1.5)));
    var sideV = Math.max(2, Math.round(Math.sqrt(targetCount * (dv / du) * 1.5)));
    var stepU = du / sideU, stepV = dv / sideV;

    // Минимальная дистанция между центрами спотов (40–58 метров)
    var minSepM = ha < 5 ? 38 : ha < 15 ? 48 : 55;
    var minSepUv = minSepM / WORLD_W_M;
    var minSep2 = minSepUv * minSepUv;

    var pts = [];
    function farEnough(u, v, sepSq) {
      for (var k = 0; k < pts.length; k++) {
        var ddu = pts[k][0] - u, ddv = pts[k][1] - v;
        if (ddu * ddu + ddv * ddv < sepSq) return false;
      }
      return true;
    }

    // 1. Стратифицированная сетка с джиттером
    for (var iy = 0; iy < sideV; iy++) {
      for (var ix = 0; ix < sideU; ix++) {
        var u = nb[0] + (ix + 0.2 + rnd() * 0.6) * stepU;
        var v = nb[1] + (iy + 0.2 + rnd() * 0.6) * stepV;
        if (_pipUV(u, v, poly) && farEnough(u, v, minSep2)) {
          pts.push([u, v, _distVillage(u, v)]);
        }
      }
    }

    // 2. Дозаполнение через rejection sampling
    var guard = 0;
    while (pts.length < targetCount && guard < targetCount * 60) {
      guard++;
      var u2 = nb[0] + rnd() * du;
      var v2 = nb[1] + rnd() * dv;
      if (_pipUV(u2, v2, poly) && farEnough(u2, v2, minSep2)) {
        pts.push([u2, v2, _distVillage(u2, v2)]);
      }
    }

    // 3. Мягкое дозаполнение, если форма полигона узкая/сложная
    if (pts.length < targetCount) {
      var relaxSep2 = minSep2 * 0.55;
      guard = 0;
      while (pts.length < targetCount && guard < targetCount * 60) {
        guard++;
        var u3 = nb[0] + rnd() * du;
        var v3 = nb[1] + rnd() * dv;
        if (_pipUV(u3, v3, poly) && farEnough(u3, v3, relaxSep2)) {
          pts.push([u3, v3, _distVillage(u3, v3)]);
        }
      }
    }

    if (!pts.length) {
      var su = 0, sv = 0;
      for (var i = 0; i < poly.length; i++) { su += poly[i][0]; sv += poly[i][1]; }
      pts.push([su / poly.length, sv / poly.length, _distVillage(su / poly.length, sv / poly.length)]);
    }

    // Сортировка от деревни/входа вглубь зоны (градиент уровней)
    pts.sort(function (a, b) { return a[2] - b[2]; });
    return pts;
  }

  /**
   * Уровень локуса: равномерно покрывает весь диапазон зоны [lo..hi].
   * Ближе к деревне — ниже, дальше — выше (L2: рост сложности от хаба).
   */
  function _lvlAtLocus(lo, hi, dist, dMin, dMax, locusIndex, lociCount) {
    if (hi <= lo) return [lo, lo];
    var tIdx = lociCount <= 1 ? 0.5 : (locusIndex / (lociCount - 1));
    var t = tIdx;
    if (dMax > dMin + 1e-6) {
      var tDist = (dist - dMin) / (dMax - dMin);
      tDist = Math.max(0, Math.min(1, tDist));
      t = tDist * 0.4 + tIdx * 0.6;
    }
    var target = Math.round(lo + t * (hi - lo));
    if (target < lo) target = lo;
    if (target > hi) target = hi;
    var a = Math.max(lo, target - (hi > lo + 2 ? 1 : 0));
    var b = Math.min(hi, target + (hi > lo + 2 ? 1 : 0));
    if (b < a) b = a;
    return [a, b];
  }

  // = world-metrics W. Не require — цикл с world-metrics.js.
  var WORLD_W_M = 3730.785;

  /** Радиус спота в UV по классическому стандарту (просторный радиус спавна/патрулирования 28–48 м). */
  function _spotRadiusUv(n, boss, pack) {
    var meters = 34; // базовый радиус обычного спота (34 м)
    if (boss) meters = 26; // арена/логово босса (26 м)
    else if (pack || (n | 0) >= 6) meters = 50; // крупные паки 6+ мобов (50 м)
    else if ((n | 0) >= 4) meters = 44; // пачки из 4-5 мобов (44 м)
    else if ((n | 0) >= 3) meters = 38; // пачки из 3 мобов (38 м)
    else if ((n | 0) <= 1) meters = 28; // одиночный моб (28 м)
    else meters = 34; // 2 моба (34 м)
    return +(meters / WORLD_W_M).toFixed(4);
  }

  /**
   * Большие полигоны, где кап 14 локусов даёт дыры (аудит A).
   * Пасека / Междуречье / Сады / Астард сюда не входят.
   */
  function _isSparseHuntHole(name) {
    var n = String(name || '').toLowerCase();
    if (/пасек|междуреч|сад|астард|холм|свалк|западн|двор|заводь|забвен|барак|котлов|оператор/.test(n)) {
      return false;
    }
    return /школ/.test(n) || /хим|руин/.test(n) || /памятник|павш/.test(n) || /крепост|предел/.test(n);
  }

  /**
   * Набор мобов по имени зоны (map_world + редактор).
   * n = мобов на ОДИН локус (L2: ordinary 3–5, pack 5–8, boss 1).
   */
  function kitForEditorZone(name, lo, hi) {
    var n = String(name || '').toLowerCase();
    function P(list) {
      return list.map(function (e) {
        if (!MOBS[e.mob]) return null;
        // L2 densified: ordinary 3–5, pack 5–8, boss 1
        var nn = e.n != null ? e.n : (e.pack ? 5 : 3);
        if (e.boss) nn = 1;
        else if (e.pack) nn = Math.min(8, Math.max(4, nn));
        else nn = Math.min(6, Math.max(3, nn));
        return {
          mob: e.mob,
          n: nn,
          weight: e.weight != null ? e.weight : 1,
          passive: !!e.passive,
          boss: !!e.boss,
          pack: !!e.pack
        };
      }).filter(Boolean);
    }

    if (/оператор/.test(n)) {
      return P([
        { mob: 'scrapper', n: 4, weight: 3, passive: true },
        { mob: 'loose_bolt', n: 4, weight: 2, passive: true },
        { mob: 'tutorial_target', n: 3, weight: 2, passive: true },
        { mob: 'rust_mite', n: 4, weight: 2, passive: true },
        // easter mini-raid (4–6)
        { mob: 'toaster_overlord', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/инженер|школ/.test(n)) {
      return P([
        { mob: 'scrapper', n: 4, weight: 2, passive: true },
        { mob: 'spark_sprite', n: 4, weight: 3, passive: true },
        { mob: 'rust_mite', n: 4, weight: 2, passive: true },
        { mob: 'loose_bolt', n: 4, weight: 2, passive: true }
      ]);
    }
    if (/астард|холм/.test(n)) {
      return P([
        { mob: 'steam_hound', n: 5, weight: 3, pack: true },
        { mob: 'meadow_mower', n: 4, weight: 2 },
        { mob: 'survey_beacon', n: 3, weight: 2 },
        { mob: 'hill_presser', n: 3, weight: 2 },
        { mob: 'scrapper', n: 4, weight: 1 },
        // easter mini-raid (8–10)
        { mob: 'coffee_berserker', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/междуреч/.test(n)) {
      return P([
        { mob: 'rivulet_pump', n: 4, weight: 3 },
        { mob: 'bridge_toll_bot', n: 4, weight: 3 },
        { mob: 'steam_hound', n: 5, weight: 2, pack: true }
      ]);
    }
    if (/свалк/.test(n)) {
      return P([
        { mob: 'junk_magpie', n: 4, weight: 3 },
        { mob: 'scrap_picker', n: 4, weight: 3 },
        { mob: 'steam_hound', n: 5, weight: 2, pack: true },
        { mob: 'welding_drone', n: 4, weight: 2 }
      ]);
    }
    if (/западн/.test(n)) {
      return P([
        { mob: 'welding_automaton', n: 4, weight: 3 },
        { mob: 'rust_sentry', n: 4, weight: 3 },
        { mob: 'welding_drone', n: 4, weight: 2 },
        { mob: 'steam_hound', n: 5, weight: 2, pack: true },
        // easter mini-raid (11–13)
        { mob: 'wifi_router_404', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/сад|зетрян|затерян/.test(n)) {
      return P([
        { mob: 'garden_sprinkler', n: 4, weight: 3 },
        { mob: 'vine_cable', n: 4, weight: 3 },
        { mob: 'meadow_mower', n: 3, weight: 2 }
      ]);
    }
    if (/пасек/.test(n)) {
      return P([
        { mob: 'apiary_drone_bee', n: 7, weight: 3, pack: true },
        { mob: 'apiary_drone_bee', n: 6, weight: 2, pack: true }
      ]);
    }
    if (/двор|крун/.test(n) && !/башн/.test(n)) {
      return P([
        { mob: 'forge_apprentice', n: 4, weight: 3 },
        { mob: 'yard_cranelet', n: 4, weight: 3 },
        { mob: 'welding_automaton', n: 4, weight: 3 },
        { mob: 'welding_drone', n: 3, weight: 2 },
        // easter mini-raid (13–15)
        { mob: 'printer_of_doom', n: 1, weight: 0, boss: true },
        { mob: 'cruna_overseer', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/тихая|заводь/.test(n)) {
      return P([
        { mob: 'steam_crane_spider', n: 4, weight: 3 },
        { mob: 'dry_dock_welder', n: 4, weight: 3 },
        { mob: 'repair_drone', n: 4, weight: 2 },
        { mob: 'welding_drone', n: 3, weight: 2 },
        { mob: 'rustclaw_overseer', n: 1, weight: 0, boss: true },
        { mob: 'sparkweld_elite', n: 1, weight: 0, boss: true }
      ]);
    }

    if (/забвен/.test(n)) {
      return P([
        { mob: 'oblivion_walker', n: 5, weight: 4, pack: true },
        { mob: 'memory_scrubber', n: 4, weight: 3 },
        { mob: 'field_howitzer', n: 3, weight: 2 },
        { mob: 'welding_automaton', n: 4, weight: 2 }
      ]);
    }
    if (/памятник|павш/.test(n)) {
      return P([
        { mob: 'oblivion_walker', n: 5, weight: 3, pack: true },
        { mob: 'memory_scrubber', n: 4, weight: 3 },
        { mob: 'range_spotter', n: 3, weight: 2 },
        { mob: 'field_howitzer', n: 3, weight: 2 }
      ]);
    }
    if (/восток|полигон|восточн/.test(n)) {
      if (hi <= 12) {
        return P([
          { mob: 'steam_hound', n: 5, weight: 3, pack: true },
          { mob: 'survey_beacon', n: 3, weight: 2 },
          { mob: 'welding_drone', n: 3, weight: 2 },
          { mob: 'meadow_mower', n: 4, weight: 2 },
          { mob: 'hill_presser', n: 3, weight: 2 }
        ]);
      }
      return P([
        { mob: 'rogue_target', n: 4, weight: 3 },
        { mob: 'range_spotter', n: 4, weight: 3 },
        { mob: 'field_howitzer', n: 3, weight: 2 },
        // easter mini-raid (16–18)
        { mob: 'bluetooth_oracle', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/хим|руин/.test(n)) {
      return P([
        { mob: 'acid_sprayer', n: 4, weight: 3 },
        { mob: 'green_fault_drone', n: 5, weight: 3, pack: true },
        { mob: 'spill_containment', n: 2, weight: 1 },
        { mob: 'green_steam_wraith', n: 4, weight: 2 },
        { mob: 'welding_drone', n: 3, weight: 2 }
      ]);
    }
    if (/котлов|завои/.test(n)) {
      return P([
        { mob: 'boiler_elemental', n: 4, weight: 3 },
        { mob: 'pressure_fiend', n: 4, weight: 3 },
        { mob: 'boiler_overpress', n: 2, weight: 1 }, // party_elite
        { mob: 'green_steam_wraith', n: 4, weight: 2 },
        { mob: 'steam_crane_spider', n: 3, weight: 2 },
        { mob: 'acid_sprayer', n: 3, weight: 2 }
      ]);
    }
    if (/крепост|предел/.test(n)) {
      return P([
        { mob: 'limit_guard', n: 5, weight: 4 },
        { mob: 'fort_turret', n: 3, weight: 3 },
        { mob: 'fort_enforcer', n: 2, weight: 2 }, // party_elite
        { mob: 'rezdiq_private', n: 4, weight: 2 },
        { mob: 'steel_colossus', n: 1, weight: 0, boss: true }
      ]);
    }
    if (/барак|резд|рездик/.test(n)) {
      return P([
        { mob: 'rezdiq_private', n: 6, weight: 4, pack: true },
        { mob: 'drill_sergeant', n: 3, weight: 2 },
        { mob: 'welding_automaton', n: 3, weight: 2 },
        { mob: 'logic_corruptor', n: 1, weight: 0, boss: true },
        { mob: 'rezdiq_colonel', n: 1, weight: 0, boss: true }
      ]);
    }
    if (hi <= 5) {
      return P([
        { mob: 'scrapper', n: 4, weight: 2, passive: true },
        { mob: 'rust_mite', n: 4, weight: 2, passive: true }
      ]);
    }
    if (hi <= 12) {
      return P([
        { mob: 'steam_hound', n: 5, weight: 2, pack: true },
        { mob: 'welding_drone', n: 3, weight: 2 },
        { mob: 'welding_automaton', n: 4, weight: 2 }
      ]);
    }
    return P([
      { mob: 'welding_automaton', n: 4, weight: 2 },
      { mob: 'steam_crane_spider', n: 3, weight: 2 },
      { mob: 'oblivion_walker', n: 4, weight: 2 }
    ]);
  }

  function _pickWeighted(kit, rnd) {
    var pool = kit.filter(function (e) { return !e.boss && e.weight > 0; });
    if (!pool.length) pool = kit.filter(function (e) { return !e.boss; });
    if (!pool.length) return kit[0];
    var sum = 0;
    for (var i = 0; i < pool.length; i++) sum += pool[i].weight;
    var r = rnd() * sum;
    for (var j = 0; j < pool.length; j++) {
      r -= pool[j].weight;
      if (r <= 0) return pool[j];
    }
    return pool[pool.length - 1];
  }

  /**
   * @param {Array} editorZones — huntZones из editor-overrides
   * @returns {Array} MOB_SPOTS
   */
  function buildSpotsFromEditorZones(editorZones) {
    var spots = [];
    if (!editorZones || !editorZones.length) return spots;

    editorZones.forEach(function (z, zi) {
      if (!z || z._deleted) return;
      // синие territory (Деревня, Порт…) — без мобов
      if (z.kind === 'territory' || z.peace === true) return;

      var poly = z.poly;
      if (!poly || poly.length < 3) {
        if (!z.nb || z.nb.length < 4) return;
        poly = [
          [z.nb[0], z.nb[1]], [z.nb[2], z.nb[1]],
          [z.nb[2], z.nb[3]], [z.nb[0], z.nb[3]]
        ];
      }
      var lo = (z.lvl && z.lvl[0] != null) ? +z.lvl[0] : 1;
      var hi = (z.lvl && z.lvl[1] != null) ? +z.lvl[1] : lo;
      if (hi < lo) { var tmp = lo; lo = hi; hi = tmp; }
      lo = Math.max(1, lo | 0);
      hi = Math.max(lo, hi | 0);

      var kit = kitForEditorZone(z.name, lo, hi);
      if (!kit.length) return;

      var rnd = _mulberry(12000 + zi * 97);
      var area = _polyArea(poly);
      var ha = (area * WORLD_W_M * 3745.313) / 10000;
      var band = hi - lo + 1;

      // Target density: равномерное покрытие поля (~0.95 спотов на гектар)
      var targetSpots = Math.round(ha * 0.95);
      if (ha < 5) targetSpots = Math.max(6, Math.round(ha * 2.2));
      else if (ha < 12) targetSpots = Math.max(9, Math.round(ha * 1.2));
      else targetSpots = Math.min(38, Math.max(14, targetSpots));
      targetSpots = Math.max(band + 2, targetSpots);

      var loci = _lociInPoly(poly, targetSpots, rnd);
      var dMin = loci[0][2], dMax = loci[loci.length - 1][2];

      function pushSpot(pt, entry, lvlPair) {
        var n = entry.pack ? Math.max(entry.n, 2) : entry.n;
        if (entry.boss) n = 1;
        spots.push({
          region: z.id,
          huntZoneId: z.id,
          zone: z.name,
          np: [+pt[0].toFixed(5), +pt[1].toFixed(5)],
          r: _spotRadiusUv(n, false, entry.pack),
          n: n,
          mob: entry.mob,
          lvl: lvlPair,
          zoneLvl: [lo, hi],
          // C1: пассив — тип (kit) или учебная зона max≤5
          passive: !!entry.passive || hi <= 5,
          boss: false
        });
      }

      var bosses = kit.filter(function (e) {
        return e.boss && !PHASE1_RAID[e.mob];
      });
      var regularLociCount = Math.max(1, loci.length - bosses.length);

      // Равномерный проход: каждый локус — это отдельный, независимый спот
      for (var li = 0; li < regularLociCount; li++) {
        var pt = loci[li];
        var entry = _pickWeighted(kit, rnd);
        var lvlPair = _lvlAtLocus(lo, hi, pt[2], dMin, dMax, li, regularLociCount);
        pushSpot(pt, entry, lvlPair);
      }

      // Мини-рейд/босс зоны: каждый босс получает свой собственный отдельный локус (глубь локации)
      for (var bi = 0; bi < bosses.length; bi++) {
        var locusIdx = loci.length - 1 - bi;
        if (locusIdx < 0) locusIdx = 0;
        var far = loci[locusIdx];
        var bMob = get(bosses[bi].mob);
        var bLvl = hi;
        if (bMob && bMob.level && bMob.level.length >= 2) {
          var mLo = bMob.level[0] | 0, mHi = bMob.level[1] | 0;
          if (mLo > hi) {
            // Эпический полевой босс (Колосс 30-35, Рездик 24-28, Надзиратель 22-26, Логика 22-26)
            bLvl = mLo;
          } else {
            bLvl = Math.min(hi, Math.max(lo, mHi));
            if (bLvl < mLo) bLvl = Math.min(hi, mLo);
            if (bLvl > mHi) bLvl = mHi;
          }
        }
        spots.push({
          region: z.id,
          huntZoneId: z.id,
          zone: z.name,
          np: [+far[0].toFixed(5), +far[1].toFixed(5)],
          r: _spotRadiusUv(1, true, false),
          n: 1,
          mob: bosses[bi].mob,
          lvl: [bLvl, bLvl],
          zoneLvl: [lo, hi],
          passive: false,
          boss: true
        });
      }
    });
    return spots;
  }

  /** Phase 1 raids: один спот, не kit-проход по всем зонам. */
  var PHASE1_RAID = {
    scrap_tyrant: 1, drill_worm: 1, press_hammer: 1, boiler_sovereign: 1, green_protocol: 1
  };
  var RAID_SPOTS = [
    { np: [0.301, 0.627], mob: 'scrap_tyrant',
      huntZoneId: 'hunt_1785323796215_20', zone: 'Свалка' },
    { np: [0.293, 0.248], mob: 'drill_worm',
      huntZoneId: 'hunt_1785323927054_21', zone: 'Поле забвения' },
    { np: [0.238, 0.792], mob: 'press_hammer',
      huntZoneId: 'hunt_1785323315911_17', zone: 'Тихая заводь' },
    { np: [0.876, 0.320], mob: 'boiler_sovereign',
      huntZoneId: 'hunt_1785322733079_8', zone: 'Котловые земли' },
    { np: [0.852, 0.645], mob: 'green_protocol',
      huntZoneId: 'hunt_1785322994399_12', zone: 'Руины химзавода' }
  ];

  function getRaidSpots() {
    return RAID_SPOTS.map(function (s) {
      var tpl = MOBS[s.mob];
      var lvl = (tpl && tpl.level) ? tpl.level.slice() : [20, 20];
      return {
        region: s.huntZoneId,
        huntZoneId: s.huntZoneId,
        zone: s.zone,
        np: s.np.slice(),
        r: _spotRadiusUv(1, true, false),
        n: 1,
        mob: s.mob,
        lvl: lvl,
        zoneLvl: lvl,
        passive: false,
        boss: true,
        raid: true
      };
    }).filter(function (s) { return !!MOBS[s.mob]; });
  }

  /**
   * Скрытые Italian brainrot-боссы: фиксированные UV на краях/мысах.
   * Не в kit — игрок должен наткнуться / исследовать.
   */
  var SECRET_SPOTS = [
    // южный край Школы инженерии (тихий уступ, не центр)
    { np: [0.342, 0.808], r: 0.0075, n: 1, mob: 'tralalero_toasterino', lvl: [7, 7],
      boss: true, secret: true, zone: '※ Secret · School ledge', region: 'secret_tralalero' },
    // паро-унитаз: берег Междуречья (не на дороге)
    { np: [0.575, 0.742], r: 0.0075, n: 1, mob: 'skibidi_steamino', lvl: [9, 9],
      boss: true, secret: true, zone: '※ Secret · River bend', region: 'secret_skibidi' },
    // западный мыс Западных земель
    { np: [0.068, 0.662], r: 0.0075, n: 1, mob: 'bombardiro_blendodilo', lvl: [11, 11],
      boss: true, secret: true, zone: '※ Secret · West cape', region: 'secret_bombardiro' },
    // дальний SW угол Тихой заводи
    { np: [0.198, 0.848], r: 0.0075, n: 1, mob: 'tung_tung_vacuumer', lvl: [14, 14],
      boss: true, secret: true, zone: '※ Secret · Backwater tip', region: 'secret_tung' },
    // восток химруин у «озера» (край полигона)
    { np: [0.892, 0.490], r: 0.0075, n: 1, mob: 'ballerina_cappuccino', lvl: [17, 17],
      boss: true, secret: true, zone: '※ Secret · Chem shore', region: 'secret_ballerina' }
  ];

  function getSecretSpots() {
    return SECRET_SPOTS.map(function (s) {
      return {
        region: s.region,
        huntZoneId: s.region,
        zone: s.zone,
        np: s.np.slice(),
        r: s.r,
        n: s.n || 1,
        mob: s.mob,
        lvl: s.lvl.slice(),
        zoneLvl: s.lvl.slice(),
        passive: false,
        boss: true,
        secret: true
      };
    }).filter(function (s) { return !!MOBS[s.mob]; });
  }

  // ─────────────────────────────────────────────
  //  L2 nameplates: rank + canvas paint
  //  normal · X (champion/elite) · named · field boss · raid
  // ─────────────────────────────────────────────
  var RANKS = {
    normal: {
      id: 'normal', label: '', color: '#f3efe4', lvColor: '#d4cbb8',
      banner: null, showDist: 38, glow: null
    },
    x: {
      id: 'x', label: 'X', color: '#ffcc33', lvColor: '#ffe08a',
      banner: 'x', showDist: 58, glow: '#ffaa22'
    },
    named: {
      id: 'named', label: 'ИМЕННОЙ', color: '#ffb040', lvColor: '#ffd080',
      banner: 'named', showDist: 64, glow: '#ffb040'
    },
    boss: {
      id: 'boss', label: 'БОСС', color: '#ff6a3a', lvColor: '#ffd070',
      banner: 'boss', showDist: 94, glow: '#ff5522'
    },
    raid: {
      id: 'raid', label: 'РЕЙД', color: '#e878ff', lvColor: '#ffd070',
      banner: 'raid', showDist: 112, glow: '#c060ff'
    }
  };

  /**
   * Определить ранг неймплейта (рейд > босс > именной > X > обычный).
   * @param {string|object|null} mobOrId
   * @param {object} [flags] — { role, boss, named, champion, raid, x }
   */
  function rankOf(mobOrId, flags) {
    flags = flags || {};
    var m = null;
    if (typeof mobOrId === 'string') m = get(mobOrId);
    else if (mobOrId && typeof mobOrId === 'object') m = mobOrId;
    var role = flags.role || (m && m.role) || '';
    if (flags.raid || role === 'raid') return RANKS.raid;
    if (flags.boss || role === 'field_rb' || (m && m.boss && role !== 'raid')) return RANKS.boss;
    if (flags.named || role === 'named' || (m && (m.named || m.behavior === 'named'))) return RANKS.named;
    if (flags.champion || flags.x || role === 'elite' || role === 'party_elite') return RANKS.x;
    return RANKS.normal;
  }

  function nameplateScale(rank) {
    var id = rank && rank.id;
    if (id === 'raid') return { x: 9.4, y: 2.05 };
    if (id === 'boss') return { x: 8.8, y: 1.9 };
    if (id === 'named') return { x: 7.8, y: 1.64 };
    if (id === 'x') return { x: 7.6, y: 1.6 };
    return { x: 7.0, y: 1.32 };
  }

  /**
   * Слабый скейл от камеры: читаемо вдали, без билбордов на орбите L2.
   */
  function nameplateCamScale(rank, camDist) {
    var base = nameplateScale(rank);
    var d = +camDist;
    if (!(d > 0)) d = 24;
    var k = d / 26;
    if (k < 0.92) k = 0.92;
    if (k > 1.45) k = 1.45;
    return { x: base.x * k, y: base.y * k };
  }

  function _npRoundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w * 0.5, h * 0.5);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, rr);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  function _npStrokeText(ctx, text, x, y) {
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
  }

  /** Красный X в золотом ромбе — champion / иксовый. */
  function _drawRankX(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    var g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#3a0808');
    g.addColorStop(0.45, '#8a1414');
    g.addColorStop(1, '#3a0808');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#ffd060';
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.fillRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
    ctx.strokeRect(-s * 0.62, -s * 0.62, s * 1.24, s * 1.24);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = '#1a0000';
    ctx.fillStyle = '#ffe566';
    ctx.lineWidth = Math.max(2, s * 0.16);
    ctx.lineCap = 'round';
    var a = s * 0.42;
    ctx.beginPath();
    ctx.moveTo(cx - a, cy - a);
    ctx.lineTo(cx + a, cy + a);
    ctx.moveTo(cx + a, cy - a);
    ctx.lineTo(cx - a, cy + a);
    ctx.stroke();
    ctx.lineWidth = Math.max(1.4, s * 0.1);
    ctx.strokeStyle = '#ff3322';
    ctx.stroke();
    ctx.restore();
  }

  /** Рогатый череп — полевой босс. */
  function _drawRankSkull(ctx, cx, cy, s, col) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = col || '#ffd070';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = Math.max(1.4, s * 0.08);
    // horns
    ctx.beginPath();
    ctx.moveTo(-s * 0.42, -s * 0.15);
    ctx.quadraticCurveTo(-s * 0.78, -s * 0.72, -s * 0.28, -s * 0.52);
    ctx.quadraticCurveTo(-s * 0.38, -s * 0.28, -s * 0.22, -s * 0.18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.42, -s * 0.15);
    ctx.quadraticCurveTo(s * 0.78, -s * 0.72, s * 0.28, -s * 0.52);
    ctx.quadraticCurveTo(s * 0.38, -s * 0.28, s * 0.22, -s * 0.18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // cranium
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.04, s * 0.46, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // jaw
    ctx.beginPath();
    ctx.ellipse(0, s * 0.22, s * 0.28, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0808';
    ctx.beginPath();
    ctx.ellipse(-s * 0.16, -s * 0.06, s * 0.1, s * 0.13, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.16, -s * 0.06, s * 0.1, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-s * 0.16, s * 0.22, s * 0.06, s * 0.12);
    ctx.fillRect(-s * 0.03, s * 0.22, s * 0.06, s * 0.12);
    ctx.fillRect(s * 0.1, s * 0.22, s * 0.06, s * 0.12);
    ctx.restore();
  }

  /** Шлем с короной — рейд. */
  function _drawRankRaid(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#e8c060';
    ctx.strokeStyle = 'rgba(20,0,30,0.9)';
    ctx.lineWidth = Math.max(1.4, s * 0.08);
    // crown spikes
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.08);
    ctx.lineTo(-s * 0.38, -s * 0.62);
    ctx.lineTo(-s * 0.18, -s * 0.18);
    ctx.lineTo(0, -s * 0.78);
    ctx.lineTo(s * 0.18, -s * 0.18);
    ctx.lineTo(s * 0.38, -s * 0.62);
    ctx.lineTo(s * 0.5, -s * 0.08);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // helm
    var hg = ctx.createLinearGradient(-s, 0, s, s);
    hg.addColorStop(0, '#6a2088');
    hg.addColorStop(0.5, '#c060ff');
    hg.addColorStop(1, '#4a1060');
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.ellipse(0, s * 0.12, s * 0.48, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a0418';
    ctx.beginPath();
    ctx.ellipse(-s * 0.16, s * 0.08, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
    ctx.ellipse(s * 0.16, s * 0.08, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function _drawRankStar(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#ffd060';
    ctx.strokeStyle = 'rgba(40,20,0,0.85)';
    ctx.lineWidth = Math.max(1.3, s * 0.08);
    ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 4;
      var r = (i % 2 === 0) ? s * 0.72 : s * 0.3;
      var px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function _drawRankIcon(ctx, rank, cx, cy, s) {
    if (!rank || rank.id === 'normal') return;
    if (rank.id === 'x') _drawRankX(ctx, cx, cy, s);
    else if (rank.id === 'raid') _drawRankRaid(ctx, cx, cy, s);
    else if (rank.id === 'boss') _drawRankSkull(ctx, cx, cy, s, '#ffd070');
    else if (rank.id === 'named') _drawRankStar(ctx, cx, cy, s);
  }

  function _drawNameBanner(ctx, rank, x, y, w, h) {
    var pal = {
      x:     { a: 'rgba(42, 22, 4, 0.70)', b: 'rgba(18, 10, 2, 0.78)', stroke: '#d4a020', inner: 'rgba(255, 210, 80, 0.35)' },
      named: { a: 'rgba(40, 24, 6, 0.68)', b: 'rgba(16, 10, 2, 0.76)', stroke: '#c88828', inner: 'rgba(255, 190, 80, 0.32)' },
      boss:  { a: 'rgba(48, 10, 6, 0.78)', b: 'rgba(16, 4, 2, 0.84)', stroke: '#e0a040', inner: 'rgba(255, 140, 60, 0.40)' },
      raid:  { a: 'rgba(36, 8, 42, 0.80)', b: 'rgba(12, 2, 18, 0.86)', stroke: '#d080ff', inner: 'rgba(220, 130, 255, 0.42)' }
    };
    var p = pal[rank.id];
    if (!p) return;
    var g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, p.a);
    g.addColorStop(0.5, p.b);
    g.addColorStop(1, p.a);
    ctx.fillStyle = g;
    _npRoundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = rank.id === 'raid' || rank.id === 'boss' ? 2.4 : 1.7;
    ctx.stroke();
    ctx.strokeStyle = p.inner;
    ctx.lineWidth = 1;
    _npRoundRect(ctx, x + 4, y + 4, w - 8, h - 8, 7);
    ctx.stroke();
    // corner ticks
    ctx.strokeStyle = p.stroke;
    ctx.lineWidth = 1.6;
    var t = 10;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 8 + t); ctx.lineTo(x + 8, y + 8); ctx.lineTo(x + 8 + t, y + 8);
    ctx.moveTo(x + w - 8, y + 8 + t); ctx.lineTo(x + w - 8, y + 8); ctx.lineTo(x + w - 8 - t, y + 8);
    ctx.moveTo(x + 8, y + h - 8 - t); ctx.lineTo(x + 8, y + h - 8); ctx.lineTo(x + 8 + t, y + h - 8);
    ctx.moveTo(x + w - 8, y + h - 8 - t); ctx.lineTo(x + w - 8, y + h - 8); ctx.lineTo(x + w - 8 - t, y + h - 8);
    ctx.stroke();
  }

  /**
   * Нарисовать L2-неймплейт моба: иконка ранга + имя + Lv.
   * @returns {{ w:number, h:number, rank:object }}
   */
  function paintMobNameplate(canvas, opts) {
    opts = opts || {};
    var rank = opts.rank || rankOf(opts.mobId || opts.template, opts);
    var name = String(opts.name || '?').slice(0, 28);
    var lv = Math.max(1, (opts.level | 0) || 1);
    var special = rank.id !== 'normal';
    var w = special ? 800 : 640;
    var h = special ? 168 : 120;
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (special) _drawNameBanner(ctx, rank, 16, 10, w - 32, h - 18);

    var lvStr = 'Ур.' + lv;
    var nameFont = special
      ? 'bold 40px "Segoe UI", "Trebuchet MS", Arial, sans-serif'
      : 'bold 38px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    var lvFont = 'bold 34px "Segoe UI", "Trebuchet MS", Arial, sans-serif';
    var badgeFont = 'bold 16px "Segoe UI", "Trebuchet MS", Arial, sans-serif';

    var lvY = special ? h * 0.42 : h * 0.32;
    var nameY = special ? h * 0.70 : h * 0.68;
    if (special && rank.label) {
      ctx.font = badgeFont;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.fillStyle = rank.lvColor;
      _npStrokeText(ctx, rank.label, w / 2, h * 0.22);
    }

    ctx.font = lvFont;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.94)';
    ctx.fillStyle = rank.lvColor;
    _npStrokeText(ctx, lvStr, w / 2, lvY);

    var iconS = special ? 26 : 0;
    if (special) _drawRankIcon(ctx, rank, w / 2 - 150, nameY, iconS);

    ctx.font = nameFont;
    ctx.lineWidth = special ? 7 : 6;
    ctx.fillStyle = rank.color;
    _npStrokeText(ctx, name, w / 2, nameY);

    return { w: w, h: h, rank: rank };
  }

  var api = {
    ROLE: ROLE,
    RANKS: RANKS,
    HUNTING_ZONES: HUNTING_ZONES,
    SKILL_CATALOG: SKILL_CATALOG,
    MOBS: MOBS,
    SECRET_SPOTS: SECRET_SPOTS,
    baseCurve: baseCurve,
    applyRole: applyRole,
    tuneOutdoorTrash: tuneOutdoorTrash,
    tuneIntroRaid: tuneIntroRaid,
    tuneHighRaid: tuneHighRaid,
    tuneFieldRb: tuneFieldRb,
    tuneMobStats: tuneMobStats,
    get: get,
    rankOf: rankOf,
    nameplateScale: nameplateScale,
    paintMobNameplate: paintMobNameplate,
    nameplateCamScale: nameplateCamScale,
    statsAtLevel: statsAtLevel,
    listByZone: listByZone,
    listByMode: listByMode,
    listAll: listAll,
    toSpawnTemplate: toSpawnTemplate,
    buildLegacyDatabase: buildLegacyDatabase,
    balanceTable: balanceTable,
    kitForEditorZone: kitForEditorZone,
    buildSpotsFromEditorZones: buildSpotsFromEditorZones,
    getSecretSpots: getSecretSpots,
    getRaidSpots: getRaidSpots
  };

  // Browser: mirror as MOB_DATABASE for net-ws / spawn
  if (typeof root !== 'undefined') {
    try {
      root.MOB_DATABASE = buildLegacyDatabase();
    } catch (e) { /* ignore */ }
  }

  return api;
});
