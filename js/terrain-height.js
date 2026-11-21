// ============================================================
//  TERRAIN-HEIGHT.JS — точная высота меша террейна без raycast'ов.
//
//  Было: Terrain.heightAtMesh пускал 5 лучей THREE.Raycaster по мешам 3×3
//  секторов. Raycaster линейный — ни BVH, ни сетки внутри three.js нет, он
//  честно перебирает весь index-буфер меша: 7 191 треугольник вокруг спавна,
//  10 043 в худшем блоке 3×3, то есть 36–50 тысяч тестов луч-треугольник на один
//  standY. Зовётся это каждый кадр на игрока и на каждого соседа в 35 м
//  (net-ws._remoteGroundSample), плюс при спавне и раскладке лута.
//
//  Стало: 47 986 треугольников TerrainData один раз раскладываются по сетке
//  16×16 м в плоскости XZ (CSR: start[] + ref[], без Map и без массивов на
//  ячейку). Луч всегда вертикальный, поэтому 2D-сетка бьёт BVH: обход — одно
//  обращение по индексу ячейки, кандидатов 5.6, а не 7 200.
//
//  Арифметика повторяет THREE.Ray.intersectTriangle и THREE.Triangle.getNormal
//  порядок в порядок (включая float32-округление вершин, как в BufferAttribute
//  меша), поэтому результат совпадает с прежним raycast'ом бит в бит, а не
//  «примерно» — см. tests/terrain-height.test.js.
//
//  Что изменилось по поведению: индекс покрывает весь мир, а не только
//  загруженные сектора. Прежний heightAtMesh возвращал null, если сектор не
//  стримнут (радиус стрима настраивается игроком, 1..4), и высота уезжала на
//  грубый bake — то есть Y одной и той же точки зависел от настроек клиента.
//  Теперь не зависит.
// ============================================================
(function (global) {
  'use strict';

  /**
   * Размер ячейки XZ. Средний треугольник террейна ~23 м по X, поэтому мелкая
   * ячейка не сокращает кандидатов, а только раздувает ref[]. Замер на реальных
   * данных (сборка / память / standY по 5 точкам):
   *   8 м → 750k ссылок, 4.5 МБ, 0.00130 мс
   *  16 м → 293k ссылок, 2.2 МБ, 0.00126 мс  ← выбрано
   *  32 м → 144k ссылок, 1.4 МБ, 0.00157 мс
   */
  var CELL = 16;
  /** Тот же порог «нормаль смотрит вверх, это не стенка юбки», что был в raycastGroundY. */
  var UP_MIN = 0.15;

  var _idx = null;

  function TD() { return global.TerrainData; }

  function buildIndex(d) {
    // float32 — ровно те значения, что попадают в BufferAttribute меша
    // (materializeSectorGeo делает new Float32Array). Иначе высота отличалась бы
    // от нарисованной поверхности в 6-м знаке.
    var pos = new Float32Array(d.positions);
    var tri = new Int32Array(d.indices);
    var nTri = (tri.length / 3) | 0;

    var minX = d.minX, minZ = d.minZ;
    var gw = Math.max(1, Math.ceil((d.maxX - minX) / CELL) + 1);
    var gh = Math.max(1, Math.ceil((d.maxZ - minZ) / CELL) + 1);
    var nCells = gw * gh;

    var start = new Int32Array(nCells + 1);
    var t, i0, i1, i2, ax, bx, cx, az, bz, cz, cx0, cx1, cz0, cz1, gx, gz;

    // Проход 1: сколько треугольников накрывает каждую ячейку. CSR требует знать
    // размеры до раскладки, поэтому bbox треугольника считается дважды — это
    // дешевле, чем держать 768 КБ временных границ или массив на ячейку.
    for (t = 0; t < nTri; t++) {
      i0 = tri[t * 3] * 3; i1 = tri[t * 3 + 1] * 3; i2 = tri[t * 3 + 2] * 3;
      ax = pos[i0]; bx = pos[i1]; cx = pos[i2];
      az = pos[i0 + 2]; bz = pos[i1 + 2]; cz = pos[i2 + 2];
      cx0 = clampCell((Math.min(ax, bx, cx) - minX) / CELL, gw);
      cx1 = clampCell((Math.max(ax, bx, cx) - minX) / CELL, gw);
      cz0 = clampCell((Math.min(az, bz, cz) - minZ) / CELL, gh);
      cz1 = clampCell((Math.max(az, bz, cz) - minZ) / CELL, gh);
      for (gx = cx0; gx <= cx1; gx++) {
        for (gz = cz0; gz <= cz1; gz++) start[gx * gh + gz + 1]++;
      }
    }
    // Префиксная сумма → start[c]..start[c+1] = диапазон ссылок ячейки c.
    for (var c = 0; c < nCells; c++) start[c + 1] += start[c];

    var ref = new Int32Array(start[nCells]);
    var cursor = new Int32Array(nCells);
    // Проход 2: раскладка.
    for (t = 0; t < nTri; t++) {
      i0 = tri[t * 3] * 3; i1 = tri[t * 3 + 1] * 3; i2 = tri[t * 3 + 2] * 3;
      ax = pos[i0]; bx = pos[i1]; cx = pos[i2];
      az = pos[i0 + 2]; bz = pos[i1 + 2]; cz = pos[i2 + 2];
      cx0 = clampCell((Math.min(ax, bx, cx) - minX) / CELL, gw);
      cx1 = clampCell((Math.max(ax, bx, cx) - minX) / CELL, gw);
      cz0 = clampCell((Math.min(az, bz, cz) - minZ) / CELL, gh);
      cz1 = clampCell((Math.max(az, bz, cz) - minZ) / CELL, gh);
      for (gx = cx0; gx <= cx1; gx++) {
        for (gz = cz0; gz <= cz1; gz++) {
          var cell = gx * gh + gz;
          ref[start[cell] + cursor[cell]] = t;
          cursor[cell]++;
        }
      }
    }

    return {
      pos: pos,
      tri: tri,
      start: start,
      ref: ref,
      gw: gw,
      gh: gh,
      minX: minX,
      minZ: minZ,
      triCount: nTri,
      // Данные террейна никто не мутирует, но если TerrainData подменят целиком
      // (редактор, hot-reload) — индекс должен это заметить.
      srcPos: d.positions,
      srcLen: d.positions.length,
      srcIdxLen: d.indices.length
    };
  }

  function clampCell(v, n) {
    var i = Math.floor(v);
    return i < 0 ? 0 : (i > n - 1 ? n - 1 : i);
  }

  function ensureIndex() {
    var d = TD();
    if (!d || !d.positions || !d.indices || !d.positions.length) { _idx = null; return null; }
    if (_idx && _idx.srcPos === d.positions && _idx.srcLen === d.positions.length &&
      _idx.srcIdxLen === d.indices.length) return _idx;
    _idx = buildIndex(d);
    return _idx;
  }

  /** Сбросить индекс: звать, если геометрия террейна изменилась. */
  function invalidate() { _idx = null; }

  /**
   * Собрать индекс заранее. Сборка ~40 мс на холодном JIT; без прогрева она
   * попадает на первый кадр после входа в мир, с прогревом — в фазу загрузки.
   * @returns {boolean} собрался ли индекс (есть ли данные террейна)
   */
  function prewarm() { return !!ensureIndex(); }

  /**
   * Y поверхности меша под точкой (x, z) — замена вертикального raycast'а.
   * @param {number} x
   * @param {number} z
   * @param {number} originY начало луча (как _rayOrigin.y в прежнем коде)
   * @param {number} farDist длина луча вниз (как _ray.far)
   * @returns {number|null} Y попадания или null, если меша под точкой нет
   */
  function groundY(x, z, originY, farDist) {
    var idx = ensureIndex();
    if (!idx) return null;

    var gh = idx.gh;
    var cell = clampCell((x - idx.minX) / CELL, idx.gw) * gh + clampCell((z - idx.minZ) / CELL, gh);
    var from = idx.start[cell], to = idx.start[cell + 1];
    if (from === to) return null;

    var pos = idx.pos, tri = idx.tri, ref = idx.ref;
    // Ближайшее попадание = самое высокое (луч идёт сверху вниз): у прежнего кода
    // intersectObjects сортировал по distance и брал первое с normal.y > 0.15,
    // а если такого нет — hits[0].
    var bestT = Infinity, bestY = null, upT = Infinity, upY = null;

    for (var i = from; i < to; i++) {
      var t3 = ref[i] * 3;
      var ia = tri[t3] * 3, ib = tri[t3 + 1] * 3, ic = tri[t3 + 2] * 3;
      var ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];

      // normal = e1 × e2, e1 = b - a, e2 = c - a (порядок THREE.Ray.intersectTriangle)
      var e1x = pos[ib] - ax, e1y = pos[ib + 1] - ay, e1z = pos[ib + 2] - az;
      var e2x = pos[ic] - ax, e2y = pos[ic + 1] - ay, e2z = pos[ic + 2] - az;
      var nx = e1y * e2z - e1z * e2y;
      var ny = e1z * e2x - e1x * e2z;
      var nz = e1x * e2y - e1y * e2x;
      // Луч (0,-1,0): DdN = -ny. Материал террейна FrontSide, значит backface
      // culling включён → ny <= 0 отбрасывается (в том числе ny == 0:
      // вертикальные стенки юбки сектора).
      if (!(ny > 0)) continue;

      var dx = x - ax, dy = originY - ay, dz = z - az;
      var b1 = dz * e2x - dx * e2z;      // = (diff × e2).y
      if (b1 < 0) continue;
      var b2 = e1z * dx - e1x * dz;      // = (e1 × diff).y
      if (b2 < 0) continue;
      if (b1 + b2 > ny) continue;
      var qdn = dx * nx + dy * ny + dz * nz;
      if (qdn < 0) continue;             // попадание выше начала луча
      var tHit = qdn / ny;
      if (tHit > farDist) continue;      // за пределом _ray.far (глубокое дно океана)

      if (tHit < bestT) { bestT = tHit; bestY = originY - tHit; }
      if (tHit < upT) {
        // Порог 0.15 считаем по нормализованной нормали и той же формулой, что
        // THREE.Triangle.getNormal: (c - b) × (a - b), потом × (1 / sqrt(len²)).
        var ux = pos[ic] - pos[ib], uy = pos[ic + 1] - pos[ib + 1], uz = pos[ic + 2] - pos[ib + 2];
        var vx = ax - pos[ib], vy = ay - pos[ib + 1], vz = az - pos[ib + 2];
        var fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
        var l2 = fx * fx + fy * fy + fz * fz;
        if (l2 > 0 && fy * (1 / Math.sqrt(l2)) > UP_MIN) { upT = tHit; upY = originY - tHit; }
      }
    }
    return upY !== null ? upY : bestY;
  }

  /** Диагностика: размер индекса и средняя заполненность ячейки. */
  function stats() {
    var idx = ensureIndex();
    if (!idx) return { tris: 0, cells: 0, usedCells: 0, refs: 0, perCell: 0, bytes: 0 };
    var cells = idx.gw * idx.gh;
    var used = 0;
    for (var c = 0; c < cells; c++) if (idx.start[c + 1] > idx.start[c]) used++;
    return {
      tris: idx.triCount,
      cells: cells,
      usedCells: used,
      refs: idx.ref.length,
      perCell: used ? idx.ref.length / used : 0,
      bytes: idx.pos.byteLength + idx.tri.byteLength + idx.start.byteLength + idx.ref.byteLength
    };
  }

  global.TerrainHeight = {
    groundY: groundY,
    prewarm: prewarm,
    invalidate: invalidate,
    stats: stats,
    CELL_SIZE: CELL,
    UP_MIN: UP_MIN
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.TerrainHeight;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
