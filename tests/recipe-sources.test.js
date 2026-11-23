// ============================================================
//  TESTS / RECIPE-SOURCES.TEST.JS — источники чертежей по эталону L2.
//  Чертежей нет в магазинах; каждый чертёж добывается в фазе 1 (до 20 ур.)
//  дропом и спойлом Мастерового; «мёртвые» чертежи (без рецепта) не падают.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));

const PHASE1_MAX_MOB_LVL = 22; // мобы фазы 1 (кап игрока 20, мобы до +2)

function recipeSources() {
  const out = {};
  const get = (id) => (out[id] = out[id] || { drop: [], spoil: [] });
  for (const [mob, t] of Object.entries(LT.MOB_LOOT_TABLES)) {
    const minLvl = Array.isArray(t.level) ? t.level[0] : (t.level || 1);
    for (const g of (t.recipes && t.recipes.groups) || []) {
      for (const it of g.items) get(it.id).drop.push({ mob, minLvl, ch: g.chance });
    }
    const sp = t.spoil;
    if (sp && sp.chance > 0) {
      const pool = (sp.groups || []).flatMap((g) => g.items || []);
      const sum = pool.reduce((a, b) => a + b.weight, 0);
      for (const it of pool) {
        if (/^recipe_/.test(it.id)) get(it.id).spoil.push({ mob, minLvl, ch: sp.chance * it.weight / sum });
      }
    }
  }
  return out;
}

module.exports = function (t) {
  t.suite('Чертежи: только дроп и спойл (эталон L2)');
  const inShops = [];
  for (const n of NPCS.allNpcs()) for (const id of (n.shop || [])) if (/^recipe_/.test(id)) inShops.push(n.id + ':' + id);
  t.eq(inShops, [], 'ни один NPC не продаёт чертежи');

  const src = recipeSources();
  const dead = Object.keys(src).filter((id) => !G.RECIPES[id.replace(/^recipe_/, '')]);
  t.eq(dead, [], 'не падают чертежи без рецепта (pressure_canister, hydraulic_armor, colossus_plating)');

  const noDrop = [], noSpoil = [], spoilWorse = [], tooCommon = [];
  for (const rid of Object.keys(G.RECIPES)) {
    const s = src['recipe_' + rid] || { drop: [], spoil: [] };
    const drops = s.drop.filter((d) => d.minLvl <= PHASE1_MAX_MOB_LVL);
    const spoils = s.spoil.filter((d) => d.minLvl <= PHASE1_MAX_MOB_LVL);
    if (!drops.length) noDrop.push(rid);
    if (!spoils.length) noSpoil.push(rid);
    // На обычных мобах (не боссах) спойл должен быть выгоднее дропа — это путь Мастерового
    for (const sp of spoils) {
      const d = drops.find((x) => x.mob === sp.mob);
      if (d && sp.ch <= d.ch) spoilWorse.push(rid + '@' + sp.mob);
    }
    // Обычный моб не должен сыпать чертежами (раньше было 20% с моба 12 ур.)
    for (const d of drops) {
      const tbl = LT.MOB_LOOT_TABLES[d.mob];
      const isBoss = tbl.spoil && tbl.spoil.chance === 0;
      if (!isBoss && d.ch > 0.01) tooCommon.push(rid + '@' + d.mob + ' ' + d.ch);
    }
  }
  t.eq(noDrop, [], 'у каждого чертежа есть дроп с мобов фазы 1');
  t.eq(noSpoil, [], 'у каждого чертежа есть спойл с мобов фазы 1');
  t.eq(spoilWorse, [], 'спойл чертежа выгоднее дропа на том же мобе');
  t.eq(tooCommon, [], 'с обычных мобов чертежи падают не чаще 1%');

  const blade = src.recipe_hydraulic_blade;
  t.ok(blade.drop.some((d) => d.mob === 'press_hammer') && blade.spoil.some((d) => d.mob === 'kettle_stalker'),
    '«Гидравлический клинок» доступен в фазе 1 (босс 18–20 и спойл 18–20), а не только с мобов 36–40');

  const allMobs = new Set(Object.keys(LT.MOB_LOOT_TABLES));
  const unknown = [];
  for (const id of Object.keys(src)) for (const d of src[id].drop.concat(src[id].spoil)) if (!allMobs.has(d.mob)) unknown.push(d.mob);
  t.eq(unknown, [], 'все мобы-источники существуют');
};
