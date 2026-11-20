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
try { PlayerDb = require('./player-db.js'); } catch (_) { }
let persistenceClient = null;
try { ({ defaultClient: persistenceClient } = require('./workers/persistence-client.js')); } catch (_) { }

const DATA_DIR = path.join(__dirname, '..', 'data');
const CLANS_DIR = path.join(DATA_DIR, 'clans');
const MODE = (process.env.DB || 'file').toLowerCase();

if (MODE === 'file') {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
}

function safeName(yid) { return String(yid || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_'); }
function stemOf(yid, charId) { return CH.profileStem(safeName(yid), charId); }
function pkeyOf(yid, charId) { return CH.profileKey(yid, charId); }
function fileOf(yid, charId) { return path.join(DATA_DIR, stemOf(yid, charId) + '.json'); }
function clanFileOf(id) { return path.join(CLANS_DIR, String(id).replace(/[^a-z0-9_-]/gi, '_') + '.json'); }
function systemStateFileOf(key) { return path.join(DATA_DIR, String(key).replace(/[^a-z0-9_-]/gi, '_') + '.json'); }
/** Ревизия снимка профиля (HIGH-1). undefined — у снимка нет ревизии (старый код/тесты): пишем как раньше. */
function revOf(data) {
  const r = data && Number(data.saveRev);
  return Number.isFinite(r) && r > 0 ? r : undefined;
}
async function diskRevOf(file) {
  try {
    const cur = JSON.parse(await fs.promises.readFile(file, 'utf8'));
    const r = cur && Number(cur.saveRev);
    return Number.isFinite(r) && r > 0 ? r : 0;
  } catch (_) {
    return 0;
  }
}

// Очередь сериализации записей по ключу
const writeChains = new Map();
let tmpCounter = 0;
function noop() { }

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

async function readJsonFileWithBak(file, label) {
  try {
    return JSON.parse(await retryFs(() => fs.promises.readFile(file, 'utf8'), 4, 15));
  } catch (e) {
    if (e && e.code === 'ENOENT') return null;
    console.error('[DB] системный/клановый файл повреждён или заблокирован:', file, e && e.message);
    try {
      const bak = JSON.parse(await retryFs(() => fs.promises.readFile(file + '.bak', 'utf8'), 4, 15));
      console.error('[DB] восстановлено из .bak:', file);
      return bak;
    } catch (e2) {
      if (e2 && e2.code === 'ENOENT') {
        const err = new Error('state corrupted (no bak): ' + label + ' (' + (e && e.message) + ')');
        if (e && e.code) err.code = e.code;
        throw err;
      }
      const err = new Error('state corrupted (bak too): ' + label + ' (' + (e2 && e2.message) + ')');
      if ((e2 && e2.code) || (e && e.code)) err.code = (e2 && e2.code) || (e && e.code);
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
  const clusterWorkers = parseInt(opts.clusterWorkers != null ? opts.clusterWorkers : (process.env.CLUSTER_WORKERS || '1'), 10) || 1;
  // HIGH-2: файловая БД в кластере безопасна только когда мастер — единственный писатель
  // (CLUSTER_FILE_DB_PROXY, по умолчанию включён). Без прокси — только явный ALLOW_FILE_DB_CLUSTER=1.
  // Раньше кластер на файлах молча разрешал ALLOW_FILE_DB_IN_PROD=1, и 4 процесса писали одни и
  // те же файлы профилей без межпроцессного порядка записи.
  const clusterFileProxy = opts.clusterFileProxy != null
    ? !!opts.clusterFileProxy
    : (process.env.CLUSTER_FILE_DB_PROXY !== '0');
  const allowClusterFile = opts.allowClusterFile != null
    ? !!opts.allowClusterFile
    : (process.env.ALLOW_FILE_DB_CLUSTER === '1' || clusterFileProxy);

  if (clusterWorkers > 1 && mode === 'file' && !allowClusterFile) {
    const err = new Error(
      '[DB_FATAL] Запуск кластера с CLUSTER_WORKERS=' + clusterWorkers + ' в режиме DB=file запрещён без PostgreSQL ' +
      'из-за гонки локальных writeChains между процессами. Задайте DB=postgres и DATABASE_URL (или ALLOW_FILE_DB_IN_PROD=1 / ALLOW_FILE_DB_CLUSTER=1).'
    );
    err.code = 'ERR_CLUSTER_FILE_DB';
    throw err;
  }

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
//  Кластер (DB=file, IS_CLUSTER_WORKER=1): все чтения/записи профилей, кланов и системного
//  состояния идут через Master Gateway (единственный писатель) — межпроцессных гонок записи
//  нет: порядок задаёт одна очередь writeChains в мастере, а saveRev отсекает устаревшие снимки.
//  Если мастер недоступен (обрыв IPC / таймаут), операция выполняется локально, как раньше.
// ----------------------------------------------------------------

/** Ожидающий снимок по ключу: из нескольких сохранений в очереди пишется только самый свежий. */
const _pendingLatest = new Map();
function coalescedEnqueue(key, job) {
  const prev = _pendingLatest.get(key);
  const older = prev && Number.isFinite(prev.rev) && Number.isFinite(job.rev) && job.rev < prev.rev;
  if (!older) _pendingLatest.set(key, job);
  return enqueue(key, () => {
    const j = _pendingLatest.get(key);
    if (!j) return { ok: true, coalesced: true };
    _pendingLatest.delete(key);
    return j.run();
  });
}
async function waitChain(key) {
  const pending = writeChains.get(key);
  if (pending) {
    try { await pending; } catch (_) { }
  }
}
async function waitChainsWithPrefix(exact, prefix) {
  for (const [k, chain] of writeChains.entries()) {
    if (k === exact || k.startsWith(prefix)) {
      try { await chain; } catch (_) { }
    }
  }
}

// Кэш листинга каталога data/: listChars на каждом логине раньше делал полный readdir
// (O(число профилей)). Поколение листинга сбрасывается при постановке и завершении записи/удаления
// профиля в этом процессе; TTL ограничивает устаревание от записей других процессов.
// Включён в production (DB_DIR_CACHE=0 — выключить, DB_DIR_CACHE=1 — включить и вне production).
const DIR_CACHE_TTL_MS = 1000;
function dirCacheOn() {
  const v = process.env.DB_DIR_CACHE;
  if (v === '0') return false;
  if (v === '1') return true;
  return process.env.NODE_ENV === 'production';
}
let _dirGen = 0;
let _dirCache = null; // { gen, at, names: Promise<string[]> }
let _knownNames = null; // Set имён из последнего листинга: запись в уже известный файл листинг не меняет
function bumpDirGen() { _dirGen++; _dirCache = null; }
/** Отметить запись/удаление файла профиля: листинг сбрасывается, если файл мог появиться/исчезнуть. */
function trackDirChange(promise, file, isRemove) {
  const base = file ? path.basename(file) : '';
  if (isRemove && base && _knownNames) _knownNames.delete(base);
  const mayChange = isRemove || !base || !_knownNames || !_knownNames.has(base);
  if (mayChange) {
    bumpDirGen();
    if (promise && typeof promise.then === 'function') promise.then(bumpDirGen, bumpDirGen);
  }
  return promise;
}
function readDataDirCached() {
  if (!dirCacheOn()) return fs.promises.readdir(DATA_DIR);
  const now = Date.now();
  if (_dirCache && _dirCache.gen === _dirGen && now - _dirCache.at < DIR_CACHE_TTL_MS) return _dirCache.names;
  const names = fs.promises.readdir(DATA_DIR);
  const entry = { gen: _dirGen, at: now, names };
  _dirCache = entry;
  names.then((list) => { if (_dirCache === entry) _knownNames = new Set(list); },
    () => { if (_dirCache === entry) _dirCache = null; });
  return names;
}

let _clusterHub = null;
let _proxyWarnAt = 0;
function clusterProxyOn() {
  return MODE === 'file' &&
    process.env.IS_CLUSTER_WORKER === '1' &&
    process.env.CLUSTER_FILE_DB_PROXY !== '0' &&
    !!_clusterHub && typeof _clusterHub.dbRequest === 'function';
}
/** Операция в мастере; транспортный сбой → локальное выполнение, ошибка бэкенда мастера → пробрасывается. */
async function viaMaster(op, args, local) {
  if (!clusterProxyOn()) return local();
  try {
    return await _clusterHub.dbRequest(op, args);
  } catch (e) {
    if (e && e.remote) throw e;
    const now = Date.now();
    if (now - _proxyWarnAt > 10000) {
      _proxyWarnAt = now;
      console.warn('[DB] мастер недоступен для', op, '— выполняю локально:', e && e.message);
    }
    return local();
  }
}

const FileBackend = {
  MODE: 'file',
  writeChains: writeChains,
  useWorker: true,
  persistenceClient: persistenceClient,
  assertProductionDatabase: assertProductionDatabase,
  async init() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
    return { ok: true, mode: 'file' };
  },

  /** Подключить IPC воркера кластера: дальше файловые операции идут через мастер. */
  attachClusterIpc(hub) {
    _clusterHub = hub || null;
    return clusterProxyOn();
  },
  isClusterProxyActive() {
    return clusterProxyOn();
  },

  // ---- Профили ----
  async load(yid, charId) {
    if (clusterProxyOn()) {
      await waitChain(stemOf(yid, charId));
      return viaMaster('loadProfile', [yid, charId], () => FileBackend._loadProfileRaw(yid, charId));
    }
    return FileBackend._loadProfileRaw(yid, charId);
  },
  async _loadProfileRaw(yid, charId) {
    const stem = stemOf(yid, charId);
    const pending = writeChains.get(stem) || writeChains.get(pkeyOf(yid, charId));
    if (pending) {
      try { await pending; } catch (_) { }
    }
    const file = fileOf(yid, charId);
    return readProfileFile(file, stem);
  },
  save(yid, data, charId) {
    if (PlayerDb && PlayerDb.touch) {
      try { PlayerDb.touch(data, yid, charId); } catch (_) { }
    }
    if (clusterProxyOn()) {
      const stem = stemOf(yid, charId);
      const file = fileOf(yid, charId);
      const rev = revOf(data);
      return coalescedEnqueue(stem, {
        rev,
        run: () => viaMaster('saveProfile', [yid, data, charId], () => trackDirChange(FileBackend._writeJson(file, stem, data, rev), file))
      });
    }
    return FileBackend._saveProfileRaw(yid, data, charId);
  },
  /** Запись профиля в этом процессе (без PlayerDb.touch): общий путь мастера и одиночного сервера. */
  _saveProfileRaw(yid, data, charId) {
    const stem = stemOf(yid, charId);
    const file = fileOf(yid, charId);
    const rev = revOf(data);
    return trackDirChange(coalescedEnqueue(stem, { rev, run: () => FileBackend._writeJson(file, stem, data, rev) }), file);
  },
  async saveBatch(items) {
    if (!items || !items.length) return;
    await Promise.all(items.map(it => FileBackend.save(it.yid, it.data, it.charId)));
  },
  /** Атомарная запись JSON (worker thread или inline) с проверкой ревизии. */
  _writeJson(file, label, payload, rev) {
    const client = FileBackend.persistenceClient || persistenceClient;
    if (FileBackend.useWorker !== false && client && typeof client.writeAtomic === 'function' && client.isWorkerActive()) {
      return client.writeAtomic(file, { payload, label, makeBak: true, rev });
    }
    return FileBackend._writeNow(file, label, JSON.stringify(payload), { rev });
  },
  async _writeNow(file, label, jsonOrData, extra) {
    const rev = extra && Number.isFinite(extra.rev) ? extra.rev : undefined;
    const client = FileBackend.persistenceClient || persistenceClient;
    if (FileBackend.useWorker !== false && client && typeof client.writeAtomic === 'function') {
      const opts = typeof jsonOrData === 'string'
        ? { json: jsonOrData, label, makeBak: true, rev }
        : { payload: jsonOrData, label, makeBak: true, rev };
      return client.writeAtomic(file, opts);
    }
    const json = typeof jsonOrData === 'string' ? jsonOrData : JSON.stringify(jsonOrData);
    const tmp = file + '.tmp.' + process.pid + '.' + (++tmpCounter).toString(36);
    let fh = null;
    try {
      fh = await fs.promises.open(tmp, 'w');
      await fh.writeFile(json, 'utf8');
      await fh.sync();
      await fh.close();
      fh = null;
      if (rev !== undefined) {
        const onDisk = await diskRevOf(file);
        if (onDisk > rev) {
          try { await fs.promises.unlink(tmp); } catch (_) { }
          return { ok: true, skipped: 'stale_rev', file, rev, diskRev: onDisk };
        }
      }
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
      if (fh) { try { await fh.close(); } catch (_) { } }
      try { await fs.promises.unlink(tmp); } catch (_) { }
      console.error('[DB] save error', label, e && e.message);
      throw e;
    }
  },
  async listChars(yid) {
    if (clusterProxyOn()) {
      const y = safeName(yid);
      await waitChainsWithPrefix(y, y + '.');
      return viaMaster('listChars', [yid], () => FileBackend._listCharsRaw(yid));
    }
    return FileBackend._listCharsRaw(yid);
  },
  async _listCharsRaw(yid) {
    const y = safeName(yid);
    const prefix = y + '.';
    await waitChainsWithPrefix(y, prefix);
    const out = [];
    let names;
    try { names = await readDataDirCached(); }
    catch (e) {
      // SEC: ошибка чтения каталога (EMFILE/EACCES) — не «персонажей нет»: пустой список
      // открывал TOFU-вход в чужой гостевой аккаунт. Только отсутствие каталога = пусто.
      if (e && e.code === 'ENOENT') return out;
      throw e;
    }
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
    out.sort((a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || String(a.name).localeCompare(String(b.name)));
    return out;
  },
  removeChar(yid, charId) {
    if (PlayerDb && PlayerDb.removeChar) {
      try { PlayerDb.removeChar(yid, charId); } catch (_) { }
    }
    if (clusterProxyOn()) {
      const stem = stemOf(yid, charId);
      const file = fileOf(yid, charId);
      _pendingLatest.delete(stem); // ожидающий сейв удалённого слота не должен его воскресить
      return enqueue(stem, () => viaMaster('removeChar', [yid, charId], () => trackDirChange(FileBackend._unlinkWithBak(file), file, true)));
    }
    return FileBackend._removeCharRaw(yid, charId);
  },
  _removeCharRaw(yid, charId) {
    const stem = stemOf(yid, charId);
    const file = fileOf(yid, charId);
    _pendingLatest.delete(stem);
    return trackDirChange(enqueue(stem, () => FileBackend._unlinkWithBak(file)), file, true);
  },
  async _unlinkWithBak(file) {
    if (persistenceClient && typeof persistenceClient.unlink === 'function') {
      return persistenceClient.unlink(file, { makeBak: true });
    }
    try { await fs.promises.unlink(file); } catch (e) { if (e && e.code !== 'ENOENT') throw e; }
    try { await fs.promises.unlink(file + '.bak'); } catch (_) { }
  },

  // ---- Кланы ----
  saveClan(clan) {
    if (!clan || !clan.id) return Promise.resolve();
    if (clusterProxyOn()) {
      const key = 'clan_' + clan.id;
      const file = clanFileOf(clan.id);
      return coalescedEnqueue(key, {
        run: () => viaMaster('saveClan', [clan], () => FileBackend._writeJson(file, key, clan))
      });
    }
    return FileBackend._saveClanRaw(clan);
  },
  _saveClanRaw(clan) {
    if (!clan || !clan.id) return Promise.resolve();
    if (!fs.existsSync(CLANS_DIR)) fs.mkdirSync(CLANS_DIR, { recursive: true });
    const key = 'clan_' + clan.id;
    const file = clanFileOf(clan.id);
    return coalescedEnqueue(key, { run: () => FileBackend._writeJson(file, key, clan) });
  },
  async loadClan(id) {
    if (!id) return null;
    if (clusterProxyOn()) {
      await waitChain('clan_' + id);
      return viaMaster('loadClan', [id], () => FileBackend._loadClanRaw(id));
    }
    return FileBackend._loadClanRaw(id);
  },
  async _loadClanRaw(id) {
    if (!id) return null;
    await waitChain('clan_' + id);
    const file = clanFileOf(id);
    return readJsonFileWithBak(file, 'clan_' + id);
  },
  async loadAllClans() {
    if (clusterProxyOn()) {
      await waitChainsWithPrefix('', 'clan_');
      return viaMaster('loadAllClans', [], () => FileBackend._loadAllClansRaw());
    }
    return FileBackend._loadAllClansRaw();
  },
  async _loadAllClansRaw() {
    const list = [];
    if (!fs.existsSync(CLANS_DIR)) return list;
    let files = [];
    try { files = await fs.promises.readdir(CLANS_DIR); } catch (_) { return list; }
    for (const f of files) {
      if (!/\.json$/i.test(f)) continue;
      const clanId = f.slice(0, -5);
      await waitChain('clan_' + clanId);
      try {
        const raw = await readJsonFileWithBak(path.join(CLANS_DIR, f), 'clan_' + clanId);
        if (raw && raw.id) list.push(raw);
      } catch (e) {
        console.error('[DB] не удалось загрузить клан', f, e && e.message);
      }
    }
    return list;
  },
  removeClan(id) {
    if (!id) return Promise.resolve();
    if (clusterProxyOn()) {
      const key = 'clan_' + id;
      const file = clanFileOf(id);
      _pendingLatest.delete(key);
      return enqueue(key, () => viaMaster('removeClan', [id], () => FileBackend._unlinkWithBak(file)));
    }
    return FileBackend._removeClanRaw(id);
  },
  _removeClanRaw(id) {
    if (!id) return Promise.resolve();
    const key = 'clan_' + id;
    const file = clanFileOf(id);
    _pendingLatest.delete(key);
    return enqueue(key, () => FileBackend._unlinkWithBak(file));
  },

  // ---- Системное состояние / реестры ----
  saveSystemState(key, value) {
    if (clusterProxyOn()) {
      const k = 'sys_' + key;
      const file = systemStateFileOf(key);
      return coalescedEnqueue(k, {
        run: () => viaMaster('saveSystemState', [key, value], () => FileBackend._writeJson(file, k, value))
      });
    }
    return FileBackend._saveSystemStateRaw(key, value);
  },
  _saveSystemStateRaw(key, value) {
    const k = 'sys_' + key;
    const file = systemStateFileOf(key);
    return coalescedEnqueue(k, { run: () => FileBackend._writeJson(file, k, value) });
  },
  async loadSystemState(key) {
    if (clusterProxyOn()) {
      await waitChain('sys_' + key);
      return viaMaster('loadSystemState', [key], () => FileBackend._loadSystemStateRaw(key));
    }
    return FileBackend._loadSystemStateRaw(key);
  },
  async _loadSystemStateRaw(key) {
    await waitChain('sys_' + key);
    const file = systemStateFileOf(key);
    return readJsonFileWithBak(file, 'sys_' + key);
  },

  async healthCheck() {
    const t0 = Date.now();
    try {
      await fs.promises.access(DATA_DIR, fs.constants.R_OK | fs.constants.W_OK);
      return { ok: true, mode: 'file', latencyMs: Date.now() - t0, clusterProxy: clusterProxyOn() };
    } catch (err) {
      return { ok: false, mode: 'file', latencyMs: Date.now() - t0, error: err.message };
    }
  },
  getPoolStats() {
    return { mode: 'file', activeWrites: writeChains.size, pendingSnapshots: _pendingLatest.size, clusterProxy: clusterProxyOn() };
  },
  flush: flush,
  close: flush
};

/**
 * Обработчик запросов воркеров в Master Gateway (единственный писатель файловой БД).
 * Только белый список операций; touch PlayerDb воркер делает у себя (как раньше).
 */
const CLUSTER_DB_OPS = {
  saveProfile: (yid, data, charId) => FileBackend._saveProfileRaw(yid, data, charId),
  loadProfile: (yid, charId) => FileBackend._loadProfileRaw(yid, charId),
  listChars: (yid) => FileBackend._listCharsRaw(yid),
  removeChar: (yid, charId) => FileBackend._removeCharRaw(yid, charId),
  saveClan: (clan) => FileBackend._saveClanRaw(clan),
  loadClan: (id) => FileBackend._loadClanRaw(id),
  loadAllClans: () => FileBackend._loadAllClansRaw(),
  removeClan: (id) => FileBackend._removeClanRaw(id),
  saveSystemState: (key, value) => FileBackend._saveSystemStateRaw(key, value),
  loadSystemState: (key) => FileBackend._loadSystemStateRaw(key)
};
async function handleClusterDbRequest(op, args) {
  const fn = Object.prototype.hasOwnProperty.call(CLUSTER_DB_OPS, op) ? CLUSTER_DB_OPS[op] : null;
  if (!fn) {
    const e = new Error('unknown db op: ' + String(op).slice(0, 40));
    e.code = 'ERR_DB_OP';
    throw e;
  }
  if (MODE !== 'file') {
    const e = new Error('cluster db proxy is file-mode only');
    e.code = 'ERR_DB_MODE';
    throw e;
  }
  return fn.apply(null, Array.isArray(args) ? args : []);
}

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

// HIGH-1: снимок с ревизией saveRev не перезаписывает более свежую ревизию в БД.
// Снимки без ревизии (старые вызовы, новые персонажи) пишутся как раньше.
const PG_REV_OF = (col) => `(CASE WHEN (${col}->>'saveRev') ~ '^[0-9]{1,15}$' THEN (${col}->>'saveRev')::bigint ELSE NULL END)`;
const PG_PROFILE_REV_GUARD = `WHERE ${PG_REV_OF('EXCLUDED.data')} IS NULL OR COALESCE(${PG_REV_OF('profiles.data')}, 0) <= ${PG_REV_OF('EXCLUDED.data')}`;

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
    const defaultPoolMax = process.env.IS_CLUSTER_WORKER === '1' ? '8' : '20';
    const max = parseInt(process.env.PG_POOL_MAX || defaultPoolMax, 10);
    const min = parseInt(process.env.PG_POOL_MIN || '2', 10);
    const idleTimeoutMillis = parseInt(process.env.PG_IDLE_TIMEOUT || '30000', 10);
    const connectionTimeoutMillis = parseInt(process.env.PG_CONNECT_TIMEOUT || '5000', 10);

    const useSsl = process.env.DATABASE_SSL === 'true' ||
      (dbUrl && dbUrl.includes('sslmode=require')) ||
      (process.env.NODE_ENV === 'production' && process.env.DATABASE_SSL !== 'false');

    const config = {
      connectionString: dbUrl,
      max: Number.isFinite(max) && max > 0 ? max : (process.env.IS_CLUSTER_WORKER === '1' ? 8 : 20),
      min: Number.isFinite(min) && min >= 0 ? min : 2,
      idleTimeoutMillis: idleTimeoutMillis,
      connectionTimeoutMillis: connectionTimeoutMillis
    };
    if (useSsl) {
      if (process.env.PG_CA_CERT && fs.existsSync(process.env.PG_CA_CERT)) {
        config.ssl = {
          rejectUnauthorized: true,
          ca: fs.readFileSync(process.env.PG_CA_CERT, 'utf8')
        };
      } else if (process.env.PG_SSL_STRICT === '1' || (process.env.NODE_ENV === 'production' && process.env.PG_SSL_INSECURE !== '1')) {
        config.ssl = { rejectUnauthorized: true };
      } else {
        config.ssl = { rejectUnauthorized: false };
      }
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
    writeChains: writeChains,
    useWorker: true,
    persistenceClient: persistenceClient,
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
      const key = pkeyOf(yid, charId);
      const pending = writeChains.get(key);
      if (pending) {
        try { await pending; } catch (_) { }
      }
      const p = ensurePool();
      const r = await retryPgQuery(() => p.query('SELECT data FROM profiles WHERE yid=$1', [key]));
      return r.rows && r.rows[0] ? r.rows[0].data : null;
    },

    save(yid, data, charId) {
      if (PlayerDb && PlayerDb.touch) {
        try { PlayerDb.touch(data, yid, charId); } catch (_) { }
      }
      const key = pkeyOf(yid, charId);
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO profiles(yid, data, updated) VALUES($1, $2, NOW()) ON CONFLICT(yid) DO UPDATE SET data=EXCLUDED.data, updated=NOW() ' + PG_PROFILE_REV_GUARD,
          [key, data]
        ));
      });
    },

    async saveBatch(items) {
      if (!items || !items.length) return;
      const dedupMap = new Map();
      for (const it of items) {
        if (!it || !it.yid) continue;
        if (PlayerDb && PlayerDb.touch) {
          try { PlayerDb.touch(it.data, it.yid, it.charId); } catch (_) { }
        }
        const key = pkeyOf(it.yid, it.charId);
        dedupMap.set(key, it);
      }
      const uniqueItems = [...dedupMap.entries()];
      if (!uniqueItems.length) return;

      const allKeys = uniqueItems.map(([k]) => k);
      const prevChains = [];
      for (const k of allKeys) {
        const prev = writeChains.get(k);
        if (prev) prevChains.push(prev);
      }

      let releaseBatch;
      const gate = new Promise((r) => { releaseBatch = r; });
      const registeredChains = new Map();
      for (const k of allKeys) {
        const prev = writeChains.get(k) || Promise.resolve();
        const chained = prev.then(() => gate, () => gate);
        registeredChains.set(k, chained);
        writeChains.set(k, chained);
      }

      try {
        if (prevChains.length > 0) {
          await Promise.allSettled(prevChains);
        }
        const p = ensurePool();
        const CHUNK_SIZE = 100;
        const client = backend.persistenceClient || persistenceClient;
        const preparedChunks = [];
        for (let i = 0; i < uniqueItems.length; i += CHUNK_SIZE) {
          const chunk = uniqueItems.slice(i, i + CHUNK_SIZE);
          const keys = chunk.map(([k]) => k);
          const payloads = chunk.map(([, it]) => it.data);
          const snapshots = (backend.useWorker !== false && client && typeof client.stringifyBatch === 'function')
            ? await client.stringifyBatch(payloads)
            : payloads.map(d => JSON.stringify(d));
          preparedChunks.push({ keys, snapshots });
        }

        await retryPgQuery(async () => {
          const pgClient = (typeof p.connect === 'function') ? await p.connect() : p;
          try {
            await pgClient.query('BEGIN');
            for (const { keys, snapshots } of preparedChunks) {
              await pgClient.query(`
                INSERT INTO profiles (yid, data, updated)
                SELECT k, s::jsonb, NOW()
                FROM UNNEST($1::text[], $2::text[]) AS t(k, s)
                ON CONFLICT (yid) DO UPDATE SET data = EXCLUDED.data, updated = NOW()
                ${PG_PROFILE_REV_GUARD}
              `, [keys, snapshots]);
            }
            await pgClient.query('COMMIT');
          } catch (txErr) {
            try { await pgClient.query('ROLLBACK'); } catch (_) { }
            throw txErr;
          } finally {
            if (pgClient !== p && typeof pgClient.release === 'function') {
              pgClient.release();
            }
          }
        });
      } finally {
        releaseBatch();
        for (const [k, ch] of registeredChains.entries()) {
          if (writeChains.get(k) === ch) {
            writeChains.delete(k);
          }
        }
      }
    },

    async listChars(yid) {
      const y = String(yid);
      const prefix = y + ':';
      for (const [k, chain] of writeChains.entries()) {
        if (k === y || k.startsWith(prefix)) {
          try { await chain; } catch (_) { }
        }
      }
      const p = ensurePool();
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
      out.sort((a, b) => ((a.createdAt || 0) - (b.createdAt || 0)) || String(a.name).localeCompare(String(b.name)));
      return out;
    },

    removeChar(yid, charId) {
      if (PlayerDb && PlayerDb.removeChar) {
        try { PlayerDb.removeChar(yid, charId); } catch (_) { }
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
      const key = 'clan_' + id;
      return enqueue(key, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO clans(id, name, data, updated) VALUES($1, $2, $3, NOW()) ON CONFLICT(id) DO UPDATE SET name=$2, data=$3, updated=NOW()',
          [id, name, clan]
        ));
      });
    },

    async loadClan(id) {
      if (!id) return null;
      const pending = writeChains.get('clan_' + String(id));
      if (pending) {
        try { await pending; } catch (_) { }
      }
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
      const queueKey = 'sys_' + k;
      return enqueue(queueKey, async () => {
        const p = ensurePool();
        return retryPgQuery(() => p.query(
          'INSERT INTO system_state(key, value, updated) VALUES($1, $2, NOW()) ON CONFLICT(key) DO UPDATE SET value=$2, updated=NOW()',
          [k, value]
        ));
      });
    },

    async loadSystemState(key) {
      const pending = writeChains.get('sys_' + String(key));
      if (pending) {
        try { await pending; } catch (_) { }
      }
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
// Кластерный прокси файловой БД (воркер → мастер). Для PostgreSQL — no-op.
if (typeof activeBackend.attachClusterIpc !== 'function') activeBackend.attachClusterIpc = () => false;
if (typeof activeBackend.isClusterProxyActive !== 'function') activeBackend.isClusterProxyActive = () => false;
activeBackend.handleClusterDbRequest = handleClusterDbRequest;
module.exports = activeBackend;
