// ============================================================
//  SCRIPTS / MARKET-SQUARE / MARKET-META.JS
//  Имена, категории библиотеки и класс дальности для моделей рынка (mkt_*).
//  Общий для register_market.js (библиотека редактора) и layout_market.js (сцена).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** Имена классов из shared/class-system.js (лавка называется по классу). */
function classNames() {
  const src = fs.readFileSync(path.join(ROOT, 'shared', 'class-system.js'), 'utf8');
  const re = /\n {4}(\w+): \{\n {6}id: '(\w+)',\n {6}name: '([^']+)',\n {6}nameEn: '([^']+)'/g;
  const out = {};
  let m;
  while ((m = re.exec(src))) out[m[2]] = { ru: m[3], en: m[4] };
  return out;
}

const CLS = classNames();

const FIXED = {
  mkt_stall_food:     { nameRu: 'Лавка снеди',               nameEn: 'Provisions Stall',        category: 'shops_stalls', distClass: 'prop' },
  mkt_stall_supplies: { nameRu: 'Лавка расходников',         nameEn: 'Supplies Stall',          category: 'shops_stalls', distClass: 'prop' },
  mkt_fountain:       { nameRu: 'Фонтан Основателя',         nameEn: 'Founder\'s Fountain',     category: 'monuments',    distClass: 'building', shape: 'cylinder' },
  mkt_pavilion:       { nameRu: 'Зелёный торговый шатёр',    nameEn: 'Green Trade Pavilion',    category: 'market',       distClass: 'building', multiCollider: true },
  mkt_house_red:      { nameRu: 'Фахверковый дом (красная черепица)', nameEn: 'Half-Timbered House (Red Tiles)', category: 'houses', distClass: 'building', shape: 'box' },
  mkt_house_blue:     { nameRu: 'Дом-лавка (синяя черепица)',         nameEn: 'Shop House (Blue Tiles)',         category: 'houses', distClass: 'building', shape: 'box' },
  mkt_house_green:    { nameRu: 'Торговый дом (зелёная черепица)',    nameEn: 'Trade House (Green Tiles)',       category: 'houses', distClass: 'building', shape: 'box' },
  mkt_lamp:           { nameRu: 'Паровой фонарь рынка',      nameEn: 'Market Steam Lamp',       category: 'steampunk',    distClass: 'prop' },
  mkt_banner:         { nameRu: 'Синий вымпел рынка',        nameEn: 'Market Blue Pennant',     category: 'market',       distClass: 'prop' },
  mkt_bunting:        { nameRu: 'Гирлянда флажков',          nameEn: 'Flag Bunting',            category: 'market',       distClass: 'doodad' },
  mkt_crate:          { nameRu: 'Торговый ящик',             nameEn: 'Market Crate',            category: 'warehouses',   distClass: 'doodad' },
  mkt_crates_stack:   { nameRu: 'Штабель ящиков с мешком',   nameEn: 'Crate Stack',             category: 'warehouses',   distClass: 'doodad', shape: 'box' },
  mkt_barrel:         { nameRu: 'Бочка',                     nameEn: 'Market Barrel',           category: 'warehouses',   distClass: 'doodad' },
  mkt_sacks:          { nameRu: 'Мешки с зерном',            nameEn: 'Grain Sacks',             category: 'warehouses',   distClass: 'doodad' },
  mkt_bench:          { nameRu: 'Скамья у фонтана',          nameEn: 'Fountain Bench',          category: 'market',       distClass: 'doodad' },
  mkt_kettle_cart:    { nameRu: 'Тележка с паровым котлом',  nameEn: 'Steam Kettle Cart',       category: 'steampunk',    distClass: 'prop', shape: 'box' },
  mkt_steam_boiler:   { nameRu: 'Паровой котёл рынка',       nameEn: 'Market Steam Boiler',     category: 'steampunk',    distClass: 'building', shape: 'cylinder' },
  mkt_steam_wagon:    { nameRu: 'Паровой тягач',             nameEn: 'Steam Traction Engine',   category: 'transport',    distClass: 'prop', shape: 'box' },
  mkt_pipe_span:      { nameRu: 'Паропровод над улицей',     nameEn: 'Overhead Steam Pipe',     category: 'steampunk',    distClass: 'prop' },
  mkt_table_produce:  { nameRu: 'Стол с овощами',            nameEn: 'Produce Table',           category: 'market',       distClass: 'doodad' },
  mkt_table_wares:    { nameRu: 'Стол с медной утварью',     nameEn: 'Copperware Table',        category: 'market',       distClass: 'doodad' },
  mkt_fence:          { nameRu: 'Деревенский забор',         nameEn: 'Village Fence',           category: 'market',       distClass: 'doodad' },
  mkt_handcart:       { nameRu: 'Ручная тележка с мешками',  nameEn: 'Handcart with Sacks',     category: 'transport',    distClass: 'doodad' },
  mkt_warehouse:      { nameRu: 'Склад депо',                 nameEn: 'Depot Warehouse',         category: 'warehouses',   distClass: 'building', shape: 'box' },
  mkt_monument:       { nameRu: 'Мраморный монумент с клумбами', nameEn: 'Marble Monument',     category: 'monuments',    distClass: 'building', shape: 'cylinder' },
  mkt_clock_tower:    { nameRu: 'Часовая башня с шестернями', nameEn: 'Steam Clock Tower',      category: 'steampunk',    distClass: 'building', shape: 'box' },
  mkt_steam_pump:     { nameRu: 'Паровой насос над колодцем', nameEn: 'Steam Well Pump',        category: 'steampunk',    distClass: 'prop', shape: 'box' },
  mkt_pipe_run:       { nameRu: 'Паропровод на опорах',       nameEn: 'Ground Steam Pipeline',  category: 'steampunk',    distClass: 'doodad' },
  mkt_plaza_stone:    { nameRu: 'Каменная площадь рынка',     nameEn: 'Market Stone Plaza',     category: 'market',       distClass: 'building' },
  mkt_park_paving:    { nameRu: 'Дорожки парка у рынка',      nameEn: 'Market Park Paths',      category: 'market',       distClass: 'building' },
  mkt_park_fountain:  { nameRu: 'Чугунный фонтан парка',      nameEn: 'Cast-Iron Park Fountain', category: 'monuments',   distClass: 'building', shape: 'cylinder' },
  mkt_flowerbed:      { nameRu: 'Клумба в каменном бордюре',  nameEn: 'Stone-Edged Flowerbed',  category: 'market',       distClass: 'doodad' }
};

function meta(id) {
  if (FIXED[id]) return FIXED[id];
  const m = /^mkt_stall_(\w+)$/.exec(id);
  if (m && CLS[m[1]]) {
    return {
      nameRu: 'Лавка класса «' + CLS[m[1]].ru + '»',
      nameEn: CLS[m[1]].en + ' Class Stall',
      category: 'shops_stalls',
      distClass: 'prop',
      classId: m[1]
    };
  }
  return { nameRu: id, nameEn: id, category: 'market', distClass: 'prop' };
}

module.exports = { meta, classNames };
