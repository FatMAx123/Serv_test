// ============================================================
//  SERVER / CLUSTER-MANAGER.JS
//  Менеджер многоядерного кластера MMO-сервера + Master Gateway.
//  Задействует все ядра CPU VDS:
//    - Primary (Master Gateway): единая точка входа TCP/HTTP/WS на PORT (8080).
//      Терминирует клиентские WebSocket-соединения, маршрутизирует
//      сетевые фреймы в целевые Zone Workers без закрытия сокета при Handoff,
//      агрегирует метрики (/healthz, /metrics), ретранслирует глобальный чат
//      и следит за здоровьем рабочих процессов.
//    - Workers: независимые процессы пространственного шардинга (Zone Workers),
//      каждый из которых симулирует свою географическую зону острова и споты.
// ============================================================
'use strict';

const cluster = require('cluster');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const url = require('url');
const WebSocket = require('ws');
const {
  IpcHub,
  MSG_CLIENT_RAW,
  MSG_GATEWAY_SEND,
  MSG_GATEWAY_SEND_BATCH,
  MSG_GATEWAY_CLOSE,
  MSG_CLIENT_DISCONNECT,
  MSG_SESSION_RESTORE
} = require('./ipc-hub.js');
const DB = require('./db.js');
const PlayerDb = require('./player-db.js');
const AccountKeys = require('./account-keys.js');
const Mod = require('./moderation.js');
const Clans = require('./clans-store.js');
const CH = require('../shared/char-rules.js');
const createHttpRouter = require('./http/admin-api.js');

const args = process.argv.slice(2);
function getArg(name, def) {
  for (const a of args) {
    if (a.startsWith(`--${name}=`)) return a.split('=')[1];
  }
  return def;
}

const TOTAL_CPUS = os.cpus() ? os.cpus().length : 4;
const DEFAULT_WORKERS = Math.max(1, Math.min(4, TOTAL_CPUS));
const WORKER_COUNT = parseInt(getArg('workers', process.env.CLUSTER_WORKERS || String(DEFAULT_WORKERS)), 10);
const PORT = +process.env.PORT || +getArg('port', 8080) || 8080;
const REPO_ROOT = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.txt': 'text/plain; charset=utf-8'
};

class MasterGateway {
  constructor(opts) {
    const self = this;
    this.opts = opts || {};
    this.port = this.opts.port || PORT;
    this.workerCount = this.opts.workerCount || WORKER_COUNT;
    this.ipcHub = this.opts.ipcHub || new IpcHub({ isPrimary: true });

    this.workerByIndex = new Map(); // workerIndex (1..N) -> workerProcess
    this.workerMap = new Map();     // cluster worker.id -> { worker, index }
    this.socketsByConnId = new Map(); // connId -> ws
    this.connIdBySocket = new Map();  // ws -> connId
    this.workerIdByConnId = new Map();// connId -> workerIndex
    this.workerIdByPid = new Map();   // pid -> workerIndex
    this.connIdByPid = new Map();     // pid -> connId
    this.pidByConnId = new Map();     // connId -> pid
    this.connIdByYid = new Map();     // yid -> connId
    this.yidByConnId = new Map();     // connId -> yid
    this.charIdByConnId = new Map();  // connId -> charId
    this.restartingWorkerBuffers = new Map(); // workerIndex -> { timer, connIds: Set, packetBuffer: Map<connId, Array> }
    this.restartGraceMs = this.opts.restartGraceMs != null ? this.opts.restartGraceMs : 2000;

    this.nextConnId = 1;
    this.httpServer = null;
    this.wss = null;

    const CLIENT_DIR = path.join(REPO_ROOT, 'client');
    const SHARED_DIR = path.join(REPO_ROOT, 'shared');
    const YANDEX_SECRET = process.env.YANDEX_APP_SECRET || '';
    const EDITOR_ENABLED = process.env.NODE_ENV !== 'production' && ((process.env.EDITOR_ENABLED || '0') === '1');

    try {
      if (typeof Clans.loadAll === 'function') Clans.loadAll();
      this.httpRouter = createHttpRouter({
        getLastTickAt: () => self.ipcHub.aggregatedMetrics.lastTickAt || Date.now(),
        metricsPayload: () => self.ipcHub.aggregatedMetrics,
        worldTimePayload: () => ({ hour: 12 }),
        buildLeaderboard: (limit) => {
          limit = limit || 20;
          const all = typeof PlayerDb.list === 'function' ? PlayerDb.list() : [];
          return all
            .map(r => ({
              name: r.name,
              level: r.level || 1,
              score: (Number(r.level) || 1) * 1000 + (Number(r.exp) || 0),
              online: !!r.online
            }))
            .sort((a, b) => b.score - a.score || b.level - a.level || String(a.name).localeCompare(String(b.name)))
            .slice(0, limit);
        },
        players: new Map(),
        pidByYid: new Map(),
        wsByPid: new Map(),
        loggingIn: new Set(),
        lbTouch: (yid, pr, charId) => { if (typeof PlayerDb.touch === 'function') PlayerDb.touch(pr, yid, charId); },
        lbDrop: (yid, charId) => { if (typeof PlayerDb.removeChar === 'function') PlayerDb.removeChar(yid, charId); },
        clanLeaveOnCharDelete: (yid, charId) => {
          try {
            const c = Clans.ofKey(yid, charId);
            if (!c) return { ok: true };
            const me = Clans.memberOf(c, yid, charId);
            if (!me) return { ok: true };
            if (me.rank === 'leader' && c.members.length > 1) {
              return { ok: false, reason: 'clan_leader' };
            }
            if (me.rank === 'leader') {
              const members = c.members.slice();
              Clans.remove(c);
              for (const m of members) Clans.reindexMember(m.yid, m.charId, null);
              return { ok: true };
            }
            const wantC = CH.normalizeCharId(charId);
            const idx = c.members.findIndex((m) => m.yid === String(yid) && CH.normalizeCharId(m.charId) === wantC);
            if (idx >= 0) {
              c.members.splice(idx, 1);
            }
            Clans.reindexMember(yid, charId, null);
            Clans.save(c);
            return { ok: true };
          } catch (err) {
            console.error('[Cluster Gateway] clanLeaveOnCharDelete error:', err && err.message);
            return { ok: true };
          }
        },
        send: (p, msg) => {
          if (!p || !p.pid) return;
          const connId = self.connIdByPid.get(p.pid);
          const ws = connId != null ? self.socketsByConnId.get(connId) : null;
          if (ws && ws.readyState === WebSocket.OPEN) {
            try { ws.send(JSON.stringify(msg)); } catch (_) {}
          }
        },
        detachPlayer: (pid) => {
          const connId = self.connIdByPid.get(pid);
          if (connId != null) {
            const ws = self.socketsByConnId.get(connId);
            if (ws) {
              try { ws.close(4011, 'detached'); } catch (_) {}
            }
          }
        },
        kickYid: (yid, code, why) => {
          return self.kickYid(yid, code, why);
        },
        isGM: () => false,
        rebuildServerSpots: () => {},
        sanitizeCharName: (name) => {
          if (typeof name !== 'string') return null;
          let s = name.replace(/[\u0000-\u001f\u007f-\u009f\u00a0\u2000-\u200f\u2028-\u202f\u3000]/g, ' ');
          s = s.replace(/\s+/g, ' ').trim().slice(0, 16);
          if (s.length < 2) return null;
          return /^[\w\u0400-\u04FF\- ]+$/.test(s) ? s : null;
        },
        isBadKey: (k) => !k || k === '__proto__' || k === 'constructor' || k === 'prototype',
        YANDEX_SECRET,
        EDITOR_ENABLED,
        CLIENT_DIR,
        SHARED_DIR
      });
    } catch (e) {
      console.error('[Cluster Gateway] Failed to create httpRouter:', e);
      this.httpRouter = null;
    }

    this._setupIpcListeners();
  }

  _setupIpcListeners() {
    const self = this;

    // 1. Отправка фрейма от воркера к клиенту
    this.ipcHub.on('gateway_send', (payload) => {
      if (!payload) return;
      const { connId, data, isBinary, pid, yid, charId } = payload;
      if (pid != null && connId != null && !self.connIdByPid.has(pid)) {
        self.connIdByPid.set(pid, connId);
        self.pidByConnId.set(connId, pid);
      }
      if (yid != null && connId != null && !self.connIdByYid.has(String(yid))) {
        const strYid = String(yid);
        self.connIdByYid.set(strYid, connId);
        self.yidByConnId.set(connId, strYid);
        const ws = self.socketsByConnId.get(connId);
        if (ws) ws.yid = strYid;
      }
      if (charId != null && connId != null && !self.charIdByConnId.has(connId)) {
        self.charIdByConnId.set(connId, String(charId));
      }
      const targetConnId = connId != null ? connId : (pid != null ? self.connIdByPid.get(pid) : null);
      const ws = self.socketsByConnId.get(targetConnId);
      if (ws && ws.readyState === WebSocket.OPEN && data != null && data !== '') {
        const outData = isBinary && !Buffer.isBuffer(data) ? Buffer.from(data) : data;
        try {
          ws.send(outData, { binary: !!isBinary });
        } catch (_) {}
      }
    });

    // 1b. Батчинг отправки фреймов от воркера к клиенту
    this.ipcHub.on('gateway_send_batch', (batch) => {
      const items = Array.isArray(batch) ? batch : (batch && Array.isArray(batch.items) ? batch.items : null);
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        const { connId, data, isBinary, pid, yid, charId } = item;
        if (pid != null && connId != null && !self.connIdByPid.has(pid)) {
          self.connIdByPid.set(pid, connId);
          self.pidByConnId.set(connId, pid);
        }
        if (yid != null && connId != null && !self.connIdByYid.has(String(yid))) {
          const strYid = String(yid);
          self.connIdByYid.set(strYid, connId);
          self.yidByConnId.set(connId, strYid);
          const ws = self.socketsByConnId.get(connId);
          if (ws) ws.yid = strYid;
        }
        if (charId != null && connId != null && !self.charIdByConnId.has(connId)) {
          self.charIdByConnId.set(connId, String(charId));
        }
        const targetConnId = connId != null ? connId : (pid != null ? self.connIdByPid.get(pid) : null);
        const ws = self.socketsByConnId.get(targetConnId);
        if (ws && ws.readyState === WebSocket.OPEN && data != null && data !== '') {
          // Защита от переполнения сокета (backpressure) в шлюзе
          if (ws.bufferedAmount > 98304) {
            // Если буфер сокета > 96 КБ, отбрасываем второстепенные пакеты
            if (typeof data === 'string' && (data.includes('"t":"dmg"') || data.includes('"t":"skill_fx"') || data.includes('"t":"cosmetic"'))) {
              continue;
            }
          }
          const outData = isBinary && !Buffer.isBuffer(data) ? Buffer.from(data) : data;
          try {
            ws.send(outData, { binary: !!isBinary });
          } catch (_) {}
        }
      }
    });

    // 2. Закрытие клиентского сокета по требованию воркера
    this.ipcHub.on('gateway_close', (payload) => {
      if (!payload) return;
      const { connId, code, reason } = payload;
      const ws = self.socketsByConnId.get(connId);
      if (ws) {
        let closeCode = code || 1000;
        if (closeCode === 1005 || closeCode === 1006) closeCode = 4001;
        try {
          ws.close(closeCode, reason || '');
        } catch (_) {}
      }
    });

    // 3. Маршрутизация Handoff (игрок перешёл границу зоны)
    this.ipcHub.on('handoff_route', (payload) => {
      if (!payload) return;
      const { connId, pid, targetWorkerId, charId } = payload;
      if (connId != null) {
        self.workerIdByConnId.set(connId, targetWorkerId);
      }
      if (pid != null) {
        self.workerIdByPid.set(pid, targetWorkerId);
        if (connId != null) {
          self.connIdByPid.set(pid, connId);
          self.pidByConnId.set(connId, pid);
        }
      }
      if (charId != null && connId != null) {
        self.charIdByConnId.set(connId, String(charId));
      }
    });

    // 4. Синхронизация реестра игроков и привязка yid -> connId
    this.ipcHub.on('player_update', (payload) => {
      if (!payload) return;
      const { yid, pid, connId: directConnId, online, charId } = payload;
      if (yid != null) {
        const strYid = String(yid);
        const connId = directConnId != null ? directConnId : (pid != null ? self.connIdByPid.get(pid) : null);
        if (connId != null) {
          self.connIdByYid.set(strYid, connId);
          self.yidByConnId.set(connId, strYid);
          if (pid != null) {
            self.connIdByPid.set(pid, connId);
            self.pidByConnId.set(connId, pid);
          }
          if (charId != null) {
            self.charIdByConnId.set(connId, String(charId));
          }
          const ws = self.socketsByConnId.get(connId);
          if (ws) ws.yid = strYid;
        }
        if (online === false) {
          self.connIdByYid.delete(strYid);
        }
        if (typeof PlayerDb.setOnline === 'function') {
          PlayerDb.setOnline(strYid, null, !!online);
        }
      }
    });
  }

  registerWorker(worker, index) {
    this.workerMap.set(worker.id, { worker, index });
    this.workerByIndex.set(index, worker);

    worker.on('error', (err) => {
      if (err && err.code === 'ERR_IPC_CHANNEL_CLOSED') return;
      console.warn(`[Cluster Gateway] Worker #${index} error:`, err && err.message);
    });

    this.ipcHub.registerWorker(index, worker);

    // Проверяем, был ли воркер в буфере перезапуска
    const buf = this.restartingWorkerBuffers.get(index);
    if (buf) {
      if (buf.timer) clearTimeout(buf.timer);
      this.restartingWorkerBuffers.delete(index);

      const sessionsToRestore = [];
      for (const connId of buf.connIds) {
        const ws = this.socketsByConnId.get(connId);
        if (!ws || ws.readyState !== WebSocket.OPEN) continue;
        const yid = this.yidByConnId.get(connId);
        const pid = this.pidByConnId.get(connId);
        const charId = this.charIdByConnId.get(connId);
        if (yid != null) {
          sessionsToRestore.push({ connId, yid, pid, charId });
        }
      }

      if (sessionsToRestore.length > 0) {
        console.log(`[Cluster Gateway] 🔄 Восстановление ${sessionsToRestore.length} сессий для перезапущенного Воркера #${index}...`);
        try {
          if (typeof worker.isConnected !== 'function' || worker.isConnected()) {
            worker.send({
              ipcType: MSG_SESSION_RESTORE,
              payload: { sessions: sessionsToRestore }
            }, () => {});
          }
        } catch (e) {
          console.error('[Cluster Gateway] Ошибка отправки MSG_SESSION_RESTORE:', e && e.message);
        }
      }

      // Сброс буферизованных пакетов клиентов
      if (buf.packetBuffer && buf.packetBuffer.size > 0) {
        for (const [connId, queue] of buf.packetBuffer) {
          const ws = this.socketsByConnId.get(connId);
          if (!ws || ws.readyState !== WebSocket.OPEN) continue;
          for (const pkt of queue) {
            try {
              if (typeof worker.isConnected !== 'function' || worker.isConnected()) {
                worker.send({
                  ipcType: MSG_CLIENT_RAW,
                  payload: pkt
                }, () => {});
              }
            } catch (_) {}
          }
        }
      }
    }
  }

  handleWorkerExit(worker, code, signal) {
    const info = this.workerMap.get(worker.id);
    const workerIndex = info ? info.index : '?';
    this.workerMap.delete(worker.id);
    if (info) this.workerByIndex.delete(info.index);

    const workerPid = worker && worker.process ? worker.process.pid : (worker && worker.pid ? worker.pid : '?');
    console.warn(`[Cluster Gateway] ⚠️ Воркер #${workerIndex} (PID: ${workerPid}) завершился [code: ${code}, signal: ${signal}]`);

    // Собираем сокеты, привязанные к упавшему воркеру
    const affectedConnIds = new Set();
    for (const [connId, wIdx] of this.workerIdByConnId) {
      if (wIdx === workerIndex) {
        affectedConnIds.add(connId);
      }
    }

    // Если это внезапный сбой (code !== 0) и включен буфер удержания сокетов
    if (code !== 0 && this.restartGraceMs > 0 && affectedConnIds.size > 0) {
      console.log(`[Cluster Gateway] 🛡️ Активирован буфер удержания сокетов (${this.restartGraceMs}мс) для ${affectedConnIds.size} соединений Воркера #${workerIndex}`);

      const buf = {
        connIds: affectedConnIds,
        packetBuffer: new Map(),
        timer: null
      };

      buf.timer = setTimeout(() => {
        console.warn(`[Cluster Gateway] ⏱️ Время ожидания рестарта Воркера #${workerIndex} (${this.restartGraceMs}мс) истекло. Сброс сокетов...`);
        for (const connId of buf.connIds) {
          const ws = this.socketsByConnId.get(connId);
          if (ws) {
            try { ws.close(1012, 'Zone worker restart timeout'); } catch (_) {}
          }
          this.workerIdByConnId.delete(connId);
          this.charIdByConnId.delete(connId);
          this.pidByConnId.delete(connId);
        }
        this.restartingWorkerBuffers.delete(workerIndex);
      }, this.restartGraceMs);

      this.restartingWorkerBuffers.set(workerIndex, buf);
    } else {
      // Штатное завершение (code === 0) или буфер отключен: немедленный сброс
      for (const connId of affectedConnIds) {
        const ws = this.socketsByConnId.get(connId);
        if (ws) {
          try { ws.close(1012, 'Zone worker restart'); } catch (_) {}
        }
        this.workerIdByConnId.delete(connId);
        this.charIdByConnId.delete(connId);
        this.pidByConnId.delete(connId);
      }
    }

    return workerIndex;
  }

  serveStatic(req, res) {
    try {
      const parsed = url.parse(req.url);
      let rawPath = decodeURIComponent(parsed.pathname || '/');
      if (rawPath === '/' || rawPath === '') rawPath = '/index.html';

      // Нормализуем путь относительно слэшей
      let normPath = path.normalize(rawPath).replace(/^[\/\\]+/, '');

      // Защита от утечки исходного кода и конфигов сервера:
      // Строго блокируем системные и серверные каталоги
      const lower = normPath.toLowerCase();
      if (
        lower.startsWith('server') ||
        lower.startsWith('tests') ||
        lower.startsWith('audits') ||
        lower.startsWith('scripts') ||
        lower.startsWith('.git') ||
        lower.startsWith('.env') ||
        lower.startsWith('package.json') ||
        lower.startsWith('package-lock.json')
      ) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      const CLIENT_ROOT = path.normalize(path.join(REPO_ROOT, 'client'));
      const SHARED_ROOT = path.normalize(path.join(REPO_ROOT, 'shared'));
      const DATA_ROOT = path.normalize(path.join(REPO_ROOT, 'data'));

      let targetPath = null;

      if (normPath.startsWith('shared' + path.sep) || normPath === 'shared') {
        const rel = normPath.slice(6).replace(/^[\/\\]+/, '');
        targetPath = path.normalize(path.join(SHARED_ROOT, rel));
        if (!targetPath.startsWith(SHARED_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      } else if (normPath.startsWith('client' + path.sep) || normPath === 'client') {
        const rel = normPath.slice(6).replace(/^[\/\\]+/, '');
        targetPath = path.normalize(path.join(CLIENT_ROOT, rel));
        if (!targetPath.startsWith(CLIENT_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      } else if (normPath.startsWith('data' + path.sep) || normPath === 'data') {
        // В data/ разрешены строго terrain-paint-*.png
        const rel = normPath.slice(4).replace(/^[\/\\]+/, '');
        if (/^terrain-paint-[a-zA-Z0-9_\-]+\.png$/i.test(rel)) {
          targetPath = path.normalize(path.join(DATA_ROOT, rel));
          if (!targetPath.startsWith(DATA_ROOT)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
          }
        } else {
          // Запрещено читать любые другие файлы из data (профили игроков, account_keys.json и т.д.)
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      } else {
        // По умолчанию ищем в client/
        targetPath = path.normalize(path.join(CLIENT_ROOT, normPath));
        if (!targetPath.startsWith(CLIENT_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      }

      fs.stat(targetPath, (err, stats) => {
        if (err || !stats.isFile()) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        const ext = path.extname(targetPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stats.size,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        fs.createReadStream(targetPath).pipe(res);
      });
    } catch (_) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error');
    }
  }

  start(onListening) {
    const self = this;

    this.httpServer = http.createServer((req, res) => {
      // 1. Healthcheck эндпоинт
      if (req.url === '/healthz') {
        const m = self.ipcHub.aggregatedMetrics;
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          status: 'ok',
          mode: 'cluster_gateway',
          workers: self.workerCount,
          activeWorkers: self.workerByIndex.size,
          players: m.players,
          mobs: m.mobs,
          tickMsAvg: m.tickMsAvg,
          bytesOut: m.bytesOut,
          packetsOut: m.packetsOut
        }));
        return;
      }

      // 2. Метрики (Prometheus text по умолчанию, JSON при format=json или Accept: application/json)
      if (req.url === '/metrics' || (req.url && req.url.startsWith('/metrics?'))) {
        const m = self.ipcHub.aggregatedMetrics;
        const wantJson = (req.headers && req.headers.accept && req.headers.accept.includes('application/json')) ||
                         (req.url && req.url.includes('format=json'));
        if (wantJson) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({
            ok: true,
            mode: 'cluster_gateway',
            players: m.players,
            online: m.players,
            mobs: m.mobs,
            tickMs: m.tickMsAvg,
            tickMsEma: Math.round(m.tickMsAvg * 100) / 100,
            tickMsAvg: m.tickMsAvg,
            bytesOut: m.bytesOut,
            bytesIn: m.bytesIn || 0,
            packetsOut: m.packetsOut,
            packetsIn: m.packetsIn || 0,
            updSent: m.updSent || 0,
            updSkip: m.updSkip || 0
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end([
          '# HELP mmo_cluster_workers Number of configured cluster workers',
          '# TYPE mmo_cluster_workers gauge',
          `mmo_cluster_workers ${self.workerCount}`,
          '# HELP mmo_online_players Number of online players across cluster',
          '# TYPE mmo_online_players gauge',
          `mmo_online_players ${m.players}`,
          '# HELP mmo_active_mobs Number of active mobs across cluster',
          '# TYPE mmo_active_mobs gauge',
          `mmo_active_mobs ${m.mobs}`,
          '# HELP mmo_avg_tick_ms Average tick duration in ms across workers',
          '# TYPE mmo_avg_tick_ms gauge',
          `mmo_avg_tick_ms ${m.tickMsAvg.toFixed(2)}`
        ].join('\n') + '\n');
        return;
      }

      // 3. Маршрутизация HTTP API (/api/chars, /api/auth, /api/leaderboard и др.)
      if (self.httpRouter && self.httpRouter.handleRequest(req, res)) {
        return;
      }

      // 4. Раздача статики клиента
      self.serveStatic(req, res);
    });

    function verifyWsClient(info, cb) {
      const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
      if (!origin || origin === 'null' || origin === 'undefined') return cb(true);
      try {
        const u = new URL(origin);
        const host = u.hostname.toLowerCase();
        const reqHeaders = (info.req && info.req.headers) || {};
        const reqHost = String(reqHeaders.host || reqHeaders['x-forwarded-host'] || '').split(':')[0].toLowerCase();
        if (reqHost && host === reqHost) return cb(true);
        if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '93.77.168.135') return cb(true);
        if (host === 'yandex.ru' || host.endsWith('.yandex.ru') ||
            host === 'yandex.net' || host.endsWith('.yandex.net') ||
            host === 'yandex.com' || host.endsWith('.yandex.com') ||
            host === 'yandex.kz' || host.endsWith('.yandex.kz') ||
            host === 'yandex.by' || host.endsWith('.yandex.by') ||
            host === 'yandex.uz' || host.endsWith('.yandex.uz')) {
          return cb(true);
        }
        const corsList = String(process.env.CORS_ORIGINS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        if (corsList.includes('*') || corsList.includes(host) || corsList.includes(origin.toLowerCase())) return cb(true);
        if (process.env.STRICT_CORS !== '1') return cb(true);
        console.warn('[Cluster Gateway] Rejected unauthorized origin:', origin);
        return cb(false, 403, 'Forbidden Origin');
      } catch (_) {
        if (process.env.STRICT_CORS === '1') return cb(false, 400, 'Bad Origin');
        return cb(true);
      }
    }

    // Проверка статуса C++ транспорта uWebSockets.js
    const NetTransport = require('./net-transport.js');
    const uwsStatus = NetTransport.hasUws ? 'uWebSockets.js (C++ Zero-GC ready)' : 'ws fallback';
    if (process.env.NODE_ENV === 'production' || process.env.STRICT_UWS === '1') {
      try {
        NetTransport.assertProductionTransport({ strict: process.env.STRICT_UWS === '1' });
      } catch (err) {
        console.error('[Cluster Gateway] ❌ Ошибка проверки сетевого транспорта:', err.message);
        if (process.env.STRICT_UWS === '1') throw err;
      }
    }

    // Проверка персистентности БД (PostgreSQL обязателен в проде)
    const DB = require('./db.js');
    if (typeof DB.assertProductionDatabase === 'function') {
      try {
        DB.assertProductionDatabase();
      } catch (err) {
        console.error('[Cluster Gateway] ❌ Ошибка проверки персистентности БД:', err.message);
        if (process.env.STRICT_POSTGRES === '1' || process.env.NODE_ENV === 'production') {
          if (process.env.ALLOW_FILE_DB_IN_PROD !== '1') throw err;
        }
      }
    }

    // Проверка аутентификации (YANDEX_APP_SECRET обязателен в проде)
    const AUTH = require('./auth.js');
    if (typeof AUTH.assertProductionAuth === 'function') {
      try {
        AUTH.assertProductionAuth();
      } catch (err) {
        console.error('[Cluster Gateway] ❌ Ошибка проверки аутентификации:', err.message);
        if (process.env.STRICT_AUTH === '1' || process.env.NODE_ENV === 'production') {
          if (process.env.ALLOW_INSECURE_AUTH !== '1') throw err;
        }
      }
    }

    const wsMaxPayload = process.env.WS_MAX_PAYLOAD
      ? parseInt(process.env.WS_MAX_PAYLOAD, 10)
      : (process.env.NODE_ENV === 'production' ? (64 * 1024) : (32 * 1024 * 1024));

    const requestedEngine = (process.env.NET_ENGINE || (NetTransport.hasUws ? 'uws' : 'ws')).toLowerCase();
    const useUws = (requestedEngine === 'uws') && NetTransport.hasUws;

    if (useUws) {
      const uWS = require('uWebSockets.js');
      this.httpServer.listen(0, '127.0.0.1', () => {
        const internalHttpPort = self.httpServer.address().port;
        const uwsApp = uWS.App();

        uwsApp.ws('/*', {
          compression: uWS.DISABLED || 0,
          maxPayloadLength: wsMaxPayload,
          idleTimeout: 0,
          upgrade: (res, req, context) => {
            const origin = req.getHeader('origin');
            const secWebSocketKey = req.getHeader('sec-websocket-key');
            const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
            const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
            const headers = {};
            req.forEach((k, v) => { headers[k] = v; });

            verifyWsClient({ origin, req: { headers } }, (ok) => {
              if (!ok) {
                res.writeStatus('403 Forbidden').end();
                return;
              }
              res.upgrade(
                { pid: null },
                secWebSocketKey,
                secWebSocketProtocol,
                secWebSocketExtensions,
                context
              );
            });
          },
          open: (rawWs) => {
            const wrapper = new NetTransport.UwsSocketWrapper(rawWs, uwsApp);
            const connId = self.nextConnId++;
            self.socketsByConnId.set(connId, wrapper);
            self.connIdBySocket.set(wrapper, connId);
            self.workerIdByConnId.set(connId, 1);
            self._bindSocketEvents(wrapper, connId);
          },
          message: (rawWs, message, isBinary) => {
            const userData = rawWs.getUserData();
            const wrapper = userData && userData.wrapper;
            if (!wrapper) return;
            const buf = Buffer.from(message);
            wrapper.emit('message', buf, isBinary);
          },
          pong: (rawWs) => {
            const userData = rawWs.getUserData();
            const wrapper = userData && userData.wrapper;
            if (wrapper) wrapper.emit('pong');
          },
          close: (rawWs, code, message) => {
            const userData = rawWs.getUserData();
            const wrapper = userData && userData.wrapper;
            if (wrapper) {
              wrapper._isOpen = false;
              wrapper.rawWs = null;
              wrapper.emit('close', code, Buffer.from(message).toString('utf8'));
            }
          }
        });

        // HTTP proxy к внутреннему httpServer для REST API и статики
        uwsApp.any('/*', (res, req) => {
          const method = req.getMethod().toUpperCase();
          const url = req.getUrl();
          const query = req.getQuery();
          const headers = {};
          req.forEach((k, v) => { headers[k] = v; });

          let aborted = false;
          res.onAborted(() => { aborted = true; });

          const bodyChunks = [];
          res.onData((chunk, isLast) => {
            if (chunk.byteLength > 0) bodyChunks.push(Buffer.from(chunk));
            if (isLast) {
              if (aborted) return;
              const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;
              const proxyReq = http.request({
                host: '127.0.0.1',
                port: internalHttpPort,
                path: query ? `${url}?${query}` : url,
                method: method,
                headers: headers
              }, (proxyRes) => {
                if (aborted) return;
                res.cork(() => {
                  res.writeStatus(`${proxyRes.statusCode} ${proxyRes.statusMessage || 'OK'}`);
                  for (const [k, v] of Object.entries(proxyRes.headers)) {
                    const lk = k.toLowerCase();
                    if (lk === 'transfer-encoding' || lk === 'connection' || lk === 'keep-alive' || lk === 'date' || lk === 'upgrade' || lk === 'content-length') {
                      continue;
                    }
                    if (Array.isArray(v)) {
                      for (const val of v) res.writeHeader(k, val);
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
                  const origin = headers && headers.origin;
                  if (origin) {
                    res.writeHeader('Access-Control-Allow-Origin', origin);
                    res.writeHeader('Vary', 'Origin');
                  }
                  res.writeStatus('502 Bad Gateway').end('Proxy error: ' + (err && err.message));
                });
              });
              if (body && body.length > 0) proxyReq.write(body);
              proxyReq.end();
            }
          });
        });

        uwsApp.listen('0.0.0.0', self.port, (token) => {
          if (token) {
            self.listenToken = token;
            console.log(`[Cluster Gateway] 🌐 Master Gateway запущен на порту ${self.port} (Стек: uWebSockets.js C++ Zero-GC, HTTP Proxy -> :${internalHttpPort})`);
            if (typeof onListening === 'function') onListening();
          } else {
            console.error(`[Cluster Gateway] ❌ uWS не смог занять порт ${self.port}`);
          }
        });
      });
    } else {
      this.wss = new WebSocket.Server({
        server: this.httpServer,
        maxPayload: wsMaxPayload,
        perMessageDeflate: false,
        verifyClient: verifyWsClient
      });

      this.wss.on('connection', (ws) => {
        const connId = self.nextConnId++;
        self.socketsByConnId.set(connId, ws);
        self.connIdBySocket.set(ws, connId);
        self.workerIdByConnId.set(connId, 1);
        self._bindSocketEvents(ws, connId);
      });

      this.httpServer.listen(this.port, '0.0.0.0', 8192, () => {
        console.log(`[Cluster Gateway] 🌐 Master Gateway запущен на порту ${self.port} (Стек: ws fallback)`);
        if (typeof onListening === 'function') onListening();
      });
    }

    // Сторожевой таймер зависания воркеров (Worker Hang Watchdog)
    this._watchdogTimer = setInterval(() => {
      const now = Date.now();
      for (const [idx, worker] of self.workerByIndex) {
        const hb = self.ipcHub.workerHeartbeats.get(idx);
        // Если воркер зарегистрирован, но не присылал сообщений > 60 секунд — он действительно завис
        if (hb && (now - hb.lastSeen > 60000)) {
          const pid = (worker.process && worker.process.pid) || '?';
          console.error(`[Cluster Watchdog] ⚠️ Zone Worker #${idx} (PID: ${pid}) завис (нет ответа 60с, lag: ${hb.lagMs}мс)! Принудительный kill(SIGKILL)...`);
          self.ipcHub.workerHeartbeats.delete(idx);
          try {
            if (worker.process && typeof worker.process.kill === 'function') {
              worker.process.kill('SIGKILL');
            } else if (typeof worker.kill === 'function') {
              worker.kill('SIGKILL');
            }
          } catch (_) {}
        }
      }
    }, 5000);
    if (this._watchdogTimer && this._watchdogTimer.unref) this._watchdogTimer.unref();
  }

  _bindSocketEvents(ws, connId) {
    const self = this;
    let packetCount = 0;
    let windowStart = Date.now();
    const MAX_PACKETS_PER_SEC = 100;

    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        packetCount = 0;
      }
      packetCount++;
      if (packetCount > MAX_PACKETS_PER_SEC) {
        try { ws.close(4029, 'Rate limit exceeded'); } catch (_) {}
        return;
      }

      const targetWorkerIndex = self.workerIdByConnId.get(connId) || 1;
      const targetWorker = self.workerByIndex.get(targetWorkerIndex);
      const isBin = !!isBinary;
      const rawData = isBin ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : data.toString('utf8');

      // Перехват повторного логина для вытеснения зависших/старых сокетов
      if (!isBin && typeof rawData === 'string' && rawData.includes('"login"')) {
        try {
          const parsed = JSON.parse(rawData);
          if (parsed && parsed.t === 'login' && parsed.data) {
            const loginInfo = AUTH.parseLoginData(parsed.data);
            const strYid = String(loginInfo.yid || '');
            if (strYid) {
              const prevConnId = self.connIdByYid.get(strYid);
              if (prevConnId != null && prevConnId !== connId) {
                const prevWs = self.socketsByConnId.get(prevConnId);
                const prevWorkerId = self.workerIdByConnId.get(prevConnId);
                if (prevWs) {
                  try { prevWs.close(4008, 'logged in elsewhere'); } catch (_) {}
                }
                if (prevWorkerId) {
                  const pw = self.workerByIndex.get(prevWorkerId);
                  if (pw && pw.isConnected()) {
                    pw.send({
                      ipcType: MSG_CLIENT_DISCONNECT,
                      payload: { connId: prevConnId }
                    }, () => {});
                  }
                }
                self.connIdByYid.delete(strYid);
                self.yidByConnId.delete(prevConnId);
                self.socketsByConnId.delete(prevConnId);
              }
            }
          }
        } catch (_) {}
      }

      if (targetWorker) {
        try {
          if (typeof targetWorker.isConnected === 'function' && !targetWorker.isConnected()) return;
          targetWorker.send({
            ipcType: MSG_CLIENT_RAW,
            payload: {
              connId: connId,
              data: rawData,
              isBinary: isBin
            }
          }, () => {});
        } catch (_) {}
      } else {
        // Воркер находится в буфере рестарта: буферизуем входящие пакеты
        const buf = self.restartingWorkerBuffers.get(targetWorkerIndex);
        if (buf && buf.connIds.has(connId)) {
          let q = buf.packetBuffer.get(connId);
          if (!q) {
            q = [];
            buf.packetBuffer.set(connId, q);
          }
          if (q.length < 50) {
            q.push({ connId, data: rawData, isBinary: isBin });
          }
        }
      }
    });

    ws.on('close', () => {
      const targetWorkerIndex = self.workerIdByConnId.get(connId) || 1;
      const buf = self.restartingWorkerBuffers.get(targetWorkerIndex);
      if (buf) {
        buf.connIds.delete(connId);
        buf.packetBuffer.delete(connId);
      }

      const targetPid = self.pidByConnId.get(connId);
      const targetWorker = self.workerByIndex.get(targetWorkerIndex);
      if (targetWorker) {
        try {
          if (typeof targetWorker.isConnected === 'function' && !targetWorker.isConnected()) return;
          targetWorker.send({
            ipcType: MSG_CLIENT_DISCONNECT,
            payload: { connId: connId, pid: targetPid }
          }, () => {});
        } catch (_) {}
      }
      const yid = self.yidByConnId.get(connId);
      if (yid != null) {
        self.connIdByYid.delete(yid);
        self.yidByConnId.delete(connId);
        if (typeof PlayerDb.setOnline === 'function') {
          PlayerDb.setOnline(yid, null, false);
        }
      }
      if (targetPid != null) {
        self.connIdByPid.delete(targetPid);
        self.workerIdByPid.delete(targetPid);
      }
      self.charIdByConnId.delete(connId);
      self.pidByConnId.delete(connId);
      self.socketsByConnId.delete(connId);
      self.connIdBySocket.delete(ws);
      self.workerIdByConnId.delete(connId);
    });

    ws.on('error', (err) => {
      try { ws.terminate(); } catch (_) {}
    });
  }

  kickYid(yid, code, why) {
    let closed = false;
    const strYid = String(yid);
    const connId = this.connIdByYid.get(strYid);
    if (connId != null) {
      const ws = this.socketsByConnId.get(connId);
      if (ws) {
        try { ws.close(code || 4001, why || 'kicked'); closed = true; } catch (_) {}
      }
    }
    for (const [, ws] of this.socketsByConnId) {
      if (ws && String(ws.yid) === strYid) {
        try { ws.close(code || 4001, why || 'kicked'); closed = true; } catch (_) {}
      }
    }
    this.ipcHub.broadcastToWorkers({
      ipcType: MSG_GATEWAY_CLOSE,
      payload: { yid: strYid, code: code || 4001, reason: why || 'kicked' }
    });
    return closed;
  }

  stop(cb) {
    if (this._watchdogTimer) {
      clearInterval(this._watchdogTimer);
      this._watchdogTimer = null;
    }
    if (this.listenToken) {
      try {
        const uws = require('uWebSockets.js');
        uws.us_listen_socket_close(this.listenToken);
      } catch (_) {}
      this.listenToken = null;
    }
    if (this.wss) {
      try { this.wss.close(); } catch (_) {}
    }
    if (this.httpServer) {
      try { this.httpServer.close(cb); } catch (_) { if (cb) cb(); }
    } else if (cb) {
      cb();
    }
  }
}

if (cluster.isPrimary && require.main === module) {
  console.log('============================================================');
  console.log(`  PROJECT STEAM: ORIGINS — MASTER GATEWAY + КЛАСТЕР`);
  console.log(`  Доступно ядер CPU: ${TOTAL_CPUS} | Запуск воркеров: ${WORKER_COUNT}`);
  console.log(`  Архитектура: Master Gateway (Port ${PORT}) + Spatial Zone Shards`);
  console.log('============================================================\n');

  const ipcHub = new IpcHub({ isPrimary: true });
  const gateway = new MasterGateway({ port: PORT, workerCount: WORKER_COUNT, ipcHub });

  cluster.setupPrimary({
    exec: path.join(__dirname, 'server.js'),
    execArgv: ['--max-semi-space-size=32', '--max-old-space-size=450']
  });

  function cleanupZombies() {
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        console.log('[Cluster Manager] 🧹 Зачистка зомби-процессов и старых стресс-тестов...');
        execSync("pkill -9 -f 'stress-test|run-stepped' 2>/dev/null || true");
      } catch (_) {}
    }
  }

  // Зачистка сиротливых процессов при старте
  cleanupZombies();

  function forkWorker(idx) {
    const env = {
      ...process.env,
      WORKER_ID: String(idx),
      TOTAL_WORKERS: String(WORKER_COUNT),
      IS_CLUSTER_WORKER: '1'
    };
    const worker = cluster.fork(env);
    gateway.registerWorker(worker, idx);
    console.log(`[Cluster] 🚀 Zone Worker #${idx} запущен (PID: ${worker.process.pid})`);
    return worker;
  }

  (async () => {
    try {
      const pRes = await PlayerDb.init();
      console.log('[PlayerDB] Master indexed characters:', pRes && pRes.count);
    } catch (e) { console.error('[PlayerDB] Master init', e && e.message); }

    try {
      const aRes = await AccountKeys.init();
      console.log('[AccountKeys] Master loaded bindings:', aRes && aRes.count);
    } catch (e) { console.error('[AccountKeys] Master init', e && e.message); }

    try { Mod.load(); } catch (e) { console.error('[mod] Master load', e && e.message); }

    for (let i = 1; i <= WORKER_COUNT; i++) {
      forkWorker(i);
    }

    gateway.start();
  })().catch((err) => {
    console.error('[Cluster Manager] Fatal error during startup:', err);
  });

  // Автоматический рестарт упавшего воркера
  cluster.on('exit', (worker, code, signal) => {
    const workerIndex = gateway.handleWorkerExit(worker, code, signal);
    if (code === 0) return;

    console.log(`[Cluster] 🔄 Перезапуск Zone Worker #${workerIndex}...`);
    forkWorker(workerIndex);
  });

  // Логирование агрегированных метрик раз в минуту
  ipcHub.on('metrics_updated', (m) => {
    if (m.players > 0) {
      console.log(`[Cluster Metrics] Онлайн: ${m.players} игроков | Мобы: ${m.mobs} | Ср. тик: ${m.tickMsAvg.toFixed(2)} мс | Трафик: ${Math.round(m.bytesOut / 1024)} КБ`);
    }
  });

  const gracefulShutdown = () => {
    console.log('\n[Cluster] Остановка кластера...');
    gateway.stop();
    for (const [, { worker }] of gateway.workerMap) {
      try { worker.kill('SIGTERM'); } catch (_) {}
    }
    setTimeout(() => {
      for (const [, { worker }] of gateway.workerMap) {
        try { worker.kill('SIGKILL'); } catch (_) {}
      }
      cleanupZombies();
      process.exit(0);
    }, 1500);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

} else if (!cluster.isPrimary) {
  // Код воркера исполняется через server/server.js
  require('./server.js');
}

module.exports = {
  MasterGateway,
  WORKER_COUNT,
  PORT
};
