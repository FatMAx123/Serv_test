// ============================================================
//  AUDIO.JS — шины BGM / SFX / UI на чистом Web Audio API.
//  Без HTMLAudioElement / DOM-Audio — исключает системный оверлей Chrome/SMTC.
//  BGM грузится в AudioBuffer и воспроизводится через BufferSource + Gain.
//  При сворачивании вкладки / окна (visibilitychange / blur) — AudioContext.suspend().
//  При возврате — AudioContext.resume().
// ============================================================
(function () {
  'use strict';

  var LS_SFX = 'ps_game_audio_vol';
  var LS_BGM = 'ps_game_bgm_vol';
  var LS_MUTE = 'ps_game_audio_mute';
  var SFX_CAP = 8;
  var SFX_3D_CAP = 8;
  var MAX_3D_DIST = 60;
  var MIN_3D_DIST = 2.5;
  var REF_3D_DIST = 5;
  var BGM_CROSSFADE = 2.4;

  var BGM = {
    village: 'assets/audio/bgm/village_theme.ogg',
    plains: 'assets/audio/bgm/plains_ambient.ogg'
  };
  var SFX_FILES = {
    hit: 'assets/audio/sfx/hit.ogg',
    crit: 'assets/audio/sfx/crit.ogg',
    soulshot: 'assets/audio/sfx/soulshot.ogg',
    spell_cast: 'assets/audio/sfx/spell_cast.ogg',
    levelup: 'assets/audio/sfx/levelup.ogg',
    death: 'assets/audio/sfx/death.ogg',
    loot: 'assets/audio/sfx/loot.ogg',
    potion_drink: 'assets/audio/sfx/potion_drink.ogg',
    aura_burst: 'assets/audio/sfx/aura_burst.ogg'
  };

  function readNum(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v == null) return fallback;
      var n = parseFloat(v);
      return isFinite(n) ? n : fallback;
    } catch (_) { return fallback; }
  }

  function clamp01(v) {
    v = +v;
    if (!isFinite(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
  }

  function clearMediaSession() {
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator && navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        var actions = ['play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'stop'];
        actions.forEach(function (act) {
          try { navigator.mediaSession.setActionHandler(act, null); } catch (_) {}
        });
      } catch (_) {}
    }
  }

  function GameAudio() {
    this.sfxGain = clamp01(readNum(LS_SFX, 70) / 100);
    this.bgmGain = clamp01(readNum(LS_BGM, 45) / 100);
    this.muted = (function () {
      try { return localStorage.getItem(LS_MUTE) === '1'; } catch (_) { return false; }
    })();
    this.unlocked = false;
    this.hidden = false;
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.bgmBus = null;
    this._sfxBusy = 0;
    this._lastSfxAt = Object.create(null);

    // BGM Web Audio State (AudioBufferSourceNode + GainNode)
    this._bgmBuffers = Object.create(null);
    this._bgmLoading = Object.create(null);
    this._bgmVoice = null; // { key, source, gainNode }
    this._bgmKey = null;
    this._pendingZone = null;
    this._unlockBound = false;

    // 3D / Positional SFX (P2.3)
    this.listener = null;
    this.camera = null;
    this.scene = null;
    this._audioBuffers = Object.create(null);
    this._buffersLoading = Object.create(null);
    this._buffersPreloaded = false;
    this._posPool = [];
    this._posPoolCap = SFX_3D_CAP;
  }

  GameAudio.prototype._ensureCtx = function () {
    if (this.ctx) return this.ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    if (typeof window !== 'undefined' && window.THREE && window.THREE.AudioContext) {
      try { window.THREE.AudioContext.setContext(this.ctx); } catch (_) {}
    }
    this.master = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.bgmBus = this.ctx.createGain();
    this.sfxBus.connect(this.master);
    this.bgmBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this._applyGains();
    return this.ctx;
  };

  GameAudio.prototype._applyGains = function () {
    var live = (this.hidden || this.muted) ? 0 : 1;
    if (this.sfxBus) this.sfxBus.gain.value = this.sfxGain * live;
    if (this.bgmBus) this.bgmBus.gain.value = this.bgmGain * live;
    if (this.master) this.master.gain.value = live;
  };

  GameAudio.prototype.unlock = function () {
    if (this.unlocked) return;
    this.unlocked = true;
    var ctx = this._ensureCtx();
    if (ctx && ctx.state === 'suspended') {
      try { ctx.resume(); } catch (_) {}
    }
    this._preloadBuffers();
    this._ensureListener();
    if (this._pendingZone) {
      this.setZone(this._pendingZone);
    } else {
      this.setZone('village');
    }
    clearMediaSession();
  };

  GameAudio.prototype.bindUnlock = function () {
    if (this._unlockBound) return;
    this._unlockBound = true;
    var self = this;
    var once = function () {
      self.unlock();
      window.removeEventListener('pointerdown', once, true);
      window.removeEventListener('keydown', once, true);
      window.removeEventListener('touchstart', once, true);
    };
    window.addEventListener('pointerdown', once, true);
    window.addEventListener('keydown', once, true);
    window.addEventListener('touchstart', once, true);
  };

  GameAudio.prototype.setSfxVolume = function (v01) {
    this.sfxGain = clamp01(v01);
    try { localStorage.setItem(LS_SFX, String(Math.round(this.sfxGain * 100))); } catch (_) {}
    this._applyGains();
  };

  GameAudio.prototype.setBgmVolume = function (v01) {
    this.bgmGain = clamp01(v01);
    try { localStorage.setItem(LS_BGM, String(Math.round(this.bgmGain * 100))); } catch (_) {}
    this._applyGains();
  };

  GameAudio.prototype.setVolume = function (v01) {
    this.setSfxVolume(v01);
  };

  GameAudio.prototype.setMuted = function (m) {
    this.muted = !!m;
    try { localStorage.setItem(LS_MUTE, this.muted ? '1' : '0'); } catch (_) {}
    this._applyGains();
    if (this.muted) {
      this._pauseBgm();
    } else if (this.unlocked && !this.hidden) {
      this._resumeBgm();
    }
  };

  GameAudio.prototype.setPageHidden = function (hidden) {
    this.hidden = !!hidden;
    this._applyGains();
    if (this.hidden) {
      if (this.ctx && this.ctx.state === 'running') {
        try { this.ctx.suspend(); } catch (_) {}
      }
    } else {
      if (this.ctx && this.ctx.state === 'suspended' && this.unlocked) {
        try { this.ctx.resume(); } catch (_) {}
      }
      if (this.unlocked && !this.muted) {
        if (!this._bgmVoice && this._pendingZone) {
          this.setZone(this._pendingZone);
        }
      }
    }
    clearMediaSession();
  };

  GameAudio.prototype._stopBgm = function () {
    if (this._bgmVoice) {
      try { this._bgmVoice.source.stop(); } catch (_) {}
      try { this._bgmVoice.source.disconnect(); } catch (_) {}
      try { this._bgmVoice.gainNode.disconnect(); } catch (_) {}
      this._bgmVoice = null;
    }
    this._bgmKey = null;
  };

  GameAudio.prototype._pauseBgm = function () {
    this._stopBgm();
  };

  GameAudio.prototype._resumeBgm = function () {
    if (this.muted || this.hidden || !this.unlocked) return;
    if (!this._bgmVoice && this._pendingZone) {
      this.setZone(this._pendingZone);
    }
  };

  GameAudio.prototype.setZone = function (regionOrName) {
    var key = this._zoneKey(regionOrName);
    this._pendingZone = key;
    if (!this.unlocked || this.hidden || this.muted) return;
    if (this._bgmKey === key && this._bgmVoice) return;
    if (this._bgmBuffers[key]) {
      this._crossfadeToBuffer(key, this._bgmBuffers[key]);
    } else {
      this._loadBgmBuffer(key);
    }
  };

  GameAudio.prototype._zoneKey = function (v) {
    var s = String(v || '').toLowerCase();
    if (!s) return 'plains';
    if (s === 'village' || s.indexOf('village') >= 0 || s.indexOf('деревн') >= 0 ||
        s.indexOf('hub') >= 0 || s === 'city' || s.indexOf('мирн') >= 0) {
      return 'village';
    }
    return 'plains';
  };

  GameAudio.prototype._loadBgmBuffer = function (key) {
    var url = BGM[key];
    if (!url || this._bgmBuffers[key] || this._bgmLoading[key]) return;
    var ctx = this._ensureCtx();
    if (!ctx || typeof fetch !== 'function') return;
    this._bgmLoading[key] = true;
    var self = this;
    try {
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error('status ' + res.status);
          return res.arrayBuffer();
        })
        .then(function (ab) {
          return ctx.decodeAudioData(ab);
        })
        .then(function (decoded) {
          self._bgmBuffers[key] = decoded;
          self._bgmLoading[key] = false;
          if (self.unlocked && !self.hidden && !self.muted && self._pendingZone === key) {
            self._crossfadeToBuffer(key, decoded);
          }
        })
        .catch(function (e) {
          self._bgmLoading[key] = false;
          console.warn('[audio] BGM load failed for ' + key, e && e.message);
        });
    } catch (_) {
      self._bgmLoading[key] = false;
    }
  };

  GameAudio.prototype._crossfadeToBuffer = function (key, buffer) {
    var ctx = this._ensureCtx();
    if (!ctx || !this.bgmBus || !buffer) return;
    if (this._bgmKey === key && this._bgmVoice) return;

    var now = ctx.currentTime;
    var incomingSource = ctx.createBufferSource();
    incomingSource.buffer = buffer;
    incomingSource.loop = true;

    var incomingGain = ctx.createGain();
    incomingGain.gain.setValueAtTime(0, now);
    try {
      incomingGain.gain.linearRampToValueAtTime(1.0, now + BGM_CROSSFADE);
    } catch (_) {
      incomingGain.gain.value = 1.0;
    }

    incomingSource.connect(incomingGain);
    incomingGain.connect(this.bgmBus);
    try { incomingSource.start(0); } catch (_) {}

    var outgoing = this._bgmVoice;
    if (outgoing) {
      try {
        var outGain = outgoing.gainNode;
        var outSrc = outgoing.source;
        var curVal = 1;
        try { curVal = outGain.gain.value; } catch (_) {}
        outGain.gain.setValueAtTime(curVal, now);
        try {
          outGain.gain.linearRampToValueAtTime(0, now + BGM_CROSSFADE);
        } catch (_) {
          outGain.gain.value = 0;
        }
        setTimeout(function () {
          try { outSrc.stop(); } catch (_) {}
          try { outSrc.disconnect(); } catch (_) {}
          try { outGain.disconnect(); } catch (_) {}
        }, (BGM_CROSSFADE + 0.1) * 1000);
      } catch (_) {
        try { outgoing.source.stop(); } catch (_) {}
      }
    }

    this._bgmVoice = {
      key: key,
      source: incomingSource,
      gainNode: incomingGain
    };
    this._bgmKey = key;
    clearMediaSession();
  };

  GameAudio.prototype.init3D = function (camera, scene) {
    if (camera) this.camera = camera;
    if (scene) this.scene = scene;
    this._ensureListener();
    if (this.unlocked) {
      this._preloadBuffers();
    }
  };

  GameAudio.prototype._ensureListener = function () {
    if (this.listener) {
      if (this.camera && this.listener.parent !== this.camera) {
        try { this.camera.add(this.listener); } catch (_) {}
      }
      return this.listener;
    }
    if (typeof window === 'undefined' || !window.THREE || !window.THREE.AudioListener) {
      return null;
    }
    var ctx = this._ensureCtx();
    if (!ctx) return null;
    try {
      if (window.THREE.AudioContext) {
        window.THREE.AudioContext.setContext(ctx);
      }
      var listener = new window.THREE.AudioListener();
      if (this.sfxBus && typeof listener.getInput === 'function') {
        try {
          var inNode = listener.getInput();
          inNode.disconnect();
          inNode.connect(this.sfxBus);
        } catch (_) {}
      }
      var cam = this.camera || (window.game && window.game.camera);
      if (cam && typeof cam.add === 'function') {
        this.camera = cam;
        cam.add(listener);
      }
      this.listener = listener;
      this._initPosPool();
      return this.listener;
    } catch (e) {
      console.warn('[audio3d] listener init failed:', e && e.message);
      return null;
    }
  };

  GameAudio.prototype._initPosPool = function () {
    if (!this.listener || !window.THREE || !window.THREE.PositionalAudio) return;
    if (this._posPool.length >= this._posPoolCap) return;
    var sc = this.scene || (window.game && window.game.scene);
    for (var i = this._posPool.length; i < this._posPoolCap; i++) {
      var posAudio = new window.THREE.PositionalAudio(this.listener);
      posAudio.setRefDistance(REF_3D_DIST);
      posAudio.setMaxDistance(MAX_3D_DIST);
      posAudio.setRolloffFactor(1.2);
      posAudio.setDistanceModel('inverse');

      var dummy = new window.THREE.Object3D();
      dummy.name = 'sfx_3d_emitter_' + i;
      dummy.add(posAudio);
      if (sc && typeof sc.add === 'function') {
        sc.add(dummy);
      }
      this._posPool.push({
        audio: posAudio,
        node: dummy,
        inUse: false,
        startedAt: 0,
        timer: null
      });
    }
  };

  GameAudio.prototype._preloadBuffers = function () {
    if (this._buffersPreloaded || !this.ctx) return;
    this._buffersPreloaded = true;
    var self = this;
    var keys = Object.keys(SFX_FILES);
    keys.forEach(function (name) {
      self._loadSfxBuffer(name);
    });
  };

  GameAudio.prototype._loadSfxBuffer = function (name) {
    var url = SFX_FILES[name];
    if (!url || this._buffersLoading[name]) return;
    this._buffersLoading[name] = true;
    var self = this;
    var ctx = this._ensureCtx();
    if (!ctx || typeof fetch !== 'function') return;
    try {
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error('status ' + res.status);
          return res.arrayBuffer();
        })
        .then(function (ab) { return ctx.decodeAudioData(ab); })
        .then(function (decoded) {
          self._audioBuffers[name] = decoded;
          self._buffersLoading[name] = false;
        })
        .catch(function () {
          self._buffersLoading[name] = false;
        });
    } catch (_) {
      self._buffersLoading[name] = false;
    }
  };

  GameAudio.prototype._playBuffer = function (name, buffer) {
    var ctx = this._ensureCtx();
    if (!ctx || !this.sfxBus || !buffer) return;
    try {
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.sfxBus);
      this._sfxBusy++;
      var self = this;
      src.onended = function () {
        self._sfxBusy = Math.max(0, self._sfxBusy - 1);
        try { src.disconnect(); } catch (_) {}
      };
      src.start(0);
    } catch (_) {
      this._sfxBusy = Math.max(0, self._sfxBusy - 1);
    }
  };

  GameAudio.prototype.play = function (name, pos) {
    if (pos && (pos.x != null || pos.position || Array.isArray(pos))) {
      return this.playPositional(name, pos);
    }
    if (!name || this.muted || this.hidden) return;
    if (!this.unlocked) return;
    var now = Date.now();
    var last = this._lastSfxAt[name] || 0;
    if (now - last < 45) return;
    this._lastSfxAt[name] = now;
    if (this._sfxBusy >= SFX_CAP) return;

    var buf = this._audioBuffers[name];
    if (buf) {
      this._playBuffer(name, buf);
    } else {
      if (SFX_FILES[name] && !this._buffersLoading[name]) {
        this._loadSfxBuffer(name);
      }
      this._blip(name);
    }
  };

  GameAudio.prototype.playPositional = function (name, pos, options) {
    if (!name || this.muted || this.hidden) return;
    if (!this.unlocked) return;

    if (!pos) {
      this.play(name);
      return;
    }
    if (pos.position) pos = pos.position;
    var px = Number(pos.x != null ? pos.x : pos[0]);
    var py = Number(pos.y != null ? pos.y : pos[1] || 0);
    var pz = Number(pos.z != null ? pos.z : pos[2]);
    if (!isFinite(px) || !isFinite(pz)) {
      this.play(name);
      return;
    }

    var lx = 0, ly = 0, lz = 0;
    if (this.camera && this.camera.position) {
      lx = this.camera.position.x;
      ly = this.camera.position.y;
      lz = this.camera.position.z;
    } else if (window.game && window.game.player && window.game.player.mesh) {
      lx = window.game.player.mesh.position.x;
      ly = window.game.player.mesh.position.y;
      lz = window.game.player.mesh.position.z;
    }

    var dx = px - lx, dy = py - ly, dz = pz - lz;
    var distSq = dx * dx + dy * dy + dz * dz;

    // Beyond 60m: drop early to avoid voice clutter and CPU overhead
    if (distSq > MAX_3D_DIST * MAX_3D_DIST) {
      return;
    }

    // Very close to listener: play directly in 2D stereo
    if (distSq < MIN_3D_DIST * MIN_3D_DIST) {
      this.play(name);
      return;
    }

    var now = Date.now();
    var last = this._lastSfxAt[name] || 0;
    if (now - last < 40) return;
    this._lastSfxAt[name] = now;

    this._ensureListener();

    var slot = null;
    for (var i = 0; i < this._posPool.length; i++) {
      if (!this._posPool[i].inUse) {
        slot = this._posPool[i];
        break;
      }
    }
    if (!slot && this._posPool.length > 0) {
      var oldest = this._posPool[0];
      for (var j = 1; j < this._posPool.length; j++) {
        if (this._posPool[j].startedAt < oldest.startedAt) {
          oldest = this._posPool[j];
        }
      }
      slot = oldest;
      if (slot.timer) clearTimeout(slot.timer);
      try { if (slot.audio.isPlaying) slot.audio.stop(); } catch (_) {}
    }

    var dist = Math.sqrt(distSq);
    if (!slot) {
      this._blipPositional(name, px, py, pz, dist);
      return;
    }

    slot.inUse = true;
    slot.startedAt = now;
    slot.node.position.set(px, py, pz);

    var buffer = this._audioBuffers[name];
    if (buffer) {
      try {
        if (slot.audio.isPlaying) slot.audio.stop();
        slot.audio.setBuffer(buffer);
        slot.audio.setVolume(1.0);
        slot.audio.play();
        var durMs = Math.ceil((buffer.duration || 0.5) * 1000) + 50;
        slot.timer = setTimeout(function () {
          slot.inUse = false;
        }, durMs);
      } catch (_) {
        slot.inUse = false;
        this._blipPositional(name, px, py, pz, dist);
      }
    } else {
      slot.inUse = false;
      this._blipPositional(name, px, py, pz, dist);
      if (!this._buffersLoading[name]) this._loadSfxBuffer(name);
    }
  };

  GameAudio.prototype._blipPositional = function (name, x, y, z, dist) {
    var ctx = this._ensureCtx();
    if (!ctx || !this.sfxBus) return;
    try {
      var panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = REF_3D_DIST;
      panner.maxDistance = MAX_3D_DIST;
      panner.rolloffFactor = 1.2;
      if (panner.positionX) {
        panner.positionX.setValueAtTime(x, ctx.currentTime);
        panner.positionY.setValueAtTime(y, ctx.currentTime);
        panner.positionZ.setValueAtTime(z, ctx.currentTime);
      } else if (typeof panner.setPosition === 'function') {
        panner.setPosition(x, y, z);
      }
      panner.connect(this.sfxBus);

      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var now = ctx.currentTime;
      var f = 180, dur = 0.08;
      if (name === 'crit') { f = 520; dur = 0.11; }
      else if (name === 'soulshot') { f = 1400; dur = 0.05; }
      else if (name === 'spell_cast') { f = 260; dur = 0.18; }
      else if (name === 'levelup') { f = 523; dur = 0.22; }
      else if (name === 'death') { f = 90; dur = 0.28; }
      else if (name === 'loot') { f = 880; dur = 0.09; }
      else if (name === 'potion_drink') { f = 660; dur = 0.14; }
      else if (name === 'aura_burst') { f = 440; dur = 0.35; }
      o.type = name === 'death' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18 * this.sfxGain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g);
      g.connect(panner);
      o.start(now);
      o.stop(now + dur + 0.02);
    } catch (_) {}
  };

  GameAudio.prototype._blip = function (name) {
    var ctx = this._ensureCtx();
    if (!ctx || !this.sfxBus) return;
    try {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var now = ctx.currentTime;
      var f = 180, dur = 0.08;
      if (name === 'crit') { f = 520; dur = 0.11; }
      else if (name === 'soulshot') { f = 1400; dur = 0.05; }
      else if (name === 'spell_cast') { f = 260; dur = 0.18; }
      else if (name === 'levelup') { f = 523; dur = 0.22; }
      else if (name === 'death') { f = 90; dur = 0.28; }
      else if (name === 'loot') { f = 880; dur = 0.09; }
      else if (name === 'potion_drink') { f = 660; dur = 0.14; }
      else if (name === 'aura_burst') { f = 440; dur = 0.35; }
      o.type = name === 'death' ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18 * this.sfxGain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.connect(g);
      g.connect(this.sfxBus);
      o.start(now);
      o.stop(now + dur + 0.02);
    } catch (_) {}
  };

  var inst = new GameAudio();
  inst.bindUnlock();
  clearMediaSession();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      inst.setPageHidden(!!document.hidden);
      clearMediaSession();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', function () {
      inst.setPageHidden(true);
      clearMediaSession();
    });
    window.addEventListener('pageshow', function () {
      inst.setPageHidden(!!(typeof document !== 'undefined' && document.hidden));
      clearMediaSession();
    });
    window.addEventListener('blur', function () {
      if (typeof document !== 'undefined' && document.hidden) {
        inst.setPageHidden(true);
      }
    });
    window.addEventListener('focus', function () {
      if (typeof document !== 'undefined' && !document.hidden) {
        inst.setPageHidden(false);
      }
    });
    window.GameAudio = inst;
    window.soundManager = inst;
  }
})();
