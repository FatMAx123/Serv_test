'use strict';

/**
 * server/world/spoil-corpses.js
 * ============================================================================
 * Вскрытые корпуса (L2 Spoil → Sweeper).
 *
 * Мастеровой метит живую машину «Оценкой узлов». Когда она гибнет, детали спойла
 * не падают на землю, а остаются в корпусе: забрать их может только тот, кто метил,
 * умением «Демонтаж» рядом с местом гибели, пока корпус не остыл (SWEEP_WINDOW_MS).
 * Мёртвый моб сразу уходит из реестра мобов, поэтому корпуса живут здесь отдельно.
 * ============================================================================
 */

const SWEEP_WINDOW_MS = 20000;
const MAX_CORPSES = 4096;

/** @type {Map<number, {mid:number, mobId:string, x:number, z:number, ownerPid:number, items:Array<{id:string,count:number}>, expireAt:number}>} */
const corpses = new Map();

function prune(now) {
  const t = now != null ? now : Date.now();
  for (const [mid, c] of corpses) {
    if (c.expireAt <= t) corpses.delete(mid);
  }
}

/**
 * Запомнить вскрытый корпус. items — результат LR.rollSpoil (непустой массив).
 * @returns {object|null} запись корпуса
 */
function addCorpse(mid, mobId, x, z, ownerPid, items, now) {
  if (ownerPid == null || !Array.isArray(items) || !items.length) return null;
  const t = now != null ? now : Date.now();
  if (corpses.size >= MAX_CORPSES) prune(t);
  if (corpses.size >= MAX_CORPSES) {
    // Переполнение (тысячи неразобранных корпусов): вытесняем самый старый.
    const first = corpses.keys().next();
    if (!first.done) corpses.delete(first.value);
  }
  const rec = {
    mid: +mid,
    mobId: String(mobId || ''),
    x: +x || 0,
    z: +z || 0,
    ownerPid,
    items: items.map((it) => ({ id: String(it.id), count: Math.max(1, Math.floor(+it.count) || 1) })),
    expireAt: t + SWEEP_WINDOW_MS
  };
  corpses.set(rec.mid, rec);
  return rec;
}

/**
 * Забрать (удалить из реестра) все неостывшие корпуса владельца в радиусе.
 * @returns {Array} записи корпусов
 */
function takeOwnedNear(ownerPid, x, z, radius, now) {
  const t = now != null ? now : Date.now();
  const r2 = radius * radius;
  const out = [];
  for (const [mid, c] of corpses) {
    if (c.expireAt <= t) { corpses.delete(mid); continue; }
    if (c.ownerPid !== ownerPid) continue;
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz > r2) continue;
    corpses.delete(mid);
    out.push(c);
  }
  return out;
}

/** Есть ли у владельца неостывшие корпуса где угодно (для подсказки «подойдите ближе»). */
function hasOwned(ownerPid, now) {
  const t = now != null ? now : Date.now();
  for (const c of corpses.values()) {
    if (c.ownerPid === ownerPid && c.expireAt > t) return true;
  }
  return false;
}

function size() { return corpses.size; }
function clear() { corpses.clear(); }

module.exports = {
  SWEEP_WINDOW_MS,
  addCorpse,
  takeOwnedNear,
  hasOwned,
  prune,
  size,
  clear
};
