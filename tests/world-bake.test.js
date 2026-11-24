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

  // Любое удаление, которое видит редактор, убирает объект из мира: по id, ключу, отпечатку
  // (finger) и по ключу объекта мира (как exportEditorOverrides)
  const del = Bake.bakeWorld({
    customProps: [
      { id: 'keep' }, { id: 'f1', finger: 'sp|x|1' }, { id: 'house_9', editorKey: 'prop_house_9' },
      { id: 'w1', editorKey: 'old_wall_piece' }, { id: 'water_lily', editorKey: 'water_lily' }
    ],
    deletedMeshIds: ['sp|x|1'],
    deletedWorldKeys: ['prop_house_9', 'walls', 'water']
  });
  t.eq(del.customProps.map((p) => p.id), ['keep', 'water_lily'],
    'удалённые по отпечатку и по ключу объекта мира пропсы убраны (защищённая вода — нет)');

  t.suite('мир: «Запечь мир» в редакторе — отчёт и статус');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ps-bake-'));
  const ovFile = path.join(tmp, 'editor-overrides.json');
  const worldFile = path.join(tmp, 'world-data.json');
  const distFile = path.join(tmp, 'dist', 'world.json');
  const scene1 = {
    rev: 1, hash: 'h1',
    customProps: [{ id: 'tree_1', name: 'Дерево' }, { id: 'rock_1', name: 'Камень', position: { x: 1 } }, { id: 'lamp_1' }],
    huntZones: [{ id: 'z1', name: 'Поле', nb: [0, 0, 1, 1] }],
    cityNpcs: [{ id: 'smith', np: [0.5, 0.5] }],
    deletedWorldKeys: []
  };
  fs.writeFileSync(ovFile, JSON.stringify(scene1));
  const st0 = Bake.bakeStatus({ overrides: ovFile, out: worldFile });
  t.ok(st0.upToDate === false && st0.worldRev === null, 'до первого запекания мир не запечён');
  const r1 = Bake.bakeToDisk({ overrides: ovFile, out: worldFile, extra: [distFile] });
  t.ok(r1.changed && r1.written.length === 2 && fs.existsSync(distFile) &&
    fs.readFileSync(distFile, 'utf8') === fs.readFileSync(worldFile, 'utf8'), 'запекание пишет мир сервера и релиза одним содержимым');
  t.eq(r1.diff.props.count, { added: 3, removed: 0, changed: 0 }, 'первое запекание: все объекты — новые');
  t.ok(Bake.bakeStatus({ overrides: ovFile, out: worldFile }).upToDate, 'после запекания мир актуален');

  // Правки сцены: удалили камень (и через историю удалений, и из списка), сдвинули лампу,
  // поставили забор, убрали стены мира и кузнеца, добавили зону
  const scene2 = JSON.parse(JSON.stringify(scene1));
  scene2.rev = 2; scene2.hash = 'h2';
  scene2.customProps = [{ id: 'tree_1', name: 'Дерево' }, { id: 'lamp_1', position: { x: 5 } }, { id: 'fence_1', name: 'Забор' }, { id: 'ghost' }];
  scene2.deletedMeshIds = ['ghost', 'rock_1'];
  scene2.deletedWorldKeys = ['walls'];
  scene2.deletedNpcIds = ['smith'];
  scene2.huntZones.push({ id: 'z2', name: 'Холмы', nb: [0, 0, 1, 1] });
  fs.writeFileSync(ovFile, JSON.stringify(scene2));
  const st1 = Bake.bakeStatus({ overrides: ovFile, out: worldFile });
  t.ok(!st1.upToDate && st1.sceneRev === 2 && st1.worldRev === 1, 'после сохранения сцены — «есть незапечённые правки»');
  const r2 = Bake.bakeToDisk({ overrides: ovFile, out: worldFile, extra: [distFile] });
  const d = r2.diff;
  t.eq([d.props.added, d.props.removed, d.props.changed], [['Забор · fence_1'], ['Камень · rock_1'], ['lamp_1']],
    'отчёт: новый, удалённый и изменённый объекты');
  t.ok(!JSON.parse(fs.readFileSync(worldFile, 'utf8')).customProps.some((p) => p.id === 'ghost' || p.id === 'rock_1'),
    'удалённые объекты в запечённом мире отсутствуют');
  t.eq(d.huntZones.added, ['Холмы · z2'], 'отчёт: новая зона охоты');
  t.eq([d.deletedWorldObjects.added, d.deletedNpcs.added], [['walls'], ['smith']], 'отчёт: убранные объекты мира и NPC');
  t.ok(r2.prevRev === 1 && r2.rev === 2 && r2.counts.props === 3, 'отчёт: ревизии и счётчики мира');
  const r3 = Bake.bakeToDisk({ overrides: ovFile, out: worldFile, extra: [distFile] });
  t.ok(!r3.changed && r3.written.length === 0 && d && r3.diff.props.count.added === 0,
    'повторное запекание без правок ничего не переписывает');
  fs.rmSync(tmp, { recursive: true, force: true });

  // Кнопка редактора: POST /api/editor/bake-world и GET /api/editor/bake-status
  const api = fs.readFileSync(path.join(ROOT, 'server', 'http', 'editor-api.js'), 'utf8');
  t.ok(/\/api\/editor\/bake-world/.test(api) && /\/api\/editor\/bake-status/.test(api) &&
    /if \(!EDITOR_ENABLED \|\| !editorAuthorized\(req\)\) return editorDisabled\(res\);\s*\n\s*try \{\s*\n\s*const r = bakeWorldNow\(\);/.test(api),
    'ручки запекания только для редактора (EDITOR_ENABLED + авторизация)');
  const writer = fs.readFileSync(path.join(ROOT, 'server', 'editor-overrides-writer.js'), 'utf8');
  t.ok(!/bakeToDisk|bakeWorldAfterSave\(\)/.test(writer), 'сохранение сцены пишет только исходник — мир печётся отдельным шагом');
  const ed = fs.readFileSync(path.join(ROOT, 'client', 'js', 'editor.js'), 'utf8');
  t.ok(/bakeWorld\(\) \{/.test(ed) && /const sr = await this\.saveToServer\(true\);[\s\S]{0,400}\/api\/editor\/bake-world/.test(ed),
    'редактор перед запеканием сохраняет все правки сцены (включая удаления)');
  t.ok(/isB && e\.shiftKey[\s\S]{0,120}this\.bakeWorld\(\)/.test(ed), 'Ctrl+Shift+B — «Запечь мир»');
  const lay = fs.readFileSync(path.join(ROOT, 'client', 'js', 'editor-engine-layout.js'), 'utf8');
  t.ok(/id="ed-top-btn-bake"/.test(lay) && /id="ed-mi-bake"/.test(lay) && /function showBakeReport\(/.test(lay),
    'кнопка в тулбаре, пункт меню File и окно отчёта');
  const dv = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-vps.js'), 'utf8');
  t.ok(dv.indexOf("execSync('node scripts/bake-world.js'") >= 0 &&
    dv.indexOf("execSync('node scripts/bake-world.js'") < dv.indexOf("execSync('node tests/run.js'"),
    'деплой запекает мир до тестов и упаковки');
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  t.ok(/isWorldObjectDeleted\('walls'\)\) segs = \[\]/.test(srv) && /reloadWorldGeo: \(\) => loadWorldGeo\(\)/.test(srv),
    'удалённые стены убираются и из коллизий сервера (и при сохранении сцены)');
};
