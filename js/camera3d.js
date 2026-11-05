// ============================================================
//  CAMERA3D.JS — L2 third person & UE5 Free Flight Camera
//
//  Game Mode: Orbit pivot = player (L2 classic)
//  Editor / Free Flight: Full Unreal Engine 5 style viewport navigation:
//    • Hold RMB (ПКМ): Mouselook (Yaw & Pitch)
//    • Hold RMB + WASD: 3D Flight (W/S = Forward/Backward, A/D = Strafe Left/Right, E/Q = Up/Down)
//    • Hold Shift: 3.5x Speed Boost
//    • Hold Ctrl / Alt: 0.3x Precision Slow
//    • Mouse Wheel + RMB: Adjust base flight speed
//    • Mouse Wheel (no RMB): Dolly zoom in/out
// ============================================================
class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0.0;
    this.pitch = 0.45;
    this.dist = 12;
    this.minDist = 3.5;
    this.maxDist = 18;
    this._drag = false;
    this._rmbDown = false;
    this._buttons = 0;
    this._lx = 0;
    this._ly = 0;

    // UE5 Fly Mode configuration
    this.flyMode = false;
    this.flyPos = new THREE.Vector3(0, 300, 0);
    this.flyYaw = 0.0;
    this.flyPitch = -0.35;
    this.flySpeed = 25.0; // Reduced base speed for fine control
    this.flyBoostMultiplier = 3.5; // Shift acceleration
    this.flySlowMultiplier = 0.3; // Ctrl precision slow

    this.keys = {};
    this._saved = { yaw: 0, pitch: 0.45, dist: 12 };

    this._origin = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._clearance = 1.6;
    this._skin = 0.7;
    this._anchorH = 1.35; // anchor look above feet

    if (this.cam.parent) this.cam.parent.remove(this.cam);
    this.cam.matrixAutoUpdate = true;
    this.cam.up.set(0, 1, 0);

    this._bind();
    this._flyUI();
    console.log('[CameraRig] Initialized (L2 orbit + UE5 flycam)');
  }

  _flyUI() {
    this.flyHint = document.createElement('div');
    this.flyHint.id = 'ps-fly-cam-hint';
    this.flyHint.style.cssText =
      'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:1000;' +
      'background:rgba(10,18,28,0.88);color:#8ad4ff;border:1px solid #2a5a88;padding:6px 14px;border-radius:8px;' +
      'font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;display:none;pointer-events:none;' +
      'box-shadow:0 4px 18px rgba(0,0,0,0.6);backdrop-filter:blur(6px);text-align:center;';
    this.flyHint.innerHTML = '✈️ <b>Полет (UE5):</b> Зажмите <b>ПКМ</b> + <b>WASD</b>/<b>QE</b> · <b>Shift</b> — ускорение · <b>Колесо мыши</b> — скорость';
    document.body.appendChild(this.flyHint);
  }

  _showSpeedToast() {
    if (!this.flyHint) return;
    this.flyHint.innerHTML = `✈️ <b>Скорость полета:</b> <span style="color:#ffcc44;font-weight:bold;">${Math.round(this.flySpeed)} м/с</span> · <b>Shift:</b> ${Math.round(this.flySpeed * this.flyBoostMultiplier)} м/с`;
    this.flyHint.style.display = 'block';
    if (this._speedToastTimer) clearTimeout(this._speedToastTimer);
    this._speedToastTimer = setTimeout(() => {
      if (this.flyMode && this.flyHint) {
        this.flyHint.innerHTML = `✈️ <b>Полет (UE5):</b> Зажмите <b>ПКМ</b> + <b>WASD</b>/<b>QE</b> · <b>Shift</b> — ускорение (${Math.round(this.flySpeed * this.flyBoostMultiplier)} м/с)`;
      }
    }, 1800);
  }

  _isBrushModeActive() {
    try {
      if (typeof window === 'undefined') return false;
      if (typeof window.isEditorBrushActive === 'function' && window.isEditorBrushActive()) return true;
      var ed = (window.game && window.game.editor) || window.editor;
      if (!ed || !ed.enabled) return false;
      if (ed.foliageIsDrawing || ed.paintIsDrawing) return true;
      var m = ed.editorMode || ed.workspaceMode;
      if (m === 'foliage' || m === 'paint' || ed.drawFoliageMode || ed.drawPaintMode) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  addOrbitRotation(deltaYaw, deltaPitch) {
    if (this._isBrushModeActive()) return;
    if (this.flyMode) {
      this.flyYaw -= deltaYaw;
      this.flyPitch = Math.max(-1.52, Math.min(1.52, this.flyPitch - deltaPitch));
    } else {
      this.yaw -= deltaYaw;
      this.pitch = Math.max(-0.95, Math.min(1.25, this.pitch + deltaPitch));
    }
  }

  addZoom(deltaDist) {
    if (this.flyMode) {
      var cp = Math.cos(this.flyPitch);
      var sp = Math.sin(this.flyPitch);
      var cy = Math.cos(this.flyYaw);
      var sy = Math.sin(this.flyYaw);
      var fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp).normalize();
      this.flyPos.addScaledVector(fwd, -deltaDist * 0.5);
      return;
    }
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist + deltaDist));
  }

  toggleFlyMode(force) {
    this.flyMode = force !== undefined ? !!force : !this.flyMode;
    this._drag = false;
    this._rmbDown = false;
    this._buttons = 0;
    if (this.flyMode) {
      this._saved = { yaw: this.yaw, pitch: this.pitch, dist: this.dist };
      if (this.cam) {
        this.flyPos.copy(this.cam.position);
        var dir = new THREE.Vector3();
        this.cam.getWorldDirection(dir);
        this.flyYaw = Math.atan2(-dir.x, -dir.z);
        this.flyPitch = Math.asin(Math.max(-0.999, Math.min(0.999, dir.y)));
      } else if (window.game && window.game.player) {
        var p = window.game.player.mesh.position;
        this.flyPos.set(p.x, p.y + 15, p.z + 25);
      }
      if (this.flyHint) {
        this.flyHint.innerHTML = `✈️ <b>Полет (UE5):</b> Зажмите <b>ПКМ</b> + <b>WASD</b>/<b>QE</b> · <b>Shift</b> — ускорение · Скорость: <b>${Math.round(this.flySpeed)} м/с</b>`;
        this.flyHint.style.display = 'block';
      }
    } else {
      this.yaw = this._saved.yaw;
      this.pitch = this._saved.pitch;
      this.dist = this._saved.dist;
      if (this.flyHint) this.flyHint.style.display = 'none';
    }
  }

  _bind() {
    var self = this;
    function canvasEl() {
      return (window.game && window.game.renderer && window.game.renderer.domElement) || null;
    }
    function isUiInteractive(target) {
      if (!target) return false;
      var tag = (target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.closest && target.closest(
        '#inventory-window, #skill-bar, #skills-window, .l2-skill-slot, .l2-inv-slot, ' +
        '#l2cm-root, .l2cm-slot, .l2-inv-window, #char-menu-window, #trade-window, ' +
        '#npc-dialog, #craft-window, #map-window, #chat-input, .modal, .l2-dialog, ' +
        '#editor-inspector-panel, #scene-editor-panel, .l2-context-menu, ' +
        '#editor-engine-layout, .ed-floating-window, .editor-modal, .ed-modal-backdrop, ' +
        '#editor-left-dock, #editor-right-dock, #editor-bottom-dock, #editor-top-toolbar, ' +
        '.ed-dock-panel, .ed-panel-body, .ed-cb-body, .ed-cb-asset-grid, .ed-cb-folders, ' +
        '.ed-tree-container, #ed-outliner-tree, .ed-floating-body, #ed-foliage-window, ' +
        '#props-library-modal, #props-history-modal, #props-import-modal, #custom-asset-modal, ' +
        '.editor-panel, .editor-window'
      )) {
        if (target.closest && target.closest('#editor-viewport-container')) {
          return false;
        }
        return true;
      }
      return false;
    }
    function onCanvas(e) {
      var c = canvasEl();
      if (!c) return true;
      if (isUiInteractive(e.target)) return false;
      return true;
    }

    window.addEventListener('mousedown', function (e) {
      if (self._isBrushModeActive() && !e.altKey) {
        self._drag = false;
        self._rmbDown = false;
        return;
      }
      if (e.button === 2) {
        self._rmbDown = true;
        self._buttons |= 2;
      }
      if (e.button === 1) {
        self._buttons |= 4;
      }
      if (e.button !== 2 && e.button !== 1) return;
      if (isUiInteractive(e.target)) return;
      self._drag = true;
      self._lx = e.clientX;
      self._ly = e.clientY;
    }, true);

    window.addEventListener('mouseup', function (e) {
      if (e.button === 2) {
        self._rmbDown = false;
        self._buttons &= ~2;
      }
      if (e.button === 1) {
        self._buttons &= ~4;
      }
      if ((e.buttons & 2) === 0 && (e.buttons & 4) === 0) {
        self._drag = false;
        self._rmbDown = false;
      }
    }, true);

    window.addEventListener('blur', function () {
      self._drag = false;
      self._rmbDown = false;
      self._buttons = 0;
      self.keys = {};
    });

    window.addEventListener('mousemove', function (e) {
      if (self._isBrushModeActive() && !e.altKey) {
        self._drag = false;
        self._rmbDown = false;
        return;
      }

      // Sync RMB state with current mouse buttons mask
      if ((e.buttons & 2) !== 0) {
        self._rmbDown = true;
        self._buttons |= 2;
        if (!self._drag) {
          self._drag = true;
          self._lx = e.clientX;
          self._ly = e.clientY;
        }
      } else {
        self._rmbDown = false;
        self._buttons &= ~2;
      }

      if (!self._drag && !self._rmbDown) return;
      if ((e.buttons & 2) === 0 && (e.buttons & 4) === 0) {
        self._drag = false;
        self._rmbDown = false;
        return;
      }

      var dx = e.clientX - self._lx;
      var dy = e.clientY - self._ly;

      if (self.flyMode) {
        // UE5 Flycam mouselook: mouse left/right -> yaw, mouse up/down -> pitch
        self.flyYaw -= dx * 0.0035;
        self.flyPitch = Math.max(-1.52, Math.min(1.52, self.flyPitch - dy * 0.0035));
      } else {
        // L2 orbit mode around player: pitch can go negative to look up at the sky
        self.yaw -= dx * 0.0055;
        self.pitch = Math.max(-0.95, Math.min(1.25, self.pitch + dy * 0.004));
      }

      self._lx = e.clientX;
      self._ly = e.clientY;
    }, true);

    window.addEventListener('wheel', function (e) {
      if (!onCanvas(e)) return;
      e.preventDefault();

      if (self.flyMode) {
        // If holding RMB: scroll adjusts flight speed multiplier (UE5 feature)
        if (self._rmbDown || (e.buttons & 2) !== 0) {
          var factor = e.deltaY < 0 ? 1.25 : 0.8;
          self.flySpeed = Math.max(4, Math.min(200, self.flySpeed * factor));
          self._showSpeedToast();
          return;
        }

        // If RMB not held: wheel smoothly dollies camera forward/backward along viewing line
        var cp = Math.cos(self.flyPitch);
        var sp = Math.sin(self.flyPitch);
        var cy = Math.cos(self.flyYaw);
        var sy = Math.sin(self.flyYaw);
        var fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp).normalize();
        var step = -Math.sign(e.deltaY) * Math.max(3, self.flySpeed * 0.35);
        self.flyPos.addScaledVector(fwd, step);
        return;
      }

      var step = 0.02;
      self.dist = Math.max(self.minDist, Math.min(self.maxDist, self.dist + e.deltaY * step));
    }, { passive: false, capture: true });

    window.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    }, true);

    function _mapFlyKey(code, key) {
      var k = (key || '').toLowerCase();
      var c = code || '';
      if (c === 'KeyW' || k === 'w' || k === 'ц') return 'KeyW';
      if (c === 'KeyA' || k === 'a' || k === 'ф') return 'KeyA';
      if (c === 'KeyS' || k === 's' || k === 'ы') return 'KeyS';
      if (c === 'KeyD' || k === 'd' || k === 'в') return 'KeyD';
      if (c === 'KeyQ' || k === 'q' || k === 'й') return 'KeyQ';
      if (c === 'KeyE' || k === 'e' || k === 'у') return 'KeyE';
      if (c === 'Space' || k === ' ') return 'Space';
      if (c === 'ArrowUp' || k === 'arrowup') return 'ArrowUp';
      if (c === 'ArrowDown' || k === 'arrowdown') return 'ArrowDown';
      if (c === 'ArrowLeft' || k === 'arrowleft') return 'ArrowLeft';
      if (c === 'ArrowRight' || k === 'arrowright') return 'ArrowRight';
      if (c === 'ShiftLeft' || c === 'ShiftRight' || k === 'shift') return 'ShiftLeft';
      if (c === 'ControlLeft' || c === 'ControlRight' || k === 'control') return 'ControlLeft';
      return c;
    }

    window.addEventListener('keydown', function (e) {
      if (document.activeElement && document.activeElement.id === 'chat-input') return;
      if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'SELECT')) return;
      if (e.code) self.keys[e.code] = true;
      var flyCode = _mapFlyKey(e.code, e.key);
      if (flyCode) self.keys[flyCode] = true;
      if (e.code === 'F3' && e.shiftKey) {
        self.toggleFlyMode();
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', function (e) {
      if (e.code) self.keys[e.code] = false;
      var flyCode = _mapFlyKey(e.code, e.key);
      if (flyCode) self.keys[flyCode] = false;
    });

    window.addEventListener('blur', function () {
      self.keys = {};
    });
  }

  _clipFortDist(ax, ay, az, wantDist) {
    var VF = window.VillageFort;
    if (!VF || typeof VF.hitsBarrier !== 'function') return wantDist;
    var p = this._orbitPoint(ax, ay, az, wantDist);
    if (!VF.hitsBarrier(ax, az, p.x, p.z)) return wantDist;
    var lo = this.minDist * 0.55, hi = wantDist, iter, mid, q;
    for (iter = 0; iter < 6; iter++) {
      mid = (lo + hi) * 0.5;
      q = this._orbitPoint(ax, ay, az, mid);
      if (VF.hitsBarrier(ax, az, q.x, q.z)) hi = mid;
      else lo = mid;
    }
    return Math.max(this.minDist * 0.55, lo - 0.2);
  }

  _clipWallsDist(ax, ay, az, wantDist) {
    var W = window.Walls;
    if (!W || typeof W.hitsBarrier !== 'function') return wantDist;
    var p = this._orbitPoint(ax, ay, az, wantDist);
    if (!W.hitsBarrier(ax, az, p.x, p.z)) return wantDist;
    var lo = this.minDist * 0.55, hi = wantDist, iter, mid, q;
    for (iter = 0; iter < 6; iter++) {
      mid = (lo + hi) * 0.5;
      q = this._orbitPoint(ax, ay, az, mid);
      if (W.hitsBarrier(ax, az, q.x, q.z)) hi = mid;
      else lo = mid;
    }
    return Math.max(this.minDist * 0.55, lo - 0.2);
  }

  _clipPropsDist(ax, ay, az, wantDist) {
    var PC = window.PropsCollision;
    if (!PC || typeof PC.hitsPropXZ !== 'function') return wantDist;
    var p = this._orbitPoint(ax, ay, az, wantDist);
    if (!PC.hitsPropXZ(ax, az, p.x, p.z, ay)) return wantDist;
    var lo = this.minDist * 0.55, hi = wantDist, iter, mid, q;
    for (iter = 0; iter < 6; iter++) {
      mid = (lo + hi) * 0.5;
      q = this._orbitPoint(ax, ay, az, mid);
      if (PC.hitsPropXZ(ax, az, q.x, q.z, ay)) hi = mid;
      else lo = mid;
    }
    return Math.max(this.minDist * 0.55, lo - 0.35);
  }

  _orbitPoint(ax, ay, az, dist) {
    var cp = Math.cos(this.pitch);
    var sp = Math.sin(this.pitch);
    var sy = Math.sin(this.yaw);
    var cy = Math.cos(this.yaw);
    return {
      x: ax + sy * dist * cp,
      y: ay + dist * sp,
      z: az + cy * dist * cp
    };
  }

  _fitDistance(ax, ay, az, wantDist) {
    var d = wantDist;
    var minD = this.minDist * 0.55;
    if (d < minD) d = minD;

    // 1. Быстрая проверка стен деревни (VillageFort)
    d = this._clipFortDist(ax, ay, az, d);

    // 2. Быстрая проверка внешних стен (Walls)
    d = this._clipWallsDist(ax, ay, az, d);

    // 3. Быстрая математическая проверка домов, лавок, строений и пропсов (PropsCollision)
    d = this._clipPropsDist(ax, ay, az, d);

    if (d < minD) d = minD;
    if (d > wantDist) d = wantDist;
    return d;
  }

  update(delta, playerPos) {
    if (!this.cam) return;

    if (this.cam.parent) this.cam.parent.remove(this.cam);
    this.cam.up.set(0, 1, 0);

    if (this.flyMode) {
      var dt = Math.min(0.05, delta || 0.016);
      var isBoost = !!(this.keys.ShiftLeft || this.keys.ShiftRight);
      var isSlow = !!(this.keys.ControlLeft || this.keys.ControlRight || this.keys.AltLeft || this.keys.AltRight);
      var currentSpeed = this.flySpeed;
      if (isBoost) currentSpeed *= this.flyBoostMultiplier;
      else if (isSlow) currentSpeed *= this.flySlowMultiplier;

      var moveDist = currentSpeed * dt;

      var cp = Math.cos(this.flyPitch);
      var sp = Math.sin(this.flyPitch);
      var cy = Math.cos(this.flyYaw);
      var sy = Math.sin(this.flyYaw);

      // UE5 3D Forward vector (moves exactly in direction camera is facing)
      var fwd = new THREE.Vector3(-sy * cp, sp, -cy * cp).normalize();
      // Strafe right vector (horizontal plane)
      var right = new THREE.Vector3(cy, 0, -sy).normalize();
      // World vertical up vector
      var up = new THREE.Vector3(0, 1, 0);

      // In UE5: WASD/QE flight is active strictly when Right Mouse Button (RMB) is held down (and not drawing with brush unless Alt is held)
      var isFlightActive = this.flyMode && (!this._isBrushModeActive() || !!(this.keys.AltLeft || this.keys.AltRight)) && !!(this._rmbDown || (this._buttons & 2) !== 0 || (this._drag && (this._buttons & 2) !== 0));

      if (isFlightActive) {
        if (this.keys.KeyW) this.flyPos.addScaledVector(fwd, moveDist);
        if (this.keys.KeyS) this.flyPos.addScaledVector(fwd, -moveDist);
        if (this.keys.KeyD) this.flyPos.addScaledVector(right, moveDist);
        if (this.keys.KeyA) this.flyPos.addScaledVector(right, -moveDist);
        if (this.keys.KeyE || this.keys.Space) this.flyPos.addScaledVector(up, moveDist);
        if (this.keys.KeyQ) this.flyPos.addScaledVector(up, -moveDist);
      }

      // Arrow keys can navigate even without RMB for accessibility
      if (this.keys.ArrowUp) this.flyPos.addScaledVector(fwd, moveDist);
      if (this.keys.ArrowDown) this.flyPos.addScaledVector(fwd, -moveDist);
      if (this.keys.ArrowRight) this.flyPos.addScaledVector(right, moveDist);
      if (this.keys.ArrowLeft) this.flyPos.addScaledVector(right, -moveDist);

      this.cam.position.copy(this.flyPos);
      this.cam.lookAt(this.flyPos.x + fwd.x, this.flyPos.y + fwd.y, this.flyPos.z + fwd.z);
      this.cam.updateMatrixWorld(true);
      return;
    }

    if (!playerPos) return;

    var ax = playerPos.x;
    var ay = playerPos.y + this._anchorH;
    var az = playerPos.z;
    if (!isFinite(ax) || !isFinite(ay) || !isFinite(az)) return;

    var useD = this._fitDistance(ax, ay, az, this.dist);
    var p = this._orbitPoint(ax, ay, az, useD);

    // Скольжение по рельефу (Terrain Gliding): камера плавно лежит чуть выше травы/земли
    var minGroundClearance = 0.45;
    var T = window.Terrain;
    if (T && typeof T.heightAt === 'function') {
      var gh = T.heightAt(p.x, p.z);
      var groundMinY = gh + minGroundClearance;
      if (p.y < groundMinY) {
        p.y = groundMinY;
      }
    }

    // Sky Look: при отрицательном pitch точка прицеливания поднимается в небо
    var targetY = ay;
    if (this.pitch < 0) {
      var skyFactor = -this.pitch; // 0..0.95
      targetY += skyFactor * (useD * 0.95 + 3.0);
    }

    this.cam.position.set(p.x, p.y, p.z);
    this.cam.lookAt(ax, targetY, az);
    this.cam.updateMatrixWorld(true);
  }
}
window.CameraRig = CameraRig;
