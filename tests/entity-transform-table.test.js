// ============================================================
//  TESTS / ENTITY-TRANSFORM-TABLE.TEST.JS
//  Unit tests for Data-Oriented Design (DOD) EntityTransformTable
// ============================================================
'use strict';

const { EntityTransformTable, TYPE_PLAYER, TYPE_MOB, TYPE_NONE } = require('../shared/entity-transform-table.js');

module.exports = function (t) {
  t.suite('entity-transform-table: базовые операции и память');

  const table = new EntityTransformTable(16);
  t.ok(table.buffer instanceof Float32Array, 'буфер — Float32Array');
  t.eq(table.capacity, 16, 'начальная ёмкость = 16 слотов');

  const s0 = table.allocate(101, TYPE_PLAYER, 10.5, 0, 20.5, 100, 100, 7.5);
  t.eq(s0, 0, 'первый слот = 0');
  t.eq(table.getX(s0), 10.5, 'getX возвращает X');
  t.eq(table.getZ(s0), 20.5, 'getZ возвращает Z');
  t.eq(table.getHp(s0), 100, 'getHp возвращает HP');

  const s1 = table.allocate(202, TYPE_MOB, 13.5, 0, 24.5, 50, 50, 3.5);
  t.eq(s1, 1, 'второй слот = 1');

  t.suite('entity-transform-table: расчёт дистанций (dist2)');
  // dx = 13.5 - 10.5 = 3; dz = 24.5 - 20.5 = 4; dx*dx + dz*dz = 9 + 16 = 25
  const d2 = table.dist2(s0, s1);
  t.ok(Math.abs(d2 - 25.0) < 0.001, 'dist2 между слотами равен 25.0');

  const d2Coords = table.dist2Coords(s0, 10.5, 20.5);
  t.ok(Math.abs(d2Coords - 0.0) < 0.001, 'dist2Coords до точки равен 0');

  t.ok(table.isWithinRange2(s0, s1, 26.0), 'isWithinRange2 возвращает true при r2 = 26');
  t.ok(!table.isWithinRange2(s0, s1, 24.0), 'isWithinRange2 возвращает false при r2 = 24');

  t.suite('entity-transform-table: обновление позиций и HP');
  table.updatePos(s0, 50, 10, 60);
  t.eq(table.getX(s0), 50, 'обновлённый X = 50');
  t.eq(table.getZ(s0), 60, 'обновлённый Z = 60');

  table.updateHp(s0, 85);
  t.eq(table.getHp(s0), 85, 'обновлённый HP = 85');

  t.suite('entity-transform-table: Zero-GC пул слотов (freeList)');
  table.free(s0);
  t.eq(table.getHp(s0), 0, 'после free HP = 0');
  t.eq(table.buffer[s0 * EntityTransformTable.STRIDE + 6], TYPE_NONE, 'тип стал TYPE_NONE');

  const sReused = table.allocate(303, TYPE_PLAYER, 1, 2, 3, 200, 200, 8);
  t.eq(sReused, 0, 'повторное выделение переиспользовало освобождённый слот 0 без роста');

  t.suite('entity-transform-table: непрерывный поиск findClosest');
  table.updatePos(sReused, 100, 0, 100);
  table.updatePos(s1, 105, 0, 100); // mob на расстоянии 5 м (d2 = 25)

  const s2 = table.allocate(203, TYPE_MOB, 110, 0, 100, 60, 60, 3.5); // mob на расстоянии 10 м (d2 = 100)

  const closest = table.findClosest(TYPE_MOB, 100, 100, 2500);
  t.ok(closest !== null, 'найден ближайший моб');
  t.eq(closest.id, 202, 'id ближайшего моба = 202');
  t.ok(Math.abs(closest.dist2 - 25.0) < 0.001, 'дистанция до ближайшего моба = 25');

  t.suite('entity-transform-table: авторасширение буфера (_grow)');
  for (let i = 0; i < 20; i++) {
    table.allocate(1000 + i, TYPE_MOB, i, 0, i, 10, 10, 3);
  }
  t.ok(table.capacity >= 32, 'ёмкость буфера удвоена при переполнении');
};
