// ============================================================
//  MESH-BIN.JS — decode PSMESH01 (PLAN 4.7). UMD: worker / browser / Node.
// ============================================================
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeshBin = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis), function () {
  'use strict';

  var MAGIC = 'PSMESH01';

  function u32(view, o) { return view.getUint32(o, true); }

  function restore(node, blobs) {
    if (!node || typeof node !== 'object') return node;
    if (!Array.isArray(node) && Object.prototype.hasOwnProperty.call(node, '$b')) {
      return blobs[node.$b | 0];
    }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) node[i] = restore(node[i], blobs);
      return node;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) node[keys[k]] = restore(node[keys[k]], blobs);
    return node;
  }

  function decode(buf) {
    if (!buf) throw new Error('mesh-bin: empty');
    var bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var mag = '';
    for (var i = 0; i < 8; i++) mag += String.fromCharCode(bytes[i]);
    if (mag !== MAGIC) throw new Error('mesh-bin: bad magic ' + mag);
    var o = 8;
    var metaLen = u32(view, o); o += 4;
    var metaStr = '';
    if (typeof TextDecoder !== 'undefined') {
      metaStr = new TextDecoder('utf-8').decode(bytes.subarray(o, o + metaLen));
    } else {
      metaStr = Buffer.from(bytes.subarray(o, o + metaLen)).toString('utf8');
    }
    o += metaLen;
    var meta = JSON.parse(metaStr);
    var nBlobs = u32(view, o); o += 4;
    var blobs = new Array(nBlobs);
    for (var b = 0; b < nBlobs; b++) {
      var dtype = bytes[o]; o += 1;
      var count = u32(view, o); o += 4;
      var byteLen = count * 4;
      var slice = bytes.buffer.slice(bytes.byteOffset + o, bytes.byteOffset + o + byteLen);
      o += byteLen;
      blobs[b] = dtype === 1 ? new Uint32Array(slice) : new Float32Array(slice);
    }
    return restore(meta, blobs);
  }

  function loadFileSync(fs, filePath) {
    var raw = fs.readFileSync(filePath);
    var buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    return decode(buf);
  }

  return { MAGIC: MAGIC, decode: decode, loadFileSync: loadFileSync };
});
