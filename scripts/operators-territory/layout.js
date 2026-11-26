#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT.JS
//  Территория операторов: Бастион с открытым интерьером + многоуровневая
//  каменная площадь на террасах + Мемориальная терраса с Монументом Героя +
//  стимпанк-котельная с паропроводами + тренировочный полигон (L2 дух).
//
//  Запуск:  node scripts/operators-territory/layout.js          (запись + запекание)
//           node scripts/operators-territory/layout.js --dry    (только отчёт)
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'kit-manifest.json'), 'utf8'));
const ITCH = JSON.parse(fs.readFileSync(path.join(__dirname, 'itch-manifest.json'), 'utf8'));
const PIECES = Object.assign({}, KIT.pieces, ITCH.pieces);
const DRY = process.argv.includes('--dry');

// ---- рельеф: тот же индекс меша, что у клиента и сервера ----
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
globalThis.TerrainData = win.TerrainData;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
function ground(x, z) {
  const y = TH.groundY(x, z, 600, 1200);
  if (y == null || !isFinite(y)) throw new Error('нет земли под ' + x.toFixed(1) + ',' + z.toFixed(1));
  return y;
}

let _seed = 20261126;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rr(a, b) { return a + (b - a) * rnd(); }

const NAMES = {
  opt_bastion: 'Бастион операторов',
  opt_plaza_deck: 'Терраса каменной площади',
  opt_plaza_deck_cracked: 'Разбитая плита террасы',
  opt_plaza_deck_scorched: 'Выжженная плита террасы',
  opt_plaza_deck_edge: 'Руинный край террасы',
  opt_plaza_steps: 'Лестница каменной площади',
  opt_bastion_parapet: 'Крепостной парапет',
  opt_banner_wall: 'Настенный стяг операторов',
  opt_column: 'Колонна (руины)',
  opt_column_broken: 'Сломанная колонна',
  opt_column_stump: 'Обрубок колонны',
  opt_column_fallen: 'Упавшая колонна',
  opt_arch: 'Арка-руина',
  opt_ruin_long: 'Руина стены',
  opt_ruin_corner: 'Угол руины',
  opt_debris: 'Обломки кладки',
  opt_block: 'Блок кладки',
  opt_slab: 'Плиты мощения',
  opt_hero_monument: 'Монумент Героя',
  opt_lamp: 'Паровой фонарь операторов',
  opt_park_fountain: 'Сухой паровой фонтан',
  opt_park_bench: 'Парковая скамья',
  opt_park_bench_broken: 'Сломанная парковая скамья',
  opt_park_lamp: 'Кованый парковый фонарь',
  opt_park_lamp_bent: 'Погнутый парковый фонарь',
  opt_park_fence: 'Чугунная ограда парка',
  opt_park_fence_broken: 'Обрушенная секция ограды',
  opt_park_gate: 'Ворота Старого парка',
  opt_park_pavilion: 'Музыкальный павильон',
  opt_park_greenhouse: 'Остов оранжереи',
  opt_park_flowerbed: 'Одичавшая клумба',
  opt_park_clock: 'Остановившиеся парковые часы',
  opt_park_urn: 'Каменный вазон',
  opt_river_culvert: 'Прорванный водовод',
  opt_river_footbridge: 'Мостик через Ржавый ручей',
  opt_bridge_stone: 'Большой каменный мост'
};
for (const [k, v] of Object.entries(ITCH.pieces)) {
  NAMES[k] = v.nameRu || k;
}

const DIST_CLASS = {
  opt_bastion: 'building', opt_plaza_deck: 'building',
  opt_plaza_deck_cracked: 'building', opt_plaza_deck_scorched: 'building',
  opt_plaza_deck_edge: 'building', opt_plaza_steps: 'prop', opt_gate_steps: 'prop',
  opt_bastion_parapet: 'prop', opt_banner_wall: 'prop', opt_pennant_wall: 'prop', opt_banner_hang: 'prop',
  opt_column: 'prop', opt_column_broken: 'prop',
  opt_arch: 'prop', opt_ruin_long: 'prop', opt_ruin_corner: 'prop',
  opt_ruin_tower: 'building', opt_ruin_bridge: 'building', opt_ruin_gear_wreck: 'prop', opt_ruin_crater: 'prop',
  opt_ruin_gate_pylon: 'building', opt_ruin_viaduct_east: 'building', opt_ruin_foundry_shell: 'building',
  opt_ruin_wall_breach: 'building', opt_ruin_wall_buttress: 'building', opt_ruin_wall_colonnade: 'building',
  opt_ruin_crane_wreck: 'building', opt_ruin_boiler_wreck: 'prop',
  opt_ruin_rubble_a: 'doodad', opt_ruin_rubble_b: 'doodad',
  opt_ruin_smokestack: 'building', opt_ruin_vault_arch: 'building', opt_ruin_barracks_corner: 'building',
  opt_ruin_aqueduct_pier: 'building', opt_ruin_turbine_pit: 'building', opt_ruin_watchpost: 'building',
  opt_ruin_bastion_prow: 'building', opt_ruin_pipe_tangle: 'building', opt_ruin_archway_fallen: 'prop',
  opt_plaza_breach: 'prop', opt_heavy_workbench: 'prop', opt_heavy_anvil: 'prop',
  opt_steam_grinder: 'prop', opt_cargo_pallet: 'prop',
  opt_wreck_steam_wagon: 'prop', opt_wreck_caisson: 'prop',
  opt_dead_tree_a: 'prop', opt_dead_tree_b: 'prop',
  opt_boulder_s: 'prop', opt_boulder_m: 'prop', opt_boulder_l: 'prop',
  opt_hero_monument: 'prop', opt_cannon: 'prop',
  opt_boiler_station: 'building', opt_steam_wheel: 'prop',
  opt_steam_boiler_tower: 'building', opt_steam_dynamo: 'building', opt_steam_cistern: 'building',
  opt_forge_hearth: 'prop', opt_steam_brazier: 'doodad', opt_copper_tanks: 'doodad',
  opt_pipe_bridge_east: 'building', opt_pipe_wall_manifold: 'prop',
  opt_pipe_ground_riser: 'prop', opt_pipe_arch_ground: 'building',
  opt_park_fountain: 'building', opt_park_pavilion: 'building', opt_park_greenhouse: 'building',
  opt_park_gate: 'building', opt_river_culvert: 'building', opt_river_footbridge: 'building',
  opt_park_clock: 'prop', opt_park_lamp: 'prop', opt_park_lamp_bent: 'prop',
  opt_park_fence: 'prop', opt_park_fence_broken: 'prop',
  opt_park_bench: 'doodad', opt_park_bench_broken: 'doodad', opt_park_flowerbed: 'doodad', opt_park_urn: 'doodad',
  opt_bridge_stone: 'building'
};

// Глубина вкапывания пропсов на естественном склоне: исключает зависание на уклоне и открытые цоколи
const SINK = {
  opt_column: 0.28, opt_column_broken: 0.28, opt_column_stump: 0.25, opt_column_fallen: 0.24,
  opt_arch: 0.40, opt_ruin_long: 0.55, opt_ruin_corner: 0.48,
  opt_ruin_tower: 0.65, opt_ruin_bridge: 0.72, opt_ruin_gear_wreck: 0.52, opt_ruin_crater: 0.28,
  opt_ruin_gate_pylon: 0.55, opt_ruin_viaduct_east: 0.55, opt_ruin_foundry_shell: 0.78,
  opt_ruin_wall_breach: 0.55, opt_ruin_wall_buttress: 0.50, opt_ruin_wall_colonnade: 0.50,
  opt_ruin_crane_wreck: 0.48, opt_ruin_boiler_wreck: 0.58,
  opt_ruin_rubble_a: 0.24, opt_ruin_rubble_b: 0.24, opt_plaza_breach: 0.04,
  opt_heavy_workbench: 0.02, opt_heavy_anvil: 0.02, opt_steam_grinder: 0.02, opt_cargo_pallet: 0.02,
  opt_wreck_steam_wagon: 0.22, opt_wreck_caisson: 0.22,
  opt_ruin_smokestack: 0.65, opt_ruin_vault_arch: 0.60, opt_ruin_barracks_corner: 0.58,
  opt_ruin_aqueduct_pier: 0.65, opt_ruin_turbine_pit: 0.45, opt_ruin_watchpost: 0.60,
  opt_ruin_bastion_prow: 0.60, opt_ruin_pipe_tangle: 0.38, opt_ruin_archway_fallen: 0.14,
  opt_dead_tree_a: 0.42, opt_dead_tree_b: 0.42,
  opt_boulder_s: 0.46, opt_boulder_m: 0.62, opt_boulder_l: 0.80,
  opt_signpost: 0.28, opt_debris: 0.22, opt_block: 0.22,
  opt_slab: 0.24, opt_hero_monument: 0.20, opt_lamp: 0.18,
  opt_rubble_pile: 0.20,
  opt_steam_boiler_tower: 0.55, opt_steam_dynamo: 0.45, opt_steam_cistern: 0.55,
  opt_forge_hearth: 0.40, opt_steam_brazier: 0.18, opt_copper_tanks: 0.16,
  opt_pipe_bridge_east: 0.45, opt_pipe_wall_manifold: 0.16,
  opt_pipe_ground_riser: 0.48, opt_pipe_arch_ground: 0.65,
  opt_park_fountain: 0.10, opt_park_bench: 0.03, opt_park_bench_broken: 0.03,
  opt_park_lamp: 0.10, opt_park_lamp_bent: 0.10, opt_park_fence: 0.06, opt_park_fence_broken: 0.06,
  opt_park_gate: 0.12, opt_park_pavilion: 0.02, opt_park_greenhouse: 0.10, opt_park_flowerbed: 0.10,
  opt_park_clock: 0.06, opt_park_urn: 0.05, opt_river_culvert: 0.45
};
const CYLINDER = new Set(['opt_column', 'opt_column_broken', 'opt_column_stump', 'opt_lamp', 'opt_hero_monument',
  'opt_dummy', 'opt_bookstand',
  'opt_steam_boiler_tower', 'opt_steam_cistern', 'opt_pipe_ground_riser',
  'opt_ruin_smokestack', 'opt_ruin_aqueduct_pier', 'opt_ruin_turbine_pit',
  'opt_dead_tree_a', 'opt_dead_tree_b', 'opt_boulder_s', 'opt_boulder_m', 'opt_boulder_l', 'opt_signpost', 'opt_ruin_gear_wreck']);

const props = [];
const report = { pieces: {}, colliders: 0, foliage: 0, interior: 0, camp: 0, banners: 0, steampunk: 0 };
const counters = {};

// ---- Глобальный 2D SAT OBB-контроль занятости (0 объектов в объектах!) ----
const OCCUPIED = [];
const FOLIAGE_FOOTPRINT_HALF = {
  tree01: 1.65, tree02: 1.65, tree05: 1.65, tree060: 1.65, tree063: 1.65, tree066: 1.65,
  tree073: 1.65, tree075: 1.65,
  dead_tree_rt_1: 1.90, dead_tree_rt_2: 1.90,
  forest_Log_1: 2.55, forest_Log_2: 1.75,
  forest_Stump_1: 2.25, forest_Stump_2: 1.85,
  bush01: 1.45, bush02: 1.45, bush04: 1.45, BlueberryBush: 1.50,
  retro_bush4_spring1: 1.50, retro_bush3_spring3: 1.50, retro_bush8_summer: 1.50,
  retro_bush1_fall: 1.50, retro_bush02: 1.50,
  Fern: 0.90, grass_bush: 0.55, grass03: 0.45, grass04: 0.45, grass05: 0.45, grass08: 0.45,
  matted_pratia_b: 0.55, matted_pratia_c: 0.55, matted_pratia_d: 0.45, matted_pratia_f: 0.45,
  matted_pratia_g: 0.45, matted_pratia_h: 0.45, field_poppy_e: 0.45, field_poppy_f: 0.45
};
const PIPE_PIECES = new Set(['opt_pipe_bridge_east', 'opt_pipe_wall_manifold', 'opt_pipe_ground_riser']);
const FLOOR_PIECES = new Set([
  'opt_bastion', 'opt_plaza_deck', 'opt_plaza_deck_cracked', 'opt_plaza_deck_scorched',
  'opt_plaza_deck_edge', 'opt_plaza_steps', 'opt_gate_steps', 'opt_camp_rug',
  'opt_banner_wall', 'opt_pennant_wall', 'opt_banner_hang', 'opt_chandelier', 'opt_lantern_indoor',
  // остов оранжереи: внутри растёт зелень, стенки цоколя layout-park.js кладёт в карту занятости сам
  'opt_park_greenhouse'
]);
function obbOverlap(ax, az, ahx, ahz, ary, bx, bz, bhx, bhz, bry, gap) {
  const g = gap || 0;
  const hxA = ahx + g * 0.5, hzA = ahz + g * 0.5;
  const hxB = bhx + g * 0.5, hzB = bhz + g * 0.5;
  const maxR = Math.hypot(hxA, hzA) + Math.hypot(hxB, hzB);
  const dx = bx - ax, dz = bz - az;
  if (dx * dx + dz * dz > maxR * maxR) return false;
  const ca = Math.cos(ary), sa = Math.sin(ary);
  const cb = Math.cos(bry), sb = Math.sin(bry);
  const axX = ca, axZ = -sa, azX = sa, azZ = ca;
  const bxX = cb, bxZ = -sb, bzX = sb, bzZ = cb;
  const axes = [
    [axX, axZ], [azX, azZ],
    [bxX, bxZ], [bzX, bzZ]
  ];
  for (let i = 0; i < 4; i++) {
    const ux = axes[i][0], uz = axes[i][1];
    const dist = Math.abs(dx * ux + dz * uz);
    const rA = hxA * Math.abs(axX * ux + axZ * uz) + hzA * Math.abs(azX * ux + azZ * uz);
    const rB = hxB * Math.abs(bxX * ux + bxZ * uz) + hzB * Math.abs(bzX * ux + bzZ * uz);
    if (dist >= rA + rB) return false;
  }
  return true;
}
function shouldCheckLayers(layerA, layerB, sameContext) {
  if (layerA === 'FLOOR' || layerB === 'FLOOR') return false;
  // Декоративная трава/цветы могут расти слегка рядом, но не внутри твёрдых объектов/дороги/стволов
  if (layerA === 'GROUNDCOVER' && layerB === 'GROUNDCOVER') return false;
  // На самой террасе паропроводы намеренно входят в цоколи и котлы; проверяем их только против прочего!
  if (sameContext === 'pipe' && (layerA === 'PIPE' || layerB === 'PIPE') && layerA !== 'ROAD' && layerB !== 'ROAD') return false;
  return true;
}
function canOccupyAt(x, z, hx, hz, rotY, layer, opt) {
  opt = opt || {};
  const gap = opt.gap != null ? opt.gap : 0.45;
  for (let i = 0; i < OCCUPIED.length; i++) {
    const o = OCCUPIED[i];
    if (!shouldCheckLayers(layer, o.layer, opt.context)) continue;
    if (o.group && opt.ignoreGroup && o.group === opt.ignoreGroup) continue;
    const useGap = (layer === 'GROUNDCOVER' || o.layer === 'GROUNDCOVER') ? Math.min(gap, 0.20) : gap;
    if (obbOverlap(x, z, hx, hz, rotY, o.x, o.z, o.hx, o.hz, o.ry, useGap)) return false;
  }
  return true;
}
function registerOccupy(id, layer, x, z, hx, hz, ry, extra) {
  OCCUPIED.push(Object.assign({ id, layer, x, z, hx, hz, ry }, extra || {}));
}

function nextId(piece) {
  // WorldMetrics.normalizeWorldKey treats any id with substring 'wall'/'terrain'/'water' as a deleted world system layer!
  const safeKey = String(piece).replace(/wall/gi, 'masonry').replace(/mountain|volcano|terrain|water/gi, 'site');
  counters[safeKey] = (counters[safeKey] || 0) + 1;
  return safeKey + '_' + String(counters[safeKey]).padStart(2, '0');
}

// three.js Ry(θ): локальные (x, z) → мир
function rotXZ(lx, lz, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

function addEntryAndColliders(piece, x, y, z, rotY, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const id = opt.id || nextId(piece);
  const p = {
    id: id,
    name: NAMES[piece] || piece,
    type: 'prop',
    meshType: 'glb',
    modelId: piece,
    modelFile: m.file,
    category: opt.category || m.category || 'ruins',
    position: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
    scale: { x: s, y: s, z: s },
    instanced: true,
    distClass: DIST_CLASS[piece] || 'doodad',
    drawDist: opt.drawDist || m.drawDist || 220,
    lodDist: m.lodDist || [35, 90]
  };
  if (m.shadow === false || opt.shadow === false) p.castShadow = false;
  const cols = opt.noCollision ? [] : (m.colliders || []);
  if (cols.length === 1) {
    const c = cols[0];
    p.collision = true;
    p.collisionShape = c.shape || (CYLINDER.has(piece) ? 'cylinder' : 'box');
    p.collisionSize = { x: +(c.w * s).toFixed(3), y: +(c.h * s).toFixed(3), z: +(c.d * s).toFixed(3) };
    p.collisionOffset = { x: +(c.x * s).toFixed(3), y: +(c.y0 * s).toFixed(3), z: +(c.z * s).toFixed(3) };
    if (c.walkable) { p.walkable = true; p.isWalkableSurface = true; }
  } else {
    p.collision = false;
  }
  props.push(p);
  if (cols.length > 1) {
    cols.forEach((c, i) => {
      const o = rotXZ(c.x * s, c.z * s, rotY);
      const colP = {
        id: id + '_col' + (i + 1),
        name: 'Коллизия: ' + (NAMES[piece] || piece),
        type: 'prop',
        meshType: 'collision_box',
        position: { x: +(x + o.x).toFixed(3), y: +(y + c.y0 * s).toFixed(3), z: +(z + o.z).toFixed(3) },
        rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        collision: true,
        collisionShape: c.shape || 'box',
        collisionSize: { x: +(c.w * s).toFixed(3), y: +(c.h * s).toFixed(3), z: +(c.d * s).toFixed(3) },
        collisionOffset: { x: 0, y: 0, z: 0 }
      };
      if (c.walkable) {
        colP.walkable = true;
        colP.isWalkableSurface = true;
      }
      props.push(colP);
      report.colliders++;
    });
  } else if (cols.length === 1) {
    report.colliders++;
  }
  const layer = FLOOR_PIECES.has(piece)
    ? 'FLOOR'
    : (piece === 'opt_slab' ? 'ROAD' : (PIPE_PIECES.has(piece) ? 'PIPE' : 'SOLID'));
  if (layer !== 'FLOOR') {
    const shrink = opt.footprintMul || (piece === 'opt_ruin_crater' ? 0.85 : 0.94);
    const hx = (m.size[0] * s * 0.5) * shrink;
    const hz = (m.size[2] * s * 0.5) * shrink;
    registerOccupy(id, layer, x, z, hx, hz, rotY, { piece, isValley: !!opt.isValley, isOnDeck: !!opt.isOnDeck });
  }
  report.pieces[piece] = (report.pieces[piece] || 0) + 1;
  return p;
}

/** Единая монолитная проходимая плита-коллайдер для всей каменной террасы (без швов между плитками 8×8 м!). */
function addWalkableSlabL(id, lx, lz, w, d, topY, thickness, rotOffset) {
  const wPos = W(lx, lz);
  const botY = topY - thickness;
  props.push({
    id,
    name: 'Коллизия террасы: ' + id,
    type: 'prop',
    meshType: 'collision_box',
    position: { x: +wPos.x.toFixed(3), y: +botY.toFixed(3), z: +wPos.z.toFixed(3) },
    rotation: { x: 0, y: +(TH0 + (rotOffset || 0)).toFixed(5), z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    collision: true,
    collisionShape: 'box',
    collisionSize: { x: +w.toFixed(3), y: +thickness.toFixed(3), z: +d.toFixed(3) },
    collisionOffset: { x: 0, y: 0, z: 0 },
    walkable: true,
    isWalkableSurface: true
  });
  report.colliders++;
}

const GROUND_PROP_IDS = new Set();
const DECK_PROP_CHECKS = [];

/** Поставить объект кита на естественный рельеф с учётом уклона (y = gMin - sink). */
function put(piece, x, z, rotY, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const hw = m.size[0] * s / 2, hd = m.size[2] * s / 2;
  const samples = [];
  for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = rotXZ(a * hw, b * hd, rotY);
    samples.push(ground(x + o.x, z + o.z));
  }
  const gMin = Math.min(...samples), gMax = Math.max(...samples);
  let y;
  if (piece === 'opt_bastion') {
    y = gMax - 1.30;
    if (gMin < y + 0.05) {
      throw new Error('бастион: перепад рельефа под цоколем ' + (gMax - gMin).toFixed(2) + ' м');
    }
  } else {
    y = gMin - (opt.sink != null ? opt.sink : (SINK[piece] != null ? SINK[piece] : 0.12));
  }
  const res = addEntryAndColliders(piece, x, y, z, rotY, opt);
  GROUND_PROP_IDS.add(res.id);
  return res;
}

const VILLAGE = { x: -120, z: -160 };
const C = { x: 305, z: 125 };
const TH0 = Math.atan2(VILLAGE.x - C.x, VILLAGE.z - C.z); // фасад (+Z модели) смотрит к деревне
function W(lx, lz) { const o = rotXZ(lx, lz, TH0); return { x: C.x + o.x, z: C.z + o.z }; }

function putL(piece, lx, lz, drot, opt) {
  const w = W(lx, lz);
  report.camp++;
  return put(piece, w.x, w.z, TH0 + (drot || 0), opt);
}

/** Поставить объект строго на ровную отметку (каменная терраса / пол) — 0 мм перекоса и проваливания! */
function putOn(piece, lx, lz, surfaceY, drot, opt) {
  opt = Object.assign({ isOnDeck: true }, opt || {});
  if (opt.steampunk && opt.context == null) opt.context = 'pipe';
  const w = W(lx, lz);
  const y = surfaceY + (opt.dy || 0);
  if (opt.steampunk) report.steampunk++;
  else report.camp++;
  const res = addEntryAndColliders(piece, w.x, y, w.z, TH0 + (drot || 0), opt);
  DECK_PROP_CHECKS.push({ id: res.id, piece, lx, lz, y: surfaceY, drot: drot || 0, scale: opt.scale || 1 });
  return res;
}

/**
 * Закрепить консольный стяг (opt_banner_hang) вплотную к телу колонны/пилона:
 * Пивот opt_banner_hang центрирован по X (половина ширины = 0.927 м). Кронштейн на -X торце;
 * при Ry(outAngle) локальный +X направлен на (cos(outAngle), -sin(outAngle)).
 * Сдвиг на (surfaceRadius + halfW - 0.14) в сторону наружу вгоняет стальную скобу на 14 см в камень!
 */
function mountCantileverBanner(cx, cyBase, cz, heightY, surfaceRadius, outAngle) {
  const halfW = (PIECES.opt_banner_hang.size[0] || 1.855) * 0.5;
  const dist = surfaceRadius + halfW - 0.14;
  const bx = cx + Math.cos(outAngle) * dist;
  const bz = cz - Math.sin(outAngle) * dist;
  report.banners++;
  return addEntryAndColliders('opt_banner_hang', bx, cyBase + heightY, bz, outAngle, { noCollision: true, shadow: false });
}

function mountWallBannerOnLocalWall(lx, lz, wallY, faceDrot, wallOutwardPush, pieceName) {
  const push = wallOutwardPush != null ? wallOutwardPush : 0.12;
  const n = rotXZ(0, push, TH0 + faceDrot);
  const w = W(lx, lz);
  report.banners++;
  return addEntryAndColliders(pieceName || 'opt_banner_wall', w.x + n.x, wallY, w.z + n.z, TH0 + faceDrot, { noCollision: true, shadow: false });
}

function mountPennantOnLocalWall(lx, lz, wallY, faceDrot, wallOutwardPush) {
  return mountWallBannerOnLocalWall(lx, lz, wallY, faceDrot, wallOutwardPush != null ? wallOutwardPush : 0.11, 'opt_pennant_wall');
}

// ---- повторное использование палаток из мира (0 байт к релизу) ----
function putWorldTent(kind, x, z, rotY) {
  const isT2 = kind === 'tent_02';
  const sc = isT2 ? 0.0449 : 0.0389;
  const hw = 1.9, hd = 1.9;
  let gy = ground(x, z);
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const o = rotXZ(ax * hw, az * hd, rotY);
    gy = Math.min(gy, ground(x + o.x, z + o.z));
  }
  const id = 'opt_camp_' + kind + '_' + String((counters[kind] = (counters[kind] || 0) + 1)).padStart(2, '0');
  props.push({
    id,
    name: isT2 ? 'Лагерная палатка штаба' : 'Лагерная палатка снабжения',
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: kind + '.fbx',
    category: 'tents',
    position: { x: +x.toFixed(3), y: +(gy - 0.18).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
    scale: { x: sc, y: sc, z: sc },
    instanced: true,
    distClass: 'prop',
    collision: true,
    collisionShape: 'box',
    collisionSize: { x: 3.8, y: 3.4, z: 3.8 },
    collisionOffset: { x: 0, y: 0, z: 0 }
  });
  report.camp++;
  report.colliders++;
  registerOccupy(id, 'SOLID', x, z, 2.05, 2.05, rotY, { piece: kind, isValley: true });
}

// ---- зелень из уже размещённых в мире моделей (0 байт к весу билда!) ----
const FOLIAGE = {
  bush01: { file: 'bush01.fbx', scale: 0.43, name: 'Кустарник №1 (Растительность)' },
  bush02: { file: 'bush02.fbx', scale: 0.41, name: 'Кустарник №2 (Растительность)' },
  bush04: { file: 'bush04.fbx', scale: 0.34, name: 'Кустарник №4 (Растительность)' },
  retro_bush4_spring1: { file: 'retro_bush4_spring1.fbx', scale: 0.0245, name: 'Пышный куст весна №4 (Растительность)' },
  retro_bush3_spring3: { file: 'retro_bush3_spring3.fbx', scale: 0.0245, name: 'Пышный куст весна №3 (Растительность)' },
  retro_bush8_summer:  { file: 'retro_bush8_summer.fbx',  scale: 0.025,  name: 'Пышный куст лето №8 (Растительность)' },
  retro_bush1_fall:    { file: 'retro_bush1_fall.fbx',    scale: 0.024,  name: 'Куст осенний №1 (Растительность)' },
  retro_bush02:        { file: 'retro_bush02.fbx',        scale: 0.034,  name: 'Ретро куст №02 (Растительность)' },
  tree060: { file: 'tree060.fbx', scale: 0.049, name: 'Ретро дерево №060 (Растительность)' },
  tree063: { file: 'tree063.fbx', scale: 0.045, name: 'Ретро дерево №063 (Растительность)' },
  tree066: { file: 'tree066.fbx', scale: 0.029, name: 'Ретро дерево №066 (Растительность)' },
  tree073: { file: 'tree073.fbx', scale: 0.050, name: 'Ретро дерево №073 (Растительность)' },
  tree075: { file: 'tree075.fbx', scale: 0.048, name: 'Ретро дерево №075 (Растительность)' },
  tree01:  { file: 'tree01.fbx',  scale: 1.22,  name: 'Лесное дерево №1 (Растительность)' },
  tree02:  { file: 'tree02.fbx',  scale: 1.38,  name: 'Лесное дерево №2 (Растительность)' },
  tree05:  { file: 'tree05.fbx',  scale: 1.21,  name: 'Лесное дерево №5 (Растительность)' },
  matted_pratia_b: { file: 'matted_pratia_b.fbx', scale: 0.068, name: 'Пратия стелющаяся B (Растительность)' },
  matted_pratia_c: { file: 'matted_pratia_c.fbx', scale: 0.104, name: 'Пратия стелющаяся C (Растительность)' },
  matted_pratia_d: { file: 'matted_pratia_d.fbx', scale: 0.036, name: 'Пратия стелющаяся D (Растительность)' },
  matted_pratia_f: { file: 'matted_pratia_f.fbx', scale: 0.035, name: 'Пратия стелющаяся F (Растительность)' },
  matted_pratia_g: { file: 'matted_pratia_g.fbx', scale: 0.046, name: 'Пратия стелющаяся G (Растительность)' },
  matted_pratia_h: { file: 'matted_pratia_h.fbx', scale: 0.035, name: 'Пратия стелющаяся H (Растительность)' },
  field_poppy_e:   { file: 'field_poppy_e.fbx',   scale: 0.018, name: 'Мак полевой E (Растительность)' },
  field_poppy_f:   { file: 'field_poppy_f.fbx',   scale: 0.019, name: 'Мак полевой F (Растительность)' },
  grass03: { file: 'grass03.fbx', scale: 0.020, name: 'Трава лесная №3 (Растительность)' },
  grass04: { file: 'grass04.fbx', scale: 0.021, name: 'Трава лесная №4 (Растительность)' },
  grass05: { file: 'grass05.fbx', scale: 0.020, name: 'Трава лесная №5 (Растительность)' },
  grass08: { file: 'grass08.fbx', scale: 0.020, name: 'Трава лесная №8 (Растительность)' },
  grass_bush: { file: 'grass_bush.fbx', scale: 0.020, name: 'Травяной куст (Растительность)' },
  Fern: { file: 'Fern.fbx', scale: 1.76, name: 'Папоротник лесной (Растительность)' },
  BlueberryBush: { file: 'BlueberryBush.fbx', scale: 2.35, name: 'Черничный куст (Растительность)' },
  dead_tree_rt_1: { file: 'dead_tree_rt_1.fbx', scale: 2.28, name: 'Сухое древо №1 (Растительность)' },
  dead_tree_rt_2: { file: 'dead_tree_rt_2.fbx', scale: 4.10, name: 'Сухое древо №2 (Растительность)' },
  forest_Log_1: { file: 'Log_1.fbx', scale: 3.35, name: 'Поваленное бревно №1 (Растительность)' },
  forest_Log_2: { file: 'Log_2.fbx', scale: 1.80, name: 'Поваленное бревно №2 (Растительность)' },
  forest_Stump_1: { file: 'Stump_1.fbx', scale: 4.50, name: 'Пень №1 (Растительность)' },
  forest_Stump_2: { file: 'Stump_2.fbx', scale: 3.20, name: 'Пень №2 (Растительность)' }
};
// Только полноразмерные ассеты Blender L2/Steampunk и крупные пропсы (кукольный bazaar/*.glb полностью удалён!).

let foliageN = 0;
function plant(kind, x, z, opt) {
  opt = opt || {};
  const f = FOLIAGE[kind];
  const sm = opt.scaleMul || rr(0.85, 1.15);
  const k = f.scale * sm;
  const rHalf = (FOLIAGE_FOOTPRINT_HALF[kind] || 1.2) * sm;
  const isGc = /^(grass|matted_pratia|field_poppy)/i.test(kind);
  // asGroundcover: зелень внутри объекта-«пола» (грядки оранжереи) — не участвует в проверке твёрдых
  const layer = (isGc || opt.asGroundcover) ? 'GROUNDCOVER' : 'FOLIAGE';
  let y = opt.y != null ? opt.y : ground(x, z);
  if (opt.y == null && (kind === 'forest_Log_1' || kind === 'forest_Log_2' || kind === 'forest_Stump_1' || kind === 'forest_Stump_2')) {
    // Поваленные брёвна длинные (~3 м): берём минимум рельефа в радиусе 1.4 м и заглубляем, чтобы не висели над склоном!
    y = Math.min(y, ground(x - 1.3, z), ground(x + 1.3, z), ground(x, z - 1.3), ground(x, z + 1.3)) - (kind.startsWith('forest_Log') ? 0.28 : 0.34);
  } else if (opt.sink) {
    y -= opt.sink;
  }
  const id = 'foliage_optt_' + kind + '_' + String(++foliageN).padStart(3, '0');
  const ry = +(opt.rotY != null ? opt.rotY : rr(0, Math.PI * 2)).toFixed(4);
  props.push({
    id,
    name: f.name.replace(/ \(Растительность\)$/, ''),
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: f.file,
    // точность до сантиметра/тысячной: мир компактнее (запечённый world.json грузит каждый клиент)
    position: { x: +x.toFixed(2), y: +y.toFixed(3), z: +z.toFixed(2) },
    rotation: { x: +(opt.rx != null ? opt.rx : rr(-0.04, 0.04)).toFixed(3), y: +(+ry).toFixed(3), z: +(opt.rz != null ? opt.rz : rr(-0.04, 0.04)).toFixed(3) },
    scale: { x: +k.toPrecision(4), y: +k.toPrecision(4), z: +k.toPrecision(4) },
    isFoliage: true
  });
  registerOccupy(id, layer, x, z, rHalf, rHalf, ry, { piece: kind, isFoliage: true });
  report.foliage++;
}

// ============================================================
//  1. БАСТИОН ОПЕРАТОРОВ (проходимая 6-ступенчатая лестница + зал + интерьер)
// ============================================================
const bastion = put('opt_bastion', C.x, C.z, TH0, { id: 'opt_bastion' });
const BASTION_SHIFT_Y = (KIT.pieces.opt_bastion.anchorShift && KIT.pieces.opt_bastion.anchorShift[1]) || 0;
const BASTION_ANCHOR_SHIFT_Z = (KIT.pieces.opt_bastion.anchorShift && KIT.pieces.opt_bastion.anchorShift[2]) || 0;
// Бастион y0=0.22 (anchorShift[1]=-0.22), поэтому пол зала (PLINTH_TOP=2.50) находится ровно на bastion.y + 2.72 м!
const FLOOR_Y = bastion.position.y + 2.720;
const DAIS_Y = bastion.position.y + 3.020;

function inBastionLZ(cy_bl) { return -cy_bl - BASTION_ANCHOR_SHIFT_Z; }
function putIn(piece, bx, cy_bl, drot, opt) {
  opt = opt || {};
  const lz = inBastionLZ(cy_bl);
  const w = W(bx, lz);
  const baseY = (opt.onDais ? DAIS_Y : FLOOR_Y) + (opt.dy || 0);
  report.interior++;
  return addEntryAndColliders(piece, w.x, baseY, w.z, TH0 + (drot || 0), opt);
}

// Ковры и подиум Командора (стол вынесен вперёд на cy_bl=+7.05 — Вальтер на +8.31 стоит чётко на полу за столом!)
putIn('opt_camp_rug', 0.0, -3.5, 0, { scale: 1.0, shadow: false });
putIn('opt_camp_rug', 0.0, +2.6, 0, { scale: 1.0, shadow: false });
putIn('opt_table_long', 0.0, +7.05, 0, { onDais: true });
putIn('opt_chair', -1.85, +7.10, +Math.PI / 2, { onDais: true });
putIn('opt_chair', +1.85, +7.10, -Math.PI / 2, { onDais: true });
putIn('opt_chair', -1.60, +8.45, +0.25, { onDais: true });
putIn('opt_chair', +1.60, +8.45, -0.25, { onDais: true });
putIn('opt_bookstand', -2.75, +7.65, 0.25, { onDais: true });
putIn('opt_chest', -3.7, +10.2, 0.2, { onDais: true });
// Вымпелы ВНУТРИ зала — строгие багровые без повторных гербов (герб за Командором — только 1 центральный в Бастионе!)
mountPennantOnLocalWall(-3.2, inBastionLZ(11.82), FLOOR_Y + 3.0, 0, 0.14);
mountPennantOnLocalWall(+3.2, inBastionLZ(11.82), FLOOR_Y + 3.0, 0, 0.14);
mountPennantOnLocalWall(-7.22, inBastionLZ(-2.5), FLOOR_Y + 3.2, +Math.PI / 2, 0.12);
mountPennantOnLocalWall(+7.22, inBastionLZ(-2.5), FLOOR_Y + 3.2, -Math.PI / 2, 0.12);

// Левое крыло (Наставник Гард — bx=-4.2, cy_bl=-2.2)
putIn('opt_bookcase', -6.9, -3.6, Math.PI / 2);
putIn('opt_bookcase', -6.9, +2.0, Math.PI / 2);
putIn('opt_weapon_rack', -6.5, +5.2, Math.PI / 2);
putIn('opt_weapon_rack_b', -6.6, -6.4, Math.PI / 2);
putIn('opt_table_long', -4.4, +1.8, Math.PI / 2);
putIn('opt_bench_camp', -3.0, +1.8, Math.PI / 2);
putIn('opt_bench_camp', -5.7, +1.8, -Math.PI / 2);
putIn('opt_dummy', -4.9, +5.2, 0.45);
putIn('opt_chest', -6.3, -7.8, Math.PI * 0.25);

// Правое крыло (Квартирмейстер Брон — bx=+4.2, cy_bl=-1.2): тяжёлый верстак, паллеты и медные паровые баллоны
putIn('opt_heavy_workbench', +6.4, -3.2, -Math.PI / 2);
putIn('opt_cabinet', +6.9, +2.2, -Math.PI / 2);
putIn('opt_weapon_rack', +6.5, +5.2, -Math.PI / 2);
putIn('opt_cargo_pallet', +6.2, -6.6, 0.15);
putIn('opt_cargo_pallet', +6.0, +7.5, -0.25);
putIn('opt_copper_tanks', +4.8, +10.5, -0.25, { steampunk: true });

// Внутреннее освещение зала (крыша Бастиона полностью чистая — без кровельных турбин!)
putIn('opt_chandelier', 0.0, -3.8, 0, { dy: 6.2, noCollision: true });
putIn('opt_chandelier', 0.0, +3.2, 0, { dy: 6.2, noCollision: true });
for (const side of [-1, 1]) {
  for (const cy_bl of [-5.5, +0.5, +6.5]) {
    putIn('opt_lantern_indoor', side * 6.95, cy_bl, side < 0 ? Math.PI / 2 : -Math.PI / 2, { dy: 3.4, noCollision: true });
  }
}

// Строгие багровые вымпелы СНАРУЖИ Бастиона (никакого спама гербами — 1 центральный герб над порталом!)
mountPennantOnLocalWall(-10.6, inBastionLZ(-14.12), FLOOR_Y + 3.2, 0, 0.11);
mountPennantOnLocalWall(+10.6, inBastionLZ(-14.12), FLOOR_Y + 3.2, 0, 0.11);
mountPennantOnLocalWall(-6.5, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.11);
mountPennantOnLocalWall(+6.5, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.11);

// ============================================================
//  2. РАЗРУШЕННАЯ КАМЕННАЯ ПЛОЩАДЬ НА ТЕРРАСАХ (хаос, проломы, 0 z-fighting!)
// ============================================================
const T1_TOP = +(bastion.position.y + 1.180).toFixed(3);  // ~87.65 м (ступень 0 бастиона на +0.19 м выше)
const MEM_TOP = +(T1_TOP + 0.900).toFixed(3);             // ~88.55 м (Мемориальная терраса Монумента Героя +0.90 м)
const T2_TOP = +(T1_TOP - 0.900).toFixed(3);              // ~86.75 м (Нижняя площадь входа к воротам)

// 2.1. Верхняя площадь Tier 1: lx ∈ [-24..+24], lz ∈ [17.2..49.2]
// Поверхность террас усеяна трещинами и следами взрывов при сплошной твёрдой основе (0 щелей!)
const T1_TILES = [
  [-20, 21.2, 'opt_plaza_deck_cracked', 0],
  [-12, 21.2, 'opt_plaza_deck_scorched', 0],
  [ -4, 21.2, 'opt_plaza_deck', 0],
  [ +4, 21.2, 'opt_plaza_deck', 0],
  [+12, 21.2, 'opt_plaza_deck_cracked', 0],
  [+20, 21.2, 'opt_plaza_deck_scorched', Math.PI / 2],

  [-20, 29.2, 'opt_plaza_deck_cracked', Math.PI / 2],
  [-12, 29.2, 'opt_plaza_deck_scorched', 0],
  [ -4, 29.2, 'opt_plaza_deck_cracked', Math.PI / 2],
  [ +4, 29.2, 'opt_plaza_deck', Math.PI],
  [+12, 29.2, 'opt_plaza_deck_cracked', 0],
  [+20, 29.2, 'opt_plaza_deck_scorched', -Math.PI / 2],

  [-20, 37.2, 'opt_plaza_deck_scorched', 0],
  [-12, 37.2, 'opt_plaza_deck', 0],
  [ -4, 37.2, 'opt_plaza_deck_cracked', 0],
  [ +4, 37.2, 'opt_plaza_deck_cracked', Math.PI],
  [+12, 37.2, 'opt_plaza_deck_scorched', 0],
  [+20, 37.2, 'opt_plaza_deck_cracked', Math.PI / 2],

  [-12, 45.2, 'opt_plaza_deck_cracked', -Math.PI / 2],
  [ -4, 45.2, 'opt_plaza_deck_scorched', 0],
  [ +4, 45.2, 'opt_plaza_deck', 0],
  [+12, 45.2, 'opt_plaza_deck_cracked', Math.PI / 2]
];
for (const [lx, lz, kind, drot] of T1_TILES) {
  putOn(kind, lx, lz, T1_TOP - 1.80, drot, { noCollision: true, shadow: false });
}
// Коллайдер Tier 1 строго повторяет уцелевший контур без невидимых полок над обрушенными углами
addWalkableSlabL('opt_col_deck_t1n', 0, 29.2, 48.2, 24.2, T1_TOP, 2.2, 0);
addWalkableSlabL('opt_col_deck_t1s', 0, 45.2, 32.2, 8.2, T1_TOP, 2.2, 0);

// 2.2. Мемориальная терраса Монумента Героя: lx ∈ [-44..-28], lz ∈ [25.2..49.2]
const MEM_TILES = [
  [-40, 29.2, 'opt_plaza_deck_scorched', 0],
  [-32, 29.2, 'opt_plaza_deck_cracked', 0],
  [-40, 37.2, 'opt_plaza_deck_cracked', Math.PI / 2],
  [-32, 37.2, 'opt_plaza_deck', 0],
  [-40, 45.2, 'opt_plaza_deck_scorched', Math.PI],
  [-32, 45.2, 'opt_plaza_deck_cracked', 0]
];
for (const [lx, lz, kind, drot] of MEM_TILES) {
  putOn(kind, lx, lz, MEM_TOP - 1.80, drot, { noCollision: true, shadow: false });
}
addWalkableSlabL('opt_col_deck_mem', -36.0, 37.2, 16.2, 24.2, MEM_TOP, 2.4, 0);

// Широкая лестница [-28.1..-23.9] + Триумфальная арка между Tier 1 и Мемориальной террасой
putOn('opt_plaza_steps', -26.0, 37.2, MEM_TOP - 1.80, +Math.PI / 2, { shadow: false });
putOn('opt_arch', -28.4, 37.2, MEM_TOP - 0.12, +Math.PI / 2);

// 2.3. Нижняя площадь Tier 2: ступени [49.2..53.4], плиты [-12..+12, 52.7..68.7], спуск на рельеф на lz=70.8
// Юго-западный угол (-8, 64.7) выбит обстрелом; уцелевшие сектора полностью твёрдые!
putOn('opt_plaza_steps', 0, 51.3, T1_TOP - 1.80, 0, { shadow: false });
const T2_TILES = [
  [-8, 56.7, 'opt_plaza_deck_cracked', 0],
  [ 0, 56.7, 'opt_plaza_deck_scorched', 0],
  [+8, 56.7, 'opt_plaza_deck_cracked', Math.PI / 2],
  [ 0, 64.7, 'opt_plaza_deck_cracked', 0],
  [+8, 64.7, 'opt_plaza_deck_scorched', Math.PI]
];
for (const [lx, lz, kind, drot] of T2_TILES) {
  putOn(kind, lx, lz, T2_TOP - 1.80, drot, { noCollision: true, shadow: false });
}
addWalkableSlabL('opt_col_deck_t2n', 0, 56.7, 24.2, 8.2, T2_TOP, 2.2, 0);
addWalkableSlabL('opt_col_deck_t2s', +4.0, 64.7, 16.2, 8.2, T2_TOP, 2.2, 0);
// Взрывные проломы мостовой с перебитой медной магистралью и обрушившиеся перемычки арок (0 коллизий!)
putOn('opt_plaza_breach', +6.8, 28.8, T1_TOP - 0.02, 0.35);
putOn('opt_plaza_breach', -5.2, 41.2, T1_TOP - 0.02, -0.75);
putOn('opt_plaza_breach', +3.0, 44.2, T1_TOP - 0.02, 1.10);
putOn('opt_plaza_breach', -1.8, 34.0, T1_TOP - 0.02, 0.40);
putOn('opt_plaza_breach', +4.5, 58.2, T2_TOP - 0.02, -0.50);
putOn('opt_ruin_archway_fallen', +3.2, 35.8, T1_TOP - 0.02, 0.45);
putOn('opt_ruin_archway_fallen', +5.5, 62.5, T2_TOP - 0.02, -0.30);
// Полный заглублённый марш входных ступеней от грунта (84.8 м) через арку ровно до T2_TOP (верхняя ступень +2.60 м от базы меша)
const GATE_STEPS_LEN = (KIT.pieces.opt_gate_steps && KIT.pieces.opt_gate_steps.size && KIT.pieces.opt_gate_steps.size[2]) || 6.83;
putOn('opt_gate_steps', 0, +(68.7 + GATE_STEPS_LEN * 0.5 - 0.10).toFixed(3), T2_TOP - 2.600, 0, { shadow: false });

// Хаос и завалы в выбитых карманах площади + прорастающая трава (0 висящих и пересекающихся блоков!)
for (const [lx, lz, kindR, fLx, fLz, gLx, gLz] of [
  [-19.5, 45.2, 'opt_ruin_crater', -23.4, 46.8, -19.5, 48.2],
  [+19.8, 45.2, 'opt_ruin_crater', +23.8, 47.8, +23.2, 49.0],
  [-8.6,  64.6, 'opt_ruin_rubble_b', -11.4, 65.4, -10.8, 63.2]
]) {
  const wP = W(lx, lz);
  put(kindR, wP.x, wP.z, rr(0, Math.PI * 2), { sink: 0.30, scale: 0.88, noCollision: true });
  const wF = W(fLx, fLz), wG = W(gLx, gLz);
  plant('Fern', wF.x, wF.z, { scaleMul: 1.0 });
  plant('grass04', wG.x, wG.z);
}
// Следы обрушения восточной башни Бастиона — обломки у цоколя (без повторяющихся кубиков opt_block!)
putOn('opt_ruin_rubble_a', +14.2, 19.6, T1_TOP - 0.08, 0.7);
putL('opt_rubble_pile', +16.4, 12.0, 0.4, { scale: 1.15 });
putL('opt_debris', +17.5, 8.5, 1.9);

// 2.5. Порушенные крепостные парапеты с пробоинами (проломы укреплены стенами и мешками без коллизий!)
const PARAPET_DY = -1.48 + 0.14;
for (const lx of [-14, +14]) {
  putOn('opt_bastion_parapet', lx, 49.0, T1_TOP + PARAPET_DY, 0);
}
for (const lz of [20, 28, 40]) {
  putOn('opt_bastion_parapet', -23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
for (const lz of [20, 28, 36]) {
  putOn('opt_bastion_parapet', +23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
// Баррикады на месте выбитых секций южного и боковых парапетов Tier 1 (чистый развал, 0 пересечений!)
putOn('opt_ruin_rubble_b', -10.5, 48.0, T1_TOP - 0.04, 0.12, { scale: 0.88 });
putOn('opt_ruin_rubble_a', -18.2, 39.8, T1_TOP - 0.02, 0.25);
putOn('opt_rubble_pile',   -21.8, 24.4, T1_TOP - 0.02, -0.4);
putOn('opt_ruin_rubble_b', +9.8,  47.6, T1_TOP - 0.02, -0.2);
putOn('opt_cargo_pallet',  +6.2,  38.6, T1_TOP - 0.02, 0.15);
putOn('opt_debris',        +10.8, 37.8, T1_TOP - 0.02, 0.5);
// Парапеты на Мемориальной террасе (частично выбиты с западного и южного края)
for (const lx of [-42, -30]) {
  putOn('opt_bastion_parapet', lx, 25.4, MEM_TOP + PARAPET_DY, 0);
}
putOn('opt_bastion_parapet', -34, 49.0, MEM_TOP + PARAPET_DY, 0);
putOn('opt_bastion_parapet', -43.8, 29.4, MEM_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', -43.8, 43.4, MEM_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', -28.2, 28.0, MEM_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', -28.2, 47.0, MEM_TOP + PARAPET_DY, Math.PI / 2);
// Парапеты Tier 2 (обрывистые секции)
putOn('opt_bastion_parapet', -11.8, 54.7, T2_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', +11.8, 54.7, T2_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', +11.8, 62.7, T2_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', -11.8, 58.7, T2_TOP + PARAPET_DY, Math.PI / 2);

// Зелень, пробивающаяся сквозь трещины террас (только на краях и пробоинах, без помехи проходу!)
for (const [lx, lz, topY, fkind] of [
  [-22.8, 33.2, T1_TOP, 'grass05'], [+22.6, 33.4, T1_TOP, 'Fern'],
  [-11.2, 47.2, T1_TOP, 'grass03'], [+11.6, 47.2, T1_TOP, 'grass04'],
  [-39.2, 47.4, MEM_TOP, 'Fern'], [-35.8, 48.2, MEM_TOP, 'matted_pratia_b'],
  [+10.8, 67.2, T2_TOP, 'grass05'], [-10.9, 57.5, T2_TOP, 'grass03']
]) {
  const wf = W(lx, lz);
  plant(fkind, wf.x, wf.z, { y: topY - 0.04, scaleMul: 0.92 });
}

// ============================================================
//  3. КОЛОННЫ (УЦЕЛЕВШИЕ, СЛОМАННЫЕ, ОБРУБКИ И ПОВАЛЕННЫЕ) + СТЯГИ
// ============================================================
putOn('opt_lamp', -6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', -6.2, 47.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 47.6, T1_TOP, 0);

const AVENUE = [
  { lz: 25.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 33.5, deck: T1_TOP, L: 'opt_column_stump', R: 'opt_column', bL: false, bR: true },
  { lz: 42.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 57.5, deck: T2_TOP, L: 'opt_column_broken', R: 'opt_column_stump', bL: false, bR: false },
  { lz: 64.5, deck: T2_TOP, L: null, R: 'opt_column', bL: false, bR: true }
];
for (const row of AVENUE) {
  for (const [lx, kind, hasBanner, inwardAngle] of [
    [-8.5, row.L, row.bL, TH0],
    [+8.5, row.R, row.bR, TH0 + Math.PI]
  ]) {
    if (!kind) continue;
    const col = putOn(kind, lx, row.lz, row.deck, rr(-0.14, 0.14));
    if (hasBanner && kind === 'opt_column') {
      mountCantileverBanner(col.position.x, col.position.y, col.position.z, 4.35, 0.44, inwardAngle);
    }
  }
}
// Поваленные колонны возле выбитых карманов площади (лежат на грунте вне кратеров/осыпи, 0 коллизий!)
putL('opt_column_fallen', +19.2, 51.4, 0.42, { sink: 0.34 });
putL('opt_column_fallen', -7.8, 69.2, -0.55, { sink: 0.34 });

// ============================================================
//  4. МЕМОРИАЛЬНАЯ ПЛОЩАДЬ С МОНУМЕНТОМ ГЕРОЯ (lx ∈ [-44..-28])
// ============================================================
putOn('opt_hero_monument', -36.0, 37.2, MEM_TOP, +Math.PI / 2);
putOn('opt_lamp', -30.8, 32.2, MEM_TOP, 0);
putOn('opt_lamp', -30.8, 42.2, MEM_TOP, 0);
putOn('opt_lamp', -41.2, 32.2, MEM_TOP, 0);
putOn('opt_lamp', -41.2, 42.2, MEM_TOP, 0);

const MON_RING = [
  [-29.8, 28.6, 'opt_column', true],
  [-36.0, 27.6, 'opt_column_broken', false],
  [-42.2, 28.6, 'opt_column', true],
  [-42.6, 37.2, 'opt_column_stump', false],
  [-42.2, 45.8, 'opt_column_broken', false],
  [-36.0, 46.8, 'opt_column_stump', false],
  [-29.8, 45.8, 'opt_column', true]
];
for (const [lx, lz, kind, hasB] of MON_RING) {
  const cObj = putOn(kind, lx, lz, MEM_TOP, rr(-0.1, 0.1));
  if (hasB && kind === 'opt_column') {
    const wCol = W(lx, lz), wCen = W(-36.0, 37.2);
    const worldOut = Math.atan2(-(wCen.z - wCol.z), wCen.x - wCol.x);
    mountCantileverBanner(cObj.position.x, cObj.position.y, cObj.position.z, 4.35, 0.44, worldOut);
  }
}
putOn('opt_bookstand', -31.8, 34.2, MEM_TOP, -Math.PI / 2);
putOn('opt_bench_camp', -31.8, 30.0, MEM_TOP, 0);
putOn('opt_bench_camp', -31.8, 44.4, MEM_TOP, Math.PI);

// ============================================================
//  5. ТРЕНИРОВОЧНЫЙ ПОЛИГОН ОПЕРАТОРОВ (северо-западное крыло Tier 1; Сержант Руст у -10.5, 34)
// ============================================================
for (const lz of [24.2, 29.0, 33.8, 38.6]) {
  putOn('opt_dummy', -14.8, lz, T1_TOP, Math.PI * 0.5 + rr(-0.08, 0.08));
  putOn('opt_dummy', -19.6, lz, T1_TOP, Math.PI * 0.5 + rr(-0.08, 0.08));
}
putOn('opt_weapon_rack', -13.2, 20.6, T1_TOP, 0.08);
putOn('opt_weapon_rack_b', -16.6, 20.6, T1_TOP, -0.05);
putOn('opt_weapon_rack', -22.2, 31.8, T1_TOP, Math.PI * 0.5);
putOn('opt_bench_camp', -12.8, 42.2, T1_TOP, Math.PI * 0.5);
putOn('opt_bench_camp', -12.8, 46.2, T1_TOP, Math.PI * 0.5);
putOn('opt_steam_brazier', -12.5, 26.5, T1_TOP, 0.2, { steampunk: true });
putOn('opt_steam_brazier', -12.5, 44.5, T1_TOP, -0.4, { steampunk: true });

// ============================================================
//  6. УНИКАЛЬНЫЙ СТИМПАНК-ДВОР, ЧИСТЫЕ МЕДНЫЕ ТРУБЫ И КУЗНИЦА ОПЕРАТОРОВ
// ============================================================
// Уникальные машины восточной котельной (никаких розовых беседок и кровельных вентблоков!)
putOn('opt_boiler_station', +19.5, 22.0, T1_TOP, -Math.PI * 0.5, { steampunk: true });
putOn('opt_steam_boiler_tower', +11.6, 24.4, T1_TOP, 0.25, { steampunk: true });
putOn('opt_steam_cistern', +21.4, 27.6, T1_TOP, -0.25, { steampunk: true });
putOn('opt_steam_wheel', +14.6, 27.2, T1_TOP, Math.PI * 0.5, { steampunk: true });
putOn('opt_steam_dynamo', +14.8, 31.2, T1_TOP, 0.0, { steampunk: true });
putOn('opt_copper_tanks', +16.2, 20.4, T1_TOP, 0.0, { steampunk: true });

// Гладкие медные трубы из Blender (0 децимации!): соединяют башню котла, силовую и арку
putOn('opt_pipe_bridge_east', +16.4, 34.8, T1_TOP - 0.04, 0, { steampunk: true });
putOn('opt_pipe_wall_manifold', +15.4, 24.4, T1_TOP - 0.04, 0, { steampunk: true });
putOn('opt_pipe_wall_manifold', +19.6, 32.0, T1_TOP - 0.04, Math.PI / 2, { steampunk: true });
putOn('opt_pipe_ground_riser', +22.4, 22.0, T1_TOP - 0.04, Math.PI, { steampunk: true }); // +X(-lx) входит прямо в котёл!

// Полевая кузница и мастерская на твёрдой плите [+12/+20, 37.2] и [+12, 45.2] (крупноформатные индустриальные ассеты Л2)
putOn('opt_forge_hearth', +19.6, 39.2, T1_TOP, -Math.PI / 2, { steampunk: true });
putOn('opt_heavy_anvil', +13.6, 39.2, T1_TOP, -0.6);
putOn('opt_steam_grinder', +16.0, 38.6, T1_TOP, -1.2);
putOn('opt_heavy_workbench', +13.4, 42.4, T1_TOP, -Math.PI / 2);
putOn('opt_copper_tanks', +17.2, 37.2, T1_TOP, 0.4, { steampunk: true });
putOn('opt_steam_brazier', +12.8, 36.4, T1_TOP, 0.0, { steampunk: true });
putOn('opt_cargo_pallet', +12.8, 46.8, T1_TOP - 0.02, 0.25);
putOn('opt_copper_tanks', +15.0, 46.8, T1_TOP, -0.5, { steampunk: true });

// Двор Tier 2 (lz ∈ [52.7..68.7]): полевая стоянка, медь пара и пушка
putOn('opt_lamp', -10.2, 55.2, T2_TOP, 0);
putOn('opt_lamp', +10.2, 55.2, T2_TOP, 0);
putOn('opt_lamp', +10.2, 66.8, T2_TOP, 0);
putOn('opt_bench_camp', -9.8, 57.6, T2_TOP, Math.PI / 2);
putOn('opt_weapon_rack_b', -10.4, 53.8, T2_TOP, 0.1);
putOn('opt_cargo_pallet', -6.2, 55.0, T2_TOP, 0.12);
putOn('opt_ruin_rubble_b', -4.8, 58.8, T2_TOP - 0.02, 0.45);
putOn('opt_copper_tanks', +10.0, 58.6, T2_TOP, -Math.PI / 2, { steampunk: true });
putOn('opt_cargo_pallet', +8.8, 60.8, T2_TOP, -0.4);
putOn('opt_cannon', +6.8, 66.8, T2_TOP, -0.18);

// Палатки лагеря на грунте по флангам нижней площади
const campT2 = W(-21.0, 62.5);
putWorldTent('tent_02', campT2.x, campT2.z, TH0 + 0.55);
const campT3 = W(+21.5, 59.5);
putWorldTent('tent_03', campT3.x, campT3.z, TH0 - 0.65);

// ============================================================
//  7. ЮЖНЫЙ ВЫХОД ИЗ ЛАГЕРЯ, ПОДЗЕМНЫЕ МЕДНЫЕ МАГИСТРАЛИ И РАЗРЕЖЕННАЯ ТРОПА
// ============================================================
// Открытый широкий проём южной лестницы, обрамлённый пилоном ворот (слева) и контрфорсной руиной (справа)
putL('opt_lamp', -5.4, 78.2, 0);
putL('opt_lamp', +5.4, 78.2, 0);
putL('opt_ruin_gate_pylon', -9.2, 74.6, 0.04);
putL('opt_ruin_wall_buttress', +9.8, 74.2, -0.04);
putL('opt_cannon', -8.8, 79.4, 0.14);

// Подземно-стеновые вводы BioShock: медные стояки в стены террас/бастиона + врытые U-арки в грунт
putL('opt_pipe_ground_riser', +10.2, -12.9, Math.PI, { steampunk: true, sink: 0.48 });
putL('opt_pipe_ground_riser', +26.4, 22.0, Math.PI, { steampunk: true, sink: 0.48 });
putL('opt_pipe_ground_riser', +14.0, 57.5, Math.PI, { steampunk: true, sink: 0.52 });
putL('opt_pipe_ground_riser', -14.0, 57.5, 0, { steampunk: true, sink: 0.52 });
putL('opt_pipe_arch_ground', +28.8, 25.5, Math.PI / 2, { steampunk: true, sink: 0.68 });
putL('opt_pipe_arch_ground', +28.2, 43.5, Math.PI / 2, { steampunk: true, sink: 0.68 });
putL('opt_pipe_arch_ground', -48.5, 22.5, 0.35, { steampunk: true, sink: 0.68 });
putL('opt_pipe_wall_manifold', +28.5, 34.5, Math.PI / 2, { steampunk: true, sink: 0.14 });
put('opt_pipe_arch_ground', 202, 148, 0.72, { steampunk: true, sink: 0.70 });

// Разреженная тропа лагеря: от выхода арки в поле (дороги острова рисует автор — их раскладка не трогает)
const ROAD_TILES = [];
function placeSparseTrail(pts, stepDist, gapModulo) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const segLen = Math.hypot(x1 - x0, z1 - z0);
    const dir = Math.atan2(x1 - x0, z1 - z0);
    const nx = Math.cos(dir), nz = -Math.sin(dir);
    const nSteps = Math.max(1, Math.floor(segLen / stepDist));
    for (let k = 0; k < nSteps; k++) {
      const idx = ROAD_TILES.length;
      const t = (k + 0.5) / nSteps;
      const wx = x0 + (x1 - x0) * t + nx * rr(-0.45, 0.45);
      const wz = z0 + (z1 - z0) * t + nz * rr(-0.45, 0.45);
      if (isWorldInsideComplex(wx, wz)) continue;
      ROAD_TILES.push({ x: wx, z: wz, dir });
      if (gapModulo && idx % gapModulo === gapModulo - 1) continue; // земляные проплешины — никакой сплошной «ограды» из плит!
      put('opt_slab', wx, wz, dir + rr(-0.24, 0.24), { sink: 0.24, noCollision: true });
    }
  }
}
// Главная западная/юго-западная тропа от выхода арки (242, 83) в открытую долину к воротам Деревни
placeSparseTrail([[240, 84], [233, 96], [225, 112], [216, 130], [204, 148], [189, 163], [172, 174], [156, 182]], 5.6, 4);
// Короткое ответвление наружу в восточную/южную долину охоты (строго по локальному +lx/+lz, прочь от комплекса!)
const e1 = W(12, 82), e2 = W(24, 92), e3 = W(38, 102);
placeSparseTrail([[e1.x, e1.z], [e2.x, e2.z], [e3.x, e3.z]], 6.2, 3);
// Фонари и указатели вдоль разреженной тропы
put('opt_signpost', 238, 88, TH0 - 0.55);
put('opt_signpost', 202, 152, TH0 + 2.3);
put('opt_lamp', 228, 106, 0);
put('opt_lamp', 194, 158, 0);

// Короткая техническая отсыпка к восточной котельной (4 разреженных плиты вне трубных магистралей!)
for (const lz of [15, 22, 30, 38]) {
  putL('opt_slab', +33.4 + rr(-0.25, 0.25), lz, Math.PI * 0.5 + rr(-0.18, 0.18), { sink: 0.22, noCollision: true });
}

// Уникальные не повторяющиеся секции разрушенного периметра базы операторов (без клонирования стен!)
putL('opt_ruin_wall_breach', -48, 34, Math.PI / 2 + 0.05);
putL('opt_ruin_wall_colonnade', -18, -39, 0.04);
putL('opt_ruin_wall_colonnade', +22, -38, -0.05);
putL('opt_ruin_corner', -46, -37, Math.PI);

// Вынесена выше, чтобы и тропы, и руины 100% уважали границы комплекса!
function worldToLocal(wx, wz) {
  const dx = wx - C.x, dz = wz - C.z;
  const c = Math.cos(TH0), s = Math.sin(TH0);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
function insideTerraces(lx, lz) { return lx > -50 && lx < 28 && lz > -28 && lz < 78; }
function isWorldInsideComplex(wx, wz) {
  const { lx, lz } = worldToLocal(wx, wz);
  return insideTerraces(lx, lz);
}

// ============================================================
//  7b. ОКРЕСТНОСТИ ПО ДОРОГАМ АВТОРА: МОСТ, БЫВШИЙ ПАРК, БЕРЕГА РЕКИ (layout-park.js)
//  Ставится ДО окрестностей: руины и лес ниже обходят дороги (road-mask.json), парк, мост и воду.
// ============================================================
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const MDB = require(path.join(ROOT, 'shared', 'mob-db.js'));
globalThis.MOB_DB = MDB;
const editorFile = path.join(ROOT, 'shared', 'editor-overrides.json');
const curOverrides = JSON.parse(fs.readFileSync(editorFile, 'utf8'));
// Регистрируем предсуществующие сторонние объекты зоны (если есть) в OCCUPIED до расстановки долины и леса
for (const ep of (curOverrides.customProps || [])) {
  if (!ep || !ep.position || /^opt_/.test(ep.id) || /^foliage_optt_/.test(ep.id) || /_col\d+$/.test(ep.id)) continue;
  const ex = ep.position.x, ez = ep.position.z;
  if (ex < 110 || ex > 390 || ez < -10 || ez > 250) continue;
  const cs = ep.collisionSize;
  const hx = cs ? Math.max(0.8, cs.x * 0.5) : 1.5;
  const hz = cs ? Math.max(0.8, cs.z * 0.5) : 1.5;
  registerOccupy(ep.id, 'SOLID', ex, ez, hx, hz, (ep.rotation && ep.rotation.y) || 0, { external: true });
}
// Споты мобов зоны — новые тематические участки (layout-park.js SPOTS); пропсы не встают в их центры
const PARK_MOD = require(path.join(__dirname, 'layout-park.js'));
const OP_SPOT_POINTS = PARK_MOD.SPOTS.map(([idx, mob, x, z]) => ({ idx, mob, x, z }));
function isNearOpSpot(wx, wz, minR) {
  const r = minR || 8.5;
  for (const s of OP_SPOT_POINTS) {
    if (Math.hypot(wx - s.x, wz - s.z) < r) return true;
  }
  return false;
}
const PARK = PARK_MOD({
  PIECES, put, addEntryAndColliders, plant, canOccupyAt, registerOccupy, ground, report,
  isNearOpSpot, FOLIAGE, FOLIAGE_FOOTPRINT_HALF,
  nearTrail: (x, z, r) => ROAD_TILES.some(rt => Math.hypot(x - rt.x, z - rt.z) < r)
});
console.log('[layout] окрестности: твёрдых ' + PARK.placed.solid + ', зелени ' + PARK.placed.foliage + ', травы ' + PARK.placed.gc +
  ' | мосты ' + JSON.stringify(PARK.bridgeInfo) + ' | перепад павильона ' + PARK.pavilionDrop + ' м');

function tryLand(wx, wz, pad) {
  const y = TH.groundY(wx, wz, 600, 1200);
  return y != null && isFinite(y) && y > 45 && !isNearOpSpot(wx, wz, pad || 8.5) && !PARK.blockScatter(wx, wz);
}

// ============================================================
//  8. РАЗРУШЕННЫЙ МИР В ОКРЕСТНОСТЯХ: УНИКАЛЬНЫЕ ОБЪЕКТЫ BLENDER, ОБОЗЫ И СКАЛЫ
//  (Никакого спама одинаковыми стенами/кубами/сводами; проверка спотов мобов!)
// ============================================================

function findClearSpot(cx, cz, hx, hz, rotY, layer, opt) {
  opt = opt || {};
  const maxRing = opt.maxSearch != null ? opt.maxSearch : 24;
  const stepR = opt.stepR || 1.6;
  const gap = opt.gap != null ? opt.gap : 0.65;
  const pad = opt.pad != null ? opt.pad : 7.5;
  const requireOutside = opt.outsideComplex !== false;
  for (let r = 0; r <= maxRing + 0.01; r += stepR) {
    const nAng = r < 0.01 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 2.2));
    const a0 = r > 0 ? ((Math.round(r * 10) % 7) * 0.45) : 0;
    for (let k = 0; k < nAng; k++) {
      const a = a0 + (k * Math.PI * 2) / nAng;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      if (requireOutside && isWorldInsideComplex(px, pz)) continue;
      if (!tryLand(px, pz, pad)) continue;
      if (opt.minCenterDist && Math.hypot(px - C.x, pz - C.z) < opt.minCenterDist) continue;
      if (opt.avoidRoad && isNearRoadSlab(px, pz, opt.avoidRoad)) continue;
      if (!canOccupyAt(px, pz, hx, hz, rotY, layer, { gap })) continue;
      return { x: px, z: pz };
    }
  }
  return null;
}

function placeValleyProp(piece, x, z, rotY, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const hx = m.size[0] * s * 0.5;
  const hz = m.size[2] * s * 0.5;
  const spot = findClearSpot(x, z, hx, hz, rotY, 'SOLID', {
    pad: opt.pad != null ? opt.pad : 7.5,
    gap: opt.gap != null ? opt.gap : 0.75,
    maxSearch: opt.maxSearch != null ? opt.maxSearch : 22,
    avoidRoad: opt.avoidRoad != null ? opt.avoidRoad : (Math.max(hx, hz) + 1.8),
    outsideComplex: true
  });
  if (!spot) return null;
  return put(piece, spot.x, spot.z, rotY, Object.assign({ isValley: true }, opt));
}

function plantClear(kind, x, z, opt) {
  opt = opt || {};
  const sm = opt.scaleMul || rr(0.85, 1.15);
  const rHalf = (FOLIAGE_FOOTPRINT_HALF[kind] || 1.2) * sm;
  const isGc = /^(grass|matted_pratia|field_poppy)/i.test(kind);
  const isLargeForest = /^(tree|dead_tree|forest_)/i.test(kind);
  const layer = isGc ? 'GROUNDCOVER' : 'FOLIAGE';
  const gap = opt.gap != null ? opt.gap : (isGc ? 0.30 : (isLargeForest ? 1.15 : 0.70));
  const spot = findClearSpot(x, z, rHalf, rHalf, 0, layer, {
    pad: opt.pad != null ? opt.pad : (isGc ? 3.2 : 5.2),
    gap,
    maxSearch: opt.maxSearch != null ? opt.maxSearch : 14,
    avoidRoad: opt.avoidRoad != null ? opt.avoidRoad : (isGc ? 2.1 : rHalf + 2.2),
    outsideComplex: true,
    minCenterDist: opt.minCenterDist || 0
  });
  if (!spot) return false;
  plant(kind, spot.x, spot.z, Object.assign({}, opt, { scaleMul: sm }));
  return true;
}

// 8.1. Единичные монументальные доминанты окрестностей (0 пересечений, строгий расчёт OBB!)
for (const [piece, lx, lz, rot, pad, opt] of [
  ['opt_ruin_tower',          -35, -22, 0.25, 9, {}],
  ['opt_ruin_foundry_shell',  +33, -18, -Math.PI * 0.42, 9.5, { sink: 0.78 }],
  ['opt_ruin_viaduct_east',   +42, +44, Math.PI * 0.48, 10, { sink: 0.55 }],
  ['opt_ruin_wall_breach',    -36, +73, 0.14, 8.5, {}],
  ['opt_ruin_crane_wreck',    -22, +92, 0.55, 8.5, {}],
  ['opt_ruin_boiler_wreck',   +34, +72, -0.45, 8.0, { sink: 0.58 }],
  ['opt_ruin_gear_wreck',     +32, +10, -0.80, 8.5, {}],
  ['opt_ruin_crater',         -54, +24, -0.40, 7.5, { noCollision: true }],
  ['opt_ruin_vault_arch',     -58, +52, 0.42, 9.0, { sink: 0.55 }],
  ['opt_ruin_barracks_corner',-14, -52, -0.25, 9.0, { sink: 0.55 }],
  ['opt_ruin_smokestack',     +50, +24, -0.90, 8.5, { sink: 0.65 }],
  ['opt_ruin_aqueduct_pier',  -44, +66, -0.60, 8.5, { sink: 0.65 }],
  ['opt_ruin_turbine_pit',    +52, +64, 1.10, 8.5, { sink: 0.45 }],
  ['opt_ruin_watchpost',      +24, +104, 0.35, 8.5, { sink: 0.60 }],
  ['opt_ruin_bastion_prow',   -22, +112, -0.55, 8.5, { sink: 0.60 }],
  ['opt_ruin_pipe_tangle',    +26, +92, -0.30, 7.5, { sink: 0.38 }],
  ['opt_ruin_archway_fallen', -18, +100, 0.50, 6.5, { noCollision: true }]
]) {
  const w = W(lx, lz);
  placeValleyProp(piece, w.x, w.z, TH0 + rot, Object.assign({ pad }, opt));
}
// opt_ruin_bridge больше не стоит на сухом склоне: старый мост рухнул в «Ржавый ручей» (layout-park.js)
const wSouthEastCorner = W(+38, 72);
placeValleyProp('opt_ruin_corner', wSouthEastCorner.x, wSouthEastCorner.z, TH0, { pad: 6.5 });
// Завалы и разнообразная осыпь вокруг уникальных ориентиров (без коллизий и пересечений!)
for (const [piece, lx, lz, rot] of [
  ['opt_ruin_rubble_a', -46, +72, 0.6],
  ['opt_ruin_rubble_b', +28, -28, 1.4],
  ['opt_ruin_rubble_a', +24, +96, -0.9],
  ['opt_ruin_rubble_b', -28, +104, 2.1],
  ['opt_rubble_pile',   -62, +16, 0.4],
  ['opt_debris',        +52, +22, 2.2]
]) {
  const w = W(lx, lz);
  placeValleyProp(piece, w.x, w.z, TH0 + rot, { pad: 6.5 });
}

// Полузасыпанный древний монумент «Шестерня» из библиотеки на востоке (стимпанк-руина, 1 draw call)
const wheelSpot = findClearSpot(258, 72, 2.3, 1.4, 0.85, 'SOLID', { pad: 9.5, gap: 0.8, avoidRoad: 4.5, outsideComplex: true });
if (wheelSpot) {
  props.push({
    id: 'opt_wheel_monument_ruin',
    name: 'Древнее колесо механизма (руины)',
    type: 'prop',
    meshType: 'fbx',
    modelId: 'monument_wheel',
    modelFile: 'monument_wheel.fbx',
    category: 'ruins',
    position: { x: +wheelSpot.x.toFixed(3), y: +(ground(wheelSpot.x, wheelSpot.z) - 1.35).toFixed(3), z: +wheelSpot.z.toFixed(3) },
    rotation: { x: 0.16, y: 0.85, z: -0.22 },
    scale: { x: 0.068, y: 0.068, z: 0.068 },
    instanced: true,
    distClass: 'prop',
    collision: true,
    collisionShape: 'box',
    collisionSize: { x: 4.5, y: 6.0, z: 2.0 },
    collisionOffset: { x: 0, y: 0, z: 0 }
  });
  registerOccupy('opt_wheel_monument_ruin', 'SOLID', wheelSpot.x, wheelSpot.z, 2.3, 1.4, 0.85, { isValley: true });
  report.colliders++;
}

// 8.3. Брошенные обозы, колёса и указатели вокруг входа и развилки (разнесены с запасом >= 5 м!)
for (const [kind, lx, lz, drot] of [
  ['opt_wreck_steam_wagon', -14.0, +94.5, 0.5], ['opt_cargo_pallet', +10.5, +89, -0.8],
  ['opt_wreck_caisson', -7.2, +96.0, 0.4], ['opt_cargo_pallet', +9.4, +85.5, -0.5],
  ['opt_ruin_long', -17.0, +104, 0.2], ['opt_ruin_wall_buttress', +18.5, +102, -0.7]
]) {
  const w = W(lx, lz);
  placeValleyProp(kind, w.x, w.z, TH0 + drot, { pad: 6.5 });
}

// Разброс уцелевших фрагментов на западном склоне к дороге из деревни (без повторов opt_block и пересечений!)
const FIELD = [
  ['opt_column_broken', 190, 122], ['opt_column_stump', 176, 141], ['opt_column', 201, 168],
  ['opt_column_stump', 166, 176], ['opt_debris', 185, 150], ['opt_rubble_pile', 206, 135],
  ['opt_ruin_wall_colonnade', 172, 108], ['opt_ruin_corner', 214, 186], ['opt_column_fallen', 186, 191],
  ['opt_ruin_rubble_a', 180, 165], ['opt_debris', 195, 112],
  ['opt_ruin_rubble_b', 238, 214], ['opt_column_broken', 231, 208], ['opt_column_stump', 245, 219]
];
// россыпь фрагментов по полю убрана: руины собраны в участки (layout-park.js — хутор, акведук, промзона)
void FIELD;

// 8.4. Реалистичные гранитные валуны и скальные гряды (спутники ставятся рядом с основным валуном, без наложения!)
const BOULDER_SPOTS = [
  [-62, -34, 'opt_boulder_l'], [-46, -54, 'opt_boulder_m'], [+2, -58, 'opt_boulder_l'],
  [+46, -46, 'opt_boulder_m'], [+58, -16, 'opt_boulder_l'], [+60, +24, 'opt_boulder_m'],
  [+56, +62, 'opt_boulder_l'], [-64, -6, 'opt_boulder_m'], [-68, +30, 'opt_boulder_l'],
  [-60, +66, 'opt_boulder_m'], [-38, +98, 'opt_boulder_l'], [+40, +94, 'opt_boulder_m'],
  [+26, +126, 'opt_boulder_l'], [-28, +132, 'opt_boulder_m']
];
BOULDER_SPOTS.forEach(([lx, lz, kind]) => {
  const w = W(lx + rr(-2, 2), lz + rr(-2, 2));
  const mainScale = rr(0.82, 1.18);
  const placed = placeValleyProp(kind, w.x, w.z, rr(0, 6.28), { scale: mainScale, pad: 9.5, gap: 0.7 });
  if (!placed) return;
  const ang = rr(0, Math.PI * 2), dist = rr(5.0, 6.8);
  placeValleyProp('opt_boulder_s', placed.position.x + Math.cos(ang) * dist, placed.position.z + Math.sin(ang) * dist, rr(0, 6.28), { scale: rr(0.75, 1.15), pad: 7.5, gap: 0.55 });
});
for (const [wx, wz, kind] of [[198, 134, 'opt_boulder_m'], [178, 158, 'opt_boulder_l'], [248, 128, 'opt_boulder_m'], [280, 118, 'opt_boulder_s']]) {
  placeValleyProp(kind, wx, wz, rr(0, 6.28), { scale: rr(0.85, 1.1), pad: 7.5 });
}

// ============================================================
//  9. КОНТРАСТ РАЗРУШЕННОГО МИРА И БУЙНОЙ ПРИРОДЫ В ОКРЕСТНОСТЯХ
// ============================================================
function isNearRoadSlab(wx, wz, padR) {
  const r = padR != null ? padR : 4.2;
  for (const rt of ROAD_TILES) if (Math.hypot(wx - rt.x, wz - rt.z) < r) return true;
  // дороги автора (маска road-mask.json): ни пропсов, ни деревьев, ни кустов
  return PARK.nearRoad(wx, wz, r);
}
// Строго чёткие HD деревья 512x512 (удалены пиксельные tree073/tree075!)
// Смешанные породы (каталог библиотеки): лиственные, хвойные, светлая листва — не одно и то же дерево
const TREES = ['tree107', 'tree01', 'tree113', 'tree_rt_3', 'tree118', 'tree02', 'tree097', 'tree055', 'tree_rt_4', 'tree05', 'tree110', 'tree061'];
const BUSHES = ['bush01', 'bush02', 'bush04', 'BlueberryBush', 'retro_bush4_spring1', 'retro_bush3_spring3', 'retro_bush8_summer', 'retro_bush1_fall', 'retro_bush02'];
// Сухие корявые деревья и пни рядом с воронками и разрушенными окраинами (с проверкой OCCUPIED!)
const DEAD_TREE_SPOTS = [
  [-24, -36], [+34, -34], [-58, +22], [+46, +32], [-28, +98], [+26, +106],
  [-48, +126], [+38, +134], [-72, +74], [+64, +54], [+52, -32], [-70, -14]
];
DEAD_TREE_SPOTS.forEach(([lx, lz], idx) => {
  const w = W(lx + rr(-2, 2), lz + rr(-2, 2));
  placeValleyProp(idx % 2 === 0 ? 'opt_dead_tree_a' : 'opt_dead_tree_b', w.x, w.z, rr(0, 6.28), { scale: rr(0.75, 1.05), pad: 7.5, gap: 0.9 });
});

// Широкие лесные массивы в окрестностях (0 деревьев/кустов в стенах, руинах и тележках!)
const TREE_RINGS = [
  [-56, -44], [-42, -48], [-18, -50], [+8, -50], [+32, -46], [+48, -38],
  [+46, -12], [+46, +12], [+44, +34], [+46, +58], [+40, +74],
  [-54, -18], [-55, +6], [-56, +32], [-56, +56], [-46, +76], [-32, +90], [+30, +90],
  [-74, -28], [-76, +18], [-78, +62], [+66, -24], [+68, +26], [+64, +72], [-44, -68], [+24, -66]
];
TREE_RINGS.forEach(([lx, lz], idx) => {
  const w = W(lx + rr(-2.2, 2.2), lz + rr(-2.2, 2.2));
  plantClear(TREES[idx % TREES.length], w.x, w.z, { avoidRoad: 6.5, pad: 6.0 });
});
// Кусты у подножия руин и валунов — немного, только снаружи габаритов (травяные «ковры» и россыпь по полю не ставятся)
const nearRuins = props.filter(p =>
  p.instanced &&
  (p.category === 'ruins' || p.category === 'rocks') &&
  p.modelId !== 'opt_bastion' && p.modelId !== 'opt_slab' &&
  p.modelId !== 'opt_plaza_deck' && p.modelId !== 'opt_plaza_deck_cracked' &&
  p.modelId !== 'opt_plaza_deck_scorched' && p.modelId !== 'opt_plaza_deck_edge' && p.modelId !== 'opt_plaza_breach' &&
  p.modelId !== 'opt_plaza_steps' && p.modelId !== 'opt_bastion_parapet' &&
  !isWorldInsideComplex(p.position.x, p.position.z) &&
  Math.hypot(p.position.x - C.x, p.position.z - C.z) > 34
);
for (let i = 0; i < 30 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const pm = PIECES[p.modelId];
  const baseRad = pm && pm.size ? Math.hypot(pm.size[0], pm.size[2]) * 0.5 : 3.2;
  const a = rr(0, 6.28), r = rr(baseRad + 1.8, baseRad + 4.8);
  const gx = p.position.x + Math.cos(a) * r, gz = p.position.z + Math.sin(a) * r;
  plantClear(BUSHES[i % BUSHES.length], gx, gz, { avoidRoad: 3.8, pad: 4.5, minCenterDist: 34 });
}

// ============================================================
//  МИРНАЯ СУБ-ЗОНА «БАЗА ОПЕРАТОРОВ» (накрывает Бастион + всю площадь + Мемориал!)
// ============================================================

function toUV(x, z) {
  const TD = globalThis.TerrainData;
  const TW = TD.maxX - TD.minX, TH_W = TD.maxZ - TD.minZ;
  return [+((x - TD.minX) / TW).toFixed(6), +((z - TD.minZ) / TH_W).toFixed(6)];
}
const campCorners = [W(-52, -46), W(46, -46), W(46, 84), W(-52, 84)];
const campPoly = campCorners.map(pt => toUV(pt.x, pt.z));
const campZone = {
  id: 'terr_operators_camp',
  name: 'База операторов',
  kind: 'territory',
  peace: true,
  lvl: [1, 5],
  shape: 'poly',
  poly: campPoly,
  nb: [
    Math.min(...campPoly.map(p => p[0])),
    Math.min(...campPoly.map(p => p[1])),
    Math.max(...campPoly.map(p => p[0])),
    Math.max(...campPoly.map(p => p[1]))
  ]
};
const nextHuntZones = (curOverrides.huntZones || []).filter(z => z && z.id !== 'terr_operators_camp');
nextHuntZones.push(campZone);

// Контур зоны «Территория операторов»: берег ручья на юге и деревенская дорога на западе — часть зоны.
// Споты зоны — ручная раскладка fixedSpots (mob-db.buildSpotsFromEditorZones): тот же порядок, число,
// уровни и мобы из набора зоны, но места — по участкам (парк, луга, берег ручья, заводь с боссом).
const OP_ZONE_ID = 'hunt_1785319320448_1';
const SPOT_BY_IDX = new Map(PARK_MOD.SPOTS.map(s => [s[0], s]));
const OLD_LVL = new Map((curOverrides.mobSpots || []).filter(s => s && s.zone === 'Территория операторов').map(s => [s.idx, s.lvl]));
for (let i = 0; i < nextHuntZones.length; i++) {
  const z = nextHuntZones[i];
  if (!z || z.id !== OP_ZONE_ID) continue;
  const poly = PARK_MOD.ZONE_POLY.map(([x, zz]) => toUV(x, zz));
  const fixedSpots = PARK_MOD.SPOTS.map(([idx, mob, x, zz]) => {
    const np = toUV(x, zz);
    const e = { np: [+np[0].toFixed(5), +np[1].toFixed(5)], mob };
    if (mob !== 'toaster_overlord') { e.lvl = (OLD_LVL.get(idx) || [1, 5]).slice(); e.rM = 30; }
    return e;
  });
  nextHuntZones[i] = Object.assign({}, z, {
    poly,
    nb: [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1])), Math.max(...poly.map(p => p[0])), Math.max(...poly.map(p => p[1]))],
    fixedSpots
  });
}

// Зеркало для панели спотов редактора (игра споты строит из зон, этот список при запекании отбрасывается)
const nextMobSpots = (curOverrides.mobSpots || []).map(s => {
  if (!s || s.zone !== 'Территория операторов' || !SPOT_BY_IDX.has(s.idx)) return s;
  const [, mob, x, z] = SPOT_BY_IDX.get(s.idx);
  const np = toUV(x, z);
  return Object.assign({}, s, { mob, np: [+np[0].toFixed(5), +np[1].toFixed(5)], r: s.boss ? s.r : +(30 / WM.worldBounds().W).toFixed(4) });
});
// центр спота не внутри твёрдого объекта (иначе моб, не найдя свободной точки, родится в коллайдере)
for (const s of OP_SPOT_POINTS) {
  for (const o of OCCUPIED) {
    if (o.layer !== 'SOLID' || o.external) continue;
    if (obbOverlap(s.x, s.z, 0.6, 0.6, 0, o.x, o.z, o.hx, o.hz, o.ry, 0)) {
      throw new Error('центр спота #' + s.idx + ' (' + s.mob + ') внутри ' + o.id);
    }
  }
}

// Проверки: споты мобов и id
WM.applyEditorOverrides(Object.assign({}, curOverrides, { huntZones: nextHuntZones, mobSpots: nextMobSpots }));
WM.rebuildMobSpotsFromEditor();
const spots = (WM.MOB_SPOTS || []).filter(s => s.zone === 'Территория операторов').map(s => ({
  x: WM.wx(s.np[0]), z: WM.wz(s.np[1]), mob: s.mob
}));
if (spots.length !== PARK_MOD.SPOTS.length) {
  // число спотов зоны не меняется: глобальные индексы спотов других зон (deletedMobSpotIdxs) остаются верными
  throw new Error('спотов зоны ' + spots.length + ' вместо ' + PARK_MOD.SPOTS.length + ' (fixedSpots не применились?)');
}
PARK_MOD.SPOTS.forEach(([idx, mob, x, zz], k) => {
  const s = spots[k];
  if (s.mob !== mob || Math.hypot(s.x - x, s.z - zz) > 0.5) throw new Error('спот #' + idx + ' не на месте: ' + s.mob + ' ' + s.x.toFixed(1) + ',' + s.z.toFixed(1));
});
const nearest = spots.reduce((best, s) => Math.min(best, Math.hypot(s.x - C.x, s.z - C.z)), Infinity);
if (nearest < 48) throw new Error('центр спота мобов слишком близко к бастиону: ' + nearest.toFixed(1) + ' м');

const badIds = props.filter(p => WM.normalizeWorldKey(p.id) !== String(p.id).toLowerCase()).map(p => p.id);
if (badIds.length) throw new Error('id совпадают с ключами объектов мира: ' + badIds.slice(0, 5).join(', '));

// Автопроверка: ни один проп на склоне или на террасе не висит в воздухе!
(function assertNoFloatingProps() {
  const DECKS = [
    { cx: 0,   cz: 29.2, hw: 24.1, hd: 12.1, y: T1_TOP },
    { cx: 0,   cz: 45.2, hw: 16.1, hd: 4.1,  y: T1_TOP },
    { cx: -36, cz: 37.2, hw: 8.1,  hd: 12.1, y: MEM_TOP },
    { cx: 0,   cz: 56.7, hw: 12.1, hd: 4.1,  y: T2_TOP },
    { cx: 4.0, cz: 64.7, hw: 8.1,  hd: 4.1,  y: T2_TOP }
  ];
  const SKIP_DECK = new Set([
    'opt_plaza_deck', 'opt_plaza_deck_cracked', 'opt_plaza_deck_scorched',
    'opt_plaza_deck_edge', 'opt_plaza_breach',
    'opt_plaza_steps', 'opt_gate_steps', 'opt_bastion_parapet'
  ]);
  for (const dc of DECK_PROP_CHECKS) {
    if (SKIP_DECK.has(dc.piece)) continue;
    const m = PIECES[dc.piece];
    const hw = (m ? m.size[0] * dc.scale : 1.0) * 0.35;
    const hd = (m ? m.size[2] * dc.scale : 1.0) * 0.35;
    const checkPts = [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [ax, az] of checkPts) {
      const o = rotXZ(ax * hw, az * hd, dc.drot);
      const px = dc.lx + o.x, pz = dc.lz + o.z;
      const inSteps = Math.abs(px) <= 4.5 && Math.abs(pz - 51.3) <= 2.4;
      const inMemSteps = Math.abs(px + 26.0) <= 2.4 && Math.abs(pz - 37.2) <= 4.5 && Math.abs(dc.y - MEM_TOP) < 0.65;
      const onDeck = DECKS.some(d => Math.abs(dc.y - d.y) < 0.65 && Math.abs(px - d.cx) <= d.hw + 0.15 && Math.abs(pz - d.cz) <= d.hd + 0.15);
      if (!inSteps && !inMemSteps && !onDeck) {
        throw new Error('Террасный проп (или его край) вне твёрдой плиты: ' + dc.id + ' (' + dc.piece + ') local=(' + px.toFixed(1) + ',' + pz.toFixed(1) + ') y=' + dc.y.toFixed(2));
      }
    }
  }
  const Y0_BASE_OFFSET = {
    opt_ruin_foundry_shell: 0.448,
    opt_ruin_boiler_wreck: 0.348,
    opt_ruin_gear_wreck: 0.28,
    opt_ruin_bridge: 0.069,
    opt_wreck_steam_wagon: 0.02,
    opt_wreck_caisson: 0.01,
    opt_ruin_bastion_prow: 0.0,
    opt_ruin_pipe_tangle: 0.039
  };
  for (const p of props) {
    if (!GROUND_PROP_IDS.has(p.id) || p.modelId === 'opt_bastion') continue;
    const m = PIECES[p.modelId];
    if (!m) continue;
    const s = (p.scale && p.scale.x) || 1;
    const hw = ((m.size ? m.size[0] : m.w) * s) * 0.44;
    const hd = ((m.size ? m.size[2] : m.d) * s) * 0.44;
    const ry = (p.rotation && p.rotation.y) || 0;
    let gMin = ground(p.position.x, p.position.z);
    for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const o = rotXZ(ax * hw, az * hd, ry);
      gMin = Math.min(gMin, ground(p.position.x + o.x, p.position.z + o.z));
    }
    const effBotY = p.position.y + (Y0_BASE_OFFSET[p.modelId] || 0) * s;
    if (effBotY > gMin + 0.05) {
      throw new Error('Наземный проп висит над склоном: ' + p.id + ' (' + p.modelId + ') effBotY=' + effBotY.toFixed(2) + ' > gMin=' + gMin.toFixed(2));
    }
  }
})();

// Автопроверка: ни один твёрдый проп/дорога/дерево/куст не входит внутрь другого объекта (0 объектов в объектах!)
(function assertNoPropOverlaps() {
  const hits = [];
  for (let i = 0; i < OCCUPIED.length; i++) {
    const a = OCCUPIED[i];
    if (a.external) continue;
    for (let j = i + 1; j < OCCUPIED.length; j++) {
      const b = OCCUPIED[j];
      if (!shouldCheckLayers(a.layer, b.layer, a.isOnDeck && b.isOnDeck ? 'pipe' : undefined)) continue;
      if (a.layer === 'GROUNDCOVER' || b.layer === 'GROUNDCOVER') continue;
      if (obbOverlap(a.x, a.z, a.hx, a.hz, a.ry, b.x, b.z, b.hx, b.hz, b.ry, -0.02)) {
        hits.push(a.id + ' (' + a.x.toFixed(1) + ',' + a.z.toFixed(1) + ') <-> ' + b.id + ' (' + b.x.toFixed(1) + ',' + b.z.toFixed(1) + ')');
      }
    }
  }
  if (hits.length) {
    throw new Error('Найдены пересечения объектов (' + hits.length + '): ' + hits.join(' | '));
  }
})();

const kitTris = props.filter(p => p.instanced && PIECES[p.modelId]).reduce((a, p) => a + PIECES[p.modelId].tris[0], 0);
console.log('[layout] TH0=' + TH0.toFixed(3) + ', BASTION y=' + bastion.position.y.toFixed(2) + ', FLOOR_Y=' + FLOOR_Y.toFixed(2));
console.log('[layout] террасы T1=' + T1_TOP + ', MEM=' + MEM_TOP + ', T2=' + T2_TOP);
console.log('[layout] интерьер:', report.interior, '| лагерь:', report.camp, '| стимпанк:', report.steampunk, '| стяги:', report.banners, '| зелень:', report.foliage, '| коллайдеры:', report.colliders, '| ближайший спот мобов:', nearest.toFixed(1) + ' м');
console.log('[layout] батчей кита/пропсов:', Object.keys(report.pieces).length, '| всего LOD0 треугольников:', kitTris);

if (process.env.LAYOUT_DUMP) {
  // план сцены для обзора сверху (scripts/operators-territory: отладка композиции)
  fs.writeFileSync(process.env.LAYOUT_DUMP, JSON.stringify({ props: props.filter(p => p.meshType !== 'collision_box').map(p => ({ id: p.id, m: p.modelId, x: p.position.x, z: p.position.z, f: !!p.isFoliage, ry: p.rotation.y, s: p.scale.x })), spots, zone: PARK_MOD.ZONE_POLY }));
}
if (DRY) process.exit(0);

// ============================================================
//  Запись сцены редактора (оба файла, бэкап, rev+1) и запекание мира
// ============================================================
const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
const cur = JSON.parse(fs.readFileSync(writer.OVERRIDES_JSON_PATH, 'utf8'));
const isOurs = (p) => p && typeof p.id === 'string' && (/^opt_/.test(p.id) || /^foliage_optt_/.test(p.id));
const kept = (cur.customProps || []).filter(p => !isOurs(p));
const removed = (cur.customProps || []).length - kept.length;
const saved = writer.writeEditorOverridesFiles({ customProps: kept.concat(props), huntZones: nextHuntZones, mobSpots: nextMobSpots }, { baseRev: cur.rev | 0 });
console.log('[layout] сцена: rev ' + saved.rev + ', пропсов ' + saved.customProps.length + ' (заменено своих ' + removed + ', добавлено ' + props.length + ')');

// Покраску террейна раскладка не трогает: дороги и газоны — только авторские

const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const distWorld = path.join(ROOT, 'dist', 'client', 'data', 'world.json');
const r = Bake.bakeToDisk({ extra: fs.existsSync(path.dirname(distWorld)) ? [distWorld] : [] });
console.log('[layout] мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ → ' + (r.written.join(', ') || 'без изменений'));
