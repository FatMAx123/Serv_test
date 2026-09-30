// ============================================
// PROJECT STEAM: ORIGINS - DUNGEON-UI.JS
// Окно входа, HUD-баннер инстанса (таймер +
// прогресс), подсказка у ворот/сундука
// ============================================

class DungeonUI {
    constructor(dungeonManager) {
        this.dm = dungeonManager;
        this.session = null;
        this.createEntryWindow();
        this.createHudBanner();
        this.createHint();
        this.injectStyles();
        this.bindEvents();
    }

    createEntryWindow() {
        this.entryWin = document.createElement('div');
        this.entryWin.id = 'dungeon-entry';
        this.entryWin.innerHTML = `
            <div class="de-header">
                <h2 id="de-title">Данж</h2>
                <span id="de-type" class="de-type"></span>
                <button id="de-close" class="de-btn">✕</button>
            </div>
            <div class="de-body">
                <p id="de-desc" class="de-desc"></p>
                <div id="de-reqs" class="de-reqs"></div>
                <div id="de-limits" class="de-limits"></div>
            </div>
            <div class="de-footer">
                <button id="de-enter" class="de-btn de-enter">⛩ Войти</button>
            </div>`;
        document.body.appendChild(this.entryWin);
    }

    createHudBanner() {
        this.banner = document.createElement('div');
        this.banner.id = 'dungeon-banner';
        this.banner.innerHTML = `
            <div class="db-top">
                <span id="db-name" class="db-name">Данж</span>
                <span id="db-timer" class="db-timer"></span>
                <button id="db-leave" class="db-btn">🚪 Выйти</button>
            </div>
            <div class="db-progress-wrap">
                <div id="db-progress" class="db-progress"></div>
            </div>
            <div id="db-progress-text" class="db-progress-text"></div>`;
        document.body.appendChild(this.banner);
    }

    createHint() {
        this.hint = document.createElement('div');
        this.hint.id = 'dungeon-hint';
        document.body.appendChild(this.hint);
    }

    injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
            #dungeon-entry {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
                width: 440px; max-width: 92vw; background: rgba(15,15,20,0.97);
                border: 2px solid #4488ff; border-radius: 12px; z-index: 650;
                display: none; flex-direction: column; font-family: 'Courier New', monospace; color: #ccc;
                box-shadow: 0 0 40px rgba(68,136,255,0.3);
            }
            #dungeon-entry.open { display: flex; }
            .de-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #444; }
            .de-header h2 { margin: 0; color: #4488ff; font-size: 17px; }
            .de-type { font-size: 11px; color: #888; background: #222; padding: 2px 8px; border-radius: 4px; }
            .de-btn { background: #333; border: 1px solid #666; color: #fff; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-family: inherit; }
            .de-btn:hover { border-color: #4488ff; }
            #de-close { margin-left: auto; }
            .de-body { padding: 16px; }
            .de-desc { color: #aaa; font-size: 12px; line-height: 1.5; margin: 0 0 12px; }
            .de-reqs, .de-limits { font-size: 12px; line-height: 1.8; }
            .de-reqs .req-ok { color: #44ff44; } .de-reqs .req-no { color: #ff4444; }
            .de-limits { color: #888; margin-top: 8px; }
            .de-footer { padding: 14px 16px; border-top: 1px solid #444; text-align: center; }
            .de-enter { padding: 10px 28px; font-size: 14px; background: #1a3a5a; border-color: #4488ff; }
            .de-enter:hover:not(:disabled) { background: #2a5a8a; }
            .de-enter:disabled { opacity: 0.4; cursor: not-allowed; }

            #dungeon-banner {
                position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
                width: 360px; max-width: 90vw; background: rgba(10,10,15,0.9);
                border: 1px solid #4488ff; border-radius: 10px; padding: 10px 14px;
                z-index: 420; display: none; font-family: 'Courier New', monospace;
            }
            #dungeon-banner.open { display: block; }
            .db-top { display: flex; align-items: center; gap: 10px; }
            .db-name { color: #4488ff; font-size: 13px; font-weight: bold; }
            .db-timer { color: #ffaa44; font-size: 13px; margin-left: auto; }
            .db-btn { background: #332222; border: 1px solid #664444; color: #ffaaaa; padding: 3px 8px; border-radius: 5px; cursor: pointer; font-size: 11px; font-family: inherit; }
            .db-progress-wrap { height: 8px; background: #222; border-radius: 4px; margin-top: 8px; overflow: hidden; }
            .db-progress { height: 100%; width: 0%; background: linear-gradient(90deg,#4488ff,#44ffaa); transition: width 0.3s; }
            .db-progress-text { font-size: 10px; color: #888; margin-top: 4px; }

            #dungeon-hint {
                position: fixed; bottom: 150px; left: 50%; transform: translateX(-50%);
                background: rgba(0,0,0,0.85); color: #4488ff; padding: 8px 16px;
                border-radius: 8px; font-family: 'Courier New', monospace; font-size: 13px;
                z-index: 410; display: none; border: 1px solid #4488ff;
            }
            #dungeon-hint.show { display: block; }
        `;
        document.head.appendChild(s);
    }

    bindEvents() {
        document.getElementById('de-close').onclick = () => this.closeEntry();
        document.getElementById('de-enter').onclick = () => {
            if (this._pendingDungeon) {
                this.dm.enter(this._pendingDungeon, this._partySize || 1);
                this.closeEntry();
            }
        };
        document.getElementById('db-leave').onclick = () => this.dm.exit(false);
                window.addEventListener('keydown', e => {
      if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
      if (e.key === 'Escape') this.closeEntry();   // F/E ведёт main.js (иначе openChest дважды)
    });
    }

    // === ОКНО ВХОДА ===
    openEntry(config, partySize = 1) {
        this._pendingDungeon = config.id;
        this._partySize = partySize;
        document.getElementById('de-title').textContent = config.name;
        const typeNames = { open: 'Открытый', instanced: 'Инстанс (пати)', vertical: 'Вертикальный', raid: 'Рейд' };
        document.getElementById('de-type').textContent = typeNames[config.type] || config.type;
        document.getElementById('de-desc').textContent = config.description;

        // Требования (зелёные/красные)
        const lvl = game.player.level;
        const reqs = [];
        reqs.push(this.reqLine(lvl >= config.levelReq, `Уровень ${config.levelReq}+`));
        if (config.partyReq) reqs.push(this.reqLine(partySize >= config.partyReq, `Группа ${config.partyReq}-${config.partyMax || 9}`));
        if (config.questReq) {
            const ok = game.questManager && (game.questManager.isActive(config.questReq) || game.questManager.isCompleted(config.questReq));
            reqs.push(this.reqLine(ok, 'Квест-допуск'));
        }
        if (config.keyItem) reqs.push(this.reqLine(game.inventory.hasItem(config.keyItem, 1), `Ключ: ${this.itemName(config.keyItem)}`));
        if (config.entranceFee) reqs.push(this.reqLine(game.inventory.currency >= config.entranceFee, `Плата: ${config.entranceFee}⚙️`));
        document.getElementById('de-reqs').innerHTML = reqs.join('');

        // Лимиты
        const lim = this.dm.getLimits(config.id);
        this.dm.rollDaily(config.id); this.dm.rollWeekly(config.id);
        const lims = [];
        if (config.dailyLimit) lims.push(`Входов сегодня: ${lim.dailyCount}/${config.dailyLimit}`);
        if (config.weeklyLimit) lims.push(`Входов за неделю: ${lim.weeklyCount}/${config.weeklyLimit}`);
        if (config.cooldown && lim.lastEntry) {
            const left = config.cooldown - (Date.now() - lim.lastEntry) / 1000;
            if (left > 0) lims.push(`Кулдаун: ${Math.ceil(left)}с`);
        }
        if (config.instanceDuration) lims.push(`Длительность: ${this.dm.formatTime(config.instanceDuration)}`);
        document.getElementById('de-limits').innerHTML = lims.length ? lims.join(' · ') : '';

        const allOk = reqs.every(r => r.includes('req-ok'));
        const btn = document.getElementById('de-enter');
        btn.disabled = !allOk;

        this.entryWin.classList.add('open');
    }
    closeEntry() { this.entryWin.classList.remove('open'); this._pendingDungeon = null; }
    reqLine(ok, text) {
        return `<div class="${ok ? 'req-ok' : 'req-no'}">${ok ? '✔' : '✘'} ${text}</div>`;
    }

    // === HUD-БАННЕР СЕССИИ ===
    onSessionStart(session, config) {
        this.session = session;
        document.getElementById('db-name').textContent = config.name;
        this.banner.classList.add('open');
    }
    onSessionEnd() {
        this.session = null;
        this.banner.classList.remove('open');
    }
    updateSession(session, config) {
        if (!session) return;
        // Таймер
        const timerEl = document.getElementById('db-timer');
        if (session.type === 'instance' && session.duration) {
            const left = session.duration - (Date.now() - session.startTime) / 1000;
            timerEl.textContent = '⏳ ' + this.dm.formatTime(Math.max(0, left));
        } else {
            timerEl.textContent = '';
        }
        // Прогресс
        const p = session.progress;
        const c = config.completion || {};
        let done = 0, total = 0;
        if (c.namedKills) { done += Math.min(p.namedKills, c.namedKills); total += c.namedKills; }
        if (c.bossKill) { done += p.bossKill ? 1 : 0; total += 1; }
        const pct = total ? (done / total) * 100 : 0;
        document.getElementById('db-progress').style.width = pct + '%';
        const parts = [];
        if (c.namedKills) parts.push(`Мини-боссы: ${p.namedKills}/${c.namedKills}`);
        if (c.bossKill) parts.push(`Босс: ${p.bossKill ? '✔' : '✘'}`);
        document.getElementById('db-progress-text').textContent = parts.join('  ·  ') + (session.completed ? '  ✅ ЗАЧИЩЕНО' : '');
    }

    // === ПОДСКАЗКИ У ВОРОТ / СУНДУКОВ (каждый кадр из main) ===
    updateHints(playerPos) {
        // Ворота
        const gate = this.dm.getGateAt(playerPos);
        this._nearGate = gate;
        // Сундук
        const chest = this.dm.getChestAt(playerPos);
        this._nearChest = chest;

        if (gate && !this.dm.isInDungeon()) {
            this.hint.textContent = `[F] ${gate.config.name} (Ур. ${gate.config.levelReq}+)`;
            this.hint.classList.add('show');
        } else if (chest) {
            this.hint.textContent = `[E] Открыть сундук` + (chest.config.bossGuarded ? ' 🔒' : '');
            this.hint.classList.add('show');
        } else if (this.dm.isInDungeon()) {
            this.hint.classList.remove('show');
        } else {
            this.hint.classList.remove('show');
        }
    }

    itemName(id) {
        return (typeof ITEM_DATABASE !== 'undefined' && ITEM_DATABASE[id]) ? ITEM_DATABASE[id].name : id;
    }
}

window.DungeonUI = DungeonUI;