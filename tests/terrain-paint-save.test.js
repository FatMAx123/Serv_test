'use strict';
// Покраска террейна не теряет дороги при сохранении из редактора.
// 2026-11-27: сохранение через canvas (putImageData → toDataURL) обнуляло RGB у пикселей
// с нулевой альфой (альфа = вес 4-го слоя), и дороги из одной брусчатки пропали: 4380 → 38.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));

function mapWithRoads(size, roads, sand) {
  const a = new Uint8Array(size * size * 4);
  for (let i = 0; i < roads; i++) { const p = (i * 7 % (size * size)) * 4; a[p] = 90; }        // брусчатка, альфа 0
  for (let i = 0; i < sand; i++) { const p = ((i * 13 + 5) % (size * size)) * 4; a[p + 3] = 120; } // песок
  return a;
}

module.exports = function (t) {
  const S = 64;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-paint-'));
  const clientDir = path.join(tmp, 'client');
  const sharedDir = path.join(tmp, 'shared');
  fs.mkdirSync(path.join(clientDir, 'data'), { recursive: true });
  fs.mkdirSync(sharedDir, { recursive: true });
  const write = (body) => W.writeTerrainPaint(body, clientDir, sharedDir, { noMirror: true });
  const painted = () => W.paintedPixels(W.decodePngRgba(fs.readFileSync(path.join(sharedDir, 'terrain-paint-1.png'))).data);

  try {
    t.suite('terrain-paint: PNG без потерь (альфа 0 не стирает цвет)');
    const roads = mapWithRoads(S, 600, 10);
    const png = W.encodePngRgba(S, S, roads);
    const back = W.decodePngRgba(png);
    t.ok(back && back.width === S && back.height === S, 'PNG читается обратно, размер ' + S);
    t.ok(Buffer.compare(Buffer.from(roads), back.data) === 0, 'все байты на месте, в том числе у пикселей с альфой 0');
    t.eq(W.paintedPixels(back.data), W.paintedPixels(roads), 'закрашенных пикселей столько же');

    t.suite('terrain-paint: сохранение сырых карт из редактора');
    let out = write({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.from(roads).toString('base64'), layer2Rgba: Buffer.from(roads).toString('base64') });
    t.eq(painted(), W.paintedPixels(roads), 'дороги с альфой 0 сохранились');
    t.ok(fs.existsSync(path.join(clientDir, 'data', 'terrain-paint-1.png')), 'копия клиента записана');
    t.eq(out.painted, W.paintedPixels(roads), 'сервер сообщает число закрашенных пикселей');

    const gz = zlib.gzipSync(Buffer.from(roads)).toString('base64');
    out = write({ paintSize: S, enc: 'gzip', layer1Rgba: gz });
    t.eq(painted(), W.paintedPixels(roads), 'gzip-формат принимается без потерь');

    t.suite('terrain-paint: защита от стирания (EWIPE)');
    const wiped = new Uint8Array(roads);
    for (let i = 0; i < wiped.length; i += 4) if (!wiped[i + 3]) { wiped[i] = wiped[i + 1] = wiped[i + 2] = 0; }   // как после canvas
    let err = null;
    try { write({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.from(wiped).toString('base64') }); } catch (e) { err = e; }
    t.ok(err && err.code === 'EWIPE', 'карта, потерявшая почти все дороги, отклонена');
    t.ok(err && err.before === W.paintedPixels(roads) && err.painted === W.paintedPixels(wiped), 'в отказе — было и стало');
    t.eq(painted(), W.paintedPixels(roads), 'после отказа файл на диске не тронут');

    err = null;
    try { write({ layer1: 'data:image/png;base64,' + W.encodePngRgba(S, S, wiped).toString('base64') }); } catch (e) { err = e; }
    t.ok(err && err.code === 'EWIPE', 'старый формат (PNG из canvas) тоже проверяется');

    write({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.from(wiped).toString('base64'), allowWipe: true });
    t.eq(painted(), W.paintedPixels(wiped), 'явная очистка слоя (allowWipe) проходит');

    const small = mapWithRoads(S, 120, 0);
    write({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.from(small).toString('base64'), allowWipe: true });
    write({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.from(new Uint8Array(S * S * 4)).toString('base64') });
    t.eq(painted(), 0, 'маленькую карту (меньше 200 пикселей) можно стереть без флага');

    t.suite('terrain-paint: неверные данные');
    const bad = (body, what) => { let e = null; try { write(body); } catch (x) { e = x; } t.ok(e && e.code === 'EINVALID', what); };
    bad({ paintSize: S, enc: 'raw', layer1Rgba: Buffer.alloc(10).toString('base64') }, 'неверный размер отклонён');
    bad({ paintSize: 8, enc: 'raw', layer1Rgba: Buffer.alloc(256).toString('base64') }, 'слишком маленькая карта отклонена');
    bad({ paintSize: S, enc: 'lz4', layer1Rgba: gz }, 'неизвестное сжатие отклонено');
    bad({ paintSize: S, enc: 'gzip', layer1Rgba: Buffer.from('not gzip').toString('base64') }, 'битый gzip отклонён');

    t.suite('terrain-paint: редактор не собирает PNG через canvas');
    const src = fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain.js'), 'utf8');
    const save = src.slice(src.indexOf('function savePaintDataToServer'), src.indexOf('async function decodePngRaw'));
    t.ok(save.length > 200, 'функция сохранения найдена');
    t.ok(!/toDataURL|putImageData/.test(save), 'нет putImageData/toDataURL в сохранении');
    t.ok(/layer1Rgba/.test(save) && /paintSize/.test(save), 'шлёт сырые байты (layer1Rgba, paintSize)');
    t.ok(/paintLoadLossy\s*=\s*true/.test(src), 'карта, загруженная через canvas, помечается как ущербная');
    t.ok(/savePaintDataToServer\(true, true\)/.test(src), 'очистка слоя сохраняется с allowWipe');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};
