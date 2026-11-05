// ============================================
// PROJECT STEAM: ORIGINS - SKILLS-UI.JS
// Панель скиллов, окно изучения, книга умений
// ============================================

class SkillsUI {
    constructor(skillManager) {
        this.skillManager = skillManager;
        this.slotsPerRow = 10;       // 1–9, 0  (как L2 F1 bar)
        this.maxRows = 4;           // основная + 3 доп. ряда
        this.rowCount = 1;
        // bars[row][slot] = skillId | null
        this.bars = [new Array(this.slotsPerRow).fill(null)];
        this.isOpen = false;
        // legacy alias
        this.skillBarSlots = this.slotsPerRow;
        this.skillBar = this.bars[0];

        this.createSkillBar();
        this.createCastBar();
        this.createSkillWindow();
        this.injectStyles();
        this.bindEvents();
        this.autoFillSkillBar();
    }

    /** Полоска каста (C1 cast bar) над skill bar */
    createCastBar() {
        if (document.getElementById('cast-bar')) return;
        const el = document.createElement('div');
        el.id = 'cast-bar';
        el.className = 'cast-bar hidden';
        el.innerHTML =
            '<div class="cast-bar-name" id="cast-bar-name"></div>' +
            '<div class="cast-bar-track"><div class="cast-bar-fill" id="cast-bar-fill"></div></div>' +
            '<div class="cast-bar-time" id="cast-bar-time"></div>';
        document.body.appendChild(el);
        this.castBar = el;
    }

    updateCastBar() {
        const sm = this.skillManager;
        const bar = this.castBar || document.getElementById('cast-bar');
        if (!bar || !sm) return;
        const prog = sm.getCastProgress && sm.getCastProgress();
        if (!prog) {
            bar.classList.add('hidden');
            return;
        }
        bar.classList.remove('hidden');
        const nameEl = document.getElementById('cast-bar-name');
        const fillEl = document.getElementById('cast-bar-fill');
        const timeEl = document.getElementById('cast-bar-time');
        if (nameEl) nameEl.textContent = prog.name || '';
        if (fillEl) fillEl.style.width = Math.round(prog.progress * 100) + '%';
        if (timeEl) timeEl.textContent = prog.remaining.toFixed(1) + 'с';
    }

    update() {
        this.updateCastBar();
        if (typeof this.updateCooldowns === 'function') this.updateCooldowns();
        if (window.game && window.game.touchControls && typeof window.game.touchControls.updateCooldowns === 'function') {
            window.game.touchControls.updateCooldowns();
        }
    }

    /** Ключ хоткея: 1..9, 0 для 10-го слота; доп. ряды — F1..F10 / без хоткея на UI */
    _keyLabel(row, slot) {
        if (row === 0) return slot === 9 ? '0' : String(slot + 1);
        return 'F' + (slot === 9 ? '10' : String(slot + 1));
    }

    createSkillBar() {
        const stack = document.getElementById('skill-bars-stack');
        if (!stack) {
            // fallback: старый #skill-bar
            const bar = document.getElementById('skill-bar');
            if (!bar) return;
            bar.innerHTML = '';
            bar.classList.remove('hidden');
            for (let i = 0; i < this.slotsPerRow; i++) {
                const slot = document.createElement('div');
                slot.className = 'skill-slot l2-skill-slot';
                slot.dataset.row = '0';
                slot.dataset.index = String(i);
                slot.innerHTML =
                    '<span class="skill-key">' + this._keyLabel(0, i) + '</span>' +
                    '<span class="skill-icon"></span>' +
                    '<div class="skill-cooldown"></div>';
                bar.appendChild(slot);
            }
            return;
        }
        this._rebuildRowsDOM();
        const addBtn = document.getElementById('skillbar-add');
        const remBtn = document.getElementById('skillbar-remove');
        if (addBtn) addBtn.onclick = () => this.addSkillBarRow();
        if (remBtn) remBtn.onclick = () => this.removeSkillBarRow();
    }

    _rebuildRowsDOM() {
        const stack = document.getElementById('skill-bars-stack');
        if (!stack) return;
        stack.innerHTML = '';
        for (let r = 0; r < this.rowCount; r++) {
            if (!this.bars[r]) this.bars[r] = new Array(this.slotsPerRow).fill(null);
            const row = document.createElement('div');
            row.className = 'l2-skillbar-row';
            row.dataset.row = String(r);
            for (let i = 0; i < this.slotsPerRow; i++) {
                const slot = document.createElement('div');
                slot.className = 'l2-skill-slot skill-slot empty';
                slot.dataset.row = String(r);
                slot.dataset.index = String(i);
                slot.innerHTML =
                    '<span class="skill-key">' + this._keyLabel(r, i) + '</span>' +
                    '<span class="skill-icon"></span>' +
                    '<div class="skill-cooldown"></div>';
                slot.addEventListener('click', () => {
                    if (window.touchSelectedSkill) {
                        const item = window.touchSelectedSkill;
                        if (item.type === 'action') this.assignAction(r, i, item.id);
                        else this.assignSkill(r, i, item.id);
                        window.touchSelectedSkill = null;
                        document.querySelectorAll('.l2cm-slot.selected-for-assign').forEach(el => el.classList.remove('selected-for-assign'));
                        document.querySelectorAll('.slot-assign-ready').forEach(el => el.classList.remove('slot-assign-ready'));
                        return;
                    }
                    this.useSkillBarSlot(i, r);
                });
                slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('drag-over'); });
                slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.classList.remove('drag-over');
                    const actId = e.dataTransfer.getData('text/action-id');
                    const skillId = e.dataTransfer.getData('text/skill-id');
                    const itemUid = e.dataTransfer.getData('text/item-uid');
                    const itemId = e.dataTransfer.getData('text/item-id');
                    const plain = e.dataTransfer.getData('text/plain') || '';

                    if (actId) {
                        this.assignAction(r, i, actId);
                    } else if (skillId) {
                        this.assignSkill(r, i, skillId);
                    } else if (itemId || itemUid || plain.indexOf('item:') === 0) {
                        const tid = itemId || (plain.indexOf('item:') === 0 ? plain.slice(5) : plain);
                        this.assignItem(r, i, tid);
                    } else if (plain.indexOf('act:') === 0) {
                        this.assignAction(r, i, plain.slice(4));
                    } else if (plain) {
                        if (this._resolveItem(plain) || (window.game && window.game.inventory && window.game.inventory.findItemByTemplate && window.game.inventory.findItemByTemplate(plain))) {
                            this.assignItem(r, i, plain);
                        } else {
                            this.assignSkill(r, i, plain);
                        }
                    }
                });
                const clearSlotHandler = (e) => {
                    if (e) {
                        e.preventDefault();
                        e.stopPropagation();
                    }
                    this.assignSkill(r, i, null);
                };
                slot.addEventListener('contextmenu', clearSlotHandler);
                slot.addEventListener('mouseup', (e) => {
                    if (e.button === 2) clearSlotHandler(e);
                });
                row.appendChild(slot);
            }
            stack.appendChild(row);
        }
        this.skillBar = this.bars[0];
        this.renderSkillBar();
    }

    addSkillBarRow() {
        if (this.rowCount >= this.maxRows) {
            if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Максимум панелей умений: ' + this.maxRows, 'system');
            }
            return;
        }
        this.rowCount++;
        this.bars.push(new Array(this.slotsPerRow).fill(null));
        this._rebuildRowsDOM();
    }

    removeSkillBarRow() {
        if (this.rowCount <= 1) return;
        this.rowCount--;
        this.bars.pop();
        this._rebuildRowsDOM();
    }

    assignSkill(row, slot, skillId) {
        if (!this.bars[row]) return;
        this.bars[row][slot] = skillId || null;
        if (row === 0) this.skillBar = this.bars[0];
        this.renderSkillBar();
    }

    /** Положить действие L2 на skill bar (prefix act:). */
    assignAction(row, slot, actionId) {
        if (!this.bars[row]) return;
        if (!actionId) {
            this.bars[row][slot] = null;
        } else {
            const prefix = (window.L2_ACTION_PREFIX != null) ? window.L2_ACTION_PREFIX : 'act:';
            this.bars[row][slot] = prefix + actionId;
        }
        if (row === 0) this.skillBar = this.bars[0];
        this.renderSkillBar();
    }

    _isActionSlot(id) {
        if (!id || typeof id !== 'string') return false;
        const prefix = (window.L2_ACTION_PREFIX != null) ? window.L2_ACTION_PREFIX : 'act:';
        return id.indexOf(prefix) === 0;
    }

    _actionIdFromSlot(id) {
        const prefix = (window.L2_ACTION_PREFIX != null) ? window.L2_ACTION_PREFIX : 'act:';
        return id.slice(prefix.length);
    }

    _resolveAction(actionId) {
        if (window.L2_ACTIONS && window.L2_ACTIONS[actionId]) return window.L2_ACTIONS[actionId];
        return null;
    }

    /** Положить предмет на панель быстрого доступа (быстрый юз, prefix item:). */
    assignItem(row, slot, itemId) {
        if (!this.bars[row]) return;
        if (!itemId) {
            this.bars[row][slot] = null;
        } else {
            const cleanId = String(itemId).indexOf('item:') === 0 ? itemId.slice(5) : itemId;
            this.bars[row][slot] = 'item:' + cleanId;
        }
        if (row === 0) this.skillBar = this.bars[0];
        this.renderSkillBar();
    }

    _isItemSlot(id) {
        if (!id || typeof id !== 'string') return false;
        return id.indexOf('item:') === 0;
    }

    _itemIdFromSlot(id) {
        if (!id || typeof id !== 'string') return '';
        return id.indexOf('item:') === 0 ? id.slice(5) : id;
    }

    _resolveItem(itemId) {
        if (!itemId) return null;
        const tid = String(itemId).toLowerCase();
        if (typeof window !== 'undefined' && typeof window.ensureItemTemplate === 'function') {
            const t = window.ensureItemTemplate(tid);
            if (t) return t;
        }
        if (typeof window !== 'undefined' && window.ITEM_DATABASE && window.ITEM_DATABASE[tid]) {
            return window.ITEM_DATABASE[tid];
        }
        if (typeof window !== 'undefined' && window.ITEM_DB && typeof window.ITEM_DB.get === 'function') {
            return window.ITEM_DB.get(tid);
        }
        return null;
    }
    
    createSkillWindow() {
        this.window = document.createElement('div');
        this.window.id = 'skills-window';
        this.window.innerHTML = `
            <div class="skills-header">
                <h2>УМЕНИЯ</h2>
                <div class="skills-class" id="skills-class-name">Оператор</div>
                <button id="skills-close" class="skills-btn">✕</button>
            </div>
            
            <div class="skills-body">
                <div class="skills-tabs">
                    <button class="skills-tab active" data-tab="active">Активные</button>
                    <button class="skills-tab" data-tab="passive">Пассивные</button>
                    <button class="skills-tab" data-tab="learn">Изучение</button>
                </div>
                
                <div id="skills-tab-active" class="skills-tab-content active">
                    <div id="active-skills-list" class="skills-list"></div>
                </div>
                
                <div id="skills-tab-passive" class="skills-tab-content">
                    <div id="passive-skills-list" class="skills-list"></div>
                </div>
                
                <div id="skills-tab-learn" class="skills-tab-content">
                    <div id="learn-skills-list" class="skills-list"></div>
                </div>
            </div>
        `;
        document.body.appendChild(this.window);
    }
    
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Cast bar (C1) */
            .cast-bar {
                position: fixed;
                left: 50%;
                bottom: calc(var(--hud-bottom, 8px) + var(--slot-size, 42px) * 2 + 16px);
                transform: translateX(-50%);
                width: min(320px, 65vw);
                z-index: 350;
                pointer-events: none;
                text-align: center;
            }
            .cast-bar.hidden { display: none !important; }
            .cast-bar-name {
                color: #e8c36a;
                font-size: clamp(10.5px, 1.2vw, 13px);
                text-shadow: 0 1px 2px #000;
                margin-bottom: 2px;
            }
            .cast-bar-track {
                height: clamp(10px, 1.4vh, 14px);
                background: rgba(0,0,0,0.75);
                border: 1px solid #6a5a3a;
                border-radius: 3px;
                overflow: hidden;
            }
            .cast-bar-fill {
                height: 100%;
                width: 0%;
                background: linear-gradient(90deg, #2a6a9a, #4ac0ff);
                transition: width 0.05s linear;
            }
            .cast-bar-time {
                color: #aaa;
                font-size: clamp(9px, 1vw, 11px);
                margin-top: 2px;
            }

            /* Панель скиллов (fallback) */
            .skill-slot {
                position: relative;
                width: var(--slot-size, 42px);
                height: var(--slot-size, 42px);
                background: rgba(50, 50, 50, 0.9);
                border: 2px solid #888;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                cursor: pointer;
                transition: all 0.2s;
                overflow: hidden;
                box-sizing: border-box;
            }
            
            .skill-slot:hover {
                border-color: #ffaa00;
                transform: scale(1.05);
            }
            
            .skill-slot .skill-key {
                position: absolute;
                top: 1px;
                left: 3px;
                font-size: clamp(7px, 0.8vw, 9px);
                color: #888;
            }
            
            .skill-slot .skill-icon {
                font-size: clamp(14px, 1.8vw, 20px);
            }
            
            .skill-slot .skill-cooldown {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 0%;
                background: rgba(0, 0, 0, 0.7);
                transition: height 0.1s linear;
            }
            
            .skill-slot.on-cooldown {
                opacity: 0.6;
            }
            
            .skill-slot.empty {
                opacity: 0.3;
            }
            
            /* Окно умений */
            #skills-window {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(600px, 94vw);
                max-height: 86vh;
                overflow-y: auto;
                box-sizing: border-box;
                max-height: 85vh;
                background: rgba(20, 20, 25, 0.95);
                border: 2px solid #555;
                border-radius: 12px;
                z-index: 500;
                display: none;
                flex-direction: column;
                font-family: 'Courier New', monospace;
                color: #ccc;
            }
            
            #skills-window.open {
                display: flex;
            }
            
            .skills-header {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                border-bottom: 1px solid #444;
            }
            
            .skills-header h2 {
                color: #ffaa44;
                margin: 0;
                font-size: 18px;
            }
            
            .skills-class {
                color: #44ff44;
                font-size: 13px;
            }
            
            .skills-btn {
                background: #333;
                border: 1px solid #666;
                color: #fff;
                padding: 6px 12px;
                border-radius: 6px;
                cursor: pointer;
                margin-left: auto;
            }
            
            .skills-tabs {
                display: flex;
                border-bottom: 1px solid #444;
            }
            
            .skills-tab {
                flex: 1;
                padding: 10px;
                background: transparent;
                border: none;
                color: #888;
                cursor: pointer;
                font-family: inherit;
            }
            
            .skills-tab.active {
                color: #ffaa44;
                border-bottom: 2px solid #ffaa44;
            }
            
            .skills-tab-content {
                display: none;
                padding: 16px;
                overflow-y: auto;
                max-height: 60vh;
            }
            
            .skills-tab-content.active {
                display: block;
            }
            
            .skills-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .skill-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .skill-item:hover {
                border-color: #ffaa44;
            }
            
            .skill-item.learned {
                border-color: #44ff44;
            }
            
            .skill-item.maxed {
                border-color: #ffdd44;
            }
            
            .skill-item .skill-item-icon {
                font-size: 28px;
                width: 40px;
                height: 40px;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            .skill-item .skill-item-icon .skill-icon-img {
                width: 36px;
                height: 36px;
                object-fit: contain;
                border-radius: 3px;
                image-rendering: auto;
            }
            
            .skill-item .skill-item-info {
                flex: 1;
            }
            
            .skill-item .skill-item-name {
                font-size: 13px;
                font-weight: bold;
                color: #fff;
            }
            
            .skill-item .skill-item-desc {
                font-size: 11px;
                color: #888;
                margin-top: 2px;
            }
            
            .skill-item .skill-item-meta {
                font-size: 10px;
                color: #666;
                margin-top: 4px;
            }
            
            .skill-item .skill-item-level {
                font-size: 12px;
                color: #ffaa44;
                text-align: right;
                min-width: 60px;
            }
            
            .skill-item .skill-item-cost {
                font-size: 11px;
                color: #4488ff;
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Открытие по K — только если нет единого меню персонажа.
        // Хоткеи 1–0 / Ctrl·Alt ряды — ТОЛЬКО main.js (иначе double-fire → «повтор» срыв каста).
        window.addEventListener('keydown', (e) => {
            if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
            if ((e.key === 'k' || e.key === 'л') && !(window.game && window.game.charMenu)) {
                this.toggleWindow();
            }
            if (e.key === 'Escape') {
                this.closeWindow();
            }
        });

        const closeBtn = document.getElementById('skills-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeWindow());

        document.querySelectorAll('.skills-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    }
    
    toggleWindow() {
        this.isOpen ? this.closeWindow() : this.openWindow();
    }
    
    openWindow() {
        this.isOpen = true;
        this.window.classList.add('open');
        this.render();
    }
    
    closeWindow() {
        this.isOpen = false;
        this.window.classList.remove('open');
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.skills-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === tabName);
        });
        document.querySelectorAll('.skills-tab-content').forEach(c => {
            c.classList.toggle('active', c.id === `skills-tab-${tabName}`);
        });
        this.render();
    }
    
    render() {
        const nameEl = document.getElementById('skills-class-name');
        if (nameEl) {
            const cls = this.skillManager.player.playerClass || 'operator';
            let nm = cls;
            if (window.CLASS_SYSTEM) nm = window.CLASS_SYSTEM.getClassName(cls);
            else if (window.PLAYER_CLASSES) {
                const k = Object.keys(PLAYER_CLASSES).find(x => PLAYER_CLASSES[x].id === cls);
                nm = k ? PLAYER_CLASSES[k].name : cls;
            }
            nameEl.textContent = nm;
        }
        this.renderActiveSkills();
        this.renderPassiveSkills();
        this.renderLearnSkills();
    }
    
    renderActiveSkills() {
        const list = document.getElementById('active-skills-list');
        list.innerHTML = '';
        
        const skills = this.skillManager.getLearnedSkills()
            .filter(s => s.type === SKILL_TYPES.ACTIVE || s.type === SKILL_TYPES.TOGGLE);
        
        skills.forEach(skill => {
            const lvl = skill.currentLevel || 1;
            const player = this.skillManager && this.skillManager.player;
            const desc = skill.description || '';
            const meta = typeof formatSkillStatsLine === 'function'
                ? formatSkillStatsLine(skill, lvl, player, false)
                : ('Пар: ' + (skill.energyCost || 0) +
                    (skill.range != null ? ' · Радиус: ' + skill.range + ' м' : ''));
            const item = document.createElement('div');
            item.className = 'skill-item learned';
            item.draggable = true;
            item.innerHTML = `
                <div class="skill-item-icon">${this._skillIconHtml(skill.icon, 36)}</div>
                <div class="skill-item-info">
                    <div class="skill-item-name">${skill.name}</div>
                    <div class="skill-item-desc">${desc}</div>
                    <div class="skill-item-meta">${meta || '—'}</div>
                </div>
                <div class="skill-item-level">Ур. ${skill.currentLevel}/${skill.maxLevel}</div>
            `;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/skill-id', skill.id);
            });
            item.addEventListener('dblclick', () => {
                // поставить в первый пустой слот основного бара
                const row = this.bars[0];
                const empty = row.findIndex(x => !x);
                if (empty >= 0) this.assignSkill(0, empty, skill.id);
            });
            list.appendChild(item);
        });

        if (skills.length === 0) {
            list.innerHTML = '<p style="color: #666;">Нет активных умений.</p>';
        }
    }
    
    renderPassiveSkills() {
        const list = document.getElementById('passive-skills-list');
        list.innerHTML = '';
        
        const skills = this.skillManager.getLearnedSkills()
            .filter(s => s.type === SKILL_TYPES.PASSIVE);
        
        skills.forEach(skill => {
            const item = document.createElement('div');
            item.className = 'skill-item learned';
            item.innerHTML = `
                <div class="skill-item-icon">${this._skillIconHtml(skill.icon, 36)}</div>
                <div class="skill-item-info">
                    <div class="skill-item-name">${skill.name}</div>
                    <div class="skill-item-desc">${skill.description}</div>
                </div>
                <div class="skill-item-level">Ур. ${skill.currentLevel}/${skill.maxLevel}</div>
            `;
            list.appendChild(item);
        });
        
        if (skills.length === 0) {
            list.innerHTML = '<p style="color: #666;">Нет пассивных умений.</p>';
        }
    }
    
    renderLearnSkills() {
        const list = document.getElementById('learn-skills-list');
        list.innerHTML = '';
        
        const available = this.skillManager.getAvailableSkills();
        
        const spNow = this.skillManager._getSp
            ? this.skillManager._getSp()
            : ((window.game && window.game.player && window.game.player.levelSystem)
                ? window.game.player.levelSystem.sp : 0);

        const spHeader = document.createElement('div');
        spHeader.className = 'skill-sp-header';
        spHeader.style.cssText = 'padding:8px 10px;margin-bottom:8px;color:#e8c36a;font-size:13px;border-bottom:1px solid #444;';
        spHeader.textContent = 'SP: ' + (spNow || 0).toLocaleString() + '  ·  клик = изучить/улучшить за SP';
        list.appendChild(spHeader);

        available.forEach(skill => {
            const learned = this.skillManager.learnedSkills[skill.id];
            const currentLevel = learned ? learned.level : 0;
            const isMaxed = currentLevel >= skill.maxLevel;
            const nextLevel = currentLevel + 1;
            const cost = this.skillManager.getUpgradeSpCost
                ? this.skillManager.getUpgradeSpCost(skill.id)
                : (typeof skillSpCost === 'function' ? skillSpCost(skill, nextLevel) : 0);
            const canAfford = isMaxed || cost <= spNow;
            const player = this.skillManager && this.skillManager.player;

            // Device lock: resonator / nano level required to LEARN (not only cast)
            let deviceLock = null; // { label, have, need }
            if (!isMaxed && player && typeof player.skillDeviceGate === 'function') {
                const gate = player.skillDeviceGate(skill);
                if (gate === 'resonator') {
                    const need = typeof player.resonatorReqForSkill === 'function'
                        ? player.resonatorReqForSkill(skill, nextLevel) : 1;
                    const have = typeof player.getCircuitLevel === 'function'
                        ? player.getCircuitLevel() : 0;
                    const has = typeof player.hasCircuitResonatorEquipped === 'function'
                        && player.hasCircuitResonatorEquipped();
                    if (!has || have < need) {
                        deviceLock = {
                            label: 'Контур',
                            have: has ? have : 0,
                            need: need
                        };
                    }
                } else if (gate === 'bracelet') {
                    const need = typeof player.nanoReqForSkill === 'function'
                        ? player.nanoReqForSkill(skill, nextLevel) : 1;
                    const have = typeof player.getNanoLevel === 'function'
                        ? player.getNanoLevel() : 0;
                    const has = typeof player.hasNanoBraceletEquipped === 'function'
                        && player.hasNanoBraceletEquipped();
                    if (!has || have < need) {
                        deviceLock = {
                            label: 'Связь роя',
                            have: has ? have : 0,
                            need: need
                        };
                    }
                } else if (gate === 'compressor') {
                    const has = typeof player.hasCompressorEquipped === 'function'
                        && player.hasCompressorEquipped();
                    if (!has) {
                        deviceLock = {
                            label: 'Паровой нагнетатель (Шея)',
                            have: 0,
                            need: 'надет'
                        };
                    }
                } else if (gate === 'bracers') {
                    const has = typeof player.hasOperatorBracersEquipped === 'function'
                        && player.hasOperatorBracersEquipped();
                    if (!has) {
                        deviceLock = {
                            label: 'Наручи-компенсаторы (Запястье)',
                            have: 0,
                            need: 'надеты'
                        };
                    }
                }
            }
            const locked = !isMaxed && (!canAfford || !!deviceLock);

            const item = document.createElement('div');
            item.className = `skill-item ${isMaxed ? 'maxed' : ''}${locked ? ' locked' : ''}`;
            item.style.opacity = locked ? '0.65' : '1';
            const previewLvl = Math.max(1, currentLevel || 1);
            const statsMeta = (skill.type !== SKILL_TYPES.PASSIVE && typeof formatSkillStatsLine === 'function')
                ? formatSkillStatsLine(skill, previewLvl, player, false)
                : '';
            const needLv = (typeof skillLevelReqForRank === 'function')
                ? skillLevelReqForRank(skill, nextLevel)
                : (skill.levelReq || 1);
            let deviceMeta = '';
            if (deviceLock) {
                if (deviceLock.need === 'надет' || deviceLock.need === 'надеты') {
                    deviceMeta = '<br><span style="color:#f88">Нужен: ' + deviceLock.label + '</span>';
                } else {
                    deviceMeta = '<br><span style="color:#f88">' + deviceLock.label +
                        ' Ур.' + deviceLock.have + ' → нужно Ур.' + deviceLock.need + '</span>';
                }
            }
            item.innerHTML = `
                <div class="skill-item-icon">${this._skillIconHtml(skill.icon, 36)}</div>
                <div class="skill-item-info">
                    <div class="skill-item-name">${skill.name}</div>
                    <div class="skill-item-desc">${skill.description || ''}</div>
                    <div class="skill-item-meta">
                        ${statsMeta ? statsMeta + '<br>' : ''}
                        Требуется: Ур. ${needLv} ·
                        ${skill.type === SKILL_TYPES.PASSIVE ? 'Пассивное' : 'Активное'}
                        ${isMaxed ? '' : ' · <b style="color:#e8c36a">' + cost + ' SP</b>'}
                        ${deviceMeta}
                    </div>
                </div>
                <div class="skill-item-level">
                    ${isMaxed ? 'МАКС' : `Ур. ${currentLevel}/${skill.maxLevel}`}
                </div>
            `;

            if (!isMaxed) {
                item.style.cursor = locked ? 'not-allowed' : 'pointer';
                if (deviceLock) {
                    if (deviceLock.need === 'надет' || deviceLock.need === 'надеты') {
                        item.title = 'Требуется: ' + deviceLock.label;
                    } else {
                        item.title = deviceLock.label + ' Ур.' + deviceLock.have +
                            ' · нужно Ур.' + deviceLock.need + ' (прокачай прибор)';
                    }
                } else {
                    item.title = canAfford
                        ? ('Изучить/улучшить за ' + cost + ' SP')
                        : ('Нужно ' + cost + ' SP (есть ' + spNow + ')');
                }
                item.addEventListener('click', () => {
                    if (deviceLock) {
                        if (window.game && window.game.addChatMessage) {
                            if (deviceLock.need === 'надет' || deviceLock.need === 'надеты') {
                                window.game.addChatMessage(
                                    'Требуется надеть: ' + deviceLock.label + ' для «' + skill.name + '».',
                                    'system'
                                );
                            } else {
                                window.game.addChatMessage(
                                    deviceLock.label + ' Ур.' + deviceLock.have +
                                    ' · нужно Ур.' + deviceLock.need +
                                    ' для «' + skill.name + '».',
                                    'system'
                                );
                            }
                        }
                        return;
                    }
                    const ok = this.skillManager.learnSkill(skill.id);
                    if (ok && window.game && window.game.player && window.game.player.syncFromLevelSystem) {
                        window.game.player.syncFromLevelSystem();
                    }
                    this.render();
                    this.autoFillSkillBar();
                    if (window.game && window.game.charMenu && window.game.charMenu.render) {
                        window.game.charMenu.render();
                    }
                });
            }

            list.appendChild(item);
        });

        if (available.length === 0) {
            list.innerHTML = '<p style="color: #666;">Нет доступных для изучения умений.</p>';
        }
    }
    
    // === ПАНЕЛЬ СКИЛЛОВ (мульти-ряд) ===

    autoFillSkillBar() {
        const activeSkills = this.skillManager.getLearnedSkills()
            .filter(s => s.type === SKILL_TYPES.ACTIVE || s.type === SKILL_TYPES.TOGGLE)
            .slice(0, this.slotsPerRow);

        if (!this.bars[0]) this.bars[0] = new Array(this.slotsPerRow).fill(null);
        this.bars[0] = new Array(this.slotsPerRow).fill(null);
        activeSkills.forEach((skill, i) => {
            if (i < this.slotsPerRow) this.bars[0][i] = skill.id;
        });
        this.skillBar = this.bars[0];
        this.renderSkillBar();
    }

    _resolveSkillTpl(skillId) {
        if (typeof resolveSkill === 'function') return resolveSkill(skillId);
        if (window.SKILL_DATABASE) {
            return SKILL_DATABASE[skillId] ||
                Object.values(SKILL_DATABASE).find(s => s && s.id === skillId) || null;
        }
        return null;
    }

    /** Emoji or image path → HTML for skill icon */
    _skillIconHtml(icon, sizePx) {
        sizePx = sizePx || 28;
        if (icon && typeof icon === 'string' &&
            (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
            return '<img class="skill-icon-img" src="' + icon +
                '" width="' + sizePx + '" height="' + sizePx +
                '" alt="" draggable="false" onerror="this.onerror=null;this.src=\'assets/skills/engineer/eng_weapon_mastery.webp\';">';
        }
        return icon || '⚙️';
    }

    _setSkillIconEl(el, icon, sizePx) {
        if (!el) return;
        sizePx = sizePx || 28;
        if (icon && typeof icon === 'string' &&
            (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
            el.textContent = '';
            el.innerHTML = this._skillIconHtml(icon, sizePx);
        } else {
            el.innerHTML = '';
            el.textContent = icon || '⚙️';
        }
    }

    renderSkillBar() {
        const slots = document.querySelectorAll('.l2-skill-slot, #skill-bar .skill-slot');
        slots.forEach((slot) => {
            const row = parseInt(slot.dataset.row || '0', 10);
            const i = parseInt(slot.dataset.index || '0', 10);
            const entry = (this.bars[row] && this.bars[row][i]) || null;
            const iconEl = slot.querySelector('.skill-icon');
            if (!iconEl) return;

            // no native browser tooltips — only empty title
            slot.removeAttribute('title');

            if (entry) {
                slot.classList.remove('empty');
                if (this._isItemSlot(entry)) {
                    const itemId = this._itemIdFromSlot(entry);
                    const itemTpl = this._resolveItem(itemId);
                    const inv = window.game && window.game.inventory;
                    const count = inv && typeof inv.getItemCount === 'function' ? inv.getItemCount(itemId) : 0;
                    const icon = (itemTpl && itemTpl.icon) || '🧪';
                    this._setSkillIconEl(iconEl, icon, 28);
                    
                    let countBadge = slot.querySelector('.item-hotbar-count');
                    if (!countBadge) {
                        countBadge = document.createElement('span');
                        countBadge.className = 'item-hotbar-count';
                        countBadge.style.cssText = 'position:absolute;right:2px;bottom:2px;font-size:10px;font-weight:bold;color:#ffea70;text-shadow:0 0 2px #000, 1px 1px 2px #000;pointer-events:none;z-index:2;line-height:1;';
                        slot.appendChild(countBadge);
                    }
                    countBadge.textContent = count > 1 ? count : (count === 0 ? '0' : '');
                    if (count === 0) {
                        slot.classList.add('out-of-stock');
                        slot.style.opacity = '0.45';
                    } else {
                        slot.classList.remove('out-of-stock');
                        slot.style.opacity = '1.0';
                    }
                    slot.dataset.tipName = (itemTpl && itemTpl.name) || itemId;
                    slot.dataset.tipDesc = (itemTpl && itemTpl.description ? itemTpl.description + ' · ' : '') + 'Быстрый юз (в сумке: ' + count + ' шт.)';
                } else if (this._isActionSlot(entry)) {
                    const countBadge = slot.querySelector('.item-hotbar-count');
                    if (countBadge) countBadge.remove();
                    slot.classList.remove('out-of-stock');
                    slot.style.opacity = '1.0';
                    const actId = this._actionIdFromSlot(entry);
                    const act = this._resolveAction(actId);
                    this._setSkillIconEl(iconEl, (act && act.icon) || '⚙️', 28);
                    slot.dataset.tipName = act ? act.name : actId;
                    slot.dataset.tipDesc = act ? (act.desc || 'Действие') : 'Действие';
                } else {
                    const countBadge = slot.querySelector('.item-hotbar-count');
                    if (countBadge) countBadge.remove();
                    slot.classList.remove('out-of-stock');
                    slot.style.opacity = '1.0';
                    const template = this._resolveSkillTpl(entry);
                    this._setSkillIconEl(iconEl, (template && template.icon) || '⚙️', 28);
                    slot.dataset.tipName = template ? template.name : entry;
                    const lvl = (this.skillManager && this.skillManager.learnedSkills &&
                        this.skillManager.learnedSkills[template && template.id])
                        ? this.skillManager.learnedSkills[template.id].level : 1;
                    const epCost = (typeof skillEnergyCost === 'function' && template)
                        ? skillEnergyCost(template, lvl, this.skillManager && this.skillManager.player)
                        : ((template && template.energyCost) || 0);
                    if (template && typeof formatSkillStatsLine === 'function') {
                        slot.dataset.tipDesc = formatSkillStatsLine(
                            template, lvl,
                            this.skillManager && this.skillManager.player,
                            true
                        );
                    } else {
                        slot.dataset.tipDesc = template
                            ? ((template.description || '') +
                                (epCost ? (' Пар: ' + epCost + '.') : '') +
                                (template.range != null ? (' Радиус: ' + template.range + ' м.') : '') +
                                (template.cooldown ? (' Перезарядка: ' + template.cooldown + ' с.') : ''))
                            : entry;
                    }
                }
            } else {
                const countBadge = slot.querySelector('.item-hotbar-count');
                if (countBadge) countBadge.remove();
                slot.classList.remove('out-of-stock');
                slot.style.opacity = '1.0';
                iconEl.innerHTML = '';
                iconEl.textContent = '';
                slot.classList.add('empty');
                slot.dataset.tipName = '';
                slot.dataset.tipDesc = 'Пустой слот · ПКМ очистить · перетащите умение (K), действие (Alt+C) или предмет из инвентаря (I)';
            }
        });
        if (window.game && window.game.touchControls && typeof window.game.touchControls.updateSkillSlots === 'function') {
            window.game.touchControls.updateSkillSlots();
        }
    }

    useSkillBarSlot(index, row) {
        if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
        row = row == null ? 0 : row;
        if (!this.bars[row]) return;
        const entry = this.bars[row][index];
        if (!entry) return;

        // 1. Item on hotbar (быстрый юз)
        if (this._isItemSlot(entry)) {
            const itemId = this._itemIdFromSlot(entry);
            if (window.game && window.game.inventory) {
                const inv = window.game.inventory;
                if (typeof inv.useItemByTemplate === 'function') {
                    inv.useItemByTemplate(itemId);
                } else {
                    const it = inv.findItemByTemplate ? inv.findItemByTemplate(itemId) : null;
                    if (it) {
                        if (it.template && (it.template.type === 'weapon' || it.template.type === 'armor' || it.template.type === 'accessory' || it.template.type === 'title' || it.template.type === 'costume')) {
                            inv.equipItem(it.uid);
                        } else {
                            inv.useItem(it.uid);
                        }
                    } else if (window.game.addChatMessage) {
                        window.game.addChatMessage('Предмет закончился в инвентаре', 'system');
                    }
                }
                if (window.game.inventoryUI && window.game.inventoryUI.isOpen) {
                    window.game.inventoryUI.render();
                }
            }
            this.renderSkillBar();
            return;
        }

        // 2. L2 action on hotbar
        if (this._isActionSlot(entry)) {
            const actId = this._actionIdFromSlot(entry);
            if (window.game && window.game.charMenu && typeof window.game.charMenu._doAction === 'function') {
                window.game.charMenu._doAction(actId);
            } else if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Действие: ' + actId, 'system');
            }
            return;
        }

        // 3. Skill
        this.skillManager.useSkill(entry);
        this.updateCooldowns();
    }

    updateCooldowns() {
        const slots = document.querySelectorAll('.l2-skill-slot, #skill-bar .skill-slot');

        slots.forEach((slot) => {
            const row = parseInt(slot.dataset.row || '0', 10);
            const i = parseInt(slot.dataset.index || '0', 10);
            const skillId = (this.bars[row] && this.bars[row][i]) || null;
            if (!skillId) return;
            // actions and items have no skill CD
            if (this._isActionSlot(skillId) || this._isItemSlot(skillId)) {
                const cdEl = slot.querySelector('.skill-cooldown');
                if (cdEl) cdEl.style.height = '0%';
                slot.classList.remove('on-cooldown');
                return;
            }

            const cooldownEl = slot.querySelector('.skill-cooldown');
            const template = this._resolveSkillTpl(skillId);
            if (!template || !cooldownEl) return;

            if (this.skillManager.isOnCooldown(skillId)) {
                const remaining = this.skillManager.getCooldownRemaining(skillId);
                const cd = template.cooldown || 1;
                const percent = Math.min(100, (remaining / cd) * 100);
                cooldownEl.style.height = percent + '%';
                slot.classList.add('on-cooldown');
            } else {
                cooldownEl.style.height = '0%';
                slot.classList.remove('on-cooldown');
            }
        });
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.SkillsUI = SkillsUI;