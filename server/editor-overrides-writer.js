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
  try {
    if (!fs.existsSync(OVERRIDES_JSON_PATH) || !fs.existsSync(CLIENT)) return false;
    const raw = fs.readFileSync(OVERRIDES_JSON_PATH, 'utf8');
    const srv = JSON.parse(raw);
    const targets = [CLIENT_DATA_PATH].concat(fs.existsSync(DIST_CLIENT) ? [DIST_CLIENT_DATA_PATH] : []);
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
    writeAtomicMany([[OVERRIDES_JSON_PATH, json], [CLIENT_DATA_PATH, json]]);
    try {
      if (fs.existsSync(DIST_CLIENT)) writeAtomic(DIST_CLIENT_DATA_PATH, json);
    } catch (eDist) {
      console.warn('[editor-overrides-writer] dist/client write warning:', eDist.message);
    }
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

/**
 * Сохранить карты покраски: все файлы (client/data + shared, оба слоя) пишутся во временные,
 * затем переименовываются — при ошибке старые карты не повреждаются и не перемешиваются.
 * @returns {{written: string[]}}
 */
function writeTerrainPaint(data, clientDir, sharedDir) {
  const layers = [['layer1', 'terrain-paint-1.png'], ['layer2', 'terrain-paint-2.png']];
  const pairs = [];
  for (const [key, fname] of layers) {
    if (!data || !data[key]) continue;
    const buf = decodePngDataUrl(data[key], key);
    pairs.push([path.join(clientDir || CLIENT, 'data', fname), buf]);
    pairs.push([path.join(sharedDir || SHARED, fname), buf]);
  }
  if (!pairs.length) throw new EditorSaveError('EINVALID', 'нет layer1/layer2');
  writeAtomicMany(pairs);
  return { written: pairs.map(p => path.basename(path.dirname(p[0])) + '/' + path.basename(p[0])) };
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
  writeTerrainPaint,
  prepareEditorOverrides,
  writeEditorOverridesFiles,
  currentRev,
  EditorSaveError
};
