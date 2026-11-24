// SERVER / HTTP / ADMIN-API.JS — HTTP API, маршрутизация эндпоинтов, админ-панель и безопасность редактора.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MR = require('../../shared/moderation-rules.js');
const Mod = require('../moderation.js');
const DB = require('../db.js');
const PlayerDb = require('../player-db.js');
const AUTH = require('../auth.js');
// Редактор мира — только локально (server/editor-gate.js): на проде заглушка, ручек нет
const EditorGate = require('../editor-gate.js');
const EditorGuard = EditorGate.EditorGuard;
const CS = require('../../shared/class-system.js');
const CH = require('../../shared/char-rules.js');
const COS = require('../../shared/cosmetics-db.js');
const G = require('../../shared/game-rules.js');
const AccountKeys = require('../account-keys.js');
const SEC = require('../security-config.js');
const GuestAuth = require('../guest-auth.js');
const CreationLimiter = require('../creation-limiter.js');

const JSON_HEAD = { 'Content-Type': 'application/json; charset=utf-8' };

const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function applyCors(req, res) {
  // H12: раньше отражался любой Origin — любой сайт читал ответы API из
  // браузера игрока. Теперь ACAO только для белого списка.
  const h = req.headers || {};
  const origin = h.origin;
  res.setHeader('Vary', 'Origin');
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // не браузерный запрос / тот же сайт
  } else if (SEC.originAllowed(origin, h.host, h['x-forwarded-host'])) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    return; // без ACAO браузер не отдаст ответ чужому сайту
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mod-Secret, Authorization, X-Editor-Key');
}

/**
 * Извлекает реальный IP клиента с учетом реверс-прокси Nginx и uWebSockets.js loopback proxy
 */
function getClientIp(req) {
  // SEC: заголовки прокси учитываются только от доверенного прокси (см. security-config.js)
  return SEC.clientIpFromReq(req);
}

/**
 * Чтение тела запроса буферами. Раньше `body += chunk` склеивал Buffer как строки: многобайтный
 * UTF-8 символ (кириллица в имени персонажа), разрезанный границей чанка, превращался в «�»,
 * а лимит считался в символах, а не в байтах.
 * @param {number} limit лимит в байтах
 * @param {Function} onTooBig вызывается один раз при превышении (до req.destroy)
 * @param {(body:string)=>void} onDone
 */
function collectBody(req, limit, onTooBig, onDone) {
  const chunks = [];
  let total = 0;
  let tooBig = false;
  req.on('data', (chunk) => {
    if (tooBig) return;
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
    total += buf.length;
    if (total > limit) {
      tooBig = true;
      chunks.length = 0;
      try { onTooBig(); } catch (_) {}
      try { req.destroy(); } catch (_) {}
      return;
    }
    chunks.push(buf);
  });
  req.on('end', () => {
    if (tooBig) return;
    onDone(chunks.length ? Buffer.concat(chunks).toString('utf8') : '');
  });
}

const httpRateLimits = new Map();

/**
 * Скользящее окно лимитирования запросов по IP для защиты публичных HTTP эндпоинтов
 */
function checkHttpRate(ip, category, maxRequests, windowMs) {
  if (!ip) return true;
  if (process.env.ALLOW_UNLIMITED_WS === '1' && (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1')) {
    return true;
  }
  const now = Date.now();
  let entry = httpRateLimits.get(ip);
  if (!entry) {
    entry = {};
    httpRateLimits.set(ip, entry);
  }
  const bucket = entry[category];
  if (!bucket || now > bucket.resetAt) {
    entry[category] = { count: 1, resetAt: now + windowMs };
    return true;
  }
  bucket.count++;
  if (bucket.count > maxRequests) {
    return false;
  }
  return true;
}

const httpRateLimitSweeper = setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of httpRateLimits) {
    let hasActive = false;
    for (const cat in entry) {
      if (entry[cat].resetAt > now) {
        hasActive = true;
      } else {
        delete entry[cat];
      }
    }
    if (!hasActive) httpRateLimits.delete(ip);
  }
}, 60000);
if (httpRateLimitSweeper.unref) httpRateLimitSweeper.unref();

function modAuthorized(req) {
  // VULN-SEC-01: Полное разделение секретов модерации и OAuth Яндекс-приложения.
  // Запрещен fallback на YANDEX_APP_SECRET. При предоставлении неавторизованного секрета доступ строго отклоняется.
  const secret = process.env.MOD_SECRET || '';
  const provided = String((req.headers && (req.headers['x-mod-secret'] || req.headers['x-stress-secret'] || req.headers['x-editor-secret'])) || '');

  // Если клиент предоставил заголовок секрета:
  if (provided) {
    // SEC: удалён захардкоженный fallback 'ps-stress-perf-2026' и STRESS_SECRET (секрет нагрузочных тестов
    // не должен давать права администратора). Без MOD_SECRET (>=24 символов) админ-доступа по заголовку нет.
    if (!secret || secret.length < 24) return false;
    return SEC.secretEquals(provided, secret);
  }

  // Если заголовок секрета не передан:
  // Если MOD_SECRET настроен на сервере — доступ без секрета запрещён даже с localhost
  if (secret) return false;

  // В продакшене без секрета доступ к API модерации/админки строго запрещён (даже с localhost)
  if (process.env.NODE_ENV === 'production') return false;

  // Локальный dev-режим без MOD_SECRET: доступ без заголовка разрешен только если реальный клиент пришел с loopback (защита от uWS loopback proxy)
  const clientIp = getClientIp(req);
  return clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1';
}

/** Ручки редактора мира (сохранение сцены, ассеты, сборка мира, сессия редактора). */
function isEditorRoute(url) {
  const u = String(url || '');
  return u.indexOf('/api/save-editor') !== -1 || u.indexOf('/api/save-terrain-paint') !== -1 ||
    u.indexOf('/api/save-icon') !== -1 || u.indexOf('/api/editor/') !== -1;
}

function editorDisabled(res) {
  res.writeHead(403, JSON_HEAD);
  res.end(JSON.stringify({ ok: false, error: 'editor disabled (set EDITOR_ENABLED=1 locally or provide X-Mod-Secret)' }));
}

function createHttpRouter(ctx) {
  const {
    getLastTickAt,
    metricsPayload,
    worldTimePayload,
    buildLeaderboard,
    players,
    pidByYid,
    wsByPid,
    loggingIn,
    lbTouch,
    lbDrop,
    clanLeaveOnCharDelete,
    send,
    detachPlayer,
    kickYid,
    onCharDeleteKick = null,
    broadcastGmSync = null,
    getOnlineCount = null,
    isGM,
    rebuildServerSpots,
    sanitizeCharName,
    isBadKey,
    YANDEX_SECRET,
    EDITOR_ENABLED,
    CLIENT_DIR,
    SHARED_DIR
  } = ctx;

  const EditorApiMod = EditorGate.editorApiModule();
  const editorApi = EditorApiMod ? EditorApiMod.createEditorApi(ctx, { collectBody, modAuthorized, editorDisabled }) : null;
  /** Запись мира редактором (WS save_editor_data); на проде редактора нет. */
  function saveEditorOverridesToDisk(data, opts) {
    if (!editorApi) return { ok: false, code: 'EDISABLED', error: 'редактор выключен на этом сервере' };
    return editorApi.saveEditorOverridesToDisk(data, opts);
  }

  async function handleCharsApiBody(url, data, ip) {
    // умолчание verifySignature: в production подпись без issuedAt не принимается (окно 5 мин)
    const v = AUTH.verifySignature(data.data, data.signature, YANDEX_SECRET);
    if (!v.ok) return { code: 403, body: { ok: false, error: 'forbidden' } };
    const parsed = AUTH.parseLoginData(data.data);
    // Без обрезки: гостевой yid бывает до 70 символов (GUEST_YID_RE), обрезка до 64 уводила
    // HTTP API в чужой (усечённый) аккаунт. Длину и символы проверяет isValidYid (≤128).
    const yid = parsed && parsed.yid && !parsed.anonFallback ? String(parsed.yid) : '';
    if (!yid || isBadKey(yid) || !GuestAuth.isValidYid(yid)) return { code: 400, body: { ok: false, error: 'yid' } };
    const ban = Mod.banInfo(yid);
    if (ban) return { code: 403, body: { ok: false, error: 'banned', until: ban.until } };

    // SEC (P1-C): владение гостевым аккаунтом проверяется по ВСЕМ персонажам и ключу,
    // а не только по первому персонажу; без токена доступа нет.
    let guestOwn = null;
    let rotatedToken = null;
    if (GuestAuth.isGuestYid(yid)) {
      guestOwn = await GuestAuth.verifyGuestOwnership(DB, AccountKeys, yid, parsed.guestToken);
      if (!guestOwn.ok) return { code: 403, body: { ok: false, error: 'bad_guest_token' } };
      const onlinePid = pidByYid && pidByYid.get ? pidByYid.get(yid) : null;
      const onlineP = (onlinePid != null && players && players.get) ? players.get(onlinePid) : null;
      const online = new Set(onlineP ? [CH.normalizeCharId(onlineP.charId)] : []);
      await GuestAuth.pinTokenHash(DB, yid, guestOwn, online);
      // H3: старый вычисляемый токен — сразу заменяем случайным и отдаём клиенту
      if (guestOwn.legacy) {
        try { rotatedToken = (await GuestAuth.issueToken(DB, yid, { dropHash: guestOwn.tokenHash })).token; }
        catch (e) { console.error('[chars] rotate token', yid, e && e.message); }
      }
    }

    if (url === '/api/chars') {
      const chars = await DB.listChars(yid);
      return { code: 200, body: { ok: true, guestToken: rotatedToken || undefined, chars: chars, max: CH.MAX_SLOTS } };
    }

    if (url === '/api/chars/create') {
      if (loggingIn.has(yid)) return { code: 409, body: { ok: false, error: 'busy' } };
      loggingIn.add(yid);
      try {
        const name = sanitizeCharName(data.name);
        if (!name) return { code: 400, body: { ok: false, error: 'name' } };
        const vCreate = CS.validateCreate({
          name: name,
          race: data.race || 'human',
          gender: data.gender || 'male',
          cls: data.cls || data.classId || 'operator'
        });
        if (!vCreate.ok) return { code: 400, body: { ok: false, error: vCreate.errors[0] || 'args' } };
        const list = await DB.listChars(yid);
        if (list.length >= CH.MAX_SLOTS) return { code: 400, body: { ok: false, error: 'slots' } };
        const taken = list.some((c) => String(c.name || '').toLowerCase() === name.toLowerCase());
        if (taken || (PlayerDb && typeof PlayerDb.isNameTaken === 'function' && PlayerDb.isNameTaken(name, yid))) {
          return { code: 400, body: { ok: false, error: 'taken' } };
        }
        // Лимит создания персонажей (per-IP + глобальный потолок), общий с WS-логином
        const lim = CreationLimiter.check(ip);
        if (!lim.ok) return { code: 429, body: { ok: false, error: lim.reason, retryAfterSec: lim.retryAfterSec } };
        const charId = list.length === 0 ? CH.DEFAULT_CHAR_ID : CH.newCharId();
        const pr = G.newProfile(name, {
          race: vCreate.race,
          gender: vCreate.gender,
          cls: vCreate.cls,
          appearance: COS.normalizeAppearance(data.appearance)
        });
        pr.charId = charId;
        pr.createdAt = Date.now();
        // SEC: новый персонаж сразу привязан к токену владельца (раньше хэш не ставился → «первый вошедший забирает»)
        if (guestOwn && guestOwn.tokenHash) {
          const hs = await GuestAuth.accountTokenHashes(DB, yid);
          const cur = rotatedToken ? AUTH.hashGuestToken(rotatedToken) : guestOwn.tokenHash;
          pr.guestTokenHashes = [cur].concat(hs.filter(h => h !== cur && !(guestOwn.legacy && h === guestOwn.tokenHash))).slice(0, 5);
        }
        await DB.save(yid, pr, charId);
        if (lbTouch) lbTouch(yid, pr, charId);
        const chars = await DB.listChars(yid);
        return { code: 200, body: { ok: true, guestToken: rotatedToken || undefined, char: CH.summarize(pr, charId), chars: chars, max: CH.MAX_SLOTS } };
      } finally {
        loggingIn.delete(yid);
      }
    }

    if (url === '/api/chars/delete') {
      if (loggingIn.has(yid)) return { code: 409, body: { ok: false, error: 'busy' } };
      loggingIn.add(yid);
      try {
        const charId = CH.normalizeCharId(data.charId || data.id);
        const list = await DB.listChars(yid);
        if (!list.some((c) => c.id === charId)) return { code: 404, body: { ok: false, error: 'no_char' } };
        if (clanLeaveOnCharDelete) {
          const clanR = await clanLeaveOnCharDelete(yid, charId);
          if (!clanR.ok) return { code: 400, body: { ok: false, error: clanR.reason } };
        }
        const pid = pidByYid.get(yid);
        const p = pid != null ? players.get(pid) : null;
        if (p && CH.normalizeCharId(p.charId) === charId) {
          send(p, { t: 'kicked', reason: 'char_deleted' });
          const ws = wsByPid.get(pid);
          await detachPlayer(pid);
          if (ws) { try { ws.pid = null; ws.close(4011, 'char deleted'); } catch (_) {} }
        }
        if (typeof onCharDeleteKick === 'function') {
          await onCharDeleteKick(yid, charId);
        }
        await DB.removeChar(yid, charId);
        if (lbDrop) lbDrop(yid, charId);
        const chars = await DB.listChars(yid);
        return { code: 200, body: { ok: true, guestToken: rotatedToken || undefined, chars: chars, max: CH.MAX_SLOTS } };
      } finally {
        loggingIn.delete(yid);
      }
    }

    return { code: 404, body: { ok: false, error: 'unknown' } };
  }

  function handleCharsApi(req, res) {
    const url = String(req.url || '').split('?')[0];
    const jsonHead = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const sendJsonHttp = (code, obj) => {
      res.writeHead(code, jsonHead);
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') return sendJsonHttp(405, { ok: false, error: 'method' });
    const clientIp = getClientIp(req);
    if (!checkHttpRate(clientIp, 'chars', 30, 60000)) {
      return sendJsonHttp(429, { ok: false, error: 'rate_limited' });
    }
    collectBody(req, 16384, () => sendJsonHttp(413, { ok: false, error: 'payload too large' }), (body) => {
      let data = {};
      if (body) {
        try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      Promise.resolve(handleCharsApiBody(url, data, clientIp)).then((out) => {
        sendJsonHttp(out.code || 200, out.body);
      }).catch((e) => {
        console.error('[chars-api]', e && e.stack || e);
        sendJsonHttp(500, { ok: false, error: 'internal' });
      });
    });
  }

  const recentAuthSignatures = new Map();
  function checkSignatureReplay(sig) {
    if (!sig || typeof sig !== 'string') return false;
    const now = Date.now();
    const prev = recentAuthSignatures.get(sig);
    if (prev && now - prev < 300000) {
      return false;
    }
    recentAuthSignatures.set(sig, now);
    if (recentAuthSignatures.size > 20000) {
      for (const [s, t] of recentAuthSignatures) {
        if (now - t > 300000) recentAuthSignatures.delete(s);
      }
    }
    return true;
  }

  async function handleAuthApiBody(url, data, ip) {
    if (url === '/api/auth/enter-key') {
      const key = String(data.key || data.codeword || '');
      let preferredLocalId = String(data.preferredLocalId || data.localId || '');
      const mode = String(data.mode || 'any').toLowerCase();
      // SEC: присоединить существующий бесключевой local_X к новому ключу можно только доказав
      // владение им (guestToken). Иначе любой «забирал» чужой гостевой аккаунт по его id.
      if (preferredLocalId) {
        const own = await GuestAuth.verifyGuestOwnership(DB, AccountKeys, 'local_' + preferredLocalId, String(data.guestToken || ''));
        if (!own.ok || own.tofu) preferredLocalId = '';
      }
      const res = await AccountKeys.enterKey(key, ip, preferredLocalId, mode, String(data.login || ''));
      const httpCode = res.ok ? 200 : (res.error === 'rate_limited' ? 429 : 400);
      return { code: httpCode, body: res };
    }

    if (url === '/api/auth/codeword-status') {
      // SEC: раньше без авторизации отдавал список персонажей любого yid (перечисление аккаунтов).
      const yid = String(data.yid || '').trim();
      if (!GuestAuth.isGuestYid(yid)) return { code: 403, body: { ok: false, error: 'forbidden' } };
      const own = await GuestAuth.verifyGuestOwnership(DB, AccountKeys, yid, String(data.guestToken || ''));
      if (!own.ok) return { code: 403, body: { ok: false, error: 'forbidden' } };
      const res = await AccountKeys.getCodewordStatus(yid);
      return { code: 200, body: res };
    }

    if (url === '/api/auth/set-codeword') {
      let yid = String(data.yid || '').trim();
      const code = String(data.codeword || '');
      const oldCode = String(data.oldCodeword || data.oldCode || '');

      const isSigned = Boolean(data.data && data.signature);
      if (isSigned) {
        const v = AUTH.verifySignature(data.data, data.signature, YANDEX_SECRET);
        if (!v.ok || v.guest) return { code: 403, body: { ok: false, error: 'forbidden' } };
        if (!v.dev && !checkSignatureReplay(String(data.signature))) {
          return { code: 403, body: { ok: false, error: 'signature_replay', message: 'Повторное использование подписи запрещено.' } };
        }
        const parsed = AUTH.parseLoginData(data.data);
        const signedYid = parsed && parsed.yid && !parsed.anonFallback ? String(parsed.yid) : '';
        if (!signedYid || isBadKey(signedYid) || !GuestAuth.isValidYid(signedYid)) return { code: 400, body: { ok: false, error: 'yid' } };
        if (yid && yid !== signedYid) {
          return { code: 403, body: { ok: false, error: 'yid_mismatch' } };
        }
        yid = signedYid;
      } else {
        // Без HMAC-подписи Яндекса: запрещено привязывать пароли к аккаунтам без префикса local_
        if (!GuestAuth.isGuestYid(yid)) {
          return { code: 403, body: { ok: false, error: 'signature_required', message: 'Для привязки аккаунта требуется авторизация.' } };
        }
        // SEC: раньше любой мог привязать СВОЙ ключ к чужому local_* без ключа и угнать аккаунт.
        // Теперь нужен guestToken владельца (TOFU-аккаунты без хэшей тоже не принимаются).
        const own = await GuestAuth.verifyGuestOwnership(DB, AccountKeys, yid, String(data.guestToken || ''));
        if (!own.ok || own.tofu) {
          return { code: 403, body: { ok: false, error: 'forbidden', message: 'Нет доступа к аккаунту.' } };
        }
      }

      // Для существующих аккаунтов с уже заданным паролем обязательна передача текущего пароля (включая подписанную ветку)
      const status = await AccountKeys.getCodewordStatus(yid);
      if (status && status.hasCodeword && !oldCode) {
        return {
          code: 400,
          body: {
            ok: false,
            error: 'old_codeword_required',
            message: 'Для смены кодового слова необходимо указать текущее кодовое слово.'
          }
        };
      }

      const res = await AccountKeys.setCodeword(yid, code, oldCode, isSigned && !(status && status.hasCodeword), String(data.login || ''));
      const httpCode = res.ok ? 200 : (res.error === 'busy' ? 429 : 400);
      return { code: httpCode, body: res };
    }

    if (url === '/api/auth/login-codeword') {
      const code = String(data.codeword || '');
      const res = await AccountKeys.loginByCodeword(code, ip, String(data.login || ''));
      const httpCode = res.ok ? 200 : (res.error === 'rate_limited' || res.error === 'busy' ? 429 : 401);
      return { code: httpCode, body: res };
    }

    return { code: 404, body: { ok: false, error: 'unknown_endpoint' } };
  }

  function handleAuthApi(req, res) {
    const url = String(req.url || '').split('?')[0];
    const jsonHead = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const sendJsonHttp = (code, obj) => {
      res.writeHead(code, jsonHead);
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') return sendJsonHttp(405, { ok: false, error: 'method' });
    const clientIp = getClientIp(req);
    if (!checkHttpRate(clientIp, 'auth', 20, 60000)) {
      return sendJsonHttp(429, { ok: false, error: 'rate_limited' });
    }
    collectBody(req, 8192, () => sendJsonHttp(413, { ok: false, error: 'payload too large' }), (body) => {
      let data = {};
      if (body) {
        try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      const ip = clientIp;
      Promise.resolve(handleAuthApiBody(url, data, ip)).then((out) => {
        sendJsonHttp(out.code || 200, out.body);
      }).catch((e) => {
        console.error('[auth-api]', e && e.stack || e);
        sendJsonHttp(500, { ok: false, error: 'internal' });
      });
    });
  }

  function handleModApi(req, res) {
    const url = String(req.url || '').split('?')[0];
    const jsonHead = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const sendJsonHttp = (code, obj) => {
      res.writeHead(code, jsonHead);
      res.end(JSON.stringify(obj));
    };
    if (!modAuthorized(req)) {
      const ip = getClientIp(req);
      const allowReq = checkHttpRate(ip, 'unauth_admin_req', 30, 60000);
      if (!allowReq) {
        return sendJsonHttp(429, { ok: false, error: 'too_many_requests' });
      }
      const allowLog = checkHttpRate(ip, 'unauth_admin_log', 5, 60000);
      if (allowLog) {
        Mod.log('unauthorized_admin_access', { ip, url: String(url).slice(0, 128), method: req.method });
      }
      return sendJsonHttp(403, { ok: false, error: 'forbidden' });
    }
    const readBody = (cb) => {
      collectBody(req, 4096, () => sendJsonHttp(413, { ok: false, error: 'payload too large' }), (body) => {
        let data = {};
        if (body) {
          try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
        cb(data);
      });
    };
    if (req.method === 'GET' && url === '/api/mod/reports') {
      return sendJsonHttp(200, { ok: true, hint: 'reports append-only jsonl in data/moderation/' });
    }
    if (req.method !== 'POST') return sendJsonHttp(405, { ok: false, error: 'method' });
    readBody((data) => {
      const yid = MR.sanitizeYid(data.yid);
      if (url === '/api/mod/ban') {
        if (!yid) return sendJsonHttp(400, { ok: false, error: 'yid' });
        const r = Mod.setBan(yid, { ttlSec: data.ttlSec, reason: data.reason, by: data.by || 'http' });
        if (r.ok && kickYid) kickYid(yid, 4012, 'banned');
        Mod.log('ban', { yid: yid, until: r.until, reason: r.reason, by: data.by || 'http' });
        return sendJsonHttp(200, r);
      }
      if (url === '/api/mod/mute') {
        if (!yid) return sendJsonHttp(400, { ok: false, error: 'yid' });
        const r = Mod.setMute(yid, { ttlSec: data.ttlSec, reason: data.reason, by: data.by || 'http' });
        Mod.log('mute', { yid: yid, until: r.until, reason: r.reason, by: data.by || 'http' });
        return sendJsonHttp(200, r);
      }
      if (url === '/api/mod/unban') {
        if (!yid) return sendJsonHttp(400, { ok: false, error: 'yid' });
        const r = Mod.clearBan(yid);
        Mod.log('unban', { yid: yid, by: data.by || 'http' });
        return sendJsonHttp(200, r);
      }
      if (url === '/api/mod/unmute') {
        if (!yid) return sendJsonHttp(400, { ok: false, error: 'yid' });
        const r = Mod.clearMute(yid);
        Mod.log('unmute', { yid: yid, by: data.by || 'http' });
        return sendJsonHttp(200, r);
      }
      sendJsonHttp(404, { ok: false, error: 'unknown' });
    });
  }

  function handleAdminApi(req, res) {
    const url = String(req.url || '').split('?')[0];
    const jsonHead = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const sendJsonHttp = (code, obj) => {
      res.writeHead(code, jsonHead);
      res.end(JSON.stringify(obj));
    };
    if (!modAuthorized(req)) {
      const ip = getClientIp(req);
      const allowReq = checkHttpRate(ip, 'unauth_admin_req', 30, 60000);
      if (!allowReq) {
        return sendJsonHttp(429, { ok: false, error: 'too_many_requests' });
      }
      const allowLog = checkHttpRate(ip, 'unauth_admin_log', 5, 60000);
      if (allowLog) {
        Mod.log('unauthorized_admin_access', { ip, url: String(url).slice(0, 128), method: req.method });
      }
      return sendJsonHttp(403, { ok: false, error: 'forbidden' });
    }

    if (req.method === 'GET' && url === '/api/admin/players') {
      const list = PlayerDb.list();
      return sendJsonHttp(200, { ok: true, count: list.length, players: list });
    }

    if (req.method === 'GET' && url === '/api/admin/gm') {
      const list = PlayerDb.list({ gmOnly: true });
      return sendJsonHttp(200, { ok: true, count: list.length, gms: list });
    }

    if (req.method === 'POST' && url === '/api/admin/gm') {
      const chunks = [];
      let totalBytes = 0;
      let tooBig = false;
      req.on('data', (chunk) => {
        if (tooBig) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
        totalBytes += buf.length;
        if (totalBytes > 4096) {
          tooBig = true;
          sendJsonHttp(413, { ok: false, error: 'payload too large' });
          req.destroy();
          return;
        }
        chunks.push(buf);
      });
      req.on('end', () => {
        if (tooBig) return;
        const body = chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : '';
        let data = {};
        if (body) {
          try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
        }
        const target = data.target || data.name || data.yid;
        if (!target) return sendJsonHttp(400, { ok: false, error: 'target required' });
        const level = data.accessLevel != null ? data.accessLevel : 100;
        PlayerDb.setAccessLevel(target, level, data.reason || 'http_admin')
          .then(result => sendJsonHttp(200, Object.assign({ ok: true }, result)))
          .catch(err => sendJsonHttp(500, { ok: false, error: err.message }));
      });
      return;
    }

    sendJsonHttp(404, { ok: false, error: 'unknown' });
  }

  function setupGmChangeListener() {
    PlayerDb.onGmChanged(({ yid, name, accessLevel, gm }) => {
      if (typeof broadcastGmSync === 'function') {
        try { broadcastGmSync({ yid, name, accessLevel }); } catch (_) {}
      }
      // MEDIUM-2: права применяются только к аккаунту-владельцу (yid). Совпадение одного лишь
      // имени раньше выдавало GM любому онлайн-игроку с тем же ником (имена уникальны не строго:
      // индекс имён синхронизируется между воркерами с задержкой, боты и старые профили его обходят).
      void name;
      if (!yid) return;
      const targetYid = String(yid).toLowerCase();
      for (const p of players.values()) {
        if (p && p.yid && String(p.yid).toLowerCase() === targetYid) {
          p.accessLevel = accessLevel;
          p.gm = isGM(p);
          const hasRealSkills = p.skills && typeof p.applyClassStats === 'function';
          if (!p.gm) {
            try { EditorGuard.revokePid(p.pid); } catch (_) {}
            p.editorKey = '';
            if (p.skills && typeof p.skills === 'object') {
              delete p.skills.test_immortal;
              delete p.skills.gm_oneshot;
              delete p.skills.gm_resurrect;
              delete p.skills.gm_speed;
              delete p.skills.gm_flash;
            }
            p.gmSpeedMul = 1;
            p.flashSpeed = false;
            const syncPayload = { t: 'self_sync', gmSpeedMul: 1, flashSpeed: false };
            if (hasRealSkills) syncPayload.skills = p.skills;
            send(p, syncPayload);
          } else {
            if (hasRealSkills) {
              p.skills = p.skills || {};
              p.skills.test_immortal = 1;
              p.skills.gm_oneshot = 1;
              p.skills.gm_resurrect = 1;
              p.skills.gm_speed = 1;
              delete p.skills.gm_flash;
              send(p, { t: 'self_sync', skills: p.skills });
            } else {
              send(p, { t: 'self_sync' });
            }
          }
          send(p, {
            t: 'msg',
            text: p.gm
              ? `[Система] Вам присвоен статус GM (AccessLevel: ${accessLevel}).`
              : '[Система] Статус GM снят.'
          });
          send(p, {
            t: 'gm_update',
            gm: p.gm,
            accessLevel: p.accessLevel
          });
        }
      }
    });
  }

  function handleRequest(req, res) {
    applyCors(req, res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    const clientIp = getClientIp(req);

    if (req.url === '/healthz' || (req.url && req.url.indexOf('/healthz?') === 0)) {
      const now = Date.now();
      const lastTickAt = getLastTickAt();
      const ok = MR.healthOk(now, lastTickAt, 5000);
      // H11: публично — только «жив/не жив»; лаг и пул БД — с METRICS_TOKEN
      let payload = { ok: ok, status: ok ? 'ok' : 'degraded' };
      if (SEC.metricsAuthorized(req.socket && req.socket.remoteAddress, (n) => req.headers[n])) {
        const dbStats = (DB && typeof DB.getPoolStats === 'function') ? DB.getPoolStats() : { mode: DB ? DB.MODE : 'unknown' };
        payload = { ok: ok, status: payload.status, lagMs: now - lastTickAt, lastTickAt: lastTickAt, db: dbStats };
      }
      const body = JSON.stringify(payload);
      res.writeHead(ok ? 200 : 503, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(body);
      return true;
    }

    if (req.url === '/metrics' || (req.url && req.url.indexOf('/metrics?') === 0)) {
      if (!checkHttpRate(clientIp, 'metrics', 30, 60000)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
        res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
        return true;
      }
      // H11: метрики (нагрузка, пул БД, адена в мире) — только с METRICS_TOKEN
      if (!SEC.metricsAuthorized(req.socket && req.socket.remoteAddress, (n) => req.headers[n])) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
        return true;
      }
      const body = JSON.stringify(metricsPayload());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/status' || (req.url && req.url.indexOf('/api/status?') === 0)) {
      if (!checkHttpRate(clientIp, 'status', 60, 60000)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
        res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
        return true;
      }
      const now = Date.now();
      const lastTickAt = getLastTickAt();
      const alive = MR.healthOk(now, lastTickAt);
      const m = typeof metricsPayload === 'function' ? metricsPayload() : null;
      const playerCount = typeof getOnlineCount === 'function'
        ? getOnlineCount()
        : ((m && typeof m.players === 'number' && m.players > players.size) ? m.players : players.size);
      const body = JSON.stringify({
        ok: alive,
        online: alive,
        players: playerCount,
        ts: now
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/leaderboard' || (req.url && req.url.indexOf('/api/leaderboard?') === 0)) {
      if (!checkHttpRate(clientIp, 'leaderboard', 30, 60000)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
        res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
        return true;
      }
      const body = JSON.stringify({ ok: true, rows: buildLeaderboard(20) });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/world-time' || (req.url && req.url.indexOf('/api/world-time?') === 0)) {
      if (!checkHttpRate(clientIp, 'world_time', 60, 60000)) {
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': '60' });
        res.end(JSON.stringify({ ok: false, error: 'rate_limited' }));
        return true;
      }
      const body = JSON.stringify(Object.assign({ ok: true }, worldTimePayload()));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url && req.url.indexOf('/api/mod/') === 0) {
      handleModApi(req, res);
      return true;
    }

    if (req.url && (req.url.indexOf('/api/admin/') === 0 || req.url === '/api/admin')) {
      handleAdminApi(req, res);
      return true;
    }

    if (req.url && (req.url === '/api/chars' || req.url.indexOf('/api/chars/') === 0)) {
      handleCharsApi(req, res);
      return true;
    }

    if (req.url && (req.url === '/api/auth' || req.url.indexOf('/api/auth/') === 0)) {
      handleAuthApi(req, res);
      return true;
    }

    // Редактор мира (только локальная машина): ручки в http/editor-api.js, на проде их нет
    if (editorApi && editorApi.handleRequest(req, res)) return true;
    if (!editorApi && isEditorRoute(req.url)) {
      editorDisabled(res);
      return true;
    }


    const urlPath = (req.url || '/').split('?')[0];
    if (EditorGuard.isEditorAsset(urlPath) && !EditorGuard.allowAsset(req)) {
      const isCss = urlPath.endsWith('.css');
      res.writeHead(404, {
        'Content-Type': isCss ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(isCss ? '/* 404 not found */' : 'not found');
      return true;
    }

    return false;
  }

  return {
    handleRequest,
    setupGmChangeListener,
    saveEditorOverridesToDisk,
    handleSaveEditorData: (req, res) => (editorApi ? editorApi.handleSaveEditorData(req, res) : editorDisabled(res)),
    handleSaveTerrainPaint: (req, res) => (editorApi ? editorApi.handleSaveTerrainPaint(req, res) : editorDisabled(res)),
    handleSaveIcon: (req, res) => (editorApi ? editorApi.handleSaveIcon(req, res) : editorDisabled(res)),
    handleUploadAsset: (req, res) => (editorApi ? editorApi.handleUploadAsset(req, res) : editorDisabled(res)),
    handleCharsApi,
    handleCharsApiBody,
    handleModApi,
    handleAdminApi,
    applyCors,
    modAuthorized,
    getClientIp,
    checkHttpRate,
    httpRateLimits
  };
}

createHttpRouter.applyCors = applyCors;
createHttpRouter.modAuthorized = modAuthorized;
createHttpRouter.getClientIp = getClientIp;
createHttpRouter.checkHttpRate = checkHttpRate;
createHttpRouter.httpRateLimits = httpRateLimits;

module.exports = createHttpRouter;
