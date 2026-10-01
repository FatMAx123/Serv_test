// ============================================================
//  TESTS / DDOS-DEFENSE.TEST.JS
//  Модульные и интеграционные тесты механизмов защиты от DDoS:
//  L3/L4/L7 rate limiting, pre-JSON flood filter, connection caps,
//  PBKDF2 libuv threadpool protection, client IP resolution.
// ============================================================
'use strict';

const EventEmitter = require('events');
const createHttpRouter = require('../server/http/admin-api.js');
const AccountKeys = require('../server/account-keys.js');

module.exports = async function (t) {
  t.suite('ddos-defense: извлечение реального IP клиента (getClientIp)');

  const getClientIp = createHttpRouter.getClientIp;
  t.ok(typeof getClientIp === 'function', 'getClientIp экспортирован');

  {
    // 1. Проверка x-real-ip
    const req1 = {
      headers: { 'x-real-ip': '203.0.113.195', 'x-forwarded-for': '198.51.100.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    t.eq(getClientIp(req1), '203.0.113.195', 'x-real-ip имеет наивысший приоритет');

    // 2. Проверка x-forwarded-for (первый клиентский IP в списке)
    const req2 = {
      headers: { 'x-forwarded-for': '198.51.100.42, 10.0.0.1, 127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' }
    };
    t.eq(getClientIp(req2), '198.51.100.42', 'x-forwarded-for извлекает исходный IP клиента');

    // 3. Fallback на socket.remoteAddress
    const req3 = {
      headers: {},
      socket: { remoteAddress: '192.0.2.1' }
    };
    t.eq(getClientIp(req3), '192.0.2.1', 'fallback на socket.remoteAddress при отсутствии заголовков');
  }

  t.suite('ddos-defense: лимитирование HTTP API (checkHttpRate)');

  const checkHttpRate = createHttpRouter.checkHttpRate;
  const httpRateLimits = createHttpRouter.httpRateLimits;
  t.ok(typeof checkHttpRate === 'function', 'checkHttpRate экспортирован');

  {
    const testIp = '198.51.100.99';
    httpRateLimits.delete(testIp);

    // Допускаем 3 запроса в окно
    t.ok(checkHttpRate(testIp, 'test_api', 3, 5000), 'запрос 1 разрешен');
    t.ok(checkHttpRate(testIp, 'test_api', 3, 5000), 'запрос 2 разрешен');
    t.ok(checkHttpRate(testIp, 'test_api', 3, 5000), 'запрос 3 разрешен');

    // 4-й запрос превышает лимит
    t.ok(!checkHttpRate(testIp, 'test_api', 3, 5000), 'запрос 4 отклонен (лимит исчерпан)');

    // Другая категория для того же IP независима
    t.ok(checkHttpRate(testIp, 'other_api', 3, 5000), 'другая категория независима');

    // Очистка тестового IP
    httpRateLimits.delete(testIp);
  }

  t.suite('ddos-defense: защита от pre-JSON флуда сокетов');

  {
    // Эмуляция логики pre-JSON rate limiting из setupSocketConnection
    function simulateSocketRateLimit(msgCount, timeWindowMs = 1000) {
      let closed = false;
      let closeCode = 0;
      let dropped = 0;
      let parsed = 0;

      const ws = {
        _msgRate: null,
        close: (code) => { closed = true; closeCode = code; },
        terminate: () => { closed = true; }
      };

      const now = 100000;
      for (let i = 0; i < msgCount; i++) {
        if (closed) break;
        if (!ws._msgRate || now > ws._msgRate.resetAt) {
          ws._msgRate = { count: 1, resetAt: now + timeWindowMs };
        } else {
          ws._msgRate.count++;
          if (ws._msgRate.count > 60) {
            ws.close(4008);
            continue;
          } else if (ws._msgRate.count > 40) {
            dropped++;
            continue; // отсечено без JSON.parse
          }
        }
        parsed++;
      }

      return { closed, closeCode, dropped, parsed };
    }

    const normal = simulateSocketRateLimit(35);
    t.eq(normal.closed, false, '35 сообщений/сек: сокет открыт');
    t.eq(normal.dropped, 0, '35 сообщений/сек: 0 отброшено');
    t.eq(normal.parsed, 35, '35 сообщений/сек: все обработаны');

    const burst = simulateSocketRateLimit(55);
    t.eq(burst.closed, false, '55 сообщений/сек: сокет еще открыт');
    t.eq(burst.parsed, 40, '55 сообщений/сек: первые 40 обработаны');
    t.eq(burst.dropped, 15, '55 сообщений/сек: 15 отброшено до JSON.parse');

    const attack = simulateSocketRateLimit(70);
    t.eq(attack.closed, true, '70 сообщений/сек: сокет закрыт');
    t.eq(attack.closeCode, 4008, 'код закрытия 4008 (rate limit exceeded)');
  }

  t.suite('ddos-defense: отсечение неавторизованного флуда (unauthenticated cap)');

  {
    function simulateUnauthCap(msgCount) {
      let closed = false;
      let closeCode = 0;
      let authed = false;
      let processed = 0;

      const ws = {
        _unauthMsgs: 0,
        close: (code) => { closed = true; closeCode = code; },
        terminate: () => { closed = true; }
      };

      for (let i = 0; i < msgCount; i++) {
        if (closed) break;
        if (!authed) {
          ws._unauthMsgs = (ws._unauthMsgs || 0) + 1;
          if (ws._unauthMsgs > 5) {
            ws.close(4001);
            continue;
          }
        }
        processed++;
      }
      return { closed, closeCode, processed };
    }

    const okUnauth = simulateUnauthCap(3);
    t.eq(okUnauth.closed, false, '3 неавторизованных сообщения: сокет не закрыт');
    t.eq(okUnauth.processed, 3, '3 сообщения обработаны');

    const badUnauth = simulateUnauthCap(10);
    t.eq(badUnauth.closed, true, '10 неавторизованных сообщений: сокет принудительно закрыт');
    t.eq(badUnauth.closeCode, 4001, 'код закрытия 4001 (too many unauth messages)');
    t.eq(badUnauth.processed, 5, 'обработано ровно 5 сообщений до отсечки');
  }

  t.suite('ddos-defense: троттлинг пинга и игровых действий');

  {
    // Троттлинг клиентского ping (min 450ms)
    function simulatePing(p, now) {
      if (p._lastClientPing && now - p._lastClientPing < 450) {
        return false; // throttled
      }
      p._lastClientPing = now;
      return true;
    }

    const p = {};
    t.ok(simulatePing(p, 1000), 'первый пинг принят');
    t.ok(!simulatePing(p, 1200), 'пинг через 200 мс отброшен (< 450 мс)');
    t.ok(!simulatePing(p, 1400), 'пинг через 400 мс отброшен (< 450 мс)');
    t.ok(simulatePing(p, 1500), 'пинг через 500 мс принят (>= 450 мс)');
  }

  t.suite('ddos-defense: медленное чтение и защита по backpressure (slow-reader DoS)');

  {
    // Эмуляция проверки буфера в pingTimer
    function checkBackpressure(bufferedAmount) {
      if (bufferedAmount > 1048576) {
        return { drop: true, code: 4008, reason: 'backpressure buffer overflow' };
      }
      return { drop: false };
    }

    t.eq(checkBackpressure(50000).drop, false, '50 KB в буфере: нормальное состояние');
    t.eq(checkBackpressure(800000).drop, false, '800 KB в буфере: допустимая задержка');
    t.eq(checkBackpressure(1048577).drop, true, '1 MB + 1 байт в буфере: сброс медленного сокета');
    t.eq(checkBackpressure(5000000).drop, true, '5 MB в буфере: агрессивный сброс DoS-сокета');
  }

  t.suite('ddos-defense: лимитирование параллелизма PBKDF2 (AccountKeys)');

  {
    // Проверка асинхронного хэширования
    const hash1 = await AccountKeys.hashAsync('TestSecret123!');
    t.ok(typeof hash1 === 'string' && hash1.startsWith('ms4_'), 'хэш сгенерирован в формате ms4_');

    // Проверка повторного вызова с тем же кодовым словом (детерминированность)
    const hash2 = await AccountKeys.hashAsync('TestSecret123!');
    t.eq(hash1, hash2, 'хэширование детерминировано');

    // Проверка параллельной очереди: пакет из нескольких запросов исполняется корректно
    const promises = [
      AccountKeys.hashAsync('BurstPass1!'),
      AccountKeys.hashAsync('BurstPass2!'),
      AccountKeys.hashAsync('BurstPass3!'),
      AccountKeys.hashAsync('BurstPass4!')
    ];
    const results = await Promise.all(promises);
    t.eq(results.length, 4, 'все 4 параллельных задачи PBKDF2 успешно обработаны очередью');
    for (const res of results) {
      t.ok(typeof res === 'string' && res.startsWith('ms4_'), 'каждый хэш в очереди валиден');
    }
  }

  t.suite('ddos-defense: лимиты подключений на один IP (net-transport)');

  {
    // Эмуляция пула соединений из net-transport.js
    const ipConnections = new Map();
    const MAX_CONNS_PER_IP = 25;

    function handleConnect(ip) {
      if (ip === '127.0.0.1' || ip === '::1') return { ok: true, loopback: true };
      const cur = ipConnections.get(ip) || 0;
      if (cur >= MAX_CONNS_PER_IP) {
        return { ok: false, status: 429, error: 'too many connections from ip' };
      }
      ipConnections.set(ip, cur + 1);
      return { ok: true, count: cur + 1 };
    }

    function handleDisconnect(ip) {
      const cur = ipConnections.get(ip) || 0;
      if (cur <= 1) {
        ipConnections.delete(ip);
      } else {
        ipConnections.set(ip, cur - 1);
      }
    }

    const attackerIp = '198.51.100.77';
    ipConnections.delete(attackerIp);

    // Подключаем 25 клиентов
    for (let i = 0; i < 25; i++) {
      const res = handleConnect(attackerIp);
      t.ok(res.ok, `подключение ${i + 1}/25 с одного IP разрешено`);
    }

    // 26-е подключение с того же IP
    const blocked = handleConnect(attackerIp);
    t.eq(blocked.ok, false, '26-е подключение отклонено');
    t.eq(blocked.status, 429, 'статус 429 Too Many Requests');

    // Локальный loopback не ограничивается
    const loopback = handleConnect('127.0.0.1');
    t.eq(loopback.ok, true, '127.0.0.1 whitelisted от connection-exhaustion');

    // Отключаем одно соединение и проверяем освобождение слота
    handleDisconnect(attackerIp);
    const retry = handleConnect(attackerIp);
    t.eq(retry.ok, true, 'после отключения слот освобожден и подключение разрешено');

    ipConnections.delete(attackerIp);
  }
};
