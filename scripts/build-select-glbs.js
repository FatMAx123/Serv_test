'use strict';
/**
 * Generate ultra-lightweight character-select GLBs (idle clip only) from man.glb / woman.glb.
 * Keeps 100% identical Draco mesh, vertices, skeleton, bone names, materials, and images,
 * while pruning the 30 combat/emote animation clips so character-select loads >10x faster.
 */
const fs = require('fs');
const path = require('path');

function pruneGlbKeepAnims(srcPath, dstPath, keepAnimPredicate) {
  const buf = fs.readFileSync(srcPath);
  if (buf.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB file: ' + srcPath);
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error('Unsupported glTF version: ' + version);

  let offset = 12;
  let gltf = null;
  let binBuf = Buffer.alloc(0);
  while (offset + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    const chunkData = buf.subarray(offset + 8, offset + 8 + chunkLen);
    if (chunkType === 0x4E4F534A) { // JSON
      gltf = JSON.parse(chunkData.toString('utf8'));
    } else if (chunkType === 0x004E4942) { // BIN
      binBuf = chunkData;
    }
    offset += 8 + chunkLen;
  }
  if (!gltf) throw new Error('Missing JSON chunk in ' + srcPath);

  const origAnims = Array.isArray(gltf.animations) ? gltf.animations : [];
  gltf.animations = origAnims.filter((a) => keepAnimPredicate(a));

  // Collect all reachable accessors
  const usedAccessors = new Set();
  const addAcc = (i) => { if (Number.isInteger(i) && i >= 0) usedAccessors.add(i); };

  for (const m of (gltf.meshes || [])) {
    for (const p of (m.primitives || [])) {
      addAcc(p.indices);
      if (p.attributes) Object.values(p.attributes).forEach(addAcc);
      for (const t of (p.targets || [])) Object.values(t).forEach(addAcc);
    }
  }
  for (const s of (gltf.skins || [])) {
    addAcc(s.inverseBindMatrices);
  }
  for (const a of gltf.animations) {
    for (const s of (a.samplers || [])) {
      addAcc(s.input);
      addAcc(s.output);
    }
  }

  // Remap accessors & collect used bufferViews
  const oldAccessors = gltf.accessors || [];
  const oldBufferViews = gltf.bufferViews || [];
  const accMap = new Map();
  const newAccessors = [];
  const usedBufferViews = new Set();

  const sortedAccs = [...usedAccessors].sort((a, b) => a - b);
  for (const oldIdx of sortedAccs) {
    const acc = oldAccessors[oldIdx];
    if (!acc) continue;
    accMap.set(oldIdx, newAccessors.length);
    newAccessors.push(acc);
    if (Number.isInteger(acc.bufferView)) usedBufferViews.add(acc.bufferView);
    if (acc.sparse) {
      if (acc.sparse.indices && Number.isInteger(acc.sparse.indices.bufferView)) usedBufferViews.add(acc.sparse.indices.bufferView);
      if (acc.sparse.values && Number.isInteger(acc.sparse.values.bufferView)) usedBufferViews.add(acc.sparse.values.bufferView);
    }
  }

  // Include bufferViews referenced by images or Draco extension
  for (const img of (gltf.images || [])) {
    if (Number.isInteger(img.bufferView)) usedBufferViews.add(img.bufferView);
  }
  for (const m of (gltf.meshes || [])) {
    for (const p of (m.primitives || [])) {
      const draco = p.extensions && p.extensions.KHR_draco_mesh_compression;
      if (draco && Number.isInteger(draco.bufferView)) usedBufferViews.add(draco.bufferView);
    }
  }

  // Rebuild bufferViews & BIN chunk cleanly (4-byte aligned per slice)
  const bvMap = new Map();
  const newBufferViews = [];
  const binChunks = [];
  let binByteOffset = 0;

  const sortedBvs = [...usedBufferViews].sort((a, b) => a - b);
  for (const oldBvIdx of sortedBvs) {
    const bv = Object.assign({}, oldBufferViews[oldBvIdx]);
    const start = bv.byteOffset || 0;
    const len = bv.byteLength || 0;
    const slice = binBuf.subarray(start, start + len);
    const pad = (4 - (len % 4)) % 4;
    bv.buffer = 0;
    bv.byteOffset = binByteOffset;
    bvMap.set(oldBvIdx, newBufferViews.length);
    newBufferViews.push(bv);
    binChunks.push(slice);
    if (pad > 0) binChunks.push(Buffer.alloc(pad));
    binByteOffset += len + pad;
  }

  // Rewrite indices across GLTF
  for (const acc of newAccessors) {
    if (Number.isInteger(acc.bufferView)) acc.bufferView = bvMap.get(acc.bufferView);
    if (acc.sparse) {
      if (acc.sparse.indices && Number.isInteger(acc.sparse.indices.bufferView)) {
        acc.sparse.indices.bufferView = bvMap.get(acc.sparse.indices.bufferView);
      }
      if (acc.sparse.values && Number.isInteger(acc.sparse.values.bufferView)) {
        acc.sparse.values.bufferView = bvMap.get(acc.sparse.values.bufferView);
      }
    }
  }
  for (const img of (gltf.images || [])) {
    if (Number.isInteger(img.bufferView)) img.bufferView = bvMap.get(img.bufferView);
  }
  for (const m of (gltf.meshes || [])) {
    for (const p of (m.primitives || [])) {
      if (Number.isInteger(p.indices)) p.indices = accMap.get(p.indices);
      if (p.attributes) {
        for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
      }
      for (const t of (p.targets || [])) {
        for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
      }
      const draco = p.extensions && p.extensions.KHR_draco_mesh_compression;
      if (draco && Number.isInteger(draco.bufferView)) {
        draco.bufferView = bvMap.get(draco.bufferView);
      }
    }
  }
  for (const s of (gltf.skins || [])) {
    if (Number.isInteger(s.inverseBindMatrices)) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
  }
  for (const a of gltf.animations) {
    for (const s of (a.samplers || [])) {
      if (Number.isInteger(s.input)) s.input = accMap.get(s.input);
      if (Number.isInteger(s.output)) s.output = accMap.get(s.output);
    }
  }

  gltf.accessors = newAccessors;
  gltf.bufferViews = newBufferViews;
  const finalBin = Buffer.concat(binChunks);
  gltf.buffers = [{ byteLength: finalBin.length }];

  const rawJson = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (rawJson.length % 4)) % 4;
  const paddedJson = jsonPad ? Buffer.concat([rawJson, Buffer.alloc(jsonPad, 0x20)]) : rawJson;

  const totalLen = 12 + 8 + paddedJson.length + 8 + finalBin.length;
  const out = Buffer.alloc(totalLen);
  out.write('glTF', 0, 4, 'ascii');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLen, 8);
  out.writeUInt32LE(paddedJson.length, 12);
  out.writeUInt32LE(0x4E4F534A, 16);
  paddedJson.copy(out, 20);
  const binHdr = 20 + paddedJson.length;
  out.writeUInt32LE(finalBin.length, binHdr);
  out.writeUInt32LE(0x004E4942, binHdr + 4);
  finalBin.copy(out, binHdr + 8);

  fs.writeFileSync(dstPath, out);
  return {
    srcBytes: buf.length,
    dstBytes: out.length,
    animsBefore: origAnims.length,
    animsAfter: gltf.animations.length,
    keptNames: gltf.animations.map((a) => a.name)
  };
}

const ROOT = path.resolve(__dirname, '..');
const JOBS = [
  {
    src: path.join(ROOT, 'client/assets/Characters/engi/man/man.glb'),
    dst: path.join(ROOT, 'client/assets/Characters/engi/man/man_select.glb')
  },
  {
    src: path.join(ROOT, 'client/assets/Characters/engi/Woman/woman.glb'),
    dst: path.join(ROOT, 'client/assets/Characters/engi/Woman/woman_select.glb')
  }
];

for (const job of JOBS) {
  const res = pruneGlbKeepAnims(job.src, job.dst, (a) => /^(idle|sword_slash)$/i.test(String(a && a.name || '').trim()));
  console.log(path.basename(job.dst), res);
}

