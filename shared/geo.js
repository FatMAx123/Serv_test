// ============================================================
//  SHARED / GEO.JS — серверная геодата в духе L2 C1 GeoEngine.
//
//  Клиент уже ставит ноги на меш (TerrainHeight) и упирается в пропсы/берег.
//  Сервер до 3.2 жил в плоском (x, z): сквозь скалу, дом и стену острова.
//
//  Здесь тот же меш и те же пропсы, плюс сегменты Iwals:
//    heightAt / standY  — поверхность под точкой (как Terrain.standY.ground)
//    canWalk            — суша, не море, внутри мира
//    moveAlong          — шаг не сквозь стену/скалу (substep + slide по осям)
//    canSee             — 3D LoS: луч глаз→грудь vs высота меша, пропсы, стены
//
//  L2: ячейка ~16 единиц с NSWE. У нас метр мира ≈ 11 L2, поэтому substep
//  0.5 м ≈ половина L2-клетки. Климб/спуск — как maxZDiff между соседними
//  клетками, не «точка назначения на суше».
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GEO = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var SEA = -35.0;
  /** Длина подшага при валидации хода (м). */
  var STEP = 0.5;
  /** Макс. подъём, м на 1 м горизонтали (~44°). L2 не пускает в вертикаль. */
  var CLIMB_PER_M = 0.95;
  /** Спуск свободнее подъёма: обрыв, но не «телепорт под карту». */
  var DROP_PER_M = 2.6;
  var EYE_H = 1.55;
  var CHEST_H = 1.10;
  var LOS_STEP = 0.4;
  /** Первый/последний метр луча — внутри коллайдера, не стена. */
  var LOS_END = 0.45;
  /** Луч чуть выше поверхности: трава/неровность не глушат LoS. */
  var LOS_GROUND_CLEAR = 0.35;
  var PLAYER_FOOT = 0.95;
  var WALL_CELL = 24;

  var _td = null;
  var _th = null;
  var _pc = null;
  var _walls = null; // Map cellKey -> [{x0,z0,x1,z1}]
  var _wallCount = 0;
  var _ready = false;

  function cellKey(cx, cz) { return cx + ',' + cz; }

  function hashWalls(segs) {
    var map = new Map();
    if (!segs || !segs.length) return map;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (!s) continue;
      var x0 = +s.x0, z0 = +s.z0, x1 = +s.x1, z1 = +s.z1;
      if (!isFinite(x0) || !isFinite(z0) || !isFinite(x1) || !isFinite(z1)) continue;
      var minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
      var minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
      var c0x = Math.floor(minX / WALL_CELL), c1x = Math.floor(maxX / WALL_CELL);
      var c0z = Math.floor(minZ / WALL_CELL), c1z = Math.floor(maxZ / WALL_CELL);
      var rec = { x0: x0, z0: z0, x1: x1, z1: z1 };
      for (var cx = c0x; cx <= c1x; cx++) {
        for (var cz = c0z; cz <= c1z; cz++) {
          var k = cellKey(cx, cz);
          var arr = map.get(k);
          if (!arr) { arr = []; map.set(k, arr); }
          arr.push(rec);
        }
      }
    }
    return map;
  }

  function bind(opts) {
    opts = opts || {};
    _td = opts.TerrainData || null;
    _th = opts.TerrainHeight || null;
    _pc = opts.PropsCollision || null;
    var segs = opts.wallSegments || [];
    _walls = hashWalls(segs);
    _wallCount = segs.length;
    if (_th && typeof _th.prewarm === 'function') _th.prewarm();
    _ready = !!( _td && _td.bakedHeights && _td.positions );
    return _ready;
  }

  function ready() { return _ready; }

  function heightAtRaw(x, z) {
    var d = _td;
    if (!d || !d.bakedHeights) return SEA;
    if (x < d.minX || x > d.maxX || z < d.minZ || z > d.maxZ) return SEA - 5.0;
    var fx = (x - d.minX) / (d.maxX - d.minX) * (d.bakedW - 1);
    var fz = (z - d.minZ) / (d.maxZ - d.minZ) * (d.bakedH - 1);
    var ix = Math.floor(fx), iz = Math.floor(fz);
    ix = Math.max(0, Math.min(d.bakedW - 2, ix));
    iz = Math.max(0, Math.min(d.bakedH - 2, iz));
    var tx = fx - ix, tz = fz - iz, bw = d.bakedW;
    var h = d.bakedHeights;
    return h[iz * bw + ix] * (1 - tx) * (1 - tz)
      + h[iz * bw + ix + 1] * tx * (1 - tz)
      + h[(iz + 1) * bw + ix] * (1 - tx) * tz
      + h[(iz + 1) * bw + ix + 1] * tx * tz;
  }

  function meshY(x, z) {
    if (!_th || typeof _th.groundY !== 'function') return null;
    var bake = heightAtRaw(x, z);
    return _th.groundY(x, z, Math.max(bake + 120, 200), Math.max(bake + 200, 400));
  }

  /** Y поверхности земли (без высоты ступни). */
  function groundY(x, z) {
    var meshH = meshY(x, z);
    if (meshH != null && isFinite(meshH)) return meshH + 0.04;
    return heightAtRaw(x, z);
  }

  /** Y глаз персонажа, стоящего в (x,z). */
  function eyeY(x, z) { return groundY(x, z) + EYE_H; }

  function standY(x, z, currentY) {
    var g = groundY(x, z);
    if (_pc && typeof _pc.standYAt === 'function') {
      var py = (currentY != null && isFinite(currentY)) ? currentY : (g + PLAYER_FOOT);
      var top = _pc.standYAt(x, z, py);
      if (top != null) {
        if (currentY != null && isFinite(currentY)) {
          if (Math.abs(currentY - top) <= Math.abs(currentY - g) || currentY >= top - 0.5) {
            return top;
          }
        } else if (top > g && (top - g <= 1.5 || g < SEA)) {
          return top;
        }
      }
    }
    return g;
  }

  function inWorld(x, z) {
    var d = _td;
    if (!d) return true;
    return x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ;
  }

  /** Суша: bake выше моря, не «дно» minY, ИЛИ настил моста/платформы над водой. */
  function canWalk(x, z, currentY) {
    var d = _td;
    if (!d || !d.bakedHeights) return true;
    if (!inWorld(x, z)) return false;
    if (currentY != null && isFinite(currentY)) {
      var sy = standY(x, z, currentY);
      if (sy >= SEA - 0.5 && sy > heightAtRaw(x, z) + 0.8) {
        return true;
      }
    }
    var h = heightAtRaw(x, z);
    if (d.minY != null && h <= d.minY + 2.0) return false;
    return h >= SEA - 0.5;
  }

  function segsHit(ax, az, bx, bz, x0, z0, x1, z1) {
    var dax = bx - ax, daz = bz - az;
    var dbx = x1 - x0, dbz = z1 - z0;
    var den = dax * dbz - daz * dbx;
    if (Math.abs(den) < 1e-9) return false;
    var t = ((x0 - ax) * dbz - (z0 - az) * dbx) / den;
    var u = ((x0 - ax) * daz - (z0 - az) * dax) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function hitsWall(ax, az, bx, bz) {
    if (!_walls || !_walls.size) return false;
    var minX = Math.min(ax, bx) - 1, maxX = Math.max(ax, bx) + 1;
    var minZ = Math.min(az, bz) - 1, maxZ = Math.max(az, bz) + 1;
    var c0x = Math.floor(minX / WALL_CELL), c1x = Math.floor(maxX / WALL_CELL);
    var c0z = Math.floor(minZ / WALL_CELL), c1z = Math.floor(maxZ / WALL_CELL);
    var seen = [];
    for (var cx = c0x; cx <= c1x; cx++) {
      for (var cz = c0z; cz <= c1z; cz++) {
        var list = _walls.get(cellKey(cx, cz));
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          var w = list[i];
          if (w._t === hitsWall._tick) continue;
          w._t = hitsWall._tick;
          seen.push(w);
          if (segsHit(ax, az, bx, bz, w.x0, w.z0, w.x1, w.z1)) {
            hitsWall._tick++;
            return true;
          }
        }
      }
    }
    hitsWall._tick++;
    return false;
  }
  hitsWall._tick = 1;

  function hitsProp(ax, az, bx, bz, y) {
    if (!_pc || typeof _pc.hitsPropXZ !== 'function') return false;
    var py = (y != null && isFinite(y)) ? y : 1.0;
    return !!_pc.hitsPropXZ(ax, az, bx, bz, py);
  }

  function slopeOk(ax, az, bx, bz, currentY) {
    var dist = Math.hypot(bx - ax, bz - az);
    if (!(dist > 1e-6)) return true;
    var ya = (currentY != null && isFinite(currentY)) ? standY(ax, az, currentY) : groundY(ax, az);
    var yb = (currentY != null && isFinite(currentY)) ? standY(bx, bz, currentY) : groundY(bx, bz);
    var dh = yb - ya;
    if (dh > CLIMB_PER_M * dist) return false;
    if (dh < -DROP_PER_M * dist) return false;
    return true;
  }

  /**
   * Один подшаг: суша/мост, склон, стена острова, проп.
   * yHint — высота ног в начале шага (чтобы попасть в Y-окно настила или пропса).
   */
  function canStep(ax, az, bx, bz, yHint) {
    var y = (yHint != null && isFinite(yHint)) ? yHint : standY(ax, az);
    if (!canWalk(bx, bz, y)) return false;
    if (!slopeOk(ax, az, bx, bz, y)) return false;
    if (hitsWall(ax, az, bx, bz)) return false;
    if (hitsProp(ax, az, bx, bz, y + 0.5)) return false;
    return true;
  }

  /**
   * Провести отрезок по геодате. Возвращает последнюю легальную точку.
   * Поддерживает 2.5D многоярусное движение по мостам и платформам при передаче startY.
   * Slide по осям — как клиентский _maxFreeStep: упёрся в угол — скользишь.
   */
  function moveAlong(ax, az, bx, bz, startY) {
    var initialY = (startY != null && isFinite(startY)) ? startY : standY(ax, az);
    if (!_ready) return { x: bx, z: bz, y: initialY, blocked: false, dist: Math.hypot(bx - ax, bz - az) };
    if (!isFinite(ax) || !isFinite(az) || !isFinite(bx) || !isFinite(bz)) {
      return { x: ax, z: az, y: initialY, blocked: true, dist: 0 };
    }
    var dx = bx - ax, dz = bz - az;
    var dist = Math.hypot(dx, dz);
    if (dist < 1e-5) return { x: ax, z: az, y: initialY, blocked: false, dist: 0 };
    var n = Math.max(1, Math.ceil(dist / STEP));
    var x = ax, z = az;
    var blocked = false;
    var y = initialY;
    for (var i = 1; i <= n; i++) {
      var t = i / n;
      var nx = ax + dx * t;
      var nz = az + dz * t;
      if (canStep(x, z, nx, nz, y)) {
        x = nx; z = nz; y = standY(x, z, y);
        continue;
      }
      blocked = true;
      var slid = false;
      if (canStep(x, z, nx, z, y)) {
        x = nx; y = standY(x, z, y); slid = true;
      } else if (canStep(x, z, x, nz, y)) {
        z = nz; y = standY(x, z, y); slid = true;
      }
      if (!slid) break;
    }
    return {
      x: x,
      z: z,
      y: standY(x, z, y),
      blocked: blocked,
      dist: Math.hypot(x - ax, z - az)
    };
  }

  /**
   * 3D LoS. Луч (ax,ay,az)→(bx,by,bz). Блокируется, если:
   *  — высота меша выше луча (скала, гребень),
   *  — отрезок режет стену острова,
   *  — отрезок режет коллизионный проп на высоте луча.
   */
  function canSee(ax, ay, az, bx, by, bz) {
    // Вызов двумя сущностями {x,z,y}: сервер раньше передавал (p, m)
    if (ax && typeof ax === 'object' && ay && typeof ay === 'object' && arguments.length < 3) {
      return canSeeGround(ax.x, ax.z, ay.x, ay.z, ax.y, ay.y);
    }
    if (!_ready) return true;
    if (![ax, ay, az, bx, by, bz].every(isFinite)) return false;
    var dx = bx - ax, dy = by - ay, dz = bz - az;
    var dist = Math.hypot(dx, dy, dz);
    if (dist < 0.2) return true;
    if (hitsWall(ax, az, bx, bz)) return false;
    var n = Math.max(2, Math.ceil(dist / LOS_STEP));
    var inv = 1 / n;
    for (var i = 1; i < n; i++) {
      var t = i * inv;
      var along = t * dist;
      if (along < LOS_END || along > dist - LOS_END) continue;
      var x = ax + dx * t;
      var y = ay + dy * t;
      var z = az + dz * t;
      var g = groundY(x, z);
      if (g > y - LOS_GROUND_CLEAR) return false;
      var px = ax + dx * (t - inv);
      var pz = az + dz * (t - inv);
      if (hitsProp(px, pz, x, z, y)) return false;
    }
    return true;
  }

  /** LoS двух стоящих на поверхности тел (игрок/моб) с учетом яруса высоты. */
  function canSeeGround(ax, az, bx, bz, ayHint, byHint) {
    var ya = ((ayHint != null && isFinite(ayHint)) ? standY(ax, az, ayHint) : groundY(ax, az)) + EYE_H;
    var yb = ((byHint != null && isFinite(byHint)) ? standY(bx, bz, byHint) : groundY(bx, bz)) + CHEST_H;
    return canSee(ax, ya, az, bx, yb, bz);
  }

  function stats() {
    return {
      ready: _ready,
      sea: SEA,
      step: STEP,
      climbPerM: CLIMB_PER_M,
      dropPerM: DROP_PER_M,
      walls: _wallCount,
      wallCells: _walls ? _walls.size : 0,
      hasMesh: !!( _th && _td && _td.positions ),
      hasProps: !!_pc,
      minX: _td ? _td.minX : 0,
      maxX: _td ? _td.maxX : 0,
      minZ: _td ? _td.minZ : 0,
      maxZ: _td ? _td.maxZ : 0
    };
  }

  var _pathfind = null;
  function getPathfinder() {
    if (!_pathfind) {
      if (typeof require !== 'undefined') {
        try { _pathfind = require('./geo-pathfind.js'); } catch (e) {}
      }
      if (!_pathfind && typeof window !== 'undefined' && window.GeoPathfind) {
        _pathfind = window.GeoPathfind;
      }
    }
    return _pathfind;
  }

  function findPath(startX, startZ, targetX, targetZ, opts) {
    opts = opts || {};
    opts.geo = opts.geo || api;
    var pf = getPathfinder();
    if (pf && typeof pf.findPath === 'function') {
      return pf.findPath(startX, startZ, targetX, targetZ, opts);
    }
    return [{ x: targetX, z: targetZ, y: (opts.y != null ? opts.y : groundY(targetX, targetZ)) }];
  }

  var api = {
    SEA: SEA,
    STEP: STEP,
    CLIMB_PER_M: CLIMB_PER_M,
    DROP_PER_M: DROP_PER_M,
    EYE_H: EYE_H,
    CHEST_H: CHEST_H,
    bind: bind,
    ready: ready,
    heightAtRaw: heightAtRaw,
    groundY: groundY,
    standY: standY,
    eyeY: eyeY,
    inWorld: inWorld,
    canWalk: canWalk,
    canStep: canStep,
    moveAlong: moveAlong,
    canSee: canSee,
    canSeeGround: canSeeGround,
    hitsWall: hitsWall,
    hitsProp: hitsProp,
    slopeOk: slopeOk,
    stats: stats,
    findPath: findPath
  };

  return api;
});

