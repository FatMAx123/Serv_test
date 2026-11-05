// ============================================================
// PROJECT STEAM — DROP-MODELS.JS
// Procedural Three.js ground-drop meshes for every LOOT item.
// Armor: generic crate. Weapons with WEAPON_VISUALS: FBX via CharModel
// (loot.js createWeaponWorldMesh) — crate only if no 3D visual.
// Steampunk / L2-classic floating loot vibe.
// ============================================================
(function (root) {
  'use strict';

  var GEO = {};
  function geo(key, factory) {
    if (!GEO[key]) GEO[key] = factory();
    return GEO[key];
  }

  function mat(color, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: opts.roughness != null ? opts.roughness : 0.45,
      metalness: opts.metalness != null ? opts.metalness : 0.55,
      emissive: opts.emissive != null ? opts.emissive : 0x000000,
      emissiveIntensity: opts.emissiveIntensity != null ? opts.emissiveIntensity : 0,
      transparent: !!opts.transparent,
      opacity: opts.opacity != null ? opts.opacity : 1
    });
  }

  function mesh(geometry, material) {
    var m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // ─── Shape builders (return Group) ───

  function pileCoins(c1, c2) {
    var g = new THREE.Group();
    var disk = geo('coin', function () { return new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16); });
    var cols = [c1 || 0xb87333, c2 || 0xcd7f32, 0xd4a017];
    for (var i = 0; i < 7; i++) {
      var m = mesh(disk, mat(cols[i % cols.length], { metalness: 0.85, roughness: 0.3 }));
      m.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.4;
      m.position.set((Math.random() - 0.5) * 0.28, 0.02 + i * 0.012, (Math.random() - 0.5) * 0.28);
      g.add(m);
    }
    return g;
  }

  function flask(bodyColor, liquidColor) {
    var g = new THREE.Group();
    var body = geo('flaskBody', function () { return new THREE.SphereGeometry(0.14, 12, 12); });
    var neck = geo('flaskNeck', function () { return new THREE.CylinderGeometry(0.04, 0.05, 0.12, 10); });
    var cork = geo('flaskCork', function () { return new THREE.CylinderGeometry(0.045, 0.04, 0.04, 10); });
    var b = mesh(body, mat(bodyColor || 0x88aacc, { metalness: 0.15, roughness: 0.2, transparent: true, opacity: 0.75 }));
    b.scale.y = 1.15;
    b.position.y = 0.08;
    var n = mesh(neck, mat(0xc4a35a, { metalness: 0.7 }));
    n.position.y = 0.24;
    var c = mesh(cork, mat(0x5c3a1e, { metalness: 0.1, roughness: 0.8 }));
    c.position.y = 0.32;
    if (liquidColor != null) {
      var liq = mesh(geo('flaskLiq', function () { return new THREE.SphereGeometry(0.1, 10, 10); }),
        mat(liquidColor, { metalness: 0.05, roughness: 0.35, emissive: liquidColor, emissiveIntensity: 0.15 }));
      liq.scale.y = 0.7;
      liq.position.y = 0.05;
      g.add(liq);
    }
    g.add(b, n, c);
    return g;
  }

  function canister(bodyColor, bandColor) {
    var g = new THREE.Group();
    var cyl = geo('canCyl', function () { return new THREE.CylinderGeometry(0.12, 0.13, 0.28, 14); });
    var top = geo('canTop', function () { return new THREE.CylinderGeometry(0.08, 0.12, 0.05, 12); });
    var valve = geo('canValve', function () { return new THREE.TorusGeometry(0.05, 0.012, 6, 12); });
    var body = mesh(cyl, mat(bodyColor || 0x8a7355, { metalness: 0.65 }));
    body.position.y = 0.14;
    var t = mesh(top, mat(bandColor || 0xc4a35a, { metalness: 0.8 }));
    t.position.y = 0.3;
    var v = mesh(valve, mat(0x666666, { metalness: 0.9 }));
    v.position.y = 0.34;
    v.rotation.x = Math.PI / 2;
    g.add(body, t, v);
    return g;
  }

  function cartridge(bodyColor, glowColor) {
    var g = new THREE.Group();
    var body = geo('cartBody', function () { return new THREE.BoxGeometry(0.1, 0.22, 0.1); });
    var tip = geo('cartTip', function () { return new THREE.CylinderGeometry(0.03, 0.04, 0.06, 8); });
    var b = mesh(body, mat(bodyColor || 0x4a5560, { metalness: 0.7 }));
    b.position.y = 0.12;
    var t = mesh(tip, mat(glowColor || 0xffaa33, {
      metalness: 0.4, emissive: glowColor || 0xffaa33, emissiveIntensity: 0.45
    }));
    t.position.y = 0.26;
    // side ridges
    for (var i = 0; i < 3; i++) {
      var r = mesh(geo('cartRidge', function () { return new THREE.BoxGeometry(0.12, 0.015, 0.02); }),
        mat(0xc4a35a, { metalness: 0.85 }));
      r.position.set(0, 0.06 + i * 0.05, 0.055);
      g.add(r);
    }
    g.add(b, t);
    return g;
  }

  function kitBox(bodyColor) {
    var g = new THREE.Group();
    var box = geo('kitBox', function () { return new THREE.BoxGeometry(0.28, 0.12, 0.2); });
    var lid = geo('kitLid', function () { return new THREE.BoxGeometry(0.29, 0.03, 0.21); });
    var cross = geo('kitCross', function () { return new THREE.BoxGeometry(0.08, 0.02, 0.02); });
    var b = mesh(box, mat(bodyColor || 0x6b4423, { metalness: 0.25, roughness: 0.6 }));
    b.position.y = 0.06;
    var l = mesh(lid, mat(0x8b5a2b, { metalness: 0.3 }));
    l.position.y = 0.135;
    var c1 = mesh(cross, mat(0xcc2222, { metalness: 0.2, emissive: 0x440000, emissiveIntensity: 0.2 }));
    c1.position.set(0, 0.15, 0);
    var c2 = mesh(geo('kitCross2', function () { return new THREE.BoxGeometry(0.02, 0.02, 0.08); }),
      mat(0xcc2222, { metalness: 0.2 }));
    c2.position.set(0, 0.15, 0);
    g.add(b, l, c1, c2);
    return g;
  }

  function gear(color) {
    var g = new THREE.Group();
    var hub = geo('gearHub', function () { return new THREE.CylinderGeometry(0.06, 0.06, 0.05, 12); });
    var tooth = geo('gearTooth', function () { return new THREE.BoxGeometry(0.05, 0.04, 0.08); });
    var h = mesh(hub, mat(color || 0xb8860b, { metalness: 0.8, roughness: 0.35 }));
    h.rotation.x = Math.PI / 2;
    h.position.y = 0.08;
    g.add(h);
    for (var i = 0; i < 8; i++) {
      var t = mesh(tooth, mat(color || 0xb8860b, { metalness: 0.8, roughness: 0.35 }));
      var a = (i / 8) * Math.PI * 2;
      t.position.set(Math.cos(a) * 0.1, 0.08, Math.sin(a) * 0.1);
      t.rotation.y = -a;
      g.add(t);
    }
    return g;
  }

  function cableCoil(color) {
    var g = new THREE.Group();
    var torus = geo('cableTorus', function () { return new THREE.TorusGeometry(0.1, 0.035, 8, 20); });
    var m = mesh(torus, mat(color || 0xb87333, { metalness: 0.75, roughness: 0.35 }));
    m.rotation.x = Math.PI / 2.5;
    m.position.y = 0.08;
    g.add(m);
    var m2 = mesh(torus, mat(color || 0xb87333, { metalness: 0.75 }));
    m2.rotation.x = Math.PI / 2.2;
    m2.position.y = 0.12;
    m2.scale.setScalar(0.85);
    g.add(m2);
    return g;
  }

  function scrap(color) {
    var g = new THREE.Group();
    var pieces = [
      { k: 'scrap0', s: [0.14, 0.03, 0.1], p: [-0.04, 0.03, -0.04], ry: 0.2, rz: -0.1 },
      { k: 'scrap1', s: [0.1, 0.04, 0.12], p: [0.04, 0.045, -0.02], ry: 0.7, rz: 0.05 },
      { k: 'scrap2', s: [0.08, 0.025, 0.09], p: [-0.02, 0.06, 0.05], ry: 1.1, rz: -0.15 },
      { k: 'scrap3', s: [0.12, 0.03, 0.07], p: [0.05, 0.075, 0.04], ry: 0.4, rz: 0.1 }
    ];
    for (var j = 0; j < pieces.length; j++) {
      var p = pieces[j];
      var m = mesh(
        geo(p.k, (function (sx, sy, sz) {
          return function () { return new THREE.BoxGeometry(sx, sy, sz); };
        })(p.s[0], p.s[1], p.s[2])),
        mat(color || 0x6a6a6a, { metalness: 0.7, roughness: 0.55 })
      );
      m.position.set(p.p[0], p.p[1], p.p[2]);
      m.rotation.y = p.ry;
      m.rotation.z = p.rz;
      g.add(m);
    }
    return g;
  }

  function valve(color) {
    var g = new THREE.Group();
    var body = geo('valveBody', function () { return new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10); });
    var wheel = geo('valveWheel', function () { return new THREE.TorusGeometry(0.09, 0.015, 6, 14); });
    var spoke = geo('valveSpoke', function () { return new THREE.BoxGeometry(0.14, 0.015, 0.015); });
    var b = mesh(body, mat(color || 0x8b7355, { metalness: 0.7 }));
    b.position.y = 0.06;
    var w = mesh(wheel, mat(0xc4a35a, { metalness: 0.85 }));
    w.position.y = 0.16;
    w.rotation.x = Math.PI / 2;
    var s1 = mesh(spoke, mat(0xc4a35a, { metalness: 0.85 }));
    s1.position.y = 0.16;
    var s2 = mesh(spoke, mat(0xc4a35a, { metalness: 0.85 }));
    s2.position.y = 0.16;
    s2.rotation.y = Math.PI / 2;
    g.add(b, w, s1, s2);
    return g;
  }

  function gauge(faceColor) {
    var g = new THREE.Group();
    var body = geo('gaugeBody', function () { return new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16); });
    var glass = geo('gaugeGlass', function () { return new THREE.CircleGeometry(0.09, 16); });
    var needle = geo('gaugeNeedle', function () { return new THREE.BoxGeometry(0.01, 0.07, 0.005); });
    var b = mesh(body, mat(0xc4a35a, { metalness: 0.8 }));
    b.rotation.x = Math.PI / 2;
    b.position.y = 0.1;
    var gl = mesh(glass, mat(faceColor || 0xeeeedd, { metalness: 0.1, roughness: 0.2 }));
    gl.position.set(0, 0.1, 0.03);
    var n = mesh(needle, mat(0xcc2222, { metalness: 0.5, emissive: 0x440000, emissiveIntensity: 0.2 }));
    n.position.set(0.02, 0.13, 0.035);
    n.rotation.z = -0.5;
    g.add(b, gl, n);
    return g;
  }

  function metalRing(color) {
    var g = new THREE.Group();
    var torus = geo('mRing', function () { return new THREE.TorusGeometry(0.1, 0.025, 8, 20); });
    var m = mesh(torus, mat(color || 0xaaaaaa, { metalness: 0.85, roughness: 0.3 }));
    m.rotation.x = Math.PI / 2.3;
    m.position.y = 0.08;
    g.add(m);
    return g;
  }

  function sparkPlug(color) {
    var g = new THREE.Group();
    var base = geo('plugBase', function () { return new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10); });
    var cer = geo('plugCer', function () { return new THREE.CylinderGeometry(0.035, 0.04, 0.12, 10); });
    var tip = geo('plugTip', function () { return new THREE.CylinderGeometry(0.01, 0.012, 0.05, 6); });
    var b = mesh(base, mat(color || 0x555555, { metalness: 0.85 }));
    b.position.y = 0.05;
    var c = mesh(cer, mat(0xf5f0e6, { metalness: 0.05, roughness: 0.4 }));
    c.position.y = 0.15;
    var t = mesh(tip, mat(0xcccccc, { metalness: 0.9, emissive: 0xffaa44, emissiveIntensity: 0.25 }));
    t.position.y = 0.23;
    g.add(b, c, t);
    return g;
  }

  function plate(color) {
    var g = new THREE.Group();
    var p = geo('plate', function () { return new THREE.BoxGeometry(0.28, 0.035, 0.2); });
    var m = mesh(p, mat(color || 0x6b7280, { metalness: 0.75, roughness: 0.4 }));
    m.position.y = 0.04;
    m.rotation.y = 0.3;
    // rivets
    var riv = geo('rivet', function () { return new THREE.SphereGeometry(0.015, 6, 6); });
    [[-0.1, 0.06, -0.07], [0.1, 0.06, -0.07], [-0.1, 0.06, 0.07], [0.1, 0.06, 0.07]].forEach(function (pos) {
      var r = mesh(riv, mat(0x444444, { metalness: 0.9 }));
      r.position.set(pos[0], pos[1], pos[2]);
      g.add(r);
    });
    g.add(m);
    return g;
  }

  function crystal(color, glow) {
    var g = new THREE.Group();
    var geoC = geo('crystalOct', function () { return new THREE.OctahedronGeometry(0.14, 0); });
    var m = mesh(geoC, mat(color || 0x66ccff, {
      metalness: 0.2,
      roughness: 0.15,
      emissive: glow || color || 0x2288ff,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.9
    }));
    m.position.y = 0.14;
    m.rotation.y = Math.PI / 6;
    g.add(m);
    return g;
  }

  function scroll(paperColor, clipColor) {
    var g = new THREE.Group();
    var roll = geo('scrollRoll', function () { return new THREE.CylinderGeometry(0.05, 0.05, 0.26, 12); });
    var sheet = geo('scrollSheet', function () { return new THREE.BoxGeometry(0.2, 0.01, 0.18); });
    var r1 = mesh(roll, mat(paperColor || 0xe8d5a3, { metalness: 0.05, roughness: 0.7 }));
    r1.rotation.z = Math.PI / 2;
    r1.position.set(-0.08, 0.08, 0);
    var r2 = mesh(roll, mat(paperColor || 0xe8d5a3, { metalness: 0.05, roughness: 0.7 }));
    r2.rotation.z = Math.PI / 2;
    r2.position.set(0.08, 0.08, 0);
    var sh = mesh(sheet, mat(paperColor || 0xf0e0b8, { metalness: 0.02, roughness: 0.75 }));
    sh.position.y = 0.08;
    var clip = mesh(geo('scrollClip', function () { return new THREE.BoxGeometry(0.04, 0.03, 0.04); }),
      mat(clipColor || 0xc4a35a, { metalness: 0.85 }));
    clip.position.set(0, 0.1, 0.08);
    g.add(r1, r2, sh, clip);
    return g;
  }

  function earring(color) {
    var g = new THREE.Group();
    var hook = geo('earHook', function () { return new THREE.TorusGeometry(0.05, 0.01, 6, 12, Math.PI); });
    var gem = geo('earGem', function () { return new THREE.OctahedronGeometry(0.04, 0); });
    var h = mesh(hook, mat(color || 0xb87333, { metalness: 0.85 }));
    h.position.y = 0.14;
    var ge = mesh(gem, mat(0x44aadd, { metalness: 0.3, emissive: 0x113355, emissiveIntensity: 0.3 }));
    ge.position.y = 0.06;
    g.add(h, ge);
    return g;
  }

  function necklace(color, gemColor) {
    var g = new THREE.Group();
    var chain = geo('neckChain', function () { return new THREE.TorusGeometry(0.1, 0.012, 6, 16); });
    var pendant = geo('neckPend', function () { return new THREE.BoxGeometry(0.08, 0.1, 0.04); });
    var c = mesh(chain, mat(color || 0xc4a35a, { metalness: 0.8 }));
    c.rotation.x = Math.PI / 2.5;
    c.position.y = 0.14;
    var p = mesh(pendant, mat(gemColor || 0x445566, {
      metalness: 0.6, emissive: gemColor || 0x223344, emissiveIntensity: 0.25
    }));
    p.position.y = 0.05;
    g.add(c, p);
    return g;
  }

  function tapeCassette(color) {
    var g = new THREE.Group();
    var body = geo('tapeBody', function () { return new THREE.BoxGeometry(0.22, 0.04, 0.14); });
    var reel = geo('tapeReel', function () { return new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12); });
    var b = mesh(body, mat(color || 0x333344, { metalness: 0.4, roughness: 0.5 }));
    b.position.y = 0.04;
    var r1 = mesh(reel, mat(0x888899, { metalness: 0.7 }));
    r1.rotation.x = Math.PI / 2;
    r1.position.set(-0.05, 0.05, 0);
    var r2 = mesh(reel, mat(0x888899, { metalness: 0.7 }));
    r2.rotation.x = Math.PI / 2;
    r2.position.set(0.05, 0.05, 0);
    g.add(b, r1, r2);
    return g;
  }

  function capacitor(color) {
    var g = new THREE.Group();
    var body = geo('capBody', function () { return new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12); });
    var leg = geo('capLeg', function () { return new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6); });
    var b = mesh(body, mat(color || 0x2266cc, {
      metalness: 0.5, emissive: color || 0x1133aa, emissiveIntensity: 0.25
    }));
    b.position.y = 0.12;
    var l1 = mesh(leg, mat(0xcccccc, { metalness: 0.9 }));
    l1.position.set(-0.02, 0.03, 0);
    var l2 = mesh(leg, mat(0xcccccc, { metalness: 0.9 }));
    l2.position.set(0.02, 0.03, 0);
    g.add(b, l1, l2);
    return g;
  }

  function briquette(color) {
    var g = new THREE.Group();
    var b = mesh(geo('briq', function () { return new THREE.BoxGeometry(0.16, 0.1, 0.12); }),
      mat(color || 0x1a1a1a, { metalness: 0.15, roughness: 0.85 }));
    b.position.y = 0.05;
    b.rotation.y = 0.2;
    g.add(b);
    return g;
  }

  function leatherPatch(color) {
    var g = new THREE.Group();
    var p = mesh(geo('patch', function () { return new THREE.BoxGeometry(0.18, 0.02, 0.14); }),
      mat(color || 0x8b5a2b, { metalness: 0.05, roughness: 0.85 }));
    p.position.y = 0.03;
    p.rotation.y = 0.4;
    g.add(p);
    return g;
  }

  function bone(color) {
    var g = new THREE.Group();
    var shaft = geo('boneShaft', function () { return new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8); });
    var end = geo('boneEnd', function () { return new THREE.SphereGeometry(0.05, 8, 8); });
    var s = mesh(shaft, mat(color || 0x7a8a6a, { metalness: 0.5, roughness: 0.5 }));
    s.rotation.z = Math.PI / 2.5;
    s.position.y = 0.08;
    var e1 = mesh(end, mat(color || 0x7a8a6a, { metalness: 0.5 }));
    e1.position.set(-0.1, 0.1, 0);
    var e2 = mesh(end, mat(color || 0x7a8a6a, { metalness: 0.5 }));
    e2.position.set(0.1, 0.06, 0);
    g.add(s, e1, e2);
    return g;
  }

  function heartCore(color) {
    var g = new THREE.Group();
    // two spheres + cone-ish as heart proxy
    var s = geo('heartS', function () { return new THREE.SphereGeometry(0.08, 10, 10); });
    var s1 = mesh(s, mat(color || 0xcc3322, {
      metalness: 0.4, emissive: color || 0xaa2200, emissiveIntensity: 0.35
    }));
    s1.position.set(-0.04, 0.12, 0);
    var s2 = mesh(s, mat(color || 0xcc3322, {
      metalness: 0.4, emissive: color || 0xaa2200, emissiveIntensity: 0.35
    }));
    s2.position.set(0.04, 0.12, 0);
    var tip = mesh(geo('heartTip', function () { return new THREE.ConeGeometry(0.1, 0.14, 8); }),
      mat(color || 0xcc3322, { metalness: 0.4, emissive: color || 0xaa2200, emissiveIntensity: 0.35 }));
    tip.position.y = 0.04;
    tip.rotation.x = Math.PI;
    g.add(s1, s2, tip);
    return g;
  }

  function powderPouch(color) {
    var g = new THREE.Group();
    var bag = geo('pouch', function () { return new THREE.SphereGeometry(0.1, 10, 10); });
    var m = mesh(bag, mat(color || 0xc0c0d0, {
      metalness: 0.3, roughness: 0.5, emissive: color || 0x8888aa, emissiveIntensity: 0.2
    }));
    m.scale.set(1, 0.85, 1);
    m.position.y = 0.08;
    var top = mesh(geo('pouchTop', function () { return new THREE.CylinderGeometry(0.03, 0.05, 0.05, 8); }),
      mat(0x5c4033, { metalness: 0.1, roughness: 0.8 }));
    top.position.y = 0.16;
    g.add(m, top);
    return g;
  }

  function rivetPile(color) {
    var g = new THREE.Group();
    var pin = geo('rivetPin', function () { return new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6); });
    var head = geo('rivetHead', function () { return new THREE.SphereGeometry(0.025, 6, 6); });
    for (var i = 0; i < 6; i++) {
      var p = mesh(pin, mat(color || 0x888888, { metalness: 0.85 }));
      p.position.set((i % 3) * 0.05 - 0.05, 0.04, Math.floor(i / 3) * 0.05 - 0.025);
      p.rotation.z = (i - 2) * 0.2;
      var h = mesh(head, mat(color || 0xaaaaaa, { metalness: 0.9 }));
      h.position.copy(p.position);
      h.position.y += 0.04;
      g.add(p, h);
    }
    return g;
  }

  function rockChunk(color) {
    var g = new THREE.Group();
    var d = geo('rock', function () { return new THREE.DodecahedronGeometry(0.12, 0); });
    var m = mesh(d, mat(color || 0x6b6560, { metalness: 0.45, roughness: 0.65 }));
    m.position.y = 0.1;
    m.rotation.x = 0.3;
    m.rotation.y = 0.5;
    m.rotation.z = 0.1;
    g.add(m);
    return g;
  }

  function chip(color) {
    var g = new THREE.Group();
    var board = geo('chipBoard', function () { return new THREE.BoxGeometry(0.16, 0.02, 0.12); });
    var die = geo('chipDie', function () { return new THREE.BoxGeometry(0.06, 0.025, 0.06); });
    var b = mesh(board, mat(0x1a3a1a, { metalness: 0.3, roughness: 0.5 }));
    b.position.y = 0.03;
    var d = mesh(die, mat(color || 0x222222, {
      metalness: 0.5, emissive: 0x00ff88, emissiveIntensity: 0.3
    }));
    d.position.y = 0.05;
    g.add(b, d);
    // pins
    for (var i = 0; i < 4; i++) {
      var pin = mesh(geo('chipPin', function () { return new THREE.BoxGeometry(0.01, 0.03, 0.01); }),
        mat(0xccccaa, { metalness: 0.9 }));
      pin.position.set(-0.05 + i * 0.03, 0.015, 0.07);
      g.add(pin);
    }
    return g;
  }

  function sealMedallion(color) {
    var g = new THREE.Group();
    var disc = geo('sealDisc', function () { return new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16); });
    var ring = geo('sealRing', function () { return new THREE.TorusGeometry(0.1, 0.012, 6, 16); });
    var d = mesh(disc, mat(color || 0x4a2060, {
      metalness: 0.7, emissive: color || 0x331144, emissiveIntensity: 0.25
    }));
    d.rotation.x = Math.PI / 2;
    d.position.y = 0.08;
    var r = mesh(ring, mat(0xc4a35a, { metalness: 0.85 }));
    r.position.y = 0.08;
    g.add(d, r);
    return g;
  }

  // armor/weapon fallback (excluded from "full" set, still non-null)
  function genericCrate(color) {
    var g = new THREE.Group();
    var box = geo('crate', function () { return new THREE.BoxGeometry(0.22, 0.18, 0.22); });
    var m = mesh(box, mat(color || 0x888888, { metalness: 0.5, roughness: 0.5 }));
    m.position.y = 0.1;
    g.add(m);
    return g;
  }

  // ─── Per-item registry (100% non-armor/weapon) ───
  // builder: function returning THREE.Group
  var REGISTRY = {
    // adena
    copper_parts: function () { return pileCoins(0xb87333, 0xcd7f32); },

    // consumables
    synthetic_oil: function () { return flask(0x88aacc, 0xcc2222); },
    pressure_canister: function () { return canister(0x8a7355, 0xc4a35a); },
    soulshot_no_grade: function () { return cartridge(0x4a5560, 0xffaa33); },
    soulshot_d: function () { return cartridge(0x3a4a5a, 0xff8800); },
    spiritshot_no_grade: function () { return cartridge(0x3a4560, 0x44aaff); },
    spiritshot_d: function () { return cartridge(0x2a3560, 0x2288ff); },
    blessed_spiritshot_no_grade: function () { return cartridge(0x4a5588, 0x88ddff); },
    blessed_spiritshot_d: function () { return cartridge(0x2a4588, 0x66ccff); },
    emergency_repair_kit: function () { return kitBox(0x6b4423); },
    high_pressure_tank: function () { return canister(0x5a6a7a, 0x8899aa); },

    // materials
    gear_fragment: function () { return gear(0xb8860b); },
    copper_cable: function () { return cableCoil(0xb87333); },
    iron_scrap: function () { return scrap(0x6a6a6a); },
    steam_valve: function () { return valve(0x8b7355); },
    pressure_gauge: function () { return gauge(0xeeeedd); },
    piston_ring: function () { return metalRing(0x999999); },
    spark_plug: function () { return sparkPlug(0x555555); },
    oil_filter: function () { return canister(0x4a4a3a, 0x666655); },
    boiler_plate: function () { return plate(0x6b7280); },
    hydraulic_fluid: function () { return flask(0x88aacc, 0xddaa33); },
    coal_briquette: function () { return briquette(0x1a1a1a); },
    gasket_suede: function () { return leatherPatch(0x8b5a2b); },
    rubber_skin: function () { return leatherPatch(0x2a2a2a); },
    varnish_seal: function () { return flask(0xaa8866, 0x554422); },
    drive_bone: function () { return bone(0x7a8a6a); },
    silver_flux: function () { return powderPouch(0xc0c0d0); },
    rivet_pack: function () { return rivetPile(0x888888); },
    colossus_fragment: function () { return rockChunk(0x6b6560); },
    steel_plate: function () { return plate(0x8a9aaa); },

    // enchant
    pressure_amplifier: function () { return cartridge(0x3a5060, 0x44ddff); },
    pressure_amplifier_d: function () { return cartridge(0x2a4060, 0x22aaff); },
    blessed_pressure_amplifier: function () { return cartridge(0x4a6040, 0x88ff44); },

    // crystals
    crystal_no_grade: function () { return crystal(0x88ccff, 0x4488ff); },
    crystal_d: function () { return crystal(0xffcc44, 0xddaa22); },
    crystal_c: function () { return crystal(0x66ff99, 0x22cc66); },

    // recipes
    recipe_synthetic_oil: function () { return scroll(0xe8d5a3, 0xc4a35a); },
    recipe_pressure_canister: function () { return scroll(0xe0d0a0, 0xb8963a); },
    recipe_soulshot_no_grade: function () { return scroll(0xd8c898, 0xa8862a); },
    recipe_piston: function () { return scroll(0xd0c090, 0xc4a35a); },
    recipe_steel_plate: function () { return scroll(0xc8b888, 0x8a8a9a); },
    recipe_hydraulic_armor: function () { return scroll(0xe8d5b0, 0x66aacc); },
    recipe_hydraulic_blade: function () { return scroll(0xe0d0b0, 0xcc6644); },
    recipe_colossus_plating: function () { return scroll(0xd0c8b0, 0x888888); },
    recipe_toxic_plating: function () { return scroll(0xd0e0b0, 0x44aa44); },

    // accessories (jewelry = allowed, not armor)
    pressure_ring: function () { return metalRing(0xc4a35a); },
    copper_earring: function () { return earring(0xb87333); },
    engine_necklace: function () { return necklace(0xc4a35a, 0x445566); },
    tower_circuit_ring: function () { return metalRing(0x4488cc); },
    directive_seal: function () { return sealMedallion(0x4a2060); },

    // quest
    audio_log_01: function () { return tapeCassette(0x333344); },
    blue_capacitor: function () { return capacitor(0x2266cc); },
    boiler_heart: function () { return heartCore(0xcc3322); },

    // raid/RB cores
    drill_worm_core: function () { return crystal(0xff6622, 0xff4400); },
    press_hammer_core: function () { return crystal(0xffaa33, 0xdd8800); },
    green_protocol_core: function () { return crystal(0x66ff44, 0x33cc22); },
    cruma_core_shard: function () { return crystal(0xff8833, 0xee6600); },
    overmind_chip: function () { return chip(0x00ff88); },
    branded_boiler_core: function () { return crystal(0xff4422, 0xcc2200); }
  };

  var EXCLUDED_TYPES = { weapon: 1, armor: 1 };

  function getItemType(itemId) {
    var LR = root.LOOT_RULES || root.LOOT_ITEMS;
    var items = (LR && LR.LOOT_ITEMS) || root.LOOT_ITEMS || root.ITEM_DATABASE;
    if (items && items[itemId]) return items[itemId].type;
    return null;
  }

  function covers(itemId) {
    return !!REGISTRY[itemId];
  }

  function isExcluded(itemId) {
    var t = getItemType(itemId);
    return !!(t && EXCLUDED_TYPES[t]);
  }

  /**
   * @param {string} itemId
   * @param {{scale?:number, rarityColor?:number}} opts
   * @returns {THREE.Group}
   */
  function create(itemId, opts) {
    opts = opts || {};
    var group;
    if (REGISTRY[itemId]) {
      group = REGISTRY[itemId]();
    } else if (isExcluded(itemId)) {
      // armor / weapon — generic crate (by design)
      group = genericCrate(opts.rarityColor || 0x888888);
    } else {
      // unknown id — still something visible
      group = gear(0x888888);
    }
    var scale = opts.scale != null ? opts.scale : 1;
    group.scale.setScalar(scale);
    group.userData.dropItemId = itemId;
    group.userData.dropModel = true;
    return group;
  }

  function listCovered() {
    return Object.keys(REGISTRY).sort();
  }

  function coverageReport() {
    var items = (root.LOOT_RULES && root.LOOT_RULES.LOOT_ITEMS) || root.LOOT_ITEMS || {};
    var need = [];
    var covered = [];
    var skipped = [];
    Object.keys(items).forEach(function (id) {
      var t = items[id].type;
      if (EXCLUDED_TYPES[t]) skipped.push(id);
      else if (REGISTRY[id]) covered.push(id);
      else need.push(id);
    });
    return { covered: covered, missing: need, skippedArmorWeapon: skipped };
  }

  root.DropModels = {
    create: create,
    covers: covers,
    isExcluded: isExcluded,
    listCovered: listCovered,
    coverageReport: coverageReport,
    REGISTRY: REGISTRY
  };
})(typeof window !== 'undefined' ? window : globalThis);
