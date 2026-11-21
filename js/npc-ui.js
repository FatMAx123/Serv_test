// ============================================
// PROJECT STEAM: ORIGINS - NPC-UI.JS
// Аутентичный интерфейс диалогов и квестов классических MMO
// По образцу референса пользователя (UI оклад + золотые кнопки)
// ============================================

class NPCUI {
    constructor() {
        this.currentNPC = null;
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this._dragState = null;
        this._activeAction = null;

        this.createDOM();
        this.injectStyles();
        this.bindEvents();
        this.initDrag();

        if (window.i18n && window.i18n.subscribe) {
            window.i18n.subscribe(() => {
                if (this.isOpen()) this.renderMainDialogue();
            });
        }
    }

    t(key, params = {}) {
        if (window.i18n && window.i18n.t) {
            return window.i18n.t(key, params);
        }
        return key;
    }

    isOpen() {
        return this.container && this.container.classList.contains('open');
    }

    createDOM() {
        const old = document.getElementById('npc-window');
        if (old) old.remove();
        const oldBox = document.getElementById('dialogue-box');
        if (oldBox) oldBox.remove();

        this.container = document.createElement('div');
        this.container.id = 'npc-window';
        this.container.className = 'l2-ref-dialog-window';
        this.container.innerHTML = `
            <!-- Титлбар для перемещения (крестик закрытия наложен строго на иконку текстуры) -->
            <div class="l2-ref-titlebar" id="npc-titlebar">
                <span class="l2-ref-win-title" id="npc-titlebar-name">${this.t('dialogue').toUpperCase()}</span>
                <button type="button" id="npc-close" class="l2-ref-close" title="${this.t('close_esc')}"></button>
            </div>

            <!-- Верхняя плашка спикера (Портрет + Имя + Титул) -->
            <div class="l2-ref-speaker-card">
                <div class="l2-ref-portrait-frame">
                    <img id="npc-portrait-img" src="assets/npc/gilbert_icon.webp" alt="" />
                </div>
                <div class="l2-ref-speaker-meta">
                    <div class="l2-ref-speaker-name" id="npc-speaker-name">Инспектор Гилберт</div>
                    <div class="l2-ref-speaker-title" id="npc-speaker-title">&lt; Главный Инспектор &gt;</div>
                </div>
            </div>

            <div class="l2-ref-divider"></div>

            <!-- Внутреннее поле контента -->
            <div class="l2-ref-content" id="npc-content-area">
                <!-- Реплика спикера -->
                <div class="l2-ref-speech-box" id="npc-speech-text">
                    "${this.t('welcome_default')}"
                </div>

                <!-- Цель квеста (Objective) -->
                <div class="l2-ref-meta-row hidden" id="npc-objective-block">
                    <span class="l2-ref-meta-label" id="label-objective">${this.t('objective')}</span>
                    <span class="l2-ref-meta-val" id="npc-objective-text"></span>
                </div>

                <!-- Награда за квест (Reward) -->
                <div class="l2-ref-meta-row hidden" id="npc-reward-block">
                    <span class="l2-ref-meta-label" id="label-reward">${this.t('reward')}</span>
                    <span class="l2-ref-meta-val reward-gold" id="npc-reward-text"></span>
                </div>

                <!-- Дополнительные интерактивные ссылки -->
                <div id="npc-extra-actions" class="l2-ref-extra-links hidden"></div>

                <!-- Подразделы -->
                <div id="npc-quests" class="npc-subview hidden">
                    <div class="l2-sub-heading" id="heading-quests">${this.t('available_quests')}</div>
                    <div id="quest-list" class="l2-sub-list"></div>
                </div>

                <div id="npc-shop" class="npc-subview hidden">
                    <div class="l2-sub-heading">
                        <span id="heading-shop">${this.t('shop')}</span>
                        <span class="l2-sub-badge"><span id="label-balance">${this.t('balance')}</span> <b id="shop-currency">0</b> ⚙️</span>
                    </div>
                    <div id="shop-items" class="l2-sub-grid"></div>
                </div>

                <div id="npc-buffs" class="npc-subview hidden">
                    <div class="l2-sub-heading" id="heading-buffs">${this.t('buffs')}:</div>
                    <div id="buff-list" class="l2-sub-list"></div>
                </div>

                <div id="npc-teleports" class="npc-subview hidden">
                    <div class="l2-sub-heading">
                        <span>${this.t('teleport') || 'Телепорт'}</span>
                        <span class="l2-sub-badge">${this.t('balance')} <b id="teleport-currency">0</b> ⚙️</span>
                    </div>
                    <div id="teleport-list" class="l2-sub-list"></div>
                </div>

                <div id="npc-trainer" class="npc-subview hidden">
                    <div class="l2-sub-heading">
                        <span id="heading-trainer">${this.t('trainer')}</span>
                        <span id="trainer-sp" class="l2-sub-badge">${this.t('sp')}: 0</span>
                    </div>
                    <div id="trainer-skills" class="l2-sub-list"></div>
                </div>

                <div id="npc-warehouse" class="npc-subview hidden">
                    <div class="l2-sub-heading">
                        <span id="heading-warehouse">${this.t('warehouse')}</span>
                        <span class="l2-sub-badge">${this.t('balance')} <b id="wh-currency">0</b> ⚙️</span>
                    </div>
                    <div class="l2-wh-cols">
                        <div class="l2-wh-col">
                            <div class="l2-wh-col-title">
                                <span id="wh-bag-title">${this.t('wh_bag')}</span>
                                <span class="l2-wh-slots" id="wh-bag-slots"></span>
                            </div>
                            <div id="wh-bag-list" class="l2-sub-list l2-wh-list"></div>
                        </div>
                        <div class="l2-wh-col">
                            <div class="l2-wh-col-title">
                                <span id="wh-store-title">${this.t('wh_store')}</span>
                                <span class="l2-wh-slots" id="wh-store-slots"></span>
                            </div>
                            <div id="wh-store-list" class="l2-sub-list l2-wh-list"></div>
                        </div>
                    </div>
                    <div class="l2-wh-note" id="wh-note"></div>
                </div>
            </div>

            <!-- Нижняя панель действий с золотыми кнопками из референса -->
            <div class="l2-ref-footer">
                <button type="button" id="npc-btn-accept" class="l2-ref-btn">
                    <span class="l2-ref-btn-text" id="btn-accept-label">${this.t('talk').toUpperCase()}</span>
                </button>
                <button type="button" id="npc-btn-decline" class="l2-ref-btn">
                    <span class="l2-ref-btn-text" id="btn-decline-label">${this.t('leave').toUpperCase()}</span>
                </button>
            </div>
        `;
        document.body.appendChild(this.container);
    }

    injectStyles() {
        const oldStyle = document.getElementById('l2-ref-dialog-styles');
        if (oldStyle) oldStyle.remove();

        const style = document.createElement('style');
        style.id = 'l2-ref-dialog-styles';
        style.textContent = `
            /* ============================================================ */
            /* EXACT REFERENCE CLASSIC MMO DIALOG WINDOW                    */
            /* ============================================================ */
            @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');

            .l2-ref-dialog-window {
                position: fixed;
                top: 48%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(550px, 94vw);
                height: auto;
                min-height: 240px;
                max-height: 90vh;
                z-index: 540;
                display: none;
                flex-direction: column;
                box-sizing: border-box;
                user-select: none;
                background: url('assets/menu/ui/l2_dialog_frame.webp') no-repeat center center;
                background-size: 100% 100%;
                filter: drop-shadow(0 20px 48px rgba(0, 0, 0, 0.95));
                padding: clamp(14px, 2.5vh, 24px) clamp(16px, 3vw, 30px) clamp(18px, 3vh, 32px) clamp(16px, 3vw, 30px);
                font-family: 'Lora', 'Georgia', serif;
            }

            .l2-ref-dialog-window.open {
                display: flex !important;
                animation: l2WinPop 0.15s ease-out;
            }

            @keyframes l2WinPop {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }

            /* Titlebar: опущен вниз для идеального центрирования в верхней плашке оклада */
            .l2-ref-titlebar {
                height: 38px;
                min-height: 38px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                cursor: move;
                margin-top: 8px;
                margin-bottom: 6px;
                padding: 0 44px;
            }

            .l2-ref-win-title {
                font-family: 'Cinzel', serif;
                font-size: 14px;
                font-weight: 700;
                color: #e5c158;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                text-shadow: 0 1px 3px #000, 0 0 12px rgba(229, 193, 88, 0.6);
                margin-top: 4px;
                pointer-events: none;
            }

            /* Кнопка закрытия — опущена и спозиционирована поверх иконки крестика на текстуре */
            .l2-ref-close {
                position: absolute;
                right: 4px;
                top: 6px;
                width: 30px;
                height: 28px;
                background: transparent;
                border: none;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.15s, box-shadow 0.15s;
            }

            .l2-ref-close:hover {
                background: rgba(255, 255, 255, 0.15);
                box-shadow: 0 0 8px rgba(229, 193, 88, 0.4);
            }

            .l2-ref-close:active {
                background: rgba(229, 193, 88, 0.25);
            }

            /* Speaker Card (Portrait + Meta) */
            .l2-ref-speaker-card {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 4px 6px;
            }

            .l2-ref-portrait-frame {
                width: 52px;
                height: 52px;
                border: 2px solid #a6833b;
                box-shadow: inset 0 0 6px #000, 0 2px 6px rgba(0,0,0,0.8);
                background: #14171c;
                border-radius: 4px;
                overflow: hidden;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .l2-ref-portrait-frame img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                display: block;
            }

            .l2-ref-speaker-meta {
                display: flex;
                flex-direction: column;
                gap: 2px;
                overflow: hidden;
            }

            .l2-ref-speaker-name {
                font-family: 'Cinzel', serif;
                font-size: 14px;
                font-weight: 700;
                color: #f3d17c;
                letter-spacing: 0.04em;
                text-shadow: 0 1px 2px #000, 0 0 8px rgba(243, 209, 124, 0.4);
            }

            .l2-ref-speaker-title {
                color: #9ea8b3;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 11.5px;
                text-shadow: 1px 1px 1px #000;
            }

            .l2-ref-divider {
                height: 1px;
                background: linear-gradient(90deg, transparent, #8a703b 30%, #a6833b 50%, #8a703b 70%, transparent);
                margin: 8px 0 10px 0;
            }

            /* Content Area */
            .l2-ref-content {
                flex: 1;
                overflow-y: auto;
                padding-right: 8px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                color: #ded8cb;
                font-size: 13.5px;
                line-height: 1.6;
            }

            .l2-ref-content::-webkit-scrollbar {
                width: 6px;
            }
            .l2-ref-content::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.35);
            }
            .l2-ref-content::-webkit-scrollbar-thumb {
                background: #5a482b;
                border-radius: 2px;
            }

            .l2-ref-speech-box {
                text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.9);
                white-space: pre-line;
            }

            .l2-ref-meta-row {
                display: flex;
                align-items: baseline;
                gap: 6px;
                font-size: 12.5px;
                text-shadow: 1px 1px 1px #000;
            }

            .l2-ref-meta-label {
                font-family: 'Cinzel', serif;
                font-weight: 700;
                color: #cbb070;
                flex-shrink: 0;
            }

            .l2-ref-meta-val {
                color: #d1d5db;
                font-family: 'Segoe UI', Tahoma, sans-serif;
            }

            .l2-ref-meta-val.reward-gold {
                color: #f6d878;
                font-weight: 600;
                text-shadow: 0 0 8px rgba(246, 216, 120, 0.5), 1px 1px 1px #000;
            }

            /* Extra Action Links */
            .l2-ref-extra-links {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-top: 6px;
                border-top: 1px dashed rgba(166, 131, 59, 0.4);
                padding-top: 6px;
            }

            .l2-ref-link {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 6px;
                color: #cbb070;
                text-decoration: none;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.12s;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                text-shadow: 1px 1px 1px #000;
            }

            .l2-ref-link:hover {
                color: #ffe699;
                background: rgba(203, 176, 112, 0.15);
                text-shadow: 0 0 8px rgba(255, 230, 153, 0.7), 1px 1px 0 #000;
            }

            /* Bottom Buttons Panel with Golden Textured Buttons */
            .l2-ref-footer {
                height: clamp(32px, 4.5vh, 42px);
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: clamp(10px, 2vw, 18px);
                margin-top: 4px;
                margin-bottom: 4px;
            }

            .l2-ref-btn {
                width: clamp(110px, 16vw, 148px);
                height: clamp(28px, 3.8vh, 36px);
                border: none;
                outline: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                background: url('assets/menu/ui/l2_gold_button.webp') no-repeat center center;
                background-size: 100% 100%;
                transition: all 0.12s ease-out;
                user-select: none;
                margin-bottom: 0;
                padding: 0 8px;
                box-sizing: border-box;
            }

            .l2-ref-btn:hover {
                filter: brightness(1.16) drop-shadow(0 0 8px rgba(229, 193, 88, 0.6));
                transform: translateY(-1px) scale(1.02);
            }

            .l2-ref-btn:active {
                transform: translateY(1px) scale(0.98);
                filter: brightness(0.92);
            }

            .l2-ref-btn-text {
                font-family: 'Cinzel', 'Georgia', serif;
                font-size: clamp(10px, 1.15vw, 12px);
                font-weight: 700;
                color: #ffffff;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                text-shadow: 0 1px 3px #000, 0 0 8px rgba(255, 215, 120, 0.7);
                margin-top: -1px;
            }

            /* Subviews */
            .npc-subview.hidden { display: none !important; }
            .hidden { display: none !important; }

            .l2-sub-heading {
                font-family: 'Cinzel', serif;
                color: #e5c158;
                font-weight: 700;
                font-size: 12px;
                margin-bottom: 6px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                text-shadow: 1px 1px 1px #000;
            }

            .l2-sub-badge {
                font-family: 'Segoe UI', sans-serif;
                color: #f5d475;
                font-size: 11px;
                font-weight: normal;
            }

            .l2-sub-list {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }

            .l2-sub-item {
                background: rgba(14, 18, 23, 0.85);
                border: 1px solid #3c4856;
                padding: 6px 10px;
                cursor: pointer;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 11.5px;
                transition: all 0.12s;
            }

            .l2-sub-item:hover {
                border-color: #f5d475;
                background: rgba(32, 42, 54, 0.95);
            }

            .l2-sub-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
                gap: 5px;
                background: rgba(10, 14, 18, 0.85);
                border: 1px solid #2e3844;
                padding: 6px;
                max-height: 170px;
                overflow-y: auto;
            }

            .l2-sub-slot {
                width: 42px;
                height: 42px;
                background: rgba(22, 28, 36, 0.9);
                border: 1px solid #445262;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                position: relative;
            }

            .l2-sub-slot:hover {
                border-color: #f5d475;
                background: rgba(44, 56, 72, 0.95);
            }

            .l2-sub-slot-price {
                position: absolute;
                bottom: 1px;
                right: 2px;
                font-size: 9px;
                color: #f5d475;
                font-family: 'Segoe UI', sans-serif;
                text-shadow: 1px 1px 0 #000;
            }

            /* ---- Персональный склад: две колонки «сумка ↔ склад» ---- */
            .l2-wh-cols {
                display: flex;
                gap: 8px;
                align-items: stretch;
            }

            .l2-wh-col {
                flex: 1 1 0;
                min-width: 0;
            }

            .l2-wh-col-title {
                display: flex;
                justify-content: space-between;
                align-items: baseline;
                gap: 6px;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 11px;
                color: #98a2ad;
                margin-bottom: 4px;
            }

            .l2-wh-slots { color: #f5d475; }

            .l2-wh-list {
                background: rgba(10, 14, 18, 0.85);
                border: 1px solid #2e3844;
                padding: 5px;
                gap: 4px;
                max-height: 190px;
                overflow-y: auto;
            }

            .l2-wh-row {
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(14, 18, 23, 0.85);
                border: 1px solid #3c4856;
                padding: 4px 6px;
                cursor: pointer;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 11px;
                color: #cfd8e3;
                transition: all 0.12s;
            }

            .l2-wh-row:hover {
                border-color: #f5d475;
                background: rgba(32, 42, 54, 0.95);
            }

            .l2-wh-row-blocked {
                opacity: 0.45;
                cursor: not-allowed;
            }

            .l2-wh-row-blocked:hover {
                border-color: #3c4856;
                background: rgba(14, 18, 23, 0.85);
            }

            .l2-wh-row-ico { font-size: 15px; line-height: 1; flex: 0 0 auto; }
            .l2-wh-row-ico img { width: 18px; height: 18px; display: block; }

            .l2-wh-row-name {
                flex: 1 1 auto;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .l2-wh-row-count { flex: 0 0 auto; color: #f5d475; }
            .l2-wh-row-plus { flex: 0 0 auto; color: #6ee7b7; }

            .l2-wh-note {
                margin-top: 6px;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                font-size: 10.5px;
                color: #8893a0;
            }
        `;
        document.head.appendChild(style);
    }

    bindEvents() {
        const closeBtn = document.getElementById('npc-close');
        if (closeBtn) closeBtn.addEventListener('click', () => this.close());

        const acceptBtn = document.getElementById('npc-btn-accept');
        if (acceptBtn) acceptBtn.addEventListener('click', () => this.handleAccept());

        const declineBtn = document.getElementById('npc-btn-decline');
        if (declineBtn) declineBtn.addEventListener('click', () => this.handleDecline());
    }

    initDrag() {
        const titlebar = document.getElementById('npc-titlebar');
        if (!titlebar || !this.container) return;
        titlebar.style.cursor = 'grab';

        const onStart = (cx, cy, target) => {
            if (target.closest('#npc-close, button, a')) return;
            titlebar.style.cursor = 'grabbing';
            this.container.style.animation = 'none';
            const rect = this.container.getBoundingClientRect();
            this._dragState = {
                startX: cx,
                startY: cy,
                winX: rect.left,
                winY: rect.top
            };
            this.container.style.transform = 'none';
            this.container.style.left = rect.left + 'px';
            this.container.style.top = rect.top + 'px';
        };

        const onMove = (cx, cy) => {
            if (!this._dragState || !this.container) return;
            const dx = cx - this._dragState.startX;
            const dy = cy - this._dragState.startY;
            const winW = this.container.offsetWidth || 550;
            const winH = this.container.offsetHeight || 480;
            const newX = Math.max(0, Math.min(window.innerWidth - winW, this._dragState.winX + dx));
            const newY = Math.max(0, Math.min(window.innerHeight - winH, this._dragState.winY + dy));
            this.container.style.left = newX + 'px';
            this.container.style.top = newY + 'px';
        };

        const onEnd = () => {
            if (this._dragState) {
                this._dragState = null;
                titlebar.style.cursor = 'grab';
            }
        };

        titlebar.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e.target));
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);

        titlebar.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            if (e.touches && e.touches.length === 1 && this._dragState) onMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        window.addEventListener('touchend', onEnd);
    }

    getPortraitUrl(npc) {
        const t = (npc && npc.template) || {};
        if (t.portrait) return t.portrait;
        if (t.sheet && t.sheet.portrait) return t.sheet.portrait;
        if (t.id === 'gilbert') return 'assets/npc/gilbert_icon.webp';
        return 'assets/npc/gilbert_icon.webp';
    }

    showNPC(npc) {
        this.currentNPC = npc;

        // Позиционирование по центру
        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.left = '50%';
        this.container.style.top = '48%';

        const portraitImg = document.getElementById('npc-portrait-img');
        if (portraitImg) {
            portraitImg.src = this.getPortraitUrl(npc);
        }

        const closeBtn = document.getElementById('npc-close');
        if (closeBtn) {
            closeBtn.title = this.t('close_esc');
        }

        this.container.classList.add('open');
        this.renderMainDialogue();
    }

    showDialogue(dialogueList) {
        if (!dialogueList || !dialogueList.length) return;
        this.currentDialogue = Array.isArray(dialogueList) ? dialogueList : [dialogueList];
        this.dialogueIndex = 0;

        this.container.style.transform = 'translate(-50%, -50%)';
        this.container.style.left = '50%';
        this.container.style.top = '48%';

        const closeBtn = document.getElementById('npc-close');
        if (closeBtn) {
            closeBtn.title = this.t('close_esc');
        }

        this.container.classList.add('open');
        this.renderSequenceDialogue();
    }

    renderSequenceDialogue() {
        this.hideSubviews();

        const titlebarName = document.getElementById('npc-titlebar-name');
        const speakerName = document.getElementById('npc-speaker-name');
        const speakerTitle = document.getElementById('npc-speaker-title');
        const speechText = document.getElementById('npc-speech-text');
        const objBlock = document.getElementById('npc-objective-block');
        const rewBlock = document.getElementById('npc-reward-block');
        const extraLinks = document.getElementById('npc-extra-actions');
        const acceptBtnLabel = document.getElementById('btn-accept-label');
        const declineBtnLabel = document.getElementById('btn-decline-label');

        objBlock.classList.add('hidden');
        rewBlock.classList.add('hidden');
        extraLinks.classList.add('hidden');

        if (titlebarName) titlebarName.textContent = this.t('dialogue').toUpperCase();

        const item = this.currentDialogue ? this.currentDialogue[this.dialogueIndex] : null;
        const speaker = (item && item.speaker) || (this.currentNPC && this.currentNPC.name) || 'NPC';
        const rawText = (item && (item.text || item)) || '';
        const text = this.t(rawText) || rawText;

        if (speakerName) speakerName.textContent = this.t(speaker) || speaker;
        if (speakerTitle) speakerTitle.textContent = '';

        if (speechText) speechText.innerHTML = `"${text}"`;

        const isLast = !this.currentDialogue || this.dialogueIndex >= this.currentDialogue.length - 1;
        if (isLast) {
            acceptBtnLabel.textContent = this.t('close').toUpperCase();
            declineBtnLabel.textContent = this.t('leave').toUpperCase();
            this._activeAction = { type: 'dialogue_close' };
        } else {
            acceptBtnLabel.textContent = this.t('next').toUpperCase();
            declineBtnLabel.textContent = this.t('close').toUpperCase();
            this._activeAction = { type: 'dialogue_next' };
        }
    }

    close() {
        if (this.container) this.container.classList.remove('open');
        this.currentNPC = null;
        this.currentDialogue = null;
        this.dialogueIndex = 0;
        this._whNpcId = null;
        this._whKind = null;
        this._whEquip = null;
        this._whInv = null;
        this._whMap = null;
        this._whInvPlus = null;
        this._whPlus = null;
    }

    renderMainDialogue() {
        this.hideSubviews();

        const npc = this.currentNPC;
        if (!npc) return;
        const t = npc.template || {};

        const titlebarName = document.getElementById('npc-titlebar-name');
        const speakerName = document.getElementById('npc-speaker-name');
        const speakerTitle = document.getElementById('npc-speaker-title');
        const speechText = document.getElementById('npc-speech-text');
        const objBlock = document.getElementById('npc-objective-block');
        const objText = document.getElementById('npc-objective-text');
        const rewBlock = document.getElementById('npc-reward-block');
        const rewText = document.getElementById('npc-reward-text');
        const extraLinks = document.getElementById('npc-extra-actions');

        const acceptBtnLabel = document.getElementById('btn-accept-label');
        const declineBtnLabel = document.getElementById('btn-decline-label');

        document.getElementById('label-objective').textContent = this.t('objective');
        document.getElementById('label-reward').textContent = this.t('reward');

        // Локализованные имя и титул NPC
        const npcNameKey = 'npc_' + (t.id || '') + '_name';
        const localizedName = this.t(npcNameKey) !== npcNameKey
            ? this.t(npcNameKey)
            : (this.t(npc.name) || npc.name || 'NPC');

        const npcTitleKey = 'npc_' + (t.id || '') + '_title';
        const localizedTitle = (t.id && this.t(npcTitleKey) !== npcTitleKey)
            ? this.t(npcTitleKey)
            : (npc.title ? (this.t(npc.title) || npc.title) : '');

        if (speakerName) speakerName.textContent = localizedName;
        if (speakerTitle) speakerTitle.textContent = localizedTitle ? `< ${localizedTitle} >` : '';

        const availableQuests = npc.getAvailableQuests ? npc.getAvailableQuests() : [];
        const completableQuests = npc.getCompletableQuests ? npc.getCompletableQuests() : [];

        if (completableQuests.length > 0) {
            const qId = completableQuests[0];
            const quest = window.game && window.game.questManager ? window.game.questManager.quests[qId] : null;
            const template = quest ? quest.template : (window.QUEST_DATABASE ? window.QUEST_DATABASE[qId] : null);

            const qNameKey = 'quest_' + qId + '_name';
            const localizedQName = this.t(qNameKey) !== qNameKey ? this.t(qNameKey) : (template ? template.name : this.t('quest'));

            if (titlebarName) titlebarName.textContent = this.t('quest').toUpperCase();
            speechText.innerHTML = `"${this.t('quest_done_msg')}"`;
            objBlock.classList.remove('hidden');
            // Прогресс целей — с сервера (quest.progress), а не из localStorage
            let objHtml = `${this.t('complete')}: <b style="color:#34d399;">${localizedQName}</b>`;
            if (template && Array.isArray(template.objectives) && quest && Array.isArray(quest.progress)) {
                objHtml += template.objectives.map((o, i) =>
                    `<div style="color:#8893a0;font-size:10px;">• ${o.description}: ${quest.progress[i] | 0}/${o.count}</div>`
                ).join('');
            }
            objText.innerHTML = objHtml;

            rewBlock.classList.remove('hidden');
            if (template && template.rewards) {
                let rewStr = `${(template.rewards.currency || 0).toLocaleString()} ${this.t('adena')}, ${(template.rewards.exp || 0).toLocaleString()} ${this.t('xp')}.`;
                if (Array.isArray(template.rewards.choices) && template.rewards.choices.length > 0) {
                    rewStr += `<div style="margin-top:6px;font-weight:bold;color:#f59e0b;">Выберите королевскую награду:</div>`;
                    rewStr += `<select id="quest-reward-choice-select" style="width:100%;margin-top:4px;padding:4px;background:#1a1d24;color:#e2e8f0;border:1px solid #4a5568;border-radius:4px;font-size:11px;">`;
                    template.rewards.choices.forEach((c, idx) => {
                        rewStr += `<option value="${idx}">${c.name || ('Награда #' + (idx + 1))}</option>`;
                    });
                    rewStr += `</select>`;
                }
                rewText.innerHTML = rewStr;
            }

            acceptBtnLabel.textContent = this.t('complete').toUpperCase();
            declineBtnLabel.textContent = this.t('later').toUpperCase();
            this._activeAction = { type: 'complete_quest', questId: qId };
        } else if (availableQuests.length > 0) {
            const qId = availableQuests[0];
            const template = window.QUEST_DATABASE ? window.QUEST_DATABASE[qId] : null;

            const qNameKey = 'quest_' + qId + '_name';
            const localizedQName = this.t(qNameKey) !== qNameKey ? this.t(qNameKey) : (template ? template.name : this.t('quest'));

            const qDescKey = 'quest_' + qId + '_desc';
            const localizedQDesc = this.t(qDescKey) !== qDescKey ? this.t(qDescKey) : (template ? template.description : (t.dialogue && t.dialogue.idle ? this.t(t.dialogue.idle[0]) : '...'));

            if (titlebarName) titlebarName.textContent = this.t('quest').toUpperCase();
            speechText.innerHTML = `"${localizedQDesc}"`;
            objBlock.classList.remove('hidden');
            let availHtml = `<b>${localizedQName}</b>`;
            if (template && Array.isArray(template.objectives)) {
                availHtml += template.objectives.map((o) =>
                    `<div style="color:#8893a0;font-size:10px;">• ${o.description} (${o.count})</div>`
                ).join('');
            }
            objText.innerHTML = availHtml;

            rewBlock.classList.remove('hidden');
            if (template && template.rewards) {
                rewText.innerHTML = `${(template.rewards.currency || 0).toLocaleString()} ${this.t('adena')}, ${(template.rewards.exp || 0).toLocaleString()} ${this.t('xp')}.`;
            }

            acceptBtnLabel.textContent = this.t('accept').toUpperCase();
            declineBtnLabel.textContent = this.t('decline').toUpperCase();
            this._activeAction = { type: 'start_quest', questId: qId };
        } else {
            if (titlebarName) titlebarName.textContent = this.t('dialogue').toUpperCase();

            let speech = '';
            if (t.dialogue && t.dialogue.idle && t.dialogue.idle.length) {
                speech = t.dialogue.idle.map(line => `"${this.t(line)}"`).join('\n\n');
            } else if (npc.getRandomIdleDialogue) {
                speech = `"${this.t(npc.getRandomIdleDialogue())}"`;
            } else {
                speech = `"${this.t('welcome_default')}"`;
            }
            speechText.innerHTML = speech;

            objBlock.classList.add('hidden');
            rewBlock.classList.add('hidden');

            acceptBtnLabel.textContent = this.t('talk').toUpperCase();
            declineBtnLabel.textContent = this.t('leave').toUpperCase();
            this._activeAction = { type: 'talk' };
        }

        // Дополнительные ссылки
        extraLinks.innerHTML = '';
        let hasExtra = false;

        if (availableQuests.length > 1 || (availableQuests.length > 0 && completableQuests.length > 0)) {
            hasExtra = true;
            this.addExtraLink(extraLinks, '📜', this.t('all_quests'), () => this.showQuestsView());
        }

        if (t.type === 'shop' || t.shop) {
            hasExtra = true;
            this.addExtraLink(extraLinks, '🛒', this.t('shop_subtitle'), () => this.showShopView());
        }

        if (t.type === 'buff' || t.buffs) {
            hasExtra = true;
            this.addExtraLink(extraLinks, '⚡', this.t('buffs_subtitle'), () => this.showBuffsView());
        }

        // Телепорт: раньше меню жило в map-renderer.teleportMenu и было
        // недостижимо (маркеры большой карты не наполняются), а в диалоге NPC
        // ветки для type:'teleport' не было вообще.
        if (t.type === 'teleport' || (t.teleports && t.teleports.length)) {
            hasExtra = true;
            this.addExtraLink(extraLinks, '🌀', this.t('teleport_subtitle') || 'Телепорт', () => this.showTeleportView());
        }

        if (t.type === 'trainer' || t.id === 'instructor_thorn') {
            hasExtra = true;
            this.addExtraLink(extraLinks, '📘', this.t('trainer_subtitle'), () => this.showTrainerView());
        }

        // Склад: у warehouse_w7 не было ни одной услуги — NPC стоял декорацией.
        if (t.type === 'warehouse') {
            hasExtra = true;
            this.addExtraLink(extraLinks, '📦', this.t('warehouse_subtitle'), () => this.showWarehouseView('personal'));
            const net = window.game && window.game.net;
            if (net && net.clan) {
                this.addExtraLink(extraLinks, '🏛', this.t('clan_warehouse') || 'Клан-склад', () => this.showWarehouseView('clan'));
            }
        }

        // Старший техник Биотин: сдача трофеев (Аудит 38) + диалог-расспрос о лоре
        if (t.id === 'biotin') {
            hasExtra = true;
            this.addExtraLink(extraLinks, '⚙️', this.t('biotin_trophy_turnin_btn') || 'Сдать трофеи и детали Смотрителю', () => {
                const net = window.game && window.game.net;
                if (net && typeof net.send === 'function') {
                    net.send({ t: 'biotin_trophy_turnin', npcId: 'biotin' });
                }
            });
            this.addExtraLink(extraLinks, '📜', this.t('biotin_lore_ask') || 'Спросить: «Откуда на острове обезумевшая техника?»', () => {
                const lore = [
                    { speaker: this.t('npc_biotin_name') || 'Старший Техник Биотин', text: 'biotin_lore_seq_1' },
                    { speaker: this.t('npc_biotin_name') || 'Старший Техник Биотин', text: 'biotin_lore_seq_2' },
                    { speaker: this.t('npc_biotin_name') || 'Старший Техник Биотин', text: 'biotin_lore_seq_3' },
                    { speaker: this.t('npc_biotin_name') || 'Старший Техник Биотин', text: 'biotin_lore_seq_4' }
                ];
                this.showDialogue(lore);
            });
        }

        if (hasExtra) {
            extraLinks.classList.remove('hidden');
        } else {
            extraLinks.classList.add('hidden');
        }
    }

    addExtraLink(container, icon, label, onClick) {
        const a = document.createElement('a');
        a.className = 'l2-ref-link';
        a.innerHTML = `<span style="color:#e5a535;">▶</span> <span>${icon} ${label}</span>`;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });
        container.appendChild(a);
    }

    handleAccept() {
        const act = this._activeAction;
        if (!act) {
            this.close();
            return;
        }

        if (act.type === 'start_quest' && act.questId) {
            if (window.game && window.game.questManager) {
                window.game.questManager.startQuest(act.questId);
            }
            this.renderMainDialogue();
        } else if (act.type === 'complete_quest' && act.questId) {
            if (window.game && window.game.questManager) {
                let choice = undefined;
                const choiceSelect = document.getElementById('quest-reward-choice-select');
                if (choiceSelect) {
                    choice = parseInt(choiceSelect.value, 10);
                }
                window.game.questManager.completeQuest(act.questId, choice);
            }
            this.renderMainDialogue();
        } else if (act.type === 'talk') {
            const npc = this.currentNPC;
            let text = npc && npc.getRandomIdleDialogue ? this.t(npc.getRandomIdleDialogue()) : this.t('discipline_default');
            const speechText = document.getElementById('npc-speech-text');
            if (speechText) speechText.innerHTML = `"${text}"`;
        } else if (act.type === 'dialogue_next') {
            this.dialogueIndex++;
            if (this.currentDialogue && this.dialogueIndex < this.currentDialogue.length) {
                this.renderSequenceDialogue();
            } else {
                this.close();
            }
        } else if (act.type === 'dialogue_close') {
            this.close();
        } else if (act.type === 'subview_back') {
            this.renderMainDialogue();
        }
    }

    handleDecline() {
        this.close();
    }

    hideSubviews() {
        document.querySelectorAll('.npc-subview').forEach(el => el.classList.add('hidden'));
    }

    showQuestsView() {
        this.hideSubviews();
        const el = document.getElementById('npc-quests');
        if (el) el.classList.remove('hidden');

        document.getElementById('heading-quests').textContent = this.t('available_quests');
        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');
        document.getElementById('npc-speech-text').innerHTML = `"${this.t('select_quest_hint')}"`;

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        const list = document.getElementById('quest-list');
        if (!list) return;
        list.innerHTML = '';

        const npc = this.currentNPC;
        if (!npc) return;

        if (npc.getAvailableQuests) {
            npc.getAvailableQuests().forEach(qId => {
                const tpl = window.QUEST_DATABASE ? window.QUEST_DATABASE[qId] : null;
                if (!tpl) return;

                const qNameKey = 'quest_' + qId + '_name';
                const localizedQName = this.t(qNameKey) !== qNameKey ? this.t(qNameKey) : tpl.name;

                const qDescKey = 'quest_' + qId + '_desc';
                const localizedQDesc = this.t(qDescKey) !== qDescKey ? this.t(qDescKey) : tpl.description;

                const it = document.createElement('div');
                it.className = 'l2-sub-item';
                it.innerHTML = `
                    <div style="color:#f5d475;font-weight:bold;">📜 ${localizedQName}</div>
                    <div style="color:#98a2ad;font-size:11px;">${localizedQDesc}</div>
                    <div style="color:#6ee7b7;font-size:11px;margin-top:2px;">${this.t('reward')} ${(tpl.rewards ? tpl.rewards.currency : 0).toLocaleString()} ${this.t('adena')}, ${(tpl.rewards ? tpl.rewards.exp : 0).toLocaleString()} ${this.t('xp')}</div>
                `;
                it.addEventListener('click', () => {
                    if (window.game && window.game.questManager) window.game.questManager.startQuest(qId);
                    this.renderMainDialogue();
                });
                list.appendChild(it);
            });
        }
    }

    showShopView() {
        this.hideSubviews();
        const el = document.getElementById('npc-shop');
        if (el) el.classList.remove('hidden');

        document.getElementById('heading-shop').textContent = this.t('shop');
        document.getElementById('label-balance').textContent = this.t('balance');
        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');
        document.getElementById('npc-speech-text').innerHTML = `"${this.t('shop_hint')}"`;

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        this.refreshShopCurrency();

        const container = document.getElementById('shop-items');
        if (!container) return;

        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (!npcId) return;

        // Каталог и цены — с сервера (shop_open → applyShopCatalog). Раньше цена
        // бралась из клиентской ITEM_DATABASE и уходила в buyItem аргументом.
        container.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('loading') || 'Загрузка…'}</div>`;
        const net = window.game && window.game.net;
        if (net && typeof net.intentShopOpen === 'function') {
            this._shopNpcId = npcId;
            net.intentShopOpen(npcId);
        } else {
            container.innerHTML = `<div style="color:#c66;padding:6px;">${this.t('offline') || 'Нет связи с сервером.'}</div>`;
        }
    }

    /** Отрисовать каталог, пришедший в пакете shop_open. */
    applyShopCatalog(m) {
        if (!m || !this.isOpen()) return;
        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (m.npcId && npcId && m.npcId !== npcId) return;  // ответ от другого NPC
        this._shopNpcId = m.npcId || npcId;
        this._shopSellRate = m.sellRate != null ? m.sellRate : 0.4;
        this.refreshShopCurrency(m.currency);

        const container = document.getElementById('shop-items');
        if (!container) return;
        container.innerHTML = '';
        const items = Array.isArray(m.items) ? m.items : [];
        if (!items.length) {
            container.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('shop_empty') || 'Товаров нет.'}</div>`;
            return;
        }
        items.forEach((entry) => {
            const tpl = window.ITEM_DATABASE ? window.ITEM_DATABASE[entry.itemId] : null;
            const it = document.createElement('div');
            it.className = 'l2-sub-slot';
            it.innerHTML = `
                <span style="font-size:20px;">${(tpl && tpl.icon) || '📦'}</span>
                <span class="l2-sub-slot-price">${(entry.price || 0).toLocaleString()}</span>
            `;
            if (tpl) {
                it.addEventListener('mouseenter', (e) => {
                    const invUI = window.game && window.game.inventoryUI;
                    if (invUI && invUI.showTooltip) invUI.showTooltip(tpl, e);
                });
                it.addEventListener('mouseleave', () => {
                    const invUI = window.game && window.game.inventoryUI;
                    if (invUI && invUI.hideTooltip) invUI.hideTooltip();
                });
            }
            it.title = (entry.name || entry.itemId) + ' — ' + (entry.price || 0) + '⚙️' +
                (entry.stackable ? ' (Shift: ×10)' : '');
            it.addEventListener('click', (e) => {
                // Shift — сразу 10 штук для стакуемого расходника.
                const n = (e.shiftKey && entry.stackable) ? 10 : 1;
                this.buyItem(entry.itemId, n);
            });
            container.appendChild(it);
        });
    }

    /** Обновить отображаемый баланс. Без аргумента — из локального инвентаря. */
    refreshShopCurrency(value) {
        const curEl = document.getElementById('shop-currency');
        if (!curEl) return;
        let v = value;
        if (v == null) {
            const g = window.game;
            v = (g && g.inventory) ? g.inventory.currency : 0;
        }
        curEl.textContent = (v || 0).toLocaleString();
    }

    /**
     * Покупка = ЗАПРОС. Цену не передаём: сервер берёт её из каталога,
     * проверяет дистанцию до NPC, валюту и место в сумке, потом присылает
     * shop_buy_ok с новым инвентарём (net-ws.js применит его через applyInv).
     * Раньше здесь были локальные spendCurrency + addItem, и покупка
     * исчезала при первой же синхронизации сумки.
     */
    buyItem(itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._shopNpcId || (this.currentNPC && this.currentNPC.template && this.currentNPC.template.id);
        if (!net || typeof net.intentNpcBuy !== 'function' || !npcId) {
            if (g) g.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
            return;
        }
        net.intentNpcBuy(npcId, itemId, count != null ? count : 1);
    }

    /** Продажа торговцу: запрос, авторитет цены и списания — на сервере. */
    sellItem(itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._shopNpcId || (this.currentNPC && this.currentNPC.template && this.currentNPC.template.id);
        if (!net || typeof net.intentNpcSell !== 'function' || !npcId) {
            if (g) g.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
            return;
        }
        net.intentNpcSell(npcId, itemId, count != null ? count : 1);
    }

    // ---- Персональный склад (NPC type 'warehouse') ----
    /** Открыть склад. Содержимое, ёмкость и плату присылает сервер (wh_open / cwh_open). */
    showWarehouseView(kind) {
        this._whKind = kind === 'clan' ? 'clan' : 'personal';
        this.hideSubviews();
        const el = document.getElementById('npc-warehouse');
        if (el) el.classList.remove('hidden');

        document.getElementById('heading-warehouse').textContent = this._whKind === 'clan'
            ? (this.t('clan_warehouse') || 'Клан-склад')
            : this.t('warehouse');
        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');
        document.getElementById('npc-speech-text').innerHTML = `"${this.t('warehouse_hint')}"`;

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        const bag = document.getElementById('wh-bag-list');
        const store = document.getElementById('wh-store-list');
        const npcId = this.currentNPC && this.currentNPC.template && this.currentNPC.template.id;
        const net = window.game && window.game.net;
        if (!npcId || !net || (this._whKind === 'clan'
            ? typeof net.intentCwhOpen !== 'function'
            : typeof net.intentWhOpen !== 'function')) {
            const offline = `<div style="color:#c66;padding:4px;">${this.t('offline') || 'Нет связи с сервером.'}</div>`;
            if (bag) bag.innerHTML = offline;
            if (store) store.innerHTML = '';
            return;
        }
        const loading = `<div style="color:#8893a0;padding:4px;">${this.t('loading') || 'Загрузка…'}</div>`;
        if (bag) bag.innerHTML = loading;
        if (store) store.innerHTML = loading;
        this._whNpcId = npcId;
        if (this._whKind === 'clan') net.intentCwhOpen(npcId);
        else net.intentWhOpen(npcId);
    }

    /** Отрисовать склад из пакета wh_open / wh_ok. Обе карты — серверные. */
    applyWarehouse(m) {
        if (!m || !this.isOpen()) return;
        const view = document.getElementById('npc-warehouse');
        if (!view || view.classList.contains('hidden')) return;   // склад закрыт — рисовать некуда
        const npcId = this.currentNPC && this.currentNPC.template && this.currentNPC.template.id;
        if (m.npcId && npcId && m.npcId !== npcId) return;        // ответ от другого NPC
        this._whNpcId = m.npcId || npcId;
        const NP = window.NPCS;
        const cap = m.cap != null ? m.cap : (NP ? NP.MAX_WH_SLOTS : 80);
        this._whFee = m.fee != null ? m.fee : 30;

        const cur = document.getElementById('wh-currency');
        if (cur) cur.textContent = (m.currency || 0).toLocaleString();

        const inv = m.inv || {};
        const wh = m.wh || {};
        this._whInv = inv;
        this._whMap = wh;
        this._whInvPlus = m.invPlus || {};
        this._whPlus = m.whPlus || {};
        this._whEquip = m.equip || {};
        this._renderWhColumn('wh-bag-list', inv, m.invPlus || null, 'put');
        this._renderWhColumn('wh-store-list', wh, m.whPlus || null, 'take');

        const bagSlots = document.getElementById('wh-bag-slots');
        if (bagSlots) {
            const used = NP ? NP.invSlotsUsed(inv) : Object.keys(inv).length;
            const bagCap = NP ? NP.MAX_INV_SLOTS : 80;
            bagSlots.textContent = used + '/' + bagCap;
        }
        const whSlots = document.getElementById('wh-store-slots');
        if (whSlots) {
            const used = m.slots != null ? m.slots : (NP ? NP.invSlotsUsed(wh) : Object.keys(wh).length);
            whSlots.textContent = used + '/' + cap;
        }
        const note = document.getElementById('wh-note');
        if (note) note.textContent = this.t('wh_note', { fee: this._whFee });
    }

    /** Надетые копии templateId и их plus — третья ёмкость рядом с сумкой. */
    _whEquipStat(id) {
        const eq = this._whEquip;
        let n = 0, plus = 0;
        if (!eq) return { n: 0, plus: 0 };
        const want = String(id || '').toLowerCase();
        Object.keys(eq).forEach((s) => {
            const e = eq[s];
            const tid = e && String(e.templateId || e.id || '').toLowerCase();
            if (tid === want) { n++; plus = Math.max(plus, e.plus | 0); }
        });
        return { n, plus };
    }

    /**
     * Колонка склада: строка на предмет. Клик — одна штука, Shift — весь стак.
     * Заточенный стак уходит целиком даже без Shift: сервер иначе ответит
     * enchanted (реестр plus один на templateId).
     * @param map {itemId: count} серверная карта
     * @param plusMap {itemId: plus} реестр заточки этой же ёмкости
     * @param op 'put' — из сумки на склад, 'take' — обратно
     */
    _renderWhColumn(elId, map, plusMap, op) {
        const el = document.getElementById(elId);
        if (!el) return;
        el.innerHTML = '';
        const NP = window.NPCS;
        const nameOf = (id) => {
            const tpl = (window.ITEM_DATABASE || {})[id];
            if (tpl && tpl.name) return tpl.name;
            const meta = (NP && NP.itemMeta) ? NP.itemMeta(id) : null;
            return (meta && meta.name) || id;
        };
        const ids = Object.keys(map).filter((id) => {
            if (!(map[id] > 0)) return false;
            // Валюту и квестовые вещи склад не принимает — не показываем их в
            // колонке сумки, чтобы клик не упирался в отказ сервера.
            if (op === 'put' && NP && NP.whStorable) return NP.whStorable(id).ok;
            return true;
        });
        if (!ids.length) {
            el.innerHTML = `<div style="color:#8893a0;padding:4px;">${this.t('wh_empty') || 'Пусто.'}</div>`;
            return;
        }
        ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
        ids.forEach((id) => {
            const count = map[id] | 0;
            const plus = (plusMap && plusMap[id]) ? (plusMap[id] | 0) : 0;
            const tpl = window.ensureItemTemplate ? window.ensureItemTemplate(id) : (window.ITEM_DATABASE || {})[id];
            const ico = (typeof getItemIconHtml === 'function') ? getItemIconHtml(tpl || { icon: '📦' }) : '📦';
            const eq = this._whEquipStat(id);
            const toCounts = op === 'put' ? (this._whMap || {}) : (this._whInv || {});
            const toPlus = op === 'put' ? (this._whPlus || {}) : (this._whInvPlus || {});
            const opts = op === 'put'
                ? { fromLocked: eq.n, fromExtraPlus: eq.plus }
                : { toLocked: eq.n, toExtraPlus: eq.plus };
            const blocked = !!(NP && NP.plusMoveOk) &&
                !NP.plusMoveOk(map, plusMap || {}, toCounts, toPlus, id, count, opts);
            const row = document.createElement('div');
            row.className = 'l2-wh-row' + (blocked ? ' l2-wh-row-blocked' : '');
            row.innerHTML = `
                <span class="l2-wh-row-ico">${ico}</span>
                <span class="l2-wh-row-name"></span>
                ${plus > 0 ? `<span class="l2-wh-row-plus">+${plus}</span>` : ''}
                ${count > 1 ? `<span class="l2-wh-row-count">×${count}</span>` : ''}
            `;
            // Имя — textContent: ключи карты приходят пакетом, в innerHTML их не пускаем.
            row.querySelector('.l2-wh-row-name').textContent = nameOf(id);
            const fee = (op === 'put' && NP && NP.whDepositFee) ? NP.whDepositFee(id, count) : 0;
            row.title = blocked
                ? (this.t('wh_enchanted') || 'Заточенную вещь можно переносить только целиком и когда второй копии нет')
                : (op === 'put'
                    ? (this.t('wh_store') + ' ←— ' + nameOf(id) + (fee ? (' (' + fee + '⚙️)') : ''))
                    : (this.t('wh_bag') + ' ←— ' + nameOf(id)));
            if (tpl) {
                row.addEventListener('mouseenter', (e) => {
                    const invUI = window.game && window.game.inventoryUI;
                    if (invUI && invUI.showTooltip) invUI.showTooltip(tpl, e);
                });
                row.addEventListener('mouseleave', () => {
                    const invUI = window.game && window.game.inventoryUI;
                    if (invUI && invUI.hideTooltip) invUI.hideTooltip();
                });
            }
            row.addEventListener('click', (e) => {
                if (blocked) {
                    const g = window.game;
                    if (g && g.addChatMessage) {
                        g.addChatMessage('Склад: ' + (this.t('wh_enchanted') || 'заточенную вещь можно переносить только целиком и когда второй копии нет'), 'system');
                    }
                    return;
                }
                // plus > 0 → весь стак: частичный перенос сервер отклонит как enchanted.
                const n = (plus > 0 || (e && e.shiftKey)) ? count : 1;
                if (op === 'put') this.whPut(id, n);
                else this.whTake(id, n);
            });
            el.appendChild(row);
        });
    }

    /** Положить на склад: перенос, плату и ёмкость считает сервер. */
    whPut(itemId, count) {
        this._whIntent('intentWhPut', itemId, count);
    }

    /** Забрать со склада (бесплатно). */
    whTake(itemId, count) {
        this._whIntent('intentWhTake', itemId, count);
    }

    _whIntent(method, itemId, count) {
        const g = window.game;
        const net = g && g.net;
        const npcId = this._whNpcId || (this.currentNPC && this.currentNPC.template && this.currentNPC.template.id);
        if (!net || typeof net[method] !== 'function' || !npcId) {
            if (g) g.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
            return;
        }
        const fn = (this._whKind === 'clan')
            ? (method === 'intentWhPut' ? 'intentCwhPut' : 'intentCwhTake')
            : method;
        if (typeof net[fn] !== 'function') {
            if (g) g.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
            return;
        }
        net[fn](npcId, itemId, count != null ? count : 1);
    }

    showBuffsView() {
        this.hideSubviews();
        const el = document.getElementById('npc-buffs');
        if (el) el.classList.remove('hidden');

        document.getElementById('heading-buffs').textContent = this.t('buffs');
        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');
        document.getElementById('npc-speech-text').innerHTML = `"${this.t('buffs_hint')}"`;

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        const list = document.getElementById('buff-list');
        if (!list) return;

        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (!npcId) return;

        // Цены и эффекты — с сервера: раньше бафф применялся локально
        // (player.applyBuff) и не влиял ни на серверный урон, ни на EXP.
        list.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('loading') || 'Загрузка…'}</div>`;
        const net = window.game && window.game.net;
        if (net && typeof net.intentBuffList === 'function') {
            this._buffNpcId = npcId;
            net.intentBuffList(npcId);
        } else {
            list.innerHTML = `<div style="color:#c66;padding:6px;">${this.t('offline') || 'Нет связи с сервером.'}</div>`;
        }
    }

    /** Отрисовать список баффов из пакета npc_buff_list. */
    applyBuffList(m) {
        if (!m || !this.isOpen()) return;
        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._buffNpcId = m.npcId || npcId;

        const list = document.getElementById('buff-list');
        if (!list) return;
        list.innerHTML = '';
        const buffs = Array.isArray(m.buffs) ? m.buffs : [];
        if (!buffs.length) {
            list.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('shop_empty') || 'Нет предложений.'}</div>`;
            return;
        }
        buffs.forEach((buff) => {
            const it = document.createElement('div');
            it.className = 'l2-sub-item';
            const mins = Math.round((buff.duration || 0) / 60);
            it.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <div style="color:#f5d475;font-weight:bold;">⚡ ${this.t(buff.name)}</div>
                        <div style="color:#8893a0;font-size:10px;">${this.t(buff.description)} · ${mins} ${this.t('min') || 'мин'}</div>
                    </div>
                    <div style="color:#6ee7b7;font-weight:bold;font-size:11px;">${(buff.cost || 0).toLocaleString()} ⚙️</div>
                </div>
            `;
            it.addEventListener('click', () => {
                const net = window.game && window.game.net;
                if (!net || typeof net.intentNpcBuff !== 'function') {
                    if (window.game) window.game.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
                    return;
                }
                net.intentNpcBuff(this._buffNpcId, buff.id);
            });
            list.appendChild(it);
        });
    }

    /** Меню телепорта. Точки и цены — серверные (teleport_list). */
    showTeleportView() {
        this.hideSubviews();
        const el = document.getElementById('npc-teleports');
        if (el) el.classList.remove('hidden');

        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');
        document.getElementById('npc-speech-text').innerHTML = `"${this.t('teleport_hint') || 'Куда телепортируем?'}"`;

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        const list = document.getElementById('teleport-list');
        if (!list) return;

        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (!npcId) return;

        list.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('loading') || 'Загрузка…'}</div>`;
        const net = window.game && window.game.net;
        if (net && typeof net.intentTeleportList === 'function') {
            this._tpNpcId = npcId;
            net.intentTeleportList(npcId);
        } else {
            list.innerHTML = `<div style="color:#c66;padding:6px;">${this.t('offline') || 'Нет связи с сервером.'}</div>`;
        }
    }

    /** Отрисовать точки телепорта из пакета teleport_list. */
    applyTeleportList(m) {
        if (!m || !this.isOpen()) return;
        const npc = this.currentNPC;
        const npcId = npc && npc.template && npc.template.id;
        if (m.npcId && npcId && m.npcId !== npcId) return;
        this._tpNpcId = m.npcId || npcId;
        const bal = document.getElementById('teleport-currency');
        if (bal) bal.textContent = (m.currency || 0).toLocaleString();

        const list = document.getElementById('teleport-list');
        if (!list) return;
        list.innerHTML = '';
        const points = Array.isArray(m.points) ? m.points : [];
        if (!points.length) {
            list.innerHTML = `<div style="color:#8893a0;padding:6px;">${this.t('shop_empty') || 'Направлений нет.'}</div>`;
            return;
        }
        points.forEach((pt) => {
            const it = document.createElement('div');
            it.className = 'l2-sub-item';
            it.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div style="color:#f5d475;font-weight:bold;">➤ ${pt.name}</div>
                    <div style="color:#6ee7b7;font-weight:bold;font-size:11px;">${(pt.cost || 0).toLocaleString()} ⚙️</div>
                </div>
            `;
            it.addEventListener('click', () => {
                const net = window.game && window.game.net;
                if (!net || typeof net.intentTeleport !== 'function') {
                    if (window.game) window.game.addChatMessage(this.t('offline') || 'Нет связи с сервером.', 'system');
                    return;
                }
                net.intentTeleport(this._tpNpcId, pt.index);
            });
            list.appendChild(it);
        });
    }

    showTrainerView() {
        this.hideSubviews();
        const el = document.getElementById('npc-trainer');
        if (el) el.classList.remove('hidden');

        const headingTrainer = document.getElementById('heading-trainer');
        if (headingTrainer) headingTrainer.textContent = this.t('trainer') || 'КАТАЛОГ УМЕНИЙ';
        document.getElementById('npc-objective-block').classList.add('hidden');
        document.getElementById('npc-reward-block').classList.add('hidden');
        document.getElementById('npc-extra-actions').classList.add('hidden');

        document.getElementById('btn-accept-label').textContent = this.t('back').toUpperCase();
        document.getElementById('btn-decline-label').textContent = this.t('close').toUpperCase();
        this._activeAction = { type: 'subview_back' };

        const p = window.game && window.game.player;
        const sp = p ? (p.levelSystem && p.levelSystem.sp != null ? p.levelSystem.sp | 0 : p.sp | 0) : 0;
        const spEl = document.getElementById('trainer-sp');
        if (spEl) spEl.innerHTML = '<span style="color:#98a2ad;">SP:</span> <b style="color:#f5d475;">' + sp.toLocaleString() + '</b>';

        const list = document.getElementById('trainer-skills');
        if (!list) return;
        list.innerHTML = '';

        // Определение NPC тренера и его специализации
        const npc = this.currentNPC;
        const tpl = (npc && npc.template) ? npc.template : (npc || {});
        const npcId = tpl.id || (npc && npc.id) || 'instructor_thorn';
        const globalTpl = (window.NPCS && typeof window.NPCS.get === 'function') ? window.NPCS.get(npcId) : null;
        const trainerClasses = (tpl && tpl.trainerClasses) || (globalTpl && globalTpl.trainerClasses) || null;

        // Определение класса игрока и ветки (operator / engineer)
        const playerClass = (p && (p.playerClass || p.classId || p.class)) || 'operator';
        const rootClass = (window.CLASS_SYSTEM && typeof window.CLASS_SYSTEM.rootClass === 'function')
            ? window.CLASS_SYSTEM.rootClass(playerClass)
            : (playerClass.startsWith('engineer') ? 'engineer' : 'operator');

        let canTrain = true;
        if (trainerClasses && Array.isArray(trainerClasses)) {
            canTrain = trainerClasses.includes(playerClass) || trainerClasses.includes(rootClass);
        }

        // Канон L2 C1: отказ гильдии при попытке учиться у чужого наставника
        if (!canTrain) {
            const isFighter = rootClass === 'operator' || ['operator', 'mechanic', 'destroyer', 'gunner'].includes(playerClass);
            const speech = isFighter
                ? (this.t('trainer_reject_operator_at_engineer') || 'Магистр Баульро: «Тяжелые латы, шестерни и паровая смазка на рукавах... Вы боец с передовой, дитя нагнетателя и пара. Моя кафедра наставляет лишь инженеров, конструкторов и техномантов. Ступайте на Боевой плац к Мастеру Торну — он обучит вас воинскому искусству.»')
                : (this.t('trainer_reject_engineer_at_fighter') || 'Мастер Торн: «В твоих руках чертежи и схемы, а в глазах искры резонатора. Я тренирую операторов и штурмовиков крушить сталь в ближнем бою. Твой путь лежит в Машинный Зал к Магистру Баульро — там изучают резонанс и паровые цепи.»');
            
            const speechEl = document.getElementById('npc-speech-text');
            if (speechEl) speechEl.innerHTML = '"' + speech + '"';

            const mismatchDiv = document.createElement('div');
            mismatchDiv.className = 'l2-sub-item';
            mismatchDiv.style.cssText = 'border-color:#e05252;background:rgba(224,82,82,0.08);cursor:default;padding:12px;display:flex;gap:12px;align-items:center;';
            mismatchDiv.innerHTML = `
                <span style="font-size:24px;">🚫</span>
                <div>
                    <div style="color:#fca5a5;font-weight:bold;font-size:12px;">${this.t('trainer_wrong_guild_title') || 'Чужая гильдия наставников'}</div>
                    <div style="color:#94a3b8;font-size:11px;margin-top:2px;">${isFighter ? (this.t('trainer_goto_thorn') || 'Операторы обучаются у Мастера Торна на Боевом плацу.') : (this.t('trainer_goto_baulro') || 'Инженеры обучаются у Магистра Баульро в Машинном Зале.')}</div>
                </div>
            `;
            list.appendChild(mismatchDiv);
            return;
        }

        // Атмосферная речь тренера при успешном совпадении класса
        const speechEl = document.getElementById('npc-speech-text');
        if (speechEl) {
            if (npcId === 'magister_baulro') {
                speechEl.innerHTML = '"' + (this.t('trainer_speech_baulro') || 'Магистр Контура Баульро: «Паровые контуры требуют предельной концентрации и чистых схем. Выберите умение, которое желаете настроить за счёт SP.»') + '"';
            } else {
                speechEl.innerHTML = '"' + (this.t('trainer_speech_thorn') || 'Мастер-Инструктор Торн: «Каждый удар должен отдавать в кости противника, а не в твои суставы. Расходуй SP с умом и держи нагнетатель в порядке.»') + '"';
            }
        }

        const db = (typeof SKILL_DATABASE !== 'undefined' && SKILL_DATABASE)
            ? Object.values(SKILL_DATABASE)
            : (window.SKILL_DB ? window.SKILL_DB.list() : []);

        const sm = p && p.skillManager;
        const playerLevel = (p && p.levelSystem ? p.levelSystem.level : (p && p.level ? p.level : 1)) | 0;

        // Фильтрация: строго канон, без мем-скилов (br_), без GM/тестовых умений, без чужих веток, только Фаза 1 (<= 20)
        const validSkills = db.filter(s => {
            if (!s || !s.id) return false;
            if (s.meme === true || s.id.startsWith('br_') || s.id.startsWith('gm_') || s.id.startsWith('test_')) return false;
            if (s.class === 'any' || s.class === '*' || s.class === 'all') return false;

            // Соответствие классу игрока
            let allowed = false;
            if (sm && typeof sm._skillAllowedForClass === 'function') {
                allowed = sm._skillAllowedForClass(s.class);
            } else {
                allowed = (s.class === playerClass || s.class === rootClass);
                if (!allowed && window.CLASS_SYSTEM && typeof window.CLASS_SYSTEM.classLineage === 'function') {
                    const line = window.CLASS_SYSTEM.classLineage(playerClass);
                    allowed = line.includes(s.class);
                }
            }
            if (!allowed) return false;

            // Только 1 фаза: умения начального этапа (требование уровня <= 20)
            const reqLv = s.levelReq || s.level || 1;
            if (reqLv > 20) return false;

            return true;
        });

        const skillEntries = validSkills.map(s => {
            const learned = sm && sm.learnedSkills ? sm.learnedSkills[s.id] : null;
            const curRank = learned ? (learned.level | 0) : 0;
            const maxRank = (s.ranks && s.ranks.length) ? s.ranks.length : (s.maxLevel || 1);
            const isMaxed = curRank >= maxRank;
            const nextRank = curRank + 1;

            const needLv = (typeof skillLevelReqForRank === 'function')
                ? skillLevelReqForRank(s, nextRank)
                : (s.levelReq || 1);

            const cost = isMaxed ? 0 : (
                (sm && typeof sm.getUpgradeSpCost === 'function')
                    ? sm.getUpgradeSpCost(s.id)
                    : ((typeof skillSpCost === 'function') ? skillSpCost(s, nextRank) : (s.spCost || 50))
            );

            const levelMet = playerLevel >= needLv;
            const spMet = isMaxed || sp >= cost;

            // Проверка модулей / приборов игрока
            let deviceLock = null;
            if (!isMaxed && s.deviceReq) {
                const dType = s.deviceReq.type;
                if (dType === 'compressor') {
                    const has = p && typeof p.hasCompressorEquipped === 'function' && p.hasCompressorEquipped();
                    const have = (p && typeof p.getValveLevel === 'function') ? p.getValveLevel() : ((p && typeof p.getCircuitLevel === 'function') ? p.getCircuitLevel() : 0);
                    const need = (p && typeof p.resonatorReqForSkill === 'function') ? p.resonatorReqForSkill(s, nextRank) : 1;
                    deviceLock = { label: 'Нагнетатель', ok: (has && have >= need), detail: 'Ур.' + have + '/' + need, slot: 'Шея' };
                } else if (dType === 'bracers') {
                    const has = p && typeof p.hasOperatorBracersEquipped === 'function' && p.hasOperatorBracersEquipped();
                    const have = (p && typeof p.getWristLevel === 'function') ? p.getWristLevel() : ((p && typeof p.getNanoLevel === 'function') ? p.getNanoLevel() : 0);
                    const need = (p && typeof p.nanoReqForSkill === 'function') ? p.nanoReqForSkill(s, nextRank) : 1;
                    deviceLock = { label: 'Наручи', ok: (has && have >= need), detail: 'Ур.' + have + '/' + need, slot: 'Запястье' };
                } else if (dType === 'resonator') {
                    const has = p && typeof p.hasCircuitResonatorEquipped === 'function' && p.hasCircuitResonatorEquipped();
                    const have = (p && typeof p.getCircuitLevel === 'function') ? p.getCircuitLevel() : 0;
                    const need = (p && typeof p.resonatorReqForSkill === 'function') ? p.resonatorReqForSkill(s, nextRank) : 1;
                    deviceLock = { label: 'Резонатор', ok: (has && have >= need), detail: 'Ур.' + have + '/' + need, slot: 'Шея' };
                } else if (dType === 'bracelet') {
                    const has = p && typeof p.hasNanoBraceletEquipped === 'function' && p.hasNanoBraceletEquipped();
                    const have = (p && typeof p.getNanoLevel === 'function') ? p.getNanoLevel() : 0;
                    const need = (p && typeof p.nanoReqForSkill === 'function') ? p.nanoReqForSkill(s, nextRank) : 1;
                    deviceLock = { label: 'Нано-браслет', ok: (has && have >= need), detail: 'Ур.' + have + '/' + need, slot: 'Запястье' };
                }
            }

            // Группировка для сортировки по канону L2:
            // 0: Доступно прямо сейчас (хватает уровня, SP и надет прибор)
            // 1: Подходит по уровню, но не хватает SP или снят прибор
            // 2: Заблокировано по уровню персонажа
            // 3: Полностью изучено (максимальный ранг)
            let sortGroup = 0;
            if (isMaxed) {
                sortGroup = 3;
            } else if (!levelMet) {
                sortGroup = 2;
            } else if (!spMet || (deviceLock && !deviceLock.ok)) {
                sortGroup = 1;
            } else {
                sortGroup = 0;
            }

            return {
                s,
                curRank,
                maxRank,
                isMaxed,
                nextRank,
                needLv,
                cost,
                levelMet,
                spMet,
                deviceLock,
                sortGroup
            };
        });

        // Сортировка: сначала доступные сейчас, затем требующие SP/прибор, затем уровень, затем изученные
        skillEntries.sort((a, b) => {
            if (a.sortGroup !== b.sortGroup) return a.sortGroup - b.sortGroup;
            if (a.needLv !== b.needLv) return a.needLv - b.needLv;
            return a.cost - b.cost;
        });

        if (skillEntries.length === 0) {
            list.innerHTML = '<div style="color:#8893a0;padding:12px;text-align:center;">' + (this.t('no_skills') || 'Нет умений для изучения.') + '</div>';
            return;
        }

        skillEntries.forEach(entry => {
            const { s, curRank, maxRank, isMaxed, nextRank, needLv, cost, levelMet, spMet, deviceLock, sortGroup } = entry;

            const it = document.createElement('div');
            it.className = 'l2-sub-item';
            
            if (isMaxed) {
                it.style.opacity = '0.6';
                it.style.borderColor = '#334155';
            } else if (sortGroup === 2) {
                it.style.opacity = '0.55';
                it.style.borderColor = '#293548';
            } else if (sortGroup === 1) {
                it.style.borderColor = '#64748b';
            } else {
                it.style.borderColor = '#a6833b';
            }

            const iconHtml = (s.icon && (s.icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g)$/i.test(s.icon)))
                ? '<img src="' + s.icon + '" width="32" height="32" style="border-radius:3px;border:1px solid #a6833b;object-fit:cover;flex-shrink:0;" onerror="this.style.display=\'none\'">'
                : '<span style="font-size:22px;flex-shrink:0;">' + (s.type === 'passive' ? '🛡️' : '⚔️') + '</span>';

            let deviceBadgeHtml = '';
            if (deviceLock) {
                if (deviceLock.ok) {
                    deviceBadgeHtml = '<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;background:rgba(56,189,248,0.12);color:#38bdf8;border:1px solid rgba(56,189,248,0.3);margin-left:6px;" title="Модуль экипирован">⚡ ' + deviceLock.label + ' ✓</span>';
                } else {
                    deviceBadgeHtml = '<span style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:10px;background:rgba(239,68,68,0.12);color:#fca5a5;border:1px solid rgba(239,68,68,0.3);margin-left:6px;" title="Требуется экипировать ' + deviceLock.label + '">⚡ ' + deviceLock.label + ' ✗</span>';
                }
            }

            let actionHtml = '';
            if (isMaxed) {
                actionHtml = '<span style="color:#6ee7b7;font-weight:bold;font-size:11px;">MAX</span>';
            } else if (!levelMet) {
                actionHtml = '<span style="color:#64748b;font-size:11px;font-weight:600;">🔒 Ур. ' + needLv + '</span>';
            } else if (!spMet) {
                actionHtml = '<div style="text-align:right;"><span style="color:#ef4444;font-weight:bold;font-size:11px;">' + cost.toLocaleString() + ' SP</span><div style="color:#94a3b8;font-size:9px;">не хватает</div></div>';
            } else if (deviceLock && !deviceLock.ok) {
                actionHtml = '<div style="text-align:right;"><span style="color:#f59e0b;font-weight:bold;font-size:11px;">' + cost.toLocaleString() + ' SP</span><div style="color:#fca5a5;font-size:9px;">нет прибора</div></div>';
            } else {
                actionHtml = '<button type="button" style="background:#1d4ed8;border:1px solid #60a5fa;color:#ffffff;border-radius:3px;padding:3px 8px;font-weight:bold;font-size:11px;cursor:pointer;box-shadow:0 0 6px rgba(59,130,246,0.4);transition:all 0.15s;">' + cost.toLocaleString() + ' SP</button>';
            }

            const skillName = this.t(s.name) || s.name || s.id;
            const skillDesc = this.t(s.description) || s.description || '';
            const skillTypeLabel = s.type === 'passive' ? (this.t('passive') || 'Пассивное') : (this.t('active') || 'Активное');

            it.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;">
                    ${iconHtml}
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">
                            <span style="color:#f3d17c;font-weight:bold;font-size:12px;">${skillName}</span>
                            <span style="color:#94a3b8;font-size:10px;">[${this.t('rank') || 'Ранг'} ${curRank}/${maxRank}]</span>
                            ${deviceBadgeHtml}
                        </div>
                        <div style="color:#8893a0;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" title="${skillDesc}">${skillDesc}</div>
                        <div style="color:#64748b;font-size:9.5px;margin-top:1px;">
                            <span style="color:${levelMet ? '#34d399' : '#f87171'};">&bull; Ур. ${needLv}</span>
                            <span style="margin-left:6px;">&bull; ${skillTypeLabel}</span>
                        </div>
                    </div>
                    <div style="flex-shrink:0;margin-left:8px;">
                        ${actionHtml}
                    </div>
                </div>
            `;

            if (!isMaxed) {
                it.addEventListener('click', () => {
                    if (!p || !p.skillManager) return;

                    if (!levelMet) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage('Для изучения умения «' + skillName + '» требуется уровень ' + needLv + '.', 'system');
                        }
                        return;
                    }
                    if (deviceLock && !deviceLock.ok) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage('Требуется экипировать ' + deviceLock.label + ' (' + (deviceLock.slot || 'слот') + '), чтобы изучить «' + skillName + '».', 'system');
                        }
                        return;
                    }
                    if (!spMet) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage('Недостаточно SP для «' + skillName + '». Требуется: ' + cost + ', у вас: ' + sp + '.', 'system');
                        }
                        return;
                    }

                    p.skillManager.learnSkill(s.id, false, false, npcId);
                    setTimeout(() => this.showTrainerView(), 250);
                });
            }

            list.appendChild(it);
        });
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.NPCUI = NPCUI;