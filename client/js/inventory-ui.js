// ============================================
// PROJECT STEAM: ORIGINS - INVENTORY-UI.JS
// Classic C1 Exact Inventory Window & Custom Grid Layout
// Row 1: Helmet only (No sides)
// Row 2: Weapon | Body Armor | Shield
// Row 3: Gloves | Legs (Pants) | Boots
// ============================================

function getItemIconHtml(item) {
  if (!item) return '';
  const tpl = item.template || item;
  const raw = (tpl && tpl.icon) || item.icon || '';
  // path to image asset
  if (typeof raw === 'string' && (raw.indexOf('/') >= 0 || /\.(webp|png|jpe?g|gif)$/i.test(raw))) {
    return `<img src="${raw}" class="l2-inv-item-img" alt="${(item.name || tpl.name || '').replace(/"/g, '')}" draggable="false" />`;
  }
  if (typeof L2RasterIcons !== 'undefined' && L2RasterIcons.getItemPng) {
    const pngUrl = L2RasterIcons.getItemPng(item);
    if (pngUrl) {
      return `<img src="${pngUrl}" class="l2-inv-item-img" alt="${item.name || ''}" draggable="false" />`;
    }
  }
  return raw || '❓';
}

class InventoryUI {
  constructor(inventory) {
    this.inventory = inventory;
    this.isOpen = false;
    this.selectedItem = null;
    this.activeTab = 'item'; // 'item' | 'quest'
    this._drag = null;
    /** Active HTML5 drag of inventory item → drop outside window = throw to ground */
    this._dragItemUid = null;
    this._dragConsumed = false;

    this.createDOM();
    this.bindEvents();
  }

  createDOM() {
    this.container = document.createElement('div');
    this.container.id = 'inventory-window';
    this.container.className = 'l2-inv-root';
    this.container.style.left = '62%';
    this.container.style.top = '16%';

    this.container.innerHTML = `
      <div class="l2-inv-titlebar" id="l2-inv-titlebar">
        <div class="l2-inv-title-left">
          <span class="l2-inv-gem-icon"></span>
          <span class="l2-inv-title-text">Inventory</span>
        </div>
        <div class="l2-inv-title-btns">
          <button type="button" class="l2-inv-btn-min" id="l2-inv-min">_</button>
          <button type="button" class="l2-inv-close" id="l2-inv-close">✕</button>
        </div>
      </div>

      <div class="l2-inv-body">
        <!-- TOP: Paperdoll equipment layout -->
        <div class="l2-inv-paperdoll">
          <!-- Left 3x3 Grid: Row 1 Helmet only (no sides); Row 2 Weapon/Chest/Shield; Row 3 Gloves/Legs/Boots -->
          <div class="l2-inv-eq-grid">
            <!-- Row 1: Title (Left) | Head / Helmet (Center) | Costume (Right) -->
            <div class="l2-inv-slot eq" data-slot="title" title="Титул"></div>
            <div class="l2-inv-slot eq" data-slot="head"></div>
            <div class="l2-inv-slot eq" data-slot="costume" title="Костюм"></div>

            <!-- Row 2: Weapon (Left) | Body Armor (Center) | Shield (Right) -->
            <div class="l2-inv-slot eq" data-slot="weapon"></div>
            <div class="l2-inv-slot eq" data-slot="chest"></div>
            <div class="l2-inv-slot eq" data-slot="shield"></div>

            <!-- Row 3: Gloves (Left) | Legs / Pants (Center) | Boots (Right) -->
            <div class="l2-inv-slot eq" data-slot="gloves"></div>
            <div class="l2-inv-slot eq" data-slot="legs"></div>
            <div class="l2-inv-slot eq" data-slot="boots"></div>
          </div>

          <!-- Accessories: earrings + resonator necklace + nano bracelets (1 slot = pair) -->
          <div class="l2-inv-jewel-grid">
            <div class="l2-inv-jewel-row">
              <div class="l2-inv-slot eq" data-slot="earring_l"></div>
              <div class="l2-inv-slot eq" data-slot="earring_r"></div>
            </div>
            <div class="l2-inv-jewel-center">
              <div class="l2-inv-slot eq" data-slot="necklace" title="Нагрудный модуль (Резонатор / Нагнетатель)"></div>
            </div>
            <div class="l2-inv-jewel-center">
              <div class="l2-inv-slot eq l2-inv-slot-wide" data-slot="bracelet" title="Наручный модуль (Нано-браслеты / Наручи)"></div>
            </div>
          </div>
        </div>

        <!-- MID: Tabs [ Item ] [ Quest ] -->
        <div class="l2-inv-tabs">
          <button type="button" class="l2-inv-tab active" data-tab="item">Item</button>
          <button type="button" class="l2-inv-tab" data-tab="quest">Quest</button>
        </div>

        <!-- MAIN GRID: 6 columns x 4 rows visible (24 slots per view) -->
        <div class="l2-inv-grid-container">
          <div id="l2-inv-grid" class="l2-inv-grid"></div>
        </div>

        <!-- BOTTOM FOOTER: Currency, Weight %, Trash bin -->
        <div class="l2-inv-footer">
          <div class="l2-inv-currency">
            <span class="l2-inv-coins-icon"></span>
            <span id="l2-inv-currency-val">0</span>
          </div>

          <div class="l2-inv-weight-container">
            <span class="l2-inv-scale-icon"></span>
            <div class="l2-inv-weight-track">
              <div id="l2-inv-weight-bar" class="l2-inv-weight-fill"></div>
            </div>
            <span id="l2-inv-weight-text" class="l2-inv-weight-val">0.00%</span>
          </div>

          <button type="button" id="l2-inv-trash" class="l2-inv-trash-btn">
            <span class="l2-inv-trash-icon"></span>
          </button>
        </div>
      </div>

      <!-- Item Tooltip -->
      <div id="l2-inv-tooltip" class="l2-inv-tooltip hidden"></div>
    `;

    document.body.appendChild(this.container);
    this.injectStyles();
  }

  injectStyles() {
    let style = document.getElementById('l2-inv-styles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'l2-inv-styles';
      document.head.appendChild(style);
    }

    style.textContent = `
      /* Classic C1 Inventory Steel Frame */
      .l2-inv-root {
        position: fixed;
        z-index: 530;
        width: min(308px, 94vw);
        max-height: min(560px, 86vh);
        background: #181a1d;
        border: 1px solid #0a0b0d;
        box-shadow:
          0 0 0 1px #3a4149,
          0 0 0 2px #181a1d,
          0 0 0 3px #282d33,
          0 12px 32px rgba(0, 0, 0, 0.85);
        border-radius: 0px;
        font-family: Tahoma, "Segoe UI", Arial, sans-serif;
        font-size: 11px;
        color: #c0c6ce;
        user-select: none;
        display: none;
        flex-direction: column;
        box-sizing: border-box;
      }
      .l2-inv-root.open { display: flex; }

      /* Titlebar */
      .l2-inv-titlebar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 22px;
        padding: 0 4px 0 6px;
        background: linear-gradient(180deg, #353b43 0%, #202429 50%, #16191c 100%);
        border-bottom: 1px solid #0e1012;
        cursor: move;
        color: #e2e6eb;
        font-size: 11px;
        font-weight: bold;
        letter-spacing: 0.02em;
        text-shadow: 1px 1px 0px #000;
      }
      .l2-inv-title-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .l2-inv-gem-icon {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #8a9bb0 0%, #3a4858 50%, #151d26 100%);
        border: 1px solid #5a6878;
        box-shadow: inset 0 0 2px #fff, 0 0 2px #000;
      }

      .l2-inv-title-btns { display: flex; gap: 2px; }
      .l2-inv-btn-min, .l2-inv-close {
        width: 16px;
        height: 14px;
        border: 1px solid #48525e;
        background: linear-gradient(180deg, #2c323a, #16191e);
        color: #b0b8c2;
        font-size: 10px;
        line-height: 11px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.15);
      }
      .l2-inv-btn-min:hover, .l2-inv-close:hover {
        color: #fff;
        border-color: #8a98a8;
        background: linear-gradient(180deg, #404854, #222830);
      }

      /* Body Inner Container */
      .l2-inv-body {
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: #181a1d;
        max-height: calc(86vh - 35px);
        overflow-y: auto;
      }

      /* Paperdoll Section */
      .l2-inv-paperdoll {
        display: flex;
        justify-content: space-between;
        padding: 6px 8px;
        background: #101215;
        border: 1px solid #242930;
        box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.8), inset -1px -1px 0 rgba(255, 255, 255, 0.05);
      }

      .l2-inv-eq-grid {
        display: grid;
        grid-template-columns: repeat(3, 36px);
        grid-template-rows: repeat(3, 36px);
        gap: 3px;
      }

      .l2-inv-slot-spacer {
        width: 36px;
        height: 36px;
        visibility: hidden;
        pointer-events: none;
      }

      .l2-inv-jewel-grid {
        display: flex;
        flex-direction: column;
        gap: 3px;
        align-items: center;
        justify-content: space-between;
      }
      .l2-inv-jewel-row { display: flex; gap: 3px; }
      .l2-inv-jewel-center { display: flex; justify-content: center; }
      /* Пара браслетов — один широкий слот вместо двух колец */
      .l2-inv-slot.l2-inv-slot-wide {
        width: 75px;
      }

      /* Equipment Slot Styling (L2 C1 Beveled Slot Frame) */
      .l2-inv-slot {
        width: 36px;
        height: 36px;
        background: linear-gradient(180deg, #1c2026 0%, #101215 100%);
        border: 1px solid #0a0c0e;
        position: relative;
        box-sizing: border-box;
        cursor: pointer;
        box-shadow:
          inset 1px 1px 0 #3c444e,
          inset -1px -1px 0 #0e1012,
          0 0 0 1px #22272e;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .l2-inv-slot:hover {
        box-shadow:
          inset 1px 1px 0 #68788a,
          inset -1px -1px 0 #28303a,
          0 0 4px rgba(120, 150, 180, 0.5);
      }
      .l2-inv-slot.selected {
        outline: 1px solid #78c8ff;
        outline-offset: -1px;
      }
      .l2-inv-slot.equipped {
        box-shadow:
          inset 0 0 8px rgba(255, 220, 100, 0.35),
          inset 1px 1px 0 #ffd870,
          0 0 0 1px #8a7030;
      }

      /* Real PNG Raster Image Element */
      .l2-inv-slot img.l2-inv-item-img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        pointer-events: none;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.85));
      }

      .l2-inv-slot img.l2-inv-silh-img {
        width: 28px;
        height: 28px;
        object-fit: contain;
        opacity: 0.65;
        pointer-events: none;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.9));
      }

      /* Tabs: Item / Quest (L2 C1 Metal Tab Buttons) */
      .l2-inv-tabs {
        display: flex;
        gap: 2px;
        border-bottom: 1px solid #101215;
      }
      .l2-inv-tab {
        flex: 1;
        height: 20px;
        padding: 0;
        background: linear-gradient(180deg, #22262c 0%, #15181c 100%);
        border: 1px solid #363d46;
        border-bottom: none;
        color: #8c96a2;
        font-size: 11px;
        font-weight: normal;
        cursor: pointer;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }
      .l2-inv-tab:hover { color: #d0d8e2; }
      .l2-inv-tab.active {
        color: #ffffff;
        font-weight: bold;
        background: linear-gradient(180deg, #363d46 0%, #20252b 100%);
        border-color: #4a5460;
        box-shadow: inset 0 1px 0 #728090;
      }

      /* Inventory Grid Container: 6 cols x 4 rows visible (exact L2 C1 size 156px height) */
      .l2-inv-grid-container {
        height: 156px;
        overflow-y: auto;
        padding: 3px;
        background: #0d0f11;
        border: 1px solid #282d34;
        box-shadow: inset 1px 1px 4px rgba(0, 0, 0, 0.9);
        scrollbar-width: thin;
        scrollbar-color: #444c56 #0d0f11;
      }
      .l2-inv-grid-container::-webkit-scrollbar { width: 12px; }
      .l2-inv-grid-container::-webkit-scrollbar-thumb {
        background: linear-gradient(180deg, #48525d 0%, #282d34 100%);
        border: 1px solid #181b1f;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
      }
      .l2-inv-grid-container::-webkit-scrollbar-track {
        background: #0d0f11;
        border-left: 1px solid #20242a;
      }

      .l2-inv-grid {
        display: grid;
        grid-template-columns: repeat(6, 36px);
        gap: 3px;
        justify-content: start;
      }

      /* Item Slot Elements */
      .l2-inv-slot .item-ico-wrapper {
        position: absolute;
        inset: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .l2-inv-slot .item-count {
        position: absolute;
        right: 2px;
        bottom: 1px;
        font-size: 9px;
        color: #ffffff;
        text-shadow: 0 0 2px #000, 0 1px 1px #000;
        font-family: "Courier New", monospace;
        font-weight: bold;
        z-index: 2;
      }
      .l2-inv-slot .item-enchant {
        position: absolute;
        left: 2px;
        top: 1px;
        font-size: 9px;
        color: #ffea70;
        text-shadow: 0 0 2px #000, 0 1px 1px #000;
        font-family: "Courier New", monospace;
        font-weight: bold;
        z-index: 2;
      }
      .l2-inv-slot .grade-accent {
        position: absolute;
        inset: 0;
        border: 1px solid transparent;
        pointer-events: none;
      }

      /* Footer Bar */
      .l2-inv-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 28px;
        padding: 0 4px;
        background: #111316;
        border: 1px solid #282d34;
        box-shadow: inset 1px 1px 3px rgba(0, 0, 0, 0.8);
        font-size: 11px;
      }

      /* Adena / Coins */
      .l2-inv-currency {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #e2e6eb;
        font-family: Tahoma, sans-serif;
        font-size: 11px;
      }
      .l2-inv-coins-icon {
        width: 16px;
        height: 16px;
        background-image: url('assets/inventar/icons/copper_parts.webp');
        background-size: cover;
        background-repeat: no-repeat;
        border-radius: 2px;
        display: inline-block;
      }

      /* Weight Bar */
      .l2-inv-weight-container {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .l2-inv-scale-icon {
        width: 14px;
        height: 14px;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23a0abb8"><path d="M12 2L4 7v2h16V7l-8-5zm-6 9l-4 7h8l-4-7zm12 0l-4 7h8l-4-7z"/></svg>');
        background-size: contain;
        background-repeat: no-repeat;
        display: inline-block;
      }
      .l2-inv-weight-track {
        width: 70px;
        height: 10px;
        background: #090a0c;
        border: 1px solid #323942;
        position: relative;
        overflow: hidden;
        box-shadow: inset 0 1px 2px #000;
      }
      .l2-inv-weight-fill {
        position: absolute;
        left: 0; top: 0; bottom: 0;
        width: 0%;
        background: linear-gradient(180deg, #d8a830 0%, #886010 100%);
        border-right: 1px solid #ffe880;
        transition: width 0.2s linear;
      }
      .l2-inv-weight-val {
        font-size: 9px;
        font-family: "Courier New", monospace;
        color: #b0b8c2;
        min-width: 42px;
        text-align: right;
      }

      /* Trash Bucket Button */
      .l2-inv-trash-btn {
        width: 22px;
        height: 22px;
        background: linear-gradient(180deg, #2c323a 0%, #16191e 100%);
        border: 1px solid #48525e;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
      }
      .l2-inv-trash-icon {
        width: 14px;
        height: 14px;
        background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%238a96a4"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>');
        background-size: contain;
        background-repeat: no-repeat;
        display: inline-block;
      }
      body.l2-inv-dragging-item {
        cursor: grabbing !important;
      }
      body.l2-inv-dragging-item .l2-inv-root {
        outline: 1px dashed rgba(200, 160, 80, 0.35);
      }
      .l2-inv-trash-btn:hover {
        border-color: #ff6a6a;
        background: linear-gradient(180deg, #402020, #201010);
      }

      /* Tooltip */
      .l2-inv-tooltip {
        position: fixed;
        z-index: 620;
        max-width: 240px;
        padding: 8px 10px;
        background: rgba(14, 16, 18, 0.96);
        border: 1px solid #48525e;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.8);
        color: #e2e6eb;
        font-size: 11px;
        pointer-events: none;
        line-height: 1.4;
      }
      .l2-inv-tooltip.hidden { display: none; }
      .l2-inv-tt-name { font-weight: bold; font-size: 12px; margin-bottom: 2px; }
      .l2-inv-tt-grade { font-size: 10px; margin-bottom: 4px; }
      .l2-inv-tt-stats { color: #88ff88; margin-bottom: 4px; }
      .l2-inv-tt-desc { color: #9aa4b0; font-style: italic; margin-bottom: 4px; }
      .l2-inv-tt-price { color: #ffd870; font-family: "Courier New", monospace; }
    `;
  }

  bindEvents() {
    const self = this;

    // Блокировать браузерное контекстное меню во всём окне инвентаря
    this.container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    // Закрытие / Сворачивание
    document.getElementById('l2-inv-close').addEventListener('click', () => this.close());
    document.getElementById('l2-inv-min').addEventListener('click', () => this.close());

    // Перетаскивание окна за шапку
    const bar = document.getElementById('l2-inv-titlebar');
    if (bar) {
      bar.style.cursor = 'grab';
      const onStart = (cx, cy, target) => {
        if (target.closest('button, a, input')) return;
        bar.style.cursor = 'grabbing';
        self._drag = { x: cx - self.container.offsetLeft, y: cy - self.container.offsetTop };
      };
      const onMove = (cx, cy) => {
        if (!self._drag) return;
        const w = window.innerWidth, h = window.innerHeight;
        const ew = self.container.offsetWidth || 280, eh = self.container.offsetHeight || 300;
        const left = Math.max(0, Math.min(w - ew, cx - self._drag.x));
        const top = Math.max(0, Math.min(h - eh, cy - self._drag.y));
        self.container.style.left = left + 'px';
        self.container.style.top = top + 'px';
      };
      const onEnd = () => {
        if (self._drag) {
          self._drag = null;
          bar.style.cursor = 'grab';
        }
      };

      bar.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e.target));
      window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
      window.addEventListener('mouseup', onEnd);

      bar.addEventListener('touchstart', (e) => {
        if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
      }, { passive: true });
      window.addEventListener('touchmove', (e) => {
        if (e.touches && e.touches.length === 1 && self._drag) onMove(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      window.addEventListener('touchend', onEnd);
    }

    // Вкладки Item / Quest
    document.querySelectorAll('.l2-inv-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        self.switchTab(tabBtn.dataset.tab);
      });
    });

    // Хоткей I / B / Alt+V
    window.addEventListener('keydown', (e) => {
      if (window.isSceneEditorActive && window.isSceneEditorActive()) return;
      if (document.activeElement && document.activeElement.id === 'chat-input') return;
      if (e.altKey && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'м')) {
        e.preventDefault();
        self.toggle();
        return;
      }
      if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        if (k === 'i' || k === 'b' || k === 'ш' || k === 'и') {
          e.preventDefault();
          self.toggle();
        }
      }
      if (e.key === 'Escape' && self.isOpen) {
        self.close();
      }
    });

    // Мусорная корзина (Trash Can)
    const trashBtn = document.getElementById('l2-inv-trash');
    trashBtn.addEventListener('click', () => {
      if (self.selectedItem) {
        self.confirmDestroyItem(self.selectedItem);
      } else {
        if (window.game && window.game.addChatMessage) {
          window.game.addChatMessage('Выберите предмет для уничтожения.', 'system');
        }
      }
    });

    trashBtn.addEventListener('dragover', (e) => {
      e.preventDefault();
      trashBtn.classList.add('drag-over');
    });
    trashBtn.addEventListener('dragleave', () => {
      trashBtn.classList.remove('drag-over');
    });
    trashBtn.addEventListener('drop', (e) => {
      e.preventDefault();
      trashBtn.classList.remove('drag-over');
      self._dragConsumed = true;
      const itemUid = e.dataTransfer.getData('text/item-uid') || self._dragItemUid;
      if (itemUid) {
        const item = self.findItemByUID(itemUid);
        if (item) self.confirmDestroyItem(item);
      }
      self._clearDragState();
    });

    // Drag item outside inventory window → drop on ground (L2 style)
    this.container.addEventListener('dragover', (e) => {
      if (!self._dragItemUid) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      self._dragOverUi = true;
    });
    this.container.addEventListener('dragleave', (e) => {
      // only clear when leaving the whole window
      if (!self.container.contains(e.relatedTarget)) self._dragOverUi = false;
    });
    this.container.addEventListener('drop', (e) => {
      // drop onto inv UI (reorder not implemented) — consume so we don't throw to ground
      if (self._dragItemUid) {
        e.preventDefault();
        self._dragConsumed = true;
      }
    });

    window.addEventListener('dragover', (e) => {
      if (!self._dragItemUid) return;
      e.preventDefault(); // allow drop anywhere
      // outside inv → show "move" cursor for throw
      if (self.container.contains(e.target)) {
        e.dataTransfer.dropEffect = 'move';
        self._dragOverUi = true;
      } else {
        e.dataTransfer.dropEffect = 'copy';
        self._dragOverUi = false;
      }
    }, true);

    window.addEventListener('drop', (e) => {
      if (!self._dragItemUid) return;
      // drop on inv/trash already consumed
      if (self.container.contains(e.target) || (e.target.closest && e.target.closest('#l2-inv-trash'))) {
        self._dragConsumed = true;
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const uid = e.dataTransfer.getData('text/item-uid') || self._dragItemUid;
      self._dragConsumed = true;
      const item = self.findItemByUID(uid);
      self._clearDragState();
      if (item) self.confirmDropItem(item);
    }, true);

    window.addEventListener('dragend', () => {
      // Fallback: some browsers fire dragend without drop outside
      if (self._dragItemUid && !self._dragConsumed && !self._dragOverUi) {
        const item = self.findItemByUID(self._dragItemUid);
        self._clearDragState();
        if (item) self.confirmDropItem(item);
      } else {
        self._clearDragState();
      }
    }, true);
  }

  _clearDragState() {
    this._dragItemUid = null;
    this._dragConsumed = false;
    this._dragOverUi = false;
    document.body.classList.remove('l2-inv-dragging-item');
  }

  _beginItemDrag(item, e) {
    if (!item) return;
    this._dragItemUid = item.uid;
    this._dragConsumed = false;
    this._dragOverUi = true;
    document.body.classList.add('l2-inv-dragging-item');
    try {
      const tid = item.templateId || item.id || (item.template && item.template.id) || '';
      e.dataTransfer.setData('text/item-uid', String(item.uid));
      e.dataTransfer.setData('text/item-id', String(tid));
      e.dataTransfer.setData('text/plain', 'item:' + String(tid));
      e.dataTransfer.effectAllowed = 'copyMove';
    } catch (err) { /* IE ignore */ }
    this.hideTooltip();
    this._hideItemContextMenu();
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.container.classList.add('open');
    this.render();
  }

  close() {
    this.isOpen = false;
    this.container.classList.remove('open');
    this.hideTooltip();
  }

  switchTab(tabName) {
    this.activeTab = tabName;
    document.querySelectorAll('.l2-inv-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabName);
    });
    this.render();
  }

  findItemByUID(uid) {
    if (!this.inventory) return null;
    for (const item of this.inventory.slots) {
      if (item && item.uid === uid) return item;
    }
    for (const item of Object.values(this.inventory.equipment)) {
      if (item && item.uid === uid) return item;
    }
    return null;
  }

  async confirmDestroyItem(item) {
    if (!item) return;
    if (!this._isDropable(item)) {
      if (window.game && window.game.addChatMessage) {
        window.game.addChatMessage('Этот предмет персональный и не может быть уничтожен.', 'system');
      }
      return;
    }
    if (window.game && window.game.player && (window.game.player.isDead || window.game.player.hp <= 0)) {
      if (window.game.addChatMessage) {
        window.game.addChatMessage('Нельзя уничтожать предметы без сознания.', 'system');
      }
      return;
    }
    const name = item.name || item.templateId || 'предмет';
    const tid = item.templateId || (item.template && item.template.id) || item.id;
    let ok = false;
    if (window.GameDialog && typeof window.GameDialog.confirm === 'function') {
      ok = await window.GameDialog.confirm(
        'Вы действительно хотите уничтожить «' + name + '»?\nПредмет будет удалён безвозвратно.',
        { title: 'Уничтожение предмета', okLabel: 'Уничтожить', cancelLabel: 'Отмена', danger: true }
      );
    } else {
      ok = false;
    }
    if (!ok) return;

    // Online: server removes from inv/equip and persists (DB.save)
    const net = window.game && window.game.net;
    if (tid && net && typeof net.intentDestroyItem === 'function' && (net.status === 'online' || net.connected)) {
      const n = Math.max(1, item.count | 0 || 1);
      net.intentDestroyItem(tid, n);
      this.selectedItem = null;
      return;
    }

    // Offline fallback
    if (item.isEquipped) {
      const slotKey = Object.keys(this.inventory.equipment).find(k => this.inventory.equipment[k] === item);
      if (slotKey) this.inventory.equipment[slotKey] = null;
    } else {
      this.inventory.removeItemByUID(item.uid);
    }
    if (window.game && window.game.addChatMessage) {
      window.game.addChatMessage('Предмет «' + name + '» уничтожен.', 'damage');
    }
    this.inventory.recalculateStats();
    this.selectedItem = null;
    this.render();
  }

  /**
   * Заточка надетого предмета. Подтверждение нужно, потому что выше +3
   * неудача РАЗРУШАЕТ вещь (серверный ENCHANT_SAFE = 3).
   */
  async confirmEnchantItem(item) {
    if (!item) return;
    const name = item.name || item.templateId || 'предмет';
    const plus = item.enchantLevel || 0;
    const G = window.GAME_RULES;
    const safe = (G && G.ENCHANT_SAFE != null) ? G.ENCHANT_SAFE : 3;
    const rate = typeof this.inventory.getEnchantSuccessRate === 'function'
      ? this.inventory.getEnchantSuccessRate(plus) : null;
    const risky = plus >= safe;
    let text = 'Заточить «' + name + '» с +' + plus + ' до +' + (plus + 1) + '?';
    if (rate != null) text += '\nШанс успеха: ' + rate + '%.';
    text += '\nБудет израсходован Усилитель давления.';
    if (risky) text += '\n\n⚠️ При неудаче предмет будет РАЗРУШЕН и превратится в кристаллы своего грейда.';
    let ok = false;
    if (window.GameDialog && typeof window.GameDialog.confirm === 'function') {
      ok = await window.GameDialog.confirm(text, {
        title: 'Заточка', okLabel: 'Заточить', cancelLabel: 'Отмена', danger: risky
      });
    }
    if (!ok) return;
    this.inventory.enchantItem(item.uid);
  }

  /**
   * Drop item to ground near player (server authority when online).
   * @param {object} item
   * @param {number} [count] - stack amount (default full stack or 1)
   */
  _isDropable(item) {
    if (!item) return false;
    const tid = String(item.templateId || (item.template && item.template.id) || item.id || '').toLowerCase();
    if (tid === 'copper_parts' || tid === 'adena') return true;
    const tpl = item.template || {};
    if (window.DEATH_RULES && typeof window.DEATH_RULES.isDevice === 'function' && window.DEATH_RULES.isDevice(tid, tpl)) {
      return false;
    }
    if (tid === 'engineer_emitter_low' || tid === 'engineer_nano_bracelet' ||
        tid === 'operator_compressor_low' || tid === 'operator_bracers_low') return false;
    if (tpl.nodrop || tpl.noDrop || tpl.undroppable || tpl.notDropable || tpl.bound) return false;
    if (tpl.isResonator || tpl.isCircuitDevice || tpl.isCompressor || tpl.isOperatorDevice ||
        tpl.isNanoBracelet || tpl.isBraceletDevice || tpl.isBracers || tpl.isOperatorBracers ||
        tpl.isValveDevice || tpl.isCircuit) return false;
    if (tpl.type === 'quest' || tpl.quest) return false;
    return true;
  }

  async confirmDropItem(item, count) {
    if (!item) return;
    if (!this._isDropable(item)) {
      if (window.game && window.game.addChatMessage) {
        window.game.addChatMessage('Этот предмет персональный и не может быть выброшен.', 'system');
      }
      return;
    }
    if (window.game && window.game.player && (window.game.player.isDead || window.game.player.hp <= 0)) {
      if (window.game.addChatMessage) {
        window.game.addChatMessage('Нельзя выбрасывать предметы без сознания.', 'system');
      }
      return;
    }
    const name = item.name || item.templateId || 'предмет';
    const tid = item.templateId || (item.template && item.template.id) || item.id;
    if (!tid) return;
    let stack = Math.max(1, item.count | 0 || 1);
    let n = count != null ? Math.floor(+count) : stack;
    if (n < 1) n = 1;
    if (n > stack) n = stack;

    // Multi-stack: ask how many
    if (stack > 1 && count == null && window.GameDialog && window.GameDialog.prompt) {
      const ans = await window.GameDialog.prompt(
        'Сколько выбросить? (макс. ' + stack + ')',
        String(stack),
        { title: 'Выбросить: ' + name, okLabel: 'Выбросить', cancelLabel: 'Отмена' }
      );
      if (ans == null || ans === '') return;
      n = parseInt(ans, 10);
      if (!isFinite(n) || n < 1) return;
      if (n > stack) n = stack;
    } else if (stack === 1 || count != null) {
      let ok = true;
      if (window.GameDialog && window.GameDialog.confirm) {
        ok = await window.GameDialog.confirm(
          'Выбросить «' + name + '»' + (n > 1 ? (' x' + n) : '') + ' на землю?',
          { title: 'Выбросить предмет', okLabel: 'Выбросить', cancelLabel: 'Отмена' }
        );
      }
      if (!ok) return;
    }

    const net = window.game && window.game.net;
    if (net && typeof net.intentDropItem === 'function' && (net.status === 'online' || net.connected)) {
      net.intentDropItem(tid, n);
      this.selectedItem = null;
      return;
    }

    // Offline fallback: remove from inv + local ground pile
    const pl = window.game && window.game.player;
    const lm = window.game && window.game.lootManager;
    if (item.isEquipped) {
      const slotKey = Object.keys(this.inventory.equipment).find(k => this.inventory.equipment[k] === item);
      if (slotKey) this.inventory.unequipItem(slotKey, { silent: true });
    }
    if (n >= stack) this.inventory.removeItemByUID(item.uid);
    else {
      item.count -= n;
    }
    if (lm && pl && pl.mesh) {
      const pos = pl.mesh.position;
      const drop = {
        type: (tid === 'copper_parts') ? (window.DROP_TYPES && window.DROP_TYPES.ADENA) : (window.DROP_TYPES && window.DROP_TYPES.ITEM) || 'item',
        itemId: tid,
        amount: n,
        rarity: 'common',
        name: name
      };
      try {
        if (typeof lm.spawnLocalTestDrop === 'function') {
          lm.spawnLocalTestDrop(tid, pos, n);
        } else if (window.GroundItem) {
          const p = new THREE.Vector3(pos.x + 0.8, pos.y, pos.z + 0.8);
          const gi = new window.GroundItem(window.game.scene, drop, p, null);
          lm.groundItems.push(gi);
        }
      } catch (e) {
        console.warn('[Inv] offline drop fail', e);
      }
    }
    if (window.game && window.game.addChatMessage) {
      window.game.addChatMessage('Выброшено: ' + name + ' x' + n, 'loot');
    }
    this.inventory.recalculateStats();
    this.selectedItem = null;
    this.render();
  }

  /** ПКМ menu: drop / destroy / equip */
  _showItemContextMenu(item, event) {
    if (!item) return;
    this._hideItemContextMenu();
    const menu = document.createElement('div');
    menu.id = 'l2-item-ctx-menu';
    menu.style.cssText = [
      'position:fixed', 'z-index:10060', 'min-width:160px',
      'background:linear-gradient(180deg,#2a2418 0%,#14110c 100%)',
      'border:1px solid #8a6a3a', 'border-radius:3px',
      'box-shadow:0 8px 24px rgba(0,0,0,0.7)', 'padding:4px 0',
      'font-family:Georgia,"Segoe UI",sans-serif', 'font-size:12px', 'color:#e8e0d0'
    ].join(';');
    const mk = (label, fn, danger) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'display:block;width:100%;text-align:left;padding:7px 14px;border:0;background:transparent;color:' +
        (danger ? '#ffaaaa' : '#e8e0d0') + ';cursor:pointer;font:inherit;';
      b.onmouseenter = () => { b.style.background = 'rgba(160,120,40,0.25)'; };
      b.onmouseleave = () => { b.style.background = 'transparent'; };
      b.onclick = (e) => {
        e.stopPropagation();
        this._hideItemContextMenu();
        fn();
      };
      return b;
    };
    const tpl = item.template || {};
    if (tpl.type === 'weapon' || tpl.type === 'armor' || tpl.type === 'accessory' ||
        tpl.type === 'title' || tpl.type === 'costume' ||
        tpl.slot === 'title' || tpl.slot === 'costume') {
      if (!item.isEquipped) {
        menu.appendChild(mk('Экипировать', () => {
          this.inventory.equipItem(item.uid);
          this.render();
        }));
      } else {
        menu.appendChild(mk('Снять', () => {
          const slotKey = Object.keys(this.inventory.equipment).find(k => this.inventory.equipment[k] === item);
          if (slotKey) this.inventory.unequipItem(slotKey);
          this.render();
        }));
      }
    } else if (typeof this.inventory.useItem === 'function') {
      menu.appendChild(mk('Использовать', () => {
        this.inventory.useItem(item.uid);
        this.render();
      }));
    }
    if (this._isDropable(item)) {
      menu.appendChild(mk('Выбросить на землю', () => this.confirmDropItem(item)));
    }
    // «Заточить» — только для надетой экипировки: сервер точит по слоту
    // (p.equip[slot].plus). Кнопки заточки в UI раньше не было вообще, а
    // локальная enchantItem работала по своей таблице шансов.
    const isClassDev = !!(tpl.isResonator || tpl.isCircuitDevice || tpl.isCompressor || tpl.isOperatorDevice ||
                          tpl.isNanoBracelet || tpl.isBraceletDevice || tpl.isBracers || tpl.isOperatorBracers);
    if (!isClassDev && item.isEquipped && (tpl.type === 'weapon' || tpl.type === 'armor' || tpl.type === 'accessory')) {
      const plus = item.enchantLevel || 0;
      const rate = typeof this.inventory.getEnchantSuccessRate === 'function'
        ? this.inventory.getEnchantSuccessRate(plus) : null;
      const has = typeof this.inventory.hasItem === 'function'
        ? this.inventory.hasItem('pressure_amplifier', 1) : true;
      const label = 'Заточить +' + plus + ' → +' + (plus + 1) +
        (rate != null ? (' (' + rate + '%)') : '') + (has ? '' : ' — нет усилителя');
      menu.appendChild(mk(label, () => {
        if (!has) {
          if (window.game) window.game.addChatMessage('Нужен Усилитель давления.', 'system');
          return;
        }
        this.confirmEnchantItem(item);
      }));
    }
    // «Продать» — только когда открыт магазин NPC: цену и списание считает
    // сервер (интент npc_sell), клиент лишь показывает предложение.
    const npcUI = window.game && window.game.npcUI;
    const shopOpen = !!(npcUI && npcUI.isOpen && npcUI.isOpen() && npcUI._shopNpcId &&
      !document.getElementById('npc-shop').classList.contains('hidden'));
    if (shopOpen && item.templateId && item.templateId !== 'copper_parts') {
      const rate = npcUI._shopSellRate != null ? npcUI._shopSellRate : 0.4;
      const base = (tpl.price || 0);
      const unit = base > 0 ? Math.max(1, Math.floor(base * rate)) : 0;
      if (unit > 0) {
        const n = item.count > 1 ? item.count : 1;
        menu.appendChild(mk('Продать (' + (unit * n).toLocaleString() + '⚙️)', () => {
          npcUI.sellItem(item.templateId, n);
        }));
      }
    }
    // «Положить на склад» — только когда открыто окно склада: перенос, плату и
    // ёмкость считает сервер (интент wh_put).
    const whView = document.getElementById('npc-warehouse');
    const whOpen = !!(npcUI && npcUI.isOpen && npcUI.isOpen() && npcUI._whNpcId &&
      whView && !whView.classList.contains('hidden'));
    // Надетое лежит в p.equip, а не в сумке — сервер такой вклад отклонит.
    if (whOpen && item.templateId && !item.isEquipped) {
      const NP = window.NPCS;
      const storable = (NP && NP.whStorable) ? NP.whStorable(item.templateId).ok : true;
      if (storable) {
        const n = item.count > 1 ? item.count : 1;
        const fee = (NP && NP.whDepositFee) ? NP.whDepositFee(item.templateId, n) : 0;
        const clanWh = npcUI._whKind === 'clan';
        menu.appendChild(mk((clanWh ? 'В клан-склад' : 'На склад') + (fee ? (' (−' + fee.toLocaleString() + '⚙️)') : ''), () => {
          npcUI.whPut(item.templateId, n);
        }));
      }
    }
    // «В обмен» — только когда открыто окно обмена: содержимое предложения и
    // перенос считает сервер (интент trade_add).
    const tradeUI = window.game && window.game.tradeUI;
    if (tradeUI && tradeUI.isActive && tradeUI.isActive() && item.templateId && !item.isEquipped) {
      const TRR = window.TRADE_RULES;
      const ok = (TRR && TRR.tradable) ? TRR.tradable(item.templateId).ok : true;
      if (ok) {
        const n = item.count > 1 ? item.count : 1;
        menu.appendChild(mk('В обмен' + (n > 1 ? (' (' + n + ')') : ''), () => {
          tradeUI.add(item.templateId, n);
        }));
      }
    }
    if (this._isDropable(item)) {
      menu.appendChild(mk('Уничтожить', () => this.confirmDestroyItem(item), true));
    }
    document.body.appendChild(menu);
    const x = Math.min(event.clientX, window.innerWidth - 180);
    const y = Math.min(event.clientY, window.innerHeight - 160);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    const close = (e) => {
      if (menu.contains(e.target)) return;
      this._hideItemContextMenu();
      document.removeEventListener('mousedown', close, true);
    };
    setTimeout(() => document.addEventListener('mousedown', close, true), 0);
  }

  _hideItemContextMenu() {
    const m = document.getElementById('l2-item-ctx-menu');
    if (m) m.remove();
  }

  render() {
    if (!this.inventory) return;

    this.renderPaperdoll();
    this.renderGrid();
    this.renderFooter();
  }

  /** Алиас: net-ws / legacy вызывают update() после applyInv. */
  update() {
    this.render();
  }

  renderPaperdoll() {
    const equip = this.inventory.equipment || {};

    document.querySelectorAll('.l2-inv-slot.eq').forEach(slotEl => {
      const slotName = slotEl.dataset.slot;
      const actualSlotKey = (slotName === 'chest_full') ? 'chest' : slotName;
      const item = equip[actualSlotKey];

      // Clear contents
      slotEl.innerHTML = '';

      if (item) {
        slotEl.classList.add('equipped');
        let badgeLv = 0;
        let badgeLabel = '';
        const isComp = !!(item.template && (item.template.isCompressor || item.template.isOperatorDevice || item.template.id === 'operator_compressor_low'));
        const isBrac = !!(item.template && (item.template.isBracers || item.template.isOperatorBracers || item.template.id === 'operator_bracers_low'));
        if (item.template && (item.template.isResonator || item.template.isCircuitDevice || isComp)) {
          badgeLv = typeof item.getCircuitLevel === 'function' ? item.getCircuitLevel()
            : (typeof item.getResonatorLevel === 'function' ? item.getResonatorLevel() : 0);
          badgeLabel = badgeLv > 0 ? (isComp ? 'Кл' + badgeLv : 'К' + badgeLv) : '';
        } else if (item.template && (item.template.isNanoBracelet || item.template.isBraceletDevice || isBrac)) {
          badgeLv = typeof item.getNanoLevel === 'function' ? item.getNanoLevel() : 0;
          badgeLabel = badgeLv > 0 ? (isBrac ? 'Нр' + badgeLv : 'Н' + badgeLv) : '';
        }
        const itemWrap = document.createElement('div');
        itemWrap.className = 'item-ico-wrapper';
        itemWrap.innerHTML = `
          ${getItemIconHtml(item)}
          ${item.enchantLevel > 0 && !badgeLv ? `<span class="item-enchant">+${item.enchantLevel}</span>` : ''}
          ${badgeLabel ? `<span class="item-enchant" style="color:#8cf;">${badgeLabel}</span>` : ''}
        `;
        slotEl.appendChild(itemWrap);

        slotEl.draggable = true;
        slotEl.ondragstart = (e) => {
          this._beginItemDrag(item, e);
        };

        const handlePaperdollUnequip = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const isDevice = item.template && (item.template.isResonator || item.template.isCircuitDevice ||
              item.template.isNanoBracelet || item.template.isBraceletDevice ||
              item.template.isCompressor || item.template.isOperatorDevice ||
              item.template.isBracers || item.template.isOperatorBracers ||
              item.template.id === 'operator_compressor_low' || item.template.id === 'operator_bracers_low');
          if (isDevice) {
            this.tryUpgradeResonator(item, e);
            return;
          }
          this.inventory.unequipItem(actualSlotKey);
          this.render();
          if (window.game && window.game.skillsUI) window.game.skillsUI.renderSkillBar();
        };

        slotEl.onclick = handlePaperdollUnequip;
        slotEl.oncontextmenu = handlePaperdollUnequip;
        slotEl.onmouseup = (e) => {
          if (e.button === 2) handlePaperdollUnequip(e);
        };
        slotEl.onmouseenter = (e) => this.showTooltip(item, e);
        slotEl.onmouseleave = () => this.hideTooltip();
      } else {
        slotEl.classList.remove('equipped');
        slotEl.draggable = false;
        slotEl.ondragstart = null;
        slotEl.onclick = null;
        slotEl.oncontextmenu = null;
        slotEl.onmouseenter = null;
        slotEl.onmouseleave = null;

        // Render Silhouette PNG raster image
        if (typeof L2RasterIcons !== 'undefined' && L2RasterIcons.getSilhouettePng) {
          const silhImg = document.createElement('img');
          silhImg.className = 'l2-inv-silh-img';
          silhImg.src = L2RasterIcons.getSilhouettePng(slotName);
          silhImg.alt = slotName;
          silhImg.draggable = false;
          slotEl.appendChild(silhImg);
        }
      }
    });
  }

  renderGrid() {
    const gridEl = document.getElementById('l2-inv-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const maxVisibleSlots = Math.max(24, this.inventory.maxSlots || 80);

    for (let i = 0; i < maxVisibleSlots; i++) {
      const item = (this.activeTab === 'item') ? this.inventory.slots[i] : null;
      const slotEl = document.createElement('div');
      slotEl.className = 'l2-inv-slot';
      slotEl.dataset.index = i;

      if (item) {
        if (this.selectedItem && this.selectedItem.uid === item.uid) {
          slotEl.classList.add('selected');
        }

        const gradeColor = item.grade ? item.grade.color : 'transparent';
        let badgeLv = 0;
        let badgeTxt = '';
        const isCompBag = !!(item.template && (item.template.isCompressor || item.template.isOperatorDevice || item.template.id === 'operator_compressor_low'));
        const isBracBag = !!(item.template && (item.template.isBracers || item.template.isOperatorBracers || item.template.id === 'operator_bracers_low'));
        if (item.template && (item.template.isResonator || item.template.isCircuitDevice || isCompBag)) {
          badgeLv = typeof item.getCircuitLevel === 'function' ? item.getCircuitLevel()
            : (typeof item.getResonatorLevel === 'function' ? item.getResonatorLevel() : 0);
          if (badgeLv > 0) badgeTxt = isCompBag ? 'Кл' + badgeLv : 'К' + badgeLv;
        } else if (item.template && (item.template.isNanoBracelet || item.template.isBraceletDevice || isBracBag)) {
          badgeLv = typeof item.getNanoLevel === 'function' ? item.getNanoLevel() : 0;
          if (badgeLv > 0) badgeTxt = isBracBag ? 'Нр' + badgeLv : 'Н' + badgeLv;
        }
        slotEl.innerHTML = `
          <div class="grade-accent" style="border-color: ${gradeColor}"></div>
          <div class="item-ico-wrapper">${getItemIconHtml(item)}</div>
          ${item.count > 1 ? `<span class="item-count">${item.count}</span>` : ''}
          ${item.enchantLevel > 0 && !badgeLv ? `<span class="item-enchant">+${item.enchantLevel}</span>` : ''}
          ${badgeTxt ? `<span class="item-enchant" style="color:#8cf;">${badgeTxt}</span>` : ''}
        `;

        slotEl.draggable = true;
        slotEl.addEventListener('dragstart', (e) => {
          this._beginItemDrag(item, e);
        });

        slotEl.addEventListener('click', () => {
          document.querySelectorAll('.l2-inv-slot.selected').forEach(s => s.classList.remove('selected'));
          this.selectedItem = item;
          slotEl.classList.add('selected');
        });

        slotEl.addEventListener('dblclick', () => {
          if (item.template.type === 'weapon' || item.template.type === 'armor' || item.template.type === 'accessory') {
            this.inventory.equipItem(item.uid);
          } else {
            this.inventory.useItem(item.uid);
          }
          this.render();
        });

        // ПКМ / быстрый юз: использовать расходник / надеть экип / апгрейд резонатора / меню предмета
        let lastFastActionMs = 0;
        const handleFastAction = (e) => {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }
          const now = Date.now();
          if (now - lastFastActionMs < 120) return;
          lastFastActionMs = now;

          if (item.template && (item.template.isResonator || item.template.isCircuitDevice ||
              item.template.isNanoBracelet || item.template.isBraceletDevice)) {
            this.tryUpgradeResonator(item, e);
            return;
          }
          const ttype = (item.template && item.template.type) || item.type;
          const tid = String(item.templateId || (item.template && item.template.id) || '').toLowerCase();

          if (ttype === 'consumable' || tid.startsWith('aura_') || tid.startsWith('potion_') || tid.startsWith('scroll_') || tid.startsWith('energy_drink_') || tid.startsWith('elixir_')) {
            this.inventory.useItem(item.uid);
            this.render();
            if (window.game && window.game.skillsUI) window.game.skillsUI.renderSkillBar();
            return;
          }
          if (ttype === 'weapon' || ttype === 'armor' || ttype === 'accessory' || ttype === 'title' || ttype === 'costume') {
            this.inventory.equipItem(item.uid);
            this.render();
            if (window.game && window.game.skillsUI) window.game.skillsUI.renderSkillBar();
            return;
          }
          this._showItemContextMenu(item, e);
        };

        slotEl.addEventListener('contextmenu', handleFastAction);
        slotEl.addEventListener('mouseup', (e) => {
          if (e.button === 2) handleFastAction(e);
        });

        slotEl.addEventListener('mouseenter', (e) => this.showTooltip(item, e));
        slotEl.addEventListener('mouseleave', () => this.hideTooltip());
      }

      gridEl.appendChild(slotEl);
    }
  }

  renderFooter() {
    const currencyEl = document.getElementById('l2-inv-currency-val');
    if (currencyEl) {
      currencyEl.textContent = (this.inventory.currency || 0).toLocaleString();
    }

    const weightVal = document.getElementById('l2-inv-weight-text');
    const weightBar = document.getElementById('l2-inv-weight-bar');
    if (weightVal && weightBar) {
      const currentW = this.inventory.weight || 0;
      const maxW = this.inventory.maxWeight || 10000;
      const pct = Math.min(100, (currentW / Math.max(1, maxW)) * 100);

      weightVal.textContent = currentW.toLocaleString() + ' / ' + maxW.toLocaleString();
      weightBar.style.width = pct + '%';

      if (pct >= 100) {
        weightBar.style.background = 'linear-gradient(180deg, #d84040 0%, #801010 100%)';
      } else if (pct >= 80) {
        weightBar.style.background = 'linear-gradient(180deg, #d88030 0%, #804010 100%)';
      } else if (pct >= 66) {
        weightBar.style.background = 'linear-gradient(180deg, #d8a830 0%, #886010 100%)';
      } else {
        weightBar.style.background = 'linear-gradient(180deg, #d8a830 0%, #886010 100%)';
      }
    }
  }

  /**
   * ПКМ по резонатору / нано-браслетам: меню прокачки.
   */
  tryUpgradeResonator(item, event) {
    if (!item || !item.template) return;
    const isComp = !!(item.template.isCompressor || item.template.isOperatorDevice || item.template.id === 'operator_compressor_low');
    const isBrac = !!(item.template.isBracers || item.template.isOperatorBracers || item.template.id === 'operator_bracers_low');
    if (item.template.isResonator || item.template.isCircuitDevice || isComp) {
      this._showResonatorMenu(item, event);
      return;
    }
    if (item.template.isNanoBracelet || item.template.isBraceletDevice || isBrac) {
      this._showNanoBraceletMenu(item, event);
    }
  }

  _hideResonatorMenu() {
    const m = document.getElementById('l2-res-menu');
    if (m) m.remove();
  }

  _showResonatorMenu(item, event) {
    this._hideResonatorMenu();
    const circuit = typeof item.getCircuitLevel === 'function' ? item.getCircuitLevel() : 1;
    const shell = typeof item.getShell === 'function' ? item.getShell() : null;
    const shellIdx = typeof item.getShellIndex === 'function' ? item.getShellIndex() : 0;
    const nextCircuit = circuit + 1;
    // Цена берётся из shared (сервер считает по той же функции), иначе UI
    // показывал бы одно, а списывалось другое.
    const spCost = (window.ITEM_DB && window.ITEM_DB.circuitSpCost)
      ? window.ITEM_DB.circuitSpCost(nextCircuit)
      : 40 * nextCircuit * nextCircuit;
    const ladder = (window.ITEM_DB && window.ITEM_DB.RESONATOR_SHELL_LADDER) ||
      (typeof RESONATOR_SHELL_LADDER !== 'undefined' ? RESONATOR_SHELL_LADDER : []);
    const nextShell = ladder[shellIdx + 1] || null;

    let shellLine = 'Корпус: макс.';
    if (nextShell) {
      const mats = nextShell.materials || {};
      const matStr = Object.keys(mats).map((k) => mats[k] + '×' + k.replace(/_/g, ' ')).join(', ') || '—';
      shellLine = 'Корпус → ' + nextShell.label + ' (lvl≥' + nextShell.playerLevel + ')\n  ' + matStr;
    }

    const menu = document.createElement('div');
    menu.id = 'l2-res-menu';
    menu.style.cssText = [
      'position:fixed', 'z-index:10050', 'min-width:200px',
      'background:#141820', 'border:1px solid #556677', 'border-radius:4px',
      'box-shadow:0 6px 20px rgba(0,0,0,0.65)', 'padding:4px',
      'font:12px/1.35 "Segoe UI",Tahoma,sans-serif', 'color:#dde4ee'
    ].join(';');
    const isComp = !!(item.template && (item.template.isCompressor || item.template.isOperatorDevice || item.template.id === 'operator_compressor_low'));
    const trackName = isComp ? 'Клапан' : 'Контур';
    menu.innerHTML =
      '<div style="padding:6px 8px;color:#8899aa;font-size:11px;">' + trackName + ' ' + circuit +
      ' · Корпус ' + (shell && shell.label ? shell.label : '?') + '</div>' +
      '<button type="button" data-act="circuit" style="display:block;width:100%;text-align:left;background:#1a2838;color:#cce8ff;border:1px solid #3a6080;padding:7px 10px;margin:2px 0;border-radius:3px;cursor:pointer;font:inherit;">' +
      '⚡ ' + trackName + ' → Ур.' + nextCircuit + ' (' + spCost + ' SP)</button>' +
      '<button type="button" data-act="shell" style="display:block;width:100%;text-align:left;background:#281a10;color:#ffddbb;border:1px solid #806040;padding:7px 10px;margin:2px 0;border-radius:3px;cursor:pointer;font:inherit;white-space:pre-wrap;">' +
      '🔩 ' + shellLine + '</button>' +
      '<button type="button" data-act="close" style="display:block;width:100%;text-align:left;background:transparent;color:#889;border:none;padding:6px 10px;cursor:pointer;font:inherit;">Отмена</button>';

    const x = event && event.clientX != null ? event.clientX : 200;
    const y = event && event.clientY != null ? event.clientY : 200;
    menu.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 160) + 'px';
    document.body.appendChild(menu);

    const chat = window.game && window.game.addChatMessage
      ? (m, t) => window.game.addChatMessage(m, t || 'system')
      : () => {};

    menu.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') {
        this._hideResonatorMenu();
        return;
      }
      if (act === 'circuit') {
        const res = item.upgradeCircuit ? item.upgradeCircuit() : item.upgradeResonator();
        // pending: ответ придёт пакетом device_ok / device_fail с сервера
        if (!res.pending) {
          if (res.err === 'offline') chat('Нет связи с сервером.');
          else chat('Контур: не удалось.');
        }
        this._hideResonatorMenu();
        this.render();
        return;
      }
      if (act === 'shell') {
        const res = item.upgradeShell ? item.upgradeShell() : { ok: false, err: 'no_fn' };
        if (!res.pending) {
          if (res.err === 'offline') chat('Нет связи с сервером.');
          else chat('Корпус: не удалось.');
        }
        this._hideResonatorMenu();
        this.render();
      }
    };

    const closeOnce = (ev) => {
      if (menu.contains(ev.target)) return;
      this._hideResonatorMenu();
      document.removeEventListener('mousedown', closeOnce, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnce, true), 0);
  }

  /**
   * ПКМ по нано-браслетам: Нано-сеть / Оболочка (зеркало резонатора).
   */
  _showNanoBraceletMenu(item, event) {
    this._hideResonatorMenu();
    const nano = typeof item.getNanoLevel === 'function' ? item.getNanoLevel() : 1;
    const casing = typeof item.getCasing === 'function' ? item.getCasing() : null;
    const casingIdx = typeof item.getCasingIndex === 'function' ? item.getCasingIndex() : 0;
    const nextNano = nano + 1;
    const spCost = (window.ITEM_DB && window.ITEM_DB.circuitSpCost)
      ? window.ITEM_DB.circuitSpCost(nextNano)
      : 40 * nextNano * nextNano;
    const cLadder = (window.ITEM_DB && window.ITEM_DB.NANO_CASING_LADDER) ||
      (typeof NANO_CASING_LADDER !== 'undefined' ? NANO_CASING_LADDER : []);
    const nextCasing = cLadder[casingIdx + 1] || null;

    let casingLine = 'Оболочка: макс.';
    if (nextCasing) {
      const mats = nextCasing.materials || {};
      const matStr = Object.keys(mats).map((k) => mats[k] + '×' + k.replace(/_/g, ' ')).join(', ') || '—';
      casingLine = 'Оболочка → ' + nextCasing.label + ' (lvl≥' + nextCasing.playerLevel + ')\n  ' + matStr;
    }

    const menu = document.createElement('div');
    menu.id = 'l2-res-menu';
    menu.style.cssText = [
      'position:fixed', 'z-index:10050', 'min-width:210px',
      'background:#141820', 'border:1px solid #556677', 'border-radius:4px',
      'box-shadow:0 6px 20px rgba(0,0,0,0.65)', 'padding:4px',
      'font:12px/1.35 "Segoe UI",Tahoma,sans-serif', 'color:#dde4ee'
    ].join(';');
    const isBrac = !!(item.template && (item.template.isBracers || item.template.isOperatorBracers || item.template.id === 'operator_bracers_low'));
    const trackName = isBrac ? 'Компенсаторы' : 'Связь роя';
    const subDesc = isBrac ? 'амортизация · стабилизация · разгон' : 'ремонт · подпитка · сбой схем';
    menu.innerHTML =
      '<div style="padding:6px 8px;color:#8899aa;font-size:11px;">' + trackName + ' ' + nano +
      ' · Оболочка ' + (casing && casing.label ? casing.label : '?') + '</div>' +
      '<div style="padding:0 8px 4px;color:#6a8a9a;font-size:10px;">' + subDesc + '</div>' +
      '<button type="button" data-act="nano" style="display:block;width:100%;text-align:left;background:#1a2838;color:#cce8ff;border:1px solid #3a6080;padding:7px 10px;margin:2px 0;border-radius:3px;cursor:pointer;font:inherit;">' +
      '◈ ' + trackName + ' → Ур.' + nextNano + ' (' + spCost + ' SP)</button>' +
      '<button type="button" data-act="casing" style="display:block;width:100%;text-align:left;background:#281a10;color:#ffddbb;border:1px solid #806040;padding:7px 10px;margin:2px 0;border-radius:3px;cursor:pointer;font:inherit;white-space:pre-wrap;">' +
      '🔩 ' + casingLine + '</button>' +
      '<button type="button" data-act="close" style="display:block;width:100%;text-align:left;background:transparent;color:#889;border:none;padding:6px 10px;cursor:pointer;font:inherit;">Отмена</button>';

    const x = event && event.clientX != null ? event.clientX : 200;
    const y = event && event.clientY != null ? event.clientY : 200;
    menu.style.left = Math.min(x, window.innerWidth - 250) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 180) + 'px';
    document.body.appendChild(menu);

    const chat = window.game && window.game.addChatMessage
      ? (m, t) => window.game.addChatMessage(m, t || 'system')
      : () => {};

    menu.onclick = (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'close') {
        this._hideResonatorMenu();
        return;
      }
      if (act === 'nano') {
        const res = item.upgradeNano ? item.upgradeNano() : { ok: false };
        // pending: ответ придёт пакетом device_ok / device_fail с сервера
        if (!res.pending) {
          if (res.err === 'offline') chat('Нет связи с сервером.');
          else chat('Связь роя: не удалось.');
        }
        this._hideResonatorMenu();
        this.render();
        return;
      }
      if (act === 'casing') {
        const res = item.upgradeCasing ? item.upgradeCasing() : { ok: false, err: 'no_fn' };
        if (!res.pending) {
          if (res.err === 'offline') chat('Нет связи с сервером.');
          else chat('Оболочка: не удалось.');
        }
        this._hideResonatorMenu();
        this.render();
      }
    };

    const closeOnce = (ev) => {
      if (menu.contains(ev.target)) return;
      this._hideResonatorMenu();
      document.removeEventListener('mousedown', closeOnce, true);
    };
    setTimeout(() => document.addEventListener('mousedown', closeOnce, true), 0);
  }

  showTooltip(item, event) {
    const tooltip = document.getElementById('l2-inv-tooltip');
    if (!tooltip || !item) return;

    const tpl = item.template || item;
    const type = (tpl.type || '').toLowerCase();
    const armorType = (tpl.armorType || item.armorType || '').toLowerCase();
    const weaponClass = (tpl.weaponClass || item.weaponClass || '').toLowerCase();

    // 1. Локализация категорий предметов
    const TYPE_LABELS = {
      weapon: 'Оружие',
      armor: 'Броня',
      accessory: 'Бижутерия',
      consumable: 'Расходник',
      material: 'Материал',
      recipe: 'Чертёж',
      crystal: 'Кристалл',
      enchant: 'Усилитель давления',
      quest: 'Квестовый предмет'
    };
    const typeTitle = TYPE_LABELS[type] || 'Предмет';

    // 2. Локализация класса брони (Тяжёлая броня / Лёгкая броня / Контурная роба)
    const ARMOR_TYPE_LABELS = {
      heavy: 'Тяжёлая броня',
      light: 'Лёгкая броня',
      robe: 'Контурная роба'
    };
    const armorClassTitle = type === 'armor' ? (ARMOR_TYPE_LABELS[armorType] || '') : '';

    // 3. Локализация категории оружия
    const WEAPON_CLASS_LABELS = {
      fist: 'Силовой кулак',
      blunt: 'Одноручная булава',
      '1h_blunt': 'Одноручный жезл / булава',
      '2h_blunt': 'Двуручный молот',
      wand: 'Паровой импульсник',
      sword: 'Клинок',
      '1h_sword': 'Одноручный клинок',
      '2h_sword': 'Двуручный клинок',
      pole: 'Древковое оружие',
      dagger: 'Кинжал',
      bow: 'Пневматическое оружие',
      staff: 'Паровая магистраль',
      '2h_staff': 'Паровая магистраль'
    };
    const weaponClassTitle = type === 'weapon'
      ? (WEAPON_CLASS_LABELS[weaponClass] || (tpl.isEngineerWeapon ? 'Контурный инструмент' : ''))
      : '';
    const isTwoHanded = !!(tpl.twoHanded || weaponClass === '2h_staff' || weaponClass === '2h_blunt' || weaponClass === '2h_sword' || weaponClass === 'pole');
    const isCompressor = !!(tpl.isCompressor || tpl.isOperatorDevice || tpl.id === 'operator_compressor_low');
    const isBracers = !!(tpl.isBracers || tpl.isOperatorBracers || tpl.id === 'operator_bracers_low');
    const isResonator = !!(tpl.isResonator || tpl.isCircuitDevice || isCompressor);
    const isNanoBracelet = !!(tpl.isNanoBracelet || tpl.isBraceletDevice || isBracers);

    // 4. Сборка названия грейда и типа в подзаголовке
    let gradeTitle = item.grade ? (typeof item.grade === 'object' ? item.grade.name : item.grade) : 'No-Grade';
    if (gradeTitle === 'NO_GRADE' || gradeTitle === 'no_grade') gradeTitle = 'No-Grade';
    else if (gradeTitle.length === 1) gradeTitle = gradeTitle.toUpperCase() + '-Grade';

    let categorySubtext;
    if (isResonator) {
      const shell = typeof item.getShellStats === 'function' ? item.getShellStats() : null;
      const g = shell && shell.grade ? shell.grade : gradeTitle;
      const gLabel = (g === 'NO_GRADE' || g === 'no_grade') ? 'No-Grade' : (String(g).length === 1 ? String(g).toUpperCase() + '-Grade' : g);
      categorySubtext = isCompressor ? `[${gLabel}] Прибор · нагнетатель` : `[${gLabel}] Прибор · контур`;
    } else if (isNanoBracelet) {
      const casing = typeof item.getCasingStats === 'function' ? item.getCasingStats() : null;
      const g = casing && casing.grade ? casing.grade : gradeTitle;
      const gLabel = (g === 'NO_GRADE' || g === 'no_grade') ? 'No-Grade' : (String(g).length === 1 ? String(g).toUpperCase() + '-Grade' : g);
      categorySubtext = isBracers ? `[${gLabel}] Наручи · компенсаторы` : `[${gLabel}] Манжеты · нано-рой`;
    } else {
      categorySubtext = `[${gradeTitle}] ${typeTitle}`;
      if (armorClassTitle) categorySubtext += ` · ${armorClassTitle}`;
      else if (weaponClassTitle) categorySubtext += ` · ${weaponClassTitle}`;
      if (type === 'weapon' && isTwoHanded) categorySubtext += ' · 2H';
      else if (type === 'weapon' && (tpl.isCircuit || tpl.isMagical) && !isTwoHanded) categorySubtext += ' · 1H';
    }

    // 5. Локализация характеристик
    let statsHtml = '';
    if (!(tpl.isResonator || tpl.isCircuitDevice || isNanoBracelet)) {
      const atkVal = item.attack || tpl.attack;
      if (atkVal) statsHtml += `Физ. Атк: ${atkVal}<br>`;
      const cAtkVal = (item.cAtk != null && typeof item.cAtk === 'number') ? item.cAtk : tpl.cAtk;
      if (cAtkVal) statsHtml += `Схем. Атк: ${cAtkVal}<br>`;
    }
    if (tpl.isResonator || tpl.isCircuitDevice || isCompressor) {
      const cl = typeof item.getCircuitLevel === 'function' ? item.getCircuitLevel()
        : (typeof item.getResonatorLevel === 'function' ? item.getResonatorLevel() : 1);
      const cMax = (isCompressor ? (tpl.valveMaxLevel || tpl.circuitMaxLevel) : tpl.circuitMaxLevel) || 10;
      const shell = typeof item.getShellStats === 'function' ? item.getShellStats() : null;
      const cDef = shell ? shell.cDef : (item.cDef || 0);
      const hpB = shell ? shell.hpBonus : 0;
      const enB = shell ? shell.energyBonus : 0;
      const shellLabel = shell && shell.label ? shell.label : 'NG I';
      const trackLabel = isCompressor ? 'Клапан' : 'Контур';
      statsHtml += `${trackLabel}: <b style="color:#8cf">${cl}</b> / ${cMax}<br>`;
      statsHtml += `Корпус: <b style="color:#fc8">${shellLabel}</b><br>`;
      if (cDef) statsHtml += `Защита контура: ${cDef}<br>`;
      if (hpB) statsHtml += `Запас прочности: +${hpB}<br>`;
      if (enB) statsHtml += `Запас пара: +${enB}<br>`;
      statsHtml += `<span style="color:#889">ПКМ — усилить ${trackLabel.toLowerCase()} или корпус</span><br>`;
    }
    if (isNanoBracelet) {
      const nl = typeof item.getNanoLevel === 'function' ? item.getNanoLevel() : 1;
      const nMax = (isBracers ? (tpl.wristMaxLevel || tpl.nanoMaxLevel) : tpl.nanoMaxLevel) || 10;
      const casing = typeof item.getCasingStats === 'function' ? item.getCasingStats() : null;
      const cDef = casing ? casing.cDef : (item.cDef || 0);
      const hpB = casing ? casing.hpBonus : 0;
      const enB = casing ? casing.energyBonus : 0;
      const casingLabel = casing && casing.label ? casing.label : 'NG I';
      const trackLabel = isBracers ? 'Компенсаторы' : 'Связь роя';
      statsHtml += `${trackLabel}: <b style="color:#8cf">${nl}</b> / ${nMax}<br>`;
      statsHtml += `Оболочка: <b style="color:#fc8">${casingLabel}</b><br>`;
      if (cDef) statsHtml += `Защита контура: ${cDef}<br>`;
      if (hpB) statsHtml += `Запас прочности: +${hpB}<br>`;
      if (enB) statsHtml += `Запас пара: +${enB}<br>`;
      statsHtml += `<span style="color:#889">ПКМ — усилить ${trackLabel.toLowerCase()} или оболочку</span><br>`;
    }
    if (tpl.baseAtkSpd) statsHtml += `Atk.Spd base: ${tpl.baseAtkSpd}${tpl.atkSpdGrade ? ' (' + tpl.atkSpdGrade + ')' : ''}<br>`;
    const defVal = item.defense || tpl.defense;
    if (defVal) {
      const isShieldItem = !!(tpl.isShield || tpl.slot === 'shield' ||
        (typeof EQUIP_SLOTS !== 'undefined' && tpl.slot === EQUIP_SLOTS.SHIELD));
      statsHtml += isShieldItem ? `P.Def щита: ${defVal}<br>` : `Физ. Защ: ${defVal}<br>`;
    }
    if (tpl.cDef) statsHtml += `Контур. Защ: ${tpl.cDef}<br>`;
    const br = item.blockRate != null ? item.blockRate : tpl.blockRate;
    if (br) statsHtml += `Шанс блока: +${br}%<br>`;
    const hpB = item.hpBonus || tpl.hpBonus;
    if (hpB) statsHtml += `HP: +${hpB}<br>`;
    const mpB = item.energyBonus || tpl.energyBonus;
    if (mpB) statsHtml += `Пар: +${mpB}<br>`;
    const spdB = item.speedBonus || tpl.speedBonus;
    if (spdB) statsHtml += `Скорость: +${spdB}<br>`;
    if (isTwoHanded) statsHtml += `Двуручное (щит нельзя)<br>`;
    if (tpl.isShield || tpl.slot === 'shield') statsHtml += `Блок физ. ударов (C1)<br>`;
    if (tpl.fullBody) statsHtml += `Цельная роба (верх+низ)<br>`;
    if (tpl.setId && window.ITEM_DB && window.ITEM_DB.ARMOR_SETS) {
      const sd = window.ITEM_DB.ARMOR_SETS[tpl.setId];
      if (sd) {
        const need = sd.required || '?';
        statsHtml += `Сет «${sd.name || tpl.setId}» (${need} ч.)<br>`;
        const b = sd.bonus || {};
        if (b.castSpeedSet) statsHtml += `  Cast +${Math.round(b.castSpeedSet * 100)}%<br>`;
        if (b.cAtkPercent) statsHtml += `  Схем. Атк +${Math.round(b.cAtkPercent * 100)}%<br>`;
        if (b.pDefPercent) statsHtml += `  P.Def +${(b.pDefPercent * 100).toFixed(2)}%<br>`;
        if (b.energyPercent) statsHtml += `  Пар +${(b.energyPercent * 100).toFixed(2)}%<br>`;
        if (b.energyFlat) statsHtml += `  Пар +${b.energyFlat}<br>`;
        if (b.hpFlat) statsHtml += `  HP ${b.hpFlat}<br>`;
        if (b.energyRegen) statsHtml += `  Реген пара ${b.energyRegen > 0 ? '+' : ''}${Math.round(b.energyRegen * 100)}%<br>`;
        if (b.speedL2) statsHtml += `  Speed +${b.speedL2}<br>`;
        if (b.primary) {
          const ps = Object.keys(b.primary).map(k => `${k}${b.primary[k] > 0 ? '+' : ''}${b.primary[k]}`).join(', ');
          if (ps) statsHtml += `  ${ps}<br>`;
        }
        if (!b.castSpeedSet && !b.cAtkPercent && !b.pDefPercent && !b.energyPercent && !b.energyFlat && !b.hpFlat && !b.primary && !b.speedL2) {
          statsHtml += `  (без сетового бонуса)<br>`;
        }
      }
    }

    const nameColor = item.grade && typeof item.grade === 'object' ? item.grade.color : '#ffffff';
    let descText = item.description || tpl.description || '';
    // Чистый текст описания (без HTML-тегов из старых правок)
    descText = String(descText).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const priceVal = item.price != null ? item.price : (tpl.price || 0);
    // Имя без дублирования «· Ур.N» в title если уже в stats
    let displayName = item.name || tpl.name || 'Предмет';
    if (tpl.isResonator || tpl.isCircuitDevice) {
      displayName = tpl.name || 'Паровой резонатор';
    }
    if (tpl.isNanoBracelet || tpl.isBraceletDevice) {
      displayName = tpl.name || 'Нано-браслеты';
    }

    tooltip.innerHTML = `
      <div class="l2-inv-tt-name" style="color: ${nameColor}">
        ${displayName}
      </div>
      <div class="l2-inv-tt-grade" style="color: #a0abb8">
        ${categorySubtext}
      </div>
      ${statsHtml ? `<div class="l2-inv-tt-stats">${statsHtml}</div>` : ''}
      ${descText ? `<div class="l2-inv-tt-desc" style="max-width:240px;white-space:normal;line-height:1.35;color:#9aa8b8;margin-top:6px;">${descText}</div>` : ''}
      <div class="l2-inv-tt-price">💰 ${priceVal ? priceVal.toLocaleString() : 0} медных деталей</div>
    `;

    tooltip.classList.remove('hidden');
    const x = Math.min(event.clientX + 14, window.innerWidth - 260);
    const y = Math.min(event.clientY + 14, window.innerHeight - 180);
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  hideTooltip() {
    const tooltip = document.getElementById('l2-inv-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
  }
}

if (typeof window !== 'undefined') {
  window.InventoryUI = InventoryUI;
}