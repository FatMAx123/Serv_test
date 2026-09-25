// ============================================================
//  TESTS / GEO.TEST.JS — серверная геодата (PLAN 3.2).
//  Регресс: сервер жил в (x, z), сквозь скалу/дом/стену острова и бьёт
//  без LoS. Клиентский меш + пропсы + Iwals — тот же источник, что у ног.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const GEO = require(path.join(ROOT, 'shared', 'geo.js'));

function bindGeo() {
  try {
    const f = path.join(ROOT, 'shared', 'editor-overrides.json');
    if (fs.existsSync(f)) WM.applyEditorOverrides(JSON.parse(fs.readFileSync(f, 'utf8')));
  } catch (e) { /* ignore */ }
  const g = globalThis;
  if (!g.window) g.window = g;
  const tdSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'terrain-data.js'), 'utf8');
  new Function('window', tdSrc)(g.window);
  g.TerrainData = g.window.TerrainData;
  g.WorldMetrics = WM;
  const TH = require(path.join(ROOT, 'client', 'js', 'terrain-height.js'));
  g.TerrainHeight = TH;
  g.PropsLibrary = require(path.join(ROOT, 'client', 'js', 'props-library-data.js'));
  const PC = require(path.join(ROOT, 'client', 'js', 'props-collision.js'));
  g.PropsCollision = PC;
  const wdSrc = fs.readFileSync(path.join(ROOT, 'client', 'js', 'walls-data.js'), 'utf8');
  new Function('window', wdSrc)(g.window);
  const segs = (g.window.WallsData && g.window.WallsData.segments) || [];
  GEO.bind({
    TerrainData: g.TerrainData,
    TerrainHeight: TH,
    PropsCollision: PC,
    wallSegments: segs
  });
  return GEO.stats();
}

module.exports = function (t) {
  const st = bindGeo();

  t.suite('geo: загрузка');
  t.ok(GEO.ready(), 'геодата собралась');
  t.ok(st.hasMesh, 'меш террейна на сервере');
  t.ok(st.hasProps, 'коллизии пропсов подключены');
  t.ok(st.walls >= 100, 'сегменты стен острова загружены', 'стен: ' + st.walls);
  t.eq(GEO.SEA, -35, 'уровень моря как у клиента');

  const spawn = { x: -107.5, z: -246.4 };
  t.suite('geo: высота и суша');
  t.ok(GEO.canWalk(spawn.x, spawn.z), 'спавн в деревне — суша');
  const gy = GEO.groundY(spawn.x, spawn.z);
  t.ok(gy > GEO.SEA + 5, 'земля в деревне выше моря', 'y=' + gy.toFixed(2));
  t.ok(GEO.standY(spawn.x, spawn.z) >= gy - 0.01, 'standY не ниже земли');
  t.ok(!GEO.canWalk(spawn.x, spawn.z - 4000), 'далеко за картой — нельзя');
  // Точка в океане: у края мира bake уходит под SEA
  const ocean = { x: st.minX + 20, z: st.minZ + 20 };
  t.ok(!GEO.canWalk(ocean.x, ocean.z) || GEO.heightAtRaw(ocean.x, ocean.z) < GEO.SEA,
    'кромка мира не считается улицей');

  t.suite('geo: шаг не сквозь воду');
  const intoSea = GEO.moveAlong(spawn.x, spawn.z, ocean.x, ocean.z);
  t.ok(intoSea.blocked, 'путь в океан останавливается');
  t.ok(Math.hypot(intoSea.x - ocean.x, intoSea.z - ocean.z) > 50,
    'не телепортирует на дно океана',
    'остановился в ' + Math.hypot(intoSea.x - spawn.x, intoSea.z - spawn.z).toFixed(1) + ' м от спавна');
  t.ok(GEO.canWalk(intoSea.x, intoSea.z), 'последняя точка шага — суша');

  t.suite('geo: стены острова (Iwals)');
  // Реальный сегмент из walls-data: z≈-1675, x 118→146
  const wallA = { x: 132, z: -1688 };
  const wallB = { x: 132, z: -1662 };
  t.ok(GEO.hitsWall(wallA.x, wallA.z, wallB.x, wallB.z),
    'отрезок через стену острова пересекается');
  const throughWall = GEO.moveAlong(wallA.x, wallA.z, wallB.x, wallB.z);
  t.ok(throughWall.blocked, 'ход сквозь стену острова заблокирован');
  t.ok(Math.abs(throughWall.z - wallB.z) > 5, 'не вышел на другую сторону стены',
    'z=' + throughWall.z.toFixed(1) + ' цель ' + wallB.z);

  t.suite('geo: LoS');
  t.ok(GEO.canSeeGround(spawn.x, spawn.z, spawn.x + 2, spawn.z),
    'два шага по деревне видно');
  t.ok(!GEO.canSeeGround(wallA.x, wallA.z, wallB.x, wallB.z),
    'сквозь стену острова не видно — wall-hack закрыт');
  t.ok(GEO.canSee(0, 100, 0, 1, 100, 1), 'луч высоко над землёй не режет меш');
  const aEnt = { x: spawn.x, z: spawn.z };
  const bEnt = { x: spawn.x + 2, z: spawn.z };
  t.eq(GEO.canSee(aEnt, bEnt), GEO.canSeeGround(spawn.x, spawn.z, spawn.x + 2, spawn.z),
    'canSee(сущность, сущность) = canSeeGround (регресс charged-каста)');
  t.eq(GEO.canSee(wallA, wallB), GEO.canSeeGround(wallA.x, wallA.z, wallB.x, wallB.z),
    'canSee(сущность) через стену совпадает с canSeeGround');

  t.suite('geo: склон / скала');
  // Сэмпл сетки: ищем соседние клетки с огромным перепадом высоты
  let cliff = null;
  const D = globalThis.TerrainData;
  const step = 12;
  outer:
  for (let x = D.minX + 80; x < D.maxX - 80 && !cliff; x += step) {
    for (let z = D.minZ + 80; z < D.maxZ - 80; z += step) {
      if (!GEO.canWalk(x, z)) continue;
      const n = { x: x + 4, z: z };
      const dh = GEO.groundY(n.x, n.z) - GEO.groundY(x, z);
      if (dh > 8) { cliff = { x: x, z: z, nx: n.x, nz: n.z, dh: dh }; break outer; }
    }
  }
  t.ok(cliff, 'на острове есть крутой склон для проверки',
    cliff ? ('dh=' + cliff.dh.toFixed(1) + ' м за 4 м') : 'не найден');
  if (cliff) {
    t.ok(!GEO.canStep(cliff.x, cliff.z, cliff.nx, cliff.nz),
      'в крутой склон шагнуть нельзя (как NSWE в L2)');
    const up = GEO.moveAlong(cliff.x, cliff.z, cliff.nx, cliff.nz);
    t.ok(up.blocked && up.dist < 3.5, 'moveAlong останавливается перед скалой',
      'прошёл ' + up.dist.toFixed(2) + ' м');
  }

  t.suite('geo: пропсы (здания)');
  const props = WM.CUSTOM_PROPS || [];
  let house = null;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p || !p.position) continue;
    const id = String(p.modelId || p.file || p.id || '').toLowerCase();
    if (!/house|home|dom|building|shop|inn|hall|tower|wall/i.test(id)) continue;
    const PC = globalThis.PropsCollision;
    if (PC && !PC.isCollidableProp(p)) continue;
    house = p;
    break;
  }
  t.ok(house, 'есть коллизионное здание для проверки',
    house ? String(house.modelId || house.file || house.id) : 'нет');
  if (house) {
    const hx = house.position.x, hz = house.position.z;
    const from = { x: hx - 12, z: hz };
    // если снаружи суша — шаг в центр дома должен упереться
    if (GEO.canWalk(from.x, from.z)) {
      const into = GEO.moveAlong(from.x, from.z, hx, hz);
      t.ok(into.blocked || Math.hypot(into.x - hx, into.z - hz) > 1.5,
        'в здание не зайти',
        'до центра ' + Math.hypot(into.x - hx, into.z - hz).toFixed(2) + ' м');
    } else {
      t.ok(true, 'точка у дома вне суши — пропуск шага, LoS всё равно');
    }
    t.ok(!GEO.canSeeGround(from.x, from.z, hx, hz) ||
      GEO.hitsProp(from.x, from.z, hx, hz, GEO.groundY(from.x, from.z) + 1.2),
      'дом закрывает LoS или коллизию на луче');
  }

  t.suite('geo: легитимный шаг по деревне');
  // Античит-тест сервера идёт +X от спавна ~28 м — путь должен быть свободен.
  const east = GEO.moveAlong(spawn.x, spawn.z, spawn.x + 28, spawn.z);
  t.ok(east.dist > 20, 'на восток от спавна 28 м проходимы (иначе сломается тест скорости)',
    'прошло ' + east.dist.toFixed(1) + ' м, blocked=' + east.blocked);

  t.suite('geo: производительность');
  const t0 = process.hrtime.bigint();
  const N = 4000;
  for (let i = 0; i < N; i++) {
    GEO.moveAlong(spawn.x, spawn.z, spawn.x + 1.2, spawn.z + (i % 3) * 0.1);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  t.ok(ms < 0.15, 'moveAlong быстрее 0.15 мс (бюджет хода 20 Гц)', ms.toFixed(4) + ' мс');
  const t1 = process.hrtime.bigint();
  const L = 2000;
  for (let i = 0; i < L; i++) {
    GEO.canSeeGround(spawn.x, spawn.z, spawn.x + 8, spawn.z + 2);
  }
  const losMs = Number(process.hrtime.bigint() - t1) / 1e6 / L;
  t.ok(losMs < 0.4, 'LoS на 8 м быстрее 0.4 мс', losMs.toFixed(4) + ' мс');
};
