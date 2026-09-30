// ============================================================
//  MOUNTAINS.JS — mOUNTS.fbx
//  Раскладка: как в FBX (Lcl TRS), без «драпировки» вершин.
//  Посадка: только сдвиг group.y по средней высоте террейна.
//  Текстуры: Icelandic + Layered_Rock_Cliff + yd0lfcqcc + grass + sand
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;
  var MD = window.MountainsData;

  var mountainsRoot = null;
  var mountainsMat = null;
  var meshList = [];

  // Лёгкое утопление всего массива в рельеф (м), без деформации mesh
  var BASE_SINK = 8.0;
  var FOOT_BLEND_M = 24.0;

  /** Все текстуры гор — только data/textures/ (см. window.texUrl / loadTex). */
  function safeLoadTex(filename) {
    var tex;
    if (window.loadTex) {
      tex = window.loadTex(filename, function (t, url) {
        if (THREE.SRGBColorSpace !== undefined) t.colorSpace = THREE.SRGBColorSpace;
        else if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        t.needsUpdate = true;
      }, function () {
        console.warn('[Mountains] missing texture in data/textures/:', filename);
      });
    } else {
      var paths = window.texUrl
        ? window.texUrl(filename)
        : ['data/textures/' + filename, 'client/data/textures/' + filename];
      var loader = new THREE.TextureLoader();
      tex = loader.load(paths[0], undefined, undefined, function () {
        if (paths[1]) {
          loader.load(paths[1], function (t2) {
            tex.image = t2.image;
            tex.needsUpdate = true;
          });
        }
      });
    }
    if (!tex) {
      var dummy = document.createElement('canvas');
      dummy.width = 1; dummy.height = 1;
      tex = new THREE.Texture(dummy);
    }
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    if (THREE.SRGBColorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
    else if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
    tex.anisotropy = 8;
    return tex;
  }

  function heightAt(x, z) {
    if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
      return window.Terrain.heightAt(x, z);
    }
    return 0;
  }

  /** Средняя высота террейна под центрами кусков / bbox */
  function sampleTerrainUnderMountains() {
    var samples = [];
    var metas = (MD && MD.meshes) ? MD.meshes : [];
    var i;
    if (metas.length) {
      for (i = 0; i < metas.length; i++) {
        var c = metas[i].center;
        if (c && c.length >= 3) samples.push(heightAt(c[0], c[2]));
      }
    }
    if (!samples.length && MD && MD.bounds) {
      var b = MD.bounds;
      var pts = [
        [b.min[0], b.min[2]], [b.max[0], b.min[2]],
        [b.min[0], b.max[2]], [b.max[0], b.max[2]],
        [(b.min[0]+b.max[0])*0.5, (b.min[2]+b.max[2])*0.5]
      ];
      for (i = 0; i < pts.length; i++) samples.push(heightAt(pts[i][0], pts[i][1]));
    }
    if (!samples.length) return 0;
    var s = 0;
    for (i = 0; i < samples.length; i++) s += samples[i];
    return s / samples.length;
  }

  function createMountainMaterial(hPeak) {
    var texIceland = safeLoadTex('Icelandic_Rock_Detail_ucukfhycw_1K_BaseColor.webp');
    var texStone   = safeLoadTex('yd0lfcqcc_1K_Basecolor.webp');
    var texCliff   = safeLoadTex('Layered_Rock_Cliff_thfkchjs_1K_BaseColor.webp');
    var texGrass   = safeLoadTex('020_Dense_Green_grass_BaseColor.webp');
    var texSand    = safeLoadTex('sand_tidewrack.webp');

    // День: нормальный rock + fog (в мире). Ночь: uNight приглушает, без «молока» и без чёрных дыр.
    var mat = new THREE.MeshStandardMaterial({
      map: texStone,
      color: 0xc4bfb6,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.0,
      fog: true,
      side: THREE.FrontSide
    });
    mat.envMap = null;

    var peak = (hPeak && hPeak > 20) ? hPeak : 400.0;
    var METERS_PER_TILE = 50.0;

    mat.onBeforeCompile = function (shader) {
      shader.uniforms.uTexIceland = { value: texIceland };
      shader.uniforms.uTexStone   = { value: texStone };
      shader.uniforms.uTexCliff   = { value: texCliff };
      shader.uniforms.uTexGrass   = { value: texGrass };
      shader.uniforms.uTexSand    = { value: texSand };
      shader.uniforms.uSc         = { value: 1.0 / METERS_PER_TILE };
      shader.uniforms.uHPeak      = { value: peak };
      shader.uniforms.uFoot       = { value: FOOT_BLEND_M };
      shader.uniforms.uNight      = { value: 0.0 }; // 0=day 1=night — крутит DayNight
      mat.userData.shader = shader;

      shader.vertexShader =
        'varying vec3 vObjPos;\nvarying vec3 vObjNrm;\nvarying float vObjY;\n' +
        shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' +
        'vObjPos = transformed;\n' +
        'vObjY = transformed.y;\n'
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\n' +
        'vObjNrm = normalize(objectNormal);\n'
      );

      shader.fragmentShader = `
        uniform sampler2D uTexIceland;
        uniform sampler2D uTexStone;
        uniform sampler2D uTexCliff;
        uniform sampler2D uTexGrass;
        uniform sampler2D uTexSand;
        uniform float uSc;
        uniform float uHPeak;
        uniform float uFoot;
        uniform float uNight;
        varying vec3 vObjPos;
        varying vec3 vObjNrm;
        varying float vObjY;

        vec3 triObj(sampler2D tex) {
          vec3 n = normalize(vObjNrm);
          vec3 a = abs(n);
          vec3 w = pow(a, vec3(4.0));
          w /= (w.x + w.y + w.z + 1e-5);
          float s = uSc;
          vec3 cx = texture2D(tex, vObjPos.zy * s).rgb;
          vec3 cy = texture2D(tex, vObjPos.xz * s).rgb;
          vec3 cz = texture2D(tex, vObjPos.xy * s).rgb;
          return cx * w.x + cy * w.y + cz * w.z;
        }
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
        vec3 N = normalize(vObjNrm);
        float slope = 1.0 - clamp(N.y, 0.0, 1.0);
        float h01 = clamp(vObjY / max(uHPeak, 1.0), 0.0, 1.0);

        vec3 rock  = triObj(uTexIceland);
        vec3 stone = triObj(uTexStone);
        vec3 cliff = triObj(uTexCliff);
        vec3 grass = triObj(uTexGrass);
        vec3 sand  = triObj(uTexSand);

        // дневной rock (тёплый, читаемый)
        rock  = rock  * vec3(1.05, 1.02, 0.98) + 0.02;
        stone = stone * vec3(1.08, 1.04, 0.98) + 0.025;
        cliff = cliff * vec3(1.04, 1.01, 0.97) + 0.02;
        sand  = sand  * vec3(1.08, 1.03, 0.95) + 0.02;
        grass = grass * vec3(0.92, 0.98, 0.68) + 0.02;

        float mSand  = 1.0 - smoothstep(0.0, uFoot, vObjY);
        float mCliff = smoothstep(0.22, 0.55, slope)
                     * (1.0 - smoothstep(0.70, 0.95, h01));
        mCliff = clamp(mCliff, 0.0, 0.85);
        float mRock  = smoothstep(0.45, 0.82, slope)
                     + smoothstep(0.55, 0.92, h01) * 0.45;
        mRock = clamp(mRock, 0.0, 1.0);
        float mGrass = smoothstep(0.55, 0.15, slope)
                     * (1.0 - smoothstep(0.45, 0.85, h01)) * 0.55;
        mGrass *= (1.0 - max(mRock, mCliff));

        vec3 col = stone;
        col = mix(col, cliff, mCliff);
        col = mix(col, rock,  mRock);
        col = mix(col, grass, mGrass);
        col = mix(col, sand,  mSand * 0.8);

        // лёгкий AO (день)
        float ao = mix(0.55, 1.0, pow(clamp(N.y * 0.55 + 0.45, 0.0, 1.0), 1.1));
        ao *= mix(0.78, 1.0, 1.0 - slope * 0.28);
        col *= ao * 0.96;

        // ночь: приглушить + холод, НЕ в чёрный
        float n = clamp(uNight, 0.0, 1.0);
        col *= mix(1.0, 0.52, n);
        col = mix(col, col * vec3(0.72, 0.80, 0.95), n * 0.45);
        col = clamp(col, vec3(0.03), mix(vec3(1.05), vec3(0.55), n));

        diffuseColor.rgb = col;
        #endif
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        `
        // ночью слегка гасим specular/ambient wash, днём 1.0
        float nd = mix(1.0, 0.78, clamp(uNight, 0.0, 1.0));
        outgoingLight *= nd;
        #include <opaque_fragment>
        `
      );
    };
    mat.customProgramCacheKey = function () { return 'mountains_daynight_v4'; };

    mountainsMat = mat;
    return mat;
  }

  var lodList = [];
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

  function build(scene) {
    if (window.WorldMetrics && window.WorldMetrics.isWorldObjectDeleted &&
        window.WorldMetrics.isWorldObjectDeleted('mountains')) {
      console.log('[Mountains] skip — deleted in editor');
      return;
    }
    if (!MD || (!MD.positions && !MD.pieces)) {
      console.warn('[Mountains] window.MountainsData missing');
      return;
    }

    var yMin = (MD.bounds && MD.bounds.min) ? MD.bounds.min[1] : 0.0;
    var hPeak = (MD.bounds && MD.bounds.max && MD.bounds.min)
      ? Math.max(80, MD.bounds.max[1] - MD.bounds.min[1])
      : 400.0;

    var mat = createMountainMaterial(hPeak);

    mountainsRoot = new THREE.Group();
    mountainsRoot.name = 'MountainsRoot';
    mountainsRoot.userData = mountainsRoot.userData || {};
    mountainsRoot.userData.editorKey = 'mountains_root';
    mountainsRoot.userData.editorLabel = 'Горы (MountainsRoot 3-Tier LOD)';
    mountainsRoot.userData.isMountain = true;

    // Посадка: эталонная позиция и масштаб из оверрайдов сцены (-101.5, -356.54, -860.5, scale 2.04)
    var ovr = (window.WorldMetrics && window.WorldMetrics.CUSTOM_PROPS &&
      window.WorldMetrics.CUSTOM_PROPS.find(function(p) { return p.id === 'mountains_root' || p.editorKey === 'mountains_root'; })) ||
      (window.EDITOR_OVERRIDES_DATA && window.EDITOR_OVERRIDES_DATA.customProps &&
      window.EDITOR_OVERRIDES_DATA.customProps.find(function(p) { return p.id === 'mountains_root' || p.editorKey === 'mountains_root'; }));

    var posX = (ovr && ovr.position && typeof ovr.position.x === 'number') ? ovr.position.x : -101.5;
    var posY = (ovr && ovr.position && typeof ovr.position.y === 'number') ? ovr.position.y : -356.54;
    var posZ = (ovr && ovr.position && typeof ovr.position.z === 'number') ? ovr.position.z : -860.5;
    var scX = (ovr && ovr.scale && typeof ovr.scale.x === 'number') ? ovr.scale.x : 2.04;
    var scY = (ovr && ovr.scale && typeof ovr.scale.y === 'number') ? ovr.scale.y : 2.04;
    var scZ = (ovr && ovr.scale && typeof ovr.scale.z === 'number') ? ovr.scale.z : 2.04;
    var placeY = posY;

    mountainsRoot.position.set(posX, posY, posZ);
    mountainsRoot.scale.set(scX, scY, scZ);

    mountainsRoot.userData.editorBind = {
      x: posX, y: posY, z: posZ, sx: scX, sy: scY, sz: scZ
    };

    meshList = [];
    lodList = [];

    // 9 независимых гряд с 3 уровнями LOD (Per-Ridge 3-Tier LOD)
    if (MD.pieces && MD.pieces.length > 0) {
      for (var i = 0; i < MD.pieces.length; i++) {
        var piece = MD.pieces[i];
        var geo0 = createGeo(piece.lod0);
        var geo1 = piece.lod1 ? createGeo(piece.lod1) : geo0;
        var geo2 = piece.lod2 ? createGeo(piece.lod2) : (geo1 || geo0);

        var m0 = new THREE.Mesh(geo0, mat);
        m0.name = (piece.model || piece.name) + '_LOD0';
        m0.castShadow = false; m0.receiveShadow = false;
        m0.userData = { editorKey: 'mountains', isMountain: true };
        m0.visible = true;

        var m1 = new THREE.Mesh(geo1, mat);
        m1.name = (piece.model || piece.name) + '_LOD1';
        m1.castShadow = false; m1.receiveShadow = false;
        m1.userData = { editorKey: 'mountains', isMountain: true };
        m1.visible = false;

        var m2 = new THREE.Mesh(geo2, mat);
        m2.name = (piece.model || piece.name) + '_LOD2';
        m2.castShadow = false; m2.receiveShadow = false;
        m2.userData = { editorKey: 'mountains', isMountain: true };
        m2.visible = false;

        var ridgeLod = new THREE.LOD();
        ridgeLod.name = 'Mountain_' + (piece.model || piece.name);
        ridgeLod.userData = {
          editorKey: 'mountains',
          editorLabel: 'Гряда ' + (piece.model || piece.name),
          isMountain: true,
          model: piece.model,
          center: piece.center
        };

        // 3-уровневые дистанции:
        // LOD 0: 0m - 280m
        ridgeLod.addLevel(m0, 0, 0.08);
        // LOD 1: 280m - 700m
        ridgeLod.addLevel(m1, 280, 0.08);
        // LOD 2: > 700m
        ridgeLod.addLevel(m2, 700, 0.08);

        // Сохраняем мировой центр гряды для идеального расчёта дистанции до камеры
        var c = piece.center || [0, 0, 0];
        ridgeLod.worldCenter = new THREE.Vector3(posX + c[0] * scX, posY + c[1] * scY, posZ + c[2] * scZ);

        // Кастомный апдейт с ГАРАНТИЕЙ взаимного исключения уровней и поддержкой _forcedLOD
        ridgeLod.update = (function (wCenter) {
          return function (camera) {
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
            var dist = camPos.distanceTo(wCenter) / (camera.zoom || 1.0);

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

            // Ровно один активный меш видим, остальные гарантированно скрыты
            for (var i = 0; i < levels.length; i++) {
              levels[i].object.visible = (i === activeIdx);
            }
            this._currentLevel = activeIdx;
          };
        })(ridgeLod.worldCenter);

        mountainsRoot.add(ridgeLod);
        lodList.push(ridgeLod);
        meshList.push(m0);
      }
    } else {
      // Fallback: комбинированный меш с LOD1 и LOD2 если доступно
      var fallbackGeo0 = createGeo(MD);
      var fallbackGeo1 = MD.lod1 ? createGeo(MD.lod1) : fallbackGeo0;
      var fallbackGeo2 = MD.lod2 ? createGeo(MD.lod2) : (fallbackGeo1 || fallbackGeo0);

      var fbM0 = new THREE.Mesh(fallbackGeo0, mat);
      fbM0.visible = true;
      var fbM1 = new THREE.Mesh(fallbackGeo1, mat);
      fbM1.visible = false;
      var fbM2 = new THREE.Mesh(fallbackGeo2, mat);
      fbM2.visible = false;

      var combinedLod = new THREE.LOD();
      combinedLod.name = 'MountainsMesh';
      combinedLod.userData = { editorKey: 'mountains', isMountain: true };
      combinedLod.addLevel(fbM0, 0, 0.08);
      combinedLod.addLevel(fbM1, 280, 0.08);
      combinedLod.addLevel(fbM2, 700, 0.08);
      combinedLod.worldCenter = new THREE.Vector3(posX, posY, posZ);

      combinedLod.update = (function (wCenter) {
        return function (camera) {
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
          var dist = camPos.distanceTo(wCenter) / (camera.zoom || 1.0);

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
      })(combinedLod.worldCenter);

      mountainsRoot.add(combinedLod);
      lodList.push(combinedLod);
      meshList.push(fbM0);
    }

    scene.add(mountainsRoot);

    // для шейдера: base world Y
    if (mat.userData.shader && mat.userData.shader.uniforms.uBaseY) {
      mat.userData.shader.uniforms.uBaseY.value = placeY;
    }

    console.log(
      '[Mountains] 3-Tier Per-Ridge LOD создан | ridges:', lodList.length,
      'pos:', posX, posY, posZ,
      'scale:', scX
    );
  }

  function setNight(n) {
    n = Math.max(0, Math.min(1, n || 0));
    if (!mountainsMat) return;
    // Fog ALWAYS enabled for mountains so distance blends seamlessly into sky horizon
    if (mountainsMat.fog !== true) {
      mountainsMat.fog = true;
      mountainsMat.needsUpdate = true;
    }
    if (mountainsMat.userData && mountainsMat.userData.shader) {
      var u = mountainsMat.userData.shader.uniforms;
      if (u && u.uNight) u.uNight.value = n;
    }
  }

  var _lastCamera = null;

  function update(elapsed, camera) {
    // uNight из DayNight (если update вызван до компиляции шейдера — setNight no-op)
    var dn = window.game && window.game.dayNight;
    if (dn && typeof dn._lastNight === 'number') setNight(dn._lastNight);

    var cam = camera || (window.game && window.game.camera) || _lastCamera;
    if (cam) {
      _lastCamera = cam;
      if (lodList.length > 0) {
        for (var j = 0; j < lodList.length; j++) {
          lodList[j].update(cam);
        }
      }
    }
  }

  function setLOD(lvl) {
    if (typeof lvl === 'number' && lvl >= 0 && lvl <= 2) {
      _forcedLOD = lvl;
      console.log('[Mountains] Forced LOD level:', lvl);
      for (var i = 0; i < lodList.length; i++) {
        var lod = lodList[i];
        for (var lv = 0; lv < lod.levels.length; lv++) {
          lod.levels[lv].object.visible = (lv === _forcedLOD);
        }
        lod._currentLevel = _forcedLOD;
      }
    } else {
      _forcedLOD = -1;
      console.log('[Mountains] Auto distance LOD enabled');
      var cam = (window.game && window.game.camera) || _lastCamera;
      if (cam) {
        for (var j = 0; j < lodList.length; j++) {
          lodList[j].update(cam);
        }
      }
    }
  }

  function getStats() {
    var totalTris = 0;
    var counts = { lod0: 0, lod1: 0, lod2: 0 };
    for (var i = 0; i < lodList.length; i++) {
      var lod = lodList[i];
      var activeLvl = (_forcedLOD >= 0 && _forcedLOD <= 2)
        ? _forcedLOD
        : (typeof lod.getCurrentLevel === 'function' ? lod.getCurrentLevel() : 0);
      counts['lod' + activeLvl] = (counts['lod' + activeLvl] || 0) + 1;
      if (lod.levels[activeLvl] && lod.levels[activeLvl].object && lod.levels[activeLvl].object.geometry) {
        var idx = lod.levels[activeLvl].object.geometry.index;
        if (idx) totalTris += idx.count / 3;
      }
    }
    return {
      name: 'Mountains',
      ridgesCount: lodList.length,
      forcedLevel: _forcedLOD,
      activeLevelCounts: counts,
      totalRenderedTris: totalTris,
      stats: MD.stats || null
    };
  }

  function dispose() {
    if (mountainsRoot && mountainsRoot.parent) mountainsRoot.parent.remove(mountainsRoot);
    lodList.forEach(function (lod) {
      if (lod.levels) {
        lod.levels.forEach(function (lvl) {
          if (lvl.object && lvl.object.geometry) {
            try { lvl.object.geometry.dispose(); } catch (e) {}
          }
        });
      }
    });
    if (mountainsMat) {
      try { mountainsMat.dispose(); } catch (e) {}
    }
    mountainsRoot = null;
    meshList = [];
    lodList = [];
    mountainsMat = null;
    _forcedLOD = -1;
  }

  window.Mountains = {
    build: build,
    update: update,
    setNight: setNight,
    dispose: dispose,
    setLOD: setLOD,
    getStats: getStats,
    get mesh() { return (lodList[0] && lodList[0].levels[0] && lodList[0].levels[0].object) || meshList[0] || null; },
    get root() { return mountainsRoot; },
    get lods() { return lodList; }
  };
})();
