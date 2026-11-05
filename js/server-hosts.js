// ============================================================
//  CLIENT / JS / SERVER-HOSTS.JS — ЕДИНСТВЕННОЕ место с адресом игрового сервера.
//  Сменить сервер/домен = поменять HOST и SSL_HOST здесь (и CORS_ORIGINS на сервере).
//  Подключается первым классическим скриптом на страницах (menu/game/character-select)
//  и первым в boot.module.js. Остальные модули берут адрес из window.PS_SERVER.
// ============================================================
(function () {
  'use strict';
  if (window.PS_SERVER) return;
  var HOST = '217.179.49.236';            // VPS (http / ws)
  var SSL_HOST = '217.179.49.236.sslip.io'; // тот же сервер с TLS (https / wss)

  function bare(h) {
    return String(h || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  }
  /** Хост — это прод-сервер по IP (с портом или без)? */
  function isPlainHost(h) {
    return bare(h).replace(/:\d+$/, '') === HOST;
  }

  /** Адрес по умолчанию для текущего протокола страницы. */
  function defaultHost() {
    return (typeof location !== 'undefined' && location.protocol === 'https:') ? SSL_HOST : HOST;
  }

  /** На https-странице IP-адрес прод-сервера заменяется TLS-адресом (иначе mixed content). */
  function secureHost(h) {
    if (typeof location !== 'undefined' && location.protocol === 'https:' && isPlainHost(h)) return SSL_HOST;
    return h;
  }

  /** Починка ws/wss-URL: на https — wss на TLS-адрес; схлопывание повторов «.sslip.io.sslip.io». */
  function fixWsUrl(url) {
    var u = String(url || '');
    var esc = HOST.replace(/\./g, '\\.');
    u = u.replace(new RegExp(esc + '(?:\\.sslip\\.io)+', 'g'), SSL_HOST);
    if (typeof location !== 'undefined' && location.protocol === 'https:') {
      u = u.replace(new RegExp('^wss?://' + esc + '(?::\\d+)?(?![\\w.])'), 'wss://' + SSL_HOST);
    }
    return u;
  }

  function isLocalEnv() {
    try {
      if (typeof location === 'undefined') return false;
      var hn = location.hostname || '';
      return hn === 'localhost' || hn === '127.0.0.1' || location.protocol === 'file:';
    } catch (_) { return false; }
  }

  /** Белый список доверенных хостов (защита от фишинга через ?server=evil.com) */
  function isAllowedHost(h) {
    if (!h) return false;
    var b = bare(h).toLowerCase();
    var clean = b.replace(/:\d+$/, '');
    if (clean === HOST.toLowerCase() || clean === SSL_HOST.toLowerCase()) return true;
    if (isLocalEnv() && (clean === 'localhost' || clean === '127.0.0.1')) return true;
    return false;
  }

  /** Санитизация хоста: если передан недоверенный или фишинговый хост, возврат безопасного дефолта. */
  function sanitizeHost(h) {
    if (!h) return defaultHost();
    var b = bare(h);
    if (!isAllowedHost(b)) {
      console.warn('[PS_SERVER] Отклонён недоверенный хост (anti-phishing whitelist):', b);
      return defaultHost();
    }
    var clean = b.replace(/:\d+$/, '');
    if (location.protocol === 'https:' && clean === HOST) return SSL_HOST;
    return b;
  }

  // Очистка отравленного localStorage/sessionStorage при старте
  try {
    ['localStorage', 'sessionStorage'].forEach(function (storageName) {
      var store = window[storageName];
      if (!store) return;
      var saved = store.getItem('ps_game_host');
      if (saved && !isAllowedHost(saved)) {
        store.removeItem('ps_game_host');
        console.warn('[PS_SERVER] Удален отравленный хост из ' + storageName + ':', saved);
      }
    });
  } catch (_) {}

  window.PS_SERVER = {
    host: HOST,
    sslHost: SSL_HOST,
    isPlainHost: isPlainHost,
    isLocalEnv: isLocalEnv,
    isAllowedHost: isAllowedHost,
    sanitizeHost: sanitizeHost,
    defaultHost: defaultHost,
    secureHost: secureHost,
    fixWsUrl: fixWsUrl
  };
})();
