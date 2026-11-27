// ============================================================
//  SERVER / EDITOR-OVERRIDES-WRITER.JS
//  Единый модуль записи данных редактора сцены.
//  H7 (этап 4.4): данные пишутся ТОЛЬКО как JSON — shared/editor-overrides.json (сервер) и
//  client/data/editor-overrides.json (клиент). Исполняемый client/js/editor-overrides-data.js
//  больше не генерируется: это статический загрузчик, который fetch-ит JSON.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const CLIENT = path.join(ROOT, 'client');
const OVERRIDES_JSON_PATH = path.join(SHARED, 'editor-overrides.json');
const CLIENT_DATA_PATH = path.join(CLIENT, 'data', 'editor-overrides.json');

const DIST_CLIENT = path.join(ROOT, 'dist', 'client');
// Релизная сборка несёт только запечённый мир, рабочего файла редактора там нет
const DIST_CLIENT_DATA_PATH = path.join(DIST_CLIENT, 'data', 'editor-overrides.json');

// ------------------------------------------------------------
//  Схема и политика записи (аудит редактора, этап 2)
//  - whitelist ключей и типов: мусор/прототипные ключи не попадают в исполняемый JS;
//  - ревизия rev + оптимистическая блокировка (baseRev): устаревшая вкладка не затирает новые правки;
//  - отсутствующие в payload ключи сохраняются с диска (раньше файл заменялся целиком);
//  - weaponGrips сливаются по ключам (раньше частичный экспорт стирал хваты на диске);
//  - защита от «вайпа» для всех массивов мира, а не только customProps;
//  - атомарная запись (tmp + rename) и ротация N бэкапов с меткой времени.
// ------------------------------------------------------------
const crypto = require('crypto');
const BACKUP_DIR = path.join(SHARED, 'editor-overrides.backups');
const BACKUP_KEEP = Math.max(3, parseInt(process.env.EDITOR_BACKUP_KEEP || '30', 10));

/**
 * Дев-сборка (builds/dev/<версия>, BUILD-INFO kind=dev) — это запуск редактора над проектом.
 * Её сохранения (сцена, покраска) пишутся и в исходники проекта: иначе правки оставались в папке
 * сборки и пропадали со следующей сборкой. Корень проекта или null.
 */
function devSourceRoot() {
  try {
    const info = JSON.parse(fs.readFileSync(path.join(ROOT, 'BUILD-INFO.json'), 'utf8'));
    const src = path.resolve(ROOT, '..', '..', '..');
    if (info && info.kind === 'dev' && src !== ROOT &&
      fs.existsSync(path.join(src, 'scripts', 'build-local.js')) && fs.existsSync(path.join(src, 'shared'))) return src;
  } catch (_) { /* не дев-сборка */ }
  return null;
}

const SCHEMA = {
  deletedNpcIds: 'array', deletedMobSpotIdxs: 'array', deletedWorldKeys: 'array', deletedMeshIds: 'array',
  cityNpcs: 'array', regionNpcs: 'array', mobSpots: 'array', huntZones: 'array', deletedHuntZoneIds: 'array',
  playerSpawn: 'object|null', customProps: 'array', bspBrushes: 'array', buildSites: 'array',
  deletedBuildSiteIds: 'array', groundMarks: 'array', deletedGroundMarkIds: 'array',
  weaponGrips: 'object', windSettings: 'object'
};
// Массивы, опустошение которых требует явного allowWipe
const WIPE_GUARDED = ['customProps', 'huntZones', 'cityNpcs', 'regionNpcs', 'buildSites', 'deletedMeshIds', 'deletedWorldKeys'];
const META_KEYS = new Set(['savedAt', 'rev', 'hash', 'allowWipe', 'baseRev', 'clientId']);

class EditorSaveError extends Error {
  constructor(code, message, extra) { super(message); this.code = code; Object.assign(this, extra || {}); }
}

function typeOk(v, t) {
  if (t === 'array') return Array.isArray(v);
  if (t === 'object') return !!v && typeof v === 'object' && !Array.isArray(v);
  if (t === 'object|null') return v === null || (!!v && typeof v === 'object' && !Array.isArray(v));
  return false;
}

function hasProtoKeys(v, depth) {
  if (!v || typeof v !== 'object' || depth > 12) return false;
  for (const k of Object.keys(v)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    if (v[k] && typeof v[k] === 'object' && hasProtoKeys(v[k], depth + 1)) return true;
  }
  return false;
}

function readCurrent() {
  if (!fs.existsSync(OVERRIDES_JSON_PATH)) return { raw: '', data: {} };
  const raw = fs.readFileSync(OVERRIDES_JSON_PATH, 'utf8');
  try { return { raw, data: JSON.parse(raw) || {} }; }
  catch (e) { throw new EditorSaveError('ECORRUPT', 'editor-overrides.json повреждён: ' + e.message); }
}

function currentRev() {
  try { const d = readCurrent().data; return (d && (d.rev | 0)) || 0; } catch (_) { return 0; }
}

let _tmpSeq = 0;
function tmpName(file) { return file + '.tmp-' + process.pid + '-' + Date.now() + '-' + (++_tmpSeq); }

/** Записать во временный файл рядом (fsync), вернуть его имя. Строка — utf8, Buffer — как есть. */
function writeTmp(file, content) {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = tmpName(file);
  const fd = fs.openSync(tmp, 'w');
  try {
    if (Buffer.isBuffer(content)) fs.writeSync(fd, content, 0, content.length, null);
    else fs.writeSync(fd, String(content), null, 'utf8');
    try { fs.fsyncSync(fd); } catch (_) {}
  } catch (e) {
    try { fs.closeSync(fd); } catch (_) {}
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw e;
  }
  fs.closeSync(fd);
  return tmp;
}

function writeAtomic(file, content) {
  fs.renameSync(writeTmp(file, content), file);
}

/**
 * Атомарно записать несколько файлов: сначала все во временные, затем rename.
 * Если запись любого временного файла не удалась — ни один целевой файл не тронут.
 * @param {Array<[string, string|Buffer]>} pairs
 */
function writeAtomicMany(pairs) {
  const done = [];
  try {
    for (const [file, content] of pairs) done.push([writeTmp(file, content), file]);
  } catch (e) {
    for (const [tmp] of done) { try { fs.unlinkSync(tmp); } catch (_) {} }
    throw e;
  }
  for (const [tmp, file] of done) fs.renameSync(tmp, file);
}

/** Копия JSON для клиента, если её нет или она старее серверной (миграция с editor-overrides-data.js). */
function ensureClientData() {
  // Выделенный прод-сервер (SERVE_CLIENT=0) клиент не раздаёт и не хранит: зеркало для
  // статики не нужно (и писать в client/data процессу там нельзя).
  if (process.env.SERVE_CLIENT === '0') return false;
  try {
    if (!fs.existsSync(OVERRIDES_JSON_PATH) || !fs.existsSync(CLIENT)) return false;
    const raw = fs.readFileSync(OVERRIDES_JSON_PATH, 'utf8');
    const srv = JSON.parse(raw);
    const targets = [CLIENT_DATA_PATH];
    let wrote = false;
    for (const t of targets) {
      let cur = null;
      try { cur = JSON.parse(fs.readFileSync(t, 'utf8')); } catch (_) { cur = null; }
      if (!cur || (cur.rev | 0) < (srv.rev | 0) || ((cur.rev | 0) === (srv.rev | 0) && (cur.savedAt || 0) < (srv.savedAt || 0))) {
        writeAtomic(t, raw);
        wrote = true;
      }
    }
    if (wrote) console.log('[editor-overrides-writer] client/data/editor-overrides.json обновлён из shared (rev ' + (srv.rev | 0) + ')');
    return wrote;
  } catch (e) {
    console.warn('[editor-overrides-writer] ensureClientData:', e && e.message);
    return false;
  }
}


function rotateBackup(raw, rev) {
  if (!raw) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeAtomic(path.join(BACKUP_DIR, 'editor-overrides.r' + (rev | 0) + '.' + stamp + '.json'), raw);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^editor-overrides\..*\.json$/.test(f)).sort();
    while (files.length > BACKUP_KEEP) {
      const f = files.shift();
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch (_) {}
    }
    // совместимость: последний бэкап по старому пути
    writeAtomic(path.join(SHARED, 'editor-overrides.backup.json'), raw);
  } catch (e) {
    throw new EditorSaveError('EBACKUP', 'Не удалось создать бэкап перед записью: ' + e.message);
  }
}

/**
 * Проверить и собрать итоговые данные без записи на диск.
 * @param {object} data payload редактора
 * @param {{baseRev?: number}} opts
 */
function prepareEditorOverrides(data, opts) {
  opts = opts || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new EditorSaveError('EINVALID', 'invalid overrides payload');
  if (hasProtoKeys(data, 0)) throw new EditorSaveError('EINVALID', 'forbidden keys in payload');
  const unknown = Object.keys(data).filter(k => !META_KEYS.has(k) && !SCHEMA[k]);
  for (const k of Object.keys(SCHEMA)) {
    if (data[k] !== undefined && !typeOk(data[k], SCHEMA[k])) throw new EditorSaveError('EINVALID', 'bad type for ' + k);
  }
  const cur = readCurrent();
  const curData = cur.data || {};
  const curRev = (curData.rev | 0) || 0;
  const baseRev = opts.baseRev != null ? opts.baseRev : data.baseRev;
  if (baseRev != null && Number.isFinite(+baseRev) && (+baseRev | 0) !== curRev) {
    throw new EditorSaveError('ECONFLICT', 'Файл сцены изменён в другом месте (rev ' + curRev + ', у вас ' + (+baseRev | 0) + ')', { currentRev: curRev });
  }
  const allowWipe = data.allowWipe === true;
  if (!allowWipe) {
    for (const k of WIPE_GUARDED) {
      const was = Array.isArray(curData[k]) ? curData[k].length : 0;
      const now = Array.isArray(data[k]) ? data[k].length : null;
      if (now === null) continue; // ключ не прислан — сохранится с диска
      if (was >= 20 && now === 0) {
        throw new EditorSaveError('EWIPE', `Отказ: попытка стереть ${k} (${was} → 0) без allowWipe`);
      }
      if (was >= 100 && now < was * 0.5) {
        throw new EditorSaveError('EWIPE', `Отказ: ${k} уменьшается более чем вдвое (${was} → ${now}) без allowWipe`);
      }
    }
  }
  // Сборка: известные ключи из payload, отсутствующие — с диска; неизвестные ключи с диска не теряем,
  // но из payload не принимаем (кроме уже существовавших на диске).
  const out = {};
  for (const k of Object.keys(curData)) if (!META_KEYS.has(k)) out[k] = curData[k];
  for (const k of Object.keys(SCHEMA)) if (data[k] !== undefined) out[k] = data[k];
  for (const k of unknown) if (Object.prototype.hasOwnProperty.call(curData, k)) out[k] = data[k];
  // weaponGrips: слияние по ключам (payload побеждает); удаление — явным null в значении
  if (data.weaponGrips && typeof data.weaponGrips === 'object') {
    const merged = Object.assign({}, (curData.weaponGrips && typeof curData.weaponGrips === 'object') ? curData.weaponGrips : {});
    for (const [gk, gv] of Object.entries(data.weaponGrips)) {
      if (gv === null) delete merged[gk]; else if (gv && typeof gv === 'object') merged[gk] = gv;
    }
    out.weaponGrips = merged;
  }
  const body = JSON.stringify(Object.assign({}, out, { rev: 0, savedAt: 0 }));
  out.rev = curRev + 1;
  out.savedAt = Date.now(); // раньше брался из payload → в файл попадала устаревшая метка
  out.hash = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  if (unknown.length) console.warn('[editor-overrides-writer] игнорирую неизвестные ключи:', unknown.slice(0, 10).join(','));
  return { cleanData: out, currentRaw: cur.raw, currentRev: curRev };
}

let _writing = false;
function writeEditorOverridesFiles(data, opts) {
  // Защита от реентерабельности (синхронный код, но на всякий случай для будущих async-вызовов)
  if (_writing) throw new EditorSaveError('EBUSY', 'запись уже выполняется');
  _writing = true;
  try {
    const { cleanData, currentRaw, currentRev } = prepareEditorOverrides(data, opts);
    rotateBackup(currentRaw, currentRev);
    const json = JSON.stringify(cleanData, null, 2);
    // H7: только данные (JSON), без генерации исполняемого JS. Сервер и клиент — одной транзакцией.
    const pairs = [[OVERRIDES_JSON_PATH, json], [CLIENT_DATA_PATH, json]];
    const src = devSourceRoot();
    if (src) {
      const srcJson = path.join(src, 'shared', 'editor-overrides.json');
      // прежний файл проекта — в его папку бэкапов (как у обычного сохранения)
      try {
        const prev = fs.existsSync(srcJson) ? fs.readFileSync(srcJson, 'utf8') : '';
        if (prev && prev !== json) {
          const dir = path.join(src, 'shared', 'editor-overrides.backups');
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          let prevRev = 0; try { prevRev = JSON.parse(prev).rev | 0; } catch (_) {}
          writeAtomic(path.join(dir, 'editor-overrides.r' + prevRev + '.' + stamp + '.json'), prev);
        }
      } catch (e) { console.warn('[editor-overrides-writer] бэкап сцены проекта:', e && e.message); }
      pairs.push([srcJson, json], [path.join(src, 'client', 'data', 'editor-overrides.json'), json]);
    }
    writeAtomicMany(pairs);
    // Сохранение пишет только исходник сцены; мир собирается отдельным шагом
    // «Запечь мир» (редактор / node scripts/bake-world.js), сборка клиента и деплой запекают сами.
    return cleanData;
  } finally {
    _writing = false;
  }
}

// ------------------------------------------------------------
//  E13: PNG-карты покраски террейна — проверка и атомарная запись.
// ------------------------------------------------------------
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TERRAIN_PNG_MAX = 16 * 1024 * 1024;

/** dataURL/base64 → Buffer PNG; бросает EditorSaveError('EINVALID') если это не PNG. */
function decodePngDataUrl(v, name) {
  if (typeof v !== 'string') throw new EditorSaveError('EINVALID', name + ': ожидается строка base64');
  const b64 = v.replace(/^data:image\/png;base64,/, '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new EditorSaveError('EINVALID', name + ': не base64 PNG');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 64 || !buf.subarray(0, 8).equals(PNG_SIG)) throw new EditorSaveError('EINVALID', name + ': не PNG');
  if (buf.length > TERRAIN_PNG_MAX) throw new EditorSaveError('EINVALID', name + ': слишком большой файл');
  return buf;
}

// ------------------------------------------------------------
//  PNG без canvas. Карта покраски — веса 4 слоёв в RGBA, альфа = вес 4-го слоя (песок).
//  Canvas 2D хранит цвет умноженным на альфу: при альфе 0 (а это все дороги из одной
//  брусчатки) RGB обнуляется. Сохранение через putImageData → toDataURL стирало дороги
//  (2026-11-27: 4380 закрашенных пикселей → 38, уцелели ровно пиксели с песком).
//  Поэтому редактор шлёт сырые байты, а PNG собирается здесь через zlib.
// ------------------------------------------------------------
const zlib = require('zlib');
const PAINT_SIZE_MIN = 64;
const PAINT_SIZE_MAX = 4096;
const PAINT_WIPE_MIN = 200;     // ниже этого числа закрашенных пикселей защита не срабатывает
const PAINT_WIPE_KEEP = 0.5;    // сохранение не может потерять больше половины закрашенного

let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      _crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** RGBA 8 бит → PNG (тип цвета 6, фильтр 0, zlib). Ни один байт не теряется. */
function encodePngRgba(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([PNG_SIG, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** PNG (8 бит, RGBA или RGB, без интерлейса) → { width, height, data: RGBA }; иначе null. */
function decodePngRgba(buf) {
  try {
    if (!buf || buf.length < 33 || !buf.subarray(0, 8).equals(PNG_SIG)) return null;
    let off = 8, width = 0, height = 0, depth = 0, ctype = 0, inter = 0;
    const idat = [];
    while (off + 8 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString('ascii', off + 4, off + 8);
      const data = buf.subarray(off + 8, off + 8 + len);
      if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; inter = data[12]; }
      else if (type === 'IDAT') idat.push(data);
      else if (type === 'IEND') break;
      off += 12 + len;
    }
    if (depth !== 8 || inter !== 0 || (ctype !== 6 && ctype !== 2) || !width || !height) return null;
    const bpp = ctype === 6 ? 4 : 3;
    const stride = width * bpp;
    const raw = zlib.inflateSync(Buffer.concat(idat));
    if (raw.length < (stride + 1) * height) return null;
    const px = Buffer.alloc(stride * height);
    for (let y = 0; y < height; y++) {
      const f = raw[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const dst = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[dst + x - bpp] : 0;
        const b = y > 0 ? px[dst - stride + x] : 0;
        const c = (x >= bpp && y > 0) ? px[dst - stride + x - bpp] : 0;
        let v = raw[src + x];
        if (f === 1) v += a;
        else if (f === 2) v += b;
        else if (f === 3) v += (a + b) >> 1;
        else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
        px[dst + x] = v & 0xFF;
      }
    }
    if (bpp === 4) return { width, height, data: px };
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) { rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255; }
    return { width, height, data: rgba };
  } catch (_) {
    return null;
  }
}

/** Сколько пикселей карты весов закрашено хоть одним слоем. */
function paintedPixels(rgba) {
  let n = 0;
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] | rgba[i + 1] | rgba[i + 2] | rgba[i + 3]) n++;
  return n;
}

/** Сырые байты слоя из запроса: base64 RGBA (enc 'raw') или gzip от них (enc 'gzip'). */
function decodeRawPaint(b64, enc, size, name) {
  if (typeof b64 !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new EditorSaveError('EINVALID', name + ': ожидается base64');
  const need = size * size * 4;
  let buf = Buffer.from(b64, 'base64');
  if (enc === 'gzip') {
    try { buf = zlib.gunzipSync(buf, { maxOutputLength: need + 16 }); } catch (e) { throw new EditorSaveError('EINVALID', name + ': gzip не распакован'); }
  } else if (enc && enc !== 'raw') {
    throw new EditorSaveError('EINVALID', name + ': неизвестное сжатие ' + enc);
  }
  if (buf.length !== need) throw new EditorSaveError('EINVALID', name + ': размер ' + buf.length + ' вместо ' + need);
  return buf;
}

/**
 * Сохранить карты покраски: все файлы (client/data + shared, оба слоя) пишутся во временные,
 * затем переименовываются — при ошибке старые карты не повреждаются и не перемешиваются.
 * Формат запроса: { paintSize, enc: 'gzip'|'raw', layer1Rgba, layer2Rgba } (без потерь)
 * или прежний { layer1, layer2 } с PNG в base64.
 * Защита: сохранение, которое теряет больше половины закрашенных пикселей слоя весов,
 * отклоняется (EWIPE), если в запросе нет allowWipe: true (явная очистка слоя в редакторе).
 * @param {{noMirror?: boolean}} [opts] noMirror — только clientDir/sharedDir (для тестов)
 * @returns {{written: string[], painted: number|null, before: number|null}}
 */
function writeTerrainPaint(data, clientDir, sharedDir, opts) {
  opts = opts || {};
  const layers = [['layer1', 'terrain-paint-1.png'], ['layer2', 'terrain-paint-2.png']];
  const pairs = [];
  const rootDataDir = path.join(ROOT, 'data');
  const distDataDir = path.join(DIST_CLIENT, 'data');
  const sDir = sharedDir || SHARED;
  let painted = null, before = null;
  for (const [key, fname] of layers) {
    if (!data) continue;
    let buf = null;
    let rgba = null;
    if (data[key + 'Rgba']) {
      const size = data.paintSize | 0;
      if (size < PAINT_SIZE_MIN || size > PAINT_SIZE_MAX) throw new EditorSaveError('EINVALID', 'paintSize вне ' + PAINT_SIZE_MIN + '..' + PAINT_SIZE_MAX);
      rgba = decodeRawPaint(data[key + 'Rgba'], data.enc, size, key);
      buf = encodePngRgba(size, size, rgba);
    } else if (data[key]) {
      buf = decodePngDataUrl(data[key], key);
    } else {
      continue;
    }
    if (key === 'layer1') {
      const next = rgba ? { data: rgba } : decodePngRgba(buf);
      const curFile = path.join(sDir, fname);
      const cur = fs.existsSync(curFile) ? decodePngRgba(fs.readFileSync(curFile)) : null;
      painted = next ? paintedPixels(next.data) : null;
      before = cur ? paintedPixels(cur.data) : null;
      if (data.allowWipe !== true && painted != null && before != null && before >= PAINT_WIPE_MIN && painted < before * PAINT_WIPE_KEEP) {
        throw new EditorSaveError('EWIPE', 'Отказ: покраска террейна теряет ' + (before - painted) + ' из ' + before +
          ' закрашенных пикселей. Если это очистка слоя — сохраните с allowWipe.', { before, painted });
      }
    }
    pairs.push([path.join(clientDir || CLIENT, 'data', fname), buf]);
    pairs.push([path.join(sDir, fname), buf]);
    if (opts.noMirror) continue;
    if (fs.existsSync(rootDataDir)) pairs.push([path.join(rootDataDir, fname), buf]);
    if (fs.existsSync(distDataDir)) pairs.push([path.join(distDataDir, fname), buf]);
    const src = devSourceRoot(); // дев-сборка → и в проект
    if (src) {
      pairs.push([path.join(src, 'client', 'data', fname), buf], [path.join(src, 'shared', fname), buf]);
      if (fs.existsSync(path.join(src, 'data', fname))) pairs.push([path.join(src, 'data', fname), buf]);
    }
  }
  if (!pairs.length) throw new EditorSaveError('EINVALID', 'нет layer1/layer2');
  writeAtomicMany(pairs);
  return { written: pairs.map(p => path.basename(path.dirname(p[0])) + '/' + path.basename(p[0])), painted, before };
}

ensureClientData();

module.exports = {
  OVERRIDES_JSON_PATH,
  CLIENT_DATA_PATH,
  DIST_CLIENT_DATA_PATH,
  ensureClientData,
  writeAtomic,
  writeAtomicMany,
  decodePngDataUrl,
  encodePngRgba,
  decodePngRgba,
  paintedPixels,
  writeTerrainPaint,
  devSourceRoot,
  prepareEditorOverrides,
  writeEditorOverridesFiles,
  currentRev,
  EditorSaveError
};
