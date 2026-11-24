#!/usr/bin/env node
// ============================================================
//  SCRIPTS / BAKE-WORLD.JS — «запекание» мира из рабочего файла редактора.
//
//  Редактор живёт только на локальной машине и пишет shared/editor-overrides.json:
//  правки, историю удалений, служебные поля (rev, savedAt, hash). Игра на проде
//  редактора не знает и читает ТОЛЬКО готовые данные мира:
//    shared/world-data.json       — боевой сервер (VPS) и источник для клиента;
//    dist/client/data/world.json  — релизный клиент (пишет build-client).
//
//  Что делает запекание:
//   - удалённые редактором пропсы убираются из мира, а сама история удалений
//     (deletedMeshIds — тысячи id объектов прошлых сессий редактора) отбрасывается;
//   - отбрасываются данные, которые игра не читает (mobSpots — споты строятся из зон
//     охоты), служебные поля редактора и пустые значения;
//   - числа округляются до 1e-6 (нормированные координаты карты — до 2 мм), JSON без пробелов.
//  Небольшие списки удалений встроенного в код контента (NPC, зоны, площадки, метки,
//  крупные объекты мира) остаются: они относятся к коду, а не к файлу редактора.
//
//  Запуск: node scripts/bake-world.js   (редактор и build-client вызывают сами)
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OVERRIDES_FILE = path.join(ROOT, 'shared', 'editor-overrides.json');
const WORLD_FILE = path.join(ROOT, 'shared', 'world-data.json');
const WORLD_FORMAT = 1;

/** Ключи данных мира, которые читает игра (WorldMetrics.applyWorldData). */
const WORLD_KEYS = [
  'deletedNpcIds', 'deletedMobSpotIdxs', 'deletedWorldKeys', 'deletedHuntZoneIds',
  'deletedBuildSiteIds', 'deletedGroundMarkIds',
  'cityNpcs', 'regionNpcs', 'huntZones', 'playerSpawn', 'customProps', 'bspBrushes',
  'buildSites', 'groundMarks', 'weaponGrips', 'windSettings'
];

function isPlayerAuraProp(p) {
  const id = String(p.id || '');
  const name = String(p.name || '');
  return id === 'named_player_aura' || id === 'player_aura' || name === 'player_aura' || id.indexOf('player_aura') !== -1;
}

function roundNumbers(key, value) {
  if (typeof value === 'number' && isFinite(value) && !Number.isInteger(value)) {
    return Math.round(value * 1e6) / 1e6;
  }
  return value;
}

/**
 * Данные мира из оверрайдов редактора (чистая функция, вход не меняется).
 * @param {object} src - содержимое shared/editor-overrides.json
 * @returns {object} данные мира (формат WORLD_FORMAT)
 */
function bakeWorld(src) {
  src = src && typeof src === 'object' ? src : {};
  const deletedMesh = new Set((Array.isArray(src.deletedMeshIds) ? src.deletedMeshIds : []).map(String));
  const out = { format: WORLD_FORMAT, rev: src.rev | 0, hash: src.hash ? String(src.hash) : null };

  for (const k of WORLD_KEYS) {
    const v = src[k];
    if (v == null) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }

  // Пропсы: так же, как их показывает игра (world-content / applyEditorOverrides) —
  // без удалённых редактором и без эффектов игрока
  if (Array.isArray(src.customProps)) {
    out.customProps = src.customProps.filter((p) => {
      if (!p || typeof p !== 'object') return false;
      if (isPlayerAuraProp(p)) return false;
      if (deletedMesh.has(String(p.id)) || (p.editorKey != null && deletedMesh.has(String(p.editorKey)))) return false;
      return true;
    });
  }
  if (Array.isArray(src.bspBrushes)) {
    const b = src.bspBrushes.filter((x) => x && x.id);
    if (b.length) out.bspBrushes = b; else delete out.bspBrushes;
  }
  // Один проход через JSON: глубокая копия + округление
  return JSON.parse(JSON.stringify(out, roundNumbers));
}

/** Сериализация файла мира (стабильная, без пробелов). */
function serializeWorld(world) {
  return JSON.stringify(world, roundNumbers);
}

/** Прочитать оверрайды и вернуть { world, text }. */
function bakeFromFile(overridesPath) {
  const raw = fs.readFileSync(overridesPath || OVERRIDES_FILE, 'utf8');
  const world = bakeWorld(JSON.parse(raw));
  return { world, text: serializeWorld(world), srcBytes: Buffer.byteLength(raw) };
}

/** Атомарная запись (tmp + rename). */
function writeAtomic(file, text) {
  const tmp = file + '.tmp-' + process.pid + '-' + Date.now();
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Запечь shared/world-data.json (и при необходимости копии, напр. dist/client/data/world.json).
 * Файл перезаписывается только при изменении содержимого.
 * @returns {{ changed: boolean, bytes: number, srcBytes: number, rev: number }}
 */
function bakeToDisk(opts) {
  opts = opts || {};
  const { world, text, srcBytes } = bakeFromFile(opts.overrides);
  const targets = [opts.out || WORLD_FILE].concat(opts.extra || []);
  let changed = false;
  for (const t of targets) {
    let cur = null;
    try { cur = fs.readFileSync(t, 'utf8'); } catch (_) { cur = null; }
    if (cur === text) continue;
    fs.mkdirSync(path.dirname(t), { recursive: true });
    writeAtomic(t, text);
    changed = true;
  }
  return { changed, bytes: Buffer.byteLength(text), srcBytes, rev: world.rev };
}

module.exports = {
  WORLD_FORMAT,
  WORLD_KEYS,
  OVERRIDES_FILE,
  WORLD_FILE,
  bakeWorld,
  serializeWorld,
  bakeFromFile,
  bakeToDisk
};

if (require.main === module) {
  try {
    const r = bakeToDisk();
    const kb = (n) => (n / 1024).toFixed(1) + ' КБ';
    console.log('🌍 [BAKE-WORLD] ' + (r.changed ? 'shared/world-data.json обновлён' : 'shared/world-data.json актуален') +
      ': ' + kb(r.bytes) + ' (рабочий файл редактора ' + kb(r.srcBytes) + ', rev ' + r.rev + ')');
  } catch (e) {
    console.error('❌ [BAKE-WORLD] ' + (e && e.message));
    process.exit(1);
  }
}
