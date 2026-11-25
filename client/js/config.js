// ============================================================
//  CLIENT / JS / CONFIG.JS  —  сервер + канон путей к текстурам.
//
//  КАНОН: все игровые текстуры ТОЛЬКО в
//    client/data/textures/
//  (подпапки ок: tiles/, detail256/ …). Не класть в assets/,
//  js/, корень client/ и т.п. — новый арт → data/textures/.
//
//  texUrl('moon.webp') → data/textures/… (+ client/… fallback)
//  loadTex(name, onOk, onFail) — TextureLoader с цепочкой путей
// ============================================================
(function () {
  var PROD_HOST = window.PS_SERVER.host;   // адрес — в js/server-hosts.js
  var PROD_SSL_HOST = window.PS_SERVER.sslHost;
  var qServer = null;
  try {
    var s = location.search || '';
    var m = s.match(/[?&](?:server|host)[=-]([^&]+)/i);
    if (m && m[1]) qServer = decodeURIComponent(m[1]).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!qServer) {
      var mIp = s.match(/[?&](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?)/);
      if (mIp && mIp[1]) qServer = mIp[1].trim();
    }
    if (!qServer) {
      var q = new URLSearchParams(s).get('server');
      if (q) qServer = q.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    }
  } catch (e) {}

  var rawCandidate = null;
  if (window.PS_SERVER && window.PS_SERVER.isLocalEnv && window.PS_SERVER.isLocalEnv()) {
    rawCandidate = qServer;
  }
  var savedHost = null;
  try { savedHost = sessionStorage.getItem('ps_game_host') || localStorage.getItem('ps_game_host'); } catch (e) {}
  
  var hostCandidate = rawCandidate || savedHost || PROD_HOST;
  var host = window.PS_SERVER && window.PS_SERVER.sanitizeHost ? window.PS_SERVER.sanitizeHost(hostCandidate) : PROD_HOST;
  
  if (rawCandidate && window.PS_SERVER && window.PS_SERVER.isAllowedHost && window.PS_SERVER.isAllowedHost(rawCandidate)) {
    try {
      sessionStorage.setItem('ps_game_host', host);
      localStorage.setItem('ps_game_host', host);
    } catch (e) {}
  } else {
    try {
      if (sessionStorage.getItem('ps_game_host') && window.PS_SERVER && !window.PS_SERVER.isAllowedHost(sessionStorage.getItem('ps_game_host'))) {
        sessionStorage.removeItem('ps_game_host');
      }
      if (localStorage.getItem('ps_game_host') && window.PS_SERVER && !window.PS_SERVER.isAllowedHost(localStorage.getItem('ps_game_host'))) {
        localStorage.removeItem('ps_game_host');
      }
    } catch (e) {}
  }

  function normalizeHost(h) {
    if (!h) return PROD_HOST;
    if (window.PS_SERVER && window.PS_SERVER.sanitizeHost) {
      return window.PS_SERVER.sanitizeHost(h);
    }
    var str = String(h).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return str;
  }

  var override = window.STEAM_CONFIG_OVERRIDE || {};
  window.STEAM_CONFIG = {
    serverHost: normalizeHost(override.serverHost || host),
    get serverUrl() {
      var targetHost = this.serverHost;
      // прод-сервер — всегда TLS (wss на SSL-имя), иначе — по протоколу страницы
      if (window.PS_SERVER && window.PS_SERVER.isProdHost && window.PS_SERVER.isProdHost(targetHost)) {
        return 'wss://' + PROD_SSL_HOST;
      }
      var isHttps = (location.protocol === 'https:');
      if (isHttps && targetHost === PROD_HOST) targetHost = PROD_SSL_HOST;
      return (isHttps ? 'wss://' : 'ws://') + targetHost;
    }
  };

  /** Единственный корень текстур (относительно client/ при серве из client/). */
  var TEX = 'data/textures/';

  /**
   * Список URL для загрузки (сначала data/textures/, потом client/data/textures/).
   * texUrl('moon.webp')
   * texUrl(['map_world.webp', 'Map.webp'])
   * texUrl('tiles/T_0_0.webp') / texUrl('detail256/grass_256.webp')
   */
  function texUrl(relOrList) {
    var names = Array.isArray(relOrList) ? relOrList : [relOrList];
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var r = String(names[i] || '')
        .replace(/\\/g, '/')
        .replace(/^\/+/, '')
        .replace(/^(?:\.\/)?(?:client\/)?data\/textures\//i, '')
        .replace(/^(?:\.\/)?assets\//i, '');
      if (!r) continue;
      out.push(TEX + r);
      out.push('client/' + TEX + r);
    }
    return out;
  }

  /**
   * THREE.TextureLoader: первый удачный путь из texUrl.
   * Возвращает Texture-holder (image появится async).
   * onOk(tex, url) / onFail(paths)
   */
  var _dummyCanvas = null;
  function getDummy1x1() {
    if (!_dummyCanvas && typeof document !== 'undefined') {
      _dummyCanvas = document.createElement('canvas');
      _dummyCanvas.width = 1;
      _dummyCanvas.height = 1;
    }
    return _dummyCanvas;
  }

  var _pendingTexPromises = new Set();

  function loadTex(relOrList, onOk, onFail) {
    var THREE = window.THREE;
    var paths = texUrl(relOrList);
    if (!THREE || !paths.length) {
      if (onFail) onFail(paths || []);
      return null;
    }
    var loader = new THREE.TextureLoader();
    var holder = new THREE.Texture(getDummy1x1());
    holder.userData = holder.userData || {};
    holder.userData.pending = true;
    var done;
    var prom = typeof Promise !== 'undefined' ? new Promise(function (res) { done = res; }) : null;
    if (prom) {
      _pendingTexPromises.add(prom);
      prom.finally(function () { _pendingTexPromises.delete(prom); });
    }
    var idx = 0;
    function attempt() {
      if (idx >= paths.length) {
        holder.userData.pending = false;
        holder.userData.failed = true;
        if (onFail) onFail(paths);
        if (done) { done(holder); done = null; }
        return;
      }
      var url = paths[idx++];
      loader.load(url, function (t) {
        holder.image = t.image;
        if (t.colorSpace != null) holder.colorSpace = t.colorSpace;
        holder.needsUpdate = true;
        holder.userData.pending = false;
        holder.userData.src = url;
        if (onOk) onOk(holder, url);
        if (done) { done(holder); done = null; }
      }, undefined, attempt);
    }
    attempt();
    return holder;
  }

  function waitAllLoadTexReady(timeoutMs) {
    if (typeof Promise === 'undefined' || !_pendingTexPromises.size) {
      return typeof Promise !== 'undefined' ? Promise.resolve() : undefined;
    }
    var pending = Array.from(_pendingTexPromises);
    var ms = timeoutMs || 15000;
    return Promise.race([
      Promise.all(pending),
      new Promise(function (res) { setTimeout(res, ms); })
    ]);
  }

  window.TEX_ROOT = TEX;
  window.texUrl = texUrl;
  window.loadTex = loadTex;
  window.waitAllLoadTexReady = waitAllLoadTexReady;
  window.STEAM_CONFIG.texRoot = TEX;
  window.STEAM_CONFIG.texUrl = texUrl;
  window.STEAM_CONFIG.loadTex = loadTex;
  window.STEAM_CONFIG.waitAllLoadTexReady = waitAllLoadTexReady;
})();
