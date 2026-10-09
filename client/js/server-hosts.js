// ============================================================
//  CLIENT / JS / SERVER-HOSTS.JS — ЕДИНСТВЕННОЕ место с адресом игрового сервера.
//  Сменить сервер/домен = поменять HOST и SSL_HOST здесь (и CORS_ORIGINS на сервере).
//  Подключается первым классическим скриптом на страницах (menu/game/character-select)
//  и первым в boot.module.js. Остальные модули берут адрес из window.PS_SERVER.
// ============================================================
(function () {
  'use strict';
  if (window.PS_SERVER) return;
  var HOST = '93.77.168.135';            // VPS (http / ws)
  var SSL_HOST = '93.77.168.135.sslip.io'; // тот же сервер с TLS (https / wss)

  function bare(h) {
    return String(h || '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  }
  /** Хост — это прод-сервер по IP (с портом или без)? */
  function isPlainHost(h) {
    return bare(h).replace(/:\d+$/, '') === HOST;
  }
  /** Адрес по умолчанию для текущего протокола страницы. */
  function defaultHost() {
    return location.protocol === 'https:' ? SSL_HOST : HOST;
  }
  /** На https-странице IP-адрес прод-сервера заменяется TLS-адресом (иначе mixed content). */
  function secureHost(h) {
    if (location.protocol === 'https:' && isPlainHost(h)) return SSL_HOST;
    return h;
  }
  /** Починка ws/wss-URL: на https — wss на TLS-адрес; схлопывание повторов «.sslip.io.sslip.io». */
  function fixWsUrl(url) {
    var u = String(url || '');
    var esc = HOST.replace(/\./g, '\\.');
    u = u.replace(new RegExp(esc + '(?:\\.sslip\\.io)+', 'g'), SSL_HOST);
    if (location.protocol === 'https:') {
      u = u.replace(new RegExp('^wss?://' + esc + '(?::\\d+)?(?![\\w.])'), 'wss://' + SSL_HOST);
    }
    return u;
  }

  window.PS_SERVER = {
    host: HOST,
    sslHost: SSL_HOST,
    isPlainHost: isPlainHost,
    defaultHost: defaultHost,
    secureHost: secureHost,
    fixWsUrl: fixWsUrl
  };
})();
