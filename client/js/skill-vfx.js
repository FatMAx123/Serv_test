// ============================================
// PROJECT STEAM: ORIGINS - SKILL-VFX.JS
// Эффекты в стиле классических MMO:
//   Cast circle (диск под ногами) → bolt trail → hit burst
// Спрайты + soft alpha canvas, не «проволочные» кольца.
// ============================================

(function () {
  'use strict';

  // ── palette ──
  const C = {
    cyan: 0x88ccee,
    cyanHot: 0xcceeff,
    white: 0xf5f8ff,
    steam: 0xe8eef5,
    steamDark: 0xb8c4d0,
    brass: 0xffcc55,
    copper: 0xff9955,
    // heal / саморемонт (зелёная «охлаждающая жидкость» + латунь)
    heal: 0x55dd77,
    healHot: 0xaaeeaa,
    healSoft: 0xc8f5d0,
    healDeep: 0x33aa55
  };

  // ── texture cache (canvas → CanvasTexture) ──
  const TEX = {};

  function scene() {
    return (window.game && window.game.scene) || null;
  }
  function THREE() {
    return window.THREE;
  }

  function makeTex(key, draw, size) {
    if (TEX[key]) return TEX[key];
    const s = size || 128;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d');
    draw(ctx, s);
    const t = new window.THREE.CanvasTexture(c);
    t.needsUpdate = true;
    t.colorSpace = window.THREE.SRGBColorSpace || undefined;
    TEX[key] = t;
    return t;
  }

  /** Soft radial glow (L2 cast/hit flash) */
  function texGlow(colorHex, soft) {
    const key = 'glow_' + colorHex + '_' + (soft ? 1 : 0);
    const col = hexToRgb(colorHex);
    return makeTex(key, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      if (soft) {
        g.addColorStop(0, 'rgba(' + col + ',1)');
        g.addColorStop(0.25, 'rgba(' + col + ',0.75)');
        g.addColorStop(0.55, 'rgba(' + col + ',0.25)');
        g.addColorStop(1, 'rgba(' + col + ',0)');
      } else {
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.15, 'rgba(' + col + ',0.95)');
        g.addColorStop(0.45, 'rgba(' + col + ',0.45)');
        g.addColorStop(1, 'rgba(' + col + ',0)');
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 128);
  }

  /**
   * L2 cast circle. theme: 'pressure' | 'heal'
   */
  function texCastCircle(theme) {
    const th = theme || 'pressure';
    const key = 'cast_circle_' + th;
    return makeTex(key, (ctx, s) => {
      const cx = s / 2, cy = s / 2, r = s * 0.46;
      ctx.clearRect(0, 0, s, s);
      const isHeal = th === 'heal';
      // soft fill
      let g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      if (isHeal) {
        g.addColorStop(0, 'rgba(120,240,150,0.55)');
        g.addColorStop(0.5, 'rgba(70,210,110,0.28)');
        g.addColorStop(0.85, 'rgba(50,180,90,0.12)');
        g.addColorStop(1, 'rgba(30,140,70,0)');
      } else {
        g.addColorStop(0, 'rgba(120,230,255,0.55)');
        g.addColorStop(0.5, 'rgba(80,200,255,0.28)');
        g.addColorStop(0.85, 'rgba(60,180,255,0.12)');
        g.addColorStop(1, 'rgba(40,160,255,0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = isHeal ? 'rgba(180,255,200,0.95)' : 'rgba(180,245,255,0.95)';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();

      // brass inner (steampunk)
      ctx.strokeStyle = 'rgba(255,220,120,0.75)';
      ctx.lineWidth = s * 0.018;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = isHeal ? 'rgba(140,240,170,0.55)' : 'rgba(160,230,255,0.55)';
      ctx.lineWidth = s * 0.01;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.22, cy + Math.sin(a) * r * 0.22);
        ctx.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255,200,80,0.85)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const x = cx + Math.cos(a) * r * 0.92;
        const y = cy + Math.sin(a) * r * 0.92;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.018, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 256);
  }

  /** Soft heal cross (L2 heal flash accent) */
  function texHealCross() {
    return makeTex('heal_cross_soft', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2;
      // soft green glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
      g.addColorStop(0, 'rgba(220,255,230,0.95)');
      g.addColorStop(0.35, 'rgba(100,230,140,0.45)');
      g.addColorStop(1, 'rgba(40,160,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      // cross bars with soft edges
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const w = s * 0.14, h = s * 0.42;
      ctx.fillRect(cx - w / 2, cy - h / 2, w, h);
      ctx.fillRect(cx - h / 2, cy - w / 2, h, w);
      // soften: re-blur via second gradient overlay
      const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.3);
      g2.addColorStop(0, 'rgba(200,255,210,0.35)');
      g2.addColorStop(1, 'rgba(100,200,120,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, s, s);
    }, 128);
  }

  /** Soft spark (редко — ядро/hit) */
  function texSpark() {
    return makeTex('spark_soft', (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.25, 'rgba(220,240,255,0.55)');
      g.addColorStop(0.55, 'rgba(180,210,230,0.2)');
      g.addColorStop(1, 'rgba(150,180,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 64);
  }

  /**
   * Облачко пара — мягкое, «дымовое», не искра.
   * Несколько размытых blob'ов = объёмный пар.
   */
  function texSteam() {
    return makeTex('steam_puff_v2', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      // base soft cloud
      const blobs = [
        [0.50, 0.52, 0.38, 0.55],
        [0.38, 0.45, 0.28, 0.40],
        [0.62, 0.48, 0.26, 0.38],
        [0.48, 0.38, 0.22, 0.32],
        [0.55, 0.62, 0.24, 0.30]
      ];
      blobs.forEach((b) => {
        const x = b[0] * s, y = b[1] * s, r = b[2] * s, a = b[3];
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,' + a + ')');
        g.addColorStop(0.35, 'rgba(230,238,245,' + (a * 0.55) + ')');
        g.addColorStop(0.7, 'rgba(200,215,230,' + (a * 0.18) + ')');
        g.addColorStop(1, 'rgba(180,200,220,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }, 128);
  }

  /** Bolt core — soft pressure puff, not laser spark */
  function texBolt() {
    return makeTex('bolt_steam', (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.25, 'rgba(220,240,255,0.7)');
      g.addColorStop(0.55, 'rgba(170,210,235,0.3)');
      g.addColorStop(1, 'rgba(140,180,210,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 64);
  }

  /** Speed Force electric lightning bolt (crisp branching lightning with gold/amber aura) */
  function texFlashLightning() {
    return makeTex('speed_force_lightning_bolt', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const drawBolt = (x1, y1, x2, y2, displace, width, colCore, colGlow) => {
        const pts = [{ x: x1, y: y1 }];
        const segs = 8;
        for (let i = 1; i < segs; i++) {
          const t = i / segs;
          const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * displace;
          const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * (displace * 0.4);
          pts.push({ x: px, y: py });
        }
        pts.push({ x: x2, y: y2 });

        ctx.strokeStyle = colGlow;
        ctx.lineWidth = width * 4.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'bevel';
        ctx.shadowColor = colGlow;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();

        ctx.strokeStyle = colCore;
        ctx.lineWidth = width;
        ctx.shadowBlur = 4;
        ctx.shadowColor = '#ffffff';
        ctx.beginPath();
        pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
        ctx.stroke();
        ctx.shadowBlur = 0;
      };

      drawBolt(s * 0.15, s * 0.08, s * 0.85, s * 0.92, s * 0.24, s * 0.038, '#ffffff', '#ffaa00');
      drawBolt(s * 0.45, s * 0.42, s * 0.12, s * 0.78, s * 0.16, s * 0.022, '#fff4cc', '#ff7700');
      drawBolt(s * 0.58, s * 0.52, s * 0.88, s * 0.38, s * 0.16, s * 0.022, '#fff4cc', '#ff9900');
    }, 256);
  }

  /** Speed Force ground shockwave ring with electric arc spikes */
  function texSpeedForceRing() {
    return makeTex('speed_force_shockwave_ring', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s * 0.43;

      const g = ctx.createRadialGradient(cx, cy, r * 0.65, cx, cy, r * 1.08);
      g.addColorStop(0, 'rgba(255,140,0,0)');
      g.addColorStop(0.5, 'rgba(255,200,20,0.35)');
      g.addColorStop(0.85, 'rgba(255,245,160,0.9)');
      g.addColorStop(1, 'rgba(255,100,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,220,0.95)';
      ctx.lineWidth = s * 0.032;
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,210,40,0.9)';
      ctx.lineWidth = s * 0.018;
      const teeth = 28;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        const rIn = r * 0.82;
        const rOut = r * (1.0 + (i % 2 === 0 ? 0.14 : 0.07));
        const midA = a + (Math.random() - 0.5) * 0.09;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn);
        ctx.lineTo(cx + Math.cos(midA) * r, cy + Math.sin(midA) * r);
        ctx.lineTo(cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    }, 256);
  }

  /** Speed Force electric arc segment for trail discharges */
  function texFlashArc() {
    return makeTex('speed_force_arc_segment', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cy = s / 2;
      const pts = [];
      const count = 6;
      for (let i = 0; i <= count; i++) {
        const t = i / count;
        const x = s * 0.08 + s * 0.84 * t;
        const y = cy + (Math.sin(t * Math.PI) * (Math.random() - 0.5) * s * 0.4);
        pts.push({ x, y });
      }
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = s * 0.07;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'bevel';
      ctx.shadowColor = '#ffbb00';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.022;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.shadowBlur = 0;
    }, 128);
  }

  /** Speed Force horizontal trailing lightning streamer (Frame 00:02 in reference) */
  function texFlashStreamer() {
    return makeTex('speed_force_streamer_ribbon', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const w = 512;
      const h = 128;
      const cy = h / 2;

      const segs = 18;
      const pts = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const x = t * w;
        const zig = Math.sin(i * 2.3) * 22 + (Math.random() - 0.5) * 14;
        const taper = Math.sin(t * Math.PI * 0.5);
        pts.push({ x, y: cy + zig * (0.3 + 0.7 * taper) });
      }

      // Outer golden glow
      ctx.strokeStyle = '#ff9900';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'bevel';
      ctx.shadowColor = '#ffaa00';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();

      // Middle bright yellow
      ctx.strokeStyle = '#ffee22';
      ctx.lineWidth = 8;
      ctx.shadowColor = '#ffee44';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();

      // Core white-hot filament
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Electric branching forks
      const drawFork = (sx, sy, ex, ey) => {
        ctx.strokeStyle = '#fff288';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      };
      drawFork(w * 0.65, cy + 10, w * 0.52, cy + 38);
      drawFork(w * 0.45, cy - 8, w * 0.32, cy - 35);
      drawFork(w * 0.8, cy + 5, w * 0.7, cy + 30);
    }, 512);
  }

  /** Speed Force radial needle spikes / starburst (Frame 00:01 in reference) */
  function texFlashRadialBurst() {
    return makeTex('speed_force_radial_spikes', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2;
      const count = 32;

      ctx.shadowColor = '#ffbb00';
      ctx.shadowBlur = 12;

      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2;
        const len = (i % 2 === 0 ? s * 0.46 : s * 0.32) * (0.8 + Math.random() * 0.2);
        const wAngle = 0.04;

        ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#ffea44';
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(ang - wAngle) * (len * 0.2), cy + Math.sin(ang - wAngle) * (len * 0.2));
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.lineTo(cx + Math.cos(ang + wAngle) * (len * 0.2), cy + Math.sin(ang + wAngle) * (len * 0.2));
        ctx.closePath();
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }, 256);
  }

  /** Steam sprite: NormalBlending = настоящий пар, не «неон» */
  function steamMat(map, color, opacity) {
    const THREE = window.THREE;
    return new THREE.SpriteMaterial({
      map: map,
      color: color != null ? color : 0xffffff,
      transparent: true,
      opacity: opacity != null ? opacity : 0.55,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
  }

  function makeSteamSprite(scale, opacity, color) {
    const sp = new window.THREE.Sprite(steamMat(texSteam(), color != null ? color : C.steam, opacity));
    const s = scale || 1.2;
    sp.scale.set(s, s * 0.85, 1);
    sp.renderOrder = 988;
    sp.frustumCulled = false;
    return sp;
  }

  function hexToRgb(hex) {
    const n = typeof hex === 'number' ? hex : parseInt(String(hex).replace('#', ''), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return r + ',' + g + ',' + b;
  }

  function spriteMat(map, color, opacity) {
    const THREE = window.THREE;
    return new THREE.SpriteMaterial({
      map: map,
      color: color != null ? color : 0xffffff,
      transparent: true,
      opacity: opacity != null ? opacity : 1,
      depthWrite: false,
      depthTest: true,
      fog: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
  }

  /** Ground-aligned mesh (cast circle under feet) — depthTest off so terrain never eats it */
  function groundDisc(map, size, color, opacity) {
    const THREE = window.THREE;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      map: map,
      color: color != null ? color : 0xffffff,
      transparent: true,
      opacity: opacity != null ? opacity : 1,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
      fog: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 980;
    mesh.frustumCulled = false;
    return mesh;
  }

  function makeSprite(map, color, opacity, scale) {
    const sp = new window.THREE.Sprite(spriteMat(map, color, opacity));
    const s = scale || 1;
    sp.scale.set(s, s, 1);
    sp.renderOrder = 990;
    sp.frustumCulled = false;
    // billboards: don't hide behind terrain slightly
    sp.material.depthTest = false;
    return sp;
  }

  function disposeObj(obj) {
    if (!obj) return;
    const sc = scene();
    obj.traverse && obj.traverse((ch) => {
      if (ch.geometry) ch.geometry.dispose();
      // do NOT dispose shared textures
      if (ch.material && !ch.material.map) {
        if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose && m.dispose());
        else if (ch.material.dispose) ch.material.dispose();
      } else if (ch.material) {
        // dispose material only, keep texture in TEX cache
        ch.material.dispose();
      }
    });
    if (obj.parent) obj.parent.remove(obj);
    else if (sc) sc.remove(obj);
  }

  function entityMesh(entity) {
    if (!entity) return null;
    return entity.meshGroup || entity.mesh || entity.sprite || (entity.isObject3D ? entity : null);
  }

  function feetPos(entity) {
    const THREE = window.THREE;
    if (!entity) return new THREE.Vector3();
    // prefer shadow (true ground)
    if (entity.shadow && entity.shadow.position) {
      return entity.shadow.position.clone();
    }
    const mesh = entityMesh(entity);
    if (mesh && mesh.position) {
      const p = mesh.position.clone();
      const sy = Math.abs((mesh.scale && mesh.scale.y) || 1.8);
      p.y = p.y - sy * 0.5 + 0.05;
      return p;
    }
    return new THREE.Vector3();
  }

  function chestPos(entity) {
    const THREE = window.THREE;
    const mesh = entityMesh(entity);
    if (!mesh || !mesh.position) return new THREE.Vector3(0, 1, 0);
    const p = mesh.position.clone();
    // mesh.y is already stand height (~center); nudge slightly up
    p.y += 0.35;
    return p;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  // ════════════════════════════════════════════════
  // CAST SESSION — L2 cast circle + aura + particles
  // theme: 'pressure' | 'heal'
  // ════════════════════════════════════════════════
  function CastFx(skillId, caster, target, theme) {
    this.skillId = skillId;
    this.caster = caster;
    this.target = target || null;
    this.theme = theme || 'pressure';
    this.isHeal = this.theme === 'heal';
    this.alive = true;
    this.t = 0;
    this.spin = 0;

    const sc = scene();
    if (!sc || !caster || !caster.mesh) {
      this.alive = false;
      return;
    }

    this.root = new window.THREE.Group();
    this.root.name = 'vfx_l2_cast_' + this.theme;
    this.root.frustumCulled = false;
    sc.add(this.root);

    const circleMap = texCastCircle(this.isHeal ? 'heal' : 'pressure');
    const glowHex = this.isHeal ? 0x55dd77 : 0x44ccff;
    const auraCol = this.isHeal ? C.healHot : C.cyanHot;
    const softCol = this.isHeal ? C.heal : C.cyan;
    const steamCol = this.isHeal ? C.healSoft : C.steam;
    const steamCol2 = this.isHeal ? C.heal : C.steamDark;

    // 1) CAST CIRCLE under feet
    this.circle = groundDisc(circleMap, this.isHeal ? 3.2 : 3.6, 0xffffff, 0.95);
    this.root.add(this.circle);

    this.circleSoft = groundDisc(texGlow(glowHex, true), this.isHeal ? 3.8 : 4.2, softCol, 0.5);
    this.root.add(this.circleSoft);

    // 2) BODY AURA
    this.aura = makeSprite(texGlow(glowHex, true), auraCol, 0.7, this.isHeal ? 2.6 : 2.8);
    this.root.add(this.aura);

    this.core = makeSprite(texGlow(0xffffff, false), this.isHeal ? C.healSoft : C.white, 0.85, this.isHeal ? 1.0 : 1.2);
    this.root.add(this.core);

    // heal: soft cross above chest (L2 self-heal cue)
    this.cross = null;
    if (this.isHeal) {
      this.cross = makeSprite(texHealCross(), 0xffffff, 0.75, 1.4);
      this.root.add(this.cross);
    }

    // 3) few soft puffs (steam / coolant mist)
    this.orbs = [];
    for (let i = 0; i < 3; i++) {
      const o = makeSteamSprite(1.05 + i * 0.12, 0.38, i % 2 ? steamCol : steamCol2);
      this.root.add(o);
      this.orbs.push({
        sp: o,
        a: (i / 3) * Math.PI * 2,
        r: 0.85 + i * 0.22,
        h: 0.5 + i * 0.28,
        spd: 1.0 + i * 0.12,
        baseScale: 1.05 + i * 0.12
      });
    }

    // 4) rising wisps — heal: upward restorative mist
    this.wisps = [];
    for (let i = 0, nW = this.isHeal ? 3 : 4; i < nW; i++) {
      const w = makeSteamSprite(1.3, 0.35, steamCol);
      this.root.add(w);
      this.wisps.push({
        sp: w,
        a: Math.random() * Math.PI * 2,
        r: rand(0.3, 1.0),
        y: rand(0.15, 1.5),
        vy: rand(0.35, 0.8),
        grow: rand(0.008, 0.018)
      });
    }

    // 5) aim only for targeted skills
    this.aimDots = [];
    if (!this.isHeal && target && target.mesh) {
      for (let i = 0; i < 3; i++) {
        const d = makeSteamSprite(0.7, 0.3, C.steam);
        this.root.add(d);
        this.aimDots.push(d);
      }
    }

    this._place(0);
  }

  CastFx.prototype._place = function (progress) {
    if (!this.caster || !this.caster.mesh) return;
    const feet = feetPos(this.caster);
    const chest = chestPos(this.caster);

    // root at feet world pos
    this.root.position.set(feet.x, feet.y + 0.04, feet.z);

    const p = Math.max(0, Math.min(1, progress || 0));
    const chestLocalY = Math.max(0.6, chest.y - feet.y);

    // circle spin + grow
    if (this.circle) {
      this.circle.rotation.z = this.spin;
      const cs = 0.85 + p * 0.45 + Math.sin(this.spin * 3) * 0.04;
      this.circle.scale.set(cs, cs, 1);
      this.circle.material.opacity = 0.55 + p * 0.45;
    }
    if (this.circleSoft) {
      this.circleSoft.rotation.z = -this.spin * 0.6;
      const ss = 0.9 + p * 0.7 + Math.sin(this.spin * 4) * 0.08;
      this.circleSoft.scale.set(ss, ss, 1);
      this.circleSoft.material.opacity = 0.25 + p * 0.45;
    }

    // aura / core at chest
    if (this.aura) {
      this.aura.position.set(0, chestLocalY, 0);
      const as = (this.isHeal ? 1.8 : 2.0) + p * 2.0 + Math.sin(this.spin * 5) * 0.12;
      this.aura.scale.set(as, as, 1);
      this.aura.material.opacity = 0.4 + p * 0.45;
    }
    if (this.core) {
      this.core.position.set(0, chestLocalY, 0);
      const ks = 0.7 + p * 1.4 + Math.sin(this.spin * 12) * 0.1 * p;
      this.core.scale.set(ks, ks, 1);
      this.core.material.opacity = 0.55 + p * 0.4;
    }
    if (this.cross) {
      this.cross.position.set(0, chestLocalY + 0.55 + Math.sin(this.spin * 3) * 0.06, 0);
      const cs = 1.1 + p * 0.9 + Math.sin(this.spin * 4) * 0.08;
      this.cross.scale.set(cs, cs, 1);
      this.cross.material.opacity = 0.45 + p * 0.5;
      this.cross.material.rotation = Math.sin(this.spin * 0.5) * 0.08;
    }

    // orbiting steam puffs — slow, soft
    this.orbs.forEach((o) => {
      o.a += o.spd * 0.018 * (1 + p * 0.5);
      const rr = o.r * (0.9 + p * 0.25);
      o.sp.position.set(
        Math.cos(o.a) * rr,
        o.h * (0.7 + p * 0.4) + Math.sin(this.spin + o.a) * 0.08,
        Math.sin(o.a) * rr
      );
      const os = o.baseScale * (0.9 + p * 0.35 + Math.sin(this.spin * 2 + o.a) * 0.08);
      o.sp.scale.set(os, os * 0.85, 1);
      o.sp.material.opacity = 0.28 + p * 0.28;
    });

    // rising steam — expands while rising (как настоящий пар)
    this.wisps.forEach((w) => {
      w.y += w.vy * 0.018;
      w.a += 0.02;
      if (w.y > 2.4) {
        w.y = 0.08;
        w.r = rand(0.35, 1.1);
        w.sp.scale.set(1.0, 0.85, 1);
      }
      const pull = 1 - p * 0.4;
      w.sp.position.set(
        Math.cos(w.a) * w.r * pull,
        w.y,
        Math.sin(w.a) * w.r * pull
      );
      // grow as it rises
      const grow = 1.0 + w.y * 0.35 + p * 0.25;
      w.sp.scale.set(grow * 1.2, grow, 1);
      w.sp.material.opacity = Math.max(0.08, 0.42 - w.y * 0.12 + p * 0.12);
    });

    // aim steam dots
    if (this.aimDots.length && this.target && this.target.mesh) {
      const from = chest;
      const to = chestPos(this.target);
      for (let i = 0; i < this.aimDots.length; i++) {
        const u = (i + 1) / (this.aimDots.length + 1);
        const wx = from.x + (to.x - from.x) * u;
        const wy = from.y + (to.y - from.y) * u + Math.sin(this.spin * 2 + i) * 0.08;
        const wz = from.z + (to.z - from.z) * u;
        this.aimDots[i].position.set(wx - feet.x, wy - feet.y, wz - feet.z);
        this.aimDots[i].material.opacity = 0.18 + p * 0.28;
        const ds = 0.55 + p * 0.35 + u * 0.2;
        this.aimDots[i].scale.set(ds, ds * 0.85, 1);
      }
    }

    // final charge pulse
    if (p > 0.88 && this.core) {
      const flash = 0.5 + 0.5 * Math.sin(this.spin * 22);
      this.core.material.opacity = 0.7 + flash * 0.3;
      this.core.scale.multiplyScalar(1 + flash * 0.08);
    }
  };

  CastFx.prototype.update = function (progress) {
    if (!this.alive) return;
    this.t += 0.016;
    this.spin += 0.06 + (progress || 0) * 0.1;
    try {
      this._place(progress);
    } catch (e) {
      console.warn('[SkillVFX] cast place', e);
    }
  };

  CastFx.prototype.stop = function (cancel) {
    if (!this.alive) return;
    this.alive = false;
    const root = this.root;
    this.root = null;
    if (!root) return;
    if (cancel) {
      let n = 0;
      const fade = () => {
        n++;
        root.traverse((ch) => {
          if (ch.material && ch.material.opacity != null) ch.material.opacity *= 0.72;
        });
        if (n < 10) requestAnimationFrame(fade);
        else disposeObj(root);
      };
      fade();
    } else {
      disposeObj(root);
    }
  };

  // ════════════════════════════════════════════════
  // RELEASE + BOLT + HIT
  // ════════════════════════════════════════════════
  function releaseFlash(worldPos, feetWorld) {
    const sc = scene();
    if (!sc || !worldPos) return;

    const flash = makeSprite(texGlow(0xffffff, false), C.cyanHot, 1, 3.2);
    flash.position.copy(worldPos);
    sc.add(flash);

    const fy = feetWorld || new window.THREE.Vector3(worldPos.x, worldPos.y - 1.0, worldPos.z);
    const ring = groundDisc(texCastCircle(), 2.8, 0xffffff, 0.9);
    ring.position.set(fy.x, fy.y + 0.05, fy.z);
    sc.add(ring);

    let f = 0;
    const anim = () => {
      f++;
      flash.scale.setScalar(3.2 + f * 0.35);
      flash.material.opacity -= 0.07;
      ring.scale.x += 0.18;
      ring.scale.y += 0.18;
      ring.material.opacity -= 0.06;
      if (flash.material.opacity > 0.02) requestAnimationFrame(anim);
      else {
        disposeObj(flash);
        disposeObj(ring);
      }
    };
    requestAnimationFrame(anim);
  }

  function fireBolt(from, to, onHit) {
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !from || !to) {
      if (onHit) onHit();
      return;
    }

    const bolt = makeSprite(texBolt(), C.white, 1, 1.4);
    bolt.position.copy(from);
    sc.add(bolt);

    const glow = makeSprite(texGlow(0x55ddff, true), C.cyan, 0.85, 2.2);
    glow.position.copy(from);
    sc.add(glow);

    // trail — мало крупных паровых клубков
    const trail = [];
    for (let i = 0; i < 5; i++) {
      const t = makeSteamSprite(1.1, 0.45, C.steam);
      t.visible = false;
      sc.add(t);
      trail.push({ sp: t, life: 0 });
    }

    const start = from.clone();
    const end = to.clone();
    const dist = start.distanceTo(end);
    const duration = Math.max(0.14, Math.min(0.5, dist / 36));
    const t0 = performance.now();
    let trailIdx = 0;
    let lastTrail = 0;

    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / (duration * 1000));
      const ease = u * u * (3 - 2 * u);
      const pos = start.clone().lerp(end, ease);
      pos.y += Math.sin(u * Math.PI) * Math.min(1.4, dist * 0.04);

      bolt.position.copy(pos);
      glow.position.copy(pos);
      const pulse = 1 + Math.sin(u * 40) * 0.12;
      bolt.scale.set(1.3 * pulse, 1.3 * pulse, 1);
      glow.scale.set(2.0 * pulse, 2.0 * pulse, 1);

      if (performance.now() - lastTrail > 55) {
        lastTrail = performance.now();
        const tr = trail[trailIdx % trail.length];
        trailIdx++;
        tr.sp.visible = true;
        tr.sp.position.copy(pos);
        tr.life = 1;
        tr.sp.scale.set(1.0, 0.85, 1);
        tr.sp.material.opacity = 0.5;
      }
      trail.forEach((tr) => {
        if (!tr.sp.visible) return;
        tr.life -= 0.06;
        tr.sp.scale.x *= 1.04;
        tr.sp.scale.y *= 1.035;
        tr.sp.material.opacity = Math.max(0, tr.life * 0.45);
        tr.sp.position.y += 0.045;
        if (tr.life <= 0) tr.sp.visible = false;
      });

      if (u < 1) requestAnimationFrame(step);
      else {
        disposeObj(bolt);
        disposeObj(glow);
        trail.forEach((tr) => disposeObj(tr.sp));
        if (onHit) onHit();
      }
    };
    requestAnimationFrame(step);
  }

  function pressureHit(target) {
    const sc = scene();
    if (!sc) return;

    let pos;
    if (target && target.mesh) {
      pos = chestPos(target);
    } else if (target && target.x != null) {
      pos = new window.THREE.Vector3(target.x, target.y || 1, target.z);
    } else {
      return;
    }

    const feet = (target && target.mesh)
      ? feetPos(target)
      : new window.THREE.Vector3(pos.x, pos.y - 1, pos.z);

    // big flash
    const flash = makeSprite(texGlow(0xffffff, false), C.cyanHot, 1, 3.5);
    flash.position.copy(pos);
    sc.add(flash);

    // secondary burst
    const burst = makeSprite(texGlow(0x55ddff, true), C.cyan, 0.9, 2.5);
    burst.position.copy(pos);
    sc.add(burst);

    // ground shock rings (2 discs)
    const r1 = groundDisc(texCastCircle(), 2.2, 0xffffff, 0.95);
    r1.position.set(feet.x, feet.y + 0.06, feet.z);
    sc.add(r1);
    const r2 = groundDisc(texGlow(0x44ccff, true), 2.8, C.cyan, 0.7);
    r2.position.set(feet.x, feet.y + 0.08, feet.z);
    sc.add(r2);

    // hit steam puffs — мало, крупные
    const bits = [];
    for (let i = 0; i < 5; i++) {
      const b = makeSteamSprite(1.3, 0.55, i % 2 ? C.steam : C.steamDark);
      b.position.copy(pos);
      sc.add(b);
      const a = (i / 5) * Math.PI * 2 + rand(-0.2, 0.2);
      const sp = rand(1.5, 3.5);
      bits.push({
        sp: b,
        vx: Math.cos(a) * sp,
        vy: rand(1.2, 3.2),
        vz: Math.sin(a) * sp
      });
    }

    // mob crush (mesh or online sprite)
    if (target && (target.mesh || target.sprite)) playMobCrush(target);

    let f = 0;
    const maxF = 36;
    const anim = () => {
      f++;
      const t = f / maxF;

      flash.scale.setScalar(3.5 + t * 5);
      flash.material.opacity = Math.max(0, 1 - t * 1.3);
      burst.scale.setScalar(2.5 + t * 4);
      burst.material.opacity = Math.max(0, 0.9 - t * 1.2);

      r1.scale.setScalar(1 + t * 3.5);
      r1.material.opacity = Math.max(0, 0.95 * (1 - t));
      r2.scale.setScalar(1 + t * 4.2);
      r2.material.opacity = Math.max(0, 0.7 * (1 - t));

      bits.forEach((b) => {
        b.sp.position.x += b.vx * 0.035;
        b.sp.position.y += b.vy * 0.035;
        b.sp.position.z += b.vz * 0.035;
        b.vy -= 0.08;
        b.vx *= 0.98;
        b.vz *= 0.98;
        b.sp.material.opacity = Math.max(0, 0.55 * (1 - t));
        b.sp.scale.x *= 1.03;
        b.sp.scale.y *= 1.025;
      });

      if (f < maxF) requestAnimationFrame(anim);
      else {
        disposeObj(flash);
        disposeObj(burst);
        disposeObj(r1);
        disposeObj(r2);
        bits.forEach((b) => disposeObj(b.sp));
      }
    };
    requestAnimationFrame(anim);
  }

  /**
   * Саморемонт / Self Heal complete — L2-style green burst on self.
   * Мало частиц, мягкий «охлаждающий» пар.
   */
  function playSelfRepair(caster) {
    const sc = scene();
    if (!sc || !caster || !caster.mesh) return;

    const feet = feetPos(caster);
    const chest = chestPos(caster);

    // ground heal circle
    const ring = groundDisc(texCastCircle('heal'), 2.6, 0xffffff, 0.95);
    ring.position.set(feet.x, feet.y + 0.05, feet.z);
    sc.add(ring);

    const soft = groundDisc(texGlow(0x55dd77, true), 3.2, C.heal, 0.65);
    soft.position.set(feet.x, feet.y + 0.07, feet.z);
    sc.add(soft);

    // body flash
    const flash = makeSprite(texGlow(0x55dd77, false), C.healHot, 1, 3.0);
    flash.position.copy(chest);
    sc.add(flash);

    // soft cross
    const cross = makeSprite(texHealCross(), 0xffffff, 0.95, 1.8);
    cross.position.set(chest.x, chest.y + 0.4, chest.z);
    sc.add(cross);

    // rising restorative mist (few)
    const bits = [];
    for (let i = 0; i < 4; i++) {
      const b = makeSteamSprite(1.2, 0.5, i % 2 ? C.healSoft : C.heal);
      b.position.set(
        chest.x + rand(-0.35, 0.35),
        chest.y + rand(-0.2, 0.2),
        chest.z + rand(-0.35, 0.35)
      );
      sc.add(b);
      bits.push({
        sp: b,
        vy: rand(1.0, 2.2),
        vx: rand(-0.4, 0.4),
        vz: rand(-0.4, 0.4)
      });
    }

    // brief green tint on caster
    const mat = caster.mesh.material;
    let orig = null;
    if (mat && mat.color) {
      orig = mat.color.getHex();
      mat.color.setHex(0xaaffee);
    }

    let f = 0;
    const maxF = 40;
    const anim = () => {
      f++;
      const t = f / maxF;

      ring.scale.setScalar(1 + t * 2.2);
      ring.material.opacity = Math.max(0, 0.95 * (1 - t));
      soft.scale.setScalar(1 + t * 2.8);
      soft.material.opacity = Math.max(0, 0.6 * (1 - t));

      flash.scale.setScalar(3.0 + t * 3.5);
      flash.material.opacity = Math.max(0, 1 - t * 1.2);
      cross.position.y = chest.y + 0.4 + t * 1.2;
      cross.scale.setScalar(1.8 + t * 1.5);
      cross.material.opacity = Math.max(0, 0.95 * (1 - t * 1.1));

      bits.forEach((b) => {
        b.sp.position.x += b.vx * 0.03;
        b.sp.position.y += b.vy * 0.035;
        b.sp.position.z += b.vz * 0.03;
        b.sp.scale.x *= 1.025;
        b.sp.scale.y *= 1.02;
        b.sp.material.opacity = Math.max(0, 0.5 * (1 - t));
      });

      if (mat && mat.color && orig != null) {
        if (t < 0.35) mat.color.setHex(t < 0.15 ? 0xbbffcc : 0xddffee);
        else mat.color.setHex(orig);
      }

      if (f < maxF) requestAnimationFrame(anim);
      else {
        disposeObj(ring);
        disposeObj(soft);
        disposeObj(flash);
        disposeObj(cross);
        bits.forEach((b) => disposeObj(b.sp));
        if (mat && mat.color && orig != null) mat.color.setHex(orig);
      }
    };
    requestAnimationFrame(anim);
  }

  function playMobCrush(target) {
    // Online remotes use .sprite; offline ZoneEnemy uses .mesh
    const mesh = (target && (target.mesh || target.sprite)) || null;
    if (!mesh || !mesh.position) return;
    if (mesh.userData && mesh.userData._crushToken) mesh.userData._crushToken.dead = true;
    const token = { dead: false };
    mesh.userData = mesh.userData || {};
    mesh.userData._crushToken = token;

    // Base scale — always positive (THREE.Sprite ignores negative scale.x; we flip via UV)
    const bx = Math.abs(mesh.userData._bsx != null ? mesh.userData._bsx : mesh.scale.x) || 1;
    const by = Math.abs(mesh.userData._bsy != null ? mesh.userData._bsy : mesh.scale.y) || 1;
    const bz = Math.abs(mesh.userData._bsz != null ? mesh.userData._bsz : mesh.scale.z) || 1;
    mesh.userData._bsx = bx;
    mesh.userData._bsy = by;
    mesh.userData._bsz = bz;

    // CRITICAL: capture world Y once per hit as additive base — never multiply
    // (old code did baseY * factor → on hills y jumped tens of meters → "flies into sky")
    const baseY = mesh.position.y;

    // Ensure unique material so hit tint never flashes all shared sprites
    let mat = mesh.material;
    if (mat && !mesh.userData._ownsMaterial && mat.clone) {
      mat = mat.clone();
      mesh.material = mat;
      mesh.userData._ownsMaterial = true;
    }
    let orig = null;
    if (mat && mat.color) {
      orig = mat.color.getHex();
      mat.color.setHex(0x88eeff);
    }

    const t0 = performance.now();
    const dur = 420;
    const step = () => {
      if (token.dead) return;
      // If mesh was removed (death), stop
      if (!mesh.parent && !mesh.userData) return;
      const u = Math.min(1, (performance.now() - t0) / dur);
      let sx = 1, sy = 1;
      if (u < 0.2) {
        const k = u / 0.2;
        sx = 1 + 0.35 * k;
        sy = 1 - 0.35 * k;
      } else if (u < 0.48) {
        const k = (u - 0.2) / 0.28;
        sx = 1.35 - 0.4 * k;
        sy = 0.65 + 0.45 * k;
      } else {
        const k = (u - 0.48) / 0.52;
        const e = 1 - Math.pow(1 - k, 3);
        sx = 0.95 + 0.05 * e;
        sy = 1.1 - 0.1 * e;
      }
      mesh.scale.set(bx * sx, by * sy, bz * sx);
      // Keep feet roughly grounded: offset by half of height delta only (not worldY * factor)
      if (mesh.isSprite || mesh.type === 'Sprite') {
        const dy = by * (sy - 1) * 0.5;
        // tiny hop peak mid-anim, max ~0.2m
        const hop = Math.sin(Math.min(1, u / 0.48) * Math.PI) * 0.12 * (u < 0.55 ? 1 : 0);
        mesh.position.y = baseY + dy + hop;
      }
      if (mat && mat.color && orig != null) {
        if (u < 0.28) mat.color.setHex(u < 0.12 ? 0x99eeff : 0xffaa66);
        else mat.color.setHex(orig);
      }
      if (u < 1) requestAnimationFrame(step);
      else {
        mesh.scale.set(bx, by, bz);
        mesh.position.y = baseY;
        if (mat && mat.color && orig != null) mat.color.setHex(orig);
        if (mesh.userData._crushToken === token) mesh.userData._crushToken = null;
      }
    };
    requestAnimationFrame(step);
  }

  // ════════════════════════════════════════════════
  // COMBAT HIT / CRIT — animated strike flash (AA + skills)
  // ════════════════════════════════════════════════
  function texSlashArc() {
    return makeTex('hit_slash_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // crescent slash
      ctx.beginPath();
      ctx.arc(cx - s * 0.05, cy, s * 0.36, -0.9, 1.1);
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = s * 0.07;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - s * 0.02, cy + s * 0.02, s * 0.32, -0.85, 1.05);
      ctx.strokeStyle = 'rgba(255,200,90,0.85)';
      ctx.lineWidth = s * 0.045;
      ctx.stroke();
      // soft glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 0.48);
      g.addColorStop(0, 'rgba(255,240,180,0.35)');
      g.addColorStop(0.5, 'rgba(255,160,60,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, 128);
  }

  function texCritStar() {
    return makeTex('hit_crit_star_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s * 0.42;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const rr = (i % 2 === 0) ? r : r * 0.38;
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,220,80,0.95)');
      g.addColorStop(0.75, 'rgba(255,80,40,0.55)');
      g.addColorStop(1, 'rgba(255,40,0,0)');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }, 128);
  }

  /**
   * Animated hit on target entity.
   * @param {object} target — { mesh|sprite, shadow? }
   * @param {{ crit?: boolean, incoming?: boolean }} [opts]
   */
  function playCombatHit(target, opts) {
    opts = opts || {};
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !THREE || !target) return;

    const crit = !!opts.crit;
    const incoming = !!opts.incoming;
    const mesh = entityMesh(target);
    const pos = chestPos(target);
    if (!pos || (pos.x === 0 && pos.y === 1 && pos.z === 0 && !mesh)) {
      // still try mesh position
      if (mesh && mesh.position) pos.copy(mesh.position);
    }

    // palette: outgoing (player→mob) warm brass; incoming (mob→player) cold cyan; crit gold/red
    const colCore = crit ? 0xffee66 : (incoming ? 0xff6666 : 0xffcc66);
    const colRing = crit ? 0xff4422 : (incoming ? 0xff3344 : 0xffaa44);
    const colSlash = crit ? 0xffffff : (incoming ? 0xff8888 : 0xffe0a0);

    // 1) flash burst
    const flash = makeSprite(texGlow(colCore, false), 0xffffff, 1, crit ? 2.4 : 1.6);
    flash.position.copy(pos);
    sc.add(flash);

    // 2) colored ring burst
    const burst = makeSprite(texGlow(colRing, true), colRing, 0.95, crit ? 2.0 : 1.35);
    burst.position.copy(pos);
    sc.add(burst);

    // 3) slash arc (rotates)
    const slash = makeSprite(texSlashArc(), colSlash, 0.95, crit ? 2.2 : 1.5);
    slash.position.copy(pos);
    slash.material.rotation = rand(-0.6, 0.6);
    sc.add(slash);

    // 4) crit star + extra sparks
    let star = null;
    if (crit) {
      star = makeSprite(texCritStar(), 0xffffff, 1, 1.8);
      star.position.copy(pos);
      sc.add(star);
    }

    // 5) spark bits
    const bits = [];
    const nBits = crit ? 10 : 5;
    for (let i = 0; i < nBits; i++) {
      const b = makeSprite(texGlow(crit ? 0xffaa33 : (incoming ? 0xff5555 : 0xffcc77), true), 0xffffff, 0.9, crit ? 0.55 : 0.38);
      b.position.copy(pos);
      sc.add(b);
      const a = (i / nBits) * Math.PI * 2 + rand(-0.25, 0.25);
      const sp = crit ? rand(2.2, 4.5) : rand(1.2, 2.8);
      bits.push({
        sp: b,
        vx: Math.cos(a) * sp,
        vy: rand(0.8, crit ? 3.2 : 2.0),
        vz: Math.sin(a) * sp
      });
    }

    // 6) light squash on target (skip if skill VFX already crushed)
    if (mesh && !opts.light) playMobCrush(target);

    const maxF = crit ? 28 : 22;
    let f = 0;
    const anim = () => {
      f++;
      const t = f / maxF;

      flash.scale.setScalar((crit ? 2.8 : 1.8) + t * (crit ? 4.5 : 3.2));
      flash.material.opacity = Math.max(0, 1 - t * 1.35);
      burst.scale.setScalar((crit ? 2.2 : 1.4) + t * (crit ? 5 : 3.5));
      burst.material.opacity = Math.max(0, 0.95 * (1 - t));

      slash.material.rotation += crit ? 0.18 : 0.12;
      slash.scale.setScalar((crit ? 2.0 : 1.4) * (1 + t * 0.85));
      slash.material.opacity = Math.max(0, 0.95 - t * 1.25);

      if (star) {
        star.material.rotation += 0.22;
        star.scale.setScalar(1.6 + Math.sin(t * Math.PI) * 1.4);
        star.material.opacity = Math.max(0, 1 - t * 1.1);
        star.position.y = pos.y + t * 0.6;
      }

      bits.forEach((b) => {
        b.sp.position.x += b.vx * 0.032;
        b.sp.position.y += b.vy * 0.032;
        b.sp.position.z += b.vz * 0.032;
        b.vy -= 0.07;
        b.vx *= 0.97;
        b.vz *= 0.97;
        b.sp.material.opacity = Math.max(0, 0.9 * (1 - t));
        b.sp.scale.setScalar((crit ? 0.55 : 0.38) * (1 - t * 0.5));
      });

      if (f < maxF) requestAnimationFrame(anim);
      else {
        disposeObj(flash);
        disposeObj(burst);
        disposeObj(slash);
        if (star) disposeObj(star);
        bits.forEach((b) => disposeObj(b.sp));
      }
    };
    requestAnimationFrame(anim);
  }

  // ════════════════════════════════════════════════
  // LEVEL-UP — Classic MMO style
  //   golden ground rings · vertical light pillar · rising sparks · flash
  // ════════════════════════════════════════════════
  function texLevelRing() {
    return makeTex('lvlup_ring_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s * 0.46;
      // soft gold fill
      let g = ctx.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
      g.addColorStop(0, 'rgba(255,250,220,0.55)');
      g.addColorStop(0.35, 'rgba(255,210,80,0.35)');
      g.addColorStop(0.7, 'rgba(255,180,40,0.18)');
      g.addColorStop(1, 'rgba(255,140,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // outer bright ring
      ctx.strokeStyle = 'rgba(255,245,200,0.95)';
      ctx.lineWidth = s * 0.04;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      ctx.stroke();
      // mid gold
      ctx.strokeStyle = 'rgba(255,200,60,0.85)';
      ctx.lineWidth = s * 0.022;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      // inner white
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = s * 0.014;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      // rune ticks (L2 circle décor)
      ctx.strokeStyle = 'rgba(255,230,140,0.7)';
      ctx.lineWidth = s * 0.012;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72);
        ctx.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
        ctx.stroke();
      }
      // spark dots
      ctx.fillStyle = 'rgba(255,255,220,0.9)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.1;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9, s * 0.016, 0, Math.PI * 2);
        ctx.fill();
      }
    }, 256);
  }

  function texPillar() {
    return makeTex('lvlup_pillar_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      // vertical soft beam (x = width, y = height in UV later)
      const g = ctx.createLinearGradient(0, 0, s, 0);
      g.addColorStop(0, 'rgba(255,220,80,0)');
      g.addColorStop(0.25, 'rgba(255,230,140,0.35)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.75, 'rgba(200,230,255,0.45)');
      g.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      // soft vertical fade top/bottom
      const vg = ctx.createLinearGradient(0, 0, 0, s);
      vg.addColorStop(0, 'rgba(0,0,0,0.85)');
      vg.addColorStop(0.08, 'rgba(0,0,0,0)');
      vg.addColorStop(0.92, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }, 128);
  }

  function ensureLevelUpCss() {
    if (document.getElementById('l2-levelup-css')) return;
    const style = document.createElement('style');
    style.id = 'l2-levelup-css';
    style.textContent = [
      '#l2-levelup-banner{',
      'position:fixed;left:50%;top:22%;transform:translate(-50%,-50%) scale(0.6);',
      'z-index:12000;pointer-events:none;text-align:center;opacity:0;',
      'font-family:Georgia,"Times New Roman","Segoe UI",serif;letter-spacing:0.08em;',
      'text-transform:none;color:#ffe9a0;',
      'text-shadow:0 0 8px #ffcc44,0 0 24px #ffaa22,0 2px 4px #000,0 0 40px rgba(255,200,80,0.7);',
      'transition:opacity 0.15s ease-out,transform 0.35s cubic-bezier(0.2,1.4,0.3,1);',
      '}',
      '#l2-levelup-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1);}',
      '#l2-levelup-banner .l2lu-title{font-size:36px;font-weight:700;line-height:1.15;}',
      '#l2-levelup-banner .l2lu-lv{font-size:22px;margin-top:6px;color:#fff8d0;letter-spacing:0.12em;',
      'text-shadow:0 0 10px #88ccff,0 0 20px #ffcc66,0 2px 3px #000;}',
      '#l2-levelup-banner.fade{opacity:0;transform:translate(-50%,-60%) scale(1.05);transition:opacity 0.55s ease,transform 0.55s ease;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function showLevelUpBanner(level) {
    ensureLevelUpCss();
    let el = document.getElementById('l2-levelup-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'l2-levelup-banner';
      document.body.appendChild(el);
    }
    el.className = '';
    el.innerHTML = '<div class="l2lu-title">Уровень повышен</div>' +
      (level != null ? '<div class="l2lu-lv">Ур. ' + level + '</div>' : '');
    // reflow then show
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 600);
    }, 1800);
  }

  /**
   * Full L2-style level-up VFX on entity (local player or remote).
   * @param {object} entity — player with mesh
   * @param {{ level?: number, duration?: number }} [opts]
   */
  function playLevelUp(entity, opts) {
    opts = opts || {};
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !THREE || !entity || !entity.mesh) return;

    const dur = opts.duration != null ? opts.duration : 2.6;
    const feet = feetPos(entity);
    const root = new THREE.Group();
    root.name = 'vfx_l2_levelup';
    root.frustumCulled = false;
    root.position.copy(feet);
    sc.add(root);

    // follow player feet while animating
    const follow = () => {
      if (!entity || !entity.mesh) return;
      const f = feetPos(entity);
      root.position.x = f.x;
      root.position.y = f.y;
      root.position.z = f.z;
    };

    // textures
    const ringMap = texLevelRing();
    const pillarMap = texPillar();
    const glowGold = texGlow(0xffcc44, true);
    const glowWhite = texGlow(0xffffff, false);
    const glowBlue = texGlow(0x88ccff, true);
    const sparkMap = texSpark();

    // ── ground rings (3 expanding) ──
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = groundDisc(ringMap, 1.2, 0xffffff, 0.95);
      ring.userData.delay = i * 0.18;
      ring.userData.baseSize = 1.4 + i * 0.35;
      ring.scale.set(0.01, 0.01, 0.01);
      ring.material.opacity = 0;
      root.add(ring);
      rings.push(ring);
    }
    // soft gold floor glow
    const floorGlow = groundDisc(glowGold, 5.5, 0xffcc66, 0.75);
    floorGlow.position.y = 0.02;
    root.add(floorGlow);

    // ── light pillar (crossed billboard planes) ──
    const pillarH = 9.5;
    const pillarW = 1.35;
    const makePillarPlane = (rotY) => {
      const geo = new THREE.PlaneGeometry(pillarW, pillarH);
      const mat = new THREE.MeshBasicMaterial({
        map: pillarMap,
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        fog: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = pillarH * 0.45;
      m.rotation.y = rotY;
      m.renderOrder = 995;
      m.frustumCulled = false;
      return m;
    };
    const pillarA = makePillarPlane(0);
    const pillarB = makePillarPlane(Math.PI / 2);
    root.add(pillarA);
    root.add(pillarB);

    // outer soft blue-gold halo planes (wider)
    const makeHalo = (rotY, w, col) => {
      const geo = new THREE.PlaneGeometry(w, pillarH * 0.95);
      const mat = new THREE.MeshBasicMaterial({
        map: pillarMap,
        color: col,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        fog: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = pillarH * 0.42;
      m.rotation.y = rotY;
      m.renderOrder = 994;
      m.frustumCulled = false;
      return m;
    };
    root.add(makeHalo(Math.PI / 4, 2.4, 0xffdd88));
    root.add(makeHalo(-Math.PI / 4, 2.4, 0xaaccff));

    // body aura flash sprites
    const aura = makeSprite(glowWhite, 0xffffff, 1, 3.2);
    aura.position.y = 1.1;
    root.add(aura);
    const auraGold = makeSprite(glowGold, 0xffcc55, 0.85, 4.0);
    auraGold.position.y = 1.0;
    root.add(auraGold);
    const auraBlue = makeSprite(glowBlue, 0x99ddff, 0.55, 3.6);
    auraBlue.position.y = 1.4;
    root.add(auraBlue);

    // ── rising spark particles (L2 stars) ──
    const sparks = [];
    const SPARK_N = 36;
    for (let i = 0; i < SPARK_N; i++) {
      const col = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? 0xffe066 : 0xaaddff);
      const sp = makeSprite(sparkMap, col, rand(0.55, 1), rand(0.22, 0.55));
      const ang = rand(0, Math.PI * 2);
      const rad = rand(0.15, 1.1);
      sp.userData = {
        ang: ang,
        rad: rad,
        y0: rand(0.05, 0.4),
        vy: rand(2.8, 6.5),
        spin: rand(-2.5, 2.5),
        delay: rand(0, 0.45),
        life: rand(0.9, 1.6),
        baseScale: sp.scale.x
      };
      sp.position.set(Math.cos(ang) * rad, sp.userData.y0, Math.sin(ang) * rad);
      sp.material.opacity = 0;
      root.add(sp);
      sparks.push(sp);
    }

    // spiral orbit sparks
    const orbit = [];
    for (let i = 0; i < 14; i++) {
      const sp = makeSprite(sparkMap, i % 2 ? 0xffee88 : 0xffffff, 0.9, 0.35);
      sp.userData = {
        phase: (i / 14) * Math.PI * 2,
        r: 0.55 + (i % 3) * 0.18,
        ySpeed: 1.8 + (i % 4) * 0.35,
        y0: 0.2
      };
      root.add(sp);
      orbit.push(sp);
    }

    // UI banner
    try { showLevelUpBanner(opts.level); } catch (e) { /* */ }

    const t0 = performance.now();
    let last = t0;

    const step = (now) => {
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const u = Math.min(1, elapsed / dur);
      follow();

      // ease envelopes
      const attack = Math.min(1, elapsed / 0.18); // quick flash-in
      const sustain = u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45;
      const fade = Math.max(0, sustain);

      // rings expand
      rings.forEach((ring) => {
        const local = Math.max(0, elapsed - ring.userData.delay);
        const ru = Math.min(1, local / 1.4);
        const ease = 1 - Math.pow(1 - ru, 2.2);
        const sz = ring.userData.baseSize * (0.2 + ease * 3.6);
        ring.scale.set(sz, sz, sz);
        ring.rotation.z = elapsed * 0.6;
        const op = ru < 0.15
          ? (ru / 0.15) * 0.95
          : 0.95 * (1 - Math.pow(Math.max(0, (ru - 0.15) / 0.85), 1.4));
        ring.material.opacity = op * fade;
      });

      floorGlow.scale.setScalar(1 + elapsed * 0.55);
      floorGlow.material.opacity = 0.7 * attack * fade * (1 - u * 0.5);
      floorGlow.rotation.z = -elapsed * 0.4;

      // pillar grow + fade
      const pillarScaleY = 0.35 + 0.65 * Math.min(1, elapsed / 0.35);
      const pillarOp = (elapsed < 0.25
        ? elapsed / 0.25
        : Math.max(0, 1 - Math.pow(Math.max(0, (elapsed - 0.9) / (dur - 0.9)), 1.2))) * 0.95;
      [pillarA, pillarB].forEach((p) => {
        p.scale.set(1 + Math.sin(elapsed * 8) * 0.04, pillarScaleY, 1);
        p.material.opacity = pillarOp * fade;
        p.rotation.y += dt * 0.35;
      });

      // body auras pulse
      const pulse = 1 + Math.sin(elapsed * 10) * 0.08;
      aura.scale.setScalar(2.4 * pulse * (0.7 + attack * 0.5));
      aura.material.opacity = 0.95 * attack * fade * (1 - u * 0.3);
      auraGold.scale.setScalar(3.6 * pulse);
      auraGold.material.opacity = 0.75 * attack * fade;
      auraBlue.scale.setScalar(3.2 + Math.sin(elapsed * 6) * 0.2);
      auraBlue.material.opacity = 0.5 * attack * fade;

      // rising sparks
      sparks.forEach((sp) => {
        const ud = sp.userData;
        const local = elapsed - ud.delay;
        if (local < 0) {
          sp.material.opacity = 0;
          return;
        }
        const lu = local / ud.life;
        if (lu > 1) {
          sp.material.opacity = 0;
          return;
        }
        ud.ang += ud.spin * dt;
        const r = ud.rad * (1 + lu * 0.35);
        sp.position.x = Math.cos(ud.ang) * r;
        sp.position.z = Math.sin(ud.ang) * r;
        sp.position.y = ud.y0 + ud.vy * local;
        const op = lu < 0.12 ? lu / 0.12 : (lu > 0.65 ? (1 - lu) / 0.35 : 1);
        sp.material.opacity = Math.max(0, op) * 0.95 * fade;
        const scs = ud.baseScale * (1 + lu * 0.6);
        sp.scale.set(scs, scs, 1);
      });

      // spiral orbit
      orbit.forEach((sp, i) => {
        const ud = sp.userData;
        const ang = ud.phase + elapsed * 3.2;
        const y = ud.y0 + (elapsed * ud.ySpeed) % 6.5;
        const r = ud.r * (1 + Math.sin(elapsed * 2 + i) * 0.08);
        sp.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
        sp.material.opacity = 0.85 * attack * fade * (y < 6 ? 1 : 0);
        const scs = 0.28 + Math.sin(elapsed * 5 + i) * 0.06;
        sp.scale.set(scs, scs, 1);
      });

      if (u < 1) {
        requestAnimationFrame(step);
      } else {
        disposeObj(root);
      }
    };
    requestAnimationFrame(step);
  }

  /**
   * Celestial Sun & Rune Mandala for Resurrection (NO crosses).
   * Concentric golden-azure circles, runic ticks, and delicate 12-star sunburst.
   */
  function texResurrectMandala() {
    return makeTex('resurrect_mandala_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s * 0.46;

      // Soft radiant center glow
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
      g.addColorStop(0.25, 'rgba(255, 220, 120, 0.45)');
      g.addColorStop(0.65, 'rgba(120, 220, 255, 0.18)');
      g.addColorStop(1, 'rgba(80, 180, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // Outer gold circle
      ctx.strokeStyle = 'rgba(255, 225, 130, 0.95)';
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
      ctx.stroke();

      // Second fine ring
      ctx.strokeStyle = 'rgba(160, 235, 255, 0.85)';
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.84, 0, Math.PI * 2);
      ctx.stroke();

      // Outer celestial nodes (24 golden sparks)
      ctx.fillStyle = 'rgba(255, 240, 180, 0.95)';
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const x = cx + Math.cos(a) * r * 0.89;
        const y = cy + Math.sin(a) * r * 0.89;
        ctx.beginPath();
        ctx.arc(x, y, s * (i % 2 === 0 ? 0.018 : 0.012), 0, Math.PI * 2);
        ctx.fill();
      }

      // 12-point delicate sun rays
      ctx.strokeStyle = 'rgba(255, 215, 110, 0.75)';
      ctx.lineWidth = s * 0.01;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.38, cy + Math.sin(a) * r * 0.38);
        ctx.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        ctx.stroke();
      }

      // Middle ring with 6 interwoven circular arcs
      ctx.strokeStyle = 'rgba(200, 245, 255, 0.65)';
      ctx.lineWidth = s * 0.012;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ox = cx + Math.cos(a) * r * 0.35;
        const oy = cy + Math.sin(a) * r * 0.35;
        ctx.beginPath();
        ctx.arc(ox, oy, r * 0.23, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Inner golden core ring
      ctx.strokeStyle = 'rgba(255, 255, 240, 0.95)';
      ctx.lineWidth = s * 0.016;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }, 256);
  }

  /**
   * Ascending Halo texture (soft glowing ring with feathered edges).
   */
  function texAscendingHalo() {
    return makeTex('resurrect_halo_v1', (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      const cx = s / 2, cy = s / 2, r = s * 0.40;
      ctx.strokeStyle = 'rgba(255, 240, 160, 0.95)';
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
      ctx.lineWidth = s * 0.035;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      const g = ctx.createRadialGradient(cx, cy, r * 0.65, cx, cy, r * 1.25);
      g.addColorStop(0, 'rgba(140, 225, 255, 0)');
      g.addColorStop(0.5, 'rgba(160, 235, 255, 0.45)');
      g.addColorStop(1, 'rgba(120, 200, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
      ctx.fill();
    }, 128);
  }

  function ensureResurrectCss() {
    if (document.getElementById('l2-resurrect-css')) return;
    const style = document.createElement('style');
    style.id = 'l2-resurrect-css';
    style.textContent = [
      '#l2-resurrect-banner{',
      'position:fixed;left:50%;top:20%;transform:translate(-50%,-50%) scale(0.7);',
      'z-index:12000;pointer-events:none;text-align:center;opacity:0;',
      'font-family:Georgia,"Times New Roman","Segoe UI",serif;letter-spacing:0.12em;',
      'color:#fff5cc;',
      'text-shadow:0 0 10px #ffe066,0 0 26px #ffbb33,0 2px 4px rgba(0,0,0,0.9),0 0 45px rgba(136,238,255,0.7);',
      'transition:opacity 0.2s ease-out,transform 0.4s cubic-bezier(0.18,1.3,0.3,1);',
      '}',
      '#l2-resurrect-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1);}',
      '#l2-resurrect-banner .l2res-title{font-size:38px;font-weight:700;line-height:1.15;letter-spacing:0.14em;}',
      '#l2-resurrect-banner .l2res-sub{font-size:20px;margin-top:8px;color:#e8f8ff;letter-spacing:0.1em;',
      'text-shadow:0 0 12px #88eeff,0 0 24px #ffdd77,0 2px 4px #000;}',
      '#l2-resurrect-banner.fade{opacity:0;transform:translate(-50%,-65%) scale(1.04);transition:opacity 0.6s ease,transform 0.6s ease;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function showResurrectBanner(title, subtitle) {
    ensureResurrectCss();
    let el = document.getElementById('l2-resurrect-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'l2-resurrect-banner';
      document.body.appendChild(el);
    }
    el.className = '';
    el.innerHTML = '<div class="l2res-title">' + (title || '✨ ВОЗРОЖДЕНИЕ ✨') + '</div>' +
      (subtitle ? '<div class="l2res-sub">' + subtitle + '</div>' : '');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 700);
    }, 2200);
  }

  /**
   * Refined Lineage 2 Classic Resurrection VFX (GM Blessed Resurrection).
   * Multi-layered sacred ground mandala + ascending celestial beam + 3 rising halos
   * + dual-helix star motes + awakening heart bloom (NO crosses).
   */
  function playResurrectionVFX(caster, target, opts) {
    opts = opts || {};
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !THREE) return;

    let tgtPos = null;
    let tgtMesh = null;
    if (target && target.mesh) {
      tgtMesh = target.mesh;
      tgtPos = feetPos(target);
    } else if (target && target.isVector3) {
      tgtPos = target.clone();
    } else if (opts.x != null && opts.z != null) {
      tgtPos = new THREE.Vector3(opts.x, opts.y != null ? opts.y : 0, opts.z);
    } else if (window.game && window.game.player && window.game.player.mesh) {
      tgtPos = feetPos(window.game.player);
      tgtMesh = window.game.player.mesh;
    }
    if (!tgtPos) return;

    const dur = opts.duration != null ? opts.duration : 3.0;
    const root = new THREE.Group();
    root.name = 'vfx_l2_resurrect';
    root.frustumCulled = false;
    root.position.copy(tgtPos);
    sc.add(root);

    const mandalaMap = texResurrectMandala();
    const haloMap = texAscendingHalo();
    const pillarMap = texPillar();
    const glowGold = texGlow(0xffd066, true);
    const glowCyan = texGlow(0x88eeff, true);
    const sparkMap = texSpark();

    // ── 1. Sacred Ground Mandala (dual rotating concentric rings) ──
    const mandalaOuter = groundDisc(mandalaMap, 3.8, 0xffffff, 0.95);
    mandalaOuter.position.y = 0.03;
    root.add(mandalaOuter);

    const mandalaInner = groundDisc(mandalaMap, 2.2, 0xaae8ff, 0.85);
    mandalaInner.position.y = 0.04;
    root.add(mandalaInner);

    const floorGlow = groundDisc(glowGold, 6.0, 0xffd060, 0.75);
    floorGlow.position.y = 0.02;
    root.add(floorGlow);

    // ── 2. Ascending Celestial Pillar (3 crossed billboard planes, 60 deg) ──
    const pillarH = 13.0;
    const makePillarPlane = (rotY, col, w, op) => {
      const geo = new THREE.PlaneGeometry(w || 1.6, pillarH);
      const mat = new THREE.MeshBasicMaterial({
        map: pillarMap,
        color: col || 0xffffff,
        transparent: true,
        opacity: op || 0.9,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        fog: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.y = pillarH * 0.46;
      m.rotation.y = rotY;
      m.renderOrder = 996;
      m.frustumCulled = false;
      return m;
    };
    const pPlanes = [
      makePillarPlane(0, 0xfff5cc, 1.6, 0.92),
      makePillarPlane(Math.PI / 3, 0xffe8a0, 1.6, 0.92),
      makePillarPlane((2 * Math.PI) / 3, 0x99eeff, 2.0, 0.65)
    ];
    pPlanes.forEach(p => root.add(p));

    // ── 3. Ascending Golden & Cyan Halos (3 smooth expansion rings) ──
    const halos = [];
    for (let i = 0; i < 3; i++) {
      const hDisc = groundDisc(haloMap, 1.2, i % 2 === 0 ? 0xffea88 : 0x88eeff, 0.9);
      hDisc.userData = {
        delay: i * 0.28,
        life: 1.6,
        baseR: 1.1 + i * 0.2
      };
      hDisc.scale.set(0.01, 0.01, 0.01);
      hDisc.material.opacity = 0;
      root.add(hDisc);
      halos.push(hDisc);
    }

    // ── 4. Dual-Helix Spiraling Starlight Motes ──
    const helix = [];
    const HELIX_N = 24;
    for (let i = 0; i < HELIX_N; i++) {
      const isGold = i % 2 === 0;
      const col = isGold ? 0xffe066 : 0x88eeff;
      const sp = makeSprite(sparkMap, col, 0.95, 0.32);
      sp.userData = {
        strand: isGold ? 0 : Math.PI,
        idx: i,
        r: 0.75 + (i % 3) * 0.12,
        speedY: 2.2 + (i % 4) * 0.25,
        speedRot: 3.5,
        y0: 0.1
      };
      root.add(sp);
      helix.push(sp);
    }

    // Ambient floating starlight motes
    const ambientSparks = [];
    for (let i = 0; i < 20; i++) {
      const col = i % 3 === 0 ? 0xffffff : (i % 3 === 1 ? 0xffdd77 : 0x99eeff);
      const sp = makeSprite(sparkMap, col, rand(0.6, 1.0), rand(0.2, 0.45));
      const ang = rand(0, Math.PI * 2);
      const rad = rand(0.2, 1.4);
      sp.userData = {
        ang: ang,
        rad: rad,
        y0: rand(0.05, 0.3),
        vy: rand(1.8, 4.2),
        spin: rand(-1.5, 1.5),
        delay: rand(0, 0.6),
        life: rand(1.2, 2.0),
        baseScale: sp.scale.x
      };
      sp.position.set(Math.cos(ang) * rad, sp.userData.y0, Math.sin(ang) * rad);
      sp.material.opacity = 0;
      root.add(sp);
      ambientSparks.push(sp);
    }

    // ── 5. Heart Awakening Bloom ──
    const heartBloom = makeSprite(glowGold, 0xffea88, 1.0, 3.8);
    heartBloom.position.y = 1.1;
    root.add(heartBloom);

    const heartCyan = makeSprite(glowCyan, 0x88eeff, 0.7, 4.4);
    heartCyan.position.y = 1.2;
    root.add(heartCyan);

    // ── 6. Audio chime & visual notification banner ──
    if (window.GameAudio && typeof window.GameAudio.play === 'function') {
      window.GameAudio.play('levelup', tgtPos);
    }
    const isLocal = !target || target === (window.game && window.game.player) || (opts.targetName && window.game && window.game.player && window.game.player.name === opts.targetName);
    if (isLocal || (caster && caster === (window.game && window.game.player))) {
      showResurrectBanner('✨ ВОЗРОЖДЕНИЕ ✨', opts.casterName ? ('Благословение от ' + opts.casterName) : 'Благословение GM');
    }

    // ── 7. Animation step loop ──
    const t0 = performance.now();
    let last = t0;

    const step = (now) => {
      const elapsed = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const u = Math.min(1, elapsed / dur);

      if (tgtMesh) {
        root.position.x = tgtMesh.position.x;
        root.position.y = tgtMesh.position.y;
        root.position.z = tgtMesh.position.z;
      }

      const attack = Math.min(1, elapsed / 0.22);
      const sustain = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
      const fade = Math.max(0, sustain);

      // Rotating Mandalas
      mandalaOuter.rotation.z = elapsed * 0.45;
      mandalaOuter.material.opacity = 0.95 * attack * fade;
      mandalaOuter.scale.setScalar(3.8 * (0.8 + 0.2 * attack));

      mandalaInner.rotation.z = -elapsed * 0.7;
      mandalaInner.material.opacity = 0.85 * attack * fade;

      floorGlow.rotation.z = -elapsed * 0.25;
      floorGlow.material.opacity = 0.75 * attack * fade;

      // Celestial Pillar
      const pillarScaleY = 0.4 + 0.6 * Math.min(1, elapsed / 0.4);
      const pillarOp = (elapsed < 0.3
        ? elapsed / 0.3
        : Math.max(0, 1 - Math.pow(Math.max(0, (elapsed - 1.0) / (dur - 1.0)), 1.3))) * 0.95;
      pPlanes.forEach((p, idx) => {
        p.scale.set(1 + Math.sin(elapsed * 6 + idx) * 0.05, pillarScaleY, 1);
        p.material.opacity = pillarOp * fade;
        p.rotation.y += dt * 0.25;
      });

      // Ascending Halos
      halos.forEach((h) => {
        const local = elapsed - h.userData.delay;
        if (local < 0 || local > h.userData.life) {
          h.material.opacity = 0;
          return;
        }
        const lu = local / h.userData.life;
        const easeY = 1 - Math.pow(1 - lu, 1.8);
        h.position.y = 0.05 + easeY * 2.5;
        const sz = h.userData.baseR * (0.6 + lu * 1.5);
        h.scale.set(sz, sz, sz);
        h.rotation.z = elapsed * 0.8;
        const op = lu < 0.15 ? (lu / 0.15) : (1 - (lu - 0.15) / 0.85);
        h.material.opacity = Math.max(0, op) * 0.95 * fade;
      });

      // Dual-Helix Spiraling Motes
      helix.forEach((sp) => {
        const ud = sp.userData;
        const ang = ud.strand + elapsed * ud.speedRot + ud.idx * 0.26;
        const y = ud.y0 + ((elapsed * ud.speedY + ud.idx * 0.25) % 5.5);
        sp.position.set(Math.cos(ang) * ud.r, y, Math.sin(ang) * ud.r);
        const yFade = y < 4.5 ? 1 : Math.max(0, 1 - (y - 4.5));
        sp.material.opacity = 0.9 * attack * fade * yFade;
        const sPulse = 0.3 + Math.sin(elapsed * 8 + ud.idx) * 0.06;
        sp.scale.set(sPulse, sPulse, 1);
      });

      // Ambient Twinkling Sparks
      ambientSparks.forEach((sp) => {
        const ud = sp.userData;
        const local = elapsed - ud.delay;
        if (local < 0 || local > ud.life) {
          sp.material.opacity = 0;
          return;
        }
        const lu = local / ud.life;
        ud.ang += ud.spin * dt;
        const r = ud.rad * (1 + lu * 0.4);
        sp.position.set(Math.cos(ud.ang) * r, ud.y0 + ud.vy * local, Math.sin(ud.ang) * r);
        const op = lu < 0.15 ? lu / 0.15 : (1 - lu);
        sp.material.opacity = Math.max(0, op) * 0.95 * fade;
      });

      // Heart Life Bloom
      const pulse = 1 + Math.sin(elapsed * 12) * 0.08;
      const bOp = Math.max(0, 1 - elapsed / 1.4);
      heartBloom.scale.setScalar(3.8 * pulse * (0.6 + attack * 0.4));
      heartBloom.material.opacity = 0.95 * attack * bOp * fade;
      heartCyan.scale.setScalar(4.2 * pulse);
      heartCyan.material.opacity = 0.7 * attack * bOp * fade;

      if (u < 1) {
        requestAnimationFrame(step);
      } else {
        disposeObj(root);
      }
    };
    requestAnimationFrame(step);
  }

  function ensureFlashCss() {
    if (document.getElementById('l2-flash-css')) return;
    const style = document.createElement('style');
    style.id = 'l2-flash-css';
    style.textContent = [
      '#l2-flash-banner{',
      'position:fixed;left:50%;top:18%;transform:translate(-50%,-50%) scale(0.7);',
      'z-index:12000;pointer-events:none;text-align:center;opacity:0;',
      'font-family:Impact,"Arial Black","Trebuchet MS",sans-serif;letter-spacing:0.16em;',
      'color:#fff5b8;',
      'text-shadow:0 0 12px #ffc800,0 0 28px #ff7700,0 2px 4px rgba(0,0,0,0.9),0 0 45px rgba(255,200,50,0.7);',
      'transition:opacity 0.2s ease-out,transform 0.35s cubic-bezier(0.18,1.3,0.3,1);',
      '}',
      '#l2-flash-banner.show{opacity:1;transform:translate(-50%,-50%) scale(1);}',
      '#l2-flash-banner .l2fl-title{font-size:38px;font-weight:900;line-height:1.15;letter-spacing:0.18em;text-transform:uppercase;}',
      '#l2-flash-banner .l2fl-sub{font-size:19px;margin-top:6px;color:#fff2d0;letter-spacing:0.08em;font-family:Georgia,serif;font-weight:bold;',
      'text-shadow:0 0 10px #ffbb00,0 0 20px #ff5500,0 2px 4px #000;}',
      '#l2-flash-banner.fade{opacity:0;transform:translate(-50%,-65%) scale(1.06);transition:opacity 0.5s ease,transform 0.5s ease;}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function showFlashBanner(title, subtitle) {
    ensureFlashCss();
    let el = document.getElementById('l2-flash-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'l2-flash-banner';
      document.body.appendChild(el);
    }
    el.className = '';
    el.innerHTML = '<div class="l2fl-title">' + (title || '⚡ SPEED FORCE ⚡') + '</div>' +
      (subtitle ? '<div class="l2fl-sub">' + subtitle + '</div>' : '');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(el._hideT);
    el._hideT = setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 600);
    }, 2000);
  }

  /**
   * The Flash activation / deactivation burst VFX.
   * Ground electrical shockwave + vertical Speed Force lightning strike + radial sparks.
   */
  function playFlashBurst(entity, opts) {
    opts = opts || {};
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !THREE) return;

    let tgtPos = null;
    let tgtMesh = null;
    if (entity && entity.mesh) {
      tgtMesh = entity.mesh;
      tgtPos = feetPos(entity);
    } else if (entity && entity.isVector3) {
      tgtPos = entity.clone();
    } else if (window.game && window.game.player && window.game.player.mesh) {
      tgtPos = feetPos(window.game.player);
      tgtMesh = window.game.player.mesh;
    }
    if (!tgtPos) return;

    const active = opts.active !== false;
    const speedMul = opts.speedMul || (active ? 3.5 : 1.0);
    const isLocal = !entity || entity === (window.game && window.game.player);

    if (isLocal) {
      if (active) {
        showFlashBanner('⚡ SPEED FORCE ⚡', 'Режим сверхскорости активирован (' + speedMul + 'x)');
      } else {
        showFlashBanner('⚡ СВЕРХСКОРОСТЬ ОТКЛЮЧЕНА ⚡', 'Скорость перемещения возвращена в норму');
      }
    }

    if (window.GameAudio && typeof window.GameAudio.play === 'function') {
      window.GameAudio.play(active ? 'aura_burst' : 'spell_cast', tgtPos);
    }

    const root = new THREE.Group();
    root.name = 'vfx_flash_burst';
    root.position.copy(tgtPos);
    sc.add(root);

    if (active) {
      const ringDisc = groundDisc(texSpeedForceRing(), 1.0, 0xffffff, 0.95);
      ringDisc.position.y = 0.03;
      root.add(ringDisc);

      const floorGlow = groundDisc(texGlow(0xffaa00, false), 3.2, 0xffaa00, 0.9);
      floorGlow.position.y = 0.02;
      root.add(floorGlow);

      const pillarH = 20.0;
      const geo = new THREE.PlaneGeometry(1.6, pillarH);
      const mat = new THREE.MeshBasicMaterial({
        map: texFlashLightning(),
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false
      });
      const boltMesh = new THREE.Mesh(geo, mat);
      boltMesh.position.y = pillarH * 0.48;
      boltMesh.renderOrder = 997;
      root.add(boltMesh);

      let pLight = null;
      if (typeof THREE.PointLight === 'function') {
        try {
          pLight = new THREE.PointLight(0xffb020, 3.5, 9.0);
          pLight.position.set(0, 1.2, 0);
          root.add(pLight);
        } catch (_) {}
      }

      const sparkMap = texSpark();
      const sparks = [];
      const sparkCount = 20;
      for (let i = 0; i < sparkCount; i++) {
        const ang = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const spSpd = 3.5 + Math.random() * 5.0;
        const sp = makeSprite(sparkMap, i % 2 === 0 ? 0xffea60 : 0xff8800, 0.95, 0.5 + Math.random() * 0.4);
        sp.position.set(0, 0.2 + Math.random() * 0.8, 0);
        sp.userData = {
          vx: Math.cos(ang) * spSpd,
          vy: 1.0 + Math.random() * 3.0,
          vz: Math.sin(ang) * spSpd,
          life: 0.35 + Math.random() * 0.25,
          age: 0
        };
        root.add(sp);
        sparks.push(sp);
      }

      // Radial golden needle spikes / starburst (Frame 00:01 in user video)
      const spikes = makeSprite(texFlashRadialBurst(), 0xffea33, 0.95, 1.2);
      spikes.position.set(0, 1.1, 0);
      root.add(spikes);

      const t0 = performance.now();
      const dur = 0.65;
      const step = (now) => {
        const elapsed = (now - t0) / 1000;
        const u = Math.min(1, elapsed / dur);

        if (tgtMesh) {
          root.position.x = tgtMesh.position.x;
          root.position.y = tgtMesh.position.y;
          root.position.z = tgtMesh.position.z;
        }

        const rScale = 1.0 + u * 6.5;
        ringDisc.scale.set(rScale, rScale, rScale);
        ringDisc.material.opacity = Math.max(0, 1 - u * 1.3) * 0.95;

        floorGlow.scale.set(1 + u * 2.2, 1 + u * 2.2, 1 + u * 2.2);
        floorGlow.material.opacity = Math.max(0, 1 - u * 2.0) * 0.9;

        // Needle spikes scale and fade (Frame 00:01)
        const sScale = 1.0 + u * 5.4;
        spikes.scale.set(sScale, sScale, 1);
        spikes.material.opacity = Math.max(0, 1 - u * 1.8) * 0.95;

        boltMesh.rotation.y = elapsed * 15.0;
        const boltFade = Math.max(0, 1 - elapsed / 0.26);
        boltMesh.material.opacity = boltFade * 0.95;

        if (pLight) {
          pLight.intensity = Math.max(0, 3.5 * (1 - elapsed / 0.45));
        }

        sparks.forEach(sp => {
          const ud = sp.userData;
          ud.age += 0.016;
          sp.position.x += ud.vx * 0.016;
          sp.position.y += ud.vy * 0.016;
          sp.position.z += ud.vz * 0.016;
          ud.vy -= 9.8 * 0.016;
          const sU = Math.min(1, ud.age / ud.life);
          sp.material.opacity = Math.max(0, 1 - sU) * 0.95;
        });

        if (u < 1) {
          requestAnimationFrame(step);
        } else {
          disposeObj(root);
        }
      };
      requestAnimationFrame(step);
    } else {
      // Deactivation: clean up idle aura and streamers
      if (entity && entity._flashIdleAura) {
        disposeObj(entity._flashIdleAura);
        entity._flashIdleAura = null;
      }
      if (entity && entity._flashStreamers) {
        disposeObj(entity._flashStreamers);
        entity._flashStreamers = null;
      }

      const sparkMap = texSpark();
      const sparks = [];
      const sparkCount = 12;
      for (let i = 0; i < sparkCount; i++) {
        const ang = (i / sparkCount) * Math.PI * 2;
        const dist = 1.6 + Math.random() * 0.8;
        const sp = makeSprite(sparkMap, 0xffbb20, 0.9, 0.4);
        sp.position.set(Math.cos(ang) * dist, 0.3 + Math.random() * 0.8, Math.sin(ang) * dist);
        sp.userData = {
          tx: 0, ty: 0.8, tz: 0,
          ox: sp.position.x, oy: sp.position.y, oz: sp.position.z
        };
        root.add(sp);
        sparks.push(sp);
      }

      const t0 = performance.now();
      const dur = 0.35;
      const step = (now) => {
        const elapsed = (now - t0) / 1000;
        const u = Math.min(1, elapsed / dur);
        sparks.forEach(sp => {
          const ud = sp.userData;
          sp.position.x = ud.ox + (ud.tx - ud.ox) * u;
          sp.position.y = ud.oy + (ud.ty - ud.oy) * u;
          sp.position.z = ud.oz + (ud.tz - ud.oz) * u;
          sp.material.opacity = Math.max(0, 1 - u) * 0.9;
        });
        if (u < 1) {
          requestAnimationFrame(step);
        } else {
          disposeObj(root);
        }
      };
      requestAnimationFrame(step);
    }
  }

  // ────────────────────────────────────────────────
  // SPEED FORCE GLSL SHADER MATERIALS & REALISTIC ELECTRICITY
  // ────────────────────────────────────────────────

  const SPEED_TRAIL_VERT = [
    'varying vec2 vUv;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  const SPEED_TRAIL_FRAG = [
    'uniform float uTime;',
    'uniform vec3 uColor;',
    'uniform vec3 uCoreColor;',
    'uniform float uOpacity;',
    'varying vec2 vUv;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '  // vUv.x: 0.0 at oldest tail, 1.0 at runner head',
    '  // vUv.y: 0.0 at bottom edge, 1.0 at top edge',
    '  float lengthFade = pow(clamp(vUv.x, 0.0, 1.0), 1.5);',
    '  // Smooth soft feathering on edges so ribbon never has harsh cutoffs',
    '  float lateral = sin(clamp(vUv.y, 0.0, 1.0) * 3.14159265);',
    '  float lateralFade = pow(lateral, 1.6);',
    '  // Multi-strand electric filament veins (3-4 undulating lightning strands)',
    '  float v1 = pow(clamp(1.0 - abs(sin(vUv.y * 9.42 + sin(vUv.x * 6.0 - uTime * 18.0) * 1.6)), 0.0, 1.0), 4.5);',
    '  float v2 = pow(clamp(1.0 - abs(sin(vUv.y * 18.84 - uTime * 28.0 + vUv.x * 12.0)), 0.0, 1.0), 5.0);',
    '  float v3 = pow(clamp(1.0 - abs(sin(vUv.y * 4.71 + uTime * 14.0 - vUv.x * 8.0)), 0.0, 1.0), 3.8);',
    '  float filaments = v1 * 0.85 + v2 * 0.6 + v3 * 0.45;',
    '  // Light, airy, translucent background energy haze (only 18% opacity, completely see-through)',
    '  float energyHaze = lateralFade * 0.18;',
    '  // High-speed pulse traveling down the wake',
    '  float pulse = sin(vUv.x * 16.0 - uTime * 26.0) * 0.5 + 0.5;',
    '  pulse = pow(pulse, 2.5);',
    '  float totalEnergy = filaments * (0.65 + pulse * 0.55) + energyHaze;',
    '  // Color blending: rich amber-gold on haze, crisp white-hot on thin filaments',
    '  vec3 col = mix(uColor, uCoreColor, clamp(filaments * 0.8 + pow(vUv.x, 2.5) * 0.35, 0.0, 1.0));',
    '  float alpha = lengthFade * lateralFade * totalEnergy * uOpacity;',
    '  if (alpha < 0.003) discard;',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));',
    '}'
  ].join('\n');

  const ELECTRIC_BOLT_VERT = [
    'varying vec2 vUv;',
    'varying vec3 vWorldPos;',
    'void main() {',
    '  vUv = uv;',
    '  vec4 wp = modelMatrix * vec4(position, 1.0);',
    '  vWorldPos = wp.xyz;',
    '  gl_Position = projectionMatrix * viewMatrix * wp;',
    '}'
  ].join('\n');

  const ELECTRIC_BOLT_FRAG = [
    'uniform float uTime;',
    'uniform vec3 uColor;',
    'uniform vec3 uCoreColor;',
    'uniform float uOpacity;',
    'uniform float uSeed;',
    'varying vec2 vUv;',
    'void main() {',
    '  float dist = abs(vUv.y - 0.5) * 2.0;',
    '  float noise = sin(vUv.x * 42.0 + uTime * 64.0 + uSeed * 17.0) * 0.16;',
    '  float d = abs(dist + noise);',
    '  float core = exp(-d * 16.0);',
    '  float glow = exp(-d * 3.6);',
    '  float endTaper = sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265);',
    '  endTaper = pow(clamp(endTaper, 0.0, 1.0), 0.45);',
    '  vec3 col = uColor * glow * 1.6 + uCoreColor * core * 2.0;',
    '  float alpha = endTaper * (glow * 0.65 + core * 0.95) * uOpacity;',
    '  if (alpha < 0.005) discard;',
    '  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));',
    '}'
  ].join('\n');

  function createBoltShaderMat(THREE, colHex, coreHex) {
    return new THREE.ShaderMaterial({
      vertexShader: ELECTRIC_BOLT_VERT,
      fragmentShader: ELECTRIC_BOLT_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(colHex || 0xffb020) },
        uCoreColor: { value: new THREE.Color(coreHex || 0xffffff) },
        uOpacity: { value: 0.95 },
        uSeed: { value: Math.random() }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  function createTrailShaderMat(THREE, colHex, coreHex, baseOpacity) {
    return new THREE.ShaderMaterial({
      vertexShader: SPEED_TRAIL_VERT,
      fragmentShader: SPEED_TRAIL_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(colHex || 0xffaa15) },
        uCoreColor: { value: new THREE.Color(coreHex || 0xffeedd) },
        uOpacity: { value: baseOpacity != null ? baseOpacity : 0.48 }
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending
    });
  }

  /**
   * Generates jagged fractal 3D lightning points between A and B.
   */
  function generateLightningPoints(A, B, segments, jitter, curveCenter) {
    const THREE = window.THREE;
    const pts = [A.clone()];
    const delta = new THREE.Vector3().subVectors(B, A);
    const totalLen = Math.max(0.01, delta.length());
    const dir = delta.clone().normalize();

    let perp1 = new THREE.Vector3(0, 1, 0).cross(dir);
    if (perp1.lengthSq() < 0.01) perp1 = new THREE.Vector3(1, 0, 0).cross(dir);
    perp1.normalize();
    const perp2 = new THREE.Vector3().crossVectors(dir, perp1).normalize();

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const p = new THREE.Vector3().lerpVectors(A, B, t);
      const env = Math.sin(t * Math.PI);
      const j1 = (Math.random() - 0.5) * 2.0 * jitter * env;
      const j2 = (Math.random() - 0.5) * 2.0 * jitter * env;

      p.addScaledVector(perp1, j1);
      p.addScaledVector(perp2, j2);

      if (curveCenter) {
        const outward = new THREE.Vector3(p.x - curveCenter.x, 0, p.z - curveCenter.z);
        if (outward.lengthSq() > 0.001) {
          outward.normalize();
          p.addScaledVector(outward, 0.14 * env);
        }
      }
      pts.push(p);
    }
    pts.push(B.clone());
    return pts;
  }

  /**
   * Builds or updates a cross-plane quad strip for a jagged 3D electric arc.
   */
  function updateArcGeometry(geo, pts, halfWidth) {
    const THREE = window.THREE;
    const M = pts.length;
    if (M < 2) return;

    const vCount = M * 4;
    let posAttr = geo.getAttribute('position');
    let uvAttr = geo.getAttribute('uv');
    let indexAttr = geo.getIndex();

    if (!posAttr || posAttr.count !== vCount) {
      const posArr = new Float32Array(vCount * 3);
      const uvArr = new Float32Array(vCount * 2);
      const idxArr = new Uint16Array((M - 1) * 12);

      for (let i = 0; i < M; i++) {
        const u = i / (M - 1);
        const i4 = i * 4;
        uvArr[i4 * 2 + 0] = u; uvArr[i4 * 2 + 1] = 0.0;
        uvArr[(i4 + 1) * 2 + 0] = u; uvArr[(i4 + 1) * 2 + 1] = 1.0;
        uvArr[(i4 + 2) * 2 + 0] = u; uvArr[(i4 + 2) * 2 + 1] = 0.0;
        uvArr[(i4 + 3) * 2 + 0] = u; uvArr[(i4 + 3) * 2 + 1] = 1.0;
      }

      let idx = 0;
      for (let i = 0; i < M - 1; i++) {
        const a = i * 4;
        const b = (i + 1) * 4;
        // Plane 1 (horizontal / lateral)
        idxArr[idx++] = a + 0; idxArr[idx++] = a + 1; idxArr[idx++] = b + 0;
        idxArr[idx++] = a + 1; idxArr[idx++] = b + 1; idxArr[idx++] = b + 0;
        // Plane 2 (vertical / up)
        idxArr[idx++] = a + 2; idxArr[idx++] = a + 3; idxArr[idx++] = b + 2;
        idxArr[idx++] = a + 3; idxArr[idx++] = b + 3; idxArr[idx++] = b + 2;
      }

      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
      posAttr = geo.getAttribute('position');
    }

    const pos = posAttr.array;
    for (let i = 0; i < M; i++) {
      let tDir;
      if (i === 0) tDir = new THREE.Vector3().subVectors(pts[1], pts[0]);
      else if (i === M - 1) tDir = new THREE.Vector3().subVectors(pts[M - 1], pts[M - 2]);
      else tDir = new THREE.Vector3().subVectors(pts[i + 1], pts[i - 1]);
      tDir.normalize();

      let side = new THREE.Vector3(0, 1, 0).cross(tDir);
      if (side.lengthSq() < 0.01) side = new THREE.Vector3(1, 0, 0).cross(tDir);
      side.normalize().multiplyScalar(halfWidth);

      const up = new THREE.Vector3().crossVectors(tDir, side).normalize().multiplyScalar(halfWidth);
      const P = pts[i];
      const i4 = i * 4;

      // Plane 1
      pos[(i4 + 0) * 3 + 0] = P.x - side.x; pos[(i4 + 0) * 3 + 1] = P.y - side.y; pos[(i4 + 0) * 3 + 2] = P.z - side.z;
      pos[(i4 + 1) * 3 + 0] = P.x + side.x; pos[(i4 + 1) * 3 + 1] = P.y + side.y; pos[(i4 + 1) * 3 + 2] = P.z + side.z;
      // Plane 2
      pos[(i4 + 2) * 3 + 0] = P.x - up.x; pos[(i4 + 2) * 3 + 1] = P.y - up.y; pos[(i4 + 2) * 3 + 2] = P.z - up.z;
      pos[(i4 + 3) * 3 + 0] = P.x + up.x; pos[(i4 + 3) * 3 + 1] = P.y + up.y; pos[(i4 + 3) * 3 + 2] = P.z + up.z;
    }
    posAttr.needsUpdate = true;
  }

  /**
   * Initializes master Speed Force VFX bundle for an entity (Player or remote GM).
   * - Idle: Dynamic body electric discharges snapping across limbs/torso + floating ozone sparks.
   * - Sprint: Dynamic 3D world-space ribbon trail + air electric discharges left in the wake.
   */
  function ensureFlashFX(entity) {
    if (entity._flashFx) return entity._flashFx;
    const THREE = window.THREE;
    const sc = scene();
    if (!THREE || !sc) return null;

    // ── 1. IDLE BODY ELECTRIC ARCS ──
    const idleGroup = new THREE.Group();
    idleGroup.name = 'flash_idle_body_arcs';

    const bodyArcCount = 5;
    const bodyArcs = [];
    for (let i = 0; i < bodyArcCount; i++) {
      const geo = new THREE.BufferGeometry();
      const mat = createBoltShaderMat(THREE, i % 2 === 0 ? 0xffbb18 : 0xffea38, 0xffffff);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 998;
      mesh.frustumCulled = false;
      idleGroup.add(mesh);
      bodyArcs.push({
        mesh,
        geo,
        mat,
        timer: Math.random() * 0.08,
        duration: 0.07 + Math.random() * 0.06
      });
    }

    // Subtle crackling electric ground contact patch (delicate, low opacity)
    const groundSparksDisc = groundDisc(texSpeedForceRing(), 0.85, 0xffbb20, 0.45);
    groundSparksDisc.position.y = 0.03;
    idleGroup.add(groundSparksDisc);

    // Attach idle group directly to entity mesh so it moves with character
    entity.mesh.add(idleGroup);

    // ── 2. SPRINT WORLD-SPACE RIBBON TRAILS & AIR DISCHARGES ──
    const streamersGroup = new THREE.Group();
    streamersGroup.name = 'flash_streamers_group';

    const TRAIL_NODES = 32;
    const createRibbonMesh = (opacity, col, coreCol) => {
      const geo = new THREE.BufferGeometry();
      const mat = createTrailShaderMat(THREE, col || 0xffb015, coreCol || 0xffeedd, opacity);
      const posArr = new Float32Array(TRAIL_NODES * 2 * 3);
      const uvArr = new Float32Array(TRAIL_NODES * 2 * 2);
      const idxArr = new Uint16Array((TRAIL_NODES - 1) * 6);

      for (let i = 0; i < TRAIL_NODES; i++) {
        const u = i / (TRAIL_NODES - 1);
        uvArr[i * 4 + 0] = u; uvArr[i * 4 + 1] = 0.0;
        uvArr[i * 4 + 2] = u; uvArr[i * 4 + 3] = 1.0;
      }
      let idx = 0;
      for (let i = 0; i < TRAIL_NODES - 1; i++) {
        const a = i * 2;
        const b = (i + 1) * 2;
        idxArr[idx++] = a + 0; idxArr[idx++] = a + 1; idxArr[idx++] = b + 0;
        idxArr[idx++] = a + 1; idxArr[idx++] = b + 1; idxArr[idx++] = b + 0;
      }
      geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
      geo.setIndex(new THREE.BufferAttribute(idxArr, 1));

      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 996;
      mesh.frustumCulled = false;
      return { mesh, geo, mat };
    };

    // 3 layered ribbons: ground skimming wide carpet + left & right flaring slipstream wings
    const groundRibbon = createRibbonMesh(0.35, 0xffa510, 0xffeedd);
    const leftRibbon = createRibbonMesh(0.48, 0xffbb18, 0xffffff);
    const rightRibbon = createRibbonMesh(0.48, 0xffbb18, 0xffffff);
    streamersGroup.add(groundRibbon.mesh);
    streamersGroup.add(leftRibbon.mesh);
    streamersGroup.add(rightRibbon.mesh);

    // Pool of 8 air lightning discharges left in the wake
    const airDischarges = [];
    const airPoolSize = 8;
    for (let i = 0; i < airPoolSize; i++) {
      const geo = new THREE.BufferGeometry();
      const mat = createBoltShaderMat(THREE, 0xffc020, 0xffffff);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.renderOrder = 997;
      mesh.frustumCulled = false;
      streamersGroup.add(mesh);
      airDischarges.push({
        mesh,
        geo,
        mat,
        active: false,
        age: 0,
        life: 0.22
      });
    }

    sc.add(streamersGroup);

    const fx = {
      idleGroup,
      streamersGroup,
      bodyArcs,
      groundSparksDisc,
      groundRibbon,
      leftRibbon,
      rightRibbon,
      airDischarges,
      history: [],
      airBoltTimer: 0,
      sparkTimer: 0,
      lastPos: entity.mesh.position.clone()
    };

    entity._flashFx = fx;
    entity._flashIdleAura = idleGroup;
  }

  function ensureFlashIdleAura(entity) {
    const fx = ensureFlashFX(entity);
    return fx ? fx.idleGroup : null;
  }

  function ensureFlashStreamers(entity) {
    const fx = ensureFlashFX(entity);
    return fx ? fx.streamersGroup : null;
  }

  /**
   * Continuous Speed Force running and idle shader VFX:
   * - Idle: Dynamic body electric arcs snapping between limbs & ground + ozone sparks.
   * - Running: World-space ribbon trails curving with motion + snapping air lightning discharges.
   */
  function updateFlashRunEffects(entity, delta) {
    if (!entity || !entity.mesh) return;
    const sc = scene();
    const THREE = window.THREE;
    if (!sc || !THREE) return;

    const active = !!(entity.gmSpeedMul && entity.gmSpeedMul > 1);
    if (!active) {
      if (entity._flashFx) {
        disposeObj(entity._flashFx.idleGroup);
        disposeObj(entity._flashFx.streamersGroup);
        if (entity._flashFx.bodyArcs) {
          entity._flashFx.bodyArcs.forEach(a => {
            if (a.geo) a.geo.dispose();
            if (a.mat) a.mat.dispose();
          });
        }
        if (entity._flashFx.groundRibbon) {
          entity._flashFx.groundRibbon.geo.dispose();
          entity._flashFx.groundRibbon.mat.dispose();
        }
        if (entity._flashFx.leftRibbon) {
          entity._flashFx.leftRibbon.geo.dispose();
          entity._flashFx.leftRibbon.mat.dispose();
        }
        if (entity._flashFx.rightRibbon) {
          entity._flashFx.rightRibbon.geo.dispose();
          entity._flashFx.rightRibbon.mat.dispose();
        }
        if (entity._flashFx.airDischarges) {
          entity._flashFx.airDischarges.forEach(d => {
            if (d.geo) d.geo.dispose();
            if (d.mat) d.mat.dispose();
          });
        }
        entity._flashFx = null;
      }
      entity._flashIdleAura = null;
      entity._flashStreamers = null;
      return;
    }

    const fx = ensureFlashFX(entity);
    if (!fx) return;

    const moving = !!entity.isMoving;
    const ePos = entity.mesh.position;
    const time = performance.now() * 0.001;

    // ─────────────────────────────────────────────
    // 1. IDLE STATE: Body Electric Discharges
    // ─────────────────────────────────────────────
    if (!moving) {
      fx.idleGroup.visible = true;
      fx.groundSparksDisc.rotation.z += delta * 1.6;
      fx.groundSparksDisc.material.opacity = 0.35 + Math.sin(time * 18.0) * 0.15;

      // Available anatomical body anchors on character
      const anchors = [
        new THREE.Vector3(0, 1.60, 0),                            // Head / Neck
        new THREE.Vector3(0, 1.15, 0),                            // Chest
        new THREE.Vector3(-0.35, 1.28, 0.05),                     // Left Shoulder
        new THREE.Vector3(0.35, 1.28, 0.05),                      // Right Shoulder
        new THREE.Vector3(-0.44, 0.88, 0.1),                      // Left Hand
        new THREE.Vector3(0.44, 0.88, 0.1),                       // Right Hand
        new THREE.Vector3(0, 0.72, 0),                             // Waist / Pelvis
        new THREE.Vector3(-0.24, 0.42, 0.05),                     // Left Knee
        new THREE.Vector3(0.24, 0.42, 0.05),                      // Right Knee
        new THREE.Vector3(-0.24, 0.04, 0.02),                     // Left Foot
        new THREE.Vector3(0.24, 0.04, 0.02),                      // Right Foot
        new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.02, (Math.random() - 0.5) * 0.5) // Ground contact
      ];

      const curveCenter = new THREE.Vector3(0, 0.9, 0);

      fx.bodyArcs.forEach(arc => {
        arc.timer += delta;
        arc.mat.uniforms.uTime.value = time;
        // High-frequency electric flicker
        arc.mat.uniforms.uOpacity.value = 0.75 + Math.random() * 0.25;

        if (arc.timer >= arc.duration) {
          arc.timer = 0;
          arc.duration = 0.06 + Math.random() * 0.07;
          arc.mat.uniforms.uSeed.value = Math.random();

          // Pick two distinct anchors
          const idxA = Math.floor(Math.random() * anchors.length);
          let idxB = Math.floor(Math.random() * anchors.length);
          if (idxA === idxB) idxB = (idxA + 1) % anchors.length;

          const pA = anchors[idxA].clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12
          ));
          const pB = anchors[idxB].clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.12
          ));

          const pts = generateLightningPoints(pA, pB, 5, 0.16, curveCenter);
          updateArcGeometry(arc.geo, pts, 0.038);
        }
      });

      // When stationary, running trail and air discharges MUST vanish INSTANTLY
      if (fx.streamersGroup.visible) {
        fx.streamersGroup.visible = false;
      }
      if (fx.history.length > 0) {
        fx.history.length = 0;
      }
      fx.runAlpha = 0;
      fx.airDischarges.forEach(d => {
        d.active = false;
        d.mesh.visible = false;
      });
      fx.lastPos.copy(ePos);
    } else {
      // ─────────────────────────────────────────────
      // 2. RUNNING STATE: World Ribbon Trail & Air Discharges
      // ─────────────────────────────────────────────
      // Smooth fade-in on run start: avoids sudden pop/flash
      fx.runAlpha = Math.min(1.0, (fx.runAlpha || 0) + delta * 3.5);

      // Sample world position for trail history
      const nowPos = ePos.clone();
      const movedDist = nowPos.distanceTo(fx.lastPos);
      if (movedDist > 0.12 || fx.history.length === 0) {
        // Compute movement direction & lateral vector
        let moveDir = new THREE.Vector3().subVectors(nowPos, fx.lastPos);
        if (moveDir.lengthSq() < 0.001) {
          const facing = entity.facing != null ? entity.facing : 0;
          moveDir.set(Math.cos(facing), 0, Math.sin(facing));
        }
        moveDir.y = 0;
        moveDir.normalize();

        const lateral = new THREE.Vector3(-moveDir.z, 0, moveDir.x).normalize();

        fx.history.push({
          pos: nowPos,
          lateral: lateral,
          time: time
        });
        fx.lastPos.copy(nowPos);

        const MAX_NODES = 32;
        while (fx.history.length > MAX_NODES) {
          fx.history.shift();
        }
      }

      const hist = fx.history;
      const count = hist.length;

      // Keep streamers hidden until at least 3 points exist to prevent single-frame geometric blinks
      if (count < 3) {
        fx.streamersGroup.visible = false;
      } else {
        fx.idleGroup.visible = false;
        fx.streamersGroup.visible = true;

        // Smooth growth factor: trail smoothly lengthens and blossoms out in width as points accumulate
        const growth = Math.min(1.0, count / 16.0);
        const currentFade = fx.runAlpha * growth;

        // Update Ground, Left, and Right Trail Ribbons
        const leftPosArr = fx.leftRibbon.geo.attributes.position.array;
        const rightPosArr = fx.rightRibbon.geo.attributes.position.array;
        const groundPosArr = fx.groundRibbon ? fx.groundRibbon.geo.attributes.position.array : null;

        for (let i = 0; i < 32; i++) {
          const histIdx = Math.min(count - 1, Math.floor((i / 31) * (count - 1)));
          const node = hist[histIdx];
          const P = node.pos;
          const lat = node.lateral;
          const uNode = i / 31.0; // 0 at oldest tail, 1 at runner head

          // Wide wake expansion scaled by growth factor: starts near runner and expands smoothly
          const wakeExpansion = 0.55 + (1.0 - uNode) * (1.0 * growth);

          // 1. Ground-skimming wide sheer energy carpet
          if (groundPosArr) {
            const gy = P.y + 0.08 + Math.sin(uNode * 6.0 - time * 10.0) * 0.03;
            groundPosArr[i * 6 + 0] = P.x + lat.x * wakeExpansion;
            groundPosArr[i * 6 + 1] = gy;
            groundPosArr[i * 6 + 2] = P.z + lat.z * wakeExpansion;

            groundPosArr[i * 6 + 3] = P.x - lat.x * wakeExpansion;
            groundPosArr[i * 6 + 4] = gy;
            groundPosArr[i * 6 + 5] = P.z - lat.z * wakeExpansion;
          }

          // 2. Left flaring energetic wing ribbon (tilted outwards)
          const lOuterX = P.x + lat.x * (wakeExpansion * 0.92);
          const lOuterZ = P.z + lat.z * (wakeExpansion * 0.92);
          const lInnerX = P.x + lat.x * (wakeExpansion * 0.22);
          const lInnerZ = P.z + lat.z * (wakeExpansion * 0.22);

          leftPosArr[i * 6 + 0] = lOuterX;
          leftPosArr[i * 6 + 1] = P.y + 0.92;
          leftPosArr[i * 6 + 2] = lOuterZ;

          leftPosArr[i * 6 + 3] = lInnerX;
          leftPosArr[i * 6 + 4] = P.y + 0.18;
          leftPosArr[i * 6 + 5] = lInnerZ;

          // 3. Right flaring energetic wing ribbon (tilted outwards)
          const rOuterX = P.x - lat.x * (wakeExpansion * 0.92);
          const rOuterZ = P.z - lat.z * (wakeExpansion * 0.92);
          const rInnerX = P.x - lat.x * (wakeExpansion * 0.22);
          const rInnerZ = P.z - lat.z * (wakeExpansion * 0.22);

          rightPosArr[i * 6 + 0] = rOuterX;
          rightPosArr[i * 6 + 1] = P.y + 0.92;
          rightPosArr[i * 6 + 2] = rOuterZ;

          rightPosArr[i * 6 + 3] = rInnerX;
          rightPosArr[i * 6 + 4] = P.y + 0.18;
          rightPosArr[i * 6 + 5] = rInnerZ;
        }

        fx.leftRibbon.geo.attributes.position.needsUpdate = true;
        fx.rightRibbon.geo.attributes.position.needsUpdate = true;
        if (fx.groundRibbon) fx.groundRibbon.geo.attributes.position.needsUpdate = true;

        fx.leftRibbon.mat.uniforms.uOpacity.value = 0.48 * currentFade;
        fx.rightRibbon.mat.uniforms.uOpacity.value = 0.48 * currentFade;
        if (fx.groundRibbon) fx.groundRibbon.mat.uniforms.uOpacity.value = 0.35 * currentFade;

        fx.leftRibbon.mat.uniforms.uTime.value = time;
        fx.rightRibbon.mat.uniforms.uTime.value = time;
        if (fx.groundRibbon) fx.groundRibbon.mat.uniforms.uTime.value = time;
      }

      // ─────────────────────────────────────────────
      // 3. AIR LIGHTNING DISCHARGES IN THE RUNNER'S WAKE
      // ─────────────────────────────────────────────
      fx.airBoltTimer += delta;
      if (fx.airBoltTimer >= 0.055 && count >= 8 && fx.runAlpha > 0.5) {
        fx.airBoltTimer = 0;

        // Find available slot in air discharges pool
        const slot = fx.airDischarges.find(d => !d.active);
        if (slot) {
          slot.active = true;
          slot.age = 0;
          slot.life = 0.20 + Math.random() * 0.08;
          slot.mesh.visible = true;
          slot.mat.uniforms.uSeed.value = Math.random();

          // Pick two positions across the wide wake of the runner
          const idx1 = Math.max(0, count - 1 - Math.floor(Math.random() * 3));
          const idx2 = Math.max(0, idx1 - 2 - Math.floor(Math.random() * 5));

          const base1 = hist[idx1].pos;
          const base2 = hist[idx2].pos;

          const pA = new THREE.Vector3(
            base1.x + (Math.random() - 0.5) * 2.2,
            base1.y + 0.25 + Math.random() * 1.1,
            base1.z + (Math.random() - 0.5) * 2.2
          );
          const pB = new THREE.Vector3(
            base2.x + (Math.random() - 0.5) * 2.4,
            base2.y + 0.20 + Math.random() * 1.3,
            base2.z + (Math.random() - 0.5) * 2.4
          );

          const pts = generateLightningPoints(pA, pB, 5, 0.26);
          updateArcGeometry(slot.geo, pts, 0.045);
        }
      }

      // Animate active air lightning discharges
      fx.airDischarges.forEach(slot => {
        if (!slot.active) return;
        slot.age += delta;
        const u = slot.age / slot.life;
        if (u >= 1.0) {
          slot.active = false;
          slot.mesh.visible = false;
        } else {
          slot.mat.uniforms.uTime.value = time;
          // Intense micro-flicker as lightning dissipates
          slot.mat.uniforms.uOpacity.value = (1.0 - u) * (0.65 + Math.random() * 0.35);
        }
      });

      // Ionized floating ozone sparks in the wake
      fx.sparkTimer += delta;
      if (fx.sparkTimer >= 0.03) {
        fx.sparkTimer = 0;
        const sp = makeSprite(texSpark(), Math.random() > 0.4 ? 0xffea33 : 0xffa015, 0.95, 0.25 + Math.random() * 0.2);
        sp.position.set(
          ePos.x + (Math.random() - 0.5) * 0.5,
          ePos.y + 0.15 + Math.random() * 0.9,
          ePos.z + (Math.random() - 0.5) * 0.5
        );
        sc.add(sp);

        const spSpawn = performance.now();
        const spDur = 0.24;
        const vx = (Math.random() - 0.5) * 0.8;
        const vy = 0.2 + Math.random() * 0.6;
        const vz = (Math.random() - 0.5) * 0.8;
        const animSp = (now) => {
          const age = (now - spSpawn) / 1000;
          const u = Math.min(1, age / spDur);
          sp.position.x += vx * 0.016;
          sp.position.y += vy * 0.016;
          sp.position.z += vz * 0.016;
          sp.material.opacity = Math.max(0, (1 - u) * 0.95);
          if (u < 1) requestAnimationFrame(animSp);
          else disposeObj(sp);
        };
        requestAnimationFrame(animSp);
      }
    }
  }

  // ════════════════════════════════════════════════
  // PUBLIC API
  // ════════════════════════════════════════════════
  const SkillVFX = {
    _cast: null,

    startCast(skillId, caster, target) {
      this.stopCast(true);
      if (!skillId || !caster || !caster.mesh) return;
      if (!window.THREE || !scene()) {
        console.warn('[SkillVFX] no THREE/scene');
        return;
      }
      const id = String(skillId).toLowerCase();
      let theme = null;
      if (id === 'eng_pressure_bolt' || id.indexOf('pressure_bolt') >= 0) theme = 'pressure';
      else if (id === 'eng_self_repair' || id.indexOf('self_repair') >= 0) theme = 'heal';
      // future heals: eng_field_repair, eng_battle_repair, etc.
      else if (id.indexOf('repair') >= 0 || id.indexOf('_heal') >= 0) theme = 'heal';

      if (!theme) return;

      try {
        if (theme === 'pressure') {
          texCastCircle('pressure');
          texGlow(0x88ccee, true);
          texSteam();
          texSpark();
          texBolt();
        } else {
          texCastCircle('heal');
          texGlow(0x55dd77, true);
          texHealCross();
          texSteam();
        }
        this._cast = new CastFx(id, caster, target, theme);
        if (!this._cast.alive) {
          console.warn('[SkillVFX] cast not alive');
          this._cast = null;
        }
      } catch (e) {
        console.warn('[SkillVFX] startCast failed', e);
        this._cast = null;
      }
    },

    updateCast(progress) {
      if (this._cast && this._cast.alive) this._cast.update(progress);
    },

    stopCast(cancel) {
      if (this._cast) {
        try { this._cast.stop(!!cancel); } catch (e) { /* */ }
        this._cast = null;
      }
    },

    playSkill(skillId, caster, target, opts) {
      opts = opts || {};
      this.stopCast(false);
      const id = String(skillId || '').toLowerCase();
      if (id === 'eng_pressure_bolt' || id.indexOf('pressure_bolt') >= 0) {
        this.playPressureBolt(caster, target, opts);
        return;
      }
      if (id === 'eng_self_repair' || id.indexOf('self_repair') >= 0 || id === 'self_repair') {
        this.playSelfRepair(caster || target, opts);
        return;
      }
      if (id.indexOf('repair') >= 0 || id.indexOf('_heal') >= 0) {
        this.playSelfRepair(target || caster, opts);
        return;
      }
      // Italian brainrot meme skills — flashy visible FX
      if (id.indexOf('br_skibidi') >= 0 || id.indexOf('skibidi') >= 0) {
        this.playMemeBurst(caster, target, 0x44ff88, 'skibidi');
        return;
      }
      if (id.indexOf('br_tralala') >= 0 || id.indexOf('tralala') >= 0) {
        this.playMemeBurst(caster, target, 0xff44aa, 'tralala');
        return;
      }
      if (id.indexOf('br_bombardiro') >= 0 || id.indexOf('bombardiro') >= 0) {
        this.playMemeBurst(caster, target, 0xff6622, 'bombardiro');
        return;
      }
      if (id.indexOf('br_tung') >= 0 || id.indexOf('tung_suction') >= 0) {
        this.playMemeBurst(caster, target, 0x8844ff, 'tung');
        return;
      }
      if (id.indexOf('br_cappuccino') >= 0 || id.indexOf('cappuccino') >= 0) {
        this.playMemeBurst(caster, target, 0xffd700, 'cappuccino');
        return;
      }
      if (id === 'gm_oneshot' || id.indexOf('oneshot') >= 0) {
        this.playMemeBurst(caster, target, 0xffd700, 'cappuccino');
        return;
      }
      if (id === 'gm_resurrect' || id.indexOf('resurrect') >= 0 || id.indexOf('возрожд') >= 0) {
        this.playResurrectionVFX(caster, target, opts);
        return;
      }
      if (id === 'gm_flash' || id === 'gm_speed' || id.indexOf('flash') >= 0 || id.indexOf('флэш') >= 0) {
        this.playFlashBurst(caster || target, opts);
        return;
      }
      // Mob-db skill catalog — unique light VFX per skill
      if (this.playMobSkill(id, caster, target, opts)) return;

      // generic fallback flash & physical combat strikes (power_strike, mortal_blow, smash, bash, etc.)
      const ent = target || caster;
      const eMesh = entityMesh(ent);
      if (eMesh) {
        const p = chestPos(ent);
        const isPhysStrike = /strike|smash|blow|bash|slash|punch|shot|thrust/i.test(id);
        const colHex = isPhysStrike ? 0xffbb44 : 0x66ccff;
        const sp = makeSprite(texGlow(colHex, true), colHex, 0.95, isPhysStrike ? 3.0 : 2.5);
        sp.position.copy(p);
        scene().add(sp);
        let f = 0;
        const a = () => {
          f++;
          sp.scale.setScalar((isPhysStrike ? 3.0 : 2.5) + f * 0.3);
          sp.material.opacity -= 0.08;
          if (sp.material.opacity > 0) requestAnimationFrame(a);
          else disposeObj(sp);
        };
        requestAnimationFrame(a);
      }
    },

    /**
     * Cast telegraph under mob feet (L2 cast circle) — always try to show something.
     */
    playMobCastTelegraph(caster, skillId, opts) {
      opts = opts || {};
      const scn = scene();
      if (!scn || !window.THREE) return false;
      let mesh = null;
      if (caster) {
        mesh = caster.mesh || caster.sprite || (caster.isObject3D ? caster : null);
      }
      let feet;
      if (mesh) {
        feet = feetPos({ mesh: mesh });
      } else if (window.game && window.game.player && window.game.player.mesh) {
        feet = feetPos(window.game.player);
      } else {
        return false;
      }
      const sid = String(skillId || '').toLowerCase();
      // color by skill family
      let col = 0xffaa44;
      if (sid.indexOf('oil') >= 0 || sid.indexOf('acid') >= 0) col = 0x88aa33;
      else if (sid.indexOf('steam') >= 0 || sid.indexOf('spark') >= 0 || sid.indexOf('static') >= 0) col = 0x88ccff;
      else if (sid.indexOf('weld') >= 0 || sid.indexOf('press') >= 0) col = 0xffcc66;
      else if (sid.indexOf('magnet') >= 0 || sid.indexOf('protocol') >= 0) col = 0xaa66ff;
      else if (sid.indexOf('green') >= 0) col = 0x44ff66;

      // ground cast disc
      try {
        const disc = groundDisc(texCastCircle('pressure'), 2.4, col, 0.85);
        disc.position.set(feet.x, feet.y + 0.06, feet.z);
        scn.add(disc);
        let f = 0;
        const life = 22;
        const step = () => {
          f++;
          const t = f / life;
          disc.scale.setScalar(1 + t * 0.55);
          disc.material.opacity = Math.max(0, 0.9 - t);
          disc.rotation.z += 0.12;
          if (t < 1) requestAnimationFrame(step);
          else {
            scn.remove(disc);
            if (disc.geometry) disc.geometry.dispose();
            if (disc.material) {
              if (disc.material.map && disc.material.map.dispose) { /* shared tex */ }
              disc.material.dispose();
            }
          }
        };
        requestAnimationFrame(step);
      } catch (e) { /* ignore */ }

      // vertical flash on caster
      try {
        const sp = makeSprite(texGlow(col, true), col, 0.95, 2.2);
        sp.position.set(feet.x, feet.y + 1.1, feet.z);
        scn.add(sp);
        let f2 = 0;
        const step2 = () => {
          f2++;
          const t = f2 / 16;
          sp.scale.setScalar(2.2 * (1 + t * 0.6));
          sp.material.opacity = Math.max(0, 1 - t);
          if (t < 1) requestAnimationFrame(step2);
          else disposeObj(sp);
        };
        requestAnimationFrame(step2);
      } catch (e2) { /* ignore */ }
      return true;
    },

    playMobSkill(skillId, caster, target, opts) {
      opts = opts || {};
      const id = String(skillId || '').toLowerCase();
      const scn = scene();
      if (!scn || !window.THREE) {
        // still try once scene is ready
        if (window.THREE && !scn && opts._retry !== true) {
          setTimeout(() => {
            try { this.playMobSkill(skillId, caster, target, Object.assign({}, opts, { _retry: true })); }
            catch (e) { /* ignore */ }
          }, 50);
        }
        return false;
      }

      // Resolve mesh from player / remote sprite / explicit mesh
      function entMesh(e) {
        if (!e) return null;
        if (e.mesh) return e.mesh;
        if (e.sprite) return e.sprite;
        if (e.isObject3D) return e;
        return null;
      }
      const cMesh = entMesh(caster);
      const tMesh = entMesh(target);

      const from = cMesh ? chestPos({ mesh: cMesh }) : null;
      const to = tMesh ? chestPos({ mesh: tMesh }) : null;
      const feetC = cMesh
        ? feetPos({ mesh: cMesh })
        : (from ? from.clone().setY(Math.max(0.05, (from.y || 1) - 1)) : null);
      const feetT = tMesh
        ? feetPos({ mesh: tMesh })
        : (to ? to.clone().setY(Math.max(0.05, (to.y || 1) - 1)) : null);

      // normalize remote rec (sprite) as mesh entity
      function asEnt(e) {
        if (!e) return null;
        if (e.mesh) return e;
        if (e.sprite) return { mesh: e.sprite, baseScale: e.baseScale };
        return e;
      }
      const cEnt = asEnt(caster) || (cMesh ? { mesh: cMesh } : null);
      const tEnt = asEnt(target) || (tMesh ? { mesh: tMesh } : null);

      // Always have a world anchor — never skip VFX silently
      let origin = from || (to && to.clone()) || null;
      if (!origin) origin = new window.THREE.Vector3(0, 1.2, 0);
      const hitAt = to || (from ? from.clone() : origin.clone());

      // ── helpers (cheap sprites only) ──
      const expandRing = (pos, color, startS, grow, lifeF) => {
        const ring = makeSprite(texGlow(color, true), color, 0.9, startS);
        ring.position.copy(pos);
        ring.position.y = (pos.y || 0) + 0.05;
        scn.add(ring);
        let f = 0;
        const step = () => {
          f++;
          const t = f / lifeF;
          ring.scale.setScalar(startS + t * grow);
          ring.material.opacity = Math.max(0, 0.9 - t);
          if (t < 1) requestAnimationFrame(step);
          else disposeObj(ring);
        };
        requestAnimationFrame(step);
      };
      const flash = (pos, color, scale, lifeF) => {
        const sp = makeSprite(texGlow(color, false), color, 1, scale);
        sp.position.copy(pos);
        scn.add(sp);
        let f = 0;
        const step = () => {
          f++;
          const t = f / lifeF;
          sp.scale.setScalar(scale * (1 + t * 0.8));
          sp.material.opacity = Math.max(0, 1 - t);
          if (t < 1) requestAnimationFrame(step);
          else disposeObj(sp);
        };
        requestAnimationFrame(step);
      };
      const pips = (pos, color, n, rise, spread) => {
        const arr = [];
        for (let i = 0; i < n; i++) {
          const sp = makeSprite(texGlow(color, true), color, 0.85, 0.45);
          const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
          sp.position.set(
            pos.x + Math.cos(a) * 0.2,
            pos.y,
            pos.z + Math.sin(a) * 0.2
          );
          scn.add(sp);
          arr.push({ sp, a, spn: 0.6 + (i % 3) * 0.12 });
        }
        let f = 0;
        const step = () => {
          f++;
          const t = f / 22;
          arr.forEach((p) => {
            const rr = 0.25 + t * spread;
            p.sp.position.x = pos.x + Math.cos(p.a + t * 3) * rr;
            p.sp.position.z = pos.z + Math.sin(p.a + t * 3) * rr;
            p.sp.position.y = pos.y + t * rise + Math.sin(t * 8 + p.a) * 0.15;
            p.sp.material.opacity = Math.max(0, 0.9 - t);
            p.sp.scale.setScalar(p.spn * (1 + t));
          });
          if (t < 1) requestAnimationFrame(step);
          else arr.forEach((p) => disposeObj(p.sp));
        };
        requestAnimationFrame(step);
      };
      const bolt = (a, b, color, onDone) => {
        if (!a || !b) {
          if (onDone) onDone();
          return;
        }
        const core = makeSprite(texGlow(color, false), color, 1, 1.1);
        const glow = makeSprite(texGlow(color, true), color, 0.75, 1.8);
        core.position.copy(a);
        glow.position.copy(a);
        scn.add(core);
        scn.add(glow);
        const start = a.clone();
        const end = b.clone();
        const dist = start.distanceTo(end);
        const dur = Math.max(0.1, Math.min(0.38, dist / 42));
        const t0 = performance.now();
        const step = () => {
          const u = Math.min(1, (performance.now() - t0) / (dur * 1000));
          const e = u * u * (3 - 2 * u);
          const pos = start.clone().lerp(end, e);
          pos.y += Math.sin(u * Math.PI) * Math.min(0.8, dist * 0.03);
          core.position.copy(pos);
          glow.position.copy(pos);
          if (u < 1) requestAnimationFrame(step);
          else {
            disposeObj(core);
            disposeObj(glow);
            if (onDone) onDone();
          }
        };
        requestAnimationFrame(step);
      };
      const steamPuff = (pos, n) => {
        for (let i = 0; i < n; i++) {
          const sp = makeSteamSprite(0.9 + Math.random() * 0.5, 0.55, C.steam);
          sp.position.set(
            pos.x + (Math.random() - 0.5) * 0.6,
            pos.y + Math.random() * 0.4,
            pos.z + (Math.random() - 0.5) * 0.6
          );
          scn.add(sp);
          let f = 0;
          const step = () => {
            f++;
            const t = f / 26;
            sp.position.y += 0.04 + t * 0.02;
            sp.scale.multiplyScalar(1.03);
            sp.material.opacity = Math.max(0, 0.55 - t);
            if (t < 1) requestAnimationFrame(step);
            else disposeObj(sp);
          };
          requestAnimationFrame(step);
        }
      };

      // ── per-skill ──
      switch (id) {
        case 'steam_jet': {
          // white steam cone caster → target
          flash(origin, 0xe8eef5, 1.6, 12);
          steamPuff(origin, 4);
          if (from && to) {
            bolt(from, to, 0xdde8f0, () => {
              steamPuff(hitAt, 5);
              flash(hitAt, 0xffffff, 2.2, 14);
            });
          } else {
            expandRing(feetC || origin, 0xc8d4e0, 1.2, 5, 20);
          }
          return true;
        }
        case 'static_burst': {
          // cyan electric nova at caster
          flash(origin, 0x66eeff, 2.0, 10);
          expandRing(feetC || origin, 0x44ddff, 1.0, 6, 18);
          pips(origin, 0xaaffff, 10, 1.4, 3.2);
          if (to) flash(hitAt, 0x88ffff, 1.8, 12);
          return true;
        }
        case 'firmware_rant': {
          // purple “error” glitch on target
          const pos = hitAt;
          flash(pos, 0xcc44ff, 1.8, 14);
          pips(pos, 0xff66cc, 8, 1.1, 2.4);
          // two offset flashes = glitch
          setTimeout(() => flash(pos.clone().add(new THREE.Vector3(0.2, 0.3, -0.1)), 0x44ffaa, 1.2, 10), 50);
          setTimeout(() => flash(pos.clone().add(new THREE.Vector3(-0.15, 0.1, 0.2)), 0xff4488, 1.0, 10), 100);
          return true;
        }
        case 'spark_shot': {
          flash(origin, 0xffee88, 1.2, 8);
          bolt(from || origin, to || hitAt, 0xffdd55, () => {
            flash(hitAt, 0xffcc33, 1.8, 12);
            pips(hitAt, 0xffaa22, 5, 0.8, 1.6);
          });
          return true;
        }
        case 'oil_slick': {
          // puddle under target feet (player) — dark oil rings
          const gpos = feetT || (to ? to.clone().setY((to.y || 1) - 0.9) : null) || feetC || origin;
          expandRing(gpos, 0x2a3318, 1.6, 5.5, 32);
          expandRing(gpos, 0x445522, 1.0, 4.0, 28);
          expandRing(gpos, 0x1a220c, 0.6, 3.0, 24);
          pips(gpos, 0x667733, 8, 0.35, 2.4);
          flash(gpos.clone().setY(gpos.y + 0.4), 0x889944, 1.2, 12);
          return true;
        }
        case 'steam_jet': {
          flash(origin, 0xaaccff, 1.6, 10);
          bolt(from || origin, to || hitAt, 0xcceeff, () => {
            flash(hitAt, 0xffffff, 2.0, 12);
            steamPuff(hitAt, 5);
            pips(hitAt, 0xaaddff, 6, 0.8, 1.8);
          });
          return true;
        }
        case 'static_burst':
        case 'firmware_rant': {
          flash(hitAt, 0x88eeff, 1.8, 12);
          pips(hitAt, 0xaaffee, 8, 1.0, 2.0);
          return true;
        }
        case 'pressure_nova':
        case 'boiler_eruption': {
          const gpos = feetC || origin;
          flash(origin, 0xff9955, 2.4, 12);
          expandRing(gpos, 0xff7744, 1.2, 9, 26);
          expandRing(gpos, 0xffcc88, 0.8, 7, 22);
          steamPuff(origin, 6);
          return true;
        }
        case 'overclock': {
          // self orange buff aura
          flash(origin, 0xff8833, 2.0, 16);
          expandRing(feetC || origin, 0xffaa44, 1.0, 3, 20);
          pips(origin, 0xffcc66, 7, 1.6, 1.5);
          return true;
        }
        case 'pack_howl': {
          flash(origin, 0xaaccff, 2.2, 14);
          expandRing(feetC || origin, 0x88bbff, 1.4, 8, 24);
          steamPuff(origin, 5);
          return true;
        }
        case 'weld_arc': {
          flash(origin, 0xffeeaa, 1.5, 10);
          bolt(from || origin, to || hitAt, 0xffdd66, () => {
            flash(hitAt, 0xffffff, 2.4, 12);
            pips(hitAt, 0xffcc44, 6, 0.9, 1.8);
          });
          return true;
        }
        case 'target_lock': {
          const pos = hitAt;
          // reticle-like double ring
          expandRing(pos, 0xff2244, 0.6, 2.2, 18);
          expandRing(pos, 0xff6688, 1.0, 1.6, 16);
          flash(pos, 0xff3355, 1.4, 12);
          return true;
        }
        case 'protocol_glitch':
        case 'directive_rewrite': {
          const pos = hitAt;
          flash(pos, 0x44ff88, 1.8, 14);
          pips(pos, 0x22ffaa, 9, 1.0, 2.2);
          setTimeout(() => flash(pos, 0xff44ff, 1.2, 10), 60);
          return true;
        }
        case 'press_slam':
        case 'clamp_crush':
        case 'colossus_stomp': {
          const gpos = feetT || feetC || origin;
          flash(gpos, 0xffaa66, 2.6, 12);
          expandRing(gpos, 0xdd8844, 1.0, 7, 22);
          pips(gpos, 0xffcc88, 8, 0.7, 2.8);
          return true;
        }
        case 'acid_spray': {
          flash(origin, 0x88ff44, 1.4, 10);
          bolt(from || origin, to || hitAt, 0x99ff55, () => {
            flash(hitAt, 0xaaff66, 2.0, 14);
            pips(hitAt, 0x77dd33, 7, 0.9, 2.0);
          });
          return true;
        }
        case 'magnet_pull': {
          // purple pull: pips fly from target toward caster
          if (from && to) {
            flash(hitAt, 0xaa66ff, 1.5, 10);
            const n = 6;
            for (let i = 0; i < n; i++) {
              const sp = makeSprite(texGlow(0xbb77ff, true), 0xbb77ff, 0.9, 0.5);
              sp.position.copy(to);
              scn.add(sp);
              const t0 = performance.now();
              const delay = i * 30;
              const step = () => {
                const u = Math.min(1, (performance.now() - t0 - delay) / 280);
                if (u < 0) { requestAnimationFrame(step); return; }
                sp.position.lerpVectors(to, from, Math.max(0, u));
                sp.material.opacity = Math.max(0, 0.95 - u);
                if (u < 1) requestAnimationFrame(step);
                else disposeObj(sp);
              };
              requestAnimationFrame(step);
            }
            flash(origin, 0xcc88ff, 1.6, 12);
          } else {
            flash(origin, 0xaa66ff, 2.0, 12);
          }
          return true;
        }
        case 'green_pulse': {
          flash(origin, 0x44ff66, 2.2, 12);
          expandRing(feetC || origin, 0x33ee55, 1.2, 7, 24);
          pips(origin, 0x88ff99, 8, 1.2, 2.6);
          return true;
        }
        case 'scrap_barrage': {
          flash(origin, 0xccaa88, 1.4, 10);
          for (let i = 0; i < 4; i++) {
            setTimeout(() => {
              const jitter = new THREE.Vector3(
                (Math.random() - 0.5) * 0.8,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.8
              );
              const a = (from || origin).clone().add(jitter);
              const b = (to || hitAt).clone().add(jitter.multiplyScalar(0.3));
              bolt(a, b, 0xddbb99, () => flash(b, 0xffccaa, 1.2, 8));
            }, i * 55);
          }
          return true;
        }
        case 'valve_lock': {
          flash(hitAt, 0x88aacc, 1.6, 14);
          expandRing(hitAt, 0x6688aa, 0.7, 2.0, 18);
          return true;
        }
        case 'drill_charge': {
          flash(origin, 0xffcc66, 1.8, 10);
          if (from && to) {
            bolt(from, to, 0xffbb44, () => {
              flash(hitAt, 0xffaa33, 2.4, 12);
              expandRing(feetT || hitAt, 0xdd8833, 1.0, 4, 16);
            });
          }
          return true;
        }
        case 'summon_drones': {
          flash(origin, 0x66ccff, 1.8, 12);
          pips(origin, 0x88ddff, 10, 1.8, 2.5);
          expandRing(feetC || origin, 0x55aadd, 1.0, 4, 20);
          return true;
        }
        case 'hive_call':
        case 'bite_clamp': {
          flash(hitAt, 0xff8866, 1.5, 10);
          pips(hitAt, 0xffaa88, 4, 0.5, 1.2);
          return true;
        }
        default:
          return false;
      }
    },

    /** Flashy ring + rising pips for brainrot meme skills */
    playMemeBurst(caster, target, color, kind) {
      const scn = scene();
      if (!scn || !window.THREE) return;
      const tMesh = entityMesh(target);
      const cMesh = entityMesh(caster);
      const origin = tMesh ? chestPos(target) : (cMesh ? chestPos(caster) : new THREE.Vector3(0, 1.5, 0));
      const foot = origin.clone(); foot.y = cMesh ? cMesh.position.y + 0.1 : 0.1;

      // expanding ground ring
      const ring = makeSprite(texGlow(color, true), color, 0.95, 1.2);
      ring.position.copy(foot);
      ring.scale.set(1.5, 1.5, 1);
      scn.add(ring);

      // vertical slam column
      const col = makeSprite(texGlow(color, true), color, 0.85, 2);
      col.position.copy(origin);
      scn.add(col);

      // floating emoji-like pips
      const pips = [];
      for (let i = 0; i < 8; i++) {
        const pip = makeSprite(texGlow(color, true), color, 0.9, 0.6);
        const a = (i / 8) * Math.PI * 2;
        pip.position.set(origin.x + Math.cos(a) * 0.4, origin.y, origin.z + Math.sin(a) * 0.4);
        scn.add(pip);
        pips.push({ sp: pip, a, spn: 0.8 + (i % 3) * 0.15 });
      }

      // chat flex
      try {
        if (window.game && window.game.addChatMessage && kind) {
          const labels = {
            skibidi: '🚽 Skibidi Slam!',
            tralala: '🦈 Tralala Wave!',
            bombardiro: '✈️ Bombardiro Dive!',
            tung: '🧹 Tung Suction!',
            cappuccino: '🩰 Cappuccino Spin!'
          };
          if (labels[kind]) window.game.addChatMessage(labels[kind], 'system');
        }
      } catch (e) { /* */ }

      let f = 0;
      const step = () => {
        f++;
        const t = f / 28;
        ring.scale.setScalar(1.5 + t * 8);
        ring.material.opacity = Math.max(0, 0.9 - t);
        col.scale.set(1.2 + t * 2, 3 + t * 4, 1);
        col.material.opacity = Math.max(0, 0.85 - t * 1.1);
        col.position.y = origin.y + t * 1.5;
        pips.forEach((p, i) => {
          const rr = 0.5 + t * 3.5;
          p.sp.position.x = origin.x + Math.cos(p.a + t * 4) * rr;
          p.sp.position.z = origin.z + Math.sin(p.a + t * 4) * rr;
          p.sp.position.y = origin.y + Math.sin(t * 6 + i) * 0.6 + t * 1.2;
          p.sp.material.opacity = Math.max(0, 0.9 - t);
        });
        if (t < 1) requestAnimationFrame(step);
        else {
          disposeObj(ring);
          disposeObj(col);
          pips.forEach((p) => disposeObj(p.sp));
        }
      };
      requestAnimationFrame(step);
    },

    playSelfRepair(caster, opts) {
      opts = opts || {};
      this.stopCast(false);
      try {
        playSelfRepair(caster);
        if (opts.onHit) opts.onHit();
      } catch (e) {
        console.warn('[SkillVFX] playSelfRepair', e);
      }
    },

    playPressureBolt(caster, target, opts) {
      opts = opts || {};
      const skipHit = !!opts.skipHit;
      this.stopCast(false);

      try {
        const from = entityMesh(caster) ? chestPos(caster) : null;
        const to = entityMesh(target) ? chestPos(target) : null;

        if (from) releaseFlash(from, caster ? feetPos(caster) : null);

        const doHit = () => {
          if (!skipHit) pressureHit(target);
          if (opts.onHit) opts.onHit();
        };

        if (from && to) fireBolt(from, to, doHit);
        else doHit();
      } catch (e) {
        console.warn('[SkillVFX] playPressureBolt', e);
      }
    },

    playHit(skillId, target) {
      const id = String(skillId || '').toLowerCase();
      if (id === 'eng_pressure_bolt' || id.indexOf('pressure_bolt') >= 0) {
        pressureHit(target);
      }
    },

    resolveTargetByMid(mid) {
      if (mid == null) return null;
      const g = window.game;
      if (!g) return null;
      if (g.spawnManager && g.spawnManager.enemies) {
        const e = g.spawnManager.enemies.find((x) => x && x.mid === mid);
        if (e) return e;
      }
      if (g.net && g.net.remote) {
        const rem = g.net.remote.get('m' + mid);
        if (rem) return rem;
      }
      if (g.player && g.player.target && g.player.target.mid === mid) return g.player.target;
      return null;
    },

    playMobCrush: playMobCrush,

    /**
     * Animated combat hit (AA / skill).
     * @param {object} target — entity with mesh|sprite
     * @param {{ crit?: boolean, incoming?: boolean, kind?: string }} [opts]
     */
    playCombatHit(target, opts) {
      try {
        playCombatHit(target, opts || {});
      } catch (e) {
        console.warn('[SkillVFX] playCombatHit', e);
      }
    },

    playCritHit(target, opts) {
      try {
        playCombatHit(target, Object.assign({}, opts || {}, { crit: true }));
      } catch (e) {
        console.warn('[SkillVFX] playCritHit', e);
      }
    },

    /**
     * Classic level-up: pillar + rings + sparks + banner.
     * @param {object} [entity] — default local player
     * @param {{ level?: number, duration?: number }} [opts]
     */
    playLevelUp(entity, opts) {
      try {
        const ent = entity || (window.game && window.game.player);
        if (!ent || !ent.mesh) {
          console.warn('[SkillVFX] playLevelUp: no entity');
          return;
        }
        playLevelUp(ent, opts || {});
      } catch (e) {
        console.warn('[SkillVFX] playLevelUp', e);
      }
    },

    /**
     * Classic Lineage 2 resurrection VFX (GM Blessed Resurrection).
     * @param {object} [caster]
     * @param {object} [target]
     * @param {{ x?: number, y?: number, z?: number, targetName?: string, casterName?: string }} [opts]
     */
    playResurrectionVFX(caster, target, opts) {
      try {
        playResurrectionVFX(caster, target, opts || {});
      } catch (e) {
        console.warn('[SkillVFX] playResurrectionVFX', e);
      }
    },

    /**
     * The Flash Speed Force activation burst.
     */
    playFlashBurst(entity, opts) {
      try {
        playFlashBurst(entity, opts || {});
      } catch (e) {
        console.warn('[SkillVFX] playFlashBurst', e);
      }
    },

    /**
     * The Flash Speed Force continuous running effects (after-images, lightning, sparks).
     */
    updateFlashRunEffects(entity, delta) {
      try {
        updateFlashRunEffects(entity, delta);
      } catch (e) {
        // silent in hot animation loop
      }
    },

    /** debug: force cast aura on local player */
    debugCast() {
      const p = window.game && window.game.player;
      if (!p) return console.warn('no player');
      this.startCast('eng_pressure_bolt', p, p.target || null);
      console.log('[SkillVFX] debug cast on', p);
    },

    /** debug: level-up VFX */
    debugLevelUp(level) {
      const p = window.game && window.game.player;
      if (!p) return console.warn('no player');
      this.playLevelUp(p, { level: level != null ? level : (p.level || 1) });
    }
  };

  window.SkillVFX = SkillVFX;
  console.log('[SkillVFX] L2-style loaded');
})();
