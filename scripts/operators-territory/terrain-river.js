#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / TERRAIN-RIVER.JS
//  Озеро водовода и Ржавая река: рельеф правится ТОЛЬКО под озеро,
//  река наполняет уже существующее русло оврага почти до бровок — до самого моря.
//
//  Что делает (всегда от исходного меша terrain-base.bin — повторный запуск идемпотентен):
//   1. Озеро к юго-западу от базы операторов (по карте острова): чаша глубиной LAKE_DEPTH,
//      берег на BANK_UP выше воды; где исходный берег ниже воды — плавный береговой вал.
//      Сетка вокруг озера сгущается делением длинных рёбер (обе смежные грани — без
//      T-стыков), UV интерполируются — запечённая текстура рельефа не съезжает.
//   2. Река: ось — тальвег существующего русла (river-path-relief.json) и найденное ложе
//      до морского канала. Уровень «по бровкам»: на BANK_UP ниже нижнего из двух гребней
//      берега, монотонно к морю; разлив не шире RIVER_HALF_MAX.
//   3. bakedHeights 256² — только изменённые клетки, сдвигом на разницу высот.
//   4. Пишет client/data/mesh/terrain.bin + client/js/terrain-data.js (одни данные),
//      client/js/river-data.js (вода в клиенте), shared/river-data.json (глубина для
//      проходимости на сервере), river-path.json (layout.js, покраска берегов).
//
//  Запуск: node scripts/operators-territory/terrain-river.js [--dry]
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DRY = process.argv.includes('--dry');
const MB = require(path.join(ROOT, 'client', 'js', 'mesh-bin.js'));
const BIN = path.join(ROOT, 'client', 'data', 'mesh', 'terrain.bin');
const BASE_BIN = path.join(__dirname, 'terrain-base.bin');
const OLD_PATH = path.join(__dirname, 'river-path-relief.json');
const SEA = -35;

if (!fs.existsSync(BASE_BIN)) fs.copyFileSync(BIN, BASE_BIN);
const base = MB.loadFileSync(fs, BASE_BIN);
globalThis.TerrainData = base;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
function gy(x, z) { const y = TH.groundY(x, z, 600, 1200); return (y == null || !isFinite(y)) ? SEA - 40 : y; }

const LAKE_L = 54.0;          // уровень озера
const BANK_UP = 0.50;         // бровка выше воды — «почти от верхнего края до верхнего»
const LAKE_DEPTH = 3.40;
const LAKE_TRANS = 24;        // откос берега озера к исходному рельефу
const RIVER_HALF_MAX = 24;    // разлив реки не шире 48 м
const OVER = 2.4;             // край водной ленты заходит под берег

// Озеро: ось и полуширины по карте острова
const LAKE_AXIS = [[60, 322], [92, 340], [128, 360], [168, 385], [204, 405], [228, 421]];
const LAKE_HALF = [18, 30, 38, 34, 24, 12];
// Русло: тальвег исходного рельефа и ложе к морскому каналу (вода моря уже есть с x ≈ 800)
if (!fs.existsSync(OLD_PATH)) fs.copyFileSync(path.join(__dirname, 'river-path.json'), OLD_PATH);
const relief = JSON.parse(fs.readFileSync(OLD_PATH, 'utf8')).pts;
const reliefTail = relief.filter(p => p.d >= 200 && p.d <= 730).map(p => [p.x, p.z]);
const SEA_TAIL = [[660, 762], [700, 776], [735, 788], [770, 792], [808, 796], [842, 800]];

function resample(pts, step) {
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    let s = step - carry;
    while (s <= L) { const t = s / L; out.push([ax + (bx - ax) * t, az + (bz - az) * t]); s += step; }
    carry = L - (s - step);
  }
  const last = pts[pts.length - 1], pl = out[out.length - 1];
  if (Math.hypot(last[0] - pl[0], last[1] - pl[1]) > step * 0.4) out.push(last);
  return out;
}
function chaikin(pts, it) {
  let p = pts;
  for (let k = 0; k < it; k++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const [ax, az] = p[i], [bx, bz] = p[i + 1];
      q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}
function hash1(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }
function noise1(t) { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; }
function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
function withFrames(pts) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
    pts[i].tx = tx / L; pts[i].tz = tz / L; pts[i].nx = tz / L; pts[i].nz = -tx / L;
    pts[i].d = i ? pts[i - 1].d + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z) : 0;
  }
  return pts;
}

// ------------------------------------------------------------
//  1. Озеро: ось, полуширины с шумом берега, ближайшая точка оси
// ------------------------------------------------------------
const lakeLine = resample(chaikin(LAKE_AXIS, 3), 4);
const lakeCum = [0];
for (let i = 1; i < LAKE_AXIS.length; i++) lakeCum.push(lakeCum[i - 1] + Math.hypot(LAKE_AXIS[i][0] - LAKE_AXIS[i - 1][0], LAKE_AXIS[i][1] - LAKE_AXIS[i - 1][1]));
function lakeHalfAtFrac(f) {
  const s = f * lakeCum[lakeCum.length - 1];
  for (let i = 1; i < lakeCum.length; i++) {
    if (s <= lakeCum[i]) { const t = (s - lakeCum[i - 1]) / (lakeCum[i] - lakeCum[i - 1]); return LAKE_HALF[i - 1] * (1 - t) + LAKE_HALF[i] * t; }
  }
  return LAKE_HALF[LAKE_HALF.length - 1];
}
const LX = withFrames(lakeLine.map((p, i) => {
  const f = i / (lakeLine.length - 1), h = lakeHalfAtFrac(f);
  return { x: p[0], z: p[1], s: LAKE_L, hl: h * (0.9 + 0.22 * noise1(f * 9 + 1.3)), hr: h * (0.9 + 0.22 * noise1(f * 9 + 7.7)), kind: 'lake' };
}));
const LAKE_LEN = LX[LX.length - 1].d;

const CELL = 24;
const lakeGrid = new Map();
for (let i = 0; i < LX.length - 1; i++) {
  const a = LX[i], b = LX[i + 1];
  const reach = Math.max(a.hl, a.hr, b.hl, b.hr) + LAKE_TRANS + 30;
  for (let cx = Math.floor((Math.min(a.x, b.x) - reach) / CELL); cx <= Math.floor((Math.max(a.x, b.x) + reach) / CELL); cx++) {
    for (let cz = Math.floor((Math.min(a.z, b.z) - reach) / CELL); cz <= Math.floor((Math.max(a.z, b.z) + reach) / CELL); cz++) {
      const key = cx * 100003 + cz;
      if (!lakeGrid.has(key)) lakeGrid.set(key, []);
      lakeGrid.get(key).push(i);
    }
  }
}
function lakeNear(x, z) {
  const list = lakeGrid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!list) return null;
  let best = null;
  for (const i of list) {
    const a = LX[i], b = LX[i + 1];
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const tRaw = ((x - a.x) * dx + (z - a.z) * dz) / L2;
    const t = Math.max(0, Math.min(1, tRaw));
    const px = a.x + dx * t, pz = a.z + dz * t;
    const dist = Math.hypot(x - px, z - pz);
    if (!best || dist < best.dist) {
      const nx = a.nx * (1 - t) + b.nx * t, nz = a.nz * (1 - t) + b.nz * t;
      best = { dist, lat: (x - px) * nx + (z - pz) * nz, hl: a.hl * (1 - t) + b.hl * t, hr: a.hr * (1 - t) + b.hr * t,
        along: a.d + Math.hypot(px - a.x, pz - a.z), beyondEnd: i === LX.length - 2 && tRaw > 1 };
    }
  }
  return best;
}

/** Новая высота рельефа под озером (или null — вне влияния). Русло реки не трогаем. */
function carvedHeight(x, z, orig) {
  const n = lakeNear(x, z);
  if (!n) return null;
  const half = n.lat >= 0 ? n.hr : n.hl;
  const ad = n.beyondEnd ? n.dist : Math.abs(n.lat);
  if (ad > half + LAKE_TRANS) return null;
  const bank = LAKE_L + BANK_UP;
  // сток: последние 30 м оси — без берегового вала, чтобы вода уходила в существующее русло
  const outlet = n.beyondEnd ? 1 : smooth(LAKE_LEN - 30, LAKE_LEN, n.along);
  if (ad <= half && !n.beyondEnd) {
    const bed = LAKE_L - LAKE_DEPTH;
    return bed + (bank - bed) * smooth(half * 0.5, half, ad);
  }
  const f = smooth(0, 1, (ad - half) / LAKE_TRANS);
  let h = bank * (1 - f) + orig * f;
  if (orig > bank) h = Math.max(h, bank + (orig - bank) * smooth(0, 1, (ad - half) / (LAKE_TRANS * 0.6)));
  // у стока вал не насыпаем: исходный рельеф (ниже воды) остаётся руслом
  if (outlet > 0) h = h * (1 - outlet) + Math.min(h, orig) * outlet;
  return h;
}

// ------------------------------------------------------------
//  2. Сгущение сетки вокруг озера
// ------------------------------------------------------------
const pos = Array.from(base.positions);
const uvs = Array.from(base.uvs);
let tris = [];
for (let i = 0; i < base.indices.length; i += 3) tris.push([base.indices[i], base.indices[i + 1], base.indices[i + 2]]);
const nV0 = pos.length / 3, nT0 = tris.length;

function targetEdge(x, z) {
  const n = lakeNear(x, z);
  if (!n) return Infinity;
  const half = n.lat >= 0 ? n.hr : n.hl;
  const ad = n.beyondEnd ? n.dist : Math.abs(n.lat);
  if (ad <= half + 4) return 5.0;
  if (ad <= half + LAKE_TRANS + 4) return 7.5;
  return Infinity;
}
function edgeKey(a, b) { return a < b ? a * 4194304 + b : b * 4194304 + a; }
for (let pass = 0; pass < 14; pass++) {
  const edges = new Map();
  for (let t = 0; t < tris.length; t++) {
    const tr = tris[t];
    for (let k = 0; k < 3; k++) {
      const a = tr[k], b = tr[(k + 1) % 3], key = edgeKey(a, b);
      let e = edges.get(key);
      if (!e) { e = { a, b, tris: [] }; edges.set(key, e); }
      e.tris.push(t);
    }
  }
  const cand = [];
  for (const e of edges.values()) {
    const ax = pos[e.a * 3], az = pos[e.a * 3 + 2], bx = pos[e.b * 3], bz = pos[e.b * 3 + 2];
    const L = Math.hypot(bx - ax, bz - az);
    if (L > targetEdge((ax + bx) / 2, (az + bz) / 2)) cand.push({ e, L });
  }
  if (!cand.length) break;
  cand.sort((p, q) => q.L - p.L);
  const touched = new Uint8Array(tris.length + 8);
  const newTris = [];
  let splits = 0;
  for (const { e } of cand) {
    if (e.tris.some(t => touched[t])) continue;
    // делим только самое длинное ребро каждой смежной грани (бисекция Ривары — без иголок)
    let ok = true;
    for (const t of e.tris) {
      const tr = tris[t];
      let longest = 0, lk = null;
      for (let k = 0; k < 3; k++) {
        const a = tr[k], b = tr[(k + 1) % 3];
        const L = Math.hypot(pos[b * 3] - pos[a * 3], pos[b * 3 + 2] - pos[a * 3 + 2]);
        if (L > longest) { longest = L; lk = edgeKey(a, b); }
      }
      if (lk !== edgeKey(e.a, e.b)) { ok = false; break; }
    }
    if (!ok) continue;
    const m = pos.length / 3;
    pos.push((pos[e.a * 3] + pos[e.b * 3]) / 2, (pos[e.a * 3 + 1] + pos[e.b * 3 + 1]) / 2, (pos[e.a * 3 + 2] + pos[e.b * 3 + 2]) / 2);
    uvs.push((uvs[e.a * 2] + uvs[e.b * 2]) / 2, (uvs[e.a * 2 + 1] + uvs[e.b * 2 + 1]) / 2);
    for (const t of e.tris) {
      const tr = tris[t];
      touched[t] = 1;
      const ia = tr.indexOf(e.a), ib = tr.indexOf(e.b), c = tr[3 - ia - ib];
      if ((ia + 1) % 3 === ib) { tris[t] = [e.a, m, c]; newTris.push([m, e.b, c]); }
      else { tris[t] = [e.b, m, c]; newTris.push([m, e.a, c]); }
    }
    splits++;
  }
  tris = tris.concat(newTris);
  if (!splits) break;
}

// ------------------------------------------------------------
//  3. Высоты чаши озера и берегового вала
// ------------------------------------------------------------
let changedV = 0, maxCut = 0, maxFill = 0;
const nV = pos.length / 3;
for (let v = 0; v < nV; v++) {
  const x = pos[v * 3], z = pos[v * 3 + 2], y = pos[v * 3 + 1];
  const h = carvedHeight(x, z, y);
  if (h == null || Math.abs(h - y) < 0.005) continue;
  changedV++;
  maxCut = Math.max(maxCut, y - h);
  maxFill = Math.max(maxFill, h - y);
  pos[v * 3 + 1] = +h.toFixed(3);
}

// ------------------------------------------------------------
//  4. Новый TerrainData, bakedHeights в изменённых клетках
// ------------------------------------------------------------
const idx = new Uint32Array(tris.length * 3);
tris.forEach((tr, i) => { idx[i * 3] = tr[0]; idx[i * 3 + 1] = tr[1]; idx[i * 3 + 2] = tr[2]; });
const next = Object.assign({}, base, {
  positions: new Float32Array(pos), uvs: new Float32Array(uvs), indices: idx,
  bakedHeights: new Float32Array(base.bakedHeights)
});
const BW = base.bakedW, BH = base.bakedH;
const cellsOld = [];
for (let iz = 0; iz < BH; iz++) for (let ix = 0; ix < BW; ix++) {
  const x = base.minX + ix / (BW - 1) * (base.maxX - base.minX);
  const z = base.minZ + iz / (BH - 1) * (base.maxZ - base.minZ);
  if (lakeNear(x, z)) cellsOld.push([ix, iz, x, z, gy(x, z)]);
}
globalThis.TerrainData = next;
TH.invalidate();
let bakedChanged = 0;
for (const [ix, iz, x, z, old] of cellsOld) {
  const dl = gy(x, z) - old;
  if (Math.abs(dl) > 0.01) { next.bakedHeights[iz * BW + ix] += dl; bakedChanged++; }
}

// ------------------------------------------------------------
//  5. Река в существующем русле: уровень по бровкам, монотонно к морю
// ------------------------------------------------------------
const RX = withFrames(resample(chaikin(resample([LAKE_AXIS[LAKE_AXIS.length - 1]].concat(
  reliefTail.filter(p => p[0] > 232 || p[1] > 428), SEA_TAIL), 8), 3), 5).map(p => ({ x: p[0], z: p[1], kind: 'river' })));
function crest(p, side) {
  let mx = -Infinity, dropped = false;
  for (let d = 2; d <= RIVER_HALF_MAX; d += 1) {
    const h = gy(p.x + p.nx * side * d, p.z + p.nz * side * d);
    if (h > mx) mx = h;
    else if (d > 5 && h < mx - 0.8) { dropped = true; break; }
  }
  return { top: mx, dropped };
}
for (const p of RX) {
  let fl = Infinity;
  for (let o = -5; o <= 5; o += 1) fl = Math.min(fl, gy(p.x + p.nx * o, p.z + p.nz * o));
  p.floor = fl;
  const L = crest(p, -1), R = crest(p, 1);
  let s = Math.min(L.top, R.top) - BANK_UP;
  // вода не выходит за RIVER_HALF_MAX: край разлива ниже — опускаем уровень
  const eL = gy(p.x - p.nx * RIVER_HALF_MAX, p.z - p.nz * RIVER_HALF_MAX);
  const eR = gy(p.x + p.nx * RIVER_HALF_MAX, p.z + p.nz * RIVER_HALF_MAX);
  s = Math.min(s, Math.min(eL, eR) - 0.3);
  p.sRaw = s;
}
{
  // нижняя граница: вода не ниже самого высокого дна дальше по течению (котловина заполняется до порога)
  const lb = new Array(RX.length);
  let mxFloor = -Infinity;
  for (let i = RX.length - 1; i >= 0; i--) { mxFloor = Math.max(mxFloor, RX[i].floor + 0.35); lb[i] = mxFloor; }
  let prev = LAKE_L - 0.15;
  for (let i = 0; i < RX.length; i++) {
    const p = RX[i];
    p.s = Math.max(lb[i], Math.min(prev, p.sRaw));
    prev = Math.min(prev, p.s);
    if (p.s > prev) prev = p.s;
  }
  for (let it = 0; it < 4; it++) {
    const ss = RX.map(p => p.s);
    for (let i = 1; i < RX.length - 1; i++) RX[i].s = Math.max(lb[i], (ss[i - 1] + 2 * ss[i] + ss[i + 1]) / 4);
    for (let i = 1; i < RX.length; i++) RX[i].s = Math.max(lb[i], Math.min(RX[i].s, RX[i - 1].s));
  }
  // устье: последние 60 м плавно к уровню моря
  const end = RX[RX.length - 1].d;
  for (const p of RX) {
    const f = smooth(end - 60, end, p.d);
    if (f > 0) p.s = p.s * (1 - f) + (SEA + 0.3) * f;
  }
}
for (const p of RX) {
  for (const side of [-1, 1]) {
    let w = RIVER_HALF_MAX;
    for (let d = 1; d <= RIVER_HALF_MAX; d += 0.5) {
      if (gy(p.x + p.nx * side * d, p.z + p.nz * side * d) > p.s + 0.2) { w = d; break; }
    }
    p[side < 0 ? 'hl' : 'hr'] = w;
  }
}
for (let it = 0; it < 2; it++) {
  const hl = RX.map(p => p.hl), hr = RX.map(p => p.hr);
  for (let i = 1; i < RX.length - 1; i++) {
    RX[i].hl = Math.max(hl[i], (hl[i - 1] + hl[i] + hl[i + 1]) / 3);
    RX[i].hr = Math.max(hr[i], (hr[i - 1] + hr[i] + hr[i + 1]) / 3);
  }
}

// проверки
let lakeBad = 0;
for (let i = 0; i < LX.length; i += 3) {
  const p = LX[i];
  if (!(gy(p.x, p.z) < LAKE_L - 1.5)) lakeBad++;
}
const depthStats = RX.map(p => p.s - p.floor);
const widthStats = RX.map(p => p.hl + p.hr);
const AXall = LX.concat(RX.slice(1));
let dd = 0;
for (let i = 1; i < AXall.length; i++) { dd += Math.hypot(AXall[i].x - AXall[i - 1].x, AXall[i].z - AXall[i - 1].z); AXall[i].d = dd; }
AXall[0].d = 0;

// ------------------------------------------------------------
//  6. Запись
// ------------------------------------------------------------
function encodeMeshBin(data) {
  const blobs = [], meta = {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v instanceof Float32Array || v instanceof Uint32Array) { meta[k] = { $b: blobs.length }; blobs.push(v); }
    else meta[k] = v;
  }
  const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8');
  let size = 8 + 4 + metaBuf.length + 4;
  for (const b of blobs) size += 5 + b.length * 4;
  const out = Buffer.alloc(size);
  out.write('PSMESH01', 0, 'latin1');
  let o = 8;
  out.writeUInt32LE(metaBuf.length, o); o += 4;
  metaBuf.copy(out, o); o += metaBuf.length;
  out.writeUInt32LE(blobs.length, o); o += 4;
  for (const b of blobs) {
    out[o] = b instanceof Uint32Array ? 1 : 0; o += 1;
    out.writeUInt32LE(b.length, o); o += 4;
    Buffer.from(b.buffer, b.byteOffset, b.byteLength).copy(out, o); o += b.length * 4;
  }
  return out;
}
function fmt(arr, dec) {
  const p = Math.pow(10, dec);
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) parts[i] = String(Math.round(arr[i] * p) / p);
  return '[' + parts.join(',') + ']';
}
function terrainJs(d) {
  const head = {};
  for (const k of ['gridWidth', 'gridHeight', 'minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ']) head[k] = d[k];
  let s = JSON.stringify(head).slice(0, -1);
  s += ',"positions":' + fmt(d.positions, 2) + ',"indices":[' + Array.from(d.indices).join(',') + '],"uvs":' + fmt(d.uvs, 4);
  s += ',"bakedW":' + d.bakedW + ',"bakedH":' + d.bakedH + ',"bakedHeights":' + fmt(d.bakedHeights, 2) + '}';
  return 'window.TerrainData = ' + s + ';';
}

const waterPts = AXall.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.s.toFixed(3), +(p.hl + OVER).toFixed(2), +(p.hr + OVER).toFixed(2)]);
// Водопад из раструба прорванного водовода в озеро (раструб ставит layout на берегу)
const h0 = LX[0];
const falls = [{ x: +(h0.x - h0.tx * 2.0).toFixed(2), z: +(h0.z - h0.tz * 2.0).toFixed(2), dx: +h0.tx.toFixed(4), dz: +h0.tz.toFixed(4), w: 2.0, bottom: +(LAKE_L - 0.15).toFixed(2) }];

const summary = {
  verts: [nV0, nV], tris: [nT0, tris.length], changedV, maxCut: +maxCut.toFixed(2), maxFill: +maxFill.toFixed(2), bakedChanged, lakeBad,
  river: { pts: RX.length, lengthM: +RX[RX.length - 1].d.toFixed(0), level: [+RX[0].s.toFixed(2), +RX[RX.length - 1].s.toFixed(2)],
    depthMed: +depthStats.slice().sort((a, b) => a - b)[depthStats.length >> 1].toFixed(2),
    depthMin: +Math.min(...depthStats).toFixed(2), widthMed: +widthStats.slice().sort((a, b) => a - b)[widthStats.length >> 1].toFixed(1),
    widthMax: +Math.max(...widthStats).toFixed(1) }
};
console.log('[terrain-river]', JSON.stringify(summary));
if (process.env.RIVER_DUMP) fs.writeFileSync(process.env.RIVER_DUMP, JSON.stringify(RX.map(p => [Math.round(p.x), Math.round(p.z), +p.floor.toFixed(1), +p.sRaw.toFixed(1), +p.s.toFixed(1), +p.hl.toFixed(1), +p.hr.toFixed(1)])));
if (DRY) process.exit(0);

fs.writeFileSync(BIN, encodeMeshBin(next));
fs.writeFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), terrainJs(next));
const chk = MB.loadFileSync(fs, BIN);
if (chk.positions.length !== next.positions.length || chk.indices.length !== next.indices.length) throw new Error('terrain.bin: проверка чтения не прошла');

fs.writeFileSync(path.join(ROOT, 'client', 'js', 'river-data.js'),
  '// Сгенерировано scripts/operators-territory/terrain-river.js — не править руками.\n' +
  '// Озеро водовода и Ржавая река: [x, z, уровень, ширина влево, ширина вправо] по течению; falls — водопады.\n' +
  'window.RiverData = ' + JSON.stringify({ rivers: [{ id: 'rust_river', name: 'Ржавая река', pts: waterPts, falls }] }) + ';\n');
fs.writeFileSync(path.join(ROOT, 'shared', 'river-data.json'), JSON.stringify({ deepWalk: 1.25, rivers: [{ id: 'rust_river', pts: waterPts }] }));
fs.writeFileSync(path.join(__dirname, 'river-path.json'), JSON.stringify({
  meta: { name: 'Ржавая река', lakeLevel: LAKE_L, bankUp: BANK_UP, length: +AXall[AXall.length - 1].d.toFixed(0), lakeLen: +LAKE_LEN.toFixed(1) },
  pts: AXall.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), s: +p.s.toFixed(3), floor: +(p.kind === 'lake' ? LAKE_L - LAKE_DEPTH : p.floor).toFixed(3),
    wl: +(p.hl + 2.2).toFixed(2), wr: +(p.hr + 2.2).toFixed(2), nx: +p.nx.toFixed(4), nz: +p.nz.toFixed(4), d: +p.d.toFixed(1), kind: p.kind }))
}));
console.log('[terrain-river] записано: terrain.bin ' + (fs.statSync(BIN).size / 1024).toFixed(0) + ' КБ, terrain-data.js, river-data.js, shared/river-data.json, river-path.json');
