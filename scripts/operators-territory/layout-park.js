// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT-PARK.JS  (v11)
//  Окрестности базы операторов по карте острова (эталон L2: дороги связывают ворота
//  и ориентиры, споты — на открытых лугах у дорог, лес — по краям, переходы плавные):
//   • дорога из южных ворот деревни через поля к воротам лагеря операторов;
//   • дорога на юг вдоль озера — к Холмам Астарда;
//   • магистраль север–юг: из Восточных земель мимо лагеря к Большому мосту
//     через Ржавую реку и дальше к Междуречью; второй мост ниже по течению;
//   • бывший парк над Озером водовода у южных ворот деревни (терраса над водой);
//   • берега озера и реки, прорванный водовод с водопадом;
//   • промзона у лагеря: акведук, свалки; опушки и рощи — разные породы по биомам.
//  Рельеф озера и вода — scripts/operators-territory/terrain-river.js.
//  Оптимизация: кит opt_* на одном атласе (InstancedMesh), растительность — модели,
//  уже лежащие в библиотеке; дорожки и газоны — покраска террейна.
// ============================================================
'use strict';

const RIVER = require('./river-path.json');

// ---- Споты мобов (тот же порядок/уровни/число; места — по участкам) ----
const SPOT_R_UV = 0.0072;
const SPOTS = [
  [0, 'tutorial_target', 205, 110],   // поле у ворот лагеря
  [1, 'loose_bolt', 240, 40],         // северный луг
  [2, 'scrapper', 160, 118],          // поле между стеной деревни и дорогой
  [3, 'scrapper', 105, 150],          // западное поле
  [4, 'loose_bolt', 300, 38],         // северный луг
  [5, 'tutorial_target', 55, 172],    // поле у южных ворот деревни
  [6, 'scrapper', 270, 205],          // промзона
  [7, 'scrapper', 150, 200],          // луг южнее дороги
  [8, 'loose_bolt', 122, 262],        // парк: восточная лужайка
  [9, 'scrapper', 350, 52],           // северо-восток
  [10, 'tutorial_target', 38, 262],   // парк: западная лужайка у розария
  [11, 'loose_bolt', 356, 150],       // восточный склон
  [12, 'scrapper', 300, 288],         // акведук
  [13, 'rust_mite', 300, 410],        // берег реки
  [14, 'tutorial_target', 330, 250],  // промзона, восток
  [15, 'rust_mite', 252, 396],        // берег у истока реки
  [16, 'rust_mite', 192, 362],        // северный берег озера
  [17, 'loose_bolt', 408, 438],       // подъезд к Большому мосту
  [18, 'scrapper', 160, 304],         // берег озера под променадом
  [19, 'toaster_overlord', 36, 352]   // у прорванного водовода
];

// Контур зоны: юг — река с Большим мостом, запад — дорога к Астарду, северо-запад — стена деревни
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
  grass01: { file: 'grass01.fbx', scale: 0.019, name: 'Трава луговая №1' },
  grass06: { file: 'grass06.fbx', scale: 0.019, name: 'Трава луговая №6' },
  grass_patch: { file: 'grass_patch.fbx', scale: 0.019, name: 'Куртина травы' },
  Mushroom: { file: 'Mushroom.fbx', scale: 4.0, name: 'Гриб' },
  StumpWithMushroom: { file: 'StumpWithMushroom.fbx', scale: 1.8056, name: 'Пень с грибами' },
  forest_Log_3: { file: 'Log_3.fbx', scale: 3.2203, name: 'Бревно №3' },
  forest_Stump_3: { file: 'Stump_3.fbx', scale: 4.5833, name: 'Пень №3' }
};
const FOOT_EXTRA = {
  tree097: 2.2, tree100: 2.2, tree106: 2.2, tree107: 2.2, tree110: 2.2, tree113: 2.2, tree114: 2.2, tree118: 2.2,
  tree086: 2.4, tree076: 2.6, tree087: 1.8, tree093: 1.8, tree073: 2.2, tree074: 2.2, tree089: 2.2, tree016: 2.2, tree018: 2.0,
  tree001: 2.0, tree004: 2.0, tree008: 1.8, tree055: 1.7, tree057: 1.7, tree061: 1.7, tree_rt_1: 1.8, tree_rt_3: 1.8, tree_rt_4: 2.6,
  small_tree_rt_1: 1.2, retro_bush2_summer: 1.5, retro_bush5_summer: 1.5, retro_bush6_summer: 1.5, retro_bush7_summer: 1.5,
  retro_bush03: 1.5, retro_bush05: 1.5, bush03: 1.45, bush05: 1.45, bush07: 1.45, grass01: 0.45, grass06: 0.45, grass_patch: 0.55,
  Mushroom: 0.3, StumpWithMushroom: 1.0, forest_Log_3: 2.4, forest_Stump_3: 1.6
};

// Палитры биомов
const P_PARK = ['tree106', 'tree110', 'tree114', 'tree097', 'tree100'];
const P_BLOSSOM = ['tree073', 'tree074', 'tree089'];
const P_FIELD = ['tree107', 'tree113', 'tree118', 'tree097', 'tree_rt_4', 'tree086', 'tree100'];
const P_AUTUMN = ['tree016', 'tree018'];
const P_RIVER = ['tree076', 'tree087', 'tree093', 'tree110', 'tree076'];
const P_CONIFER = ['tree055', 'tree057', 'tree061', 'tree_rt_1', 'tree_rt_3', 'tree01', 'tree02', 'small_tree_rt_1'];
const P_DEAD = ['tree001', 'tree004', 'tree008', 'dead_tree_rt_1', 'dead_tree_rt_2'];
const P_BUSH = ['retro_bush2_summer', 'retro_bush5_summer', 'retro_bush6_summer', 'retro_bush7_summer', 'retro_bush03', 'retro_bush05',
  'retro_bush8_summer', 'retro_bush4_spring1', 'bush03', 'bush05', 'bush01'];
const P_BUSH_DARK = ['bush01', 'bush02', 'bush04', 'bush07', 'BlueberryBush'];
const P_MEADOW = ['field_poppy_e', 'field_poppy_f', 'matted_pratia_b', 'matted_pratia_c', 'matted_pratia_g', 'grass01', 'grass06', 'grass_patch', 'grass04'];
const P_TUFT = ['grass03', 'grass04', 'grass05', 'grass08', 'grass_bush', 'grass01'];
const P_REEDS = ['grass_bush', 'grass05', 'grass08', 'grass04', 'Fern', 'grass06'];
const P_FOREST_FLOOR = ['Fern', 'Mushroom', 'grass03', 'StumpWithMushroom', 'forest_Log_3', 'forest_Stump_3', 'matted_pratia_d'];

module.exports = function placeOutskirts(api) {
  const { PIECES, put, addEntryAndColliders, plant, canOccupyAt, registerOccupy, ground, report, isNearOpSpot, FOLIAGE, FOLIAGE_FOOTPRINT_HALF } = api;
  Object.assign(FOLIAGE, FOLIAGE_EXTRA);
  Object.assign(FOLIAGE_FOOTPRINT_HALF, FOOT_EXTRA);

  let seed = 51127;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }
  const facing = (dx, dz) => Math.atan2(dx, dz);
  const alongX = (dx, dz) => Math.atan2(-dz, dx);
  function norm(dx, dz) { const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, L }; }

  // ------------------------------------------------------------
  //  Дороги/дорожки: обход + план покраски
  // ------------------------------------------------------------
  const PATHS = [];
  const paint = { strokes: [], disks: [], lawns: [], tiling: { 0: 59, 1: 43, 2: 91, 3: 100 } };
  function addPath(pts, hw, layer, str, opt) {
    opt = opt || {};
    PATHS.push({ pts, hw });
    paint.strokes.push({ layer, pts, hw, str, feather: opt.feather || 2.6, noise: opt.noise != null ? opt.noise : 0.4, fade: opt.fade || null, mix: opt.mix || null });
  }
  function distToPolyline(x, z, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }
  function nearPath(x, z, pad) {
    for (const p of PATHS) if (distToPolyline(x, z, p.pts) < p.hw + pad) return true;
    for (const d of paint.disks) if (d.solid && Math.hypot(x - d.x, z - d.z) < d.r + pad) return true;
    return false;
  }
  function samples(pts, step, skipStart, skipEnd) {
    const out = [], lens = [];
    let total = 0;
    for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(L); total += L; }
    for (let s = skipStart || 0; s <= total - (skipEnd || 0) + 1e-6; s += step) {
      let acc = 0;
      for (let i = 0; i < lens.length; i++) {
        if (s <= acc + lens[i] || i === lens.length - 1) {
          const t = Math.min(1, (s - acc) / (lens[i] || 1));
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
          const d = norm(bx - ax, bz - az);
          out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: d.x, dz: d.z, px: d.z, pz: -d.x, s });
          break;
        }
        acc += lens[i];
      }
    }
    return out;
  }

  // ------------------------------------------------------------
  //  Вода: ближайшая точка оси (озеро + река), мокрая зона, кромки
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
  //  Размещение с проверками
  // ------------------------------------------------------------
  const placed = { solid: 0, foliage: 0, gc: 0 };
  function fp(piece, scale) { const m = PIECES[piece]; return { hx: m.size[0] * (scale || 1) * 0.5, hz: m.size[2] * (scale || 1) * 0.5 }; }
  function tryPut(piece, x, z, rotY, opt) {
    opt = opt || {};
    const { hx, hz } = fp(piece, opt.scale);
    const mul = opt.footprintMul || 0.94;
    if (!opt.force) {
      if (!canOccupyAt(x, z, hx * mul, hz * mul, rotY, 'SOLID', { gap: opt.gap != null ? opt.gap : 0.35 })) return null;
      if (opt.pathPad != null && nearPath(x, z, Math.min(hx, hz) + opt.pathPad)) return null;
      if (!opt.wet && inWater(x, z, 0.15)) return null;
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
    const isGc = /^(grass|matted_pratia|field_poppy|Mushroom)/i.test(kind) || !!opt.asGroundcover;
    if (!opt.force) {
      if (!canOccupyAt(x, z, half, half, ry, isGc ? 'GROUNDCOVER' : 'FOLIAGE', { gap: opt.gap != null ? opt.gap : (isGc ? 0.15 : 0.6) })) return false;
      if (opt.pathPad != null && nearPath(x, z, half * 0.5 + opt.pathPad)) return false;
      if (!opt.wet && inWater(x, z, opt.waterMargin != null ? opt.waterMargin : 0.25)) return false;
      if (opt.spotPad && isNearOpSpot(x, z, opt.spotPad)) return false;
    }
    plant(kind, x, z, {
      scaleMul: opt.scaleMul || rr(0.88, 1.1), rotY: opt.rotY != null ? opt.rotY : rr(0, Math.PI * 2),
      rx: opt.rx != null ? opt.rx : rr(-0.03, 0.03), rz: opt.rz != null ? opt.rz : rr(-0.03, 0.03),
      y: opt.y, sink: opt.sink, asGroundcover: !!opt.asGroundcover && !/^(grass|matted_pratia|field_poppy)/i.test(kind)
    });
    if (isGc) placed.gc++; else placed.foliage++;
    return true;
  }
  function scatterGc(cx, cz, r, n0, kinds, opt) {
    // покров — пятнами, не ковром: мелкие кусты травы не нагружают мир и кадр
    const n = Math.max(1, Math.round(n0 * 0.6));
    let ok = 0;
    for (let t = 0; t < n * 5 && ok < n; t++) {
      const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * r;
      if (tryPlant(pick(kinds), cx + Math.cos(a) * d, cz + Math.sin(a) * d, Object.assign({ pathPad: 0.4 }, opt || {}))) ok++;
    }
    return ok;
  }
  /** Роща: деревья палитры с разносом, подлесок, покров — естественное пятно, не ряд. */
  function grove(cx, cz, r, n, palette, opt) {
    opt = opt || {};
    const pts = [];
    for (let t = 0; t < n * 12 && pts.length < n; t++) {
      const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * r;
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (pts.some(q => Math.hypot(q[0] - x, q[1] - z) < (opt.minSep || 7.5))) continue;
      if (tryPlant(pick(palette), x, z, { pathPad: opt.pathPad != null ? opt.pathPad : 2.0, spotPad: opt.spotPad || 7, scaleMul: rr(0.75, 1.02), gap: 0.7 })) pts.push([x, z]);
    }
    const under = opt.under || P_BUSH;
    for (let k = 0; k < Math.round(pts.length * (opt.bush != null ? opt.bush : 0.7)); k++) {
      const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * (r + 4);
      tryPlant(pick(under), cx + Math.cos(a) * d, cz + Math.sin(a) * d, { pathPad: 1.0, spotPad: 4, scaleMul: rr(0.9, 1.3) });
    }
    scatterGc(cx, cz, r + 3, Math.round(pts.length * (opt.gc != null ? opt.gc : 1.6)), opt.floor || P_TUFT);
    return pts.length;
  }
  /** Лесная опушка вдоль ломаной: полоса шириной width, плотность — деревьев на 100 м. */
  function belt(pts, width, per100, palette, opt) {
    opt = opt || {};
    let n = 0;
    for (const s of samples(pts, 100 / per100, 0, 0)) {
      const off = rr(-width / 2, width / 2);
      const x = s.x + s.px * off + rr(-3, 3), z = s.z + s.pz * off + rr(-3, 3);
      if (tryPlant(pick(palette), x, z, { pathPad: 2.5, spotPad: 7, scaleMul: rr(0.75, 1.05), gap: 0.8 })) n++;
      if (rnd() < (opt.bush || 0.4)) tryPlant(pick(opt.under || P_BUSH_DARK), x + rr(-6, 6), z + rr(-6, 6), { pathPad: 1, spotPad: 4, scaleMul: rr(0.9, 1.3) });
      if (rnd() < (opt.floorRate || 0.6)) scatterGc(x, z, 6, 2, opt.floor || P_FOREST_FLOOR);
    }
    return n;
  }

  // ============================================================
  //  A. ДОРОГИ ПО КАРТЕ ОСТРОВА
  // ============================================================
  const GATE_S = [-6, 212];                               // южные ворота деревни (снаружи)
  const J0 = [20, 222];                                   // развилка: к лагерю / к Астарду
  const R_VB = [GATE_S, J0, [52, 214], [86, 204], [125, 187], [164, 164], [192, 144], [206, 134], [218, 120], [227, 106], [234, 94], [240, 84]];
  const R_S = [J0, [22, 252], [16, 290], [10, 330], [0, 380], [-12, 430], [-26, 490], [-40, 560]];
  const R1N = [[240, 84], [246, 62], [256, 36], [270, 6], [286, -30], [300, -64]];
  const B1 = { i: nearestIdx(366, 485), span: 44 };      // Большой мост
  const B2 = { i: nearestIdx(442, 610), span: 44 };      // мост к Междуречью
  function nearestIdx(x, z) {
    let bi = 0, bd = Infinity;
    RP.forEach((p, i) => { if (p.kind === 'lake') return; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; bi = i; } });
    return bi;
  }
  function bridgeEnds(b) {
    const p = RP[b.i];
    const c = ((p.wr - 2.2) - (p.wl - 2.2)) / 2;
    const cx = p.x + p.nx * c, cz = p.z + p.nz * c;
    const h = b.span / 2;
    return { cx, cz, p, a: [cx - p.nx * h, cz - p.nz * h], b: [cx + p.nx * h, cz + p.nz * h] };
  }
  const E1 = bridgeEnds(B1), E2 = bridgeEnds(B2);
  // северный конец Большого моста — тот, что ближе к лагерю
  const E1n = Math.hypot(E1.a[0] - 300, E1.a[1] - 300) < Math.hypot(E1.b[0] - 300, E1.b[1] - 300) ? E1.a : E1.b;
  const E1s = E1n === E1.a ? E1.b : E1.a;
  const R1S = [[232, 100], [237, 140], [250, 188], [272, 236], [302, 282], [336, 326], [366, 362], [392, 398], [404, 428], [396, 452], [E1n[0], E1n[1]]];
  const R1S_far = [[E1s[0], E1s[1]], [E1s[0] - 12, E1s[1] + 14], [318, 528], [290, 552], [262, 590], [240, 640], [226, 700]];
  const E2w = E2.a[0] < E2.b[0] ? E2.a : E2.b, E2e = E2w === E2.a ? E2.b : E2.a;
  const R_B2 = [[E2w[0] - 30, E2w[1] + 24], [E2w[0] - 8, E2w[1] + 4], [E2w[0], E2w[1]]];
  const R_B2e = [[E2e[0], E2e[1]], [E2e[0] + 16, E2e[1] - 8], [E2e[0] + 46, E2e[1] - 34], [E2e[0] + 70, E2e[1] - 70]];
  const R_RIVER_LINK = [[E1s[0] - 12, E1s[1] + 14], [370, 540], [400, 566], [E2w[0] - 30, E2w[1] + 24]];

  addPath(R_VB.slice(0, 4), 2.2, 0, 0.48, { noise: 0.5, feather: 2.0, mix: { layer: 2, str: 0.3 } });
  addPath(R_VB.slice(3), 2.2, 2, 0.46, { noise: 0.45, feather: 2.0, mix: { layer: 0, str: 0.24 } });
  addPath(R_S, 2.4, 2, 0.44, { noise: 0.45, fade: 'end' });
  addPath(R1N, 2.4, 2, 0.42, { noise: 0.45, fade: 'end' });
  addPath(R1S, 2.2, 2, 0.46, { noise: 0.42, feather: 2.0, mix: { layer: 0, str: 0.2 } });
  addPath(R1S_far, 2.4, 2, 0.42, { noise: 0.45, fade: 'end' });
  addPath(R_B2, 2.0, 2, 0.4, { noise: 0.45, fade: 'start' });
  addPath(R_B2e, 2.0, 2, 0.4, { noise: 0.45, fade: 'end' });
  addPath(R_RIVER_LINK, 1.8, 2, 0.36, { noise: 0.5 });
  // указатели на развилках
  tryPut('opt_signpost', J0[0] + 4.5, J0[1] - 5, facing(1, 0.2), { sink: 0.28, spotPad: 0 });
  tryPut('opt_signpost', 236, 108, facing(0.4, 1), { sink: 0.28, spotPad: 0 });
  tryPut('opt_signpost', 249, 64, facing(-1, 0.3), { sink: 0.28, spotPad: 0 });
  tryPut('opt_signpost', E1n[0] + 6, E1n[1] - 7, facing(-0.5, 1), { sink: 0.28, spotPad: 0 });

  // ============================================================
  //  B. БОЛЬШОЙ МОСТ И МОСТ К МЕЖДУРЕЧЬЮ
  // ============================================================
  const BR_REF = 10.5;   // край настила над низом модели (kit_park.py: BR_END − BR_BOTTOM)
  function placeBridge(E, id) {
    const gA = ground(E.a[0], E.a[1]), gB = ground(E.b[0], E.b[1]);
    // край настила — по берегу чуть дальше от моста: на крутом берегу сход с моста без ступени
    const ext = (b) => { const dx = b[0] - E.cx, dz = b[1] - E.cz, L = Math.hypot(dx, dz) || 1; return ground(b[0] + dx / L * 1.6, b[1] + dz / L * 1.6); };
    const top = Math.max(gA, gB, ext(E.a), ext(E.b)) + 0.05;
    const rot = alongX(E.p.nx, E.p.nz);
    const res = addEntryAndColliders('opt_bridge_stone', E.cx, top - BR_REF, E.cz, rot, { id, category: 'ruins', drawDist: 900 });
    placed.solid++;
    report.camp++;
    // подходы: фонари и тумбы по сторонам въездов
    for (const end of [E.a, E.b]) {
      const dx = end[0] - E.cx, dz = end[1] - E.cz, L = Math.hypot(dx, dz) || 1;
      const ux = dx / L, uz = dz / L;
      for (const side of [-1, 1]) {
        tryPut('opt_lamp', end[0] + ux * 4.0 - uz * side * 4.8, end[1] + uz * 4.0 + ux * side * 4.8, 0, { sink: 0.18, spotPad: 0, gap: 0.2 });
      }
    }
    return { res, dh: +Math.abs(gA - gB).toFixed(2), top: +top.toFixed(2) };
  }
  const bridge1 = placeBridge(E1, 'opt_bridge_stone_main');
  // старый каменный мост у устья рухнул: пролёт в воде, устои на берегах (переправы нет — только руина)
  {
    let bi = -1, bw = Infinity;
    RP.forEach((p, i) => { if (p.kind !== 'river' || p.d < RP[RP.length - 1].d - 140 || p.d > RP[RP.length - 1].d - 60) return; const w = p.wl + p.wr; if (w < bw) { bw = w; bi = i; } });
    if (bi >= 0) {
      const p = RP[bi], c = ((p.wr - 2.2) - (p.wl - 2.2)) / 2;
      const sc = Math.max(1.0, Math.min(1.6, (p.wl + p.wr - 4.4 + 6) / 12));
      tryPut('opt_ruin_bridge', p.x + p.nx * c, p.z + p.nz * c, alongX(p.nx, p.nz) + 0.06, { scale: +sc.toFixed(2), wet: true, sink: 0.9, spotPad: 0, gap: 0.2, force: true, id: 'opt_ruin_bridge_mouth' });
    }
  }
  const bridge2 = placeBridge(E2, 'opt_bridge_stone_mezh');

  // ============================================================
  //  C. ПАРК НАД ОЗЕРОМ У ЮЖНЫХ ВОРОТ ДЕРЕВНИ (бывший «Сад механиков»)
  // ============================================================
  const PG = [82, 211];        // ворота парка (с дороги)
  const F = [80, 246];         // площадь фонтана
  const P = [82, 280];         // павильон-беседка над обрывом к воде
  const G = [116, 224];        // остов оранжереи
  const RG = [46, 238];        // розарий
  const ALLEY_N = [[PG[0], PG[1] + 2], [F[0] + 0.5, F[1] - 11]];
  const ALLEY_S = [[F[0] + 0.5, F[1] + 11], [P[0], P[1] - 7.5]];
  const ALLEY_W = [[F[0] - 11, F[1] + 0.5], [RG[0] + 9, RG[1] + 3], [24, 252]];
  const ALLEY_E = [[F[0] + 11, F[1] - 1], [G[0] - 6, G[1] + 6.5]];
  const PROM = [[P[0] + 7, P[1] + 2], [110, 290], [138, 298], [164, 310], [188, 330], [206, 352]];
  addPath(ALLEY_N, 2.2, 0, 0.55, { noise: 0.42 });
  addPath(ALLEY_S, 2.0, 0, 0.52, { noise: 0.45 });
  addPath(ALLEY_W, 1.9, 0, 0.48, { noise: 0.5 });
  addPath(ALLEY_E, 1.8, 0, 0.48, { noise: 0.5 });
  addPath(PROM, 2.0, 0, 0.46, { noise: 0.5, mix: { layer: 2, str: 0.25 } });
  paint.disks.push({ layer: 0, x: F[0], z: F[1], r: 11, str: 0.6, feather: 2.2, noise: 0.35 });
  paint.disks.push({ layer: 0, x: P[0], z: P[1], r: 7, str: 0.45, feather: 2.0, noise: 0.45 });
  for (const [x, z, r, str] of [[58, 262, 16, 0.42], [110, 262, 18, 0.42], [52, 228, 12, 0.36], [112, 240, 14, 0.36], [150, 296, 18, 0.3], [70, 296, 10, 0.3]]) {
    paint.lawns.push({ layer: 1, x, z, r, str, noise: 0.55 });
  }

  // ворота и ограда вдоль дороги (короткие пролёты с проломами — не сплошной забор)
  put('opt_park_gate', PG[0], PG[1] - 0.873, facing(0, -1), { sink: 0.12, id: 'opt_park_gate_01' });
  placed.solid++;
  function fenceRun(x0, z0, dir, pattern) {
    const rot = alongX(dir.x, dir.z);
    let off = 2.75 + 0.55 + 0.42;
    for (const code of pattern) {
      const cx = x0 + dir.x * (off + 1.845), cz = z0 + dir.z * (off + 1.845);
      if (code !== '-') tryPut(code === 'f' ? 'opt_park_fence' : 'opt_park_fence_broken', cx, cz, rot, { sink: 0.06, footprintMul: 0.9, gap: -0.2, spotPad: 0 });
      off += 4.0;
    }
  }
  fenceRun(PG[0], PG[1], { x: 1, z: 0.02 }, ['f', 'f', 'b', 'f', '-', 'f', 'b']);
  fenceRun(PG[0], PG[1], { x: -1, z: 0.05 }, ['f', 'b', 'f', 'f', '-', 'b']);
  tryPut('opt_park_clock', PG[0] + 6.5, PG[1] + 5.5, 0.4, { sink: 0.06, spotPad: 0, force: true });

  // площадь: сухой фонтан (терраса на склоне), скамьи, фонари, вазоны
  putTerrace('opt_park_fountain', F[0], F[1], 0.3, 1.0, { id: 'opt_park_fountain_01', lift: -0.25 });
  for (const ang of [0.55, 2.2, 3.7, 5.3]) {
    const x = F[0] + Math.cos(ang) * 8.4, z = F[1] + Math.sin(ang) * 8.4;
    tryPut(rnd() < 0.3 ? 'opt_park_bench_broken' : 'opt_park_bench', x, z, facing(F[0] - x, F[1] - z), { sink: 0.03, gap: 0.2, spotPad: 0 });
  }
  for (const ang of [0.0, 1.57, 3.14, 4.71]) {
    const a = ang + 0.78, x = F[0] + Math.cos(a) * 10.8, z = F[1] + Math.sin(a) * 10.8;
    tryPut(rnd() < 0.25 ? 'opt_park_lamp_bent' : 'opt_park_lamp', x, z, alongX(F[0] - x, F[1] - z), { sink: 0.1, gap: 0.2, spotPad: 0 });
  }
  for (const [x, z] of [[F[0] - 3.4, F[1] - 11.2], [F[0] + 4.2, F[1] - 11.0], [F[0] - 11.4, F[1] - 3.2], [F[0] + 11.2, F[1] + 4]]) {
    tryPut('opt_park_urn', x, z, rr(0, 6.28), { sink: 0.05, gap: 0.2, spotPad: 0 });
  }

  // беседка-ротонда над обрывом к озеру: терраса, вход со стороны площади
  const pav = putTerrace('opt_park_pavilion', P[0], P[1], facing(F[0] - P[0], F[1] - P[1]), 2.0, { id: 'opt_park_pavilion_01', flushMax: true, lift: 0.04 });

  // оранжерея (терраса), внутри — одичавшие грядки
  const gh = putTerrace('opt_park_greenhouse', G[0], G[1], 0, 1.0, { id: 'opt_park_greenhouse_01' });
  for (const c of (PIECES.opt_park_greenhouse.colliders || [])) {
    registerOccupy('opt_park_greenhouse_01_w', 'SOLID', G[0] + c.x, G[1] + c.z, c.w * 0.5, c.d * 0.5, 0, { group: 'gh', external: true });
  }
  const ghFloor = gh.prop.position.y + 1.0;
  for (const sz of [-1.85, 1.85]) {
    for (const sx of [-3.8, -1.4, 1.2, 3.4]) {
      const bush = rnd() < 0.55;
      tryPlant(bush ? pick(['retro_bush3_spring3', 'bush04', 'retro_bush5_summer']) : pick(P_MEADOW.slice(0, 5)), G[0] + sx + rr(-0.4, 0.4), G[1] + sz + rr(-0.15, 0.15),
        { force: true, y: ghFloor + 0.32, scaleMul: bush ? rr(0.6, 0.7) : rr(0.85, 1.0), asGroundcover: true });
    }
  }

  // розарий: клумбы и изгородь
  const beds = [];
  for (const [dx, dz] of [[-5.4, -5.2], [5.4, -5.2], [-5.4, 5.2], [5.4, 5.2]]) {
    const b = tryPut('opt_park_flowerbed', RG[0] + dx, RG[1] + dz, rr(0, 6.28), { sink: 0.2, gap: 0.3, spotPad: 0 });
    if (b) beds.push(b);
  }
  tryPut('opt_park_urn', RG[0], RG[1], 0.4, { sink: 0.05, spotPad: 0, gap: 0.2 });
  for (const b of beds) {
    const y = b.position.y + 0.18;
    tryPlant(pick(['matted_pratia_c', 'matted_pratia_b']), b.position.x, b.position.z, { force: true, y, scaleMul: rr(0.85, 1.0) });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + rr(-0.3, 0.3);
      tryPlant(pick(['field_poppy_e', 'field_poppy_f', 'matted_pratia_g']), b.position.x + Math.cos(a) * 1.25, b.position.z + Math.sin(a) * 1.25, { force: true, y, scaleMul: rr(0.85, 1.05) });
    }
  }
  for (let k = 0; k < 12; k++) {
    const a = k * 0.523 + 0.2;
    if (Math.cos(a) > 0.75) continue; // проход с востока (от площади)
    tryPlant(pick(['retro_bush5_summer', 'retro_bush6_summer', 'retro_bush4_spring1', 'retro_bush8_summer']), RG[0] + Math.cos(a) * 11, RG[1] + Math.sin(a) * 11, { pathPad: 0.2, scaleMul: rr(0.85, 1.1), gap: 0.2 });
  }

  // аллеи: липы рядами (часть выпала или засохла), цветущие деревья у площади, скамьи и фонари
  function treeRow(pts, palette, offset, spacing, skipStart, skipEnd) {
    for (const s of samples(pts, spacing, skipStart, skipEnd)) {
      for (const side of [-1, 1]) {
        const x = s.x + s.px * side * offset + rr(-0.4, 0.4), z = s.z + s.pz * side * offset + rr(-0.4, 0.4);
        const roll = rnd();
        if (roll < 0.12) continue;
        if (roll < 0.2) { tryPlant(pick(['tree001', 'tree008']), x, z, { pathPad: 0.6, scaleMul: rr(0.7, 0.85) }); continue; }
        if (roll < 0.26) { tryPlant('forest_Stump_3', x, z, { pathPad: 0.5, scaleMul: rr(0.7, 0.9) }); continue; }
        tryPlant(pick(palette), x, z, { pathPad: 0.6, scaleMul: rr(0.78, 0.95), gap: 0.5 });
      }
    }
  }
  treeRow(ALLEY_N, ['tree106', 'tree110'], 5.4, 9.5, 2, 3);
  treeRow(ALLEY_W, ['tree106', 'tree114'], 5.0, 10, 3, 4);
  treeRow(PROM, ['tree076', 'tree110', 'tree076', 'tree093'], 5.2, 13, 3, 3);
  for (const [x, z] of [[F[0] - 15, F[1] - 12], [F[0] + 16, F[1] - 10], [F[0] - 16, F[1] + 12], [F[0] + 15, F[1] + 13]]) {
    tryPlant(pick(P_BLOSSOM), x, z, { pathPad: 1, scaleMul: rr(0.72, 0.85) });
  }
  for (const s of samples(PROM, 15, 6, 4)) {
    // скамьи по променаду — лицом к озеру (вниз по склону), фонари между ними
    const { p } = riverNearest(s.x, s.z);
    const tx = p.x - s.x, tz = p.z - s.z;
    tryPut(rnd() < 0.35 ? 'opt_park_bench_broken' : 'opt_park_bench', s.x + s.px * 3.4 * Math.sign(s.px * tx + s.pz * tz || 1), s.z + s.pz * 3.4 * Math.sign(s.px * tx + s.pz * tz || 1), facing(tx, tz), { sink: 0.03, gap: 0.2, spotPad: 2 });
  }
  for (const s of samples(PROM, 15, 13, 4)) {
    const side = -1;
    tryPut(rnd() < 0.3 ? 'opt_park_lamp_bent' : 'opt_park_lamp', s.x + s.px * side * 3.2, s.z + s.pz * side * 3.2, alongX(-s.px * side, -s.pz * side), { sink: 0.1, gap: 0.2, spotPad: 2 });
  }
  // лужайки парка: кусты-островки и цветы; рощица в восточной части
  for (const [cx, cz] of [[58, 262], [112, 264], [136, 248], [62, 226], [104, 210]]) {
    tryPlant(pick(P_BUSH), cx + rr(-3, 3), cz + rr(-3, 3), { pathPad: 1.0, scaleMul: rr(0.95, 1.25), spotPad: 4 });
    scatterGc(cx, cz, 7, 6, P_MEADOW);
  }
  grove(145, 232, 14, 5, P_PARK.concat(P_BLOSSOM), { bush: 0.8, gc: 1.4, floor: P_MEADOW });
  grove(40, 288, 10, 3, ['tree076', 'tree110'], { bush: 0.5 });

  // ============================================================
  //  D. ОЗЕРО ВОДОВОДА: прорванный водовод, берега
  // ============================================================
  const L0 = RP[0], Lt = norm(RP[2].x - RP[0].x, RP[2].z - RP[0].z);
  const culv = put('opt_river_culvert', L0.x - Lt.x * 7.5, L0.z - Lt.z * 7.5, facing(Lt.x, Lt.z), { sink: 0.6, id: 'opt_river_culvert_01' });
  placed.solid++;
  const lakeIdx = RP.map((p, i) => i).filter(i => RP[i].kind === 'lake');
  for (const i of lakeIdx) {
    if (i % 2) continue;
    for (const side of [1, -1]) {
      if (rnd() < 0.75) {
        const b = bankPoint(i, side, rr(-1.2, 0.6));
        for (let k = 0; k < 3; k++) tryPlant(pick(P_REEDS), b.x + rr(-2, 2), b.z + rr(-2, 2), { wet: true, pathPad: 0.2, scaleMul: rr(1.0, 1.4) });
      }
      if (i % 8 === 0 && rnd() < 0.7) {
        const b = bankPoint(i, side, rr(5, 11));
        tryPlant(pick(['tree076', 'tree087', 'tree076', 'tree093']), b.x, b.z, { pathPad: 1.5, spotPad: 6, scaleMul: rr(0.75, 0.95) });
      }
      if (i % 10 === 4) {
        const b = bankPoint(i, side, rr(-0.8, 1.0));
        tryPut(pick(['opt_boulder_m', 'opt_boulder_s']), b.x, b.z, rr(0, 6.28), { scale: rr(0.7, 1.0), wet: true, sink: 0.8, pathPad: 0.6, spotPad: 4 });
      }
    }
  }

  // ============================================================
  //  E. РЕКА: камыш, ивы и ольха по берегам, валуны, коряги, береговая тропа
  // ============================================================
  const riverIdx = RP.map((p, i) => i).filter(i => RP[i].kind === 'river' && RP[i].d < RP[RP.length - 1].d - 40);
  const bankTrail = [];
  for (const i of riverIdx) {
    const p = RP[i];
    if (i % 3 === 0 && p.x < E1.cx) {
      const b = bankPoint(i, +1, 7);
      bankTrail.push([+b.x.toFixed(1), +b.z.toFixed(1)]);
    }
    for (const side of [1, -1]) {
      if (rnd() < 0.55) {
        const b = bankPoint(i, side, rr(-1.0, 0.6));
        for (let k = 0; k < 3; k++) tryPlant(pick(P_REEDS), b.x + rr(-1.8, 1.8), b.z + rr(-1.8, 1.8), { wet: true, pathPad: 0.2, scaleMul: rr(1.0, 1.35) });
      }
    }
    if (i % 5 === 1) {
      const side = rnd() < 0.5 ? 1 : -1;
      tryPlant(pick(P_RIVER), ...[bankPoint(i, side, rr(4, 12))].map(b => [b.x, b.z])[0], { pathPad: 1.8, spotPad: 6, scaleMul: rr(0.72, 0.98), gap: 0.8 });
    }
    if (i % 7 === 3) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(-1.0, 0.8));
      tryPut(pick(['opt_boulder_m', 'opt_boulder_s', 'opt_boulder_l']), b.x, b.z, rr(0, 6.28), { scale: rr(0.65, 1.0), wet: true, sink: 0.9, pathPad: 0.8, spotPad: 4 });
    }
    if (i % 9 === 5) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(1.5, 4));
      tryPlant(rnd() < 0.5 ? 'forest_Log_1' : 'forest_Log_3', b.x, b.z, { pathPad: 0.6, rotY: alongX(p.nx, p.nz) + rr(-0.6, 0.6), waterMargin: -0.2 });
    }
    if (i % 4 === 2) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(3, 8));
      tryPlant(pick(P_BUSH), b.x, b.z, { pathPad: 0.8, scaleMul: rr(1.0, 1.35), spotPad: 3 });
    }
  }
  if (bankTrail.length > 2) addPath(bankTrail, 1.5, 2, 0.36, { noise: 0.5 });
  // ржавые обломки в воде у истока реки — след аварии
  for (const [i, kind, side] of [[riverIdx[4], 'opt_wreck_caisson', 1], [riverIdx[22], 'opt_wreck_steam_wagon', -1], [riverIdx[14], 'opt_ruin_pipe_tangle', 1]]) {
    if (i == null) continue;
    const b = bankPoint(i, side, -3.0);
    tryPut(kind, b.x, b.z, alongX(-RP[i].nz, RP[i].nx) + rr(-0.5, 0.5), { wet: true, sink: 0.7, spotPad: 4, gap: 0.3 });
  }

  // ============================================================
  //  F. ПОЛЯ МЕЖДУ ДЕРЕВНЕЙ И ЛАГЕРЕМ: рощи разных пород, луговые цветы, руины хутора
  // ============================================================
  grove(72, 140, 16, 5, P_FIELD, { gc: 1.8 });
  grove(128, 96, 13, 4, P_FIELD.concat(P_AUTUMN), { gc: 1.5 });
  grove(196, 72, 12, 4, P_FIELD, { gc: 1.5 });
  grove(188, 186, 12, 4, P_FIELD.concat(['tree016']), { gc: 1.6 });
  grove(118, 222, 9, 2, P_PARK, { gc: 1.0 });
  for (const [cx, cz, r] of [[100, 120, 16], [150, 150, 16], [40, 190, 14], [210, 150, 14], [175, 110, 12], [90, 180, 12]]) {
    scatterGc(cx, cz, r, 12, P_MEADOW, { spotPad: 0 });
  }
  // руины хутора у дороги: угол стены, обломки, сухое дерево, телега
  for (const [kind, x, z, rot, opt] of [
    ['opt_ruin_corner', 146, 214, 0.5, {}], ['opt_ruin_long', 156, 222, 0.5 + Math.PI / 2, {}], ['opt_rubble_pile', 150, 226, 0.2, {}],
    ['opt_wreck_caisson', 162, 210, 1.1, {}], ['opt_debris', 140, 222, 2.0, {}]
  ]) tryPut(kind, x, z, rot, Object.assign({ pathPad: 1.5, spotPad: 6 }, opt));
  tryPlant('tree004', 136, 230, { pathPad: 1, spotPad: 6, scaleMul: 0.8 });

  // ============================================================
  //  G. ПРОМЗОНА У ЛАГЕРЯ: акведук к реке, свалки, сухостой
  // ============================================================
  {
    const A0 = [316, 288], A1 = [336, 392];
    const ad = norm(A1[0] - A0[0], A1[1] - A0[1]);
    const rot = alongX(ad.x, ad.z);
    for (const [t, kind, extra] of [[0, 'opt_ruin_aqueduct_pier', 0], [28, 'opt_ruin_aqueduct_pier', 0.04], [42, 'opt_ruin_viaduct_east', 0.10],
      [56, 'opt_ruin_aqueduct_pier', -0.03], [84, 'opt_ruin_aqueduct_pier', 0.06], [100, 'opt_ruin_rubble_b', 0.9]]) {
      tryPut(kind, A0[0] + ad.x * t, A0[1] + ad.z * t, rot + extra, { pathPad: 1.0, spotPad: 8, gap: 0.4 });
    }
  }
  for (const [cx, cz] of [[262, 250], [300, 230], [286, 330], [244, 300], [330, 300]]) {
    tryPlant(pick(P_DEAD), cx + rr(-4, 4), cz + rr(-4, 4), { pathPad: 1.5, spotPad: 7, scaleMul: rr(0.7, 0.95) });
    scatterGc(cx, cz, 8, 4, ['grass03', 'grass05', 'grass08', 'grass_bush']);
  }
  for (const [kind, x, z, rot] of [['opt_ruin_boiler_wreck', 256, 268, 0.4], ['opt_cargo_pallet', 268, 276, 1.2], ['opt_copper_tanks', 280, 262, 0.2],
    ['opt_ruin_rubble_a', 318, 248, 2.0], ['opt_ruin_pipe_tangle', 296, 318, 0.7]]) {
    tryPut(kind, x, z, rot, { pathPad: 1.2, spotPad: 6 });
  }

  // ============================================================
  //  H. ОПУШКИ И ЛЕС — переход к соседним локациям
  // ============================================================
  // юго-запад за дорогой к Астарду: смешанный лес (хвойные + лиственные), к югу гуще
  belt([[-14, 260], [-22, 330], [-34, 400], [-50, 470], [-62, 540]], 34, 9, P_CONIFER.concat(['tree107', 'tree113', 'tree_rt_4']), { bush: 0.5, floorRate: 0.7 });
  belt([[44, 360], [70, 395], [100, 420]], 14, 7, ['tree107', 'tree087', 'tree076', 'tree_rt_3', 'tree113'], { bush: 0.5, under: P_BUSH });
  // южный берег реки: лиственный лес с ольхой и ивами — к Междуречью
  const southBank = [];
  for (const i of riverIdx) if (i % 4 === 0 && RP[i].d < 520) { const b = bankPoint(i, -1, 22); southBank.push([b.x, b.z]); }
  if (southBank.length > 2) belt(southBank, 22, 7, ['tree107', 'tree113', 'tree087', 'tree093', 'tree118', 'tree_rt_4', 'tree055'], { bush: 0.55, under: P_BUSH, floorRate: 0.6 });
  // северный луг к Восточным землям: редкие деревья и кусты
  for (const [cx, cz] of [[272, 22], [330, 20], [212, 30], [360, 90]]) grove(cx, cz, 10, 3, P_FIELD.concat(P_CONIFER.slice(0, 3)), { gc: 1.4 });
  // восточный край: хвойная полоса к Восточному полигону
  belt([[374, 120], [378, 200], [380, 280], [400, 360]], 16, 6, P_CONIFER.concat(['tree107']), { bush: 0.4 });

  // ============================================================
  //  Блокировка случайной расстановки окрестностей (layout.js) в парке, у дорог и в воде
  // ============================================================
  function inParkCore(x, z) { return x > 26 && x < 160 && z > 206 && z < 300; }
  function blockScatter(x, z) {
    if (inParkCore(x, z)) return true;
    if (nearPath(x, z, 1.5)) return true;
    if (inWater(x, z, 0.35, 1.0)) return true;
    return false;
  }

  return {
    paint, PATHS, blockScatter, inParkCore, inRiver: inWater, nearPath, placed, culvert: culv,
    bridgeInfo: { main: bridge1 && { dh: bridge1.dh, top: bridge1.top, at: [Math.round(E1.cx), Math.round(E1.cz)] }, mezh: bridge2 && { dh: bridge2.dh, top: bridge2.top, at: [Math.round(E2.cx), Math.round(E2.cz)] } },
    pavilionDrop: +pav.drop.toFixed(2), greenhouseDrop: +gh.drop.toFixed(2),
    oldBridge: null, footbridge: null
  };
};

module.exports.SPOTS = SPOTS;
module.exports.SPOT_R_UV = SPOT_R_UV;
module.exports.ZONE_POLY = ZONE_POLY;
module.exports.FOLIAGE_EXTRA = FOLIAGE_EXTRA;
