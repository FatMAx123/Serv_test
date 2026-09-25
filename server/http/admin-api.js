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
const EditorGuard = require('../editor-guard.js');
const CS = require('../../shared/class-system.js');
const CH = require('../../shared/char-rules.js');
const COS = require('../../shared/cosmetics-db.js');
const G = require('../../shared/game-rules.js');
const WM = require('../../shared/world-metrics.js');
const NPCS = require('../../shared/npc-services.js');
const overridesWriter = require('../editor-overrides-writer.js');
const AccountKeys = require('../account-keys.js');

const JSON_HEAD = { 'Content-Type': 'application/json; charset=utf-8' };
const EDITOR_BODY_LIMIT = 32 * 1024 * 1024;
const ICON_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const MODEL_EXT_OK = new Set(['.fbx', '.glb', '.gltf', '.obj']);
const TEXTURE_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);

const CORS_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function applyCors(req, res) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (local || CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Mod-Secret');
  }
}

function modAuthorized(req) {
  // VULN-SEC-01: Полное разделение секретов модерации и OAuth Яндекс-приложения.
  // Запрещен fallback на YANDEX_APP_SECRET. При предоставлении неавторизованного секрета доступ строго отклоняется.
  const secret = process.env.MOD_SECRET || '';
  const provided = String(req.headers && req.headers['x-mod-secret'] || '');

  // Если клиент предоставил заголовок X-Mod-Secret:
  if (provided) {
    if (!secret) return false; // MOD_SECRET не настроен на сервере — доступ по секрету невозможен
    const a = Buffer.from(provided);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Если заголовок X-Mod-Secret не передан:
  // Если MOD_SECRET настроен на сервере — доступ без секрета запрещён даже с localhost
  if (secret) return false;

  // В продакшене без секрета доступ к API модерации/админки строго запрещён (даже с localhost)
  if (process.env.NODE_ENV === 'production') return false;

  // Локальный dev-режим без MOD_SECRET: доступ без заголовка разрешен только с loopback для инструментов разработки
  const ip = (req.socket && req.socket.remoteAddress) || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function editorAuthorized(req) {
  if (process.env.NODE_ENV === 'production') return false;
  if (modAuthorized(req)) return true;
  const token = EditorGuard.tokenFromCookie(req) || EditorGuard.tokenFromQuery(req && req.url);
  if (token && EditorGuard.valid(token)) return true;
  if (EditorGuard.isLoopbackReq(req) && (process.env.EDITOR_ENABLED === '1' || process.env.EDITOR_ENABLED === 'true')) return true;
  return false;
}

function editorDisabled(res) {
  res.writeHead(403, JSON_HEAD);
  res.end(JSON.stringify({ ok: false, error: 'editor disabled (set EDITOR_ENABLED=1 locally)' }));
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
    isGM,
    rebuildServerSpots,
    sanitizeCharName,
    isBadKey,
    YANDEX_SECRET,
    EDITOR_ENABLED,
    CLIENT_DIR,
    SHARED_DIR
  } = ctx;

  function saveEditorOverridesToDisk(data) {
    try {
      if (!data || typeof data !== 'object') throw new Error('invalid overrides payload');
      if (!data.savedAt) data.savedAt = Date.now();
      if (WM.applyEditorOverrides) WM.applyEditorOverrides(data);
      if (rebuildServerSpots) rebuildServerSpots();
      NPCS.rebuild();
      overridesWriter.writeEditorOverridesFiles(data);
      console.log('[server] ✅ Изменения 3D-сцены записаны на диск: shared/editor-overrides.json и client/js/editor-overrides-data.js');
      return true;
    } catch (e) {
      console.error('[server] Ошибка сохранения оверрайдов:', e);
      return false;
    }
  }

  function handleSaveEditorData(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      body += chunk;
      if (body.length > EDITOR_BODY_LIMIT) { tooBig = true; res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' })); req.destroy(); }
    });
    req.on('end', () => {
      if (tooBig) return;
      try {
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: 'bad payload' }));
        }
        const ok = saveEditorOverridesToDisk(data);
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: ok, message: 'Оверрайды успешно записаны в файлы скриптов!' }));
      } catch (e) {
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
      }
    });
  }

  function handleSaveIcon(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      body += chunk;
      if (body.length > EDITOR_BODY_LIMIT) { tooBig = true; res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' })); req.destroy(); }
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const data = JSON.parse(body);
        const dataUrl = data && data.dataUrl;
        const name = path.basename(String((data && data.name) || '').replace(/\\/g, '/'));
        if (!name || !dataUrl) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: 'Missing name or dataUrl' }));
        }
        if (!ICON_EXT_OK.has(path.extname(name).toLowerCase())) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: 'bad extension' }));
        }
        const base64Data = String(dataUrl).replace(/^data:image\/\w+;base64,/, '');
        const buf = Buffer.from(base64Data, 'base64');
        const iconsDir = path.join(CLIENT_DIR, 'assets', 'props', 'icons');
        if (!fs.existsSync(iconsDir)) await fs.promises.mkdir(iconsDir, { recursive: true });
        const dest = path.join(iconsDir, name);
        if (dest !== iconsDir && !dest.startsWith(iconsDir + path.sep)) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: 'bad name' }));
        }
        await fs.promises.writeFile(dest, buf);
        console.log('[server] 📸 Иконка сохранена:', name, `(${buf.length} bytes)`);
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true, name: name }));
      } catch (e) {
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
      }
    });
  }

  function handleUploadAsset(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      body += chunk;
      if (body.length > EDITOR_BODY_LIMIT) {
        tooBig = true;
        res.writeHead(413, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const data = JSON.parse(body);
        const items = Array.isArray(data.items) ? data.items : (Array.isArray(data.files) ? data.files : [data]);
        const results = [];
        for (const item of items) {
          const rawName = String((item && (item.name || item.filename)) || '').replace(/\\/g, '/');
          const filename = path.basename(rawName);
          const dataUrl = item && (item.dataUrl || item.base64 || item.data);
          if (!filename || !dataUrl) continue;
          const ext = path.extname(filename).toLowerCase();
          let targetDir = null;
          let assetType = 'other';
          if (MODEL_EXT_OK.has(ext)) {
            assetType = 'model';
            targetDir = path.join(CLIENT_DIR, 'assets', 'props');
          } else if (TEXTURE_EXT_OK.has(ext)) {
            assetType = 'texture';
            targetDir = path.join(CLIENT_DIR, 'assets', 'props', 'textures');
          } else {
            continue;
          }
          if (!fs.existsSync(targetDir)) await fs.promises.mkdir(targetDir, { recursive: true });
          const dest = path.join(targetDir, filename);
          if (!dest.startsWith(targetDir + path.sep) && dest !== targetDir) {
            continue;
          }
          const b64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
          const buf = Buffer.from(b64, 'base64');
          await fs.promises.writeFile(dest, buf);
          results.push({
            ok: true,
            filename: filename,
            type: assetType,
            size: buf.length,
            url: (assetType === 'model' ? 'assets/props/' : 'assets/props/textures/') + filename
          });
          console.log(`[server] 📦 Ассет загружен: ${filename} (${assetType}, ${buf.length} bytes)`);
        }
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true, uploaded: results }));
      } catch (e) {
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Upload failed' }));
      }
    });
  }

  function handleSaveTerrainPaint(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    let body = '';
    let tooBig = false;
    req.on('data', chunk => {
      if (tooBig) return;
      body += chunk;
      if (body.length > EDITOR_BODY_LIMIT) { tooBig = true; res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' })); req.destroy(); }
    });
    req.on('end', async () => {
      if (tooBig) return;
      try {
        const data = JSON.parse(body);
        const layer1 = data && data.layer1;
        const layer2 = data && data.layer2;
        const dataDir = path.join(CLIENT_DIR, 'data');
        if (!fs.existsSync(dataDir)) await fs.promises.mkdir(dataDir, { recursive: true });

        if (layer1) {
          const b1 = Buffer.from(String(layer1).replace(/^data:image\/\w+;base64,/, ''), 'base64');
          await fs.promises.writeFile(path.join(dataDir, 'terrain-paint-1.png'), b1);
          await fs.promises.writeFile(path.join(SHARED_DIR, 'terrain-paint-1.png'), b1);
        }
        if (layer2) {
          const b2 = Buffer.from(String(layer2).replace(/^data:image\/\w+;base64,/, ''), 'base64');
          await fs.promises.writeFile(path.join(dataDir, 'terrain-paint-2.png'), b2);
          await fs.promises.writeFile(path.join(SHARED_DIR, 'terrain-paint-2.png'), b2);
        }
        console.log('[server] 🎨 Текстуры террейна (дороги/кисти) сохранены на диск: data/terrain-paint-1.png, data/terrain-paint-2.png');
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true, message: 'Terrain paint maps saved successfully' }));
      } catch (e) {
        console.error('[server] Ошибка сохранения terrain paint:', e);
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
      }
    });
  }

  async function handleCharsApiBody(url, data) {
    const v = AUTH.verifySignature(data.data, data.signature, YANDEX_SECRET);
    if (!v.ok) return { code: 403, body: { ok: false, error: 'forbidden' } };
    const parsed = AUTH.parseLoginData(data.data);
    const yid = parsed && parsed.yid ? String(parsed.yid).slice(0, 64) : '';
    if (!yid || isBadKey(yid)) return { code: 400, body: { ok: false, error: 'yid' } };
    const ban = Mod.banInfo(yid);
    if (ban) return { code: 403, body: { ok: false, error: 'banned', until: ban.until } };

    if (url === '/api/chars') {
      const chars = await DB.listChars(yid);
      return { code: 200, body: { ok: true, chars: chars, max: CH.MAX_SLOTS } };
    }

    if (url === '/api/chars/create') {
      if (loggingIn.has(yid)) return { code: 409, body: { ok: false, error: 'busy' } };
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
      const charId = list.length === 0 ? CH.DEFAULT_CHAR_ID : CH.newCharId();
      const pr = G.newProfile(name, {
        race: vCreate.race,
        gender: vCreate.gender,
        cls: vCreate.cls,
        appearance: COS.normalizeAppearance(data.appearance)
      });
      pr.charId = charId;
      pr.createdAt = Date.now();
      await DB.save(yid, pr, charId);
      if (lbTouch) lbTouch(yid, pr, charId);
      const chars = await DB.listChars(yid);
      return { code: 200, body: { ok: true, char: CH.summarize(pr, charId), chars: chars, max: CH.MAX_SLOTS } };
    }

    if (url === '/api/chars/delete') {
      if (loggingIn.has(yid)) return { code: 409, body: { ok: false, error: 'busy' } };
      const charId = CH.normalizeCharId(data.charId || data.id);
      const list = await DB.listChars(yid);
      if (!list.some((c) => c.id === charId)) return { code: 404, body: { ok: false, error: 'no_char' } };
      if (clanLeaveOnCharDelete) {
        const clanR = clanLeaveOnCharDelete(yid, charId);
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
      await DB.removeChar(yid, charId);
      if (lbDrop) lbDrop(yid, charId);
      const chars = await DB.listChars(yid);
      return { code: 200, body: { ok: true, chars: chars, max: CH.MAX_SLOTS } };
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
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      body += chunk;
      if (body.length > 16384) {
        tooBig = true;
        sendJsonHttp(413, { ok: false, error: 'payload too large' });
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      let data = {};
      if (body) {
        try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      Promise.resolve(handleCharsApiBody(url, data)).then((out) => {
        sendJsonHttp(out.code || 200, out.body);
      }).catch((e) => {
        console.error('[chars-api]', e && e.stack || e);
        sendJsonHttp(500, { ok: false, error: 'internal' });
      });
    });
  }

  async function handleAuthApiBody(url, data, ip) {
    if (url === '/api/auth/enter-key') {
      const key = String(data.key || data.codeword || '');
      const preferredLocalId = String(data.preferredLocalId || data.localId || '');
      const mode = String(data.mode || 'any').toLowerCase();
      const res = await AccountKeys.enterKey(key, ip, preferredLocalId, mode);
      const httpCode = res.ok ? 200 : (res.error === 'rate_limited' ? 429 : 400);
      return { code: httpCode, body: res };
    }

    if (url === '/api/auth/codeword-status') {
      const yid = String(data.yid || '').trim();
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
        if (!v.ok) return { code: 403, body: { ok: false, error: 'forbidden' } };
        const parsed = AUTH.parseLoginData(data.data);
        const signedYid = parsed && parsed.yid ? String(parsed.yid).slice(0, 64) : '';
        if (!signedYid || isBadKey(signedYid)) return { code: 400, body: { ok: false, error: 'yid' } };
        if (yid && yid !== signedYid) {
          return { code: 403, body: { ok: false, error: 'yid_mismatch' } };
        }
        yid = signedYid;
      } else {
        // Без HMAC-подписи Яндекса: запрещено привязывать пароли к аккаунтам без префикса local_
        if (!yid.startsWith('local_')) {
          return { code: 403, body: { ok: false, error: 'signature_required', message: 'Для привязки аккаунта требуется авторизация.' } };
        }
        // Для существующих аккаунтов с уже заданным паролем обязательна передача текущего пароля
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
      }

      const res = await AccountKeys.setCodeword(yid, code, oldCode, isSigned);
      return { code: res.ok ? 200 : 400, body: res };
    }

    if (url === '/api/auth/login-codeword') {
      const code = String(data.codeword || '');
      const res = await AccountKeys.loginByCodeword(code, ip);
      const httpCode = res.ok ? 200 : (res.error === 'rate_limited' ? 429 : 401);
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
    let body = '';
    let tooBig = false;
    req.on('data', (chunk) => {
      if (tooBig) return;
      body += chunk;
      if (body.length > 8192) {
        tooBig = true;
        sendJsonHttp(413, { ok: false, error: 'payload too large' });
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooBig) return;
      let data = {};
      if (body) {
        try { data = JSON.parse(body); } catch (e) { return sendJsonHttp(400, { ok: false, error: 'bad json' }); }
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
      const ip = (req.socket && req.socket.remoteAddress) || (req.headers && req.headers['x-forwarded-for']) || '';
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
      const ip = (req.socket && req.socket.remoteAddress) || '';
      Mod.log('unauthorized_admin_access', { ip, url, method: req.method });
      return sendJsonHttp(403, { ok: false, error: 'forbidden' });
    }
    const readBody = (cb) => {
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        if (tooBig) return;
        body += chunk;
        if (body.length > 4096) {
          tooBig = true;
          sendJsonHttp(413, { ok: false, error: 'payload too large' });
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooBig) return;
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
      const ip = (req.socket && req.socket.remoteAddress) || '';
      Mod.log('unauthorized_admin_access', { ip, url, method: req.method });
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
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        if (tooBig) return;
        body += chunk;
        if (body.length > 4096) {
          tooBig = true;
          sendJsonHttp(413, { ok: false, error: 'payload too large' });
          req.destroy();
        }
      });
      req.on('end', () => {
        if (tooBig) return;
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
      const targetLower = name ? name.toLowerCase() : '';
      for (const p of players.values()) {
        const matchYid = yid && String(p.yid).toLowerCase() === String(yid).toLowerCase();
        const matchName = targetLower && p.name && p.name.toLowerCase() === targetLower;
        if (matchYid || matchName) {
          p.accessLevel = accessLevel;
          p.gm = isGM(p);
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

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return true;
    }

    if (req.url === '/healthz' || (req.url && req.url.indexOf('/healthz?') === 0)) {
      const now = Date.now();
      const lastTickAt = getLastTickAt();
      const ok = MR.healthOk(now, lastTickAt, 5000);
      const dbStats = (DB && typeof DB.getPoolStats === 'function') ? DB.getPoolStats() : { mode: DB ? DB.MODE : 'unknown' };
      const body = JSON.stringify({ ok: ok, lagMs: now - lastTickAt, lastTickAt: lastTickAt, db: dbStats });
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/metrics' || (req.url && req.url.indexOf('/metrics?') === 0)) {
      const body = JSON.stringify(metricsPayload());
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/status' || (req.url && req.url.indexOf('/api/status?') === 0)) {
      const now = Date.now();
      const lastTickAt = getLastTickAt();
      const alive = MR.healthOk(now, lastTickAt);
      const body = JSON.stringify({
        ok: alive,
        online: alive,
        players: players.size,
        ts: now
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/leaderboard' || (req.url && req.url.indexOf('/api/leaderboard?') === 0)) {
      const body = JSON.stringify({ ok: true, rows: buildLeaderboard(20) });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(body);
      return true;
    }

    if (req.url === '/api/world-time' || (req.url && req.url.indexOf('/api/world-time?') === 0)) {
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

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-editor') !== -1)) {
      handleSaveEditorData(req, res);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-terrain-paint') !== -1)) {
      handleSaveTerrainPaint(req, res);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-icon') !== -1)) {
      handleSaveIcon(req, res);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/upload-asset') !== -1)) {
      handleUploadAsset(req, res);
      return true;
    }

    if (req.method === 'GET' && req.url && req.url.indexOf('/api/editor/session') === 0) {
      if (!EditorGuard.allowSessionKey(req.url)) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false }));
        return true;
      }
      const key = EditorGuard.tokenFromQuery(req.url);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': EditorGuard.cookieHeader(key)
      });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }

    const urlPath = (req.url || '/').split('?')[0];
    if (EditorGuard.isEditorAsset(urlPath) && !EditorGuard.allowAsset(req)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('not found');
      return true;
    }

    return false;
  }

  return {
    handleRequest,
    setupGmChangeListener,
    saveEditorOverridesToDisk,
    handleSaveEditorData,
    handleSaveTerrainPaint,
    handleSaveIcon,
    handleUploadAsset,
    handleCharsApi,
    handleModApi,
    handleAdminApi,
    applyCors,
    modAuthorized
  };
}

createHttpRouter.applyCors = applyCors;
createHttpRouter.modAuthorized = modAuthorized;

module.exports = createHttpRouter;
