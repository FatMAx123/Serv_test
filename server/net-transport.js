// ============================================================
//  SERVER / NET-TRANSPORT.JS
//  Универсальный сетевой транспорт MMO-сервера Project Steam: Origins.
//  Поддерживает:
//    - 'uws' — uWebSockets.js (C++ ядро I/O, нативный Pub/Sub, Zero GC, 3000-5000+ CCU)
//    - 'ws'  — стандартная библиотека ws (fallback для dev/test окружения)
// ============================================================
'use strict';

const EventEmitter = require('events');
const http = require('http');

let uWS = null;
try {
  uWS = require('uWebSockets.js');
} catch (_) {
  uWS = null;
}

/**
 * Обертка над нативным uWS WebSocket сокетом для совместимости с ws API.
 * Предоставляет нативные методы cork, pub/sub, drain и защиту от use-after-free.
 */
class UwsSocketWrapper extends EventEmitter {
  constructor(rawWs, app) {
    super();
    this.rawWs = rawWs;
    this.app = app;
    this._userData = rawWs.getUserData() || {};
    this._userData.wrapper = this;
    this._isOpen = true;
    this.isBackpressured = false;
  }

  get pid() {
    return this._userData.pid;
  }

  set pid(val) {
    this._userData.pid = val;
  }

  get isAuthed() {
    return this._userData.isAuthed;
  }

  set isAuthed(val) {
    this._userData.isAuthed = val;
  }

  get readyState() {
    return this._isOpen && this.rawWs ? 1 : 3;
  }

  get bufferedAmount() {
    if (!this._isOpen || !this.rawWs) return 0;
    try {
      return this.rawWs.getBufferedAmount() || 0;
    } catch (_) {
      return 0;
    }
  }

  get remoteAddress() {
    if (!this._isOpen || !this.rawWs) return '';
    try {
      return Buffer.from(this.rawWs.getRemoteAddressAsText()).toString('utf8');
    } catch (_) {
      return '';
    }
  }

  /**
   * Агрегация TCP-пакетов сокета (Zero-Syscall).
   * @param {Function} fn
   */
  cork(fn) {
    if (!this._isOpen || !this.rawWs || typeof fn !== 'function') return;
    try {
      this.rawWs.cork(fn);
    } catch (_) {
      try { fn(); } catch (e) {}
    }
  }

  /**
   * Отправка данных клиенту.
   * @param {string|Buffer|ArrayBuffer} data
   * @param {object} [options]
   * @param {boolean} [options.binary]
   * @param {boolean} [options.compress]
   * @returns {number} 1 = отправлено, 2 = backpressure, 0 = ошибка/закрыт
   */
  send(data, options) {
    if (!this._isOpen || !this.rawWs) return 0;
    const isBinary = (options && options.binary) || Buffer.isBuffer(data) || (data instanceof ArrayBuffer);
    const compress = !!(options && options.compress);
    try {
      const res = this.rawWs.send(data, isBinary, compress);
      if (res === 2) {
        this.isBackpressured = true;
      } else if (res === 1) {
        this.isBackpressured = false;
      }
      return res;
    } catch (_) {
      return 0;
    }
  }

  /**
   * Закрытие соединения с безопасной трансляцией RFC-кодов.
   * @param {number} [code=1000]
   * @param {string} [reason='']
   */
  close(code, reason) {
    if (!this._isOpen || !this.rawWs) return;
    this._isOpen = false;
    let c = code || 1000;
    // RFC 6455: коды 1005 и 1006 зарезервированы и запрещены в frame close
    if (c === 1005 || c === 1006) c = 4001;
    try {
      this.rawWs.end(c, String(reason || ''));
    } catch (_) {}
    this.rawWs = null;
  }

  /**
   * Мгновенный разрыв TCP-сессии без ожидания handshake.
   */
  terminate() {
    if (!this._isOpen || !this.rawWs) return;
    this._isOpen = false;
    try {
      this.rawWs.close();
    } catch (_) {}
    this.rawWs = null;
  }

  ping() {
    if (!this._isOpen || !this.rawWs) return;
    try {
      this.rawWs.ping();
    } catch (_) {}
  }

  subscribe(topic) {
    if (!this._isOpen || !this.rawWs || !topic) return;
    try {
      this.rawWs.subscribe(topic);
    } catch (_) {}
  }

  unsubscribe(topic) {
    if (!this._isOpen || !this.rawWs || !topic) return;
    try {
      this.rawWs.unsubscribe(topic);
    } catch (_) {}
  }

  isSubscribed(topic) {
    if (!this._isOpen || !this.rawWs || !topic) return false;
    try {
      return typeof this.rawWs.isSubscribed === 'function' ? this.rawWs.isSubscribed(topic) : false;
    } catch (_) {
      return false;
    }
  }

  publish(topic, data, isBinary, compress = false) {
    if (!this._isOpen || !this.rawWs || !topic) return;
    const bin = isBinary || Buffer.isBuffer(data) || (data instanceof ArrayBuffer);
    try {
      this.rawWs.publish(topic, data, bin, !!compress);
    } catch (_) {}
  }
}

/**
 * Высокопроизводительный сервер сетевого транспорта на базе uWebSockets.js.
 * Поддерживает совместную работу WebSockets (C++ Zero-GC) и HTTP (через встроенный прокси) на одном порту.
 */
class UwsServerTransport extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts || {};
    this.app = uWS.App();
    this.listenSocket = null;
    this.sockets = new Set();
    this.httpServer = this.opts.server || null;
    this.internalHttpPort = null;
    this.httpServerStarted = false;
    this._setupRoutes();
  }

  _setupRoutes() {
    const self = this;
    const verifyClient = this.opts.verifyClient;

    const isDeflate = this.opts.perMessageDeflate !== false &&
      String(process.env.WS_DEFLATE || '').trim() !== '0' &&
      String(process.env.WS_DEFLATE || '').trim() !== 'false';
    const compression = (isDeflate && uWS && uWS.SHARED_COMPRESSOR != null)
      ? uWS.SHARED_COMPRESSOR
      : (uWS && uWS.DISABLED != null ? uWS.DISABLED : 0);

    this.app.ws('/*', {
      compression: compression,
      maxPayloadLength: this.opts.maxPayload || (64 * 1024),
      idleTimeout: 0,
      upgrade: (res, req, context) => {
        const origin = req.getHeader('origin');
        const secWebSocketKey = req.getHeader('sec-websocket-key');
        const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
        const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
        const headers = {};
        req.forEach((k, v) => { headers[k] = v; });

        if (typeof verifyClient === 'function') {
          let verified = false;
          verifyClient({ origin, req: { headers } }, (ok) => {
            verified = !!ok;
          });
          if (!verified) {
            res.writeStatus('403 Forbidden').end();
            return;
          }
        }

        res.upgrade(
          { pid: null, isAuthed: false },
          secWebSocketKey,
          secWebSocketProtocol,
          secWebSocketExtensions,
          context
        );
      },
      open: (rawWs) => {
        const wrapper = new UwsSocketWrapper(rawWs, self.app);
        self.sockets.add(wrapper);
        self.emit('connection', wrapper);
      },
      message: (rawWs, message, isBinary) => {
        const userData = rawWs.getUserData();
        const wrapper = userData && userData.wrapper;
        if (!wrapper) return;
        // uWS буфер действителен только внутри колбэка — копируем в Node Buffer
        const buf = Buffer.from(message);
        wrapper.emit('message', buf, isBinary);
      },
      pong: (rawWs) => {
        const userData = rawWs.getUserData();
        const wrapper = userData && userData.wrapper;
        if (wrapper) wrapper.emit('pong');
      },
      drain: (rawWs) => {
        // Устранение NET-BACK-01: мониторинг освобождения буфера
        const userData = rawWs.getUserData();
        const wrapper = userData && userData.wrapper;
        if (wrapper) {
          wrapper.isBackpressured = false;
          wrapper.emit('drain');
        }
      },
      close: (rawWs, code, message) => {
        const userData = rawWs.getUserData();
        const wrapper = userData && userData.wrapper;
        if (wrapper) {
          wrapper._isOpen = false;
          wrapper.rawWs = null; // Защита от use-after-free в C++
          self.sockets.delete(wrapper);
          wrapper.emit('close', code, Buffer.from(message).toString('utf8'));
        }
      }
    });

    // Маршрутизация входящих HTTP-запросов
    this.app.any('/*', (res, req) => {
      // 1. Внешний обработчик (если задан)
      if (typeof self.opts.onHttpRequest === 'function') {
        const handled = self.opts.onHttpRequest(res, req);
        if (handled) return;
      }

      // 2. Если есть привязанный Node.js httpServer — прозрачно проксируем через loopback
      if (self.httpServer && self.internalHttpPort) {
        self._proxyHttpRequest(res, req);
        return;
      }

      // 3. Быстрый ответ по умолчанию
      res.writeStatus('200 OK')
         .writeHeader('Content-Type', 'text/plain; charset=utf-8')
         .end('Project Steam MMO (uWebSockets.js C++ Engine)');
    });
  }

  /**
   * Высокоскоростной потоковый HTTP-прокси в локальный экземпляр http.Server.
   */
  _proxyHttpRequest(res, req) {
    const method = req.getMethod().toUpperCase();
    const url = req.getUrl();
    const query = req.getQuery();
    const headers = {};
    req.forEach((k, v) => { headers[k] = v; });

    let aborted = false;
    res.onAborted(() => {
      aborted = true;
      if (proxyReq) {
        try { proxyReq.destroy(); } catch (_) {}
      }
    });

    let proxyReq = null;
    const bodyChunks = [];

    res.onData((chunk, isLast) => {
      if (chunk.byteLength > 0) {
        bodyChunks.push(Buffer.from(chunk));
      }
      if (isLast) {
        if (aborted) return;
        const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;
        if (body && !headers['content-length']) {
          headers['content-length'] = String(body.length);
        }

        try {
          proxyReq = http.request({
            host: '127.0.0.1',
            port: this.internalHttpPort,
            path: query ? `${url}?${query}` : url,
            method: method,
            headers: headers
          }, (proxyRes) => {
            if (aborted) return;
            res.cork(() => {
              res.writeStatus(`${proxyRes.statusCode} ${proxyRes.statusMessage || 'OK'}`);
              for (const [k, v] of Object.entries(proxyRes.headers)) {
                const lk = k.toLowerCase();
                if (lk === 'transfer-encoding' || lk === 'connection' || lk === 'keep-alive' || lk === 'upgrade') {
                  continue;
                }
                if (Array.isArray(v)) {
                  for (const val of v) res.writeHeader(k, String(val));
                } else if (v != null) {
                  res.writeHeader(k, String(v));
                }
              }
              proxyRes.on('data', (d) => {
                if (aborted) return;
                res.cork(() => res.write(d));
              });
              proxyRes.on('end', () => {
                if (aborted) return;
                res.cork(() => res.end());
              });
            });
          });

          proxyReq.on('error', (err) => {
            if (aborted) return;
            res.cork(() => {
              const origin = headers.origin;
              if (origin) {
                res.writeHeader('Access-Control-Allow-Origin', origin);
                res.writeHeader('Vary', 'Origin');
              }
              res.writeStatus('502 Bad Gateway')
                 .writeHeader('Content-Type', 'text/plain; charset=utf-8')
                 .end('Proxy error: ' + (err && err.message));
            });
          });

          if (body && body.length > 0) {
            proxyReq.write(body);
          }
          proxyReq.end();
        } catch (err) {
          if (!aborted) {
            res.cork(() => {
              res.writeStatus('500 Internal Server Error').end(err && err.message);
            });
          }
        }
      }
    });
  }

  get clients() {
    return this.sockets;
  }

  /**
   * Нативный C++ Pub/Sub на уровне ядра ОС.
   * @param {string} topic
   * @param {string|Buffer|ArrayBuffer} data
   * @param {boolean} [isBinary=false]
   * @param {boolean} [compress=false]
   */
  publish(topic, data, isBinary, compress = false) {
    if (!this.app || !topic) return;
    const bin = isBinary || Buffer.isBuffer(data) || (data instanceof ArrayBuffer);
    try {
      this.app.publish(topic, data, bin, !!compress);
    } catch (_) {}
  }

  /**
   * Агрегация сетевых пакетов на уровне всего сервера (Zero-Syscall).
   * @param {Function} fn
   */
  cork(fn) {
    if (this.app && typeof this.app.cork === 'function' && typeof fn === 'function') {
      try {
        this.app.cork(fn);
      } catch (_) {
        try { fn(); } catch (e) {}
      }
    } else if (typeof fn === 'function') {
      fn();
    }
  }

  /**
   * Получение числа активных подписчиков топика.
   * @param {string} topic
   * @returns {number}
   */
  numSubscribers(topic) {
    if (!this.app || !topic || typeof this.app.numSubscribers !== 'function') return 0;
    try {
      return this.app.numSubscribers(topic);
    } catch (_) {
      return 0;
    }
  }

  /**
   * Запуск сервера uWebSockets.js (и внутреннего http.Server при наличии).
   * @param {number} port
   * @param {string} [host='0.0.0.0']
   * @param {Function} [cb]
   */
  listen(port, host, cb) {
    if (typeof host === 'function') {
      cb = host;
      host = '0.0.0.0';
    }
    const self = this;
    const h = host || '0.0.0.0';

    if (this.httpServer && !this.httpServerStarted) {
      this.httpServer.listen(0, '127.0.0.1', () => {
        self.httpServerStarted = true;
        self.internalHttpPort = self.httpServer.address().port;
        self._startUwsListen(port, h, cb);
      });
      return;
    }

    this._startUwsListen(port, h, cb);
  }

  _startUwsListen(port, host, cb) {
    const self = this;
    this.app.listen(host, port, (token) => {
      if (token) {
        self.listenSocket = token;
        if (cb) cb(null);
      } else {
        const err = new Error('uWS failed to listen on ' + host + ':' + port);
        if (cb) cb(err);
        else self.emit('error', err);
      }
    });
  }

  close(cb) {
    if (this.listenSocket) {
      try {
        uWS.us_listen_socket_close(this.listenSocket);
      } catch (_) {}
      this.listenSocket = null;
    }
    for (const s of this.sockets) {
      try { s.terminate(); } catch (_) {}
    }
    this.sockets.clear();

    if (this.httpServer && this.httpServerStarted) {
      try {
        this.httpServer.close(() => {
          if (cb) cb();
        });
        return;
      } catch (_) {}
    }

    if (cb) cb();
  }
}

/**
 * Валидация готовности сетевого транспорта к production нагрузке (3000+ CCU, Zero-GC).
 * @param {object} [opts]
 * @param {boolean} [opts.strict] - принудительно выбрасывать ошибку если uWS недоступен
 * @param {string} [opts.engine] - запрошенный движок ('uws' | 'ws')
 * @returns {{ ok: boolean, engine: string, message: string }}
 */
function assertProductionTransport(opts = {}) {
  const isProd = (process.env.NODE_ENV === 'production');
  const strict = opts.strict !== undefined ? !!opts.strict : (process.env.STRICT_UWS === '1' || (isProd && process.env.STRICT_UWS !== '0'));
  const requestedEngine = (opts.engine || process.env.NET_ENGINE || (strict || uWS ? 'uws' : 'ws')).toLowerCase();

  if (requestedEngine === 'uws') {
    if (!uWS) {
      const msg = 'uWebSockets.js native C++ binary is not available in current environment. ' +
        'In production (or with STRICT_UWS=1), native uWebSockets.js is strictly required for Zero-GC and 3000+ CCU. ' +
        'Ensure uWebSockets.js is installed ("npm install github:uNetworking/uWebSockets.js#v20.70.0") and built for this Node.js/platform. ' +
        'Set NET_ENGINE=ws and STRICT_UWS=0 to bypass this check (NOT recommended for production).';
      if (strict) {
        const err = new Error('[NET_TRANSPORT_FATAL] ' + msg);
        err.code = 'ERR_UWS_NOT_AVAILABLE';
        throw err;
      }
      return { ok: false, engine: 'ws', message: msg };
    }
    return { ok: true, engine: 'uws', message: 'uWebSockets.js C++ Zero-GC transport ready' };
  }

  if (strict) {
    const msg = 'Engine "ws" requested while STRICT_UWS=1 or NODE_ENV=production. ' +
      'Native uWebSockets.js is strictly required for production MMO scale.';
    const err = new Error('[NET_TRANSPORT_FATAL] ' + msg);
    err.code = 'ERR_UWS_REQUIRED';
    throw err;
  }

  return { ok: true, engine: 'ws', message: 'Standard ws fallback active' };
}

/**
 * Фабрика транспорта: создаёт высокопроизводительный uWS транспорт или стандартный ws транспорт.
 * @param {object} opts
 * @returns {object} { type, server, listen, close, publish, cork }
 */
function createNetworkTransport(opts) {
  opts = opts || {};
  const isProd = (process.env.NODE_ENV === 'production');
  const strictUws = (process.env.STRICT_UWS === '1' || (isProd && process.env.STRICT_UWS !== '0'));

  let requestedEngine = (process.env.NET_ENGINE || opts.engine);
  if (!requestedEngine) {
    // При наличии скомпилированного uWebSockets.js автоматически используем его
    if (strictUws || uWS) {
      requestedEngine = 'uws';
    } else {
      requestedEngine = 'ws';
    }
  }
  const engine = requestedEngine.toLowerCase();

  if (engine === 'uws') {
    if (!uWS) {
      const errDetail = 'uWebSockets.js native binary is not available. ' +
        'In production (or with STRICT_UWS=1), native uWebSockets.js is strictly required for Zero-GC and 3000+ CCU. ' +
        'Ensure uWebSockets.js is installed ("npm install github:uNetworking/uWebSockets.js#v20.70.0") and built for this platform/Node version. ' +
        'Set NET_ENGINE=ws and STRICT_UWS=0 to bypass this check (NOT recommended for production).';
      if (strictUws) {
        const err = new Error('[NET_TRANSPORT_FATAL] ' + errDetail);
        err.code = 'ERR_UWS_NOT_AVAILABLE';
        throw err;
      } else {
        console.warn('[NET_TRANSPORT_WARN] ' + errDetail + ' Falling back to "ws" (high GC overhead).');
      }
    } else {
      const serverTransport = new UwsServerTransport(opts);
      return {
        type: 'uws',
        server: serverTransport,
        listen: (port, host, cb) => serverTransport.listen(port, host, cb),
        close: (cb) => serverTransport.close(cb),
        publish: (topic, data, isBinary, compress) => serverTransport.publish(topic, data, isBinary, compress),
        cork: (fn) => serverTransport.cork(fn)
      };
    }
  }

  // Fallback: стандартный WebSocketServer из 'ws'
  const { WebSocketServer } = require('ws');
  const wss = new WebSocketServer({
    server: opts.server,
    verifyClient: opts.verifyClient,
    maxPayload: opts.maxPayload,
    perMessageDeflate: opts.perMessageDeflate
  });

  // Эмуляция pub/sub для совместимости API
  const topics = new Map();
  wss.on('connection', (ws) => {
    ws.subscribe = (topic) => {
      let set = topics.get(topic);
      if (!set) { set = new Set(); topics.set(topic, set); }
      set.add(ws);
    };
    ws.unsubscribe = (topic) => {
      const set = topics.get(topic);
      if (set) set.delete(ws);
    };
    ws.isSubscribed = (topic) => {
      const set = topics.get(topic);
      return set ? set.has(ws) : false;
    };
    ws.cork = (fn) => {
      if (typeof fn === 'function') fn();
    };
    ws.on('close', () => {
      for (const [, set] of topics) set.delete(ws);
    });
  });

  wss.publish = (topic, data, isBinary) => {
    const set = topics.get(topic);
    if (!set || !set.size) return;
    for (const ws of set) {
      if (ws.readyState === 1) {
        ws.send(data, { binary: !!isBinary });
      }
    }
  };

  return {
    type: 'ws',
    server: wss,
    listen: (port, host, cb) => {
      if (typeof host === 'function') { cb = host; host = '0.0.0.0'; }
      if (opts.server && typeof opts.server.listen === 'function') {
        opts.server.listen(port, host || '0.0.0.0', 8192, cb);
      } else if (cb) {
        cb(null);
      }
    },
    close: (cb) => {
      try { wss.close(); } catch (_) {}
      if (opts.server && typeof opts.server.close === 'function') {
        opts.server.close(cb);
      } else if (cb) {
        cb();
      }
    },
    publish: (topic, data, isBinary) => wss.publish(topic, data, isBinary),
    cork: (fn) => { if (typeof fn === 'function') fn(); }
  };
}

module.exports = {
  hasUws: !!uWS,
  assertProductionTransport: assertProductionTransport,
  createNetworkTransport: createNetworkTransport,
  UwsSocketWrapper: UwsSocketWrapper,
  UwsServerTransport: UwsServerTransport
};

