// ============================================================
//  TESTS / D_ARMOR_SOURCES.TEST.JS
//  D-экипировку убрали из витрин (только крафт и дроп). Паровой шлем, Паровые
//  сапоги и Перчатки Знания после этого остались без источника: слот головы
//  на 20 уровне застревал на NG, у мага не было D-перчаток.
//  Проверяется: у каждого D-шлема/сапог/перчаток есть дроп или крафт, рецепты
//  трёх вещей собираются из существующих материалов, лекала идут спойлом,
//  чертежи — дропом с мобов (награду квеста жетонов не трогаем: контракт аудита 38).
// ============================================================
'use strict';

const ITEMS = require('../shared/item-db.js');
const G = require('../shared/game-rules.js');
const NPCS = require('../shared/npc-services.js');
const LT = require('../server/data/loot-tables.js');
const recipesDb = require('../data/crafting_recipes_db.json');
const matsDb = require('../data/crafting_materials_db.json');

const PIECES = ['steam_helmet', 'steam_boots', 'knowledge_gloves'];

/** id → [{mob, section, chance}] по всем таблицам лута (включая спойл). */
function lootIndex() {
  const idx = Object.create(null);
  for (const [mob, T] of Object.entries(LT.MOB_LOOT_TABLES)) {
    for (const k of Object.keys(T)) {
      const sec = T[k];
      if (!sec || !Array.isArray(sec.groups)) continue;
      for (const g of sec.groups) {
        for (const it of (g.items || [])) {
          (idx[it.id] = idx[it.id] || []).push({ mob, section: k, chance: g.chance });
        }
      }
    }
  }
  return idx;
}

module.exports = async function (t) {
  const loot = lootIndex();
  const crafted = new Set(Object.values(G.RECIPES).map((r) => r.result.id));

  t.suite('D-доспех: у шлемов, сапог и перчаток D есть источник');
  const norm = (s) => String(s || '').toLowerCase();
  const dPieces = Object.keys(ITEMS.ITEMS).filter((id) => {
    const tpl = ITEMS.ITEMS[id];
    return norm(tpl.grade) === 'd' && tpl.type === 'armor' &&
      ['head', 'boots', 'feet', 'gloves'].includes(norm(tpl.slot));
  });
  t.ok(PIECES.every((id) => dPieces.includes(id)), 'три вещи — D-доспех слотов головы, ног и рук');
  const orphans = dPieces.filter((id) => !loot[id] && !crafted.has(id));
  t.eq(orphans, [], 'нет D-шлемов/сапог/перчаток без дропа и крафта');
  t.ok(PIECES.every((id) => !NPCS.shopEntry('trader_dora', id)), 'в витрину D-экип не вернулся');

  t.suite('D-доспех: рецепты, лекала, чертежи');
  for (const id of PIECES) {
    const r = G.RECIPES[id];
    t.ok(r && r.result.id === id && r.chance === 0.6, id + ': рецепт с шансом 60%, как у остального D-доспеха');
    t.ok(r && r.mats.every((m) => ITEMS.get(m.id) && m.n > 0), id + ': все материалы существуют');
    const pattern = r && r.mats[0].id;
    t.ok(/^pattern_/.test(pattern) && r.mats[0].n === 3, id + ': ключевая часть — 3 лекала');
    t.ok((loot[pattern] || []).some((s) => s.section === 'spoil'), id + ': лекало добывается спойлом');
    const scroll = ITEMS.get('recipe_' + id);
    t.ok(scroll && scroll.type === 'recipe' && scroll.craftResult === id, id + ': чертёж есть в item-db');
    t.ok((loot['recipe_' + id] || []).length >= 2, id + ': чертёж падает с мобов');
    t.ok((loot[id] || []).some((s) => s.section === 'rare'), id + ': готовая вещь падает с боссов');
    t.ok(recipesDb.some((x) => x.id === id) && matsDb.some((x) => x.id === pattern), id + ': есть в справочниках крафта');
  }
};
