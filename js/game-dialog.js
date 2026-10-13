// ============================================================
// GAME-DIALOG.JS — in-game confirm / alert / prompt (no browser system dialogs)
// ============================================================
(function (root) {
  'use strict';

  var STYLE_ID = 'ps-game-dialog-css';
  var ROOT_ID = 'ps-game-dialog-root';
  var _queue = [];
  var _busy = false;

  function ensureCss() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#ps-game-dialog-root{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.62);pointer-events:auto;font-family:Georgia,"Times New Roman","Segoe UI",sans-serif;}',
      '#ps-game-dialog-root.hidden{display:none!important;}',
      '.ps-gd-box{width:min(400px,92vw);padding:16px 18px 14px;border-radius:3px;text-align:center;',
      'background:linear-gradient(180deg,rgba(36,28,22,0.97) 0%,rgba(12,10,8,0.98) 100%);',
      'border:1px solid #8a6a3a;box-shadow:0 0 0 1px rgba(0,0,0,0.85),0 12px 40px rgba(0,0,0,0.65);color:#e8e0d0;}',
      '.ps-gd-title{font-size:16px;font-weight:700;color:#ffcc88;margin-bottom:10px;letter-spacing:0.03em;',
      'text-shadow:0 1px 2px #000;}',
      '.ps-gd-body{font-size:13px;line-height:1.45;color:#d0c8b8;margin-bottom:14px;white-space:pre-wrap;word-break:break-word;}',
      '.ps-gd-input{width:100%;box-sizing:border-box;margin:0 0 14px;padding:8px 10px;border-radius:2px;',
      'border:1px solid #6a5a3a;background:#1a1612;color:#f0e8d8;font-size:13px;font-family:inherit;}',
      '.ps-gd-input:focus{outline:none;border-color:#c0a060;}',
      '.ps-gd-actions{display:flex;gap:8px;justify-content:center;}',
      '.ps-gd-btn{flex:1;max-width:160px;appearance:none;cursor:pointer;padding:9px 12px;border-radius:2px;',
      'font-family:inherit;font-size:13px;border:1px solid #6a5a3a;',
      'background:linear-gradient(180deg,#3a3020 0%,#221a12 100%);color:#e8dcc0;text-shadow:0 1px 1px #000;}',
      '.ps-gd-btn:hover{border-color:#c0a060;color:#fff4d0;}',
      '.ps-gd-btn.primary{border-color:#aa7744;background:linear-gradient(180deg,#5a3a18 0%,#3a2410 100%);',
      'color:#ffe0a0;font-weight:700;}',
      '.ps-gd-btn.primary:hover{border-color:#ffcc66;color:#fff8e0;}',
      '.ps-gd-btn.danger{border-color:#aa4444;background:linear-gradient(180deg,#5a2222 0%,#2a1010 100%);color:#ffcccc;}'
    ].join('');
    document.head.appendChild(s);
  }

  function getRoot() {
    var el = document.getElementById(ROOT_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ROOT_ID;
    el.className = 'hidden';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
  }

  function closeRoot() {
    var el = getRoot();
    el.className = 'hidden';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '';
  }

  function runNext() {
    _busy = false;
    if (!_queue.length) return;
    var job = _queue.shift();
    _busy = true;
    job();
  }

  function showBox(opts) {
    return new Promise(function (resolve) {
      function job() {
        ensureCss();
        var root = getRoot();
        root.className = '';
        root.setAttribute('aria-hidden', 'false');
        var title = opts.title || 'Подтверждение';
        var body = opts.message || '';
        var showInput = opts.mode === 'prompt';
        var danger = !!opts.danger;
        var okLabel = opts.okLabel || (opts.mode === 'alert' ? 'OK' : 'OK');
        var cancelLabel = opts.cancelLabel || 'Отмена';
        var html = '<div class="ps-gd-box" role="dialog" aria-modal="true">' +
          '<div class="ps-gd-title"></div>' +
          '<div class="ps-gd-body"></div>' +
          (showInput ? '<input type="text" class="ps-gd-input" autocomplete="off" />' : '') +
          '<div class="ps-gd-actions">' +
          (opts.mode === 'alert'
            ? '<button type="button" class="ps-gd-btn primary" data-act="ok"></button>'
            : '<button type="button" class="ps-gd-btn' + (danger ? ' danger' : ' primary') + '" data-act="ok"></button>' +
              '<button type="button" class="ps-gd-btn" data-act="cancel"></button>') +
          '</div></div>';
        root.innerHTML = html;
        root.querySelector('.ps-gd-title').textContent = title;
        root.querySelector('.ps-gd-body').textContent = body;
        var okBtn = root.querySelector('[data-act="ok"]');
        var cancelBtn = root.querySelector('[data-act="cancel"]');
        okBtn.textContent = okLabel;
        if (cancelBtn) cancelBtn.textContent = cancelLabel;
        var input = root.querySelector('.ps-gd-input');
        if (input) {
          input.value = opts.defaultValue != null ? String(opts.defaultValue) : '';
          setTimeout(function () { try { input.focus(); input.select(); } catch (e) {} }, 30);
        } else {
          setTimeout(function () { try { okBtn.focus(); } catch (e) {} }, 30);
        }

        function finish(val) {
          document.removeEventListener('keydown', onKey, true);
          closeRoot();
          resolve(val);
          runNext();
        }
        function onKey(e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (opts.mode === 'alert') finish(true);
            else if (opts.mode === 'prompt') finish(null);
            else finish(false);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            if (opts.mode === 'prompt') finish(input ? input.value : '');
            else finish(true);
          }
        }
        document.addEventListener('keydown', onKey, true);
        okBtn.onclick = function () {
          if (opts.mode === 'prompt') finish(input ? input.value : '');
          else finish(true);
        };
        if (cancelBtn) {
          cancelBtn.onclick = function () {
            if (opts.mode === 'prompt') finish(null);
            else finish(false);
          };
        }
        // click backdrop = cancel (except pure alert)
        root.onclick = function (e) {
          if (e.target === root) {
            if (opts.mode === 'alert') finish(true);
            else if (opts.mode === 'prompt') finish(null);
            else finish(false);
          }
        };
      }
      if (_busy) _queue.push(job);
      else {
        _busy = true;
        job();
      }
    });
  }

  /**
   * @param {string} message
   * @param {{ title?: string, okLabel?: string, cancelLabel?: string, danger?: boolean }} [opts]
   * @returns {Promise<boolean>}
   */
  function confirm(message, opts) {
    opts = opts || {};
    return showBox({
      mode: 'confirm',
      title: opts.title || 'Подтверждение',
      message: message,
      okLabel: opts.okLabel || 'OK',
      cancelLabel: opts.cancelLabel || 'Отмена',
      danger: opts.danger
    });
  }

  /**
   * @param {string} message
   * @param {{ title?: string, okLabel?: string }} [opts]
   * @returns {Promise<void>}
   */
  function alert(message, opts) {
    opts = opts || {};
    return showBox({
      mode: 'alert',
      title: opts.title || 'Сообщение',
      message: message,
      okLabel: opts.okLabel || 'OK'
    }).then(function () {});
  }

  /**
   * @param {string} message
   * @param {string} [defaultValue]
   * @param {{ title?: string, okLabel?: string, cancelLabel?: string }} [opts]
   * @returns {Promise<string|null>} null if cancelled
   */
  function prompt(message, defaultValue, opts) {
    opts = opts || {};
    return showBox({
      mode: 'prompt',
      title: opts.title || 'Ввод',
      message: message,
      defaultValue: defaultValue != null ? defaultValue : '',
      okLabel: opts.okLabel || 'OK',
      cancelLabel: opts.cancelLabel || 'Отмена'
    });
  }

  // Hard block native system dialogs in game context (dev safety)
  function installNativeBlocks() {
    try {
      var w = root;
      if (!w || w.__psDialogBlocked) return;
      w.__psDialogBlocked = true;
      w.alert = function (msg) {
        console.warn('[GameDialog] blocked native alert:', msg);
        return alert(String(msg != null ? msg : ''));
      };
      w.confirm = function (msg) {
        console.warn('[GameDialog] blocked native confirm — use GameDialog.confirm (async):', msg);
        // Sync API cannot wait — return false and open async UI for visibility
        confirm(String(msg != null ? msg : ''), { title: 'Подтверждение' });
        return false;
      };
      w.prompt = function (msg, def) {
        console.warn('[GameDialog] blocked native prompt — use GameDialog.prompt (async):', msg);
        prompt(String(msg != null ? msg : ''), def != null ? String(def) : '');
        return null;
      };
    } catch (e) { /* ignore */ }
  }

  var api = {
    confirm: confirm,
    alert: alert,
    prompt: prompt,
    installNativeBlocks: installNativeBlocks
  };

  root.GameDialog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', installNativeBlocks);
    } else {
      installNativeBlocks();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
