// PLAN 4.7: decode mesh bins off the main thread.
importScripts('./mesh-bin.js?v=e47-2');

self.onmessage = function (ev) {
  var jobs = (ev.data && ev.data.jobs) || [];
  var out = {};
  var err = null;
  try {
    var pending = jobs.length;
    if (!pending) { self.postMessage({ ok: true, data: out }); return; }
    jobs.forEach(function (job) {
      fetch(job.url, { cache: 'force-cache' }).then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status + ' ' + job.url);
        return r.arrayBuffer();
      }).then(function (buf) {
        out[job.globalName] = self.MeshBin.decode(buf);
        pending--;
        if (pending === 0) self.postMessage({ ok: true, data: out });
      }).catch(function (e) {
        err = String(e && e.message || e);
        self.postMessage({ ok: false, error: err, failed: job.url });
      });
    });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e && e.message || e) });
  }
};
