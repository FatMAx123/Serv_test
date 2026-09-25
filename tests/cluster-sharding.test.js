// ============================================================
//  TESTS / CLUSTER-SHARDING.TEST.JS
//  Тестирование многоядерного шардинга игрового мира:
//    1. shared/zone-sharding.js (пространственное зонирование, привязка к воркерам)
//    2. server/ipc-hub.js (межпроцессный IPC хаб, чат, анонсы, метрики, handoff)
// ============================================================
'use strict';

const path = require('path');
const EventEmitter = require('events');
const ROOT = path.join(__dirname, '..');
const ZS = require(path.join(ROOT, 'shared', 'zone-sharding.js'));
const { IpcHub, MSG_CHAT, MSG_ANNOUNCE, MSG_CLAN, MSG_CLAN_SYNC, MSG_METRICS, MSG_HANDOFF } = require(path.join(ROOT, 'server', 'ipc-hub.js'));
const Clans = require(path.join(ROOT, 'server', 'clans-store.js'));

module.exports = async function (t) {
  // ── 1. Зонирование мира (zone-sharding.js) ───────────────────
  t.suite('zone-sharding: конфигурация зон острова');
  t.ok(Array.isArray(ZS.ZONES) && ZS.ZONES.length === 4, 'определено ровно 4 базовые зоны мира');
  
  const town = ZS.ZONES[0];
  t.eq(town.id, 'town', 'зона 0: деревня поющей стали');
  t.ok(town.peace === true, 'деревня — мирная зона');

  t.suite('zone-sharding: определение зоны по координатам (getZoneAt)');
  // Центр деревни
  const zTown = ZS.getZoneAt(-107.5, -246.4);
  t.eq(zTown.id, 'town', 'центр деревни попадает в зону town');

  // Северные холмы и руины (z < -1000)
  const zNorth = ZS.getZoneAt(0, -1500);
  t.eq(zNorth.id, 'north_ruins', 'северные координаты попадают в north_ruins');

  // Восточные равнины (x > 0, z > -1000)
  const zEast = ZS.getZoneAt(500, 200);
  t.eq(zEast.id, 'east_plains', 'восточные координаты попадают в east_plains');

  // Западная пустошь (x < 0, z > -1000, вне радиуса города)
  const zWest = ZS.getZoneAt(-900, 200);
  t.eq(zWest.id, 'west_wasteland', 'западные координаты попадают в west_wasteland');

  t.suite('zone-sharding: распределение по ядрам / воркерам (getWorkerForCoords)');
  // При 1 воркере всегда отдаётся воркер 1
  t.eq(ZS.getWorkerForCoords(-107.5, -246.4, 1), 1, 'при 1 воркере город на воркере 1');
  t.eq(ZS.getWorkerForCoords(500, 200, 1), 1, 'при 1 воркере восток на воркере 1');

  // При 4 воркерах каждая зона строго привязана к своему воркеру 1..4
  t.eq(ZS.getWorkerForCoords(-107.5, -246.4, 4), 1, 'город (zone 0) → воркер 1');
  t.eq(ZS.getWorkerForCoords(500, 200, 4), 2, 'восток (zone 1) → воркер 2');
  t.eq(ZS.getWorkerForCoords(-900, 200, 4), 3, 'запад (zone 2) → воркер 3');
  t.eq(ZS.getWorkerForCoords(0, -1500, 4), 4, 'север (zone 3) → воркер 4');

  // ── 2. Межпроцессная шина сообщений (ipc-hub.js) ───────────────
  t.suite('ipc-hub: инициализация Primary и регистрация воркеров');
  const primaryHub = new IpcHub({ isPrimary: true });
  t.ok(primaryHub.isPrimary, 'создан Primary IpcHub');

  // Моки процессов воркеров (ChildProcess эмуляция через EventEmitter)
  class MockWorkerProcess extends EventEmitter {
    constructor(id) {
      super();
      this.id = id;
      this.sent = [];
    }
    send(msg) {
      this.sent.push(msg);
      this.emit('mock_send', msg);
    }
  }

  const worker1 = new MockWorkerProcess(1);
  const worker2 = new MockWorkerProcess(2);
  const worker3 = new MockWorkerProcess(3);

  primaryHub.registerWorker(1, worker1);
  primaryHub.registerWorker(2, worker2);
  primaryHub.registerWorker(3, worker3);

  t.eq(primaryHub.workers.size, 3, 'зарегистрировано 3 воркера');

  t.suite('ipc-hub: сквозной бродкаст чата между воркерами');
  let receivedChat = null;
  worker2.on('mock_send', (msg) => {
    if (msg.ipcType === MSG_CHAT) receivedChat = msg;
  });

  // Воркер 1 отправляет сообщение в чат канала 'shout'
  worker1.emit('message', {
    ipcType: MSG_CHAT,
    fromWorkerId: 1,
    payload: {
      channel: 'shout',
      senderName: 'L2Warrior',
      text: 'Внимание, сбор у ворот Диона!'
    }
  });

  t.ok(receivedChat !== null, 'воркер 2 получил межпроцессное сообщение чата');
  t.eq(receivedChat && receivedChat.payload.senderName, 'L2Warrior', 'отправитель чата совпадает');
  t.eq(receivedChat && receivedChat.payload.channel, 'shout', 'канал чата shout сохранён');

  // Проверка: отправитель (воркер 1) исключён из эхо-рассылки
  const w1Echo = worker1.sent.find(m => m.ipcType === MSG_CHAT);
  t.ok(!w1Echo, 'воркер 1 не получает эхо собственного сообщения');

  t.suite('ipc-hub: глобальные анонсы (broadcastAnnounce)');
  primaryHub.broadcastAnnounce('Сервер будет перезагружен через 15 минут', 900);
  const w2Announce = worker2.sent.find(m => m.ipcType === MSG_ANNOUNCE);
  t.ok(w2Announce !== undefined, 'воркер 2 получил системный анонс от Primary');
  t.eq(w2Announce && w2Announce.payload.text, 'Сервер будет перезагружен через 15 минут', 'текст анонса передан корректно');

  t.suite('ipc-hub: агрегация метрик с воркеров (sendMetrics)');
  // Воркер 1 шлёт метрики: 150 игроков, 300 мобов, тик 12 мс
  worker1.emit('message', {
    ipcType: MSG_METRICS,
    fromWorkerId: 1,
    payload: {
      players: 150,
      mobs: 300,
      tickMs: 12,
      bytesOut: 500000,
      packetsOut: 5000
    }
  });

  // Воркер 2 шлёт метрики: 250 игроков, 400 мобов, тик 16 мс
  worker2.emit('message', {
    ipcType: MSG_METRICS,
    fromWorkerId: 2,
    payload: {
      players: 250,
      mobs: 400,
      tickMs: 16,
      bytesOut: 800000,
      packetsOut: 8000
    }
  });

  const agg = primaryHub.aggregatedMetrics;
  t.eq(agg.players, 400, 'агрегированный онлайн: 150 + 250 = 400 игроков');
  t.eq(agg.mobs, 700, 'агрегированные мобы: 300 + 400 = 700 мобов');
  t.eq(agg.bytesOut, 1300000, 'агрегированный трафик: 1.3 МБ');
  t.eq(agg.tickMsAvg, 14, 'средний тик по ядрам: (12 + 16) / 2 = 14 мс');

  t.suite('ipc-hub: адресная передача сессии игрока (Handoff)');
  // Воркер 1 передаёт игрока в зону воркера 3
  worker1.emit('message', {
    ipcType: MSG_HANDOFF,
    fromWorkerId: 1,
    targetWorkerId: 3,
    payload: {
      pid: 42,
      name: 'Balthazar',
      x: 100,
      z: -1800,
      hp: 1500
    }
  });

  const w3Handoff = worker3.sent.find(m => m.ipcType === MSG_HANDOFF);
  const w2Handoff = worker2.sent.find(m => m.ipcType === MSG_HANDOFF);
  t.ok(w3Handoff !== undefined, 'целевой воркер 3 получил handoff игрока');
  t.eq(w3Handoff && w3Handoff.payload.name, 'Balthazar', 'данные персонажа переданы без искажений');
  t.ok(w2Handoff === undefined, 'нецелевой воркер 2 НЕ получал этот handoff');

  t.suite('ipc-hub: обработка отключения воркера (exit)');
  let exitedId = null;
  primaryHub.on('worker_exit', (id) => { exitedId = id; });
  worker1.emit('exit');
  t.eq(exitedId, 1, 'primary получил событие worker_exit для воркера 1');
  t.eq(primaryHub.workers.has(1), false, 'воркер 1 удалён из активного реестра');

  // ── 3. Межядерная синхронизация состояния кланов и CWH (SYNC-CLN-01) ──
  t.suite('cluster: межядерная синхронизация кланов и склада CWH (SYNC-CLN-01)');
  let receivedClanSync = null;
  worker3.on('mock_send', (msg) => {
    if (msg.ipcType === MSG_CLAN_SYNC) receivedClanSync = msg;
  });

  const testClanSnapshot = {
    id: 'c_cluster_test_sync',
    name: 'SteamGuardians',
    level: 1,
    reputation: 500,
    leaderYid: 'yid_leader_sync',
    leaderCharId: 'c0',
    members: [
      { yid: 'yid_leader_sync', charId: 'c0', name: 'LeaderOne', rank: 'leader', joinedAt: Date.now() },
      { yid: 'yid_member_w3', charId: 'c0', name: 'MemberW3', rank: 'member', joinedAt: Date.now() }
    ],
    wh: { copper_parts: 75000, bastard_sword: 1 },
    whPlusById: { bastard_sword: 5 },
    crest: null,
    createdAt: Date.now()
  };

  // Воркер 2 (где игрок положил предмет на склад) шлёт MSG_CLAN_SYNC
  worker2.emit('message', {
    ipcType: MSG_CLAN_SYNC,
    fromWorkerId: 2,
    payload: {
      action: 'save',
      clan: testClanSnapshot
    }
  });

  t.ok(receivedClanSync !== null, 'воркер 3 получил broadcast MSG_CLAN_SYNC от Primary');
  t.eq(receivedClanSync && receivedClanSync.payload.action, 'save', 'действие save сохранено');
  t.eq(receivedClanSync && receivedClanSync.payload.clan.id, 'c_cluster_test_sync', 'ID клана передан корректно');

  // Отправитель (воркер 2) не получает эхо собственного обновления
  const w2ClanEcho = worker2.sent.find(m => m.ipcType === MSG_CLAN_SYNC);
  t.ok(!w2ClanEcho, 'воркер 2 не получает эхо собственного clan_sync');

  // Применяем полученный снапшот на узле воркера 3
  const syncedClan = Clans.applySync('save', receivedClanSync.payload.clan);
  t.ok(syncedClan !== null, 'Clans.applySync успешно гидратировал клан в память ядра');
  t.eq(syncedClan && syncedClan.wh && syncedClan.wh.copper_parts, 75000, 'склад CWH синхронизировал 75 000 адены');
  t.eq(syncedClan && syncedClan.wh && syncedClan.wh.bastard_sword, 1, 'склад CWH синхронизировал bastard_sword');
  t.eq(syncedClan && syncedClan.whPlusById && syncedClan.whPlusById.bastard_sword, 5, 'заточка меча на складе +5 синхронизирована');
  t.eq(Clans.clanIdOf('yid_member_w3', 'c0'), 'c_cluster_test_sync', 'индекс членства byKey корректно актуализирован на ядре 3');

  // Очистка тестового клана
  Clans.applySync('remove', { id: 'c_cluster_test_sync' });
  t.eq(Clans.get('c_cluster_test_sync'), null, 'тестовый клан успешно удален после проверки');
};
