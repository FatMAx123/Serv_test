// ============================================================
//  SERVER / EDITOR-OVERRIDES-WRITER.JS
//  Единый модуль генерации editor-overrides.json и client/js/editor-overrides-data.js
//  Устраняет дублирование между server.js и static-http.js (PLAN Раздел 6).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHARED = path.join(ROOT, 'shared');
const CLIENT = path.join(ROOT, 'client');
const OVERRIDES_JSON_PATH = path.join(SHARED, 'editor-overrides.json');
const CLIENT_SCRIPT_PATH = path.join(CLIENT, 'js', 'editor-overrides-data.js');

function generateClientScript(cleanData) {
  const safeJson = JSON.stringify(cleanData, null, 2).replace(/</g, '\\u003c');
  return `// ============================================================
//  CLIENT / JS / EDITOR-OVERRIDES-DATA.JS
//  Автоматически экспортированные данные из редактора сцены
//  Сохранено: ${new Date().toISOString()}
// ============================================================
(function () {
  'use strict';
  var diskData = ${safeJson};
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
`;
}

function writeEditorOverridesFiles(data) {
  if (!data || typeof data !== 'object') throw new Error('invalid overrides payload');
  const cleanData = Object.assign({}, data, {
    savedAt: data.savedAt || Date.now()
  });
  fs.writeFileSync(OVERRIDES_JSON_PATH, JSON.stringify(cleanData, null, 2), 'utf8');
  fs.writeFileSync(CLIENT_SCRIPT_PATH, generateClientScript(cleanData), 'utf8');
  return cleanData;
}

module.exports = {
  OVERRIDES_JSON_PATH,
  CLIENT_SCRIPT_PATH,
  generateClientScript,
  writeEditorOverridesFiles
};
