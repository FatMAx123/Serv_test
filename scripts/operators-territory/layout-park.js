// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT-PARK.JS  (v12)
//  Окрестности базы операторов — по дорогам, которые автор нарисовал на террейне и карте.
//   • дороги не трогаем и не дорисовываем: маска road-mask.json (road_mask.py) — запрет
//     для любого объекта, дерева и куста; рельеф и покраска террейна не меняются;
//   • Большой мост — там, где правая дорога автора пересекает Ржавую реку;
//   • бывший парк механиков у левой дороги: площадь с сухим фонтаном, кольцо лип,
//     аллея от дороги, беседка над руслом, остов оранжереи — без оград и газонов;
//   • берега реки — ивы, ольха, валуны и коряги по кромке, следы аварии в воде;
//   • поля между деревней и лагерем — редкие рощи, руины хутора; промзона у лагеря.
//  Всё — внутри контура зоны (с небольшим запасом): соседние локации не задеваем.
//  Оптимизация: кит opt_* на одном атласе (InstancedMesh), растительность — модели
//  библиотеки; травяных «ковров» и покрова нет.
// ============================================================
'use strict';

const RIVER = require('./river-path.json');
const ROADMASK = require('./road-mask.json');

// ---- Споты мобов (тот же порядок/уровни/число; места — по участкам, не на дорогах) ----
const SPOT_R_UV = 0.0072;
const SPOTS = [
  [0, 'tutorial_target', 205, 110],   // поле у ворот лагеря
  [1, 'loose_bolt', 240, 40],         // северный луг
  [2, 'scrapper', 160, 118],          // поле между деревней и лагерем
  [3, 'scrapper', 105, 150],          // западное поле
  [4, 'loose_bolt', 300, 38],         // северный луг
  [5, 'tutorial_target', 55, 172],    // поле у левой дороги
  [6, 'scrapper', 270, 205],          // промзона
  [7, 'scrapper', 150, 200],          // луг у хутора
  [8, 'loose_bolt', 122, 262],        // парк: восточная поляна
  [9, 'scrapper', 350, 52],           // северо-восток
  [10, 'tutorial_target', 44, 272],   // парк: западная поляна
  [11, 'loose_bolt', 356, 150],       // восточный склон
  [12, 'scrapper', 300, 288],         // акведук
  [13, 'rust_mite', 300, 410],        // пойма реки
  [14, 'tutorial_target', 330, 250],  // промзона, восток
  [15, 'rust_mite', 252, 396],        // пойма у излучины
  [16, 'rust_mite', 192, 362],        // северный берег
  [17, 'loose_bolt', 362, 428],       // у Большого моста, в стороне от дороги
  [18, 'scrapper', 160, 304],         // берег под парком
  [19, 'toaster_overlord', 214, 402]  // у прорванного водовода (исток реки)
];

// Контур зоны: юг — река с Большим мостом, запад — левая дорога, северо-запад — деревня
const ZONE_POLY = [
  [28, 96], [217, 32], [371, 9], [362, 274], [420, 470], [392, 512], [300, 478],
  [230, 452], [150, 424], [90, 396], [20, 370], [8, 250]
];

// ---- Растительность из библиотеки (масштабы — как в каталоге редактора) ----
const FOLIAGE_EXTRA = {
  tree097: { file: 'tree097.fbx', scale: 0.0425, name: 'Клён раскидистый' },
  tree100: { file: 'tree100.fbx', scale: 0.0425, name: 'Клён полевой' },
  tree106: { file: 'tree106.fbx', scale: 0.0425, name: 'Липа' },
  tree107: { file: 'tree107.fbx', scale: 0.0425, name: 'Дуб молодой' },
  tree110: { file: 'tree110.fbx', scale: 0.0425, name: 'Липа светлая' },
  tree113: { file: 'tree113.fbx', scale: 0.0425, name: 'Вяз' },
  tree114: { file: 'tree114.fbx', scale: 0.0425, name: 'Граб' },
  tree118: { file: 'tree118.fbx', scale: 0.0425, name: 'Ясень' },
  tree086: { file: 'tree086.fbx', scale: 0.0507, name: 'Сосна зонтичная' },
  tree076: { file: 'tree076.fbx', scale: 0.0507, name: 'Ива плакучая' },
  tree087: { file: 'tree087.fbx', scale: 0.0507, name: 'Ольха' },
  tree093: { file: 'tree093.fbx', scale: 0.0507, name: 'Берёза' },
  tree073: { file: 'tree073.fbx', scale: 0.0507, name: 'Яблоня в цвету' },
  tree074: { file: 'tree074.fbx', scale: 0.0507, name: 'Вишня в цвету' },
  tree089: { file: 'tree089.fbx', scale: 0.0507, name: 'Черёмуха' },
  tree016: { file: 'tree016.fbx', scale: 0.0548, name: 'Клён осенний' },
  tree018: { file: 'tree018.fbx', scale: 0.0548, name: 'Осина осенняя' },
  tree001: { file: 'tree001.fbx', scale: 0.0484, name: 'Голое дерево' },
  tree004: { file: 'tree004.fbx', scale: 0.0484, name: 'Голое дерево (крона)' },
  tree008: { file: 'tree008.fbx', scale: 0.0484, name: 'Сухое дерево' },
  tree055: { file: 'tree055.fbx', scale: 0.0339, name: 'Ель' },
  tree057: { file: 'tree057.fbx', scale: 0.0339, name: 'Ель тёмная' },
  tree061: { file: 'tree061.fbx', scale: 0.0339, name: 'Пихта' },
  tree_rt_1: { file: 'tree_rt_1.fbx', scale: 7.3661, name: 'Ель лесная' },
  tree_rt_3: { file: 'tree_rt_3.fbx', scale: 4.3257, name: 'Сосна' },
  tree_rt_4: { file: 'tree_rt_4.fbx', scale: 3.5072, name: 'Дуб старый' },
  small_tree_rt_1: { file: 'small_tree_rt_1.fbx', scale: 4.7541, name: 'Молодая ель' },
  retro_bush2_summer: { file: 'retro_bush2_summer.fbx', scale: 0.0357, name: 'Куст летний №2' },
  retro_bush5_summer: { file: 'retro_bush5_summer.fbx', scale: 0.025, name: 'Куст летний №5' },
  retro_bush6_summer: { file: 'retro_bush6_summer.fbx', scale: 0.025, name: 'Куст летний №6' },
  retro_bush7_summer: { file: 'retro_bush7_summer.fbx', scale: 0.025, name: 'Куст летний №7' },
  retro_bush03: { file: 'retro_bush03.fbx', scale: 0.025, name: 'Куст №03' },
  retro_bush05: { file: 'retro_bush05.fbx', scale: 0.025, name: 'Куст №05' },
  bush03: { file: 'bush03.fbx', scale: 0.3733, name: 'Кустарник №3' },
  bush05: { file: 'bush05.fbx', scale: 0.3733, name: 'Кустарник №5' },
  bush07: { file: 'bush07.fbx', scale: 0.3733, name: 'Кустарник №7' },
  forest_Log_3: { file: 'Log_3.fbx', scale: 3.2203, name: 'Бревно №3' },
  forest_Stump_3: { file: 'Stump_3.fbx', scale: 4.5833, name: 'Пень №3' }
};
const FOOT_EXTRA = {
  tree097: 2.2, tree100: 2.2, tree106: 2.2, tree107: 2.2, tree110: 2.2, tree113: 2.2, tree114: 2.2, tree118: 2.2,
  tree086: 2.4, tree076: 2.6, tree087: 1.8, tree093: 1.8, tree073: 2.2, tree074: 2.2, tree089: 2.2, tree016: 2.2, tree018: 2.0,
  tree001: 2.0, tree004: 2.0, tree008: 1.8, tree055: 1.7, tree057: 1.7, tree061: 1.7, tree_rt_1: 1.8, tree_rt_3: 1.8, tree_rt_4: 2.6,
  small_tree_rt_1: 1.2, retro_bush2_summer: 1.5, retro_bush5_summer: 1.5, retro_bush6_summer: 1.5, retro_bush7_summer: 1.5,
  retro_bush03: 1.5, retro_bush05: 1.5, bush03: 1.45, bush05: 1.45, bush07: 1.45, forest_Log_3: 2.4, forest_Stump_3: 1.6
};

// Палитры биомов (без травяных спрайтов: на дороге и в поле — ни одного «квадрата травы»)
const P_PARK = ['tree106', 'tree110', 'tree114'];
const P_BLOSSOM = ['tree073', 'tree074', 'tree089'];
const P_FIELD = ['tree107', 'tree113', 'tree118', 'tree097', 'tree_rt_4', 'tree086', 'tree100'];
const P_AUTUMN = ['tree016', 'tree018'];
const P_RIVER = ['tree076', 'tree087', 'tree093', 'tree076'];
const P_CONIFER = ['tree055', 'tree057', 'tree061', 'tree_rt_1', 'tree_rt_3', 'small_tree_rt_1'];
const P_DEAD = ['tree001', 'tree004', 'tree008'];
const P_BUSH = ['retro_bush2_summer', 'retro_bush5_summer', 'retro_bush6_summer', 'retro_bush7_summer', 'retro_bush03', 'retro_bush05', 'bush03', 'bush05'];
const P_BUSH_DARK = ['bush01', 'bush02', 'bush04', 'bush07'];

// ---- Маска дорог автора → поле расстояний до дороги (м) ----
const RNX = ROADMASK.nx, RNZ = ROADMASK.nz, RCELL = ROADMASK.cell;
const RDIST = (function () {
  const bits = Buffer.from(ROADMASK.bits, 'base64');
  const d = new Float32Array(RNX * RNZ);
  for (let k = 0; k < d.length; k++) d[k] = (bits[k >> 3] >> (k & 7)) & 1 ? 0 : 1e9;
  const D1 = RCELL, D2 = RCELL * Math.SQRT2;
  for (let j = 0; j < RNZ; j++) {
    for (let i = 0; i < RNX; i++) {
      const k = j * RNX + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + D1);
      if (j > 0) {
        v = Math.min(v, d[k - RNX] + D1);
        if (i > 0) v = Math.min(v, d[k - RNX - 1] + D2);
        if (i < RNX - 1) v = Math.min(v, d[k - RNX + 1] + D2);
      }
      d[k] = v;
    }
  }
  for (let j = RNZ - 1; j >= 0; j--) {
    for (let i = RNX - 1; i >= 0; i--) {
      const k = j * RNX + i;
      let v = d[k];
      if (i < RNX - 1) v = Math.min(v, d[k + 1] + D1);
      if (j < RNZ - 1) {
        v = Math.min(v, d[k + RNX] + D1);
        if (i < RNX - 1) v = Math.min(v, d[k + RNX + 1] + D2);
        if (i > 0) v = Math.min(v, d[k + RNX - 1] + D2);
      }
      d[k] = v;
    }
  }
  return d;
})();
/** Расстояние до ближайшей клетки нарисованной дороги (м, с запасом на размер клетки). */
function roadDist(x, z) {
  const i = Math.floor((x - ROADMASK.x0) / RCELL), j = Math.floor((z - ROADMASK.z0) / RCELL);
  if (i < 0 || j < 0 || i >= RNX || j >= RNZ) return 1e9;
  return Math.max(0, RDIST[j * RNX + i] - RCELL * 0.75);
}
function nearRoad(x, z, pad) { return roadDist(x, z) < pad; }

// ---- Контур зоны ----
function distToSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}
function inZone(x, z, margin) {
  let inside = false;
  for (let i = 0, j = ZONE_POLY.length - 1; i < ZONE_POLY.length; j = i++) {
    const [xi, zi] = ZONE_POLY[i], [xj, zj] = ZONE_POLY[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  if (inside || !margin) return inside;
  for (let i = 0, j = ZONE_POLY.length - 1; i < ZONE_POLY.length; j = i++) {
    if (distToSeg(x, z, ZONE_POLY[j][0], ZONE_POLY[j][1], ZONE_POLY[i][0], ZONE_POLY[i][1]) < margin) return true;
  }
  return false;
}

module.exports = function placeOutskirts(api) {
  const { PIECES, put, addEntryAndColliders, plant, canOccupyAt, registerOccupy, ground, report, isNearOpSpot, FOLIAGE, FOLIAGE_FOOTPRINT_HALF } = api;
  // тропа лагеря из плит (layout.js) — тоже проход: на ней ничего не ставим
  const nearTrail = api.nearTrail || (() => false);
  const blocked = (x, z, pad) => nearRoad(x, z, pad) || nearTrail(x, z, pad + 1.5);
  Object.assign(FOLIAGE, FOLIAGE_EXTRA);
  Object.assign(FOLIAGE_FOOTPRINT_HALF, FOOT_EXTRA);

  let seed = 61211;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  const facing = (dx, dz) => Math.atan2(dx, dz);
  const alongX = (dx, dz) => Math.atan2(-dz, dx);
  function norm(dx, dz) { const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, L }; }

  // ------------------------------------------------------------
  //  Вода: ближайшая точка оси, мокрая зона, кромки
  // ------------------------------------------------------------
  const RP = RIVER.pts;
  let rMinX = Infinity, rMaxX = -Infinity, rMinZ = Infinity, rMaxZ = -Infinity;
  for (const p of RP) { rMinX = Math.min(rMinX, p.x); rMaxX = Math.max(rMaxX, p.x); rMinZ = Math.min(rMinZ, p.z); rMaxZ = Math.max(rMaxZ, p.z); }
  function riverNearest(x, z) {
    let best = null, bd = Infinity;
    for (const p of RP) { const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (d < bd) { bd = d; best = p; } }
    return { p: best, d: Math.sqrt(bd) };
  }
  function inWater(x, z, margin, edgePad) {
    if (x < rMinX - 50 || x > rMaxX + 50 || z < rMinZ - 50 || z > rMaxZ + 50) return false;
    const { p, d } = riverNearest(x, z);
    if (d > 52) return false;
    let gy;
    try { gy = ground(x, z); } catch (e) { return true; }
    if (gy < p.s + (margin != null ? margin : 0.25)) return true;
    if (edgePad) {
      const lat = (x - p.x) * p.nx + (z - p.z) * p.nz;
      const edge = lat >= 0 ? (p.wr - 2.2) : (p.wl - 2.2);
      if (Math.abs(lat) < edge + edgePad) return true;
    }
    return false;
  }
  function bankPoint(i, side, extra) {
    const p = RP[Math.max(0, Math.min(RP.length - 1, i))];
    const off = side > 0 ? (p.wr - 2.2 + extra) : -(p.wl - 2.2 + extra);
    return { x: p.x + p.nx * off, z: p.z + p.nz * off, p };
  }

  // ------------------------------------------------------------
  //  Размещение с проверками: дорога, вода, споты, контур зоны, занятость
  // ------------------------------------------------------------
  const placed = { solid: 0, foliage: 0, gc: 0 };
  const CLEAR = [];   // круги, свободные от расстановки (мосты и их подходы)
  function inClear(x, z, pad) { return CLEAR.some(c => Math.hypot(x - c.x, z - c.z) < c.r + (pad || 0)); }
  function fp(piece, scale) { const m = PIECES[piece]; return { hx: m.size[0] * (scale || 1) * 0.5, hz: m.size[2] * (scale || 1) * 0.5 }; }
  function tryPut(piece, x, z, rotY, opt) {
    opt = opt || {};
    const { hx, hz } = fp(piece, opt.scale);
    const mul = opt.footprintMul || 0.94;
    if (!opt.force) {
      if (!canOccupyAt(x, z, hx * mul, hz * mul, rotY, 'SOLID', { gap: opt.gap != null ? opt.gap : 0.35 })) return null;
      if (!opt.wet && blocked(x, z, Math.max(hx, hz) + (opt.roadPad != null ? opt.roadPad : 3.0))) return null;
      if (!opt.wet && inWater(x, z, 0.15)) return null;
      if (opt.wet && !inWater(x, z, 0.4)) return null;
      if (inClear(x, z, Math.max(hx, hz))) return null;
      if (!inZone(x, z, 14)) return null;
      if (opt.spotPad !== 0 && isNearOpSpot(x, z, opt.spotPad || 5.5)) return null;
    }
    const res = put(piece, x, z, rotY, opt);
    placed.solid++;
    return res;
  }
  /** Постройка на склоне с глубоким цоколем: верх (y = top) — вровень с землёй с верхней стороны. */
  function putTerrace(piece, x, z, rotY, refAboveBase, opt) {
    opt = opt || {};
    const m = PIECES[piece];
    const hw = m.size[0] * 0.5 * 0.92, hd = m.size[2] * 0.5 * 0.92;
    let gMax = -Infinity, gMin = Infinity;
    for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = Math.cos(rotY), s = Math.sin(rotY);
      const ox = a * hw * c + b * hd * s, oz = -a * hw * s + b * hd * c;
      const g = ground(x + ox, z + oz);
      gMax = Math.max(gMax, g); gMin = Math.min(gMin, g);
    }
    const ref = (opt.flushMax ? gMax : (gMax * 0.6 + gMin * 0.4)) + (opt.lift || 0);
    const res = addEntryAndColliders(piece, x, ref - refAboveBase, z, rotY, Object.assign({ category: 'ruins' }, opt));
    placed.solid++;
    report.camp++;
    return { prop: res, drop: gMax - gMin, ref };
  }
  function tryPlant(kind, x, z, opt) {
    opt = opt || {};
    if (!FOLIAGE[kind]) throw new Error('нет растения ' + kind);
    // масштаб и поворот — до проверки: след в карте занятости тот же, что проверялся
    const sm = opt.scaleMul || rr(0.88, 1.1);
    const ry = opt.rotY != null ? opt.rotY : rr(0, Math.PI * 2);
    opt = Object.assign({}, opt, { scaleMul: sm, rotY: ry });
    const half = (FOLIAGE_FOOTPRINT_HALF[kind] || 1.2) * sm;
    const isTree = /^(tree|small_tree|dead_tree)/i.test(kind);
    if (!opt.force) {
      if (!canOccupyAt(x, z, half, half, ry, opt.asGroundcover ? 'GROUNDCOVER' : 'FOLIAGE', { gap: opt.gap != null ? opt.gap : 0.6 })) return false;
      // крона дерева не нависает над дорогой: запас = половина кроны + 3.5 м
      if (blocked(x, z, (isTree ? half * 1.6 + 3.5 : half + 2.5) + (opt.roadPad || 0))) return false;
      if (!opt.wet && inWater(x, z, opt.waterMargin != null ? opt.waterMargin : 0.25)) return false;
      if (inClear(x, z, half)) return false;
      if (!inZone(x, z, opt.zoneMargin != null ? opt.zoneMargin : 14)) return false;
      if (opt.spotPad && isNearOpSpot(x, z, opt.spotPad)) return false;
    }
    plant(kind, x, z, {
      scaleMul: sm, rotY: ry,
      rx: opt.rx != null ? opt.rx : rr(-0.03, 0.03), rz: opt.rz != null ? opt.rz : rr(-0.03, 0.03),
      y: opt.y, sink: opt.sink, asGroundcover: !!opt.asGroundcover
    });
    placed.foliage++;
    return true;
  }
  /** Роща: деревья палитры с разносом и немного подлеска — естественное пятно, не ряд. */
  function grove(cx, cz, r, n, palette, opt) {
    opt = opt || {};
    const pts = [];
    for (let t = 0; t < n * 14 && pts.length < n; t++) {
      const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (pts.some(q => Math.hypot(q[0] - x, q[1] - z) < (opt.minSep || 7.5))) continue;
      if (tryPlant(pick(palette), x, z, { spotPad: opt.spotPad || 9, scaleMul: rr(0.78, 1.02), gap: 0.7 })) pts.push([x, z]);
    }
    const nb = Math.round(pts.length * (opt.bush != null ? opt.bush : 0.5));
    for (let k = 0, t = 0; k < nb && t < nb * 6; t++) {
      const q = pts[t % pts.length];
      if (!q) break;
      const a = rr(0, Math.PI * 2), d = rr(3.0, 5.5);
      if (tryPlant(pick(opt.under || P_BUSH), q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d, { spotPad: 6, scaleMul: rr(0.9, 1.2), gap: 0.3 })) k++;
    }
    return pts.length;
  }

  // ============================================================
  //  A. БОЛЬШОЙ МОСТ — на переправе дороги автора через реку
  // ============================================================
  const BR_REF = 10.5;   // край настила над низом модели (kit_park.py: BR_END − BR_BOTTOM)
  function nearestIdx(x, z) {
    let bi = 0, bd = Infinity;
    RP.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }
  /** Створ моста у переправы дороги: въезды вровень с берегом, подъём с моста на оба берега
   *  проходим (уклон подхода не круче шага персонажа), оба подхода — на нарисованной дороге. */
  function bridgeSite(i0, span, reach) {
    const h = span / 2;
    let best = null;
    for (let i = Math.max(1, i0 - reach); i <= Math.min(RP.length - 2, i0 + reach); i++) {
      const p = RP[i];
      const c0 = ((p.wr - 2.2) - (p.wl - 2.2)) / 2;
      for (let deg = -24; deg <= 24; deg += 4) {
        const t = deg * Math.PI / 180, ux = p.nx * Math.cos(t) - p.nz * Math.sin(t), uz = p.nx * Math.sin(t) + p.nz * Math.cos(t);
        for (let sh = -4; sh <= 4; sh += 2) {
          const cx = p.x + p.nx * (c0 + sh), cz = p.z + p.nz * (c0 + sh);
          const A = [cx - ux * h, cz - uz * h], B = [cx + ux * h, cz + uz * h];
          const at = (sgn, k) => ground(cx + ux * sgn * (h + k), cz + uz * sgn * (h + k));
          const hiA = Math.max(at(-1, 0), at(-1, 1.6)), hiB = Math.max(at(1, 0), at(1, 1.6));
          const dhi = Math.abs(hiA - hiB);
          const top = Math.max(hiA, hiB) + 0.05 - Math.min(0.35, dhi * 0.5);   // высокий въезд чуть утоплен в берег, низкий — без ступени
          if (inWater(A[0], A[1], 0.4) || inWater(B[0], B[1], 0.4) || top < p.s + 3) continue;
          const step = top - Math.min(hiA, hiB);
          // подъём от края настила вглубь берега: худший уклон на 14 м подхода
          let climb = 0;
          for (const sgn of [-1, 1]) {
            let prev = top;
            for (let k = 1; k <= 14; k += 1) { const g = at(sgn, k); climb = Math.max(climb, g - prev); prev = Math.max(g, prev - 2.0); }
          }
          const offRoad = Math.min(roadDist(cx - ux * (h + 8), cz - uz * (h + 8)), 30) + Math.min(roadDist(cx + ux * (h + 8), cz + uz * (h + 8)), 30);
          const cost = step * 2 + Math.max(0, climb - 0.55) * 12 + offRoad * 0.15 + Math.abs(i - i0) * 0.05 + Math.abs(deg) * 0.01;
          if (!best || cost < best.cost) best = { i, cx, cz, A, B, ux, uz, top, step, climb, offRoad, cost, p };
        }
      }
    }
    return best;
  }
  function placeBridge(i0, span, id) {
    const S = bridgeSite(i0, span, 14);
    if (!S) throw new Error('нет створа для моста ' + id);
    const { cx, cz, A, B, top, ux, uz } = S, h = span / 2;
    const gA = ground(A[0], A[1]), gB = ground(B[0], B[1]);
    const rot = alongX(ux, uz);
    const res = addEntryAndColliders('opt_bridge_stone', cx, top - BR_REF, cz, rot, { id, category: 'ruins', drawDist: 900 });
    placed.solid++;
    report.camp++;
    CLEAR.push({ x: cx, z: cz, r: h + 8 });
    // фонари у въездов — по продолжению парапетов, сам проезд свободен
    const halfW = PIECES.opt_bridge_stone.size[2] * 0.5 + 0.6;
    const lamp = fp('opt_lamp');
    for (const end of [A, B]) {
      const ex = (end[0] - cx) / h, ez = (end[1] - cz) / h;
      for (const side of [-1, 1]) {
        const x = end[0] + ex * 2.2 - ez * side * halfW, z = end[1] + ez * 2.2 + ex * side * halfW;
        if (!canOccupyAt(x, z, lamp.hx, lamp.hz, 0, 'SOLID', { gap: 0.2 })) continue;
        put('opt_lamp', x, z, 0, { sink: 0.18 });
        placed.solid++;
      }
    }
    return { res, dh: +Math.abs(gA - gB).toFixed(2), step: +S.step.toFixed(2), climb: +S.climb.toFixed(2), offRoad: +S.offRoad.toFixed(1), top: +top.toFixed(2), at: [Math.round(cx), Math.round(cz)] };
  }
  const bridge1 = placeBridge(nearestIdx(371, 491), 44, 'opt_bridge_stone_main');
  // старый каменный мост у устья рухнул: пролёт в воде (переправы нет — только руина)
  {
    let bi = -1, bw = Infinity;
    RP.forEach((p, i) => { if (p.d < RP[RP.length - 1].d - 140 || p.d > RP[RP.length - 1].d - 60) return; const w = p.wl + p.wr; if (w < bw) { bw = w; bi = i; } });
    if (bi >= 0) {
      const p = RP[bi], c = ((p.wr - 2.2) - (p.wl - 2.2)) / 2;
      const sc = Math.max(1.0, Math.min(1.6, (p.wl + p.wr - 4.4 + 6) / 12));
      tryPut('opt_ruin_bridge', p.x + p.nx * c, p.z + p.nz * c, alongX(p.nx, p.nz) + 0.06, { scale: +sc.toFixed(2), wet: true, sink: 0.9, spotPad: 0, gap: 0.2, force: true, id: 'opt_ruin_bridge_mouth' });
    }
  }

  // ============================================================
  //  B. БЫВШИЙ ПАРК МЕХАНИКОВ У ЛЕВОЙ ДОРОГИ
  //  Площадь с сухим фонтаном в кольце лип; аллея от дороги; беседка над руслом;
  //  остов оранжереи. Ни оград, ни ворот, ни газонов — парк зарос, остались деревья и камень.
  // ============================================================
  const F = [80, 246];         // площадь фонтана
  const P = [82, 280];         // беседка над руслом
  const G = [118, 222];        // остов оранжереи
  putTerrace('opt_park_fountain', F[0], F[1], 0.3, 1.0, { id: 'opt_park_fountain_01', lift: -0.25 });
  for (const ang of [0.55, 2.2, 3.7, 5.3]) {
    const x = F[0] + Math.cos(ang) * 8.4, z = F[1] + Math.sin(ang) * 8.4;
    tryPut(rnd() < 0.3 ? 'opt_park_bench_broken' : 'opt_park_bench', x, z, facing(F[0] - x, F[1] - z), { sink: 0.03, gap: 0.2, spotPad: 0 });
  }
  for (const ang of [0.0, 1.57, 3.14, 4.71]) {
    const a = ang + 0.78, x = F[0] + Math.cos(a) * 11, z = F[1] + Math.sin(a) * 11;
    tryPut(rnd() < 0.25 ? 'opt_park_lamp_bent' : 'opt_park_lamp', x, z, alongX(F[0] - x, F[1] - z), { sink: 0.1, gap: 0.2, spotPad: 0 });
  }
  // кольцо лип вокруг площади: проходы на запад (аллея от дороги) и на юг (к беседке)
  for (let k = 0; k < 14; k++) {
    const a = k * (Math.PI * 2 / 14);
    const dx = Math.cos(a), dz = Math.sin(a);
    if (dx < -0.8 || dz > 0.85) continue;
    const x = F[0] + dx * 18, z = F[1] + dz * 18;
    const roll = rnd();
    if (roll < 0.1) { tryPlant('forest_Stump_3', x, z, { scaleMul: rr(0.7, 0.9), spotPad: 4 }); continue; }
    tryPlant(roll < 0.25 ? pick(P_BLOSSOM) : pick(P_PARK), x, z, { scaleMul: rr(0.8, 0.95), gap: 0.4, spotPad: 4 });
  }
  // аллея от левой дороги к площади: липы парами, часть выпала
  for (let x = 38; x <= 60; x += 9.5) {
    for (const side of [-1, 1]) {
      if (rnd() < 0.15) continue;
      tryPlant(pick(P_PARK), x + rr(-0.4, 0.4), F[1] + side * 6 + rr(-0.4, 0.4), { scaleMul: rr(0.8, 0.95), gap: 0.4, spotPad: 4, rotY: rr(0, 6.28) });
    }
  }
  // беседка-ротонда над руслом: терраса, вход со стороны площади
  const pav = putTerrace('opt_park_pavilion', P[0], P[1], facing(F[0] - P[0], F[1] - P[1]), 2.0, { id: 'opt_park_pavilion_01', flushMax: true, lift: 0.04 });
  for (const [dx, dz] of [[-8, 3], [8.5, 2]]) tryPlant(pick(P_BUSH), P[0] + dx, P[1] + dz, { scaleMul: rr(1.0, 1.2), spotPad: 3, gap: 0.3 });
  // оранжерея (терраса), внутри — одичавшие грядки
  const gh = putTerrace('opt_park_greenhouse', G[0], G[1], 0, 1.0, { id: 'opt_park_greenhouse_01' });
  for (const c of (PIECES.opt_park_greenhouse.colliders || [])) {
    registerOccupy('opt_park_greenhouse_01_w', 'SOLID', G[0] + c.x, G[1] + c.z, c.w * 0.5, c.d * 0.5, 0, { group: 'gh', external: true });
  }
  const ghFloor = gh.prop.position.y + 1.0;
  for (const sz of [-1.85, 1.85]) {
    for (const sx of [-3.8, 1.2]) {
      tryPlant(pick(['retro_bush5_summer', 'retro_bush6_summer', 'bush03']), G[0] + sx + rr(-0.3, 0.3), G[1] + sz, { force: true, y: ghFloor + 0.32, scaleMul: rr(0.6, 0.7), asGroundcover: true });
    }
  }
  // восточная часть парка одичала: роща
  grove(150, 254, 11, 4, P_PARK.concat(P_BLOSSOM), { bush: 0.6 });

  // ============================================================
  //  C. РЕКА: прорванный водовод у истока, берега, следы аварии в воде
  // ============================================================
  // исток реки — устье прорванного водовода в голове оврага: лицевая стенка закрывает начало воды
  const L0 = RP[0], Lt = norm(RP[2].x - RP[0].x, RP[2].z - RP[0].z);
  const Lc = ((L0.wr - 2.2) - (L0.wl - 2.2)) / 2;
  const culvBack = PIECES.opt_river_culvert.size[2] * 0.5 - 0.9;
  const culv = put('opt_river_culvert', L0.x + L0.nx * Lc - Lt.x * culvBack, L0.z + L0.nz * Lc - Lt.z * culvBack, facing(Lt.x, Lt.z), { sink: 0.6, id: 'opt_river_culvert_01' });
  CLEAR.push({ x: L0.x, z: L0.z, r: 9 });
  placed.solid++;
  const lastD = RP[RP.length - 1].d;
  for (let i = 0; i < RP.length; i++) {
    const p = RP[i];
    if (p.d > lastD - 60) break;
    // ивы и ольха — по кромке берега, редко и вразнобой
    if (i % 4 === 1) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(3, 9));
      tryPlant(pick(P_RIVER), b.x, b.z, { spotPad: 7, scaleMul: rr(0.75, 1.0), gap: 0.8 });
    }
    if (i % 6 === 3) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(2, 5));
      tryPlant(pick(P_BUSH), b.x, b.z, { spotPad: 4, scaleMul: rr(1.0, 1.3), gap: 0.4 });
    }
    // валуны в воде у берега
    if (i % 9 === 4) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(-2.5, -0.8));
      tryPut(pick(['opt_boulder_m', 'opt_boulder_s', 'opt_boulder_l']), b.x, b.z, rr(0, 6.28), { scale: rr(0.65, 1.0), wet: true, sink: 0.9, spotPad: 4 });
    }
    // коряги на береговой кромке
    if (i % 13 === 7) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(0.5, 2.5));
      tryPlant('forest_Log_3', b.x, b.z, { rotY: alongX(p.nx, p.nz) + rr(-0.6, 0.6), waterMargin: -0.3, zoneMargin: 60 });
    }
  }
  // ржавые обломки в воде у истока — след аварии
  for (const [i, kind, side] of [[6, 'opt_wreck_caisson', 1], [24, 'opt_wreck_steam_wagon', -1]]) {
    const b = bankPoint(i, side, -4.0);
    tryPut(kind, b.x, b.z, alongX(-RP[i].nz, RP[i].nx) + rr(-0.5, 0.5), { wet: true, sink: 0.7, spotPad: 4, gap: 0.3 });
  }

  // ============================================================
  //  D. ПОЛЯ МЕЖДУ ДЕРЕВНЕЙ И ЛАГЕРЕМ: редкие рощи, руины хутора
  // ============================================================
  grove(78, 136, 14, 5, P_FIELD);
  grove(128, 92, 12, 4, P_FIELD.concat(P_AUTUMN));
  grove(192, 70, 11, 3, P_FIELD);
  grove(196, 180, 11, 4, P_FIELD.concat(['tree016']));
  // руины хутора: угол стены, обломки, телега, сухое дерево — одним двором
  for (const [kind, x, z, rot] of [
    ['opt_ruin_corner', 146, 214, 0.5], ['opt_ruin_long', 156, 222, 0.5 + Math.PI / 2], ['opt_rubble_pile', 150, 228, 0.2],
    ['opt_wreck_caisson', 163, 210, 1.1], ['opt_debris', 140, 223, 2.0]
  ]) tryPut(kind, x, z, rot, { spotPad: 6 });
  tryPlant('tree004', 137, 231, { spotPad: 6, scaleMul: 0.8 });

  // ============================================================
  //  E. ПРОМЗОНА У ЛАГЕРЯ: обрубок акведука, свалка котлов, сухостой
  // ============================================================
  {
    const A0 = [316, 288], A1 = [336, 392];
    const ad = norm(A1[0] - A0[0], A1[1] - A0[1]);
    const rot = alongX(ad.x, ad.z);
    for (const [t, kind, extra] of [[0, 'opt_ruin_aqueduct_pier', 0], [24, 'opt_ruin_aqueduct_pier', 0.04], [38, 'opt_ruin_viaduct_east', 0.10], [52, 'opt_ruin_rubble_b', 0.9]]) {
      tryPut(kind, A0[0] + ad.x * t, A0[1] + ad.z * t, rot + extra, { spotPad: 8, gap: 0.4 });
    }
  }
  for (const [kind, x, z, rot] of [['opt_ruin_boiler_wreck', 256, 268, 0.4], ['opt_cargo_pallet', 268, 276, 1.2], ['opt_copper_tanks', 280, 262, 0.2],
    ['opt_ruin_pipe_tangle', 294, 318, 0.7]]) {
    tryPut(kind, x, z, rot, { spotPad: 6 });
  }
  for (const [cx, cz] of [[262, 248], [302, 232], [244, 300], [334, 304]]) {
    tryPlant(pick(P_DEAD), cx + rr(-4, 4), cz + rr(-4, 4), { spotPad: 7, scaleMul: rr(0.7, 0.95) });
  }

  // ============================================================
  //  F. КРАЯ ЗОНЫ: северный луг к Восточным землям, хвойные куртины у правой дороги
  // ============================================================
  for (const [cx, cz] of [[272, 30], [330, 26], [222, 42], [356, 92]]) grove(cx, cz, 9, 3, P_FIELD.concat(P_CONIFER.slice(0, 3)), { bush: 0.4 });
  for (const [cx, cz] of [[346, 176], [340, 236], [352, 330]]) grove(cx, cz, 9, 3, P_CONIFER, { bush: 0.3, under: P_BUSH_DARK });
  // у левой дороги — пара смешанных куртин между полями
  for (const [cx, cz] of [[52, 110], [50, 320]]) grove(cx, cz, 8, 3, P_FIELD.concat(P_CONIFER.slice(0, 2)), { bush: 0.4 });

  // ============================================================
  //  Блокировка случайной расстановки окрестностей (layout.js): парк, дороги, вода, мосты
  // ============================================================
  function inParkCore(x, z) { return Math.hypot(x - F[0], z - F[1]) < 26 || Math.hypot(x - P[0], z - P[1]) < 10 || Math.hypot(x - G[0], z - G[1]) < 10; }
  function blockScatter(x, z) {
    if (inParkCore(x, z)) return true;
    if (blocked(x, z, 4.5)) return true;
    if (inWater(x, z, 0.35, 1.0)) return true;
    if (inClear(x, z, 2)) return true;
    return false;
  }

  return {
    blockScatter, inParkCore, inRiver: inWater, nearRoad, roadDist, inZone, placed, culvert: culv,
    bridgeInfo: { main: bridge1 && { dh: bridge1.dh, step: bridge1.step, climb: bridge1.climb, offRoad: bridge1.offRoad, top: bridge1.top, at: bridge1.at } },
    pavilionDrop: +pav.drop.toFixed(2), greenhouseDrop: +gh.drop.toFixed(2)
  };
};

module.exports.SPOTS = SPOTS;
module.exports.SPOT_R_UV = SPOT_R_UV;
module.exports.ZONE_POLY = ZONE_POLY;
module.exports.FOLIAGE_EXTRA = FOLIAGE_EXTRA;
module.exports.roadDist = roadDist;
