// ============================================================
//  CLIENT / JS / EDITOR-OVERRIDES-DATA.JS
//  Автоматически экспортированные данные из редактора сцены
//  Сохранено: 2026-10-08T21:34:20.086Z
// ============================================================
(function () {
  'use strict';
  var diskData = {
  "objects": [],
  "savedAt": 1791495260085
};
  // PLAN 4.7: диск = авторитет. Не клонируем 850 КБ и не пишем мир в localStorage.
  // Хват оружия — маленький ключ, только в editor.html.
  function mergeWeaponGrips(primary, secondary) {
    var out = {};
    function add(src) {
      if (!src || typeof src !== 'object') return;
      Object.keys(src).forEach(function (k) {
        if (!src[k] || typeof src[k] !== 'object') return;
        out[k] = src[k];
      });
    }
    add(secondary);
    add(primary);
    return out;
  }
  var picked = diskData || {};
  try {
    if (typeof localStorage !== 'undefined' && (window._forceEditorMode || window.isEditorStandalone)) {
      var rawG = localStorage.getItem('ps_weapon_grips');
      if (rawG) picked.weaponGrips = mergeWeaponGrips(picked.weaponGrips, JSON.parse(rawG));
    }
  } catch (eG) {}
  window.EDITOR_OVERRIDES_DATA = picked;
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
    console.log('[editor-overrides] source=disk customProps=' + ((picked.customProps && picked.customProps.length) || 0) +
      ' mobSpots=' + ((picked.mobSpots && picked.mobSpots.length) || 0) +
      ' weaponGrips=' + gk);
  } catch (e) {}
})();
