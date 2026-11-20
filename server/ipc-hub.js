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
const MSG_MOD_SYNC = 'IPC_MOD_SYNC';
const MSG_ACCOUNT_KEY_SYNC = 'IPC_ACCOUNT_KEY_SYNC';
const MSG_GM_SYNC = 'IPC_GM_SYNC';
const MSG_CHAR_DELETE_KICK = 'IPC_CHAR_DELETE_KICK';
const MSG_FRIEND = 'IPC_FRIEND';
const MSG_GM_ACTION = 'IPC_GM_ACTION';
const MSG_EDITOR_KEY_SYNC = 'IPC_EDITOR_KEY_SYNC';
const MSG_SPOTS_REBUILD = 'IPC_SPOTS_REBUILD';
const MSG_PLAYER_DB_SYNC = 'IPC_PLAYER_DB_SYNC';
const MSG_CLAN_OP = 'IPC_CLAN_OP';
const MSG_WORLD_TIME_SYNC = 'IPC_WORLD_TIME_SYNC';
const MSG_DETACH_ACK = 'IPC_DETACH_ACK';
const MSG_CHAR_DELETE_ACK = 'IPC_CHAR_DELETE_ACK';
const MSG_LOGIN_CLAIM = 'IPC_LOGIN_CLAIM';
const MSG_LOGIN_CLAIM_RES = 'IPC_LOGIN_CLAIM_RES';
const MSG_LOGIN_RELEASE = 'IPC_LOGIN_RELEASE';
const MSG_GUEST_TOKEN_SYNC = 'IPC_GUEST_TOKEN_SYNC';
// Файловая БД кластера: мастер — единственный писатель (воркер → запрос → ответ)
const MSG_DB_REQ = 'IPC_DB_REQ';
const MSG_DB_RES = 'IPC_DB_RES';

class IpcHub extends EventEmitter {
  constructor(opts) {
    super();
    this.opts = opts || {};
    this.isPrimary = !!this.opts.isPrimary;
    this.workerId = this.opts.workerId || 0;
    this.workers = new Map(); // workerId -> worker instance (only on Primary)
    this._pendingAcks = new Map(); // ackId -> { expected, received, timer, resolve }
    this._pendingLoginClaims = new Map(); // claimId -> { timer, resolve }
    this._pendingDbReqs = new Map(); // reqId -> { timer, resolve, reject }
    this._dbRequestHandler = null; // только на Primary: (op, args) => Promise
    this._ackSeq = 1;
    this.directory = new Map(); // yid -> { pid, name, online, workerId, charId, updatedAt }
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
      // Мастер умер / IPC закрыт: воркер не должен остаться сиротой с несохранёнными игроками.
      process.on('disconnect', () => {
        for (const [, entry] of self._pendingDbReqs) {
          clearTimeout(entry.timer);
          const e = new Error('primary disconnected');
          e.remote = false;
          try { entry.reject(e); } catch (_) { }
        }
        self._pendingDbReqs.clear();
        self.emit('primary_disconnect');
      });
    }
  }

  /**
   * Регистрация воркера (вызывается на Primary процессе).
   */
  registerWorker(workerId, workerProcess) {
    if (!this.isPrimary) return;
    const self = this;
    if (this.aggregatedMetrics && this.aggregatedMetrics.worldTime) {
      workerProcess._needsInitialTimeSync = true;
    }
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
      self._onWorkerExit(workerId);
      self.emit('worker_exit', workerId);
    });
  }

  _onWorkerExit(workerId) {
    if (this.aggregatedMetrics && Array.isArray(this.aggregatedMetrics.workers)) {
      const idx = this.aggregatedMetrics.workers.findIndex(w => w.workerId === workerId);
      if (idx >= 0) this.aggregatedMetrics.workers.splice(idx, 1);
    }
    if (this.directory) {
      for (const [yid, rec] of this.directory) {
        if (rec && (rec.workerId === workerId || rec.targetWorkerId === workerId)) {
          this.directory.delete(yid);
        }
      }
    }
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
      const w = this.workers.get(fromWorkerId);
      if (w && w._needsInitialTimeSync && this.aggregatedMetrics && this.aggregatedMetrics.worldTime) {
        w._needsInitialTimeSync = false;
        try {
          if (typeof w.isConnected !== 'function' || w.isConnected()) {
            w.send({ ipcType: MSG_WORLD_TIME_SYNC, payload: this.aggregatedMetrics.worldTime }, () => { });
          }
        } catch (_) { }
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
      this._updateDirectory(msg.payload);
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
          targetWorker.send(msg, () => { });
        } catch (_) { }
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

    // 10. Межворкерная синхронизация санкций модерации (P0-2)
    if (msg.ipcType === MSG_MOD_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('mod_sync', msg.payload);
      return;
    }

    // 11. Межворкерная синхронизация ключей аккаунтов (P0-2)
    if (msg.ipcType === MSG_ACCOUNT_KEY_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('account_key_sync', msg.payload);
      return;
    }

    // 12. Межворкерная синхронизация статуса GM и уровней доступа (P0-2)
    if (msg.ipcType === MSG_GM_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('gm_sync', msg.payload);
      return;
    }

    // 13. Сквозной кик и удаление персонажа из памяти воркера без перезаписи БД (CRIT-04)
    if (msg.ipcType === MSG_CHAR_DELETE_KICK) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('char_delete_kick', msg.payload);
      return;
    }

    if (msg.ipcType === MSG_DETACH_ACK || msg.ipcType === MSG_CHAR_DELETE_ACK) {
      this._handleAck(msg.payload, fromWorkerId);
      return;
    }

    // 14. Ретрансляция переходных пакетов client_raw после Handoff (гонка коннекта до обновления таблицы маршрутизации)
    if (msg.ipcType === MSG_CLIENT_RAW) {
      if (msg.targetWorkerId) {
        const targetWorker = this.workers.get(msg.targetWorkerId);
        if (targetWorker) {
          try {
            if (typeof targetWorker.isConnected !== 'function' || targetWorker.isConnected()) {
              targetWorker.send({
                ipcType: MSG_CLIENT_RAW,
                fromWorkerId: fromWorkerId,
                payload: msg.payload
              }, () => { });
            }
          } catch (_) { }
        }
      } else {
        this.emit('client_raw', msg.payload);
      }
      return;
    }

    // 15. Межворкерные события системы друзей (P1)
    if (msg.ipcType === MSG_FRIEND) {
      if (msg.targetWorkerId) {
        const targetWorker = this.workers.get(msg.targetWorkerId);
        if (targetWorker) {
          try {
            if (typeof targetWorker.isConnected !== 'function' || targetWorker.isConnected()) {
              targetWorker.send(msg, () => { });
            }
          } catch (_) { }
        }
      } else {
        this.broadcastToWorkers(msg, fromWorkerId);
      }
      this.emit('friend', msg.payload);
      return;
    }

    // 16. Межворкерные GM-команды (//kick, //ban, //goto, //recall, //mute, //info)
    if (msg.ipcType === MSG_GM_ACTION) {
      if (msg.targetWorkerId) {
        const targetWorker = this.workers.get(msg.targetWorkerId);
        if (targetWorker) {
          try {
            if (typeof targetWorker.isConnected !== 'function' || targetWorker.isConnected()) {
              targetWorker.send(msg, () => { });
            }
          } catch (_) { }
        }
      } else {
        this.broadcastToWorkers(msg, fromWorkerId);
      }
      this.emit('gm_action', msg.payload);
      return;
    }

    // 17. Синхронизация ключей редактора GM (Worker <-> MasterGateway)
    if (msg.ipcType === MSG_EDITOR_KEY_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('editor_key_sync', msg.payload);
      return;
    }

    // 18. Синхронизация пересборки спотов редактора
    if (msg.ipcType === MSG_SPOTS_REBUILD) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('spots_rebuild', msg.payload);
      return;
    }

    // 19. Межворкерная синхронизация реестра персонажей (PlayerDb)
    if (msg.ipcType === MSG_PLAYER_DB_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('player_db_sync', msg.payload);
      return;
    }

    // 20. Межворкерные операции кланов (/clan_invite, clan_status)
    if (msg.ipcType === MSG_CLAN_OP) {
      if (msg.targetWorkerId) {
        const targetWorker = this.workers.get(msg.targetWorkerId);
        if (targetWorker) {
          try {
            if (typeof targetWorker.isConnected !== 'function' || targetWorker.isConnected()) {
              targetWorker.send(msg, () => { });
            }
          } catch (_) { }
        }
      } else {
        this.broadcastToWorkers(msg, fromWorkerId);
      }
      this.emit('clan_op', msg.payload);
      return;
    }

    // 21. Межворкерная синхронизация мирового времени (set_time / set_time_pause)
    if (msg.ipcType === MSG_WORLD_TIME_SYNC) {
      if (this.aggregatedMetrics && msg.payload && typeof msg.payload === 'object') {
        this.aggregatedMetrics.worldTime = Object.assign({}, msg.payload);
      }
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('world_time_sync', msg.payload);
      return;
    }

    // 22. Координация кросс-воркерного логина (C-02)
    if (msg.ipcType === MSG_LOGIN_CLAIM) {
      this.emit('login_claim', Object.assign({ workerId: fromWorkerId }, msg.payload || {}));
      return;
    }
    if (msg.ipcType === MSG_LOGIN_RELEASE) {
      this.emit('login_release', Object.assign({ workerId: fromWorkerId }, msg.payload || {}));
      return;
    }

    // 24. Файловая БД: запрос воркера исполняет мастер (единая очередь записи)
    if (msg.ipcType === MSG_DB_REQ) {
      this._serveDbRequest(fromWorkerId, msg.payload);
      return;
    }

    // 23. Синхронизация гостевых токенов между Master и воркерами (C-03)
    if (msg.ipcType === MSG_GUEST_TOKEN_SYNC) {
      this.broadcastToWorkers(msg, fromWorkerId);
      this.emit('guest_token_sync', msg.payload);
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
    } else if (msg.ipcType === MSG_GATEWAY_CLOSE) {
      this.emit('gateway_close', msg.payload);
    } else if (msg.ipcType === MSG_WHISPER) {
      this.emit('whisper', msg.payload);
    } else if (msg.ipcType === MSG_PLAYER_UPDATE) {
      this._updateDirectory(msg.payload);
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
    } else if (msg.ipcType === MSG_MOD_SYNC) {
      this.emit('mod_sync', msg.payload);
    } else if (msg.ipcType === MSG_ACCOUNT_KEY_SYNC) {
      this.emit('account_key_sync', msg.payload);
    } else if (msg.ipcType === MSG_GM_SYNC) {
      this.emit('gm_sync', msg.payload);
    } else if (msg.ipcType === MSG_CHAR_DELETE_KICK) {
      this.emit('char_delete_kick', msg.payload);
    } else if (msg.ipcType === MSG_FRIEND) {
      this.emit('friend', msg.payload);
    } else if (msg.ipcType === MSG_GM_ACTION) {
      this.emit('gm_action', msg.payload);
    } else if (msg.ipcType === MSG_EDITOR_KEY_SYNC) {
      this.emit('editor_key_sync', msg.payload);
    } else if (msg.ipcType === MSG_SPOTS_REBUILD) {
      this.emit('spots_rebuild', msg.payload);
    } else if (msg.ipcType === MSG_PLAYER_DB_SYNC) {
      this.emit('player_db_sync', msg.payload);
    } else if (msg.ipcType === MSG_CLAN_OP) {
      this.emit('clan_op', msg.payload);
    } else if (msg.ipcType === MSG_WORLD_TIME_SYNC) {
      this.emit('world_time_sync', msg.payload);
    } else if (msg.ipcType === MSG_LOGIN_CLAIM_RES) {
      this._handleLoginClaimRes(msg.payload);
    } else if (msg.ipcType === MSG_DB_RES) {
      this._handleDbRes(msg.payload);
    } else if (msg.ipcType === MSG_GUEST_TOKEN_SYNC) {
      this.emit('guest_token_sync', msg.payload);
    } else {
      this.emit('message', msg);
    }
  }

  _updateDirectory(payload) {
    if (!payload || payload.yid == null) return;
    const strYid = String(payload.yid);
    if (payload.online) {
      this.directory.set(strYid, payload);
    } else {
      this.directory.delete(strYid);
    }
  }

  isPlayerOnline(yid) {
    if (!yid) return false;
    const p = this.directory.get(String(yid));
    return Boolean(p && p.online);
  }

  getPlayer(yid) {
    if (!yid) return null;
    return this.directory.get(String(yid)) || null;
  }

  findPlayerByName(name) {
    const want = String(name || '').trim().toLowerCase();
    if (!want) return null;
    for (const rec of this.directory.values()) {
      if (rec && rec.online && rec.name && String(rec.name).toLowerCase() === want) {
        return rec;
      }
    }
    return null;
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
    this.aggregatedMetrics.lastTickAt = Date.now();
    if (m && m.worldTime) {
      this.aggregatedMetrics.worldTime = m.worldTime;
    }

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
        worker.send(msg, () => { });
      } catch (_) { }
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

  broadcastModSync(action, target, payload) {
    const p = { action, target, payload: payload || null, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_MOD_SYNC, payload: p });
      this.emit('mod_sync', p);
    } else {
      this.sendToPrimary(MSG_MOD_SYNC, p);
    }
  }

  broadcastAccountKeySync(accountData) {
    const payload = Object.assign({ sentAt: Date.now() }, accountData || {});
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_ACCOUNT_KEY_SYNC, payload });
      this.emit('account_key_sync', payload);
    } else {
      this.sendToPrimary(MSG_ACCOUNT_KEY_SYNC, payload);
    }
  }

  broadcastGmSync(yidOrObj, maybeLevel) {
    const gmData = (typeof yidOrObj === 'string')
      ? { yid: yidOrObj, accessLevel: maybeLevel }
      : (yidOrObj || {});
    const payload = Object.assign({ sentAt: Date.now() }, gmData);
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_GM_SYNC, payload });
      this.emit('gm_sync', payload);
    } else {
      this.sendToPrimary(MSG_GM_SYNC, payload);
    }
  }

  _nextAckId(prefix) {
    return `${prefix || 'ack'}_${Date.now()}_${this._ackSeq++}`;
  }

  _handleAck(payload, fromWorkerId) {
    if (!payload || !payload.ackId) return;
    const entry = this._pendingAcks.get(payload.ackId);
    if (!entry) return;
    const wKey = payload.workerId != null ? String(payload.workerId) : String(fromWorkerId || 'worker');
    entry.received.add(wKey);
    if (entry.received.size >= entry.expected) {
      clearTimeout(entry.timer);
      this._pendingAcks.delete(payload.ackId);
      entry.resolve(true);
    }
  }

  _waitForAck(ackId, expectedCount, timeoutMs) {
    if (!expectedCount || expectedCount <= 0) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pendingAcks.delete(ackId);
        resolve(false);
      }, timeoutMs || 1500);
      if (timer && timer.unref) timer.unref();
      this._pendingAcks.set(ackId, {
        expected: expectedCount,
        received: new Set(),
        timer,
        resolve
      });
    });
  }

  broadcastCharDeleteKick(yid, charId, ackId) {
    const payload = { yid: String(yid), charId: charId || null, ackId: ackId || null, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_CHAR_DELETE_KICK, payload });
      this.emit('char_delete_kick', payload);
    } else {
      this.sendToPrimary(MSG_CHAR_DELETE_KICK, payload);
    }
  }

  async broadcastCharDeleteKickWait(yid, charId, timeoutMs) {
    if (!this.isPrimary || this.workers.size === 0) {
      this.broadcastCharDeleteKick(yid, charId, null);
      return true;
    }
    const ackId = this._nextAckId('del');
    const waitP = this._waitForAck(ackId, this.workers.size, timeoutMs || 1500);
    this.broadcastCharDeleteKick(yid, charId, ackId);
    return waitP;
  }

  async requestDetachPidWait(pid, targetWorkerId, timeoutMs, yid) {
    if (!this.isPrimary || this.workers.size === 0) {
      this.sendGmAction({ action: 'detach_pid', pid, yid: yid || null }, targetWorkerId || null);
      return true;
    }
    const hasTarget = targetWorkerId != null && this.workers.has(targetWorkerId);
    if (targetWorkerId != null && !hasTarget) return true;
    const ackId = this._nextAckId('det');
    const expected = hasTarget ? 1 : this.workers.size;
    const waitP = this._waitForAck(ackId, expected, timeoutMs || 1500);
    this.sendGmAction({ action: 'detach_pid', pid, yid: yid || null, ackId }, hasTarget ? targetWorkerId : null);
    return waitP;
  }

  _handleLoginClaimRes(payload) {
    if (!payload || !payload.claimId) return;
    const entry = this._pendingLoginClaims.get(payload.claimId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this._pendingLoginClaims.delete(payload.claimId);
    entry.resolve(payload);
  }

  /** Запрос атомарного кросс-воркерного лока и синхронного вытеснения старой сессии (C-02). */
  claimClusterLogin(yid, connId, timeoutMs) {
    if (this.isPrimary) return Promise.resolve({ ok: true, claimId: null });
    const claimId = this._nextAckId('lcl');
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this._pendingLoginClaims.delete(claimId);
        resolve({ ok: false, claimId, reason: 'login_timeout' });
      }, timeoutMs || 4500);
      if (timer && timer.unref) timer.unref();
      this._pendingLoginClaims.set(claimId, { timer, resolve });
      this.sendToPrimary(MSG_LOGIN_CLAIM, {
        claimId,
        yid: String(yid),
        connId: connId != null ? connId : null
      });
    });
  }

  /** Ответ Primary на запрос кросс-воркерного логина (C-02). */
  replyLoginClaim(workerId, payload) {
    if (!this.isPrimary) return;
    const w = this.workers.get(workerId);
    if (!w) return;
    try {
      if (typeof w.isConnected === 'function' && !w.isConnected()) return;
      w.send({ ipcType: MSG_LOGIN_CLAIM_RES, targetWorkerId: workerId, payload: payload || {} }, () => { });
    } catch (_) { }
  }

  /** Primary: обработчик файловых операций БД от воркеров ((op, args) => Promise). */
  setDbRequestHandler(fn) {
    this._dbRequestHandler = typeof fn === 'function' ? fn : null;
  }

  _serveDbRequest(workerId, payload) {
    if (!this.isPrimary || !payload || !payload.reqId) return;
    const reply = (res) => {
      const w = this.workers.get(workerId);
      if (!w) return; // воркер умер — запись всё равно выполнена мастером
      try {
        if (typeof w.isConnected === 'function' && !w.isConnected()) return;
        w.send({ ipcType: MSG_DB_RES, targetWorkerId: workerId, payload: Object.assign({ reqId: payload.reqId }, res) }, () => { });
      } catch (_) { }
    };
    if (!this._dbRequestHandler) {
      reply({ ok: false, transport: true, error: 'db handler not ready' });
      return;
    }
    if (process.env.DEBUG_DB_PROXY === '1') {
      const a0 = Array.isArray(payload.args) && payload.args.length ? payload.args[0] : '';
      console.log('[DB-PROXY] worker#' + workerId + ' ' + payload.op + ' ' + (typeof a0 === 'object' ? (a0 && a0.id) || '' : String(a0)).slice(0, 64));
    }
    let p;
    try { p = Promise.resolve(this._dbRequestHandler(payload.op, payload.args)); }
    catch (e) { p = Promise.reject(e); }
    p.then(
      (result) => reply({ ok: true, result: result === undefined ? null : result }),
      (e) => reply({ ok: false, error: (e && e.message) || String(e), code: (e && e.code) || null })
    );
  }

  _handleDbRes(payload) {
    if (!payload || !payload.reqId) return;
    const entry = this._pendingDbReqs.get(payload.reqId);
    if (!entry) return;
    clearTimeout(entry.timer);
    this._pendingDbReqs.delete(payload.reqId);
    if (payload.ok) { entry.resolve(payload.result); return; }
    const err = new Error(payload.error || 'db request failed');
    if (payload.code) err.code = payload.code;
    // remote=true — ошибка бэкенда мастера (битый профиль и т.п.): её нельзя глушить локальным фоллбэком
    err.remote = !payload.transport;
    entry.reject(err);
  }

  /**
   * Воркер: выполнить файловую операцию БД в мастере. Отклоняется с remote=false при
   * отсутствии IPC-канала или таймауте (вызывающий делает локальный фоллбэк).
   */
  dbRequest(op, args, timeoutMs) {
    if (this.isPrimary || typeof process.send !== 'function' || (typeof process.connected === 'boolean' && !process.connected)) {
      const e = new Error('no ipc channel to primary');
      e.remote = false;
      return Promise.reject(e);
    }
    const reqId = this._nextAckId('db');
    const isRead = /^(load|list)/.test(String(op));
    const ms = timeoutMs || (isRead ? 15000 : 30000);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingDbReqs.delete(reqId);
        const e = new Error('db request timeout: ' + op);
        e.remote = false;
        reject(e);
      }, ms);
      if (timer && timer.unref) timer.unref();
      this._pendingDbReqs.set(reqId, { timer, resolve, reject });
      try {
        this.sendToPrimary(MSG_DB_REQ, { reqId, op: String(op), args: Array.isArray(args) ? args : [] });
      } catch (sendErr) {
        clearTimeout(timer);
        this._pendingDbReqs.delete(reqId);
        const e = new Error('ipc send failed: ' + (sendErr && sendErr.message));
        e.remote = false;
        reject(e);
      }
    });
  }

  /** Освободить кросс-воркерный лок после завершения doLogin (C-02). */
  releaseClusterLogin(yid, claimId) {
    if (this.isPrimary || !claimId) return;
    this.sendToPrimary(MSG_LOGIN_RELEASE, { yid: String(yid), claimId });
  }

  /** Синхронизация гостевых токенов между MasterGateway и Zone Workers (C-03). */
  broadcastGuestTokenSync(payload) {
    const p = Object.assign({ sentAt: Date.now() }, payload || {});
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_GUEST_TOKEN_SYNC, payload: p });
      this.emit('guest_token_sync', p);
    } else {
      this.sendToPrimary(MSG_GUEST_TOKEN_SYNC, p);
    }
  }

  sendFriendIpc(payload, targetWorkerId) {
    const p = Object.assign({ sentAt: Date.now() }, payload || {});
    if (this.isPrimary) {
      if (targetWorkerId != null) {
        const w = this.workers.get(targetWorkerId);
        if (w) {
          try { w.send({ ipcType: MSG_FRIEND, targetWorkerId, payload: p }, () => { }); } catch (_) { }
        }
      } else {
        this.broadcastToWorkers({ ipcType: MSG_FRIEND, payload: p });
        this.emit('friend', p);
      }
    } else {
      this.sendToPrimary(MSG_FRIEND, p, targetWorkerId);
    }
  }

  sendGmAction(payload, targetWorkerId) {
    const p = Object.assign({ sentAt: Date.now() }, payload || {});
    if (this.isPrimary) {
      if (targetWorkerId != null) {
        const w = this.workers.get(targetWorkerId);
        if (w) {
          try { w.send({ ipcType: MSG_GM_ACTION, targetWorkerId, payload: p }, () => { }); } catch (_) { }
        }
      } else {
        this.broadcastToWorkers({ ipcType: MSG_GM_ACTION, payload: p });
        this.emit('gm_action', p);
      }
    } else {
      this.sendToPrimary(MSG_GM_ACTION, p, targetWorkerId);
    }
  }

  syncEditorKey(action, payload) {
    const p = Object.assign({ action, sentAt: Date.now() }, payload || {});
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_EDITOR_KEY_SYNC, payload: p });
      this.emit('editor_key_sync', p);
    } else {
      this.sendToPrimary(MSG_EDITOR_KEY_SYNC, p);
    }
  }

  broadcastSpotsRebuild(opts) {
    const p = Object.assign({ sentAt: Date.now() }, opts || {});
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_SPOTS_REBUILD, payload: p });
      this.emit('spots_rebuild', p);
    } else {
      this.sendToPrimary(MSG_SPOTS_REBUILD, p);
    }
  }

  broadcastPlayerDbSync(action, data) {
    const payload = { action, data, sentAt: Date.now() };
    if (this.isPrimary) {
      this.broadcastToWorkers({ ipcType: MSG_PLAYER_DB_SYNC, payload });
      this.emit('player_db_sync', payload);
    } else {
      this.sendToPrimary(MSG_PLAYER_DB_SYNC, payload);
    }
  }

  sendClanIpc(payload, targetWorkerId) {
    const p = Object.assign({ sentAt: Date.now() }, payload || {});
    if (this.isPrimary) {
      if (targetWorkerId != null) {
        const w = this.workers.get(targetWorkerId);
        if (w) {
          try { w.send({ ipcType: MSG_CLAN_OP, targetWorkerId, payload: p }, () => { }); } catch (_) { }
        }
      } else {
        this.broadcastToWorkers({ ipcType: MSG_CLAN_OP, payload: p });
        this.emit('clan_op', p);
      }
    } else {
      this.sendToPrimary(MSG_CLAN_OP, p, targetWorkerId);
    }
  }

  broadcastWorldTimeSync(payload) {
    if (!payload) return;
    if (this.isPrimary) {
      if (this.aggregatedMetrics) {
        this.aggregatedMetrics.worldTime = Object.assign({}, payload);
      }
      this.broadcastToWorkers({ ipcType: MSG_WORLD_TIME_SYNC, payload });
      this.emit('world_time_sync', payload);
    } else {
      this.sendToPrimary(MSG_WORLD_TIME_SYNC, payload);
    }
  }
}

module.exports = {
  MSG_CHAT,
  MSG_CLAN,
  MSG_CLAN_SYNC,
  MSG_CLAN_OP,
  MSG_WORLD_TIME_SYNC,
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
  MSG_MOD_SYNC,
  MSG_ACCOUNT_KEY_SYNC,
  MSG_GM_SYNC,
  MSG_CHAR_DELETE_KICK,
  MSG_CHAR_DELETE_ACK,
  MSG_DETACH_ACK,
  MSG_LOGIN_CLAIM,
  MSG_LOGIN_CLAIM_RES,
  MSG_LOGIN_RELEASE,
  MSG_GUEST_TOKEN_SYNC,
  MSG_DB_REQ,
  MSG_DB_RES,
  MSG_FRIEND,
  MSG_GM_ACTION,
  MSG_EDITOR_KEY_SYNC,
  MSG_SPOTS_REBUILD,
  MSG_PLAYER_DB_SYNC,
  IpcHub
};
