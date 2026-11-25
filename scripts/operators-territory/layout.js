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
  opt_bastion_parapet: 'prop', opt_banner_wall: 'prop', opt_banner_hang: 'prop',
  opt_wall_stone: 'prop', opt_column: 'prop', opt_column_broken: 'prop',
  opt_arch: 'prop', opt_ruin_long: 'prop', opt_ruin_corner: 'prop',
  opt_hero_monument: 'prop', opt_cannon: 'prop',
  opt_boiler_station: 'building', opt_boiler_unit: 'prop', opt_steam_wheel: 'prop',
  opt_pipe_arch: 'prop', opt_pipe_straight: 'prop', opt_pipe_vertical: 'prop'
};

// Глубина вкапывания пропсов на естественном склоне: исключает зависание на уклоне
const SINK = {
  opt_column: 0.25, opt_column_broken: 0.25, opt_column_stump: 0.25, opt_column_fallen: 0.16,
  opt_arch: 0.35, opt_ruin_long: 0.55, opt_ruin_corner: 0.45, opt_debris: 0.18, opt_block: 0.18,
  opt_slab: 0.14, opt_hero_monument: 0.20, opt_lamp: 0.15, opt_wall_stone: 0.48,
  opt_rubble_pile: 0.16
};
const CYLINDER = new Set(['opt_column', 'opt_column_broken', 'opt_column_stump', 'opt_lamp', 'opt_hero_monument',
  'opt_dummy', 'opt_bookstand', 'opt_barrel', 'opt_gas_cylinder', 'opt_cable_drum',
  'opt_work_light', 'opt_sack_grain', 'opt_boiler_unit', 'opt_pipe_vertical', 'opt_roof_vent']);

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

function mountWallBannerOnLocalWall(lx, lz, wallY, faceDrot, wallOutwardPush) {
  const push = wallOutwardPush != null ? wallOutwardPush : 0.12;
  const n = rotXZ(0, push, TH0 + faceDrot);
  const w = W(lx, lz);
  report.banners++;
  return addEntryAndColliders('opt_banner_wall', w.x + n.x, wallY, w.z + n.z, TH0 + faceDrot, { noCollision: true, shadow: false });
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

// ---- зелень из уже размещённых в мире моделей ----
const FOLIAGE = {
  bush02: { file: 'bush02.fbx', scale: 0.393, name: 'Кустарник №2 (Растительность)' },
  tree063: { file: 'tree063.fbx', scale: 0.042956, name: 'Ретро дерево №063 (Растительность)' },
  tree060: { file: 'tree060.fbx', scale: 0.047291, name: 'Ретро дерево №060 (Растительность)' },
  matted_pratia_d: { file: 'matted_pratia_d.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер D) (Растительность)' },
  matted_pratia_f: { file: 'matted_pratia_f.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер F) (Растительность)' },
  matted_pratia_h: { file: 'matted_pratia_h.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер H) (Растительность)' },
  field_poppy_f: { file: 'field_poppy_f.fbx', scale: 0.01757, name: 'Мак полевой (Вариант F) (Растительность)' },
  matted_pratia_c: { file: 'matted_pratia_c.fbx', scale: 0.1114, name: 'Пратия стелющаяся (Ковер C) (Растительность)' },
  matted_pratia_g: { file: 'matted_pratia_g.fbx', scale: 0.0433, name: 'Пратия стелющаяся (Ковер G) (Растительность)' },
  grass03: { file: 'grass03.fbx', scale: 0.02186, name: 'Трава лесная №3 (Растительность)' },
  grass05: { file: 'grass05.fbx', scale: 0.01887, name: 'Трава лесная №5 (Растительность)' },
  grass08: { file: 'grass08.fbx', scale: 0.01891, name: 'Трава лесная №8 (Растительность)' },
  grass_bush: { file: 'grass_bush.fbx', scale: 0.01884, name: 'Травяной куст (Растительность)' }
};
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

// Ковры и подиум Командора
putIn('opt_camp_rug', 0.0, -3.5, 0, { scale: 1.0, shadow: false });
putIn('opt_camp_rug', 0.0, +2.6, 0, { scale: 1.0, shadow: false });
putIn('opt_table_long', 0.0, +7.9, 0, { onDais: true });
putIn('opt_chair', -0.8, +9.1, 0, { onDais: true });
putIn('opt_chair', +1.1, +8.8, -0.3, { onDais: true });
putIn('opt_chair', -0.7, +6.9, Math.PI, { onDais: true });
putIn('opt_chair', +0.7, +6.9, Math.PI, { onDais: true });
putIn('opt_bookstand', -2.5, +7.8, 0.25, { onDais: true });
putIn('opt_chest', -3.7, +10.2, 0.2, { onDais: true });
// Настенные стяги ВНУТРИ зала — прикреплены вплотную к задней каменной стене (лицом в зал на юг, drot=0) и боковым пилястрам!
mountWallBannerOnLocalWall(-3.6, inBastionLZ(11.80), FLOOR_Y + 2.8, 0, 0.14);
mountWallBannerOnLocalWall(+3.6, inBastionLZ(11.80), FLOOR_Y + 2.8, 0, 0.14);
mountWallBannerOnLocalWall(-7.80, inBastionLZ(-2.0), FLOOR_Y + 3.2, +Math.PI / 2, 0.14);
mountWallBannerOnLocalWall(+7.80, inBastionLZ(-2.0), FLOOR_Y + 3.2, -Math.PI / 2, 0.14);

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

// Стяги СНАРУЖИ Бастиона (жёстко смонтированы на фасаде YF=-11.0 и передних башнях TY-TW/2=-14.1!)
mountWallBannerOnLocalWall(-10.6, inBastionLZ(-14.12), FLOOR_Y + 3.4, 0, 0.12);
mountWallBannerOnLocalWall(+10.6, inBastionLZ(-14.12), FLOOR_Y + 3.4, 0, 0.12);
mountWallBannerOnLocalWall(-7.4, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.12);
mountWallBannerOnLocalWall(+7.4, inBastionLZ(-11.02), FLOOR_Y + 2.8, 0, 0.12);
// Консольные штандарты выше на ярусе башен (не перекрывают фасадные стяги на 2.8 м)
{
  const twL = W(-7.88, inBastionLZ(-11.4));
  mountCantileverBanner(twL.x, FLOOR_Y, twL.z, 8.2, 0.06, TH0);          // восток (к лестнице)
  const twR = W(+7.88, inBastionLZ(-11.4));
  mountCantileverBanner(twR.x, FLOOR_Y, twR.z, 8.2, 0.06, TH0 + Math.PI); // запад (к лестнице)
}

// ============================================================
//  2. МНОГОУРОВНЕВЫЕ КАМЕННЫЕ ТЕРРАСЫ ПЛОЩАДИ И СТУПЕНИ (0 мм зазоров!)
// ============================================================
// Верхняя парадная площадь (Tier 1) подступает вплотную к нижней ступени Бастиона (bastion.y + 1.37)
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

// 2.2. Мемориальная терраса Монумента Героя (западное крыло): lx ∈ [-45.8..-25.8], lz ∈ [25.2..49.2]
for (const lz of [29.2, 37.2, 45.2]) {
  for (const lx of [-41.8, -33.8, -29.8]) {
    putOn('opt_plaza_deck', lx, lz, MEM_TOP - 1.80, 0, { noCollision: true, shadow: false });
  }
}
addWalkableSlabL('opt_col_deck_mem', -35.8, 37.2, 20.2, 24.2, MEM_TOP, 2.4, 0);

// Широкая 6-ступенчатая лестница + Триумфальная арка между Tier 1 и Мемориальной террасой
// ПРИМЕЧАНИЕ: rotXZ(0, z, +pi/2) = (+z, 0), поэтому верхний край ступеней (z=-1.75) идёт на -X (к MEM_TOP)!
putOn('opt_plaza_steps', -24.15, 37.2, MEM_TOP - 1.80, +Math.PI / 2, { shadow: false });
putOn('opt_arch', -26.4, 37.2, MEM_TOP - 0.12, +Math.PI / 2);

// 2.3. Нижняя площадь аллеи Tier 2: lx ∈ [-12..+12], lz ∈ [51.2..67.2]
putOn('opt_plaza_steps', 0, 50.6, T1_TOP - 1.80, 0, { shadow: false });
for (const lz of [55.2, 63.2]) {
  for (const lx of [-8, 0, 8]) {
    putOn('opt_plaza_deck', lx, lz, T2_TOP - 1.80, 0, { noCollision: true, shadow: false });
  }
}
addWalkableSlabL('opt_col_deck_t2', 0, 59.2, 24.2, 16.3, T2_TOP, 2.2, 0);

// 2.4. Южная входная площадка Tier 3 + переход к естественному рельефу у главных ворот
putOn('opt_plaza_steps', 0, 68.6, T2_TOP - 1.80, 0, { shadow: false });
for (const lx of [-8, 0, 8]) {
  putOn('opt_plaza_deck', lx, 73.2, T3_TOP - 1.80, 0, { noCollision: true, shadow: false });
}
addWalkableSlabL('opt_col_deck_t3', 0, 73.2, 24.2, 8.3, T3_TOP, 2.2, 0);
putOn('opt_plaza_steps', 0, 78.8, T3_TOP - 1.80, 0, { shadow: false });

// Плитный каменный подход перед южными ступенями (на земле, переход к дороге)
for (const lz of [81.6, 84.4, 87.2]) {
  for (const lx of [-2.4, 0, 2.4]) {
    putL('opt_slab', lx, lz, 0, { sink: 0.08, noCollision: true });
  }
}

// 2.5. Крепостные каменные парапеты L2 по периметру террас (ВМЕСТО оград!)
const PARAPET_DY = -1.48 + 0.14; // нижняя юбка -1.4 м прикрывает борт террасы, гребень парапета на +1.3 м
for (const lx of [-21, -17, -13, -9, 9, 13, 17, 21]) {
  if (Math.abs(lx) > 6) putOn('opt_bastion_parapet', lx, 49.0, T1_TOP + PARAPET_DY, 0);
}
for (const lz of [20, 24, 28, 46]) {
  putOn('opt_bastion_parapet', -23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
for (const lz of [20, 24, 46]) {
  putOn('opt_bastion_parapet', +23.8, lz, T1_TOP + PARAPET_DY, Math.PI / 2);
}
// Парапеты на Мемориальной террасе Монумента Героя (север, юг, запад и фланг над Tier 1)
for (const lx of [-43.8, -39.8, -35.8, -31.8, -27.8]) {
  putOn('opt_bastion_parapet', lx, 25.4, MEM_TOP + PARAPET_DY, 0);
  putOn('opt_bastion_parapet', lx, 49.0, MEM_TOP + PARAPET_DY, 0);
}
for (const lz of [27.4, 31.4, 35.4, 39.4, 43.4, 47.0]) {
  putOn('opt_bastion_parapet', -45.6, lz, MEM_TOP + PARAPET_DY, Math.PI / 2);
}
for (const lz of [27.4, 31.4, 43.0, 47.0]) {
  putOn('opt_bastion_parapet', -26.0, lz, MEM_TOP + PARAPET_DY, Math.PI / 2);
}
// Парапеты по краям Нижней площади Tier 2 / Tier 3
for (const lz of [53.2, 57.2, 61.2, 65.2]) {
  putOn('opt_bastion_parapet', -11.8, lz, T2_TOP + PARAPET_DY, Math.PI / 2);
  putOn('opt_bastion_parapet', +11.8, lz, T2_TOP + PARAPET_DY, Math.PI / 2);
}
putOn('opt_bastion_parapet', -11.8, 73.2, T3_TOP + PARAPET_DY, Math.PI / 2);
putOn('opt_bastion_parapet', +11.8, 73.2, T3_TOP + PARAPET_DY, Math.PI / 2);

// ============================================================
//  3. ПАРАДНЫЕ КОЛОННЫ, ФОНАРИ И КОНСОЛЬНЫЕ СТЯГИ НА КОЛОННАХ
// ============================================================
putOn('opt_lamp', -6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 19.6, T1_TOP, 0);
putOn('opt_lamp', -6.2, 47.6, T1_TOP, 0);
putOn('opt_lamp', +6.2, 47.6, T1_TOP, 0);

// Парадная аллея колонн от Tier 1 до Главных ворот — целые колонны несут багровые штандарты!
const AVENUE = [
  { lz: 25.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true },
  { lz: 33.5, deck: T1_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 42.0, deck: T1_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true },
  { lz: 56.0, deck: T2_TOP, L: 'opt_column', R: 'opt_column_broken', bL: true, bR: false },
  { lz: 64.0, deck: T2_TOP, L: 'opt_column_broken', R: 'opt_column', bL: false, bR: true },
  { lz: 72.5, deck: T3_TOP, L: 'opt_column', R: 'opt_column', bL: true, bR: true }
];
for (const row of AVENUE) {
  for (const [lx, kind, hasBanner, inwardAngle] of [
    [-8.5, row.L, row.bL, TH0],           // внутрь проезда (+X локально)
    [+8.5, row.R, row.bR, TH0 + Math.PI]  // внутрь проезда (-X локально)
  ]) {
    const col = putOn(kind, lx, row.lz, row.deck, rr(-0.1, 0.1));
    if (hasBanner && kind === 'opt_column') {
      mountCantileverBanner(col.position.x, col.position.y, col.position.z, 4.4, 0.72, inwardAngle);
    }
  }
}

// ============================================================
//  4. МЕМОРИАЛЬНАЯ ПЛОЩАДЬ С МОНУМЕНТОМ ГЕРОЯ (на западной каменной террасе)
// ============================================================
// Статуя Героя на высокой каменной террасе, лицом на Восток к Бастиону и Парадному плацу!
putOn('opt_hero_monument', -36.5, 37.2, MEM_TOP, +Math.PI / 2);
putOn('opt_lamp', -31.0, 32.0, MEM_TOP, 0);
putOn('opt_lamp', -31.0, 42.4, MEM_TOP, 0);
putOn('opt_lamp', -42.0, 32.0, MEM_TOP, 0);
putOn('opt_lamp', -42.0, 42.4, MEM_TOP, 0);

// 8 мемориальных колонн по периметру площади Монумента (6 целых — со стягами к центру Монумента!)
const MON_RING = [
  [-29.2, 28.4, 'opt_column', true],
  [-36.5, 27.4, 'opt_column', true],
  [-43.2, 28.4, 'opt_column', true],
  [-43.8, 37.2, 'opt_column', true],
  [-43.2, 46.0, 'opt_column', true],
  [-36.5, 47.0, 'opt_column_broken', false],
  [-29.2, 46.0, 'opt_column', true]
];
for (const [lx, lz, kind, hasB] of MON_RING) {
  const cObj = putOn(kind, lx, lz, MEM_TOP, 0);
  if (hasB) {
    // Направление от центра Монумента (-36.5, 37.2) к колонне -> стяг к центру
    const toCenter = Math.atan2(-(37.2 - lz), -36.5 - lx);
    // В трёхмерной СК с базовым поворотом TH0 переводим локальный угол:
    const wCol = W(lx, lz), wCen = W(-36.5, 37.2);
    const worldOut = Math.atan2(-(wCen.z - wCol.z), wCen.x - wCol.x);
    mountCantileverBanner(cObj.position.x, cObj.position.y, cObj.position.z, 4.4, 0.72, worldOut);
  }
}
putOn('opt_bookstand', -32.2, 37.2, MEM_TOP, -Math.PI / 2);
putOn('opt_bench_camp', -32.0, 29.8, MEM_TOP, 0);
putOn('opt_bench_camp', -32.0, 44.6, MEM_TOP, Math.PI);

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
//  6. СТИМПАНК-КОТЕЛЬНАЯ, МАГИСТРАЛИ ТРУБ И ПОЛЕВАЯ КУЗНЯ (восточное крыло Tier 1)
// ============================================================
// Силовой котёл + паровая турбина на крыше + приводные маховики и полевые котлы (чистый L2 стимпанк, без пластиковых шкафов)
putOn('opt_boiler_station', +19.5, 21.8, T1_TOP, -Math.PI * 0.5, { steampunk: true });
putOn('opt_roof_vent', +19.5, 21.8, T1_TOP, 0, { dy: 4.18, noCollision: true, steampunk: true });
putOn('opt_boiler_unit', +13.5, 21.0, T1_TOP, 0.25, { steampunk: true });
putOn('opt_boiler_unit', +20.2, 28.0, T1_TOP, -0.4, { steampunk: true });
putOn('opt_steam_wheel', +14.6, 26.6, T1_TOP, Math.PI * 0.5, { steampunk: true });
putOn('opt_steam_wheel', +19.4, 31.8, T1_TOP, 0.0, { steampunk: true });

// Верхняя эстакада паропроводов от стены Бастиона к котельной и над проходом в кузню
putOn('opt_pipe_arch', +16.6, 34.4, T1_TOP, 0, { steampunk: true });
putOn('opt_pipe_straight', +13.5, 31.8, T1_TOP, Math.PI / 2, { dy: 3.1, noCollision: true, steampunk: true });
// Горизонтальная магистраль вдоль восточной стены котлов + стояки + вентили
for (const px of [12.8, 16.8, 20.8]) {
  putOn('opt_pipe_straight', px, 18.6, T1_TOP, 0, { dy: 2.35, noCollision: true, steampunk: true });
}
putOn('opt_pipe_vertical', +10.8, 18.6, T1_TOP, 0, { steampunk: true });
putOn('opt_pipe_vertical', +22.6, 18.6, T1_TOP, 0, { steampunk: true });
putOn('opt_pipe_elbow', +10.8, 18.6, T1_TOP, Math.PI, { dy: 2.35, noCollision: true, steampunk: true });
putOn('opt_pipe_tee', +16.8, 18.6, T1_TOP, 0, { dy: 2.35, noCollision: true, steampunk: true });
putOn('opt_pipe_valve', +16.8, 19.0, T1_TOP, 0, { dy: 1.85, noCollision: true, steampunk: true });

// Низкая трубная разводка к полевой кузне + точильный станок на верстаке
putOn('opt_pipe_straight', +21.6, 36.2, T1_TOP, Math.PI / 2, { dy: 0.30, steampunk: true });
putOn('opt_pipe_straight', +21.6, 40.2, T1_TOP, Math.PI / 2, { dy: 0.30, steampunk: true });
putOn('opt_pipe_valve', +21.3, 38.2, T1_TOP, -Math.PI / 2, { dy: 0.65, noCollision: true, steampunk: true });
putOn('opt_anvil', +14.6, 38.6, T1_TOP, -0.6);
putOn('opt_whetstone', +16.8, 40.8, T1_TOP, -1.2);
putOn('opt_workbench', +15.2, 44.2, T1_TOP, -Math.PI / 2);
putOn('opt_bench_grinder', +15.2, 44.2, T1_TOP, -Math.PI / 2, { dy: 0.96, noCollision: true, steampunk: true });
putOn('opt_gas_cylinder', +20.2, 42.6, T1_TOP, 0.2);
putOn('opt_gas_cylinder', +21.2, 43.2, T1_TOP, 0.9);
putOn('opt_cable_drum', +19.5, 45.6, T1_TOP, 0.5);
putOn('opt_crate_iron', +13.0, 46.2, T1_TOP, 0.15);
putOn('opt_crate', +16.4, 46.8, T1_TOP, 0.4);
putOn('opt_barrel', +17.8, 46.8, T1_TOP, 0.1);
putOn('opt_sack_grain', +14.6, 46.8, T1_TOP, 0.8);
putOn('opt_work_light', +13.2, 36.6, T1_TOP, -2.2);

// Палатки лагеря и снаряжение на ровной нижней боковой террасе/земле
const campT2 = W(-22.0, 62.0);
putWorldTent('tent_02', campT2.x, campT2.z, TH0 + 0.55);
const campT3 = W(+21.5, 59.5);
putWorldTent('tent_03', campT3.x, campT3.z, TH0 - 0.65);

// ============================================================
//  7. ЮЖНЫЕ ГЛАВНЫЕ ВОРОТА, ПАРОВАЯ АРКА, ОРУДИЯ И КАМЕННЫЕ СТЕНЫ (0 фермерских заборчиков!)
// ============================================================
putL('opt_arch', 0, 83.2, 0);
putL('opt_pipe_arch', 0, 86.8, 0, { steampunk: true });
putL('opt_lamp', -5.8, 86.2, 0);
putL('opt_lamp', +5.8, 86.2, 0);
putOn('opt_cannon', -11.5, 72.8, T3_TOP, +0.12);
putOn('opt_cannon', +11.5, 72.8, T3_TOP, -0.12);

// Внешний каменный вал L2 по флангам южных ворот (opt_wall_stone — глубоко вкопан в склон!)
for (const lx of [-14.2, -17.4, -20.6, -27.0, -30.2, 14.2, 17.4, 20.6, 27.0, 30.2]) {
  putL('opt_wall_stone', lx, 82.8, rr(-0.03, 0.03));
}
// Магистральные трубы и резервуары вдоль флангов внешних ворот
putL('opt_boiler_unit', -16.0, 77.5, 0.3, { steampunk: true });
putL('opt_boiler_unit', +16.0, 77.5, -0.3, { steampunk: true });

// Каменный руинный внешний контур вокруг всей базы операторов (с заглублением -0.55 м — не парит!)
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

// Обломки по внешнему периметру (не заходят на террасы и плац!)
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
//  8. ПОЛЕ РУИН НА ЗАПАДНОМ СКЛОНЕ К ДОРОГЕ ИЗ ДЕРЕВНИ
// ============================================================
const FIELD = [
  ['opt_column_broken', 190, 122], ['opt_column_stump', 176, 141], ['opt_column', 201, 168],
  ['opt_column_stump', 166, 176], ['opt_debris', 185, 150], ['opt_rubble_pile', 206, 135],
  ['opt_ruin_long', 172, 108], ['opt_ruin_corner', 214, 186], ['opt_column_fallen', 186, 191],
  ['opt_rubble_pile', 180, 165], ['opt_debris', 195, 112],
  ['opt_ruin_long', 238, 214], ['opt_column_broken', 231, 208], ['opt_column_stump', 245, 219]
];
for (const [kind, x, z] of FIELD) put(kind, x, z, rr(0, Math.PI * 2));
for (let i = 0; i < 8; i++) put('opt_block', rr(165, 220), rr(102, 202), rr(0, 6.28), { scale: rr(0.8, 1.15) });

// ============================================================
//  9. ЗЕЛЕНЬ ПО ВНЕШНЕМУ ПЕРИМЕТРУ (СТРОГО ВНЕ ВСЕХ КАМЕННЫХ ТЕРРАС И БАСТИОНА!)
// ============================================================
function isWorldInsideComplex(wx, wz) {
  const dx = wx - C.x, dz = wz - C.z;
  const c = Math.cos(TH0), s = Math.sin(TH0);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return lx > -50 && lx < 30 && lz > -24 && lz < 88;
}
const nearRuins = props.filter(p =>
  p.instanced &&
  p.category === 'ruins' &&
  p.modelId !== 'opt_bastion' && p.modelId !== 'opt_slab' && p.modelId !== 'opt_plaza_deck' && p.modelId !== 'opt_plaza_steps' && p.modelId !== 'opt_bastion_parapet' &&
  !isWorldInsideComplex(p.position.x, p.position.z) &&
  Math.hypot(p.position.x - C.x, p.position.z - C.z) > 48
);
for (let i = 0; i < 14 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(2.4, 4.4);
  const gx = p.position.x + Math.cos(a) * r, gz = p.position.z + Math.sin(a) * r;
  if (!isWorldInsideComplex(gx, gz)) plant('bush02', gx, gz);
}
for (const [lx, lz, kind] of [[-54, -42, 'tree063'], [46, -40, 'tree060'], [-52, 88, 'tree060'], [46, 86, 'tree063'],
[-55, 24, 'tree063'], [50, 14, 'tree060']]) {
  const w = W(lx, lz);
  plant(kind, w.x, w.z);
}
const CARPETS = ['matted_pratia_d', 'matted_pratia_f', 'matted_pratia_h', 'matted_pratia_c', 'matted_pratia_g', 'field_poppy_f'];
for (let i = 0; i < 48 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(1.6, 4.4);
  const gx = p.position.x + Math.cos(a) * r, gz = p.position.z + Math.sin(a) * r;
  if (!isWorldInsideComplex(gx, gz)) plant(CARPETS[i % CARPETS.length], gx, gz);
}
const TUFTS = ['grass03', 'grass05', 'grass08', 'grass_bush'];
let tufts = 0;
for (let tries = 0; tries < 2500 && tufts < 120; tries++) {
  const lx = rr(-55, 48), lz = rr(-42, 94);
  if (insideTerraces(lx, lz)) continue;
  const w = W(lx, lz);
  plant(TUFTS[tufts % TUFTS.length], w.x, w.z);
  tufts++;
}

// ============================================================
//  МИРНАЯ СУБ-ЗОНА «БАЗА ОПЕРАТОРОВ» (накрывает Бастион + всю площадь + Мемориал!)
// ============================================================
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const MDB = require(path.join(ROOT, 'shared', 'mob-db.js'));
globalThis.MOB_DB = MDB;

const editorFile = path.join(ROOT, 'shared', 'editor-overrides.json');
const curOverrides = JSON.parse(fs.readFileSync(editorFile, 'utf8'));

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
