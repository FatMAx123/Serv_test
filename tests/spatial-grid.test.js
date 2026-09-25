// ============================================================
//  TESTS / SPATIAL-GRID.TEST.JS
//  Тестирование 2D Spatial Hash Grid:
//  - Базовая выборка кандидатов
//  - Адаптивное суб-дробление ячеек (Adaptive Sub-Grid) при высокой плотности
//  - Корректность радиусной фильтрации и граничных условий
//  - Zero-GC очистка сетки
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const { SpatialGrid } = require(path.join(ROOT, 'server', 'spatial-grid.js'));

module.exports = async function (t) {
  t.suite('spatial-grid: базовая вставка и выборка кандидатов');

  const grid = new SpatialGrid(108, 100, 4);

  const p1 = { pid: 1, x: 50, z: 50 };
  const p2 = { pid: 2, x: 200, z: 200 };
  const m1 = { mid: 101, x: 60, z: 60, hp: 500 };
  const mDead = { mid: 102, x: 55, z: 55, hp: 0 }; // Мертвый моб не должен вставляться

  grid.insertPlayer(p1);
  grid.insertPlayer(p2);
  grid.insertMob(m1);
  grid.insertMob(mDead);

  t.eq(grid.activeKeys.length, 2, 'активированы ровно 2 макро-ячейки');

  // Выборка около (50, 50) с радиусом 30м
  const near1 = grid.queryNearby(50, 50, 30);
  t.eq(near1.players.length, 1, 'найден ровно 1 игрок в окрестности');
  t.eq(near1.players[0].pid, 1, 'найден верный игрок p1');
  t.eq(near1.mobs.length, 1, 'найден ровно 1 моб в окрестности');
  t.eq(near1.mobs[0].mid, 101, 'найден живой моб m1');

  // Проверка раннего выхода из forEachCandidate
  let visits = 0;
  grid.forEachCandidate(50, 50, 300, (p) => {
    visits++;
    return false; // Ранний выход
  });
  t.eq(visits, 1, 'forEachCandidate поддерживает ранний выход (return false)');

  // ── Адаптивное суб-дробление при высокой плотности ─────────────
  t.suite('spatial-grid: адаптивное дробление ячейки (Adaptive Sub-Grid)');

  // Создаем сетку с порогом дробления 20 для удобства тестирования
  const denseGrid = new SpatialGrid(100, 20, 4); // 4x4 суб-ячейки по 25м
  const cx0 = 0;
  const cz0 = 0;

  // Вставляем 19 игроков в одну ячейку [0..100, 0..100]
  for (let i = 0; i < 19; i++) {
    denseGrid.insertPlayer({ pid: 100 + i, x: 10 + (i % 5) * 15, z: 10 + Math.floor(i / 5) * 15 });
  }

  const k0 = denseGrid._key(0, 0);
  const cellBefore = denseGrid.cells.get(k0);
  t.ok(cellBefore, 'ячейка (0, 0) существует');
  t.eq(cellBefore.isSubdivided, false, 'ячейка еще не раздроблена (19 < 20)');
  t.eq(cellBefore.players.length, 19, 'в ячейке 19 игроков');

  // Вставляем 20-го игрока — должен сработать триггер суб-дробления
  denseGrid.insertPlayer({ pid: 200, x: 80, z: 80 });
  t.eq(cellBefore.isSubdivided, true, 'ячейка автоматически раздробилась при достижении порога (20)');
  t.eq(cellBefore.players.length, 0, 'основной массив игроков очищен после дробления');

  // Проверяем распределение по суб-ячейкам
  let totalInSubs = 0;
  for (let s = 0; s < cellBefore.subCells.length; s++) {
    totalInSubs += cellBefore.subCells[s].players.length;
  }
  t.eq(totalInSubs, 20, 'все 20 игроков распределены по 16 суб-ячейкам');

  // Добавляем 21-го игрока в угол (5, 5) -> subCx=0, subCz=0 -> subIdx=0
  denseGrid.insertPlayer({ pid: 201, x: 5, z: 5 });
  t.eq(cellBefore.subCells[0].players.some(p => p.pid === 201), true, 'новый игрок вставлен прямо в целевую суб-ячейку');

  // Выборка ближнего боя около (5, 5) с радиусом 10м
  // Должна опросить только суб-ячейку 0 (и смежные в пределах 10м), но не всю ячейку 100м
  const closeQuery = denseGrid.queryNearby(5, 5, 10);
  t.ok(closeQuery.players.length < 21, 'локализованная выборка отсекла отдаленные суб-ячейки');
  t.ok(closeQuery.players.some(p => p.pid === 201), 'целевой игрок найден');

  // ── Отрицательные координаты и границы ────────────────────────
  t.suite('spatial-grid: отрицательные координаты и граничные стыки');

  const negGrid = new SpatialGrid(100, 10, 4);
  // Игрок на границе между (-1, -1) и (0, 0)
  negGrid.insertPlayer({ pid: 301, x: -5, z: -5 });
  negGrid.insertPlayer({ pid: 302, x: 5, z: 5 });

  const crossBoundary = negGrid.queryNearby(0, 0, 15);
  t.eq(crossBoundary.players.length, 2, 'выборка корректно захватывает стык через нулевую границу');

  // ── Zero-GC очистка ───────────────────────────────────────────
  t.suite('spatial-grid: Zero-GC очистка сетки (clear)');

  denseGrid.clear();
  t.eq(denseGrid.activeKeys.length, 0, 'activeKeys очищены');
  t.eq(cellBefore.isSubdivided, false, 'флаг isSubdivided сброшен в false');
  t.eq(cellBefore.players.length, 0, 'массив players пуст');
  t.eq(cellBefore.mobs.length, 0, 'массив mobs пуст');

  let anySubsLeft = false;
  for (let s = 0; s < cellBefore.subCells.length; s++) {
    if (cellBefore.subCells[s].players.length > 0 || cellBefore.subCells[s].mobs.length > 0) {
      anySubsLeft = true;
    }
  }
  t.eq(anySubsLeft, false, 'все суб-ячейки очищены без пересоздания массивов (Zero-GC)');

  // ── Стресс-тест плотности: 500 игроков в одной ячейке ─────────
  t.suite('spatial-grid: стресс-тест 500 игроков на одном споте (Siege Hotspot)');

  const siegeGrid = new SpatialGrid(108, 100, 4);
  // Рассаживаем 500 игроков в круг радиусом 40м вокруг центра (1000, 1000)
  for (let i = 0; i < 500; i++) {
    const angle = (i / 500) * 2 * Math.PI;
    const dist = Math.sqrt(i / 500) * 40;
    siegeGrid.insertPlayer({
      pid: 1000 + i,
      x: 1000 + Math.cos(angle) * dist,
      z: 1000 + Math.sin(angle) * dist
    });
  }

  const siegeCell = siegeGrid.cells.get(siegeGrid._key(Math.floor(1000 / 108), Math.floor(1000 / 108)));
  t.ok(siegeCell && siegeCell.isSubdivided, 'ячейка с 500 игроками автоматически раздроблена');

  // Замер ближней выборки (радиус 15м — зона ближнего боя)
  let foundCandidates = 0;
  siegeGrid.forEachCandidate(1000, 1000, 15, () => {
    foundCandidates++;
  });

  t.ok(foundCandidates < 500, 'число кандидатов для проверки ближнего боя сокращено суб-сеткой (< 500)');
  t.ok(foundCandidates >= 30, 'все игроки в радиусе 15м вошли в выборку');

  // ── Эвикция неактивных ячеек (PERF-GRID-01) ───────────────────
  t.suite('spatial-grid: эвикция неактивных ячеек (PERF-GRID-01)');
  const pruneGrid = new SpatialGrid(108);
  pruneGrid.insertPlayer({ pid: 1, x: 0, z: 0 });
  pruneGrid.insertPlayer({ pid: 2, x: 5000, z: 5000 });
  t.eq(pruneGrid.size, 2, 'создано ровно 2 ячейки в сетке');

  pruneGrid.clear();
  t.eq(pruneGrid.size, 2, 'после clear() ячейки остаются в пуле для переиспользования');

  // Имитируем, что ячейка (5000, 5000) простаивает уже 15 минут
  const kOld = pruneGrid._key(Math.floor(5000 / 108), Math.floor(5000 / 108));
  const oldCell = pruneGrid.cells.get(kOld);
  t.ok(oldCell, 'устаревшая ячейка найдена');
  oldCell.lastActiveAt = Date.now() - 900000; // 15 минут назад

  // Свежая ячейка (0, 0) обновлена прямо сейчас
  const kFresh = pruneGrid._key(0, 0);
  const freshCell = pruneGrid.cells.get(kFresh);
  freshCell.lastActiveAt = Date.now();

  const pruned = pruneGrid.prune(600000); // порог 10 минут
  t.eq(pruned, 1, 'prune удалил ровно 1 простаивавшую ячейку');
  t.eq(pruneGrid.size, 1, 'в сетке осталась только свежая ячейка');
  t.ok(pruneGrid.cells.has(kFresh), 'свежая ячейка сохранена');
  t.ok(!pruneGrid.cells.has(kOld), 'устаревшая ячейка удалена из памяти');

  // Проверка: ячейка с активной сущностью не удаляется даже если время вышло
  pruneGrid.insertPlayer({ pid: 3, x: 0, z: 0 });
  freshCell.lastActiveAt = Date.now() - 900000;
  const prunedActive = pruneGrid.prune(600000);
  t.eq(prunedActive, 0, 'ячейка с активным игроком защищена от эвикции');
  t.eq(pruneGrid.size, 1, 'ячейка осталась в памяти');

  // ── hasPlayerNear (Zero-GC проверка близости игроков для спящего режима мобов) ──
  t.suite('spatial-grid: hasPlayerNear для спящего режима мобов');
  const sleepGrid = new SpatialGrid(108, 100, 4);
  const pLiving = { pid: 10, x: 100, z: 100, hp: 100, dead: false };
  const pDead = { pid: 11, x: 500, z: 500, hp: 0, dead: true };
  sleepGrid.insertPlayer(pLiving);
  sleepGrid.insertPlayer(pDead);

  // Моб рядом с живым игроком (дистанция 20м <= 155м)
  t.ok(sleepGrid.hasPlayerNear(110, 110, 155, 155 * 155), 'живой игрок в радиусе 155м обнаружен');
  // Моб далеко от живого игрока (дистанция 300м > 155м)
  t.ok(!sleepGrid.hasPlayerNear(400, 400, 155, 155 * 155), 'дальний моб (300м) не видит игроков и спит');
  // Моб рядом с мертвым игроком не должен просыпаться
  t.ok(!sleepGrid.hasPlayerNear(505, 505, 155, 155 * 155), 'мертвый игрок (hp=0, dead=true) игнорируется');
};
