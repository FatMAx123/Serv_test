// ============================================================
//  TESTS / TERRAIN-HEIGHT.TEST.JS — высота меша под ногами.
//  Регресс: Terrain.heightAtMesh пускал 5 лучей THREE.Raycaster по мешам 3×3
//  секторов. Raycaster линейный (ни BVH, ни сетки внутри three.js нет), сектор
//  вокруг игрока — 7 200 треугольников, худший блок 3×3 — 10 043, то есть
//  36–50 тысяч тестов луч-треугольник на ОДИН standY. А standY зовётся каждый
//  кадр на игрока и на каждого соседа в 35 м (net-ws._remoteGroundSample).
//  Тест проверяет две вещи:
//    1) новый индекс отвечает ровно то же, что прежний raycast (бит в бит,
//       поэтому эталон повторяет арифметику THREE.Ray.intersectTriangle);
//    2) линейный перебор не вернулся — есть запас по скорости.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

module.exports = function (t) {
  // terrain-data.js — это `window.TerrainData = {...}` на 2 МБ. Грузим через
  // Function, чтобы не заводить глобальный window на весь прогон тестов.
  const dataSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8');
  const win = {};
  new Function('window', dataSrc)(win);
  const D = win.TerrainData;
  globalThis.TerrainData = D;
  const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));

  // Вершины меша — float32 (materializeSectorGeo кладёт их в BufferAttribute),
  // поэтому и эталон обязан считать по float32, иначе «расхождение» будет
  // просто разницей double/float.
  const P = new Float32Array(D.positions);
  const IDX = D.indices;
  const nTri = (IDX.length / 3) | 0;
  const GRID = 8; // Terrain.GRID_SIZE
  const SEA = -35.0;

  /**
   * Копия Terrain.heightAtRaw: тест воспроизводит параметры вызова (начало и
   * длину луча), а не проверяет саму формулу bake.
   */
  function bakeAt(x, z) {
    if (x < D.minX || x > D.maxX || z < D.minZ || z > D.maxZ) return SEA - 5.0;
    const fx = (x - D.minX) / (D.maxX - D.minX) * (D.bakedW - 1);
    const fz = (z - D.minZ) / (D.maxZ - D.minZ) * (D.bakedH - 1);
    let ix = Math.floor(fx), iz = Math.floor(fz);
    ix = Math.max(0, Math.min(D.bakedW - 2, ix));
    iz = Math.max(0, Math.min(D.bakedH - 2, iz));
    const tx = fx - ix, tz = fz - iz, bw = D.bakedW;
    return D.bakedHeights[iz * bw + ix] * (1 - tx) * (1 - tz)
      + D.bakedHeights[iz * bw + ix + 1] * tx * (1 - tz)
      + D.bakedHeights[(iz + 1) * bw + ix] * (1 - tx) * tz
      + D.bakedHeights[(iz + 1) * bw + ix + 1] * tx * tz;
  }
  const originY = (x, z) => Math.max(bakeAt(x, z) + 120, 200);
  const farOf = (x, z) => Math.max(bakeAt(x, z) + 200, 400);

  function sectorOf(x, z) {
    let col = Math.floor((x - D.minX) / (D.maxX - D.minX) * GRID);
    let row = Math.floor((z - D.minZ) / (D.maxZ - D.minZ) * GRID);
    col = Math.max(0, Math.min(GRID - 1, col));
    row = Math.max(0, Math.min(GRID - 1, row));
    return { col, row };
  }
  // Сектор треугольника = сектор его центроида (Terrain.buildSectorIndex).
  const triCol = new Int8Array(nTri), triRow = new Int8Array(nTri);
  const secTris = new Int32Array(GRID * GRID);
  for (let i = 0; i < nTri; i++) {
    const a = IDX[i * 3] * 3, b = IDX[i * 3 + 1] * 3, c = IDX[i * 3 + 2] * 3;
    const cx = (D.positions[a] + D.positions[b] + D.positions[c]) / 3;
    const cz = (D.positions[a + 2] + D.positions[b + 2] + D.positions[c + 2]) / 3;
    const s = sectorOf(cx, cz);
    triCol[i] = s.col; triRow[i] = s.row;
    secTris[s.col * GRID + s.row]++;
  }

  /**
   * Эталон: прежний путь. THREE.Raycaster перебирает все треугольники меша и
   * сортирует попадания по distance; heightAtMesh брал первое с face.normal.y >
   * 0.15, иначе hits[0]. Арифметика ниже — порядок в порядок
   * THREE.Ray.intersectTriangle + THREE.Triangle.getNormal, включая backface
   * culling (материал террейна FrontSide).
   * @param gate {col,row}|null — ограничить 3×3 живыми секторами, как collectNearbyMeshes
   */
  function refGroundY(x, z, gate) {
    const oy = originY(x, z), far = farOf(x, z);
    const hits = [];
    for (let i = 0; i < nTri; i++) {
      if (gate && (Math.abs(triCol[i] - gate.col) > 1 || Math.abs(triRow[i] - gate.row) > 1)) continue;
      const ia = IDX[i * 3] * 3, ib = IDX[i * 3 + 1] * 3, ic = IDX[i * 3 + 2] * 3;
      const ax = P[ia], ay = P[ia + 1], az = P[ia + 2];
      const e1x = P[ib] - ax, e1y = P[ib + 1] - ay, e1z = P[ib + 2] - az;
      const e2x = P[ic] - ax, e2y = P[ic + 1] - ay, e2z = P[ic + 2] - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      let DdN = -ny, sign;
      if (DdN > 0) continue;                  // backfaceCulling: FrontSide
      else if (DdN < 0) { sign = -1; DdN = -DdN; }
      else continue;                          // луч параллелен плоскости (юбка)
      const dfx = x - ax, dfy = oy - ay, dfz = z - az;
      const DdQxE2 = sign * -(dfz * e2x - dfx * e2z);
      if (DdQxE2 < 0) continue;
      const DdE1xQ = sign * -(e1z * dfx - e1x * dfz);
      if (DdE1xQ < 0) continue;
      if (DdQxE2 + DdE1xQ > DdN) continue;
      const QdN = -sign * (dfx * nx + dfy * ny + dfz * nz);
      if (QdN < 0) continue;
      const tt = QdN / DdN;
      const py = oy - tt;
      const dist = Math.sqrt((oy - py) * (oy - py));   // raycaster: origin.distanceTo(point)
      if (dist > far) continue;
      const ux = P[ic] - P[ib], uy = P[ic + 1] - P[ib + 1], uz = P[ic + 2] - P[ib + 2];
      const vx = ax - P[ib], vy = ay - P[ib + 1], vz = az - P[ib + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      const l2 = fx * fx + fy * fy + fz * fz;
      hits.push({ dist, y: py, ny: l2 > 0 ? fy * (1 / Math.sqrt(l2)) : 0 });
    }
    hits.sort((a, b) => a.dist - b.dist);
    for (const h of hits) if (h.ny > 0.15) return h.y;
    return hits.length ? hits[0].y : null;
  }

  const fastGroundY = (x, z) => TH.groundY(x, z, originY(x, z), farOf(x, z));
  /** Копия Terrain.heightAtMesh: 5 точек под ступнями, max. */
  function footY(fn, x, z) {
    const r = 0.55;
    let best = fn(x, z), h;
    h = fn(x + r, z); if (h != null && (best == null || h > best)) best = h;
    h = fn(x - r, z); if (h != null && (best == null || h > best)) best = h;
    h = fn(x, z + r); if (h != null && (best == null || h > best)) best = h;
    h = fn(x, z - r); if (h != null && (best == null || h > best)) best = h;
    return best;
  }

  t.suite('terrain-height: индекс');
  const st = TH.stats();
  t.eq(st.tris, nTri, 'в индексе все треугольники террейна');
  t.ok(st.usedCells > 1000 && st.usedCells <= st.cells, 'сетка XZ заполнена',
    st.usedCells + ' занятых ячеек из ' + st.cells);
  t.ok(st.perCell < 12, 'кандидатов на ячейку мало (иначе это тот же перебор)',
    st.perCell.toFixed(2) + ' тр/ячейка');
  t.ok(TH.CELL_SIZE >= 8 && TH.CELL_SIZE <= 48, 'разумный размер ячейки', TH.CELL_SIZE + ' м');
  t.ok(st.bytes < 8 * 1048576, 'индекс не раздувает память', (st.bytes / 1048576).toFixed(2) + ' МБ');
  t.ok(TH.prewarm(), 'prewarm собирает индекс заранее');

  t.suite('terrain-height: эквивалентность прежнему raycast\'у');
  let seed = 20260904;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let checked = 0, hits = 0, nulls = 0, diff = 0, maxAbs = 0;
  const samples = [];
  function cmp(x, z) {
    const a = fastGroundY(x, z), b = refGroundY(x, z, null);
    checked++;
    if (a == null && b == null) { nulls++; return; }
    if (a == null || b == null) {
      diff++;
      if (samples.length < 3) samples.push('(' + x.toFixed(1) + ',' + z.toFixed(1) + ') new=' + a + ' ref=' + b);
      return;
    }
    hits++;
    const dd = Math.abs(a - b);
    if (dd > maxAbs) maxAbs = dd;
    if (dd !== 0) {
      diff++;
      if (samples.length < 3) samples.push('(' + x.toFixed(1) + ',' + z.toFixed(1) + ') Δ=' + dd);
    }
  }
  for (let i = 0; i < 400; i++) cmp(-1890 + rnd() * 3720, -1915 + rnd() * 3740);
  // Границы point-in-triangle: ровно вершина, середина ребра, центроид.
  for (let i = 0; i < 200; i++) {
    const v = Math.floor(rnd() * (P.length / 3)) * 3;
    cmp(P[v], P[v + 2]);
  }
  for (let i = 0; i < 200; i++) {
    const e = Math.floor(rnd() * nTri) * 3;
    const a = IDX[e] * 3, b = IDX[e + 1] * 3;
    cmp((P[a] + P[b]) / 2, (P[a + 2] + P[b + 2]) / 2);
  }
  for (let i = 0; i < 200; i++) {
    const e = Math.floor(rnd() * nTri) * 3;
    const a = IDX[e] * 3, b = IDX[e + 1] * 3, c = IDX[e + 2] * 3;
    cmp((P[a] + P[b] + P[c]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3);
  }
  t.ok(hits > 800 && nulls > 0, 'выборка покрывает и попадания, и дыры меша',
    'точек ' + checked + ', попаданий ' + hits + ', null ' + nulls);
  t.eq(diff, 0, 'высота совпадает с raycast\'ом на всей выборке', samples.join(' | '));
  t.eq(maxAbs, 0, 'совпадение точное, не «примерно»');

  t.suite('terrain-height: сектора больше не влияют на высоту');
  // Прежний heightAtMesh смотрел только 3×3 живых сектора. Треугольник ~23 м не
  // может иметь центроид в 466 м от точки, поэтому при живых секторах гейт не
  // отсекал ничего: значения обязаны совпасть. Разница только там, где сектор не
  // стримнут — а радиус стрима игрок настраивает сам (1..4), из-за чего Y одной
  // точки раньше зависел от настроек клиента.
  let gateDiff = 0, gateChecked = 0;
  for (let i = 0; i < 200; i++) {
    const x = -1890 + rnd() * 3720, z = -1915 + rnd() * 3740;
    const a = fastGroundY(x, z), b = refGroundY(x, z, sectorOf(x, z));
    gateChecked++;
    if (b == null) continue;                    // дыра меша — сравнивать нечего
    if (a == null || a !== b) gateDiff++;
  }
  t.eq(gateDiff, 0, 'гейт 3×3 секторов ничего не отсекал (' + gateChecked + ' точек)');

  t.suite('terrain-height: bake не заменяет меш');
  // Дешёвый вариант «bilinear по bakedHeights» дал бы ноги в текстуре или в
  // воздухе: bake — сетка 14.6 м, меш местами куда острее.
  let over1 = 0, nCmp = 0, worst = 0, sumErr = 0;
  for (let i = 0; i < 1500; i++) {
    const x = -1890 + rnd() * 3720, z = -1915 + rnd() * 3740;
    const m = fastGroundY(x, z);
    if (m == null) continue;
    const e = Math.abs(m - bakeAt(x, z));
    nCmp++; sumErr += e;
    if (e > worst) worst = e;
    if (e > 1) over1++;
  }
  t.ok(over1 / nCmp > 0.05, 'bake расходится с мешем больше метра на заметной доле мира',
    (over1 / nCmp * 100).toFixed(1) + '% точек, avg ' + (sumErr / nCmp).toFixed(2) +
    ' м, max ' + worst.toFixed(1) + ' м');

  t.suite('terrain-height: производительность');
  const worstSector = (() => {
    let best = 0, at = { col: 0, row: 0 };
    for (let col = 0; col < GRID; col++) {
      for (let row = 0; row < GRID; row++) {
        let s = 0;
        for (let dc = -1; dc <= 1; dc++) {
          for (let dr = -1; dr <= 1; dr++) {
            const c2 = col + dc, r2 = row + dr;
            if (c2 < 0 || c2 >= GRID || r2 < 0 || r2 >= GRID) continue;
            s += secTris[c2 * GRID + r2];
          }
        }
        if (s > best) { best = s; at = { col, row }; }
      }
    }
    return { tris: best, at };
  })();
  t.ok(worstSector.tris > 5000, 'худший блок 3×3 секторов — это реально много треугольников',
    worstSector.tris + ' тр → ' + worstSector.tris * 5 + ' тестов луч-треугольник на один standY');

  // Точка в центре худшего блока — там, где прежний путь был самым дорогим.
  const cx = D.minX + (worstSector.at.col + 0.5) * (D.maxX - D.minX) / GRID;
  const cz = D.minZ + (worstSector.at.row + 0.5) * (D.maxZ - D.minZ) / GRID;
  const gate = sectorOf(cx, cz);
  footY(fastGroundY, cx, cz);
  const fastN = 20000;
  const tf0 = process.hrtime.bigint();
  for (let i = 0; i < fastN; i++) footY(fastGroundY, cx + i * 0.0001, cz);
  const fastMs = Number(process.hrtime.bigint() - tf0) / 1e6 / fastN;
  const slowN = 40;
  const ts0 = process.hrtime.bigint();
  for (let i = 0; i < slowN; i++) footY((x, z) => refGroundY(x, z, gate), cx + i * 0.0001, cz);
  const slowMs = Number(process.hrtime.bigint() - ts0) / 1e6 / slowN;
  // Эталон здесь ещё и щадящий: у него нет ни матриц, ни аллокации объекта на
  // попадание, ни треугольников юбок, которые есть в реальном меше сектора.
  t.ok(fastMs * 50 < slowMs, 'быстрее перебора треугольников минимум ×50',
    slowMs.toFixed(3) + ' мс → ' + fastMs.toFixed(5) + ' мс (×' + Math.round(slowMs / fastMs) + ')');
  // Худший кадр: игрок + до 20 соседей в 35 м (net-ws зовёт standY на каждого).
  t.ok(fastMs * 21 < 1.0, 'игрок и 20 соседей укладываются в 1 мс на кадр',
    (fastMs * 21).toFixed(3) + ' мс, прежним путём было бы ' + (slowMs * 21).toFixed(0) + ' мс');

  t.suite('terrain-height: синтетический террейн и инвалидация');
  const flat = {
    minX: 0, maxX: 20, minZ: 0, maxZ: 20, minY: 10, maxY: 10,
    bakedW: 2, bakedH: 2, bakedHeights: [10, 10, 10, 10],
    // плоскость y = 10, квадрат 20×20, winding «нормалью вверх»
    positions: [0, 10, 0, 20, 10, 0, 0, 10, 20, 20, 10, 20],
    indices: [0, 2, 1, 1, 2, 3]
  };
  globalThis.TerrainData = flat;
  t.eq(TH.groundY(10, 10, 200, 400), 10, 'подмена TerrainData подхвачена без invalidate');
  t.eq(TH.groundY(0, 0, 200, 400), 10, 'угол квадрата — попадание (границы включительно)');
  t.eq(TH.groundY(-0.5, 10, 200, 400), null, 'вне меша → null (standY уйдёт на bake)');
  t.eq(TH.groundY(20.5, 10, 200, 400), null, 'за дальней границей → null');
  t.eq(TH.groundY(10, 10, 200, 100), null, 'дальше far луч не достаёт (дно океана)');
  t.eq(TH.groundY(10, 10, 15, 400), 10, 'начало луча близко к поверхности — попадание есть');
  t.eq(TH.groundY(10, 10, 5, 400), null, 'начало луча ниже поверхности → мимо');
  // Наклон: y от 10 до 30 по Z. Точка ровно посередине → 20.
  const slope = JSON.parse(JSON.stringify(flat));
  slope.positions = [0, 10, 0, 20, 10, 0, 0, 30, 20, 20, 30, 20];
  slope.maxY = 30;
  globalThis.TerrainData = slope;
  t.near(TH.groundY(10, 10, 200, 400), 20, 1e-4, 'на склоне высота интерполируется по треугольнику');
  t.near(TH.groundY(10, 5, 200, 400), 15, 1e-4, 'четверть склона');
  // Перевёрнутый winding = backface → FrontSide-материал такой треугольник не ловит
  const flipped = JSON.parse(JSON.stringify(flat));
  flipped.indices = [0, 1, 2, 1, 3, 2];
  globalThis.TerrainData = flipped;
  t.eq(TH.groundY(10, 10, 200, 400), null, 'backface не считается землёй (как FrontSide в THREE)');
  globalThis.TerrainData = D;
  TH.invalidate();
  t.ok(fastGroundY(cx, cz) != null, 'после invalidate() индекс собран заново по настоящим данным');

  t.suite('terrain-height: Terrain.standY использует индекс');
  // Проверка проводки целиком: настоящий terrain.js, а не копия формул из теста.
  // На загрузке ему нужен только THREE.Vector4 и TextureLoader — остальное лениво.
  const win2 = {
    THREE: {
      Vector4: function () { this.setComponent = function () {}; },
      TextureLoader: function () { this.load = function () {}; }
    },
    TerrainData: D,
    TerrainHeight: TH
  };
  new Function('window', fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain.js'), 'utf8'))(win2);
  const T = win2.Terrain;
  t.ok(T && typeof T.standY === 'function', 'terrain.js поднимается с заглушкой THREE');
  const meshExpect = footY(fastGroundY, cx, cz);
  t.ok(meshExpect != null, 'в контрольной точке меш есть');
  const sy = T.standY(cx, cz);
  t.near(sy.ground, meshExpect + 0.04, 1e-9, 'standY.ground = высота меша + эпсилон против z-fight');
  t.near(sy.y, 0.95 + meshExpect + 0.04, 1e-9, 'standY.y = ступни + поверхность меша');
  t.eq(sy.boost, 0, 'на меш-ветке подъёма по склону не добавляется');
  const outside = T.standY(D.maxX + 500, 0);
  t.ok(isFinite(outside.y) && outside.y < 0, 'вне мира standY уходит на bake, а не падает');
  // Кэша больше нет: сдвиг на 5 см должен менять ответ на склоне.
  const slopePt = (() => {
    for (let i = 0; i < 4000; i++) {
      const x = -1890 + rnd() * 3720, z = -1915 + rnd() * 3740;
      const a = T.standY(x, z), b = T.standY(x + 0.05, z);
      if (a.ground !== b.ground && Math.abs(a.ground - b.ground) > 1e-4) return true;
    }
    return false;
  })();
  t.ok(slopePt, 'высота реагирует на сдвиг 5 см (кэш «0.2 м» больше не держит старое значение)');

  t.suite('terrain-height: raycast в standY не вернулся');
  // Комментарии убираем: в шапке terrain.js прежний путь описан текстом, иначе
  // проверка сработала бы на объяснении регресса (как в client.test.js).
  const terrainJs = fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
  t.ok(/TerrainHeight\.groundY|TH\.groundY/.test(terrainJs), 'terrain.js берёт высоту из TerrainHeight');
  t.ok(!/Raycaster/.test(terrainJs), 'в terrain.js больше нет Raycaster\'а');
  t.ok(!/intersectObjects/.test(terrainJs), 'нет intersectObjects по секторам');
  t.ok(!/_rayHitsCache/.test(terrainJs), 'кэш «последняя точка в радиусе 0.2 м» убран вместе с лучами');
};
