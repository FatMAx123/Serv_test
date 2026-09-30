// ============================================================
//  TERRAIN.JS — L2 sector stream (P1/P2/P3)
//
//  P1 Stream:
//    GRID 8×8 = 64 сектора, STREAM_RADIUS=2 → ~25 live max
//    unload дальних, лог live N/defs M
//    skirts: один winding (не double)
//
//  P2 CPU:
//    shore walls → spatial hash (cell 80 m)
//    sector geo lazy: tri-index на старте, pos/uv/nrm при load
//
//  P3 Paint:
//    atlas (default): одна terr_light + global UV — без стыков
//    tiles (opt): T_col_row stream + local UV (GRID должен = tile grid)
//    splat_weights — опциональный look (USE_SPLAT_WEIGHTS)
//
//  Материал (бэкап): baseCol * (detail * 1.6) + lava/swamp glow
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;

  // ---- config ----
  var GRID_SIZE = 8;
  /** Chebyshev. 2 → окно 5×5 (~25 live max, экономит 24 draw calls). */
  var STREAM_RADIUS = (function () {
    try {
      var s = localStorage.getItem('ps_terrain_stream_radius');
      if (s) {
        var n = parseInt(s, 10);
        if (n >= 1 && n <= 4) return n;
      }
    } catch (e) {}
    return 2;
  })();
  var DETAIL_TILING = 96.0;
  var SEA = -35.0;
  /** Юбка дольше: высота суши ~30–80м, иначе виден «срез» меша над водой. */
  var SKIRT_DEPTH = 100.0;
  /** Дно юбки всегда ниже моря, чтобы срез уходил в океан. */
  var SKIRT_BELOW_SEA = 25.0;
  /** Shore spatial hash cell size (m). */
  var SHORE_CELL = 80;
  var SHORE_STEP = 10;
  /**
   * 'atlas' — full terr_light, global UV (seamless, recommended).
   * 'tiles' — stream T_col_row.webp; UV local 0..1 (нужен grid == tile grid 4).
   */
  var PAINT_MODE = 'atlas';
  /** Если tiles и GRID≠4 — fallback на atlas. */
  var TILE_GRID = 4;
  /** Опционально: sample splat_weights вместо RGB paint weights (другой look). */
  var USE_SPLAT_WEIGHTS = false;
  /** Лог стриминга секторов: на каждой смене сектора считает liveTris обходом
   *  всех живых секторов ТОЛЬКО ради лога. Включается dev-флагом из welcome. */
  function streamLogOn() { return !!(typeof window !== 'undefined' && window.PS_DEV); }

  // ---- state ----
  var rootGroup = null;
  var groundMesh = null;
  /** Lightweight sector meta (no heavy arrays until load). */
  var sectorDefs = [];
  var sectorLive = new Map();
  var sharedDetails = null;
  var sharedMat = null;
  var atlasMapTex = null;
  var splatTex = null;
  var fullNormals = null;
  var lastStreamKey = '';
  var fireflyPoints = null;
  var fireflyBasePos = [];
  var fireflyCount = 300;
  var shoreWalls = [];
  var shoreHash = new Map();
  var streamStats = { loads: 0, unloads: 0, lastLive: 0 };

  // ---- Terrain Painting (4-Layer GPU Splatmap with Per-Stroke Tiling Map — L2 Optimized) ----
  var PAINT_MAP_SIZE = 1024;
  var paintData1 = null;
  var paintData2 = null;
  var paintTex1 = null;
  var paintTex2 = null;
  var isPaintDirty = false;
  var autoSaveTimer = null;
  var layerTextures = [null, null, null, null];
  var layerTilings = [96.0, 96.0, 96.0, 96.0];

  try {
    var savedT = localStorage.getItem('ps_terrain_layer_tilings');
    if (savedT) {
      var arr = JSON.parse(savedT);
      if (Array.isArray(arr) && arr.length >= 4) {
        layerTilings = arr.map(function (v) { return Math.max(10.0, Math.min(1200.0, parseFloat(v) || 96.0)); });
      }
    }
  } catch (e) {}

  var uLayerTilingVec = new THREE.Vector4(layerTilings[0], layerTilings[1], layerTilings[2], layerTilings[3]);

  function setLayerTiling(layerIndex, tiling) {
    var idx = Math.max(0, Math.min(3, layerIndex || 0));
    var val = Math.max(10.0, Math.min(1200.0, parseFloat(tiling) || 96.0));
    layerTilings[idx] = val;
    if (uLayerTilingVec) uLayerTilingVec.setComponent(idx, val);
    try {
      localStorage.setItem('ps_terrain_layer_tilings', JSON.stringify(layerTilings));
    } catch (e) {}
  }

  function getLayerTiling(layerIndex) {
    var idx = Math.max(0, Math.min(3, layerIndex || 0));
    return layerTilings[idx] || 96.0;
  }

  var DEFAULT_LAYER_PATHS = [
    'data/textures/town_cobblestone.webp',
    'data/textures/020_Dense_Green_grass_BaseColor.webp',
    'data/textures/Forest_Floor_vktfeilaw_1K_BaseColor.webp',
    'data/textures/sand_tidewrack.webp'
  ];

  var texLoader = new THREE.TextureLoader();
  DEFAULT_LAYER_PATHS.forEach(function (p, i) {
    texLoader.load(p, function (tex) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      layerTextures[i] = tex;
      if (sharedMat && sharedMat.userData && sharedMat.userData.shader) {
        var un = sharedMat.userData.shader.uniforms['uTex' + i];
        if (un) un.value = tex;
      }
    });
  });

  function initPaintCanvas() {
    if (paintData1) return;
    paintData1 = new Uint8Array(PAINT_MAP_SIZE * PAINT_MAP_SIZE * 4);
    paintTex1 = new THREE.DataTexture(paintData1, PAINT_MAP_SIZE, PAINT_MAP_SIZE, THREE.RGBAFormat);
    paintTex1.minFilter = THREE.LinearFilter;
    paintTex1.magFilter = THREE.LinearFilter;
    paintTex1.wrapS = paintTex1.wrapT = THREE.ClampToEdgeWrapping;
    paintTex1.generateMipmaps = false;
    paintTex1.needsUpdate = true;

    paintData2 = new Uint8Array(PAINT_MAP_SIZE * PAINT_MAP_SIZE * 4);
    paintTex2 = new THREE.DataTexture(paintData2, PAINT_MAP_SIZE, PAINT_MAP_SIZE, THREE.RGBAFormat);
    paintTex2.minFilter = THREE.NearestFilter;
    paintTex2.magFilter = THREE.NearestFilter;
    paintTex2.wrapS = paintTex2.wrapT = THREE.ClampToEdgeWrapping;
    paintTex2.generateMipmaps = false;
    paintTex2.needsUpdate = true;

    loadSavedPaintData();
  }

  function paintStroke(worldX, worldZ, radius, falloff, strength, layerIndex, isErase, uvU, uvV, brushTiling) {
    initPaintCanvas();
    var d = TD();
    if (!d || d.minX == null) return;

    var minX = d.minX, maxX = d.maxX, minZ = d.minZ, maxZ = d.maxZ;
    var worldW = maxX - minX, worldH = maxZ - minZ;
    if (worldW <= 0 || worldH <= 0) return;

    var cx = (typeof uvU === 'number' && isFinite(uvU))
      ? uvU * (PAINT_MAP_SIZE - 1)
      : ((worldX - minX) / worldW) * (PAINT_MAP_SIZE - 1);

    var cy = (typeof uvV === 'number' && isFinite(uvV))
      ? uvV * (PAINT_MAP_SIZE - 1)
      : (1.0 - (worldZ - minZ) / worldH) * (PAINT_MAP_SIZE - 1);

    var rPx = (radius / worldW) * PAINT_MAP_SIZE;

    var minPxX = Math.max(0, Math.floor(cx - rPx));
    var maxPxX = Math.min(PAINT_MAP_SIZE - 1, Math.ceil(cx + rPx));
    var minPxY = Math.max(0, Math.floor(cy - rPx));
    var maxPxY = Math.min(PAINT_MAP_SIZE - 1, Math.ceil(cy + rPx));

    var slot = Math.max(0, Math.min(3, layerIndex || 0));
    var bTile = (typeof brushTiling === 'number' && brushTiling > 0) ? brushTiling : (layerTilings[slot] || 96.0);
    var tByte = Math.max(1, Math.min(255, Math.round(((bTile - 10.0) / 1190.0) * 255.0)));

    var hardness = typeof falloff === 'number' ? Math.max(0, Math.min(0.99, falloff)) : 0.4;
    var str = typeof strength === 'number' ? Math.max(0.01, Math.min(1.0, strength)) : 0.35;
    var innerRadius = rPx * hardness;
    var outerRadius = rPx;
    var fadeRange = Math.max(0.001, outerRadius - innerRadius);

    var maxOpacityTarget = Math.round(str * 255.0);
    var stepRate = Math.max(1.0, str * 28.0);

    for (var py = minPxY; py <= maxPxY; py++) {
      var dy = py - cy;
      var dy2 = dy * dy;
      var rowOffset = py * PAINT_MAP_SIZE * 4;

      for (var px = minPxX; px <= maxPxX; px++) {
        var dx = px - cx;
        var dist = Math.sqrt(dx * dx + dy2);
        if (dist > outerRadius) continue;

        var factor = 1.0;
        if (dist > innerRadius) {
          var t = (dist - innerRadius) / fadeRange;
          factor = 0.5 + 0.5 * Math.cos(t * Math.PI);
        }

        var pOff = rowOffset + px * 4;
        var curVal = paintData1[pOff + slot];

        if (isErase) {
          var eraseDelta = factor * stepRate;
          paintData1[pOff + slot] = Math.max(0, Math.round(curVal - eraseDelta));
          if (paintData1[pOff + slot] === 0) {
            paintData2[pOff + slot] = 0;
          }
        } else {
          var pixelTargetMax = Math.round(maxOpacityTarget * factor);
          if (curVal < pixelTargetMax) {
            var stepAdd = factor * stepRate;
            var targetVal = Math.min(pixelTargetMax, Math.round(curVal + stepAdd));
            var actualAdd = targetVal - curVal;

            if (actualAdd > 0) {
              // Proportional reduction of other layers so active layer can smoothly mix or replace
              var otherSum = 0;
              for (var ch = 0; ch < 4; ch++) {
                if (ch !== slot) otherSum += paintData1[pOff + ch];
              }
              if (otherSum > 0) {
                var scale = Math.max(0, (otherSum - actualAdd) / otherSum);
                for (var ch = 0; ch < 4; ch++) {
                  if (ch !== slot) {
                    paintData1[pOff + ch] = Math.round(paintData1[pOff + ch] * scale);
                  }
                }
              }
              paintData1[pOff + slot] = targetVal;
              paintData2[pOff + slot] = tByte;
            }
          }
        }
      }
    }

    paintTex1.needsUpdate = true;
    paintTex2.needsUpdate = true;
    isPaintDirty = true;
  }

  var undoStack = [];
  var redoStack = [];
  var MAX_UNDO = 30;

  function getPaintSnapshot() {
    initPaintCanvas();
    if (!paintData1 || !paintData2) return null;
    return {
      d1: new Uint8Array(paintData1),
      d2: new Uint8Array(paintData2)
    };
  }

  function restorePaintSnapshot(snap) {
    if (!snap || !snap.d1 || !snap.d2) return false;
    initPaintCanvas();
    if (!paintData1 || !paintData2) return false;
    paintData1.set(snap.d1);
    paintData2.set(snap.d2);
    if (paintTex1) paintTex1.needsUpdate = true;
    if (paintTex2) paintTex2.needsUpdate = true;
    isPaintDirty = true;
    scheduleAutoSave();
    return true;
  }

  function pushUndoSnapshot() {
    initPaintCanvas();
    if (!paintData1 || !paintData2) return;
    undoStack.push({
      d1: new Uint8Array(paintData1),
      d2: new Uint8Array(paintData2)
    });
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack.length = 0;
  }

  function undoPaint() {
    initPaintCanvas();
    if (!undoStack.length || !paintData1 || !paintData2) return false;
    redoStack.push({
      d1: new Uint8Array(paintData1),
      d2: new Uint8Array(paintData2)
    });
    var snap = undoStack.pop();
    paintData1.set(snap.d1);
    paintData2.set(snap.d2);
    if (paintTex1) paintTex1.needsUpdate = true;
    if (paintTex2) paintTex2.needsUpdate = true;
    isPaintDirty = true;
    scheduleAutoSave();
    return true;
  }

  function redoPaint() {
    initPaintCanvas();
    if (!redoStack.length || !paintData1 || !paintData2) return false;
    undoStack.push({
      d1: new Uint8Array(paintData1),
      d2: new Uint8Array(paintData2)
    });
    var snap = redoStack.pop();
    paintData1.set(snap.d1);
    paintData2.set(snap.d2);
    if (paintTex1) paintTex1.needsUpdate = true;
    if (paintTex2) paintTex2.needsUpdate = true;
    isPaintDirty = true;
    scheduleAutoSave();
    return true;
  }

  function clearPaintLayer(layerIndex) {
    initPaintCanvas();
    pushUndoSnapshot();
    if (layerIndex === -1) {
      paintData1.fill(0);
      paintData2.fill(0);
    } else {
      var slot = Math.max(0, Math.min(3, layerIndex || 0));
      for (var i = slot; i < paintData1.length; i += 4) {
        paintData1[i] = 0;
        paintData2[i] = 0;
      }
    }
    paintTex1.needsUpdate = true;
    paintTex2.needsUpdate = true;
    isPaintDirty = true;
    savePaintDataToServer();
  }

  function fillPaintLayer(layerIndex) {
    initPaintCanvas();
    pushUndoSnapshot();
    var slot = Math.max(0, Math.min(3, layerIndex || 0));
    var bTile = layerTilings[slot] || 96.0;
    var tByte = Math.max(1, Math.min(255, Math.round(((bTile - 10.0) / 1190.0) * 255.0)));
    for (var i = 0; i < paintData1.length; i += 4) {
      paintData1[i + slot] = 255;
      paintData2[i + slot] = tByte;
    }
    paintTex1.needsUpdate = true;
    paintTex2.needsUpdate = true;
    isPaintDirty = true;
    savePaintDataToServer();
  }

  function scheduleAutoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(function () {
      if (isPaintDirty) savePaintDataToServer();
    }, 2000);
  }

  // IndexedDB persistent storage for instant reload without size limits
  var idbPromise = null;
  function getPaintDb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve) {
      if (typeof indexedDB === 'undefined') return resolve(null);
      try {
        var req = indexedDB.open('project_steam_terrain', 1);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains('paint')) {
            db.createObjectStore('paint');
          }
        };
        req.onsuccess = function (e) { resolve(e.target.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return idbPromise;
  }

  function idbSavePaint(d1, d2) {
    if (!d1 || !d2) return;
    getPaintDb().then(function (db) {
      if (!db) return;
      try {
        var tx = db.transaction('paint', 'readwrite');
        var st = tx.objectStore('paint');
        st.put(new Uint8Array(d1), 'layer1');
        st.put(new Uint8Array(d2), 'layer2');
        st.put(Date.now(), 'savedAt');
      } catch (e) {}
    });
  }

  function idbLoadPaint(callback) {
    getPaintDb().then(function (db) {
      if (!db) return callback(null, null);
      try {
        var tx = db.transaction('paint', 'readonly');
        var st = tx.objectStore('paint');
        var r1 = st.get('layer1');
        var r2 = st.get('layer2');
        tx.oncomplete = function () {
          callback(r1.result, r2.result);
        };
        tx.onerror = function () { callback(null, null); };
      } catch (e) { callback(null, null); }
    });
  }

  function savePaintDataToServer() {
    if (!paintData1 || !paintData2) return Promise.resolve(false);

    // 1. Instant binary save to IndexedDB (zero size limits, persists across all browser restarts/F5)
    idbSavePaint(paintData1, paintData2);

    return new Promise(function (resolve) {
      try {
        var c1 = document.createElement('canvas');
        c1.width = c1.height = PAINT_MAP_SIZE;
        var ctx1 = c1.getContext('2d');
        var imgData1 = ctx1.createImageData(PAINT_MAP_SIZE, PAINT_MAP_SIZE);
        imgData1.data.set(paintData1);
        ctx1.putImageData(imgData1, 0, 0);

        var c2 = document.createElement('canvas');
        c2.width = c2.height = PAINT_MAP_SIZE;
        var ctx2 = c2.getContext('2d');
        var imgData2 = ctx2.createImageData(PAINT_MAP_SIZE, PAINT_MAP_SIZE);
        imgData2.data.set(paintData2);
        ctx2.putImageData(imgData2, 0, 0);

        var d1 = c1.toDataURL('image/png');
        var d2 = c2.toDataURL('image/png');

        // 2. Save PNG to server disk
        fetch('/api/save-terrain-paint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ layer1: d1, layer2: d2 })
        }).then(function (r) { return r.json(); }).then(function (res) {
          isPaintDirty = false;
          if (res && res.ok) console.log('[Terrain] ✅ Текстуры и дороги террейна сохранены на сервер и в файлы!');
          resolve(true);
        }).catch(function (e) {
          console.warn('[Terrain] Server save error:', e);
          resolve(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function loadSavedPaintData() {
    // 1. Instant load from IndexedDB
    idbLoadPaint(function (d1, d2) {
      if (d1 && d1.length === paintData1.length) {
        paintData1.set(d1);
        if (paintTex1) paintTex1.needsUpdate = true;
      }
      if (d2 && d2.length === paintData2.length) {
        paintData2.set(d2);
        if (paintTex2) paintTex2.needsUpdate = true;
      }
    });

    // 2. Load from server disk files as well
    function loadLayer(url, targetArray, targetTex) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (!img.naturalWidth) return;
        var c = document.createElement('canvas');
        c.width = c.height = PAINT_MAP_SIZE;
        var ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, PAINT_MAP_SIZE, PAINT_MAP_SIZE);
        var id = ctx.getImageData(0, 0, PAINT_MAP_SIZE, PAINT_MAP_SIZE);
        targetArray.set(id.data);
        if (targetTex) targetTex.needsUpdate = true;
      };
      img.onerror = function () {};
      img.src = url + '?v=' + Date.now();
    }
    loadLayer('data/terrain-paint-1.png', paintData1, paintTex1);
    loadLayer('data/terrain-paint-2.png', paintData2, paintTex2);
  }

  function setLayerTexture(layerIndex, texturePath) {
    if (layerIndex < 0 || layerIndex > 3) return;
    texLoader.load(texturePath, function (tex) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = 4;
      if (layerTextures[layerIndex] && layerTextures[layerIndex] !== tex) {
        layerTextures[layerIndex].dispose();
      }
      layerTextures[layerIndex] = tex;
      if (sharedMat && sharedMat.userData && sharedMat.userData.shader) {
        var un = sharedMat.userData.shader.uniforms['uTex' + layerIndex];
        if (un) un.value = tex;
      }
      console.log('[Terrain] Слой ' + layerIndex + ' обновлен на: ' + texturePath);
    });
  }

  function TD() { return window.TerrainData; }

  // ------------------------------------------------------------------ height
  function heightAtRaw(x, z) {
    var d = TD();
    if (!d || !d.bakedHeights) return SEA;
    var minX = d.minX, maxX = d.maxX, minZ = d.minZ, maxZ = d.maxZ;
    if (x < minX || x > maxX || z < minZ || z > maxZ) return SEA - 5.0;
    var fx = (x - minX) / (maxX - minX) * (d.bakedW - 1);
    var fz = (z - minZ) / (maxZ - minZ) * (d.bakedH - 1);
    var ix = Math.floor(fx), iz = Math.floor(fz);
    ix = Math.max(0, Math.min(d.bakedW - 2, ix));
    iz = Math.max(0, Math.min(d.bakedH - 2, iz));
    var tx = fx - ix, tz = fz - iz, bw = d.bakedW;
    return d.bakedHeights[iz * bw + ix] * (1 - tx) * (1 - tz)
      + d.bakedHeights[iz * bw + ix + 1] * tx * (1 - tz)
      + d.bakedHeights[(iz + 1) * bw + ix] * (1 - tx) * tz
      + d.bakedHeights[(iz + 1) * bw + ix + 1] * tx * tz;
  }
  function heightAt(x, z) { return heightAtRaw(x, z); }
  function groundH(x, z) { return heightAtRaw(x, z); }
  function slopeAt(x, z) {
    var e = 2.5;
    return Math.min(1.0, Math.hypot(
      heightAt(x + e, z) - heightAt(x - e, z),
      heightAt(x, z + e) - heightAt(x, z - e)
    ) / (2 * e));
  }
  function heightAtMax(x, z, radius) {
    var e = radius == null ? 2.5 : radius;
    var h = heightAtRaw(x, z);
    var d = e * 0.7071;
    h = Math.max(h, heightAtRaw(x + e, z), heightAtRaw(x - e, z));
    h = Math.max(h, heightAtRaw(x, z + e), heightAtRaw(x, z - e));
    h = Math.max(h, heightAtRaw(x + d, z + d), heightAtRaw(x - d, z - d));
    h = Math.max(h, heightAtRaw(x + d, z - d), heightAtRaw(x - d, z + d));
    return h;
  }

  // ---- L2-style mesh height (визуальная поверхность меша, а не грубый bake) ----
  //  Было: 5 лучей THREE.Raycaster по мешам 3×3 живых секторов. Raycaster не
  //  умеет ни BVH, ни сетку — он линейно перебирает весь index-буфер меша, то
  //  есть ~7 200 треугольников на луч и ~36 000 тестов луч-треугольник на один
  //  standY. А standY зовётся каждый кадр на игрока и (через
  //  net-ws._remoteGroundSample) на каждого соседа в 35 м.
  //  Стало: те же треугольники TerrainData, но разложенные по сетке XZ в
  //  terrain-height.js — кандидатов ~6 вместо 7 200, результат совпадает бит в
  //  бит (tests/terrain-height.test.js).
  /** Один вертикальный «луч» сверху вниз → Y поверхности меша (или null). */
  function meshGroundY(x, z) {
    var TH = window.TerrainHeight;
    // Модуль не загрузился — standY уйдёт на bake-ветку, как при ray miss.
    if (!TH) return null;
    var bake = heightAtRaw(x, z);
    // Те же начало и длина луча, что у прежнего Raycaster: старт над bake и выше
    // пиков, far покрывает лощины. Дно океана ниже -200 остаётся недостижимым —
    // там по-прежнему работает bake-ветка standY.
    return TH.groundY(x, z, Math.max(bake + 120, 200), Math.max(bake + 200, 400));
  }

  /**
   * L2: несколько лучей под «ступнями» → max Y (на склоне опора на верхнюю точку).
   * Не уходит в текстуру на холмах; не парит (меш = правда).
   * Кэша «последний результат в радиусе 0.2 м» больше нет: он существовал только
   * из-за цены лучей и давал ступеньку по Y при медленном шаге.
   */
  function heightAtMesh(x, z) {
    var r = 0.55;
    var best = meshGroundY(x, z);
    var hy;
    hy = meshGroundY(x + r, z); if (hy != null && (best == null || hy > best)) best = hy;
    hy = meshGroundY(x - r, z); if (hy != null && (best == null || hy > best)) best = hy;
    hy = meshGroundY(x, z + r); if (hy != null && (best == null || hy > best)) best = hy;
    hy = meshGroundY(x, z - r); if (hy != null && (best == null || hy > best)) best = hy;
    return best;
  }

  /**
   * Y стояния (L2-style):
   *  1) точная поверхность меша через TerrainHeight (совпадает с картинкой)
   *  2) fallback bake bilinear + лёгкий lift — там, где меша нет (дыра, дно океана)
   * Сервер: только x,z; Y считает каждый клиент одинаково. Раньше «одинаково»
   * было неправдой: высота бралась только из стримнутых секторов, а радиус
   * стрима игрок настраивает сам (1..4). Индекс TerrainHeight покрывает весь мир.
   */
  var PLAYER_FOOT = 0.95;
  function standY(x, z) {
    var meshH = heightAtMesh(x, z);
    var bakeH = heightAtRaw(x, z);
    var gh, boost = 0;
    if (meshH != null && isFinite(meshH)) {
      // меш = визуальная поверхность; tiny epsilon против z-fight в текстуру
      gh = meshH + 0.04;
    } else {
      // под точкой нет треугольника (дыра меша / дно океана глубже far) → bake
      var mx = heightAtMax(x, z, 2.4);
      var lift = Math.max(0, mx - bakeH);
      gh = bakeH + Math.min(0.55, lift * 0.4);
      var slope = slopeAt(x, z);
      boost = Math.min(0.4, slope * 0.6);
    }
    return {
      ground: gh,
      boost: boost,
      y: PLAYER_FOOT + gh + boost,
      shadowY: gh + 0.025
    };
  }
  function isSolidLand(x, z) {
    var d = TD();
    if (!d || !d.bakedHeights) return false;
    if (x < d.minX || x > d.maxX || z < d.minZ || z > d.maxZ) return false;
    var h = heightAtRaw(x, z);
    if (d.minY != null && h <= d.minY + 2.0) return false;
    return h >= SEA - 0.5;
  }

  // ------------------------------------------------------------------ shore spatial hash (P2)
  function shoreCellKey(cx, cz) { return cx + ':' + cz; }
  function worldToShoreCell(x, z) {
    return {
      cx: Math.floor(x / SHORE_CELL),
      cz: Math.floor(z / SHORE_CELL)
    };
  }
  function insertShoreWall(w) {
    shoreWalls.push(w);
    var minX = Math.min(w.x0, w.x1), maxX = Math.max(w.x0, w.x1);
    var minZ = Math.min(w.z0, w.z1), maxZ = Math.max(w.z0, w.z1);
    var c0 = worldToShoreCell(minX, minZ);
    var c1 = worldToShoreCell(maxX, maxZ);
    var cx, cz, k, arr;
    for (cx = c0.cx; cx <= c1.cx; cx++) {
      for (cz = c0.cz; cz <= c1.cz; cz++) {
        k = shoreCellKey(cx, cz);
        arr = shoreHash.get(k);
        if (!arr) { arr = []; shoreHash.set(k, arr); }
        arr.push(w);
      }
    }
  }
  function buildShoreWalls() {
    shoreWalls = [];
    shoreHash = new Map();
    var d = TD();
    if (!d || !d.bakedHeights) return;
    var minX = d.minX, maxX = d.maxX, minZ = d.minZ, maxZ = d.maxZ;
    var step = SHORE_STEP, x, z, a, b;
    for (z = minZ; z < maxZ; z += step) {
      for (x = minX; x < maxX; x += step) {
        a = isSolidLand(x, z);
        b = isSolidLand(x + step, z);
        if (a !== b) insertShoreWall({
          x0: x + step * 0.5, z0: z, x1: x + step * 0.5, z1: z + step
        });
        b = isSolidLand(x, z + step);
        if (a !== b) insertShoreWall({
          x0: x, z0: z + step * 0.5, x1: x + step, z1: z + step * 0.5
        });
      }
    }
    console.log('[Terrain] shore barriers:', shoreWalls.length, '| hash cells', shoreHash.size, '| cell', SHORE_CELL + 'm');
  }
  function hitsShoreBarrier(ax, az, bx, bz) {
    var minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    var minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    // pad one cell — сегмент на границе
    var c0 = worldToShoreCell(minX - 1, minZ - 1);
    var c1 = worldToShoreCell(maxX + 1, maxZ + 1);
    var cx, cz, k, list, i, w, dax = bx - ax, daz = bz - az, dbx, dbz, den, t, u;
    for (cx = c0.cx; cx <= c1.cx; cx++) {
      for (cz = c0.cz; cz <= c1.cz; cz++) {
        k = shoreCellKey(cx, cz);
        list = shoreHash.get(k);
        if (!list) continue;
        for (i = 0; i < list.length; i++) {
          w = list[i];
          // дедуп если wall в нескольких cells — дешёвый skip по identity
          if (w._tag == null) w._tag = 0;
          dbx = w.x1 - w.x0; dbz = w.z1 - w.z0;
          den = dax * dbz - daz * dbx;
          if (Math.abs(den) < 1e-9) continue;
          t = ((w.x0 - ax) * dbz - (w.z0 - az) * dbx) / den;
          u = ((w.x0 - ax) * daz - (w.z0 - az) * dax) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
        }
      }
    }
    return false;
  }
  function canWalkAt(x, z) {
    var d = TD();
    if (!d || !d.bakedHeights) return true;
    if (x < d.minX || x > d.maxX || z < d.minZ || z > d.maxZ) return false;
    var h = heightAtRaw(x, z);
    if (d.minY != null && h <= d.minY + 2.0) return false;
    return h >= SEA - 0.5;
  }
  function hitsOcean(ax, az, bx, bz) {
    return !canWalkAt(bx, bz) || !canWalkAt((ax + bx) * 0.5, (az + bz) * 0.5);
  }

  // ------------------------------------------------------------------ UV / sector index
  function worldToSector(x, z) {
    var d = TD();
    var col = Math.floor((x - d.minX) / (d.maxX - d.minX) * GRID_SIZE);
    var row = Math.floor((z - d.minZ) / (d.maxZ - d.minZ) * GRID_SIZE);
    col = Math.max(0, Math.min(GRID_SIZE - 1, col));
    row = Math.max(0, Math.min(GRID_SIZE - 1, row));
    return { col: col, row: row, key: col + '_' + row };
  }
  function getGlobalUv(vi) {
    var d = TD();
    var uvs = d.uvs;
    if (uvs && uvs.length >= (vi + 1) * 2) return { u: uvs[vi * 2], v: uvs[vi * 2 + 1] };
    var x = d.positions[vi * 3], z = d.positions[vi * 3 + 2];
    return {
      u: (x - d.minX) / (d.maxX - d.minX),
      v: 1.0 - (z - d.minZ) / (d.maxZ - d.minZ)
    };
  }
  /** Local 0..1 UV inside sector (for T_* tile maps). Slight inset reduces edge bleed. */
  function getLocalUv(vi, col, row) {
    var g = getGlobalUv(vi);
    var u = g.u * GRID_SIZE - col;
    var v = g.v * GRID_SIZE - row;
    var inset = 0.002;
    u = inset + Math.max(0, Math.min(1, u)) * (1 - 2 * inset);
    v = inset + Math.max(0, Math.min(1, v)) * (1 - 2 * inset);
    return { u: u, v: v };
  }

  function computeFullNormals() {
    var d = TD();
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
    var idx = d.indices;
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
    fullNormals = new Float32Array(g.attributes.normal.array);
    g.dispose();
  }

  /**
   * P2 lazy: только список original tri verts + centroid sector.
   * Тяжёлые pos/uv/nrm/idx — при ensureSectorLoaded.
   */
  function buildSectorIndex() {
    var d = TD();
    if (!fullNormals) computeFullNormals();
    var pos = d.positions, idx = d.indices;
    var buckets = {};
    var col, row, key;
    for (col = 0; col < GRID_SIZE; col++) {
      for (row = 0; row < GRID_SIZE; row++) {
        key = col + '_' + row;
        buckets[key] = { col: col, row: row, key: key, tris: [], cx: 0, cz: 0, nSample: 0 };
      }
    }
    var t, i0, i1, i2, cx, cz, s, b;
    for (t = 0; t < idx.length; t += 3) {
      i0 = idx[t]; i1 = idx[t + 1]; i2 = idx[t + 2];
      cx = (pos[i0 * 3] + pos[i1 * 3] + pos[i2 * 3]) / 3;
      cz = (pos[i0 * 3 + 2] + pos[i1 * 3 + 2] + pos[i2 * 3 + 2]) / 3;
      s = worldToSector(cx, cz);
      b = buckets[s.key];
      b.tris.push(i0, i1, i2);
      b.cx += cx; b.cz += cz; b.nSample++;
    }
    var list = [];
    for (key in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, key)) continue;
      b = buckets[key];
      if (!b.tris.length) continue;
      if (b.nSample) { b.cx /= b.nSample; b.cz /= b.nSample; }
      list.push({
        col: b.col,
        row: b.row,
        key: b.key,
        tris: b.tris, // plain array of original vi, length%3==0 — materialized later
        triCount: (b.tris.length / 3) | 0,
        cx: b.cx,
        cz: b.cz,
        geoCache: null // filled on first load, cleared on unload if LAZY_DROP_CPU
      });
    }
    return list;
  }

  /** Single-winding skirt: edge drop below sea so island/stream cuts disappear into water. */
  function appendSkirts(bucket) {
    var edgeCount = {};
    var i, a, b, k, e, ia, ib, niA, niB, yA, yB, yBotA, yBotB;
    var idx = bucket.idx;
    var seaBot = SEA - SKIRT_BELOW_SEA;
    for (i = 0; i < idx.length; i += 3) {
      var t0 = idx[i], t1 = idx[i + 1], t2 = idx[i + 2];
      var edges = [[t0, t1], [t1, t2], [t2, t0]];
      for (e = 0; e < 3; e++) {
        a = edges[e][0]; b = edges[e][1];
        k = a < b ? a + '_' + b : b + '_' + a;
        if (!edgeCount[k]) edgeCount[k] = { a: a, b: b, n: 0, dirA: a, dirB: b };
        edgeCount[k].n++;
        // keep first-seen winding for outward-ish skirt
        if (edgeCount[k].n === 1) { edgeCount[k].dirA = a; edgeCount[k].dirB = b; }
      }
    }
    for (k in edgeCount) {
      if (!Object.prototype.hasOwnProperty.call(edgeCount, k)) continue;
      e = edgeCount[k];
      if (e.n !== 1) continue;
      ia = e.dirA; ib = e.dirB;
      niA = bucket.next++;
      niB = bucket.next++;
      yA = bucket.pos[ia * 3 + 1];
      yB = bucket.pos[ib * 3 + 1];
      // drop deep enough: max(depth under vertex, below sea)
      yBotA = Math.min(yA - SKIRT_DEPTH, seaBot);
      yBotB = Math.min(yB - SKIRT_DEPTH, seaBot);
      bucket.pos.push(
        bucket.pos[ia * 3], yBotA, bucket.pos[ia * 3 + 2],
        bucket.pos[ib * 3], yBotB, bucket.pos[ib * 3 + 2]
      );
      bucket.uv.push(
        bucket.uv[ia * 2], bucket.uv[ia * 2 + 1],
        bucket.uv[ib * 2], bucket.uv[ib * 2 + 1]
      );
      // slightly outward-down normal so lighting doesn’t flash
      bucket.nrm.push(0, -0.35, 0, 0, -0.35, 0);
      // один winding (ia→ib→bottom). FrontSide; crack закрыт вертикальной стенкой
      bucket.idx.push(ia, ib, niB, ia, niB, niA);
    }
  }

  /**
   * Materialize CPU geometry for a sector (lazy).
   * Cached on def.geoCache so re-load after unload is cheap.
   */
  function materializeSectorGeo(def) {
    if (def.geoCache) return def.geoCache;
    var d = TD();
    var pos = d.positions;
    var useLocalUv = (effectivePaintMode() === 'tiles');
    var bucket = { pos: [], uv: [], nrm: [], idx: [], map: {}, next: 0 };
    function addVert(vi) {
      if (bucket.map[vi] !== undefined) return bucket.map[vi];
      var ni = bucket.next++;
      bucket.map[vi] = ni;
      bucket.pos.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]);
      var uvo = useLocalUv ? getLocalUv(vi, def.col, def.row) : getGlobalUv(vi);
      bucket.uv.push(uvo.u, uvo.v);
      if (fullNormals) {
        bucket.nrm.push(fullNormals[vi * 3], fullNormals[vi * 3 + 1], fullNormals[vi * 3 + 2]);
      } else {
        bucket.nrm.push(0, 1, 0);
      }
      return ni;
    }
    var tris = def.tris, i;
    for (i = 0; i < tris.length; i += 3) {
      bucket.idx.push(addVert(tris[i]), addVert(tris[i + 1]), addVert(tris[i + 2]));
    }
    appendSkirts(bucket);
    def.geoCache = {
      pos: new Float32Array(bucket.pos),
      uv: new Float32Array(bucket.uv),
      nrm: new Float32Array(bucket.nrm),
      idx: bucket.next > 65535 ? new Uint32Array(bucket.idx) : new Uint16Array(bucket.idx),
      triCount: (bucket.idx.length / 3) | 0
    };
    // free raw tri list? keep for rebuild if cache dropped
    return def.geoCache;
  }

  function effectivePaintMode() {
    if (PAINT_MODE === 'tiles' && GRID_SIZE === TILE_GRID) return 'tiles';
    return 'atlas';
  }

  // ------------------------------------------------------------------ P3 tile texture stream
  function tileUrl(col, row) {
    var rel = 'tiles/T_' + col + '_' + row + '.webp';
    return window.texUrl ? window.texUrl(rel) : [
      'data/textures/' + rel,
      'client/data/textures/' + rel
    ];
  }
  function loadImageTexture(paths, prep, onDone) {
    var idx = 0;
    var dummy = document.createElement('canvas');
    dummy.width = 1; dummy.height = 1;
    var tex = new THREE.Texture(dummy);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (prep) prep(tex);
    tex.needsUpdate = false;
    function fail() {
      if (onDone) onDone(null);
    }
    function tryNext() {
      if (idx >= paths.length) { fail(); return; }
      var url = paths[idx];
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (!img.naturalWidth) { idx++; tryNext(); return; }
        tex.image = img;
        tex.userData.src = url;
        if (prep) prep(tex);
        tex.needsUpdate = true;
        if (onDone) onDone(tex);
      };
      img.onerror = function () { idx++; tryNext(); };
      img.src = url;
    }
    tryNext();
    return tex;
  }
  function prepTileMap(t) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.flipY = true;
    return t;
  }
  function prepAtlas(t) {
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.flipY = true;
    return t;
  }
  function prepDetail(t) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    t.flipY = true;
    return t;
  }

  function bindMaterialShader(mat, mapTex, details) {
    mat.map = mapTex;
    mat.envMap = null;
    if (mat.roughness != null) mat.roughness = 1.0;
    if (mat.metalness != null) mat.metalness = 0.0;
    if (mat.envMapIntensity != null) mat.envMapIntensity = 0.0;
    mat.side = THREE.FrontSide;
    if (mat.specular != null) mat.specular = new THREE.Color(0x000000);
    if (mat.shininess != null) mat.shininess = 0;

    mat.onBeforeCompile = function (shader) {
      initPaintCanvas();
      shader.uniforms.uTexGrass = { value: details.grass };
      shader.uniforms.uTexLava  = { value: details.lava };
      shader.uniforms.uTexSwamp = { value: details.swamp };
      shader.uniforms.uTexDirt  = { value: details.dirt };
      shader.uniforms.uTexRock  = { value: details.rock };
      shader.uniforms.uTexSand  = { value: details.sand };

      shader.uniforms.uTex0 = { value: layerTextures[0] || details.road || details.dirt };
      shader.uniforms.uTex1 = { value: layerTextures[1] || details.lawn || details.grass };
      shader.uniforms.uTex2 = { value: layerTextures[2] || details.dirt };
      shader.uniforms.uTex3 = { value: layerTextures[3] || details.sand };
      shader.uniforms.uLayerTiling = { value: uLayerTilingVec };

      shader.uniforms.uPaintMap1 = { value: paintTex1 };
      shader.uniforms.uPaintMap2 = { value: paintTex2 };
      shader.uniforms.uTiling   = { value: DETAIL_TILING };
      shader.uniforms.uTime     = { value: 0.0 };
      mat.userData.shader = shader;

      shader.fragmentShader = `
        uniform sampler2D uTexGrass;
        uniform sampler2D uTexLava;
        uniform sampler2D uTexSwamp;
        uniform sampler2D uTexDirt;
        uniform sampler2D uTexRock;
        uniform sampler2D uTexSand;
        uniform sampler2D uTex0;
        uniform sampler2D uTex1;
        uniform sampler2D uTex2;
        uniform sampler2D uTex3;
        uniform sampler2D uPaintMap1;
        uniform sampler2D uPaintMap2;
        uniform vec4 uLayerTiling;
        uniform float uTiling;
        uniform float uTime;
      ` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `
        #ifdef USE_MAP
        vec4 sampledColor = texture2D( map, vMapUv );
        vec3 baseCol = sampledColor.rgb;
        vec2 tileUv = vMapUv * uTiling;

        vec2 lavaUv  = tileUv + vec2(sin(uTime * 0.5 + tileUv.y * 2.0) * 0.03, uTime * 0.04);
        vec2 swampUv = tileUv + vec2(cos(uTime * 0.4 + tileUv.x * 2.0) * 0.02, sin(uTime * 0.3) * 0.02);

        vec3 colGrass = texture2D(uTexGrass, tileUv).rgb;
        vec3 colLava  = texture2D(uTexLava,  lavaUv).rgb;
        vec3 colSwamp = texture2D(uTexSwamp, swampUv).rgb;
        vec3 colDirt  = texture2D(uTexDirt,  tileUv).rgb;
        vec3 colRock  = texture2D(uTexRock,  tileUv).rgb;
        vec3 colSand  = texture2D(uTexSand,  tileUv).rgb;

        float r = baseCol.r;
        float g = baseCol.g;
        float b = baseCol.b;

        float wLava = smoothstep(0.10, 0.40, r - max(g, b) * 1.1);
        float wSwamp = smoothstep(0.10, 0.40, g - max(r, b) * 1.1);
        float wDirt = smoothstep(0.04, 0.22, (r + g) * 0.5 - b) * (1.0 - wLava) * (1.0 - wSwamp);
        float maxDiff = max(abs(r - g), max(abs(g - b), abs(r - b)));
        float wRock = (1.0 - smoothstep(0.04, 0.22, maxDiff)) * smoothstep(0.1, 0.6, (r + g + b) / 3.0)
              * (1.0 - wLava) * (1.0 - wSwamp);
        float wGrass = max(0.0, g * 1.2 - r * 0.8) * (1.0 - wLava) * (1.0 - wSwamp) * (1.0 - wDirt);
        float wSand = max(0.0, 1.0 - (wLava + wSwamp + wDirt + wRock + wGrass));

        float totalW = wLava + wSwamp + wDirt + wRock + wGrass + wSand + 0.0001;
        wLava /= totalW; wSwamp /= totalW; wDirt /= totalW;
        wRock /= totalW; wGrass /= totalW; wSand /= totalW;

        vec3 detailCol = colLava * wLava + colSwamp * wSwamp + colDirt * wDirt
                       + colRock * wRock + colGrass * wGrass + colSand * wSand;

        // lift albedo — matte + dark paint иначе полдень «в грязи»
        diffuseColor.rgb = clamp(baseCol * (detailCol * 1.55) + vec3(0.04), 0.0, 1.0);

        float lavaPulse  = 0.85 + 0.35 * sin(uTime * 2.5 + tileUv.x * 4.0 + tileUv.y * 3.0);
        float swampPulse = 0.85 + 0.35 * cos(uTime * 2.0 - tileUv.x * 3.0 + tileUv.y * 4.0);
        diffuseColor.rgb += vec3(1.1, 0.38, 0.04) * wLava * smoothstep(0.30, 0.85, colLava.r) * (1.6 * lavaPulse);
        diffuseColor.rgb += vec3(0.04, 1.1, 0.20) * wSwamp * smoothstep(0.30, 0.85, colSwamp.g) * (1.6 * swampPulse);

        // ---- 4-Layer Dynamic GPU Splatmap with Per-Stroke Custom Tiling & 2K Sharpness ----
        vec4 p1 = texture2D(uPaintMap1, vMapUv);
        float w0 = p1.r;
        float w1 = p1.g;
        float w2 = p1.b;
        float w3 = p1.a;
        float totalPaint = w0 + w1 + w2 + w3;

        if (totalPaint > 0.001) {
          vec4 p2 = texture2D(uPaintMap2, vMapUv);
          float t0 = p2.r > 0.002 ? (10.0 + p2.r * 1190.0) : uLayerTiling.x;
          float t1 = p2.g > 0.002 ? (10.0 + p2.g * 1190.0) : uLayerTiling.y;
          float t2 = p2.b > 0.002 ? (10.0 + p2.b * 1190.0) : uLayerTiling.z;
          float t3 = p2.a > 0.002 ? (10.0 + p2.a * 1190.0) : uLayerTiling.w;

          vec3 c0 = texture2D(uTex0, vMapUv * t0).rgb;
          vec3 c1 = texture2D(uTex1, vMapUv * t1).rgb;
          vec3 c2 = texture2D(uTex2, vMapUv * t2).rgb;
          vec3 c3 = texture2D(uTex3, vMapUv * t3).rgb;

          vec3 paintedCol = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / totalPaint;
          float blendFactor = clamp(totalPaint, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, clamp(paintedCol * 1.35 + vec3(0.03), 0.0, 1.0), blendFactor);
        }
        #endif
        `
      );

      if (shader.fragmentShader.indexOf('totalSpecular') !== -1) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <lights_fragment_end>',
          `
          totalSpecular *= 0.0;
          #include <lights_fragment_end>
          `
        );
      }
    };
    mat.customProgramCacheKey = function () {
      return 'l2_matte_v8_baked_paint';
    };
  }

  function createOriginalMaterial(mapTex, details) {
    // Lambert = чистый diffuse как L2-земля (Standard даёт Fresnel/блики)
    var mat = new THREE.MeshLambertMaterial({
      map: mapTex,
      color: 0xffffff,
      side: THREE.FrontSide
    });
    bindMaterialShader(mat, mapTex, details);
    return mat;
  }

  function loadSharedDetails() {
    function tile(n256, full) {
      var paths = window.texUrl
        ? window.texUrl(['detail256/' + n256, full])
        : [
          'data/textures/detail256/' + n256,
          'client/data/textures/detail256/' + n256,
          'data/textures/' + full,
          'client/data/textures/' + full
        ];
      return loadImageTexture(paths, prepDetail);
    }

    return {
      grass: tile('grass_256.webp', '020_Dense_Green_grass_BaseColor.webp'),
      lawn:  tile('grass_256.webp', '020_Dense_Green_grass_BaseColor.webp'),
      lava:  tile('lava_256.webp', 'lava ground_BaseColor.webp'),
      swamp: tile('swamp_256.webp', 'Astreoid Glowing Lava Green Rock_BaseColor.webp'),
      dirt:  tile('dirt_256.webp', 'Forest_Floor_vktfeilaw_1K_BaseColor.webp'),
      rock:  tile('rock_256.webp', 'Layered_Rock_Cliff_thfkchjs_1K_BaseColor.webp'),
      sand:  tile('sand_256.webp', 'sand_tidewrack.webp'),
      road:  tile('road_256.webp', 'town_cobblestone.webp'),
      plaza: tile('road_256.webp', 'town_cobblestone.webp')
    };
  }

  // ------------------------------------------------------------------ stream load/unload
  function ensureSectorLoaded(def) {
    if (sectorLive.has(def.key)) return sectorLive.get(def.key);

    var cache = materializeSectorGeo(def);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cache.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(cache.uv, 2));
    geo.setAttribute('normal', new THREE.BufferAttribute(cache.nrm, 3));
    geo.setIndex(new THREE.BufferAttribute(cache.idx, 1));
    geo.computeBoundingSphere();

    var mat = sharedMat;
    var ownMap = null;
    var mode = effectivePaintMode();
    if (mode === 'tiles') {
      // P3: stream T_* per sector (own mat + map, dispose on unload)
      ownMap = loadImageTexture(tileUrl(def.col, def.row), prepTileMap);
      mat = createOriginalMaterial(ownMap, sharedDetails);
    }

    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'TerrainSector_T_' + def.col + '_' + def.row;
    mesh.userData.editorKey = 'terrain_ground';
    mesh.userData.sector = { col: def.col, row: def.row, key: def.key };
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.frustumCulled = true;
    rootGroup.add(mesh);

    var live = { mesh: mesh, geo: geo, def: def, mat: mat, ownMap: ownMap, ownMat: mode === 'tiles' };
    sectorLive.set(def.key, live);
    if (!groundMesh) groundMesh = mesh;
    streamStats.loads++;
    return live;
  }

  function unloadSector(key) {
    var live = sectorLive.get(key);
    if (!live) return;
    rootGroup.remove(live.mesh);
    if (live.geo) live.geo.dispose();
    // tile-mode: dispose per-sector GPU texture + mat
    if (live.ownMat) {
      if (live.ownMap) live.ownMap.dispose();
      if (live.mat && live.mat !== sharedMat) live.mat.dispose();
    }
    // P2: optionally drop CPU cache to save RAM (rebuild on re-enter)
    // keep geoCache — re-load is free; tris list is small
    sectorLive.delete(key);
    streamStats.unloads++;
    if (groundMesh === live.mesh) {
      groundMesh = null;
      sectorLive.forEach(function (L) { if (!groundMesh) groundMesh = L.mesh; });
    }
  }

  function updateStreaming(px, pz) {
    if (!sectorDefs.length) return;
    var isEd = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
    if (isEd) {
      for (var sIdx = 0; sIdx < sectorDefs.length; sIdx++) {
        if (!sectorLive.has(sectorDefs[sIdx].key)) {
          ensureSectorLoaded(sectorDefs[sIdx]);
        }
      }
      return;
    }
    var s = worldToSector(px, pz);
    var key = s.col + ',' + s.row + ',r' + STREAM_RADIUS;
    if (key === lastStreamKey) return;
    lastStreamKey = key;

    var want = {}, i, def, d, loaded = 0;
    for (i = 0; i < sectorDefs.length; i++) {
      def = sectorDefs[i];
      d = Math.max(Math.abs(def.col - s.col), Math.abs(def.row - s.row));
      if (d <= STREAM_RADIUS) {
        want[def.key] = true;
        if (!sectorLive.has(def.key)) {
          ensureSectorLoaded(def);
          loaded++;
        }
      }
    }
    var drop = [];
    sectorLive.forEach(function (live, k) { if (!want[k]) drop.push(k); });
    for (i = 0; i < drop.length; i++) unloadSector(drop[i]);

    streamStats.lastLive = sectorLive.size;
    if (streamLogOn() && (loaded > 0 || drop.length > 0)) {
      var liveTris = 0;
      sectorLive.forEach(function (L) {
        liveTris += (L.def.geoCache ? L.def.geoCache.triCount : L.def.triCount);
      });
      console.log(
        '[Terrain] stream',
        'live', sectorLive.size + '/' + sectorDefs.length,
        '| cell', s.col + '_' + s.row,
        '| +' + loaded, '-'+ drop.length,
        '| liveTris~', liveTris,
        '| loads', streamStats.loads, 'unloads', streamStats.unloads
      );
    }
  }

  // ------------------------------------------------------------------ fireflies
  function buildFireflies(scene) {
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      var d = TD();
      if (!d) return;
      var canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 512, 512);
      var data = ctx.getImageData(0, 0, 512, 512).data;
      var pts = [], px, py, i, r, g, b;
      for (py = 0; py < 512; py++) {
        for (px = 0; px < 512; px++) {
          i = (py * 512 + px) * 4;
          r = data[i]; g = data[i + 1]; b = data[i + 2];
          if (g > 60 && g - Math.max(r, b) > 20 && Math.random() < 0.3) {
            pts.push({
              x: d.minX + (px / 511) * (d.maxX - d.minX),
              z: d.minZ + (py / 511) * (d.maxZ - d.minZ)
            });
          }
        }
      }
      if (!pts.length) return;
      fireflyCount = Math.min(180, pts.length);
      var geo = new THREE.BufferGeometry();
      var arr = new Float32Array(fireflyCount * 3);
      for (i = 0; i < fireflyCount; i++) {
        var p = pts[Math.floor(Math.random() * pts.length)];
        var y = heightAt(p.x, p.z) + 0.5 + Math.random() * 2.5;
        arr[i * 3] = p.x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = p.z;
        fireflyBasePos.push({ x: p.x, y: y, z: p.z, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 0.8 });
      }
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      var c = document.createElement('canvas'); c.width = c.height = 32;
      var cx = c.getContext('2d');
      var gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(180,255,200,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
      fireflyPoints = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 3.5, map: new THREE.CanvasTexture(c), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false, color: 0x88ffaa, opacity: 0.85
      }));
      scene.add(fireflyPoints);
    };
    var lightPaths = window.texUrl
      ? window.texUrl('terr_light.webp')
      : ['data/textures/terr_light.webp', 'client/data/textures/terr_light.webp'];
    var li = 0;
    img.onerror = function () {
      if (li < lightPaths.length) img.src = lightPaths[li++];
    };
    img.src = lightPaths[li++];
  }

  function syncWorldBounds() {
    var d = TD();
    if (!d || !window.WorldMetrics || !window.WorldMetrics.applyBounds) return;
    window.WorldMetrics.applyBounds({
      minX: d.minX, maxX: d.maxX,
      minZ: d.minZ, maxZ: d.maxZ,
      sea: SEA
    });
  }

  // ------------------------------------------------------------------ build
  function buildGround(scene) {
    var d = TD();
    if (!d) {
      console.warn('[Terrain] TerrainData missing');
      return;
    }
    syncWorldBounds();

    sharedDetails = loadSharedDetails();

    if (USE_SPLAT_WEIGHTS) {
      splatTex = loadImageTexture(
        window.texUrl ? window.texUrl('splat_weights.webp') : [
          'data/textures/splat_weights.webp',
          'client/data/textures/splat_weights.webp'
        ],
        prepAtlas
      );
    }

    atlasMapTex = loadImageTexture(
      window.texUrl ? window.texUrl('terr_light.webp') : [
        'data/textures/terr_light.webp',
        'client/data/textures/terr_light.webp'
      ],
      prepAtlas
    );

    sharedMat = createOriginalMaterial(atlasMapTex, sharedDetails);

    rootGroup = new THREE.Group();
    rootGroup.name = 'TerrainGround';
    rootGroup.userData = {
      editorKey: 'terrain_ground',
      editorLabel: 'Террейн L2 stream 8×8',
      editorBind: { x: 0, y: 0, z: 0, sx: 1, sy: 1, sz: 1 },
      isTerrainRoot: true
    };
    scene.add(rootGroup);

    sectorLive.clear();
    lastStreamKey = '';
    groundMesh = null;
    streamStats = { loads: 0, unloads: 0, lastLive: 0 };

    sectorDefs = buildSectorIndex();

    var spawn = (window.WorldMetrics && window.WorldMetrics.getPlayerSpawn)
      ? window.WorldMetrics.getPlayerSpawn()
      : null;
    if (!spawn) spawn = { x: (d.minX + d.maxX) * 0.5, z: (d.minZ + d.maxZ) * 0.5 };
    updateStreaming(spawn.x, spawn.z);
    if (sectorLive.size === 0) {
      for (var i = 0; i < sectorDefs.length; i++) ensureSectorLoaded(sectorDefs[i]);
    }

    buildFireflies(scene);

    var totalTrisIdx = 0;
    for (i = 0; i < sectorDefs.length; i++) totalTrisIdx += sectorDefs[i].triCount;
    var liveTris = 0;
    sectorLive.forEach(function (L) {
      liveTris += L.def.geoCache ? L.def.geoCache.triCount : L.def.triCount;
    });

    console.log(
      '[Terrain] L2 P1/P2/P3',
      GRID_SIZE + '×' + GRID_SIZE,
      '| r=' + STREAM_RADIUS,
      '| paint=' + effectivePaintMode(),
      (PAINT_MODE === 'tiles' && effectivePaintMode() !== 'tiles' ? '(tiles→atlas GRID≠' + TILE_GRID + ')' : ''),
      '| defs', sectorDefs.length,
      '| live', sectorLive.size + '/' + sectorDefs.length,
      '| liveTris', liveTris,
      '| idxTris', totalTrisIdx,
      '| splat', USE_SPLAT_WEIGHTS,
      '| SEA', SEA
    );
  }

  function build(scene) {
    buildGround(scene);
    buildShoreWalls();
    // Индекс высот меша — до первого кадра: сборка ~40 мс, и на первом кадре
    // после входа в мир она была бы видна как рывок.
    if (window.TerrainHeight && window.TerrainHeight.prewarm()) {
      var hs = window.TerrainHeight.stats();
      console.log('[Terrain] height index:', hs.tris, 'тр →', hs.usedCells, 'ячеек по',
        window.TerrainHeight.CELL_SIZE + 'м,', hs.perCell.toFixed(1), 'тр/ячейка,',
        (hs.bytes / 1048576).toFixed(2) + ' МБ');
    }
  }

  function update(t) {
    // update time on all live shaders (shared + tile mats)
    if (sharedMat && sharedMat.userData && sharedMat.userData.shader) {
      sharedMat.userData.shader.uniforms.uTime.value = t || 0;
    }
    sectorLive.forEach(function (L) {
      if (L.ownMat && L.mat && L.mat.userData && L.mat.userData.shader) {
        L.mat.userData.shader.uniforms.uTime.value = t || 0;
      }
    });
    var game = window.game;
    var isEd = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
    if (isEd && game && game.camera) {
      updateStreaming(game.camera.position.x, game.camera.position.z);
    } else if (game && game.player && game.player.mesh) {
      updateStreaming(game.player.mesh.position.x, game.player.mesh.position.z);
    }
    if (fireflyPoints && fireflyBasePos.length) {
      var pos = fireflyPoints.geometry.attributes.position.array;
      var i, bp, ph;
      for (i = 0; i < fireflyCount; i++) {
        bp = fireflyBasePos[i];
        if (!bp) continue;
        ph = bp.phase + t * bp.speed;
        pos[i * 3] = bp.x + Math.sin(ph * 0.7) * 3;
        pos[i * 3 + 1] = bp.y + Math.sin(ph * 1.2) * 1.8;
        pos[i * 3 + 2] = bp.z + Math.cos(ph * 0.8) * 3;
      }
      fireflyPoints.geometry.attributes.position.needsUpdate = true;
    }
  }

  window.Terrain = {
    build: build,
    update: update,
    heightAt: heightAt,
    heightAtRaw: heightAtRaw,
    heightAtMax: heightAtMax,
    standY: standY,
    slopeAt: slopeAt,
    PLAYER_FOOT: PLAYER_FOOT,
    hitsShoreBarrier: hitsShoreBarrier,
    canWalkAt: canWalkAt,
    hitsOcean: hitsOcean,
    groundH: groundH,
    updateStreaming: updateStreaming,
    worldToSector: worldToSector,
    syncWorldBounds: syncWorldBounds,
    seaLevel: SEA,
    GRID_SIZE: GRID_SIZE,
    STREAM_RADIUS: STREAM_RADIUS,
    SKIRT_DEPTH: SKIRT_DEPTH,
    SHORE_CELL: SHORE_CELL,
    PAINT_MODE: PAINT_MODE,
    USE_SPLAT_WEIGHTS: USE_SPLAT_WEIGHTS,
    get streamStats() { return streamStats; },
    get W() { var d = TD(); return d ? (d.maxX - d.minX) : 4000; },
    get H() { var d = TD(); return d ? (d.maxZ - d.minZ) : 4000; },
    get MIN_X() { var d = TD(); return d ? d.minX : -2000; },
    get MIN_Z() { var d = TD(); return d ? d.minZ : -2000; },
    get mesh() { return rootGroup; },
    get paintTexture1() { return paintTex1; },
    paintStroke: paintStroke,
    pushUndoSnapshot: pushUndoSnapshot,
    getPaintSnapshot: getPaintSnapshot,
    restorePaintSnapshot: restorePaintSnapshot,
    undo: undoPaint,
    redo: redoPaint,
    canUndo: function () { return undoStack.length > 0; },
    canRedo: function () { return redoStack.length > 0; },
    clearPaintLayer: clearPaintLayer,
    fillPaintLayer: fillPaintLayer,
    savePaintData: scheduleAutoSave,
    scheduleAutoSave: scheduleAutoSave,
    savePaintToServer: savePaintDataToServer,
    loadPaintData: loadSavedPaintData,
    setLayerTexture: setLayerTexture,
    setLayerTiling: setLayerTiling,
    getLayerTiling: getLayerTiling,
    layerTilings: layerTilings,
    DEFAULT_LAYER_PATHS: DEFAULT_LAYER_PATHS,
    get liveCount() { return sectorLive.size; },
    get defCount() { return sectorDefs.length; },
    get shoreWallCount() { return shoreWalls.length; },
    get shoreHashSize() { return shoreHash.size; },
    get streamRadius() { return STREAM_RADIUS; },
    setStreamRadius: function (r) {
      STREAM_RADIUS = Math.max(1, Math.min(4, parseInt(r, 10) || 2));
      try { localStorage.setItem('ps_terrain_stream_radius', String(STREAM_RADIUS)); } catch (e) {}
      lastStreamKey = '';
      if (rootGroup && window.game && window.game.player && window.game.player.mesh) {
        var p = window.game.player.mesh.position;
        updateStreaming(p.x, p.z);
      }
      return STREAM_RADIUS;
    }
  };
})();
