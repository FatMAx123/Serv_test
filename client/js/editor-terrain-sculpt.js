// ============================================================
//  EDITOR-TERRAIN-SCULPT.JS — «Кисть ландшафта» редактора сцены (только локально).
//
//  Как Sculpt в Unreal/Unity: поднять, опустить, сгладить, выровнять (flatten) и
//  «кисть отмены» — возвращает исходную высоту под кистью. Параметры: радиус, сила,
//  мягкость края. Пока зажата ЛКМ, кисть работает каждый кадр (Shift — инверсия
//  поднять/опустить). Мазок = одна запись Ctrl+Z / Ctrl+Y в общей истории редактора.
//
//  Меняется только Y вершин меша TerrainData (XZ и треугольники те же): сектора
//  обновляются на месте (Terrain.refreshVertices), нормали пересчитываются для вершин
//  мазка и их соседей, сетка bakedHeights сдвигается на ту же величину под правленными
//  треугольниками. Ничего не пишется на диск без кнопки «Сохранить рельеф»: сервер
//  (server/terrain-sculpt-writer.js) получает список «вершина → Y» и патчит
//  client/data/mesh/terrain.bin + client/js/terrain-data.js, сохраняя бэкап.
//
//  Подключается после editor.js (миксин в SceneEditor.prototype); в релиз не попадает
//  (build-client.js не берёт editor*).
// ============================================================
(function () {
  'use strict';
  var SE = window.SceneEditor;
  if (!SE || !SE.prototype) { console.warn('[sculpt] SceneEditor не найден'); return; }
  var P = SE.prototype;

  var GRID = 32;            // ячейка поиска вершин под кистью, м (ребро меша ~26 м)
  var RAISE_SPEED = 30;     // м/с при силе 100%
  var BLEND_SPEED = 7;      // 1/с: сглаживание / выравнивание / отмена при силе 100%
  var MODES = {
    raise: { label: '⬆ Поднять', color: 0x44ee77, hint: 'ЛКМ — поднять, Shift+ЛКМ — опустить' },
    lower: { label: '⬇ Опустить', color: 0xff5544, hint: 'ЛКМ — опустить, Shift+ЛКМ — поднять' },
    smooth: { label: '〰 Сгладить', color: 0x55bbff, hint: 'ЛКМ — сгладить неровности' },
    flatten: { label: '▭ Выровнять', color: 0xffcc33, hint: 'ЛКМ — выровнять по высоте точки, где начат мазок' },
    restore: { label: '↺ Кисть отмены', color: 0xcc77ff, hint: 'ЛКМ — вернуть исходную высоту (до правок кистью)' }
  };

  function TD() { return window.TerrainData; }
  function r2(v) { return Math.round(v * 100) / 100; }

  // ------------------------------------------------------------ данные меша
  function buildCore(d) {
    var pos = d.positions, idx = d.indices;
    var nV = (pos.length / 3) | 0, nT = (idx.length / 3) | 0;
    var i, v;
    // вершина → треугольники (CSR)
    var tStart = new Int32Array(nV + 1);
    for (i = 0; i < idx.length; i++) tStart[idx[i] + 1]++;
    for (v = 0; v < nV; v++) tStart[v + 1] += tStart[v];
    var tRef = new Int32Array(tStart[nV]);
    var cur = new Int32Array(nV);
    for (i = 0; i < idx.length; i++) { v = idx[i]; tRef[tStart[v] + cur[v]++] = (i / 3) | 0; }
    // сетка вершин по XZ (CSR)
    var gw = Math.ceil((d.maxX - d.minX) / GRID) + 1, gh = Math.ceil((d.maxZ - d.minZ) / GRID) + 1;
    var gStart = new Int32Array(gw * gh + 1);
    var cellOf = new Int32Array(nV);
    for (v = 0; v < nV; v++) {
      var cx = Math.max(0, Math.min(gw - 1, Math.floor((pos[v * 3] - d.minX) / GRID)));
      var cz = Math.max(0, Math.min(gh - 1, Math.floor((pos[v * 3 + 2] - d.minZ) / GRID)));
      cellOf[v] = cx * gh + cz;
      gStart[cellOf[v] + 1]++;
    }
    for (i = 0; i < gw * gh; i++) gStart[i + 1] += gStart[i];
    var gRef = new Int32Array(nV);
    var gCur = new Int32Array(gw * gh);
    for (v = 0; v < nV; v++) gRef[gStart[cellOf[v]] + gCur[cellOf[v]]++] = v;
    var baseY = new Float32Array(nV);
    for (v = 0; v < nV; v++) baseY[v] = pos[v * 3 + 1];
    return {
      d: d, nV: nV, nT: nT,
      tStart: tStart, tRef: tRef,
      gw: gw, gh: gh, gStart: gStart, gRef: gRef,
      baseY: baseY,                                              // как на диске (последнее сохранение)
      baseBaked: d.bakedHeights ? new Float32Array(d.bakedHeights) : null,
      origY: null, origBaked: null, origSource: 'загрузка',      // исходный рельеф для «кисти отмены»
      mark: new Int32Array(nV), markGen: 1,
      tMark: new Int32Array(nT), tGen: 1,
      bMark: d.bakedHeights ? new Int32Array(d.bakedHeights.length) : null, bGen: 1,
      rev: 0, snap: null, snapRev: -1
    };
  }

  P._sculptCore = function () {
    var d = TD();
    if (!d || !d.positions || !d.indices || !window.Terrain || !window.Terrain.refreshVertices) return null;
    var S = this._sculpt;
    if (S && S.core && S.core.d === d) return S.core;
    S = this._sculptState();
    S.core = buildCore(d);
    S.core.origY = new Float32Array(S.core.baseY);
    S.core.origBaked = S.core.baseBaked ? new Float32Array(S.core.baseBaked) : null;
    this._sculptLoadOriginal(S.core);
    return S.core;
  };

  P._sculptState = function () {
    if (!this._sculpt) {
      var saved = {};
      try { saved = JSON.parse(localStorage.getItem('ps_sculpt_brush') || '{}') || {}; } catch (_) {}
      this._sculpt = {
        mode: MODES[saved.mode] ? saved.mode : 'raise',
        radius: isFinite(saved.radius) ? saved.radius : 45,
        strength: isFinite(saved.strength) ? saved.strength : 0.5,
        falloff: isFinite(saved.falloff) ? saved.falloff : 0.5,
        core: null, stroke: null, ring: null, panel: null, saving: false
      };
    }
    return this._sculpt;
  };

  function persistBrush(S) {
    try { localStorage.setItem('ps_sculpt_brush', JSON.stringify({ mode: S.mode, radius: S.radius, strength: S.strength, falloff: S.falloff })); } catch (_) {}
  }

  /** Исходный меш с сервера (бэкап до первой правки) — «кисть отмены» и «вернуть всё». */
  P._sculptLoadOriginal = function (core) {
    var self = this;
    if (!window.fetch || !window.MeshBin) return;
    fetch('/api/editor/terrain-original', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
      .then(function (buf) {
        var o = window.MeshBin.decode(buf);
        if (!o || !o.positions || o.positions.length !== core.nV * 3) throw new Error('другая топология меша');
        var y = new Float32Array(core.nV);
        for (var v = 0; v < core.nV; v++) y[v] = o.positions[v * 3 + 1];
        core.origY = y;
        if (o.bakedHeights && core.baseBaked && o.bakedHeights.length === core.baseBaked.length) core.origBaked = new Float32Array(o.bakedHeights);
        core.origSource = 'бэкап сервера';
        self._sculptUpdateStatus();
      })
      .catch(function (e) {
        console.warn('[sculpt] исходный меш недоступен, «отмена» вернёт к загруженному:', e && e.message);
      });
  };

  // ------------------------------------------------------------ применение кисти
  function weightAt(dist, R, falloff) {
    if (dist >= R) return 0;
    var inner = R * (1 - falloff);
    if (dist <= inner) return 1;
    var t = 1 - (dist - inner) / Math.max(1e-6, R - inner);
    return t * t * (3 - 2 * t);
  }

  /** Вершины в круге: [vi...], [w...] */
  function gather(core, cx, cz, R, falloff) {
    var d = core.d, pos = d.positions;
    var x0 = Math.max(0, Math.floor((cx - R - d.minX) / GRID)), x1 = Math.min(core.gw - 1, Math.floor((cx + R - d.minX) / GRID));
    var z0 = Math.max(0, Math.floor((cz - R - d.minZ) / GRID)), z1 = Math.min(core.gh - 1, Math.floor((cz + R - d.minZ) / GRID));
    var vis = [], ws = [];
    for (var gx = x0; gx <= x1; gx++) {
      for (var gz = z0; gz <= z1; gz++) {
        var c = gx * core.gh + gz;
        for (var k = core.gStart[c]; k < core.gStart[c + 1]; k++) {
          var v = core.gRef[k];
          var w = weightAt(Math.hypot(pos[v * 3] - cx, pos[v * 3 + 2] - cz), R, falloff);
          if (w > 0) { vis.push(v); ws.push(w); }
        }
      }
    }
    return { vis: vis, ws: ws };
  }

  function neighborAvg(core, v) {
    var pos = core.d.positions, idx = core.d.indices, s = 0, n = 0;
    for (var k = core.tStart[v]; k < core.tStart[v + 1]; k++) {
      var t = core.tRef[k] * 3;
      for (var j = 0; j < 3; j++) {
        var u = idx[t + j];
        if (u !== v) { s += pos[u * 3 + 1]; n++; }
      }
    }
    return n ? s / n : pos[v * 3 + 1];
  }

  /**
   * Записать новые Y и довести всё остальное: bake-сетку (сдвиг на ту же величину под
   * треугольниками правленых вершин), нормали (вершины + соседи), сектора и индекс высот.
   * @param {number[]} vis вершины
   * @param {ArrayLike<number>} newY новые Y в том же порядке
   */
  function commitHeights(core, vis, newY) {
    var d = core.d, pos = d.positions, idx = d.indices;
    var changed = [], dY = new Map();
    var i, v;
    for (i = 0; i < vis.length; i++) {
      v = vis[i];
      var old = pos[v * 3 + 1];
      pos[v * 3 + 1] = newY[i];
      var nowY = pos[v * 3 + 1]; // float32
      if (nowY !== old) { changed.push(v); dY.set(v, nowY - old); }
    }
    if (!changed.length) return 0;
    core.rev++;

    // треугольники правленых вершин (без повторов)
    var tg = ++core.tGen, tris = [];
    for (i = 0; i < changed.length; i++) {
      v = changed[i];
      for (var k = core.tStart[v]; k < core.tStart[v + 1]; k++) {
        var t = core.tRef[k];
        if (core.tMark[t] !== tg) { core.tMark[t] = tg; tris.push(t); }
      }
    }

    // bakedHeights: та же дельта под треугольником (барицентрика в XZ), каждая ячейка — один раз
    var bh = d.bakedHeights;
    if (bh && core.bMark) {
      var bw = d.bakedW, bhh = d.bakedH;
      var sx = (d.maxX - d.minX) / (bw - 1), sz = (d.maxZ - d.minZ) / (bhh - 1);
      var bg = ++core.bGen;
      for (i = 0; i < tris.length; i++) {
        var t3 = tris[i] * 3;
        var ia = idx[t3], ib = idx[t3 + 1], ic = idx[t3 + 2];
        var da = dY.get(ia) || 0, db = dY.get(ib) || 0, dc = dY.get(ic) || 0;
        var ax = pos[ia * 3], az = pos[ia * 3 + 2], bx = pos[ib * 3], bz = pos[ib * 3 + 2], cx = pos[ic * 3], cz = pos[ic * 3 + 2];
        var den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(den) < 1e-9) continue;
        // только «смотрящие вверх» (как в TerrainHeight): ny = (b-a)×(c-a) по y
        var ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        if (!(ny > 0)) continue;
        var gx0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - d.minX) / sx)), gx1 = Math.min(bw - 1, Math.floor((Math.max(ax, bx, cx) - d.minX) / sx));
        var gz0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - d.minZ) / sz)), gz1 = Math.min(bhh - 1, Math.floor((Math.max(az, bz, cz) - d.minZ) / sz));
        for (var gx = gx0; gx <= gx1; gx++) {
          var px = d.minX + gx * sx;
          for (var gz = gz0; gz <= gz1; gz++) {
            var cell = gz * bw + gx;
            if (core.bMark[cell] === bg) continue;
            var pz = d.minZ + gz * sz;
            var l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / den;
            var l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / den;
            var l3 = 1 - l1 - l2;
            if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
            core.bMark[cell] = bg;
            bh[cell] += l1 * da + l2 * db + l3 * dc;
          }
        }
      }
    }

    // нормали: все вершины затронутых треугольников (как BufferGeometry.computeVertexNormals)
    var nrm = window.Terrain.getFullNormals();
    var mg = ++core.markGen, ring = [];
    for (i = 0; i < tris.length; i++) {
      for (var j = 0; j < 3; j++) {
        v = idx[tris[i] * 3 + j];
        if (core.mark[v] !== mg) { core.mark[v] = mg; ring.push(v); }
      }
    }
    if (nrm) {
      for (i = 0; i < ring.length; i++) {
        v = ring[i];
        var nx = 0, nyy = 0, nz = 0;
        for (var q = core.tStart[v]; q < core.tStart[v + 1]; q++) {
          var tt = core.tRef[q] * 3;
          var A = idx[tt] * 3, B = idx[tt + 1] * 3, C = idx[tt + 2] * 3;
          var cbx = pos[C] - pos[B], cby = pos[C + 1] - pos[B + 1], cbz = pos[C + 2] - pos[B + 2];
          var abx = pos[A] - pos[B], aby = pos[A + 1] - pos[B + 1], abz = pos[A + 2] - pos[B + 2];
          nx += cby * abz - cbz * aby;
          nyy += cbz * abx - cbx * abz;
          nz += cbx * aby - cby * abx;
        }
        var len = Math.hypot(nx, nyy, nz) || 1;
        nrm[v * 3] = nx / len; nrm[v * 3 + 1] = nyy / len; nrm[v * 3 + 2] = nz / len;
      }
    }
    window.Terrain.refreshVertices(ring);
    return changed.length;
  }

  P._sculptApply = function (cx, cz, dt, invert) {
    var S = this._sculptState(), core = this._sculptCore();
    if (!core || !isFinite(cx) || !isFinite(cz)) return 0;
    var g = gather(core, cx, cz, S.radius, S.falloff);
    if (!g.vis.length) return 0;
    var pos = core.d.positions, str = S.strength, mode = S.mode;
    if (invert && mode === 'raise') mode = 'lower';
    else if (invert && mode === 'lower') mode = 'raise';
    var out = new Float64Array(g.vis.length);
    var i, v, y, w, a;
    if (mode === 'smooth') {
      var avg = new Float64Array(g.vis.length);
      for (i = 0; i < g.vis.length; i++) avg[i] = neighborAvg(core, g.vis[i]); // по старым Y
      for (i = 0; i < g.vis.length; i++) {
        y = pos[g.vis[i] * 3 + 1];
        a = Math.min(1, g.ws[i] * str * BLEND_SPEED * dt);
        out[i] = y + (avg[i] - y) * a;
      }
    } else {
      for (i = 0; i < g.vis.length; i++) {
        v = g.vis[i]; y = pos[v * 3 + 1]; w = g.ws[i];
        if (mode === 'raise') out[i] = y + w * str * RAISE_SPEED * dt;
        else if (mode === 'lower') out[i] = y - w * str * RAISE_SPEED * dt;
        else {
          var target = mode === 'flatten' ? S.stroke.flattenY : core.origY[v];
          a = Math.min(1, w * str * BLEND_SPEED * dt);
          out[i] = Math.abs(target - y) < 0.01 ? target : y + (target - y) * a;
        }
      }
    }
    var n = commitHeights(core, g.vis, out);
    if (n && S.stroke) S.stroke.changed += n;
    return n;
  };

  // ------------------------------------------------------------ снимки для Ctrl+Z
  /** Снимок рельефа для общей истории редактора (кэш на ревизию — без копий на каждое действие). */
  P._terrainHeightsSnap = function () {
    var S = this._sculpt, core = S && S.core;
    if (!core || core.d !== TD()) return null; // кистью в этой сессии не правили
    if (core.snap && core.snapRev === core.rev) return core.snap;
    var pos = core.d.positions, y = new Float32Array(core.nV);
    for (var v = 0; v < core.nV; v++) y[v] = pos[v * 3 + 1];
    core.snap = { y: y, b: core.d.bakedHeights ? new Float32Array(core.d.bakedHeights) : null };
    core.snapRev = core.rev;
    return core.snap;
  };

  P._terrainHeightsRestore = function (snap) {
    var S = this._sculpt, core = S && S.core;
    if (!snap || !core || core.d !== TD() || snap.y.length !== core.nV) return;
    var pos = core.d.positions, vis = [], ys = [];
    for (var v = 0; v < core.nV; v++) {
      if (pos[v * 3 + 1] !== snap.y[v]) { vis.push(v); ys.push(snap.y[v]); }
    }
    commitHeights(core, vis, ys);
    if (snap.b && core.d.bakedHeights) core.d.bakedHeights.set(snap.b); // bake — точно как в снимке
    core.snap = snap; core.snapRev = core.rev;
    this._sculptScheduleSave();
    this._sculptUpdateStatus();
  };

  /** Рельеф изменён → общее автосохранение редактора (через 1.5 с; рельеф пишется вместе со сценой). */
  P._sculptScheduleSave = function () {
    if (typeof this._markDirtyAndScheduleSave === 'function') this._markDirtyAndScheduleSave(null);
  };

  // ------------------------------------------------------------ мазок
  P._sculptOnDown = function (e) {
    if (e.button !== 0) return false;
    var pt = this._raycastGround(e.clientX, e.clientY);
    if (!pt) return false;
    var S = this._sculptState();
    if (!this._sculptCore()) {
      if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Редактор] ⛰ Кисть ландшафта: меш террейна ещё не загружен', 'system');
      return false;
    }
    this.pushHistory('рельеф: ' + MODES[S.mode].label.replace(/^\S+\s/, ''));
    S.stroke = { x: pt.x, z: pt.z, flattenY: pt.y, invert: !!e.shiftKey, changed: 0, t: performance.now(), raf: 0 };
    var self = this;
    var tick = function () {
      var st = S.stroke;
      if (!st) return;
      var now = performance.now();
      var dt = Math.min(0.05, Math.max(0.001, (now - st.t) / 1000));
      st.t = now;
      self._sculptApply(st.x, st.z, dt, st.invert);
      self._sculptUpdateRing(st, st.invert);
      st.raf = requestAnimationFrame(tick);
    };
    self._sculptApply(pt.x, pt.z, 1 / 60, S.stroke.invert);
    S.stroke.raf = requestAnimationFrame(tick);
    var rig = (this.game && this.game.cameraRig) || window.cameraRig;
    if (rig) { rig._drag = false; rig._rmbDown = false; }
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    return true;
  };

  P._sculptOnMove = function (e) {
    var S = this._sculptState();
    if (this._isEventOverUI(e) && !S.stroke) { this._sculptHideRing(); return; }
    var pt = this._raycastGround(e.clientX, e.clientY);
    if (!pt) return;
    if (S.stroke) {
      S.stroke.x = pt.x; S.stroke.z = pt.z;
      S.stroke.invert = !!e.shiftKey;
      var rig = (this.game && this.game.cameraRig) || window.cameraRig;
      if (rig) { rig._drag = false; rig._rmbDown = false; }
    }
    this._sculptUpdateRing(pt, !!e.shiftKey);
  };

  /** true — мазок был и закончен. */
  P._sculptOnUp = function () {
    var S = this._sculpt;
    if (!S || !S.stroke) return false;
    var st = S.stroke;
    S.stroke = null;
    if (st.raf) cancelAnimationFrame(st.raf);
    if (!st.changed && this._undoStack && this._undoStack.length) {
      var top = this._undoStack[this._undoStack.length - 1];
      if (top && /^рельеф/.test(top.label || '')) { this._undoStack.pop(); this._updateHistoryButtons(); }
    }
    if (st.changed) this._sculptScheduleSave();
    this._sculptUpdateStatus();
    return true;
  };

  // ------------------------------------------------------------ круг-превью
  P._sculptHideRing = function () {
    var S = this._sculpt;
    if (S && S.ring) S.ring.visible = false;
  };

  function makeLoop(n, color, opacity) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    var m = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity, depthTest: false });
    var l = new THREE.LineLoop(g, m);
    l.frustumCulled = false;
    l.renderOrder = 999;
    return l;
  }

  function groundAt(x, z) {
    var T = window.Terrain;
    if (T && T.standY) { var s = T.standY(x, z); if (s && isFinite(s.ground)) return s.ground; }
    return T ? T.heightAt(x, z) : 0;
  }

  P._sculptUpdateRing = function (pt, invert) {
    var S = this._sculptState();
    if (!this.enabled || this.editorMode !== 'sculpt' || !pt) { this._sculptHideRing(); return; }
    if (!S.ring) {
      var grp = new THREE.Group();
      grp.name = '_sculptBrushRing';
      grp.add(makeLoop(72, 0xffffff, 0.95));
      grp.add(makeLoop(48, 0xffffff, 0.55));
      var dot = makeLoop(12, 0xffffff, 0.95);
      grp.add(dot);
      this.scene.add(grp);
      S.ring = grp;
    }
    var mode = S.mode;
    if (invert && mode === 'raise') mode = 'lower'; else if (invert && mode === 'lower') mode = 'raise';
    var col = MODES[mode].color;
    var radii = [S.radius, Math.max(0.5, S.radius * (1 - S.falloff)), Math.max(0.6, S.radius * 0.03)];
    for (var r = 0; r < 3; r++) {
      var loop = S.ring.children[r];
      var arr = loop.geometry.attributes.position.array, n = arr.length / 3;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * Math.PI * 2;
        var x = pt.x + Math.cos(a) * radii[r], z = pt.z + Math.sin(a) * radii[r];
        arr[i * 3] = x; arr[i * 3 + 1] = groundAt(x, z) + 0.6; arr[i * 3 + 2] = z;
      }
      loop.geometry.attributes.position.needsUpdate = true;
      loop.material.color.setHex(col);
    }
    S.ring.visible = true;
  };

  // ------------------------------------------------------------ сохранение / сброс
  P._sculptDirtyCount = function () {
    var S = this._sculpt, core = S && S.core;
    if (!core || core.d !== TD()) return 0;
    var pos = core.d.positions, n = 0;
    for (var v = 0; v < core.nV; v++) if (Math.fround(r2(pos[v * 3 + 1])) !== core.baseY[v]) n++;
    return n;
  };

  P.saveTerrainSculpt = function () {
    var self = this, S = this._sculptState(), core = this._sculptCore();
    if (!core || S.saving) return Promise.resolve(false);
    var pos = core.d.positions, verts = [], vis = [], ys = [], v;
    for (v = 0; v < core.nV; v++) {
      var y = r2(pos[v * 3 + 1]);
      if (Math.fround(y) !== core.baseY[v]) { verts.push([v, y]); }
      if (Math.fround(y) !== pos[v * 3 + 1]) { vis.push(v); ys.push(y); }
    }
    if (vis.length) commitHeights(core, vis, ys); // округление до 2 знаков, как в файле
    var baked = [], bh = core.d.bakedHeights;
    if (bh && core.baseBaked) {
      for (var i = 0; i < bh.length; i++) {
        var h = r2(bh[i]);
        bh[i] = h; // в памяти — ровно то, что ляжет на диск
        if (Math.fround(h) !== core.baseBaked[i]) baked.push([i, h]);
      }
    }
    if (!verts.length && !baked.length) { this._sculptToast('⛰ Рельеф не менялся — сохранять нечего'); return Promise.resolve(true); }
    S.saving = true;
    this._sculptUpdateStatus('⏳ Сохраняю ' + verts.length + ' вершин…');
    return fetch('/api/editor/terrain-sculpt', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verts: verts, baked: baked })
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'HTTP ' + r.status }; });
    }).then(function (res) {
      S.saving = false;
      if (!res || !res.ok) throw new Error((res && res.error) || 'сервер не сохранил');
      for (var j = 0; j < verts.length; j++) core.baseY[verts[j][0]] = verts[j][1];
      if (core.baseBaked) for (var k = 0; k < baked.length; k++) core.baseBaked[baked[k][0]] = baked[k][1];
      self._sculptUpdateStatus();
      self._sculptToast('✅ Рельеф сохранён: ' + res.verts + ' вершин → terrain.bin (?v=' + res.version + '), бэкап в ' + (res.backup && res.backup.snapshot));
      return true;
    }).catch(function (e) {
      S.saving = false;
      self._sculptUpdateStatus();
      self._sculptToast('❌ Рельеф не сохранён: ' + (e && e.message || e));
      return false;
    });
  };

  /** Вернуть весь рельеф к исходному (бэкап до первой правки). Отменяется Ctrl+Z; на диск — кнопкой «Сохранить». */
  P.resetTerrainSculptToOriginal = function () {
    var core = this._sculptCore();
    if (!core) return;
    var pos = core.d.positions, vis = [], ys = [];
    for (var v = 0; v < core.nV; v++) if (pos[v * 3 + 1] !== core.origY[v]) { vis.push(v); ys.push(core.origY[v]); }
    var bh = core.d.bakedHeights, bakedDiff = false;
    if (core.origBaked && bh) for (var i = 0; i < bh.length && !bakedDiff; i++) bakedDiff = bh[i] !== core.origBaked[i];
    if (!vis.length && !bakedDiff) { this._sculptToast('Рельеф уже исходный'); return; }
    this.pushHistory('рельеф: вернуть исходный');
    commitHeights(core, vis, ys);
    if (core.origBaked && core.d.bakedHeights) core.d.bakedHeights.set(core.origBaked);
    this._sculptScheduleSave();
    this._sculptUpdateStatus();
    this._sculptToast('↺ Весь рельеф возвращён к исходному (' + vis.length + ' вершин). Ctrl+Z — отменить.');
  };

  P._sculptToast = function (msg) {
    if (this.game && this.game.addChatMessage) this.game.addChatMessage('[Редактор] ' + msg, 'system');
    else console.log('[sculpt]', msg);
  };

  // ------------------------------------------------------------ панель
  P.setSculptMode = function (m) {
    var S = this._sculptState();
    if (!MODES[m]) return;
    S.mode = m; persistBrush(S); this._sculptSyncUI();
  };
  P.setSculptRadius = function (r) {
    var S = this._sculptState();
    S.radius = Math.max(8, Math.min(300, +r || 45)); persistBrush(S); this._sculptSyncUI();
  };
  P.setSculptStrength = function (s) {
    var S = this._sculptState();
    S.strength = Math.max(0.02, Math.min(1, +s || 0.5)); persistBrush(S); this._sculptSyncUI();
  };
  P.setSculptFalloff = function (f) {
    var S = this._sculptState();
    S.falloff = Math.max(0, Math.min(1, +f)); if (!isFinite(S.falloff)) S.falloff = 0.5;
    persistBrush(S); this._sculptSyncUI();
  };

  P._initTerrainSculptPanel = function (el) {
    if (!el) return;
    var S = this._sculptState();
    S.panel = el;
    el.setAttribute('data-no-paint', '1');
    var btn = 'flex:1; min-width:64px; padding:5px 3px; border-radius:4px; cursor:pointer; font-size:10.5px; font-family:inherit;';
    var row = 'display:flex; align-items:center; gap:6px; margin:5px 0; font-size:10.5px; color:#cfe0d6;';
    el.innerHTML =
      '<div style="color:#ffcc88; font-weight:bold; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">' +
        '<span>⛰ Кисть ландшафта (Sculpt)</span><span data-sc="dirty" style="font-size:10px; font-weight:normal; color:#aaccbb;"></span></div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:3px; margin-bottom:6px;">' +
        Object.keys(MODES).map(function (k) {
          return '<button data-sc-mode="' + k + '" style="' + btn + '">' + MODES[k].label + '</button>';
        }).join('') + '</div>' +
      '<div style="' + row + '"><span style="width:62px">Размер</span><input data-sc="radius" type="range" min="8" max="300" step="1" style="flex:1"><span data-sc="radius-v" style="width:46px; text-align:right"></span></div>' +
      '<div style="' + row + '"><span style="width:62px">Сила</span><input data-sc="strength" type="range" min="0.02" max="1" step="0.01" style="flex:1"><span data-sc="strength-v" style="width:46px; text-align:right"></span></div>' +
      '<div style="' + row + '"><span style="width:62px">Мягкость</span><input data-sc="falloff" type="range" min="0" max="1" step="0.01" style="flex:1"><span data-sc="falloff-v" style="width:46px; text-align:right"></span></div>' +
      '<div data-sc="hint" style="color:#99aacc; font-size:10px; line-height:1.4; margin:6px 0;"></div>' +
      '<div style="display:flex; gap:4px; margin-top:6px;">' +
        '<button data-sc="save" style="' + btn + ' background:#1f4a2a; color:#aaffcc; border:1px solid #44aa66; font-weight:bold;">💾 Сохранить рельеф</button>' +
        '<button data-sc="reset" style="' + btn + ' background:#3a1f44; color:#e6c6ff; border:1px solid #8855aa;" title="Вернуть весь рельеф к исходному мешу (до первой правки кистью). Ctrl+Z отменяет.">↺ Весь исходный</button>' +
      '</div>' +
      '<div data-sc="status" style="color:#8899aa; font-size:9.5px; line-height:1.4; margin-top:6px;"></div>';
    var self = this;
    el.querySelectorAll('[data-sc-mode]').forEach(function (b) {
      b.onclick = function () { self.setSculptMode(b.getAttribute('data-sc-mode')); };
    });
    el.querySelector('[data-sc="radius"]').oninput = function (e) { self.setSculptRadius(e.target.value); };
    el.querySelector('[data-sc="strength"]').oninput = function (e) { self.setSculptStrength(e.target.value); };
    el.querySelector('[data-sc="falloff"]').oninput = function (e) { self.setSculptFalloff(e.target.value); };
    el.querySelector('[data-sc="save"]').onclick = function () { self.saveTerrainSculpt(); };
    el.querySelector('[data-sc="reset"]').onclick = function () { self.resetTerrainSculptToOriginal(); };
    this._sculptSyncUI();
    window.addEventListener('beforeunload', function (ev) {
      if (self._sculptDirtyCount() > 0) { ev.preventDefault(); ev.returnValue = 'Рельеф не сохранён'; return ev.returnValue; }
    });
  };

  P._sculptSyncUI = function () {
    var S = this._sculptState(), el = S.panel;
    if (!el) return;
    el.querySelectorAll('[data-sc-mode]').forEach(function (b) {
      var on = b.getAttribute('data-sc-mode') === S.mode;
      var c = '#' + ('00000' + MODES[b.getAttribute('data-sc-mode')].color.toString(16)).slice(-6);
      b.style.background = on ? '#2b3a2e' : '#141c18';
      b.style.border = on ? '2px solid ' + c : '1px solid #33443a';
      b.style.color = on ? c : '#99aa9f';
      b.style.fontWeight = on ? 'bold' : 'normal';
    });
    var set = function (k, v, txt) {
      var i = el.querySelector('[data-sc="' + k + '"]'), t = el.querySelector('[data-sc="' + k + '-v"]');
      if (i && parseFloat(i.value) !== v) i.value = v;
      if (t) t.textContent = txt;
    };
    set('radius', S.radius, Math.round(S.radius) + ' м');
    set('strength', S.strength, Math.round(S.strength * 100) + '%');
    set('falloff', S.falloff, Math.round(S.falloff * 100) + '%');
    var h = el.querySelector('[data-sc="hint"]');
    if (h) h.innerHTML = MODES[S.mode].hint + '. <b>[ / ]</b> — размер, <b>Ctrl+Z / Ctrl+Y</b> — мазок назад/вперёд. ' +
      'Шаг сетки рельефа ~26 м: кисть меньше ~20 м может не задеть ни одной вершины.';
    this._sculptUpdateStatus();
  };

  P._sculptUpdateStatus = function (override) {
    var S = this._sculpt, el = S && S.panel;
    if (!el) return;
    var n = this._sculptDirtyCount();
    var dirty = el.querySelector('[data-sc="dirty"]');
    if (dirty) {
      dirty.textContent = n ? '● не сохранено: ' + n + ' верш.' : (S.core ? '✓ сохранено' : '');
      dirty.style.color = n ? '#ffbb55' : '#88ffbb';
    }
    var st = el.querySelector('[data-sc="status"]');
    if (st) {
      st.textContent = override || (S.core
        ? 'Меш: ' + S.core.nV + ' вершин · исходник для «отмены»: ' + S.core.origSource + ' · файл: client/data/mesh/terrain.bin'
        : 'Меш загрузится при первом мазке.');
    }
  };
})();
