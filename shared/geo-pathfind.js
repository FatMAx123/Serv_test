// ============================================================
//  SHARED / GEO-PATHFIND.JS — A* поиск пути по геодате мира (L2 C1).
//
//  Решает проблему застревания мобов и боссов в вогнутых препятствиях
//  (U-образные заборы, ниши зданий, углы скал, скопления пропсов).
//
//  Особенности:
//    - 8-направленный A* с шагом сетки ~1.2м
//    - Евклидова эвристика с ограничением бюджета узлов (maxNodes = 400)
//    - Проверка диагональных срезов углов (corner cutting prevention)
//    - Сглаживание пути лучом (String Pulling / Raycast Smoothing)
//      через GEO.moveAlong (исключает лишние зигзаги)
//    - Поддержка частичных путей (partial path) при изоляции цели
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GeoPathfind = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var DEFAULT_GRID_STEP = 1.2;
  var DEFAULT_MAX_NODES = 400;
  var DEFAULT_TARGET_TOLERANCE = 1.2;

  // 8 направлений: 4 ортогональных + 4 диагональных
  var DIRS = [
    { dx: 1, dz: 0, cost: 1.0 },
    { dx: -1, dz: 0, cost: 1.0 },
    { dx: 0, dz: 1, cost: 1.0 },
    { dx: 0, dz: -1, cost: 1.0 },
    { dx: 1, dz: 1, cost: 1.4142 },
    { dx: 1, dz: -1, cost: 1.4142 },
    { dx: -1, dz: 1, cost: 1.4142 },
    { dx: -1, dz: -1, cost: 1.4142 }
  ];

  /**
   * Двоичная куча (Min-Heap) для приоритетной очереди A*.
   * Оптимизирована под низкий GC и быстрые операции O(log N).
   */
  function MinHeap() {
    this.heap = [];
  }

  MinHeap.prototype.push = function (node) {
    this.heap.push(node);
    this._up(this.heap.length - 1);
  };

  MinHeap.prototype.pop = function () {
    if (this.heap.length === 0) return null;
    var top = this.heap[0];
    var bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._down(0);
    }
    return top;
  };

  MinHeap.prototype.size = function () {
    return this.heap.length;
  };

  MinHeap.prototype._up = function (i) {
    while (i > 0) {
      var p = (i - 1) >> 1;
      if (this.heap[i].f < this.heap[p].f) {
        var tmp = this.heap[i];
        this.heap[i] = this.heap[p];
        this.heap[p] = tmp;
        i = p;
      } else break;
    }
  };

  MinHeap.prototype._down = function (i) {
    var len = this.heap.length;
    while (true) {
      var best = i;
      var l = (i << 1) + 1;
      var r = l + 1;
      if (l < len && this.heap[l].f < this.heap[best].f) best = l;
      if (r < len && this.heap[r].f < this.heap[best].f) best = r;
      if (best !== i) {
        var tmp = this.heap[i];
        this.heap[i] = this.heap[best];
        this.heap[best] = tmp;
        i = best;
      } else break;
    }
  };

  function cellKey(kx, kz) {
    return kx + ',' + kz;
  }

  /**
   * Сглаживание пути (String Pulling) через raycast GEO.moveAlong.
   * Устраняет зигзаги дискретной сетки и оставляет только ключевые точки поворота.
   */
  function smoothPath(path, geo, startY) {
    if (!path || path.length <= 2) return path;
    if (!geo || !geo.ready || !geo.ready()) return [path[0], path[path.length - 1]];

    var smoothed = [path[0]];
    var currentIdx = 0;

    while (currentIdx < path.length - 1) {
      var furthestIdx = currentIdx + 1;
      var p1 = smoothed[smoothed.length - 1];

      for (var j = path.length - 1; j > currentIdx + 1; j--) {
        var p2 = path[j];
        var yHint = p1.y != null ? p1.y : startY;
        var res = geo.moveAlong(p1.x, p1.z, p2.x, p2.z, yHint);
        var distTotal = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        var remDist = Math.hypot(res.x - p2.x, res.z - p2.z);

        if (!res.blocked && remDist < 0.25) {
          furthestIdx = j;
          break;
        }
      }

      smoothed.push(path[furthestIdx]);
      currentIdx = furthestIdx;
    }

    return smoothed;
  }

  /**
   * Основной метод A* поиска пути.
   *
   * @param {number} startX
   * @param {number} startZ
   * @param {number} targetX
   * @param {number} targetZ
   * @param {object} [opts]
   *   - geo: ссылка на объект GEO (по умолчанию глобальный/модульный GEO)
   *   - y: начальная высота персонажа/моба (для многоярусности и standY)
   *   - gridStep: шаг дискретизации (по умолчанию 1.2 м)
   *   - maxNodes: лимит раскрытия узлов (по умолчанию 400)
   *   - targetTolerance: радиус попадания в цель (по умолчанию 1.2 м)
   *   - smooth: включить сглаживание лучом (по умолчанию true)
   *   - allowPartial: возвращать путь до ближайшей точки при блоке цели (по умолчанию true)
   * @returns {Array<{x: number, z: number, y: number}>|null}
   */
  function findPath(startX, startZ, targetX, targetZ, opts) {
    opts = opts || {};
    var geo = opts.geo || (typeof root !== 'undefined' ? root.GEO : null);
    if (!geo && typeof require !== 'undefined') {
      try { geo = require('./geo.js'); } catch (e) { /* ignore */ }
    }

    if (!isFinite(startX) || !isFinite(startZ) || !isFinite(targetX) || !isFinite(targetZ)) {
      return null;
    }

    var startY = (opts.y != null && isFinite(opts.y))
      ? opts.y
      : ((geo && geo.ready && geo.ready()) ? geo.standY(startX, startZ) : 0);
    var targetY = (geo && geo.ready && geo.ready()) ? geo.standY(targetX, targetZ, startY) : startY;

    var directDist = Math.hypot(targetX - startX, targetZ - startZ);
    var targetTol = (opts.targetTolerance != null && opts.targetTolerance > 0) ? opts.targetTolerance : DEFAULT_TARGET_TOLERANCE;

    // 1. Быстрая проверка: мы уже у цели
    if (directDist <= targetTol) {
      return [{ x: targetX, z: targetZ, y: targetY }];
    }

    // 2. Быстрая проверка: прямая видимость без препятствий
    if (geo && geo.ready && geo.ready()) {
      var direct = geo.moveAlong(startX, startZ, targetX, targetZ, startY);
      var endDist = Math.hypot(direct.x - targetX, direct.z - targetZ);
      if (!direct.blocked && endDist <= 0.2) {
        return [{ x: targetX, z: targetZ, y: direct.y }];
      }
    } else {
      // Геодата не загружена — движение напрямую
      return [{ x: targetX, z: targetZ, y: targetY }];
    }

    // 3. Прямой путь заблокирован (угол, стена, вогнутое препятствие). Запуск A*.
    var gridStep = (opts.gridStep != null && opts.gridStep > 0.1) ? opts.gridStep : DEFAULT_GRID_STEP;
    var invStep = 1.0 / gridStep;
    var maxNodes = (opts.maxNodes != null && opts.maxNodes > 0) ? opts.maxNodes : DEFAULT_MAX_NODES;
    var targetTol2 = targetTol * targetTol;

    function heuristic(x, z) {
      return Math.hypot(targetX - x, targetZ - z);
    }

    var startKx = Math.round(startX * invStep);
    var startKz = Math.round(startZ * invStep);
    var startKey = cellKey(startKx, startKz);

    var openSet = new MinHeap();
    var cameFrom = new Map();
    var gScore = new Map();
    var closedSet = new Set();

    var startH = heuristic(startX, startZ);
    var startNode = {
      key: startKey,
      kx: startKx,
      kz: startKz,
      x: startX,
      z: startZ,
      y: startY,
      g: 0,
      h: startH,
      f: startH
    };

    openSet.push(startNode);
    gScore.set(startKey, 0);

    var bestNode = startNode;
    var bestH = startH;
    var targetNode = null;
    var exploredCount = 0;

    while (openSet.size() > 0 && exploredCount < maxNodes) {
      var current = openSet.pop();
      if (!current) break;

      if (closedSet.has(current.key)) continue;
      closedSet.add(current.key);
      exploredCount++;

      // Проверка достижения цели
      var toTarget2 = (targetX - current.x) * (targetX - current.x) + (targetZ - current.z) * (targetZ - current.z);
      if (toTarget2 <= targetTol2) {
        targetNode = current;
        break;
      }

      // Обновление ближайшей точки к цели (на случай частичного пути)
      if (current.h < bestH) {
        bestH = current.h;
        bestNode = current;
      }

      // Раскрытие соседей
      for (var d = 0; d < DIRS.length; d++) {
        var dir = DIRS[d];
        var nkx = current.kx + dir.dx;
        var nkz = current.kz + dir.dz;
        var nKey = cellKey(nkx, nkz);

        if (closedSet.has(nKey)) continue;

        var nx = nkx * gridStep;
        var nz = nkz * gridStep;
        var ny = geo.standY(nx, nz, current.y);

        // Предотвращение срезания углов диагоналями
        if (dir.dx !== 0 && dir.dz !== 0) {
          var ox1 = current.x + dir.dx * gridStep;
          var oz1 = current.z;
          var ox2 = current.x;
          var oz2 = current.z + dir.dz * gridStep;
          if (geo.hitsWall(current.x, current.z, ox1, oz1) || geo.hitsWall(current.x, current.z, ox2, oz2)) {
            continue;
          }
          if (geo.hitsProp(current.x, current.z, ox1, oz1, current.y + 0.5) || geo.hitsProp(current.x, current.z, ox2, oz2, current.y + 0.5)) {
            continue;
          }
        }

        // Проверка проходимости подшага
        if (!geo.canStep(current.x, current.z, nx, nz, current.y)) {
          continue;
        }

        var stepCost = dir.cost * gridStep;
        var tentativeG = current.g + stepCost;
        var prevG = gScore.get(nKey);

        if (prevG == null || tentativeG < prevG) {
          gScore.set(nKey, tentativeG);
          var h = heuristic(nx, nz);
          var nNode = {
            key: nKey,
            kx: nkx,
            kz: nkz,
            x: nx,
            z: nz,
            y: ny,
            g: tentativeG,
            h: h,
            f: tentativeG + h
          };
          cameFrom.set(nKey, current);
          openSet.push(nNode);
        }
      }
    }

    // Восстановление пути
    var endPoint = targetNode;
    var reachedGoal = !!targetNode;

    if (!endPoint && opts.allowPartial !== false && bestNode && bestNode !== startNode) {
      endPoint = bestNode;
    }

    if (!endPoint) {
      return null;
    }

    var rawPath = [];
    var curr = endPoint;
    while (curr) {
      rawPath.push({ x: curr.x, z: curr.z, y: curr.y });
      curr = cameFrom.get(curr.key);
    }
    rawPath.reverse();

    // Если дошли до цели, гарантируем финальную точку в точных координатах targetX, targetZ
    if (reachedGoal) {
      var last = rawPath[rawPath.length - 1];
      if (Math.hypot(last.x - targetX, last.z - targetZ) > 0.05) {
        rawPath.push({ x: targetX, z: targetZ, y: targetY });
      }
    }

    // 4. Сглаживание пути (String Pulling)
    if (opts.smooth !== false && rawPath.length > 2) {
      return smoothPath(rawPath, geo, startY);
    }

    return rawPath;
  }

  return {
    findPath: findPath,
    smoothPath: smoothPath,
    MinHeap: MinHeap
  };
});
