// ============================================================
//  TERRAIN-SCULPT-WRITER.JS — сохранение кисти ландшафта редактора (только локально).
//
//  Рельеф принадлежит автору: файл меняется ТОЛЬКО по явным мазкам кисти в редакторе,
//  которые клиент присылает списком «вершина → новый Y» (+ ячейки bakedHeights).
//  Остальные байты terrain.bin не трогаются: Y правленых вершин переписываются прямо в
//  блобах PSMESH01, дамп client/js/terrain-data.js собирается в том же формате (Python
//  json.dumps, числа с 2 знаками), так что tests/mesh-bin.test.js видит те же данные.
//
//  Перед первой записью исходный меш копируется в data/terrain-backups/terrain.original.bin
//  (никогда не перезаписывается) — его же редактор берёт для «кисти отмены»; перед каждой
//  записью — ротация копий terrain-<время>.bin. Дев-сборка (builds/dev/<версия>) пишет и в
//  свою копию клиента (её читает её сервер), и в исходники проекта: иначе правки умерли бы
//  вместе со сборкой.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { writeAtomicMany, EditorSaveError } = require('./editor-overrides-writer.js');

const ROOT = path.join(__dirname, '..');
const MAGIC = 'PSMESH01';
const BIN_REL = path.join('client', 'data', 'mesh', 'terrain.bin');
const JS_REL = path.join('client', 'js', 'terrain-data.js');
const BACKUP_KEEP = 15;
const Y_LIMIT = 5000;

/** Корни, куда пишется рельеф: эта копия проекта и (для дев-сборки) исходники. */
function targetRoots(root) {
  root = root || ROOT;
  const roots = [root];
  try {
    const info = JSON.parse(fs.readFileSync(path.join(root, 'BUILD-INFO.json'), 'utf8'));
    const src = path.resolve(root, '..', '..', '..');
    if (info && info.kind === 'dev' && src !== root &&
      fs.existsSync(path.join(src, 'scripts', 'build-local.js')) && fs.existsSync(path.join(src, BIN_REL))) {
      roots.push(src);
    }
  } catch (_) { /* не сборка */ }
  return roots;
}

/** Главный корень (исходники проекта, если мы в дев-сборке) — там лежат бэкапы. */
function primaryRoot(root) {
  const r = targetRoots(root);
  return r[r.length - 1];
}

function backupDir(root) { return path.join(primaryRoot(root), 'data', 'terrain-backups'); }

/** Разметка PSMESH01: meta + смещения блобов в файле. */
function parseLayout(buf) {
  if (buf.length < 16 || buf.toString('latin1', 0, 8) !== MAGIC) throw new EditorSaveError('EINVALID', 'terrain.bin: не PSMESH01');
  let o = 8;
  const metaLen = buf.readUInt32LE(o); o += 4;
  const metaStr = buf.toString('utf8', o, o + metaLen);
  const meta = JSON.parse(metaStr);
  o += metaLen;
  const blobsAt = o;
  const n = buf.readUInt32LE(o); o += 4;
  const blobs = [];
  for (let b = 0; b < n; b++) {
    const dtype = buf[o]; o += 1;
    const count = buf.readUInt32LE(o); o += 4;
    blobs.push({ dtype, count, offset: o });
    o += count * 4;
  }
  return { meta, metaStr, blobsAt, blobs };
}

function blobOf(layout, key) {
  const ref = layout.meta[key];
  if (!ref || typeof ref.$b !== 'number') throw new EditorSaveError('EINVALID', 'terrain.bin: нет ' + key);
  return layout.blobs[ref.$b];
}

const r2 = (v) => Math.round(v * 100) / 100;

function checkList(list, max, name) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new EditorSaveError('EINVALID', name + ': ожидается массив');
  const out = [];
  for (const it of list) {
    if (!Array.isArray(it) || it.length !== 2) throw new EditorSaveError('EINVALID', name + ': элемент [индекс, значение]');
    const i = it[0], v = it[1];
    if (!Number.isInteger(i) || i < 0 || i >= max) throw new EditorSaveError('EINVALID', name + ': индекс вне меша ' + i);
    if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > Y_LIMIT) throw new EditorSaveError('EINVALID', name + ': плохая высота ' + v);
    out.push([i, r2(v)]);
  }
  return out;
}

/** Число как в Python json.dumps (так записан terrain-data.js): целые float — с «.0». */
function pyFloat(v) {
  if (Object.is(v, -0)) return '-0.0';
  return Number.isInteger(v) ? v + '.0' : String(v);
}
const FLOAT_KEYS = new Set(['minX', 'maxX', 'minY', 'maxY', 'minZ', 'maxZ', 'positions', 'uvs', 'bakedHeights']);

function serializeTerrainJs(T) {
  const parts = Object.keys(T).map((k) => {
    const v = T[k];
    const f = FLOAT_KEYS.has(k) ? pyFloat : String;
    const s = Array.isArray(v) ? '[' + v.map(f).join(',') + ']' : (FLOAT_KEYS.has(k) ? pyFloat(v) : JSON.stringify(v));
    return JSON.stringify(k) + ':' + s;
  });
  return 'window.TerrainData = {' + parts.join(',') + '};';
}

function parseTerrainJs(src) {
  const vm = require('vm');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { timeout: 10000 });
  return sandbox.window.TerrainData;
}

/** Применить правки к буферу terrain.bin (копия). Возвращает новый буфер. */
function patchBin(buf, verts, baked) {
  const out = Buffer.from(buf);
  const L = parseLayout(out);
  const pos = blobOf(L, 'positions');
  const bh = L.meta.bakedHeights ? blobOf(L, 'bakedHeights') : null;
  const nV = (pos.count / 3) | 0;
  let minY = Infinity, maxY = -Infinity;
  for (const [vi, y] of verts) {
    if (vi >= nV) throw new EditorSaveError('EINVALID', 'вершина вне меша ' + vi);
    out.writeFloatLE(y, pos.offset + (vi * 3 + 1) * 4);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (bh) {
    for (const [i, h] of baked) {
      if (i >= bh.count) throw new EditorSaveError('EINVALID', 'ячейка bake вне сетки ' + i);
      out.writeFloatLE(h, bh.offset + i * 4);
    }
  }
  // Границы по Y расширяются, только если кисть вышла за них (иначе meta — байт в байт)
  const meta = L.meta;
  if ((verts.length && (minY < meta.minY || maxY > meta.maxY))) {
    if (minY < meta.minY) meta.minY = minY;
    if (maxY > meta.maxY) meta.maxY = maxY;
    const metaBuf = Buffer.from(JSON.stringify(meta), 'utf8');
    const head = Buffer.alloc(12);
    head.write(MAGIC, 0, 'latin1');
    head.writeUInt32LE(metaBuf.length, 8);
    return { buf: Buffer.concat([head, metaBuf, out.subarray(L.blobsAt)]), minY: meta.minY, maxY: meta.maxY };
  }
  return { buf: out, minY: meta.minY, maxY: meta.maxY };
}

function bumpVersions(root, ver, pairs) {
  const bump = (rel, re, repl) => {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) return;
    const s = fs.readFileSync(f, 'utf8');
    const n = s.replace(re, repl);
    if (n !== s) pairs.push([f, n]);
  };
  // force-cache у загрузчика + immutable-статика: без новой ?v= браузер покажет старый рельеф
  bump(path.join('client', 'js', 'mesh-bin-loader.js'), /data\/mesh\/terrain\.bin\?v=[^'"]*/g, 'data/mesh/terrain.bin?v=' + ver);
  bump(path.join('client', 'js', 'boot.module.js'), /js\/mesh-bin-loader\.js\?v=[^'"]*/g, 'js/mesh-bin-loader.js?v=' + ver);
  const cdir = path.join(root, 'client');
  if (fs.existsSync(cdir)) {
    for (const n of fs.readdirSync(cdir)) {
      if (/\.html$/i.test(n)) bump(path.join('client', n), /js\/boot\.module\.js\?v=[^'"]*/g, 'js/boot.module.js?v=' + ver);
    }
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function backupBeforeWrite(root) {
  const dir = backupDir(root);
  const cur = path.join(primaryRoot(root), BIN_REL);
  fs.mkdirSync(dir, { recursive: true });
  const orig = path.join(dir, 'terrain.original.bin');
  if (!fs.existsSync(orig)) fs.copyFileSync(cur, orig); // исходный меш — один раз и навсегда
  const snap = path.join(dir, 'terrain-' + stamp() + '.bin');
  fs.copyFileSync(cur, snap);
  const old = fs.readdirSync(dir).filter((n) => /^terrain-\d{8}-\d{6}\.bin$/.test(n)).sort();
  for (const n of old.slice(0, Math.max(0, old.length - BACKUP_KEEP))) {
    try { fs.unlinkSync(path.join(dir, n)); } catch (_) {}
  }
  return { original: orig, snapshot: snap };
}

/** Исходный рельеф (до первой правки кистью): бэкап, а если правок ещё не было — текущий файл. */
function readOriginalBin(root) {
  const orig = path.join(backupDir(root), 'terrain.original.bin');
  if (fs.existsSync(orig)) return fs.readFileSync(orig);
  return fs.readFileSync(path.join(primaryRoot(root), BIN_REL));
}

/**
 * Записать мазки кисти ландшафта.
 * @param {{verts?: Array<[number, number]>, baked?: Array<[number, number]>}} data
 * @param {{root?: string}} [opts]
 * @returns {{version: string, verts: number, baked: number, written: string[], backup: object}}
 */
function writeTerrainSculpt(data, opts) {
  const root = (opts && opts.root) || ROOT;
  const roots = targetRoots(root);
  const primBin = fs.readFileSync(path.join(primaryRoot(root), BIN_REL));
  const L0 = parseLayout(primBin);
  const nV = (blobOf(L0, 'positions').count / 3) | 0;
  const nB = L0.meta.bakedHeights ? blobOf(L0, 'bakedHeights').count : 0;
  const verts = checkList(data && data.verts, nV, 'verts');
  const baked = checkList(data && data.baked, nB, 'baked');
  if (!verts.length && !baked.length) throw new EditorSaveError('EINVALID', 'нет правок рельефа');

  const pairs = [];
  let version = null;
  for (const r of roots) {
    const binPath = path.join(r, BIN_REL);
    if (!fs.existsSync(binPath)) continue;
    const res = patchBin(fs.readFileSync(binPath), verts, baked);
    if (!version) version = 'sculpt-' + crypto.createHash('sha1').update(res.buf).digest('hex').slice(0, 10);
    pairs.push([binPath, res.buf]);
    const jsPath = path.join(r, JS_REL);
    if (fs.existsSync(jsPath)) {
      const T = parseTerrainJs(fs.readFileSync(jsPath, 'utf8'));
      if (!T || !Array.isArray(T.positions) || T.positions.length !== nV * 3) {
        throw new EditorSaveError('EINVALID', 'terrain-data.js не совпадает с terrain.bin (' + r + ')');
      }
      for (const [vi, y] of verts) T.positions[vi * 3 + 1] = y;
      if (Array.isArray(T.bakedHeights)) for (const [i, h] of baked) T.bakedHeights[i] = h;
      T.minY = res.minY; T.maxY = res.maxY;
      pairs.push([jsPath, serializeTerrainJs(T)]);
    }
  }
  if (!pairs.length) throw new EditorSaveError('EINVALID', 'terrain.bin не найден');
  for (const r of roots) bumpVersions(r, version, pairs);

  const backup = backupBeforeWrite(root);
  writeAtomicMany(pairs);
  return {
    version,
    verts: verts.length,
    baked: baked.length,
    written: pairs.map((p) => path.relative(primaryRoot(root), p[0]).replace(/\\/g, '/')),
    backup: { original: path.relative(primaryRoot(root), backup.original), snapshot: path.relative(primaryRoot(root), backup.snapshot) }
  };
}

module.exports = {
  writeTerrainSculpt,
  readOriginalBin,
  targetRoots,
  parseLayout,
  serializeTerrainJs,
  pyFloat
};
