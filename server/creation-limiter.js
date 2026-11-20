// SERVER / CREATION-LIMITER.JS — лимит создания новых персонажей/гостевых аккаунтов.
// Раньше новый гость (local_<любой> + токен) создавал профиль на каждый вход без всяких
// ограничений: с одного IP можно было наплодить сотни тысяч файлов профилей (диск, индекс
// PlayerDb, readdir каталога data/ на каждом логине) и занять все ники.
//  - per-IP: NEW_CHARS_PER_IP_10MIN (по умолчанию 10) за скользящие 10 минут;
//  - глобально: NEW_CHARS_GLOBAL_PER_MIN (в production по умолчанию 120) в минуту на процесс.
// Loopback не лимитируется per-IP: за локальным прокси без X-Real-IP все клиенты выглядят
// как 127.0.0.1, и per-IP лимит заблокировал бы всех. Глобальный потолок действует всегда.
'use strict';

const SEC = require('./security-config.js');

const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 1000;

function intEnv(name, def) {
  const n = parseInt(process.env[name] || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : def;
}

const byIp = new Map(); // ip -> number[] (метки времени созданий)
let globalHits = [];

function prune(list, now, windowMs) {
  let i = 0;
  while (i < list.length && now - list[i] > windowMs) i++;
  return i > 0 ? list.slice(i) : list;
}

/**
 * Проверить и (при ok) учесть создание.
 * @param {string} ip
 * @param {{peek?:boolean, now?:number}} [opts] peek — только проверить, не учитывая
 * @returns {{ok:boolean, reason?:string, retryAfterSec?:number}}
 */
function check(ip, opts) {
  const now = (opts && opts.now) || Date.now();
  const perIpMax = intEnv('NEW_CHARS_PER_IP_10MIN', 10);
  // вне production глобальный потолок выключен по умолчанию (локальные тесты создают много гостей)
  const globalMax = intEnv('NEW_CHARS_GLOBAL_PER_MIN', SEC.isProd() ? 120 : 0);

  globalHits = prune(globalHits, now, GLOBAL_WINDOW_MS);
  if (globalMax > 0 && globalHits.length >= globalMax) {
    return { ok: false, reason: 'create_busy', retryAfterSec: Math.ceil((GLOBAL_WINDOW_MS - (now - globalHits[0])) / 1000) };
  }

  const key = SEC.normIp(ip) || 'unknown';
  const exemptIp = SEC.isLoopbackIp(key);
  let list = byIp.get(key) || [];
  list = prune(list, now, PER_IP_WINDOW_MS);
  if (!exemptIp && perIpMax > 0 && list.length >= perIpMax) {
    byIp.set(key, list);
    return { ok: false, reason: 'create_rate', retryAfterSec: Math.ceil((PER_IP_WINDOW_MS - (now - list[0])) / 1000) };
  }

  if (!(opts && opts.peek)) {
    globalHits.push(now);
    if (!exemptIp) {
      list.push(now);
      byIp.set(key, list);
    }
  }
  if (byIp.size > 50000) {
    for (const [k, v] of byIp) {
      if (!v.length || now - v[v.length - 1] > PER_IP_WINDOW_MS) byIp.delete(k);
    }
  }
  return { ok: true };
}

function resetForTesting() {
  byIp.clear();
  globalHits = [];
}

module.exports = { check, resetForTesting };
