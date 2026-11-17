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

  // Освобождённые слоты (type = 0) и мёртвые мобы (hp <= 0) не должны попадать в сетку
  tt.free(slotP);
  tt.updateHp(slotM, 0);
  grid.clear();
  grid.bulkInsert(tt.buffer, tt.maxSlot);
  const resAfterFree = grid.queryRadius(-150, -250, 50, outP, outM);
  t.eq(resAfterFree.players, 0, 'HIGH-03: освобождённый слот игрока (type=0) пропускается в bulkInsert');
  t.eq(resAfterFree.mobs, 0, 'HIGH-03: мёртвый моб (hp=0) пропускается в bulkInsert');

  t.suite('native-spatial-grid: очистка clear');
  grid.clear();
  const resEmpty = grid.queryRadius(-150, -250, 100, outP, outM);
  t.eq(resEmpty.players, 0, 'после clear сетка пуста (игроки)');
  t.eq(resEmpty.mobs, 0, 'после clear сетка пуста (мобы)');
  t.eq(grid.hasPlayerNear(-150, -250, 100), false, 'hasPlayerNear возвращает false после clear');

  t.suite('native-spatial-grid: паритет с mob-handler и skill-caster (боты не теряются)');
  const { createMobHandler } = require(path.join(ROOT, 'server', 'handlers', 'mob-handler.js'));
  const { SpatialGrid } = require(path.join(ROOT, 'server', 'spatial-grid.js'));
  const jsGrid = new SpatialGrid(72); // намеренно пуст (имитация пропуска ботов в server.js)
  const sentPkts = [];
  const fakeBot = { pid: 501, yid: 'bot3k_501', x: 20, z: 30, y: 0, hp: 100, dead: false, known: new Set(['m9001']) };
  const pMap = new Map([[501, fakeBot]]);
  const mMap = new Map();
  const ttParity = new EntityTransformTable(16);
  ttParity.allocate(501, 1, 20, 0, 30, 100, 100, 7.5);
  grid.clear();
  grid.bulkInsert(ttParity.buffer, ttParity.maxSlot);
  grid._populated = true;
  const mh = createMobHandler({
    mobs: mMap,
    players: pMap,
    spatialGrid: jsGrid,
    nativeSpatialGrid: grid,
    activeEvents: new Map(),
    respawnTimers: new Map(),
    spawnedSpots: new Set(),
    getServerSpots: () => [],
    getNextId: () => 9001,
    GEO: { ready: () => false, standY: () => 0 },
    MOB_DB: { MOBS: {} },
    G: { mobStats: () => ({ hp: 100, pAtk: 10, pDef: 10, aggro: 15, speed: 3, exp: 10 }) },
    LR: {}, EV: {}, WM: {},
    dist2: (a, b, c, d) => (a - c) * (a - c) + (b - d) * (b - d),
    send: (p, pkt) => sentPkts.push({ pid: p.pid, pkt }),
    broadcastAOI: () => {},
    playerNear: () => true,
    geoStepMob: () => {},
    mobDisplayNameServer: (id) => id,
    spawnMobDropPiles: () => {},
    splitExpToParty: () => {},
    partyMembers: (p) => [p],
    questOnKill: () => {},
    saveProfileNow: () => {},
    regionNameById: () => '',
    zoneLabelAt: () => '',
    losGround: () => true,
    onPlayerHit: () => {},
    onPlayerDeath: () => {},
    applyPlayerDebuff: () => {},
    pushEffects: () => {},
    isPlayerImmortal: () => false
  });
  mh.notifyMobRemoved(9001, 20, 30);
  t.ok(sentPkts.some(x => x.pid === 501 && x.pkt && x.pkt.t === 'aoi' && x.pkt.leave && x.pkt.leave[0] === 'm9001'),
    'mobHandler находит игрока/бота через nativeSpatialGrid даже при пустом JS spatialGrid');
};
