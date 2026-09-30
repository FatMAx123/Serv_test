// ============================================================
//  VILLAGE-GROUND.JS — дороги / площади / трава на террейне
//  Метки из F2 (GROUND_MARKS) + хелперы для блочного прототипа.
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;

  var root = null;
  var MAT = null;
  var batch = null;
  var _m4, _eu, _q, _p, _s;

  function ty(x, z) {
    var T = window.Terrain;
    return (T && T.heightAt) ? T.heightAt(x, z) : 0;
  }
  function loadMat(rel, opts) {
    opts = opts || {};
    var THREE = window.THREE;
    var mat = new THREE.MeshStandardMaterial({
      color: opts.color != null ? opts.color : 0xffffff,
      roughness: opts.roughness != null ? opts.roughness : 0.92,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      depthWrite: true
    });
    mat.userData.noCast = true;
    if (rel && typeof window.loadTex === 'function') {
      window.loadTex(rel, function (tex) {
        if (!tex || !mat) return;
        var c = tex.clone ? tex.clone() : tex;
        c.wrapS = THREE.RepeatWrapping;
        c.wrapT = THREE.RepeatWrapping;
        if (THREE.SRGBColorSpace) c.colorSpace = THREE.SRGBColorSpace;
        c.repeat.set(opts.ru || 3, opts.rv || 3);
        c.anisotropy = 4;
        c.needsUpdate = true;
        mat.map = c;
        mat.needsUpdate = true;
      });
    }
    return mat;
  }
  function mats() {
    if (MAT) return MAT;
    MAT = {
      road: loadMat('town_cobblestone.webp', { color: 0xb8a888, ru: 3, rv: 3 }),
      plaza: loadMat('town_cobblestone.webp', { color: 0xc4b49a, ru: 4, rv: 4 }),
      grass: loadMat('020_Dense_Green_grass_BaseColor.webp', { color: 0x6a8a48, ru: 4, rv: 4 })
    };
    return MAT;
  }
  function scaleUv(geo, su, sv) {
    var uv = geo.attributes.uv;
    if (!uv || (!su && !sv)) return;
    var i, n = uv.count;
    su = su || 1; sv = sv || 1;
    for (i = 0; i < n; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  function Batcher() { this.buckets = {}; }
  Batcher.prototype.box = function (mat, w, h, d, x, y, z, ry, su, sv) {
    var geo = new THREE.BoxGeometry(w, h, d);
    scaleUv(geo, su, sv);
    _eu.set(0, ry || 0, 0, 'YXZ');
    _q.setFromEuler(_eu);
    _p.set(x, y, z);
    _m4.compose(_p, _q, _s);
    geo.applyMatrix4(_m4);
    var b = this.buckets[mat.uuid];
    if (!b) b = this.buckets[mat.uuid] = { mat: mat, geos: [] };
    b.geos.push(geo);
  };
  Batcher.prototype.flush = function (parent) {
    var id, b, THREE = window.THREE;
    for (id in this.buckets) {
      b = this.buckets[id];
      var geo = mergeGeos(b.geos);
      if (!geo) continue;
      var mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.buckets = {};
  };
  function mergeGeos(list) {
    var THREE = window.THREE, i, g, k, vc, posCount = 0, idxCount = 0;
    if (!list.length) return null;
    if (list.length === 1) return list[0];
    for (i = 0; i < list.length; i++) {
      g = list[i];
      vc = g.attributes.position.count;
      posCount += vc;
      idxCount += g.index ? g.index.count : vc;
    }
    var pos = new Float32Array(posCount * 3);
    var nrm = new Float32Array(posCount * 3);
    var uvs = new Float32Array(posCount * 2);
    var idx = posCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
    var po = 0, uo = 0, io = 0, vo = 0;
    for (i = 0; i < list.length; i++) {
      g = list[i];
      pos.set(g.attributes.position.array, po);
      if (g.attributes.normal) nrm.set(g.attributes.normal.array, po);
      po += g.attributes.position.array.length;
      if (g.attributes.uv) { uvs.set(g.attributes.uv.array, uo); uo += g.attributes.uv.array.length; }
      else uo += g.attributes.position.count * 2;
      vc = g.attributes.position.count;
      if (g.index) {
        var ia = g.index.array;
        for (k = 0; k < ia.length; k++) idx[io++] = ia[k] + vo;
      } else {
        for (k = 0; k < vc; k++) idx[io++] = vo + k;
      }
      vo += vc;
      g.dispose();
    }
    var out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    out.computeBoundingBox();
    return out;
  }

  function matOf(surface) {
    var M = mats();
    if (surface === 'grass') return M.grass;
    if (surface === 'plaza') return M.plaza;
    return M.road;
  }

  function uvToWorld(poly) {
    var WM = window.WorldMetrics;
    if (!WM || !poly) return [];
    return poly.map(function (p) {
      return { x: WM.wx(p[0]), z: WM.wz(p[1]) };
    });
  }

  function pointInPoly(x, z, pts) {
    var i, j, c = false, n = pts.length;
    for (i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[i].x, zi = pts[i].z, xj = pts[j].x, zj = pts[j].z;
      if (((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi)) c = !c;
    }
    return c;
  }

  function paintPatch(x, z, w, d, mat) {
    var y = ty(x, z) + 0.06;
    batch.box(mat, w, 0.1, d, x, y, z, 0, w / 2.4, d / 2.4);
  }

  function paintLine(pts, width, mat) {
    if (!pts || pts.length < 2) return;
    width = width || 8;
    var i, a, b, dx, dz, len, steps, s, t, mx, mz, yaw, seg;
    for (i = 0; i < pts.length - 1; i++) {
      a = pts[i]; b = pts[i + 1];
      dx = b.x - a.x; dz = b.z - a.z;
      len = Math.hypot(dx, dz);
      if (len < 0.4) continue;
      yaw = Math.atan2(dx, dz);
      steps = Math.max(1, Math.ceil(len / 5.5));
      seg = len / steps;
      for (s = 0; s < steps; s++) {
        t = (s + 0.5) / steps;
        mx = a.x + dx * t;
        mz = a.z + dz * t;
        var y = ty(mx, mz) + 0.06;
        batch.box(mat, width, 0.1, seg + 0.25, mx, y, mz, yaw, width / 2.4, (seg + 0.25) / 2.4);
      }
    }
  }

  function paintPoly(pts, mat, step) {
    if (!pts || pts.length < 3) return;
    step = step || 5.5;
    var minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity, i;
    for (i = 0; i < pts.length; i++) {
      if (pts[i].x < minx) minx = pts[i].x;
      if (pts[i].x > maxx) maxx = pts[i].x;
      if (pts[i].z < minz) minz = pts[i].z;
      if (pts[i].z > maxz) maxz = pts[i].z;
    }
    var x, z;
    for (x = minx; x < maxx; x += step) {
      for (z = minz; z < maxz; z += step) {
        var cx = x + step * 0.5, cz = z + step * 0.5;
        if (!pointInPoly(cx, cz, pts)) continue;
        paintPatch(cx, cz, step + 0.2, step + 0.2, mat);
      }
    }
  }

  function paintRing(cx, cz, r, width, mat, segs) {
    segs = segs || 24;
    var i, a0, a1, pts = [];
    for (i = 0; i <= segs; i++) {
      var a = (i / segs) * Math.PI * 2;
      pts.push({ x: cx + Math.sin(a) * r, z: cz - Math.cos(a) * r });
    }
    paintLine(pts, width, mat);
  }

  function paintMark(m) {
    if (!m) return;
    var pts = m._world || uvToWorld(m.poly);
    if (!pts.length) return;
    var mat = matOf(m.surface);
    if (m.kind === 'line') paintLine(pts, m.width || 8, mat);
    else paintPoly(pts, mat, m.surface === 'grass' ? 6.5 : 5.5);
  }

  function dispose() {
    if (root && root.parent) root.parent.remove(root);
    if (root) {
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
      });
    }
    root = null;
    MAT = null;
    batch = null;
  }

  function rebuild(scene) {
    var THREE = window.THREE;
    if (!THREE) return null;
    var parent = scene || (root && root.parent) || (window.game && window.game.scene);
    dispose();
    _m4 = new THREE.Matrix4();
    _eu = new THREE.Euler();
    _q = new THREE.Quaternion();
    _p = new THREE.Vector3();
    _s = new THREE.Vector3(1, 1, 1);
    root = new THREE.Group();
    root.name = 'VillageGround';
    root.userData = { isWorldObject: true, worldKey: 'village_ground', name: 'Земля (дороги/трава/площади)' };

    var WM = window.WorldMetrics;
    var list = (WM && WM.listGroundMarks) ? WM.listGroundMarks() : [];
    var i;
    for (i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m) continue;
      var markGroup = new THREE.Group();
      markGroup.name = 'ground_' + m.id;
      markGroup.userData = {
        isGroundMark: true,
        groundId: m.id,
        groundMark: m,
        editorLabel: (m.surface === 'grass' ? 'Трава' : m.surface === 'plaza' ? 'Площадь' : 'Дорога') + ' (' + m.id + ')'
      };
      batch = new Batcher();
      paintMark(m);
      batch.flush(markGroup);
      batch = null;
      markGroup.traverse(function (c) {
        if (c.isMesh) {
          c.userData = markGroup.userData;
        }
      });
      root.add(markGroup);
    }

    if (parent) parent.add(root);
    return root;
  }

  window.VillageGround = {
    build: rebuild,
    rebuild: rebuild,
    dispose: dispose,
    paintLine: paintLine,
    paintPoly: paintPoly,
    paintRing: paintRing,
    paintPatch: paintPatch,
    get root() { return root; }
  };
})();
