// ============================================================
//  TESTS / NATIVE-SPATIAL-GRID.TEST.JS
//  Тестирование нативного C++ модуля NativeSpatialGrid (Node-API / SIMD)
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const { EntityTransformTable } = require(path.join(ROOT, 'shared', 'entity-transform-table.js'));

let nativeModule = null;
try {
  nativeModule = require(path.join(ROOT, 'build', 'Release', 'project_steam_native.node'));
} catch (e) {
  nativeModule = null;
}

module.exports = async function (t) {
  t.suite('native-spatial-grid: загрузка бинарного модуля');

  t.ok(nativeModule, 'нативный модуль project_steam_native.node успешно загружен');
  if (!nativeModule) return;

  const { NativeSpatialGrid, fastDistance2 } = nativeModule;
  t.ok(NativeSpatialGrid, 'класс NativeSpatialGrid экспортирован');
  t.ok(typeof fastDistance2 === 'function', 'функция fastDistance2 экспортирована');

  // Тест fastDistance2
  t.eq(fastDistance2(0, 0, 3, 4), 25, 'fastDistance2(0,0,3,4) === 25');

  t.suite('native-spatial-grid: вставка и выборка по радиусу');
  const grid = new NativeSpatialGrid(-4000, -4000, 4000, 4000, 72);

  // Вставка игрока и моба
  grid.insert(1, 1, 100, 200, 1000, false);
  grid.insert(101, 2, 110, 205, 500, false);
  grid.insert(102, 2, 800, 800, 500, false); // Дальний моб

  const outP = new Int32Array(32);
  const outM = new Int32Array(32);

  // Выборка около (100, 200) в радиусе 30м
  const res1 = grid.queryRadius(100, 200, 30, outP, outM);
  t.eq(res1.players, 1, 'найден ровно 1 игрок в радиусе 30м');
  t.eq(outP[0], 1, 'PID игрока совпадает (1)');
  t.eq(res1.mobs, 1, 'найден ровно 1 близкий моб в радиусе 30м');
  t.eq(outM[0], 101, 'MID моба совпадает (101)');

  // Выборка в радиусе 5м (должен найтись только игрок)
  const resClose = grid.queryRadius(100, 200, 5, outP, outM);
  t.eq(resClose.players, 1, 'в радиусе 5м найден игрок');
  t.eq(resClose.mobs, 0, 'в радиусе 5м моб отсечен');

  t.suite('native-spatial-grid: hasPlayerNear детектор сна');
  t.eq(grid.hasPlayerNear(105, 202, 20), true, 'игрок обнаружен рядом с точкой');
  t.eq(grid.hasPlayerNear(500, 500, 50), false, 'вдали игроков нет');

  t.suite('native-spatial-grid: bulkInsert из EntityTransformTable');
  const tt = new EntityTransformTable(100);
  const slotP = tt.allocate(777, 1, -150, 0, -250, 850, 850, 120);
  const slotM = tt.allocate(999, 2, -145, 0, -240, 300, 300, 80);

  grid.clear();
  grid.bulkInsert(tt.buffer, tt.maxSlot);

  const resBulk = grid.queryRadius(-150, -250, 50, outP, outM);
  t.eq(resBulk.players, 1, 'bulkInsert: игрок найден в отрицательных координатах');
  t.eq(outP[0], 777, 'bulkInsert: PID игрока верен (777)');
  t.eq(resBulk.mobs, 1, 'bulkInsert: моб найден в отрицательных координатах');
  t.eq(outM[0], 999, 'bulkInsert: MID моба верен (999)');

  t.suite('native-spatial-grid: очистка clear');
  grid.clear();
  const resEmpty = grid.queryRadius(-150, -250, 100, outP, outM);
  t.eq(resEmpty.players, 0, 'после clear сетка пуста (игроки)');
  t.eq(resEmpty.mobs, 0, 'после clear сетка пуста (мобы)');
  t.eq(grid.hasPlayerNear(-150, -250, 100), false, 'hasPlayerNear возвращает false после clear');
};
