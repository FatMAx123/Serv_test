// ============================================================
//  TESTS / TERRAIN-SCULPT.TEST.JS — запись кисти ландшафта редактора.
//  server/terrain-sculpt-writer.js патчит terrain.bin + terrain-data.js на месте:
//  меняются только присланные Y, остальные байты те же, дамп — того же формата,
//  исходник один раз уходит в бэкап, версии кэша поднимаются, сервер ходит по новому
//  рельефу. Всё — на временной копии, рабочие файлы проекта не трогаются.
// ============================================================
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MeshBin = require(path.join(ROOT, 'client', 'js', 'mesh-bin.js'));
const W = require(path.join(ROOT, 'server', 'terrain-sculpt-writer.js'));

function freshRequire(p) {
  const id = require.resolve(p);
  const saved = require.cache[id];
  delete require.cache[id];
  const mod = require(id);
  if (saved) require.cache[id] = saved; else delete require.cache[id];
  return mod;
}

module.exports = function (t) {
  t.suite('terrain-sculpt: формат дампа terrain-data.js');
  const jsSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8');
  const win = {};
  new Function('window', jsSrc)(win);
  t.ok(W.serializeTerrainJs(win.TerrainData) === jsSrc, 'сериализация без правок совпадает с файлом байт в байт');
  t.eq([W.pyFloat(1831), W.pyFloat(-0), W.pyFloat(-308.55)], ['1831.0', '-0.0', '-308.55'], 'числа как в Python json.dumps');

  // временная копия проекта
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-sculpt-'));
  const copy = (rel) => {
    fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), path.join(tmp, rel));
  };
  ['client/data/mesh/terrain.bin', 'client/js/terrain-data.js', 'client/js/mesh-bin-loader.js', 'client/js/boot.module.js', 'client/game.html'].forEach(copy);
  const binRel = path.join('client', 'data', 'mesh', 'terrain.bin');
  const orig = fs.readFileSync(path.join(tmp, binRel));
  const D0 = MeshBin.decode(orig.buffer.slice(orig.byteOffset, orig.byteOffset + orig.byteLength));

  // вершина суши поближе к центру острова
  let vi = -1;
  for (let v = 0; v < D0.positions.length / 3; v++) {
    const y = D0.positions[v * 3 + 1];
    if (y > 5 && y < 60 && Math.abs(D0.positions[v * 3]) < 600 && Math.abs(D0.positions[v * 3 + 2]) < 600) { vi = v; break; }
  }
  t.ok(vi >= 0, 'нашлась вершина суши');
  const vx = D0.positions[vi * 3], vz = D0.positions[vi * 3 + 2], vy = D0.positions[vi * 3 + 1];
  const newY = vy + 3.004;
  const bi = 128 * 256 + 128;

  try {
    t.suite('terrain-sculpt: запись terrain.bin + terrain-data.js');
    const out = W.writeTerrainSculpt({ verts: [[vi, newY]], baked: [[bi, D0.bakedHeights[bi] + 1]] }, { root: tmp });
    t.ok(/^sculpt-[0-9a-f]{10}$/.test(out.version), 'версия из хэша меша', out.version);
    t.eq([out.verts, out.baked], [1, 1], 'одна вершина и одна ячейка bake');
    const nb = fs.readFileSync(path.join(tmp, binRel));
    const D1 = MeshBin.decode(nb.buffer.slice(nb.byteOffset, nb.byteOffset + nb.byteLength));
    t.eq(D1.positions[vi * 3 + 1], Math.fround(Math.round(newY * 100) / 100), 'Y вершины записан (2 знака, как в дампе)');
    t.eq(D1.positions[vi * 3], D0.positions[vi * 3], 'X не тронут');
    let diffBytes = 0;
    for (let i = 0; i < nb.length; i++) if (nb[i] !== orig[i]) diffBytes++;
    t.ok(nb.length === orig.length && diffBytes <= 8, 'остальные байты terrain.bin те же', 'отличий ' + diffBytes);
    const w2 = {};
    new Function('window', fs.readFileSync(path.join(tmp, 'client', 'js', 'terrain-data.js'), 'utf8'))(w2);
    let md = 0;
    for (let i = 0; i < D1.positions.length; i++) md = Math.max(md, Math.abs(D1.positions[i] - w2.TerrainData.positions[i]));
    for (let i = 0; i < D1.bakedHeights.length; i++) md = Math.max(md, Math.abs(D1.bakedHeights[i] - w2.TerrainData.bakedHeights[i]));
    t.ok(md < 1e-4, 'дамп terrain-data.js = terrain.bin', 'max diff ' + md);

    t.suite('terrain-sculpt: версии кэша и бэкап');
    const rd = (rel) => fs.readFileSync(path.join(tmp, rel), 'utf8');
    t.ok(rd('client/js/mesh-bin-loader.js').indexOf('data/mesh/terrain.bin?v=' + out.version) >= 0, 'mesh-bin-loader: terrain.bin?v= поднят');
    t.ok(rd('client/js/boot.module.js').indexOf('js/mesh-bin-loader.js?v=' + out.version) >= 0, 'boot.module: mesh-bin-loader.js?v= поднят');
    t.ok(rd('client/game.html').indexOf('js/boot.module.js?v=' + out.version) >= 0, 'game.html: boot.module.js?v= поднят');
    const bdir = path.join(tmp, 'data', 'terrain-backups');
    t.ok(fs.readFileSync(path.join(bdir, 'terrain.original.bin')).equals(orig), 'исходный меш в бэкапе');
    W.writeTerrainSculpt({ verts: [[vi, vy]] }, { root: tmp });
    t.ok(W.readOriginalBin(tmp).equals(orig), 'второе сохранение не перезаписывает исходник');
    t.ok(fs.readdirSync(bdir).some((n) => /^terrain-\d{8}-\d{6}\.bin$/.test(n)), 'копия перед записью');

    t.suite('terrain-sculpt: проверка ввода');
    t.throws(() => W.writeTerrainSculpt({ verts: [[D0.positions.length, 1]] }, { root: tmp }), 'вершина вне меша → отказ');
    t.throws(() => W.writeTerrainSculpt({ verts: [[vi, NaN]] }, { root: tmp }), 'NaN → отказ');
    t.throws(() => W.writeTerrainSculpt({ verts: [[vi, 1e6]] }, { root: tmp }), 'высота за пределом → отказ');
    t.throws(() => W.writeTerrainSculpt({ verts: [] }, { root: tmp }), 'пустой мазок → отказ');

    t.suite('terrain-sculpt: сервер ходит по новому рельефу (GEO)');
    W.writeTerrainSculpt({ verts: [[vi, newY]] }, { root: tmp });
    const nb2 = fs.readFileSync(path.join(tmp, binRel));
    const D2 = MeshBin.decode(nb2.buffer.slice(nb2.byteOffset, nb2.byteOffset + nb2.byteLength));
    const g = globalThis;
    const savedTD = g.TerrainData, savedTH = g.TerrainHeight;
    try {
      g.TerrainData = D0;
      const TH0 = freshRequire(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
      const GEO0 = freshRequire(path.join(ROOT, 'shared', 'geo.js'));
      GEO0.bind({ TerrainData: D0, TerrainHeight: TH0 });
      const before = GEO0.groundY(vx, vz);
      g.TerrainData = D2;
      const TH = freshRequire(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
      const GEO = freshRequire(path.join(ROOT, 'shared', 'geo.js'));
      GEO.bind({ TerrainData: D2, TerrainHeight: TH });
      const after = GEO.groundY(vx, vz);
      t.near(after - before, 3.0, 0.02, 'GEO.groundY в вершине поднялся на 3 м');
      const mv = GEO.moveAlong(vx - 12, vz, vx, vz);
      t.ok(!mv.blocked && Math.abs(mv.x - vx) < 1e-6, 'GEO.moveAlong доходит до поднятой точки');
      t.near(mv.y, GEO.standY(vx, vz), 0.05, 'Y после moveAlong — новый рельеф');
    } finally {
      g.TerrainData = savedTD;
      g.TerrainHeight = savedTH;
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
