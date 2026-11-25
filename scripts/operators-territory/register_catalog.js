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
  opt_plaza_deck_cracked: { nameRu: 'Треснувшая плита площади', nameEn: 'Cracked Plaza Terrace Deck', category: 'ruins', distClass: 'building', multiCollider: true },
  opt_plaza_deck_scorched: { nameRu: 'Опалённая треснувшая плита', nameEn: 'Scorched Cracked Plaza Deck', category: 'ruins', distClass: 'building', multiCollider: true },
  opt_plaza_deck_edge: { nameRu: 'Обрушенный край площади',    nameEn: 'Broken Plaza Terrace Edge', category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_plaza_steps:     { nameRu: 'Лестница каменной площади',  nameEn: 'Plaza Grand Steps',         category: 'ruins',     distClass: 'prop',     multiCollider: true },
  opt_gate_steps:      { nameRu: 'Входная лестница ворот',     nameEn: 'Gate Approach Steps',       category: 'ruins',     distClass: 'prop',     multiCollider: true },
  opt_bastion_parapet: { nameRu: 'Крепостной парапет',         nameEn: 'Bastion Stone Parapet',     category: 'ruins',     distClass: 'prop',     shape: 'box' },
  opt_banner_wall:     { nameRu: 'Настенный стяг операторов',  nameEn: 'Operator Wall Banner',      category: 'monuments', distClass: 'prop' },
  opt_pennant_wall:    { nameRu: 'Вымпел операторов настенный', nameEn: 'Operator Crimson Pennant', category: 'monuments', distClass: 'prop' },
  opt_banner_hang:     { nameRu: 'Настенный стяг на кронштейне', nameEn: 'Cantilever Guild Banner', category: 'monuments', distClass: 'prop', shape: 'box' },
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
  opt_lamp:            { nameRu: 'Паровой фонарь операторов', nameEn: 'Operators Steam Lamp',      category: 'steampunk', distClass: 'doodad',   shape: 'cylinder' },
  opt_steam_boiler_tower:  { nameRu: 'Башня парового котла',            nameEn: 'Steam Boiler Tower',           category: 'steampunk', distClass: 'building', shape: 'cylinder' },
  opt_steam_dynamo:        { nameRu: 'Паровой динамо-генератор',        nameEn: 'Steam Dynamo Generator',       category: 'steampunk', distClass: 'building', shape: 'box' },
  opt_steam_cistern:       { nameRu: 'Клёпаная водонапорная цистерна',  nameEn: 'Riveted Steam Cistern',        category: 'steampunk', distClass: 'building', shape: 'cylinder' },
  opt_forge_hearth:        { nameRu: 'Полевой паровой горн кузни',      nameEn: 'Field Forge Hearth',           category: 'forges',    distClass: 'prop',     shape: 'box' },
  opt_steam_brazier:       { nameRu: 'Кованый треножный светильник',    nameEn: 'Wrought Tripod Brazier',       category: 'steampunk', distClass: 'doodad' },
  opt_copper_tanks:        { nameRu: 'Парные медные баллоны давления',  nameEn: 'Twin Copper Pressure Vessels', category: 'steampunk', distClass: 'doodad' },
  opt_pipe_bridge_east:    { nameRu: 'Надземная медная арка-паропровод', nameEn: 'Copper Steam Pipeline Arch',  category: 'steampunk', distClass: 'building', multiCollider: true },
  opt_pipe_wall_manifold:  { nameRu: 'Наземный медный коллектор пара',  nameEn: 'Copper Ground Steam Manifold', category: 'steampunk', distClass: 'prop',     shape: 'box' },
  opt_pipe_ground_riser:   { nameRu: 'Медный паровой стояк из грунта', nameEn: 'Copper Ground Steam Riser',    category: 'steampunk', distClass: 'prop',     shape: 'cylinder' },
  opt_pipe_arch_ground:    { nameRu: 'Магистральная медная дуга пара',  nameEn: 'Copper Grounded Steam Arch',   category: 'steampunk', distClass: 'building', multiCollider: true },
  opt_ruin_gate_pylon:     { nameRu: 'Разбитый пилон южных ворот',      nameEn: 'Shattered Gate Pylon',         category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_viaduct_east:   { nameRu: 'Рухнувший пролёт акведука',       nameEn: 'Collapsed Viaduct Span',       category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_foundry_shell:  { nameRu: 'Остов разрушенной котельной',     nameEn: 'Ruined Foundry Shell',         category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_wall_breach:    { nameRu: 'Проломленная крепостная стена',   nameEn: 'Breached Fortress Wall',       category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_wall_buttress:  { nameRu: 'Руина стены с контрфорсами',      nameEn: 'Buttressed Ruin Wall',         category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_wall_colonnade: { nameRu: 'Уцелевшая колонна в руине стены', nameEn: 'Engaged Column Wall Ruin',     category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_crane_wreck:    { nameRu: 'Опрокинутая стрела подъёмника',   nameEn: 'Wrecked Hoist Crane Base',     category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_boiler_wreck:   { nameRu: 'Взорванный котёл на плите',       nameEn: 'Blasted Copper Boiler Wreck',  category: 'ruins',     distClass: 'prop',     shape: 'box' },
  opt_ruin_rubble_a:       { nameRu: 'Гранитный завал А',               nameEn: 'Ashlar Rubble Cluster A',      category: 'ruins',     distClass: 'doodad' },
  opt_ruin_rubble_b:       { nameRu: 'Трубный завал руин Б',            nameEn: 'Masonry Pipe Rubble B',        category: 'ruins',     distClass: 'doodad' },
  opt_heavy_workbench:     { nameRu: 'Тяжёлый верстак артефактора',     nameEn: 'Heavy Artificer Workbench',    category: 'workshops', distClass: 'prop',     shape: 'box' },
  opt_heavy_anvil:         { nameRu: 'Массивная кузнечная наковальня',  nameEn: 'Heavy Forge Anvil Block',      category: 'forges',    distClass: 'doodad' },
  opt_steam_grinder:       { nameRu: 'Паровой точильный станок',        nameEn: 'Steam-Driven Grindstone',      category: 'forges',    distClass: 'doodad' },
  opt_cargo_pallet:        { nameRu: 'Тяжёлый обозный поддон грузов',   nameEn: 'Heavy Supply Cargo Pallet',    category: 'containers',distClass: 'prop' },
  opt_wreck_steam_wagon:   { nameRu: 'Разбитый бронеобоз снабжения',    nameEn: 'Wrecked Armored Steam Wagon',  category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_wreck_caisson:       { nameRu: 'Опрокинутый орудийный передок',   nameEn: 'Overturned Ordnance Caisson',  category: 'ruins',     distClass: 'prop',     shape: 'box' },
  opt_plaza_breach:        { nameRu: 'Взрывной пролом на плацу',        nameEn: 'Plaza Masonry Blast Breach',   category: 'ruins',     distClass: 'doodad' },
  opt_ruin_smokestack:     { nameRu: 'Рухнувшая заводская дымовая труба',nameEn: 'Collapsed Foundry Smokestack', category: 'ruins',    distClass: 'building', shape: 'cylinder' },
  opt_ruin_vault_arch:     { nameRu: 'Каменный ребристый свод-руина',   nameEn: 'Ruined Ribbed Vault Arch',     category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_barracks_corner:{ nameRu: 'Остов разрушенной казармы',       nameEn: 'Ruined Stone Barracks Corner', category: 'ruins',     distClass: 'building', multiCollider: true },
  opt_ruin_aqueduct_pier:  { nameRu: 'Башня-устой рухнувшего акведука', nameEn: 'Shattered Aqueduct Pier',      category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_turbine_pit:    { nameRu: 'Котлован разбитой паровой турбины',nameEn: 'Shattered Steam Turbine Pit', category: 'ruins',     distClass: 'building', shape: 'cylinder' },
  opt_ruin_watchpost:      { nameRu: 'Разрушенный дозорный бастион',    nameEn: 'Blasted Stone Watchpost',      category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_bastion_prow:   { nameRu: 'Срезанный носовой бастион',       nameEn: 'Sheared Bastion Prow Ruin',    category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_pipe_tangle:    { nameRu: 'Разорванный подземный паропровод',nameEn: 'Ruptured Steam Pipeline Ruin', category: 'ruins',     distClass: 'building', shape: 'box' },
  opt_ruin_archway_fallen: { nameRu: 'Рухнувший архитрав и барабаны',   nameEn: 'Fallen Entablature & Drums',   category: 'ruins',     distClass: 'doodad' }
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

