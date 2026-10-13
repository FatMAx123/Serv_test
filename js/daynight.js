// ============================================================
//  DAYNIGHT.JS — глобальное освещение + цикл день/ночь (L2-style).
//  Один DirectionalLight = солнце (днём), второй = луна (ночью),
//  кроссфейд по высоте солнца -> тени не скачут на закате.
//  Крутит: sun/moon light, ambient, hemisphere, Sky-небо, туман,
//  toneMappingExposure, звёзды и атмосферу воды (Terrain.setAtmosphere).
//  Время: timeOfDay [0,1): 0=полночь, .25=восход, .5=полдень, .75=закат.
//  Управление из консоли: DayNightSetHour(21) / DayNightSpeed(4).
// ============================================================
(function () {
  'use strict';
  var DEG = Math.PI / 180;
  function ss(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  function DayNight(game) {
    this.game = game;
    this.scene = game.scene;
    this.renderer = game.renderer;
    this.sun = game.sun || null;                 // основной свет из main.js
    this.ambient = this.scene.children.find(function (c) { return c.isAmbientLight; }) || null;
    this.hemi = this.scene.children.find(function (c) { return c.isHemisphereLight; }) || null;
    this.skyU = (game._rs && game._rs.sky && game._rs.sky.material) ? game._rs.sky.material.uniforms : null;

    // настройки цикла (L2-like из shared/world-time.js; сервер = авторитет online)
    var WT = window.WorldTime || window.WORLD_TIME || null;
    this.dayLengthSec = (WT && WT.DAY_LENGTH_SEC) || (4 * 3600); // ~4 real hours
    this.dayRealFrac = (WT && WT.DAY_REAL_FRAC) || 0.75;         // 3h day / 1h night
    this.timeOfDay = 0.30;                       // до первого якоря с сервера
    this._realFrac = WT && WT.todToRealFrac
      ? WT.todToRealFrac(this.timeOfDay)
      : this.timeOfDay;
    this.paused = false;                         // true = пауза (editor preview)
    this.editorOverride = false;                 // true = F2 preview, не сервер

    // L2 moon light pack:
    //  key  = cool silver-blue Directional (луна)
    //  fill = very soft cool Directional с противоположной стороны (как ambient bounce L2)
    //  + blue ambient/hemi — ночь читаемая, не «чёрная дыра»
    var THREE = window.THREE;
    this.moon = new THREE.DirectionalLight(0xa8c8ff, 0);
    this.moon.name = 'MoonKey';
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.width = this.moon.shadow.mapSize.height = 1024;
    this.moon.shadow.camera.near = 2;
    this.moon.shadow.camera.far = 640;
    var d = 140;
    this.moon.shadow.camera.left = -d; this.moon.shadow.camera.right = d;
    this.moon.shadow.camera.top = d; this.moon.shadow.camera.bottom = -d;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.045;
    // r155+: мягче тень (L2 soft-ish)
    if (this.moon.shadow.radius != null) this.moon.shadow.radius = 3.5;
    if (this.moon.shadow.intensity != null) this.moon.shadow.intensity = 0.72;
    this.moon.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.moon); this.scene.add(this.moon.target);

    this.moonFill = new THREE.DirectionalLight(0x6a88cc, 0);
    this.moonFill.name = 'MoonFill';
    this.moonFill.castShadow = false;
    this.scene.add(this.moonFill);
    this.scene.add(this.moonFill.target);

    // L2-style night sky (НЕ фото-HDRI):
    //  1) gradient dome (deep blue)  2) starfield texture additive  3) moon billboard
    this.nightDome = this._makeL2NightDome();
    this.scene.add(this.nightDome);
    this.starDome = this._makeL2StarDome();
    this.scene.add(this.starDome);
    this.nightSky = null; // old HDRI path disabled
    this.stars = null;
    this.milkyWay = null;
    this.moonMesh = this._makeMoonDisc();
    this.scene.add(this.moonMesh);
    this._lastNight = 0;
    this._starTwinkle = 0;

    // рабочие вектора/цвета (без аллокаций в цикле)
    this._sunDir = new THREE.Vector3();
    this._moonDir = new THREE.Vector3();
    this._wSun = new THREE.Color(); this._wTop = new THREE.Color(); this._wHor = new THREE.Color();
    this._wFog = new THREE.Color(); this._wAmb = new THREE.Color();
    this._wHemiS = new THREE.Color(); this._wHemiG = new THREE.Color();
    this._wMoonLit = new THREE.Color();
    // палитра фаз (ночь — почти чёрный горизонт/fog, без «молочного» свечения)
    this.C = {
      sunDay: new THREE.Color(1.00, 0.96, 0.86),
      sunSet: new THREE.Color(1.00, 0.52, 0.22),
      moonCol: new THREE.Color(0.55, 0.72, 1.00),
      moonFillCol: new THREE.Color(0.32, 0.48, 0.85),

      topDay: new THREE.Color(0.30, 0.55, 0.85),
      topSet: new THREE.Color(0.18, 0.16, 0.38),
      // deep cold night sky (not purple-black milk)
      topNight: new THREE.Color(0.02, 0.05, 0.14),

      horDay: new THREE.Color(0.62, 0.75, 0.85),
      horSet: new THREE.Color(0.98, 0.52, 0.22),
      // cold blue-cyan horizon band
      horNight: new THREE.Color(0.10, 0.18, 0.32),

      fogDay: new THREE.Color(0.70, 0.80, 0.88),
      // cold blue fog at night (icy, not brown/grey)
      fogNight: new THREE.Color(0.12, 0.22, 0.40),

      ambDay: new THREE.Color(0.65, 0.68, 0.76),
      ambSet: new THREE.Color(0.62, 0.42, 0.32),
      ambNight: new THREE.Color(0.24, 0.32, 0.52),

      hemiSDay: new THREE.Color(0.68, 0.80, 0.96),
      hemiSSet: new THREE.Color(0.72, 0.48, 0.38),
      hemiSNight: new THREE.Color(0.22, 0.34, 0.65),

      hemiGDay: new THREE.Color(0.42, 0.36, 0.26),
      hemiGSet: new THREE.Color(0.35, 0.25, 0.18),
      hemiGNight: new THREE.Color(0.10, 0.12, 0.22)
    };
    this._phase = null;
    this._first = true;

    // консольные хелперы
    var self = this;
    window.DayNightSetHour = function (h) { self.setHour(h); };
    window.DayNightSpeed = function (mult) {
      // длина суток — только сервер; локально — editorOverride
      if (self._serverDriven && !self.editorOverride) {
        console.warn('[DayNight] dayLengthSec с сервера, DayNightSpeed игнор');
        return;
      }
      var base = (window.WorldTime && window.WorldTime.DAY_LENGTH_SEC) || 14400;
      self.dayLengthSec = Math.max(60, base / (mult || 1));
    };
    window.dayNight = this;
    console.log(
      '[DayNight] L2 timing | cycle=' + (this.dayLengthSec / 3600).toFixed(1) + 'h real',
      '| day/night wall=' + Math.round(this.dayRealFrac * 100) + '/' + Math.round((1 - this.dayRealFrac) * 100) + '%',
      '| server auth. DayNightSetHour(21)'
    );
  }

  DayNight.prototype._WT = function () {
    return window.WorldTime || window.WORLD_TIME || null;
  };

  /** [0..24) → timeOfDay (локально / editor preview) */
  DayNight.prototype.setHour = function (h) {
    var WT = this._WT();
    var hh = ((Number(h) % 24) + 24) % 24;
    this.timeOfDay = hh / 24;
    if (WT && WT.gameHourToRealFrac) this._realFrac = WT.gameHourToRealFrac(hh);
    else this._realFrac = this.timeOfDay;
    if (this.game && this.game.net && this.game.net.timeAnchor) {
      this.game.net.timeAnchor.tod = this.timeOfDay;
      this.game.net.timeAnchor.realFrac = this._realFrac;
      this.game.net.timeAnchor.at = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    }
  };

  /** [0..1) доля игровых суток */
  DayNight.prototype.setTimeOfDay = function (t) {
    var x = Number(t);
    if (!isFinite(x)) return;
    var WT = this._WT();
    this.timeOfDay = ((x % 1) + 1) % 1;
    if (WT && WT.todToRealFrac) this._realFrac = WT.todToRealFrac(this.timeOfDay);
    else this._realFrac = this.timeOfDay;
    if (this.game && this.game.net && this.game.net.timeAnchor) {
      this.game.net.timeAnchor.tod = this.timeOfDay;
      this.game.net.timeAnchor.realFrac = this._realFrac;
      this.game.net.timeAnchor.at = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    }
  };

  DayNight.prototype.getHour = function () {
    return this.timeOfDay * 24;
  };

  DayNight.prototype.getPhaseName = function () {
    var sinElev = Math.sin((this.timeOfDay - 0.25) * Math.PI * 2);
    if (sinElev > 0.25) return 'day';
    if (sinElev > 0.0) return 'golden';
    if (sinElev > -0.10) return 'twilight';
    return 'night';
  };

  DayNight.prototype.setPaused = function (p) {
    this.paused = !!p;
    if (this.game && this.game.net && this.game.net.timeAnchor) {
      this.game.net.timeAnchor.paused = this.paused;
      this.game.net.timeAnchor.at = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    }
  };

  /** Редактор: ручной scrub — не следовать серверу, пока override */
  DayNight.prototype.setEditorOverride = function (on) {
    this.editorOverride = !!on;
  };

  /**
   * === Суточный цикл освещения небосвода ===
   * Не фото-HDRI. Купол за камерой + hand-painted / stylized слои:
   *   1) gradient dome (deep blue / purple horizon)
   *   2) starfield texture (soft dots), additive, slow UV scroll
   *   3) moon billboard
   * depthTest=true → силуэт гор закрывает небо (infinite sky feel).
   */

  /** Layer 1: night gradient skydome (shader, no photo). */
  DayNight.prototype._makeL2NightDome = function () {
    var THREE = window.THREE;
    var geo = new THREE.SphereGeometry(2650, 48, 24);
    var mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      uniforms: {
        uOpacity: { value: 0 },
        uZenith: { value: new THREE.Color(0.02, 0.06, 0.16) },
        uHorizon: { value: new THREE.Color(0.08, 0.14, 0.28) },
        uGlow: { value: new THREE.Color(0.10, 0.20, 0.38) }
      },
      vertexShader: [
        'varying vec3 vDir;',
        'void main(){',
        '  vDir = normalize(position);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uOpacity;',
        'uniform vec3 uZenith, uHorizon, uGlow;',
        'varying vec3 vDir;',
        'void main(){',
        '  float h = clamp(vDir.y, -0.15, 1.0);',
        '  // L2: deep blue zenith, slightly purple horizon band',
        '  float t = smoothstep(-0.05, 0.75, h);',
        '  vec3 col = mix(uHorizon, uZenith, t);',
        '  // soft “sky glow” above horizon (not white milk)',
        '  float band = exp(-pow((h - 0.08) / 0.22, 2.0)) * 0.35;',
        '  col += uGlow * band;',
        '  // fade lower hemisphere (under world)',
        '  float under = smoothstep(-0.2, 0.05, h);',
        '  gl_FragColor = vec4(col, uOpacity * under);',
        '}'
      ].join('\n')
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'L2NightDome';
    mesh.frustumCulled = false;
    mesh.renderOrder = -20;
    mesh.visible = false;
    return mesh;
  };

  /**
   * Starfield texture. layer: 'far' | 'mid' | 'near'
   * far = много крошечных, near = мало чуть крупнее (глубина).
   */
  DayNight.prototype._paintStarfieldTex = function (layer) {
    var THREE = window.THREE;
    layer = layer || 'mid';
    var W = 2048, H = 1024;
    var c = document.createElement('canvas');
    c.width = W; c.height = H;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    function star(x, y, r, a, col) {
      if (r < 0.35) r = 0.35;
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + col + ',' + a + ')');
      g.addColorStop(0.2, 'rgba(' + col + ',' + (a * 0.4) + ')');
      g.addColorStop(0.55, 'rgba(' + col + ',' + (a * 0.07) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    var i, x, y, r, a, col;
    var nFaint, nMid, nBright, rF0, rF1, rM0, rM1, rB0, rB1;

    if (layer === 'far') {
      // дальний фон — пыль крошечных
      nFaint = 5200; nMid = 400; nBright = 25;
      rF0 = 0.25; rF1 = 0.7;
      rM0 = 0.55; rM1 = 1.1;
      rB0 = 1.0; rB1 = 1.8;
    } else if (layer === 'near') {
      // ближний — мало, чуть ярче/крупнее
      nFaint = 0; nMid = 180; nBright = 40;
      rF0 = 0.4; rF1 = 0.8;
      rM0 = 0.7; rM1 = 1.4;
      rB0 = 1.3; rB1 = 2.4;
    } else {
      // mid
      nFaint = 2200; nMid = 350; nBright = 45;
      rF0 = 0.3; rF1 = 0.85;
      rM0 = 0.65; rM1 = 1.25;
      rB0 = 1.1; rB1 = 2.0;
    }

    for (i = 0; i < nFaint; i++) {
      x = Math.random() * W;
      y = Math.random() * H * 0.74;
      r = rF0 + Math.random() * (rF1 - rF0);
      a = 0.18 + Math.random() * 0.35;
      col = Math.random() < 0.12 ? '170,195,255' : '220,230,255';
      star(x, y, r, a, col);
    }
    for (i = 0; i < nMid; i++) {
      x = Math.random() * W;
      y = Math.random() * H * 0.7;
      r = rM0 + Math.random() * (rM1 - rM0);
      a = 0.35 + Math.random() * 0.4;
      col = Math.random() < 0.18 ? '175,200,255' : (Math.random() > 0.94 ? '255,235,195' : '240,245,255');
      star(x, y, r, a, col);
    }
    for (i = 0; i < nBright; i++) {
      x = Math.random() * W;
      y = Math.random() * H * 0.62;
      r = rB0 + Math.random() * (rB1 - rB0);
      a = 0.55 + Math.random() * 0.4;
      star(x, y, r, a, '255,255,255');
      // очень тонкий крестик только у near/mid bright
      if (layer !== 'far' && r > 1.4) {
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = 'rgba(230,240,255,0.7)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - r * 1.3, y); ctx.lineTo(x + r * 1.3, y);
        ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x, y + r * 1.3);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    var tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  /**
   * 3 слоя звёзд на разных радиусах + разный scroll = parallax depth.
   */
  DayNight.prototype._makeL2StarDome = function () {
    var THREE = window.THREE;
    var group = new THREE.Group();
    group.name = 'L2StarDome';
    group.frustumCulled = false;
    group.visible = false;

    var layers = [
      { name: 'far',  layer: 'far',  R: 2680, scroll: 0.0007, rot: 0.0018, opMul: 0.55, order: -19 },
      { name: 'mid',  layer: 'mid',  R: 2580, scroll: 0.0014, rot: 0.0035, opMul: 0.85, order: -18 },
      { name: 'near', layer: 'near', R: 2480, scroll: 0.0024, rot: 0.0055, opMul: 1.0,  order: -17 }
    ];
    var li, L, geo, tex, mat, mesh;
    for (li = 0; li < layers.length; li++) {
      L = layers[li];
      geo = new THREE.SphereGeometry(L.R, 56, 28);
      tex = this._paintStarfieldTex(L.layer);
      mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffffff,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        depthTest: true,
        blending: THREE.AdditiveBlending,
        fog: false,
        toneMapped: false
      });
      mesh = new THREE.Mesh(geo, mat);
      mesh.name = 'L2Stars_' + L.name;
      mesh.frustumCulled = false;
      mesh.renderOrder = L.order;
      mesh.userData.scroll = L.scroll;
      mesh.userData.rot = L.rot;
      mesh.userData.opMul = L.opMul;
      // лёгкий сдвиг фазы, чтобы слои не совпадали 1:1
      mesh.rotation.y = li * 0.7;
      mesh.rotation.z = (li - 1) * 0.08;
      group.add(mesh);
    }
    return group;
  };

  /**
   * Реалистичный диск луны (data/textures/moon.webp).
   * Mesh + depthTest:true → террейн/горы закрывают луну (не «сквозняк»).
   * depthWrite:false → не дырявит небо за собой.
   */
  DayNight.prototype._makeMoonDisc = function () {
    var THREE = window.THREE;
    var geo = new THREE.PlaneGeometry(1, 1);
    var mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      toneMapped: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'MoonDisc';
    mesh.frustumCulled = false;
    mesh.visible = false;
    // Behind world geometry in order; depthTest still lets ridges occlude
    mesh.renderOrder = -5;
    mesh.userData.isSkyBody = true;

    // Канон: client/data/textures/moon.webp (единственный файл луны)
    var paths = window.texUrl
      ? window.texUrl('moon.webp')
      : ['data/textures/moon.webp', 'client/data/textures/moon.webp'];
    var applyMoon = function (tex, url) {
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      mat.map = tex;
      mat.needsUpdate = true;
      mesh.userData.moonSrc = url || (tex.userData && tex.userData.src) || 'moon.webp';
      console.log('[DayNight] moon texture', mesh.userData.moonSrc);
    };
    if (window.loadTex) {
      window.loadTex('moon.webp', applyMoon, function () {
        console.warn('[DayNight] moon.webp missing in data/textures/ — fallback canvas disc');
        mat.map = DayNight._fallbackMoonTex(THREE);
        mat.needsUpdate = true;
      });
    } else {
      var loader = new THREE.TextureLoader();
      var idx = 0;
      (function tryLoad() {
        if (idx >= paths.length) {
          console.warn('[DayNight] moon.webp missing in data/textures/ — fallback canvas disc');
          mat.map = DayNight._fallbackMoonTex(THREE);
          mat.needsUpdate = true;
          return;
        }
        var url = paths[idx++];
        loader.load(url, function (tex) { applyMoon(tex, url); }, undefined, tryLoad);
      })();
    }
    return mesh;
  };

  DayNight._fallbackMoonTex = function (THREE) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    var g = ctx.createRadialGradient(118, 118, 20, 128, 128, 118);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(210,220,240,1)');
    g.addColorStop(0.85, 'rgba(170,180,210,0.95)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();
    var tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };

  DayNight.prototype.update = function (delta, playerPos) {
    var THREE = window.THREE;
    if (!playerPos) playerPos = { x: 0, y: 0, z: 0 };

    // --- время ---
    // Сервер: экстраполяция якоря. editorOverride: локальный F2 preview.
    var WT = this._WT();
    var _anchor = null;
    if (!this.editorOverride && this.game.net && typeof this.game.net.getServerTod === 'function') {
      _anchor = this.game.net.getServerTod();
    }
    this._serverDriven = (_anchor !== null);
    if (this._serverDriven) {
      var _d = _anchor - this.timeOfDay;
      if (_d > 0.5) _d -= 1; else if (_d < -0.5) _d += 1;
      if (Math.abs(_d) > 0.02) {
        this.timeOfDay = _anchor;
      } else {
        this.timeOfDay = (this.timeOfDay + _d * Math.min(1, (delta || 0.016) * 6) + 1) % 1;
      }
      if (WT && WT.todToRealFrac) this._realFrac = WT.todToRealFrac(this.timeOfDay);
      if (this.game.net.timeAnchor && this.game.net.timeAnchor.dayLengthSec) {
        this.dayLengthSec = this.game.net.timeAnchor.dayLengthSec;
      }
    } else if (!this.paused) {
      if (WT && WT.advanceRealFrac && WT.realFracToTod) {
        this._realFrac = WT.advanceRealFrac(this._realFrac, delta || 0, this.dayLengthSec);
        this.timeOfDay = WT.realFracToTod(this._realFrac);
      } else {
        this.timeOfDay = (this.timeOfDay + (delta || 0) / this.dayLengthSec) % 1;
      }
    }
    var tod = this.timeOfDay;

    // --- геометрия солнца ---
    var sinElev = Math.sin((tod - 0.25) * Math.PI * 2);          // -1..1, полдень=+1
    var elevDeg = Math.asin(Math.max(-1, Math.min(1, sinElev))) / DEG * 0.78;  // полдень ~70°
    var azDeg = tod * 360;                                       // восход=восток, закат=запад
    var phi = (90 - elevDeg) * DEG, theta = azDeg * DEG;
    this._sunDir.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
    this._moonDir.copy(this._sunDir).negate();

    // --- факторы фаз ---
    var dayF = ss(-0.05, 0.16, sinElev);
    var warm = clamp01(1 - Math.abs(sinElev) / 0.28);
    var night = 1 - ss(-0.16, 0.08, sinElev);
    var sunAmt = ss(-0.14, 0.18, sinElev);

    // --- солнце / луна ---
    var moonElev = this._moonDir.y;
    var moonAbove = ss(-0.22, 0.02, moonElev);
    var moonLit = Math.max(night * 0.92, night * moonAbove);
    moonLit = clamp01(moonLit);

    if (this.sun) {
      this._wSun.copy(this.C.sunDay).lerp(this.C.sunSet, warm);
      this.sun.color.copy(this._wSun);
      this.sun.intensity = Math.max(0, sunAmt * (1 - 0.22 * warm) * 2.40);
      if (sinElev < -0.14) this.sun.intensity = 0;
      this.sun.position.set(
        playerPos.x + this._sunDir.x * 300,
        playerPos.y + this._sunDir.y * 300,
        playerPos.z + this._sunDir.z * 300
      );
      this.sun.target.position.set(playerPos.x, playerPos.y || 0, playerPos.z);
      this.sun.target.updateMatrixWorld();
      var shadowsAllowed = (!this.game || this.game.shadowQuality !== 'off');
      this.sun.castShadow = shadowsAllowed && (sunAmt > 0.08 && night < 0.65);
    }

    // --- холодный L2 moonlight ---
    var elevK = 0.80 + 0.20 * Math.max(0, moonElev);
    this.moon.color.copy(this.C.moonCol);
    this.moon.intensity = moonLit * elevK * 2.15;
    this.moon.castShadow = shadowsAllowed && (moonLit > 0.05);
    var mDist = 420;
    var mdx = this._moonDir.x, mdy = this._moonDir.y, mdz = this._moonDir.z;
    if (mdy < 0.15) {
      var len = Math.sqrt(mdx * mdx + 0.35 * 0.35 + mdz * mdz) || 1;
      mdx /= len; mdy = 0.35 / len; mdz /= len;
    }
    this.moon.position.set(
      playerPos.x + mdx * mDist,
      playerPos.y + mdy * mDist + 50,
      playerPos.z + mdz * mDist
    );
    this.moon.target.position.set(playerPos.x, playerPos.y || 0, playerPos.z);
    this.moon.target.updateMatrixWorld();

    if (this.moonFill) {
      this.moonFill.color.copy(this.C.moonFillCol);
      this.moonFill.intensity = moonLit * elevK * 0.90;
      this.moonFill.position.set(
        playerPos.x - mdx * 260,
        playerPos.y + 200,
        playerPos.z - mdz * 260
      );
      this.moonFill.target.position.set(playerPos.x, playerPos.y || 0, playerPos.z);
      this.moonFill.target.updateMatrixWorld();
    }
    this._lastNight = night;
    if (window.Mountains && typeof window.Mountains.setNight === 'function') {
      window.Mountains.setNight(night);
    }

    // ambient/hemi: тёплый рассвет/закат (ambSet), не чёрный провал
    if (this.ambient) {
      this._wAmb.copy(this.C.ambNight).lerp(this.C.ambDay, dayF).lerp(this.C.ambSet, warm * 0.75);
      this.ambient.color.copy(this._wAmb);
      this.ambient.intensity = 0.45 * night + 0.78 * dayF + warm * 0.55 + moonLit * 0.20;
    }
    if (this.hemi) {
      this._wHemiS.copy(this.C.hemiSNight).lerp(this.C.hemiSDay, dayF).lerp(this.C.hemiSSet, warm * 0.75);
      this._wHemiG.copy(this.C.hemiGNight).lerp(this.C.hemiGDay, dayF).lerp(this.C.hemiGSet, warm * 0.75);
      this.hemi.color.copy(this._wHemiS);
      this.hemi.groundColor.copy(this._wHemiG);
      this.hemi.intensity = 0.40 * night + 0.78 * dayF + warm * 0.55 + moonLit * 0.22;
    }

    // --- небо Sky: тёплый градиент заката/рассвета ---
    this._wTop.copy(this.C.topNight).lerp(this.C.topDay, dayF).lerp(this.C.topSet, warm * 0.85);
    this._wHor.copy(this.C.horNight).lerp(this.C.horDay, dayF).lerp(this.C.horSet, warm * 0.95);
    if (this.skyU) {
      if (night > 0.65) {
        // солнце глубоко под горизонтом — Preetham не рисует серый/бирюзовый блин
        this.skyU.sunPosition.value.set(0.0, -1.0 - night * 0.5, 0.05);
        this.skyU.turbidity.value = 0.4;
        this.skyU.rayleigh.value = 0.04;
        this.skyU.mieCoefficient.value = 0.0002;
        this.skyU.mieDirectionalG.value = 0.6;
      } else {
        this.skyU.sunPosition.value.copy(this._sunDir);
        this.skyU.turbidity.value = (2.0 + 2.0 * dayF) + warm * 6.0;
        this.skyU.rayleigh.value = (0.4 + 0.8 * dayF) + warm * 2.0;
        this.skyU.mieCoefficient.value = 0.004 + warm * 0.02;
        this.skyU.mieDirectionalG.value = 0.8;
      }
    }
    // фон сцены тоже гасим (на случай щелей sky mesh)
    if (this.scene.background && this.scene.background.isColor) {
      this.scene.background.copy(this._wTop);
    }

    // --- туман: L2 C1 seamless horizon fog ---
    // Day: match horizon. Night: cold blue-cyan (not brown dust / purple milk).
    this._wFog.copy(this._wHor);
    if (night > 0.15) {
      var fogN = Math.pow(Math.min(1, (night - 0.15) / 0.85), 0.9);
      this._wFog.lerp(this.C.fogNight, fogN);
    }

    var THREE = window.THREE;
    if (this.scene) {
      var isEd = (typeof window.isSceneEditorActive === 'function' && window.isSceneEditorActive());
      var vis = window.L2VisibilityManager || window.L2Vis;
      var clip = (vis && vis.config && vis.config.clippingRange) ? vis.config.clippingRange : null;
      var propsDist = clip ? (clip.propsMax || 450) : 450;
      var nearDist = isEd ? 6000 : Math.max(120, propsDist * 0.40 - night * 60);
      var farDist = isEd ? 18000 : Math.max(280, propsDist * 0.95 - night * 80);

      if (!this.scene.fog || !this.scene.fog.isFog) {
        this.scene.fog = new THREE.Fog(this._wFog.getHex(), nearDist, farDist);
      } else {
        this.scene.fog.color.copy(this._wFog);
        this.scene.fog.near = nearDist;
        this.scene.fog.far = farDist;
      }
      var minCamFar = isEd ? 8000 : 2500;
      if (this.game && this.game.camera && this.game.camera.far < minCamFar) {
        this.game.camera.far = minCamFar;
        this.game.camera.updateProjectionMatrix();
      }
    }
    if (this.renderer) {
      // день ~1.40 exposure (полдень читаемый); ночь без «молока»
      this.renderer.toneMappingExposure = 0.55 + 0.85 * dayF + warm * 0.10 + moonLit * 0.08;
    }

    // --- L2 night sky layers (gradient dome + star texture + moon) ---
    var cam = this.game.camera;
    this._starTwinkle += delta || 0;
    // появляется после заката, max в глубине ночи
    var skyOp = Math.pow(Math.max(0, night - 0.05) / 0.95, 1.05);
    if (cam && this.nightDome) {
      this.nightDome.position.copy(cam.position);
      this.nightDome.material.uniforms.uOpacity.value = Math.min(1, skyOp * 1.05);
      this.nightDome.visible = skyOp > 0.02;
    }
    if (cam && this.starDome) {
      this.starDome.position.copy(cam.position);
      // звёзды чуть позже купола; 3 слоя — parallax depth
      var stOp = Math.pow(Math.max(0, night - 0.12) / 0.88, 1.15);
      this.starDome.visible = stOp > 0.03;
      var t = this._starTwinkle;
      this.starDome.children.forEach(function (mesh) {
        if (!mesh.material) return;
        var mul = mesh.userData.opMul != null ? mesh.userData.opMul : 1;
        mesh.material.opacity = Math.min(1, stOp * 0.9 * mul);
        mesh.rotation.y = t * (mesh.userData.rot || 0.003);
        if (mesh.material.map) {
          mesh.material.map.offset.x = (t * (mesh.userData.scroll || 0.001)) % 1;
        }
      });
    }

    // --- диск луны: за хребтом (дальше гор) + depth occlusion ---
    if (this.moonMesh && cam) {
      // elev: +1 зенит, 0 горизонт, -1 надир (opposite sun)
      var elev = this._moonDir.y;
      // мягкий заход/восход через горизонт (не hard cut)
      var aboveH = ss(-0.06, 0.10, elev);
      // днём луну почти не видно, в сумерках/ночи — да
      var moonVis = night * aboveH;
      // лёгкий «atmospheric» dim у горизонта
      var horizonDim = 0.55 + 0.45 * ss(0.0, 0.35, elev);
      var opacity = Math.min(1, moonVis * 1.05 * horizonDim);

      this.moonMesh.visible = opacity > 0.02;
      this.moonMesh.material.opacity = opacity;

      // Дальше массива гор (~1.5–2 км), иначе диск «перед» силуэтом.
      // camera.far = 2500 → держим md < far, но > типичного range гор.
      var far = (cam.far && isFinite(cam.far)) ? cam.far : 2500;
      var md = Math.min(far * 0.92, 2350);
      var mx = cam.position.x + this._moonDir.x * md;
      var my = cam.position.y + this._moonDir.y * md;
      var mz = cam.position.z + this._moonDir.z * md;
      // не уводим под ландшафт при низком elev
      if (my < cam.position.y + 8) my = cam.position.y + 8;
      this.moonMesh.position.set(mx, my, mz);

      // billboard: плоскость всегда к камере
      this.moonMesh.quaternion.copy(cam.quaternion);

      // depthTest: peaks write depth → moon sits behind ridges
      this.moonMesh.material.depthTest = true;
      this.moonMesh.material.depthWrite = false;
      // draw with sky layer, not on top of world
      this.moonMesh.renderOrder = -5;

      // угловой размер ~1.6° (чуть скромнее — не «тарелка» между пиками)
      var ang = 0.028 + (1 - Math.max(0, elev)) * 0.010;
      var mScale = md * ang * 2;
      this.moonMesh.scale.set(mScale, mScale, 1);
    }

    // --- атмосфера воды: ночь без светящегося горизонта ---
    var water = window.WaterSystem;
    if (water && water.setAtmosphere) {
      var above = sinElev >= 0.02;
      // L2 moon glint on water — cool, moderate
      this._wMoonLit.copy(this.C.moonCol).multiplyScalar(0.22 + moonLit * 0.35);
      water.setAtmosphere({
        sunDir: above ? this._sunDir : this._moonDir,
        sunColor: above ? this._wSun : this._wMoonLit,
        skyTop: this._wTop,
        skyHorizon: this._wHor,
        night: night
      });
    }

    // --- сообщения о смене фазы (редко) ---
    var ph = sinElev > 0.25 ? 'day' : sinElev > 0.0 ? 'golden' : sinElev > -0.10 ? 'twilight' : 'night';
    if (!this._serverDriven && ph !== this._phase) {
      this._phase = ph;
      if (!this._first && this.game.addChatMessage) {
        var msg = { day: '☀️ День.', golden: '🌅 Золотой час.', twilight: '🌆 Сумерки.', night: '🌙 Ночь опустилась на остров.' };
        this.game.addChatMessage(msg[ph], 'system');
      }
      this._first = false;
    }
  };

  DayNight.prototype.setPhase = function (ph) {       // вызывается серверным time_phase / welcome
    if (!ph || ph === this._phase) return;
    this._phase = ph; this._first = false;
    if (this.game && this.game.addChatMessage) {
      var msg = { day: '☀️ День.', golden: '🌅 Золотой час.', twilight: '🌆 Сумерки.', night: '🌙 Ночь опустилась на остров.' };
      if (msg[ph]) this.game.addChatMessage(msg[ph], 'system');
    }
  };

  DayNight.prototype.setWorldViewDistance = function (dist) {
    this.worldViewDistance = Math.max(160, Math.min(1200, parseFloat(dist) || 420));
    return this.worldViewDistance;
  };
  window.DayNight = DayNight;
})();