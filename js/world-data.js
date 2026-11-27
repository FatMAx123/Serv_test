// ============================================================
//  CLIENT / JS / WORLD-DATA.JS — загрузчик данных мира релизного клиента.
//  data/world.json — запечённый мир (scripts/bake-world.js): всё, что создано в
//  редакторе на машине разработчика, уже стало частью мира. Редактора, его истории
//  и localStorage здесь нет. boot.module.js ждёт window.__PS_WORLD_READY перед
//  world-metrics.
// ============================================================
(function () {
  'use strict';

  function apply(json) {
    var data = (json && typeof json === 'object' && !Array.isArray(json)) ? json : {};
    window.WORLD_DATA = data;
    if (window.WorldMetrics && window.WorldMetrics.applyWorldData) {
      window.WorldMetrics.applyWorldData(data);
    }
    try {
      if (window.CharModel && typeof window.CharModel.applyWeaponGripOverridesBatch === 'function' && data.weaponGrips) {
        window.CharModel.applyWeaponGripOverridesBatch(data.weaponGrips);
      }
    } catch (eCM) { /* CharModel догрузит хваты в boot */ }
    try {
      console.log('[world] rev=' + (data.rev | 0) +
        ' props=' + ((data.customProps && data.customProps.length) || 0) +
        ' zones=' + ((data.huntZones && data.huntZones.length) || 0));
    } catch (e) { /* ignore */ }
    return data;
  }

  // URL относительно самого скрипта (js/ → ../data/), а не страницы
  var url = 'data/world.json';
  try {
    var cs = document.currentScript && document.currentScript.src;
    if (cs) url = new URL('../data/world.json', cs).href;
  } catch (eU) { /* ignore */ }

  window.__PS_WORLD_URL = url;
  window.__PS_WORLD_READY = fetch(url, { cache: 'no-cache', credentials: 'same-origin' })
    .then(function (r) {
      if (!r.ok) throw new Error('world.json: HTTP ' + r.status);
      return r.json();
    })
    .then(apply);
  // Без «Uncaught (in promise)»: ошибку покажет boot
  window.__PS_WORLD_READY.catch(function () {});
})();
