#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / RIVER.JS
//  «Ржавый ручей»: вода в естественном сухом русле рельефа — от прорванного
//  водовода на юге Территории операторов вниз по оврагу через Междуречье к морю.
//
//  Рельеф НЕ меняется: русло уже вырезано в меше острова. Скрипт:
//   - идёт по тальвегу вниз (минимум высоты поперёк направления);
//   - считает дно, уровень воды (только вниз по течению) и ширину до берегов;
//   - пишет компактную ленту client/js/river-data.js (≈200 точек: x, z, уровень,
//     ширина влево/вправо) — клиент строит из неё 1 меш на кусок, 1 материал;
//   - пишет scripts/operators-territory/river-path.json для layout.js и покраски берегов.
//
//  Запуск: node scripts/operators-territory/river.js
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
globalThis.TerrainData = win.TerrainData;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
const SEA = -35;

function g(x, z) {
  const y = TH.groundY(x, z, 600, 1200);
  return (y == null || !isFinite(y)) ? SEA - 40 : y;
}

// Исток: заводь у прорванного водовода (юго-западный угол Территории операторов)
const HEAD = { x: 56, z: 318 };
const HEAD_DIR = Math.atan2(150 - 56, 378 - 318); // первое направление — вниз по оврагу к юго-востоку
const STEP = 5.0;
const MAX_LEN = 1400;
const DEPTH = 0.78;           // глубина воды над дном (брод: игрок идёт по дну)
const MAX_HALF = 22;          // разлив не шире 44 м
const BANK_OVERLAP = 2.2;     // край ленты уходит под берег — нет висящей кромки

function traceThalweg() {
  const pts = [{ x: HEAD.x, z: HEAD.z }];
  let dir = HEAD_DIR;
  let len = 0;
  for (let i = 0; i < 600 && len < MAX_LEN; i++) {
    const p = pts[pts.length - 1];
    let best = null;
    // веер направлений ±40° и боковой поиск минимума — тальвег, а не прямая
    for (let da = -0.70; da <= 0.70001; da += 0.07) {
      const a = dir + da;
      const nx = p.x + Math.sin(a) * STEP;
      const nz = p.z + Math.cos(a) * STEP;
      const h = g(nx, nz);
      const score = h + Math.abs(da) * 0.55; // штраф за резкий поворот
      if (!best || score < best.score) best = { x: nx, z: nz, a, h, score };
    }
    dir = dir * 0.55 + best.a * 0.45;
    pts.push({ x: best.x, z: best.z });
    len += STEP;
    if (best.h < SEA + 0.8) break; // дошли до моря
  }
  return pts;
}

function smoothLine(pts, iters) {
  let cur = pts.slice();
  for (let k = 0; k < iters; k++) {
    const nxt = [cur[0]];
    for (let i = 1; i < cur.length - 1; i++) {
      nxt.push({
        x: cur[i - 1].x * 0.25 + cur[i].x * 0.5 + cur[i + 1].x * 0.25,
        z: cur[i - 1].z * 0.25 + cur[i].z * 0.5 + cur[i + 1].z * 0.25
      });
    }
    nxt.push(cur[cur.length - 1]);
    cur = nxt;
  }
  return cur;
}

/** Ресэмплинг по длине дуги: точки через равный шаг. */
function resample(pts, step) {
  const out = [pts[0]];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    let segLen = Math.hypot(b.x - a.x, b.z - a.z);
    let t0 = 0;
    while (acc + segLen * (1 - t0) >= step) {
      const need = step - acc;
      const t = t0 + need / segLen;
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
      t0 = t;
      acc = 0;
      if (t0 >= 1) break;
    }
    acc += segLen * (1 - t0);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function build() {
  const raw = traceThalweg();
  let line = resample(smoothLine(raw, 6), 6.0);
  // дно: минимум поперёк ±3 м (тальвег сглажен — дно рядом)
  const n = line.length;
  for (let i = 0; i < n; i++) {
    const p = line[i];
    const q = line[Math.min(n - 1, i + 1)], o = line[Math.max(0, i - 1)];
    const tx = q.x - o.x, tz = q.z - o.z, tl = Math.hypot(tx, tz) || 1;
    p.tx = tx / tl; p.tz = tz / tl;
    p.nx = p.tz; p.nz = -p.tx; // нормаль вправо по течению
    let fl = Infinity;
    for (let s = -4; s <= 4; s += 1) fl = Math.min(fl, g(p.x + p.nx * s, p.z + p.nz * s));
    p.floor = fl;
  }
  // уровень: не поднимается вниз по течению, не ниже дна + 0.22
  let prev = Infinity;
  for (const p of line) {
    let s = Math.min(prev, p.floor + DEPTH);
    s = Math.max(s, p.floor + 0.22);
    p.s = s;
    prev = s;
  }
  // сглаживание уровня (монотонность сохраняется: окно назад-вперёд + clamp)
  for (let k = 0; k < 3; k++) {
    const ss = line.map(p => p.s);
    for (let i = 1; i < n - 1; i++) line[i].s = Math.max(line[i].floor + 0.22, (ss[i - 1] + ss[i] * 2 + ss[i + 1]) / 4);
    for (let i = 1; i < n; i++) line[i].s = Math.min(line[i].s, line[i - 1].s);
  }
  // ширина до берега (где земля выше воды на 0.3 м) + заход под берег
  for (const p of line) {
    for (const side of [-1, 1]) {
      let w = MAX_HALF;
      for (let d = 1.0; d <= MAX_HALF; d += 0.5) {
        if (g(p.x + p.nx * d * side, p.z + p.nz * d * side) > p.s + 0.30) { w = d; break; }
      }
      p[side < 0 ? 'wl' : 'wr'] = Math.min(MAX_HALF + BANK_OVERLAP, w + BANK_OVERLAP);
    }
  }
  for (let k = 0; k < 2; k++) {
    const wl = line.map(p => p.wl), wr = line.map(p => p.wr);
    for (let i = 1; i < n - 1; i++) {
      line[i].wl = Math.max(wl[i], (wl[i - 1] + wl[i] + wl[i + 1]) / 3);
      line[i].wr = Math.max(wr[i], (wr[i - 1] + wr[i] + wr[i + 1]) / 3);
    }
  }
  // устье: обрезаем, как только вода дошла до уровня моря (дальше лента ушла бы под сушу)
  const mouth = line.findIndex(p => p.s < SEA + 2.6);
  if (mouth > 0) line.length = mouth + 1;
  // длина дуги
  let L = 0;
  line[0].d = 0;
  for (let i = 1; i < line.length; i++) { L += Math.hypot(line[i].x - line[i - 1].x, line[i].z - line[i - 1].z); line[i].d = L; }
  return line;
}

const line = build();
const pts = line.map(p => [+p.x.toFixed(2), +p.z.toFixed(2), +p.s.toFixed(2), +p.wl.toFixed(2), +p.wr.toFixed(2)]);
const meta = {
  name: 'Ржавый ручей',
  head: HEAD,
  length: +line[line.length - 1].d.toFixed(1),
  depth: DEPTH,
  points: pts.length
};

const js = '// Сгенерировано scripts/operators-territory/river.js — не править руками.\n' +
  '// Лента воды «Ржавого ручья»: [x, z, уровень, ширина влево, ширина вправо] по течению.\n' +
  'window.RiverData = ' + JSON.stringify({ rivers: [{ id: 'rust_brook', name: meta.name, pts }] }) + ';\n';
fs.writeFileSync(path.join(ROOT, 'client', 'js', 'river-data.js'), js);
fs.writeFileSync(path.join(__dirname, 'river-path.json'), JSON.stringify({
  meta,
  pts: line.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2), s: +p.s.toFixed(3), floor: +p.floor.toFixed(3), wl: +p.wl.toFixed(2), wr: +p.wr.toFixed(2), nx: +p.nx.toFixed(4), nz: +p.nz.toFixed(4), d: +p.d.toFixed(1) }))
}, null, 0));
console.log('[river] ' + meta.name + ': ' + pts.length + ' точек, длина ' + meta.length + ' м, исток (' + HEAD.x + ',' + HEAD.z + ') → устье (' + pts[pts.length - 1][0] + ',' + pts[pts.length - 1][1] + ') уровень ' + pts[0][2] + ' → ' + pts[pts.length - 1][2]);
console.log('[river] client/js/river-data.js ' + (js.length / 1024).toFixed(1) + ' КБ');
