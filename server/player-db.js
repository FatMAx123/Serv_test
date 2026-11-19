// ============================================================
//  SERVER / PLAYER-DB.JS
//  База игроков и персонажей Project Steam (characters registry).
//  - Хранение и индексация: имя (case-insensitive), yid, charId, level, cls, accessLevel, online.
//  - Управление статусом GM вне игры (accessLevel >= 100 = full GM).
//  - Атомарное сохранение data/characters.json и data/gm-access.json.
//  - Авто-сканирование и миграция существующих профилей data/*.json при старте.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const CH = require('../shared/char-rules.js');
const SEC = require('./security-config.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const GM_FILE = path.join(DATA_DIR, 'gm-access.json');

const emitter = new EventEmitter();

let _ipcHub = null;
let _applyingSync = false;
let _broadcastingSync = false;

function _emitPlayerDbSync(action, data) {
  if (_applyingSync || _broadcastingSync || !_ipcHub || typeof _ipcHub.broadcastPlayerDbSync !== 'function') return;
  _broadcastingSync = true;
  try {
    _ipcHub.broadcastPlayerDbSync(action, data);
  } finally {
    _broadcastingSync = false;
  }
}

function _onPlayerDbSync(payload) {
  if (!payload || !payload.action || _broadcastingSync) return;
  PlayerDb.applySync(payload.action, payload.data);
}

let cachedDb = null;
function getDb() {
  if (cachedDb) return cachedDb;
  try {
    cachedDb = require('./db.js');
    return cachedDb;
  } catch (_) {
    return null;
  }
}

// In-memory registry
const characters = new Map(); // key (lowerName) -> CharacterRecord
const byYid = new Map();       // yid -> Set<lowerName>
const skeletons = new Map();   // skeleton -> Set<{ lower, yid }>

function registerSkeleton(name, yid) {
  if (!name) return;
  const sk = nameSkeleton(name);
  let set = skeletons.get(sk);
  if (!set) { set = new Set(); skeletons.set(sk, set); }
  const lower = normalizeKey(name);
  for (const item of set) {
    if (item.lower === lower) { item.yid = String(yid || ''); return; }
  }
  set.add({ lower, yid: String(yid || '') });
}

function unregisterSkeleton(name) {
  if (!name) return;
  const sk = nameSkeleton(name);
  const set = skeletons.get(sk);
  if (set) {
    const lower = normalizeKey(name);
    for (const item of set) {
      if (item.lower === lower) { set.delete(item); break; }
    }
    if (set.size === 0) skeletons.delete(sk);
  }
}

const gmAccess = {
  characters: Object.create(null), // lowerName -> accessLevel
  accounts: Object.create(null)    // yid -> accessLevel
};

// Сериализация записи на диск (атомарно: tmp -> fsync -> .bak -> rename)
const writeChains = new Map();
let tmpCounter = 0;
function noop() {}
function enqueue(key, job) {
  const prev = writeChains.get(key) || Promise.resolve();
  const result = prev.then(job, job);
  const chain = result.then(noop, noop).then(() => {
    if (writeChains.get(key) === chain) writeChains.delete(key);
  });
  writeChains.set(key, chain);
  return result;
}

function safeName(yid) {
  return String(yid || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function stemOf(yid, charId) {
  return CH.profileStem(safeName(yid), charId);
}

function fileOf(yid, charId) {
  return path.join(DATA_DIR, stemOf(yid, charId) + '.json');
}

async function retryFs(fn, retries = 5, delayMs = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      const code = err && err.code;
      const isTransient = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES';
      if (isTransient && i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function atomicWrite(filePath, contentStr) {
  const tmp = filePath + '.tmp.' + process.pid + '.' + (++tmpCounter).toString(36);
  let fh = null;
  try {
    fh = await fs.promises.open(tmp, 'w');
    await fh.writeFile(contentStr, 'utf8');
    await fh.sync();
    await fh.close();
    fh = null;
    try { await retryFs(() => fs.promises.copyFile(filePath, filePath + '.bak')); }
    catch (e) { if (e && e.code !== 'ENOENT') throw e; }
    await retryFs(() => fs.promises.rename(tmp, filePath));
  } catch (e) {
    if (fh) { try { await fh.close(); } catch (_) {} }
    try { await fs.promises.unlink(tmp); } catch (_) {}
    throw e;
  }
}

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeAccessLevel(lvl) {
  const n = parseInt(lvl, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100);
}

function isGmLevel(lvl) {
  const n = normalizeAccessLevel(lvl);
  return n >= 50;
}

/*
 * H5: GM по имени персонажа. Раньше gm-access.json хранил characters:{имя:уровень},
 * и права получал ЛЮБОЙ, кто занял это имя (после удаления/переименования GM).
 * Теперь запись по имени привязана к аккаунту: characters:{имя:{level, yid}}.
 * Права действуют, только если yid совпадает. Старые записи-числа при старте
 * привязываются к текущему владельцу имени (если он есть), иначе отбрасываются.
 * В production (или GM_STRICT=1) источник прав — только gmAccess и GM_YIDS:
 * флаги gm/accessLevel в самом профиле не дают прав (иначе revoke не работал
 * для офлайн-игроков в Postgres — флаг оставался в профиле).
 */
function gmStrict() {
  return SEC.isProd() || process.env.GM_STRICT === '1';
}
function normGmEntry(v) {
  if (v && typeof v === 'object') {
    const yid = String(v.yid || '').toLowerCase();
    return yid ? { level: normalizeAccessLevel(v.level), yid } : null;
  }
  return normalizeAccessLevel(v); // legacy: число без привязки
}
function isBlockedTestGmYid(yid) {
  return SEC.isProd() && String(yid || '').toLowerCase() === 'itest_gm';
}
/** Уровень из записи по имени, если она привязана к этому yid; иначе null. */
function charEntryLevel(lowerName, yid) {
  if (isBlockedTestGmYid(yid)) return null;
  const e = lowerName ? gmAccess.characters[lowerName] : null;
  if (e == null || typeof e !== 'object') return null;
  if (!yid || e.yid !== String(yid).toLowerCase()) return null;
  return e.level;
}
function accountLevel(yid) {
  const y = String(yid || '').toLowerCase();
  if (!y || isBlockedTestGmYid(y) || gmAccess.accounts[y] == null) return null;
  return gmAccess.accounts[y];
}
function isPrivilegedGmYid(yid) {
  const y = String(yid || '').toLowerCase();
  if (!y) return false;
  if (gmAccess.accounts && gmAccess.accounts[y] > 0) return true;
  if (gmAccess.characters) {
    for (const k of Object.keys(gmAccess.characters)) {
      const e = gmAccess.characters[k];
      if (e && typeof e === 'object' && e.yid === y && e.level > 0) return true;
    }
  }
  return false;
}
/** Уровень доступа по gmAccess для пары (yid, имя) или null. */
function gmAccessLevel(yid, lowerName) {
  const c = charEntryLevel(lowerName, yid);
  if (c != null) return c;
  return accountLevel(yid);
}

/**
 * Преобразование профиля в запись персонажа базы L2.
 */
function recordFromProfile(pr, yid, charId, currentRecord) {
  if (!pr || typeof pr !== 'object') return null;
  const name = String(pr.name || 'Operator').slice(0, 24).trim();
  const cId = CH.normalizeCharId(charId || pr.charId);
  const lowerName = normalizeKey(name);

  // Определение accessLevel с учётом gmAccess и существующих записей.
  // Обычный игрок всегда имеет accessLevel = 0.
  // Статус GM даётся только через gmAccess (файл data/gm-access.json),
  // либо если в профиле уже явно сохранён числовой accessLevel >= 50.
  let accessLevel = 0;
  const gl = gmAccessLevel(yid, lowerName);
  if (gl != null) {
    accessLevel = gl;
  } else if (gmStrict()) {
    accessLevel = 0;
  } else if (pr.accessLevel != null && normalizeAccessLevel(pr.accessLevel) >= 50) {
    accessLevel = normalizeAccessLevel(pr.accessLevel);
  } else if (currentRecord && String(currentRecord.yid) === String(yid) && currentRecord.accessLevel != null && currentRecord.accessLevel >= 50) {
    accessLevel = currentRecord.accessLevel;
  }

  const isOnline = currentRecord ? !!currentRecord.online : false;
  const lastSeen = pr.updatedAt || pr.lastSeen || (currentRecord ? currentRecord.lastSeen : Date.now());

  return {
    name: name,
    yid: String(yid || (currentRecord && currentRecord.yid) || ''),
    charId: cId,
    level: Math.max(1, Math.min(200, Math.floor(Number(pr.level)) || 1)),
    exp: Math.max(0, Math.floor(Number(pr.exp)) || 0),
    sp: Math.max(0, Math.floor(Number(pr.sp)) || 0),
    cls: String(pr.cls || 'operator'),
    classTier: Math.floor(Number(pr.classTier)) || 0,
    race: String(pr.race || 'human'),
    gender: String(pr.gender || 'male'),
    accessLevel: accessLevel,
    gm: isGmLevel(accessLevel),
    online: isOnline,
    lastSeen: lastSeen,
    createdAt: Math.max(0, Math.floor(Number(pr.createdAt)) || 0) || (currentRecord ? currentRecord.createdAt : 0) || Date.now(),
    x: Number.isFinite(+pr.x) ? +pr.x : -107.5,
    y: Number.isFinite(+pr.y) ? +pr.y : 0,
    z: Number.isFinite(+pr.z) ? +pr.z : -246.4,
    hp: pr.hp != null ? pr.hp : 100,
    maxHp: pr.maxHp != null ? pr.maxHp : 100,
    energy: pr.energy != null ? pr.energy : 50,
    maxEnergy: pr.maxEnergy != null ? pr.maxEnergy : 50,
    karma: pr.karma | 0 || 0,
    pk: pr.pk | 0 || 0
  };
}

/** «Скелет» имени для сравнения похожих символов (кириллица ↔ латиница, 0/O, 1/l). */
const CONFUSABLE = {
  'а': 'a', 'в': 'b', 'е': 'e', 'ё': 'e', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o',
  'р': 'p', 'с': 'c', 'т': 't', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  '0': 'o', '1': 'l', '_': '-', ' ': '-'
};
function nameSkeleton(name) {
  const s = normalizeKey(name);
  let out = '';
  for (const ch of s) out += (CONFUSABLE[ch] || ch);
  return out;
}

/** Применить gmAccess к записи реестра (rec.gm/accessLevel — кэш для списков). */
function applyGmToRecord(rec, lower) {
  if (!rec) return;
  const gl = gmAccessLevel(rec.yid, lower || normalizeKey(rec.name));
  if (gl != null) {
    rec.accessLevel = gl;
    rec.gm = isGmLevel(gl);
  } else if (gmStrict()) {
    rec.accessLevel = 0;
    rec.gm = false;
  }
}

/** Миграция legacy-записей characters:{имя:число} → {level, yid}. */
function bindLegacyGmNames() {
  let bound = 0, dropped = 0;
  for (const n of Object.keys(gmAccess.characters)) {
    const e = gmAccess.characters[n];
    if (e && typeof e === 'object') continue;
    const rec = characters.get(n);
    if (rec && rec.yid && normalizeAccessLevel(e) > 0) {
      gmAccess.characters[n] = { level: normalizeAccessLevel(e), yid: String(rec.yid).toLowerCase() };
      bound++;
    } else {
      // владельца нет — запись остаётся в файле, но прав не даёт (charEntryLevel
      // учитывает только привязанные записи). Не удаляем: реестр мог не загрузиться.
      dropped++;
    }
  }
  return { bound, dropped, changed: bound > 0 };
}

let initialized = false;

const PlayerDb = {
  /**
   * Загрузка базы данных и файла доступа GM.
   * Если база отсутствует — авто-сканирование каталога data/*.json.
   */
  async init(opts = {}) {
    if (!fs.existsSync(DATA_DIR)) {
      try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
    }

    // 1. Загрузка data/gm-access.json
    PlayerDb.loadGmAccessSync();

    const db = getDb();
    if (db && db.MODE === 'postgres' && typeof db.loadSystemState === 'function') {
      try {
        const gmRaw = await db.loadSystemState('gm_access');
        if (gmRaw && typeof gmRaw === 'object') {
          if (gmRaw.characters) {
            for (const n of Object.keys(gmRaw.characters)) {
              gmAccess.characters[normalizeKey(n)] = normGmEntry(gmRaw.characters[n]);
            }
          }
          if (gmRaw.accounts) {
            for (const a of Object.keys(gmRaw.accounts)) {
              gmAccess.accounts[String(a).toLowerCase()] = normalizeAccessLevel(gmRaw.accounts[a]);
            }
          }
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка чтения gm_access из postgres:', e && e.message);
        // FIX: не перезаписываем список GM в БД, пока он не прочитан
        PlayerDb._gmLoadFailed = true;
      }
    }

    // 2. Загрузка data/characters.json или system_state
    let loadedFromDb = false;
    if (db && db.MODE === 'postgres' && typeof db.loadSystemState === 'function') {
      try {
        const raw = await db.loadSystemState('characters_registry');
        if (raw && typeof raw.characters === 'object') {
          characters.clear();
          byYid.clear();
          skeletons.clear();
          for (const k of Object.keys(raw.characters)) {
            const rec = raw.characters[k];
            if (!rec || !rec.name) continue;
            const lower = normalizeKey(rec.name);
            applyGmToRecord(rec, lower);
            rec.online = false;
            characters.set(lower, rec);
            registerSkeleton(rec.name, rec.yid);
            if (rec.yid) {
              if (!byYid.has(rec.yid)) byYid.set(rec.yid, new Set());
              byYid.get(rec.yid).add(lower);
            }
          }
          loadedFromDb = true;
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка чтения characters_registry из postgres:', e && e.message);
      }
    }
    if (!loadedFromDb && fs.existsSync(CHARACTERS_FILE)) {
      try {
        const raw = JSON.parse(await fs.promises.readFile(CHARACTERS_FILE, 'utf8'));
        if (raw && typeof raw.characters === 'object') {
          characters.clear();
          byYid.clear();
          for (const k of Object.keys(raw.characters)) {
            const rec = raw.characters[k];
            if (!rec || !rec.name) continue;
            // Применяем актуальный gmAccess, если задан
            const lower = normalizeKey(rec.name);
            applyGmToRecord(rec, lower);
            // Сбрасываем флаг онлайна при холодном старте сервера
            rec.online = false;
            characters.set(lower, rec);
            registerSkeleton(rec.name, rec.yid);
            if (rec.yid) {
              if (!byYid.has(rec.yid)) byYid.set(rec.yid, new Set());
              byYid.get(rec.yid).add(lower);
            }
          }
          loadedFromDb = true;
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка чтения characters.json, переиндексация:', e && e.message);
      }
    }

    // 3. Если база пуста или не существовала — сканируем существующие профили
    const isClusterWorker = process.env.IS_CLUSTER_WORKER === '1';
    const skipRebuild = (opts && opts.skipRebuild) || isClusterWorker;
    let rebuilt = false;
    if ((!loadedFromDb || characters.size === 0) && !skipRebuild) {
      await PlayerDb.rebuildIndex();
      rebuilt = true;
    }

    // H5: привязать старые записи «имя → уровень» к текущему владельцу имени
    const migrated = bindLegacyGmNames();
    if (migrated.changed) {
      console.warn('[PlayerDB] gm-access: записей по имени привязано к аккаунтам: ' + migrated.bound);
      if (process.env.IS_CLUSTER_WORKER !== '1') {
        PlayerDb.saveGmAccess().catch(e => console.error('[PlayerDB] saveGmAccess:', e && e.message));
      }
    }
    if (migrated.dropped) {
      console.warn('[PlayerDB] gm-access: ' + migrated.dropped + ' записей по имени без владельца — игнорируются (выдайте права заново через /api/admin/gm)');
    }
    for (const [lower, rec] of characters.entries()) applyGmToRecord(rec, lower);

    initialized = true;
    return { count: characters.size, rebuilt: rebuilt };
  },

  loadGmAccessSync() {
    try {
      if (fs.existsSync(GM_FILE)) {
        const raw = JSON.parse(fs.readFileSync(GM_FILE, 'utf8'));
        if (raw && typeof raw === 'object') {
          if (raw.characters && typeof raw.characters === 'object') {
            for (const n of Object.keys(raw.characters)) {
              gmAccess.characters[normalizeKey(n)] = normGmEntry(raw.characters[n]);
            }
          }
          if (raw.accounts && typeof raw.accounts === 'object') {
            for (const a of Object.keys(raw.accounts)) {
              gmAccess.accounts[String(a).toLowerCase()] = normalizeAccessLevel(raw.accounts[a]);
            }
          }
        }
      }
    } catch (e) {
      console.error('[PlayerDB] ошибка чтения gm-access.json:', e && e.message);
    }
  },

  async saveGmAccess() {
    const payload = {
      characters: gmAccess.characters,
      accounts: gmAccess.accounts,
      updatedAt: Date.now()
    };
    const db = getDb();
    if (db && db.MODE === 'postgres' && typeof db.saveSystemState === 'function') {
      if (PlayerDb._gmLoadFailed) {
        console.error('[PlayerDB] gm_access не был загружен из postgres — запись в БД пропущена (защита от затирания)');
      } else {
        db.saveSystemState('gm_access', payload).catch(e => console.error('[PlayerDB] saveGmAccess postgres:', e && e.message));
      }
    }
    return enqueue('gm-access', () => atomicWrite(GM_FILE, JSON.stringify(payload, null, 2)));
  },

  /**
   * Сохранить реестр персонажей на диск атомарно.
   */
  async save() {
    if (process.env.IS_CLUSTER_WORKER === '1' && _ipcHub) return;
    const charsObj = Object.create(null);
    for (const [k, rec] of characters.entries()) {
      charsObj[k] = rec;
    }
    const payload = {
      version: 1,
      updatedAt: Date.now(),
      count: characters.size,
      characters: charsObj
    };
    const db = getDb();
    if (db && db.MODE === 'postgres' && typeof db.saveSystemState === 'function') {
      db.saveSystemState('characters_registry', payload).catch(e => console.error('[PlayerDB] save postgres:', e && e.message));
    }
    const json = JSON.stringify(payload, null, 2);
    return enqueue('characters-db', () => atomicWrite(CHARACTERS_FILE, json));
  },

  /**
   * Полное пересканирование каталога data/ и сбор всех профилей игроков.
   */
  async rebuildIndex() {
    let files = [];
    try {
      files = await fs.promises.readdir(DATA_DIR);
    } catch (e) {
      return { count: 0 };
    }

    for (const f of files) {
      if (!/\.json$/i.test(f)) continue;
      if (f === 'characters.json' || f === 'gm-access.json') continue;
      if (f.endsWith('.tmp') || f.endsWith('.bak')) continue;
      if (f.startsWith('bot3k_') || f.startsWith('stress_bot_') || f.endsWith('_db.json') || f === 'account_keys.json' || f === 'editor-overrides.json') continue;

      const baseName = f.slice(0, -5);
      const parsed = CH.parseProfileStem(baseName);
      const yid = parsed.yid;
      const charId = parsed.charId;

      try {
        const fullPath = path.join(DATA_DIR, f);
        const raw = JSON.parse(await fs.promises.readFile(fullPath, 'utf8'));
        if (raw && typeof raw === 'object' && raw.name) {
          const lower = normalizeKey(raw.name);
          const current = characters.get(lower);
          const rec = recordFromProfile(raw, yid, charId, current);
          if (rec) {
            characters.set(lower, rec);
            registerSkeleton(rec.name, rec.yid);
            if (yid) {
              if (!byYid.has(yid)) byYid.set(yid, new Set());
              byYid.get(yid).add(lower);
            }
          }
        }
      } catch (_) {
        // Пропускаем не-профили или повреждённые файлы
      }
    }

    await PlayerDb.save();
    return { count: characters.size };
  },

  /**
   * Поиск персонажа по имени (регистронезависимо).
   */
  getByName(name) {
    if (!name) return null;
    return characters.get(normalizeKey(name)) || null;
  },

  /**
   * Проверка занятости имени персонажа глобально на сервере (регистронезависимо).
   * @param {string} name - Имя персонажа для проверки
   * @param {string} [excludeYid] - Опциональный YID аккаунта, которому разрешено владеть этим именем
   * @returns {boolean} true если имя уже занято другим аккаунтом
   */
  isNameTaken(name, excludeYid) {
    if (!name) return false;
    const rec = characters.get(normalizeKey(name));
    if (rec) {
      if (excludeYid && String(rec.yid) === String(excludeYid)) return false;
      return true;
    }
    // H5: имя, визуально совпадающее с существующим (АВС кириллицей ≈ ABC
    // латиницей, 0 ≈ O), считается занятым — O(1) поиск через реестр skeletons
    const sk = nameSkeleton(name);
    const set = skeletons.get(sk);
    if (set && set.size > 0) {
      for (const item of set) {
        if (!excludeYid || String(item.yid) !== String(excludeYid)) return true;
      }
    }
    return false;
  },

  /**
   * Поиск персонажа по аккаунту и слоту или всех персонажей аккаунта.
   */
  getByYid(yid, charId) {
    const y = String(yid || '');
    const set = byYid.get(y);
    if (!set || set.size === 0) return charId ? null : [];
    const list = [];
    for (const lower of set) {
      const rec = characters.get(lower);
      if (rec) {
        if (charId && CH.normalizeCharId(rec.charId) === CH.normalizeCharId(charId)) {
          return rec;
        }
        list.push(rec);
      }
    }
    return charId ? null : list;
  },

  /**
   * Универсальный поиск: по имени персонажа ИЛИ по YID.
   */
  find(target) {
    if (!target) return null;
    const byName = PlayerDb.getByName(target);
    if (byName) return byName;
    const byY = PlayerDb.getByYid(target);
    if (Array.isArray(byY) && byY.length > 0) return byY[0];
    return null;
  },

  /**
   * Получить список персонажей с фильтрацией.
   */
  list(options) {
    const opts = options || {};
    const result = [];
    for (const rec of characters.values()) {
      if (opts.gmOnly && !rec.gm) continue;
      if (opts.onlineOnly && !rec.online) continue;
      if (opts.yid && rec.yid !== String(opts.yid)) continue;
      if (opts.search) {
        const s = String(opts.search).toLowerCase();
        if (!rec.name.toLowerCase().includes(s) && !rec.yid.toLowerCase().includes(s)) continue;
      }
      result.push(Object.assign({}, rec));
    }
    result.sort((a, b) => (b.level - a.level) || a.name.localeCompare(b.name));
    return result;
  },

  /**
   * Проверка, является ли игрок GM.
   */
  isGM(yid, charName) {
    const lowerName = normalizeKey(charName);
    const yLower = String(yid || '').toLowerCase();
    if (!yLower) return false; // H5: без аккаунта прав нет (только имя — недостаточно)
    const gl = gmAccessLevel(yLower, lowerName);
    if (gl != null) return isGmLevel(gl);
    if (gmStrict()) return false;
    if (lowerName) {
      const rec = characters.get(lowerName);
      if (rec && rec.gm && rec.yid && String(rec.yid).toLowerCase() === yLower) return true;
    }
    return false;
  },

  /**
   * Получить числовой accessLevel.
   */
  getAccessLevel(yid, charName, fallbackLevel) {
    const lowerName = normalizeKey(charName);
    const yLower = String(yid || '').toLowerCase();
    const gl = yLower ? gmAccessLevel(yLower, lowerName) : null;
    if (gl != null) return gl;
    if (gmStrict()) return 0;
    if (lowerName && yLower) {
      const rec = characters.get(lowerName);
      // H5: запись реестра по имени учитываем, только если это тот же аккаунт
      if (rec && rec.accessLevel != null && rec.yid && String(rec.yid).toLowerCase() === yLower) return rec.accessLevel;
    }
    return normalizeAccessLevel(fallbackLevel != null ? fallbackLevel : 0);
  },

  /**
   * Назначение уровня доступа GM вне игры (по имени персонажа или по YID аккаунта).
   * Сохраняет данные в characters.json, gm-access.json и файл профиля.
   */
  async setAccessLevel(target, accessLevel, reason) {
    const lvl = normalizeAccessLevel(accessLevel);
    const gm = isGmLevel(lvl);
    const t = String(target || '').trim();
    if (!t) throw new Error('Target name or YID is required');

    let matchedRec = PlayerDb.getByName(t);
    let isYid = false;
    let targetYid = '';
    let targetName = '';

    if (matchedRec) {
      targetName = matchedRec.name;
      targetYid = matchedRec.yid;
    } else {
      // Возможно, передан YID
      const byY = PlayerDb.getByYid(t);
      if (Array.isArray(byY) && byY.length > 0) {
        matchedRec = byY[0];
        targetYid = t;
        targetName = matchedRec.name;
        isYid = true;
      } else {
        // Персонаж ещё не заходил или профиль не зарегистрирован — регистрируем в gm-access
        targetName = t;
        targetYid = t;
      }
    }

    const lowerName = normalizeKey(targetName);

    // Обновляем gmAccess.
    // H5: запись по имени всегда привязана к yid владельца. Неизвестная цель
    // трактуется только как yid аккаунта — заранее «забронировать» права на имя
    // (которое потом может занять кто угодно) больше нельзя.
    const yKey = String(targetYid || '').toLowerCase();
    if (lvl > 0) {
      if (matchedRec && !isYid) {
        gmAccess.characters[lowerName] = { level: lvl, yid: yKey };
      } else if (yKey) {
        gmAccess.accounts[yKey] = lvl;
      }
    } else {
      // revoke снимает права и с персонажа, и с аккаунта
      if (lowerName) delete gmAccess.characters[lowerName];
      if (yKey) delete gmAccess.accounts[yKey];
      if (yKey) {
        for (const n of Object.keys(gmAccess.characters)) {
          const e = gmAccess.characters[n];
          if (e && typeof e === 'object' && e.yid === yKey && isYid) delete gmAccess.characters[n];
        }
      }
    }
    if (process.env.IS_CLUSTER_WORKER !== '1' || !_ipcHub) {
      await PlayerDb.saveGmAccess();
    }

    // Обновляем запись в characters.json
    if (matchedRec) {
      matchedRec.accessLevel = lvl;
      matchedRec.gm = gm;
      matchedRec.updatedAt = Date.now();
      if (process.env.IS_CLUSTER_WORKER !== '1' || !_ipcHub) {
        await PlayerDb.save();
      }

      // Обновляем профиль персонажа через единый слой DB.load / DB.save (поддержка File и PostgreSQL + writeChains)
      try {
        const db = getDb();
        if (db && typeof db.load === 'function' && typeof db.save === 'function') {
          const pr = await db.load(matchedRec.yid, matchedRec.charId);
          if (pr && typeof pr === 'object') {
            pr.accessLevel = lvl;
            pr.gm = gm;
            await db.save(matchedRec.yid, pr, matchedRec.charId);
          }
        } else {
          const pFile = fileOf(matchedRec.yid, matchedRec.charId);
          if (fs.existsSync(pFile)) {
            const pr = JSON.parse(await fs.promises.readFile(pFile, 'utf8'));
            pr.accessLevel = lvl;
            pr.gm = gm;
            await atomicWrite(pFile, JSON.stringify(pr));
          }
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка обновления профиля:', e && e.message);
      }
    }

    _emitPlayerDbSync('gm_access', {
      characters: gmAccess.characters,
      accounts: gmAccess.accounts,
      touchRec: matchedRec || null
    });

    // Оповещаем подписчиков (сервер для живого hot-sync)
    emitter.emit('gmChanged', {
      target: t,
      name: targetName,
      yid: targetYid,
      accessLevel: lvl,
      gm: gm,
      reason: reason || 'admin_tool'
    });

    return {
      ok: true,
      target: targetName || targetYid,
      yid: targetYid,
      name: targetName,
      accessLevel: lvl,
      gm: gm
    };
  },

  /**
   * Снятие статуса GM (accessLevel = 0).
   */
  async revokeAccess(target, reason) {
    return PlayerDb.setAccessLevel(target, 0, reason || 'revoke');
  },

  /**
   * Установка ауры персонажа в базе и в файле профиля (data/<stem>.json).
   */
  async setAura(target, auraType) {
    const targetStr = String(target || '');
    const isYid = byYid.has(targetStr) ||
      targetStr.startsWith('local_') ||
      targetStr.startsWith('ya_') ||
      targetStr.startsWith('itest_') ||
      /^[0-9a-f-]{36}$/i.test(targetStr);
    let lowerName = !isYid ? normalizeKey(target) : '';
    let matchedRec = !isYid ? characters.get(lowerName) : null;
    if (!matchedRec && isYid) {
      const set = byYid.get(targetStr);
      if (set && set.size > 0) {
        const first = Array.from(set)[0];
        matchedRec = characters.get(first);
      }
    }
    if (!matchedRec && !isYid) {
      for (const rec of characters.values()) {
        if (rec.name && rec.name.toLowerCase() === lowerName) {
          matchedRec = rec;
          break;
        }
      }
    }
    if (matchedRec) {
      matchedRec.cosmetics = matchedRec.cosmetics || {};
      matchedRec.cosmetics.aura = (auraType === 'none' || !auraType) ? 'none' : auraType;
      if (auraType && auraType !== 'none') {
        if (!Array.isArray(matchedRec.cosmetics.auras)) matchedRec.cosmetics.auras = [];
        if (!matchedRec.cosmetics.auras.includes(auraType)) matchedRec.cosmetics.auras.push(auraType);
      }
      matchedRec.updatedAt = Date.now();
      if (process.env.IS_CLUSTER_WORKER !== '1' || !_ipcHub) {
        await PlayerDb.save();
      }
      _emitPlayerDbSync('touch', { rec: matchedRec });

      try {
        const db = getDb();
        if (db && typeof db.load === 'function' && typeof db.save === 'function') {
          const pr = await db.load(matchedRec.yid, matchedRec.charId);
          if (pr && typeof pr === 'object') {
            pr.cosmetics = pr.cosmetics || {};
            pr.cosmetics.aura = (auraType === 'none' || !auraType) ? 'none' : auraType;
            if (auraType && auraType !== 'none') {
              if (!Array.isArray(pr.cosmetics.auras)) pr.cosmetics.auras = [];
              if (!pr.cosmetics.auras.includes(auraType)) pr.cosmetics.auras.push(auraType);
            }
            await db.save(matchedRec.yid, pr, matchedRec.charId);
          }
        } else {
          const pFile = fileOf(matchedRec.yid, matchedRec.charId);
          if (fs.existsSync(pFile)) {
            const pr = JSON.parse(await fs.promises.readFile(pFile, 'utf8'));
            pr.cosmetics = pr.cosmetics || {};
            pr.cosmetics.aura = (auraType === 'none' || !auraType) ? 'none' : auraType;
            if (auraType && auraType !== 'none') {
              if (!Array.isArray(pr.cosmetics.auras)) pr.cosmetics.auras = [];
              if (!pr.cosmetics.auras.includes(auraType)) pr.cosmetics.auras.push(auraType);
            }
            await atomicWrite(pFile, JSON.stringify(pr));
          }
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка обновления ауры в профиле:', e && e.message);
      }
      return { ok: true, name: matchedRec.name, yid: matchedRec.yid, aura: matchedRec.cosmetics.aura };
    }
    return { ok: false, reason: 'not_found' };
  },

  /**
   * Обновление снимка персонажа при логине, левелапе или сохранении.
   */
  touch(pr, yid, charId) {
    if (!pr || !pr.name) return;
    if (yid && (String(yid).startsWith('bot3k_') || String(yid).startsWith('stress_bot_'))) return;
    const lower = normalizeKey(pr.name);
    const existing = characters.get(lower);
    if (existing && existing.yid && yid && String(existing.yid) !== String(yid)) {
      // Запрещаем перезапись чужого персонажа в глобальном реестре
      return;
    }
    const rec = recordFromProfile(pr, yid, charId, existing);
    if (!rec) return;

    characters.set(lower, rec);
    registerSkeleton(rec.name, rec.yid);
    if (rec.yid) {
      if (!byYid.has(rec.yid)) byYid.set(rec.yid, new Set());
      byYid.get(rec.yid).add(lower);
    }

    // Дебаунс сохранения не блокирует игровой цикл
    PlayerDb._scheduleSave();
    _emitPlayerDbSync('touch', { rec });
  },

  setOnline(yid, charId, isOnline) {
    if (charId) {
      const rec = PlayerDb.getByYid(yid, charId);
      if (rec) {
        rec.online = !!isOnline;
        rec.lastSeen = Date.now();
        PlayerDb._scheduleSave();
      }
    } else {
      const list = PlayerDb.getByYid(yid);
      if (Array.isArray(list) && list.length > 0) {
        for (const rec of list) {
          rec.online = !!isOnline;
          rec.lastSeen = Date.now();
        }
        PlayerDb._scheduleSave();
      }
    }
    if (yid) {
      _emitPlayerDbSync('online', {
        yid: String(yid),
        charId: charId || null,
        online: !!isOnline,
        lastSeen: Date.now()
      });
    }
  },

  removeChar(yid, charId) {
    const rec = PlayerDb.getByYid(yid, charId);
    if (rec) {
      const lower = normalizeKey(rec.name);
      characters.delete(lower);
      unregisterSkeleton(rec.name);
      const set = byYid.get(String(yid));
      if (set) {
        set.delete(lower);
        if (set.size === 0) byYid.delete(String(yid));
      }
      PlayerDb._scheduleSave();
    }
    if (yid) {
      _emitPlayerDbSync('remove', { yid: String(yid), charId: charId || null });
    }
  },

  _saveTimer: null,
  _scheduleSave() {
    if (process.env.IS_CLUSTER_WORKER === '1' && _ipcHub) return;
    if (PlayerDb._saveTimer) return;
    PlayerDb._saveTimer = setTimeout(() => {
      PlayerDb._saveTimer = null;
      PlayerDb.save().catch(e => console.error('[PlayerDB] автосохранение:', e && e.message));
    }, 1000);
  },

  setIpcHub(hub) {
    if (_ipcHub && typeof _ipcHub.off === 'function') {
      _ipcHub.off('player_db_sync', _onPlayerDbSync);
    } else if (_ipcHub && typeof _ipcHub.removeListener === 'function') {
      _ipcHub.removeListener('player_db_sync', _onPlayerDbSync);
    }
    _ipcHub = hub || null;
    if (_ipcHub && typeof _ipcHub.on === 'function') {
      _ipcHub.on('player_db_sync', _onPlayerDbSync);
    }
  },

  applySync(action, data) {
    if (_applyingSync) return;
    _applyingSync = true;
    try {
      if (action === 'touch' && data && data.rec && data.rec.name) {
        const rec = data.rec;
        const lower = normalizeKey(rec.name);
        const existing = characters.get(lower);
        if (existing && existing.yid && rec.yid && String(existing.yid) !== String(rec.yid)) {
          return;
        }
        const cloned = Object.assign({}, rec);
        if (existing && existing.online && !cloned.online) {
          cloned.online = true;
        }
        if (existing && existing.cosmetics && !cloned.cosmetics) {
          cloned.cosmetics = existing.cosmetics;
        }
        applyGmToRecord(cloned, lower);
        characters.set(lower, cloned);
        registerSkeleton(cloned.name, cloned.yid);
        if (cloned.yid) {
          if (!byYid.has(cloned.yid)) byYid.set(cloned.yid, new Set());
          byYid.get(cloned.yid).add(lower);
        }
        PlayerDb._scheduleSave();
      } else if (action === 'online' && data && data.yid) {
        const yid = String(data.yid);
        const isOnline = !!data.online;
        const ts = data.lastSeen || Date.now();
        let changed = false;
        if (data.charId) {
          const rec = PlayerDb.getByYid(yid, data.charId);
          if (rec) {
            rec.online = isOnline;
            rec.lastSeen = ts;
            changed = true;
          }
        } else {
          const list = PlayerDb.getByYid(yid);
          if (Array.isArray(list) && list.length > 0) {
            for (const rec of list) {
              rec.online = isOnline;
              rec.lastSeen = ts;
            }
            changed = true;
          }
        }
        if (changed) PlayerDb._scheduleSave();
      } else if (action === 'remove' && data && data.yid) {
        const yid = String(data.yid);
        const rec = PlayerDb.getByYid(yid, data.charId || null);
        if (rec) {
          const lower = normalizeKey(rec.name);
          characters.delete(lower);
          unregisterSkeleton(rec.name);
          const set = byYid.get(yid);
          if (set) {
            set.delete(lower);
            if (set.size === 0) byYid.delete(yid);
          }
          PlayerDb._scheduleSave();
        }
      } else if (action === 'gm_access' && data) {
        if (data.characters && typeof data.characters === 'object') {
          for (const k of Object.keys(gmAccess.characters)) delete gmAccess.characters[k];
          for (const n of Object.keys(data.characters)) {
            gmAccess.characters[normalizeKey(n)] = normGmEntry(data.characters[n]);
          }
        }
        if (data.accounts && typeof data.accounts === 'object') {
          for (const k of Object.keys(gmAccess.accounts)) delete gmAccess.accounts[k];
          for (const a of Object.keys(data.accounts)) {
            gmAccess.accounts[String(a).toLowerCase()] = normalizeAccessLevel(data.accounts[a]);
          }
        }
        if (data.touchRec && data.touchRec.name) {
          const tRec = Object.assign({}, data.touchRec);
          const tLower = normalizeKey(tRec.name);
          applyGmToRecord(tRec, tLower);
          characters.set(tLower, tRec);
          registerSkeleton(tRec.name, tRec.yid);
          if (tRec.yid) {
            if (!byYid.has(tRec.yid)) byYid.set(tRec.yid, new Set());
            byYid.get(tRec.yid).add(tLower);
          }
        }
        for (const [lower, rec] of characters.entries()) {
          applyGmToRecord(rec, lower);
        }
        if (process.env.IS_CLUSTER_WORKER !== '1') {
          PlayerDb.saveGmAccess().catch(e => console.error('[PlayerDB] saveGmAccess sync:', e && e.message));
          PlayerDb._scheduleSave();
        }
      }
    } finally {
      _applyingSync = false;
    }
  },

  onGmChanged(cb) {
    emitter.on('gmChanged', cb);
    return () => emitter.off('gmChanged', cb);
  },

  setDb(customDb) {
    cachedDb = customDb || null;
  },

  isPrivilegedGmYid
};

module.exports = PlayerDb;
