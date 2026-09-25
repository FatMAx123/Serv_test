// ============================================================
//  SHARED / ENTITY-TRANSFORM-TABLE.JS
//  Data-Oriented Design (DOD) & Struct-of-Arrays (SoA) Transform Table
//
//  Уровень 3 оптимизации архитектуры:
//  - Заменяет беспорядочный обход разрозненных JS-объектов в куче V8
//    на непрерывный (contiguous) типизированный буфер Float32Array в L1/L2 кэше CPU.
//  - Слот сущности: 8 x Float32 (32 байта на сущность, ровно половина 64-байтной кэш-линии CPU):
//      [0] = x (метры)
//      [1] = y (высота)
//      [2] = z (метры)
//      [3] = hp (текущее здоровье)
//      [4] = maxHp (максимальное здоровье)
//      [5] = speed (базовая скорость)
//      [6] = type (1 = Player, 2 = Mob, 0 = Empty)
//      [7] = id (pid / mid)
//  - Zero-GC: пул слотов с O(1) выделением/освобождением без аллокаций.
//  - Быстрый расчёт дистанций dist2 прямо из памяти буфера без обращений к свойствам V8.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ENTITY_TRANSFORMS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var STRIDE = 8;
  var TYPE_NONE = 0;
  var TYPE_PLAYER = 1;
  var TYPE_MOB = 2;

  function EntityTransformTable(initialCapacity) {
    this.capacity = initialCapacity && initialCapacity > 0 ? initialCapacity : 4096;
    this.buffer = new Float32Array(this.capacity * STRIDE);
    this.freeList = [];
    this.activeCount = 0;
    this.maxSlot = 0;
  }

  EntityTransformTable.TYPE_NONE = TYPE_NONE;
  EntityTransformTable.TYPE_PLAYER = TYPE_PLAYER;
  EntityTransformTable.TYPE_MOB = TYPE_MOB;
  EntityTransformTable.STRIDE = STRIDE;

  /**
   * Выделение слота для сущности в плоском буфере.
   * @param {number} id Идентификатор (pid или mid)
   * @param {number} type Тип (1 = Player, 2 = Mob)
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {number} hp
   * @param {number} maxHp
   * @param {number} speed
   * @returns {number} Номер слота
   */
  EntityTransformTable.prototype.allocate = function (id, type, x, y, z, hp, maxHp, speed) {
    var slot;
    if (this.freeList.length > 0) {
      slot = this.freeList.pop();
    } else {
      slot = this.maxSlot++;
      if (this.maxSlot >= this.capacity) {
        this._grow();
      }
    }

    var o = slot * STRIDE;
    var b = this.buffer;
    b[o + 0] = +x || 0;
    b[o + 1] = +y || 0;
    b[o + 2] = +z || 0;
    b[o + 3] = +hp || 0;
    b[o + 4] = +maxHp || 0;
    b[o + 5] = +speed || 0;
    b[o + 6] = type;
    b[o + 7] = +id || 0;

    this.activeCount++;
    return slot;
  };

  /**
   * Освобождение слота при удалении или смерти сущности (Zero-GC).
   */
  EntityTransformTable.prototype.free = function (slot) {
    if (slot < 0 || slot >= this.maxSlot) return;
    var o = slot * STRIDE;
    var b = this.buffer;
    if (b[o + 6] === TYPE_NONE) return; // уже свободен

    b[o + 6] = TYPE_NONE; // помечаем пустым
    b[o + 3] = 0; // hp = 0
    this.freeList.push(slot);
    this.activeCount--;
  };

  /**
   * Динамическое удвоение буфера при превышении исходной ёмкости.
   */
  EntityTransformTable.prototype._grow = function () {
    var newCapacity = this.capacity * 2;
    var newBuffer = new Float32Array(newCapacity * STRIDE);
    newBuffer.set(this.buffer);
    this.buffer = newBuffer;
    this.capacity = newCapacity;
  };

  /**
   * Обновление координат (x, y, z).
   */
  EntityTransformTable.prototype.updatePos = function (slot, x, y, z) {
    var o = slot * STRIDE;
    var b = this.buffer;
    b[o + 0] = +x;
    b[o + 1] = +y;
    b[o + 2] = +z;
  };

  /**
   * Обновление здоровья HP.
   */
  EntityTransformTable.prototype.updateHp = function (slot, hp) {
    var o = slot * STRIDE;
    this.buffer[o + 3] = +hp;
  };

  /**
   * Быстрое чтение координаты X.
   */
  EntityTransformTable.prototype.getX = function (slot) {
    return this.buffer[slot * STRIDE + 0];
  };

  /**
   * Быстрое чтение координаты Z.
   */
  EntityTransformTable.prototype.getZ = function (slot) {
    return this.buffer[slot * STRIDE + 2];
  };

  /**
   * Быстрое чтение HP.
   */
  EntityTransformTable.prototype.getHp = function (slot) {
    return this.buffer[slot * STRIDE + 3];
  };

  /**
   * Высокоскоростной расчёт квадрата дистанции между двумя слотами (dist2) в регистрах CPU.
   */
  EntityTransformTable.prototype.dist2 = function (slotA, slotB) {
    var oA = slotA * STRIDE;
    var oB = slotB * STRIDE;
    var b = this.buffer;
    var dx = b[oA + 0] - b[oB + 0];
    var dz = b[oA + 2] - b[oB + 2];
    return dx * dx + dz * dz;
  };

  /**
   * Расчёт квадрата дистанции от слота до произвольной точки (x, z).
   */
  EntityTransformTable.prototype.dist2Coords = function (slot, x, z) {
    var o = slot * STRIDE;
    var b = this.buffer;
    var dx = b[o + 0] - x;
    var dz = b[o + 2] - z;
    return dx * dx + dz * dz;
  };

  /**
   * Проверка нахождения в радиусе без вычисления квадратного корня.
   */
  EntityTransformTable.prototype.isWithinRange2 = function (slotA, slotB, r2) {
    var oA = slotA * STRIDE;
    var oB = slotB * STRIDE;
    var b = this.buffer;
    var dx = b[oA + 0] - b[oB + 0];
    var dz = b[oA + 2] - b[oB + 2];
    return (dx * dx + dz * dz) <= r2;
  };

  /**
   * Проверка нахождения слота в радиусе от координат (x, z).
   */
  EntityTransformTable.prototype.isWithinRange2Coords = function (slot, x, z, r2) {
    var o = slot * STRIDE;
    var b = this.buffer;
    var dx = b[o + 0] - x;
    var dz = b[o + 2] - z;
    return (dx * dx + dz * dz) <= r2;
  };

  /**
   * Поиск ближайшей живой сущности указанного типа в радиусе maxR.
   * Континуальное сканирование плоского буфера в L1/L2 кэше CPU.
   * @param {number} type TYPE_PLAYER или TYPE_MOB
   * @param {number} x
   * @param {number} z
   * @param {number} maxR2 Квадрат максимального радиуса поиска
   * @param {function(id: number, slot: number): boolean} [filterFn]
   * @returns {{slot: number, id: number, dist2: number}|null}
   */
  var _closestResult = { slot: -1, id: 0, dist2: 0 };

  EntityTransformTable.prototype.findClosest = function (type, x, z, maxR2, filterFn) {
    var b = this.buffer;
    var max = this.maxSlot;
    var bestDist = maxR2;
    var bestSlot = -1;
    var bestId = 0;

    for (var slot = 0; slot < max; slot++) {
      var o = slot * STRIDE;
      if (b[o + 6] !== type || b[o + 3] <= 0) continue; // не совпадает тип или мёртв

      var dx = b[o + 0] - x;
      var dz = b[o + 2] - z;
      var d2 = dx * dx + dz * dz;

      if (d2 < bestDist) {
        var id = b[o + 7] | 0;
        if (!filterFn || filterFn(id, slot)) {
          bestDist = d2;
          bestSlot = slot;
          bestId = id;
        }
      }
    }

    if (bestSlot !== -1) {
      _closestResult.slot = bestSlot;
      _closestResult.id = bestId;
      _closestResult.dist2 = bestDist;
      return _closestResult;
    }
    return null;
  };

  return {
    EntityTransformTable: EntityTransformTable,
    TYPE_NONE: TYPE_NONE,
    TYPE_PLAYER: TYPE_PLAYER,
    TYPE_MOB: TYPE_MOB,
    STRIDE: STRIDE
  };
});
