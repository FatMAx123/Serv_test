// ============================================================
// TOUCH-CONTROLS.JS — Мобильное управление для Project Steam: Origins
// Виртуальный динамический джойстик + тач-камера (Swipe/Pinch) + Боевой кластер
// ============================================================

class TouchControls {
  constructor(game) {
    this.game = game;
    this.activeMobileBar = 0; // 0..2 (страница панели умений)
    this.maxMobileBars = 3;
    this.enabled = false;

    // Joystick state
    this.joyPointerId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyCurrent = { x: 0, y: 0 };
    this.joyVector = { x: 0, y: 0 };
    this.joyMaxRadius = 48; // px
    this.isJoyActive = false;

    // Camera touch state
    this.camPointerIds = [];
    this.camPointers = new Map(); // id -> { x, y }
    this.camPinchDist = 0;
    this.camTapStart = null; // { x, y, time }

    // DOM Elements
    this.container = null;
    this.joyZone = null;
    this.joyBase = null;
    this.joyThumb = null;
    this.actionCluster = null;
    this.skillArc = null;

    this.init();
  }

  init() {
    this._createDOM();
    this._bindEvents();
    this._initMode();
    this.updateSkillSlots();
  }

  _initMode() {
    let mode = 'auto';
    try {
      var saved = localStorage.getItem('ps_mobile_controls');
      if (saved) mode = saved;
    } catch (_) {}

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (mode === 'always' || (mode === 'auto' && isTouch)) {
      this.setEnabled(true);
    } else {
      this.setEnabled(false);
    }
  }

  setEnabled(val) {
    this.enabled = !!val;
    if (this.container) {
      if (this.enabled) {
        this.container.classList.remove('hidden');
        document.body.classList.add('ps-touch-active');
      } else {
        this.container.classList.add('hidden');
        document.body.classList.remove('ps-touch-active');
        this._resetJoystick();
      }
    }
  }

  _createDOM() {
    let root = document.getElementById('mobile-controls');
    if (!root) {
      root = document.createElement('div');
      root.id = 'mobile-controls';
      root.className = 'mobile-controls hidden';
      document.body.appendChild(root);
    }
    this.container = root;

    root.innerHTML = `
      <!-- Левая зона джойстика (только в нижнем левом углу) -->
      <div id="joystick-zone" class="joystick-zone">
        <div id="joystick-base" class="joystick-base">
          <div class="joystick-ring"></div>
          <div id="joystick-thumb" class="joystick-thumb"></div>
        </div>
      </div>

      <!-- Правый боевой кластер мобильного управления -->
      <div id="mobile-action-cluster" class="mobile-action-cluster">
        <div id="mobile-skill-arc" class="mobile-skill-arc"></div>

        <!-- Центральная большая кнопка: Атака / Действие -->
        <button type="button" id="btn-mobile-attack" class="mobile-btn btn-attack" title="Атака / Действие">
          <div class="btn-glow"></div>
          <img src="assets/hud/actions/attack.webp" alt="Attack" class="btn-icon">
          <span class="btn-label">АТАКА</span>
        </button>

        <!-- Вспомогательные кнопки быстрого доступа -->
        <button type="button" id="btn-mobile-target" class="mobile-btn btn-sub btn-target" title="Следующая цель [Next Target]">
          <img src="assets/hud/actions/next.webp" alt="Target" class="btn-icon">
          <span class="btn-sub-label">ЦЕЛЬ</span>
        </button>

        <button type="button" id="btn-mobile-pickup" class="mobile-btn btn-sub btn-pickup" title="Подобрать лут">
          <img src="assets/hud/actions/pickup.webp" alt="Pickup" class="btn-icon">
          <span class="btn-sub-label">ЛУТ</span>
        </button>

        <button type="button" id="btn-mobile-rest" class="mobile-btn btn-sub btn-rest" title="Сесть / Встать (Отдых)">
          <img src="assets/hud/actions/sit.webp" alt="Rest" class="btn-icon">
          <span class="btn-sub-label">ОТДЫХ</span>
        </button>

        <button type="button" id="btn-mobile-bar-switch" class="mobile-btn btn-sub btn-bar-switch" title="Смена панели умений (1 / 2 / 3)">
          <span class="bar-switch-prefix">РЯД</span>
          <span id="mobile-bar-num" class="bar-num">1</span>
        </button>
      </div>
    `;

    this.joyZone = document.getElementById('joystick-zone');
    this.joyBase = document.getElementById('joystick-base');
    this.joyThumb = document.getElementById('joystick-thumb');
    this.actionCluster = document.getElementById('mobile-action-cluster');
    this.skillArc = document.getElementById('mobile-skill-arc');
  }

  _bindEvents() {
    const self = this;

    // 1. Управление джойстиком (только в левом нижнем углу #joystick-zone)
    if (this.joyZone) {
      this.joyZone.addEventListener('pointerdown', (e) => {
        if (!self.enabled) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (self.joyPointerId !== null) return;

        self.joyPointerId = e.pointerId;
        self.isJoyActive = true;

        const rect = self.joyZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        self.joyOrigin = { x: centerX, y: centerY };
        self.joyCurrent = { x: e.clientX, y: e.clientY };
        self.joyVector = { x: 0, y: 0 };

        if (self.joyBase) {
          self.joyBase.classList.add('active');
        }
        self._updateJoystickVector();

        try { self.joyZone.setPointerCapture(e.pointerId); } catch (_) {}
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });

      this.joyZone.addEventListener('pointermove', (e) => {
        if (!self.isJoyActive || e.pointerId !== self.joyPointerId) return;
        self.joyCurrent = { x: e.clientX, y: e.clientY };
        self._updateJoystickVector();
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });

      const joyEnd = (e) => {
        if (e.pointerId !== self.joyPointerId) return;
        self._resetJoystick();
        e.preventDefault();
      };

      this.joyZone.addEventListener('pointerup', joyEnd);
      this.joyZone.addEventListener('pointercancel', joyEnd);
    }

    // 2. Управление камерой и тапом по миру (Все остальное пространство)
    const canvas = (this.game && this.game.renderer && this.game.renderer.domElement) || window;
    
    window.addEventListener('pointerdown', (e) => {
      // Игнорируем мышь (управление мышью на ПК обрабатывается camera3d.js)
      if (e.pointerType === 'mouse') return;

      // Игнорируем, если открыт редактор сцены или активна кисть
      if (typeof window !== 'undefined') {
        if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
        var ed = (window.game && window.game.editor) || window.editor;
        if (ed && ed.enabled) return;
      }

      // Игнорируем клики по элементам UI и кнопкам
      const target = e.target;
      if (target && target.closest('#joystick-zone, #mobile-action-cluster, #l2-chat, #player-status, #target-status, #minimap, #l2-sys-menu, #l2-skillbars, .l2-modal, #inventory-window, #skills-window, #npc-window, #craft-window, #dungeon-entry, #death-overlay, #fps-monitor, #l2-settings-panel, #big-map-overlay')) {
        return;
      }

      self.camPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, startTime: performance.now() });
      if (self.camPointers.size === 1) {
        self.camTapStart = { x: e.clientX, y: e.clientY, time: performance.now() };
      } else if (self.camPointers.size === 2) {
        const pts = Array.from(self.camPointers.values());
        self.camPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!self.camPointers.has(e.pointerId)) return;

      if (typeof window !== 'undefined') {
        if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
        var ed = (window.game && window.game.editor) || window.editor;
        if (ed && ed.enabled) return;
      }

      const prev = self.camPointers.get(e.pointerId);
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      self.camPointers.set(e.pointerId, { ...prev, x: e.clientX, y: e.clientY });

      if (self.camPointers.size === 1) {
        // 1-пальцевое вращение камеры
        const rig = self.game && self.game.cameraRig;
        if (rig && typeof rig.addOrbitRotation === 'function') {
          rig.addOrbitRotation(dx * 0.0055, dy * 0.004);
        }
      } else if (self.camPointers.size === 2) {
        // 2-пальцевый зум (Pinch-to-zoom)
        const pts = Array.from(self.camPointers.values());
        const newDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const delta = newDist - self.camPinchDist;
        self.camPinchDist = newDist;
        const rig = self.game && self.game.cameraRig;
        if (rig && typeof rig.addZoom === 'function') {
          rig.addZoom(-delta * 0.035);
        }
      }
    }, { passive: true });

    const onCamEnd = (e) => {
      if (e.pointerType === 'mouse') return;
      if (!self.camPointers.has(e.pointerId)) return;
      const info = self.camPointers.get(e.pointerId);
      self.camPointers.delete(e.pointerId);

      // Проверка на одиночный быстрый тап (Tap-to-Target / Tap-to-Move)
      if (info && self.camPointers.size === 0 && self.camTapStart) {
        const duration = performance.now() - info.startTime;
        const dist = Math.hypot(info.x - info.startX, info.y - info.startY);
        if (duration < 280 && dist < 12) {
          // Вызываем стандартный raycast-клик по миру
          if (self.game && typeof self.game.onMouseClick === 'function') {
            self.game.onMouseClick({ clientX: info.x, clientY: info.y, shiftKey: false, target: canvas });
          }
        }
      }
      self.camTapStart = null;
    };

    window.addEventListener('pointerup', onCamEnd, { passive: true });
    window.addEventListener('pointercancel', onCamEnd, { passive: true });

    // 3. Биндинг кнопок боевого кластера
    const btnAttack = document.getElementById('btn-mobile-attack');
    if (btnAttack) {
      btnAttack.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        self._triggerPrimaryAction();
      });
    }

    const btnTarget = document.getElementById('btn-mobile-target');
    if (btnTarget) {
      btnTarget.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        self._triggerNextTarget();
      });
    }

    const btnPickup = document.getElementById('btn-mobile-pickup');
    if (btnPickup) {
      btnPickup.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        self._triggerPickup();
      });
    }

    const btnRest = document.getElementById('btn-mobile-rest');
    if (btnRest) {
      btnRest.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (self.game && self.game.player) {
          self.game.player.toggleSit();
        }
      });
    }

    const btnBarSwitch = document.getElementById('btn-mobile-bar-switch');
    if (btnBarSwitch) {
      btnBarSwitch.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        self.cycleMobileBar();
      });
    }
  }

  _updateJoystickVector() {
    const dx = this.joyCurrent.x - this.joyOrigin.x;
    const dy = this.joyCurrent.y - this.joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(dist, this.joyMaxRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;

    if (this.joyThumb) {
      this.joyThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }

    // Нормализованный вектор от -1 до +1
    // normX: >0 вправо, <0 влево
    // normY: >0 вниз, <0 вверх
    const normX = clampedDist > 6 ? (thumbX / this.joyMaxRadius) : 0;
    const normY = clampedDist > 6 ? (thumbY / this.joyMaxRadius) : 0;
    this.joyVector = { x: normX, y: normY };

    // Трансформируем вектор джойстика в мировое направление XZ относительно yaw камеры:
    // Нажатие ВВЕРХ (normY < 0) -> движение вперед от камеры (-sin(yaw), -cos(yaw))
    // Нажатие ВНИЗ (normY > 0) -> движение назад к камере (+sin(yaw), +cos(yaw))
    // Нажатие ВПРАВО (normX > 0) -> движение вправо (cos(yaw), -sin(yaw))
    // Нажатие ВЛЕВО (normX < 0) -> движение влево (-cos(yaw), sin(yaw))
    if (this.game && this.game.player) {
      if (normX === 0 && normY === 0) {
        this.game.player.stopContinuousMovement();
      } else {
        const yaw = (this.game.cameraRig && this.game.cameraRig.yaw != null) ? this.game.cameraRig.yaw : 0;
        const worldX = Math.sin(yaw) * normY + Math.cos(yaw) * normX;
        const worldZ = Math.cos(yaw) * normY - Math.sin(yaw) * normX;
        this.game.player.setContinuousMovement(worldX, worldZ);
      }
    }
  }

  _resetJoystick() {
    this.isJoyActive = false;
    this.joyPointerId = null;
    this.joyVector = { x: 0, y: 0 };
    if (this.joyBase) {
      this.joyBase.classList.remove('active');
    }
    if (this.joyThumb) {
      this.joyThumb.style.transform = 'translate(0px, 0px)';
    }
    if (this.game && this.game.player) {
      this.game.player.stopContinuousMovement();
    }
  }

  cycleMobileBar() {
    const skillsUI = this.game && this.game.skillsUI;
    if (skillsUI) {
      if (!skillsUI.bars) skillsUI.bars = [];
      while (skillsUI.bars.length < 3) {
        skillsUI.bars.push(new Array(skillsUI.slotsPerRow || 10).fill(null));
      }
      skillsUI.rowCount = Math.max(skillsUI.rowCount || 1, 3);
    }
    this.activeMobileBar = (this.activeMobileBar + 1) % 3;
    const numEl = document.getElementById('mobile-bar-num');
    if (numEl) numEl.textContent = String(this.activeMobileBar + 1);
    this.updateSkillSlots();
    if (this.game && this.game.addChatMessage) {
      this.game.addChatMessage('Панель быстрых слотов: ряд ' + (this.activeMobileBar + 1), 'system');
    }
  }

  /**
   * Обновление слотов умений веера мобильного кластера
   */
  updateSkillSlots() {
    if (!this.skillArc) return;
    const skillsUI = this.game && this.game.skillsUI;
    if (skillsUI && skillsUI.bars) {
      const isBar0Empty = !skillsUI.bars[0] || skillsUI.bars[0].every(s => !s);
      if (isBar0Empty && typeof skillsUI.autoFillSkillBar === 'function' && skillsUI.skillManager) {
        const learned = skillsUI.skillManager.getLearnedSkills && skillsUI.skillManager.getLearnedSkills();
        if (learned && learned.length > 0) {
          skillsUI.autoFillSkillBar();
        }
      }
    }

    const row = this.activeMobileBar;
    const slotsCount = 4; // 4 основных слота на мобильном веере

    this.skillArc.innerHTML = '';
    for (let i = 0; i < slotsCount; i++) {
      const slotBtn = document.createElement('button');
      slotBtn.type = 'button';
      slotBtn.className = 'mobile-skill-slot';
      slotBtn.dataset.index = String(i);
      slotBtn.dataset.row = String(row);

      let iconHtml = `<span class="empty-num">${i + 1}</span>`;
      let name = '';

      if (skillsUI && skillsUI.bars && skillsUI.bars[row]) {
        const id = skillsUI.bars[row][i];
        if (id) {
          if (skillsUI._isActionSlot(id)) {
            const actionId = skillsUI._actionIdFromSlot(id);
            const act = skillsUI._resolveAction(actionId);
            name = act ? act.name : actionId;
            const icon = act ? act.icon : '';
            if (icon && (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
              iconHtml = `<img src="${icon}" alt="${name}" class="skill-icon-img" draggable="false">`;
            } else if (icon) {
              iconHtml = `<span class="empty-num" style="font-size:18px;">${icon}</span>`;
            }
          } else {
            const tpl = (skillsUI._resolveSkillTpl && skillsUI._resolveSkillTpl(id)) ||
                        (window.SKILL_DATABASE && (window.SKILL_DATABASE[id] || Object.values(window.SKILL_DATABASE).find(s => s && s.id === id))) || null;
            name = tpl ? (tpl.nameRu || tpl.name || id) : id;
            const icon = (tpl && tpl.icon) || (window.L2IconAssets && window.L2IconAssets.getIconForSkill ? window.L2IconAssets.getIconForSkill(id, tpl) : '');
            if (icon && (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
              iconHtml = `<img src="${icon}" alt="${name}" class="skill-icon-img" draggable="false">`;
            } else if (icon) {
              iconHtml = `<span class="empty-num" style="font-size:18px;">${icon}</span>`;
            }
          }
        }
      }

      slotBtn.innerHTML = `
        <div class="skill-icon-wrap">
          ${iconHtml}
          <div class="mobile-cooldown-overlay" id="mobile-cd-${row}-${i}"></div>
        </div>
      `;

      // Tap-to-Equip & Click handling
      slotBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (window.touchSelectedSkill) {
          const item = window.touchSelectedSkill;
          if (item.type === 'action') {
            skillsUI.assignAction(row, i, item.id);
          } else {
            skillsUI.assignSkill(row, i, item.id);
          }
          this.updateSkillSlots();
          if (window.game && window.game.addChatMessage) {
            window.game.addChatMessage('«' + item.name + '» назначено в слот ' + (i + 1), 'system');
          }
          // Clear selection
          window.touchSelectedSkill = null;
          document.querySelectorAll('.l2cm-slot.selected-for-assign').forEach(el => el.classList.remove('selected-for-assign'));
          document.querySelectorAll('.slot-assign-ready').forEach(el => el.classList.remove('slot-assign-ready'));
          return;
        }

        if (skillsUI && typeof skillsUI.useSkillBarSlot === 'function') {
          skillsUI.useSkillBarSlot(i, row);
        }
      });

      // Desktop HTML5 drag & drop support on mobile arc
      slotBtn.addEventListener('dragover', (e) => {
        e.preventDefault();
        slotBtn.classList.add('slot-drag-hover');
      });
      slotBtn.addEventListener('dragleave', () => {
        slotBtn.classList.remove('slot-drag-hover');
      });
      slotBtn.addEventListener('drop', (e) => {
        e.preventDefault();
        slotBtn.classList.remove('slot-drag-hover');
        const actId = e.dataTransfer.getData('text/action-id');
        const skId = e.dataTransfer.getData('text/skill-id');
        const plain = e.dataTransfer.getData('text/plain') || '';

        if (actId) skillsUI.assignAction(row, i, actId);
        else if (skId) skillsUI.assignSkill(row, i, skId);
        else if (plain.indexOf('act:') === 0) skillsUI.assignAction(row, i, plain.slice(4));
        else if (plain) skillsUI.assignSkill(row, i, plain);

        this.updateSkillSlots();
      });

      this.skillArc.appendChild(slotBtn);
    }
  }

  /**
   * Обновление оверлеев кулдауна на мобильных кнопках
   */
  updateCooldowns() {
    if (!this.enabled || !this.skillArc) return;
    const skillsUI = this.game && this.game.skillsUI;
    const sm = this.game && this.game.player && this.game.player.skillManager;
    if (!skillsUI || !sm || !skillsUI.bars) return;

    const row = this.activeMobileBar;
    const bar = skillsUI.bars[row];
    if (!bar) return;

    for (let i = 0; i < 4; i++) {
      const cdEl = document.getElementById(`mobile-cd-${row}-${i}`);
      if (!cdEl) continue;
      const skillId = bar[i];
      if (!skillId || skillsUI._isActionSlot(skillId)) {
        cdEl.style.height = '0%';
        continue;
      }
      const cd = (sm.cooldowns && sm.cooldowns[skillId]) || 0;
      const maxCd = (sm.maxCooldowns && sm.maxCooldowns[skillId]) || 1;
      if (cd > 0) {
        const pct = Math.min(100, Math.max(0, (cd / maxCd) * 100));
        cdEl.style.height = pct + '%';
      } else {
        cdEl.style.height = '0%';
      }
    }
  }

  _triggerPrimaryAction() {
    if (!this.game || !this.game.player) return;
    const p = this.game.player;
    if (p.isDead || p.hp <= 0) return;

    const target = p.target;
    if (target) {
      if (target.type === 'npc' || target.npc) {
        // Взаимодействие с NPC
        const np = target.mesh ? target.mesh.position : (target.npc && target.npc.mesh ? target.npc.mesh.position : null);
        if (np) {
          const dist = Math.hypot(p.mesh.position.x - np.x, p.mesh.position.z - np.z);
          if (dist <= 4.2 && this.game.npcManager) {
            this.game.npcManager.interactWithNPC(target.npc || target);
          } else {
            p.moveTo(np);
            this.game._pendingNpcInteract = target.npc || target;
          }
        }
      } else if (target.mid != null || target.type === 'm') {
        // Атака моба
        p.startAutoAttack(target);
      } else if (target.pid != null || target.type === 'p') {
        // Следование за игроком
        p.startFollowing(target);
      }
    } else {
      // Нет цели -> автопоиск ближайшего моба и атака
      this._triggerNextTarget(true);
    }
  }

  _triggerNextTarget(autoAttackOnFound) {
    if (!this.game || !this.game.player || !this.game.net) return;
    const p = this.game.player;
    if (p.isDead || p.hp <= 0) return;

    const px = p.mesh.position.x;
    const pz = p.mesh.position.z;
    let closestMob = null;
    let minDist = 35; // макс. радиус поиска 35м

    for (const [, r] of this.game.net.remote) {
      if (!r || r.type !== 'm' || !r.mesh || r.isDying || r.dead) continue;
      const d = Math.hypot(r.x - px, r.z - pz);
      if (d < minDist) {
        minDist = d;
        closestMob = r;
      }
    }

    if (closestMob) {
      const mobName = this.game.net.mobDisplayName
        ? this.game.net.mobDisplayName(closestMob.mobId, closestMob.name)
        : (closestMob.name || closestMob.mobId);
      const targetObj = {
        mid: closestMob.mid,
        mesh: closestMob.mesh,
        hp: (!closestMob.isDying && (closestMob.hp == null || closestMob.hp <= 0)) ? 1 : closestMob.hp,
        maxHp: closestMob.maxHp || 1,
        name: mobName,
        level: closestMob.level || 1,
        mobId: closestMob.mobId,
        boss: !!closestMob.boss,
        named: !!closestMob.named,
        champion: !!closestMob.champion,
        role: closestMob.role || null,
        rank: closestMob.rank || null
      };

      p.stopFollowing();
      p.setTarget(targetObj);
      if (this.game.ui) this.game.ui.showTargetStatus(targetObj);

      if (autoAttackOnFound) {
        p.startAutoAttack(targetObj);
      }
    } else {
      if (this.game.ui) this.game.ui.addChatMessage('Поблизости нет целей.', 'system');
    }
  }

  _triggerPickup() {
    if (!this.game || !this.game.lootManager || !this.game.player) return;
    const p = this.game.player;
    if (p.isDead || p.hp <= 0) return;

    const px = p.mesh.position.x;
    const pz = p.mesh.position.z;
    const lm = this.game.lootManager;

    // Поиск ближайшего дропа в радиусе 5м
    if (lm.groundLoot && lm.groundLoot.size) {
      let nearestLid = null;
      let minD = 5.0;
      for (const [lid, loot] of lm.groundLoot) {
        if (!loot) continue;
        const lx = loot.x != null ? loot.x : (loot.mesh ? loot.mesh.position.x : 0);
        const lz = loot.z != null ? loot.z : (loot.mesh ? loot.mesh.position.z : 0);
        const d = Math.hypot(lx - px, lz - pz);
        if (d < minD) {
          minD = d;
          nearestLid = lid;
        }
      }
      if (nearestLid != null) {
        lm.requestPickupByLid(nearestLid);
        return;
      }
    }

    // Если нет конкретного lid, шлем общий запрос
    if (typeof lm.requestPickupNearby === 'function') {
      lm.requestPickupNearby(px, pz);
    }
  }

  update() {
    this.updateCooldowns();
  }
}

window.TouchControls = TouchControls;
