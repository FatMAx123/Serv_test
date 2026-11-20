// ============================================================
//  SCRIPTS / HEALTHCHECK.JS
//  Ожидание готовности сервера после деплоя/рестарта: опрашивает
//  http://127.0.0.1:PORT/healthz, пока сервер не ответит ok и (в кластере)
//  не поднимутся все воркеры. Код выхода 0 — готов, 1 — не дождались.
//  Использование: node scripts/healthcheck.js [--timeout=90] [--port=8080]
// ============================================================
'use strict';

const http = require('http');

function arg(name, def) {
  const a = process.argv.find((s) => s.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : def;
}

const PORT = parseInt(arg('port', process.env.PORT || '8080'), 10);
const TIMEOUT_MS = Math.max(5, parseInt(arg('timeout', '90'), 10) || 90) * 1000;
const started = Date.now();
let last = 'нет ответа';

function probe() {
  const req = http.get({ host: '127.0.0.1', port: PORT, path: '/healthz', timeout: 5000, agent: false }, (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      let body = null;
      try { body = JSON.parse(data); } catch (_) { }
      last = 'HTTP ' + res.statusCode + ' ' + String(data).slice(0, 160);
      const allWorkers = !body || body.expectedWorkers == null || (body.activeWorkers | 0) >= (body.expectedWorkers | 0);
      if (res.statusCode === 200 && body && body.ok !== false && allWorkers) {
        console.log('[healthcheck] ✅ сервер готов: ' + last);
        process.exit(0);
      }
      retry();
    });
  });
  req.on('timeout', () => { req.destroy(); last = 'таймаут'; });
  req.on('error', (e) => { last = 'ошибка: ' + e.message; retry(); });
}

function retry() {
  if (Date.now() - started > TIMEOUT_MS) {
    console.error('[healthcheck] ❌ сервер не поднялся за ' + Math.round(TIMEOUT_MS / 1000) + ' с: ' + last);
    process.exit(1);
  }
  setTimeout(probe, 2000);
}

probe();
