// ============================================================
//  VILLAGE-FORT.JS — стены Деревни поющей стали
//  Линия из F2-метки «Стены с башнями»: куртина + башни + ворота.
//  Стиль: средневековье + стимпанк (камень, клёпаное железо, латунь, трубы).
// ============================================================
(function () {
  'use strict';
  var THREE = window.THREE;

  var SITE_ID = 'site_1787165562444_1';
  var FALLBACK_UV = [
    [0.3912390443154275, 0.49172346025102065],
    [0.40896786376965105, 0.513887142871341],
    [0.4947822652350507, 0.5612063007734385]
  ];

  var WALL_H = 8.4;
  var WALL_T = 3.15;
  var WALK_H = 0.28;
  var MERLON_H = 1.55;
  var TOWER_R = 3.35;
  var TOWER_H = 14.5;
  var CORNER_R = 4.1;
  var CORNER_H = 18.2;
  var GATE_OPEN = 14.0;
  var GATE_SPAN = 22.0;
  var GATE_FLANK_R = 2.85;
  var TOWER_SPACING = 58;

  var root = null;
  var collWalls = [];   // {x0,z0,x1,z1,hw}
  var collTowers = [];  // {x,z,r}
  var collGates = [];   // {x,z,dx,dz,halfOpen}

  function terrainY(x, z) {
    var T = window.Terrain;
    if (T && typeof T.heightAt === 'function') return T.heightAt(x, z);
    return 0;
  }

  function loadMat(rel, opts) {
    opts = opts || {};
    var mat = new THREE.MeshStandardMaterial({
      color: opts.color != null ? opts.color : 0xffffff,
      roughness: opts.roughness != null ? opts.roughness : 0.86,
      metalness: opts.metalness != null ? opts.metalness : 0.04,
      emissive: opts.emissive != null ? opts.emissive : 0x000000,
      emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 0,
      side: THREE.FrontSide
    });
    if (rel && typeof window.loadTex === 'function') {
      window.loadTex(rel, function (tex) {
        if (!tex || !mat) return;
        var c = tex.clone ? tex.clone() : tex;
        c.wrapS = THREE.RepeatWrapping;
        c.wrapT = THREE.RepeatWrapping;
        if (THREE.SRGBColorSpace) c.colorSpace = THREE.SRGBColorSpace;
        c.repeat.set(opts.ru || 2, opts.rv || 2);
        c.anisotropy = 4;
        c.needsUpdate = true;
        mat.map = c;
        mat.needsUpdate = true;
      });
    }
    return mat;
  }

  var MAT = null;
  function mats() {
    if (MAT) return MAT;
    MAT = {
      stone: loadMat('town_cobblestone.webp', { color: 0xb8a890, ru: 2.2, rv: 1.6, roughness: 0.9 }),
      brick: loadMat('menu/dlv_stonebrk1a.webp', { color: 0xc4b09a, ru: 2.4, rv: 2.0, roughness: 0.88 }),
      brickB: loadMat('menu/dlv_stonebrk4b.webp', { color: 0x9a8874, ru: 1.6, rv: 2.4, roughness: 0.9 }),
      wood: loadMat('menu/dlv_wood6c.webp', { color: 0x8a6238, ru: 1.4, rv: 1.2, roughness: 0.82 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x3a3c44, roughness: 0.42, metalness: 0.78 }),
      ironDark: new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.38, metalness: 0.82 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.32, metalness: 0.88 }),
      copper: new THREE.MeshStandardMaterial({ color: 0x8a4e2c, roughness: 0.4, metalness: 0.72 }),
      glow: new THREE.MeshStandardMaterial({
        color: 0xff7a22, emissive: 0xff5510, emissiveIntensity: 1.35,
        roughness: 0.5, metalness: 0.2, side: THREE.FrontSide
      })
    };
    MAT.iron.userData.noCast = true;
    MAT.ironDark.userData.noCast = true;
    MAT.brass.userData.noCast = true;
    MAT.copper.userData.noCast = true;
    MAT.glow.userData.noCast = true;
    return MAT;
  }

  function mesh(geo, mat, x, y, z, rx, ry, rz) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx) m.rotation.x = rx;
    if (ry) m.rotation.y = ry;
    if (rz) m.rotation.z = rz;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function addBox(parent, mat, w, h, d, x, y, z, ry) {
    var m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, 0, ry || 0, 0);
    parent.add(m);
    return m;
  }

  function addCyl(parent, mat, rTop, rBot, h, seg, x, y, z, rx, ry) {
    var m = mesh(new THREE.CylinderGeometry(rTop, rBot, h, seg || 10), mat, x, y, z, rx || 0, ry || 0, 0);
    parent.add(m);
    return m;
  }

  function siteBlob(s) {
    return String((s && s.name) || '') + ' ' + String((s && s.note) || '') + ' ' + String((s && s.type) || '');
  }

  function classifySite(s) {
    var t = siteBlob(s).toLowerCase();
    if (/ворот|gate/.test(t)) return 'gate';
    if (/башн|tower/.test(t)) return 'wall_towers';
    if (s && s.type === 'wall') return 'wall_towers';
    if (/стен|wall/.test(t)) return 'wall';
    return 'wall';
  }

  function uvToWorld(poly) {
    var WM = window.WorldMetrics;
    if (!WM || typeof WM.wx !== 'function') {
      return (poly || []).map(function (p) { return { x: p[0], z: p[1] }; });
    }
    return (poly || []).map(function (p) { return { x: WM.wx(p[0]), z: WM.wz(p[1]) }; });
  }

  function collectJobs() {
    var WM = window.WorldMetrics;
    var list = (WM && WM.listBuildSites) ? (WM.listBuildSites() || []) : [];
    var jobs = [];
    var i, s, pts, path, kind;
    for (i = 0; i < list.length; i++) {
      s = list[i];
      if (!s || s.kind !== 'line' || !s.poly || s.poly.length < 2) continue;
      kind = classifySite(s);
      pts = uvToWorld(s.poly);
      path = makePath(pts);
      if (!path.total || !path.segs.length) continue;
      jobs.push({ site: s, kind: kind, pts: pts, path: path });
    }
    if (!jobs.length) {
      pts = uvToWorld(FALLBACK_UV);
      path = makePath(pts);
      if (path.total) {
        jobs.push({
          site: { id: SITE_ID, name: 'Стены с башнями' },
          kind: 'wall_towers', pts: pts, path: path
        });
      }
    }
    return jobs;
  }

  function makePath(pts) {
    var segs = [];
    var total = 0;
    var i, d, dx, dz;
    for (i = 0; i < pts.length - 1; i++) {
      dx = pts[i + 1].x - pts[i].x;
      dz = pts[i + 1].z - pts[i].z;
      d = Math.hypot(dx, dz);
      if (d < 0.2) continue;
      segs.push({
        x0: pts[i].x, z0: pts[i].z, x1: pts[i + 1].x, z1: pts[i + 1].z,
        dx: dx / d, dz: dz / d, len: d, s0: total, s1: total + d
      });
      total += d;
    }
    function at(s) {
      var t = Math.max(0, Math.min(total, s));
      var g, u, k;
      for (k = 0; k < segs.length; k++) {
        g = segs[k];
        if (t <= g.s1 || k === segs.length - 1) {
          u = g.len > 1e-6 ? (t - g.s0) / g.len : 0;
          u = Math.max(0, Math.min(1, u));
          return {
            x: g.x0 + (g.x1 - g.x0) * u,
            z: g.z0 + (g.z1 - g.z0) * u,
            dx: g.dx, dz: g.dz,
            yaw: Math.atan2(g.dx, g.dz)
          };
        }
      }
      g = segs[segs.length - 1];
      return { x: g.x1, z: g.z1, dx: g.dx, dz: g.dz, yaw: Math.atan2(g.dx, g.dz) };
    }
    return { segs: segs, total: total, at: at };
  }

  function overlapsReserve(s, reserves) {
    var i, r;
    for (i = 0; i < reserves.length; i++) {
      r = reserves[i];
      if (s < r.b && s + 0.05 > r.a) return true;
    }
    return false;
  }

  function addGear(parent, mat, radius, thick, teeth, x, y, z, rx, ry, rz) {
    var g = new THREE.Group();
    addCyl(g, mat, radius * 0.55, radius * 0.55, thick, 12, 0, 0, 0);
    addCyl(g, mats().ironDark, radius * 0.18, radius * 0.18, thick + 0.12, 8, 0, 0, 0);
    var i, ang, tooth;
    var tw = radius * 0.28, th = radius * 0.34;
    for (i = 0; i < teeth; i++) {
      ang = (i / teeth) * Math.PI * 2;
      tooth = mesh(new THREE.BoxGeometry(tw, thick * 0.9, th), mat,
        Math.sin(ang) * radius * 0.82, 0, Math.cos(ang) * radius * 0.82, 0, ang, 0);
      g.add(tooth);
    }
    g.position.set(x, y, z);
    if (rx) g.rotation.x = rx;
    if (ry) g.rotation.y = ry;
    if (rz) g.rotation.z = rz;
    parent.add(g);
    return g;
  }

  function addPipes(parent, n, radius, height, spread) {
    var i, ang, px, pz, h, M = mats();
    for (i = 0; i < n; i++) {
      ang = (i / n) * Math.PI * 2 + 0.2;
      px = Math.sin(ang) * spread;
      pz = Math.cos(ang) * spread;
      h = height * (0.55 + (i % 3) * 0.12);
      addCyl(parent, i % 2 ? M.brass : M.copper, radius, radius, h, 6, px, h * 0.5, pz);
      addCyl(parent, M.brass, radius * 1.35, radius * 1.35, 0.22, 8, px, h, pz);
      if (i % 2 === 0) {
        addCyl(parent, M.copper, radius * 0.7, radius * 0.7, 0.9, 6, px, h + 0.4, pz, Math.PI / 2, ang);
      }
    }
  }

  function addMerlonsRing(parent, radius, count, y) {
    var i, ang, M = mats();
    for (i = 0; i < count; i++) {
      ang = (i / count) * Math.PI * 2;
      addBox(parent, M.iron, 0.55, MERLON_H, 0.72,
        Math.sin(ang) * radius, y + MERLON_H * 0.5, Math.cos(ang) * radius, ang);
      addCyl(parent, M.brass, 0.08, 0.08, 0.28, 6,
        Math.sin(ang) * radius, y + MERLON_H + 0.1, Math.cos(ang) * radius);
    }
  }

  function buildTower(parent, x, z, yaw, opts) {
    opts = opts || {};
    var R = opts.r || TOWER_R;
    var H = opts.h || TOWER_H;
    var M = mats();
    var y0 = terrainY(x, z);
    var g = new THREE.Group();
    g.position.set(x, y0, z);
    g.rotation.y = yaw || 0;

    addCyl(g, M.brickB, R + 0.55, R + 0.75, 1.15, 12, 0, 0.55, 0);
    addCyl(g, M.stone, R, R * 0.96, H, 12, 0, 1.1 + H * 0.5, 0);
    addCyl(g, M.iron, R + 0.08, R + 0.08, 0.32, 14, 0, 3.2, 0);
    addCyl(g, M.iron, R + 0.06, R + 0.06, 0.28, 14, 0, 1.1 + H * 0.62, 0);
    addCyl(g, M.brass, R + 0.12, R + 0.12, 0.14, 14, 0, 1.1 + H * 0.62 + 0.22, 0);

    var sl = 4, a, sx, sz;
    for (a = 0; a < sl; a++) {
      sx = Math.sin(a * Math.PI * 0.5 + 0.4) * (R - 0.15);
      sz = Math.cos(a * Math.PI * 0.5 + 0.4) * (R - 0.15);
      addBox(g, M.ironDark, 0.55, 1.35, 0.18, sx, 4.4, sz, a * Math.PI * 0.5 + 0.4);
      addBox(g, M.glow, 0.32, 0.55, 0.06, sx * 1.02, 8.2, sz * 1.02, a * Math.PI * 0.5 + 0.4);
    }

    addPipes(g, opts.corner ? 6 : 4, 0.13, H * 0.7, R + 0.22);
    addCyl(g, M.copper, 0.55, 0.6, 1.6, 10, R * 0.15, 3.4, -R * 0.85);
    addCyl(g, M.brass, 0.22, 0.22, 0.5, 8, R * 0.15, 4.3, -R * 0.85);

    var deckY = 1.1 + H;
    addCyl(g, M.wood, R + 0.45, R + 0.45, 0.22, 12, 0, deckY, 0);
    addCyl(g, M.iron, R + 0.55, R + 0.5, 0.16, 12, 0, deckY + 0.16, 0);
    addMerlonsRing(g, R + 0.35, opts.corner ? 12 : 10, deckY + 0.16);

    addCyl(g, M.ironDark, 0.25, R * 0.92, 2.6, 10, 0, deckY + 1.55, 0);
    addCyl(g, M.brass, 0.35, 0.28, 1.5, 8, 0.15, deckY + 3.5, 0.1);
    addCyl(g, M.glow, 0.2, 0.16, 0.45, 6, 0.15, deckY + 4.35, 0.1);

    if (opts.corner) {
      addBox(g, M.wood, 0.08, 2.4, 1.3, 0.15, deckY + 4.6, R * 0.2, 0.4);
      addBox(g, M.brass, 0.06, 2.2, 1.1, 0.2, deckY + 4.6, R * 0.2, 0.4);
    }

    parent.add(g);
    collTowers.push({ x: x, z: z, r: R + 0.7 });
    return g;
  }

  function buildGate(parent, p, opts) {
    opts = opts || {};
    var OPEN = opts.open != null ? opts.open : GATE_OPEN;
    OPEN = Math.max(11.0, Math.min(26.0, OPEN));
    var FR = GATE_FLANK_R;
    var M = mats();
    var y0 = terrainY(p.x, p.z);
    var g = new THREE.Group();
    g.position.set(p.x, y0, p.z);
    g.rotation.y = p.yaw;
    var side = OPEN * 0.5 + FR + 0.15;
    var lintelY = 12.4;
    var depth = WALL_T + 2.4;

    function flank(sign) {
      var tg = new THREE.Group();
      tg.position.set(0, 0, sign * side);
      addCyl(tg, M.brickB, FR + 0.45, FR + 0.7, 1.25, 12, 0, 0.6, 0);
      addCyl(tg, M.stone, FR, FR * 0.96, 15.2, 12, 0, 8.2, 0);
      addCyl(tg, M.iron, FR + 0.08, FR + 0.08, 0.3, 14, 0, 5.6, 0);
      addCyl(tg, M.brass, FR + 0.12, FR + 0.12, 0.16, 14, 0, 10.4, 0);
      addCyl(tg, M.wood, FR + 0.4, FR + 0.4, 0.22, 12, 0, 16.0, 0);
      addMerlonsRing(tg, FR + 0.25, 10, 16.05);
      addCyl(tg, M.ironDark, 0.28, FR * 0.85, 2.4, 10, 0, 17.5, 0);
      addCyl(tg, M.brass, 0.28, 0.22, 1.4, 8, 0.15, 18.9, 0);
      addCyl(tg, M.glow, 0.16, 0.12, 0.4, 6, 0.15, 19.7, 0);
      addPipes(tg, 4, 0.12, 9.5, FR + 0.18);
      addBox(tg, M.glow, 0.4, 0.7, 0.08, FR * 0.92, 7.4, 0);
      g.add(tg);
      var wx = p.x + p.dx * sign * side;
      var wz = p.z + p.dz * sign * side;
      collTowers.push({ x: wx, z: wz, r: FR + 0.65 });
      return { x: wx, z: wz };
    }
    var fL = flank(-1);
    var fR = flank(1);

    // глубокая арка / перемычка
    addBox(g, M.stone, depth, 3.6, OPEN + FR * 1.6, 0, lintelY, 0);
    addBox(g, M.brickB, depth + 0.4, 1.15, OPEN + FR * 1.9, 0, lintelY + 2.15, 0);
    addBox(g, M.iron, depth + 0.55, 0.28, OPEN + FR * 2.1, 0, lintelY + 2.75, 0);
    addBox(g, M.brass, depth * 0.7, 0.12, OPEN + FR, 0, lintelY + 2.95, 0);
    addBox(g, M.iron, depth + 0.2, 0.55, OPEN + FR * 2.0, 0, lintelY + 3.35, 0);

    // щёки проёма (толщина стены ворот)
    addBox(g, M.stone, depth * 0.85, lintelY - 0.4, 1.35, 0, (lintelY - 0.4) * 0.5, -OPEN * 0.5 + 0.15);
    addBox(g, M.stone, depth * 0.85, lintelY - 0.4, 1.35, 0, (lintelY - 0.4) * 0.5, OPEN * 0.5 - 0.15);

    // решётка ПОДНЯТА — только под перемычкой
    var i, nBars = Math.max(7, Math.round(OPEN / 1.15));
    for (i = -Math.floor(nBars / 2); i <= Math.floor(nBars / 2); i++) {
      addBox(g, M.ironDark, 0.1, 2.4, 0.1, 0.2, lintelY - 0.7, i * (OPEN / Math.max(1, nBars)));
    }
    addBox(g, M.iron, 0.12, 0.12, OPEN * 0.92, 0.2, lintelY - 1.85, 0);
    addBox(g, M.brass, 0.14, 0.14, OPEN * 0.7, 0.25, lintelY - 1.7, 0);

    // створки ОТКРЫТЫ — прижаты к щекам вдоль прохода
    var doorH = 8.8;
    var doorW = Math.min(5.0, OPEN * 0.42);
    addBox(g, M.wood, doorW, doorH, 0.22, depth * 0.22, doorH * 0.5, -OPEN * 0.5 + 0.42);
    addBox(g, M.wood, doorW, doorH, 0.22, depth * 0.22, doorH * 0.5, OPEN * 0.5 - 0.42);
    addBox(g, M.iron, doorW * 0.9, 0.14, 0.08, depth * 0.22, 2.3, -OPEN * 0.5 + 0.42);
    addBox(g, M.iron, doorW * 0.9, 0.14, 0.08, depth * 0.22, 2.3, OPEN * 0.5 - 0.42);
    addBox(g, M.iron, doorW * 0.9, 0.14, 0.08, depth * 0.22, 6.6, -OPEN * 0.5 + 0.42);
    addBox(g, M.iron, doorW * 0.9, 0.14, 0.08, depth * 0.22, 6.6, OPEN * 0.5 - 0.42);

    addGear(g, M.brass, 1.45, 0.26, 12, depth * 0.45, 9.4, -OPEN * 0.22, 0, 0, Math.PI / 2);
    addGear(g, M.brass, 1.05, 0.22, 10, depth * 0.42, 8.2, OPEN * 0.22, 0, 0.4, Math.PI / 2);
    addCyl(g, M.copper, 0.18, 0.18, OPEN + FR, 6, depth * 0.35, lintelY + 0.55, 0, Math.PI / 2, 0);
    addCyl(g, M.brass, 0.32, 0.32, 0.4, 8, depth * 0.35, lintelY + 0.55, -OPEN * 0.28);
    addCyl(g, M.brass, 0.32, 0.32, 0.4, 8, depth * 0.35, lintelY + 0.55, OPEN * 0.28);
    addBox(g, M.glow, 0.45, 0.45, 0.45, depth * 0.4, lintelY - 0.2, 0);

    parent.add(g);
    collGates.push({
      x: p.x, z: p.z, dx: p.dx, dz: p.dz,
      halfOpen: OPEN * 0.5 - 0.4, yaw: p.yaw, span: side * 2
    });
    return { open: OPEN, side: side, flanks: [fL, fR], x: p.x, z: p.z, dx: p.dx, dz: p.dz };
  }

  function buildCurtain(parent, a, b) {
    var dx = b.x - a.x, dz = b.z - a.z;
    var len = Math.hypot(dx, dz);
    if (len < 1.2) return;
    var yaw = Math.atan2(dx, dz);
    var mx = (a.x + b.x) * 0.5, mz = (a.z + b.z) * 0.5;
    var y0 = (terrainY(a.x, a.z) + terrainY(b.x, b.z)) * 0.5;
    var M = mats();
    var g = new THREE.Group();
    g.position.set(mx, y0, mz);
    g.rotation.y = yaw;

    addBox(g, M.stone, WALL_T + 0.35, 1.05, len + 0.2, 0, 0.5, 0);
    addBox(g, M.brick, WALL_T, WALL_H, len, 0, 1.0 + WALL_H * 0.5, 0);
    addBox(g, M.iron, WALL_T + 0.18, 0.16, len + 0.15, 0, 1.0 + WALL_H + 0.06, 0);
    addBox(g, M.wood, WALL_T - 0.55, WALK_H, len - 0.4, 0, 1.0 + WALL_H + 0.22, 0);

    var nMer = Math.max(2, Math.round(len / 2.15));
    var i, z, isMerlon;
    for (i = 0; i < nMer; i++) {
      z = -len * 0.5 + (i + 0.5) * (len / nMer);
      isMerlon = i % 2 === 0;
      if (isMerlon) {
        addBox(g, M.iron, WALL_T * 0.72, MERLON_H, 0.95, 0, 1.0 + WALL_H + 0.35 + MERLON_H * 0.5, z);
        addCyl(g, M.brass, 0.07, 0.07, 0.22, 6, 0, 1.0 + WALL_H + 0.35 + MERLON_H + 0.12, z);
      } else {
        addBox(g, M.ironDark, WALL_T * 0.55, 0.55, 0.85, 0, 1.0 + WALL_H + 0.55, z);
      }
    }

    if (len > 7) {
      addBox(g, M.brickB, WALL_T + 1.1, WALL_H * 0.72, 1.15, 0, 1.0 + WALL_H * 0.36, 0);
      addCyl(g, M.copper, 0.12, 0.12, len * 0.7, 6, WALL_T * 0.42, 1.0 + WALL_H * 0.78, 0, Math.PI / 2, 0);
    }

    parent.add(g);
    collWalls.push({ x0: a.x, z0: a.z, x1: b.x, z1: b.z, hw: WALL_T * 0.52 });
  }

  function distPointSeg(px, pz, x0, z0, x1, z1) {
    var dx = x1 - x0, dz = z1 - z0;
    var l2 = dx * dx + dz * dz;
    if (l2 < 1e-8) return Math.hypot(px - x0, pz - z0);
    var t = ((px - x0) * dx + (pz - z0) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
  }

  function segsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    var dax = bx - ax, daz = bz - az;
    var dbx = dx - cx, dbz = dz - cz;
    var den = dax * dbz - daz * dbx;
    if (Math.abs(den) < 1e-9) return false;
    var t = ((cx - ax) * dbz - (cz - az) * dbx) / den;
    var u = ((cx - ax) * daz - (cz - az) * dax) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function inGateOpening(px, pz) {
    var i, g, lx, lz, along, side;
    for (i = 0; i < collGates.length; i++) {
      g = collGates[i];
      lx = px - g.x;
      lz = pz - g.z;
      along = lx * g.dx + lz * g.dz;
      side = lx * g.dz - lz * g.dx;
      if (Math.abs(along) < g.halfOpen && Math.abs(side) < 6.2) return true;
    }
    return false;
  }

  function hitsBarrier(ax, az, bx, bz) {
    if (!root) return false;
    if (inGateOpening(bx, bz) && inGateOpening(ax, az)) return false;
    if (inGateOpening(bx, bz) && !inGateOpening(ax, az)) {
      // entering opening from outside is OK if not through a tower
    }
    var i, t, w, da, db;
    for (i = 0; i < collTowers.length; i++) {
      t = collTowers[i];
      da = Math.hypot(ax - t.x, az - t.z);
      db = Math.hypot(bx - t.x, bz - t.z);
      if (db < t.r && da >= t.r - 0.02) return true;
      if (da < t.r && db < t.r) return true;
    }
    for (i = 0; i < collWalls.length; i++) {
      w = collWalls[i];
      if (inGateOpening(bx, bz)) continue;
      if (distPointSeg(bx, bz, w.x0, w.z0, w.x1, w.z1) < w.hw &&
          distPointSeg(ax, az, w.x0, w.z0, w.x1, w.z1) >= w.hw - 0.05) return true;
      if (segsIntersect(ax, az, bx, bz, w.x0, w.z0, w.x1, w.z1) && !inGateOpening(bx, bz)) return true;
    }
    return false;
  }

  function mergeReserves(reserves) {
    var list = (reserves || []).slice().sort(function (a, b) { return a.a - b.a; });
    var merged = [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (!merged.length || list[i].a > merged[merged.length - 1].b + 0.4) {
        merged.push({ a: list[i].a, b: list[i].b });
      } else if (list[i].b > merged[merged.length - 1].b) {
        merged[merged.length - 1].b = list[i].b;
      }
    }
    return merged;
  }

  function nearestOnPath(path, x, z) {
    var bestS = 0, bestD = 1e9, s, p, d;
    for (s = 0; s <= path.total; s += 1.4) {
      p = path.at(s);
      d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; bestS = s; }
    }
    return { s: bestS, d: bestD };
  }

  function flattenFlanks(gateInfos) {
    var out = [];
    var i, g;
    for (i = 0; i < (gateInfos || []).length; i++) {
      g = gateInfos[i];
      if (!g || !g.flanks) continue;
      if (g.flanks[0]) out.push(g.flanks[0]);
      if (g.flanks[1]) out.push(g.flanks[1]);
    }
    return out;
  }

  function nearerFlank(x, z, flanks) {
    var best = null, i, d;
    for (i = 0; i < (flanks || []).length; i++) {
      d = Math.hypot(x - flanks[i].x, z - flanks[i].z);
      if (!best || d < best.d) best = { f: flanks[i], d: d };
    }
    return best;
  }

  function connectIfGap(parent, a, b) {
    if (!a || !b) return;
    var d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 1.15 && d < 56) buildCurtain(parent, a, b);
  }

  function fillGateWings(parent, job, built) {
    if (!job || !built || !built.flanks) return;
    var p0 = job.path.at(0);
    var p1 = job.path.at(job.path.total);
    var n0 = nearerFlank(p0.x, p0.z, built.flanks);
    var n1 = nearerFlank(p1.x, p1.z, built.flanks);
    if (n0) connectIfGap(parent, p0, n0.f);
    if (n1) connectIfGap(parent, p1, n1.f);
  }

  function reservesFromGates(path, gateInfos) {
    var res = [];
    var flanks = flattenFlanks(gateInfos);
    var i, n, half;
    for (i = 0; i < flanks.length; i++) {
      n = nearestOnPath(path, flanks[i].x, flanks[i].z);
      if (n.d > 14) continue;
      half = GATE_FLANK_R + 0.9;
      res.push({ a: n.s - half, b: n.s + half });
    }
    return res;
  }

  function fillCurtains(parent, path, reserves) {
    var merged = mergeReserves(reserves);
    var fill = [];
    var cursor = 0;
    var i, u, aPt, bPt, step = 9.2;
    for (i = 0; i < merged.length; i++) {
      if (merged[i].a > cursor + 1.3) fill.push({ a: cursor, b: Math.min(path.total, merged[i].a) });
      cursor = Math.max(cursor, merged[i].b);
    }
    if (path.total > cursor + 1.3) fill.push({ a: cursor, b: path.total });
    for (i = 0; i < fill.length; i++) {
      for (u = fill[i].a; u < fill[i].b - 0.8; u += step) {
        aPt = path.at(u);
        bPt = path.at(Math.min(fill[i].b, u + step));
        buildCurtain(parent, aPt, bPt);
      }
    }
  }

  function buildWallRun(parent, job, gateInfos, withTowers) {
    var path = job.path;
    var pts = job.pts;
    var reserves = reservesFromGates(path, gateInfos);
    var towersAt = [];
    var i, s, p, acc;

    if (withTowers) {
      acc = 0;
      for (i = 0; i < pts.length; i++) {
        if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
        if (overlapsReserve(acc, reserves)) continue;
        if (i === 0 || i === pts.length - 1) {
          var nf = nearerFlank(pts[i].x, pts[i].z, flattenFlanks(gateInfos));
          if (nf && nf.d < 16) continue;
          towersAt.push({ s: acc, corner: false });
          reserves.push({ a: acc - TOWER_R - 1.0, b: acc + TOWER_R + 1.0 });
        } else {
          towersAt.push({ s: acc, corner: true });
          reserves.push({ a: acc - CORNER_R - 1.2, b: acc + CORNER_R + 1.2 });
        }
      }
      for (s = TOWER_SPACING * 0.55; s < path.total - 8; s += TOWER_SPACING) {
        if (overlapsReserve(s, reserves)) continue;
        towersAt.push({ s: s, corner: false });
        reserves.push({ a: s - TOWER_R - 1.1, b: s + TOWER_R + 1.1 });
      }
      for (i = 0; i < towersAt.length; i++) {
        p = path.at(towersAt[i].s);
        buildTower(parent, p.x, p.z, p.yaw, {
          corner: towersAt[i].corner,
          r: towersAt[i].corner ? CORNER_R : TOWER_R,
          h: towersAt[i].corner ? CORNER_H : TOWER_H
        });
      }
    }

    fillCurtains(parent, path, reserves);
  }

  function stitchWallsToGates(parent, wallJobs, gateInfos) {
    var flanks = flattenFlanks(gateInfos);
    var i, j, job, ends, p, n;
    for (i = 0; i < wallJobs.length; i++) {
      job = wallJobs[i];
      ends = [job.path.at(0), job.path.at(job.path.total)];
      for (j = 0; j < ends.length; j++) {
        p = ends[j];
        n = nearerFlank(p.x, p.z, flanks);
        if (n) connectIfGap(parent, p, n.f);
      }
    }
  }

  function bakeMerge(group) {
    if (!THREE || !group) return 0;
    group.updateMatrixWorld(true);
    var buckets = {};
    var meshes = [];
    group.traverse(function (o) {
      if (o && o.isMesh && o.geometry && o.material && !Array.isArray(o.material)) meshes.push(o);
    });
    var i, o, geo, id, b, k, g, posCount, idxCount, vc, po, uo, io, vo, pos, nrm, uvs, idx, out, mesh, n = 0;
    for (i = 0; i < meshes.length; i++) {
      o = meshes[i];
      geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      id = o.material.uuid;
      b = buckets[id];
      if (!b) b = buckets[id] = { mat: o.material, geos: [] };
      b.geos.push(geo);
      if (o.parent) o.parent.remove(o);
      if (o.geometry.dispose) o.geometry.dispose();
    }
    function merge(list) {
      if (!list.length) return null;
      if (list.length === 1) return list[0];
      posCount = 0; idxCount = 0;
      for (i = 0; i < list.length; i++) {
        g = list[i];
        if (!g.attributes.position) continue;
        vc = g.attributes.position.count;
        posCount += vc;
        idxCount += g.index ? g.index.count : vc;
      }
      if (!posCount) return null;
      pos = new Float32Array(posCount * 3);
      nrm = new Float32Array(posCount * 3);
      uvs = new Float32Array(posCount * 2);
      idx = posCount > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
      po = 0; uo = 0; io = 0; vo = 0;
      for (i = 0; i < list.length; i++) {
        g = list[i];
        if (!g.attributes.position) continue;
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
      out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      out.setIndex(new THREE.BufferAttribute(idx, 1));
      out.computeBoundingSphere();
      out.computeBoundingBox();
      return out;
    }
    for (id in buckets) {
      if (!Object.prototype.hasOwnProperty.call(buckets, id)) continue;
      geo = merge(buckets[id].geos);
      if (!geo) continue;
      mesh = new THREE.Mesh(geo, buckets[id].mat);
      mesh.castShadow = !buckets[id].mat.userData.noCast;
      mesh.receiveShadow = !buckets[id].mat.userData.noCast;
      group.add(mesh);
      n++;
    }
    return n;
  }

  function build(scene) {
    var WM = window.WorldMetrics;
    if (WM && WM.isWorldObjectDeleted && WM.isWorldObjectDeleted('village_fort')) {
      console.log('[VillageFort] skip — deleted in editor');
      return null;
    }
    if (!THREE) return null;
    dispose();
    MAT = null;
    collWalls = [];
    collTowers = [];
    collGates = [];

    var jobs = collectJobs();
    if (!jobs.length) {
      console.warn('[VillageFort] no polyline sites');
      return null;
    }

    root = new THREE.Group();
    root.name = 'VillageFort';
    root.userData = { isWorldObject: true, worldKey: 'village_fort', name: 'Стены деревни' };

    var gateInfos = [];
    var wallJobs = [];
    var i, job, p, open, built;
    for (i = 0; i < jobs.length; i++) {
      job = jobs[i];
      if (job.kind !== 'gate') continue;
      open = Math.max(12.0, Math.min(26.0, job.path.total - GATE_FLANK_R * 3.2));
      p = job.path.at(job.path.total * 0.5);
      built = buildGate(root, p, { open: open });
      fillGateWings(root, job, built);
      gateInfos.push({
        x: p.x, z: p.z, dx: p.dx, dz: p.dz,
        span: built.side * 2,
        flanks: built.flanks
      });
    }

    for (i = 0; i < jobs.length; i++) {
      job = jobs[i];
      if (job.kind === 'gate') continue;
      wallJobs.push(job);
      buildWallRun(root, job, gateInfos, job.kind === 'wall_towers');
    }
    stitchWallsToGates(root, wallJobs, gateInfos);

    var batches = bakeMerge(root);
    if (scene) scene.add(root);
    console.log(
      '[VillageFort] jobs', jobs.length,
      'gates', gateInfos.length,
      'wallSeg', collWalls.length,
      'towers', collTowers.length,
      'batches', batches
    );
    return root;
  }

  function dispose() {
    if (root && root.parent) root.parent.remove(root);
    if (root) {
      root.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(function (m) { if (m && m.dispose) m.dispose(); });
          else if (o.material.dispose) o.material.dispose();
        }
      });
    }
    root = null;
    collWalls = [];
    collTowers = [];
    collGates = [];
  }

  window.VillageFort = {
    build: build,
    dispose: dispose,
    hitsBarrier: hitsBarrier,
    get root() { return root; },
    get collWalls() { return collWalls; }
  };
})();
