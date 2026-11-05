// ============================================================
//  L2-VISIBILITY.JS — 3-Tier Visibility & Culling Engine
//
//  Tier 1: Frustum Culling (Three.js frustum + CPU animation/nameplate/mesh skip)
//  Tier 2: Client Distance Rendering (l2.ini ClippingRange: ActorsMax/Min, Foliage, Props, Buildings, Loot, Nameplate)
//  Tier 3: Priority Governor & Caps (Target > Party > PvP/Boss > Distance / Actor & Props Cap)
//
//  Governs EVERYTHING standing on terrain:
//  • Server Mobs & Remote Players (net.remote)
//  • Town / Village NPCs (npcManager.npcs)
//  • Static World Props & Buildings (editor.customPropMeshes)
//  • Foliage & Trees (editor._foliageInstancer)
//  • Ground Loot & Dropped Items (lootManager.groundItems)
//
//  NOTE: Terrain, Water, Mountains, Volcano, Sky/Dome are core streamed environment and NEVER culled here!
//
//  Includes 3D In-Game Visual Range Rings + Floating L2 Inspector (F4 / /vis)
// ============================================================
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.L2VisibilityManager = api;
    root.L2Vis = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  if (typeof window !== 'undefined' && typeof window.isSceneEditorActive !== 'function') {
    window.isSceneEditorActive = function () {
      try {
        if (window._forceEditorMode) return true;
        if (window.game && window.game.editor && window.game.editor.enabled) return true;
        if (window.editor && window.editor.enabled) return true;
        return false;
      } catch (e) { return false; }
    };
  }

  var THREE = (typeof window !== 'undefined' && window.THREE) ? window.THREE : null;

  // ---- Конфигурация по умолчанию (канон L2) ----
  var DEFAULT_CONFIG = {
    // 1. ClippingRange (l2.ini)
    clippingRange: {
      terrain: 2500.0,      // Дальность ландшафта (стримится отдельно, не трогаем)
      buildingsMax: 850.0,  // Дальность крупных зданий, замков, монументов и крепостей
      propsMax: 550.0,      // Дальность средних построек, руин, стен, заборов
      doodadsMax: 200.0,    // Дальность мелких декораций (бочки, ящики, фонари, наковальни)
      actorsMax: 180.0,     // PawnMax: предельная дальность отрисовки 3D акторов (мобов/игроков)
      actorsMin: 10.0,      // PawnMin: радиус полного 60 FPS скелетного качества (Near LOD: 10м)
      foliage: 70.0,        // Дальность отрисовки деревьев и кустов (срезает невидимый дальний лес за домами)
      loot: 100.0,          // Дальность предметов дропа на земле
      nameplate: 50.0,      // Дистанция проявления имён, титулов, полосок HP и названий лута
      nameplateFade: 10.0   // Плавный фейд надписи на границе видимости
    },
    // 2. Лимиты плотности толпы и объектов (Unreal Engine 2 Governor)
    massPvp: {
      enabled: true,
      characterLimit: 140,  // Высокий лимит: до 140 персонажей в кадре без отсечений и мерцания
      propsLimit: 350       // Максимум активных пропсов в кадре
    },
    // 3. Frustum Culling (Точное отсечение вне поля зрения камеры)
    frustum: {
      enabled: true,                // Включение/выключение отсечения камерой
      margin: 6.0,                  // Запас сферы отсечения (6м) — устраняет мигание на границе экрана при беге
      nearImmunityRadius: 28.0,     // 360° Сфера присутствия: 28м вокруг игрока (полный охват ближней толпы без исчезновений)
      buildingsNearImmunityRadius: 80.0, // 360° Сфера для зданий вблизи (80м)
      skipOffscreenAnimation: true, // Пропуск mixer.update() вне пирамиды видимости
      skipOffscreenNameplates: true // Пропуск расчёта шильдиков вне пирамиды видимости
    },
    // 4. Визуальная отладка (Debug Rings & Inspector)
    debug: {
      ringsVisible: false,
      inspectorVisible: false,
      frustumRadar: true
    }
  };

  // Пресеты настроек графики / производительности
  var PRESETS = {
    low: {
      id: 'low',
      name: 'Низкие (Масс-PvP / Осады)',
      desc: 'Максимальный FPS на осадах. Actor Cap 80, тени выкл, 5x5 террейн.',
      clippingRange: {
        actorsMax: 100.0, actorsMin: 8.0, nameplate: 35.0, nameplateFade: 6.0,
        foliage: 100.0, propsMax: 350.0, buildingsMax: 550.0, doodadsMax: 120.0, loot: 60.0
      },
      massPvp: { enabled: true, characterLimit: 80, propsLimit: 200 },
      shadowQuality: 'off',
      streamRadius: 2
    },
    medium: {
      id: 'medium',
      name: 'Средние (Сбалансированные)',
      desc: 'Оптимальный баланс для прокачки в группе. Actor Cap 140, тени 45м, 5x5 террейн.',
      clippingRange: {
        actorsMax: 140.0, actorsMin: 10.0, nameplate: 40.0, nameplateFade: 8.0,
        foliage: 130.0, propsMax: 450.0, buildingsMax: 700.0, doodadsMax: 160.0, loot: 80.0
      },
      massPvp: { enabled: true, characterLimit: 140, propsLimit: 250 },
      shadowQuality: 'low',
      streamRadius: 2
    },
    high: {
      id: 'high',
      name: 'Высокие (Канон)',
      desc: 'Каноничные классические настройки. Actor Cap 200, дальность 180м, тени 140м, 5x5 террейн.',
      clippingRange: {
        actorsMax: 180.0, actorsMin: 10.0, nameplate: 50.0, nameplateFade: 10.0,
        foliage: 125.0, propsMax: 550.0, buildingsMax: 850.0, doodadsMax: 200.0, loot: 100.0
      },
      massPvp: { enabled: true, characterLimit: 200, propsLimit: 350 },
      shadowQuality: 'high',
      streamRadius: 2
    },
    ultra: {
      id: 'ultra',
      name: 'Ультра (Максимальный обзор)',
      desc: 'Без лимита толпы, предельная видимость 250м, тени 180м, 7x7 террейн.',
      clippingRange: {
        actorsMax: 250.0, actorsMin: 16.0, nameplate: 60.0, nameplateFade: 12.0,
        foliage: 220.0, propsMax: 750.0, buildingsMax: 1200.0, doodadsMax: 300.0, loot: 140.0
      },
      massPvp: { enabled: false, characterLimit: 300, propsLimit: 500 },
      shadowQuality: 'ultra',
      streamRadius: 3
    }
  };

  var STORAGE_KEY = 'ps_l2_visibility_settings';

  class L2VisibilityEngine {
    constructor() {
      this.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      this._loadSavedSettings();

      this.frustum = null;
      this._projScreenMatrix = null;
      this._tempSphere = null;
      this._tempVec3 = null;
      this._lastCameraFrame = -1;

      // 3D Visual Debug Rings
      this._debugRingsGroup = null;
      this._mockTestEntities = [];

      // Inspector UI
      this._inspectorEl = null;

      // Живая статистика для HUD / F3
      this.stats = {
        totalKnown: 0,
        visibleCount: 0,
        frustumCulled: 0,
        distanceCulled: 0,
        limitCulled: 0,
        namesVisibleCount: 0,
        namesCulledCount: 0,
        nearLodCount: 0,
        farLodCount: 0,
        // Детализация по категориям
        actorsCount: 0,
        actorsVisible: 0,
        actorsFrustum: 0,
        actorsDist: 0,
        actorsCap: 0,
        propsCount: 0,
        propsVisible: 0,
        propsFrustum: 0,
        propsDist: 0,
        foliageCount: 0,
        foliageVisible: 0,
        foliageFrustum: 0,
        foliageDist: 0,
        lootCount: 0,
        lootVisible: 0,
        lootCulled: 0,
        mobsCount: 0,
        playersCount: 0,
        npcCount: 0,
        frameMs: 0
      };

      this._ensureThreeObjects();
    }

    _ensureThreeObjects() {
      if (!THREE && typeof window !== 'undefined' && window.THREE) {
        THREE = window.THREE;
      }
      if (THREE && !this.frustum) {
        this.frustum = new THREE.Frustum();
        this._projScreenMatrix = new THREE.Matrix4();
        this._tempSphere = new THREE.Sphere();
        this._tempVec3 = new THREE.Vector3();
      }
    }

    _loadSavedSettings() {
      try {
        if (typeof localStorage === 'undefined') return;
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.clippingRange && typeof saved.clippingRange === 'object') {
            Object.assign(this.config.clippingRange, saved.clippingRange);
          }
          if (saved.massPvp && typeof saved.massPvp === 'object') {
            Object.assign(this.config.massPvp, saved.massPvp);
          }
          if (saved.frustum && typeof saved.frustum === 'object') {
            Object.assign(this.config.frustum, saved.frustum);
          }
          if (saved.debug && typeof saved.debug === 'object') {
            Object.assign(this.config.debug, saved.debug);
          }
        }
        if (this.config.massPvp && (this.config.massPvp.characterLimit == null || this.config.massPvp.characterLimit < 120)) {
          this.config.massPvp.characterLimit = 140;
        }
        if (this.config.frustum && (this.config.frustum.nearImmunityRadius == null || this.config.frustum.nearImmunityRadius < 25.0)) {
          this.config.frustum.nearImmunityRadius = 28.0;
        }
      } catch (e) { /* ignore */ }
    }

    saveSettings() {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
      } catch (e) { /* ignore */ }
    }

    applyPreset(presetKey) {
      var p = PRESETS[presetKey];
      if (!p) return false;
      if (p.clippingRange) Object.assign(this.config.clippingRange, p.clippingRange);
      if (p.massPvp) Object.assign(this.config.massPvp, p.massPvp);
      if (p.shadowQuality && window.game && typeof window.game.setShadowQuality === 'function') {
        window.game.setShadowQuality(p.shadowQuality);
      }
      if (p.streamRadius && window.Terrain && typeof window.Terrain.setStreamRadius === 'function') {
        window.Terrain.setStreamRadius(p.streamRadius);
      }
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return true;
    }

    setCharacterLimit(limit) {
      var val = Math.max(10, Math.min(150, parseInt(limit, 10) || 50));
      this.config.massPvp.characterLimit = val;
      this.saveSettings();
      this.updateInspector();
      return val;
    }

    setActorsMaxDistance(dist) {
      var val = Math.max(30, Math.min(300, parseFloat(dist) || 140));
      this.config.clippingRange.actorsMax = val;
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return val;
    }

    setActorsMinDistance(dist) {
      var val = Math.max(8, Math.min(60, parseFloat(dist) || 10));
      this.config.clippingRange.actorsMin = val;
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return val;
    }

    setNameplateDistance(dist) {
      var val = Math.max(15, Math.min(100, parseFloat(dist) || 40));
      this.config.clippingRange.nameplate = val;
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return val;
    }

    setFoliageDistance(dist) {
      var val = Math.max(50, Math.min(500, parseFloat(dist) || 280));
      this.config.clippingRange.foliage = val;
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return val;
    }

    setPropsDistance(dist) {
      var val = Math.max(30, Math.min(800, parseFloat(dist) || 350));
      this.config.clippingRange.propsMax = val;
      this.config.clippingRange.buildingsMax = val;
      this.config.clippingRange.doodadsMax = Math.max(20, val * 0.5);
      this.saveSettings();
      this.updateDebugRings();
      this.updateInspector();
      return val;
    }

    setLootDistance(dist) {
      var val = Math.max(20, Math.min(150, parseFloat(dist) || 80));
      this.config.clippingRange.loot = val;
      this.saveSettings();
      return val;
    }

    setFrustumCullingEnabled(enabled) {
      this.config.frustum.enabled = !!enabled;
      this.saveSettings();
      this.updateInspector();
      return this.config.frustum.enabled;
    }

    setNearImmunityRadius(radius) {
      var val = Math.max(0, Math.min(250, parseFloat(radius) || 75.0));
      this.config.frustum.nearImmunityRadius = val;
      this.saveSettings();
      this.updateInspector();
      return val;
    }

    /**
     * Обновить матрицу камеры и пирамиду видимости Frustum.
     */
    updateCamera(camera) {
      this._ensureThreeObjects();
      if (!THREE || !camera || !this.frustum) return;

      camera.updateMatrixWorld(true);
      this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this.frustum.setFromProjectionMatrix(this._projScreenMatrix);
    }

    /**
     * Проверка нахождения сферы в пирамиде видимости с буфером безопасности.
     */
    isSphereInFrustum(x, y, z, radius) {
      if (!this.config.frustum.enabled) return true;
      this._ensureThreeObjects();
      if (!this.frustum || !this._tempSphere) return true;
      var r = (radius != null ? radius : 2.0) + (this.config.frustum.margin || 4.0);
      this._tempSphere.center.set(x, y, z);
      this._tempSphere.radius = r;
      return this.frustum.intersectsSphere(this._tempSphere);
    }

    /**
     * Проверка: является ли меш ядром ландшафта / водой / небом / игроком (НЕ отсекать!).
     */
    isCoreWorldMesh(mesh, propId) {
      if (!mesh) return true;
      var id = String(propId || '').toLowerCase();
      var name = String(mesh.name || '').toLowerCase();
      var ud = mesh.userData || {};

      // 1. Террейн / земля / чанки террейна
      if (id === 'terrain_ground' || id === 'terrain' || name.includes('terrain') || ud.isTerrain || ud.isTerrainChunk) return true;
      // 2. Океан / Вода
      if (id === 'water' || id === 'named_waterroot' || name.includes('water') || name.includes('ocean') || ud.isWater) return true;
      // 3. Горы и Вулкан (бэкграунд острова)
      if (id === 'volcano' || id === 'mountains_root' || id === 'mountains' || name.includes('mountain') || name.includes('volcano') || ud.isMountain || ud.isVolcano) return true;
      // 4. Небо / Купол / Освещение
      if (id === 'named_l2stardome' || name.includes('stardome') || name.includes('sky') || mesh.isLight || mesh.isCamera) return true;
      // 5. Игрок / спавн / хелперы
      if (id === 'player_spawn' || id === 'player' || id.startsWith('_editor') || name.startsWith('_editor') || name.startsWith('barrier_')) return true;

      return false;
    }

    /**
     * Вычисление приоритета сущности для масс-PvP лимита.
     */
    computeActorPriority(r, dist, player) {
      var score = 0;

      // 1. Текущая цель игрока — ВСЕГДА наивысший приоритет
      var isTarget = false;
      if (player && player.target) {
        if (r.type === 'm' && player.target.mid != null && player.target.mid === r.mid) isTarget = true;
        else if (r.type === 'p' && player.target.pid != null && player.target.pid === r.pid) isTarget = true;
      }
      if (isTarget) score += 100000;

      // 2. Члены группы (Party)
      if (r.type === 'p' && r.isPartyMember) score += 80000;

      // 3. Атакующие, комбат, флагнутые PvP и PK игроки
      if (r.type === 'p' && (r.flagged || (r.karma && r.karma > 0))) score += 70000;
      if (r.inCombat || r.combatFaceT > 0) score += 60000;

      // 4. Рейд-боссы, чемпионы и именные элитные мобы
      if (r.boss) score += 55000;
      else if (r.named || r.champion) score += 45000;

      // 5. Дистанция: чем ближе к игроку, тем выше шанс быть отображённым
      var distWeight = Math.max(0, 30000 - dist * 150);
      score += distWeight;

      // 6. Гистерезис видимости (Rock-Solid Anti-Flicker):
      // Защита от мелькания/светомузыки! Уже видимый бот получает огромный приоритет
      // и НИКОГДА не будет вытолкнут из кадра другим блуждающим ботом!
      var nowP = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (r._visState === 'visible_near' || r._visState === 'visible_far') {
        r._lastVisibleAt = nowP;
        score += 500000;
      } else if (r._lastVisibleAt && (nowP - r._lastVisibleAt < 5000)) {
        // Был видим в последние 5 секунд — удерживаем приоритет при повороте камеры
        score += 350000;
      }

      return score;
    }

    /**
     * Классификация пропсов и динамический расчет дистанции отсечения.
     */
    _classifyProp(mesh, propId) {
      if (!mesh) return { maxDist: 350, radius: 4.0, height: 4.0, isBuilding: false };
      var ud = mesh.userData = mesh.userData || {};
      if (!ud._l2Classified) {
        var name = String(mesh.name || propId || '').toLowerCase();
        var pData = ud.propData;
        var modelId = pData ? String(pData.modelId || pData.file || pData.id || '').toLowerCase() : '';
        var checkStr = name + ' ' + modelId;

        var isBuilding = false;
        var isDoodad = false;

        if (/house|building|monument|fort|tower|airship|shop|castle|sh1|hall|temple|gate|wall|forge|barn|chapel|guild|tavern|residence|hut|cottage|shed|inn|medieval|market|stall|wheel/i.test(checkStr)) {
          isBuilding = true;
        } else if (/barrel|crate|lantern|lamp|chest|box|anvil|torch|doodad|clutter|chair|table|bench|debris|pot|vase/i.test(checkStr)) {
          isDoodad = true;
        }

        var radius = 4.0;
        var height = 4.0;
        try {
          if (mesh.geometry && mesh.geometry.boundingSphere) {
            radius = mesh.geometry.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
          } else if (mesh.geometry && !mesh.geometry.boundingSphere) {
            mesh.geometry.computeBoundingSphere();
            if (mesh.geometry.boundingSphere) {
              radius = mesh.geometry.boundingSphere.radius * Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
            }
          }
        } catch (e) {}

        if (radius > 8.0) isBuilding = true;
        else if (radius < 2.0) isDoodad = true;

        ud._l2Classified = true;
        ud._l2Radius = Math.max(2.0, Math.min(80.0, radius));
        ud._l2Height = Math.max(3.0, height);
        ud._l2IsBuilding = isBuilding;
        ud._l2IsDoodad = isDoodad;
      }

      var clip = this.config.clippingRange;
      var maxDist = clip.propsMax || 350;
      if (ud._l2IsBuilding) {
        maxDist = clip.buildingsMax || clip.propsMax || 350;
      } else if (ud._l2IsDoodad) {
        maxDist = clip.doodadsMax || Math.max(20, (clip.propsMax || 350) * 0.5);
      }

      return { maxDist: maxDist, radius: ud._l2Radius, height: ud._l2Height, isBuilding: ud._l2IsBuilding };
    }

    /**
     * Главный конвейер оценки видимости ВСЕХ объектов мира (Steam Engine Evaluator).
     * @param {Map<string, object>} remoteMap — словарь серверных сущностей (мобы/игроки)
     * @param {object} player — локальный игрок
     * @param {THREE.Camera} camera — активная камера
     */
    evaluate(remoteMap, player, camera) {
      this._ensureThreeObjects();
      if (camera) this.updateCamera(camera);

      var st = {
        totalKnown: 0,
        visibleCount: 0,
        frustumCulled: 0,
        distanceCulled: 0,
        limitCulled: 0,
        namesVisibleCount: 0,
        namesCulledCount: 0,
        nearLodCount: 0,
        farLodCount: 0,
        // Детализация
        actorsCount: 0,
        actorsVisible: 0,
        actorsFrustum: 0,
        actorsDist: 0,
        actorsCap: 0,
        propsCount: 0,
        propsVisible: 0,
        propsFrustum: 0,
        propsDist: 0,
        foliageCount: 0,
        foliageVisible: 0,
        foliageFrustum: 0,
        foliageDist: 0,
        lootCount: 0,
        lootVisible: 0,
        lootCulled: 0,
        mobsCount: 0,
        playersCount: 0,
        npcCount: 0
      };
      var isEditor = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
      var pp = (isEditor && camera) ? camera.position : ((player && player.mesh) ? player.mesh.position : (player ? (player.position || { x: 0, y: 0, z: 0 }) : { x: 0, y: 0, z: 0 }));
      var clip = this.config.clippingRange;
      var maxPawnDist = isEditor ? 350.0 : clip.actorsMax;
      var nearLodDist = clip.actorsMin;
      var nearLodDist2 = nearLodDist * nearLodDist;
      var nameplateDist = isEditor ? 60.0 : clip.nameplate;
      var nameplateFade = clip.nameplateFade || 8.0;

      var nearImmunity = Math.min(20.0, Math.max(6.0, (this.config.frustum.enabled && this.config.frustum.nearImmunityRadius != null)
        ? this.config.frustum.nearImmunityRadius
        : 12.0));
      var nearImmunity2 = nearImmunity * nearImmunity;

      var actorCandidates = [];

      // ─────────────────────────────────────────────────────────────
      //  1. Серверные сущности (Remote Players / Mobs)
      // ─────────────────────────────────────────────────────────────
      if (remoteMap && remoteMap.size > 0) {
        for (var entry of remoteMap) {
          var key = entry[0];
          var r = entry[1];
          if (!r) continue;
          st.totalKnown++;
          st.actorsCount++;
          if (r.type === 'm') st.mobsCount++;
          else if (r.type === 'p') st.playersCount++;

          var obj = r.meshGroup || r.sprite;
          var rx = r.x != null ? r.x : (obj ? obj.position.x : 0);
          var rz = r.z != null ? r.z : (obj ? obj.position.z : 0);
          var ry = r._hy != null ? r._hy : (obj ? obj.position.y : 0);

          var dx = rx - pp.x;
          var dz = rz - pp.z;
          var dist2 = dx * dx + dz * dz;
          var dist = Math.sqrt(dist2);

          r._l2Dist = dist;
          r._l2Dist2 = dist2;

          // В РЕЖИМЕ РЕДАКТОРА: умное отсечение мобов и игроков по фрустуму и дистанции 320м
          if (isEditor) {
            if (dist > 320.0) {
              r._visState = 'culled_distance';
              r._inFrustum = false;
              if (obj && obj.visible) obj.visible = false;
              if (r.shadow && r.shadow.visible) r.shadow.visible = false;
              if (r.nameTag && r.nameTag.visible) r.nameTag.visible = false;
              st.distanceCulled++;
              continue;
            }
            var edInFrust = (dist <= 25.0) || this.isSphereInFrustum(rx, ry + 1.2, rz, 8.0);
            if (!edInFrust) {
              r._visState = 'culled_frustum';
              r._inFrustum = false;
              if (obj && obj.visible) obj.visible = false;
              if (r.shadow && r.shadow.visible) r.shadow.visible = false;
              if (r.nameTag && r.nameTag.visible) r.nameTag.visible = false;
              st.frustumCulled++;
              continue;
            }
            var isNearEd = dist <= 40.0;
            r._visState = isNearEd ? 'visible_near' : 'visible_far';
            r._inFrustum = true;
            r._nameplateAlpha = (dist <= 60.0) ? 1.0 : 0.0;
            r._lodNear = isNearEd;
            if (obj && !obj.visible) obj.visible = true;
            if (r.shadow) r.shadow.visible = isNearEd;
            if (r.nameTag) r.nameTag.visible = (dist <= 60.0);
            st.visibleCount++;
            st.actorsVisible++;
            if (isNearEd) st.nearLodCount++; else st.farLodCount++;
            if (dist <= 60.0) st.namesVisibleCount++;
            actorCandidates.push(r);
            continue;
          }

          // Tier 2: Client Distance Culling (PawnMax)
          if (dist > maxPawnDist) {
            r._visState = 'culled_distance';
            r._inFrustum = false;
            r._nameplateAlpha = 0;
            st.distanceCulled++;
            st.actorsDist++;
            st.namesCulledCount++;
            continue;
          }

          // Tier 1: Frustum Culling (360° Сфера присутствия: тени за спиной сохраняются!)
          var isNearImmune = (dist2 <= nearImmunity2);
          var sphereRadius = r.boss ? 5.0 : (r.named ? 3.0 : 2.0);
          var inFrustum = isNearImmune || this.isSphereInFrustum(rx, ry + 1.0, rz, sphereRadius);
          r._inFrustum = inFrustum;

          if (!inFrustum) {
            r._visState = 'culled_frustum';
            r._nameplateAlpha = 0;
            st.frustumCulled++;
            st.actorsFrustum++;
            st.namesCulledCount++;
            continue;
          }

          // Nameplate Alpha calculation (L2 canon)
          var npAlpha = 0;
          if (dist <= nameplateDist) {
            if (dist > nameplateDist - nameplateFade) {
              npAlpha = 1.0 - (dist - (nameplateDist - nameplateFade)) / nameplateFade;
            } else {
              npAlpha = 1.0;
            }
          }
          if (r.isDying) npAlpha *= 0.3;
          r._nameplateAlpha = Math.max(0, Math.min(1, npAlpha));

          var priority = this.computeActorPriority(r, dist, player);
          r._l2Priority = priority;
          actorCandidates.push(r);
        }
      }

      // ─────────────────────────────────────────────────────────────
      //  2. Сельские и городские NPC (Town NPCs)
      // ─────────────────────────────────────────────────────────────
      var g = window.game;
      if (g && g.npcManager && Array.isArray(g.npcManager.npcs)) {
        for (var npc of g.npcManager.npcs) {
          if (!npc || !npc.mesh) continue;
          st.totalKnown++;
          st.actorsCount++;
          st.npcCount++;

          var nx = npc.mesh.position.x;
          var ny = npc.mesh.position.y || 0;
          var nz = npc.mesh.position.z;

          var ndx = nx - pp.x;
          var ndz = nz - pp.z;
          var nDist2 = ndx * ndx + ndz * ndz;
          var nDist = Math.sqrt(nDist2);

          npc._l2Dist = nDist;

          // В РЕЖИМЕ РЕДАКТОРА: отсекаем далеких и внекадровых NPC
          if (isEditor) {
            if (nDist > 350.0) {
              npc._visState = 'culled_distance';
              if (npc.mesh) npc.mesh.visible = false;
              if (npc.nameTag) npc.nameTag.visible = false;
              st.distanceCulled++;
              continue;
            }
            var nInFrust = (nDist <= 25.0) || this.isSphereInFrustum(nx, ny + 1.5, nz, 8.0);
            if (!nInFrust) {
              npc._visState = 'culled_frustum';
              if (npc.mesh) npc.mesh.visible = false;
              if (npc.nameTag) npc.nameTag.visible = false;
              st.frustumCulled++;
              continue;
            }
            npc._visState = 'visible';
            npc._inFrustum = true;
            if (npc.mesh) npc.mesh.visible = true;
            if (npc.nameTag) npc.nameTag.visible = (nDist <= 50.0);
            npc._nameplateAlpha = (nDist <= 50.0) ? 1.0 : 0.0;
            st.visibleCount++;
            st.actorsVisible++;
            st.nearLodCount++;
            if (nDist <= 50.0) st.namesVisibleCount++;
            continue;
          }

          if (nDist > maxPawnDist) {
            st.distanceCulled++;
            st.actorsDist++;
            st.namesCulledCount++;
            continue;
          }

          var nNearImmune = (nDist2 <= nearImmunity2);
          var nInFrustum = nNearImmune || this.isSphereInFrustum(nx, ny + 1.2, nz, 2.5);
          if (!nInFrustum) {
            st.frustumCulled++;
            st.actorsFrustum++;
            st.namesCulledCount++;
            continue;
          }

          var nNear = nDist2 <= nearLodDist2;
          st.visibleCount++;
          st.actorsVisible++;
          if (nNear) st.nearLodCount++;
          else st.farLodCount++;

          if (npc._nameplateAlpha && npc._nameplateAlpha > 0.03) st.namesVisibleCount++;
          else st.namesCulledCount++;
        }
      }

      // ─── Tier 3: Mass-PvP Actor Cap ───
      var actorLimit = (isEditor || !this.config.massPvp.enabled) ? 99999 : this.config.massPvp.characterLimit;
      var crowd = window.CrowdStressTest;
      var showCrowdNames = crowd ? crowd.showNames : false;
      var targetEntity = (player && player.target) ? player.target : null;

      if (!isEditor && actorCandidates.length > actorLimit) {
        actorCandidates.sort(function (a, b) {
          return b._l2Priority - a._l2Priority;
        });
      }

      for (var i = 0; i < actorCandidates.length; i++) {
        var cand = actorCandidates[i];
        if (isEditor || i < actorLimit) {
          var isNear = isEditor || (cand._l2Dist2 <= nearLodDist2);
          cand._visState = isNear ? 'visible_near' : 'visible_far';
          cand._lodNear = isNear;
          st.visibleCount++;
          st.actorsVisible++;
          if (isNear) st.nearLodCount++;
          else st.farLodCount++;

          if (isEditor) {
            cand._nameplateAlpha = 1.0;
            st.namesVisibleCount++;
          } else {
            // Nameplate visibility calculation for active candidate
            var isTarget = !!(targetEntity && (targetEntity === cand || (targetEntity.pid != null && targetEntity.pid === cand.pid) || (targetEntity.mid != null && targetEntity.mid === cand.mid)));
            var inNameRange = (cand._l2Dist <= (cand.isStressBot ? 28.0 : nameplateDist));
            var nameAllowed = isTarget || (showCrowdNames !== false && inNameRange);

            if (nameAllowed && cand._nameplateAlpha > 0.03) {
              st.namesVisibleCount++;
            } else {
              st.namesCulledCount++;
            }
          }
        } else {
          cand._visState = 'culled_limit';
          cand._nameplateAlpha = 0;
          st.limitCulled++;
          st.actorsCap++;
          st.namesCulledCount++;
        }
      }

      // ─────────────────────────────────────────────────────────────
      //  3. Статичные пропсы, здания и постройки (customPropMeshes)
      // ─────────────────────────────────────────────────────────────
      var selectedMesh = (g && g.editor && g.editor.selectedObject) ? g.editor.selectedObject : null;
      var propMeshes = (g && g.worldContent && g.worldContent.customPropMeshes) || (g && g.editor && g.editor.customPropMeshes);

      if (propMeshes && propMeshes.size > 0) {
        for (var propEntry of propMeshes) {
          var propId = propEntry[0];
          var pMesh = propEntry[1];
          if (!pMesh) continue;

          // КРИТИЧНО: Ядро ландшафта (террейн, океан, горы, вулкан, небо) НИКОГДА не отсекается!
          if (this.isCoreWorldMesh(pMesh, propId)) {
            pMesh.visible = true;
            continue;
          }

          st.totalKnown++;
          st.propsCount++;

          var info = this._classifyProp(pMesh, propId);
          var px0 = pMesh.position.x;
          var py0 = pMesh.position.y || 0;
          var pz0 = pMesh.position.z;

          var pdx = px0 - pp.x;
          var pdz = pz0 - pp.z;
          var pDist = Math.hypot(pdx, pdz);

          // В РЕЖИМЕ РЕДАКТОРА: Выделенный объект всегда видим; остальные отсекаются по щедрому лимиту 550м и фрустуму
          if (isEditor) {
            var isSelected = (selectedMesh && (selectedMesh === pMesh || selectedMesh === pMesh.parent));
            if (isSelected) {
              pMesh.visible = true;
              pMesh._l2VisState = 'visible';
              st.visibleCount++;
              st.propsVisible++;
              continue;
            }
            var isLargeBuildingEd = info.isBuilding || (info.radius && info.radius > 6.0);
            var edMaxDist = isLargeBuildingEd ? 800.0 : 550.0;
            if (pDist > edMaxDist) {
              pMesh.visible = false;
              pMesh._l2VisState = 'culled_distance';
              st.distanceCulled++;
              st.propsDist++;
              continue;
            }
            var edInFrustum = (pDist <= 35.0) || this.isSphereInFrustum(px0, py0 + info.height / 2, pz0, info.radius + 30.0);
            if (!edInFrustum) {
              pMesh.visible = false;
              pMesh._l2VisState = 'culled_frustum';
              st.frustumCulled++;
              st.propsFrustum++;
              continue;
            }
            pMesh.visible = true;
            pMesh._l2VisState = 'visible';
            if (pMesh._l2BaseScale) {
              var baseSc = pMesh._l2BaseScale;
              pMesh.scale.set(baseSc.x, baseSc.y, baseSc.z);
            }
            st.visibleCount++;
            st.propsVisible++;
            continue;
          }

          // Tier 2: Props Distance Culling
          if (pDist > info.maxDist) {
            pMesh.visible = false;
            pMesh._l2VisState = 'culled_distance';
            st.distanceCulled++;
            st.propsDist++;
            continue;
          }

          // Tier 1: Props Frustum Culling (360° Сфера присутствия 100м вокруг игрока)
          var isLargeBuilding = info.isBuilding || (info.radius && info.radius > 6.0);
          var immDist = isLargeBuilding
            ? Math.min(100.0, this.config.frustum.buildingsNearImmunityRadius || 100.0)
            : nearImmunity;
          var pNearImmune = (pDist - (info.radius || 0) <= immDist);
          var pInFrustum = pNearImmune || this.isSphereInFrustum(px0, py0 + info.height / 2, pz0, info.radius + 25.0);
          if (!pInFrustum) {
            pMesh.visible = false;
            pMesh._l2VisState = 'culled_frustum';
            st.frustumCulled++;
            st.propsFrustum++;
            continue;
          }

          if (pMesh._l2BaseScale) {
            var baseSc = pMesh._l2BaseScale;
            pMesh.scale.set(baseSc.x, baseSc.y, baseSc.z);
          }

          pMesh.visible = true;
          pMesh._l2VisState = 'visible';
          st.visibleCount++;
          st.propsVisible++;
        }
      }

      // ─────────────────────────────────────────────────────────────
      //  4. Растительность и деревья (FoliageInstancer)
      // ─────────────────────────────────────────────────────────────
      var fInst = (g && g.worldContent && g.worldContent.foliageInstancer) || (g && g.editor && g.editor._foliageInstancer);
      if (fInst && typeof fInst.updateVisibility === 'function') {
        var foliageStats = fInst.updateVisibility(camera, player, this);
        if (foliageStats) {
          st.totalKnown += (foliageStats.total || 0);
          st.foliageCount = (foliageStats.total || 0);
          st.foliageVisible = (foliageStats.visible || 0);
          st.foliageFrustum = (foliageStats.frustumCulled || 0);
          st.foliageDist = (foliageStats.distanceCulled || 0);

          st.visibleCount += st.foliageVisible;
          st.frustumCulled += st.foliageFrustum;
          st.distanceCulled += st.foliageDist;
        }
      }

      // ─────────────────────────────────────────────────────────────
      //  5. Предметы лута на земле (lootManager.groundItems)
      // ─────────────────────────────────────────────────────────────
      if (g && g.lootManager && Array.isArray(g.lootManager.groundItems) && g.lootManager.groundItems.length > 0) {
        var lootMaxDist = isEditor ? 99999.0 : (clip.loot || 80.0);
        for (var gi of g.lootManager.groundItems) {
          if (!gi || !gi.mesh) continue;
          st.totalKnown++;
          st.lootCount++;

          var lx = gi.mesh.position.x;
          var ly = gi.mesh.position.y || 0;
          var lz = gi.mesh.position.z;

          var ldx = lx - pp.x;
          var ldz = lz - pp.z;
          var lDist = Math.hypot(ldx, ldz);

          // В РЕЖИМЕ РЕДАКТОРА: весь лут всегда видим
          if (isEditor) {
            gi.mesh.visible = true;
            if (gi.label) {
              gi.label.visible = true;
              if (gi.label.material) gi.label.material.opacity = 1.0;
            }
            st.visibleCount++;
            st.lootVisible++;
            st.namesVisibleCount++;
            continue;
          }

          if (lDist > lootMaxDist) {
            gi.mesh.visible = false;
            st.distanceCulled++;
            st.lootCulled++;
            continue;
          }

          var lNearImmune = (lDist <= nearImmunity);
          var lInFrustum = lNearImmune || this.isSphereInFrustum(lx, ly, lz, 1.8);
          if (!lInFrustum) {
            gi.mesh.visible = false;
            st.frustumCulled++;
            st.lootCulled++;
            continue;
          }

          gi.mesh.visible = true;
          st.visibleCount++;
          st.lootVisible++;

          // Фейд шильдика названия лута
          if (gi.label && gi.label.material) {
            var lAlpha = 1.0;
            if (lDist > nameplateDist - nameplateFade) {
              lAlpha = Math.max(0, 1.0 - (lDist - (nameplateDist - nameplateFade)) / nameplateFade);
            }
            gi.label.visible = lAlpha > 0.05;
            gi.label.material.opacity = lAlpha;
          }
        }
      }

      this.stats = Object.assign(this.stats, st);

      // Обновление 3D колец и инспектора
      if (this.config.debug.ringsVisible) {
        this.updateDebugRings(player);
      }
      if (this.config.debug.inspectorVisible) {
        this.updateInspector();
      }

      return st;
    }

    // ─────────────────────────────────────────────────────────────
    //  3D In-Game Visual Range Rings + 3D Badges (F4 / /vis)
    // ─────────────────────────────────────────────────────────────

    _createCircleLine(radius, colorHex, segments) {
      if (!THREE) return null;
      var segs = segments || 64;
      var points = [];
      for (var i = 0; i <= segs; i++) {
        var theta = (i / segs) * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
      }
      var geo = new THREE.BufferGeometry().setFromPoints(points);
      var mat = new THREE.LineBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.9,
        linewidth: 2,
        depthWrite: false
      });
      var line = new THREE.LineLoop(geo, mat);
      line.renderOrder = 997;
      return line;
    }

    _createRingBadge(text, colorHex, bgColor) {
      if (!THREE) return null;
      var canvas = document.createElement('canvas');
      canvas.width = 460;
      canvas.height = 76;
      var ctx = canvas.getContext('2d');

      ctx.fillStyle = bgColor || 'rgba(14, 12, 10, 0.92)';
      ctx.strokeStyle = colorHex || '#44bbff';
      ctx.lineWidth = 3;
      if (ctx.roundRect) ctx.roundRect(4, 4, 452, 68, 10);
      else ctx.rect(4, 4, 452, 68);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 23px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = colorHex || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 230, 38);

      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(11.2, 1.85, 1);
      return sprite;
    }

    ensureDebugRings(scene) {
      if (!THREE || !scene) return null;
      if (this._debugRingsGroup) return this._debugRingsGroup;

      var group = new THREE.Group();
      group.name = 'l2_visibility_debug_rings';

      var clip = this.config.clippingRange;

      // 1. Зелёное кольцо: PawnMin (45м)
      var ringNear = this._createCircleLine(clip.actorsMin, 0x44ff44, 48);
      ringNear.name = 'ring_pawn_min';
      var badgeNear1 = this._createRingBadge('🟢 45м — PawnMin [60 FPS LOD]', '#44ff44');
      badgeNear1.position.set(0, 1.8, clip.actorsMin);
      badgeNear1.name = 'badge_min_n';
      var badgeNear2 = this._createRingBadge('🟢 45м — PawnMin [60 FPS LOD]', '#44ff44');
      badgeNear2.position.set(0, 1.8, -clip.actorsMin);
      badgeNear2.name = 'badge_min_s';
      ringNear.add(badgeNear1, badgeNear2);
      group.add(ringNear);

      // 2. Синее кольцо: Nameplate Range (40м)
      var ringName = this._createCircleLine(clip.nameplate, 0x44bbff, 64);
      ringName.name = 'ring_nameplate';
      var badgeName1 = this._createRingBadge('🔵 40м — Nameplate & Loot [Имена & HP]', '#44bbff');
      badgeName1.position.set(clip.nameplate, 1.8, 0);
      badgeName1.name = 'badge_name_e';
      var badgeName2 = this._createRingBadge('🔵 40м — Nameplate & Loot [Имена & HP]', '#44bbff');
      badgeName2.position.set(-clip.nameplate, 1.8, 0);
      badgeName2.name = 'badge_name_w';
      ringName.add(badgeName1, badgeName2);
      group.add(ringName);

      // 3. Жёлтое кольцо: PawnMax (140м)
      var ringMax = this._createCircleLine(clip.actorsMax, 0xff4444, 96);
      ringMax.name = 'ring_pawn_max';
      var badgeMax1 = this._createRingBadge('🔴 140м — PawnMax [3D Мобы/Игроки]', '#ff5555');
      badgeMax1.position.set(clip.actorsMax, 2.5, 0);
      badgeMax1.name = 'badge_max_e';
      var badgeMax2 = this._createRingBadge('🔴 140м — PawnMax [3D Мобы/Игроки]', '#ff5555');
      badgeMax2.position.set(-clip.actorsMax, 2.5, 0);
      badgeMax2.name = 'badge_max_w';
      ringMax.add(badgeMax1, badgeMax2);
      group.add(ringMax);

      // 4. Оранжевое кольцо: Foliage (280м)
      var ringFoliage = this._createCircleLine(clip.foliage, 0xffdd33, 96);
      ringFoliage.name = 'ring_foliage';
      var badgeFol1 = this._createRingBadge('🟡 280м — Foliage [Деревья & Лес]', '#ffdd33');
      badgeFol1.position.set(0, 2.2, clip.foliage);
      badgeFol1.name = 'badge_fol_n';
      var badgeFol2 = this._createRingBadge('🟡 280м — Foliage [Деревья & Лес]', '#ffdd33');
      badgeFol2.position.set(0, 2.2, -clip.foliage);
      badgeFol2.name = 'badge_fol_s';
      ringFoliage.add(badgeFol1, badgeFol2);
      group.add(ringFoliage);

      // 5. Фиолетовое кольцо: Props & Buildings (450м)
      var ringProps = this._createCircleLine(clip.propsMax, 0xbb66ff, 128);
      ringProps.name = 'ring_props_max';
      var badgeProp1 = this._createRingBadge('🟣 450м — PropsMax [Постройки & Здания]', '#cc88ff');
      badgeProp1.position.set(0, 2.8, clip.propsMax);
      badgeProp1.name = 'badge_prop_n';
      var badgeProp2 = this._createRingBadge('🟣 450м — PropsMax [Постройки & Здания]', '#cc88ff');
      badgeProp2.position.set(0, 2.8, -clip.propsMax);
      badgeProp2.name = 'badge_prop_s';
      ringProps.add(badgeProp1, badgeProp2);
      group.add(ringProps);

      group.visible = !!this.config.debug.ringsVisible;
      scene.add(group);
      this._debugRingsGroup = group;
      return group;
    }

    toggleDebugRings(scene, player) {
      var nextState = !this.config.debug.ringsVisible;
      this.setDebugRings(nextState, scene, player);
      return nextState;
    }

    setDebugRings(enabled, scene, player) {
      if (enabled && !window.PS_GM && !window.PS_DEV) return false;
      this.config.debug.ringsVisible = !!enabled;
      this.saveSettings();

      if (!scene && window.game) scene = window.game.scene;
      var grp = this.ensureDebugRings(scene);
      if (grp) {
        grp.visible = this.config.debug.ringsVisible;
        this.updateDebugRings(player);
      }
      return this.config.debug.ringsVisible;
    }

    updateDebugRings(player) {
      if (!this._debugRingsGroup || !this.config.debug.ringsVisible) return;
      var pl = player || (window.game ? window.game.player : null);
      if (!pl) return;

      var px = pl.mesh ? pl.mesh.position.x : (pl.x || 0);
      var pz = pl.mesh ? pl.mesh.position.z : (pl.z || 0);
      var py = pl.mesh ? pl.mesh.position.y : (pl.y || 0);

      this._debugRingsGroup.position.set(px, py + 0.12, pz);

      var clip = this.config.clippingRange;

      var rMin = this._debugRingsGroup.getObjectByName('ring_pawn_min');
      if (rMin) {
        var sMin = clip.actorsMin / 45.0;
        rMin.scale.set(sMin, 1, sMin);
      }

      var rName = this._debugRingsGroup.getObjectByName('ring_nameplate');
      if (rName) {
        var sName = clip.nameplate / 40.0;
        rName.scale.set(sName, 1, sName);
      }

      var rFol = this._debugRingsGroup.getObjectByName('ring_foliage');
      if (rFol) {
        var sFol = clip.foliage / 280.0;
        rFol.scale.set(sFol, 1, sFol);
      }

      var rMax = this._debugRingsGroup.getObjectByName('ring_pawn_max');
      if (rMax) {
        var sMax = clip.actorsMax / 140.0;
        rMax.scale.set(sMax, 1, sMax);
      }

      var rProps = this._debugRingsGroup.getObjectByName('ring_props_max');
      if (rProps) {
        var sProps = clip.propsMax / 450.0;
        rProps.scale.set(sProps, 1, sProps);
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  Floating L2 Visibility Inspector Panel (F4)
    // ─────────────────────────────────────────────────────────────

    ensureInspectorPanel() {
      if (this._inspectorEl && document.getElementById('l2-vis-inspector')) return this._inspectorEl;
      var el = document.getElementById('l2-vis-inspector');
      if (!el) {
        el = document.createElement('div');
        el.id = 'l2-vis-inspector';
        document.body.appendChild(el);
      }

      el.style.cssText = [
        'position:fixed', 'top:75px', 'left:12px', 'z-index:9990',
        'width:380px', 'max-width:94vw',
        'background:linear-gradient(180deg, rgba(22,18,14,0.95) 0%, rgba(10,8,6,0.97) 100%)',
        'border:1px solid #8a6c38', 'box-shadow:0 0 0 1px #000, 0 10px 30px rgba(0,0,0,0.8)',
        'border-radius:4px', 'padding:12px 14px', 'color:#e8e0d0',
        'font:12px/1.4 Georgia, "Segoe UI", serif', 'user-select:none'
      ].join(';');

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;border-bottom:1px solid #5a4220;padding-bottom:6px">
          <b style="color:#f0d080;font-size:13px;display:flex;align-items:center;gap:6px">
            <span>👁</span> Visibility & Culling Inspector
          </b>
          <button id="l2-insp-close" style="background:#2a2016;border:1px solid #6a4a20;color:#ddd;cursor:pointer;padding:1px 6px;font-size:11px">✕</button>
        </div>

        <div id="l2-insp-body"></div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px;border-top:1px solid #443218;padding-top:8px">
          <button id="l2-insp-spawn" style="padding:5px;background:#2e2216;border:1px solid #7a5a28;color:#ffcc66;font-size:11px;cursor:pointer;border-radius:2px">🧪 Заспавнить 40 мобов</button>
          <button id="l2-insp-clear" style="padding:5px;background:#221812;border:1px solid #5a3820;color:#ddd;font-size:11px;cursor:pointer;border-radius:2px">🧹 Очистить мобов</button>
          <button id="l2-insp-rings" style="padding:5px;background:#1a2838;border:1px solid #386088;color:#88ddff;font-size:11px;cursor:pointer;border-radius:2px">⭕ 3D Зоны [F4]</button>
          <button id="l2-insp-opt" style="padding:5px;background:#241c14;border:1px solid #5a4220;color:#eee;font-size:11px;cursor:border-radius:2px">⚙ Настройки [O]</button>
        </div>

        <!-- 3D Engineer Crowd Stress Test Section -->
        <div style="margin-top:10px;border-top:1px solid #5a4220;padding-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b style="color:#ffcc66;font-size:11px;display:flex;align-items:center;gap:4px">
              <span>⚡</span> 3D Стресс-тест Инженеров (GLB)
            </b>
            <span id="l2-insp-stress-cnt" style="font-size:10px;color:#88ff88">Ботов: 0</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;margin-bottom:6px">
            <button id="l2-insp-stress-50" style="padding:4px;background:#342616;border:1px solid #8a6c38;color:#ffdd88;font-size:11px;cursor:pointer;border-radius:2px;font-weight:bold">+50 3D</button>
            <button id="l2-insp-stress-100" style="padding:4px;background:#342616;border:1px solid #8a6c38;color:#ffdd88;font-size:11px;cursor:pointer;border-radius:2px;font-weight:bold">+100 3D</button>
            <button id="l2-insp-stress-300" style="padding:4px;background:#3e1c14;border:1px solid #a84228;color:#ffaaaa;font-size:11px;cursor:pointer;border-radius:2px;font-weight:bold">+300 3D 🔥</button>
          </div>

          <div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;font-size:10px;color:#bbb">
            <span>Радиус:</span>
            <select id="l2-insp-stress-rad" style="background:#1c1610;border:1px solid #665030;color:#eee;font-size:10px;padding:2px">
              <option value="15">15 м</option>
              <option value="25" selected>25 м</option>
              <option value="35">35 м</option>
              <option value="50">50 м</option>
            </select>

            <span style="margin-left:4px">Режим:</span>
            <select id="l2-insp-stress-beh" style="background:#1c1610;border:1px solid #665030;color:#eee;font-size:10px;padding:2px">
              <option value="mixed" selected>Живая толпа</option>
              <option value="idle">Все Idle</option>
              <option value="walk">Все идут</option>
              <option value="run">Все бегут</option>
              <option value="combat">Бой/Каст</option>
            </select>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px">
            <button id="l2-insp-stress-uncap" style="padding:4px;background:#202830;border:1px solid #446688;color:#88ccee;font-size:10px;cursor:pointer;border-radius:2px">Лимит: 60</button>
            <button id="l2-insp-stress-names" style="padding:4px;background:#262018;border:1px solid #665030;color:#ddccaa;font-size:10px;cursor:pointer;border-radius:2px">Имена: Таргет</button>
            <button id="l2-insp-stress-clear" style="padding:4px;background:#2a1414;border:1px solid #773333;color:#ff9999;font-size:10px;cursor:pointer;border-radius:2px">🧹 Очистить</button>
          </div>
        </div>
      `;

      el.querySelector('#l2-insp-close').onclick = () => this.toggleInspector();
      el.querySelector('#l2-insp-spawn').onclick = () => {
        var cnt = this.spawnTestCrowd(window.game ? window.game.net : null, window.game ? window.game.player : null, 40);
        if (window.game && window.game.ui) window.game.ui.addChatMessage(`[L2Vis] Заспавнено ${cnt} тестовых мобов.`, 'system');
      };
      el.querySelector('#l2-insp-clear').onclick = () => {
        var cnt = this.clearTestCrowd(window.game ? window.game.net : null);
        if (window.game && window.game.ui) window.game.ui.addChatMessage(`[L2Vis] Очищено ${cnt} мобов.`, 'system');
      };
      el.querySelector('#l2-insp-rings').onclick = () => {
        this.toggleDebugRings();
        this.updateInspector();
      };
      el.querySelector('#l2-insp-opt').onclick = () => {
        if (window.game && window.game.ui && window.game.ui._toggleSettings) window.game.ui._toggleSettings();
      };

      // 3D Stress Test Event Listeners
      const getRad = () => parseFloat(el.querySelector('#l2-insp-stress-rad').value) || 25;
      const getBeh = () => el.querySelector('#l2-insp-stress-beh').value || 'mixed';

      const spawn3D = (count) => {
        const crowd = window.CrowdStressTest;
        if (!crowd) return;
        const rad = getRad();
        const beh = getBeh();
        crowd.spawn(count, { radius: rad, behavior: beh }).then((spawned) => {
          if (window.game && window.game.ui) {
            window.game.ui.addChatMessage(`[Stress] Заспавнено ${spawned} 3D инженеров (Радиус: ${rad}м, Режим: ${beh}).`, 'system');
          }
          this.updateInspector();
        });
      };

      el.querySelector('#l2-insp-stress-50').onclick = () => spawn3D(50);
      el.querySelector('#l2-insp-stress-100').onclick = () => spawn3D(100);
      el.querySelector('#l2-insp-stress-300').onclick = () => spawn3D(300);

      el.querySelector('#l2-insp-stress-clear').onclick = () => {
        const crowd = window.CrowdStressTest;
        if (crowd) {
          const cleared = crowd.clear();
          if (window.game && window.game.ui) {
            window.game.ui.addChatMessage(`[Stress] Очищено ${cleared} 3D инженеров.`, 'system');
          }
          this.updateInspector();
        }
      };

      el.querySelector('#l2-insp-stress-beh').onchange = (e) => {
        const crowd = window.CrowdStressTest;
        if (crowd) crowd.setBehavior(e.target.value);
      };

      const limits = [60, 100, 150, 300];
      const uncapBtn = el.querySelector('#l2-insp-stress-uncap');
      const curLim = this.config.massPvp.characterLimit || 120;
      uncapBtn.textContent = curLim > 200 ? 'Лимит: 300 🔥' : `Лимит: ${curLim}`;
      uncapBtn.style.color = curLim > 200 ? '#ffcc44' : (curLim <= 60 ? '#88ff88' : '#88ccee');

      uncapBtn.onclick = () => {
        const cur = this.config.massPvp.characterLimit || 60;
        let nextIdx = 0;
        for (let idx = 0; idx < limits.length; idx++) {
          if (limits[idx] > cur) {
            nextIdx = idx;
            break;
          }
        }
        const nextLim = limits[nextIdx];
        this.setCharacterLimit(nextLim);
        uncapBtn.textContent = nextLim > 200 ? 'Лимит: 350 🔥' : `Лимит: ${nextLim}`;
        uncapBtn.style.color = nextLim > 200 ? '#ffcc44' : (nextLim <= 40 ? '#88ff88' : '#88ccee');
        if (window.game && window.game.ui) {
          window.game.ui.addChatMessage(`[Stress] Лимит акторов на экране установлен: ${nextLim} ${nextLim <= 40 ? '(Режим 60 FPS)' : (nextLim > 200 ? '(Без лимита 🔥)' : '')}.`, 'system');
        }
        this.updateInspector();
      };

      const namesBtn = el.querySelector('#l2-insp-stress-names');
      namesBtn.onclick = () => {
        const crowd = window.CrowdStressTest;
        if (!crowd) return;
        const state = crowd.toggleNames();
        namesBtn.textContent = state ? 'Имена: Все' : 'Имена: Таргет';
        namesBtn.style.color = state ? '#88ff88' : '#ddccaa';
        if (window.game && window.game.ui) {
          window.game.ui.addChatMessage(`[Stress] Имена над головой: ${state ? 'ВКЛЮЧЕНЫ (все)' : 'ВЫКЛЮЧЕНЫ (только в таргете)'}.`, 'system');
        }
      };

      this._inspectorEl = el;
      el.style.display = this.config.debug.inspectorVisible ? 'block' : 'none';
      return el;
    }

    toggleInspector() {
      // Инспектор культинга — отладка: спавн ботов, снятие лимитов. Только GM / dev
      // (window.PS_DEV / window.PS_GM из пакета welcome).
      if (!window.PS_GM && !window.PS_DEV && !this.config.debug.inspectorVisible) return false;
      this.config.debug.inspectorVisible = !this.config.debug.inspectorVisible;
      this.saveSettings();
      var el = this.ensureInspectorPanel();
      if (el) el.style.display = this.config.debug.inspectorVisible ? 'block' : 'none';
      if (this.config.debug.inspectorVisible) this.updateInspector();
      return this.config.debug.inspectorVisible;
    }

    updateInspector() {
      if (!this._inspectorEl || !this.config.debug.inspectorVisible) return;
      var body = this._inspectorEl.querySelector('#l2-insp-body');
      if (!body) return;

      var s = this.stats;
      var cfg = this.config;
      var clip = cfg.clippingRange;

      body.innerHTML = `
        <div style="margin-bottom:8px">
          <div style="display:flex;justify-content:space-between;color:#aaa;font-size:11px">
            <span>Объектов в мире: <b style="color:#fff">${s.totalKnown}</b></span>
            <span>Видно в кадре: <b style="color:#8f8">${s.visibleCount}</b></span>
          </div>
          <div style="font-size:10px;color:#888;margin-top:2px">
            Акторов: ${s.actorsCount} (M:${s.mobsCount} P:${s.playersCount} N:${s.npcCount}) · Пропсов: ${s.propsCount} · Деревьев: ${s.foliageCount} · Лута: ${s.lootCount}
          </div>
        </div>

        <!-- Tier 1: Frustum -->
        <div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-left:3px solid ${cfg.frustum.enabled ? '#44ff44' : '#ff4444'};margin-bottom:6px">
          <div style="display:flex;justify-content:space-between">
            <b style="color:#88ff88">Tier 1: Frustum Culling</b>
            <span style="color:${cfg.frustum.enabled ? '#8f8' : '#f66'}">${cfg.frustum.enabled ? 'ВКЛ' : 'ВЫКЛ'}</span>
          </div>
          <div style="font-size:11px;color:#ddd;margin-top:2px">
            Вне угла камеры [F]: <b style="color:#ffcc44">${s.frustumCulled}</b>
          </div>
          <div style="font-size:10px;color:#888">
            Акторов: ${s.actorsFrustum} · Пропсов: ${s.propsFrustum} · Деревьев: ${s.foliageFrustum}
          </div>
        </div>

        <!-- Tier 2: Distance -->
        <div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-left:3px solid #44bbff;margin-bottom:6px">
          <b style="color:#88ddff">Tier 2: ClippingRange (l2.ini)</b>
          <div style="font-size:11px;color:#ddd;margin-top:2px">
            • <b>PawnMax (${clip.actorsMax}м)</b>: отсечено акторов <b style="color:#ffcc44">${s.actorsDist}</b>
          </div>
          <div style="font-size:11px;color:#ddd">
            • <b>Foliage (${clip.foliage}м)</b>: видно деревьев <b style="color:#8f8">${s.foliageVisible}</b> / отсечено <b style="color:#aaa">${s.foliageDist}</b>
          </div>
          <div style="font-size:11px;color:#ddd">
            • <b>Props (${clip.propsMax}м)</b>: видно построек <b style="color:#8f8">${s.propsVisible}</b> / отсечено <b style="color:#aaa">${s.propsDist}</b>
          </div>
          <div style="font-size:11px;color:#ddd">
            • <b>Nameplate (${clip.nameplate}м)</b>: имена видны <b style="color:#8f8">${s.namesVisibleCount}</b>, скрыты <b style="color:#aaa">${s.namesCulledCount}</b>
          </div>
          <div style="font-size:11px;color:#ddd">
            • <b>PawnMin (${clip.actorsMin}м)</b>: 60 FPS LOD <b style="color:#8f8">${s.nearLodCount}</b>, Far LOD <b style="color:#aaa">${s.farLodCount}</b>
          </div>
        </div>

        <!-- Tier 3: Actor Cap -->
        <div style="background:rgba(0,0,0,0.3);padding:6px 8px;border-left:3px solid #ffcc22;margin-bottom:6px">
          <b style="color:#ffdd66">Tier 3: Server AOI & Actor Cap</b>
          <div style="font-size:11px;color:#ddd;margin-top:2px">
            • <b>Лимит персонажей</b>: <b style="color:#fff">${cfg.massPvp.characterLimit}</b>
          </div>
          <div style="font-size:11px;color:#ddd">
            • Скрыто лимитом толпы [C]: <b style="color:#ff8888">${s.limitCulled}</b>
          </div>
        </div>
      `;

      var stressEl = this._inspectorEl.querySelector('#l2-insp-stress-cnt');
      if (stressEl && window.CrowdStressTest) {
        var bCnt = window.CrowdStressTest.activeBots.size;
        stressEl.textContent = `Ботов: ${bCnt}`;
        stressEl.style.color = bCnt > 0 ? '#ffdd66' : '#888888';
      }
    }

    // ─────────────────────────────────────────────────────────────
    //  Crowd Stress Test Generator (/test_crowd)
    // ─────────────────────────────────────────────────────────────

    spawnTestCrowd(net, player, count) {
      var n = Math.max(10, Math.min(80, count || 40));
      var g = window.game;
      var netClient = net || (g ? g.net : null);
      if (!netClient || !netClient.remote) return 0;

      var pl = player || (g ? g.player : null);
      var px = pl && pl.mesh ? pl.mesh.position.x : 0;
      var pz = pl && pl.mesh ? pl.mesh.position.z : 0;

      var spawned = 0;
      var mobTemplates = ['gremlin', 'wolf', 'goblin', 'orc', 'imp'];

      for (var i = 0; i < n; i++) {
        var angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        var rDist = 12 + Math.random() * 80;
        var x = px + Math.cos(angle) * rDist;
        var z = pz + Math.sin(angle) * rDist;
        var mid = 900000 + i;
        var mobKey = 'm' + mid;

        var tpl = mobTemplates[i % mobTemplates.length];
        var isBoss = (i === 0);
        var isNamed = (i === 1 || i === 2);

        var mockMob = {
          type: 'm',
          mid: mid,
          mobId: tpl,
          name: isBoss ? 'Test Raid Boss' : (isNamed ? 'Champion ' + tpl : 'Mock ' + tpl + ' #' + (i + 1)),
          x: x,
          z: z,
          hp: isBoss ? 50000 : 1000,
          maxHp: isBoss ? 50000 : 1000,
          level: isBoss ? 35 : (10 + (i % 20)),
          boss: isBoss,
          named: isNamed,
          champion: isNamed,
          rank: isBoss ? { id: 'boss' } : (isNamed ? { id: 'named' } : { id: 'normal' }),
          isMockTest: true
        };

        if (netClient._applyRemoteVisual) {
          netClient._applyRemoteVisual(mockMob);
        }
        netClient.remote.set(mobKey, mockMob);
        this._mockTestEntities.push(mobKey);
        spawned++;
      }
      this.updateInspector();
      return spawned;
    }

    clearTestCrowd(net) {
      var g = window.game;
      var netClient = net || (g ? g.net : null);
      var cleared = 0;
      if (netClient && netClient.remote) {
        for (var key of this._mockTestEntities) {
          var rec = netClient.remote.get(key);
          if (rec) {
            var obj = rec.meshGroup || rec.sprite;
            if (obj && obj.parent) obj.parent.remove(obj);
            if (rec.shadow && rec.shadow.parent) rec.shadow.parent.remove(rec.shadow);
            if (rec.nameTag && rec.nameTag.parent) rec.nameTag.parent.remove(rec.nameTag);
            if (rec.rankAura && rec.rankAura.parent) rec.rankAura.parent.remove(rec.rankAura);
            netClient.remote.delete(key);
            cleared++;
          }
        }
      }
      this._mockTestEntities = [];
      this.updateInspector();
      return cleared;
    }
  }

  var instance = new L2VisibilityEngine();
  instance.DEFAULT_CONFIG = DEFAULT_CONFIG;
  instance.PRESETS = PRESETS;

  return instance;
});
