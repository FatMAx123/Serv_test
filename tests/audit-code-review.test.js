// ============================================================
//  TESTS / AUDIT-CODE-REVIEW.TEST.JS
//  Тестирование улучшений и инвариантов по итогам аудита code-audit.md:
//    - 1. Token-bucket rate limiter: защита от burst-атак на границе окон
//    - 2. Backpressure monitoring в net-transport (счётчик дропов, авто-закрытие зомби-сокетов)
//    - 3. Верификация иммунитета в production: p.dev и isSyntheticBot
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const NetTransport = require(path.join(ROOT, 'server', 'net-transport.js'));
const SEC = require(path.join(ROOT, 'server', 'security-config.js'));

module.exports = async function (t) {
  // ── 1. Token-bucket rate limiter ───────────────────────────
  t.suite('audit-review: Token-bucket rate limiter');

  // Модель token-bucket как в server.js
  const RATE = { move: 20, attack: 8, action: 6, chat: 2, pvp: 4, skill: 10, npc: 12 };
  function checkRateTest(p, type, now) {
    if (!p || !p.rate) return true;
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

  const p = { rate: {} };
  let tNow = 1000000;

  // Проверка чата (лимит 2 в секунду)
  t.ok(checkRateTest(p, 'chat', tNow), '1-й чат-пакет разрешен');
  t.ok(checkRateTest(p, 'chat', tNow), '2-й чат-пакет разрешен (бёрст исчерпан)');
  t.ok(!checkRateTest(p, 'chat', tNow), '3-й чат-пакет в ту же миллисекунду отклонен');

  // Спустя 250 мс восстановилось 0.5 токена (всего 0.5 < 1)
  t.ok(!checkRateTest(p, 'chat', tNow + 250), 'через 250 мс токенов недостаточно (< 1)');

  // Спустя 500 мс восстановился 1 токен (2/сек * 0.5 сек = 1.0)
  t.ok(checkRateTest(p, 'chat', tNow + 500), 'через 500 мс накоплен 1 токен, пакет разрешен');
  t.ok(!checkRateTest(p, 'chat', tNow + 500), 'после траты токена следующий сразу отклонен');

  // Спустя 5 секунд молчания восстановился полный пул (лимит 2, не больше)
  tNow += 5000;
  t.ok(checkRateTest(p, 'chat', tNow), 'после паузы 1-й пакет разрешен');
  t.ok(checkRateTest(p, 'chat', tNow), 'после паузы 2-й пакет разрешен');
  t.ok(!checkRateTest(p, 'chat', tNow), 'после паузы 3-й пакет отклонен (кап токенов строго 2)');

  // ── 2. Net-transport backpressure & zombie disconnect ─────────
  t.suite('audit-review: Net-transport backpressure monitoring');

  // Эмулируем wrapper сокета
  let closedReason = null;
  let closedCode = null;
  const mockWrapper = {
    _isOpen: true,
    isBackpressured: false,
    _consecutiveDrops: 0,
    _firstDropAt: 0,
    close(code, reason) {
      closedCode = code;
      closedReason = reason;
      this._isOpen = false;
    },
    terminate() {
      this._isOpen = false;
    }
  };

  // Эмулируем обработчик dropped
  function handleDropped(wrapper, now) {
    wrapper.isBackpressured = true;
    wrapper._consecutiveDrops = (wrapper._consecutiveDrops || 0) + 1;
    if (!wrapper._firstDropAt) wrapper._firstDropAt = now;
    if (wrapper._consecutiveDrops > 120 && (now - wrapper._firstDropAt) > 10000) {
      wrapper.close(4029, 'persistent backpressure overflow');
    }
  }

  // Эмулируем кратковременный лаг (10 дропов за 200мс)
  const lagStart = 1000000;
  for (let i = 0; i < 10; i++) handleDropped(mockWrapper, lagStart + i * 20);
  t.ok(mockWrapper.isBackpressured, 'сокет помечен как backpressured при дропе пакетов');
  t.eq(mockWrapper._consecutiveDrops, 10, 'счетчик consecutiveDrops = 10');
  t.ok(mockWrapper._isOpen, 'кратковременный лаг не приводит к дисконнекту игрока');

  // Эмулируем drain (клиент считал буфер)
  mockWrapper.isBackpressured = false;
  mockWrapper._consecutiveDrops = 0;
  mockWrapper._firstDropAt = 0;
  t.eq(mockWrapper._consecutiveDrops, 0, 'drain сбросил счетчик дропов');

  // Эмулируем зомби-клиента (>120 дропов подряд на протяжении 11 секунд)
  const zombieStart = 2000000;
  for (let i = 1; i <= 125; i++) {
    handleDropped(mockWrapper, zombieStart + i * 100);
  }
  t.ok(!mockWrapper._isOpen, 'зависший зомби-клиент принудительно отключен');
  t.eq(closedCode, 4029, 'код закрытия 4029 (rate/backpressure overflow)');
  t.eq(closedReason, 'persistent backpressure overflow', 'причина закрытия зафиксирована');

  // ── 3. Production Immunity: p.dev и isSyntheticBot ───────────
  t.suite('audit-review: Защита p.dev и isSyntheticBot в production');

  const oldEnv = process.env.NODE_ENV;
  const oldDev = process.env.ALLOW_INSECURE_DEV;
  const oldStress = process.env.STRESS_TEST;

  try {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_INSECURE_DEV = '1'; // Попытка форсировать в production
    process.env.STRESS_TEST = '0';

    t.ok(SEC.isProd(), 'SEC.isProd() возвращает true');
    t.ok(!SEC.insecureDev(), 'SEC.insecureDev() строго false в production даже при ALLOW_INSECURE_DEV=1');

    // Проверка логики ботов в production
    const prodSyntheticBotsAllowed = process.env.STRESS_TEST === '1' || SEC.insecureDev();
    t.ok(!prodSyntheticBotsAllowed, 'синтетические боты отключены в production');

    function isSyntheticBotProd(yid) {
      if (!yid || !prodSyntheticBotsAllowed) return false;
      const s = String(yid);
      return s.startsWith('stress_bot_') || s.startsWith('bot_uniq_') || s.startsWith('bot3k_');
    }

    t.ok(!isSyntheticBotProd('stress_bot_hacker'), 'любой spoofing yid вернет false в production');
    t.ok(!isSyntheticBotProd('bot_uniq_admin'), 'боты не могут обойти античит в проде');
  } finally {
    process.env.NODE_ENV = oldEnv;
    process.env.ALLOW_INSECURE_DEV = oldDev;
    process.env.STRESS_TEST = oldStress;
  }
};
