const fs = require('fs');

const buf = fs.readFileSync('client/assets/weapons/novice.glb');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
const binOffset = 20 + jsonLen + 8;

// Find position accessor
const mesh = gltf.meshes[0];
const posIdx = mesh.primitives[0].attributes.POSITION;
const acc = gltf.accessors[posIdx];
const bv = gltf.bufferViews[acc.bufferView];
const offset = binOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);

console.log('Total vertices:', acc.count);
console.log('Bounds:', acc.min, acc.max);

const vertices = [];
for (let i = 0; i < acc.count; i++) {
  const x = buf.readFloatLE(offset + i * 12);
  const y = buf.readFloatLE(offset + i * 12 + 4);
  const z = buf.readFloatLE(offset + i * 12 + 8);
  vertices.push({ x, y, z });
}

// Check slices along Z:
// min Z is -0.845, max Z is +0.094
const slices = 10;
const zRange = acc.max[2] - acc.min[2];
for (let s = 0; s < slices; s++) {
  const zStart = acc.min[2] + (s / slices) * zRange;
  const zEnd = acc.min[2] + ((s + 1) / slices) * zRange;
  const inSlice = vertices.filter(v => v.z >= zStart && v.z < zEnd);
  if (inSlice.length) {
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    inSlice.forEach(v => {
      if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    });
    const width = maxX - minX;
    console.log(`Slice ${s} [z: ${zStart.toFixed(2)} .. ${zEnd.toFixed(2)}]: count=${inSlice.length}, width=${width.toFixed(3)}`);
  }
}

