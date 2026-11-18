'use strict';

/**
 * server/http/static-server.js
 * ============================================================================
 * Безопасная раздача клиентских статических ассетов с защитой приватных файлов,
 * контролем доступа к редактору (EditorGuard), ETag (304) и FIFO gzip-кэшем.
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const EditorGuard = require('../editor-guard.js');

const DATA_PUBLIC = /^terrain-paint-\d+\.png$/i;
const DATA_PRIVATE = /(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.backup(\..*)?|.*\.tmp(\..*)?|editor-overrides\.backup.*)$/i;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.map': 'application/json',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.fbx': 'application/octet-stream', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav'
};
const COMPRESSIBLE = new Set(['.js', '.mjs', '.html', '.css', '.json', '.svg', '.map', '.txt', '.csv']);
const STATIC_MAX_AGE = 31536000;
const GZIP_CACHE_MAX = 64 * 1024 * 1024;

function createStaticServer(ctx = {}) {
  const REPO_ROOT = ctx.REPO_ROOT || path.join(__dirname, '..', '..');
  const ALLOWED_ROOTS = ctx.ALLOWED_ROOTS || [
    path.join(REPO_ROOT, 'client'),
    path.join(REPO_ROOT, 'shared'),
    path.join(REPO_ROOT, 'data')
  ];
  const NO_CACHE = ctx.NO_CACHE != null
    ? !!ctx.NO_CACHE
    : (process.env.SERVE_NO_CACHE != null ? process.env.SERVE_NO_CACHE === '1' : process.env.NODE_ENV !== 'production');

  const gzipCache = new Map(); // filePath -> { mtime, size, buf }
  let gzipCacheBytes = 0;

  function resolveStaticPath(urlPath) {
    let p = urlPath;
    if (p === '/' || p === '') p = '/menu.html';
    if (p === '/index.html' || p === 'index.html') p = '/menu.html';
    if (p === '/launcher' || p === 'launcher') p = '/launcher.html';
    let rel = path.normalize(p).replace(/^[\/\\]+/, '');
    if (rel.startsWith('..')) return null;
    if (DATA_PRIVATE.test(rel)) return null;
    const top = rel.split(/[\/\\]/)[0];
    if (top === 'data') {
      const inClient = path.join(REPO_ROOT, 'client', rel);
      if (fs.existsSync(inClient)) return inClient;
      const name = rel.split(/[\/\\]/).slice(1).join('/');
      if (DATA_PUBLIC.test(name)) return path.join(REPO_ROOT, rel);
      return null;
    }
    if (top === 'shared' || top === 'client') {
      const primary = path.join(REPO_ROOT, rel);
      if (fs.existsSync(primary)) return primary;
      const fallback = path.join(REPO_ROOT, 'client', rel);
      if (fs.existsSync(fallback)) return fallback;
      return primary;
    }
    return path.join(REPO_ROOT, 'client', rel);
  }

  function acceptsGzip(req) {
    const ae = req.headers && req.headers['accept-encoding'];
    return !!ae && /\bgzip\b/i.test(ae);
  }

  function sendStatic(req, res, filePath, stat, data) {
    const ext = path.extname(filePath).toLowerCase();
    const etag = 'W/"' + stat.size.toString(16) + '-' + stat.mtimeMs.toString(16) + '"';
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag };
    headers['Last-Modified'] = stat.mtime.toUTCString();

    if (EditorGuard.isEditorAsset(filePath) || EditorGuard.isEditorAsset(path.basename(filePath))) {
      headers['Cache-Control'] = 'private, no-store, no-cache';
      headers['Pragma'] = 'no-cache';
    } else if (NO_CACHE) {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0';
      headers['Pragma'] = 'no-cache';
    } else if (ext === '.html' || /(^|[\/\\])(editor-overrides-data\.js|editor-overrides\.json|terrain-paint-[12]\.png)$/i.test(filePath)) {
      headers['Cache-Control'] = 'no-cache';
    } else {
      headers['Cache-Control'] = 'public, max-age=' + STATIC_MAX_AGE + ', immutable';
    }

    const inm = req.headers && req.headers['if-none-match'];
    if (!NO_CACHE && inm && inm === etag) {
      res.writeHead(304, headers);
      return res.end();
    }

    if (COMPRESSIBLE.has(ext) && acceptsGzip(req) && data.length > 1024) {
      const key = filePath;
      const hit = gzipCache.get(key);
      if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) {
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        res.writeHead(200, headers);
        return res.end(hit.buf);
      }
      return zlib.gzip(data, { level: 6 }, (err, buf) => {
        if (err || !buf) { res.writeHead(200, headers); return res.end(data); }
        if (gzipCache.has(key)) {
          const oldEntry = gzipCache.get(key);
          if (oldEntry && oldEntry.buf) {
            gzipCacheBytes = Math.max(0, gzipCacheBytes - oldEntry.buf.length);
          }
        }
        while (gzipCacheBytes + buf.length > GZIP_CACHE_MAX && gzipCache.size > 0) {
          const oldestKey = gzipCache.keys().next().value;
          const oldestEntry = gzipCache.get(oldestKey);
          if (oldestEntry && oldestEntry.buf) {
            gzipCacheBytes = Math.max(0, gzipCacheBytes - oldestEntry.buf.length);
          }
          gzipCache.delete(oldestKey);
        }
        if (gzipCacheBytes + buf.length <= GZIP_CACHE_MAX) {
          gzipCache.set(key, { mtime: stat.mtimeMs, size: stat.size, buf });
          gzipCacheBytes += buf.length;
        }
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        res.writeHead(200, headers);
        res.end(buf);
      });
    }

    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    res.end(data);
  }

  function denyEditor(res, urlPath) {
    const isCss = urlPath && String(urlPath).endsWith('.css');
    res.writeHead(404, {
      'Content-Type': isCss ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(isCss ? '/* 404 not found */' : 'not found');
  }

  function serveStatic(req, res) {
    try {
      let urlPath = '/';
      try {
        urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('bad request');
      }
      if (urlPath === '/favicon.ico') { res.writeHead(204); return res.end(); }
      if (EditorGuard.isEditorAsset(urlPath) && !EditorGuard.allowAsset(req)) {
        return denyEditor(res, urlPath);
      }
      const filePath = resolveStaticPath(urlPath);
      if (!filePath) { res.writeHead(403); return res.end('forbidden'); }
      if (!ALLOWED_ROOTS.some(a => filePath === a || filePath.startsWith(a + path.sep))) { res.writeHead(403); return res.end('forbidden'); }
      fs.stat(filePath, (serr, stat) => {
        if (serr || !stat.isFile()) { res.writeHead(404); return res.end('not found'); }
        fs.readFile(filePath, (err, data) => {
          if (err) { res.writeHead(404); return res.end('not found'); }
          sendStatic(req, res, filePath, stat, data);
        });
      });
    } catch (e) { res.writeHead(500); res.end('error'); }
  }

  return {
    ALLOWED_ROOTS,
    DATA_PUBLIC,
    DATA_PRIVATE,
    MIME,
    COMPRESSIBLE,
    resolveStaticPath,
    acceptsGzip,
    sendStatic,
    denyEditor,
    serveStatic
  };
}

module.exports = {
  createStaticServer,
  DATA_PUBLIC,
  DATA_PRIVATE,
  MIME,
  COMPRESSIBLE
};

