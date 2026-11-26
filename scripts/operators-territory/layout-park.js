// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT-PARK.JS
//  «Старый парк механиков» (запад Территории операторов) и «Ржавый ручей»
//  (южная окраина: исток у прорванного водовода → брод → мостик → старый мост
//  → вниз по оврагу в Междуречье). Вызывается из layout.js до расстановки
//  окрестностей, чтобы руины/лес окрестностей обходили парк, аллеи и воду.
//
//  Принципы (L2 Classic): читаемый план — круглая площадь с фонтаном и четыре
//  аллеи; ориентиры видны издалека; открытые лужайки под споты мобов;
//  разрушение дозировано (каждая 3–4-я вещь сломана, а не всё подряд).
//  Оптимизация: только кит opt_* на одном атласе (InstancedMesh) и уже
//  загруженная в мир растительность; дорожки — покраска террейна (0 геометрии).
// ============================================================
'use strict';

const RIVER = require('./river-path.json');

// ---- Споты мобов: тематические участки, уровни растут от Бастиона к ручью ----
// [idx, моб, x, z]; r — 27 м (было 44 м: споты накрывали друг друга и всю зону)
const SPOT_R_UV = 0.0072;
const SPOTS = [
  [0, 'tutorial_target', 212, 96],    // подступы к лагерю
  [1, 'loose_bolt', 236, 36],         // северный луг у дороги в Восточные земли
  [2, 'scrapper', 172, 124],          // парк: северо-восточная лужайка у павильона
  [3, 'scrapper', 84, 184],           // парк: западная лужайка у ограды
  [4, 'loose_bolt', 300, 36],         // северный луг
  [5, 'tutorial_target', 236, 172],   // южный склон под лагерем
  [6, 'scrapper', 286, 222],          // руины юго-восточного склона
  [7, 'scrapper', 150, 196],          // парк: юго-восточная лужайка
  [8, 'loose_bolt', 80, 236],         // заросшая окраина парка
  [9, 'scrapper', 350, 52],           // северо-восток, у котельной
  [10, 'tutorial_target', 140, 250],  // луг между парком и ручьём
  [11, 'loose_bolt', 356, 150],       // восточный склон за Бастионом
  [12, 'scrapper', 200, 248],         // склон к ручью
  [13, 'rust_mite', 286, 414],        // берег: ниже мостика
  [14, 'tutorial_target', 330, 262],  // юго-восточные руины
  [15, 'rust_mite', 232, 398],        // берег: у мостика
  [16, 'rust_mite', 176, 366],        // берег: перекат
  [17, 'loose_bolt', 344, 446],       // берег: у старого моста
  [18, 'scrapper', 122, 330],         // берег: свалка у заводи
  [19, 'toaster_overlord', 58, 298]   // заводь у прорванного водовода
];

// Новый контур зоны: юг доходит до ручья (берег — часть Территории), запад — до деревенской дороги
const ZONE_POLY = [
  [28, 96], [217, 32], [371, 9], [362, 274], [384, 486], [300, 478],
  [230, 452], [150, 424], [90, 396], [34, 356], [24, 250]
];

module.exports = function placeParkAndRiver(api) {
  const {
    PIECES, put, addEntryAndColliders, plant, canOccupyAt, registerOccupy,
    ground, report, isNearOpSpot
  } = api;

  // Свой ГПСЧ: последовательность остальной сцены не сдвигается
  let seed = 51127;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  function rr(a, b) { return a + (b - a) * rnd(); }
  function pick(arr) { return arr[Math.floor(rnd() * arr.length) % arr.length]; }

  const facing = (dx, dz) => Math.atan2(dx, dz);   // фасад (+Z модели) смотрит в (dx, dz)
  const alongX = (dx, dz) => Math.atan2(-dz, dx);  // локальная +X модели направлена в (dx, dz)
  function norm(dx, dz) { const L = Math.hypot(dx, dz) || 1; return { x: dx / L, z: dz / L, L }; }

  // ------------------------------------------------------------
  //  Дорожки: геометрия для обхода + план покраски
  // ------------------------------------------------------------
  const PATHS = [];
  const paint = { strokes: [], disks: [], lawns: [], tiling: { 0: 59, 1: 43, 2: 91, 3: 100 } };
  function addPath(pts, hw, layer, str, opt) {
    opt = opt || {};
    PATHS.push({ pts, hw });
    paint.strokes.push({ layer, pts, hw, str, feather: opt.feather || 2.4, noise: opt.noise != null ? opt.noise : 0.35, fade: opt.fade || null, mix: opt.mix || null });
  }
  function distToPolyline(x, z, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      let t = ((x - ax) * dx + (z - az) * dz) / L2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
    }
    return best;
  }
  function nearPath(x, z, pad) {
    for (const p of PATHS) if (distToPolyline(x, z, p.pts) < p.hw + pad) return true;
    for (const d of paint.disks) if (d.solid && Math.hypot(x - d.x, z - d.z) < d.r + pad) return true;
    return false;
  }
  /** Точки вдоль ломаной через шаг step, пропуская начало/конец. */
  function samples(pts, step, skipStart, skipEnd) {
    const out = [];
    let total = 0;
    const lens = [];
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
  //  Ручей: ближайшая точка ленты, мокрая зона, кромки берегов
  // ------------------------------------------------------------
  const RP = RIVER.pts;
  let rMinX = Infinity, rMaxX = -Infinity, rMinZ = Infinity, rMaxZ = -Infinity;
  for (const p of RP) { rMinX = Math.min(rMinX, p.x); rMaxX = Math.max(rMaxX, p.x); rMinZ = Math.min(rMinZ, p.z); rMaxZ = Math.max(rMaxZ, p.z); }
  function riverNearest(x, z) {
    let best = null, bd = Infinity, bi = -1;
    for (let i = 0; i < RP.length; i++) {
      const p = RP[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < bd) { bd = d; best = p; bi = i; }
    }
    return { p: best, d: Math.sqrt(bd), i: bi };
  }
  /** Вода (с запасом margin по высоте) или ближе edgePad к мокрой кромке. */
  function inRiver(x, z, margin, edgePad) {
    if (x < rMinX - 32 || x > rMaxX + 32 || z < rMinZ - 32 || z > rMaxZ + 32) return false;
    const { p, d } = riverNearest(x, z);
    if (d > 34) return false;
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
  //  Размещение с проверками (0 пересечений, не на дорожке, не в воде, не в центре спота)
  // ------------------------------------------------------------
  const placed = { solid: 0, foliage: 0, gc: 0 };
  function fp(piece, scale) {
    const m = PIECES[piece];
    return { hx: m.size[0] * (scale || 1) * 0.5, hz: m.size[2] * (scale || 1) * 0.5 };
  }
  function tryPut(piece, x, z, rotY, opt) {
    opt = opt || {};
    const { hx, hz } = fp(piece, opt.scale);
    const mul = opt.footprintMul || 0.94;
    if (!opt.force) {
      if (!canOccupyAt(x, z, hx * mul, hz * mul, rotY, 'SOLID', { gap: opt.gap != null ? opt.gap : 0.35 })) return null;
      if (opt.pathPad != null && nearPath(x, z, Math.min(hx, hz) + opt.pathPad)) return null;
      if (!opt.wet && inRiver(x, z, 0.15)) return null;
      if (opt.spotPad !== 0 && isNearOpSpot(x, z, opt.spotPad || 5.5)) return null;
    }
    const res = put(piece, x, z, rotY, opt);
    placed.solid++;
    return res;
  }
  function tryPlant(kind, x, z, opt) {
    opt = opt || {};
    const half = (api.FOLIAGE_FOOTPRINT_HALF[kind] || 1.2) * (opt.scaleMul || 1);
    const isGc = /^(grass|matted_pratia|field_poppy)/i.test(kind);
    if (!opt.force) {
      if (!canOccupyAt(x, z, half, half, 0, isGc ? 'GROUNDCOVER' : 'FOLIAGE', { gap: opt.gap != null ? opt.gap : (isGc ? 0.15 : 0.6) })) return false;
      if (opt.pathPad != null && nearPath(x, z, half * 0.5 + opt.pathPad)) return false;
      if (!opt.wet && inRiver(x, z, opt.waterMargin != null ? opt.waterMargin : 0.2)) return false;
    }
    plant(kind, x, z, {
      scaleMul: opt.scaleMul || rr(0.9, 1.1), rotY: opt.rotY != null ? opt.rotY : rr(0, Math.PI * 2),
      rx: opt.rx != null ? opt.rx : rr(-0.03, 0.03), rz: opt.rz != null ? opt.rz : rr(-0.03, 0.03),
      y: opt.y, sink: opt.sink, asGroundcover: !!opt.asGroundcover
    });
    if (isGc) placed.gc++; else placed.foliage++;
    return true;
  }
  function scatterGc(cx, cz, r, n, kinds, opt) {
    let ok = 0;
    for (let t = 0; t < n * 5 && ok < n; t++) {
      const a = rr(0, Math.PI * 2), d = Math.sqrt(rnd()) * r;
      if (tryPlant(pick(kinds), cx + Math.cos(a) * d, cz + Math.sin(a) * d, Object.assign({ pathPad: 0.4 }, opt || {}))) ok++;
    }
    return ok;
  }

  const TREES = ['tree01', 'tree02', 'tree05'];
  const HEDGE = ['retro_bush4_spring1', 'retro_bush3_spring3', 'retro_bush8_summer', 'bush01', 'bush02'];
  const BLOOM = ['field_poppy_e', 'field_poppy_f', 'matted_pratia_b', 'matted_pratia_c', 'matted_pratia_g'];
  const TUFT = ['grass03', 'grass04', 'grass05', 'grass08', 'grass_bush'];
  const REEDS = ['grass_bush', 'grass05', 'grass08', 'grass04', 'Fern'];

  /** Ряд деревьев аллеи: по обе стороны, часть сухие/пни/выпавшие (последствия аварии). */
  function treeRows(pts, kind, offset, spacing, skipStart, skipEnd) {
    for (const s of samples(pts, spacing, skipStart, skipEnd)) {
      for (const side of [-1, 1]) {
        const x = s.x + s.px * side * offset + rr(-0.5, 0.5);
        const z = s.z + s.pz * side * offset + rr(-0.5, 0.5);
        const roll = rnd();
        if (roll < 0.10) continue;                                   // выпавшее дерево — пустое место в ряду
        if (roll < 0.22) {                                           // сухое дерево
          if (!tryPut(rnd() < 0.5 ? 'opt_dead_tree_a' : 'opt_dead_tree_b', x, z, rr(0, 6.28), { scale: rr(0.62, 0.78), pathPad: 0.4, gap: 0.4 })) {
            tryPlant('dead_tree_rt_1', x, z, { pathPad: 0.6, scaleMul: rr(0.85, 1.0) });
          }
          continue;
        }
        if (roll < 0.30) {                                           // пень и поваленный ствол рядом
          tryPlant(rnd() < 0.5 ? 'forest_Stump_1' : 'forest_Stump_2', x, z, { pathPad: 0.5, scaleMul: rr(0.75, 0.9) });
          if (rnd() < 0.6) tryPlant('forest_Log_2', x + s.px * side * 2.6, z + s.pz * side * 2.6, { pathPad: 0.6, rotY: alongX(s.dx, s.dz) + rr(-0.4, 0.4) });
          continue;
        }
        tryPlant(kind, x, z, { pathPad: 0.6, scaleMul: rr(0.92, 1.08), gap: 0.5 });
      }
    }
  }
  /** Фонари и скамьи вдоль аллеи: фонарь — кронштейном к дорожке, скамья — лицом к дорожке. */
  function alleyFurniture(pts, hw, lampStart, lampEvery, benchStart, benchEvery, skipEnd) {
    let k = 0;
    for (const s of samples(pts, lampEvery, lampStart, skipEnd || 4)) {
      const side = (k++ % 2) ? 1 : -1;
      const x = s.x + s.px * side * (hw + 1.0), z = s.z + s.pz * side * (hw + 1.0);
      const bent = rnd() < 0.34;
      tryPut(bent ? 'opt_park_lamp_bent' : 'opt_park_lamp', x, z, alongX(-s.px * side, -s.pz * side) + (bent ? rr(-0.6, 0.6) : 0), { sink: 0.10, gap: 0.2, spotPad: 3 });
    }
    k = 0;
    for (const s of samples(pts, benchEvery, benchStart, skipEnd || 4)) {
      const side = (k++ % 2) ? -1 : 1;
      const x = s.x + s.px * side * (hw + 1.25), z = s.z + s.pz * side * (hw + 1.25);
      const broken = rnd() < 0.4;
      tryPut(broken ? 'opt_park_bench_broken' : 'opt_park_bench', x, z, facing(-s.px * side, -s.pz * side) + rr(-0.05, 0.05), { sink: 0.03, gap: 0.2, spotPad: 3 });
    }
  }

  // ============================================================
  //  A. СТАРЫЙ ПАРК МЕХАНИКОВ
  // ============================================================
  const F = [118, 136];          // площадь фонтана
  const PLAZA_R = 12.5;
  const G_W = [64, 146];         // западные ворота (к деревенской дороге)
  const E_END = [178, 152];      // восточный вход (к дороге от лагеря)
  const P = [152, 108];          // музыкальный павильон
  const H = [86, 114];           // оранжерея
  const CQ = [120, 178];         // часовая площадка
  const RG = [92, 182];          // розарий
  const S_END = [118, 206];      // южный выход парка

  const ALLEY_W = [[F[0] - PLAZA_R + 1, F[1] + 2.3], G_W, [24, 147.5]];
  const ALLEY_E = [[F[0] + PLAZA_R - 1, F[1] + 2.4], [148, 146], E_END];
  const ALLEY_S = [[F[0] + 0.4, F[1] + PLAZA_R - 1], CQ, S_END];
  const ALLEY_NE = [[F[0] + 9.5, F[1] - 8.0], [P[0] - 3.6, P[1] + 3.0]];
  const SPUR_RG = [[CQ[0] - 6.2, CQ[1] + 0.4], [RG[0] + 6.5, RG[1]]];
  const SPUR_H = [[88, 141.5], [86.6, H[1] + 3.8]];

  // главная дорога от лагеря к парку (по ней идёт и старая разреженная тропа из плит)
  const TRAIL_CAMP = [[178, 152], [192, 144], [206, 134], [218, 120], [227, 106], [234, 94], [240, 84]];
  addPath(ALLEY_W.slice(0, 2), 2.6, 0, 0.58, { noise: 0.42 });
  addPath(ALLEY_W.slice(1), 2.4, 0, 0.44, { noise: 0.5, fade: 'end' });         // к деревенской дороге — тает
  addPath(ALLEY_E, 2.6, 0, 0.58, { noise: 0.42 });
  addPath(ALLEY_S, 2.4, 0, 0.55, { noise: 0.45 });
  addPath(ALLEY_NE, 2.0, 0, 0.50, { noise: 0.5 });
  addPath(SPUR_RG, 1.6, 0, 0.45, { noise: 0.5 });
  addPath(SPUR_H, 1.5, 2, 0.45, { noise: 0.4 });
  addPath(TRAIL_CAMP, 3.0, 0, 0.46, { noise: 0.55, mix: { layer: 2, str: 0.32 } });
  paint.disks.push({ layer: 0, x: F[0], z: F[1], r: PLAZA_R, str: 0.62, feather: 2.2, noise: 0.35, solid: false });
  paint.disks.push({ layer: 0, x: CQ[0], z: CQ[1], r: 6.0, str: 0.55, feather: 1.8, noise: 0.4, solid: false });
  paint.disks.push({ layer: 0, x: P[0], z: P[1], r: 6.6, str: 0.42, feather: 2.0, noise: 0.5, solid: false });
  // бывшие газоны: сочная трава пятнами (контраст с выжженной окрестностью)
  paint.lawns.push({ layer: 1, x: 150, z: 118, r: 26, str: 0.42, noise: 0.55 });
  paint.lawns.push({ layer: 1, x: 88, z: 122, r: 24, str: 0.38, noise: 0.55 });
  paint.lawns.push({ layer: 1, x: 88, z: 186, r: 26, str: 0.42, noise: 0.5 });
  paint.lawns.push({ layer: 1, x: 152, z: 186, r: 26, str: 0.38, noise: 0.55 });
  paint.lawns.push({ layer: 1, x: 118, z: 232, r: 30, str: 0.18, noise: 0.7 });  // заросшая окраина — переход к пустоши

  // --- A1. Площадь и сухой паровой фонтан ---
  const fountain = put('opt_park_fountain', F[0], F[1], 0.3, { sink: 0.10, id: 'opt_park_fountain_01' });
  placed.solid++;
  for (const [ang, kind] of [[Math.PI * 0.25, 'opt_park_bench'], [Math.PI * 0.75, 'opt_park_bench_broken'], [Math.PI * 1.25, 'opt_park_bench'], [Math.PI * 1.75, 'opt_park_bench']]) {
    const x = F[0] + Math.cos(ang) * 8.6, z = F[1] + Math.sin(ang) * 8.6;
    tryPut(kind, x, z, facing(F[0] - x, F[1] - z), { sink: 0.03, gap: 0.2, spotPad: 0 });
  }
  for (const [ang, bent] of [[0.0, false], [Math.PI * 0.5, false], [Math.PI, true], [Math.PI * 1.5, false]]) {
    const a = ang + Math.PI * 0.25 + 0.3;
    const x = F[0] + Math.cos(a) * 11.4, z = F[1] + Math.sin(a) * 11.4;
    tryPut(bent ? 'opt_park_lamp_bent' : 'opt_park_lamp', x, z, alongX(F[0] - x, F[1] - z), { sink: 0.10, gap: 0.2, spotPad: 0 });
  }
  // вазоны у устьев аллей
  for (const [x, z] of [[F[0] - 12.2, F[1] - 1.6], [F[0] - 11.4, F[1] + 6.8], [F[0] + 12.4, F[1] - 1.2], [F[0] + 4.8, F[1] + 12.0]]) {
    tryPut('opt_park_urn', x, z, rr(0, 6.28), { sink: 0.04, gap: 0.2, spotPad: 0 });
  }
  scatterGc(F[0], F[1], 11.5, 10, ['grass03', 'grass04', 'matted_pratia_d'], { pathPad: -10 });

  // --- A2. Западные ворота и ограда вдоль деревенской дороги ---
  const wDir = norm(G_W[0] - F[0], G_W[1] - F[1]);          // наружу, к дороге
  const perpS = { x: -wDir.z, z: wDir.x };                   // вдоль ограды (на юг)
  if (perpS.z < 0) { perpS.x = -perpS.x; perpS.z = -perpS.z; }
  const GATE_PIER_Z = 0.873;                                 // линия пилонов смещена от центра модели внутрь
  const gateRot = facing(wDir.x, wDir.z);
  put('opt_park_gate', G_W[0] + wDir.x * GATE_PIER_Z, G_W[1] + wDir.z * GATE_PIER_Z, gateRot, { sink: 0.12, id: 'opt_park_gate_01' });
  placed.solid++;
  function fenceRun(dir, pattern) {
    // первый столб — у пилона ворот; секции по 4 м, столб на «-X» конце каждой
    let off = 2.75 + 0.55 + 0.42;
    const rot = alongX(dir.x, dir.z);
    for (const code of pattern) {
      const cx = G_W[0] + dir.x * (off + 1.845), cz = G_W[1] + dir.z * (off + 1.845);
      if (code === 'f' || code === 'b') {
        tryPut(code === 'f' ? 'opt_park_fence' : 'opt_park_fence_broken', cx, cz, rot, { sink: 0.06, footprintMul: 0.9, gap: -0.2, spotPad: 0, force: false });
      }
      off += 4.0;
    }
  }
  fenceRun(perpS, ['f', 'f', 'b', 'f', 'f', '-', 'f', 'b', 'f', 'f', '-', '-', 'b', 'f']);
  fenceRun({ x: -perpS.x, z: -perpS.z }, ['f', 'f', 'f', 'b', 'f', '-', 'f', 'f', 'b', '-', 'f']);
  // живая изгородь изнутри ограды — разрежённая, разросшаяся
  for (let k = 0; k < 16; k++) {
    const t = -44 + k * 6.2 + rr(-1.2, 1.2);
    if (Math.abs(t) < 7) continue;
    const x = G_W[0] - wDir.x * 3.2 + perpS.x * t, z = G_W[1] - wDir.z * 3.2 + perpS.z * t;
    tryPlant(pick(HEDGE), x, z, { pathPad: 0.5, scaleMul: rr(0.9, 1.25), gap: 0.3 });
  }
  // указатель на развилке у деревенской дороги
  tryPut('opt_signpost', 30, 142.5, facing(1, 0) + 0.4, { sink: 0.28, spotPad: 0 });

  // --- A3. Аллеи: ряды деревьев, фонари, скамьи ---
  treeRows(ALLEY_W.slice(0, 2), 'tree02', 5.8, 9.5, 3, 5);
  treeRows(ALLEY_E, 'tree02', 5.8, 9.5, 3, 4);
  treeRows(ALLEY_S, 'tree01', 5.6, 9.0, 3, 3);
  treeRows(ALLEY_NE, 'tree05', 5.2, 9.0, 3, 2);
  alleyFurniture(ALLEY_W.slice(0, 2), 2.6, 8, 17, 16, 17);
  alleyFurniture(ALLEY_E, 2.6, 10, 18, 19, 18);
  alleyFurniture(ALLEY_S, 2.4, 9, 16, 15, 30);

  // --- A4. Музыкальный павильон (ротонда) ---
  const pav = put('opt_park_pavilion', P[0], P[1], facing(F[0] - P[0], F[1] - P[1]), { sink: 0.02, id: 'opt_park_pavilion_01' });
  placed.solid++;
  for (const [ang, kind] of [[0.9, 'opt_park_bench_broken'], [-0.6, 'opt_park_bench'], [2.6, 'opt_park_bench']]) {
    const x = P[0] + Math.cos(ang) * 8.2, z = P[1] + Math.sin(ang) * 8.2;
    tryPut(kind, x, z, facing(P[0] - x, P[1] - z), { sink: 0.03, gap: 0.25, spotPad: 0 });
  }
  for (const [ang, kind] of [[1.7, 'retro_bush8_summer'], [3.4, 'retro_bush4_spring1'], [-1.9, 'bush02'], [4.6, 'BlueberryBush']]) {
    tryPlant(kind, P[0] + Math.cos(ang) * 7.6, P[1] + Math.sin(ang) * 7.6, { pathPad: 0.3, scaleMul: rr(1.0, 1.25) });
  }
  scatterGc(P[0], P[1], 13, 9, BLOOM.concat(TUFT));

  // --- A5. Остов оранжереи (внутри — одичавшие грядки) ---
  const gh = put('opt_park_greenhouse', H[0], H[1], 0, { sink: 0.10, id: 'opt_park_greenhouse_01' });
  placed.solid++;
  // стенки цоколя — в карту занятости (сама оранжерея — FLOOR: внутри растёт зелень)
  for (const c of (PIECES.opt_park_greenhouse.colliders || [])) {
    // external: стенки сходятся углами (одна модель) — взаимные «пересечения» не проверяем
    registerOccupy('opt_park_greenhouse_01_w', 'SOLID', H[0] + c.x, H[1] + c.z, c.w * 0.5, c.d * 0.5, 0, { group: 'gh', external: true });
  }
  const ghY = gh.position.y;
  for (const sz of [-1.85, 1.85]) {
    for (const sx of [-3.8, -1.4, 1.2, 3.4]) {
      const bush = rnd() < 0.55;
      const kind = bush ? pick(['retro_bush3_spring3', 'bush04', 'retro_bush1_fall']) : pick(BLOOM);
      tryPlant(kind, H[0] + sx + rr(-0.4, 0.4), H[1] + sz + rr(-0.15, 0.15), { force: true, y: ghY + 0.32, scaleMul: bush ? rr(0.6, 0.7) : rr(0.85, 1.0), asGroundcover: true });
    }
  }
  tryPlant('Fern', H[0] - 4.2, H[1] + 0.2, { force: true, scaleMul: 0.85, asGroundcover: true });
  tryPlant('retro_bush02', H[0] + 6.2, H[1] - 4.6, { pathPad: 0.3, scaleMul: 1.2 });
  tryPlant('tree05', H[0] - 11, H[1] - 3, { pathPad: 1 });
  tryPlant('tree02', H[0] + 12, H[1] - 5, { pathPad: 1 });

  // --- A6. Часовая площадка и розарий ---
  tryPut('opt_park_clock', CQ[0] + 0.2, CQ[1] - 0.2, 0.35, { sink: 0.06, spotPad: 0, force: true });
  for (const [dx, dz, kind] of [[-4.6, 3.4, 'opt_park_bench'], [4.4, 3.2, 'opt_park_bench_broken']]) {
    tryPut(kind, CQ[0] + dx, CQ[1] + dz, facing(-dx, -dz), { sink: 0.03, gap: 0.2, spotPad: 0 });
  }
  const beds = [];
  for (const [dx, dz] of [[-5.6, -5.4], [5.6, -5.4], [-5.6, 5.4], [5.6, 5.4]]) {
    const b = tryPut('opt_park_flowerbed', RG[0] + dx, RG[1] + dz, rr(0, 6.28), { sink: 0.10, gap: 0.3, spotPad: 0 });
    if (b) beds.push(b);
  }
  tryPut('opt_park_urn', RG[0], RG[1], 0.4, { sink: 0.05, spotPad: 0, gap: 0.2 });
  for (const b of beds) {
    const y = b.position.y + 0.18;
    // в клумбах — только стелющиеся цветы (бордюр клумбы — твёрдый объект в карте занятости)
    tryPlant(pick(['matted_pratia_c', 'matted_pratia_b']), b.position.x, b.position.z, { force: true, y, scaleMul: rr(0.85, 1.0) });
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + rr(-0.3, 0.3);
      tryPlant(pick(BLOOM), b.position.x + Math.cos(a) * 1.25, b.position.z + Math.sin(a) * 1.25, { force: true, y, scaleMul: rr(0.85, 1.05) });
    }
  }
  // разросшаяся изгородь розария
  for (let k = 0; k < 10; k++) {
    const a = k * 0.628 + 0.3;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; // проход с востока (от часов)
    tryPlant(pick(HEDGE), RG[0] + Math.cos(a) * 11.2, RG[1] + Math.sin(a) * 11.2, { pathPad: 0.2, scaleMul: rr(0.85, 1.15), gap: 0.2 });
  }

  // --- A7. Лужайки: кусты-островки, трава, цветы; следы разорения ---
  for (const [cx, cz] of [[170, 132], [140, 100], [72, 128], [102, 160], [158, 176], [168, 196], [76, 206], [104, 214]]) {
    tryPlant(pick(HEDGE.concat(['BlueberryBush', 'retro_bush02', 'retro_bush1_fall'])), cx + rr(-2, 2), cz + rr(-2, 2), { pathPad: 1.0, scaleMul: rr(0.95, 1.3) });
    scatterGc(cx, cz, 6, 4, BLOOM.concat(TUFT));
  }
  for (const [cx, cz, kind] of [[164, 164, 'opt_ruin_rubble_a'], [98, 132, 'opt_column_fallen'], [140, 168, 'opt_rubble_pile'], [74, 168, 'opt_debris']]) {
    tryPut(kind, cx, cz, rr(0, 6.28), { pathPad: 0.8, sink: kind === 'opt_column_fallen' ? 0.34 : undefined });
  }

  // ============================================================
  //  B. ЮЖНАЯ ОКРАИНА ПАРКА → ТРОПА К РУЧЬЮ
  // ============================================================
  const S_PATH = [S_END, [116, 238], [112, 270], [110, 296], [116, 318]];
  addPath(S_PATH, 1.9, 2, 0.46, { noise: 0.4 });
  // остатки южной ограды парка (почти всё повалено)
  for (const [x, z, code] of [[100, 212, 'b'], [108.2, 212.6, 'f'], [128.4, 212.8, 'b'], [136.6, 212.5, 'f'], [144.8, 212.2, 'b']]) {
    tryPut(code === 'f' ? 'opt_park_fence' : 'opt_park_fence_broken', x, z, alongX(1, 0.03), { sink: 0.06, footprintMul: 0.9, gap: 0, spotPad: 0 });
  }
  for (const [x, z] of [[124, 252], [102, 262], [126, 284], [96, 290]]) {
    tryPut(rnd() < 0.5 ? 'opt_dead_tree_a' : 'opt_dead_tree_b', x + rr(-3, 3), z + rr(-3, 3), rr(0, 6.28), { scale: rr(0.7, 0.95), pathPad: 1.5 });
  }
  tryPut('opt_park_lamp_bent', 113.5, 228, alongX(1, 0), { sink: 0.1, spotPad: 3 });
  tryPut('opt_signpost', 120.5, 300, facing(0.3, 1) - 0.3, { sink: 0.28, spotPad: 0 });

  // ============================================================
  //  C. «РЖАВЫЙ РУЧЕЙ»: исток, берега, мостик, старый мост
  // ============================================================
  const head = RP[0];
  const t0 = norm(RP[2].x - RP[0].x, RP[2].z - RP[0].z);
  // C1. Прорванный водовод — стена в склоне оврага, раструб над заводью
  const culv = put('opt_river_culvert', head.x - t0.x * 8.0, head.z - t0.z * 8.0, facing(t0.x, t0.z), { sink: 0.45, id: 'opt_river_culvert_01' });
  placed.solid++;

  // C2. Береговая тропа (северный берег) и броды
  const bankPts = [];
  for (let i = 2; i < RP.length; i += 3) {
    if (RP[i].d > 420) break;
    const b = bankPoint(i, +1, 5.2);
    bankPts.push([+b.x.toFixed(1), +b.z.toFixed(1)]);
  }
  addPath(bankPts, 1.7, 2, 0.42, { noise: 0.45, fade: 'end' });

  // C3. Мостик: место, где оба берега на одной высоте и пролёт ≤ 17 м
  let best = null;
  for (let i = 20; i < 50; i++) {
    const p = RP[i];
    const wet = (p.wl - 2.2) + (p.wr - 2.2);
    if (wet > 19.5) continue;
    const sc = Math.max(1.0, Math.min(1.12, (wet + 1.6) / 17.0));
    const half = 8.6 * sc;
    const c = (p.wr - p.wl) / 2;
    const cx = p.x + p.nx * c, cz = p.z + p.nz * c;
    const gL = ground(cx - p.nx * half, cz - p.nz * half), gR = ground(cx + p.nx * half, cz + p.nz * half);
    const score = Math.abs(gL - gR) + wet * 0.03 + Math.abs(p.d - 215) * 0.004;
    if (!best || score < best.score) best = { i, p, cx, cz, gL, gR, score, wet, sc };
  }
  let footbridge = null;
  if (best) {
    const DECK = 3.20 * best.sc;
    const top = Math.max(best.gL, best.gR) + 0.18;
    const rot = alongX(best.p.nx, best.p.nz);
    footbridge = addEntryAndColliders('opt_river_footbridge', best.cx, top - DECK, best.cz, rot, { id: 'opt_river_footbridge_01', scale: +best.sc.toFixed(3) });
    placed.solid++;
    report.camp++;
    // тропа через мостик на юг — к Холмам Астарда и Междуречью (тает в пустоши)
    const sx = best.cx - best.p.nx * 11.5, sz = best.cz - best.p.nz * 11.5;
    const nx = best.cx + best.p.nx * 11.5, nz = best.cz + best.p.nz * 11.5;
    addPath([[nx, nz], [best.cx, best.cz], [sx, sz], [sx - best.p.nx * 30 + 6, sz - best.p.nz * 30 + 22], [262, 560], [292, 640]], 1.7, 2, 0.40, { noise: 0.5, fade: 'end' });
    const tx = -best.p.nz, tz = best.p.nx;   // касательная по течению: n = (tz, −tx)
    tryPut('opt_signpost', nx + tx * 3.2, nz + tz * 3.2, facing(-best.p.nx, -best.p.nz) + 0.5, { sink: 0.28, spotPad: 0 });
    tryPut('opt_park_lamp_bent', nx - 3.2, nz + 1.2, alongX(-best.p.nx, -best.p.nz), { sink: 0.1, spotPad: 0 });
  }

  // C4. Старый каменный мост рухнул в ручей ниже по течению (выход из зоны к Междуречью)
  let oldBridge = null;
  for (const i of [60, 59, 61, 58, 62]) {
    const p = RP[i];
    const c = (p.wr - p.wl) / 2;
    oldBridge = tryPut('opt_ruin_bridge', p.x + p.nx * c, p.z + p.nz * c, alongX(p.nx, p.nz) + 0.08, { scale: 1.32, wet: true, sink: 0.72, spotPad: 0, gap: 0.2 });
    if (oldBridge) break;
  }

  // C5. Берега: валуны у воды, камыш, коряги, затопленные обломки, ивняк
  const wreckAt = { 17: 'opt_wreck_caisson', 46: 'opt_wreck_steam_wagon', 30: 'opt_ruin_pipe_tangle' };
  for (let i = 3; i < RP.length && RP[i].d < 400; i += 2) {
    const p = RP[i];
    for (const side of [1, -1]) {
      if (rnd() < 0.7) {
        const b = bankPoint(i, side, rr(-0.6, 0.8));
        for (let k = 0; k < 4; k++) tryPlant(pick(REEDS), b.x + rr(-1.8, 1.8), b.z + rr(-1.8, 1.8), { wet: true, pathPad: 0.2, scaleMul: rr(1.0, 1.35) });
      }
    }
    if (i % 6 === 3) {
      const side = rnd() < 0.6 ? 1 : -1;
      const b = bankPoint(i, side, rr(-1.2, 0.4));
      tryPut(pick(['opt_boulder_m', 'opt_boulder_s', 'opt_boulder_l']), b.x, b.z, rr(0, 6.28), { scale: rr(0.7, 1.05), wet: true, sink: 0.9, pathPad: 0.6, spotPad: 4 });
    }
    if (i % 8 === 5) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(1.2, 3.0));
      tryPlant(rnd() < 0.5 ? 'forest_Log_1' : 'forest_Log_2', b.x, b.z, { pathPad: 0.6, rotY: alongX(p.nx, p.nz) + rr(-0.6, 0.6), waterMargin: -0.3 });
    }
    if (i % 4 === 1) {
      const side = rnd() < 0.5 ? 1 : -1;
      const b = bankPoint(i, side, rr(3.5, 7.0));
      tryPlant(pick(['retro_bush3_spring3', 'retro_bush1_fall', 'bush04', 'BlueberryBush', 'retro_bush02']), b.x, b.z, { pathPad: 0.8, scaleMul: rr(1.0, 1.4) });
    }
    if (i % 5 === 2) {
      const side = rnd() < 0.55 ? -1 : 1;    // лес гуще на южном берегу
      const b = bankPoint(i, side, rr(8.5, 16.0));
      tryPlant(pick(TREES), b.x, b.z, { pathPad: 2.0, gap: 0.8 });
    }
    if (wreckAt[i]) {
      const b = bankPoint(i, +1, -2.2);
      tryPut(wreckAt[i], b.x, b.z, alongX(-p.nz, p.nx) + rr(-0.5, 0.5), { wet: true, sink: wreckAt[i] === 'opt_ruin_pipe_tangle' ? 0.5 : 0.55, spotPad: 4, gap: 0.3 });
    }
  }
  // свалка у заводи (спот скрапперов) и ржавые бочки-баллоны у водовода
  for (const [x, z, kind, rot] of [[104, 318, 'opt_ruin_rubble_b', 0.4], [134, 322, 'opt_ruin_boiler_wreck', -0.6], [92, 300, 'opt_copper_tanks', 1.1], [140, 340, 'opt_cargo_pallet', 0.3], [78, 286, 'opt_ruin_rubble_a', 2.2]]) {
    tryPut(kind, x, z, rot, { pathPad: 0.6, spotPad: 4 });
  }
  // заводь у водовода: камыш по кромке и пара коряг
  for (let k = 0; k < 14; k++) {
    const a = rr(0, Math.PI * 2), d = rr(14, 22);
    const x = head.x + Math.cos(a) * d, z = head.z + Math.sin(a) * d;
    let gy; try { gy = ground(x, z); } catch (e) { continue; }
    if (Math.abs(gy - head.s) < 0.6) tryPlant(pick(REEDS), x, z, { wet: true, scaleMul: rr(1.0, 1.3) });
  }

  // ============================================================
  //  C6. СТАРЫЙ АКВЕДУК: опоры от котельной лагеря вниз к ручью (юго-восточный склон)
  //  (кит уже в игре — 0 новых моделей; линия читается издалека и ведёт взгляд к воде)
  // ============================================================
  {
    const A0 = [316, 288], A1 = [334, 400];
    const ad = norm(A1[0] - A0[0], A1[1] - A0[1]);
    const rot = alongX(ad.x, ad.z);
    for (const [t, kind, extra] of [[0, 'opt_ruin_aqueduct_pier', 0], [28, 'opt_ruin_aqueduct_pier', 0.04], [42, 'opt_ruin_viaduct_east', 0.10],
      [56, 'opt_ruin_aqueduct_pier', -0.03], [84, 'opt_ruin_aqueduct_pier', 0.06], [104, 'opt_ruin_rubble_b', 0.9], [108, 'opt_ruin_pipe_tangle', 0.4]]) {
      const x = A0[0] + ad.x * t, z = A0[1] + ad.z * t;
      tryPut(kind, x, z, rot + extra, { pathPad: 1.0, spotPad: 8, gap: 0.4 });
    }
    for (const t of [14, 70, 96]) {
      const x = A0[0] + ad.x * t + ad.z * rr(-6, 6), z = A0[1] + ad.z * t - ad.x * rr(-6, 6);
      tryPlant(pick(['retro_bush1_fall', 'bush04', 'retro_bush02']), x, z, { pathPad: 0.6, scaleMul: rr(1.0, 1.3) });
      tryPut(rnd() < 0.5 ? 'opt_dead_tree_a' : 'opt_dead_tree_b', x + 7, z - 3, rr(0, 6.28), { scale: rr(0.7, 0.9), pathPad: 1, spotPad: 6 });
    }
  }

  // ============================================================
  //  D. ПЕРЕХОДЫ К СОСЕДНИМ ЛОКАЦИЯМ (покраска троп)
  // ============================================================
  // на север — в Восточные земли: от развилки у лагеря вдоль западного фланга
  addPath([[240, 84], [246, 62], [256, 36], [270, 6], [286, -30], [300, -64]], 2.0, 2, 0.42, { noise: 0.45, fade: 'end' });
  tryPut('opt_signpost', 249, 64, facing(-1, 0.3), { sink: 0.28, spotPad: 0 });
  // вниз по оврагу — в Междуречье: тропа по левому берегу за старым мостом
  const down = [];
  for (let i = 58; i < RP.length && RP[i].d < 560; i += 4) {
    const b = bankPoint(i, -1, 4.5);
    down.push([+b.x.toFixed(1), +b.z.toFixed(1)]);
  }
  if (down.length > 1) addPath(down, 1.6, 2, 0.38, { noise: 0.5, fade: 'end' });

  // ============================================================
  //  Блокировка случайной расстановки окрестностей (лес/руины/трава) в парке и в воде
  // ============================================================
  function inParkCore(x, z) {
    if (x > 54 && x < 190 && z > 92 && z < 212) {
      // скруглённый северо-западный край (граница зоны с деревней)
      return !(x < 70 && z < 104);
    }
    return false;
  }
  function blockScatter(x, z) {
    if (inParkCore(x, z)) return true;
    if (nearPath(x, z, 1.5)) return true;
    if (inRiver(x, z, 0.35, 1.0)) return true;
    return false;
  }

  return {
    paint, PATHS, blockScatter, inParkCore, inRiver, nearPath,
    footbridge, oldBridge, culvert: culv, fountain, pavilion: pav, greenhouse: gh, placed,
    bridgeInfo: best ? { i: best.i, wet: +best.wet.toFixed(1), dh: +Math.abs(best.gL - best.gR).toFixed(2) } : null
  };
};

module.exports.SPOTS = SPOTS;
module.exports.SPOT_R_UV = SPOT_R_UV;
module.exports.ZONE_POLY = ZONE_POLY;
