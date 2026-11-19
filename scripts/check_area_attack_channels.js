const fs = require('fs');

const buf = fs.readFileSync('D:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman.glb');
const chunk0Length = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + chunk0Length));
const binChunkOffset = 20 + chunk0Length + 8; // chunk1 type & length is 8 bytes

function getAccessorData(accessorIdx) {
  const acc = gltf.accessors[accessorIdx];
  const bv = gltf.bufferViews[acc.bufferView];
  const byteOffset = binChunkOffset + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const count = acc.count;
  
  if (acc.componentType === 5126) { // FLOAT
    const numComponents = acc.type === 'SCALAR' ? 1 : acc.type === 'VEC3' ? 3 : acc.type === 'VEC4' ? 4 : 0;
    const floats = [];
    for (let i = 0; i < count * numComponents; i++) {
      floats.push(buf.readFloatLE(byteOffset + i * 4));
    }
    return { acc, floats, numComponents };
  }
  return { acc };
}

// Find area_attack_1
const areaAnim = gltf.animations.find(a => a.name === 'area_attack_1');
console.log('area_attack_1 found:', !!areaAnim);

if (areaAnim) {
  areaAnim.channels.forEach(ch => {
    const targetNode = gltf.nodes[ch.target.node];
    const nodeName = targetNode ? targetNode.name : `node_${ch.target.node}`;
    const sampler = areaAnim.samplers[ch.sampler];
    const outputData = getAccessorData(sampler.output);
    
    if (ch.target.path === 'translation' || ch.target.path === 'scale') {
      if (nodeName.includes('Hips') || nodeName.includes('Armature')) {
        console.log(`[${nodeName}.${ch.target.path}]: count=${outputData.acc.count}, sample=${JSON.stringify(outputData.floats.slice(0, 9))}`);
      }
    }
  });
}
