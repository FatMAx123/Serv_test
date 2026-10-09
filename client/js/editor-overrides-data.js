// ============================================================
//  CLIENT / JS / EDITOR-OVERRIDES-DATA.JS — статический загрузчик данных редактора сцены.
//  H7 (этап 4.4): сервер больше НЕ генерирует этот файл. Данные лежат в
//  data/editor-overrides.json (чистый JSON, без исполняемого кода) и загружаются fetch-ем.
//  boot.module.js ждёт window.__PS_EDITOR_OVERRIDES_READY перед world-metrics.
// ============================================================
(function () {
  'use strict';
  // Хват оружия — маленький ключ, только в editor.html.
  function mergeWeaponGrips(primary, secondary) {
    var out = {};
    function add(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (k) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') return;
        if (!src[k] || typeof src[k] !== 'object') return;
        out[k] = src[k];
      });
    }
    add(secondary);
    add(primary);
    return out;
  }

  function apply(json) {
    // PLAN 4.7: диск = авторитет. Не клонируем 850 КБ и не пишем мир в localStorage.
    var picked = (json && typeof json === "object" && !Array.isArray(json)) ? json : {};
    try {
      if (typeof localStorage !== 'undefined' && (window._forceEditorMode || window.isEditorStandalone)) {
        var rawG = localStorage.getItem('ps_weapon_grips');
        if (rawG) picked.weaponGrips = mergeWeaponGrips(picked.weaponGrips, JSON.parse(rawG));
      }
    } catch (eG) {}
    window.EDITOR_OVERRIDES_DATA = picked;
    window.EDITOR_OVERRIDES_REV = (picked.rev | 0);
    if (window.WorldMetrics && window.WorldMetrics.applyEditorOverrides) {
      window.WorldMetrics.applyEditorOverrides(window.EDITOR_OVERRIDES_DATA);
    }
    try {
      if (window.CharModel && typeof window.CharModel.applyWeaponGripOverridesBatch === 'function' &&
          picked.weaponGrips) {
        window.CharModel.applyWeaponGripOverridesBatch(picked.weaponGrips);
      }
    } catch (eCM) {}
    try {
      var gk = picked.weaponGrips ? Object.keys(picked.weaponGrips).length : 0;
      console.log('[editor-overrides] source=json rev=' + (picked.rev | 0) +
        ' customProps=' + ((picked.customProps && picked.customProps.length) || 0) +
        ' mobSpots=' + ((picked.mobSpots && picked.mobSpots.length) || 0) +
        ' weaponGrips=' + gk);
    } catch (e) {}
    return picked;
  }

  // URL относительно самого скрипта (js/ → ../data/), а не страницы
  var url = 'data/editor-overrides.json';
  try {
    var cs = document.currentScript && document.currentScript.src;
    if (cs) url = new URL('../data/editor-overrides.json', cs).href;
  } catch (eU) {}

  window.__PS_EDITOR_OVERRIDES_URL = url;
  window.__PS_EDITOR_OVERRIDES_READY = fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('editor-overrides.json: HTTP ' + r.status);
      return r.json();
    })
    .then(apply);
  // Не даём «Uncaught (in promise)», если boot ещё не подписался; ошибку обработает boot.
  window.__PS_EDITOR_OVERRIDES_READY.catch(function () {});
})();
