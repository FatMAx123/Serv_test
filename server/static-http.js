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
//  POST-ручки здесь раньше генерировали ИСПОЛНЯЕМЫЙ client/js/editor-overrides-data.js
//  (с этапа 4.4 — только JSON-данные) и пишут PNG террейна — то есть это запись кода на сервере без какой-либо
//  авторизации, да ещё с `Access-Control-Allow-Origin: *`. В server.js те же
//  ручки закрыты EDITOR_ENABLED, здесь гейта не было вовсе.
//  Теперь: только явный EDITOR_ENABLED=1, никогда при NODE_ENV=production,
//  и слушаем локальный интерфейс, если не сказано иное.
// ============================================================
// SEC: раньше код включал редактор при любом NODE_ENV != production, вопреки комментарию.
// Оставляем включённым по умолчанию для локального dev (EDITOR_ENABLED=0 — выключить),
// но запись разрешена только с настоящего loopback либо по выданному сервером токену.
const EDITOR_ENABLED = process.env.NODE_ENV !== 'production' && process.env.EDITOR_ENABLED !== '0';
// Опасные побочные эффекты редактора — только явным opt-in.
const AUTO_VPS_SYNC = process.env.EDITOR_AUTO_VPS_SYNC === '1';
const ALLOW_DEPLOY = process.env.EDITOR_ALLOW_DEPLOY === '1';
const BIND_HOST = process.env.MENU_HOST || '127.0.0.1';
const BODY_LIMIT = 32 * 1024 * 1024;

function editorAuthorized(req) {
  if (process.env.NODE_ENV === 'production') return false;
  // SEC: было `token.length >= 16 || valid(token)` — любая строка из 16 символов давала запись.
  const token = EditorGuard.tokenFromCookie(req) || EditorGuard.tokenFromHeader(req);
  if (token && EditorGuard.valid(token)) return true;
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
  let p = '/';
  try {
    p = decodeURIComponent((urlPath || '/').split('?')[0]);
  } catch (_) {
    return null;
  }
  if (p === '/' || p === '') p = '/promo.html';
  if (p === '/menu' || p === 'menu') p = '/menu.html';
  if (p === '/promo' || p === 'promo') p = '/promo.html';
  p = path.normalize(p).replace(/^[\/\\]+/, '');

  let direct = null;
  // /shared/* → repo/shared
  if (p === 'shared' || p.startsWith('shared' + path.sep) || p.startsWith('shared/')) {
    const rel = p.replace(/^shared[\/\\]?/, '');
    direct = safeJoin(SHARED, rel);
  } else if (p === 'dist' || p.startsWith('dist' + path.sep) || p.startsWith('dist/')) {
    const rel = p.replace(/^dist[\/\\]?/, '');
    direct = safeJoin(path.join(REPO, 'dist'), rel);
    if (direct && fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
      direct = path.join(direct, 'index.html');
    }
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

  // Fallback 3b: Missing skill icons (assets/skills/*) -> default engineer mastery icon
  if (p.startsWith('assets/skills/') || p.startsWith('assets\\skills\\')) {
    const defaultSkillIco = safeJoin(CLIENT, path.join('assets', 'skills', 'engineer', 'eng_weapon_mastery.webp'));
    if (defaultSkillIco && fs.existsSync(defaultSkillIco)) return defaultSkillIco;
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

function saveEditorOverridesToDisk(data, opts) {
  try {
    const clean = overridesWriter.writeEditorOverridesFiles(data, opts);
    console.log('[static-server] ✅ Сцена сохранена rev=' + clean.rev);
    return { ok: true, rev: clean.rev, savedAt: clean.savedAt, hash: clean.hash };
  } catch (e) {
    console.error('[static-server] Ошибка сохранения оверрайдов:', e && e.code, e && e.message);
    return { ok: false, code: (e && e.code) || 'EWRITE', error: (e && e.message) || 'write failed',
      currentRev: e && e.currentRev != null ? e.currentRev : overridesWriter.currentRev() };
  }
}

const JSON_HEAD = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
  // SEC: CORS выставляется общим middleware (только локальные origin для записи); `*` здесь убран.
};
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

let vpsSyncTimer = null;
function triggerBackgroundVpsSync() {
  if (vpsSyncTimer) clearTimeout(vpsSyncTimer);
  vpsSyncTimer = setTimeout(() => {
    vpsSyncTimer = null;
    const { exec } = require('child_process');
    console.log('[static-server] ⚡ Фоновая синхронизация оверрайдов на боевой VPS (sync-client-vps.js)...');
    exec('node scripts/sync-client-vps.js', { cwd: REPO }, (err) => {
      if (err) console.warn('[static-server] ⚠️ Предупреждение синхронизации VPS:', err.message);
      else console.log('[static-server] 🟢 Оверрайды успешно доставлены на боевой VPS и применены!');
    });
  }, 2000);
}

let isDeployingRender = false;
function handleDeployRender(req, res) {
  // SEC: запуск внешнего деплоя из браузера — только явным EDITOR_ALLOW_DEPLOY=1.
  if (!ALLOW_DEPLOY) {
    res.writeHead(403, JSON_HEAD);
    return res.end(JSON.stringify({ ok: false, message: 'Деплой из редактора отключён (EDITOR_ALLOW_DEPLOY=1)' }));
  }
  if (isDeployingRender) {
    res.writeHead(429, JSON_HEAD);
    return res.end(JSON.stringify({ ok: false, message: 'Деплой на Render уже выполняется, подождите...' }));
  }
  isDeployingRender = true;
  console.log('[static-server] 🚀 Запуск публикации на Render.com из редактора...');
  const { exec } = require('child_process');
  exec('node scripts/deploy-render.js', { cwd: REPO }, (err, stdout, stderr) => {
    isDeployingRender = false;
    if (err) {
      console.error('[static-server] ❌ Ошибка публикации на Render:', err.message);
      res.writeHead(500, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, error: 'deploy failed' }));
    }
    console.log('[static-server] ✅ Публикация на Render.com успешно завершена!');
    res.writeHead(200, JSON_HEAD);
    res.end(JSON.stringify({ ok: true, message: 'Билд dist/client успешно опубликован на Render.com!' }));
  });
}

function handleSaveEditorData(req, res) {
  readBody(req, res, (body) => {
    try {
      const data = JSON.parse(body);
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        res.writeHead(400, JSON_HEAD);
        return res.end(JSON.stringify({ ok: false, error: 'expected object' }));
      }
      const r = saveEditorOverridesToDisk(data, { baseRev: data.baseRev });
      const ok = r.ok;
      // SEC/EDITOR: синхронизация с боевым VPS — только явным EDITOR_AUTO_VPS_SYNC=1 и только при успешной записи.
      // Раньше запускалась на каждое сохранение (даже неудачное) и всегда отвечала vpsSynced:true.
      const vpsQueued = !!(ok && AUTO_VPS_SYNC);
      if (vpsQueued) triggerBackgroundVpsSync();
      const status = ok ? 200 : (r.code === 'ECONFLICT' ? 409 : (r.code === 'EINVALID' || r.code === 'EWIPE' ? 422 : 500));
      res.writeHead(status, JSON_HEAD);
      res.end(JSON.stringify(Object.assign({
        vpsSynced: false,
        vpsQueued: vpsQueued,
        message: ok
          ? ('Сцена сохранена (rev ' + r.rev + ').' + (vpsQueued ? ' Фоновая синхронизация с VPS запущена.' : ''))
          : r.error
      }, r)));
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
      overridesWriter.writeAtomic(dest, buf); // атомарно: tmp + rename
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
      // E13: проверка PNG + атомарная запись всех карт (tmp + rename)
      overridesWriter.writeTerrainPaint(data, CLIENT, SHARED);
      console.log('[static-server] 🎨 Текстуры террейна сохранены на диск: data/terrain-paint-1.png, data/terrain-paint-2.png');
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify({ ok: true, message: 'Terrain paint maps saved successfully' }));
    } catch (e) {
      if (e && (e.code === 'EINVALID' || e instanceof SyntaxError)) {
        res.writeHead(400, JSON_HEAD);
        return res.end(JSON.stringify({ ok: false, error: e.message }));
      }
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
        overridesWriter.writeAtomic(dest, buf); // атомарно: tmp + rename
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
  // SEC: `*` на GET позволял любому сайту читать ответы dev-сервера (в т.ч. проксированные API).
  if (localOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Editor-Key');
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
    // SEC: админ/мод-ручки через dev-прокси — только явным PROXY_ADMIN=1; секреты и cookie
    // не пересылаются по открытому HTTP; CORS только для локальных origin.
    if ((req.url.startsWith('/api/mod/') || req.url.startsWith('/api/admin')) && process.env.PROXY_ADMIN !== '1') {
      res.writeHead(403, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, error: 'admin proxy disabled' }));
    }
    const vpsHost = String(process.env.GAME_SERVER_HOST || '').trim();
    if (!vpsHost) {
      res.writeHead(503, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, error: 'GAME_SERVER_HOST не задан (адрес игрового сервера для dev-прокси)' }));
    }
    const useTls = (process.env.GAME_SERVER_PROTO || 'http') === 'https';
    const fwd = Object.assign({}, req.headers, { host: vpsHost });
    delete fwd['connection'];
    delete fwd['cookie'];
    delete fwd['x-forwarded-for'];
    delete fwd['x-real-ip'];
    if (!useTls) { delete fwd['x-mod-secret']; delete fwd['x-stress-secret']; delete fwd['x-editor-secret']; delete fwd['authorization']; }
    const opt = {
      hostname: vpsHost,
      port: parseInt(process.env.GAME_SERVER_PORT || (useTls ? '443' : '80'), 10),
      path: req.url,
      method: req.method,
      headers: fwd
    };
    const transport = useTls ? require('https') : http;
    const pReq = transport.request(opt, (pRes) => {
      const hdrs = Object.assign({}, pRes.headers);
      delete hdrs['access-control-allow-origin'];
      delete hdrs['set-cookie'];
      if (localOrigin) { hdrs['Access-Control-Allow-Origin'] = origin; hdrs['Vary'] = 'Origin'; }
      delete hdrs['transfer-encoding'];
      delete hdrs['connection'];
      res.writeHead(pRes.statusCode, hdrs);
      pRes.pipe(res);
    });
    pReq.on('error', (err) => {
      console.warn('[proxy-to-vps] ' + req.url + ' error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: 'VPS proxy error' }));
      }
    });
    if (req.method === 'GET' || req.method === 'HEAD') {
      pReq.end();
      return;
    }
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

  // Публикация на Render.com из редактора: POST /api/editor/deploy-render
  if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/deploy-render') !== -1)) {
    return handleDeployRender(req, res);
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
        if (body.length > 4 * 1024 * 1024) throw new Error('too large');
        fs.writeFileSync(path.join(REPO, 'scratch_props_measurements.json'), body, 'utf8');
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: 'bad measurements' }));
      }
    });
  }

  // Редактор сессия: POST /api/editor/session (ключ — в заголовке X-Editor-Key, не в URL)
  if ((req.method === 'POST' || req.method === 'GET') && req.url && req.url.indexOf('/api/editor/session') === 0) {
    // SEC: раньше loopback-GET регистрировал ЛЮБОЙ переданный токен (CSRF-able через <img src>).
    // Теперь: валидный выданный токен — ставим его в cookie; loopback без токена — сервер генерирует свой.
    let key = '';
    if (EditorGuard.sessionKey(req)) {
      key = EditorGuard.sessionKey(req);
    } else if (EDITOR_ENABLED && EditorGuard.isLoopbackReq(req) && (!origin || localOrigin)) {
      key = require('crypto').randomBytes(24).toString('hex');
      EditorGuard.registerToken(key, { yid: 'gm_editor', pid: 0 });
    } else {
      res.writeHead(403, JSON_HEAD);
      res.end(JSON.stringify({ ok: false }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': EditorGuard.cookieHeader(key, req)
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


if (require.main === module) {
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
}

module.exports = { server, PORT, BIND_HOST, resolveFile };
