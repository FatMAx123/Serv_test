// ============================================================
//  TRADE-UI.JS — окно обмена игрок ↔ игрок.
//  Клиент только рисует и отправляет намерения: содержимое предложений,
//  готовность сторон и сам перенос считает сервер (shared/trade-rules.js +
//  server tradeExecute). Локальных addItem/removeItem здесь нет и быть не
//  должно — иначе первая же синхронизация сумки сотрёт «обмен», как это
//  было с магазином до этапа 1.
// ============================================================
class TradeUI {
  constructor() {
    this.state = null;          // последний пакет trade_open / trade_update
    this.root = null;
    this.invite = null;
    this._injectStyles();
    this._buildDOM();
  }

  t(key, fallback) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      const v = window.i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback;
  }

  _injectStyles() {
    if (document.getElementById('l2trade-styles')) return;
    const st = document.createElement('style');
    st.id = 'l2trade-styles';
    st.textContent = `
      #l2trade-root {
        position: fixed; z-index: 10040; display: none;
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: min(560px, 94vw);
        background: linear-gradient(180deg, #1b2027 0%, #0d1014 100%);
        border: 1px solid #6b5a34; box-shadow: 0 10px 34px rgba(0,0,0,.75);
        font-family: 'Segoe UI', Tahoma, sans-serif; color: #cfd8e3;
      }
      #l2trade-root.open { display: block; }
      .l2trade-bar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 7px 10px; background: linear-gradient(180deg, #2a2418, #14110c);
        border-bottom: 1px solid #6b5a34; cursor: grab;
      }
      .l2trade-title { font-family: 'Cinzel', serif; color: #e5c158; font-size: 13px; font-weight: 700; }
      .l2trade-x {
        background: transparent; border: 0; color: #c9b98d; font-size: 15px; cursor: pointer; line-height: 1;
      }
      .l2trade-cols { display: flex; gap: 8px; padding: 8px 10px; }
      .l2trade-col { flex: 1 1 0; min-width: 0; }
      .l2trade-col-head {
        display: flex; justify-content: space-between; align-items: baseline;
        font-size: 11px; color: #98a2ad; margin-bottom: 4px;
      }
      .l2trade-ready { color: #6ee7b7; }
      .l2trade-wait { color: #8893a0; }
      .l2trade-list {
        display: flex; flex-direction: column; gap: 4px;
        background: rgba(10,14,18,.85); border: 1px solid #2e3844; padding: 5px;
        min-height: 132px; max-height: 200px; overflow-y: auto;
      }
      .l2trade-row {
        display: flex; align-items: center; gap: 6px;
        background: rgba(14,18,23,.85); border: 1px solid #3c4856; padding: 4px 6px;
        font-size: 11px; color: #cfd8e3;
      }
      .l2trade-row.mine { cursor: pointer; }
      .l2trade-row.mine:hover { border-color: #f5d475; background: rgba(32,42,54,.95); }
      .l2trade-ico { flex: 0 0 auto; font-size: 15px; line-height: 1; }
      .l2trade-ico img { width: 18px; height: 18px; display: block; }
      .l2trade-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .l2trade-cnt { flex: 0 0 auto; color: #f5d475; }
      .l2trade-plus { flex: 0 0 auto; color: #6ee7b7; }
      .l2trade-empty { color: #8893a0; padding: 4px; font-size: 11px; }
      .l2trade-foot {
        display: flex; gap: 8px; align-items: center; justify-content: flex-end;
        padding: 8px 10px; border-top: 1px solid #2e3844;
      }
      .l2trade-hint { flex: 1 1 auto; font-size: 10.5px; color: #8893a0; }
      .l2trade-btn {
        background: linear-gradient(180deg, #40331b 0%, #241d10 100%);
        border: 1px solid #6b5a34; color: #f0e2b6; padding: 5px 12px; cursor: pointer;
        font: inherit; font-size: 11.5px;
      }
      .l2trade-btn:hover:not(:disabled) { border-color: #f5d475; color: #fff2c8; }
      .l2trade-btn:disabled { opacity: .45; cursor: default; }
      #l2trade-invite {
        position: fixed; z-index: 10050; display: none;
        left: 50%; top: 28%; transform: translate(-50%, -50%);
        background: linear-gradient(180deg, #1b2027 0%, #0d1014 100%);
        border: 1px solid #6b5a34; padding: 14px 16px; text-align: center;
        font-family: 'Segoe UI', Tahoma, sans-serif; color: #cfd8e3; font-size: 12px;
      }
      #l2trade-invite.open { display: block; }
      #l2trade-invite .l2trade-foot { border: 0; justify-content: center; padding: 10px 0 0; }
    `;
    document.head.appendChild(st);
  }

  _buildDOM() {
    this.root = document.createElement('div');
    this.root.id = 'l2trade-root';
    this.root.innerHTML = `
      <div class="l2trade-bar" id="l2trade-bar">
        <span class="l2trade-title" id="l2trade-title">Обмен</span>
        <button type="button" class="l2trade-x" id="l2trade-close">✕</button>
      </div>
      <div class="l2trade-cols">
        <div class="l2trade-col">
          <div class="l2trade-col-head">
            <span>Вы отдаёте</span>
            <span id="l2trade-mine-state" class="l2trade-wait"></span>
          </div>
          <div class="l2trade-list" id="l2trade-mine"></div>
        </div>
        <div class="l2trade-col">
          <div class="l2trade-col-head">
            <span id="l2trade-peer-label">Партнёр отдаёт</span>
            <span id="l2trade-peer-state" class="l2trade-wait"></span>
          </div>
          <div class="l2trade-list" id="l2trade-theirs"></div>
        </div>
      </div>
      <div class="l2trade-foot">
        <span class="l2trade-hint" id="l2trade-hint"></span>
        <button type="button" class="l2trade-btn" id="l2trade-lock">Готово</button>
        <button type="button" class="l2trade-btn" id="l2trade-confirm">Подтвердить</button>
        <button type="button" class="l2trade-btn" id="l2trade-cancel">Отмена</button>
      </div>
    `;
    document.body.appendChild(this.root);

    this.invite = document.createElement('div');
    this.invite.id = 'l2trade-invite';
    this.invite.innerHTML = `
      <div id="l2trade-invite-text"></div>
      <div class="l2trade-foot">
        <button type="button" class="l2trade-btn" id="l2trade-inv-ok">Принять</button>
        <button type="button" class="l2trade-btn" id="l2trade-inv-no">Отказаться</button>
      </div>
    `;
    document.body.appendChild(this.invite);

    const net = () => (window.game && window.game.net) || null;
    document.getElementById('l2trade-close').onclick = () => this._cancel();
    document.getElementById('l2trade-cancel').onclick = () => this._cancel();
    document.getElementById('l2trade-lock').onclick = () => { const n = net(); if (n) n.intentTradeLock(); };
    document.getElementById('l2trade-confirm').onclick = () => { const n = net(); if (n) n.intentTradeConfirm(); };
    document.getElementById('l2trade-inv-ok').onclick = () => {
      const n = net();
      if (n && this._invitePid != null) n.intentTradeAccept(this._invitePid);
      this.invite.classList.remove('open');
    };
    document.getElementById('l2trade-inv-no').onclick = () => { this.invite.classList.remove('open'); };
    this._initDrag();
  }

  _initDrag() {
    const bar = document.getElementById('l2trade-bar');
    if (!bar) return;
    let dx = 0, dy = 0, dragging = false;
    const onMove = (e) => {
      if (!dragging) return;
      this.root.style.left = (e.clientX - dx) + 'px';
      this.root.style.top = (e.clientY - dy) + 'px';
      this.root.style.transform = 'none';
    };
    const onUp = () => {
      dragging = false;
      bar.style.cursor = 'grab';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    bar.addEventListener('mousedown', (e) => {
      const r = this.root.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      dragging = true;
      bar.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  isOpen() { return !!(this.root && this.root.classList.contains('open')); }

  /** Есть ли активная сессия — по ней inventory-ui показывает «В обмен». */
  isActive() { return !!(this.state && this.isOpen()); }

  _cancel() {
    const net = window.game && window.game.net;
    if (net && typeof net.intentTradeCancel === 'function') net.intentTradeCancel();
    this.close();
  }

  /** Приглашение от другого игрока (пакет trade_invite). */
  showInvite(m) {
    this._invitePid = m && m.from != null ? m.from : null;
    const el = document.getElementById('l2trade-invite-text');
    if (el) el.textContent = (m && m.fromName ? m.fromName : 'Игрок') + ' предлагает обмен.';
    this.invite.classList.add('open');
  }

  /** Отрисовать состояние из trade_open / trade_update. */
  apply(m) {
    if (!m) return;
    this.state = m;
    this.root.classList.add('open');
    this.invite.classList.remove('open');
    const title = document.getElementById('l2trade-title');
    if (title) title.textContent = 'Обмен: ' + (m.peerName || 'игрок');
    const peerLabel = document.getElementById('l2trade-peer-label');
    if (peerLabel) peerLabel.textContent = (m.peerName || 'Партнёр') + ' отдаёт';

    const mine = (m.mine && m.mine.offer) || {};
    const theirs = (m.theirs && m.theirs.offer) || {};
    this._renderList('l2trade-mine', mine, m.plusById || null, true);
    this._renderList('l2trade-theirs', theirs, null, false);

    const stateText = (side) => {
      if (!side) return '';
      if (side.confirmed) return '✔ подтвердил';
      if (side.locked) return '✔ готов';
      return 'выбирает';
    };
    const mineState = document.getElementById('l2trade-mine-state');
    const peerState = document.getElementById('l2trade-peer-state');
    if (mineState) {
      mineState.textContent = stateText(m.mine);
      mineState.className = (m.mine && m.mine.locked) ? 'l2trade-ready' : 'l2trade-wait';
    }
    if (peerState) {
      peerState.textContent = stateText(m.theirs);
      peerState.className = (m.theirs && m.theirs.locked) ? 'l2trade-ready' : 'l2trade-wait';
    }

    const bothLocked = !!(m.mine && m.mine.locked && m.theirs && m.theirs.locked);
    const lockBtn = document.getElementById('l2trade-lock');
    const okBtn = document.getElementById('l2trade-confirm');
    if (lockBtn) lockBtn.disabled = !!(m.mine && m.mine.locked);
    if (okBtn) okBtn.disabled = !bothLocked || !!(m.mine && m.mine.confirmed);
    const hint = document.getElementById('l2trade-hint');
    if (hint) {
      hint.textContent = bothLocked
        ? 'Оба готовы — нажмите «Подтвердить». Перенос сделает сервер.'
        : 'Добавляйте вещи из сумки (ПКМ → «В обмен»), клик по строке убирает.';
    }
  }

  _renderList(elId, offer, plusMap, mine) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    const ids = Object.keys(offer).filter((id) => (offer[id] | 0) > 0);
    if (!ids.length) {
      el.innerHTML = '<div class="l2trade-empty">Пусто.</div>';
      return;
    }
    const nameOf = (id) => {
      const tpl = (window.ITEM_DATABASE || {})[id];
      if (tpl && tpl.name) return tpl.name;
      const meta = (window.NPCS && window.NPCS.itemMeta) ? window.NPCS.itemMeta(id) : null;
      return (meta && meta.name) || id;
    };
    ids.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    ids.forEach((id) => {
      const count = offer[id] | 0;
      const plus = (plusMap && plusMap[id]) ? (plusMap[id] | 0) : 0;
      const tpl = window.ensureItemTemplate ? window.ensureItemTemplate(id) : (window.ITEM_DATABASE || {})[id];
      const ico = (typeof getItemIconHtml === 'function') ? getItemIconHtml(tpl || { icon: '📦' }) : '📦';
      const row = document.createElement('div');
      row.className = 'l2trade-row' + (mine ? ' mine' : '');
      row.innerHTML = `
        <span class="l2trade-ico">${ico}</span>
        <span class="l2trade-name"></span>
        ${plus > 0 ? `<span class="l2trade-plus">+${plus}</span>` : ''}
        ${count > 1 ? `<span class="l2trade-cnt">×${count}</span>` : ''}
      `;
      row.querySelector('.l2trade-name').textContent = nameOf(id);
      if (mine) {
        row.title = 'Убрать из обмена (Shift — всё)';
        row.addEventListener('click', (e) => {
          const net = window.game && window.game.net;
          if (!net) return;
          net.intentTradeRemove(id, e && e.shiftKey ? count : 1);
        });
      }
      el.appendChild(row);
    });
  }

  /** Положить предмет в обмен (зовёт контекстное меню инвентаря). */
  add(itemId, count) {
    const net = window.game && window.game.net;
    if (!net || typeof net.intentTradeAdd !== 'function') return;
    net.intentTradeAdd(itemId, count != null ? count : 1);
  }

  close() {
    this.state = null;
    this._invitePid = null;
    if (this.root) this.root.classList.remove('open');
    if (this.invite) this.invite.classList.remove('open');
  }
}

window.TradeUI = TradeUI;

// ============================================================
//  STOREVIEW — витрина ЧУЖОЙ личной лавки.
//  Своя лавка живёт в private-store.js (окно настройки), а покупателю нужна
//  только витрина: список позиций и кнопка сделки. Цены, наличие и перенос
//  считает сервер (store_list / store_buy / store_sell).
// ============================================================
class StoreView {
  constructor() {
    this.pid = null;
    this.mode = 'sell';
    this.root = document.createElement('div');
    this.root.id = 'l2store-root';
    this.root.className = 'l2trade-root-like';
    this.root.innerHTML = `
      <div class="l2trade-bar" id="l2store-bar">
        <span class="l2trade-title" id="l2store-title">Лавка</span>
        <button type="button" class="l2trade-x" id="l2store-close">✕</button>
      </div>
      <div class="l2trade-cols" style="display:block;">
        <div class="l2trade-col-head">
          <span id="l2store-sub">Товары</span>
          <span class="l2trade-cnt" id="l2store-money"></span>
        </div>
        <div class="l2trade-list" id="l2store-list"></div>
      </div>
      <div class="l2trade-foot">
        <span class="l2trade-hint" id="l2store-hint">Клик по строке — сделка (Shift — всё).</span>
        <button type="button" class="l2trade-btn" id="l2store-cancel">Закрыть</button>
      </div>
    `;
    this._styles();
    document.body.appendChild(this.root);
    document.getElementById('l2store-close').onclick = () => this.close();
    document.getElementById('l2store-cancel').onclick = () => this.close();
  }

  _styles() {
    if (document.getElementById('l2store-styles')) return;
    const st = document.createElement('style');
    st.id = 'l2store-styles';
    st.textContent = `
      #l2store-root {
        position: fixed; z-index: 10041; display: none;
        left: 50%; top: 46%; transform: translate(-50%, -50%);
        width: min(420px, 92vw);
        background: linear-gradient(180deg, #1b2027 0%, #0d1014 100%);
        border: 1px solid #6b5a34; box-shadow: 0 10px 34px rgba(0,0,0,.75);
        font-family: 'Segoe UI', Tahoma, sans-serif; color: #cfd8e3;
      }
      #l2store-root.open { display: block; }
    `;
    document.head.appendChild(st);
  }

  isOpen() { return this.root.classList.contains('open'); }

  /** Открыть витрину игрока: содержимое запрашиваем у сервера. */
  open(pid, name) {
    this.pid = pid;
    const t = document.getElementById('l2store-title');
    if (t) t.textContent = 'Лавка: ' + (name || 'игрок');
    const list = document.getElementById('l2store-list');
    if (list) list.innerHTML = '<div class="l2trade-empty">Загрузка…</div>';
    this.root.classList.add('open');
    const net = window.game && window.game.net;
    if (net && typeof net.intentStoreList === 'function') net.intentStoreList(pid);
  }

  /** Отрисовать пакет store_list. */
  apply(m) {
    if (!m || !this.isOpen()) return;
    if (this.pid != null && m.pid != null && m.pid !== this.pid) return;
    this.pid = m.pid;
    this.mode = m.mode || 'sell';
    const title = document.getElementById('l2store-title');
    if (title) title.textContent = 'Лавка: ' + (m.name || '') + (m.title ? (' — «' + m.title + '»') : '');
    const sub = document.getElementById('l2store-sub');
    if (sub) sub.textContent = this.mode === 'buy' ? 'Скупает' : 'Продаёт';
    const money = document.getElementById('l2store-money');
    if (money) money.textContent = (m.currency || 0).toLocaleString() + '⚙️';
    const hint = document.getElementById('l2store-hint');
    if (hint) {
      hint.textContent = this.mode === 'buy'
        ? 'Клик по строке — продать владельцу (Shift — всё).'
        : 'Клик по строке — купить (Shift — всё).';
    }
    const list = document.getElementById('l2store-list');
    if (!list) return;
    list.innerHTML = '';
    const items = Array.isArray(m.items) ? m.items : [];
    if (!items.length) {
      list.innerHTML = '<div class="l2trade-empty">Пусто.</div>';
      return;
    }
    items.forEach((it) => {
      const tpl = window.ensureItemTemplate ? window.ensureItemTemplate(it.itemId) : null;
      const ico = (typeof getItemIconHtml === 'function') ? getItemIconHtml(tpl || { icon: '📦' }) : '📦';
      const row = document.createElement('div');
      row.className = 'l2trade-row mine';
      row.innerHTML = `
        <span class="l2trade-ico">${ico}</span>
        <span class="l2trade-name"></span>
        <span class="l2trade-cnt">×${it.count | 0}</span>
        <span class="l2trade-plus">${(it.price | 0).toLocaleString()}⚙️</span>
      `;
      row.querySelector('.l2trade-name').textContent = it.name || it.itemId;
      row.addEventListener('click', (e) => {
        const net = window.game && window.game.net;
        if (!net) return;
        const n = (e && e.shiftKey) ? (it.count | 0) : 1;
        if (this.mode === 'buy') net.intentStoreSell(this.pid, it.itemId, n);
        else net.intentStoreBuy(this.pid, it.itemId, n);
      });
      list.appendChild(row);
    });
  }

  close() {
    this.pid = null;
    this.root.classList.remove('open');
  }
}

window.StoreView = StoreView;
