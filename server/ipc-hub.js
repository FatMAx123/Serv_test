// ============================================================
//  SERVER / IPC-HUB.JS
//  Межпроцессная шина сообщений (Cluster IPC Hub) для
//  многоядерного шардинга игрового мира.
//  Обеспечивает сквозной обмен сообщениями между процессами:
//    - CHAT: глобальный чат, анонсы рейдов, системные сообщения
//    - CLAN: клановый чат, статус участников клана онлайн
//    - HANDOFF: бесшовная передача сессии игрока при смене зоны
//    - METRICS: агрегация онлайна и метрик тика со всех ядер
// ============================================================
'use strict';

const EventEmitter = require('events');

const MSG_CHAT = 'IPC_CHAT';
const MSG_CLAN = 'IPC_CLAN';
const MSG_HANDOFF = 'IPC_HANDOFF';
const MSG_METRICS = 'IPC_METRICS';
const MSG_ANNOUNCE = 'IPC_ANNOUNCE';
const MSG_CLIENT_RAW = 'IPC_CLIENT_RAW';
const MSG_GATEWAY_SEND = 'IPC_GATEWAY_SEND';
const MSG_GATEWAY_SEND_BATCH = 'IPC_GATEWAY_SEND_BATCH';
const MSG_GATEWAY_CLOSE = 'IPC_GATEWAY_CLOSE';
const MSG_CLIENT_DISCONNECT = 'IPC_CLIENT_DISCONNECT';
const MSG_WHISPER = 'IPC_WHISPER';
const MSG_PLAYER_UPDATE = 'IPC_PLAYER_UPDATE';
const MSG_PARTY = 'IPC_PARTY';
const MSG_BORDER_GHOSTS = 'IPC_BORDER_GHOSTS';
const MSG_SESSION_RESTORE = 'IPC_SESSION_RESTORE';
const MSG_CLAN_SYNC = 'IPC_CLAN_SYNC';
const MSG_CLUSTER_ONLINE = 'IPC_CLUSTER_ONLINE';
const MSG_HEARTBEAT = 'IPC_HEARTBEAT';

class IpcHub extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts || {};
    this.isPrimary = !!this.opts.isPrimary;
    this.workerId = this.opts.workerId || 0;
    this.workers = new Map(); // workerId -> worker instance (only on Primary)
    this.aggregatedMetrics = {
      players: 0,
      mobs: 0,
      tickMsAvg: 0,
      bytesOut: 0,
      packetsOut: 0,
      workers: []
    };
    this.workerHeartbeats = new Map(); // workerId -> { lastSeen, lagMs, tickMs }

    this._setupListeners();
  }

  _setupListeners() {
    const self = this;

    // Внутри воркера: слушаем сообщения от Primary через process.on('message')
    if (!this.isPrimary && typeof process.on === 'function') {
      process.on('message', (msg) => {
        if (!msg || typeof msg !== 'object' || !msg.ipcType) return;
        self._dispatchIncoming(msg);
      });
    }
  }

  /**
   * Регистрация воркера (вызывается на Primary процессе).
   */
  registerWorker(workerId, workerProcess) {
    if (!this.isPrimary) return;
    const self = this;
    this.workers.set(workerId, workerProcess);

    workerProcess.on('message', (msg) => {
      if (!msg || typeof msg !== 'object' || !msg.ipcType) return;
      self._handleWorkerMessage(workerId, msg);
    });

    workerProcess.on('error', (err) => {
      if (err && err.code === 'ERR_IPC_CHANNEL_CLOSED') return;
      console.warn(`[Cluster IPC] Worker #${workerId} error:`, err && err.message);
    });

    workerProcess.on('exit', () => {
      self.workers.delete(workerId);
      self.emit('worker_exit', workerId);
    });
  }

  _handleWorkerMessage(fromWorkerId, msg) {
    if (!msg) return;

    // Любое входящее сообщение от воркера доказывает его активность
    const existingHb = this.workerHeartbeats.get(fromWorkerId);
    if (existingHb) {
      existingHb.lastSeen = Date.now();
    } else {
      this.workerHeartbeats.set(fromWorkerId, {
        lastSeen: Date.now(),
        lagMs: 0,
        tickMs: 0
      });
    }

    // 1. Агрегация метрик
    if (msg.ipcType === MSG_METRICS) {
      this._updateWorkerMetrics(fromWorkerId, msg.payload);
      return;
    }

    // 1.1. Сердечный ритм воркера (Watchdog Heartbeat)
    if (msg.ipcType === MSG_HEARTBEAT) {
      const hb = this.workerHeartbeats.get(fromWorkerId);
      if (hb) {
        hb.lastSeen = Date.now();
        hb.lagMs = (msg.payload && msg.payload.lagMs) || 0;
        hb.tickMs = (msg.payload && msg.payload.tickMs) || 0;
      }
      this.emit('worker_heartbeat', { workerId: fromWorkerId, payload: msg.payload });
      return;
    }

    // 2. Сквозной бродкаст чата на ВСЕ остальные воркеры
    if (msg.ipcType === MSG_CHAT || msg.ipcType === MSG_ANNOUNCE || msg.ipcType === MSG_CLAN) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit(msg.ipcType.toLowerCase(), msg.payload);
      return;
    }

    // 3. Межворкерный личный чат (Whisper)
    if (msg.ipcType === MSG_WHISPER) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('whisper', msg.payload);
      return;
    }

    // 4. Синхронизация глобального реестра игроков
    if (msg.ipcType === MSG_PLAYER_UPDATE) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('player_update', msg.payload);
      return;
    }

    // 5. Адресный Handoff игрока конкретному воркеру
    if (msg.ipcType === MSG_HANDOFF) {
      const targetWorkerId = msg.targetWorkerId;
      const targetWorker = this.workers.get(targetWorkerId);
      this.emit('handoff_route', {
        pid: msg.payload && msg.payload.pid,
        connId: msg.payload && msg.payload.connId,
        fromWorkerId: fromWorkerId,
        targetWorkerId: targetWorkerId
      });
      if (targetWorker) {
        try {
          if (typeof targetWorker.isConnected === 'function' && !targetWorker.isConnected()) return;
          targetWorker.send(msg, () => {});
        } catch (_) {}
      }
      return;
    }

    // 6. Пакеты шлюза (Worker -> Gateway)
    if (msg.ipcType === MSG_GATEWAY_SEND) {
      this.emit('gateway_send', msg.payload);
      return;
    }
    if (msg.ipcType === MSG_GATEWAY_SEND_BATCH) {
      this.emit('gateway_send_batch', msg.payload);
      return;
    }
    if (msg.ipcType === MSG_GATEWAY_CLOSE) {
      this.emit('gateway_close', msg.payload);
      return;
    }

    // 7. Межсерверная синхронизация групп (Party)
    if (msg.ipcType === MSG_PARTY) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('party', msg.payload);
      return;
    }

    // 8. Межворкерные приграничные призраки (Border Seam replication)
    if (msg.ipcType === MSG_BORDER_GHOSTS) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('border_ghosts', msg.payload);
      return;
    }

    // 9. Межсерверная синхронизация состояния кланов и CWH (SYNC-CLN-01)
    if (msg.ipcType === MSG_CLAN_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('clan_sync', msg.payload);
      return;
    }

    this.emit('message', msg);
  }

  _dispatchIncoming(msg) {
    if (msg.ipcType === MSG_CHAT) {
      this.emit('chat', msg.payload);
    } else if (msg.ipcType === MSG_CLAN) {
      this.emit('clan', msg.payload);
    } else if (msg.ipcType === MSG_ANNOUNCE) {
      this.emit('announce', msg.payload);
    } else if (msg.ipcType === MSG_HANDOFF) {
      this.emit('handoff', msg.payload);
    } else if (msg.ipcType === MSG_CLIENT_RAW) {
      this.emit('client_raw', msg.payload);
    } else if (msg.ipcType === MSG_CLIENT_DISCONNECT) {
      this.emit('client_disconnect', msg.payload);
    } else if (msg.ipcType === MSG_WHISPER) {
      this.emit('whisper', msg.payload);
    } else if (msg.ipcType === MSG_PLAYER_UPDATE) {
      this.emit('player_update', msg.payload);
    } else if (msg.ipcType === MSG_PARTY) {
      this.emit('party', msg.payload);
    } else if (msg.ipcType === MSG_BORDER_GHOSTS) {
      this.emit('border_ghosts', msg.payload);
    } else if (msg.ipcType === MSG_SESSION_RESTORE) {
      this.emit('session_restore', msg.payload);
    } else if (msg.ipcType === MSG_CLAN_SYNC) {
      this.emit('clan_sync', msg.payload);
    } else if (msg.ipcType === MSG_CLUSTER_ONLINE) {
      this.emit('cluster_online', msg.payload);
    } else {
      this.emit('message', msg);
    }
  }

  _updateWorkerMetrics(workerId, m) {
    const list = this.aggregatedMetrics.workers;
    const idx = list.findIndex(w => w.workerId === workerId);
    const item = Object.assign({ workerId }, m, { updatedAt: Date.now() });
    if (idx >= 0) list[idx] = item;
    else list.push(item);

    let totalPlayers = 0;
    let totalMobs = 0;
    let totalBytes = 0;
    let totalPackets = 0;
    let sumTick = 0;

    for (const w of list) {
      totalPlayers += w.players || 0;
      totalMobs += w.mobs || 0;
      totalBytes += w.bytesOut || 0;
      totalPackets += w.packetsOut || 0;
      sumTick += w.tickMs || 0;
    }

    this.aggregatedMetrics.players = totalPlayers;
    this.aggregatedMetrics.mobs = totalMobs;
    this.aggregatedMetrics.bytesOut = totalBytes;
    this.aggregatedMetrics.packetsOut = totalPackets;
    this.aggregatedMetrics.tickMsAvg = list.length > 0 ? (sumTick / list.length) : 0;

    this.emit('metrics_updated', this.aggregatedMetrics);
    this.broadcastToWorkers({
      ipcType: MSG_CLUSTER_ONLINE,
      payload: { online: totalPlayers }
    });
  }

  /**
   * Отправка сообщения из воркера в Primary процесс.
   */
  sendToPrimary(type, payload, targetWorkerId) {
    if (this.isPrimary) return;
    if (typeof process.send === 'function') {
      process.send({
        ipcType: type,
        fromWorkerId: this.workerId,
        targetWorkerId: targetWorkerId || null,
        payload: payload
      });
    }
  }

  /**
   * Рассылка из Primary всем воркерам (кроме опционального исключения).
   */
  broadcastToWorkers(msg, excludeWorkerId) {
    if (!this.isPrimary) return;
    for (const [id, worker] of this.workers) {
      if (excludeWorkerId != null && id === excludeWorkerId) continue;
      try {
        if (typeof worker.isConnected === 'function' && !worker.isConnected()) continue;
        worker.send(msg, () => {});
      } catch (_) {}
    }
  }

  // --- Удобные хелперы для игровой логики ---

  broadcastChat(channel, senderName, text, extra) {
    const payload = { channel, senderName, text, extra: extra || null, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_CHAT, payload });
    } else {
      this.sendToPrimary(MSG_CHAT, payload);
    }
  }

  broadcastAnnounce(text, durationSec) {
    const payload = { text, durationSec: durationSec || 15, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_ANNOUNCE, payload });
    } else {
      this.sendToPrimary(MSG_ANNOUNCE, payload);
    }
  }

  sendMetrics(metrics) {
    if (!this.isPrimary) {
      this.sendToPrimary(MSG_METRICS, metrics);
    }
  }

  handoffPlayer(targetWorkerId, playerData) {
    this.sendToPrimary(MSG_HANDOFF, playerData, targetWorkerId);
  }

  sendWhisper(senderName, targetName, text) {
    const payload = { senderName, targetName, text, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_WHISPER, payload });
      this.emit('whisper', payload);
    } else {
      this.sendToPrimary(MSG_WHISPER, payload);
    }
  }

  updatePlayerDirectory(yid, pid, name, online, workerId, charId) {
    const payload = { yid, pid, name, online, workerId: workerId || this.workerId, charId: charId || null, updatedAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_PLAYER_UPDATE, payload });
    } else {
      this.sendToPrimary(MSG_PLAYER_UPDATE, payload);
    }
  }

  broadcastParty(payload) {
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_PARTY, payload });
      this.emit('party', payload);
    } else {
      this.sendToPrimary(MSG_PARTY, payload);
    }
  }

  broadcastClanSync(action, clanData) {
    const payload = { action, clan: clanData, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_CLAN_SYNC, payload });
      this.emit('clan_sync', payload);
    } else {
      this.sendToPrimary(MSG_CLAN_SYNC, payload);
    }
  }
}

module.exports = {
  MSG_CHAT,
  MSG_CLAN,
  MSG_CLAN_SYNC,
  MSG_HANDOFF,
  MSG_METRICS,
  MSG_ANNOUNCE,
  MSG_CLIENT_RAW,
  MSG_GATEWAY_SEND,
  MSG_GATEWAY_SEND_BATCH,
  MSG_GATEWAY_CLOSE,
  MSG_CLIENT_DISCONNECT,
  MSG_WHISPER,
  MSG_PLAYER_UPDATE,
  MSG_PARTY,
  MSG_BORDER_GHOSTS,
  MSG_SESSION_RESTORE,
  MSG_CLUSTER_ONLINE,
  MSG_HEARTBEAT,
  IpcHub
};
