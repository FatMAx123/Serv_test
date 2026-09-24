// ============================================================
//  SERVER / AUTH.JS  —  проверка входа.
//  В проде: клиент шлёт getSignedData() Яндекса, мы сверяем HMAC.
//  Локально (секрет пуст): dev-обход, чтобы работало без консоли Яндекса.
// ============================================================
'use strict';
const crypto = require('crypto');

function parseLoginData(dataB64) {
  try {
    // base64url или ordinary base64 (клиент dev: btoa / UTF-8 safe)
    const raw = String(dataB64 || '');
    let json = '';
    try {
      json = Buffer.from(raw, 'base64url').toString('utf8');
      JSON.parse(json); // validate
    } catch (e1) {
      const pad = raw + '==='.slice((raw.length + 3) % 4);
      json = Buffer.from(pad.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    }
    const d = JSON.parse(json);
    return {
      yid: String(d.uniqueID || d.id || ('anon_' + Date.now())),
      name: String(d.publicName || d.name || 'Operator').slice(0, 24),
      race: d.race ? String(d.race).toLowerCase() : undefined,
      gender: d.gender ? String(d.gender).toLowerCase() : undefined,
      cls: d.cls || d.classId ? String(d.cls || d.classId).toLowerCase() : undefined,
      charId: d.charId ? String(d.charId) : undefined,
      issuedAt: d.issuedAt != null ? Number(d.issuedAt) : (d.ts != null ? Number(d.ts) : undefined)
    };
  } catch (e) {
    return { yid: 'anon_' + Date.now(), name: 'Operator' };
  }
}

/**
 * Валидация подсистемы аутентификации для продакшена.
 * При NODE_ENV=production или STRICT_AUTH=1 требует обязательного наличия YANDEX_APP_SECRET.
 * Защищает от захвата аккаунтов и несанкционированного dev-доступа в продакшене.
 * Аварийный обход: ALLOW_INSECURE_AUTH=1.
 */
function assertProductionAuth(opts = {}) {
  const env = opts.env || process.env.NODE_ENV || 'development';
  const strict = opts.strict != null
    ? !!opts.strict
    : (process.env.STRICT_AUTH === '1' || (env === 'production' && process.env.STRICT_AUTH !== '0'));
  const allowInsecure = opts.allowInsecure != null
    ? !!opts.allowInsecure
    : (process.env.ALLOW_INSECURE_AUTH === '1');
  const secret = opts.secret !== undefined ? opts.secret : process.env.YANDEX_APP_SECRET;

  if (strict && !allowInsecure) {
    if (!secret || !String(secret).trim()) {
      const err = new Error(
        '[AUTH_FATAL] В продакшене (NODE_ENV=production / STRICT_AUTH=1) строго обязателен YANDEX_APP_SECRET для проверки HMAC-SHA256 подписи.\n' +
        'Без секрета подпись входа не проверяется, и любой клиент может войти под произвольным yid и получить dev-права.\n' +
        'Задайте переменную окружения YANDEX_APP_SECRET=...\n' +
        'Для аварийного запуска без проверки подписи задайте ALLOW_INSECURE_AUTH=1.'
      );
      err.code = 'ERR_AUTH_SECRET_MISSING';
      throw err;
    }
  }
  return { ok: true, strict, hasSecret: !!(secret && String(secret).trim()) };
}

// secret = process.env.YANDEX_APP_SECRET. Пусто => dev (НЕ для прода!).
function verifySignature(dataB64, signature, secret, opts) {
  const options = (typeof opts === 'number') ? { maxAgeMs: opts } : (opts || {});
  const maxAgeMs = options.maxAgeMs || 300000; // 5 минут по умолчанию
  const requireTimestamp = !!options.requireTimestamp;
  const env = options.env || process.env.NODE_ENV || 'development';

  const allowInsecure = options.allowInsecure != null
    ? !!options.allowInsecure
    : (process.env.ALLOW_INSECURE_AUTH === '1');

  // Гостевые аккаунты (local_*) авторизуются через кодовый ключ (AccountKeys), у них нет подписи Яндекса
  const parsed = parseLoginData(dataB64);
  const isGuest = parsed && parsed.yid && String(parsed.yid).startsWith('local_');
  if (isGuest) {
    return { ok: true, guest: true };
  }

  if (!secret) {
    if (env === 'production' && !allowInsecure) {
      console.error('[AUTH] Critical: YANDEX_APP_SECRET is not configured in production mode!');
      return { ok: false, error: 'secret_missing' };
    }
    return { ok: true, dev: true };
  }
  if (!signature) return { ok: false, error: 'missing_signature' };
  try {
    const expect = crypto.createHmac('sha256', secret).update(dataB64).digest('base64url');
    const a = Buffer.from(expect), b = Buffer.from(signature);
    if (a.length !== b.length) return { ok: false, error: 'signature_mismatch' };
    if (!crypto.timingSafeEqual(a, b)) return { ok: false, error: 'signature_mismatch' };

    // Защита от Replay-атак: если полезная нагрузка содержит issuedAt / ts, проверяем возраст токена
    const parsed = parseLoginData(dataB64);
    if (parsed && Number.isFinite(parsed.issuedAt)) {
      // Нормализация: если метка в секундах (10 цифр, < 1e11), приводим к миллисекундам
      const issuedMs = parsed.issuedAt < 1e11 ? parsed.issuedAt * 1000 : parsed.issuedAt;
      const now = options.now || Date.now();
      const diff = now - issuedMs;

      // Защита от опережающего времени (сдвиг в будущее > 60 секунд)
      if (diff < -60000) {
        return { ok: false, error: 'signature_future', diff };
      }

      // Защита от устаревания (> maxAgeMs)
      if (diff > maxAgeMs) {
        return { ok: false, error: 'signature_expired', age: diff };
      }
    } else if (requireTimestamp) {
      return { ok: false, error: 'timestamp_missing' };
    }

    return { ok: true };
  } catch (e) { return { ok: false, error: 'verification_failed' }; }
}

module.exports = { parseLoginData, verifySignature, assertProductionAuth };