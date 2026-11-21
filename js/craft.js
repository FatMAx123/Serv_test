// ============================================
// PROJECT STEAM: ORIGINS — CRAFT.JS
// Крафт: изучение чертежей и сборка предметов.
// АВТОРИТЕТ СЕРВЕРА: рецепты — shared/game-rules.js RECIPES, проверка
// материалов, шанс и выдача — серверные интенты craft / learn.
//
// Раньше main.js:139 создавал CraftManager/CraftUI, а файлов с этими классами
// в проекте не было: safe() глушил ошибку, клавиша C ничего не открывала,
// хотя серверные интенты craft/learn работали.
// ============================================

class CraftManager {
    constructor() {
        /** id рецептов, изученных персонажем (приходит с сервера в welcome.learned) */
        this.learnedRecipes = new Set();
    }

    /** Все рецепты из shared. */
    allRecipes() {
        const G = window.GAME_RULES;
        if (!G || !G.RECIPES) return [];
        return Object.keys(G.RECIPES).map((id) => Object.assign({ id }, G.RECIPES[id]));
    }

    getRecipe(id) {
        const G = window.GAME_RULES;
        if (!G || !G.RECIPES) return null;
        return Object.prototype.hasOwnProperty.call(G.RECIPES, id)
            ? Object.assign({ id }, G.RECIPES[id]) : null;
    }

    isLearned(id) {
        return this.learnedRecipes.has(id);
    }

    /** Чертёж-предмет для изучения рецепта. */
    scrollIdFor(id) {
        return 'recipe_' + id;
    }

    /** Есть ли материалы на рецепт (по локальной копии серверного инвентаря). */
    hasMaterials(id) {
        const rec = this.getRecipe(id);
        const inv = window.game && window.game.inventory;
        if (!rec || !inv) return false;
        return rec.mats.every((m) => this._count(m.id) >= m.n);
    }

    _count(itemId) {
        const g = window.game;
        // _serverInv — последняя серверная сумка (net-ws applyInv), валюта отдельно
        const srv = g && g._serverInv;
        if (srv && Object.prototype.hasOwnProperty.call(srv, itemId)) return srv[itemId] | 0;
        const inv = g && g.inventory;
        if (!inv) return 0;
        if (itemId === 'copper_parts') return inv.currency | 0;
        return typeof inv.getItemCount === 'function' ? inv.getItemCount(itemId) : 0;
    }

    /** Изучить чертёж (расходует recipe_<id> из сумки). */
    learn(id) {
        const net = window.game && window.game.net;
        if (!net || typeof net.intentLearn !== 'function') {
            if (window.game) window.game.addChatMessage('Нет связи с сервером.', 'system');
            return false;
        }
        net.intentLearn(id);
        return true;
    }

    /** Собрать предмет. Материалы списывает сервер (даже при провале). */
    craft(id) {
        const net = window.game && window.game.net;
        if (!net || typeof net.intentCraft !== 'function') {
            if (window.game) window.game.addChatMessage('Нет связи с сервером.', 'system');
            return false;
        }
        if (!this.isLearned(id)) {
            if (window.game) window.game.addChatMessage('Чертёж не изучен.', 'system');
            return false;
        }
        net.intentCraft(id);
        return true;
    }
}

// ============================================
// UI (клавиша C)
// ============================================
class CraftUI {
    constructor(manager) {
        this.manager = manager;
        this.container = null;
        this.selected = null;
        this._build();
    }

    _itemName(id) {
        const db = window.ITEM_DATABASE;
        return (db && db[id] && db[id].name) || id;
    }

    _build() {
        const old = document.getElementById('l2-craft-window');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'l2-craft-window';
        el.style.cssText = [
            'position:fixed', 'top:14%', 'left:50%', 'transform:translateX(-50%)',
            'z-index:9200', 'width:min(520px,94vw)', 'max-height:74vh', 'overflow:auto',
            'background:linear-gradient(180deg,#2a2418 0%,#14110c 100%)',
            'border:2px solid #8a6a3a', 'border-radius:5px',
            'box-shadow:0 10px 34px rgba(0,0,0,0.75)', 'padding:10px 12px',
            'font:12px/1.45 Georgia,"Segoe UI",serif', 'color:#e8e0d0', 'display:none'
        ].join(';');
        el.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'border-bottom:1px solid #5a4220;padding-bottom:6px;margin-bottom:8px;">' +
            '<b style="color:#f0d080;font-size:14px;">Сборка</b>' +
            '<button type="button" id="l2-craft-close" style="background:transparent;border:1px solid #6a5a3a;' +
            'color:#c8bfa8;border-radius:3px;cursor:pointer;padding:2px 8px;font:inherit;">✕</button>' +
            '</div>' +
            '<div id="l2-craft-list"></div>';
        document.body.appendChild(el);
        this.container = el;
        el.querySelector('#l2-craft-close').onclick = () => this.close();
    }

    isOpen() {
        return !!(this.container && this.container.style.display !== 'none');
    }

    open(force) {
        if (!this.container) this._build();
        if (this.isOpen() && force !== true) { this.close(); return; }
        this.container.style.display = 'block';
        this.render();
    }

    close() {
        if (this.container) this.container.style.display = 'none';
    }

    render() {
        if (!this.container) return;
        const list = this.container.querySelector('#l2-craft-list');
        if (!list) return;
        const m = this.manager;
        const recipes = m.allRecipes();
        if (!recipes.length) {
            list.innerHTML = '<div style="color:#8893a0;">Рецептов нет.</div>';
            return;
        }
        list.innerHTML = '';
        recipes.forEach((rec) => {
            const learned = m.isLearned(rec.id);
            const scroll = m.scrollIdFor(rec.id);
            const hasScroll = m._count(scroll) >= 1;
            const row = document.createElement('div');
            row.style.cssText = 'border:1px solid #3a3428;background:#12100c;border-radius:3px;' +
                'padding:7px 9px;margin-bottom:6px;';
            const mats = rec.mats.map((x) => {
                const have = m._count(x.id);
                const okMat = have >= x.n;
                return '<span style="color:' + (okMat ? '#8fdc9a' : '#d98a8a') + ';">' +
                    this._itemName(x.id) + ' ' + have + '/' + x.n + '</span>';
            }).join(' · ');
            const chance = Math.round((rec.chance != null ? rec.chance : 1) * 100);
            row.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<div>' +
                '<div style="color:#f5d475;font-weight:bold;">' + this._itemName(rec.result.id) +
                (rec.result.n > 1 ? (' ×' + rec.result.n) : '') + '</div>' +
                '<div style="color:#8893a0;font-size:10px;">Шанс: ' + chance + '% · ' + mats + '</div>' +
                '</div>' +
                '<div data-act style="flex:0 0 auto;"></div>' +
                '</div>';
            const actBox = row.querySelector('[data-act]');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.style.cssText = 'background:#281a10;color:#ffddbb;border:1px solid #806040;' +
                'padding:5px 10px;border-radius:3px;cursor:pointer;font:inherit;white-space:nowrap;';
            if (!learned) {
                btn.textContent = hasScroll ? 'Изучить' : 'Нужен чертёж';
                btn.disabled = !hasScroll;
                if (hasScroll) btn.onclick = () => m.learn(rec.id);
            } else {
                const ready = m.hasMaterials(rec.id);
                btn.textContent = 'Собрать';
                btn.disabled = !ready;
                if (ready) btn.onclick = () => m.craft(rec.id);
            }
            if (btn.disabled) btn.style.opacity = '0.5';
            actBox.appendChild(btn);
            list.appendChild(row);
        });
    }
}

window.CraftManager = CraftManager;
window.CraftUI = CraftUI;
