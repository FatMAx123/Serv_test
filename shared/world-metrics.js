// ============================================================
//  SHARED / WORLD-METRICS.JS  —  ЕДИНЫЙ источник геометрии мира.
//  UMD: браузер (window.WorldMetrics) + Node (require).
//  Координаты нормализованы (u,v в [0,1]):
//    u = запад(0)->восток(1) по X ;  v = север(0)->юг(1) по Z.
//  build*() -> абсолютные мировые координаты (метры, 1 юнит = 1 м).
//  РАЗМЕР МИРА = канон FBX-острова (TerrainData), не «абстрактные» 4300×4480.
//  u,v ∈ [0,1] поверх bounds; SEA = уровень воды террейна (−35).
//  applyBounds() — клиент синхронизирует с TerrainData при build.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.WorldMetrics = api; root.WM = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ---- КАНОН = TerrainData (terrain1.fbx / convert_terrain1_to_data.py) ----
  // minX/maxX/minZ/maxZ из client/js/terrain-data.js
  var MIN_X = -1892.6082763671875;
  var MAX_X = 1838.1767578125;
  var MIN_Z = -1918.204345703125;
  var MAX_Z = 1827.108642578125;
  var W = MAX_X - MIN_X;   // ≈ 3730.785
  var H = MAX_Z - MIN_Z;   // ≈ 3745.313
  var SEA = -35.0;         // = Terrain.seaLevel (не 3.5)
  var _cachedRegions = null;

  function applyBounds(b) {
    if (!b) return;
    if (typeof b.minX === 'number') MIN_X = b.minX;
    if (typeof b.maxX === 'number') MAX_X = b.maxX;
    if (typeof b.minZ === 'number') MIN_Z = b.minZ;
    if (typeof b.maxZ === 'number') MAX_Z = b.maxZ;
    if (typeof b.sea === 'number') SEA = b.sea;
    if (typeof b.seaLevel === 'number') SEA = b.seaLevel;
    W = MAX_X - MIN_X;
    H = MAX_Z - MIN_Z;
    _cachedRegions = null;
    return { MIN_X: MIN_X, MAX_X: MAX_X, MIN_Z: MIN_Z, MAX_Z: MAX_Z, W: W, H: H, SEA: SEA };
  }

  function wx(u) { return MIN_X + u * W; }
  function wz(v) { return MIN_Z + v * H; }
  function bounds4(b) { return [wx(b[0]), wz(b[1]), wx(b[2]), wz(b[3])]; }
  function pos2(p) { return { x: wx(p[0]), z: wz(p[1]) }; }

  // ============================================================
  //  МАСКА ОСТРОВА (силуэт Talking Island). u,v в [0,1].
  // ============================================================
  function blob(u, v, cu, cv, rx, ry, k) {
    var dx = (u - cu) / rx, dy = (v - cv) / ry;
    return Math.exp(-(dx * dx + dy * dy) * k);
  }
  function hash2(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    var ux = xf * xf * (3 - 2 * xf), vy = yf * yf * (3 - 2 * yf);
    return (a * (1 - ux) + b * ux) * (1 - vy) + (c * (1 - ux) + d * ux) * vy;
  }
  function islandMask(u, v) {
    var m = 0;
    m += blob(u, v, 0.50, 0.47, 0.35, 0.34, 1.25);   // основная масса
    m += blob(u, v, 0.50, 0.30, 0.30, 0.18, 1.6);    // северная шапка
    m += blob(u, v, 0.50, 0.66, 0.30, 0.20, 1.6);    // южная масса
    // мысы по силуэту карты
    m += blob(u, v, 0.12, 0.07, 0.09, 0.07, 2.6);    // Cliff of the Dream (NW)
    m += blob(u, v, 0.40, 0.05, 0.16, 0.05, 3.0);    // северные скалы
    m += blob(u, v, 0.70, 0.07, 0.14, 0.06, 2.8);    // Gray Rock (NE)
    m += blob(u, v, 0.87, 0.15, 0.11, 0.10, 2.6);    // Orc Barracks (NE)
    m += blob(u, v, 0.06, 0.30, 0.06, 0.10, 3.0);    // Cruma Tower (W)
    m += blob(u, v, 0.07, 0.55, 0.07, 0.13, 3.0);    // W выступ
    m += blob(u, v, 0.93, 0.45, 0.07, 0.16, 3.0);    // Elven Ruins (E)
    m += blob(u, v, 0.13, 0.83, 0.11, 0.10, 2.8);    // SW мыс
    m += blob(u, v, 0.50, 0.91, 0.15, 0.07, 3.0);    // Harbor (S)
    m += blob(u, v, 0.86, 0.80, 0.12, 0.11, 2.8);    // SE мыс
    m = Math.min(1.25, m);
    m += (vnoise(u * 16 + 5, v * 16 + 9) - 0.5) * 0.30;   // шум берега
    // вырезы = ТОЛЬКО озёра (реки вынесены в RIVERS, чтобы не прорезать остров до дна)
    m -= blob(u, v, 0.235, 0.61, 0.022, 0.018, 3.0) * 1.1;  // озеро W
    m -= blob(u, v, 0.735, 0.175, 0.018, 0.013, 3.0) * 1.1; // озеро NE
    m -= blob(u, v, 0.835, 0.485, 0.018, 0.015, 3.0) * 1.1; // озеро Elven Ruins
    return m;
  }

  // ============================================================
  //  РЕКИ / ДОРОГИ / ОЗЁРА / СКАЛЫ / ГОРЫ  (полилинии в u,v)
  // ============================================================
  // РЕКИ / ДОРОГИ — исходные полилинии (до bake/калибровки арта)
  var RIVERS = [
    // главная река: север -> мост -> запад от деревни -> юг к гавани
    [[0.41,0.06],[0.40,0.14],[0.39,0.22],[0.37,0.30],[0.36,0.36],[0.37,0.42],[0.36,0.50],[0.37,0.58],[0.40,0.66],[0.43,0.74],[0.45,0.82]],
    // восточная ветка: центр -> SE -> водопад у руин
    [[0.50,0.46],[0.55,0.52],[0.60,0.58],[0.66,0.64],[0.72,0.70],[0.76,0.76]]
  ];
  var ROADS = [
    // гавань -> деревня
    [[0.50,0.86],[0.49,0.78],[0.48,0.70],[0.475,0.62],[0.475,0.55],[0.475,0.49]],
    // кольцо вокруг деревни
    [[0.475,0.40],[0.52,0.42],[0.55,0.445],[0.52,0.475],[0.475,0.49],[0.43,0.475],[0.40,0.445],[0.43,0.42],[0.475,0.40]],
    // деревня -> N (Obelisk / Northern Wasteland)
    [[0.475,0.40],[0.49,0.30],[0.50,0.20],[0.50,0.12],[0.40,0.10],[0.33,0.09]],
    // деревня -> NE (Gray Rock / Orc Barracks)
    [[0.52,0.42],[0.60,0.34],[0.68,0.24],[0.68,0.11],[0.78,0.14],[0.85,0.16]],
    // деревня -> E (Elven Ruins)
    [[0.55,0.445],[0.64,0.44],[0.74,0.44],[0.82,0.40],[0.87,0.36]],
    // деревня -> W (Cruma / Western Terr)
    [[0.40,0.445],[0.32,0.46],[0.22,0.47],[0.12,0.40],[0.07,0.28]],
    // деревня -> NW (Plains of Lizardmen / Cliff)
    [[0.43,0.42],[0.36,0.34],[0.30,0.22],[0.28,0.19],[0.18,0.12],[0.12,0.06]],
    // деревня/Hall of Fighters -> SE (Elven Ruins)
    [[0.52,0.54],[0.58,0.565],[0.66,0.58],[0.74,0.54]],
    // гавань -> SE (Elven Ruins)
    [[0.49,0.78],[0.60,0.72],[0.68,0.66],[0.76,0.58]]
  ];
  var LAKES = [
    { u: 0.235, v: 0.61, r: 0.022 },
    { u: 0.735, v: 0.175, r: 0.018 },
    { u: 0.835, v: 0.485, r: 0.020 }
  ];
  // скалистые мысы (крупные валуны + rock-текстура + пики)
  var ROCK_ZONES = [
    { u: 0.12, v: 0.07, r: 0.07 }, { u: 0.40, v: 0.05, r: 0.09 },
    { u: 0.70, v: 0.07, r: 0.08 }, { u: 0.87, v: 0.15, r: 0.07 },
    { u: 0.06, v: 0.30, r: 0.05 }, { u: 0.93, v: 0.45, r: 0.06 },
    { u: 0.13, v: 0.83, r: 0.06 }, { u: 0.86, v: 0.80, r: 0.06 }
  ];
  // горные гряды (подъём рельефа)
  var MOUNTAINS = [
    { u: 0.33, v: 0.09, r: 0.16, h: 1.0 }, { u: 0.68, v: 0.11, r: 0.13, h: 0.9 },
    { u: 0.85, v: 0.16, r: 0.10, h: 0.8 }, { u: 0.12, v: 0.07, r: 0.08, h: 1.1 },
    { u: 0.07, v: 0.28, r: 0.07, h: 0.7 }, { u: 0.78, v: 0.55, r: 0.12, h: 0.6 }
  ];

  // ---- distance to polyline (в u,v) ----
  function distToPoly(u, v, poly) {
    var best = 1e9;
    for (var i = 0; i < poly.length - 1; i++) {
      var ax = poly[i][0], ay = poly[i][1], bx = poly[i + 1][0], by = poly[i + 1][1];
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((u - ax) * dx + (v - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var px = ax + t * dx, py = ay + t * dy;
      var d = Math.sqrt((u - px) * (u - px) + (v - py) * (v - py));
      if (d < best) best = d;
    }
    return best;
  }
  function distToPolyMeters(u, v, poly) {
    var best = 1e9;
    var px = u * W, py = v * H;
    for (var i = 0; i < poly.length - 1; i++) {
      var ax = poly[i][0] * W, ay = poly[i][1] * H;
      var bx = poly[i + 1][0] * W, by = poly[i + 1][1] * H;
      var dx = bx - ax, dy = by - ay;
      var len2 = dx * dx + dy * dy;
      var t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      var cx = ax + t * dx, cy = ay + t * dy;
      var d = Math.hypot(px - cx, py - cy);
      if (d < best) best = d;
    }
    return best;
  }
  // маска дорог (ширина ~0.012 в u,v) -> 0..1
  function roadMask(u, v) {
    var val = 0;
    for (var i = 0; i < ROADS.length; i++) {
      var d = distToPoly(u, v, ROADS[i]);
      var k = 1.0 - Math.min(1.0, d / 0.012);
      if (k > val) val = k;
    }
    return val * val * (3 - 2 * val); // smoothstep
  }
  // маска рек: 0..10м - дно каньона (1.0), 10..22м - крутой обрыв (1.0 -> 0.0)
  function riverMask(u, v) {
    var val = 0;
    for (var i = 0; i < RIVERS.length; i++) {
      var d_m = distToPolyMeters(u, v, RIVERS[i]);
      var k = 0;
      if (d_m <= 10.0) {
        k = 1.0;
      } else if (d_m < 22.0) {
        var t = (d_m - 10.0) / 12.0;
        k = 1.0 - t * t * (3.0 - 2.0 * t);
      }
      if (k > val) val = k;
    }
    return val;
  }
  function rockMask(u, v) {
    var val = 0;
    for (var i = 0; i < ROCK_ZONES.length; i++) {
      var z = ROCK_ZONES[i];
      var d = Math.sqrt((u - z.u) * (u - z.u) + (v - z.v) * (v - z.v));
      var k = 1.0 - Math.min(1.0, d / z.r);
      if (k > val) val = k;
    }
    return val;
  }
  function mountainField(u, v) {
    var val = 0;
    for (var i = 0; i < MOUNTAINS.length; i++) {
      var z = MOUNTAINS[i];
      var d = Math.sqrt((u - z.u) * (u - z.u) + (v - z.v) * (v - z.v));
      var k = 1.0 - Math.min(1.0, d / z.r);
      k = k * k * (3 - 2 * k);
      val += k * z.h;
    }
    return Math.min(1.4, val);
  }

  // ============================================================
  //  РЕГИОНЫ
  //  - Деревня: единственная мирная, UV по map_world.webp (центр острова)
  //  - Остальное: только HUNT_ZONES / territory из редактора (F2)
  //  Координаты NPC и пропсов привязаны к геометрии террейна.
  // ============================================================
  // map_world.webp: «Деревня поющей стали» — центральный хаб
  var REGIONS = [
    {
      id: 'village', name: 'Деревня поющей стали', type: 'HUB', tension: 'refuge',
      nb: [0.388, 0.384, 0.566, 0.568], levelRange: [0, 0], peace: true,
      color: 0x3a3a2a, mapColor: '#5a5a3a',
      walls: { thickness: 2, height: 8, gateWidth: 6 },
      description: 'Единственная мирная зона (map_world.webp). Торговцы, спавн.',
      fromMap: true
    }
  ];

  /** Дикий остров вне деревни и вне hunt-zones (не мирный). */
  var WILD_REGION = {
    id: 'wild', name: 'Остров поющей стали', type: 'WILD', tension: 'release',
    levelRange: [1, 40], peace: false, color: 0x2a2a30, mapColor: '#3a4a3a',
    description: 'Открытый остров вне размеченных зон охоты.'
  };

  var CITY_NPCS = [
    { id:'guard_n', name:'Страж-Автомат N-1', title:'Охрана Северных ворот', type:'guard', np:[0.4859,0.3907], color:0x88aaff, scale:2.4, sprite:{body:'#5566aa',eyes:'#aaccff',heavy:true}, quests:['side_steel_limit'], dialogue:{idle:[
      'Сканирую контур... Давление в норме. На полигоне держи оружие на взводе: одичавшие механизмы не подают предупредительных гудков.',
      'Северный створ чист. Но за внешним валом земля дрожит от поступных машин. Не зевай, оператор.'
    ]} },
    { id:'guard_s', name:'Страж-Автомат S-1', title:'Охрана Южных ворот', type:'guard', np:[0.5073,0.5624], color:0x88aaff, scale:2.4, sprite:{body:'#5566aa',eyes:'#aaccff',heavy:true}, dialogue:{idle:[
      'В черте города оружие на блокиратор. За воротами начинаются Холмы Астарда — там законы Синдиката уступают силе пара.',
      'Южный тракт открыт. Следи за манометром: соленый морской бриз с побережья быстро остужает незащищенные теплообменники.'
    ]} },
    { id:'guard_w', name:'Страж-Автомат W-1', title:'Охрана Западных ворот', type:'guard', np:[0.3926,0.4828], color:0x88aaff, scale:2.4, sprite:{body:'#5566aa',eyes:'#aaccff',heavy:true}, quests:['side_western_patrol'], dialogue:{idle:[
      'Западный каньон штормит ржавой пылью. Если идешь на Свалку один — проверь аварийный клапан. Одиночек тамошние дробильщики перемалывают на лом без пауз.',
      'Слышишь тяжелый скрежет за скалами? Это прессы утрамбовывают шлак. Не суйся в зону дробления без надежного напарника.'
    ]} },
    { id:'guard_e', name:'Страж-Автомат E-1', title:'Охрана Восточной стены', type:'guard', np:[0.5577,0.5068], color:0x88aaff, scale:2.4, sprite:{body:'#5566aa',eyes:'#aaccff',heavy:true}, dialogue:{idle:[
      'Восточная стена прикрывает турбинный комплекс. Снизу доносится звон стали — бойцы на Арене Котла снова проверяют клинки на излом.',
      'Пар из клапанов обжигает забрало, но сектор надежен. Боевые искры здесь норма — восток всегда кипит энергией.'
    ]} },
    { id:'gilbert', name:'Инспектор Гилберт', title:'Главный Инспектор', type:'quest', np:[0.4762,0.4235], color:0xffaa44, scale:2.5, sprite:{body:'#aa6622',accent:'#664411',eyes:'#ffdd44',heavy:true}, sheet:{json:'assets/npc/gilbert_idle.json',image:'assets/npc/gilbert_idle.webp',fps:8.4,portrait:'assets/npc/Inspector_Gilbert.webp'}, portrait:'assets/npc/Inspector_Gilbert.webp', quests:['main_02_perimeter','main_04_certification','daily_scrapper_hunt','side_gilbert_watch','bounty_scrap_tyrant','bounty_press_hammer','bounty_boiler_sovereign','side_rezdiq_orders'], dialogue:{idle:[
      'Остров стонет под весом ржавчины. Слышишь этот мерный гул?',
      'Дисциплина — не выбор. Это единственный способ выжить среди пара и шестерен.',
      'Каждый винтик должен быть на своем месте. Готовься к исполнению долга.'
    ]} },
    { id:'bot_01', name:'Бот-01', title:'Дрон-помощник', type:'quest', np:[0.4783,0.4769], color:0x44ff44, scale:1.2, sprite:{body:'#44aa44',eyes:'#ffffff',flying:true}, quests:['main_01_welcome','side_astard_survey'], dialogue:{idle:[
      'Пип-боп! Площадь Котла приветствует нового жителя. Диагностика завершена: пульс стабилен, винтики на месте.',
      'Служебная заметка: скрип в шарнирах лечится свежей смазкой, а не ударом молота. Загляни к Милли на рынок!',
      'Ошибка 404: Страх не обнаружен. Превосходный показатель для службы на Острове.'
    ]} },
    { id:'guide_k9', name:'Гид-Дрон К-9', title:'Справочный терминал', type:'quest', np:[0.4741,0.4769], color:0x44ddff, scale:1.4, sprite:{body:'#3399bb',eyes:'#ccffff',flying:true}, quests:['side_audio_log_01'], dialogue:{idle:[
      'Справочный модуль активен. На севере вас ждут Инспекторат и Ратуша, на западе стучат молоты кузниц, на востоке гудят лаборатории инженеров.',
      'Ищете снаряжение? Торговые ряды развернуты на юге. Склады снабжения — у северо-западного бастиона.',
      'Желаете испытать мастерство в честном бою? Песок Арены Котла ждет храбрецов в юго-восточном секторе.'
    ]} },
    { id:'smith_kran', name:'Кузнец-Сборщик Кран', title:'Заточка и разборка', type:'craft', np:[0.4215,0.4748], color:0xff8844, scale:2.3, sprite:{body:'#aa5522',accent:'#663311',eyes:'#ffaa44',heavy:true}, quests:['side_cruna_forges'], dialogue:{idle:[
      'Металл не терпит суеты. Поддашь давления выше меры — клинок треснет в тисках. Сделаешь расчет точно — поющей стали сносу не будет.',
      'Слышишь, как звенит наковальня? Настоящая заточка познается по звону. Доставай усилители, проверим твое железо на стойкость.'
    ]} },
    { id:'trader_vex', name:'Оружейник Векс', title:'Торговец оружием', type:'shop', np:[0.4274,0.4673], color:0xff6644, scale:2.1, sprite:{body:'#994422',accent:'#552211',eyes:'#ffcc88'}, quests:['side_vex_scrap'],
      shop:[
        // Оператор 1–20 (No-Grade и Low D эталон L2 C1)
        'operator_hammer_low','short_sword','mage_dagger','copper_pipe',
        'long_sword','iron_hammer','dirk','spring_bow',
        'bastard_sword','steam_hammer','assassin_knife','composite_bow',
        'revolution_sword','heavy_doom_hammer','prowler_dagger','reinforced_bow',
        // Инженер 1–20 (No-Grade и Low D)
        'apprentice_wand','willow_coil','cedar_manifold','mage_staff','crucifix_blood','voodoo_doll',
        'mace_prayer','magic_mace'
      ],
      dialogue:{idle:[
        'Взгляни на баланс этих молотов и клинков. Каждый эфес и ствол подогнаны вручную: ни заусенца на рукояти, ни люфта в поршнях.',
        'Добротную рабочую сталь найдешь на моих стойках. А вот реликтовые образцы Создателей... за ними придется поохотиться на древних гигантов в пустошах.'
      ]} },
    { id:'trader_dora', name:'Бронник Дора', title:'Торговец бронёй', type:'shop', np:[0.4274,0.4737], color:0xffaa66, scale:2.1, sprite:{body:'#996633',accent:'#553311',eyes:'#ffddaa'}, shop:[
      'circuit_robe_jacket','circuit_robe_pants',
      'devotion_jacket','devotion_pants',
      'mithril_jacket','mithril_pants',
      'knowledge_jacket','knowledge_pants','knowledge_gloves',
      'worker_overalls',
      'wooden_breastplate','wooden_gaiters','wooden_helmet',
      'leather_armor','leather_pants','leather_vest',
      'copper_chainmail','copper_chainmail_gaiters','iron_helmet',
      'bone_breastplate','bone_gaiters',
      'ring_mail_breastplate','ring_mail_gaiters','ring_mail_boots','ring_mail_gloves',
      'reinforced_leather_shirt','reinforced_leather_gaiters','reinforced_leather_boots',
      'scale_mail_breastplate','scale_mail_gaiters','scale_mail_shield',
      'operator_gauntlets_low','goggles','leather_cap','leather_gloves','work_boots','copper_shield','copper_plate','steam_helmet','steam_boots','boiler_shield','copper_earring','coral_earring'
    ], dialogue:{idle:[
      'Добротная кираса должна держать не только удар кувалды, но и струю перегретого пара. Примеряй, проверяй клепки — в моей броне вернешься из похода на своих двоих.',
      'Легкие стеганые куртки для маневра или тяжелые литые латы? Выбирай с расчетом: броня — это граница между жизнью и утилизацией.'
    ]} },
    { id:'milly', name:'Торговец Милли', title:'Лавка площади (grocery)', type:'shop', np:[0.4698,0.5346], color:0xff44aa, scale:2.0, sprite:{body:'#aa3366',accent:'#662244',eyes:'#ffaacc'}, quests:['side_milly_parts','side_harbor_courier'], shop:['synthetic_oil','pressure_canister','wooden_arrow','iron_arrow','scroll_escape','scroll_resurrection','antidote','bandage','potion_alacrity','potion_wind_walk','emergency_repair_kit','high_pressure_tank','soulshot_no_grade','soulshot_d','spiritshot_no_grade','spiritshot_d','blessed_spiritshot_no_grade','blessed_spiritshot_d','pressure_amplifier','pressure_amplifier_d','blessed_pressure_amplifier','gear_fragment','copper_cable','iron_scrap','steam_valve','piston_ring','spark_plug'], dialogue:{idle:[
      'О, новый клиент! Или доброволец для проверки конденсаторов? Шучу-шучу! У меня лучшее очищенное масло и оружейные заряды на всем рынке.',
      'Не трогай вон тот синий тумблер! А, ладно, трогай... предохранитель вроде держал. Тебе соулшотов для боя отсыпать или запасных канистр?',
      'Шестерни вертятся, клапаны свистят, поставки идут по плану. Запасайся припасами, пока реактор не чихнул!'
    ]} },
    { id:'grocer_spark', name:'Кладовщица Искра', title:'Лавка инженеров', type:'shop', np:[0.4826,0.5346], color:0x88ccff, scale:2.0, sprite:{body:'#4477aa',accent:'#223355',eyes:'#cceeff'}, quests:['side_spark_gardens','side_chem_leak'], shop:['synthetic_oil','copper_cable','steam_valve','piston_ring','spark_plug','gear_fragment','iron_scrap','pressure_canister','recipe_synthetic_oil','recipe_pressure_canister','recipe_leather_gloves','recipe_work_boots','recipe_piston'], dialogue:{idle:[
      'Тонкая механика требует уважения. Один заклинивший клапан или оплавленный провод — и паровая магистраль встанет намертво. Что нужно для сборки?',
      'У меня есть редкие кабели, чертежи и прокладки из Затерянных Садов. Собери вещь своими руками — и она никогда не подведет в бою.'
    ]} },
    { id:'intendant_rid', name:'Интендант Рид', title:'Снабжение операторов', type:'shop', np:[0.4274,0.4812], color:0xcc8844, scale:2.1, sprite:{body:'#885522',accent:'#442211',eyes:'#ffcc88',heavy:true}, shop:['operator_hammer_low','operator_compressor_low','operator_bracers_low','iron_hammer','copper_pipe','emergency_repair_kit','soulshot_no_grade','soulshot_d','wooden_breastplate','wooden_gaiters','leather_armor','leather_pants','leather_vest','copper_chainmail','copper_chainmail_gaiters','work_boots','copper_shield','operator_gauntlets_low','wooden_arrow','iron_arrow'], dialogue:{idle:[
      'Каждому новобранцу — уставной молот и комплект брони. Покажи мне мозоли на ладонях, боец: здесь уважают тех, кто умеет работать инструментом.',
      'Порядок в снаряжении — порядок в бою. Проверь затяжку ремней и запас выстрелов перед тем, как переступить порог ворот.'
    ]} },
    { id:'archivist_skrip', name:'Архивариус Скрип', title:'Чертежи и схемы', type:'shop', np:[0.5202,0.4689], color:0xddaa44, scale:2.0, sprite:{body:'#887722',accent:'#443311',eyes:'#ffeeaa'}, quests:['path_to_constructor'], shop:['recipe_synthetic_oil','recipe_pressure_canister','recipe_soulshot_no_grade','recipe_leather_gloves','recipe_work_boots','recipe_copper_shield','recipe_pressure_amplifier','recipe_piston','recipe_soulshot_d','recipe_steel_plate','recipe_hydraulic_fluid'], dialogue:{idle:[
      'Знание — это чертеж, воплощенный в металле. Пока дилетанты крутят гайки наугад, мудрый мастер читает схемы и постигает законы пара.',
      'В моих архивах хранятся технологические карты Первой Эпохи. Освой основы ремесла, закали мастерство — и тебе откроются высшие чертежи конструкторов.'
    ]} },
    { id:'instructor_thorn', name:'Мастер-Инструктор Торн', title:'Тренер бойцов', type:'trainer', np:[0.5202,0.4807], color:0x66dd66, scale:2.4, sprite:{body:'#338833',accent:'#225522',eyes:'#aaffaa',heavy:true}, quests:['path_to_constructor'],
      dialogue:{idle:[
        'Я обучал бойцов еще тогда, когда этот город только учился держать удар. Сила оператора — в выверенном гидроударе и дисциплине брони.',
        'Боевой опыт преобразуется в мастерство. Покажи мне, чему научили тебя схватки в пустошах, и я открою новые приемы твоей боевой профессии.'
      ], trainer:[
        'Изучай каталог приемов передовой. Каждое умение требует выдержки, прокачки сервоприводов и надетого нагнетателя или наручей.',
        'Не хватает SP для нового ранга? Сражайся с равными соперниками — в упорном бою боевое мастерство оттачивается быстрее всего.'
      ]},
      trainerClasses:['operator','mechanic','destroyer','gunner',
        'repair_engineer','boiler_guardian','demolitionist','steam_berserker','pneumatic_sniper','artillery_engineer']
    },
    { id:'magister_baulro', name:'Магистр Контура Баульро', title:'Тренер инженеров', type:'trainer', np:[0.4890,0.4290], color:0x44aaff, scale:2.3, sprite:{body:'#225599',accent:'#113366',eyes:'#88ddff'},
      dialogue:{idle:[
        'Контур не прощает погрешностей в расчетах. Сила инженера — в резонансе схем, контроле давления пара и точности команд для нанитов.',
        'Школа Инженеров хранит чертежи и формулы Первого Котла. Накопи достаточный опыт (SP) — и я открою тебе новые контурные алгоритмы.'
      ], trainer:[
        'Выбирай схему для калибровки. Каждое умение требует стабильной несущей частоты резонатора или связи роя нано-браслетов.',
        'Теория мертва без практики. Испытай импульсы на дефектных автоматонах в пустошах — и возвращайся за новыми формулами.'
      ]},
      trainerClasses:['engineer','constructor','technomancer',
        'pressure_sorcerer','machine_warlock','circuit_necro','overhaul_master','protocol_prophet']
    },
    { id:'biotin', name:'Старший Техник Биотин', title:'Хранитель Машинного Зала', type:'buff', np:[0.4842,0.4278], color:0x4488ff, scale:2.2, sprite:{body:'#3366aa',accent:'#224488',eyes:'#88ccff'}, quests:['main_03_machines','main_04_certification_tech','side_audio_log_01','path_to_technomancer'], buffs:[{id:'pressure_boost',name:'Повышенное давление',description:'+20% к атаке на 30 мин',cost:500,duration:1800,effect:{attackMult:1.2}},{id:'spark_blessing',name:'Благословение Искры',description:'+15% к опыту на 1 час',cost:800,duration:3600,effect:{expMult:1.15}},{id:'overclock',name:'Разгон',description:'+30% к скорости на 10 мин',cost:300,duration:600,effect:{speedMult:1.3}}], dialogue:{idle:[
      'В каждом механизме бьется Искра. Нужно лишь уметь слушать мерный ритм ее биения.',
      'Машины не виновны в безумии. Их древний протокол комфорта пережил создателей и заблудился в руинах.',
      'Тик-так... слышишь ровный гул в стальных переборках? Это бьется сердце Острова.'
    ]} },
    { id:'warehouse_w7', name:'Складской Терминал W-7', title:'Склад', type:'warehouse', np:[0.4194,0.4307], color:0xaaaa44, scale:2.2, sprite:{body:'#777722',accent:'#444411',eyes:'#dddd88',heavy:true}, dialogue:{idle:[
      'Пневмо-затворы хранилища W-7 приведены в действие. Протокол сохранности: абсолютный. Сдавай тяжелый груз — ни одна шестерня не потеряется.',
      'Идентификация подтверждена. Складские ячейки герметичны и защищены от коррозии. Чем могу услужить, оператор?'
    ]} },
    { id:'dispatcher_roxy', name:'Диспетчер Телепортов Рокси', title:'Транспортная сеть', type:'teleport', np:[0.4762,0.4780], color:0x44ffff, scale:2.0, sprite:{body:'#2299aa',accent:'#115566',eyes:'#aaffff'}, quests:['side_roxy_echo'], teleports:[{name:'Вход в Док №3',u:0.87,v:0.36,cost:800},{name:'Каньоны Ржавого Лома',u:0.30,v:0.19,cost:600},{name:'Западный Периметр',u:0.22,v:0.47,cost:500},{name:'Восточный Полигон',u:0.66,v:0.33,cost:300},{name:'Гавань',u:0.50,v:0.86,cost:400}], dialogue:{idle:[
      'Эфирный контур разогрет до рабочих частот! Маяки по всему острову поймали несущую волну. Назови координаты — и через миг ты на месте.',
      'Главное во время скачка — не трогать заземляющие контуры и беречь припасы. Куда держишь путь, оператор?'
    ]} },
    { id:'darn', name:'Старатель Дарн', title:'Ежедневные поручения', type:'quest', np:[0.4676,0.4278], color:0xffcc44, scale:2.0, sprite:{body:'#998822',accent:'#554411',eyes:'#ffee88'}, quests:['daily_scrapper_hunt'], dialogue:{idle:[
      'У Синдиката простое правило: шестерни должны крутиться, а тропы вокруг крепости — быть чистыми от ржавого лома. Берешь контракт — получаешь звонкие детали.',
      'Дефектные скрапперы плодятся быстрее, чем мы успеваем их переплавлять. Зачищай секторы каждый день — без работы и жалования не останешься.'
    ]} },
    { id:'elias', name:'Инженер Элиас', title:'Хранитель аудио-логов', type:'quest', np:[0.4719,0.4208], color:0xaa88ff, scale:2.0, sprite:{body:'#6644aa',accent:'#332266',eyes:'#ccaaff'}, quests:['side_audio_log_01','path_to_technomancer','side_fallen_memory'], dialogue:{idle:[
      'Тише... В эфире между третьей и пятой гармоникой звучит странное эхо. Это не простые помехи, это голоса ушедшей эпохи.',
      'Если найдешь на полигонах уцелевший аудио-лог — неси мне. Но помни: правда о Сбое Нулевого Цикла может оказаться опаснее выстрела в упор.'
    ]} },
    { id:'bonna', name:'Механик Бонна', title:'Житель Узла', type:'flavor', np:[0.4816,0.4208], color:0xcccccc, scale:1.9, sprite:{body:'#777777',accent:'#444444',eyes:'#dddddd'}, quests:['path_to_technomancer'], dialogue:{idle:[
      'Мой дед рассказывал, что до Великой Остановки паровые генераторы работали веками без единой осечки. Металл пел, а не скрежетал от ржавчины.',
      'Когда пар течет по трубам ровно, в доме тепло и спокойно. Береги свой инструмент, боец: пока в руках есть разводной ключ, город будет жить.'
    ]} },
    { id:'krist', name:'Бар-Автомат Крист', title:'Раздатчик синт-масла', type:'flavor', np:[0.4762,0.5399], color:0xcccccc, scale:1.9, sprite:{body:'#666666',accent:'#333333',eyes:'#ffaa44'}, dialogue:{idle:[
      'Добро пожаловать в таверну. У меня найдется порция чистого синт-дистиллята для остывших теплообменников и кружка крепкого конденсата для усталых путников.',
      'В моем заведении не ломают стойки и не перегружают котлы. Опусти монетку в монетоприемник — и получи лучший напиток на побережье.'
    ]} },
    { id:'arena_kettle', name:'Распорядитель Котёл', title:'Арена Котла (PvP)', type:'quest', np:[0.5282,0.5303], color:0xff5533, scale:2.3, sprite:{body:'#883322',accent:'#441111',eyes:'#ffaa66',heavy:true}, dialogue:{idle:[
      'Песок Арены Котла помнит тысячи славных поединков! Здесь нет подлых ударов в спину — только твое мастерство против мастерства соперника.',
      'Готов доказать, что твой молот бьет точнее, а щит держит удар крепче всех на острове? Вступай в круг и покажи, из какого металла ты отлит!'
    ]} }
  ];
  var REGION_NPCS = [
    { id:'harbor_trader', name:'Старатель Грог', title:'Торговец Гавани', type:'shop', np:[0.48,0.86], color:0xff8844, scale:2.1, sprite:{body:'#995522',accent:'#553311',eyes:'#ffcc88'}, shop:['synthetic_oil','pressure_canister','soulshot_d','pressure_amplifier','emergency_repair_kit'], dialogue:{idle:[
      'Да, доставка грузов на берег влетает в копеечку, зато мои ремкомплекты и смазка спасут твой котел, когда до города полдня пути по диким скалам.',
      'Соленый морской бриз разъедает металл быстрее кислоты. Закупись соулшотами и защитными составами, пока стоишь на сухом причале.'
    ]} },
    { id:'harbor_teleport', name:'Телепорт-Буй А-2', title:'Возврат в Деревню', type:'teleport', np:[0.52,0.86], color:0x44ffff, scale:1.8, sprite:{body:'#2299aa',accent:'#115566',eyes:'#aaffff'}, teleports:[{name:'Деревня поющей стали',u:0.4762,v:0.4753,cost:400}], dialogue:{idle:[
      'Аварийный телепорт-буй А-2 готов к запуску. Мгновенный перенос на центральную площадь Деревни Поющей Стали. Пристегните ремни... Предупреждение: ремни конструкцией не предусмотрены.'
    ]} },
    { id:'captain_sea_watch', name:'Капитан Морского Дозора', title:'Командор Гавани', type:'quest', np:[0.50,0.88], color:0x3366cc, scale:2.3, sprite:{body:'#113377',accent:'#002255',eyes:'#66ccff'}, quests:['epic_seven_cores','epic_colossus_slayer'], dialogue:{idle:[
      'Куда прешь, салага? Дирижабли заблокированы карантином Синдиката! Пока на Острове бушуют исполины — небо закрыто намертво.',
      'Хочешь на Материк? Собери 7 ядер Хранителей, открой Крепость стального предела и сокруши Стального Колосса!'
    ]} }
  ];

  /** Районы крепости city-2: не даём editor-overrides вернуть NPC в кучу у площади. */
  var CITY_DISTRICT_NP = {
    guard_n:[0.4859,0.3907], guard_s:[0.5073,0.5624], guard_w:[0.3926,0.4828], guard_e:[0.5577,0.5068],
    gilbert:[0.4762,0.4673], bot_01:[0.4783,0.4769], guide_k9:[0.4741,0.4769],
    smith_kran:[0.4655,0.4705], trader_vex:[0.4703,0.4705], trader_dora:[0.4703,0.4812],
    milly:[0.4698,0.4855], grocer_spark:[0.4826,0.4855], intendant_rid:[0.4655,0.4807],
    archivist_skrip:[0.4821,0.4705], instructor_thorn:[0.4821,0.4801], biotin:[0.4826,0.4673],
    warehouse_w7:[0.4612,0.4678], dispatcher_roxy:[0.4762,0.4780],
    darn:[0.4698,0.4673], elias:[0.4666,0.4652], bonna:[0.4826,0.4625],
    krist:[0.4762,0.4897], arena_kettle:[0.4934,0.4956]
  };
  function applyCityDistrictLayout() {
    for (var i = 0; i < CITY_NPCS.length; i++) {
      var n = CITY_NPCS[i];
      if (n && CITY_DISTRICT_NP[n.id]) n.np = CITY_DISTRICT_NP[n.id].slice();
    }
  }
  // Удаления редактора (заполняются applyEditorOverrides / mark*)
  var DELETED_NPC_IDS = [];
  var DELETED_MOB_SPOT_IDXS = [];
  // Системные модули мира (кроме terrain/water): mountains | volcano | walls
  var DELETED_WORLD_KEYS = [];
  // Любые меши по id/finger/editorKey
  var DELETED_MESH_IDS = [];

  // Споты мобов НЕ хардкодятся в коде.
  // Источник: HUNT_ZONES из редактора → rebuildMobSpotsFromEditor().
  var MOB_SPOTS = [];

  function _getMobDb() {
    try {
      if (typeof require !== 'undefined') {
        try { return require('./mob-db.js'); } catch (e0) { /* browser */ }
      }
    } catch (e1) { /* ignore */ }
    if (typeof window !== 'undefined' && window.MOB_DB) return window.MOB_DB;
    if (typeof globalThis !== 'undefined' && globalThis.MOB_DB) return globalThis.MOB_DB;
    return null;
  }

  /**
   * Полная пересборка MOB_SPOTS только по зонам редактора (name+lvl+poly).
   * Карта мира map_world.webp — ориентир имён; геометрия — только editor.
   */
  function rebuildMobSpotsFromEditor() {
    // Только hunt (оранжевые). Territory (синие: Деревня, Порт…) — БЕЗ мобов.
    var hunts = buildHuntZones().filter(function (z) {
      return z && z.kind !== 'territory' && !z.peace && z.id !== 'hunt_village_arena' && !z.arena && !z.noSpots;
    });
    var MDB = _getMobDb();
    MOB_SPOTS.length = 0;
    if (MDB && MDB.buildSpotsFromEditorZones) {
      var built = MDB.buildSpotsFromEditorZones(hunts);
      for (var i = 0; i < built.length; i++) MOB_SPOTS.push(built[i]);
      // скрытые Italian brainrot-боссы (не kit, фиксированные углы)
      if (typeof MDB.getSecretSpots === 'function') {
        var secrets = MDB.getSecretSpots();
        for (var si = 0; si < secrets.length; si++) MOB_SPOTS.push(secrets[si]);
      }
      if (typeof MDB.getRaidSpots === 'function') {
        var raids = MDB.getRaidSpots();
        for (var ri = 0; ri < raids.length; ri++) MOB_SPOTS.push(raids[ri]);
      }
    } else {
      for (var h = 0; h < hunts.length; h++) {
        var z = hunts[h];
        if (!z.nb) continue;
        var u = (z.nb[0] + z.nb[2]) / 2;
        var v = (z.nb[1] + z.nb[3]) / 2;
        var lo = (z.lvl && z.lvl[0] != null) ? +z.lvl[0] : 1;
        var hi = (z.lvl && z.lvl[1] != null) ? +z.lvl[1] : lo;
        MOB_SPOTS.push({
          region: z.id, huntZoneId: z.id, zone: z.name,
          np: [u, v], r: 0.012, n: 5, mob: 'scrapper',
          lvl: [lo, hi],
          passive: hi <= 5, boss: false
        });
      }
    }
    _cachedRegions = null;
    return MOB_SPOTS.length;
  }

  // ============================================================
  //  ЗОНЫ ОХОТЫ — rect (nb) или polygon (poly: [[u,v],...])
  //  Рисуются в редакторе (F2). Не заменяют REGIONS, а дополняют.
  // ============================================================
  var HUNT_ZONES = [];
  var DELETED_HUNT_ZONE_IDS = [];
  var _huntZoneSeq = 0;

  function _huntDeleted(id) {
    return DELETED_HUNT_ZONE_IDS.indexOf(id) >= 0 || !!(HUNT_ZONES.find(function (z) { return z && z.id === id && z._deleted; }));
  }
  function markHuntZoneDeleted(id) {
    if (!id) return;
    if (DELETED_HUNT_ZONE_IDS.indexOf(id) < 0) DELETED_HUNT_ZONE_IDS.push(id);
    HUNT_ZONES.forEach(function (z) { if (z && z.id === id) z._deleted = true; });
    _cachedRegions = null;
  }
  /** AABB nb из poly [[u,v],...] */
  function _nbFromPoly(poly) {
    var u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      if (p[0] < u0) u0 = p[0];
      if (p[1] < v0) v0 = p[1];
      if (p[0] > u1) u1 = p[0];
      if (p[1] > v1) v1 = p[1];
    }
    if (!isFinite(u0)) return [0.4, 0.4, 0.45, 0.45];
    return [u0, v0, u1, v1];
  }
  function _normalizePoly(poly) {
    if (!poly || !poly.length) return null;
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var p = poly[i];
      if (!p || p.length < 2) continue;
      out.push([+p[0], +p[1]]);
    }
    // drop closing duplicate
    if (out.length >= 2) {
      var a = out[0], b = out[out.length - 1];
      if (Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9) out.pop();
    }
    return out.length >= 3 ? out : null;
  }
  /** point-in-polygon (ray casting), poly world [{x,z}] or [[x,z]] */
  function _pointInPolyXZ(x, z, poly) {
    if (!poly || poly.length < 3) return false;
    var inside = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i].x != null ? poly[i].x : poly[i][0];
      var zi = poly[i].z != null ? poly[i].z : poly[i][1];
      var xj = poly[j].x != null ? poly[j].x : poly[j][0];
      var zj = poly[j].z != null ? poly[j].z : poly[j][1];
      var intersect = ((zi > z) !== (zj > z)) &&
        (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function _polyAreaUV(poly) {
    var a = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    }
    return Math.abs(a) * 0.5;
  }

  function addHuntZone(z) {
    if (!z) return null;
    _huntZoneSeq++;
    var id = z.id || ('hunt_' + Date.now() + '_' + _huntZoneSeq);
    var lvl = z.lvl || z.levelRange || [1, 5];
    if (!Array.isArray(lvl)) lvl = [1, 5];

    var poly = _normalizePoly(z.poly);
    var shape = (poly && poly.length >= 3) ? 'poly' : (z.shape === 'poly' ? 'poly' : 'rect');
    var nb;
    if (poly && poly.length >= 3) {
      shape = 'poly';
      nb = _nbFromPoly(poly);
    } else {
      shape = 'rect';
      poly = null;
      nb = z.nb || [0.4, 0.4, 0.45, 0.45];
      nb = [
        Math.min(nb[0], nb[2]), Math.min(nb[1], nb[3]),
        Math.max(nb[0], nb[2]), Math.max(nb[1], nb[3])
      ];
    }

    // kind: 'hunt' (уровни, оранжевый) | 'territory' (простая синяя территория)
    var kind = (z.kind === 'territory') ? 'territory' : 'hunt';
    var defColor = kind === 'territory' ? 0x4488ff : 0xff6622;
    var defMap = kind === 'territory' ? '#4488ff' : '#ff6622';
    var defName = kind === 'territory'
      ? ('Территория ' + (HUNT_ZONES.length + 1))
      : ('Зона ' + (HUNT_ZONES.length + 1));
    var entry = {
      id: id,
      name: z.name || defName,
      kind: kind,
      shape: shape,
      nb: nb,
      poly: poly, // null | [[u,v],...]
      lvl: [Math.max(0, +lvl[0] || 1), Math.max(0, +lvl[1] || +lvl[0] || 5)],
      color: typeof z.color === 'number' ? z.color : defColor,
      mapColor: z.mapColor || defMap,
      // hunt = бой всегда; territory = мирная территория (если когда-то понадобится)
      peace: kind === 'territory' ? true : false,
      arena: !!z.arena,
      noSpots: !!(z.noSpots || z.arena)
    };
    var existing = -1;
    for (var i = 0; i < HUNT_ZONES.length; i++) {
      if (HUNT_ZONES[i] && HUNT_ZONES[i].id === id) { existing = i; break; }
    }
    if (existing >= 0) HUNT_ZONES[existing] = entry;
    else HUNT_ZONES.push(entry);
    var di = DELETED_HUNT_ZONE_IDS.indexOf(id);
    if (di >= 0) DELETED_HUNT_ZONE_IDS.splice(di, 1);
    _cachedRegions = null;
    return entry;
  }
  function updateHuntZone(id, patch) {
    if (!id || !patch) return null;
    for (var i = 0; i < HUNT_ZONES.length; i++) {
      var z = HUNT_ZONES[i];
      if (!z || z.id !== id) continue;
      if (patch.name != null) z.name = String(patch.name);
      if (patch.poly) {
        var p2 = _normalizePoly(patch.poly);
        if (p2) {
          z.poly = p2;
          z.shape = 'poly';
          z.nb = _nbFromPoly(p2);
        }
      } else if (patch.nb) {
        var n = patch.nb;
        // if had poly — rebuild as rect (scale/move may pass nb only)
        z.nb = [
          Math.min(n[0], n[2]), Math.min(n[1], n[3]),
          Math.max(n[0], n[2]), Math.max(n[1], n[3])
        ];
        if (z.shape !== 'poly' || !z.poly) {
          z.shape = 'rect';
          z.poly = null;
        } else if (patch.keepPoly) {
          // only update AABB cache; poly vertices already patched
          z.nb = _nbFromPoly(z.poly);
        }
      }
      if (patch.shiftUV && z.poly && z.poly.length) {
        var du = +patch.shiftUV[0] || 0, dv = +patch.shiftUV[1] || 0;
        z.poly = z.poly.map(function (pt) { return [pt[0] + du, pt[1] + dv]; });
        z.nb = _nbFromPoly(z.poly);
        z.shape = 'poly';
      }
      if (patch.scaleUV && z.poly && z.poly.length) {
        // scale around center: patch.scaleUV = { cu, cv, sx, sz }
        var sc = patch.scaleUV;
        var cu = sc.cu, cv = sc.cv, sx = sc.sx || 1, sz = sc.sz || 1;
        z.poly = z.poly.map(function (pt) {
          return [cu + (pt[0] - cu) * sx, cv + (pt[1] - cv) * sz];
        });
        z.nb = _nbFromPoly(z.poly);
        z.shape = 'poly';
      }
      if (patch.lvl) {
        z.lvl = [Math.max(0, +patch.lvl[0] || 1), Math.max(0, +patch.lvl[1] || +patch.lvl[0] || 5)];
        if (z.lvl[1] < z.lvl[0]) { var t = z.lvl[0]; z.lvl[0] = z.lvl[1]; z.lvl[1] = t; }
      }
      if (patch.color != null) z.color = patch.color;
      if (patch.mapColor != null) z.mapColor = patch.mapColor;
      if (patch.shape) z.shape = patch.shape;
      if (patch.kind === 'territory' || patch.kind === 'hunt') z.kind = patch.kind;
      // hunt-зоны никогда не мирные; мирная только деревня
      if (z.kind !== 'territory') z.peace = false;
      else if (patch.peace != null) z.peace = !!patch.peace;
      if (patch.arena != null) z.arena = !!patch.arena;
      if (patch.noSpots != null) z.noSpots = !!patch.noSpots;
      if (patch.name != null) { /* already above */ }
      z._deleted = false;
      _cachedRegions = null;
      return z;
    }
    return null;
  }
  function buildHuntZones() {
    return HUNT_ZONES.filter(function (z) {
      return z && !_huntDeleted(z.id) && !z._deleted;
    }).map(function (z) {
      var shape = (z.poly && z.poly.length >= 3) ? 'poly' : 'rect';
      var nb = z.nb;
      if (shape === 'poly') nb = _nbFromPoly(z.poly);
      var b = bounds4(nb);
      var polyWorld = null;
      if (shape === 'poly') {
        polyWorld = z.poly.map(function (pt) {
          var p = pos2(pt);
          return { x: p.x, z: p.z, u: pt[0], v: pt[1] };
        });
      }
      var kind = (z.kind === 'territory') ? 'territory' : 'hunt';
      var colDef = kind === 'territory' ? 0x4488ff : 0xff6622;
      var mapDef = kind === 'territory' ? '#4488ff' : '#ff6622';
      return {
        id: z.id,
        name: z.name,
        kind: kind,
        shape: shape,
        bounds: b,
        nb: nb.slice(),
        poly: z.poly ? z.poly.map(function (pt) { return [pt[0], pt[1]]; }) : null,
        polyWorld: polyWorld,
        verts: polyWorld ? polyWorld.length : 4,
        lvl: z.lvl ? z.lvl.slice() : [1, 5],
        levelRange: z.lvl ? z.lvl.slice() : [1, 5],
        color: z.color != null ? z.color : colDef,
        mapColor: z.mapColor || mapDef,
        peace: kind === 'territory' ? true : !!z.peace,
        arena: !!z.arena,
        noSpots: !!z.noSpots,
        x: (b[0] + b[2]) / 2,
        z: (b[1] + b[3]) / 2,
        w: Math.abs(b[2] - b[0]),
        d: Math.abs(b[3] - b[1]),
        area: shape === 'poly' ? _polyAreaUV(z.poly) * W * H : Math.abs(b[2] - b[0]) * Math.abs(b[3] - b[1])
      };
    });
  }
  function huntZoneAt(x, z) {
    var list = buildHuntZones();
    var best = null, bestArea = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var hit = false;
      if (r.shape === 'poly' && r.polyWorld) {
        // AABB reject then PIP
        if (x >= r.bounds[0] && x <= r.bounds[2] && z >= r.bounds[1] && z <= r.bounds[3]) {
          hit = _pointInPolyXZ(x, z, r.polyWorld);
        }
      } else {
        hit = (x >= r.bounds[0] && x <= r.bounds[2] && z >= r.bounds[1] && z <= r.bounds[3]);
      }
      if (hit) {
        var area = r.area != null ? r.area : (r.w * r.d);
        if (area < bestArea) { bestArea = area; best = r; }
      }
    }
    return best;
  }

  // ============================================================
  //  build*()  ->  абсолютные координаты
  // ============================================================
  function _regionFromStatic(r) {
    var b = bounds4(r.nb);
    var o = {
      id: r.id, name: r.name, type: r.type, tension: r.tension, bounds: b,
      levelRange: r.levelRange, peace: !!r.peace, color: r.color, mapColor: r.mapColor,
      description: r.description, legacy: r.legacy || null, hunt: false
    };
    if (r.walls) o.walls = r.walls;
    return o;
  }

  function _regionFromHunt(hz) {
    var isTerr = hz.kind === 'territory';
    return {
      id: hz.id,
      name: hz.name,
      type: isTerr ? 'HUB' : 'PROSPECT',
      tension: isTerr ? 'refuge' : 'release',
      bounds: hz.bounds.slice ? hz.bounds.slice() : hz.bounds,
      nb: hz.nb ? hz.nb.slice() : null,
      poly: hz.poly || null,
      polyWorld: hz.polyWorld || null,
      shape: hz.shape || 'rect',
      levelRange: hz.lvl ? hz.lvl.slice() : [1, 5],
      lvl: hz.lvl ? hz.lvl.slice() : [1, 5],
      // territory (синие) — мирные; hunt (оранж) — бой
      peace: isTerr ? true : false,
      color: hz.color != null ? hz.color : (isTerr ? 0x4488ff : 0xff6622),
      mapColor: hz.mapColor || (isTerr ? '#4488ff' : '#ff6622'),
      description: isTerr ? 'Территория (редактор)' : 'Зона охоты (редактор)',
      hunt: !isTerr,
      kind: hz.kind || 'hunt',
      arena: !!hz.arena,
      noSpots: !!hz.noSpots,
      x: hz.x, z: hz.z, w: hz.w, d: hz.d, area: hz.area
    };
  }

  /**
   * Регионы мира = деревня (мирная) + hunt-zones редактора (бой).
   * Никаких устаревших регионов.
   */
  function buildRegions() {
    var list = REGIONS.map(_regionFromStatic);
    var hunts = buildHuntZones();
    for (var i = 0; i < hunts.length; i++) {
      list.push(_regionFromHunt(hunts[i]));
    }
    return list;
  }
  function _npc(n) {
    var p = pos2(n.np);
    var o = { id:n.id, name:n.name, title:n.title, type:n.type, position:{x:p.x,z:p.z},
      color:n.color, scale:n.scale, sprite:n.sprite, dialogue:n.dialogue };
    if (n.quests) o.quests = n.quests;
    if (n.shop) o.shop = n.shop;
    if (n.buffs) o.buffs = n.buffs;
    if (n.trainerClasses) o.trainerClasses = n.trainerClasses;
    if (n.teleports) o.teleports = n.teleports.map(function (t) { var q = pos2([t.u,t.v]); return { name:t.name, x:q.x, z:q.z, cost:t.cost }; });
    return o;
  }
  function _npcDeleted(id) {
    return DELETED_NPC_IDS.indexOf(id) >= 0;
  }
  function _spotDeleted(idx) {
    if (DELETED_MOB_SPOT_IDXS.indexOf(idx) >= 0) return true;
    var s = MOB_SPOTS[idx];
    return !!(s && s._deleted);
  }
  function buildCityNPCs() {
    return CITY_NPCS.filter(function (n) { return !_npcDeleted(n.id); }).map(_npc);
  }
  function buildRegionNPCs() {
    return REGION_NPCS.filter(function (n) { return !_npcDeleted(n.id); }).map(_npc);
  }
  function buildSpots() {
    var out = [];
    MOB_SPOTS.forEach(function (s, idx) {
      if (_spotDeleted(idx)) return;
      var p = pos2(s.np);
      out.push({
        region: s.region, zone: s.zone || null, huntZoneId: s.huntZoneId || null,
        x: p.x, z: p.z, r: s.r * W, n: s.n, mob: s.mob,
        lvl: s.lvl, zoneLvl: s.zoneLvl || null,
        passive: !!s.passive, boss: !!s.boss, idx: idx
      });
    });
    return out;
  }
  function buildTeleports() {
    var t = [];
    CITY_NPCS.concat(REGION_NPCS).forEach(function (n) {
      if (_npcDeleted(n.id)) return;
      if (n.type === 'teleport') { var p = pos2(n.np); t.push({ id:'tp_' + n.id, name:n.name, x:p.x, z:p.z }); }
    });
    return t;
  }
  // полилинии -> абсолютные координаты (для рендера рек/дорог и миникарты)
  function _polyAbs(poly) { return poly.map(function (pt) { return pos2(pt); }); }
  function buildRivers() { return RIVERS.map(_polyAbs); }
  function buildRoads() { return ROADS.map(_polyAbs); }
  function buildLakes() { return LAKES.map(function (l) { var p = pos2([l.u,l.v]); return { x:p.x, z:p.z, r:l.r * W }; }); }

  function worldBounds() { return { minX:MIN_X, maxX:MAX_X, minZ:MIN_Z, maxZ:MAX_Z, W:W, H:H, SEA:SEA }; }

  /**
   * Приоритет:
   *  1) hunt-zone редактора (бой, peace=false)
   *  2) деревня (единственная мирная)
   *  3) wild (не мирный)
   * Без «ближайшего legacy-региона» — он врал про мирность.
   */
  function regionAt(x, z) {
    var hz = huntZoneAt(x, z);
    if (hz) return _regionFromHunt(hz);

    if (!_cachedRegions) {
      // только статические (деревня) — hunt уже обработан
      _cachedRegions = REGIONS.map(_regionFromStatic);
    }
    for (var i = 0; i < _cachedRegions.length; i++) {
      var r = _cachedRegions[i];
      if (!r.peace) continue; // статика кроме деревни не ожидается
      if (x >= r.bounds[0] && x <= r.bounds[2] && z >= r.bounds[1] && z <= r.bounds[3]) return r;
    }
    // wild: bounds = весь мир
    var wb = worldBounds();
    return {
      id: WILD_REGION.id,
      name: WILD_REGION.name,
      type: WILD_REGION.type,
      tension: WILD_REGION.tension,
      bounds: [wb.minX, wb.minZ, wb.maxX, wb.maxZ],
      levelRange: WILD_REGION.levelRange,
      peace: false,
      color: WILD_REGION.color,
      mapColor: WILD_REGION.mapColor,
      description: WILD_REGION.description,
      hunt: false,
      wild: true
    };
  }

  function invalidateRegionCache() {
    _cachedRegions = null;
  }

  function buildDungeonAnchors() {
    var elvenEnt = pos2([0.87, 0.36]);
    var elvenHall = pos2([0.78, 0.55]);
    var elvenRef1 = pos2([0.70, 0.62]);
    var elvenRef2 = pos2([0.88, 0.60]);
    var orcEnt = pos2([0.85, 0.16]);

    return {
      elven_ruins: {
        entrance: { x: elvenEnt.x, z: elvenEnt.z },
        rooms: [
          { id: 'd3_gate', type: 'entrance', bounds: [elvenEnt.x - 20, elvenEnt.z - 20, elvenEnt.x + 20, elvenEnt.z + 20], label: 'Заклинившие ворота' },
          { id: 'd3_hall', type: 'hall', bounds: [elvenHall.x - 50, elvenHall.z - 50, elvenHall.x + 50, elvenHall.z + 50], label: 'Главный зал (обзор сверху)' },
          { id: 'd3_stair', type: 'circulation', bounds: [elvenHall.x - 30, elvenHall.z - 80, elvenHall.x + 30, elvenHall.z - 50], label: 'Винтовой спуск вокруг поршня' },
          { id: 'd3_center', type: 'boss', bounds: [elvenHall.x - 20, elvenHall.z - 20, elvenHall.x + 20, elvenHall.z + 20], label: 'Остов Колосса (РБ)' },
          { id: 'd3_refuge1', type: 'refuge', bounds: [elvenRef1.x - 25, elvenRef1.z - 25, elvenRef1.x + 25, elvenRef1.z + 25], label: 'Техническая ниша (реген)' },
          { id: 'd3_refuge2', type: 'refuge', bounds: [elvenRef2.x - 25, elvenRef2.z - 25, elvenRef2.x + 25, elvenRef2.z + 25], label: 'Техническая ниша (реген)' }
        ],
        namedMobs: [
          { id: 'd3_named_rustclaw', templateId: 'rustclaw_overseer', x: elvenHall.x - 15, z: elvenHall.z - 15, respawn: 300, room: 'd3_hall' },
          { id: 'd3_named_sparkweld', templateId: 'sparkweld_elite', x: elvenHall.x + 15, z: elvenHall.z + 15, respawn: 300, room: 'd3_stair' }
        ],
        traps: [
          { id: 'd3_trap_steam1', kind: 'steam_vent', x: elvenHall.x, z: elvenHall.z - 65, radius: 3, interval: 6, telegraph: 1.5, damage: 25, room: 'd3_stair' }
        ],
        chests: [
          { id: 'd3_chest1', x: elvenRef1.x, z: elvenRef1.z, loot: 'dungeon_common', room: 'd3_refuge1' },
          { id: 'd3_chest2', x: elvenHall.x + 5, z: elvenHall.z + 5, loot: 'dungeon_rare', room: 'd3_center', bossGuarded: true }
        ]
      },
      orc_barracks: {
        entrance: { x: orcEnt.x, z: orcEnt.z },
        rooms: [
          { id: 'de_gate', type: 'entrance', bounds: [orcEnt.x - 20, orcEnt.z - 20, orcEnt.x + 20, orcEnt.z + 20], label: 'Шлюз допуска' },
          { id: 'de_lab', type: 'hall', bounds: [orcEnt.x + 20, orcEnt.z + 20, orcEnt.x + 80, orcEnt.z + 80], label: 'Опытный цех' },
          { id: 'de_core', type: 'boss', bounds: [orcEnt.x + 80, orcEnt.z + 80, orcEnt.x + 140, orcEnt.z + 140], label: 'Ядро Директивы (РБ)' }
        ],
        namedMobs: [
          { id: 'de_named_logic', templateId: 'logic_corruptor', x: orcEnt.x + 50, z: orcEnt.z + 50, respawn: 360, room: 'de_lab' }
        ],
        traps: [
          { id: 'de_trap_turret1', kind: 'turret', x: orcEnt.x + 40, z: orcEnt.z + 40, radius: 8, interval: 4, telegraph: 1.0, damage: 35, room: 'de_lab' }
        ],
        chests: [
          { id: 'de_chest1', x: orcEnt.x + 100, z: orcEnt.z + 100, loot: 'dungeon_rare', room: 'de_core', bossGuarded: true }
        ]
      }
    };
  }

  function lineIntersection(p1, p2, p3, p4) {
    var x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
    var x3 = p3[0], y3 = p3[1], x4 = p4[0], y4 = p4[1];
    var denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-6) return null;
    var ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    var ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      var uInt = x1 + ua * (x2 - x1);
      var vInt = y1 + ua * (y2 - y1);
      var dx = (x2 - x1) * W, dy = (y2 - y1) * H;
      var rot = Math.atan2(dx, dy);
      return { u: uInt, v: vInt, rot: rot };
    }
    return null;
  }

  function buildBridges() {
    var raw = [];
    var names = ['Северо-Западный Мост 1', 'Северо-Западный Мост 2', 'Западный Мост', 'Восточный Мост 1', 'Восточный Мост 2'];
    for (var r = 0; r < ROADS.length; r++) {
      var road = ROADS[r];
      for (var i = 0; i < road.length - 1; i++) {
        for (var rv = 0; rv < RIVERS.length; rv++) {
          var river = RIVERS[rv];
          for (var j = 0; j < river.length - 1; j++) {
            var hit = lineIntersection(road[i], road[i + 1], river[j], river[j + 1]);
            if (hit) {
              var p = pos2([hit.u, hit.v]);
              raw.push({ u: hit.u, v: hit.v, x: p.x, z: p.z, rot: hit.rot });
            }
          }
        }
      }
    }
    var bridges = [];
    raw.forEach(function (item) {
      var dup = bridges.some(function (b) { return Math.hypot(b.x - item.x, b.z - item.z) < 35; });
      if (!dup) {
        var idx = bridges.length;
        bridges.push({
          id: 'bridge_auto_' + (idx + 1),
          name: names[idx] || ('Мост ' + (idx + 1)),
          x: item.x, z: item.z,
          u: item.u, v: item.v,
          rot: item.rot,
          width: 10, length: 54
        });
      }
    });
    return bridges;
  }

  // ============================================================
  //  РЕДАКТОР СЦЕНЫ: ОВЕРРАЙДЫ И КАСТОМНЫЕ ПРОПЫ
  // ============================================================
  var CUSTOM_PROPS = [];
  // BSP-браши редактора (UE-style solid volumes)
  var BSP_BRUSHES = [];
  // Метки «сюда строй» (F2). Не hunt и не меш — заказ на геометрию.
  var BUILD_SITES = [];
  var DELETED_BUILD_SITE_IDS = [];
  var _buildSiteSeq = 0;
  // Точка появления игрока (мир, метры). null = дефолт игры.
  var PLAYER_SPAWN = null;

  function _siteDeleted(id) {
    return DELETED_BUILD_SITE_IDS.indexOf(id) >= 0;
  }
  function markBuildSiteDeleted(id) {
    if (!id) return;
    if (DELETED_BUILD_SITE_IDS.indexOf(id) < 0) DELETED_BUILD_SITE_IDS.push(id);
    for (var i = BUILD_SITES.length - 1; i >= 0; i--) {
      if (BUILD_SITES[i] && BUILD_SITES[i].id === id) BUILD_SITES.splice(i, 1);
    }
  }
  function addBuildSite(z) {
    z = z || {};
    _buildSiteSeq++;
    var id = z.id || ('site_' + Date.now() + '_' + _buildSiteSeq);
    var kind = (z.kind === 'poly' || z.kind === 'line') ? z.kind : 'pin';
    var type = String(z.type || 'custom').toLowerCase();
    var minPoly = (kind === 'line') ? 2 : 3;
    var entry = {
      id: id,
      name: z.name || ('Метка ' + _buildSiteSeq),
      kind: kind,
      type: type,
      note: z.note ? String(z.note) : '',
      x: +z.x || 0,
      y: +z.y || 0,
      z: +z.z || 0,
      yaw: z.yaw != null ? +z.yaw : 0,
      np: Array.isArray(z.np) ? [+z.np[0], +z.np[1]] : [0, 0],
      poly: (z.poly && z.poly.length >= minPoly) ? z.poly.map(function (p) { return [+p[0], +p[1]]; }) : null,
      nb: Array.isArray(z.nb) && z.nb.length >= 4 ? z.nb.slice() : null
    };
    var existing = -1;
    for (var i = 0; i < BUILD_SITES.length; i++) {
      if (BUILD_SITES[i] && BUILD_SITES[i].id === id) { existing = i; break; }
    }
    if (existing >= 0) BUILD_SITES[existing] = entry;
    else BUILD_SITES.push(entry);
    var di = DELETED_BUILD_SITE_IDS.indexOf(id);
    if (di >= 0) DELETED_BUILD_SITE_IDS.splice(di, 1);
    return entry;
  }
  function updateBuildSite(id, patch) {
    if (!id || !patch) return null;
    var s = null;
    for (var i = 0; i < BUILD_SITES.length; i++) {
      if (BUILD_SITES[i] && BUILD_SITES[i].id === id) { s = BUILD_SITES[i]; break; }
    }
    if (!s) return null;
    if (patch.name != null) s.name = String(patch.name);
    if (patch.type != null) s.type = String(patch.type).toLowerCase();
    if (patch.note != null) s.note = String(patch.note);
    if (patch.yaw != null) s.yaw = +patch.yaw;
    if (patch.x != null) s.x = +patch.x;
    if (patch.y != null) s.y = +patch.y;
    if (patch.z != null) s.z = +patch.z;
    if (Array.isArray(patch.np) && patch.np.length >= 2) s.np = [+patch.np[0], +patch.np[1]];
    if (patch.poly && patch.poly.length >= 2) {
      s.poly = patch.poly.map(function (p) { return [+p[0], +p[1]]; });
    }
    if (Array.isArray(patch.nb) && patch.nb.length >= 4) s.nb = patch.nb.slice();
    return s;
  }
  function listBuildSites() {
    return BUILD_SITES.filter(function (s) {
      return s && !_siteDeleted(s.id);
    });
  }

  // Земля F2: дороги / площади / поля травы (видны в игре)
  var GROUND_MARKS = [];
  var DELETED_GROUND_MARK_IDS = [];
  var _groundMarkSeq = 0;
  function _groundDeleted(id) {
    return DELETED_GROUND_MARK_IDS.indexOf(id) >= 0;
  }
  function markGroundMarkDeleted(id) {
    if (!id) return;
    if (DELETED_GROUND_MARK_IDS.indexOf(id) < 0) DELETED_GROUND_MARK_IDS.push(id);
    for (var i = GROUND_MARKS.length - 1; i >= 0; i--) {
      if (GROUND_MARKS[i] && GROUND_MARKS[i].id === id) GROUND_MARKS.splice(i, 1);
    }
  }
  function addGroundMark(z) {
    z = z || {};
    _groundMarkSeq++;
    var id = z.id || ('ground_' + Date.now() + '_' + _groundMarkSeq);
    var kind = (z.kind === 'line' || z.kind === 'rect') ? z.kind : 'poly';
    var surface = (z.surface === 'plaza' || z.surface === 'grass') ? z.surface : 'road';
    var minPoly = (kind === 'line') ? 2 : 3;
    var entry = {
      id: id,
      name: z.name || ((surface === 'grass' ? 'Трава ' : surface === 'plaza' ? 'Площадь ' : 'Дорога ') + _groundMarkSeq),
      kind: kind,
      surface: surface,
      width: z.width != null ? +z.width : 8,
      poly: (z.poly && z.poly.length >= minPoly) ? z.poly.map(function (p) { return [+p[0], +p[1]]; }) : null
    };
    var existing = -1;
    for (var i = 0; i < GROUND_MARKS.length; i++) {
      if (GROUND_MARKS[i] && GROUND_MARKS[i].id === id) { existing = i; break; }
    }
    if (existing >= 0) GROUND_MARKS[existing] = entry;
    else GROUND_MARKS.push(entry);
    var di = DELETED_GROUND_MARK_IDS.indexOf(id);
    if (di >= 0) DELETED_GROUND_MARK_IDS.splice(di, 1);
    return entry;
  }
  function listGroundMarks() {
    return GROUND_MARKS.filter(function (s) {
      return s && !_groundDeleted(s.id) && s.poly && s.poly.length >= 2;
    });
  }

  function markNpcDeleted(id) {
    if (!id) return;
    if (DELETED_NPC_IDS.indexOf(id) < 0) DELETED_NPC_IDS.push(id);
  }
  function markMobSpotDeleted(idx) {
    if (typeof idx !== 'number' || idx < 0) return;
    if (DELETED_MOB_SPOT_IDXS.indexOf(idx) < 0) DELETED_MOB_SPOT_IDXS.push(idx);
    if (MOB_SPOTS[idx]) MOB_SPOTS[idx]._deleted = true;
  }
  function isNpcDeleted(id) { return _npcDeleted(id); }
  function isMobSpotDeleted(idx) { return _spotDeleted(idx); }

  /** Только terrain + water нельзя удалять */
  function isProtectedWorldKey(key) {
    var k = String(key || '').toLowerCase();
    if (!k) return false;
    if (k === 'terrain' || k === 'terrain_ground' || k.indexOf('terrain') === 0) return true;
    if (k === 'water' || k === 'watersystem' || k === 'named_waterroot' || k.indexOf('water') >= 0) return true;
    return false;
  }
  function normalizeWorldKey(key) {
    var k = String(key || '').toLowerCase();
    if (!k) return '';
    if (k.indexOf('mountain') >= 0 || k === 'named_mountainsroot') return 'mountains';
    if (k.indexOf('volcano') >= 0) return 'volcano';
    if (k.indexOf('wall') >= 0 || k.indexOf('iwals') >= 0) return 'walls';
    if (k.indexOf('terrain') >= 0) return 'terrain_ground';
    if (k.indexOf('water') >= 0) return 'water';
    return k;
  }
  function markWorldObjectDeleted(key) {
    var k = normalizeWorldKey(key);
    if (!k || isProtectedWorldKey(k)) return false;
    if (DELETED_WORLD_KEYS.indexOf(k) < 0) DELETED_WORLD_KEYS.push(k);
    return true;
  }
  function isWorldObjectDeleted(key) {
    var k = normalizeWorldKey(key);
    return !!(k && DELETED_WORLD_KEYS.indexOf(k) >= 0);
  }
  function markMeshDeleted(id) {
    if (!id) return;
    var s = String(id);
    if (DELETED_MESH_IDS.indexOf(s) < 0) DELETED_MESH_IDS.push(s);
  }
  function isMeshDeleted(id) {
    if (!id) return false;
    return DELETED_MESH_IDS.indexOf(String(id)) >= 0;
  }

  function applyEditorOverrides(overrides) {
    if (!overrides) return;
    _cachedRegions = null;
    // Сначала удаления — чтобы build*/export их учитывали
    if (Array.isArray(overrides.deletedNpcIds)) {
      DELETED_NPC_IDS = overrides.deletedNpcIds.slice();
    }
    if (Array.isArray(overrides.deletedMobSpotIdxs)) {
      DELETED_MOB_SPOT_IDXS = overrides.deletedMobSpotIdxs.slice();
      DELETED_MOB_SPOT_IDXS.forEach(function (idx) {
        if (MOB_SPOTS[idx]) MOB_SPOTS[idx]._deleted = true;
      });
    }
    if (Array.isArray(overrides.deletedHuntZoneIds)) {
      DELETED_HUNT_ZONE_IDS = overrides.deletedHuntZoneIds.slice();
    }
    if (Array.isArray(overrides.huntZones)) {
      // Полная замена: только зоны/территории из редактора
      HUNT_ZONES.length = 0;
      overrides.huntZones.forEach(function (z) {
        if (!z) return;
        if (!z.nb && !(z.poly && z.poly.length >= 3)) return;
        if (DELETED_HUNT_ZONE_IDS.indexOf(z.id) >= 0) return;
        addHuntZone(z);
      });
      // Мобы всегда из этих зон (не legacy mobSpots из старого кода)
      rebuildMobSpotsFromEditor();
    }
    if (Array.isArray(overrides.deletedWorldKeys)) {
      DELETED_WORLD_KEYS = overrides.deletedWorldKeys.map(normalizeWorldKey).filter(function (k) {
        return k && !isProtectedWorldKey(k);
      });
    }
    if (Array.isArray(overrides.deletedMeshIds)) {
      DELETED_MESH_IDS = overrides.deletedMeshIds.map(String);
    }
    if (overrides.cityNpcs) {
      overrides.cityNpcs.forEach(function (ov) {
        if (_npcDeleted(ov.id)) return;
        var npc = CITY_NPCS.find(function (n) { return n.id === ov.id; });
        if (npc && ov.np) npc.np = [ov.np[0], ov.np[1]];
      });
    }
    applyCityDistrictLayout();
    if (overrides.regionNpcs) {
      overrides.regionNpcs.forEach(function (ov) {
        if (_npcDeleted(ov.id)) return;
        var npc = REGION_NPCS.find(function (n) { return n.id === ov.id; });
        if (npc && ov.np) npc.np = [ov.np[0], ov.np[1]];
      });
    }
    // mobSpots из оверрайдов НЕ используем — споты всегда из huntZones редактора.
    // (Старые 16 legacy-спотов в JSON игнорируются.)

    if (overrides.playerSpawn && typeof overrides.playerSpawn.x === 'number') {
      PLAYER_SPAWN = {
        x: overrides.playerSpawn.x,
        y: overrides.playerSpawn.y || 0,
        z: overrides.playerSpawn.z
      };
    }
    if (overrides.customProps && Array.isArray(overrides.customProps)) {
      CUSTOM_PROPS.length = 0;
      overrides.customProps.forEach(function (p) {
        if (!p) return;
        var id = String(p.id || '');
        var name = String(p.name || '');
        if (id === 'named_player_aura' || id === 'player_aura' || name === 'player_aura' || id.indexOf('player_aura') !== -1) return;
        CUSTOM_PROPS.push(JSON.parse(JSON.stringify(p)));
        // legacy: персонаж в customProps → playerSpawn
        if (!PLAYER_SPAWN && p && (
          p.editorKey === 'player_spawn' ||
          p.id === 'player_spawn' ||
          (p.name && String(p.name).indexOf('Персонаж Игрока') !== -1) ||
          (p.id && String(p.id).indexOf('scene_node_Sprite') === 0) ||
          (p.finger && String(p.finger).indexOf('sp|') === 0)
        ) && p.position) {
          PLAYER_SPAWN = { x: p.position.x, y: p.position.y || 0, z: p.position.z };
        }
      });
    }
    if (overrides.bspBrushes && Array.isArray(overrides.bspBrushes)) {
      BSP_BRUSHES.length = 0;
      overrides.bspBrushes.forEach(function (b) {
        if (b && b.id) BSP_BRUSHES.push(JSON.parse(JSON.stringify(b)));
      });
    }
    if (Array.isArray(overrides.buildSites)) {
      BUILD_SITES.length = 0;
      DELETED_BUILD_SITE_IDS = Array.isArray(overrides.deletedBuildSiteIds)
        ? overrides.deletedBuildSiteIds.slice() : [];
      overrides.buildSites.forEach(function (s) {
        if (s && s.id && DELETED_BUILD_SITE_IDS.indexOf(s.id) < 0) addBuildSite(s);
      });
    }
    if (Array.isArray(overrides.groundMarks)) {
      GROUND_MARKS.length = 0;
      DELETED_GROUND_MARK_IDS = Array.isArray(overrides.deletedGroundMarkIds)
        ? overrides.deletedGroundMarkIds.slice() : [];
      overrides.groundMarks.forEach(function (s) {
        if (s && s.id && DELETED_GROUND_MARK_IDS.indexOf(s.id) < 0) addGroundMark(s);
      });
    }
    // Weapon grip pos/rot/worldLen from F2 weapon DB
    if (overrides.weaponGrips && typeof overrides.weaponGrips === 'object') {
      try {
        if (typeof window !== 'undefined' && window.CharModel) {
          var CM = window.CharModel;
          if (typeof CM.applyWeaponGripOverridesBatch === 'function') {
            CM.applyWeaponGripOverridesBatch(overrides.weaponGrips);
          } else if (CM.default && typeof CM.default.applyWeaponGripOverridesBatch === 'function') {
            CM.default.applyWeaponGripOverridesBatch(overrides.weaponGrips);
          }
        }
      } catch (eGrip) { /* CharModel may load later — editor-overrides-data / boot will rehydrate */ }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('ps_weapon_grips', JSON.stringify(overrides.weaponGrips));
        }
      } catch (eLs) { /* ignore */ }
    }
    if (overrides.windSettings && typeof overrides.windSettings === 'object') {
      try {
        if (typeof window !== 'undefined' && window.WindSystem && typeof window.WindSystem.loadSettings === 'function') {
          window.WindSystem.loadSettings();
        }
      } catch (eWnd) { /* ignore */ }
    }
  }

  function exportEditorOverrides() {
    var weaponGrips = null;
    try {
      if (typeof window !== 'undefined' && window.CharModel) {
        var CMe = window.CharModel;
        if (typeof CMe.getAllWeaponGripOverrides === 'function') {
          weaponGrips = CMe.getAllWeaponGripOverrides();
        } else if (CMe.default && typeof CMe.default.getAllWeaponGripOverrides === 'function') {
          weaponGrips = CMe.default.getAllWeaponGripOverrides();
        }
      }
      if (!weaponGrips && typeof localStorage !== 'undefined') {
        var rawG = localStorage.getItem('ps_weapon_grips');
        if (rawG) weaponGrips = JSON.parse(rawG);
      }
    } catch (eExp) { weaponGrips = null; }
    return {
      savedAt: Date.now(),
      deletedNpcIds: DELETED_NPC_IDS.slice(),
      deletedMobSpotIdxs: DELETED_MOB_SPOT_IDXS.slice(),
      deletedWorldKeys: DELETED_WORLD_KEYS.slice(),
      deletedMeshIds: DELETED_MESH_IDS.slice(),
      cityNpcs: CITY_NPCS.filter(function (n) { return !_npcDeleted(n.id); }).map(function (n) {
        return { id: n.id, np: [n.np[0], n.np[1]] };
      }),
      regionNpcs: REGION_NPCS.filter(function (n) { return !_npcDeleted(n.id); }).map(function (n) {
        return { id: n.id, np: [n.np[0], n.np[1]] };
      }),
      mobSpots: MOB_SPOTS.map(function (s, idx) {
        if (_spotDeleted(idx)) return null;
        return {
          idx: idx,
          region: s.region,
          mob: s.mob,
          np: [s.np[0], s.np[1]],
          r: s.r,
          n: s.n,
          lvl: s.lvl ? s.lvl.slice() : undefined,
          passive: !!s.passive,
          boss: !!s.boss,
          zone: s.zone || null,
          huntZoneId: s.huntZoneId || null
        };
      }).filter(Boolean),
      huntZones: HUNT_ZONES.filter(function (z) {
        return z && !_huntDeleted(z.id) && !z._deleted;
      }).map(function (z) {
        var o = {
          id: z.id,
          name: z.name,
          kind: (z.kind === 'territory') ? 'territory' : 'hunt',
          shape: z.shape || (z.poly && z.poly.length >= 3 ? 'poly' : 'rect'),
          nb: z.nb.slice(),
          lvl: z.lvl ? z.lvl.slice() : [1, 5],
          color: z.color,
          mapColor: z.mapColor,
          peace: !!z.peace
        };
        if (z.poly && z.poly.length >= 3) {
          o.poly = z.poly.map(function (pt) { return [pt[0], pt[1]]; });
        }
        return o;
      }),
      deletedHuntZoneIds: DELETED_HUNT_ZONE_IDS.slice(),
      playerSpawn: PLAYER_SPAWN ? { x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y, z: PLAYER_SPAWN.z } : null,
      // не экспортируем customProps, помеченные удалёнными как world/mesh, и динамические эффекты игрока
      customProps: CUSTOM_PROPS.filter(function (p) {
        if (!p) return false;
        var id = String(p.id || '');
        var name = String(p.name || '');
        if (id === 'named_player_aura' || id === 'player_aura' || name === 'player_aura' || id.indexOf('player_aura') !== -1) return false;
        var key = normalizeWorldKey(p.editorKey || p.id || '');
        if (isMeshDeleted(id) || isMeshDeleted(p.editorKey) || isMeshDeleted(p.finger)) return false;
        if (key && isWorldObjectDeleted(key)) return false;
        return true;
      }).map(function (p) { return JSON.parse(JSON.stringify(p)); }),
      // BSP brushes (add/sub solids with textures)
      bspBrushes: BSP_BRUSHES.filter(function (b) {
        return !!(b && b.id);
      }).map(function (b) { return JSON.parse(JSON.stringify(b)); }),
      buildSites: listBuildSites().map(function (s) { return JSON.parse(JSON.stringify(s)); }),
      deletedBuildSiteIds: DELETED_BUILD_SITE_IDS.slice(),
      groundMarks: listGroundMarks().map(function (s) { return JSON.parse(JSON.stringify(s)); }),
      deletedGroundMarkIds: DELETED_GROUND_MARK_IDS.slice(),
      // F2 weapon grip (pos/rot/worldLen) — survives relog when saved to disk
      weaponGrips: weaponGrips || undefined,
      windSettings: (typeof window !== 'undefined' && window.WindSystem && typeof window.WindSystem.saveSettings === 'function')
        ? window.WindSystem.saveSettings()
        : (typeof window !== 'undefined' && window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.windSettings ? window.EDITOR_OVERRIDES_DATA.windSettings : undefined)
    };
  }

  function setPlayerSpawn(x, y, z) {
    PLAYER_SPAWN = { x: x, y: y || 0, z: z };
    return PLAYER_SPAWN;
  }
  function getPlayerSpawn() { return PLAYER_SPAWN; }

  function buildCustomProps() {
    // Полный clone: finger / geoVerts / editorKey / bind обязательны для редактора
    return CUSTOM_PROPS.map(function (p) {
      return JSON.parse(JSON.stringify(p));
    });
  }

  // Загрузка: window.EDITOR_OVERRIDES_DATA с диска (PLAN 4.7 — без LS-мира).
  // Fallback localStorage только если скрипт оверрайдов не загрузился.
  try {
    if (typeof window !== 'undefined' && window.EDITOR_OVERRIDES_DATA) {
      applyEditorOverrides(window.EDITOR_OVERRIDES_DATA);
      console.log('[WorldMetrics] editor overrides applied, customProps=', CUSTOM_PROPS.length);
    } else if (typeof localStorage !== 'undefined') {
      var saved = localStorage.getItem('project_steam_editor_overrides');
      if (saved) {
        applyEditorOverrides(JSON.parse(saved));
        console.log('[WorldMetrics] editor overrides from localStorage, customProps=', CUSTOM_PROPS.length);
      }
    }
  } catch (e) {
    console.warn('[WorldMetrics] Не удалось прочитать editor_overrides:', e);
  }

  return {
    get W() { return W; },
    get H() { return H; },
    get MIN_X() { return MIN_X; },
    get MAX_X() { return MAX_X; },
    get MIN_Z() { return MIN_Z; },
    get MAX_Z() { return MAX_Z; },
    get SEA() { return SEA; },
    applyBounds:applyBounds,
    wx:wx, wz:wz, islandMask:islandMask,
    roadMask:roadMask, riverMask:riverMask, rockMask:rockMask, mountainField:mountainField,
    buildRegions:buildRegions, regionAt:regionAt, invalidateRegionCache:invalidateRegionCache,
    rebuildMobSpotsFromEditor:rebuildMobSpotsFromEditor,
    buildCityNPCs:buildCityNPCs, buildRegionNPCs:buildRegionNPCs,
    buildSpots:buildSpots, buildTeleports:buildTeleports, buildDungeonAnchors:buildDungeonAnchors,
    buildBridges:buildBridges,
    buildRivers:buildRivers, buildRoads:buildRoads, buildLakes:buildLakes,
    buildHuntZones:buildHuntZones, huntZoneAt:huntZoneAt,
    addHuntZone:addHuntZone, updateHuntZone:updateHuntZone, markHuntZoneDeleted:markHuntZoneDeleted,
    worldBounds:worldBounds, REGIONS_RAW:REGIONS,
    get CITY_NPCS() { return CITY_NPCS; },
    set CITY_NPCS(v) { CITY_NPCS = Array.isArray(v) ? v : []; },
    get REGION_NPCS() { return REGION_NPCS; },
    set REGION_NPCS(v) { REGION_NPCS = Array.isArray(v) ? v : []; },
    get MOB_SPOTS() { return MOB_SPOTS; },
    set MOB_SPOTS(v) { MOB_SPOTS = Array.isArray(v) ? v : []; },
    get HUNT_ZONES() { return HUNT_ZONES; },
    set HUNT_ZONES(v) { HUNT_ZONES = Array.isArray(v) ? v : []; },
    applyEditorOverrides:applyEditorOverrides, exportEditorOverrides:exportEditorOverrides,
    buildCustomProps:buildCustomProps,
    get CUSTOM_PROPS() { return CUSTOM_PROPS; },
    set CUSTOM_PROPS(v) { CUSTOM_PROPS = Array.isArray(v) ? v : []; },
    get BSP_BRUSHES() { return BSP_BRUSHES; },
    set BSP_BRUSHES(v) { BSP_BRUSHES = Array.isArray(v) ? v : []; },
    get BUILD_SITES() { return BUILD_SITES; },
    set BUILD_SITES(v) { BUILD_SITES = Array.isArray(v) ? v : []; },
    get GROUND_MARKS() { return GROUND_MARKS; },
    set GROUND_MARKS(v) { GROUND_MARKS = Array.isArray(v) ? v : []; },
    addBuildSite:addBuildSite, updateBuildSite:updateBuildSite,
    markBuildSiteDeleted:markBuildSiteDeleted, listBuildSites:listBuildSites,
    addGroundMark:addGroundMark, markGroundMarkDeleted:markGroundMarkDeleted, listGroundMarks:listGroundMarks,
    setPlayerSpawn:setPlayerSpawn, getPlayerSpawn:getPlayerSpawn,
    markNpcDeleted:markNpcDeleted, markMobSpotDeleted:markMobSpotDeleted,
    isNpcDeleted:isNpcDeleted, isMobSpotDeleted:isMobSpotDeleted,
    markWorldObjectDeleted:markWorldObjectDeleted, isWorldObjectDeleted:isWorldObjectDeleted,
    markMeshDeleted:markMeshDeleted, isMeshDeleted:isMeshDeleted,
    isProtectedWorldKey:isProtectedWorldKey, normalizeWorldKey:normalizeWorldKey,
    get DELETED_NPC_IDS() { return DELETED_NPC_IDS; },
    set DELETED_NPC_IDS(v) { DELETED_NPC_IDS = Array.isArray(v) ? v : []; },
    get DELETED_MOB_SPOT_IDXS() { return DELETED_MOB_SPOT_IDXS; },
    set DELETED_MOB_SPOT_IDXS(v) { DELETED_MOB_SPOT_IDXS = Array.isArray(v) ? v : []; },
    get DELETED_WORLD_KEYS() { return DELETED_WORLD_KEYS; },
    set DELETED_WORLD_KEYS(v) { DELETED_WORLD_KEYS = Array.isArray(v) ? v : []; },
    get DELETED_MESH_IDS() { return DELETED_MESH_IDS; },
    set DELETED_MESH_IDS(v) { DELETED_MESH_IDS = Array.isArray(v) ? v : []; },
    get DELETED_HUNT_ZONE_IDS() { return DELETED_HUNT_ZONE_IDS; },
    set DELETED_HUNT_ZONE_IDS(v) { DELETED_HUNT_ZONE_IDS = Array.isArray(v) ? v : []; },
    get DELETED_BUILD_SITE_IDS() { return DELETED_BUILD_SITE_IDS; },
    set DELETED_BUILD_SITE_IDS(v) { DELETED_BUILD_SITE_IDS = Array.isArray(v) ? v : []; },
    get DELETED_GROUND_MARK_IDS() { return DELETED_GROUND_MARK_IDS; },
    set DELETED_GROUND_MARK_IDS(v) { DELETED_GROUND_MARK_IDS = Array.isArray(v) ? v : []; },
    get PLAYER_SPAWN() { return PLAYER_SPAWN; },
    set PLAYER_SPAWN(v) { PLAYER_SPAWN = v; }
  };
});