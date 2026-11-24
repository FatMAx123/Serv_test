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

const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));

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
  // удалённые объекты мира — по тем же правилам, что у редактора (WorldMetrics)
  const deletedWorld = new Set((Array.isArray(src.deletedWorldKeys) ? src.deletedWorldKeys : [])
    .map(WM.normalizeWorldKey).filter((k) => k && !WM.isProtectedWorldKey(k)));
  const out = { format: WORLD_FORMAT, rev: src.rev | 0, hash: src.hash ? String(src.hash) : null };

  for (const k of WORLD_KEYS) {
    const v = src[k];
    if (v == null) continue;
    if (Array.isArray(v) && !v.length) continue;
    out[k] = v;
  }

  // Пропсы: всё, что редактор считает удалённым (по id, ключу, отпечатку или ключу
  // объекта мира), из мира убирается; эффекты игрока — не часть мира
  if (Array.isArray(src.customProps)) {
    out.customProps = src.customProps.filter((p) => {
      if (!p || typeof p !== 'object') return false;
      if (isPlayerAuraProp(p)) return false;
      if (deletedMesh.has(String(p.id)) || (p.editorKey != null && deletedMesh.has(String(p.editorKey))) ||
        (p.finger != null && deletedMesh.has(String(p.finger)))) return false;
      const wk = WM.normalizeWorldKey(p.editorKey || p.id || '');
      if (wk && deletedWorld.has(wk)) return false;
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

// ------------------------------------------------------------
//  Отчёт запекания: что в мире и что изменилось с прошлого запекания
// ------------------------------------------------------------
const REPORT_LIST_MAX = 40;

function propLabel(p) {
  const name = p && p.name ? String(p.name) : '';
  const id = p && p.id != null ? String(p.id) : '?';
  return name && name !== id ? name + ' · ' + id : id;
}

function namedLabel(x) {
  return (x && x.name ? x.name + ' · ' : '') + (x && x.id != null ? x.id : '?');
}

/** added / removed / changed по ключу; списки обрезаны до REPORT_LIST_MAX (полные числа — в count). */
function diffList(prevArr, nextArr, idOf, labelOf) {
  const a = new Map();
  const b = new Map();
  (prevArr || []).forEach((x) => { if (x) a.set(idOf(x), x); });
  (nextArr || []).forEach((x) => { if (x) b.set(idOf(x), x); });
  const out = { added: [], removed: [], changed: [], count: { added: 0, removed: 0, changed: 0 } };
  const push = (kind, x) => {
    out.count[kind]++;
    if (out[kind].length < REPORT_LIST_MAX) out[kind].push(labelOf(x));
  };
  b.forEach((x, id) => {
    if (!a.has(id)) push('added', x);
    else if (JSON.stringify(a.get(id)) !== JSON.stringify(x)) push('changed', x);
  });
  a.forEach((x, id) => { if (!b.has(id)) push('removed', x); });
  return out;
}

function sameJson(a, b) {
  return JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
}

/**
 * Разница двух запечённых миров (prev может быть null — первое запекание).
 * Разделы-списки: { added, removed, changed, count }; для удалённых объектов мира и NPC
 * «added» = удалено в этот раз, «removed» = возвращено в мир.
 */
function diffWorld(prev, next) {
  prev = prev || {};
  next = next || {};
  const npcs = (w) => [].concat(w.cityNpcs || [], w.regionNpcs || []);
  const keyList = (arr) => (arr || []).map((k) => ({ id: String(k) }));
  const byId = (x) => String(x.id);
  return {
    props: diffList(prev.customProps, next.customProps, byId, propLabel),
    huntZones: diffList(prev.huntZones, next.huntZones, byId, namedLabel),
    npcs: diffList(npcs(prev), npcs(next), byId, byId),
    buildSites: diffList(prev.buildSites, next.buildSites, byId, namedLabel),
    groundMarks: diffList(prev.groundMarks, next.groundMarks, byId, namedLabel),
    bspBrushes: diffList(prev.bspBrushes, next.bspBrushes, byId, byId),
    deletedWorldObjects: diffList(keyList(prev.deletedWorldKeys), keyList(next.deletedWorldKeys), byId, byId),
    deletedNpcs: diffList(keyList(prev.deletedNpcIds), keyList(next.deletedNpcIds), byId, byId),
    playerSpawn: !sameJson(prev.playerSpawn, next.playerSpawn),
    windSettings: !sameJson(prev.windSettings, next.windSettings),
    weaponGrips: !sameJson(prev.weaponGrips, next.weaponGrips)
  };
}

/** Сколько всего в мире. */
function worldCounts(w) {
  w = w || {};
  const n = (a) => (Array.isArray(a) ? a.length : 0);
  return {
    props: n(w.customProps),
    huntZones: n(w.huntZones),
    npcs: n(w.cityNpcs) + n(w.regionNpcs),
    buildSites: n(w.buildSites),
    groundMarks: n(w.groundMarks),
    bspBrushes: n(w.bspBrushes),
    deletedWorldObjects: n(w.deletedWorldKeys),
    deletedNpcs: n(w.deletedNpcIds)
  };
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

/**
 * Запечь shared/world-data.json (и при необходимости копии, напр. dist/client/data/world.json).
 * Файлы перезаписываются только при изменении содержимого.
 * @returns {{ changed: boolean, written: string[], bytes: number, prevBytes: number, srcBytes: number,
 *   rev: number, prevRev: number|null, counts: object, diff: object }}
 */
function bakeToDisk(opts) {
  opts = opts || {};
  const out = opts.out || WORLD_FILE;
  let prevText = null;
  try { prevText = fs.readFileSync(out, 'utf8'); } catch (_) { prevText = null; }
  let prevWorld = null;
  try { prevWorld = prevText ? JSON.parse(prevText) : null; } catch (_) { prevWorld = null; }
  const { world, text, srcBytes } = bakeFromFile(opts.overrides);
  const targets = [out].concat(opts.extra || []);
  let changed = false;
  const written = [];
  for (const t of targets) {
    let cur = null;
    try { cur = fs.readFileSync(t, 'utf8'); } catch (_) { cur = null; }
    if (cur === text) continue;
    fs.mkdirSync(path.dirname(t), { recursive: true });
    writeAtomic(t, text);
    changed = true;
    written.push(path.relative(ROOT, t).split(path.sep).join('/'));
  }
  return {
    changed,
    written,
    bytes: Buffer.byteLength(text),
    prevBytes: prevText ? Buffer.byteLength(prevText) : 0,
    srcBytes,
    rev: world.rev,
    prevRev: prevWorld ? prevWorld.rev | 0 : null,
    counts: worldCounts(world),
    diff: diffWorld(prevWorld, world)
  };
}

/**
 * Запечён ли текущий рабочий файл редактора: ревизия и hash сцены = ревизия и hash мира.
 * @returns {{ upToDate: boolean, sceneRev: number|null, worldRev: number|null, worldBytes: number, bakedAt: number|null }}
 */
function bakeStatus(opts) {
  opts = opts || {};
  const scene = readJsonSafe(opts.overrides || OVERRIDES_FILE);
  const out = opts.out || WORLD_FILE;
  const world = readJsonSafe(out);
  let st = null;
  try { st = fs.statSync(out); } catch (_) { st = null; }
  const sceneRev = scene ? scene.rev | 0 : null;
  const worldRev = world ? world.rev | 0 : null;
  const sceneHash = scene && scene.hash ? String(scene.hash) : null;
  const worldHash = world && world.hash ? String(world.hash) : null;
  return {
    upToDate: !!(scene && world && sceneRev === worldRev && sceneHash === worldHash),
    sceneRev,
    worldRev,
    worldBytes: st ? st.size : 0,
    bakedAt: st ? st.mtimeMs : null
  };
}

module.exports = {
  WORLD_FORMAT,
  WORLD_KEYS,
  OVERRIDES_FILE,
  WORLD_FILE,
  bakeWorld,
  serializeWorld,
  bakeFromFile,
  bakeToDisk,
  bakeStatus,
  diffWorld,
  worldCounts
};

if (require.main === module) {
  try {
    const r = bakeToDisk();
    const kb = (n) => (n / 1024).toFixed(1) + ' КБ';
    console.log('🌍 [BAKE-WORLD] ' + (r.changed ? 'shared/world-data.json обновлён' : 'shared/world-data.json актуален') +
      ': ' + kb(r.bytes) + ' (рабочий файл редактора ' + kb(r.srcBytes) + ', rev ' + r.rev + ')');
    const d = r.diff;
    const line = (title, x) => {
      const c = x.count;
      if (c.added || c.removed || c.changed) console.log('   ' + title + ': +' + c.added + ' −' + c.removed + ' ✎' + c.changed);
    };
    if (r.changed) {
      line('пропсы', d.props); line('зоны охоты', d.huntZones); line('NPC', d.npcs);
      line('площадки', d.buildSites); line('метки земли', d.groundMarks); line('BSP', d.bspBrushes);
      line('удалено объектов мира', d.deletedWorldObjects); line('удалено NPC', d.deletedNpcs);
    }
  } catch (e) {
    console.error('❌ [BAKE-WORLD] ' + (e && e.message));
    process.exit(1);
  }
}
