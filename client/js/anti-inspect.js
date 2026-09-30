// ============================================================
//  ANTI-INSPECT.JS — F12 / DevTools / просмотр исходника только для
//  модератора (accessLevel ≥ 50) и GM. Обычный игрок: горячие клавиши
//  режутся, открытая консоль → заглушка и отключение от мира.
//  Грузить ПЕРВЫМ скриптом в HTML, до boot.
// ============================================================
(function () {
  'use strict';
  var STAFF_LEVEL = 50;
  var isLocal = typeof location !== 'undefined' && (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.protocol === 'file:' ||
    location.port === '3000'
  );
  var allowed = isLocal;
  var punished = false;
  var overlay = null;

  function isStaffLevel(n) {
    return (n | 0) >= STAFF_LEVEL;
  }

  window.__psAllowInspect = function (on, accessLevel) {
    if (accessLevel != null) on = isStaffLevel(accessLevel) || !!on;
    allowed = !!on || isLocal;
    if (allowed) hideOverlay();
  };
  window.__psInspectAllowed = function () { return allowed; };

  function isHotkey(e) {
    var key = e.key || '';
    var code = e.code || '';
    var k = key.toUpperCase();
    if (key === 'F12' || code === 'F12' || e.keyCode === 123) return true;
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.shiftKey && (k === 'I' || k === 'J' || k === 'C' || k === 'K'
      || code === 'KeyI' || code === 'KeyJ' || code === 'KeyC' || code === 'KeyK')) return true;
    if (ctrl && (k === 'U' || code === 'KeyU')) return true;
    if (e.metaKey && e.altKey && (k === 'I' || k === 'J' || k === 'C' || code === 'KeyI' || code === 'KeyJ')) return true;
    return false;
  }

  function onKey(e) {
    if (allowed) return;
    if (!isHotkey(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return false;
  }

  function onContext(e) {
    if (allowed) return;
    // Allow in-game UI right-click (inventory, skills, hotbar, trade, dialogs)
    if (e.target && e.target.closest && e.target.closest(
      '#inventory-window, #skill-bar, #skills-window, .l2-skill-slot, .l2-inv-slot, ' +
      '#l2cm-root, .l2cm-slot, .l2-inv-window, #char-menu-window, #trade-window, ' +
      '#npc-dialog, #craft-window, #map-window, .modal, .l2-dialog, .l2-context-menu'
    )) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function dockedTools() {
    if (isLocal || allowed) return false;
    var tw = Math.abs((window.outerWidth || 0) - (window.innerWidth || 0));
    var th = Math.abs((window.outerHeight || 0) - (window.innerHeight || 0));
    return tw > 180 || th > 180;
  }

  function showOverlay() {
    // Никогда не показываем блокирующее окно поверх меню или игры
    return;
  }

  function hideOverlay() {
    if (overlay && overlay.parentNode) {
      try { overlay.parentNode.removeChild(overlay); } catch (_) {}
      overlay = null;
    }
  }

  function punish() {
    if (allowed || punished) return;
    punished = true;
    showOverlay();
    try {
      if (window.GameAudio && typeof window.GameAudio.setMuted === 'function') window.GameAudio.setMuted(true);
    } catch (_) {}
    try {
      if (window.game && window.game.net && typeof window.game.net.disconnect === 'function') {
        window.game.net.disconnect();
      }
    } catch (_) {}
    try {
      if (window.game && typeof window.game.goToMenuPage === 'function') {
        setTimeout(function () { try { window.game.goToMenuPage(); } catch (e2) {} }, 1200);
      }
    } catch (_) {}
  }

  function tick() {
    if (allowed) { punished = false; hideOverlay(); return; }
    if (dockedTools()) punish();
  }

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  window.addEventListener('keypress', onKey, true);
  window.addEventListener('contextmenu', onContext, true);
  window.addEventListener('dragstart', function (e) {
    if (!allowed) { e.preventDefault(); }
  }, true);
  setInterval(tick, 900);
  if (document.readyState === 'complete' || document.readyState === 'interactive') tick();
  else document.addEventListener('DOMContentLoaded', tick);
})();
