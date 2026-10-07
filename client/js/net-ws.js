// JS / NET-WS.JS — тонкий realtime-клиент. Шлёт намерения, рисует правду сервера.
class NetWS {
  constructor(url) {
    this.url = (url || '').replace(/:\d+(\/|$)/, (m, p) => m.indexOf('3000') !== -1 ? m : (p || '')); this.ws = null; this.pid = null; this.region = null; this.connected = false;
    this.serverSelf = null;
    this.remote = new Map(); this.predict = { x: 0, z: 0 }; this.seq = 0; this.moveAcc = 0; this.reconnect = 1000;
    this._d = ''; this._s = ''; this.party = [];
    this.status = 'idle'; this.attempts = 0; this.welcomeTimer = null; this._stopped = false;
    this._retryTimer = null;
    this._outQueue = [];
    this._fatalClose = 0;
    this.clan = null;
    this.clanCrest = null;
    this._clanCrests = Object.create(null);
    this._spawnQueue = [];
    this._mobNameTexCache = new Map();
    this._playerNameTexCache = new Map();
    /** true = connectFromMenu: ждать welcome, иначе reject */
    this._menuConnect = false;
    this._welcomeWaiters = [];
    this._failWaiters = [];

    // Instant offline cleanup when tab or browser closes
    const fastClose = () => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.close(1000, 'logout'); } catch (e) {}
      }
    };
    window.addEventListener('beforeunload', fastClose);
    window.addEventListener('pagehide', fastClose);
  }
  _readSelectedChar() {
    try {
      const raw = sessionStorage.getItem('ps_selected_char') || localStorage.getItem('ps_selected_char');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  async connect(ysdk) {
    this._lastYsdk = ysdk;
    let data = '', signature = '';
    const ch = this._readSelectedChar();
    this._charPayload = ch ? {
      name: ch.name,
      race: ch.race || 'human',
      gender: ch.gender || 'male',
      cls: ch.cls || 'operator',
      charId: ch.id,
      appearance: ch.appearance || null
    } : null;
    try { const pl = await ysdk.getPlayer({ scopes: false }); const s = await pl.getSignedData(); data = s.data; signature = s.signature; }
      let lid = sessionStorage.getItem('ps_local_id') || localStorage.getItem('ps_local_id');
      if (!lid) {
        lid = Math.random().toString(36).slice(2);
        try {
          localStorage.setItem('ps_local_id', lid);
          sessionStorage.setItem('ps_local_id', lid);
        } catch (_) {}
      }
      let ltoken = sessionStorage.getItem('ps_guest_token') || localStorage.getItem('ps_guest_token');
      if (!ltoken) {
        ltoken = (typeof crypto !== 'undefined' && crypto.randomUUID)
          ? crypto.randomUUID()
          : (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
        try {
          localStorage.setItem('ps_guest_token', ltoken);
          sessionStorage.setItem('ps_guest_token', ltoken);
        } catch (_) {}
      }
      let tab = sessionStorage.getItem('ps_tab'); if (!tab) { tab = Math.random().toString(16).slice(2, 6); sessionStorage.setItem('ps_tab', tab); }
      let publicName = 'Operator-' + tab;
      if (ch && ch.name) publicName = String(ch.name).slice(0, 16);
      const payload = {
        uniqueID: 'local_' + lid,
        guestToken: ltoken,
        publicName: publicName,
        race: (ch && ch.race) || 'human',
        gender: (ch && ch.gender) || 'male',
        cls: (ch && ch.cls) || 'operator',
        charId: ch && ch.id,
        appearance: (ch && ch.appearance) || null
      };
      // UTF-8 safe base64 (кириллица в имени)
      try {
        data = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, '');
      } catch (err2) {
        data = btoa(JSON.stringify({
          uniqueID: 'local_' + lid,
          guestToken: ltoken,
          publicName: String(publicName).replace(/[^\w\-]/g, '').slice(0, 16) || 'Operator',
          race: payload.race, gender: payload.gender, cls: payload.cls, charId: payload.charId,
          appearance: payload.appearance
        })).replace(/=+$/, '');
      }
    }
    this._d = data; this._s = signature; this._open();
  }
  /**
   * Подключение с title screen: resolve на welcome, reject при ошибке/таймауте.
   */
  connectFromMenu(ysdk) {
    this._menuConnect = true;
    this._stopped = false;
    this.attempts = 0;
    this.reconnect = 1000;
    return new Promise(async (resolve, reject) => {
      this._welcomeWaiters.push(resolve);
      this._failWaiters.push(reject);
      try {
        await this.connect(ysdk || null);
      } catch (e) {
        this._rejectMenu(e || new Error('connect failed'));
      }
    });
  }
  _resolveMenu() {
    const w = this._welcomeWaiters.splice(0);
    this._failWaiters.length = 0;
    this._menuConnect = false;
    w.forEach(fn => { try { fn(); } catch (e) {} });
  }
  _rejectMenu(err) {
    const f = this._failWaiters.splice(0);
    this._welcomeWaiters.length = 0;
    this._menuConnect = false;
    f.forEach(fn => { try { fn(err || new Error('connect failed')); } catch (e) {} });
  }
  disconnect() {
    this._stopped = true;
    this._menuConnect = false;
    this._welcomeWaiters.length = 0;
    this._failWaiters.length = 0;
    if (this.welcomeTimer) { clearTimeout(this.welcomeTimer); this.welcomeTimer = null; }
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._outQueue) this._outQueue.length = 0;
    this._hideReconnectOverlay();
    try { if (this.ws) this.ws.close(); } catch (e) {}
    this.ws = null;
    this.connected = false;
    this.status = 'idle';
    this.clearRemote && this.clearRemote();
    this._updateStatus();
  }
  tickHeartbeat() {
    if (!this.connected || !this.ws || this.ws.readyState !== 1 || this.status !== 'online') return;
    const now = Date.now();
    if (!this._lastPingSent || now - this._lastPingSent >= 8000) {
      this._lastPingSent = now;
      try { this.ws.send(JSON.stringify({ t: 'ping', time: now })); } catch (_) {}
    }
    // Детекция замерзшего / оборванного соединения (Connection Watchdog)
    if (this._lastServerMsgAt && (now - this._lastServerMsgAt > 15000)) {
      console.warn('[net-ws] Сокет замерз (нет пакетов от сервера > 15с). Немедленное переподключение...');
      this._lastServerMsgAt = now;
      try { this.ws.close(4001, 'heartbeat freeze timeout'); } catch (_) {}
    }
  }
  _open() {
    if (this._stopped) return;
    this.status = 'connecting'; this._updateStatus();
    try {
      if (this.url && this.url.indexOf('localhost:3000') === -1) {
        this.url = this.url.replace(/:\d+(\/|$)/, '$1');
      }
      if (this.url) {
        this.url = this.url.replace(/(?:93\.77\.168\.135(?:\.sslip\.io)+)/g, '93.77.168.135.sslip.io');
        if (location.protocol === 'https:') {
          this.url = this.url.replace(/^ws:\/\//i, 'wss://');
          this.url = this.url.replace(/wss:\/\/93\.77\.168\.135(?!\.sslip\.io)/, 'wss://93.77.168.135.sslip.io');
        }
      }
      this.ws = new WebSocket(this.url);
      this.ws.binaryType = 'arraybuffer';
    } catch (e) {
      this._onServerLost('Не удалось создать сокет: ' + (e && e.message));
      return;
    }
    this.ws.onopen = () => {
      this.connected = true; this.attempts = 0; this.reconnect = 1000;
      this.status = 'online-pending'; this._updateStatus();
      this._hideReconnectOverlay();

      // 1. ПЕРВЫМ пакетом всегда отправляется строго loginMsg
      const loginMsg = { t: 'login', data: this._d, signature: this._s, binary: true };
      if (this._charPayload) loginMsg.char = this._charPayload;
      this.ws.send(JSON.stringify(loginMsg));
      this._flushQueue();

      // 2. Heartbeat запускается только после отправки логина и шлет ping только когда status === 'online'
      if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = setInterval(() => {
        this.tickHeartbeat();
      }, 8000);

      // 20 секунд на загрузку 3D мира и обработку пакета welcome
      this.welcomeTimer = setTimeout(() => {
        if (this.status !== 'online') {
          console.warn('[net-ws] welcome timeout after 20s');
          this._onServerLost('Превышено время ожидания ответа сервера (20с)');
        }
      }, 20000);
    };
    this.ws.onmessage = e => {
      this._lastServerMsgAt = Date.now();
      if (e.data instanceof ArrayBuffer) {
        const NPB = window.NET_PACK_BINARY;
        if (NPB) {
          const opcode = NPB.getOpcode(e.data);
          if (opcode === NPB.OP_UPD) {
            NPB.decodeUpd(e.data, (k, x, z, hp) => {
              this.updateRemote(k, x, z, hp);
            });
            return;
          }
          if (opcode === NPB.OP_MOVE_VEC_START) {
            const mv = NPB.decodeMoveVecStart(e.data);
            if (mv) this.handleMoveVecStart(mv);
            return;
          }
          if (opcode === NPB.OP_MOVE_VEC_STOP) {
            const ms = NPB.decodeMoveVecStop(e.data);
            if (ms) this.handleMoveVecStop(ms);
            return;
          }
        }
        return;
      }
      if (!e.data || (typeof e.data === 'string' && !e.data.trim())) return;
      try { this.onMessage(JSON.parse(e.data)); }
      catch (err) { console.error('[net] пакет не обработан:', err, String(e.data).slice(0, 200)); }
    };
    this.ws.onclose = (ev) => {
      console.warn('[net] сокет закрыт, code:', ev && ev.code, 'reason:', ev && ev.reason);
      if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
      this.connected = false; this.clearRemote();
      if (this.welcomeTimer) { clearTimeout(this.welcomeTimer); this.welcomeTimer = null; }
      if (this._stopped) return;

      // Если сервер закрыл с кодом 4009 ('login in progress'), значит предыдущая сессия еще завершается
      // Делаем мгновенный retry через 250мс без накопления штрафных задержек
      if (ev && ev.code === 4009) {
        this.status = 'reconnecting'; this._updateStatus();
        this._retryTimer = setTimeout(() => this._open(), 250);
        return;
      }

      // Обработка 4003 (bad guest token): рассинхрон гостевого токена с базой данных сервера.
      // Автоматически очищаем устаревший guest-профиль и повторяем вход с чистым токеном.
      if (ev && ev.code === 4003) {
        const hasKey = localStorage.getItem('ps_has_key') === 'true';
        if (!hasKey) {
          try {
            localStorage.removeItem('ps_local_id');
            localStorage.removeItem('ps_guest_token');
          } catch (_) {}
        }
        if (!this._retriedGuestToken) {
          this._retriedGuestToken = true;
          console.warn('[net] Токен гостя рассинхронизирован (4003). Повторный вход...');
          setTimeout(() => {
            this.connect(this._lastYsdk || null);
          }, 150);
          return;
        }
      }

      // Сервер закрыл осознанно — переподключаться бессмысленно
      const fatal = ev && (ev.code === 4003 || ev.code === 4004 || ev.code === 4005 ||
        ev.code === 4008 || ev.code === 4010 || ev.code === 4011 || ev.code === 4012);
      if (fatal) { this._fatalClose = ev.code; this._onServerLost(); return; }

      this.attempts++;
      if (this.attempts > NetWS.MAX_RECONNECT) { this._onServerLost(); return; }

      // Экспоненциальный backoff с джиттером: 1, 2, 4, 8, 16 с
      const base = Math.min(NetWS.RECONNECT_MAX_MS, this.reconnect * (this.attempts > 1 ? 2 : 1));
      this.reconnect = base;
      const delay = Math.round(base * (0.75 + Math.random() * 0.5));
      this.status = 'reconnecting'; this._updateStatus();
      this._showReconnectOverlay(this.attempts, NetWS.MAX_RECONNECT, delay);
      this._retryTimer = setTimeout(() => this._open(), delay);
    };
    this.ws.onerror = () => {};
  }
  /** Потеря связи: reject меню или goToMenuPage. Игра без сервера не продолжается. */
  _onServerLost(reason) {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    this._stopped = true; this.status = 'disconnected'; this._updateStatus();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    if (this._menuConnect || this._failWaiters.length) {
      this._rejectMenu(new Error(reason || 'server unavailable'));
      if (this.ws) { try { this.ws.close(); } catch (e) {} }
      return;
    }
    // Раньше игрока молча выбрасывало в menu.html: бейдж «нет связи» не успевал
    // отрисоваться. Теперь показываем причину и даём кнопку.
    this._showLostOverlay(this._fatalClose, reason);
  }
  _updateStatus() { if (window.game && window.game.ui && window.game.ui.setNetStatus) window.game.ui.setNetStatus(this.status); }

  // ---- Оверлей соединения ----
  _netOverlay() {
    let el = document.getElementById('net-overlay');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'net-overlay';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-live', 'assertive');
    el.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;' +
      'justify-content:center;background:rgba(0,0,0,.72);backdrop-filter:blur(2px);' +
      'font-family:"Segoe UI",system-ui,sans-serif;color:#e8e2d0';
    el.innerHTML =
      '<div style="min-width:min(420px,92vw);padding:26px 30px;border:1px solid #6b5a33;' +
      'border-radius:6px;background:linear-gradient(#1b1710,#120f0a);box-shadow:0 12px 40px rgba(0,0,0,.6);text-align:center">' +
      '<div id="net-overlay-title" style="font-size:19px;font-weight:600;color:#ffe066;margin-bottom:10px"></div>' +
      '<div id="net-overlay-text" style="font-size:14px;line-height:1.5;opacity:.9;margin-bottom:18px"></div>' +
      '<div id="net-overlay-actions"></div></div>';
    document.body.appendChild(el);
    return el;
  }
  _showReconnectOverlay(attempt, max, delayMs) {
    if (typeof document === 'undefined') return;
    const el = this._netOverlay();
    el.style.display = 'flex';
    el.querySelector('#net-overlay-title').textContent = 'Соединение потеряно';
    el.querySelector('#net-overlay-text').textContent =
      'Переподключение… попытка ' + attempt + ' из ' + max +
      ' (через ' + Math.round(delayMs / 100) / 10 + ' с)';
    const act = el.querySelector('#net-overlay-actions');
    if (!act.dataset.wired) {
      act.dataset.wired = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'В меню';
      btn.style.cssText = 'padding:8px 22px;border:1px solid #6b5a33;border-radius:4px;' +
        'background:#2a2318;color:#e8e2d0;font-size:14px;cursor:pointer';
      btn.addEventListener('click', () => { this._stopped = true; this._goMenu(); });
      act.appendChild(btn);
    }
  }
  _hideReconnectOverlay() {
    if (typeof document === 'undefined') return;
    const el = document.getElementById('net-overlay');
    if (el) el.style.display = 'none';
  }
  _showLostOverlay(code) {
    if (typeof document === 'undefined') return this._goMenu();
    const reasons = {
      4003: 'Подпись входа не принята сервером.',
      4008: 'Выполнен вход с другого устройства.',
      4010: 'Профиль персонажа повреждён. Обратитесь к администратору.',
      4012: 'Аккаунт заблокирован.'
    };
    const el = this._netOverlay();
    el.style.display = 'flex';
    el.querySelector('#net-overlay-title').textContent = 'Нет связи с сервером';
    el.querySelector('#net-overlay-text').textContent =
      reasons[code] || 'Не удалось восстановить соединение после ' + NetWS.MAX_RECONNECT + ' попыток.';
    const act = el.querySelector('#net-overlay-actions');
    act.innerHTML = '';
    act.dataset.wired = '';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Вернуться в меню';
    btn.autofocus = true;
    btn.style.cssText = 'padding:9px 24px;border:1px solid #6b5a33;border-radius:4px;' +
      'background:#3a2f1c;color:#ffe066;font-size:14px;cursor:pointer';
    btn.addEventListener('click', () => this._goMenu());
    act.appendChild(btn);
    try { btn.focus(); } catch (e) {}
  }
  _goMenu() {
    if (typeof this.onServerLost === 'function') { try { this.onServerLost(); return; } catch (e) {} }
    if (window.game && typeof window.game.goToMenuPage === 'function') { window.game.goToMenuPage(); return; }
    try { location.replace('menu.html'); } catch (e) {}
  }

  /** Исходящие при закрытом сокете: очередь вместо тихой потери интента. */
  _flushQueue() {
    if (!this._outQueue || !this._outQueue.length) return;
    const q = this._outQueue.splice(0);
    for (const o of q) {
      if (!this.ws || this.ws.readyState !== 1) { this._outQueue = q; return; }
      o.seq = ++this.seq;
      try { this.ws.send(JSON.stringify(o)); } catch (e) { break; }
    }
  }
  send(o) {
    if (this.ws && this.ws.readyState === 1) {
      o.seq = ++this.seq;
      this.ws.send(JSON.stringify(o));
      return true;
    }
    // move/pose устаревают мгновенно — их копить бессмысленно
    if (o && (o.t === 'move' || o.t === 'pose')) return false;
    if (!this._outQueue) this._outQueue = [];
    if (this._outQueue.length < NetWS.QUEUE_MAX) this._outQueue.push(o);
    return false;
  }
  intentMove(x, z, destX, destZ) {
    this.predict.x = x; this.predict.z = z;
    const g = window.game;
    const walking = !!(g && g.player && g.player.isWalking);
    const NPB = window.NET_PACK_BINARY;
    if (NPB && this.ws && this.ws.readyState === 1) {
      this.seq = (this.seq + 1) & 0xffff;
      const bin = NPB.encodeMove(x, z, walking, this.seq, destX, destZ);
      this.ws.send(bin);
      return;
    }
    const msg = { t: 'move', x, z, walking: walking };
    if (destX != null && destZ != null && Number.isFinite(+destX) && Number.isFinite(+destZ)) {
      msg.destX = +destX;
      msg.destZ = +destZ;
    }
    this.send(msg);
  }
  /** L2 pose for server HP/MP regen: sitting / walking */
  intentPose(flags) {
    flags = flags || {};
    const msg = { t: 'pose' };
    if (flags.sitting != null) msg.sitting = !!flags.sitting;
    if (flags.walking != null) msg.walking = !!flags.walking;
    this.send(msg);
  }
  /** Позиция из F2-редактора: без anti-speed clamp на сервере, пишет профиль. */
  intentEditorSetPos(x, z) {
    this.predict.x = x; this.predict.z = z;
    this._setServerSelf(x, z);
    this.send({ t: 'editor_set_pos', x, z });
  }
  intentAttack(mid, ranged) { this.send({ t: 'attack', mid, ranged: !!ranged }); }
  intentEquip(slot, templateId, plus) {
    // Уровни приборов (circuitLevel / shellIndex / nanoLevel / casingIndex)
    // намеренно НЕ отправляются: сервер хранит их в профиле и присылает обратно.
    this.send({ t: 'equip', slot: slot, templateId: templateId, plus: plus || 0 });
  }
  intentUnequip(slot) {
    this.send({ t: 'unequip', slot: slot });
  }
  /** Прокачка прибора инженера: circuit | shell | nano | casing (авторитет сервера). */
  intentDeviceUpgrade(track) {
    this.send({ t: 'device_upgrade', track: String(track || '') });
  }
  /** Применить combat-статы с сервера (после equip / welcome). */
  _applyWeight(m) {
    const g = window.game;
    if (!m || !g || !g.inventory) return;
    if (m.weight != null) g.inventory.weight = m.weight | 0;
    if (m.maxWeight != null) g.inventory.maxWeight = m.maxWeight | 0;
    if (g.inventoryUI && typeof g.inventoryUI.renderFooter === 'function') {
      g.inventoryUI.renderFooter();
    } else if (g.inventoryUI && typeof g.inventoryUI.render === 'function') {
      g.inventoryUI.render();
    }
  }
  applyCombatStats(m) {
    const g = window.game;
    if (!g || !g.player || !m) return;
    const p = g.player;
    if (m.pAtk != null) p.pAtk = m.pAtk;
    if (m.pDef != null) p.pDef = m.pDef;
    if (m.cAtk != null) { p.cAtk = m.cAtk; p.mAtk = m.cAtk; }
    if (m.cDef != null) { p.cDef = m.cDef; p.mDef = m.cDef; }
    if (m.accuracy != null) p.accuracy = m.accuracy;
    if (m.evasion != null) p.evasion = m.evasion;
    if (m.critRate != null) { p.critRate = m.critRate; p.critChance = m.critRate / 100; }
    if (m.maxHp != null) {
      const ratio = p.maxHp > 0 ? p.hp / p.maxHp : 1;
      p.maxHp = m.maxHp;
      if (m.hp != null) p.hp = m.hp;
      else p.hp = Math.min(p.maxHp, Math.floor(p.maxHp * ratio));
    }
    if (m.maxEnergy != null) {
      const er = p.maxEnergy > 0 ? p.energy / p.maxEnergy : 1;
      p.maxEnergy = m.maxEnergy;
      if (m.energy != null) p.energy = m.energy;
      else p.energy = Math.min(p.maxEnergy, Math.floor(p.maxEnergy * er));
    }
    if (m.primary) p.primary = m.primary;
    if (m.weaponClass) p.weaponClass = m.weaponClass;
    // Скорость атаки — авторитет сервера. Клиент считает её и сам
    // (pullL2Stats по тем же формулам), но при расхождении часть ударов
    // отбрасывалась серверным кулдауном молча.
    if (m.atkSpdL2 > 0) {
      p.atkSpdL2 = m.atkSpdL2;
      p.atkSpeed = m.atkSpdL2 / 333;
    }
    if (m.atkIntervalMs > 0) p.atkIntervalMs = m.atkIntervalMs;
    if (m.speed != null) {
      p.moveSpeed = m.speed;
      p._baseMoveSpeed = m.speedBase || (m.speed / (p.isWalking ? 0.55 : 1.0));
      if (p.isWalking) p.moveSpeed = p._baseMoveSpeed * 0.55;
    }
    if (m.speedL2 != null) p.speedL2 = m.speedL2;
    if (m.critDamage != null) p.critDamage = m.critDamage;
    if (m.vampiric != null) p.vampiric = m.vampiric;
    if (m.stunResist != null) p.stunResist = m.stunResist;
    if (m.hpRegenFlat != null) p.hpRegenFlat = m.hpRegenFlat;
    if (m.energyRegenFlat != null) p.energyRegenFlat = m.energyRegenFlat;
    if (m.energyRegenMult != null) p.energyRegenMult = m.energyRegenMult;
    if (m.adenaMult != null) p.adenaMult = m.adenaMult;
    if (m.dropMult != null) p.dropMult = m.dropMult;
    this._applyWeight(m);
    p.attackPower = p.pAtk;
    p.defense = p.pDef;
    if (g.charMenu && g.charMenu.isOpen) {
      if (typeof g.charMenu.renderStatus === 'function') g.charMenu.renderStatus();
    }
    if (g.ui && typeof g.ui.updatePlayerStats === 'function') {
      g.ui.updatePlayerStats();
    }
  }
  intentSkill(skillId, opts) {
    opts = opts || {};
    this.send({
      t: 'skill',
      skillId: skillId,
      mid: opts.mid != null ? opts.mid : undefined,
      pid: opts.pid != null ? opts.pid : undefined
    });
  }
  intentLearnSkill(skillId, npcId) { this.send({ t: 'learn_skill', skillId: skillId, npcId: npcId }); }
  intentClassTransfer(classId) { this.send({ t: 'class_transfer', cls: classId }); }
  intentAttackPlayer(pid) { this.send({ t: 'attack_player', pid }); }
  intentCraft(id) { this.send({ t: 'craft', id }); }
  intentLearn(id) { this.send({ t: 'learn', id }); }
  intentEnchant(slot) { this.send({ t: 'enchant', slot }); }
  intentUse(id) { this.send({ t: 'use', id }); }
  intentDuelOffer(pid, name) {
    const m = { t: 'duel_offer' };
    if (pid != null) m.pid = pid | 0;
    if (name) m.name = String(name);
    this.send(m);
  }
  intentDuelAccept(pid) {
    const m = { t: 'duel_accept' };
    if (pid != null) m.pid = pid | 0;
    this.send(m);
  }
  intentDuelDecline(pid) {
    const m = { t: 'duel_decline' };
    if (pid != null) m.pid = pid | 0;
    this.send(m);
  }
  intentDuelCancel() { this.send({ t: 'duel_cancel' }); }
  intentPartyInvite(pid) { this.send({ t: 'party_invite', pid }); }
  intentPartyAccept(fromPid) { this.send({ t: 'party_accept', fromPid }); }
  intentPartyLeave() { this.send({ t: 'party_leave' }); }
  intentPartyKick(pid) { this.send({ t: 'party_kick', pid }); }
  intentPartyDismiss() { this.send({ t: 'party_dismiss' }); }
  intentPartyLeader(pid) { this.send({ t: 'party_leader', pid }); }
  /** Режим лута пати (finders / random / turn). Меняет только лидер. */
  intentPartyLoot(mode) { this.send({ t: 'party_loot', mode: String(mode || '') }); }
  /**
   * Чат. Канал решает адресацию на сервере: all (AOI), shout (регион),
   * party (группа), tell (по имени). system шлёт только сервер.
   */
  intentChat(text, ch, to) {
    const m = { t: 'chat', text: String(text == null ? '' : text).slice(0, 120) };
    if (ch) m.ch = String(ch);
    if (to) m.to = String(to);
    this.send(m);
  }
  intentReport(name, text) {
    this.send({ t: 'report', name: String(name || ''), text: String(text || '').slice(0, 200) });
  }
  /** Pick up ground loot pile (server authority). */
  intentLootPickup(lid) { this.send({ t: 'loot_pickup', lid: lid }); }
  /** L2 death UI: revive to village (mode: 'village') */
  intentRevive(mode) { this.send({ t: 'revive', mode: mode || 'village' }); }
  /** F2 editor: spawn test ground loot (as mob drop) */
  intentDebugDrop(itemId, count) {
    this.send({ t: 'debug_spawn_loot', itemId: itemId, count: count != null ? count : 1 });
  }
  /** Drop item from bag/equip onto ground near player */
  intentDropItem(itemId, count) {
    this.send({ t: 'drop_item', itemId: itemId, count: count != null ? count : 1 });
  }
  /** Permanently destroy item from bag/equip (server authority, persists) */
  intentDestroyItem(itemId, count) {
    this.send({ t: 'destroy_item', itemId: itemId, count: count != null ? count : 1 });
  }

  // ---- Услуги NPC: авторитет сервера (цены, дистанция, валюта, позиция) ----
  /** Запросить каталог магазина. Ответ: shop_open (цены серверные). */
  intentShopOpen(npcId) { this.send({ t: 'shop_open', npcId: String(npcId || '') }); }
  /** Купить. Цену НЕ передаём — сервер берёт её из каталога. */
  intentNpcBuy(npcId, itemId, count) {
    this.send({ t: 'npc_buy', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  /** Продать предмет торговцу (40 % цены, money sink). */
  intentNpcSell(npcId, itemId, count) {
    this.send({ t: 'npc_sell', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  /** Список точек телепорта с ценами. Ответ: teleport_list. */
  intentTeleportList(npcId) { this.send({ t: 'teleport_list', npcId: String(npcId || '') }); }
  /** Телепорт. Ответ: teleport_ok + self_sync, либо teleport_fail. */
  intentTeleport(npcId, point) {
    this.send({ t: 'npc_teleport', npcId: String(npcId || ''), point: point });
  }
  /** Список баффов NPC. Ответ: npc_buff_list. */
  intentBuffList(npcId) { this.send({ t: 'npc_buff_list', npcId: String(npcId || '') }); }
  /** Купить бафф у NPC. Ответ: npc_buff_ok / npc_buff_fail. */
  intentNpcBuff(npcId, buffId) {
    this.send({ t: 'npc_buff', npcId: String(npcId || ''), buffId: String(buffId || '') });
  }

  // ---- Персональный склад: содержимое и ёмкость считает сервер ----
  /** Открыть склад. Ответ: wh_open (обе карты, занятость, плата). */
  intentWhOpen(npcId) { this.send({ t: 'wh_open', npcId: String(npcId || '') }); }
  /** Положить на склад (платно). Ответ: wh_ok / wh_fail. */
  intentWhPut(npcId, itemId, count) {
    this.send({ t: 'wh_put', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  /** Забрать со склада (бесплатно). Ответ: wh_ok / wh_fail. */
  intentWhTake(npcId, itemId, count) {
    this.send({ t: 'wh_take', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  intentCwhOpen(npcId) { this.send({ t: 'cwh_open', npcId: String(npcId || '') }); }
  intentCwhPut(npcId, itemId, count) {
    this.send({ t: 'cwh_put', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  intentCwhTake(npcId, itemId, count) {
    this.send({ t: 'cwh_take', npcId: String(npcId || ''), itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  intentClanInfo() { this.send({ t: 'clan_info' }); }
  intentClanCreate(name) { this.send({ t: 'clan_create', name: String(name || '') }); }
  intentClanInvite(name) { this.send({ t: 'clan_invite', name: String(name || '') }); }
  intentClanAccept(pid) {
    const m = { t: 'clan_accept' };
    if (pid != null) m.pid = pid | 0;
    this.send(m);
  }
  intentClanLeave() { this.send({ t: 'clan_leave' }); }
  intentClanKick(name) { this.send({ t: 'clan_kick', name: String(name || '') }); }
  intentClanPromote(name, rank) { this.send({ t: 'clan_promote', name: String(name || ''), rank: String(rank || 'officer') }); }
  intentClanLeader(name) { this.send({ t: 'clan_leader', name: String(name || '') }); }
  intentClanDisband() { this.send({ t: 'clan_disband' }); }
  intentClanLevelUp() { this.send({ t: 'clan_levelup' }); }
  intentClanCrest(w, h, rgba) { this.send({ t: 'clan_crest', w: w | 0, h: h | 0, rgba: String(rgba || '') }); }

  // ---- Обмен игрок ↔ игрок: перенос делает сервер в одном тике ----
  /** Предложить обмен игроку по pid. Ответ ему: trade_invite. */
  intentTradeOffer(pid) { this.send({ t: 'trade_offer', pid: pid | 0 }); }
  /** Принять предложение (pid — от кого; без него берётся последнее). */
  intentTradeAccept(pid) {
    const m = { t: 'trade_accept' };
    if (pid != null) m.pid = pid | 0;
    this.send(m);
  }
  intentTradeAdd(itemId, count) {
    this.send({ t: 'trade_add', itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  intentTradeRemove(itemId, count) {
    this.send({ t: 'trade_remove', itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  /** «Готово»: содержимое зафиксировано. Любое изменение сбрасывает обеим сторонам. */
  intentTradeLock() { this.send({ t: 'trade_lock' }); }
  /** «Подтвердить»: когда подтвердят оба — сервер переносит вещи. */
  intentTradeConfirm() { this.send({ t: 'trade_confirm' }); }
  intentTradeCancel() { this.send({ t: 'trade_cancel' }); }

  // ---- Личная лавка: состояние держит сервер, клиент рисует витрину ----
  /**
   * Совместимость с private-store.js: он зовёт intentPrivateStore({action,...}).
   * Раньше этого метода не существовало ни здесь, ни на сервере — весь модуль
   * лавки был мёртвым кодом.
   */
  intentPrivateStore(payload) {
    payload = payload || {};
    const action = String(payload.action || '');
    if (action === 'close') { this.send({ t: 'store_close' }); return; }
    const mode = (action === 'open_buy' || payload.mode === 'buy' ||
      String(payload.mode || '').indexOf('buy') === 0) ? 'buy' : 'sell';
    const items = (mode === 'buy' ? payload.buy : payload.sell) || payload.items || [];
    this.send({
      t: 'store_set', mode: mode,
      title: String(payload.title || ''),
      items: items.map((it) => ({
        itemId: String((it && (it.itemId || it.id)) || ''),
        count: (it && it.count) || 1,
        price: (it && (it.price != null ? it.price : it.maxPrice)) || 1
      }))
    });
  }
  intentStoreClose() { this.send({ t: 'store_close' }); }
  intentStoreList(pid) { this.send({ t: 'store_list', pid: pid | 0 }); }
  intentStoreBuy(pid, itemId, count) {
    this.send({ t: 'store_buy', pid: pid | 0, itemId: String(itemId || ''), count: count != null ? count : 1 });
  }
  intentStoreSell(pid, itemId, count) {
    this.send({ t: 'store_sell', pid: pid | 0, itemId: String(itemId || ''), count: count != null ? count : 1 });
  }

  // ---- Друзья: список и статусы считает сервер (ключ — yid, не имя) ----
  intentFriendList() { this.send({ t: 'friend_list' }); }
  intentFriendAdd(name) { this.send({ t: 'friend_add', name: String(name || '') }); }
  intentFriendAccept(pid) {
    const m = { t: 'friend_accept' };
    if (pid != null) m.pid = pid | 0;
    this.send(m);
  }
  intentFriendRemove(name, yid) {
    const m = { t: 'friend_remove' };
    if (name) m.name = String(name);
    if (yid) m.yid = String(yid);
    this.send(m);
  }

  // ---- Квесты: состояние и прогресс считает сервер ----
  /** Запросить снапшот квестов (ответ: quests). */
  intentQuestList() { this.send({ t: 'quest_list' }); }
  intentQuestAccept(questId) { this.send({ t: 'quest_accept', questId: String(questId || '') }); }
  intentQuestComplete(questId, rewardChoice) {
    const payload = { t: 'quest_complete', questId: String(questId || '') };
    if (rewardChoice !== undefined && rewardChoice !== null) payload.rewardChoice = rewardChoice;
    this.send(payload);
  }
  intentQuestAbandon(questId) { this.send({ t: 'quest_abandon', questId: String(questId || '') }); }
  /** Разговор с NPC: прогресс talk-целей (сервер проверяет дистанцию). */
  intentNpcTalk(npcId) { this.send({ t: 'npc_talk', npcId: String(npcId || '') }); }
  _cacheClanCrest(m) {
    if (!m || !m.hash || !m.rgba) return;
    const img = (typeof window.clanCrestToImageData === 'function')
      ? window.clanCrestToImageData(m.w | 0, m.h | 0, m.rgba) : null;
    this._clanCrests[m.hash] = { w: m.w | 0, h: m.h | 0, rgba: m.rgba, hash: m.hash, image: img };
    if (this.clan && this.clan.id === m.clanId) this.clanCrest = this._clanCrests[m.hash];
    const g = window.game;
    if (g && g.player && this.clan && this.clan.id === m.clanId) {
      g.player._clanCrestImage = img;
      g.player.clanName = this.clan.name;
      if (typeof g.player.refreshNameplate === 'function') g.player.refreshNameplate();
    }
    this.remote.forEach((r) => {
      if (r && r.crestHash === m.hash && typeof this._refreshRemoteNameTag === 'function') this._refreshRemoteNameTag(r);
    });
  }
  onMessage(m) {
    const g = window.game;
    if (m.online != null) {
      this.online = m.online;
      if (g) g.serverOnline = m.online;
    }
    if (m.worldTime) this._applyWorldTime(m.worldTime);   // подхват из welcome И из периодического 'time'
    switch (m.t) {
      case 'ping':
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ t: 'pong', time: m.time || 0 })); } catch (_) {}
        }
        return;
      case 'pong':
        return;
      case 'online':
      case 'online_count':
        if (m.online != null || m.count != null) {
          const cnt = m.online != null ? m.online : m.count;
          this.online = cnt;
          if (g) g.serverOnline = cnt;
        }
        return;
      case 'welcome':
        this.status = 'online'; this._stopped = false; this.attempts = 0; this.reconnect = 1000;
        if (this.welcomeTimer) { clearTimeout(this.welcomeTimer); this.welcomeTimer = null; }
        if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
        this._hideReconnectOverlay(); this._updateStatus();
        this._resolveMenu();
        this.pid = m.pid; this.region = m.region; this.predict.x = m.self.x; this.predict.z = m.self.z; this._setServerSelf(m.self.x, m.self.z);
        // GM-флаг сервера — единственный ключ к редактору мира (F2) и к
        // административным чат-командам.
        this.dev = !!m.dev;
        this.gm = !!m.gm;
        window.PS_DEV = this.dev;
        window.PS_GM = this.gm;
        window.__PS_EDITOR_KEY = (this.gm && m.editorKey) ? String(m.editorKey) : '';
        if (typeof window.__psAllowInspect === 'function') {
          window.__psAllowInspect(!!this.gm, m.accessLevel | 0);
        }
        if (g && g.player) {
          g.player.gm = this.gm;
          g.player.accessLevel = m.accessLevel || (this.gm ? 100 : 0);
          if (m.gmSpeedMul != null) {
            g.player.gmSpeedMul = +m.gmSpeedMul || 1.0;
            if (typeof g.player.pullL2Stats === 'function') g.player.pullL2Stats();
          }
        }
        const editorPermitted = !!(this.gm && window.__PS_EDITOR_KEY);
        if (typeof window.setEditorAllowed === 'function') window.setEditorAllowed(editorPermitted);
        if (editorPermitted && typeof window.__ensureSceneEditor === 'function') {
          window.__ensureSceneEditor(g).then(function (ed) {
            console.log('[GM] 🛠️ Редактор сцены загружен и готов');
          }).catch(function (e) {
            console.warn('[GM] Ошибка предзагрузки редактора:', e && e.message);
          });
        }
        if (window.GameAudio && typeof window.GameAudio.setZone === 'function') {
          window.GameAudio.setZone(m.region || m.zoneName || 'village');
        }
        if (editorPermitted && g && typeof g._ensureFpsHud === 'function') {
          g._fpsVisible = true;
          const hud = g._ensureFpsHud();
          if (hud) hud.style.display = 'block';
        }
        if (g.lootManager && g.lootManager.setLocalPid) g.lootManager.setLocalPid(m.pid);
        // Позиция ТОЛЬКО из профиля сервера. Не подменяем editor spawn'ом —
        // иначе «сохранённая» точка с карты перетирается зелёным шаром.
        const sx = m.self.x, sz = m.self.z;
        this.predict.x = sx; this.predict.z = sz;
        // Y как у локального игрока (standY), не «висячий» 0.9+heightAt
        let py = 1.5;
        if (window.Terrain && typeof window.Terrain.standY === 'function') {
          const st = window.Terrain.standY(sx, sz);
          py = st.y;
          g.player._smoothY = st.y;
          g.player._smoothShadowY = st.shadowY;
        } else if (window.Terrain) {
          const gh = window.Terrain.heightAt(sx, sz);
          py = 0.97 + Math.max(gh, window.Terrain.seaLevel - 0.3);
        }
        g.player.mesh.position.set(sx, py, sz);
        g.player.isMoving = false;
        if (g.editor && g.editor.markServerPositionAuthoritative) g.editor.markServerPositionAuthoritative();
        g.player.hp = m.self.hp; g.player.maxHp = m.self.maxHp; g.player.energy = m.self.energy; g.player.maxEnergy = m.self.maxEnergy; g.player.level = m.self.level;
        if (m.effects) {
          const allFx = [].concat(m.effects.buffs || [], m.effects.debuffs || []);
          if (g.ui && g.ui.setStatusEffects) g.ui.setStatusEffects(allFx);
          g.player.buffs = m.effects.buffs || [];
        }
        if (m.self.cls) {
          g.player.playerClass = m.self.cls;
          g.player.className = m.self.className || m.self.cls;
          g.player.race = m.self.race || 'human';
          g.player.gender = m.self.gender || 'male';
          if (g.player.levelSystem) {
            g.player.levelSystem.currentClass = m.self.cls;
            g.player.levelSystem.classTier = m.self.classTier || 0;
            g.player.levelSystem.level = m.self.level || 1;
            g.player.levelSystem.exp = m.self.exp || 0;
            if (typeof g.player.levelSystem.recalculateStats === 'function') g.player.levelSystem.recalculateStats();
          }
          const badge = document.getElementById('class-name');
          if (badge) badge.textContent = g.player.className;
        }
        if (m.inv && g.inventory) {
          this.applyInv(m.inv, m.equip || (m.self && m.self.equip));
          // Model may load after welcome — force 3D hand weapon once more
          if (g.player && typeof g.player.syncWeaponVisual === 'function') {
            g.player.syncWeaponVisual({ force: true });
            setTimeout(() => {
              if (g.player && g.player.syncWeaponVisual) g.player.syncWeaponVisual({ force: true });
            }, 800);
          }
        }
        // Изученные рецепты — полностью с сервера (не дополняем локальные)
        if (g.craftManager) {
          g.craftManager.learnedRecipes = new Set(Array.isArray(m.learned) ? m.learned : []);
        }
        // skills + SP from server
        if (m.skills && g.player.skillManager) {
          g.player.skillManager.learnedSkills = {};
          Object.keys(m.skills).forEach((id) => {
            g.player.skillManager.learnedSkills[id] = { level: m.skills[id] };
          });
          if (g.player.skillManager.recalculatePassives) g.player.skillManager.recalculatePassives();
        }
        if (m.self && m.self.sp != null && g.player.levelSystem) {
          g.player.levelSystem.sp = m.self.sp;
          g.player.sp = m.self.sp;
        }
        // cosmetics (title / name color / aura)
        if (g.player && typeof g.player.applyCosmetics === 'function') {
          const cos = m.cosmetics || (m.self && m.self.cosmetics) || null;
          const merged = Object.assign({}, cos || {});
          if (m.cosmeticsFull) {
            for (const k of Object.keys(m.cosmeticsFull)) {
              if (m.cosmeticsFull[k] != null) merged[k] = m.cosmeticsFull[k];
            }
          }
          if (cos && cos.aura) merged.aura = cos.aura;
          if (!merged.aura && this.gm) merged.aura = 'gm_champion';
          g.player.applyCosmetics(merged);
        }
        if (m.self && m.self.exp != null && g.player.levelSystem) {
          g.player.levelSystem.exp = m.self.exp;
          g.player.exp = m.self.exp;
          if (m.self.expToNext != null) g.player.levelSystem.expToNext = m.self.expToNext;
        }
        if (m.self && m.self.primary) g.player.primary = m.self.primary;
        // Квесты: единственный источник — сервер (localStorage больше не читаем)
        if (g.questManager && typeof g.questManager.applyServerState === 'function') {
          g.questManager.applyServerState(m.quests);
        }
        // Сначала gear из server equip, потом авторитетные combat-статы сервера
        if (g.player.pullL2Stats) g.player.pullL2Stats();
        if (m.self) this.applyCombatStats(m.self);
        if (g.skillsUI && g.skillsUI.autoFillSkillBar) g.skillsUI.autoFillSkillBar();
        const clsInfo = m.self.className ? (' · ' + m.self.className) : '';
        const sexInfo = m.self.gender === 'female' ? 'жен.' : 'муж.';
        const zoneLbl = this._zoneLabel(m.zoneName || m.region, m.region);
        g.addChatMessage(
          'Подключено к миру: ' + zoneLbl + clsInfo + ' (' + sexInfo + ')' + (m.dev ? ' (тест)' : ''),
          'system'
        );
        if (g.ui) g.ui.setZone(zoneLbl);
        if (typeof YaGames !== 'undefined' && m.leaderboardScore) { try { YaGames.init().then(sdk => sdk.getLeaderboards().then(lb => lb.setLeaderboardScore('level_board', m.leaderboardScore))).catch(() => {}); } catch (e) {} }
        break;
      case 'combat_stats':
        this.applyCombatStats(m);
        if (m.equip && g.inventory) g._serverEquip = m.equip;
        break;
      case 'weight':
        this._applyWeight(m);
        break;
      case 'equip_ok':
      case 'unequip_ok':
        // combat_stats приходит отдельно; клиент уже optimistic-экипнул.
        // Кэшируем equip для следующих applyInv (reward/craft), UI — на всякий.
        if (m.equip && g.inventory) {
          g._serverEquip = m.equip;
          // Keep paperdoll + 3D hand mesh in sync with server equip
          if (typeof this.applyEquipOnly === 'function') {
            this.applyEquipOnly(m.equip);
          } else {
            this._refreshInvUI();
            if (g.player && typeof g.player.syncWeaponVisual === 'function') {
              g.player.syncWeaponVisual({ force: true });
            }
          }
        }
        break;
      case 'equip_fail': {
        const eqR = {
          args: 'неверные данные',
          unknown: 'неизвестный предмет',
          slot: 'не подходит слот',
          empty: 'слот пуст',
          class: 'не для вашего класса',
          level: 'недостаточный уровень'
        };
        const why = m.reason ? (eqR[m.reason] || m.reason) : null;
        g.addChatMessage('Не удалось изменить экипировку' + (why ? ' (' + why + ')' : '') + '.', 'system');
        break;
      }
      // Прокачка приборов — авторитет сервера (SP / материалы / уровень).
      case 'device_ok': {
        if (m.sp != null && g.player) {
          g.player.sp = m.sp;
          if (g.player.levelSystem) g.player.levelSystem.sp = m.sp;
        }
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        else if (m.equip) this.applyEquipOnly(m.equip);
        if (m.track === 'circuit' || m.track === 'nano') {
          const what = m.track === 'circuit' ? '⚡ Контур' : '🔗 Нано-сеть';
          g.addChatMessage(what + ' → Ур.' + m.level + ' (−' + m.spCost + ' SP)', 'loot');
        } else {
          const what = m.track === 'shell' ? '🔩 Корпус' : '🛡 Оболочка';
          g.addChatMessage(what + ' → ' + (m.label || m.grade || ('#' + m.index)), 'loot');
        }
        break;
      }
      case 'device_fail': {
        const dR = {
          need_resonator: 'нужен надетый резонатор',
          need_bracelet: 'нужны надетые нано-браслеты',
          max_level: 'уже максимум',
          sp: 'не хватает SP: нужно ' + (m.need || '?'),
          player_level: 'нужен уровень персонажа ' + (m.needLevel || '?'),
          no_mats: 'не хватает: ' + (m.matId || 'материалы') + ' ×' + (m.need || '?'),
          bad_track: 'неизвестная линия прокачки'
        };
        g.addChatMessage('Прокачка прибора: ' + (dR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      // ---- Услуги NPC: магазин / продажа / телепорт / баффы ----
      case 'shop_open': {
        if (g.npcUI && typeof g.npcUI.applyShopCatalog === 'function') {
          g.npcUI.applyShopCatalog(m);
        }
        break;
      }
      case 'shop_buy_ok': {
        this.applyInv(m.inv, m.equip || g._serverEquip);
        g.addChatMessage('Куплено: ' + (m.name || m.itemId) +
          (m.count > 1 ? (' ×' + m.count) : '') + ' (−' + (m.total || 0).toLocaleString() + '⚙️)', 'loot');
        if (g.npcUI && typeof g.npcUI.refreshShopCurrency === 'function') g.npcUI.refreshShopCurrency(m.currency);
        break;
      }
      case 'shop_sell_ok': {
        this.applyInv(m.inv, m.equip || g._serverEquip);
        g.addChatMessage('Продано: ' + m.itemId + (m.count > 1 ? (' ×' + m.count) : '') +
          ' (+' + (m.total || 0).toLocaleString() + '⚙️)', 'loot');
        if (g.npcUI && typeof g.npcUI.refreshShopCurrency === 'function') g.npcUI.refreshShopCurrency(m.currency);
        break;
      }
      case 'shop_fail': {
        const sR = {
          unknown_npc: 'торговец не найден',
          no_service: 'этот NPC не торгует',
          range: 'подойдите к торговцу',
          not_sold: 'товар отсутствует в продаже',
          not_bought: 'этот предмет не скупают',
          none: 'нет такого предмета',
          funds: 'не хватает ⚙️: нужно ' + (m.need || '?').toLocaleString(),
          inv_full: 'нет места в сумке',
          weight: 'слишком тяжело',
          args: 'неверный запрос'
        };
        g.addChatMessage('Магазин: ' + (sR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'teleport_list': {
        if (g.npcUI && typeof g.npcUI.applyTeleportList === 'function') g.npcUI.applyTeleportList(m);
        break;
      }
      case 'teleport_ok': {
        // Позиция авторитетна: self_sync прилетит следом и подтянет клиента.
        this._setServerSelf(m.x, m.z);
        this._applyServerPosition(m.x, m.z, { hard: true });
        if (m.inv) this.applyInv(m.inv, g._serverEquip);
        this.region = m.region || this.region;
        if (g.ui && m.zoneName) g.ui.setZone(this._zoneLabel(m.zoneName, m.region));
        g.addChatMessage('Телепорт: ' + (m.name || '') + ' (−' + (m.cost || 0).toLocaleString() + '⚙️)', 'system');
        if (g.npcUI && typeof g.npcUI.close === 'function') g.npcUI.close();
        break;
      }
      case 'teleport_fail': {
        const tR = {
          unknown_npc: 'диспетчер не найден',
          no_service: 'этот NPC не телепортирует',
          range: 'подойдите к диспетчеру',
          unknown_point: 'направление недоступно',
          funds: 'не хватает ⚙️: нужно ' + (m.need || '?').toLocaleString(),
          flagged: 'нельзя телепортироваться в бою',
          dead: 'сначала воскреснуть'
        };
        g.addChatMessage('Телепорт: ' + (tR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'npc_buff_list': {
        if (g.npcUI && typeof g.npcUI.applyBuffList === 'function') g.npcUI.applyBuffList(m);
        break;
      }
      case 'npc_buff_ok': {
        if (m.inv) this.applyInv(m.inv, g._serverEquip);
        g.addChatMessage('Бафф получен: ' + (m.name || m.buffId) +
          ' (' + Math.round((m.duration || 0) / 60) + ' мин, −' + (m.cost || 0).toLocaleString() + '⚙️)', 'loot');
        if (g.npcUI && typeof g.npcUI.refreshShopCurrency === 'function') g.npcUI.refreshShopCurrency(m.currency);
        break;
      }
      case 'npc_buff_fail': {
        const bR = {
          unknown_npc: 'NPC не найден',
          no_service: 'этот NPC не даёт баффы',
          range: 'подойдите к NPC',
          unknown_buff: 'бафф недоступен',
          funds: 'не хватает ⚙️: нужно ' + (m.need || '?').toLocaleString(),
          dead: 'сначала воскреснуть'
        };
        g.addChatMessage('Бафф: ' + (bR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      // ---- Персональный склад ----
      case 'wh_open': {
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.npcUI && typeof g.npcUI.applyWarehouse === 'function') g.npcUI.applyWarehouse(m);
        break;
      }
      case 'wh_ok': {
        this.applyInv(m.inv, m.equip || g._serverEquip);
        const nm = this._itemName(m.itemId);
        const cnt = m.count > 1 ? (' ×' + m.count) : '';
        g.addChatMessage(m.op === 'take'
          ? ('Со склада: ' + nm + cnt)
          : ('На склад: ' + nm + cnt + (m.fee ? (' (−' + m.fee.toLocaleString() + '⚙️)') : '')), 'loot');
        if (g.npcUI && typeof g.npcUI.applyWarehouse === 'function') g.npcUI.applyWarehouse(m);
        break;
      }
      case 'wh_fail': {
        const wR = {
          unknown_npc: 'склад не найден',
          no_service: 'этот NPC не хранит вещи',
          range: 'подойдите к складу',
          dead: 'сначала воскреснуть',
          none: 'нет такого предмета',
          currency: '⚙️ на складе не хранят',
          quest_item: 'квестовые предметы не принимают',
          unknown_item: 'неизвестный предмет',
          enchanted: 'заточенную вещь можно переносить только целиком и когда второй копии нет',
          wh_full: 'склад заполнен',
          inv_full: 'нет места в сумке',
          funds: 'не хватает ⚙️: плата ' + (m.need || '?').toLocaleString(),
          args: 'неверный запрос'
        };
        g.addChatMessage('Склад: ' + (wR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      // ---- Обмен игрок ↔ игрок ----
      case 'trade_invite': {
        if (g.tradeUI && typeof g.tradeUI.showInvite === 'function') g.tradeUI.showInvite(m);
        else g.addChatMessage((m.fromName || 'Игрок') + ' предлагает обмен: /trade_accept', 'system');
        break;
      }
      case 'trade_open':
      case 'trade_update': {
        // Инвентарь не трогаем: вещи остаются в сумке до самого переноса,
        // окно рисует предложения по m.mine/m.theirs.
        if (g.tradeUI && typeof g.tradeUI.apply === 'function') g.tradeUI.apply(m);
        break;
      }
      case 'trade_done': {
        this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.tradeUI && typeof g.tradeUI.close === 'function') g.tradeUI.close();
        const list = (o) => Object.keys(o || {}).map((id) => this._itemName(id) +
          ((o[id] | 0) > 1 ? ('×' + (o[id] | 0)) : '')).join(', ') || '—';
        g.addChatMessage('Обмен с ' + (m.peerName || 'игроком') + ': отдано ' + list(m.gave) +
          ', получено ' + list(m.got), 'loot');
        break;
      }
      case 'trade_close': {
        if (g.tradeUI && typeof g.tradeUI.close === 'function') g.tradeUI.close();
        const cR = {
          cancel: 'обмен отменён',
          dead: 'обмен прерван: смерть',
          peer_gone: 'партнёр вышел из обмена',
          timeout: 'обмен закрыт по таймауту'
        };
        g.addChatMessage('Обмен: ' + (cR[m.reason] || m.reason || 'закрыт'), 'system');
        break;
      }
      case 'trade_fail': {
        const tR = {
          no_target: 'игрок не найден',
          busy: 'кто-то из вас уже в обмене',
          no_invite: 'нет приглашения к обмену',
          no_trade: 'обмен не открыт',
          dead: 'сначала воскреснуть',
          flagged: 'нельзя обмениваться в бою',
          range: 'подойдите ближе',
          args: 'неверный запрос',
          none: 'нет такого предмета',
          gone: 'предмет уже не в сумке',
          quest_item: 'квестовые предметы не передаются',
          unknown_item: 'неизвестный предмет',
          offer_full: 'в окне обмена больше нет места',
          not_locked: 'сначала оба нажимают «Готово»',
          enchanted: 'заточенную вещь можно передать только целиком и когда у партнёра такой нет',
          inv_full_self: 'в вашей сумке не хватит места',
          inv_full_peer: 'у партнёра не хватит места'
        };
        g.addChatMessage('Обмен: ' + (tR[m.reason] || m.reason || 'не удалось') +
          (m.itemName ? (' (' + m.itemName + ')') : (m.itemId ? (' (' + this._itemName(m.itemId) + ')') : '')), 'system');
        break;
      }
      // ---- Личная лавка ----
      case 'store_open': {
        g.addChatMessage('Лавка открыта: ' + (m.title || '') +
          ' (' + ((m.items || []).length) + ' позиций)', 'system');
        break;
      }
      case 'store_list': {
        if (g.storeView && typeof g.storeView.apply === 'function') g.storeView.apply(m);
        break;
      }
      case 'store_state': {
        const r = this.remote && this.remote.get('p' + m.pid);
        if (r) r.store = m.store || null;
        break;
      }
      case 'store_deal': {
        this.applyInv(m.inv, m.equip || g._serverEquip);
        const nm = m.name || this._itemName(m.itemId);
        const cnt = m.count > 1 ? (' ×' + m.count) : '';
        const sum = (m.total || 0).toLocaleString();
        if (m.dir === 'buy') g.addChatMessage('Куплено в лавке ' + m.peerName + ': ' + nm + cnt + ' (−' + sum + '⚙️)', 'loot');
        else if (m.dir === 'sell') g.addChatMessage('Продано в лавку ' + m.peerName + ': ' + nm + cnt + ' (+' + sum + '⚙️)', 'loot');
        else if (m.dir === 'sold') g.addChatMessage('Ваша лавка продала ' + nm + cnt + ' игроку ' + m.peerName + ' (+' + sum + '⚙️)', 'loot');
        else g.addChatMessage('Ваша лавка купила ' + nm + cnt + ' у ' + m.peerName + ' (−' + sum + '⚙️)', 'loot');
        break;
      }
      case 'store_close': {
        if (g.storeView && typeof g.storeView.close === 'function') g.storeView.close();
        const sR = { cancel: 'лавка закрыта', dead: 'лавка закрыта: смерть', sold_out: 'товар распродан' };
        g.addChatMessage('Лавка: ' + (sR[m.reason] || m.reason || 'закрыта'), 'system');
        break;
      }
      case 'store_fail': {
        const stR = {
          no_store: 'лавки нет',
          wrong_mode: 'лавка работает в другом режиме',
          range: 'подойдите к лавке',
          dead: 'сначала воскреснуть',
          flagged: 'нельзя открыть лавку в бою',
          busy: 'закройте окно обмена',
          empty: 'нечего выставить',
          gone: 'предмета уже нет в сумке',
          sold_out: 'позиция распродана',
          funds: 'не хватает ⚙️: нужно ' + (m.need || '?').toLocaleString(),
          peer_funds: 'у владельца лавки не хватает ⚙️',
          inv_full: 'нет места в сумке',
          peer_inv_full: 'у владельца лавки нет места',
          enchanted: 'заточенную вещь через лавку не продать',
          args: 'неверный запрос'
        };
        g.addChatMessage('Лавка: ' + (stR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      // ---- Друзья ----
      case 'friends': {
        this.friends = Array.isArray(m.friends) ? m.friends : [];
        if (this._friendsPending) {
          this._friendsPending = false;
          const on = this.friends.filter(f => f.online);
          g.addChatMessage('Друзья (' + this.friends.length + '/' + (m.max || 64) + '), в сети ' +
            on.length + (this.friends.length
              ? ': ' + this.friends.map(f => (f.online ? '● ' : '○ ') + f.name +
                (f.level ? (' ур.' + f.level) : '')).join(', ')
              : ''), 'system');
        }
        break;
      }
      case 'friend_request': {
        this._friendReqFrom = m.from;
        g.addChatMessage((m.fromName || 'Игрок') + ' предлагает дружбу: /friend_accept', 'system');
        break;
      }
      case 'friend_status': {
        const known = (this.friends || []).find(f => (m.name && f.name === m.name) || (m.yid && f.yid === m.yid));
        if (known) known.online = !!m.online;
        g.addChatMessage('Друг ' + (m.name || '') + (m.online ? ' в сети.' : ' вышел.'), 'system');
        break;
      }
      case 'friend_fail': {
        const fR = {
          args: 'укажите имя: /friend Имя',
          offline: 'игрок не в сети' + (m.name ? (': ' + m.name) : ''),
          self: 'себя в друзья не добавить',
          already: 'уже в списке друзей',
          full: 'список друзей полон',
          no_request: 'нет запроса дружбы',
          not_friend: 'этого игрока нет в друзьях' + (m.name ? (': ' + m.name) : '')
        };
        g.addChatMessage('Друзья: ' + (fR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'clan': {
        this.clan = m.clan || null;
        if (g.player) {
          g.player.clanName = this.clan ? this.clan.name : null;
          if (!this.clan) g.player._clanCrestImage = null;
          if (typeof g.player.refreshNameplate === 'function') g.player.refreshNameplate();
        }
        if (g.clanUI && typeof g.clanUI.apply === 'function') g.clanUI.apply(m);
        if (this._clanPending) {
          this._clanPending = false;
          if (!this.clan) g.addChatMessage('Вы не в клане. /clancreate Имя — создать с 10 уровня.', 'system');
          else {
            const mem = this.clan.members || [];
            g.addChatMessage('Клан ' + this.clan.name + ' ур.' + this.clan.level +
              ' реп.' + this.clan.reputation + ' (' + mem.length + '/' + this.clan.cap + '): ' +
              mem.map((x) => (x.online ? '● ' : '○ ') + x.name).join(', '), 'system');
          }
        }
        break;
      }
      case 'clan_ok': {
        const op = m.op;
        if (op === 'create') g.addChatMessage('Клан создан.' + (m.currency != null ? (' Баланс ' + m.currency.toLocaleString() + '⚙️') : ''), 'loot');
        else if (op === 'join') g.addChatMessage('Вы вступили в клан.', 'loot');
        else if (op === 'leave') g.addChatMessage('Вы покинули клан.', 'system');
        else if (op === 'kick') g.addChatMessage('Исключён из клана: ' + (m.name || ''), 'system');
        else if (op === 'disband') g.addChatMessage('Клан распущен.', 'system');
        else if (op === 'levelup') g.addChatMessage('Уровень клана: ' + m.level, 'loot');
        else if (op === 'crest') g.addChatMessage('Крест клана сохранён.', 'loot');
        else if (op === 'leader') g.addChatMessage('Новый лидер: ' + (m.name || ''), 'system');
        else if (op === 'promote') g.addChatMessage((m.name || '') + ' → ' + (m.rank || ''), 'system');
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'clan_invite': {
        this._clanReqFrom = m.from;
        g.addChatMessage((m.fromName || 'Игрок') + ' приглашает в клан «' + (m.clanName || '') + '»: /clanaccept', 'system');
        break;
      }
      case 'clan_status': {
        g.addChatMessage('Соклановец ' + (m.name || '') + (m.online ? ' в сети.' : ' вышел.'), 'system');
        break;
      }
      case 'clan_crest': {
        this._cacheClanCrest(m);
        break;
      }
      case 'clan_tag': {
        if (m.pid === this.pid && g.player) {
          g.player.clanName = m.clanName || null;
          if (!m.crestHash) g.player._clanCrestImage = null;
          if (typeof g.player.refreshNameplate === 'function') g.player.refreshNameplate();
        }
        const r = this.remote && this.remote.get('p' + m.pid);
        if (r) {
          r.clanId = m.clanId || null;
          r.clanName = m.clanName || null;
          r.crestHash = m.crestHash || null;
          this._refreshRemoteNameTag(r);
        }
        break;
      }
      case 'clan_fail': {
        const cR = {
          name: 'имя клана: 3–16 букв, без спецсимволов',
          taken: 'имя занято',
          level: 'нужен ' + (m.need || 10) + ' уровень',
          funds: 'не хватает ⚙️: нужно ' + (m.need || '?').toLocaleString(),
          already: 'вы уже в клане',
          no_clan: 'вы не в клане',
          rank: 'недостаточно прав',
          full: 'клан полон',
          offline: 'игрок не в сети' + (m.name ? (': ' + m.name) : ''),
          self: 'нельзя применить к себе',
          busy: 'игрок уже в клане',
          no_invite: 'нет приглашения в клан',
          gone: 'клан больше не существует',
          not_member: 'этого игрока нет в клане',
          leader: 'лидер не может уйти, пока в клане есть люди — передай лидера или распусти',
          max: 'клан уже максимального уровня',
          rep: 'не хватает репутации клана: нужно ' + (m.need || '?'),
          size: 'крест: только 16×12 или 24×12 RGBA',
          crest: 'крест отклонён',
          args: 'неверный запрос'
        };
        g.addChatMessage('Клан: ' + (cR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'cwh_open':
      case 'cwh_ok': {
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.npcUI && typeof g.npcUI.applyWarehouse === 'function') g.npcUI.applyWarehouse(m);
        if (m.t === 'cwh_ok') {
          const nm = this._itemName(m.itemId);
          const cnt = m.count > 1 ? (' ×' + m.count) : '';
          g.addChatMessage(m.op === 'take'
            ? ('Из клан-склада: ' + nm + cnt)
            : ('В клан-склад: ' + nm + cnt + (m.fee ? (' (−' + m.fee.toLocaleString() + '⚙️)') : '')), 'loot');
        }
        break;
      }
      case 'cwh_fail': {
        const cwR = {
          unknown_npc: 'склад не найден',
          no_service: 'этот NPC не хранит вещи',
          range: 'подойдите к складу',
          dead: 'сначала воскреснуть',
          no_clan: 'клан-склад только для членов клана',
          none: 'нет такого предмета',
          currency: '⚙️ на складе не хранят',
          quest_item: 'квестовые предметы не принимают',
          unknown_item: 'неизвестный предмет',
          enchanted: 'заточенную вещь можно переносить только целиком и когда второй копии нет',
          wh_full: 'клан-склад заполнен',
          inv_full: 'нет места в сумке',
          funds: 'не хватает ⚙️: плата ' + (m.need || '?').toLocaleString(),
          args: 'неверный запрос'
        };
        g.addChatMessage('Клан-склад: ' + (cwR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'player_teleport': {
        // Сосед телепортировался: ставим модель сразу, без интерполяции через
        // полкарты.
        const r = this.remote && this.remote.get(m.pid);
        if (r) {
          r.x = m.x; r.z = m.z;
          if (r.obj) { r.obj.position.x = m.x; r.obj.position.z = m.z; }
        }
        break;
      }
      // ---- Квесты (авторитет сервера) ----
      case 'quests': {
        if (g.questManager && typeof g.questManager.applyServerState === 'function') {
          g.questManager.applyServerState(m.quests);
        }
        break;
      }
      case 'quest_complete_ok': {
        // Награды уже в серверном инвентаре — применяем как есть.
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.player) {
          if (m.selfExp != null && g.player.levelSystem) {
            g.player.levelSystem.exp = m.selfExp;
            if (m.expToNext != null) g.player.levelSystem.expToNext = m.expToNext;
            if (m.level != null) g.player.levelSystem.level = m.level;
            if (typeof g.player.syncFromLevelSystem === 'function') g.player.syncFromLevelSystem();
          }
          if (m.level != null) g.player.level = m.level;
        }
        g.addChatMessage('Задание выполнено: ' + (m.name || m.questId), 'loot');
        if (m.exp > 0) g.addChatMessage('Опыт: +' + m.exp.toLocaleString() + (m.sp ? (', SP: +' + m.sp) : ''), 'loot');
        if (m.currency > 0) g.addChatMessage('Награда: ' + m.currency.toLocaleString() + '⚙️', 'loot');
        (m.items || []).forEach((it) => {
          const tpl = window.ITEM_DATABASE ? window.ITEM_DATABASE[it.id] : null;
          g.addChatMessage('Получено: ' + ((tpl && tpl.name) || it.id) + ' ×' + it.count, 'loot');
        });
        if (g.questManager && typeof g.questManager.showCompleteDialogue === 'function') {
          g.questManager.showCompleteDialogue(m.questId);
        }
        if (m.classChange) {
          g.addChatMessage('🎉 СЕРТИФИКАЦИЯ ПРОЙДЕНА! Доступна смена профессии.', 'system');
          if (g.player && typeof g.player.createLevelUpEffect === 'function') g.player.createLevelUpEffect();
        }
        break;
      }
      case 'quest_fail': {
        const qR = {
          unknown: 'задание не найдено',
          active: 'задание уже принято',
          done: 'задание уже выполнено',
          daily_done: 'сегодня уже выполнено',
          level: 'нужен уровень ' + (m.need || '?'),
          prereq: 'сначала выполните предыдущее задание',
          too_many: 'слишком много активных заданий',
          not_active: 'задание не активно',
          incomplete: 'цели ещё не выполнены',
          inv_full: 'нет места в сумке для награды',
          unknown_npc: 'NPC не найден',
          range: 'подойдите к NPC'
        };
        g.addChatMessage('Задание: ' + (qR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'self_sync': {
        if (m.x != null && m.z != null) {
          this._setServerSelf(m.x, m.z);
          this._applyServerPosition(m.x, m.z, { hard: !!m.hard });
        }
        if (m.gmSpeedMul != null && g && g.player) {
          g.player.gmSpeedMul = m.gmSpeedMul;
          if (typeof g.player.pullL2Stats === 'function') g.player.pullL2Stats();
        }
        break;
      }
      case 'flash_fx': {
        const targetPid = m.pid;
        const isSelf = (targetPid === this.pid) || (!targetPid && g && g.player);
        const speedMul = +m.speedMul || (m.active ? 3.5 : 1.0);
        if (isSelf && g && g.player) {
          g.player.gmSpeedMul = speedMul;
          if (typeof g.player.pullL2Stats === 'function') g.player.pullL2Stats();
          if (m.burst && window.SkillVFX && typeof window.SkillVFX.playFlashBurst === 'function') {
            window.SkillVFX.playFlashBurst(g.player, { active: !!m.active, speedMul: speedMul });
          }
        }
        if (targetPid != null) {
          const rem = this.remote.get('p' + targetPid);
          if (rem) {
            rem.gmSpeedMul = speedMul;
            if (m.burst && window.SkillVFX && typeof window.SkillVFX.playFlashBurst === 'function') {
              window.SkillVFX.playFlashBurst(rem, { active: !!m.active, speedMul: speedMul });
            }
          }
        }
        break;
      }
      case 'region': {
        if (!m.region && !m.zoneName) break;
        this.region = m.region || this.region;
        const label = this._zoneLabel(m.zoneName, m.region);
        if (label && this._lastZoneChat !== label) {
          this._lastZoneChat = label;
          const peaceTag = (m.peace && label.indexOf('мирн') < 0) ? ' (мирная)' : '';
          g.addChatMessage('Зона: ' + label + peaceTag, 'system');
        }
        if (g.ui) g.ui.setZone(label || m.region);
        if (window.GameAudio && typeof window.GameAudio.setZone === 'function') {
          window.GameAudio.setZone(m.region || label || m.zoneName);
        }
        break;
      }
      case 'aoi':
        (m.leave || []).forEach((k) => {
          // Don't snip death anim — server often leaves AOI on kill
          const dying = this.remote.get(k);
          if (dying && dying.isDying) return;
          this.removeRemote(k);
        });
        (m.enter || []).forEach((s) => this.addRemote(s));
        break;
      case 'upd': (m.upd || []).forEach(u => this.updateRemote(u.k, u.x, u.z, u.hp)); break;
      case 'move_vec_start': this.handleMoveVecStart(m); break;
      case 'move_vec_stop': this.handleMoveVecStop(m); break;
      case 'dmg': {
        // Защита: пакет атаки моба не должен уменьшать HP самого моба
        if (m.by && typeof m.by === 'string' && m.by[0] === 'm') {
          break;
        }
        const isLocalAttacker = (this.pid != null && (m.by === this.pid || m.by === ('p' + this.pid)));
        const isTargetOfPlayer = (g.player && g.player.target && g.player.target.mid === m.mid);
        const pos = this.posOf('m' + m.mid);
        const remD = this.remote.get('m' + m.mid);
        const midMob = m.mobId || (remD && remD.mobId) || null;
        const midName = m.mobName || this._nameOf('m' + m.mid) || null;

        if (m.miss) {
          if (isLocalAttacker) {
            if (g.ui) g.ui.showDamageNumber(pos, 0, 'miss');
            if (g.ui && g.ui.chatDamage) {
              g.ui.chatDamage({ missed: true, targetName: midName, targetMobId: midMob });
            }
          }
          this._maybeTriggerAttackerSwing(m, 'm' + m.mid);
          break;
        }

        // Локальный игрок: личный боевой чат, звуки крита/соулшота и всплывающий урон
        if (isLocalAttacker) {
          if (g.ui) g.ui.showDamageNumber(pos, m.dmg, m.crit ? 'crit' : (m.blocked ? 'block' : 'normal'));
          if (window.GameAudio && typeof window.GameAudio.play === 'function') {
            if (m.ss) window.GameAudio.play('soulshot', pos);
            window.GameAudio.play(m.crit ? 'crit' : 'hit', pos);
          }
          if (g.ui && g.ui.chatDamage) {
            g.ui.chatDamage({
              dmg: m.dmg, crit: !!m.crit, blocked: !!m.blocked,
              targetName: midName,
              targetMobId: midMob,
              skillName: m.skillId ? this._skillName(m.skillId) : null
            });
          }
        } else if (isTargetOfPlayer && g.ui) {
          // Чужой удар по текущей цели игрока: отображаем компактную цифру урона без спама звуками и чатом
          g.ui.showDamageNumber(pos, m.dmg, 'normal');
        }

        // Animated hit / crit on mob (player → mob). Skills already play skill VFX → light hit.
        if (window.SkillVFX && typeof window.SkillVFX.playCombatHit === 'function') {
          const hitTarget = remD || (isTargetOfPlayer ? g.player.target : null);
          if (hitTarget && (isLocalAttacker || isTargetOfPlayer)) {
            window.SkillVFX.playCombatHit(hitTarget, {
              crit: !!m.crit,
              incoming: false,
              light: !!m.skillId
            });
          }
        }
        if (remD) {
          if (m.maxHp != null) remD.maxHp = m.maxHp;
          if (m.hp != null) {
            remD.hp = m.hp;
          } else {
            remD.hp = Math.max(0, (remD.hp != null ? remD.hp : (remD.maxHp || 0)) - (m.dmg || 0));
          }
          if (m.effects) remD.effects = m.effects;
        }
        if (isTargetOfPlayer) {
          if (remD) {
            g.player.target.hp = remD.hp;
            if (remD.maxHp != null) g.player.target.maxHp = remD.maxHp;
            if (remD.effects) g.player.target.effects = remD.effects;
          } else {
            g.player.target.hp = m.hp != null ? m.hp : Math.max(0, (g.player.target.hp || 0) - (m.dmg || 0));
            if (m.maxHp != null) g.player.target.maxHp = m.maxHp;
            if (m.effects) g.player.target.effects = m.effects;
          }
          // force UI bar update immediately (don't wait for next frame)
          if (g.ui && typeof g.ui.showTargetStatus === 'function') {
            g.ui.showTargetStatus(g.player.target);
          }
        }
        this._maybeTriggerAttackerSwing(m, 'm' + m.mid);
        break;
      }
      case 'mob_effects': {
        const rem = this.remote.get('m' + m.mid);
        if (rem) rem.effects = m.effects || [];
        if (g.target && g.target.obj && g.target.obj.mid === m.mid) {
          g.target.obj.effects = m.effects || [];
        }
        if (g.player && g.player.target && g.player.target.mid === m.mid) {
          g.player.target.effects = m.effects || [];
        }
        if ((g.player && g.player.target && g.player.target.mid === m.mid) ||
            (g.target && g.target.obj && g.target.obj.mid === m.mid)) {
          if (g.ui && typeof g.ui.setTargetStatusEffects === 'function') {
            g.ui.setTargetStatusEffects(m.effects || []);
          }
        }
        break;
      }
      case 'dmg_player': {
        // Если это локальный игрок — он уже обработан через 'hit'
        if (this.pid != null && m.pid === this.pid) break;
        const isTargetOfPlayer = (g.player && g.player.target && g.player.target.pid === m.pid);
        const pos = this.posOf('p' + m.pid);
        if (m.miss) {
          if (isTargetOfPlayer && g.ui) g.ui.showDamageNumber(pos, 0, 'miss');
          this._maybeTriggerAttackerSwing(m, 'p' + m.pid);
          break;
        }
        if (isTargetOfPlayer && g.ui) {
          g.ui.showDamageNumber(pos, m.dmg, m.crit ? 'crit' : (m.blocked ? 'block' : 'normal'));
        }
        this._maybeTriggerAttackerSwing(m, 'p' + m.pid);
        break;
      }
      case 'hit': {
        const isMiss = !!m.miss;
        if (g.player.isDead) break;
        if (isMiss) {
          if (g.ui) g.ui.showDamageNumber(g.player.mesh.position, 0, 'miss');
          let srcName = m.mobName || null;
          let srcMobId = m.mobId || null;
          if (m.by && m.by[0] === 'm') {
            const rem = this.remote.get(m.by);
            if (rem) {
              srcMobId = rem.mobId || srcMobId;
              if (!srcName && rem.name) srcName = rem.name;
            }
            this.playMobAttackAnim(m.by);
          } else if (m.by && m.by[0] === 'p') {
            srcName = this._nameOf(m.by) || srcName;
          }
          if (srcMobId && (!srcName || !/[А-Яа-яЁё]/.test(String(srcName)))) {
            srcName = this.mobDisplayName(srcMobId, srcName) || srcName;
          }
          if (g.ui && g.ui.chatDamage) {
            g.ui.chatDamage({ missed: true, incoming: true, sourceName: srcName, sourceMobId: srcMobId });
          }
          break;
        }
        const dmgIn = Math.max(0, +m.dmg || 0);
        const isCrit = !!m.crit;
        g.player.hp = Math.max(0, g.player.hp - dmgIn);
        if (g.ui) g.ui.showDamageNumber(g.player.mesh.position, dmgIn, isCrit ? 'crit' : 'normal');
        if (window.GameAudio && typeof window.GameAudio.play === 'function') {
          window.GameAudio.play(isCrit ? 'crit' : 'hit', g.player ? g.player.mesh.position : null);
        }
        // Animated hit on player (mob → player)
        if (window.SkillVFX && typeof window.SkillVFX.playCombatHit === 'function') {
          window.SkillVFX.playCombatHit(g.player, { crit: isCrit, incoming: true });
        }
        // Soft lock until you_died arrives (full corpse + dialog)
        if (g.player.hp <= 0) {
          g.player.isMoving = false;
          g.player._pendingMove = null;
          if (typeof g.player.stopAutoAttack === 'function') g.player.stopAutoAttack();
          if (g.player._charModel && typeof g.player._charModel.playDeath === 'function') {
            try { g.player._charModel.playDeath(); } catch (e) { /* ignore */ }
          }
        }
        // Имя: mobName с сервера → remote → локализация по mobId (без «Враг»)
        let srcName = m.mobName || null;
        let srcMobId = m.mobId || null;
        if (m.by && m.by[0] === 'm') {
          const rem = this.remote.get(m.by);
          if (rem) {
            srcMobId = rem.mobId || srcMobId;
            if (!srcName && rem.name) srcName = rem.name;
          }
          // attack sheet when mob hits the player
          this.playMobAttackAnim(m.by);
        } else if (m.by && m.by[0] === 'p') {
          srcName = this._nameOf(m.by) || srcName;
        }
        if (srcMobId && (!srcName || !/[А-Яа-яЁё]/.test(String(srcName)))) {
          srcName = this.mobDisplayName(srcMobId, srcName) || srcName;
        }
        const skillRu = m.skillName || this._skillName(m.skillId) || null;
        if (g.ui && g.ui.chatDamage) {
          g.ui.chatDamage({
            dmg: dmgIn, incoming: true, crit: isCrit,
            sourceName: srcName,
            sourceMobId: srcMobId,
            skillName: skillRu,
            skillId: m.skillId || null
          });
        }
        if (skillRu || m.skillId) {
          const sn = skillRu || this._skillName(m.skillId) || m.skillId;
          // skip raw snake_case ids in chat
          const pretty = (sn && !/^[a-z0-9_]+$/.test(String(sn))) ? sn : this._skillName(m.skillId) || sn;
          if (typeof g.addChatMessage === 'function' && pretty && dmgIn > 0 && m.by !== 'dot') {
            g.addChatMessage(
              (srcName || 'Моб') + ' → «' + pretty + '» (−' + dmgIn + ')',
              isCrit ? 'damage' : 'system'
            );
          } else if (typeof g.addChatMessage === 'function' && pretty && m.by === 'dot') {
            g.addChatMessage(pretty + ' (−' + dmgIn + ')', 'damage');
          }
        }
        // L2 status icons + local effect mirror
        if (m.effects && m.effects.length && g.ui && g.ui.applyStatusEffects) {
          g.ui.applyStatusEffects(m.effects);
        }
        if (m.effects && m.effects.length && g.player) {
          this._applyLocalStatus(g.player, m.effects);
        }
        // Cast cancel — boosted in L2_COMBAT.calcCastCancel (mobs pressure casters)
        if (g.player.skillManager && g.player.skillManager.casting && dmgIn > 0) {
          const shouldBreak = (typeof g.player._rollCastBreak === 'function')
            ? g.player._rollCastBreak(dmgIn)
            : (window.L2_COMBAT && window.L2_COMBAT.rollCastCancel
              ? window.L2_COMBAT.rollCastCancel(
                dmgIn,
                (g.player.primary && g.player.primary.MEN != null) ? g.player.primary.MEN : 25,
                g.player.maxHp || 100
              )
              : false);
          if (shouldBreak) g.player.skillManager.cancelCast('урон');
        }
        break;
      }
      case 'mob_dead': {
        const deadMid = m.mid;
        const deadKey = 'm' + deadMid;
        const deadPos = this.posOf(deadKey);
        if (window.GameAudio && typeof window.GameAudio.play === 'function') {
          window.GameAudio.play('death', deadPos);
        }
        // Zero HP on client remotes / target BEFORE remove (bar must hit 0%)
        const remDead = this.remote.get(deadKey);
        if (remDead) {
          remDead.hp = 0;
        }
        for (const [, r] of this.remote) {
          if (r && r.type === 'p' && r._combatTarget === deadKey) {
            r._combatTarget = null;
            r._combatFaceTimer = 0;
            r._attackTimer = 0;
            if (r._charModel && r._charModel.state === 'attack' && typeof r._charModel.playIdle === 'function') {
              r._charModel.playIdle();
            }
          }
        }
        if (g.player && g.player.target && g.player.target.mid === deadMid) {
          g.player.target.hp = 0;
          // Мгновенно останавливаем автоатаку игрока по мёртвой цели и сбрасываем таргет!
          if (typeof g.player.stopAutoAttack === 'function') g.player.stopAutoAttack();
          if (g.ui && typeof g.ui.showTargetDead === 'function') {
            g.ui.showTargetDead(g.player.target);
          } else if (g.ui && typeof g.ui.showTargetStatus === 'function') {
            g.ui.showTargetStatus(g.player.target);
          }
          g.player.target = null;
        }
        // Play death sheet (or short fade) then remove
        this.playMobDeath(deadKey, () => {
          for (const [, r] of this.remote) {
            if (r && r.type === 'p' && r._combatTarget === deadKey) {
              r._combatTarget = null;
              r._combatFaceTimer = 0;
              r._attackTimer = 0;
              if (r._charModel && r._charModel.state === 'attack' && typeof r._charModel.playIdle === 'function') {
                r._charModel.playIdle();
              }
            }
          }
          // Target dead → stop AA punch loop → idle
          if (g.player && g.player.target && g.player.target.mid === deadMid) {
            if (typeof g.player.onTargetKilled === 'function') g.player.onTargetKilled();
            else {
              g.player.target = null;
              if (typeof g.player.stopAutoAttack === 'function') g.player.stopAutoAttack();
              if (g.ui && g.ui.hideTargetStatus) g.ui.hideTargetStatus();
            }
          }
        });
        break;
      }
      case 'player_dead': {
        const rem = m.pid != null ? this.remote.get('p' + m.pid) : null;
        if (rem) {
          rem.dead = true;
          rem._moveVec = null;
          const cm = rem._charModel || rem.charModel;
          if (cm && typeof cm.playDeath === 'function') {
            try { cm.playDeath(); } catch (e) {}
          }
        }
        if (g.player && m.pid === this.pid) {
          g.player.isDead = true;
          const cm = g.player._charModel;
          if (cm && typeof cm.playDeath === 'function') {
            try { cm.playDeath(); } catch (e) {}
          }
        }
        const pdeadPos = m.pid != null ? this.posOf('p' + m.pid) : null;
        if (window.GameAudio && typeof window.GameAudio.play === 'function') {
          if (m.pid === this.pid || (pdeadPos && this.distToPlayer(pdeadPos) < 15)) {
            window.GameAudio.play('death', pdeadPos);
          }
        }
        // Сообщение о PvP только при реальном PvP (есть killerPid) и если касается игрока
        if (m.killerPid != null) {
          const killerName = m.killerName || this._nameOf('p' + m.killerPid) || 'Игрок';
          const victimName = (m.pid === this.pid ? 'Вы' : (this._nameOf('p' + m.pid) || 'Игрок'));
          if (m.pid === this.pid || m.killerPid === this.pid) {
            g.addChatMessage(`${victimName} повержен в PvP (${killerName}).`, 'damage');
          }
        } else if (m.byMob && m.pid === this.pid) {
          g.addChatMessage(`Вы погибли от удара: ${m.killerName || 'Монстр'}.`, 'damage');
        }
        break;
      }
      case 'player_revived': {
        const rem = m.pid != null ? this.remote.get('p' + m.pid) : null;
        if (rem) {
          rem.dead = false;
          const cm = rem._charModel || rem.charModel;
          if (cm && typeof cm.playRevive === 'function') {
            try { cm.playRevive(); } catch (e) {}
          } else if (cm && typeof cm.playIdle === 'function') {
            try { cm.playIdle(); } catch (e) {}
          }
        }
        if (g.player && m.pid === this.pid) {
          g.player.isDead = false;
          const cm = g.player._charModel;
          if (cm && typeof cm.playRevive === 'function') {
            try { cm.playRevive(); } catch (e) {}
          } else if (cm && typeof cm.playIdle === 'function') {
            try { cm.playIdle(); } catch (e) {}
          }
        }
        if (m.mode === 'resurrect') {
          const name = (rem && rem.name) || ('Игрок #' + m.pid);
          g.addChatMessage(`✨ ${name} был воскрешен!`, 'system');
        }
        break;
      }
      case 'resurrect_fx': {
        const tgtPid = m.pid;
        const tgtEntity = (g.player && g.player.pid === tgtPid) ? g.player : (this.remote.get('p' + tgtPid) || null);
        const casterEntity = m.casterPid != null ? ((g.player && g.player.pid === m.casterPid) ? g.player : (this.remote.get('p' + m.casterPid) || null)) : null;
        if (window.SkillVFX && typeof window.SkillVFX.playResurrectionVFX === 'function') {
          window.SkillVFX.playResurrectionVFX(casterEntity, tgtEntity, {
            x: m.x, y: m.y, z: m.z,
            targetName: m.targetName,
            casterName: m.casterName
          });
        }
        break;
      }
      case 'party_invite_dialog': {
        if (g.ui && typeof g.ui.showPartyInviteDialog === 'function') {
          g.ui.showPartyInviteDialog(m.from, m.fromName);
        }
        break;
      }
      case 'duel_invite': {
        if (g.ui && typeof g.ui.showDuelInviteDialog === 'function') {
          g.ui.showDuelInviteDialog(m.from, m.fromName);
        } else {
          g.addChatMessage((m.fromName || 'Игрок') + ' вызывает на дуэль: /duel_accept', 'system');
        }
        break;
      }
      case 'duel_start': {
        this.dueling = true;
        this.duelPeer = m.peer;
        g.addChatMessage('Дуэль с ' + (m.peerName || 'игроком') + ' началась!', 'damage');
        break;
      }
      case 'duel_end': {
        this.dueling = false;
        this.duelPeer = null;
        if (g.ui && typeof g.ui.hideDuelInviteDialog === 'function') g.ui.hideDuelInviteDialog();
        const res = m.result;
        if (res === 'win') {
          const me = this.pid;
          if (m.winner === me) g.addChatMessage('Вы победили в дуэли!', 'system');
          else g.addChatMessage('Вы проиграли дуэль.', 'damage');
        } else if (res === 'timeout') {
          g.addChatMessage('Время дуэли истекло.', 'system');
        } else {
          g.addChatMessage('Дуэль прервана.', 'system');
        }
        break;
      }
      case 'duel_fail': {
        const why = {
          self: 'Нельзя вызвать самого себя.',
          no_target: 'Игрок не найден.',
          dead: 'Дуэль недоступна: кто-то мёртв.',
          flagged: 'Нельзя начать дуэль в PvP.',
          busy: 'Игрок занят.',
          range: 'Слишком далеко для вызова.',
          no_invite: 'Нет вызова на дуэль.',
          declined: (m.name || 'Игрок') + ' отклонил дуэль.',
          offline: 'Игрок оффлайн.',
          no_duel: 'Вы не в дуэли.'
        };
        g.addChatMessage(why[m.reason] || 'Дуэль не состоялась.', 'system');
        break;
      }
      case 'duel_fx': {
        const r = this.remote.get('p' + m.pid);
        if (r) {
          r.dueling = !!m.dueling;
          this._refreshRemoteNameTag(r);
        }
        break;
      }
      case 'party': {
        this.party = m.members || [];
        // Режим лута считает сервер; клиент только показывает и просит сменить.
        this.partyLootMode = m.lootMode || 'random';
        this.partyLeader = m.leader != null ? m.leader : null;
        const partyPids = new Set(this.party.map(x => x.pid));
        for (const [, r] of this.remote) {
          if (r.type === 'p') r.isPartyMember = partyPids.has(r.pid);
        }
        if (g.ui && typeof g.ui.hidePartyInviteDialog === 'function') {
          g.ui.hidePartyInviteDialog();
        }
        if (g.ui && typeof g.ui.updateParty === 'function') {
          g.ui.updateParty(m.members || [], m.leader);
        }
        break;
      }

      // ─── Ground loot (server authority) ───
      case 'loot_spawn': {
        // Chat only on first spawn (owner gets broadcast + direct send — dedupe via return)
        const created = g.lootManager ? g.lootManager.applyServerSpawn(m) : false;
        if (created) {
          if (window.GameAudio && typeof window.GameAudio.play === 'function') {
            window.GameAudio.play('loot', { x: m.x, y: m.y, z: m.z });
          }
          const nm = m.name || this._itemName(m.itemId);
          const n = m.count || 1;
          const isParty = this.party && this.party.some(x => x.pid === m.ownerPid || (m.winnerPid != null && x.pid === m.winnerPid));
          const mine = (m.ownerPid == null || m.ownerPid === this.pid || (m.winnerPid != null && m.winnerPid === this.pid));
          if (mine || isParty) {
            const tag = m.spoil ? ' (вскрытие)' : '';
            g.addChatMessage('Выпало: ' + nm + ' x' + n + tag + ' — подберите', 'loot');
          }
        }
        break;
      }
      case 'loot_snapshot': {
        if (g.lootManager) g.lootManager.applySnapshot(m.loots || []);
        break;
      }
      case 'loot_remove': {
        if (g.lootManager) {
          g.lootManager.applyServerRemove(m.lid, { effect: m.reason !== 'expired' });
        }
        break;
      }
      case 'loot_pickup_ok': {
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('loot');
        if (g.lootManager) g.lootManager.applyServerRemove(m.lid, { effect: true });
        const nm = this._itemName(m.itemId);
        const tag = m.spoil ? ' (вскрытие)' : '';
        if (m.partyShare) {
          g.addChatMessage('Подобрано: ' + nm + ' x' + (m.totalCount || m.count) + tag + ' (ваша доля: ' + m.count + ')', 'loot');
        } else if (m.recipientName) {
          g.addChatMessage('Подобрано: ' + nm + ' x' + (m.count || 1) + tag + ' (получил ' + m.recipientName + ')', 'loot');
        } else {
          g.addChatMessage('Подобрано: ' + nm + ' x' + (m.count || 1) + tag, 'loot');
        }
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'party_loot_received': {
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('loot');
        if (g.lootManager && m.lid != null) g.lootManager.applyServerRemove(m.lid, { effect: true });
        const nm = this._itemName(m.itemId);
        const tag = m.spoil ? ' (вскрытие)' : '';
        g.addChatMessage((m.pickerName ? m.pickerName + ' подобрал: ' : '') + nm + ' x' + (m.count || 1) + tag + ' для вас!', 'loot');
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'party_currency_share': {
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('loot');
        const nm = this._itemName(m.itemId);
        if (m.pickerName) {
          g.addChatMessage(m.pickerName + ' подобрал ' + nm + ' x' + m.totalCount + '. Ваша доля: ' + m.count + '.', 'loot');
        } else {
          g.addChatMessage('Доля группы: ' + nm + ' x' + m.count + '.', 'loot');
        }
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'loot_fail': {
        if (g.lootManager && m.lid != null) g.lootManager.pendingPickup.delete(+m.lid);
        if (m.reason === 'protected') {
          g.addChatMessage('Лут защищён — подождите.', 'system');
        } else if (m.reason === 'party_mode') {
          // Режим лута пати: победитель зафиксирован при падении пачки.
          const w = (this.party || []).find(x => x.pid === m.winnerPid);
          g.addChatMessage('Лут группы достался ' + (w ? w.name : 'другому участнику') + '.', 'system');
        } else if (m.reason === 'range') {
          g.addChatMessage('Подойдите ближе к луту.', 'system');
        } else if (m.reason === 'gone' || m.reason === 'expired') {
          g.addChatMessage('Лут исчез.', 'system');
          if (g.lootManager) g.lootManager.applyServerRemove(m.lid);
        } else if (m.reason === 'weight') {
          g.addChatMessage('Слишком тяжело — освободите сумку.', 'system');
        } else if (m.reason === 'inv_full') {
          g.addChatMessage('Инвентарь полон — нет свободного места.', 'system');
        } else if (m.reason === 'enchanted') {
          g.addChatMessage('Нельзя смешать заточенные и обычные копии.', 'system');
        }
        break;
      }
      case 'drop_ok': {
        const nm = this._itemName(m.itemId);
        g.addChatMessage('Выброшено: ' + nm + ' x' + (m.count || 1), 'loot');
        // Server returns full inv + equip after drop
        if (m.inv || m.equip) {
          if (m.equip) g._serverEquip = m.equip;
          this.applyInv(m.inv || {}, m.equip || g._serverEquip);
        }
        if (g.inventoryUI && typeof g.inventoryUI.render === 'function') g.inventoryUI.render();
        if (g.player && typeof g.player.syncWeaponVisual === 'function') g.player.syncWeaponVisual();
        break;
      }
      case 'drop_fail': {
        const why = {
          none: 'Нет такого предмета.',
          args: 'Неверные данные.',
          dead: 'Нельзя выбрасывать, пока вы без сознания.'
        };
        g.addChatMessage(why[m.reason] || 'Не удалось выбросить предмет.', 'system');
        break;
      }
      case 'destroy_ok': {
        const nm = this._itemName(m.itemId);
        g.addChatMessage('Предмет «' + nm + '» уничтожен.', 'damage');
        if (m.inv || m.equip) {
          if (m.equip) g._serverEquip = m.equip;
          this.applyInv(m.inv || {}, m.equip || g._serverEquip);
        }
        if (g.inventoryUI) {
          g.inventoryUI.selectedItem = null;
          if (typeof g.inventoryUI.render === 'function') g.inventoryUI.render();
        }
        if (g.player && typeof g.player.syncWeaponVisual === 'function') g.player.syncWeaponVisual();
        break;
      }
      case 'destroy_fail': {
        const why = {
          none: 'Нет такого предмета.',
          args: 'Неверные данные.',
          dead: 'Нельзя уничтожать предметы без сознания.'
        };
        g.addChatMessage(why[m.reason] || 'Не удалось уничтожить предмет.', 'system');
        break;
      }

      case 'reward': {
        // Legacy / craft paths may still send reward with inv.
        // Mob kills no longer auto-grant loot here.
        if (m.adena) g.addChatMessage('+' + m.adena + ' медных деталей', 'loot');
        (m.items || []).forEach(it => {
          const nm = this._itemName(it.id || it.templateId);
          g.addChatMessage('  • ' + nm + ' x' + (it.count || 1), 'loot');
        });
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'reward_exp':
      case 'party_exp': {
        const tag = m.t === 'party_exp'
          ? (m.partyBonus && m.partyBonus > 1
            ? ' (группа ×' + Number(m.partyBonus).toFixed(1) + ')'
            : ' (группа)')
          : '';
        const expN = Math.max(0, Math.floor(+m.exp || 0));
        const spN = Math.max(0, Math.floor(+m.sp || 0));
        let mobLabel = m.mobName || null;
        if (m.mobId) mobLabel = this.mobDisplayName(m.mobId, mobLabel || m.mobId);
        const ml = (m.mobLevel != null && m.mobLevel > 0) ? m.mobLevel : null;
        if (expN > 0 || spN > 0) {
          const rewardPart = '+' + expN + ' опыта' + (spN ? ', +' + spN + ' SP' : '') + tag;
          if (mobLabel && /[А-Яа-яЁё]/.test(String(mobLabel))) {
            const lvPart = ml != null ? ' (Ур.' + ml + ')' : '';
            g.addChatMessage('Убит: ' + mobLabel + lvPart + '. ' + rewardPart, 'loot');
          } else {
            g.addChatMessage(rewardPart, 'loot');
          }
        }
        if (g.player.levelSystem) {
          g.player.levelSystem.exp = m.selfExp != null ? m.selfExp : (g.player.levelSystem.exp + expN);
          if (m.selfSp != null) g.player.levelSystem.sp = m.selfSp;
          else if (spN) g.player.levelSystem.sp = (g.player.levelSystem.sp || 0) + spN;
          if (m.level) g.player.levelSystem.level = m.level;
          if (m.expToNext != null) g.player.levelSystem.expToNext = m.expToNext;
          g.player.syncFromLevelSystem();
        } else {
          g.player.exp = m.selfExp != null ? m.selfExp : ((g.player.exp || 0) + expN);
          if (spN) g.player.sp = (g.player.sp || 0) + spN;
        }
        break;
      }
      case 'skill_ok': {
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('spell_cast');
        g.player.energy = m.energy;
        g.player.hp = m.hp;
        if (m.maxHp) g.player.maxHp = m.maxHp;
        if (m.maxEnergy) g.player.maxEnergy = m.maxEnergy;
        if (g.player.skillManager && m.skillId && m.cooldown) {
          g.player.skillManager.setCooldown(m.skillId, m.cooldown);
        }
        (m.results || []).forEach((r) => {
          if (r.kind === 'heal') g.addChatMessage('Восстановлено: ' + r.amount + ' ОЗ', 'loot');
          if (r.kind === 'buff') {
            const nm = this._skillName(m.skillId) || 'умение';
            g.addChatMessage(
              r.immortal
                ? ('Бессмертие активно' + (r.duration != null ? ' (' + Math.round(r.duration) + 'с)' : ''))
                : ('Бафф: ' + nm),
              'system'
            );
          }
          if (r.kind === 'immune') {
            g.addChatMessage('Цель неуязвима.', 'system');
          }
          if (r.kind === 'miss') {
            const pos = r.mid != null ? this.posOf('m' + r.mid) : g.player.mesh.position;
            if (g.ui) g.ui.showDamageNumber(pos, 0, 'miss');
            if (g.ui && g.ui.chatDamage && r.mid != null) {
              const remM = this.remote.get('m' + r.mid);
              g.ui.chatDamage({
                missed: true,
                skillName: m.skillId ? this._skillName(m.skillId) : null,
                targetName: r.mobName || this._nameOf('m' + r.mid),
                targetMobId: r.mobId || (remM && remM.mobId) || null
              });
            }
          }
          if (r.kind === 'resist') {
            g.addChatMessage('Сопротивление!', 'system');
          }
          if (r.kind === 'slow') g.addChatMessage('Замедление −' + Math.round((r.pct || 0) * 100) + '%', 'system');
          if (r.kind === 'weakness') g.addChatMessage('Ослабление −' + Math.round((r.pct || 0) * 100) + '% физ. атаки', 'system');
          if (r.kind === 'poison') g.addChatMessage('Коррозия (урон со временем)', 'system');
          if (r.kind === 'debuff_applied' && r.mid != null) {
            const rem = this.remote.get('m' + r.mid);
            if (rem) {
              if (!rem.effects) rem.effects = [];
              rem.effects = rem.effects.filter(e => e.id !== r.id && e.until > Date.now());
              rem.effects.push({
                id: r.id,
                name: r.name,
                kind: r.kind || 'debuff',
                until: r.until,
                duration: r.duration,
                icon: r.icon
              });
            }
            if (g.player.target && g.player.target.mid === r.mid) {
              if (g.ui && typeof g.ui.applyTargetStatusEffects === 'function') {
                g.ui.applyTargetStatusEffects([{
                  id: r.id,
                  name: r.name,
                  kind: 'debuff',
                  until: r.until,
                  duration: r.duration,
                  icon: r.icon
                }]);
              }
            }
          }
          if ((r.kind === 'slow' || r.kind === 'weakness' || r.kind === 'poison') && r.mid != null && r.duration) {
            const now = Date.now();
            const effObj = {
              id: m.skillId || r.kind,
              name: this._skillName(m.skillId) || r.kind,
              kind: 'debuff',
              until: now + r.duration * 1000,
              duration: r.duration,
              icon: m.skillId || r.kind
            };
            const rem = this.remote.get('m' + r.mid);
            if (rem) {
              if (!rem.effects) rem.effects = [];
              rem.effects = rem.effects.filter(e => e.id !== effObj.id && e.until > now);
              rem.effects.push(effObj);
            }
            if (g.player.target && g.player.target.mid === r.mid) {
              if (g.ui && typeof g.ui.applyTargetStatusEffects === 'function') {
                g.ui.applyTargetStatusEffects([effObj]);
              }
            }
          }
          if (r.kind === 'dmg' && r.mid != null) {
            const pos = this.posOf('m' + r.mid);
            const rem = this.remote.get('m' + r.mid);
            if (g.ui) g.ui.showDamageNumber(pos, r.dmg, r.crit ? 'crit' : (r.blocked ? 'block' : 'normal'));
            if (g.ui && g.ui.chatDamage) {
              g.ui.chatDamage({
                dmg: r.dmg, crit: !!r.crit, blocked: !!r.blocked,
                skillName: m.skillId ? this._skillName(m.skillId) : null,
                targetName: r.mobName || this._nameOf('m' + r.mid),
                targetMobId: r.mobId || (rem && rem.mobId) || null
              });
            }
            if (rem) rem.hp = r.hp;
            if (g.player.target && g.player.target.mid === r.mid) g.player.target.hp = r.hp;
          }
          if (r.kind === 'dmg_player' && r.pid != null) {
            const pos = this.posOf('p' + r.pid);
            if (g.ui) g.ui.showDamageNumber(pos, r.dmg, r.crit ? 'crit' : 'normal');
            if (g.ui && g.ui.chatDamage) {
              g.ui.chatDamage({
                dmg: r.dmg, crit: !!r.crit,
                skillName: m.skillId ? this._skillName(m.skillId) : null,
                targetName: this._nameOf('p' + r.pid)
              });
            }
          }
        });
        break;
      }
      case 'skill_fail': {
        // сервер — источник правды по пару/HP (откат оптимистичного списания)
        if (m.energy != null) g.player.energy = m.energy;
        if (m.maxEnergy != null) g.player.maxEnergy = m.maxEnergy;
        if (m.hp != null) g.player.hp = m.hp;
        if (m.maxHp != null) g.player.maxHp = m.maxHp;
        const reasons = {
          energy: 'Недостаточно пара!' +
            (m.need != null ? ' (нужно ' + m.need + ', есть ' + Math.floor(m.energy || g.player.energy || 0) + ')' : ''),
          cooldown: 'Умение на перезарядке.',
          range: 'Слишком далеко.',
          no_target: 'Нет цели.',
          not_learned: 'Умение не изучено.',
          class: 'Недоступно для класса.',
          level: 'Недостаточный уровень (для изучения; уже выученное не блокируется).',
          target: 'Неверная цель.',
          unknown: 'Неизвестное умение.',
          passive: 'Пассивное умение.',
          peace: 'В мирной зоне нельзя атаковать.',
          los: 'Цель не в зоне видимости.',
          weight: 'Слишком тяжело — нельзя использовать умения.',
          stun: 'Вы оглушены.'
        };
        g.addChatMessage(reasons[m.reason] || 'Умение недоступно.', 'system');
        break;
      }
      case 'vitals': {
        if (m.hp != null) g.player.hp = m.hp;
        if (m.maxHp != null) g.player.maxHp = m.maxHp;
        if (m.energy != null) g.player.energy = m.energy;
        if (m.maxEnergy != null) g.player.maxEnergy = m.maxEnergy;
        break;
      }
      case 'effects': {
        const all = [].concat(m.buffs || [], m.debuffs || []);
        if (g.ui && g.ui.setStatusEffects) g.ui.setStatusEffects(all);
        if (g.player) {
          g.player.buffs = m.buffs || [];
          g.player.slowUntil = 0;
          g.player.stunUntil = 0;
          g.player.silenceUntil = 0;
          this._applyLocalStatus(g.player, m.debuffs || []);
          if (typeof g.player.pullL2Stats === 'function') {
            g.player.pullL2Stats();
          }
          if (g.charMenu && g.charMenu.isOpen && typeof g.charMenu.renderStatus === 'function') {
            g.charMenu.renderStatus();
          }
        }
        break;
      }
      case 'status_fx': {
        if (m.effects && m.effects.length) {
          if (g.ui && g.ui.applyStatusEffects) g.ui.applyStatusEffects(m.effects);
          if (g.player) this._applyLocalStatus(g.player, m.effects);
          // chat once with RU effect names
          const names = m.effects.map((e) => e && e.name).filter(Boolean);
          if (names.length && typeof g.addChatMessage === 'function') {
            const sk = m.skillName || this._skillName(m.skillId) || '';
            g.addChatMessage(
              (sk ? sk + ' → ' : '') + names.join(', '),
              'system'
            );
          }
        }
        break;
      }
      case 'cast_start': {
        const casterPid = (m.fromPid != null ? m.fromPid : m.pid);
        if (casterPid != null && casterPid !== this.pid) {
          const caster = this.remote.get('p' + casterPid) || null;
          let target = null;
          let targetKey = null;
          if (m.mid != null) {
            targetKey = 'm' + m.mid;
            if (g.spawnManager && g.spawnManager.getEnemy) {
              target = g.spawnManager.getEnemy(m.mid) || null;
            } else {
              target = this.remote.get(targetKey) || null;
            }
          } else if (m.targetPid != null) {
            targetKey = 'p' + m.targetPid;
            target = (m.targetPid === this.pid) ? g.player : (this.remote.get('p' + m.targetPid) || null);
          }
          if (caster) {
            let facing = (m.facing != null && isFinite(m.facing)) ? m.facing : null;
            if (facing == null && target) {
              const cx = (caster.meshGroup && caster.meshGroup.position) ? caster.meshGroup.position.x : caster.x;
              const cz = (caster.meshGroup && caster.meshGroup.position) ? caster.meshGroup.position.z : caster.z;
              const tx = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.x
                : ((target.mesh && target.mesh.position) ? target.mesh.position.x
                : ((target.sprite && target.sprite.position) ? target.sprite.position.x : target.x));
              const tz = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.z
                : ((target.mesh && target.mesh.position) ? target.mesh.position.z
                : ((target.sprite && target.sprite.position) ? target.sprite.position.z : target.z));
              if (typeof cx === 'number' && typeof tx === 'number' && typeof cz === 'number' && typeof tz === 'number') {
                const dx = tx - cx;
                const dz = tz - cz;
                if (dx * dx + dz * dz > 0.0001) facing = Math.atan2(dx, dz);
              }
            }
            if (facing != null && isFinite(facing)) {
              caster.facing = facing;
              if (caster._charModel && typeof caster._charModel.setFacing === 'function') {
                caster._charModel.setFacing(facing);
              }
              if (caster._auraRoot) caster._auraRoot.rotation.y = facing;
            }
            if (targetKey) {
              caster._combatTarget = targetKey;
              caster._combatFaceTimer = Math.max(1.5, (m.castSec || 1.0) + 0.5);
            }
            if (caster._moveVec) caster._moveVec = null;
            if (caster._charModel) {
              if (typeof caster._charModel.setMoving === 'function') caster._charModel.setMoving(false);
              if (typeof caster._charModel.playCast === 'function') caster._charModel.playCast(m.skillId || 'skill');
            }
            if (window.SkillVFX && window.SkillVFX.startCast) {
              try {
                window.SkillVFX.startCast(m.skillId, caster, target);
              } catch (e) {}
            }
          }
        }
        break;
      }
      case 'cast_cancel': {
        if (m.pid === this.pid) {
          if (g.player && g.player.skillManager && g.player.skillManager.cancelCast) {
            g.player.skillManager.cancelCast(m.reason === 'interrupted' ? 'урон' : m.reason);
          }
        } else {
          const caster = this.remote.get('p' + m.pid) || null;
          if (caster) {
            caster._combatTarget = null;
            caster._combatFaceTimer = 0;
            if (caster._charModel && caster._charModel.state === 'cast' && typeof caster._charModel.playIdle === 'function') {
              caster._charModel.playIdle();
            }
            if (window.SkillVFX && window.SkillVFX.stopCast) {
              try { window.SkillVFX.stopCast(true); } catch (_) {}
            }
          }
        }
        break;
      }
      case 'skill_fx': {
        // Mob cast ONLY when fromMob:true (do NOT treat player skill mid=target as mob cast —
        // that reversed VFX: player→mob then bogus mob→player).
        if (m.fromMob === true && m.mid != null) {
          const key = 'm' + m.mid;
          const rec = this.remote.get(key) || null;
          const caster = rec
            ? { mesh: rec.sprite || rec.mesh, baseScale: rec.baseScale || (rec.sprite && rec.sprite.scale && rec.sprite.scale.x), name: rec.name }
            : null;
          // L2 mob skill: monster skill ANIM (attack sheet) + skill effect on target.
          // NOT player-style blue cast circle under the mob (that's PC casting).
          this.playMobAttackAnim(key);
          if (rec) {
            rec.combatFaceT = 1.8;
            if (rec.sheetAnims && rec.sheetAnims.attack) {
              rec._skillCastHold = 0.45;
            }
          }
          // Resolve target entity (bot or local player)
          let targetEnt = null;
          let isTargetingLocalPlayer = false;
          if (m.targetPid != null) {
            if (this.pid != null && m.targetPid === this.pid) {
              targetEnt = g.player;
              isTargetingLocalPlayer = true;
            } else {
              targetEnt = this.remote.get('p' + m.targetPid) || null;
            }
          }

          if (window.SkillVFX && m.skillId) {
            try {
              // effect on target entity (or caster if no target specified)
              const played = window.SkillVFX.playMobSkill
                ? window.SkillVFX.playMobSkill(m.skillId, caster, targetEnt, { fromMob: true })
                : false;
              if (!played && window.SkillVFX.playSkill) {
                window.SkillVFX.playSkill(m.skillId, caster, targetEnt, { fromMob: true });
              }
            } catch (eFx) {
              console.warn('[skill_fx] VFX', m.skillId, eFx);
            }
          }
          if (window.GameAudio && typeof window.GameAudio.play === 'function') {
            const castPos = (caster && caster.mesh && caster.mesh.position) || this.posOf(key);
            window.GameAudio.play('spell_cast', castPos);
          }
          const nm = m.skillName || m.name || this._skillName(m.skillId);
          const who = (rec && rec.name) || this.mobDisplayName(m.mobId) || 'Моб';
          // Не спамить чат игрока чужими мобами: выводить только если скилл летит в локального игрока или в цель игрока
          const isMyTargetMob = (g.player && g.player.target && g.player.target.mid === m.mid);
          if (typeof g.addChatMessage === 'function' && nm && !/^[a-z0-9_]+$/.test(String(nm))) {
            if (isTargetingLocalPlayer || isMyTargetMob) {
              g.addChatMessage(who + ': «' + nm + '»', 'system');
            }
          }
          break;
        }
        // Other players' casts (local already plays VFX on cast complete — skip self)
        // Server may send pid or fromPid as caster id; mid = target mob, targetPid = target player
        const casterPid = (m.fromPid != null ? m.fromPid : m.pid);
        if (window.SkillVFX && m.skillId && casterPid != null && casterPid !== this.pid) {
          if (window.GameAudio && typeof window.GameAudio.play === 'function') {
            const castPos = this.posOf('p' + casterPid);
            window.GameAudio.play('spell_cast', castPos);
          }
          const caster = this.remote.get('p' + casterPid) || null;
          let target = null;
          let targetKey = null;
          if (m.mid != null) {
            targetKey = 'm' + m.mid;
            target = (window.SkillVFX.resolveTargetByMid && window.SkillVFX.resolveTargetByMid(m.mid))
              || this.remote.get(targetKey)
              || null;
          } else if (m.targetPid != null) {
            targetKey = 'p' + m.targetPid;
            target = (m.targetPid === this.pid) ? g.player : (this.remote.get(targetKey) || null);
          }

          // Поворот кастера лицом к цели
          if (caster && target) {
            const cx = (caster.meshGroup && caster.meshGroup.position) ? caster.meshGroup.position.x : caster.x;
            const cz = (caster.meshGroup && caster.meshGroup.position) ? caster.meshGroup.position.z : caster.z;
            const tx = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.x
              : ((target.mesh && target.mesh.position) ? target.mesh.position.x
              : ((target.sprite && target.sprite.position) ? target.sprite.position.x : target.x));
            const tz = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.z
              : ((target.mesh && target.mesh.position) ? target.mesh.position.z
              : ((target.sprite && target.sprite.position) ? target.sprite.position.z : target.z));
            if (typeof cx === 'number' && typeof tx === 'number' && typeof cz === 'number' && typeof tz === 'number') {
              const dx = tx - cx;
              const dz = tz - cz;
              if (dx * dx + dz * dz > 0.0001) {
                const facing = Math.atan2(dx, dz);
                caster.facing = facing;
                if (caster._charModel && typeof caster._charModel.setFacing === 'function') caster._charModel.setFacing(facing);
                if (caster._auraRoot) caster._auraRoot.rotation.y = facing;
              }
            }
          }

          // Запуск анимации скилла на модели кастера
          if (caster && caster._charModel) {
            if (typeof caster._charModel.setMoving === 'function') caster._charModel.setMoving(false);
            if (caster._moveVec) caster._moveVec = null;
            if (targetKey) caster._combatTarget = targetKey;
            caster._combatFaceTimer = 1.0;
            caster._attackTimer = 0.75;

            const skId = String(m.skillId || '').toLowerCase();
            const isHeal = /heal|repair|buff/i.test(skId);
            const isVamp = /vamp|drain|absorb|leech/i.test(skId);
            const animKind = isHeal ? 'heal' : (isVamp ? 'vamp' : 'skill');

            if (typeof caster._charModel.playCast === 'function') {
              caster._charModel.playCast(animKind, function () {
                if (caster._charModel && caster._charModel.state === 'cast' && typeof caster._charModel.playIdle === 'function') {
                  caster._charModel.playIdle();
                }
              }, { hold: false });
            } else if (typeof caster._charModel.playAttack === 'function') {
              caster._charModel.playAttack(0.6);
            }
          }

          if (caster || target) {
            window.SkillVFX.playSkill(m.skillId, caster || g.player, target, {});
          }
        }
        break;
      }
      case 'learn_skill_ok': {
        const skNm = m.name || this._skillName(m.skillId) || 'Умение';
        g.addChatMessage(
          'Изучено: ' + skNm +
          ' Ур.' + m.rank + (m.cost ? ' (−' + m.cost + ' SP)' : ''),
          'loot'
        );
        if (g.player.levelSystem) g.player.levelSystem.sp = m.sp;
        g.player.sp = m.sp;
        if (g.player.skillManager) {
          g.player.skillManager.learnedSkills[m.skillId] = { level: m.rank };
          if (m.skills) {
            Object.keys(m.skills).forEach((id) => {
              g.player.skillManager.learnedSkills[id] = { level: m.skills[id] };
            });
          }
          g.player.skillManager.recalculatePassives();
        }
        if (m.maxHp) { g.player.maxHp = m.maxHp; g.player.hp = Math.min(g.player.hp, m.maxHp); }
        if (g.skillsUI && g.skillsUI.render) g.skillsUI.render();
        if (g.skillsUI && g.skillsUI.autoFillSkillBar) g.skillsUI.autoFillSkillBar();
        // refresh trainer panel if open
        if (g.npcUI && g.npcUI.currentNPC && document.getElementById('npc-trainer') &&
            !document.getElementById('npc-trainer').classList.contains('hidden') &&
            typeof g.npcUI.showTrainer === 'function') {
          g.npcUI.showTrainer();
        }
        break;
      }
      case 'learn_skill_fail': {
        const lr = {
          range: 'Слишком далеко от тренера умений (нужно быть ближе 7 м)',
          unknown_npc: 'Тренер умений не найден',
          no_service: 'Этот персонаж не обучает умениям',
          class_trainer: 'Этот тренер не обучает вашу профессию',
          sp: 'Недостаточно SP' + (m.need != null ? ' (нужно ' + m.need + ')' : ''),
          level: 'Недостаточный уровень' + (m.need != null ? ' (нужен ' + m.need + ')' : ''),
          class: 'Недоступно для класса',
          max: 'Уже максимальный ранг',
          unknown: 'Умение не найдено',
          need_resonator: 'Нужен паровой резонатор для изучения',
          need_bracelet: 'Нужны нано-браслеты для изучения',
          need_compressor: 'Нужен паровой нагнетатель для изучения',
          need_bracers: 'Нужны наручи-компенсаторы для изучения',
          circuit_level: 'Контур Ур.' + (m.have != null ? m.have : '?') +
            ' · нужно Ур.' + (m.need != null ? m.need : '?') + ' (прокачай резонатор)',
          nano_level: 'Связь роя Ур.' + (m.have != null ? m.have : '?') +
            ' · нужно Ур.' + (m.need != null ? m.need : '?')
        };
        g.addChatMessage(lr[m.reason] || 'Не удалось изучить умение', 'system');
        break;
      }
      case 'craft_ok':
        g.addChatMessage('Крафт успешен: ' + this._itemName(m.got) + ' x' + m.n, 'loot');
        this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.craftUI && g.craftUI.isOpen && g.craftUI.isOpen()) g.craftUI.render();
        break;
      case 'craft_fail':
        g.addChatMessage('Крафт провален, материалы потеряны.', 'damage');
        this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.craftUI && g.craftUI.isOpen && g.craftUI.isOpen()) g.craftUI.render();
        break;
      case 'learned':
        g.addChatMessage('Чертёж изучен.', 'loot');
        // Реестр изученных рецептов — авторитет сервера (пакет содержит весь список)
        if (g.craftManager) {
          g.craftManager.learnedRecipes = new Set(Array.isArray(m.learned) ? m.learned : []);
        }
        this.applyInv(m.inv, m.equip || g._serverEquip);
        if (g.craftUI && g.craftUI.isOpen && g.craftUI.isOpen()) g.craftUI.render();
        break;
      case 'enchant_ok':
        g.addChatMessage('Заточка успешна: +' + m.plus, 'loot');
        this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      case 'enchant_fail':
        g.addChatMessage('Заточка не удалась.', 'system');
        this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      case 'enchant_break': {
        let br = 'Предмет разрушен при заточке!';
        if (m.crystals && m.crystals.count > 0) {
          const cn = this._itemName(m.crystals.id) || m.crystals.id;
          br += ' Кристаллы: ' + cn + ' ×' + m.crystals.count;
          if (m.ground) br += ' (у ног — сумка не взяла).';
        }
        g.addChatMessage(br, 'damage');
        this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'use_ok': {
        // Сначала сумка/экип (recalc maxHp), потом виталы с сервера — иначе откат HP
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip, { preserveVitals: false });
        if (m.maxHp != null) g.player.maxHp = m.maxHp;
        if (m.maxEnergy != null) g.player.maxEnergy = m.maxEnergy;
        if (m.hp != null) g.player.hp = m.hp;
        if (m.energy != null) g.player.energy = m.energy;
        // C1 Soulshot/Spiritshot: arm toggle (server-side auto-consume)
        if (m.shotArmed != null && g.player) {
          g.player.armedShot = m.armedShot || null;
          g.player.shotMult = m.shotMult || null;
        } else if (m.damageBoost && g.player) {
          g.player.tempDamageBoost = m.damageBoost;
          g.player.tempBoostTimer = m.duration || 30;
        }
        // cosmetics / meme skill scrolls
        if (m.cosmetic && g.player && typeof g.player.applyCosmetics === 'function') {
          g.player.applyCosmetics(Object.assign({}, m.cosmetics || {}, m.cosmeticsFull || {}));
        }
        if (m.cosmetic && g.player) {
          const usedAuraId = (m.id && m.id.startsWith('aura_')) ? m.id : (m.cosmetics && m.cosmetics.aura);
          if (usedAuraId && typeof g.player.playAuraBurstVfx === 'function') {
            const COSDB = window.COSMETICS_DB;
            const def = (COSDB && COSDB.AURAS && COSDB.AURAS[usedAuraId]) || null;
            g.player._lastBurstAt = Date.now();
            g.player.playAuraBurstVfx(def);
          }
        }
        if (m.skills && g.player && g.player.skillManager) {
          g.player.skillManager.learnedSkills = g.player.skillManager.learnedSkills || {};
          Object.keys(m.skills).forEach((id) => {
            g.player.skillManager.learnedSkills[id] = { level: m.skills[id] };
          });
        }
        const usedName = this._itemName(m.id);
        if (m.shotArmed != null) {
          let shotMsg = m.shotArmed
            ? ('Заряды вкл: ' + usedName + (m.shotMult ? ' (×' + m.shotMult + ')' : ''))
            : ('Заряды выкл: ' + usedName);
          if (m.shotArmed && m.gradeOk === false) {
            shotMsg += ' — грейд не совпадает с оружием';
          }
          g.addChatMessage(shotMsg, 'system');
        } else if (m.cosmetic) {
          g.addChatMessage('✦ Внешка: ' + usedName, 'loot');
        } else if (m.healedHp) {
          g.addChatMessage('Использовано: ' + usedName + ' (+' + m.healedHp + ' HP)', 'loot');
        } else if (m.healedEnergy) {
          g.addChatMessage('Использовано: ' + usedName + ' (+' + m.healedEnergy + ' пар)', 'loot');
        } else if (m.damageBoost) {
          g.addChatMessage('Использовано: ' + usedName + ' (бафф урона)', 'loot');
        } else {
          g.addChatMessage('Использовано: ' + usedName, 'loot');
        }
        break;
      }
      case 'cosmetic': {
        if (m.pid === this.pid) {
          if (g && g.player && typeof g.player.applyCosmetics === 'function') {
            g.player.applyCosmetics(m);
          }
        } else if (m.pid) {
          const key = 'p' + m.pid;
          const r = this.remote.get(key);
          if (r) {
            r.title = m.title || null;
            r.titleName = m.titleName || null;
            r.titleColor = m.titleColor || null;
            r.nameColor = m.nameColor || null;
            r.aura = m.aura || null;
            if (m.gm !== undefined) r.gm = !!m.gm;
            if (m.accessLevel !== undefined) r.accessLevel = m.accessLevel;
            this._refreshRemoteNameTag(r);
            this._setRemoteAura(r, m.aura);
          }
        }
        break;
      }
      case 'cosmetic_burst': {
        const COSDB = window.COSMETICS_DB;
        const def = (COSDB && COSDB.AURAS && COSDB.AURAS[m.auraId]) || null;
        if (m.pid === this.pid) {
          if (g.player && typeof g.player.playAuraBurstVfx === 'function') {
            if (!g.player._lastBurstAt || (Date.now() - g.player._lastBurstAt > 1500)) {
              g.player._lastBurstAt = Date.now();
              g.player.playAuraBurstVfx(def);
            }
          }
        } else if (m.pid && window.spawnAuraBurstVfx) {
          const r = this.remote.get('p' + m.pid);
          if (r && r.meshGroup && window.game && window.game.scene) {
            const groundY = (r._shy != null ? r._shy : (r.meshGroup.position.y - 0.95));
            const pos = { x: r.meshGroup.position.x, y: groundY, z: r.meshGroup.position.z };
            window.spawnAuraBurstVfx(window.game.scene, pos, def);
          }
        }
        break;
      }
      case 'shot_use': {
        // 1 charge consumed on hit/skill
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip, { preserveVitals: true });
        if (g.player) g.player.armedShot = m.armedShot || null;
        break;
      }
      case 'use_fail': {
        const ur = {
          empty: 'Нет предмета.',
          unknown: 'Этот предмет нельзя использовать.',
          args: 'Неверные данные.'
        };
        g.addChatMessage(ur[m.reason] || 'Не удалось использовать предмет.', 'system');
        // подтянуть актуальную сумку, если сервер прислал
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);
        break;
      }
      case 'you_died': {
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('death');
        const loss = Math.max(0, Math.floor(+m.loss || 0));
        const delevels = Math.max(0, Math.floor(+m.delevels || 0));
        const levelBefore = m.levelBefore != null ? m.levelBefore : (m.self && m.self.level);
        // Chat: only penalty line (UI = «Вызов медиков», not «умер/воскрес»)
        if (!m.reconnect) {
          const bits = [];
          if (loss > 0) bits.push('−' + loss.toLocaleString() + ' EXP');
          if (delevels > 0) {
            const after = (m.self && m.self.level != null) ? m.self.level : '?';
            bits.push('ур. ' + (levelBefore != null ? levelBefore + '→' + after : '−' + delevels));
          }
          if (m.dropped) bits.push('потеря предметов: ' + m.dropped);
          const preLv = levelBefore != null ? levelBefore : g.player.level;
          if (m.keepItemsUntil != null && preLv <= m.keepItemsUntil) {
            bits.push('Везение: вещи при себе');
          }
          if (m.killer) bits.push('убийца: ' + m.killer);
          if (bits.length) g.addChatMessage('Штраф: ' + bits.join(' · '), 'damage');
        }

        // Authority: EXP/level from server (stay at death position as corpse)
        if (m.self) {
          if (m.self.level != null) g.player.level = m.self.level;
          if (m.self.maxHp != null) g.player.maxHp = m.self.maxHp;
          if (m.self.maxEnergy != null) g.player.maxEnergy = m.self.maxEnergy;
          g.player.hp = 0;
          if (m.self.energy != null) g.player.energy = m.self.energy;
          if (m.self.exp != null) g.player.exp = m.self.exp;
          // Keep body where it fell (no teleport until village revive)
          if (m.self.x != null && g.player.mesh) {
            // only sync if reconnect / far desync — don't snap mid-fight death if already correct
            const dx = g.player.mesh.position.x - m.self.x;
            const dz = g.player.mesh.position.z - m.self.z;
            if (m.reconnect || (dx * dx + dz * dz) > 4) {
              g.player.mesh.position.x = m.self.x;
              g.player.mesh.position.z = m.self.z;
            }
            this.predict.x = m.self.x;
            this.predict.z = m.self.z;
            this._setServerSelf(m.self.x, m.self.z);
          }
          if (g.player.levelSystem) {
            if (m.self.level != null) g.player.levelSystem.level = m.self.level;
            if (m.self.exp != null) g.player.levelSystem.exp = m.self.exp;
            if (m.self.sp != null) g.player.levelSystem.sp = m.self.sp;
            if (m.self.expToNext != null) g.player.levelSystem.expToNext = m.self.expToNext;
            else if (window.L2_EXP_TABLE && window.L2_EXP_TABLE.expToNext && m.self.level != null) {
              g.player.levelSystem.expToNext = window.L2_EXP_TABLE.expToNext(m.self.level);
            }
            if (typeof g.player.levelSystem.recalculateStats === 'function') {
              try { g.player.levelSystem.recalculateStats(); } catch (e) { /* ignore */ }
            }
            if (typeof g.player.syncFromLevelSystem === 'function') g.player.syncFromLevelSystem();
          }
        }
        if (m.inv) this.applyInv(m.inv, m.equip || g._serverEquip);

        // L2 corpse + death dialog (block move, death anim, To Village)
        if (typeof g.player.enterDeathState === 'function') {
          g.player.enterDeathState({
            loss: loss,
            delevels: delevels,
            dropped: m.dropped || 0,
            killer: m.killer || null,
            villageName: m.villageName || 'Деревню',
            reconnect: !!m.reconnect
          });
        } else {
          g.player.isDead = true;
          g.player.hp = 0;
          g.player.isMoving = false;
          if (g.ui && g.ui.showDeathDialog) {
            g.ui.showDeathDialog({ loss: loss, delevels: delevels, killer: m.killer });
          }
        }
        break;
      }
      case 'you_revived': {
        const self = m.self || {};
        if (typeof g.player.leaveDeathState === 'function') {
          g.player.leaveDeathState(self);
        } else {
          g.player.isDead = false;
          g.player.hp = self.hp != null ? self.hp : g.player.maxHp;
          g.player.energy = self.energy != null ? self.energy : g.player.maxEnergy;
          if (self.x != null && g.player.mesh) {
            g.player.mesh.position.x = self.x;
            g.player.mesh.position.z = self.z;
          }
          if (g.ui && g.ui.hideDeathDialog) g.ui.hideDeathDialog();
        }
        if (self.x != null) {
          this.predict.x = self.x;
          this.predict.z = self.z;
          this._setServerSelf(self.x, self.z);
          // Респавн в деревне — тот же случай, что телепорт: жёсткая постановка
          // с подгрузкой террейна, а не «доезд» интерполяцией.
          this._applyServerPosition(self.x, self.z, { hard: true });
        }
        if (self.level != null) {
          g.player.level = self.level;
          if (g.player.levelSystem) {
            g.player.levelSystem.level = self.level;
            if (self.exp != null) g.player.levelSystem.exp = self.exp;
            if (self.expToNext != null) g.player.levelSystem.expToNext = self.expToNext;
            if (typeof g.player.syncFromLevelSystem === 'function') g.player.syncFromLevelSystem();
          }
        }
        if (m.mode === 'resurrect') {
          g.addChatMessage('✨ Вы были воскрешены администратором ' + (m.by || 'GM') + '!', 'system');
          if (window.SkillVFX && typeof window.SkillVFX.playResurrectionVFX === 'function') {
            window.SkillVFX.playResurrectionVFX(null, g.player, {
              targetName: g.player.name,
              casterName: m.by || 'GM'
            });
          }
        } else {
          g.addChatMessage('Медики доставили вас в город.', 'system');
        }
        break;
      }
      case 'flag': {
        const flagPart = m.flagged ? '🚩 Флаг PvP. ' : '';
        g.addChatMessage(flagPart + 'Карма: ' + m.karma, m.karma > 0 || m.flagged ? 'damage' : 'system');
        break;
      }
      case 'event_start': {
        const zEv = this._zoneLabel(m.zoneName, m.region);
        const boss = m.bossName ? (' — ' + m.bossName) : '';
        const where = zEv ? (' в зоне «' + zEv + '»') : '';
        const tag = m.kind === 'raid' ? 'РЕЙД' : 'СОБЫТИЕ';
        g.addChatMessage('⚠️ ' + tag + ': ' + (m.name || 'Опасность') + boss + where + '!', 'damage');
        break;
      }
      case 'event_end': {
        const zEnd = this._zoneLabel(m.zoneName, m.region);
        const where = zEnd ? (' в зоне «' + zEnd + '»') : '';
        g.addChatMessage((m.kind === 'raid' ? 'Рейд' : 'Событие') + where + ' завершилось.', 'system');
        break;
      }
      case 'msg': g.addChatMessage(m.text, 'system'); break;
      case 'time_phase': if (window.game && window.game.dayNight && window.game.dayNight.setPhase) window.game.dayNight.setPhase(m.phase); break;
      case 'chat': {
        const isSys = (m.name === 'SYSTEM' || m.name === 'System' || m.name === 'Система');
        const who = isSys ? 'Система' : m.name;
        const ch = m.ch || (isSys ? 'system' : 'all');
        if (ch === 'tell') {
          // out: эхо своего сообщения — иначе не видно, что и кому написал.
          g.addChatMessage(m.out
            ? ('→ ' + (m.to || '') + ': ' + m.text)
            : ('← ' + who + ': ' + m.text), 'tell');
        } else if (ch === 'party') {
          g.addChatMessage('[Группа] ' + who + ': ' + m.text, 'party');
        } else if (ch === 'clan') {
          g.addChatMessage('[Клан] ' + who + ': ' + m.text, 'clan');
        } else if (ch === 'shout') {
          g.addChatMessage('[Крик] ' + who + ': ' + m.text, 'shout');
        } else if (ch === 'announce') {
          g.addChatMessage('📢 ' + who + ': ' + m.text, 'system');
        } else {
          const isGmMsg = !!(m.gm || (who && who.startsWith('[GM]')));
          g.addChatMessage(who + ': ' + m.text, (isSys || isGmMsg) ? 'system' : 'chat');
        }
        break;
      }
      case 'chat_fail': {
        const chR = {
          no_party: 'вы не в группе',
          no_clan: 'вы не в клане',
          muted: 'вам запрещено писать в чат' + (m.until ? (' до ' + new Date(m.until).toLocaleString()) : ''),
          no_target: 'укажите имя: /tell Имя текст',
          offline: 'игрок не в сети' + (m.to ? (': ' + m.to) : ''),
          self: 'нельзя написать самому себе',
          access_denied: 'у вас нет прав администратора'
        };
        g.addChatMessage('Чат: ' + (chR[m.reason] || m.reason || 'не отправлено'), 'system');
        break;
      }
      case 'report_ok': {
        g.addChatMessage('Жалоба на ' + (m.name || 'игрока') + ' отправлена.', 'system');
        break;
      }
      case 'report_fail': {
        const rR = {
          args: 'укажите игрока: /report Имя причина',
          offline: 'игрок не в сети' + (m.name ? (': ' + m.name) : ''),
          self: 'на себя жаловаться нельзя',
          rate: 'подождите перед следующей жалобой'
        };
        g.addChatMessage('Жалоба: ' + (rR[m.reason] || m.reason || 'не удалось'), 'system');
        break;
      }
      case 'kicked': {
        g.addChatMessage('Отключение: ' + (m.reason === 'banned' ? 'аккаунт заблокирован' : (m.reason || 'кик')), 'system');
        break;
      }
      case 'level_up':
        if (window.GameAudio && typeof window.GameAudio.play === 'function') window.GameAudio.play('levelup');
        g.player.level = m.level;
        g.player.exp = m.exp || 0;
        g.player.maxHp = m.maxHp; g.player.hp = m.maxHp;
        g.player.maxEnergy = m.maxEnergy; g.player.energy = m.maxEnergy;
        if (m.sp != null) g.player.sp = m.sp;
        if (m.primary) g.player.primary = m.primary;
        if (g.player.levelSystem) {
          g.player.levelSystem.level = m.level;
          g.player.levelSystem.exp = m.exp || 0;
          if (m.sp != null) g.player.levelSystem.sp = m.sp;
          if (m.expToNext != null) g.player.levelSystem.expToNext = m.expToNext;
          if (typeof g.player.levelSystem.recalculateStats === 'function') {
            g.player.levelSystem.recalculateStats();
          }
        }
        if (g.player.pullL2Stats) g.player.pullL2Stats();
        g.addChatMessage('🎉 УРОВЕНЬ ' + m.level + '!', 'loot');
        // L2 level-up VFX (server path — authoritative level)
        if (g.player.createLevelUpEffect) {
          g.player.createLevelUpEffect(m.level);
        } else if (window.SkillVFX && window.SkillVFX.playLevelUp) {
          window.SkillVFX.playLevelUp(g.player, { level: m.level });
        }
        if (m.canTransfer && m.nextClasses && m.nextClasses.length) {
          g.addChatMessage('⚙️ Доступна сертификация профессии!', 'system');
          m.nextClasses.forEach((c, i) => g.addChatMessage('  [' + (i + 1) + '] ' + c.name + ' — ' + (c.description || ''), 'system'));
          g.player.classChangePending = true;
          g.player._pendingClasses = m.nextClasses;
          if (g.player.levelSystem) {
            g.player.levelSystem.pendingTransfer = {
              tier: (m.nextClasses[0] && m.nextClasses[0].levelReq >= 40) ? 2 : 1,
              options: m.nextClasses.map(c => c.id)
            };
          }
          if (g.levelUI && g.levelUI.showTransfer) g.levelUI.showTransfer();
        }
        break;
      case 'class_transfer_ok':
        g.player.playerClass = m.cls;
        g.player.className = m.className || m.cls;
        g.player.classChangePending = false;
        g.player._pendingClasses = null;
        g.player.maxHp = m.maxHp; g.player.hp = m.maxHp;
        g.player.maxEnergy = m.maxEnergy; g.player.energy = m.maxEnergy;
        if (g.player.levelSystem) {
          g.player.levelSystem.currentClass = m.cls;
          g.player.levelSystem.classTier = m.classTier || 0;
          g.player.levelSystem.classHistory = m.classHistory || [m.cls];
          g.player.levelSystem.pendingTransfer = null;
          if (typeof g.player.levelSystem.recalculateStats === 'function') g.player.levelSystem.recalculateStats();
        }
        {
          const badge = document.getElementById('class-name');
          if (badge) badge.textContent = g.player.className;
        }
        g.addChatMessage('🔧 ПРОФЕССИЯ: ' + (m.className || this._className(m.cls) || m.cls) + '!', 'loot');
        if (m.description) g.addChatMessage(m.description, 'system');
        if (g.levelUI && g.levelUI.hideTransfer) g.levelUI.hideTransfer();
        if (g.skillsUI && g.skillsUI.autoFillSkillBar) g.skillsUI.autoFillSkillBar();
        break;
      case 'class_transfer_fail':
        g.addChatMessage(
          m.reason === 'quest'
            ? 'Сначала сдайте задание на сертификацию.'
            : (m.reason === 'class' ? 'Этот путь вам недоступен.' : 'Не удалось сменить профессию.'),
          'damage'
        );
        break;
    }
  }

  /** Имя зоны для чата/HUD: zoneName → lookup id → без raw hunt_… */
  _zoneLabel(zoneName, regionId) {
    if (zoneName && /[А-Яа-яЁё]/.test(String(zoneName))) return String(zoneName);
    const id = regionId || zoneName;
    if (!id) return 'Остров';
    if (id === 'village') return 'Деревня поющей стали';
    if (id === 'wild') return 'Остров поющей стали';
    try {
      const WM = window.WorldMetrics;
      if (WM && WM.buildRegions) {
        const list = WM.buildRegions();
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === id && list[i].name) return list[i].name;
        }
      }
      if (WM && WM.regionAt && this.predict) {
        const r = WM.regionAt(this.predict.x, this.predict.z);
        if (r && r.name) return r.name;
      }
    } catch (e) { /* ignore */ }
    // не светим hunt_timestamp в чат
    if (/^hunt_/i.test(String(id))) return 'Зона охоты';
    return String(zoneName || id);
  }

  _itemName(id) {
    if (!id) return 'предмет';
    const key = String(id);
    if (window.ITEM_DATABASE) {
      const t = window.ITEM_DATABASE[key] || window.ITEM_DATABASE[key.toUpperCase()];
      if (t && t.name) return t.name;
    }
    if (window.ITEMS && window.ITEMS.resolveTemplate) {
      const t = window.ITEMS.resolveTemplate(key);
      if (t && t.name) return t.name;
    }
    // loot-rules materials (server-side names)
    try {
      const LR = window.LOOT_RULES || window.LootRules;
      if (LR && LR.ITEMS && LR.ITEMS[key] && LR.ITEMS[key].name) return LR.ITEMS[key].name;
      if (LR && LR.materials && LR.materials[key] && LR.materials[key].name) return LR.materials[key].name;
    } catch (e) { /* ignore */ }
    const FALLBACK = {
      iron_scrap: 'Железный лом', copper_cable: 'Медный кабель',
      copper_parts: 'Медные детали', steam_valve: 'Паровой клапан',
      oil_filter: 'Масляный фильтр', gear_fragment: 'Обломок шестерни',
      piston_ring: 'Поршневое кольцо', spark_plug: 'Свеча зажигания',
      synthetic_oil: 'Синтетическое масло', pressure_canister: 'Баллон давления',
      pressure_amplifier: 'Усилитель давления'
    };
    return FALLBACK[key] || key;
  }

  _className(clsId) {
    if (!clsId) return null;
    if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.getClass) {
      const c = window.CLASS_SYSTEM.getClass(clsId);
      if (c && c.name) return c.name;
    }
    return null;
  }

  /**
   * Полная синхронизация сумки с сервером.
   * Важно: экип на сервере НЕ лежит в inv — без serverEquip paperdoll «призрачит»
   * или теряет circuitLevel/shellIndex/enchant. Всегда чистим equipment и
   * переодеваем из equip (или кэша g._serverEquip).
   * @param {object} [opts]
   * @param {boolean} [opts.preserveVitals=true] — не дать recalc зажать HP ниже текущего
   *   (для reward/craft). use_ok передаёт false и потом ставит hp с сервера.
   */
  applyInv(inv, serverEquip, opts) {
    const g = window.game;
    if (!inv || !g.inventory) return;
    opts = opts || {};
    const preserveVitals = opts.preserveVitals !== false;
    const invApi = g.inventory;

    const savedHp = g.player ? g.player.hp : null;
    const savedEnergy = g.player ? g.player.energy : null;

    // 1) Сохраняем instance-state до wipe (контур/корпус/заточка)
    const preserved = this._collectItemState(invApi);

    const equipSrc = (serverEquip && typeof serverEquip === 'object')
      ? serverEquip
      : (g._serverEquip && typeof g._serverEquip === 'object' ? g._serverEquip : null);

    if (serverEquip && typeof serverEquip === 'object') g._serverEquip = serverEquip;
    // Нормализуем: нули и мусор не держим
    const cleanInv = {};
    for (const [id, count] of Object.entries(inv)) {
      const n = Math.floor(+count) || 0;
      if (n > 0) cleanInv[id] = n;
    }
    g._serverInv = cleanInv;
    invApi.currency = cleanInv.copper_parts || 0;

    // 2) Полный сброс bag + paperdoll (без orphan ItemInstance)
    if (invApi.equipment) {
      Object.keys(invApi.equipment).forEach((s) => { invApi.equipment[s] = null; });
    }
    if (invApi.slots) invApi.slots.fill(null);

    // 3) Bag из server inv (templateId → count)
    if (invApi.slots) {
      for (const [id, count] of Object.entries(cleanInv)) {
        if (id === 'copper_parts') continue;
        // circuit robes — legacy strip; apprentice_wand may sit in bag as spare
        if (id === 'circuit_robe_jacket' || id === 'circuit_robe_pants') continue;
        this._ensureItemTemplate(id);
        const ok = invApi.addItem(id, count);
        if (!ok) console.warn('[applyInv] не удалось добавить', id, 'x' + count);
      }
    }

    // 4) Восстановить instance fields на стеках/вещах в bag
    this._restoreItemState(invApi, preserved, equipSrc);

    // 5) Экип с сервера (silent — без echo intentEquip)
    if (equipSrc) this._reapplyEquip(invApi, equipSrc, preserved);

    if (window.WEIGHT_RULES && typeof window.WEIGHT_RULES.totalLoad === 'function') {
      const lookup = (id) => {
        if (window.ITEM_DB && typeof window.ITEM_DB.get === 'function') {
          const a = window.ITEM_DB.get(id);
          if (a) return a;
        }
        if (window.LOOT_ITEMS && window.LOOT_ITEMS[id]) return window.LOOT_ITEMS[id];
        if (window.ITEM_DATABASE && window.ITEM_DATABASE[id]) return window.ITEM_DATABASE[id];
        return null;
      };
      invApi.weight = window.WEIGHT_RULES.totalLoad(cleanInv, equipSrc, lookup);
      const con = (g.player && g.player.primary && g.player.primary.CON) || 43;
      if (invApi.maxWeight == null || invApi.maxWeight === 10000) {
        invApi.maxWeight = window.WEIGHT_RULES.maxLoad(con);
      }
    }

    // 6) Статы + 3D + UI — HP абсолютный (не ratio), чтобы wipe экипа не «съел» хил
    if (typeof invApi.recalculateStats === 'function') invApi.recalculateStats();
    if (preserveVitals && g.player) {
      if (savedHp != null) g.player.hp = Math.min(savedHp, g.player.maxHp);
      if (savedEnergy != null) g.player.energy = Math.min(savedEnergy, g.player.maxEnergy);
    }
    if (g.player && typeof g.player.syncWeaponVisual === 'function') g.player.syncWeaponVisual();
    if (g.player && typeof g.player.refreshNameplate === 'function') g.player.refreshNameplate();
    this._refreshInvUI();
  }

  /** Только paperdoll по server equip (equip_ok / combat_stats) — bag не трогаем. */
  applyEquipOnly(serverEquip) {
    const g = window.game;
    if (!serverEquip || !g.inventory) return;
    const invApi = g.inventory;
    const preserved = this._collectItemState(invApi);
    g._serverEquip = serverEquip;

    // Снять всё в bag (silent), затем надеть по серверу
    Object.keys(invApi.equipment || {}).forEach((slot) => {
      if (invApi.equipment[slot]) invApi.unequipItem(slot, { silent: true });
    });
    this._reapplyEquip(invApi, serverEquip, preserved);
    if (typeof invApi.recalculateStats === 'function') invApi.recalculateStats();
    if (g.player && typeof g.player.syncWeaponVisual === 'function') g.player.syncWeaponVisual();
    if (g.player && typeof g.player.refreshNameplate === 'function') g.player.refreshNameplate();
    this._refreshInvUI();
  }

  _refreshInvUI() {
    const g = window.game;
    if (!g || !g.inventoryUI) return;
    if (typeof g.inventoryUI.render === 'function') g.inventoryUI.render();
    else if (typeof g.inventoryUI.update === 'function') g.inventoryUI.update();
  }

  _collectItemState(invApi) {
    const preserved = Object.create(null);
    const take = (item) => {
      if (!item || !item.templateId) return;
      const tid = item.templateId;
      const prev = preserved[tid] || {};
      const cl = item.circuitLevel != null ? item.circuitLevel
        : (typeof item.getCircuitLevel === 'function' ? item.getCircuitLevel() : 0);
      const sh = item.shellIndex != null ? item.shellIndex
        : (typeof item.getShellIndex === 'function' ? item.getShellIndex() : 0);
      const nl = item.nanoLevel != null ? item.nanoLevel
        : (typeof item.getNanoLevel === 'function' ? item.getNanoLevel() : 0);
      const ci = item.casingIndex != null ? item.casingIndex
        : (typeof item.getCasingIndex === 'function' ? item.getCasingIndex() : 0);
      const en = item.enchantLevel || 0;
      preserved[tid] = {
        circuitLevel: Math.max(prev.circuitLevel || 0, cl || 0),
        shellIndex: Math.max(prev.shellIndex != null ? prev.shellIndex : 0, sh || 0),
        nanoLevel: Math.max(prev.nanoLevel || 0, nl || 0),
        casingIndex: Math.max(prev.casingIndex != null ? prev.casingIndex : 0, ci || 0),
        enchantLevel: Math.max(prev.enchantLevel || 0, en)
      };
    };
    (invApi.slots || []).forEach(take);
    Object.keys(invApi.equipment || {}).forEach((s) => take(invApi.equipment[s]));
    return preserved;
  }

  _restoreItemState(invApi, preserved, equipSrc) {
    // метаданные с серверного equip (plus / circuit / shell / nano / casing)
    if (equipSrc) {
      Object.keys(equipSrc).forEach((slot) => {
        const eo = equipSrc[slot];
        if (!eo) return;
        const tid = eo.templateId || eo.id;
        if (!tid) return;
        const prev = preserved[tid] || {};
        preserved[tid] = {
          circuitLevel: eo.circuitLevel != null ? eo.circuitLevel : (prev.circuitLevel || 0),
          shellIndex: eo.shellIndex != null ? eo.shellIndex : (prev.shellIndex || 0),
          nanoLevel: eo.nanoLevel != null ? eo.nanoLevel : (prev.nanoLevel || 0),
          casingIndex: eo.casingIndex != null ? eo.casingIndex : (prev.casingIndex || 0),
          enchantLevel: eo.plus != null ? eo.plus
            : (eo.enchantLevel != null ? eo.enchantLevel : (prev.enchantLevel || 0))
        };
      });
    }
    const apply = (item) => {
      if (!item || !item.templateId) return;
      const st = preserved[item.templateId];
      if (!st) return;
      if (st.circuitLevel > 0) {
        item.circuitLevel = st.circuitLevel;
        item.resonatorLevel = st.circuitLevel;
      }
      if (st.shellIndex != null) item.shellIndex = st.shellIndex;
      if (st.nanoLevel > 0) item.nanoLevel = st.nanoLevel;
      if (st.casingIndex != null) item.casingIndex = st.casingIndex;
      if (st.enchantLevel > 0) item.enchantLevel = st.enchantLevel;
    };
    (invApi.slots || []).forEach(apply);
    Object.keys(invApi.equipment || {}).forEach((s) => apply(invApi.equipment[s]));
  }

  _reapplyEquip(invApi, serverEquip, preserved) {
    if (!serverEquip || typeof serverEquip !== 'object') return;
    // Сортируем: сначала броня, потом costume/title, weapon/necklace/bracelet — меньше конфликтов 2H/fullBody
    const order = ['chest', 'legs', 'head', 'gloves', 'boots', 'shield',
      'earring_l', 'earring_r', 'bracelet', 'necklace', 'costume', 'title', 'weapon'];
    // legacy rings → bracelet slot key
    const remap = {};
    Object.keys(serverEquip).forEach((slot) => {
      let s = slot;
      if (s === 'ring_l' || s === 'ring_r' || s === 'ring') s = 'bracelet';
      if (!remap[s]) remap[s] = serverEquip[slot];
      // prefer nano bracelet over junk ring if both
      const cur = remap[s];
      const tid = String((serverEquip[slot] && (serverEquip[slot].templateId || serverEquip[slot].id)) || '');
      if (/nano_bracelet|bracelet/i.test(tid)) remap[s] = serverEquip[slot];
      else if (!cur) remap[s] = serverEquip[slot];
    });
    const slots = Object.keys(remap).sort((a, b) => {
      const ia = order.indexOf(a); const ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    slots.forEach((slot) => {
      const itemObj = remap[slot];
      if (!itemObj) return;
      let templateId = String(itemObj.templateId || itemObj.id || '').toLowerCase();
      if (!templateId) return;

      // Миграция: только резонатор из weapon → necklace (apprentice_wand = оружие)
      if (templateId === 'engineer_emitter_low' && (slot === 'weapon' || !slot)) {
        slot = 'necklace';
      }
      if (slot === 'weapon' && templateId === 'engineer_emitter_low') slot = 'necklace';
      if (slot === 'ring_l' || slot === 'ring_r') slot = 'bracelet';

      this._ensureItemTemplate(templateId);
      if (!window.ITEM_DATABASE || !window.ITEM_DATABASE[templateId]) {
        console.warn('[applyInv] нет шаблона для экипа', templateId);
        return;
      }

      // Уже надет этот uid-экземпляр?
      let found = null;
      // Сначала bag
      found = (invApi.slots || []).find(s => s && s.templateId === templateId && !s.isEquipped);
      if (!found) {
        // уже в другом слоте экипа
        const eqHit = Object.keys(invApi.equipment || {}).find(
          (s) => invApi.equipment[s] && invApi.equipment[s].templateId === templateId
        );
        if (eqHit) found = invApi.equipment[eqHit];
      }
      if (!found) {
        invApi.addItem(templateId, 1);
        found = (invApi.slots || []).find(s => s && s.templateId === templateId);
      }
      if (!found) return;

      // instance meta
      const st = preserved && preserved[templateId];
      if (itemObj.circuitLevel != null) found.circuitLevel = itemObj.circuitLevel;
      else if (st && st.circuitLevel) found.circuitLevel = st.circuitLevel;
      if (itemObj.shellIndex != null) found.shellIndex = itemObj.shellIndex;
      else if (st && st.shellIndex != null) found.shellIndex = st.shellIndex;
      if (itemObj.nanoLevel != null) found.nanoLevel = itemObj.nanoLevel;
      else if (st && st.nanoLevel) found.nanoLevel = st.nanoLevel;
      if (itemObj.casingIndex != null) found.casingIndex = itemObj.casingIndex;
      else if (st && st.casingIndex != null) found.casingIndex = st.casingIndex;
      if (itemObj.plus != null) found.enchantLevel = itemObj.plus;
      else if (itemObj.enchantLevel != null) found.enchantLevel = itemObj.enchantLevel;
      else if (st && st.enchantLevel) found.enchantLevel = st.enchantLevel;

      invApi.equipItem(found.uid, { silent: true });
    });
  }

  /** Гарантировать шаблон в ITEM_DATABASE (лут / серверные id). */
  _ensureItemTemplate(templateId) {
    if (!templateId) return null;
    const db = window.ITEM_DATABASE;
    if (db && db[templateId]) return db[templateId];
    // merge helper from inventory.js
    if (typeof window.ensureItemTemplate === 'function') {
      return window.ensureItemTemplate(templateId);
    }
    if (!db) return null;
    // last-resort stub so bag shows the object instead of silent drop
    db[templateId] = {
      id: templateId,
      name: templateId,
      type: 'material',
      grade: 'NO_GRADE',
      stackable: true,
      maxStack: 9999,
      icon: '📦',
      description: 'Предмет с сервера (шаблон подгружен автоматически).'
    };
    return db[templateId];
  }
  /** Локализованное имя моба (MOB_DB / MOB_DATABASE). */
  mobDisplayName(mobId, fallback) {
    if (!mobId) return fallback || 'Враг';
    if (window.MOB_DB && window.MOB_DB.get) {
      const t = window.MOB_DB.get(mobId);
      if (t && t.name) return t.name;
    }
    if (window.MOB_DATABASE) {
      const t = window.MOB_DATABASE[mobId] || window.MOB_DATABASE[String(mobId).toUpperCase()];
      if (t && t.name) return t.name;
    }
    // fallback map id → RU
    const MAP = {
      scrapper: 'Скраппер', loose_bolt: 'Сбежавший Болт', rust_mite: 'Ржавый Клещ',
      tutorial_target: 'Мишень-бунтарь', spark_sprite: 'Искровой Спрайт',
      steam_hound: 'Паровая Гончая', meadow_mower: 'Бешеная Газонокосилка',
      survey_beacon: 'Геодезический Маяк', hill_presser: 'Холмовой Трамбовщик',
      rivulet_pump: 'Буйный Насос', bridge_toll_bot: 'Сборщик Пошлины',
      junk_magpie: 'Сорока-Магнит', scrap_picker: 'Разборщик Лома',
      welding_automaton: 'Сварочный Автомат', welding_drone: 'Дрон-Сварщик',
      rust_sentry: 'Ржавый Часовой', repair_drone: 'Дрон-Ремонтник',
      garden_sprinkler: 'Поливная Турель', vine_cable: 'Плющ-Кабель',
      apiary_drone_bee: 'Мех-Пчела', forge_apprentice: 'Горн-Подмастерье',
      yard_cranelet: 'Кран-Малыш', steam_crane_spider: 'Кран-Паук',
      dry_dock_welder: 'Доковый Сварщик', oblivion_walker: 'Ходок Забвения',
      memory_scrubber: 'Стиратель Памяти', field_howitzer: 'Полевая Гаубица',
      rogue_target: 'Живая Мишень', range_spotter: 'Споттер Полигона',
      acid_sprayer: 'Кислотный Разбрызгиватель', green_fault_drone: 'Дрон Зелёного Сбоя',
      spill_containment: 'Аварийный Контейнер', rezdiq_private: 'Рядовой Рездика',
      drill_sergeant: 'Дрель-Сержант', limit_guard: 'Страж Предела',
      fort_turret: 'Крепостная Турель', boiler_elemental: 'Котловой Элементаль',
      pressure_fiend: 'Бес Давления', green_steam_wraith: 'Зелёный Паро-Призрак',
      press_hammer: 'Автономный Пресс-Молот', drill_worm: 'Босс-Бур',
      cruna_overseer: 'Надзиратель Круны', rezdiq_colonel: 'Полковник Рездик-VII',
      steel_colossus: 'Стальной Колосс Предела'
    };
    return MAP[mobId] || fallback || mobId;
  }
  _remoteEquippedWeaponId(s) {
    if (!s) return 'apprentice_wand';
    const eq = s.equip;
    if (!eq || !eq.weapon) return 'apprentice_wand';
    const w = eq.weapon;
    const t = w.template || w;
    const id = String(w.templateId || t.id || '').toLowerCase();
    if (!id || id === 'engineer_emitter_low') return null;
    const CM = window.CharModel;
    const catalog = (CM && CM.WEAPON_VISUALS) || (CM && CM.default && CM.default.WEAPON_VISUALS);
    if (catalog && catalog[id]) return id;
    const ALIAS = {
      operator_hammer_low: 'apprentice_wand',
      willow_coil: 'magic_mace',
      cedar_manifold: 'apprentice_wand',
      mage_staff: 'apprentice_wand',
      mace_prayer: 'magic_mace',
      crucifix_blood: 'magic_mace',
      voodoo_doll: 'magic_mace',
      demon_fangs: 'magic_mace',
      tears_fairy: 'magic_mace',
      bone_resonator: 'apprentice_wand',
      life_manifold: 'apprentice_wand',
      ghost_manifold: 'apprentice_wand',
      atuba_mace: 'magic_mace'
    };
    if (ALIAS[id] && catalog && catalog[ALIAS[id]]) return ALIAS[id];
    return 'apprentice_wand';
  }

  addRemote(s) {
    const key = (s.t === 'p' ? 'p' : 'm') + (s.pid || s.mid);
    if (this.remote.has(key)) {
      // обновить level/hp если уже есть
      const ex = this.remote.get(key);
      if (s.level != null) ex.level = s.level;
      if (s.hp != null) ex.hp = s.hp;
      if (s.maxHp != null) ex.maxHp = s.maxHp;
      if (s.mobId && !ex.name) ex.name = this.mobDisplayName(s.mobId, s.name);
      if (s.named != null) ex.named = !!s.named;
      if (s.champion != null) ex.champion = !!s.champion;
      if (s.role) ex.role = s.role;
      if (s.boss != null) ex.boss = !!s.boss;
      return;
    }
    if (s.t === 'p' && s.pid === this.pid) return;

    const smp = this._remoteGroundSample(s.x, s.z, false);
    const groundY = smp.ground;
    const shadowY = smp.shadowY;
    const standY = smp.y;

    if (s.t === 'p') {
      const g = window.game;
      const group = new THREE.Group();
      group.name = 'remote_player_' + s.pid;
      group.position.set(s.x, standY, s.z);
      group.userData.remoteKey = key;
      group.userData.pid = s.pid;
      g.scene.add(group);

      const isBotActor = !!(s.isBot || (s.name && (
        s.name.startsWith('bot3k_') || s.name.startsWith('stress_bot_') ||
        s.name.startsWith('Бот-') || s.name.startsWith('Горожанин') ||
        s.name.startsWith('Торговец') || s.name.startsWith('Страж') ||
        s.name.startsWith('Охотник') || s.name.includes('bot') || s.name.includes('_')
      )));

      const rec = {
        meshGroup: group,
        shadow: null,
        nameTag: null, // Initialized asynchronously in time-sliced spawn queue
        _charModel: null,
        isStressBot: isBotActor,
        x: s.x, z: s.z, hp: s.hp, maxHp: s.maxHp,
        name: s.name,
        pid: s.pid, type: 'p',
        cls: s.cls || 'engineer',
        gender: s.gender || 'male',
        appearance: s.appearance || { hairId: 'hair1' },
        equip: s.equip || null,
        flagged: s.flagged,
        dueling: !!s.dueling,
        level: (s.level != null && s.level > 0) ? s.level : 1,
        gm: !!s.gm,
        accessLevel: s.accessLevel || (s.gm ? 100 : 0),
        title: s.title || null,
        titleName: s.titleName || null,
        titleColor: s.titleColor || null,
        nameColor: s.nameColor || null,
        aura: s.aura || null,
        // Вывеска личной лавки из AOI: по ней клик открывает витрину.
        store: s.store || null,
        clanId: s.clanId || null,
        clanName: s.clanName || null,
        crestHash: s.crestHash || null,
        facing: (s.facing != null && isFinite(s.facing)) ? s.facing : 0,
        _prevX: s.x,
        _prevZ: s.z,
        _hx: s.x,
        _hz: s.z,
        _hy: standY,
        _shy: shadowY,
        baseScale: 1.85,
        mesh: group,
        targetX: s.x,
        targetZ: s.z,
        lastServerX: s.x,
        lastServerZ: s.z,
        lastServerT: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
        vx: 0,
        vz: 0,
        isMoving: false,
        extrapolateT: 0,
        effects: Array.isArray(s.effects) ? s.effects.slice() : []
      };
      this.remote.set(key, rec);
      if (s.aura) {
        this._setRemoteAura(rec, s.aura);
      }

      // Time-sliced queue: always queue to prevent multi-character packet frame drops
      this._spawnQueue.push({ s, group, rec, key });
      return;
    }

    const made = this.makeSprite(s, groundY, shadowY);
    const mobName = s.name || this.mobDisplayName(s.mobId, s.mobId);
    const rec = {
      sprite: made.sp, shadow: made.sh, nameTag: made.tag,
      x: s.x, z: s.z, hp: s.hp, maxHp: s.maxHp,
      effects: Array.isArray(s.effects) ? s.effects.slice() : [],
      name: mobName, mobId: s.mobId,
      mid: s.mid, pid: s.pid, type: s.t, boss: s.boss, flagged: s.flagged,
      named: !!s.named,
      champion: !!s.champion,
      role: s.role || null,
      rank: made.rank || null,
      level: (s.level != null && s.level > 0) ? s.level : 1,
      title: s.title || null,
      titleName: s.titleName || null,
      titleColor: s.titleColor || null,
      nameColor: s.nameColor || null,
      aura: s.aura || null,
      useSheets: false,
      sheetAnims: null,
      animName: 'idle',
      animFrame: 0,
      animTime: 0,
      facing: 1,
      _prevX: s.x,
      _prevZ: s.z,
      _hx: s.x,
      _hz: s.z,
      _hy: made.initialY,
      _shy: shadowY,
      baseScale: made.baseScale || (s.boss ? 6 : 2.5),
      targetX: s.x,
      targetZ: s.z,
      lastServerX: s.x,
      lastServerZ: s.z,
      lastServerT: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      vx: 0,
      vz: 0,
      isMoving: false,
      extrapolateT: 0
    };
    this.remote.set(key, rec);
    if (s.t === 'm' && s.mobId) this._tryBindMobSheets(rec, s.mobId);
    if (s.t === 'm' && rec.rank && rec.rank.id !== 'normal') this._setRankAura(rec, rec.rank);
  }

  _initRemotePlayer3D(s, group, rec, key) {
    if (!this.remote.has(key)) return;
    const g = window.game;

    // Lazily create nameTag sprite on time-sliced turn (cached by nameplate key)
    if (!rec.nameTag && g && g.scene) {
      if (!this._playerNameTexCache) this._playerNameTexCache = new Map();
      const isGm = !!s.gm || (s.accessLevel != null && s.accessLevel >= 50);
      const nameKey = `${s.name || '?'}_${s.titleName || s.title || ''}_${s.titleColor || ''}_${s.nameColor || ''}_${s.level || 1}_${isGm ? 1 : 0}_${s.crestHash || ''}`;
      let ttex = this._playerNameTexCache.get(nameKey);
      let isShared = true;
      if (!ttex) {
        isShared = false;
        const tc = document.createElement('canvas');
        tc.width = 512; tc.height = 96;
        this._paintRemoteName(tc, s);
        ttex = new THREE.CanvasTexture(tc);
        ttex.generateMipmaps = false;
        ttex.minFilter = THREE.LinearFilter;
        ttex.magFilter = THREE.LinearFilter;
        if (g.renderer && typeof g.renderer.initTexture === 'function') {
          try { g.renderer.initTexture(ttex); } catch (e) {}
        }
        this._playerNameTexCache.set(nameKey, ttex);
      }
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ttex,
        transparent: true,
        depthTest: false,
        depthWrite: false
      }));
      const hasTitle = !!(s.titleName || s.title);
      tag.scale.set(hasTitle ? 12.4 : 10.8, hasTitle ? 2.3 : 1.95, 1);
      tag.position.set(s.x, (rec._hy != null ? rec._hy : s.y) + 1.25, s.z);
      tag.renderOrder = 999;
      tag.userData._ownsMaterial = true;
      tag.userData._ownsMap = !isShared;
      g.scene.add(tag);
      rec.nameTag = tag;
    }

    const CM = window.CharModel;
    const initialWeapon = this._remoteEquippedWeaponId(s) || 'apprentice_wand';
    const hairColor = (s.appearance && s.appearance.hairColor) || null;
    const pPos = (g && g.player && g.player.mesh) ? g.player.mesh.position : (g && g.player ? g.player : { x: s.x, z: s.z });
    const initDist = Math.hypot(s.x - (pPos.x || 0), s.z - (pPos.z || 0));

    if (CM && typeof CM.fastClonePlayerModel === 'function') {
      CM.fastClonePlayerModel(group, {
        weaponId: initialWeapon,
        hairColor: hairColor,
        animSpeed: 1.0,
        initialDist: initDist
      }).then((inst) => {
        if (!inst || !this.remote.has(key)) {
          if (inst && typeof inst.dispose === 'function') inst.dispose();
          return;
        }
        rec._charModel = inst;
        if (rec.dead || (s.hp != null && s.hp <= 0)) {
          rec.dead = true;
          if (typeof inst.playDeath === 'function') inst.playDeath();
        } else if (rec.isMoving && typeof inst.setMoving === 'function') {
          const spd = Math.hypot(rec.vx || 0, rec.vz || 0);
          inst.setMoving(true, spd > 4.5 ? 'run' : 'walk');
        } else {
          if (typeof inst.playIdle === 'function') inst.playIdle();
        }
        if (rec.facing != null && typeof inst.setFacing === 'function') {
          inst.setFacing(rec.facing);
        }
        if (rec._attackTimer > 0 && typeof inst.playAttack === 'function') {
          inst.playAttack();
        }
      }).catch((err) => {
        console.warn('[RemotePlayer] fastClone failed:', err);
      });
    }
  }
  updateRemote(key, x, z, hp) {
    const r = this.remote.get(key);
    if (!r) return;
    if (r.isDying) return; // Не воскрешаем позицию и HP умирающего моба
    if (typeof x === 'number' && typeof z === 'number') {
      const obj = r.meshGroup || r.sprite;
      if (r.targetX == null) {
        // Первый спавн / инициализация координат
        r.targetX = x;
        r.targetZ = z;
        r.lastServerX = x;
        r.lastServerZ = z;
        r.lastServerT = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        r.vx = 0;
        r.vz = 0;
        r.isMoving = false;
        r.extrapolateT = 0;
        r.x = x;
        r.z = z;
        if (obj) {
          obj.position.x = x;
          obj.position.z = z;
        }
      } else {
        // Если активен авторитарный вектор (от move_vec_start):
        if (r._explicitVec) {
          const dev = Math.hypot(x - r.x, z - r.z);
          if (dev > 5.0) {
            // Реальный телепорт или критический рассинхрон — сбрасываем вектор
            r._explicitVec = false;
            r._moveVec = null;
            r.targetX = x;
            r.targetZ = z;
            r.x = x;
            r.z = z;
            r.vx = 0;
            r.vz = 0;
            r.isMoving = false;
            r.extrapolateT = 0;
            if (obj) { obj.position.x = x; obj.position.z = z; }
          }
        } else {
          // Дискретные пакеты позиции (все мобы, боты и игроки без явного вектора)
          const nowP = (typeof performance !== 'undefined' ? performance.now() : Date.now());
          const lastX = (r.lastServerX != null) ? r.lastServerX : r.x;
          const lastZ = (r.lastServerZ != null) ? r.lastServerZ : r.z;
          const lastT = r.lastServerT || (nowP - 100);

          const dServerX = x - lastX;
          const dServerZ = z - lastZ;
          const stepDist = Math.hypot(dServerX, dServerZ);
          const dt = Math.max(0.04, Math.min(0.5, (nowP - lastT) / 1000));

          r.lastServerX = x;
          r.lastServerZ = z;
          r.lastServerT = nowP;
          r.targetX = x;
          r.targetZ = z;

          const distFromVisual = Math.hypot(x - r.x, z - r.z);

          // Для мобов сохраняем прежнюю логику (не трогаем мобов), для ботов/игроков - улучшенный порог 8.0м
          const snapThreshold = (r.type === 'p') ? 8.0 : 6.0;

          if (distFromVisual > snapThreshold) {
            // Большой скачок — телепорт или респавн
            r.x = x;
            r.z = z;
            r.targetX = x;
            r.targetZ = z;
            r.vx = 0;
            r.vz = 0;
            r.isMoving = false;
            r.extrapolateT = 0;
            if (obj) {
              obj.position.x = x;
              obj.position.z = z;
            }
          } else if (stepDist > 0.03) {
            // Сущность перемещается (игроки, боты и мобы)
            const rawSpd = stepDist / dt;
            const maxSpd = (r.type === 'p') ? 9.0 : 6.5;
            const spd = Math.min(rawSpd, maxSpd);
            const dirX = dServerX / stepDist;
            const dirZ = dServerZ / stepDist;

            r.vx = dirX * spd;
            r.vz = dirZ * spd;
            r.isMoving = true;
            r.extrapolateT = Math.min(0.25, dt * 1.5);

            if (r.type === 'm' && !r.isDying) {
              this._faceFromWorldMove(r, dirX, dirZ);
              if (r.animName !== 'walk' && r.animName !== 'attack') {
                this._setRemoteAnim(r, 'walk', true);
              }
            }
          } else {
            // Сущность остановилась
            r.vx = 0;
            r.vz = 0;
            r.isMoving = false;
            r.extrapolateT = 0;
          }
        }
      }
    }
    r.hp = hp;
    const g = window.game;
    if (g && g.player && g.player.target && g.player.target.mid && ('m' + g.player.target.mid) === key) {
      g.player.target.hp = hp;
      if (g.ui && typeof g.ui.showTargetStatus === 'function') {
        g.ui.showTargetStatus(g.player.target);
      }
    }
  }

  /** Dead Reckoning: начало движения по вектору */
  handleMoveVecStart(mv) {
    if (!mv || !mv.k) return;
    const r = this.remote.get(mv.k);
    if (!r) return;

    // Если персонаж уже плавно движется к этой же цели — не перезапускаем таймер вектора
    if (r._explicitVec && r._moveVec) {
      const dTarget = Math.hypot(mv.targetX - r._moveVec.targetX, mv.targetZ - r._moveVec.targetZ);
      if (dTarget < 0.6) return;
    }

    const obj = r.meshGroup || r.sprite;
    const curX = (obj && Number.isFinite(obj.position.x)) ? obj.position.x : mv.startX;
    const curZ = (obj && Number.isFinite(obj.position.z)) ? obj.position.z : mv.startZ;
    const curDev = Math.hypot(curX - mv.startX, curZ - mv.startZ);

    // Если персонаж уже находится рядом со стартом (< 4.5м), плавно продолжаем от текущей визуальной точки!
    // Это исключает откат персонажа назад (Rubberbanding) при получении обновленного вектора.
    const effStartX = (curDev > 4.5) ? mv.startX : curX;
    const effStartZ = (curDev > 4.5) ? mv.startZ : curZ;

    const dx = mv.targetX - effStartX;
    const dz = mv.targetZ - effStartZ;
    const dist = Math.hypot(dx, dz);
    const spd = Math.max(0.1, +mv.speed || 4.125);
    const duration = dist > 0 ? (dist / spd) : 0;

    r._explicitVec = true;
    r._moveVec = {
      startX: effStartX,
      startZ: effStartZ,
      targetX: mv.targetX,
      targetZ: mv.targetZ,
      speed: spd,
      totalDist: dist,
      dirX: dist > 0 ? (dx / dist) : 0,
      dirZ: dist > 0 ? (dz / dist) : 0,
      startTime: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
      durationSec: duration,
      walking: !!mv.walking
    };
    r.targetX = mv.targetX;
    r.targetZ = mv.targetZ;
    r.x = effStartX;
    r.z = effStartZ;

    if (dist > 0.05) {
      if (r.type === 'p' && r._charModel) {
        const yaw = Math.atan2(dx, dz);
        r.facing = yaw;
        r._combatTarget = null;
        r._combatFaceTimer = 0;
        r._charModel.setFacing(yaw);
        r._charModel.setMoving(true, mv.walking ? 'walk' : 'run');
      } else if (r.type === 'm' && !r.isDying) {
        this._faceFromWorldMove(r, dx, dz);
        if (r.animName !== 'walk' && r.animName !== 'attack') this._setRemoteAnim(r, 'walk', true);
      }
    }
  }

  /** Dead Reckoning: остановка в точке stopX, stopZ */
  handleMoveVecStop(ms) {
    if (!ms || !ms.k) return;
    const r = this.remote.get(ms.k);
    if (!r) return;
    r._explicitVec = false;
    r._moveVec = null;
    const sx = ms.stopX != null ? ms.stopX : ms.x;
    const sz = ms.stopZ != null ? ms.stopZ : ms.z;
    if (typeof sx === 'number' && typeof sz === 'number') {
      r.targetX = sx;
      r.targetZ = sz;
      const curDist = Math.hypot(sx - r.x, sz - r.z);
      if (curDist > 5.0) {
        r.x = sx;
        r.z = sz;
      }
    }
    if (r.type === 'p' && r._charModel) {
      r._charModel.setMoving(false);
      if (r.facing != null && typeof r._charModel.setFacing === 'function') {
        r._charModel.setFacing(r.facing);
      }
    } else if (r.type === 'm' && !r.isDying) {
      if (r.animName !== 'idle' && r.animName !== 'attack') this._setRemoteAnim(r, 'idle', true);
    }
  }

  /** MOB_DB visual.sheets for Imagine 2D pipeline. */
  _mobVisual(mobId) {
    if (!mobId) return null;
    let t = null;
    if (window.MOB_DB && typeof window.MOB_DB.get === 'function') t = window.MOB_DB.get(mobId);
    if (!t && window.MOB_DATABASE) {
      t = window.MOB_DATABASE[mobId] || window.MOB_DATABASE[String(mobId).toUpperCase()];
    }
    return t || null;
  }

  _tryBindMobSheets(rec, mobId) {
    const vis = this._mobVisual(mobId);
    const cfg = vis && vis.sheets;
    if (!cfg || !cfg.base || !rec.sprite) return;
    const cache = window.MobSheetCache;
    if (!cache || typeof cache.load !== 'function') return;

    const base = String(cfg.base).replace(/\/$/, '');
    const names = ['idle', 'walk', 'attack', 'death'];
    const framesMap = cfg.frames || {};
    const fpsMap = cfg.fps || {};
    // optional multi-row grids: layout: { walk: { cols:4, rows:4 }, attack: { cols:4, rows:2 } }
    const layoutMap = cfg.layout || {};
    const fileMap = {
      idle: cfg.idle || 'idle_sheet.webp',
      walk: cfg.walk || 'walk_sheet.webp',
      attack: cfg.attack || 'attack_sheet.webp',
      death: cfg.death || 'death_sheet.webp'
    };
    // cache-bust (static server max-age=3600 on images otherwise sticks forever)
    const bust = (cfg.cacheBust != null ? String(cfg.cacheBust) : '1');
    const urlOf = (file) => base + '/' + file + (file.indexOf('?') >= 0 ? '&' : '?') + 'v=' + bust;

    // PERF: load death lazily on first death (saves VRAM/clones until needed)
    const eager = ['idle', 'walk', 'attack'];
    Promise.all(eager.map((n) => cache.load(urlOf(fileMap[n])))).then((texList) => {
      if (!rec.sprite || !rec.sprite.material) return;
      if (!this.remote.has((rec.type === 'p' ? 'p' : 'm') + (rec.pid || rec.mid))) return;
      const anims = {};
      let any = false;
      eager.forEach((n, i) => {
        const src = texList[i];
        if (!src) return;
        const fc = (framesMap[n] != null ? framesMap[n] : 4) | 0;
        const layout = layoutMap[n] || null;
        // Cap fps for fill-rate (detailed scrapper sheets)
        let fps = (fpsMap[n] != null ? fpsMap[n]
          : (n === 'idle' ? 4 : n === 'walk' ? 8 : 10));
        if (n === 'idle') fps = Math.min(fps, 4);
        if (n === 'walk') fps = Math.min(fps, 12);
        const tex = cache.cloneForAnim(src, fc, layout);
        if (!tex) return;
        const aspect = (cache.cellAspect) ? cache.cellAspect(src, fc, layout) : 1;
        anims[n] = { tex, frames: fc, fps, layout, aspect, _srcUrl: urlOf(fileMap[n]) };
        any = true;
      });
      if (!any) return;
      // death loaded on demand in playMobDeath
      rec._sheetCfg = { base, fileMap, framesMap, fpsMap, layoutMap, bust, urlOf };
      rec.sheetAnims = anims;
      rec.useSheets = true;
      rec.deathHoldSec = (cfg.deathHoldSec != null) ? cfg.deathHoldSec : 0.85;
      rec.deathFadeSec = (cfg.deathFadeSec != null) ? cfg.deathFadeSec : 0.9;
      // artFaces:'right' or faceInvert:true → UV facing inverted (moonwalk fix)
      rec.faceInvert = !!(cfg.faceInvert || cfg.artFaces === 'right');
      // Readable but not huge overdraw
      if (vis.scale != null && vis.scale > 0) {
        rec.baseScale = vis.scale;
      } else {
        rec.baseScale = (rec.baseScale || 2.2);
      }
      // straight-alpha chroma sheets — avoid pink foot disks from premult blend
      if (rec.sprite && rec.sprite.material) {
        rec.sprite.material.premultipliedAlpha = false;
        rec.sprite.material.needsUpdate = true;
      }
      rec._uvKey = ''; // dirty key for UV apply
      rec._hy = null; // re-sample height: large sheets need center = ground + scale/2
      this._setRemoteAnim(rec, 'idle', true);
      this._applyRemoteVisual(rec);
    });
  }

  /** Lazy-load death sheet once (first kill). */
  _ensureDeathSheet(rec) {
    if (!rec || !rec.useSheets || !rec.sheetAnims) return Promise.resolve(false);
    if (rec.sheetAnims.death) return Promise.resolve(true);
    const cfg = rec._sheetCfg;
    const cache = window.MobSheetCache;
    if (!cfg || !cache) return Promise.resolve(false);
    const deathFile = cfg.fileMap.death || 'death_sheet.webp';
    // same cache-bust as idle/walk/attack (cfg.urlOf), never bare path
    const url = (typeof cfg.urlOf === 'function')
      ? cfg.urlOf(deathFile)
      : (cfg.base + '/' + deathFile + '?v=' + (cfg.bust || '1'));
    return cache.load(url).then((src) => {
      if (!src || !rec.sheetAnims) return false;
      const fc = (cfg.framesMap.death != null ? cfg.framesMap.death : 4) | 0;
      const fps = Math.min(3, cfg.fpsMap.death != null ? cfg.fpsMap.death : 3);
      const layout = (cfg.layoutMap && cfg.layoutMap.death) || null;
      const tex = cache.cloneForAnim(src, fc, layout);
      if (!tex) return false;
      const aspect = (cache.cellAspect) ? cache.cellAspect(src, fc, layout) : 1;
      rec.sheetAnims.death = { tex, frames: fc, fps, layout, aspect, _srcUrl: url };
      return true;
    });
  }

  /**
   * Billboard XY from baseScale + current sheet cell aspect.
   * Height stays baseScale; width = height × (cellW/cellH) so landscape
   * attack cells (260×183) don't squash on a square sprite.
   */
  _remoteSheetScaleXY(r) {
    const sc = Math.abs((r && r.baseScale) || 2.5);
    let aspect = 1;
    if (r && r.useSheets && r.sheetAnims) {
      const a = r.sheetAnims[r.animName] || r.sheetAnims.idle;
      if (a && a.aspect > 0) aspect = a.aspect;
    }
    return { x: sc * aspect, y: sc };
  }

  /**
   * Scale is always positive — THREE.Sprite discards negative scale.x.
   * Facing is applied via UV (repeat.x / offset.x).
   * Y: sprite is centered — feet sit on ground when y = ground + scale.y*0.5
   * (same as spawn.js Enemy mesh).
   */
  _applyRemoteVisual(r) {
    if (!r.sprite) return;
    const xy = this._remoteSheetScaleXY(r);
    r.sprite.scale.set(xy.x, xy.y, 1);
    if (r.shadow) {
      // shared unit circle geo → scale with billboard height
      const ss = Math.max(0.6, xy.y * 0.32);
      r.shadow.scale.set(ss, ss, 1);
    }
    this._applyRemoteFacingUV(r);
  }

  /** World Y for remote billboard center so feet rest on terrain. */
  _remoteFootY(r, groundY) {
    // Use height (scale.y / baseScale), not width — aspect must not lift/sink feet
    const sc = Math.abs((r && r.baseScale) || (r && r.sprite && r.sprite.scale.y) || 2.5);
    // THREE.Sprite origin = center; bottom ≈ -scale.y/2
    // slight lift (+eps) — never sink into hill textures (was -0.04)
    return groundY + sc * 0.5 + 0.04;
  }

  /**
   * Ground Y under remote: near = mesh standY (no sink on hills),
   * far = bake + peak/slope lift (cheap).
   * Returns { ground, shadowY }.
   */
  _remoteGroundSample(x, z, precise) {
    const T = window.Terrain;
    const foot = (T && T.PLAYER_FOOT != null) ? T.PLAYER_FOOT : 0.95;
    const sea = (T && T.seaLevel != null) ? T.seaLevel : 0;
    if (!T || typeof T.heightAt !== 'function') {
      return { ground: sea, shadowY: sea + 0.025, y: sea + foot };
    }
    // Near: same path as local player (raycast live mesh)
    if (precise && typeof T.standY === 'function') {
      const st = T.standY(x, z);
      if (st && st.ground != null && isFinite(st.ground)) {
        return {
          ground: Math.max(st.ground, sea - 0.3),
          shadowY: (st.shadowY != null ? st.shadowY : st.ground + 0.025),
          y: (st.y != null ? st.y : (Math.max(st.ground, sea - 0.3) + foot))
        };
      }
    }
    // Far/mid fallback: bake + BSP brushes + max-neighbor lift + slope (no 5-ray standY)
    const bake = T.heightAt(x, z);
    let gh = bake;
    if (window.BspBrushes && typeof window.BspBrushes.standYAt === 'function') {
      const by = window.BspBrushes.standYAt(x, z);
      if (by != null && isFinite(by) && by > gh) gh = by;
    }
    if (typeof T.heightAtMax === 'function') {
      const mx = T.heightAtMax(x, z, 2.4);
      gh = Math.max(gh, bake + Math.min(0.55, Math.max(0, mx - bake) * 0.45));
    }
    if (typeof T.slopeAt === 'function') {
      gh += Math.min(0.45, (T.slopeAt(x, z) || 0) * 0.65);
    }
    gh += 0.04; // anti z-fight into splat textures
    gh = Math.max(gh, sea - 0.3);
    return { ground: gh, shadowY: gh + 0.025, y: gh + foot };
  }

  _applyRemoteFacingUV(r) {
    if (!r.sprite || !r.sprite.material) return;
    // faceInvert: sheet art faces opposite of loose_bolt canon (fixes moonwalk)
    let face = r.facing >= 0 ? 1 : -1;
    if (r.faceInvert) face = -face;
    // Keep billboard aspect in sync with current anim cell (attack ≠ walk)
    const xy = this._remoteSheetScaleXY(r);
    r.sprite.scale.set(xy.x, xy.y, 1);
    const cache = window.MobSheetCache;
    if (r.useSheets && r.sheetAnims && cache && cache.applyFrame) {
      const a = r.sheetAnims[r.animName] || r.sheetAnims.idle;
      if (a && a.tex) {
        // Dirty-check: skip if same anim/frame/facing/aspect (huge win at 60fps × N mobs)
        const key = r.animName + '|' + (r.animFrame | 0) + '|' + face + '|' + xy.x.toFixed(3);
        if (r._uvKey === key && r.sprite.material.map === a.tex) return;
        r._uvKey = key;
        if (r.sprite.material.map !== a.tex) {
          r.sprite.material.map = a.tex;
          // map swap only — no needsUpdate (texture already uploaded)
        }
        cache.applyFrame(a.tex, r.animFrame || 0, a.frames, face, a.layout || null);
        return;
      }
    }
    const map = r.sprite.material.map;
    if (!map) return;
    if (cache && cache.applyFullFlip) cache.applyFullFlip(map, face);
    else {
      map.repeat.x = face;
      map.offset.x = face >= 0 ? 0 : 1;
    }
  }

  _setRemoteFacing(r, dir) {
    const d = dir >= 0 ? 1 : -1;
    if (r.facing === d) return;
    r.facing = d;
    this._applyRemoteFacingUV(r);
  }

  /**
   * Face left/right on SCREEN from a world XZ vector.
   * Project onto camera's right axis — orbit-cam safe (world ±X ≠ screen left/right).
   * Canon art (loose_bolt): faces screen-LEFT at facing=+1 (no UV flip).
   * facing=-1 flips UV so art faces screen-right. RIGHT-facing sheets moonwalk.
   */
  _faceFromWorldMove(r, dx, dz) {
    if (!r || (dx * dx + dz * dz) < 1e-12) return;
    const cam = (window.game && (window.game.camera || window.game.cam)) || null;
    let side;
    if (cam && cam.matrixWorld && cam.matrixWorld.elements) {
      const e = cam.matrixWorld.elements;
      // camera local +X (right) in world, flattened to XZ
      let rx = e[0];
      let rz = e[2];
      const len = Math.hypot(rx, rz);
      if (len > 1e-6) {
        rx /= len;
        rz /= len;
        side = dx * rx + dz * rz;
      }
    }
    if (side == null || !isFinite(side)) {
      // fallback: world X
      side = dx;
    }
    if (side > 1e-8) this._setRemoteFacing(r, 1);
    else if (side < -1e-8) this._setRemoteFacing(r, -1);
  }

  /** During attack: face local player (screen-relative). */
  _faceRemoteTowardLocalPlayer(r) {
    const g = window.game;
    if (!r || !r.sprite || !g || !g.player || !g.player.mesh) return;
    const pp = g.player.mesh.position;
    const sp = r.sprite.position;
    this._faceFromWorldMove(r, pp.x - sp.x, pp.z - sp.z);
  }

  _setRemoteAnim(r, name, force) {
    if (!r.useSheets || !r.sheetAnims) return;
    if (!force && r.animName === name) return;
    const a = r.sheetAnims[name] || r.sheetAnims.idle;
    if (!a || !r.sprite || !r.sprite.material) return;
    r.animName = r.sheetAnims[name] ? name : 'idle';
    r.animFrame = 0;
    r.animTime = 0;
    r._uvKey = ''; // force UV refresh
    r.sprite.material.map = a.tex;
    r.sprite.material.transparent = true;
    r.sprite.material.alphaTest = 0.28; // discard more empty texels → cheaper overdraw
    r.sprite.material.depthWrite = false;
    this._applyRemoteFacingUV(r);
  }

  _tickRemoteAnim(r, delta, moving) {
    if (!r.useSheets || !r.sheetAnims) return;
    // death / attack are one-shots — don't override with walk/idle
    if (r.isDying || r.animName === 'death') {
      this._advanceOneShot(r, delta, 'death');
      return;
    }
    // skill cast hold: keep attack pose briefly so cast is readable
    if (r._skillCastHold > 0) {
      r._skillCastHold -= delta;
      if (r.animName !== 'attack') this._setRemoteAnim(r, 'attack', true);
    } else if (r.animName !== 'attack') {
      this._setRemoteAnim(r, moving ? 'walk' : 'idle');
    }
    const a = r.sheetAnims[r.animName] || r.sheetAnims.idle;
    if (!a || a.frames < 1) return;
    r.animTime = (r.animTime || 0) + delta;
    // attack cast slightly slower for readability
    const fps = r.animName === 'attack' ? Math.min(a.fps || 10, 8) : a.fps;
    const spf = 1 / Math.max(1, fps);
    while (r.animTime >= spf) {
      r.animTime -= spf;
      if (r.animName === 'attack') {
        r.animFrame = (r.animFrame || 0) + 1;
        if (r.animFrame >= a.frames) {
          // hold last attack frame while cast hold remains
          r.animFrame = a.frames - 1;
          if (!(r._skillCastHold > 0)) {
            this._setRemoteAnim(r, moving ? 'walk' : 'idle', true);
            return;
          }
        }
      } else {
        r.animFrame = ((r.animFrame || 0) + 1) % a.frames;
      }
    }
    this._applyRemoteFacingUV(r);
  }

  /** Advance one-shot sheet (death): slow frames → hold corpse → fade out. */
  _advanceOneShot(r, delta, name) {
    const a = r.sheetAnims && (r.sheetAnims[name] || r.sheetAnims.death);
    if (!a || a.frames < 1) return;
    const holdSec = (r.deathHoldSec != null) ? r.deathHoldSec : 0.85;
    const fadeSec = (r.deathFadeSec != null) ? r.deathFadeSec : 0.9;

    if (r._deathHold) {
      // 1) keep last frame visible (corpse)
      r._deathHoldTime = (r._deathHoldTime || 0) + delta;
      if (r._deathHoldTime < holdSec) {
        this._applyRemoteFacingUV(r);
        return;
      }
      // 2) then fade
      r._deathFade = (r._deathFade || 0) + delta;
      const t = Math.min(1, r._deathFade / Math.max(0.05, fadeSec));
      if (r.sprite && r.sprite.material) {
        r.sprite.material.opacity = 1 - t;
        r.sprite.material.transparent = true;
        r.sprite.material.depthWrite = false;
      }
      if (t >= 1 && typeof r._onDeathDone === 'function') {
        const cb = r._onDeathDone;
        r._onDeathDone = null;
        cb();
      }
      return;
    }
    // Force slow death even if old cache had high fps
    const deathFps = Math.min(a.fps || 3, 4);
    r.animTime = (r.animTime || 0) + delta;
    const spf = 1 / Math.max(1.5, deathFps); // ≥ ~0.25s per frame
    while (r.animTime >= spf) {
      r.animTime -= spf;
      r.animFrame = (r.animFrame || 0) + 1;
      if (r.animFrame >= a.frames - 1) {
        r.animFrame = a.frames - 1;
        this._applyRemoteFacingUV(r);
        r._deathHold = true;
        r._deathHoldTime = 0;
        r._deathFade = 0;
        return;
      }
    }
    this._applyRemoteFacingUV(r);
  }

  /** Play attack sheet once (mob hit player / combat cue). */
  playMobAttackAnim(key) {
    const r = this.remote.get(key);
    if (!r || r.isDying) return;
    // Turn toward player for the strike + hold combat face a bit (circle-strafe)
    this._faceRemoteTowardLocalPlayer(r);
    r.combatFaceT = 1.4; // sec: keep facing player between swings
    if (!r.useSheets) return;
    this._setRemoteAnim(r, 'attack', true);
  }

  /**
   * Replicates remote player attack swing & orientation for peers in AOI.
   */
  _maybeTriggerAttackerSwing(m, targetKey) {
    if (!m || m.by == null) return;
    if (typeof m.by === 'string' && m.by[0] === 'm') return; // Mob attacks handled by playMobAttackAnim
    const rawBy = m.by;
    const attackerPid = (typeof rawBy === 'number')
      ? rawBy
      : (typeof rawBy === 'string' && rawBy.startsWith('p') ? parseInt(rawBy.slice(1), 10) : parseInt(rawBy, 10));
    if (!attackerPid || (this.pid != null && attackerPid === this.pid)) return; // Skip self (local player already handled)
    const attacker = this.remote.get('p' + attackerPid);
    if (!attacker || attacker.type !== 'p') return;
    this._triggerRemotePlayerAttack(attacker, targetKey, m);
  }

  _triggerRemotePlayerAttack(attacker, targetKey, m) {
    if (!attacker) return;
    const g = window.game;
    let facing = (m && m.facing != null && isFinite(m.facing)) ? m.facing : null;
    let target = null;
    if (targetKey) {
      target = this.remote.get(targetKey) || ((g && g.player && ('p' + g.player.pid === targetKey)) ? g.player : null);
    }
    const ax = (attacker.meshGroup && attacker.meshGroup.position) ? attacker.meshGroup.position.x : attacker.x;
    const az = (attacker.meshGroup && attacker.meshGroup.position) ? attacker.meshGroup.position.z : attacker.z;

    if (facing == null && target) {
      const tx = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.x
        : ((target.mesh && target.mesh.position) ? target.mesh.position.x
        : ((target.sprite && target.sprite.position) ? target.sprite.position.x
        : target.x));
      const tz = (target.meshGroup && target.meshGroup.position) ? target.meshGroup.position.z
        : ((target.mesh && target.mesh.position) ? target.mesh.position.z
        : ((target.sprite && target.sprite.position) ? target.sprite.position.z
        : target.z));
      if (typeof ax === 'number' && typeof tx === 'number' && typeof az === 'number' && typeof tz === 'number') {
        const dx = tx - ax;
        const dz = tz - az;
        if (dx * dx + dz * dz > 0.0001) {
          facing = Math.atan2(dx, dz);
        }
      }
    }

    if (facing != null && isFinite(facing)) {
      attacker.facing = facing;
      if (attacker._charModel && typeof attacker._charModel.setFacing === 'function') {
        attacker._charModel.setFacing(facing);
      }
      if (attacker._auraRoot) {
        attacker._auraRoot.rotation.y = facing;
      }
    }

    const intervalMs = (m && m.atkInterval && m.atkInterval > 0) ? m.atkInterval : 800;
    const swingSec = Math.max(0.2, intervalMs / 1000);

    if (targetKey) {
      attacker._combatTarget = targetKey;
      attacker._combatFaceTimer = Math.max(1.2, swingSec * 1.5);
      attacker._attackTimer = Math.max(0.7, swingSec + 0.35);
    }

    // Halt movement interpolation on attack strike
    if (attacker._moveVec) {
      attacker._moveVec = null;
    }

    if (attacker._charModel) {
      if (typeof attacker._charModel.setMoving === 'function') {
        attacker._charModel.setMoving(false);
      }
      if (typeof attacker._charModel.playAttack === 'function') {
        attacker._charModel.playAttack(swingSec);
      }
    }
  }

  /**
   * Death: play death sheet + fade, then removeRemote.
   * Fallback: quick scale/fade if no death sheet.
   */
  playMobDeath(key, onDone) {
    const r = this.remote.get(key);
    if (!r) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    if (r._deathStarted) return;
    r._deathStarted = true;
    r.isDying = true;
    r.hp = 0;

    const finish = () => {
      this.removeRemote(key, { force: true });
      if (typeof onDone === 'function') onDone();
    };

    const startDeathAnim = () => {
      if (r.useSheets && r.sheetAnims && r.sheetAnims.death) {
        r.sheetAnims.death.fps = Math.min(r.sheetAnims.death.fps || 3, 3);
        if (r.deathHoldSec == null) r.deathHoldSec = 0.85;
        if (r.deathFadeSec == null) r.deathFadeSec = 0.9;
        this._setRemoteAnim(r, 'death', true);
        r._deathHold = false;
        r._deathHoldTime = 0;
        r._deathFade = 0;
        r._onDeathDone = finish;
        setTimeout(() => {
          if (this.remote.has(key) && this.remote.get(key) === r) finish();
        }, 6000);
        return true;
      }
      return false;
    };

    // Lazy death sheet
    if (r.useSheets && r.sheetAnims && !r.sheetAnims.death) {
      this._ensureDeathSheet(r).then((ok) => {
        if (!this.remote.has(key)) {
          if (typeof onDone === 'function') onDone();
          return;
        }
        if (ok && startDeathAnim()) return;
        this._playDeathFadeFallback(r, key, finish);
      }).catch(() => {
        this._playDeathFadeFallback(r, key, finish);
      });
      setTimeout(() => {
        if (this.remote.has(key) && this.remote.get(key) === r) finish();
      }, 5000);
      return;
    }

    if (startDeathAnim()) return;

    this._playDeathFadeFallback(r, key, finish);
  }

  _playDeathFadeFallback(r, key, finish) {
    const sp = r.sprite;
    if (!sp || !sp.material) {
      finish();
      return;
    }
    const start = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    const dur = 1200;
    const tick = () => {
      if (!this.remote.has(key)) {
        finish();
        return;
      }
      const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      const t = Math.min(1, (now - start) / dur);
      sp.material.opacity = 1 - t;
      sp.material.transparent = true;
      const sc = Math.abs(r.baseScale || 2.5) * (1 - t * 0.35);
      let aspect = 1;
      if (r.sheetAnims) {
        const a = r.sheetAnims[r.animName] || r.sheetAnims.death || r.sheetAnims.idle;
        if (a && a.aspect > 0) aspect = a.aspect;
      }
      sp.scale.set(sc * aspect, sc * (1 - t * 0.5), 1);
      if (t < 1) requestAnimationFrame(tick);
      else finish();
    };
    requestAnimationFrame(tick);
  }

  /**
   * @param {string} key
   * @param {{ force?: boolean }} [opts] - force=true skips isDying guard (death finish / logout)
   */
  removeRemote(key, opts) {
    const r = this.remote.get(key);
    if (!r) return;
    // Guard: external leave must not cancel death playback
    if (r.isDying && !(opts && opts.force)) return;
    r._onDeathDone = null;
    r.isDying = false;
    const sc = window.game && window.game.scene;
    if (r._charModel) {
      try {
        if (typeof r._charModel.dispose === 'function') r._charModel.dispose();
      } catch (eCM) {}
      r._charModel = null;
    }
    if (r.meshGroup && sc) {
      try { sc.remove(r.meshGroup); } catch (eG) {}
    }
    const disposeSprite = (obj) => {
      if (!obj) return;
      if (sc) sc.remove(obj);
      // dispose unique materials (cloned for hit-tint); never dispose shared atlas maps
      if (obj.userData && obj.userData._ownsMaterial && obj.material) {
        if (obj.userData._ownsMap && obj.material.map) {
          try { obj.material.map.dispose(); } catch (e) { /* */ }
        }
        obj.material.map = null;
        obj.material.dispose();
      }
    };
    disposeSprite(r.sprite);
    if (r.shadow && sc) sc.remove(r.shadow);
    disposeSprite(r.nameTag);
    if (r.rankAura) {
      if (sc) sc.remove(r.rankAura);
      if (r.rankAura.material) {
        if (r.rankAura.material.map) r.rankAura.material.map.dispose();
        r.rankAura.material.dispose();
      }
      if (r.rankAura.geometry) r.rankAura.geometry.dispose();
      r.rankAura = null;
    }
    if (r._auraRoot && sc) {
      try {
        sc.remove(r._auraRoot);
        r._auraRoot.traverse((o) => {
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
          if (o.geometry) o.geometry.dispose();
        });
      } catch (e) { /* */ }
      r._auraRoot = null;
    }
    if (this._spawnQueue && this._spawnQueue.length > 0) {
      this._spawnQueue = this._spawnQueue.filter(j => j.key !== key);
    }
    this.remote.delete(key);
    const g = window.game;
    if (g && g.player && g.player.target) {
      const t = g.player.target;
      if ((t.pid != null && ('p' + t.pid) === key) || (t.mid != null && ('m' + t.mid) === key)) {
        g.player.target = null;
        if (typeof g.player.stopFollowing === 'function') g.player.stopFollowing();
        if (g.ui && typeof g.ui.hideTargetStatus === 'function') g.ui.hideTargetStatus();
      }
    }
  }
  clearRemote() {
    if (this._spawnQueue) this._spawnQueue.length = 0;
    for (const k of [...this.remote.keys()]) this.removeRemote(k, { force: true });
  }

  /** Shared mob/player billboard textures (one canvas each — not per entity). */
  _sharedRemoteMats() {
    if (this._remoteMats) return this._remoteMats;
    const mk = (fillBody, fillHead) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      x.fillStyle = fillBody;
      x.fillRect(16, 24, 32, 28);
      x.fillStyle = fillHead;
      x.beginPath(); x.arc(32, 30, 5, 0, Math.PI * 2); x.fill();
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
    };
    this._remoteMats = {
      mob: mk('#884444', '#ff0000'),
      boss: mk('#aa0022', '#ff2200'),
      shadowGeo: new THREE.CircleGeometry(0.8, 12),
      shadowMat: new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false })
    };
    return this._remoteMats;
  }

  makeSprite(s, groundY, shadowY) {
    const g = window.game;
    const mats = this._sharedRemoteMats();
    let baseMat = mats.mob;
    if (s.boss) baseMat = mats.boss;
    const mat = baseMat.clone();
    mat.transparent = true;
    mat.alphaTest = 0.12;
    const sp = new THREE.Sprite(mat);
    let sc = s.boss ? 6 : 2.5;
    if (s.mobId) {
      const vis = this._mobVisual(s.mobId);
      if (vis && vis.scale != null && vis.scale > 0) sc = vis.scale;
    }
    sp.scale.set(sc, sc, 1);
    const initialY = (groundY != null)
      ? this._remoteFootY({ baseScale: sc, sprite: { scale: { y: sc } } }, groundY)
      : (sc * 0.5);
    sp.position.set(s.x, initialY, s.z);
    sp.userData.remoteKey = (s.t === 'p' ? 'p' : 'm') + (s.pid || s.mid);
    sp.userData._ownsMaterial = true;
    sp.userData.mobId = s.mobId || null;
    g.scene.add(sp);

    let sh = null;
    const wantShadow = s.boss || s.named || s.champion ||
      s.role === 'elite' || s.role === 'party_elite' || s.role === 'named' ||
      s.role === 'raid' || s.role === 'field_rb';
    if (wantShadow) {
      sh = new THREE.Mesh(mats.shadowGeo, mats.shadowMat);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set(s.x, shadowY != null ? shadowY : 0.01, s.z);
      const ss = Math.max(0.6, sc * 0.32);
      sh.scale.set(ss, ss, 1);
      g.scene.add(sh);
    }
    mat.alphaTest = 0.28;
    mat.depthWrite = false;
    mat.premultipliedAlpha = false;
    sp.frustumCulled = true;

    const DB = window.MOB_DB;
    const rank = (DB && DB.rankOf)
      ? DB.rankOf(s.mobId, {
        role: s.role, boss: s.boss, named: s.named,
        champion: s.champion, raid: s.role === 'raid'
      })
      : { id: s.boss ? 'boss' : 'normal', showDist: s.boss ? 94 : 38 };
    if (!this._mobNameTexCache) this._mobNameTexCache = new Map();
    const mName = s.name || this.mobDisplayName(s.mobId, s.mobId) || '?';
    const rankId = rank.id || 'normal';
    const mobKey = `${s.mobId || mName}_${s.level || 1}_${rankId}_${s.role || ''}_${s.champion ? 1 : 0}`;
    let ttex = this._mobNameTexCache.get(mobKey);
    let isSharedMobMap = true;
    if (!ttex) {
      isSharedMobMap = false;
      const tc = document.createElement('canvas');
      this._paintMobName(tc, s, rank);
      ttex = new THREE.CanvasTexture(tc);
      ttex.generateMipmaps = false;
      ttex.minFilter = THREE.LinearFilter;
      ttex.magFilter = THREE.LinearFilter;
      if (g.renderer && typeof g.renderer.initTexture === 'function') {
        try { g.renderer.initTexture(ttex); } catch (e) {}
      }
      this._mobNameTexCache.set(mobKey, ttex);
    }
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ttex, transparent: true, depthTest: false, depthWrite: false
    }));
    const scN = (DB && DB.nameplateScale) ? DB.nameplateScale(rank) : { x: 10.8, y: 1.95 };
    tag.scale.set(scN.x, scN.y, 1);
    tag.position.set(s.x, initialY + scN.y * 0.7 + 0.55, s.z);
    tag.renderOrder = rank.id === 'normal' ? 996 : 998;
    tag.userData._ownsMaterial = true;
    tag.userData._ownsMap = !isSharedMobMap;
    tag.userData.rankId = rank.id;
    g.scene.add(tag);
    return { sp, sh, tag, baseScale: sc, rank, initialY };
  }
  _paintMobName(canvas, s, rank) {
    const DB = window.MOB_DB;
    const name = s.name || this.mobDisplayName(s.mobId, s.mobId) || '?';
    if (DB && typeof DB.paintMobNameplate === 'function') {
      DB.paintMobNameplate(canvas, {
        name: name,
        level: s.level,
        mobId: s.mobId,
        role: s.role,
        boss: s.boss,
        named: s.named,
        champion: s.champion,
        rank: rank
      });
      return;
    }
    const tx = canvas.getContext('2d');
    canvas.width = 512; canvas.height = 120;
    tx.clearRect(0, 0, canvas.width, canvas.height);
    tx.textAlign = 'center';
    tx.textBaseline = 'middle';
    tx.strokeStyle = '#000'; tx.lineWidth = 4;
    tx.font = 'bold 32px Segoe UI, Arial';
    tx.fillStyle = '#e8e0c8';
    tx.strokeText('Ур.' + Math.max(1, s.level | 0), canvas.width / 2, 38);
    tx.fillText('Ур.' + Math.max(1, s.level | 0), canvas.width / 2, 38);
    tx.font = 'bold 28px Segoe UI, Arial';
    tx.fillStyle = s.boss ? '#ff6644' : '#f3efe4';
    tx.strokeText(name || '?', canvas.width / 2, 82);
    tx.fillText(name || '?', canvas.width / 2, 82);
  }
  _setRankAura(r, rank) {
    if (!r || !window.THREE || !window.game || !window.game.scene) return;
    if (r.rankAura) {
      window.game.scene.remove(r.rankAura);
      if (r.rankAura.material) {
        if (r.rankAura.material.map) r.rankAura.material.map.dispose();
        r.rankAura.material.dispose();
      }
      r.rankAura = null;
    }
    if (!rank || rank.id === 'normal') return;
    const hex = rank.glow || '#ffaa22';
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
    g.addColorStop(0, hex + '00');
    g.addColorStop(0.42, hex + '33');
    g.addColorStop(0.68, hex + '88');
    g.addColorStop(1, hex + '00');
    x.fillStyle = g;
    x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
    x.strokeStyle = hex;
    x.globalAlpha = 0.85;
    x.lineWidth = rank.id === 'raid' || rank.id === 'boss' ? 4 : 2.5;
    x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke();
    if (rank.id === 'raid' || rank.id === 'boss') {
      x.globalAlpha = 0.45;
      x.lineWidth = 2;
      x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.stroke();
    }
    const size = rank.id === 'raid' ? 4.4 : rank.id === 'boss' ? 3.8 : rank.id === 'x' ? 2.6 : 2.8;
    const geo = new THREE.CircleGeometry(1, 32);
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: rank.id === 'x' ? 0.72 : 0.82
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(size, size, 1);
    mesh.renderOrder = 2;
    mesh.userData._ownsMaterial = true;
    mesh.userData._ownsMap = true;
    window.game.scene.add(mesh);
    r.rankAura = mesh;
  }
  _paintRemoteName(canvas, s) {
    const COSDB = window.COSMETICS_DB;
    const isGm = !!s.gm || (s.accessLevel != null && s.accessLevel >= 50);
    if (COSDB && typeof COSDB.paintNameplate === 'function') {
      const crest = (s.crestHash && this._clanCrests[s.crestHash]) ? this._clanCrests[s.crestHash].image : null;
      COSDB.paintNameplate(canvas, {
        name: s.name || '?',
        titleId: s.title,
        titleName: s.titleName,
        titleColor: s.titleColor,
        nameColor: s.dueling ? '#d060ff' : (s.flagged ? '#ff4444' : (s.nameColor || (isGm ? '#00f0ff' : '#ffffff'))),
        level: s.level,
        flagged: s.flagged,
        dueling: !!s.dueling,
        clanName: s.clanName || null,
        crestImage: crest,
        gm: isGm,
        accessLevel: s.accessLevel || (isGm ? 100 : 0)
      });
      return;
    }
    const tx = canvas.getContext('2d');
    const sc = (canvas.height || 96) / 96;
    tx.clearRect(0, 0, canvas.width, canvas.height);
    tx.imageSmoothingEnabled = true;
    tx.imageSmoothingQuality = 'high';
    tx.font = `bold ${Math.round(22 * sc)}px "Segoe UI", Arial, sans-serif`; tx.textAlign = 'center';
    tx.fillStyle = s.dueling ? '#d060ff' : (s.flagged ? '#ff4444' : (s.nameColor || (isGm ? '#00f0ff' : '#ffffff')));
    tx.strokeStyle = '#000'; tx.lineWidth = Math.max(2, Math.round(3 * sc));
    tx.strokeText(s.name || '?', canvas.width / 2, canvas.height * 0.55);
    tx.fillText(s.name || '?', canvas.width / 2, canvas.height * 0.55);
  }
  _refreshRemoteNameTag(r) {
    if (!r || !r.nameTag) return;
    let canvas = r.nameTag.userData && r.nameTag.userData._canvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 1024; canvas.height = 256;
      r.nameTag.userData = r.nameTag.userData || {};
      r.nameTag.userData._canvas = canvas;
    }
    if (r.type === 'm') {
      this._paintMobName(canvas, {
        name: r.name, mobId: r.mobId, level: r.level,
        role: r.role, boss: r.boss, named: r.named, champion: r.champion
      }, r.rank);
    } else {
      this._paintRemoteName(canvas, {
        name: r.name, title: r.title, titleName: r.titleName, titleColor: r.titleColor,
        nameColor: r.nameColor, level: r.level, flagged: r.flagged, dueling: r.dueling,
        clanName: r.clanName, crestHash: r.crestHash, gm: r.gm, accessLevel: r.accessLevel
      });
    }
    if (r.nameTag.material && r.nameTag.material.map) {
      r.nameTag.material.map.image = canvas;
      r.nameTag.material.map.generateMipmaps = false;
      r.nameTag.material.map.minFilter = (window.THREE && THREE.LinearFilter) || 1006;
      r.nameTag.material.map.magFilter = (window.THREE && THREE.LinearFilter) || 1006;
      r.nameTag.material.map.needsUpdate = true;
    } else if (window.THREE) {
      const ttex = new THREE.CanvasTexture(canvas);
      ttex.generateMipmaps = false;
      ttex.minFilter = THREE.LinearFilter;
      ttex.magFilter = THREE.LinearFilter;
      if (r.nameTag.material) r.nameTag.material.map = ttex;
      ttex.needsUpdate = true;
    }
    if (r.type === 'm') {
      const DB = window.MOB_DB;
      const scN = (DB && DB.nameplateScale) ? DB.nameplateScale(r.rank) : { x: 10.8, y: 1.95 };
      r.nameTag.scale.set(scN.x, scN.y, 1);
    } else {
      const hasTitle = !!(r.titleName || r.title || r.gm);
      r.nameTag.scale.set(hasTitle ? 5.6 : 4.8, hasTitle ? 1.4 : 1.2, 1);
    }
  }
  _setRemoteAura(r, auraId) {
    if (!r || !window.THREE || !window.game || !window.game.scene) return;
    if (r._auraRoot) {
      window.game.scene.remove(r._auraRoot);
      r._auraRoot.traverse((o) => {
        if (o.material) {
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
        if (o.geometry) o.geometry.dispose();
      });
      r._auraRoot = null;
      r._auraData = null;
    }
    if (!auraId) {
      r.aura = null;
      return;
    }
    const COSDB = window.COSMETICS_DB;
    const def = (COSDB && COSDB.AURAS && COSDB.AURAS[auraId]) || {
      id: auraId,
      name: auraId,
      color: 0x00d4ff,
      hex: '#00d4ff',
      innerHex: '#ffffff'
    };

    const ad = window.createChampionAuraGroup ? window.createChampionAuraGroup(window.THREE, def, auraId) : null;
    if (ad) {
      window.game.scene.add(ad.root);
      r._auraRoot = ad.root;
      r._auraData = ad;
      r.aura = auraId;
      if (r.meshGroup) {
        r._auraRoot.position.set(r.meshGroup.position.x, (r._shy != null ? r._shy : 0) + 0.02, r.meshGroup.position.z);
      }
    }
  }
  posOf(key) {
    const r = this.remote.get(key);
    if (!r) return new THREE.Vector3();
    if (r.meshGroup) return r.meshGroup.position.clone().add(new THREE.Vector3(0, 0.4, 0));
    if (r.sprite) return r.sprite.position.clone();
    return new THREE.Vector3(r.x, 1.5, r.z);
  }
  _nameOf(key) {
    if (!key) return null;
    const r = this.remote.get(key);
    if (r) {
      if (r.mobId) {
        const loc = this.mobDisplayName(r.mobId, r.name || r.mobId);
        if (loc && loc !== r.mobId) return loc;
      }
      if (r.name && r.name !== r.mobId) return r.name;
    }
    const g = window.game;
    if (g && g.player && g.player.target) {
      const tgt = g.player.target;
      if (tgt && (('m' + tgt.mid) === key || ('p' + tgt.pid) === key)) {
        if (tgt.mobId) {
          const loc = this.mobDisplayName(tgt.mobId, tgt.name);
          if (loc) return loc;
        }
        if (tgt.name) return tgt.name;
      }
    }
    // Без заглушек «Враг/Игрок» — chatDamage просто пропустит null
    return null;
  }
  _skillName(id) {
    if (!id) return null;
    const sid = String(id);
    // Mob skill catalog (oil_slick → Масляная лужа)
    try {
      const MDB = window.MOB_DB || (typeof MOB_DB !== 'undefined' ? MOB_DB : null);
      if (MDB && MDB.SKILL_CATALOG && MDB.SKILL_CATALOG[sid] && MDB.SKILL_CATALOG[sid].name) {
        return MDB.SKILL_CATALOG[sid].name;
      }
      if (MDB && MDB.SKILL_CATALOG) {
        const low = sid.toLowerCase();
        if (MDB.SKILL_CATALOG[low] && MDB.SKILL_CATALOG[low].name) return MDB.SKILL_CATALOG[low].name;
      }
    } catch (e0) { /* ignore */ }
    if (typeof resolveSkill === 'function') {
      const t = resolveSkill(sid);
      if (t && t.name) return t.name;
    }
    if (window.SKILL_DATABASE && window.SKILL_DATABASE[sid] && window.SKILL_DATABASE[sid].name) {
      return window.SKILL_DATABASE[sid].name;
    }
    // never return raw snake_case as "display name"
    if (/^[a-z][a-z0-9_]*$/.test(sid)) return null;
    return sid;
  }

  /** Mirror server debuffs on local player (slow UX / flags). */
  _applyLocalStatus(player, effects) {
    if (!player || !effects) return;
    const now = Date.now();
    effects.forEach((e) => {
      if (!e) return;
      const until = e.until != null ? +e.until : (now + (+e.duration || 3) * 1000);
      if (e.kind === 'slow' || (e.mult != null && e.mult < 1 && e.kind !== 'pdef')) {
        player.slowUntil = Math.max(player.slowUntil || 0, until);
        player.slowMult = e.mult != null ? +e.mult : 0.6;
      }
      if (e.kind === 'stun') {
        player.stunUntil = Math.max(player.stunUntil || 0, until);
      }
      if (e.kind === 'silence') {
        player.silenceUntil = Math.max(player.silenceUntil || 0, until);
      }
    });
  }
  getEnemyMeshes() { const a = []; for (const [, r] of this.remote) if (r.type === 'm' && r.sprite) a.push(r.sprite); return a; }
  getPlayerMeshes() {
    const a = [];
    for (const [, r] of this.remote) {
      if (r.type === 'p') {
        if (r.meshGroup) a.push(r.meshGroup);
        else if (r.sprite) a.push(r.sprite);
      }
    }
    return a;
  }
  enemyByKey(key) { return this.remote.get(key) || null; }
  findPlayerByName(name) { for (const [, r] of this.remote) if (r.type === 'p' && r.name === name) return r; return null; }
  _setEntityAlpha(rootObj, alpha, r) {
    if (!rootObj) return;
    const a = Math.max(0.0, Math.min(1.0, alpha));
    if (r && r._lastAppliedAlpha != null && Math.abs(r._lastAppliedAlpha - a) < 0.005) {
      return;
    }
    if (r) r._lastAppliedAlpha = a;
    rootObj.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (let mIdx = 0; mIdx < mats.length; mIdx++) {
          const m = mats[mIdx];
          if (!m) continue;
          if (m.userData && m.userData._l2OrigTrans === undefined) {
            m.userData._l2OrigTrans = m.transparent;
            m.userData._l2OrigDepthWrite = m.depthWrite;
          }
          if (a < 0.99) {
            m.transparent = true;
            m.depthWrite = true;
            m.opacity = a;
          } else {
            m.transparent = m.userData ? !!m.userData._l2OrigTrans : false;
            m.depthWrite = m.userData ? !!m.userData._l2OrigDepthWrite : true;
            m.opacity = 1.0;
          }
        }
      } else if (child.isSprite && child.material) {
        child.material.opacity = a;
      }
    });
  }

  update(delta) {
    const g = window.game;
    const isEditor = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
    const useTerrain = !!(window.Terrain && typeof window.Terrain.heightAt === 'function');
    this._remoteFrame = (this._remoteFrame || 0) + 1;

    // Time-sliced 3D player model spawn: process up to 4 queued actors per frame (zero-freeze guaranteed)
    if (this._spawnQueue && this._spawnQueue.length > 0) {
      const quota = Math.min(4, this._spawnQueue.length);
      for (let q = 0; q < quota; q++) {
        const job = this._spawnQueue.shift();
        if (job && this.remote.has(job.key)) {
          this._initRemotePlayer3D(job.s, job.group, job.rec, job.key);
        }
      }
    }

    // ─── L2 Visibility Engine Evaluation ───
    const visMgr = window.L2VisibilityManager || window.L2Vis;
    if (visMgr && typeof visMgr.evaluate === 'function') {
      visMgr.evaluate(this.remote, g ? g.player : null, g ? (g.camera || g.cam) : null);
    }

    let i = 0;
    for (const [, r] of this.remote) {
      i++;
      const obj = r.meshGroup || r.sprite;
      if (!obj) continue;

      const visState = r._visState || 'visible_near';
      const isVisibleState = (visState === 'visible_near' || visState === 'visible_far');

      if (!isVisibleState) {
        if (obj.visible) obj.visible = false;
        if (r.shadow && r.shadow.visible) r.shadow.visible = false;
        if (r.nameTag && r.nameTag.visible) r.nameTag.visible = false;
        if (r.rankAura && r.rankAura.visible) r.rankAura.visible = false;
        if (r._auraRoot && r._auraRoot.visible) r._auraRoot.visible = false;
        r._wasHidden = true;
        continue;
      }

      // If actor was previously culled, snap coordinates only if displacement is large
      if (r._wasHidden) {
        r._wasHidden = false;
        if (r._charModel) {
          r._charModel._visibleGraceFrames = 15;
        }
        const curOff = Math.hypot(obj.position.x - r.x, obj.position.z - r.z);
        if (curOff > 6.0) {
          obj.position.x = r.x;
          obj.position.z = r.z;
        }
        if (r._hy != null && Math.abs(obj.position.y - r._hy) > 3.5) {
          obj.position.y = r._hy;
        }
        obj.updateMatrixWorld(true);
      }

      // Dead Reckoning & Snapshot Interpolation (Спринт 1, v2.2)
      const prevSx = obj.position.x;
      const prevSz = obj.position.z;

      if (r._explicitVec && r._moveVec) {
        const mv = r._moveVec;
        const nowP = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const elapsed = (nowP - mv.startTime) / 1000;
        if (mv.durationSec > 0 && elapsed >= mv.durationSec) {
          r.x = mv.targetX;
          r.z = mv.targetZ;
          r._moveVec = null;
          r._explicitVec = false;
          r._stopGraceTimer = 0.15;
        } else {
          const traveled = elapsed * mv.speed;
          r.x = mv.startX + mv.dirX * traveled;
          r.z = mv.startZ + mv.dirZ * traveled;
        }
        const k = Math.min(1, delta * 22);
        obj.position.x += (r.x - obj.position.x) * k;
        obj.position.z += (r.z - obj.position.z) * k;
      } else {
        // === ЕДИНЫЙ DEAD RECKONING ДЛЯ ВСЕХ СУЩНОСТЕЙ (ИГРОКИ, БОТЫ, МОБЫ) ===
        if (r.isMoving) {
          if (r.extrapolateT > 0) {
            r.extrapolateT -= delta;
            r.x += (r.vx || 0) * delta;
            r.z += (r.vz || 0) * delta;
          } else {
            // Окно экстраполяции истекло — плавное торможение вместо обрыва
            const decelRate = (r.type === 'p') ? 6.0 : 8.0;
            const decel = Math.max(0, 1.0 - delta * decelRate);
            r.vx = (r.vx || 0) * decel;
            r.vz = (r.vz || 0) * decel;
            r.x += r.vx * delta;
            r.z += r.vz * delta;
            if (Math.hypot(r.vx, r.vz) < 0.05) {
              r.vx = 0;
              r.vz = 0;
              r.isMoving = false;
            }
          }
        }

        // Мягкое сглаживание позиционной ошибки строго к авторитетным координатам сервера
        // (БЕЗ искусственного сдвига tX вперед, порождавшего резинку)
        const tX = (r.targetX != null) ? r.targetX : r.x;
        const tZ = (r.targetZ != null) ? r.targetZ : r.z;

        const errX = tX - r.x;
        const errZ = tZ - r.z;
        const errDist = Math.hypot(errX, errZ);

        if (errDist > 6.0) {
          r.x = tX;
          r.z = tZ;
          r.vx = 0;
          r.vz = 0;
          r.isMoving = false;
          obj.position.x = r.x;
          obj.position.z = r.z;
        } else if (errDist > 0.001) {
          const blendRate = r.isMoving ? 6.0 : 12.0;
          const blend = 1.0 - Math.exp(-blendRate * delta);
          r.x += errX * blend;
          r.z += errZ * blend;
          const k = Math.min(1, delta * 22);
          obj.position.x += (r.x - obj.position.x) * k;
          obj.position.z += (r.z - obj.position.z) * k;
        } else {
          const k = Math.min(1, delta * 22);
          obj.position.x += (r.x - obj.position.x) * k;
          obj.position.z += (r.z - obj.position.z) * k;
        }
      }

      const moveDx = obj.position.x - prevSx;
      const moveDz = obj.position.z - prevSz;
      const moveDist = Math.hypot(moveDx, moveDz);
      if (r._movingTimer > 0) r._movingTimer -= delta;
      if (r._stopGraceTimer > 0) r._stopGraceTimer -= delta;

      const moving = r.isMoving || (r.extrapolateT > 0) || (r._movingTimer > 0) || (r._stopGraceTimer > 0) || (moveDist > delta * 0.05);

      // Actor is visible
      if (!obj.visible) obj.visible = true;
      if (r.shadow) r.shadow.visible = true;

      const isTarget = !!(g && g.player && g.player.target === r);
      const farLod = visState === 'visible_far';
      const midLod = farLod || (r._l2Dist2 > 24 * 24);
      const preciseH = !farLod && (r._l2Dist2 <= 35 * 35);

      if (r.type === 'p') {
        if (r._charModel) {
          const isDead = !!(r.dead || r._charModel.state === 'dead');
          if (isDead) {
            if (typeof r._charModel.setMoving === 'function') r._charModel.setMoving(false);
          } else if (moving) {
            let targetYaw = null;
            if (moveDist > 0.003) {
              targetYaw = Math.atan2(moveDx, moveDz);
              r.facing = targetYaw;
            } else if (Math.hypot(r.vx || 0, r.vz || 0) > 0.05) {
              targetYaw = Math.atan2(r.vx, r.vz);
              r.facing = targetYaw;
            }
            if (targetYaw != null) {
              if (r._displayFacing == null) r._displayFacing = targetYaw;
              else {
                let diff = (targetYaw - r._displayFacing) % (Math.PI * 2);
                if (diff < -Math.PI) diff += Math.PI * 2;
                else if (diff > Math.PI) diff -= Math.PI * 2;
                r._displayFacing += diff * Math.min(1.0, delta * 14.0);
              }
              r._charModel.setFacing(r._displayFacing);
            } else if (r._displayFacing != null) {
              r._charModel.setFacing(r._displayFacing);
            }

            const instantSpeed = (moveDist > 0.003) ? (moveDist / Math.max(0.001, delta)) : Math.hypot(r.vx || 0, r.vz || 0);
            if (r._smoothSpeed == null) r._smoothSpeed = instantSpeed;
            else r._smoothSpeed += (instantSpeed - r._smoothSpeed) * Math.min(1.0, delta * 10.0);

            let mode = r._locoMode || 'run';
            if (r.walking === true || r.isWalking === true) {
              mode = 'walk';
            } else if (r.walking === false || r.isWalking === false) {
              mode = 'run';
            } else {
              if (mode === 'run' && r._smoothSpeed < 3.8) mode = 'walk';
              else if (mode === 'walk' && r._smoothSpeed > 5.2) mode = 'run';
            }
            r._locoMode = mode;
            r._charModel.setMoving(true, mode);
          } else {
            r._locoMode = null;
            r._charModel.setMoving(false);
            if (r._combatFaceTimer > 0) {
              r._combatFaceTimer -= delta;
              if (r._combatTarget) {
                const tgt = this.remote.get(r._combatTarget) || ((r._combatTarget === ('p' + this.pid)) ? g.player : null);
                if (tgt) {
                  const tx = (tgt.meshGroup && tgt.meshGroup.position) ? tgt.meshGroup.position.x
                    : ((tgt.mesh && tgt.mesh.position) ? tgt.mesh.position.x
                    : ((tgt.sprite && tgt.sprite.position) ? tgt.sprite.position.x : tgt.x));
                  const tz = (tgt.meshGroup && tgt.meshGroup.position) ? tgt.meshGroup.position.z
                    : ((tgt.mesh && tgt.mesh.position) ? tgt.mesh.position.z
                    : ((tgt.sprite && tgt.sprite.position) ? tgt.sprite.position.z : tgt.z));
                  if (typeof tx === 'number' && typeof tz === 'number') {
                    const cdx = tx - obj.position.x;
                    const cdz = tz - obj.position.z;
                    if (cdx * cdx + cdz * cdz > 0.0001) {
                      r.facing = Math.atan2(cdx, cdz);
                    }
                  }
                }
              }
            }
            if (r.facing !== undefined && typeof r._charModel.setFacing === 'function') {
              if (r._displayFacing == null) r._displayFacing = r.facing;
              else {
                let diff = (r.facing - r._displayFacing) % (Math.PI * 2);
                if (diff < -Math.PI) diff += Math.PI * 2;
                else if (diff > Math.PI) diff -= Math.PI * 2;
                r._displayFacing += diff * Math.min(1.0, delta * 12.0);
              }
              r._charModel.setFacing(r._displayFacing);
            }
            if (r._attackTimer > 0) {
              r._attackTimer -= delta;
              if (r._attackTimer <= 0 && r._charModel.state === 'attack') {
                if (typeof r._charModel.playIdle === 'function') r._charModel.playIdle();
              }
            }
          }
          if (typeof r._charModel.update === 'function') {
            r._charModel.update(delta, r._l2Dist, isTarget);
          }
          if (((r.gmSpeedMul && r.gmSpeedMul > 1) || r._flashIdleAura || r._flashStreamers) && window.SkillVFX && typeof window.SkillVFX.updateFlashRunEffects === 'function') {
            window.SkillVFX.updateFlashRunEffects(r, delta);
          }
        }
      } else if (r.type === 'm' && !r.isDying) {
        if (r.combatFaceT > 0) r.combatFaceT -= delta;
        if (!farLod && (r.animName === 'attack' || r.combatFaceT > 0)) {
          this._faceRemoteTowardLocalPlayer(r);
        } else if (moving && ((r.vx && Math.abs(r.vx) > 0.01) || (r.vz && Math.abs(r.vz) > 0.01) || moveDist > 0.001)) {
          this._faceFromWorldMove(r, r.vx || moveDx, r.vz || moveDz);
        }
        if (r.useSheets) {
          if (farLod) {
            if (r.animName !== 'idle') this._setRemoteAnim(r, 'idle', true);
            r.animFrame = 0;
            if (((this._remoteFrame + i) % 8) === 0) this._applyRemoteFacingUV(r);
          } else if (midLod) {
            if (((this._remoteFrame + i) % 2) === 0) this._tickRemoteAnim(r, delta * 2, moving);
          } else {
            this._tickRemoteAnim(r, delta, moving);
          }
        }
      } else if (r.type === 'm' && r.isDying && r.useSheets) {
        this._tickRemoteAnim(r, delta, false);
      }

      if (r.isStressBot) {
        // Fast elevation for crowd stress test (0 raycasts!)
        if (r._hy == null || moving) {
          const T = window.Terrain;
          let gh = (T && typeof T.heightAt === 'function') ? T.heightAt(obj.position.x, obj.position.z) : 0;
          if (window.BspBrushes && typeof window.BspBrushes.standYAt === 'function') {
            const by = window.BspBrushes.standYAt(obj.position.x, obj.position.z);
            if (by != null && isFinite(by) && by > gh) gh = by;
          }
          r._hy = gh + 0.95;
          r._shy = gh + 0.02;
        }
      } else {
        const hEvery = farLod ? 10 : (midLod ? 6 : (preciseH ? 3 : 5));
        const needH = useTerrain && (
          r._hy == null ||
          Math.abs(obj.position.x - (r._hx || 0)) > 0.28 ||
          Math.abs(obj.position.z - (r._hz || 0)) > 0.28 ||
          ((this._remoteFrame + i) % hEvery) === 0
        );
        if (needH) {
          const smp = this._remoteGroundSample(obj.position.x, obj.position.z, preciseH && r.type !== 'p');
          r._hy = (r.type === 'p') ? smp.y : this._remoteFootY(r, smp.ground);
          r._shy = smp.shadowY;
          r._hx = obj.position.x;
          r._hz = obj.position.z;
        }
      }
      if (r._hy != null) {
        obj.position.y += (r._hy - obj.position.y) * Math.min(1, delta * 12);
      }
      if (r.shadow) {
        r.shadow.visible = true;
        r.shadow.position.x = obj.position.x;
        r.shadow.position.z = obj.position.z;
        if (r._shy != null) r.shadow.position.y = r._shy;
        if (r.type === 'm' && r.baseScale) {
          const ss = Math.max(0.6, Math.abs(r.baseScale) * 0.32);
          r.shadow.scale.set(ss, ss, 1);
        }
      }
      if (r.nameTag) {
        const crowd = window.CrowdStressTest;
        const showCrowdNames = crowd ? crowd.showNames : false;

        // Ники игроков и ботов видны до 28м с плавным фейдом (в редакторе всегда на 100%)
        const inNameRange = (r._l2Dist <= (r.isStressBot ? 28.0 : 40.0));
        const allowName = isEditor || isTarget || (showCrowdNames !== false && inNameRange);

        // Плавное затухание прозрачности между 18м и 28м
        let distFade = 1.0;
        if (!isEditor && !isTarget && r._l2Dist > 18.0) {
          distFade = Math.max(0.0, 1.0 - (r._l2Dist - 18.0) / 10.0);
        }

        const npAlpha = isEditor ? 1.0 : ((r._nameplateAlpha != null ? r._nameplateAlpha : 1) * distFade);
        if (allowName && npAlpha > 0.03) {
          r.nameTag.visible = true;
          r.nameTag.position.x = obj.position.x;
          r.nameTag.position.z = obj.position.z;
          const head = (r.type === 'p')
            ? (obj.position.y + (r.isStressBot ? 1.95 : 1.15))
            : (obj.position.y + Math.abs(r.sprite ? r.sprite.scale.y : 2.5) * 0.5);
          const lift = (r.rank && r.rank.id !== 'normal') ? 0.62 : 0.42;
          r.nameTag.position.y = head + lift;
          const cam = g.camera || g.cam;
          if (cam && cam.position) {
            if (r.isStressBot) {
              // Compact fixed scale (3.0m x 0.56m) so it stays sharp and doesn't blow up to 20m!
              r.nameTag.scale.set(3.0, 0.56, 1);
            } else {
              const cDist = cam.position.distanceTo(r.nameTag.position);
              const DB = window.MOB_DB;
              let scN;
              if (r.type === 'm' && DB && DB.nameplateCamScale) {
                scN = DB.nameplateCamScale(r.rank, cDist);
              } else if (DB && DB.nameplateCamScale) {
                scN = DB.nameplateCamScale(
                  (r.titleName || r.title) ? { id: 'named' } : { id: 'normal' },
                  cDist
                );
              }
              if (scN) {
                const mult = (r.type === 'm') ? 1.0 : 0.72;
                r.nameTag.scale.set(scN.x * mult, scN.y * mult, 1);
              }
            }
          }
          if (r.nameTag.material) {
            r.nameTag.material.opacity = npAlpha;
          }
        } else {
          r.nameTag.visible = false;
        }
      }
      if (r.rankAura) {
        r.rankAura.visible = !r.isDying;
        if (!r.isDying) {
          r.rankAura.position.x = obj.position.x;
          r.rankAura.position.z = obj.position.z;
          r.rankAura.position.y = (r._shy != null ? r._shy : 0) + 0.05;
          const pulse = 0.88 + Math.sin(((this._remoteFrame || 0) + i) * 0.08) * 0.12;
          if (r.rankAura.material) r.rankAura.material.opacity = (r.rank && r.rank.id === 'x' ? 0.62 : 0.78) * pulse;
        }
      }
      if (r._auraRoot) {
        r._auraRoot.visible = true;
        r._auraRoot.position.x = obj.position.x;
        r._auraRoot.position.z = obj.position.z;
        r._auraRoot.position.y = (r._shy != null ? r._shy : 0) + 0.02;
        if (r.facing !== undefined) {
          r._auraRoot.rotation.y = r.facing;
        }
        if (r._auraData) {
          const ad = r._auraData;
          r._auraPulse = (r._auraPulse || 0) + delta * 1.5;
          if (ad.light) {
            ad.light.intensity = 0.85 + Math.sin(r._auraPulse * 1.2) * 0.12;
          }
          if (ad.pillarMat && ad.pillarMat.uniforms && ad.pillarMat.uniforms.uTime) {
            ad.pillarMat.uniforms.uTime.value += delta;
          }
          if (ad.innerPillarMat && ad.innerPillarMat.uniforms && ad.innerPillarMat.uniforms.uTime) {
            ad.innerPillarMat.uniforms.uTime.value += delta;
          }
          if (ad.rings) {
            for (let j = 0; j < ad.rings.length; j++) {
              const ring = ad.rings[j];
              if (ring.pivot) ring.pivot.rotation.y += delta * (ring.rotSpeed || 0.8);
              if (ring.mat && ring.mat.uniforms && ring.mat.uniforms.uTime) {
                ring.mat.uniforms.uTime.value += delta;
              }
            }
          }
          if (ad.groundGlow && ad.groundGlow.material) {
            ad.groundGlow.material.opacity = 0.28 + Math.sin(r._auraPulse * 1.6) * 0.06;
            ad.groundGlow.rotation.z += delta * 0.12;
          }
          if (ad.stars) {
            for (let j = 0; j < ad.stars.length; j++) {
              const sp = ad.stars[j];
              const u = sp.userData;
              u.twinklePhase += delta * u.twinkleSpeed;
              sp.position.y += delta * u.speed;
              if (sp.position.y > u.maxY) {
                sp.position.y = u.minY;
                u.angle = Math.random() * Math.PI * 2;
              }
              u.angle += delta * 0.28;
              sp.position.x = Math.cos(u.angle) * u.radius;
              sp.position.z = Math.sin(u.angle) * u.radius;
              if (sp.material) {
                sp.material.rotation += delta * u.rotSpeed;
                const tw = Math.max(0, Math.sin(u.twinklePhase));
                sp.material.opacity = tw * 0.78;
                const sc = u.baseScale * (0.7 + tw * 0.4);
                sp.scale.set(sc, sc, 1);
              }
            }
          }
          if (ad.handStars) {
            for (let j = 0; j < ad.handStars.length; j++) {
              const hs = ad.handStars[j];
              const hu = hs.userData;
              hu.twinklePhase += delta * hu.twinkleSpeed;
              const tw = Math.max(0, Math.sin(hu.twinklePhase));
              if (hs.material) {
                hs.material.rotation += delta * hu.rotSpeed;
                hs.material.opacity = 0.45 + tw * 0.55;
              }
              const sc = hu.baseScale * (0.8 + tw * 0.35);
              hs.scale.set(sc, sc, 1);
            }
          }
        } else {
          r._auraRoot.rotation.y += delta * 0.4;
        }
      }
    }

    this.moveAcc += delta;
    if (this.moveAcc > 0.1 && g.player && g.player.isMoving) {
      this.moveAcc = 0;
      this.intentMove(g.player.mesh.position.x, g.player.mesh.position.z);
    }
    this._reconcile(delta);
  }

  // ============================================================
  //  RECONCILIATION ПОЗИЦИИ
  //  serverSelf писался в 6 местах и НЕ читался нигде: клиентская позиция
  //  расходилась с серверной навсегда (клиентская коллизия прошла, серверная
  //  нет; телепорт через NPC). Здесь — единственный потребитель.
  //  Мягкая коррекция подтягивает игрока к серверу, жёсткая (телепорт) ставит
  //  сразу.
  // ============================================================
  /** Порог, ниже которого расхождение считается нормой (сеть + 10 Hz тик). */
  static get RECON_SOFT() { return 2.5; }
  /** Выше этого — телепорт: интерполировать бессмысленно. */
  static get RECON_HARD() { return 25; }
  /**
   * Срок годности снимка серверной позиции. Сервер сообщает её только
   * событиями (welcome, телепорт, воскрешение, коррекция при клампе), поэтому
   * старый снимок — это, как правило, точка входа в мир. Раньше по нему игрока
   * дёргало назад к спавну, стоило отойти и остановиться.
   */
  static get RECON_FRESH_MS() { return 2000; }

  /** Снимок серверной позиции со временем: свежесть решает, верить ли ему. */
  _setServerSelf(x, z) {
    if (!Number.isFinite(+x) || !Number.isFinite(+z)) return;
    this.serverSelf = { x: +x, z: +z, at: Date.now() };
  }

  /** Поставить позицию игрока по серверной, с высотой из террейна. */
  _applyServerPosition(x, z, opts) {
    const g = window.game;
    if (!g || !g.player || !g.player.mesh) return;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    opts = opts || {};
    const p = g.player;
    const dx = x - p.mesh.position.x;
    const dz = z - p.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (!opts.hard && d < 0.05) return;
    if (!opts.hard && d < NetWS.RECON_HARD) {
      // Мягкая коррекция копится в _reconcile по кадрам — но только когда игрок
      // стоит. На бегу сервер отстаёт на пакет (0.12 с ≈ 1 м), и лерп к его
      // позиции читался бы как рывок назад на каждом шаге.
      if (!p.isMoving) this._reconTarget = { x, z };
      return;
    }
    this._reconTarget = null;
    let y = p.mesh.position.y;
    if (window.Terrain && typeof window.Terrain.standY === 'function') {
      const s = window.Terrain.standY(x, z);
      y = s.y;
      p._smoothY = s.y;
      p._smoothShadowY = s.shadowY;
    } else if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
      y = 0.97 + window.Terrain.heightAt(x, z);
      p._smoothY = y;
    }
    p.mesh.position.set(x, y, z);
    if (p.velocity && p.velocity.set) p.velocity.set(0, 0, 0);
    // Сбросить локальное «бегу туда»: иначе игрок сразу побежит назад.
    p.isMoving = false;
    p.followingTarget = null;
    if (p.continuousMove) p.continuousMove.active = false;
    // Раньше здесь было `p.moveTarget = null`. Player.moveTo и Player.update
    // ждут Vector3, поэтому первый же клик по земле после серверной коррекции
    // падал на `this.moveTarget.copy(p)` — и игрок не мог ходить до перезагрузки.
    // «Никуда не бегу» выражается isMoving, а не обнулением вектора.
    if (p.moveTarget && p.moveTarget.set) p.moveTarget.set(x, 0, z);
    if (typeof p.playLocoAnim === 'function') p.playLocoAnim();
    this.predict.x = x; this.predict.z = z;
    // Террейн стримится по позиции игрока — на телепорте подгрузить сразу.
    if (window.Terrain && typeof window.Terrain.updateStreaming === 'function') {
      try { window.Terrain.updateStreaming(x, z); } catch (e) { /* ignore */ }
    }
  }

  /** Покадровая мягкая коррекция к серверной позиции. */
  _reconcile(delta) {
    const g = window.game;
    if (!g || !g.player || !g.player.mesh) return;
    // В режиме редактора игрока таскает сам редактор (fly + drag) — не спорим.
    if (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive()) {
      this._reconTarget = null;
      return;
    }
    if (g.player.isDead) { this._reconTarget = null; return; }
    const p = g.player;
    // Пока игрок бежит, не дёргаем: сервер получит наш move и согласится.
    if (!this._reconTarget) {
      const s = this.serverSelf;
      if (!s || p.isMoving) return;
      // Только по свежему снимку: устаревший — это позиция входа в мир, и
      // коррекция по нему возвращала игрока на спавн через всю карту.
      if (Date.now() - (s.at || 0) > NetWS.RECON_FRESH_MS) return;
      const d = Math.hypot(s.x - p.mesh.position.x, s.z - p.mesh.position.z);
      if (d < NetWS.RECON_SOFT) return;
      if (d >= NetWS.RECON_HARD) { this._applyServerPosition(s.x, s.z, { hard: true }); return; }
      this._reconTarget = { x: s.x, z: s.z };
    }
    const t = this._reconTarget;
    const dx = t.x - p.mesh.position.x;
    const dz = t.z - p.mesh.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this._reconTarget = null; return; }
    // 20 % расхождения за кадр: незаметно для игрока, но сходится за ~0.5 с.
    const k = Math.min(1, delta * 6);
    p.mesh.position.x += dx * k;
    p.mesh.position.z += dz * k;
    this.predict.x = p.mesh.position.x;
    this.predict.z = p.mesh.position.z;
  }
}
// Параметры реконнекта: 5 попыток с backoff 1→16 с и джиттером.
NetWS.MAX_RECONNECT = 5;
NetWS.RECONNECT_MAX_MS = 16000;
NetWS.QUEUE_MAX = 32;
NetWS.prototype._applyWorldTime = function (wt) {
  if (!wt) return;
  var stamp = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  var WT = window.WorldTime || window.WORLD_TIME;
  var dayLen = wt.dayLengthSec || (WT && WT.DAY_LENGTH_SEC) || 14400;
  var realFrac = (typeof wt.realFrac === 'number')
    ? wt.realFrac
    : (WT && WT.todToRealFrac ? WT.todToRealFrac(wt.tod) : wt.tod);
  this.timeAnchor = {
    tod: wt.tod,
    realFrac: realFrac,
    dayLengthSec: dayLen,
    dayRealFrac: wt.dayRealFrac,
    paused: !!wt.paused,
    at: stamp
  };
  // подтянуть dayLength на DayNight
  if (window.game && window.game.dayNight) {
    window.game.dayNight.dayLengthSec = dayLen;
    if (typeof wt.dayRealFrac === 'number') window.game.dayNight.dayRealFrac = wt.dayRealFrac;
    if (typeof wt.paused === 'boolean' && typeof window.game.dayNight.setPaused === 'function') {
      window.game.dayNight.setPaused(wt.paused);
    }
  }
  if (wt.phase && window.game && window.game.dayNight && window.game.dayNight.setPhase)
    window.game.dayNight.setPhase(wt.phase);
};
/** Экстраполяция TOD между серверными якорями. null = нет якоря. */
NetWS.prototype.getServerTod = function () {
  var a = this.timeAnchor; if (!a) return null;
  if (a.paused) return a.tod;
  var now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  var elapsed = (now - a.at) / 1000;
  var WT = window.WorldTime || window.WORLD_TIME;
  if (WT && WT.advanceRealFrac && WT.realFracToTod) {
    var f = WT.advanceRealFrac(a.realFrac, elapsed, a.dayLengthSec);
    return WT.realFracToTod(f);
  }
  return ((a.tod + elapsed / a.dayLengthSec) % 1 + 1) % 1;
};
/** DEV / GM: выставить час на сервере (все клиенты). */
NetWS.prototype.intentSetTime = function (hour, silent) {
  this.send({ t: 'set_time', hour: hour, silent: !!silent });
};
NetWS.prototype.intentSetTimePause = function (paused) {
  this.send({ t: 'set_time_pause', paused: !!paused });
};
window.NetWS = NetWS;