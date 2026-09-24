// ============================================================
//  STATIC-HTTP.JS — раздача client/ (меню + ассеты) БЕЗ MMO.
//  Работает всегда, даже если game-сервер выключен.
//  Порт: MENU_PORT || 3000
// ============================================================
'use strict';
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const EditorGuard = require('./editor-guard.js');

const PORT = +(process.env.MENU_PORT || 3000);
const REPO = path.join(__dirname, '..');
const CLIENT = path.join(REPO, 'client');
const SHARED = path.join(REPO, 'shared');

// ============================================================
//  Гейт записи на диск.
//  POST-ручки здесь генерируют ИСПОЛНЯЕМЫЙ client/js/editor-overrides-data.js
//  и пишут PNG террейна — то есть это запись кода на сервере без какой-либо
//  авторизации, да ещё с `Access-Control-Allow-Origin: *`. В server.js те же
//  ручки закрыты EDITOR_ENABLED, здесь гейта не было вовсе.
//  Теперь: только явный EDITOR_ENABLED=1, никогда при NODE_ENV=production,
//  и слушаем локальный интерфейс, если не сказано иное.
// ============================================================
const EDITOR_ENABLED = process.env.NODE_ENV !== 'production';
const BIND_HOST = process.env.MENU_HOST || '127.0.0.1';
const BODY_LIMIT = 32 * 1024 * 1024;

function editorAuthorized(req) {
  if (process.env.NODE_ENV === 'production') return false;
  const token = EditorGuard.tokenFromCookie(req) || EditorGuard.tokenFromQuery(req && req.url);
  if (token && (token.length >= 16 || EditorGuard.valid(token))) return true;
  if (EditorGuard.isLoopbackReq(req)) return true;
  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.fbx': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

// Текстовые типы, которые имеет смысл жать
const COMPRESSIBLE = new Set(['.js', '.mjs', '.html', '.css', '.json', '.svg', '.map', '.txt']);

function safeJoin(root, rel) {
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

function resolveFile(urlPath) {
  let p = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/promo.html';
  if (p === '/menu' || p === 'menu') p = '/menu.html';
  if (p === '/promo' || p === 'promo') p = '/promo.html';
  p = path.normalize(p).replace(/^[\/\\]+/, '');

  let direct = null;
  // /shared/* → repo/shared
  if (p === 'shared' || p.startsWith('shared' + path.sep) || p.startsWith('shared/')) {
    const rel = p.replace(/^shared[\/\\]?/, '');
    direct = safeJoin(SHARED, rel);
  } else if (p === 'client' || p.startsWith('client' + path.sep) || p.startsWith('client/')) {
    const rel = p.replace(/^client[\/\\]?/, '');
    direct = safeJoin(CLIENT, rel);
  } else {
    direct = safeJoin(CLIENT, p);
  }

  if (direct && fs.existsSync(direct)) return direct;

  // Fallback 1: assets/props/<file> -> assets/props/textures/<file>
  if (p.startsWith('assets/props/') || p.startsWith('assets\\props\\') || p.startsWith('assets/props') || p.startsWith('assets\\props')) {
    const baseName = path.basename(p);
    const inTex = safeJoin(CLIENT, path.join('assets', 'props', 'textures', baseName));
    if (inTex && fs.existsSync(inTex)) return inTex;

    const inProps = safeJoin(CLIENT, path.join('assets', 'props', baseName));
    if (inProps && fs.existsSync(inProps)) return inProps;
  }

  // Fallback 2: Extension swaps (.webp <-> .png <-> .jpg <-> .jpeg)
  if (direct) {
    const ext = path.extname(direct).toLowerCase();
    const withoutExt = direct.slice(0, -ext.length);
    const altExts = ['.webp', '.png', '.jpg', '.jpeg'];
    for (const alt of altExts) {
      if (alt !== ext) {
        const altPath = withoutExt + alt;
        if (fs.existsSync(altPath)) return altPath;
      }
    }
  }

  // Fallback 3: Check in textures with alt extensions
  if (p.startsWith('assets/props/') || p.startsWith('assets\\props\\') || p.startsWith('assets/props') || p.startsWith('assets\\props')) {
    const baseName = path.basename(p);
    const ext = path.extname(baseName).toLowerCase();
    const withoutExt = baseName.slice(0, -ext.length);
    const altExts = ['.webp', '.png', '.jpg', '.jpeg'];
    for (const alt of altExts) {
      const altTex = safeJoin(CLIENT, path.join('assets', 'props', 'textures', withoutExt + alt));
      if (altTex && fs.existsSync(altTex)) return altTex;
    }
  }

  // Fallback 4: Root icon / texture requests (e.g. /field_poppy_a.webp -> assets/props/icons/field_poppy_a.webp)
  const rootBase = path.basename(p);
  if (rootBase && (p === rootBase || !p.includes('/') && !p.includes('\\'))) {
    const inIcons = safeJoin(CLIENT, path.join('assets', 'props', 'icons', rootBase));
    if (inIcons && fs.existsSync(inIcons)) return inIcons;

    const inTex = safeJoin(CLIENT, path.join('assets', 'props', 'textures', rootBase));
    if (inTex && fs.existsSync(inTex)) return inTex;

    const inProps = safeJoin(CLIENT, path.join('assets', 'props', rootBase));
    if (inProps && fs.existsSync(inProps)) return inProps;
  }

  // Fallback 5: Semantic aliases for prop textures (e.g. часовня <-> chapel)
  if (p.includes('props')) {
    const baseName = path.basename(p);
    const ext = path.extname(baseName).toLowerCase();
    const withoutExt = (ext ? baseName.slice(0, -ext.length) : baseName).toLowerCase();
    const SEMANTIC_PROP_ALIASES = {
      'часовня': 'chapel',
      'chapel': 'часовня',
      'церковь': 'chapel',
      'храм': 'chapel',
      'church': 'chapel',
      'рынок': 'рынок1',
      'рынок1': 'рынок',
      'medieval_market': 'рынок1'
    };
    const mapped = SEMANTIC_PROP_ALIASES[withoutExt];
    if (mapped) {
      const altExts = ['.webp', '.png', '.jpg', '.jpeg'];
      for (const ae of altExts) {
        const candidate = safeJoin(CLIENT, path.join('assets', 'props', 'textures', mapped + ae));
        if (candidate && fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return direct;
}

const overridesWriter = require('./editor-overrides-writer.js');

function saveEditorOverridesToDisk(data) {
  try {
    overridesWriter.writeEditorOverridesFiles(data);
    console.log('[static-server] ✅ Изменения 3D-сцены записаны на диск: shared/editor-overrides.json и client/js/editor-overrides-data.js');
    return true;
  } catch (e) {
    console.error('[static-server] Ошибка сохранения оверрайдов:', e);
    return false;
  }
}

const JSON_HEAD = { 'Content-Type': 'application/json; charset=utf-8' };
const ICON_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);

/** 403 для любой ручки записи при выключенном редакторе. */
function editorDisabled(res) {
  res.writeHead(403, JSON_HEAD);
  res.end(JSON.stringify({ ok: false, error: 'editor disabled (set EDITOR_ENABLED=1 locally)' }));
}

/** Собрать тело с лимитом: раньше POST без лимита держал память процесса. */
function readBody(req, res, cb) {
  let body = '';
  let over = false;
  req.on('data', (chunk) => {
    if (over) return;
    body += chunk;
    if (body.length > BODY_LIMIT) {
      over = true;
      res.writeHead(413, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: 'body too large' }));
      req.destroy();
    }
  });
  req.on('end', () => { if (!over) cb(body); });
}

function handleSaveEditorData(req, res) {
  readBody(req, res, (body) => {
    try {
      const data = JSON.parse(body);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        res.writeHead(400, JSON_HEAD);
        return res.end(JSON.stringify({ ok: false, error: 'expected object' }));
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
  readBody(req, res, (body) => {
    try {
      const data = JSON.parse(body);
      const dataUrl = data && data.dataUrl;
      // path.basename: без него name='../../server/server.js' перезаписывал код сервера.
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
      const iconsDir = path.join(CLIENT, 'assets', 'props', 'icons');
      if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });
      const dest = safeJoin(iconsDir, name);
      if (!dest) {
        res.writeHead(400, JSON_HEAD);
        return res.end(JSON.stringify({ ok: false, error: 'bad name' }));
      }
      fs.writeFileSync(dest, buf);
      console.log('[static-server] 📸 Иконка сохранена:', name, `(${buf.length} bytes)`);
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify({ ok: true, name: name }));
    } catch (e) {
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
    }
  });
}

function handleSaveTerrainPaint(req, res) {
  readBody(req, res, (body) => {
    try {
      const data = JSON.parse(body);
      const layer1 = data.layer1;
      const layer2 = data.layer2;
      const dataDir = path.join(CLIENT, 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

      if (layer1) {
        const b1 = Buffer.from(layer1.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        fs.writeFileSync(path.join(dataDir, 'terrain-paint-1.png'), b1);
        fs.writeFileSync(path.join(SHARED, 'terrain-paint-1.png'), b1);
      }
      if (layer2) {
        const b2 = Buffer.from(layer2.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        fs.writeFileSync(path.join(dataDir, 'terrain-paint-2.png'), b2);
        fs.writeFileSync(path.join(SHARED, 'terrain-paint-2.png'), b2);
      }
      console.log('[static-server] 🎨 Текстуры террейна сохранены на диск: data/terrain-paint-1.png, data/terrain-paint-2.png');
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify({ ok: true, message: 'Terrain paint maps saved successfully' }));
    } catch (e) {
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
    }
  });
}

const MODEL_EXT_OK = new Set(['.fbx', '.glb', '.gltf', '.obj']);
const TEXTURE_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);

function handleUploadAsset(req, res) {
  readBody(req, res, (body) => {
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
          targetDir = path.join(CLIENT, 'assets', 'props');
        } else if (TEXTURE_EXT_OK.has(ext)) {
          assetType = 'texture';
          targetDir = path.join(CLIENT, 'assets', 'props', 'textures');
        } else {
          continue;
        }
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const dest = path.join(targetDir, filename);
        if (!dest.startsWith(targetDir + path.sep) && dest !== targetDir) {
          continue;
        }
        const b64 = String(dataUrl).replace(/^data:[^;]+;base64,/, '');
        const buf = Buffer.from(b64, 'base64');
        fs.writeFileSync(dest, buf);
        results.push({
          ok: true,
          filename: filename,
          type: assetType,
          size: buf.length,
          url: (assetType === 'model' ? 'assets/props/' : 'assets/props/textures/') + filename
        });
        console.log(`[static-server] 📦 Ассет загружен: ${filename} (${assetType}, ${buf.length} bytes)`);
      }
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify({ ok: true, uploaded: results }));
    } catch (e) {
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Upload failed' }));
    }
  });
}

// ============================================================
// YouTube подписчики (@AindieGus)
// ============================================================
let ytSubsCache = {
  count: 11, // Подтвержденное фактическое число сабов с YouTube (@AindieGus)
  target: 25,
  channel: '@AindieGus',
  channelUrl: 'https://www.youtube.com/@AindieGus',
  lastChecked: Date.now(),
  source: 'verified_cache'
};

function tryFetchYouTubeSubs() {
  const now = Date.now();
  if (now - ytSubsCache.lastChecked < 300000 && ytSubsCache.source === 'live') return;

  const req = https.get('https://www.youtube.com/@AindieGus', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8'
    },
    timeout: 5000
  }, (resp) => {
    if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) return;
    let body = '';
    resp.on('data', chunk => {
      body += chunk;
      if (body.length > 600000) resp.destroy();
    });
    resp.on('end', () => {
      const m = body.match(/"subscriberCountText":\s*\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"\}\},"simpleText":"([^"]+)"\}/)
        || body.match(/"content":\s*"([0-9.,]+K?M?)\s*(?:subscribers|подписчик)/i)
        || body.match(/([0-9.,]+K?M?)\s*(?:subscribers|подписчик)/i);
      if (m) {
        const raw = m[2] || m[1];
        const num = parseInt(raw.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num) && num > 0) {
          ytSubsCache.count = num;
          ytSubsCache.lastChecked = Date.now();
          ytSubsCache.source = 'live';
          console.log(`[static-server] 🎥 YouTube сабы обновлены: ${num}`);
        }
      }
    });
  });
  req.on('error', () => { /* тихо используем кэш */ });
  req.on('timeout', () => { req.destroy(); });
}

function handleYouTubeSubs(req, res) {
  tryFetchYouTubeSubs();
  try {
    const parsedUrl = new URL(req.url, 'http://localhost:3000');
    const setVal = parsedUrl.searchParams.get('set');
    const origin = String((req.headers && req.headers.origin) || '');
    const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
    if (process.env.NODE_ENV !== 'production' && isLocal && setVal && !isNaN(parseInt(setVal, 10))) {
      ytSubsCache.count = parseInt(setVal, 10);
      ytSubsCache.lastChecked = Date.now();
      ytSubsCache.source = 'manual';
    }
  } catch (err) {}

  const percent = Math.min(100, Math.round((ytSubsCache.count / ytSubsCache.target) * 100));
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache'
  });
  res.end(JSON.stringify({
    ok: true,
    subscribers: ytSubsCache.count,
    target: ytSubsCache.target,
    percent: percent,
    channel: ytSubsCache.channel,
    channelUrl: ytSubsCache.channelUrl,
    source: ytSubsCache.source,
    updatedAt: new Date(ytSubsCache.lastChecked).toISOString()
  }));
}

const server = http.createServer((req, res) => {
  // CORS: `*` был и на POST-ручках записи файлов — любой сайт мог записать
  // исполняемый JS в client/js. GET-ассеты оставляем открытыми (dev-меню),
  // запись — только с localhost.
  const origin = String((req.headers && req.headers.origin) || '');
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (localOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // Лёгкий ping меню (не MMO)
  if (req.url === '/menu-healthz' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('menu static ok');
  }

  // YouTube подписчики для промо-лендинга (@AindieGus)
  if (req.method === 'GET' && (req.url.startsWith('/api/youtube-subs') || req.url.startsWith('/api/youtube/stats'))) {
    return handleYouTubeSubs(req, res);
  }

  // Прозрачный прокси для MMO API (/api/status, /api/chars, /api/auth и т.д.) на VPS
  const isMmoApi = req.url && (
    req.url === '/api/status' || req.url.startsWith('/api/status?') ||
    req.url.startsWith('/api/chars') ||
    req.url.startsWith('/api/auth') ||
    req.url.startsWith('/api/leaderboard') ||
    req.url.startsWith('/api/world-time') ||
    req.url.startsWith('/api/mod/') ||
    req.url.startsWith('/api/admin')
  );
  if (isMmoApi) {
    const vpsHost = process.env.GAME_SERVER_HOST || '93.77.168.135';
    const opt = {
      hostname: vpsHost,
      port: 80,
      path: req.url,
      method: req.method,
      headers: Object.assign({}, req.headers, { host: vpsHost })
    };
    delete opt.headers['connection'];
    const pReq = http.request(opt, (pRes) => {
      const hdrs = Object.assign({}, pRes.headers, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
        'Access-Control-Allow-Headers': 'Content-Type, X-Mod-Secret'
      });
      delete hdrs['transfer-encoding'];
      delete hdrs['connection'];
      res.writeHead(pRes.statusCode, hdrs);
      pRes.pipe(res);
    });
    pReq.on('error', (err) => {
      console.warn('[proxy-to-vps] ' + req.url + ' error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: 'VPS proxy error: ' + err.message }));
      }
    });
    return req.pipe(pReq);
  }

  // Все ручки записи — под гейтом редактора и только для авторизованных сессий.
  if (req.method === 'POST') {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    if (origin && !localOrigin) {
      res.writeHead(403, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, error: 'origin not allowed' }));
    }
  }

  // Сохранение текстур рисования террейна: POST /api/save-terrain-paint
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-terrain-paint') !== -1)) {
    return handleSaveTerrainPaint(req, res);
  }

  // Сохранение иконки пропов: POST /api/save-icon
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-icon') !== -1)) {
    return handleSaveIcon(req, res);
  }

  // Сохранение редактора сцены: POST /api/save-editor и /api/save-editor-data
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-editor') !== -1)) {
    return handleSaveEditorData(req, res);
  }

  // Загрузка ассетов: POST /api/editor/upload-asset
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/upload-asset') !== -1)) {
    return handleUploadAsset(req, res);
  }

  // Сохранение замеров моделей: POST /api/save-measurements
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/save-measurements') !== -1)) {
    return readBody(req, res, (body) => {
      try {
        JSON.parse(body); // не пишем мусор на диск
        fs.writeFileSync(path.join(REPO, 'scratch_props_measurements.json'), body, 'utf8');
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  }

  // Редактор сессия: GET /api/editor/session
  if (req.method === 'GET' && req.url && req.url.indexOf('/api/editor/session') === 0) {
    if (!EditorGuard.allowSessionKey(req.url) && !EditorGuard.isLoopbackReq(req)) {
      res.writeHead(403, JSON_HEAD);
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    const key = EditorGuard.tokenFromQuery(req.url) || 'dev_loopback';
    if (key && typeof EditorGuard.registerToken === 'function') {
      EditorGuard.registerToken(key, { yid: 'gm_editor', pid: 1 });
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': EditorGuard.cookieHeader(key)
    });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    return res.end('method not allowed');
  }

  // Игровой клиент не должен скачать редактор с меню-порта. Только локальный
  // dev с EDITOR_ENABLED (контент-пайплайн). Иначе 404 как будто файла нет.
  if (EditorGuard.isEditorAsset(req.url || '/')) {
    const allow = EditorGuard.allowAsset(req) || (EDITOR_ENABLED && EditorGuard.isLoopbackReq(req));
    if (!allow) {
      const ext = path.extname(req.url.split('?')[0]).toLowerCase();
      const mimeType = MIME[ext] || 'text/plain; charset=utf-8';
      res.writeHead(404, { 'Content-Type': mimeType, 'Cache-Control': 'no-store' });
      return res.end('not found');
    }
  }

  const filePath = resolveFile(req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  // Профили игроков и служебные файлы не раздаём (dev-сборки складывали
  // client/data/local_<id>.json — их отдавали кому угодно).
  if (/(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.tmp(\..*)?)$/i.test(filePath)) {
    res.writeHead(403);
    return res.end('forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if ((req.url || '').split('?')[0] === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('not found: ' + (req.url || '/'));
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Это dev-сервер меню: кэш выключен намеренно, чтобы правки арта было видно.
    const noStore = ext === '.js' || ext === '.html' || ext === '.css' || ext === '.mjs'
      || ext === '.png' || ext === '.webp' || ext === '.jpg' || ext === '.jpeg';
    if (noStore) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=3600';
    }
    if (req.method === 'HEAD') { res.writeHead(200, headers); return res.end(); }
    // gzip для текста: 10 МБ клиентского JS сжимаются примерно в 4 раза
    const ae = req.headers['accept-encoding'] || '';
    if (COMPRESSIBLE.has(ext) && /\bgzip\b/i.test(ae) && data.length > 1024) {
      return zlib.gzip(data, { level: 6 }, (gerr, buf) => {
        if (gerr || !buf) { res.writeHead(200, headers); return res.end(data); }
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        res.writeHead(200, headers);
        res.end(buf);
      });
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, BIND_HOST, () => {
  console.log('[menu-static] http://' + BIND_HOST + ':' + PORT + '/  (menu always available)');
  console.log('[menu-static] open → http://' + BIND_HOST + ':' + PORT + '/menu.html');
  console.log('[menu-static] запись на диск: ' + (EDITOR_ENABLED ? 'РАЗРЕШЕНА (EDITOR_ENABLED=1)' : 'запрещена'));
});

server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('[menu-static] port ' + PORT + ' busy. Set MENU_PORT=3001 or free the port.');
  } else {
    console.error('[menu-static]', e);
  }
  process.exit(1);
});
