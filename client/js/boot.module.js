// ============================================================
//  BOOT.MODULE.JS — загрузчик r185. Ставит window.THREE/THREE_SKY,
//  затем цепочкой грузит все скрипты игры в правильном порядке.
// ============================================================
import * as THREE from 'three';
import { Sky } from './libs/Sky.js';
import { Water } from './libs/Water.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as CharModel from './char-model.js?v=zero-lag-12';
window.THREE = THREE;
window.THREE_SKY = Sky;
window.THREE_WATER = Water;
window.FBXLoader = FBXLoader;
window.CharModel = CharModel;

// Re-apply grips after editor-overrides (disk) may load later in SCRIPTS chain
function rehydrateWeaponGripsFromOverrides() {
  try {
    if (CharModel && typeof CharModel.rehydrateWeaponGrips === 'function') {
      CharModel.rehydrateWeaponGrips();
    }
    if (window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.weaponGrips &&
      typeof CharModel.applyWeaponGripOverridesBatch === 'function') {
      CharModel.applyWeaponGripOverridesBatch(window.EDITOR_OVERRIDES_DATA.weaponGrips);
    }
  } catch (e) { /* ignore */ }
}

// Порядок = зависимости. editor-overrides-data ДО world-metrics,
// чтобы WorldMetrics.applyEditorOverrides сразу видел window.EDITOR_OVERRIDES_DATA.
// ?v=… обязателен у КАЖДОГО файла: сервер отдаёт статику с
// `Cache-Control: immutable, max-age=1 год`, и файл без версии после деплоя
// не обновится у игрока никогда (было у 7 файлов).
const SCRIPTS = [
  'js/i18n.js?v=e2-clan',
  'js/config.js?v=fps-4',
  'js/editor-overrides-data.js?v=nocity-1',
  '../shared/mob-db.js?v=raid-c',
  '../shared/world-metrics.js?v=ld-1',
  '../shared/world-time.js?v=l2-time-1',
  '../shared/world-lore.js?v=map-1',    // лора по карте map_world.webp
  '../shared/l2-combat.js?v=e0-blockcap',
  '../shared/grade-rules.js?v=e2-grade',
  '../shared/buff-rules.js?v=e2-buff',
  '../shared/weight-rules.js?v=e2-weight',
  '../shared/enchant-rules.js?v=e2-crystal',
  '../shared/death-rules.js?v=e2-death',
  '../shared/item-db.js?v=e2-crystal',
  '../shared/class-system.js?v=c1-slots-1',
  '../shared/l2-exp-table.js?v=party-bonus-1',
  '../shared/l2-skill-meta.js?v=c1-1',
  '../shared/skill-db.js?v=e2-grade',
  '../shared/cosmetics-db.js?v=e2-clan',
  '../shared/event-rules.js?v=e2-event',
  '../shared/game-rules.js?v=e2-event',
  'js/map-data.js?v=editor-zones-1',
  'js/render-setup.js?v=fog-soft-1',
  'js/input.js?v=editor-keys-1',
  'js/combat.js?v=c1-2',
  'js/level-system.js?v=lvlup-vfx-1',
  'js/skills.js?v=ws-cast-a',
  'js/skill-vfx.js?v=flash-shaders-v6',
  'js/skills-ui.js?v=editor-keys-1',
  'js/game-dialog.js?v=no-native-1',
  'js/inventory.js?v=e1-enchant',
  '../shared/loot-rules.js?v=e2-crystal',
  // npc-services после loot-rules: цены магазинов берутся из LOOT_ITEMS
  '../shared/npc-services.js?v=e2-wh2',
  // trade-rules после npc-services: слоты и метаданные предметов берутся оттуда
  '../shared/trade-rules.js?v=e2-store',
  '../shared/duel-rules.js?v=e2-duel',
  '../shared/clan-rules.js?v=e2-clan',
  // quest-db до quest.js: клиент строит зеркало по shared-данным
  '../shared/quest-db.js?v=e1-quest',
  'js/l2-icon-assets.js?v=icons-full-2',
  'js/drop-models.js?v=drop3d-2',
  'js/inventory-ui.js?v=e2-crystal',
  // craft после inventory: читает ITEM_DATABASE и серверный инвентарь
  'js/craft.js?v=e1-craft',
  'js/loot.js?v=party-loot-4',
  'js/loot-ui.js?v=e0-1',
  'js/npc.js?v=e3-gilbert-real',
  'js/npc-ui.js?v=e2-clan',
  'js/quest.js?v=e1-quest',
  'js/spawn.js?v=raid-e',
  'js/l2-visibility.js?v=zero-lag-15',
  '../shared/net-pack-binary.js?v=bin-1',
  'js/net-ws.js?v=zero-lag-17',
  'js/crowd-stress-test.js?v=zero-lag-11',
  'js/player.js?v=tgt-sync-1',
  'js/ui.js?v=zero-lag-11',
  'js/char-menu.js?v=tgt-sync-1',
  'js/private-store.js?v=e2-store',
  // trade-ui до main.js: main создаёт game.tradeUI
  'js/trade-ui.js?v=e2-store',
  'js/clan-ui.js?v=e2-clan',
  'js/level-ui.js?v=editor-keys-1',
  'js/map-renderer.js?v=e1-npc',
  'js/dungeon.js?v=e1-gate',
  'js/dungeon-ui.js?v=e1-gate',
  // PLAN 4.7: бинарный меш + worker вместо 5.5 МБ JSON-чисел в JS
  'js/mesh-bin.js?v=e47-2',
  'js/mesh-bin-loader.js?v=e47-2',
  // terrain-height до terrain.js: индекс высот меша вместо 5 лучей в standY
  'js/terrain-height.js?v=e4-grid',
  'js/terrain.js?v=e4-standy-2',
  'js/volcano.js?v=lod-fix-4',
  'js/mountains.js?v=lod-fix-6',
  'js/water-data.js?v=e0-1',
  'js/water.js?v=bind-props-1',
  'js/walls-data.js?v=e0-1',
  'js/walls.js?v=delete-all-models-23',
  'js/village-fort.js?v=smooth-1',
  'js/village-ground.js?v=cull-fix-1',
  'js/daynight.js?v=l2-canon-1',
  'js/camera3d.js?v=brush-fix-2',
  'js/bsp-csg.js?v=bsp-3',
  'js/bsp-brushes.js?v=zero-lag-11',
  'js/props-library-data.js?v=e4-index',
  'js/props-collision.js?v=e4-hash',
  'js/wind-system.js?v=wind-4',
  'js/prop-textures-data.js?v=dict-2',
  'js/world-content.js?v=foliage-sel-5',
  'js/audio.js?v=webaudio-bgm-1',
  'js/touch-controls.js?v=tgt-sync-1',
  'js/main.js?v=zero-lag-11'
];

// PLAN 4.6: инструмент редактора не нужен игроку. Грузится только
// editor.html (_forceEditorMode) или по welcome.gm через __ensureSceneEditor.
const EDITOR_SCRIPTS = [
  'js/editor-engine-layout.js?v=ue-godot-10',
  'js/editor.js?v=foliage-sel-7'
];
if (typeof window !== 'undefined' && (window._forceEditorMode || window.isEditorStandalone)) {
  var _mainIdx = SCRIPTS.findIndex(function (s) { return s.indexOf('js/main.js') >= 0; });
  if (_mainIdx >= 0) {
    for (var _e = 0; _e < EDITOR_SCRIPTS.length; _e++) SCRIPTS.splice(_mainIdx + _e, 0, EDITOR_SCRIPTS[_e]);
  }
}

function load(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('load fail: ' + src));
    document.head.appendChild(s);
  });
}

function isOptionalEditorTool(src) {
  var p = String(src || '').split('?')[0];
  return /\/editor\.js$/.test(p) || /\/editor-engine-layout\.js$/.test(p);
}

window.__PS_EDITOR_SCRIPTS = EDITOR_SCRIPTS;
window.__PS_loadScript = load;
window.__ensureSceneEditor = async function (game) {
  game = game || window.game;
  if (!game) return null;
  if (game.editor) return game.editor;
  // Только серверный GM + одноразовый ключ из welcome. PS_GM в консоли не поможет:
  // без cookie файлы редактора отвечают 404.
  if (!window.PS_GM || !window.__PS_EDITOR_KEY) return null;
  if (window.__psEditorLoading) return window.__psEditorLoading;
  window.__psEditorLoading = (async function () {
    try {
      try {
        await fetch('/api/editor/session?k=' + encodeURIComponent(window.__PS_EDITOR_KEY), {
          credentials: 'same-origin',
          cache: 'no-store'
        });
      } catch (_) {}
      if (!document.querySelector('link[href*="editor-engine.css"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        var cUrl = 'css/editor-engine.css?v=ue-godot-10';
        if (window.__PS_EDITOR_KEY) cUrl += '&k=' + encodeURIComponent(window.__PS_EDITOR_KEY);
        link.href = cUrl;
        document.head.appendChild(link);
      }
      if (!window.SceneEditor) {
        for (var i = 0; i < EDITOR_SCRIPTS.length; i++) {
          var sUrl = EDITOR_SCRIPTS[i];
          if (window.__PS_EDITOR_KEY) {
            sUrl += (sUrl.indexOf('?') >= 0 ? '&' : '?') + 'k=' + encodeURIComponent(window.__PS_EDITOR_KEY);
          }
          await load(sUrl);
        }
      }
      if (typeof window.setEditorAllowed === 'function') window.setEditorAllowed(true);
      if (!game.editor && window.SceneEditor) {
        game.editor = new window.SceneEditor(game);
        if (game.editor.applySavedTransformsToGame) game.editor.applySavedTransformsToGame();
      }
      return game.editor || null;
    } catch (e) {
      console.warn('[boot] editor denied', e && e.message);
      return null;
    } finally {
      window.__psEditorLoading = null;
    }
  })();
  return window.__psEditorLoading;
};

(async () => {
  const pb = document.getElementById('loading-progress');
  for (let i = 0; i < SCRIPTS.length; i++) {
    try { await load(SCRIPTS[i]); }
    catch (e) {
      if (isOptionalEditorTool(SCRIPTS[i])) {
        console.warn('[boot] Модуль редактора не найден (исключён в релизном билде):', SCRIPTS[i]);
        continue;
      }
      console.error(e);
      if (pb) pb.style.background = '#ff4444';
      const detail = 'не загрузился ' + SCRIPTS[i].split('?')[0];
      if (typeof window.__psFatal === 'function') window.__psFatal('boot', new Error(detail));
      else {
        const msg = document.getElementById('loading-msg');
        if (msg) { msg.textContent = 'Ошибка загрузки: ' + detail; msg.style.color = '#ff6b6b'; }
      }
      return;
    }
    // After overrides + world-metrics: re-apply weapon grips from disk/LS
    if (SCRIPTS[i].indexOf('world-metrics') >= 0 || SCRIPTS[i].indexOf('editor-overrides-data') >= 0) {
      rehydrateWeaponGripsFromOverrides();
    }
    if (SCRIPTS[i].indexOf('mesh-bin-loader') >= 0 && window.__PS_MESH_BINS__) {
      const msgEl = document.getElementById('loading-msg');
      if (msgEl) msgEl.textContent = 'Ландшафт…';
      try { await window.__PS_MESH_BINS__; }
      catch (meshErr) {
        if (typeof window.__psFatal === 'function') window.__psFatal('mesh-bin', meshErr);
        else console.error('[boot] mesh-bin', meshErr);
        return;
      }
    }
    if (pb) pb.style.width = Math.round((i + 1) / SCRIPTS.length * 100) + '%';
  }
  rehydrateWeaponGripsFromOverrides();
  console.log('[boot] r185 +', SCRIPTS.length, 'скриптов загружены');
})();