// SERVER / SERVER.JS — авторитетный MMO-сервер. Клиент шлёт только намерения.
'use strict';
try { require('./secrets-loader.js'); } catch (_) { }
const os = require('os');
if (!process.env.UV_THREADPOOL_SIZE) {
  const cpus = os.cpus() ? os.cpus().length : 4;
  process.env.UV_THREADPOOL_SIZE = String(Math.max(4, Math.min(16, cpus * 4)));
}
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SEC = require('./security-config.js');
const GuestAuth = require('./guest-auth.js');
// онлайн-игроки аккаунта: запись токенов в БД синхронно обновляет и их копию в памяти
GuestAuth.setOnlineResolver((yid) => {
  const pid = pidByYid.get(yid);
  const pl = pid != null ? players.get(pid) : null;
  return pl ? [pl] : [];
});
const { monitorEventLoopDelay } = require('perf_hooks');
const { SpatialGrid, NativeSpatialGrid } = require('./spatial-grid.js');
const { NATIVE_QUERY_BUF_CAP, queryNativeAoiWithRescue } = require('./core/aoi-helper.js');
const elHistogram = typeof monitorEventLoopDelay === 'function' ? monitorEventLoopDelay({ resolution: 10 }) : null;
if (elHistogram) {
  elHistogram.enable();
  setInterval(() => {
    try { elHistogram.reset(); } catch (_) { }
  }, 10000).unref();
}
const CLIENT = path.join(__dirname, '..', 'client');
const SHARED = path.join(__dirname, '..', 'shared');
const NetTransport = require('./net-transport.js');
const G = require('../shared/game-rules.js');
const CS = require('../shared/class-system.js'); // раса / пол / профессии (L2)
const L2 = require('../shared/l2-combat.js');   // hit / dmg / crit
const EXP = require('../shared/l2-exp-table.js'); // C1 EXP/SP table
const SK = require('../shared/skill-db.js');     // shared skills (cast authority)
const LR = require('../shared/loot-rules.js');   // единая база дропа (сервер = авторитет)
const MOB_DB = require('../shared/mob-db.js'); // kits + spots from editor zones
const WM = require('../shared/world-metrics.js'); // зоны/регионы = editor + map_world
const WT = require('../shared/world-time.js');   // L2 day/night timing (сервер = авторитет)
const ITEMS = require('../shared/item-db.js');   // экип → weaponAtk/toolAtk/armor (combat)
const GR = require('../shared/grade-rules.js');  // levelReq + штраф Expertise D
const NP = require('../shared/net-pack.js');     // квантизация + дельта `upd` (PLAN 4.4)
const NPB = require('../shared/net-pack-binary.js'); // zero-copy бинарный протокол (PLAN 6.0)
const { EntityTransformTable, TYPE_PLAYER, TYPE_MOB } = require('../shared/entity-transform-table.js'); // Data-Oriented Design (DOD / Zero-GC)
let persistenceClient = null;
try { ({ defaultClient: persistenceClient } = require('./workers/persistence-client.js')); } catch (_) { }
const BR = require('../shared/buff-rules.js');   // слоты/стакинг/диспел C1 (PLAN 5.3)
const WR = require('../shared/weight-rules.js'); // нагрузка CON × 69000 (PLAN 5.2)
const ER = require('../shared/enchant-rules.js'); // кристаллы при сломе заточки (PLAN 5.6)
const DR = require('../shared/death-rules.js');  // дроп при смерти: PLAYER + KARMA (PLAN 5.10)
const EV = require('../shared/event-rules.js');  // набеги + анонс рейдов (PLAN 5.9)
const DU = require('../shared/duel-rules.js');   // дуэль 1v1 без кармы (PLAN 5.7)
const COS = require('../shared/cosmetics-db.js'); // titles / name color / auras
const NPCS = require('../shared/npc-services.js'); // магазины / телепорты / баффы NPC
const TR = require('../shared/trade-rules.js');  // обмен игрок ↔ игрок (правила)
const CL = require('../shared/clan-rules.js');   // клан 1–20: ранги, склад, крест
const CH = require('../shared/char-rules.js');   // мультиперсонажность: слоты, ключ yid:charId
const GEO = require('../shared/geo.js');         // heightmap + проходимость + LoS (PLAN 3.2)
const Clans = require('./clans-store.js');       // отдельное хранилище, не профиль
const QD = require('../shared/quest-db.js');     // квесты 1–20 (данные + правила)
const MR = require('../shared/moderation-rules.js');
const Mod = require('./moderation.js');
const DB = require('./db.js');
const PlayerDb = require('./player-db.js');
const AUTH = require('./auth.js');
const EditorGuard = require('./editor-guard.js');

// === HANDLERS (Domain Modules - Stage 1 Refactoring) ===
const {
  mapCount,
  equippedCount,
  plusStillHeld,
  bagPlus,
  normalizePlusRegistry,
  clearPlusIfGone,
  equippedPlus,
  playerPlusOpts,
  plusMoveOk,
  plusMove
} = require('./handlers/item-plus-utils.js');
const createWarehouseHandler = require('./handlers/warehouse-handler.js');
const createTradeHandler = require('./handlers/trade-handler.js');
const createDuelHandler = require('./handlers/duel-handler.js');
const createSocialHandler = require('./handlers/social-handler.js');
const createClanHandler = require('./handlers/clan-handler.js');
const createStoreHandler = require('./handlers/store-handler.js');
const createGmHandler = require('./handlers/gm-handler.js');
const createHttpRouter = require('./http/admin-api.js');
const { isGM, resolveAuraType } = createGmHandler;
const { createPartyHandler } = require('./handlers/party-handler.js');
const { createDeathHandler } = require('./handlers/death-handler.js');
const { createPlayerRegenHandler } = require('./handlers/player-regen-handler.js');
const { createQuestHandler } = require('./handlers/quest-handler.js');
const { createNpcServicesHandler } = require('./handlers/npc-services-handler.js');
const { createSkillLearnHandler } = require('./handlers/skill-learn-handler.js');
const createInventoryActionHandler = require('./handlers/inventory-action-handler.js');
const createEnchantHandler = require('./handlers/enchant-handler.js');
const createItemUseHandler = require('./handlers/item-use-handler.js');
const createMovementHandler = require('./handlers/movement-handler.js');
const { createDisconnectManager, sweepZombiePlayers } = require('./session/disconnect-manager.js');
const { createSessionManager } = require('./session/session-manager.js');
const { createBuffManager } = require('./combat/buff-manager.js');
const { createCombatResolver } = require('./combat/combat-resolver.js');
const { createSkillCaster } = require('./combat/skill-caster.js');
const { createCombatHandler } = require('./handlers/combat-handler.js');
const { createLeaderboardManager } = require('./world/leaderboard-manager.js');
const { createLootHandler } = require('./handlers/loot-handler.js');
const { createSpotManager } = require('./world/spot-manager.js');
const { createCraftHandler } = require('./handlers/craft-handler.js');
const { createStaticServer } = require('./http/static-server.js');
const { createConsoleCommands } = require('./handlers/console-commands.js');
const AccountKeys = require('./account-keys.js');

let skillCaster = null;



const PORT = +process.env.PORT || 8080;
const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');
const SERVER_STARTED_AT = Date.now();
const TICK_HZ = 10;
const TICK_MS = 1000 / TICK_HZ;
const TICK_NS = BigInt(Math.round(TICK_MS)) * 1_000_000n;
const TICK_BUDGET_MS = 80;
/** Фактический тик: /healthz смотрит lastTickAt, /metrics — длительность. */
let lastTickAt = Date.now();
let tickMsLast = 0;
let tickMsMax = 0;
let tickMsEma = 0;
let tickOverruns = 0;
let tickBudgetDeferred = 0;
let tickRateActual = TICK_HZ;
let _tickRateCounter = 0;
let _tickRateLastSec = Date.now();
let _nextTickTimeNs = process.hrtime.bigint() + TICK_NS;
let _tickTimeout = null;
const netStats = {
  bytesIn: 0, bytesOut: 0, packetsIn: 0, packetsOut: 0,
  updSent: 0, updSkip: 0
};
const ZS = require('../shared/zone-sharding.js');
const {
  IpcHub,
  MSG_CLIENT_RAW,
  MSG_GATEWAY_SEND,
  MSG_GATEWAY_SEND_BATCH,
  MSG_GATEWAY_CLOSE,
  MSG_CLIENT_DISCONNECT,
  MSG_WHISPER,
  MSG_HANDOFF,
  MSG_PARTY,
  MSG_BORDER_GHOSTS,
  MSG_SESSION_RESTORE,
  MSG_CHAR_DELETE_ACK,
  MSG_DETACH_ACK
} = require('./ipc-hub.js');
const CURRENT_WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '1', 10);
const IS_CLUSTER = process.env.IS_CLUSTER_WORKER === '1';
const USE_NATIVE_BUFFER_IPC = process.env.CLUSTER_IPC_SERIALIZATION === 'advanced';
try {
  process.title = IS_CLUSTER ? `mmo-zone-worker-${CURRENT_WORKER_ID}` : 'mmo-monolith';
} catch (_) { }
const proxySockets = new Map(); // connId -> GatewaySocketProxy
const borderGhosts = new Map(); // pid -> ghost object for cross-worker border seam
let _borderSyncAcc = 0;

let _cachedBaseClasses = null;
let clusterIpc = null;
let outgoingIpcBatch = [];
let batchFlushScheduled = false;

function flushGatewayBatch() {
  batchFlushScheduled = false;
  if (outgoingIpcBatch.length === 0 || !clusterIpc) return;
  const batch = outgoingIpcBatch;
  outgoingIpcBatch = [];
  clusterIpc.sendToPrimary(MSG_GATEWAY_SEND_BATCH, batch);
}

function scheduleBatchFlush() {
  if (batchFlushScheduled) return;
  batchFlushScheduled = true;
  setImmediate(flushGatewayBatch);
}

if (IS_CLUSTER) {
  clusterIpc = new IpcHub({ isPrimary: false, workerId: CURRENT_WORKER_ID });
  if (typeof Mod.setIpcHub === 'function') Mod.setIpcHub(clusterIpc);
  if (typeof AccountKeys.setIpcHub === 'function') AccountKeys.setIpcHub(clusterIpc);
  if (typeof GuestAuth.setIpcHub === 'function') GuestAuth.setIpcHub(clusterIpc);
  if (typeof DB.attachClusterIpc === 'function') DB.attachClusterIpc(clusterIpc); // DB=file: запись через мастер
  clusterIpc.on('primary_disconnect', () => shutdown('primaryDisconnect')); // мастер умер: сейв локально и выход
}
// L2-like knownlist / draw distance.
// 48 was too tight (almost empty world); 120 painted the whole field with remotes.
// Mid: see local packs, not the entire island horizon.
const AOI_RADIUS = 90;
const AOI_LEAVE_RADIUS = 108;
const SPEED_MAX = 12;
// Anti-speedhack: бюджет перемещения считается по РЕАЛЬНОМУ времени, а не «на
// пакет». Раньше лимит был константой 3.6 м на пакет при RATE.move = 20 → 72 м/с
// против легитимных 8.19 м/с (замер на живом сервере дал ×8.7).
// TOLERANCE закрывает клиентский тик и джиттер RTT, BURST — размер ведра в
// секундах хода: 0.7 с дают запас на лаг-спайк, но не на телепорт.
const MOVE_TOLERANCE = 1.25;
const MOVE_BURST_SEC = 0.8;
/** Насколько сервер должен «не согласиться» с шагом, чтобы сказать об этом клиенту. */
const MOVE_CORRECT_EPS = 1.5;
/** Не чаще раза в 300 мс: при спидхаке иначе получится ответный флуд. */
const MOVE_CORRECT_MS = 300;
// Боевые метрики острова (client/js/skills.js):
// melee ~3.5 | aggro ~12 | move ~8 | magic 30 | bow 30
const MELEE_RANGE = 4.0;
const RANGED_RANGE = 30;
// Автоатака: интервал = swingTimeSec(Atk.Spd) — база ТИПА ОРУЖИЯ × DEX (C1).
// SLACK 0.92: клиент отсчитывает свой интервал по тем же формулам, и при точном
// равенстве сетевой джиттер приводил бы к молчаливому отбрасыванию ударов.
// MIN 120 мс — потолок скорости (Atk.Spd ≈ 1100) на случай стека баффов haste.
const ATK_INTERVAL_SLACK = 0.92;
const ATK_INTERVAL_MIN_MS = 120;
// C1 clanHelpRange 300. На острове 40 L2 = 3.5 м → 300 ≈ 26 м.
const CLAN_HELP_R = 26, CLAN_HELP_R2 = CLAN_HELP_R * CLAN_HELP_R;
// C1-like raid: пачка аддов, не ковёр. Енрейдж — давление на соло.
const RAID_ADD_CAP = 4;
// C1 party EXP range ~1500. 40 L2 = 3.5 м → ≈ 131 м.
const PARTY_EXP_R = 130, PARTY_EXP_R2 = PARTY_EXP_R * PARTY_EXP_R;
// C1 invite/trade: рядом, не через остров. ~600 L2 → ≈ 50 м.
const PARTY_INVITE_R = 50, PARTY_INVITE_R2 = PARTY_INVITE_R * PARTY_INVITE_R;
const MAGIC_RANGE_DEFAULT = 30;
const MAGIC_EFFECT_RANGE_DEFAULT = 55;
// L2-like default outdoor respawn (сек); точное значение — mobStats / уровень
const MOB_RESPAWN_DEFAULT = 50;
const SPOT_LOAD_R = 115, SPOT_LOAD_R2 = SPOT_LOAD_R * SPOT_LOAD_R;
const SPOT_UNLOAD_R = 155;
const SPOT_UNLOAD_R2 = SPOT_UNLOAD_R * SPOT_UNLOAD_R;
const SAVE_EVERY = 30000;

let clusterTotalOnline = 0;
function getActiveOnlineCount() {
  return (IS_CLUSTER && clusterTotalOnline > 0) ? clusterTotalOnline : players.size;
}

// ---- ЦИКЛ ДНЯ/НОЧИ (L2-like): делегирован в world-time-handler ----
const { createWorldTimeHandler } = require('./handlers/world-time-handler');
const worldTimeHandler = createWorldTimeHandler({
  WT,
  players: () => players,
  send: (p, msg) => send(p, msg),
  getOnlineCount: getActiveOnlineCount,
  TICK_MS,
  onTimeSync: (wt) => {
    if (IS_CLUSTER && clusterIpc && typeof clusterIpc.broadcastWorldTimeSync === 'function') {
      clusterIpc.broadcastWorldTimeSync(wt);
    }
  }
});
const { DAY_LENGTH_SEC, worldTimePayload, wtSafe, broadcastTime, setWorldHour, tickDayNight } = worldTimeHandler;
const YANDEX_SECRET = process.env.YANDEX_APP_SECRET || '';
// Валидация подсистемы аутентификации в продакшене (YANDEX_APP_SECRET обязателен)
try {
  AUTH.assertProductionAuth();
} catch (err) {
  console.error('[fatal] ' + err.message);
  process.exit(1);
}
const DEBUG_EVENTS = (process.env.DEBUG_EVENTS || '1') === '1';
const RATE = { move: 20, attack: 8, action: 6, chat: 2, pvp: 4, skill: 10, npc: 12 };
const R2 = AOI_RADIUS * AOI_RADIUS;
const AOI_LEAVE_R2 = AOI_LEAVE_RADIUS * AOI_LEAVE_RADIUS;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const spatialGrid = new SpatialGrid(72);
const nativeSpatialGrid = typeof NativeSpatialGrid === 'function' ? new NativeSpatialGrid(-20480, -20480, 20480, 20480, 72) : null;
const _nativePBuf = new Int32Array(NATIVE_QUERY_BUF_CAP);
const _nativeMBuf = new Int32Array(NATIVE_QUERY_BUF_CAP);
const entityTransforms = new EntityTransformTable(8192);

const WORKER_ID_BASE = IS_CLUSTER ? (CURRENT_WORKER_ID * 10000000) : 0;
let nextId = WORKER_ID_BASE + 1;
let nextLootId = WORKER_ID_BASE + 1;
const players = new Map();
const mobs = new Map();
/** @type {Map<number, {lid:number,x:number,z:number,itemId:string,count:number,ownerPid:number|null,protectUntil:number,expireAt:number,spoil:boolean,mobId?:string}>} */
const groundLoot = new Map();
const wsByPid = new Map();
const pidByYid = new Map(); // yid -> pid: один аккаунт = одна активная сессия
const loggingIn = new Set(); // yid, для которых идёт doLogin (барьер на время await DB.load)
const sessions = new Map();
const parties = new Map();
const spawnedSpots = new Set();
const activeEvents = new Map();

// Ground loot timing (L2-like; from LOOT_CONFIG when present)
const LOOT_PROTECT_SEC = (LR.LOOT_CONFIG && LR.LOOT_CONFIG.DROP_PROTECTION_TIME) || 30;
const LOOT_LIFE_SEC = (LR.LOOT_CONFIG && LR.LOOT_CONFIG.DROP_LIFETIME) || 180;
const LOOT_PICKUP_RANGE = 4.5;
const LOOT_PICKUP_R2 = LOOT_PICKUP_RANGE * LOOT_PICKUP_RANGE;
const LOOT_VIS_R2 = R2; // same as AOI

function filterSpotsForWorker(spots) {
  if (!IS_CLUSTER || !Array.isArray(spots)) return spots;
  return spots.filter(sp => ZS.getWorkerForCoords(sp.x, sp.z, TOTAL_WORKERS) === CURRENT_WORKER_ID);
}

// Пересобирается после applyEditorOverrides (см. низ файла) и при save оверрайдов
let SERVER_SPOTS = filterSpotsForWorker(WM.buildSpots());
function rebuildServerSpots() {
  SERVER_SPOTS = filterSpotsForWorker(WM.buildSpots());
  // Снять уже заспавненных спотовых мобов и отменить их отложенный респавн.
  // Раньше чистился только spawnedSpots, из-за чего каждый пересбор дублировал
  // всё население острова (21 → 42 → 105 мобов).
  for (const [mid, m] of mobs) {
    if (m.spotIdx != null && m.spotIdx >= 0) {
      cancelRespawn(mid);
      if (typeof despawnMobSilent === 'function') despawnMobSilent(m);
      else {
        if (entityTransforms && m.transformSlot >= 0) {
          entityTransforms.free(m.transformSlot);
          m.transformSlot = -1;
        }
        mobs.delete(mid);
      }
    }
  }
  // сброс спавна — следующий ensureNearbyMobs пересоздаст
  spawnedSpots.clear();
  return SERVER_SPOTS;
}

// Отложенные респавны: mid убитого моба -> таймер. Нужны, чтобы пересбор спотов
// или выгрузка региона не выстреливали спавном в уже сброшенный мир.
const respawnTimers = new Map();
function cancelRespawn(mid) {
  const rec = respawnTimers.get(mid);
  if (!rec) return;
  const t = rec.timer || rec;
  try { clearTimeout(t); } catch (_) { }
  respawnTimers.delete(mid);
}
function cancelAllRespawns() {
  for (const [, rec] of respawnTimers) {
    const t = rec && (rec.timer || rec);
    try { if (t) clearTimeout(t); } catch (_) { }
  }
  respawnTimers.clear();
}
function cancelRespawnsForSpot(idx) {
  for (const [mid, rec] of [...respawnTimers]) {
    const si = rec && rec.spotIdx;
    if (si === idx) cancelRespawn(mid);
  }
}

// ============================================================
//  ДОМЕННАЯ МОДЕЛЬ PLAYER И САНИТАЙЗЕРЫ ПРОФИЛЯ (core/player.js)
//  Инкапсулирует: class Player, боевые характеристики, экипировку,
//  приборы инженера, пассивки, баффы, дебаффы, вес и формулы L2 C1.
// ============================================================
const playerCore = require('./core/player.js');
const {
  Player,
  BAD_KEYS,
  isBadKey,
  safeNum,
  tableGet,
  safeCountMap,
  safeEquipMap,
  EQUIP_SLOTS,
  equipSlotForTpl,
  sanitizeEquipSlots,
  safeSkillMap,
  safeFriendList,
  sanitizeCharName,
  safeDevices,
  stampDeviceFields,
  syncDevicesToEquip,
  hasRobeSetEquipped,
  namedSetCastBonus,
  armorSetBonuses,
  SHOT_ITEMS,
  normalizeItemGrade,
  equippedWeaponGrade,
  equippedWeaponShotCount,
  shotKindMatchesFilter,
  toggleShotArm,
  consumeArmedShot,
  passiveBonuses,
  ensureStarterSkills,
  grantExpertiseSkills,
  equippedArmorGrade,
  isPlayerImmortal,
  effectsPayload,
  invalidateCombatPack,
  playerStunned,
  playerSilenced,
  itemLookup,
  playerCon,
  weightPayload,
  canCarryMore,
  invAfter,
  wouldExceedWeight,
  skillAllowedForClass,
  cosmeticsPublic,
  grantSkillFree
} = playerCore;

// Player model delegation: this.debuffs = [] in class Player (see core/player.js)
// GM skills init: starters.push('gm_speed') - делегировано в core/player.js
playerCore.setPlayerSend((p, msg) => send(p, msg));

function playerWeightState(p) { return playerCore.playerWeightState(p); /* WR.totalLoad, noRegen, canAttack */ }
function applyPlayerBuff(p, buff, now) { return playerCore.applyPlayerBuff(p, buff, now); /* BR.apply */ }
function pushEffects(p) { invalidateCombatPack(p); send(p, effectsPayload(p)); }
function pushWeight(p) { if (p) p._weightStateAt = 0; send(p, Object.assign({ t: 'weight' }, weightPayload(p))); }
function failWeight(p, t, extra) {
  const st = playerWeightState(p);
  send(p, Object.assign({ t: t || 'loot_fail', reason: 'weight', weight: st.load, maxWeight: st.max }, extra || {}));
}
function applyPlayerDebuff(p, deb, now) { return playerCore.applyPlayerDebuff(p, deb, now, cancelPlayerCast); }
// ---- СИСТЕМА МОБОВ, АГРО, СКИЛЛОВ И СИМУЛЯЦИИ МИРА (L2-like) ----
const { createMobHandler } = require('./handlers/mob-handler');
const mobHandler = createMobHandler({
  mobs,
  players,
  spatialGrid,
  nativeSpatialGrid,
  activeEvents,
  respawnTimers,
  spawnedSpots,
  getServerSpots: () => SERVER_SPOTS,
  getNextId: () => nextId++,
  GEO,
  MOB_DB,
  G,
  L2,
  LR,
  EV,
  WM,
  dist2: (x1, z1, x2, z2) => dist2(x1, z1, x2, z2),
  send: (p, msg) => send(p, msg),
  broadcastAOI: (origin, msg) => broadcastAOI(origin, msg),
  playerNear: (x, z, r2, includeDead = false) => playerNear(x, z, r2, includeDead),
  geoStepMob: (m, tx, tz) => geoStepMob(m, tx, tz),
  mobDisplayNameServer: (mobId) => mobDisplayNameServer(mobId),
  spawnMobDropPiles: (x, z, drop, ownerPid, opts) => spawnMobDropPiles(x, z, drop, ownerPid, opts),
  splitExpToParty: (p, exp, mobLevel, opts) => splitExpToParty(p, exp, mobLevel, opts),
  parties,
  partyOf: (p) => partyOf(p),
  partyMembers: (p) => partyMembers(p),
  questOnKill: (p, mobId) => questOnKill(p, mobId),
  saveProfileNow: (p) => saveProfileNow(p),
  regionNameById: (id) => regionNameById(id),
  zoneLabelAt: (x, z) => zoneLabelAt(x, z),
  losGround: (ax, az, bx, bz, ay, by) => losGround(ax, az, bx, bz, ay, by),
  onPlayerHit: (p, dmg) => onPlayerHit(p, dmg),
  onPlayerDeath: (p, opts) => onPlayerDeath(p, opts),
  applyPlayerDebuff: (p, deb, now) => applyPlayerDebuff(p, deb, now),
  pushEffects: (p) => pushEffects(p),
  pushCombatStats: (p) => pushCombatStats(p),
  isPlayerImmortal: (p) => isPlayerImmortal(p),
  isNight: () => worldTimeHandler.isNight(),
  MELEE_RANGE,
  MOB_RESPAWN_DEFAULT,
  TICK_MS,
  SPOT_LOAD_R2,
  SPOT_UNLOAD_R2,
  PARTY_EXP_R2,
  RAID_ADD_CAP,
  CLAN_HELP_R2,
  DEBUG_EVENTS,
  entityTransforms
});

const {
  Mob,
  getMobSkillDef,
  applyMobEffect,
  getMobEffects,
  broadcastMobEffects,
  pruneAddMids,
  notifyMobRemoved,
  despawnMobSilent,
  despawnAdds,
  spawnRaidAdds,
  tryMobSkill,
  hateFromHit,
  addMobHate,
  recordMobDamage,
  resolveMobContributors,
  callClanHelp,
  clearMobHate,
  resetMobOnHome,
  hateOf,
  retargetFromHate,
  topHatePlayer,
  applyChampionRoll,
  mobRespawnSec,
  onMobDeath,
  eventZoneName,
  eventStartPayload,
  broadcastEvent,
  announceRaidSpawn,
  announceRaidDeath,
  hasActiveInvasion,
  liveEventMobs,
  endInvasion,
  maybeFinishInvasion,
  startInvasion,
  tickWorldEvents,
  tickMobs,
  mobInCombat,
  handleDebugEvent
} = mobHandler;

/** Реестр изменённых профилей для Write-Behind Dirty Cache (Спринт 1, v2.2) */
// SEC (C-09): префиксы ботов отключают античит (clampSpeed) — признаём их только в глобальном
// стресс-режиме (STRESS_TEST=1 / insecure dev) или после криптографической сверки STRESS_SECRET
// на сокете (playerCore.markStressBot в session-manager). Одного наличия STRESS_SECRET недостаточно.
function isSyntheticBot(yid) { return yid ? playerCore.isSyntheticBot(yid) : false; }

const _dirtyProfiles = new Map(); // key = `${p.yid}:${p.charId || 'c0'}` -> p
// Очередь повторов неудавшихся сохранений (core/save-retry.js): ошибка записи больше не теряет прогресс
const saveRetry = require('./core/save-retry.js').createSaveRetry({ DB });
const { onSaveFailed: onProfileSaveFailed, retry: retryFailedSaves, saveBatch: saveBatchWithRetry } = saveRetry;

/**
 * Пометить профиль игрока как изменённый (Write-Behind Dirty Cache).
 * Изменения накапливаются в памяти и сбрасываются фоновым батчем раз в 30 секунд,
 * не блокируя Event Loop и дисковый поток на каждом тике.
 */
function markProfileDirty(p) {
  if (!p || !p.yid || p._handedOff) return; // _handedOff: устаревшая копия после handoff
  if (isSyntheticBot(p.yid)) return;
  const key = p._profileKey || (p._profileKey = p.yid + ':' + (p.charId || 'c0'));
  _dirtyProfiles.set(key, p);
}

/** Немедленный сейв профиля (level-up / скиллы / профессия / заточка / сделка / дисконнект).
 *  Снимает профиль из очереди dirtyProfiles и сразу отправляет в DB.save. */
function saveProfileNow(p) {
  if (!p) return;
  if (p._handedOff) return;
  if (p.yid && isSyntheticBot(p.yid)) return;
  const key = p._profileKey || (p._profileKey = p.yid + ':' + (p.charId || 'c0'));
  _dirtyProfiles.delete(key);
  let item = null;
  try {
    const pr = profileOf(p);
    item = { yid: p.yid, charId: p.charId, data: pr };
    lbTouch(p.yid, pr, p.charId);
    const r = DB.save(p.yid, pr, p.charId);
    if (r && typeof r.catch === 'function') r.catch(e => { console.error('[DB] save', p.yid, e && e.message); onProfileSaveFailed(item); });
  } catch (e) { console.error('[DB] save', p.yid, e && e.message); if (item) onProfileSaveFailed(item); }
}

// Атомарное сохранение переносов (обмен, лавка, клан-склад): core/transfer-save.js
const { saveTransferAtomic } = require('./core/transfer-save.js').createTransferSave({ DB, Clans, profileOf: (p) => profileOf(p), lbTouch: (y, pr, c) => lbTouch(y, pr, c), onProfileSaveFailed, saveProfileNow: (p) => saveProfileNow(p), isSyntheticBot, dirtyProfiles: _dirtyProfiles });
/** Фоновый или принудительный сброс накопившихся грязных профилей на диск. */
function flushDirtyProfiles(specificKey) {
  if (specificKey) {
    for (const [k, p] of _dirtyProfiles) {
      if (k === specificKey || p.yid === specificKey) {
        _dirtyProfiles.delete(k);
        saveProfileNow(p);
      }
    }
    return;
  }
  if (_dirtyProfiles.size === 0) return;
  const batch = [];
  for (const [k, p] of _dirtyProfiles) {
    _dirtyProfiles.delete(k);
    if (!p || p._handedOff) continue;
    if (p.yid && isSyntheticBot(p.yid)) continue;
    try {
      const pr = profileOf(p);
      lbTouch(p.yid, pr, p.charId);
      batch.push({ yid: p.yid, data: pr, charId: p.charId });
    } catch (e) { console.error('[DB] flushDirtyProfiles prep', p.yid, e && e.message); }
  }
  saveBatchWithRetry(batch, 'saveBatch error');
}

const { profileOf, combatStatsPayload } = playerCore;
function selfPayload(p) {
  return playerCore.selfPayload(p, clanTagOf);
}

function pushCombatStats(p) {
  p.applyClassStats();
  send(p, combatStatsPayload(p));
}

/** Рейтинг для title screen: online + сохранённые профили (file DB).
 *  Индекс профилей строится один раз при старте асинхронно и дальше обновляется
 *  в памяти при каждом сейве. Раньше на КАЖДЫЙ запрос делался readdirSync +
 *  readFileSync по всем файлам: 500 профилей = 246 мс полной остановки мира,
 *  а меню опрашивает ручку каждые 4 секунды. */
const leaderboardManager = createLeaderboardManager({
  players,
  dataDir: path.join(__dirname, '..', 'data')
});
const {
  lbIndex,
  lbScoreOf,
  lbTouch,
  lbDrop,
  loadLeaderboardIndex,
  buildLeaderboard
} = leaderboardManager;

function sendJson(ws, o) {
  if (!ws || ws.readyState !== 1) return;
  // Сокет забит (>512 КБ): отбрасываем только несрочное. 'aoi' — никогда: сервер уже записал сущность в p.known.
  if (ws.bufferedAmount > 524288 && o && (o.t === 'upd' || o.t === 'dmg' || o.t === 'skill_fx' || o.t === 'cosmetic')) return;
  const json = typeof o === 'string' ? o : JSON.stringify(o);
  netStats.packetsOut++;
  netStats.bytesOut += json.length;
  // Всегда compress: false для исключения zlib блокировок в threadpool
  ws.send(json, { compress: false });
}
function sendBinary(ws, buf) {
  if (!ws || ws.readyState !== 1 || !buf) return;
  // Если сокет перегружен (>256 КБ), отбрасываем несрочный бинарный фрейм
  if (ws.bufferedAmount > 262144) return;
  netStats.packetsOut++;
  netStats.bytesOut += buf.length;
  // Бинарные пакеты (NPB) уже упакованы и сжаты на уровне байт.
  // compress: false исключает блокировку в zlib threadpool и утечку памяти в очереди deflate.
  ws.send(buf, { binary: true, compress: false });
}
function send(p, o) { sendJson(wsByPid.get(p.pid), o); }
function sendPid(pid, o) {
  const ws = wsByPid.get(pid);
  if (ws) {
    sendJson(ws, o);
  } else if (IS_CLUSTER && clusterIpc) {
    const isBin = Buffer.isBuffer(o) || (o instanceof ArrayBuffer);
    let payload = isBin && !Buffer.isBuffer(o) ? Buffer.from(o) : (isBin ? NPB.detachBuffer(o) : (typeof o === 'string' ? o : JSON.stringify(o)));
    let isBase64 = false;
    if (isBin && Buffer.isBuffer(payload) && !USE_NATIVE_BUFFER_IPC) {
      payload = payload.toString('base64');
      isBase64 = true;
    }
    outgoingIpcBatch.push({
      connId: null,
      pid: pid,
      data: payload,
      isBinary: !!isBin,
      isBase64: isBase64
    });
    scheduleBatchFlush();
  }
}
function sendUpd(p, updList) {
  if (!updList || !updList.length) return;
  const ws = wsByPid.get(p.pid);
  if (!ws || ws.readyState !== 1) return;
  // Backpressure drop: скоропортящаяся дельта координат отбрасывается,
  // если сокет клиента не успевает вычитывать TCP буфер.
  // Для ботов порог 32 КБ, для живых игроков — 256 КБ (согласовано с sendBinary)
  const isBot = isSyntheticBot(p.yid);
  const maxBuffer = isBot ? 32768 : 262144;
  if (ws.bufferedAmount > maxBuffer) {
    if (!isBot) {
      const tgtKey = p.target ? (p.target.type === 'm' ? 'm' + p.target.mid : 'p' + p.target.pid) : null;
      let filtered = tgtKey ? updList.filter(u => u.k === tgtKey) : [];
      if (!filtered.length) {
        filtered = updList.slice(0, 24);
      }
      updList = filtered;
      if (!updList.length) {
        netStats.updSkip++;
        return;
      }
    } else {
      netStats.updSkip++;
      return;
    }
  }
  if (p.binaryProto) {
    const buf = NPB.encodeUpd(updList);
    sendBinary(ws, buf);
  } else {
    _sharedUpdPacket.upd = updList;
    sendJson(ws, _sharedUpdPacket);
    _sharedUpdPacket.upd = null;
  }
}
function broadcastAOI(p, o) {
  if (!p || !o) return;
  const isBotOrigin = p && p.yid && isSyntheticBot(p.yid);
  const isCombatFx = (o.t === 'dmg' || o.t === 'skill_fx' || o.t === 'flash_fx' || o.t === 'dmg_player');
  const json = typeof o === 'string' ? o : JSON.stringify(o);
  const opts = { compress: false };
  const pWs = wsByPid.get(p.pid);
  if (pWs && pWs.readyState === 1 && pWs.bufferedAmount <= 131072) {
    netStats.packetsOut++;
    netStats.bytesOut += json.length;
    pWs.send(json, opts);
  }
  if (p.knownBy && p.knownBy.size > 0) {
    for (const pid of p.knownBy) {
      if (pid !== p.pid) {
        const obs = players.get(pid);
        if (!obs) continue;
        const obsWs = wsByPid.get(pid);
        if (!obsWs || obsWs.readyState !== 1) continue;
        const isObsHuman = !obs.yid || !isSyntheticBot(obs.yid);
        if (isObsHuman) {
          if (obsWs.bufferedAmount > 65536 && (isCombatFx || o.t === 'cosmetic')) {
            continue;
          }
          if (isBotOrigin && isCombatFx) {
            const obsTarget = obs.target;
            const isTargeted = obsTarget && (
              (obsTarget.type === 'p' && obsTarget.pid === p.pid) ||
              (obsTarget.type === 'm' && o.mid != null && obsTarget.mid === o.mid)
            );
            if (!isTargeted) {
              const d2 = dist2(obs.x, obs.z, p.x, p.z);
              if (d2 > 324) continue;
            }
          }
        } else {
          // Наблюдатель — синтетический бот: не шлём визуальные FX, косметику, анимации и звуки
          if (o.t === 'skill_fx' || o.t === 'flash_fx' || o.t === 'resurrect_fx' || o.t === 'cosmetic' || o.t === 'cast_bar' || o.t === 'aura' || o.t === 'sound' || o.t === 'shoot_fx') {
            continue;
          }
          if (isBotOrigin && (isCombatFx || o.t === 'cosmetic' || o.t === 'flash_fx' || o.t === 'resurrect_fx')) {
            continue;
          }
          if (isCombatFx) {
            const isAttacker = (o.by === obs.pid || o.by === ('p' + obs.pid) || o.attackerPid === obs.pid);
            const isTarget = (o.targetPid === obs.pid || (obs.target && ((obs.target.type === 'm' && o.mid != null && obs.target.mid === o.mid) || (obs.target.type === 'p' && o.targetPid != null && obs.target.pid === o.targetPid))));
            if (!isAttacker && !isTarget) {
              continue;
            }
          }
          if (obsWs.bufferedAmount > 32768) {
            continue;
          }
        }
        netStats.packetsOut++;
        netStats.bytesOut += json.length;
        obsWs.send(json, opts);
      }
    }
  }
}

function broadcastCosmeticsUpdate(p) {
  if (!p) return;
  const cosPub = cosmeticsPublic(p);
  broadcastAOI(p, {
    t: 'cosmetic',
    pid: p.pid,
    title: cosPub.title,
    titleName: cosPub.titleName,
    titleColor: cosPub.titleColor,
    nameColor: cosPub.nameColor,
    aura: cosPub.aura
  });
}

/**
 * Dead Reckoning: Рассылка пакета MOVE_VEC_START (0x03) наблюдателям в AOI.
 * Для binaryProto клиентов формируется бинарный 27-байтовый кадр Zero-Copy,
 * для JSON — компактный объект { t: 'move_vec_start', ... }.
 */
/**
 * Рассылка вектора перемещения бота ИСКЛЮЧИТЕЛЬНО реальным игрокам в AOI.
 * Исключает лавинообразный шторм пакетов между 3000-5000 ботами (Zero CPU/Net Overhead),
 * при этом обеспечивает 100% плавный 60 FPS Dead Reckoning на клиентах реальных игроков.
 */
function broadcastBotMoveVecStartToHumans(p, startX, startZ, targetX, targetZ, speed, flags) {
  if (!p || !p.knownBy || p.knownBy.size === 0) return;
  const key = 'p' + p.pid;
  const now = Date.now();
  let binBuf = null;
  let jsonMsg = null;
  for (const pid of p.knownBy) {
    const obs = players.get(pid);
    if (!obs || obs.pid === p.pid) continue;
    // Боты НЕ получают векторы других ботов:
    if (obs.yid && isSyntheticBot(obs.yid)) continue;
    const ws = wsByPid.get(obs.pid);
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 131072) continue;
    if (obs.binaryProto) {
      if (!binBuf) {
        binBuf = NPB.encodeMoveVecStart(key, startX, startZ, targetX, targetZ, speed, flags, now);
      }
      sendBinary(ws, binBuf);
    } else {
      if (!jsonMsg) {
        jsonMsg = {
          t: 'move_vec_start',
          k: key,
          startX: startX,
          startZ: startZ,
          targetX: targetX,
          targetZ: targetZ,
          speed: speed,
          walking: !!(flags & 1),
          timestamp: now
        };
      }
      sendJson(ws, jsonMsg);
    }
  }
}

/**
 * Рассылка остановки бота ИСКЛЮЧИТЕЛЬНО реальным игрокам в AOI.
 */
function broadcastBotMoveVecStopToHumans(p, stopX, stopZ) {
  if (!p || !p.knownBy || p.knownBy.size === 0) return;
  const key = 'p' + p.pid;
  const now = Date.now();
  let binBuf = null;
  let jsonMsg = null;
  for (const pid of p.knownBy) {
    const obs = players.get(pid);
    if (!obs || obs.pid === p.pid) continue;
    if (obs.yid && isSyntheticBot(obs.yid)) continue;
    const ws = wsByPid.get(obs.pid);
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > 131072) continue;
    if (obs.binaryProto) {
      if (!binBuf) {
        binBuf = NPB.encodeMoveVecStop(key, stopX, stopZ, now);
      }
      sendBinary(ws, binBuf);
    } else {
      if (!jsonMsg) {
        jsonMsg = {
          t: 'move_vec_stop',
          k: key,
          x: stopX,
          z: stopZ,
          stopX: stopX,
          stopZ: stopZ,
          timestamp: now
        };
      }
      sendJson(ws, jsonMsg);
    }
  }
}

/**
 * Dead Reckoning: Рассылка пакета MOVE_VEC_START (0x03) наблюдателям в AOI.
 * Для binaryProto клиентов формируется бинарный 27-байтовый кадр Zero-Copy,
 * для JSON — компактный объект { t: 'move_vec_start', ... }.
 */
function broadcastMoveVecStart(p, startX, startZ, targetX, targetZ, speed, flags) {
  const key = 'p' + p.pid;
  const now = Date.now();
  let binBuf = null;
  let jsonMsg = null;
  const isOriginBot = p.yid && isSyntheticBot(p.yid);
  if (isOriginBot) {
    broadcastBotMoveVecStartToHumans(p, startX, startZ, targetX, targetZ, speed, flags);
    if (isOriginBot) return; // Боты перемещаются дискретным тиком 10 Hz в upd, исключая лавинообразный шторм пакетов
  }

  const sendToObserver = (obs) => {
    if (!obs || obs.pid === p.pid) return;
    const isObsBot = obs.yid && isSyntheticBot(obs.yid);
    if (isObsBot) return;
    const ws = wsByPid.get(obs.pid);
    const maxBuf = isObsBot ? 32768 : 131072;
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > maxBuf) return;
    if (obs.binaryProto) {
      if (!binBuf) {
        binBuf = NPB.encodeMoveVecStart(key, startX, startZ, targetX, targetZ, speed, flags, now);
      }
      sendBinary(ws, binBuf);
    } else {
      if (!jsonMsg) {
        jsonMsg = {
          t: 'move_vec_start',
          k: key,
          startX: startX,
          startZ: startZ,
          targetX: targetX,
          targetZ: targetZ,
          speed: speed,
          walking: !!(flags & 1),
          timestamp: now
        };
      }
      sendJson(ws, jsonMsg);
    }
  };

  if (p.knownBy && p.knownBy.size > 0) {
    for (const pid of p.knownBy) {
      const obs = players.get(pid);
      if (obs) sendToObserver(obs);
    }
  }
}

/**
 * Dead Reckoning: Рассылка пакета MOVE_VEC_STOP (0x04) наблюдателям в AOI.
 */
function broadcastMoveVecStop(p, stopX, stopZ) {
  const key = 'p' + p.pid;
  const now = Date.now();
  let binBuf = null;
  let jsonMsg = null;
  const isOriginBot = p.yid && isSyntheticBot(p.yid);
  if (isOriginBot) {
    broadcastBotMoveVecStopToHumans(p, stopX, stopZ);
    if (isOriginBot) return; // Боты останавливаются в upd тике без лишних пакетов
  }

  const sendToObserver = (obs) => {
    if (!obs || obs.pid === p.pid) return;
    const isObsBot = obs.yid && isSyntheticBot(obs.yid);
    if (isObsBot) return;
    const ws = wsByPid.get(obs.pid);
    const maxBuf = isObsBot ? 32768 : 131072;
    if (!ws || ws.readyState !== 1 || ws.bufferedAmount > maxBuf) return;
    if (obs.binaryProto) {
      if (!binBuf) {
        binBuf = NPB.encodeMoveVecStop(key, stopX, stopZ, now);
      }
      sendBinary(ws, binBuf);
    } else {
      if (!jsonMsg) {
        jsonMsg = {
          t: 'move_vec_stop',
          k: key,
          x: stopX,
          z: stopZ,
          stopX: stopX,
          stopZ: stopZ,
          timestamp: now
        };
      }
      sendJson(ws, jsonMsg);
    }
  };

  if (p.knownBy && p.knownBy.size > 0) {
    for (const pid of p.knownBy) {
      const obs = players.get(pid);
      if (obs) sendToObserver(obs);
    }
  }
}
function broadcastRegion(regionId, o) {
  if (netTransport && typeof netTransport.publish === 'function') {
    const json = typeof o === 'string' ? o : JSON.stringify(o);
    netTransport.publish('region:' + regionId, json, false);
    return;
  }
  for (const [, p] of players) if (p.region === regionId) send(p, o);
}
function broadcastNear(x, z, o, r2) {
  const R = r2 != null ? r2 : LOOT_VIS_R2;
  const radius = Math.sqrt(R);
  if (nativeSpatialGrid) {
    const res = nativeSpatialGrid.queryRadius(x, z, radius, _nativePBuf, _nativeMBuf);
    for (let i = 0; i < res.players; i++) {
      const pl = players.get(_nativePBuf[i]);
      if (pl && dist2(pl.x, pl.z, x, z) <= R) send(pl, o);
    }
    return;
  }
  if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
    spatialGrid.forEachCandidate(x, z, radius, (pl) => {
      if (dist2(pl.x, pl.z, x, z) <= R) send(pl, o);
    }, null);
  } else {
    for (const [, pl] of players) {
      if (dist2(pl.x, pl.z, x, z) <= R) send(pl, o);
    }
  }
}
function broadcastAll(o) {
  if (netTransport && typeof netTransport.publish === 'function') {
    const json = typeof o === 'string' ? o : JSON.stringify(o);
    netTransport.publish('world', json, false);
    return;
  }
  for (const [, pl] of players) send(pl, o);
}
function broadcastWorld(o) {
  broadcastAll(o);
  if (clusterIpc && o) {
    if (o.t === 'announce') clusterIpc.broadcastAnnounce(o.text);
    else if (o.t === 'chat' && o.ch === 'announce') clusterIpc.broadcastAnnounce(o.text);
  }
}

/** Синхронизация подписки на C++ Pub/Sub топик региона при смене зоны. */
function syncPlayerRegionSubscription(p, oldRegion, newRegion) {
  if (!p || !newRegion || oldRegion === newRegion) return;
  const ws = wsByPid.get(p.pid);
  if (ws && typeof ws.subscribe === 'function') {
    try {
      if (oldRegion && typeof ws.unsubscribe === 'function') {
        ws.unsubscribe('region:' + oldRegion);
      }
      ws.subscribe('region:' + newRegion);
    } catch (_) { }
  }
}

/**
 * Сменить регион игрока (телепорт, респавн, GM-перемещение) и синхронизировать подписку
 * на топик региона. Раньше телепорты меняли p.region напрямую, и игрок продолжал получать
 * региональные пакеты старой зоны (а новой — нет) до первого шага.
 * @param {object} p
 * @param {{regionId?: string, notify?: boolean}} [opts] regionId — явный регион, иначе по координатам
 * @returns {boolean} регион изменился
 */
function updatePlayerRegion(p, opts) {
  if (!p) return false;
  const id = (opts && opts.regionId) || (WM.regionAt(p.x, p.z) || {}).id;
  if (!id || id === p.region) return false;
  const oldReg = p.region;
  p.region = id;
  syncPlayerRegionSubscription(p, oldReg, id);
  if (opts && opts.notify) send(p, { t: 'region', region: id, peace: isPeaceAt(p.x, p.z), zoneName: zoneLabelAt(p.x, p.z) });
  return true;
}


/** Прервать каст персонажа и уведомить AOI (3.3). */
function cancelPlayerCast(p, reason) {
  if (skillCaster) return skillCaster.cancelPlayerCast(p, reason);
  if (!p || !p.casting) return;
  const c = p.casting;
  p.casting = null;
  const pkt = {
    t: 'cast_cancel',
    pid: p.pid,
    skillId: c.skillId,
    reason: reason || 'interrupted'
  };
  send(p, pkt);
  broadcastAOI(p, pkt);
  if (reason === 'interrupted') {
    send(p, { t: 'msg', text: 'Каст сбит уроном!' });
  } else if (reason === 'move') {
    send(p, { t: 'msg', text: 'Каст прерван движением.' });
  }
}

/** Проверка срыва каста при получении урона по формуле L2.calcCastCancel (3.3). */
function checkCastCancelOnDamage(p, dmg) {
  if (skillCaster) return skillCaster.checkCastCancelOnDamage(p, dmg);
  if (!p || !p.casting || !dmg || dmg <= 0) return;
  const men = (p.combatPack && p.combatPack.primary && p.combatPack.primary.MEN) || (p.primary && p.primary.MEN) || 20;
  const maxHp = p.maxHp || 100;
  const res = (L2 && L2.calcCastCancel) ? L2.calcCastCancel(dmg, men, maxHp) : { cancel: false };
  let cancel = res.cancel;
  if (cancel && p.combatPack && p.combatPack.cancelResist) {
    if (Math.random() < p.combatPack.cancelResist) {
      cancel = false;
    }
  }
  if (cancel) {
    cancelPlayerCast(p, 'interrupted');
  }
}

/** Сброс позы отдыха (P1.1), обновление таймера боя и проверка срыва каста при ударе. */
function onPlayerHit(p, dmg) {
  if (skillCaster) return skillCaster.onPlayerHit(p, dmg);
  if (!p) return;
  if (p.sitting) p.sitting = false;
  p._lastCombatAt = Date.now();
  if (dmg && dmg > 0) {
    checkCastCancelOnDamage(p, dmg);
  }
}

// ─── Ground loot & Spot Spawner (Phase 6 Decomposition: handlers/loot-handler.js, world/spot-manager.js) ───
// Contract invariant: const lootPlus = L.plus | 0; (un-enchanted ground loot pickup with enchanted copy in bag)
const lootHandler = createLootHandler({
  players,
  parties,
  groundLoot,
  allocateLootId: () => nextLootId++,
  LOOT_PROTECT_SEC,
  LOOT_LIFE_SEC,
  LOOT_PICKUP_R2,
  LOOT_VIS_R2,
  PARTY_EXP_R2,
  dist2,
  tableGet,
  send: (p, o) => send(p, o),
  sendPid: (pid, o) => sendPid(pid, o),
  broadcastNear: (x, z, o, ex) => broadcastNear(x, z, o, ex),
  canCarryMore,
  plusMoveOk,
  questCollectChanged: (p, id) => questCollectChanged(p, id),
  saveProfileNow: (p) => saveProfileNow(p),
  pushWeight: (p) => pushWeight(p)
});
const {
  PARTY_LOOT_MODES,
  lootPayload,
  itemDisplayName,
  pickLootWinner,
  spawnGroundLoot,
  spawnMobDropPiles,
  grantLootToPlayer,
  canPickupLoot,
  doLootPickup,
  tickGroundLoot,
  sendNearbyLoot
} = lootHandler;

const spotManager = createSpotManager({
  Mob,
  players,
  mobs,
  spawnedSpots,
  respawnTimers,
  getServerSpots: () => SERVER_SPOTS,
  allocateMobId: () => nextId++,
  entityTransforms,
  spatialGrid,
  nativeSpatialGrid,
  SPOT_LOAD_R2,
  SPOT_UNLOAD_R2,
  dist2,
  isSyntheticBot,
  applyChampionRoll: (m) => applyChampionRoll(m),
  announceRaidSpawn: (m) => announceRaidSpawn(m),
  mobInCombat: (m) => mobInCombat(m),
  cancelRespawn,
  cancelRespawnsForSpot,
  despawnMobSilent: (m) => despawnMobSilent(m),
  GEO
});
const {
  spawnSpot,
  isPeaceAt,
  zoneLabelAt,
  regionNameById,
  playerNear,
  spotHasBossRespawn,
  spotShouldKeep,
  despawnSpot,
  unloadFarSpots
} = spotManager;

/** Спавн только спотов в радиусе игрока. */
function ensureNearbyMobs(p) {
  if (!p) return;
  if (p.yid && isSyntheticBot(p.yid)) return; // Синтетические боты не активируют фоновый спавн мобов всего острова
  return spotManager.ensureNearbyMobs(p);
}

const MAX_SERVER_AOI_PLAYERS = 48;
const MAX_SERVER_AOI_MOBS = 48;

// Zero-GC пулы и структуры для расчёта AOI (до 3 000 CCU)
function fastIdFromKey(key) {
  if (!key) return 0;
  let id = 0;
  for (let i = 1, len = key.length; i < len; i++) {
    id = id * 10 + (key.charCodeAt(i) - 48);
  }
  return id;
}
const _sharedCandPlayers = [];
const _sharedCandMobs = [];
const _candObjPool = [];
let _candObjIdx = 0;
function _getCand(key, priority) {
  if (_candObjIdx < _candObjPool.length) {
    const o = _candObjPool[_candObjIdx++];
    o.key = key;
    o.priority = priority;
    return o;
  }
  const o = { key: key, priority: priority };
  _candObjPool.push(o);
  _candObjIdx++;
  return o;
}
const _sharedScratchSet = new Set();
const _aoiSeenParty = new Set();
const _aoiOverflowSeen = new Set();
const _sharedAoiResult = { enter: [], leave: [] };
const _sharedUpdList = [];
const _sharedEnterSnaps = [];
const _sharedAoiPacket = { t: 'aoi', enter: null, leave: null };
const _sharedUpdPacket = { t: 'upd', upd: null };
const _updItemPool = [];
let _updItemIdx = 0;
function _getUpdItem(k, x, z, hp) {
  if (_updItemIdx < _updItemPool.length) {
    const o = _updItemPool[_updItemIdx++];
    o.k = k; o.x = x; o.z = z; o.hp = hp;
    return o;
  }
  const o = { k: k, x: x, z: z, hp: hp };
  _updItemPool.push(o);
  _updItemIdx++;
  return o;
}

function _partitionTopK(arr, left, right) {
  const mid = (left + right) >> 1;
  const pVal = arr[mid].priority;
  const tmpM = arr[mid]; arr[mid] = arr[right]; arr[right] = tmpM;
  let i = left;
  for (let j = left; j < right; j++) {
    if (arr[j].priority >= pVal) {
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      i++;
    }
  }
  const tmp = arr[i]; arr[i] = arr[right]; arr[right] = tmp;
  return i;
}

/**
 * Линейный отбор топ K элементов по приоритету без полной сортировки O(N log N).
 * При 500+ кандидатах в толпе работает в 20 раз быстрее Array.prototype.sort().
 */
function quickSelectTopK(arr, k) {
  if (!arr || arr.length <= k) return;
  let left = 0, right = arr.length - 1;
  while (right > left) {
    const p = _partitionTopK(arr, left, right);
    if (p === k) break;
    else if (p > k) right = p - 1;
    else left = p + 1;
  }
  arr.length = k;
}

let _aoiObs = null;
let _aoiPartySet = null;
let _aoiObsPx = 0;
let _aoiObsPz = 0;
let _aoiObsPid = 0;
let _aoiTargetType = null;
let _aoiTargetPid = 0;
let _aoiTargetMid = 0;

function _aoiOnPlayer(o) {
  if (o.pid === _aoiObsPid) return;
  const key = o.entityKey || ('p' + o.pid);
  const dx = _aoiObsPx - o.x, dz = _aoiObsPz - o.z;
  const d = dx * dx + dz * dz;
  const isKnown = _aoiObs.known.has(key);
  const inRange = d <= R2 || (isKnown && d <= AOI_LEAVE_R2);
  if (!inRange) return;

  let priority = 0;
  const isOtherBot = isSyntheticBot(o.yid);
  if (!isOtherBot) priority += 120000; // Живой игрок всегда приоритетнее ботов даже при заполненной known-квоте
  if (_aoiPartySet && _aoiPartySet.has(o.pid)) priority += 200000;
  if (_aoiTargetType === 'p' && _aoiTargetPid === o.pid) priority += 250000;
  if (o.target && o.target.type === 'p' && o.target.pid === _aoiObsPid) priority += 30000;
  if (o.isFlagged || o.karma > 0) priority += 20000;
  if (isKnown) priority += 100000; // Мощнейший гистерезис: уже видимый объект НЕ должен выпадать из поля зрения
  priority += Math.max(0, 10000 - (d * 0.5));

  _sharedCandPlayers.push(_getCand(key, priority));
}

function _aoiOnMob(m) {
  if (!m || m.hp <= 0) return;
  const key = m.entityKey || ('m' + m.mid);
  const dx = _aoiObsPx - m.x, dz = _aoiObsPz - m.z;
  const d = dx * dx + dz * dz;
  const isKnown = _aoiObs.known.has(key);
  const inRange = d <= R2 || (isKnown && d <= AOI_LEAVE_R2);
  if (!inRange) return;

  let priority = 0;
  if (_aoiTargetType === 'm' && _aoiTargetMid === m.mid) priority += 250000;
  if (m.target === _aoiObsPid || m.targetPid === _aoiObsPid) priority += 30000;
  if (m.boss) priority += 130000;
  else if (m.named || m.champion) priority += 15000;
  if (isKnown) priority += 100000; // Мощнейший гистерезис
  priority += Math.max(0, 10000 - (d * 0.5));

  _sharedCandMobs.push(_getCand(key, priority));
}

function recomputeAOI(p) {
  _candObjIdx = 0;
  _sharedCandPlayers.length = 0;
  _sharedCandMobs.length = 0;
  _sharedAoiResult.enter.length = 0;
  _sharedAoiResult.leave.length = 0;

  const pa = partyOf(p);
  const partySet = pa ? pa.members : null;

  // Если сетка пуста (например, изолированный вызов вне tick()), наполняем её
  if (spatialGrid.activeKeys.length === 0 && (players.size > 0 || mobs.size > 0)) {
    for (const [, pl] of players) spatialGrid.insertPlayer(pl);
    for (const [, mb] of mobs) spatialGrid.insertMob(mb);
  }

  _aoiObs = p;
  _aoiPartySet = partySet;
  _aoiObsPx = p.x;
  _aoiObsPz = p.z;
  _aoiObsPid = p.pid;
  if (p.target) {
    _aoiTargetType = p.target.type;
    _aoiTargetPid = p.target.pid || 0;
    _aoiTargetMid = p.target.mid || 0;
  } else {
    _aoiTargetType = null;
    _aoiTargetPid = 0;
    _aoiTargetMid = 0;
  }

  const isMeBot = isSyntheticBot(p.yid);
  const aoiRadius = isMeBot ? 45 : AOI_LEAVE_RADIUS;
  if (nativeSpatialGrid) {
    queryNativeAoiWithRescue({
      p, partySet, isMeBot, aoiRadius, nativeSpatialGrid, spatialGrid,
      nativePBuf: _nativePBuf, nativeMBuf: _nativeMBuf,
      players, mobs, borderGhosts, dist2,
      onPlayer: _aoiOnPlayer, onMob: _aoiOnMob,
      seenPartySet: _aoiSeenParty, overflowSeenSet: _aoiOverflowSeen
    });
  } else {
    spatialGrid.forEachCandidate(p.x, p.z, aoiRadius, _aoiOnPlayer, _aoiOnMob);
  }

  _aoiObs = null;
  _aoiPartySet = null;

  // Ограничение видимости для поддержания стабильных 60 FPS:
  // Для синтетического бота лимит масштабируется (при 3000-5000 CCU ботам достаточно видеть 6-10 ближайших акторов)
  // Для живого игрока ВСЕГДА полный лимит 128 (soft) / 160 (hard) согласно AGENTS.md инварианту 1.4!
  const maxPlayersAllowed = isMeBot
    ? (players.size > 2000 ? 6 : (players.size > 500 ? 10 : 24))
    : 128;
  const maxPlayersHard = isMeBot
    ? (players.size > 2000 ? 8 : (players.size > 500 ? 14 : 32))
    : 160;
  if (_sharedCandPlayers.length > maxPlayersAllowed) {
    // Детерминированный гистерезис: защищает видимые сущности p.known от осцилляции/мерцания
    let knownCount = 0;
    for (let j = 0; j < _sharedCandPlayers.length; j++) {
      if (p.known.has(_sharedCandPlayers[j].key)) knownCount++;
    }
    const targetK = Math.min(_sharedCandPlayers.length, Math.max(maxPlayersAllowed, Math.min(knownCount, maxPlayersHard)));
    quickSelectTopK(_sharedCandPlayers, targetK);
  }
  const maxMobsAllowed = isMeBot ? 20 : MAX_SERVER_AOI_MOBS;
  if (_sharedCandMobs.length > maxMobsAllowed) {
    quickSelectTopK(_sharedCandMobs, maxMobsAllowed);
  }

  _sharedScratchSet.clear();
  for (let i = 0; i < _sharedCandPlayers.length; i++) _sharedScratchSet.add(_sharedCandPlayers[i].key);
  for (let i = 0; i < _sharedCandMobs.length; i++) _sharedScratchSet.add(_sharedCandMobs[i].key);

  const enter = _sharedAoiResult.enter;
  const leave = _sharedAoiResult.leave;

  // leave: всё старое из p.known, чего больше нет в _sharedScratchSet
  for (const k of p.known) {
    if (!_sharedScratchSet.has(k)) leave.push(k);
  }
  for (let i = 0; i < leave.length; i++) p.known.delete(leave[i]);

  // enter: всё новое, чего ещё не было в p.known
  for (const k of _sharedScratchSet) {
    if (!p.known.has(k)) {
      enter.push(k);
      p.known.add(k);
    }
  }

  // Актуализируем обратную таблицу наблюдателей knownBy для игроков и мобов
  for (let i = 0; i < enter.length; i++) {
    const ek = enter[i];
    if (ek.charCodeAt(0) === 112 /* 'p' */) {
      const targetP = players.get(fastIdFromKey(ek));
      if (targetP) {
        if (!targetP.knownBy) targetP.knownBy = new Set();
        targetP.knownBy.add(p.pid);
      }
    } else {
      const targetM = mobs.get(fastIdFromKey(ek));
      if (targetM) {
        if (!targetM.knownBy) targetM.knownBy = new Set();
        targetM.knownBy.add(p.pid);
      }
    }
  }
  for (let i = 0; i < leave.length; i++) {
    const lk = leave[i];
    if (lk.charCodeAt(0) === 112 /* 'p' */) {
      const targetP = players.get(fastIdFromKey(lk));
      if (targetP && targetP.knownBy) {
        targetP.knownBy.delete(p.pid);
      }
    } else {
      const targetM = mobs.get(fastIdFromKey(lk));
      if (targetM && targetM.knownBy) {
        targetM.knownBy.delete(p.pid);
      }
    }
  }

  return _sharedAoiResult;
}
function snapshot(key) {
  if (key[0] === 'p') {
    const p = players.get(fastIdFromKey(key));
    if (p) {
      const cos = cosmeticsPublic(p);
      const tag = clanTagOf(p);
      return {
        t: 'p', pid: p.pid, name: p.name, x: NP.qCoord(p.x),
        y: p.y == null ? p.y : NP.qCoord(p.y), z: NP.qCoord(p.z),
        hp: NP.qHp(p.hp), maxHp: p.maxHp, level: p.level, cls: p.cls,
        race: p.race, gender: p.gender,
        appearance: p.appearance || null,
        equip: p.equip || null,
        facing: p.facing != null ? p.facing : 0,
        flagged: p.isFlagged, karma: p.karma,
        dueling: !!(p.duel && p.duel.peer),
        title: cos.title, titleName: cos.titleName, titleColor: cos.titleColor,
        nameColor: cos.nameColor, aura: cos.aura,
        gm: isGM(p), accessLevel: p.accessLevel || 0,
        gmSpeedMul: p.gmSpeedMul || 1,
        flashSpeed: !!p.flashSpeed,
        // Вывеска личной лавки: соседи должны видеть, что игрок торгует.
        store: storePublic(p),
        // Клан: имя и хеш креста. Пиксели креста в AOI не кладём — это канал
        // произвольных данных, как было с appearance. Клиент рисует крест из кэша.
        clanId: tag.clanId,
        clanName: tag.clanName,
        crestHash: tag.crestHash,
        isBot: isSyntheticBot(p.yid)
      };
    }
    const ghost = borderGhosts.get(fastIdFromKey(key));
    if (ghost) {
      const gCos = ghost.cosmetics || {};
      const gTag = ghost.clanTag || {};
      return {
        t: 'p', pid: ghost.pid, name: ghost.name, x: NP.qCoord(ghost.x),
        y: ghost.y == null ? ghost.y : NP.qCoord(ghost.y), z: NP.qCoord(ghost.z),
        hp: NP.qHp(ghost.hp), maxHp: ghost.maxHp || 100, level: ghost.level || 1, cls: ghost.cls || 'operator',
        race: ghost.race || 'human', gender: ghost.gender || 'male',
        appearance: ghost.appearance || null, equip: ghost.equip || null,
        facing: ghost.facing != null ? ghost.facing : 0,
        flagged: !!(ghost.isFlagged || ghost.flagged), karma: ghost.karma || 0,
        dueling: !!ghost.dueling,
        title: gCos.title || ghost.title || null,
        titleName: gCos.titleName || ghost.titleName || null,
        titleColor: gCos.titleColor || ghost.titleColor || null,
        nameColor: gCos.nameColor || ghost.nameColor || null,
        aura: gCos.aura || ghost.aura || 'none',
        gm: !!ghost.gm, accessLevel: ghost.accessLevel || 0,
        store: ghost.store || null,
        clanId: gTag.clanId || ghost.clanId || null,
        clanName: gTag.clanName || ghost.clanName || null,
        crestHash: gTag.crestHash || ghost.crestHash || null
      };
    }
    return null;
  }
  const m = mobs.get(fastIdFromKey(key));
  if (!m || m.hp <= 0) return null;
  // локализованное имя для UI
  let mobName = m.mobId;
  try {
    if (MOB_DB && MOB_DB.get) {
      const t = MOB_DB.get(m.mobId);
      if (t && t.name) mobName = t.name;
    }
  } catch (e) { /* ignore */ }
  return {
    t: 'm', mid: m.mid, mobId: m.mobId, name: mobName,
    x: NP.qCoord(m.x), y: m.y == null ? m.y : NP.qCoord(m.y), z: NP.qCoord(m.z), hp: NP.qHp(m.hp), maxHp: m.maxHp,
    level: Math.max(1, m.level | 0),
    boss: !!m.boss,
    named: !!m.named,
    champion: !!m.champion,
    dangerZone: !!m.dangerZone,
    role: m.role || null,
    effects: (m.effects && m.effects.length) ? getMobEffects(m) : undefined
  };
}

const _tickSnapshotCache = new Map();
const _tickBotSnapshotCache = new Map();

function getBotTickSnapshot(key) {
  let s = _tickBotSnapshotCache.get(key);
  if (s !== undefined) return s;
  if (key[0] === 'p') {
    const p = players.get(fastIdFromKey(key));
    if (p) {
      s = {
        t: 'p', pid: p.pid, name: p.name,
        x: NP.qCoord(p.x), z: NP.qCoord(p.z),
        hp: NP.qHp(p.hp), store: storePublic(p)
      };
    } else {
      s = null;
    }
  } else {
    const m = mobs.get(fastIdFromKey(key));
    if (m && m.hp > 0) {
      s = {
        t: 'm', mid: m.mid, mobId: m.mobId,
        x: NP.qCoord(m.x), z: NP.qCoord(m.z),
        hp: NP.qHp(m.hp), boss: !!m.boss
      };
    } else {
      s = null;
    }
  }
  _tickBotSnapshotCache.set(key, s);
  return s;
}

function getTickSnapshot(key) {
  let s = _tickSnapshotCache.get(key);
  if (s !== undefined) return s;
  s = snapshot(key);
  _tickSnapshotCache.set(key, s);
  return s;
}

function rememberPos(p, key, x, z, hp) {
  if (!p._lastUpd) p._lastUpd = new Map();
  p._lastUpd.set(key, NP.sig(x, z, hp));
}

function forgetPos(p, key) {
  if (p._lastUpd) p._lastUpd.delete(key);
}

function syncAoiEnterMoveVec(p, enterList) {
  if (!enterList || !enterList.length || (p.yid && isSyntheticBot(p.yid))) return;
  const ws = wsByPid.get(p.pid);
  if (!ws || ws.readyState !== 1) return;
  for (let i = 0; i < enterList.length; i++) {
    const ek = enterList[i];
    if (ek.charCodeAt(0) === 112 /* 'p' */) {
      const targetP = players.get(fastIdFromKey(ek));
      if (targetP && targetP._moveVec) {
        const mv = targetP._moveVec;
        if (p.binaryProto) {
          sendBinary(ws, NPB.encodeMoveVecStart(ek, mv.startX, mv.startZ, mv.targetX, mv.targetZ, mv.speed, mv.walking ? 1 : 0, mv.timestamp));
        } else {
          sendJson(ws, { t: 'move_vec_start', k: ek, startX: mv.startX, startZ: mv.startZ, targetX: mv.targetX, targetZ: mv.targetZ, speed: mv.speed, walking: !!mv.walking, timestamp: mv.timestamp });
        }
      }
    }
  }
}

/** Отправка дельты AOI с гидратацией снапшотов сущностей (BUG-SRV-01). */
function sendAoiDelta(p, aoi) {
  if (!p || !aoi || (aoi.enter.length === 0 && aoi.leave.length === 0)) return;
  const isBot = p && p.yid && isSyntheticBot(p.yid);
  const enterSnaps = [];
  for (let i = 0; i < aoi.enter.length; i++) {
    const ek = aoi.enter[i];
    const s = isBot ? getBotTickSnapshot(ek) : getTickSnapshot(ek);
    if (!s) continue;
    enterSnaps.push(s);
    rememberPos(p, ek, s.x, s.z, s.hp);
  }
  send(p, { t: 'aoi', enter: enterSnaps, leave: aoi.leave });
  if (enterSnaps.length > 0 && !isBot) {
    sendNearbyLoot(p);
    syncAoiEnterMoveVec(p, aoi.enter);
  }
}

/** Дельта `upd`: не кладём сущность, если квантованные x/z/hp не изменились. */
function pushPosUpd(observer, upd, key, x, z, hp) {
  const prev = observer._lastUpd ? observer._lastUpd.get(key) : undefined;
  const d = NP.delta(prev, key, x, z, hp);
  if (!observer._lastUpd) observer._lastUpd = new Map();
  if (d.pack) {
    observer._lastUpd.set(key, d.sig);
    const p = d.pack;
    upd.push(_getUpdItem(p.k, p.x, p.z, p.hp));
    netStats.updSent++;
  } else {
    netStats.updSkip++;
  }
}

function checkRate(p, type) {
  if (!p || !p.rate) return true;
  const now = Date.now();
  const limit = RATE[type] || 10;
  let b = p.rate[type];
  if (!b) {
    b = { tokens: limit - 1, last: now };
    p.rate[type] = b;
    return true;
  }
  const elapsed = Math.max(0, (now - b.last) / 1000);
  if (elapsed > 0) {
    b.tokens = Math.min(limit, b.tokens + elapsed * limit);
    b.last = now;
  }
  if (!Number.isFinite(b.tokens)) b.tokens = limit;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// === MOVEMENT & POSITIONING SYSTEM (Domain Module) ===
const movementHandler = createMovementHandler({
  SPEED_MAX,
  MOVE_TOLERANCE,
  MOVE_BURST_SEC,
  MOVE_CORRECT_EPS,
  MOVE_CORRECT_MS,
  send,
  broadcastMoveVecStart,
  broadcastMoveVecStop,
  GEO,
  isSyntheticBot,
  isGM,
  checkRate,
  playerStunned,
  playerWeightState,
  cancelPlayerCast: (p, r) => cancelPlayerCast(p, r),
  closeStore: (p, r) => closeStore(p, r),
  entityTransforms,
  markProfileDirty,
  saveProfileNow: (p) => saveProfileNow(p),
  syncPlayerRegionSubscription: (p, o, n) => syncPlayerRegionSubscription(p, o, n),
  ensureNearbyMobs: (p) => ensureNearbyMobs(p),
  isPeaceAt: (x, z) => isPeaceAt(x, z),
  zoneLabelAt: (x, z) => zoneLabelAt(x, z),
  IS_CLUSTER,
  clusterIpc,
  ZS,
  TOTAL_WORKERS,
  CURRENT_WORKER_ID,
  initiateClusterHandoff: (p, w) => initiateClusterHandoff(p, w),
  getTickMsLast: () => (typeof tickMsLast === 'number' ? tickMsLast : 0),
  getElHistogram: () => elHistogram
});

const {
  doMove,
  doMoveStop,
  doPose,
  doEditorSetPos,
  handleMovementMessage
} = movementHandler;

function playerSpeedNow(p) {
  // Movement delegation: s *= p.gmSpeedMul in movementHandler.playerSpeedNow
  return movementHandler.playerSpeedNow(p);
}

function moveBudget(p, now) {
  return movementHandler.moveBudget(p, now);
}

function resetMoveBudget(p) {
  return movementHandler.resetMoveBudget(p);
}

function snapStandY(ent) {
  return movementHandler.snapStandY(ent);
}

function geoClamp(p, tx, tz) {
  return movementHandler.geoClamp(p, tx, tz);
}

function clampSpeed(p, nx, nz) {
  // Стресс-боты: не тратим ресурсы CPU на античит и синхронизируем высоту только при отсутствии Y
  if (p && p.yid && isSyntheticBot(p.yid)) {
    if (p.y == null || !Number.isFinite(p.y)) {
      snapStandY(p);
    }
    return { x: nx, z: nz };
  }
  return movementHandler.clampSpeed(p, nx, nz);
}

function geoStepMob(m, nx, nz) {
  if (!m) return;
  if (!GEO.ready()) {
    m.x = nx; m.z = nz;
    if (entityTransforms && m.transformSlot >= 0) entityTransforms.updatePos(m.transformSlot, m.x, m.y, m.z);
    return;
  }
  const g = GEO.moveAlong(m.x, m.z, nx, nz, m.y);
  m.x = g.x; m.z = g.z; m.y = g.y;
  if (entityTransforms && m.transformSlot >= 0) entityTransforms.updatePos(m.transformSlot, m.x, m.y, m.z);
}

function losGround(ax, az, bx, bz, ay, by) {
  if (!GEO.ready()) return true;
  return GEO.canSeeGround(ax, az, bx, bz, ay, by);
}

function notifyLos(p) {
  const now = Date.now();
  if (now - (p._losMsgAt || 0) < 900) return;
  p._losMsgAt = now;
  send(p, { t: 'msg', text: 'Цель не в зоне видимости.' });
}

// === PARTY SYSTEM (Domain Module) ===
const partyHandler = createPartyHandler({
  parties,
  players,
  send,
  sendPid,
  dist2,
  checkRate,
  CS,
  G,
  EXP,
  grantExpSp: (p, exp, mobLevel) => grantExpSp(p, exp, mobLevel),
  getNextId: () => nextId++,
  PARTY_INVITE_R2,
  PARTY_EXP_R2,
  clusterIpc,
  IS_CLUSTER,
  CURRENT_WORKER_ID,
  findPlayerByName: (name) => findPlayerByName(name)
});
const {
  partyOf,
  partyMembers,
  pushParty,
  splitExpToParty,
  handleIpcParty
} = partyHandler;
function levelExpReq(lvl) {
  return EXP.expToNext(lvl);
}
function checkServerLevelUp(p) {
  let leveled = false;
  while (p.level < EXP.MAX_LEVEL && p.exp >= levelExpReq(p.level) && levelExpReq(p.level) > 0) {
    p.exp -= levelExpReq(p.level);
    p.level++;
    p.applyClassStats();
    if (!p.dead && p.hp > 0) { p.hp = p.maxHp; p.energy = p.maxEnergy; }
    leveled = true;
  }
  if (leveled) {
    const next = CS.availableTransfers(p.cls, p.level);
    const pack = p.combatPack;
    send(p, {
      t: 'level_up',
      level: p.level,
      exp: p.exp,
      sp: p.sp || 0,
      expToNext: EXP.expToNext(p.level),
      maxHp: p.maxHp,
      maxEnergy: p.maxEnergy,
      cls: p.cls,
      className: CS.getClassName(p.cls),
      pAtk: pack.pAtk, pDef: pack.pDef, cAtk: pack.cAtk, cDef: pack.cDef,
      primary: pack.primary,
      canTransfer: next.length > 0,
      nextClasses: next.map(c => ({
        id: c.id, name: c.name, description: c.description, levelReq: c.levelReq, role: c.role, icon: c.icon
      }))
    });
    // Уровень — веха, которую нельзя терять до следующего автосейва (30 с).
    saveProfileNow(p);
    addClanReputation(p, CL.REP_PER_CHAR_LEVEL);
  }
}

/** Award EXP + SP (C1 tables), then level-up. */
function grantExpSp(p, expAmount, mobLevel) {
  expAmount = Math.max(0, Math.floor(+expAmount || 0));
  if (expAmount <= 0) return { exp: 0, sp: 0 };
  // NPC-бафф «Благословение Искры» даёт expMult — учитываем здесь, чтобы он
  // работал и в соло, и в пати (сплит зовёт grantExpSp для каждого).
  const em = expBuffMult(p);
  if (em !== 1) expAmount = Math.max(1, Math.floor(expAmount * em));
  const spGain = EXP.spFromKill(expAmount, p.level, mobLevel);
  p.exp += expAmount;
  p.sp = (p.sp || 0) + spGain;
  markProfileDirty(p); // MEDIUM-4: опыт без level-up тоже уходит в write-behind
  checkServerLevelUp(p);
  return { exp: expAmount, sp: spGain };
}

/** Суммарный множитель EXP от активных баффов (NPC-баффы, будущие свитки). */
function expBuffMult(p) {
  const buffs = p && p.buffs;
  if (!buffs || !buffs.length) return 1;
  const now = Date.now();
  let m = 1;
  for (let i = 0; i < buffs.length; i++) {
    const b = buffs[i];
    if (b && b.expMult > 0 && b.until > now) m *= b.expMult;
  }
  return m;
}

// === COMBAT & SKILLS SUBSYSTEM (Phase 5 Decomposition) ===
const buffManager = createBuffManager({
  send: (p, msg) => send(p, msg),
  broadcastAOI: (origin, msg) => broadcastAOI(origin, msg),
  invalidateCombatPack: (p) => invalidateCombatPack(p),
  cancelPlayerCast: (p, r) => cancelPlayerCast(p, r),
  pushCombatStats: (p) => pushCombatStats(p),
  playerCore
});

const combatResolver = createCombatResolver({
  mobs,
  players,
  borderGhosts,
  IS_CLUSTER,
  MOB_DB,
  MELEE_RANGE,
  RANGED_RANGE,
  dist2: (x1, z1, x2, z2) => dist2(x1, z1, x2, z2),
  losGround: (ax, az, bx, bz, ay, by) => losGround(ax, az, bx, bz, ay, by),
  notifyLos: (p) => notifyLos(p),
  send: (p, msg) => send(p, msg),
  broadcastAOI: (origin, msg) => broadcastAOI(origin, msg),
  consumeArmedShot: (p, kind) => consumeArmedShot(p, kind),
  onPlayerHit: (p, dmg) => onPlayerHit(p, dmg),
  onPlayerDeath: (p, opts) => onPlayerDeath(p, opts),
  onPvpLethal: (tgt, killer) => onPvpLethal(tgt, killer),
  onMobDeath: (p, m) => onMobDeath(p, m),
  recordMobDamage: (m, pid, dmg) => recordMobDamage(m, pid, dmg),
  addMobHate: (m, pid, hate, opts) => addMobHate(m, pid, hate, opts),
  hateFromHit: (m, dmg, opts) => hateFromHit(m, dmg, opts),
  mobDisplayNameServer: (id) => mobDisplayNameServer(id),
  isSyntheticBot: (yid) => isSyntheticBot(yid),
  pvpPeaceBlocked: (p, tgt) => pvpPeaceBlocked(p, tgt),
  maybeFlagPvp: (p, tgt) => maybeFlagPvp(p, tgt),
  isPlayerImmortal: (p) => isPlayerImmortal(p),
  playerStunned: (p, now) => playerStunned(p, now),
  playerWeightState: (p) => playerWeightState(p),
  checkRate: (p, type) => checkRate(p, type),
  cancelPlayerCast: (p, r) => cancelPlayerCast(p, r),
  entityTransforms
});

skillCaster = createSkillCaster({
  MAGIC_RANGE_DEFAULT,
  MAGIC_EFFECT_RANGE_DEFAULT,
  send: (p, msg) => send(p, msg),
  broadcastAOI: (origin, msg) => broadcastAOI(origin, msg),
  players,
  mobs,
  borderGhosts,
  IS_CLUSTER,
  spatialGrid,
  nativeSpatialGrid,
  entityTransforms,
  partyMembers: (p) => partyMembers(p),
  isGM: (p) => isGM(p),
  checkRate: (p, type) => checkRate(p, type),
  dist2: (x1, z1, x2, z2) => dist2(x1, z1, x2, z2),
  losGround: (ax, az, bx, bz, ay, by) => losGround(ax, az, bx, bz, ay, by),
  notifyLos: (p) => notifyLos(p),
  playerStunned: (p, now) => playerStunned(p, now),
  playerSilenced: (p, now) => playerSilenced(p, now),
  playerWeightState: (p) => playerWeightState(p),
  skillAllowedForClass: (p, cls) => skillAllowedForClass(p, cls),
  passiveBonuses: (p) => passiveBonuses(p),
  consumeArmedShot: (p, kind) => consumeArmedShot(p, kind),
  applyPlayerBuff: (p, buff, now) => applyPlayerBuff(p, buff, now),
  applyPlayerDebuff: (p, deb, now) => applyPlayerDebuff(p, deb, now),
  pushEffects: (p) => pushEffects(p),
  pushCombatStats: (p) => pushCombatStats(p),
  applyMobEffect: (m, eff, now) => applyMobEffect(m, eff, now),
  getMobEffects: (m, now) => getMobEffects(m, now),
  broadcastMobEffects: (m) => broadcastMobEffects(m),
  isPlayerImmortal: (p) => isPlayerImmortal(p),
  recordMobDamage: (m, pid, dmg) => recordMobDamage(m, pid, dmg),
  addMobHate: (m, pid, hate, opts) => addMobHate(m, pid, hate, opts),
  hateFromHit: (m, dmg, opts) => hateFromHit(m, dmg, opts),
  mobDisplayNameServer: (id) => mobDisplayNameServer(id),
  onMobDeath: (p, m) => onMobDeath(p, m),
  pvpPeaceBlocked: (p, tgt) => pvpPeaceBlocked(p, tgt),
  maybeFlagPvp: (p, tgt) => maybeFlagPvp(p, tgt),
  onPvpLethal: (tgt, killer) => onPvpLethal(tgt, killer),
  onPlayerDeath: (p, opts) => onPlayerDeath(p, opts),
  deathHandler: { resurrectPlayer: (tgt, p) => (deathHandler && deathHandler.resurrectPlayer(tgt, p)) },
  resetMoveBudget: (p) => resetMoveBudget(p),
  MOB_DB,
  DEBUG_EVENTS,
  isSyntheticBot: (yid) => isSyntheticBot(yid)
});

const combatHandler = createCombatHandler({
  combatResolver,
  skillCaster,
  checkRate: (p, type) => checkRate(p, type)
});

function doCastBegin(p, msg) {
  return skillCaster.doCastBegin(p, msg);
}

function doSkillCast(p, msg) {
  // GM skills & flash delegation: skillId === 'gm_flash'
  return skillCaster.doSkillCast(p, msg);
}

// Lethal feedback contract (security audit requirement):
// branch 1 (PVE AA): if (hit.lethalFeedback) { onPlayerHit(p, lethalDmg); onPlayerDeath(p, { byMob: true }); }
// branch 2 (Skill):  if (hit.lethalFeedback) { onPlayerHit(p, lethalDmg); onPlayerDeath(p, { byMob: true }); }
// Mob effects contract: broadcastMobEffects(m) and effects: getMobEffects(m, now) delegated to skill-caster & buff-manager

// === SKILL LEARNING & CLASS TRANSFER HANDLER ===
const skillLearnHandler = createSkillLearnHandler({
  SK,
  NPCS,
  CS,
  QD,
  ITEMS,
  send,
  broadcastAOI,
  saveProfileNow,
  pushCombatStats,
  npcForService: (...args) => npcServicesHandler.npcForService(...args),
  skillAllowedForClass,
  grantSkillFree,
  grantExpertiseSkills,
  safeDevices,
  syncDevicesToEquip,
  pushWeight, playerStunned, isPeaceAt
});

const {
  doLearnSkill,
  doDeviceUpgrade,
  doClassTransfer
} = skillLearnHandler;

// ============================================================
//  УСЛУГИ NPC — магазин, продажа, телепорт, баффы.
//  Раньше жили ТОЛЬКО в клиенте: npc-ui.js buyItem списывал валюту локально и
//  локально же добавлял предмет, а первая же серверная синхронизация инвентаря
//  (net-ws.js applyInv пересобирает сумку из серверного inv) стирала покупку.
//  Телепорт делал player.mesh.position.set — сервер об этом не знал и стягивал
//  игрока назад через clampSpeed.
//  Правила и каталоги — shared/npc-services.js (тот же источник у клиента).
// ============================================================

/** Медные детали (copper_parts) — островная валюта (в игре нет аден). */
const CURRENCY_ID = 'copper_parts';

function safeCount(val) {
  const n = Math.floor(Number(val));
  return (Number.isFinite(n) && n > 0) ? Math.min(n, Number.MAX_SAFE_INTEGER) : 0;
}

function currencyOf(p) { return (p.inv && safeCount(p.inv[CURRENCY_ID])) || 0; }

function takeCurrency(p, amount) {
  const n = Math.max(0, Math.floor(+amount) || 0);
  if (n <= 0) return true;
  if (currencyOf(p) < n) return false;
  p.inv[CURRENCY_ID] = currencyOf(p) - n;
  if (p.inv[CURRENCY_ID] <= 0) delete p.inv[CURRENCY_ID];
  return true;
}

const MAX_CURRENCY_CAP = 2147483647; // Канонический лимит адены L2 (Int32 max)

function giveCurrency(p, amount) {
  const n = Math.max(0, Math.floor(+amount) || 0);
  if (n <= 0) return;
  const cur = currencyOf(p);
  p.inv[CURRENCY_ID] = Math.min(MAX_CURRENCY_CAP, cur + n);
}

/** Удалить нулевые ключи карты счётчиков (иначе они уезжают в профиль и в UI). */
function pruneCounts(map) {
  if (!map) return;
  for (const k of Object.keys(map)) {
    if (!map[k] || map[k] <= 0) delete map[k];
  }
}
function pruneInv(p) { pruneCounts(p.inv); }

/** Сколько предмета в сумке (экип не считается — он вне inv). */
function invCount(p, itemId) {
  return (p.inv && Object.prototype.hasOwnProperty.call(p.inv, itemId)) ? safeCount(p.inv[itemId]) : 0;
}

// === NPC SERVICES HANDLER (SHOP, TELEPORT, BUFFS) ===
const npcServicesHandler = createNpcServicesHandler({
  NPCS,
  WM,
  send,
  broadcastAOI,
  currencyOf,
  takeCurrency,
  giveCurrency,
  invCount,
  pruneInv,
  canCarryMore,
  pushWeight,
  saveProfileNow,
  isBadKey,
  snapStandY,
  updatePlayerRegion,
  resetMoveBudget,
  ensureNearbyMobs,
  isPeaceAt,
  zoneLabelAt,
  applyPlayerBuff,
  pushEffects,
  pushCombatStats,
  ZS,
  IS_CLUSTER,
  TOTAL_WORKERS,
  CURRENT_WORKER_ID,
  initiateClusterHandoff: (p, w) => initiateClusterHandoff(p, w),
  cancelPlayerCast: (p, reason) => cancelPlayerCast(p, reason),
  questCollectChanged: (p, id) => questCollectChanged(p, id),
  entityTransforms
});

const { npcForService, doShopOpen, doShopBuy, doShopSell, doTeleportList, doTeleport, doBuffList, doBuffBuy } = npcServicesHandler;

// ============================================================
//  ПЕРСОНАЛЬНЫЙ СКЛАД (NPC type 'warehouse', сейчас warehouse_w7)
//  Единственный способ убрать вещь из сумки до этого — выбросить на землю.
//  Склад: своя ёмкость (NPCS.MAX_WH_SLOTS), плата за вклад (money sink) и свой
//  реестр заточки. Перенос идёт в одном тике, без await между проверкой и
//  записью: profileOf возвращает ССЫЛКИ на p.inv/p.wh, и любая асинхронность
//  между ними — это дюп.
// ============================================================
// === WAREHOUSE & TRADE HANDLERS ===
const {
  isWarehouseNpc,
  whPayload,
  whPlusMoveOk,
  whPlusMove,
  doWarehouseOpen,
  doWarehousePut,
  doWarehouseTake
} = createWarehouseHandler({
  send,
  isBadKey,
  invCount,
  currencyOf,
  takeCurrency,
  pruneInv,
  pruneCounts,
  canCarryMore,
  pushWeight,
  saveProfileNow,
  npcForService
});

const {
  tradeSide,
  tradePayload,
  sendTradeUpdate,
  closeTrade,
  tradePeer,
  tradeReady,
  tradeTouch,
  doTradeOffer,
  doTradeAccept,
  doTradeAdd,
  doTradeRemove,
  doTradeLock,
  doTradeConfirm,
  tradeMoveItems,
  tradeExecute
} = createTradeHandler({
  players,
  send,
  isBadKey,
  invCount,
  wouldExceedWeight,
  pruneInv,
  saveProfileNow, saveTransferAtomic,
  pushWeight,
  playerStunned: (p, now) => playerStunned(p, now)
});

// ============================================================
//  КАНАЛЫ ЧАТА
//  Раньше сервер знал ОДИН тип чата: любое сообщение уходило в broadcastAOI, а
//  в UI при этом было шесть вкладок — «Группа» и «Личное» не работали вовсе.
//  Каналы: all (AOI ~90 м), shout (весь регион), party (только группа),
//  tell (адресно по имени). Клан — после 2.5. system шлёт только сервер.
// ============================================================
const CHAT_MAX_LEN = 120;
const CHAT_CHANNELS = new Set(['all', 'shout', 'party', 'tell', 'clan', 'announce']);

const gmHandler = createGmHandler({
  send,
  sendPid,
  sendJson,
  broadcastAll,
  broadcastAOI,
  findPlayerByName: (name) => findPlayerByName(name),
  sanitizeCharName,
  snapStandY,
  updatePlayerRegion,
  resetMoveBudget,
  detachPlayer,
  wsByPid,
  saveProfileNow,
  cosmeticsPublic,
  itemLookup,
  mobs,
  Mob,
  entityTransforms,
  spatialGrid,
  nativeSpatialGrid,
  getNextId: () => nextId++,
  onMobDeath: (p, m) => onMobDeath(p, m),
  onPvpLethal: (victim, killer) => onPvpLethal(victim, killer),
  onPlayerDeath: (victim, opts) => onPlayerDeath(victim, opts),
  pushWeight,
  players,
  resurrectPlayer: (tgt, caster) => (deathHandler && deathHandler.resurrectPlayer ? deathHandler.resurrectPlayer(tgt, caster) : false),
  ZS,
  IS_CLUSTER,
  TOTAL_WORKERS,
  CURRENT_WORKER_ID,
  initiateClusterHandoff: (p, w) => initiateClusterHandoff(p, w),
  clusterIpc: {
    broadcastAnnounce: (txt) => { if (clusterIpc) clusterIpc.broadcastAnnounce(txt); },
    findPlayerByName: (name) => (clusterIpc ? clusterIpc.findPlayerByName(name) : null),
    sendGmAction: (payload, targetWorkerId) => { if (clusterIpc) clusterIpc.sendGmAction(payload, targetWorkerId); },
    broadcastGmSync: (evt) => { if (clusterIpc) clusterIpc.broadcastGmSync(evt); }
  }
});
const handleGmCommand = (p, rawText) => gmHandler.handleGmCommand(p, rawText);

// === DUELS & SOCIAL (CHAT, FRIENDS, REPORTS) ===
let sendClan;

const duelHandler = createDuelHandler({
  players,
  send,
  broadcastAOI,
  isPeaceAt,
  saveProfileNow,
  onPlayerDeathByPlayer: (victim, killer) => onPlayerDeathByPlayer(victim, killer),
  findPlayerByName: (name) => findPlayerByName(name),
  checkRate,
  pushEffects: (p) => pushEffects(p),
  pushCombatStats: (p) => pushCombatStats(p),
  cancelPlayerCast: (p, r) => cancelPlayerCast(p, r)
});

const {
  duelView,
  areDuelists,
  pvpPeaceBlocked,
  maybeFlagPvp,
  broadcastDuelFx,
  clearDuelInvitesOf,
  clearDuelState,
  interruptDuel,
  endDuel,
  finishDuel,
  tickDuels,
  onPvpLethal,
  registerDuelPlayer,
  doDuelOffer,
  doDuelAccept,
  doDuelDecline,
  doDuelCancel,
  handleDuelMessage
} = duelHandler;

const {
  findPlayerByName,
  doChat,
  doReport,
  friendIndex,
  friendsPayload,
  doFriendList,
  doFriendAdd,
  doFriendAccept,
  doFriendRemove,
  notifyFriends,
  handleIpcFriend
} = createSocialHandler({
  MAX_FRIENDS: playerCore.MAX_FRIENDS,
  players,
  pidByYid,
  send,
  sendPid,
  broadcastAOI,
  broadcastRegion,
  partyOf,
  sendClan: (c, pack) => { if (sendClan) sendClan(c, pack); },
  isGM,
  handleGmCommand: (p, text) => handleGmCommand(p, text),
  sanitizeCharName,
  saveProfileNow,
  isBadKey,
  TR,
  DB,
  CH,
  IS_CLUSTER,
  CURRENT_WORKER_ID,
  clusterIpc: {
    broadcastChat: (ch, name, txt, extra) => { if (clusterIpc) clusterIpc.broadcastChat(ch, name, txt, extra); },
    isPlayerOnline: (yid) => (clusterIpc ? clusterIpc.isPlayerOnline(yid) : false),
    getPlayer: (yid) => (clusterIpc ? clusterIpc.getPlayer(yid) : null),
    findPlayerByName: (name) => (clusterIpc ? clusterIpc.findPlayerByName(name) : null),
    sendFriendIpc: (payload, targetWorkerId) => { if (clusterIpc) clusterIpc.sendFriendIpc(payload, targetWorkerId); }
  },
  onTellCrossCluster: (p, to, text) => {
    if (clusterIpc) { clusterIpc.sendWhisper(p.name, to, text); send(p, { t: 'chat', ch: 'tell', name: p.name, to, text, out: true }); }
    else { send(p, { t: 'chat_fail', ch: 'tell', reason: 'offline', to }); }
  }
});

function kickYid(yid, code, why) {
  const pid = pidByYid.get(yid);
  if (pid == null) return false;
  const p = players.get(pid);
  if (p) send(p, { t: 'kicked', reason: why || 'banned' });
  const ws = wsByPid.get(pid);
  if (ws) { try { ws.close(code || 4012, why || 'banned'); } catch (_) { } }
  return true;
}

function adenaInWorld() {
  let n = 0;
  for (const [, p] of players) n += currencyOf(p);
  for (const [, L] of groundLoot) {
    if (L && L.itemId === CURRENCY_ID) n += L.count | 0;
  }
  return n;
}

let dbHealthCache = { ok: true, mode: DB.MODE || 'file', latencyMs: 0, lastChecked: 0 };
async function checkDbHealth() {
  if (typeof DB.healthCheck === 'function') {
    try {
      const res = await DB.healthCheck();
      dbHealthCache = {
        ok: !!res.ok,
        mode: res.mode || DB.MODE || 'file',
        latencyMs: res.latencyMs || 0,
        pool: res.pool || (typeof DB.getPoolStats === 'function' ? DB.getPoolStats() : undefined),
        lastChecked: Date.now()
      };
    } catch (e) {
      dbHealthCache = { ok: false, mode: DB.MODE || 'file', latencyMs: -1, error: e.message, lastChecked: Date.now() };
    }
  }
}
setInterval(checkDbHealth, 10000).unref();
checkDbHealth().catch(() => { });

function metricsPayload() {
  const now = Date.now();
  return {
    ok: MR.healthOk(now, lastTickAt),
    players: players.size,
    online: players.size,
    mobs: mobs.size,
    spots: spawnedSpots.size,
    tickMs: tickMsLast,
    tickMsEma: Math.round(tickMsEma * 100) / 100,
    tickMsMax: tickMsMax,
    tickHz: tickRateActual,
    tickOverruns: tickOverruns,
    tickBudgetDeferred: tickBudgetDeferred,
    eventLoopLagMs: elHistogram ? Math.round((elHistogram.mean / 1e6) * 100) / 100 : 0,
    eventLoopP95Ms: elHistogram ? Math.round((elHistogram.percentile(95) / 1e6) * 100) / 100 : 0,
    eventLoopMaxMs: elHistogram ? Math.round((elHistogram.max / 1e6) * 100) / 100 : 0,
    lastTickAt: lastTickAt,
    lagMs: now - lastTickAt,
    bytesIn: netStats.bytesIn,
    bytesOut: netStats.bytesOut,
    packetsIn: netStats.packetsIn,
    packetsOut: netStats.packetsOut,
    deflate: !!WS_DEFLATE,
    updSent: netStats.updSent,
    updSkip: netStats.updSkip,
    adena: adenaInWorld(),
    uptimeSec: Math.floor((now - SERVER_STARTED_AT) / 1000),
    startedAt: SERVER_STARTED_AT,
    dbMode: dbHealthCache.mode || DB.MODE || 'file',
    dbHealthy: dbHealthCache.ok,
    dbLatencyMs: dbHealthCache.latencyMs,
    dbPool: typeof DB.getPoolStats === 'function' ? DB.getPoolStats() : undefined
  };
}

// === CLANS & PRIVATE STORES ===
const clanHandler = createClanHandler({
  players,
  pidByYid,
  IS_CLUSTER,
  CURRENT_WORKER_ID,
  sendPid,
  clusterIpc: {
    isPlayerOnline: (yid) => (clusterIpc ? clusterIpc.isPlayerOnline(yid) : false),
    getPlayer: (yid) => (clusterIpc ? clusterIpc.getPlayer(yid) : null),
    findPlayerByName: (name) => (clusterIpc ? clusterIpc.findPlayerByName(name) : null),
    sendClanIpc: (payload, targetWorkerId) => { if (clusterIpc) clusterIpc.sendClanIpc(payload, targetWorkerId); }
  },
  send,
  broadcastAOI,
  currencyOf,
  takeCurrency,
  giveCurrency,
  saveProfileNow,
  sanitizeCharName,
  findPlayerByName,
  TR,
  npcForService,
  isWarehouseNpc,
  isBadKey,
  invCount,
  pruneInv,
  pruneCounts,
  canCarryMore,
  pushWeight, saveTransferAtomic
});
sendClan = clanHandler.sendClan;

const {
  clanTagOf,
  clanMemberOnline,
  clanOnline,
  bindClan,
  clanPayload,
  sendCrest,
  pushClan,
  broadcastClanTag,
  notifyClan,
  addClanReputation,
  failClan,
  clanLeaveOnCharDelete,
  doClanInfo,
  doClanCreate,
  doClanInvite,
  doClanAccept,
  dropMember,
  doClanLeave,
  doClanKick,
  doClanPromote,
  doClanLeader,
  doClanDisband,
  doClanLevelUp,
  doClanCrest,
  cwhPayload,
  doClanWhOpen,
  doClanWhPut,
  doClanWhTake,
  handleIpcClan
} = clanHandler;

// --- CLUSTER IPC & GATEWAY PROXY (Worker Side) ---
const { createGatewaySocketProxy } = require('./gateway-socket-proxy.js');
const GatewaySocketProxy = createGatewaySocketProxy({
  getIpc: () => clusterIpc,
  netStats,
  NPB,
  USE_NATIVE_BUFFER_IPC,
  getOutgoingBatch: () => outgoingIpcBatch,
  flushGatewayBatch: () => flushGatewayBatch(),
  scheduleBatchFlush: () => scheduleBatchFlush(),
  MSG_GATEWAY_CLOSE
});

const recentHandoffsByConnId = new Map();
const recentClosedConnIds = new Map();
const restoringConnIds = new Set();
const pendingHandoffRawByConnId = new Map();

function advanceNextIdForPid(pid) {
  const numPid = Number(pid);
  if (!Number.isFinite(numPid) || numPid < 1) return;
  const myMaxId = (CURRENT_WORKER_ID + 1) * 10000000;
  if (!IS_CLUSTER && numPid >= nextId) nextId = numPid + 1;
  else if (IS_CLUSTER && numPid >= nextId && numPid < myMaxId) nextId = numPid + 1;
}

function releaseSocketSession(ws, opts) {
  if (!ws) return;
  opts = opts || {};
  const connId = ws.connId;
  sessions.delete(ws);
  if (connId != null) proxySockets.delete(connId);
  ws.pid = null;
  if (opts.sendGatewayClose) {
    if (connId != null) {
      recentClosedConnIds.set(connId, Date.now());
      if (recentClosedConnIds.size > 500) {
        const cutoff = Date.now() - 10000;
        for (const [cId, ts] of recentClosedConnIds) {
          if (ts < cutoff) recentClosedConnIds.delete(cId);
        }
      }
    }
    try { ws.close(opts.closeCode || 4001, opts.closeReason || ''); } catch (_) {}
  } else {
    ws._handedOff = true;
    ws.readyState = 3;
  }
}

function isLoginRawPacket(data, isBinary) {
  if (isBinary || Buffer.isBuffer(data)) return false;
  if (typeof data !== 'string') return false;
  if (data.length > 8192) return false;
  return data.includes('"login"');
}

function enqueuePendingRaw(connId, frame) {
  if (connId == null) return;
  const now = Date.now();
  let q = pendingHandoffRawByConnId.get(connId);
  if (!q) {
    if (pendingHandoffRawByConnId.size > 500) {
      for (const [cid, list] of pendingHandoffRawByConnId) {
        if (!list.length || now - list[list.length - 1].at > 2500) pendingHandoffRawByConnId.delete(cid);
      }
    }
    q = [];
    pendingHandoffRawByConnId.set(connId, q);
  }
  if (q.length < 32) {
    q.push({ data: frame.data, isBinary: !!frame.isBinary, clientIp: frame.clientIp || '', at: now });
  }
}

function drainPendingRaw(connId, proxy) {
  if (connId == null || !proxy) return;
  const q = pendingHandoffRawByConnId.get(connId);
  if (!q || !q.length) return;
  pendingHandoffRawByConnId.delete(connId);
  const now = Date.now();
  for (let i = 0; i < q.length; i++) {
    const f = q[i];
    if (now - f.at > 2500) continue;
    if (f.clientIp && !proxy.clientIp) proxy.clientIp = f.clientIp;
    const buf = f.isBinary && !Buffer.isBuffer(f.data) ? Buffer.from(f.data) : f.data;
    proxy.emit('message', buf);
  }
}

function initiateClusterHandoff(p, targetWorkerId, opts) {
  if (!p || p._handoffInProgress) return;
  opts = opts || {};
  // Целевой воркер недавно был недоступен (handoff вернулся): не долбим его каждый тик.
  if (!opts.isInitialLogin && p._handoffRetryAt && Date.now() < p._handoffRetryAt) return;
  p._handoffInProgress = true;

  if (p._combatLogoutTimer) {
    clearTimeout(p._combatLogoutTimer);
    p._combatLogoutTimer = null;
  }

  const ws = wsByPid.get(p.pid);
  const connId = ws ? ws.connId : null;
  const clientIp = (ws && ws.clientIp) || p.clientIp || '';

  // HIGH-1: сейв ДО передачи, затем копия помечается переданной — этот воркер больше не запишет
  // устаревший снимок поверх сохранений получателя (был дюп). Снимок получателю — с ревизией выше.
  saveProfileNow(p);
  const dirtyKey = p._profileKey || (p.yid + ':' + (p.charId || 'c0'));
  if (_dirtyProfiles.get(dirtyKey) === p) _dirtyProfiles.delete(dirtyKey);
  p._handedOff = true;

  const pr = profileOf(p);
  const playerData = Object.assign({}, pr, {
    pid: p.pid,
    yid: p.yid,
    connId: connId,
    clientIp: clientIp,
    buffs: (p.buffs || []).slice(),
    debuffs: (p.debuffs || []).slice(),
    cd: Object.assign({}, p.cd || {}),
    binaryProto: !!p.binaryProto,
    partyId: p.partyId || null,
    dev: !!p.dev,
    flagUntil: p.flagUntil || 0,
    lastCombatAt: p._lastCombatAt || 0,
    lastPvpHitAt: p._lastPvpHitAt || 0,
    gmSpeedMul: p.gmSpeedMul || 1,
    flashSpeed: !!p.flashSpeed,
    invul: !!p.invul,
    nonGm: !!p.nonGm,
    seq: p.seq || 0,
    _seqInit: !!p._seqInit,
    isInitialLogin: !!opts.isInitialLogin,
    isDevSession: !!opts.isDevSession,
    guestToken: opts.guestToken || undefined
  });

  if (p.casting) p.casting = null;
  p.moving = false;
  closeTrade(p, 'peer_gone');
  interruptDuel(p, 'zone_change');
  if (p.store) {
    p.store = null;
    broadcastStoreState(p);
  }

  if (!opts.isInitialLogin) {
    broadcastAOI(p, { t: 'aoi', enter: [], leave: ['p' + p.pid] });
    if (p.known && p.known.size > 0) {
      send(p, { t: 'aoi', enter: [], leave: Array.from(p.known) });
    }
  }
  if (p.knownBy) {
    for (const obsPid of p.knownBy) {
      const o = players.get(obsPid);
      if (o && o.known) o.known.delete('p' + p.pid);
      if (o && o._lastUpd) o._lastUpd.delete('p' + p.pid);
    }
    p.knownBy.clear();
  }
  if (p.known) p.known.clear();

  if (entityTransforms && p.transformSlot >= 0) {
    entityTransforms.free(p.transformSlot);
    p.transformSlot = -1;
  }
  players.delete(p.pid);
  wsByPid.delete(p.pid);
  if (pidByYid.get(p.yid) === p.pid) pidByYid.delete(p.yid);
  if (connId != null) {
    recentHandoffsByConnId.set(connId, { targetWorkerId, at: Date.now() });
    if (recentHandoffsByConnId.size > 1000) {
      const now = Date.now();
      for (const [cid, rec] of recentHandoffsByConnId) {
        if (!rec || now - rec.at > 10000) recentHandoffsByConnId.delete(cid);
      }
    }
  }
  if (ws) {
    releaseSocketSession(ws, { sendGatewayClose: false });
  } else if (connId != null) {
    proxySockets.delete(connId);
  }

  clusterIpc.handoffPlayer(targetWorkerId, {
    connId: connId,
    pid: p.pid,
    targetWorkerId: targetWorkerId,
    playerData: playerData
  });
}

function adoptClusterHandoff(payload) {
  if (!payload || !payload.playerData) return;
  const data = payload.playerData;
  const connId = payload.connId || data.connId;
  const pid = data.pid;
  const yid = data.yid;

  advanceNextIdForPid(pid);
  if (connId != null) {
    recentHandoffsByConnId.delete(connId);
    recentClosedConnIds.delete(connId);
    restoringConnIds.delete(connId);
  }

  let proxy = null;
  if (connId != null) {
    proxy = proxySockets.get(connId);
    if (!proxy) {
      proxy = new GatewaySocketProxy(connId, data.clientIp);
      proxy.pid = pid;
      proxy.isAuthed = true;
      proxySockets.set(connId, proxy);
      setupSocketConnection(proxy, true);
    } else {
      if (data.clientIp && !proxy.clientIp) proxy.clientIp = data.clientIp;
      proxy.pid = pid;
      proxy.isAuthed = true;
      if (typeof proxy.setAuthed === 'function') {
        proxy.setAuthed(true);
      }
    }
  }

  const p = new Player(pid, yid, data, {
    dev: SEC.insecureDev() && !!data.dev,
    charId: data.charId,
    clientIp: data.clientIp || (proxy && proxy.clientIp) || ''
  });
  p.clientIp = data.clientIp || (proxy && proxy.clientIp) || '';
  p.binaryProto = !!data.binaryProto;
  p.partyId = data.partyId || null;
  if (data.gmSpeedMul != null) p.gmSpeedMul = data.gmSpeedMul;
  if (data.flashSpeed != null) p.flashSpeed = !!data.flashSpeed;
  if (data.invul != null) p.invul = !!data.invul;
  if (data.nonGm != null) p.nonGm = !!data.nonGm;
  if (data._seqInit) {
    p._seqInit = true;
    p.seq = data.seq | 0;
  }
  if (data.hp != null) p.hp = data.hp;
  if (data.energy != null) p.energy = data.energy;
  if (data.flagUntil != null) p.flagUntil = Math.max(0, +data.flagUntil || 0);
  if (data.lastCombatAt != null) p._lastCombatAt = Math.max(0, +data.lastCombatAt || 0);
  if (data.lastPvpHitAt != null) p._lastPvpHitAt = Math.max(0, +data.lastPvpHitAt || 0);
  if (p.isFlagged) {
    send(p, { t: 'flag', flagged: true, karma: p.karma });
  }
  if (data.buffs) p.buffs = data.buffs.slice();
  if (data.debuffs) p.debuffs = data.debuffs.slice();
  if (data.cd && typeof data.cd === 'object') {
    p.cd = Object.assign({}, data.cd);
  }
  if (payload.bounced) p._handoffRetryAt = Date.now() + 5000; // зона была недоступна: повтор перехода через 5 с

  if (entityTransforms && p.transformSlot < 0) {
    p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
  }
  players.set(p.pid, p);
  if (proxy) wsByPid.set(p.pid, proxy);
  pidByYid.set(yid, p.pid);

  if (IS_CLUSTER && clusterIpc) {
    clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
  }

  if (data.isInitialLogin && sessionManager && typeof sessionManager.completePostLogin === 'function') {
    sessionManager.completePostLogin(p, proxy, {
      isDevSession: !!data.isDevSession,
      guestToken: data.guestToken
    });
  } else {
    snapStandY(p);
    p.applyClassStats();
    resetMoveBudget(p);
    ensureNearbyMobs(p);
    sendNearbyLoot(p);
    if (p.partyId) {
      const pa = partyOf(p);
      if (pa) pushParty(pa);
    }
    if (isGM(p) && EditorGuard && !p.editorKey) {
      const ek = EditorGuard.issue(p);
      if (ek && clusterIpc && typeof clusterIpc.syncEditorKey === 'function') {
        clusterIpc.syncEditorKey('issue', { token: ek, yid: p.yid, pid: p.pid });
      }
    }
  }

  const r = (WM.regionAt(p.x, p.z) || {});
  const peace = isPeaceAt(p.x, p.z);
  const zoneLabel = zoneLabelAt(p.x, p.z);
  send(p, { t: 'region', region: r.id || p.region, peace: peace, zoneName: zoneLabel });
  send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });

  p._aoiDirty = true;
  const aoi = recomputeAOI(p);
  sendAoiDelta(p, aoi);
  if (connId != null && proxy) drainPendingRaw(connId, proxy);
}

if (IS_CLUSTER && clusterIpc) {
  // Приём ретранслированных сообщений из других воркеров
  clusterIpc.on('chat', (payload) => {
    if (!payload) return;
    const { channel, senderName, text, extra } = payload;
    if (channel === 'announce') {
      broadcastAll({ t: 'chat', ch: 'announce', name: senderName || '[Анонс]', text: text });
    } else if (channel === 'shout') {
      if (extra && extra.region) {
        broadcastRegion(extra.region, { t: 'chat', ch: 'shout', name: senderName, text: text });
      } else {
        broadcastAll({ t: 'chat', ch: 'shout', name: senderName, text: text });
      }
    } else if (channel === 'clan') {
      if (extra && extra.clanId && Clans) {
        const clan = Clans.get(extra.clanId);
        if (clan && sendClan) {
          sendClan(clan, { t: 'chat', ch: 'clan', name: senderName, text: text });
        }
      }
    } else if (channel === 'all') {
      broadcastAll({ t: 'chat', ch: 'all', name: senderName, text: text });
    }
  });

  // Приём системных и GM анонсов
  clusterIpc.on('announce', (payload) => {
    if (!payload) return;
    const annText = typeof payload === 'string' ? payload : (payload.text || '');
    broadcastAll({ t: 'announce', text: '[АДМИНИСТРАЦИЯ]: ' + annText, kind: 'gm' });
    broadcastAll({ t: 'chat', ch: 'announce', name: '[Анонс]', text: annText });
  });

  // Межворкерный личный чат (Whisper / Tell)
  clusterIpc.on('whisper', (payload) => {
    if (!payload || !payload.targetName) return;
    const tgt = findPlayerByName(payload.targetName);
    if (tgt) {
      send(tgt, { t: 'chat', ch: 'tell', name: payload.senderName, to: tgt.name, text: payload.text });
    }
  });

  // Межворкерная синхронизация групп (Party)
  clusterIpc.on('party', (payload) => {
    if (partyHandler && typeof partyHandler.handleIpcParty === 'function') {
      partyHandler.handleIpcParty(payload);
    }
  });

  // Межворкерная синхронизация друзей (Friend)
  clusterIpc.on('friend', (payload) => {
    if (handleIpcFriend) handleIpcFriend(payload);
  });

  // Межворкерные операции кланов (/clan_invite, статус соклановцев)
  clusterIpc.on('clan_op', (payload) => {
    if (handleIpcClan) handleIpcClan(payload);
  });

  // Синхронизация мирового времени (set_time / set_time_pause / рестарт воркера)
  clusterIpc.on('world_time_sync', (payload) => {
    if (worldTimeHandler && typeof worldTimeHandler.applyExternalTime === 'function') {
      worldTimeHandler.applyExternalTime(payload);
    }
  });

  // Межворкерные GM-команды (//kick, //ban, //goto, //recall, detach)
  clusterIpc.on('gm_action', async (payload) => {
    if (payload && payload.action === 'detach_pid') {
      try {
        let detPid = payload.pid;
        // C-02: pid из каталога Master может устареть — ищем по yid локальную сессию
        if ((detPid == null || !players.has(detPid)) && payload.yid) {
          const byYid = pidByYid.get(String(payload.yid));
          if (byYid != null) detPid = byYid;
        }
        if (detPid != null) await detachPlayer(detPid);
      } catch (_) {
      } finally {
        if (payload.ackId) {
          clusterIpc.sendToPrimary(MSG_DETACH_ACK, {
            ackId: payload.ackId,
            workerId: CURRENT_WORKER_ID,
            pid: payload.pid
          });
        }
      }
      return;
    }
    if (gmHandler && typeof gmHandler.handleIpcGmAction === 'function') {
      gmHandler.handleIpcGmAction(payload);
    }
  });

  // Синхронизация пересборки спотов редактора
  clusterIpc.on('spots_rebuild', () => {
    try {
      rebuildServerSpots();
      if (NPCS && typeof NPCS.rebuild === 'function') NPCS.rebuild();
    } catch (_) {}
  });

  // Приграничные призраки (Border Seam replication)
  clusterIpc.on('border_ghosts', (payload) => {
    if (!payload || !Array.isArray(payload.ghosts)) return;
    const now = Date.now();
    for (const g of payload.ghosts) {
      if (!g || !g.pid || players.has(g.pid)) continue;
      g.updatedAt = now;
      borderGhosts.set(g.pid, g);
    }
  });

  // Входящий Handoff игрока из другой зоны
  clusterIpc.on('handoff', (payload) => {
    adoptClusterHandoff(payload);
  });

  // Входящие сетевые фреймы от Master Gateway
  clusterIpc.on('client_raw', ({ connId, data, isBinary, clientIp, isStressAllowed, stressKey }) => {
    let proxy = proxySockets.get(connId);
    if (!proxy) {
      const ho = recentHandoffsByConnId.get(connId);
      if (ho && (Date.now() - ho.at < 10000)) {
        if (ho.targetWorkerId && ho.targetWorkerId !== CURRENT_WORKER_ID) {
          clusterIpc.sendToPrimary(MSG_CLIENT_RAW, {
            connId: connId,
            data: data,
            isBinary: !!isBinary,
            clientIp: clientIp || '',
            ...(isStressAllowed ? { isStressAllowed: true, stressKey: stressKey || '' } : {})
          }, ho.targetWorkerId);
        }
        return;
      }
      const closedAt = recentClosedConnIds.get(connId);
      if (closedAt && (Date.now() - closedAt < 5000)) {
        return;
      }
      if (restoringConnIds.has(connId) || (CURRENT_WORKER_ID !== 1 && !isLoginRawPacket(data, isBinary))) {
        enqueuePendingRaw(connId, { data, isBinary: !!isBinary, clientIp: clientIp || '' });
        return;
      }
      proxy = new GatewaySocketProxy(connId, clientIp);
      if (isStressAllowed) {
        proxy.isStressAllowed = true;
        proxy.stressKey = stressKey || '';
      }
      proxySockets.set(connId, proxy);
      setupSocketConnection(proxy);
    } else {
      if (clientIp && !proxy.clientIp) proxy.clientIp = clientIp;
      if (isStressAllowed && !proxy.isStressAllowed) {
        proxy.isStressAllowed = true;
        proxy.stressKey = stressKey || '';
      }
    }
    const buf = isBinary && !Buffer.isBuffer(data) ? Buffer.from(data) : data;
    proxy.emit('message', buf);
  });

  // Отключение клиента от Master Gateway
  clusterIpc.on('client_disconnect', ({ connId, pid }) => {
    let resolvedPid = pid;
    if (connId != null) {
      restoringConnIds.delete(connId);
      pendingHandoffRawByConnId.delete(connId);
    }
    const proxy = proxySockets.get(connId);
    if (proxy) {
      if (proxy.pid != null) resolvedPid = proxy.pid;
      sessions.delete(proxy);
      proxySockets.delete(connId);
      proxy.emit('close');
    } else if (resolvedPid != null) {
      handleSocketClose({ pid: resolvedPid }, sessions).catch(() => { });
    }
    if (resolvedPid != null) {
      const p = players.get(resolvedPid);
      if (p && !p._combatLogoutTimer) {
        detachPlayer(resolvedPid).catch(() => { });
      }
    }
  });

  clusterIpc.on('gateway_close', ({ connId }) => {
    if (connId != null) {
      const proxy = proxySockets.get(connId);
      if (proxy) {
        sessions.delete(proxy);
        proxySockets.delete(connId);
        proxy.emit('close');
        if (proxy.pid != null) disconnectManager.handlePlayerDisconnect(proxy.pid).catch(() => { });
      }
    }
  });

  // Восстановление сессий игроков после аварийного перезапуска воркера
  clusterIpc.on('session_restore', async (payload) => {
    if (!payload || !Array.isArray(payload.sessions)) return;
    for (const s of payload.sessions) {
      if (!s || s.connId == null || !s.yid) continue;
      restoringConnIds.add(s.connId);
    }
    for (const s of payload.sessions) {
      if (!s || s.connId == null || !s.yid) continue;
      const { connId, yid, charId, pid } = s;
      // Барьер против гонки с новым входом того же аккаунта: иначе два Player на один профиль (дюп)
      if (pidByYid.has(yid) || loggingIn.has(yid)) {
        restoringConnIds.delete(connId);
        clusterIpc.sendToPrimary(MSG_GATEWAY_CLOSE, { connId, code: 4008, reason: 'session replaced' });
        continue;
      }
      loggingIn.add(yid);
      try {
        let pr = null;
        try {
          pr = await DB.load(yid, charId);
        } catch (e) {
          console.error('[session_restore] DB.load failed:', yid, charId, e && e.message);
        }
        if (!pr) {
          clusterIpc.sendToPrimary(MSG_GATEWAY_CLOSE, { connId, code: 1012, reason: 'session restore failed' });
          continue;
        }

        advanceNextIdForPid(pid);
        recentHandoffsByConnId.delete(connId);
        recentClosedConnIds.delete(connId);

        let proxy = proxySockets.get(connId);
        if (!proxy) {
          proxy = new GatewaySocketProxy(connId, s.clientIp || '');
          proxy.pid = pid;
          proxy.isAuthed = true;
          proxySockets.set(connId, proxy);
          setupSocketConnection(proxy, true);
        } else {
          if (s.clientIp && !proxy.clientIp) proxy.clientIp = s.clientIp;
          proxy.pid = pid;
          proxy.isAuthed = true;
          if (typeof proxy.setAuthed === 'function') proxy.setAuthed(true);
        }

        const p = new Player(pid, yid, pr, { charId: pr.charId || charId });
        p.charId = pr.charId || charId;
        if (s.binaryProto) p.binaryProto = true;
        if (entityTransforms && p.transformSlot < 0) {
          p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
        }
        players.set(p.pid, p);
        wsByPid.set(p.pid, proxy);
        pidByYid.set(yid, p.pid);

        if (IS_CLUSTER && clusterIpc) {
          clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
        }

        // Полная синхронизация как при реконнекте (откат к сохранению, клан/друзья); welcome не перегружает мир
        sessionManager.completePostLogin(p, proxy, { pr });

        const r = (WM.regionAt(p.x, p.z) || {});
        const peace = isPeaceAt(p.x, p.z);
        const zoneLabel = zoneLabelAt(p.x, p.z);
        send(p, { t: 'region', region: r.id || p.region, peace: peace, zoneName: zoneLabel });
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });

        p._aoiDirty = true;
        const aoi = recomputeAOI(p);
        sendAoiDelta(p, aoi);
        drainPendingRaw(connId, proxy);
        console.log(`[session_restore] ✅ Сессия восстановлена без дисконнекта: ${p.name} (PID: ${p.pid}, connId: ${connId})`);
      } catch (err) {
        console.error('[session_restore] Error restoring session:', err && err.message);
      } finally {
        restoringConnIds.delete(connId);
        loggingIn.delete(yid);
      }
    }
  });

  // Синхронизация реестра персонажей (PlayerDb) и кланов между ядрами кластера
  if (PlayerDb && typeof PlayerDb.setIpcHub === 'function') {
    PlayerDb.setIpcHub(clusterIpc);
  }
  // Синхронизация состояния кланов и CWH между ядрами кластера (SYNC-CLN-01)
  Clans.setSyncBroadcaster((action, snap) => clusterIpc.broadcastClanSync(action, snap));
  clusterIpc.on('clan_sync', (payload) => {
    if (!payload || !payload.clan) return;
    const { action, clan } = payload;
    const updated = Clans.applySync(action, clan, { persistOnOwner: true });
    if (action === 'remove' && clan && clan.id) {
      for (const [, pl] of players) {
        if (!pl) continue;
        if (pl.clanId === clan.id || (pl.clanId && !Clans.ofPlayer(pl))) {
          bindClan(pl, null);
          send(pl, { t: 'clan', clan: null });
          send(pl, { t: 'clan_ok', op: 'disband' });
          broadcastClanTag(pl);
        }
      }
    } else if (updated) {
      const sendCrestToo = (action !== 'rep_delta' && action !== 'wh_sync');
      for (const [, pl] of players) {
        if (!pl) continue;
        if (pl.yid && Clans.memberOf(updated, pl.yid, pl.charId)) {
          const wasInThisClan = (pl.clanId === updated.id);
          bindClan(pl, updated);
          send(pl, clanPayload(updated));
          if (sendCrestToo) sendCrest(pl, updated);
          if (!wasInThisClan) broadcastClanTag(pl);
        } else if (pl.clanId === updated.id) {
          bindClan(pl, null);
          send(pl, { t: 'clan', clan: null });
          broadcastClanTag(pl);
        }
      }
    }
  });

  // Синхронизация общего онлайна кластера
  clusterIpc.on('cluster_online', (payload) => {
    if (payload && payload.online != null) {
      clusterTotalOnline = payload.online;
    }
  });

  // Синхронизация санкций модерации (баны/муты/IP-санкции)
  clusterIpc.on('mod_sync', (payload) => {
    if (!payload || !payload.action) return;
    Mod.applySync(payload.action, payload.target, payload.payload);
    // При бане игрока или IP — мгновенно отключаем нарушителя на этом воркере
    if (payload.action === 'ban' || payload.action === 'banIp' || payload.action === 'ban_ip') {
      for (const [, pl] of players) {
        if (!pl) continue;
        const targetStr = String(payload.target || '').toLowerCase();
        const hitBan = (payload.action === 'ban' && (pl.yid === payload.target || (pl.name && pl.name.toLowerCase() === targetStr)));
        const hitBanIp = ((payload.action === 'banIp' || payload.action === 'ban_ip') && pl.clientIp === payload.target);
        if (hitBan || hitBanIp) {
          send(pl, { t: 'banned', reason: (payload.payload && payload.payload.reason) ? payload.payload.reason : 'Banned by admin' });
          const ws = wsByPid.get(pl.pid);
          if (ws) {
            try { ws.close(4003, 'banned'); } catch (_) { }
          }
        }
      }
    }
  });

  // Синхронизация прав GM/администратора
  clusterIpc.on('gm_sync', (payload) => {
    // MEDIUM-2: только по yid владельца — совпадение имени не даёт и не снимает права.
    if (!payload || !payload.yid) return;
    const targetYidLower = String(payload.yid).toLowerCase();
    const lvl = Number(payload.accessLevel) || 0;
    for (const [, pl] of players) {
      if (!pl) continue;
      if (pl.yid && String(pl.yid).toLowerCase() === targetYidLower) {
        if (gmHandler && typeof gmHandler.applyLiveGmState === 'function') {
          gmHandler.applyLiveGmState(pl, lvl);
        } else {
          pl.accessLevel = lvl;
          pl.gm = (lvl >= 50);
          send(pl, { t: 'gm_update', gm: pl.gm, accessLevel: pl.accessLevel });
        }
        send(pl, { t: 'msg', text: pl.gm ? '⚙️ Права администратора (GM) обновлены.' : 'Права администратора сняты.' });
      }
    }
  });

  // Удаление персонажа на шлюзе кластера: кикаем без перезаписи удалённого профиля в БД (CRIT-04)
  clusterIpc.on('char_delete_kick', (payload) => {
    try {
      if (!payload || !payload.yid) return;
      const targetYid = String(payload.yid);
      const targetCharId = payload.charId ? CH.normalizeCharId(payload.charId) : null;
      for (const [dKey, dp] of _dirtyProfiles) {
        if (dp && dp.yid === targetYid && (!targetCharId || CH.normalizeCharId(dp.charId) === targetCharId)) {
          _dirtyProfiles.delete(dKey);
        }
      }
      const pid = pidByYid.get(targetYid);
      const pl = pid != null ? players.get(pid) : null;
      if (pl && (!targetCharId || CH.normalizeCharId(pl.charId) === targetCharId)) {
        if (pl._combatLogoutTimer) {
          clearTimeout(pl._combatLogoutTimer);
          pl._combatLogoutTimer = null;
        }
        send(pl, { t: 'kicked', reason: 'char_deleted' });
        const ws = wsByPid.get(pid);
        if (entityTransforms && pl.transformSlot >= 0) {
          entityTransforms.free(pl.transformSlot);
          pl.transformSlot = -1;
        }
        players.delete(pid);
        wsByPid.delete(pid);
        if (pidByYid.get(targetYid) === pid) pidByYid.delete(targetYid);
        if (EditorGuard && typeof EditorGuard.revokePid === 'function') {
          try { EditorGuard.revokePid(pid); } catch (_) {}
        }
        if (ws) {
          releaseSocketSession(ws, { sendGatewayClose: true, closeCode: 4011, closeReason: 'char deleted' });
        }
        clusterIpc.updatePlayerDirectory(targetYid, pid, pl.name, false, CURRENT_WORKER_ID, pl.charId);
      } else if (targetYid) {
        // На случай полу-авторизованного/зависшего прокси без записи в players
        for (const [sock] of sessions) {
          if (sock && String(sock.yid) === targetYid && (!targetCharId || CH.normalizeCharId(sock.charId) === targetCharId)) {
            releaseSocketSession(sock, { sendGatewayClose: true, closeCode: 4011, closeReason: 'char deleted' });
          }
        }
      }
    } finally {
      if (payload && payload.ackId) {
        clusterIpc.sendToPrimary(MSG_CHAR_DELETE_ACK, {
          ackId: payload.ackId,
          workerId: CURRENT_WORKER_ID
        });
      }
    }
  });


  // Сторожевой таймер: отправка сердечного ритма (Heartbeat) в Primary раз в 3 секунды
  setInterval(() => {
    try {
      clusterIpc.sendToPrimary('IPC_HEARTBEAT', {
        workerId: CURRENT_WORKER_ID,
        timestamp: Date.now(),
        tickMs: tickMsLast,
        lagMs: elHistogram ? Math.round((elHistogram.mean / 1e6) * 100) / 100 : 0
      });
    } catch (_) { }
  }, 3000).unref();

  // Периодическая отправка метрик в Primary раз в 5 секунд
  setInterval(() => {
    try {
      clusterIpc.sendMetrics({
        players: players.size,
        mobs: mobs.size,
        tickMs: tickMsLast,
        tickHz: tickRateActual,
        tickOverruns: tickOverruns,
        bytesOut: netStats.bytesOut,
        packetsOut: netStats.packetsOut,
        worldTime: worldTimePayload()
      });
    } catch (_) { }
  }, 5000).unref();
}

const {
  storePublic,
  storePayload,
  broadcastStoreState,
  closeStore,
  doStoreSet,
  doStoreList,
  doStoreDeal
} = createStoreHandler({
  players,
  send,
  broadcastAOI,
  currencyOf,
  takeCurrency,
  giveCurrency,
  invCount,
  isBadKey,
  canCarryMore,
  pruneInv,
  saveProfileNow, saveTransferAtomic,
  pushWeight,
  playerStunned: (p, now) => playerStunned(p, now)
});

// === DEATH & PENALTY HANDLER (L2 C1) ===
// Delegated logic in handlers/death-handler.js & handlers/player-regen-handler.js:
// - death penalty item loss: DR.rollDeathDrops(p, { byMob, byPlayer, itemMeta })
// - clears buffs & debuffs on death: p.buffs = BR.clearDeath(p.buffs); p.debuffs = BR.clearDeath(p.debuffs);
// - DoTs ticking on players: BR.dots(p.debuffs, now)
const deathHandler = createDeathHandler({
  WM,
  NPCS,
  itemLookup,
  equippedCount,
  spawnGroundLoot,
  pushCombatStats,
  pushWeight,
  L2,
  EXP,
  levelExpReq,
  ITEMS,
  CS,
  passiveBonuses,
  DR,
  SK,
  isPeaceAt,
  BR,
  pushEffects,
  closeTrade,
  closeStore,
  interruptDuel,
  Mod,
  saveProfileNow,
  send,
  broadcastAOI,
  snapStandY,
  updatePlayerRegion,
  resetMoveBudget,
  ensureNearbyMobs,
  cancelPlayerCast,
  checkRate,
  entityTransforms,
  isSyntheticBot,
  ZS,
  IS_CLUSTER,
  TOTAL_WORKERS,
  CURRENT_WORKER_ID,
  initiateClusterHandoff: (p, w) => initiateClusterHandoff(p, w)
});

const {
  getSpawnPoint,
  deathItemMeta,
  applyDeathItemLoss,
  applyDeathPenalty,
  deathSelfPayload,
  beginPlayerDeath,
  revivePlayerToVillage,
  resurrectPlayer,
  onPlayerDeath,
  onPlayerDeathByPlayer,
  handleReviveMessage
} = deathHandler;

// === PLAYER REGENERATION & DOTS HANDLER ===
const playerRegenHandler = createPlayerRegenHandler({
  BR,
  isPlayerImmortal,
  onPlayerHit,
  onPlayerDeath,
  onPvpLethal,
  onPlayerDeathByPlayer,
  isPeaceAt,
  players,
  send,
  broadcastAOI,
  cosmeticsPublic,
  saveProfileNow,
  playerWeightState,
  passiveBonuses,
  L2,
  isNight: () => worldTimeHandler.isNight(),
  invalidateCombatPack,
  pushEffects,
  pushCombatStats,
  entityTransforms
});

const {
  tickPlayerDots,
  tickPlayerRegen
} = playerRegenHandler;

// (doTeleportList, doTeleport, doBuffList, doBuffBuy delegated to npcServicesHandler)

// ============================================================
//  КВЕСТЫ — серверный авторитет.
//  Данные и правила: shared/quest-db.js. Состояние: p.quests (в профиле).
//  Прогресс kill считается в onMobDeath, collect — по серверному инвентарю
//  при сдаче, talk — при разговоре с NPC (проверяется дистанция).
//  Раньше всё это жило в клиенте: прогресс в localStorage, награды через
//  локальный inventory.addItem (стирались синхронизацией), а хуки kill/collect
//  не вызывались ниоткуда — цели были невыполнимы.
// ============================================================

// === QUEST HANDLER (SERVER AUTHORITY) ===
const questHandler = createQuestHandler({
  QD,
  NPCS,
  EXP,
  send,
  invCount,
  giveCurrency,
  grantExpSp,
  applyPlayerBuff,
  pushEffects,
  pushCombatStats,
  saveProfileNow,
  pruneInv,
  pushWeight,
  canCarryMore,
  wouldExceedWeight
});

const {
  pushQuests,
  syncQuestCollect,
  questCollectChanged,
  doQuestList,
  doQuestAccept,
  doQuestAbandon,
  doQuestComplete,
  doQuestTalk,
  questOnKill
} = questHandler;

function mobDisplayNameServer(mobId) {
  try {
    if (MOB_DB && MOB_DB.get) {
      const t = MOB_DB.get(mobId);
      if (t && t.name) return t.name;
    }
  } catch (e) { /* ignore */ }
  return mobId || 'Моб';
}

// splitExpToParty delegated to partyHandler

// === INVENTORY & ITEM HANDLERS (Phase 1 Decomposition) ===
// Delegated logic contracts:
// - item-use-handler: eff.atkSpdMult || eff.attackSpeedBoost
// - inventory-action-handler: send(p, { t: 'drop_fail', reason: 'nodrop'
// - inventory-action-handler: send(p, { t: 'destroy_fail', reason: 'nodrop'
// - enchant-handler: ER.crystalize, enchant_break
const {
  doEquip,
  doUnequip,
  doDropItem,
  doDestroyItem
} = createInventoryActionHandler({
  send,
  checkRate,
  isBadKey,
  equipSlotForTpl,
  stampDeviceFields,
  pushCombatStats,
  pushWeight,
  saveProfileNow,
  broadcastCosmeticsUpdate,
  invCount,
  spawnGroundLoot,
  itemLookup
});

const {
  doEnchant
} = createEnchantHandler({
  send,
  checkRate,
  isBadKey,
  pushCombatStats,
  pushWeight,
  saveProfileNow,
  invCount,
  canCarryMore,
  spawnGroundLoot
});

const {
  doItemUse
} = createItemUseHandler({
  players,
  send,
  broadcastAOI,
  snapStandY,
  isPeaceAt,
  zoneLabelAt,
  updatePlayerRegion,
  ensureNearbyMobs,
  resetMoveBudget,
  entityTransforms,
  saveProfileNow,
  markProfileDirty,
  pushEffects,
  pushCombatStats,
  applyPlayerBuff,
  resurrectPlayer,
  deathSelfPayload,
  grantSkillFree,
  cosmeticsPublic,
  tableGet,
  itemLookup,
  isBadKey,
  checkRate,
  playerStunned,
  dist2,
  toggleShotArm,
  ZS,
  IS_CLUSTER,
  TOTAL_WORKERS,
  CURRENT_WORKER_ID,
  initiateClusterHandoff: (p, w) => initiateClusterHandoff(p, w)
});

const {
  doCraft,
  doLearnRecipe
} = createCraftHandler({
  send,
  checkRate,
  tableGet,
  wouldExceedWeight,
  bagPlus,
  pruneInv,
  questCollectChanged,
  saveProfileNow,
  pushWeight
});

// === DISCONNECT & SESSION MANAGEMENT (Phase 4 Decomposition) ===
const disconnectManager = createDisconnectManager({
  players,
  wsByPid,
  pidByYid,
  loggingIn,
  dirtyProfiles: _dirtyProfiles,
  mobs,
  parties,
  partyHandler,
  spatialGrid,
  nativeSpatialGrid,
  entityTransforms,
  isSyntheticBot,
  closeTrade,
  interruptDuel,
  broadcastStoreState,
  notifyFriends,
  notifyClan,
  partyOf: (p) => partyOf(p),
  pushParty: (pa) => pushParty(pa),
  send,
  sendPid,
  EditorGuard,
  profileOf,
  lbTouch,
  onSaveFailed: (item) => onProfileSaveFailed(item),
  DB,
  PlayerDb,
  IS_CLUSTER,
  clusterIpc,
  CURRENT_WORKER_ID
});

async function detachPlayer(pid) {
  return disconnectManager.detachPlayer(pid);
}

async function handleSocketClose(ws, sess) {
  return disconnectManager.handleSocketClose(ws, sess);
}

const sessionManager = createSessionManager({
  AUTH,
  YANDEX_SECRET,
  AccountKeys,
  DB,
  PlayerDb,
  sanitizeCharName,
  getNextPid: () => nextId++,
  entityTransforms,
  players,
  wsByPid,
  pidByYid,
  loggingIn,
  detachPlayer,
  isSyntheticBot,
  snapStandY,
  saveProfileNow,
  resetMoveBudget,
  isGM,
  EditorGuard,
  zoneLabelAt,
  isPeaceAt,
  selfPayload: (p) => selfPayload(p),
  deathSelfPayload: (p) => deathSelfPayload(p),
  effectsPayload: (p) => effectsPayload(p),
  getActiveOnlineCount: () => getActiveOnlineCount(),
  worldTimePayload: () => worldTimePayload(),
  ensureNearbyMobs,
  sendNearbyLoot,
  friendsPayload,
  notifyFriends,
  Clans,
  bindClan,
  clanPayload,
  sendCrest,
  notifyClan,
  syncQuestCollect,
  activeEvents,
  eventStartPayload,
  send,
  sendJson,
  GEO,
  IS_CLUSTER,
  clusterIpc,
  CURRENT_WORKER_ID,
  MSG_GATEWAY_SEND,
  ZS,
  TOTAL_WORKERS,
  initiateClusterHandoff,
  profileOf
});

const doLogin = (ws, msg) => sessionManager.doLogin(ws, msg);

function handle(p, msg) {
  // Дедупликация/упорядочивание по seq. Раньше проверка была `typeof === 'number'`,
  // а `typeof Infinity === 'number'`: один пакет с seq=Infinity ставил p.seq в
  // Infinity, и ВСЕ последующие пакеты с seq отбрасывались как устаревшие —
  // канал глох навсегда (проверено). Дробные и отрицательные тоже отсекаем.
  if (msg.seq != null) {
    if (!Number.isSafeInteger(msg.seq) || msg.seq < 0) return;
    const newSeq = msg.seq & 0xffff;
    if (!p._seqInit) {
      p._seqInit = true;
      p.seq = newSeq;
    } else {
      const curSeq = (p.seq || 0) & 0xffff;
      const diff = (newSeq - curSeq) & 0xffff;
      if (diff === 0 || diff >= 0x8000) return;
      p.seq = newSeq;
    }
  }
  // L2 corpse: strict whitelist while dead (only revive, chat, ping/pong)
  if (p.dead && msg.t !== 'revive' && msg.t !== 'chat' && msg.t !== 'ping' && msg.t !== 'pong') {
    if (msg.t === 'debug_die' && p.dev) {
      send(p, { t: 'debug_die_fail', reason: 'dead' });
    }
    return;
  }
  switch (msg.t) {
    case 'ping': {
      const now = Date.now();
      if (p._lastClientPing && now - p._lastClientPing < 450) {
        break; // VULN-DDOS-04: Троттлинг клиентского пинга для предотвращения флуда
      }
      p._lastClientPing = now;
      const ws = wsByPid.get(p.pid);
      if (ws) {
        const s = sessions.get(ws);
        if (s) s.lastPong = now;
      }
      send(p, { t: 'pong', time: msg.time || 0 });
      break;
    }
    case 'pong': {
      const ws = wsByPid.get(p.pid);
      if (ws) {
        const s = sessions.get(ws);
        if (s) s.lastPong = Date.now();
      }
      break;
    }
    case 'revive': {
      deathHandler.handleReviveMessage(p, msg);
      break;
    }
    // F2 editor / QA: spawn item at feet like mob drop
    case 'debug_spawn_loot': {
      // Любой игрок мог намыть до 594 любых предметов в секунду (свитки заточки,
      // C-grade оружие). Теперь только GM / dev.
      if (!isGM(p)) { send(p, { t: 'err', msg: 'debug_spawn_loot: только для GM' }); break; }
      if (p.dead) return;
      if (!checkRate(p, 'action')) return;
      const itemId = String(msg.itemId || msg.id || '').toLowerCase();
      if (!itemId || isBadKey(itemId)) {
        send(p, { t: 'msg', text: 'debug_spawn_loot: нет itemId' });
        break;
      }
      const lootKnown = LR && LR.LOOT_ITEMS && tableGet(LR.LOOT_ITEMS, itemId);
      const idb = ITEMS && (ITEMS.ITEMS || ITEMS.items || null);
      const itemKnown = tableGet(idb, itemId);
      if (!lootKnown && !itemKnown && !(ITEMS && typeof ITEMS.get === 'function' && ITEMS.get(itemId))) {
        send(p, { t: 'msg', text: 'Неизвестный itemId: ' + itemId });
        break;
      }
      let n = Math.floor(+msg.count || 1);
      if (n < 1) n = 1;
      if (n > 99) n = 99;
      const ox = p.x + (Math.random() - 0.5) * 1.2 + 0.9;
      const oz = p.z + (Math.random() - 0.5) * 1.2 + 0.9;
      const L = spawnGroundLoot(ox, oz, itemId, n, p.pid, { spoil: false, debug: true });
      send(p, { t: 'msg', text: L ? ('Тест-дроп: ' + itemId + ' x' + n) : 'Не удалось заспавнить дроп' });
      break;
    }
    case 'debug_buff': {
      if (!p.dev) { send(p, { t: 'err', msg: 'debug_buff: только для dev' }); break; }
      const bid = String(msg.id || msg.buffId || 'debug_buff').toLowerCase();
      if (!bid || isBadKey(bid)) { send(p, { t: 'debug_buff_fail', reason: 'id' }); break; }
      const nowB = Date.now();
      const dur = Math.max(1, Math.min(3600, +msg.duration || 60));
      const kind = msg.kind === 'debuff' ? 'debuff' : 'buff';
      const e = { id: bid, until: nowB + dur * 1000, kind: kind, priority: msg.priority | 0, name: bid };
      if (msg.attackMult != null) e.attackMult = +msg.attackMult;
      if (msg.defenseMult != null) e.defenseMult = +msg.defenseMult;
      if (msg.speedMult != null) e.speedMult = +msg.speedMult;
      if (msg.atkSpdMult != null) e.atkSpdMult = +msg.atkSpdMult;
      if (msg.expMult != null) e.expMult = +msg.expMult;
      if (msg.slowMult != null) { e.slowMult = +msg.slowMult; e.kind = 'debuff'; }
      if (msg.dps != null) { e.dps = +msg.dps; e.kind = 'dot'; }
      if (msg.sticky) e.sticky = true;
      const r = e.kind === 'buff' ? applyPlayerBuff(p, e, nowB) : applyPlayerDebuff(p, e, nowB);
      pushEffects(p);
      if (r.ok) pushCombatStats(p);
      send(p, {
        t: 'debug_buff_ok',
        ok: !!r.ok,
        reason: r.reason || null,
        id: bid,
        replaced: r.replaced || null,
        dropped: (r.dropped || []).map((x) => x && x.id).filter(Boolean),
        buffs: (p.buffs || []).map((x) => x.id),
        debuffs: (p.debuffs || []).map((x) => x.id)
      });
      break;
    }
    case 'debug_event': {
      handleDebugEvent(p, msg);
      break;
    }
    case 'debug_die': {
      if (!p.dev) { send(p, { t: 'err', msg: 'debug_die: только для dev' }); break; }
      if (p.dead) { send(p, { t: 'debug_die_fail', reason: 'dead' }); break; }
      const by = String(msg.by || 'mob');
      const byPlayer = by === 'player';
      const rng = msg.forceDrop ? function () { return 0; } : Math.random;
      beginPlayerDeath(p, {
        killerName: msg.killer || (byPlayer ? 'debug' : 'debug-mob'),
        byMob: !byPlayer,
        byPlayer: byPlayer,
        rng: rng
      });
      break;
    }
    case 'debug_give': {
      if (!p.dev) { send(p, { t: 'err', msg: 'debug_give: только для dev' }); break; }
      const gid = String(msg.itemId || msg.id || '').toLowerCase();
      if (!gid || isBadKey(gid)) { send(p, { t: 'debug_give_fail', reason: 'id' }); break; }
      let gn = Math.floor(+msg.count || 1);
      if (!Number.isFinite(gn) || gn < 1) gn = 1;
      if (gn > 1e9) gn = 1e9;
      if (!msg.force) {
        const carry = canCarryMore(p, gid, gn);
        if (!carry.ok) {
          send(p, { t: 'debug_give_fail', reason: 'weight', weight: carry.load, maxWeight: carry.max });
          break;
        }
      }
      grantLootToPlayer(p, gid, gn);
      pruneInv(p);
      pushWeight(p);
      send(p, Object.assign({
        t: 'debug_give_ok', itemId: gid, count: gn, inv: p.inv
      }, weightPayload(p)));
      break;
    }
    case 'debug_dispel': {
      if (!p.dev) { send(p, { t: 'err', msg: 'debug_dispel: только для dev' }); break; }
      const kind = msg.kind === 'debuff' ? 'debuff' : (msg.kind === 'buff' ? 'buff' : null);
      const opts = { n: Math.max(1, Math.min(20, +msg.n || 1)), all: !!msg.all };
      if (!kind || kind === 'buff') p.buffs = BR.dispel(p.buffs, Object.assign({ kind: 'buff' }, opts)).list;
      if (!kind || kind === 'debuff') p.debuffs = BR.dispel(p.debuffs, Object.assign({ kind: 'debuff' }, opts)).list;
      pushEffects(p);
      pushCombatStats(p);
      send(p, {
        t: 'debug_dispel_ok',
        buffs: (p.buffs || []).map((x) => x.id),
        debuffs: (p.debuffs || []).map((x) => x.id)
      });
      break;
    }
    case 'move':
    case 'move_stop':
    case 'pose':
    case 'editor_set_pos': {
      movementHandler.handleMovementMessage(p, msg);
      break;
    }
    case 'attack':
    case 'attack_player': {
      combatHandler.handleCombatMessage(p, msg);
      break;
    }
    case 'equip': {
      doEquip(p, msg);
      break;
    }
    case 'unequip': {
      doUnequip(p, msg);
      break;
    }
    case 'drop_item': {
      doDropItem(p, msg);
      break;
    }
    case 'destroy_item': {
      doDestroyItem(p, msg);
      break;
    }
    case 'cast_begin':
    case 'cast_complete':
    case 'skill':
    case 'cast_cancel': {
      combatHandler.handleCombatMessage(p, msg);
      break;
    }
    case 'test_set_non_gm': {
      if (!SEC.insecureDev()) break;
      p.nonGm = true;
      send(p, { t: 'test_set_non_gm_ok' });
      break;
    }
    case 'test_set_require_cast': {
      if (!SEC.insecureDev()) break;
      p.requireCast = true;
      send(p, { t: 'test_set_require_cast_ok' });
      break;
    }
    case 'learn_skill': {
      if (!checkRate(p, 'action')) return;
      doLearnSkill(p, msg.skillId || msg.id, msg.npcId);
      break;
    }
    case 'craft': {
      doCraft(p, msg);
      break;
    }
    case 'learn': {
      doLearnRecipe(p, msg);
      break;
    }
    case 'device_upgrade': {
      if (p.dead || p.hp <= 0) return;
      if (!checkRate(p, 'action')) return;
      doDeviceUpgrade(p, String(msg.track || '').toLowerCase(), msg.npcId);
      break;
    }
    // ---- Услуги NPC (магазин / продажа / телепорт / баффы) ----
    // Отдельное ведро 'npc': окно диалога делает несколько запросов подряд
    // (открыть магазин → купить → обновить), и ведра 'action' на 6/с не хватает.
    case 'shop_open': {
      if (!checkRate(p, 'npc')) return;
      doShopOpen(p, msg.npcId);
      break;
    }
    case 'npc_buy': {
      if (!checkRate(p, 'npc')) return;
      doShopBuy(p, msg);
      break;
    }
    case 'npc_sell': {
      if (!checkRate(p, 'npc')) return;
      doShopSell(p, msg);
      break;
    }
    case 'teleport_list': {
      if (!checkRate(p, 'npc')) return;
      doTeleportList(p, msg.npcId);
      break;
    }
    case 'npc_teleport': {
      if (!checkRate(p, 'action')) return;
      doTeleport(p, msg);
      break;
    }
    case 'npc_buff_list': {
      if (!checkRate(p, 'npc')) return;
      doBuffList(p, msg.npcId);
      break;
    }
    case 'npc_buff': {
      if (!checkRate(p, 'action')) return;
      doBuffBuy(p, msg);
      break;
    }
    case 'biotin_trophy_turnin': {
      if (p.dead || (p.hp != null && p.hp <= 0)) break;
      if (playerStunned(p)) { send(p, { t: 'biotin_trophy_fail', reason: 'stunned' }); break; }
      if (p.trade || p.store) {
        send(p, { t: 'biotin_trophy_fail', reason: 'busy' });
        send(p, { t: 'msg', text: 'Нельзя сдавать трофеи во время торговли или лавки.' });
        break;
      }
      if (!checkRate(p, 'npc')) return;
      const npc = npcForService(p, msg.npcId || 'biotin', 'biotin_trophy_fail', 'buff');
      if (!npc) return;
      const trophies = [
        { id: 'quest_memory_gear', name: 'Шестерня Памяти', price: 120 },
        { id: 'quest_acid_valve', name: 'Кислотный Клапан', price: 180 },
        { id: 'quest_corrupted_chip', name: 'Испорченный Чип', price: 500 }
      ];
      let totalGears = 0;
      const turnedIn = [];
      for (const tr of trophies) {
        const cnt = invCount(p, tr.id);
        if (cnt > 0) {
          const sum = cnt * tr.price;
          totalGears += sum;
          turnedIn.push(tr.name + ' ×' + cnt + ' (+' + sum + ' ⚙️)');
          p.inv[tr.id] = 0;
          delete p.inv[tr.id];
        }
      }
      if (totalGears <= 0) {
        send(p, {
          t: 'msg',
          text: 'Смотритель Биотин: «У вас нет подходящих трофеев. Приносите Шестерни Памяти (120 ⚙️), Кислотные Клапаны (180 ⚙️) или Испорченные Чипы (500 ⚙️)!»'
        });
        break;
      }
      giveCurrency(p, totalGears);
      saveProfileNow(p);
      pruneInv(p);
      pushWeight(p);
      send(p, {
        t: 'biotin_trophy_ok',
        npcId: npc.id,
        reward: totalGears,
        currency: currencyOf(p),
        inv: p.inv
      });
      send(p, {
        t: 'msg',
        text: 'Смотритель Биотин принял трофеи: ' + turnedIn.join(', ') + '. Получено: +' + totalGears + ' ⚙️!'
      });
      break;
    }
    // ---- Персональный склад (NPC type warehouse) ----
    // Ведро 'npc': окно склада делает открыть → положить → забрать подряд.
    case 'wh_open': {
      if (!checkRate(p, 'npc')) return;
      doWarehouseOpen(p, msg.npcId);
      break;
    }
    case 'wh_put': {
      if (!checkRate(p, 'npc')) return;
      doWarehousePut(p, msg);
      break;
    }
    case 'wh_take': {
      if (!checkRate(p, 'npc')) return;
      doWarehouseTake(p, msg);
      break;
    }
    // ---- Обмен игрок ↔ игрок ----
    case 'trade_offer': {
      if (!checkRate(p, 'action')) return;
      doTradeOffer(p, msg);
      break;
    }
    case 'trade_accept': {
      if (!checkRate(p, 'action')) return;
      doTradeAccept(p, msg);
      break;
    }
    case 'trade_add': {
      if (!checkRate(p, 'npc')) return;
      doTradeAdd(p, msg);
      break;
    }
    case 'trade_remove': {
      if (!checkRate(p, 'npc')) return;
      doTradeRemove(p, msg);
      break;
    }
    case 'trade_lock': {
      if (!checkRate(p, 'npc')) return;
      doTradeLock(p);
      break;
    }
    case 'trade_confirm': {
      if (!checkRate(p, 'action')) return;
      doTradeConfirm(p);
      break;
    }
    case 'trade_cancel': {
      if (!checkRate(p, 'action')) return;
      closeTrade(p, 'cancel');
      break;
    }
    // ---- Личная лавка ----
    case 'store_set': {
      if (!checkRate(p, 'action')) return;
      doStoreSet(p, msg);
      break;
    }
    case 'store_close': {
      if (!checkRate(p, 'action')) return;
      closeStore(p, 'cancel');
      break;
    }
    case 'store_list': {
      if (!checkRate(p, 'npc')) return;
      doStoreList(p, msg);
      break;
    }
    case 'store_buy': {
      if (!checkRate(p, 'npc')) return;
      doStoreDeal(p, msg, 'buy');
      break;
    }
    case 'store_sell': {
      if (!checkRate(p, 'npc')) return;
      doStoreDeal(p, msg, 'sell');
      break;
    }
    // ---- Друзья ----
    case 'friend_list': {
      if (!checkRate(p, 'npc')) return;
      doFriendList(p);
      break;
    }
    case 'friend_add': {
      if (!checkRate(p, 'action')) return;
      doFriendAdd(p, msg);
      break;
    }
    case 'friend_accept': {
      if (!checkRate(p, 'action')) return;
      doFriendAccept(p, msg);
      break;
    }
    case 'friend_remove': {
      if (!checkRate(p, 'action')) return;
      doFriendRemove(p, msg);
      break;
    }
    // ---- Клан ----
    case 'clan_info': {
      if (!checkRate(p, 'npc')) return;
      doClanInfo(p);
      break;
    }
    case 'clan_create': {
      if (!checkRate(p, 'action')) return;
      doClanCreate(p, msg);
      break;
    }
    case 'clan_invite': {
      if (!checkRate(p, 'action')) return;
      doClanInvite(p, msg);
      break;
    }
    case 'clan_accept': {
      if (!checkRate(p, 'action')) return;
      doClanAccept(p, msg);
      break;
    }
    case 'clan_leave': {
      if (!checkRate(p, 'action')) return;
      doClanLeave(p);
      break;
    }
    case 'clan_kick': {
      if (!checkRate(p, 'action')) return;
      doClanKick(p, msg);
      break;
    }
    case 'clan_promote': {
      if (!checkRate(p, 'action')) return;
      doClanPromote(p, msg);
      break;
    }
    case 'clan_leader': {
      if (!checkRate(p, 'action')) return;
      doClanLeader(p, msg);
      break;
    }
    case 'clan_disband': {
      if (!checkRate(p, 'action')) return;
      doClanDisband(p);
      break;
    }
    case 'clan_levelup': {
      if (!checkRate(p, 'action')) return;
      doClanLevelUp(p);
      break;
    }
    case 'clan_crest': {
      if (!checkRate(p, 'action')) return;
      doClanCrest(p, msg);
      break;
    }
    case 'cwh_open': {
      if (!checkRate(p, 'npc')) return;
      doClanWhOpen(p, msg.npcId);
      break;
    }
    case 'cwh_put': {
      if (!checkRate(p, 'npc')) return;
      doClanWhPut(p, msg);
      break;
    }
    case 'cwh_take': {
      if (!checkRate(p, 'npc')) return;
      doClanWhTake(p, msg);
      break;
    }
    // ---- Квесты (авторитет сервера; данные shared/quest-db.js) ----
    case 'quest_list': {
      if (!checkRate(p, 'npc')) return;
      doQuestList(p);
      break;
    }
    case 'quest_accept': {
      if (!checkRate(p, 'action')) return;
      doQuestAccept(p, msg);
      break;
    }
    case 'quest_complete': {
      if (!checkRate(p, 'action')) return;
      doQuestComplete(p, msg);
      break;
    }
    case 'quest_abandon': {
      if (!checkRate(p, 'action')) return;
      doQuestAbandon(p, msg);
      break;
    }
    case 'npc_talk': {
      if (!checkRate(p, 'npc')) return;
      doQuestTalk(p, msg.npcId);
      break;
    }
    case 'enchant': {
      doEnchant(p, msg);
      break;
    }
    case 'use': {
      doItemUse(p, msg);
      break;
    }
    case 'duel_offer':
    case 'duel_accept':
    case 'duel_decline':
    case 'duel_cancel': {
      if (!checkRate(p, 'action')) return;
      duelHandler.handleDuelMessage(p, msg);
      break;
    }
    case 'party_invite':
    case 'party_accept':
    case 'party_decline':
    case 'party_leave':
    case 'party_kick':
    case 'party_dismiss':
    case 'party_leader':
    case 'party_loot': {
      if (!checkRate(p, 'action')) return;
      partyHandler.handlePartyMessage(p, msg);
      break;
    }
    // Ground loot pickup (server authority)
    case 'loot_pickup': {
      if (!checkRate(p, 'action')) return;
      doLootPickup(p, msg.lid != null ? msg.lid : msg.id);
      break;
    }
    case 'class_transfer': {
      if (!checkRate(p, 'action')) return;
      doClassTransfer(p, msg.cls || msg.classId || msg.to, msg.npcId);
      break;
    }
    case 'chat': {
      const isGmCmd = typeof msg.text === 'string' && msg.text.startsWith('//') && isGM(p);
      if (!isGmCmd && !checkRate(p, 'chat')) return;
      doChat(p, msg);
      break;
    }
    case 'report': {
      if (!checkRate(p, 'action')) return;
      doReport(p, msg);
      break;
    }
    // DEV: управление мировым временем (сервер = авторитет)
    case 'set_time':
    case 'set_time_pause': {
      worldTimeHandler.handleTimeMessage(p, msg, isGM);
      break;
    }
    case 'save_editor_data': {
      // Редактор мира: только проверенный GM и только при включённом редакторе (не в production).
      // Ответ — структурированный ack с reqId, чтобы клиент показывал успех только после записи.
      const reqId = (typeof msg.reqId === 'string' || typeof msg.reqId === 'number') ? String(msg.reqId).slice(0, 64) : null;
      if (!isGM(p)) {
        send(p, { t: 'err', msg: 'только для GM' });
        send(p, { t: 'editor_save_result', reqId, ok: false, code: 'EFORBIDDEN', error: 'только для GM' });
        break;
      }
      // C-04: при выключенном редакторе запись запрещена безоговорочно (включая GM).
      // Исключение — только явный ALLOW_PROD_EDITOR=1 и уровень доступа 100.
      const prodEditorOverride = process.env.ALLOW_PROD_EDITOR === '1' && (p.accessLevel | 0) >= 100;
      if (!EDITOR_ENABLED && !prodEditorOverride) {
        send(p, { t: 'editor_save_result', reqId, ok: false, code: 'EDISABLED', error: 'редактор выключен на этом сервере' });
        break;
      }
      const nowEd = Date.now();
      if (nowEd - (p._editorSaveAt || 0) < 2000) {
        send(p, { t: 'editor_save_result', reqId, ok: false, code: 'ERATE', error: 'слишком часто' });
        break;
      }
      p._editorSaveAt = nowEd;
      if (!msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) {
        send(p, { t: 'editor_save_result', reqId, ok: false, code: 'EINVALID', error: 'bad payload' });
        break;
      }
      const r = saveEditorOverridesToDisk(msg.data, { baseRev: msg.baseRev != null ? msg.baseRev : msg.data.baseRev });
      Mod.log('editor_save', { by: p.name, yid: p.yid, ok: r.ok, rev: r.rev, code: r.code });
      send(p, Object.assign({ t: 'editor_save_result', reqId }, r));
      break;
    }
  }
}

// onMobDeath delegated to mob-handler

// Death and player regen systems delegated to deathHandler and playerRegenHandler

let _partyTickAcc = 0;
let _unloadAcc = 0;
let _tickCount = 0;

function scheduleNextTick() {
  if (shuttingDown) return;
  const nowNs = process.hrtime.bigint();
  _nextTickTimeNs += TICK_NS;

  let delayMs = Number((_nextTickTimeNs - nowNs) / 1_000_000n);

  // Если отставание превысило 2 тика (200 мс, например из-за блокирующего I/O спайка):
  // сбрасываем целевое время вперед, чтобы не запускать лавину тиков подряд
  if (delayMs < -200) {
    tickOverruns++;
    _nextTickTimeNs = nowNs + TICK_NS;
    delayMs = Math.round(TICK_MS);
  } else if (delayMs < 2) {
    // Гарантируем минимальное окно 2 мс для обработки сетевых событий сокетов в Event Loop
    delayMs = 2;
  }

  _tickTimeout = setTimeout(tick, delayMs);
}

function tickBody() {
  const hrStart = process.hrtime.bigint();
  const t0 = Date.now();
  _tickCount = (_tickCount + 1) | 0;
  _tickRateCounter++;
  if (t0 - _tickRateLastSec >= 1000) {
    tickRateActual = _tickRateCounter;
    _tickRateCounter = 0;
    _tickRateLastSec = t0;
  }
  _tickSnapshotCache.clear();
  _tickBotSnapshotCache.clear();

  // Spatial Grid нарезается в самом начале тика (Zero-GC), чтобы и tickMobs, и AOI работали по актуальным координатам без переборов
  spatialGrid.clear();
  for (const [, pl] of players) {
    if (entityTransforms && pl.transformSlot >= 0) {
      entityTransforms.updatePos(pl.transformSlot, pl.x, pl.y || 0, pl.z);
      entityTransforms.updateHp(pl.transformSlot, pl.dead ? 0 : pl.hp);
    }
    if (nativeSpatialGrid && isSyntheticBot(pl.yid)) continue;
    spatialGrid.insertPlayer(pl);
  }
  for (const [, mb] of mobs) {
    if (entityTransforms && mb.transformSlot >= 0) {
      entityTransforms.updatePos(mb.transformSlot, mb.x, mb.y || 0, mb.z);
      entityTransforms.updateHp(mb.transformSlot, mb.hp);
    }
    if (mb._sleepUntil > t0) continue; // Дальние спящие мобы (>155м) не индексируются в сетку
    spatialGrid.insertMob(mb);
  }
  if (nativeSpatialGrid) {
    nativeSpatialGrid.clear();
    nativeSpatialGrid.bulkInsert(entityTransforms.buffer, entityTransforms.maxSlot);
    nativeSpatialGrid._populated = true;
    nativeSpatialGrid._ghostsInserted = false;
  }

  if (borderGhosts.size > 0) {
    const nowTick = Date.now();
    for (const [gPid, g] of borderGhosts) {
      if (nowTick - g.updatedAt > 3000) {
        borderGhosts.delete(gPid);
        continue;
      }
      spatialGrid.insertPlayer(g);
      if (nativeSpatialGrid && !players.has(gPid)) {
        nativeSpatialGrid.insert(g.pid, TYPE_PLAYER, g.x, g.z, g.hp != null ? g.hp : 100, !!(g.dead || (g.hp != null && g.hp <= 0)));
      }
    }
    if (nativeSpatialGrid) nativeSpatialGrid._ghostsInserted = true;
  }

  if (IS_CLUSTER && clusterIpc) {
    for (const [, p] of players) {
      if (p._handoffInProgress) continue;
      const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
      if (targetWorker !== CURRENT_WORKER_ID) {
        initiateClusterHandoff(p, targetWorker);
      }
    }
  }

  tickMobs();

  // Tick Budget Check: если симуляция мобов и хэндоффа уже превысила бюджет,
  // откладываем вторичные задачи на следующий такт
  const hrNow = process.hrtime.bigint();
  const elapsedMs = Number((hrNow - hrStart) / 1_000_000n);
  const budgetExceeded = elapsedMs >= TICK_BUDGET_MS;

  if (budgetExceeded) {
    tickBudgetDeferred++;
  } else {
    _unloadAcc += TICK_MS;
    if (_unloadAcc >= 1000) {
      _unloadAcc = 0;
      unloadFarSpots();
      if (spawnedSpots.size < SERVER_SPOTS.length) {
        for (const [, p] of players) {
          ensureNearbyMobs(p);
          if (spawnedSpots.size >= SERVER_SPOTS.length) break;
        }
      }
    }
    tickWorldEvents();
    tickDuels();
    tickDayNight();
    tickGroundLoot();
  }

  const dtSec = TICK_MS / 1000;
  _partyTickAcc += dtSec;
  if (_partyTickAcc >= 0.5) {
    _partyTickAcc = 0;
    if (parties.size > 0) {
      for (const [, pa] of parties) pushParty(pa);
    }
  }

  if (IS_CLUSTER && clusterIpc) {
    _borderSyncAcc += dtSec;
    if (_borderSyncAcc >= 0.2) {
      _borderSyncAcc = 0;
      const borderList = [];
      for (const [, p] of players) {
        if (p._handoffInProgress) continue;
        const b = ZS.isNearBorder(p.x, p.z, 95, TOTAL_WORKERS);
        if (b && b.near) {
          borderList.push({
            pid: p.pid,
            x: p.x,
            y: p.y,
            z: p.z,
            name: p.name,
            cls: p.cls,
            race: p.race || 'human',
            gender: p.gender || 'male',
            appearance: p.appearance || null,
            equip: p.equip || null,
            facing: p.facing != null ? p.facing : 0,
            level: p.level || 1,
            hp: p.hp,
            maxHp: p.maxHp || 100,
            karma: p.karma || 0,
            isFlagged: p.isFlagged || false,
            dueling: !!(p.duel && p.duel.peer),
            gm: isGM(p),
            accessLevel: p.accessLevel || 0,
            cosmetics: cosmeticsPublic(p),
            store: storePublic(p),
            clanTag: clanTagOf(p)
          });
        }
      }
      if (borderList.length > 0) {
        clusterIpc.sendToPrimary(MSG_BORDER_GHOSTS, { ghosts: borderList });
      }
    }
  }

  if (_updItemPool.length > 8192 && _updItemIdx < 2048) { _updItemPool.length = 4096; }
  _updItemIdx = 0;
  const isUnderHeavyLoad = players.size > 20;

  const runPlayerTickLoop = () => {
    for (const [, p] of players) {
      const isBot = isSyntheticBot(p.yid);
      if (isBot) {
        if (((_tickCount + p.pid) % 10) === 0) {
          tickPlayerRegen(p, dtSec * 10);
        }
      } else {
        tickPlayerRegen(p, dtSec);
      }

      // Dead Reckoning: если игрок остановился (нет пакетов движения > 350 мс),
      // снимаем активный вектор и шлём MOVE_VEC_STOP
      if ((p.moving && t0 - (p._lastMoveAt || 0) > 350) || (!p.moving && p._moveVec)) {
        p.moving = false;
        if (p._moveVec) {
          p._moveVec = null;
          broadcastMoveVecStop(p, p.x, p.z);
        }
      }

      // Ступенчатый пересчёт AOI (Staggered AOI):
      // Адаптивное масштабирование по размеру мира:
      // Сидячие торговцы-боты неподвижны и не требуют фонового пересчёта AOI
      let aoi;
      if (isBot && p.sitting && p.known.size > 0 && !p._aoiDirty) {
        aoi = _sharedAoiResult;
        aoi.enter.length = 0;
        aoi.leave.length = 0;
      } else {
        const aoiInterval = isBot
          ? (players.size > 2000 ? 50 : (players.size > 500 ? 25 : 12))
          : (isUnderHeavyLoad ? (players.size > 2000 ? 15 : (players.size > 500 ? 10 : (players.size > 200 ? 8 : 4))) : 3);
        const aoiMoveDist2 = isBot
          ? (players.size > 2000 ? 400.0 : 100.0)
          : (isUnderHeavyLoad ? (players.size > 2000 ? 64.0 : (players.size > 500 ? 25.0 : 4.0)) : 4.0);
        const needsAoi = isBot
          ? (p._aoiDirty || p._lastAoiTick == null || ((_tickCount + p.pid) % aoiInterval === 0))
          : (!isUnderHeavyLoad ||
            p._aoiDirty ||
            p._lastAoiTick == null ||
            dist2(p.x, p.z, p._lastAoiX || 0, p._lastAoiZ || 0) > aoiMoveDist2 ||
            ((_tickCount + p.pid) % aoiInterval === 0));

        if (needsAoi) {
          p._aoiDirty = false;
          p._lastAoiTick = _tickCount;
          p._lastAoiX = p.x;
          p._lastAoiZ = p.z;
          aoi = recomputeAOI(p);
        } else {
          aoi = _sharedAoiResult;
          aoi.enter.length = 0;
          aoi.leave.length = 0;
        }
      }

      if (aoi.leave.length) {
        for (let i = 0; i < aoi.leave.length; i++) forgetPos(p, aoi.leave[i]);
      }
      if (aoi.enter.length > 0 || aoi.leave.length > 0) {
        _sharedEnterSnaps.length = 0;
        for (let i = 0; i < aoi.enter.length; i++) {
          const ek = aoi.enter[i];
          if (isBot && ek.charCodeAt(0) === 112 /* 'p' */ && _sharedEnterSnaps.length >= 4) continue;
          const s = isBot ? getBotTickSnapshot(ek) : getTickSnapshot(ek);
          if (!s) continue;
          _sharedEnterSnaps.push(s);
          // enter уже несёт позицию — этот же тик не дублирует её в upd.
          rememberPos(p, ek, s.x, s.z, s.hp);
        }
        _sharedAoiPacket.enter = _sharedEnterSnaps;
        _sharedAoiPacket.leave = aoi.leave;
        send(p, _sharedAoiPacket);
        _sharedAoiPacket.enter = null;
        _sharedAoiPacket.leave = null;
        // Sync ground loot when player moves into new area
        if (aoi.enter.length > 0 && (!p.yid || !isBot)) {
          sendNearbyLoot(p);
          syncAoiEnterMoveVec(p, aoi.enter);
        }
      }

      // Дистанционное квантование частоты обновлений (Tiered Knownlist Update):
      // При высокой нагрузке синтетическим ботам отправляются только критические обновления:
      // Сидячие лавки пропускаются; боты в бою получают только координаты цели;
      // Живые игроки ВСЕГДА обновляются с полной частотой 10 Hz!
      if (isBot) {
        if (p.sitting) continue;
        const isInCombat = !!(p.inCombat || p.isFlagged || (p._lastCombatAt && t0 - p._lastCombatAt < 10000));
        if (!p.target && !isInCombat && !p.casting) {
          const mod = players.size > 2000 ? 8 : (players.size > 500 ? 5 : 3);
          if (((_tickCount + p.pid) % mod) !== 0) continue;
        } else if (((_tickCount + p.pid) & 1) !== 0 && players.size > 2000) {
          continue;
        }
      }
      _sharedUpdList.length = 0;
      const botTgtKey = (isBot && p.target)
        ? (p.target.type === 'p' ? ('p' + p.target.pid) : ('m' + p.target.mid))
        : null;
      let botAmbientMobCount = 0;

      for (const key of p.known) {
        if (isBot && botTgtKey && key !== botTgtKey) continue;
        if (isBot && !botTgtKey) {
          if (key.charCodeAt(0) === 112 /* 'p' */) continue;
          if (++botAmbientMobCount > 2) break;
        }
        if (key.charCodeAt(0) === 112 /* 'p' */) {
          const tid = fastIdFromKey(key);
          const targetP = players.get(tid) || (IS_CLUSTER ? borderGhosts.get(tid) : null);
          if (targetP) {
            // Dead Reckoning: кэшированный расчёт позиции движения на текущий тик
            if (targetP._moveVec) {
              const mv = targetP._moveVec;
              if (mv.predTick !== _tickCount) {
                mv.predTick = _tickCount;
                const elapsed = (t0 - mv.timestamp) / 1000;
                const distTraveled = elapsed * mv.speed;
                const totalD = mv.totalD || 1.0;
                if (totalD > 0.1 && distTraveled < totalD) {
                  const ratio = distTraveled * (mv.invTotalD || (1.0 / totalD));
                  const predX = mv.startX + (mv.targetX - mv.startX) * ratio;
                  const predZ = mv.startZ + (mv.targetZ - mv.startZ) * ratio;
                  mv.inRange = dist2(targetP.x, targetP.z, predX, predZ) <= 1.44;
                } else {
                  mv.inRange = false;
                }
              }
              if (mv.inRange) {
                const prevSig = p._lastUpd ? p._lastUpd.get(key) : undefined;
                const targetHp = NP.qHp ? NP.qHp(targetP.hp) : Math.floor(targetP.hp);
                const prevHp = prevSig ? (typeof prevSig === 'object' ? prevSig.qh : prevSig.hp) : -1;
                if (prevHp === targetHp) {
                  netStats.updSkip++;
                  continue;
                }
              }
            }
            if (isUnderHeavyLoad) {
              const isPriority = (p.target && p.target.pid === tid) ||
                (targetP.target && targetP.target.pid === p.pid);
              if (!isPriority) {
                const d2 = dist2(p.x, p.z, targetP.x, targetP.z);
                if (d2 > 2025) { // > 45м
                  if (((_tickCount + tid) & 3) !== 0) continue;
                } else if (d2 > (isBot ? 256 : 1225)) { // Для ботов > 16м, для живых игроков > 35м
                  if (((_tickCount + tid) & 1) !== 0) continue;
                }
              }
            }
            pushPosUpd(p, _sharedUpdList, key, targetP.x, targetP.z, targetP.hp);
          }
        } else {
          const mid = fastIdFromKey(key);
          const targetM = mobs.get(mid);
          if (targetM && targetM.hp > 0) {
            if (isUnderHeavyLoad) {
              const isPriority = (p.target && p.target.mid === mid) || (targetM.target === p.pid || targetM.targetPid === p.pid);
              if (!isPriority) {
                const d2 = dist2(p.x, p.z, targetM.x, targetM.z);
                if (d2 > 2025) { // > 45м
                  if (((_tickCount + mid) & 3) !== 0) continue;
                } else if (d2 > 256) { // > 16м
                  if (((_tickCount + mid) & 1) !== 0) continue;
                }
              }
            }
            pushPosUpd(p, _sharedUpdList, key, targetM.x, targetM.z, targetM.hp);
          }
        }
      }
      if (_sharedUpdList.length > 0) {
        if (!isBot || (_tickCount + p.pid) % (players.size > 2000 ? 4 : (players.size > 500 ? 2 : 1)) === 0) {
          sendUpd(p, _sharedUpdList);
        }
      }
    }
  };
  if (netTransport && typeof netTransport.cork === 'function') {
    netTransport.cork(runPlayerTickLoop);
  } else {
    runPlayerTickLoop();
  }
  if (IS_CLUSTER) flushGatewayBatch();
  lastTickAt = Date.now();
  const hrEnd = process.hrtime.bigint();
  tickMsLast = Math.round(Number((hrEnd - hrStart) / 1_000_000n) * 100) / 100;
  if (tickMsLast > tickMsMax) tickMsMax = tickMsLast;
  tickMsEma = tickMsEma ? (tickMsEma * 0.9 + tickMsLast * 0.1) : tickMsLast;
  if (tickMsLast > TICK_MS) {
    tickOverruns++;
  }
}

// C-11: игровой цикл изолирован try/catch — единичное исключение в тике не убивает воркер
// и не останавливает симуляцию; следующий тик планируется всегда.
let tickErrors = 0;
let _tickErrLogAt = 0;
function tick() {
  try {
    tickBody();
  } catch (e) {
    tickErrors++;
    const nowErr = Date.now();
    if (nowErr - _tickErrLogAt > 5000) {
      _tickErrLogAt = nowErr;
      console.error('[tick] исключение в игровом цикле (всего ' + tickErrors + '):', e && (e.stack || e.message) || e);
    }
  } finally {
    scheduleNextTick();
  }
}
// Write-Behind Dirty Cache (Спринт 1, v2.2 / 5000 CCU Scale)
// Динамический размер батча: при росте очереди грязных профилей размер батча
// пропорционально увеличивается (Math.max(16, Math.ceil(_dirtyProfiles.size / 6))),
// гарантируя полный сброс очереди на диск за ~22.5–30 секунд при любой нагрузке.
const saveTimer = setInterval(() => {
  if (_dirtyProfiles.size === 0) { retryFailedSaves(16); return; }
  const batchSize = Math.max(16, Math.ceil(_dirtyProfiles.size / 6));
  let n = batchSize;
  const batch = [];
  for (const [k, p] of _dirtyProfiles) {
    _dirtyProfiles.delete(k);
    if (p && !p._handedOff && (!p.yid || !isSyntheticBot(p.yid))) {
      try {
        const pr = profileOf(p);
        lbTouch(p.yid, pr, p.charId);
        batch.push({ yid: p.yid, data: pr, charId: p.charId });
      } catch (e) { console.error('[DB] saveTimer prep', p.yid, e && e.message); }
    }
    if (--n <= 0) break;
  }
  saveBatchWithRetry(batch, 'saveTimer batch error');
  // повтор ранее не записанных снимков (небольшими порциями, чтобы не забить очередь записи)
  retryFailedSaves(16);
}, Math.max(1000, Math.floor(SAVE_EVERY / 8)));
// doLogin and doLoginInner delegated to sessionManager (Phase 4 Decomposition)

const SERVE_CLIENT = (process.env.SERVE_CLIENT || '1') === '1';
// Инструменты редактора мира пишут файлы на диск и поднимают WS_MAX_PAYLOAD до
// 32 МБ. Раньше гейт был привязан к отсутствию секрета Яндекса: забыть одну
// переменную окружения означало открыть и подмену личности, и запись файлов.
// В dev-режиме редактор активен по умолчанию (отключается явно через EDITOR_ENABLED=0).
// В production только явный EDITOR_ENABLED=1.
const IS_PROD = process.env.NODE_ENV === 'production';
const EDITOR_ENABLED = !IS_PROD && (process.env.EDITOR_ENABLED === '1' || process.env.EDITOR_ENABLED !== '0');
if (process.env.EDITOR_ENABLED === '1' && IS_PROD) {
  console.warn('[server] EDITOR_ENABLED=1 игнорируется при NODE_ENV=production');
}
const REPO_ROOT = path.join(__dirname, '..');
const staticServer = createStaticServer({ REPO_ROOT });
const {
  ALLOWED_ROOTS,
  DATA_PUBLIC,
  DATA_PRIVATE,
  MIME,
  COMPRESSIBLE,
  resolveStaticPath,
  acceptsGzip,
  sendStatic,
  denyEditor,
  serveStatic
} = staticServer;
const OVERRIDES_FILE = path.join(REPO_ROOT, 'shared', 'editor-overrides.json');

// Загрузка сохранённых с редактора оверрайдов при старте сервера
try {
  if (fs.existsSync(OVERRIDES_FILE) && WM.applyEditorOverrides) {
    const raw = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    WM.applyEditorOverrides(JSON.parse(raw));
    // ensure spots rebuilt with MOB_DB (order-safe)
    if (WM.rebuildMobSpotsFromEditor) {
      const n = WM.rebuildMobSpotsFromEditor();
      console.log('[server] Spots from editor hunt zones:', n);
    }
    rebuildServerSpots();
    const regs = WM.buildRegions();
    console.log('[server] Regions (village + editor):', regs.map(r => r.name + (r.peace ? '*' : '')).join(', '));
    console.log('[server] MOB spots:', SERVER_SPOTS.length, 'slots ~',
      SERVER_SPOTS.reduce((a, s) => a + (s.n || 0), 0));
  } else if (WM.rebuildMobSpotsFromEditor) {
    WM.rebuildMobSpotsFromEditor();
    rebuildServerSpots();
  }
  // Индекс NPC кэширует позиции, а оверрайды их переносят — сбросить после.
  NPCS.rebuild();
  const shopN = NPCS.allNpcs().filter(n => n.shop && n.shop.length).length;
  const tpN = NPCS.allNpcs().reduce((a, n) => a + NPCS.teleportPoints(n.id).length, 0);
  console.log('[server] NPC: ' + NPCS.allNpcs().length + ' (магазинов ' + shopN + ', точек ТП ' + tpN + ')');
  console.log('[server] Ready: lazy mob spawn r=' + SPOT_LOAD_R + 'm, spots=' + SERVER_SPOTS.length);
  loadWorldGeo();
} catch (e) {
  console.warn('[server] Ошибка загрузки editor-overrides.json:', e && e.message);
  try {
    if (WM.rebuildMobSpotsFromEditor) WM.rebuildMobSpotsFromEditor();
    rebuildServerSpots();
  } catch (e2) { /* ignore */ }
  loadWorldGeo();
}

/** Меш террейна + пропсы + сегменты стен острова — авторитет сервера (PLAN 3.2). */
function loadWorldGeo() {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : global;
    if (!g.window) g.window = g;
    const tdBin = path.join(CLIENT, 'data', 'mesh', 'terrain.bin');
    const tdPath = path.join(CLIENT, 'js', 'terrain-data.js');
    if (fs.existsSync(tdBin)) {
      const MeshBin = require(path.join(CLIENT, 'js', 'mesh-bin.js'));
      g.TerrainData = MeshBin.loadFileSync(fs, tdBin);
      g.window.TerrainData = g.TerrainData;
    } else if (fs.existsSync(tdPath)) {
      const vm = require('vm');
      const sandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(tdPath, 'utf8'), sandbox, { timeout: 2000 });
      g.TerrainData = sandbox.window.TerrainData || sandbox.TerrainData || g.TerrainData;
      g.window.TerrainData = g.TerrainData;
    }
    g.WorldMetrics = WM;
    g.TerrainData = g.window.TerrainData || g.TerrainData;
    const TH = require(path.join(CLIENT, 'js', 'terrain-height.js'));
    g.TerrainHeight = TH;
    g.PropsLibrary = require(path.join(CLIENT, 'js', 'props-library-data.js'));
    const PC = require(path.join(CLIENT, 'js', 'props-collision.js'));
    g.PropsCollision = PC;
    const wdPath = path.join(CLIENT, 'js', 'walls-data.js');
    let segs = (g.window.WallsData && g.window.WallsData.segments) || [];
    if (fs.existsSync(wdPath)) {
      const vm = require('vm');
      const sandbox = { window: {} };
      vm.runInNewContext(fs.readFileSync(wdPath, 'utf8'), sandbox, { timeout: 2000 });
      if (sandbox.window.WallsData || sandbox.WallsData) {
        g.window.WallsData = sandbox.window.WallsData || sandbox.WallsData;
        segs = g.window.WallsData.segments || [];
      }
    }
    const ok = GEO.bind({
      TerrainData: g.TerrainData,
      TerrainHeight: TH,
      PropsCollision: PC,
      wallSegments: segs
    });
    const st = GEO.stats();
    console.log('[geo]', ok ? 'ready' : 'degraded',
      'mesh=' + !!st.hasMesh,
      'props=' + !!st.hasProps,
      'walls=' + st.walls,
      'sea=' + st.sea);
  } catch (e) {
    console.error('[geo] load failed', e && e.stack || e);
  }
}

const httpRouter = createHttpRouter({
  getLastTickAt: () => lastTickAt,
  metricsPayload: () => metricsPayload(),
  worldTimePayload: () => worldTimePayload(),
  buildLeaderboard: (n) => buildLeaderboard(n),
  players,
  pidByYid,
  wsByPid,
  loggingIn,
  lbTouch: (yid, pr, charId) => lbTouch(yid, pr, charId),
  lbDrop: (yid, charId) => lbDrop(yid, charId),
  clanLeaveOnCharDelete: (yid, charId) => clanLeaveOnCharDelete(yid, charId),
  send,
  detachPlayer: (pid) => detachPlayer(pid),
  kickYid: (yid, code, why) => kickYid(yid, code, why),
  isGM: (p) => isGM(p),
  rebuildServerSpots: () => rebuildServerSpots(),
  sanitizeCharName,
  isBadKey,
  YANDEX_SECRET,
  EDITOR_ENABLED,
  CLIENT_DIR: CLIENT,
  SHARED_DIR: SHARED
});
httpRouter.setupGmChangeListener();
const saveEditorOverridesToDisk = (data, opts) => httpRouter.saveEditorOverridesToDisk(data, opts);

const server = http.createServer((req, res) => {
  if (httpRouter.handleRequest(req, res)) return;
  if (SERVE_CLIENT) return serveStatic(req, res);
  if (req.url === '/' || req.url === '') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Project Steam MMO Dedicated Server (API/WS Only)');
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found: Dedicated MMO Server (API/WS Only)');
});
// Максимальный размер WebSocket-фрейма: 64 КБ в проде (защита от DoS/zip-бомб), 2 МБ в dev
const WS_MAX_PAYLOAD = process.env.NODE_ENV === 'production' ? (64 * 1024) : (2 * 1024 * 1024);
// perMessageDeflate: no-context-takeover, узкое окно — иначе каждый сокет
// держит zlib-состояние на десятки КБ. threshold: мелкий JSON раздувается
// заголовком DEFLATE, жмём только пакеты от 256 байт (полный AOI-upd).
const WS_DEFLATE = (String(process.env.WS_DEFLATE || '').trim() === '0' || String(process.env.WS_DEFLATE || '').trim() === 'false') ? false : {
  zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
  zlibInflateOptions: { chunkSize: 10 * 1024 },
  clientNoContextTakeover: true,
  serverNoContextTakeover: true,
  serverMaxWindowBits: 10,
  concurrencyLimit: 256,
  threshold: 1024
};
function verifyWsClient(info, cb) {
  // H12: единый белый список (security-config.originAllowed); в production — строго
  const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
  const h = (info.req && info.req.headers) || {};
  if (SEC.originAllowed(origin, h.host, h['x-forwarded-host'])) return cb(true);
  const strict = SEC.isProd() || process.env.STRICT_CORS === '1';
  console.warn('[ws] ' + (strict ? 'Rejected' : 'Allowed (dev)') + ' origin:', String(origin).slice(0, 200));
  if (!strict) return cb(true);
  return cb(false, 403, 'Forbidden Origin');
}
let netTransport = null;
let wss = null;
if (!IS_CLUSTER) {
  netTransport = NetTransport.createNetworkTransport({
    server,
    port: PORT,
    maxPayload: WS_MAX_PAYLOAD,
    perMessageDeflate: WS_DEFLATE,
    verifyClient: verifyWsClient,
    engine: process.env.NET_ENGINE,
    getLastTickAt: () => lastTickAt
  });
  if (netTransport.type !== 'uws') {
    if (process.env.NODE_ENV === 'production' || process.env.STRICT_UWS === '1') {
      console.error('[server] FATAL: Запуск на устаревшем транспорте ws в продакшене запрещен! Требуется uWebSockets.js.');
      process.exit(1);
    }
    console.warn(`[server] Сетевой транспорт: ${netTransport.type.toUpperCase()} (ВНИМАНИЕ: устаревший non-prod режим, высокий GC)`);
  } else {
    console.log('[server] Сетевой транспорт: UWS (uWebSockets.js C++ Zero-GC, 3000-5000+ CCU)');
  }
  wss = netTransport.server;
  wss.on('error', (e) => console.error('[ws] server error:', e && e.message));
} else {
  wss = { clients: new Set(), on: () => { } };
}
server.on('error', (e) => console.error('[http] server error:', e && e.message));
function setupSocketConnection(ws, isHandoff = false) {
  const handoffAuthed = (isHandoff === true);
  let authed = handoffAuthed || !!ws.isAuthed || (ws.pid != null && players.has(ws.pid));
  let lt = null;
  const loginTimeoutMs = parseInt(process.env.LOGIN_TIMEOUT_MS || '15000', 10);
  if (!authed) {
    lt = setTimeout(() => { if (!authed && !ws.isAuthed) ws.close(4001, 'login timeout'); }, loginTimeoutMs);
  }
  ws.setAuthed = (v) => {
    authed = !!v;
    ws.isAuthed = !!v;
    if (authed) {
      if (lt) {
        clearTimeout(lt);
        lt = null;
      }
      if (typeof ws.subscribe === 'function') {
        try {
          ws.subscribe('world');
          const p = ws.pid != null ? players.get(ws.pid) : null;
          if (p && p.region) ws.subscribe('region:' + p.region);
        } catch (_) { }
      }
    }
  };
  if (authed && typeof ws.subscribe === 'function') {
    try {
      ws.subscribe('world');
      const p = ws.pid != null ? players.get(ws.pid) : null;
      if (p && p.region) ws.subscribe('region:' + p.region);
    } catch (_) { }
  }

  // Джиттер начального пинга разносит 5000 сокетов по 15-секундному окну без залповых спайков TCP
  sessions.set(ws, { lastPong: Date.now(), lastPing: Date.now() - Math.floor(Math.random() * 15000) });
  // Без этого слушателя любой битый фрейм роняет весь процесс (ws эмитит 'error' на сокет).
  ws.on('error', (e) => {
    console.error('[ws] socket error:', e && e.message);
    try { ws.terminate(); } catch (_) { }
  });
  ws.on('pong', () => {
    const s = sessions.get(ws);
    if (s) s.lastPong = Date.now();
  });
  ws.on('message', async (raw) => {
    try {
      const now = Date.now();
      // VULN-DDOS-02: Защита от флуда до парсинга JSON (единые пороги с Gateway из security-config)
      const softLimit = SEC.MAX_PACKETS_PER_SEC_SOFT || 120;
      const hardLimit = SEC.MAX_PACKETS_PER_SEC_HARD || 180;
      if (!ws._msgRate || now > ws._msgRate.resetAt) {
        ws._msgRate = { count: 1, resetAt: now + 1000 };
      } else {
        ws._msgRate.count++;
        if (ws._msgRate.count > hardLimit) {
          try { ws.close(4029, 'rate limit exceeded'); } catch (_) {
            try { ws.terminate(); } catch (_) { }
          }
          return;
        } else if (ws._msgRate.count > softLimit) {
          return; // Отсекаем избыточные сообщения без синхронного JSON.parse
        }
      }

      if (!authed) {
        ws._unauthMsgs = (ws._unauthMsgs || 0) + 1;
        if (ws._unauthMsgs > 5) {
          try { ws.close(4001, 'too many unauth messages'); } catch (_) {
            try { ws.terminate(); } catch (_) { }
          }
          return;
        }
      }

      const s = sessions.get(ws);
      if (s) s.lastPong = now;
      netStats.packetsIn++;
      netStats.bytesIn += raw && raw.length != null ? raw.length : Buffer.byteLength(String(raw));

      if (!authed && (ws.isAuthed || (ws.pid != null && players.has(ws.pid)))) {
        authed = true;
        if (lt) { clearTimeout(lt); lt = null; }
      }

      // Fast-path: Zero-Copy бинарный пакет (0x02 = MOVE)
      if (Buffer.isBuffer(raw) && raw.length > 0 && raw[0] === NPB.OP_MOVE) {
        if (!authed) return ws.close(4001, 'login first');
        const p = players.get(ws.pid);
        if (p) {
          p.binaryProto = true;
          const decoded = NPB.decodeMove(raw);
          if (decoded) {
            handle(p, decoded);
            return;
          }
        }
        return;
      }

      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return ws.close(4000, 'bad json'); }
      // 'null', массивы, числа — валидный JSON, но не сообщение. Без этой проверки msg.t роняет процесс.
      if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') {
        return ws.close(4000, 'bad msg');
      }
      if (!authed) {
        if (msg.t !== 'login') return ws.close(4001, 'login first');
        // authed выставляется ДО await: иначе несколько login в одном TCP-сегменте
        // создают несколько Player на один сокет (зомби-игроки навсегда).
        authed = true;
        if (lt) { clearTimeout(lt); lt = null; }
        try { await doLogin(ws, msg); } catch (loginErr) { authed = false; throw loginErr; }
        return;
      }
      const p = players.get(ws.pid); if (p) handle(p, msg);
    } catch (e) {
      console.error('[ws] message handler:', e && e.stack || e);
      try { ws.close(1011, 'internal error'); } catch (_) { }
    }
  });
  ws.on('close', async () => {
    if (ws._handedOff) {
      sessions.delete(ws);
      return;
    }
    await disconnectManager.handleSocketClose(ws, sessions);
  });
}
if (!IS_CLUSTER && wss && typeof wss.on === 'function') {
  wss.on('connection', (ws) => setupSocketConnection(ws, false));
}

const pingTimer = setInterval(() => {
  const now = Date.now();
  for (const [ws, s] of sessions) {
    const bufAmount = ws.bufferedAmount || 0;
    if (bufAmount > 1048576) {
      console.warn('[ws] session buffer backpressure exceeded 1MB, dropping slow reader:', ws.pid);
      const deadPid = ws.pid;
      const deadConnId = ws.connId;
      try { ws.close(4028, 'backpressure buffer overflow'); } catch (_) {
        try { ws.terminate(); } catch (_) { }
      }
      sessions.delete(ws);
      if (deadConnId != null) proxySockets.delete(deadConnId);
      if (deadPid != null) disconnectManager.handlePlayerDisconnect(deadPid).catch(() => { });
      continue;
    }
    if (now - s.lastPong > 60000) {
      console.warn('[ws] session timed out (no pong/message for 60s):', ws.pid);
      const deadPid = ws.pid;
      const deadConnId = ws.connId;
      try { ws.close(4001, 'session timeout'); } catch (_) {
        try { ws.terminate(); } catch (_) { }
      }
      sessions.delete(ws);
      if (deadConnId != null) proxySockets.delete(deadConnId);
      if (deadPid != null) disconnectManager.handlePlayerDisconnect(deadPid).catch(() => { });
    } else if (now - (s.lastPing || 0) >= 8000) {
      s.lastPing = now;
      try { ws.ping(); } catch (_) { }
    }
  }
}, 2500);

// Автономный сборщик зомби-игроков: гарантирует очистку потерянных сессий
const zombiePlayerSweeper = setInterval(() => {
  try {
    sweepZombiePlayers({ players, wsByPid, sessions, detachPlayer });
  } catch (_) { }
}, 10000);
function startTickLoop() {
  if (_tickTimeout) return;
  _nextTickTimeNs = process.hrtime.bigint() + TICK_NS;
  lastTickAt = Date.now();
  _tickTimeout = setTimeout(tick, Math.round(TICK_MS));
}
function stopTickLoop() {
  if (_tickTimeout) {
    clearTimeout(_tickTimeout);
    _tickTimeout = null;
  }
}
const tickTimer = {
  unref: () => { if (_tickTimeout) _tickTimeout.unref(); },
  ref: () => { if (_tickTimeout) _tickTimeout.ref(); }
};

let shuttingDown = false;

// ---- Отказоустойчивость процесса ----
// Без этих обработчиков одно исключение в колбэке или один отказ промиса
// убивают процесс со всеми игроками (Node 22 завершает и на unhandledRejection).
process.on('uncaughtException', (e) => {
  const errStr = '[fatal] uncaughtException: ' + (e && (e.stack || e.message) || e) + '\n';
  try { fs.writeSync(2, errStr); } catch (_) { }
  try { fs.appendFileSync(path.join(__dirname, 'crash.log'), errStr); } catch (_) { }
  console.error(errStr);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (r) => {
  const errStr = '[fatal] unhandledRejection: ' + (r && (r.stack || r.message) || r) + '\n';
  try { fs.writeSync(2, errStr); } catch (_) { }
  try { fs.appendFileSync(path.join(__dirname, 'crash.log'), errStr); } catch (_) { }
  console.error(errStr);
  shutdown('unhandledRejection');
});

// ---- Graceful shutdown ----
// Render присылает SIGTERM при каждом редеплое. Без этого до 30 с прогресса
// (автосейв SAVE_EVERY) теряется у всех, кто в игре.
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[server] ' + sig + ': сохраняю профили (' + players.size + ')...');
  stopTickLoop();
  if (typeof tickTimer !== 'undefined' && typeof clearInterval === 'function') {
    try { clearInterval(tickTimer); } catch (_) { }
  }
  clearInterval(saveTimer);
  clearInterval(pingTimer);
  clearInterval(zombiePlayerSweeper);
  cancelAllRespawns();
  flushDirtyProfiles();
  const jobs = [];
  const batch = [];
  for (const [, p] of players) {
    if (p && (!p.yid || !isSyntheticBot(p.yid))) {
      try {
        const pr = profileOf(p);
        lbTouch(p.yid, pr, p.charId);
        batch.push({ yid: p.yid, data: pr, charId: p.charId });
      } catch (e) { console.error('[DB] shutdown save prep', p.yid, e && e.message); }
    }
  }
  for (const item of saveRetry.drain()) batch.push(item); // последняя попытка (устаревшие отсечёт saveRev)
  if (batch.length > 0) {
    if (typeof DB.saveBatch === 'function') {
      jobs.push(Promise.resolve(DB.saveBatch(batch)).catch(e => console.error('[DB] shutdown saveBatch', e && e.message)));
    } else {
      for (const item of batch) {
        jobs.push(Promise.resolve(DB.save(item.yid, item.data, item.charId)).catch(e => console.error('[DB] shutdown save', item.yid, e && e.message)));
      }
    }
  }
  try { await Promise.all(jobs); } catch (_) { }
  // Дождаться и тех записей, что уже стояли в очереди DB (автосейв мог начать
  // писать в тот же момент): без flush процесс мог выйти на середине rename.
  if (typeof DB.flush === 'function') { try { await DB.flush(); } catch (_) { } }
  if (typeof Clans.flush === 'function') { try { await Clans.flush(); } catch (_) { } }
  if (typeof Mod.flush === 'function') { try { await Mod.flush(); } catch (_) { } }
  if (!IS_CLUSTER && typeof PlayerDb.save === 'function') { try { await PlayerDb.save(); } catch (_) { } }
  if (typeof DB.close === 'function') { try { await DB.close(); } catch (_) { } }
  if (wss && wss.clients) {
    for (const client of wss.clients) { try { client.close(1012, 'server restart'); } catch (_) { } }
  }
  console.log('[server] профили сохранены, завершаюсь.');
  // C-11: ненулевой код при фатальных ошибках — иначе cluster-manager (code === 0) не перезапускает воркер
  const code = (sig === 'unhandledRejection') ? 1 : (sig === 'uncaughtException' ? 1 : 0);
  if (netTransport && typeof netTransport.close === 'function') {
    netTransport.close(() => process.exit(code));
  } else {
    server.close(() => process.exit(code));
  }
  setTimeout(() => process.exit(code), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Валидация базы данных для продакшена (PostgreSQL обязателен при NODE_ENV=production или STRICT_POSTGRES=1)
try {
  if (typeof DB.assertProductionDatabase === 'function') {
    DB.assertProductionDatabase();
  }
} catch (e) {
  console.error('[DB] ' + e.message);
  process.exit(1);
}

// Инициализируем схему БД и реестры строго ДО запуска игрового цикла и открытия сетевого порта
try { Mod.load(); } catch (e) { console.error('[mod] load', e && e.message); }
try { if (typeof Mod.pruneOldLogs === 'function') Mod.pruneOldLogs(); } catch (_) { }
const dbSchemaReady = (typeof DB.init === 'function' ? Promise.resolve().then(() => DB.init()) : Promise.resolve());

async function bootstrapServer() {
  try {
    await dbSchemaReady;
  } catch (e) {
    console.error('[DB] init перед загрузкой реестров:', e && e.message);
    if (DB.MODE === 'postgres') {
      process.exit(1);
      return;
    }
  }

  const initTasks = [];
  try {
    if (typeof Clans.loadAllAsync === 'function' && DB.MODE === 'postgres') {
      initTasks.push(Clans.loadAllAsync().catch(e => console.error('[clans] loadAllAsync', e && e.message)));
    } else {
      Clans.loadAll();
    }
  } catch (e) { console.error('[clans] loadAll', e && e.message); }

  if (typeof PlayerDb.init === 'function') {
    initTasks.push(
      Promise.resolve().then(() => PlayerDb.init())
        .then(r => console.log('[PlayerDB] indexed characters:', r && r.count))
        .catch(e => console.error('[PlayerDB] init', e && e.message))
    );
  }
  if (typeof AccountKeys.init === 'function') {
    initTasks.push(
      Promise.resolve().then(() => AccountKeys.init())
        .then(r => console.log('[AccountKeys] loaded bindings:', r && r.count, r && r.ok === false ? ('(ОШИБКА: ' + r.error + ', запись реестра заблокирована)') : ''))
        .catch(e => console.error('[AccountKeys] init', e && e.message))
    );
  }

  await Promise.all(initTasks);
  startTickLoop();
  loadLeaderboardIndex();

  if (!IS_CLUSTER) {
    const onListenSuccess = () => {
      console.log('[server] запущен на порту ' + PORT + ' (' + BIND_HOST + ')');
      console.log('============================================================');
      console.log('  PROJECT STEAM: ORIGINS — MMO CORE (Audits 23-27 Architecture)');
      console.log('  Сетевой хост: ' + BIND_HOST + ' | Порт: ' + PORT + ' | Runtime: Node.js V8 + C++ SIMD & Worker Threads');
      console.log('  ⚡ [L2] Tick-LOD Engine: 0.33Hz sleep / 2Hz idle / 10Hz combat');
      console.log('  ⚡ [L3] DoD EntityTransformTable: 4096 слотов (Zero-GC)');
      console.log('  ⚡ [L4] Native Spatial Grid: ' + (nativeSpatialGrid ? 'C++ AVX2 SIMD АКТИВЕН' : 'JS Fallback'));
      console.log('  ⚡ [L5] Worker Threads Offload: ' + (persistenceClient && persistenceClient.worker ? (persistenceClient.workers && persistenceClient.workers.length > 1 ? `${persistenceClient.workers.length}x vCPU Workers АКТИВНЫ (vCPU 2+3)` : 'vCPU 2 АКТИВЕН') : 'Inline Fallback'));
      console.log('  ⚡ [L6] Native Combat Math: ' + (L2 && L2.nativeCombat ? 'C++ SIMD АКТИВЕН (35x Fast-Path)' : 'JS Fallback'));
      console.log('  ⚡ [NET] Transport: ' + (netTransport && NetTransport.hasUws ? 'uWebSockets.js C++ Zero-GC [ACTIVE]' : 'WARNING: ws legacy (NON-PROD)'));
      console.log('============================================================');
    };

    if (netTransport && typeof netTransport.listen === 'function') {
      netTransport.listen(PORT, BIND_HOST, (err) => {
        if (err) {
          console.error('[server] FATAL: Сбой запуска сетевого транспорта:', err && err.message);
          process.exit(1);
        }
        onListenSuccess();
      });
    } else {
      server.listen(PORT, BIND_HOST, 8192, onListenSuccess);
    }
  } else {
    console.log(`[server] Zone Worker #${CURRENT_WORKER_ID} ready (spots: ${SERVER_SPOTS.length})`);
  }
}

bootstrapServer();

// ============================================================
//  ИНТЕРАКТИВНАЯ КОНСОЛЬ АДМИНИСТРАТОРА В ТЕРМИНАЛЕ СЕРВЕРА
// ============================================================
const consoleCommands = createConsoleCommands({
  IS_CLUSTER,
  players,
  mobs,
  wsByPid,
  PlayerDb,
  sanitizeCharName,
  findPlayerByName,
  resolveAuraType,
  cosmeticsPublic,
  saveProfileNow,
  send,
  sendJson,
  broadcastAOI,
  broadcastWorld,
  detachPlayer
});
const { setupConsoleCommands, handleConsoleCommand } = consoleCommands;
setupConsoleCommands();
