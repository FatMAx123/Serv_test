// ============================================================
//  TESTS / NATIVE-COMBAT.TEST.JS
//  Unit tests for NativeCombatEngine (C++ Node-API SIMD & L2-Combat)
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));

let nativeModule = null;
try {
  nativeModule = require(path.join(ROOT, 'build', 'Release', 'project_steam_native.node'));
} catch (e) {
  nativeModule = null;
}

module.exports = function (t) {
  t.suite('NativeCombatEngine: Загрузка модуля и экспорт функций');
  t.ok(nativeModule, 'нативный модуль project_steam_native.node успешно загружен');
  t.ok(typeof nativeModule.physicalDamage === 'function', 'экспорт physicalDamage доступен');
  t.ok(typeof nativeModule.circuitDamage === 'function', 'экспорт circuitDamage доступен');
  t.ok(typeof nativeModule.hitChance === 'function', 'экспорт hitChance доступен');
  t.ok(typeof nativeModule.blockChance === 'function', 'экспорт blockChance доступен');
  t.ok(typeof nativeModule.critChancePct === 'function', 'экспорт critChancePct доступен');
  t.ok(typeof nativeModule.statBonus === 'function', 'экспорт statBonus доступен');
  t.ok(typeof nativeModule.levelMod === 'function', 'экспорт levelMod доступен');
  t.ok(typeof nativeModule.resolveBatchAttacks === 'function', 'экспорт resolveBatchAttacks доступен');

  t.suite('NativeCombatEngine: Канонические формулы C1 (Точность и Уклонение)');
  t.eq(nativeModule.hitChance(20, 20), 75, 'Acc == Eva -> шанс попадания 75%');
  t.eq(nativeModule.hitChance(30, 10), 98, 'Acc - Eva = 20 -> кап 98%');
  t.eq(nativeModule.hitChance(10, 30), 5, 'Eva - Acc = 20 -> мин 5%');

  t.suite('NativeCombatEngine: Блок щитом (C1 Shield Block)');
  t.eq(nativeModule.blockChance(0, 100, 0), 0, 'без щита шанс блока равен 0%');
  const bChance = nativeModule.blockChance(20, 50, 0);
  t.ok(bChance > 20 && bChance <= 70, 'щит 20 против 50 pDef дает >20% блока');
  t.ok(nativeModule.blockChance(9999, 1, 0) <= 70, 'блок щитом не превышает кап 70%');

  t.suite('NativeCombatEngine: Бонусы статов и модификатор уровня');
  t.near(nativeModule.statBonus(40, 0), 1.20, 0.01, 'STR 40 -> бонус 1.20');
  t.near(nativeModule.statBonus(43, 4), 1.58, 0.02, 'CON 43 -> бонус ~1.58');
  t.near(nativeModule.statBonus(41, 1), 1.21, 0.02, 'INT 41 -> бонус ~1.21');
  t.near(nativeModule.levelMod(1), 0.90, 0.001, 'Level 1 -> levelMod 0.90');
  t.near(nativeModule.levelMod(20), 1.09, 0.001, 'Level 20 -> levelMod 1.09');

  t.suite('NativeCombatEngine: Физический и Контурный урон');
  // 70 * 100 / 50 * 1.0 = 140
  t.eq(nativeModule.physicalDamage(100, 50, 1.0, 1.0, 1.0), 140, 'физ. урон: 70 * 100 / 50 = 140');
  // с соулшотом x2 -> 280
  t.eq(nativeModule.physicalDamage(100, 50, 1.0, 2.0, 1.0), 280, 'физ. урон с Soulshot (x2) = 280');
  // 91 * 12 * sqrt(100) / 50 = 91 * 12 * 10 / 50 = 218.4 -> 218
  t.eq(nativeModule.circuitDamage(100, 50, 12, 1.0, 1.0, 1.0), 218, 'контурный урон (P12): 91 * 12 * 10 / 50 = 218');

  t.suite('NativeCombatEngine: Интеграция с shared/l2-combat.js');
  t.ok(L2.native, 'L2.native доступен');
  t.eq(L2.hitChance(25, 25), 75, 'L2.hitChance делегирует в C++');
  t.near(L2.statBonus(40, 'STR'), 1.20, 0.01, 'L2.statBonus(40, STR) равен 1.20');
  t.near(L2.levelMod(1), 0.90, 0.001, 'L2.levelMod(1) равен 0.90');

  t.suite('NativeCombatEngine: Пакетный расчёт атак (resolveBatchAttacks)');
  const BATCH_SIZE = 50;
  const input = new Float32Array(BATCH_SIZE * 12);
  const output = new Int32Array(BATCH_SIZE * 4);

  for (let i = 0; i < BATCH_SIZE; i++) {
    const off = i * 12;
    const isCircuit = (i % 2 === 1) ? 1 : 0;
    input[off] = isCircuit;
    input[off + 1] = 80 + i; // aAtk
    input[off + 2] = 40;     // dDef
    input[off + 3] = 40;     // acc
    input[off + 4] = 20;     // eva
    input[off + 5] = isCircuit ? 12 : 1.0; // power
    input[off + 6] = 1.0;    // shotMod
    input[off + 7] = 44;     // critChance
    input[off + 8] = isCircuit ? 3.0 : 2.0;
    input[off + 9] = isCircuit ? 0 : 20; // shieldDef
    input[off + 10] = 0;     // blockBonus
    input[off + 11] = 0;     // ignoreDef
  }

  const processed = L2.resolveBatchAttacks(input, output, BATCH_SIZE);
  t.eq(processed, BATCH_SIZE, 'обработано ровно 50 атак');

  let validDamages = 0;
  for (let i = 0; i < BATCH_SIZE; i++) {
    const dmg = output[i * 4];
    const missed = output[i * 4 + 1];
    if (missed === 0 && dmg > 0) validDamages++;
  }
  t.ok(validDamages > 40, 'подавляющее большинство атак нанесли урон', 'успешных ударов: ' + validDamages);
};
