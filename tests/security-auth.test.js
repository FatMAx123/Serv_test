// ============================================================
//  TESTS / SECURITY-AUTH.TEST.JS
//  Тестирование безопасности: assertProductionAuth, HMAC-SHA256,
//  защита от Replay-атак (секунды/мс, будущее время),
//  timing-safe сверка токенов модерации и изоляция GM в проде.
// ============================================================
'use strict';

const crypto = require('crypto');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const AUTH = require(path.join(ROOT, 'server', 'auth.js'));
const { isGM } = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));

module.exports = async function (t) {
  // ── 1. assertProductionAuth ──────────────────────────────────
  t.suite('auth: assertProductionAuth валидация режима окружения');

  t.ok(typeof AUTH.assertProductionAuth === 'function', 'AUTH.assertProductionAuth экспортирована');

  // Dev режим: запуск без секрета разрешен
  const devRes = AUTH.assertProductionAuth({ env: 'development', secret: '' });
  t.ok(devRes.ok, 'в development запуск без секрета разрешен');

  // Prod режим без секрета: выбрасывает исключение ERR_AUTH_SECRET_MISSING
  let prodErr = null;
  try {
    AUTH.assertProductionAuth({ env: 'production', secret: '' });
  } catch (err) {
    prodErr = err;
  }
  t.ok(prodErr !== null, 'в production без секрета выброшено исключение');
  t.eq(prodErr && prodErr.code, 'ERR_AUTH_SECRET_MISSING', 'код ошибки ERR_AUTH_SECRET_MISSING');

  // Strict режим: выбрасывает исключение при отсутствии секрета
  let strictErr = null;
  try {
    AUTH.assertProductionAuth({ strict: true, secret: '' });
  } catch (err) {
    strictErr = err;
  }
  t.ok(strictErr !== null, 'при strict=true без секрета выброшено исключение');
  t.eq(strictErr && strictErr.code, 'ERR_AUTH_SECRET_MISSING', 'код ошибки strict режима ERR_AUTH_SECRET_MISSING');

  // Prod режим с валидным секретом: успешно проходит
  const prodOkRes = AUTH.assertProductionAuth({
    env: 'production',
    secret: 'prod_secret_yandex_12345'
  });
  t.ok(prodOkRes.ok, 'в production с YANDEX_APP_SECRET проверка успешно пройдена');

  // Аварийный обход в проде (ALLOW_INSECURE_AUTH=1)
  const bypassRes = AUTH.assertProductionAuth({
    env: 'production',
    secret: '',
    allowInsecure: true
  });
  t.ok(bypassRes.ok, 'аварийный флаг allowInsecure=true разрешает запуск');

  // ── 2. verifySignature: HMAC, Replay, нормализация и будущее время ──
  t.suite('auth: verifySignature HMAC и Replay-защита');

  const secret = 'super_secure_secret_key_888';

  // 2.1. Валидный токен в миллисекундах
  const nowMs = Date.now();
  const payloadMs = Buffer.from(JSON.stringify({
    uniqueID: 'user_ms_1',
    publicName: 'HeroMs',
    issuedAt: nowMs
  })).toString('base64url');
  const sigMs = crypto.createHmac('sha256', secret).update(payloadMs).digest('base64url');

  const vMs = AUTH.verifySignature(payloadMs, sigMs, secret);
  t.ok(vMs.ok, 'валидная подпись с issuedAt в миллисекундах принята');

  // 2.2. Валидный токен в секундах (10 знаков, Unix timestamp)
  const nowSec = Math.floor(nowMs / 1000);
  const payloadSec = Buffer.from(JSON.stringify({
    uniqueID: 'user_sec_1',
    publicName: 'HeroSec',
    issuedAt: nowSec
  })).toString('base64url');
  const sigSec = crypto.createHmac('sha256', secret).update(payloadSec).digest('base64url');

  const vSec = AUTH.verifySignature(payloadSec, sigSec, secret);
  t.ok(vSec.ok, 'валидная подпись с нормализацией секунд принята');

  // 2.3. Поврежденная подпись
  const badSig = sigMs.slice(0, -4) + 'zzzz';
  const vBad = AUTH.verifySignature(payloadMs, badSig, secret);
  t.eq(vBad.ok, false, 'повреждённая подпись отклонена');
  t.eq(vBad.error, 'signature_mismatch', 'код ошибки signature_mismatch');

  // 2.4. Подпись другой длины
  const shortSig = sigMs.slice(0, 10);
  const vShort = AUTH.verifySignature(payloadMs, shortSig, secret);
  t.eq(vShort.ok, false, 'подпись неверной длины отклонена');
  t.eq(vShort.error, 'signature_mismatch', 'код ошибки длины signature_mismatch');

  // 2.5. Устаревший токен (> 5 минут)
  const expiredMs = nowMs - 301000; // 5 минут 1 секунда назад
  const payloadExpired = Buffer.from(JSON.stringify({
    uniqueID: 'user_exp_1',
    publicName: 'OldHero',
    issuedAt: expiredMs
  })).toString('base64url');
  const sigExpired = crypto.createHmac('sha256', secret).update(payloadExpired).digest('base64url');

  const vExpired = AUTH.verifySignature(payloadExpired, sigExpired, secret);
  t.eq(vExpired.ok, false, 'токен старше 5 минут отклонён');
  t.eq(vExpired.error, 'signature_expired', 'код ошибки signature_expired');

  // 2.6. Токен из будущего (> 60 секунд)
  const futureMs = nowMs + 70000; // 70 секунд в будущем
  const payloadFuture = Buffer.from(JSON.stringify({
    uniqueID: 'user_fut_1',
    publicName: 'FutureHero',
    issuedAt: futureMs
  })).toString('base64url');
  const sigFuture = crypto.createHmac('sha256', secret).update(payloadFuture).digest('base64url');

  const vFuture = AUTH.verifySignature(payloadFuture, sigFuture, secret);
  t.eq(vFuture.ok, false, 'токен с опережением >60с отклонён');
  t.eq(vFuture.error, 'signature_future', 'код ошибки signature_future');

  // 2.7. Токен без временной метки при requireTimestamp = true
  const payloadNoTs = Buffer.from(JSON.stringify({
    uniqueID: 'user_no_ts',
    publicName: 'NoTsHero'
  })).toString('base64url');
  const sigNoTs = crypto.createHmac('sha256', secret).update(payloadNoTs).digest('base64url');

  const vRequireTs = AUTH.verifySignature(payloadNoTs, sigNoTs, secret, { requireTimestamp: true });
  t.eq(vRequireTs.ok, false, 'токен без issuedAt при requireTimestamp=true отклонён');
  t.eq(vRequireTs.error, 'timestamp_missing', 'код ошибки timestamp_missing');

  // Токен без временной метки при requireTimestamp = false (обратная совместимость)
  const vNoRequireTs = AUTH.verifySignature(payloadNoTs, sigNoTs, secret, { requireTimestamp: false });
  t.ok(vNoRequireTs.ok, 'токен без issuedAt при requireTimestamp=false разрешён');

  // 2.8. Поведение при пустом секрете
  const vDevEmptySecret = AUTH.verifySignature(payloadMs, sigMs, '', { env: 'development' });
  t.ok(vDevEmptySecret.ok && vDevEmptySecret.dev, 'в dev-режиме без секрета возвращается dev=true');

  const vProdEmptySecret = AUTH.verifySignature(payloadMs, sigMs, '', { env: 'production' });
  t.eq(vProdEmptySecret.ok, false, 'в prod-режиме без секрета авторизация запрещена');
  t.eq(vProdEmptySecret.error, 'secret_missing', 'код ошибки secret_missing');

  // ── 3. parseLoginData ────────────────────────────────────────
  t.suite('auth: parseLoginData разбор и санитайзинг');

  const parsed = AUTH.parseLoginData(payloadMs);
  t.eq(parsed.yid, 'user_ms_1', 'yid извлечён корректно');
  t.eq(parsed.name, 'HeroMs', 'name извлечено корректно');
  t.eq(parsed.issuedAt, nowMs, 'issuedAt извлечено корректно');

  // Невалидный base64/JSON
  const parsedCorrupt = AUTH.parseLoginData('not-a-valid-base64-json!!!');
  t.ok(parsedCorrupt.yid.startsWith('anon_'), 'на битых данных сгенерирован анонимный yid');
  t.eq(parsedCorrupt.name, 'Operator', 'дефолтное имя Operator');

  // ── 4. GM-полномочия: изоляция dev-флагов в продакшене ────────
  t.suite('auth: isGM изоляция dev-флагов в продакшене');

  const oldEnv = process.env.NODE_ENV;
  const oldAutoDev = process.env.AUTO_DEV_GM;
  const oldGmYids = process.env.GM_YIDS;

  try {
    // В ПРОДАКШЕНЕ:
    process.env.NODE_ENV = 'production';
    process.env.AUTO_DEV_GM = '1';
    process.env.GM_YIDS = 'whitelist_admin_yid';

    // dev: true НЕ должен давать GM в проде
    const pDevProd = { yid: 'attacker_1', name: 'BadActor', dev: true, accessLevel: 0 };
    t.eq(isGM(pDevProd), false, 'p.dev=true НЕ даёт права GM в production даже при AUTO_DEV_GM=1');

    // itest_ НЕ должен давать GM в проде
    const pItestProd = { yid: 'itest_attacker', name: 'NonGmAttacker', accessLevel: 0 };
    t.eq(isGM(pItestProd), false, 'префикс itest_ НЕ даёт права GM в production');

    // accessLevel >= 50 даёт GM в проде
    const pLvl50 = { yid: 'admin_legit', name: 'SuperAdmin', accessLevel: 50 };
    t.eq(isGM(pLvl50), true, 'accessLevel >= 50 даёт права GM в production');

    // GM_YIDS даёт GM в проде
    const pWhitelist = { yid: 'whitelist_admin_yid', name: 'Whitelisted', accessLevel: 0 };
    t.eq(isGM(pWhitelist), true, 'yid из GM_YIDS даёт права GM в production');

    // В DEVELOPMENT:
    process.env.NODE_ENV = 'development';
    process.env.AUTO_DEV_GM = '1';

    const pDevDev = { yid: 'dev_user', name: 'DevHero', dev: true, accessLevel: 0 };
    t.eq(isGM(pDevDev), true, 'p.dev=true даёт права GM в development при AUTO_DEV_GM=1');

    const pItestDev = { yid: 'itest_testrunner', name: 'TestRunner', accessLevel: 0 };
    t.eq(isGM(pItestDev), true, 'префикс itest_ даёт права GM в development');
  } finally {
    process.env.NODE_ENV = oldEnv;
    process.env.AUTO_DEV_GM = oldAutoDev;
    process.env.GM_YIDS = oldGmYids;
  }
};
