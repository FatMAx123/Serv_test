// ============================================================
//  TESTS / WORLD-BAKE.TEST.JS
//  Запечённые данные мира (shared/world-data.json) — это тот же мир, что собирает
//  редактор (shared/editor-overrides.json), только без истории и служебного:
//   - файл мира не устарел относительно файла редактора;
//   - игра строит из него тот же мир (пропсы, зоны, споты мобов, NPC, регионы, площадки);
//   - он заметно меньше, без истории удалений и служебных полей редактора.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const WM_PATH = require.resolve(path.join(ROOT, 'shared', 'world-metrics.js'));

// Копия без служебных полей (_deleted и т.п.), порядок — по стабильному ключу
const plain = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k.charAt(0) === '_' ? undefined : v)));
const keyOf = (o) => JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v) : v));
const sorted = (arr) => arr.map(plain).sort((x, y) => (keyOf(x) < keyOf(y) ? -1 : keyOf(x) > keyOf(y) ? 1 : 0));

/**
 * Глубокое сравнение. Мир округлён до 1e-6: нормированные координаты карты сдвигаются
 * не больше чем на 2 мм, поэтому числа — с допуском 1 см (или rel для больших величин,
 * напр. площадей регионов в м²).
 */
function sameWorld(a, b, rel) {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= Math.max(0.01, rel * Math.abs(a));
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameWorld(a[k], b[k], rel));
}

function freshWM() {
  delete require.cache[WM_PATH];
  return require(WM_PATH);
}

/** Мир, как его видит игра после применения данных. */
function worldState(WM, data) {
  WM.applyWorldData(data);
  if (WM.rebuildMobSpotsFromEditor) WM.rebuildMobSpotsFromEditor();
  return {
    props: sorted(WM.CUSTOM_PROPS.filter((p) => !(WM.isMeshDeleted(p.id) || WM.isMeshDeleted(p.editorKey)))),
    zones: sorted(WM.HUNT_ZONES.filter((z) => z && !z._deleted)),
    spots: sorted(WM.MOB_SPOTS.filter((s) => s && !s._deleted)),
    cityNpcs: sorted(WM.buildCityNPCs()),
    regionNpcs: sorted(WM.buildRegionNPCs()),
    regions: sorted(WM.buildRegions()),
    buildSites: sorted(WM.listBuildSites()),
    groundMarks: sorted(WM.listGroundMarks()),
    spawn: plain(WM.getPlayerSpawn()),
    deletedWorld: ['mountains', 'volcano', 'walls', 'village_city', 'village_fort'].map((k) => WM.isWorldObjectDeleted(k))
  };
}

module.exports = async function (t) {
  t.suite('мир: запекание данных редактора в данные мира');
  const ovPath = Bake.OVERRIDES_FILE;
  const raw = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
  const baked = Bake.bakeWorld(raw);
  const onDisk = fs.existsSync(Bake.WORLD_FILE) ? fs.readFileSync(Bake.WORLD_FILE, 'utf8') : null;

  t.ok(onDisk !== null, 'shared/world-data.json существует');
  t.ok(onDisk === Bake.serializeWorld(baked),
    'shared/world-data.json не устарел (после правок редактора: node scripts/bake-world.js)');
  t.eq(raw.rev | 0, baked.rev, 'ревизия мира = ревизии сохранения редактора');
  t.ok(!('deletedMeshIds' in baked) && !('mobSpots' in baked) && !('savedAt' in baked),
    'в мире нет истории удалений мешей, неиспользуемых спотов и служебных полей редактора');
  const srcBytes = fs.statSync(ovPath).size;
  const worldBytes = onDisk ? Buffer.byteLength(onDisk) : Infinity;
  t.ok(worldBytes < srcBytes * 0.4,
    'файл мира меньше рабочего файла редактора более чем в 2.5 раза (' + Math.round(worldBytes / 1024) + ' / ' + Math.round(srcBytes / 1024) + ' КБ)');
  t.ok(!/\n/.test(onDisk || '\n'), 'файл мира без форматирования (одна строка)');

  // Мир из запечённых данных = мир из файла редактора
  const orig = require.cache[WM_PATH];
  try {
    const a = worldState(freshWM(), JSON.parse(JSON.stringify(raw)));
    const b = worldState(freshWM(), JSON.parse(onDisk || '{}'));
    t.ok(a.props.length > 0 && a.zones.length > 0 && a.spots.length > 0, 'в мире есть пропсы, зоны охоты и споты (' +
      a.props.length + ' / ' + a.zones.length + ' / ' + a.spots.length + ')');
    for (const k of Object.keys(a)) {
      t.ok(sameWorld(a[k], b[k], 1e-4), 'совпадает: ' + k + (Array.isArray(a[k]) ? ' (' + a[k].length + ')' : ''));
    }
  } finally {
    if (orig) require.cache[WM_PATH] = orig; else delete require.cache[WM_PATH];
  }

  // Удаление в редакторе убирает объект из мира, а не тянет историю в прод
  const probe = Bake.bakeWorld({
    rev: 7,
    customProps: [{ id: 'a', editorKey: 'ka' }, { id: 'b', editorKey: 'kb' }, { id: 'player_aura_1' }],
    deletedMeshIds: ['b', '999', 'g|x|v0'],
    mobSpots: [{ idx: 0 }],
    savedAt: 123,
    huntZones: []
  });
  t.eq(probe.customProps.map((p) => p.id), ['a'], 'удалённые и служебные пропсы не попадают в мир');
  t.ok(!probe.huntZones && !probe.mobSpots && !probe.deletedMeshIds, 'пустые и редакторские поля отброшены');
  t.eq(Bake.bakeWorld({ customProps: [{ id: 'p', position: { x: 1.123456789 } }] }).customProps[0].position.x, 1.123457,
    'числа округлены до 1e-6');
};
