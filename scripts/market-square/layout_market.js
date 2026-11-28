#!/usr/bin/env node
// ============================================================
//  SCRIPTS / MARKET-SQUARE / LAYOUT_MARKET.JS
//  Рыночная площадь деревни в зоне стройплощадки «Рыночная площадь» (buildSites сцены):
//  центр — метка площадки, всё — внутри её контура.
//
//  Живой рынок, а не чертёж:
//   • центральная площадь — каменная модель по рельефу (mkt_plaza_stone): кривое кольцо-улица
//     брусчаткой, внутри плиты; улицы от кольца ведут к настоящим дорогам автора — их рисует
//     кисть террейна (paint_market.py) по market-roads.json, который пишет этот скрипт;
//   • ни один объект не стоит на видимой брусчатке (visible-cobble.json + самопроверка
//     paint_market.py --check перед записью сцены);
//   • лавки по секторам линий классов (лавки 2-й профессии — за лавкой родителя),
//     но каждая сдвинута и развёрнута по-своему; между ними столы с товаром,
//     кучи ящиков, бочек и мешков, тележки;
//   • стимпанк: паровые котлы с огнём в топке, паровой тягач, паропроводы над улицами,
//     паровые фонари с баками, дирижабль у причальной мачты;
//   • гирлянды флажков вокруг фонтана и поперёк выходов, синие вымпелы;
//   • фахверковые дома по краю — с дворами, заборами, деревьями, кустами и цветами.
//  Старые пропсы прежнего рынка (13 объектов) сняты по согласованию с автором.
//
//  Запуск:
//    node scripts/market-square/layout_market.js --dry [--check] [--dump plan.json]   отчёт + market-roads.json
//    python scripts/market-square/paint_market.py                           кисть террейна по дорогам
//    node scripts/market-square/layout_market.js [--force]                  самопроверка, запись сцены (rev+1), запекание
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { meta } = require('./market-meta');

const ROOT = path.join(__dirname, '..', '..');
const MAN_PATH = path.join(__dirname, 'market-manifest.json');
const ROADS_PATH = path.join(__dirname, 'market-roads.json');
const ARG = process.argv.slice(2);
const DRY = ARG.includes('--dry');
const DUMP = ARG.includes('--dump') ? ARG[ARG.indexOf('--dump') + 1] : null;

// ---- рельеф ----
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
globalThis.TerrainData = win.TerrainData;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
function ground(x, z) {
  const y = TH.groundY(x, z, 600, 1200);
  if (y == null || !isFinite(y)) throw new Error('нет земли под ' + x.toFixed(1) + ',' + z.toFixed(1));
  return y;
}

// ---- сцена и площадка ----
const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
const cur = JSON.parse(fs.readFileSync(writer.OVERRIDES_JSON_PATH, 'utf8'));
let WB;
try { WB = require(path.join(ROOT, 'shared', 'world-metrics.js')).worldBounds(); } catch (_) { WB = null; }
if (!WB || !isFinite(WB.minX)) {
  WB = { minX: -1892.6082763671875, maxX: 1838.1767578125, minZ: -1918.204345703125, maxZ: 1827.108642578125 };
}
const WW = WB.maxX - WB.minX, WH = WB.maxZ - WB.minZ;
const toWorld = (p) => [WB.minX + p[0] * WW, WB.minZ + p[1] * WH];

const SITE = (cur.buildSites || []).find(s => s && s.kind === 'poly' && s.name === 'Рыночная площадь');
if (!SITE) throw new Error('в сцене нет стройплощадки «Рыночная площадь» (buildSites)');
const C = { x: SITE.x, z: SITE.z };
const OTHER_ZONES = (cur.buildSites || []).filter(s => s && s.kind === 'poly' && s !== SITE && Array.isArray(s.poly))
  .map(s => ({ name: s.name, poly: s.poly.map(toWorld) }));

const MAN = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const PIECES = MAN.pieces;

// ---- детерминированный случай ----
let _s = 20261127;
function rnd() { _s |= 0; _s = (_s + 0x6D2B79F5) | 0; let t = Math.imul(_s ^ (_s >>> 15), 1 | _s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];
const deg = (a) => a * Math.PI / 180;
const polar = (r, aDeg) => ({ x: C.x + r * Math.cos(deg(aDeg)), z: C.z + r * Math.sin(deg(aDeg)) });
const faceCenter = (p) => Math.atan2(C.x - p.x, C.z - p.z);   // three.js Ry: локальный +Z смотрит на центр

// ============================================================
//  Район рынка: зона автора «Рыночная площадь» и всё свободное место вокруг —
//  до северной и восточной стены (линии «Стены…» сцены), до дороги автора на западе
//  и до зоны «Мастер ТП» на юге. Центр площади — метка зоны рынка.
// ============================================================
const WALLS = (cur.buildSites || []).filter(s => s && s.kind === 'line' && /Стен/.test(s.name || '') && Array.isArray(s.poly)).map(s => s.poly.map(toWorld));
// Западная и южная граница идут по восточной кромке дорог автора (маска village-roads-mask.json,
// снятая по UV меша террейна — так, как покраску видит игра): главная дорога с изгибом на запад
// до x≈−45 у z≈−50, отросток на восток у z≈5–15, нижняя ветка на восток до x≈50 у z≈−140.
const DISTRICT = [[-5, -114], [-8, -100], [-16, -86], [-25, -74], [-35, -61], [-38, -48], [-35, -36], [-29, -24], [-18, -13], [4, -6], [11, -1],
  [13, 8], [9, 16], [6, 22], [10, 30], [13, 40], [16, 50], [44, 54], [198, 4], [200, -160], [152, -124], [76, -128], [52, -136], [47, -131],
  [37, -126], [25, -121], [14, -117]];
const ZONE = DISTRICT;
// Парк между рынком и нижней дорогой автора: на этом этапе пустует (заполняет этап «парк с фонтаном»)
const PARK = [[-30, -60], [22, -57], [29, -70], [36, -86], [38, -104], [34, -121], [25, -118], [14, -114], [-4, -110], [-10, -98], [-18, -84], [-26, -72]];

// ---- дороги рынка: кольцо и улицы, которые продолжают дороги автора ----
const ph = Array.from({ length: 8 }, () => rr(0, Math.PI * 2));
const ringR = (a) => 37 + 1.6 * Math.sin(2 * a + ph[0]) + 0.9 * Math.sin(5 * a + ph[1]) + 0.4 * Math.sin(11 * a + ph[2]);
const ringW = (a) => 7.0 + 1.0 * Math.sin(3 * a + ph[3]) + 0.5 * Math.sin(7 * a + ph[4]);
const ROADS = [];
{
  const pts = [], w = [];
  for (let i = 0; i <= 160; i++) {
    const a = 2 * Math.PI * i / 160;
    const r = ringR(a);
    pts.push([C.x + r * Math.cos(a), C.z + r * Math.sin(a)]);
    w.push(ringW(a));
  }
  ROADS.push({ kind: 'ring', pts, w });
}
const angTo = (p) => Math.atan2(p.z - C.z, p.x - C.x) * 180 / Math.PI;
/** Улица по квадратичной кривой: старт на кольце (или в точке), изгиб в сторону, конец в цели. */
function street(kind, from, to, bend, w0, n) {
  n = n || 16;
  const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  const cx = mx - dz / L * bend, cz = mz + dx / L * bend;
  const wig = rr(0, 6.28);
  const pts = [], w = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x;
    const z = (1 - t) * (1 - t) * from.z + 2 * (1 - t) * t * cz + t * t * to.z;
    pts.push([x, z]);
    w.push(w0 + 0.7 * Math.sin(t * 5 + wig));
  }
  const road = { kind, pts, w, a: angTo(to) };
  ROADS.push(road);
  return road;
}
const ringAt = (target) => ringAtA(angTo(target));
const ringAtA = (aDeg) => { const a = deg(aDeg); const r = ringR(a); return { x: C.x + r * Math.cos(a), z: C.z + r * Math.sin(a) }; };
// Концы улиц заходят на 1–2 м в брусчатку автора — стык без щели
const AUTHOR_W = { x: -44, z: -44 };                     // главная дорога автора на западе (её изгиб)
const LOOP_END = { x: 46, z: -135 };                     // тупик нижней ветки автора, что смотрит на рынок
const TP_GATE = { x: 104, z: -126 }, TP_IN = { x: 114, z: -150 };   // к мастеру телепорта
const DEPOT = { x: 175, z: -38 };                        // депо у восточной стены
const MON = { x: 133, z: 3, r: 10 };                     // площадь монумента
const LANE_W = { x: 14, z: 8 };                          // отросток дороги автора на северо-западе
const SQUARES = [{ x: MON.x, z: MON.z, r: MON.r }];
street('exit', ringAt(AUTHOR_W), AUTHOR_W, rr(-5, 5), 8.4);
street('exit', ringAt(LOOP_END), LOOP_END, rr(-4, 4), 7.6, 10);
// узлы кольца разнесены равномерно (≈60–80°), улицы потом сворачивают к своим целям
const A_TP = 318, A_DEPOT = 30, A_NORTH = 100;
const tpRoad = street('tp', ringAtA(A_TP), TP_GATE, -10, 8.0, 14);
street('tp', TP_GATE, TP_IN, 3, 7.6, 8);
const depotRoad = street('exit', ringAtA(A_DEPOT), DEPOT, -6, 8.4);
const NORTH = { x: C.x - 3, z: 22 };
street('exit', ringAtA(A_NORTH), NORTH, rr(-3, 3), 7.6, 8);
// юго-восточная улица: от дороги к ТП до депо (застройка между ними)
const SE_FROM = { x: tpRoad.pts[6][0], z: tpRoad.pts[6][1] };
street('exit', SE_FROM, { x: DEPOT.x - 2, z: DEPOT.z - 50 }, 6, 7.6, 12);
// улочка вдоль северной стены: от отростка дороги автора к площади монумента
{
  const pts = [[LANE_W.x, LANE_W.z], [22, 17], [34, 24], [NORTH.x, NORTH.z], [90, 15.5], [112, 11], [MON.x - 9, MON.z + 4]];
  const w = pts.map(() => rr(6.6, 7.4));
  ROADS.push({ kind: 'lane', pts, w, a: 90 });
}
// дорога вдоль депо, вдоль восточной стены
street('exit', { x: DEPOT.x, z: DEPOT.z + 30 }, { x: DEPOT.x - 2, z: DEPOT.z - 55 }, 4, 7.6, 10);
// узлы кольца — где к нему примыкают улицы; между ними сектора лавок
const JUNCTIONS = [angTo(AUTHOR_W), angTo(LOOP_END), A_TP, A_DEPOT, A_NORTH];
// протоптанные проходы от каждого узла к фонтану
const TRACKS = JUNCTIONS.map((a0) => {
  const off = rr(-6, 6), wig = rr(0, 6.28);
  const pts = [], w = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = 32 - 22 * t;
    const a = a0 + off * Math.sin(Math.PI * t) + 3 * Math.sin(t * 6 + wig);
    pts.push([C.x + r * Math.cos(deg(a)), C.z + r * Math.sin(deg(a))]);
    w.push(3.0 + 0.6 * Math.sin(t * 4 + wig));
  }
  return { kind: 'track', pts, w };
});
const FOUNTAIN_PATCH = 8.6;

// ---- парк: каменный круг у фонтана и дорожки-лучи (модель mkt_park_paving, не покраска) ----
const PARK_C = { x: 5, z: -88 }, PARK_R = 8.5;
function parkPath(to, bend, w) {
  const from = PARK_C;
  const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz) || 1;
  const cx = mx - dz / L * bend, cz = mz + dx / L * bend;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push([(1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * to.x, (1 - t) * (1 - t) * from.z + 2 * (1 - t) * t * cz + t * t * to.z]);
  }
  return { kind: 'park', pts, w: pts.map(() => w) };
}
// выход к рынку — до края каменной площади (по углу от центра рынка), остальные заходят на 1.5–2 м в улицы и дороги
const PARK_TO_MARKET = (() => { const a = angTo({ x: 34, z: -70 }); const r = ringR(deg(a)) + ringW(deg(a)) / 2; return { x: C.x + r * Math.cos(deg(a)), z: C.z + r * Math.sin(deg(a)) }; })();
const PARK_PATHS = [
  parkPath(PARK_TO_MARKET, 3, 3.4),
  parkPath({ x: 3, z: -46 }, -2, 3.0),
  parkPath({ x: -19, z: -87 }, 2, 3.0),
  parkPath({ x: 9, z: -119.5 }, -2, 3.0)
];
const EXITS = JUNCTIONS;
const A0 = angTo(AUTHOR_W);

function distSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return { d: Math.hypot(px - (ax + vx * t), pz - (az + vz * t)), t };
}
/** Насколько точка «внутри» полилинии с переменной шириной: расстояние до кромки (<0 — на дороге). */
function roadEdgeDist(road, x, z) {
  let best = Infinity;
  for (let i = 0; i < road.pts.length - 1; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
    const s = distSeg(x, z, ax, az, bx, bz);
    const w = road.w[i] + (road.w[i + 1] - road.w[i]) * s.t;
    best = Math.min(best, s.d - w / 2);
  }
  return best;
}
// дороги автора (покраска до рынка): village-roads-mask.json из paint_market.py --mask
const UMASK = fs.existsSync(path.join(__dirname, 'village-roads-mask.json')) ? JSON.parse(fs.readFileSync(path.join(__dirname, 'village-roads-mask.json'), 'utf8')) : null;
function userRoad(x, z, pad) {
  if (!UMASK) return false;
  const rc = Math.ceil((pad || 0) / UMASK.cell);
  const i0 = Math.floor((x - UMASK.x0) / UMASK.cell), j0 = Math.floor((z - UMASK.z0) / UMASK.cell);
  for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
    const i = i0 + di, j = j0 + dj;
    if (i < 0 || j < 0 || i >= UMASK.nx || j >= UMASK.nz) continue;
    if (UMASK.rows[j][i] === '1' && Math.hypot(di, dj) * UMASK.cell <= (pad || 0) + UMASK.cell * 0.75) return true;
  }
  return false;
}
// видимая брусчатка (своя и автора) так, как её рисует шейдер: visible-cobble.json из paint_market.py.
// Покраска лежит на сетке 3.6 м и при сглаживании расплывается на ~2 м за кромку — расстановка смотрит
// на то, что видно в игре, а не только на геометрию улиц.
const VIS = (() => {
  const f = path.join(__dirname, 'visible-cobble.json');
  if (!fs.existsSync(f)) return null;
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  j.buf = Buffer.from(j.data, 'base64');
  return j;
})();
const VIS_LIM = 0.13 * 255;          // центр улицы ≈0.9; самопроверка падает с 0.16 — запас на сглаживание
function visCobble(x, z) {
  if (!VIS) return 0;
  const i = Math.floor((x - VIS.x0) / VIS.cell), j = Math.floor((z - VIS.z0) / VIS.cell);
  if (i < 0 || j < 0 || i >= VIS.nx || j >= VIS.nz) return 0;
  return VIS.buf[j * VIS.nx + i];
}
function onRoad(x, z, pad, withTracks) {
  if (visCobble(x, z) > VIS_LIM) return true;
  if (Math.hypot(x - C.x, z - C.z) < FOUNTAIN_PATCH + pad) return true;
  for (const q of SQUARES) if (Math.hypot(x - q.x, z - q.z) < q.r + pad) return true;
  if (userRoad(x, z, pad)) return true;
  for (const r of ROADS) if (roadEdgeDist(r, x, z) < pad) return true;
  if (withTracks) for (const r of TRACKS) if (roadEdgeDist(r, x, z) < pad) return true;
  if (Math.hypot(x - PARK_C.x, z - PARK_C.z) < PARK_R + 0.3 + pad) return true;
  for (const r of PARK_PATHS) if (roadEdgeDist(r, x, z) < pad + 0.15) return true;
  return false;
}
function wallDist(x, z) {
  let best = Infinity;
  for (const w of WALLS) for (let i = 0; i < w.length - 1; i++) best = Math.min(best, distSeg(x, z, w[i][0], w[i][1], w[i + 1][0], w[i + 1][1]).d);
  return best;
}

// ============================================================
//  Геометрия занятости и зон
// ============================================================
function rotXZ(lx, lz, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}
function corners(x, z, hx, hz, ry) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => { const o = rotXZ(a * hx, b * hz, ry); return { x: x + o.x, z: z + o.z }; });
}
function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) c = !c;
  }
  return c;
}
function distToPolyEdge(poly, x, z) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distSeg(x, z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]).d);
  return d;
}
function obbOverlap(a, b, gap) {
  const g = gap || 0;
  const A = { hx: a.hx + g / 2, hz: a.hz + g / 2 }, B = { hx: b.hx + g / 2, hz: b.hz + g / 2 };
  const dx = b.x - a.x, dz = b.z - a.z;
  if (Math.hypot(dx, dz) > Math.hypot(A.hx, A.hz) + Math.hypot(B.hx, B.hz)) return false;
  const ax = [[Math.cos(a.ry), -Math.sin(a.ry)], [Math.sin(a.ry), Math.cos(a.ry)]];
  const bx = [[Math.cos(b.ry), -Math.sin(b.ry)], [Math.sin(b.ry), Math.cos(b.ry)]];
  for (const [ux, uz] of ax.concat(bx)) {
    const dist = Math.abs(dx * ux + dz * uz);
    const rA = A.hx * Math.abs(ax[0][0] * ux + ax[0][1] * uz) + A.hz * Math.abs(ax[1][0] * ux + ax[1][1] * uz);
    const rB = B.hx * Math.abs(bx[0][0] * ux + bx[0][1] * uz) + B.hz * Math.abs(bx[1][0] * ux + bx[1][1] * uz);
    if (dist >= rA + rB) return false;
  }
  return true;
}

// ============================================================
//  Расстановка
// ============================================================
const props = [];
const OCC = [];
const ROAD_OK = new Set();          // стоят на дороге по замыслу: гирлянды, паропровод над улицей, скамьи площадей, плиты площади
const counters = {};
const report = { pieces: {}, skipped: 0, foliage: 0 };

function nextId(piece) {
  // WorldMetrics.normalizeWorldKey: id с wall/water/terrain/volcano/mountain пропадают из мира
  const safe = String(piece).replace(/wall/gi, 'masonry').replace(/mountain|volcano|terrain|water/gi, 'site');
  counters[safe] = (counters[safe] || 0) + 1;
  return safe + '_' + String(counters[safe]).padStart(2, '0');
}

function footprint(size, x, z, ry, shrink) {
  const k = shrink == null ? 0.94 : shrink;
  return { x, z, ry, hx: size[0] / 2 * k, hz: size[2] / 2 * k };
}

/** Проверки места: в контуре зоны, не в чужой зоне, не на дороге (если надо), не внахлёст. */
function whyNot(size, x, z, ry, opt) {
  opt = opt || {};
  const f = footprint(size, x, z, ry, opt.shrink);
  const big = Math.max(f.hx, f.hz) > 2.5;
  const pad = opt.roadPad != null ? opt.roadPad : (big ? 1.5 : 0.8);
  const step = 1.2;
  const nx = Math.max(1, Math.ceil(2 * f.hx / step)), nz = Math.max(1, Math.ceil(2 * f.hz / step));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const o = rotXZ(-f.hx + 2 * f.hx * i / nx, -f.hz + 2 * f.hz * j / nz, ry);
    const px = x + o.x, pz = z + o.z;
    if (!inPoly(ZONE, px, pz) || distToPolyEdge(ZONE, px, pz) < (opt.margin != null ? opt.margin : 2)) return 'вне района';
    if (wallDist(px, pz) < 4) return 'у стены';
    for (const oz of OTHER_ZONES) if (inPoly(oz.poly, px, pz)) return 'в зоне «' + oz.name + '»';
    if (!opt.park && inPoly(PARK, px, pz)) return 'в парке';
    if (opt.road !== false && onRoad(px, pz, pad, opt.tracks !== false)) return 'на дороге';
  }
  if (!opt.noOcc) for (const o of OCC) if (obbOverlap(f, o, opt.gap != null ? opt.gap : 0.4)) return 'внахлёст';
  return null;
}

function groundUnder(size, x, z, ry) {
  const hw = size[0] / 2, hd = size[2] / 2;
  const g = [];
  for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = rotXZ(a * hw, b * hd, ry);
    g.push(ground(x + o.x, z + o.z));
  }
  return { min: Math.min(...g), max: Math.max(...g), avg: g.reduce((s, v) => s + v, 0) / g.length };
}

/** Модель кита рынка. opt: ground 'min'|'max'|'avg', sink, y, scale {x,y,z}, noOcc, force, … */
function put(piece, x, z, ry, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const sc = opt.scale || { x: 1, y: 1, z: 1 };
  const size = [m.size[0] * sc.x, m.size[1] * sc.y, m.size[2] * sc.z];
  if (!opt.force && whyNot(size, x, z, ry, opt)) { report.skipped++; return null; }
  const md = meta(piece);
  const g = groundUnder(size, x, z, ry);
  const G = opt.y != null ? opt.y : ((opt.ground === 'max' ? g.max : opt.ground === 'avg' ? g.avg : g.min) - (opt.sink || 0));
  const y = G + m.anchorShift[1] * sc.y;
  const id = nextId(piece);
  const p = {
    id,
    name: md.nameRu,
    type: 'prop',
    meshType: 'glb',
    modelId: piece,
    modelFile: m.file,
    category: md.category,
    position: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +ry.toFixed(5), z: 0 },
    scale: { x: +sc.x.toFixed(4), y: +sc.y.toFixed(4), z: +sc.z.toFixed(4) },
    instanced: true,
    distClass: md.distClass || 'prop',
    drawDist: m.drawDist || 220,
    lodDist: m.lodDist || [35, 90]
  };
  if (m.shadow === false) p.castShadow = false;
  const cols = opt.noCollision ? [] : (m.colliders || []);
  if (cols.length === 1) {
    const c = cols[0];
    p.collision = true;
    p.collisionShape = c.shape || md.shape || 'box';
    p.collisionSize = { x: +(c.w * sc.x).toFixed(3), y: +(c.h * sc.y).toFixed(3), z: +(c.d * sc.z).toFixed(3) };
    p.collisionOffset = { x: +(c.x * sc.x).toFixed(3), y: +(c.y0 * sc.y).toFixed(3), z: +(c.z * sc.z).toFixed(3) };
  } else {
    p.collision = false;
  }
  props.push(p);
  if (opt.road === false || opt.force) ROAD_OK.add(id);
  if (cols.length > 1) {
    cols.forEach((c, i) => {
      const o = rotXZ(c.x * sc.x, c.z * sc.z, ry);
      props.push({
        id: id + '_col' + (i + 1), name: 'Коллизия: ' + md.nameRu, type: 'prop', meshType: 'collision_box',
        position: { x: +(x + o.x).toFixed(3), y: +(y + c.y0 * sc.y).toFixed(3), z: +(z + o.z).toFixed(3) },
        rotation: { x: 0, y: +ry.toFixed(5), z: 0 }, scale: { x: 1, y: 1, z: 1 },
        collision: true, collisionShape: c.shape || 'box',
        collisionSize: { x: +(c.w * sc.x).toFixed(3), y: +(c.h * sc.y).toFixed(3), z: +(c.d * sc.z).toFixed(3) },
        collisionOffset: { x: 0, y: 0, z: 0 }
      });
    });
  }
  if (!opt.noOcc) OCC.push(Object.assign(footprint(size, x, z, ry, opt.shrink), { id, piece }));
  report.pieces[piece] = (report.pieces[piece] || 0) + 1;
  return p;
}

/** Несколько попыток со случайным сдвигом и поворотом — «как поставили люди». */
function putJitter(piece, gen, opt, tries) {
  for (let i = 0; i < (tries || 30); i++) {
    const g = gen(i);
    const r = put(piece, g.x, g.z, g.ry, Object.assign({}, opt || {}, g.opt || {}));
    if (r) return Object.assign(r, { _ry: g.ry });
  }
  return null;
}

// ---- растительность и FBX-модели библиотеки (как ставит редактор) ----
const FOL = {
  tree066: { s: 0.0336, name: 'Ретро дерево №066' }, tree069: { s: 0.0476, name: 'Ретро дерево №069' },
  tree070: { s: 0.0366, name: 'Ретро дерево №070' }, tree071: { s: 0.0297, name: 'Ретро дерево №071' },
  tree074: { s: 0.0487, name: 'Ретро дерево №074' },
  retro_bush4_spring1: { s: 0.0249, name: 'Кустарник №4 (Весенний)' }, retro_bush8_summer: { s: 0.0241, name: 'Кустарник №8 (Летний)' },
  retro_bush3_spring3: { s: 0.0241, name: 'Кустарник №3 (Весенний)' }, bush04: { s: 0.2716, name: 'Куст №4' },
  matted_pratia_c: { s: 0.1114, name: 'Пратия стелющаяся (Ковер C)' }, matted_pratia_d: { s: 0.0456, name: 'Пратия стелющаяся (Ковер D)' },
  matted_pratia_f: { s: 0.0375, name: 'Пратия стелющаяся (Ковер F)' }, matted_pratia_g: { s: 0.0433, name: 'Пратия стелющаяся (Ковер G)' },
  field_poppy_f: { s: 0.0176, name: 'Мак полевой (Вариант F)' }
};
for (const p of cur.customProps || []) if (p && p.isFoliage && FOL[p.modelId] && p.name) FOL[p.modelId].name = p.name;
const FOL_R = { tree: 2.2, bush: 0.9, flower: 0.5 };
function plant(kind, x, z, opt) {
  opt = opt || {};
  const f = FOL[kind];
  const cls = /^tree/.test(kind) ? 'tree' : (/bush/.test(kind) ? 'bush' : 'flower');
  const rad = FOL_R[cls] * (opt.k || 1);
  if (!inPoly(ZONE, x, z) || distToPolyEdge(ZONE, x, z) < 1.5 || wallDist(x, z) < 2.5) return null;
  for (const oz of OTHER_ZONES) if (inPoly(oz.poly, x, z)) return null;
  if (!opt.park && inPoly(PARK, x, z)) return null;
  if (!opt.onRoad && onRoad(x, z, cls === 'flower' ? 0.3 : 0.8, cls !== 'flower')) return null;
  const vr = cls === 'tree' ? 0.8 : (cls === 'bush' ? 0.95 : 0.65);   // с запасом: сетка видимой брусчатки 1 м
  if (!opt.onRoad && [[vr, 0], [-vr, 0], [0, vr], [0, -vr], [vr, vr], [-vr, vr], [vr, -vr], [-vr, -vr]].some(([a, b]) => visCobble(x + a, z + b) > VIS_LIM)) return null;
  const me = { x, z, ry: 0, hx: rad * 0.7, hz: rad * 0.7 };
  for (const o of OCC) if (obbOverlap(me, o, 0.1)) return null;
  const s = f.s * (opt.k || rr(0.85, 1.18));
  const p = {
    id: 'mkt_' + nextId('fol_' + kind), name: f.name + ' (Растительность)', type: 'prop', meshType: 'fbx',
    modelId: kind, modelFile: kind + '.fbx',
    position: { x: +x.toFixed(3), y: +(ground(x, z) - (cls === 'tree' ? 0.15 : 0.02)).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rr(0, 6.283).toFixed(4), z: 0 },
    scale: { x: +s.toFixed(5), y: +s.toFixed(5), z: +s.toFixed(5) },
    isFoliage: true
  };
  props.push(p);
  if (cls !== 'flower') OCC.push(Object.assign(me, { id: p.id, piece: kind }));
  report.foliage++;
  return p;
}
function putLibFbx(modelId, file, nameRu, category, scale, x, z, ry, y, col) {
  const p = {
    id: 'mkt_' + nextId(modelId), name: nameRu, type: 'prop', meshType: 'fbx', modelId, modelFile: file, category,
    position: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +ry.toFixed(5), z: 0 }, scale: { x: scale, y: scale, z: scale }
  };
  if (col) Object.assign(p, { collision: true, collisionShape: 'cylinder', collisionSize: col, collisionOffset: { x: 0, y: 0, z: 0 } });
  else p.collision = false;
  props.push(p);
  report.pieces[modelId] = (report.pieces[modelId] || 0) + 1;
  return p;
}

// ---- 1. Фонтан, площадь монумента, часовая башня на въезде к мастеру телепорта ----
put('mkt_fountain', C.x, C.z, Math.atan2(Math.cos(deg(A0)), Math.sin(deg(A0))), { ground: 'avg', force: true });
// каменная площадь — модель по рельефу (build_market.py строит её по market-roads.json прошлого прогона):
// плиты внутри кольца, брусчатка на кольце и у фонтана; вершины в мировых высотах, поворота нет
if (PIECES.mkt_plaza_stone) {
  const m = PIECES.mkt_plaza_stone;
  const r0 = ROADS[0].pts[0], src = m.src || {};
  if (Math.abs((src.cx || 0) - C.x) > 0.01 || Math.abs((src.cz || 0) - C.z) > 0.01 || !src.r0 || Math.hypot(src.r0[0] - r0[0], src.r0[1] - r0[1]) > 0.01) {
    console.log('[market] ! модель площади собрана под другое кольцо: пересоберите mkt_plaza_stone (build_market.py -- mkt_plaza_stone)');
    if (!DRY) process.exit(2);
  }
  put('mkt_plaza_stone', C.x + m.anchorShift[0], C.z + m.anchorShift[2], 0, { y: 0, force: true, noOcc: true, noCollision: true });
} else console.log('[market] ! нет модели mkt_plaza_stone в манифесте — площадь без камня');

// ---- 1б. Парк с фонтаном между рынком и нижней дорогой автора ----
{
  const PK = { park: true };
  if (PIECES.mkt_park_paving) {
    const m = PIECES.mkt_park_paving, src = m.src || {};
    const e0 = PARK_PATHS[0].pts[PARK_PATHS[0].pts.length - 1];
    if (Math.abs((src.ox || 0) - PARK_C.x) > 0.01 || Math.abs((src.oz || 0) - PARK_C.z) > 0.01 || src.n !== PARK_PATHS.length ||
        !src.p0 || Math.hypot(src.p0[0] - e0[0], src.p0[1] - e0[1]) > 0.01) {
      console.log('[market] ! дорожки парка собраны под другую раскладку: пересоберите mkt_park_paving');
      if (!DRY) process.exit(2);
    }
    put('mkt_park_paving', PARK_C.x + m.anchorShift[0], PARK_C.z + m.anchorShift[2], 0, { y: 0, force: true, noOcc: true, noCollision: true });
  }
  const pathA = PARK_PATHS.map(r => { const [x, z] = r.pts[3]; return Math.atan2(z - PARK_C.z, x - PARK_C.x) * 180 / Math.PI; });
  const nearPath = (aDeg, lim) => pathA.some(b => Math.abs(((aDeg - b) % 360 + 540) % 360 - 180) < lim);
  if (PIECES.mkt_park_fountain) put('mkt_park_fountain', PARK_C.x, PARK_C.z, rr(0, 6.28), { ground: 'avg', force: true });
  // скамьи по кругу фасадом к фонтану — между устьями дорожек
  for (let k = 0; k < 12; k++) {
    const a = k * 30 + 15;
    if (nearPath(a, 24)) continue;
    const p = { x: PARK_C.x + 6.6 * Math.cos(deg(a)), z: PARK_C.z + 6.6 * Math.sin(deg(a)) };
    put('mkt_bench', p.x, p.z, Math.atan2(PARK_C.x - p.x, PARK_C.z - p.z), Object.assign({ road: false, gap: 0.2 }, PK));
  }
  // фонари по краю круга и вдоль дорожек
  for (let k = 0; k < 4; k++) {
    const a = pathA[k] + (((pathA[(k + 1) % 4] - pathA[k]) % 360) + 360) % 360 / 2;
    const p = { x: PARK_C.x + (PARK_R + 1.7) * Math.cos(deg(a)), z: PARK_C.z + (PARK_R + 1.7) * Math.sin(deg(a)) };
    put('mkt_lamp', p.x, p.z, rr(0, 6.28), Object.assign({ roadPad: 0.2, gap: 0.2, tracks: false }, PK));
  }
  PARK_PATHS.forEach((r, k) => {
    let side = k % 2 ? 1 : -1;
    for (let i = 3; i < r.pts.length - 1; i += 3) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
      const off = r.w[i] / 2 + 1.3;
      put('mkt_lamp', ax + nx * off * side, az + nz * off * side, rr(0, 6.28), Object.assign({ roadPad: 0.2, gap: 0.2, tracks: false }, PK));
      side = -side;
    }
  });
  // клумбы в каменном бордюре — в секторах между дорожками
  if (PIECES.mkt_flowerbed) {
    for (let k = 0; k < 4; k++) {
      const a = pathA[k] + (((pathA[(k + 1) % 4] - pathA[k]) % 360) + 360) % 360 / 2;
      putJitter('mkt_flowerbed', (i) => { const r = 13 + rr(-1, 2) + i * 0.2; const b = a + rr(-8, 8); return { x: PARK_C.x + r * Math.cos(deg(b)), z: PARK_C.z + r * Math.sin(deg(b)), ry: rr(0, 6.28) }; },
        Object.assign({ gap: 0.6, roadPad: 1.0 }, PK), 25);
      putJitter('mkt_flowerbed', (i) => { const r = 21 + rr(-2, 3) + i * 0.2; const b = a + rr(-15, 15); return { x: PARK_C.x + r * Math.cos(deg(b)), z: PARK_C.z + r * Math.sin(deg(b)), ry: rr(0, 6.28) }; },
        Object.assign({ gap: 0.6, roadPad: 1.0 }, PK), 25);
    }
  }
}
put('mkt_monument', MON.x, MON.z, Math.atan2(C.x - MON.x, C.z - MON.z), { ground: 'avg', force: true, noOcc: false });
for (let k = 0; k < 4; k++) {
  const a = 45 + k * 90 + rr(-8, 8);
  const p = { x: MON.x + 8.2 * Math.cos(deg(a)), z: MON.z + 8.2 * Math.sin(deg(a)) };
  put('mkt_bench', p.x, p.z, Math.atan2(MON.x - p.x, MON.z - p.z), { road: false, gap: 0.2 });
  const q = { x: MON.x + 11.2 * Math.cos(deg(a + 45)), z: MON.z + 11.2 * Math.sin(deg(a + 45)) };
  put('mkt_lamp', q.x, q.z, rr(0, 6.28), { roadPad: 0.2, tracks: false, gap: 0.2 });
}
{
  const [ax, az] = tpRoad.pts[tpRoad.pts.length - 3], [bx, bz] = tpRoad.pts[tpRoad.pts.length - 2];
  const tl = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / tl, nz = (bx - ax) / tl;
  putJitter('mkt_clock_tower', (i) => {
    const off = tpRoad.w[tpRoad.w.length - 3] / 2 + 3.6 + i * 0.25;
    const side = i % 2 ? -1 : 1;
    const x = ax + nx * off * side, z = az + nz * off * side;
    return { x, z, ry: Math.atan2(-nx * side, -nz * side) };
  }, { ground: 'avg', gap: 0.6 }, 40);
}

// ---- 6. Депо у восточной стены: склады, котлы, паровая магистраль к рынку, тягач ----
const DEPOT_ROAD = ROADS.find(r => r.kind === 'exit' && Math.abs(r.pts[0][0] - DEPOT.x) < 0.5 && r.pts[0][1] > DEPOT.z);
const WAREHOUSES = [];
[[188.0, DEPOT.z + 20, -1], [188.0, DEPOT.z - 20, -1], [188.0, DEPOT.z - 36, -1], [161.0, DEPOT.z - 22, 1], [161.0, DEPOT.z + 16, 1]].forEach(([x0, z0, face]) => {
  const w = putJitter('mkt_warehouse', (i) => ({ x: x0 + rr(-1, 1) * (i > 10 ? 3 : 1), z: z0 + rr(-3, 3) * (1 + i * 0.1), ry: face * Math.PI / 2 + rr(-0.03, 0.03) }),
    { ground: 'max', sink: 0.05, margin: 1.5, gap: 1.0 }, 30);
  if (w) WAREHOUSES.push(w);
});
const DEPOT_BOILERS = [];
for (let k = 0; k < 2; k++) {
  const b = putJitter('mkt_steam_boiler', () => ({ x: 188 + rr(-1.5, 1.5), z: DEPOT.z + 7 - k * 14 + rr(-1.5, 1.5), ry: Math.PI / 2 + rr(-0.2, 0.2) }), { ground: 'avg', gap: 0.6 }, 40);
  if (b) DEPOT_BOILERS.push(b);
}
putJitter('mkt_steam_wagon', () => ({ x: 187 + rr(-2, 2), z: DEPOT.z + 34 + rr(-3, 3), ry: Math.PI / 2 + rr(-0.3, 0.3) }), { sink: 0.05, gap: 0.6, margin: 2 }, 40);
// паровая магистраль: вдоль восточной улицы от котлов депо к рынку
{
  const er = depotRoad;
  if (er) {
    for (let i = er.pts.length - 2; i >= 2; i -= 2) {
      const [ax, az] = er.pts[i], [bx, bz] = er.pts[i - 2];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const off = er.w[i] / 2 + 3.2;
      const mx = (ax + bx) / 2 + nx * off, mz = (az + bz) / 2 + nz * off;
      put('mkt_pipe_run', mx, mz, Math.atan2(-(bz - az), bx - ax), { roadPad: 0.1, tracks: false, gap: 0.1, scale: { x: L / 8, y: 1, z: 1 } });
    }
  }
}
// паропроводы над двумя улицами
ROADS.filter(r => r.kind === 'exit').slice(0, 2).forEach((road) => {
  const i = Math.floor(road.pts.length / 2);
  const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
  const tang = Math.atan2(bz - az, bx - ax);
  if (userRoad(ax, az, 0)) return;
  put('mkt_pipe_span', ax, az, Math.atan2(-Math.cos(tang), -Math.sin(tang)), { road: false, noOcc: true, force: true, ground: 'min', scale: { x: (road.w[i] + 3.0) / 8, y: 1, z: 1 } });
});
// паровые насосы над колодцами: на развилках
[{ x: AUTHOR_W.x + 16, z: AUTHOR_W.z + 9 }, { x: NORTH.x + 10, z: NORTH.z - 9 }, { x: DEPOT.x - 12, z: DEPOT.z + 26 }, { x: TP_GATE.x - 12, z: TP_GATE.z + 10 }].forEach((q) => {
  putJitter('mkt_steam_pump', (i) => ({ x: q.x + rr(-4, 4) * (1 + i * 0.1), z: q.z + rr(-4, 4) * (1 + i * 0.1), ry: rr(0, 6.28) }), { ground: 'avg', gap: 0.6 }, 40);
});

// ---- 2. Лавки: круг у фонтана фасадом к фонтану, торговая улица по кольцу фасадом к дороге ----
const SECTORS = [
  { inner: ['operator', 'mechanic'],     outer: ['repair_engineer', 'boiler_guardian'] },
  { inner: ['destroyer', 'gunner'],      outer: ['demolitionist', 'steam_berserker', 'pneumatic_sniper', 'artillery_engineer'] },
  { inner: ['food', 'supplies'],         outer: 'pavilion' },
  { inner: ['engineer', 'constructor'],  outer: ['pressure_sorcerer', 'machine_warlock', 'circuit_necro'] },
  { inner: ['technomancer', 'craftsman'], outer: ['overhaul_master', 'protocol_prophet', 'salvager', 'boiler_smith'] }
];
const exitSorted = EXITS.slice().map(a => ((a % 360) + 360) % 360).sort((a, b) => a - b);
const mids = exitSorted.map((a, i) => { const b = exitSorted[(i + 1) % exitSorted.length] + (i === exitSorted.length - 1 ? 360 : 0); return { a: (a + b) / 2, half: (b - a) / 2 }; });
mids.sort((p, q) => q.half - p.half);
const SECT = mids.slice(0, 5).sort((p, q) => p.a - q.a);
const ringIn = (aDeg) => ringR(deg(aDeg)) - ringW(deg(aDeg)) / 2;
const ringOut = (aDeg) => ringR(deg(aDeg)) + ringW(deg(aDeg)) / 2;
const STALLS = [];
function stallPut(piece, gen, opt, tries) {
  return putJitter(piece, gen, Object.assign({ sink: 0.02, gap: 0.45 }, opt || {}), tries || 60);
}
// шатёр — в самом широком секторе, первым
const bigSect = SECT.reduce((m, s) => (s.half > m.half ? s : m), SECT[0]);
const SECT_ORDER = [bigSect].concat(SECT.filter(s => s !== bigSect));
const sectorOf = new Map();
SECTORS.forEach((sec, i) => sectorOf.set(sec, sec.outer === 'pavilion' ? bigSect : null));
{
  const rest = SECT.filter(s => s !== bigSect).sort((p, q) => q.half - p.half);
  const need = SECTORS.filter(sec => sec.outer !== 'pavilion')
    .sort((p, q) => (q.inner.length * 10 + q.outer.length) - (p.inner.length * 10 + p.outer.length));
  need.forEach((sec, k) => sectorOf.set(sec, rest[k % rest.length]));
}
let pavilion = putJitter('mkt_pavilion', (i) => {
  const a = bigSect.a + rr(-4, 4) * (1 + i * 0.05);
  const p = polar(ringIn(a) - 5.4 + rr(-0.8, 0.4), a);
  return { x: p.x, z: p.z, ry: faceCenter(p) + Math.PI };
}, { ground: 'avg', gap: 0.5 }, 60);
if (!pavilion) console.log('[market] ! не встал шатёр');
SECTORS.forEach((sec) => {
  const s = sectorOf.get(sec);
  const span = s.half - 9;
  sec.inner.forEach((cls, k) => {
    const n = sec.inner.length;
    const a = s.a + (n === 1 ? rr(-5, 5) : (k === 0 ? -1 : 1) * Math.min(span, 11 + rr(-2, 2)));
    const piece = 'mkt_stall_' + cls;
    const st = stallPut(piece, (i) => {
      const kk = 1 + i * 0.05;
      const p = polar(15.5 + rr(-1.2, 1.2) * kk + (i > 30 ? rr(0, 3) : 0), a + rr(-3, 3) * kk);
      return { x: p.x, z: p.z, ry: faceCenter(p) + (n === 2 ? (k === 0 ? 0.18 : -0.18) : 0) + rr(-0.15, 0.15) };
    }) || stallPut(piece, () => {
      const p = polar(15.5 + rr(-2, 5), a + rr(-14, 14));
      return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.3, 0.3) };
    }, { roadPad: 0.6 }, 80);
    if (st) STALLS.push({ st, cls, row: 'inner' });
    else console.log('[market] ! не встала лавка ' + cls);
  });
});
const FILL = ['mkt_stall_food', 'mkt_table_produce', 'mkt_stall_supplies', 'mkt_table_wares', 'mkt_kettle_cart'];
let fillK = 0;
SECTORS.forEach((sec) => {
  const s = sectorOf.get(sec);
  const a0 = s.a - s.half + 8, a1 = s.a + s.half - 8;
  const slotDeg = (5.0 / 31) * 180 / Math.PI;
  const slots = [];
  for (let a = a0; a <= a1 + 0.01; a += slotDeg) slots.push(a + rr(-0.8, 0.8));
  const named = sec.outer === 'pavilion' ? [] : sec.outer.slice();
  const order = slots.map((a, i) => ({ a, d: Math.abs(i - (slots.length - 1) / 2) })).sort((p, q) => p.d - q.d);
  for (const sl of order) {
    const cls = named.shift();
    const piece = cls ? 'mkt_stall_' + cls : FILL[fillK++ % FILL.length];
    const hz = PIECES[piece].size[2] / 2;
    const r = putJitter(piece, (i) => {
      const a = sl.a + rr(-1.2, 1.2) * (1 + i * 0.1);
      const p = polar(ringIn(a) - hz - rr(1.6, 2.4) - (i > 20 ? rr(0, 2) : 0), a);
      const isCart = piece === 'mkt_kettle_cart';
      return { x: p.x, z: p.z, ry: faceCenter(p) + Math.PI + (isCart ? Math.PI / 2 : 0) + rr(-0.12, 0.12) };
    }, { sink: 0.02, gap: 0.35 }, 40);
    if (r && cls) STALLS.push({ st: r, cls, row: 'street' });
    else if (!r && cls) named.unshift(cls);
    if (!r && !cls) fillK--;
  }
  for (const cls of named) {
    const st = stallPut('mkt_stall_' + cls, () => { const p = polar(rr(21, 26), s.a + rr(-s.half + 8, s.half - 8)); return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.3, 0.3) }; }, { roadPad: 0.6 }, 80);
    if (st) STALLS.push({ st, cls, row: 'back' });
    else console.log('[market] ! не встала лавка ' + cls);
  }
});

// ---- 3. Задворки рядов: ящики, бочки, мешки, столы; котлы рынка ----
const CLUTTER = ['mkt_barrel', 'mkt_crate', 'mkt_sacks', 'mkt_crates_stack', 'mkt_barrel', 'mkt_crate', 'mkt_handcart'];
function clutterAround(obj, want, back) {
  const m = PIECES[obj.modelId];
  const hx = m.size[0] / 2 * obj.scale.x, hz = m.size[2] / 2 * obj.scale.z;
  let got = 0;
  for (let t = 0; t < 18 && got < want; t++) {
    const piece = pick(CLUTTER.slice(0, rnd() < 0.12 ? 7 : 6));
    const pm = PIECES[piece];
    const ih = Math.max(pm.size[0], pm.size[2]) / 2;
    let lx, lz;
    if (rnd() < back) { lx = rr(-hx, hx); lz = -(hz + ih + rr(0.1, 1.0)); }
    else { lx = (rnd() < 0.5 ? -1 : 1) * (hx + ih + rr(0.1, 0.6)); lz = rr(-hz, hz * 0.4); }
    const o = rotXZ(lx, lz, obj._ry);
    if (put(piece, obj.position.x + o.x, obj.position.z + o.z, obj._ry + rr(-0.9, 0.9), { sink: 0.03, gap: 0.15 })) got++;
  }
}
for (const { st, row } of STALLS) clutterAround(st, row === 'street' ? 3 : 2, 0.65);
SECT.forEach((s) => {
  putJitter(pick(['mkt_table_produce', 'mkt_table_wares']), () => { const p = polar(rr(19, 24), s.a + rr(-s.half + 7, s.half - 7)); return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.8, 0.8) }; }, { sink: 0.02, gap: 0.4 }, 30);
});
[bigSect.a + 16, SECT_ORDER[2].a - 10].forEach((a) => {
  putJitter('mkt_steam_boiler', (j) => { const p = polar(23 + rr(-1.5, 2), a + rr(-5, 5) * (1 + j * 0.1)); return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.3, 0.3) }; }, { ground: 'avg', gap: 0.5 }, 50);
});

// ---- 4. Вымпелы у фонтана, гирлянды, фонари вдоль проходов и улиц ----
const bannerPts = [];
for (let k = 0; k < 4; k++) {
  const a = A0 + 45 + k * 90 + rr(-6, 6);
  const p = polar(10.4 + rr(-0.4, 0.4), a);
  const b = put('mkt_banner', p.x, p.z, faceCenter(p), { roadPad: 0.1, tracks: false, gap: 0.2 });
  if (b) bannerPts.push({ p, b });
}
function bunting(pa, pb) {
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const span = Math.hypot(dx, dz);
  const ga = ground(pa.x, pa.z), gb = ground(pb.x, pb.z);
  put('mkt_bunting', (pa.x + pb.x) / 2, (pa.z + pb.z) / 2, Math.atan2(-dz, dx), { y: Math.min(ga, gb) + 0.03, road: false, noOcc: true, force: true, scale: { x: span / 8, y: 1, z: 1 } });
}
for (let i = 0; i < bannerPts.length; i++) bunting(bannerPts[i].p, bannerPts[(i + 1) % bannerPts.length].p);
TRACKS.forEach((tr, k) => {
  const i = 3 + (k % 2);
  const [ax, az] = tr.pts[i], [bx, bz] = tr.pts[i + 1];
  const tl = Math.hypot(bx - ax, bz - az) || 1;
  const nx = -(bz - az) / tl, nz = (bx - ax) / tl, side = k % 2 ? 1 : -1;
  const off = tr.w[i] / 2 + 0.9;
  put('mkt_lamp', ax + nx * off * side, az + nz * off * side, rr(0, 6.28), { roadPad: 0.2, gap: 0.25 });
});
for (let k = 0; k < 5; k++) {
  const p = polar(rr(7.2, 8.0), A0 + 36 + k * 72 + rr(-10, 10));
  put('mkt_bench', p.x, p.z, faceCenter(p) + rr(-0.2, 0.2), { road: false, gap: 0.3 });
}
/** Фонари вдоль улицы через ~16 м, поочерёдно по сторонам. */
function lampsAlong(road, every, startS) {
  let acc = 0, next = startS || 6, side = 1;
  for (let i = 0; i < road.pts.length - 1; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    while (next <= acc + L) {
      const t = (next - acc) / L;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      const off = road.w[i] / 2 + (road.kind === 'ring' ? 1.0 : 3.4);
      put('mkt_lamp', x + nx * off * side, z + nz * off * side, rr(0, 6.28), { roadPad: 0.2, gap: 0.25, tracks: false });
      side = -side;
      next += every;
    }
    acc += L;
  }
}
ROADS.forEach((r) => lampsAlong(r, r.kind === 'ring' ? 22 : 17, r.kind === 'ring' ? 4 : 10));

// ---- 4б. Дирижабль у причальной мачты у северной стены (до домов — место за ним) ----
{
  let best = null;
  for (let x = 20; x <= 120; x += 4) {
    for (let z = -10; z <= 40; z += 4) {
      if (!inPoly(ZONE, x, z) || wallDist(x, z) < 9 || onRoad(x, z, 5, false) || OTHER_ZONES.some(o => inPoly(o.poly, x, z))) continue;
      if (OCC.some(o => Math.hypot(o.x - x, o.z - z) < 5 + Math.hypot(o.hx, o.hz))) continue;
      const score = -wallDist(x, z);
      if (!best || score > best.score) best = { x, z, score };
    }
  }
  if (best) {
    const g = ground(best.x, best.z);
    putLibFbx('airship_mooring_mast', 'airship_mooring_mast.fbx', 'Причальная мачта дирижабля', 'transport', 0.2401, best.x, best.z, faceCenter(best), g - 0.1, { x: 3.0, y: 8, z: 3.0 });
    OCC.push({ x: best.x, z: best.z, ry: 0, hx: 3, hz: 3, id: 'mast' });
    const ship = putLibFbx('airship', 'airship.fbx', 'Дирижабль (Цеппелин)', 'transport', 0.1347, best.x + 6, best.z + 9, Math.atan2(-6, -9) + Math.PI / 2, g + 19);
    ROAD_OK.add(ship.id);
  } else console.log('[market] ! нет места для причальной мачты');
}

// ---- 5. Дома: по внешней стороне кольца и вдоль каждой улицы, фасадом к дороге ----
const HOUSE_TYPES = ['mkt_house_red', 'mkt_house_blue', 'mkt_house_green'];
const HOUSES = [];
let houseK = 0;
function houseAt(gen, tries) {
  const piece = HOUSE_TYPES[(houseK + Math.floor(rnd() * 2)) % 3];
  const h = putJitter(piece, (i) => gen(i, PIECES[piece]), { ground: 'max', sink: 0.05, margin: 2, gap: 1.2 }, tries || 30);
  if (h) { HOUSES.push(h); houseK++; }
  return h;
}
SECT.forEach((s) => {
  const n = Math.max(1, Math.floor((2 * (s.half - 8) * Math.PI / 180 * 46) / 13));
  for (let k = 0; k < n; k++) {
    const aBase = s.a + (n === 1 ? 0 : (k - (n - 1) / 2) * ((2 * (s.half - 10)) / Math.max(1, n - 1)));
    houseAt((i, pm) => {
      const a = aBase + rr(-2, 2) * (1 + i * 0.06);
      const p = polar(ringOut(a) + 2.2 + pm.size[2] / 2 + rr(0, 1.2) + (i > 18 ? rr(0, 6) : 0), a);
      return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.04, 0.04) };
    });
  }
});
function housesAlong(road, every, startS) {
  let acc = 0, next = startS || 10;
  for (let i = 0; i < road.pts.length - 1; i++) {
    const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az) || 1;
    while (next <= acc + L) {
      const t = (next - acc) / L;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (const side of [1, -1]) {
        houseAt((k, pm) => {
          const off = road.w[i] / 2 + 3.0 + pm.size[2] / 2 + rr(0, 1.0) + (k > 14 ? rr(0, 5) : 0);
          const along = rr(-2, 2);
          const px = x + nx * off * side + (bx - ax) / L * along, pz = z + nz * off * side + (bz - az) / L * along;
          return { x: px, z: pz, ry: Math.atan2(-nx * side, -nz * side) + rr(-0.03, 0.03) };
        }, 24);
      }
      next += every;
    }
    acc += L;
  }
}
ROADS.filter(r => r.kind !== 'ring' && r !== DEPOT_ROAD).forEach((r) => housesAlong(r, 14, 9));

for (const w of WAREHOUSES) clutterAround(w, 4, 0.0);

// ---- 7. Палисадники, дворы и сады у домов ----
const TREES = ['tree066', 'tree069', 'tree070', 'tree071', 'tree074'];
const BUSHES = ['retro_bush4_spring1', 'retro_bush8_summer', 'retro_bush3_spring3', 'bush04'];
const FLOWERS = ['matted_pratia_c', 'matted_pratia_g', 'field_poppy_f', 'matted_pratia_f', 'matted_pratia_d'];
for (const h of HOUSES) {
  const m = PIECES[h.modelId];
  const hx = m.size[0] / 2, hz = m.size[2] / 2;
  const ry = h._ry;
  const P = (lx, lz) => { const o = rotXZ(lx, lz, ry); return { x: h.position.x + o.x, z: h.position.z + o.z }; };
  // палисадник: цветы и кусты вдоль фасада (без забора — улица рядом)
  for (let t = 0; t < 6; t++) { const p = P(pick([-1, 1]) * rr(1.4, hx - 0.2), hz + rr(0.4, 1.4)); plant(pick(FLOWERS), p.x, p.z, { onRoad: false, pad: 0.4 }); }
  for (let t = 0; t < 2; t++) { const p = P(pick([-1, 1]) * rr(hx - 1.2, hx + 0.4), hz + rr(0.6, 1.4)); plant(pick(BUSHES), p.x, p.z, { k: rr(0.7, 0.9) }); }
  for (let t = 0; t < 3; t++) { const p = P(pick([-1, 1]) * (hx + rr(0.6, 1.8)), rr(-hz, hz)); plant(pick(BUSHES), p.x, p.z); }
  // двор за домом: забор буквой П, деревья, кусты, грядки цветов
  const yard = hz + rr(4.5, 6.5);
  const segs = [];
  for (let x = -hx + 1.5; x <= hx - 1.0; x += 3.0) segs.push([x, -yard, 0]);
  segs.push([-hx - 0.3, -hz - 1.8, Math.PI / 2], [hx + 0.3, -hz - 1.8, Math.PI / 2], [-hx - 0.3, -hz - 4.6, Math.PI / 2], [hx + 0.3, -hz - 4.6, Math.PI / 2]);
  for (const [lx, lz, rot] of segs) {
    const p = P(lx, lz);
    put('mkt_fence', p.x, p.z, ry + rot + rr(-0.05, 0.05), { sink: 0.0, gap: 0.05, margin: 1.2, roadPad: 0.6, tracks: false });
  }
  for (let t = 0; t < 2; t++) { const p = P(rr(-hx + 0.8, hx - 0.8), -hz - rr(2.0, yard - 1.0)); plant(pick(TREES), p.x, p.z); }
  for (let t = 0; t < 2; t++) { const p = P(rr(-hx, hx), -hz - rr(1.0, yard - 0.5)); plant(rnd() < 0.5 ? pick(BUSHES) : pick(FLOWERS), p.x, p.z); }
  const pb = P(hx - 0.6, hz + 0.9);
  put(pick(['mkt_barrel', 'mkt_crate', 'mkt_sacks']), pb.x, pb.z, rr(0, 6.28), { sink: 0.03, gap: 0.1, roadPad: 0.3, tracks: false });
}

// ---- 8. Сады и деревья на всём свободном месте до стен ----
{
  const bb = DISTRICT.reduce((b, p) => ({ x0: Math.min(b.x0, p[0]), x1: Math.max(b.x1, p[0]), z0: Math.min(b.z0, p[1]), z1: Math.max(b.z1, p[1]) }), { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 });
  for (let x = bb.x0; x <= bb.x1; x += 9) {
    for (let z = bb.z0; z <= bb.z1; z += 9) {
      const px = x + rr(-3, 3), pz = z + rr(-3, 3);
      if (Math.hypot(px - C.x, pz - C.z) < ringR(0) + 4) continue;          // внутри рынка — только редкие цветы
      const k = rnd();
      if (k < 0.4) plant(pick(TREES), px, pz);
      else if (k < 0.75) plant(pick(BUSHES), px, pz);
      else plant(pick(FLOWERS), px, pz);
    }
  }
  for (let t = 0; t < 30; t++) { const p = polar(rr(9.0, 13.5), rr(0, 360)); plant(pick(FLOWERS), p.x, p.z); }
  // парк: аллеи деревьев вдоль дорожек, кусты и цветы у края, деревья по газону
  PARK_PATHS.forEach((r) => {
    for (let i = 2; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const L = Math.hypot(bx - ax, bz - az) || 1, nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (const sd of [1, -1]) {
        const far = Math.hypot(ax - PARK_C.x, az - PARK_C.z) > PARK_R + 6;
        if (i % 3 === 1 && far) plant(pick(TREES), ax + nx * (r.w[i] / 2 + 4.8) * sd, az + nz * (r.w[i] / 2 + 4.8) * sd, { park: true, k: rr(0.8, 0.95) });
        plant(pick(BUSHES), ax + nx * (r.w[i] / 2 + 1.5) * sd + (bx - ax) / L * rr(-1, 1), az + nz * (r.w[i] / 2 + 1.5) * sd + (bz - az) / L * rr(-1, 1), { park: true, k: rr(0.6, 0.85) });
        plant(pick(FLOWERS), ax + nx * (r.w[i] / 2 + 0.8) * sd + (bx - ax) / L * rr(-1.5, 1.5), az + nz * (r.w[i] / 2 + 0.8) * sd + (bz - az) / L * rr(-1.5, 1.5), { park: true });
      }
    }
  });
  for (let t = 0; t < 70; t++) {
    const x = rr(-26, 38), z = rr(-121, -57);
    if (!inPoly(PARK, x, z)) continue;
    const dc = Math.hypot(x - PARK_C.x, z - PARK_C.z);
    const k = rnd();
    if (k < 0.22 && dc > PARK_R + 9 && distToPolyEdge(PARK, x, z) < 9) plant(pick(TREES), x, z, { park: true, k: rr(0.8, 1.0) });
    else if (k < 0.6 && dc > PARK_R + 3) plant(pick(BUSHES), x, z, { park: true });
    else plant(pick(FLOWERS), x, z, { park: true });
  }
  for (let t = 0; t < 40; t++) { const a = rr(0, 360), r = rr(PARK_R + 1.2, PARK_R + 3.5); plant(pick(FLOWERS), PARK_C.x + r * Math.cos(deg(a)), PARK_C.z + r * Math.sin(deg(a)), { park: true }); }
  for (let t = 0; t < 40; t++) {
    const a = rr(0, 360);
    const p = { x: MON.x + rr(10.5, 14) * Math.cos(deg(a)), z: MON.z + rr(10.5, 14) * Math.sin(deg(a)) };
    plant(rnd() < 0.5 ? pick(FLOWERS) : pick(BUSHES), p.x, p.z);
  }
}

// ============================================================
//  Отчёт
// ============================================================
const glb = props.filter(p => p.meshType === 'glb');
const kitTris = glb.reduce((s, p) => s + PIECES[p.modelId].tris[0], 0);
console.log('[market] центр ' + C.x.toFixed(2) + ',' + C.z.toFixed(2) + ', выходы ' + EXITS.map(a => (((a % 360) + 360) % 360).toFixed(0)).join(',') + '°');
console.log('[market] моделей рынка ' + glb.length + ' (+коллизий ' + props.filter(p => p.meshType === 'collision_box').length + ', растений ' + report.foliage +
  ', FBX библиотеки ' + props.filter(p => p.meshType === 'fbx' && !p.isFoliage).length + '), LOD0 треугольников рынка ' + kitTris + ', не встало попыток ' + report.skipped);
console.log('[market] ' + Object.entries(report.pieces).map(([k, v]) => k.replace('mkt_', '').replace('stall_', 'л.') + '×' + v).join(' '));
const stallKinds = new Set(glb.filter(p => /^mkt_stall_/.test(p.modelId)).map(p => p.modelId));
if (stallKinds.size !== 23) console.log('[market] ! разных лавок ' + stallKinds.size + ' из 23');

fs.writeFileSync(ROADS_PATH, JSON.stringify({ C, zone: ZONE, park: PARK, fountainPatch: FOUNTAIN_PATCH, squares: SQUARES, roads: ROADS, tracks: TRACKS,
  parkPaving: { c: [PARK_C.x, PARK_C.z], r: PARK_R, paths: PARK_PATHS.map(r => ({ pts: r.pts, w: r.w[0] })) } }));
console.log('[market] дороги → ' + path.relative(ROOT, ROADS_PATH) + ' (кисть: python scripts/market-square/paint_market.py)');

// старые пропсы прежнего рынка — сняты по согласованию с автором 2026-11-27 (только эти id)
const OLD_IDS = new Set([
  'prop_medieval_market_1787762507939', 'prop_market_stall_01_1787762618688', 'prop_market_stall_01_1787762641369',
  'prop_market_stall_02_1787762654674', 'prop_market_stall_03_1787762666401', 'prop_market_stall_04_1787762742744',
  'prop_house_02_1787764540141', 'prop_house_01_1787764549660', 'prop_house_04_1787764560661', 'prop_house_05_1787764577500',
  'prop_tent_03_1787764599107', 'prop_tent_03_1787764619373', 'prop_tent_02_1787764635521'
]);
const isOurs = (p) => p && typeof p.id === 'string' && /^mkt_/.test(p.id);
const OLD = (cur.customProps || []).filter(p => p && OLD_IDS.has(p.id));
const STRANGERS = (cur.customProps || []).filter(p => !isOurs(p) && !OLD_IDS.has(p.id) && p.position && p.meshType !== 'scene_ref' &&
  inPoly(ZONE, p.position.x, p.position.z));
if (STRANGERS.length) console.log('[market] в контуре есть объекты автора (не трогаю): ' + STRANGERS.map(p => p.modelId || p.id).join(', '));
if (OLD.length) console.log('[market] снимаются старые пропсы (' + OLD.length + '): ' + OLD.map(p => p.modelId).join(', '));

if (DUMP) {
  fs.writeFileSync(DUMP, JSON.stringify({ C, ZONE, roads: ROADS, tracks: TRACKS, others: OTHER_ZONES,
    props: props.filter(p => p.meshType !== 'collision_box').map(p => {
      const m = PIECES[p.modelId];
      return { id: p.id, m: p.modelId, x: p.position.x, z: p.position.z, ry: p.rotation.y, f: !!p.isFoliage,
        w: m ? m.size[0] * p.scale.x : 1.5, d: m ? m.size[2] * p.scale.z : 1.5 };
    }) }));
}
// ============================================================
//  Самопроверка: ни один объект не стоит на брусчатке — своей и автора — так, как её видит игра
//  (paint_market.py --check читает карту покраски по UV меша террейна, как шейдер)
// ============================================================
function selfCheck() {
  const items = [];
  for (const p of props) {
    if (p.meshType === 'collision_box' || ROAD_OK.has(p.id)) continue;
    const m = PIECES[p.modelId];
    let w, d;
    if (m) { w = m.size[0] * p.scale.x * 0.94; d = m.size[2] * p.scale.z * 0.94; }
    else if (p.isFoliage) w = d = /^tree/.test(p.modelId) ? 1.2 : (/bush/.test(p.modelId) ? FOL_R.bush * 1.4 : FOL_R.flower * 1.4);
    else w = d = 6;
    items.push({ id: p.id, m: p.modelId, x: p.position.x, z: p.position.z, ry: p.rotation.y, w, d });
  }
  // дорожки и круг парка — модель, а не покраска: их проверяем здесь, по геометрии
  const onPark = [];
  for (const it of items) {
    const hx = it.w / 2, hz = it.d / 2, c = Math.cos(it.ry), s = Math.sin(it.ry);
    const nx = Math.max(1, Math.ceil(2 * hx / 0.7)), nz = Math.max(1, Math.ceil(2 * hz / 0.7));
    let bad = false;
    for (let i = 0; i <= nx && !bad; i++) for (let j = 0; j <= nz && !bad; j++) {
      const lx = -hx + 2 * hx * i / nx, lz = -hz + 2 * hz * j / nz;
      const x = it.x + lx * c + lz * s, z = it.z - lx * s + lz * c;
      if (Math.hypot(x - PARK_C.x, z - PARK_C.z) < PARK_R - 0.3 && it.m !== 'mkt_park_fountain') bad = true;
      for (const r of PARK_PATHS) if (roadEdgeDist(r, x, z) < -0.15) bad = true;
    }
    if (bad) onPark.push(it.id + ' (' + it.m + ')');
  }
  if (onPark.length) {
    console.log('[check] ! на дорожках парка ' + onPark.length + ': ' + onPark.slice(0, 8).join(', '));
    return false;
  }
  const tmp = path.join(require('os').tmpdir(), 'market-check-' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify({ items }));
  const r = require('child_process').spawnSync('python', [path.join(__dirname, 'paint_market.py'), '--check', tmp], { encoding: 'utf8' });
  try { fs.unlinkSync(tmp); } catch (_) {}
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  return r.status === 0;
}
if (!DRY || ARG.includes('--check')) {
  const ok = selfCheck();
  if (!ok && !DRY && !ARG.includes('--force')) {
    console.log('[market] ! самопроверка не пройдена — сцена НЕ записана');
    process.exit(3);
  }
}
if (DRY) process.exit(0);

// ============================================================
//  Запись сцены (оба файла, бэкап, rev+1) и запекание мира
// ============================================================
const drop = new Set(OLD.map(p => p.id));
const kept = (cur.customProps || []).filter(p => !isOurs(p) && !drop.has(p.id));
const removedOurs = (cur.customProps || []).filter(isOurs).length;
const saved = writer.writeEditorOverridesFiles({ customProps: kept.concat(props) }, { baseRev: cur.rev | 0 });
console.log('[market] сцена: rev ' + saved.rev + ', пропсов ' + saved.customProps.length + ' (своих заменено ' + removedOurs +
  ', старых снято ' + drop.size + ', добавлено ' + props.length + ')');
const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const distWorld = path.join(ROOT, 'dist', 'client', 'data', 'world.json');
const r = Bake.bakeToDisk({ extra: fs.existsSync(path.dirname(distWorld)) ? [distWorld] : [] });
console.log('[market] мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ → ' + (r.written.join(', ') || 'без изменений'));
