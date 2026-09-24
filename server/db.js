// ============================================================
//  SERVER / DB.JS  —  адаптер персистентности данных (профили, кланы, состояние).
//  DB=file     (по умолчанию) -> data/<yid>.json           (c0)
//                              data/<yid>.<charId>.json   (слоты 2–7)
//                              data/clans/<clanId>.json   (кланы)
//  DB=postgres                -> таблицы profiles, clans, system_state
//                              pkey c0 = yid, иначе yid:charId
//  load/save(yid, …) без charId = слот c0: старые тесты и сейвы валидны.
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');
const CH = require('../shared/char-rules.js');
let PlayerDb = null;
try { PlayerDb = require('./player-db.js'); } catch (_) {}

const DATA_DIR = path.join(__dirname, '..', 'data');
const CLANS_DIR = path.join(DATA_DIR, 'clans');
const MODE = (process.env.DB || 'file').toLowerCase();

if (MODE === 'file') {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
}

function safeName(yid) { return String(yid || '').replace(/[^a-z0-9_-]/gi, '_'); }
function stemOf(yid, charId) { return CH.profileStem(safeName(yid), charId); }
function pkeyOf(yid, charId) { return CH.profileKey(yid, charId); }
function fileOf(yid, charId) { return path.join(DATA_DIR, stemOf(yid, charId) + '.json'); }
function clanFileOf(id) { return path.join(CLANS_DIR, String(id).replace(/[^a-z0-9_-]/gi, '_') + '.json'); }
function systemStateFileOf(key) { return path.join(DATA_DIR, String(key).replace(/[^a-z0-9_-]/gi, '_') + '.json'); }

// Очередь сериализации записей по ключу
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

function flush() {
  return Promise.all([...writeChains.values()]).then(noop, noop);
}

/** Повтор файловой операции при временной блокировке (EBUSY / EPERM на Windows). */
async function retryFs(fn, retries, delayMs) {
  retries = retries || 4;
  delayMs = delayMs || 15;
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

async function readProfileFile(file, label) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    console.error('[DB] профиль повреждён:', file, e && e.message);
    try {
      const bak = JSON.parse(await fs.promises.readFile(file + '.bak', 'utf8'));
      console.error('[DB] восстановлен из .bak:', file);
      return bak;
    } catch (e2) {
      if (e2 && e2.code === 'ENOENT') throw new Error('profile corrupted: ' + label);
      throw new Error('profile corrupted (bak too): ' + label);
    }
  }
}

/**
 * Валидация базы данных для продакшена.
 * При NODE_ENV=production или STRICT_POSTGRES=1 требует DB=postgres и наличие DATABASE_URL.
 * Защищает от деградации производительности и повреждения данных файлового бэкенда при >500 CCU.
 * Обход в экстренных случаях: ALLOW_FILE_DB_IN_PROD=1.
 */
function assertProductionDatabase(opts = {}) {
  const env = opts.env || process.env.NODE_ENV || 'development';
  const strict = opts.strict != null
    ? !!opts.strict
    : (process.env.STRICT_POSTGRES === '1' || (env === 'production' && process.env.STRICT_POSTGRES !== '0'));
  const allowFileInProd = opts.allowFileInProd != null
    ? !!opts.allowFileInProd
    : (process.env.ALLOW_FILE_DB_IN_PROD === '1');
  const mode = (opts.mode || process.env.DB || 'file').toLowerCase();
  const dbUrl = opts.databaseUrl !== undefined ? opts.databaseUrl : process.env.DATABASE_URL;

  if (strict && !allowFileInProd) {
    if (mode !== 'postgres') {
      const err = new Error(
        '[DB_FATAL] В продакшене (NODE_ENV=production / STRICT_POSTGRES=1) при >500 CCU строго обязателен PostgreSQL (DB=postgres).\n' +
        'Файловый бэкенд (DB=file) не обеспечивает требуемую пропускную способность из-за конкурентных блокировок дискового I/O.\n' +
        'Задайте переменные окружения: DB=postgres и DATABASE_URL=postgres://...\n' +
        'Для аварийного запуска на файловой БД задайте ALLOW_FILE_DB_IN_PROD=1.'
      );
      err.code = 'ERR_POSTGRES_REQUIRED';
      throw err;
    }
    if (!dbUrl || !String(dbUrl).trim()) {
      const err = new Error(
        '[DB_FATAL] Режим DB=postgres задан, но отсутствует строка подключения DATABASE_URL.\n' +
        'Укажите DATABASE_URL=postgres://user:pass@host:port/dbname'
      );
      err.code = 'ERR_DATABASE_URL_MISSING';
      throw err;
    }
  }
  return { ok: true, mode, strict };
}

// ----------------------------------------------------------------
//  FILE BACKEND
// ----------------------------------------------------------------
const FileBackend = {
  MODE: 'file',
  assertProductionDatabase: assertProductionDatabase,
  async init() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
    return { ok: true, mode: 'file' };
  },
  async load(yid, charId) {
    const file = fileOf(yid, charId);
    return readProfileFile(file, stemOf(yid, charId));
  },
  save(yid, data, charId) {
    if (PlayerDb && PlayerDb.touch) {
      try { PlayerDb.touch(data, yid, charId); } catch (_) {}
    }
    const json = JSON.stringify(data);
    const stem = stemOf(yid, charId);
    return enqueue(stem, () => FileBackend._writeNow(fileOf(yid, charId), stem, json));
  },
  async saveBatch(items) {
    if (!items || !items.length) return;
    await Promise.all(items.map(it => FileBackend.save(it.yid, it.data, it.charId)));
  },
  async _writeNow(file, label, json) {
    const tmp = file + '.tmp.' + process.pid + '.' + (++tmpCounter).toString(36);
    let fh = null;
    try {
      fh = await fs.promises.open(tmp, 'w');
      await fh.writeFile(json, 'utf8');
      await fh.sync();
      await fh.close();
      fh = null;
      try {
        await retryFs(() => fs.promises.copyFile(file, file + '.bak'), 4, 15);
      } catch (e) {
        const code = e && e.code;
        if (code === 'ENOENT') {
          // Файла ещё нет (первый сейв) — нормально
        } else if (code === 'EBUSY') {
          console.warn('[DB] .bak copyFile EBUSY (locked on Windows), continuing save:', label);
        } else {
          throw e;
        }
      }
      await retryFs(() => fs.promises.rename(tmp, file), 5, 20);
    } catch (e) {
      if (fh) { try { await fh.close(); } catch (_) {} }
      try { await fs.promises.unlink(tmp); } catch (_) {}
      console.error('[DB] save error', label, e && e.message);
      throw e;
    }
  },
  async listChars(yid) {
    const y = safeName(yid);
    const out = [];
    let names;
    try { names = await fs.promises.readdir(DATA_DIR); }
    catch (e) { return out; }
    const prefix = y + '.';
    for (const f of names) {
      if (!/\.json$/i.test(f)) continue;
      let charId = null;
      if (f === y + '.json') charId = CH.DEFAULT_CHAR_ID;
      else if (f.indexOf(prefix) === 0) {
        const mid = f.slice(prefix.length, f.length - 5);
        if (!mid || mid.indexOf('.') >= 0) continue;
        charId = CH.normalizeCharId(mid);
        if (charId !== mid) continue;
      } else continue;
      try {
        const raw = JSON.parse(await fs.promises.readFile(path.join(DATA_DIR, f), 'utf8'));
        const sum = CH.summarize(raw, charId);
        if (sum) out.push(sum);
      } catch (e) { /* битый слот не показываем */ }
    }
    out.sort((a, b) => (a.createdAt | 0) - (b.createdAt | 0) || String(a.name).localeCompare(String(b.name)));
    return out;
  },
  removeChar(yid, charId) {
    if (PlayerDb && PlayerDb.removeChar) {
      try { PlayerDb.removeChar(yid, charId); } catch (_) {}
    }
    const stem = stemOf(yid, charId);
    const file = fileOf(yid, charId);
    return enqueue(stem, async () => {
      try { await fs.promises.unlink(file); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
      try { await fs.promises.unlink(file + '.bak'); } catch (_) {}
    });
  },

  // Кланы
  saveClan(clan) {
    if (!clan || !clan.id) return Promise.resolve();
    if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
    const json = JSON.stringify(clan);
    const key = 'clan_' + clan.id;
    const file = clanFileOf(clan.id);
    return enqueue(key, () => FileBackend._writeNow(file, key, json));
  },
  async loadClan(id) {
    if (!id) return null;
    const file = clanFileOf(id);
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch (e) {
      return null;
    }
  },
  async loadAllClans() {
    const list = [];
    if (!fs.existsSync(CLANS_DIR)) return list;
    let files = [];
    try { files = await fs.promises.readdir(CLANS_DIR); } catch (_) { return list; }
    for (const f of files) {
      if (!/\.json$/i.test(f)) continue;
      try {
        const raw = JSON.parse(await fs.promises.readFile(path.join(CLANS_DIR, f), 'utf8'));
        if (raw && raw.id) list.push(raw);
      } catch (_) {}
    }
    return list;
  },
  removeClan(id) {
    if (!id) return Promise.resolve();
    const key = 'clan_' + id;
    const file = clanFileOf(id);
    return enqueue(key, async () => {
      try { await fs.promises.unlink(file); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
      try { await fs.promises.unlink(file + '.bak'); } catch (_) {}
    });
  },

  // Системное состояние / реестры
  saveSystemState(key, value) {
    const json = JSON.stringify(value);
    const k = 'sys_' + key;
    const file = systemStateFileOf(key);
    return enqueue(k, () => FileBackend._writeNow(file, k, json));
  },
  async loadSystemState(key) {
    const file = systemStateFileOf(key);
    try {
      return JSON.parse(await fs.promises.readFile(file, 'utf8'));
    } catch (e) {
      return null;
    }
  },

  async healthCheck() {
    const t0 = Date.now();
    try {
      await fs.promises.access(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true, mode: 'file', latencyMs: Date.now() - t0 };
    } catch (err) {
      return { ok: false, mode: 'file', latencyMs: Date.now() - t0, error: err.message };
    }
  },
  getPoolStats() {
    return { mode: 'file', activeWrites: writeChains.size };
  },
  flush: flush,
  close: flush
};

// ----------------------------------------------------------------
//  POSTGRES BACKEND
// ----------------------------------------------------------------
const TRANSIENT_PG_ERRORS = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'EHOSTUNREACH',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '40001', // serialization_failure
  '40P01'  // deadlock_detected
]);

function isTransientPgError(err) {
  if (!err) return false;
  if (err.code && TRANSIENT_PG_ERRORS.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return msg.includes('connection terminated') ||
         msg.includes('connection closed') ||
         msg.includes('timeout') ||
         msg.includes('socket hang up');
}

/** Повтор запроса при транзиентном сбое сети или временной недоступности БД. */
async function retryPgQuery(fn, retries = 3, delayMs = 25) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (isTransientPgError(err) && i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(2, i)));
        continue;
      }
      throw err;
    }
  }
}

function createPgBackend(poolInstance) {
  let pool = poolInstance || null;
  let initPromise = null;

  function ensurePool() {
    if (pool) return pool;
    let Pool;
    try {
      Pool = require('pg').Pool;
    } catch (e) {
      console.error('[DB] DB=postgres, но модуль pg не установлен. Выполни: npm i pg');
      process.exit(1);
    }
    const dbUrl = process.env.DATABASE_URL;
    const max = parseInt(process.env.PG_POOL_MAX || '20', 10);
    const min = parseInt(process.env.PG_POOL_MIN || '2', 10);
    const idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10);
    const connectionTimeoutMillis = parseInt(process.env.PG_CONNECT_TIMEOUT || '5000', 10);

    const useSsl = process.env.DATABASE_SSL === 'true' ||
      (dbUrl && dbUrl.includes('sslmode=require')) ||
      (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

    const config = {
      connectionString: dbUrl,
      max: Number.isFinite(max) && max > 0 ? max : 20,
      min: Number.isFinite(min) && min >= 0 ? min : 2,
      idleTimeoutMillis: idleTimeoutMillis,
      connectionTimeoutMillis: connectionTimeoutMillis
    };
    if (useSsl) {
      config.ssl = { rejectUnauthorized: false };
    }

    pool = new Pool(config);
    pool.on('error', (err) => {
      console.error('[DB] [PG Pool error]', err && err.message);
    });
    return pool;
  }

  async function init() {
    if (initPromise) return initPromise;
    const p = ensurePool();
    initPromise = (async () => {
      await retryPgQuery(() => p.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          yid TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_profiles_updated ON profiles(updated);
        CREATE INDEX IF NOT EXISTS idx_profiles_name ON profiles((data->>'name'));
        CREATE INDEX IF NOT EXISTS idx_profiles_level ON profiles(((data->>'level')::int));

        CREATE TABLE IF NOT EXISTS clans (
          id TEXT PRIMARY KEY,
          name TEXT UNIQUE NOT NULL,
          data JSONB NOT NULL,
          updated TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_clans_updated ON clans(updated);
        CREATE INDEX IF NOT EXISTS idx_clans_name ON clans((data->>'name'));

        CREATE TABLE IF NOT EXISTS system_state (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated TIMESTAMPTZ DEFAULT NOW()
        );
      `));
      return { ok: true, mode: 'postgres' };
    })().catch(e => {
      initPromise = null;
      console.error('[DB] Postgres init DDL error:', e && e.message);
      throw e;
    });
    return initPromise;
  }

  const backend = {
    MODE: 'postgres',
    assertProductionDatabase: assertProductionDatabase,
    init: init,
    setPool(customPool) {
      pool = customPool;
      initPromise = null;
    },
    getPool() {
      return ensurePool();
    },

    async load(yid, charId) {
      const p = ensurePool();
      const key = pkeyOf(yid, charId);
      const r = await retryPgQuery(() => p.query('SELECT data FROM profiles WHERE yid=$1', [key]));
      return r.rows && r.rows[0] ? r.rows[0].data : null;
    },

    save(yid, data, charId) {
      if (PlayerDb && PlayerDb.touch) {
        try { PlayerDb.touch(data, yid, charId); } catch (_) {}
      }
      const snapshot = JSON.parse(JSON.stringify(data));
      const key = pkeyOf(yid, charId);
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO profiles(yid, data, updated) VALUES($1, $2, NOW()) ON CONFLICT(yid) DO UPDATE SET data=$2, updated=NOW()',
          [key, snapshot]
        ));
      });
    },

    async saveBatch(items) {
      if (!items || !items.length) return;
      if (PlayerDb && PlayerDb.touch) {
        for (const it of items) {
          try { PlayerDb.touch(it.data, it.yid, it.charId); } catch (_) {}
        }
      }
      const p = ensurePool();
      const CHUNK_SIZE = 100;
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const keys = chunk.map(it => pkeyOf(it.yid, it.charId));
        const snapshots = chunk.map(it => JSON.stringify(it.data));
        await retryPgQuery(() => p.query(`
          INSERT INTO profiles (yid, data, updated)
          SELECT k, s::jsonb, NOW()
          FROM UNNEST($1::text[], $2::text[]) AS t(k, s)
          ON CONFLICT (yid) DO UPDATE SET data = EXCLUDED.data, updated = NOW()
        `, [keys, snapshots]));
      }
    },

    async listChars(yid) {
      const p = ensurePool();
      const y = String(yid);
      const r = await retryPgQuery(() => p.query(
        'SELECT yid, data FROM profiles WHERE yid=$1 OR yid LIKE $2',
        [y, y.replace(/[%_\\]/g, '\\$&') + ':%']
      ));
      const out = [];
      for (const row of (r.rows || [])) {
        const key = String(row.yid || '');
        let charId = CH.DEFAULT_CHAR_ID;
        if (key !== y) {
          if (key.indexOf(y + ':') !== 0) continue;
          charId = CH.normalizeCharId(key.slice(y.length + 1));
        }
        const sum = CH.summarize(row.data, charId);
        if (sum) out.push(sum);
      }
      out.sort((a, b) => (a.createdAt | 0) - (b.createdAt | 0) || String(a.name).localeCompare(String(a.name)));
      return out;
    },

    removeChar(yid, charId) {
      if (PlayerDb && PlayerDb.removeChar) {
        try { PlayerDb.removeChar(yid, charId); } catch (_) {}
      }
      const key = pkeyOf(yid, charId);
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query('DELETE FROM profiles WHERE yid=$1', [key]));
      });
    },

    // Кланы
    saveClan(clan) {
      if (!clan || !clan.id) return Promise.resolve();
      const id = String(clan.id);
      const name = String(clan.name || id);
      const snapshot = JSON.parse(JSON.stringify(clan));
      const key = 'clan_' + id;
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO clans(id, name, data, updated) VALUES($1, $2, $3, NOW()) ON CONFLICT(id) DO UPDATE SET name=$2, data=$3, updated=NOW()',
          [id, name, snapshot]
        ));
      });
    },

    async loadClan(id) {
      if (!id) return null;
      const p = ensurePool();
      const r = await retryPgQuery(() => p.query('SELECT data FROM clans WHERE id=$1', [String(id)]));
      return r.rows && r.rows[0] ? r.rows[0].data : null;
    },

    async loadAllClans() {
      const p = ensurePool();
      const r = await retryPgQuery(() => p.query('SELECT data FROM clans ORDER BY updated DESC'));
      return (r.rows || []).map(row => row.data).filter(Boolean);
    },

    removeClan(id) {
      if (!id) return Promise.resolve();
      const key = 'clan_' + id;
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query('DELETE FROM clans WHERE id=$1', [String(id)]));
      });
    },

    // Системное состояние / реестры
    saveSystemState(key, value) {
      const k = String(key);
      const snapshot = JSON.parse(JSON.stringify(value));
      const queueKey = 'sys_' + k;
      return enqueue(queueKey, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO system_state(key, value, updated) VALUES($1, $2, NOW()) ON CONFLICT(key) DO UPDATE SET value=$2, updated=NOW()',
          [k, snapshot]
        ));
      });
    },

    async loadSystemState(key) {
      const p = ensurePool();
      const r = await retryPgQuery(() => p.query('SELECT value FROM system_state WHERE key=$1', [String(key)]));
      return r.rows && r.rows[0] ? r.rows[0].value : null;
    },

    async healthCheck() {
      const t0 = Date.now();
      try {
        const p = ensurePool();
        await retryPgQuery(() => p.query('SELECT 1 AS ok'), 2, 20);
        return {
          ok: true,
          mode: 'postgres',
          latencyMs: Date.now() - t0,
          pool: backend.getPoolStats()
        };
      } catch (err) {
        return {
          ok: false,
          mode: 'postgres',
          latencyMs: Date.now() - t0,
          error: err.message,
          pool: backend.getPoolStats()
        };
      }
    },

    getPoolStats() {
      if (!pool) return { mode: 'postgres', initialized: false };
      return {
        mode: 'postgres',
        totalCount: pool.totalCount || 0,
        idleCount: pool.idleCount || 0,
        waitingCount: pool.waitingCount || 0,
        activeWrites: writeChains.size
      };
    },

    flush: flush,

    async close() {
      await flush();
      if (pool && typeof pool.end === 'function') {
        try {
          await pool.end();
        } catch (e) {
          console.error('[DB] error closing pg pool:', e && e.message);
        }
      }
    }
  };

  return backend;
}

let activeBackend;
if (MODE === 'postgres') {
  activeBackend = createPgBackend();
  activeBackend.init().catch(e => console.error('[DB] background init error:', e && e.message));
} else {
  activeBackend = FileBackend;
}

console.log('[DB] backend =', activeBackend.MODE);

// Экспортируем activeBackend с сохранением фабрики createPgBackend и FileBackend для гибкости и тестов
activeBackend.createPgBackend = createPgBackend;
activeBackend.FileBackend = FileBackend;
activeBackend.assertProductionDatabase = assertProductionDatabase;
module.exports = activeBackend;
