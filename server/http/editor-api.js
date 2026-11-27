// ============================================================
//  SERVER / HTTP / EDITOR-API.JS — HTTP-ручки редактора мира.
//  Только локальная машина: в боевой пакет VPS этот файл не входит, игровой
//  сервер подключает его через server/editor-gate.js (на проде — null).
//  Сохранение сцены пишет рабочий файл редактора и тут же перепекает данные мира
//  (shared/world-data.json — их и читает игра; см. editor-overrides-writer.js).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const EditorGuard = require('../editor-guard.js');
const overridesWriter = require('../editor-overrides-writer.js');
const sculptWriter = require('../terrain-sculpt-writer.js');
const Bake = require('../../scripts/bake-world.js');
const WM = require('../../shared/world-metrics.js');
const NPCS = require('../../shared/npc-services.js');

const JSON_HEAD = { 'Content-Type': 'application/json; charset=utf-8' };
const EDITOR_BODY_LIMIT = 32 * 1024 * 1024;
const ICON_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);
const MODEL_EXT_OK = new Set(['.fbx', '.glb', '.gltf', '.obj']);
const TEXTURE_EXT_OK = new Set(['.png', '.webp', '.jpg', '.jpeg']);

/**
 * @param {object} ctx - контекст роутера (players, send, rebuildServerSpots, EDITOR_ENABLED, CLIENT_DIR, SHARED_DIR)
 * @param {{ collectBody: Function, modAuthorized: Function, editorDisabled: Function }} h - общие помощники admin-api
 */
function createEditorApi(ctx, h) {
  const { players, send, rebuildServerSpots, EDITOR_ENABLED, CLIENT_DIR, SHARED_DIR } = ctx;
  // локальная релизная сборка (если есть) получает тот же запечённый мир
  const DIST_WORLD_JSON = path.join(__dirname, '..', '..', 'dist', 'client', 'data', 'world.json');
  const { collectBody, modAuthorized, editorDisabled } = h;

  function editorAuthorized(req) {
    // Административный секрет даёт авторизованный доступ даже в продакшене (синхронизация GM с локальной машины)
    if (modAuthorized(req)) return true;
    if (process.env.NODE_ENV === 'production') return false;
    const token = EditorGuard.tokenFromCookie(req) || EditorGuard.tokenFromHeader(req);
    if (token && EditorGuard.valid(token)) return true;
    if (EditorGuard.isLoopbackReq(req) && (process.env.EDITOR_ENABLED === '1' || process.env.EDITOR_ENABLED === 'true' || (process.env.NODE_ENV !== 'production' && process.env.EDITOR_ENABLED !== '0'))) return true;
    return false;
  }

  /**
   * EDITOR: порядок «проверить → записать атомарно → применить в runtime → оповестить клиентов».
   * Раньше runtime менялся ДО записи: при отказе записи (wipe guard / ошибка) сервер жил в мире,
   * которого нет на диске, а после рестарта откатывался. Возвращает подробный результат.
   * @returns {{ok:boolean, rev?:number, savedAt?:number, hash?:string, code?:string, error?:string, currentRev?:number}}
   */
  function saveEditorOverridesToDisk(data, opts) {
    let clean;
    try {
      clean = overridesWriter.writeEditorOverridesFiles(data, opts);
    } catch (e) {
      const code = (e && e.code) || 'EWRITE';
      console.error('[server] Ошибка сохранения оверрайдов:', code, e && e.message);
      return { ok: false, code, error: (e && e.message) || 'write failed', currentRev: e && e.currentRev != null ? e.currentRev : overridesWriter.currentRev() };
    }
    try {
      if (WM.applyEditorOverrides) WM.applyEditorOverrides(clean);
      if (rebuildServerSpots) rebuildServerSpots();
      NPCS.rebuild();
      try { if (global.PropsCollision && global.PropsCollision.invalidate) global.PropsCollision.invalidate(); } catch (_) {}
    } catch (eApply) {
      // Диск уже авторитетен; runtime догонит после рестарта. Сообщаем, но запись успешна.
      console.error('[server] оверрайды записаны, но применение в runtime упало:', eApply);
    }
    // Оповещение игроков: клиент перечитает данные мира (иначе сервер и клиенты живут в разных мирах)
    try {
      const note = { t: 'editor_overrides_updated', rev: clean.rev, savedAt: clean.savedAt, hash: clean.hash };
      for (const pl of players.values()) { try { send(pl, note); } catch (_) {} }
    } catch (_) {}
    console.log('[server] ✅ Сцена сохранена rev=' + clean.rev + ' (shared/editor-overrides.json, client/data/editor-overrides.json)');
    let bake = null;
    try { bake = Bake.bakeStatus(); } catch (_) { bake = null; }
    return { ok: true, rev: clean.rev, savedAt: clean.savedAt, hash: clean.hash, bake };
  }

  /**
   * «Запечь мир» (как Build в UE / экспорт в Godot): сохранённая сцена редактора — со всеми
   * правками и удалениями — превращается в данные мира, которые читает игра:
   * shared/world-data.json (сервер) и, если есть локальная релизная сборка, dist/client/data/world.json.
   * Ответ — отчёт: что в мире и что изменилось с прошлого запекания.
   */
  function bakeWorldNow() {
    const extra = fs.existsSync(path.dirname(DIST_WORLD_JSON)) ? [DIST_WORLD_JSON] : [];
    const r = Bake.bakeToDisk({ extra });
    console.log('[editor] 🔥 Мир запечён: rev ' + r.rev + ', ' + (r.bytes / 1024).toFixed(1) + ' КБ' +
      (r.changed ? ' → ' + r.written.join(', ') : ' (без изменений)'));
    return Object.assign({ ok: true, status: Bake.bakeStatus() }, r);
  }

  function handleBakeWorld(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    try {
      const r = bakeWorldNow();
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify(r));
    } catch (e) {
      console.error('[editor] запекание мира не удалось:', e);
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: (e && e.message) || 'bake failed' }));
    }
  }

  function handleBakeStatus(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    try {
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify(Object.assign({ ok: true }, Bake.bakeStatus())));
    } catch (e) {
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: (e && e.message) || 'status failed' }));
    }
  }

  function handleSaveEditorData(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    collectBody(req, EDITOR_BODY_LIMIT, () => {
      res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    }, (body) => {
      try {
        const data = JSON.parse(body);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: 'bad payload' }));
        }
        const r = saveEditorOverridesToDisk(data, { baseRev: data.baseRev });
        const code = r.ok ? 200 : (r.code === 'ECONFLICT' ? 409 : (r.code === 'EINVALID' || r.code === 'EWIPE' ? 422 : 500));
        res.writeHead(code, JSON_HEAD);
        res.end(JSON.stringify(Object.assign({ message: r.ok ? 'Сцена сохранена (rev ' + r.rev + ')' : r.error }, r)));
      } catch (e) {
        res.writeHead(400, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, code: 'EINVALID', error: 'bad json' }));
      }
    });
  }

  function handleSaveIcon(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    collectBody(req, EDITOR_BODY_LIMIT, () => {
      res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    }, async (body) => {
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
        overridesWriter.writeAtomic(dest, buf); // атомарно: tmp + rename
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
    collectBody(req, EDITOR_BODY_LIMIT, () => {
      res.writeHead(413, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    }, async (body) => {
      try {
        const data = JSON.parse(body);
        const items =Array.isArray(data.items) ? data.items : (Array.isArray(data.files) ? data.files : [data]);
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
          overridesWriter.writeAtomic(dest, buf); // атомарно: tmp + rename
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

  let _deployingWorld = false;
  function handleWorldBuildOrDeploy(req, res, buildOnly) {
    if (!EDITOR_ENABLED || process.env.NODE_ENV === 'production' || process.env.EDITOR_ALLOW_DEPLOY === '0' || !EditorGuard.isLoopbackReq(req) || !editorAuthorized(req)) {
      return editorDisabled(res);
    }
    if (_deployingWorld) {
      res.writeHead(429, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, message: 'Сборка или деплой мира уже выполняется, подождите...' }));
    }
    const repoRoot = path.resolve(CLIENT_DIR, '..');
    const scriptPath = path.join(repoRoot, 'scripts', 'deploy-world-client.js');
    if (!fs.existsSync(scriptPath)) {
      res.writeHead(404, JSON_HEAD);
      return res.end(JSON.stringify({ ok: false, message: 'Скрипт scripts/deploy-world-client.js не найден (запустите deploy-world.bat в корне репозитория).' }));
    }
    _deployingWorld = true;
    const { execFile } = require('child_process');
    const args = buildOnly ? [scriptPath, '--build-only'] : [scriptPath];
    console.log(buildOnly
      ? '[server] 📦 Сборка локального чистого клиента dist/client из редактора...'
      : '[server] 🚀 Ручной деплой мира (dist/client + Render.com) из редактора...');
    execFile(process.execPath, args, { cwd: repoRoot, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      _deployingWorld = false;
      if (err) {
        const detail = String((stderr || stdout || err.message || '')).trim().slice(-400);
        console.error('[server] ❌ Ошибка сборки/публикации мира:', detail);
        res.writeHead(500, JSON_HEAD);
        return res.end(JSON.stringify({ ok: false, error: 'deploy failed', message: detail || err.message }));
      }
      console.log(buildOnly
        ? '[server] ✅ Локальный чистый клиент dist/client успешно обновлён!'
        : '[server] ✅ Мир собран в dist/client и опубликован на Render.com!');
      res.writeHead(200, JSON_HEAD);
      res.end(JSON.stringify({
        ok: true,
        message: buildOnly
          ? 'Чистый боевой клиент dist/client успешно обновлён!'
          : 'Билд dist/client собран и опубликован на Render.com!'
      }));
    });
  }

  function handleSaveTerrainPaint(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    collectBody(req, EDITOR_BODY_LIMIT, () => {
      res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    }, async (body) => {
      try {
        const data = JSON.parse(body);
        // E13: проверка PNG + атомарная запись всех карт (tmp + rename)
        overridesWriter.writeTerrainPaint(data, CLIENT_DIR, SHARED_DIR);
        console.log('[server] 🎨 Текстуры террейна (дороги/кисти) сохранены на диск: data/terrain-paint-1.png, data/terrain-paint-2.png');
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify({ ok: true, message: 'Terrain paint maps saved successfully' }));
      } catch (e) {
        if (e && (e.code === 'EINVALID' || e instanceof SyntaxError)) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        console.error('[server] Ошибка сохранения terrain paint:', e);
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
      }
    });
  }

  /** Кисть ландшафта: POST /api/editor/terrain-sculpt {verts:[[vi,y]], baked:[[i,h]]} → terrain.bin + terrain-data.js. */
  function handleSaveTerrainSculpt(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    collectBody(req, EDITOR_BODY_LIMIT, () => {
      res.writeHead(413, JSON_HEAD); res.end(JSON.stringify({ ok: false, error: 'payload too large' }));
    }, async (body) => {
      try {
        const out = sculptWriter.writeTerrainSculpt(JSON.parse(body));
        console.log('[server] ⛰ Рельеф сохранён кистью: вершин ' + out.verts + ', ячеек bake ' + out.baked + ', ?v=' + out.version + ' (бэкап ' + out.backup.snapshot + ')');
        // сервер сразу ходит по новому рельефу (GEO.moveAlong / standY), без рестарта
        try { if (typeof ctx.reloadWorldGeo === 'function') ctx.reloadWorldGeo(); } catch (eG) { console.warn('[server] reload geo:', eG && eG.message); }
        res.writeHead(200, JSON_HEAD);
        res.end(JSON.stringify(Object.assign({ ok: true }, out)));
      } catch (e) {
        if (e && (e.code === 'EINVALID' || e instanceof SyntaxError)) {
          res.writeHead(400, JSON_HEAD);
          return res.end(JSON.stringify({ ok: false, error: e.message }));
        }
        console.error('[server] Ошибка сохранения рельефа:', e);
        res.writeHead(500, JSON_HEAD);
        res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
      }
    });
  }

  /** Исходный меш (до первой правки кистью) — для «кисти отмены» редактора. */
  function handleTerrainOriginal(req, res) {
    if (!EDITOR_ENABLED || !editorAuthorized(req)) return editorDisabled(res);
    try {
      const buf = sculptWriter.readOriginalBin();
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store', 'Content-Length': buf.length });
      res.end(buf);
    } catch (e) {
      res.writeHead(500, JSON_HEAD);
      res.end(JSON.stringify({ ok: false, error: e ? e.message : 'Unknown error' }));
    }
  }

  /** Маршрутизация ручек редактора; true — запрос обработан. */
  function handleRequest(req, res) {
    if (req.method === 'POST' && req.url && req.url.indexOf('/api/editor/bake-world') === 0) {
      handleBakeWorld(req, res);
      return true;
    }
    if (req.method === 'GET' && req.url && req.url.indexOf('/api/editor/bake-status') === 0) {
      handleBakeStatus(req, res);
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

    if (req.method === 'POST' && req.url && req.url.indexOf('/api/editor/terrain-sculpt') === 0) {
      handleSaveTerrainSculpt(req, res);
      return true;
    }

    if (req.method === 'GET' && req.url && req.url.indexOf('/api/editor/terrain-original') === 0) {
      handleTerrainOriginal(req, res);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/upload-asset') !== -1)) {
      handleUploadAsset(req, res);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/build-client') !== -1)) {
      handleWorldBuildOrDeploy(req, res, true);
      return true;
    }

    if (req.method === 'POST' && req.url && (req.url.indexOf('/api/editor/deploy-render') !== -1)) {
      handleWorldBuildOrDeploy(req, res, false);
      return true;
    }

    if ((req.method === 'POST' || req.method === 'GET') && req.url && req.url.indexOf('/api/editor/session') === 0) {
      // SEC: ключ — только в заголовке X-Editor-Key (раньше ?k= в URL → логи nginx, Referer, история)
      const key = EditorGuard.sessionKey(req);
      if (!key) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false }));
        return true;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': EditorGuard.cookieHeader(key, req)
      });
      res.end(JSON.stringify({ ok: true }));
      return true;
    }
    return false;
  }

  return {
    handleRequest,
    bakeWorldNow,
    saveEditorOverridesToDisk,
    handleSaveEditorData,
    handleSaveTerrainPaint,
    handleSaveTerrainSculpt,
    handleSaveIcon,
    handleUploadAsset
  };
}

module.exports = { createEditorApi };
