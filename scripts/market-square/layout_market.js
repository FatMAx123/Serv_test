#!/usr/bin/env node
// ============================================================
//  SCRIPTS / MARKET-SQUARE / LAYOUT_MARKET.JS
//  Рыночная площадь деревни в зоне стройплощадки «Рыночная площадь» (buildSites сцены):
//  центр — метка площадки, всё — внутри её контура.
//
//  Живой рынок, а не чертёж:
//   • дороги — кривое кольцо брусчатки разной ширины и шесть выходов между домами
//     (один смотрит на деревню), к фонтану ведут протоптанные тропы; всё это рисует
//     кисть террейна (paint_market.py) по market-roads.json, который пишет этот скрипт;
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
//    node scripts/market-square/layout_market.js --dry [--dump plan.json]   отчёт + market-roads.json
//    python scripts/market-square/paint_market.py                           кисть террейна по дорогам
//    node scripts/market-square/layout_market.js                            запись сцены (rev+1) и запекание
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
const ZONE = SITE.poly.map(toWorld);
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
//  Дороги: кривое кольцо, выходы, площадка у фонтана, тропы (для кисти и для проверок)
// ============================================================
const VILLAGE = { x: -125, z: -140 };
const A0 = Math.round(Math.atan2(VILLAGE.z - C.z, VILLAGE.x - C.x) * 180 / Math.PI);
const EXITS = [0, 1, 2, 3, 4, 5].map(k => A0 + k * 60 + (k === 0 ? 0 : rr(-8, 8)));
const ph = Array.from({ length: 8 }, () => rr(0, Math.PI * 2));
const ringR = (a) => 37 + 1.7 * Math.sin(2 * a + ph[0]) + 1.0 * Math.sin(5 * a + ph[1]) + 0.5 * Math.sin(11 * a + ph[2]);
const ringW = (a) => 7.0 + 1.3 * Math.sin(3 * a + ph[3]) + 0.6 * Math.sin(7 * a + ph[4]);
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
EXITS.forEach((a0, k) => {
  const bend = rr(-7, 7), wig = rr(0, 6.28), w0 = rr(6.0, 7.5);
  const pts = [], w = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const r = 30 + 50 * t;
    const a = a0 + bend * Math.sin(Math.PI * t * 0.9) + 1.5 * Math.sin(t * 7 + wig);
    pts.push([C.x + r * Math.cos(deg(a)), C.z + r * Math.sin(deg(a))]);
    w.push(w0 + 1.2 * Math.sin(t * 5 + wig) - (t < 0.12 ? 0 : 0));
  }
  ROADS.push({ kind: 'exit', pts, w, a: a0 });
});
// протоптанные тропы от кольца к фонтану (тёмная земля; лавки на них не встают)
const TRACKS = EXITS.filter((_, k) => k !== 2 && k !== 5).map((a0) => {
  const off = rr(-9, 9), wig = rr(0, 6.28);
  const pts = [], w = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const r = 32 - 22 * t;
    const a = a0 + off * Math.sin(Math.PI * t) + 4 * Math.sin(t * 6 + wig);
    pts.push([C.x + r * Math.cos(deg(a)), C.z + r * Math.sin(deg(a))]);
    w.push(2.8 + 0.9 * Math.sin(t * 4 + wig));
  }
  return { kind: 'track', pts, w };
});
const FOUNTAIN_PATCH = 8.6;

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
function onRoad(x, z, pad, withTracks) {
  if (Math.hypot(x - C.x, z - C.z) < FOUNTAIN_PATCH + pad) return true;
  for (const r of ROADS) if (roadEdgeDist(r, x, z) < pad) return true;
  if (withTracks) for (const r of TRACKS) if (roadEdgeDist(r, x, z) < pad) return true;
  return false;
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
  const cs = corners(f.x, f.z, f.hx, f.hz, ry).concat([{ x, z }]);
  for (const p of cs) {
    if (!inPoly(ZONE, p.x, p.z) || distToPolyEdge(ZONE, p.x, p.z) < (opt.margin != null ? opt.margin : 3)) return 'вне зоны';
    for (const oz of OTHER_ZONES) if (inPoly(oz.poly, p.x, p.z)) return 'в зоне «' + oz.name + '»';
    if (opt.road !== false && onRoad(p.x, p.z, opt.roadPad != null ? opt.roadPad : 0.4, opt.tracks !== false)) return 'на дороге';
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
  if (!inPoly(ZONE, x, z) || distToPolyEdge(ZONE, x, z) < 1.5) return null;
  for (const oz of OTHER_ZONES) if (inPoly(oz.poly, x, z)) return null;
  if (!opt.onRoad && onRoad(x, z, cls === 'flower' ? 0.3 : 0.8, cls !== 'flower')) return null;
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

// ---- 1. Фонтан ----
put('mkt_fountain', C.x, C.z, Math.atan2(Math.cos(deg(A0)), Math.sin(deg(A0))) + rr(-0.1, 0.1), { ground: 'avg', force: true });

// ---- 2. Лавки по секторам линий классов, каждая «поставлена руками» ----
const SECTORS = [
  { inner: ['operator', 'mechanic'],     outer: ['repair_engineer', 'boiler_guardian'] },
  { inner: ['destroyer', 'gunner'],      outer: ['demolitionist', 'steam_berserker', 'pneumatic_sniper', 'artillery_engineer'] },
  { inner: ['food', 'supplies'],         outer: 'pavilion' },
  { inner: ['engineer', 'constructor'],  outer: ['pressure_sorcerer', 'machine_warlock', 'circuit_necro'] },
  { inner: ['technomancer'],             outer: ['overhaul_master', 'protocol_prophet'] },
  { inner: ['craftsman'],                outer: ['salvager', 'boiler_smith'] }
];
// середины секторов — между соседними выходами; силовая линия — напротив деревни
const exitSorted = EXITS.slice().map(a => ((a % 360) + 360) % 360).sort((a, b) => a - b);
const mids = exitSorted.map((a, i) => { const b = exitSorted[(i + 1) % 6] + (i === 5 ? 360 : 0); return { a: (a + b) / 2, half: (b - a) / 2 }; });
const opp = ((A0 + 180) % 360 + 360) % 360;
mids.sort((p, q) => { const d = (v) => Math.abs(((v.a - opp + 540) % 360) - 180); return d(p) - d(q); });
// по кругу от сектора напротив деревни
const start = mids[0].a;
const SECT = mids.slice().sort((p, q) => (((p.a - start) % 360 + 360) % 360) - (((q.a - start) % 360 + 360) % 360));
const STALLS = [];
function stallAt(cls, rBase, aBase, faceJ) {
  const piece = 'mkt_stall_' + cls;
  return putJitter(piece, (i) => {
    const k = 1 + i * 0.06;
    const r = rBase + rr(-1.8, 1.8) * k + (i > 25 ? rr(0, 3.5) : 0);
    const a = aBase + rr(-4, 4) * k;
    const p = polar(r, a);
    return { x: p.x, z: p.z, ry: faceCenter(p) + (faceJ || 0) + rr(-0.42, 0.42) };
  }, { sink: 0.02, gap: 0.5 }, 60) || putJitter(piece, () => {
    // запасной вариант: шире по углу и радиусу, тропу можно задеть краем
    const p = polar(rBase + rr(-2, 5), aBase + rr(-14, 14));
    return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.5, 0.5) };
  }, { sink: 0.02, gap: 0.4, tracks: false }, 80);
}
let pavilion = null;
// шатёр первым: ему нужно больше всего места
SECTORS.forEach((sec, si) => {
  if (sec.outer !== 'pavilion') return;
  const s = SECT[si];
  pavilion = putJitter('mkt_pavilion', (i) => {
    const p = polar(rr(25, 28.5), s.a + rr(-5, 5) * (1 + i * 0.05));
    return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.15, 0.15) };
  }, { ground: 'avg', gap: 0.6 }, 60);
  if (!pavilion) console.log('[market] ! не встал шатёр');
});
SECTORS.forEach((sec, si) => {
  const s = SECT[si];
  const span = s.half - 9;          // угол от середины, куда ещё можно ставить
  // внутренний ряд
  sec.inner.forEach((cls, k) => {
    const n = sec.inner.length;
    const a = s.a + (n === 1 ? rr(-6, 6) : (k === 0 ? -1 : 1) * Math.min(span, 11 + rr(-2, 3)));
    const st = stallAt(cls, 15.5, a, n === 2 ? (k === 0 ? 0.25 : -0.25) : 0);
    if (st) STALLS.push({ st, cls });
    else console.log('[market] ! не встала лавка ' + cls);
  });
  if (sec.outer !== 'pavilion') {
    const n = sec.outer.length;
    sec.outer.forEach((cls, k) => {
      const a = s.a + (k - (n - 1) / 2) * Math.min(12.5, (2 * span) / Math.max(1, n - 1) * 0.9) + rr(-2, 2);
      const st = stallAt(cls, 27.5, a, 0);
      if (st) STALLS.push({ st, cls });
      else console.log('[market] ! не встала лавка ' + cls);
    });
  }
});

// ---- 3. Стимпанк: котлы, тягач, паропроводы над выходами, тележки с котлом ----
const BOILERS = [];
[[SECT[2].a + rr(16, 22), 30], [SECT[5].a + rr(-14, -8), 31], [SECT[3].a + rr(12, 18), 31.5]].forEach(([a, r], i) => {
  const b = putJitter('mkt_steam_boiler', (j) => { const p = polar(r + rr(-1.5, 1.5), a + rr(-4, 4) * (1 + j * 0.1)); return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.3, 0.3) }; }, { ground: 'avg', gap: 0.6 }, 40);
  if (b) BOILERS.push(b);
});
// паровой тягач у выхода, за кольцом, вдоль дороги
{
  const ex = EXITS[2];
  putJitter('mkt_steam_wagon', () => {
    const r = rr(45, 49), side = rnd() < 0.5 ? -1 : 1;
    const a = ex + side * rr(9, 12);
    const p = polar(r, a);
    return { x: p.x, z: p.z, ry: Math.atan2(Math.cos(deg(ex)), Math.sin(deg(ex))) + Math.PI / 2 + rr(-0.25, 0.25) };
  }, { sink: 0.05, gap: 0.6, margin: 2 }, 40);
}
// паропроводы поперёк трёх выходов (под ними ходят)
[0, 2, 4].forEach((k) => {
  const ex = EXITS[(k + 1) % 6];
  const road = ROADS.find(r => r.kind === 'exit' && r.a === ex);
  const i = 5 + Math.floor(rnd() * 2);
  const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
  const tang = Math.atan2(bz - az, bx - ax);
  const span = road.w[i] + 3.0;
  // локальный +X пролёта (Ry: +X → (cos φ, −sin φ)) — поперёк дороги
  const ry = Math.atan2(-Math.cos(tang), -Math.sin(tang));
  put('mkt_pipe_span', ax, az, ry, { road: false, noOcc: true, force: true, ground: 'min', scale: { x: span / 8, y: 1, z: 1 } });
});
// тележки с котлом и ручные тележки
[[SECT[2].a - 10, 21.5], [SECT[4].a + 8, 20.5]].forEach(([a, r]) => {
  putJitter('mkt_kettle_cart', () => { const p = polar(r + rr(-1.5, 1.5), a + rr(-5, 5)); return { x: p.x, z: p.z, ry: rr(0, 6.28) }; }, { sink: 0.03, gap: 0.4 }, 30);
});

// ---- 4. Столы с товаром и кучи добра между лавками ----
SECT.forEach((s) => {
  for (let k = 0; k < 2; k++) {
    putJitter(k === 0 ? 'mkt_table_produce' : 'mkt_table_wares', () => {
      const p = polar(rr(19, 23.5), s.a + rr(-s.half + 8, s.half - 8));
      return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.7, 0.7) };
    }, { sink: 0.02, gap: 0.5 }, 30);
  }
});
const CLUTTER = ['mkt_barrel', 'mkt_crate', 'mkt_sacks', 'mkt_crates_stack', 'mkt_barrel', 'mkt_crate', 'mkt_handcart'];
for (const { st } of STALLS) {
  const m = PIECES[st.modelId];
  const hx = m.size[0] / 2, hz = m.size[2] / 2;
  const want = 2 + Math.floor(rnd() * 3);
  let got = 0;
  for (let t = 0; t < 14 && got < want; t++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const piece = pick(CLUTTER.slice(0, rnd() < 0.15 ? 7 : 6));
    const pm = PIECES[piece];
    const ih = Math.max(pm.size[0], pm.size[2]) / 2;
    const spot = rnd();
    let lx, lz;
    if (spot < 0.55) { lx = side * (hx + ih + rr(0.2, 0.8)); lz = rr(-hz, hz * 0.6); }
    else { lx = rr(-hx, hx); lz = -(hz + ih + rr(0.2, 0.9)); }
    const o = rotXZ(lx, lz, st._ry);
    if (put(piece, st.position.x + o.x, st.position.z + o.z, st._ry + rr(-0.8, 0.8), { sink: 0.03, gap: 0.2 })) got++;
  }
}

// ---- 5. Фонари, вымпелы вокруг фонтана, гирлянды ----
const BANNER_R = 10.2;
const bannerPts = [];
for (let k = 0; k < 8; k++) {
  const a = A0 + 22.5 + k * 45 + rr(-5, 5);
  const p = polar(BANNER_R + rr(-0.6, 0.6), a);
  const b = put('mkt_banner', p.x, p.z, faceCenter(p) + rr(-0.3, 0.3), { road: false, gap: 0.2 });
  if (b) bannerPts.push({ p, b });
}
// гирлянды по кругу между соседними вымпелами (растянуты по пролёту)
const BUNT_Z = 4.28;
function bunting(pa, pb, extraSag) {
  const dx = pb.x - pa.x, dz = pb.z - pa.z;
  const span = Math.hypot(dx, dz);
  const mid = { x: (pa.x + pb.x) / 2, z: (pa.z + pb.z) / 2 };
  const ga = ground(pa.x, pa.z), gb = ground(pb.x, pb.z);
  const ry = Math.atan2(-dz, dx);      // локальный +X — вдоль пролёта
  put('mkt_bunting', mid.x, mid.z, ry, { y: Math.min(ga, gb) + 0.03 - (extraSag || 0), road: false, noOcc: true, force: true, scale: { x: span / 8, y: 1, z: 1 } });
}
for (let i = 0; i < bannerPts.length; i++) bunting(bannerPts[i].p, bannerPts[(i + 1) % bannerPts.length].p);
// фонари: у фонтана между вымпелами, у кольца, вдоль выходов
for (let k = 0; k < 6; k++) {
  const a = A0 + k * 60 + rr(-12, 12);
  const p = polar(12.6 + rr(-0.8, 0.8), a + 30);
  put('mkt_lamp', p.x, p.z, faceCenter(p) + rr(-0.5, 0.5), { road: false, gap: 0.3 });
}
SECT.forEach((s) => {
  putJitter('mkt_lamp', () => { const p = polar(rr(31.5, 33), s.a + rr(-s.half + 6, s.half - 6)); return { x: p.x, z: p.z, ry: rr(0, 6.28) }; }, { gap: 0.3, roadPad: 0.2, tracks: false }, 30);
});
ROADS.filter(r => r.kind === 'exit').forEach((road, k) => {
  const i = 4 + (k % 2);
  const [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
  const tx = bx - ax, tz = bz - az, tl = Math.hypot(tx, tz);
  const nx = -tz / tl, nz = tx / tl, side = k % 2 ? 1 : -1;
  const off = road.w[i] / 2 + 1.2;
  // фонарь и пара вымпелов с гирляндой поперёк выхода
  put('mkt_lamp', ax + nx * off * side, az + nz * off * side, rr(0, 6.28), { road: false, gap: 0.3, margin: 1.5 });
  const j = Math.min(road.pts.length - 2, i + 2);
  const [cx2, cz2] = road.pts[j];
  const offB = road.w[j] / 2 + 0.9;
  const pa = { x: cx2 + nx * offB, z: cz2 + nz * offB }, pb = { x: cx2 - nx * offB, z: cz2 - nz * offB };
  const ba = put('mkt_banner', pa.x, pa.z, Math.atan2(nx, nz), { road: false, gap: 0.2, margin: 1.5 });
  const bb = put('mkt_banner', pb.x, pb.z, Math.atan2(-nx, -nz), { road: false, gap: 0.2, margin: 1.5 });
  if (ba && bb) bunting(pa, pb, 0.0);
});
// скамьи у фонтана — вразнобой
for (let k = 0; k < 5; k++) {
  const a = A0 + 36 + k * 72 + rr(-14, 14);
  const p = polar(rr(7.2, 8.2), a);
  put('mkt_bench', p.x, p.z, faceCenter(p) + rr(-0.35, 0.35), { road: false, gap: 0.3 });
}

// ---- 6. Дома по краю: дворы, заборы, деревья, кусты, цветы ----
const HOUSE_TYPES = ['mkt_house_red', 'mkt_house_blue', 'mkt_house_green'];
const HOUSES = [];
SECT.forEach((s, si) => {
  [-1, 1].forEach((side, k) => {
    const piece = HOUSE_TYPES[(si * 2 + k + Math.floor(rnd() * 2)) % 3];
    const h = putJitter(piece, (i) => {
      const p = polar(rr(48, 54) + i * 0.15, s.a + side * rr(9, Math.max(10, s.half - 11)));
      return { x: p.x, z: p.z, ry: faceCenter(p) + rr(-0.32, 0.32) };
    }, { ground: 'max', sink: 0.05, margin: 2, gap: 1.0 }, 40);
    if (h) HOUSES.push(h);
  });
});
for (const h of HOUSES) {
  const m = PIECES[h.modelId];
  const hx = m.size[0] / 2, hz = m.size[2] / 2;
  const ry = h._ry;
  const P = (lx, lz) => { const o = rotXZ(lx, lz, ry); return { x: h.position.x + o.x, z: h.position.z + o.z }; };
  // двор за домом: забор буквой П
  const yard = hz + rr(3.5, 5.5);
  const segs = [];
  for (let x = -hx + 1.5; x <= hx - 1.0; x += 3.0) segs.push([x, -yard, 0]);
  segs.push([-hx - 0.2, -hz - 1.6, Math.PI / 2], [hx + 0.2, -hz - 1.6, Math.PI / 2]);
  for (const [lx, lz, rot] of segs) {
    if (rnd() < 0.15) continue;                     // дыры в заборе
    const p = P(lx, lz);
    put('mkt_fence', p.x, p.z, ry + rot + rr(-0.08, 0.08), { sink: 0.0, gap: 0.05, margin: 1.2, road: true, roadPad: 0.2, tracks: false });
  }
  // деревья во дворе и кусты у стен
  for (let t = 0; t < 2; t++) { const p = P(rr(-hx + 1, hx - 1), -hz - rr(1.8, yard - 1.2)); plant(pick(['tree066', 'tree069', 'tree070', 'tree071', 'tree074']), p.x, p.z); }
  for (let t = 0; t < 3; t++) { const p = P(pick([-1, 1]) * (hx + rr(0.6, 1.6)), rr(-hz, hz)); plant(pick(['retro_bush4_spring1', 'retro_bush8_summer', 'retro_bush3_spring3', 'bush04']), p.x, p.z); }
  // цветы у фасада и бочка с ящиком у крыльца
  for (let t = 0; t < 2; t++) { const p = P(rr(-hx + 0.5, hx - 0.5), hz + rr(0.4, 1.0)); plant(pick(['matted_pratia_c', 'matted_pratia_g', 'field_poppy_f', 'matted_pratia_f']), p.x, p.z, { onRoad: true }); }
  const pb = P(hx - 0.6, hz + 0.9);
  put(pick(['mkt_barrel', 'mkt_crate', 'mkt_sacks']), pb.x, pb.z, rr(0, 6.28), { sink: 0.03, gap: 0.1, road: false });
}

// ---- 7. Зелень по краю площади и редкие пятна внутри ----
for (let t = 0; t < 70; t++) {
  const a = rr(0, 360), r = rr(42, 66);
  const p = polar(r, a);
  const k = rnd();
  plant(k < 0.25 ? pick(['tree066', 'tree069', 'tree070', 'tree071', 'tree074']) : k < 0.7 ? pick(['retro_bush4_spring1', 'retro_bush8_summer', 'retro_bush3_spring3', 'bush04']) : pick(['matted_pratia_c', 'matted_pratia_d', 'matted_pratia_g', 'field_poppy_f']), p.x, p.z);
}
for (let t = 0; t < 22; t++) {
  const p = polar(rr(9.5, 33), rr(0, 360));
  plant(rnd() < 0.35 ? pick(['retro_bush4_spring1', 'retro_bush3_spring3']) : pick(['matted_pratia_c', 'matted_pratia_g', 'field_poppy_f']), p.x, p.z);
}

// ---- 8. Дирижабль у причальной мачты на краю зоны ----
{
  let best = null;
  for (let a = 0; a < 360; a += 5) {
    const p = polar(64, a);
    if (!inPoly(ZONE, p.x, p.z)) continue;
    const de = distToPolyEdge(ZONE, p.x, p.z);
    if (de < 6 || onRoad(p.x, p.z, 4, false) || OTHER_ZONES.some(o => inPoly(o.poly, p.x, p.z))) continue;
    if (OCC.some(o => Math.hypot(o.x - p.x, o.z - p.z) < 6 + Math.hypot(o.hx, o.hz))) continue;
    if (!best || de > best.de) best = { a, p, de };
  }
  if (best) {
    const g = ground(best.p.x, best.p.z);
    putLibFbx('airship_mooring_mast', 'airship_mooring_mast.fbx', 'Причальная мачта дирижабля', 'transport', 0.2401, best.p.x, best.p.z, faceCenter(best.p), g - 0.1, { x: 3.0, y: 8, z: 3.0 });
    OCC.push({ x: best.p.x, z: best.p.z, ry: 0, hx: 3, hz: 3, id: 'mast' });
    const q = polar(64 + 12, best.a + 3);
    putLibFbx('airship', 'airship.fbx', 'Дирижабль (Цеппелин)', 'transport', 0.1347, q.x, q.z, faceCenter(q) + Math.PI / 2, g + 19);
  } else console.log('[market] ! нет места для причальной мачты');
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
const stallsPlaced = glb.filter(p => /^mkt_stall_/.test(p.modelId)).length;
if (stallsPlaced !== 23) console.log('[market] ! лавок поставлено ' + stallsPlaced + ' из 23');

fs.writeFileSync(ROADS_PATH, JSON.stringify({ C, zone: ZONE, fountainPatch: FOUNTAIN_PATCH, roads: ROADS, tracks: TRACKS }));
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
