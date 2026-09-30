// ============================================
// PROJECT STEAM: ORIGINS - LEVEL-UI.JS
// HUD: EXP бар, SP, класс, карма, выбор профессии
// ============================================

class LevelUI {
    constructor(levelSystem) {
        this.levelSystem = levelSystem;
        this.createHUD();
        this.createTransferWindow();
        this.injectStyles();
        this.bindEvents();
    }
    
    createHUD() {
        // game.html уже имеет EXP/SP бары — только karma/flag в meta, если нет
        const meta = document.getElementById('level-info') || document.querySelector('.l2-status-meta');
        if (meta && !document.getElementById('karma-display')) {
            meta.insertAdjacentHTML('beforeend',
              '<span id="karma-display" class="karma-display hidden">☠️ 0</span>' +
              '<span id="flag-display" class="flag-display hidden">🚩</span>'
            );
        }
    }
    
    createTransferWindow() {
        this.transferWindow = document.createElement('div');
        this.transferWindow.id = 'transfer-window';
        this.transferWindow.innerHTML = `
            <div class="transfer-header">
                <h2>⚙️ СЕРТИФИКАЦИЯ</h2>
                <p id="transfer-subtitle">Выберите профессию</p>
            </div>
            <div id="transfer-options" class="transfer-options"></div>
            <div class="transfer-footer">
                <p class="transfer-warning">⚠️ Выбор профессии необратим!</p>
            </div>
        `;
        document.body.appendChild(this.transferWindow);
    }
    
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* EXP бар */
            .exp-container {
                height: 16px !important;
                margin-top: 4px;
            }
            
            .bar.exp {
                background: linear-gradient(90deg, #886600, #ffdd44);
            }
            
            /* Информация об уровне */
            #level-info {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-top: 8px;
                font-size: 12px;
            }
            
            .class-badge {
                background: #333;
                border: 1px solid #ffaa44;
                color: #ffaa44;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 11px;
            }
            
            .sp-display {
                color: #44aaff;
            }
            
            .karma-display {
                color: #ff4444;
            }
            
            .karma-display.hidden,
            .flag-display.hidden {
                display: none;
            }
            
            .flag-display {
                color: #ff8800;
                animation: flagPulse 1s infinite;
            }
            
            @keyframes flagPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            /* Окно смены класса */
            #transfer-window {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 600px;
                max-width: 95vw;
                background: rgba(15, 15, 20, 0.98);
                border: 2px solid #ffaa44;
                border-radius: 16px;
                z-index: 700;
                display: none;
                flex-direction: column;
                font-family: 'Courier New', monospace;
                color: #ccc;
                box-shadow: 0 0 60px rgba(255, 170, 68, 0.3);
            }
            
            #transfer-window.open {
                display: flex;
            }
            
            .transfer-header {
                text-align: center;
                padding: 24px;
                border-bottom: 1px solid #444;
            }
            
            .transfer-header h2 {
                color: #ffaa44;
                margin: 0 0 8px;
                font-size: 24px;
            }
            
            .transfer-header p {
                color: #888;
                margin: 0;
            }
            
            .transfer-options {
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding: 24px;
            }
            
            .transfer-option {
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                background: #2a2a2a;
                border: 2px solid #444;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s;
            }
            
            .transfer-option:hover {
                border-color: #ffaa44;
                background: #333;
                transform: scale(1.02);
            }
            
            .transfer-option .option-icon {
                font-size: 40px;
                width: 60px;
                height: 60px;
                text-align: center;
                flex-shrink: 0;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .transfer-option .option-icon img {
                width: 52px;
                height: 52px;
                object-fit: cover;
                border-radius: 4px;
                border: 1px solid #a6833b;
                image-rendering: auto;
            }
            
            .transfer-option .option-info {
                flex: 1;
            }
            
            .transfer-option .option-name {
                font-size: 16px;
                font-weight: bold;
                color: #fff;
                margin-bottom: 4px;
            }
            
            .transfer-option .option-desc {
                font-size: 12px;
                color: #888;
                line-height: 1.4;
            }
            
            .transfer-option .option-stats {
                font-size: 11px;
                color: #44ff44;
                margin-top: 8px;
            }
            
            .transfer-footer {
                padding: 16px 24px;
                border-top: 1px solid #444;
                text-align: center;
            }
            
            .transfer-warning {
                color: #ff4444;
                font-size: 12px;
                margin: 0;
            }
        `;
        document.head.appendChild(style);
    }
    
    bindEvents() {
        // Обработка выбора класса
        window.addEventListener('keydown', (e) => {
            if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
            if (this.levelSystem.canTransfer()) {
                const num = parseInt(e.key);
                if (num >= 1 && num <= 3) {
                    this.levelSystem.performClassTransfer(num - 1);
                    this.closeTransferWindow();
                    this.update();
                }
            }
        });
    }
    
    showTransferWindow() {
        const ls = this.levelSystem;
        if (!ls || !ls.canTransfer()) return;
        if (!ls.pendingTransfer || !Array.isArray(ls.pendingTransfer.options)) return;

        const options = ls.getAvailableClasses();
        if (!options || !options.length) return;

        const container = document.getElementById('transfer-options');
        if (!container) return;
        container.innerHTML = '';

        const tier = ls.pendingTransfer.tier != null
            ? ls.pendingTransfer.tier
            : ((options[0] && options[0].levelReq >= 40) ? 2 : 1);
        const sub = document.getElementById('transfer-subtitle');
        if (sub) {
            sub.textContent = tier === 1
                ? 'Первая сертификация (Ур. 20)'
                : 'Вторая сертификация (Ур. 40)';
        }

        options.forEach((cls, i) => {
            if (!cls) return;
            const bs = cls.baseStats || {};
            const ic = (cls && cls.icon) || '';
            const iconHtml = (typeof ic === 'string' && (ic.indexOf('/') >= 0 || /\.(webp|png|jpe?g|gif)$/i.test(ic)))
                ? '<img src="' + ic + '" alt="" draggable="false">'
                : (ic || '⚙️');
            const option = document.createElement('div');
            option.className = 'transfer-option';
            option.innerHTML = `
                <div class="option-icon">${iconHtml}</div>
                <div class="option-info">
                    <div class="option-name">[${i + 1}] ${cls.name}</div>
                    <div class="option-desc">${cls.description || ''}</div>
                    <div class="option-stats">
                        HP: ${bs.hp != null ? bs.hp : '—'} | ATK: ${bs.attack != null ? bs.attack : '—'} |
                        DEF: ${bs.defense != null ? bs.defense : '—'} | CRIT: ${bs.critRate != null ? bs.critRate : '—'}%
                    </div>
                </div>
            `;

            option.addEventListener('click', () => {
                ls.performClassTransfer(i);
                this.closeTransferWindow();
                this.update();
            });

            container.appendChild(option);
        });

        this.transferWindow.classList.add('open');
    }

    showTransfer() { this.showTransferWindow(); }
    hideTransfer() { this.closeTransferWindow(); }
    
    closeTransferWindow() {
        this.transferWindow.classList.remove('open');
    }
    
    update() {
        const ls = this.levelSystem;
        
        // EXP бар (процент)
        const expBar = document.getElementById('exp-bar');
        const expText = document.getElementById('exp-text');
        if (expBar && expText) {
            const percent = ls.getExpPercent();
            expBar.style.width = percent + '%';
            expText.textContent = percent.toFixed(1) + '%';
        }
        
        // SP бар (число; fill ~log-scale до 10000)
        const spBar = document.getElementById('sp-bar');
        const spText = document.getElementById('sp-text');
        const sp = Math.max(0, ls.sp | 0);
        if (spText) spText.textContent = sp.toLocaleString('ru-RU');
        if (spBar) {
            const fill = Math.min(100, Math.round(100 * Math.log10(1 + sp) / Math.log10(1 + 10000)));
            spBar.style.width = fill + '%';
        }
        // legacy sp-display (если остался)
        const spDisplay = document.getElementById('sp-display');
        if (spDisplay) spDisplay.textContent = sp.toLocaleString('ru-RU');
        
        // Карма
        const karmaDisplay = document.getElementById('karma-display');
        if (karmaDisplay) {
            if (ls.karma > 0) {
                karmaDisplay.classList.remove('hidden');
                karmaDisplay.textContent = `☠️ ${ls.karma}`;
            } else {
                karmaDisplay.classList.add('hidden');
            }
        }
        
        // Флаг
        const flagDisplay = document.getElementById('flag-display');
        if (flagDisplay) {
            if (ls.isFlagged) {
                flagDisplay.classList.remove('hidden');
            } else {
                flagDisplay.classList.add('hidden');
            }
        }
        
        // Окно смены класса
        if (ls.canTransfer() && !this.transferWindow.classList.contains('open')) {
            this.showTransferWindow();
        }
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.LevelUI = LevelUI;