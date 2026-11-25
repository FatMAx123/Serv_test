#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT.JS
//  Территория операторов: расстановка кита в мире (сцена редактора) + запекание.
//
//  Композиция (L2 — эталон по духу, своё по форме):
//   - Бастион операторов в центре плато (y≈87), фасадом к деревне;
//   - церемониальная аллея из 14 колонн (часть разрушена) с остатками мощения,
//     паровые фонари у ступеней и у ворот;
//   - арка-руина как ворота древней ограды, ограда — обрывки стен по периметру;
//   - круглое святилище (подий + кольцо колонн) на юго-западном склоне;
//   - поле руин на западном склоне к дороге из деревни;
//   - зелень — только модели, уже стоящие в мире (0 байт к релизу).
//
//  Все объекты кита — InstancedMesh (instanced: true), LOD из файла, одна
//  текстура-атлас. Коллизии — из kit-manifest.json (build_kit.py), не на глаз.
//  Повторный запуск идемпотентен: всё с id opt_* / foliage_optt_* пересоздаётся.
//
//  Запуск:  node scripts/operators-territory/layout.js          (запись + запекание)
//           node scripts/operators-territory/layout.js --dry    (только отчёт)
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'kit-manifest.json'), 'utf8'));
const DRY = process.argv.includes('--dry');

// ---- рельеф: тот же индекс меша, что у клиента (Terrain.standY) и сервера (GEO) ----
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
globalThis.TerrainData = win.TerrainData;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
function ground(x, z) {
  const y = TH.groundY(x, z, 600, 1200);
  if (y == null || !isFinite(y)) throw new Error('нет земли под ' + x.toFixed(1) + ',' + z.toFixed(1));
  return y;
}

// ---- детерминированный ГСЧ ----
let _seed = 20261125;
function rnd() { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
function rr(a, b) { return a + (b - a) * rnd(); }

const NAMES = {
  opt_bastion: 'Бастион операторов',
  opt_column: 'Колонна (руины)',
  opt_column_broken: 'Сломанная колонна',
  opt_column_stump: 'Обрубок колонны',
  opt_column_fallen: 'Упавшая колонна',
  opt_arch: 'Арка-руина',
  opt_ruin_long: 'Руина стены',
  opt_ruin_corner: 'Угол руины',
  opt_debris: 'Обломки кладки',
  opt_block: 'Блок кладки',
  opt_slab: 'Плиты мощения',
  opt_altar: 'Подий святилища',
  opt_lamp: 'Паровой фонарь операторов'
};
// класс дальности l2-visibility (buildingsMax / propsMax / doodadsMax)
const DIST_CLASS = {
  opt_bastion: 'building', opt_column: 'prop', opt_column_broken: 'prop', opt_arch: 'prop',
  opt_ruin_long: 'prop', opt_ruin_corner: 'prop', opt_altar: 'prop'
};
// насколько утопить в землю (м): основание не висит на склоне
const SINK = {
  opt_column: 0.15, opt_column_broken: 0.15, opt_column_stump: 0.15, opt_column_fallen: 0.12,
  opt_arch: 0.2, opt_ruin_long: 0.35, opt_ruin_corner: 0.3, opt_debris: 0.12, opt_block: 0.12,
  opt_slab: 0.17, opt_altar: 0.25, opt_lamp: 0.1
};
const CYLINDER = new Set(['opt_column', 'opt_column_broken', 'opt_column_stump', 'opt_lamp', 'opt_altar']);

const props = [];
const report = { pieces: {}, colliders: 0, foliage: 0 };
const counters = {};

function nextId(piece) {
  counters[piece] = (counters[piece] || 0) + 1;
  return piece + '_' + String(counters[piece]).padStart(2, '0');
}

// three.js Ry(θ): локальные (x, z) → мир
function rotXZ(lx, lz, th) {
  const c = Math.cos(th), s = Math.sin(th);
  return { x: lx * c + lz * s, z: -lx * s + lz * c };
}

/** Поставить объект кита в мир. */
function put(piece, x, z, rotY, opt) {
  opt = opt || {};
  const m = MAN.pieces[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const hw = m.size[0] * s / 2, hd = m.size[2] * s / 2;
  // земля под габаритом: центр, углы и середины сторон
  const samples = [];
  for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = rotXZ(a * hw, b * hd, rotY);
    samples.push(ground(x + o.x, z + o.z));
  }
  const gMin = Math.min(...samples), gMax = Math.max(...samples);
  let y;
  if (piece === 'opt_bastion') {
    // цоколь 2.1 м (1.5 в земле): верх площадки на 0.35 м выше самой высокой точки
    y = gMax + 0.35 - 2.1;
    if (gMin < y + 0.2) throw new Error('бастион: перепад рельефа под цоколем ' + (gMax - gMin).toFixed(2) + ' м');
  } else {
    y = gMin - (opt.sink != null ? opt.sink : (SINK[piece] || 0.1));
  }
  const id = opt.id || nextId(piece);
  const p = {
    id: id,
    name: NAMES[piece] || piece,
    type: 'prop',
    meshType: 'glb',
    modelId: piece,
    modelFile: m.file,
    category: 'ruins',
    position: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
    scale: { x: s, y: s, z: s },
    instanced: true,
    distClass: DIST_CLASS[piece] || 'doodad',
    drawDist: m.drawDist,
    lodDist: m.lodDist
  };
  if (m.shadow === false) p.castShadow = false;   // плиты/блоки/обломки: тень не видна, а это теневой draw call
  const cols = m.colliders || [];
  if (cols.length === 1) {
    const c = cols[0];
    p.collision = true;
    p.collisionShape = CYLINDER.has(piece) ? 'cylinder' : 'box';
    p.collisionSize = { x: c.w, y: c.h, z: c.d };
    // смещение в getPropBounds не масштабируется — домножаем сами
    p.collisionOffset = { x: +(c.x * s).toFixed(3), y: +(c.y0 * s).toFixed(3), z: +(c.z * s).toFixed(3) };
  } else {
    p.collision = false;
  }
  props.push(p);
  if (cols.length > 1) {
    cols.forEach((c, i) => {
      const o = rotXZ(c.x * s, c.z * s, rotY);
      props.push({
        id: id + '_col' + (i + 1),
        name: 'Коллизия: ' + (NAMES[piece] || piece),
        type: 'prop',
        meshType: 'collision_box',
        position: { x: +(x + o.x).toFixed(3), y: +(y + c.y0 * s).toFixed(3), z: +(z + o.z).toFixed(3) },
        rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        collision: true,
        collisionShape: 'box',
        collisionSize: { x: +(c.w * s).toFixed(3), y: +(c.h * s).toFixed(3), z: +(c.d * s).toFixed(3) },
        collisionOffset: { x: 0, y: 0, z: 0 }
      });
      report.colliders++;
    });
  } else if (cols.length === 1) {
    report.colliders++;
  }
  report.pieces[piece] = (report.pieces[piece] || 0) + 1;
  return p;
}

// ---- зелень из уже размещённых в мире моделей ----
const FOLIAGE = {
  bush02: { file: 'bush02.fbx', scale: 0.393, name: 'Кустарник №2 (Растительность)' },
  tree063: { file: 'tree063.fbx', scale: 0.042956, name: 'Ретро дерево №063 (Растительность)' },
  tree060: { file: 'tree060.fbx', scale: 0.047291, name: 'Ретро дерево №060 (Растительность)' },
  matted_pratia_d: { file: 'matted_pratia_d.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер D) (Растительность)' },
  matted_pratia_f: { file: 'matted_pratia_f.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер F) (Растительность)' },
  matted_pratia_h: { file: 'matted_pratia_h.fbx', scale: 0.0375, name: 'Пратия стелющаяся (Ковер H) (Растительность)' },
  field_poppy_f: { file: 'field_poppy_f.fbx', scale: 0.01757, name: 'Мак полевой (Вариант F) (Растительность)' },
  matted_pratia_c: { file: 'matted_pratia_c.fbx', scale: 0.1114, name: 'Пратия стелющаяся (Ковер C) (Растительность)' },
  matted_pratia_g: { file: 'matted_pratia_g.fbx', scale: 0.0433, name: 'Пратия стелющаяся (Ковер G) (Растительность)' },
  grass03: { file: 'grass03.fbx', scale: 0.02186, name: 'Трава лесная №3 (Растительность)' },
  grass05: { file: 'grass05.fbx', scale: 0.01887, name: 'Трава лесная №5 (Растительность)' },
  grass08: { file: 'grass08.fbx', scale: 0.01891, name: 'Трава лесная №8 (Растительность)' },
  grass_bush: { file: 'grass_bush.fbx', scale: 0.01884, name: 'Травяной куст (Растительность)' }
};
let foliageN = 0;
function plant(kind, x, z) {
  const f = FOLIAGE[kind];
  const k = f.scale * rr(0.85, 1.15);
  props.push({
    id: 'foliage_optt_' + kind + '_' + String(++foliageN).padStart(3, '0'),
    name: f.name,
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: f.file,
    position: { x: +x.toFixed(3), y: +ground(x, z).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: +rr(-0.04, 0.04).toFixed(4), y: +rr(0, Math.PI * 2).toFixed(4), z: +rr(-0.04, 0.04).toFixed(4) },
    scale: { x: +k.toFixed(6), y: +k.toFixed(6), z: +k.toFixed(6) },
    isFoliage: true
  });
  report.foliage++;
}

// ============================================================
//  Композиция
// ============================================================
const VILLAGE = { x: -120, z: -160 };          // центр деревни (WorldMetrics, кольцо дорог)
const C = { x: 305, z: 125 };                  // плато, ≥50 м до центров спотов мобов
const TH0 = Math.atan2(VILLAGE.x - C.x, VILLAGE.z - C.z);   // фасад (+Z модели) к деревне
// локальные оси ансамбля: lx — вбок (+X модели), lz — вперёд от фасада
function W(lx, lz) { const o = rotXZ(lx, lz, TH0); return { x: C.x + o.x, z: C.z + o.z }; }
function putL(piece, lx, lz, drot, opt) {
  const w = W(lx, lz);
  return put(piece, w.x, w.z, TH0 + (drot || 0), opt);
}

// 1. Бастион
put('opt_bastion', C.x, C.z, TH0, { id: 'opt_bastion' });

// 2. Фонари у ступеней
putL('opt_lamp', -6.5, 18.6, 0);
putL('opt_lamp', 6.5, 18.6, 0);

// 3. Аллея колонн: пары через 8 м, часть разрушена
const AVENUE = [
  [24, 'opt_column', 'opt_column'],
  [32, 'opt_column', 'opt_column_broken'],
  [40, 'opt_column_stump', 'opt_column'],
  [48, 'opt_column', 'fallen'],
  [56, 'opt_column_broken', 'opt_column'],
  [64, 'opt_column', 'opt_column_stump'],
  [72, 'opt_column_broken', 'fallen']
];
for (const [lz, left, right] of AVENUE) {
  for (const [lx, kind] of [[-8, left], [8, right]]) {
    if (kind === 'fallen') {
      // база осталась, ствол лёг наружу поперёк аллеи
      putL('opt_column_stump', lx, lz, rr(-0.3, 0.3));
      const side = Math.sign(lx);
      putL('opt_column_fallen', lx + side * 5.6, lz + rr(-1, 1), (side > 0 ? 0 : Math.PI) + rr(-0.25, 0.25));
    } else {
      putL(kind, lx, lz, rr(-0.15, 0.15));
    }
  }
}
// мощение аллеи: обрывками
for (let lz = 20.5; lz <= 76; lz += 3) {
  for (const lx of [-3, 0, 3]) {
    if (rnd() < 0.42) continue;
    putL('opt_slab', lx + rr(-0.15, 0.15), lz, Math.floor(rnd() * 4) * Math.PI / 2 + rr(-0.05, 0.05));
  }
}

// 4. Арка-ворота ограды и фонари у неё
putL('opt_arch', 0, 81, 0);
putL('opt_lamp', -6.2, 84, 0);
putL('opt_lamp', 6.2, 84, 0);

// 5. Ограда: обрывки стен по периметру (вдоль фронта, боков и тыла)
for (const lx of [-33, -21, 14, 26, 36]) putL('opt_ruin_long', lx + rr(-1, 1), 81 + rr(-0.6, 0.6), rr(-0.06, 0.06), { scale: rr(0.85, 1.1) });
for (const side of [-1, 1]) {
  for (const lz of [66, 50, 27, 6, -17, -30]) {
    if (rnd() < 0.25) continue;
    putL('opt_ruin_long', side * 41 + rr(-0.8, 0.8), lz + rr(-2, 2), Math.PI / 2 + rr(-0.06, 0.06), { scale: rr(0.8, 1.1) });
  }
}
for (const lx of [-28, -12, 9, 27]) {
  if (rnd() < 0.2) continue;
  putL('opt_ruin_long', lx + rr(-1, 1), -39 + rr(-0.6, 0.6), rr(-0.06, 0.06), { scale: rr(0.8, 1.05) });
}
putL('opt_ruin_corner', -39, -37, Math.PI);
putL('opt_ruin_corner', 39, 79, 0);

// обломки и блоки внутри ограды (не на аллее и не у бастиона)
const blockedL = (lx, lz) => (Math.abs(lx) < 12 && lz > -20 && lz < 86) || (Math.abs(lx) < 18 && lz > -22 && lz < 22);
let placed = 0;
for (let tries = 0; tries < 400 && placed < 9; tries++) {
  const lx = rr(-38, 38), lz = rr(-35, 78);
  if (blockedL(lx, lz)) continue;
  putL('opt_debris', lx, lz, rr(0, Math.PI * 2));
  placed++;
}
placed = 0;
for (let tries = 0; tries < 600 && placed < 18; tries++) {
  const lx = rr(-40, 40), lz = rr(-37, 82);
  if (blockedL(lx, lz) && Math.abs(lx) < 11) continue;
  if (Math.abs(lx) < 18 && lz > -22 && lz < 22) continue;
  putL('opt_block', lx, lz, rr(0, Math.PI * 2), { scale: rr(0.8, 1.15) });
  placed++;
}

// 6. Святилище на юго-западном склоне: подий и кольцо колонн
const T = { x: 238, z: 214 };
put('opt_altar', T.x, T.z, rr(0, Math.PI * 2));
const RING = ['opt_column', 'opt_column', 'opt_column_broken', 'opt_column', 'opt_column_stump', 'opt_column', 'opt_column_broken', 'fallen'];
RING.forEach((kind, k) => {
  const a = k * Math.PI / 4 + 0.2;
  const x = T.x + Math.cos(a) * 9.5, z = T.z + Math.sin(a) * 9.5;
  if (kind === 'fallen') {
    put('opt_column_stump', x, z, rr(0, 6.28));
    const ox = Math.cos(a) * 5.4, oz = Math.sin(a) * 5.4;
    // упавший ствол вдоль радиуса наружу: ось X модели → (cos a, sin a)
    put('opt_column_fallen', x + ox, z + oz, -a + rr(-0.15, 0.15));
  } else {
    put(kind, x, z, rr(-0.2, 0.2));
  }
});
for (let k = 0; k < 6; k++) {
  const a = k * Math.PI / 3 + 0.5, r = rr(4.6, 6.5);
  put('opt_slab', T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, rr(0, 6.28));
}
put('opt_debris', T.x + 14, T.z - 4, 0.7);
put('opt_debris', T.x - 6, T.z + 15, 2.1);
put('opt_ruin_corner', T.x - 15, T.z - 9, 0.9);

// 7. Поле руин на западном склоне к дороге из деревни
const FIELD = [
  ['opt_column_broken', 190, 122], ['opt_column_stump', 176, 141], ['opt_column', 201, 168],
  ['opt_column_stump', 166, 176], ['opt_debris', 185, 150], ['opt_debris', 206, 135],
  ['opt_ruin_long', 172, 108], ['opt_ruin_corner', 214, 186], ['opt_column_fallen', 186, 191]
];
for (const [kind, x, z] of FIELD) put(kind, x, z, rr(0, Math.PI * 2));
for (let i = 0; i < 9; i++) put('opt_block', rr(160, 215), rr(100, 200), rr(0, 6.28), { scale: rr(0.8, 1.2) });

// 8. Зелень: кусты у стен, деревья по углам ограды, ковры трав у руин
const nearPoints = props.filter(p => p.instanced && p.modelId !== 'opt_bastion' && p.modelId !== 'opt_slab' && p.modelId !== 'opt_lamp');
for (let i = 0; i < 16; i++) {
  const p = nearPoints[Math.floor(rnd() * nearPoints.length)];
  const a = rr(0, 6.28), r = rr(2.0, 4.0);
  plant('bush02', p.position.x + Math.cos(a) * r, p.position.z + Math.sin(a) * r);
}
for (const [lx, lz, kind] of [[-46, -42, 'tree063'], [47, -40, 'tree060'], [-47, 88, 'tree060'], [48, 86, 'tree063'],
  [-52, 30, 'tree063'], [53, 12, 'tree060']]) {
  const w = W(lx, lz);
  plant(kind, w.x, w.z);
}
// ковры у подножий: L2-руины утопают в траве, а не стоят на голой земле
const CARPETS = ['matted_pratia_d', 'matted_pratia_f', 'matted_pratia_h', 'matted_pratia_c', 'matted_pratia_g', 'field_poppy_f'];
for (let i = 0; i < 60; i++) {
  const p = nearPoints[Math.floor(rnd() * nearPoints.length)];
  const a = rr(0, 6.28), r = rr(1.2, 4.0);
  plant(CARPETS[i % CARPETS.length], p.position.x + Math.cos(a) * r, p.position.z + Math.sin(a) * r);
}
// пучки травы (8 треугольников) по всей территории, кроме мощёной аллеи и ступеней
const TUFTS = ['grass03', 'grass05', 'grass08', 'grass_bush'];
let tufts = 0;
for (let tries = 0; tries < 2000 && tufts < 150; tries++) {
  const lx = rr(-44, 44), lz = rr(-42, 92);
  if (Math.abs(lx) < 5 && lz > 14 && lz < 80) continue;          // мощение аллеи
  if (Math.abs(lx) < 15 && lz > -18 && lz < 19) continue;        // цоколь бастиона
  const w = W(lx, lz);
  plant(TUFTS[tufts % TUFTS.length], w.x, w.z);
  tufts++;
}
for (let i = 0; i < 40; i++) {
  const a = rr(0, 6.28), r = rr(3.5, 16);
  plant(TUFTS[i % TUFTS.length], T.x + Math.cos(a) * r, T.z + Math.sin(a) * r);
}

// ============================================================
//  Проверки: споты мобов и границы зоны
// ============================================================
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const MDB = require(path.join(ROOT, 'shared', 'mob-db.js'));
globalThis.MOB_DB = MDB;
WM.applyEditorOverrides(JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'editor-overrides.json'), 'utf8')));
WM.rebuildMobSpotsFromEditor();
const spots = (WM.MOB_SPOTS || []).filter(s => s.zone === 'Территория операторов').map(s => ({
  x: WM.wx(s.np[0]), z: WM.wz(s.np[1]), mob: s.mob
}));
const nearest = spots.reduce((best, s) => Math.min(best, Math.hypot(s.x - C.x, s.z - C.z)), Infinity);
if (nearest < 30) throw new Error('центр спота мобов в ' + nearest.toFixed(1) + ' м от бастиона');

// id со словами wall/water/terrain/volcano/mountain WorldMetrics считает объектом мира
// (normalizeWorldKey) — при удалённом «walls» такой проп молча выпадает из мира.
const badIds = props.filter(p => WM.normalizeWorldKey(p.id) !== String(p.id).toLowerCase()).map(p => p.id);
if (badIds.length) throw new Error('id совпадают с ключами объектов мира: ' + badIds.slice(0, 5).join(', '));

const kitTris = props.filter(p => p.instanced).reduce((a, p) => a + MAN.pieces[p.modelId].tris[0], 0);
console.log('[layout] фасад к деревне: rotY=' + TH0.toFixed(3) + ', бастион y=' + props[0].position.y.toFixed(2));
console.log('[layout] кит:', JSON.stringify(report.pieces));
console.log('[layout] объектов кита ' + props.filter(p => p.instanced).length + ', коллайдеров ' + report.colliders +
  ', зелени ' + report.foliage + ', ближайший спот мобов ' + nearest.toFixed(1) + ' м');
console.log('[layout] треугольников LOD0 (если всё рядом): ' + kitTris + ', типов (батчей) ' + Object.keys(report.pieces).length);

if (DRY) process.exit(0);

// ============================================================
//  Запись сцены редактора (оба файла, бэкап, rev+1) и запекание мира
// ============================================================
const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
const cur = JSON.parse(fs.readFileSync(writer.OVERRIDES_JSON_PATH, 'utf8'));
const isOurs = (p) => p && typeof p.id === 'string' && (/^opt_/.test(p.id) || /^foliage_optt_/.test(p.id));
const kept = (cur.customProps || []).filter(p => !isOurs(p));
const removed = (cur.customProps || []).length - kept.length;
const saved = writer.writeEditorOverridesFiles({ customProps: kept.concat(props) }, { baseRev: cur.rev | 0 });
console.log('[layout] сцена: rev ' + saved.rev + ', пропсов ' + saved.customProps.length + ' (заменено своих ' + removed + ', добавлено ' + props.length + ')');

const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const distWorld = path.join(ROOT, 'dist', 'client', 'data', 'world.json');
const r = Bake.bakeToDisk({ extra: fs.existsSync(path.dirname(distWorld)) ? [distWorld] : [] });
console.log('[layout] мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ → ' + (r.written.join(', ') || 'без изменений'));
