// ============================================================
// ENCHANT-UI.JS — окно заточки (L2): использование усилителя открывает окно со списком
// подходящих предметов (надетых и одиночных в сумке). Предмет выбирается в окне, шанс и
// риск показываются до подтверждения; результат приходит с сервера (enchant_ok / _fail / _break).
// Правила (тип усилителя, грейд, safe, шанс, кристаллы) — shared/enchant-rules.js, как на сервере.
// ============================================================
(function (root) {
  'use strict';

  var STYLE_ID = 'ps-enchant-css';
  var ROOT_ID = 'ps-enchant-root';
  var ENCHANTABLE_TYPES = { weapon: 1, armor: 1, shield: 1, accessory: 1, jewelry: 1 };

  var state = { scrollId: null, selected: null, busy: false, result: null, keyHandler: null };

  function ER() { return root.ENCHANT_RULES || null; }
  function IDB() { return root.ITEM_DB || null; }
  function inv() { return (root.game && root.game.inventory) || null; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function tplOf(item) {
    if (!item) return null;
    if (item.template) return item.template;
    var db = IDB();
    return (db && db.get && db.get(item.templateId)) || null;
  }

  function tplById(id) {
    var db = IDB();
    return (db && db.get && db.get(id)) || null;
  }

  function isDevice(tpl) {
    return !!(tpl && (tpl.isResonator || tpl.isCircuitDevice || tpl.isCompressor || tpl.isOperatorDevice ||
      tpl.isNanoBracelet || tpl.isBraceletDevice || tpl.isBracers || tpl.isOperatorBracers || tpl.isValveDevice));
  }

  function maxFor(tpl) {
    var er = ER();
    var db = IDB();
    var abs = (db && db.ENCHANT_MAX) || 16;
    return Math.min(abs, er ? er.maxLevel(tpl) : 0);
  }

  function scrollCount(id) {
    var api = inv();
    if (!api || !api.slots) return 0;
    var n = 0;
    for (var i = 0; i < api.slots.length; i++) {
      var it = api.slots[i];
      if (it && it.templateId === id) n += (it.count || 1);
    }
    return n;
  }

  /** Предметы, которые этот усилитель может заточить. */
  function candidates(scrollId) {
    var api = inv();
    var er = ER();
    if (!api || !er) return [];
    var totals = {};
    (api.slots || []).forEach(function (it) {
      if (it && it.templateId) totals[it.templateId] = (totals[it.templateId] || 0) + (it.count || 1);
    });
    var out = [];
    function consider(it, slot, equipped) {
      var tpl = tplOf(it);
      if (!tpl || !ENCHANTABLE_TYPES[String(tpl.type || '').toLowerCase()] || isDevice(tpl)) return;
      if (!equipped && totals[it.templateId] !== 1) return; // в сумке — только одиночная копия
      if (er.scrollCandidates(tpl, slot).indexOf(scrollId) < 0) return;
      var plus = Math.max(0, it.enchantLevel | 0);
      out.push({
        key: equipped ? 'slot:' + slot : 'bag:' + it.templateId,
        item: it, tpl: tpl, slot: equipped ? slot : null, itemId: equipped ? null : it.templateId,
        plus: plus, max: maxFor(tpl), equipped: equipped
      });
    }
    var eq = api.equipment || {};
    Object.keys(eq).forEach(function (s) { if (eq[s]) consider(eq[s], s, true); });
    (api.slots || []).forEach(function (it) { if (it) consider(it, null, false); });
    return out;
  }

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#ps-enchant-root{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:11000;',
      'width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 32px);display:flex;flex-direction:column;',
      'background:linear-gradient(180deg,rgba(36,28,22,0.97) 0%,rgba(12,10,8,0.98) 100%);border:1px solid #8a6a3a;',
      'box-shadow:0 0 0 1px rgba(0,0,0,0.85),0 12px 40px rgba(0,0,0,0.65);color:#e8e0d0;border-radius:3px;',
      'font-family:Georgia,"Times New Roman","Segoe UI",sans-serif;font-size:13px;}',
      '#ps-enchant-root.hidden{display:none!important;}',
      '.pse-head{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #4a3c28;}',
      '.pse-title{font-size:15px;font-weight:700;color:#ffcc88;text-shadow:0 1px 2px #000;letter-spacing:0.03em;}',
      '.pse-x{appearance:none;background:none;border:1px solid #6a5a3a;color:#d0c8b8;width:24px;height:24px;cursor:pointer;border-radius:2px;}',
      '.pse-x:hover{border-color:#c0a060;color:#fff4d0;}',
      '.pse-scroll{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid #2e261c;}',
      '.pse-ico{width:32px;height:32px;flex:0 0 32px;display:flex;align-items:center;justify-content:center;',
      'background:#1a1410;border:1px solid #4a3c28;}',
      '.pse-ico img{width:30px;height:30px;}',
      '.pse-sub{font-size:12px;color:#a89c84;}',
      '.pse-hint{padding:6px 12px 2px;font-size:12px;color:#a89c84;}',
      '.pse-list{overflow-y:auto;padding:4px 8px;min-height:60px;max-height:38vh;}',
      '.pse-row{display:flex;align-items:center;gap:8px;padding:5px 6px;margin:2px 0;border:1px solid transparent;',
      'border-radius:2px;cursor:pointer;background:rgba(255,255,255,0.02);}',
      '.pse-row:hover{border-color:#6a5a3a;}',
      '.pse-row.sel{border-color:#c0a060;background:rgba(192,160,96,0.12);}',
      '.pse-row.maxed{opacity:0.5;cursor:default;}',
      '.pse-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.pse-plus{color:#ffcc66;font-weight:700;margin-right:4px;}',
      '.pse-tag{font-size:11px;color:#8fbf7a;}',
      '.pse-empty{padding:12px 6px;color:#a89c84;text-align:center;}',
      '.pse-info{padding:8px 12px;border-top:1px solid #2e261c;line-height:1.45;min-height:54px;}',
      '.pse-chance{color:#ffe0a0;font-weight:700;}',
      '.pse-risk{color:#d0c8b8;}',
      '.pse-risk.danger{color:#ff9a8a;}',
      '.pse-result{padding:0 12px 6px;font-weight:700;min-height:18px;}',
      '.pse-result.ok{color:#9be37f;}.pse-result.fail{color:#ffcc88;}.pse-result.break{color:#ff8a7a;}',
      '.pse-actions{display:flex;gap:8px;padding:8px 12px 12px;}',
      '.pse-btn{flex:1;appearance:none;cursor:pointer;padding:9px 12px;border-radius:2px;font-family:inherit;font-size:13px;',
      'border:1px solid #6a5a3a;background:linear-gradient(180deg,#3a3020 0%,#221a12 100%);color:#e8dcc0;text-shadow:0 1px 1px #000;}',
      '.pse-btn:hover:not(:disabled){border-color:#c0a060;color:#fff4d0;}',
      '.pse-btn.primary{border-color:#aa7744;background:linear-gradient(180deg,#5a3a18 0%,#3a2410 100%);color:#ffe0a0;font-weight:700;}',
      '.pse-btn.danger{border-color:#aa4444;background:linear-gradient(180deg,#5a2222 0%,#2a1010 100%);color:#ffcccc;font-weight:700;}',
      '.pse-btn:disabled{opacity:0.4;cursor:not-allowed;}'
    ].join('');
    document.head.appendChild(s);
  }

  function getRoot() {
    var el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'hidden';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Заточка');
    document.body.appendChild(el);
    return el;
  }

  function iconHtml(item) {
    if (typeof root.getItemIconHtml === 'function') return root.getItemIconHtml(item);
    var tpl = tplOf(item) || item;
    return tpl && tpl.icon ? '<img src="' + esc(tpl.icon) + '" alt="" />' : '';
  }

  function crystalName(id) {
    var t = tplById(id);
    return (t && t.name) || id;
  }

  function render() {
    var el = getRoot();
    var er = ER();
    var sid = state.scrollId;
    var sTpl = tplById(sid);
    var count = scrollCount(sid);
    var list = candidates(sid);
    var sel = null;
    for (var i = 0; i < list.length; i++) if (list[i].key === state.selected) sel = list[i];
    if (!sel) state.selected = null;

    var html = '';
    html += '<div class="pse-head"><span class="pse-title">Заточка</span>' +
      '<button type="button" class="pse-x" data-act="close" aria-label="Закрыть">✕</button></div>';
    html += '<div class="pse-scroll"><span class="pse-ico">' + iconHtml({ templateId: sid, template: sTpl }) + '</span>' +
      '<div><div>' + esc((sTpl && sTpl.name) || sid) + '</div>' +
      '<div class="pse-sub">В сумке: ' + count + ' шт.</div></div></div>';
    html += '<div class="pse-hint">Выберите предмет для заточки:</div>';
    html += '<div class="pse-list">';
    if (!list.length) {
      var kind = sTpl && sTpl.targetType === 'armor' ? 'броню, щит или бижутерию' : 'оружие';
      var grade = sTpl && String(sTpl.grade || '').toLowerCase() === 'd' ? 'D-грейда' : 'без грейда';
      html += '<div class="pse-empty">Нет подходящих предметов: этот усилитель точит ' + kind + ' ' + grade + '.</div>';
    }
    list.forEach(function (c) {
      var maxed = c.plus >= c.max;
      html += '<div class="pse-row' + (c.key === state.selected ? ' sel' : '') + (maxed ? ' maxed' : '') + '" data-key="' + esc(c.key) + '">' +
        '<span class="pse-ico">' + iconHtml(c.item) + '</span>' +
        '<span class="pse-name">' + (c.plus > 0 ? '<span class="pse-plus">+' + c.plus + '</span>' : '') + esc(c.tpl.name || c.item.templateId) + '</span>' +
        (c.equipped ? '<span class="pse-tag">надето</span>' : '') +
        (maxed ? '<span class="pse-tag">предел +' + c.max + '</span>' : '') +
        '</div>';
    });
    html += '</div>';

    var canGo = false;
    var danger = false;
    html += '<div class="pse-info">';
    if (sel && er) {
      var maxed = sel.plus >= sel.max;
      if (maxed) {
        html += 'Предел заточки: +' + sel.max + '.';
      } else {
        var chance = Math.round(er.successChance(sel.plus, sel.tpl, sel.slot) * 100);
        var safe = er.safeLevel(sel.tpl);
        var blessed = er.isBlessedScroll(sid, sTpl);
        html += '+' + sel.plus + ' → +' + (sel.plus + 1) + ' · шанс <span class="pse-chance">' + chance + '%</span><br>';
        if (sel.plus < safe) {
          html += '<span class="pse-risk">Безопасно: до +' + safe + ' заточка не срывается.</span>';
        } else if (blessed) {
          html += '<span class="pse-risk">При неудаче заточка сбросится до +0, предмет останется.</span>';
        } else {
          var cry = er.crystalize(sel.tpl, sel.plus);
          danger = true;
          html += '<span class="pse-risk danger">При неудаче предмет кристаллизуется' +
            (cry && cry.count > 0 ? ': ' + cry.count + ' × ' + esc(crystalName(cry.crystalId)) : '') + '.</span>';
        }
        canGo = count > 0 && !state.busy;
      }
    } else {
      html += '<span class="pse-sub">Шанс и риск появятся после выбора предмета.</span>';
    }
    html += '</div>';
    var r = state.result;
    html += '<div class="pse-result' + (r ? ' ' + r.cls : '') + '">' + (r ? esc(r.text) : '') + '</div>';
    html += '<div class="pse-actions">' +
      '<button type="button" class="pse-btn ' + (danger ? 'danger' : 'primary') + '" data-act="go"' + (canGo ? '' : ' disabled') + '>' +
      (state.busy ? 'Заточка…' : (count > 0 ? 'Заточить' : 'Усилители закончились')) + '</button>' +
      '<button type="button" class="pse-btn" data-act="close">Закрыть</button></div>';
    el.innerHTML = html;
  }

  function onClick(e) {
    var t = e.target;
    var act = t.closest && t.closest('[data-act]');
    if (act) {
      var a = act.getAttribute('data-act');
      if (a === 'close') { EnchantUI.close(); return; }
      if (a === 'go') { submit(); return; }
    }
    var row = t.closest && t.closest('.pse-row');
    if (row && !row.classList.contains('maxed')) {
      state.selected = row.getAttribute('data-key');
      state.result = null;
      render();
    }
  }

  function submit() {
    if (state.busy || !state.selected) return;
    var list = candidates(state.scrollId);
    var sel = null;
    for (var i = 0; i < list.length; i++) if (list[i].key === state.selected) sel = list[i];
    if (!sel || sel.plus >= sel.max) return;
    var net = root.game && root.game.net;
    if (!net || typeof net.intentEnchant !== 'function') {
      state.result = { cls: 'fail', text: 'Нет связи с сервером.' };
      render();
      return;
    }
    state.busy = true;
    state.result = null;
    render();
    net.intentEnchant(sel.slot ? { slot: sel.slot } : { itemId: sel.itemId }, state.scrollId);
    // страховка: если ответ не пришёл, кнопка снова станет доступной
    clearTimeout(state.busyTimer);
    state.busyTimer = setTimeout(function () { if (state.busy) { state.busy = false; if (EnchantUI.isOpen()) render(); } }, 4000);
  }

  var EnchantUI = {
    /** Открыть окно для усилителя scrollId (templateId). */
    open: function (scrollId) {
      if (!scrollId) return;
      ensureCss();
      state.scrollId = String(scrollId).toLowerCase();
      state.selected = null;
      state.busy = false;
      state.result = null;
      var el = getRoot();
      el.className = '';
      if (!el._psBound) {
        el.addEventListener('click', onClick);
        el._psBound = true;
      }
      if (!state.keyHandler) {
        state.keyHandler = function (e) {
          if (e.key === 'Escape' && EnchantUI.isOpen()) { e.preventDefault(); EnchantUI.close(); }
        };
        document.addEventListener('keydown', state.keyHandler, true);
      }
      // первый подходящий предмет — сразу выбран (как слот предмета в окне L2)
      var list = candidates(state.scrollId).filter(function (c) { return c.plus < c.max; });
      if (list.length) state.selected = list[0].key;
      render();
    },
    close: function () {
      var el = document.getElementById(ROOT_ID);
      if (el) { el.className = 'hidden'; el.innerHTML = ''; }
      if (state.keyHandler) {
        document.removeEventListener('keydown', state.keyHandler, true);
        state.keyHandler = null;
      }
      state.scrollId = null;
      state.busy = false;
    },
    isOpen: function () {
      var el = document.getElementById(ROOT_ID);
      return !!(el && el.className !== 'hidden' && state.scrollId);
    },
    /** Перерисовать (сумка изменилась). */
    refresh: function () { if (EnchantUI.isOpen() && !state.busy) render(); },
    /** Ответ сервера на заточку. */
    onResult: function (m) {
      if (!EnchantUI.isOpen() || !m) return;
      clearTimeout(state.busyTimer);
      state.busy = false;
      if (m.t === 'enchant_ok') {
        state.result = { cls: 'ok', text: 'Успех: +' + m.plus };
      } else if (m.t === 'enchant_break') {
        var txt = 'Неудача: предмет кристаллизован';
        if (m.crystals && m.crystals.count > 0) txt += ' (' + m.crystals.count + ' × ' + crystalName(m.crystals.id) + ')';
        state.result = { cls: 'break', text: txt + '.' };
        state.selected = null;
      } else if (m.blessedReset) {
        state.result = { cls: 'fail', text: 'Неудача: заточка сброшена до +0.' };
      } else if (m.reason === 'max') {
        state.result = { cls: 'fail', text: 'Достигнут предел заточки.' };
      } else if (m.reason === 'no_scroll') {
        state.result = { cls: 'fail', text: 'Нет подходящего усилителя.' };
      } else if (m.reason === 'stack') {
        state.result = { cls: 'fail', text: 'Точится только одиночный предмет: уберите копии на склад.' };
      } else if (m.reason) {
        state.result = { cls: 'fail', text: 'Заточка невозможна.' };
      } else {
        state.result = { cls: 'fail', text: 'Неудача.' };
      }
      render();
    },
    /** Для тестов: список предметов, подходящих усилителю. */
    _candidates: candidates
  };

  root.EnchantUI = EnchantUI;
})(typeof window !== 'undefined' ? window : globalThis);
