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

    /** Спойл и крафт — только ремесленная линия (Мастеровой → Утилизатор / Котловой Кузнец). */
    isCraftsman() {
        const p = window.game && window.game.player;
        const cls = p && p.playerClass;
        const CSys = window.CLASS_SYSTEM;
        return !!(cls && CSys && CSys.isCraftsman && CSys.isCraftsman(cls));
    }

    /** Уровень ремесла (L2 Create Item) из изученных умений: 0 — крафт недоступен. */
    craftLevel() {
        const p = window.game && window.game.player;
        const learned = p && p.skillManager && p.skillManager.learnedSkills;
        const SKDB = window.SKILL_DB;
        if (!learned || !SKDB || typeof SKDB.craftLevel !== 'function') return 0;
        const map = {};
        Object.keys(learned).forEach((id) => {
            const e = learned[id];
            map[id] = (e && e.level) || (typeof e === 'number' ? e : 1);
        });
        return SKDB.craftLevel(map);
    }

    /** Уровень чертежа 1–4 (shared/game-rules.js recipeLevel). */
    recipeLevel(id) {
        const G = window.GAME_RULES;
        if (G && typeof G.recipeLevel === 'function') return G.recipeLevel(id);
        const rec = this.getRecipe(id);
        return rec ? (rec.cl || 1) : 0;
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
        /** 'craft' — сборка себе, 'workshop' — Мастерская, 'forge' — Паровой Горн */
        this.mode = 'craft';
        this.forgeNpcId = null;
        /** recipeId → {fee, minFee, chance, workshops} — плату Горна считает сервер */
        this.forgeQuotes = {};
        this.workshopOpen = false;
        /** recipeId → плата за попытку (черновик Мастерской) */
        this.workshopDraft = {};
        this.workshopTitle = '';
        this._build();
    }

    _itemName(id) {
        const db = window.ITEM_DATABASE;
        return (db && db[id] && db[id].name) || id;
    }

    _priceOf(id) {
        const db = window.ITEM_DATABASE;
        return (db && db[id] && +db[id].price) || 0;
    }

    _button(text, onClick, disabled) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.cssText = 'background:#281a10;color:#ffddbb;border:1px solid #806040;' +
            'padding:5px 10px;border-radius:3px;cursor:pointer;font:inherit;white-space:nowrap;';
        if (disabled) { btn.disabled = true; btn.style.opacity = '0.5'; }
        else if (onClick) btn.onclick = onClick;
        return btn;
    }

    _row() {
        const row = document.createElement('div');
        row.style.cssText = 'border:1px solid #3a3428;background:#12100c;border-radius:3px;' +
            'padding:7px 9px;margin-bottom:6px;';
        return row;
    }

    _matsHtml(rec) {
        const m = this.manager;
        return rec.mats.map((x) => {
            const have = m._count(x.id);
            return '<span style="color:' + (have >= x.n ? '#8fdc9a' : '#d98a8a') + ';">' +
                this._itemName(x.id) + ' ' + have + '/' + x.n + '</span>';
        }).join(' · ');
    }

    _note(text) {
        const d = document.createElement('div');
        d.style.cssText = 'color:#c8bfa8;font-size:11px;margin-bottom:6px;';
        d.textContent = text;
        return d;
    }

    _build() {
        const old = document.getElementById('l2-craft-window');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'l2-craft-window';
        el.style.cssText = [
            'position:fixed', 'top:14%', 'left:50%', 'transform:translateX(-50%)',
            'z-index:9200', 'width:min(560px,94vw)', 'max-height:74vh', 'overflow:auto',
            'background:linear-gradient(180deg,#2a2418 0%,#14110c 100%)',
            'border:2px solid #8a6a3a', 'border-radius:5px',
            'box-shadow:0 10px 34px rgba(0,0,0,0.75)', 'padding:10px 12px',
            'font:12px/1.45 Georgia,"Segoe UI",serif', 'color:#e8e0d0', 'display:none'
        ].join(';');
        el.innerHTML =
            '<div style="display:flex;justify-content:space-between;align-items:center;' +
            'border-bottom:1px solid #5a4220;padding-bottom:6px;margin-bottom:8px;gap:8px;">' +
            '<b id="l2-craft-title" style="color:#f0d080;font-size:14px;">Сборка</b>' +
            '<div id="l2-craft-tabs" style="display:flex;gap:4px;flex:1;justify-content:flex-end;"></div>' +
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

    /** Клавиша C: сборка себе и Мастерская — только Мастеровым. */
    open(force) {
        if (!this.manager.isCraftsman()) {
            this.close();
            if (window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Сборкой по чертежам занимаются только Мастеровые. ' +
                    'Без Мастерового можно заказать сборку у Парового Горна (Кузнец-Сборщик Кран).', 'system');
            }
            return;
        }
        if (!this.container) this._build();
        if (this.isOpen() && this.mode !== 'forge' && force !== true) { this.close(); return; }
        if (this.mode === 'forge') this.mode = 'craft';
        this.container.style.display = 'block';
        this.render();
    }

    /** Паровой Горн у NPC — для любого класса. */
    openForge(npcId) {
        if (!this.container) this._build();
        this.mode = 'forge';
        this.forgeNpcId = npcId || 'smith_kran';
        this.container.style.display = 'block';
        this.render();
        const net = window.game && window.game.net;
        if (net && typeof net.intentForgeList === 'function') net.intentForgeList(this.forgeNpcId);
    }

    /** Прейскурант Горна с сервера (полный или по одному рецепту после смены цены). */
    applyForgeList(m) {
        if (!m || !Array.isArray(m.recipes)) return;
        if (m.npcId) this.forgeNpcId = m.npcId;
        m.recipes.forEach((q) => { if (q && q.recipeId) this.forgeQuotes[q.recipeId] = q; });
        if (this.isOpen() && this.mode === 'forge') this.render();
    }

    setWorkshopOpen(flag) {
        this.workshopOpen = !!flag;
        if (this.isOpen() && this.mode === 'workshop') this.render();
    }

    close() {
        if (this.container) this.container.style.display = 'none';
    }

    _renderTabs() {
        const tabs = this.container.querySelector('#l2-craft-tabs');
        const title = this.container.querySelector('#l2-craft-title');
        if (!tabs || !title) return;
        tabs.innerHTML = '';
        if (this.mode === 'forge') {
            title.textContent = 'Паровой Горн';
            return;
        }
        title.textContent = this.mode === 'workshop' ? 'Мастерская' : 'Сборка';
        [['craft', 'Сборка'], ['workshop', 'Мастерская']].forEach(([id, label]) => {
            const b = this._button(label, () => { this.mode = id; this.render(); }, false);
            b.style.padding = '2px 8px';
            if (this.mode === id) { b.style.background = '#5a3f1c'; b.style.color = '#fff3d0'; }
            tabs.appendChild(b);
        });
    }

    render() {
        if (!this.container) return;
        const list = this.container.querySelector('#l2-craft-list');
        if (!list) return;
        this._renderTabs();
        list.innerHTML = '';
        if (this.mode === 'forge') this._renderForge(list);
        else if (this.mode === 'workshop') this._renderWorkshop(list);
        else this._renderCraft(list);
    }

    /** Сборка себе (Мастеровой, где угодно). */
    _renderCraft(list) {
        const m = this.manager;
        const recipes = m.allRecipes();
        if (!recipes.length) {
            list.innerHTML = '<div style="color:#8893a0;">Рецептов нет.</div>';
            return;
        }
        const myCraft = m.craftLevel();
        list.appendChild(this._note('Уровень ремесла: ' + myCraft +
            (myCraft < 4 ? ' · D-снаряжение собирает только Котловой Кузнец' : ' · книга рецептов Гильдии открыта')));
        recipes.forEach((rec) => {
            const learned = m.isLearned(rec.id);
            const hasScroll = m._count(m.scrollIdFor(rec.id)) >= 1;
            const row = this._row();
            const chance = Math.round((rec.chance != null ? rec.chance : 1) * 100);
            const needLvl = m.recipeLevel(rec.id);
            row.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<div>' +
                '<div style="color:#f5d475;font-weight:bold;">' + this._itemName(rec.result.id) +
                (rec.result.n > 1 ? (' ×' + rec.result.n) : '') + '</div>' +
                '<div style="color:#8893a0;font-size:10px;">Ур. ' + needLvl + ' · Шанс: ' + chance + '% · ' + this._matsHtml(rec) + '</div>' +
                '</div>' +
                '<div data-act style="flex:0 0 auto;"></div>' +
                '</div>';
            let btn;
            if (myCraft < needLvl) {
                btn = this._button(needLvl >= 4 ? 'Котловой Кузнец' : ('«Ремесло» ' + needLvl), null, true);
            } else if (!learned) {
                btn = this._button(hasScroll ? 'Изучить' : 'Нужен чертёж', () => m.learn(rec.id), !hasScroll);
            } else {
                const ready = m.hasMaterials(rec.id);
                btn = this._button('Собрать', () => m.craft(rec.id), !ready);
            }
            row.querySelector('[data-act]').appendChild(btn);
            list.appendChild(row);
        });
    }

    /** Мастерская: выбрать изученные рецепты и плату за попытку, открыть лавку-заказ. */
    _renderWorkshop(list) {
        const m = this.manager;
        const net = window.game && window.game.net;
        if (this.workshopOpen) {
            list.appendChild(this._note('Мастерская открыта. Пока она работает, вы стоите на месте и не собираете себе. ' +
                'Покупатели заказывают сборку из своих материалов, плата приходит вам.'));
            list.appendChild(this._button('Закрыть Мастерскую', () => {
                if (net && typeof net.intentStoreClose === 'function') net.intentStoreClose();
            }, false));
            return;
        }
        const G = window.GAME_RULES;
        const myCraft = m.craftLevel();
        const recipes = m.allRecipes().filter((r) => m.isLearned(r.id) && m.recipeLevel(r.id) <= myCraft);
        list.appendChild(this._note('Покупатель приносит материалы и платит за каждую попытку; шанс — ваш. ' +
            'Паровой Горн берёт заметно дороже и собирает хуже — назначьте плату ниже Горна.'));
        if (!recipes.length) {
            list.appendChild(this._note('Нет изученных чертежей для Мастерской.'));
            return;
        }
        const titleRow = document.createElement('div');
        titleRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;';
        titleRow.innerHTML = '<span style="color:#c8bfa8;">Вывеска:</span>';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.maxLength = 29;
        titleInput.placeholder = 'Мастерская на заказ';
        titleInput.value = this.workshopTitle;
        titleInput.style.cssText = 'flex:1;background:#0d0b08;color:#e8e0d0;border:1px solid #5a4220;padding:3px 6px;font:inherit;';
        titleInput.oninput = () => { this.workshopTitle = titleInput.value; };
        titleRow.appendChild(titleInput);
        list.appendChild(titleRow);

        recipes.forEach((rec) => {
            const minFee = G && typeof G.forgeMinFee === 'function' ? G.forgeMinFee(rec.id, (id) => this._priceOf(id)) : 0;
            const row = this._row();
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '8px';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = Object.prototype.hasOwnProperty.call(this.workshopDraft, rec.id);
            const info = document.createElement('div');
            info.style.flex = '1';
            info.innerHTML = '<div style="color:#f5d475;font-weight:bold;">' + this._itemName(rec.result.id) +
                (rec.result.n > 1 ? (' ×' + rec.result.n) : '') + '</div>' +
                '<div style="color:#8893a0;font-size:10px;">Шанс ' + Math.round((rec.chance != null ? rec.chance : 1) * 100) +
                '% · Горн берёт от ' + minFee.toLocaleString() + '⚙️</div>';
            const fee = document.createElement('input');
            fee.type = 'number';
            fee.min = '1';
            fee.style.cssText = 'width:90px;background:#0d0b08;color:#e8e0d0;border:1px solid #5a4220;padding:3px 6px;font:inherit;';
            fee.value = String(this.workshopDraft[rec.id] || Math.max(1, Math.round(minFee / 2)));
            const sync = () => {
                if (chk.checked) this.workshopDraft[rec.id] = Math.max(1, Math.floor(+fee.value) || 1);
                else delete this.workshopDraft[rec.id];
            };
            chk.onchange = sync;
            fee.oninput = sync;
            row.appendChild(chk);
            row.appendChild(info);
            row.appendChild(fee);
            row.appendChild(document.createTextNode('⚙️'));
            list.appendChild(row);
        });
        const picked = Object.keys(this.workshopDraft);
        list.appendChild(this._button('Открыть Мастерскую', () => {
            const offers = Object.keys(this.workshopDraft).map((id) => ({ recipeId: id, price: this.workshopDraft[id] }));
            if (!offers.length) {
                if (window.game) window.game.addChatMessage('Отметьте хотя бы один рецепт.', 'system');
                return;
            }
            if (net && typeof net.intentWorkshopOpen === 'function') net.intentWorkshopOpen(this.workshopTitle, offers);
        }, false));
        if (!picked.length) list.lastChild.title = 'Отметьте рецепты';
    }

    /** Паровой Горн: сборка для любого класса по чертежу-предмету из сумки. */
    _renderForge(list) {
        const m = this.manager;
        list.appendChild(this._note('Горн соберёт по вашему чертежу и без Мастерового, но невыгодно: ' +
            'чертёж сгорает за каждую попытку, шанс не выше 50%, а плата выше, чем у живых Мастерских.'));
        const recipes = m.allRecipes().filter((r) => m._count(m.scrollIdFor(r.id)) >= 1);
        if (!recipes.length) {
            list.appendChild(this._note('В сумке нет чертежей. Чертежи падают с машин и продаются у Архивариуса Скрипа.'));
            return;
        }
        const money = m._count('copper_parts');
        recipes.forEach((rec) => {
            const q = this.forgeQuotes[rec.id];
            const row = this._row();
            const chance = q ? Math.round(q.chance * 100) : null;
            const ws = q && q.workshops ? (' · Мастерских в сети: ' + q.workshops + ' — у них дешевле') : '';
            row.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">' +
                '<div>' +
                '<div style="color:#f5d475;font-weight:bold;">' + this._itemName(rec.result.id) +
                (rec.result.n > 1 ? (' ×' + rec.result.n) : '') + '</div>' +
                '<div style="color:#8893a0;font-size:10px;">' +
                (chance != null ? ('Шанс ' + chance + '% · ') : '') + 'чертёж сгорит · ' + this._matsHtml(rec) + ws + '</div>' +
                '</div>' +
                '<div data-act style="flex:0 0 auto;"></div>' +
                '</div>';
            const ready = !!q && m.hasMaterials(rec.id) && money >= q.fee;
            const label = q ? ('Заказать · ' + q.fee.toLocaleString() + '⚙️') : 'Загрузка…';
            const btn = this._button(label, () => {
                const net = window.game && window.game.net;
                if (net && typeof net.intentForgeCraft === 'function') net.intentForgeCraft(rec.id, this.forgeNpcId, q.fee);
            }, !ready);
            if (q && money < q.fee) btn.title = 'Не хватает медных деталей';
            row.querySelector('[data-act]').appendChild(btn);
            list.appendChild(row);
        });
    }
}

window.CraftManager = CraftManager;
window.CraftUI = CraftUI;
