// ============================================================
//  MESH-BIN-LOADER.JS — грузит terrain/volcano/mountains.bin (PLAN 4.7).
//  Worker, если есть; иначе decode на месте. Промис: window.__PS_MESH_BINS__.
// ============================================================
(function () {
  'use strict';
  function absUrl(rel) {
    try { return new URL(rel, location.href).href; } catch (_) { return rel; }
  }
  var JOBS = [
    { globalName: 'TerrainData', url: absUrl('data/mesh/terrain.bin?v=mesh-1') },
    { globalName: 'VolcanoData', url: absUrl('data/mesh/volcano.bin?v=mesh-1') },
    { globalName: 'MountainsData', url: absUrl('data/mesh/mountains.bin?v=mesh-1') }
  ];

  function assign(data) {
    if (!data) return;
    if (data.TerrainData) window.TerrainData = data.TerrainData;
    if (data.VolcanoData) window.VolcanoData = data.VolcanoData;
    if (data.MountainsData) window.MountainsData = data.MountainsData;
  }

  function decodeMain(buf) {
    if (!window.MeshBin || typeof window.MeshBin.decode !== 'function') {
      throw new Error('MeshBin.decode missing');
    }
    return window.MeshBin.decode(buf);
  }

  function fetchAllMain() {
    return Promise.all(JOBS.map(function (job) {
      return fetch(job.url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status + ' ' + job.url);
        return r.arrayBuffer();
      }).then(function (buf) {
        var obj = {};
        obj[job.globalName] = decodeMain(buf);
        return obj;
      });
    })).then(function (parts) {
      var data = {};
      parts.forEach(function (p) { Object.keys(p).forEach(function (k) { data[k] = p[k]; }); });
      return data;
    });
  }

  function viaWorker() {
    return new Promise(function (resolve, reject) {
      var w;
      try { w = new Worker('js/mesh-bin-worker.js?v=e47-2'); }
      catch (e) { reject(e); return; }
      var t = setTimeout(function () {
        try { w.terminate(); } catch (_) {}
        reject(new Error('mesh-bin worker timeout'));
      }, 20000);
      w.onmessage = function (ev) {
        clearTimeout(t);
        try { w.terminate(); } catch (_) {}
        if (!ev.data || !ev.data.ok) {
          reject(new Error((ev.data && ev.data.error) || 'mesh-bin worker fail'));
          return;
        }
        resolve(ev.data.data);
      };
      w.onerror = function (e) {
        clearTimeout(t);
        try { w.terminate(); } catch (_) {}
        reject(e);
      };
      w.postMessage({ jobs: JOBS });
    });
  }

  window.__PS_MESH_BINS__ = (function () {
    var p = (typeof Worker !== 'undefined' ? viaWorker() : fetchAllMain())
      .catch(function (e) {
        console.warn('[mesh-bin] worker failed, main thread:', e && e.message || e);
        return fetchAllMain();
      })
      .then(function (data) {
        assign(data);
        return data;
      });
    return p;
  })();
})();
