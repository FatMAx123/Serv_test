// ============================================================
//  SHARED / ZONE-SHARDING.JS
//  Пространственное зонирование (Spatial Sharding) для
//  многоядерной кластеризации MMO-мира.
//  Делит остров на зоны ответственности между ядрами/воркерами CPU:
//    - Zone 1 (Town): Деревня, гавань, торговая зона, склад, мирная зона.
//    - Zone 2 (East): Восточные равнины, тренировочный полигон, река.
//    - Zone 3 (West): Западная пустошь, свалка, карьеры, вулкан.
//    - Zone 4 (North): Северные руины, холмы Астарда, катакомбы.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZONE_SHARDING = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var ZONES = [
    {
      id: 'town',
      index: 0,
      name: 'Деревня поющей стали',
      // Центр деревни: x = -107.5, z = -246.4, радиус мирного купола ~350 м
      centerX: -107.5,
      centerZ: -246.4,
      radius: 350,
      peace: true
    },
    {
      id: 'east_plains',
      index: 1,
      name: 'Восточные равнины и полигон',
      bounds: { minX: 0, maxX: 2000, minZ: -1000, maxZ: 2000 },
      peace: false
    },
    {
      id: 'west_wasteland',
      index: 2,
      name: 'Западная пустошь и карьеры',
      bounds: { minX: -2000, maxX: 0, minZ: -1000, maxZ: 2000 },
      peace: false
    },
    {
      id: 'north_ruins',
      index: 3,
      name: 'Северные холмы и руины',
      bounds: { minX: -2000, maxX: 2000, minZ: -2500, maxZ: -1000 },
      peace: false
    }
  ];

  var HYSTERESIS = 15; // 15 метров гистерезисный буфер против дребезга (Handoff Thrashing)

  /**
   * Определение зоны по координатам игрока / моба с поддержкой гистерезиса.
   * @param {number} x
   * @param {number} z
   * @param {string|number} [currentZoneOrWorker] Текущая зона ('town', 0, 1) или воркер игрока
   * @returns {object} Конфигурация зоны
   */
  function getZoneAt(x, z, currentZoneOrWorker) {
    var qx = +x || 0;
    var qz = +z || 0;

    var isCurTown = (currentZoneOrWorker === 'town' || currentZoneOrWorker === 0 || currentZoneOrWorker === 1);
    var isCurNorth = (currentZoneOrWorker === 'north_ruins' || currentZoneOrWorker === 3 || currentZoneOrWorker === 4);
    var isCurEast = (currentZoneOrWorker === 'east_plains' || currentZoneOrWorker === 1 || currentZoneOrWorker === 2);
    var isCurWest = (currentZoneOrWorker === 'west_wasteland' || currentZoneOrWorker === 2 || currentZoneOrWorker === 3);

    // 1. Приоритет: мирная зона центрального города (Town)
    var town = ZONES[0];
    var dx = qx - town.centerX;
    var dz = qz - town.centerZ;
    var dist2 = dx * dx + dz * dz;

    // Если игрок уже в городе — выход требует (350 + 15) = 365 м.
    // Если игрок вне города — вход требует (350 - 10) = 340 м.
    var townR = isCurTown ? (town.radius + HYSTERESIS) : (town.radius - 10);
    if (dist2 <= townR * townR) {
      return town;
    }

    // 2. Северные земли (за рекой и холмами, граница z = -1000)
    // Если уже на Севере — выход при z >= (-1000 + HYSTERESIS = -985).
    // Если не на Севере — вход при z < (-1000 - HYSTERESIS = -1015).
    var northZ = isCurNorth ? (-1000 + HYSTERESIS) : (-1000 - HYSTERESIS);
    if (qz < northZ) {
      return ZONES[3];
    }

    // 3. Восток или Запад (граница x = 0)
    // Если уже на Востоке — переход на Запад только при x < -HYSTERESIS.
    // Если уже на Западе — переход на Восток только при x > HYSTERESIS.
    var eastX = isCurEast ? -HYSTERESIS : (isCurWest ? HYSTERESIS : 0);
    if (qx >= eastX) {
      return ZONES[1];
    } else {
      return ZONES[2];
    }
  }

  /**
   * Привязка зоны к конкретному воркеру кластера (по модулю числа активных воркеров).
   * @param {number} x
   * @param {number} z
   * @param {number} totalWorkers
   * @param {number} [currentWorkerId] Текущий ID воркера (для гистерезиса)
   * @returns {number} ID воркера (1..totalWorkers)
   */
  function getWorkerForCoords(x, z, totalWorkers, currentWorkerId) {
    var n = Math.max(1, totalWorkers | 0);
    if (n === 1) return 1;
    var zone = getZoneAt(x, z, currentWorkerId);
    return (zone.index % n) + 1;
  }

  /**
   * Проверка, находится ли позиция в приграничной полосе (в пределах margin от другой зоны).
   * @param {number} x
   * @param {number} z
   * @param {number} [margin=90]
   * @param {number} [totalWorkers=4]
   * @returns {{ near: boolean, borderWorkers: number[] }}
   */
  function isNearBorder(x, z, margin, totalWorkers) {
    var m = margin || 90;
    var qx = +x || 0;
    var qz = +z || 0;
    var n = Math.max(1, totalWorkers | 0);
    var currentWorker = getWorkerForCoords(qx, qz, n);
    var targetWorkers = new Set();

    // 1. Дистанция до купола Города
    var town = ZONES[0];
    var dx = qx - town.centerX;
    var dz = qz - town.centerZ;
    var dist = Math.hypot(dx, dz);
    if (Math.abs(dist - town.radius) <= m) {
      targetWorkers.add(1); // Town
      if (qx >= 0) targetWorkers.add(2 % n || n); // East
      else targetWorkers.add(3 % n || n); // West
    }

    // 2. Дистанция до границы Севера (z = -1000)
    if (Math.abs(qz - (-1000)) <= m) {
      targetWorkers.add(4 % n || n); // North
      if (qx >= 0) targetWorkers.add(2 % n || n); // East
      else targetWorkers.add(3 % n || n); // West
    }

    // 3. Дистанция до границы Восток-Запад (x = 0, южнее z = -1000)
    if (Math.abs(qx) <= m && qz >= -1000) {
      targetWorkers.add(2 % n || n); // East
      targetWorkers.add(3 % n || n); // West
    }

    targetWorkers.delete(currentWorker);
    return {
      near: targetWorkers.size > 0,
      borderWorkers: Array.from(targetWorkers)
    };
  }

  return {
    ZONES: ZONES,
    HYSTERESIS: HYSTERESIS,
    getZoneAt: getZoneAt,
    getWorkerForCoords: getWorkerForCoords,
    isNearBorder: isNearBorder
  };
});
