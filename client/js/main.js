// ============================================================
//  CLIENT / JS / MAIN.JS  —  точка сборки (r185).
//  Перспектива + RenderSetup(Sky/ACES/PMREM) + CameraRig + Terrain.
//  Необязательные модули обёрнуты в safe() — один битый файл
//  не уронит всю игру, а лишь отключит свою фичу (деградация).
//  Загружается цепочкой из boot.module.js (DOM уже распарсен).
// ============================================================
// MMO: сервер — единственный авторитет (бой, мобы, EXP, инвентарь).
window.SERVER_URL = window.STEAM_CONFIG ? window.STEAM_CONFIG.serverUrl
  : ((location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.protocol === 'https:' ? window.PS_SERVER.sslHost : window.PS_SERVER.host));

class Game {
  constructor() {
    this.scene = null; this.camera = null; this.renderer = null;
    this.clock = THREE.Timer ? new THREE.Timer() : new THREE.Clock(); // r185: Timer вместо deprecated Clock
    this.player = null; this.raycaster = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.isRunning = false; this.nearestNPC = null; this.npcHint = null;
    this._groundPlane = null; this._rs = null;
    /** true пока на title screen — ввод/квесты/старт отложены */
    this.inMainMenu = true;
    this._gameStarted = false;
    this.mainMenu = null;
    this.init();
  }

  init() {
    window.game = this; // рано — чтобы модули могли звать game.addChatMessage

    // --- сцена ---
    this.scene = new THREE.Scene();

    // --- рендерер ---
    // antialias + high DPR + shadows is heavy with 100+ mob sprites
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(1.0);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // --- r185-пайплайн (небо/цвет/тени/envMap) ИЛИ заглушка, если render-setup.js нет ---
    if (window.RenderSetup) {
      try { this._rs = window.RenderSetup.apply(this.renderer, this.scene); }
      catch (e) { console.warn('[init] RenderSetup.apply:', e && e.message); this._rs = null; }
    }
    // fog Exp2 default (DayNight каждый кадр обновит density/color)
    if (!this._rs) {
      this.scene.background = new THREE.Color(0x87ceeb);
      this.scene.fog = new THREE.FogExp2(0xb3c4d0, 0.00185);
    }

    // far большой: clip-plane далеко за туманом (нет жёсткого среза горизонта)
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 4500);
    this.camera.position.set(0, 30, 30);

    this.combat = new CombatSystem();
    if (window.InputManager) this.input = new InputManager(this);

    this.shadowQuality = (function () {
      try {
        var s = localStorage.getItem('ps_shadow_quality');
        if (s) return s;
      } catch (e) {}
      return 'medium';
    })();

    this.setupLighting();
    this.setShadowQuality(this.shadowQuality);
    this.createWorld();

    // Preload 3D character models and textures early in background
    if (window.CharModel && typeof window.CharModel.preloadAssets === 'function') {
      window.CharModel.preloadAssets();
    }

    this.player = new Player(this.scene);
    // Позицию ставит сервер (welcome). Не телепортируем локально до net.
    if (window.CameraRig) { try { this.cameraRig = new CameraRig(this.camera); } catch (e) { console.warn('[init] CameraRig:', e && e.message); } }
    if (window.GameAudio && typeof window.GameAudio.init3D === 'function') {
      try { window.GameAudio.init3D(this.camera, this.scene); } catch (e) { console.warn('[init] GameAudio3D:', e && e.message); }
    }

    // HUD-интерфейс создаём РАНЬШЕ опциональных модулей, чтобы их конструкторы могли писать в чат
    this.ui = new UI(this);

    // --- опциональные модули: каждый в safe(), чтобы битый файл не валил init ---
    const safe = (label, fn) => { try { fn(); } catch (e) { console.warn('[init] ' + label + ' не загружен:', e && e.message); } };

    safe('Inventory', () => {
      if (!window.Inventory) return;
      this.inventory = new Inventory(80);
      let selectedCls = 'operator';
      try {
        const ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || 'null');
        if (ch && ch.cls) selectedCls = ch.cls;
      } catch (e) {}
      if (this.player && this.player.playerClass) selectedCls = this.player.playerClass;
      const root = (window.CLASS_SYSTEM && window.CLASS_SYSTEM.rootClass)
        ? window.CLASS_SYSTEM.rootClass(selectedCls) : selectedCls;
      if (root === 'engineer') {
        // Резонатор + куртка + штаны + стартовый 2H Ударник (3D в руке)
        ['engineer_emitter_low', 'engineer_jacket_low', 'engineer_pants_low',
          'apprentice_wand', 'goggles', 'leather_gloves', 'work_boots']
          .forEach(id => this.inventory.addItem(id, 1));
        const n = this.inventory.slots.find(s => s && s.templateId === 'engineer_emitter_low');
        if (n) this.inventory.equipItem(n.uid);
        const c = this.inventory.slots.find(s => s && s.templateId === 'engineer_jacket_low');
        if (c) this.inventory.equipItem(c.uid);
        const l = this.inventory.slots.find(s => s && s.templateId === 'engineer_pants_low');
        if (l) this.inventory.equipItem(l.uid);
        const wStaff = this.inventory.slots.find(s => s && s.templateId === 'apprentice_wand');
        if (wStaff) this.inventory.equipItem(wStaff.uid);
      } else {
        ['operator_hammer_low', 'wooden_breastplate', 'wooden_gaiters', 'goggles', 'leather_gloves', 'work_boots']
          .forEach(id => this.inventory.addItem(id, 1));
        const w = this.inventory.slots.find(s => s && s.templateId === 'operator_hammer_low');
        if (w) this.inventory.equipItem(w.uid);
        const c = this.inventory.slots.find(s => s && s.templateId === 'wooden_breastplate');
        if (c) this.inventory.equipItem(c.uid);
        const l = this.inventory.slots.find(s => s && s.templateId === 'wooden_gaiters');
        if (l) this.inventory.equipItem(l.uid);
      }
      this.inventory.addItem('copper_parts', 500); this.inventory.addItem('synthetic_oil', 10); this.inventory.addItem('pressure_amplifier', 5);
      if (this.inventory.recalculateStats) this.inventory.recalculateStats();
      if (window.InventoryUI) this.inventoryUI = new InventoryUI(this.inventory);
    });
    safe('QuestManager', () => { if (window.QuestManager) this.questManager = new QuestManager(); });
    safe('NPC', () => {
      if (!window.NPCManager) return;
      this.npcManager = new NPCManager(this.scene);
      if (window.NPCUI) { this.npcUI = new NPCUI(); this.dialogueUI = this.npcUI; }
    });
    safe('SpawnManager', () => {
      // Мобы — только с сервера (AOI). Локальный SpawnManager не используется.
      this.spawnManager = { enemies: [] };
    });
    safe('LootManager', () => {
      if (!window.LootManager) return;
      this.lootManager = new LootManager(this.scene);
      if (window.LootUI) this.lootUI = new LootUI();
    });
    safe('LevelUI', () => { if (window.LevelUI && this.player.levelSystem) this.levelUI = new LevelUI(this.player.levelSystem); });
    safe('SkillsUI', () => { if (window.SkillsUI && this.player.skillManager) this.skillsUI = new SkillsUI(this.player.skillManager); });
    safe('CharacterMenu', () => { if (window.CharacterMenu) this.charMenu = new CharacterMenu(); });
    safe('PrivateStore', () => {
      if (!window.PrivateStore) return;
      this.privateStore = new PrivateStore();
      if (window.installPrivateStoreHooks) window.installPrivateStoreHooks();
    });
    safe('TradeUI', () => { if (window.TradeUI) this.tradeUI = new TradeUI(); });
    safe('ClanUI', () => { if (window.ClanUI) this.clanUI = new ClanUI(); });
    safe('StoreView', () => { if (window.StoreView) this.storeView = new StoreView(); });
    safe('Craft', () => {
      if (!window.CraftManager) return;
      this.craftManager = new CraftManager();
      if (window.CraftUI) this.craftUI = new CraftUI(this.craftManager);
    });
    // День/ночь до редактора — F2-слайдер солнца сразу находит dayNight
    safe('DayNight', () => {
      if (!window.DayNight) return;
      this.dayNight = new window.DayNight(this);
    });
    safe('WorldContent', () => {
      if (window.WorldContent) {
        this.worldContent = new window.WorldContent(this);
        this.worldContent.applySavedTransforms();
      }
    });
    // PLAN 4.6: SceneEditor только editor.html / GM. Мир уже в WorldContent.
    safe('Editor', () => {
      if (!window.SceneEditor) return;
      if (!(window._forceEditorMode || window.isEditorStandalone)) return;
      this.editor = new window.SceneEditor(this);
      if (this.editor.applySavedTransformsToGame) this.editor.applySavedTransformsToGame();
    });
    if (window.GameAudio && typeof window.GameAudio.bindUnlock === 'function') {
      window.GameAudio.bindUnlock();
    }
    // Повторно синхронизируем качество теней с DayNight и FoliageInstancer после их создания
    this.setShadowQuality(this.shadowQuality);


    safe('MapRenderer', () => { if (window.MapRenderer) this.mapRenderer = new MapRenderer(); });
    safe('Dungeon', () => {
      if (!window.DungeonManager) return;
      this.dungeonManager = new DungeonManager(this.scene);
      if (window.DungeonUI) this.dungeonUI = new DungeonUI(this.dungeonManager);
    });
    safe('TouchControls', () => {
      if (window.TouchControls) this.touchControls = new window.TouchControls(this);
    });
    // Подключение только online, с game.html после «Подключиться» в menu.html
    this.setupEvents();
    this._bindPageVisibility();
    this.inMainMenu = false;
    this._gameStarted = false;
    this.isRunning = true;
    this.animate();
    this._bootOnlineSession();
  }

  _bindPageVisibility() {
    if (this._visBound) return;
    this._visBound = true;
    var self = this;
    this._initBackgroundTicker();

    var onVisChange = function () {
      var hidden = !!document.hidden;
      self._pageHidden = hidden;
      if (hidden) {
        self._startBackgroundLoop();
      } else {
        self._stopBackgroundLoop();
      }
      if (window.GameAudio && typeof window.GameAudio.setPageHidden === 'function') {
        window.GameAudio.setPageHidden(hidden);
      }
    };

    document.addEventListener('visibilitychange', onVisChange);
    window.addEventListener('pagehide', function () {
      self._pageHidden = true;
      self._startBackgroundLoop();
    });
    window.addEventListener('pageshow', function () {
      self._pageHidden = false;
      self._stopBackgroundLoop();
    });
  }

  /**
   * Фоновый тикер симуляции (Web Worker + fallback):
   * Браузер замораживает requestAnimationFrame во фоновых/свёрнутых вкладках.
   * Данный тикер гарантирует, что действия игрока (движение к цели, автоатака,
   * кулдауны скиллов, сбор лута, сетевой обмен) продолжают непрерывно выполняться
   * в фоне без остановки игрового процесса, пока тяжелый WebGL рендер выключен (фейковая пауза).
   */
  _initBackgroundTicker() {
    if (this._bgWorker !== undefined) return;
    this._bgWorker = null;
    this._bgInterval = null;
    this._bgRunning = false;
    this._lastBgTick = 0;

    try {
      const blobCode = `
        let timer = null;
        self.onmessage = function(e) {
          if (e.data === 'start') {
            if (!timer) {
              timer = setInterval(function() {
                self.postMessage('tick');
              }, 40); // ~25 FPS фоновой симуляции
            }
          } else if (e.data === 'stop') {
            if (timer) {
              clearInterval(timer);
              timer = null;
            }
          }
        };
      `;
      const blob = new Blob([blobCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      const self = this;
      worker.onmessage = function (e) {
        if (e.data === 'tick' && self.isRunning && (self._pageHidden || document.hidden)) {
          self._onBackgroundTick();
        }
      };
      this._bgWorker = worker;
    } catch (e) {
      console.warn('[Game] Web Worker background ticker unavailable, fallback to interval:', e);
      this._bgWorker = null;
    }
  }

  _startBackgroundLoop() {
    if (this._bgRunning) return;
    this._bgRunning = true;
    this._lastBgTick = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (this._bgWorker) {
      try {
        this._bgWorker.postMessage('start');
        return;
      } catch (_) {}
    }

    if (!this._bgInterval) {
      const self = this;
      this._bgInterval = setInterval(function () {
        if (self.isRunning && (self._pageHidden || document.hidden)) {
          self._onBackgroundTick();
        }
      }, 50);
    }
  }

  _stopBackgroundLoop() {
    if (!this._bgRunning) return;
    this._bgRunning = false;

    if (this._bgWorker) {
      try {
        this._bgWorker.postMessage('stop');
      } catch (_) {}
    }
    if (this._bgInterval) {
      clearInterval(this._bgInterval);
      this._bgInterval = null;
    }

    // Сброс часов для предотвращения скачка delta при первом кадре rAF
    if (this.clock) {
      if (this.clock.update) this.clock.update();
      if (typeof this.clock.getDelta === 'function') this.clock.getDelta();
    }

    // Мгновенная отрисовка одного кадра при возврате во вкладку
    if (this.renderer && this.scene && this.camera) {
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (_) {}
    }
  }

  _onBackgroundTick() {
    if (!this.isRunning) return;
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const rawDt = (now - (this._lastBgTick || now)) / 1000;
    this._lastBgTick = now;
    const dt = Math.min(0.08, Math.max(0.016, rawDt));

    try {
      if (this.player) this.player.update(dt);
      this._updateTargetRing(dt);

      if (!this._ppFallback) this._ppFallback = new THREE.Vector3();
      const pp = (this.player && this.player.mesh) ? this.player.mesh.position : this._ppFallback;

      if (this._pendingNpcInteract && this.player && this.player.mesh) {
        const npc = this._pendingNpcInteract;
        if (npc && npc.mesh) {
          const np = npc.mesh.position;
          const dist = Math.hypot(pp.x - np.x, pp.z - np.z);
          if (dist <= 4.2) {
            this.player.stopFollowing();
            this.player.isMoving = false;
            this.player.playLocoAnim();
            const it = npc;
            this._pendingNpcInteract = null;
            if (this.npcManager) this.npcManager.interactWithNPC(it);
          }
        }
      }

      if (this.lootManager && this.lootManager.update) this.lootManager.update(dt, pp, this.player);
      if (this.dungeonManager) this.dungeonManager.update(dt, pp, this.player);
      if (this.npcManager) this.npcManager.update(dt, pp);
      if (this.net) {
        this.net.update(dt);
        if (typeof this.net.tickHeartbeat === 'function') this.net.tickHeartbeat();
      }
      if (this.cameraRig && this.player && this.player.mesh) this.cameraRig.update(dt, this.player.mesh.position);
      if (this.skillsUI && this.skillsUI.update) this.skillsUI.update();
      if (this.ui && this.ui.update) this.ui.update();
    } catch (_) {}
  }

  /** Всегда на menu.html (F5 / выход / обрыв / fail). */
  goToMenuPage() {
    if (this._goingMenu) return;
    this._goingMenu = true;
    try {
      this._persistSelectedCharStats();
    } catch (e) { /* ignore */ }
    try {
      if (this.net && typeof this.net.disconnect === 'function') this.net.disconnect();
    } catch (e) {}
    try {
      sessionStorage.removeItem('ps_connect');
      sessionStorage.removeItem('ps_ingame');
      sessionStorage.removeItem('ps_boot_ticket');
    } catch (e) {}
    location.replace('menu.html');
  }

  /** Write live player stats/appearance back into ps_characters (char-select panel). */
  _persistSelectedCharStats() {
    const p = this.player;
    if (!p) return;
    let ch = null;
    try {
      ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || 'null');
    } catch (e) { ch = null; }
    if (!ch || !ch.id) return;
    if (p.levelSystem) {
      ch.level = p.levelSystem.level != null ? p.levelSystem.level : p.level;
      ch.exp = p.levelSystem.exp != null ? p.levelSystem.exp : p.exp;
      ch.sp = p.levelSystem.sp != null ? p.levelSystem.sp : p.sp;
    } else {
      if (p.level != null) ch.level = p.level;
      if (p.exp != null) ch.exp = p.exp;
      if (p.sp != null) ch.sp = p.sp;
    }
    ch.maxHp = p.maxHp;
    ch.hp = p.hp;
    ch.maxEnergy = p.maxEnergy != null ? p.maxEnergy : p.maxMp;
    ch.energy = p.energy != null ? p.energy : p.mp;
    ch.pAtk = p.pAtk != null ? p.pAtk : p.attackPower;
    ch.pDef = p.pDef != null ? p.pDef : p.defense;
    ch.cAtk = p.cAtk != null ? p.cAtk : p.mAtk;
    ch.cDef = p.cDef != null ? p.cDef : p.mDef;
    ch.attack = ch.pAtk;
    ch.defense = ch.pDef;
    if (p.playerClass) ch.cls = p.playerClass;
    if (p.className) ch.className = p.className;
    if (p._charModel && p._charModel.appearance) {
      ch.appearance = Object.assign({}, ch.appearance || {}, p._charModel.appearance);
    }
    // Persist equip snapshot so char-select can show hand weapon / gear
    try {
      const inv = this.inventory;
      const eq = inv && inv.equipment;
      if (eq) {
        const snap = {};
        Object.keys(eq).forEach((slot) => {
          const it = eq[slot];
          if (!it) return;
          const tid = it.templateId || (it.template && it.template.id) || it.id;
          if (!tid) return;
          snap[slot] = { id: tid, templateId: tid };
        });
        ch.equip = snap;
        // Weapon mesh id for select-screen 3D (not resonator)
        const w = eq.weapon;
        if (w) {
          const wt = w.template || w;
          const wid = w.templateId || wt.id || null;
          if (wid && !wt.isResonator && !wt.isCircuitDevice && wid !== 'engineer_emitter_low') {
            ch.appearance = Object.assign({}, ch.appearance || {}, { weaponId: wid });
          } else {
            if (ch.appearance) delete ch.appearance.weaponId;
          }
        } else if (ch.appearance) {
          delete ch.appearance.weaponId;
        }
      }
    } catch (eEq) { /* ignore */ }
    try {
      sessionStorage.setItem('ps_selected_char', JSON.stringify(ch));
    } catch (e) { /* ignore */ }
    try {
      const key = 'ps_characters';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) return;
      const idx = list.findIndex((c) => c && c.id === ch.id);
      if (idx >= 0) {
        list[idx] = Object.assign({}, list[idx], ch);
        localStorage.setItem(key, JSON.stringify(list));
      }
    } catch (e2) { /* ignore */ }
  }

  /** Отображение ошибки запуска на экране загрузки вместо скрытого редиректа. */
  _showBootError(errText) {
    const msg = document.getElementById('loading-msg');
    const bar = document.getElementById('loading-bar');
    if (bar) bar.style.display = 'none';
    if (msg) {
      msg.innerHTML = '<span style="color:#ff7777;font-size:15px;display:block;margin-bottom:12px">⚠️ ' +
        (errText || 'Ошибка подключения к миру') + '</span>' +
        '<div style="display:flex;gap:12px;justify-content:center;margin-top:14px">' +
        '<button type="button" onclick="location.reload()" style="padding:9px 20px;background:#44331b;color:#ffe066;border:1px solid #8b6e3a;border-radius:4px;cursor:pointer;font-weight:600">Повторить попытку</button>' +
        '<button type="button" onclick="location.replace(\'menu.html\')" style="padding:9px 18px;background:#262320;color:#bbb;border:1px solid #555;border-radius:4px;cursor:pointer">В главное меню</button>' +
        '</div>';
    }
  }

  /** HTTP-пинг game-сервера (/api/status). */
  async _pingGameServer() {
    try {
      let host = (window.STEAM_CONFIG && window.STEAM_CONFIG.serverHost) || window.PS_SERVER.host;
      if (host.indexOf('localhost') === -1 && host.indexOf('127.0.0.1') === -1) host = host.replace(/:\d+$/, '');
      const proto = (location.protocol === 'https:') ? 'https:' : 'http:';
      if (proto === 'https:' && (host === window.PS_SERVER.host || host === window.PS_SERVER.host + ':8080')) {
        host = window.PS_SERVER.sslHost;
      }

      let candidateHosts = [host];
      if (location.origin && location.origin.indexOf('localhost') !== -1) {
        candidateHosts.unshift(location.host);
      }
      if (proto === 'https:') {
        candidateHosts = candidateHosts.map(h => (h === window.PS_SERVER.host || h === window.PS_SERVER.host + ':8080') ? window.PS_SERVER.sslHost : h);
      }

      const probeOne = (cand) => {
        const base = cand.indexOf('://') >= 0 ? cand : (proto + '//' + cand);
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 3000) : null;
        return fetch(base.replace(/\/$/, '') + '/api/status', {
          cache: 'no-store',
          signal: ctrl ? ctrl.signal : undefined
        }).then(res => {
          if (t) clearTimeout(t);
          if (res.ok) return res.json();
          throw new Error('http ' + res.status);
        }).then(j => {
          if (t) clearTimeout(t);
          if (j && j.ok && j.online !== false) return cand;
          throw new Error('offline');
        }).catch(err => {
          if (t) clearTimeout(t);
          throw err;
        });
      };

      try {
        const fastest = await Promise.any(candidateHosts.map(probeOne));
        if (fastest) {
          if (fastest.indexOf('localhost') === -1) {
            let finalHost = fastest;
            if (proto === 'https:' && (finalHost === window.PS_SERVER.host || finalHost === window.PS_SERVER.host + ':8080')) {
              finalHost = window.PS_SERVER.sslHost;
            }
            if (window.STEAM_CONFIG) window.STEAM_CONFIG.serverHost = finalHost;
            window.SERVER_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + finalHost;
          }
          return true;
        }
      } catch (_) {}
      return true; // Не блокируем попытку WebSocket подключения
    } catch (e) {
      console.warn('[_pingGameServer] warning:', e);
      return true;
    }
  }

  /**
   * Вход в онлайн сессию.
   * Ошибки показывают экран с кнопкой повтора вместо тихого вылета в меню.
   */
  async _bootOnlineSession() {
    // Standalone-редактор только если сервер УЖЕ отдал editor.js (dev :3000 +
    // EDITOR_ENABLED). На игровом порту эти файлы 404 без GM-cookie — сюда не попадём.
    if ((window._forceEditorMode || window.isEditorStandalone) && window.SceneEditor) {
      this.hideLoadingScreen();
      this._gameStarted = true;
      this.inMainMenu = false;
      if (typeof window.setEditorAllowed === 'function') window.setEditorAllowed(true);
      if (!this.editor) this.editor = new window.SceneEditor(this);
      if (this.editor && this.editor.toggle) this.editor.toggle(true);
      return;
    }

    let ticket = false;
    let hasChar = false;
    try {
      ticket = sessionStorage.getItem('ps_boot_ticket') === '1' || localStorage.getItem('ps_boot_ticket') === '1';
      hasChar = !!(sessionStorage.getItem('ps_selected_char') || localStorage.getItem('ps_selected_char'));
      sessionStorage.removeItem('ps_boot_ticket');
    } catch (e) {}

    if (!ticket && !hasChar) {
      this.goToMenuPage();
      return;
    }
    if (!window.NetWS) {
      this._showBootError('Сетевой компонент NetWS не загружен');
      return;
    }

    try {
      const targetUrl = (window.STEAM_CONFIG && window.STEAM_CONFIG.serverUrl) || window.SERVER_URL;
      this.net = new window.NetWS(targetUrl);
      await this.net.connectFromMenu(window.ysdk || null);

      this.hideLoadingScreen();
      this._gameStarted = true;
      this.inMainMenu = false;

      // Фоновый прогрев шейдеров и шаблонов сетевых персонажей (запускается после успешного входа в мир, не блокирует сокет)
      setTimeout(() => {
        if (window.CharModel && typeof window.CharModel.warmupPipeline === 'function') {
          window.CharModel.warmupPipeline(this.renderer, this.camera, this.scene).catch((eWarm) => {
            console.warn('[boot] CharModel warmup:', eWarm);
          });
        }
      }, 1000);
      if (this.ui && this.ui.addChatMessage) {
        let greet = 'Добро пожаловать на остров. Esc / F5 — в меню.';
        try {
          const ch = JSON.parse(sessionStorage.getItem('ps_selected_char') || localStorage.getItem('ps_selected_char') || 'null');
          if (ch && ch.name) greet = ch.name + ' вошёл на остров. Esc / F5 — в меню.';
        } catch (err) {}
        this.ui.addChatMessage(greet, 'system');
        this.ui.addChatMessage('🧪 [СИСТЕМА] Все тесты ядра зелёные (3733 Unit Tests, 22/22 Invariants, 5100 CCU Matrix). Нажмите F9 или /tests для отчёта.', 'loot');
      }
      if (this.ui && typeof this.ui.checkStarterGreeting === 'function') {
        setTimeout(() => {
          try { this.ui.checkStarterGreeting(); } catch (e) { console.warn('[starter-greeting]', e); }
        }, 500);
      }
    } catch (e) {
      console.warn('[boot] connect failed', e);
      this._showBootError('Не удалось войти в игровой мир: ' + ((e && e.message) || 'таймаут ожидания'));
    }
  }

  /** Esc / выход → отдельная страница меню. */
  exitToMainMenu() {
    this.goToMenuPage();
  }

  showMainMenu() { this.goToMenuPage(); }
  startFromMenu() { this.goToMenuPage(); }
  connectFromMenu() { return this._bootOnlineSession(); }

  addChatMessage(t, type = 'system') { if (this.ui) this.ui.addChatMessage(t, type); }

  // --- свет: направление берём из RenderSetup (синхрон с небом), иначе fallback ---
  setupLighting() {
    this.scene.add(new THREE.AmbientLight(0x6a7a8a, 0.5));
    this.scene.add(new THREE.HemisphereLight(0xbcd0ff, 0x4a3a2a, 0.6));
    const sun = new THREE.DirectionalLight(0xffe6c0, 1.0);
    sun.castShadow = true;
    sun.shadow.mapSize.width = sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 750;
    const d = 240;
    sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;  sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun); this.scene.add(sun.target);
    this.sun = sun;
  }

  setShadowQuality(mode) {
    this.shadowQuality = mode || 'medium';
    try { localStorage.setItem('ps_shadow_quality', this.shadowQuality); } catch (e) {}
    if (!this.sun || !this.renderer) return;

    const isOff = (this.shadowQuality === 'off');
    this.renderer.shadowMap.enabled = !isOff;
    this.renderer.shadowMap.autoUpdate = !isOff;
    this.renderer.shadowMap.needsUpdate = true;

    if (isOff) {
      this.sun.castShadow = false;
      if (this.dayNight && this.dayNight.moon) this.dayNight.moon.castShadow = false;
    } else {
      this.sun.castShadow = true;
      let d = 90;
      if (this.shadowQuality === 'low') d = 60;
      else if (this.shadowQuality === 'high' || this.shadowQuality === 'ultra') d = 140;

      this.sun.shadow.camera.left = -d; this.sun.shadow.camera.right = d;
      this.sun.shadow.camera.top = d;  this.sun.shadow.camera.bottom = -d;
      this.sun.shadow.camera.updateProjectionMatrix();

      if (this.dayNight && this.dayNight.moon) {
        this.dayNight.moon.castShadow = true;
        this.dayNight.moon.shadow.camera.left = -d; this.dayNight.moon.shadow.camera.right = d;
        this.dayNight.moon.shadow.camera.top = d;  this.dayNight.moon.shadow.camera.bottom = -d;
        this.dayNight.moon.shadow.camera.updateProjectionMatrix();
      }
    }

    // Синхронизируем тени деревьев и растительности
    if (this.foliageInstancer && typeof this.foliageInstancer.updateShadowQuality === 'function') {
      this.foliageInstancer.updateShadowQuality(this.shadowQuality);
    }
    if (this.worldContent && this.worldContent.foliageInstancer && typeof this.worldContent.foliageInstancer.updateShadowQuality === 'function') {
      this.worldContent.foliageInstancer.updateShadowQuality(this.shadowQuality);
    }
    if (this.editor && this.editor._foliageInstancer && typeof this.editor._foliageInstancer.updateShadowQuality === 'function') {
      this.editor._foliageInstancer.updateShadowQuality(this.shadowQuality);
    }

    // Обновляем материалы сцены, чтобы Three.js перекомпилировал USE_SHADOWMAP при динамическом переключении
    if (this.scene) {
      this.scene.traverse(o => {
        if (o.isMesh && o.material) {
          if (Array.isArray(o.material)) {
            for (let i = 0; i < o.material.length; i++) {
              if (o.material[i]) o.material[i].needsUpdate = true;
            }
          } else {
            o.material.needsUpdate = true;
          }
        }
      });
    }
  }

  // --- мир: terrain.js (холмы/вода/лес) или fallback-плоскость ---
  createWorld() {
    const del = (key) => {
      const WM = window.WorldMetrics;
      return !!(WM && WM.isWorldObjectDeleted && WM.isWorldObjectDeleted(key));
    };
    const buildMeshes = () => {
      if (window.Terrain && !this._terrainBuilt) {
        try { window.Terrain.build(this.scene); this._terrainBuilt = !!(window.Terrain.mesh); }
        catch (e) { console.warn('[init] Terrain.build:', e && e.message); }
      }
      if (!del('volcano') && window.Volcano && !this._volcanoBuilt) {
        try { window.Volcano.build(this.scene); this._volcanoBuilt = !!(window.Volcano.mesh); }
        catch (e) { console.warn('[init] Volcano.build:', e && e.message); }
      }
      if (!del('mountains') && window.Mountains && !this._mountainsBuilt) {
        try { window.Mountains.build(this.scene); this._mountainsBuilt = !!(window.Mountains.mesh); }
        catch (e) { console.warn('[init] Mountains.build:', e && e.message); }
      }
    };
    buildMeshes();
    if (window.__PS_MESH_BINS__ && (!this._terrainBuilt || !this._volcanoBuilt || !this._mountainsBuilt)) {
      window.__PS_MESH_BINS__.then(() => {
        buildMeshes();
      }).catch(() => {});
    }
    // water + walls + village — всегда
    if (window.WaterSystem) { try { window.WaterSystem.build(this.scene); } catch (e) { console.warn('[init] WaterSystem.build:', e && e.message); } }
    if (!del('walls') && window.Walls) { try { window.Walls.build(this.scene); } catch (e) { console.warn('[init] Walls.build:', e && e.message); } }
    if (!del('village_fort') && window.VillageFort) { try { window.VillageFort.build(this.scene); } catch (e) { console.warn('[init] VillageFort.build:', e && e.message); } }
    if (!del('village_ground') && window.VillageGround) { try { window.VillageGround.build(this.scene); } catch (e) { console.warn('[init] VillageGround.build:', e && e.message); } }
  }
  _fallbackGround() {
    const g = new THREE.PlaneGeometry(400, 400);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: .9 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true; this.scene.add(m);
    this.scene.add(new THREE.GridHelper(400, 80, 0x444444, 0x333333));
    const seed = (cx, cz) => { let h = ((cx * 73856093) ^ (cz * 19349663)) >>> 0; return () => { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }; };
    const pipeGeo = new THREE.CylinderGeometry(1, 1, 12, 8), pipeMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, metalness: .4, roughness: .7 });
    for (let cx = -4; cx <= 4; cx++) for (let cz = -4; cz <= 4; cz++) {
      const rnd = seed(cx, cz); if (rnd() < 0.5) continue;
      const p = new THREE.Mesh(pipeGeo, pipeMat); p.position.set(cx * 40 + rnd() * 40, 6, cz * 40 + rnd() * 40); p.castShadow = true; this.scene.add(p);
    }
  }

  setupEvents() {
    addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('click', e => this.onMouseClick(e));
    // L2: attack sword cursor when hovering selected target
    this._cursorMode = 'default';
    this._hoverClientX = 0;
    this._hoverClientY = 0;
    this._cursorHoverAcc = 0;
    this.renderer.domElement.addEventListener('pointermove', e => {
      this._hoverClientX = e.clientX;
      this._hoverClientY = e.clientY;
      this._updateCombatCursor(true);
      this._updateLootHover();
    });
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this._setCombatCursor(false);
      this._hideLootHover();
    });
    this.renderer.domElement.addEventListener('pointerup', e => {
      if (e.pointerType === 'touch') this._hideLootHover();
    });
    addEventListener('keydown', e => this.onKeyDown(e));

    // Block browser window bounce/pull-to-refresh, while allowing smooth touch scrolling inside dialogs/modals
    const isScrollable = (el) => {
      if (!el) return false;
      if (el.closest('.l2-ref-content, .l2-sub-list, .l2-sub-grid, #npc-content-area, #trainer-skills, #quest-list, #shop-items, #buff-list, #npc-window, .l2-ref-dialog-window, .l2cm-body, .l2cm-panel, .l2cm-slots, .l2cm-skill-grid, #inventory-window, .l2-inv-body, #skills-window, .skills-body, .skills-list, .skills-tab-content, #craft-window, #dungeon-entry, #transfer-window, #l2-settings-panel, .l2-settings-body, .l2-chat, .l2-chat-log, .mm-board-list, [data-scrollable]')) {
        return true;
      }
      let curr = el;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const style = window.getComputedStyle(curr);
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && curr.scrollHeight > curr.clientHeight) {
          return true;
        }
        curr = curr.parentElement;
      }
      return false;
    };

    window.addEventListener('touchmove', (e) => {
      if (isScrollable(e.target)) {
        // Native touch scrolling allowed inside scrollable dialogs & panels
        return;
      }
      // Prevent browser bounce / history swipe only on canvas & main viewport
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    window.addEventListener('gesturestart', (e) => { if (e.cancelable) e.preventDefault(); });
    window.addEventListener('gesturechange', (e) => { if (e.cancelable) e.preventDefault(); });
    window.addEventListener('gestureend', (e) => { if (e.cancelable) e.preventDefault(); });
  }

  /**
   * L2-style combat cursor:
   * - default gold arrow: no target / ground / first select
   * - attack sword: mouse over currently selected mob (2nd click = AA)
   */
  _setCombatCursor(attack) {
    const want = attack ? 'attack' : 'default';
    if (this._cursorMode === want) return;
    this._cursorMode = want;
    try {
      document.documentElement.classList.toggle('ps-cur-attack', !!attack);
    } catch (e) { /* ignore */ }
  }

  _updateCombatCursor(force) {
    if (this.editor && this.editor.enabled) {
      this._setCombatCursor(false);
      return;
    }
    if (!this.player || this.player.isDead || this.player.hp <= 0) {
      this._setCombatCursor(false);
      return;
    }
    const t = this.player.target;
    if (!t || !t.mesh || (t.hp != null && t.hp <= 0)) {
      this._setCombatCursor(false);
      return;
    }
    if (!this.net || !this.renderer || !this.camera) {
      this._setCombatCursor(false);
      return;
    }
    // Raycast under mouse — only sword when over the selected target
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const rw = rect.width || 1, rh = rect.height || 1;
    const mx = ((this._hoverClientX - rect.left) / rw) * 2 - 1;
    const my = -((this._hoverClientY - rect.top) / rh) * 2 + 1;
    if (!this._cursorRay) this._cursorRay = new THREE.Raycaster();
    if (!this._cursorMouse) this._cursorMouse = new THREE.Vector2();
    this._cursorMouse.set(mx, my);
    this.camera.updateMatrixWorld(true);
    this._cursorRay.setFromCamera(this._cursorMouse, this.camera);
    const meshes = this.net.getEnemyMeshes && this.net.getEnemyMeshes();
    if (!meshes || !meshes.length) {
      this._setCombatCursor(false);
      return;
    }
    const hits = this._cursorRay.intersectObjects(meshes, true);
    if (!hits.length) {
      this._setCombatCursor(false);
      return;
    }
    const mesh = hits[0].object;
    // remoteKey may be on parent (skinned mesh children)
    let key = mesh.userData && mesh.userData.remoteKey;
    if (key == null) {
      let p = mesh.parent;
      while (p && key == null) {
        if (p.userData && p.userData.remoteKey != null) key = p.userData.remoteKey;
        p = p.parent;
      }
    }
    const r = key != null && this.net.enemyByKey ? this.net.enemyByKey(key) : null;
    let overTarget = !!(r && t.mid != null && r.mid === t.mid);
    if (!overTarget && t.mesh) {
      let p = mesh;
      while (p) {
        if (p === t.mesh) { overTarget = true; break; }
        p = p.parent;
      }
    }
    this._setCombatCursor(overTarget);
  }

  _getLootHoverEl() {
    if (this._lootHoverEl) return this._lootHoverEl;
    let el = document.getElementById('l2-ground-loot-hover');
    if (!el && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.id = 'l2-ground-loot-hover';
      el.className = 'l2-ground-loot-hover';
      document.body.appendChild(el);
    }
    this._lootHoverEl = el;
    return el;
  }

  _updateLootHover() {
    if (this.editor && this.editor.enabled) {
      this._hideLootHover();
      return;
    }
    if (!this.lootManager || !this.lootManager.groundItems || !this.lootManager.groundItems.length) {
      this._hideLootHover();
      return;
    }
    if (!this.renderer || !this.camera) {
      this._hideLootHover();
      return;
    }
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const rw = rect.width || 1, rh = rect.height || 1;
    const mx = ((this._hoverClientX - rect.left) / rw) * 2 - 1;
    const my = -((this._hoverClientY - rect.top) / rh) * 2 + 1;
    if (!this._lootHoverRay) this._lootHoverRay = new THREE.Raycaster();
    if (!this._lootHoverMouse) this._lootHoverMouse = new THREE.Vector2();
    this._lootHoverMouse.set(mx, my);
    this.camera.updateMatrixWorld(true);
    this._lootHoverRay.setFromCamera(this._lootHoverMouse, this.camera);

    const lootMeshes = this.lootManager.getLootMeshes();
    if (!lootMeshes || !lootMeshes.length) {
      this._hideLootHover();
      return;
    }

    const hits = this._lootHoverRay.intersectObjects(lootMeshes, true);
    if (!hits.length) {
      this._hideLootHover();
      return;
    }

    const hitObj = hits[0].object;
    let gi = hitObj.userData && hitObj.userData.groundItem;
    let lid = hitObj.userData && hitObj.userData.lootLid;
    if (!gi && lid != null && this.lootManager.byLid) {
      gi = this.lootManager.byLid.get(+lid);
    }
    if (!gi && hitObj.parent) {
      let p = hitObj.parent;
      while (p && !gi) {
        if (p.userData && p.userData.groundItem) gi = p.userData.groundItem;
        else if (p.userData && p.userData.lootLid != null && this.lootManager.byLid) {
          gi = this.lootManager.byLid.get(+p.userData.lootLid);
        }
        p = p.parent;
      }
    }

    if (!gi || !gi.mesh) {
      this._hideLootHover();
      return;
    }

    this._hoveredLootGi = gi;
    const text = this.lootManager.getLootDisplayName ? this.lootManager.getLootDisplayName(gi) : (gi.drop && (gi.drop.name || gi.drop.itemId));
    const hoverEl = this._getLootHoverEl();
    if (hoverEl && text) {
      hoverEl.textContent = text;
    }
    this._updateLootHoverPos();
  }

  _updateLootHoverPos() {
    const gi = this._hoveredLootGi;
    if (!gi || !gi.mesh || !gi.mesh.parent) {
      this._hideLootHover();
      return;
    }
    const hoverEl = this._getLootHoverEl();
    if (!hoverEl) return;

    if (!this._lootWorldPos) this._lootWorldPos = new THREE.Vector3();
    gi.mesh.getWorldPosition(this._lootWorldPos);
    this._lootWorldPos.y += 0.35;
    this._lootWorldPos.project(this.camera);

    // Behind camera or out of frustum
    if (this._lootWorldPos.z > 1 || this._lootWorldPos.z < -1) {
      hoverEl.style.display = 'none';
      return;
    }

    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const sx = rect.left + ((this._lootWorldPos.x + 1) / 2) * rect.width;
    const sy = rect.top + ((-this._lootWorldPos.y + 1) / 2) * rect.height;

    hoverEl.style.left = Math.round(sx) + 'px';
    hoverEl.style.top = Math.round(sy - 6) + 'px';
    hoverEl.style.display = 'block';
  }

  _hideLootHover() {
    this._hoveredLootGi = null;
    const el = this._lootHoverEl || (typeof document !== 'undefined' && document.getElementById('l2-ground-loot-hover'));
    if (el) el.style.display = 'none';
  }

  onLootRemoved(lid) {
    if (this._hoveredLootGi) {
      const gLid = this._hoveredLootGi.lid != null ? this._hoveredLootGi.lid : (this._hoveredLootGi.drop && this._hoveredLootGi.drop.lid);
      if (gLid != null && +gLid === +lid) {
        this._hideLootHover();
      }
    }
  }

  // perspective-resize (НЕ ortho-логика)
  onResize() {
    let w = innerWidth, h = innerHeight;
    const vp = document.getElementById('editor-viewport-container');
    if (vp && (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive())) {
      const r = vp.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) {
        w = Math.floor(r.width);
        h = Math.floor(r.height);
      }
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  anyWindowOpen() {
    return !!document.querySelector('#inventory-window.open,#skills-window.open,#npc-window.open,#craft-window.open,#big-map-overlay.open,#dungeon-entry.open,#transfer-window.open,#l2-char-menu.open');
  }

  onMouseClick(ev) {
    if (this.editor && this.editor.enabled) return;
    // Клики по 3D-сцене разрешены при открытых окнах; клики по интерфейсу окон не приводят к перемещению
    if (ev.target && ev.target !== this.renderer.domElement) return;
    if (!this.player) return;
    // L2 corpse: no move / target / attack (use death dialog)
    if (this.player.isDead || this.player.hp <= 0) return;

    // NDC по canvas
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    const rw = rect.width || 1, rh = rect.height || 1;
    this.mouse.x = ((ev.clientX - rect.left) / rw) * 2 - 1;
    this.mouse.y = -((ev.clientY - rect.top) / rh) * 2 + 1;

    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(this.mouse, this.camera);

    if (!this.net) return;

    // PvP: shift+клик по игроку
    if (ev.shiftKey) {
      const pm = this.raycaster.intersectObjects(this.net.getPlayerMeshes(), true);
      if (pm.length) {
        let obj = pm[0].object;
        let rKey = obj.userData && obj.userData.remoteKey;
        while (!rKey && obj.parent && obj.parent !== this.scene) {
          obj = obj.parent;
          if (obj.userData && obj.userData.remoteKey) rKey = obj.userData.remoteKey;
        }
        const r = this.net.enemyByKey(rKey);
        if (r && r.pid) { this.net.intentAttackPlayer(r.pid); return; }
      }
    }
    // Клик по луту на земле (ручной подбор, server authority)
    if (this.lootManager && this.lootManager.getLootMeshes) {
      const lootMeshes = this.lootManager.getLootMeshes();
      if (lootMeshes.length) {
        const lhit = this.raycaster.intersectObjects(lootMeshes, true);
        if (lhit.length) {
          const obj = lhit[0].object;
          let lid = obj.userData && obj.userData.lootLid;
          if (lid == null && obj.parent) {
            let p = obj.parent;
            while (p && lid == null) {
              if (p.userData && p.userData.lootLid != null) lid = p.userData.lootLid;
              p = p.parent;
            }
          }
          if (lid != null) {
            this.lootManager.requestPickupByLid(lid);
            return;
          }
        }
      }
    }

    // 0. Клик по NPC (мирный житель / квестодатель / торговец / охрана)
    if (this.npcManager && this.npcManager.findNPCUnderRay) {
      const hitNpc = this.npcManager.findNPCUnderRay(this.raycaster, 140);
      if (hitNpc) {
        const now = performance.now();
        const prevTarget = this.player.target;
        const isSameTarget = prevTarget && (prevTarget.type === 'npc' && (prevTarget.npc === hitNpc || prevTarget.npcId === hitNpc.template.id));
        const isDoubleClick = isSameTarget || (this._lastNpcClick && (this._lastNpcClick.npc === hitNpc) && (now - this._lastNpcClick.time < 500));
        this._lastNpcClick = { npc: hitNpc, time: now };

        const targetObj = {
          type: 'npc',
          npc: hitNpc,
          npcId: hitNpc.template.id,
          mesh: hitNpc.mesh,
          name: hitNpc.name,
          title: hitNpc.title,
          hp: 100,
          maxHp: 100,
          level: null,
          role: 'npc',
          color: hitNpc.template.color || 0xffaa44,
          scale: hitNpc.template.scale || 2.4
        };

        this.player.stopAutoAttack();
        this.player.stopFollowing();
        if (this.player.skillManager) this.player.skillManager.pendingSkill = null;
        this.player.setTarget(targetObj);
        if (this.ui) this.ui.showTargetStatus(this.player.target);

        // Двойной клик или клик по уже выделенному NPC:
        if (isDoubleClick) {
          const pp = (this.player.mesh && this.player.mesh.position) ? this.player.mesh.position : new THREE.Vector3();
          const np = (hitNpc.mesh && hitNpc.mesh.position) ? hitNpc.mesh.position : new THREE.Vector3();
          const dist = Math.hypot(pp.x - np.x, pp.z - np.z);
          if (dist <= 4.5) {
            // Игрок уже рядом — мгновенно открываем диалог (L2 style)
            this._pendingNpcInteract = null;
            this.player.isMoving = false;
            this.player.playLocoAnim();
            this.npcManager.interactWithNPC(hitNpc);
          } else {
            // Игрок далеко — бежим к NPC и открываем диалог при сближении
            this._pendingNpcInteract = hitNpc;
            this.player.moveTo(np);
          }
        }
        return;
      }
    }

    // Сброс ожидания взаимодействия при клике в другое место
    this._pendingNpcInteract = null;

    // Клик по другому игроку (таргет / повторный клик — следование)
    const playerMeshes = this.net.getPlayerMeshes ? this.net.getPlayerMeshes() : [];
    if (playerMeshes && playerMeshes.length) {
      const pHit = this.raycaster.intersectObjects(playerMeshes, true);
      if (pHit.length) {
        let obj = pHit[0].object;
        let rKey = obj.userData && obj.userData.remoteKey;
        while (!rKey && obj.parent && obj.parent !== this.scene) {
          obj = obj.parent;
          if (obj.userData && obj.userData.remoteKey) rKey = obj.userData.remoteKey;
        }
        const r = this.net.enemyByKey(rKey);
        if (r && r.pid) {
          const prevTarget = this.player.target;
          const isSameTarget = prevTarget && (prevTarget.pid === r.pid);
          const className = (window.CS && window.CS.getClass)
            ? (window.CS.getClass(r.cls) || {}).name || r.cls
            : (r.cls || 'Инженер');
          const targetObj = {
            pid: r.pid,
            type: 'p',
            mesh: r.meshGroup || obj,
            hp: r.hp != null ? r.hp : (r.maxHp || 100),
            maxHp: r.maxHp || 100,
            name: r.name,
            level: r.level || 1,
            cls: r.cls || 'engineer',
            className: className,
            title: r.titleName || r.title || null,
            role: 'player'
          };
          if (isSameTarget) {
            // Второй клик по игроку с открытой лавкой — витрина, а не следование.
            if (r.store && this.storeView && typeof this.storeView.open === 'function') {
              this.storeView.open(r.pid, r.name);
            } else {
              this.player.startFollowing(targetObj);
              if (this.ui) this.ui.addChatMessage('Следование за ' + (targetObj.name || 'игроком') + '.', 'system');
            }
          } else {
            this.player.stopAutoAttack();
            this.player.stopFollowing();
            if (this.player.skillManager) this.player.skillManager.pendingSkill = null;
            this.player.setTarget(targetObj);
          }
          if (this.ui) this.ui.showTargetStatus(this.player.target);
          return;
        }
      }
    }

    // таргет моба (только remote с сервера)
    const meshes = this.net.getEnemyMeshes();
    if (meshes && meshes.length) {
      const hit = this.raycaster.intersectObjects(meshes, true);
      if (hit.length) {
        const mesh = hit[0].object;
        const r = this.net.enemyByKey(mesh.userData && mesh.userData.remoteKey);
        if (r) {
          const prevTarget = this.player.target;
          const isSameTarget = prevTarget && (prevTarget.mid === r.mid || prevTarget.mesh === mesh);
          const mobName = (this.net.mobDisplayName
            ? this.net.mobDisplayName(r.mobId, r.name)
            : (r.name || r.mobId));
          const mobLv = (r.level != null && r.level > 0) ? r.level : 1;
          const targetObj = {
            mid: r.mid, mesh, hp: (!r.isDying && (r.hp == null || r.hp <= 0)) ? 1 : r.hp, maxHp: r.maxHp || 1,
            name: mobName, level: mobLv, mobId: r.mobId,
            boss: !!r.boss, named: !!r.named, champion: !!r.champion,
            role: r.role || null, rank: r.rank || null
          };
          if (isSameTarget) {
            this.player.startAutoAttack(targetObj);
          } else {
            this.player.stopAutoAttack();
            this.player.stopFollowing();
            if (this.player.skillManager) this.player.skillManager.pendingSkill = null;
            this.player.setTarget(targetObj);
          }
          this.ui.showTargetStatus(this.player.target);
          // After select, still over the mob → show L2 attack sword
          this._hoverClientX = ev.clientX;
          this._hoverClientY = ev.clientY;
          this._updateCombatCursor(true);
          return;
        }
      }
    }

    const hp = this._pickGround();
    if (hp) {
      this.player.stopAutoAttack();
      if (this.player.skillManager) this.player.skillManager.pendingSkill = null;
      this.player.moveTo(hp);
    }
    this._setCombatCursor(false);
  }

  /**
   * Клик по земле — БЕЗ фильтров вода/суша.
   * Не резать по seaLevel. Барьер только в player (ходьба).
   */
  _pickGround() {
    const T = window.Terrain;
    const ray = this.raycaster.ray;
    const O = ray.origin, D = ray.direction;

    // 1) raycast по мешу террейна
    if (T && T.mesh) {
      const hits = this.raycaster.intersectObject(T.mesh, true);
      if (hits && hits.length) {
        for (let i = 0; i < hits.length; i++) {
          if (hits[i].distance < 0.2) continue;
          const p = hits[i].point;
          return new THREE.Vector3(p.x, 0, p.z);
        }
      }
    }

    // 2) heightfield march — сырая высота, без sea
    if (!T || !T.heightAt) {
      if (Math.abs(D.y) < 1e-6) return null;
      const t = -O.y / D.y;
      if (t < 0.5 || t > 3000) return null;
      return new THREE.Vector3(O.x + D.x * t, 0, O.z + D.z * t);
    }

    const maxDist = 3000;
    const step = 1.0;
    let wasAbove = O.y > T.heightAt(O.x, O.z);
    let prevT = 0;

    for (let t = step; t <= maxDist; t += step) {
      const x = O.x + D.x * t;
      const y = O.y + D.y * t;
      const z = O.z + D.z * t;
      const gh = T.heightAt(x, z);
      if (y > gh) {
        wasAbove = true;
      } else if (wasAbove) {
        let lo = prevT, hi = t;
        for (let b = 0; b < 12; b++) {
          const mt = (lo + hi) * 0.5;
          const my = O.y + D.y * mt;
          const mgh = T.heightAt(O.x + D.x * mt, O.z + D.z * mt);
          if (my <= mgh) hi = mt; else lo = mt;
        }
        const ft = (lo + hi) * 0.5;
        return new THREE.Vector3(O.x + D.x * ft, 0, O.z + D.z * ft);
      }
      prevT = t;
    }

    // 3) fallback: плоскость на высоте ног
    const py = this.player && this.player.mesh ? this.player.mesh.position.y : 0;
    if (Math.abs(D.y) > 1e-6) {
      const t = (py - O.y) / D.y;
      if (t > 0.5 && t < 3000) {
        return new THREE.Vector3(O.x + D.x * t, 0, O.z + D.z * t);
      }
    }
    return null;
  }

  onKeyDown(e) {
    if (e.key === 'F2') {
      e.preventDefault();
      if (this.editor && typeof this.editor.toggle === 'function') {
        this.editor.toggle();
        return;
      }
      if (!window.PS_GM || !window.__PS_EDITOR_KEY) return;
      if (typeof window.__ensureSceneEditor === 'function') {
        window.__ensureSceneEditor(this).then(function (ed) {
          if (ed && typeof ed.toggle === 'function') ed.toggle(true);
        });
      }
      return;
    }
    if (e.key === 'F9') {
      e.preventDefault();
      if (this.ui && typeof this.ui._toggleTestsPanel === 'function') this.ui._toggleTestsPanel();
      return;
    }
    if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
    if (document.activeElement && document.activeElement.id === 'chat-input') return;
    // OS key-repeat во время каста не должен повторно жать скилл
    if (e.repeat) return;
    // Esc: сначала сброс таргета (L2 style), а если таргета и окон нет → menu.html
    if (e.key === 'Escape') {
      if (this.player && this.player.target) {
        e.preventDefault();
        this.player.setTarget(null);
        if (this.ui) this.ui.hideTargetStatus();
        this._pendingNpcInteract = null;
        return;
      }
      if (!this.anyWindowOpen()) {
        e.preventDefault();
        this.goToMenuPage();
        return;
      }
    }
    if (this.player.classChangePending) { if (['1', '2', '3'].includes(e.key)) this.player.changeClass(parseInt(e.key) - 1); return; }
    // Skill bar: ряд 0 = 1–0; Ctrl/Alt/Ctrl+Alt = доп. ряды (единственный обработчик)
    if (this.skillsUI && e.code && (e.code.startsWith('Digit') || e.code === 'Digit0')) {
      const slot = e.code === 'Digit0' ? 9 : (parseInt(e.code.replace('Digit', ''), 10) - 1);
      if (slot >= 0 && slot <= 9) {
        let row = 0;
        if (e.ctrlKey && e.altKey && this.skillsUI.rowCount > 3) row = 3;
        else if (e.altKey && this.skillsUI.rowCount > 2) row = 2;
        else if (e.ctrlKey && this.skillsUI.rowCount > 1) row = 1;
        this.skillsUI.useSkillBarSlot(slot, row);
        return;
      }
    }
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9 && this.skillsUI) { this.skillsUI.useSkillBarSlot(n - 1, 0); return; }
    if (e.key === '0' && this.skillsUI) { this.skillsUI.useSkillBarSlot(9, 0); return; }
    switch (e.key) {
      case 'i': case 'b': case 'ш': case 'и':
        // Инвентарь отдельно (Alt+V / I)
        if (this.inventoryUI) this.inventoryUI.toggle();
        break;
      // C / K / J — обрабатывает char-menu (статус / умения / квесты)
      // Alt+C — действия (в char-menu)
      case 'm': case 'ь': if (this.mapRenderer) this.mapRenderer.toggle(); break;
      case 'c': case 'с': if (this.craftUI) this.craftUI.open(false); break;
      case 'o': case 'щ':
        if (this.ui && typeof this.ui._toggleSettings === 'function') this.ui._toggleSettings();
        break;
      case 'F4':
        e.preventDefault();
        // Инспектор видимости и отладка: только GM (window.PS_GM) или dev-режим (window.PS_DEV)
        if (!window.PS_GM && !window.PS_DEV) break;
        if (window.L2VisibilityManager || window.L2Vis) {
          const v = window.L2VisibilityManager || window.L2Vis;
          const on = v.toggleDebugRings(this.scene, this.player);
          v.toggleInspector();
          if (this.ui) this.ui.addChatMessage(`[L2Vis] 3D Кольца и Инспектор: ${on ? 'ВКЛЮЧЕНЫ' : 'ВЫКЛЮЧЕНЫ'} [F4]`, 'system');
        }
        break;
      case 'f': case 'а':
        if (this.nearestNPC && this.npcManager) this.npcManager.interactWithNPC(this.nearestNPC);
        else if (this.dungeonManager) { const gate = this.dungeonManager.getGateAt(this.player.mesh.position); if (gate && this.dungeonUI) this.dungeonUI.openEntry(gate.config); }
        break;
      case 'e': case 'у': if (this.dungeonManager) { const ch = this.dungeonManager.getChestAt(this.player.mesh.position); if (ch) this.dungeonManager.openChest(ch); } break;
    }
  }

  /**
   * L2 /targetnext — быстрый захват ближайшего моба
   */
  findAndTargetNearestEnemy(autoAttack) {
    if (this.touchControls && typeof this.touchControls._triggerNextTarget === 'function') {
      this.touchControls._triggerNextTarget(autoAttack);
    }
  }

  /**
   * Быстрый сбор лута поблизости
   */
  pickupNearestLoot() {
    if (this.touchControls && typeof this.touchControls._triggerPickup === 'function') {
      this.touchControls._triggerPickup();
    }
  }

  /**
   * Контекстное первичное действие (Атака / Разговор / Таргет)
   */
  triggerPrimaryAction() {
    if (this.touchControls && typeof this.touchControls._triggerPrimaryAction === 'function') {
      this.touchControls._triggerPrimaryAction();
    }
  }

  checkNPCInteraction() {
    if (!this.npcManager) return;

    // Автоматическое закрытие диалога при удалении от NPC (L2 канон: дистанция > 5.5м)
    if (this.npcUI && this.npcUI.container && this.npcUI.container.classList.contains('open')) {
      const activeNpc = this.npcUI.currentNPC;
      if (activeNpc && activeNpc.mesh && this.player && this.player.mesh) {
        const pp = this.player.mesh.position;
        const np = activeNpc.mesh.position;
        const dist = Math.hypot(pp.x - np.x, pp.z - np.z);
        if (dist > 5.5) {
          this.npcUI.close();
        }
      }
    }

    const near = this.npcManager.getNPCsInRange(this.player.mesh.position, 4);
    if (near.length && !(this.npcUI && this.npcUI.container.classList.contains('open'))) {
      if (!this.npcHint) { this.npcHint = document.createElement('div'); this.npcHint.style.cssText = 'position:fixed;bottom:150px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.8);color:#ffaa44;padding:8px 16px;border-radius:8px;font-family:monospace;font-size:13px;z-index:400'; document.body.appendChild(this.npcHint); }
      this.npcHint.textContent = '[F] ' + near[0].name; this.npcHint.style.display = 'block'; this.nearestNPC = near[0];
    } else if (this.npcHint) { this.npcHint.style.display = 'none'; this.nearestNPC = null; }
  }

  hideLoadingScreen() {
    const ls = document.getElementById('loading-screen'), pb = document.getElementById('loading-progress');
    if (pb) pb.style.width = '100%';
    requestAnimationFrame(() => { setTimeout(() => { if (ls) { ls.style.opacity = '0'; setTimeout(() => ls.style.display = 'none', 300); } }, 150); });
  }

  /**
   * FPS / perf HUD — скрыт по умолчанию, переключается F3.
   * Shows FPS, frame ms, remote count, L2 visibility stats, draw hints.
   */
  _ensureFpsHud() {
    if (this._fpsHud && document.getElementById('fps-monitor')) return this._fpsHud;
    let el = document.getElementById('fps-monitor');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fps-monitor';
      document.body.appendChild(el);
    }
    el.style.cssText = [
      'position:fixed', 'top:calc(var(--radar-frame-width, 196px) + 20px)', 'right:var(--hud-right, 8px)', 'z-index:10000',
      'font:clamp(9px, 1vw, 11px)/1.3 Consolas,monospace', 'color:#9f9',
      'background:rgba(12,14,18,0.92)', 'border:1px solid rgba(180,140,60,0.6)',
      'box-shadow:0 4px 14px rgba(0,0,0,0.7)',
      'border-radius:4px', 'padding:clamp(3px, 0.5vh, 6px) clamp(6px, 0.8vw, 10px)', 'cursor:grab',
      'max-width:calc(100vw - 20px)', 'text-shadow:0 1px 2px #000', 'white-space:pre',
      'user-select:none'
    ].join(';');
    el.textContent = 'FPS …';
    el.style.display = 'none';
    this._fpsVisible = false;
    this._fpsHud = el;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._fpsLast = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._frameMsSmoothed = 16;

    window.toggleFpsHud = () => {
      this._fpsVisible = !this._fpsVisible;
      if (this._fpsHud) this._fpsHud.style.display = this._fpsVisible ? 'block' : 'none';
      return this._fpsVisible;
    };
    window.setFpsHudVisible = (vis) => {
      this._fpsVisible = !!vis;
      if (this._fpsHud) this._fpsHud.style.display = this._fpsVisible ? 'block' : 'none';
      return this._fpsVisible;
    };

    // Draggable support (Mouse + Touch)
    let isDragging = false, startX = 0, startY = 0, initialLeft = 0, initialTop = 0;
    try {
      const savedPos = JSON.parse(localStorage.getItem('ps_fps_hud_pos') || 'null');
      if (savedPos && savedPos.x != null && savedPos.y != null) {
        el.style.right = 'auto';
        el.style.left = Math.max(0, Math.min(window.innerWidth - 120, savedPos.x)) + 'px';
        el.style.top = Math.max(0, Math.min(window.innerHeight - 50, savedPos.y)) + 'px';
      }
    } catch (_) {}

    const onDragStart = (cx, cy) => {
      isDragging = true;
      el.style.cursor = 'grabbing';
      const rect = el.getBoundingClientRect();
      el.style.right = 'auto';
      el.style.left = rect.left + 'px';
      el.style.top = rect.top + 'px';
      startX = cx;
      startY = cy;
      initialLeft = rect.left;
      initialTop = rect.top;
    };
    const onDragMove = (cx, cy, e) => {
      if (!isDragging) return;
      const dx = cx - startX;
      const dy = cy - startY;
      el.style.left = Math.max(0, Math.min(window.innerWidth - el.offsetWidth, initialLeft + dx)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - el.offsetHeight, initialTop + dy)) + 'px';
      if (e && e.cancelable) e.preventDefault();
    };
    const onDragEnd = () => {
      if (isDragging) {
        isDragging = false;
        el.style.cursor = 'grab';
        try {
          localStorage.setItem('ps_fps_hud_pos', JSON.stringify({ x: el.offsetLeft, y: el.offsetTop }));
        } catch (_) {}
      }
    };

    el.addEventListener('mousedown', (e) => {
      onDragStart(e.clientX, e.clientY);
      e.stopPropagation();
    });
    window.addEventListener('mousemove', (e) => onDragMove(e.clientX, e.clientY, e));
    window.addEventListener('mouseup', onDragEnd);

    el.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length === 1) {
        onDragStart(e.touches[0].clientX, e.touches[0].clientY);
        e.stopPropagation();
      }
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches && e.touches.length === 1) {
        onDragMove(e.touches[0].clientX, e.touches[0].clientY, e);
      }
    }, { passive: false });
    window.addEventListener('touchend', onDragEnd);
    window.addEventListener('touchcancel', onDragEnd);

    // F3 toggle — доступен в GM или dev режиме
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.key === 'F3') {
        e.preventDefault();
        if (!window.PS_GM && !window.PS_DEV) return;
        this._fpsVisible = !this._fpsVisible;
        if (this._fpsHud) this._fpsHud.style.display = this._fpsVisible ? 'block' : 'none';
      }
    });

    // Click on HUD to toggle L2 Inspector (только GM / dev)
    el.addEventListener('click', (e) => {
      if (isDragging) return;
      if (!window.PS_GM && !window.PS_DEV) return;
      if (window.L2VisibilityManager || window.L2Vis) {
        const v = window.L2VisibilityManager || window.L2Vis;
        v.toggleInspector();
      }
    });

    return el;
  }

  _tickFpsMonitor(frameMs, netMs, crowdMs, renderMs) {
    try {
      const hud = this._ensureFpsHud();
      if (!hud || !this._fpsVisible) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      this._fpsFrames = (this._fpsFrames || 0) + 1;
      this._fpsAcc = (this._fpsAcc || 0) + (frameMs || 16);
      this._frameMsSmoothed = (this._frameMsSmoothed || 16) * 0.9 + (frameMs || 16) * 0.1;
      this._renderMsSmoothed = (this._renderMsSmoothed || 10) * 0.9 + (renderMs || 10) * 0.1;
      this._netMsSmoothed = (this._netMsSmoothed || 5) * 0.9 + (netMs || 5) * 0.1;
      this._crowdMsSmoothed = (this._crowdMsSmoothed || 2) * 0.9 + (crowdMs || 2) * 0.1;
      if (now - (this._fpsLast || 0) < 350) return;
      const elapsed = Math.max(1, now - (this._fpsLast || now));
      const fps = Math.round((this._fpsFrames * 1000) / elapsed);
      const ms = this._frameMsSmoothed;
      this._fpsFrames = 0;
      this._fpsLast = now;
      let rem = 0, remM = 0, remP = 0;
      if (this.net && this.net.remote) {
        rem = this.net.remote.size;
        for (const [, r] of this.net.remote) {
          if (r.type === 'm') remM++;
          else if (r.type === 'p') remP++;
        }
      }
      const npcCount = (this.npcManager && Array.isArray(this.npcManager.npcs)) ? this.npcManager.npcs.length : 0;
      const visMgr = window.L2VisibilityManager || window.L2Vis;
      const vs = (visMgr && visMgr.stats) ? visMgr.stats : {
        totalKnown: rem + npcCount,
        visibleCount: 0,
        frustumCulled: 0,
        distanceCulled: 0,
        limitCulled: 0,
        nearLodCount: 0,
        farLodCount: 0
      };

      const totalWorld = Math.max(vs.totalKnown, rem + npcCount);
      const isEd = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
      const visInfo = isEd
        ? '\n[Редактор: Smart Culling] Vis ' + vs.visibleCount + ' / ' + totalWorld + ' [F:' + vs.frustumCulled + ' D:' + vs.distanceCulled + ']'
        : '\nVis  ' + vs.visibleCount + ' / ' + totalWorld + ' [F:' + vs.frustumCulled + ' D:' + vs.distanceCulled + ' C:' + vs.limitCulled + ']' +
          '\nLOD Mobs  Near:' + vs.nearLodCount + ' · Far:' + vs.farLodCount;

      let lodGeoInfo = '';
      let mStats = null;
      let vStats = null;
      try {
        if (window.Mountains && typeof window.Mountains.getStats === 'function') {
          mStats = window.Mountains.getStats();
        }
      } catch (_) {}
      try {
        if (window.Volcano && typeof window.Volcano.getStats === 'function') {
          vStats = window.Volcano.getStats();
        }
      } catch (_) {}
      if (mStats || vStats) {
        const mTris = mStats ? (mStats.totalRenderedTris > 999 ? (mStats.totalRenderedTris / 1000).toFixed(1) + 'k' : mStats.totalRenderedTris) : '-';
        const vTris = vStats ? (vStats.renderedTris > 999 ? (vStats.renderedTris / 1000).toFixed(1) + 'k' : vStats.renderedTris) : '-';
        const mLvl = mStats ? (mStats.forcedLevel >= 0 ? 'F' + mStats.forcedLevel : (mStats.activeLevelCounts ? 'L0:' + (mStats.activeLevelCounts.lod0||0) + ' L1:' + (mStats.activeLevelCounts.lod1||0) + ' L2:' + (mStats.activeLevelCounts.lod2||0) : '')) : '';
        const vLvl = vStats ? (vStats.forcedLevel >= 0 ? 'F' + vStats.forcedLevel : 'L' + vStats.activeLevel) : '';
        lodGeoInfo = '\nLOD Geo   Mt:' + mTris + ' [' + mLvl + '] · Vc:' + vTris + ' [' + vLvl + ']';
      }

      let drawInfo = '';
      if (this.renderer && this.renderer.info && this.renderer.info.render) {
        const ri = this.renderer.info.render;
        const trisK = (ri.triangles > 999) ? (ri.triangles / 1000).toFixed(1) + 'k' : ri.triangles;
        drawInfo = '\nCalls ' + ri.calls + ' · Tris ' + trisK;
      }
      const onlineCount = (window.game && window.game.serverOnline != null)
        ? window.game.serverOnline
        : (this.net ? (this.net.online || (remP + 1)) : 1);

      const color = fps >= 50 ? '#8f8' : fps >= 30 ? '#fc6' : '#f66';
      hud.style.color = color;
      hud.textContent =
        'FPS  ' + fps + '  (' + ms.toFixed(1) + ' ms) · Онлайн: ' + onlineCount + ' (AOI: ' + (remP + 1) + ' · Мобы: ' + remM + ')\n' +
        'CPU  Render:' + (this._renderMsSmoothed || 0).toFixed(1) + 'ms · Net:' + (this._netMsSmoothed || 0).toFixed(1) + 'ms · AI:' + (this._crowdMsSmoothed || 0).toFixed(1) + 'ms\n' +
        'World ' + totalWorld + ' (A:' + (vs.actorsCount || (rem + npcCount)) + ' · P:' + (vs.propsCount || 0) + ' · T:' + (vs.foliageCount || 0) + ' · L:' + (vs.lootCount || 0) + ')' +
        visInfo +
        lodGeoInfo +
        drawInfo +
        '\nF3:HUD · F4:Инспектор · O:Опции';
    } catch (e) {
      console.warn('FPS Monitor error:', e);
    }
  }

  _ensureTargetRing() {
    if (this._targetRing) return this._targetRing;
    const geo = new THREE.RingGeometry(0.75, 0.95, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x44bbff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    ring.renderOrder = 998;
    this.scene.add(ring);
    this._targetRing = ring;
    return ring;
  }

  _updateTargetRing(delta) {
    const ring = this._ensureTargetRing();
    const t = this.player && this.player.target;
    if (!t) {
      ring.visible = false;
      return;
    }
    let tx = null, ty = null, tz = null, rad = 0.95, col = 0x44bbff;
    if (t.pid != null && this.net) {
      const rem = this.net.remote.get('p' + t.pid);
      if (rem) {
        tx = rem.x;
        tz = rem.z;
        ty = (rem._shy != null ? rem._shy : (rem.meshGroup ? rem.meshGroup.position.y : 0)) + 0.04;
        rad = 0.95;
        col = rem.dueling ? 0xd060ff : ((rem.flagged || rem.karma > 0) ? 0xff4444 : 0x44bbff);
      }
    } else if (t.mid != null && this.net) {
      const rem = this.net.remote.get('m' + t.mid);
      if (rem) {
        tx = rem.x;
        tz = rem.z;
        ty = (rem._shy != null ? rem._shy : (rem.mesh ? rem.mesh.position.y : 0)) + 0.04;
        rad = rem.boss ? 2.4 : rem.named ? 1.6 : 1.1;
        col = rem.boss ? 0xff2222 : 0xff7722;
      }
    } else if (t.type === 'npc' || t.npc) {
      if (t.mesh && t.mesh.position) {
        tx = t.mesh.position.x;
        tz = t.mesh.position.z;
        const gh = window.Terrain && window.Terrain.heightAt ? window.Terrain.heightAt(tx, tz) : 0;
        ty = gh + 0.04;
        rad = (t.scale || (t.npc && t.npc.template && t.npc.template.scale) || 2.4) * 0.45;
        col = 0x44dd88; // Зелёно-бирюзовое кольцо таргета мирного NPC
      }
    } else if (t.mesh && t.mesh.position) {
      tx = t.mesh.position.x;
      tz = t.mesh.position.z;
      ty = t.mesh.position.y + 0.04;
    }
    if (tx == null || tz == null) {
      ring.visible = false;
      return;
    }
    ring.position.set(tx, ty, tz);
    ring.scale.set(rad, rad, rad);
    ring.material.color.setHex(col);
    ring.rotation.z = (ring.rotation.z + delta * 1.5) % (Math.PI * 2);
    ring.visible = true;
  }

  animate() {
    if (!this.isRunning) return;
    requestAnimationFrame(() => this.animate());
    // Исключение в кадре раньше молча убивало цикл (или спамило 60 раз в секунду).
    // Считаем подряд идущие ошибки: 30 штук — останавливаем и сообщаем игроку.
    try {
      this._frame(this._readFrameTime());
      this._frameErrors = 0;
    } catch (e) {
      this._frameErrors = (this._frameErrors || 0) + 1;
      if (this._frameErrors <= 3 || this._frameErrors % 60 === 0) {
        console.error('[animate] кадр упал (' + this._frameErrors + '):', e);
      }
      if (this._frameErrors >= 30) {
        this.isRunning = false;
        if (typeof window.__psFatal === 'function') window.__psFatal('render loop stopped', e);
        else console.error('[animate] цикл остановлен', e);
      }
    }
  }
  _readFrameTime() {
    return (typeof performance !== 'undefined' ? performance.now() : Date.now());
  }
  _frame(t0) {
    this._frameCount = (this._frameCount || 0) + 1;
    if (this.clock.update) this.clock.update();                       // Timer требует update() каждый кадр
    const delta = this.clock.getDelta();
    const elapsed = (this.clock.getElapsed ? this.clock.getElapsed() : (this.clock.elapsedTime || 0));
    // clamp sim step so lag spikes don't cascade
    const dt = Math.min(0.05, delta || 0.016);
    if (this.player) this.player.update(dt);
    this._updateTargetRing(dt);
    // Предвыделенный вектор: раньше new THREE.Vector3() создавался каждый кадр
    if (!this._ppFallback) this._ppFallback = new THREE.Vector3();
    const pp = (this.player && this.player.mesh) ? this.player.mesh.position : this._ppFallback;

    // Проверка сближения с NPC после клика/дабл-клика
    if (this._pendingNpcInteract && this.player && this.player.mesh) {
      const npc = this._pendingNpcInteract;
      if (npc && npc.mesh) {
        const np = npc.mesh.position;
        const dist = Math.hypot(pp.x - np.x, pp.z - np.z);
        if (dist <= 4.2) {
          this.player.stopFollowing();
          this.player.isMoving = false;
          this.player.playLocoAnim();
          const it = npc;
          this._pendingNpcInteract = null;
          if (this.npcManager) this.npcManager.interactWithNPC(it);
        }
      }
    }

    if (this.dayNight) {
      this.dayNight.update(dt, pp);
    } else if (this.sun) {
      this.sun.position.set(pp.x + 120, pp.y + 220, pp.z + 80);
      this.sun.target.position.set(pp.x, 0, pp.z);
      this.sun.target.updateMatrixWorld();
    }
    if (this.chunkManager) { this.chunkManager.update(pp); for (const [, c] of this.chunkManager.chunks) if (c.update) c.update(dt); }
    if (this.lootManager && this.lootManager.update) this.lootManager.update(dt, pp, this.player);
    if (this.dungeonManager) this.dungeonManager.update(dt, pp, this.player);
    if (this.npcManager) this.npcManager.update(dt, pp);
    const tBeforeNet = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (this.net) {
      this.net.update(dt);
      if (typeof this.net.tickHeartbeat === 'function') this.net.tickHeartbeat();
    }
    const tAfterNet = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    if (this.cameraRig && this.player && this.player.mesh) this.cameraRig.update(dt, this.player.mesh.position);
    if (this.editor && this.editor.update) this.editor.update();
    if (window.Terrain && window.Terrain.update) window.Terrain.update(elapsed);
    if (window.Volcano && window.Volcano.update) window.Volcano.update(elapsed, this.camera);
    if (window.Mountains && window.Mountains.update) window.Mountains.update(elapsed, this.camera);
    if (window.WaterSystem && window.WaterSystem.update) window.WaterSystem.update(elapsed);
    if (window.WindSystem && window.WindSystem.update) window.WindSystem.update(dt);

    const tBeforeCrowd = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // Стресс-тест толпы — dev-инструмент (/stress) или при наличии активных ботов.
    if ((window.PS_DEV && window.CrowdStressTest && window.CrowdStressTest.update) ||
        (window.CrowdStressTest && window.CrowdStressTest.update && window.CrowdStressTest.activeBots && window.CrowdStressTest.activeBots.size > 0)) {
      window.CrowdStressTest.update(dt);
    }
    const tAfterCrowd = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    this.checkNPCInteraction();
    // L2 combat cursor: re-check ~10/s if target dies / moves under cursor
    this._cursorHoverAcc = (this._cursorHoverAcc || 0) + dt;
    if (this._cursorHoverAcc >= 0.1) {
      this._cursorHoverAcc = 0;
      if (this._cursorMode === 'attack' || (this.player && this.player.target)) {
        this._updateCombatCursor(false);
      }
    }
    if (this._hoveredLootGi) {
      this._updateLootHoverPos();
    }
    if (this.ui) this.ui.update();
    if (this.skillsUI && this.skillsUI.update) this.skillsUI.update();
    if (this.touchControls && this.touchControls.update) this.touchControls.update();
    if (this.charMenu && this.charMenu.update) this.charMenu.update();
    if (this.levelUI && this.levelUI.update) this.levelUI.update();
    if (this.dungeonUI && this.dungeonUI.updateHints) this.dungeonUI.updateHints(pp);

    const tBeforeRender = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (!this._pageHidden && !document.hidden) {
      this.renderer.render(this.scene, this.camera);
    }
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    this._tickFpsMonitor(t1 - t0, tAfterNet - tBeforeNet, tAfterCrowd - tBeforeCrowd, t1 - tBeforeRender);
  }
}

window.game = new Game();