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

/**
 * МОДЕЛЬ ЗАТОЧКИ (этап 3, H10). Раньше plusById был общим для сумки и экипа:
 * надетый +N и купленная обычная копия того же templateId делили одну запись,
 * и при выпадении/разделении +N появлялся у обеих копий.
 * Теперь экип и сумка — разные ёмкости:
 *   - p.equip[slot].plus — заточка надетого экземпляра;
 *   - p.plusById[id]     — заточка стопки этого id в сумке (смешивать обычные и
 *                          заточенные копии в сумке по-прежнему нельзя).
 * Надевание переносит plus из сумки на слот, снятие — обратно.
 */
/** Есть ли копии в сумке (реестр plusById относится только к сумке). */
function plusStillHeld(p, itemId) {
  const invCnt = p && p.inv && Number(p.inv[itemId]);
  return Number.isFinite(invCnt) && invCnt > 0;
}

/** Заточка стопки в сумке. */
function bagPlus(p, itemId) {
  return mapCount(p && p.plusById, itemId);
}

/**
 * Миграция старых профилей (общий реестр сумка+экип) в новую модель.
 * - запись без копий в сумке — «призрак» от надетого предмета → удалить;
 * - надет тот же id с plus >= записи — запись принадлежала надетому → удалить
 *   (так же старый код трактовал её при выбросе/уничтожении).
 * Возвращает число исправленных записей.
 */
function normalizePlusRegistry(p) {
  if (!p || !p.plusById) return 0;
  let fixed = 0;
  for (const id of Object.keys(p.plusById)) {
    const v = mapCount(p.plusById, id);
    if (v <= 0 || !plusStillHeld(p, id) || (equippedCount(p, id) > 0 && equippedPlus(p, id) >= v)) {
      delete p.plusById[id];
      fixed++;
    }
  }
  return fixed;
}

/** Реестр заточки живёт, пока есть копия в сумке. Иначе — призрак +N. */
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

/**
 * Опции plusMoveOk для переноса сумка ↔ сумка (обмен, лавка).
 * Экип — отдельная ёмкость со своим plus на экземпляре, поэтому надетые копии
 * больше не блокируют и не «заражают» перенос копий из сумки.
 */
function playerPlusOpts(fromP, toP, itemId) {
  return {};
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
  bagPlus,
  normalizePlusRegistry,
  clearPlusIfGone,
  equippedPlus,
  playerPlusOpts,
  plusMoveOk,
  plusMove
};
