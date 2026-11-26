#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / RIVER-WATER.JS
//  Ржавая река: вода в СУЩЕСТВУЮЩЕМ русле оврага — от прорванного водовода до моря.
//  Рельеф острова НЕ меняется (ни одной вершины): только данные водной ленты.
//
//   • ось — тальвег русла исходного рельефа (river-path-relief.json) и ложе к морскому каналу;
//   • уровень «по бровкам»: на BANK_UP ниже нижнего из двух гребней берега, монотонно к морю,
//     котловина заполняется до порога; разлив не шире halfMax (24–32 м) — в широком верховье оврага
//     вода сама разливается заводью по рельефу;
//   • пишет client/js/river-data.js (вода в клиенте), shared/river-data.json (глубина для
//     проходимости на сервере) и river-path.json (layout.js).
//
//  Запуск: node scripts/operators-territory/river-water.js [--dry]
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DRY = process.argv.includes('--dry');
const MB = require(path.join(ROOT, 'client', 'js', 'mesh-bin.js'));
globalThis.TerrainData = MB.loadFileSync(fs, path.join(ROOT, 'client', 'data', 'mesh', 'terrain.bin'));
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
const SEA = -35;
function gy(x, z) { const y = TH.groundY(x, z, 600, 1200); return (y == null || !isFinite(y)) ? SEA - 40 : y; }

const BANK_UP = 0.5;
// полуширина разлива: в верхнем ущелье (исток и Большой мост) — 24 м, ниже ущелье шире — до 32 м
const HALF_MAX = 32;
function halfMax(p) { return p.d < 185 ? 24 : (p.d > 215 ? 32 : 24 + (p.d - 185) / 30 * 8); }
const OVER = 2.4;
const relief = JSON.parse(fs.readFileSync(path.join(__dirname, 'river-path-relief.json'), 'utf8')).pts;

/** Устье по исходному рельефу: от конца тальвега через самый низкий порог в морскую бухту
 *  (бинарный поиск порога + Дейкстра по клеткам ниже порога, предпочитая низины). */
function seaTail(sx, sz) {
  const X0 = sx - 80, X1 = sx + 380, Z0 = sz - 90, Z1 = sz + 220, C = 3;
  const NX = ((X1 - X0) / C | 0) + 1, NZ = ((Z1 - Z0) / C | 0) + 1;
  const H = new Float32Array(NX * NZ);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) H[j * NX + i] = gy(X0 + i * C, Z0 + j * C);
  const start = Math.round((sz - Z0) / C) * NX + Math.round((sx - X0) / C);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const reaches = (T) => {
    const seen = new Uint8Array(NX * NZ), q = [start];
    seen[start] = 1;
    while (q.length) {
      const k = q.pop();
      if (H[k] < SEA - 1) return true;
      const i = k % NX, j = k / NX | 0;
      for (const [di, dj] of N4) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
        const n = b * NX + a;
        if (!seen[n] && H[n] <= T) { seen[n] = 1; q.push(n); }
      }
    }
    return false;
  };
  let lo = SEA - 1, hi = 20;
  for (let it = 0; it < 30; it++) { const m = (lo + hi) / 2; if (reaches(m)) hi = m; else lo = m; }
  const T = hi + 0.4;
  const dist = new Float64Array(NX * NZ).fill(Infinity), prev = new Int32Array(NX * NZ).fill(-1);
  dist[start] = 0;
  const open = [start];
  let goal = -1;
  while (open.length) {
    let bi = 0;
    for (let q = 1; q < open.length; q++) if (dist[open[q]] < dist[open[bi]]) bi = q;
    const k = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (H[k] < SEA - 3) { goal = k; break; }
    const i = k % NX, j = k / NX | 0;
    for (const [di, dj] of N4) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= NX || b >= NZ) continue;
      const n = b * NX + a;
      if (H[n] > T) continue;
      const nd = dist[k] + Math.hypot(di, dj) * C * (1 + 0.12 * Math.max(0, H[n] - SEA));
      if (nd < dist[n]) { if (dist[n] === Infinity) open.push(n); dist[n] = nd; prev[n] = k; }
    }
  }
  if (goal < 0) throw new Error('river-water: устье к морю не найдено');
  const cells = [];
  for (let k = goal; k >= 0; k = prev[k]) cells.push([X0 + (k % NX) * C, Z0 + (k / NX | 0) * C]);
  cells.reverse();
  const pts = [];
  for (let i = 4; i < cells.length; i += 4) pts.push(cells[i]);
  pts.push(cells[cells.length - 1]);
  const a = pts[pts.length - 2], b = pts[pts.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  pts.push([b[0] + (b[0] - a[0]) / L * 18, b[1] + (b[1] - a[1]) / L * 18]);
  return { pts, sill: hi };
}
const tailStart = relief[relief.length - 1];
const TAIL = seaTail(tailStart.x, tailStart.z);
const SEA_TAIL = TAIL.pts;

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
function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

const raw = relief.map(p => [p.x, p.z]).concat(SEA_TAIL);
const RX0 = resample(chaikin(resample(raw, 8), 3), 5).map(p => ({ x: p[0], z: p[1] }));
for (let i = 0; i < RX0.length; i++) {
  const a = RX0[Math.max(0, i - 1)], b = RX0[Math.min(RX0.length - 1, i + 1)];
  const tx = b.x - a.x, tz = b.z - a.z, L = Math.hypot(tx, tz) || 1;
  RX0[i].nx = tz / L; RX0[i].nz = -tx / L;
  RX0[i].d = i ? RX0[i - 1].d + Math.hypot(RX0[i].x - RX0[i - 1].x, RX0[i].z - RX0[i - 1].z) : 0;
}
// Исток — там, где начинается бурое русло (выше по тальвегу — мелкая травяная ложбина,
// в ней вода легла бы плоской «простынёй»): вода выходит из прорванного водовода мелкой струёй
const START_D = 207, HEAD_DEPTH = 0.6;
const RX = RX0.filter(p => p.d >= START_D);
for (const p of RX) { p.dAbs = p.d; p.d -= RX[0].dAbs; }
function crest(p, side) {
  // ось может идти у края русла: сперва спуск к настоящему дну, потом подъём на берег —
  // гребень засчитывается, только когда склон действительно поднялся над дном
  let mx = -Infinity, mn = Infinity;
  for (let d = 2; d <= halfMax(p); d += 1) {
    const h = gy(p.x + p.nx * side * d, p.z + p.nz * side * d);
    mn = Math.min(mn, h);
    if (h > mx) mx = h;
    else if (d > 5 && mx > mn + 1.5 && h < mx - 0.8) break;
  }
  return mx;
}
for (const p of RX) {
  let fl = Infinity;
  for (let o = -5; o <= 5; o += 1) fl = Math.min(fl, gy(p.x + p.nx * o, p.z + p.nz * o));
  p.floor = fl;
  let s = Math.min(crest(p, -1), crest(p, 1)) - BANK_UP;
  const hm = halfMax(p);
  const eL = gy(p.x - p.nx * hm, p.z - p.nz * hm), eR = gy(p.x + p.nx * hm, p.z + p.nz * hm);
  p.sRaw = Math.min(s, Math.min(eL, eR) - 0.3);
}
RX[0].sRaw = Math.min(RX[0].sRaw, RX[0].floor + HEAD_DEPTH);
{
  const lb = new Array(RX.length);
  let mx = -Infinity;
  for (let i = RX.length - 1; i >= 0; i--) { mx = Math.max(mx, RX[i].floor + 0.35); lb[i] = mx; }
  // котловина перед устьем держит воду до порога (ось может пройти мимо самой низкой седловины)
  let iSill = -1, hSill = -Infinity;
  for (let i = 0; i < RX.length; i++) if (RX[i].dAbs > relief[relief.length - 1].d) { const h = gy(RX[i].x, RX[i].z); if (h > hSill) { hSill = h; iSill = i; } }
  for (let i = 0; i <= iSill; i++) lb[i] = Math.max(lb[i], TAIL.sill + 0.3);
  let prev = Infinity;
  for (let i = 0; i < RX.length; i++) { RX[i].s = Math.max(lb[i], Math.min(prev, RX[i].sRaw)); prev = Math.min(prev, RX[i].s); }
  for (let it = 0; it < 4; it++) {
    const ss = RX.map(p => p.s);
    for (let i = 1; i < RX.length - 1; i++) RX[i].s = Math.max(lb[i], (ss[i - 1] + 2 * ss[i] + ss[i + 1]) / 4);
    for (let i = 1; i < RX.length; i++) RX[i].s = Math.max(lb[i], Math.min(RX[i].s, RX[i - 1].s));
  }
  const end = RX[RX.length - 1].d;
  for (const p of RX) { const f = smooth(end - 60, end, p.d); if (f > 0) p.s = p.s * (1 - f) + (SEA + 0.3) * f; }
}
for (const p of RX) {
  for (const side of [-1, 1]) {
    const hm = halfMax(p);
    let w = hm;
    for (let d = 1; d <= hm; d += 0.5) { if (gy(p.x + p.nx * side * d, p.z + p.nz * side * d) > p.s + 0.2) { w = d; break; } }
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
const depth = RX.map(p => p.s - p.floor).sort((a, b) => a - b), width = RX.map(p => p.hl + p.hr).sort((a, b) => a - b);
console.log('[river-water] порог устья ' + TAIL.sill.toFixed(2) + ', ' + RX.length + ' точек, ' + RX[RX.length - 1].d.toFixed(0) + ' м, уровень ' + RX[0].s.toFixed(2) + ' → ' + RX[RX.length - 1].s.toFixed(2) +
  ', глубина мед. ' + depth[depth.length >> 1].toFixed(1) + ' м, ширина мед. ' + width[width.length >> 1].toFixed(1) + ' м (рельеф не меняется)');
if (process.argv.includes('--profile')) {
  for (let i = 0; i < RX.length; i += (process.argv.includes('--all') ? 1 : 4)) {
    const p = RX[i];
    console.log(p.d.toFixed(0).padStart(4) + '  (' + p.x.toFixed(0) + ', ' + p.z.toFixed(0) + ')  дно ' + p.floor.toFixed(1) + '  вода ' + p.s.toFixed(1) +
      '  бровка ' + p.sRaw.toFixed(1) + '  ширина ' + p.hl.toFixed(1) + ' / ' + p.hr.toFixed(1) + '  земля на оси ' + gy(p.x, p.z).toFixed(1));
  }
}
if (DRY) process.exit(0);

const waterPts = RX.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.s.toFixed(3), +(p.hl + OVER).toFixed(2), +(p.hr + OVER).toFixed(2)]);
fs.writeFileSync(path.join(ROOT, 'client', 'js', 'river-data.js'),
  '// Сгенерировано scripts/operators-territory/river-water.js — не править руками.\n' +
  '// Ржавая река в существующем русле: [x, z, уровень, ширина влево, ширина вправо] по течению.\n' +
  'window.RiverData = ' + JSON.stringify({ rivers: [{ id: 'rust_river', name: 'Ржавая река', pts: waterPts, falls: [] }] }) + ';\n');
fs.writeFileSync(path.join(ROOT, 'shared', 'river-data.json'), JSON.stringify({ deepWalk: 1.25, rivers: [{ id: 'rust_river', pts: waterPts }] }));
fs.writeFileSync(path.join(__dirname, 'river-path.json'), JSON.stringify({
  meta: { name: 'Ржавая река', bankUp: BANK_UP, length: +RX[RX.length - 1].d.toFixed(0) },
  pts: RX.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), s: +p.s.toFixed(3), floor: +p.floor.toFixed(3), wl: +(p.hl + 2.2).toFixed(2), wr: +(p.hr + 2.2).toFixed(2),
    nx: +p.nx.toFixed(4), nz: +p.nz.toFixed(4), d: +p.d.toFixed(1), kind: 'river' }))
}));
console.log('[river-water] записано: client/js/river-data.js, shared/river-data.json, river-path.json');
