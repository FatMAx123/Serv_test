// ============================================================
//  TESTS / MOB-PATHFINDING.TEST.JS — A* поиск пути мобов вокруг вогнутых препятствий.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const GEO = require(path.join(ROOT, 'shared', 'geo.js'));
const GeoPathfind = require(path.join(ROOT, 'shared', 'geo-pathfind.js'));
const { createMobHandler } = require(path.join(ROOT, 'server', 'handlers', 'mob-handler.js'));

module.exports = function (t) {
  t.suite('mob-pathfinding: MinHeap & структуры данных');

  const heap = new GeoPathfind.MinHeap();
  heap.push({ f: 10, id: 'a' });
  heap.push({ f: 3, id: 'b' });
  heap.push({ f: 7, id: 'c' });
  heap.push({ f: 1, id: 'd' });
  heap.push({ f: 5, id: 'e' });

  t.eq(heap.size(), 5, 'куча заполнена 5 элементами');
  t.eq(heap.pop().f, 1, 'минимальный элемент f=1 извлечен первым');
  t.eq(heap.pop().f, 3, 'следующий f=3');
  t.eq(heap.pop().f, 5, 'следующий f=5');
  t.eq(heap.pop().f, 7, 'следующий f=7');
  t.eq(heap.pop().f, 10, 'последний f=10');
  t.eq(heap.size(), 0, 'куча пуста');

  t.suite('mob-pathfinding: прямой путь без препятствий');
  // Инициализируем плоскую геодату без стен для чистого теста
  const mockGeo = {
    _ready: true,
    ready: () => true,
    standY: (x, z) => 0,
    canWalk: (x, z) => true,
    canStep: (ax, az, bx, bz) => true,
    slopeOk: () => true,
    hitsWall: () => false,
    hitsProp: () => false,
    moveAlong: (ax, az, bx, bz, y) => ({ x: bx, z: bz, y: 0, blocked: false, dist: Math.hypot(bx - ax, bz - az) })
  };

  const directPath = GeoPathfind.findPath(0, 0, 10, 10, { geo: mockGeo });
  t.ok(Array.isArray(directPath), 'возвращен массив пути');
  t.eq(directPath.length, 1, 'при прямой видимости возвращается 1 целевая точка');
  t.eq(directPath[0].x, 10, 'цель X совпадает');
  t.eq(directPath[0].z, 10, 'цель Z совпадает');

  t.suite('mob-pathfinding: обход вогнутого U-образного препятствия');
  // Создаем стены вогнутой ловушки:
  // Карман открыт на ЮГ (Z < 0).
  // Северная стена: от X=-6 до X=6 при Z=6
  // Западная стена: от Z=0 до Z=6 при X=-6
  // Восточная стена: от Z=0 до Z=6 при X=6
  //
  // Моб внутри U-кармана: (0, 3)
  // Цель снаружи кармана: (0, 12)
  const uWalls = [
    { x0: -6, z0: 6, x1: 6, z1: 6 }, // Север
    { x0: -6, z0: 0, x1: -6, z1: 6 }, // Запад
    { x0: 6, z0: 0, x1: 6, z1: 6 }   // Восток
  ];

  function segHit(ax, az, bx, bz, x0, z0, x1, z1) {
    const dax = bx - ax, daz = bz - az;
    const dbx = x1 - x0, dbz = z1 - z0;
    const den = dax * dbz - daz * dbx;
    if (Math.abs(den) < 1e-9) return false;
    const u1 = ((x0 - ax) * dbz - (z0 - az) * dbx) / den;
    const u2 = ((x0 - ax) * daz - (z0 - az) * dax) / den;
    return u1 >= 0 && u1 <= 1 && u2 >= 0 && u2 <= 1;
  }

  function checkUWallHit(ax, az, bx, bz) {
    for (const w of uWalls) {
      if (segHit(ax, az, bx, bz, w.x0, w.z0, w.x1, w.z1)) return true;
    }
    return false;
  }

  const uGeo = {
    _ready: true,
    ready: () => true,
    standY: (x, z) => 0,
    canWalk: (x, z) => true,
    canStep: (ax, az, bx, bz) => !checkUWallHit(ax, az, bx, bz),
    slopeOk: () => true,
    hitsWall: (ax, az, bx, bz) => checkUWallHit(ax, az, bx, bz),
    hitsProp: () => false,
    moveAlong: (ax, az, bx, bz, y) => {
      const dist = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(1, Math.ceil(dist / 0.5));
      let cx = ax, cz = az;
      for (let i = 1; i <= steps; i++) {
        const nx = ax + (bx - ax) * (i / steps);
        const nz = az + (bz - az) * (i / steps);
        if (checkUWallHit(cx, cz, nx, nz)) {
          return { x: cx, z: cz, y: 0, blocked: true, dist: Math.hypot(cx - ax, cz - az) };
        }
        cx = nx; cz = nz;
      }
      return { x: bx, z: bz, y: 0, blocked: false, dist };
    },
    findPath: (sx, sz, tx, tz, opts) => GeoPathfind.findPath(sx, sz, tx, tz, Object.assign({ geo: uGeo, gridStep: 1.0 }, opts))
  };

  // Проверяем, что прямой ход заблокирован северной стеной
  const directBlocked = uGeo.moveAlong(0, 3, 0, 12);
  t.ok(directBlocked.blocked, 'прямой путь сквозь северную стену кармана заблокирован');

  // Ищем путь изнутри (0, 3) к цели (0, 12)
  const uPath = GeoPathfind.findPath(0, 3, 0, 12, { geo: uGeo, gridStep: 1.0, maxNodes: 500 });
  t.ok(uPath && uPath.length > 0, 'A* нашел маршрут выхода из U-образного кармана');

  // Финальная точка должна быть у цели
  const lastPoint = uPath[uPath.length - 1];
  t.ok(Math.hypot(lastPoint.x - 0, lastPoint.z - 12) < 1.0, 'маршрут успешно доходит до цели (0, 12)');

  // Путь должен обходить карман через открытый юг (Z < 0) или через внешние края (X > 6 или X < -6)
  let exitedSouth = false;
  let clearedCorners = false;
  for (const p of uPath) {
    if (p.z <= 0.5) exitedSouth = true;
    if (Math.abs(p.x) >= 6.0 && p.z >= 6.0) clearedCorners = true;
  }
  t.ok(exitedSouth || clearedCorners, 'маршрут обошел препятствие через открытую сторону');

  t.suite('mob-pathfinding: сглаживание лучом (String Pulling)');
  // Путь со сглаживанием содержит существенно меньше узлов, чем сырая сетка
  const rawPath = GeoPathfind.findPath(0, 3, 0, 12, { geo: uGeo, gridStep: 1.0, smooth: false });
  const smoothPath = GeoPathfind.findPath(0, 3, 0, 12, { geo: uGeo, gridStep: 1.0, smooth: true });
  t.ok(smoothPath.length < rawPath.length, 'сглаживание лучом сократило число путевых точек',
    'raw=' + rawPath.length + ' vs smooth=' + smoothPath.length);

  t.suite('mob-pathfinding: интеграция с GEO API');
  GEO.bind({
    TerrainData: { minX: -200, maxX: 200, minZ: -200, maxZ: 200, bakedHeights: new Float32Array(100), bakedW: 10, bakedH: 10 },
    TerrainHeight: { groundY: () => 0, prewarm: () => {} },
    PropsCollision: null,
    wallSegments: uWalls
  });
  t.ok(typeof GEO.findPath === 'function', 'GEO.findPath экспортирован в публичный API');
  const geoPath = GEO.findPath(0, 3, 0, 12);
  t.ok(geoPath && geoPath.length > 0, 'GEO.findPath возвращает рассчитанный путь через GEO');

  t.suite('mob-pathfinding: Mob AI (chase и return вокруг препятствий)');
  const mobs = new Map();
  const players = new Map();
  const dummyPlayer = { pid: 1, x: 0, z: 12, y: 0, hp: 100, dead: false, combatPack: {} };
  players.set(1, dummyPlayer);

  let steppedPositions = [];
  const mockGeoStepMob = (m, nx, nz) => {
    const res = uGeo.moveAlong(m.x, m.z, nx, nz, m.y);
    m.x = res.x;
    m.z = res.z;
    steppedPositions.push({ x: m.x, z: m.z, blocked: res.blocked });
  };

  const handler = createMobHandler({
    mobs,
    players,
    spatialGrid: null,
    activeEvents: new Map(),
    respawnTimers: new Map(),
    spawnedSpots: new Set(),
    getServerSpots: () => [],
    getNextId: () => 1,
    GEO: uGeo,
    MOB_DB: { get: () => null },
    G: { mobStats: () => ({ hp: 100, pAtk: 10, pDef: 10, aggro: 30, speed: 4.0 }) },
    LR: {},
    EV: {},
    WM: {},
    dist2: (x1, z1, x2, z2) => (x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1),
    send: () => {},
    broadcastAOI: () => {},
    playerNear: () => true,
    geoStepMob: mockGeoStepMob,
    mobDisplayNameServer: () => 'TestMob',
    spawnMobDropPiles: () => {},
    splitExpToParty: () => {},
    partyMembers: () => [],
    questOnKill: () => {},
    saveProfileNow: () => {},
    regionNameById: () => 'Test',
    zoneLabelAt: () => 'Test',
    losGround: (ax, az, bx, bz) => !checkUWallHit(ax, az, bx, bz),
    onPlayerHit: () => {},
    onPlayerDeath: () => {},
    applyPlayerDebuff: () => {},
    pushEffects: () => {},
    isPlayerImmortal: () => false,
    TICK_MS: 100
  });

  // Спавним моба вплотную к северной стене вогнутого кармана в (0, 5.8)
  const testMob = new handler.Mob(101, 'wolf', 5, 0, 5.8, null, {});
  mobs.set(101, testMob);
  testMob.state = 'chase';
  testMob.target = dummyPlayer.pid;
  testMob.hate[String(dummyPlayer.pid)] = 100;

  let hadNavPathChase = false;
  // Имитируем тики сервера: моб упирается в северную стену (Z=6),
  // фиксирует stuckTicks, рассчитывает A* путь и начинает обход кармана
  for (let tick = 0; tick < 15; tick++) {
    handler.tickMobs();
    if (testMob.navPath && testMob.navPath.length > 0) {
      hadNavPathChase = true;
    }
  }

  t.ok(hadNavPathChase, 'моб успешно сгенерировал A* навигационный путь при столкновении со стеной');
  t.ok(testMob.x !== 0 || testMob.z !== 5.8, 'моб сдвинулся с начальной застрявшей позиции вдоль маршрута');

  // Проверяем возврат к спавну (return) с препятствием:
  // Моб снаружи за стеной (0, 6.2), спавн внутри кармана (0, 3)
  testMob.state = 'return';
  handler.clearMobHate(testMob);
  testMob.x = 0;
  testMob.z = 6.2;
  testMob.spawnX = 0;
  testMob.spawnZ = 3;
  testMob.navPath = null;
  testMob.stuckTicks = 0;

  let hadNavPathReturn = false;
  for (let tick = 0; tick < 15; tick++) {
    handler.tickMobs();
    if (testMob.navPath && testMob.navPath.length > 0) {
      hadNavPathReturn = true;
    }
  }

  t.ok(hadNavPathReturn, 'в режиме return моб также строит A* обход препятствий');

  // BUG-MOB-01: Сохранение готовности к удару при блокировке прямой видимости
  t.suite('mob-pathfinding: BUG-MOB-01 кулдаун автоатаки и losGround');
  const losMob = new handler.Mob(202, 'wolf', 5, 0, 5.8, null, {});
  losMob.atkCd = 0;
  losMob.state = 'chase';
  losMob.target = dummyPlayer.pid;
  losMob.hate[String(dummyPlayer.pid)] = 100;
  mobs.set(202, losMob);

  // dummyPlayer за северной стеной Z=6 вплотную (0, 6.2).
  // Дистанция 0.4 м (в пределах attackRange), но losGround = false из-за стены.
  dummyPlayer.x = 0;
  dummyPlayer.z = 6.2;
  handler.tickMobs();
  t.ok(losMob.atkCd <= 0, 'кулдаун автоатаки НЕ сгорает, пока цель за укрытием (BUG-MOB-01)');

  // Перемещаем на открытое пространство:
  dummyPlayer.x = 10;
  dummyPlayer.z = 10;
  losMob.x = 10;
  losMob.z = 10.3;
  losMob.navPath = null;
  losMob.stuckTicks = 0;
  handler.tickMobs();
  t.ok(losMob.atkCd > 0, 'при чистой прямой видимости кулдаун взводится и удар наносится');
  mobs.delete(202);
};

