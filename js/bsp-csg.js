// ============================================================
//  BSP-CSG.JS — Constructive Solid Geometry (BSP trees)
//  Classic polygon-clip CSG (Evan Wallace style) for Three.js
//  BufferGeometry. Used by BSP brush builder (union / subtract).
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;
  if (!THREE) {
    console.warn('[BspCSG] THREE not ready');
    return;
  }

  var EPS = 1e-5;

  // ---------- Vector helpers (plain arrays for speed) ----------
  function v3(x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; }
  function vclone(a) { return { x: a.x, y: a.y, z: a.z }; }
  function vadd(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
  function vsub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
  function vmul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
  function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function vcross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }
  function vlen(a) { return Math.sqrt(vdot(a, a)); }
  function vnorm(a) {
    var l = vlen(a);
    if (l < 1e-12) return { x: 0, y: 1, z: 0 };
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  }
  function vlerp(a, b, t) {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t
    };
  }

  // ---------- Vertex / Polygon / Plane ----------
  function Vertex(pos, normal, shared) {
    this.pos = pos;
    this.normal = normal || { x: 0, y: 1, z: 0 };
    this.shared = shared || null; // material payload
  }
  Vertex.prototype.clone = function () {
    return new Vertex(vclone(this.pos), vclone(this.normal), this.shared);
  };
  Vertex.prototype.flip = function () {
    this.normal = { x: -this.normal.x, y: -this.normal.y, z: -this.normal.z };
  };
  Vertex.prototype.interpolate = function (other, t) {
    return new Vertex(
      vlerp(this.pos, other.pos, t),
      vnorm(vlerp(this.normal, other.normal, t)),
      this.shared
    );
  };

  function Plane(normal, w) {
    this.normal = normal;
    this.w = w;
  }
  Plane.fromPoints = function (a, b, c) {
    var n = vnorm(vcross(vsub(b, a), vsub(c, a)));
    return new Plane(n, vdot(n, a));
  };
  Plane.prototype.clone = function () {
    return new Plane(vclone(this.normal), this.w);
  };
  Plane.prototype.flip = function () {
    this.normal = { x: -this.normal.x, y: -this.normal.y, z: -this.normal.z };
    this.w = -this.w;
  };
  Plane.prototype.splitPolygon = function (polygon, coplanarFront, coplanarBack, front, back) {
    var COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;
    var types = [];
    var t, type = 0, i, ttype;
    for (i = 0; i < polygon.vertices.length; i++) {
      t = vdot(this.normal, polygon.vertices[i].pos) - this.w;
      ttype = (t < -EPS) ? BACK : (t > EPS) ? FRONT : COPLANAR;
      type |= ttype;
      types.push(ttype);
    }
    switch (type) {
      case COPLANAR:
        (vdot(this.normal, polygon.plane.normal) > 0 ? coplanarFront : coplanarBack).push(polygon);
        break;
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING: {
        var f = [], b = [];
        for (i = 0; i < polygon.vertices.length; i++) {
          var j = (i + 1) % polygon.vertices.length;
          var ti = types[i], tj = types[j];
          var vi = polygon.vertices[i], vj = polygon.vertices[j];
          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(ti === BACK ? vi : vi.clone());
          if ((ti | tj) === SPANNING) {
            t = (this.w - vdot(this.normal, vi.pos)) /
              vdot(this.normal, vsub(vj.pos, vi.pos));
            var v = vi.interpolate(vj, t);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new Polygon(f, polygon.shared));
        if (b.length >= 3) back.push(new Polygon(b, polygon.shared));
        break;
      }
    }
  };

  function Polygon(vertices, shared) {
    this.vertices = vertices;
    this.shared = shared != null ? shared : (vertices[0] && vertices[0].shared);
    this.plane = Plane.fromPoints(vertices[0].pos, vertices[1].pos, vertices[2].pos);
  }
  Polygon.prototype.clone = function () {
    return new Polygon(this.vertices.map(function (v) { return v.clone(); }), this.shared);
  };
  Polygon.prototype.flip = function () {
    this.vertices.reverse().forEach(function (v) { v.flip(); });
    this.plane.flip();
  };

  // ---------- BSP Node ----------
  function Node(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons) this.build(polygons);
  }
  Node.prototype.clone = function () {
    var node = new Node();
    node.plane = this.plane && this.plane.clone();
    node.front = this.front && this.front.clone();
    node.back = this.back && this.back.clone();
    node.polygons = this.polygons.map(function (p) { return p.clone(); });
    return node;
  };
  Node.prototype.invert = function () {
    var i;
    for (i = 0; i < this.polygons.length; i++) this.polygons[i].flip();
    this.plane && this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    var tmp = this.front;
    this.front = this.back;
    this.back = tmp;
  };
  Node.prototype.clipPolygons = function (polygons) {
    if (!this.plane) return polygons.slice();
    var front = [], back = [];
    for (var i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    if (this.back) back = this.back.clipPolygons(back);
    else back = [];
    return front.concat(back);
  };
  Node.prototype.clipTo = function (bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  };
  Node.prototype.allPolygons = function () {
    var list = this.polygons.slice();
    if (this.front) list = list.concat(this.front.allPolygons());
    if (this.back) list = list.concat(this.back.allPolygons());
    return list;
  };
  Node.prototype.build = function (polygons) {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    var front = [], back = [];
    for (var i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      if (!this.front) this.front = new Node();
      this.front.build(front);
    }
    if (back.length) {
      if (!this.back) this.back = new Node();
      this.back.build(back);
    }
  };

  // ---------- CSG object ----------
  function CSG() {
    this.polygons = [];
  }
  CSG.fromPolygons = function (polygons) {
    var c = new CSG();
    c.polygons = polygons;
    return c;
  };
  CSG.prototype.clone = function () {
    return CSG.fromPolygons(this.polygons.map(function (p) { return p.clone(); }));
  };
  CSG.prototype.toPolygons = function () { return this.polygons; };

  CSG.prototype.union = function (csg) {
    var a = new Node(this.clone().polygons);
    var b = new Node(csg.clone().polygons);
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    return CSG.fromPolygons(a.allPolygons());
  };

  CSG.prototype.subtract = function (csg) {
    var a = new Node(this.clone().polygons);
    var b = new Node(csg.clone().polygons);
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromPolygons(a.allPolygons());
  };

  CSG.prototype.intersect = function (csg) {
    var a = new Node(this.clone().polygons);
    var b = new Node(csg.clone().polygons);
    a.invert();
    b.clipTo(a);
    b.invert();
    a.clipTo(b);
    b.clipTo(a);
    a.build(b.allPolygons());
    a.invert();
    return CSG.fromPolygons(a.allPolygons());
  };

  // ---------- Three.js bridges ----------
  function transformPos(m, x, y, z) {
    var e = m.elements;
    var w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    return {
      x: (e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
      y: (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
      z: (e[2] * x + e[6] * y + e[10] * z + e[14]) * w
    };
  }
  function transformDir(m, x, y, z) {
    var e = m.elements;
    return vnorm({
      x: e[0] * x + e[4] * y + e[8] * z,
      y: e[1] * x + e[5] * y + e[9] * z,
      z: e[2] * x + e[6] * y + e[10] * z
    });
  }

  /**
   * Convert BufferGeometry (+ optional Matrix4) to CSG.
   * shared: material payload attached to every polygon/vertex.
   */
  function fromBufferGeometry(geometry, matrix, shared) {
    var pos = geometry.attributes.position;
    var nrm = geometry.attributes.normal;
    var index = geometry.index;
    var polygons = [];
    var i, ia, ib, ic, ax, ay, az, bx, by, bz, cx, cy, cz;
    var na, nb, nc, va, vb, vc, poly;
    var m = matrix || new THREE.Matrix4();

    function tri(i0, i1, i2) {
      ax = pos.getX(i0); ay = pos.getY(i0); az = pos.getZ(i0);
      bx = pos.getX(i1); by = pos.getY(i1); bz = pos.getZ(i1);
      cx = pos.getX(i2); cy = pos.getY(i2); cz = pos.getZ(i2);
      va = transformPos(m, ax, ay, az);
      vb = transformPos(m, bx, by, bz);
      vc = transformPos(m, cx, cy, cz);
      // skip degenerate
      var e1 = vsub(vb, va), e2 = vsub(vc, va);
      if (vlen(vcross(e1, e2)) < 1e-10) return;
      if (nrm) {
        na = transformDir(m, nrm.getX(i0), nrm.getY(i0), nrm.getZ(i0));
        nb = transformDir(m, nrm.getX(i1), nrm.getY(i1), nrm.getZ(i1));
        nc = transformDir(m, nrm.getX(i2), nrm.getY(i2), nrm.getZ(i2));
      } else {
        na = nb = nc = vnorm(vcross(e1, e2));
      }
      poly = new Polygon([
        new Vertex(va, na, shared),
        new Vertex(vb, nb, shared),
        new Vertex(vc, nc, shared)
      ], shared);
      polygons.push(poly);
    }

    if (index) {
      for (i = 0; i < index.count; i += 3) {
        tri(index.getX(i), index.getX(i + 1), index.getX(i + 2));
      }
    } else {
      for (i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2);
    }
    return CSG.fromPolygons(polygons);
  }

  /**
   * CSG → BufferGeometry with per-triangle material groups.
   * Each polygon.shared may be { matKey: string, ... }.
   * Returns { geometry, groups: [{start,count,matKey}] , matKeys: string[] }
   */
  function toBufferGeometry(csg) {
    var polys = csg.toPolygons();
    var positions = [];
    var normals = [];
    var uvs = [];
    var matKeys = [];
    var matIndex = {};
    var groups = []; // temporary per-mat tri lists
    var i, j, p, v0, v1, v2, n, key, mi;

    function ensureKey(k) {
      if (matIndex[k] == null) {
        matIndex[k] = matKeys.length;
        matKeys.push(k);
        groups.push([]);
      }
      return matIndex[k];
    }

    for (i = 0; i < polys.length; i++) {
      p = polys[i];
      if (!p.vertices || p.vertices.length < 3) continue;
      key = (p.shared && p.shared.matKey) ? p.shared.matKey : '_default';
      mi = ensureKey(key);
      // fan triangulation
      for (j = 1; j < p.vertices.length - 1; j++) {
        v0 = p.vertices[0];
        v1 = p.vertices[j];
        v2 = p.vertices[j + 1];
        n = p.plane ? p.plane.normal : v0.normal;
        pushVert(v0, n, p.shared);
        pushVert(v1, n, p.shared);
        pushVert(v2, n, p.shared);
        groups[mi].push(positions.length / 3 - 3, positions.length / 3 - 2, positions.length / 3 - 1);
      }
    }

    function pushVert(v, n, shared) {
      positions.push(v.pos.x, v.pos.y, v.pos.z);
      normals.push(n.x, n.y, n.z);
      // world planar UV from dominant axis
      var ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      var u, vv, scale = (shared && shared.uvScale != null) ? shared.uvScale : 0.25;
      if (ay >= ax && ay >= az) {
        u = v.pos.x * scale;
        vv = v.pos.z * scale;
      } else if (ax >= ay && ax >= az) {
        u = v.pos.z * scale;
        vv = v.pos.y * scale;
      } else {
        u = v.pos.x * scale;
        vv = v.pos.y * scale;
      }
      if (shared) {
        u += shared.uvOffsetU || 0;
        vv += shared.uvOffsetV || 0;
      }
      uvs.push(u, vv);
    }

    // Rebuild as sequential groups for multi-material
    var outPos = [], outNrm = [], outUv = [];
    var geoGroups = [];
    var vertCount = 0;
    for (mi = 0; mi < matKeys.length; mi++) {
      var start = vertCount;
      var idxs = groups[mi];
      // idxs stored as triplets of vertex indices into previous positions — wrong approach
      // Simpler: rebuild during fan into per-mat buffers
    }

    // Rebuild cleanly: second pass into ordered multi-mat buffers
    outPos = []; outNrm = []; outUv = [];
    geoGroups = [];
    var matTriVerts = {};
    matKeys.forEach(function (k) { matTriVerts[k] = []; });

    for (i = 0; i < polys.length; i++) {
      p = polys[i];
      if (!p.vertices || p.vertices.length < 3) continue;
      key = (p.shared && p.shared.matKey) ? p.shared.matKey : '_default';
      n = p.plane ? p.plane.normal : p.vertices[0].normal;
      for (j = 1; j < p.vertices.length - 1; j++) {
        appendTri(matTriVerts[key], p.vertices[0], p.vertices[j], p.vertices[j + 1], n, p.shared);
      }
    }

    function appendTri(arr, a, b, c, n, shared) {
      pack(arr, a, n, shared);
      pack(arr, b, n, shared);
      pack(arr, c, n, shared);
    }
    function pack(arr, v, n, shared) {
      arr.push(v.pos.x, v.pos.y, v.pos.z, n.x, n.y, n.z);
      var ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      var scale = (shared && shared.uvScale != null) ? shared.uvScale : 0.25;
      var u, vv;
      if (ay >= ax && ay >= az) { u = v.pos.x * scale; vv = v.pos.z * scale; }
      else if (ax >= ay && ax >= az) { u = v.pos.z * scale; vv = v.pos.y * scale; }
      else { u = v.pos.x * scale; vv = v.pos.y * scale; }
      if (shared) { u += shared.uvOffsetU || 0; vv += shared.uvOffsetV || 0; }
      arr.push(u, vv);
    }

    outPos = []; outNrm = []; outUv = [];
    geoGroups = [];
    vertCount = 0;
    for (mi = 0; mi < matKeys.length; mi++) {
      key = matKeys[mi];
      var data = matTriVerts[key];
      var startV = vertCount;
      for (i = 0; i < data.length; i += 8) {
        outPos.push(data[i], data[i + 1], data[i + 2]);
        outNrm.push(data[i + 3], data[i + 4], data[i + 5]);
        outUv.push(data[i + 6], data[i + 7]);
        vertCount++;
      }
      if (vertCount > startV) {
        geoGroups.push({ start: startV, count: vertCount - startV, matKey: key, materialIndex: mi });
      }
    }

    var geo = new THREE.BufferGeometry();
    if (!outPos.length) {
      // empty solid
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
      return { geometry: geo, groups: [], matKeys: [] };
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(outPos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(outNrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(outUv, 2));
    for (i = 0; i < geoGroups.length; i++) {
      geo.addGroup(geoGroups[i].start, geoGroups[i].count, geoGroups[i].materialIndex);
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return { geometry: geo, groups: geoGroups, matKeys: matKeys };
  }

  /**
   * Build unit shape geometry (local space, centered).
   * shape: box | cylinder | wedge | cone | stairs | sheet
   */
  function createShapeGeometry(shape, segments) {
    segments = segments || 16;
    shape = shape || 'box';
    if (shape === 'cylinder') return new THREE.CylinderGeometry(0.5, 0.5, 1, Math.max(8, segments), 1);
    if (shape === 'cone') return new THREE.ConeGeometry(0.5, 1, Math.max(8, segments));
    if (shape === 'sheet') return new THREE.BoxGeometry(1, 0.05, 1); // thin slab, scale Y for thickness
    if (shape === 'stairs') return createStairsGeometry(segments || 8);
    if (shape === 'wedge') {
      var geo = new THREE.BufferGeometry();
      var hw = 0.5, hh = 0.5, hd = 0.5;
      // prism: bottom rectangle + slope to -X top edge
      var verts = [
        -hw, -hh, -hd,  hw, -hh, -hd,  hw, -hh, hd,  -hw, -hh, hd,
        -hw,  hh, -hd, -hw,  hh,  hd
      ];
      var idx = [
        0, 1, 2, 0, 2, 3, // bottom
        1, 4, 5, 1, 5, 2, // slope
        0, 3, 5, 0, 5, 4, // back
        0, 4, 1, // end -Z
        3, 2, 5  // end +Z
      ];
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      return geo;
    }
    return new THREE.BoxGeometry(1, 1, 1);
  }

  function createStairsGeometry(steps) {
    steps = Math.max(2, Math.min(32, steps || 8));
    var positions = [];
    var indices = [];
    var vi = 0;
    function box(x0, y0, z0, x1, y1, z1) {
      // 8 corners, 12 tris
      var c = [
        [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
        [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]
      ];
      var base = vi;
      for (var i = 0; i < 8; i++) {
        positions.push(c[i][0], c[i][1], c[i][2]);
        vi++;
      }
      var faces = [
        [0, 1, 2, 0, 2, 3], // bot
        [4, 6, 5, 4, 7, 6], // top
        [0, 4, 5, 0, 5, 1], // -z
        [3, 2, 6, 3, 6, 7], // +z
        [0, 3, 7, 0, 7, 4], // -x
        [1, 5, 6, 1, 6, 2]  // +x
      ];
      for (var f = 0; f < faces.length; f++) {
        for (var k = 0; k < 6; k++) indices.push(base + faces[f][k]);
      }
    }
    // unit stairs along +X rising +Y, depth Z full
    for (var s = 0; s < steps; s++) {
      var t0 = s / steps - 0.5;
      var t1 = (s + 1) / steps - 0.5;
      var y0 = -0.5;
      var y1 = (s + 1) / steps - 0.5;
      box(t0, y0, -0.5, t1, y1, 0.5);
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /** Editor shell colors (red/pink) must never tint built surfaces */
  function isEditorShellColor(c) {
    if (typeof c !== 'number') return false;
    var r = (c >> 16) & 0xff;
    var g = (c >> 8) & 0xff;
    var b = c & 0xff;
    // pink/red shell for subtract, cyan/blue for add preview
    if (r > 180 && g < 120 && b < 160) return true;
    if (r < 100 && g > 120 && b > 180) return true;
    return false;
  }

  /**
   * Resolve material for built geometry (not editor wire color).
   * Sub faces: white tint (no paint), texture from sub or inherited from solid.
   */
  function resolveBuildMaterial(brush, inheritShared) {
    var isSub = brush.op === 'sub';
    var tex = brush.texture || '';
    var col = (typeof brush.color === 'number') ? brush.color : (isSub ? 0xffffff : 0xb0a090);
    var uv = brush.uvScale != null ? brush.uvScale : 0.25;
    var uvU = brush.uvOffsetU || 0;
    var uvV = brush.uvOffsetV || 0;
    var rough = brush.roughness != null ? brush.roughness : 0.88;
    var metal = brush.metalness != null ? brush.metalness : 0.05;

    // strip editor-only red/pink/blue shell colors
    if (isEditorShellColor(col)) col = 0xffffff;

    if (isSub) {
      // cut faces: never tint — white multiplies texture 1:1
      col = 0xffffff;
      // inherit texture from the solid being carved if sub has none
      if (!tex && inheritShared) {
        tex = inheritShared.texture || '';
        if (inheritShared.uvScale != null) uv = inheritShared.uvScale;
        if (inheritShared.uvOffsetU != null) uvU = inheritShared.uvOffsetU;
        if (inheritShared.uvOffsetV != null) uvV = inheritShared.uvOffsetV;
        if (inheritShared.roughness != null) rough = inheritShared.roughness;
        if (inheritShared.metalness != null) metal = inheritShared.metalness;
      }
    }

    return {
      texture: tex,
      color: col,
      uvScale: uv,
      uvOffsetU: uvU,
      uvOffsetV: uvV,
      roughness: rough,
      metalness: metal
    };
  }

  /**
   * Brush data → CSG solid in world space.
   * matOverride: optional resolved material (from resolveBuildMaterial).
   */
  function fromBrush(brush, matOverride) {
    var shape = brush.shape || 'box';
    var segs = brush.segments || (shape === 'cylinder' || shape === 'cone' ? 20 : 8);
    if (shape === 'stairs') segs = brush.steps || 8;
    var geo = createShapeGeometry(shape, segs);
    var mat = new THREE.Matrix4();
    var q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      brush.rotation && brush.rotation.x || 0,
      brush.rotation && brush.rotation.y || 0,
      brush.rotation && brush.rotation.z || 0,
      'XYZ'
    ));
    var pos = new THREE.Vector3(
      brush.position.x || 0,
      brush.position.y || 0,
      brush.position.z || 0
    );
    var scl = new THREE.Vector3(
      Math.max(0.05, brush.size && brush.size.x || 1),
      Math.max(0.05, brush.size && brush.size.y || 1),
      Math.max(0.05, brush.size && brush.size.z || 1)
    );
    if (shape === 'sheet') {
      scl.y = Math.max(0.05, brush.size && brush.size.y || 0.2);
    }
    mat.compose(pos, q, scl);

    var rm = matOverride || resolveBuildMaterial(brush, null);
    var shared = {
      matKey: materialKeyFromResolved(rm),
      brushId: brush.id,
      texture: rm.texture || '',
      color: rm.color,
      uvScale: rm.uvScale,
      uvOffsetU: rm.uvOffsetU,
      uvOffsetV: rm.uvOffsetV,
      roughness: rm.roughness,
      metalness: rm.metalness
    };

    var csg = fromBufferGeometry(geo, mat, shared);
    geo.dispose();
    return csg;
  }

  function materialKeyFromResolved(rm) {
    var tex = (rm && rm.texture) || '';
    var col = (rm && typeof rm.color === 'number') ? rm.color : 0xffffff;
    var uv = (rm && rm.uvScale != null) ? rm.uvScale : 0.25;
    return tex + '|' + (col >>> 0).toString(16) + '|' + uv;
  }

  function materialKey(brush) {
    return materialKeyFromResolved(resolveBuildMaterial(brush, null));
  }

  /**
   * Build final solid from ordered brush list.
   * Sub cut-faces inherit texture from last additive (no red tint).
   */
  function buildFromBrushes(brushes) {
    var result = null;
    var i, b, csg, n = 0;
    var lastAddShared = null;

    for (i = 0; i < brushes.length; i++) {
      b = brushes[i];
      if (!b || b.disabled) continue;

      var rm = resolveBuildMaterial(b, b.op === 'sub' ? lastAddShared : null);
      try {
        csg = fromBrush(b, rm);
      } catch (e) {
        console.warn('[BspCSG] fromBrush fail', b.id, e);
        continue;
      }
      if (!csg.polygons.length) continue;

      if (!result) {
        if (b.op === 'sub') continue;
        result = csg;
        lastAddShared = rm;
        n++;
        continue;
      }
      try {
        if (b.op === 'sub') {
          result = result.subtract(csg);
        } else {
          result = result.union(csg);
          lastAddShared = rm;
        }
        n++;
      } catch (e) {
        console.warn('[BspCSG] op fail', b.op, b.id, e);
      }
    }
    if (!result || !result.polygons.length) return null;

    // sanitize any leftover editor shell colors on polygons
    result.polygons.forEach(function (p) {
      if (!p.shared) return;
      if (isEditorShellColor(p.shared.color)) {
        p.shared.color = 0xffffff;
        p.shared.matKey = materialKeyFromResolved(p.shared);
      }
    });

    var out = toBufferGeometry(result);
    out.brushCount = n;
    out.sharedByKey = {};
    result.polygons.forEach(function (p) {
      if (!p.shared || !p.shared.matKey) return;
      if (!out.sharedByKey[p.shared.matKey]) out.sharedByKey[p.shared.matKey] = p.shared;
    });
    return out;
  }

  window.BspCSG = {
    CSG: CSG,
    fromBufferGeometry: fromBufferGeometry,
    toBufferGeometry: toBufferGeometry,
    fromBrush: fromBrush,
    buildFromBrushes: buildFromBrushes,
    createShapeGeometry: createShapeGeometry,
    materialKey: materialKey,
    EPS: EPS
  };

  console.log('[BspCSG] ready');
})();
