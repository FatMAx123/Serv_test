// ============================================================
//  CLIENT / JS / BSP-BRUSHES.JS
//  Full UE-style BSP brush system:
//    • ordered brush stack (additive / subtractive)
//    • edit shells (wire volumes) + Built Geometry (CSG result)
//    • shapes: box, cylinder, wedge, cone, stairs, sheet
//    • textures, collision (stack solid test), stand-on-top
//  Data: WorldMetrics.BSP_BRUSHES  |  CSG: window.BspCSG
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;

  var TEXTURE_PALETTE = [
    { id: '', label: '— Цвет (без текстуры) —' },
    { id: 'town_cobblestone.webp', label: 'Булыжник (town)' },
    { id: 'Forest_Floor_sfjmafua_1K_BaseColor.webp', label: 'Лесной пол A' },
    { id: 'Forest_Floor_vktfeilaw_1K_BaseColor.webp', label: 'Лесной пол B' },
    { id: 'Ground_Roots_vliucgi_1K_BaseColor.webp', label: 'Корни / грунт' },
    { id: '020_Dense_Green_grass_BaseColor.webp', label: 'Трава' },
    { id: 'sand_tidewrack.webp', label: 'Песок' },
    { id: 'Rock_Cliff_xccibbi_1K_BaseColor.webp', label: 'Скала' },
    { id: 'Layered_Rock_Cliff_thfkchjs_1K_BaseColor.webp', label: 'Слоистая скала' },
    { id: 'Hawaiian_Lava_Stone_tjmledzr_1K_BaseColor.webp', label: 'Лава-камень' },
    { id: 'Icelandic_Rock_Detail_ucukfhycw_1K_BaseColor.webp', label: 'Исландский камень' },
    { id: 'volcano_rock_cliff.webp', label: 'Вулкан (cliff)' },
    { id: 'volcano_rock_slate.webp', label: 'Вулкан (slate)' },
    { id: 'lava ground_BaseColor.webp', label: 'Лава (земля)' },
    { id: 'Astreoid Glowing Lava Green Rock_BaseColor.webp', label: 'Зелёная лава-скала' }
  ];

  var SHAPES = [
    { id: 'box', label: 'Cube', icon: '▣' },
    { id: 'cylinder', label: 'Cylinder', icon: '◎' },
    { id: 'wedge', label: 'Wedge', icon: '◢' },
    { id: 'cone', label: 'Cone', icon: '▲' },
    { id: 'stairs', label: 'Stairs', icon: '☰' },
    { id: 'sheet', label: 'Sheet', icon: '▭' }
  ];

  var FACE_KEYS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  var FACE_LABELS = {
    px: '+X', nx: '−X', py: '+Y Top', ny: '−Y Bot', pz: '+Z', nz: '−Z'
  };

  var _texCache = {};
  var _root = null;          // BspBrushesRoot
  var _editGroup = null;     // wire shells (editor only)
  var _builtGroup = null;    // CSG result (always in game)
  var _shells = new Map();   // id → Mesh (edit shell)
  var _builtMesh = null;
  var _scene = null;
  var _autoBuild = true;
  var _buildDirty = true;
  var _buildTimer = null;
  var _showShells = true;
  var _showBuilt = true;
  var _lastBuildInfo = { ok: false, brushes: 0, tris: 0, ms: 0, error: null };

  // ---------- utils ----------
  function snap(v, grid) {
    if (!grid || grid <= 0) return v;
    return Math.round(v / grid) * grid;
  }
  function cloneBrush(b) {
    try { return JSON.parse(JSON.stringify(b)); } catch (e) { return null; }
  }
  function uid() {
    return 'bsp_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function defaultBrush(partial) {
    var b = {
      id: uid(),
      name: 'Brush',
      type: 'bsp',
      shape: 'box',
      op: 'add',
      disabled: false,
      position: { x: 0, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      size: { x: 4, y: 3, z: 4 },
      // material tint (white = texture as-is; shell color is separate in buildShell)
      color: 0xffffff,
      texture: 'town_cobblestone.webp',
      uvScale: 0.25,
      uvOffsetU: 0,
      uvOffsetV: 0,
      roughness: 0.88,
      metalness: 0.05,
      collision: true,
      steps: 8,
      segments: 20,
      faces: null
    };
    if (partial) {
      Object.keys(partial).forEach(function (k) {
        if (partial[k] !== undefined) b[k] = partial[k];
      });
    }
    if (!b.name || b.name === 'Brush') {
      var sh = b.shape || 'box';
      b.name = (b.op === 'sub' ? 'Sub ' : 'Add ') + sh.charAt(0).toUpperCase() + sh.slice(1);
    }
    return b;
  }

  function getPalette() { return TEXTURE_PALETTE.slice(); }
  function getShapes() { return SHAPES.slice(); }
  function faceLabel(k) { return FACE_LABELS[k] || k; }

  // ---------- WorldMetrics access ----------
  function getBrushes() {
    var WM = window.WorldMetrics;
    if (WM && Array.isArray(WM.BSP_BRUSHES)) return WM.BSP_BRUSHES;
    return [];
  }
  function findBrush(id) {
    var list = getBrushes();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }
  function findBrushIndex(id) {
    var list = getBrushes();
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return i;
    return -1;
  }
  function upsertBrush(data) {
    var WM = window.WorldMetrics;
    if (!WM) return null;
    if (!Array.isArray(WM.BSP_BRUSHES)) WM.BSP_BRUSHES = [];
    var copy = cloneBrush(data);
    var i = findBrushIndex(copy.id);
    if (i >= 0) WM.BSP_BRUSHES[i] = copy;
    else WM.BSP_BRUSHES.push(copy);
    markDirty();
    return copy;
  }
  function removeBrush(id) {
    var WM = window.WorldMetrics;
    if (!WM || !Array.isArray(WM.BSP_BRUSHES)) return false;
    for (var i = WM.BSP_BRUSHES.length - 1; i >= 0; i--) {
      if (WM.BSP_BRUSHES[i] && WM.BSP_BRUSHES[i].id === id) WM.BSP_BRUSHES.splice(i, 1);
    }
    var shell = _shells.get(id);
    if (shell) {
      if (shell.parent) shell.parent.remove(shell);
      disposeObject(shell);
      _shells.delete(id);
    }
    markDirty();
    return true;
  }
  function setBrushes(list) {
    var WM = window.WorldMetrics;
    if (!WM) return;
    if (!Array.isArray(WM.BSP_BRUSHES)) WM.BSP_BRUSHES = [];
    WM.BSP_BRUSHES.length = 0;
    (list || []).forEach(function (b) {
      if (b && b.id) WM.BSP_BRUSHES.push(cloneBrush(b));
    });
    markDirty();
  }
  function reorderBrush(id, dir) {
    var WM = window.WorldMetrics;
    if (!WM || !Array.isArray(WM.BSP_BRUSHES)) return false;
    var i = findBrushIndex(id);
    if (i < 0) return false;
    var j = i + (dir < 0 ? -1 : 1);
    if (j < 0 || j >= WM.BSP_BRUSHES.length) return false;
    var tmp = WM.BSP_BRUSHES[i];
    WM.BSP_BRUSHES[i] = WM.BSP_BRUSHES[j];
    WM.BSP_BRUSHES[j] = tmp;
    markDirty();
    return true;
  }
  function moveBrushTo(id, newIndex) {
    var WM = window.WorldMetrics;
    if (!WM || !Array.isArray(WM.BSP_BRUSHES)) return false;
    var i = findBrushIndex(id);
    if (i < 0) return false;
    newIndex = Math.max(0, Math.min(WM.BSP_BRUSHES.length - 1, newIndex));
    if (i === newIndex) return true;
    var item = WM.BSP_BRUSHES.splice(i, 1)[0];
    WM.BSP_BRUSHES.splice(newIndex, 0, item);
    markDirty();
    return true;
  }

  // ---------- textures ----------
  function loadBrushTexture(rel, onReady) {
    if (!rel) { if (onReady) onReady(null); return null; }
    if (_texCache[rel] && _texCache[rel].image) {
      if (onReady) onReady(_texCache[rel]);
      return _texCache[rel];
    }
    function finish(tex) {
      if (!tex) return;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      tex.needsUpdate = true;
      _texCache[rel] = tex;
      var cbs = (tex.userData && tex.userData._bspCbs) || [];
      if (onReady) cbs.push(onReady);
      cbs.forEach(function (cb) { try { cb(tex); } catch (e) {} });
      if (tex.userData) tex.userData._bspCbs = null;
    }
    if (typeof window.loadTex === 'function') {
      var holder = window.loadTex(rel, function (t) { finish(t); }, function () {
        if (onReady) onReady(null);
      });
      if (holder) {
        holder.userData = holder.userData || {};
        holder.userData.pending = true;
        _texCache[rel] = holder;
        if (onReady) {
          holder.userData._bspCbs = holder.userData._bspCbs || [];
          holder.userData._bspCbs.push(onReady);
        }
      }
      return holder;
    }
    return null;
  }

  function makeStandardMat(opts) {
    opts = opts || {};
    var mat = new THREE.MeshStandardMaterial({
      color: opts.color != null ? opts.color : 0xb0a090,
      roughness: opts.roughness != null ? opts.roughness : 0.88,
      metalness: opts.metalness != null ? opts.metalness : 0.05,
      side: THREE.FrontSide,
      transparent: !!opts.transparent,
      opacity: opts.opacity != null ? opts.opacity : 1,
      wireframe: !!opts.wireframe,
      depthWrite: opts.depthWrite !== false,
      polygonOffset: !!opts.polygonOffset,
      polygonOffsetFactor: opts.polygonOffsetFactor || 0,
      polygonOffsetUnits: opts.polygonOffsetUnits || 0
    });
    if (opts.texture) {
      loadBrushTexture(opts.texture, function (t) {
        if (!t || !mat) return;
        var c = t.clone ? t.clone() : t;
        if (c.image) c.needsUpdate = true;
        c.wrapS = THREE.RepeatWrapping;
        c.wrapT = THREE.RepeatWrapping;
        var uScale = opts.uvScale != null ? opts.uvScale : 0.25;
        // world UV already baked in CSG; map.repeat = 1
        c.repeat.set(1, 1);
        mat.map = c;
        mat.needsUpdate = true;
      });
    }
    return mat;
  }

  // ---------- scene graph ----------
  function ensureRoot(scene) {
    if (!_root) {
      _root = new THREE.Group();
      _root.name = 'BspBrushesRoot';
      _editGroup = new THREE.Group();
      _editGroup.name = 'BspEditShells';
      _builtGroup = new THREE.Group();
      _builtGroup.name = 'BspBuiltGeometry';
      _root.add(_builtGroup);
      _root.add(_editGroup);
    }
    if (scene && _root.parent !== scene) {
      if (_root.parent) _root.parent.remove(_root);
      scene.add(_root);
    }
    _scene = scene || _scene;
    return _root;
  }

  function disposeObject(obj) {
    if (!obj) return;
    obj.traverse(function (c) {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        var mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach(function (m) {
          if (!m) return;
          if (m.map && m.map.dispose && m.map.userData && m.map.userData._cloned) {
            try { m.map.dispose(); } catch (e) {}
          }
          m.dispose();
        });
      }
    });
  }

  function createShapeGeo(shape, steps) {
    if (window.BspCSG && window.BspCSG.createShapeGeometry) {
      return window.BspCSG.createShapeGeometry(shape, steps || 16);
    }
    if (shape === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, 20);
    if (shape === 'cone') return new THREE.ConeGeometry(0.5, 1, 20);
    return new THREE.BoxGeometry(1, 1, 1);
  }

  // ---------- edit shells (UE brush wireframes) ----------
  function buildShell(b) {
    var geo = createShapeGeo(b.shape, b.steps || b.segments);
    var isSub = b.op === 'sub';
    var col = isSub ? 0xff3355 : 0x44aaff;
    if (b.disabled) col = 0x666666;

    var wire = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        color: col,
        wireframe: true,
        transparent: true,
        opacity: b.disabled ? 0.25 : 0.95,
        depthTest: true
      })
    );
    var fill = new THREE.Mesh(
      geo.clone ? geo.clone() : geo,
      new THREE.MeshBasicMaterial({
        color: isSub ? 0xff2244 : 0x2288cc,
        transparent: true,
        opacity: b.disabled ? 0.04 : (isSub ? 0.12 : 0.1),
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    // edges helper for clearer UE look
    var edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 25),
      new THREE.LineBasicMaterial({
        color: isSub ? 0xff6688 : 0xaaddff,
        transparent: true,
        opacity: b.disabled ? 0.3 : 1
      })
    );

    var group = new THREE.Group();
    group.name = 'BspShell_' + b.id;
    group.add(fill);
    group.add(wire);
    group.add(edges);
    group.position.set(b.position.x, b.position.y, b.position.z);
    group.rotation.set(
      b.rotation && b.rotation.x || 0,
      b.rotation && b.rotation.y || 0,
      b.rotation && b.rotation.z || 0
    );
    group.scale.set(
      Math.max(0.05, b.size.x || 1),
      Math.max(0.05, b.size.y || 1),
      Math.max(0.05, b.size.z || 1)
    );
    group.userData = {
      isBspBrush: true,
      isBspShell: true,
      brushId: b.id,
      brushData: b,
      editorKey: b.id,
      editorLabel: b.name || 'BSP Brush'
    };
    // raycast on fill for picking
    fill.userData = group.userData;
    wire.userData = group.userData;
    edges.userData = group.userData;
    group.traverse(function (c) {
      c.userData.isBspBrush = true;
      c.userData.brushId = b.id;
      c.userData.isBspShell = true;
    });
    return group;
  }

  function rebuildShells() {
    ensureRoot(_scene);
    // clear old shells
    while (_editGroup.children.length) {
      var c = _editGroup.children[0];
      _editGroup.remove(c);
      disposeObject(c);
    }
    _shells.clear();
    var list = getBrushes();
    list.forEach(function (b) {
      if (!b || !b.id) return;
      try {
        var shell = buildShell(b);
        _editGroup.add(shell);
        _shells.set(b.id, shell);
      } catch (e) {
        console.warn('[BSP] shell fail', b.id, e);
      }
    });
    _editGroup.visible = _showShells;
  }

  function syncShellTransform(id) {
    var b = findBrush(id);
    var shell = _shells.get(id);
    if (!b || !shell) return;
    shell.position.set(b.position.x, b.position.y, b.position.z);
    shell.rotation.set(
      b.rotation && b.rotation.x || 0,
      b.rotation && b.rotation.y || 0,
      b.rotation && b.rotation.z || 0
    );
    shell.scale.set(
      Math.max(0.05, b.size.x || 1),
      Math.max(0.05, b.size.y || 1),
      Math.max(0.05, b.size.z || 1)
    );
    shell.userData.brushData = b;
  }

  function rebuildOneShell(id) {
    var b = findBrush(id);
    var old = _shells.get(id);
    if (old) {
      if (old.parent) old.parent.remove(old);
      disposeObject(old);
      _shells.delete(id);
    }
    if (!b) return null;
    ensureRoot(_scene);
    var shell = buildShell(b);
    _editGroup.add(shell);
    _shells.set(id, shell);
    return shell;
  }

  // ---------- CSG build ----------
  function markDirty() {
    _buildDirty = true;
    if (_autoBuild) scheduleBuild();
  }

  function scheduleBuild(delay) {
    if (_buildTimer) clearTimeout(_buildTimer);
    _buildTimer = setTimeout(function () {
      _buildTimer = null;
      buildGeometry();
    }, delay != null ? delay : 120);
  }

  function setAutoBuild(on) {
    _autoBuild = !!on;
    if (_autoBuild && _buildDirty) scheduleBuild(50);
  }

  function buildGeometry() {
    ensureRoot(_scene);
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var list = getBrushes().filter(function (b) { return b && !b.disabled; });

    // clear previous built
    while (_builtGroup.children.length) {
      var c = _builtGroup.children[0];
      _builtGroup.remove(c);
      disposeObject(c);
    }
    _builtMesh = null;

    if (!list.length) {
      _buildDirty = false;
      _lastBuildInfo = { ok: true, brushes: 0, tris: 0, ms: 0, error: null };
      return _lastBuildInfo;
    }

    if (!window.BspCSG || !window.BspCSG.buildFromBrushes) {
      console.warn('[BSP] BspCSG missing — showing shells only');
      _lastBuildInfo = { ok: false, brushes: list.length, tris: 0, ms: 0, error: 'no CSG' };
      // fallback: show additive shells as solid
      fallbackSolidShells(list);
      _buildDirty = false;
      return _lastBuildInfo;
    }

    var built;
    try {
      built = window.BspCSG.buildFromBrushes(list);
    } catch (e) {
      console.error('[BSP] build error', e);
      _lastBuildInfo = { ok: false, brushes: list.length, tris: 0, ms: 0, error: String(e && e.message || e) };
      _buildDirty = false;
      return _lastBuildInfo;
    }

    if (!built || !built.geometry || !built.matKeys || !built.matKeys.length) {
      _buildDirty = false;
      _lastBuildInfo = { ok: true, brushes: list.length, tris: 0, ms: 0, error: null };
      return _lastBuildInfo;
    }

    // multi-material mesh — never apply editor shell pink/red as surface tint
    var mats = built.matKeys.map(function (key) {
      var sh = (built.sharedByKey && built.sharedByKey[key]) || {};
      var col = sh.color != null ? sh.color : 0xffffff;
      if (typeof col === 'number') {
        var r = (col >> 16) & 0xff, g = (col >> 8) & 0xff, bcol = col & 0xff;
        if ((r > 180 && g < 120 && bcol < 160) || (r < 100 && g > 120 && bcol > 180)) {
          col = 0xffffff;
        }
      }
      return makeStandardMat({
        color: col,
        texture: sh.texture || '',
        uvScale: sh.uvScale,
        roughness: sh.roughness,
        metalness: sh.metalness
      });
    });

    var mesh = new THREE.Mesh(built.geometry, mats.length === 1 ? mats[0] : mats);
    mesh.name = 'BspBuiltMesh';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isBspBuilt = true;
    mesh.userData.editorLabel = 'BSP Built Geometry';
    _builtGroup.add(mesh);
    _builtMesh = mesh;
    _builtGroup.visible = _showBuilt;

    var pos = built.geometry.attributes.position;
    var tris = pos ? Math.floor(pos.count / 3) : 0;
    var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    _buildDirty = false;
    _lastBuildInfo = {
      ok: true,
      brushes: list.length,
      tris: tris,
      ms: Math.round(t1 - t0),
      error: null
    };
    console.log('[BSP] Built', _lastBuildInfo.brushes, 'brushes →', tris, 'tris in', _lastBuildInfo.ms, 'ms');
    return _lastBuildInfo;
  }

  function fallbackSolidShells(list) {
    list.forEach(function (b) {
      if (b.op === 'sub') return;
      var geo = createShapeGeo(b.shape, b.steps || b.segments);
      var mat = makeStandardMat({
        color: b.color,
        texture: b.texture,
        uvScale: b.uvScale,
        roughness: b.roughness,
        metalness: b.metalness
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(b.position.x, b.position.y, b.position.z);
      mesh.rotation.set(b.rotation.x || 0, b.rotation.y || 0, b.rotation.z || 0);
      mesh.scale.set(b.size.x, b.size.y, b.size.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isBspBuilt = true;
      _builtGroup.add(mesh);
    });
  }

  /** Fix legacy sub brushes saved with pink/red editor color as material tint */
  function sanitizeBrushMaterials() {
    var list = getBrushes();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b) continue;
      var c = b.color;
      if (typeof c !== 'number') continue;
      var r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, bl = c & 0xff;
      var shell = (r > 180 && g < 120 && bl < 160) || (r < 100 && g > 120 && bl > 180);
      if (shell || b.op === 'sub') {
        // white = texture without tint (especially cut faces)
        if (shell || b.op === 'sub') b.color = 0xffffff;
      }
    }
  }

  function rebuildAll(scene) {
    ensureRoot(scene || _scene);
    sanitizeBrushMaterials();
    rebuildShells();
    buildGeometry();
    return getBrushes().length;
  }

  function rebuildOne(id) {
    rebuildOneShell(id);
    markDirty();
    if (!_autoBuild) buildGeometry();
    return _shells.get(id) || null;
  }

  function applyMaterialChange(id) {
    return rebuildOne(id);
  }

  function syncBrushTransform(id, pos, rot, size) {
    var b = findBrush(id);
    if (!b) return;
    if (pos) b.position = { x: pos.x, y: pos.y, z: pos.z };
    if (rot) b.rotation = { x: rot.x || 0, y: rot.y || 0, z: rot.z || 0 };
    if (size) {
      b.size = {
        x: Math.max(0.05, size.x),
        y: Math.max(0.05, size.y),
        z: Math.max(0.05, size.z)
      };
    }
    syncShellTransform(id);
    markDirty();
  }

  // ---------- local-space point test for a brush ----------
  function worldToLocalBrush(b, wx, wy, wz) {
    // inverse transform: un-translate, un-rotate, un-scale
    var dx = wx - (b.position.x || 0);
    var dy = wy - (b.position.y || 0);
    var dz = wz - (b.position.z || 0);
    var rx = b.rotation && b.rotation.x || 0;
    var ry = b.rotation && b.rotation.y || 0;
    var rz = b.rotation && b.rotation.z || 0;
    // inverse Euler XYZ: -Z, -Y, -X
    function rotX(x, y, z, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return { x: x, y: y * c - z * s, z: y * s + z * c };
    }
    function rotY(x, y, z, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return { x: x * c + z * s, y: y, z: -x * s + z * c };
    }
    function rotZ(x, y, z, a) {
      var c = Math.cos(a), s = Math.sin(a);
      return { x: x * c - y * s, y: x * s + y * c, z: z };
    }
    var p = rotZ(dx, dy, dz, -rz);
    p = rotY(p.x, p.y, p.z, -ry);
    p = rotX(p.x, p.y, p.z, -rx);
    var sx = Math.max(0.05, b.size.x || 1);
    var sy = Math.max(0.05, b.size.y || 1);
    var sz = Math.max(0.05, b.size.z || 1);
    return { x: p.x / sx, y: p.y / sy, z: p.z / sz };
  }

  function pointInUnitShape(shape, lx, ly, lz, steps) {
    shape = shape || 'box';
    if (shape === 'box' || shape === 'sheet') {
      return Math.abs(lx) <= 0.5 && Math.abs(ly) <= 0.5 && Math.abs(lz) <= 0.5;
    }
    if (shape === 'cylinder') {
      return (lx * lx + lz * lz) <= 0.25 && Math.abs(ly) <= 0.5;
    }
    if (shape === 'cone') {
      // cone tip at +Y, base at -Y, radius 0.5 at base
      if (ly < -0.5 || ly > 0.5) return false;
      var t = (0.5 - ly); // 0 at tip(+0.5), 1 at base(-0.5)
      var r = 0.5 * t;
      return (lx * lx + lz * lz) <= r * r;
    }
    if (shape === 'wedge') {
      // unit wedge: solid if x from -0.5..0.5, z -0.5..0.5, y from -0.5 to slope
      // slope: at x=+0.5 y_max=-0.5; at x=-0.5 y_max=+0.5 → y_max = -x
      if (Math.abs(lx) > 0.5 || Math.abs(lz) > 0.5) return false;
      if (ly < -0.5) return false;
      var ymax = -lx; // when lx=-0.5 → 0.5; lx=0.5 → -0.5
      return ly <= ymax + 1e-6;
    }
    if (shape === 'stairs') {
      steps = Math.max(2, steps || 8);
      if (Math.abs(lz) > 0.5 || lx < -0.5 || lx > 0.5 || ly < -0.5 || ly > 0.5) return false;
      var u = lx + 0.5; // 0..1
      var step = Math.floor(u * steps);
      if (step >= steps) step = steps - 1;
      var yTop = (step + 1) / steps - 0.5;
      return ly <= yTop + 1e-6;
    }
    return Math.abs(lx) <= 0.5 && Math.abs(ly) <= 0.5 && Math.abs(lz) <= 0.5;
  }

  function pointInBrush(b, wx, wy, wz) {
    if (!b || b.disabled) return false;
    var lp = worldToLocalBrush(b, wx, wy, wz);
    return pointInUnitShape(b.shape, lp.x, lp.y, lp.z, b.steps);
  }

  /**
   * UE-style sequential solid test:
   * walk brush stack in order; add → solid=true, sub → solid=false when inside.
   * Subtractive ALWAYS carves (even if collision checkbox off) — otherwise doors stay blocked.
   * Additive respects collision flag (false = decorative volume, no block).
   */
  function isSolidAt(wx, wy, wz) {
    var solid = false;
    var list = getBrushes();
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.disabled) continue;
      if (!pointInBrush(b, wx, wy, wz)) continue;
      if (b.op === 'sub') {
        // carve opening — always, so player can walk through doorways
        solid = false;
      } else if (b.collision !== false) {
        solid = true;
      }
    }
    return solid;
  }

  /**
   * Movement block: is the horizontal step into solid wall?
   * Samples body heights but ignores pure floor slabs (solid only at feet, empty at torso)
   * so platforms don't block walking on top of them.
   */
  function hitsBrushXZ(ax, az, bx, bz, y) {
    var py = (typeof y === 'number') ? y : 1.0;
    var samples = 4;
    for (var s = 1; s <= samples; s++) {
      var t = s / samples;
      var x = ax + (bx - ax) * t;
      var z = az + (bz - az) * t;
      // torso / chest / head — wall collision (not feet-only floor)
      var mid = isSolidAt(x, py + 0.35, z);
      var chest = isSolidAt(x, py + 0.85, z);
      var head = isSolidAt(x, py + 1.35, z);
      if (mid || chest || head) return true;
      // low barrier / step (solid at shin, empty at torso still blocks a bit)
      var shin = isSolidAt(x, py - 0.15, z);
      if (shin && mid) return true;
    }
    return false;
  }

  /** Highest solid top under (x,z) for standing — sample brush tops */
  function standYAt(x, z) {
    var list = getBrushes();
    if (!list || list.length === 0) return null;
    var best = null;
    // probe multiple heights top-down
    var candidates = [];
    var minBot = Infinity;
    var maxTop = -Infinity;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.disabled || b.op === 'sub' || b.collision === false) continue;
      // rough top Y of AABB (rotation ignored for speed — refined with solid test)
      var top = (b.position.y || 0) + Math.max(0.05, b.size.y || 1) * 0.5;
      var bot = (b.position.y || 0) - Math.max(0.05, b.size.y || 1) * 0.5;
      // must be over footprint
      var halfX = Math.max(0.05, b.size.x || 1) * 0.5 + 0.2;
      var halfZ = Math.max(0.05, b.size.z || 1) * 0.5 + 0.2;
      if (Math.abs(x - b.position.x) > halfX || Math.abs(z - b.position.z) > halfZ) continue;
      candidates.push(top);
      if (bot < minBot) minBot = bot;
      if (top > maxTop) maxTop = top;
      // also mid steps for stairs
      if (b.shape === 'stairs') {
        for (var s = 1; s <= (b.steps || 8); s++) {
          candidates.push(bot + (top - bot) * (s / (b.steps || 8)));
        }
      }
    }
    // Zero-Stutter: if (x, z) is not over any brush footprint, return immediately (no 120-iteration ray sweep!)
    if (candidates.length === 0) return null;

    candidates.sort(function (a, b) { return b - a; });
    for (var c = 0; c < candidates.length; c++) {
      var y = candidates[c];
      // solid just below top, empty just above
      if (isSolidAt(x, y - 0.05, z) && !isSolidAt(x, y + 0.15, z)) {
        if (best == null || y > best) best = y;
      }
    }
    // also: if standing inside solid (platform), probe only within the candidate brush bounds
    if (best == null && Number.isFinite(minBot) && Number.isFinite(maxTop)) {
      for (var h = maxTop; h >= minBot; h -= 0.5) {
        if (isSolidAt(x, h, z) && !isSolidAt(x, h + 0.2, z)) {
          best = h + 0.05;
          break;
        }
      }
    }
    return best;
  }

  // ---------- visibility / editor mode ----------
  function setShowShells(on) {
    _showShells = !!on;
    if (_editGroup) _editGroup.visible = _showShells;
  }
  function setShowBuilt(on) {
    _showBuilt = !!on;
    if (_builtGroup) _builtGroup.visible = _showBuilt;
  }
  function setEditorMode(on) {
    // in editor: show shells; in game: hide shells, show built
    setShowShells(!!on);
    setShowBuilt(true);
    if (_editGroup) {
      _editGroup.traverse(function (obj) {
        if (obj.isMesh || obj.isLineSegments) {
          // shells only pickable in editor
          if (!on) {
            obj.userData._raycastBak = obj.raycast;
            obj.raycast = function () {};
          } else if (obj.userData._raycastBak) {
            obj.raycast = obj.userData._raycastBak;
          } else {
            obj.raycast = (obj.isLineSegments && THREE.LineSegments) ? THREE.LineSegments.prototype.raycast : THREE.Mesh.prototype.raycast;
          }
        }
      });
    }
  }

  function getMesh(id) { return _shells.get(id) || null; }
  function getBuiltMesh() { return _builtMesh; }
  function getRoot() { return _root; }
  function getEditGroup() { return _editGroup; }
  function getLastBuildInfo() { return Object.assign({}, _lastBuildInfo); }
  function isDirty() { return _buildDirty; }
  function isAutoBuild() { return _autoBuild; }

  function createPreviewMesh(color) {
    var geo = new THREE.BoxGeometry(1, 1, 1);
    var group = new THREE.Group();
    group.name = 'BspDrawPreview';
    group.userData.isBspPreview = true;
    group.add(new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: color || 0x44aaff, wireframe: true, transparent: true, opacity: 0.95 })
    ));
    group.add(new THREE.Mesh(
      geo.clone ? geo.clone() : new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({
        color: color || 0x2288cc, transparent: true, opacity: 0.18, depthWrite: false
      })
    ));
    return group;
  }

  function disposeAll() {
    if (_buildTimer) clearTimeout(_buildTimer);
    if (_root) {
      disposeObject(_root);
      if (_root.parent) _root.parent.remove(_root);
    }
    _shells.clear();
    _builtMesh = null;
    _root = _editGroup = _builtGroup = null;
  }

  // expand/shrink selected brush (UE-style brush sizing)
  function adjustBrushSize(id, axis, delta, grid) {
    var b = findBrush(id);
    if (!b) return null;
    grid = grid || 0.5;
    var key = axis === 'x' || axis === 'y' || axis === 'z' ? axis : 'all';
    if (key === 'all') {
      b.size.x = Math.max(0.5, snap(b.size.x + delta, grid));
      b.size.y = Math.max(0.5, snap(b.size.y + delta, grid));
      b.size.z = Math.max(0.5, snap(b.size.z + delta, grid));
    } else {
      b.size[key] = Math.max(0.5, snap((b.size[key] || 1) + delta, grid));
    }
    rebuildOneShell(id);
    markDirty();
    return b;
  }

  window.BspBrushes = {
    TEXTURE_PALETTE: TEXTURE_PALETTE,
    SHAPES: SHAPES,
    FACE_KEYS: FACE_KEYS,
    FACE_LABELS: FACE_LABELS,
    defaultBrush: defaultBrush,
    cloneBrush: cloneBrush,
    getPalette: getPalette,
    getShapes: getShapes,
    faceLabel: faceLabel,
    loadBrushTexture: loadBrushTexture,
    ensureRoot: ensureRoot,
    rebuildAll: rebuildAll,
    rebuildOne: rebuildOne,
    rebuildShells: rebuildShells,
    buildGeometry: buildGeometry,
    scheduleBuild: scheduleBuild,
    markDirty: markDirty,
    setAutoBuild: setAutoBuild,
    isAutoBuild: isAutoBuild,
    isDirty: isDirty,
    getLastBuildInfo: getLastBuildInfo,
    getMesh: getMesh,
    getBuiltMesh: getBuiltMesh,
    getRoot: getRoot,
    getEditGroup: getEditGroup,
    getBrushes: getBrushes,
    setBrushes: setBrushes,
    findBrush: findBrush,
    findBrushIndex: findBrushIndex,
    upsertBrush: upsertBrush,
    removeBrush: removeBrush,
    reorderBrush: reorderBrush,
    moveBrushTo: moveBrushTo,
    syncBrushTransform: syncBrushTransform,
    applyMaterialChange: applyMaterialChange,
    adjustBrushSize: adjustBrushSize,
    hitsBrushXZ: hitsBrushXZ,
    isSolidAt: isSolidAt,
    pointInBrush: pointInBrush,
    standYAt: standYAt,
    setShowShells: setShowShells,
    setShowBuilt: setShowBuilt,
    setEditorMode: setEditorMode,
    disposeAll: disposeAll,
    createPreviewMesh: createPreviewMesh,
    snap: snap,
    createShapeGeo: createShapeGeo
  };

  console.log('[BSP] full brush system ready');
})();
