const fs = require('fs');
// In node we can parse GLTF JSON header directly
const glbBuffer = fs.readFileSync('client/assets/weapons/novice.glb');
console.log('GLB size:', glbBuffer.length);
// Read GLB header: magic 0x46546C67, version, length
const magic = glbBuffer.readUInt32LE(0);
console.log('Magic:', magic.toString(16)); // should be 46546c67 ("glTF")
const version = glbBuffer.readUInt32LE(4);
const length = glbBuffer.readUInt32LE(8);
const jsonChunkLength = glbBuffer.readUInt32LE(12);
const jsonChunkType = glbBuffer.readUInt32LE(16);
const jsonStr = glbBuffer.toString('utf8', 20, 20 + jsonChunkLength);
const gltf = JSON.parse(jsonStr);

console.log('Nodes in novice.glb:');
gltf.nodes.forEach((n, idx) => console.log(`  node ${idx}: name=${n.name}, mesh=${n.mesh}, children=${JSON.stringify(n.children)}`));
console.log('Meshes in novice.glb:');
gltf.meshes.forEach((m, idx) => console.log(`  mesh ${idx}: name=${m.name}, primitives=${m.primitives.length}`));
