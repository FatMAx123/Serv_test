// ============================================================
//  SCRIPTS / WATCHDOG.JS
//  Автономный сторожевой таймер (Watchdog) для MMO-сервера:
//  - Каждые 10 секунд опрашивает http://127.0.0.1:PORT/healthz
//  - При 3 подряд сбоях (завис Event Loop, отвалился процесс, OOM)
//    принудительно зачищает зомби-процессы и выполняет pm2 restart
// ============================================================
'use strict';

const http = require('http');
const { execSync, exec } = require('child_process');

const PORT = parseInt(process.env.PORT || '8080', 10);
const CHECK_INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_MS || '10000', 10);
const MAX_FAILURES = parseInt(process.env.MAX_FAILURES || '8', 10);
const TIMEOUT_MS = 15000;

let consecutiveFailures = 0;
let isRestarting = false;

function checkHealth() {
  if (isRestarting) return;

  const req = http.get({
    host: '127.0.0.1',
    port: PORT,
    path: '/healthz',
    timeout: TIMEOUT_MS
  }, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      if (res.statusCode === 200) {
        if (consecutiveFailures > 0) {
          console.log(`[Watchdog] ✅ Сервер восстановил отзывчивость (было сбоев: ${consecutiveFailures})`);
        }
        consecutiveFailures = 0;
      } else {
        handleFailure(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`);
      }
    });
  });

  req.on('timeout', () => {
    req.destroy();
    handleFailure(`Превышен таймаут ответа /healthz (${TIMEOUT_MS} мс)`);
  });

  req.on('error', (err) => {
    handleFailure(`Ошибка подключения: ${err.message}`);
  });
}

function handleFailure(reason) {
  consecutiveFailures++;
  console.warn(`[Watchdog] ⚠️ Сбой проверки здоровья #${consecutiveFailures}/${MAX_FAILURES}: ${reason}`);

  if (consecutiveFailures >= MAX_FAILURES) {
    triggerAutoRestart(reason);
  }
}

function cleanupZombies() {
  console.log('[Watchdog] 🧹 Зачистка остаточных процессов ботов перед перезапуском...');
  try {
    if (process.platform === 'linux') {
      execSync("pkill -9 -f 'node.*stress-test-3000' 2>/dev/null || true");
    }
  } catch (e) {
    console.error('[Watchdog] Ошибка зачистки:', e && e.message);
  }
}

function triggerAutoRestart(reason) {
  if (isRestarting) return;
  isRestarting = true;
  console.error(`[Watchdog] 🚨 КРИТИЧЕСКИЙ СБОЙ: Сервер не отвечает ${MAX_FAILURES} раз подряд (${reason}). Запуск аварийного рестарта!`);

  cleanupZombies();

  exec('pm2 restart project-steam-mmo --update-env', (err, stdout, stderr) => {
    if (err) {
      console.error('[Watchdog] Ошибка вызова pm2 restart:', err.message);
    } else {
      console.log('[Watchdog] 🔄 Команда pm2 restart успешно отправлена:\n' + stdout);
    }
    // 15 секунд серверу на прогрев и инициализацию перед возобновлением проверок
    setTimeout(() => {
      consecutiveFailures = 0;
      isRestarting = false;
      console.log('[Watchdog] Наблюдение возобновлено после рестарта.');
    }, 15000);
  });
}

console.log(`[Watchdog] 🛡️ Сторожевой сервис запущен (Порт: ${PORT}, Интервал: ${CHECK_INTERVAL_MS}мс, Порог сбоев: ${MAX_FAILURES})`);
setInterval(checkHealth, CHECK_INTERVAL_MS);
checkHealth();
