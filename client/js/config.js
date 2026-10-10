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

  function normalizeHost(h) {
    if (!h) return PROD_HOST;
    var str = String(h).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (str.indexOf('localhost') !== -1 || str.indexOf('127.0.0.1') !== -1) return str;
    return str.replace(/:\d+$/, '');
  }

  var savedHost = null;
  try { savedHost = sessionStorage.getItem('ps_game_host') || localStorage.getItem('ps_game_host'); } catch (e) {}
  var host = normalizeHost(qServer || savedHost || PROD_HOST);
  if (qServer) {
    try {
      sessionStorage.setItem('ps_game_host', host);
      localStorage.setItem('ps_game_host', host);
    } catch (e) {}
  }
  var override = window.STEAM_CONFIG_OVERRIDE || {};
  window.STEAM_CONFIG = {
    serverHost: normalizeHost(override.serverHost || host),
    get serverUrl() {
      var isHttps = (location.protocol === 'https:');
      var targetHost = this.serverHost;
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
    var idx = 0;
    function attempt() {
      if (idx >= paths.length) {
        holder.userData.pending = false;
        holder.userData.failed = true;
        if (onFail) onFail(paths);
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
      }, undefined, attempt);
    }
    attempt();
    return holder;
  }

  window.TEX_ROOT = TEX;
  window.texUrl = texUrl;
  window.loadTex = loadTex;
  window.STEAM_CONFIG.texRoot = TEX;
  window.STEAM_CONFIG.texUrl = texUrl;
  window.STEAM_CONFIG.loadTex = loadTex;
})();
