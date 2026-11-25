// ============================================================
//  BOOT.MODULE.JS — загрузчик r185. Ставит window.THREE/THREE_SKY,
//  затем цепочкой грузит все скрипты игры в правильном порядке.
// ============================================================
import * as THREE from 'three';
import { Sky } from './libs/Sky.js?v=r185';
import { Water } from './libs/Water.js?v=r185';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as CharModel from './char-model.js?v=world-1';
window.THREE = THREE;
window.THREE_SKY = Sky;
window.THREE_WATER = Water;
window.FBXLoader = FBXLoader;
window.GLTFLoader = GLTFLoader;
window.DRACOLoader = DRACOLoader;
window.CharModel = CharModel;

// Re-apply grips after editor-overrides (disk) may load later in SCRIPTS chain
function rehydrateWeaponGripsFromOverrides() {
  try {
    if (CharModel && typeof CharModel.rehydrateWeaponGrips === 'function') {
      CharModel.rehydrateWeaponGrips();
    }
    if (window.WORLD_DATA && window.WORLD_DATA.weaponGrips &&
      typeof CharModel.applyWeaponGripOverridesBatch === 'function') {
      CharModel.applyWeaponGripOverridesBatch(window.WORLD_DATA.weaponGrips);
    }
  } catch (e) { /* ignore */ }
}

// Порядок = зависимости. Данные мира ДО world-metrics, чтобы WorldMetrics сразу видел
// window.WORLD_DATA. Релиз: js/world-data.js → data/world.json (запечённый мир, без
// редактора). Машина разработчика / GM-сборка: рабочий файл редактора (живые правки).
// ?v=… обязателен у КАЖДОГО файла: сервер отдаёт статику с
// `Cache-Control: immutable, max-age=1 год`, и файл без версии после деплоя
// не обновится у игрока никогда (было у 7 файлов).
const SCRIPTS = [
  'js/server-hosts.js?v=tls-2', // единственный адрес игрового сервера (window.PS_SERVER)
  'js/i18n.js?v=copper-1',
  'js/config.js?v=fps-6-tls',
  // PLAN 4.7: стартуем декодер мешей в фоновом воркере на vCPU сразу на старте
  'js/mesh-bin.js?v=e47-2',
  'js/mesh-bin-loader.js?v=e47-2',
  (window.__PS_RELEASE_BUILD === true ? 'js/world-data.js?v=opt-camp-7' : 'js/editor-overrides-data.js?v=opt-camp-7'),
  '../shared/mob-db.js?v=opt-camp-3',
  '../shared/world-metrics.js?v=opt-camp-7',
  '../shared/world-time.js?v=l2-time-1',
  '../shared/world-lore.js?v=map-1',    // лора по карте map_world.webp
  '../shared/l2-combat.js?v=l2c-1',
  '../shared/grade-rules.js?v=craft-1',
  '../shared/buff-rules.js?v=e2-buff',
  '../shared/weight-rules.js?v=e2-weight',
  '../shared/enchant-rules.js?v=l2c-1',
  '../shared/death-rules.js?v=craft-1',
  '../shared/item-db.js?v=repair-1',
  '../shared/class-system.js?v=craft-1',
  '../shared/l2-exp-table.js?v=l2c-1',
  '../shared/l2-skill-meta.js?v=craft-1',
  '../shared/skill-db.js?v=craft-1',
  '../shared/cosmetics-db.js?v=chars-2',
  '../shared/event-rules.js?v=e2-event',
  '../shared/game-rules.js?v=opt-camp-3',
  'js/map-data.js?v=editor-zones-1',
  'js/render-setup.js?v=fog-soft-1',
  'js/input.js?v=editor-keys-1',
  'js/combat.js?v=audit-g1',
  'js/level-system.js?v=l2c-1',
  'js/skills.js?v=craft-1',
  'js/skill-vfx.js?v=flash-shaders-v6',
  'js/skills-ui.js?v=editor-keys-1',
  'js/game-dialog.js?v=no-native-1',
  'js/inventory.js?v=craft-1',
  '../shared/loot-rules.js?v=audit-g2',
  // npc-services после loot-rules: цены магазинов берутся из LOOT_ITEMS
  '../shared/npc-services.js?v=repeat-1',
  // trade-rules после npc-services: слоты и метаданные предметов берутся оттуда
  '../shared/trade-rules.js?v=craft-2',
  '../shared/duel-rules.js?v=e2-duel',
  '../shared/clan-rules.js?v=e2-clan',
  // quest-db до quest.js: клиент строит зеркало по shared-данным
  '../shared/quest-db.js?v=repair-1',
  'js/l2-icon-assets.js?v=l2c-1',
  'js/drop-models.js?v=l2c-1',
  'js/inventory-ui.js?v=l2c-1',
  'js/enchant-ui.js?v=l2c-1', // окно заточки (L2): усилитель → выбор предмета → подтверждение
  // craft после inventory: читает ITEM_DATABASE и серверный инвентарь
  'js/craft.js?v=craft-3',
  'js/loot.js?v=opt-camp-1',
  'js/loot-ui.js?v=e0-1',
  'js/npc.js?v=opt-camp-2',
  'js/npc-ui.js?v=npcw-1',
  'js/quest.js?v=npcw-1',
  'js/spawn.js?v=raid-e',
  'js/l2-visibility.js?v=zero-lag-15',
  '../shared/net-pack-binary.js?v=bin-1',
  'js/net-ws.js?v=opt-camp-4',
  'js/player.js?v=opt-camp-4',
  'js/ui.js?v=atk-1',
  'js/char-menu.js?v=tgt-sync-1',
  'js/private-store.js?v=e2-store',
  // trade-ui до main.js: main создаёт game.tradeUI
  'js/trade-ui.js?v=craft-2',
  'js/clan-ui.js?v=e2-clan',
  'js/level-ui.js?v=editor-keys-1',
  'js/map-renderer.js?v=e1-npc',
  'js/dungeon.js?v=jewelry-1',
  'js/dungeon-ui.js?v=e1-gate',
  // terrain-height до terrain.js: индекс высот меша вместо 5 лучей в standY
  'js/terrain-height.js?v=e4-grid',
  'js/terrain.js?v=splat-raw-1',
  'js/volcano.js?v=world-1',
  'js/mountains.js?v=world-1',
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
  'js/props-library-data.js?v=opt-camp-7',
  'js/props-collision.js?v=opt-terr-1',
  'js/wind-system.js?v=world-1',
  'js/prop-textures-data.js?v=opt-camp-7',
  'js/world-content.js?v=opt-camp-3',
  'js/audio.js?v=webaudio-bgm-1',
  'js/touch-controls.js?v=walkpick-1',
  'js/main.js?v=opt-camp-3'
];

// PLAN 4.6: инструмент редактора не нужен игроку. Грузится только
// editor.html (_forceEditorMode) или по welcome.gm через __ensureSceneEditor.
// Релизный клиент (Render / Яндекс Игры): редактор и шоурум существуют только в локальной папке
// проекта и в локальной GM-сборке. build-client.js ставит __PS_RELEASE_BUILD — тогда инструментов
// редактора нет вовсе: ни загрузки скриптов, ни запросов /api/editor/*, F2 ничего не делает.
const PS_RELEASE_BUILD = typeof window !== 'undefined' && window.__PS_RELEASE_BUILD === true;
const EDITOR_SCRIPTS = PS_RELEASE_BUILD ? [] : [
  'js/editor-engine-layout.js?v=bake-2',
  'js/editor.js?v=opt-camp-1'
];
// Стресс-тест толпы (панель «Тесты» F9) — инструмент разработчика: только вне релиза
if (!PS_RELEASE_BUILD) {
  var _netIdx = SCRIPTS.findIndex(function (s) { return s.indexOf('js/net-ws.js') >= 0; });
  SCRIPTS.splice(_netIdx >= 0 ? _netIdx + 1 : SCRIPTS.length, 0, 'js/crowd-stress-test.js?v=zero-lag-11');
}
if (!PS_RELEASE_BUILD && typeof window !== 'undefined' && (window._forceEditorMode || window.isEditorStandalone)) {
  var _mainIdx = SCRIPTS.findIndex(function (s) { return s.indexOf('js/main.js') >= 0; });
  if (_mainIdx >= 0) {
    for (var _e = 0; _e < EDITOR_SCRIPTS.length; _e++) SCRIPTS.splice(_mainIdx + _e, 0, EDITOR_SCRIPTS[_e]);
  }
}

function isWorldDataScript(src) {
  return src.indexOf('js/world-data.js') >= 0 || src.indexOf('editor-overrides-data') >= 0;
}

function load(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false; // Скачивание параллельно в фоне, выполнение строго в порядке вставки DOM
    s.onload = res;
    s.onerror = () => {
      if (isOptionalEditorTool(src)) {
        console.warn('[boot] Модуль редактора не найден (исключён в релизном билде):', src);
        res();
      } else {
        rej(new Error('load fail: ' + src));
      }
    };
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
  if (PS_RELEASE_BUILD) return null; // в релизе редактора нет
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
        // SEC: ключ в заголовке, не в URL (?k= попадал в логи, Referer и историю).
        // Сервер ставит HttpOnly-cookie, по которой дальше грузятся файлы редактора.
        await fetch('/api/editor/session', {
          method: 'POST',
          headers: { 'X-Editor-Key': window.__PS_EDITOR_KEY },
          credentials: 'same-origin',
          cache: 'no-store'
        });
      } catch (_) {}
      if (!document.querySelector('link[href*="editor-engine.css"]')) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'css/editor-engine.css?v=bake-1';
        document.head.appendChild(link);
      }
      if (!window.SceneEditor) {
        for (var i = 0; i < EDITOR_SCRIPTS.length; i++) {
          await load(EDITOR_SCRIPTS[i]);
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
  const msgEl = document.getElementById('loading-msg');

  for (let i = 0; i < SCRIPTS.length; i++) {
    try {
      // До начала загрузки terrain-height и terrain.js дожидаемся фонового воркера мешей
      if (SCRIPTS[i].indexOf('terrain-height') >= 0 && window.__PS_MESH_BINS__) {
        if (msgEl) msgEl.textContent = 'Ландшафт…';
        try { await window.__PS_MESH_BINS__; }
        catch (meshErr) {
          if (typeof window.__psFatal === 'function') window.__psFatal('mesh-bin', meshErr);
          else console.error('[boot] mesh-bin', meshErr);
          return;
        }
      }

      await load(SCRIPTS[i]);

      // H7: данные мира — JSON, загрузчик отдаёт промис; ждём до world-metrics
      if (isWorldDataScript(SCRIPTS[i]) && window.__PS_WORLD_READY) {
        await window.__PS_WORLD_READY;
      }
    }
    catch (e) {
      console.error(e);
      if (pb) pb.style.background = '#ff4444';
      const detail = 'не загрузился ' + (isWorldDataScript(SCRIPTS[i]) ? 'мир (data/world.json)' : SCRIPTS[i].split('?')[0]);
      if (typeof window.__psFatal === 'function') window.__psFatal('boot', new Error(detail));
      else {
        if (msgEl) { msgEl.textContent = 'Ошибка загрузки: ' + detail; msgEl.style.color = '#ff6b6b'; }
      }
      return;
    }
    // After overrides + world-metrics: re-apply weapon grips from disk/LS
    if (SCRIPTS[i].indexOf('world-metrics') >= 0 || isWorldDataScript(SCRIPTS[i])) {
      rehydrateWeaponGripsFromOverrides();
    }
    if (pb) pb.style.width = Math.round((i + 1) / SCRIPTS.length * 100) + '%';
  }
  rehydrateWeaponGripsFromOverrides();
  console.log('[boot] r185 +', SCRIPTS.length, 'скриптов загружены');
})();