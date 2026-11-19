const fs = require('fs');

// Simple script to read GLB JSON chunk and inspect animations
const buf = fs.readFileSync('D:/games/yandex/лайнэйдж/project-steam1/client/assets/Characters/engi/Woman/woman.glb');
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const length = buf.readUInt32LE(8);
const chunk0Length = buf.readUInt32LE(12);
const chunk0Type = buf.readUInt32LE(16);

console.log('GLB Magic:', magic.toString(16), 'Version:', version, 'Length:', length);

const jsonStr = buf.toString('utf8', 20, 20 + chunk0Length);
const gltf = JSON.parse(jsonStr);

console.log('Nodes count:', gltf.nodes ? gltf.nodes.length : 0);
console.log('Meshes count:', gltf.meshes ? gltf.meshes.length : 0);
console.log('Animations count:', gltf.animations ? gltf.animations.length : 0);

if (gltf.animations) {
  gltf.animations.forEach((anim, i) => {
    console.log(`\nAnim [${i}] name: "${anim.name}", channels: ${anim.channels ? anim.channels.length : 0}, samplers: ${anim.samplers ? anim.samplers.length : 0}`);
    if (anim.name === 'area_attack_1' || anim.name === 'sit_loop' || anim.name === 'idle') {
      anim.channels.forEach(ch => {
        const targetNode = gltf.nodes[ch.target.node];
        const nodeName = targetNode ? targetNode.name : `node_${ch.target.node}`;
        console.log(`   channel target: ${nodeName}.${ch.target.path}`);
      });
    }
  });
}

