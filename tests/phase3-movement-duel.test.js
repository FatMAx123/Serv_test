// TESTS / PHASE3-MOVEMENT-DUEL.TEST.JS
// Модульное тестирование Фазы 3: movement-handler и duel-handler
'use strict';

const createMovementHandler = require('../server/handlers/movement-handler.js');
const createDuelHandler = require('../server/handlers/duel-handler.js');

module.exports = async function runPhase3Tests(t) {
  t.suite('Фаза 3: movement-handler (скорость, бюджет, античит)');

  let sentMessages = [];
  const mockSend = (p, msg) => { sentMessages.push({ p, msg }); };
  let movesVecStarted = [];
  let movesVecStopped = [];

  const mockCtx = {
    send: mockSend,
    broadcastMoveVecStart: (p, sx, sz, tx, tz, spd, walk) => {
      movesVecStarted.push({ pid: p.pid, sx, sz, tx, tz, spd, walk });
    },
    broadcastMoveVecStop: (p, x, z) => {
      movesVecStopped.push({ pid: p.pid, x, z });
    },
    GEO: {
      ready: () => true,
      standY: (x, z, y) => 10.5,
      moveAlong: (x0, z0, x1, z1, y) => ({ x: x1, z: z1, y: 10.5 })
    },
    isSyntheticBot: (yid) => !!(yid && String(yid).startsWith('bot_')),
    isGM: (p) => !!p.isGm,
    checkRate: () => true,
    playerStunned: (p) => !!p.stunned,
    playerWeightState: (p) => ({ speedMult: p.weightMult || 1 }),
    cancelPlayerCast: (p, r) => { p.castCancelled = r; },
    closeStore: (p, r) => { p.storeClosed = r; },
    entityTransforms: null,
    markProfileDirty: (p) => { p.dirty = true; },
    saveProfileNow: (p) => { p.saved = true; },
    syncPlayerRegionSubscription: (p, o, n) => { p.syncedRegion = n; },
    ensureNearbyMobs: (p) => { p.nearbyMobsChecked = true; },
    isPeaceAt: (x, z) => false,
    zoneLabelAt: (x, z) => 'Wilderness',
    getTickMsLast: () => 20,
    getElHistogram: () => ({ mean: 2000000 })
  };

  const mh = createMovementHandler(mockCtx);

  // 1. Проверка базовой скорости
  const p1 = {
    pid: 1, yid: 'user_1', name: 'Warrior', speedBase: 8.0,
    x: 0, z: 0, y: 10.5, buffs: [], debuffs: [], cd: {}
  };
  t.eq(mh.playerSpeedNow(p1), 8.0, 'базовая скорость игрока 8.0');

  // 2. Влияние баффа скорости
  p1.buffs = [{ id: 'wind_walk', speedMult: 1.2, until: Date.now() + 60000 }];
  t.eq(Math.round(mh.playerSpeedNow(p1) * 10) / 10, 9.6, 'скорость с баффом ветра 9.6');

  // 3. Влияние дебаффа slow
  p1.debuffs = [{ id: 'slow', slowMult: 0.5, until: Date.now() + 10000 }];
  t.eq(Math.round(mh.playerSpeedNow(p1) * 10) / 10, 4.8, 'скорость под замедлением 4.8');

  // 4. Сброс бюджета движения
  mh.resetMoveBudget(p1);
  t.ok(p1._moveBudget > 0, 'бюджет движения инициализирован');
  t.eq(p1._speedViol, 0, 'нарушения скорости сброшены');

  // 5. Проверка геодаты
  mh.snapStandY(p1);
  t.eq(p1.y, 10.5, 'snapStandY выставляет координату Y из геодаты');

  // 6. Проверка clampSpeed для синтетического бота (Zero Overhead Invariant)
  const bot = { pid: 99, yid: 'bot_stress_1', x: 100, z: 100, y: null };
  const botClamp = mh.clampSpeed(bot, 500, 500);
  t.eq(botClamp.x, 500, 'бот перемещается без ограничений античита');
  t.eq(botClamp.z, 500, 'бот перемещается по оси Z');
  t.eq(bot.y, 10.5, 'боту синхронизирована высота standY');

  // 7. Античит: ограничение скорости при превышении бюджета
  const p2 = {
    pid: 2, yid: 'user_2', name: 'SpeedCheater', speedBase: 7.5,
    x: 0, z: 0, y: 10.5, _moveBudget: 1.0, _moveBudgetAt: Date.now()
  };
  const clamped = mh.clampSpeed(p2, 100, 0); // Попытка телепортироваться на 100 метров
  t.ok(clamped.x < 100, 'античит обрезал дистанцию перемещения');
  t.ok(p2._speedViol > 0, 'зафиксировано нарушение скорости');

  // 8. Обработка сетевого пакета 'move'
  sentMessages = [];
  movesVecStarted = [];
  const pMove = {
    pid: 3, yid: 'user_3', name: 'Runner', speedBase: 7.5,
    x: 0, z: 0, y: 10.5, buffs: [], debuffs: [], cd: {}
  };
  mh.resetMoveBudget(pMove);
  const moveHandled = mh.handleMovementMessage(pMove, {
    t: 'move', x: 2.0, z: 0, destX: 10.0, destZ: 0
  });
  t.ok(moveHandled, 'пакет move успешно обработан');
  t.ok(pMove.x > 0, 'координата игрока обновилась');
  t.ok(pMove.moving, 'флаг moving установлен');
  t.ok(movesVecStarted.length > 0, 'отправлен вектор движения Dead Reckoning');

  // 9. Обработка пакета 'move_stop'
  movesVecStopped = [];
  const stopHandled = mh.handleMovementMessage(pMove, {
    t: 'move_stop', x: pMove.x, z: pMove.z
  });
  t.ok(stopHandled, 'пакет move_stop успешно обработан');
  t.eq(pMove.moving, false, 'игрок остановился');
  t.ok(movesVecStopped.length > 0, 'отправлен пакет остановки вектора');

  // 10. Обработка пакета 'pose' (сесть/встать)
  const poseHandled = mh.handleMovementMessage(pMove, {
    t: 'pose', sitting: true
  });
  t.ok(poseHandled, 'пакет pose обработан');
  t.eq(pMove.sitting, true, 'игрок сел');

  // 11. Обработка 'editor_set_pos' для GM
  const gmPlayer = { pid: 10, yid: 'user_gm', name: 'Admin', isGm: true, x: 0, z: 0, y: 0 };
  const editorHandled = mh.handleMovementMessage(gmPlayer, {
    t: 'editor_set_pos', x: 500, z: -300
  });
  t.ok(editorHandled, 'editor_set_pos обработан');
  t.eq(gmPlayer.x, 500, 'GM телепортирован на x=500');
  t.eq(gmPlayer.z, -300, 'GM телепортирован на z=-300');

  // ==========================================
  // Тестирование duel-handler
  // ==========================================
  t.suite('Фаза 3: duel-handler (вызов, принятие, отмена сетевых дуэлей)');

  const playersMap = new Map();
  const duelCtx = {
    players: playersMap,
    send: mockSend,
    broadcastAOI: (p, msg) => {},
    isPeaceAt: (x, z) => false,
    saveProfileNow: (p) => {},
    onPlayerDeathByPlayer: (v, k) => {},
    findPlayerByName: (name) => {
      for (const [, p] of playersMap) if (p.name === name) return p;
      return null;
    },
    checkRate: () => true
  };

  const dh = createDuelHandler(duelCtx);

  const duA = {
    pid: 101, name: 'GladiatorA', x: 10, z: 10, hp: 1000, maxHp: 1000,
    dead: false, isFlagged: false, trade: null, store: null, duel: null
  };
  const duB = {
    pid: 102, name: 'GladiatorB', x: 15, z: 10, hp: 1000, maxHp: 1000,
    dead: false, isFlagged: false, trade: null, store: null, duel: null
  };
  playersMap.set(duA.pid, duA);
  playersMap.set(duB.pid, duB);

  // Вызов на дуэль (duel_offer)
  sentMessages = [];
  const offerHandled = dh.handleDuelMessage(duA, { t: 'duel_offer', pid: duB.pid });
  t.ok(offerHandled, 'пакет duel_offer обработан');
  t.ok(duB._duelFrom && duB._duelFrom.pid === duA.pid, 'duB получил инвайт от duA');
  t.ok(duA._duelTo && duA._duelTo.pid === duB.pid, 'у duA зафиксирован отправленный инвайт');

  // Принятие дуэли (duel_accept)
  sentMessages = [];
  const acceptHandled = dh.handleDuelMessage(duB, { t: 'duel_accept', pid: duA.pid });
  t.ok(acceptHandled, 'пакет duel_accept обработан');
  t.ok(dh.areDuelists(duA, duB), 'duA и duB теперь в состоянии дуэли');
  t.eq(duA.duel.peer, duB.pid, 'у duA оппонент duB');
  t.eq(duB.duel.peer, duA.pid, 'у duB оппонент duA');

  // Отмена / завершение дуэли
  const cancelHandled = dh.handleDuelMessage(duA, { t: 'duel_cancel' });
  t.ok(cancelHandled, 'пакет duel_cancel обработан');
  t.eq(dh.areDuelists(duA, duB), false, 'дуэль завершена');
  t.eq(duA.duel, null, 'у duA дуэль сброшена');
  t.eq(duB.duel, null, 'у duB дуэль сброшена');
};
