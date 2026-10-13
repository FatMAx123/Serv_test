// ============================================================
//  MENU-BG.JS — plate cover (без полос) + дым только с 2 труб
//  над серебристой бочкой справа. Без облаков, без анимации воды.
// ============================================================
(function () {
  'use strict';

  // Single plate (layers/far_soft + occluder were removed — avoid 404s)
  var MASTER = 'assets/menu/bg_menu.webp';
  var VENTS_URL = 'assets/menu/layers/vents.json';

  function LiveBg(host) {
    this.host = host;
    host.innerHTML = '';
    host.classList.add('mm-live-bg');

    // soft far = same plate, lighter parallax (no separate far_soft asset)
    this.far = document.createElement('div');
    this.far.className = 'mm-depth mm-depth-far';
    this.far.style.backgroundImage = 'url(' + MASTER + ')';

    this.base = document.createElement('div');
    this.base.className = 'mm-depth mm-depth-base';
    this.base.style.backgroundImage = 'url(' + MASTER + ')';

    this.fxCv = document.createElement('canvas');
    this.fxCv.className = 'mm-depth mm-fx-cv';

    this.vig = document.createElement('div');
    this.vig.className = 'mm-depth mm-vig';

    host.appendChild(this.far);
    host.appendChild(this.base);
    host.appendChild(this.fxCv);
    host.appendChild(this.vig);

    this.fctx = this.fxCv.getContext('2d');
    this.w = 1;
    this.h = 1;
    this.t = 0;
    this.mx = 0.5; this.my = 0.5;
    this.tx = 0.5; this.ty = 0.5;
    this._last = performance.now();

    // 2 трубы рядом над бочкой — чуть правее
    this.vents = [
      { x: 0.860, y: 0.70, s: 1.15 },
      { x: 0.873, y: 0.698, s: 1.15 }
    ];
    var self = this;
    fetch(VENTS_URL).then(function (r) { return r.json(); }).then(function (j) {
      if (Array.isArray(j) && j.length) self.vents = j;
      self._seedSteam();
    }).catch(function () { self._seedSteam(); });

    this.steam = [];
    this.dust = [];
    this._seedSteam();
    this._seedDust();

    window.addEventListener('pointermove', function (e) {
      self.tx = e.clientX / Math.max(1, innerWidth);
      self.ty = e.clientY / Math.max(1, innerHeight);
    }, { passive: true });
    window.addEventListener('resize', function () { self._resize(); });

    this._resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  LiveBg.prototype._seedSteam = function () {
    this.steam = [];
    // больше частиц = гуще/длиннее шлейф
    var n = this.vents.length * 28;
    for (var i = 0; i < n; i++) {
      this.steam.push(this._mkSteam(this.vents[i % this.vents.length], true));
    }
  };

  LiveBg.prototype._seedDust = function () {
    this.dust = [];
    for (var i = 0; i < 36; i++) {
      this.dust.push({
        x: Math.random(), y: Math.random() * 0.6,
        r: 0.5 + Math.random() * 1.4,
        sp: 0.01 + Math.random() * 0.025,
        ph: Math.random() * Math.PI * 2,
        a: 0.1 + Math.random() * 0.22
      });
    }
  };

  LiveBg.prototype._mkSteam = function (v, rand) {
    return {
      v: v,
      // узкий старт, длинный подъём
      x: v.x + (Math.random() - 0.5) * 0.002,
      y: v.y + Math.random() * 0.0015,
      vx: (Math.random() - 0.2) * 0.0001,
      vy: -0.00042 - Math.random() * 0.00038,
      life: rand ? Math.random() * 0.65 : 0,
      max: 1.35 + Math.random() * 1.1,
      r: (4 + Math.random() * 9) * (v.s || 1)
    };
  };

  LiveBg.prototype._resize = function () {
    var dpr = Math.min(devicePixelRatio || 1, 2);
    var r = this.host.getBoundingClientRect();
    this.w = Math.max(1, r.width | 0);
    this.h = Math.max(1, r.height | 0);
    this.fxCv.width = this.w * dpr;
    this.fxCv.height = this.h * dpr;
    this.fxCv.style.width = '100%';
    this.fxCv.style.height = '100%';
    this.fctx = this.fxCv.getContext('2d');
    this.fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  LiveBg.prototype._loop = function (now) {
    var dt = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    this.t += dt;

    this.mx += (this.tx - this.mx) * 0.03;
    this.my += (this.ty - this.my) * 0.03;
    var px = (this.mx - 0.5) * 2;
    var py = (this.my - 0.5) * 2;
    // cover: лёгкий scale чтобы parallax не показывал края
    var sc = 1.04;

    this.far.style.transform =
      'translate3d(' + (-px * 4).toFixed(2) + 'px,' + (-py * 1.5).toFixed(2) + 'px,0) scale(1.06)';
    this.base.style.transform =
      'translate3d(' + (-px * 8).toFixed(2) + 'px,' + (-py * 3).toFixed(2) + 'px,0) scale(' + sc + ')';

    this._drawFx(dt);
    requestAnimationFrame(this._loop);
  };

  LiveBg.prototype._drawFx = function (dt) {
    var ctx = this.fctx, w = this.w, h = this.h, i, p, a, gx, gy;
    ctx.clearRect(0, 0, w, h);

    // --- steam only from 2 vents ---
    for (i = 0; i < this.steam.length; i++) {
      p = this.steam[i];
      p.life += dt / p.max;
      p.x += p.vx * 60 * dt + Math.sin(this.t * 0.8 + i) * 0.00002;
      p.y += p.vy * 60 * dt;
      p.r += 3.4 * dt;
      if (p.life >= 1) {
        this.steam[i] = this._mkSteam(this.vents[i % this.vents.length], false);
        continue;
      }
      // дольше держим видимость в середине жизни
      a = Math.sin(Math.min(1, p.life) * Math.PI) * 0.38;
      if (p.life < 0.05) a *= p.life / 0.05;
      if (a < 0.01) continue;
      gx = p.x * w;
      gy = p.y * h;
      var g = ctx.createRadialGradient(gx, gy, 0, gx, gy, p.r);
      g.addColorStop(0, 'rgba(250,248,245,' + (a * 0.98) + ')');
      g.addColorStop(0.35, 'rgba(220,216,210,' + (a * 0.48) + ')');
      g.addColorStop(1, 'rgba(180,175,170,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // light dust only
    for (i = 0; i < this.dust.length; i++) {
      p = this.dust[i];
      p.x += p.sp * dt * 0.12;
      p.y += Math.sin(this.t * 0.6 + p.ph) * 0.0002;
      if (p.x > 1.05) { p.x = -0.04; p.y = Math.random() * 0.55; }
      a = p.a * (0.4 + 0.6 * Math.sin(this.t * 1.6 + p.ph));
      ctx.fillStyle = 'rgba(255,236,200,' + a + ')';
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  window.MenuLiveBg = {
    mount: function (sel) {
      var host = typeof sel === 'string' ? document.querySelector(sel) : sel;
      if (!host) return null;
      return new LiveBg(host);
    }
  };
})();
