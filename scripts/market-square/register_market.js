#!/usr/bin/env node
// ============================================================
//  SCRIPTS / MARKET-SQUARE / REGISTER_MARKET.JS
//  market-manifest.json → библиотека редактора (client/js/props-library-data.js)
//  и словарь текстур (client/js/prop-textures-data.js: материал mkt_atlas → mkt_atlas.webp).
//
//  Все модели рынка собраны Claude в Blender: madeBy: 'claude' → раздел
//  «Модели Claude (Blender)», плюс своя тематическая категория (лавки, дома, рынок…).
//  Блок пишется между маркерами и заменяется целиком — запуск можно повторять.
//
//  Запуск: node scripts/market-square/register_market.js
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { meta } = require('./market-meta');

const ROOT = path.join(__dirname, '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'market-manifest.json'), 'utf8'));
const LIB_PATH = path.join(ROOT, 'client', 'js', 'props-library-data.js');
const TEX_PATH = path.join(ROOT, 'client', 'js', 'prop-textures-data.js');

const BEGIN = '    // Рыночная площадь деревни (scripts/market-square/): лавки всех классов, фонтан, шатёр, дома, декор.';
const END = '    // /Рыночная площадь деревни';
const OPT_MARKER = '    // Территория операторов: кит руин';

function makeEntry(id, m) {
  const md = meta(id);
  const cols = m.colliders || [];
  const c0 = cols[0] || {};
  const e = {
    id,
    nameRu: md.nameRu,
    nameEn: md.nameEn,
    category: md.category,
    file: m.file,
    format: 'glb',
    defaultScale: 1,
    estimatedHeight: m.size ? m.size[1] : 2.0,
    instanced: true,
    distClass: md.distClass || 'prop',
    drawDist: m.drawDist || 220,
    lodDist: m.lodDist || [35, 90]
  };
  if (m.shadow === false) e.castShadow = false;
  if (cols.length === 1 && !md.multiCollider) {
    e.collision = true;
    e.collisionShape = c0.shape || md.shape || 'box';
    e.collisionSize = { x: c0.w, y: c0.h, z: c0.d };
    e.collisionOffset = { x: c0.x || 0, y: c0.y0 || 0, z: c0.z || 0 };
  } else {
    e.collision = false;
  }
  e.madeBy = 'claude';
  e.tags = ['рыночная площадь', 'market square', 'рынок', 'market', 'стимпанк', 'glb', 'instanced', id,
    String(e.nameRu).toLowerCase(), String(e.nameEn).toLowerCase(), 'claude', 'blender']
    .concat(md.classId ? ['лавка', 'stall', 'класс', md.classId] : []);
  return e;
}

// ---- библиотека ----
const ids = Object.keys(MAN.pieces);
const entries = ids.map(id => makeEntry(id, MAN.pieces[id]));
const body = entries.map(e => '    ' + JSON.stringify(e, null, 2).split('\n').join('\n    ')).join(',\n');
const block = BEGIN + '\n' + body + ',\n' + END + '\n';

let src = fs.readFileSync(LIB_PATH, 'utf8');
const EOL = src.includes('\r\n') ? '\r\n' : '\n';
const blockEol = block.split('\n').join(EOL);
const b = src.indexOf(BEGIN);
if (b >= 0) {
  const e = src.indexOf(END, b);
  if (e < 0) throw new Error('нет конечного маркера блока рынка');
  const eEnd = src.indexOf('\n', e) + 1;
  src = src.slice(0, b) + blockEol + src.slice(eEnd);
} else {
  // перед блоком операторов: register_catalog.js переписывает всё от своего маркера до конца массива
  const o = src.indexOf(OPT_MARKER);
  if (o < 0) throw new Error('не найден маркер блока операторов в props-library-data.js');
  src = src.slice(0, o) + blockEol + src.slice(o);
}
fs.writeFileSync(LIB_PATH, src, 'utf8');
console.log('[market] библиотека: ' + entries.length + ' моделей (madeBy: claude) → props-library-data.js');

// ---- словарь текстур ----
let tex = fs.readFileSync(TEX_PATH, 'utf8');
if (!tex.includes('["mkt_atlas", "mkt_atlas.webp"]')) {
  const at = tex.indexOf('["opt_ruins_atlas.webp", "opt_ruins_atlas.webp"],');
  if (at < 0) throw new Error('не найдено место для mkt_atlas в prop-textures-data.js');
  const eol = tex.includes('\r\n') ? '\r\n' : '\n';
  const lineEnd = tex.indexOf('\n', at) + 1;
  tex = tex.slice(0, lineEnd) +
    '    // Рыночная площадь: общий атлас лавок и пропсов (scripts/market-square/atlas_market.py)' + eol +
    '    ["mkt_atlas", "mkt_atlas.webp"],' + eol +
    '    ["mkt_atlas.webp", "mkt_atlas.webp"],' + eol + tex.slice(lineEnd);
  fs.writeFileSync(TEX_PATH, tex, 'utf8');
  console.log('[market] словарь текстур: mkt_atlas → mkt_atlas.webp');
}
// фото-текстуры мощения (scripts/market-square/paving_textures.py)
tex = fs.readFileSync(TEX_PATH, 'utf8');
if (!tex.includes('["mkt_paving_flags", "mkt_paving_flags.webp"]')) {
  const at = tex.indexOf('["mkt_atlas.webp", "mkt_atlas.webp"],');
  if (at < 0) throw new Error('не найден mkt_atlas в prop-textures-data.js');
  const eol = tex.includes('\r\n') ? '\r\n' : '\n';
  const lineEnd = tex.indexOf('\n', at) + 1;
  tex = tex.slice(0, lineEnd) +
    '    // Мощение рынка и парка: фото-текстуры (scripts/market-square/paving_textures.py)' + eol +
    '    ["mkt_paving_flags", "mkt_paving_flags.webp"],' + eol +
    '    ["mkt_paving_flags.webp", "mkt_paving_flags.webp"],' + eol +
    '    ["mkt_paving_cobble", "mkt_paving_cobble.webp"],' + eol +
    '    ["mkt_paving_cobble.webp", "mkt_paving_cobble.webp"],' + eol + tex.slice(lineEnd);
  fs.writeFileSync(TEX_PATH, tex, 'utf8');
  console.log('[market] словарь текстур: mkt_paving_flags, mkt_paving_cobble');
}
