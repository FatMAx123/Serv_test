// ============================================================
//  VOLCANO.JS — Загрузка и рендер 3D Вулкана из Volcano.fbx
//  Использует Volcano mask.webp (красный канал R = анимированная лава)
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;
  function getVD() { return window.VolcanoData; }

  var volcanoMesh = null;
  var volcanoMat = null;

  function createVolcanoMaterial(maskTex) {
    /** Все текстуры вулкана — только data/textures/. */
    function safeLoad(filename) {
      var tex;
      if (window.loadTex) {
        tex = window.loadTex(filename, function (t) {
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.needsUpdate = true;
        }, function () {
          console.warn('[Volcano] missing texture in data/textures/:', filename);
        });
      } else {
        var paths = window.texUrl
          ? window.texUrl(filename)
          : ['data/textures/' + filename, 'client/data/textures/' + filename];
        var loader = new THREE.TextureLoader();
        var idx = 0;
        var dummy = document.createElement('canvas');
        dummy.width = 1; dummy.height = 1;
        tex = new THREE.Texture(dummy);
        (function tryNext() {
          if (idx >= paths.length) {
            console.warn('[Volcano] missing texture in data/textures/:', filename);
            return;
          }
          var url = paths[idx++];
          loader.load(url, function (t) {
            tex.image = t.image;
            tex.needsUpdate = true;
          }, undefined, tryNext);
        })();
      }
      if (!tex) {
        var dummy = document.createElement('canvas');
        dummy.width = 1; dummy.height = 1;
        tex = new THREE.Texture(dummy);
      }
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }

    var texLava  = safeLoad('lava ground_BaseColor.webp');
    var texRock1 = safeLoad('Rock_Cliff_xccibbi_1K_BaseColor.webp');
    var texRock2 = safeLoad('Layered_Rock_Cliff_thfkchjs_1K_BaseColor.webp');

    var mat = new THREE.MeshStandardMaterial({
      map: maskTex,
      roughness: 1.0,  // 100% матовый диффуз без бликов
      metalness: 0.0,  // Отключение отражений
      side: THREE.FrontSide
    });

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTexLava  = { value: texLava };
      shader.uniforms.uTexRock1 = { value: texRock1 };
      shader.uniforms.uTexRock2 = { value: texRock2 };
      shader.uniforms.uTiling   = { value: 16.0 };
      shader.uniforms.uTime     = { value: 0.0 };

      mat.userData.shader = shader;

      shader.fragmentShader = `
        uniform sampler2D uTexLava;
        uniform sampler2D uTexRock1;
        uniform sampler2D uTexRock2;
        uniform float uTiling;
        uniform float uTime;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
        vec4 maskCol = texture2D( map, vMapUv );

        // 1. Выделение лавы по красному цвету маски (Red > Max(G, B))
        float redDiff = maskCol.r - max(maskCol.g, maskCol.b) * 1.1;
        float wLava = smoothstep(0.06, 0.22, redDiff);

        // 2. Выделение светлых участков маски (Второй тип камня: Layered_Rock_Cliff)
        float lum = dot(maskCol.rgb, vec3(0.299, 0.587, 0.114));
        float wLightRock = smoothstep(0.10, 0.35, lum) * (1.0 - wLava);

        // 3. Чёрные / тёмные участки маски (Основная текстура камня: Rock_Cliff)
        float wDarkRock = clamp(1.0 - (wLava + wLightRock), 0.0, 1.0);

        vec2 tileRock = vMapUv * uTiling; // 16.0 для текстур скал

        // Увеличенный масштаб тайлинга лавы (4.5) для совпадения по размеру трещин с террейном
        vec2 tileLava = vMapUv * 4.5;

        // Поток лавы течёт ВНИЗ по руслу вулкана (+uTime * 0.08)
        vec2 lavaUv = tileLava + vec2(uTime * 0.08, sin(uTime * 0.5 + tileLava.x * 2.0) * 0.02);

        vec3 colLava  = texture2D(uTexLava,  lavaUv).rgb;
        vec3 colRock1 = texture2D(uTexRock1, tileRock * 1.0).rgb; // Основной камень (Rock_Cliff)
        vec3 colRock2 = texture2D(uTexRock2, tileRock * 0.8).rgb; // Второй тип камня (Layered_Rock_Cliff)

        // Скалистая поверхность горы
        vec3 rockSurface = mix(colRock1 * 0.70, colRock2 * 0.80, wLightRock);

        // Лава подкрашена в красно-огненный базальтовый тон террейна (1:1 под terrain.js)
        vec3 lavaSurface = vec3(0.95, 0.25, 0.05) * (colLava * 1.8);

        // Смешивание камней с лавой
        diffuseColor.rgb = mix(rockSurface, lavaSurface, wLava);

        // Анимированное огненное свечение магмы (1:1 с террейном)
        float lavaPulse = 0.85 + 0.35 * sin(uTime * 2.5 + tileLava.x * 4.0 + tileLava.y * 3.0);
        vec3 lavaGlow = vec3(1.5, 0.40, 0.05) * wLava * smoothstep(0.20, 0.80, colLava.r) * (3.0 * lavaPulse);
        diffuseColor.rgb += lavaGlow;
        #endif
        `
      );
    };

    volcanoMat = mat;
    return mat;
  }

  var volcanoLod = null;
  var volcanoMesh = null;
  var volcanoMat = null;
  var _forcedLOD = -1;

  function createGeo(data) {
    if (!data || !data.positions || !data.indices) return null;
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    if (data.uvs && data.uvs.length) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    }
    var idx = data.indices;
    if (idx instanceof THREE.BufferAttribute) {
      g.setIndex(idx);
    } else if (ArrayBuffer.isView(idx)) {
      var u32 = (idx instanceof Uint32Array || idx instanceof Uint16Array)
        ? idx
        : new Uint32Array(idx.buffer, idx.byteOffset, idx.length);
      g.setIndex(new THREE.BufferAttribute(u32, 1));
    } else if (Array.isArray(idx)) {
      g.setIndex(idx);
    } else {
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }

  function buildVolcano(scene) {
    var vd = getVD();
    if (!vd || !vd.positions) {
      console.warn('[Volcano] window.VolcanoData missing!');
      return;
    }

    var geo0 = createGeo(vd);
    var geo1 = vd.lod1 ? createGeo(vd.lod1) : geo0;
    var geo2 = vd.lod2 ? createGeo(vd.lod2) : (geo1 || geo0);

    // Загрузка Volcano mask.webp (красный канал = лава) — data/textures/
    var maskTex = window.loadTex
      ? window.loadTex('Volcano mask.webp', function (t) {
          t.flipY = true;
          t.wrapS = THREE.ClampToEdgeWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.needsUpdate = true;
        }, function () {
          console.warn('[Volcano] missing Volcano mask.webp in data/textures/');
        })
      : (function () {
          var paths = window.texUrl
            ? window.texUrl('Volcano mask.webp')
            : ['data/textures/Volcano mask.webp', 'client/data/textures/Volcano mask.webp'];
          var loader = new THREE.TextureLoader();
          var dummy = document.createElement('canvas');
          dummy.width = 1; dummy.height = 1;
          var t = new THREE.Texture(dummy);
          var i = 0;
          (function tryNext() {
            if (i >= paths.length) return;
            var url = paths[i++];
            loader.load(url, function (loaded) {
              t.image = loaded.image;
              t.needsUpdate = true;
            }, undefined, tryNext);
          })();
          return t;
        })();
    if (!maskTex) {
      var dummy = document.createElement('canvas');
      dummy.width = 1; dummy.height = 1;
      maskTex = new THREE.Texture(dummy);
    }
    maskTex.flipY = true;
    maskTex.wrapS = THREE.ClampToEdgeWrapping;
    maskTex.wrapT = THREE.ClampToEdgeWrapping;

    var mat = createVolcanoMaterial(maskTex);

    // 3 уровня мешей с общим материалом
    var mesh0 = new THREE.Mesh(geo0, mat);
    mesh0.name = 'Volcano_LOD0';
    mesh0.receiveShadow = false; mesh0.castShadow = false;
    mesh0.visible = true;

    var mesh1 = new THREE.Mesh(geo1, mat);
    mesh1.name = 'Volcano_LOD1';
    mesh1.receiveShadow = false; mesh1.castShadow = false;
    mesh1.visible = false;

    var mesh2 = new THREE.Mesh(geo2, mat);
    mesh2.name = 'Volcano_LOD2';
    mesh2.receiveShadow = false; mesh2.castShadow = false;
    mesh2.visible = false;

    // 3-уровневый THREE.LOD
    volcanoLod = new THREE.LOD();
    volcanoLod.name = 'VolcanoMesh';
    volcanoLod.userData = volcanoLod.userData || {};
    volcanoLod.userData.editorKey = 'volcano';
    volcanoLod.userData.editorLabel = 'Вулкан (3-Tier LOD)';
    volcanoLod.userData.isVolcano = true;

    // 3-уровневые дистанции (с гистерезисом 0.08):
    // LOD 0: 0m - 400m (21.7k tris)
    volcanoLod.addLevel(mesh0, 0, 0.08);
    // LOD 1: 400m - 1000m (10.8k tris, 50% reduction)
    volcanoLod.addLevel(mesh1, 400, 0.08);
    // LOD 2: > 1000m (3.9k tris, 82% reduction)
    volcanoLod.addLevel(mesh2, 1000, 0.08);

    // Посадка вулкана в рельеф острова: эталонные координаты из оверрайдов сцены
    var ovr = (window.WorldMetrics && window.WorldMetrics.CUSTOM_PROPS &&
      window.WorldMetrics.CUSTOM_PROPS.find(function(p) { return p.id === 'volcano' || p.editorKey === 'volcano'; })) ||
      (window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.customProps &&
      window.EDITOR_OVERRIDES_DATA.customProps.find(function(p) { return p.id === 'volcano' || p.editorKey === 'volcano'; }));

    var posX = (ovr && ovr.position && typeof ovr.position.x === 'number') ? ovr.position.x : 1214.5;
    var posY = (ovr && ovr.position && typeof ovr.position.y === 'number') ? ovr.position.y : -18.97;
    var posZ = (ovr && ovr.position && typeof ovr.position.z === 'number') ? ovr.position.z : -1655.0;
    var rotY = (ovr && ovr.rotation && typeof ovr.rotation.y === 'number') ? ovr.rotation.y : 1.98;
    var scX = (ovr && ovr.scale && typeof ovr.scale.x === 'number') ? ovr.scale.x : 479.24;
    var scY = (ovr && ovr.scale && typeof ovr.scale.y === 'number') ? ovr.scale.y : 479.24;
    var scZ = (ovr && ovr.scale && typeof ovr.scale.z === 'number') ? ovr.scale.z : 479.24;

    volcanoLod.scale.set(scX, scY, scZ);
    volcanoLod.rotation.y = rotY;
    volcanoLod.position.set(posX, posY, posZ);
    volcanoLod.userData.editorBind = {
      x: posX, y: posY, z: posZ, sx: scX, sy: scY, sz: scZ
    };

    var volcanoCenter = new THREE.Vector3(posX, posY, posZ);
    volcanoLod.worldCenter = volcanoCenter;

    // Кастомный апдейт с ГАРАНТИЕЙ взаимного исключения уровней и поддержкой _forcedLOD
    volcanoLod.update = function (camera) {
      if (!camera) return;
      var levels = this.levels;
      if (!levels || levels.length === 0) return;

      if (_forcedLOD >= 0 && _forcedLOD < levels.length) {
        for (var k = 0; k < levels.length; k++) {
          levels[k].object.visible = (k === _forcedLOD);
        }
        this._currentLevel = _forcedLOD;
        return;
      }

      var camPos = camera.matrixWorld
        ? new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld)
        : camera.position;
      var dist = camPos.distanceTo(volcanoCenter) / (camera.zoom || 1.0);

      var activeIdx = 0;
      for (var lIdx = 1; lIdx < levels.length; lIdx++) {
        var lDist = levels[lIdx].distance;
        if (levels[lIdx].object.visible) {
          lDist -= lDist * (levels[lIdx].hysteresis || 0);
        }
        if (dist >= lDist) {
          activeIdx = lIdx;
        } else {
          break;
        }
      }

      for (var i = 0; i < levels.length; i++) {
        levels[i].object.visible = (i === activeIdx);
      }
      this._currentLevel = activeIdx;
    };

    volcanoLod.updateMatrixWorld(true);
    scene.add(volcanoLod);
    volcanoMesh = volcanoLod;

    var vd = getVD();
    var t0 = (vd && vd.indices) ? vd.indices.length / 3 : 0;
    var t1 = (vd && vd.lod1 && vd.lod1.indices) ? vd.lod1.indices.length / 3 : 0;
    var t2 = (vd && vd.lod2 && vd.lod2.indices) ? vd.lod2.indices.length / 3 : 0;
    console.log(`[Volcano] 3-Tier LOD создан на позиции:`, volcanoLod.position,
      `| LOD0: ${t0}t, LOD1: ${t1}t, LOD2: ${t2}t`);
  }

  function build(scene) {
    if (window.WorldMetrics && window.WorldMetrics.isWorldObjectDeleted &&
        window.WorldMetrics.isWorldObjectDeleted('volcano')) {
      console.log('[Volcano] skip — deleted in editor');
      return;
    }
    buildVolcano(scene);
  }

  var _lastCamera = null;

  function update(t, camera) {
    if (volcanoMat && volcanoMat.userData && volcanoMat.userData.shader) {
      volcanoMat.userData.shader.uniforms.uTime.value = t || 0;
    }
    var cam = camera || (window.game && window.game.camera) || _lastCamera;
    if (cam) {
      _lastCamera = cam;
      if (volcanoLod) volcanoLod.update(cam);
    }
  }

  function setLOD(lvl) {
    if (typeof lvl === 'number' && lvl >= 0 && lvl <= 2) {
      _forcedLOD = lvl;
      console.log('[Volcano] Forced LOD level:', lvl);
      if (volcanoLod && volcanoLod.levels) {
        for (var i = 0; i < volcanoLod.levels.length; i++) {
          volcanoLod.levels[i].object.visible = (i === _forcedLOD);
        }
        volcanoLod._currentLevel = _forcedLOD;
      }
    } else {
      _forcedLOD = -1;
      console.log('[Volcano] Auto distance LOD enabled');
      var cam = (window.game && window.game.camera) || _lastCamera;
      if (cam && volcanoLod) volcanoLod.update(cam);
    }
  }

  function getStats() {
    var vd = getVD();
    var cur = (_forcedLOD !== -1)
      ? _forcedLOD
      : ((volcanoLod && typeof volcanoLod.getCurrentLevel === 'function')
          ? volcanoLod.getCurrentLevel()
          : 0);
    var trisList = [
      (vd && vd.indices) ? vd.indices.length / 3 : 0,
      (vd && vd.lod1 && vd.lod1.indices) ? vd.lod1.indices.length / 3 : 0,
      (vd && vd.lod2 && vd.lod2.indices) ? vd.lod2.indices.length / 3 : 0
    ];
    return {
      name: 'Volcano',
      activeLevel: cur,
      forcedLevel: _forcedLOD,
      renderedTris: trisList[cur] || 0,
      levels: [
        { level: 0, distance: 0, tris: trisList[0] },
        { level: 1, distance: 400, tris: trisList[1] },
        { level: 2, distance: 1000, tris: trisList[2] }
      ]
    };
  }

  function dispose() {
    if (volcanoLod && volcanoLod.parent) volcanoLod.parent.remove(volcanoLod);
    if (volcanoLod && volcanoLod.levels) {
      volcanoLod.levels.forEach(function (lvl) {
        if (lvl.object && lvl.object.geometry) {
          try { lvl.object.geometry.dispose(); } catch (e) {}
        }
      });
    }
    if (volcanoMat) {
      try { volcanoMat.dispose(); } catch (e) {}
    }
    volcanoLod = null;
    volcanoMesh = null;
    volcanoMat = null;
    _forcedLOD = -1;
  }

  window.Volcano = {
    build: build,
    update: update,
    dispose: dispose,
    setLOD: setLOD,
    getStats: getStats,
    get mesh() { return volcanoMesh; },
    get lod() { return volcanoLod; }
  };

})();
