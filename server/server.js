// SERVER / SERVER.JS — авторитетный MMO-сервер. Клиент шлёт только намерения.
'use strict';
const os = require('os');
if (!process.env.UV_THREADPOOL_SIZE) {
  const cpus = os.cpus() ? os.cpus().length : 2;
  process.env.UV_THREADPOOL_SIZE = String(Math.max(4, Math.min(16, cpus * 4)));
}
const http = require('http');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
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
const AccountKeys = require('./account-keys.js');



const PORT = +process.env.PORT || 8080;
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
const nativeSpatialGrid = typeof NativeSpatialGrid === 'function' ? new NativeSpatialGrid(-4096, -4096, 4096, 4096, 72) : null;
const _nativePBuf = new Int32Array(512);
const _nativeMBuf = new Int32Array(512);
const entityTransforms = new EntityTransformTable(4096);

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
  return s;
}

// ============================================================
//  ПРИБОРЫ ИНЖЕНЕРА — серверное состояние
//  Раньше уровни приборов приходили в пакете equip (msg.circuitLevel и др.) и
//  писались как есть. Проверено: `circuitLevel: 99` попадал в экип, а это гейт
//  обучения И каста скиллов (doLearnSkill / doSkillCast) — device-gate
//  обходился полностью. Теперь состояние живёт в профиле, а в equip
//  проставляется сервером.
// ============================================================
/** {circuit, nano, shell, casing} без прототипа, с потолками по уровню. */
function safeDevices(src, equip, level) {
  const out = Object.create(null);
  const lvlCap = ITEMS.deviceLevelCap(level);
  const shellCap = ITEMS.shellIndexCap(ITEMS.RESONATOR_SHELL_LADDER, level);
  const casingCap = ITEMS.shellIndexCap(ITEMS.NANO_CASING_LADDER, level);
  const num = (v, def) => {
    const n = Math.floor(+v);
    return Number.isFinite(n) ? n : def;
  };
  const s = (src && typeof src === 'object' && !Array.isArray(src)) ? src : null;
  // Миграция профилей до появления p.devices: уровни лежали в самих предметах.
  const res = (!s && equip && typeof equip === 'object') ? equip.necklace : null;
  const br = (!s && equip && typeof equip === 'object')
    ? (equip.bracelet || equip.ring_l || equip.ring_r) : null;
  let circuit = s ? num(s.circuit != null ? s.circuit : s.valve, 1) : num(res && (res.circuitLevel != null ? res.circuitLevel : (res.valveLevel != null ? res.valveLevel : res.resonatorLevel)), 1);
  let nano = s ? num(s.nano != null ? s.nano : s.wrist, 1) : num(br && (br.nanoLevel != null ? br.nanoLevel : br.wristLevel), 1);
  let shell = s ? num(s.shell, 0) : num(res && res.shellIndex, 0);
  let casing = s ? num(s.casing, 0) : num(br && br.casingIndex, 0);
  out.circuit = Math.max(1, Math.min(lvlCap, circuit));
  out.nano = Math.max(1, Math.min(lvlCap, nano));
  out.shell = Math.max(0, Math.min(shellCap, shell));
  out.casing = Math.max(0, Math.min(casingCap, casing));
  out.valve = out.circuit;
  out.wrist = out.nano;
  return out;
}

/** Проставить серверные уровни приборов в предмет экипа. */
function stampDeviceFields(p, eq, tpl) {
  if (!eq || !tpl || !p.devices) return;
  if (ITEMS.isResonatorTpl(tpl)) {
    eq.circuitLevel = p.devices.circuit;
    eq.valveLevel = p.devices.circuit;
    eq.resonatorLevel = p.devices.circuit; // legacy-зеркало для клиента
    eq.shellIndex = p.devices.shell;
  } else if (ITEMS.isNanoBraceletTpl(tpl)) {
    eq.nanoLevel = p.devices.nano;
    eq.wristLevel = p.devices.nano;
    eq.casingIndex = p.devices.casing;
  }
}

/** Пересинхронизировать все надетые приборы с p.devices. */
function syncDevicesToEquip(p) {
  if (!p || !p.equip || !p.devices) return;
  for (const slot of Object.keys(p.equip)) {
    const eq = p.equip[slot];
    const tpl = eq && ITEMS.get(String(eq.templateId || eq.id || '').toLowerCase());
    if (tpl) stampDeviceFields(p, eq, tpl);
  }
}

class Player {
  constructor(pid, yid, pr, opts) {
    this.pid = pid; this.yid = yid;
    this.entityKey = 'p' + pid;
    this.transformSlot = -1;
    this.charId = CH.normalizeCharId((opts && opts.charId) || (pr && pr.charId));
    this.createdAt = Math.max(0, Math.floor(+(pr && pr.createdAt)) || 0);
    this.name = sanitizeCharName(pr.name) || 'Operator';
    // dev до ensureStarterSkills: окружение без секретов Яндекса, но НЕ даёт GM автоматически
    this.dev = !!(opts && opts.dev);
    // AccessLevel: из PlayerDb (реестр gmAccess или база персонажей), либо из профиля если >= 50
    const dbLvl = (PlayerDb && PlayerDb.getAccessLevel) ? PlayerDb.getAccessLevel(this.yid, this.name, 0) : 0;
    const prLvl = (pr && pr.accessLevel != null) ? Math.max(0, Math.min(100, parseInt(pr.accessLevel, 10) || 0)) : 0;
    const isPrGm = !!(pr && (pr.gm === true || pr.accessLevel >= 50));
    this.accessLevel = dbLvl >= 50 ? dbLvl : (prLvl >= 50 ? prLvl : (isPrGm ? 100 : 0));
    this.gm = isPrGm || isGM(this);
    if (this.gm && this.accessLevel < 50) {
      this.accessLevel = 100;
    }
    this.level = safeNum(pr.level, 1, 1, 200); this.exp = safeNum(pr.exp, 0, 0); this.sp = safeNum(pr.sp, 0, 0);
    this.race = CS.normalizeRace(pr.race || 'human');
    this.gender = CS.normalizeGender(pr.gender || 'male');
    this.cls = CS.getClass(pr.cls) ? pr.cls : CS.normalizeBaseClass(pr.cls || 'operator');
    this.classTier = (CS.getClass(this.cls) || {}).tier || 0;
    this.classHistory = Array.isArray(pr.classHistory) && pr.classHistory.length
      ? pr.classHistory.slice()
      : [this.cls];
    this.x = (pr.x === 0 && pr.z === 0) ? -107.5 : safeNum(pr.x, -107.5, -20000, 20000);
    this.z = (pr.x === 0 && pr.z === 0) ? -246.4 : safeNum(pr.z, -246.4, -20000, 20000);
    this.y = GEO.ready() ? GEO.standY(this.x, this.z, safeNum(pr.y, 0, -500, 2000)) : safeNum(pr.y, 0, -500, 2000);
    this.karma = safeNum(pr.karma, 0, 0); this.pk = safeNum(pr.pk, 0, 0);
    this.inv = safeCountMap(pr.inv);
    this.equip = safeEquipMap(pr.equip);
    // Квесты: {active:{id:{p:[],at}}, done:{id:{n,at}}} — авторитет сервера.
    // Раньше состояние жило в localStorage клиента, а награды выдавались
    // локально и стирались первой же синхронизацией сумки.
    this.quests = QD.normalizeState(pr.quests);
    // Уровни приборов инженера — только серверное состояние (см. safeDevices).
    this.devices = safeDevices(pr.devices, pr.equip, this.level);
    // Заточка вещей, лежащих в сумке: {templateId: plus}. Инвентарь — счётчики
    // без экземпляров, поэтому plus снятой вещи иначе теряется.
    this.plusById = safeCountMap(pr.plusById);
    // Персональный склад: {itemId: count}, ёмкость своя (NPCS.MAX_WH_SLOTS) и
    // свой реестр заточки — иначе +N уехал бы на копию, оставшуюся в сумке.
    this.wh = safeCountMap(pr.wh);
    this.whPlusById = safeCountMap(pr.whPlusById);
    // Друзья: [{yid, name}]. Взаимный список, добавление — только по согласию.
    this.friends = safeFriendList(pr.friends);
    // Клан: id только в памяти, источник истины — Clans (отдельные файлы).
    this.clanId = null;
    this.learned = new Set(Array.isArray(pr.learned) ? pr.learned.filter(id => typeof id === 'string' && !isBadKey(id)) : []);
    // combat skills: { skillId: rank }
    this.skills = safeSkillMap(pr.skills);
    // Второй барьер по appearance: профиль мог быть записан старой версией
    // сервера без валидации, и мусор продолжал бы уходить в AOI-снапшоты.
    this.appearance = pr.appearance ? COS.normalizeAppearance(pr.appearance) : null;
    this.cosmetics = COS.normalize(pr.cosmetics || null);
    // Миграция: если у персонажа сохранён старый титул в cosmetics, переносим в слот экипа
    const legTitle = (this.cosmetics && (this.cosmetics.title || this.cosmetics.titleName)) || null;
    if (legTitle && (!this.equip || !this.equip.title)) {
      const s = String(legTitle).toLowerCase();
      let itemId = 'title_tralalero';
      if (s.includes('bombardi')) itemId = 'title_bombardiro';
      else if (s.includes('tung')) itemId = 'title_tung_tung';
      else if (s.includes('ballerina') || s.includes('cappuccino')) itemId = 'title_ballerina_cap';
      else if (s.includes('skibidi')) itemId = 'title_skibidi_steam';
      else if (s.includes('pioneer')) itemId = 'title_pioneer';
      else if (s.includes('master')) itemId = 'title_master';
      else if (ITEMS && typeof ITEMS.get === 'function' && ITEMS.get('title_' + s)) itemId = 'title_' + s;
      if (!this.equip) this.equip = Object.create(null);
      this.equip.title = { id: itemId, templateId: itemId };
      this.cosmetics.title = null;
      this.cosmetics.titleName = null;
    }
    // Прибор в экипе должен нести серверные уровни ДО первого расчёта статов:
    // корпус даёт cDef/HP/пар (item-db gearFromEquip).
    syncDevicesToEquip(this);
    // статы по классу/уровню + экип (авторитет сервера; applyClassStats на login)
    const gear0 = ITEMS.gearFromEquip(this.equip, {
      isMagePath: CS.rootClass(this.cls) === 'engineer'
    });
    const st = CS.statsAtLevel(this.cls, this.level, gear0);
    this.maxHp = Math.floor((st.maxHp || 100) + (gear0.hpBonus || 0));
    this.maxEnergy = Math.floor((st.maxEnergy || 50) + (gear0.energyBonus || 0));
    // Базовая скорость бега (класс+уровень+экип, без баффов). Кэш: clampSpeed
    // зовётся до RATE.move раз в секунду, а combatPack пересчитывает всё.
    this.speedBase = Math.max(1, +st.speed || 7.5);
    this.hp = Math.min(pr.hp != null ? pr.hp : this.maxHp, this.maxHp);
    this.energy = Math.min(pr.energy != null ? pr.energy : this.maxEnergy, this.maxEnergy);
    // L2 corpse state (persisted — reconnect still dead until village)
    this.dead = !!pr.dead;
    if (this.dead) this.hp = 0;
    this.region = (WM.regionAt(this.x, this.z) || {}).id || 'village';
    this.known = new Set(); this.knownBy = new Set(); this.cd = {}; this.rate = {}; this.seq = 0;
    this.flagUntil = 0; this.partyId = null;
    this.duel = null; // { peer, at } — только в памяти
    this._duelFrom = null;
    this._duelTo = null;
    this.buffs = []; // { id, until, attackMult, ... } — слоты через buff-rules
    this.debuffs = []; // список, не скаляры slowUntil/stunUntil (PLAN 5.3)
    this._combatPack = null;
    this._combatPackExpiry = 0;
    // Личная лавка: { mode, title, items:{itemId:{count,price}} } либо null.
    this.store = null;
    // Активная сессия обмена: { peer, offer, locked, confirmed, at } либо null.
    this.trade = null;
    // L2 pose for regen (Formulas.java): sit / stand / walk / run
    this.sitting = false;
    this.walking = false;
    this.moving = false;
    this._lastMoveAt = 0;
    // стартовые free-скиллы, если профиль пустой
    ensureStarterSkills(this);
  }
  get combatPack() {
    const now = Date.now();
    if (this._combatPack && now < this._combatPackExpiry) {
      return this._combatPack;
    }
    // Экип → gear (weaponAtk / toolAtk / armorDef / armorCDef / naked slot replace)
    const gear = ITEMS.gearFromEquip(this.equip || {}, {
      isMagePath: CS.rootClass(this.cls) === 'engineer'
    });
    const st = CS.statsAtLevel(this.cls, this.level, gear);
    const primary = st.primary || {};
    let pAtk = st.pAtk, pDef = st.pDef, cAtk = st.cAtk, cDef = st.cDef;
    let critRate = st.critRate, accuracy = st.accuracy, evasion = st.evasion;
    // пассивки из learned skills
    const pas = passiveBonuses(this);
    pAtk = Math.floor(pAtk * (1 + (pas.attackPercent || 0)) + (pas.pAtkFlat || 0));
    pDef = Math.floor(pDef * (1 + (pas.defensePercent || 0)) + (pas.pDefFlat || 0));
    cAtk = Math.floor(cAtk * (1 + (pas.cAtkPercent || 0)) + (pas.cAtkFlat || 0));
    cDef = Math.floor(cDef * (1 + (pas.cDefPercent || 0)) + (pas.cDefFlat || 0));
    if (pas.critChance) critRate += (pas.critChance <= 1 ? pas.critChance * 100 : pas.critChance);
    // Armor Mastery rEvas is flat points (C1: +3), not percent
    if (pas.evasion) {
      const ev = +pas.evasion;
      evasion += (ev > 0 && ev <= 1) ? Math.round(ev * 100) : Math.round(ev);
    }
    // buffs
    let atkM = 1, defM = 1, spdM = 1, atkSpdM = 1;
    this.buffs = BR.prune(this.buffs, now);
    this.debuffs = BR.prune(this.debuffs, now);
    atkM = BR.foldMult(this.buffs, 'attackMult', now);
    defM = BR.foldMult(this.buffs, 'defenseMult', now);
    spdM = BR.foldMult(this.buffs, 'speedMult', now);
    atkSpdM = BR.foldMult(this.buffs, 'atkSpdMult', now);
    const pDefDebM = BR.pDefMult(this.debuffs, now);
    const accDeb = BR.accFlat(this.debuffs, now);
    pAtk = Math.floor(pAtk * atkM);
    cAtk = Math.floor(cAtk * atkM);
    pDef = Math.floor(pDef * defM * pDefDebM);
    cDef = Math.floor(cDef * defM);
    const maxHp = Math.floor(st.maxHp * (1 + (pas.hpPercent || 0)) + (gear.hpBonus || 0));
    const buffMaxEn = BR.foldAdd ? BR.foldAdd(this.buffs, 'maxEnergyBonus', now) : 0;
    const maxEnergy = Math.floor(
      st.maxEnergy * (1 + (pas.energyPercent || 0)) + (pas.maxEnergyFlat || 0) + (gear.energyBonus || 0) + buffMaxEn
    );
    // ---- C1 Atk.Spd: база ТИПА ОРУЖИЯ × DEX_Mod × баффы ----
    // Раньше сервер считал интервал автоатаки как max(400, 1000/(1+DEX/100)):
    // кинжал (база 333) и двуручный посох (190) били одинаково, а клиент при
    // этом анимировал по swingTimeSec(atkSpdL2) — картинка и цифры расходились,
    // и часть легитимных пакетов атаки сервер молча отбрасывал по своему CD.
    const wClassPack = gear.weaponClass || st.weaponClass || 'fist';
    const wBase = gear.weaponAtkBase != null ? gear.weaponAtkBase : L2.weaponBaseAtkSpd(wClassPack);
    // pas.attackSpeed — пассивки (Magician's Movement +0.25 в робе только для боя кулаками / без оружия),
    // atkSpdM — активные баффы haste (gun_rapid_fire attackSpeedBoost).
    const isFistPack = (wClassPack === 'fist');
    const pasAtkSpd = isFistPack ? (pas.attackSpeed || 0) : 0;
    let atkSpdL2 = L2.atkSpdL2(wBase, primary.DEX || 20, (1 + pasAtkSpd) * atkSpdM);
    const wGrade = equippedWeaponGrade(this);
    const aGrade = equippedArmorGrade(this);
    const gradePen = GR.penalty(GR.expertiseRank(this.skills), wGrade, aGrade);
    if (gradePen.accuracy) accuracy = Math.max(1, accuracy + gradePen.accuracy);
    if (accDeb) accuracy = Math.max(1, accuracy + accDeb);
    if (gradePen.atkSpdMult < 1) atkSpdL2 = Math.max(1, atkSpdL2 * gradePen.atkSpdMult);
    const swingSec = L2.swingTimeSec(atkSpdL2);
    const buffCritDmg = BR.foldAdd ? BR.foldAdd(this.buffs, 'critDamageBoost', now) : 0;
    const vampiric = BR.foldAdd ? BR.foldAdd(this.buffs, 'vampiric', now) : 0;
    const stunResist = BR.foldAdd ? BR.foldAdd(this.buffs, 'stunResist', now) : 0;
    const hpRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'hpRegenFlat', now) : 0;
    const energyRegenFlat = BR.foldAdd ? BR.foldAdd(this.buffs, 'energyRegenFlat', now) : 0;
    const energyRegenMult = BR.foldMult ? BR.foldMult(this.buffs, 'energyRegenMult', now) : 1;
    const adenaMult = BR.foldMult ? BR.foldMult(this.buffs, 'adenaMult', now) : 1;
    const dropMult = BR.foldMult ? BR.foldMult(this.buffs, 'dropMult', now) : 1;
    const spdVal = Math.max(1, (+st.speed || 7.5) * spdM);
    const clsObj = CS.getClass ? CS.getClass(this.cls) : null;
    const pack = {
      pAtk, pDef, cAtk, cDef, mAtk: cAtk, mDef: cDef,
      accuracy, evasion, critRate, critDamage: 2.0 + (pas.critDamage || 0) + buffCritDmg,
      vampiric, stunResist, hpRegenFlat, energyRegenFlat, energyRegenMult, adenaMult, dropMult,
      level: this.level, dex: primary.DEX || 20, wit: primary.WIT || 20,
      tier: (clsObj && clsObj.tier != null) ? clsObj.tier : 0,
      primary, maxHp, maxEnergy,
      // CharTemplate: baseHpReg 1.5 / baseMpReg 0.9
      baseHpReg: st.baseHpReg != null ? st.baseHpReg : 1.5,
      baseMpReg: st.baseMpReg != null ? st.baseMpReg : 0.9,
      weaponClass: wClassPack,
      weaponAtkBase: wBase,
      atkSpdL2: atkSpdL2,
      swingSec: swingSec,
      /** Интервал автоатаки в мс, который сервер ставит в p.cd.atk. Квантован шагом 100 мс. */
      atkIntervalMs: L2.quantizeCombatMs ? L2.quantizeCombatMs(Math.max(ATK_INTERVAL_MIN_MS, Math.round(swingSec * 1000 * ATK_INTERVAL_SLACK)), 100) : Math.max(ATK_INTERVAL_MIN_MS, Math.round(swingSec * 1000 * ATK_INTERVAL_SLACK)),
      hasShield: !!gear.hasShield,
      shieldDef: gear.shieldDef || 0,
      // Скорость бега: base — класс+уровень+экип, speed — с баффами (speedBoost).
      // Нужны обе: clampSpeed кэширует base и домножает буст сам (см. speedNow).
      speedBase: Math.max(1, +st.speed || 7.5),
      speed: spdVal,
      speedL2: Math.round(spdVal * 16),
      gear,
      gradePenalty: gradePen
    };
    let minUntil = Infinity;
    if (Array.isArray(this.buffs)) {
      for (let i = 0; i < this.buffs.length; i++) {
        const u = this.buffs[i] && this.buffs[i].until;
        if (typeof u === 'number' && u > now && u < minUntil) minUntil = u;
      }
    }
    if (Array.isArray(this.debuffs)) {
      for (let i = 0; i < this.debuffs.length; i++) {
        const u = this.debuffs[i] && this.debuffs[i].until;
        if (typeof u === 'number' && u > now && u < minUntil) minUntil = u;
      }
    }
    this._combatPack = pack;
    this._combatPackExpiry = minUntil === Infinity ? (now + 60000) : minUntil;
    return pack;
  }
  get pAtk() { return this.combatPack.pAtk; }
  get pDef() { return this.combatPack.pDef; }
  get cAtk() { return this.combatPack.cAtk; }
  get cDef() { return this.combatPack.cDef; }
  get mAtk() { return this.cAtk; }
  get mDef() { return this.cDef; }
  get isFlagged() { return Date.now() < this.flagUntil; }
  applyClassStats() {
    this._combatPack = null;
    this._combatPackExpiry = 0;
    const pack = this.combatPack;
    const hpRatio = this.maxHp > 0 ? this.hp / this.maxHp : 1;
    const enRatio = this.maxEnergy > 0 ? this.energy / this.maxEnergy : 1;
    this.maxHp = pack.maxHp;
    this.maxEnergy = pack.maxEnergy;
    this.hp = Math.max(1, Math.floor(this.maxHp * hpRatio));
    this.energy = Math.max(0, Math.floor(this.maxEnergy * enRatio));
    this.classTier = (CS.getClass(this.cls) || {}).tier || 0;
    // speedBase — без баффов: пересчитывается на level-up / equip / профессию
    this.speedBase = Math.max(1, +pack.speedBase || 7.5);
  }
}

/**
 * C1 Spellcraft / Magician's Movement / Mana Recovery:
 * куртка + штаны робы (chest+legs armorType=robe). Не «любой один слот».
 */
function hasRobeSetEquipped(equip) {
  return ITEMS.hasRobeSet ? ITEMS.hasRobeSet(equip) : ITEMS.hasRobe(equip);
}

/**
 * Полный именной сет (Devotion / Кармиан / Авадон) — доп. % к Casting Spd.
 * Только поверх активного комплекта робы (Spellcraft).
 */
function namedSetCastBonus(equip) {
  if (!hasRobeSetEquipped(equip)) return 0;
  if (ITEMS.castSpeedSetBonus) return ITEMS.castSpeedSetBonus(equip) || 0;
  return ITEMS.devotionSetPct(equip) || 0;
}

function armorSetBonuses(equip) {
  if (ITEMS.evaluateSets) return ITEMS.evaluateSets(equip || {});
  return null;
}

/**
 * C1 Soulshot / Spiritshot / Blessed Spiritshot (auto-use when armed).
 * grade must match weapon crystal grade (fists = no_grade).
 * SPS ×1.5 | BSPS ×2.0 | SS ×2.0
 */
const SHOT_ITEMS = {
  soulshot_no_grade: { kind: 'ss', mult: 2.0, grade: 'no_grade' },
  soulshot_d: { kind: 'ss', mult: 2.0, grade: 'd' },
  soulshot_c: { kind: 'ss', mult: 2.0, grade: 'c' },
  spiritshot_no_grade: { kind: 'sps', mult: 1.5, grade: 'no_grade' },
  spiritshot_d: { kind: 'sps', mult: 1.5, grade: 'd' },
  spiritshot_c: { kind: 'sps', mult: 1.5, grade: 'c' },
  blessed_spiritshot_no_grade: { kind: 'bsps', mult: 2.0, grade: 'no_grade' },
  blessed_spiritshot_d: { kind: 'bsps', mult: 2.0, grade: 'd' },
  blessed_spiritshot_c: { kind: 'bsps', mult: 2.0, grade: 'c' }
};

function normalizeItemGrade(g) {
  return GR.normalize(g);
}

/** Crystal grade оружия: только шаблон item-db (equip/штраф/шоты — один источник).
 *  loot-rules и regex-лестница сюда не лезут: steam_hammer без grade в ITEMS
 *  иначе становился D и ловил ×0.84 Atk.Spd на 1 уровне. Нет поля = NG. */
function equippedWeaponGrade(p) {
  const eq = (p && p.equip) || {};
  const w = eq.weapon || eq.WEAPON;
  if (!w) return 'no_grade';
  if (w.grade) return GR.normalize(w.grade);
  if (w.template && w.template.grade) return GR.normalize(w.template.grade);
  const id = String(w.id || w.templateId || (w.template && w.template.id) || '').toLowerCase();
  if (!id || isBadKey(id)) return 'no_grade';
  try {
    const tpl = ITEMS.get ? ITEMS.get(id) : null;
    if (tpl) return GR.normalize(tpl.grade);
    const rt = ITEMS.resolveTemplate ? ITEMS.resolveTemplate(w) : null;
    if (rt) return GR.normalize(rt.grade);
  } catch (e) { /* ignore */ }
  return 'no_grade';
}

function shotKindMatchesFilter(kind, kindFilter) {
  if (!kindFilter) return true;
  if (kind === kindFilter) return true;
  // magic skills accept SPS or BSPS
  if (kindFilter === 'sps' && kind === 'bsps') return true;
  return false;
}

/**
 * Arm/disarm shots (L2: right-click enables auto-consume per hit).
 */
function toggleShotArm(p, itemId) {
  itemId = String(itemId || '').toLowerCase();
  const meta = tableGet(SHOT_ITEMS, itemId);
  if (!meta) return null;
  if ((p.inv[itemId] || 0) < 1) return { ok: false, reason: 'empty', id: itemId };
  if (p.armedShot === itemId) {
    p.armedShot = null;
    return { ok: true, armed: false, id: itemId, inv: p.inv };
  }
  p.armedShot = itemId;
  const wGrade = equippedWeaponGrade(p);
  const gradeOk = normalizeItemGrade(meta.grade) === wGrade;
  return {
    ok: true,
    armed: true,
    id: itemId,
    kind: meta.kind,
    mult: meta.mult,
    grade: meta.grade,
    weaponGrade: wGrade,
    gradeOk: gradeOk,
    inv: p.inv
  };
}

/**
 * Consume 1 armed shot if type + grade match weapon.
 * @returns {{ shotMod: number, consumed: string|null, kind: string|null, gradeFail?: boolean }}
 */
function consumeArmedShot(p, kindFilter) {
  const id = p.armedShot;
  if (!id) return { shotMod: 1.0, consumed: null, kind: null };
  const meta = tableGet(SHOT_ITEMS, id);
  if (!meta) { p.armedShot = null; return { shotMod: 1.0, consumed: null, kind: null }; }
  if (!shotKindMatchesFilter(meta.kind, kindFilter)) {
    return { shotMod: 1.0, consumed: null, kind: null };
  }
  // C1: shot crystal grade must equal weapon grade
  const wGrade = equippedWeaponGrade(p);
  if (normalizeItemGrade(meta.grade) !== wGrade) {
    // throttle chat spam
    const now = Date.now();
    if (!p._lastShotGradeMsg || now - p._lastShotGradeMsg > 8000) {
      p._lastShotGradeMsg = now;
      try {
        send(p, {
          t: 'msg',
          text: 'Заряд не подходит к оружию (нужен грейд: ' + wGrade + ').'
        });
      } catch (e) { /* send may be later in file — guarded */ }
    }
    return { shotMod: 1.0, consumed: null, kind: null, gradeFail: true };
  }
  if ((p.inv[id] || 0) < 1) {
    p.armedShot = null;
    return { shotMod: 1.0, consumed: null, kind: null };
  }
  p.inv[id] -= 1;
  if (p.inv[id] <= 0) {
    delete p.inv[id];
    p.armedShot = null;
  }
  return { shotMod: meta.mult, consumed: id, kind: meta.kind };
}

function passiveBonuses(p) {
  const out = {
    attackPercent: 0, defensePercent: 0, hpPercent: 0, energyPercent: 0,
    critChance: 0, evasion: 0, cAtkPercent: 0, cDefPercent: 0,
    critDamage: 0, maxEnergyFlat: 0, attackSpeed: 0, chargeSpeed: 0,
    castSpeedSet: 0, energyRegen: 0, pAtkFlat: 0, cAtkFlat: 0, pDefFlat: 0, cDefFlat: 0,
    healPower: 0, speedL2: 0, hpRegenSit: 0, mpRegenSit: 0, lucky: false,
    robeSetActive: false, activeSets: []
  };
  if (!p.skills && !p.equip) return out;
  const robeSetOk = hasRobeSetEquipped(p.equip);
  out.robeSetActive = robeSetOk;
  // Сет-бонус cast (Devotion/Karmian/Avadon) только при робе-комплекте
  out.castSpeedSet = robeSetOk ? namedSetCastBonus(p.equip) : 0;
  // Остальные сет-бонусы (Знание cAtk%, Демон INT, Рок speed уже в gear…)
  const setB = armorSetBonuses(p.equip);
  if (setB) {
    out.activeSets = setB.active || [];
    // hpFlat/energyFlat уже в gearFromEquip — только % и regen здесь
    if (setB.cAtkPercent) out.cAtkPercent += setB.cAtkPercent;
    if (setB.pDefPercent) out.defensePercent += setB.pDefPercent;
    if (setB.energyPercent) out.energyPercent += setB.energyPercent;
    if (setB.energyRegen) out.energyRegen += setB.energyRegen;
  }
  if (!p.skills) return out;
  Object.keys(p.skills).forEach((id) => {
    const tpl = SK.get(id);
    if (!tpl || tpl.type !== 'passive') return;
    const rank = p.skills[id] || 1;
    const eff = tpl.effectPerLevel || {};
    // requiresRobe / requiresRobeSet → нужен комплект куртка+штаны робы
    const robeGated = !!(tpl.requiresRobe || tpl.requiresRobeSet);
    const robeActive = !robeGated || robeSetOk;
    // requiresHeavy / requiresLight → привязка к типу надетого доспеха
    const heavyGated = !!tpl.requiresHeavy;
    const heavyActive = !heavyGated || (ITEMS.hasHeavyArmor && ITEMS.hasHeavyArmor(p.equip));
    const lightGated = !!tpl.requiresLight;
    const lightActive = !lightGated || (ITEMS.hasLightArmor && ITEMS.hasLightArmor(p.equip));
    if (!heavyActive || !lightActive) return;
    Object.keys(out).forEach((k) => {
      if (k === 'robeSetActive' || k === 'castSpeedSet') return;
      if (eff[k]) out[k] += eff[k] * rank;
    });
    if (eff.maxEnergy) out.maxEnergyFlat += eff.maxEnergy * rank;
    if (eff.healPower) out.healPower += eff.healPower * rank;
    const r = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
    if (r) {
      if (r.pAtkPercent != null) out.attackPercent += r.pAtkPercent;
      else if (r.attackPercent != null) out.attackPercent += r.attackPercent;
      if (r.cAtkPercent != null) out.cAtkPercent += r.cAtkPercent;
      if (r.pAtkFlat != null) out.pAtkFlat += r.pAtkFlat;
      if (r.cAtkFlat != null) out.cAtkFlat += r.cAtkFlat;
      if (r.pDefFlat != null) out.pDefFlat += r.pDefFlat;
      if (r.cDefFlat != null) out.cDefFlat += r.cDefFlat;
      if (r.evasion != null) out.evasion += r.evasion;
      if (r.speedL2 != null) out.speedL2 += r.speedL2;
      if (r.hpRegenSit != null) out.hpRegenSit += r.hpRegenSit;
      if (r.mpRegenSit != null) out.mpRegenSit += r.mpRegenSit;
      if (r.lucky) out.lucky = true;
      // Spellcraft (+100% cast), Magician's Movement (+25% Atk.Spd), Mana Recovery — только в комплекте робы
      if (robeActive) {
        if (r.attackSpeed) out.attackSpeed += r.attackSpeed;
        if (r.chargeSpeed) out.chargeSpeed += r.chargeSpeed; // 1.0 = Spellcraft ×2
        if (r.energyRegen) out.energyRegen += r.energyRegen;
      }
    }
  });
  // без робы-комплекта сет-каст не копит даже если пассивки дали chargeSpeed=0
  if (!robeSetOk) {
    out.chargeSpeed = 0;
    out.castSpeedSet = 0;
    // Magician's Movement / Mana Recovery тоже гасим, если gated через ranks выше
  }
  return out;
}

function ensureStarterSkills(p) {
  if (!p.skills) p.skills = {};
  const root = CS.rootClass(p.cls);
  const starters = root === 'engineer'
    ? [
        'eng_lucky', 'eng_expert_tune', 'eng_robe_step',
        'eng_coolant_mind', 'eng_pressure_bolt', 'eng_self_repair'
      ]
    : ['op_power_strike', 'op_weapon_mastery'];
  // test_immortal (600 с неуязвимости, КД 2 с) и gm_oneshot (ваншот любой цели) — только GM.
  // Обычным игрокам даже в dev не выдаются.
  const isPlayerGm = isGM(p);
  if (isPlayerGm) {
    starters.push('test_immortal');
    starters.push('gm_oneshot');
    starters.push('gm_resurrect');
    starters.push('gm_speed');
    if (p.skills && p.skills.gm_flash) {
      delete p.skills.gm_flash;
      p.skills.gm_speed = 1;
    }
  } else {
    if (p.skills && p.skills.test_immortal) delete p.skills.test_immortal;
    if (p.skills && p.skills.gm_oneshot) delete p.skills.gm_oneshot;
    if (p.skills && p.skills.gm_resurrect) delete p.skills.gm_resurrect;
    if (p.skills && p.skills.gm_flash) delete p.skills.gm_flash;
    if (p.skills && p.skills.gm_speed) delete p.skills.gm_speed;
  }
  starters.forEach((id) => {
    if (!p.skills[id] && SK.get(id)) p.skills[id] = 1;
  });
  grantExpertiseSkills(p);
}

/** L2: Expertise D выдаётся с 1-й профессией, не за сам 20 уровень. */
function grantExpertiseSkills(p) {
  if (!p || (p.classTier | 0) < 1) return;
  const id = GR.expertiseSkillId(CS.rootClass(p.cls));
  if (!p.skills) p.skills = {};
  if (!p.skills[id] && SK.get(id)) p.skills[id] = 1;
}

function equippedArmorGrade(p) {
  let best = 'no_grade';
  let bestR = 0;
  const eq = (p && p.equip) || {};
  for (const slot of Object.keys(eq)) {
    if (slot === 'weapon') continue;
    const e = eq[slot];
    const tid = e && String(e.templateId || e.id || '').toLowerCase();
    if (!tid || isBadKey(tid)) continue;
    const tpl = ITEMS.get(tid);
    const g = tpl && tpl.grade;
    const r = GR.rank(g);
    if (r > bestR) { bestR = r; best = GR.normalize(g); }
  }
  return best;
}

/** Active test/debug immortal buff — ignore all damage to the player. */
function isPlayerImmortal(p) {
  if (!p) return false;
  if (p.invul) return true;
  if (!Array.isArray(p.buffs) || !p.buffs.length) return false;
  const now = Date.now();
  for (let i = 0; i < p.buffs.length; i++) {
    const b = p.buffs[i];
    if (!b || !(b.until > now)) continue;
    if (b.immortal || b.invulnerable || b.id === 'test_immortal') return true;
  }
  return false;
}

function effectsPayload(p) {
  const now = Date.now();
  p.buffs = BR.prune(p.buffs, now);
  p.debuffs = BR.prune(p.debuffs, now);
  return {
    t: 'effects',
    buffs: p.buffs.map((e) => BR.publicView(e, now)),
    debuffs: p.debuffs.map((e) => BR.publicView(e, now)),
    cap: { buffs: BR.MAX_BUFFS, debuffs: BR.MAX_DEBUFFS }
  };
}

function invalidateCombatPack(p) {
  if (p) {
    p._combatPack = null;
    p._combatPackExpiry = 0;
  }
}

function pushEffects(p) {
  invalidateCombatPack(p);
  send(p, effectsPayload(p));
}

function applyPlayerBuff(p, buff, now) {
  now = now || Date.now();
  const r = BR.apply(p.buffs, Object.assign({ kind: 'buff' }, buff), now);
  p.buffs = r.list;
  invalidateCombatPack(p);
  return r;
}

function applyPlayerDebuff(p, deb, now) {
  now = now || Date.now();
  const r = BR.apply(p.debuffs, Object.assign({ kind: 'debuff' }, deb), now);
  p.debuffs = r.list;
  invalidateCombatPack(p);
  if (p.casting && (deb.kind === 'stun' || deb.stun || deb.kind === 'silence' || deb.silence)) {
    cancelPlayerCast(p, deb.kind || 'debuff');
  }
  return r;
}

function playerStunned(p, now) {
  return BR.hasKind(p.debuffs, 'stun', now || Date.now());
}

function playerSilenced(p, now) {
  return BR.hasKind(p.debuffs, 'silence', now || Date.now());
}

function itemLookup(id) {
  id = String(id || '').toLowerCase();
  if (!id) return null;
  try {
    if (ITEMS && ITEMS.get) {
      const a = ITEMS.get(id);
      if (a) return a;
    }
  } catch (e) { /* ignore */ }
  try {
    if (LR && LR.itemById) return LR.itemById(id);
    if (LR && LR.LOOT_ITEMS) return LR.LOOT_ITEMS[id] || null;
  } catch (e2) { /* ignore */ }
  return null;
}

function playerCon(p) {
  const pack = p && p.combatPack;
  const prim = (pack && pack.primary) || {};
  return prim.CON != null ? +prim.CON : 43;
}

function playerWeightState(p) {
  const load = WR.totalLoad(p.inv, p.equip, itemLookup);
  const max = WR.maxLoad(playerCon(p));
  return WR.penalty(load, max);
}

function weightPayload(p) {
  const st = playerWeightState(p);
  return {
    weight: st.load,
    maxWeight: st.max,
    weightRatio: Math.round(st.ratio * 1000) / 1000,
    noRegen: !!st.noRegen,
    weightSpeed: st.speedMult,
    canAttack: !!st.canAttack,
    overloaded: !!st.overloaded
  };
}

function pushWeight(p) {
  send(p, Object.assign({ t: 'weight' }, weightPayload(p)));
}

function canCarryMore(p, itemId, count) {
  return WR.canAdd(p.inv, p.equip, itemId, count, playerCon(p), itemLookup);
}

function invAfter(inv, minus, plus) {
  const next = Object.assign(Object.create(null), inv || {});
  if (minus) {
    for (const id of Object.keys(minus)) {
      next[id] = (next[id] | 0) - (minus[id] | 0);
      if (next[id] <= 0) delete next[id];
    }
  }
  if (plus) {
    for (const id of Object.keys(plus)) {
      next[id] = (next[id] | 0) + (plus[id] | 0);
    }
  }
  return next;
}

function wouldExceedWeight(p, minus, plus) {
  const load = WR.totalLoad(invAfter(p.inv, minus, plus), p.equip, itemLookup);
  const max = WR.maxLoad(playerCon(p));
  return { ok: load <= max, load: load, max: max };
}

function failWeight(p, t, extra) {
  const st = playerWeightState(p);
  send(p, Object.assign({ t: t || 'loot_fail', reason: 'weight', weight: st.load, maxWeight: st.max }, extra || {}));
}

function skillAllowedForClass(p, templateClass) {
  if (!templateClass) return false;
  if (templateClass === 'any' || templateClass === 'all' || templateClass === '*') return true;
  if (templateClass === p.cls) return true;
  const line = CS.classLineage(p.cls);
  return line.indexOf(templateClass) !== -1;
}

function cosmeticsPublic(p) {
  const c = p && p.cosmetics ? p.cosmetics : null;
  const isGm = isGM(p);
  const defaultAura = isGm ? 'gm_champion' : null;
  const defaultNameColor = isGm ? '#00f0ff' : null;
  const defaultTitle = isGm ? 'GM' : null;
  const defaultTitleColor = isGm ? '#ffd700' : null;

  let eqTitle = p && p.equip && p.equip.title;
  let eqTitleTpl = null;
  if (eqTitle) {
    const tid = String(eqTitle.templateId || eqTitle.id || '').toLowerCase();
    eqTitleTpl = (ITEMS && typeof ITEMS.get === 'function') ? ITEMS.get(tid) : null;
  }

  let effectiveAura = (c && c.aura && c.aura !== 'none' && c.aura !== 'off')
    ? c.aura
    : ((c && (c.aura === 'none' || c.aura === 'off')) ? null : defaultAura);

  if (effectiveAura && !isGm && (!p || !p.dev)) {
    const now = Date.now();
    const hasAuraBuff = Array.isArray(p.buffs) && p.buffs.some(b => b && b.auraId && b.until > now);
    if (!hasAuraBuff) {
      effectiveAura = null;
      if (c) c.aura = null;
    }
  }

  let resolvedTitleName = eqTitleTpl
    ? (eqTitleTpl.titleText || eqTitleTpl.name)
    : (isGm ? defaultTitle : null);

  if (isGm && !eqTitleTpl && (!resolvedTitleName || resolvedTitleName === '[Administrator]' || resolvedTitleName === '[Game Master]')) {
    resolvedTitleName = 'GM';
  }

  let resolvedTitleColor = eqTitleTpl
    ? (eqTitleTpl.titleColor || '#ffd700')
    : (isGm ? defaultTitleColor : null);

  return {
    title: (eqTitleTpl && eqTitleTpl.id) || null,
    titleName: resolvedTitleName || null,
    titleColor: resolvedTitleColor || null,
    nameColor: (c && c.nameColor) || defaultNameColor,
    aura: effectiveAura
  };
}

/** Grant free skill rank 1 (scroll). Returns true if newly learned. */
function grantSkillFree(p, skillId) {
  skillId = String(skillId || '').toLowerCase();
  const tpl = SK.get(skillId);
  if (!tpl) return { ok: false, reason: 'unknown' };
  if (!skillAllowedForClass(p, tpl.class)) return { ok: false, reason: 'class' };
  if (!p.skills) p.skills = {};
  if ((p.skills[skillId] || 0) >= 1) return { ok: true, already: true, skillId, name: tpl.name };
  p.skills[skillId] = 1;
  return { ok: true, already: false, skillId, name: tpl.name };
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
  pruneAddMids,
  notifyMobRemoved,
  despawnMobSilent,
  despawnAdds,
  spawnRaidAdds,
  tryMobSkill,
  hateFromHit,
  addMobHate,
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
function isSyntheticBot(yid) {
  if (!yid) return false;
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

function profileOf(p) {
  // Возвращает ССЫЛКИ на p.inv/p.equip/p.skills, а не копии. Это безопасно
  // только потому, что DB.save делает JSON.stringify синхронно, до первого
  // await. Не вставлять await между profileOf и DB.save.
  return {
    charId: CH.normalizeCharId(p.charId),
    createdAt: p.createdAt || 0,
    name: p.name, level: p.level, exp: p.exp, sp: p.sp || 0,
    race: p.race || 'human', gender: p.gender || 'male',
    cls: p.cls, classTier: p.classTier || 0,
    classHistory: Array.isArray(p.classHistory) ? p.classHistory : [p.cls],
    x: p.x, y: p.y, z: p.z,
    hp: p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy,
    dead: !!p.dead,
    karma: p.karma, pk: p.pk,
    accessLevel: p.accessLevel || 0,
    gm: isGM(p),
    inv: p.inv, equip: p.equip, learned: p.learned ? [...p.learned] : [],
    plusById: p.plusById || {},
    wh: p.wh || {},
    whPlusById: p.whPlusById || {},
    friends: Array.isArray(p.friends) ? p.friends : [],
    devices: p.devices || null,
    quests: p.quests || null,
    skills: p.skills || {},
    appearance: p.appearance || null,
    cosmetics: COS.normalize(p.cosmetics || null)
  };
}

function selfPayload(p) {
  const cd = CS.getClass(p.cls);
  const pack = p.combatPack;
  const tag = clanTagOf(p);
  const w = weightPayload(p);
  return {
    x: p.x, y: p.y, z: p.z,
    hp: p.hp, maxHp: p.maxHp, energy: p.energy, maxEnergy: p.maxEnergy,
    dead: !!p.dead,
    level: p.level, exp: p.exp || 0, sp: p.sp || 0,
    gmSpeedMul: p.gmSpeedMul || 1,
    flashSpeed: !!p.flashSpeed,
    expToNext: EXP.expToNext(p.level),
    cls: p.cls, className: cd ? cd.name : p.cls,
    classTier: p.classTier || 0,
    race: p.race || 'human',
    gender: p.gender || 'male',
    path: cd ? cd.path : 'fighter',
    karma: p.karma,
    appearance: p.appearance || null,
    pAtk: pack.pAtk, pDef: pack.pDef, cAtk: pack.cAtk, cDef: pack.cDef,
    accuracy: pack.accuracy, evasion: pack.evasion, critRate: pack.critRate,
    primary: pack.primary,
    weaponClass: pack.weaponClass || 'fist',
    atkSpdL2: pack.atkSpdL2,
    atkIntervalMs: pack.atkIntervalMs,
    skills: p.skills || {},
    cosmetics: cosmeticsPublic(p),
    cosmeticsFull: COS.normalize(p.cosmetics || null),
    clanId: tag.clanId,
    clanName: tag.clanName,
    crestHash: tag.crestHash,
    weight: w.weight,
    maxWeight: w.maxWeight
  };
}

/** Боевые статы + экип — после equip/unequip/login. */
function combatStatsPayload(p) {
  const pack = p.combatPack;
  const w = weightPayload(p);
  return {
    t: 'combat_stats',
    pAtk: pack.pAtk,
    pDef: pack.pDef,
    cAtk: pack.cAtk,
    cDef: pack.cDef,
    accuracy: pack.accuracy,
    evasion: pack.evasion,
    critRate: pack.critRate,
    critDamage: pack.critDamage,
    vampiric: pack.vampiric,
    stunResist: pack.stunResist,
    hpRegenFlat: pack.hpRegenFlat,
    energyRegenFlat: pack.energyRegenFlat,
    energyRegenMult: pack.energyRegenMult,
    adenaMult: pack.adenaMult,
    dropMult: pack.dropMult,
    maxHp: pack.maxHp,
    maxEnergy: pack.maxEnergy,
    hp: p.hp,
    energy: p.energy,
    primary: pack.primary,
    weaponClass: pack.weaponClass || 'fist',
    // Скорость атаки — авторитет сервера: клиент анимирует и ставит свой
    // локальный кулдаун по этим числам, иначе часть ударов уходила в пустоту.
    atkSpdL2: pack.atkSpdL2,
    atkIntervalMs: pack.atkIntervalMs,
    speed: pack.speed,
    speedL2: pack.speedL2,
    speedBase: pack.speedBase,
    equip: p.equip || {},
    gradePenalty: pack.gradePenalty || null,
    weight: w.weight,
    maxWeight: w.maxWeight,
    noRegen: w.noRegen,
    canAttack: w.canAttack
  };
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
  // Для ботов порог 32 КБ, для живых игроков — 128 КБ с приоритетом таргета
  const isBot = isSyntheticBot(p.yid);
  const maxBuffer = isBot ? 32768 : 131072;
  if (ws.bufferedAmount > maxBuffer) {
    if (!isBot) {
      const tgtKey = p.target ? (p.target.type === 'm' ? 'm' + p.target.mid : 'p' + p.target.pid) : null;
      let filtered = tgtKey ? updList.filter(u => u.k === tgtKey) : [];
      if (!filtered.length) {
        filtered = updList.slice(0, 3);
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
          // Наблюдатель — синтетический бот: не шлём визуальные FX, косметику и чужой бой
          if (isBotOrigin && (isCombatFx || o.t === 'cosmetic' || o.t === 'flash_fx' || o.t === 'resurrect_fx')) {
            continue;
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
  } else {
    const pKey = 'p' + p.pid;
    for (const [pid, obs] of players) {
      if (pid !== p.pid && obs.known && obs.known.has(pKey)) {
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
          // Наблюдатель — синтетический бот: не шлём визуальные FX, косметику и чужой бой
          if (isBotOrigin && (isCombatFx || o.t === 'cosmetic' || o.t === 'flash_fx' || o.t === 'resurrect_fx')) {
            continue;
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
function broadcastMoveVecStart(p, startX, startZ, targetX, targetZ, speed, flags) {
  const key = 'p' + p.pid;
  const now = Date.now();
  let binBuf = null;
  let jsonMsg = null;
  const isOriginBot = p.yid && isSyntheticBot(p.yid);

  const sendToObserver = (obs) => {
    if (!obs || obs.pid === p.pid) return;
    const isObsBot = obs.yid && isSyntheticBot(obs.yid);
    if (isOriginBot && isObsBot) return; // Боты не транслируют вектор движения другим ботам
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

  if (p.knownBy) {
    if (p.knownBy.size > 0) {
      for (const pid of p.knownBy) {
        const obs = players.get(pid);
        if (obs) sendToObserver(obs);
      }
    }
  } else {
    for (const [pid, obs] of players) {
      if (pid !== p.pid && obs.known && obs.known.has(key)) {
        sendToObserver(obs);
      }
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

  const sendToObserver = (obs) => {
    if (!obs || obs.pid === p.pid) return;
    const isObsBot = obs.yid && isSyntheticBot(obs.yid);
    if (isOriginBot && isObsBot) return; // Боты не транслируют остановку другим ботам
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

  if (p.knownBy) {
    if (p.knownBy.size > 0) {
      for (const pid of p.knownBy) {
        const obs = players.get(pid);
        if (obs) sendToObserver(obs);
      }
    }
  } else {
    for (const [pid, obs] of players) {
      if (pid !== p.pid && obs.known && obs.known.has(key)) {
        sendToObserver(obs);
      }
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


/** Прервать каст персонажа и уведомить AOI (3.3). */
function cancelPlayerCast(p, reason) {
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
    ownerPartyId: null,
    // Кому именно достанется пачка в режимах random / turn (иначе null).
    winnerPid: null,
    protectUntil: now + LOOT_PROTECT_SEC * 1000,
    expireAt: now + LOOT_LIFE_SEC * 1000,
    spoil: !!opts.spoil,
    mobId: opts.mobId || null,
    deathDrop: !!opts.deathDrop
  };
  if ((opts.plus | 0) > 0) L.plus = opts.plus | 0;
  if (L.ownerPid != null) {
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
  const isPartyDrop = pa && (L.ownerPartyId === p.partyId || (L.ownerPid != null && pa.members.has(L.ownerPid)));

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
    if (!plusMoveOk(fromCounts, fromPlus, recipient.inv, recipient.plusById, L.itemId, L.count, {
      toLocked: equippedCount(recipient, L.itemId),
      toExtraPlus: equippedPlus(recipient, L.itemId)
    })) {
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
    const passive = !!sp.passive || zoneHi <= 5;
    const m = new Mob(nextId++, sp.mob || 'scrapper', spawnLvl, x, z, bossDef, {
      passive: passive && !isBoss,
      boss: isBoss,
      respawnSec: isBoss ? bossRespawn : undefined
    });
    m.spotIdx = idx;
    m.huntZoneId = sp.huntZoneId || null;
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
    if (l0 != null && l1 != null) return name + ' (ур.' + l0 + '–' + l1 + ')';
    return name;
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
  if (p.yid && isSyntheticBot(p.yid)) return;
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
const MAX_SERVER_AOI_MOBS = 32;

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
  if (isKnown) priority += 25000; // Сильный гистерезис: уже видимый объект НЕ должен выпадать из поля зрения
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
  if (isKnown) priority += 25000; // Сильный гистерезис
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

  if (nativeSpatialGrid) {
    const res = nativeSpatialGrid.queryRadius(p.x, p.z, AOI_LEAVE_RADIUS, _nativePBuf, _nativeMBuf);
    for (let i = 0; i < res.players; i++) {
      const pl = players.get(_nativePBuf[i]);
      if (pl) _aoiOnPlayer(pl);
    }
    for (let i = 0; i < res.mobs; i++) {
      const mb = mobs.get(_nativeMBuf[i]);
      if (mb) _aoiOnMob(mb);
    }
  } else {
    spatialGrid.forEachCandidate(p.x, p.z, AOI_LEAVE_RADIUS, _aoiOnPlayer, _aoiOnMob);
  }

  _aoiObs = null;
  _aoiPartySet = null;

  // Ограничение видимости для поддержания стабильных 60 FPS:
  // Для живого игрока 128 игроков (полная толпа площади города со 120 ботами без мерцания/пропадания)
  // Для синтетического бота 24 игрока (достаточно для естественного окружения и взаимодействия)
  const isMeBot = isSyntheticBot(p.yid);
  const maxPlayersAllowed = isMeBot ? 24 : 128;
  if (_sharedCandPlayers.length > maxPlayersAllowed) {
    quickSelectTopK(_sharedCandPlayers, maxPlayersAllowed);
  }
  if (_sharedCandMobs.length > MAX_SERVER_AOI_MOBS) {
    quickSelectTopK(_sharedCandMobs, MAX_SERVER_AOI_MOBS);
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

  // Актуализируем обратную таблицу наблюдателей knownBy
  for (let i = 0; i < enter.length; i++) {
    const ek = enter[i];
    if (ek.charCodeAt(0) === 112 /* 'p' */) {
      const targetP = players.get(fastIdFromKey(ek));
      if (targetP) {
        if (!targetP.knownBy) targetP.knownBy = new Set();
        targetP.knownBy.add(p.pid);
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
        crestHash: tag.crestHash
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
    role: m.role || null
  };
}

const _tickSnapshotCache = new Map();

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
  const enterSnaps = [];
  for (let i = 0; i < aoi.enter.length; i++) {
    const ek = aoi.enter[i];
    const s = getTickSnapshot(ek);
    if (!s) continue;
    enterSnaps.push(s);
    rememberPos(p, ek, s.x, s.z, s.hp);
  }
  send(p, { t: 'aoi', enter: enterSnaps, leave: aoi.leave });
  if (enterSnaps.length > 0) sendNearbyLoot(p);
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

function checkRate(p, type) { const now = Date.now(); let w = p.rate[type]; if (!w || now - w.t > 1000) w = { t:now, n:0 }; w.n++; p.rate[type] = w; return w.n <= (RATE[type] || 10); }

/** Актуальная разрешённая скорость бега: база класса+уровня+экипа × баффы × slow.
 *  speedBase кэшируется в applyClassStats (equip/level/профессия), чтобы не
 *  трогать геттер combatPack до 20 раз в секунду на каждого игрока. */
function playerSpeedNow(p) {
  let s = +p.speedBase;
  if (!Number.isFinite(s) || s <= 0) {
    s = (p.combatPack && +p.combatPack.speedBase) || 7.5;
    p.speedBase = s;
  }
  const now = Date.now();
  const buffs = p.buffs;
  if (buffs && buffs.length) {
    for (let i = 0; i < buffs.length; i++) {
      const b = buffs[i];
      if (b && b.speedMult > 0 && b.until > now) s *= b.speedMult;
    }
  }
  const slowM = BR.slowMult(p.debuffs, now);
  if (slowM < 1) s *= slowM;
  const wPen = playerWeightState(p);
  if (wPen.speedMult < 1) s *= wPen.speedMult;
  if ((p.gm || isGM(p)) && p.gmSpeedMul && p.gmSpeedMul > 1) {
    s *= p.gmSpeedMul;
    return Math.min(SPEED_MAX * p.gmSpeedMul, Math.max(0.5, s));
  }
  return Math.min(SPEED_MAX, Math.max(0.5, s));
}

/** Накопитель разрешённой дистанции (token bucket).
 *  Мгновенный лимит «дистанция ≤ speed × dt» ломается на буферизации пакетов:
 *  два move приходят в один миллисекунд, а прошли они разные кадры. Ведро
 *  сглаживает джиттер, но держит СРЕДНЮЮ скорость на speed × MOVE_TOLERANCE. */
function moveBudget(p, now) {
  const spd = playerSpeedNow(p);
  // Адаптивная компенсация лага сервера: учитываем и задержку тика, и очередь Event Loop
  const elLagMs = elHistogram ? (elHistogram.mean / 1e6) : 0;
  const lagMs = Math.max(typeof tickMsLast === 'number' ? tickMsLast : 0, elLagMs);
  const lagFactor = lagMs > 60 ? Math.min(4.0, lagMs / 60) : 1.0;
  const tolerance = MOVE_TOLERANCE * lagFactor;
  const last = p._moveBudgetAt || 0;
  let dt = last ? (now - last) / 1000 : MOVE_BURST_SEC;
  if (!(dt > 0)) dt = 0;
  // Защита от пакетного сброса (TCP batch flush):
  // Если пакеты пришли пачкой в одном тике (dt < 0.04с), начисляем минимальный квант шага клиента (50 мс),
  // чтобы второй пакет пачки не получал мгновенный бюджет 0.0 м и не вызывал ложный кламп
  if (dt < 0.04 && last > 0 && (+p._moveBudget || 0) < spd * tolerance * 0.1) {
    dt = 0.05;
  }
  const cap = spd * tolerance * MOVE_BURST_SEC;
  p._moveBudgetAt = now;
  let b = (+p._moveBudget || 0) + spd * tolerance * dt;
  if (b > cap) b = cap;
  p._moveBudget = b;
  return b;
}

/** Сбросить бюджет после телепорта или спавна с начальным burst-лимитом */
function resetMoveBudget(p) {
  const spd = playerSpeedNow(p);
  p._moveBudget = spd * MOVE_TOLERANCE * MOVE_BURST_SEC;
  p._moveBudgetAt = Date.now();
  p._speedViol = 0;
  p._syncSentAt = Date.now();
}

function clampSpeed(p, nx, nz) {
  // Стресс-боты: не тратим ресурсы CPU на античит и не дергаем координаты
  if (p && p.yid && isSyntheticBot(p.yid)) {
    if (p.y == null || !Number.isFinite(p.y)) snapStandY(p);
    return { x: nx, z: nz };
  }
  // NaN/Infinity: d = NaN, условие d > maxd ложно → координаты уходили в игрока как есть.
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) return { x: p.x, z: p.z };
  const now = Date.now();
  const maxd = moveBudget(p, now);
  const d = Math.hypot(nx - p.x, nz - p.z);
  let tx = nx, tz = nz;
  if (d <= maxd) {
    p._moveBudget = maxd - d;
    p._speedViol = 0;
  } else {
    p._moveBudget = 0;
    p._speedViol = (p._speedViol | 0) + 1;
    // Если клиент реально превышает подряд (>= 3 раз) и с прошлого hard-sync прошло > 1.2 с
    if (p._speedViol >= 3 && (now - (p._lastHardSyncAt || 0) > 1200)) {
      p._lastHardSyncAt = now;
      p._speedViol = 0; // Сбрасываем счетчик, чтобы не спамить hard self_sync на каждый последующий пакет!
      const spd = playerSpeedNow(p);
      p._moveBudget = spd * MOVE_TOLERANCE * 0.15; // Даем небольшой восстановительный запас для плавности
      send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z, hard: true });
    }
    // Лог не чаще раза в 10 с на игрока: иначе спидхак сам себе DoS по stderr.
    if (!isSyntheticBot(p.yid) && p._speedViol >= 20 && now - (p._speedVioLogAt || 0) > 10000) {
      p._speedVioLogAt = now;
      console.warn('[anticheat] speed clamp', p.name, 'pid=' + p.pid, 'yid=' + p.yid,
        'n=' + p._speedViol, 'd=' + d.toFixed(1), 'max=' + maxd.toFixed(1));
      p._speedViol = 0;
    }
    if (!(d > 0)) return { x: p.x, z: p.z };
    const k = maxd / d;
    tx = p.x + (nx - p.x) * k;
    tz = p.z + (nz - p.z) * k;
  }
  return geoClamp(p, tx, tz);
}

/** После бюджета скорости — не сквозь меш/проп/стену острова. */
function geoClamp(p, tx, tz) {
  if (!GEO.ready()) return { x: tx, z: tz };
  const g = GEO.moveAlong(p.x, p.z, tx, tz, p.y);
  p.y = g.y;
  return { x: g.x, z: g.z };
}

function snapStandY(ent) {
  if (!ent || !GEO.ready()) return;
  ent.y = GEO.standY(ent.x, ent.z, ent.y);
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

/**
 * Серверное начало каста умения (3.3).
 * Проверяет условия (MP, CD, range, LoS), рассчитывает время с учётом WIT/Cast.Spd,
 * регистрирует p.casting и рассылает cast_start. Мгновенные умения выполняет сразу.
 */
function doCastBegin(p, msg) {
  if (p.sitting) p.sitting = false;
  p._lastCombatAt = Date.now();
  const skillId = String(msg.skillId || msg.id || '').toLowerCase();
  const failCast = (reason, extra) => {
    const out = Object.assign({
      t: 'skill_fail',
      reason: reason,
      skillId: skillId,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp
    }, extra || {});
    send(p, out);
  };
  if (playerStunned(p)) { failCast('stun'); return; }
  if (!playerWeightState(p).canAttack) {
    failCast('weight');
    send(p, { t: 'msg', text: 'Слишком тяжело — нельзя использовать умения.' });
    return;
  }
  if (playerSilenced(p)) {
    failCast('silence');
    send(p, { t: 'msg', text: 'Схемы глушатся — нельзя использовать умения.' });
    return;
  }
  const tpl = SK.get(skillId);
  if (!tpl) { failCast('unknown'); return; }
  if (tpl.type === 'passive') { failCast('passive'); return; }
  if (!skillAllowedForClass(p, tpl.class)) { failCast('class'); return; }
  const rank = (p.skills && p.skills[skillId]) || 0;
  if (rank < 1) { failCast('not_learned'); return; }
  const rankRow = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
  const needLv = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);

  const isMemeSkill = !!(tpl.meme || tpl.class === 'any' || tpl.class === 'all');
  try {
    const isEng = p.cls === 'engineer' || (CS.rootClass && CS.rootClass(p.cls) === 'engineer');
    if (isEng && tpl.type !== 'passive' && !isMemeSkill) {
      const w = p.equip && (p.equip.weapon || p.equip.WEAPON);
      const wTid = w && String(w.templateId || w.id || '').toLowerCase();
      const wTpl = wTid ? ITEMS.get(wTid) : null;
      const isEngWeapon = !!(w && wTpl && (
        wTpl.isEngineerWeapon ||
        (wTpl.type === 'weapon' && (wTpl.isCircuit || wTpl.isMagical) &&
          !wTpl.isResonator && !wTpl.isCircuitDevice)
      ));
      if (tpl.type === 'active' || tpl.type === 'toggle') {
        if (!isEngWeapon) { failCast('need_engineer_weapon'); return; }
      }
      const cat = tpl.category || '';
      const ls = (rankRow && rankRow.lifeSteal != null) ? +rankRow.lifeSteal
        : (tpl.lifeSteal != null ? +tpl.lifeSteal : 0);
      const isDrain = ls > 0 || /drain|vamp|absorb|leech/i.test(skillId);
      const needsBracelet = cat === 'heal' || cat === 'buff' || cat === 'debuff' || isDrain;
      const needsResonator = !needsBracelet && cat === 'attack';

      const deviceReq = (lr) => {
        if (tpl.nanoReq != null) return tpl.nanoReq | 0;
        if (tpl.braceletReq != null) return tpl.braceletReq | 0;
        if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
        if (tpl.circuitReq != null) return tpl.circuitReq | 0;
        if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
        if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
      };
      const need = deviceReq(needLv);

      if (needsBracelet) {
        const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
        const brTid = br && String(br.templateId || br.id || '').toLowerCase();
        const isNano = br && (brTid === 'engineer_nano_bracelet' ||
          (ITEMS.get(brTid) && (ITEMS.get(brTid).isNanoBracelet || ITEMS.get(brTid).isBraceletDevice)));
        if (!isNano) { failCast('need_bracelet'); return; }
        const have = (p.devices ? p.devices.nano : 1) | 0;
        if (have < need) { failCast('nano_level', { have: have, need: need }); return; }
      } else if (needsResonator) {
        const n = p.equip && p.equip.necklace;
        const nTid = n && String(n.templateId || n.id || '').toLowerCase();
        const isRes = n && (nTid === 'engineer_emitter_low' ||
          (ITEMS.get(nTid) && (ITEMS.get(nTid).isResonator || ITEMS.get(nTid).isCircuitDevice)));
        if (!isRes) { failCast('need_resonator'); return; }
        const have = (p.devices ? p.devices.circuit : 1) | 0;
        if (have < need) { failCast('circuit_level', { have: have, need: need }); return; }
      }
    }
      const isOp = p.cls === 'operator' || (CS.rootClass && CS.rootClass(p.cls) === 'operator');
      if (isOp && tpl.type !== 'passive' && !isMemeSkill) {
        const cat = tpl.category || '';
        const devType = (tpl.deviceReq && tpl.deviceReq.type) || (cat === 'attack' ? 'compressor' : 'bracers');
        const deviceReq = (lr) => {
          if (tpl.valveReq != null) return tpl.valveReq | 0;
          if (tpl.wristReq != null) return tpl.wristReq | 0;
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);
        if (devType === 'bracers') {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isBracers = br && (brTid === 'operator_bracers_low' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isBracers || ITEMS.get(brTid).isOperatorBracers || ITEMS.get(brTid).isBraceletDevice)));
          if (!isBracers) { failCast('need_bracers'); return; }
          const have = (p.devices ? (p.devices.wrist != null ? p.devices.wrist : p.devices.nano) : 1) | 0;
          if (have < need) { failCast('wrist_level', { have: have, need: need }); return; }
        } else if (devType === 'compressor') {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isComp = n && (nTid === 'operator_compressor_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isCompressor || ITEMS.get(nTid).isOperatorDevice || ITEMS.get(nTid).isValveDevice)));
          if (!isComp) { failCast('need_compressor'); return; }
          const have = (p.devices ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : 1) | 0;
          if (have < need) { failCast('valve_level', { have: have, need: need }); return; }
        }
      }
  } catch (eDev) {}

  const cdKey = 'sk_' + skillId;
  const now = Date.now();
  if ((p.cd[cdKey] || 0) > now) {
    failCast('cooldown', { remainMs: p.cd[cdKey] - now });
    return;
  }

  let energyBase = (rankRow && rankRow.energyCost != null)
    ? rankRow.energyCost
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'energyCost', rank) : null) != null
      ? SK.valueAtLevel(tpl, 'energyCost', rank)
      : (tpl.energyCost || 0);
  const skillReq = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);
  let wClass = 'fist';
  try {
    const packW = p.combatPack && p.combatPack.weaponClass;
    if (packW) wClass = packW;
    else {
      const eq = p.equip || {};
      const w = eq.weapon || eq.WEAPON;
      const wTpl = w ? (ITEMS.get(w.templateId || w.id) || (ITEMS.resolveTemplate && ITEMS.resolveTemplate(w))) : null;
      if (wTpl && wTpl.weaponClass) wClass = wTpl.weaponClass;
      else if (w) {
        const tid = String(w.id || w.templateId || '');
        if (/dagger|knife/i.test(tid)) wClass = 'dagger';
        else if (/bow/i.test(tid)) wClass = 'bow';
      }
    }
  } catch (eW) {}

  // Валидация профильного оружия для физических умений
  if (skillId === 'gun_mortal_blow' && wClass !== 'dagger') {
    failCast('need_dagger');
    send(p, { t: 'msg', text: 'Для умения «Смертельный выпад» требуется кинжал.' });
    return;
  }
  if ((skillId === 'gun_precision_shot' || skillId === 'gun_rapid_fire' ||
       skillId === 'gun_sniper_mode' || skillId === 'gun_bullet_storm' || skillId === 'gun_piercing_round') && wClass !== 'bow') {
    failCast('need_bow');
    send(p, { t: 'msg', text: 'Для этого стрелкового умения требуется экипированный лук.' });
    return;
  }
  if (skillId === 'mech_shield_bash') {
    const sh = p.equip && (p.equip.shield || p.equip.lhand || p.equip.SHIELD);
    const shTid = sh && String(sh.templateId || sh.id || '').toLowerCase();
    const shTpl = shTid ? ITEMS.get(shTid) : null;
    const hasShield = !!(sh && (shTpl ? (shTpl.type === 'shield' || shTpl.slot === 'shield') : /shield/i.test(shTid)));
    if (!hasShield) {
      failCast('need_shield');
      send(p, { t: 'msg', text: 'Для умения «Удар щитом» требуется экипированный щит.' });
      return;
    }
  }
  if ((skillId === 'dest_power_smash' || skillId === 'dest_crushing_blow') && wClass === 'bow') {
    failCast('wrong_weapon');
    send(p, { t: 'msg', text: 'Это сокрушительное умение нельзя использовать с луком.' });
    return;
  }

  const energyCost = L2.mpCostFinal
    ? L2.mpCostFinal(energyBase, wClass, p.level || 1, skillReq)
    : Math.max(1, Math.floor(energyBase * (wClass === 'fist' || wClass === 'dagger' || wClass === '1h_sword' ? 1 : 0.9)));
  if (p.energy < energyCost) {
    failCast('energy', { need: energyCost });
    return;
  }

  const pack = p.combatPack;
  const pas = passiveBonuses(p);
  let baseCastSec = (rankRow && rankRow.chargeTime != null) ? rankRow.chargeTime : (tpl.chargeTime || 0);
  let castSec = 0;
  if (baseCastSec > 0 && L2.castTimeSec) {
    const wit = (pack.primary && pack.primary.WIT) || 20;
    const mSpd = L2.mAtkSpd(wit, pas.chargeSpeed, pas.castSpeedSet)
      * ((pack.gradePenalty && pack.gradePenalty.castSpdMult) || 1);
    castSec = L2.castTimeSec(baseCastSec, mSpd);
  }

  if (castSec <= 0.05) {
    doSkillCast(p, msg);
    return;
  }

  const isMagic = tpl.damageType === 'circuit' || tpl.category === 'heal' ||
    tpl.category === 'buff' || tpl.category === 'debuff' || tpl.class === 'engineer' ||
    tpl.class === 'constructor' || tpl.class === 'technomancer';
  const baseRange = tpl.range != null ? tpl.range : (isMagic ? MAGIC_RANGE_DEFAULT : 3);
  const rangeWithSlack = baseRange + 0.5;

  if (msg.mid != null) {
    const m = mobs.get(+msg.mid);
    if (m && !m.dead && m.hp > 0) {
      if (dist2(p.x, p.z, m.x, m.z) > rangeWithSlack * rangeWithSlack) {
        failCast('range');
        return;
      }
      if (!losGround(p.x, p.z, m.x, m.z)) {
        failCast('los');
        notifyLos(p);
        return;
      }
    }
  } else if (msg.pid != null) {
    const tgt = players.get(+msg.pid);
    if (!tgt && IS_CLUSTER && borderGhosts.has(+msg.pid)) {
      failCast('cross_zone');
      send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
      return;
    }
    if (tgt && !tgt.dead && tgt.hp > 0) {
      if (dist2(p.x, p.z, tgt.x, tgt.z) > rangeWithSlack * rangeWithSlack) {
        failCast('range');
        return;
      }
      if (!losGround(p.x, p.z, tgt.x, tgt.z)) {
        failCast('los');
        notifyLos(p);
        return;
      }
    }
  }

  if (p.casting) cancelPlayerCast(p, 'new_skill');

  const totalMs = L2.quantizeCombatMs ? L2.quantizeCombatMs(castSec * 1000, 100) : Math.floor(castSec * 1000);
  p.casting = {
    skillId: skillId,
    mid: msg.mid || null,
    pid: msg.pid || null,
    startedAt: now,
    endsAt: now + totalMs,
    totalMs: totalMs,
    startX: p.x,
    startZ: p.z,
    energyCost: energyCost,
    rank: rank
  };

  let castFacing = null;
  if (msg.mid != null) {
    const tm = mobs.get(msg.mid | 0);
    if (tm) castFacing = Math.atan2(tm.x - p.x, tm.z - p.z);
  } else if (msg.pid != null) {
    const tp = players.get(msg.pid | 0);
    if (tp) castFacing = Math.atan2(tp.x - p.x, tp.z - p.z);
  }
  if (castFacing != null) p.facing = castFacing;

  const castPkt = {
    t: 'cast_start',
    pid: p.pid,
    skillId: skillId,
    skillName: tpl.name || skillId,
    mid: msg.mid || null,
    targetPid: msg.pid || null,
    castSec: totalMs / 1000,
    totalMs: totalMs,
    facing: castFacing
  };
  send(p, castPkt);
  broadcastAOI(p, castPkt);
}

/**
 * Серверный cast умения (авторитет).
 * msg: { skillId, mid?, pid?, x?, z? }
 */
function doSkillCast(p, msg) {
  if (p.sitting) p.sitting = false;
  p._lastCombatAt = Date.now();
  const skillId = String(msg.skillId || msg.id || '').toLowerCase();
  /** Always attach vitals so client can undo optimistic MP spend. */
  const failSkill = (reason, extra) => {
    const out = Object.assign({
      t: 'skill_fail',
      reason: reason,
      skillId: skillId,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp
    }, extra || {});
    send(p, out);
  };
  if (playerStunned(p)) {
    failSkill('stun');
    return;
  }
  if (!playerWeightState(p).canAttack) {
    failSkill('weight');
    send(p, { t: 'msg', text: 'Слишком тяжело — нельзя использовать умения.' });
    return;
  }
  if (playerSilenced(p)) {
    failSkill('silence');
    send(p, { t: 'msg', text: 'Схемы глушатся — нельзя использовать умения.' });
    return;
  }
  const tpl = SK.get(skillId);
  if (!tpl) {
    failSkill('unknown');
    return;
  }
  if (tpl.type === 'passive') {
    failSkill('passive');
    return;
  }
  if (skillId === 'gm_oneshot' || skillId === 'gm_resurrect' || skillId === 'gm_flash' || skillId === 'gm_speed' || tpl.gm || tpl.gmOnly) {
    if (!isGM(p)) {
      failSkill('access_denied');
      send(p, { t: 'msg', text: 'Умение доступно только Game Master.' });
      return;
    }
  }
  if (!skillAllowedForClass(p, tpl.class)) {
    failSkill('class');
    return;
  }
  let rank = (p.skills && (p.skills[skillId] || (skillId === 'gm_flash' ? p.skills.gm_speed : 0))) || 0;
  if (rank < 1 && isGM(p) && (skillId === 'gm_flash' || skillId === 'gm_speed' || skillId === 'test_immortal' || skillId === 'gm_oneshot' || skillId === 'gm_resurrect')) {
    rank = 1;
    if (p.skills) {
      if (skillId === 'gm_flash' || skillId === 'gm_speed') {
        p.skills.gm_speed = 1;
        delete p.skills.gm_flash;
      } else {
        p.skills[skillId] = 1;
      }
    }
  }
  if (rank < 1) {
    failSkill('not_learned');
    return;
  }
  const rankRow = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
  // levelReq only gates LEARN (doLearnSkill). Already-learned ranks stay usable after delevel.
  const needLv = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);

  // Мем-скиллы brainrot: без требований инженера к оружию/резонатору
  const isMemeSkill = !!(tpl.meme || tpl.class === 'any' || tpl.class === 'all');

  // Инженер: ACTIVE/TOGGLE — оружие инженера + резонатор/браслеты
  try {
    const isEng = p.cls === 'engineer' || (CS.rootClass && CS.rootClass(p.cls) === 'engineer');
    if (isEng && tpl.type !== 'passive' && !isMemeSkill) {
      // 1) Любое оружие инженера в слоте weapon
      const w = p.equip && (p.equip.weapon || p.equip.WEAPON);
      const wTid = w && String(w.templateId || w.id || '').toLowerCase();
      const wTpl = wTid ? ITEMS.get(wTid) : null;
      const isEngWeapon = !!(w && wTpl && (
        wTpl.isEngineerWeapon ||
        (wTpl.type === 'weapon' && (wTpl.isCircuit || wTpl.isMagical) &&
          !wTpl.isResonator && !wTpl.isCircuitDevice)
      ));
      // toggle/active всегда; utility/craft тоже если type active
      if (tpl.type === 'active' || tpl.type === 'toggle') {
        if (!isEngWeapon) {
          failSkill('need_engineer_weapon');
          return;
        }
      }

      // 2) Приборы по категории
      const cat = tpl.category || '';
      const ls = (rankRow && rankRow.lifeSteal != null) ? +rankRow.lifeSteal
        : (tpl.lifeSteal != null ? +tpl.lifeSteal : 0);
      const isDrain = ls > 0 || /drain|vamp|absorb|leech/i.test(skillId);
      const needsBracelet = cat === 'heal' || cat === 'buff' || cat === 'debuff' || isDrain;
      const needsResonator = !needsBracelet && cat === 'attack';

      const deviceReq = (lr) => {
        if (tpl.nanoReq != null) return tpl.nanoReq | 0;
        if (tpl.braceletReq != null) return tpl.braceletReq | 0;
        if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
        if (tpl.circuitReq != null) return tpl.circuitReq | 0;
        if (lr <= 1) return 1;
        if (lr <= 7) return 2;
        if (lr <= 14) return 3;
        if (lr <= 20) return 4;
        if (lr <= 28) return 5;
        return 6;
      };
      const need = deviceReq(needLv);

      if (needsBracelet) {
        const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
        const brTid = br && String(br.templateId || br.id || '').toLowerCase();
        const isNano = br && (brTid === 'engineer_nano_bracelet' ||
          (ITEMS.get(brTid) && (ITEMS.get(brTid).isNanoBracelet || ITEMS.get(brTid).isBraceletDevice)));
        if (!isNano) {
          failSkill('need_bracelet');
          return;
        }
        const have = (p.devices ? p.devices.nano : 1) | 0;
        if (have < need) {
          failSkill('nano_level', { have: have, need: need });
          return;
        }
      } else if (needsResonator) {
        const n = p.equip && p.equip.necklace;
        const nTid = n && String(n.templateId || n.id || '').toLowerCase();
        const isRes = n && (nTid === 'engineer_emitter_low' ||
          (ITEMS.get(nTid) && (ITEMS.get(nTid).isResonator || ITEMS.get(nTid).isCircuitDevice)));
        if (!isRes) {
          failSkill('need_resonator');
          return;
        }
        // Уровень контура — из серверного p.devices, а не из предмета: поле в
        // предмете приходило из пакета клиента (circuitLevel: 99).
        const have = (p.devices ? p.devices.circuit : 1) | 0;
        if (have < need) {
          failSkill('circuit_level', { have: have, need: need });
          return;
        }
      }
    }
      const isOp = p.cls === 'operator' || (CS.rootClass && CS.rootClass(p.cls) === 'operator');
      if (isOp && tpl.type !== 'passive' && !isMemeSkill) {
        const cat = tpl.category || '';
        const devType = (tpl.deviceReq && tpl.deviceReq.type) || (cat === 'attack' ? 'compressor' : 'bracers');
        const deviceReq = (lr) => {
          if (tpl.valveReq != null) return tpl.valveReq | 0;
          if (tpl.wristReq != null) return tpl.wristReq | 0;
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);
        if (devType === 'bracers') {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isBracers = br && (brTid === 'operator_bracers_low' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isBracers || ITEMS.get(brTid).isOperatorBracers || ITEMS.get(brTid).isBraceletDevice)));
          if (!isBracers) { failSkill('need_bracers'); return; }
          const have = (p.devices ? (p.devices.wrist != null ? p.devices.wrist : p.devices.nano) : 1) | 0;
          if (have < need) { failSkill('wrist_level', { have: have, need: need }); return; }
        } else if (devType === 'compressor') {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isComp = n && (nTid === 'operator_compressor_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isCompressor || ITEMS.get(nTid).isOperatorDevice || ITEMS.get(nTid).isValveDevice)));
          if (!isComp) { failSkill('need_compressor'); return; }
          const have = (p.devices ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : 1) | 0;
          if (have < need) { failSkill('valve_level', { have: have, need: need }); return; }
        }
      }
  } catch (eDev) {
    console.warn('[doSkillCast] device gate', eDev);
  }

  // cooldown
  const cdKey = 'sk_' + skillId;
  const now = Date.now();
  if ((p.cd[cdKey] || 0) > now) {
    failSkill('cooldown', { remainMs: p.cd[cdKey] - now });
    return;
  }
  // C1 MP: base × equipMod (wand 0.90) × levelPenalty
  // energyCost in skilldata = TOTAL (mpConsume + mpInitialConsume) L2
  let energyBase = (rankRow && rankRow.energyCost != null)
    ? rankRow.energyCost
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'energyCost', rank) : null) != null
      ? SK.valueAtLevel(tpl, 'energyCost', rank)
      : (tpl.energyCost || 0);
  const skillReq = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);
  // weapon class from equip (item-db → blunt/pole/2h for MP −10% on circuit tools)
  let wClass = 'fist';
  try {
    const packW = p.combatPack && p.combatPack.weaponClass;
    if (packW) wClass = packW;
    else {
      const eq = p.equip || {};
      const w = eq.weapon || eq.WEAPON;
      const wTpl = w ? ITEMS.resolveTemplate(w) : null;
      if (wTpl && wTpl.weaponClass) wClass = wTpl.weaponClass;
      else if (w) {
        const tid = String(w.id || w.templateId || '');
        if (/dagger|knife/i.test(tid)) wClass = 'dagger';
        else if (/soes|crystal_manifold|blade/i.test(tid) && /soes|crystal|homunculus|valhalla|hydraulic/i.test(tid)) {
          wClass = /soes|crystal/i.test(tid) ? '2h_sword' : '1h_sword';
        } else if (/manifold|staff|branch|rod|spear|pole|scythe|glaive|cleaver/i.test(tid)) wClass = 'pole';
        else if (/resonator|hammer|mace|maul|gauge|club|baton|apprentice/i.test(tid)) wClass = '1h_blunt';
        else if (/coil|sword/i.test(tid)) wClass = '1h_sword';
      }
    }
  } catch (e) { /* bare fists */ }

  // Валидация профильного оружия для физических умений
  if (skillId === 'gun_mortal_blow' && wClass !== 'dagger') {
    failSkill('need_dagger');
    send(p, { t: 'msg', text: 'Для умения «Смертельный выпад» требуется кинжал.' });
    return;
  }
  if ((skillId === 'gun_precision_shot' || skillId === 'gun_rapid_fire' ||
       skillId === 'gun_sniper_mode' || skillId === 'gun_bullet_storm' || skillId === 'gun_piercing_round') && wClass !== 'bow') {
    failSkill('need_bow');
    send(p, { t: 'msg', text: 'Для этого стрелкового умения требуется экипированный лук.' });
    return;
  }
  if (skillId === 'mech_shield_bash') {
    const sh = p.equip && (p.equip.shield || p.equip.lhand || p.equip.SHIELD);
    const shTid = sh && String(sh.templateId || sh.id || '').toLowerCase();
    const shTpl = shTid ? ITEMS.get(shTid) : null;
    const hasShield = !!(sh && (shTpl ? (shTpl.type === 'shield' || shTpl.slot === 'shield') : /shield/i.test(shTid)));
    if (!hasShield) {
      failSkill('need_shield');
      send(p, { t: 'msg', text: 'Для умения «Удар щитом» требуется экипированный щит.' });
      return;
    }
  }
  if ((skillId === 'dest_power_smash' || skillId === 'dest_crushing_blow') && wClass === 'bow') {
    failSkill('wrong_weapon');
    send(p, { t: 'msg', text: 'Это сокрушительное умение нельзя использовать с луком.' });
    return;
  }

  const energyCost = L2.mpCostFinal
    ? L2.mpCostFinal(energyBase, wClass, p.level || 1, skillReq)
    : Math.max(1, Math.floor(energyBase * (wClass === 'fist' || wClass === 'dagger' || wClass === '1h_sword' ? 1 : 0.9)));
  if (p.energy < energyCost) {
    failSkill('energy', { need: energyCost });
    return;
  }

  const pack = p.combatPack;
  const pas = passiveBonuses(p);

  let baseCastSec = (rankRow && rankRow.chargeTime != null) ? rankRow.chargeTime : (tpl.chargeTime || 0);
  let castSec = 0;
  if (baseCastSec > 0 && L2.castTimeSec) {
    const wit = (pack.primary && pack.primary.WIT) || 20;
    const mSpd = L2.mAtkSpd(wit, pas.chargeSpeed, pas.castSpeedSet)
      * ((pack.gradePenalty && pack.gradePenalty.castSpdMult) || 1);
    castSec = L2.castTimeSec(baseCastSec, mSpd);
  }

  // ── Валидация каста (3.3): скилл с chargeTime требует cast_begin и ожидания таймера ──
  if (baseCastSec > 0.05) {
    if (!p.casting || p.casting.skillId !== skillId) {
      if (!p.dev || p.requireCast) {
        failSkill('no_cast');
        return;
      }
    } else {
      const nowTs = Date.now();
      if (nowTs < p.casting.endsAt - 150) {
        failSkill('cast_in_progress', { remainMs: p.casting.endsAt - nowTs });
        return;
      }
      p.casting = null;
    }
  }

  const power = SK.skillPowerAtLevel(tpl, rank);
  const dtype = tpl.damageType || 'physical';
  // circuit/heal skills: default mystic range if missing
  const isMagic = tpl.damageType === 'circuit' || tpl.category === 'heal' ||
    tpl.category === 'buff' || tpl.category === 'debuff' || tpl.class === 'engineer' ||
    tpl.class === 'constructor' || tpl.class === 'technomancer';
  const baseRange = tpl.range != null ? tpl.range
    : (isMagic ? MAGIC_RANGE_DEFAULT : 3);
  // Interlude: старт каста = castRange; попадание после каста = effectRange (шире)
  const effectBase = tpl.effectRange != null ? tpl.effectRange
    : (isMagic ? MAGIC_EFFECT_RANGE_DEFAULT : baseRange);
  // небольшой slack на сеть (не «+метры как L2 600»)
  const range = baseRange + 0.5;
  const effectRange = effectBase + 0.5;
  const results = [];

  // GM Resurrect: resurrection of dead player or complete divine restoration
  if (skillId === 'gm_resurrect') {
    let tgt = null;
    if (msg.pid != null && players.get(msg.pid | 0)) {
      tgt = players.get(msg.pid | 0);
    } else if (p.target && p.target.pid != null && players.get(p.target.pid | 0)) {
      tgt = players.get(p.target.pid | 0);
    } else if (p.dead) {
      tgt = p;
    } else {
      let bestDist = effectRange;
      for (const other of players.values()) {
        if (!other || other.pid === p.pid || !other.dead) continue;
        const d = Math.hypot((other.x || 0) - p.x, (other.z || 0) - p.z);
        if (d < bestDist) {
          bestDist = d;
          tgt = other;
        }
      }
      if (!tgt) tgt = p;
    }

    if (dist2(p.x, p.z, tgt.x, tgt.z) > effectRange * effectRange) {
      failSkill('range');
      return;
    }

    if (deathHandler && deathHandler.resurrectPlayer) {
      deathHandler.resurrectPlayer(tgt, p);
    } else {
      tgt.dead = false;
      tgt.hp = tgt.maxHp;
      tgt.energy = tgt.maxEnergy;
      send(tgt, { t: 'you_revived', mode: 'resurrect', by: p.name });
      broadcastAOI(tgt, { t: 'player_revived', pid: tgt.pid, x: tgt.x, z: tgt.z, mode: 'resurrect' });
      broadcastAOI(tgt, { t: 'resurrect_fx', pid: tgt.pid, casterPid: p.pid, x: tgt.x, y: tgt.y, z: tgt.z });
    }
    results.push({ kind: 'resurrect', pid: tgt.pid, targetName: tgt.name, hp: tgt.hp });

    p.energy = Math.max(0, Math.floor(p.energy - energyCost));
    const fullCdSec = tpl.cooldown != null ? tpl.cooldown : 1;
    p.cd[cdKey] = now + Math.floor(fullCdSec * 900);

    send(p, {
      t: 'skill_ok',
      skillId,
      rank,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      results,
      cooldown: fullCdSec
    });
    broadcastAOI(p, {
      t: 'skill_fx',
      pid: p.pid,
      fromPid: p.pid,
      skillId,
      targetPid: tgt.pid,
      name: tpl.name,
      x: tgt.x,
      y: tgt.y,
      z: tgt.z
    });
    return;
  }

  // GM Flash Speed: toggle super-speed (3.5x) with Speed Force effects
  if (skillId === 'gm_flash' || skillId === 'gm_speed') {
    const isCurrentlyFast = p.gmSpeedMul && p.gmSpeedMul > 1;
    if (isCurrentlyFast) {
      p.gmSpeedMul = 1;
      p.flashSpeed = false;
      resetMoveBudget(p);
      send(p, { t: 'msg', text: '⚡ Скорость Флэша: ВЫКЛ (1.0x)' });
      send(p, { t: 'self_sync', gmSpeedMul: 1, flashSpeed: false });
      broadcastAOI(p, { t: 'flash_fx', pid: p.pid, active: false, speedMul: 1 });
      results.push({ kind: 'toggle', active: false, skillId: 'gm_speed' });
    } else {
      p.gmSpeedMul = 3.5;
      p.flashSpeed = true;
      resetMoveBudget(p);
      send(p, { t: 'msg', text: '⚡ СКОРОСТЬ ФЛЭША АКТИВИРОВАНА: 3.5x (Спидфорс ВКЛ)' });
      send(p, { t: 'self_sync', gmSpeedMul: 3.5, flashSpeed: true });
      broadcastAOI(p, { t: 'flash_fx', pid: p.pid, active: true, speedMul: 3.5, burst: true, x: p.x, y: p.y, z: p.z });
      results.push({ kind: 'toggle', active: true, skillId: 'gm_speed' });
    }
    p.energy = Math.max(0, Math.floor(p.energy - energyCost));
    send(p, {
      t: 'skill_ok',
      skillId,
      rank: 1,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      results,
      cooldown: 0.5
    });
    return;
  }

  // SELF / PARTY buffs & heals
  if (tpl.target === 'self' || tpl.target === 'party' || tpl.category === 'heal' || tpl.category === 'buff') {
    if (tpl.category === 'heal' || tpl.healPercent != null || tpl.healPower != null ||
        (rankRow && rankRow.healPower != null)) {
      let heal;
      const flat = (rankRow && rankRow.healPower != null)
        ? rankRow.healPower
        : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'healPower', rank) : tpl.healPower);
      const healBonus = 1 + ((pas && pas.healPower) || 0);
      if (flat != null) {
        // L2 C1: Power + √C.Atk
        heal = L2.healAmount
          ? L2.healAmount(flat, pack.cAtk || 0, healBonus)
          : Math.max(1, Math.floor((flat + Math.sqrt(pack.cAtk || 0)) * healBonus));
      } else {
        let hpct = SK.valueAtLevel(tpl, 'healPercent', rank);
        if (hpct == null) hpct = 0.2;
        const men = (pack.primary && pack.primary.MEN) || 30;
        // %heal растёт от MEN + √C.Atk (не только maxHp цели)
        heal = L2.healPercentAmount
          ? L2.healPercentAmount(p.maxHp, hpct, pack.cAtk || 0, men, healBonus)
          : Math.max(1, Math.floor(p.maxHp * hpct * healBonus + Math.sqrt(pack.cAtk || 0) * 0.9));
      }
      p.hp = Math.min(p.maxHp, p.hp + heal);
      results.push({ kind: 'heal', target: 'self', amount: heal, hp: p.hp });
    }
    if (tpl.category === 'buff' || tpl.attackBoost != null || tpl.defenseBoost != null || tpl.speedBoost != null ||
        tpl.attackSpeedBoost != null ||
        tpl.immortal || tpl.invulnerable ||
        (rankRow && (rankRow.attackBoost != null || rankRow.defenseBoost != null))) {
      const rawDur = ((rankRow && rankRow.duration != null) ? rankRow.duration
        : (SK.valueAtLevel(tpl, 'duration', rank) || tpl.duration || 20)) * 1000;
      const dur = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawDur, 100) : rawDur;
      const buff = { id: skillId, until: now + dur, priority: 20, name: tpl.name || skillId };
      const atkB = (rankRow && rankRow.attackBoost != null) ? rankRow.attackBoost
        : (SK.valueAtLevel(tpl, 'attackBoost', rank) || tpl.attackBoost);
      const defB = (rankRow && rankRow.defenseBoost != null) ? rankRow.defenseBoost
        : (SK.valueAtLevel(tpl, 'defenseBoost', rank) || tpl.defenseBoost);
      if (atkB != null) buff.attackMult = 1 + atkB;
      if (defB != null) buff.defenseMult = 1 + defB;
      if (tpl.speedBoost != null) buff.speedMult = 1 + tpl.speedBoost;
      // Haste (gun_rapid_fire attackSpeedBoost 0.8): множитель Atk.Spd, а не
      // урона. Раньше поле игнорировалось сервером полностью.
      if (tpl.attackSpeedBoost != null) {
        buff.atkSpdMult = 1 + Math.max(0, Math.min(2, +tpl.attackSpeedBoost || 0));
      }
      if (tpl.immortal || tpl.invulnerable || skillId === 'test_immortal') {
        buff.immortal = true;
        buff.invulnerable = true;
      }
      applyPlayerBuff(p, buff, now);
      pushEffects(p);
      pushCombatStats(p);
      results.push({ kind: 'buff', target: 'self', buffId: skillId, duration: dur / 1000, immortal: !!buff.immortal });
      // test immortality: full heal for convenience
      if (tpl.fullHeal || buff.immortal) {
        const before = p.hp;
        p.hp = p.maxHp;
        const healed = Math.max(0, p.hp - before);
        if (healed > 0) results.push({ kind: 'heal', target: 'self', amount: healed, hp: p.hp });
      }
      // client status icon under HP
      if (buff.immortal) {
        send(p, {
          t: 'status_fx',
          effects: [{
            id: skillId,
            name: tpl.name || 'Бессмертие',
            kind: 'buff',
            duration: dur / 1000,
            until: now + dur,
            icon: 'immortal'
          }]
        });
      }
    }
    if (tpl.category === 'utility' && !tpl.skillPower) {
      results.push({ kind: 'utility', skillId });
    }
    const nBuffDisp = (tpl.dispelBuffs | 0) || (rankRow && rankRow.dispelBuffs) || 0;
    const nDebDisp = (tpl.dispelDebuffs | 0) || (rankRow && rankRow.dispelDebuffs) || 0;
    if (tpl.category === 'dispel' || nBuffDisp > 0 || nDebDisp > 0) {
      if (nBuffDisp > 0 || tpl.category === 'dispel') {
        const db = BR.dispel(p.buffs, { kind: 'buff', n: nBuffDisp > 0 ? nBuffDisp : 3, now: now });
        p.buffs = db.list;
        results.push({ kind: 'dispel', target: 'self', what: 'buff', n: db.removed.length });
      }
      if (nDebDisp > 0) {
        const dd = BR.dispel(p.debuffs, { kind: 'debuff', n: nDebDisp, now: now });
        p.debuffs = dd.list;
        results.push({ kind: 'dispel', target: 'self', what: 'debuff', n: dd.removed.length });
      }
      pushEffects(p);
      pushCombatStats(p);
    }
  }

  // TARGET / AOE damage & debuff
  const needsTarget = tpl.target === 'target' || tpl.target === 'aoe' ||
    tpl.category === 'attack' || tpl.category === 'debuff';
  // урон только при реальном Power (не pure Curse:Weakness / Poison)
  const hasDmg = (rankRow && rankRow.l2Power != null) ||
    (tpl.skillPower != null && +tpl.skillPower > 0) ||
    (tpl.damageMult != null) ||
    tpl.category === 'attack';
  const slowPct = (rankRow && rankRow.slowPercent != null) ? rankRow.slowPercent
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'slowPercent', rank) : tpl.slowPercent);
  const atkRed = (rankRow && rankRow.attackReduction != null) ? rankRow.attackReduction
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'attackReduction', rank) : tpl.attackReduction);
  const dotDmg = (rankRow && rankRow.dotDamage != null) ? rankRow.dotDamage
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'dotDamage', rank) : tpl.dotDamage);
  const hasDebuffFx = (slowPct != null && +slowPct > 0) ||
    (atkRed != null && +atkRed > 0) ||
    (dotDmg != null && +dotDmg > 0);
  const rawDebuffDur = ((rankRow && rankRow.duration != null) ? rankRow.duration
    : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'duration', rank) : null) || tpl.duration || 30) * 1000;
  const debuffDur = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawDebuffDur, 100) : rawDebuffDur;
  const landBase = tpl.landChance != null ? tpl.landChance : 0.80;
  const atkInt = (pack.primary && pack.primary.INT) || 41;

  // Spoil / «Вскрытие корпуса» (L2 Spoil): mark LIVE target → extra mats on death
  const isSpoil = skillId === 'op_scrap_collect' || tpl.l2Name === 'Spoil' ||
    (tpl.category === 'craft' && /spoil|scrap|вскрыт/i.test(String(tpl.name || '') + skillId));
  if (isSpoil) {
    const mid = msg.mid != null ? +msg.mid : null;
    const m = mid != null ? mobs.get(mid) : null;
    if (!m) {
      failSkill('no_target');
      return;
    }
    if (m.hp <= 0) {
      failSkill('target_dead');
      return;
    }
    if (m.spoilMarked) {
      failSkill('already_spoiled');
      return;
    }
    const dx = (m.x || 0) - p.x;
    const dz = (m.z || 0) - p.z;
    if (Math.hypot(dx, dz) > range) {
      failSkill('range');
      return;
    }
    if (!losGround(p.x, p.z, m.x, m.z)) {
      failSkill('los');
      return;
    }
    // bosses have spoilCh:0 — still allow mark but death roll returns empty/null
    m.spoilMarked = true;
    m.spoilBy = p.pid;
    results.push({ kind: 'spoil_mark', mid: m.mid, mobId: m.mobId });
    p.energy = Math.max(0, Math.floor(p.energy - energyCost));
    const fullCdSecS = tpl.cooldown != null ? tpl.cooldown : 6;
    p.cd[cdKey] = now + (L2.quantizeCombatMs ? L2.quantizeCombatMs(fullCdSecS * 1000, 100) : Math.floor(fullCdSecS * 1000));
    send(p, {
      t: 'skill_ok',
      skillId,
      rank,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      results,
      cooldown: fullCdSecS
    });
    broadcastAOI(p, {
      t: 'skill_fx', pid: p.pid, fromPid: p.pid, skillId, mid: m.mid, name: tpl.name
    });
    send(p, { t: 'msg', text: 'Корпус помечен для вскрытия.' });
    return;
  }

  if (needsTarget && (hasDmg || hasDebuffFx)) {
    const applyDebuffFx = (m) => {
      if (!m || m.hp <= 0) return false;
      const defMen = m.men != null ? m.men : (20 + (m.level || 1));
      const ok = L2.rollMagicLand
        ? L2.rollMagicLand(landBase, atkInt, defMen, p.level, m.level || 1)
        : Math.random() < landBase;
      if (!ok) {
        results.push({ kind: 'resist', mid: m.mid });
        return false;
      }
      if (slowPct != null && +slowPct > 0) {
        m.slowUntil = now + debuffDur;
        m.slowMult = 1 - (+slowPct);
        results.push({ kind: 'slow', mid: m.mid, pct: slowPct, duration: debuffDur / 1000 });
      }
      if (atkRed != null && +atkRed > 0) {
        m.atkRedUntil = now + debuffDur;
        m.atkRedMult = 1 - (+atkRed);
        results.push({ kind: 'weakness', mid: m.mid, pct: atkRed, duration: debuffDur / 1000 });
      }
      if (dotDmg != null && +dotDmg > 0) {
        // full1: 21 HP/сек · 30с → 30 тиков × 1с (или ranks.dotTicks)
        const ticks = (rankRow && rankRow.dotTicks != null) ? rankRow.dotTicks : 30;
        const rawEvery = Math.max(100, Math.floor(debuffDur / Math.max(1, ticks)));
        const every = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawEvery, 100) : Math.max(200, rawEvery);
        m.dots = m.dots || [];
        m.dots.push({
          dmg: +dotDmg, left: ticks, every: every, next: now + every, by: p.pid, skillId
        });
        const healRed = (rankRow && rankRow.healReduction != null)
          ? rankRow.healReduction
          : (tpl.healReduction || 0);
        if (healRed > 0) {
          m.healRedUntil = now + debuffDur;
          m.healRedMult = 1 - healRed;
        }
        results.push({ kind: 'poison', mid: m.mid, dmg: +dotDmg, ticks, duration: debuffDur / 1000 });
      }
      return true;
    };

    // C1: 1 shot per skill cast (not per AoE target)
    const isCircSkill = dtype === 'circuit' || dtype === 'magic';
    let skillShotMod = 1.0;
    if (hasDmg) {
      const shotOnce = isCircSkill ? consumeArmedShot(p, 'sps') : consumeArmedShot(p, 'ss');
      skillShotMod = shotOnce.shotMod;
      if (shotOnce.consumed) {
        send(p, { t: 'shot_use', id: shotOnce.consumed, inv: p.inv, armedShot: p.armedShot || null });
      }
    }

    const applyToMob = (m) => {
      if (!m || m.hp <= 0) return;
      if (tpl.oneshot || skillId === 'gm_oneshot') {
        const lethalDmg = Math.max(9999999, (m.maxHp || 1000) * 10);
        m.hp = 0;
        results.push({
          kind: 'dmg', mid: m.mid, dmg: lethalDmg, crit: true,
          blocked: false, damageType: 'physical', hp: 0,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
          oneshot: true
        });
        broadcastAOI(p, {
          t: 'dmg', mid: m.mid, dmg: lethalDmg, crit: true,
          by: p.pid, skillId, damageType: 'physical',
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        });
        onMobDeath(p, m);
        return;
      }
      // pure debuff (Weakness/Poison без Power) — только land + эффект
      if (!hasDmg && hasDebuffFx) {
        applyDebuffFx(m);
        addMobHate(m, p.pid, hateFromHit(m, 0, { debuff: true, flat: 50 }), { force: false });
        return;
      }
      const mobTpl = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId)) || null;
      const atk = {
        pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy,
        critRate: pack.critRate + ((tpl.critBonus || 0) * 100),
        critDamage: pack.critDamage, level: p.level, dex: pack.dex,
        classTier: pack.tier != null ? pack.tier : (CS.getClass(p.cls) ? CS.getClass(p.cls).tier : 0)
      };
      const def = {
        pDef: m.pDef || 0, cDef: m.cDef != null ? m.cDef : (m.mDef || 0),
        evasion: m.evasion != null ? m.evasion : (15 + (m.level || 1) * 1.2),
        level: m.level || 1,
        eliteRaid: !!(m.eliteRaid || (mobTpl && mobTpl.eliteRaid)),
        epicRaid: !!(m.epicRaid || (mobTpl && mobTpl.epicRaid))
      };
      const ignore = tpl.ignoreDefense || 0;
      const hit = L2.resolveHit(atk, def, {
        skillPower: power,
        damageType: dtype,
        ignoreDef: ignore,
        shotMod: skillShotMod
      });
      if (hit.lethalFeedback) {
        const lethalDmg = hit.feedbackDamage || 99999;
        p.hp = 0;
        p.dead = true;
        onPlayerHit(p, lethalDmg);
        send(p, {
          t: 'hit', dmg: lethalDmg, by: 'm' + m.mid, crit: true,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        });
        broadcastAOI(p, {
          t: 'dmg_player', pid: p.pid, dmg: lethalDmg, crit: true,
          by: 'm' + m.mid, mobId: m.mobId
        });
        send(p, {
          t: 'msg',
          text: 'Аварийный разряд сверхдавления отражает удар! Смертельное отражение: требуется 1-я профессия!'
        });
        results.push({ kind: 'lethal_feedback', mid: m.mid, mobId: m.mobId });
        onPlayerDeath(p, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
        return;
      }
      if (hit.missed) {
        results.push({ kind: 'miss', mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId) });
        return;
      }
      m.hp = Math.max(0, m.hp - hit.damage);
      addMobHate(m, p.pid, hateFromHit(m, hit.damage, {
        crit: !!hit.crit, skill: true, debuff: hasDebuffFx
      }));
      results.push({
        kind: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit,
        blocked: hit.blocked, damageType: hit.damageType, hp: m.hp,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
      });
      broadcastAOI(p, {
        t: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit,
        by: p.pid, skillId, damageType: hit.damageType,
        hp: m.hp, maxHp: m.maxHp,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
      });
      // Ice Bolt etc: land slow after hit
      if (hasDebuffFx) {
        applyDebuffFx(m);
        addMobHate(m, p.pid, hateFromHit(m, 0, { debuff: true, flat: 30 }));
      }
      const ls = (rankRow && rankRow.lifeSteal != null) ? rankRow.lifeSteal : tpl.lifeSteal;
      if (ls) {
        const heal = Math.floor(hit.damage * ls);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        results.push({ kind: 'lifesteal', amount: heal, hp: p.hp });
      }
      if (m.hp <= 0) onMobDeath(p, m);
    };

    if (tpl.target === 'aoe') {
      const radius = (SK.valueAtLevel(tpl, 'aoeRadius', rank) || tpl.aoeRadius || 4);
      let cx = p.x, cz = p.z;
      // Ключи Map — числа; '5' !== 5, поэтому строку от модифицированного
      // клиента раньше молча игнорировали.
      if (msg.mid != null && mobs.get(msg.mid | 0)) {
        const tm = mobs.get(msg.mid | 0);
        const maxRange = (tpl.range || 15) + 3;
        if (dist2(p.x, p.z, tm.x, tm.z) <= maxRange * maxRange && losGround(p.x, p.z, tm.x, tm.z)) {
          cx = tm.x; cz = tm.z;
        } else {
          failSkill('range');
          return;
        }
      }
      if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
        spatialGrid.forEachCandidate(cx, cz, radius, null, (m) => {
          if (!m || m.hp <= 0) return;
          if (dist2(cx, cz, m.x, m.z) > radius * radius) return;
          if (!losGround(p.x, p.z, m.x, m.z)) return;
          applyToMob(m);
        });
      } else {
        for (const [, m] of mobs) {
          if (m.hp <= 0) continue;
          if (dist2(cx, cz, m.x, m.z) > radius * radius) continue;
          if (!losGround(p.x, p.z, m.x, m.z)) continue;
          applyToMob(m);
        }
      }
    } else if (msg.mid != null) {
      const m = mobs.get(msg.mid | 0);
      if (!m || m.hp <= 0) {
        failSkill('target');
        return;
      }
      // skill already cast on client — allow effectRange (Interlude 1100)
      if (dist2(p.x, p.z, m.x, m.z) > effectRange * effectRange) {
        failSkill('range');
        return;
      }
      if (!losGround(p.x, p.z, m.x, m.z)) {
        failSkill('los');
        return;
      }
      applyToMob(m);
    } else if (msg.pid != null && tpl.category !== 'heal') {
      // PvP skill
      const tgt = players.get(msg.pid | 0);
      if (!tgt) {
        if (IS_CLUSTER && borderGhosts.has(msg.pid | 0)) {
          failSkill('cross_zone');
          send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
        } else {
          failSkill('target');
        }
        return;
      }
      if (tgt.hp <= 0) {
        failSkill('target');
        return;
      }
      if (isSyntheticBot(p.yid) || isSyntheticBot(tgt.yid)) {
        failSkill('peace');
        return;
      }
      if (pvpPeaceBlocked(p, tgt)) {
        if (!isGM(p)) {
          // refund path: client may have spent MP optimistically
          failSkill('peace');
          send(p, { t: 'msg', text: 'В мирной зоне нельзя атаковать.' });
          return;
        }
      }
      if (dist2(p.x, p.z, tgt.x, tgt.z) > effectRange * effectRange) {
        failSkill('range');
        return;
      }
      if (!losGround(p.x, p.z, tgt.x, tgt.z)) {
        failSkill('los');
        return;
      }
      const tPack = tgt.combatPack;
      const hit = L2.resolveHit(
        { pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate, level: p.level, dex: pack.dex },
        { pDef: tPack.pDef, cDef: tPack.cDef, evasion: tPack.evasion, level: tgt.level },
        { skillPower: power, damageType: dtype }
      );
      if (tpl.oneshot || skillId === 'gm_oneshot') {
        const lethalDmg = Math.max(9999999, (tgt.maxHp || 1000) * 10);
        tgt.hp = 0;
        tgt.dead = true;
        onPlayerHit(tgt, lethalDmg);
        onPlayerHit(p, 0);
        send(tgt, { t: 'hit', dmg: lethalDmg, by: 'p' + p.pid, skillId, crit: true });
        broadcastAOI(tgt, { t: 'dmg_player', pid: tgt.pid, dmg: lethalDmg, crit: true, by: p.pid, skillId });
        results.push({ kind: 'dmg_player', pid: tgt.pid, dmg: lethalDmg, crit: true, oneshot: true });
        if (onPvpLethal) onPvpLethal(tgt, p);
      } else if (!hit.missed) {
        if (isPlayerImmortal(tgt)) {
          results.push({ kind: 'immune', pid: tgt.pid });
          send(tgt, { t: 'hit', dmg: 0, immune: true, by: 'p' + p.pid, skillId });
        } else {
          tgt.hp = Math.max(0, tgt.hp - hit.damage);
          onPlayerHit(tgt, hit.damage);
          onPlayerHit(p, 0);
          send(tgt, { t: 'hit', dmg: hit.damage, by: 'p' + p.pid, skillId });
          broadcastAOI(tgt, { t: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit, by: p.pid, skillId });
          results.push({ kind: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit });
          if (tgt.hp <= 0) onPvpLethal(tgt, p);
        }
      } else {
        results.push({ kind: 'miss', pid: tgt.pid });
      }
    } else if (tpl.category === 'attack' || tpl.skillPower) {
      // attack skill without target — fail
      if (!results.length) {
        failSkill('no_target');
        return;
      }
    }
  }

  // spend resource + CD only after validation passed
  p.energy = Math.max(0, Math.floor(p.energy - energyCost));

  // Interlude: откат стартует в момент начала каста (use), а doSkillCast
  // вызывается уже ПОСЛЕ каста (клиент отсчитывает chargeTime сам).
  // Раньше остаток считался как cooldown − castTime, и у 10 умений он выходил
  // ≤ 0 (chargeTime после деления на castingSpd больше самого cooldown):
  // eng_pressure_bolt давал ×3 DPS, eng_self_repair — бесконечный хил.
  // Правильный минимум между ДВУМЯ пакетами легитимного клиента:
  //   press T0 → cast до T0+cast → пакет; следующий press не раньше
  //   T0+max(cd, cast) → пакет через max(cd, cast).
  const fullCdSec = tpl.cooldown != null ? tpl.cooldown : 0;
  const effCdSec = Math.max(fullCdSec, castSec);
  // 10 % слака: клиентская оценка castTime может отличаться округлением, и
  // легитимный игрок не должен получать 'cooldown' на границе. Квантовано шагом 100 мс.
  p.cd[cdKey] = now + (L2.quantizeCombatMs ? L2.quantizeCombatMs(effCdSec * 900, 100) : Math.floor(effCdSec * 900));

  send(p, {
    t: 'skill_ok',
    skillId,
    rank,
    energy: Math.floor(p.energy),
    maxEnergy: p.maxEnergy,
    hp: Math.floor(p.hp),
    maxHp: p.maxHp,
    results,
    cooldown: effCdSec
  });
  // visual for AOI (fromPid = player caster; mid = target mob — NOT a mob cast)
  broadcastAOI(p, {
    t: 'skill_fx',
    pid: p.pid,
    fromPid: p.pid,
    skillId,
    mid: msg.mid || null,
    targetPid: msg.pid || null,
    name: tpl.name
  });
}

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
  pushWeight
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

function giveCurrency(p, amount) {
  const n = Math.max(0, Math.floor(+amount) || 0);
  if (n <= 0) return;
  p.inv[CURRENCY_ID] = currencyOf(p) + n;
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
  registerDuelPlayer
} = createDuelHandler({
  players,
  send,
  broadcastAOI,
  isPeaceAt,
  saveProfileNow,
  onPlayerDeathByPlayer: (victim, killer) => onPlayerDeathByPlayer(victim, killer)
});

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
    broadcastChat: (ch, name, txt, extra) => { if (clusterIpc) clusterIpc.broadcastChat(ch, name, txt, extra); }
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
  constructor(connId) {
    super();
    this.connId = connId;
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
    outgoingIpcBatch.push({
      connId: this.connId,
      pid: this.pid,
      data: isBin && !Buffer.isBuffer(data) ? Buffer.from(data) : data,
      isBinary: !!isBin
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

  const pr = profileOf(p);
  const playerData = Object.assign({}, pr, {
    pid: p.pid,
    yid: p.yid,
    connId: connId,
    buffs: (p.buffs || []).slice(),
    debuffs: (p.debuffs || []).slice(),
    binaryProto: !!p.binaryProto,
    partyId: p.partyId || null,
    dev: !!p.dev
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

  try {
    saveProfileNow(p);
  } catch (_) {}
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
      proxy = new GatewaySocketProxy(connId);
      proxy.pid = pid;
      proxy.isAuthed = true;
      proxySockets.set(connId, proxy);
      setupSocketConnection(proxy, true);
    } else {
      proxy.pid = pid;
      proxy.isAuthed = true;
      if (typeof proxy.setAuthed === 'function') {
        proxy.setAuthed(true);
      }
    }
  }

  const p = new Player(pid, yid, data, {
    dev: process.env.NODE_ENV !== 'production' && !!data.dev,
    charId: data.charId
  });
  p.binaryProto = !!data.binaryProto;
  p.partyId = data.partyId || null;
  if (data.hp != null) p.hp = data.hp;
  if (data.energy != null) p.energy = data.energy;
  if (data.buffs) p.buffs = data.buffs.slice();
  if (data.debuffs) p.debuffs = data.debuffs.slice();

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
  clusterIpc.on('client_raw', ({ connId, data, isBinary }) => {
    let proxy = proxySockets.get(connId);
    if (!proxy) {
      proxy = new GatewaySocketProxy(connId);
      proxySockets.set(connId, proxy);
      setupSocketConnection(proxy);
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
      const ws = wsByPid.get(p.pid);
      if (ws) {
        const s = sessions.get(ws);
        if (s) s.lastPong = Date.now();
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
    case 'move': {
      if (p.dead) return;
      if (!checkRate(p, 'move')) return;
      // NaN проходил clampSpeed и делал игрока невидимым, при этом все проверки
      // дистанции (dist2 > R) для NaN ложны — атака работала через полкарты.
      const nx = +msg.x, nz = +msg.z;
      if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
      if (nx < -20000 || nx > 20000 || nz < -20000 || nz > 20000) return;
      // short stun/paralyze from mob skills
      if (playerStunned(p)) return;
      // L2: movement cancels sit → run/walk regen (×0.7 / ×1.0)
      if (p.sitting) p.sitting = false;
      if (p.store) closeStore(p, 'move');
      // oil/slow учтён внутри бюджета (playerSpeedNow): раньше он домножался
      // ПОСЛЕ клампа и накладывался на клиентский slow дважды.
      const prevX = p.x, prevZ = p.z;
      const c = clampSpeed(p, nx, nz);
      p.x = c.x; p.z = c.z;
      if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
      markProfileDirty(p);
      if (IS_CLUSTER && clusterIpc) {
        const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
        if (targetWorker !== CURRENT_WORKER_ID) {
          initiateClusterHandoff(p, targetWorker);
          return;
        }
      }
      if (p.casting && Math.hypot(p.x - p.casting.startX, p.z - p.casting.startZ) > 1.2) {
        cancelPlayerCast(p, 'move');
      }

      // Dead Reckoning: отслеживание вектора и вещание MOVE_VEC_START (Спринт 1, v2.2)
      const moveDx = c.x - prevX;
      const moveDz = c.z - prevZ;
      const moveDist = Math.hypot(moveDx, moveDz);
      const nowMove = Date.now();
      if (moveDist > 0.05) {
        p.facing = Math.atan2(moveDx, moveDz);
        const spd = playerSpeedNow(p);
        const lastVec = p._moveVec;
        let destX = null, destZ = null;
        if (msg.destX != null && msg.destZ != null && Number.isFinite(+msg.destX) && Number.isFinite(+msg.destZ)) {
          const dToDest = Math.hypot(+msg.destX - c.x, +msg.destZ - c.z);
          if (dToDest > 0.5) {
            destX = +msg.destX;
            destZ = +msg.destZ;
          }
        }

        // Если есть реальная целевая точка пути (клик мышью / вейпоинт бота):
        if (destX != null && destZ != null) {
          const needsNewVec = !lastVec ||
            nowMove - lastVec.timestamp > 1500 ||
            Math.hypot(destX - lastVec.targetX, destZ - lastVec.targetZ) > 1.5;

          if (needsNewVec) {
            const totD = Math.hypot(destX - c.x, destZ - c.z);
            p._moveVec = {
              startX: c.x,
              startZ: c.z,
              targetX: destX,
              targetZ: destZ,
              speed: spd,
              timestamp: nowMove,
              walking: !!p.walking,
              totalD: totD,
              invTotalD: totD > 0.05 ? (1.0 / totD) : 0,
              predTick: -1,
              inRange: false
            };
            broadcastMoveVecStart(p, c.x, c.z, destX, destZ, spd, p.walking ? 1 : 0);
          }
        } else {
          // Нет явной цели пути (WASD, джойстик, микрошаг): НЕ проецируем фантомный вектор на 9 метров вперёд!
          // Иначе при остановке удалённые клиенты будут отбрасывать персонажа назад (Rubber-banding).
          if (lastVec) {
            p._moveVec = null;
            broadcastMoveVecStop(p, c.x, c.z);
          }
        }
      }
      // Сервер обрезал шаг — сказать об этом сразу. Иначе клиент продолжает
      // считать, что прошёл весь путь: его снимок серверной позиции устаревает,
      // расхождение растёт молча и вылезает рывком при следующем событии.
      {
        const off = Math.hypot(nx - c.x, nz - c.z);
        const nowSync = Date.now();
        if (off > MOVE_CORRECT_EPS && nowSync - (p._syncSentAt || 0) > MOVE_CORRECT_MS) {
          p._syncSentAt = nowSync;
          send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
        }
      }
      // pose for Formulas.java regen (run vs walk vs stand)
      p.moving = true;
      p._lastMoveAt = Date.now();
      if (msg.walking != null) p.walking = !!msg.walking;
      if (isSyntheticBot(p.yid)) {
        break;
      }
      const r = (WM.regionAt(p.x, p.z) || {});
      const peace = isPeaceAt(p.x, p.z);
      const zoneLabel = zoneLabelAt(p.x, p.z);
      if (r.id && r.id !== p.region) {
        const oldReg = p.region;
        p.region = r.id;
        syncPlayerRegionSubscription(p, oldReg, r.id);
        send(p, { t: 'region', region: r.id, peace: peace, zoneName: zoneLabel });
      } else if (zoneLabel && p._lastZoneLabel !== zoneLabel) {
        p._lastZoneLabel = zoneLabel;
        send(p, { t: 'region', region: p.region, peace: peace, zoneName: zoneLabel });
      }
      ensureNearbyMobs(p);
      break;
    }
    case 'move_stop': {
      if (p.dead) return;
      const sx = (+msg.x != null && Number.isFinite(+msg.x)) ? +msg.x : p.x;
      const sz = (+msg.z != null && Number.isFinite(+msg.z)) ? +msg.z : p.z;
      p.x = sx; p.z = sz;
      if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
      markProfileDirty(p);
      p.moving = false;
      p._lastMoveAt = Date.now();
      if (p._moveVec) {
        p._moveVec = null;
        broadcastMoveVecStop(p, p.x, p.z);
      }
      break;
    }
    /** L2 sit / walk mode — pose multipliers for HP/MP regen (P1.1) */
    case 'pose': {
      if (p.dead) return;
      if (!checkRate(p, 'action')) return;
      if (msg.sitting != null) {
        if (msg.sitting) {
          const inCombat = !!(p.isFlagged || (p.flagUntil && p.flagUntil > Date.now()) || (p._lastCombatAt && Date.now() - p._lastCombatAt < 10000));
          if (inCombat) {
            p.sitting = false;
            send(p, { t: 'msg', text: 'Нельзя сесть в бою!' });
            break;
          }
          p.sitting = true;
          p.moving = false;
        } else {
          p.sitting = false;
        }
      }
      if (msg.walking != null) p.walking = !!msg.walking;
      break;
    }
    // Телепорт из 3D-редактора (без clamp скорости) — иначе drag на 100м сервер «откатывает» к 3–4м
    case 'editor_set_pos': {
      // Телепорт в любую точку мира. Доступен только GM / dev.
      if (!isGM(p)) { send(p, { t: 'err', msg: 'editor_set_pos: только для GM' }); break; }
      const nx = +msg.x, nz = +msg.z;
      if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
      // разумные границы мира
      if (Math.abs(nx) > 20000 || Math.abs(nz) > 20000) return;
      p.x = nx; p.z = nz;
      if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
      snapStandY(p);
      resetMoveBudget(p);
      const r2 = (WM.regionAt(p.x, p.z) || {});
      if (r2.id && r2.id !== p.region) {
        const oldReg = p.region;
        p.region = r2.id;
        syncPlayerRegionSubscription(p, oldReg, r2.id);
      }
      ensureNearbyMobs(p);

      send(p, {
        t: 'region', region: p.region,
        peace: isPeaceAt(p.x, p.z),
        zoneName: zoneLabelAt(p.x, p.z)
      });
      // сразу в профиль на диск
      saveProfileNow(p);
      send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
      break;
    }
    case 'attack': {
      if (p.dead || p.hp <= 0) return;
      if (p.sitting) p.sitting = false;
      p._lastCombatAt = Date.now();
      if (p.casting) cancelPlayerCast(p, 'attack');
      if (playerStunned(p)) return;
      if (!playerWeightState(p).canAttack) {
        send(p, { t: 'msg', text: 'Слишком тяжело — нельзя атаковать.' });
        return;
      }
      if (!checkRate(p, 'attack')) return;
      const m = mobs.get(msg.mid | 0); if (!m || m.hp <= 0) return;
      // C1: автоатака ВСЕГДА melee physical (жезл/посох бьют рядом, P.Atk)
      // Схемы (C.Atk) — только skills, не AA. Лук — отдельный ranged.
      // `|| !!msg.ranged` убран: клиент выставлял флаг и бил жезлом с 30 м
      // (проверено: 5 попаданий с 22 м). Класс оружия — только с сервера,
      // как уже сделано в PvP-ветке.
      const pack = p.combatPack;
      const wClass = pack.weaponClass || 'fist';
      const isBow = wClass === 'bow';
      const range = isBow ? RANGED_RANGE : MELEE_RANGE;
      if (dist2(p.x, p.z, m.x, m.z) > range * range) return;
      if (!losGround(p.x, p.z, m.x, m.z)) { notifyLos(p); return; }
      if ((p.cd.atk || 0) > Date.now()) return;
      // Интервал по Atk.Spd оружия (см. combatPack.atkIntervalMs): кинжал 333 и
      // двуручный посох 190 больше не бьют одинаково. Квантовано шагом 100 мс.
      p.cd.atk = Date.now() + (L2.quantizeCombatMs ? L2.quantizeCombatMs(pack.atkIntervalMs, 100) : pack.atkIntervalMs);
      const attackFacing = Math.atan2(m.x - p.x, m.z - p.z);
      p.facing = attackFacing;
      // C1 Soulshot: ×2 phys AA, consume 1 if armed
      const ss = consumeArmedShot(p, 'ss');
      const mobTpl = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId)) || null;
      const hit = L2.resolveHit(
        {
          pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate,
          level: p.level, dex: pack.dex, wit: pack.wit,
          classTier: pack.tier != null ? pack.tier : (CS.getClass(p.cls) ? CS.getClass(p.cls).tier : 0)
        },
        {
          pDef: m.pDef, cDef: m.cDef != null ? m.cDef : m.mDef,
          evasion: m.evasion != null ? m.evasion : (15 + m.level * 1.2), level: m.level,
          eliteRaid: !!(m.eliteRaid || (mobTpl && mobTpl.eliteRaid)),
          epicRaid: !!(m.epicRaid || (mobTpl && mobTpl.epicRaid))
        },
        { skillPower: 1.0, damageType: 'physical', shotMod: ss.shotMod }
      );
      if (hit.lethalFeedback) {
        const lethalDmg = hit.feedbackDamage || 99999;
        p.hp = 0;
        p.dead = true;
        onPlayerHit(p, lethalDmg);
        send(p, {
          t: 'hit', dmg: lethalDmg, by: 'm' + m.mid, crit: true,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        });
        broadcastAOI(p, {
          t: 'dmg_player', pid: p.pid, dmg: lethalDmg, crit: true,
          by: 'm' + m.mid, mobId: m.mobId
        });
        send(p, {
          t: 'msg',
          text: 'Аварийный разряд сверхдавления отражает удар! Смертельное отражение: требуется 1-я профессия!'
        });
        onPlayerDeath(p, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
        break;
      }
      if (hit.missed) {
        broadcastAOI(p, {
          t: 'dmg', mid: m.mid, dmg: 0, crit: false, miss: true, by: p.pid,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
          facing: attackFacing, atkInterval: pack.atkIntervalMs
        });
        send(p, { t: 'msg', text: 'Промах!' });
        break;
      }
      m.hp = Math.max(0, m.hp - hit.damage);
      const vampM = BR.foldAdd ? BR.foldAdd(p.buffs, 'vampiric', Date.now()) : 0;
      if (vampM > 0 && hit.damage > 0 && p.hp < p.maxHp) {
        const healAmt = Math.min(p.maxHp - p.hp, Math.floor(hit.damage * vampM));
        if (healAmt > 0) {
          p.hp += healAmt;
          send(p, { t: 'vitals', hp: Math.floor(p.hp), maxHp: p.maxHp, energy: Math.floor(p.energy), maxEnergy: p.maxEnergy });
        }
      }
      addMobHate(m, p.pid, hateFromHit(m, hit.damage, { crit: !!hit.crit, skill: false }));
      broadcastAOI(p, {
        t: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit, by: p.pid, ss: !!ss.consumed,
        hp: m.hp, maxHp: m.maxHp,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
        facing: attackFacing, atkInterval: pack.atkIntervalMs
      });
      if (ss.consumed) send(p, { t: 'shot_use', id: ss.consumed, inv: p.inv, armedShot: p.armedShot || null });
      if (m.hp <= 0) onMobDeath(p, m);
      break;
    }
    case 'attack_player': {
      if (p.dead || p.hp <= 0) return;
      if (p.casting) cancelPlayerCast(p, 'attack');
      if (playerStunned(p)) return;
      if (!playerWeightState(p).canAttack) return;
      if (!checkRate(p, 'pvp')) return;
      const tgt = players.get(msg.pid | 0);
      if (!tgt) {
        if (IS_CLUSTER && borderGhosts.has(msg.pid | 0)) {
          send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
        }
        return;
      }
      if (tgt.hp <= 0 || tgt.dead) return;
      if (tgt.pid === p.pid) return;
      if (isSyntheticBot(p.yid) || isSyntheticBot(tgt.yid)) return;
      if (pvpPeaceBlocked(p, tgt)) {
        send(p, { t: 'msg', text: 'В мирной зоне нельзя атаковать.' });
        return;
      }
      const pvpPack = p.combatPack;
      const wClass = pvpPack.weaponClass || 'fist';
      const isBow = wClass === 'bow';
      const pvpRange = isBow ? RANGED_RANGE : MELEE_RANGE;
      if (dist2(p.x, p.z, tgt.x, tgt.z) > pvpRange * pvpRange) return;
      if (!losGround(p.x, p.z, tgt.x, tgt.z)) { notifyLos(p); return; }
      // Тот же интервал, что в PvE (Atk.Spd оружия): раньше в PvP была жёсткая
      // секунда без DEX, потом — DEX без учёта типа оружия.
      if ((p.cd.atk || 0) > Date.now()) return;
      p.cd.atk = Date.now() + (L2.quantizeCombatMs ? L2.quantizeCombatMs(pvpPack.atkIntervalMs, 100) : pvpPack.atkIntervalMs);
      const attackFacing = Math.atan2(tgt.x - p.x, tgt.z - p.z);
      p.facing = attackFacing;
      maybeFlagPvp(p, tgt);
      const pack = pvpPack;
      const tPack = tgt.combatPack;
      const ssPvp = consumeArmedShot(p, 'ss');
      const hit = L2.resolveHit(
        {
          pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate,
          level: p.level, dex: pack.dex, wit: pack.wit
        },
        {
          pDef: tPack.pDef, cDef: tPack.cDef, evasion: tPack.evasion, level: tgt.level,
          hasShield: tPack.hasShield, shieldDef: tPack.shieldDef
        },
        { skillPower: 1.0, damageType: 'physical', shotMod: ssPvp.shotMod }
      );
      if (hit.missed) {
        broadcastAOI(tgt, {
          t: 'dmg_player', pid: tgt.pid, dmg: 0, crit: false, miss: true, by: p.pid,
          facing: attackFacing, atkInterval: pvpPack.atkIntervalMs
        });
        send(p, { t: 'msg', text: 'Промах!' });
        break;
      }
      if (isPlayerImmortal(tgt)) {
        send(tgt, { t: 'hit', dmg: 0, immune: true, by: 'p' + p.pid });
        send(p, { t: 'msg', text: 'Цель неуязвима.' });
        break;
      }
      tgt.hp = Math.max(0, tgt.hp - hit.damage);
      onPlayerHit(tgt, hit.damage);
      onPlayerHit(p, 0);
      send(tgt, { t: 'hit', dmg: hit.damage, by: 'p' + p.pid });
      broadcastAOI(tgt, {
        t: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit, by: p.pid,
        facing: attackFacing, atkInterval: pvpPack.atkIntervalMs
      });
      if (tgt.hp <= 0) onPvpLethal(tgt, p);
      break;
    }
    case 'equip': {
      if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); break; }
      if (p.trade || p.store) { send(p, { t: 'equip_fail', reason: 'busy' }); break; }
      if (!checkRate(p, 'action')) return;
      let slot = String(msg.slot || '').toLowerCase();
      let templateId = String(msg.templateId || msg.id || '').toLowerCase();
      if (!slot || !templateId || isBadKey(slot) || isBadKey(templateId)) {
        send(p, { t: 'equip_fail', reason: 'args' });
        break;
      }
      // Миграция: только резонатор-как-оружие → necklace (apprentice_wand = оружие в руке)
      if (templateId === 'engineer_emitter_low') slot = 'necklace';
      // Кольца → один слот браслетов; нано-браслеты всегда bracelet
      if (slot === 'ring_l' || slot === 'ring_r' || slot === 'ring') slot = 'bracelet';
      if (templateId === 'engineer_nano_bracelet') slot = 'bracelet';

      const tpl = ITEMS.get(templateId);
      if (!tpl) {
        send(p, { t: 'equip_fail', reason: 'unknown', templateId });
        break;
      }
      const needLv = ITEMS.itemLevelReq ? ITEMS.itemLevelReq(tpl) : GR.itemLevelReq(tpl);
      if ((p.level | 0) < needLv) {
        send(p, { t: 'equip_fail', reason: 'level', templateId, need: needLv, have: p.level | 0 });
        send(p, { t: 'msg', text: 'Требуется ' + needLv + ' уровень.' });
        break;
      }
      // Авторитет слота — template.slot (клиент мог прислать weapon для резонатора)
      const wantSlot = String(tpl.slot || slot).toLowerCase();
      if (wantSlot && wantSlot !== slot) {
        // weapon type may still use 'weapon' if template says so
        if (!(slot === 'weapon' && (tpl.type === 'weapon' || wantSlot === 'weapon'))) {
          if (tpl.slot) slot = wantSlot;
        }
      }
      if (!p.equip) p.equip = Object.create(null);
      // ВЛАДЕНИЕ: предмет должен быть в сумке либо уже надет в другом слоте.
      // Без этой проверки любой клиент надевал любой предмет из базы, а связка
      // equip → drop_item → loot_pickup создавала предметы из ничего.
      let fromSlot = null;
      for (const s of Object.keys(p.equip)) {
        const e = p.equip[s];
        const tid = e && String(e.templateId || e.id || '').toLowerCase();
        if (tid === templateId) { fromSlot = s; break; }
      }
      const inBag = (p.inv[templateId] | 0) >= 1;
      if (!inBag && fromSlot == null) {
        send(p, { t: 'equip_fail', reason: 'none', templateId, inv: p.inv, equip: p.equip });
        send(p, { t: 'msg', text: 'Нет такого предмета.' });
        break;
      }
      const prev = Object.prototype.hasOwnProperty.call(p.equip, slot) ? p.equip[slot] : null;
      const prevTid = prev && String(prev.templateId || prev.id || '').toLowerCase();
      if (prevTid === templateId) {
        // уже надет в этот слот — идемпотентно
        send(p, { t: 'equip_ok', slot, templateId, equip: p.equip, inv: p.inv });
        break;
      }
      if (prevTid) {
        const tempInv = Object.assign({}, p.inv);
        if (fromSlot == null) {
          tempInv[templateId] = (tempInv[templateId] | 0) - 1;
          if (tempInv[templateId] <= 0) delete tempInv[templateId];
        }
        const fit = NPCS.canFit(tempInv, prevTid, 1);
        if (!fit.ok) {
          send(p, { t: 'equip_fail', reason: 'inv_full', limit: NPCS.INVENTORY_SLOTS_LIMIT });
          send(p, { t: 'msg', text: 'Инвентарь полон.' });
          break;
        }
      }
      if (fromSlot != null) {
        // перенос между слотами (weapon↔necklace, ring→bracelet)
        const moved = p.equip[fromSlot];
        if (moved && (moved.plus | 0) > 0) p.plusById[templateId] = moved.plus | 0;
        delete p.equip[fromSlot];
      } else {
        p.inv[templateId] = (p.inv[templateId] | 0) - 1;
        if (p.inv[templateId] <= 0) delete p.inv[templateId];
      }
      // снятое из целевого слота возвращается в сумку, заточка запоминается
      if (prevTid) {
        p.inv[prevTid] = (p.inv[prevTid] | 0) + 1;
        if ((prev.plus | 0) > 0) p.plusById[prevTid] = prev.plus | 0;
      }
      const eq = Object.create(null);
      eq.id = templateId;
      eq.templateId = templateId;
      // Заточка берётся из серверного реестра, а не из клиентского пакета:
      // раньше клиент присылал любой plus и получал бесплатную заточку.
      const keptPlus = p.plusById[templateId] | 0;
      if (keptPlus > 0) eq.plus = keptPlus;
      else eq.plus = 0;
      // Уровни приборов — из серверного p.devices, а не из пакета: раньше
      // клиент присылал circuitLevel: 99 и обходил гейт скиллов целиком.
      stampDeviceFields(p, eq, tpl);
      p.equip[slot] = eq;
      // cleanup legacy ring keys
      if (p.equip.ring_l) delete p.equip.ring_l;
      if (p.equip.ring_r) delete p.equip.ring_r;
      pushCombatStats(p);
      saveProfileNow(p);
      send(p, { t: 'equip_ok', slot, templateId, equip: p.equip, inv: p.inv });
      const pen = p.combatPack && p.combatPack.gradePenalty;
      if (pen && pen.active) {
        send(p, { t: 'msg', text: 'Штраф грейда: нет экспертизы для этого кристалла.' });
      }
      if (slot === 'title') {
        broadcastCosmeticsUpdate(p);
      }
      break;
    }
    case 'unequip': {
      if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); break; }
      if (p.trade || p.store) { send(p, { t: 'equip_fail', reason: 'busy' }); break; }
      if (!checkRate(p, 'action')) return;
      const slot = String(msg.slot || '').toLowerCase();
      if (!slot || isBadKey(slot) || !p.equip || !Object.prototype.hasOwnProperty.call(p.equip, slot)) {
        send(p, { t: 'equip_fail', reason: 'empty', slot });
        break;
      }
      const off = p.equip[slot];
      const offTid = off && String(off.templateId || off.id || '').toLowerCase();
      if (offTid) {
        const fit = NPCS.canFit(p.inv, offTid, 1);
        const uniqueKeys = Object.keys(p.inv || {}).length;
        if (!fit.ok || (uniqueKeys >= (NPCS.MAX_INV_SLOTS || 80) && !p.inv[offTid])) {
          send(p, { t: 'equip_fail', reason: 'inv_full', slot });
          send(p, { t: 'msg', text: 'Инвентарь переполнен!' });
          break;
        }
      }
      delete p.equip[slot];
      // снятое возвращается в сумку, иначе предмет исчезал из мира
      if (offTid) {
        p.inv[offTid] = (p.inv[offTid] | 0) + 1;
        if ((off.plus | 0) > 0) p.plusById[offTid] = off.plus | 0;
      }
      pushCombatStats(p);
      saveProfileNow(p);
      send(p, { t: 'unequip_ok', slot, equip: p.equip, inv: p.inv });
      if (slot === 'title') {
        broadcastCosmeticsUpdate(p);
      }
      break;
    }
    // Drop item from inventory (or equipped slot) → ground loot pile
    case 'drop_item': {
      if (p.dead) return;
      if (p.trade || p.store) {
        send(p, { t: 'drop_fail', reason: 'busy' });
        break;
      }
      if (!checkRate(p, 'action')) return;
      const itemId = String(msg.itemId || msg.id || '').toLowerCase();
      if (!itemId) {
        send(p, { t: 'drop_fail', reason: 'args' });
        break;
      }
      const itemMeta = itemLookup(itemId);
      const isUndroppable = DR.isDevice(itemId, itemMeta) ||
        !!(itemMeta && (itemMeta.nodrop || itemMeta.noDrop || itemMeta.undroppable || itemMeta.notDropable || itemMeta.bound || itemMeta.type === 'quest' || itemMeta.quest));
      if (isUndroppable) {
        send(p, { t: 'drop_fail', reason: 'nodrop', itemId });
        send(p, { t: 'msg', text: 'Этот предмет персональный и не может быть выброшен.' });
        break;
      }
      let n = Math.floor(+msg.count || 1);
      if (n < 1) n = 1;
      if (n > 9999) n = 9999;

      // 1) Prefer bag stack
      let have = invCount(p, itemId);
      let fromEquipSlot = null;
      if (have < 1 && p.equip) {
        // 2) Equipped piece (weapons/armor often only in equip, not bag)
        Object.keys(p.equip).forEach((s) => {
          if (fromEquipSlot) return;
          const e = p.equip[s];
          const tid = e && String(e.templateId || e.id || '').toLowerCase();
          if (tid === itemId) fromEquipSlot = s;
        });
      }

      if (have < 1 && !fromEquipSlot) {
        send(p, { t: 'drop_fail', reason: 'none', itemId });
        send(p, { t: 'msg', text: 'Нет такого предмета.' });
        break;
      }

      let dropPlus = 0;
      if (fromEquipSlot) {
        const piece = p.equip[fromEquipSlot];
        dropPlus = (piece && piece.plus | 0) || (p.plusById && p.plusById[itemId] | 0) || 0;
        n = 1;
        delete p.equip[fromEquipSlot];
        if (p.plusById && dropPlus > 0) {
          const remainingEqPlus = equippedPlus(p, itemId);
          if (remainingEqPlus > 0) {
            p.plusById[itemId] = remainingEqPlus;
          } else {
            delete p.plusById[itemId];
          }
        }
        pushCombatStats(p);
        if (fromEquipSlot === 'title') {
          broadcastCosmeticsUpdate(p);
        }
      } else {
        if (n > have) n = have;
        const eqCount = equippedCount(p, itemId);
        const eqPlus = equippedPlus(p, itemId);
        let bagPlus = (p.plusById && p.plusById[itemId] | 0) || 0;
        if (eqCount > 0 && eqPlus >= bagPlus) {
          bagPlus = 0;
        }
        if (bagPlus > 0 && n < have) {
          send(p, { t: 'drop_fail', reason: 'enchanted', itemId });
          break;
        }
        dropPlus = (n >= have) ? bagPlus : 0;
        p.inv[itemId] = have - n;
        if (p.inv[itemId] <= 0) delete p.inv[itemId];
      }

      // Drop slightly in front of player (facing-agnostic offset)
      const ox = p.x + (Math.random() - 0.5) * 1.4 + 0.6;
      const oz = p.z + (Math.random() - 0.5) * 1.4 + 0.6;
      const L = spawnGroundLoot(ox, oz, itemId, n, p.pid, {
        spoil: false, playerDrop: true, plus: dropPlus
      });
      Object.keys(p.inv || {}).forEach((k) => {
        if (!p.inv[k] || p.inv[k] <= 0) delete p.inv[k];
      });
      clearPlusIfGone(p, itemId);
      saveProfileNow(p);
      send(p, {
        t: 'drop_ok',
        itemId: itemId,
        count: n,
        plus: dropPlus,
        lid: L ? L.lid : null,
        inv: p.inv,
        equip: p.equip || {},
        invPlus: p.plusById,
        fromEquip: !!fromEquipSlot,
        slot: fromEquipSlot || null
      });
      pushWeight(p);
      break;
    }
    // Permanently destroy item from inventory or equip (no ground pile)
    case 'destroy_item': {
      if (p.dead) {
        send(p, { t: 'destroy_fail', reason: 'dead' });
        return;
      }
      if (p.trade || p.store) {
        send(p, { t: 'destroy_fail', reason: 'busy' });
        return;
      }
      if (!checkRate(p, 'action')) return;
      const itemId = String(msg.itemId || msg.id || '').toLowerCase();
      if (!itemId) {
        send(p, { t: 'destroy_fail', reason: 'args' });
        break;
      }
      const itemMeta = itemLookup(itemId);
      const isUndestroyable = DR.isDevice(itemId, itemMeta) ||
        !!(itemMeta && (itemMeta.nodrop || itemMeta.noDrop || itemMeta.undroppable || itemMeta.notDropable || itemMeta.bound || itemMeta.type === 'quest' || itemMeta.quest));
      if (isUndestroyable) {
        send(p, { t: 'destroy_fail', reason: 'nodrop', itemId });
        send(p, { t: 'msg', text: 'Этот предмет персональный и не может быть уничтожен.' });
        break;
      }
      let n = Math.floor(+msg.count || 1);
      if (n < 1) n = 1;
      if (n > 9999) n = 9999;

      let have = invCount(p, itemId);
      let fromEquipSlot = null;
      if (have < 1 && p.equip) {
        Object.keys(p.equip).forEach((s) => {
          if (fromEquipSlot) return;
          const e = p.equip[s];
          const tid = e && String(e.templateId || e.id || '').toLowerCase();
          if (tid === itemId) fromEquipSlot = s;
        });
      }

      if (have < 1 && !fromEquipSlot) {
        send(p, { t: 'destroy_fail', reason: 'none', itemId });
        send(p, { t: 'msg', text: 'Нет такого предмета.' });
        break;
      }

      if (fromEquipSlot) {
        const piece = p.equip[fromEquipSlot];
        const piecePlus = (piece && piece.plus | 0) || (p.plusById && p.plusById[itemId] | 0) || 0;
        n = 1;
        delete p.equip[fromEquipSlot];
        if (p.plusById && piecePlus > 0) {
          const remainingEqPlus = equippedPlus(p, itemId);
          if (remainingEqPlus > 0) {
            p.plusById[itemId] = remainingEqPlus;
          } else {
            delete p.plusById[itemId];
          }
        }
        pushCombatStats(p);
        if (fromEquipSlot === 'title') {
          broadcastCosmeticsUpdate(p);
        }
      } else {
        if (n > have) n = have;
        const eqCount = equippedCount(p, itemId);
        const eqPlus = equippedPlus(p, itemId);
        let bagPlus = (p.plusById && p.plusById[itemId] | 0) || 0;
        if (eqCount > 0 && eqPlus >= bagPlus) {
          bagPlus = 0;
        }
        if (bagPlus > 0 && n < have) {
          send(p, { t: 'destroy_fail', reason: 'enchanted', itemId });
          break;
        }
        p.inv[itemId] = have - n;
        if (p.inv[itemId] <= 0) delete p.inv[itemId];
      }

      Object.keys(p.inv || {}).forEach((k) => {
        if (!p.inv[k] || p.inv[k] <= 0) delete p.inv[k];
      });
      clearPlusIfGone(p, itemId);
      saveProfileNow(p);
      pushWeight(p);
      send(p, {
        t: 'destroy_ok',
        itemId: itemId,
        count: n,
        inv: p.inv,
        equip: p.equip || {},
        invPlus: p.plusById,
        fromEquip: !!fromEquipSlot,
        slot: fromEquipSlot || null
      });
      break;
    }
    case 'cast_begin': {
      if (!checkRate(p, 'skill')) return;
      doCastBegin(p, msg);
      break;
    }
    case 'cast_complete':
    case 'skill': {
      if (!checkRate(p, 'skill')) return;
      doSkillCast(p, msg);
      break;
    }
    case 'cast_cancel': {
      cancelPlayerCast(p, 'user');
      break;
    }
    case 'test_set_non_gm': {
      if (process.env.NODE_ENV === 'production') break;
      p.nonGm = true;
      send(p, { t: 'test_set_non_gm_ok' });
      break;
    }
    case 'test_set_require_cast': {
      if (process.env.NODE_ENV === 'production') break;
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
      const bagPlusCraft = (equippedCount(p, rec.result.id) === 0) && (p.plusById && (p.plusById[rec.result.id] | 0) > 0);
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
      if (p.dead || p.hp <= 0) return;
      if (p.trade || p.store) { send(p, { t: 'enchant_fail', reason: 'busy' }); break; }
      if (!checkRate(p, 'action')) return;
      // slot='__proto__' раньше давал Object.prototype и запись item.plus
      // загрязняла прототип на весь процесс (все предметы становились +N).
      const slot = String(msg.slot || '');
      if (isBadKey(slot)) return;
      const item = Object.prototype.hasOwnProperty.call(p.equip, slot) ? p.equip[slot] : null;
      if (!item || typeof item !== 'object') return;
      const plus = Math.max(0, Math.floor(+item.plus || 0));
      // Верхняя граница: раньше plus рос бесконечно (и не влиял на статы).
      if (plus >= ITEMS.ENCHANT_MAX) {
        send(p, { t: 'enchant_fail', slot, plus, reason: 'max', max: ITEMS.ENCHANT_MAX, inv: p.inv, equip: p.equip });
        break;
      }
      // Приборы (резонатор/браслеты) точить нельзя: у них своя линия прокачки
      // корпуса (device_upgrade), и plus на их статы не влияет.
      const eTpl = ITEMS.get(String(item.templateId || item.id || '').toLowerCase());
      if (eTpl && (ITEMS.isResonatorTpl(eTpl) || ITEMS.isNanoBraceletTpl(eTpl))) {
        send(p, { t: 'enchant_fail', slot, plus, reason: 'device', inv: p.inv, equip: p.equip });
        break;
      }
      if ((p.inv.pressure_amplifier || 0) < 1) { send(p, { t:'msg', text:'Нужен усилитель давления.' }); return; }
      p.inv.pressure_amplifier -= 1;
      if (p.inv.pressure_amplifier <= 0) delete p.inv.pressure_amplifier;
      const forceBreak = p.dev && String(msg.force || '') === 'break';
      const okRoll = !forceBreak && Math.random() < G.enchantSuccess(plus);
      if (okRoll) {
        item.plus = plus + 1;
        // plusById — реестр заточки для вещей в сумке; без обновления успешная
        // заточка «терялась» до следующего unequip.
        const tid = String(item.templateId || item.id || '').toLowerCase();
        if (tid) p.plusById[tid] = item.plus;
        pushCombatStats(p);  // plus теперь влияет на статы (item-db)
        send(p, { t: 'enchant_ok', slot, plus: item.plus, inv: p.inv, equip: p.equip });
      } else if (plus >= G.ENCHANT_SAFE) {
        const tid = String(item.templateId || item.id || '').toLowerCase();
        const lootTpl = (LR && LR.itemById) ? LR.itemById(tid) : ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[tid] : null);
        const crySrc = Object.assign({}, eTpl || {}, lootTpl || {});
        const cry = ER.crystalize(crySrc, plus);
        delete p.equip[slot];
        if (tid && p.plusById) delete p.plusById[tid];
        let crystals = null;
        let ground = false;
        if (cry && cry.count > 0) {
          const fit = NPCS.canFit(p.inv, cry.crystalId, cry.count);
          const carry = canCarryMore(p, cry.crystalId, cry.count);
          if (fit.ok && carry.ok) {
            p.inv[cry.crystalId] = invCount(p, cry.crystalId) + cry.count;
            crystals = { id: cry.crystalId, count: cry.count };
          } else {
            spawnGroundLoot(p.x, p.z, cry.crystalId, cry.count, p.pid, { spoil: false });
            crystals = { id: cry.crystalId, count: cry.count };
            ground = true;
          }
        }
        pushCombatStats(p);
        pushWeight(p);
        send(p, { t: 'enchant_break', slot, crystals: crystals, ground: ground, inv: p.inv, equip: p.equip });
      } else {
        send(p, { t: 'enchant_fail', slot, plus, inv: p.inv, equip: p.equip });
      }
      saveProfileNow(p);
      break;
    }
    case 'use': {
      if (!checkRate(p, 'action')) return;
      const id = String(msg.id || msg.templateId || '').toLowerCase();
      if (!id || isBadKey(id)) {
        send(p, { t: 'use_fail', reason: 'args' });
        break;
      }
      // C1 Soulshot/Spiritshot: arm auto-consume (не списывать пачкой при клике)
      const shotToggle = toggleShotArm(p, id);
      if (shotToggle) {
        if (!shotToggle.ok) {
          send(p, { t: 'use_fail', reason: shotToggle.reason || 'empty', id, inv: p.inv });
          break;
        }
        saveProfileNow(p);
        send(p, {
          t: 'use_ok',
          id,
          shotArmed: shotToggle.armed,
          armedShot: p.armedShot || null,
          shotKind: shotToggle.kind || null,
          shotMult: shotToggle.mult || null,
          gradeOk: shotToggle.gradeOk,
          weaponGrade: shotToggle.weaponGrade || null,
          inv: p.inv,
          equip: p.equip || {},
          hp: Math.floor(p.hp),
          maxHp: p.maxHp,
          energy: Math.floor(p.energy),
          maxEnergy: p.maxEnergy
        });
        let armText = shotToggle.armed
          ? ('Заряды включены: ' + id + ' (×' + (shotToggle.mult || 2) + ')')
          : ('Заряды выключены: ' + id);
        if (shotToggle.armed && shotToggle.gradeOk === false) {
          armText += ' — грейд не совпадает с оружием (' + (shotToggle.weaponGrade || '?') + ')';
        }
        send(p, { t: 'msg', text: armText });
        break;
      }
      // G.CONSUMABLES['constructor'] возвращал функцию (truthy), из-за чего
      // проверки «неизвестный предмет» и «нет предмета» обходились.
      const eff = tableGet(G.CONSUMABLES, id);
      if (!eff || typeof eff !== 'object') {
        send(p, { t: 'use_fail', reason: 'unknown', id });
        break;
      }
      if ((p.inv[id] || 0) < 1) {
        send(p, { t: 'use_fail', reason: 'empty', id, inv: p.inv, equip: p.equip });
        break;
      }

      // Косметика / титулы / ауры / мем-свитки
      if (eff.cosmetic || tableGet(COS.ITEM_EFFECTS, id)) {
        const cosEff = tableGet(COS.ITEM_EFFECTS, id) || {};
        // skill scroll already known → don't consume
        if (cosEff.grantSkill) {
          const sid = String(cosEff.grantSkill).toLowerCase();
          if (p.skills && (p.skills[sid] || 0) >= 1) {
            send(p, { t: 'use_fail', reason: 'already_skill', id, inv: p.inv, equip: p.equip });
            send(p, { t: 'msg', text: 'Умение уже изучено: ' + (SK.get(sid) && SK.get(sid).name || sid) });
            break;
          }
        }
        p.inv[id] = (p.inv[id] || 0) - 1;
        if (p.inv[id] <= 0) delete p.inv[id];
        const applied = COS.applyItemEffect(p.cosmetics, cosEff);
        p.cosmetics = applied.cosmetics;
        const auraId = cosEff.auraId || eff.auraId;
        if (auraId) {
          const now = Date.now();
          const dur = eff.duration || 1200;
          const itemObj = itemLookup(id);
          const buffName = (itemObj && itemObj.name) || 'Эликсир ауры';
          const buffObj = {
            id: id,
            name: buffName,
            kind: 'buff',
            auraId: auraId,
            stackGroup: 'aura_elixir',
            until: now + dur * 1000,
            duration: dur,
            priority: 30,
            persistOnDeath: true,
            icon: eff.icon || ('elixir_' + auraId)
          };
          if (eff.attackMult) buffObj.attackMult = eff.attackMult;
          if (eff.defenseMult) buffObj.defenseMult = eff.defenseMult;
          if (eff.speedMult) buffObj.speedMult = eff.speedMult;
          if (eff.atkSpdMult) buffObj.atkSpdMult = eff.atkSpdMult;
          if (eff.critDamageBoost) buffObj.critDamageBoost = eff.critDamageBoost;
          if (eff.vampiric) buffObj.vampiric = eff.vampiric;
          if (eff.stunResist) buffObj.stunResist = eff.stunResist;
          if (eff.maxEnergyBonus) buffObj.maxEnergyBonus = eff.maxEnergyBonus;
          if (eff.energyRegenMult) buffObj.energyRegenMult = eff.energyRegenMult;
          if (eff.hpRegenFlat) buffObj.hpRegenFlat = eff.hpRegenFlat;
          if (eff.energyRegenFlat) buffObj.energyRegenFlat = eff.energyRegenFlat;
          if (eff.adenaMult) buffObj.adenaMult = eff.adenaMult;
          if (eff.dropMult) buffObj.dropMult = eff.dropMult;

          applyPlayerBuff(p, buffObj, now);
          pushCombatStats(p);
          pushEffects(p);
        }
        let grantInfo = null;
        if (applied.grantSkill) {
          grantInfo = grantSkillFree(p, applied.grantSkill);
        }
        saveProfileNow(p);
        const cosPub = cosmeticsPublic(p);
        send(p, {
          t: 'use_ok',
          id,
          cosmetic: true,
          cosmetics: cosPub,
          cosmeticsFull: p.cosmetics,
          grantSkill: grantInfo,
          skills: p.skills || {},
          inv: p.inv,
          equip: p.equip || {},
          hp: Math.floor(p.hp),
          maxHp: p.maxHp,
          energy: Math.floor(p.energy),
          maxEnergy: p.maxEnergy
        });
        if (applied.msg) send(p, { t: 'msg', text: applied.msg });
        if (grantInfo && grantInfo.ok && !grantInfo.already) {
          send(p, {
            t: 'learn_skill_ok',
            skillId: grantInfo.skillId,
            rank: 1,
            sp: p.sp || 0,
            cost: 0,
            name: grantInfo.name,
            free: true,
            skills: p.skills
          });
        }
        // AOI: все видят новый титул/цвет/ауру
        broadcastAOI(p, {
          t: 'cosmetic',
          pid: p.pid,
          title: cosPub.title,
          titleName: cosPub.titleName,
          titleColor: cosPub.titleColor,
          nameColor: cosPub.nameColor,
          aura: cosPub.aura
        });
        if (auraId) {
          broadcastAOI(p, {
            t: 'cosmetic_burst',
            pid: p.pid,
            auraId: auraId
          });
        }
        break;
      }

      p.inv[id] = (p.inv[id] || 0) - 1;
      if (p.inv[id] <= 0) delete p.inv[id];
      // Актуальный maxHp/maxEnergy с экипа (без ratio-стирания хила — heal после)
      const pack = p.combatPack;
      if (pack) {
        p.maxHp = pack.maxHp;
        p.maxEnergy = pack.maxEnergy;
      }
      if (eff.escapeToCity) {
        if (p.isFlagged) {
          send(p, { t: 'msg', text: 'Нельзя телепортироваться во время PvP-флага!' });
        } else {
          p.x = -116.008;
          p.z = -138.057;
          if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
          snapStandY(p);
          p.moving = false;
          resetMoveBudget(p);
          const r = WM.regionAt(p.x, p.z) || {};
          if (r.id) p.region = r.id;
          ensureNearbyMobs(p);
          broadcastAOI(p, { t: 'player_teleport', pid: p.pid, x: p.x, y: p.y, z: p.z });
          send(p, {
            t: 'teleport_ok',
            name: 'Деревня поющей стали', x: p.x, y: p.y, z: p.z,
            region: p.region, peace: isPeaceAt(p.x, p.z), zoneName: zoneLabelAt(p.x, p.z),
            inv: p.inv
          });
          send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
          send(p, { t: 'msg', text: 'Вы вернулись в Деревню Поющей Стали.' });
        }
      }
      if (eff.curePoison) {
        if (Array.isArray(p.debuffs)) {
          p.debuffs = p.debuffs.filter(e => e && e.kind !== 'poison' && e.id !== 'poison');
          pushEffects(p);
          send(p, { t: 'msg', text: 'Яд нейтрализован.' });
        }
      }
      if (eff.cureBleed) {
        if (Array.isArray(p.debuffs)) {
          p.debuffs = p.debuffs.filter(e => e && e.kind !== 'bleed' && e.id !== 'bleed');
          pushEffects(p);
          send(p, { t: 'msg', text: 'Кровотечение остановлено.' });
        }
      }
      if (eff.healHp) p.hp = Math.min(p.maxHp, p.hp + eff.healHp);
      if (eff.healEnergy) p.energy = Math.min(p.maxEnergy, p.energy + eff.healEnergy);
      let buffApplied = false;
      const dur = eff.duration || 0;
      if (dur > 0 && (eff.damageBoost || eff.attackMult || eff.defenseMult || eff.speedMult)) {
        const now = Date.now();
        const itemObj = itemLookup(id);
        const buffName = (itemObj && itemObj.name) || id;
        const buffObj = {
          id: id,
          name: buffName,
          kind: 'buff',
          stackGroup: 'item_' + id,
          until: now + dur * 1000,
          duration: dur,
          priority: 25,
          icon: eff.icon || id
        };
        if (eff.damageBoost || eff.attackMult) {
          buffObj.attackMult = eff.damageBoost || eff.attackMult;
        }
        if (eff.defenseMult) {
          buffObj.defenseMult = eff.defenseMult;
        }
        if (eff.speedMult) {
          buffObj.speedMult = eff.speedMult;
        }
        if (eff.atkSpdMult) {
          buffObj.atkSpdMult = eff.atkSpdMult;
        }
        applyPlayerBuff(p, buffObj, now);
        buffApplied = true;
      }
      saveProfileNow(p);
      send(p, {
        t: 'use_ok',
        id,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        healedHp: eff.healHp || 0,
        healedEnergy: eff.healEnergy || 0,
        damageBoost: eff.damageBoost || 0,
        duration: eff.duration || 0,
        inv: p.inv,
        equip: p.equip || {}
      });
      if (buffApplied) {
        pushEffects(p);
        pushCombatStats(p);
      }
      break;
    }
    case 'duel_offer': {
      if (!checkRate(p, 'action')) return;
      let tgt = msg.pid != null ? players.get(msg.pid | 0) : null;
      if (!tgt && msg.name) tgt = findPlayerByName(msg.name);
      const chk = DU.canChallenge(duelView(p), duelView(tgt));
      if (!chk.ok) {
        send(p, { t: 'duel_fail', reason: chk.reason });
        return;
      }
      if (p._duelTo && !DU.inviteExpired(p._duelTo.at) && p._duelTo.pid !== tgt.pid) {
        send(p, { t: 'duel_fail', reason: 'busy' });
        return;
      }
      const now = Date.now();
      tgt._duelFrom = { pid: p.pid, at: now };
      p._duelTo = { pid: tgt.pid, at: now };
      registerDuelPlayer(p);
      registerDuelPlayer(tgt);
      send(tgt, { t: 'duel_invite', from: p.pid, fromName: p.name });
      send(tgt, { t: 'msg', text: p.name + ' вызывает вас на дуэль. /duel_accept' });
      send(p, { t: 'msg', text: 'Вызов отправлен: ' + tgt.name });
      break;
    }
    case 'duel_accept': {
      if (!checkRate(p, 'action')) return;
      const from = p._duelFrom;
      const wantPid = (msg && msg.pid != null) ? (msg.pid | 0) : (from ? from.pid : null);
      if (!from || wantPid == null || from.pid !== wantPid || DU.inviteExpired(from.at)) {
        p._duelFrom = null;
        send(p, { t: 'duel_fail', reason: 'no_invite' });
        return;
      }
      const q = players.get(from.pid);
      if (!q) {
        p._duelFrom = null;
        send(p, { t: 'duel_fail', reason: 'offline' });
        return;
      }
      const chk = DU.canChallenge(duelView(p), duelView(q));
      if (!chk.ok) {
        send(p, { t: 'duel_fail', reason: chk.reason });
        return;
      }
      const now = Date.now();
      p._duelFrom = null;
      p._duelTo = null;
      q._duelFrom = null;
      q._duelTo = null;
      p.duel = { peer: q.pid, at: now };
      q.duel = { peer: p.pid, at: now };
      registerDuelPlayer(p);
      registerDuelPlayer(q);
      const until = now + DU.DUEL_TTL_MS;
      send(p, { t: 'duel_start', peer: q.pid, peerName: q.name, until: until });
      send(q, { t: 'duel_start', peer: p.pid, peerName: p.name, until: until });
      send(p, { t: 'msg', text: 'Дуэль с ' + q.name + ' началась!' });
      send(q, { t: 'msg', text: 'Дуэль с ' + p.name + ' началась!' });
      broadcastDuelFx(p);
      broadcastDuelFx(q);
      break;
    }
    case 'duel_decline': {
      if (!checkRate(p, 'action')) return;
      const from = p._duelFrom;
      p._duelFrom = null;
      if (from) {
        const q = players.get(from.pid);
        if (q) {
          if (q._duelTo && q._duelTo.pid === p.pid) q._duelTo = null;
          send(q, { t: 'duel_fail', reason: 'declined', name: p.name });
          send(q, { t: 'msg', text: p.name + ' отклонил дуэль.' });
        }
      }
      send(p, { t: 'msg', text: 'Вы отклонили дуэль.' });
      break;
    }
    case 'duel_cancel': {
      if (!checkRate(p, 'action')) return;
      if (p.duel) {
        const q = players.get(p.duel.peer);
        interruptDuel(p, 'cancel');
        send(p, { t: 'msg', text: 'Дуэль отменена.' });
        if (q) send(q, { t: 'msg', text: p.name + ' отменил дуэль.' });
        break;
      }
      if (p._duelTo) {
        const q = players.get(p._duelTo.pid);
        if (q && q._duelFrom && q._duelFrom.pid === p.pid) q._duelFrom = null;
        p._duelTo = null;
        send(p, { t: 'msg', text: 'Вызов отозван.' });
        if (q) send(q, { t: 'msg', text: p.name + ' отозвал вызов на дуэль.' });
        break;
      }
      send(p, { t: 'duel_fail', reason: 'no_duel' });
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
      doClassTransfer(p, msg.cls || msg.classId || msg.to);
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
      // Редактор мира: только GM / dev и только при включённом редакторе.
      if (!EDITOR_ENABLED || !isGM(p)) { send(p, { t: 'err', msg: 'save_editor_data: только для GM' }); break; }
      if (!msg.data || typeof msg.data !== 'object' || Array.isArray(msg.data)) {
        send(p, { t: 'err', msg: 'save_editor_data: bad payload' });
        break;
      }
      const ok = saveEditorOverridesToDisk(msg.data);
      send(p, { t: 'msg', text: ok ? 'Сцена сохранена на диск.' : 'Ошибка сохранения сцены.' });
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

  // Spatial Grid нарезается в самом начале тика (Zero-GC), чтобы и tickMobs, и AOI работали по актуальным координатам без переборов
  spatialGrid.clear();
  if (nativeSpatialGrid) {
    nativeSpatialGrid.clear();
    nativeSpatialGrid.bulkInsert(entityTransforms.buffer, entityTransforms.maxSlot);
  }
  for (const [, pl] of players) spatialGrid.insertPlayer(pl);
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
          if (p.yid && isSyntheticBot(p.yid)) continue;
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
    tickPlayerRegen(p, dtSec);

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
    // При экстремальной нагрузке (5000 CCU) радиус видимости 108 м обновляется раз в 15 тиков (1.5 с)
    // либо при значительном перемещении (> 5–8 м)
    const aoiInterval = isUnderHeavyLoad ? (players.size > 2000 ? 15 : (players.size > 500 ? 10 : (players.size > 200 ? 8 : 4))) : 3;
    const aoiMoveDist2 = isUnderHeavyLoad ? (players.size > 2000 ? 64.0 : (players.size > 500 ? 25.0 : 4.0)) : 4.0;
    const needsAoi = !isUnderHeavyLoad ||
      p._aoiDirty ||
      p._lastAoiTick == null ||
      dist2(p.x, p.z, p._lastAoiX || 0, p._lastAoiZ || 0) > aoiMoveDist2 ||
      ((_tickCount + p.pid) % aoiInterval === 0);

    let aoi;
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

    if (aoi.leave.length) {
      for (let i = 0; i < aoi.leave.length; i++) forgetPos(p, aoi.leave[i]);
    }
    if (aoi.enter.length > 0 || aoi.leave.length > 0) {
      _sharedEnterSnaps.length = 0;
      for (let i = 0; i < aoi.enter.length; i++) {
        const ek = aoi.enter[i];
        const s = getTickSnapshot(ek);
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
      if (aoi.enter.length > 0 && (!p.yid || !isSyntheticBot(p.yid))) sendNearbyLoot(p);
    }

    // Дистанционное квантование частоты обновлений (Tiered Knownlist Update):
    // Tier 1 (<16м или в таргете): 10 Hz (каждый тик)
    // Tier 2 (16-45м): 5 Hz (каждый 2-й тик)
    // Tier 3 (>45м, горизонт): 2.5 Hz (каждый 4-й тик)
    // При нагрузке (>80 CCU) наблюдатели-боты без активного боя обновляются через 3 тика (~3.3 Hz),
    // в покое (сидячие торговцы) раз в 5 тиков (2 Hz), в бою — 5 Hz.
    // Живые игроки ВСЕГДА обновляются с полной частотой 10 Hz!
    if (isSyntheticBot(p.yid) && (players.size > 80 || isUnderHeavyLoad)) {
      if (!p.target && !p.inCombat && !p.casting) {
        const mod = p.sitting ? 5 : 3;
        if (((_tickCount + p.pid) % mod) !== 0) continue;
      } else if (((_tickCount + p.pid) & 1) !== 0) {
        continue;
      }
    }
    _sharedUpdList.length = 0;
    for (const key of p.known) {
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
              } else if (d2 > 256) { // > 16м
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
    if (_sharedUpdList.length > 0) sendUpd(p, _sharedUpdList);
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

async function doLogin(ws, msg) {
  const v = AUTH.verifySignature(msg.data, msg.signature, YANDEX_SECRET);
  if (!v.ok) {
    const ip = (ws && ws._socket && ws._socket.remoteAddress) || '';
    Mod.log('auth_fail', { reason: v.error, ip: ip, age: v.age, diff: v.diff });
    ws.close(4003, 'bad signature');
    return;
  }
  const parsed = AUTH.parseLoginData(msg.data);
  const yid = parsed.yid;
  const name = parsed.name;
  const ban = Mod.banInfo(yid);
  if (ban) {
    sendJson(ws, { t: 'login_fail', reason: 'banned', until: ban.until, why: ban.reason });
    try { ws.close(4012, 'banned'); } catch (_) {}
    Mod.log('login', { yid: yid, name: String(name || '').slice(0, 16), ok: false, reason: 'banned' });
    return;
  }

  // Один yid = одна сессия. Иначе две сессии пишут в один файл профиля
  // и последний DB.save затирает инвентарь другой (классический дюп).
  const prevPid = pidByYid.get(yid);
  if (prevPid != null) {
    const prevWs = wsByPid.get(prevPid);
    await detachPlayer(prevPid);
    if (prevWs) {
      try { prevWs.pid = null; prevWs.close(4008, 'logged in elsewhere'); } catch (_) {}
    }
  }
  // Барьер на время await DB.load: параллельный логин тем же yid не должен
  // проскочить между проверкой и players.set.
  if (loggingIn.has(yid)) {
    // Ждем до 1500мс завершения параллельного логина/детача вместо мгновенного закрытия 4009
    for (let retry = 0; retry < 15; retry++) {
      await new Promise(r => setTimeout(r, 100));
      if (!loggingIn.has(yid)) break;
    }
    if (loggingIn.has(yid)) {
      ws.close(4009, 'login in progress');
      return;
    }
  }
  loggingIn.add(yid);
  try {
    await doLoginInner(ws, msg, v, parsed, yid, name);
  } finally {
    loggingIn.delete(yid);
  }
}

async function doLoginInner(ws, msg, v, parsed, yid, name) {
  // char payload: из login data ИЛИ из msg.char (клиент character-select)
  const charIn = (msg.char && typeof msg.char === 'object' && !Array.isArray(msg.char)) ? msg.char : {};
  const charId = CH.normalizeCharId(charIn.id || charIn.charId || parsed.charId);
  const createOpts = {
    name: sanitizeCharName(charIn.name) || sanitizeCharName(name) || 'Operator',
    race: charIn.race || parsed.race || 'human',
    gender: charIn.gender || parsed.gender || 'male',
    cls: charIn.cls || charIn.classId || parsed.cls || 'operator'
  };

  // Битый профиль: DB.load бросает. Отказываем в логине вместо выдачи
  // нового персонажа 1 уровня поверх потерянного прогресса.
  let pr = null;
  let createdNew = false;
  const isStressBot = isSyntheticBot(yid);
  if (!isStressBot) {
    try {
      pr = await DB.load(yid, charId);
    } catch (e) {
      console.error('[login] отказ по повреждённому профилю', yid, charId, e && e.message);
      sendJson(ws, { t: 'login_fail', reason: 'profile_corrupted' });
      ws.close(4010, 'profile corrupted');
      return;
    }
  }
  if (!pr) {
    let existing = [];
    if (!isStressBot) {
      try { existing = await DB.listChars(yid); } catch (_) { existing = []; }
      if (existing.length >= CH.MAX_SLOTS) {
        sendJson(ws, { t: 'login_fail', reason: 'slots' });
        try { ws.close(4005, 'no slots'); } catch (_) {}
        return;
      }
      if (!charIn.name) {
        let base = createOpts.name || 'Operator';
        let candidate = base;
        let counter = 1;
        while (PlayerDb && typeof PlayerDb.isNameTaken === 'function' && PlayerDb.isNameTaken(candidate, yid)) {
          candidate = `${base}_${++counter}`;
        }
        createOpts.name = candidate;
      } else if (PlayerDb && typeof PlayerDb.isNameTaken === 'function' && PlayerDb.isNameTaken(createOpts.name, yid)) {
        sendJson(ws, { t: 'login_fail', reason: 'name_taken' });
        try { ws.close(4006, 'name taken'); } catch (_) {}
        return;
      }
    }
    if (charIn.appearance) createOpts.appearance = COS.normalizeAppearance(charIn.appearance);
    pr = G.newProfile(createOpts.name, createOpts);
    pr.charId = charId;
    pr.createdAt = Date.now();
    createdNew = true;
  } else {
    // миграция старых профилей без race/gender
    if (!pr.race) pr.race = 'human';
    if (!pr.gender) pr.gender = 'male';
    if (!pr.cls || !CS.getClass(pr.cls)) pr.cls = 'operator';
    if (!Array.isArray(pr.classHistory) || !pr.classHistory.length) pr.classHistory = [pr.cls];
    if (pr.classTier == null) pr.classTier = (CS.getClass(pr.cls) || {}).tier || 0;
    // Имя из сохранённого профиля тоже прогоняем: старые сейвы могли получить
    // 5000 символов с HTML до появления валидации.
    pr.name = sanitizeCharName(pr.name) || createOpts.name;
  }

  // Индивидуальная настройка уникальных ботов нагрузочного тестирования
  if (isSyntheticBot(yid)) {
    if (Number.isFinite(charIn.x) && Number.isFinite(charIn.z)) {
      pr.x = charIn.x;
      pr.z = charIn.z;
    }
    if (charIn.race) pr.race = String(charIn.race).toLowerCase();
    if (charIn.gender) pr.gender = String(charIn.gender).toLowerCase();
    if (charIn.cls) pr.cls = String(charIn.cls).toLowerCase();
    if (charIn.name) pr.name = sanitizeCharName(charIn.name);
    if (charIn.appearance) pr.appearance = COS.normalizeAppearance(charIn.appearance);
    pr.skills = Object.assign(pr.skills || {}, {
      op_power_strike: 1,
      op_iron_punch: 1,
      op_steam_vent: 1,
      op_emergency_repair: 1,
      op_shield_stun: 1,
      eng_pressure_bolt: 1,
      eng_curse_corrode: 1,
      eng_pressure_drain: 1,
      eng_self_repair: 1,
      eng_might: 1,
      eng_shield: 1
    });
    if (!pr.equip) pr.equip = {};
    if (pr.cls === 'operator') {
      if (!pr.equip.weapon) pr.equip.weapon = { id: 'operator_hammer_low', templateId: 'operator_hammer_low' };
      if (!pr.equip.chest) pr.equip.chest = { id: 'wooden_breastplate', templateId: 'wooden_breastplate' };
      if (!pr.equip.legs) pr.equip.legs = { id: 'wooden_gaiters', templateId: 'wooden_gaiters' };
      if (!pr.equip.necklace) pr.equip.necklace = { id: 'operator_compressor_low', templateId: 'operator_compressor_low' };
      if (!pr.equip.bracelet) pr.equip.bracelet = { id: 'operator_bracers_low', templateId: 'operator_bracers_low' };
    } else {
      if (!pr.equip.weapon) pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
      if (!pr.equip.chest) pr.equip.chest = { id: 'circuit_robe_jacket', templateId: 'circuit_robe_jacket' };
      if (!pr.equip.legs) pr.equip.legs = { id: 'circuit_robe_pants', templateId: 'circuit_robe_pants' };
      if (!pr.equip.necklace) pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
      if (!pr.equip.bracelet) pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
    }
    if (!pr.inv) pr.inv = {};
    if (Object.keys(pr.inv).length === 0) {
      pr.inv = {
        synthetic_oil: 50,
        pressure_canister: 50,
        soulshot_no_grade: 500,
        spiritshot_no_grade: 500,
        potion_alacrity: 5,
        potion_wind_walk: 5,
        copper_parts: 25000,
        gear_scrap: 15,
        copper_ore: 10
      };
    }
  }
  // appearance приходит из клиентского localStorage. Раньше писался как есть —
  // произвольный JSON любого размера (проверено 50 КБ) уходил в профиль и в
  // AOI-снапшот всем рядом. Теперь только 4 известных поля (allow-list).
  if (charIn.appearance || parsed.appearance || pr.appearance) {
    pr.appearance = COS.normalizeAppearance(charIn.appearance || parsed.appearance || pr.appearance);
  }

  // Миграция старого инвентаря и экипировки
  if (!pr.equip) pr.equip = {};
  if (!pr.inv) pr.inv = {};
  const isEng = pr.cls === 'engineer' || (CS.rootClass && CS.rootClass(pr.cls) === 'engineer');
  delete pr.inv.wrench_short;

  // weapon → necklace: только резонатор (не apprentice_wand — это оружие в руке)
  // ring_l/ring_r → bracelet: нано-браслеты вместо колец
  const migrateResonatorSlot = (equip) => {
    if (!equip) return;
    const w = equip.weapon;
    const wt = w && String(w.templateId || w.id || '').toLowerCase();
    if (wt === 'engineer_emitter_low') {
      if (!equip.necklace) {
        equip.necklace = {
          id: 'engineer_emitter_low',
          templateId: 'engineer_emitter_low',
          plus: w.plus || 0,
          circuitLevel: w.circuitLevel,
          shellIndex: w.shellIndex
        };
      }
      delete equip.weapon;
    }
    // necklace с legacy wand id → резонатор (wand остаётся в weapon, если там)
    if (equip.necklace) {
      const nt = String(equip.necklace.templateId || equip.necklace.id || '').toLowerCase();
      if (nt === 'apprentice_wand') {
        equip.necklace.id = 'engineer_emitter_low';
        equip.necklace.templateId = 'engineer_emitter_low';
      }
    }
    // rings → bracelet (drop junk rings; keep if somehow nano)
    ['ring_l', 'ring_r', 'ring'].forEach((rs) => {
      if (!equip[rs]) return;
      const r = equip[rs];
      const rt = String(r.templateId || r.id || '').toLowerCase();
      if (rt === 'engineer_nano_bracelet' && !equip.bracelet) {
        equip.bracelet = {
          id: 'engineer_nano_bracelet',
          templateId: 'engineer_nano_bracelet',
          nanoLevel: r.nanoLevel,
          casingIndex: r.casingIndex
        };
      }
      delete equip[rs];
    });
  };
  migrateResonatorSlot(pr.equip);

  if (isEng) {
    // apprentice_wand — стартовое оружие инженера (не вычищать)
    delete pr.inv.circuit_robe_jacket;
    delete pr.inv.circuit_robe_pants;
    // Стартовый инженер: No-Grade set only, 0 денег, без D-grade «подарков» старых сейвов.
    // Только L1 с «чистым» стартовым пакетом (не трогаем прогресс фарма).
    const engLvl = pr.level || 1;
    const engStarterInvOnly = engLvl <= 1 && (pr.exp || 0) === 0;
    if (engStarterInvOnly) {
      // убрать D-grade / расходники / лишний экип из стартовой выдачи
      const stripStarterJunk = [
        'pressure_amplifier', 'pressure_amplifier_d', 'blessed_pressure_amplifier',
        'goggles', 'leather_gloves', 'work_boots',
        'synthetic_oil', 'pressure_canister', 'high_pressure_tank', 'emergency_repair_kit',
        'steam_hammer', 'pneumatic_rifle', 'hydraulic_blade', 'branch_staff',
        'copper_plate', 'hydraulic_armor', 'devotion_jacket', 'devotion_pants'
      ];
      stripStarterJunk.forEach((id) => { delete pr.inv[id]; });
      pr.inv.copper_parts = 0;
    }
    // Резонатор = necklace (прибор), не weapon
    if (!pr.equip.necklace) {
      pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
    }
    // Нано-браслеты = heal / drain / buff / debuff
    if (!pr.equip.bracelet) {
      pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
    }
    // Оружие инженера — нужно для активных скиллов
    if (!pr.equip.weapon) {
      pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
    }
    if (!pr.equip.chest || pr.equip.chest.templateId === 'worker_overalls' || pr.equip.chest.templateId === 'circuit_robe_jacket') {
      pr.equip.chest = { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' };
    }
    if (!pr.equip.legs || pr.equip.legs.templateId === 'circuit_robe_pants') {
      pr.equip.legs = { id: 'engineer_pants_low', templateId: 'engineer_pants_low' };
    }
    // D-grade / чужой экип в слотах на чистом L1 — сброс на starter
    if (engStarterInvOnly) {
      const allow = {
        weapon: 'apprentice_wand',
        necklace: 'engineer_emitter_low',
        bracelet: 'engineer_nano_bracelet',
        chest: 'engineer_jacket_low',
        legs: 'engineer_pants_low'
      };
      Object.keys(pr.equip).forEach((slot) => {
        const tid = pr.equip[slot] && (pr.equip[slot].templateId || pr.equip[slot].id);
        if (allow[slot]) {
          if (tid !== allow[slot]) pr.equip[slot] = { id: allow[slot], templateId: allow[slot] };
        } else {
          delete pr.equip[slot]; // head/gloves/boots/rings — не в старте инженера
        }
      });
      pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
      pr.equip.necklace = { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' };
      pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
      pr.equip.chest = { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' };
      pr.equip.legs = { id: 'engineer_pants_low', templateId: 'engineer_pants_low' };
    } else {
      // прогресс: выдать браслеты/катушку если ещё нет (миграция)
      if (!pr.equip.bracelet) {
        pr.equip.bracelet = { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' };
      }
      if (!pr.equip.weapon) {
        pr.equip.weapon = { id: 'apprentice_wand', templateId: 'apprentice_wand' };
      }
    }
  } else {
    if (!pr.equip.weapon || pr.equip.weapon.templateId === 'wrench_short' ||
        pr.equip.weapon.templateId === 'engineer_emitter_low' ||
        pr.equip.weapon.templateId === 'apprentice_wand') {
      pr.equip.weapon = { id: 'operator_hammer_low', templateId: 'operator_hammer_low' };
    }
    if (!pr.equip.chest || pr.equip.chest.templateId === 'worker_overalls') {
      pr.equip.chest = { id: 'wooden_breastplate', templateId: 'wooden_breastplate' };
    }
    if (!pr.equip.legs) {
      pr.equip.legs = { id: 'wooden_gaiters', templateId: 'wooden_gaiters' };
    }
    if (!pr.equip.necklace) {
      pr.equip.necklace = { id: 'operator_compressor_low', templateId: 'operator_compressor_low' };
    }
    if (!pr.equip.bracelet) {
      pr.equip.bracelet = { id: 'operator_bracers_low', templateId: 'operator_bracers_low' };
    }
  }

  const isDevSession = process.env.NODE_ENV !== 'production' && !!v.dev;
  const p = new Player(nextId++, yid, pr, { dev: isDevSession, charId: charId });
  if (msg.binary || msg.proto === 'bin') p.binaryProto = true;
  if (entityTransforms && p.transformSlot < 0) {
    p.transformSlot = entityTransforms.allocate(p.pid, TYPE_PLAYER, p.x, p.y, p.z, p.hp, p.maxHp, p.speedBase);
  }
  players.set(p.pid, p); wsByPid.set(p.pid, ws); pidByYid.set(yid, p.pid); ws.pid = p.pid;
  if (IS_CLUSTER && clusterIpc) {
    clusterIpc.updatePlayerDirectory(yid, p.pid, p.name, true, CURRENT_WORKER_ID, p.charId);
    if (ws && ws.connId != null) {
      clusterIpc.sendToPrimary(MSG_GATEWAY_SEND, {
        connId: ws.connId,
        pid: p.pid,
        yid: yid,
        charId: p.charId
      });
    }
  }
  try {
    if (!isSyntheticBot(yid)) {
      PlayerDb.touch(pr, yid, charId);
      PlayerDb.setOnline(yid, charId, true);
    }
  } catch (_) {}
  snapStandY(p);
  p.applyClassStats();
  if (createdNew) saveProfileNow(p);
  resetMoveBudget(p);
  // битый сейв / рассинхрон: 0 пара при maxEnergy > 0 → на входе полный бак
  if (p.maxEnergy > 0 && (p.energy == null || p.energy < 1) && !p.dead) {
    p.energy = p.maxEnergy;
  }
  // Don't auto-heal corpses on login — stay dead until village revive
  if (p.dead) {
    p.hp = 0;
  } else if (p.maxHp > 0 && (p.hp == null || p.hp < 1)) {
    p.hp = p.maxHp;
  }
  // Миграция старого титула в слот экипа, если ещё не мигрирован
  if (p.cosmetics && (p.cosmetics.title || p.cosmetics.titleName) && (!p.equip || !p.equip.title)) {
    const legTitle = p.cosmetics.title || p.cosmetics.titleName;
    const s = String(legTitle).toLowerCase();
    let itemId = 'title_tralalero';
    if (s.includes('bombardi')) itemId = 'title_bombardiro';
    else if (s.includes('tung')) itemId = 'title_tung_tung';
    else if (s.includes('ballerina') || s.includes('cappuccino')) itemId = 'title_ballerina_cap';
    else if (s.includes('skibidi')) itemId = 'title_skibidi_steam';
    else if (s.includes('pioneer')) itemId = 'title_pioneer';
    else if (s.includes('master')) itemId = 'title_master';
    else if (ITEMS && typeof ITEMS.get === 'function' && ITEMS.get('title_' + s)) itemId = 'title_' + s;
    if (!p.equip) p.equip = Object.create(null);
    p.equip.title = { id: itemId, templateId: itemId };
    p.cosmetics.title = null;
    p.cosmetics.titleName = null;
    saveProfileNow(p);
  }
  const gmNow = isGM(p);
  const editorKey = gmNow ? EditorGuard.issue(p) : '';
  if (!gmNow) EditorGuard.revokePid(p.pid);
  if (typeof ws.subscribe === 'function') {
    try {
      ws.subscribe('world');
      if (p.region) ws.subscribe('region:' + p.region);
    } catch (_) {}
  }
  send(p, {
    t: 'welcome', pid: p.pid, region: p.region, dev: isDevSession, gm: gmNow,
    editorKey: editorKey || undefined,
    accessLevel: p.accessLevel || 0,
    charId: p.charId,
    zoneName: zoneLabelAt(p.x, p.z),
    peace: isPeaceAt(p.x, p.z),
    self: selfPayload(p),
    inv: p.inv, equip: p.equip, learned: p.learned ? [...p.learned] : [],
    skills: p.skills || {},
    cosmetics: cosmeticsPublic(p),
    cosmeticsFull: COS.normalize(p.cosmetics || null),
    // Квесты: клиент рисует состояние сервера, своего localStorage больше нет
    quests: QD.snapshot(p.quests, p.level, Date.now(), p.cls),
    leaderboardScore: p.level * 1000 + p.exp,
    online: getActiveOnlineCount(),
    effects: effectsPayload(p),
    worldTime: worldTimePayload(),
    expTable: { maxLevel: EXP.MAX_LEVEL, expToNext: EXP.expToNext(p.level) },
    classTree: {
      base: (_cachedBaseClasses || (_cachedBaseClasses = CS.listBaseClasses().map(c => ({ id: c.id, name: c.name, path: c.path, description: c.description })))),
      current: CS.getClass(p.cls),
      next: CS.availableTransfers(p.cls, p.level).map(c => ({
        id: c.id, name: c.name, description: c.description, levelReq: c.levelReq, role: c.role
      }))
    }
  });
  // Re-open death UI if reconnecting as corpse
  if (p.dead) {
    send(p, {
      t: 'you_died',
      loss: 0,
      delevels: 0,
      killer: null,
      canVillage: true,
      villageName: 'Город',
      reconnect: true,
      self: deathSelfPayload(p),
      inv: p.inv
    });
  }
  ensureNearbyMobs(p);
  if (!isSyntheticBot(p.yid)) {
    sendNearbyLoot(p);
    // Друзья: свой список + сообщить тем из них, кто в сети.
    send(p, friendsPayload(p));
    notifyFriends(p, true);
    // Клан: id из отдельного хранилища, не из профиля.
    const myClan = Clans.ofPlayer(p);
    bindClan(p, myClan);
    if (myClan) {
      const mem = Clans.memberOf(myClan, p.yid, p.charId);
      if (mem) mem.name = p.name;
      send(p, clanPayload(myClan));
      sendCrest(p, myClan);
      notifyClan(p, true);
    } else {
      send(p, { t: 'clan', clan: null });
    }
    Mod.log('login', { yid: p.yid, charId: p.charId, name: p.name, ok: true, level: p.level });
    // Прогресс collect зависит от инвентаря — подтянуть после логина.
    if (syncQuestCollect(p)) saveProfileNow(p);
  }
  for (const [, ae] of activeEvents) {
    if (!ae) continue;
    send(p, eventStartPayload(ae));
  }
}

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
const DATA_PRIVATE = /(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.tmp(\..*)?)$/i;
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
  let rel = path.normalize(p).replace(/^[\/\\]+/, '');
  if (rel.startsWith('..')) return null;
  const top = rel.split(/[\/\\]/)[0];
  if (top === 'data') {
    // Профили и служебные файлы — никогда, независимо от каталога.
    if (DATA_PRIVATE.test(rel)) return null;
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
  } else if (ext === '.html') {
    // html — точка входа, всегда перепроверяем
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

function denyEditor(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('not found');
}

function serveStatic(req, res) {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/favicon.ico') { res.writeHead(204); return res.end(); }
    if (EditorGuard.isEditorAsset(urlPath) && !EditorGuard.allowAsset(req)) {
      return denyEditor(res);
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
      new Function('window', fs.readFileSync(tdPath, 'utf8'))(g.window);
      g.TerrainData = g.window.TerrainData || g.TerrainData;
    }
    g.WorldMetrics = WM;
    g.TerrainData = g.window.TerrainData || g.TerrainData;
    const TH = require(path.join(CLIENT, 'js', 'terrain-height.js'));
    g.TerrainHeight = TH;
    g.PropsLibrary = require(path.join(CLIENT, 'js', 'props-library-data.js'));
    const PC = require(path.join(CLIENT, 'js', 'props-collision.js'));
    g.PropsCollision = PC;
    const wdPath = path.join(CLIENT, 'js', 'walls-data.js');
    if (fs.existsSync(wdPath)) {
      new Function('window', fs.readFileSync(wdPath, 'utf8'))(g.window);
    }
    const segs = (g.window.WallsData && g.window.WallsData.segments) || [];
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
const saveEditorOverridesToDisk = (data) => httpRouter.saveEditorOverridesToDisk(data);

const server = http.createServer((req, res) => {
  if (httpRouter.handleRequest(req, res)) return;
  if (SERVE_CLIENT) return serveStatic(req, res);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Project Steam MMO server is running.');
});
// Максимальный размер WebSocket-фрейма: 64 КБ в проде (защита от DoS/zip-бомб), 32 МБ в dev
const WS_MAX_PAYLOAD = process.env.NODE_ENV === 'production' ? (64 * 1024) : (32 * 1024 * 1024);
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
  const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
  if (!origin || origin === 'null' || origin === 'undefined') return cb(true);
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    const reqHeaders = (info.req && info.req.headers) || {};
    const reqHost = String(reqHeaders.host || reqHeaders['x-forwarded-host'] || '').split(':')[0].toLowerCase();
    if (reqHost && host === reqHost) return cb(true);
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '93.77.168.135') return cb(true);
    if (host === 'yandex.ru' || host.endsWith('.yandex.ru') ||
        host === 'yandex.net' || host.endsWith('.yandex.net') ||
        host === 'yandex.com' || host.endsWith('.yandex.com') ||
        host === 'yandex.kz' || host.endsWith('.yandex.kz') ||
        host === 'yandex.by' || host.endsWith('.yandex.by') ||
        host === 'yandex.uz' || host.endsWith('.yandex.uz')) {
      return cb(true);
    }
    const corsList = String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (corsList.includes('*') || corsList.includes(host) || corsList.includes(origin.toLowerCase())) return cb(true);
    if (process.env.STRICT_CORS !== '1') return cb(true);
    console.warn('[ws] Rejected unauthorized origin:', origin);
    return cb(false, 403, 'Forbidden Origin');
  } catch (_) {
    if (process.env.STRICT_CORS === '1') return cb(false, 400, 'Bad Origin');
    return cb(true);
  }
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
    engine: process.env.NET_ENGINE
  });
  console.log(`[server] Сетевой транспорт: ${netTransport.type.toUpperCase()}${netTransport.type === 'uws' ? ' (uWebSockets.js C++ Zero-GC)' : ' (Node.js ws fallback)'}`);
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
  if (!authed) {
    lt = setTimeout(() => { if (!authed && !ws.isAuthed) ws.close(4001, 'login timeout'); }, 60000);
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
      const s = sessions.get(ws);
      if (s) s.lastPong = Date.now();
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
    const pid = ws.pid;
    sessions.delete(ws);
    if (pid == null) return;
    try {
      await detachPlayer(pid);
    } catch (err) {
      console.error('[ws] detachPlayer error on close:', err && (err.stack || err.message) || err);
    }
  });
}
if (!IS_CLUSTER && wss && typeof wss.on === 'function') {
  wss.on('connection', (ws) => setupSocketConnection(ws, false));
}

// Полное снятие игрока с сервера: пати, хейт мобов, knownlist наблюдателей, сейв.
// Вынесено из ws.on('close'), потому что тем же путём выбрасывается старая
// сессия при повторном логине одним yid.
async function detachPlayer(pid) {
  const p = players.get(pid);
  if (!p) return;
  const isBot = isSyntheticBot(p.yid);
  if (!isBot) {
    // Обмен рвётся первым: партнёр должен узнать до того, как игрок исчезнет из
    // players, иначе его сессия зависнет в «занят обменом» до TTL.
    closeTrade(p, 'peer_gone');
    interruptDuel(p, 'disconnect');
    if (p.casting) p.casting = null;
    // Лавка исчезает вместе с владельцем: вывеска в AOI не должна остаться.
    if (p.store) { p.store = null; broadcastStoreState(p); }
    notifyFriends(p, false);
    notifyClan(p, false);
    const pa = partyOf(p);
    if (pa) {
      pa.members.delete(pid);
      if (pa.members.size <= 1) {
        for (const id of pa.members) {
          const rest = players.get(id);
          if (rest) { rest.partyId = null; send(rest, { t: 'party', leader: null, members: [] }); }
        }
        pa.members.clear();
        parties.delete(pa.id);
      } else {
        if (pa.leader === pid) pa.leader = [...pa.members][0];
        pushParty(pa);
      }
    }
    p.partyId = null;
  } else {
    if (p.casting) p.casting = null;
    p.partyId = null;
  }
  // Снять хейт и таргет у мобов: если сетка заполнена, опрашиваем только мобов в радиусе 50м (O(1)), а не все 1300 мобов острова
  const hateKey = String(pid);
  if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0 && Number.isFinite(p.x) && Number.isFinite(p.z)) {
    spatialGrid.forEachCandidate(p.x, p.z, 50, null, (m) => {
      if (m && m.hate && m.hate[hateKey] != null) delete m.hate[hateKey];
      if (m && m.target === pid) m.target = null;
    });
  } else {
    for (const [, m] of mobs) {
      if (m.hate && m.hate[hateKey] != null) delete m.hate[hateKey];
      if (m.target === pid) m.target = null;
    }
  }
  // Сбросить висящие приглашения от ушедшего игрока (O(1) прямые ссылки вместо O(P) цикла)
  if (p._duelTo) {
    const tgt = players.get(p._duelTo.pid);
    if (tgt && tgt._duelFrom && tgt._duelFrom.pid === pid) tgt._duelFrom = null;
    p._duelTo = null;
  }
  if (p._duelFrom) {
    const src = players.get(p._duelFrom.pid);
    if (src && src._duelTo && src._duelTo.pid === pid) src._duelTo = null;
    p._duelFrom = null;
  }
  if (p.knownBy) {
    if (p.knownBy.size > 0) {
      for (const obsPid of p.knownBy) {
        if (obsPid !== pid) {
          sendPid(obsPid, { t: 'aoi', enter: [], leave: ['p' + pid] });
          const o = players.get(obsPid);
          if (o && o.known) o.known.delete('p' + pid);
          if (o && o._lastUpd) o._lastUpd.delete('p' + pid);
        }
      }
      p.knownBy.clear();
    }
  } else {
    if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
      spatialGrid.forEachCandidate(p.x, p.z, 108, (o) => {
        if (o.pid !== pid && o.known && o.known.has('p' + pid)) {
          sendPid(o.pid, { t: 'aoi', enter: [], leave: ['p' + pid] });
          o.known.delete('p' + pid);
          if (o._lastUpd) o._lastUpd.delete('p' + pid);
        }
      }, null);
    } else {
      for (const [, o] of players) {
        if (o.pid !== pid && o.known && o.known.has('p' + pid)) {
          sendPid(o.pid, { t: 'aoi', enter: [], leave: ['p' + pid] });
          o.known.delete('p' + pid);
          if (o._lastUpd) o._lastUpd.delete('p' + pid);
        }
      }
    }
  }
  if (p.known && p.known.size > 0) {
    for (const k of p.known) {
      if (k.charCodeAt(0) === 112 /* 'p' */) {
        const targetP = players.get(+k.slice(1));
        if (targetP && targetP.knownBy) targetP.knownBy.delete(pid);
      }
    }
  }
  try { EditorGuard.revokePid(pid); } catch (_) {}
  if (entityTransforms && p.transformSlot >= 0) {
    entityTransforms.free(p.transformSlot);
    p.transformSlot = -1;
  }
  players.delete(pid);
  wsByPid.delete(pid);
  if (pidByYid.get(p.yid) === pid) pidByYid.delete(p.yid);
  if (!isSyntheticBot(p.yid)) {
    try {
      const pr = profileOf(p);
      lbTouch(p.yid, pr, p.charId);
      await DB.save(p.yid, pr, p.charId);
    } catch (e) { console.error('[DB] save on detach', p.yid, e && e.message); }
    try { PlayerDb.setOnline(p.yid, p.charId, false); } catch (_) {}
  }
  if (IS_CLUSTER && clusterIpc && p.yid) {
    clusterIpc.updatePlayerDirectory(p.yid, p.pid, p.name, false, CURRENT_WORKER_ID, p.charId);
  }
}
const pingTimer = setInterval(() => {
  const now = Date.now();
  for (const [ws, s] of sessions) {
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

try {
  if (typeof Clans.loadAllAsync === 'function' && DB.MODE === 'postgres') {
    Clans.loadAllAsync().catch(e => console.error('[clans] loadAllAsync', e && e.message));
  } else {
    Clans.loadAll();
  }
} catch (e) { console.error('[clans] loadAll', e && e.message); }
try { Mod.load(); } catch (e) { console.error('[mod] load', e && e.message); }
try { PlayerDb.init().then(r => console.log('[PlayerDB] indexed characters:', r.count)).catch(e => console.error('[PlayerDB] init', e && e.message)); } catch (e) { console.error('[PlayerDB] init', e && e.message); }
try { AccountKeys.init().then(r => console.log('[AccountKeys] loaded bindings:', r.count)).catch(e => console.error('[AccountKeys] init', e && e.message)); } catch (e) { console.error('[AccountKeys] init', e && e.message); }

if (!IS_CLUSTER) {
  const onListenSuccess = () => {
    console.log('[server] запущен на порту ' + PORT);
    console.log('============================================================');
    console.log('  PROJECT STEAM: ORIGINS — MMO CORE (Audits 23-27 Architecture)');
    console.log('  Сетевой порт: ' + PORT + ' | Runtime: Node.js V8 + C++ SIMD & Worker Threads');
    console.log('  ⚡ [L2] Tick-LOD Engine: 0.33Hz sleep / 2Hz idle / 10Hz combat');
    console.log('  ⚡ [L3] DoD EntityTransformTable: 4096 слотов (Zero-GC)');
    console.log('  ⚡ [L4] Native Spatial Grid: ' + (nativeSpatialGrid ? 'C++ AVX2 SIMD АКТИВЕН' : 'JS Fallback'));
    console.log('  ⚡ [L5] Worker Threads Offload: ' + (persistenceClient && persistenceClient.worker ? 'vCPU 2 АКТИВЕН' : 'Inline Fallback'));
    console.log('  ⚡ [L6] Native Combat Math: ' + (L2 && L2.nativeCombat ? 'C++ SIMD АКТИВЕН (35x Fast-Path)' : 'JS Fallback'));
    console.log('  ⚡ [NET] Transport: ' + (netTransport && NetTransport.hasUws ? 'uWebSockets.js C++ Zero-GC' : 'ws standard'));
    console.log('============================================================');
  };

  if (netTransport && typeof netTransport.listen === 'function') {
    netTransport.listen(PORT, '0.0.0.0', (err) => {
      if (err) {
        console.error('[server] FATAL: Сбой запуска сетевого транспорта:', err && err.message);
        process.exit(1);
      }
      onListenSuccess();
    });
  } else {
    server.listen(PORT, '0.0.0.0', 8192, onListenSuccess);
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