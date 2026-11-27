// ============================================
// PROJECT STEAM: ORIGINS - LOOT-UI.JS
// UI: всплывающий лут, окна, анимации,
// damage numbers, loot filter
// ============================================

class LootUI {
    constructor() {
        this.damageNumbers = [];
        this.lootNotifications = [];
        this.lootFilter = {
            common: true,
            uncommon: true,
            rare: true,
            epic: true,
            legendary: true,
            mythic: true,
            adena: true,
            materials: true
        };
        
        this.createLootWindow();
        this.createDamageLayer();
        this.injectStyles();
    }
    
    createLootWindow() {
        // Окно лута (при клике на предмет)
        this.lootWindow = document.createElement('div');
        this.lootWindow.id = 'loot-window';
        this.lootWindow.innerHTML = `
            <div class="loot-header">
                <h3>ДОБЫЧА</h3>
                <button id="loot-close" class="loot-btn">✕</button>
            </div>
            <div id="loot-items" class="loot-items"></div>
            <div class="loot-footer">
                <button id="loot-all" class="loot-btn">Подобрать всё</button>
            </div>
        `;
        document.body.appendChild(this.lootWindow);
        
        document.getElementById('loot-close').addEventListener('click', () => {
            this.lootWindow.classList.remove('open');
        });

        // Make loot window draggable
        const header = this.lootWindow.querySelector('.loot-header');
        if (header) {
            header.style.cursor = 'grab';
            header.style.userSelect = 'none';
            let dragging = false, startX = 0, startY = 0, initL = 0, initT = 0;
            const onStart = (cx, cy, target) => {
                if (target.closest('button, a')) return;
                dragging = true;
                header.style.cursor = 'grabbing';
                const r = this.lootWindow.getBoundingClientRect();
                this.lootWindow.style.left = r.left + 'px';
                this.lootWindow.style.top = r.top + 'px';
                this.lootWindow.style.transform = 'none';
                startX = cx; startY = cy;
                initL = r.left; initT = r.top;
            };
            const onMove = (cx, cy) => {
                if (!dragging) return;
                const w = window.innerWidth, h = window.innerHeight;
                const ew = this.lootWindow.offsetWidth || 300, eh = this.lootWindow.offsetHeight || 200;
                this.lootWindow.style.left = Math.max(0, Math.min(w - ew, initL + cx - startX)) + 'px';
                this.lootWindow.style.top = Math.max(0, Math.min(h - eh, initT + cy - startY)) + 'px';
            };
            const onEnd = () => {
                if (dragging) {
                    dragging = false;
                    header.style.cursor = 'grab';
                }
            };
            header.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e.target));
            window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
            window.addEventListener('mouseup', onEnd);
            header.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
            }, { passive: true });
            window.addEventListener('touchmove', (e) => {
                if (e.touches && e.touches.length === 1 && dragging) onMove(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
            window.addEventListener('touchend', onEnd);
        }
    }
    
    createDamageLayer() {
        // Слой для всплывающих цифр урона
        this.damageLayer = document.createElement('div');
        this.damageLayer.id = 'damage-layer';
        document.body.appendChild(this.damageLayer);
    }
    
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Окно лута */
            #loot-window {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: min(350px, 94vw);
                max-height: 86vh;
                overflow-y: auto;
                box-sizing: border-box;
                background: rgba(20, 20, 25, 0.95);
                border: 2px solid #555;
                border-radius: 8px;
                z-index: 550;
                display: none;
                flex-direction: column;
                font-family: 'Courier New', monospace;
                color: #ccc;
            }
            
            #loot-window.open {
                display: flex;
            }
            
            .loot-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                border-bottom: 1px solid #444;
            }
            
            .loot-header h3 {
                margin: 0;
                color: #ffaa44;
                font-size: 14px;
            }
            
            .loot-btn {
                background: #333;
                border: 1px solid #666;
                color: #fff;
                padding: 4px 10px;
                border-radius: 4px;
                cursor: pointer;
                font-family: inherit;
                font-size: 12px;
            }
            
            .loot-btn:hover {
                background: #555;
                border-color: #ffaa44;
            }
            
            .loot-items {
                padding: 12px;
                max-height: 300px;
                overflow-y: auto;
            }
            
            .loot-item-row {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px;
                background: #2a2a2a;
                border: 1px solid #444;
                border-radius: 6px;
                margin-bottom: 6px;
                cursor: pointer;
                transition: all 0.2s;
            }
            
            .loot-item-row:hover {
                border-color: #ffaa44;
            }
            
            .loot-item-icon {
                font-size: 20px;
            }
            
            .loot-item-name {
                flex: 1;
                font-size: 12px;
            }
            
            .loot-item-count {
                font-size: 11px;
                color: #888;
            }
            
            .loot-footer {
                padding: 12px;
                border-top: 1px solid #444;
                text-align: center;
            }
            
            /* Damage Numbers */
            #damage-layer {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 400;
                overflow: hidden;
            }
            
            .damage-number {
                position: absolute;
                font-family: 'Courier New', monospace;
                font-weight: bold;
                text-shadow: 1px 1px 2px #000, -1px -1px 2px #000;
                animation: damageFloat 1.5s ease-out forwards;
                pointer-events: none;
            }
            
            .damage-number.normal {
                color: #ffffff;
                font-size: 16px;
            }
            
            .damage-number.crit {
                color: #ff4444;
                font-size: 24px;
            }
            
            .damage-number.heal {
                color: #44ff44;
                font-size: 16px;
            }
            
            .damage-number.exp {
                color: #ffdd44;
                font-size: 14px;
            }
            
            .damage-number.loot {
                color: #44aaff;
                font-size: 14px;
            }
            
            @keyframes damageFloat {
                0% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                50% {
                    opacity: 1;
                    transform: translateY(-30px) scale(1.1);
                }
                100% {
                    opacity: 0;
                    transform: translateY(-60px) scale(0.8);
                }
            }
            
            /* Loot notification (правый верхний угол) */
            .loot-notification {
                position: fixed;
                top: 180px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                border: 1px solid #555;
                border-radius: 8px;
                padding: 8px 12px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                z-index: 450;
                animation: lootSlide 3s ease-out forwards;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .loot-notification .notif-icon {
                font-size: 16px;
            }
            
            .loot-notification .notif-text {
                color: #ccc;
            }
            
            .loot-notification.rare {
                border-color: #4488ff;
            }
            
            .loot-notification.epic {
                border-color: #aa44ff;
            }
            
            .loot-notification.legendary {
                border-color: #ffaa44;
            }
            
            @keyframes lootSlide {
                0% {
                    opacity: 0;
                    transform: translateX(50px);
                }
                10% {
                    opacity: 1;
                    transform: translateX(0);
                }
                80% {
                    opacity: 1;
                }
                100% {
                    opacity: 0;
                    transform: translateX(50px);
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // === DAMAGE NUMBERS ===
    
    showDamageNumber(worldPosition, amount, type = 'normal') {
        // Конвертация 3D -> 2D
        const vector = worldPosition.clone();
        vector.project(game.camera);
        
        const x = (vector.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-vector.y * 0.5 + 0.5) * window.innerHeight;
        
        const el = document.createElement('div');
        el.className = `damage-number ${type}`;
        
        let text = '';
        switch(type) {
            case 'normal': text = `-${amount}`; break;
            case 'crit': text = `-${amount}!`; break;
            case 'heal': text = `+${amount}`; break;
            case 'exp': text = `+${amount} EXP`; break;
            case 'loot': text = `+${amount}`; break;
        }
        
        el.textContent = text;
        el.style.left = (x + (Math.random() - 0.5) * 40) + 'px';
        el.style.top = (y + (Math.random() - 0.5) * 20) + 'px';
        
        this.damageLayer.appendChild(el);
        
        setTimeout(() => {
            el.remove();
        }, 1500);
    }
    
    // === LOOT NOTIFICATIONS ===
    
    showLootNotification(itemId, amount, rarity = 'common') {
        const template = ITEM_DATABASE[itemId];
        if (!template) return;
        
        const rarityData = ITEM_RARITY[rarity];
        
        const notif = document.createElement('div');
        notif.className = `loot-notification ${rarity}`;
        notif.innerHTML = `
            <span class="notif-icon">${template.icon}</span>
            <span class="notif-text" style="color: ${rarityData.color}">
                ${template.name} x${amount}
            </span>
        `;
        
        document.body.appendChild(notif);
        
        setTimeout(() => {
            notif.remove();
        }, 3000);
    }
    
    // === ОКНО ЛУТА ===
    
    showLootWindow(groundItems) {
        const container = document.getElementById('loot-items');
        container.innerHTML = '';
        
        groundItems.forEach(item => {
            const template = ITEM_DATABASE[item.drop.itemId];
            const rarity = ITEM_RARITY[item.drop.rarity];
            
            const row = document.createElement('div');
            row.className = 'loot-item-row';
            row.innerHTML = `
                <span class="loot-item-icon">${template ? template.icon : '❓'}</span>
                <span class="loot-item-name" style="color: ${rarity.color}">
                    ${template ? template.name : item.drop.itemId}
                </span>
                <span class="loot-item-count">x${item.drop.amount}</span>
            `;
            
            row.addEventListener('click', () => {
                game.lootManager.pickupItem(item, game.player);
                row.remove();
                
                if (container.children.length === 0) {
                    this.lootWindow.classList.remove('open');
                }
            });
            
            container.appendChild(row);
        });
        
        this.lootWindow.classList.add('open');
    }
    
    // === ФИЛЬТР ЛУТА ===
    
    toggleFilter(category) {
        this.lootFilter[category] = !this.lootFilter[category];
        game.addChatMessage(
            `Фильтр лута: ${category} ${this.lootFilter[category] ? 'ВКЛ' : 'ВЫКЛ'}`,
            'system'
        );
    }
    
    shouldShowDrop(drop) {
        if (drop.type === DROP_TYPES.ADENA) return this.lootFilter.adena;
        if (drop.type === DROP_TYPES.MATERIAL) return this.lootFilter.materials;
        return this.lootFilter[drop.rarity] !== false;
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.LootUI = LootUI;