#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / PAINT.JS
//  Покраска террейна (сплат-карта 1024², 4 слоя) для Старого парка механиков
//  и «Ржавого ручья»: брусчатка аллей (слой 0), газоны (1), грунтовые тропы (2),
//  песок/ил у воды и на дне (3). Ноль геометрии — только два PNG по 10–20 КБ.
//
//  Карты: client/data/terrain-paint-1.png (веса слоёв RGBA) и -2.png (тайлинг слоя,
//  NearestFilter). Чужие мазки (дороги деревни) не стираются: берётся максимум.
//  Пишется туда же, куда редактор (writeTerrainPaint): client/data, shared, data, dist.
//
//  Запуск отдельно: node scripts/operators-territory/paint.js  (план — paint-plan.json)
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..', '..');
const SIZE = 1024;

// ---------------- PNG (RGBA8, без interlace) ----------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');
  let off = 8, w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2) || interlace) throw new Error('PNG: ожидается RGBA/RGB 8 бит без interlace');
  const bpp = ctype === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = new Uint8Array(w * h * 4);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2];
      out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    const t = prev; prev = cur; cur = t;
  }
  return { w, h, data: out };
}
function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    // фильтр Sub: карты почти пустые — сжимаются в разы лучше None
    raw[y * (stride + 1)] = 1;
    for (let i = 0; i < stride; i++) {
      const v = rgba[y * stride + i], a = i >= 4 ? rgba[y * stride + i - 4] : 0;
      raw[y * (stride + 1) + 1 + i] = (v - a) & 255;
    }
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---------------- шум (детерминированный value noise) ----------------
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function fbm(x, y) { return vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7.3, y * 2.1 + 1.9) * 0.3 + vnoise(x * 4.3 + 3.1, y * 4.3 + 8.7) * 0.1; }
function smooth(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

function polyInfo(pts) {
  const lens = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); lens.push(L); total += L; }
  return { lens, total };
}
/** Расстояние до ломаной и доля пути (0..1) в ближайшей точке. */
function nearestOnPoly(x, z, pts, info) {
  let best = Infinity, bestS = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / L2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) { best = d; bestS = acc + info.lens[i] * t; }
    acc += info.lens[i];
  }
  return { d: best, f: info.total > 0 ? bestS / info.total : 0 };
}

function run(plan) {
  plan = plan || JSON.parse(fs.readFileSync(path.join(__dirname, 'paint-plan.json'), 'utf8'));
  const win = {};
  new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
  globalThis.TerrainData = win.TerrainData;
  const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
  const TD = win.TerrainData;
  const W = TD.maxX - TD.minX, Hh = TD.maxZ - TD.minZ;
  const river = JSON.parse(fs.readFileSync(path.join(__dirname, 'river-path.json'), 'utf8')).pts;

  const src1 = path.join(ROOT, 'client', 'data', 'terrain-paint-1.png');
  const src2 = path.join(ROOT, 'client', 'data', 'terrain-paint-2.png');
  // База — копия до первой покраски парка: повторный запуск не копит мазки поверх своих же
  const base1 = path.join(__dirname, 'paint-base-1.png');
  const base2 = path.join(__dirname, 'paint-base-2.png');
  if (!fs.existsSync(base1)) fs.copyFileSync(src1, base1);
  if (!fs.existsSync(base2)) fs.copyFileSync(src2, base2);
  const B1 = decodePng(fs.readFileSync(base1)), B2 = decodePng(fs.readFileSync(base2));
  const C1 = decodePng(fs.readFileSync(src1)), C2 = decodePng(fs.readFileSync(src2));
  if (B1.w !== SIZE || C1.w !== SIZE || B2.w !== SIZE || C2.w !== SIZE) throw new Error('карта покраски не ' + SIZE + '²');
  // вне участка — текущая карта (правки редактора сохраняются), внутри — база + план
  const out1 = new Uint8Array(C1.data), out2 = new Uint8Array(C2.data);

  // границы обработки: всё, что задевает план, + русло
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  function grow(x, z, r) { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); }
  for (const s of plan.strokes) for (const [x, z] of s.pts) grow(x, z, s.hw + s.feather + 4);
  for (const d of plan.disks) grow(d.x, d.z, d.r + d.feather + 4);
  for (const l of plan.lawns) grow(l.x, l.z, l.r * 1.4 + 4);
  for (const p of river) grow(p.x, p.z, Math.max(p.wl, p.wr) + 12);
  const strokes = plan.strokes.map(s => Object.assign({}, s, { info: polyInfo(s.pts) }));
  const pxOf = x => Math.round(((x - TD.minX) / W) * (SIZE - 1));
  const pyOf = z => Math.round((1 - (z - TD.minZ) / Hh) * (SIZE - 1));
  const pxA = Math.max(0, pxOf(x0)), pxB = Math.min(SIZE - 1, pxOf(x1));
  const pyA = Math.max(0, pyOf(z1)), pyB = Math.min(SIZE - 1, pyOf(z0));
  for (let py = Math.max(0, pyA - 1); py <= Math.min(SIZE - 1, pyB + 1); py++) {
    for (let px = Math.max(0, pxA - 1); px <= Math.min(SIZE - 1, pxB + 1); px++) {
      const o = (py * SIZE + px) * 4;
      for (let c = 0; c < 4; c++) { out1[o + c] = B1.data[o + c]; out2[o + c] = B2.data[o + c]; }
    }
  }

  const counts = [0, 0, 0, 0];
  const touched = [new Set(), new Set(), new Set(), new Set()];
  for (let py = pyA; py <= pyB; py++) {
    for (let px = pxA; px <= pxB; px++) {
      const x = TD.minX + (px / (SIZE - 1)) * W;
      const z = TD.minZ + (1 - py / (SIZE - 1)) * Hh;
      const w = [0, 0, 0, 0];
      const n1 = fbm(x * 0.09, z * 0.09);           // протёртости брусчатки ~10 м
      const n2 = fbm(x * 0.035 + 11.7, z * 0.035 + 4.1); // пятна газонов ~30 м
      for (const s of strokes) {
        const { d, f } = nearestOnPoly(x, z, s.pts, s.info);
        if (d > s.hw + s.feather) continue;
        let k = 1 - smooth(s.hw - s.feather * 0.35, s.hw + s.feather, d);
        k *= (1 - s.noise) + s.noise * smooth(0.25, 0.7, n1);
        if (s.fade === 'end') k *= 1 - smooth(0.62, 1.0, f);
        if (s.fade === 'start') k *= smooth(0.0, 0.38, f);
        w[s.layer] = Math.max(w[s.layer], s.str * k);
        if (s.mix) w[s.mix.layer] = Math.max(w[s.mix.layer], s.mix.str * k * smooth(0.3, 0.8, 1 - n1));
      }
      for (const dk of plan.disks) {
        const d = Math.hypot(x - dk.x, z - dk.z);
        if (d > dk.r + dk.feather) continue;
        let k = 1 - smooth(dk.r - dk.feather * 0.35, dk.r + dk.feather, d);
        k *= (1 - dk.noise) + dk.noise * smooth(0.25, 0.7, n1);
        w[dk.layer] = Math.max(w[dk.layer], dk.str * k);
      }
      for (const l of plan.lawns) {
        const d = Math.hypot(x - l.x, z - l.z) / l.r;
        if (d > 1.6) continue;
        // рваный край бывшего газона: крупный шум сдвигает границу (не ровный круг)
        const warp = (fbm(x * 0.05 + 3.3, z * 0.05 + 9.1) - 0.5) * 1.2;
        let k = 1 - smooth(0.35, 1.2, d + warp);
        k *= (1 - l.noise) + l.noise * smooth(0.3, 0.75, n2);
        w[l.layer] = Math.max(w[l.layer], l.str * k);
      }
      // берег: песок/ил у кромки и на дне, полоса сочной травы выше
      let best = null, bd = Infinity;
      for (const p of river) { const dd = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z); if (dd < bd) { bd = dd; best = p; } }
      if (best && Math.sqrt(bd) < Math.max(best.wl, best.wr) + 10) {
        const gy = TH.groundY(x, z, 600, 1200);
        if (gy != null && isFinite(gy)) {
          const rel = gy - best.s;
          // узкая песчаная кромка у уреза воды, илистое (тёмный грунт) дно, выше — сочная трава
          const shore = smooth(-0.35, -0.02, rel) * (1 - smooth(0.10, 0.45, rel + (n2 - 0.5) * 0.3));
          const sand = shore * 0.42 * (0.7 + 0.3 * smooth(0.2, 0.8, n1));
          w[3] = Math.max(w[3], sand);
          const bed = 1 - smooth(-0.30, 0.0, rel);
          w[2] = Math.max(w[2], bed * 0.55);
          const lush = smooth(0.25, 0.7, rel) * (1 - smooth(2.2, 3.8, rel)) * 0.36 * (0.55 + 0.45 * smooth(0.3, 0.7, n2));
          w[1] = Math.max(w[1], lush);
        }
      }
      const off = (py * SIZE + px) * 4;
      for (let c = 0; c < 4; c++) {
        const v = Math.round(Math.max(0, Math.min(1, w[c])) * 255);
        if (v > out1[off + c]) {
          if (out1[off + c] === 0) counts[c]++;
          out1[off + c] = v;
          touched[c].add(py * SIZE + px);
        }
      }
    }
  }
  // тайлинг слоя (NearestFilter): ставим и в соседних пикселях, чтобы кромка мазка не прыгала масштабом
  const tiling = plan.tiling || { 0: 59, 1: 43, 2: 91, 3: 100 };
  for (let c = 0; c < 4; c++) {
    for (const idx of touched[c]) {
      const py = Math.floor(idx / SIZE), px = idx % SIZE;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = px + dx, qy = py + dy;
        if (qx < 0 || qy < 0 || qx >= SIZE || qy >= SIZE) continue;
        const o = (qy * SIZE + qx) * 4 + c;
        if (out2[o] === 0) out2[o] = tiling[c];
      }
    }
  }
  const png1 = encodePng(SIZE, SIZE, out1);
  const png2 = encodePng(SIZE, SIZE, out2);
  // проверка кодека: декод собственного вывода совпадает побайтно
  const chk = decodePng(png1).data;
  for (let i = 0; i < chk.length; i += 997) if (chk[i] !== out1[i]) throw new Error('PNG: ошибка кодирования');

  const targets = [path.join(ROOT, 'client', 'data'), path.join(ROOT, 'shared'), path.join(ROOT, 'data'), path.join(ROOT, 'dist', 'client', 'data')]
    .filter(d => fs.existsSync(d));
  const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
  const pairs = [];
  for (const d of targets) { pairs.push([path.join(d, 'terrain-paint-1.png'), png1]); pairs.push([path.join(d, 'terrain-paint-2.png'), png2]); }
  writer.writeAtomicMany(pairs);
  const summary = 'новых пикселей по слоям [брусчатка, трава, грунт, песок] = [' + counts.join(', ') + '], PNG ' +
    (png1.length / 1024).toFixed(1) + ' + ' + (png2.length / 1024).toFixed(1) + ' КБ → ' + targets.map(t => path.relative(ROOT, t)).join(', ');
  return { summary, counts };
}

module.exports = { run, decodePng, encodePng };

if (require.main === module) {
  console.log('[paint] ' + run().summary);
}
