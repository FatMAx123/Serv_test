// SERVER / COMBAT / PLAYER-DAMAGE.JS
// Снятие урона с игрока по правилам L2: CP поглощает урон только от игроков
// (автоатака, скиллы, DoT от игрока), урон мобов идёт сразу в HP.
'use strict';

/**
 * Применить урон к игроку.
 * @param {object} p цель
 * @param {number} dmg урон
 * @param {{fromPlayer?: boolean, minHp?: number}} [opts]
 *   fromPlayer — источник урона игрок (тогда сначала тратится CP);
 *   minHp — нижняя граница HP (DoT в L2 не убивает: minHp = 1).
 * @returns {{cpDmg: number, hpDmg: number}} сколько реально снято с CP и HP
 */
function applyPlayerDamage(p, dmg, opts) {
  opts = opts || {};
  let rest = Math.max(0, +dmg || 0);
  let cpDmg = 0;
  if (opts.fromPlayer && p.maxCp > 0 && p.cp > 0 && rest > 0) {
    cpDmg = Math.min(p.cp, rest);
    p.cp = Math.max(0, p.cp - cpDmg);
    rest -= cpDmg;
  }
  const minHp = Math.max(0, +opts.minHp || 0);
  const before = +p.hp || 0;
  const after = Math.min(before, Math.max(minHp, before - rest));
  p.hp = after;
  return { cpDmg: cpDmg, hpDmg: before - after };
}

/** Поля для пакета `hit`: авторитетные HP/CP, чтобы клиент не считал их сам. */
function vitalsFields(p) {
  const out = { hp: Math.floor(+p.hp || 0) };
  if (p.maxCp > 0) {
    out.cp = Math.floor(+p.cp || 0);
    out.maxCp = p.maxCp;
  }
  return out;
}

module.exports = { applyPlayerDamage, vitalsFields };
