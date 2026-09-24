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

const DATA_DIR = path.join(__dirname, '..', 'data');
const CHARACTERS_FILE = path.join(DATA_DIR, 'characters.json');
const GM_FILE = path.join(DATA_DIR, 'gm-access.json');

const emitter = new EventEmitter();

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
  return String(yid || '').replace(/[^a-z0-9_-]/gi, '_');
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
  if (gmAccess.characters[lowerName] != null) {
    accessLevel = gmAccess.characters[lowerName];
  } else if (gmAccess.accounts[String(yid).toLowerCase()] != null) {
    accessLevel = gmAccess.accounts[String(yid).toLowerCase()];
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
    level: Math.max(1, Math.min(200, pr.level | 0 || 1)),
    exp: Math.max(0, pr.exp | 0 || 0),
    sp: Math.max(0, pr.sp | 0 || 0),
    cls: String(pr.cls || 'operator'),
    classTier: pr.classTier | 0 || 0,
    race: String(pr.race || 'human'),
    gender: String(pr.gender || 'male'),
    accessLevel: accessLevel,
    gm: isGmLevel(accessLevel),
    online: isOnline,
    lastSeen: lastSeen,
    createdAt: pr.createdAt | 0 || (currentRecord ? currentRecord.createdAt : 0) || Date.now(),
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
              gmAccess.characters[normalizeKey(n)] = normalizeAccessLevel(gmRaw.characters[n]);
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
          for (const k of Object.keys(raw.characters)) {
            const rec = raw.characters[k];
            if (!rec || !rec.name) continue;
            const lower = normalizeKey(rec.name);
            if (gmAccess.characters[lower] != null) {
              rec.accessLevel = gmAccess.characters[lower];
              rec.gm = isGmLevel(rec.accessLevel);
            } else if (rec.yid && gmAccess.accounts[String(rec.yid).toLowerCase()] != null) {
              rec.accessLevel = gmAccess.accounts[String(rec.yid).toLowerCase()];
              rec.gm = isGmLevel(rec.accessLevel);
            }
            rec.online = false;
            characters.set(lower, rec);
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
            if (gmAccess.characters[lower] != null) {
              rec.accessLevel = gmAccess.characters[lower];
              rec.gm = isGmLevel(rec.accessLevel);
            } else if (rec.yid && gmAccess.accounts[String(rec.yid).toLowerCase()] != null) {
              rec.accessLevel = gmAccess.accounts[String(rec.yid).toLowerCase()];
              rec.gm = isGmLevel(rec.accessLevel);
            }
            // Сбрасываем флаг онлайна при холодном старте сервера
            rec.online = false;
            characters.set(lower, rec);
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
              gmAccess.characters[normalizeKey(n)] = normalizeAccessLevel(raw.characters[n]);
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
      db.saveSystemState('gm_access', payload).catch(e => console.error('[PlayerDB] saveGmAccess postgres:', e && e.message));
    }
    return enqueue('gm-access', () => atomicWrite(GM_FILE, JSON.stringify(payload, null, 2)));
  },

  /**
   * Сохранить реестр персонажей на диск атомарно.
   */
  async save() {
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
    if (!rec) return false;
    if (excludeYid && String(rec.yid) === String(excludeYid)) return false;
    return true;
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
    if (lowerName && gmAccess.characters[lowerName] != null) {
      return isGmLevel(gmAccess.characters[lowerName]);
    }
    const yLower = String(yid || '').toLowerCase();
    if (yLower && gmAccess.accounts[yLower] != null) {
      return isGmLevel(gmAccess.accounts[yLower]);
    }
    if (lowerName) {
      const rec = characters.get(lowerName);
      if (rec && rec.gm) {
        if (!yLower || !rec.yid || String(rec.yid).toLowerCase() === yLower) return true;
      }
    }
    return false;
  },

  /**
   * Получить числовой accessLevel.
   */
  getAccessLevel(yid, charName, fallbackLevel) {
    const lowerName = normalizeKey(charName);
    if (lowerName && gmAccess.characters[lowerName] != null) {
      return gmAccess.characters[lowerName];
    }
    const yLower = String(yid || '').toLowerCase();
    if (yLower && gmAccess.accounts[yLower] != null) {
      return gmAccess.accounts[yLower];
    }
    if (lowerName) {
      const rec = characters.get(lowerName);
      if (rec && rec.accessLevel != null) return rec.accessLevel;
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

    // Обновляем gmAccess
    if (isYid || !matchedRec) {
      if (lvl > 0) {
        gmAccess.accounts[String(targetYid).toLowerCase()] = lvl;
      } else {
        delete gmAccess.accounts[String(targetYid).toLowerCase()];
      }
    }
    if (targetName) {
      if (lvl > 0) {
        gmAccess.characters[lowerName] = lvl;
      } else {
        delete gmAccess.characters[lowerName];
      }
    }
    await PlayerDb.saveGmAccess();

    // Обновляем запись в characters.json
    if (matchedRec) {
      matchedRec.accessLevel = lvl;
      matchedRec.gm = gm;
      matchedRec.updatedAt = Date.now();
      await PlayerDb.save();

      // Обновляем файл профиля персонажа (data/<stem>.json)
      try {
        const pFile = fileOf(matchedRec.yid, matchedRec.charId);
        if (fs.existsSync(pFile)) {
          const pr = JSON.parse(await fs.promises.readFile(pFile, 'utf8'));
          pr.accessLevel = lvl;
          pr.gm = gm;
          await atomicWrite(pFile, JSON.stringify(pr));
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка обновления файла профиля:', e && e.message);
      }
    }

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
    const isYid = String(target || '').startsWith('itest_') || /^[0-9a-f-]{36}$/i.test(String(target || ''));
    let lowerName = !isYid ? normalizeKey(target) : '';
    let matchedRec = !isYid ? characters.get(lowerName) : null;
    if (!matchedRec && isYid) {
      const set = byYid.get(String(target));
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
      matchedRec.updatedAt = Date.now();
      await PlayerDb.save();

      try {
        const pFile = fileOf(matchedRec.yid, matchedRec.charId);
        if (fs.existsSync(pFile)) {
          const pr = JSON.parse(await fs.promises.readFile(pFile, 'utf8'));
          pr.cosmetics = pr.cosmetics || {};
          pr.cosmetics.aura = (auraType === 'none' || !auraType) ? 'none' : auraType;
          await atomicWrite(pFile, JSON.stringify(pr));
        }
      } catch (e) {
        console.error('[PlayerDB] ошибка обновления ауры в файле профиля:', e && e.message);
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
    const lower = normalizeKey(pr.name);
    const existing = characters.get(lower);
    if (existing && existing.yid && yid && String(existing.yid) !== String(yid)) {
      // Запрещаем перезапись чужого персонажа в глобальном реестре
      return;
    }
    const rec = recordFromProfile(pr, yid, charId, existing);
    if (!rec) return;

    characters.set(lower, rec);
    if (rec.yid) {
      if (!byYid.has(rec.yid)) byYid.set(rec.yid, new Set());
      byYid.get(rec.yid).add(lower);
    }

    // Дебаунс сохранения не блокирует игровой цикл
    PlayerDb._scheduleSave();
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
  },

  removeChar(yid, charId) {
    const rec = PlayerDb.getByYid(yid, charId);
    if (rec) {
      const lower = normalizeKey(rec.name);
      characters.delete(lower);
      const set = byYid.get(String(yid));
      if (set) {
        set.delete(lower);
        if (set.size === 0) byYid.delete(String(yid));
      }
      PlayerDb._scheduleSave();
    }
  },

  _saveTimer: null,
  _scheduleSave() {
    if (PlayerDb._saveTimer) return;
    PlayerDb._saveTimer = setTimeout(() => {
      PlayerDb._saveTimer = null;
      PlayerDb.save().catch(e => console.error('[PlayerDB] автосохранение:', e && e.message));
    }, 1000);
  },

  onGmChanged(cb) {
    emitter.on('gmChanged', cb);
    return () => emitter.off('gmChanged', cb);
  }
};

module.exports = PlayerDb;
