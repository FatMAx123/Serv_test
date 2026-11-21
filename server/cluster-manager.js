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

try { require('./secrets-loader.js'); } catch (_) { }

const cluster = require('cluster');
// Мастер — единственный писатель файловой БД кластера: свой пул потоков записи
// (MASTER_PERSISTENCE_WORKERS), воркерам возвращается исходное PERSISTENCE_WORKERS при fork.
const _workerPersistenceThreads = process.env.PERSISTENCE_WORKERS;
if (cluster.isPrimary && require.main === module && process.env.MASTER_PERSISTENCE_WORKERS) {
  process.env.PERSISTENCE_WORKERS = process.env.MASTER_PERSISTENCE_WORKERS;
}
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
const SEC = require('./security-config.js');
const L2_EXP = require('../shared/l2-exp-table.js');
const AccountKeys = require('./account-keys.js');
const GuestAuth = require('./guest-auth.js');
const Mod = require('./moderation.js');
const Clans = require('./clans-store.js');
const EditorGuard = require('./editor-guard.js');
const CH = require('../shared/char-rules.js');
const WT = require('../shared/world-time.js');
const NPB = require('../shared/net-pack-binary.js');
const { isGM } = require('./handlers/gm-handler.js');
const createHttpRouter = require('./http/admin-api.js');
const BIND_HOST = process.env.HOST || (SEC.isProd() ? '0.0.0.0' : '127.0.0.1');

const args = process.argv.slice(2);
function getArg(name, def) {
  for (const a of args) {
    if (a.startsWith(`--${name}=`)) return a.split('=')[1];
  }
  return def;
}

const TOTAL_CPUS = os.cpus() ? os.cpus().length : 4;
const DEFAULT_WORKERS = Math.max(1, Math.min(4, TOTAL_CPUS));

/**
 * HIGH-2: число зон-воркеров с учётом бэкенда БД. На DB=file воркеры пишут через мастер
 * (CLUSTER_FILE_DB_PROXY, по умолчанию включён) — гонок записи между процессами нет, и кластер
 * работает полным составом. Если прокси выключен (CLUSTER_FILE_DB_PROXY=0) и нет явного
 * ALLOW_FILE_DB_CLUSTER=1 — один воркер (безопасно и без crash-loop).
 */
function resolveWorkerCount(requested, env) {
  const e = env || process.env;
  let n = parseInt(requested, 10);
  if (!Number.isFinite(n) || n < 1) n = 1;
  const mode = String(e.DB || 'file').toLowerCase();
  const proxy = e.CLUSTER_FILE_DB_PROXY !== '0';
  if (n > 1 && mode === 'file' && !proxy && e.ALLOW_FILE_DB_CLUSTER !== '1') {
    return { count: 1, downgraded: true, requested: n };
  }
  return { count: n, downgraded: false, requested: n, fileProxy: mode === 'file' && proxy };
}

const _workerResolve = resolveWorkerCount(getArg('workers', process.env.CLUSTER_WORKERS || String(DEFAULT_WORKERS)), process.env);
const WORKER_COUNT = _workerResolve.count;
if (cluster.isPrimary && require.main === module) {
  if (_workerResolve.downgraded) {
    console.error('[Cluster Manager] ⚠️ DB=file + CLUSTER_WORKERS=' + _workerResolve.requested +
      ' при выключенном CLUSTER_FILE_DB_PROXY: файлы писали бы несколько процессов (риск дюпа/отката). ' +
      'Запуск с 1 воркером. Включите прокси (CLUSTER_FILE_DB_PROXY=1) или задайте DB=postgres.');
  } else if (_workerResolve.fileProxy && WORKER_COUNT > 1) {
    console.log('[Cluster Manager] 🗄️ DB=file: Master Gateway — единственный писатель профилей (' + WORKER_COUNT + ' воркера пишут через IPC)');
  }
}
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
    this.clusterPlayers = new Map();  // pid -> { pid, yid, name, workerId, charId }
    this.clusterPidByYid = new Map(); // yid -> pid
    this.clusterWsByPid = new Map();  // pid -> ws
    this.clusterLoginLocks = new Map(); // yid -> { claimId, workerId, connId, expiresAt }
    this.restartingWorkerBuffers = new Map(); // workerIndex -> { timer, connIds: Set, packetBuffer: Map<connId, Array> }
    this.restartGraceMs = this.opts.restartGraceMs != null ? this.opts.restartGraceMs : 2000;
    this.ipConnections = new Map(); // ip -> connection count

    this.nextConnId = 1;
    this.httpServer = null;
    this.wss = null;

    const CLIENT_DIR = path.join(REPO_ROOT, 'client');
    const SHARED_DIR = path.join(REPO_ROOT, 'shared');
    const YANDEX_SECRET = process.env.YANDEX_APP_SECRET || '';
    const EDITOR_ENABLED = process.env.NODE_ENV !== 'production' && ((process.env.EDITOR_ENABLED || '0') === '1');

    try {
      if (typeof Clans.loadAllAsync === 'function') {
        Clans.loadAllAsync().catch(e => console.error('[ClusterManager] Clans.loadAllAsync error:', e));
      } else if (typeof Clans.loadAll === 'function') {
        Clans.loadAll();
      }
      if (this.ipcHub && typeof Clans.setSyncBroadcaster === 'function') {
        Clans.setSyncBroadcaster((action, data) => {
          if (self.ipcHub && typeof self.ipcHub.broadcastClanSync === 'function') {
            self.ipcHub.broadcastClanSync(action, data);
          }
        });
      }
      this.httpRouter = createHttpRouter({
        getLastTickAt: () => (self.ipcHub && self.ipcHub.aggregatedMetrics && self.ipcHub.aggregatedMetrics.lastTickAt) || Date.now(),
        metricsPayload: () => self.ipcHub.aggregatedMetrics,
        worldTimePayload: () => {
          const synced = self.ipcHub && self.ipcHub.aggregatedMetrics && self.ipcHub.aggregatedMetrics.worldTime;
          if (synced && typeof synced === 'object') return synced;
          const elapsedSec = (Date.now() / 1000) % WT.DAY_LENGTH_SEC;
          const realFrac = elapsedSec / WT.DAY_LENGTH_SEC;
          const tod = WT.realFracToTod(realFrac);
          const h = WT.todToHour(tod);
          return {
            tod: tod,
            realFrac: realFrac,
            dayLengthSec: WT.DAY_LENGTH_SEC,
            dayRealFrac: WT.DAY_REAL_FRAC,
            phase: WT.phaseOfTod(tod),
            hour: h,
            isNight: WT.isNightHour(h),
            paused: false,
            server: true
          };
        },
        buildLeaderboard: (limit) => {
          limit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));
          const all = typeof PlayerDb.list === 'function' ? PlayerDb.list() : [];
          return all
            .filter(r => r && r.yid && !r.yid.startsWith('bot_') && !r.yid.startsWith('stress_bot_') && !r.yid.startsWith('bot3k_') && !r.yid.startsWith('bot_uniq_'))
            .map(r => ({
              name: r.name,
              level: r.level || 1,
              score: (Number(r.level) || 1) * 1000 + (Number(r.exp) || 0),
              online: !!r.online
            }))
            .sort((a, b) => b.score - a.score || b.level - a.level || String(a.name).localeCompare(String(b.name)))
            .slice(0, limit);
        },
        players: this.clusterPlayers,
        pidByYid: this.clusterPidByYid,
        wsByPid: this.clusterWsByPid,
        loggingIn: new Set(),
        lbTouch: (yid, pr, charId) => { if (typeof PlayerDb.touch === 'function') PlayerDb.touch(pr, yid, charId); },
        lbDrop: (yid, charId) => { if (typeof PlayerDb.removeChar === 'function') PlayerDb.removeChar(yid, charId); },
        broadcastGmSync: (data) => self.ipcHub && typeof self.ipcHub.broadcastGmSync === 'function' && self.ipcHub.broadcastGmSync(data),
        clanLeaveOnCharDelete: async (yid, charId) => {
          try {
            if (typeof Clans.loadAllAsync === 'function') {
              await Clans.loadAllAsync().catch(() => {});
            }
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
            Clans.saveMeta(c);
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
            try { ws.send(JSON.stringify(msg)); } catch (_) { }
          }
        },
        detachPlayer: async (pid) => {
          const workerId = self.workerIdByPid.get(pid);
          if (self.ipcHub && typeof self.ipcHub.requestDetachPidWait === 'function') {
            await self.ipcHub.requestDetachPidWait(pid, workerId || null, 1500);
          } else if (self.ipcHub && typeof self.ipcHub.sendGmAction === 'function') {
            self.ipcHub.sendGmAction({ action: 'detach_pid', pid }, workerId || null);
          }
          const connId = self.connIdByPid.get(pid);
          if (connId != null) {
            const ws = self.socketsByConnId.get(connId);
            if (ws) {
              try { ws.close(4011, 'detached'); } catch (_) { }
            }
          }
        },
        kickYid: (yid, code, why) => {
          return self.kickYid(yid, code, why);
        },
        onCharDeleteKick: async (yid, charId) => {
          await self.kickDeletedCharWait(yid, charId, 1500);
        },
        getOnlineCount: () => {
          return Math.max((self.ipcHub && self.ipcHub.aggregatedMetrics && self.ipcHub.aggregatedMetrics.players) || 0, self.connIdByYid.size);
        },
        isGM: (p) => isGM(p),
        rebuildServerSpots: () => {
          if (self.ipcHub && typeof self.ipcHub.broadcastSpotsRebuild === 'function') {
            self.ipcHub.broadcastSpotsRebuild();
          }
        },
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
      if (this.httpRouter && typeof this.httpRouter.setupGmChangeListener === 'function') {
        this.httpRouter.setupGmChangeListener();
      }
    } catch (e) {
      console.error('[Cluster Gateway] Failed to create httpRouter:', e);
      this.httpRouter = null;
    }

    this._setupIpcListeners();
  }

  _getSocketBufferedAmount(ws) {
    if (!ws) return 0;
    if (ws.rawWs && typeof ws.rawWs.getBufferedAmount === 'function') {
      try { return ws.rawWs.getBufferedAmount() || 0; } catch (_) { return 0; }
    }
    if (typeof ws.getBufferedAmount === 'function') {
      try { return ws.getBufferedAmount() || 0; } catch (_) { return 0; }
    }
    return ws.bufferedAmount || 0;
  }

  _shouldDropForBackpressure(ws, rawData, outData, isBinary) {
    const bufAmount = this._getSocketBufferedAmount(ws);
    if (bufAmount <= 98304) return false;
    if (!isBinary && typeof rawData === 'string') {
      if (rawData.includes('"t":"dmg"') || rawData.includes('"t":"skill_fx"') || rawData.includes('"t":"cosmetic"')) {
        return true;
      }
      if (bufAmount > 262144 && rawData.startsWith('{"t":"upd"')) {
        return true;
      }
      return false;
    }
    if (bufAmount > 262144 && isBinary && Buffer.isBuffer(outData) && outData.length > 0 && outData[0] === NPB.OP_UPD) {
      return true;
    }
    return false;
  }

  _setupIpcListeners() {
    const self = this;

    // Файловая БД кластера: мастер — единственный писатель профилей/кланов/системного состояния.
    // Воркеры шлют операции сюда, порядок записи задаёт одна очередь writeChains этого процесса.
    if (this.ipcHub && typeof this.ipcHub.setDbRequestHandler === 'function' && typeof DB.handleClusterDbRequest === 'function') {
      // Журналы незавершённых переносов (обмен/лавка/клан-склад) доигрывает мастер — единственный
      // писатель; операции воркеров ждут окончания доигрывания (handleClusterDbRequest).
      if (DB.MODE === 'file' && typeof DB.replayJournals === 'function') {
        DB.replayJournals().catch((e) => console.error('[Cluster Gateway] доигрывание журналов переносов:', e && e.message));
      }
      this.ipcHub.setDbRequestHandler((op, args) => DB.handleClusterDbRequest(op, args));
    }

    function toOutboundPayload(data, isBinary, isBase64) {
      if (!isBinary) return data;
      if (Buffer.isBuffer(data)) return NPB.detachBuffer(data);
      if (ArrayBuffer.isView(data)) return Buffer.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      if (typeof data === 'string') return Buffer.from(data, isBase64 ? 'base64' : 'utf8');
      if (data && data.type === 'Buffer' && Array.isArray(data.data)) return Buffer.from(data.data);
      return data;
    }

    // 1. Отправка фрейма от воркера к клиенту
    this.ipcHub.on('gateway_send', (payload) => {
      if (!payload) return;
      const { connId, data, isBinary, isBase64, pid, yid, charId } = payload;
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
        const outData = toOutboundPayload(data, !!isBinary, !!isBase64);
        if (self._shouldDropForBackpressure(ws, data, outData, !!isBinary)) return;
        try {
          ws.send(outData, { binary: !!isBinary });
        } catch (_) { }
      }
    });

    // 1b. Батчинг отправки фреймов от воркера к клиенту (группировка по сокету + ws.cork)
    this.ipcHub.on('gateway_send_batch', (batch) => {
      const items = Array.isArray(batch) ? batch : (batch && Array.isArray(batch.items) ? batch.items : null);
      if (!items || items.length === 0) return;
      const bySocket = new Map();
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item) continue;
        const { connId, data, isBinary, isBase64, pid, yid, charId } = item;
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
          const outData = toOutboundPayload(data, !!isBinary, !!isBase64);
          if (self._shouldDropForBackpressure(ws, data, outData, !!isBinary)) continue;
          let q = bySocket.get(ws);
          if (!q) {
            q = [];
            bySocket.set(ws, q);
          }
          q.push({ rawData: data, outData, isBinary: !!isBinary });
        }
      }
      for (const [ws, frames] of bySocket) {
        const flushSocketFrames = () => {
          for (let j = 0; j < frames.length; j++) {
            const f = frames[j];
            if (self._shouldDropForBackpressure(ws, f.rawData, f.outData, f.isBinary)) continue;
            try { ws.send(f.outData, { binary: f.isBinary }); } catch (_) { }
          }
        };
        if (typeof ws.cork === 'function' && frames.length > 1) {
          ws.cork(flushSocketFrames);
        } else {
          flushSocketFrames();
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
        } catch (_) { }
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
      const { yid, pid, name, connId: directConnId, online, charId, workerId } = payload;
      if (yid != null) {
        const strYid = String(yid);
        const connId = directConnId != null ? directConnId : (pid != null ? self.connIdByPid.get(pid) : null);
        if (connId != null) {
          // Вытеснение старой сессии ТОЛЬКО после успешной авторизации воркером:
          const prevConnId = self.connIdByYid.get(strYid);
          if (prevConnId != null && prevConnId !== connId) {
            const prevPid = self.pidByConnId.get(prevConnId);
            const prevWorkerId = prevPid != null ? self.workerIdByPid.get(prevPid) : self.workerIdByConnId.get(prevConnId);
            if (prevPid != null && self.ipcHub && typeof self.ipcHub.sendGmAction === 'function') {
              self.ipcHub.sendGmAction({ action: 'detach_pid', pid: prevPid }, prevWorkerId || null);
            }
            const prevWs = self.socketsByConnId.get(prevConnId);
            if (prevWs) {
              self.connIdBySocket.delete(prevWs);
              try { prevWs.close(4008, 'logged in elsewhere'); } catch (_) { }
            }
            self.yidByConnId.delete(prevConnId);
            self.socketsByConnId.delete(prevConnId);
            self.pidByConnId.delete(prevConnId);
            self.charIdByConnId.delete(prevConnId);
            self.workerIdByConnId.delete(prevConnId);
          }
          self.connIdByYid.set(strYid, connId);
          self.yidByConnId.set(connId, strYid);
          if (pid != null) {
            self.connIdByPid.set(pid, connId);
            self.pidByConnId.set(connId, pid);
            const wsObj = self.socketsByConnId.get(connId);
            if (wsObj) self.clusterWsByPid.set(pid, wsObj);
          }
          if (charId != null) {
            self.charIdByConnId.set(connId, String(charId));
          }
          const ws = self.socketsByConnId.get(connId);
          if (ws) ws.yid = strYid;
        }
        if (online) {
          const effPid = pid != null ? pid : self.clusterPidByYid.get(strYid);
          if (effPid != null) {
            self.clusterPidByYid.set(strYid, effPid);
            self.clusterPlayers.set(effPid, {
              pid: effPid,
              yid: strYid,
              name: name || '',
              workerId: workerId || self.workerIdByPid.get(effPid) || 1,
              charId: charId || null
            });
          }
        } else {
          const curPid = self.clusterPidByYid.get(strYid);
          const oldPid = pid != null ? pid : curPid;
          if (pid == null || curPid === pid) {
            self.connIdByYid.delete(strYid);
            self.clusterPidByYid.delete(strYid);
          }
          if (oldPid != null) {
            self.clusterPlayers.delete(oldPid);
            self.clusterWsByPid.delete(oldPid);
          }
        }
        if (typeof PlayerDb.setOnline === 'function') {
          PlayerDb.setOnline(strYid, null, !!online);
        }
      }
    });

    // 4b. Атомарная координация кросс-воркерного логина (C-02):
    // перед DB.load на новом воркере гарантируем синхронный detach + сохранение профиля на старом воркере.
    this.ipcHub.on('login_claim', async (req) => {
      if (!req || !req.claimId || !req.yid || !req.workerId) return;
      const strYid = String(req.yid);
      const { claimId, workerId, connId } = req;
      try {
        // Ждём завершения параллельного логина (до 2000 мс)
        for (let attempt = 0; attempt < 40; attempt++) {
          const cur = self.clusterLoginLocks.get(strYid);
          if (!cur || Date.now() > cur.expiresAt) break;
          await new Promise(r => setTimeout(r, 50));
        }
        const curLock = self.clusterLoginLocks.get(strYid);
        if (curLock && Date.now() <= curLock.expiresAt) {
          self.ipcHub.replyLoginClaim(workerId, { claimId, ok: false, reason: 'login_in_progress' });
          return;
        }
        self.clusterLoginLocks.set(strYid, {
          claimId,
          workerId,
          connId: connId != null ? connId : null,
          expiresAt: Date.now() + 10000
        });

        const prevConnId = self.connIdByYid.get(strYid);
        const dirRec = (self.ipcHub && typeof self.ipcHub.getPlayer === 'function') ? self.ipcHub.getPlayer(strYid) : null;
        const prevPid = (prevConnId != null && self.pidByConnId.has(prevConnId))
          ? self.pidByConnId.get(prevConnId)
          : (self.clusterPidByYid.has(strYid) ? self.clusterPidByYid.get(strYid) : (dirRec && dirRec.pid != null ? dirRec.pid : null));
        const prevWorkerId = (prevPid != null && self.workerIdByPid.has(prevPid))
          ? self.workerIdByPid.get(prevPid)
          : ((prevConnId != null && self.workerIdByConnId.has(prevConnId))
            ? self.workerIdByConnId.get(prevConnId)
            : (dirRec && dirRec.workerId != null ? dirRec.workerId : null));

        const isDifferentWorker = prevWorkerId != null && prevWorkerId !== workerId;
        const hasRemoteSession = isDifferentWorker && (prevPid != null || (prevConnId != null && prevConnId !== connId));
        if (hasRemoteSession) {
          if (prevConnId != null && prevConnId !== connId) {
            const prevWs = self.socketsByConnId.get(prevConnId);
            if (prevWs) {
              self.connIdBySocket.delete(prevWs);
              try { prevWs.close(4008, 'logged in elsewhere'); } catch (_) { }
            }
            self.yidByConnId.delete(prevConnId);
            self.socketsByConnId.delete(prevConnId);
            self.pidByConnId.delete(prevConnId);
            self.charIdByConnId.delete(prevConnId);
            self.workerIdByConnId.delete(prevConnId);
          }
          const detachedOk = await self.ipcHub.requestDetachPidWait(prevPid, prevWorkerId, 3500, strYid);
          if (!detachedOk) {
            const cur = self.clusterLoginLocks.get(strYid);
            if (cur && cur.claimId === claimId) self.clusterLoginLocks.delete(strYid);
            self.ipcHub.replyLoginClaim(workerId, { claimId, ok: false, reason: 'prev_session_busy' });
            return;
          }
          if (self.connIdByYid.get(strYid) === prevConnId) self.connIdByYid.delete(strYid);
          if (prevPid != null) {
            if (self.clusterPidByYid.get(strYid) === prevPid) self.clusterPidByYid.delete(strYid);
            self.clusterPlayers.delete(prevPid);
            self.clusterWsByPid.delete(prevPid);
            self.connIdByPid.delete(prevPid);
            self.workerIdByPid.delete(prevPid);
          }
        }

        self.ipcHub.replyLoginClaim(workerId, { claimId, ok: true });
      } catch (err) {
        const cur = self.clusterLoginLocks.get(strYid);
        if (cur && cur.claimId === claimId) self.clusterLoginLocks.delete(strYid);
        console.error('[Cluster Gateway] login_claim error:', err && err.message);
        self.ipcHub.replyLoginClaim(workerId, { claimId, ok: false, reason: 'login_claim_error' });
      }
    });

    this.ipcHub.on('login_release', (req) => {
      if (!req || !req.yid) return;
      const strYid = String(req.yid);
      const cur = self.clusterLoginLocks.get(strYid);
      if (cur && (!req.claimId || cur.claimId === req.claimId)) {
        self.clusterLoginLocks.delete(strYid);
      }
    });

    this.ipcHub.on('worker_exit', (deadWorkerId) => {
      for (const [k, v] of self.clusterLoginLocks) {
        if (v && v.workerId === deadWorkerId) self.clusterLoginLocks.delete(k);
      }
    });

    // 5. Синхронизация кланов, PlayerDb, GuestAuth и ключей редактора в памяти Master Gateway
    if (typeof GuestAuth.setIpcHub === 'function') {
      GuestAuth.setIpcHub(this.ipcHub);
    }
    if (typeof PlayerDb.setIpcHub === 'function') {
      PlayerDb.setIpcHub(this.ipcHub);
    }
    this.ipcHub.on('clan_sync', (payload) => {
      if (!payload || !payload.clan) return;
      Clans.applySync(payload.action, payload.clan);
    });
    this.ipcHub.on('editor_key_sync', (payload) => {
      if (!payload) return;
      if (payload.action === 'issue' && payload.token) {
        EditorGuard.registerToken(payload.token, { yid: payload.yid, pid: payload.pid });
      } else if (payload.action === 'revoke' && payload.token) {
        EditorGuard.revoke(payload.token);
      } else if (payload.action === 'revokePid' && payload.pid != null) {
        EditorGuard.revokePid(payload.pid);
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
          sessionsToRestore.push({
            connId,
            yid,
            pid,
            charId,
            clientIp: ws.clientIp || '',
            binaryProto: !!ws._binaryProto
          });
        }
      }

      if (sessionsToRestore.length > 0) {
        console.log(`[Cluster Gateway] 🔄 Восстановление ${sessionsToRestore.length} сессий для перезапущенного Воркера #${index}...`);
        try {
          if (typeof worker.isConnected !== 'function' || worker.isConnected()) {
            worker.send({
              ipcType: MSG_SESSION_RESTORE,
              payload: { sessions: sessionsToRestore }
            }, () => { });
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
                }, () => { });
              }
            } catch (_) { }
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

    const cleanupStaleConn = (connId) => {
      const staleYid = this.yidByConnId.get(connId);
      const stalePid = this.pidByConnId.get(connId);
      const staleWs = this.socketsByConnId.get(connId);
      this.workerIdByConnId.delete(connId);
      this.charIdByConnId.delete(connId);
      this.pidByConnId.delete(connId);
      this.yidByConnId.delete(connId);
      this.socketsByConnId.delete(connId);
      if (staleWs) this.connIdBySocket.delete(staleWs);
      if (staleYid != null && this.connIdByYid.get(staleYid) === connId) {
        this.connIdByYid.delete(staleYid);
        if (this.clusterPidByYid.get(staleYid) === stalePid) this.clusterPidByYid.delete(staleYid);
      }
      if (stalePid != null && this.connIdByPid.get(stalePid) === connId) {
        this.connIdByPid.delete(stalePid);
        this.workerIdByPid.delete(stalePid);
        this.clusterPlayers.delete(stalePid);
        this.clusterWsByPid.delete(stalePid);
      }
    };

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
            try { ws.close(1012, 'Zone worker restart timeout'); } catch (_) { }
          }
          cleanupStaleConn(connId);
        }
        this.restartingWorkerBuffers.delete(workerIndex);
      }, this.restartGraceMs);

      this.restartingWorkerBuffers.set(workerIndex, buf);
    } else {
      // Штатное завершение (code === 0) или буфер отключен: немедленный сброс
      for (const connId of affectedConnIds) {
        const ws = this.socketsByConnId.get(connId);
        if (ws) {
          try { ws.close(1012, 'Zone worker restart'); } catch (_) { }
        }
        cleanupStaleConn(connId);
      }
    }

    return workerIndex;
  }

  serveStatic(req, res) {
    try {
      const parsed = url.parse(req.url);
      let rawPath = '/';
      try {
        rawPath = decodeURIComponent(parsed.pathname || '/');
      } catch (_) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('bad request');
      }
      if (rawPath === '/favicon.ico') {
        res.writeHead(204);
        return res.end();
      }
      if (EditorGuard.isEditorAsset(rawPath) && !EditorGuard.allowAsset(req)) {
        const isCss = rawPath.toLowerCase().endsWith('.css');
        res.writeHead(404, {
          'Content-Type': isCss ? 'text/css; charset=utf-8' : 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(isCss ? '/* 404 not found */' : 'not found');
        return;
      }
      if (rawPath === '/' || rawPath === '') rawPath = '/index.html';

      // Нормализуем путь относительно слэшей
      let normPath = path.normalize(rawPath).replace(/^[\/\\]+/, '');

      // Защита от утечки исходного кода и конфигов сервера:
      // Строго блокируем системные и серверные каталоги
      const lower = normPath.toLowerCase();
      const DATA_PRIVATE = /(^|[\/\\])(local_[^\/\\]*\.json|.*\.bak|.*\.backup(\..*)?|.*\.tmp(\..*)?|editor-overrides\.backup.*)$/i;
      if (
        DATA_PRIVATE.test(normPath) ||
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
      const isInsideRoot = (candidate, root) => candidate === root || candidate.startsWith(root + path.sep);

      let targetPath = null;

      if (normPath.startsWith('shared' + path.sep) || normPath === 'shared') {
        const rel = normPath.slice(6).replace(/^[\/\\]+/, '');
        targetPath = path.normalize(path.join(SHARED_ROOT, rel));
        if (!isInsideRoot(targetPath, SHARED_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      } else if (normPath.startsWith('client' + path.sep) || normPath === 'client') {
        const rel = normPath.slice(6).replace(/^[\/\\]+/, '');
        targetPath = path.normalize(path.join(CLIENT_ROOT, rel));
        if (!isInsideRoot(targetPath, CLIENT_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      } else if (normPath.startsWith('data' + path.sep) || normPath === 'data') {
        // В data/ разрешены строго terrain-paint-*.png
        const rel = normPath.slice(4).replace(/^[\/\\]+/, '');
        if (/^terrain-paint-[a-zA-Z0-9_\-]+\.png$/i.test(rel)) {
          targetPath = path.normalize(path.join(DATA_ROOT, rel));
          if (!isInsideRoot(targetPath, DATA_ROOT)) {
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
        if (!isInsideRoot(targetPath, CLIENT_ROOT)) {
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }
      }

      if (DATA_PRIVATE.test(targetPath)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
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
        const stream = fs.createReadStream(targetPath);
        stream.on('error', (err) => {
          if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Read error');
        });
        stream.pipe(res);
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
      const metricsOk = SEC.metricsAuthorized(req.socket && req.socket.remoteAddress, (n) => req.headers[n]);
      const activeCount = self.workerByIndex ? self.workerByIndex.size : 0;
      // ok = шлюз жив и есть хотя бы одна зона; недостающий (перезапускающийся) воркер — degraded,
      // но не повод watchdog'у рестартовать весь кластер (мастер сам перезапускает воркеры).
      const isHealthy = activeCount > 0;
      const allUp = activeCount >= self.workerCount;
      if (req.url === '/healthz' && !metricsOk) {
        // H11: публично — только статус
        res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: isHealthy, status: allUp ? 'ok' : 'degraded', activeWorkers: activeCount, expectedWorkers: self.workerCount }));
        return;
      }
      if ((req.url === '/metrics' || (req.url && req.url.startsWith('/metrics?'))) && !metricsOk) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ ok: false, error: 'forbidden' }));
        return;
      }
      if (req.url === '/healthz') {
        const m = self.ipcHub.aggregatedMetrics;
        res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: isHealthy,
          status: allUp ? 'ok' : 'degraded',
          mode: 'cluster_gateway',
          workers: self.workerCount,
          expectedWorkers: self.workerCount,
          activeWorkers: activeCount,
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

      // 4. Раздача статики клиента (если не отключена в dedicated-режиме)
      if (process.env.SERVE_CLIENT === '0') {
        if (req.url === '/' || req.url === '') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Project Steam MMO Dedicated Server (Cluster Gateway API/WS Only)');
          return;
        }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not Found: Dedicated MMO Server (API/WS Only)');
        return;
      }
      self.serveStatic(req, res);
    });

    function verifyWsClient(info, cb) {
      // H12: единый белый список (security-config.originAllowed); в production — строго
      const origin = info.origin || (info.req && info.req.headers && info.req.headers.origin);
      const h = (info.req && info.req.headers) || {};
      if (SEC.originAllowed(origin, h.host, h['x-forwarded-host'])) return cb(true);
      const strict = SEC.isProd() || process.env.STRICT_CORS === '1';
      console.warn('[Cluster Gateway] ' + (strict ? 'Rejected' : 'Allowed (dev)') + ' origin:', String(origin).slice(0, 200));
      if (!strict) return cb(true);
      return cb(false, 403, 'Forbidden Origin');
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
        DB.assertProductionDatabase({ clusterWorkers: this.workerCount });
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
        const bpHandlers = NetTransport.createUwsBackpressureHandlers();

        uwsApp.ws('/*', {
          compression: uWS.DISABLED || 0,
          maxPayloadLength: wsMaxPayload,
          maxBackpressure: parseInt(process.env.WS_MAX_BACKPRESSURE || String(1024 * 1024), 10),
          closeOnBackpressureLimit: false,
          idleTimeout: parseInt(process.env.WS_IDLE_TIMEOUT || '48', 10),
          upgrade: (res, req, context) => {
            const origin = req.getHeader('origin');
            const secWebSocketKey = req.getHeader('sec-websocket-key');
            const secWebSocketProtocol = req.getHeader('sec-websocket-protocol');
            const secWebSocketExtensions = req.getHeader('sec-websocket-extensions');
            const headers = {};
            req.forEach((k, v) => { headers[k] = v; });

            const remoteIp = Buffer.from(res.getRemoteAddressAsText()).toString('utf8');
            const clientIp = SEC.resolveClientIp(remoteIp, (n) => req.getHeader(n));

            // Проверка лимита одновременных соединений с одного IP
            const maxConns = parseInt(process.env.MAX_CONNS_PER_IP || '64', 10);
            const isLoopback = SEC.isLoopbackIp(clientIp);
            const stressSecret = process.env.STRESS_SECRET;
            const reqStressKey = req.getHeader('x-stress-key') || req.getHeader('x-stress-test');
            const isStressKey = process.env.ALLOW_UNLIMITED_WS === '1' ||
              (process.env.STRESS_TEST === '1' && (
                (stressSecret && reqStressKey && SEC.secretEquals(reqStressKey, stressSecret)) ||
                (!stressSecret && !SEC.isProd())
              ));
            if (!isLoopback && !isStressKey && maxConns > 0) {
              const currentConns = self.ipConnections.get(clientIp) || 0;
              if (currentConns >= maxConns) {
                res.writeStatus('429 Too Many Requests').end('Too many connections from this IP');
                return;
              }
            }

            verifyWsClient({ origin, req: { headers } }, (ok) => {
              if (!ok) {
                res.writeStatus('403 Forbidden').end();
                return;
              }
              res.upgrade(
                { pid: null, clientIp, isStressAllowed: !!isStressKey, stressKey: reqStressKey ? String(reqStressKey) : '' },
                secWebSocketKey,
                secWebSocketProtocol,
                secWebSocketExtensions,
                context
              );
            });
          },
          open: (rawWs) => {
            const userData = rawWs.getUserData();
            const clientIp = userData && userData.clientIp;
            // MEDIUM-1: isStressAllowed/stressKey — getter-свойства UwsSocketWrapper, читающие userData
            // (заполнен в upgrade). Присваивание им в strict mode бросало TypeError и роняло
            // весь мастер-шлюз на первом stress-подключении.
            const wrapper = new NetTransport.UwsSocketWrapper(rawWs, uwsApp);
            if (clientIp) {
              wrapper.clientIp = clientIp;
              self.ipConnections.set(clientIp, (self.ipConnections.get(clientIp) || 0) + 1);
            }
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
            const buf = Buffer.from(new Uint8Array(message)); // копия: память uWS живёт только в колбэке
            wrapper.emit('message', buf, isBinary);
          },
          pong: (rawWs) => {
            const userData = rawWs.getUserData();
            const wrapper = userData && userData.wrapper;
            if (wrapper) wrapper.emit('pong');
          },
          drain: bpHandlers.drain,
          dropped: bpHandlers.dropped,
          close: (rawWs, code, message) => {
            const userData = rawWs.getUserData();
            const wrapper = userData && userData.wrapper;
            if (wrapper) {
              if (wrapper.clientIp) {
                const count = self.ipConnections.get(wrapper.clientIp) || 0;
                if (count <= 1) self.ipConnections.delete(wrapper.clientIp);
                else self.ipConnections.set(wrapper.clientIp, count - 1);
              }
              wrapper._isOpen = false;
              wrapper.rawWs = null;
              wrapper.emit('close', code, Buffer.from(message).toString('utf8'));
            }
          }
        });

        // Fast-path маршруты C++ uWebSockets.js
        uwsApp.get('/healthz', (res, req) => {
          let aborted = false;
          res.onAborted(() => { aborted = true; });
          const m = self.ipcHub ? self.ipcHub.aggregatedMetrics : null;
          const activeCount = self.workerByIndex ? self.workerByIndex.size : 0;
          // ok — есть хотя бы одна зона; недостающий воркер — degraded (см. http-обработчик выше)
          const isHealthy = activeCount > 0;
          const allUp = activeCount >= self.workerCount;
          // H11: подробности только с METRICS_TOKEN
          const remote = Buffer.from(res.getRemoteAddressAsText()).toString('utf8');
          if (!SEC.metricsAuthorized(remote, (n) => req.getHeader(n))) {
            if (!aborted) {
              res.writeStatus(isHealthy ? '200 OK' : '503 Service Unavailable')
                .writeHeader('Content-Type', 'application/json; charset=utf-8')
                .writeHeader('Cache-Control', 'no-store')
                .writeHeader('Access-Control-Allow-Origin', '*')
                .end(JSON.stringify({ ok: isHealthy, status: allUp ? 'ok' : 'degraded', activeWorkers: activeCount, expectedWorkers: self.workerCount }));
            }
            return;
          }
          const body = JSON.stringify({
            ok: isHealthy,
            status: allUp ? 'ok' : 'degraded',
            mode: 'cluster_gateway',
            workers: self.workerCount,
            expectedWorkers: self.workerCount,
            activeWorkers: activeCount,
            players: m ? m.players : 0,
            mobs: m ? m.mobs : 0,
            tickMsAvg: m ? m.tickMsAvg : 0,
            bytesOut: m ? m.bytesOut : 0,
            packetsOut: m ? m.packetsOut : 0
          });
          if (!aborted) {
            res.writeStatus(isHealthy ? '200 OK' : '503 Service Unavailable')
              .writeHeader('Content-Type', 'application/json; charset=utf-8')
              .writeHeader('Cache-Control', 'no-store')
              .writeHeader('Access-Control-Allow-Origin', '*')
              .end(body);
          }
        });

        uwsApp.get('/menu-healthz', (res) => {
          let aborted = false;
          res.onAborted(() => { aborted = true; });
          if (!aborted) {
            res.writeStatus('200 OK')
              .writeHeader('Content-Type', 'application/json; charset=utf-8')
              .writeHeader('Cache-Control', 'no-store')
              .end(JSON.stringify({ ok: true, status: 'ok' }));
          }
        });

        // HTTP proxy к внутреннему httpServer для REST API и статики
        uwsApp.any('/*', (res, req) => {
          const method = req.getMethod().toUpperCase();
          const url = req.getUrl();
          const query = req.getQuery();
          const headers = {};
          req.forEach((k, v) => { headers[k] = v; });

          const remoteIp = Buffer.from(res.getRemoteAddressAsText()).toString('utf8');
          const clientIp = SEC.resolveClientIp(remoteIp, (n) => req.getHeader(n));
          const hadProxyHeaders = Boolean(headers['x-real-ip'] || headers['x-forwarded-for'] || headers['forwarded'] || headers['cf-connecting-ip']);
          const isDirectLoopback = SEC.isLoopbackIp(remoteIp) && !hadProxyHeaders;
          delete headers['x-real-ip'];
          delete headers['x-forwarded-for'];
          delete headers['forwarded'];
          delete headers['cf-connecting-ip'];
          delete headers['transfer-encoding'];
          if (clientIp && !isDirectLoopback) {
            headers['x-real-ip'] = clientIp;
            headers['x-forwarded-for'] = clientIp;
          }

          let aborted = false;
          let proxyReq = null;
          res.onAborted(() => {
            aborted = true;
            if (proxyReq) {
              try { proxyReq.destroy(); } catch (_) { }
              proxyReq = null;
            }
          });

          const maxBodyBytes = SEC.maxHttpBodyBytes(url);
          const declaredLen = parseInt(headers['content-length'] || '0', 10);
          if (Number.isFinite(declaredLen) && declaredLen > maxBodyBytes) {
            res.cork(() => {
              res.writeStatus('413 Payload Too Large')
                .writeHeader('Content-Type', 'application/json; charset=utf-8')
                .end(JSON.stringify({ ok: false, error: 'payload too large' }));
            });
            return;
          }

          const bodyChunks = [];
          let totalBodyBytes = 0;
          let bodyTooLarge = false;
          res.onData((chunk, isLast) => {
            if (aborted || bodyTooLarge) return;
            // FIX: копия — ArrayBuffer uWS валиден только внутри колбэка (см. net-transport)
            if (chunk.byteLength > 0) {
              totalBodyBytes += chunk.byteLength;
              if (totalBodyBytes > maxBodyBytes) {
                bodyTooLarge = true;
                bodyChunks.length = 0;
                res.cork(() => {
                  res.writeStatus('413 Payload Too Large')
                    .writeHeader('Content-Type', 'application/json; charset=utf-8')
                    .end(JSON.stringify({ ok: false, error: 'payload too large' }));
                });
                return;
              }
              bodyChunks.push(Buffer.from(new Uint8Array(chunk)));
            }
            if (isLast) {
              if (aborted) return;
              const body = bodyChunks.length > 0 ? Buffer.concat(bodyChunks) : null;
              if (body) {
                headers['content-length'] = String(body.length);
              } else if (method !== 'GET' && method !== 'HEAD') {
                headers['content-length'] = '0';
              } else {
                delete headers['content-length'];
              }
              proxyReq = http.request({
                host: '127.0.0.1',
                port: internalHttpPort,
                path: query ? `${url}?${query}` : url,
                method: method,
                headers: headers
              }, (proxyRes) => {
                if (aborted) return;
                const resChunks = [];
                proxyRes.on('data', (d) => {
                  if (aborted) return;
                  resChunks.push(d);
                });
                proxyRes.on('end', () => {
                  proxyReq = null;
                  if (aborted) return;
                  const fullBody = resChunks.length === 1 ? resChunks[0] : (resChunks.length > 0 ? Buffer.concat(resChunks) : Buffer.alloc(0));
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
                    res.end(fullBody);
                  });
                });
              });
              proxyReq.on('error', (err) => {
                proxyReq = null;
                if (aborted) return;
                console.error('[Cluster Gateway] HTTP proxy error:', err && err.message);
                res.cork(() => {
                  // uWS: статус строго до заголовков; детали ошибки клиенту не раскрываем,
                  // CORS — только для разрешённых Origin.
                  res.writeStatus('502 Bad Gateway');
                  const origin = headers && headers.origin;
                  if (origin && SEC.originAllowed(origin, headers.host, headers['x-forwarded-host'])) {
                    res.writeHeader('Access-Control-Allow-Origin', origin);
                    res.writeHeader('Vary', 'Origin');
                  }
                  res.end('Bad Gateway');
                });
              });
              if (body && body.length > 0) proxyReq.write(body);
              proxyReq.end();
            }
          });
        });

        uwsApp.listen(BIND_HOST, self.port, (token) => {
          if (token) {
            self.listenToken = token;
            console.log(`[Cluster Gateway] 🌐 Master Gateway запущен на ${BIND_HOST}:${self.port} (Стек: uWebSockets.js C++ Zero-GC, HTTP Proxy -> :${internalHttpPort})`);
            if (typeof onListening === 'function') onListening();
          } else {
            console.error(`[Cluster Gateway] ❌ uWS не смог занять порт ${self.port} на ${BIND_HOST}`);
            process.exit(1);
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

      this.wss.on('connection', (ws, req) => {
        const remoteIp = (req && req.socket && req.socket.remoteAddress) || '';
        const clientIp = SEC.resolveClientIp(remoteIp, (n) => (req && req.headers && req.headers[n.toLowerCase()]) || '');
        ws.clientIp = clientIp;

        // Проверка лимита одновременных соединений с одного IP
        const maxConns = parseInt(process.env.MAX_CONNS_PER_IP || '64', 10);
        const isLoopback = SEC.isLoopbackIp(clientIp);
        const stressSecretWs = process.env.STRESS_SECRET;
        const reqStressKeyWs = req && req.headers && (req.headers['x-stress-key'] || req.headers['x-stress-test']);
        const isStressKey = process.env.ALLOW_UNLIMITED_WS === '1' ||
          (process.env.STRESS_TEST === '1' && (
            (stressSecretWs && reqStressKeyWs && SEC.secretEquals(reqStressKeyWs, stressSecretWs)) ||
            (!stressSecretWs && !SEC.isProd())
          ));
        if (isStressKey) {
          ws.isStressAllowed = true;
          ws.stressKey = reqStressKeyWs ? String(reqStressKeyWs) : '';
        }
        if (!isLoopback && !isStressKey && maxConns > 0) {
          const currentConns = self.ipConnections.get(clientIp) || 0;
          if (currentConns >= maxConns) {
            try { ws.close(4029, 'Too many connections from this IP'); } catch (_) { }
            return;
          }
        }

        if (clientIp) {
          self.ipConnections.set(clientIp, (self.ipConnections.get(clientIp) || 0) + 1);
          ws.on('close', () => {
            const count = self.ipConnections.get(clientIp) || 0;
            if (count <= 1) self.ipConnections.delete(clientIp);
            else self.ipConnections.set(clientIp, count - 1);
          });
        }
        const rawSend = ws.send.bind(ws);
        ws.send = (data, options, cb) => {
          const payload = (typeof data !== 'string') ? NPB.detachBuffer(data) : data;
          return rawSend(payload, options, cb);
        };
        const connId = self.nextConnId++;
        self.socketsByConnId.set(connId, ws);
        self.connIdBySocket.set(ws, connId);
        self.workerIdByConnId.set(connId, 1);
        self._bindSocketEvents(ws, connId);
      });

      this.httpServer.listen(this.port, BIND_HOST, 8192, () => {
        console.log(`[Cluster Gateway] 🌐 Master Gateway запущен на ${BIND_HOST}:${self.port} (Стек: ws fallback)`);
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
          } catch (_) { }
        }
      }
    }, 5000);
    if (this._watchdogTimer && this._watchdogTimer.unref) this._watchdogTimer.unref();
  }

  _bindSocketEvents(ws, connId) {
    const self = this;
    let packetCount = 0;
    let windowStart = Date.now();
    const SOFT_LIMIT = SEC.MAX_PACKETS_PER_SEC_SOFT || 120;
    const HARD_LIMIT = SEC.MAX_PACKETS_PER_SEC_HARD || 180;

    ws.on('message', (data, isBinary) => {
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        packetCount = 0;
      }
      packetCount++;
      if (packetCount > HARD_LIMIT) {
        try { ws.close(4029, 'Rate limit exceeded'); } catch (_) { }
        return;
      } else if (packetCount > SOFT_LIMIT) {
        return;
      }

      const targetWorkerIndex = self.workerIdByConnId.get(connId) || 1;
      const targetWorker = self.workerByIndex.get(targetWorkerIndex);
      const isBin = !!isBinary;
      if (isBin) ws._binaryProto = true;
      const rawData = isBin ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : data.toString('utf8');
      const stressMeta = ws.isStressAllowed ? { isStressAllowed: true, stressKey: ws.stressKey || '' } : {};

      if (targetWorker) {
        try {
          if (typeof targetWorker.isConnected === 'function' && !targetWorker.isConnected()) return;
          targetWorker.send({
            ipcType: MSG_CLIENT_RAW,
            payload: Object.assign({
              connId: connId,
              data: rawData,
              isBinary: isBin,
              clientIp: ws.clientIp || ''
            }, stressMeta)
          }, () => { });
        } catch (_) { }
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
            q.push(Object.assign({ connId, data: rawData, isBinary: isBin, clientIp: ws.clientIp || '' }, stressMeta));
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
      if (targetWorker && (typeof targetWorker.isConnected !== 'function' || targetWorker.isConnected())) {
        try {
          targetWorker.send({
            ipcType: MSG_CLIENT_DISCONNECT,
            payload: { connId: connId, pid: targetPid }
          }, () => { });
        } catch (_) { }
      }
      const yid = self.yidByConnId.get(connId);
      if (yid != null) {
        if (self.connIdByYid.get(yid) === connId) self.connIdByYid.delete(yid);
        self.yidByConnId.delete(connId);
        if (self.clusterPidByYid.get(yid) === targetPid) self.clusterPidByYid.delete(yid);
        if (typeof PlayerDb.setOnline === 'function' && self.connIdByYid.get(yid) == null) {
          PlayerDb.setOnline(yid, null, false);
        }
      }
      if (targetPid != null) {
        if (self.connIdByPid.get(targetPid) === connId) {
          self.connIdByPid.delete(targetPid);
          self.workerIdByPid.delete(targetPid);
          self.clusterPlayers.delete(targetPid);
          self.clusterWsByPid.delete(targetPid);
        }
      }
      self.charIdByConnId.delete(connId);
      self.pidByConnId.delete(connId);
      self.socketsByConnId.delete(connId);
      self.connIdBySocket.delete(ws);
      self.workerIdByConnId.delete(connId);
    });

    ws.on('error', (err) => {
      try { ws.terminate(); } catch (_) { }
    });
  }

  kickYid(yid, code, why) {
    let closed = false;
    const strYid = String(yid);
    const connId = this.connIdByYid.get(strYid);
    if (connId != null) {
      const ws = this.socketsByConnId.get(connId);
      if (ws) {
        try { ws.close(code || 4001, why || 'kicked'); closed = true; } catch (_) { }
      }
    }
    for (const [, ws] of this.socketsByConnId) {
      if (ws && String(ws.yid) === strYid) {
        try { ws.close(code || 4001, why || 'kicked'); closed = true; } catch (_) { }
      }
    }
    this.ipcHub.broadcastToWorkers({
      ipcType: MSG_GATEWAY_CLOSE,
      payload: { yid: strYid, code: code || 4001, reason: why || 'kicked' }
    });
    return closed;
  }

  async kickDeletedCharWait(yid, charId, timeoutMs) {
    const strYid = String(yid);
    const normCharId = CH.normalizeCharId(charId);
    if (this.ipcHub && typeof this.ipcHub.broadcastCharDeleteKickWait === 'function') {
      await this.ipcHub.broadcastCharDeleteKickWait(strYid, normCharId, timeoutMs || 1500);
    } else if (this.ipcHub && typeof this.ipcHub.broadcastCharDeleteKick === 'function') {
      this.ipcHub.broadcastCharDeleteKick(strYid, normCharId);
    }
    this._closeDeletedCharSocket(strYid, normCharId);
  }

  _closeDeletedCharSocket(strYid, normCharId) {
    const connId = this.connIdByYid.get(strYid);
    if (connId != null) {
      const curChar = this.charIdByConnId.get(connId);
      if (!curChar || CH.normalizeCharId(curChar) === normCharId) {
        const ws = this.socketsByConnId.get(connId);
        if (ws) {
          try { ws.send(JSON.stringify({ t: 'kicked', reason: 'char_deleted' })); } catch (_) { }
          try { ws.close(4011, 'char deleted'); } catch (_) { }
        }
      }
    }
  }

  kickDeletedChar(yid, charId) {
    const strYid = String(yid);
    const normCharId = CH.normalizeCharId(charId);
    if (this.ipcHub && typeof this.ipcHub.broadcastCharDeleteKick === 'function') {
      this.ipcHub.broadcastCharDeleteKick(strYid, normCharId);
    }
    this._closeDeletedCharSocket(strYid, normCharId);
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
      } catch (_) { }
      this.listenToken = null;
    }
    if (this.wss) {
      try { this.wss.close(); } catch (_) { }
    }
    if (this.httpServer) {
      try { this.httpServer.close(cb); } catch (_) { if (cb) cb(); }
    } else if (cb) {
      cb();
    }
  }
}

const SHUTDOWN_GRACE_MS = Math.max(2000, parseInt(process.env.CLUSTER_SHUTDOWN_GRACE_MS || '9000', 10) || 9000);

async function flushMasterState(deps) {
  const d = deps || {};
  const pDb = d.PlayerDb || PlayerDb;
  const aKeys = d.AccountKeys || AccountKeys;
  const clans = d.Clans || Clans;
  const mod = d.Mod || Mod;
  const db = d.DB || DB;
  const tasks = [];
  if (pDb && typeof pDb.save === 'function') {
    tasks.push(Promise.resolve().then(() => pDb.save()).catch(e => console.error('[Cluster] shutdown PlayerDb.save:', e && e.message)));
  }
  if (aKeys && typeof aKeys.flush === 'function') {
    tasks.push(Promise.resolve().then(() => aKeys.flush()).catch(e => console.error('[Cluster] shutdown AccountKeys.flush:', e && e.message)));
  }
  if (clans && typeof clans.flush === 'function') {
    tasks.push(Promise.resolve().then(() => clans.flush()).catch(e => console.error('[Cluster] shutdown Clans.flush:', e && e.message)));
  }
  if (mod && typeof mod.flush === 'function') {
    tasks.push(Promise.resolve().then(() => mod.flush()).catch(e => console.error('[Cluster] shutdown Mod.flush:', e && e.message)));
  }
  if (db && typeof db.flush === 'function') {
    tasks.push(Promise.resolve().then(() => db.flush()).catch(e => console.error('[Cluster] shutdown DB.flush:', e && e.message)));
  }
  await Promise.all(tasks);
  if (db && typeof db.close === 'function') {
    try { await db.close(); } catch (e) { console.error('[Cluster] shutdown DB.close:', e && e.message); }
  }
}

if (cluster.isPrimary && require.main === module) {
  process.env.IS_CLUSTER_MASTER = '1';
  console.log('============================================================');
  console.log(`  PROJECT STEAM: ORIGINS — MASTER GATEWAY + КЛАСТЕР`);
  console.log(`  Доступно ядер CPU: ${TOTAL_CPUS} | Запуск воркеров: ${WORKER_COUNT}`);
  console.log(`  Архитектура: Master Gateway (Port ${PORT}) + Spatial Zone Shards`);
  console.log('============================================================\n');

  const ipcHub = new IpcHub({ isPrimary: true });
  const gateway = new MasterGateway({ port: PORT, workerCount: WORKER_COUNT, ipcHub });

  cluster.setupPrimary({
    exec: path.join(__dirname, 'server.js'),
    execArgv: ['--max-semi-space-size=32', '--max-old-space-size=450'],
    serialization: 'advanced'
  });

  function cleanupZombies() {
    // При включённых ботах (PM2-приложение project-steam-bots) их процессы не трогаем.
    if (process.env.KEEP_STRESS_PROCS === '1') return;
    if (process.platform === 'linux') {
      try {
        const { execSync } = require('child_process');
        console.log('[Cluster Manager] 🧹 Зачистка зомби-процессов и старых стресс-тестов...');
        execSync("pkill -9 -f 'stress-test|run-stepped' 2>/dev/null || true");
      } catch (_) { }
    }
  }

  // Зачистка сиротливых процессов при старте
  cleanupZombies();

  function forkWorker(idx) {
    const env = {
      ...process.env,
      WORKER_ID: String(idx),
      WORKER_INDEX: String(idx),
      TOTAL_WORKERS: String(WORKER_COUNT),
      // фактическое число воркеров (после HIGH-2), чтобы assertProductionDatabase в воркере
      // видел то же значение, что и мастер, и не уводил воркер в crash-loop
      CLUSTER_WORKERS: String(WORKER_COUNT),
      IS_CLUSTER_WORKER: '1',
      CLUSTER_IPC_SERIALIZATION: 'advanced'
    };
    if (_workerPersistenceThreads == null) delete env.PERSISTENCE_WORKERS;
    else env.PERSISTENCE_WORKERS = _workerPersistenceThreads;
    // Флаг мастера НЕ наследуется: раньше воркеры получали IS_CLUSTER_MASTER=1, и clans-store
    // считал владельцем кланового склада никого (мета кланов не сохранялась на диск).
    delete env.IS_CLUSTER_MASTER;
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
    try { if (typeof Mod.pruneOldLogs === 'function') Mod.pruneOldLogs(); } catch (_) { }
    setInterval(() => { try { if (typeof Mod.pruneOldLogs === 'function') Mod.pruneOldLogs(); } catch (_) {} }, 24 * 3600 * 1000).unref();

    AccountKeys.setIpcHub(gateway.ipcHub);
    Mod.setIpcHub(gateway.ipcHub);
    if (typeof PlayerDb.setIpcHub === 'function') {
      PlayerDb.setIpcHub(gateway.ipcHub);
    }
    if (typeof PlayerDb.onGmChanged === 'function') {
      PlayerDb.onGmChanged((evt) => {
        gateway.ipcHub.broadcastGmSync(evt);
      });
    }

    for (let i = 1; i <= WORKER_COUNT; i++) {
      forkWorker(i);
    }

    gateway.start();
  })().catch((err) => {
    // Fail-fast: без шлюза кластер не принимает игроков. Раньше ошибка только логировалась,
    // процесс оставался «online» в PM2 с воркерами, но без слушающего порта.
    console.error('[Cluster Manager] FATAL: ошибка запуска шлюза, кластер останавливается:', err && (err.stack || err.message) || err);
    isShuttingDown = true;
    for (const [, { worker }] of gateway.workerMap) {
      try { if (worker && !worker.isDead()) worker.kill('SIGTERM'); } catch (_) { }
    }
    setTimeout(() => process.exit(1), 3000).unref();
  });

  let isShuttingDown = false;

  // Защита от crash-loop: воркер, упавший больше CRASH_LOOP_MAX раз за минуту, перезапускается
  // с экспоненциальной паузой (до 30 с) — остальные зоны продолжают работать, CPU не сгорает.
  const CRASH_LOOP_WINDOW_MS = 60000;
  const CRASH_LOOP_MAX = 3;
  const workerCrashTimes = new Map(); // workerIndex -> number[]
  function restartDelayFor(workerIndex) {
    const now = Date.now();
    const list = (workerCrashTimes.get(workerIndex) || []).filter((t) => now - t < CRASH_LOOP_WINDOW_MS);
    list.push(now);
    workerCrashTimes.set(workerIndex, list);
    if (list.length <= CRASH_LOOP_MAX) return 0;
    return Math.min(30000, 1000 * Math.pow(2, list.length - CRASH_LOOP_MAX - 1));
  }

  // Автоматический рестарт упавшего воркера
  cluster.on('exit', (worker, code, signal) => {
    if (isShuttingDown) return;
    const workerIndex = gateway.handleWorkerExit(worker, code, signal);
    // Вне штатной остановки кластера любой выход воркера (в т.ч. code 0) — потеря зоны: перезапускаем.
    if (typeof workerIndex !== 'number') return;

    const delay = restartDelayFor(workerIndex);
    if (delay > 0) {
      console.error(`[Cluster] ⚠️ Zone Worker #${workerIndex} падает по кругу — перезапуск через ${delay} мс`);
      setTimeout(() => {
        if (isShuttingDown || gateway.workerByIndex.has(workerIndex)) return;
        console.log(`[Cluster] 🔄 Перезапуск Zone Worker #${workerIndex}...`);
        forkWorker(workerIndex);
      }, delay);
      return;
    }
    console.log(`[Cluster] 🔄 Перезапуск Zone Worker #${workerIndex}...`);
    forkWorker(workerIndex);
  });

  // Логирование агрегированных метрик раз в минуту
  ipcHub.on('metrics_updated', (m) => {
    if (m.players > 0) {
      console.log(`[Cluster Metrics] Онлайн: ${m.players} игроков | Мобы: ${m.mobs} | Ср. тик: ${m.tickMsAvg.toFixed(2)} мс | Трафик: ${Math.round(m.bytesOut / 1024)} КБ`);
    }
  });

  const gracefulShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Cluster] Остановка кластера (graceful timeout: ${SHUTDOWN_GRACE_MS} мс)...`);
    gateway.stop();
    const workers = [];
    const exitPromises = [];
    for (const [, { worker }] of gateway.workerMap) {
      if (!worker || worker.isDead()) continue;
      workers.push(worker);
      exitPromises.push(new Promise((resolve) => {
        worker.once('exit', resolve);
      }));
      try { worker.kill('SIGTERM'); } catch (_) { }
    }
    if (exitPromises.length > 0) {
      let graceTimer = null;
      await Promise.race([
        Promise.all(exitPromises),
        new Promise((resolve) => {
          graceTimer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
          if (graceTimer && graceTimer.unref) graceTimer.unref();
        })
      ]);
      if (graceTimer) clearTimeout(graceTimer);
      for (const worker of workers) {
        if (worker && !worker.isDead()) {
          try { worker.kill('SIGKILL'); } catch (_) { }
        }
      }
    }
    try {
      let flushTimer = null;
      await Promise.race([
        flushMasterState(),
        new Promise((resolve) => {
          flushTimer = setTimeout(resolve, 2500);
          if (flushTimer && flushTimer.unref) flushTimer.unref();
        })
      ]);
      if (flushTimer) clearTimeout(flushTimer);
    } catch (_) { }
    cleanupZombies();
    process.exit(0);
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  // MEDIUM-1: единичное исключение в колбэке шлюза не должно рвать сессии всех игроков.
  // Логируем; при лавине (>20 за минуту) — штатный graceful shutdown и рестарт через PM2.
  let _masterFaults = [];
  const onMasterFault = (kind, err) => {
    const line = '[Cluster Gateway] [fatal-guard] ' + kind + ': ' + ((err && (err.stack || err.message)) || err) + '\n';
    try { fs.appendFileSync(path.join(__dirname, 'crash.log'), new Date().toISOString() + ' ' + line); } catch (_) { }
    console.error(line);
    const now = Date.now();
    _masterFaults = _masterFaults.filter((t) => now - t < 60000);
    _masterFaults.push(now);
    if (_masterFaults.length > 20) {
      console.error('[Cluster Gateway] слишком много необработанных ошибок за минуту — перезапуск кластера');
      gracefulShutdown();
    }
  };
  process.on('uncaughtException', (e) => onMasterFault('uncaughtException', e));
  process.on('unhandledRejection', (r) => onMasterFault('unhandledRejection', r));

} else if (!cluster.isPrimary) {
  // Код воркера исполняется через server/server.js
  require('./server.js');
}

module.exports = {
  MasterGateway,
  flushMasterState,
  SHUTDOWN_GRACE_MS,
  WORKER_COUNT,
  resolveWorkerCount,
  PORT
};
