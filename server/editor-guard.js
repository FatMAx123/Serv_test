// ============================================================
//  EDITOR-GUARD.JS — файлы редактора не отдаются игроку, в том числе
//  с модифицированным клиентом. Доступ: живой GM-токен (cookie) на
//  игровом порту; на dev-меню :3000 — только EDITOR_ENABLED + loopback.
// ============================================================
'use strict';
const crypto = require('crypto');

const COOKIE = 'ps_ed';
const TTL_MS = 8 * 60 * 60 * 1000;
const tokens = new Map(); // token -> { yid, pid, exp }

function pathOnly(url) {
  return String(url || '').split('?')[0].split('#')[0].replace(/\\/g, '/').toLowerCase();
}

function isEditorAsset(url) {
  const p = pathOnly(url);
  return /(^|\/)editor\.html$/.test(p)
    || /(^|\/)editor\.js$/.test(p)
    || /(^|\/)editor-engine-layout\.js$/.test(p)
    || /(^|\/)editor-engine\.css$/.test(p);
}

function tokenFromQuery(url) {
  try {
    const q = String(url || '').split('?')[1] || '';
    const params = new URLSearchParams(q);
    return String(params.get('k') || params.get('t') || '').trim();
  } catch (_) { return ''; }
}

function tokenFromCookie(req) {
  const raw = String((req && req.headers && req.headers.cookie) || '');
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].trim();
    if (s.indexOf(COOKIE + '=') === 0) return decodeURIComponent(s.slice(COOKIE.length + 1).trim());
  }
  return '';
}

function valid(token) {
  if (!token || token.length < 16) return false;
  const rec = tokens.get(token);
  if (!rec) return false;
  if (Date.now() > rec.exp) { tokens.delete(token); return false; }
  return true;
}

function issue(p) {
  if (!p) return '';
  revokePid(p.pid);
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, {
    yid: String(p.yid || ''),
    pid: p.pid | 0,
    exp: Date.now() + TTL_MS
  });
  p.editorKey = token;
  return token;
}

function revoke(token) {
  if (token) tokens.delete(token);
}

function revokePid(pid) {
  const id = pid | 0;
  for (const [tok, rec] of tokens) {
    if (rec && rec.pid === id) tokens.delete(tok);
  }
}

function cookieHeader(token) {
  return COOKIE + '=' + encodeURIComponent(token)
    + '; HttpOnly; SameSite=Lax; Path=/; Max-Age=' + Math.floor(TTL_MS / 1000);
}

function registerToken(token, meta) {
  if (!token || typeof token !== 'string') return false;
  const t = token.trim();
  if (t.length < 16) return false;
  tokens.set(t, {
    yid: (meta && meta.yid) || 'dev_session',
    pid: (meta && meta.pid) || 0,
    exp: Date.now() + TTL_MS
  });
  return true;
}

function allowAsset(req) {
  if (valid(tokenFromCookie(req))) return true;
  if (req && req.url && valid(tokenFromQuery(req.url))) return true;
  if (isLoopbackReq(req) && (process.env.EDITOR_ENABLED === '1' || process.env.EDITOR_ENABLED === 'true')) return true;
  return false;
}

function allowSessionKey(url) {
  return valid(tokenFromQuery(url));
}

function isLoopbackReq(req) {
  const ip = String((req && req.socket && req.socket.remoteAddress) || '');
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.endsWith('127.0.0.1');
}

module.exports = {
  COOKIE,
  isEditorAsset,
  issue,
  registerToken,
  revoke,
  revokePid,
  valid,
  allowAsset,
  allowSessionKey,
  cookieHeader,
  isLoopbackReq,
  tokenFromQuery,
  tokenFromCookie
};
