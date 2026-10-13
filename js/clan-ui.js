// ============================================================
//  CLIENT / CLAN-UI.JS — окно клана и редактор креста 16×12.
//  Состав и склад считает сервер. Крест: сырые RGBA, не PNG.
// ============================================================
(function () {
  'use strict';

  var PALETTE = ['#000000', '#ffffff', '#c41e3a', '#c9a227', '#2e7d32', '#1565c0', '#6d4c41', '#78909c'];
  var CW = 16, CH = 12, CELL = 14;

  function b64ToBytes(s) {
    try {
      var bin = atob(String(s || ''));
      var u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return u;
    } catch (e) { return null; }
  }

  function bytesToB64(u) {
    var s = '';
    for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }

  function hexToRgb(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  }

  class ClanUI {
    constructor() {
      this._el = null;
      this._crestEl = null;
      this._pixels = null;
      this._color = PALETTE[2];
      this._ensure();
    }

    _ensure() {
      if (this._el) return;
      var style = document.createElement('style');
      style.textContent =
        '#ps-clan-win{position:fixed;left:50%;top:46%;transform:translate(-50%,-50%);z-index:48;' +
        'width:340px;background:rgba(12,16,22,.94);border:1px solid #3c4856;color:#cfd8e3;' +
        'font:12px Segoe UI,Tahoma,sans-serif;display:none;box-shadow:0 8px 24px #000}' +
        '#ps-clan-win.open{display:block}' +
        '#ps-clan-win .hd{background:#1a222c;color:#f5d475;padding:6px 10px;cursor:move;font-weight:700}' +
        '#ps-clan-win .bd{padding:8px 10px;max-height:320px;overflow:auto}' +
        '#ps-clan-win .row{display:flex;justify-content:space-between;gap:8px;padding:2px 0}' +
        '#ps-clan-win .on{color:#6ee7b7}#ps-clan-win .off{color:#8893a0}' +
        '#ps-clan-win .btns{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #2e3844}' +
        '#ps-clan-win button{background:#2a3542;border:1px solid #445262;color:#f5d475;padding:4px 8px;cursor:pointer}' +
        '#ps-crest-win{position:fixed;left:50%;top:48%;transform:translate(-50%,-50%);z-index:49;' +
        'background:rgba(12,16,22,.96);border:1px solid #3c4856;color:#cfd8e3;display:none;padding:10px}' +
        '#ps-crest-win.open{display:block}' +
        '#ps-crest-grid{display:grid;grid-template-columns:repeat(16,14px);gap:1px;background:#111;padding:2px;margin:6px 0}' +
        '#ps-crest-grid i{width:14px;height:14px;display:block;cursor:pointer;box-sizing:border-box}' +
        '#ps-crest-pal{display:flex;gap:4px;margin:6px 0}' +
        '#ps-crest-pal b{width:16px;height:16px;display:block;cursor:pointer;border:1px solid #445262}';
      document.head.appendChild(style);

      this._el = document.createElement('div');
      this._el.id = 'ps-clan-win';
      this._el.innerHTML = '<div class="hd" id="ps-clan-hd">Клан</div><div class="bd" id="ps-clan-bd"></div>' +
        '<div class="btns">' +
        '<button type="button" id="ps-clan-crest">Крест</button>' +
        '<button type="button" id="ps-clan-close">Закрыть</button></div>';
      document.body.appendChild(this._el);
      document.getElementById('ps-clan-close').onclick = () => this.close();
      document.getElementById('ps-clan-crest').onclick = () => this.openCrest();

      this._crestEl = document.createElement('div');
      this._crestEl.id = 'ps-crest-win';
      this._crestEl.innerHTML = '<div style="color:#f5d475;font-weight:700;margin-bottom:4px">Крест клана 16×12</div>' +
        '<div id="ps-crest-pal"></div><div id="ps-crest-grid"></div>' +
        '<div style="display:flex;gap:6px"><button type="button" id="ps-crest-ok">Сохранить</button>' +
        '<button type="button" id="ps-crest-x">Отмена</button></div>';
      document.body.appendChild(this._crestEl);
      document.getElementById('ps-crest-ok').onclick = () => this._submitCrest();
      document.getElementById('ps-crest-x').onclick = () => this._crestEl.classList.remove('open');
      var pal = document.getElementById('ps-crest-pal');
      PALETTE.forEach((c) => {
        var b = document.createElement('b');
        b.style.background = c;
        b.onclick = () => { this._color = c; };
        pal.appendChild(b);
      });
    }

    apply(m) {
      var c = m && m.clan;
      this._clan = c || null;
      var net = window.game && window.game.net;
      if (net) net.clan = c || null;
      if (!this._el.classList.contains('open')) return;
      this._render();
    }

    open() {
      this._el.classList.add('open');
      var net = window.game && window.game.net;
      if (net && net.intentClanInfo) net.intentClanInfo();
      this._render();
    }

    close() { this._el.classList.remove('open'); }

    _render() {
      var bd = document.getElementById('ps-clan-bd');
      if (!bd) return;
      var c = this._clan;
      if (!c) {
        bd.textContent = 'Вы не в клане. /clancreate Имя — создать с 10 уровня (' +
          ((window.CLAN_RULES && window.CLAN_RULES.CREATE_COST) || 5000).toLocaleString() + '⚙️).';
        return;
      }
      var html = '<div class="row"><b>' + this._esc(c.name) + '</b><span>ур. ' + (c.level | 0) +
        ' · реп. ' + (c.reputation | 0) + '</span></div>';
      html += '<div class="row"><span>Состав ' + (c.members || []).length + '/' + (c.cap || 0) +
        '</span><span>склад ' + (c.whSlots || 80) + '</span></div>';
      (c.members || []).forEach((m) => {
        html += '<div class="row"><span class="' + (m.online ? 'on' : 'off') + '">' +
          (m.online ? '● ' : '○ ') + this._esc(m.name) +
          (m.level ? (' ур.' + m.level) : '') + '</span><span>' + this._esc(m.rank) + '</span></div>';
      });
      bd.innerHTML = html;
    }

    _esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
      });
    }

    openCrest() {
      var CL = window.CLAN_RULES;
      this._pixels = new Uint8Array(CW * CH * 4);
      var cached = window.game && window.game.net && window.game.net.clanCrest;
      if (cached && cached.rgba && cached.w === CW) {
        var bytes = b64ToBytes(cached.rgba);
        if (bytes && bytes.length === this._pixels.length) this._pixels.set(bytes);
      }
      var grid = document.getElementById('ps-crest-grid');
      grid.innerHTML = '';
      for (var i = 0; i < CW * CH; i++) {
        var cell = document.createElement('i');
        var p = i * 4;
        cell.style.background = 'rgb(' + this._pixels[p] + ',' + this._pixels[p + 1] + ',' + this._pixels[p + 2] + ')';
        cell.onmousedown = (function (idx, self) {
          return function (e) { e.preventDefault(); self._paint(idx); };
        })(i, this);
        grid.appendChild(cell);
      }
      this._crestEl.classList.add('open');
    }

    _paint(idx) {
      var rgb = hexToRgb(this._color);
      var p = idx * 4;
      this._pixels[p] = rgb[0];
      this._pixels[p + 1] = rgb[1];
      this._pixels[p + 2] = rgb[2];
      this._pixels[p + 3] = 255;
      var cell = document.getElementById('ps-crest-grid').children[idx];
      if (cell) cell.style.background = this._color;
    }

    _submitCrest() {
      var net = window.game && window.game.net;
      if (!net || !net.intentClanCrest) return;
      net.intentClanCrest(CW, CH, bytesToB64(this._pixels));
      this._crestEl.classList.remove('open');
    }
  }

  window.ClanUI = ClanUI;
  window.clanCrestToImageData = function (w, h, b64) {
    var bytes = b64ToBytes(b64);
    if (!bytes || bytes.length !== w * h * 4) return null;
    if (typeof ImageData !== 'function') return { w: w, h: h, data: bytes };
    var img = new ImageData(w, h);
    img.data.set(bytes);
    return img;
  };
})();
