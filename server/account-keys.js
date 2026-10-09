// ============================================================
//  SERVER / ACCOUNT-KEYS.JS — Реестр кодовых слов для гостевых аккаунтов.
//  Позволяет незарегистрированным игрокам входить с разных браузеров/ПК.
//  Строго «Без дублей» (1:1 соответствие yid <-> hash) и 1 окно в игре.
// ============================================================
'use strict';

const crypto = require('crypto');
const util = require('util');
const DB = require('./db.js');
const AUTH = require('./auth.js');
const GuestAuth = require('./guest-auth.js');

const pbkdf2Async = util.promisify(crypto.pbkdf2);
const scryptAsync = util.promisify(crypto.scrypt);

const MIN_CODE_LEN = 6;
const MAX_CODE_LEN = 64;

// ------------------------------------------------------------
//  H2 (этап 4.3): логин отдельно от секрета.
//  Новые аккаунты: login (публичный, без учёта регистра) + ключ (секрет, С УЧЁТОМ регистра).
//  Хэш v3: HMAC-SHA256(pepper, login + key) → scrypt со случайной солью на аккаунт.
//  Старые аккаунты «только ключ» (byHash) продолжают входить по одному ключу, пока
//  KEY_ALLOW_KEYONLY != '0'; при входе с логином + старым ключом аккаунт переводится на v3.
//  Новые аккаунты без логина не создаются (dev-тесты: KEY_LEGACY_CREATE=1, не в production).
// ------------------------------------------------------------
const LOGIN_RE = /^[a-z0-9_.-]{3,24}$/;
function normLogin(s) {
  const v = String(s || '').normalize('NFKC').trim().toLowerCase();
  return LOGIN_RE.test(v) ? v : '';
}
function scryptN() {
  const n = parseInt(process.env.KEY_SCRYPT_N || '16384', 10);
  return (Number.isFinite(n) && n >= 1024 && n <= 1048576 && (n & (n - 1)) === 0) ? n : 16384;
}
const keyOnlyAllowed = () => process.env.KEY_ALLOW_KEYONLY !== '0';
const legacyCreateAllowed = () => process.env.KEY_LEGACY_CREATE === '1' && process.env.NODE_ENV !== 'production';
const LOGIN_MAX_FAILS = 10;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

// ------------------------------------------------------------
//  H3 (этап 4.2): секреты — из окружения, встроенные значения — только для миграции.
//  Хэш ключа одновременно и «логин», пересчитать его без ключа нельзя, поэтому:
//   - CUR  — параметры из env (KEY_PEPPER, KEY_PREHASH_SALT, KEY_KDF_SALT, KEY_KDF_ROUNDS);
//   - OLD  — прежние параметры (KEY_*_OLD или встроенные значения до этапа 4.2);
//   ключ с OLD-хэшем принимается и при входе переписывается на CUR (ленивая миграция).
//   KEY_ALLOW_OLD_HASHES=0 — перестать принимать OLD и sha256-legacy хэши.
//  Реестр: шифруется ключом из KEY_VAULT_SECRET; при старте пробуются KEY_VAULT_SECRET_OLD и
//  встроенный — при успехе старым ключом реестр сразу перешифровывается (с бэкапом конверта).
//  В production без KEY_PEPPER и KEY_VAULT_SECRET (>= 32 символов) сервер не стартует
//  (временный обход: ALLOW_DEFAULT_KEY_SECRETS=1).
// ------------------------------------------------------------
const BUILTIN = {
  prehash: 'ps_prehash_salt_2026_steampunk',
  kdfSalt: 'ps_kdf_salt_512_rounds_2026_island',
  pepper: 'ps_secret_server_pepper_2026_unreachable',
  rounds: 25000,
  vault: 'ps_vault_master_secret_2026_aes256gcm',
  codewordSalt: 'ps_codeword_salt_2026_steampunk'
};
const envOr = (k, d) => (process.env[k] != null && process.env[k] !== '' ? process.env[k] : d);
function intEnv(k, d) { const n = parseInt(envOr(k, String(d)), 10); return Number.isFinite(n) && n >= 1000 ? n : d; }

const CUR = {
  prehash: envOr('KEY_PREHASH_SALT', BUILTIN.prehash),
  kdfSalt: envOr('KEY_KDF_SALT', BUILTIN.kdfSalt),
  pepper: envOr('KEY_PEPPER', BUILTIN.pepper),
  rounds: intEnv('KEY_KDF_ROUNDS', BUILTIN.rounds)
};
const OLD = {
  prehash: envOr('KEY_PREHASH_SALT_OLD', BUILTIN.prehash),
  kdfSalt: envOr('KEY_KDF_SALT_OLD', BUILTIN.kdfSalt),
  pepper: envOr('KEY_PEPPER_OLD', BUILTIN.pepper),
  rounds: intEnv('KEY_KDF_ROUNDS_OLD', BUILTIN.rounds)
};
const paramsId = (P) => crypto.createHash('sha256').update([P.prehash, P.kdfSalt, P.pepper, P.rounds].join('\u0000')).digest('hex').slice(0, 12);
const CUR_ID = paramsId(CUR);
const OLD_DIFFERS = paramsId(OLD) !== CUR_ID;
const allowOldHashes = () => process.env.KEY_ALLOW_OLD_HASHES !== '0';

const vaultKeyOf = (secret) => crypto.scryptSync(String(secret), 'ps_vault_storage_salt_2026', 32);
const VAULT_SECRET = envOr('KEY_VAULT_SECRET', BUILTIN.vault);
const VAULT_KEY = vaultKeyOf(VAULT_SECRET);
// Ключи, которыми пробуем расшифровать реестр (по порядку); первый — текущий.
const VAULT_KEYS = [{ id: 'current', key: VAULT_KEY }];
if (process.env.KEY_VAULT_SECRET_OLD) VAULT_KEYS.push({ id: 'old', key: vaultKeyOf(process.env.KEY_VAULT_SECRET_OLD) });
if (VAULT_SECRET !== BUILTIN.vault) VAULT_KEYS.push({ id: 'builtin', key: vaultKeyOf(BUILTIN.vault) });

/** Проверка конфигурации секретов (production — fail-closed). */
function secretsProblems() {
  const out = [];
  const pep = process.env.KEY_PEPPER || '';
  const vs = process.env.KEY_VAULT_SECRET || '';
  if (pep.length < 32) out.push('KEY_PEPPER не задан или короче 32 символов');
  if (vs.length < 32) out.push('KEY_VAULT_SECRET не задан или короче 32 символов');
  if (pep && pep === BUILTIN.pepper) out.push('KEY_PEPPER совпадает со встроенным значением');
  if (vs && vs === BUILTIN.vault) out.push('KEY_VAULT_SECRET совпадает со встроенным значением');
  return out;
}
(function enforceSecrets() {
  const probs = secretsProblems();
  if (!probs.length) return;
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEFAULT_KEY_SECRETS !== '1') {
    console.error('[AccountKeys] FATAL: секреты ключей не настроены: ' + probs.join('; ') +
      '. Сгенерируйте: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))". ' +
      'Задать их можно на живом сервере — реестр перешифруется, хэши мигрируют при входе (см. CHANGES_STAGE4.md). ' +
      'Временный обход: ALLOW_DEFAULT_KEY_SECRETS=1.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production') console.warn('[AccountKeys] ВНИМАНИЕ: ' + probs.join('; ') + ' (ALLOW_DEFAULT_KEY_SECRETS=1)');
})();

// Соль для обратной совместимости и бесшовного апгрейда старых хэшей
const LEGACY_SALT = envOr('CODEWORD_SALT', BUILTIN.codewordSalt);

function legacyHash(plain) {
  const clean = String(plain || '').trim().toLowerCase();
  return crypto.createHash('sha256').update(LEGACY_SALT + ':' + clean).digest('hex');
}

/**
 * 4-этапная криптографическая защита ключей:
 * Этап 1: Pre-hash HMAC-SHA512 (слепой детерминированный индекс и разделение доменов)
 * Этап 2: PBKDF2-HMAC-SHA512 (25 000 итераций) — иммунитет к GPU-перебору и радужным таблицам
 * Этап 3: Серверный Pepper HMAC-SHA256 — изоляция хэшей даже при полном дампе БД
 * Этап 4: Envelope-шифрование AES-256-GCM — шифрование всей базы на диске в покое
 */
function multiStageHash(plain, P) {
  P = P || CUR;
  const clean = String(plain || '').trim().toLowerCase();

  // Этап 1: Pre-hash HMAC-SHA512
  const stage1 = crypto.createHmac('sha512', P.prehash)
    .update('account_key_stage1:' + clean)
    .digest();

  // Этап 2: PBKDF2-HMAC-SHA512
  const stage2 = crypto.pbkdf2Sync(stage1, P.kdfSalt, P.rounds, 64, 'sha512');

  // Этап 3: Server Pepper HMAC-SHA256
  const stage3 = crypto.createHmac('sha256', P.pepper)
    .update('account_key_stage3:')
    .update(stage2)
    .digest('hex');

  return 'ms4_' + stage3;
}

let activeKdfJobs = 0;
const MAX_CONCURRENT_KDF = parseInt(process.env.MAX_CONCURRENT_KDF || '3', 10);
const MAX_KDF_QUEUE = parseInt(process.env.MAX_KDF_QUEUE || '10', 10);
const kdfQueue = [];

function runNextKdfJob() {
  if (activeKdfJobs >= MAX_CONCURRENT_KDF || kdfQueue.length === 0) return;
  const next = kdfQueue.shift();
  activeKdfJobs++;
  next.fn()
    .then(next.resolve, next.reject)
    .finally(() => {
      activeKdfJobs--;
      runNextKdfJob();
    });
}

function queueKdfJob(fn) {
  return new Promise((resolve, reject) => {
    if (activeKdfJobs >= MAX_CONCURRENT_KDF && kdfQueue.length >= MAX_KDF_QUEUE) {
      const err = new Error('kdf concurrency limit exceeded');
      err.code = 'ERR_KDF_BUSY';
      return reject(err);
    }
    kdfQueue.push({ fn, resolve, reject });
    runNextKdfJob();
  });
}

async function multiStageHashAsync(plain, P) {
  P = P || CUR;
  return queueKdfJob(async () => {
    const clean = String(plain || '').trim().toLowerCase();

    // Этап 1: Pre-hash HMAC-SHA512
    const stage1 = crypto.createHmac('sha512', P.prehash)
      .update('account_key_stage1:' + clean)
      .digest();

    // Этап 2: Асинхронный PBKDF2 без блокировки Event Loop
    const stage2 = await pbkdf2Async(stage1, P.kdfSalt, P.rounds, 64, 'sha512');

    // Этап 3: Server Pepper HMAC-SHA256
    const stage3 = crypto.createHmac('sha256', P.pepper)
      .update('account_key_stage3:')
      .update(stage2)
      .digest('hex');

    return 'ms4_' + stage3;
  });
}

// H2: хэш v3 (логин + ключ, соль на аккаунт, scrypt). Регистр ключа сохраняется.
const pepperId = (P) => crypto.createHash('sha256').update('pep\u0000' + P.pepper).digest('hex').slice(0, 12);
const CUR_PEP = pepperId(CUR);
const OLD_PEP = pepperId(OLD);

async function hashV3(login, key, saltHex, P, N) {
  P = P || CUR;
  N = N || scryptN();
  return queueKdfJob(async () => {
    const pre = crypto.createHmac('sha256', P.pepper)
      .update('account_key_v3\u0000' + login + '\u0000' + String(key))
      .digest();
    const out = await scryptAsync(pre, Buffer.from(saltHex, 'hex'), 32, { N, r: 8, p: 1, maxmem: 256 * N * 8 + 1024 * 1024 });
    return 'sc1$' + N + '$' + out.toString('hex');
  });
}

/** @returns {Promise<null|{rehash:boolean}>} */
async function verifyV3(entry, key) {
  let P = null;
  if (entry.pp === CUR_PEP) P = CUR;
  else if (entry.pp === OLD_PEP && allowOldHashes()) P = OLD;
  if (!P || typeof entry.h !== 'string' || typeof entry.salt !== 'string') return null;
  const parts = entry.h.split('$');
  const N = parseInt(parts[1], 10);
  if (parts[0] !== 'sc1' || !N) return null;
  const got = await hashV3(entry.login, key, entry.salt, P, N);
  const a = Buffer.from(got), b = Buffer.from(entry.h);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { rehash: P !== CUR || N !== scryptN() };
}

// Список тривиальных паролей и проверка сложности
const TRIVIAL_PASSWORDS = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890',
  '654321', '987654', '987654321',
  '111111', '222222', '333333', '444444', '555555', '666666', '777777', '888888', '999999', '000000',
  'qwerty', 'qwertz', 'asdfgh', 'zxcvbn', 'password', 'passwd', 'admin123',
  'йцукен', 'фывапр', 'ячсмит', 'пароль', '123123', '112233', '121212', 'admin'
]);

function isWeakCodeword(code) {
  const lower = String(code || '').toLowerCase().trim();
  if (TRIVIAL_PASSWORDS.has(lower)) return true;
  // Все одинаковые символы: e.g. "aaaaaa", "111111"
  if (/^(.)\1+$/.test(lower)) return true;
  // Базовые последовательности цифр
  if (/^(012345|123456|234567|345678|456789|567890|654321|765432|876543|987654)$/.test(lower)) return true;
  return false;
}

// Проверка допустимых символов: строго английские буквы, цифры и спецсимволы ASCII (без русских/кириллических букв)
function hasInvalidKeyChars(code) {
  const str = String(code || '');
  // Запрещены русские/кириллические буквы (диапазон \u0400-\u04FF)
  if (/[\u0400-\u04FF]/.test(str)) return true;
  // Разрешены только печатные символы ASCII (буквы a-z/A-Z, цифры 0-9, пробел и спецсимволы 32-126)
  if (!/^[\x20-\x7E]+$/.test(str)) return true;
  return false;
}

// Rate limiting: макс 5 ошибок за 5 минут на IP
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

class AccountKeyManager {
  constructor() {
    this.byHash = new Map(); // hash -> { yid, createdAt, updatedAt }
    this.byYid = new Map();  // yid -> hash (старый формат) | 'login:<login>' (v3)
    this.byLogin = new Map(); // login -> { yid, login, salt, h, pp, ... } (v3, H2)
    this.loginFails = new Map(); // login -> { count, lastAt, lockedUntil }
    this.failedAttempts = new Map(); // ip -> { count, lockedUntil }
    this.initialized = false;
    // FIX: если реестр не удалось прочитать/расшифровать — запись запрещена. Иначе первая же
    // регистрация ключа сохраняла ПУСТОЙ реестр поверх настоящего (все игроки теряли ключи).
    this.loadFailed = false;
  }

  hash(plainCodeword) {
    return multiStageHash(plainCodeword);
  }

  async hashAsync(plainCodeword) {
    return multiStageHashAsync(plainCodeword);
  }

  legacyHash(plainCodeword) {
    return legacyHash(plainCodeword);
  }

  multiStageHash(plainCodeword) {
    return multiStageHash(plainCodeword);
  }

  async multiStageHashAsync(plainCodeword) {
    return multiStageHashAsync(plainCodeword);
  }

  async init() {
    try {
      const stored = await DB.loadSystemState('account_keys');
      this.byHash.clear();
      this.byYid.clear();
      this.byLogin.clear();

      if (!stored || typeof stored !== 'object') {
        this.initialized = true;
        return { ok: true, count: 0 };
      }

      let payload = null;
      let reencryptFrom = null;

      // Этап 4: Верификация и дешифрование конверта AES-256-GCM
      if (stored.v === 2 && stored.enc === 'aes-256-gcm' && stored.data && stored.iv && stored.tag) {
        // H3: пробуем текущий ключ, затем KEY_VAULT_SECRET_OLD и встроенный (миграция)
        let lastErr = null;
        for (const vk of VAULT_KEYS) {
          try {
            const iv = Buffer.from(stored.iv, 'hex');
            const decipher = crypto.createDecipheriv('aes-256-gcm', vk.key, iv);
            decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
            let decrypted = decipher.update(stored.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            payload = JSON.parse(decrypted);
            if (vk.id !== 'current') reencryptFrom = vk.id;
            break;
          } catch (decryptErr) { lastErr = decryptErr; payload = null; }
        }
        if (!payload) {
          console.error('[AccountKeys] GCM decryption / auth tag verification failed (ни один ключ не подошёл):', lastErr && lastErr.message);
          this.initialized = true;
          this.loadFailed = true; // неверный KEY_VAULT_SECRET или повреждение — не перезаписываем
          return { ok: false, error: 'vault_corrupted' };
        }
      } else if (stored.byHash) {
        // Legacy открытый JSON: загружаем и сразу шифруем
        payload = stored;
        reencryptFrom = 'plaintext';
      }

      if (payload && payload.byHash && typeof payload.byHash === 'object') {
        for (const [h, entry] of Object.entries(payload.byHash)) {
          if (entry && entry.yid) {
            const e = {
              yid: String(entry.yid),
              createdAt: Number(entry.createdAt) || Date.now(),
              updatedAt: Number(entry.updatedAt) || Date.now()
            };
            if (typeof entry.p === 'string') e.p = entry.p;
            if (Array.isArray(entry.tokens)) e.tokens = entry.tokens.filter(x => typeof x === 'string').slice(0, 20);
            if (Array.isArray(entry.legacyKeyHashes)) e.legacyKeyHashes = entry.legacyKeyHashes.filter(x => typeof x === 'string').slice(0, 4);
            this.byHash.set(h, e);
            this.byYid.set(String(entry.yid), h);
          }
        }
      }
      if (payload && payload.accounts && typeof payload.accounts === 'object') {
        for (const [login, a] of Object.entries(payload.accounts)) {
          if (!a || !a.yid || !normLogin(login) || typeof a.h !== 'string' || typeof a.salt !== 'string') continue;
          const e = {
            yid: String(a.yid), login, salt: a.salt, h: a.h, pp: String(a.pp || ''),
            createdAt: Number(a.createdAt) || Date.now(),
            updatedAt: Number(a.updatedAt) || Date.now()
          };
          if (Array.isArray(a.tokens)) e.tokens = a.tokens.filter(x => typeof x === 'string').slice(0, 20);
          if (Array.isArray(a.legacyKeyHashes)) e.legacyKeyHashes = a.legacyKeyHashes.filter(x => typeof x === 'string').slice(0, 4);
          // старая запись того же yid (если осталась) уступает v3
          const prev = this.byYid.get(e.yid);
          if (prev && !prev.startsWith('login:')) this.byHash.delete(prev);
          this.byLogin.set(login, e);
          this.byYid.set(e.yid, 'login:' + login);
        }
      }

      this.initialized = true;
      this.loadFailed = false;
      if (reencryptFrom) {
        if (process.env.IS_CLUSTER_WORKER === '1') {
          console.warn('[AccountKeys] реестр зашифрован старым ключом (' + reencryptFrom + ') — перешифрует мастер-процесс');
        } else {
          try {
            // бэкап исходного конверта до перешифровки
            await DB.saveSystemState('account_keys_backup_' + reencryptFrom, Object.assign({ backedUpAt: Date.now() }, stored));
            await this._persist();
            console.warn('[AccountKeys] реестр перешифрован текущим KEY_VAULT_SECRET (был: ' + reencryptFrom + '), бэкап: account_keys_backup_' + reencryptFrom);
          } catch (eRe) {
            console.error('[AccountKeys] перешифровка реестра не удалась (данные не тронуты):', eRe && eRe.message);
          }
        }
      }
      const st = this.hashStats();
      if (OLD_DIFFERS || st.old) console.log('[AccountKeys] ключей на текущих параметрах: ' + st.current + ' из ' + st.total + (allowOldHashes() ? '' : ' (старые хэши отключены KEY_ALLOW_OLD_HASHES=0)'));
      if (st.total) console.log('[AccountKeys] аккаунтов с логином: ' + st.withLogin + ' из ' + st.total + (st.keyOnly && !keyOnlyAllowed() ? ' (вход без логина отключён KEY_ALLOW_KEYONLY=0)' : ''));
      return { ok: true, count: this.byYid.size, reencrypted: reencryptFrom || undefined };
    } catch (err) {
      console.error('[AccountKeys] init error:', err && err.message);
      this.initialized = true;
      this.loadFailed = true;
      // временная ошибка БД — повторяем загрузку
      if (!this._retryTimer) {
        this._retryTimer = setTimeout(() => { this._retryTimer = null; this.init().then(r => { if (r && r.ok) console.log('[AccountKeys] реестр загружен повторно:', r.count); }); }, 10000);
        if (this._retryTimer.unref) this._retryTimer.unref();
      }
      return { ok: false, error: err && err.message };
    }
  }

  /** Сколько ключей уже на текущих параметрах хэша. */
  hashStats() {
    let current = 0;
    for (const e of this.byHash.values()) if (e && (e.p === CUR_ID || (!OLD_DIFFERS && !e.p))) current++;
    for (const e of this.byLogin.values()) if (e && e.pp === CUR_PEP) current++;
    const total = this.byHash.size + this.byLogin.size;
    return { total, current, old: total - current, paramsId: CUR_ID, withLogin: this.byLogin.size, keyOnly: this.byHash.size };
  }

  /** Запись аккаунта по yid (старый формат или v3). */
  _entryOfYid(yid) {
    const id = this.byYid.get(yid);
    if (!id) return null;
    return id.startsWith('login:') ? (this.byLogin.get(id.slice(6)) || null) : (this.byHash.get(id) || null);
  }

  /**
   * Найти запись по ключу: текущий хэш → OLD-параметры → sha256-legacy.
   * @returns {Promise<null|{entry:object, hash:string, old:boolean}>}
   */
  async _findByCode(cleanCode, targetHash) {
    let e = this.byHash.get(targetHash);
    if (e) { if (!e.p) e.p = CUR_ID; return { entry: e, hash: targetHash, old: false }; }
    if (!allowOldHashes()) return null;
    if (OLD_DIFFERS) {
      const ph = await multiStageHashAsync(cleanCode, OLD);
      e = this.byHash.get(ph);
      if (e) return { entry: e, hash: ph, old: true };
    }
    const lh = legacyHash(cleanCode);
    e = this.byHash.get(lh);
    if (e) return { entry: e, hash: lh, old: true };
    return null;
  }

  /** Перевести найденную по старому хэшу запись на текущий хэш. */
  async _upgrade(found, targetHash) {
    if (!found || !found.old || found.hash === targetHash) return;
    const entry = found.entry;
    this.byHash.delete(found.hash);
    // старый хэш нужен, чтобы в окне миграции принимались выданные от него legacy-токены
    entry.legacyKeyHashes = [found.hash].concat(Array.isArray(entry.legacyKeyHashes) ? entry.legacyKeyHashes : []).slice(0, 4);
    entry.p = CUR_ID;
    entry.updatedAt = Date.now();
    this.byHash.set(targetHash, entry);
    this.byYid.set(entry.yid, targetHash);
    await this._persist();
  }

  /** Хэши случайных токенов устройств, записанные в реестр (аккаунт с ключом). */
  tokenHashesFor(yid) {
    const e = this._entryOfYid(yid);
    return (e && Array.isArray(e.tokens)) ? e.tokens.slice() : [];
  }

  /** Изменить набор токенов аккаунта в реестре (вызывается из GuestAuth). */
  async mutateTokens(yid, mutate) {
    const e = this._entryOfYid(yid);
    if (!e || this.loadFailed) return;
    e.tokens = mutate(Array.isArray(e.tokens) ? e.tokens.slice() : []);
    await this._persist();
  }

  /** Хэши ключа аккаунта: текущий + прежние (для legacy-токенов). */
  keyHashesOf(yid) {
    const h = this.byYid.get(yid);
    if (!h) return [];
    const e = this._entryOfYid(yid);
    const base = h.startsWith('login:') ? [] : [h];
    return base.concat(e && Array.isArray(e.legacyKeyHashes) ? e.legacyKeyHashes : []);
  }

  // --- H2: лимит неудач на логин (распределённый перебор с разных IP) ---
  _loginLocked(login) {
    const r = this.loginFails.get(login);
    if (!r) return 0;
    const now = Date.now();
    if (r.lockedUntil > now) return Math.ceil((r.lockedUntil - now) / 1000);
    if (now - r.lastAt > LOGIN_LOCK_MS) this.loginFails.delete(login);
    return 0;
  }
  _loginFail(login) {
    const now = Date.now();
    let r = this.loginFails.get(login);
    if (!r || now - r.lastAt > LOGIN_LOCK_MS || (r.lockedUntil && r.lockedUntil <= now)) r = { count: 0, lastAt: now, lockedUntil: 0 };
    r.count++; r.lastAt = now;
    if (r.count >= LOGIN_MAX_FAILS) r.lockedUntil = now + LOGIN_LOCK_MS;
    this.loginFails.set(login, r);
    if (this.loginFails.size > 50000) for (const [k, v] of this.loginFails) if (now - v.lastAt > LOGIN_LOCK_MS) this.loginFails.delete(k);
  }

  /** Записать аккаунт v3 (новый или переводимый со старого формата). */
  async _setV3(entry, login, key) {
    const salt = crypto.randomBytes(16).toString('hex');
    const h = await hashV3(login, key, salt, CUR);
    if (entry.login && entry.login !== login) this.byLogin.delete(entry.login);
    entry.login = login; entry.salt = salt; entry.h = h; entry.pp = CUR_PEP;
    delete entry.p;
    entry.updatedAt = Date.now();
    this.byLogin.set(login, entry);
    this.byYid.set(entry.yid, 'login:' + login);
    return entry;
  }

  /** Перевести старую запись «только ключ» на логин (H2). Старый хэш — в legacyKeyHashes для legacy-токенов. */
  async _convertLegacy(found, login, key) {
    const entry = found.entry;
    const upd = Object.assign({}, entry);
    upd.legacyKeyHashes = [found.hash].concat(Array.isArray(entry.legacyKeyHashes) ? entry.legacyKeyHashes : []).slice(0, 4);
    await this._setV3(upd, login, key);
    this.byHash.delete(found.hash);
    await this._persist();
    return upd;
  }

  async _persist() {
    if (this.loadFailed) {
      const e = new Error('account key registry not loaded — write refused');
      e.code = 'ERR_REGISTRY_NOT_LOADED';
      throw e;
    }
    const rawObj = {
      byHash: Object.fromEntries(this.byHash),
      accounts: Object.fromEntries(this.byLogin),
      updatedAt: Date.now()
    };
    const jsonStr = JSON.stringify(rawObj);

    // Этап 4: Аутентифицированное шифрование AES-256-GCM хранилища на диске
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
    let ciphertext = cipher.update(jsonStr, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    const envelope = {
      v: 2,
      enc: 'aes-256-gcm',
      iv: iv.toString('hex'),
      tag: authTag,
      data: ciphertext,
      updatedAt: Date.now()
    };

    await DB.saveSystemState('account_keys', envelope);
  }

  /**
   * Проверка и обновление статуса rate-limiting по IP.
   */
  /**
   * SEC: лимит ВСЕХ попыток (успешных и нет) с IP. Ключ одновременно логин и пароль,
   * поэтому «успех» в режиме any/create — тоже информация для перебора; плюс раньше
   * успешный вход своим ключом сбрасывал счётчик неудач (обход блокировки).
   */
  checkAttemptBudget(ip) {
    if (!ip) return true;
    if (!this._attempts) this._attempts = new Map();
    const now = Date.now();
    const winMs = 10 * 60 * 1000;
    const max = parseInt(process.env.KEY_ATTEMPTS_PER_10MIN || '15', 10);
    let rec = this._attempts.get(ip);
    if (!rec || now - rec.start > winMs) { rec = { start: now, n: 0 }; this._attempts.set(ip, rec); }
    rec.n++;
    if (this._attempts.size > 50000) {
      for (const [k, v] of this._attempts) if (now - v.start > winMs) this._attempts.delete(k);
    }
    return rec.n <= max;
  }

  checkRateLimit(ip) {
    if (!ip) return { ok: true };
    if (!this.checkAttemptBudget(ip)) return { ok: false, remainingSec: 600 };
    const now = Date.now();
    const rec = this.failedAttempts.get(ip);
    if (rec && rec.lockedUntil > now) {
      const remainingSec = Math.ceil((rec.lockedUntil - now) / 1000);
      return { ok: false, remainingSec };
    }
    return { ok: true };
  }

  recordFailedAttempt(ip) {
    if (!ip) return;
    const now = Date.now();
    let rec = this.failedAttempts.get(ip);
    if (!rec || (rec.lockedUntil > 0 && rec.lockedUntil <= now) || (now - (rec.lastAt || 0) > LOCKOUT_MS)) {
      rec = { count: 0, lockedUntil: 0 };
    }
    rec.count += 1;
    rec.lastAt = now;
    if (rec.count >= MAX_FAILED_ATTEMPTS) {
      rec.lockedUntil = now + LOCKOUT_MS;
    }
    this.failedAttempts.set(ip, rec);
  }

  clearFailedAttempts(ip) {
    // SEC: не сбрасываем счётчик неудач по успеху — иначе атакующий чередует перебор
    // со входом своим ключом и никогда не попадает в блокировку. Записи истекают сами (LOCKOUT_MS).
    void ip;
  }

  /**
   * Проверка статуса привязки аккаунта yid + сводка персонажей для UI.
   */
  async getCodewordStatus(yid) {
    const cleanYid = String(yid || '').trim();
    if (!cleanYid) return { ok: false, error: 'invalid_yid' };
    const hasCodeword = this.byYid.has(cleanYid);
    let chars = [];
    try {
      chars = await DB.listChars(cleanYid);
    } catch (_) {}
    return {
      ok: true,
      hasCodeword,
      hasLogin: !!(this._entryOfYid(cleanYid) || {}).login,
      login: (this._entryOfYid(cleanYid) || {}).login || null,
      yid: cleanYid,
      charsCount: (chars && chars.length) || 0,
      chars: chars || []
    };
  }

  /** Общие проверки ключа (длина, символы). @returns {null|object} ошибка */
  _keyFormatError(cleanCode) {
    if (!cleanCode || cleanCode.length < MIN_CODE_LEN) {
      return { ok: false, error: 'code_too_short', message: `Ключ должен содержать не менее ${MIN_CODE_LEN} символов.` };
    }
    if (cleanCode.length > MAX_CODE_LEN) {
      return { ok: false, error: 'code_too_long', message: `Ключ не должен превышать ${MAX_CODE_LEN} символов.` };
    }
    if (hasInvalidKeyChars(cleanCode)) {
      return { ok: false, error: 'code_invalid_chars', message: 'Ключ должен содержать только английские буквы, цифры и символы (без русских букв).' };
    }
    return null;
  }

  /** Требования к НОВОМУ ключу (создание аккаунта / смена ключа). */
  _newKeyError(cleanCode, login) {
    const f = this._keyFormatError(cleanCode);
    if (f) return f;
    if (isWeakCodeword(cleanCode)) {
      return { ok: false, error: 'code_too_weak', message: 'Слишком простой ключ (например, 111111 или qwerty). Придумайте более надежный ключ или фразу.' };
    }
    if (!/[A-Z]/.test(cleanCode)) {
      return { ok: false, error: 'code_no_uppercase', message: 'Ключ должен содержать как минимум одну заглавную букву (A-Z).' };
    }
    if (login && cleanCode.toLowerCase().includes(login)) {
      return { ok: false, error: 'code_contains_login', message: 'Ключ не должен содержать логин.' };
    }
    return null;
  }

  static _busy() {
    return { ok: false, error: 'busy', message: 'Сервер перегружен вычислениями безопасности. Повторите через секунду.' };
  }

  async _charsOf(yid) {
    try { return (await DB.listChars(yid)) || []; } catch (_) { return []; }
  }

  /** Ответ об успешном входе/создании. */
  async _authOk(entry, action, extra, opts) {
    let guestToken;
    if (!(opts && opts.noToken)) {
      // H3: новый СЛУЧАЙНЫЙ токен устройства; старый вычисляемый токен удаляется из профилей.
      guestToken = (await GuestAuth.issueToken(DB, entry.yid, { keyHashes: this.keyHashesOf(entry.yid) })).token;
    }
    const localId = entry.yid.startsWith('local_') ? entry.yid.slice(6) : entry.yid;
    return Object.assign({
      ok: true, action, isNew: action === 'created', yid: entry.yid, localId,
      login: entry.login || undefined, guestToken, chars: await this._charsOf(entry.yid)
    }, extra || {});
  }

  /**
   * Установка или смена ключа аккаунта (H2: с логином).
   * - аккаунт v3: нужен текущий ключ (или подпись Яндекса); логин можно сменить, если свободен;
   * - старая запись «только ключ» или нет ключа: нужен логин — аккаунт переводится на v3.
   * Ключи больше не обязаны быть уникальными (уникален логин) → нет оракула code_taken.
   */
  async setCodeword(yid, plainCodeword, oldCodeword = '', isVerified = false, plainLogin = '') {
    if (this.loadFailed || !this.initialized) {
      return { ok: false, error: 'busy', message: 'Сервер ключей недоступен, повторите позже.' };
    }
    const cleanYid = String(yid || '').trim();
    if (!cleanYid || cleanYid.length > 64) {
      return { ok: false, error: 'invalid_yid', message: 'Некорректный идентификатор аккаунта.' };
    }
    const cleanCode = String(plainCodeword || '').trim();
    const cur = this._entryOfYid(cleanYid);
    const curId = this.byYid.get(cleanYid) || null;
    let login = plainLogin ? normLogin(plainLogin) : (cur && cur.login) || '';
    if (plainLogin && !login) {
      return { ok: false, error: 'login_invalid', message: 'Логин: 3–24 символа, английские буквы, цифры, «_», «.», «-».' };
    }

    if (!login) {
      if (!legacyCreateAllowed()) {
        return { ok: false, error: 'login_required', message: 'Укажите логин для входа.' };
      }
      const targetHash = await this.hashAsync(cleanCode);
      const existing = this.byHash.get(targetHash);
      if (existing && existing.yid !== cleanYid) {
        return { ok: false, error: 'code_taken', message: 'Это кодовое слово уже занято другим аккаунтом.' };
      }
      const ke = this._newKeyError(cleanCode, login);
      if (ke) return ke;
      if (cur && curId) {
        if (oldCodeword) {
          const cleanOld = String(oldCodeword).trim();
          const oldTargetHash = await this.hashAsync(cleanOld);
          if (oldTargetHash !== curId) {
            return { ok: false, error: 'old_codeword_invalid', message: 'Неверное текущее кодовое слово.' };
          }
        } else if (!isVerified && !legacyCreateAllowed()) {
          return { ok: false, error: 'old_codeword_required', message: 'Для смены кодового слова необходимо указать текущее кодовое слово.' };
        }
        this.byHash.delete(curId);
      }
      const now = Date.now();
      this.byHash.set(targetHash, { yid: cleanYid, createdAt: now, updatedAt: now });
      this.byYid.set(cleanYid, targetHash);
      await this._persist();
      let guestToken;
      if (GuestAuth.isGuestYid(cleanYid)) {
        try { guestToken = (await GuestAuth.revokeAll(DB, cleanYid, { issueNew: true })).token; }
        catch (e) { console.error('[AccountKeys] revoke tokens', cleanYid, e && e.message); }
      }
      return { ok: true, yid: cleanYid, guestToken };
    }

    const other = this.byLogin.get(login);
    if (other && other.yid !== cleanYid) {
      return { ok: false, error: 'login_taken', message: 'Этот логин уже занят. Выберите другой.' };
    }

    const ke = this._newKeyError(cleanCode, login);
    if (ke) return ke;

    try {
      if (oldCodeword && cur) {
        const cleanOld = String(oldCodeword).trim();
        let okOld = false;
        if (cur.login) okOld = !!(await verifyV3(cur, cleanOld));
        else {
          const found = await this._findByCode(cleanOld, await this.hashAsync(cleanOld));
          okOld = !!(found && found.entry === cur);
        }
        if (!okOld) return { ok: false, error: 'old_codeword_invalid', message: 'Неверное текущее кодовое слово.' };
      } else if (cur && !isVerified) {
        return { ok: false, error: 'old_codeword_required', message: 'Для смены кодового слова необходимо указать текущее кодовое слово.' };
      }

      const now = Date.now();
      const entry = cur ? Object.assign({}, cur) : { yid: cleanYid, createdAt: now };
      if (cur && !cur.login && curId) {
        entry.legacyKeyHashes = [curId].concat(Array.isArray(cur.legacyKeyHashes) ? cur.legacyKeyHashes : []).slice(0, 4);
      }
      await this._setV3(entry, login, cleanCode);
      if (curId && !curId.startsWith('login:')) this.byHash.delete(curId);
      if (cur && cur.login && cur.login !== login) this.byLogin.delete(cur.login);
    } catch (e) {
      if (e && e.code === 'ERR_KDF_BUSY') return AccountKeyManager._busy();
      throw e;
    }
    await this._persist();
    // H3: смена ключа отзывает все токены устройств гостевого аккаунта; выдаём новый.
    let guestToken;
    if (GuestAuth.isGuestYid(cleanYid)) {
      try { guestToken = (await GuestAuth.revokeAll(DB, cleanYid, { issueNew: true })).token; }
      catch (e) { console.error('[AccountKeys] revoke tokens', cleanYid, e && e.message); }
    }
    return { ok: true, yid: cleanYid, login, guestToken };
  }

  /**
   * Вход по ключу (старый эндпоинт /api/auth/login-codeword): без создания аккаунта и без выдачи токена.
   */
  async loginByCodeword(plainCodeword, ip, plainLogin = '') {
    const r = await this.enterKey(plainCodeword, ip, '', 'login', plainLogin, { noToken: true });
    if (!r.ok && (r.error === 'key_not_found' || r.error === 'invalid_credentials' || r.error === 'code_too_short')) {
      return Object.assign({}, r, { error: 'invalid_codeword' });
    }
    return r;
  }

  /**
   * Единая точка входа (Вход или Создание аккаунта).
   * - с логином: логин занят → проверка ключа; свободен → (any) перевод старого аккаунта
   *   «только ключ» с этим ключом на логин, иначе создание нового аккаунта;
   * - без логина: только вход в старый аккаунт «только ключ» (needLogin: true).
   */
  async enterKey(plainKey, ip, preferredLocalId = '', mode = 'any', plainLogin = '', opts = {}) {
    if (this.loadFailed || !this.initialized) {
      return { ok: false, error: 'busy', message: 'Сервер ключей недоступен, повторите позже.' };
    }
    // link — привязать свободный логин к старому аккаунту «только ключ» (экран после needLogin)
    if (mode !== 'login' && mode !== 'create' && mode !== 'link') mode = 'any';
    const rl = this.checkRateLimit(ip);
    if (!rl.ok) {
      return { ok: false, error: 'rate_limited', message: `Слишком много неверных попыток. Подождите ${rl.remainingSec} сек.` };
    }
    const cleanCode = String(plainKey || '').trim();
    const fe = this._keyFormatError(cleanCode);
    if (fe) { if (mode === 'login') this.recordFailedAttempt(ip); return fe; }

    const rawLogin = String(plainLogin || '').trim();
    const login = rawLogin ? normLogin(rawLogin) : '';
    if (rawLogin && !login) {
      return { ok: false, error: 'login_invalid', message: 'Логин: 3–24 символа, английские буквы, цифры, «_», «.», «-».' };
    }

    try {
      if (!login) {
        if (mode === 'link') return { ok: false, error: 'login_required', message: 'Укажите логин.' };
        return await this._enterKeyOnly(cleanCode, ip, mode, preferredLocalId, opts);
      }

      const lockSec = this._loginLocked(login);
      if (lockSec) {
        return { ok: false, error: 'rate_limited', message: `Слишком много неверных попыток для этого логина. Подождите ${lockSec} сек.` };
      }

      const acc = this.byLogin.get(login);
      if (acc) {
        if (mode === 'create' || mode === 'link') {
          this.recordFailedAttempt(ip);
          return { ok: false, error: 'login_taken', message: mode === 'link' ? 'Этот логин уже занят. Выберите другой.' : 'Этот логин уже занят. Если это ваш аккаунт, выполните вход.' };
        }
        const v = await verifyV3(acc, cleanCode);
        if (!v) {
          this.recordFailedAttempt(ip);
          this._loginFail(login);
          return { ok: false, error: 'invalid_credentials', message: 'Неверный логин или ключ.' };
        }
        if (v.rehash) { await this._setV3(acc, login, cleanCode); await this._persist(); }
        return await this._authOk(acc, 'login', null, opts);
      }

      // Логин свободен: возможно, это старый аккаунт «только ключ» — переводим его на логин.
      if (mode !== 'create' && keyOnlyAllowed()) {
        const found = await this._findByCode(cleanCode, await this.hashAsync(cleanCode));
        if (found && found.entry && found.entry.yid) {
          const e = await this._convertLegacy(found, login, cleanCode);
          console.log('[AccountKeys] аккаунт переведён на логин:', e.yid);
          return await this._authOk(e, 'login', {
            migrated: true,
            message: 'Логин привязан. Теперь входите по логину и ключу; ключ вводите с тем же регистром букв.'
          }, opts);
        }
      }
      if (mode === 'login' || mode === 'link') {
        this.recordFailedAttempt(ip);
        this._loginFail(login);
        return { ok: false, error: 'invalid_credentials', message: 'Неверный логин или ключ.' };
      }

      // Новый аккаунт
      const ke = this._newKeyError(cleanCode, login);
      if (ke) return ke;
      const entry = await this._createAccount(preferredLocalId, async (e) => this._setV3(e, login, cleanCode));
      return await this._authOk(entry, 'created', null, opts);
    } catch (e) {
      if (e && e.code === 'ERR_KDF_BUSY') return AccountKeyManager._busy();
      throw e;
    }
  }

  /** Вход по одному ключу — только старые аккаунты (до H2). */
  async _enterKeyOnly(cleanCode, ip, mode, preferredLocalId, opts) {
    const legacyCreate = legacyCreateAllowed();
    if (!keyOnlyAllowed() && !legacyCreate) {
      return { ok: false, error: 'login_required', message: 'Введите логин и ключ.' };
    }
    const targetHash = await this.hashAsync(cleanCode);
    const found = await this._findByCode(cleanCode, targetHash);
    if (found && found.entry && found.entry.yid) {
      if (mode === 'create') {
        this.recordFailedAttempt(ip);
        return { ok: false, error: 'code_taken', message: 'Этот ключ уже занят. Если это ваш ключ, выполните вход.' };
      }
      await this._upgrade(found, targetHash);
      return await this._authOk(found.entry, 'login', { needLogin: true }, opts);
    }
    if (mode === 'login' || !legacyCreate) {
      this.recordFailedAttempt(ip);
      return {
        ok: false,
        error: mode === 'login' ? 'key_not_found' : 'login_required',
        message: mode === 'login' ? 'Ключ не найден. Проверьте ключ или укажите логин.' : 'Для нового аккаунта укажите логин. Если у вас старый ключ без логина — проверьте ключ.'
      };
    }
    // dev/тесты (KEY_LEGACY_CREATE=1): аккаунт старого формата
    const ke = this._newKeyError(cleanCode, '');
    if (ke) return ke;
    const entry = await this._createAccount(preferredLocalId, async (e) => {
      e.p = CUR_ID;
      this.byHash.set(targetHash, e);
      this.byYid.set(e.yid, targetHash);
      return e;
    });
    return await this._authOk(entry, 'created', null, opts);
  }

  /** Создать аккаунт: yid подключаемого гостя (preferredLocalId, владение проверено в API) или новый. */
  async _createAccount(preferredLocalId, attach) {
    let targetLocalId = '';
    const cleanPref = String(preferredLocalId || '').trim();
    if (cleanPref && !this.byYid.has('local_' + cleanPref)) {
      const prefChars = await this._charsOf('local_' + cleanPref);
      if (prefChars.length > 0) targetLocalId = cleanPref;
    }
    if (!targetLocalId) targetLocalId = crypto.randomBytes(6).toString('hex');
    const now = Date.now();
    const entry = await attach({ yid: 'local_' + targetLocalId, createdAt: now, updatedAt: now });
    await this._persist();
    return entry;
  }

  /** Для тестов */
  async resetForTesting() {
    this.byHash.clear();
    this.byYid.clear();
    this.byLogin.clear();
    this.loginFails.clear();
    this.failedAttempts.clear();
    this.initialized = true;
    this.loadFailed = false;
    await this._persist();
  }
}

const instance = new AccountKeyManager();
GuestAuth.setTokenRegistry(instance);
instance.secretsProblems = secretsProblems;
module.exports = instance;
