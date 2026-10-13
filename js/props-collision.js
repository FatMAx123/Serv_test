// ============================================================
//  PROPS-COLLISION.JS — Solid obstacle collision system for custom props & buildings
// ============================================================
(function (global) {
  'use strict';

  /** Check if a prop is non-collidable foliage/bush/decor/grass/fern/mushroom/flower */
  function isNonCollidableFoliage(p) {
    if (!p) return true;
    if (p.isWalkableSurface || p.isBridge || p.walkable) return false;
    if (typeof p.modelId === 'string' && /bridge|platform|pier|dock|walkway|catwalk|scaffold|stage/i.test(p.modelId)) return false;
    if (typeof p.id === 'string' && /bridge|platform|pier|dock|walkway|catwalk|scaffold|stage/i.test(p.id)) return false;
    if (p.collision === false || p.hasCollision === false) return true;

    var modelId = String(p.modelId || p.file || p.modelFile || p.id || '').toLowerCase();
    var name = String(p.name || p.nameRu || p.nameEn || '').toLowerCase();
    var cat = String(p.category || '').toLowerCase();

    // Any prop in category 'bushes' or marked isFoliage non-tree has NO collision
    if (cat === 'bushes') return true;

    // Check against PropsLibrary catalog metadata if available
    if (global.PropsLibrary && typeof global.PropsLibrary.getById === 'function') {
      var item = global.PropsLibrary.getById(p.modelId || p.modelFile || p.file || p.id);
      if (item) {
        if (item.category === 'bushes') return true;
        if (item.tags && item.tags.some(function (t) {
          return /куст|цвет|мак|трава|растени|зелень|почвопокровн|bush|flower|poppy|pratia|grass|plant|foliage|fern|mushroom/i.test(t);
        })) return true;
      }
    }

    // 1. All flowers, poppies, pratia, herbs, blooms
    if (/poppy|pratia|flower|poppies|rose|dandelion|clover|chamomile|tulip|daisy|sunflower/i.test(modelId)) return true;
    if (/мак|маки|пратия|цвет|роза|одуванчик|клевер|ромашка|тюльпан|подсолнух/i.test(name)) return true;

    // 2. All bushes, shrubs, ferns, plants, foliage, vines, sprouts
    if (/bush|shrub|fern|plant|foliage|hedge|reed|vine|sprout|branch|leaf|leaves|ivy|blueberry|berry/i.test(modelId)) return true;
    if (/куст|кустарник|папоротник|растени|зелень|поросль|ветк|листв|плющ|тростник|черник|ягод/i.test(name)) return true;

    // 3. All grass, turf, groundcovers, moss, lawns
    if (/grass|groundcover|lawn|turf|moss|weed|field/i.test(modelId)) return true;
    if (/трава|газон|мох|луг|травинка|дёрн|почвопокров/i.test(name)) return true;

    // 4. All mushrooms, fungus, small floor debris
    if (/mushroom|fungus|fungi|toadstool/i.test(modelId)) return true;
    if (/гриб|грибы|трутовик|мухомор|поганка/i.test(name)) return true;
    if (/plank|pieceofwood/i.test(modelId) || /доска|обрубок/i.test(name)) return true;

    // 5. Category forest_decor non-blocking items (only stumps and logs block, small items do not)
    if (cat === 'forest_decor') {
      if (!modelId.startsWith('stump') && !modelId.startsWith('forest_stump') && !modelId.startsWith('log') && !modelId.startsWith('forest_log') && !name.includes('пень') && !name.includes('бревно')) {
        return true;
      }
    }

    // 6. Generic foliage flag check (if marked isFoliage and not a tree, it is non-collidable)
    if (p.isFoliage) {
      var isTree = (
        cat === 'trees' || cat === 'dead_trees' ||
        /tree|spruce|spurce|pine|сосна|ель|дерево|древо|дуб/i.test(modelId) ||
        /tree|spruce|spurce|pine|сосна|ель|дерево|древо|дуб/i.test(name)
      ) && !/bush|куст|flower|цвет|poppy|мак|pratia|пратия|grass|трава/i.test(modelId) && !/bush|куст|flower|цвет|poppy|мак|pratia|пратия|grass|трава/i.test(name);
      if (!isTree) return true;
    }

    return false;
  }

  /** Calculate precise trunk collision radius for tree models */
  function getTreeTrunkRadius(p) {
    var modelId = String(p.modelId || p.file || p.id || '').toLowerCase();
    var name = String(p.name || p.nameRu || p.nameEn || '').toLowerCase();
    var cat = String(p.category || '').toLowerCase();

    // Explicitly exclude any bushes, flowers, grass, poppies, pratia, ferns
    if (cat === 'bushes' || /bush|куст|flower|цвет|poppy|мак|pratia|пратия|grass|трава|fern|папоротник|mushroom|гриб/i.test(modelId) || /bush|куст|flower|цвет|poppy|мак|pratia|пратия|grass|трава|fern|папоротник|mushroom|гриб/i.test(name)) {
      return null;
    }

    var isTree = (
      cat === 'trees' ||
      cat === 'dead_trees' ||
      modelId.startsWith('tree') ||
      modelId.startsWith('pine_') ||
      modelId.startsWith('spruce_') ||
      modelId.startsWith('spurce_') ||
      modelId.startsWith('dead_tree_') ||
      modelId.startsWith('small_tree_') ||
      name.includes('дерево') ||
      name.includes('древо') ||
      name.includes('сосна') ||
      name.includes('ель') ||
      name.includes('дуб')
    );

    if (!isTree) return null;

    var scl = p.scale || { x: 1, y: 1, z: 1 };
    var s = (typeof scl.x === 'number' && isFinite(scl.x)) ? scl.x : 1;

    // Specific trunk radius tuned strictly to actual 3D FBX trunk mesh thickness:
    if (modelId === 'tree_rt_4' || modelId.startsWith('tree_rt_4')) {
      // Giant relic tree
      return { radius: 1.15 * (s / 2.5), height: 16.0 * (s / 2.5) };
    }
    if (modelId.startsWith('tree_rt_2')) {
      // Relic tree 2
      return { radius: 0.75 * (s / 2.5), height: 14.0 * (s / 2.5) };
    }
    if (modelId.startsWith('tree_rt_3')) {
      // Relic tree 3
      return { radius: 0.80 * (s / 3.2), height: 14.0 * (s / 3.2) };
    }
    if (modelId.startsWith('tree_rt_1')) {
      // Relic tree 1
      return { radius: 0.65 * (s / 5.5), height: 14.0 * (s / 5.5) };
    }
    if (modelId.startsWith('small_tree_rt_1')) {
      // Young small tree
      return { radius: 0.28 * (s / 6.0), height: 8.0 * (s / 6.0) };
    }
    if (modelId.startsWith('pine_1') || modelId.startsWith('pine_2')) {
      // Pine tree
      return { radius: 0.42 * (s / 2.0), height: 14.0 * (s / 2.0) };
    }
    if (modelId.startsWith('spruce_') || modelId.startsWith('spurce_')) {
      // Spruce tree
      return { radius: 0.40 * (s / 3.0), height: 14.0 * (s / 3.0) };
    }
    if (modelId.startsWith('dead_tree_rt_1')) {
      return { radius: 0.48 * (s / 1.8), height: 13.0 * (s / 1.8) };
    }
    if (modelId.startsWith('dead_tree_rt_2')) {
      return { radius: 0.42 * (s / 3.3), height: 12.0 * (s / 3.3) };
    }
    if (modelId.startsWith('stump') || modelId.startsWith('forest_stump')) {
      return { radius: 0.50 * s, height: 1.5 * s };
    }

    // Default forest trees (tree01 .. tree36)
    // Trunk diameter at base is ~0.9m (radius 0.45m)
    return { radius: 0.45 * s, height: 14.0 * s };
  }

  function isCollidableProp(p) {
    if (!p) return false;
    if (p.collision === false || p.hasCollision === false) return false;
    if (p.id === 'player_spawn' || p.editorKey === 'player_spawn') return false;
    if (p.meshType === 'scene_ref') return false; // Never block on island, mountains, water, volcano, sky refs
    if (p.id === 'water' || p.id === 'terrain_ground' || p.id === 'mountains_root' || p.id === 'volcano') return false;
    if (typeof p.id === 'string' && (p.id.startsWith('named_') || p.id.includes('Dome') || p.id.includes('Water') || p.id.includes('Terrain') || p.id.includes('Ground'))) return false;

    // Grass, flowers, bushes, mushrooms, ferns, small flora have NO collision
    if (isNonCollidableFoliage(p)) return false;

    // Standalone collision box / barrier
    if (p.meshType === 'collision_box') return true;

    // Tree trunks
    if (getTreeTrunkRadius(p)) return true;

    // Explicit collision flag on non-foliage props
    if (p.collision === true || p.hasCollision === true) return true;

    // Placed non-foliage buildings / structures / obstacles
    if (p.meshType === 'fbx' || p.modelId || p.modelFile) return true;
    if (typeof p.id === 'string' && (p.id.startsWith('prop_') || p.id.startsWith('barrier_'))) return true;

    return false;
  }

  function getPropBounds(p) {
    if (!p || !isCollidableProp(p)) return null;
    var id = p.id || '';
    var pos = p.position || { x: 0, y: 0, z: 0 };
    var rot = p.rotation || { x: 0, y: 0, z: 0 };
    var scl = p.scale || { x: 1, y: 1, z: 1 };
    var sx = (typeof scl.x === 'number' && isFinite(scl.x)) ? scl.x : 1;
    var sy = (typeof scl.y === 'number' && isFinite(scl.y)) ? scl.y : sx;
    var sz = (typeof scl.z === 'number' && isFinite(scl.z)) ? scl.z : sx;

    // 1. Precise tree trunk collision
    var treeTrunk = getTreeTrunkRadius(p);
    if (treeTrunk) {
      var trunkRadius = Math.max(0.2, treeTrunk.radius);
      var trunkHeight = Math.max(2.0, treeTrunk.height);
      return {
        id: id,
        px: pos.x,
        py: pos.y || 0,
        pz: pos.z,
        rotY: rot.y || 0,
        halfX: trunkRadius,
        halfZ: trunkRadius,
        height: trunkHeight,
        maxRadius: trunkRadius + 0.3,
        collision: true,
        shape: 'cylinder',
        isTreeTrunk: true
      };
    }

    // 2. Generic props, buildings, barriers
    var baseW = 3.0, baseH = 4.0, baseD = 3.0;
    // true, пока реальный размер неизвестен: у пропа нет collisionSize/rawSize,
    // а его FBX-меш ещё не загружен (загрузка ленивая, по появлению в AOI).
    var sizeApprox = false;
    if (p.collisionSize && typeof p.collisionSize.x === 'number') {
      baseW = p.collisionSize.x;
      baseH = p.collisionSize.y;
      baseD = p.collisionSize.z;
    } else if (p.rawSize && typeof p.rawSize.x === 'number') {
      baseW = p.rawSize.x;
      baseH = p.rawSize.y;
      baseD = p.rawSize.z;
    } else {
      sizeApprox = true;
      var ed = global.editor || (global.game && global.game.editor);
      var propMeshes = (global.game && global.game.worldContent && global.game.worldContent.customPropMeshes) || (ed && ed.customPropMeshes);
      if (propMeshes && propMeshes.has(id)) {
        var mesh = propMeshes.get(id);
        if (mesh && global.THREE) {
          var box = new global.THREE.Box3().setFromObject(mesh);
          if (!box.isEmpty() && isFinite(box.min.x)) {
            var s = new global.THREE.Vector3();
            box.getSize(s);
            baseW = sx > 0.001 ? s.x / sx : s.x;
            baseH = sy > 0.001 ? s.y / sy : s.y;
            baseD = sz > 0.001 ? s.z / sz : s.z;
            p.rawSize = { x: baseW, y: baseH, z: baseD };
            sizeApprox = false;
          }
        }
      }
    }

    var offY = (p.collisionOffset && typeof p.collisionOffset.y === 'number') ? p.collisionOffset.y : 0;
    var halfX = (baseW * sx * 0.5);
    var halfZ = (baseD * sz * 0.5);
    var height = Math.max(0.5, baseH * sy);
    var maxRadius = Math.hypot(halfX, halfZ) + 0.5;

    var isWalkable = !!(
      p.walkable || p.isWalkableSurface || p.isBridge ||
      p.collisionShape === 'bridge' || p.shape === 'bridge' ||
      p.category === 'bridges' ||
      (typeof p.modelId === 'string' && /bridge|platform|pier|dock|walkway|catwalk|scaffold|stage|deck|ramp|stairs/i.test(p.modelId)) ||
      (typeof p.id === 'string' && /bridge|platform|pier|dock|walkway|catwalk|scaffold|stage|deck|ramp|stairs/i.test(p.id)) ||
      (typeof p.name === 'string' && /мост|платформ|причал|пирс|настил|трап|эстакад/i.test(p.name))
    );

    return {
      id: id,
      px: pos.x,
      py: (pos.y || 0) + offY,
      pz: pos.z,
      rotY: rot.y || 0,
      halfX: halfX,
      halfZ: halfZ,
      height: height,
      maxRadius: maxRadius,
      collision: true,
      shape: p.collisionShape || 'box',
      isWalkableSurface: isWalkable,
      // Размер взят по дефолту (FBX ещё не загружен) — индекс перепроверит позже
      approx: sizeApprox
    };
  }

  // ============================================================
  //  ИНДЕКС КОЛЛИЗИЙ (spatial hash по XZ)
  //  Раньше hitsPropXZ и standYAt линейно перебирали все 576 пропсов мира и
  //  на каждом вызывали isCollidableProp + getPropBounds, а внутри —
  //  PropsLibrary.getById с линейным find по 363 записям каталога.
  //  Замер на реальных данных: hitsPropXZ 6.0 мс, standYAt 4.7 мс за вызов.
  //  Вызывается это до 18 раз за кадр (player._maxFreeStep делает 10 бисекций
  //  при упоре в препятствие, camera3d._clipPropsDist — ещё 7 каждый кадр),
  //  то есть до ~50 мс на кадр = ~20 FPS.
  //
  //  Теперь bounds считаются один раз и раскладываются по сетке 16×16 м:
  //  запрос смотрит только ячейки, накрытые отрезком.
  // ============================================================
  var CELL = 16;
  /** Ключ ячейки одним числом: cx * K + cz. K с запасом на мир 3.7 км. */
  var GRID_K = 100000;
  /** Инвалидация индекса, пока не подгрузились FBX (размер = дефолт). */
  var APPROX_RETRY_MS = 1500;
  /** В редакторе пропсы двигают мышью — пересобираем чаще. */
  var EDITOR_REBUILD_MS = 300;
  var PLAYER_RADIUS = 0.35;

  var _idx = null;
  /** Метки посещения кандидатов: дешевле, чем Set на каждый запрос. */
  var _stamp = null;
  var _stampGen = 0;

  function cellOf(v) { return Math.floor(v / CELL); }

  function editorActive() {
    try {
      return !!(global.isSceneEditorActive && global.isSceneEditorActive());
    } catch (e) { return false; }
  }

  function buildIndex(props) {
    var bounds = [];
    var grid = new Map();
    var approx = 0;
    for (var i = 0; i < props.length; i++) {
      var p = props[i];
      if (!p || !isCollidableProp(p)) continue;
      var b = getPropBounds(p);
      if (!b || !b.collision) continue;
      if (b.approx) approx++;
      var bi = bounds.length;
      bounds.push(b);
      // Радиус влияния = maxRadius + радиус игрока + запас, тот же, что в
      // отсечке distToCenter. Раскладываем по всем накрытым ячейкам, поэтому
      // запросу расширение уже не нужно.
      var r = b.maxRadius + PLAYER_RADIUS + 1.0;
      var cx0 = cellOf(b.px - r), cx1 = cellOf(b.px + r);
      var cz0 = cellOf(b.pz - r), cz1 = cellOf(b.pz + r);
      for (var cx = cx0; cx <= cx1; cx++) {
        for (var cz = cz0; cz <= cz1; cz++) {
          var key = cx * GRID_K + cz;
          var cellArr = grid.get(key);
          if (!cellArr) { cellArr = []; grid.set(key, cellArr); }
          cellArr.push(bi);
        }
      }
    }
    if (!_stamp || _stamp.length < bounds.length) {
      _stamp = new Int32Array(Math.max(64, bounds.length * 2));
    }
    return {
      bounds: bounds,
      grid: grid,
      approx: approx,
      at: (global.performance && global.performance.now) ? global.performance.now() : Date.now(),
      srcRef: props,
      srcLen: props.length
    };
  }

  function ensureIndex() {
    var WM = global.WorldMetrics;
    var props = (WM && WM.CUSTOM_PROPS) || null;
    if (!props || !props.length) { _idx = null; return null; }
    var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    if (_idx) {
      // Массив заменили целиком (WM.CUSTOM_PROPS = …) или изменилась длина
      // (добавили/удалили проп) — индекс устарел.
      var stale = _idx.srcRef !== props || _idx.srcLen !== props.length;
      // Часть bounds взята по дефолту: FBX ещё не загрузился, реальный размер
      // появится позже — перепроверяем.
      if (!stale && _idx.approx > 0 && now - _idx.at > APPROX_RETRY_MS) stale = true;
      if (!stale && editorActive() && now - _idx.at > EDITOR_REBUILD_MS) stale = true;
      if (!stale) return _idx;
    }
    _idx = buildIndex(props);
    return _idx;
  }

  /** Сбросить индекс: звать после перемещения/добавления/удаления пропсов. */
  function invalidate() { _idx = null; }

  /** Кандидаты в ячейках, накрытых отрезком. Возвращает массив bounds. */
  function candidates(idx, ax, az, bx, bz) {
    var out = [];
    var minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
    var minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    var cx0 = cellOf(minX), cx1 = cellOf(maxX);
    var cz0 = cellOf(minZ), cz1 = cellOf(maxZ);
    var gen = ++_stampGen;
    for (var cx = cx0; cx <= cx1; cx++) {
      for (var cz = cz0; cz <= cz1; cz++) {
        var cellArr = idx.grid.get(cx * GRID_K + cz);
        if (!cellArr) continue;
        for (var k = 0; k < cellArr.length; k++) {
          var bi = cellArr[k];
          if (_stamp[bi] === gen) continue;   // уже добавлен из соседней ячейки
          _stamp[bi] = gen;
          out.push(idx.bounds[bi]);
        }
      }
    }
    return out;
  }

  function hitsPropXZ(ax, az, bx, bz, playerY) {
    var idx = ensureIndex();
    if (!idx || !idx.bounds.length) return false;

    var py = (typeof playerY === 'number') ? playerY : 1.0;
    var list = candidates(idx, ax, az, bx, bz);

    for (var i = 0; i < list.length; i++) {
      var b = list[i];

      var topY = b.py + b.height;
      if (py < b.py - 0.4 || py > topY + 0.3) continue;

      if (b.isWalkableSurface) {
        // Ходьба ПО поверхности настила: не блокирует горизонтальное движение
        if (py >= topY - 0.45) continue;
        // Ходьба ПОД мостом/настилом при наличии клиренса по высоте (1.8м):
        if (py + 1.8 <= b.py + 0.25) continue;
      }

      var midX = (ax + bx) * 0.5;
      var midZ = (az + bz) * 0.5;
      var distToCenter = Math.hypot(midX - b.px, midZ - b.pz);
      if (distToCenter > b.maxRadius + PLAYER_RADIUS + 1.0) continue;

      var cos = Math.cos(-b.rotY);
      var sin = Math.sin(-b.rotY);
      var hx = b.halfX + PLAYER_RADIUS;
      var hz = b.halfZ + PLAYER_RADIUS;

      var samples = 4;
      for (var s = 0; s <= samples; s++) {
        var t = s / samples;
        var sx = ax + (bx - ax) * t;
        var sz = az + (bz - az) * t;

        var dx = sx - b.px;
        var dz = sz - b.pz;
        var lx = dx * cos - dz * sin;
        var lz = dx * sin + dz * cos;

        if (b.shape === 'cylinder') {
          var r = b.halfX + PLAYER_RADIUS;
          if (lx * lx + lz * lz <= r * r) return true;
        } else {
          if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) return true;
        }
      }
    }
    return false;
  }

  function standYAt(x, z, playerY) {
    var idx = ensureIndex();
    if (!idx || !idx.bounds.length) return null;

    var bestY = null;
    var py = (typeof playerY === 'number') ? playerY : 1.0;
    // Точка внутри bounds всегда лежит в ячейке, где этот bounds зарегистрирован
    // (вставка идёт с радиусом maxRadius + запас), поэтому хватает одной ячейки.
    var cellArr = idx.grid.get(cellOf(x) * GRID_K + cellOf(z));
    if (!cellArr) return null;

    for (var i = 0; i < cellArr.length; i++) {
      var b = idx.bounds[cellArr[i]];

      var cos = Math.cos(-b.rotY);
      var sin = Math.sin(-b.rotY);
      var dx = x - b.px;
      var dz = z - b.pz;
      var lx = dx * cos - dz * sin;
      var lz = dx * sin + dz * cos;

      if (b.shape === 'cylinder') {
        if (lx * lx + lz * lz <= b.halfX * b.halfX) {
          var topC = b.py + b.height;
          if (b.isWalkableSurface) {
            if (py >= b.py - 0.4 && (bestY == null || Math.abs(py - topC) < Math.abs(py - bestY))) {
              bestY = topC;
            }
          } else {
            if (py >= b.py - 0.2 && topC > (bestY == null ? -Infinity : bestY)) {
              bestY = topC;
            }
          }
        }
      } else {
        if (Math.abs(lx) <= b.halfX && Math.abs(lz) <= b.halfZ) {
          var topB = b.py + b.height;
          if (b.isWalkableSurface) {
            if (py >= b.py - 0.4 && (bestY == null || Math.abs(py - topB) < Math.abs(py - bestY))) {
              bestY = topB;
            }
          } else {
            if (py >= b.py - 0.2 && topB > (bestY == null ? -Infinity : bestY)) {
              bestY = topB;
            }
          }
        }
      }
    }
    return bestY;
  }

  /** Диагностика: сколько bounds в индексе и сколько ждут загрузки FBX. */
  function stats() {
    var idx = ensureIndex();
    if (!idx) return { bounds: 0, cells: 0, approx: 0 };
    return { bounds: idx.bounds.length, cells: idx.grid.size, approx: idx.approx };
  }

  global.PropsCollision = {
    hitsPropXZ: hitsPropXZ,
    standYAt: standYAt,
    getPropBounds: getPropBounds,
    isCollidableProp: isCollidableProp,
    isNonCollidableFoliage: isNonCollidableFoliage,
    getTreeTrunkRadius: getTreeTrunkRadius,
    invalidate: invalidate,
    stats: stats,
    CELL_SIZE: CELL
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.PropsCollision;
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
