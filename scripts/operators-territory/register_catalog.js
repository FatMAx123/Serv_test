#!/usr/bin/env node
/**
 * Sync kit-manifest.json & itch-manifest.json into client/js/props-library-data.js:
 * - Updates opt_bastion (open interior walkable fallback off)
 * - Replaces opt_altar with opt_hero_monument
 * - Registers all 28 CC0 itch.io opt_* models (InstancedMesh, GLB, exact colliders)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const KIT = JSON.parse(fs.readFileSync(path.join(__dirname, 'kit-manifest.json'), 'utf8'));
const ITCH = JSON.parse(fs.readFileSync(path.join(__dirname, 'itch-manifest.json'), 'utf8'));
const LIB_PATH = path.join(ROOT, 'client', 'js', 'props-library-data.js');

const CAT_MAP = {
  training: 'forges',
  forges: 'forges',
  workshops: 'forges',
  furniture: 'market',
  containers: 'warehouses',
  monuments: 'monuments',
  ruins: 'ruins',
  walls: 'ruins',
  steampunk: 'steampunk',
  weapons: 'forges'
};

function makeEntry(id, m, meta) {
  const cols = m.colliders || [];
  const hasCol = (m.collision !== false) && cols.length >= 1;
  const c0 = cols[0] || {};
  const entry = {
    id,
    nameRu: meta.nameRu || id,
    nameEn: meta.nameEn || id,
    category: CAT_MAP[meta.category] || 'ruins',
    file: m.file,
    format: 'glb',
    defaultScale: 1,
    estimatedHeight: m.size ? m.size[1] : 2.0,
    instanced: true,
    distClass: meta.distClass || (m.drawDist >= 400 ? 'prop' : 'doodad'),
    drawDist: m.drawDist || 220,
    lodDist: m.lodDist || [35, 90]
  };
  if (m.shadow === false) entry.castShadow = false;
  if (hasCol && !meta.multiCollider) {
    entry.collision = true;
    entry.collisionShape = c0.shape || meta.shape || 'box';
    entry.collisionSize = { x: c0.w, y: c0.h, z: c0.d };
    entry.collisionOffset = { x: c0.x || 0, y: c0.y0 || 0, z: c0.z || 0 };
  } else {
    entry.collision = false;
  }
  entry.tags = [
    'территория операторов',
    'operators',
    'glb',
    'instanced',
    id,
    String(entry.nameRu).toLowerCase(),
    String(entry.nameEn).toLowerCase()
  ];
  return entry;
}

const src = fs.readFileSync(LIB_PATH, 'utf8');
const marker = '    // Территория операторов: кит руин';
const idxStart = src.indexOf(marker);
if (idxStart < 0) throw new Error('Marker not found in props-library-data.js');
const idxArrEnd = src.indexOf('\n  ];', idxStart);
if (idxArrEnd < 0) throw new Error('Array end ]; not found after opt_ catalog');

const KIT_META = {
  opt_bastion:         { nameRu: 'Бастион операторов',         nameEn: 'Operators Bastion',         category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_plaza_deck:      { nameRu: 'Терраса каменной площади',  nameEn: 'Flagstone Terrace Deck',    category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_plaza_steps:     { nameRu: 'Лестница каменной площади',  nameEn: 'Plaza Grand Steps',         category: 'ruins',     distClass: 'prop',     multiCollider: true },
  opt_bastion_parapet: { nameRu: 'Крепостной парапет',         nameEn: 'Bastion Stone Parapet',     category: 'ruins',     distClass: 'prop',     shape: 'box' },
  opt_banner_wall:     { nameRu: 'Настенный стяг операторов',  nameEn: 'Operator Wall Banner',      category: 'monuments', distClass: 'prop' },
  opt_pennant_wall:    { nameRu: 'Вымпел операторов настенный', nameEn: 'Operator Crimson Pennant', category: 'monuments', distClass: 'prop' },
  opt_column:          { nameRu: 'Колонна (руины)',           nameEn: 'Ruin Column',               category: 'ruins',     distClass: 'prop',     shape: 'cylinder' },
  opt_column_broken:   { nameRu: 'Сломанная колонна',         nameEn: 'Broken Column',             category: 'ruins',     distClass: 'prop',     shape: 'cylinder' },
  opt_column_stump:    { nameRu: 'Обрубок колонны',           nameEn: 'Column Stump',              category: 'ruins',     distClass: 'doodad',   shape: 'cylinder' },
  opt_column_fallen:   { nameRu: 'Упавшая колонна',           nameEn: 'Fallen Column',             category: 'ruins',     distClass: 'doodad',   shape: 'box' },
  opt_arch:            { nameRu: 'Арка-руина',                nameEn: 'Ruined Arch',               category: 'ruins',     distClass: 'prop',     multiCollider: true },
  opt_ruin_long:       { nameRu: 'Руина стены',               nameEn: 'Ruined Wall',               category: 'ruins',     distClass: 'prop',     shape: 'box' },
  opt_ruin_corner:     { nameRu: 'Угол руины',                nameEn: 'Ruined Wall Corner',        category: 'ruins',     distClass: 'prop',     multiCollider: true },
  opt_ruin_tower:      { nameRu: 'Обрушенная башня бастиона', nameEn: 'Collapsed Bastion Tower',   category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_bridge:     { nameRu: 'Разрушенный акведук-мост',  nameEn: 'Shattered Viaduct Bridge',  category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_gear_wreck: { nameRu: 'Вбитая в кратер шестерня',   nameEn: 'Shattered Colossal Gear',   category: 'ruins',     distClass: 'prop',     shape: 'cylinder' },
  opt_ruin_crater:     { nameRu: 'Воронка разрушения',        nameEn: 'Blasted Masonry Crater',    category: 'ruins',     distClass: 'prop' },
  opt_debris:          { nameRu: 'Обломки кладки',            nameEn: 'Rubble Debris',             category: 'ruins',     distClass: 'doodad',   shape: 'box' },
  opt_block:           { nameRu: 'Блок кладки',               nameEn: 'Ashlar Block',              category: 'ruins',     distClass: 'doodad',   shape: 'box' },
  opt_slab:            { nameRu: 'Плиты мощения',             nameEn: 'Paving Slabs',              category: 'ruins',     distClass: 'doodad' },
  opt_hero_monument:   { nameRu: 'Монумент Героя',            nameEn: 'Monument of Hero',          category: 'monuments', distClass: 'prop',     shape: 'cylinder' },
  opt_lamp:            { nameRu: 'Паровой фонарь операторов', nameEn: 'Operators Steam Lamp',      category: 'steampunk', distClass: 'doodad',   shape: 'cylinder' }
};

const entries = [];
for (const [id, m] of Object.entries(KIT.pieces)) {
  entries.push(makeEntry(id, m, KIT_META[id] || { nameRu: id, nameEn: id }));
}
for (const [id, m] of Object.entries(ITCH.pieces)) {
  const isMulti = Array.isArray(m.colliders) && m.colliders.length > 1;
  entries.push(makeEntry(id, m, { nameRu: m.nameRu, nameEn: m.nameEn, category: m.category, shape: m.shape, multiCollider: isMulti }));
}

const formatted = entries.map((e) =>
  '    ' + JSON.stringify(e, null, 2).split('\n').join('\n    ')
).join(',\n');

const headerComment =
  '    // Территория операторов: кит руин, Бастион с интерьером, Монумент Героя и CC0 пропсы лагеря.\n' +
  '    // Коллизии для многосоставных зданий (opt_bastion, opt_arch) ставит scripts/operators-territory/layout.js.\n';

const updated = src.slice(0, idxStart) + headerComment + formatted + src.slice(idxArrEnd);
fs.writeFileSync(LIB_PATH, updated, 'utf8');
console.log('[catalog] updated opt_* entries:', entries.length, 'written -> props-library-data.js');

