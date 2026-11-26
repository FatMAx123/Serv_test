// ============================================================
//  SHARED / RIVER-GEO.JS — уровень воды рек и озёр (UMD: браузер / Node).
//  Данные: лента воды [x, z, уровень, ширина влево, ширина вправо] по течению
//  (scripts/operators-territory/river-water.js → client/js/river-data.js и
//  shared/river-data.json). Глубже deepWalk — непроходимо, как море: переправа по
//  мостам (настил — проходимый проп) и мелким перекатам. Одна логика у сервера
//  (shared/geo.js) и клиента (player.js), иначе — откат позиции.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RiverGeo = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  var OVER = 2.4;      // ширина ленты в данных включает заход под берег
  var CELL = 24;
  var segs = [];       // { ax, az, bx, bz, sa, sb, nxa, nza, nxb, nzb, wla, wra, wlb, wrb }
  var grid = new Map();
  var deep = 1.25;
  var ready = false;

  function build(data) {
    segs = [];
    grid = new Map();
    ready = false;
    if (!data || !Array.isArray(data.rivers)) return false;
    if (typeof data.deepWalk === 'number' && data.deepWalk > 0) deep = data.deepWalk;
    for (var r = 0; r < data.rivers.length; r++) {
      var pts = data.rivers[r] && data.rivers[r].pts;
      if (!pts || pts.length < 2) continue;
      var nrm = [];
      for (var i = 0; i < pts.length; i++) {
        var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        var tx = b[0] - a[0], tz = b[1] - a[1], L = Math.sqrt(tx * tx + tz * tz) || 1;
        nrm.push([tz / L, -tx / L]);
      }
      for (var j = 0; j < pts.length - 1; j++) {
        var p = pts[j], q = pts[j + 1];
        var sg = {
          ax: p[0], az: p[1], bx: q[0], bz: q[1], sa: p[2], sb: q[2],
          nxa: nrm[j][0], nza: nrm[j][1], nxb: nrm[j + 1][0], nzb: nrm[j + 1][1],
          wla: Math.max(0, p[3] - OVER), wra: Math.max(0, p[4] - OVER), wlb: Math.max(0, q[3] - OVER), wrb: Math.max(0, q[4] - OVER)
        };
        var id = segs.length;
        segs.push(sg);
        var reach = Math.max(sg.wla, sg.wra, sg.wlb, sg.wrb) + 4;
        var x0 = Math.floor((Math.min(p[0], q[0]) - reach) / CELL), x1 = Math.floor((Math.max(p[0], q[0]) + reach) / CELL);
        var z0 = Math.floor((Math.min(p[1], q[1]) - reach) / CELL), z1 = Math.floor((Math.max(p[1], q[1]) + reach) / CELL);
        for (var cx = x0; cx <= x1; cx++) {
          for (var cz = z0; cz <= z1; cz++) {
            var key = cx * 100003 + cz;
            var arr = grid.get(key);
            if (!arr) { arr = []; grid.set(key, arr); }
            arr.push(id);
          }
        }
      }
    }
    ready = segs.length > 0;
    return ready;
  }

  /** Уровень воды в точке или null (вне ширины разлива). */
  function levelAt(x, z) {
    if (!ready) return null;
    var list = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!list) return null;
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var s = segs[list[i]];
      var dx = s.bx - s.ax, dz = s.bz - s.az, L2 = dx * dx + dz * dz || 1;
      var t = ((x - s.ax) * dx + (z - s.az) * dz) / L2;
      if (t < -0.05 || t > 1.05) continue;
      t = Math.max(0, Math.min(1, t));
      var px = s.ax + dx * t, pz = s.az + dz * t;
      var nx = s.nxa + (s.nxb - s.nxa) * t, nz = s.nza + (s.nzb - s.nza) * t;
      var lat = (x - px) * nx + (z - pz) * nz;
      var w = lat >= 0 ? (s.wra + (s.wrb - s.wra) * t) : (s.wla + (s.wlb - s.wla) * t);
      var ad = Math.abs(lat);
      if (ad > w) continue;
      var d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (d2 < bestD) { bestD = d2; best = s.sa + (s.sb - s.sa) * t; }
    }
    return best;
  }

  /** Глубина воды над землёй groundY (0 — суша). */
  function depthAt(x, z, groundY) {
    var lv = levelAt(x, z);
    if (lv == null || !isFinite(groundY)) return 0;
    return Math.max(0, lv - groundY);
  }

  /** Глубокая вода — непроходимо (кроме настила моста, его проверяет вызывающий). */
  function isDeep(x, z, groundY) {
    return depthAt(x, z, groundY) > deep;
  }

  /**
   * Шаг a→b по воде: false — запрещён. Из глубины можно идти, не углубляясь (выбраться на берег).
   */
  function stepAllowed(ax, az, ga, bx, bz, gb) {
    var db = depthAt(bx, bz, gb);
    if (db <= deep) return true;
    var da = depthAt(ax, az, ga);
    // уже в глубине (телепорт, падение с моста): можно идти, пока глубина не растёт — к берегу
    return da > deep && db <= da + 0.05;
  }

  if (typeof window !== 'undefined' && window.RiverData) {
    try { build(window.RiverData); } catch (e) { /* без рек — как раньше */ }
  }

  /** Node: загрузить shared/river-data.json; null — нет файла или данных (без рек — как раньше). */
  function loadFile(file) {
    try {
      var fs = require('fs');
      if (!fs.existsSync(file)) return null;
      return build(JSON.parse(fs.readFileSync(file, 'utf8'))) ? api : null;
    } catch (e) {
      return null;
    }
  }

  var api = {
    build: build, loadFile: loadFile, levelAt: levelAt, depthAt: depthAt, isDeep: isDeep, stepAllowed: stepAllowed,
    get deepWalk() { return deep; }, get ready() { return ready; }
  };
  return api;
});
