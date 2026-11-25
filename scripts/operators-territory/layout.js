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
  opt_lamp: 'Паровой фонарь операторов'
};
for (const [k, v] of Object.entries(ITCH.pieces)) {
  NAMES[k] = v.nameRu || k;
}

const DIST_CLASS = {
  opt_bastion: 'building', opt_plaza_deck: 'building', opt_plaza_steps: 'prop',
  opt_bastion_parapet: 'prop', opt_banner_wall: 'prop', opt_pennant_wall: 'prop', opt_banner_hang: 'prop',
  opt_wall_stone: 'prop', opt_column: 'prop', opt_column_broken: 'prop',
  opt_arch: 'prop', opt_ruin_long: 'prop', opt_ruin_corner: 'prop',
  opt_ruin_tower: 'building', opt_ruin_bridge: 'building', opt_ruin_gear_wreck: 'prop', opt_ruin_crater: 'prop',
  opt_ruin_house_shell: 'building', opt_ruin_house_gable: 'prop', opt_ruin_chimney: 'prop', opt_ruin_wood_arch: 'prop',
  opt_ruin_vault: 'prop', opt_ruin_stair: 'prop', opt_wreck_wagon: 'prop', opt_wreck_pushcart: 'prop',
  opt_dead_tree_a: 'prop', opt_dead_tree_b: 'prop', opt_rock_crag_a: 'prop', opt_rock_crag_b: 'prop',
  opt_hero_monument: 'prop', opt_cannon: 'prop',
  opt_boiler_station: 'building', opt_boiler_unit: 'prop', opt_steam_wheel: 'prop',
  opt_pipe_arch: 'prop', opt_pipe_mega_bend: 'prop', opt_pipe_riser_big: 'prop', opt_pipe_trench_run: 'prop',
  opt_pipe_straight: 'prop', opt_pipe_vertical: 'prop'
};

// Глубина вкапывания пропсов на естественном склоне: исключает зависание на уклоне
const SINK = {
  opt_column: 0.25, opt_column_broken: 0.25, opt_column_stump: 0.25, opt_column_fallen: 0.16,
  opt_arch: 0.35, opt_ruin_long: 0.55, opt_ruin_corner: 0.45,
  opt_ruin_tower: 0.65, opt_ruin_bridge: 0.70, opt_ruin_gear_wreck: 0.35, opt_ruin_crater: 0.22,
  opt_ruin_house_shell: 0.55, opt_ruin_house_gable: 0.55, opt_ruin_chimney: 0.40, opt_ruin_wood_arch: 0.40,
  opt_ruin_vault: 0.45, opt_ruin_stair: 0.45, opt_wreck_wagon: 0.22, opt_wreck_pushcart: 0.18,
  opt_brick_rubble: 0.14, opt_dead_tree_a: 0.35, opt_dead_tree_b: 0.35,
  opt_rock_crag_a: 0.60, opt_rock_crag_b: 0.65, opt_cart_wheel: 0.12, opt_wheelbarrow: 0.14, opt_signpost: 0.25,
  opt_debris: 0.18, opt_block: 0.18,
  opt_slab: 0.14, opt_hero_monument: 0.20, opt_lamp: 0.15, opt_wall_stone: 0.48,
  opt_rubble_pile: 0.16, opt_pipe_mega_bend: 0.65, opt_pipe_riser_big: 0.60, opt_pipe_trench_run: 0.36
};
const CYLINDER = new Set(['opt_column', 'opt_column_broken', 'opt_column_stump', 'opt_lamp', 'opt_hero_monument',
  'opt_dummy', 'opt_bookstand', 'opt_barrel', 'opt_gas_cylinder', 'opt_cable_drum',
  'opt_work_light', 'opt_sack_grain', 'opt_boiler_unit', 'opt_pipe_vertical', 'opt_pipe_riser_big', 'opt_roof_vent',
  'opt_dead_tree_a', 'opt_dead_tree_b', 'opt_rock_crag_a', 'opt_signpost', 'opt_ruin_gear_wreck']);

const props = [];
const report = { pieces: {}, colliders: 0, foliage: 0, interior: 0, camp: 0, banners: 0, steampunk: 0 };
const counters = {};

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
  return addEntryAndColliders(piece, x, y, z, rotY, opt);
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
  opt = opt || {};
  const w = W(lx, lz);
  const y = surfaceY + (opt.dy || 0);
  if (opt.steampunk) report.steampunk++;
  else report.camp++;
  return addEntryAndColliders(piece, w.x, y, w.z, TH0 + (drot || 0), opt);
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
  const gy = ground(x, z);
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
const EXTRA_ROCKS = {
  SM_RP_Rock_4m_0: { file: 'SM_RP_Rock_4m_0.fbx', scale: 1.05, name: 'Скала 4м №0 (Природа)' },
  SM_RP_Rock_8m_0: { file: 'SM_RP_Rock_8m_0.fbx', scale: 0.92, name: 'Глыба 8м №0 (Природа)' }
};
function putExtraRock(kind, x, z, scaleMul, rotY) {
  const rk = EXTRA_ROCKS[kind];
  const sc = rk.scale * (scaleMul || 1.0);
  const gy = ground(x, z);
  props.push({
    id: 'opt_rock_nat_' + String(++foliageN).padStart(3, '0'),
    name: rk.name,
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: rk.file,
    category: 'rocks',
    position: { x: +x.toFixed(3), y: +(gy - 0.55).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: +rr(-0.08, 0.08).toFixed(4), y: +(rotY != null ? rotY : rr(0, Math.PI * 2)).toFixed(4), z: +rr(-0.08, 0.08).toFixed(4) },
    scale: { x: +sc.toFixed(5), y: +sc.toFixed(5), z: +sc.toFixed(5) },
    instanced: true,
    distClass: 'prop'
  });
  report.foliage++;
}
let foliageN = 0;
function plant(kind, x, z) {
  const f = FOLIAGE[kind];
  const k = f.scale * rr(0.85, 1.15);
  props.push({
    id: 'foliage_optt_' + kind + '_' + String(++foliageN).padStart(3, '0'),
    name: f.name,
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: f.file,
    position: { x: +x.toFixed(3), y: +ground(x, z).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: +rr(-0.04, 0.04).toFixed(4), y: +rr(0, Math.PI * 2).toFixed(4), z: +rr(-0.04, 0.04).toFixed(4) },
    scale: { x: +k.toFixed(6), y: +k.toFixed(6), z: +k.toFixed(6) },
    isFoliage: true
  });
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

// Правое крыло (Квартирмейстер Брон — bx=+4.2, cy_bl=-1.2): верстаки, приборы и котёл зала
putIn('opt_workbench', +6.4, -3.2, -Math.PI / 2);
putIn('opt_bench_grinder', +6.4, -3.2, -Math.PI / 2, { dy: 0.96, noCollision: true, steampunk: true });
putIn('opt_cabinet', +6.9, +2.2, -Math.PI / 2);
putIn('opt_weapon_rack', +6.5, +5.2, -Math.PI / 2);
putIn('opt_crate_iron', +6.6, +7.3, 0.1);
putIn('opt_barrel', +6.7, -6.2, 0.0);
putIn('opt_barrel', +5.8, -6.6, 0.8);
putIn('opt_crate', +6.6, -7.6, -0.15);
putIn('opt_sack_grain', +5.2, +7.6, 0.5);
putIn('opt_gas_cylinder', +4.5, +9.9, 0.3);
putIn('opt_gas_cylinder', +4.5, +10.7, -0.4);
putIn('opt_cable_drum', +4.7, +8.7, 0.2);
putIn('opt_switch_box', +6.85, +0.4, -Math.PI / 2, { steampunk: true });
putIn('opt_pipe_vertical', +4.95, +11.1, 0, { steampunk: true });

// Освещение и вытяжные турбины на крыше Бастиона
putIn('opt_chandelier', 0.0, -3.8, 0, { dy: 6.2, noCollision: true });
putIn('opt_chandelier', 0.0, +3.2, 0, { dy: 6.2, noCollision: true });
for (const side of [-1, 1]) {
  for (const cy_bl of [-5.5, +0.5, +6.5]) {
    putIn('opt_lantern_indoor', side * 6.95, cy_bl, side < 0 ? Math.PI / 2 : -Math.PI / 2, { dy: 3.4, noCollision: true });
  }
}
putIn('opt_roof_vent', 0.0, -3.0, 0, { dy: 18.85, noCollision: true, steampunk: true });
putIn('opt_roof_vent', 0.0, +4.0, 0, { dy: 18.85, noCollision: true, steampunk: true });

// Строгие багровые вымпелы СНАРУЖИ Бастиона (никакого спама гербами — 1 центральный герб над порталом!)
mountPennantOnLocalWall(-10.6, inBastionLZ(-14.12), FLOOR_Y + 3.2, 0, 0.11);
mountPennantOnLocalWall(+10.6, inBastionLZ(-14.12), FLOOR_Y + 3.2, 0, 0.11);
mountPennantOnLocalWall(-6.5, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.11);
mountPennantOnLocalWall(+6.5, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.11);

// ============================================================
//  2. МНОГОУРОВНЕВЫЕ КАМЕННЫЕ ТЕРРАСЫ ПЛОЩАДИ (0 мм нахлёста, 0 z-fighting!)
// ============================================================
const T1_TOP = +(bastion.position.y + 1.180).toFixed(3);  // ~87.65 м (ступень 0 бастиона на +0.19 м выше)
const MEM_TOP = +(T1_TOP + 0.900).toFixed(3);             // ~88.55 м (Мемориальная терраса Монумента Героя +0.90 м)
const T2_TOP = +(T1_TOP - 0.900).toFixed(3);              // ~86.75 м (Нижняя площадь аллеи)
const T3_TOP = +(T1_TOP - 1.800).toFixed(3);              // ~85.85 м (Южная входная площадка ворот)

// 2.1. Верхняя парадная площадь Tier 1: lx ∈ [-24..+24], lz ∈ [17.2..49.2]
for (const lz of [21.2, 29.2, 37.2, 45.2]) {
  for (const lx of [-20, -12, -4, 4, 12, 20]) {
    putOn('opt_plaza_deck', lx, lz, T1_TOP - 1.80, 0, { noCollision: true, shadow: false });
  }
}
addWalkableSlabL('opt_col_deck_t1', 0, 33.2, 48.2, 32.3, T1_TOP, 2.2, 0);

// 2.2. Мемориальная терраса Монумента Героя: lx ∈ [-44..-28], lz ∈ [25.2..49.2] (строго шаг 8 м — 0 нахлёста!)
for (const lz of [29.2, 37.2, 45.2]) {
  for (const lx of [-40, -32]) {
    putOn('opt_plaza_deck', lx, lz, MEM_TOP - 1.80, 0, { noCollision: true, shadow: false });
  }
}
addWalkableSlabL('opt_col_deck_mem', -36.0, 37.2, 16.2, 24.2, MEM_TOP, 2.4, 0);

// Широкая 6-ступенчатая лестница [-28.1..-23.9] + Триумфальная арка между Tier 1 и Мемориальной террасой
putOn('opt_plaza_steps', -26.0, 37.2, MEM_TOP - 1.80, +Math.PI / 2, { shadow: false });
putOn('opt_arch', -28.0, 37.2, MEM_TOP - 0.12, +Math.PI / 2);

// 2.3. Нижняя площадь аллеи Tier 2: ступени [49.2..53.4], плиты [-12..+12, 52.7..68.7] (без перекрытия по высоте!)
putOn('opt_plaza_steps', 0, 51.3, T1_TOP - 1.80, 0, { shadow: false });
for (const lz of [56.7, 64.7]) {
  for (const lx of [-8, 0, 8]) {
    putOn('opt_plaza_deck', lx, lz, T2_TOP - 1.80, 0, { noCollision: true, shadow: false });
  }
}
addWalkableSlabL('opt_col_deck_t2', 0, 60.7, 24.2, 16.2, T2_TOP, 2.2, 0);

// 2.4. Южная входная площадка Tier 3: ступени [68.7..72.9], плиты [72.2..80.2], выход [80.2..84.4]
putOn('opt_plaza_steps', 0, 70.8, T2_TOP - 1.80, 0, { shadow: false });
for (const lx of [-8, 0, 8]) {
  putOn('opt_plaza_deck', lx, 76.2, T3_TOP - 1.80, 0, { noCollision: true, shadow: false });
}
addWalkableSlabL('opt_col_deck_t3', 0, 76.2, 24.2, 8.2, T3_TOP, 2.2, 0);
putOn('opt_plaza_steps', 0, 82.3, T3_TOP - 1.80, 0, { shadow: false });

// 2.5. Крепостные каменные парапеты L2 по периметру террас
const PARAPET_DY = -1.48 + 0.14;
for (const lx of [-22, -18, -14, -10, 10, 14, 18, 22]) {
  putOn('opt_bastion_parapet', lx, 49.0, T1_TOP + PARAPET_DY, 0);
}
for (const lz of [20, 24, 28, 46]) {
  putOn('opt_bastion_parapet', -23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
for (const lz of [20, 24, 28, 32, 36, 40, 44]) {
  putOn('opt_bastion_parapet', +23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
// Парапеты на Мемориальной террасе Монумента Героя (lx ∈ [-44..-28])
for (const lx of [-42, -38, -34, -30]) {
  putOn('opt_bastion_parapet', lx, 25.4, MEM_TOP + PARAPET_DY, 0);
  putOn('opt_bastion_parapet', lx, 49.0, MEM_TOP + PARAPET_DY, 0);
}
for (const lz of [27.4, 31.4, 35.4, 39.4, 43.4, 47.0]) {
  putOn('opt_bastion_parapet', -43.8, lz, MEM_TOP + PARAPET_DY, Math.PI / 2);
}
for (const lz of [27.4, 31.4, 43.0, 47.0]) {
  putOn('opt_bastion_parapet', -28.2, lz, MEM_TOP + PARAPET_DY, Math.PI / 2);
}
// Парапеты по краям Нижней площади Tier 2 / Tier 3
for (const lz of [54.7, 58.7, 62.7, 66.7]) {
  putOn('opt_bastion_parapet', -11.8, lz, T2_TOP + PARAPET_DY, Math.PI / 2);
  putOn('opt_bastion_parapet', +11.8, lz, T2_TOP + PARAPET_DY, Math.PI / 2);
}
putOn('opt_bastion_parapet', -11.8, 76.2, T3_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', +11.8, 76.2, T3_TOP + PARAPET_DY, Math.PI / 2);

// ============================================================
//  3. ПАРАДНЫЕ КОЛОННЫ, ФОНАРИ И ДВУСТОРОННИЕ СТЯГИ НА КОЛОННАХ
// ============================================================
putOn('opt_lamp', -6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', -6.2, 47.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 47.6, T1_TOP, 0);

const AVENUE = [
  { lz: 25.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true },
  { lz: 33.5, deck: T1_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 42.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true },
  { lz: 57.5, deck: T2_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 65.5, deck: T2_TOP, L: 'opt_column_broken', R: 'opt_column', bL: false, bR: true },
  { lz: 75.5, deck: T3_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true }
];
for (const row of AVENUE) {
  for (const [lx, kind, hasBanner, inwardAngle] of [
    [-8.5, row.L, row.bL, TH0],
    [+8.5, row.R, row.bR, TH0 + Math.PI]
  ]) {
    const col = putOn(kind, lx, row.lz, row.deck, rr(-0.1, 0.1));
    if (hasBanner && kind === 'opt_column') {
      mountCantileverBanner(col.position.x, col.position.y, col.position.z, 4.4, 0.72, inwardAngle);
    }
  }
}

// ============================================================
//  4. МЕМОРИАЛЬНАЯ ПЛОЩАДЬ С МОНУМЕНТОМ ГЕРОЯ (lx ∈ [-44..-28], чистые стыки!)
// ============================================================
putOn('opt_hero_monument', -36.0, 37.2, MEM_TOP, +Math.PI / 2);
putOn('opt_lamp', -30.8, 32.2, MEM_TOP, 0);
putOn('opt_lamp', -30.8, 42.2, MEM_TOP, 0);
putOn('opt_lamp', -41.2, 32.2, MEM_TOP, 0);
putOn('opt_lamp', -41.2, 42.2, MEM_TOP, 0);

const MON_RING = [
  [-29.8, 28.6, 'opt_column', true],
  [-36.0, 27.6, 'opt_column', true],
  [-42.2, 28.6, 'opt_column', true],
  [-42.6, 37.2, 'opt_column', true],
  [-42.2, 45.8, 'opt_column', true],
  [-36.0, 46.8, 'opt_column_broken', false],
  [-29.8, 45.8, 'opt_column', true]
];
for (const [lx, lz, kind, hasB] of MON_RING) {
  const cObj = putOn(kind, lx, lz, MEM_TOP, 0);
  if (hasB) {
    const wCol = W(lx, lz), wCen = W(-36.0, 37.2);
    const worldOut = Math.atan2(-(wCen.z - wCol.z), wCen.x - wCol.x);
    mountCantileverBanner(cObj.position.x, cObj.position.y, cObj.position.z, 4.4, 0.72, worldOut);
  }
}
putOn('opt_bookstand', -32.2, 37.2, MEM_TOP, -Math.PI / 2);
putOn('opt_bench_camp', -31.8, 30.0, MEM_TOP, 0);
putOn('opt_bench_camp', -31.8, 44.4, MEM_TOP, Math.PI);

// ============================================================
//  5. ТРЕНИРОВОЧНЫЙ ПОЛИГОН ОПЕРАТОРОВ (северо-западное крыло Tier 1; Сержант Руст у -10.5, 34)
// ============================================================
for (const lz of [24.5, 29.5, 34.5, 39.5, 44.5]) {
  putOn('opt_dummy', -14.8, lz, T1_TOP, Math.PI * 0.5 + rr(-0.08, 0.08));
  putOn('opt_dummy', -19.6, lz, T1_TOP, Math.PI * 0.5 + rr(-0.08, 0.08));
}
putOn('opt_weapon_rack', -13.2, 20.6, T1_TOP, 0.08);
putOn('opt_weapon_rack_b', -16.6, 20.6, T1_TOP, -0.05);
putOn('opt_weapon_rack', -22.2, 32.5, T1_TOP, Math.PI * 0.5);
putOn('opt_weapon_rack_b', -22.2, 41.5, T1_TOP, Math.PI * 0.5);
putOn('opt_bench_camp', -12.8, 39.5, T1_TOP, Math.PI * 0.5);
putOn('opt_bench_camp', -12.8, 44.5, T1_TOP, Math.PI * 0.5);
putOn('opt_work_light', -12.5, 26.5, T1_TOP, 2.3);
putOn('opt_work_light', -12.5, 46.8, T1_TOP, 1.0);

// ============================================================
//  6. СТИМПАНК-КОТЕЛЬНАЯ, BIOSHOCK-МАГИСТРАЛИ ТРУБ И НАПОЛНЕННЫЕ ДВОРЫ
// ============================================================
// Силовой котёл + паровая турбина на крыше + приводные маховики и конденсаторы
putOn('opt_boiler_station', +19.5, 22.0, T1_TOP, -Math.PI * 0.5, { steampunk: true });
putOn('opt_roof_vent', +19.5, 22.0, T1_TOP, 0, { dy: 4.18, noCollision: true, steampunk: true });
putOn('opt_boiler_unit', +13.6, 21.4, T1_TOP, 0.25, { steampunk: true });
putOn('opt_boiler_unit', +20.2, 28.4, T1_TOP, -0.4, { steampunk: true });
putOn('opt_steam_wheel', +14.6, 26.8, T1_TOP, Math.PI * 0.5, { steampunk: true });
putOn('opt_steam_wheel', +19.2, 31.8, T1_TOP, 0.0, { steampunk: true });
putOn('opt_steam_condenser', +16.4, 20.6, T1_TOP, Math.PI, { steampunk: true });
putOn('opt_switch_box', +22.2, 33.4, T1_TOP, Math.PI, { steampunk: true });

// Логично соединённые паропроводы разного диаметра (0 парения, все опираются в пол/стены/котлы!)
putOn('opt_pipe_arch', +16.8, 34.8, T1_TOP, 0, { steampunk: true });
// Приземный двойной коллектор (0.52 + 0.26 м) от Бастиона к силовой и по востоку к кузне
putOn('opt_pipe_trench_run', +11.6, 24.4, T1_TOP - 0.14, 0, { steampunk: true });
putOn('opt_pipe_trench_run', +15.6, 24.4, T1_TOP - 0.14, 0, { steampunk: true });
putOn('opt_pipe_riser_big', +10.2, 18.8, T1_TOP - 0.35, Math.PI, { steampunk: true }); // стояк у восточной стены Бастиона
putOn('opt_pipe_riser_big', +21.8, 25.0, T1_TOP - 0.35, Math.PI, { steampunk: true }); // отвод в корпус силовой станции
for (const lz of [31.5, 35.5, 39.5]) {
  putOn('opt_pipe_trench_run', +21.4, lz, T1_TOP - 0.14, Math.PI / 2, { steampunk: true });
}
putOn('opt_anvil', +14.6, 38.6, T1_TOP, -0.6);
putOn('opt_whetstone', +16.8, 40.8, T1_TOP, -1.2);
putOn('opt_workbench', +15.2, 44.2, T1_TOP, -Math.PI / 2);
putOn('opt_bench_grinder', +15.2, 44.2, T1_TOP, -Math.PI / 2, { dy: 0.96, noCollision: true, steampunk: true });
putOn('opt_gas_cylinder', +22.2, 42.0, T1_TOP, 0.2);
putOn('opt_gas_cylinder', +22.2, 43.0, T1_TOP, 0.9);
putOn('opt_cable_drum', +20.2, 46.2, T1_TOP, 0.5);
putOn('opt_crate_iron', +13.0, 46.2, T1_TOP, 0.15);
putOn('opt_crate', +16.4, 46.8, T1_TOP, 0.4);
putOn('opt_barrel', +17.8, 46.8, T1_TOP, 0.1);
putOn('opt_sack_grain', +14.6, 46.8, T1_TOP, 0.8);
putOn('opt_work_light', +13.2, 36.6, T1_TOP, -2.2);

// Оживляем дворы Tier 2 ([-12..+12, 52.7..68.7]) и Tier 3 ([72.2..80.2]) — убираем пустоту!
putOn('opt_lamp', -10.2, 55.2, T2_TOP, 0);
putOn('opt_lamp', +10.2, 55.2, T2_TOP, 0);
putOn('opt_lamp', -10.2, 66.8, T2_TOP, 0);
putOn('opt_lamp', +10.2, 66.8, T2_TOP, 0);
// Западный альков Tier 2 (уставы и отдых смены)
putOn('opt_bench_camp', -9.8, 60.5, T2_TOP, Math.PI / 2);
putOn('opt_table_long', -7.8, 60.5, T2_TOP, Math.PI / 2);
putOn('opt_weapon_rack_b', -10.5, 53.8, T2_TOP, 0.1);
putOn('opt_crate', -10.2, 63.5, T2_TOP, 0.2);
putOn('opt_barrel', -9.2, 63.8, T2_TOP, -0.4);
// Восточный паровой узел Tier 2 (конденсатор + стояк в парапет + катушки)
putOn('opt_steam_condenser', +9.8, 59.5, T2_TOP, -Math.PI / 2, { steampunk: true });
putOn('opt_pipe_riser_big', +10.2, 62.6, T2_TOP - 0.38, 0, { steampunk: true }); // отвод прямо в восточный каменный парапет (+11.8)!
putOn('opt_switch_box', +10.5, 57.6, T2_TOP, -Math.PI / 2, { steampunk: true });
putOn('opt_cable_drum', +9.8, 65.2, T2_TOP, 0.4);
putOn('opt_gas_cylinder', +10.4, 54.0, T2_TOP, -0.3);
putOn('opt_gas_cylinder', +9.6, 54.0, T2_TOP, 0.5);
// Tier 3 — передовой караул у ворот
putOn('opt_cannon', -9.8, 76.0, T3_TOP, +0.12);
putOn('opt_cannon', +9.8, 76.0, T3_TOP, -0.12);
putOn('opt_crate_iron', -10.6, 78.6, T3_TOP, 0.2);
putOn('opt_crate_iron', +10.6, 78.6, T3_TOP, -0.2);
putOn('opt_barrel', -9.4, 78.8, T3_TOP, 0.1);
putOn('opt_sack_grain', +9.4, 78.8, T3_TOP, -0.4);
putOn('opt_lamp', -10.8, 73.2, T3_TOP, 0);
putOn('opt_lamp', +10.8, 73.2, T3_TOP, 0);

// Палатки лагеря по бокам нижней площади
const campT2 = W(-22.0, 62.0);
putWorldTent('tent_02', campT2.x, campT2.z, TH0 + 0.55);
const campT3 = W(+21.5, 59.5);
putWorldTent('tent_03', campT3.x, campT3.z, TH0 - 0.65);

// ============================================================
//  7. ЮЖНЫЕ ГЛАВНЫЕ ВОРОТА, BIOSHOCK-ТРУБЫ ИЗ ЗЕМЛИ И РАЗРУШЕННАЯ КАМЕННАЯ ДОРОГА
// ============================================================
putL('opt_arch', 0, 86.2, 0);
putL('opt_pipe_mega_bend', 0, 92.5, 0, { steampunk: true }); // огромная труба (0.8 м), уходящая фланцами в землю по бокам дороги!
putL('opt_lamp', -5.8, 88.5, 0);
putL('opt_lamp', +5.8, 88.5, 0);

// Трубы в духе BioShock по всей прилегающей территории — каждый стояк входит в каменную кладку/стену/землю, никаких открытых обрывов в воздухе!
putL('opt_pipe_riser_big', -15.5, 83.2, -Math.PI / 2, { steampunk: true }); // из земли заходит прямо в каменную стену ворот (lz=82.8)!
putL('opt_pipe_riser_big', +15.5, 83.2, -Math.PI / 2, { steampunk: true });
putL('opt_pipe_mega_bend', +28.5, 25.5, Math.PI / 2, { steampunk: true });
putL('opt_pipe_mega_bend', +27.5, 44.5, Math.PI / 2, { steampunk: true });
putL('opt_pipe_riser_big', +13.6, 61.5, Math.PI, { steampunk: true });       // выходит из восточного грунта прямо в опорный цоколь Tier 2 (+12)!
putL('opt_pipe_riser_big', +25.4, 24.0, Math.PI, { steampunk: true });       // выходит из восточной земли прямо в парапет и корпус котельной!
putL('opt_pipe_riser_big', -13.6, 67.0, 0, { steampunk: true });             // выходит из западного грунта прямо в цоколь Tier 2 (-12)!
putL('opt_pipe_mega_bend', -47.5, 22.0, 0.35, { steampunk: true });          // полная арка у Монумента Героя (обе ноги в грунте!)
putL('opt_pipe_trench_run', +26.0, 35.0, Math.PI / 2, { steampunk: true });
putL('opt_pipe_trench_run', +26.0, 52.5, Math.PI / 2, { steampunk: true });
put('opt_pipe_mega_bend', 200, 146, 0.7, { steampunk: true });               // среди западного поля руин из земли в землю!

// ВОССТАНОВЛЕННАЯ ДРЕВНЯЯ ДОРОГА ИЗ РАЗРУШЕННЫХ КАМЕННЫХ ПЛИТ (полотно чистое, обочины в руинах и кустах)
const ROAD_TILES = [];
for (let step = 0; step < 34; step++) {
  const lz = 84.8 + step * 2.55;
  const waveX = Math.sin(step * 0.24) * 3.4;
  ROAD_TILES.push({ lx: waveX, lz });
  putL('opt_slab', waveX - 1.35 + rr(-0.18, 0.18), lz, rr(-0.14, 0.14), { sink: 0.10, noCollision: true });
  putL('opt_slab', waveX + 1.35 + rr(-0.18, 0.18), lz, rr(-0.14, 0.14), { sink: 0.10, noCollision: true });
  if (step % 3 === 1) {
    putL('opt_block', waveX + (step % 2 === 0 ? -3.4 : +3.4) + rr(-0.25, 0.25), lz + rr(-0.4, 0.4), rr(0, Math.PI), { scale: rr(0.75, 1.05) });
  }
  if (step % 5 === 2) {
    const side = step % 2 === 0 ? -1 : 1;
    putL(step % 10 === 2 ? 'opt_column_stump' : 'opt_debris', waveX + side * 5.1, lz, rr(0, Math.PI * 2));
  }
  if (step % 9 === 4) {
    const side = step % 2 === 0 ? 1 : -1;
    putL('opt_lamp', waveX + side * 4.2, lz, 0);
  }
}
putL('opt_arch', Math.sin(11 * 0.24) * 3.4, 84.8 + 11 * 2.55, rr(-0.08, 0.08)); // старая триумфальная арка на подходе к лагерю!

// Боковые каменные тропы вокруг территории (восток и запад Бастиона + связь с полем руин)
for (const lz of [10, 14, 18, 22, 26, 30, 34, 38, 42]) {
  putL('opt_slab', +29.5 + rr(-0.3, 0.3), lz, Math.PI * 0.5 + rr(-0.15, 0.15), { sink: 0.10, noCollision: true });
}
for (let i = 0; i < 12; i++) {
  const px = 248 - i * 5.2 + Math.sin(i * 0.6) * 2.2;
  const pz = 165 - i * 3.4;
  put('opt_slab', px, pz, 0.65 + rr(-0.2, 0.2), { sink: 0.11, noCollision: true });
}

// Внешний каменный вал L2 по флангам южных ворот
for (const lx of [-14.2, -17.4, -20.6, -27.0, -30.2, 14.2, 17.4, 20.6, 27.0, 30.2]) {
  putL('opt_wall_stone', lx, 82.8, rr(-0.03, 0.03));
}
putL('opt_boiler_unit', -16.5, 77.5, 0.3, { steampunk: true });
putL('opt_boiler_unit', +16.5, 77.5, -0.3, { steampunk: true });

// Каменный руинный внешний контур вокруг всей базы операторов (с заглублением -0.55 м)
for (const lx of [-36, -24, 18, 29, 38]) putL('opt_ruin_long', lx, 84.5, rr(-0.05, 0.05), { scale: rr(0.9, 1.08) });
for (const side of [-1, 1]) {
  const xWall = side < 0 ? -48 : +40;
  for (const lz of [72, 54, 14, -10, -28]) {
    putL('opt_ruin_long', xWall, lz, Math.PI / 2 + rr(-0.05, 0.05), { scale: rr(0.85, 1.1) });
  }
}
for (const lx of [-30, -14, 10, 26]) {
  putL('opt_ruin_long', lx, -39, rr(-0.05, 0.05), { scale: rr(0.85, 1.05) });
}
putL('opt_ruin_corner', -46, -37, Math.PI);
putL('opt_ruin_corner', +38, 81, 0);

const insideTerraces = (lx, lz) => (
  (lx > -47 && lx < 27 && lz > -24 && lz < 88)
);
let placed = 0;
for (let tries = 0; tries < 400 && placed < 8; tries++) {
  const lx = rr(-48, 42), lz = rr(-36, 80);
  if (insideTerraces(lx, lz)) continue;
  putL(placed % 2 === 0 ? 'opt_debris' : 'opt_rubble_pile', lx, lz, rr(0, Math.PI * 2));
  placed++;
}
placed = 0;
for (let tries = 0; tries < 600 && placed < 14; tries++) {
  const lx = rr(-48, 42), lz = rr(-36, 84);
  if (insideTerraces(lx, lz)) continue;
  putL('opt_block', lx, lz, rr(0, Math.PI * 2), { scale: rr(0.8, 1.15) });
  placed++;
}

// ============================================================
//  8. РАЗРУШЕННЫЙ МИР В ОКРЕСТНОСТЯХ: РУИНЫ КРЕПОСТИ, ПОГИБШЕЕ ПОСЕЛЕНИЕ, ОБОЗЫ И СКАЛЫ
//  (Свободная проверка спотов мобов, чтобы ни один спот не оказался внутри стены/скалы!)
// ============================================================
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const MDB = require(path.join(ROOT, 'shared', 'mob-db.js'));
globalThis.MOB_DB = MDB;
const editorFile = path.join(ROOT, 'shared', 'editor-overrides.json');
const curOverrides = JSON.parse(fs.readFileSync(editorFile, 'utf8'));
const OP_SPOT_POINTS = (curOverrides.mobSpots || [])
  .filter(s => s && s.zone === 'Территория операторов' && Array.isArray(s.np))
  .map(s => ({ x: WM.wx(s.np[0]), z: WM.wz(s.np[1]) }));
function isNearOpSpot(wx, wz, minR) {
  const r = minR || 8.5;
  for (const s of OP_SPOT_POINTS) {
    if (Math.hypot(wx - s.x, wz - s.z) < r) return true;
  }
  return false;
}
function tryLand(wx, wz, pad) {
  const y = TH.groundY(wx, wz, 600, 1200);
  return y != null && isFinite(y) && y > 45 && !isNearOpSpot(wx, wz, pad || 8.5);
}

// 8.1. Рухнувшие башни бастиона, акведуки-мосты, вбитые шестерни и воронки катастрофы
for (const [lx, lz, rot] of [[-35, -22, 0.25], [+33, -20, -Math.PI * 0.45], [-46, +72, Math.PI * 0.55], [+34, +74, -0.35]]) {
  const w = W(lx, lz);
  if (tryLand(w.x, w.z, 9)) putL('opt_ruin_tower', lx, lz, rot);
}
for (const [lx, lz, rot] of [[-30, +106, -0.25], [+45, +46, Math.PI * 0.48], [+38, -18, 0.65]]) {
  const w = W(lx, lz);
  if (tryLand(w.x, w.z, 10)) putL('opt_ruin_bridge', lx, lz, rot);
}
if (tryLand(216, 134, 10)) put('opt_ruin_bridge', 216, 134, 0.55);

for (const [lx, lz, rot] of [[-22, -28, 0.4], [+33, +10, -0.8], [-26, +98, 1.2], [+27, +94, -0.5], [-66, +42, 0.9]]) {
  const w = W(lx, lz);
  if (tryLand(w.x, w.z, 8)) putL('opt_ruin_gear_wreck', lx, lz, rot, { scale: rr(0.85, 1.1) });
}
for (const [lx, lz, rot] of [[-16, -34, 0.2], [+26, -32, 1.1], [-54, +24, -0.4], [+38, +26, 2.0], [-24, +116, 0.7], [+22, +112, -1.0], [+54, +86, 0.5]]) {
  const w = W(lx, lz);
  if (tryLand(w.x, w.z, 7.5)) putL('opt_ruin_crater', lx, lz, rot, { scale: rr(0.9, 1.15) });
}
for (const [wx, wz, rot] of [[232, 178, 0.2], [184, 132, 2.1]]) {
  if (tryLand(wx, wz, 8)) put('opt_ruin_gear_wreck', wx, wz, rot);
}
for (const [wx, wz, rot] of [[204, 162, 0.3], [160, 148, 1.7]]) {
  if (tryLand(wx, wz, 7.5)) put('opt_ruin_crater', wx, wz, rot);
}

// 8.2. Погибшее внешнее поселение («уцелела только Деревня»): дома-руины, дымоходы, своды, завалы кирпича
const HAMLET_CLUSTERS = [
  [-18, +102, 0.25], [+18, +106, -0.6], [-20, +134, 1.2], [+20, +144, -1.4],
  [-62, +16, 0.4], [-68, +52, -0.8], [+52, +22, 2.2], [+56, +66, -1.1],
  [-14, -52, 0.15], [+20, -50, -0.5], [-38, -42, 0.9]
];
HAMLET_CLUSTERS.forEach(([lx, lz, drot], idx) => {
  const w = W(lx, lz);
  if (!tryLand(w.x, w.z, 9)) return;
  putL(idx % 3 === 0 ? 'opt_ruin_house_gable' : 'opt_ruin_house_shell', lx, lz, drot);
  const wCh = W(lx + rr(-4.5, 4.5), lz + rr(-4.5, 4.5));
  if (tryLand(wCh.x, wCh.z, 6)) put(idx % 2 === 0 ? 'opt_ruin_chimney' : 'opt_ruin_vault', wCh.x, wCh.z, rr(0, 6.28));
  put(idx % 2 === 0 ? 'opt_brick_rubble' : 'opt_rubble_pile', w.x + rr(-3.2, 3.2), w.z + rr(-3.2, 3.2), rr(0, 6.28));
});
// Дополнительные фрагменты руин в западной долине и к дороге
for (const [kind, x, z, sc] of [
  ['opt_ruin_house_shell', 174, 128, 1.0], ['opt_ruin_house_gable', 210, 174, 1.0],
  ['opt_ruin_chimney', 236, 206, 1.05], ['opt_ruin_stair', 196, 142, 1.0],
  ['opt_ruin_vault', 180, 178, 1.0], ['opt_ruin_wood_arch', 162, 160, 0.52],
  ['opt_wreck_wagon', 214, 154, 1.0], ['opt_wreck_pushcart', 202, 124, 1.0],
  ['opt_brick_rubble', 178, 134, 1.0], ['opt_brick_rubble', 215, 178, 1.0]
]) {
  if (tryLand(x, z, 7.5)) put(kind, x, z, rr(0, Math.PI * 2), sc !== 1.0 ? { scale: sc } : undefined);
}

// 8.3. Брошенные разрушенные обозы, колёса, тачки и покосившиеся указатели вдоль дороги к Деревне
for (const [kind, lx, lz, drot] of [
  ['opt_wreck_wagon', -8.8, +104, 0.5], ['opt_wreck_wagon', +10.2, +136, -2.1],
  ['opt_wreck_wagon', -12.0, +160, 1.1], ['opt_wreck_pushcart', +8.5, +96, -0.8],
  ['opt_wreck_pushcart', -9.4, +126, 2.3], ['opt_cart_wheel', -7.2, +106, 0.4],
  ['opt_cart_wheel', +8.4, +138, 1.8], ['opt_wheelbarrow', -10.5, +116, -0.5],
  ['opt_signpost', -4.8, +91.5, -0.35], ['opt_signpost', +5.2, +148, 2.7],
  ['opt_ruin_stair', -15.0, +120, 0.2], ['opt_ruin_vault', +14.5, +124, -0.7],
  ['opt_ruin_wood_arch', +16.0, +116, 0.9]
]) {
  const w = W(lx, lz);
  if (tryLand(w.x, w.z, 6.5)) {
    putL(kind, lx, lz, drot, kind === 'opt_ruin_wood_arch' ? { scale: 0.52 } : undefined);
  }
}

// Поле руин на западном склоне к дороге из деревни
const FIELD = [
  ['opt_column_broken', 190, 122], ['opt_column_stump', 176, 141], ['opt_column', 201, 168],
  ['opt_column_stump', 166, 176], ['opt_debris', 185, 150], ['opt_rubble_pile', 206, 135],
  ['opt_ruin_long', 172, 108], ['opt_ruin_corner', 214, 186], ['opt_column_fallen', 186, 191],
  ['opt_rubble_pile', 180, 165], ['opt_debris', 195, 112],
  ['opt_ruin_long', 238, 214], ['opt_column_broken', 231, 208], ['opt_column_stump', 245, 219]
];
for (const [kind, x, z] of FIELD) put(kind, x, z, rr(0, Math.PI * 2));
for (let i = 0; i < 12; i++) {
  const bx = rr(155, 232), bz = rr(96, 210);
  if (tryLand(bx, bz, 6)) put('opt_block', bx, bz, rr(0, 6.28), { scale: rr(0.8, 1.15) });
}

// 8.4. Скалистые утёсы и каменные глыбы по гребням холмов (CC0 Quaternius, 2 варианта в общем атласе)
const ROCK_CRAG_SPOTS = [
  [-64, -36], [-48, -56], [+2, -62], [+46, -48], [+62, -16], [+64, +24], [+62, +64],
  [-68, -6], [-72, +30], [-66, +68], [-44, +112], [+42, +104], [+28, +148], [-32, +154]
];
ROCK_CRAG_SPOTS.forEach(([lx, lz], idx) => {
  const w = W(lx + rr(-2, 2), lz + rr(-2, 2));
  if (!tryLand(w.x, w.z, 9.5)) return;
  put(idx % 2 === 0 ? 'opt_rock_crag_a' : 'opt_rock_crag_b', w.x, w.z, rr(0, 6.28), { scale: rr(0.95, 1.45) });
  if (Math.abs(lx) > 55) {
    const w2 = { x: w.x + rr(-4.5, 4.5), z: w.z + rr(-4.5, 4.5) };
    if (tryLand(w2.x, w2.z, 8.5)) {
      put(idx % 2 === 0 ? 'opt_rock_crag_b' : 'opt_rock_crag_a', w2.x, w2.z, rr(0, 6.28), { scale: rr(0.7, 1.1) });
    }
  }
});

// ============================================================
//  9. КОНТРАСТ РАЗРУШЕННОГО МИРА И БУЙНОЙ ПРИРОДЫ В ОКРЕСТНОСТЯХ
// ============================================================
function worldToLocal(wx, wz) {
  const dx = wx - C.x, dz = wz - C.z;
  const c = Math.cos(TH0), s = Math.sin(TH0);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}
function isWorldInsideComplex(wx, wz) {
  const { lx, lz } = worldToLocal(wx, wz);
  return lx > -48 && lx < 27 && lz > -24 && lz < 86;
}
function isNearRoadSlab(lx, lz, padX) {
  const px = padX != null ? padX : 3.4;
  for (const rt of ROAD_TILES) {
    if (Math.abs(lz - rt.lz) < 3.6 && Math.abs(lx - rt.lx) < px) return true;
  }
  return false;
}
const TREES = ['tree01', 'tree02', 'tree05', 'tree073', 'tree075'];
const BUSHES = ['bush01', 'bush02', 'bush04', 'BlueberryBush', 'retro_bush4_spring1', 'retro_bush3_spring3', 'retro_bush8_summer', 'retro_bush1_fall', 'retro_bush02'];
const CARPETS = ['matted_pratia_b', 'matted_pratia_c', 'matted_pratia_d', 'matted_pratia_f', 'matted_pratia_g', 'matted_pratia_h', 'field_poppy_e', 'field_poppy_f'];
const TUFTS = ['grass03', 'grass04', 'grass05', 'grass08', 'grass_bush', 'Fern'];

// Сухие корявые деревья и пни рядом с воронками и разрушенным поселением
const DEAD_TREE_SPOTS = [
  [-24, -36], [+34, -34], [-58, +22], [+46, +32], [-28, +104], [+26, +116],
  [-48, +138], [+38, +146], [-72, +74], [+64, +54], [+52, -32], [-70, -14]
];
DEAD_TREE_SPOTS.forEach(([lx, lz], idx) => {
  const w = W(lx + rr(-2, 2), lz + rr(-2, 2));
  if (!tryLand(w.x, w.z, 7.5) || isWorldInsideComplex(w.x, w.z)) return;
  put(idx % 2 === 0 ? 'opt_dead_tree_a' : 'opt_dead_tree_b', w.x, w.z, rr(0, 6.28), { scale: rr(0.75, 1.05) });
});
[[192, 152], [172, 168], [224, 146], [202, 194], [156, 134], [244, 178]].forEach(([wx, wz], idx) => {
  if (tryLand(wx, wz, 7)) put(idx % 2 === 0 ? 'opt_dead_tree_b' : 'opt_dead_tree_a', wx, wz, rr(0, 6.28), { scale: rr(0.75, 1.0) });
});

// Широкие лесные массивы в окрестностях (обрамляют все холмы вокруг руин на 125 м вокруг базы)
const TREE_RINGS = [
  [-56, -44], [-42, -48], [-18, -50], [+8, -50], [+32, -46], [+48, -38],
  [+46, -12], [+46, +12], [+44, +34], [+46, +58], [+40, +78],
  [-54, -18], [-55, +6], [-56, +32], [-56, +56], [-46, +78], [-32, +92], [+30, +94],
  [-74, -28], [-76, +18], [-78, +62], [+66, -24], [+68, +26], [+64, +72], [-44, -68], [+24, -66]
];
TREE_RINGS.forEach(([lx, lz], idx) => {
  const w = W(lx + rr(-2.2, 2.2), lz + rr(-2.2, 2.2));
  if (!isWorldInsideComplex(w.x, w.z) && tryLand(w.x, w.z, 6)) plant(TREES[idx % TREES.length], w.x, w.z);
});
for (let s = 2; s < 26; s += 3) {
  const rt = ROAD_TILES[s];
  for (const side of [-1, 1]) {
    const lx = rt.lx + side * rr(15.5, 23.0);
    const lz = rt.lz + rr(-1.5, 1.5);
    const w = W(lx, lz);
    if (tryLand(w.x, w.z, 6)) plant(TREES[(s + (side > 0 ? 3 : 0)) % TREES.length], w.x, w.z);
  }
}
// Дальние перелески по внешнему периметру всей территории (коридор дороги держим открытым!)
let farTrees = 0;
for (let tries = 0; tries < 950 && farTrees < 56; tries++) {
  const lx = rr(-112, +92), lz = rr(-85, +175);
  if (lx > -52 && lx < 36 && lz > -42 && lz < 90) continue;
  if (isNearRoadSlab(lx, lz, 14.5)) continue;
  const w = W(lx, lz);
  if (isWorldInsideComplex(w.x, w.z) || !tryLand(w.x, w.z, 6.5)) continue;
  plant(TREES[farTrees % TREES.length], w.x, w.z);
  farTrees++;
}

// Поваленные брёвна и пни у опушек и развалин
for (let i = 0; i < 22; i++) {
  const lx = rr(-95, 78), lz = rr(-75, 168);
  if (lx > -49 && lx < 28 && lz > -25 && lz < 87) continue;
  if (isNearRoadSlab(lx, lz, 4.0)) continue;
  const w = W(lx, lz);
  if (isWorldInsideComplex(w.x, w.z) || !tryLand(w.x, w.z, 5.5)) continue;
  plant(['forest_Log_1', 'forest_Log_2', 'forest_Stump_1', 'forest_Stump_2'][i % 4], w.x, w.z);
}

// Густые кустарники и папоротники по периметру руин, скал, разбитых домов и дороги
const nearRuins = props.filter(p =>
  p.instanced &&
  (p.category === 'ruins' || p.category === 'rocks') &&
  p.modelId !== 'opt_bastion' && p.modelId !== 'opt_slab' && p.modelId !== 'opt_plaza_deck' && p.modelId !== 'opt_plaza_steps' && p.modelId !== 'opt_bastion_parapet' &&
  !isWorldInsideComplex(p.position.x, p.position.z) &&
  Math.hypot(p.position.x - C.x, p.position.z - C.z) > 34
);
for (let i = 0; i < 74 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(2.6, 6.0);
  const gx = p.position.x + Math.cos(a) * r, gz = p.position.z + Math.sin(a) * r;
  const loc = worldToLocal(gx, gz);
  if (!isWorldInsideComplex(gx, gz) && !isNearRoadSlab(loc.lx, loc.lz, 4.4) && tryLand(gx, gz, 4)) {
    plant(BUSHES[i % BUSHES.length], gx, gz);
  }
}
for (let s = 1; s < 33; s += 2) {
  const rt = ROAD_TILES[s];
  const side = s % 2 === 0 ? -1 : 1;
  const w = W(rt.lx + side * rr(4.8, 7.2), rt.lz + rr(-1.0, 1.0));
  if (tryLand(w.x, w.z, 4)) plant(BUSHES[s % BUSHES.length], w.x, w.z);
}

// Ковры пратии, маки, папоротник и трава по всей окрестности
for (let i = 0; i < 50 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(1.8, 6.5);
  const gx = p.position.x + Math.cos(a) * r, gz = p.position.z + Math.sin(a) * r;
  const loc = worldToLocal(gx, gz);
  if (!isWorldInsideComplex(gx, gz) && !isNearRoadSlab(loc.lx, loc.lz, 3.6) && tryLand(gx, gz, 3)) {
    plant(CARPETS[i % CARPETS.length], gx, gz);
  }
}
let tufts = 0;
for (let tries = 0; tries < 6000 && tufts < 75; tries++) {
  const lx = rr(-115, 92), lz = rr(-92, 180);
  if (insideTerraces(lx, lz)) continue;
  if (isNearRoadSlab(lx, lz, 3.2) && rnd() < 0.85) continue;
  const w = W(lx, lz);
  const y = TH.groundY(w.x, w.z, 600, 1200);
  if (y == null || !isFinite(y) || y < 45) continue;
  plant(TUFTS[tufts % TUFTS.length], w.x, w.z);
  tufts++;
}

// ============================================================
//  МИРНАЯ СУБ-ЗОНА «БАЗА ОПЕРАТОРОВ» (накрывает Бастион + всю площадь + Мемориал!)
// ============================================================

function toUV(x, z) {
  const TD = globalThis.TerrainData;
  const TW = TD.maxX - TD.minX, TH_W = TD.maxZ - TD.minZ;
  return [+((x - TD.minX) / TW).toFixed(6), +((z - TD.minZ) / TH_W).toFixed(6)];
}
const campCorners = [W(-52, -46), W(46, -46), W(46, 94), W(-52, 94)];
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

// Проверки: споты мобов и id
WM.applyEditorOverrides(Object.assign({}, curOverrides, { huntZones: nextHuntZones }));
WM.rebuildMobSpotsFromEditor();
const spots = (WM.MOB_SPOTS || []).filter(s => s.zone === 'Территория операторов').map(s => ({
  x: WM.wx(s.np[0]), z: WM.wz(s.np[1]), mob: s.mob
}));
const nearest = spots.reduce((best, s) => Math.min(best, Math.hypot(s.x - C.x, s.z - C.z)), Infinity);
if (nearest < 48) throw new Error('центр спота мобов слишком близко к бастиону: ' + nearest.toFixed(1) + ' м');

const badIds = props.filter(p => WM.normalizeWorldKey(p.id) !== String(p.id).toLowerCase()).map(p => p.id);
if (badIds.length) throw new Error('id совпадают с ключами объектов мира: ' + badIds.slice(0, 5).join(', '));

const kitTris = props.filter(p => p.instanced && PIECES[p.modelId]).reduce((a, p) => a + PIECES[p.modelId].tris[0], 0);
console.log('[layout] TH0=' + TH0.toFixed(3) + ', BASTION y=' + bastion.position.y.toFixed(2) + ', FLOOR_Y=' + FLOOR_Y.toFixed(2));
console.log('[layout] террасы T1=' + T1_TOP + ', MEM=' + MEM_TOP + ', T2=' + T2_TOP + ', T3=' + T3_TOP);
console.log('[layout] интерьер:', report.interior, '| лагерь:', report.camp, '| стимпанк:', report.steampunk, '| стяги:', report.banners, '| зелень:', report.foliage, '| коллайдеры:', report.colliders, '| ближайший спот мобов:', nearest.toFixed(1) + ' м');
console.log('[layout] батчей кита/пропсов:', Object.keys(report.pieces).length, '| всего LOD0 треугольников:', kitTris);

if (DRY) process.exit(0);

// ============================================================
//  Запись сцены редактора (оба файла, бэкап, rev+1) и запекание мира
// ============================================================
const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
const cur = JSON.parse(fs.readFileSync(writer.OVERRIDES_JSON_PATH, 'utf8'));
const isOurs = (p) => p && typeof p.id === 'string' && (/^opt_/.test(p.id) || /^foliage_optt_/.test(p.id));
const kept = (cur.customProps || []).filter(p => !isOurs(p));
const removed = (cur.customProps || []).length - kept.length;
const saved = writer.writeEditorOverridesFiles({ customProps: kept.concat(props), huntZones: nextHuntZones }, { baseRev: cur.rev | 0 });
console.log('[layout] сцена: rev ' + saved.rev + ', пропсов ' + saved.customProps.length + ' (заменено своих ' + removed + ', добавлено ' + props.length + ')');

const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const distWorld = path.join(ROOT, 'dist', 'client', 'data', 'world.json');
const r = Bake.bakeToDisk({ extra: fs.existsSync(path.dirname(distWorld)) ? [distWorld] : [] });
console.log('[layout] мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ → ' + (r.written.join(', ') || 'без изменений'));
