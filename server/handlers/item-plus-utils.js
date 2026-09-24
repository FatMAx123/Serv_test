// SERVER / HANDLERS / ITEM-PLUS-UTILS.JS
// Утилиты учёта заточки экипировки и сумки (плюс-реестр L2 Classic)
'use strict';
const NPCS = require('../../shared/npc-services.js');

/** Значение карты счётчиков без сюрпризов прототипа. */
function mapCount(m, k) {
  return NPCS.plusMapCount(m, k);
}

/** Сколько копий templateId надето. Экип — отдельная ёмкость от сумки. */
function equippedCount(p, itemId) {
  let n = 0;
  if (!p || !p.equip) return 0;
  const id = String(itemId || '').toLowerCase();
  for (const s of Object.keys(p.equip)) {
    const e = p.equip[s];
    const tid = e && String(e.templateId || e.id || '').toLowerCase();
    if (tid === id) n++;
  }
  return n;
}

/** Заточка на надетом предмете (plusById с сумкой общий, но plus живёт и на слоте). */
function plusStillHeld(p, itemId) {
  const invCnt = p && p.inv && Number(p.inv[itemId]);
  return (Number.isFinite(invCnt) && invCnt > 0) || equippedCount(p, itemId) > 0;
}

/** Реестр заточки живёт, пока есть копия в сумке или слоте. Иначе — призрак +N. */
function clearPlusIfGone(p, itemId) {
  if (!p || !p.plusById) return;
  if (!plusStillHeld(p, itemId)) delete p.plusById[itemId];
}

function equippedPlus(p, itemId) {
  let n = 0;
  if (!p || !p.equip) return 0;
  const id = String(itemId || '').toLowerCase();
  for (const s of Object.keys(p.equip)) {
    const e = p.equip[s];
    const tid = e && String(e.templateId || e.id || '').toLowerCase();
    if (tid === id) {
      const pl = Math.max(0, Math.floor(Number(e.plus))) || 0;
      n = Math.max(n, pl);
    }
  }
  return n;
}

/** Опции plusMoveOk для переноса сумка ↔ сумка (обмен, лавка). */
function playerPlusOpts(fromP, toP, itemId) {
  return {
    fromLocked: equippedCount(fromP, itemId),
    toLocked: equippedCount(toP, itemId),
    fromExtraPlus: equippedPlus(fromP, itemId),
    toExtraPlus: equippedPlus(toP, itemId)
  };
}

function plusMoveOk(fromCounts, fromPlus, toCounts, toPlus, itemId, count, opts) {
  return NPCS.plusMoveOk(fromCounts, fromPlus, toCounts, toPlus, itemId, count, opts);
}

function plusMove(fromPlus, toPlus, itemId) {
  NPCS.plusMove(fromPlus, toPlus, itemId);
}

module.exports = {
  mapCount,
  equippedCount,
  plusStillHeld,
  clearPlusIfGone,
  equippedPlus,
  playerPlusOpts,
  plusMoveOk,
  plusMove
};
