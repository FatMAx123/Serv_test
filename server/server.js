// SERVER / SERVER.JS — авторитетный MMO-сервер. Клиент шлёт только намерения.
'use strict';
try { require('./secrets-loader.js'); } catch (_) {}
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
const elHistogram = typeof monitorEventLoopDelay === 'function' ? monitorEventLoopDelay({ resolution: 10 }) : null;
if (elHistogram) elHistogram.enable();
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
try { ({ defaultClient: persistenceClient } = require('./workers/persistence-client.js')); } catch (_) {}
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
const { createDisconnectManager } = require('./session/disconnect-manager.js');
const { createSessionManager } = require('./session/session-manager.js');
const { createBuffManager } = require('./combat/buff-manager.js');
const { createCombatResolver } = require('./combat/combat-resolver.js');
const { createSkillCaster } = require('./combat/skill-caster.js');
const { createCombatHandler } = require('./handlers/combat-handler.js');
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
  MSG_SESSION_RESTORE
} = require('./ipc-hub.js');
const CURRENT_WORKER_ID = parseInt(process.env.WORKER_ID || '1', 10);
const TOTAL_WORKERS = parseInt(process.env.TOTAL_WORKERS || '1', 10);
const IS_CLUSTER = process.env.IS_CLUSTER_WORKER === '1';
try {
  process.title = IS_CLUSTER ? `mmo-zone-worker-${CURRENT_WORKER_ID}` : 'mmo-monolith';
} catch (_) {}
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
const CLAN_HELP_R = 26;
const CLAN_HELP_R2 = CLAN_HELP_R * CLAN_HELP_R;
// C1-like raid: пачка аддов, не ковёр. Енрейдж — давление на соло.
const RAID_ADD_CAP = 4;
// C1 party EXP range ~1500. 40 L2 = 3.5 м → ≈ 131 м.
const PARTY_EXP_R = 130;
const PARTY_EXP_R2 = PARTY_EXP_R * PARTY_EXP_R;
// C1 invite/trade: рядом, не через остров. ~600 L2 → ≈ 50 м.
const PARTY_INVITE_R = 50;
const PARTY_INVITE_R2 = PARTY_INVITE_R * PARTY_INVITE_R;
const MAGIC_RANGE_DEFAULT = 30;
const MAGIC_EFFECT_RANGE_DEFAULT = 55;
// L2-like default outdoor respawn (сек); точное значение — mobStats / уровень
const MOB_RESPAWN_DEFAULT = 50;
const SPOT_LOAD_R = 115;
const SPOT_LOAD_R2 = SPOT_LOAD_R * SPOT_LOAD_R;
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
  TICK_MS
});
const DAY_LENGTH_SEC = worldTimeHandler.DAY_LENGTH_SEC;
function worldTimePayload() { return worldTimeHandler.worldTimePayload(); }
function wtSafe() { return worldTimeHandler.wtSafe(); }
function broadcastTime(forcePhase) { return worldTimeHandler.broadcastTime(forcePhase); }
function setWorldHour(hour) { return worldTimeHandler.setWorldHour(hour); }
function tickDayNight() { return worldTimeHandler.tickDayNight(); }
const YANDEX_SECRET = process.env.YANDEX_APP_SECRET || '';
// Валидация подсистемы аутентификации в продакшене (YANDEX_APP_SECRET обязателен)
try {
  AUTH.assertProductionAuth();
} catch (err) {
  console.error('[fatal] ' + err.message);
  process.exit(1);
}
const DEBUG_EVENTS = (process.env.DEBUG_EVENTS || '1') === '1';
const RATE = { move:20, attack:8, action:6, chat:2, pvp:4, skill:10, npc:12 };
const R2 = AOI_RADIUS * AOI_RADIUS;
const AOI_LEAVE_R2 = AOI_LEAVE_RADIUS * AOI_LEAVE_RADIUS;
const dist2 = (ax, az, bx, bz) => { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; };
const spatialGrid = new SpatialGrid(72);
const nativeSpatialGrid = typeof NativeSpatialGrid === 'function' ? new NativeSpatialGrid(-20480, -20480, 20480, 20480, 72) : null;
const _nativePBuf = new Int32Array(1024);
const _nativeMBuf = new Int32Array(1024);
const entityTransforms = new EntityTransformTable(8192);

const WORKER_ID_BASE = IS_CLUSTER ? (CURRENT_WORKER_ID * 100000000) : 0;
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
      mobs.delete(mid);
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
  try { clearTimeout(t); } catch (_) {}
  respawnTimers.delete(mid);
}
function cancelAllRespawns() {
  for (const [, rec] of respawnTimers) {
    const t = rec && (rec.timer || rec);
    try { if (t) clearTimeout(t); } catch (_) {}
  }
  respawnTimers.clear();
}
function cancelRespawnsForSpot(idx) {
  for (const [mid, rec] of [...respawnTimers]) {
    const si = rec && rec.spotIdx;
    if (si === idx) cancelRespawn(mid);
  }
}

// ---- Санитайзеры профиля / входящих данных ----
// JSON.parse('{"__proto__":{...}}') создаёт СОБСТВЕННОЕ свойство '__proto__',
// а Object.assign переносит его через [[Set]] и подменяет прототип цели.
// Плюс битый профиль (learned: 5) валил конструктор Player.
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function isBadKey(k) { return BAD_KEYS.has(String(k)); }
/** Плоская карта без прототипа: {id: number}. */
function safeCountMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const n = Math.floor(+src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}
/** Карта экипа без прототипа: {slot: {templateId, ...}}. */
function safeEquipMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const v = src[k];
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const item = Object.create(null);
    for (const ik of Object.keys(v)) {
      if (isBadKey(ik)) continue;
      item[ik] = v[ik];
    }
    out[k] = item;
  }
  return out;
}
/**
 * Белый список слотов экипировки (H9). Слот определяется только шаблоном.
 * ring/ring_l/ring_r → bracelet (в игре один слот браслетов).
 */
const EQUIP_SLOTS = new Set([
  'weapon', 'shield', 'chest', 'legs', 'head', 'gloves', 'boots',
  'necklace', 'bracelet', 'earring', 'title', 'costume'
]);
function equipSlotForTpl(tpl) {
  if (!tpl || typeof tpl !== 'object') return null;
  let s = String(tpl.slot || '').toLowerCase();
  if (s === 'ring' || s === 'ring_l' || s === 'ring_r') s = 'bracelet';
  if (!EQUIP_SLOTS.has(s)) return null;
  const type = String(tpl.type || '').toLowerCase();
  if (s === 'title' && type !== 'title') return null;
  if (s === 'costume' && type !== 'costume') return null;
  if (s === 'weapon' && type !== 'weapon') return null;
  return s;
}
/**
 * Привести экип профиля к белому списку: вещь не в своём слоте переносится
 * в правильный (если свободен) или возвращается в сумку с заточкой. Чинит
 * профили, где через старый баг H9 надето «второе оружие» и т.п.
 */
function sanitizeEquipSlots(p) {
  if (!p || !p.equip) return 0;
  let fixed = 0;
  for (const slot of Object.keys(p.equip)) {
    const piece = p.equip[slot];
    const tid = piece && String(piece.templateId || piece.id || '').toLowerCase();
    if (!tid || isBadKey(tid)) { delete p.equip[slot]; fixed++; continue; }
    const tpl = ITEMS.get(tid);
    if (!tpl) continue; // неизвестный шаблон не трогаем (статов не даёт)
    const want = equipSlotForTpl(tpl);
    if (want === slot) continue;
    fixed++;
    delete p.equip[slot];
    if (want && !p.equip[want]) { p.equip[want] = piece; continue; }
    const had = (p.inv[tid] | 0);
    p.inv[tid] = had + 1;
    const pl = (piece.plus | 0) || 0;
    if (pl > 0 && had === 0) p.plusById[tid] = pl;
    else if (had > 0 && (p.plusById[tid] | 0) < pl) p.plusById[tid] = pl; // не теряем лучшую заточку
  }
  if (fixed) console.warn('[equip] профиль', p.yid, 'исправлено слотов:', fixed);
  return fixed;
}
/** Карта скиллов без прототипа: {skillId: rank}. */
function safeSkillMap(src) {
  const out = Object.create(null);
  if (!src || typeof src !== 'object') return out;
  for (const k of Object.keys(src)) {
    if (isBadKey(k)) continue;
    const n = Math.floor(+src[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}
/**
 * Список друзей: [{yid, name}]. Ключ — yid, а не имя: имя может измениться, а
 * дружба должна остаться. Имя кэшируем, чтобы показывать оффлайновых.
 */
const MAX_FRIENDS = 64;
function safeFriendList(src) {
  const out = [];
  if (!Array.isArray(src)) return out;
  const seen = new Set();
  for (const raw of src) {
    if (out.length >= MAX_FRIENDS) break;
    if (!raw) continue;
    const yid = String(raw.yid == null ? raw : raw.yid).slice(0, 64);
    if (!yid || isBadKey(yid) || seen.has(yid)) continue;
    seen.add(yid);
    out.push({ yid: yid, name: sanitizeCharName(raw.name) || yid.slice(0, 16) });
  }
  return out;
}
function safeNum(v, def, min, max) {
  // null/undefined/'' — «поля нет», иначе +null === 0 подменял бы дефолт нулём
  // (профиль с z:null спавнил игрока в (x,0) вместо деревни).
  if (v == null || v === '') return def;
  const n = +v;
  if (!Number.isFinite(n)) return def;
  if (min != null && n < min) return min;
  if (max != null && n > max) return max;
  return n;
}
/** Безопасный доступ к справочнику: TABLE['constructor'] возвращал функцию. */
function tableGet(table, key) {
  if (!table || key == null) return undefined;
  const k = String(key);
  if (isBadKey(k)) return undefined;
  return Object.prototype.hasOwnProperty.call(table, k) ? table[k] : undefined;
}

/** Имя персонажа: 2–16, буквы/цифры/подчёркивание/дефис/пробел (CS.validateCreate).
 *  Раньше имя из пакета писалось как есть: 5000 символов с HTML попадали в
 *  профиль, в AOI-снапшот и в /api/leaderboard — заряженный stored XSS на любой
 *  будущий innerHTML с именем. Возвращает null, если починить нельзя. */
const NAME_RE = /^[\w\u0400-\u04FF\- ]+$/;
function sanitizeCharName(raw) {
  if (typeof raw !== 'string') return null;
  // NBSP и управляющие символы → пробел, схлопнуть кратные пробелы
  let s = raw.replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028-\u202f\u3000]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim().slice(0, 16);
  if (s.length < 2) return null;
  if (!NAME_RE.test(s)) return null;
  if (CS && typeof CS.isReservedCharName === 'function' && CS.isReservedCharName(s)) return null;
  return s;
}

// ============================================================
//  ДОМЕННАЯ МОДЕЛЬ PLAYER (Декомпозиция Фаза 2 / core/player.js)
//  Инкапсулирует: class Player, боевые характеристики, экипировку,
//  приборы инженера, пассивки, баффы, дебаффы, вес и формулы L2 C1.
// ============================================================
const playerCore = require('./core/player.js');
const {
  Player,
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

function playerWeightState(p) {
  // WR.totalLoad, noRegen, canAttack thresholds - delegated to core/player.js
  return playerCore.playerWeightState(p);
}

function applyPlayerBuff(p, buff, now) {
  // BR.apply delegating to core/player.js
  return playerCore.applyPlayerBuff(p, buff, now);
}

function pushEffects(p) {
  invalidateCombatPack(p);
  send(p, effectsPayload(p));
}

function pushWeight(p) {
  send(p, Object.assign({ t: 'weight' }, weightPayload(p)));
}

function failWeight(p, t, extra) {
  const st = playerWeightState(p);
  send(p, Object.assign({ t: t || 'loot_fail', reason: 'weight', weight: st.load, maxWeight: st.max }, extra || {}));
}

function applyPlayerDebuff(p, deb, now) {
  return playerCore.applyPlayerDebuff(p, deb, now, cancelPlayerCast);
}
// ---- СИСТЕМА МОБОВ, АГРО, СКИЛЛОВ И СИМУЛЯЦИИ МИРА (L2-like) ----
const { createMobHandler } = require('./handlers/mob-handler');
const mobHandler = createMobHandler({
  mobs,
  players,
  spatialGrid,
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
  losGround: (ax, az, bx, bz) => losGround(ax, az, bx, bz),
  onPlayerHit: (p, dmg) => onPlayerHit(p, dmg),
  onPlayerDeath: (p, opts) => onPlayerDeath(p, opts),
  applyPlayerDebuff: (p, deb, now) => applyPlayerDebuff(p, deb, now),
  pushEffects: (p) => pushEffects(p),
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
// SEC: префиксы ботов отключают античит (clampSpeed) — признаём их только в режиме стресс-теста.
const SYNTHETIC_BOTS_ALLOWED = process.env.STRESS_TEST === '1' || Boolean(process.env.STRESS_SECRET) || SEC.insecureDev();
function isSyntheticBot(yid) {
  if (!yid || !SYNTHETIC_BOTS_ALLOWED) return false;
  const s = String(yid);
  return s.startsWith('stress_bot_') || s.startsWith('bot_uniq_') || s.startsWith('bot3k_');
}

const _dirtyProfiles = new Map(); // key = `${p.yid}:${p.charId || 'c0'}` -> p

/**
 * Пометить профиль игрока как изменённый (Write-Behind Dirty Cache).
 * Изменения накапливаются в памяти и сбрасываются фоновым батчем раз в 30 секунд,
 * не блокируя Event Loop и дисковый поток на каждом тике.
 */
function markProfileDirty(p) {
  if (!p || !p.yid) return;
  if (isSyntheticBot(p.yid)) return;
  const key = p._profileKey || (p._profileKey = p.yid + ':' + (p.charId || 'c0'));
  _dirtyProfiles.set(key, p);
}

/** Немедленный сейв профиля (level-up / скиллы / профессия / заточка / сделка / дисконнект).
 *  Снимает профиль из очереди dirtyProfiles и сразу отправляет в DB.save. */
function saveProfileNow(p) {
  if (!p) return;
  if (p.yid && isSyntheticBot(p.yid)) return;
  const key = p._profileKey || (p._profileKey = p.yid + ':' + (p.charId || 'c0'));
  _dirtyProfiles.delete(key);
  try {
    const pr = profileOf(p);
    lbTouch(p.yid, pr, p.charId);
    const r = DB.save(p.yid, pr, p.charId);
    if (r && typeof r.catch === 'function') r.catch(e => console.error('[DB] save', p.yid, e && e.message));
  } catch (e) { console.error('[DB] save', p.yid, e && e.message); }
}

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
    if (!p) continue;
    if (p.yid && isSyntheticBot(p.yid)) continue;
    try {
      const pr = profileOf(p);
      lbTouch(p.yid, pr, p.charId);
      batch.push({ yid: p.yid, data: pr, charId: p.charId });
    } catch (e) { console.error('[DB] flushDirtyProfiles prep', p.yid, e && e.message); }
  }
  if (batch.length > 0) {
    if (typeof DB.saveBatch === 'function') {
      const r = DB.saveBatch(batch);
      if (r && typeof r.catch === 'function') r.catch(e => console.error('[DB] saveBatch error:', e && e.message));
    } else {
      for (const item of batch) {
        const r = DB.save(item.yid, item.data, item.charId);
        if (r && typeof r.catch === 'function') r.catch(e => console.error('[DB] save', item.yid, e && e.message));
      }
    }
  }
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
const lbIndex = new Map(); // profileKey(yid, charId) -> { name, level, exp, score }
let lbIndexReady = false;
const lbScoreOf = (level, exp) => (Number(level) || 1) * 1000 + (Number(exp) || 0);

function lbTouch(yid, pr, charId) {
  if (!yid || !pr) return;
  const key = CH.profileKey(yid, charId || pr.charId);
  lbIndex.set(key, {
    name: pr.name || String(yid),
    level: pr.level || 1,
    exp: pr.exp || 0,
    score: lbScoreOf(pr.level, pr.exp)
  });
  lbCache = null;
}

function lbDrop(yid, charId) {
  if (!yid) return;
  lbIndex.delete(CH.profileKey(yid, charId));
  lbCache = null;
}

async function loadLeaderboardIndex() {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    const files = (await fs.promises.readdir(dataDir).catch(() => []))
      .filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = await fs.promises.readFile(path.join(dataDir, f), 'utf8');
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') continue;
        const parsed = CH.parseProfileStem(f.replace(/\.json$/i, ''));
        lbTouch(parsed.yid, d, parsed.charId);
      } catch (e) { /* skip bad file */ }
    }
  } catch (e) { /* ignore */ }
  lbIndexReady = true;
  lbCache = null;
  console.log('[server] leaderboard index: ' + lbIndex.size + ' профилей');
}

let lbCache = null;
let lbCacheAt = 0;
const LB_TTL_MS = 15000;

function buildLeaderboard(limit) {
  limit = limit || 20;
  const now = Date.now();
  if (lbCache && lbCache.limit === limit && now - lbCacheAt < LB_TTL_MS) return lbCache.rows;

  const byKey = new Map();
  // сохранённые профили из индекса (диск не читаем)
  for (const [key, r] of lbIndex) {
    byKey.set(key, { name: r.name, level: r.level, exp: r.exp, score: r.score, online: false });
  }
  // онлайн — приоритет, всегда свежие значения
  for (const [, p] of players) {
    const key = CH.profileKey(p.yid || p.name || p.pid, p.charId);
    byKey.set(key, {
      name: p.name || 'Operator',
      level: p.level || 1,
      exp: p.exp || 0,
      score: lbScoreOf(p.level, p.exp),
      online: true
    });
  }

  const rows = [...byKey.values()]
    .sort((a, b) => b.score - a.score || b.level - a.level || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit)
    .map(r => ({ name: r.name, level: r.level, score: r.score, online: !!r.online }));
  lbCache = { limit, rows };
  lbCacheAt = now;
  return rows;
}

function sendJson(ws, o) {
  if (!ws || ws.readyState !== 1) return;
  // Если сокет забит неотправленными данными (>512 КБ), не переполняем очередь Node.js
  if (ws.bufferedAmount > 524288) return;
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
    const payload = isBin ? o : (typeof o === 'string' ? o : JSON.stringify(o));
    outgoingIpcBatch.push({
      connId: null,
      pid: pid,
      data: payload,
      isBinary: !!isBin
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
    } catch (_) {}
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

// ─── Ground loot (server authority) ───
function lootPayload(L) {
  const payload = {
    t: 'loot_spawn',
    lid: L.lid,
    x: L.x,
    z: L.z,
    itemId: L.itemId,
    count: L.count,
    name: itemDisplayName(L.itemId),
    ownerPid: L.ownerPid,
    ownerPartyId: L.ownerPartyId || null,
    winnerPid: L.winnerPid != null ? L.winnerPid : null,
    protectUntil: L.protectUntil,
    expireAt: L.expireAt,
    spoil: !!L.spoil,
    mobId: L.mobId || null
  };
  if ((L.plus | 0) > 0) payload.plus = L.plus | 0;
  if (L.deathDrop) payload.deathDrop = true;
  return payload;
}

function itemDisplayName(itemId) {
  try {
    const it = tableGet(LR.LOOT_ITEMS, itemId);
    if (it && it.name) return it.name;
  } catch (e) { /* ignore */ }
  return itemId || '?';
}

/**
 * Кому достанется пачка лута в пати: random (по умолчанию),
 * finders, turn. Победитель фиксируется в момент падения.
 * @returns {number|null} pid победителя или null (нет пати — работает защита владельца)
 */
const PARTY_LOOT_MODES = new Set(['random', 'finders', 'turn']);
function pickLootWinner(pa, ownerPid) {
  if (!pa || pa.members.size <= 1) return null;
  const mode = pa.lootMode || 'random';
  const alive = [...pa.members].filter((id) => players.has(id));
  if (!alive.length) return null;
  if (mode === 'random') return alive[Math.floor(Math.random() * alive.length)];
  if (mode === 'turn') {
    // По кругу: индекс живёт в пати, поэтому очередь не сбрасывается на каждом мобе.
    pa.lootTurn = ((pa.lootTurn | 0) + 1) % alive.length;
    return alive[pa.lootTurn];
  }
  // finders: пачка принадлежит тому, кто убил, а не всей группе
  return ownerPid != null ? ownerPid : null;
}

function spawnGroundLoot(x, z, itemId, count, ownerPid, opts) {
  opts = opts || {};
  const n = Math.floor(+count) || 0;
  if (!itemId || n <= 0) return null;
  const ox = (Math.random() - 0.5) * 2.2;
  const oz = (Math.random() - 0.5) * 2.2;
  const now = Date.now();
  const L = {
    lid: nextLootId++,
    x: x + ox,
    z: z + oz,
    itemId: String(itemId),
    count: n,
    ownerPid: ownerPid != null ? ownerPid : null,
    ownerPartyId: opts.ownerPartyId != null ? opts.ownerPartyId : null,
    // Кому именно достанется пачка в режимах random / turn (иначе null).
    winnerPid: null,
    protectUntil: now + LOOT_PROTECT_SEC * 1000,
    expireAt: now + LOOT_LIFE_SEC * 1000,
    spoil: !!opts.spoil,
    mobId: opts.mobId || null,
    deathDrop: !!opts.deathDrop
  };
  if ((opts.plus | 0) > 0) L.plus = opts.plus | 0;
  if (L.ownerPid != null && !L.ownerPartyId && !opts.playerDrop) {
    const ow = players.get(L.ownerPid);
    if (ow && ow.partyId) {
      L.ownerPartyId = ow.partyId;
    }
  }
  groundLoot.set(L.lid, L);
  const payload = lootPayload(L);
  payload.name = itemDisplayName(L.itemId);
  // Always deliver to nearby players AND owner (byLid dedupes client-side)
  broadcastNear(L.x, L.z, payload);
  if (L.ownerPid != null) {
    const owner = players.get(L.ownerPid);
    if (owner) send(owner, payload);
  }
  return L;
}

/** Spawn rolled drop (adena + items) as separate ground piles. */
function spawnMobDropPiles(x, z, drop, ownerPid, opts) {
  opts = opts || {};
  const spawned = [];
  if (drop && drop.adena > 0) {
    const g = spawnGroundLoot(x, z, 'copper_parts', drop.adena, ownerPid, opts);
    if (g) spawned.push(g);
  }
  (drop && drop.items || []).forEach((it) => {
    if (!it || !it.id) return;
    const g = spawnGroundLoot(x, z, it.id, it.count, ownerPid, opts);
    if (g) spawned.push(g);
  });
  return spawned;
}

function grantLootToPlayer(p, itemId, count) {
  const n = Math.floor(+count) || 0;
  if (!itemId || n <= 0) return;
  p.inv[itemId] = (p.inv[itemId] || 0) + n;
}

function canPickupLoot(p, L) {
  if (!p || !L) return { ok: false, reason: 'gone' };
  if (dist2(p.x, p.z, L.x, L.z) > LOOT_PICKUP_R2) return { ok: false, reason: 'range' };
  const now = Date.now();
  if (L.expireAt <= now) return { ok: false, reason: 'expired' };

  if (now < L.protectUntil) {
    // Spoil: защищён строго за вскрывшим спойлером
    if (L.spoil) {
      if (L.ownerPid != null && L.ownerPid !== p.pid) {
        return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
      }
    } else {
      const owner = L.ownerPid != null ? players.get(L.ownerPid) : null;
      const partyId = L.ownerPartyId || (owner && owner.partyId) || null;
      if (partyId) {
        // Дроп группы: чужие игроки (не в пати) не могут подобрать во время защиты
        if (!p.partyId || p.partyId !== partyId) {
          return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
        }
        // В режиме finders пачка закреплена за убийцей
        const pa = parties.get(partyId);
        if (pa && pa.lootMode === 'finders' && L.ownerPid != null && L.ownerPid !== p.pid) {
          return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
        }
        // В каноне Lineage 2 (random и turn): любой сопартиец может поднять дроп с земли
        return { ok: true };
      } else {
        // Одиночный дроп — только сам владелец
        if (L.ownerPid != null && L.ownerPid !== p.pid) {
          return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
        }
      }
    }
  }

  return { ok: true };
}

function doLootPickup(p, lid) {
  if (p.dead || p.hp <= 0) return;
  lid = +lid;
  const L = groundLoot.get(lid);
  if (!L) {
    send(p, { t: 'loot_fail', lid, reason: 'gone' });
    return;
  }
  const chk = canPickupLoot(p, L);
  if (!chk.ok) {
    send(p, {
      t: 'loot_fail',
      lid,
      reason: chk.reason,
      protectUntil: chk.protectUntil || null
    });
    return;
  }

  const pa = p.partyId ? parties.get(p.partyId) : null;
  const isPartyDrop = pa && !L.playerDrop && (L.ownerPartyId === p.partyId || (L.ownerPid != null && pa.members.has(L.ownerPid)));

  // === СЛУЧАЙ 1: ВАЛЮТА В ГРУППЕ (деление поровну между всеми участниками в радиусе) ===
  if (isPartyDrop && L.itemId === 'copper_parts') {
    const nearby = [...pa.members]
      .map(id => players.get(id))
      .filter(m => m && !m.dead && (m.hp == null || m.hp > 0) && dist2(m.x, m.z, p.x, p.z) <= PARTY_EXP_R2);
    const eligible = nearby.length > 0 ? nearby : [p];

    if (eligible.length > 1) {
      const share = Math.floor(L.count / eligible.length);
      const remainder = L.count % eligible.length;

      groundLoot.delete(lid);
      broadcastNear(L.x, L.z, { t: 'loot_remove', lid });

      for (const m of eligible) {
        const amount = (m.pid === p.pid) ? (share + remainder) : share;
        if (amount > 0) {
          grantLootToPlayer(m, 'copper_parts', amount);
          saveProfileNow(m);
          pushWeight(m);
        }
        if (m.pid === p.pid) {
          send(m, {
            t: 'loot_pickup_ok',
            lid,
            itemId: 'copper_parts',
            count: amount,
            totalCount: L.count,
            partyShare: true,
            inv: m.inv,
            equip: m.equip || {},
            invPlus: m.plusById
          });
        } else {
          send(m, {
            t: 'party_currency_share',
            itemId: 'copper_parts',
            count: amount,
            totalCount: L.count,
            pickerName: p.name,
            inv: m.inv,
            equip: m.equip || {},
            invPlus: m.plusById
          });
        }
      }
      return;
    }
  }

  // === СЛУЧАЙ 2: ПРЕДМЕТЫ В ГРУППЕ (Случайно / По очереди / Нашедшему) ===
  let recipient = p;
  if (isPartyDrop && !L.spoil) {
    const nearby = [...pa.members]
      .map(id => players.get(id))
      .filter(m => m && !m.dead && (m.hp == null || m.hp > 0) && dist2(m.x, m.z, p.x, p.z) <= PARTY_EXP_R2);
    const eligible = nearby.length > 0 ? nearby : [p];

    const mode = pa.lootMode || 'random';
    if (mode === 'random') {
      recipient = eligible[Math.floor(Math.random() * eligible.length)] || p;
    } else if (mode === 'turn') {
      pa.lootTurn = ((pa.lootTurn | 0) + 1) % eligible.length;
      recipient = eligible[pa.lootTurn] || p;
    } else {
      recipient = p;
    }
  }

  const carry = canCarryMore(recipient, L.itemId, L.count);
  if (!carry.ok) {
    send(p, {
      t: 'loot_fail', lid, reason: 'weight',
      weight: carry.load, maxWeight: carry.max
    });
    if (recipient.pid !== p.pid) {
      send(recipient, { t: 'msg', text: 'Слишком тяжело — вы не можете принять лут группы.' });
    }
    return;
  }
  const fit = NPCS.canFit(recipient.inv, L.itemId, L.count);
  if (!fit.ok) {
    send(p, {
      t: 'loot_fail', lid, reason: 'inv_full',
      need: fit.need, free: fit.free
    });
    if (recipient.pid !== p.pid) {
      send(recipient, { t: 'msg', text: 'Инвентарь полон — вы не можете принять лут группы.' });
    }
    return;
  }

  if ((L.plus | 0) > 0) {
    const fromCounts = Object.create(null);
    fromCounts[L.itemId] = L.count;
    const fromPlus = Object.create(null);
    fromPlus[L.itemId] = L.plus | 0;
    // надетые копии — отдельная ёмкость (H10), блокирует только сумка
    if (!plusMoveOk(fromCounts, fromPlus, recipient.inv, recipient.plusById, L.itemId, L.count, {})) {
      send(p, { t: 'loot_fail', lid, reason: 'enchanted' });
      return;
    }
  }

  grantLootToPlayer(recipient, L.itemId, L.count);
  if ((L.plus | 0) > 0) recipient.plusById[L.itemId] = L.plus | 0;
  Object.keys(recipient.inv).forEach((k) => {
    if (!recipient.inv[k] || recipient.inv[k] <= 0) delete recipient.inv[k];
  });

  groundLoot.delete(lid);
  broadcastNear(L.x, L.z, { t: 'loot_remove', lid });

  if (recipient.pid === p.pid) {
    send(p, {
      t: 'loot_pickup_ok',
      lid,
      itemId: L.itemId,
      count: L.count,
      plus: L.plus | 0,
      spoil: !!L.spoil,
      inv: p.inv,
      equip: p.equip || {},
      invPlus: p.plusById
    });
  } else {
    send(p, {
      t: 'loot_pickup_ok',
      lid,
      itemId: L.itemId,
      count: L.count,
      plus: L.plus | 0,
      spoil: !!L.spoil,
      recipientName: recipient.name,
      inv: p.inv,
      equip: p.equip || {},
      invPlus: p.plusById
    });
    send(recipient, {
      t: 'party_loot_received',
      lid,
      itemId: L.itemId,
      count: L.count,
      plus: L.plus | 0,
      pickerName: p.name,
      inv: recipient.inv,
      equip: recipient.equip || {},
      invPlus: recipient.plusById
    });
  }

  if (isPartyDrop) {
    for (const memId of pa.members) {
      if (memId !== p.pid && memId !== recipient.pid) {
        sendPid(memId, {
          t: 'msg',
          text: `${p.name} подобрал ${itemDisplayName(L.itemId)} x${L.count} (получил ${recipient.name}).`
        });
      }
    }
  }

  questCollectChanged(recipient, L.itemId);
  saveProfileNow(recipient);
  pushWeight(recipient);
  if (p.pid !== recipient.pid) {
    saveProfileNow(p);
    pushWeight(p);
  }
}

function tickGroundLoot() {
  if (groundLoot.size === 0) return;
  const now = Date.now();
  for (const [lid, L] of groundLoot) {
    if (L.expireAt <= now) {
      groundLoot.delete(lid);
      broadcastNear(L.x, L.z, { t: 'loot_remove', lid, reason: 'expired' });
    }
  }
}

function sendNearbyLoot(p) {
  if (groundLoot.size === 0) return;
  const list = [];
  for (const [, L] of groundLoot) {
    if (dist2(p.x, p.z, L.x, L.z) <= LOOT_VIS_R2) list.push(lootPayload(L));
  }
  if (list.length) send(p, { t: 'loot_snapshot', loots: list });
}

/**
 * Lazy-спавн: только рядом с игроком (L2 streaming).
 * Полный спавн всего острова → 1000+ AI и фризы.
 */
// Spawn spots beyond AOI so packs exist before you see them (tighter = fewer live mobs)

function spawnSpot(sp, idx) {
  if (spawnedSpots.has(idx)) return;
  spawnedSpots.add(idx);

  // Полный диапазон зоны (zoneLvl) ИЛИ lvl спота — но НЕ схлопывать в 1
  let zoneLo = 1, zoneHi = 1;
  if (Array.isArray(sp.zoneLvl) && sp.zoneLvl.length >= 2) {
    zoneLo = Math.max(1, parseInt(sp.zoneLvl[0], 10) || 1);
    zoneHi = Math.max(zoneLo, parseInt(sp.zoneLvl[1], 10) || zoneLo);
  } else if (Array.isArray(sp.lvl) && sp.lvl.length >= 2) {
    zoneLo = Math.max(1, parseInt(sp.lvl[0], 10) || 1);
    zoneHi = Math.max(zoneLo, parseInt(sp.lvl[1], 10) || zoneLo);
  }

  // Если локус задаёт точный уровень [L,L] — используем его; иначе полный диапазон зоны
  let rollLo = zoneLo, rollHi = zoneHi;
  if (Array.isArray(sp.lvl) && sp.lvl.length >= 2) {
    const a = parseInt(sp.lvl[0], 10);
    const b = parseInt(sp.lvl[1], 10);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      rollLo = Math.max(zoneLo, Math.min(zoneHi, a));
      rollHi = Math.max(rollLo, Math.min(zoneHi, b));
    }
  }
  if (!(rollHi >= rollLo) || !Number.isFinite(rollLo)) {
    rollLo = zoneLo; rollHi = zoneHi;
  }

  const nCount = Math.max(1, Math.min(12, parseInt(sp.n, 10) || 1));
  // r в метрах (buildSpots: UV * W). L2 открытые просторные споты 28–48 м.
  const spotR = Math.max(15, typeof sp.r === 'number' ? sp.r : 34);
  for (let i = 0; i < nCount; i++) {
    const ang = Math.random() * Math.PI * 2;
    // sqrt → равномернее по площади круга
    const rad = Math.sqrt(Math.random()) * spotR;
    const x = sp.x + Math.cos(ang) * rad;
    const z = sp.z + Math.sin(ang) * rad;
    const lvl = G.rng(rollLo, rollHi);
    const isBoss = !!sp.boss;
    const bossDef = isBoss ? (G.BOSSES[sp.mob] || null) : null;
    let bossRespawn;
    let spawnLvl = lvl;
    if (isBoss) {
      bossRespawn = 12 * 3600;
      try {
        const tpl = MOB_DB && MOB_DB.get && MOB_DB.get(sp.mob);
        if (tpl && tpl.respawnSec != null) bossRespawn = tpl.respawnSec;
        if (tpl && tpl.level && tpl.level.length >= 2) {
          const bLo = tpl.level[0] | 0;
          const bHi = Math.max(bLo, tpl.level[1] | 0);
          spawnLvl = G.rng(bLo, bHi);
        }
      } catch (eBossTpl) { /* keep 12h / zone lvl */ }
    }
    // C1: пассив = учебная зона (max≤5) или тип (keltir/solo_passive).
    // Не «любой lvl≤5» — иначе волки Астарда 5–12 не агрят.
    const passive = !sp.dangerZone && (!!sp.passive || zoneHi <= 5);
    const m = new Mob(nextId++, sp.mob || 'scrapper', spawnLvl, x, z, bossDef, {
      passive: passive && !isBoss,
      boss: isBoss,
      respawnSec: isBoss ? bossRespawn : undefined,
      dangerZone: !!sp.dangerZone,
      huntZoneId: sp.huntZoneId || sp.region,
      zone: sp.zone || null
    });
    m.spotIdx = idx;
    m.huntZoneId = sp.huntZoneId || null;
    m.dangerZone = !!sp.dangerZone;
    m.level = Math.max(1, m.level | 0);
    applyChampionRoll(m);
    if (entityTransforms && m.transformSlot < 0) {
      m.transformSlot = entityTransforms.allocate(m.mid, 2 /* TYPE_MOB */, m.x, m.y, m.z, m.hp, m.maxHp, m.speed);
    }
    mobs.set(m.mid, m);
    if (isBoss) announceRaidSpawn(m);
  }
}

/** Мирность: статическая village ИЛИ синие territory (peace) из редактора. */
function isPeaceAt(x, z) {
  const r = WM.regionAt(x, z) || {};
  if (r.id === 'village') return true;
  if (r.kind === 'territory') return true; // Деревня/Порт/Гавань…
  if (r.peace && !r.hunt) return true;
  return false;
}

function zoneLabelAt(x, z) {
  const r = WM.regionAt(x, z) || {};
  const name = r.name || null;
  if (!name) return null;
  // Уровни — только у боевых hunt-зон (не у деревни / territory / wild)
  if (r.hunt) {
    const l0 = (r.levelRange && r.levelRange[0] != null) ? r.levelRange[0]
      : (r.lvl && r.lvl[0] != null) ? r.lvl[0] : null;
    const l1 = (r.levelRange && r.levelRange[1] != null) ? r.levelRange[1]
      : (r.lvl && r.lvl[1] != null) ? r.lvl[1] : null;
    const isDanger = MOB_DB && typeof MOB_DB.isDangerZone === 'function' && (MOB_DB.isDangerZone(r.id) || MOB_DB.isDangerZone(name));
    const groupBadge = (isDanger || r.mode === 'party') ? ' [Групповая]' : '';
    if (l0 != null && l1 != null) return name + ' (ур.' + l0 + '–' + l1 + ')' + groupBadge;
    return name + groupBadge;
  }
  return name;
}

/** Имя региона по id (для чата/событий, без raw hunt_…). */
function regionNameById(id) {
  if (!id) return null;
  try {
    if (WM && WM.buildRegions) {
      const list = WM.buildRegions();
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === id && list[i].name) return list[i].name;
      }
    }
  } catch (e) { /* ignore */ }
  if (id === 'village') return 'Деревня поющей стали';
  if (id === 'wild') return 'Остров поющей стали';
  return null;
}

function playerNear(x, z, r2, includeDead = false) {
  if (players.size === 0) return false;
  if (nativeSpatialGrid) {
    return nativeSpatialGrid.hasPlayerNear(x, z, Math.sqrt(r2), r2, includeDead);
  }
  if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
    if (typeof spatialGrid.hasPlayerNear === 'function') {
      const r = Math.sqrt(r2);
      return spatialGrid.hasPlayerNear(x, z, r, r2, includeDead);
    }
    const r = Math.sqrt(r2);
    let found = false;
    spatialGrid.forEachCandidate(x, z, r, (p) => {
      if (p && (includeDead || (!p.dead && (p.hp == null || p.hp > 0))) && dist2(p.x, p.z, x, z) <= r2) {
        found = true;
        return false;
      }
    }, null);
    return found;
  }
  for (const [, p] of players) {
    if (p && (includeDead || (!p.dead && (p.hp == null || p.hp > 0))) && dist2(p.x, p.z, x, z) <= r2) return true;
  }
  return false;
}

// mobInCombat delegated to mob-handler

function spotHasBossRespawn(idx) {
  for (const [, rec] of respawnTimers) {
    if (rec && rec.spotIdx === idx && rec.boss) return true;
  }
  return false;
}

function spotShouldKeep(idx, sp, spotMobs) {
  if (!sp) return false;
  if (playerNear(sp.x, sp.z, SPOT_UNLOAD_R2, true)) return true;
  if (spotHasBossRespawn(idx)) return true;
  if (spotMobs && spotMobs.length > 0) {
    for (let i = 0; i < spotMobs.length; i++) {
      const m = spotMobs[i];
      if (m.eventId) return true;
      if (m.boss && m.hp > 0) return true;
      if (mobInCombat(m)) return true;
      if (playerNear(m.x, m.z, SPOT_UNLOAD_R2, true)) return true;
    }
  }
  return false;
}

function despawnSpot(idx) {
  const doomed = [];
  for (const [, m] of mobs) {
    if (m.spotIdx !== idx) continue;
    if (m.eventId) continue;
    if (m.boss && m.hp > 0) continue;
    doomed.push(m);
  }
  for (let i = 0; i < doomed.length; i++) {
    cancelRespawn(doomed[i].mid);
    despawnMobSilent(doomed[i]);
  }
  cancelRespawnsForSpot(idx);
  spawnedSpots.delete(idx);
}

/** Выгрузка спотов дальше UNLOAD_R, если пачка не в бою и это не живой босс.
 *  Гистерезис LOAD 115 / UNLOAD 155 — стрим регионов без дребезга на границе. */
function unloadFarSpots() {
  if (!spawnedSpots.size) return;
  // Индексация мобов по спотам за 1 проход (O(M) вместо квадратичного O(S * M))
  const spotMobsMap = new Map();
  for (const [, m] of mobs) {
    if (m.spotIdx == null) continue;
    let arr = spotMobsMap.get(m.spotIdx);
    if (!arr) {
      arr = [];
      spotMobsMap.set(m.spotIdx, arr);
    }
    arr.push(m);
  }
  let dropped = 0;
  for (const idx of [...spawnedSpots]) {
    const sp = SERVER_SPOTS[idx];
    if (spotShouldKeep(idx, sp, spotMobsMap.get(idx))) continue;
    despawnSpot(idx);
    dropped++;
  }
  if (dropped > 0) {
    console.log('[server] unload', dropped, 'spots, live mobs:', mobs.size);
  }
}

/** Спавн только спотов в радиусе игрока. */
function ensureNearbyMobs(p) {
  if (!p) return;
  if (p.yid && isSyntheticBot(p.yid)) return; // Синтетические боты не активируют фоновый спавн мобов всего острова
  if (spawnedSpots.size >= SERVER_SPOTS.length) return;
  let spawnedNow = 0;
  SERVER_SPOTS.forEach((sp, idx) => {
    if (spawnedSpots.has(idx)) return;
    if (dist2(p.x, p.z, sp.x, sp.z) > SPOT_LOAD_R2) return;
    spawnSpot(sp, idx);
    spawnedNow++;
  });
  if (spawnedNow > 0) {
    console.log('[server] nearby spawn +' + spawnedNow + ' spots, live mobs:', mobs.size);
  }
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
  if (!isOtherBot) priority += 15000; // Живой игрок имеет приоритет видимости
  if (_aoiPartySet && _aoiPartySet.has(o.pid)) priority += 50000;
  if (_aoiTargetType === 'p' && _aoiTargetPid === o.pid) priority += 40000;
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
  if (_aoiTargetType === 'm' && _aoiTargetMid === m.mid) priority += 40000;
  if (m.targetPid === _aoiObsPid) priority += 30000;
  if (m.boss) priority += 25000;
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
    const res = nativeSpatialGrid.queryRadius(p.x, p.z, aoiRadius, _nativePBuf, _nativeMBuf);
    for (let i = 0; i < res.players; i++) {
      const pl = players.get(_nativePBuf[i]);
      if (pl) _aoiOnPlayer(pl);
    }
    for (let i = 0; i < res.mobs; i++) {
      const mb = mobs.get(_nativeMBuf[i]);
      if (mb) _aoiOnMob(mb);
    }
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
      return {
        t: 'p', pid: ghost.pid, name: ghost.name, x: NP.qCoord(ghost.x),
        y: ghost.y == null ? ghost.y : NP.qCoord(ghost.y), z: NP.qCoord(ghost.z),
        hp: NP.qHp(ghost.hp), maxHp: ghost.maxHp || 100, level: ghost.level || 1, cls: ghost.cls || 'operator',
        race: 'human', gender: 'male',
        appearance: null, equip: null,
        flagged: !!ghost.isFlagged, karma: ghost.karma || 0,
        dueling: false,
        title: null, titleName: null, titleColor: null,
        nameColor: null, aura: 'none',
        gm: false, accessLevel: 0,
        store: null, clanId: null, clanName: null, crestHash: null
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
    // Для живых игроков: если вошедшая сущность УЖЕ движется по вектору, немедленно
    // передаём move_vec_start, исключая стояние на месте и последующие рывки
    const ws = wsByPid.get(p.pid);
    if (ws && ws.readyState === 1) {
      for (let i = 0; i < aoi.enter.length; i++) {
        const ek = aoi.enter[i];
        if (ek.charCodeAt(0) === 112 /* 'p' */) {
          const targetP = players.get(fastIdFromKey(ek));
          if (targetP && targetP._moveVec) {
            const mv = targetP._moveVec;
            if (p.binaryProto) {
              const bin = NPB.encodeMoveVecStart(ek, mv.startX, mv.startZ, mv.targetX, mv.targetZ, mv.speed, mv.walking ? 1 : 0, mv.timestamp);
              sendBinary(ws, bin);
            } else {
              sendJson(ws, {
                t: 'move_vec_start',
                k: ek,
                startX: mv.startX,
                startZ: mv.startZ,
                targetX: mv.targetX,
                targetZ: mv.targetZ,
                speed: mv.speed,
                walking: !!mv.walking,
                timestamp: mv.timestamp
              });
            }
          }
        }
      }
    }
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
    p.hp = p.maxHp;
    p.energy = p.maxEnergy;
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
  dist2: (x1, z1, x2, z2) => dist2(x1, z1, x2, z2),
  losGround: (ax, az, bx, bz) => losGround(ax, az, bx, bz),
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
  cancelPlayerCast: (p, r) => cancelPlayerCast(p, r)
});

skillCaster = createSkillCaster({
  send: (p, msg) => send(p, msg),
  broadcastAOI: (origin, msg) => broadcastAOI(origin, msg),
  players,
  mobs,
  borderGhosts,
  IS_CLUSTER,
  spatialGrid,
  partyMembers: (p) => partyMembers(p),
  isGM: (p) => isGM(p),
  checkRate: (p, type) => checkRate(p, type),
  dist2: (x1, z1, x2, z2) => dist2(x1, z1, x2, z2),
  losGround: (ax, az, bx, bz) => losGround(ax, az, bx, bz),
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
  pushWeight,
  isPeaceAt
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
  pushCombatStats
});

const {
  npcForService,
  doShopOpen,
  doShopBuy,
  doShopSell,
  doTeleportList,
  doTeleport,
  doBuffList,
  doBuffBuy
} = npcServicesHandler;

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
  saveProfileNow,
  pushWeight
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
  getNextId: () => nextId++,
  onMobDeath: (p, m) => onMobDeath(p, m),
  pushWeight,
  players,
  resurrectPlayer: (tgt, caster) => (deathHandler && deathHandler.resurrectPlayer ? deathHandler.resurrectPlayer(tgt, caster) : false),
  clusterIpc: {
    broadcastAnnounce: (txt) => { if (clusterIpc) clusterIpc.broadcastAnnounce(txt); }
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
  checkRate
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
  notifyFriends
} = createSocialHandler({
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
  clusterIpc: {
    broadcastChat: (ch, name, txt, extra) => { if (clusterIpc) clusterIpc.broadcastChat(ch, name, txt, extra); },
    isPlayerOnline: (yid) => (clusterIpc ? clusterIpc.isPlayerOnline(yid) : false),
    getPlayer: (yid) => (clusterIpc ? clusterIpc.getPlayer(yid) : null)
  },
  onTellCrossCluster: (p, to, text) => {
    if (clusterIpc) {
      clusterIpc.sendWhisper(p.name, to, text);
      send(p, { t: 'chat', ch: 'tell', name: p.name, to: to, text: text, out: true });
    } else {
      send(p, { t: 'chat_fail', ch: 'tell', reason: 'offline', to: to });
    }
  }
});

function kickYid(yid, code, why) {
  const pid = pidByYid.get(yid);
  if (pid == null) return false;
  const p = players.get(pid);
  if (p) send(p, { t: 'kicked', reason: why || 'banned' });
  const ws = wsByPid.get(pid);
  if (ws) { try { ws.close(code || 4012, why || 'banned'); } catch (_) {} }
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
checkDbHealth().catch(() => {});

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
  clusterIpc: {
    isPlayerOnline: (yid) => (clusterIpc ? clusterIpc.isPlayerOnline(yid) : false),
    getPlayer: (yid) => (clusterIpc ? clusterIpc.getPlayer(yid) : null)
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
  pushWeight
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
  doClanWhTake
} = clanHandler;

// --- CLUSTER IPC & GATEWAY PROXY (Worker Side) ---
const EventEmitter = require('events');

class GatewaySocketProxy extends EventEmitter {
  constructor(connId, clientIp) {
    super();
    this.connId = connId;
    this.clientIp = clientIp || '';
    this.pid = null;
    this.readyState = 1; // 1 = OPEN
    this.bufferedAmount = 0;
    this.isProxy = true;
  }

  send(data, options) {
    if (this.readyState !== 1 || !clusterIpc) return;
    const isBin = (options && options.binary) || Buffer.isBuffer(data) || (data instanceof ArrayBuffer);
    netStats.packetsOut++;
    netStats.bytesOut += data && data.length != null ? data.length : Buffer.byteLength(String(data));
    let outData = isBin && !Buffer.isBuffer(data) ? Buffer.from(data) : data;
    let isBase64 = false;
    if (isBin && Buffer.isBuffer(outData)) {
      outData = outData.toString('base64');
      isBase64 = true;
    }
    outgoingIpcBatch.push({
      connId: this.connId,
      pid: this.pid,
      data: outData,
      isBinary: !!isBin,
      isBase64: isBase64
    });
    if (outgoingIpcBatch.length >= 250) {
      flushGatewayBatch();
    } else {
      scheduleBatchFlush();
    }
  }

  close(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    let c = code || 1000;
    if (c === 1005 || c === 1006) c = 4001;
    if (clusterIpc) {
      clusterIpc.sendToPrimary(MSG_GATEWAY_CLOSE, {
        connId: this.connId,
        code: c,
        reason: String(reason || '')
      });
    }
    // Обязательно эмитим 'close' на следующем тике, чтобы очистились player, spatialGrid и session
    process.nextTick(() => {
      this.emit('close', c, reason || '');
    });
  }

  ping() {
    this.send(JSON.stringify({ t: 'ping', time: Date.now() }));
  }

  terminate() {
    this.close(4001, 'terminated');
  }
}

function initiateClusterHandoff(p, targetWorkerId) {
  if (p._handoffInProgress) return;
  p._handoffInProgress = true;

  const ws = wsByPid.get(p.pid);
  const connId = ws ? ws.connId : null;
  const clientIp = (ws && ws.clientIp) || p.clientIp || '';

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
    lastPvpHitAt: p._lastPvpHitAt || 0
  });

  if (p.casting) p.casting = null;
  closeTrade(p, 'peer_gone');
  interruptDuel(p, 'zone_change');
  if (p.store) {
    p.store = null;
    broadcastStoreState(p);
  }

  broadcastAOI(p, { t: 'aoi', enter: [], leave: ['p' + p.pid] });
  if (p.known && p.known.size > 0) {
    send(p, { t: 'aoi', enter: [], leave: Array.from(p.known) });
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
  pidByYid.delete(p.yid);
  if (connId != null) proxySockets.delete(connId);

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

  const myMaxId = (CURRENT_WORKER_ID + 1) * 100000000;
  if (!IS_CLUSTER && pid >= nextId) {
    nextId = pid + 1;
  } else if (IS_CLUSTER && pid >= nextId && pid < myMaxId) {
    nextId = pid + 1;
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

  if (entityTransforms && p.transformSlot < 0) {
    p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
  }
  players.set(p.pid, p);
  if (proxy) wsByPid.set(p.pid, proxy);
  pidByYid.set(yid, p.pid);

  if (IS_CLUSTER && clusterIpc) {
    clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
  }

  snapStandY(p);
  p.applyClassStats();
  resetMoveBudget(p);

  const r = (WM.regionAt(p.x, p.z) || {});
  const peace = isPeaceAt(p.x, p.z);
  const zoneLabel = zoneLabelAt(p.x, p.z);
  send(p, { t: 'region', region: r.id || p.region, peace: peace, zoneName: zoneLabel });
  send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });

  ensureNearbyMobs(p);
  sendNearbyLoot(p);

  p._aoiDirty = true;
  const aoi = recomputeAOI(p);
  sendAoiDelta(p, aoi);
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
  clusterIpc.on('client_raw', ({ connId, data, isBinary, clientIp }) => {
    let proxy = proxySockets.get(connId);
    if (!proxy) {
      proxy = new GatewaySocketProxy(connId, clientIp);
      proxySockets.set(connId, proxy);
      setupSocketConnection(proxy);
    } else if (clientIp && !proxy.clientIp) {
      proxy.clientIp = clientIp;
    }
    const buf = isBinary && !Buffer.isBuffer(data) ? Buffer.from(data) : data;
    proxy.emit('message', buf);
  });

  // Отключение клиента от Master Gateway
  clusterIpc.on('client_disconnect', ({ connId, pid }) => {
    let resolvedPid = pid;
    const proxy = proxySockets.get(connId);
    if (proxy) {
      if (proxy.pid != null) resolvedPid = proxy.pid;
      proxy.emit('close');
      proxySockets.delete(connId);
    }
    if (resolvedPid != null) {
      detachPlayer(resolvedPid).catch(() => {});
    }
  });

  // Восстановление сессий игроков после аварийного перезапуска воркера
  clusterIpc.on('session_restore', async (payload) => {
    if (!payload || !Array.isArray(payload.sessions)) return;
    for (const s of payload.sessions) {
      if (!s || s.connId == null || !s.yid) continue;
      const { connId, yid, charId, pid } = s;
      try {
        let pr = null;
        try {
          pr = await DB.load(yid, charId);
        } catch (e) {
          console.error('[session_restore] DB.load failed:', yid, charId, e && e.message);
        }
        if (!pr) continue;

        let proxy = proxySockets.get(connId);
        if (!proxy) {
          proxy = new GatewaySocketProxy(connId);
          proxy.pid = pid;
          proxy.isAuthed = true;
          proxySockets.set(connId, proxy);
          setupSocketConnection(proxy, true);
        } else {
          proxy.pid = pid;
          proxy.isAuthed = true;
          if (typeof proxy.setAuthed === 'function') proxy.setAuthed(true);
        }

        const p = new Player(pid, yid, pr, { charId: pr.charId || charId });
        p.charId = pr.charId || charId;
        if (entityTransforms && p.transformSlot < 0) {
          p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
        }
        players.set(p.pid, p);
        wsByPid.set(p.pid, proxy);
        pidByYid.set(yid, p.pid);

        if (IS_CLUSTER && clusterIpc) {
          clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
        }

        snapStandY(p);
        p.applyClassStats();
        resetMoveBudget(p);

        const r = (WM.regionAt(p.x, p.z) || {});
        const peace = isPeaceAt(p.x, p.z);
        const zoneLabel = zoneLabelAt(p.x, p.z);
        send(p, { t: 'region', region: r.id || p.region, peace: peace, zoneName: zoneLabel });
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });

        ensureNearbyMobs(p);
        sendNearbyLoot(p);

        p._aoiDirty = true;
        const aoi = recomputeAOI(p);
        sendAoiDelta(p, aoi);
        console.log(`[session_restore] ✅ Сессия восстановлена без дисконнекта: ${p.name} (PID: ${p.pid}, connId: ${connId})`);
      } catch (err) {
        console.error('[session_restore] Error restoring session:', err && err.message);
      }
    }
  });

  // Синхронизация состояния кланов и CWH между ядрами кластера (SYNC-CLN-01)
  Clans.setSyncBroadcaster((action, snap) => clusterIpc.broadcastClanSync(action, snap));
  clusterIpc.on('clan_sync', (payload) => {
    if (!payload || !payload.clan) return;
    const { action, clan } = payload;
    const updated = Clans.applySync(action, clan);
    if (updated) {
      for (const [, pl] of players) {
        if (pl && pl.yid && Clans.memberOf(updated, pl.yid, pl.charId)) {
          bindClan(pl, updated);
          send(pl, clanPayload(updated));
          sendCrest(pl, updated);
        }
      }
    } else if (action === 'remove' && clan && clan.id) {
      for (const [, pl] of players) {
        const myClan = Clans.ofPlayer(pl);
        if (!myClan || myClan.id === clan.id) {
          bindClan(pl, null);
          send(pl, { t: 'clan', clan: null });
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
    if (payload.action === 'ban' || payload.action === 'ban_ip') {
      for (const [, pl] of players) {
        if (!pl) continue;
        const targetStr = String(payload.target).toLowerCase();
        const hitBan = (payload.action === 'ban' && (pl.yid === payload.target || (pl.name && pl.name.toLowerCase() === targetStr)));
        const hitBanIp = (payload.action === 'ban_ip' && pl.clientIp === payload.target);
        if (hitBan || hitBanIp) {
          send(pl, { t: 'banned', reason: (payload.payload && payload.payload.reason) ? payload.payload.reason : 'Banned by admin' });
          if (pl._ws) {
            try { pl._ws.close(); } catch (_) {}
          }
        }
      }
    }
  });

  // Синхронизация кодовых ключей учетных записей (AccountKeys)
  clusterIpc.on('account_key_sync', (payload) => {
    if (!payload || !payload.data) return;
    AccountKeys.applySync(payload.data);
  });

  // Синхронизация прав GM/администратора
  clusterIpc.on('gm_sync', (payload) => {
    if (!payload || !payload.yid) return;
    for (const [, pl] of players) {
      if (pl && pl.yid === payload.yid) {
        pl.accessLevel = payload.accessLevel || 0;
        pl.gm = (payload.accessLevel >= 100);
        send(pl, { t: 'msg', text: pl.gm ? '⚙️ Права администратора (GM) обновлены.' : 'Права администратора сняты.' });
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
    } catch (_) {}
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
        packetsOut: netStats.packetsOut
      });
    } catch (_) {}
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
  saveProfileNow,
  pushWeight
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
  isSyntheticBot
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
  pushCombatStats
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
  pushWeight
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
  toggleShotArm
});

// === DISCONNECT & SESSION MANAGEMENT (Phase 4 Decomposition) ===
const disconnectManager = createDisconnectManager({
  players,
  wsByPid,
  pidByYid,
  mobs,
  parties,
  partyHandler,
  spatialGrid,
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
  DB,
  PlayerDb,
  IS_CLUSTER,
  clusterIpc,
  CURRENT_WORKER_ID
});

async function detachPlayer(pid) {
  return disconnectManager.detachPlayer(pid);
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
  initiateClusterHandoff
});

async function doLogin(ws, msg) {
  return sessionManager.doLogin(ws, msg);
}

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
  // L2 corpse: only revive / chat while dead
  if (p.dead && msg.t !== 'revive' && msg.t !== 'chat' && msg.t !== 'ping') {
    if (msg.t === 'move' || msg.t === 'attack' || msg.t === 'attack_player' || msg.t === 'skill'
        || msg.t === 'use' || msg.t === 'loot_pickup' || msg.t === 'equip' || msg.t === 'unequip'
        || msg.t === 'drop_item' || msg.t === 'destroy_item') {
      return;
    }
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
      if (p.dead || p.hp <= 0) return;
      if (p.trade || p.store) { send(p, { t: 'craft_fail', reason: 'busy' }); break; }
      if (!checkRate(p, 'action')) return;
      const rid = String(msg.id || '');
      const rec = tableGet(G.RECIPES, rid); if (!rec || !Array.isArray(rec.mats)) return;
      if (!p.learned.has(rid)) { send(p, { t:'msg', text:'Чертеж не изучен.' }); return; }
      for (const m of rec.mats) if ((p.inv[m.id] || 0) < m.n) { send(p, { t:'msg', text:'Недостаточно материалов.' }); return; }
      // Место под результат: иначе предмет пропадал молча при полной сумке.
      const cfit = NPCS.canFit(p.inv, rec.result.id, rec.result.n);
      if (!cfit.ok) { send(p, { t: 'msg', text: 'Нет места в сумке.' }); return; }
      const minus = {};
      for (const mat of rec.mats) minus[mat.id] = (minus[mat.id] | 0) + mat.n;
      const wCraft = wouldExceedWeight(p, minus, { [rec.result.id]: rec.result.n });
      if (!wCraft.ok) { send(p, { t: 'msg', text: 'Слишком тяжело.' }); return; }
      const bagPlusCraft = bagPlus(p, rec.result.id) > 0 && (p.inv[rec.result.id] | 0) > 0;
      if (bagPlusCraft) {
        send(p, { t: 'craft_fail', reason: 'enchanted', id: rid });
        send(p, { t: 'msg', text: 'У вас в сумке уже есть модифицированный предмет этого типа.' });
        return;
      }
      for (const m of rec.mats) p.inv[m.id] -= m.n;
      pruneInv(p);
      if (Math.random() < rec.chance) {
        p.inv[rec.result.id] = (p.inv[rec.result.id] || 0) + rec.result.n;
        send(p, { t: 'craft_ok', id: rid, got: rec.result.id, n: rec.result.n, inv: p.inv, equip: p.equip });
        questCollectChanged(p, rec.result.id);
      } else {
        send(p, { t: 'craft_fail', id: rid, inv: p.inv, equip: p.equip });
      }
      // Материалы списаны в любом случае — на диск сразу.
      saveProfileNow(p);
      pushWeight(p);
      break;
    }
    case 'learn': {
      if (p.dead || p.hp <= 0) return;
      if (p.trade || p.store) { send(p, { t: 'msg', text: 'Заняты обменом или торговлей.' }); break; }
      if (!checkRate(p, 'action')) return;
      const rid = String(msg.id || ''); if (!tableGet(G.RECIPES, rid)) return;
      const item = 'recipe_' + rid;
      if ((p.inv[item] || 0) < 1) { send(p, { t:'msg', text:'Нет чертежа в инвентаре.' }); return; }
      if (p.learned.has(rid)) { send(p, { t:'msg', text:'Уже изучено.' }); return; }
      p.inv[item] -= 1; p.learned.add(rid);
      if (p.inv[item] <= 0) delete p.inv[item];
      send(p, { t: 'learned', id: rid, learned: [...p.learned], inv: p.inv, equip: p.equip });
      saveProfileNow(p);
      break;
    }
    case 'device_upgrade': {
      if (p.dead || p.hp <= 0) return;
      if (p.trade || p.store) { send(p, { t: 'device_upgrade_fail', reason: 'busy' }); break; }
      if (!checkRate(p, 'action')) return;
      doDeviceUpgrade(p, String(msg.track || '').toLowerCase());
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
      if (!EDITOR_ENABLED && (p.accessLevel | 0) < 100 && !p.gm) {
        send(p, { t: 'editor_save_result', reqId, ok: false, code: 'EDISABLED', error: 'редактор выключен на этом сервере' });
        break;
      }
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

function tick() {
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
  if (nativeSpatialGrid) {
    nativeSpatialGrid.clear();
    nativeSpatialGrid.bulkInsert(entityTransforms.buffer, entityTransforms.maxSlot);
  }
  for (const [, pl] of players) {
    if (nativeSpatialGrid && isSyntheticBot(pl.yid)) continue;
    spatialGrid.insertPlayer(pl);
  }
  for (const [, mb] of mobs) {
    if (mb._sleepUntil > t0) continue; // Дальние спящие мобы (>155м) не индексируются в сетку
    spatialGrid.insertMob(mb);
  }

  if (borderGhosts.size > 0) {
    const nowTick = Date.now();
    for (const [gPid, g] of borderGhosts) {
      if (nowTick - g.updatedAt > 3000) {
        borderGhosts.delete(gPid);
        continue;
      }
      spatialGrid.insertPlayer(g);
    }
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
            level: p.level || 1,
            hp: p.hp,
            maxHp: p.maxHp || 100,
            karma: p.karma || 0,
            isFlagged: p.isFlagged || false
          });
        }
      }
      if (borderList.length > 0) {
        clusterIpc.sendToPrimary(MSG_BORDER_GHOSTS, { ghosts: borderList });
      }
    }
  }

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
    if (p.moving && t0 - (p._lastMoveAt || 0) > 350) {
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
      if (aoi.enter.length > 0 && (!p.yid || !isBot)) sendNearbyLoot(p);
    }

    // Дистанционное квантование частоты обновлений (Tiered Knownlist Update):
    // При высокой нагрузке синтетическим ботам отправляются только критические обновления:
    // Сидячие лавки пропускаются; боты в бою получают только координаты цели;
    // Живые игроки ВСЕГДА обновляются с полной частотой 10 Hz!
    if (isBot) {
      if (p.sitting) continue;
      if (!p.target && !p.inCombat && !p.casting) {
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
              const targetHp = Math.round(targetP.hp);
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
            const isPriority = (p.target && p.target.mid === mid) || (targetM.targetPid === p.pid);
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

  scheduleNextTick();
}
// Write-Behind Dirty Cache (Спринт 1, v2.2 / 5000 CCU Scale)
// Динамический размер батча: при росте очереди грязных профилей размер батча
// пропорционально увеличивается (Math.max(16, Math.ceil(_dirtyProfiles.size / 6))),
// гарантируя полный сброс очереди на диск за ~22.5–30 секунд при любой нагрузке.
const saveTimer = setInterval(() => {
  if (_dirtyProfiles.size === 0) return;
  const batchSize = Math.max(16, Math.ceil(_dirtyProfiles.size / 6));
  let n = batchSize;
  const batch = [];
  for (const [k, p] of _dirtyProfiles) {
    _dirtyProfiles.delete(k);
    if (p && (!p.yid || !isSyntheticBot(p.yid))) {
      try {
        const pr = profileOf(p);
        lbTouch(p.yid, pr, p.charId);
        batch.push({ yid: p.yid, data: pr, charId: p.charId });
      } catch (e) { console.error('[DB] saveTimer prep', p.yid, e && e.message); }
    }
    if (--n <= 0) break;
  }
  if (batch.length > 0) {
    if (typeof DB.saveBatch === 'function') {
      const r = DB.saveBatch(batch);
      if (r && typeof r.catch === 'function') r.catch(e => console.error('[DB] saveTimer batch error:', e && e.message));
    } else {
      for (const item of batch) {
        const r = DB.save(item.yid, item.data, item.charId);
        if (r && typeof r.catch === 'function') r.catch(e => console.error('[DB] save', item.yid, e && e.message));
      }
    }
  }
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
const ALLOWED_ROOTS = [path.join(REPO_ROOT, 'client'), path.join(REPO_ROOT, 'shared'), path.join(REPO_ROOT, 'data')];
// Из каталога data/ лежат профили игроков. Наружу отдаём только карты покраски террейна.
const DATA_PUBLIC = /^terrain-paint-\d+\.png$/i;
// client/data/ раздаётся целиком, но dev-сборки оставляли там локальные профили
// (local_<id>.json) — они отдавались по HTTP кому угодно. Никогда не отдаём.
const DATA_PRIVATE = /(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.backup(\..*)?|.*\.tmp(\..*)?|editor-overrides\.backup.*)$/i;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.webp':'image/webp', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.woff2':'font/woff2', '.map':'application/json',
  '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.fbx':'application/octet-stream', '.bin':'application/octet-stream',
  '.mp3':'audio/mpeg', '.ogg':'audio/ogg', '.wav':'audio/wav' };
function resolveStaticPath(urlPath) {
  let p = urlPath;
  // Точка входа всегда меню (не game.html)
  if (p === '/' || p === '') p = '/menu.html';
  if (p === '/index.html' || p === 'index.html') p = '/menu.html';
  if (p === '/launcher' || p === 'launcher') p = '/launcher.html';
  let rel = path.normalize(p).replace(/^[\/\\]+/, '');
  if (rel.startsWith('..')) return null;
  // Профили и служебные файлы — никогда, независимо от каталога (data, client, shared).
  if (DATA_PRIVATE.test(rel)) return null;
  const top = rel.split(/[\/\\]/)[0];
  if (top === 'data') {
    // Сначала клиентские ассеты (data/textures/... и прочее), и только затем
    // корневой data/ — по белому списку, чтобы не отдать профили игроков.
    const inClient = path.join(REPO_ROOT, 'client', rel);
    if (fs.existsSync(inClient)) return inClient;
    const name = rel.split(/[\/\\]/).slice(1).join('/');
    if (DATA_PUBLIC.test(name)) return path.join(REPO_ROOT, rel);
    return null;
  }
  if (top === 'shared' || top === 'client') {
    const primary = path.join(REPO_ROOT, rel);
    if (fs.existsSync(primary)) return primary;
    const fallback = path.join(REPO_ROOT, 'client', rel);
    if (fs.existsSync(fallback)) return fallback;
    return primary;
  }
  return path.join(REPO_ROOT, 'client', rel);
}
// Текстовые типы жмутся gzip, бинарные (webp/png/glb/fbx) уже сжаты.
const COMPRESSIBLE = new Set(['.js', '.mjs', '.html', '.css', '.json', '.svg', '.map', '.txt', '.csv']);
// DEV=1 (или SERVE_NO_CACHE=1) — итерации по ассетам без ручного сброса кэша.
// Раньше зависело от EDITOR_ENABLED; теперь редактор включается только явно,
// поэтому критерий — «не прод».
const NO_CACHE = process.env.SERVE_NO_CACHE != null
  ? process.env.SERVE_NO_CACHE === '1'
  : process.env.NODE_ENV !== 'production';
const STATIC_MAX_AGE = 31536000; // versioned URL (?v=...) → год
const gzipCache = new Map(); // filePath -> { mtime, size, buf }
const GZIP_CACHE_MAX = 64 * 1024 * 1024;
let gzipCacheBytes = 0;

function acceptsGzip(req) {
  const ae = req.headers && req.headers['accept-encoding'];
  return !!ae && /\bgzip\b/i.test(ae);
}

function sendStatic(req, res, filePath, stat, data) {
  const ext = path.extname(filePath).toLowerCase();
  const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag };
  headers['Last-Modified'] = stat.mtime.toUTCString();

  if (EditorGuard.isEditorAsset(filePath) || EditorGuard.isEditorAsset(path.basename(filePath))) {
    headers['Cache-Control'] = 'private, no-store, no-cache';
    headers['Pragma'] = 'no-cache';
  } else if (NO_CACHE) {
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
    headers['Pragma'] = 'no-cache';
  } else if (ext === '.html' || /(^|[\/\\])(editor-overrides-data\.js|editor-overrides\.json|terrain-paint-[12]\.png)$/i.test(filePath)) {
    // html — точка входа, всегда перепроверяем.
    // EDITOR: данные мира (data/editor-overrides.json) и карты покраски меняются без смены URL — раньше кэшировались
    // на год (immutable), и игроки не получали сохранения. Теперь no-cache + ETag (304 если не менялись).
    headers['Cache-Control'] = 'no-cache';
  } else {
    // URL версионированы (?v=...), поэтому содержимое можно кэшировать надолго
    headers['Cache-Control'] = 'public, max-age=' + STATIC_MAX_AGE + ', immutable';
  }

  // 304: экономит повторную загрузку ~35 МБ на каждом входе
  const inm = req.headers && req.headers['if-none-match'];
  if (!NO_CACHE && inm && inm === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  if (COMPRESSIBLE.has(ext) && acceptsGzip(req) && data.length > 1024) {
    const key = filePath;
    const hit = gzipCache.get(key);
    if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) {
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      return res.end(hit.buf);
    }
    return zlib.gzip(data, { level: 6 }, (err, buf) => {
      if (err || !buf) { res.writeHead(200, headers); return res.end(data); }
      // Вычитаем размер старой записи, если файл был изменен на диске и пережат
      if (gzipCache.has(key)) {
        const oldEntry = gzipCache.get(key);
        if (oldEntry && oldEntry.buf) {
          gzipCacheBytes = Math.max(0, gzipCacheBytes - oldEntry.buf.length);
        }
      }
      // FIFO-эвикция старых файлов при превышении лимита памяти кэша
      while (gzipCacheBytes + buf.length > GZIP_CACHE_MAX && gzipCache.size > 0) {
        const oldestKey = gzipCache.keys().next().value;
        const oldestEntry = gzipCache.get(oldestKey);
        if (oldestEntry && oldestEntry.buf) {
          gzipCacheBytes = Math.max(0, gzipCacheBytes - oldestEntry.buf.length);
        }
        gzipCache.delete(oldestKey);
      }
      if (gzipCacheBytes + buf.length <= GZIP_CACHE_MAX) {
        gzipCache.set(key, { mtime: stat.mtimeMs, size: stat.size, buf });
        gzipCacheBytes += buf.length;
      }
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      res.writeHead(200, headers);
      res.end(buf);
    });
  }

  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  res.end(data);
}

function denyEditor(res, urlPath) {
  const isCss = urlPath && String(urlPath).endsWith('.css');
  res.writeHead(404, {
    'Content-Type': isCss ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(isCss ? '/* 404 not found */' : 'not found');
}

function serveStatic(req, res) {
  try {
    let urlPath = '/';
    try {
      urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('bad request');
    }
    if (urlPath === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (EditorGuard.isEditorAsset(urlPath) && !EditorGuard.allowAsset(req)) {
      return denyEditor(res, urlPath);
    }
    const filePath = resolveStaticPath(urlPath);
    if (!filePath) { res.writeHead(403); return res.end('forbidden'); }
    if (!ALLOWED_ROOTS.some(a => filePath === a || filePath.startsWith(a + path.sep))) { res.writeHead(403); return res.end('forbidden'); }
    fs.stat(filePath, (serr, stat) => {
      if (serr || !stat.isFile()) { res.writeHead(404); return res.end('not found'); }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); return res.end('not found'); }
        sendStatic(req, res, filePath, stat, data);
      });
    });
  } catch (e) { res.writeHead(500); res.end('error'); }
}
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
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Project Steam MMO server is running.');
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
  wss = { clients: new Set(), on: () => {} };
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
        } catch (_) {}
      }
    }
  };
  if (authed && typeof ws.subscribe === 'function') {
    try {
      ws.subscribe('world');
      const p = ws.pid != null ? players.get(ws.pid) : null;
      if (p && p.region) ws.subscribe('region:' + p.region);
    } catch (_) {}
  }

  // Джиттер начального пинга разносит 5000 сокетов по 15-секундному окну без залповых спайков TCP
  sessions.set(ws, { lastPong: Date.now(), lastPing: Date.now() - Math.floor(Math.random() * 15000) });
  // Без этого слушателя любой битый фрейм роняет весь процесс (ws эмитит 'error' на сокет).
  ws.on('error', (e) => {
    console.error('[ws] socket error:', e && e.message);
    try { ws.terminate(); } catch (_) {}
  });
  ws.on('pong', () => {
    const s = sessions.get(ws);
    if (s) s.lastPong = Date.now();
  });
  ws.on('message', async (raw) => {
    try {
      const now = Date.now();
      // VULN-DDOS-02: Защита от флуда до парсинга JSON (порог 180 msg/s для 144Hz и сетевых батчей)
      if (!ws._msgRate || now > ws._msgRate.resetAt) {
        ws._msgRate = { count: 1, resetAt: now + 1000 };
      } else {
        ws._msgRate.count++;
        if (ws._msgRate.count > 180) {
          try { ws.close(4029, 'rate limit exceeded'); } catch (_) {
            try { ws.terminate(); } catch (_) {}
          }
          return;
        } else if (ws._msgRate.count > 120) {
          return; // Отсекаем избыточные сообщения без синхронного JSON.parse
        }
      }

      if (!authed) {
        ws._unauthMsgs = (ws._unauthMsgs || 0) + 1;
        if (ws._unauthMsgs > 5) {
          try { ws.close(4001, 'too many unauth messages'); } catch (_) {
            try { ws.terminate(); } catch (_) {}
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
        await doLogin(ws, msg);
        return;
      }
      const p = players.get(ws.pid); if (p) handle(p, msg);
    } catch (e) {
      console.error('[ws] message handler:', e && e.stack || e);
      try { ws.close(1011, 'internal error'); } catch (_) {}
    }
  });
  ws.on('pong', () => { const s = sessions.get(ws); if (s) s.lastPong = Date.now(); });
  ws.on('close', async () => {
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
        try { ws.terminate(); } catch (_) {}
      }
      sessions.delete(ws);
      if (deadConnId != null) proxySockets.delete(deadConnId);
      if (deadPid != null) {
        detachPlayer(deadPid).catch(() => {});
      }
      continue;
    }
    if (now - s.lastPong > 60000) {
      console.warn('[ws] session timed out (no pong/message for 60s):', ws.pid);
      const deadPid = ws.pid;
      const deadConnId = ws.connId;
      try { ws.close(4001, 'session timeout'); } catch (_) {
        try { ws.terminate(); } catch (_) {}
      }
      sessions.delete(ws);
      if (deadConnId != null) proxySockets.delete(deadConnId);
      if (deadPid != null) {
        detachPlayer(deadPid).catch(() => {});
      }
    } else if (now - (s.lastPing || 0) >= 8000) {
      s.lastPing = now;
      try { ws.ping(); } catch (_) {}
    }
  }
}, 2500);

// Автономный сборщик зомби-игроков: гарантирует очистку потерянных сессий
const zombiePlayerSweeper = setInterval(() => {
  try {
    for (const [pid] of players) {
      const ws = wsByPid.get(pid);
      if (!ws) {
        detachPlayer(pid).catch(() => {});
        continue;
      }
      if (ws.readyState === 2 || ws.readyState === 3) {
        detachPlayer(pid).catch(() => {});
        continue;
      }
      if (!sessions.has(ws)) {
        detachPlayer(pid).catch(() => {});
      }
    }
  } catch (_) {}
}, 10000);
function startTickLoop() {
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
startTickLoop();
const tickTimer = {
  unref: () => { if (_tickTimeout) _tickTimeout.unref(); },
  ref: () => { if (_tickTimeout) _tickTimeout.ref(); }
};

// ---- Отказоустойчивость процесса ----
// Без этих обработчиков одно исключение в колбэке или один отказ промиса
// убивают процесс со всеми игроками (Node 22 завершает и на unhandledRejection).
process.on('uncaughtException', (e) => {
  const errStr = '[fatal] uncaughtException: ' + (e && (e.stack || e.message) || e) + '\n';
  try { fs.writeSync(2, errStr); } catch (_) {}
  try { fs.appendFileSync(path.join(__dirname, 'crash.log'), errStr); } catch (_) {}
  console.error(errStr);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (r) => {
  const errStr = '[fatal] unhandledRejection: ' + (r && (r.stack || r.message) || r) + '\n';
  try { fs.writeSync(2, errStr); } catch (_) {}
  try { fs.appendFileSync(path.join(__dirname, 'crash.log'), errStr); } catch (_) {}
  console.error(errStr);
  shutdown('unhandledRejection');
});

// ---- Graceful shutdown ----
// Render присылает SIGTERM при каждом редеплое. Без этого до 30 с прогресса
// (автосейв SAVE_EVERY) теряется у всех, кто в игре.
let shuttingDown = false;
async function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('[server] ' + sig + ': сохраняю профили (' + players.size + ')...');
  stopTickLoop();
  if (typeof tickTimer !== 'undefined' && typeof clearInterval === 'function') {
    try { clearInterval(tickTimer); } catch (_) {}
  }
  clearInterval(saveTimer);
  clearInterval(pingTimer);
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
  if (batch.length > 0) {
    if (typeof DB.saveBatch === 'function') {
      jobs.push(Promise.resolve(DB.saveBatch(batch)).catch(e => console.error('[DB] shutdown saveBatch', e && e.message)));
    } else {
      for (const item of batch) {
        jobs.push(Promise.resolve(DB.save(item.yid, item.data, item.charId)).catch(e => console.error('[DB] shutdown save', item.yid, e && e.message)));
      }
    }
  }
  try { await Promise.all(jobs); } catch (_) {}
  // Дождаться и тех записей, что уже стояли в очереди DB (автосейв мог начать
  // писать в тот же момент): без flush процесс мог выйти на середине rename.
  if (typeof DB.flush === 'function') { try { await DB.flush(); } catch (_) {} }
  if (typeof Clans.flush === 'function') { try { await Clans.flush(); } catch (_) {} }
  if (typeof Mod.flush === 'function') { try { await Mod.flush(); } catch (_) {} }
  if (typeof PlayerDb.save === 'function') { try { await PlayerDb.save(); } catch (_) {} }
  if (typeof DB.close === 'function') { try { await DB.close(); } catch (_) {} }
  for (const client of wss.clients) { try { client.close(1012, 'server restart'); } catch (_) {} }
  console.log('[server] профили сохранены, завершаюсь.');
  const code = sig === 'uncaughtException' ? 1 : 0;
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

// FIX(prod): раньше реестры читались ПАРАЛЛЕЛЬНО с созданием схемы Postgres (DB.init в фоне) —
// на чистой БД: relation "system_state" does not exist, ключи/GM не загружались, а первая запись
// затирала реестр. Теперь сначала дожидаемся схемы, затем грузим реестры.
const dbSchemaReady = (typeof DB.init === 'function' ? Promise.resolve().then(() => DB.init()) : Promise.resolve())
  .catch(e => console.error('[DB] init перед загрузкой реестров:', e && e.message));
try { Mod.load(); } catch (e) { console.error('[mod] load', e && e.message); }
dbSchemaReady.then(() => {
  try {
    if (typeof Clans.loadAllAsync === 'function' && DB.MODE === 'postgres') {
      Clans.loadAllAsync().catch(e => console.error('[clans] loadAllAsync', e && e.message));
    } else {
      Clans.loadAll();
    }
  } catch (e) { console.error('[clans] loadAll', e && e.message); }
  try { PlayerDb.init().then(r => console.log('[PlayerDB] indexed characters:', r.count)).catch(e => console.error('[PlayerDB] init', e && e.message)); } catch (e) { console.error('[PlayerDB] init', e && e.message); }
  try { AccountKeys.init().then(r => console.log('[AccountKeys] loaded bindings:', r.count, r.ok === false ? ('(ОШИБКА: ' + r.error + ', запись реестра заблокирована)') : '')).catch(e => console.error('[AccountKeys] init', e && e.message)); } catch (e) { console.error('[AccountKeys] init', e && e.message); }
});

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

// Индекс лидерборда — асинхронно после старта, чтобы не блокировать listen.
loadLeaderboardIndex();

// ============================================================
//  ИНТЕРАКТИВНАЯ КОНСОЛЬ АДМИНИСТРАТОРА В ТЕРМИНАЛЕ СЕРВЕРА
// ============================================================
function setupConsoleCommands() {
  if (IS_CLUSTER) return;
  if (!process.stdin || !process.stdin.isTTY) return;
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  rl.on('line', (line) => {
    const raw = String(line || '').trim();
    if (!raw) return;
    handleConsoleCommand(raw);
  });
  console.log('[console] В терминале сервера доступны команды: setgm <имя> [lvl], revokegm <имя>, list, announce <текст>, kick <имя>, help');
}

async function handleConsoleCommand(raw) {
  const parts = raw.split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase().replace(/^\/+/, '');
  const args = parts.slice(1);

  if (cmd === 'help') {
    console.log('\n--- Консольные команды сервера ---');
    console.log('  setgm <имя> [уровень=100]  — Выдать права GM/Админа (50..100)');
    console.log('  revokegm <имя>             — Снять права GM (accessLevel=0)');
    console.log('  setaura <имя> <тип>        — Изменить ауру игрока (cyan|blue|red|gold|hero|off)');
    console.log('  list                       — Список игроков онлайн');
    console.log('  announce <сообщение>       — Оповещение всем игрокам');
    console.log('  kick <имя>                 — Кикнуть игрока');
    console.log('  status                     — Состояние сервера');
    console.log('----------------------------------\n');
    return;
  }

  if (cmd === 'setgm' || cmd === 'gm') {
    if (!args[0]) {
      console.log('Использование: setgm <имя_персонажа> [уровень=100]');
      return;
    }
    const name = sanitizeCharName(args[0]);
    const lvl = Math.max(0, Math.min(100, parseInt(args[1], 10) || 100));
    try {
      const res = await PlayerDb.setAccessLevel(name, lvl, 'console');
      const onlineP = findPlayerByName(name);
      if (onlineP) {
        onlineP.accessLevel = lvl;
        onlineP.gm = lvl >= 50;
        send(onlineP, { t: 'msg', text: `Консоль сервера установила вам AccessLevel ${lvl} (GM: ${onlineP.gm ? 'ДА' : 'НЕТ'}).` });
      }
      console.log(`[console] Игроку "${name}" успешно установлен AccessLevel ${lvl} (GM: ${lvl >= 50 ? 'ДА' : 'НЕТ'})!`);
      if (onlineP) console.log(`[console] Игрок "${name}" онлайн — права применены немедленно.`);
      else console.log(`[console] Игрок "${name}" оффлайн — права будут активны при входе.`);
    } catch (e) {
      console.log(`[console] Ошибка: ${e && e.message}`);
    }
    return;
  }

  if (cmd === 'revokegm') {
    if (!args[0]) {
      console.log('Использование: revokegm <имя_персонажа>');
      return;
    }
    const name = sanitizeCharName(args[0]);
    try {
      await PlayerDb.revokeAccess(name, 'console');
      const onlineP = findPlayerByName(name);
      if (onlineP) {
        onlineP.accessLevel = 0;
        onlineP.gm = false;
        send(onlineP, { t: 'msg', text: 'Консоль сервера сняла с вас права GM (AccessLevel 0).' });
      }
      console.log(`[console] Статус GM с игрока "${name}" успешно снят.`);
    } catch (e) {
      console.log(`[console] Ошибка: ${e && e.message}`);
    }
    return;
  }

  if (cmd === 'setaura' || cmd === 'aura') {
    if (!args[0]) {
      console.log('Использование: setaura <имя_персонажа> <cyan|blue|red|gold|hero|off>');
      console.log('Примеры: setaura фывфа red  или  setaura Admin gold');
      return;
    }
    let auraType = null;
    let targetName = null;
    if (args.length === 1) {
      console.log('Укажите тип ауры: setaura <имя> <cyan|blue|red|gold|hero|off>');
      return;
    }
    if (resolveAuraType(args[0])) {
      auraType = resolveAuraType(args[0]);
      targetName = args.slice(1).join(' ').trim();
    } else if (resolveAuraType(args[args.length - 1])) {
      auraType = resolveAuraType(args[args.length - 1]);
      targetName = args.slice(0, args.length - 1).join(' ').trim();
    } else {
      console.log('Неизвестный тип ауры. Доступно: cyan (циан), blue (синий), red (красный), gold (золотой), hero (герой), off (выкл).');
      return;
    }
    targetName = sanitizeCharName(targetName);
    const onlineP = findPlayerByName(targetName);
    if (onlineP) {
      onlineP.cosmetics = onlineP.cosmetics || {};
      onlineP.cosmetics.aura = auraType === 'none' ? 'none' : auraType;
      saveProfileNow(onlineP);
      const cosPub = cosmeticsPublic(onlineP);
      const cosPkt = {
        t: 'cosmetic',
        pid: onlineP.pid,
        title: cosPub.title,
        titleName: cosPub.titleName,
        titleColor: cosPub.titleColor,
        nameColor: cosPub.nameColor,
        aura: cosPub.aura
      };
      send(onlineP, cosPkt);
      broadcastAOI(onlineP, cosPkt);
      send(onlineP, { t: 'msg', text: `[Консоль] Ваша аура изменена на: ${auraType === 'none' ? 'ВЫКЛЮЧЕНА' : auraType}.` });
      console.log(`[console] Аура игрока "${onlineP.name}" успешно изменена на: ${auraType} (онлайн, применена немедленно)!`);
    } else if (PlayerDb && PlayerDb.setAura) {
      try {
        const res = await PlayerDb.setAura(targetName, auraType);
        if (res && res.ok) {
          console.log(`[console] Аура игрока "${res.name || targetName}" сохранена: ${auraType} (оффлайн, активируется при входе)!`);
        } else {
          console.log(`[console] Персонаж не найден: "${targetName}"`);
        }
      } catch (e) {
        console.log(`[console] Ошибка: ${e && e.message}`);
      }
    } else {
      console.log(`[console] Персонаж не найден: "${targetName}"`);
    }
    return;
  }

  if (cmd === 'list' || cmd === 'players') {
    const online = Array.from(players.values());
    console.log(`\nОнлайн игроков (${online.length}):`);
    for (const p of online) {
      console.log(`  - ${p.name} (ур.${p.level}, GM: ${p.gm ? 'ДА (' + p.accessLevel + ')' : 'нет'}, x=${p.x.toFixed(1)}, z=${p.z.toFixed(1)})`);
    }
    console.log('');
    return;
  }

  if (cmd === 'announce' || cmd === 'say') {
    const text = args.join(' ').trim();
    if (!text) {
      console.log('Использование: announce <текст>');
      return;
    }
    broadcastWorld({ t: 'announce', text: '[АДМИНИСТРАЦИЯ]: ' + text, kind: 'gm' });
    console.log(`[console] Объявление разослано: "${text}"`);
    return;
  }

  if (cmd === 'kick') {
    if (!args[0]) {
      console.log('Использование: kick <имя_персонажа>');
      return;
    }
    const name = sanitizeCharName(args[0]);
    const target = findPlayerByName(name);
    if (!target) {
      console.log(`[console] Игрок "${name}" не найден в онлайне.`);
      return;
    }
    const ws = wsByPid.get(target.pid);
    if (ws) {
      try {
        sendJson(ws, { t: 'msg', text: 'Вы отключены администратором сервера через консоль.' });
        ws.close(4011, 'kicked by console');
      } catch (_) {}
    }
    detachPlayer(target.pid);
    console.log(`[console] Игрок "${name}" отключен от сервера.`);
    return;
  }

  if (cmd === 'status') {
    console.log(`[console] Подключений: ${players.size} игроков, мобов в памяти: ${mobs.size}`);
    return;
  }

  console.log(`[console] Неизвестная команда: "${cmd}". Введите "help" для списка команд.`);
}

setupConsoleCommands();
