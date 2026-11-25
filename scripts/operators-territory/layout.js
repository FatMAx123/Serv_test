#!/usr/bin/env node
// ============================================================
//  SCRIPTS / OPERATORS-TERRITORY / LAYOUT.JS
//  Территория операторов: Бастион с открытым интерьером + Монумент Героя +
//  Тренировочный лагерь и полигон операторов (L2 дух, стимпанк-средневековье).
//
//  Запуск:  node scripts/operators-territory/layout.js          (запись + запекание)
//           node scripts/operators-territory/layout.js --dry    (только отчёт)
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'kit-manifest.json'), 'utf8'));
const ITCH = JSON.parse(fs.readFileSync(path.join(__dirname, 'itch-manifest.json'), 'utf8'));
const PIECES = Object.assign({}, KIT.pieces, ITCH.pieces);
const DRY = process.argv.includes('--dry');

// ---- рельеф: тот же индекс меша, что у клиента и сервера ----
const win = {};
new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8'))(win);
globalThis.TerrainData = win.TerrainData;
const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
function ground(x, z) {
  const y = TH.groundY(x, z, 600, 1200);
  if (y == null || !isFinite(y)) throw new Error('нет земли под ' + x.toFixed(1) + ',' + z.toFixed(1));
  return y;
}

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
  opt_hero_monument: 'Монумент Героя',
  opt_lamp: 'Паровой фонарь операторов'
};
for (const [k, v] of Object.entries(ITCH.pieces)) {
  NAMES[k] = v.nameRu || k;
}

const DIST_CLASS = {
  opt_bastion: 'building', opt_column: 'prop', opt_column_broken: 'prop', opt_arch: 'prop',
  opt_ruin_long: 'prop', opt_ruin_corner: 'prop', opt_hero_monument: 'prop',
  opt_palisade: 'prop', opt_banner_stand: 'prop', opt_cannon: 'prop'
};
const SINK = {
  opt_column: 0.15, opt_column_broken: 0.15, opt_column_stump: 0.15, opt_column_fallen: 0.12,
  opt_arch: 0.2, opt_ruin_long: 0.35, opt_ruin_corner: 0.3, opt_debris: 0.12, opt_block: 0.12,
  opt_slab: 0.16, opt_hero_monument: 0.25, opt_lamp: 0.1, opt_palisade: 0.14, opt_rubble_pile: 0.10
};
const CYLINDER = new Set(['opt_column', 'opt_column_broken', 'opt_column_stump', 'opt_lamp', 'opt_hero_monument',
  'opt_dummy', 'opt_bookstand', 'opt_barrel', 'opt_banner_stand', 'opt_gas_cylinder', 'opt_cable_drum',
  'opt_work_light', 'opt_sack_grain']);

const props = [];
const report = { pieces: {}, colliders: 0, foliage: 0, interior: 0, camp: 0 };
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

function addEntryAndColliders(piece, x, y, z, rotY, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const id = opt.id || nextId(piece);
  const p = {
    id: id,
    name: NAMES[piece] || piece,
    type: 'prop',
    meshType: 'glb',
    modelId: piece,
    modelFile: m.file,
    category: opt.category || m.category || 'ruins',
    position: { x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
    scale: { x: s, y: s, z: s },
    instanced: true,
    distClass: DIST_CLASS[piece] || 'doodad',
    drawDist: opt.drawDist || m.drawDist || 220,
    lodDist: m.lodDist || [35, 90]
  };
  if (m.shadow === false || opt.shadow === false) p.castShadow = false;
  const cols = opt.noCollision ? [] : (m.colliders || []);
  if (cols.length === 1) {
    const c = cols[0];
    p.collision = true;
    p.collisionShape = c.shape || (CYLINDER.has(piece) ? 'cylinder' : 'box');
    p.collisionSize = { x: c.w, y: c.h, z: c.d };
    p.collisionOffset = { x: +(c.x * s).toFixed(3), y: +(c.y0 * s).toFixed(3), z: +(c.z * s).toFixed(3) };
    if (c.walkable) { p.walkable = true; p.isWalkableSurface = true; }
  } else {
    p.collision = false;
  }
  props.push(p);
  if (cols.length > 1) {
    cols.forEach((c, i) => {
      const o = rotXZ(c.x * s, c.z * s, rotY);
      const colP = {
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
      };
      if (c.walkable) {
        colP.walkable = true;
        colP.isWalkableSurface = true;
      }
      props.push(colP);
      report.colliders++;
    });
  } else if (cols.length === 1) {
    report.colliders++;
  }
  report.pieces[piece] = (report.pieces[piece] || 0) + 1;
  return p;
}

/** Поставить объект кита на террейн. */
function put(piece, x, z, rotY, opt) {
  opt = opt || {};
  const m = PIECES[piece];
  if (!m) throw new Error('нет в манифесте: ' + piece);
  const s = opt.scale || 1;
  const hw = m.size[0] * s / 2, hd = m.size[2] * s / 2;
  const samples = [];
  for (const [a, b] of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const o = rotXZ(a * hw, b * hd, rotY);
    samples.push(ground(x + o.x, z + o.z));
  }
  const gMin = Math.min(...samples), gMax = Math.max(...samples);
  let y;
  if (piece === 'opt_bastion') {
    // Цоколь 2.50 м (1.30 м в земле под уклон до 1.25 м + 1.20 м над gMax) -> чистый проходной пол!
    y = gMax - 1.30;
    if (gMin < y + 0.05) {
      throw new Error('бастион: перепад рельефа под цоколем ' + (gMax - gMin).toFixed(2) + ' м');
    }
  } else {
    y = gMin - (opt.sink != null ? opt.sink : (SINK[piece] != null ? SINK[piece] : 0.06));
  }
  return addEntryAndColliders(piece, x, y, z, rotY, opt);
}

// ---- повторное использование существующих объектов редактора (0 байт к релизу) ----
function putWorldTent(kind, x, z, rotY) {
  const isT2 = kind === 'tent_02';
  const sc = isT2 ? 0.0449 : 0.0389;
  const gy = ground(x, z);
  const id = 'opt_camp_' + kind + '_' + String((counters[kind] = (counters[kind] || 0) + 1)).padStart(2, '0');
  props.push({
    id,
    name: isT2 ? 'Лагерная палатка штаба' : 'Лагерная палатка снабжения',
    type: 'prop',
    meshType: 'fbx',
    modelId: kind,
    modelFile: kind + '.fbx',
    category: 'tents',
    position: { x: +x.toFixed(3), y: +(gy - 0.08).toFixed(3), z: +z.toFixed(3) },
    rotation: { x: 0, y: +rotY.toFixed(5), z: 0 },
    scale: { x: sc, y: sc, z: sc },
    instanced: true,
    distClass: 'prop',
    collision: true,
    collisionShape: 'box',
    collisionSize: { x: 3.8, y: 3.4, z: 3.8 },
    collisionOffset: { x: 0, y: 0, z: 0 }
  });
  report.camp++;
  report.colliders++;
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
const VILLAGE = { x: -120, z: -160 };
const C = { x: 305, z: 125 };
const TH0 = Math.atan2(VILLAGE.x - C.x, VILLAGE.z - C.z); // фасад (+Z модели) смотрит к деревне
function W(lx, lz) { const o = rotXZ(lx, lz, TH0); return { x: C.x + o.x, z: C.z + o.z }; }
function putL(piece, lx, lz, drot, opt) {
  const w = W(lx, lz);
  report.camp++;
  return put(piece, w.x, w.z, TH0 + (drot || 0), opt);
}

// 1. Бастион операторов (проходимый зал + открытый портал + лестница)
const bastion = put('opt_bastion', C.x, C.z, TH0, { id: 'opt_bastion' });
const BASTION_ANCHOR_SHIFT_Z = (KIT.pieces.opt_bastion.anchorShift && KIT.pieces.opt_bastion.anchorShift[2]) || 0;
const FLOOR_Y = bastion.position.y + 2.50;
const DAIS_Y = bastion.position.y + 2.80;

// Размещение внутри Бастиона по исходным осям (bx = X, cy_bl = Blender Y: от -9.5 вход до +11.4 задняя стена)
function putIn(piece, bx, cy_bl, drot, opt) {
  opt = opt || {};
  const lz = -cy_bl - BASTION_ANCHOR_SHIFT_Z;
  const w = W(bx, lz);
  const baseY = (opt.onDais ? DAIS_Y : FLOOR_Y) + (opt.dy || 0);
  report.interior++;
  return addEntryAndColliders(piece, w.x, baseY, w.z, TH0 + (drot || 0), opt);
}

// --- ИНТЕРЬЕР БАСТИОНА ОПЕРАТОРОВ (NPC внутри + обстановка) ---
// Центральная дорожка ковров (не мешают проходу, ведут к подиуму Командора)
putIn('opt_camp_rug', 0.0, -3.5, 0, { scale: 1.0, shadow: false });
putIn('opt_camp_rug', 0.0, +2.6, 0, { scale: 1.0, shadow: false });

// Подиум Командора (NPC op_commander_walter стоит на bx=0, cy_bl=+9.6):
putIn('opt_table_long', 0.0, +7.9, 0, { onDais: true });
putIn('opt_chair', -0.8, +9.1, 0, { onDais: true });
putIn('opt_chair', +1.1, +8.8, -0.3, { onDais: true });
putIn('opt_chair', -0.7, +6.9, Math.PI, { onDais: true });
putIn('opt_chair', +0.7, +6.9, Math.PI, { onDais: true });
putIn('opt_bookstand', -2.5, +7.8, 0.25, { onDais: true });
putIn('opt_chest', -3.7, +10.2, 0.2, { onDais: true });
putIn('opt_banner_stand', -4.2, +6.8, 0.2);
putIn('opt_banner_stand', +4.2, +6.8, -0.2);
putIn('opt_banner_hang', -2.8, +11.45, Math.PI);
putIn('opt_banner_hang', +2.8, +11.45, Math.PI);

// Левое крыло (Наставник Гард — bx=-4.2, cy_bl=-2.2): тактика и оружейная
putIn('opt_bookcase', -6.9, -3.6, Math.PI / 2);
putIn('opt_bookcase', -6.9, +2.0, Math.PI / 2);
putIn('opt_weapon_rack', -6.5, +5.2, Math.PI / 2);
putIn('opt_weapon_rack_b', -6.6, -6.4, Math.PI / 2);
putIn('opt_table_long', -4.4, +1.8, Math.PI / 2);
putIn('opt_bench_camp', -3.0, +1.8, Math.PI / 2);
putIn('opt_bench_camp', -5.7, +1.8, -Math.PI / 2);
putIn('opt_dummy', -4.9, +5.2, 0.45);
putIn('opt_chest', -6.3, -7.8, Math.PI * 0.25);

// Правое крыло (Квартирмейстер Брон — bx=+4.2, cy_bl=-1.2): снабжение, верстак и паровая котельная
putIn('opt_workbench', +6.4, -3.2, -Math.PI / 2);
putIn('opt_cabinet', +6.9, +2.2, -Math.PI / 2);
putIn('opt_weapon_rack', +6.5, +5.2, -Math.PI / 2);
putIn('opt_crate_iron', +6.6, +7.3, 0.1);
putIn('opt_barrel', +6.7, -6.2, 0.0);
putIn('opt_barrel', +5.8, -6.6, 0.8);
putIn('opt_crate', +6.6, -7.6, -0.15);
putIn('opt_sack_grain', +5.2, +7.6, 0.5);
// Индустриальная паровая обвязка рядом с внутренним котлом (+6.2, +10.3)
putIn('opt_gas_cylinder', +4.5, +9.9, 0.3);
putIn('opt_gas_cylinder', +4.5, +10.7, -0.4);
putIn('opt_cable_drum', +4.7, +8.7, 0.2);

// Освещение и стяги зала (под стропилами, без динамических PointLight)
putIn('opt_chandelier', 0.0, -3.8, 0, { dy: 6.2, noCollision: true });
putIn('opt_chandelier', 0.0, +3.2, 0, { dy: 6.2, noCollision: true });
for (const side of [-1, 1]) {
  for (const cy_bl of [-5.5, +0.5, +6.5]) {
    putIn('opt_lantern_indoor', side * 6.95, cy_bl, side < 0 ? Math.PI / 2 : -Math.PI / 2, { dy: 3.4, noCollision: true });
  }
}

// 2. Фонари и штандарты у парадной лестницы
putL('opt_lamp', -6.6, 19.8, 0);
putL('opt_lamp', 6.6, 19.8, 0);
putL('opt_banner_stand', -5.4, 22.0, 0.15);
putL('opt_banner_stand', 5.4, 22.0, -0.15);

// 3. Церемониальная аллея колонн
const AVENUE = [
  [27, 'opt_column', 'opt_column'],
  [35, 'opt_column', 'opt_column_broken'],
  [43, 'opt_column_stump', 'opt_column'],
  [51, 'opt_column', 'fallen'],
  [59, 'opt_column_broken', 'opt_column'],
  [67, 'opt_column', 'opt_column_stump'],
  [75, 'opt_column_broken', 'fallen']
];
for (const [lz, left, right] of AVENUE) {
  for (const [lx, kind] of [[-8.5, left], [8.5, right]]) {
    if (kind === 'fallen') {
      putL('opt_column_stump', lx, lz, rr(-0.3, 0.3));
      const side = Math.sign(lx);
      putL('opt_column_fallen', lx + side * 5.6, lz + rr(-1, 1), (side > 0 ? 0 : Math.PI) + rr(-0.25, 0.25));
    } else {
      putL(kind, lx, lz, rr(-0.15, 0.15));
    }
  }
}
for (let lz = 21.5; lz <= 77; lz += 3) {
  for (const lx of [-3, 0, 3]) {
    if (rnd() < 0.35) continue;
    putL('opt_slab', lx + rr(-0.12, 0.12), lz, Math.floor(rnd() * 4) * Math.PI / 2 + rr(-0.04, 0.04));
  }
}

// 4. ТРЕНИРОВОЧНЫЙ ПЛАЦ (западная сторона двора — манекены у Дежурного Сержанта Руста!)
// Руст стоит у (-10.5, +34.0)
for (const lz of [27, 32, 37, 42, 47]) {
  putL('opt_dummy', -15.2, lz, Math.PI * 0.5 + rr(-0.1, 0.1));
  putL('opt_dummy', -20.2, lz, Math.PI * 0.5 + rr(-0.1, 0.1));
}
putL('opt_weapon_rack', -13.5, 23.8, 0.08);
putL('opt_weapon_rack_b', -16.8, 23.8, -0.05);
putL('opt_weapon_rack', -23.5, 34.0, Math.PI * 0.5);
putL('opt_weapon_rack_b', -23.5, 41.0, Math.PI * 0.5);
putL('opt_bench_camp', -13.2, 41.0, Math.PI * 0.5);
putL('opt_bench_camp', -13.2, 46.0, Math.PI * 0.5);
putL('opt_work_light', -13.0, 29.0, 2.3);
putL('opt_work_light', -13.0, 50.0, 1.0);
putL('opt_banner_stand', -24.5, 27.0, 0.4);
putL('opt_banner_stand', -24.5, 47.0, 0.4);
putL('opt_slab', -17.5, 32.0, 0.0);
putL('opt_slab', -17.5, 38.0, 0.0);
putL('opt_slab', -17.5, 44.0, 0.0);

// 5. ПОЛЕВАЯ КУЗНЯ, ПАРОВАЯ ТЕХНИКА И ЛАГЕРЬ СНАБЖЕНИЯ (восточная сторона двора)
const campT2 = W(-27.5, 62.0);
putWorldTent('tent_02', campT2.x, campT2.z, TH0 + 0.55);
const campT3 = W(+26.5, 59.0);
putWorldTent('tent_03', campT3.x, campT3.z, TH0 - 0.65);

putL('opt_anvil', +15.0, 30.0, -0.6);
putL('opt_whetstone', +17.2, 32.2, -1.2);
putL('opt_workbench', +15.8, 36.5, -Math.PI / 2);
putL('opt_anvil', +19.5, 39.0, -0.3);
putL('opt_gas_cylinder', +21.5, 35.8, 0.2);
putL('opt_gas_cylinder', +22.4, 36.4, 0.9);
putL('opt_cable_drum', +21.0, 32.2, 0.5);
putL('opt_work_light', +14.0, 33.0, -2.2);
putL('opt_crate_iron', +17.5, 43.0, 0.15);
putL('opt_crate_iron', +19.2, 43.6, -0.2);
putL('opt_crate', +16.5, 47.0, 0.4);
putL('opt_barrel', +18.2, 47.2, 0.1);
putL('opt_barrel', +19.2, 46.5, 1.1);
putL('opt_sack_grain', +15.4, 48.0, 0.8);
putL('opt_sack_grain', +21.5, 55.0, 0.2);
putL('opt_bench_camp', +21.0, 51.0, -Math.PI / 2);
putL('opt_banner_stand', +24.5, 48.0, -0.5);

// 6. АРКА-ВОРОТА ОГРАДЫ, ОРУДИЯ И ЧАСТОКОЛ ЛАГЕРЯ
putL('opt_arch', 0, 81, 0);
putL('opt_lamp', -6.2, 84, 0);
putL('opt_lamp', 6.2, 84, 0);
putL('opt_cannon', -13.0, 74.5, +0.12);
putL('opt_cannon', +13.0, 74.5, -0.12);

// Оборонительный частокол (палисад) по флангам переднего периметра лагеря
for (const lx of [-15.2, -17.6, -20.0, -22.4, -27.2, -29.6, 15.2, 17.6, 20.0, 22.4, 27.2, 29.6]) {
  putL('opt_palisade', lx, 80.5 + rr(-0.2, 0.2), rr(-0.04, 0.04));
}

// 7. Руинный каменный периметр за частоколом
for (const lx of [-34, -22, 16, 28, 37]) putL('opt_ruin_long', lx + rr(-0.8, 0.8), 82 + rr(-0.5, 0.5), rr(-0.06, 0.06), { scale: rr(0.85, 1.1) });
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

// Обломки и осыпи на краю периметра (не перекрывая плац и двор)
const blockedL = (lx, lz) => (Math.abs(lx) < 28 && lz > -22 && lz < 86);
let placed = 0;
for (let tries = 0; tries < 400 && placed < 8; tries++) {
  const lx = rr(-38, 38), lz = rr(-35, 78);
  if (blockedL(lx, lz)) continue;
  putL(placed % 2 === 0 ? 'opt_debris' : 'opt_rubble_pile', lx, lz, rr(0, Math.PI * 2));
  placed++;
}
placed = 0;
for (let tries = 0; tries < 600 && placed < 16; tries++) {
  const lx = rr(-40, 40), lz = rr(-37, 82);
  if (blockedL(lx, lz)) continue;
  putL('opt_block', lx, lz, rr(0, Math.PI * 2), { scale: rr(0.8, 1.15) });
  placed++;
}

// 8. МОНУМЕНТ ГЕРОЯ НА ЮГО-ЗАПАДНОМ СКЛОНЕ (вместо святилища — без магии и религии!)
const T = { x: 238, z: 214 };
put('opt_hero_monument', T.x, T.z, TH0);
put('opt_banner_stand', T.x - 5.6, T.z - 2.4, TH0 + 0.3);
put('opt_banner_stand', T.x + 5.6, T.z - 2.4, TH0 - 0.3);
put('opt_lamp', T.x - 7.2, T.z + 4.8, 0);
put('opt_lamp', T.x + 7.2, T.z + 4.8, 0);
const RING = ['opt_column', 'opt_column', 'opt_column_broken', 'opt_column', 'opt_column_stump', 'opt_column', 'opt_column_broken', 'fallen'];
RING.forEach((kind, k) => {
  const a = k * Math.PI / 4 + 0.2;
  const x = T.x + Math.cos(a) * 10.2, z = T.z + Math.sin(a) * 10.2;
  if (kind === 'fallen') {
    put('opt_column_stump', x, z, rr(0, 6.28));
    const ox = Math.cos(a) * 5.4, oz = Math.sin(a) * 5.4;
    put('opt_column_fallen', x + ox, z + oz, -a + rr(-0.15, 0.15));
  } else {
    put(kind, x, z, rr(-0.2, 0.2));
  }
});
for (let k = 0; k < 6; k++) {
  const a = k * Math.PI / 3 + 0.5, r = rr(5.0, 7.0);
  put('opt_slab', T.x + Math.cos(a) * r, T.z + Math.sin(a) * r, rr(0, 6.28));
}
put('opt_rubble_pile', T.x + 14, T.z - 4, 0.7);
put('opt_rubble_pile', T.x - 6, T.z + 15, 2.1);
put('opt_ruin_corner', T.x - 15, T.z - 9, 0.9);

// 9. Поле руин на западном склоне к дороге из деревни
const FIELD = [
  ['opt_column_broken', 190, 122], ['opt_column_stump', 176, 141], ['opt_column', 201, 168],
  ['opt_column_stump', 166, 176], ['opt_debris', 185, 150], ['opt_rubble_pile', 206, 135],
  ['opt_ruin_long', 172, 108], ['opt_ruin_corner', 214, 186], ['opt_column_fallen', 186, 191],
  ['opt_rubble_pile', 180, 165], ['opt_debris', 195, 112]
];
for (const [kind, x, z] of FIELD) put(kind, x, z, rr(0, Math.PI * 2));
for (let i = 0; i < 9; i++) put('opt_block', rr(160, 215), rr(100, 200), rr(0, 6.28), { scale: rr(0.8, 1.2) });

// 10. Зелень по краям периметра и руинам (НЕ заходя внутрь Бастиона и плаца!)
const nearRuins = props.filter(p =>
  p.instanced &&
  p.category === 'ruins' &&
  p.modelId !== 'opt_bastion' && p.modelId !== 'opt_slab' && p.modelId !== 'opt_palisade' &&
  Math.hypot(p.position.x - C.x, p.position.z - C.z) > 32
);
for (let i = 0; i < 16 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(2.2, 4.2);
  plant('bush02', p.position.x + Math.cos(a) * r, p.position.z + Math.sin(a) * r);
}
for (const [lx, lz, kind] of [[-46, -42, 'tree063'], [47, -40, 'tree060'], [-47, 88, 'tree060'], [48, 86, 'tree063'],
[-52, 30, 'tree063'], [53, 12, 'tree060']]) {
  const w = W(lx, lz);
  plant(kind, w.x, w.z);
}
const CARPETS = ['matted_pratia_d', 'matted_pratia_f', 'matted_pratia_h', 'matted_pratia_c', 'matted_pratia_g', 'field_poppy_f'];
for (let i = 0; i < 56 && nearRuins.length; i++) {
  const p = nearRuins[Math.floor(rnd() * nearRuins.length)];
  const a = rr(0, 6.28), r = rr(1.4, 4.2);
  plant(CARPETS[i % CARPETS.length], p.position.x + Math.cos(a) * r, p.position.z + Math.sin(a) * r);
}
const TUFTS = ['grass03', 'grass05', 'grass08', 'grass_bush'];
let tufts = 0;
for (let tries = 0; tries < 2500 && tufts < 140; tries++) {
  const lx = rr(-45, 45), lz = rr(-42, 92);
  // Не сажать траву в Бастионе, лестнице, на плацу, на аллее и в лагере снабжения
  if (Math.abs(lx) < 26 && lz > -18 && lz < 84) continue;
  const w = W(lx, lz);
  plant(TUFTS[tufts % TUFTS.length], w.x, w.z);
  tufts++;
}
for (let i = 0; i < 36; i++) {
  const a = rr(0, 6.28), r = rr(4.5, 16);
  plant(TUFTS[i % TUFTS.length], T.x + Math.cos(a) * r, T.z + Math.sin(a) * r);
}

// ============================================================
//  Мирная суб-зона «База операторов» (без мобов внутри лагеря и Бастиона!)
// ============================================================
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const MDB = require(path.join(ROOT, 'shared', 'mob-db.js'));
globalThis.MOB_DB = MDB;

const editorFile = path.join(ROOT, 'shared', 'editor-overrides.json');
const curOverrides = JSON.parse(fs.readFileSync(editorFile, 'utf8'));

function toUV(x, z) {
  const TD = globalThis.TerrainData;
  const W = TD.maxX - TD.minX, H = TD.maxZ - TD.minZ;
  return [+((x - TD.minX) / W).toFixed(6), +((z - TD.minZ) / H).toFixed(6)];
}
const campCorners = [W(-44, -44), W(44, -44), W(44, 90), W(-44, 90)];
const campPoly = campCorners.map(pt => toUV(pt.x, pt.z));
const campZone = {
  id: 'terr_operators_camp',
  name: 'База операторов',
  kind: 'territory',
  peace: true,
  lvl: [1, 5],
  shape: 'poly',
  poly: campPoly,
  nb: [
    Math.min(...campPoly.map(p => p[0])),
    Math.min(...campPoly.map(p => p[1])),
    Math.max(...campPoly.map(p => p[0])),
    Math.max(...campPoly.map(p => p[1]))
  ]
};
const nextHuntZones = (curOverrides.huntZones || []).filter(z => z && z.id !== 'terr_operators_camp');
nextHuntZones.push(campZone);

// Проверки: споты мобов и id
WM.applyEditorOverrides(Object.assign({}, curOverrides, { huntZones: nextHuntZones }));
WM.rebuildMobSpotsFromEditor();
const spots = (WM.MOB_SPOTS || []).filter(s => s.zone === 'Территория операторов').map(s => ({
  x: WM.wx(s.np[0]), z: WM.wz(s.np[1]), mob: s.mob
}));
const nearest = spots.reduce((best, s) => Math.min(best, Math.hypot(s.x - C.x, s.z - C.z)), Infinity);
if (nearest < 42) throw new Error('центр спота мобов в ' + nearest.toFixed(1) + ' м от бастиона');

const badIds = props.filter(p => WM.normalizeWorldKey(p.id) !== String(p.id).toLowerCase()).map(p => p.id);
if (badIds.length) throw new Error('id совпадают с ключами объектов мира: ' + badIds.slice(0, 5).join(', '));

const kitTris = props.filter(p => p.instanced && PIECES[p.modelId]).reduce((a, p) => a + PIECES[p.modelId].tris[0], 0);
console.log('[layout] фасад к деревне: rotY=' + TH0.toFixed(3) + ', бастион y=' + bastion.position.y.toFixed(2) + ', пол зала FLOOR_Y=' + FLOOR_Y.toFixed(2));
console.log('[layout] интерьер:', report.interior, '| лагерь:', report.camp, '| зелень:', report.foliage, '| коллайдеры:', report.colliders, '| ближайший спот мобов:', nearest.toFixed(1) + ' м');
console.log('[layout] батчей кита/пропсов:', Object.keys(report.pieces).length, '| всего LOD0 треугольников:', kitTris);

if (DRY) process.exit(0);

// ============================================================
//  Запись сцены редактора (оба файла, бэкап, rev+1) и запекание мира
// ============================================================
const writer = require(path.join(ROOT, 'server', 'editor-overrides-writer.js'));
const cur = JSON.parse(fs.readFileSync(writer.OVERRIDES_JSON_PATH, 'utf8'));
const isOurs = (p) => p && typeof p.id === 'string' && (/^opt_/.test(p.id) || /^foliage_optt_/.test(p.id));
const kept = (cur.customProps || []).filter(p => !isOurs(p));
const removed = (cur.customProps || []).length - kept.length;
const saved = writer.writeEditorOverridesFiles({ customProps: kept.concat(props), huntZones: nextHuntZones }, { baseRev: cur.rev | 0 });
console.log('[layout] сцена: rev ' + saved.rev + ', пропсов ' + saved.customProps.length + ' (заменено своих ' + removed + ', добавлено ' + props.length + ')');

const Bake = require(path.join(ROOT, 'scripts', 'bake-world.js'));
const distWorld = path.join(ROOT, 'dist', 'client', 'data', 'world.json');
const r = Bake.bakeToDisk({ extra: fs.existsSync(path.dirname(distWorld)) ? [distWorld] : [] });
console.log('[layout] мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ → ' + (r.written.join(', ') || 'без изменений'));
