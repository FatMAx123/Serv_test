const fs = require('fs');
const path = require('path');

function inspectGlb(glbPath) {
  const buf = fs.readFileSync(glbPath);
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.toString('utf8', 20, 20 + jsonLen);
  const gltf = JSON.parse(jsonStr);
  const binOffset = 20 + jsonLen + 8;
  const binData = buf.slice(binOffset);

  // Find mesh positions
  console.log(`=== ${path.basename(glbPath)} ===`);
  const accessors = gltf.accessors || [];
  const bufferViews = gltf.bufferViews || [];

  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const posAccIdx = prim.attributes.POSITION;
      if (posAccIdx !== undefined) {
        const acc = accessors[posAccIdx];
        console.log(`  Mesh ${mesh.name}: min = ${JSON.stringify(acc.min)}, max = ${JSON.stringify(acc.max)}`);
        // Find which axis has largest extent (shaft axis)
        const dx = acc.max[0] - acc.min[0];
        const dy = acc.max[1] - acc.min[1];
        const dz = acc.max[2] - acc.min[2];
        console.log(`  Extents: X=${dx.toFixed(3)}, Y=${dy.toFixed(3)}, Z=${dz.toFixed(3)}`);
      }
    }
  }
}

const weaps = ['novice.glb', 'atuba_mace.glb', 'magic_mace.glb', 'tears_fairy.glb', 'demon_staff.glb'];
weaps.forEach(w => {
  const p = path.join('client/assets/weapons', w);
  if (fs.existsSync(p)) inspectGlb(p);
});

