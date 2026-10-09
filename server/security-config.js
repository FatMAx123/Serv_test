// SERVER / SECURITY-CONFIG.JS — единая точка политик безопасности.
// Все «опасные» dev-возможности (вход без подписи, гость=GM, debug_* команды)
// включаются ТОЛЬКО явным флагом ALLOW_INSECURE_DEV=1 и никогда в production.
// Раньше достаточно было не задать NODE_ENV — и любой гость получал GM.
'use strict';

const crypto = require('crypto');

function isProd() {
  return process.env.NODE_ENV === 'production';
}

/** Небезопасный dev-режим: только явный opt-in и не production. */
function insecureDev() {
  return !isProd() && process.env.ALLOW_INSECURE_DEV === '1';
}

/** Сравнение секретов за постоянное время. Пустой ожидаемый секрет никогда не совпадает. */
function secretEquals(provided, expected) {
  if (!expected || !provided) return false;
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function normIp(ip) {
  ip = String(ip || '').trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function isLoopbackIp(ip) {
  ip = normIp(ip);
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

let _trusted = null;
function trustedProxies() {
  if (_trusted) return _trusted;
  const raw = process.env.TRUSTED_PROXIES || '';
  _trusted = new Set(raw.split(',').map(normIp).filter(Boolean));
  return _trusted;
}

/**
 * IP клиента. X-Real-IP / X-Forwarded-For учитываются ТОЛЬКО если соединение
 * пришло от доверенного прокси (loopback или TRUSTED_PROXIES=ip1,ip2).
 * Иначе любой клиент мог подставить заголовок и обойти rate-limit / лимит соединений.
 * @param {string} remote фактический адрес сокета
 * @param {(name:string)=>string|undefined} getHeader
 */
function resolveClientIp(remote, getHeader) {
  const r = normIp(remote);
  const trusted = isLoopbackIp(r) || trustedProxies().has(r) || process.env.TRUST_PROXY === '1';
  if (trusted && typeof getHeader === 'function') {
    const real = getHeader('x-real-ip');
    if (real && typeof real === 'string' && real.trim()) return normIp(real);
    const xff = getHeader('x-forwarded-for');
    if (xff) {
      const list = String(xff).split(',').map(s => s.trim()).filter(Boolean);
      if (list.length) return normIp(list[0]);
    }
  }
  return r;
}

/** Для node http.IncomingMessage */
function clientIpFromReq(req) {
  if (!req) return '';
  const h = req.headers || {};
  return resolveClientIp(req.socket && req.socket.remoteAddress, (n) => h[n]);
}

/**
 * Доступ к /metrics и подробному /healthz (H11). Раньше оба отдавали всем
 * нагрузку, онлайн, состояние пула БД, аптайм и объём адены в мире.
 *  - METRICS_TOKEN задан → нужен заголовок `Authorization: Bearer <token>`
 *    или `X-Metrics-Token: <token>` (Prometheus умеет bearer_token);
 *  - METRICS_PUBLIC=1     → открыто всем (явный opt-in);
 *  - вне production без токена → только прямой loopback без прокси-заголовков
 *    (curl на той же машине при локальной разработке).
 * В production без METRICS_TOKEN метрики закрыты для всех.
 * @param {string} remote фактический адрес сокета
 * @param {(name:string)=>string|undefined} getHeader
 */
function metricsAuthorized(remote, getHeader) {
  if (process.env.METRICS_PUBLIC === '1') return true;
  const gh = typeof getHeader === 'function' ? getHeader : () => undefined;
  const token = process.env.METRICS_TOKEN || '';
  if (token) {
    const auth = String(gh('authorization') || '');
    const bearer = /^bearer\s+(.+)$/i.exec(auth);
    const provided = (bearer && bearer[1].trim()) || String(gh('x-metrics-token') || '').trim();
    if (provided && secretEquals(provided, token)) return true;
  }
  if (isProd()) return false;
  const proxied = gh('x-real-ip') || gh('x-forwarded-for') || gh('forwarded');
  return isLoopbackIp(remote) && !proxied;
}

/*
 * H12: белый список Origin для WebSocket и CORS. Раньше вне STRICT_CORS=1
 * принимался любой Origin, а проверка `origin.includes('localhost')`
 * пропускала https://localhost.evil.com; *.onrender.com / *.sslip.io —
 * домены, где сайт может разместить кто угодно.
 * Разрешено:
 *  - Origin с тем же хостом, что и запрос (Host);
 *  - Яндекс Игры: yandex.{ru,net,com,kz,by,uz,com.tr} и поддомены
 *    (iframe игры — *.games.s3.yandex.net / *.yandex.net);
 *  - VK: vk.com, *.vk.com, *.vk.me;
 *  - CORS_ORIGINS=https://my.site,example.org (полный origin или хост);
 *  - localhost/127.0.0.1 — только вне production (или CORS_ALLOW_LOCALHOST=1).
 * Без заголовка Origin (не браузер) — разрешено; Origin "null" (sandbox-iframe,
 * file://) — разрешён, если не задан STRICT_CORS=1.
 */
const BUILTIN_ORIGIN_SUFFIXES = [
  'yandex.ru', 'yandex.net', 'yandex.com', 'yandex.kz', 'yandex.by', 'yandex.uz', 'yandex.com.tr',
  'vk.com', 'vk.me'
  // Адреса своего сервера (IP, sslip.io, домен) — в CORS_ORIGINS, а не в коде.
];
if (process.env.NODE_ENV === 'production' && !String(process.env.CORS_ORIGINS || '').trim()) {
  console.warn('[security] CORS_ORIGINS не задан: разрешены только Origin = Host запроса, Яндекс и VK. ' +
    'Если клиент ходит на сервер с другого адреса (IP ↔ sslip.io/домен), добавьте их: CORS_ORIGINS=host1,host2');
}
function hostMatches(host, base) {
  return host === base || host.endsWith('.' + base);
}
function corsList() {
  return String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}
/**
 * @param {string} origin значение заголовка Origin
 * @param {string} [hostHeader] заголовок Host запроса
 * @returns {boolean}
 */
function originAllowed(origin, hostHeader, forwardedHost) {
  if (origin == null || origin === '' || origin === 'undefined') return true;
  if (origin === 'null') return process.env.STRICT_CORS !== '1';
  if (process.env.ALLOW_ANY_ORIGIN === '1' && !isProd()) return true;
  let u;
  try { u = new URL(String(origin)); } catch (_) { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  const host = u.hostname.toLowerCase();
  const reqHost = String(hostHeader || '').toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  if (reqHost && host === reqHost) return true;
  // за nginx Host может быть адресом upstream — тогда сравниваем X-Forwarded-Host
  // (браузер не может выставить его в WS-рукопожатии)
  const fwdHost = String(forwardedHost || '').split(',')[0].trim().toLowerCase().replace(/:\d+$/, '');
  if (fwdHost && host === fwdHost) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
    return !isProd() || process.env.CORS_ALLOW_LOCALHOST === '1';
  }
  for (const base of BUILTIN_ORIGIN_SUFFIXES) if (hostMatches(host, base)) return true;
  const list = corsList();
  const full = (u.protocol + '//' + u.host).toLowerCase();
  for (const item of list) {
    if (item === '*') return !isProd() || process.env.CORS_ALLOW_ANY === '1';
    if (item === full || item === host) return true;
    if (item.startsWith('*.') && hostMatches(host, item.slice(2))) return true;
  }
  return false;
}

module.exports = { isProd, insecureDev, secretEquals, isLoopbackIp, resolveClientIp, clientIpFromReq, normIp, metricsAuthorized, originAllowed };
