// ============================================================
//  SERVER / ACCOUNT-KEYS.JS — Реестр кодовых слов для гостевых аккаунтов.
//  Позволяет незарегистрированным игрокам входить с разных браузеров/ПК.
//  Строго «Без дублей» (1:1 соответствие yid <-> hash) и 1 окно в игре.
// ============================================================
'use strict';

const crypto = require('crypto');
const util = require('util');
const DB = require('./db.js');

const pbkdf2Async = util.promisify(crypto.pbkdf2);

const SALT = process.env.CODEWORD_SALT || 'ps_codeword_salt_2026_steampunk';
const MIN_CODE_LEN = 6;
const MAX_CODE_LEN = 64;

// Конфигурация многоэтапного шифрования
const PREHASH_SALT = process.env.KEY_PREHASH_SALT || 'ps_prehash_salt_2026_steampunk';
const KDF_SALT = process.env.KEY_KDF_SALT || 'ps_kdf_salt_512_rounds_2026_island';
const PEPPER = process.env.KEY_PEPPER || 'ps_secret_server_pepper_2026_unreachable';
const KDF_ROUNDS = parseInt(process.env.KEY_KDF_ROUNDS || '25000', 10);

const VAULT_SECRET = process.env.KEY_VAULT_SECRET || 'ps_vault_master_secret_2026_aes256gcm';
const VAULT_KEY = crypto.scryptSync(VAULT_SECRET, 'ps_vault_storage_salt_2026', 32);

// Соль для обратной совместимости и бесшовного апгрейда старых хэшей
const LEGACY_SALT = process.env.CODEWORD_SALT || 'ps_codeword_salt_2026_steampunk';

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
function multiStageHash(plain) {
  const clean = String(plain || '').trim().toLowerCase();

  // Этап 1: Pre-hash HMAC-SHA512
  const stage1 = crypto.createHmac('sha512', PREHASH_SALT)
    .update('account_key_stage1:' + clean)
    .digest();

  // Этап 2: PBKDF2-HMAC-SHA512 (25,000 раундов)
  const stage2 = crypto.pbkdf2Sync(stage1, KDF_SALT, KDF_ROUNDS, 64, 'sha512');

  // Этап 3: Server Pepper HMAC-SHA256
  const stage3 = crypto.createHmac('sha256', PEPPER)
    .update('account_key_stage3:')
    .update(stage2)
    .digest('hex');

  return 'ms4_' + stage3;
}

async function multiStageHashAsync(plain) {
  const clean = String(plain || '').trim().toLowerCase();

  // Этап 1: Pre-hash HMAC-SHA512
  const stage1 = crypto.createHmac('sha512', PREHASH_SALT)
    .update('account_key_stage1:' + clean)
    .digest();

  // Этап 2: Асинхронный PBKDF2 (25 000 раундов) без блокировки Event Loop
  const stage2 = await pbkdf2Async(stage1, KDF_SALT, KDF_ROUNDS, 64, 'sha512');

  // Этап 3: Server Pepper HMAC-SHA256
  const stage3 = crypto.createHmac('sha256', PEPPER)
    .update('account_key_stage3:')
    .update(stage2)
    .digest('hex');

  return 'ms4_' + stage3;
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
    this.byYid = new Map();  // yid -> hash
    this.failedAttempts = new Map(); // ip -> { count, lockedUntil }
    this.initialized = false;
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

      if (!stored || typeof stored !== 'object') {
        this.initialized = true;
        return { ok: true, count: 0 };
      }

      let payload = null;

      // Этап 4: Верификация и дешифрование конверта AES-256-GCM
      if (stored.v === 2 && stored.enc === 'aes-256-gcm' && stored.data && stored.iv && stored.tag) {
        try {
          const iv = Buffer.from(stored.iv, 'hex');
          const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, iv);
          decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
          let decrypted = decipher.update(stored.data, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          payload = JSON.parse(decrypted);
        } catch (decryptErr) {
          console.error('[AccountKeys] GCM decryption / auth tag verification failed:', decryptErr && decryptErr.message);
          this.initialized = true;
          return { ok: false, error: 'vault_corrupted' };
        }
      } else if (stored.byHash) {
        // Legacy открытый JSON: загрузка с последующим авто-апгрейдом при первом сохранении
        payload = stored;
      }

      if (payload && payload.byHash && typeof payload.byHash === 'object') {
        for (const [h, entry] of Object.entries(payload.byHash)) {
          if (entry && entry.yid) {
            this.byHash.set(h, {
              yid: String(entry.yid),
              createdAt: Number(entry.createdAt) || Date.now(),
              updatedAt: Number(entry.updatedAt) || Date.now()
            });
            this.byYid.set(String(entry.yid), h);
          }
        }
      }

      this.initialized = true;
      return { ok: true, count: this.byYid.size };
    } catch (err) {
      console.error('[AccountKeys] init error:', err && err.message);
      this.initialized = true;
      return { ok: false, error: err && err.message };
    }
  }

  async _persist() {
    const rawObj = {
      byHash: Object.fromEntries(this.byHash),
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
  checkRateLimit(ip) {
    if (!ip) return { ok: true };
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
    if (!rec || (rec.lockedUntil > 0 && rec.lockedUntil <= now)) {
      rec = { count: 0, lockedUntil: 0 };
    }
    rec.count += 1;
    if (rec.count >= MAX_FAILED_ATTEMPTS) {
      rec.lockedUntil = now + LOCKOUT_MS;
    }
    this.failedAttempts.set(ip, rec);
  }

  clearFailedAttempts(ip) {
    if (ip) this.failedAttempts.delete(ip);
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
      yid: cleanYid,
      charsCount: (chars && chars.length) || 0,
      chars: chars || []
    };
  }

  /**
   * Установка или обновление кодового слова.
   * Строго «Без дублей»:
   * - Запрещено занимать чужое уже занятое кодовое слово.
   * - Запрещены тривиальные пароли (123456, qwerty и т.д.).
   * - При смене слова для текущего yid старый хэш полностью удаляется из реестра.
   */
  async setCodeword(yid, plainCodeword, oldCodeword = '', isVerified = false) {
    const cleanYid = String(yid || '').trim();
    if (!cleanYid || cleanYid.length > 64) {
      return { ok: false, error: 'invalid_yid', message: 'Некорректный идентификатор аккаунта.' };
    }

    const cleanCode = String(plainCodeword || '').trim();
    if (cleanCode.length < MIN_CODE_LEN) {
      return {
        ok: false,
        error: 'code_too_short',
        message: `Кодовое слово должно содержать не менее ${MIN_CODE_LEN} символов.`
      };
    }
    if (cleanCode.length > MAX_CODE_LEN) {
      return {
        ok: false,
        error: 'code_too_long',
        message: `Кодовое слово не должно превышать ${MAX_CODE_LEN} символов.`
      };
    }
    if (hasInvalidKeyChars(cleanCode)) {
      return {
        ok: false,
        error: 'code_invalid_chars',
        message: 'Ключ должен содержать только английские буквы, цифры и символы (без русских букв).'
      };
    }
    if (isWeakCodeword(cleanCode)) {
      return {
        ok: false,
        error: 'code_too_weak',
        message: 'Слишком простое кодовое слово (например, 123456). Придумайте более надежное слово или фразу из букв и цифр.'
      };
    }

    // Если указано старое кодовое слово, проверяем его совпадение с текущим
    const oldHash = this.byYid.get(cleanYid);
    if (oldCodeword) {
      const cleanOld = String(oldCodeword).trim();
      const checkOldHash = await this.hashAsync(cleanOld);
      const checkOldLeg = this.legacyHash(cleanOld);
      if (oldHash && checkOldHash !== oldHash && checkOldLeg !== oldHash) {
        return {
          ok: false,
          error: 'old_codeword_invalid',
          message: 'Неверное текущее кодовое слово.'
        };
      }
    }

    const targetHash = await this.hashAsync(cleanCode);
    const legHash = this.legacyHash(cleanCode);

    // Проверка дубликатов: не занято ли слово ДРУГИМ аккаунтом
    const existingForHash = this.byHash.get(targetHash) || this.byHash.get(legHash);
    if (existingForHash && existingForHash.yid !== cleanYid) {
      return {
        ok: false,
        error: 'code_taken',
        message: 'Это кодовое слово уже занято другим аккаунтом. Выберите другое.'
      };
    }

    // Если у этого yid уже было старое кодовое слово — начисто удаляем старый хэш
    if (oldHash && oldHash !== targetHash) {
      this.byHash.delete(oldHash);
    }
    if (this.byHash.has(legHash)) {
      this.byHash.delete(legHash);
    }

    const now = Date.now();
    const prevCreated = existingForHash ? existingForHash.createdAt : now;
    this.byHash.set(targetHash, {
      yid: cleanYid,
      createdAt: prevCreated,
      updatedAt: now
    });
    this.byYid.set(cleanYid, targetHash);

    await this._persist();
    return { ok: true, yid: cleanYid };
  }

  /**
   * Вход по кодовому слову.
   * При совпадении возвращает yid, localId и персонажей для моментального кэширования.
   */
  async loginByCodeword(plainCodeword, ip) {
    const rl = this.checkRateLimit(ip);
    if (!rl.ok) {
      return {
        ok: false,
        error: 'rate_limited',
        message: `Слишком много неверных попыток. Подождите ${rl.remainingSec} сек.`
      };
    }

    const cleanCode = String(plainCodeword || '').trim();
    if (!cleanCode || cleanCode.length < MIN_CODE_LEN) {
      this.recordFailedAttempt(ip);
      return {
        ok: false,
        error: 'invalid_codeword',
        message: 'Неверное кодовое слово.'
      };
    }
    if (hasInvalidKeyChars(cleanCode)) {
      this.recordFailedAttempt(ip);
      return {
        ok: false,
        error: 'code_invalid_chars',
        message: 'Ключ должен содержать только английские буквы, цифры и символы (без русских букв).'
      };
    }

    const targetHash = await this.hashAsync(cleanCode);
    let entry = this.byHash.get(targetHash);
    let needsUpgrade = false;

    if (!entry) {
      const legHash = this.legacyHash(cleanCode);
      entry = this.byHash.get(legHash);
      if (entry) {
        needsUpgrade = true;
      }
    }

    if (!entry || !entry.yid) {
      this.recordFailedAttempt(ip);
      return {
        ok: false,
        error: 'invalid_codeword',
        message: 'Неверное кодовое слово.'
      };
    }

    // Авто-апгрейд устаревшего sha256 хэша на 4-этапный криптографический хэш
    if (needsUpgrade) {
      const legHash = this.legacyHash(cleanCode);
      this.byHash.delete(legHash);
      this.byHash.set(targetHash, entry);
      this.byYid.set(entry.yid, targetHash);
      await this._persist();
    }

    // Успешный вход: сбрасываем попытки
    this.clearFailedAttempts(ip);

    let localId = entry.yid;
    if (localId.startsWith('local_')) {
      localId = localId.slice(6);
    }

    let chars = [];
    try {
      chars = await DB.listChars(entry.yid);
    } catch (_) {}

    return {
      ok: true,
      yid: entry.yid,
      localId: localId,
      chars: chars || []
    };
  }

  /**
   * Единая точка входа по ключу (Вход или Создание аккаунта).
   * - Если ключ уже существует в базе: выполняет вход на этот аккаунт и возвращает персонажей.
   * - Если ключа нет в базе: создает новый аккаунт, привязывает ключ и возвращает его.
   */
  async enterKey(plainKey, ip, preferredLocalId) {
    const rl = this.checkRateLimit(ip);
    if (!rl.ok) {
      return {
        ok: false,
        error: 'rate_limited',
        message: `Слишком много неверных попыток. Подождите ${rl.remainingSec} сек.`
      };
    }

    const cleanCode = String(plainKey || '').trim();
    if (!cleanCode || cleanCode.length < 4) {
      return {
        ok: false,
        error: 'code_too_short',
        message: 'Ключ должен содержать не менее 4 символов.'
      };
    }
    if (cleanCode.length > MAX_CODE_LEN) {
      return {
        ok: false,
        error: 'code_too_long',
        message: `Ключ не должен превышать ${MAX_CODE_LEN} символов.`
      };
    }
    if (hasInvalidKeyChars(cleanCode)) {
      return {
        ok: false,
        error: 'code_invalid_chars',
        message: 'Ключ должен содержать только английские буквы, цифры и символы (без русских букв).'
      };
    }

    // PERF-KDF-01: Асинхронный расчет PBKDF2 (25 000 раундов) в пуле libuv без блокировки Event Loop
    const targetHash = await this.hashAsync(cleanCode);
    let existing = this.byHash.get(targetHash);
    let needsUpgrade = false;

    if (!existing) {
      const legHash = this.legacyHash(cleanCode);
      existing = this.byHash.get(legHash);
      if (existing) {
        needsUpgrade = true;
      }
    }

    if (existing && existing.yid) {
      // 1. СУЩЕСТВУЮЩИЙ АККАУНТ: вход
      this.clearFailedAttempts(ip);

      if (needsUpgrade) {
        const legHash = this.legacyHash(cleanCode);
        this.byHash.delete(legHash);
        this.byHash.set(targetHash, existing);
        this.byYid.set(existing.yid, targetHash);
        await this._persist();
      }

      let localId = existing.yid;
      if (localId.startsWith('local_')) {
        localId = localId.slice(6);
      }
      let chars = [];
      try {
        chars = await DB.listChars(existing.yid);
      } catch (_) {}

      return {
        ok: true,
        action: 'login',
        isNew: false,
        yid: existing.yid,
        localId: localId,
        chars: chars || []
      };
    }

    // 2. НОВЫЙ КЛЮЧ: регистрация нового аккаунта
    if (isWeakCodeword(cleanCode)) {
      return {
        ok: false,
        error: 'code_too_weak',
        message: 'Слишком простой ключ (например, 111111 или qwerty). Придумайте более надежный ключ или фразу.'
      };
    }

    let targetLocalId = '';
    const cleanPref = String(preferredLocalId || '').trim();
    if (cleanPref && !this.byYid.has('local_' + cleanPref)) {
      try {
        const prefChars = await DB.listChars('local_' + cleanPref);
        if (prefChars && prefChars.length > 0) {
          targetLocalId = cleanPref;
        }
      } catch (_) {}
    }

    if (!targetLocalId) {
      targetLocalId = crypto.randomBytes(6).toString('hex');
    }

    const newYid = 'local_' + targetLocalId;
    const now = Date.now();

    this.byHash.set(targetHash, {
      yid: newYid,
      createdAt: now,
      updatedAt: now
    });
    this.byYid.set(newYid, targetHash);
    await this._persist();

    let chars = [];
    try {
      chars = await DB.listChars(newYid);
    } catch (_) {}

    return {
      ok: true,
      action: 'created',
      isNew: true,
      yid: newYid,
      localId: targetLocalId,
      chars: chars || []
    };
  }

  /** Для тестов */
  async resetForTesting() {
    this.byHash.clear();
    this.byYid.clear();
    this.failedAttempts.clear();
    await this._persist();
  }
}

const instance = new AccountKeyManager();
module.exports = instance;
