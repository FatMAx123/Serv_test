'use strict';

/**
 * tests/phase6-decomposition.test.js
 * ============================================================================
 * Модульные тесты для декомпозиции Фазы 6:
 * - server/world/leaderboard-manager.js
 * - server/handlers/loot-handler.js
 * - server/world/spot-manager.js
 * - server/handlers/craft-handler.js
 * - server/http/static-server.js
 * - server/handlers/console-commands.js
 * - Дедупликация санитайзеров профиля в server/core/player.js
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { createLeaderboardManager, lbScoreOf } = require('../server/world/leaderboard-manager.js');
const { createLootHandler, PARTY_LOOT_MODES } = require('../server/handlers/loot-handler.js');
const { createSpotManager } = require('../server/world/spot-manager.js');
const { createCraftHandler } = require('../server/handlers/craft-handler.js');
const { createStaticServer, DATA_PUBLIC, DATA_PRIVATE } = require('../server/http/static-server.js');
const { createConsoleCommands } = require('../server/handlers/console-commands.js');
const playerCore = require('../server/core/player.js');
const { plusMoveOk } = require('../server/handlers/item-plus-utils.js');

module.exports = async function (t) {
  const { suite, ok, eq } = t;

  suite('Phase 6 Decomposition — Архитектура и сокращение монолита server.js');
  {
    const srvPath = path.join(__dirname, '..', 'server', 'server.js');
    const srvCode = fs.readFileSync(srvPath, 'utf8');
    const lineCount = srvCode.split('\n').length;
    ok(lineCount < 5100, `server/server.js сокращен более чем на 1000 строк (текущий размер: ${lineCount} строк < 5100)`);
    ok(srvCode.includes("require('./world/leaderboard-manager.js')"), 'server.js подключает world/leaderboard-manager.js');
    ok(srvCode.includes("require('./handlers/loot-handler.js')"), 'server.js подключает handlers/loot-handler.js');
    ok(srvCode.includes("require('./world/spot-manager.js')"), 'server.js подключает world/spot-manager.js');
    ok(srvCode.includes("require('./handlers/craft-handler.js')"), 'server.js подключает handlers/craft-handler.js');
    ok(srvCode.includes("require('./http/static-server.js')"), 'server.js подключает http/static-server.js');
    ok(srvCode.includes("require('./handlers/console-commands.js')"), 'server.js подключает handlers/console-commands.js');
    ok(typeof playerCore.safeCountMap === 'function' && typeof playerCore.sanitizeEquipSlots === 'function',
      'Санитайзеры профиля экспортируются из единого источника server/core/player.js');
  }

  suite('Phase 6 Decomposition — LeaderboardManager (world/leaderboard-manager.js)');
  {
    const players = new Map();
    const lb = createLeaderboardManager({ players });
    eq(lbScoreOf(10, 250), 10250, 'lbScoreOf корректно считает очки (level*1000 + exp)');

    lb.lbTouch('u1', { name: 'Alpha', level: 5, exp: 100 }, 'c1');
    lb.lbTouch('u2', { name: 'Beta', level: 12, exp: 50 }, 'c1');
    players.set(1, { pid: 1, yid: 'u1', charId: 'c1', name: 'Alpha', level: 15, exp: 300 });

    const top = lb.buildLeaderboard(10);
    eq(top.length, 2, 'buildLeaderboard возвращает 2 записи (индекс + перекрытие онлайном)');
    eq(top[0].name, 'Alpha', 'Онлайн-игрок Alpha с повышенным уровнем (15) занимает 1 место');
    eq(top[0].online, true, 'Онлайн-игрок помечен online: true');
    eq(top[1].name, 'Beta', 'Оффлайн-игрок Beta на 2 месте');
    eq(top[1].online, false, 'Оффлайн-игрок помечен online: false');

    lb.lbDrop('u2', 'c1');
    players.clear();
    const afterDrop = lb.buildLeaderboard(10);
    eq(afterDrop.length, 1, 'lbDrop удаляет профиль из индекса и сбрасывает кэш');
  }

  suite('Phase 6 Decomposition — LootHandler (handlers/loot-handler.js)');
  {
    const players = new Map();
    const parties = new Map();
    const groundLoot = new Map();
    const sent = [];
    const broadcasts = [];
    let nextLid = 1;

    const p1 = { pid: 1, name: 'Picker', x: 10, z: 10, hp: 100, dead: false, inv: {}, equip: {}, plusById: {}, partyId: 100 };
    const p2 = { pid: 2, name: 'Member', x: 12, z: 12, hp: 100, dead: false, inv: {}, equip: {}, plusById: {}, partyId: 100 };
    players.set(1, p1);
    players.set(2, p2);
    parties.set(100, { id: 100, members: new Set([1, 2]), lootMode: 'turn', lootTurn: 0 });

    const lh = createLootHandler({
      players,
      parties,
      groundLoot,
      allocateLootId: () => nextLid++,
      LOOT_PROTECT_SEC: 30,
      LOOT_LIFE_SEC: 180,
      LOOT_PICKUP_R2: 25,
      LOOT_VIS_R2: 10000,
      PARTY_EXP_R2: 2500,
      dist2: (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2,
      tableGet: (t, k) => (t && t[k]) || undefined,
      send: (p, msg) => sent.push({ pid: p.pid, msg }),
      sendPid: (pid, msg) => sent.push({ pid, msg }),
      broadcastNear: (x, z, msg) => broadcasts.push(msg),
      canCarryMore: () => ({ ok: true }),
      plusMoveOk,
      questCollectChanged: () => { },
      saveProfileNow: () => { },
      pushWeight: () => { }
    });

    ok(PARTY_LOOT_MODES.has('random') && PARTY_LOOT_MODES.has('turn') && PARTY_LOOT_MODES.has('finders'),
      'PARTY_LOOT_MODES содержит random, turn, finders');

    const adenaPile = lh.spawnGroundLoot(10, 10, 'copper_parts', 101, 1, {});
    ok(adenaPile && groundLoot.has(adenaPile.lid), 'spawnGroundLoot регистрирует пачку в groundLoot');

    // Сдвигаем координаты пачки точно к игроку на случай random offset
    adenaPile.x = 10;
    adenaPile.z = 10;
    lh.doLootPickup(p1, adenaPile.lid);
    eq(p1.inv.copper_parts, 51, 'Валюта группы делится поровну + остаток пикеру (51)');
    eq(p2.inv.copper_parts, 50, 'Второй участник группы получает половину валюты (50)');
    ok(!groundLoot.has(adenaPile.lid), 'Пачка валюты удалена с земли после подбора');

    // Проверка подбора незаточенного предмета, когда в сумке уже лежит +3 копия
    p1.partyId = null;
    p1.inv.bronze_sword = 1;
    p1.plusById.bronze_sword = 3;
    const swordPile = lh.spawnGroundLoot(10, 10, 'bronze_sword', 1, 1, { plus: 0 });
    swordPile.x = 10;
    swordPile.z = 10;
    lh.doLootPickup(p1, swordPile.lid);
    eq(p1.inv.bronze_sword, 1, 'Незаточенный предмет не смешивается с +3 предметом в сумке (защита заточки)');
    ok(groundLoot.has(swordPile.lid), 'Предмет остался на земле при конфликте заточки');

    // Проверка истечения времени жизни лута
    swordPile.expireAt = Date.now() - 1000;
    lh.tickGroundLoot();
    ok(!groundLoot.has(swordPile.lid), 'tickGroundLoot очищает просроченный лут');
  }

  suite('Phase 6 Decomposition — SpotManager (world/spot-manager.js)');
  {
    const players = new Map();
    const mobs = new Map();
    const spawnedSpots = new Set();
    const respawnTimers = new Map();
    let nextMid = 1;
    const spots = [
      { x: 50, z: 50, r: 20, n: 3, mob: 'scrapper', lvl: [2, 4], zoneLvl: [1, 5] }
    ];

    class DummyMob {
      constructor(mid, mob, lvl, x, z) {
        this.mid = mid;
        this.mob = mob;
        this.level = lvl;
        this.x = x;
        this.y = 0;
        this.z = z;
        this.hp = 100;
        this.maxHp = 100;
        this.speed = 6;
        this.transformSlot = -1;
      }
    }

    const sm = createSpotManager({
      Mob: DummyMob,
      players,
      mobs,
      spawnedSpots,
      respawnTimers,
      getServerSpots: () => spots,
      allocateMobId: () => nextMid++,
      entityTransforms: null,
      spatialGrid: null,
      nativeSpatialGrid: null,
      SPOT_LOAD_R2: 100 * 100,
      SPOT_UNLOAD_R2: 150 * 150,
      dist2: (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2,
      isSyntheticBot: (yid) => String(yid).startsWith('bot_'),
      applyChampionRoll: () => { },
      announceRaidSpawn: () => { },
      mobInCombat: () => false,
      cancelRespawn: () => { },
      cancelRespawnsForSpot: () => { },
      despawnMobSilent: (m) => mobs.delete(m.mid)
    });

    // Синтетический бот не должен спавнить споты
    sm.ensureNearbyMobs({ pid: 1, yid: 'bot_001', x: 50, z: 50 });
    eq(spawnedSpots.size, 0, 'Синтетический бот не активирует ensureNearbyMobs');

    // Живой игрок рядом спавнит спот
    const realP = { pid: 2, yid: 'ya_real_1', x: 50, z: 50, dead: false, hp: 100 };
    players.set(2, realP);
    sm.ensureNearbyMobs(realP);
    eq(spawnedSpots.size, 1, 'Живой игрок в радиусе активирует спавн спота');
    eq(mobs.size, 3, 'В споте заспавнено ровно n=3 моба');

    // Игрок уходит далеко -> unloadFarSpots выгружает спот
    realP.x = 500;
    realP.z = 500;
    sm.unloadFarSpots();
    eq(spawnedSpots.size, 0, 'unloadFarSpots выгружает спот, когда игроков рядом нет');
    eq(mobs.size, 0, 'Мобы выгруженного спота удалены из памяти');
    ok(typeof sm.isPeaceAt === 'function' && typeof sm.zoneLabelAt === 'function', 'Гео-хелперы isPeaceAt и zoneLabelAt доступны');
  }

  suite('Phase 6 Decomposition — CraftHandler (handlers/craft-handler.js)');
  {
    const sent = [];
    const ch = createCraftHandler({
      send: (p, msg) => sent.push(msg),
      checkRate: () => true,
      tableGet: (t, k) => (t && t[k]) || undefined,
      wouldExceedWeight: () => ({ ok: true }),
      bagPlus: (p, id) => (p.plusById && p.plusById[id]) || 0,
      pruneInv: (p) => {
        for (const k of Object.keys(p.inv)) {
          if (p.inv[k] <= 0) delete p.inv[k];
        }
      },
      questCollectChanged: () => { },
      saveProfileNow: () => { },
      pushWeight: () => { }
    });

    const G = require('../shared/game-rules.js');
    const firstRecId = Object.keys(G.RECIPES || {})[0];
    if (firstRecId) {
      const rec = G.RECIPES[firstRecId];
      const p = {
        pid: 1,
        hp: 100,
        dead: false,
        inv: { ['recipe_' + firstRecId]: 1 },
        equip: {},
        plusById: {},
        learned: new Set()
      };
      ch.doLearnRecipe(p, { id: firstRecId });
      ok(p.learned.has(firstRecId), 'doLearnRecipe изучает рецепт и добавляет его в p.learned');
      ok(!p.inv['recipe_' + firstRecId], 'doLearnRecipe списывает предмет чертежа из инвентаря');

      for (const m of rec.mats) p.inv[m.id] = m.n;
      sent.length = 0;
      ch.doCraft(p, { id: firstRecId });
      ok(sent.some(m => m.t === 'craft_ok' || m.t === 'craft_fail'), 'doCraft выполняет попытку крафта и отправляет результат');
    }
  }

  suite('Phase 6 Decomposition — StaticServer & ConsoleCommands');
  {
    const ss = createStaticServer({ REPO_ROOT: path.join(__dirname, '..'), NO_CACHE: true });
    const menuPath = ss.resolveStaticPath('/');
    ok(menuPath && menuPath.endsWith(path.join('client', 'menu.html')), 'resolveStaticPath("/") ведет на client/menu.html');
    eq(ss.resolveStaticPath('../package.json'), null, 'resolveStaticPath блокирует относительный выход за корень (..)');
    eq(ss.resolveStaticPath('/data/local_admin.json'), null, 'resolveStaticPath блокирует приватные профили в data/');
    ok(DATA_PUBLIC.test('terrain-paint-1.png') && DATA_PRIVATE.test('local_test.json'),
      'Фильтры DATA_PUBLIC и DATA_PRIVATE корректно классифицируют файлы');

    const announcements = [];
    const players = new Map([[1, { pid: 1, name: 'Tester', level: 10, gm: false, accessLevel: 0, x: 0, z: 0 }]]);
    const cc = createConsoleCommands({
      IS_CLUSTER: true,
      players,
      mobs: new Map(),
      wsByPid: new Map(),
      PlayerDb: {},
      sanitizeCharName: (s) => s,
      findPlayerByName: (n) => (n === 'Tester' ? players.get(1) : null),
      resolveAuraType: () => null,
      cosmeticsPublic: () => ({}),
      saveProfileNow: () => { },
      send: () => { },
      sendJson: () => { },
      broadcastAOI: () => { },
      broadcastWorld: (pkt) => announcements.push(pkt),
      detachPlayer: () => { }
    });
    await cc.handleConsoleCommand('announce Проверка консоли');
    eq(announcements.length, 1, 'handleConsoleCommand("announce ...") рассылает мировое объявление');
    ok(announcements[0].text.includes('Проверка консоли'), 'Текст объявления передан корректно');
  }
};

