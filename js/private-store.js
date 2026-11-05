// ============================================
// PRIVATE-STORE.JS — L2 Private Store (личная лавка)
// Sell = выставить предметы на продажу (цена в adena)
// Buy  = список покупок (что ищете + макс. цена)
// Правила C1/Interlude:
//  - нельзя одновременно Sell и Buy;
//  - при активной лавке нельзя атаковать / кастовать / двигаться (cancel first);
//  - закрытие = снять лавку, предметы возвращаются в инвентарь (sell list).
// ============================================

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function chat(text, type) {
    if (window.game && window.game.addChatMessage) window.game.addChatMessage(text, type || 'system');
  }

  function inv() {
    return (window.game && window.game.inventory) || null;
  }

  function player() {
    return (window.game && window.game.player) || null;
  }

  /**
   * @typedef {{ uid: string, itemId: string, name: string, count: number, price: number, icon?: string }} SellSlot
   * @typedef {{ itemId: string, name: string, count: number, maxPrice: number, icon?: string }} BuySlot
   */
  class PrivateStore {
    constructor() {
      /** @type {'none'|'sell_setup'|'sell_active'|'buy_setup'|'buy_active'} */
      this.mode = 'none';
      /** @type {SellSlot[]} */
      this.sellList = [];
      /** @type {BuySlot[]} */
      this.buyList = [];
      this.title = '';
      this.maxSlots = 8; // L2 private store ~8 slots typical UI
      this._root = null;
      this._build();
    }

    isActive() {
      return this.mode === 'sell_active' || this.mode === 'buy_active';
    }

    isSetup() {
      return this.mode === 'sell_setup' || this.mode === 'buy_setup';
    }

    /** Блокировка боя/каста/движения при активной лавке (L2). */
    blocksCombat() {
      return this.isActive();
    }

    blocksMove() {
      return this.isActive();
    }

    openSell() {
      if (this.mode === 'buy_active' || this.mode === 'buy_setup') {
        chat('Сначала закройте лавку покупки.', 'system');
        return;
      }
      if (this.mode === 'sell_active') {
        this.openManage();
        return;
      }
      this.mode = 'sell_setup';
      if (!this.sellList.length) this.sellList = [];
      if (!this.title) this.title = 'Продаю';
      this._render();
      this._show();
    }

    openBuy() {
      if (this.mode === 'sell_active' || this.mode === 'sell_setup') {
        chat('Сначала закройте лавку продажи.', 'system');
        return;
      }
      if (this.mode === 'buy_active') {
        this.openManage();
        return;
      }
      this.mode = 'buy_setup';
      if (!this.buyList.length) this.buyList = [];
      if (!this.title) this.title = 'Куплю';
      this._render();
      this._show();
    }

    openManage() {
      this._render();
      this._show();
    }

    closeWindow() {
      // только UI setup; активную лавку не снимает
      if (this.isSetup()) {
        // отмена настройки без старта
        if (this.mode === 'sell_setup') {
          this.sellList = [];
          this.mode = 'none';
        } else if (this.mode === 'buy_setup') {
          this.buyList = [];
          this.mode = 'none';
        }
      }
      this._hide();
    }

    /** Запуск лавки (после заполнения списка). */
    start() {
      if (this.mode === 'sell_setup') {
        if (!this.sellList.length) {
          chat('Добавьте предметы в лавку продажи.', 'system');
          return;
        }
        for (var i = 0; i < this.sellList.length; i++) {
          if (!(this.sellList[i].price > 0)) {
            chat('Укажите цену для всех предметов (в деталях).', 'system');
            return;
          }
        }
        // L2: предметы «зарезервированы» в лавке (здесь — пометка; полный lock в invent. позже)
        this.mode = 'sell_active';
        this._applyActiveFlags(true);
        this._syncNet('open_sell');
        chat('Личная лавка (продажа) открыта. Движение и бой недоступны, пока лавка активна.', 'system');
        this._render();
        return;
      }
      if (this.mode === 'buy_setup') {
        if (!this.buyList.length) {
          chat('Добавьте позиции в список покупок.', 'system');
          return;
        }
        for (var j = 0; j < this.buyList.length; j++) {
          if (!(this.buyList[j].maxPrice > 0) || !(this.buyList[j].count > 0)) {
            chat('Укажите кол-во и макс. цену для каждой позиции.', 'system');
            return;
          }
        }
        this.mode = 'buy_active';
        this._applyActiveFlags(true);
        this._syncNet('open_buy');
        chat('Личная лавка (покупка) открыта. Движение и бой недоступны, пока лавка активна.', 'system');
        this._render();
        return;
      }
    }

    /** Снять лавку (L2: Cancel Private Store). */
    cancelStore() {
      if (!this.isActive() && !this.isSetup()) {
        this._hide();
        return;
      }
      var was = this.mode;
      this.mode = 'none';
      this.sellList = [];
      this.buyList = [];
      this.title = '';
      this._applyActiveFlags(false);
      this._syncNet('close');
      if (was === 'sell_active' || was === 'buy_active') {
        chat('Личная лавка закрыта.', 'system');
      }
      this._hide();
    }

    _applyActiveFlags(on) {
      var p = player();
      if (!p) return;
      p.privateStoreActive = !!on;
      p.privateStoreMode = on ? this.mode : 'none';
      if (on) {
        // L2: sit while store (visual / regen pose)
        p.isSitting = true;
        p.isMoving = false;
      } else {
        p.isSitting = false;
      }
    }

    _syncNet(action) {
      if (!window.game || !window.game.net) return;
      var net = window.game.net;
      if (typeof net.intentPrivateStore === 'function') {
        net.intentPrivateStore({
          action: action,
          mode: this.mode,
          title: this.title,
          sell: this.sellList,
          buy: this.buyList
        });
      }
    }

    // ─── sell list ops ───
    addSellFromInventory(uid, count, price) {
      if (this.mode !== 'sell_setup') return false;
      if (this.sellList.length >= this.maxSlots) {
        chat('Лавка заполнена (макс. ' + this.maxSlots + ').', 'system');
        return false;
      }
      var inventory = inv();
      if (!inventory || !inventory.slots) return false;
      var item = null;
      for (var i = 0; i < inventory.slots.length; i++) {
        if (inventory.slots[i] && inventory.slots[i].uid === uid) {
          item = inventory.slots[i];
          break;
        }
      }
      if (!item) {
        chat('Предмет не найден в инвентаре.', 'system');
        return false;
      }
      var tpl = item.template || item;
      var have = item.count || 1;
      count = Math.max(1, Math.min(have, count | 0 || 1));
      price = Math.max(1, price | 0 || 1);
      // already in list?
      for (var s = 0; s < this.sellList.length; s++) {
        if (this.sellList[s].uid === uid) {
          this.sellList[s].count = count;
          this.sellList[s].price = price;
          this._render();
          return true;
        }
      }
      this.sellList.push({
        uid: uid,
        itemId: item.id || tpl.id,
        name: tpl.name || item.name || item.id,
        count: count,
        price: price,
        icon: tpl.icon || item.icon || '📦'
      });
      this._render();
      return true;
    }

    removeSell(idx) {
      if (this.mode !== 'sell_setup') return;
      this.sellList.splice(idx, 1);
      this._render();
    }

    addBuyEntry(itemId, name, count, maxPrice, icon) {
      if (this.mode !== 'buy_setup') return false;
      if (this.buyList.length >= this.maxSlots) {
        chat('Список покупок заполнен.', 'system');
        return false;
      }
      count = Math.max(1, count | 0 || 1);
      maxPrice = Math.max(1, maxPrice | 0 || 1);
      this.buyList.push({
        itemId: itemId || 'unknown',
        name: name || itemId || 'Предмет',
        count: count,
        maxPrice: maxPrice,
        icon: icon || '📦'
      });
      this._render();
      return true;
    }

    removeBuy(idx) {
      if (this.mode !== 'buy_setup') return;
      this.buyList.splice(idx, 1);
      this._render();
    }

    // ─── UI ───
    _build() {
      this._root = document.createElement('div');
      this._root.id = 'l2-private-store';
      this._root.className = 'l2ps-root';
      this._root.innerHTML =
        '<div class="l2ps-titlebar" id="l2ps-titlebar">' +
        '  <span class="l2ps-title-text" id="l2ps-title">Личная лавка</span>' +
        '  <button type="button" class="l2ps-close" id="l2ps-close">✕</button>' +
        '</div>' +
        '<div class="l2ps-body" id="l2ps-body"></div>';
      document.body.appendChild(this._root);

      var self = this;
      document.getElementById('l2ps-close').addEventListener('click', function () {
        if (self.isActive()) {
          // L2: X on active store → ask cancel
          self.cancelStore();
        } else {
          self.closeWindow();
        }
      });

      // drag window
      var bar = document.getElementById('l2ps-titlebar');
      var drag = null;
      bar.addEventListener('mousedown', function (e) {
        if (e.target.closest('button')) return;
        drag = { x: e.clientX - self._root.offsetLeft, y: e.clientY - self._root.offsetTop };
      });
      window.addEventListener('mousemove', function (e) {
        if (!drag) return;
        self._root.style.left = (e.clientX - drag.x) + 'px';
        self._root.style.top = (e.clientY - drag.y) + 'px';
        self._root.style.transform = 'none';
      });
      window.addEventListener('mouseup', function () { drag = null; });
    }

    _show() {
      this._root.classList.add('open');
    }

    _hide() {
      this._root.classList.remove('open');
    }

    _render() {
      var body = document.getElementById('l2ps-body');
      var titleEl = document.getElementById('l2ps-title');
      if (!body) return;
      var self = this;
      var isSell = this.mode === 'sell_setup' || this.mode === 'sell_active';
      var isBuy = this.mode === 'buy_setup' || this.mode === 'buy_active';
      var active = this.isActive();
      var setup = this.isSetup();

      if (titleEl) {
        titleEl.textContent = isSell
          ? (active ? 'Лавка продажи (активна)' : 'Личная лавка — продажа')
          : isBuy
            ? (active ? 'Лавка покупки (активна)' : 'Личная лавка — покупка')
            : 'Личная лавка';
      }

      var html = '';
      html += '<div class="l2ps-msg-row">' +
        '<label>Сообщение</label>' +
        '<input type="text" id="l2ps-msg" maxlength="29" value="' + esc(this.title) + '" ' +
        (active ? 'disabled' : '') + ' placeholder="До 29 символов">' +
        '</div>';

      if (isSell) {
        html += '<div class="l2ps-hint">Выставьте предметы из инвентаря. Цена — за штуку (в деталях). ' +
          'После старта движение и бой недоступны, пока не закроете лавку.</div>';
        html += '<div class="l2ps-list" id="l2ps-list">';
        for (var i = 0; i < this.maxSlots; i++) {
          var s = this.sellList[i];
          if (s) {
            html += '<div class="l2ps-row" data-idx="' + i + '">' +
              '<span class="l2ps-ico">' + this._ico(s.icon) + '</span>' +
              '<span class="l2ps-name">' + esc(s.name) + ' ×' + s.count + '</span>' +
              (setup
                ? ('<input class="l2ps-price" data-si="' + i + '" type="number" min="1" value="' + s.price + '">')
                : ('<span class="l2ps-price-v">' + s.price + ' ad</span>')) +
              (setup ? '<button type="button" class="l2ps-rm" data-rm="' + i + '">×</button>' : '') +
              '</div>';
          } else {
            html += '<div class="l2ps-row empty">— пусто —</div>';
          }
        }
        html += '</div>';
        if (setup) {
          html += '<div class="l2ps-add">' +
            '<button type="button" class="l2ps-btn" id="l2ps-add-inv">+ Из инвентаря</button>' +
            '</div>';
        }
      } else if (isBuy) {
        html += '<div class="l2ps-hint">Список покупок (L2 Private Store Buy): что ищете, кол-во и макс. цена за шт. ' +
          'Игроки могут продать вам предметы из инвентаря.</div>';
        html += '<div class="l2ps-list" id="l2ps-list">';
        for (var j = 0; j < this.maxSlots; j++) {
          var b = this.buyList[j];
          if (b) {
            html += '<div class="l2ps-row" data-idx="' + j + '">' +
              '<span class="l2ps-ico">' + this._ico(b.icon) + '</span>' +
              '<span class="l2ps-name">' + esc(b.name) + ' ×' + b.count + '</span>' +
              (setup
                ? ('<input class="l2ps-price" data-bi="' + j + '" type="number" min="1" value="' + b.maxPrice + '">')
                : ('<span class="l2ps-price-v">≤' + b.maxPrice + ' ad</span>')) +
              (setup ? '<button type="button" class="l2ps-rm" data-rmb="' + j + '">×</button>' : '') +
              '</div>';
          } else {
            html += '<div class="l2ps-row empty">— пусто —</div>';
          }
        }
        html += '</div>';
        if (setup) {
          html += '<div class="l2ps-add-buy">' +
            '<input type="text" id="l2ps-buy-name" placeholder="Название / id предмета">' +
            '<input type="number" id="l2ps-buy-cnt" min="1" value="1" title="Кол-во">' +
            '<input type="number" id="l2ps-buy-price" min="1" value="100" title="Макс. цена">' +
            '<button type="button" class="l2ps-btn" id="l2ps-add-buy">+ В список</button>' +
            '</div>';
        }
      }

      html += '<div class="l2ps-actions">';
      if (setup) {
        html += '<button type="button" class="l2ps-btn primary" id="l2ps-start">Начать торговлю</button>';
        html += '<button type="button" class="l2ps-btn" id="l2ps-cancel-setup">Отмена</button>';
      } else if (active) {
        html += '<button type="button" class="l2ps-btn danger" id="l2ps-stop">Закрыть лавку</button>';
      }
      html += '</div>';

      body.innerHTML = html;

      // bind
      var msgIn = document.getElementById('l2ps-msg');
      if (msgIn && setup) {
        msgIn.addEventListener('change', function () {
          self.title = (msgIn.value || '').slice(0, 29);
        });
      }
      body.querySelectorAll('.l2ps-price[data-si]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var ix = +inp.getAttribute('data-si');
          if (self.sellList[ix]) self.sellList[ix].price = Math.max(1, +inp.value || 1);
        });
      });
      body.querySelectorAll('.l2ps-price[data-bi]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var ix = +inp.getAttribute('data-bi');
          if (self.buyList[ix]) self.buyList[ix].maxPrice = Math.max(1, +inp.value || 1);
        });
      });
      body.querySelectorAll('[data-rm]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.removeSell(+btn.getAttribute('data-rm'));
        });
      });
      body.querySelectorAll('[data-rmb]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.removeBuy(+btn.getAttribute('data-rmb'));
        });
      });
      var addInv = document.getElementById('l2ps-add-inv');
      if (addInv) addInv.addEventListener('click', function () { self._pickFromInventory(); });
      var addBuy = document.getElementById('l2ps-add-buy');
      if (addBuy) {
        addBuy.addEventListener('click', function () {
          var n = document.getElementById('l2ps-buy-name');
          var c = document.getElementById('l2ps-buy-cnt');
          var p = document.getElementById('l2ps-buy-price');
          var name = (n && n.value) || '';
          if (!name.trim()) {
            chat('Укажите название или id предмета.', 'system');
            return;
          }
          self.addBuyEntry(name.trim(), name.trim(), c ? +c.value : 1, p ? +p.value : 100, '📦');
        });
      }
      var start = document.getElementById('l2ps-start');
      if (start) start.addEventListener('click', function () {
        if (msgIn) self.title = (msgIn.value || '').slice(0, 29);
        self.start();
      });
      var cancelSetup = document.getElementById('l2ps-cancel-setup');
      if (cancelSetup) cancelSetup.addEventListener('click', function () { self.closeWindow(); });
      var stop = document.getElementById('l2ps-stop');
      if (stop) stop.addEventListener('click', function () { self.cancelStore(); });
    }

    _ico(icon) {
      if (icon && typeof icon === 'string' &&
          (icon.indexOf('/') >= 0 || /\.(png|webp|jpe?g|gif)$/i.test(icon))) {
        return '<img src="' + esc(icon) + '" alt="" width="28" height="28">';
      }
      return esc(icon || '📦');
    }

    /** Выбор предмета из инвентаря — только внутриигровое окно (без browser prompt). */
    _pickFromInventory() {
      var inventory = inv();
      if (!inventory || !inventory.slots) {
        chat('Инвентарь недоступен.', 'system');
        return;
      }
      var options = [];
      for (var i = 0; i < inventory.slots.length; i++) {
        var it = inventory.slots[i];
        if (!it) continue;
        var tpl = it.template || it;
        options.push({
          uid: it.uid,
          name: (tpl.name || it.name || it.id) + ' ×' + (it.count || 1),
          count: it.count || 1,
          item: it
        });
      }
      if (!options.length) {
        chat('Инвентарь пуст.', 'system');
        return;
      }

      var pick = document.createElement('div');
      pick.className = 'l2ps-picker open';
      var list = options.map(function (o, idx) {
        return '<button type="button" class="l2ps-pick-item" data-i="' + idx + '">' +
          esc(o.name) + '</button>';
      }).join('');
      pick.innerHTML =
        '<div class="l2ps-picker-box">' +
        '<div class="l2ps-picker-h">Выберите предмет</div>' +
        '<div class="l2ps-picker-list">' + list + '</div>' +
        '<div class="l2ps-pick-sel" id="l2ps-pick-sel">Не выбран</div>' +
        '<div class="l2ps-pick-form">' +
        '  <label>Кол-во</label><input type="number" id="l2ps-pick-cnt" min="1" value="1">' +
        '  <label>Цена/шт</label><input type="number" id="l2ps-pick-price" min="1" value="100">' +
        '  <button type="button" class="l2ps-btn primary" id="l2ps-pick-ok">В лавку</button>' +
        '  <button type="button" class="l2ps-btn" id="l2ps-pick-cancel">Отмена</button>' +
        '</div></div>';
      document.body.appendChild(pick);

      var self = this;
      var selected = null;
      pick.querySelectorAll('[data-i]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          selected = options[+btn.getAttribute('data-i')];
          pick.querySelectorAll('.l2ps-pick-item').forEach(function (b) {
            b.style.borderColor = '#3a3428';
          });
          btn.style.borderColor = '#c8a040';
          var sel = document.getElementById('l2ps-pick-sel');
          if (sel) sel.textContent = selected.name;
          var cnt = document.getElementById('l2ps-pick-cnt');
          if (cnt) {
            cnt.max = String(selected.count);
            cnt.value = String(selected.count);
          }
        });
      });
      document.getElementById('l2ps-pick-ok').addEventListener('click', function () {
        if (!selected) {
          chat('Выберите предмет из списка.', 'system');
          return;
        }
        var cntEl = document.getElementById('l2ps-pick-cnt');
        var priceEl = document.getElementById('l2ps-pick-price');
        var cnt = Math.max(1, Math.min(selected.count, parseInt(cntEl && cntEl.value, 10) || 1));
        var price = Math.max(1, parseInt(priceEl && priceEl.value, 10) || 100);
        self.addSellFromInventory(selected.uid, cnt, price);
        document.body.removeChild(pick);
      });
      document.getElementById('l2ps-pick-cancel').addEventListener('click', function () {
        document.body.removeChild(pick);
      });
    }
  }

  // hooks: block move / attack when store active
  function installHooks() {
    // player.attack wrap
    var tries = 0;
    function tryHook() {
      tries++;
      var p = player();
      if (!p || !window.game || !window.game.privateStore) {
        if (tries < 50) setTimeout(tryHook, 200);
        return;
      }
      var store = window.game.privateStore;
      if (p._psAttackHooked) return;
      p._psAttackHooked = true;
      var origAttack = p.attack && p.attack.bind(p);
      if (origAttack) {
        p.attack = function () {
          if (store.blocksCombat()) {
            chat('Нельзя атаковать, пока открыта личная лавка. Сначала закройте лавку.', 'system');
            return;
          }
          return origAttack.apply(this, arguments);
        };
      }
      // move: cancel store if try to move while active (L2-like: must cancel first)
      var origMoveTo = p.moveTo && p.moveTo.bind(p);
      if (origMoveTo) {
        p.moveTo = function () {
          if (store.blocksMove()) {
            chat('Сначала закройте личную лавку.', 'system');
            return;
          }
          return origMoveTo.apply(this, arguments);
        };
      }
    }
    tryHook();
  }

  // skill use block via skillManager if present
  var _origUseSkill = null;
  function hookSkills() {
    if (!window.game || !window.game.player || !window.game.player.skillManager) {
      setTimeout(hookSkills, 300);
      return;
    }
    var sm = window.game.player.skillManager;
    if (sm._psHooked) return;
    sm._psHooked = true;
    _origUseSkill = sm.useSkill.bind(sm);
    sm.useSkill = function (id, target) {
      if (window.game.privateStore && window.game.privateStore.blocksCombat()) {
        chat('Нельзя использовать умения, пока открыта личная лавка.', 'system');
        return false;
      }
      return _origUseSkill(id, target);
    };
  }

  window.PrivateStore = PrivateStore;
  window.installPrivateStoreHooks = function () {
    installHooks();
    hookSkills();
  };
})();
