const fs = require('fs');
const path = require('path');

const EMOJI_ACTIONS = new Set([
  'sit_down', 'sit_loop', 'stand_up', 'bow', 'clap', 'dance',
  'heart_pose', 'laugh', 'complain', 'afraid', 'warm_up'
]);

const TARGET_X = 0.002;
const TARGET_Y = 0.564;
const TARGET_Z = -0.002;

function calibrateGlbFile(filePath) {
  console.log(`\n========================================`);
  console.log(`Calibrating GLB: ${filePath}`);
  console.log(`========================================`);

  const buf = fs.readFileSync(filePath);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546C67) {
    throw new Error('Not a GLB file: ' + filePath);
  }

  const version = buf.readUInt32LE(4);
  const totalLength = buf.readUInt32LE(8);
  const jsonChunkLength = buf.readUInt32LE(12);
  const jsonChunkType = buf.readUInt32LE(16);

  const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLength);
  const gltf = JSON.parse(jsonStr);

  const binChunkOffset = 20 + jsonChunkLength;
  const binChunkLength = buf.readUInt32LE(binChunkOffset);
  const binChunkType = buf.readUInt32LE(binChunkOffset + 4);
  const binDataOffset = binChunkOffset + 8;

  // We operate on a copy of the binary buffer
  const binBuf = Buffer.from(buf.subarray(binDataOffset, binDataOffset + binChunkLength));

  // Find Hips and Armature node indices
  const hipNodeIndex = gltf.nodes.findIndex(n => n.name && (n.name.includes('Hips') || n.name.includes('hips')));
  const armNodeIndex = gltf.nodes.findIndex(n => n.name && n.name === 'Armature');
  console.log(`Hip node index: ${hipNodeIndex} (${gltf.nodes[hipNodeIndex]?.name})`);
  console.log(`Armature node index: ${armNodeIndex} (${gltf.nodes[armNodeIndex]?.name})`);

  let modifiedClips = 0;

  (gltf.animations || []).forEach(anim => {
    const isEmoji = EMOJI_ACTIONS.has(anim.name.toLowerCase());
    if (isEmoji) {
      console.log(`  [SKIP EMOJI] ${anim.name} (already clean)`);
      return;
    }

    // Check for Armature translation
    anim.channels.forEach(ch => {
      if (ch.target.node === armNodeIndex && ch.target.path === 'translation') {
        const sampler = anim.samplers[ch.sampler];
        const acc = gltf.accessors[sampler.output];
        const bv = gltf.bufferViews[acc.bufferView];
        const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
        for (let i = 0; i < acc.count; i++) {
          binBuf.writeFloatLE(0.0, offset + i * 12);
          binBuf.writeFloatLE(0.0, offset + i * 12 + 4);
          binBuf.writeFloatLE(0.0, offset + i * 12 + 8);
        }
        acc.min = [0, 0, 0];
        acc.max = [0, 0, 0];
        console.log(`    Zeroed Armature translation on ${anim.name}`);
      }
    });

    // Check for Hips translation
    const hipChannel = anim.channels.find(ch => ch.target.node === hipNodeIndex && ch.target.path === 'translation');
    if (!hipChannel) {
      console.log(`  [NO HIPS POS] ${anim.name}`);
      return;
    }

    const sampler = anim.samplers[hipChannel.sampler];
    const acc = gltf.accessors[sampler.output];
    const bv = gltf.bufferViews[acc.bufferView];
    const baseOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);

    const startX = binBuf.readFloatLE(baseOffset);
    const startY = binBuf.readFloatLE(baseOffset + 4);
    const startZ = binBuf.readFloatLE(baseOffset + 8);

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < acc.count; i++) {
      const curOff = baseOffset + i * 12;
      const rawX = binBuf.readFloatLE(curOff);
      const rawY = binBuf.readFloatLE(curOff + 4);
      const rawZ = binBuf.readFloatLE(curOff + 8);

      const rawDy = rawY - startY;
      const scaleY = Math.abs(rawDy) > 2.0 ? 0.01 : 1.0;

      const newX = TARGET_X;
      const newY = Math.max(0.04, TARGET_Y + rawDy * scaleY);
      const newZ = TARGET_Z;

      binBuf.writeFloatLE(newX, curOff);
      binBuf.writeFloatLE(newY, curOff + 4);
      binBuf.writeFloatLE(newZ, curOff + 8);

      if (newX < minX) minX = newX; if (newX > maxX) maxX = newX;
      if (newY < minY) minY = newY; if (newY > maxY) maxY = newY;
      if (newZ < minZ) minZ = newZ; if (newZ > maxZ) maxZ = newZ;
    }

    acc.min = [minX, minY, minZ];
    acc.max = [maxX, maxY, maxZ];
    modifiedClips++;
    console.log(`  ✓ Calibrated: ${anim.name} (start was Y=${startY.toFixed(3)} -> now Y=${minY.toFixed(3)}..${maxY.toFixed(3)})`);
  });

  // Re-serialize glTF JSON
  const newJsonStr = JSON.stringify(gltf);
  let newJsonBuf = Buffer.from(newJsonStr, 'utf8');

  // glTF chunks must be aligned to 4 bytes with spaces (0x20)
  const paddingLen = (4 - (newJsonBuf.length % 4)) % 4;
  if (paddingLen > 0) {
    const pad = Buffer.alloc(paddingLen, 0x20);
    newJsonBuf = Buffer.concat([newJsonBuf, pad]);
  }

  // Create new GLB
  const newTotalLen = 12 + 8 + newJsonBuf.length + 8 + binBuf.length;
  const outHeader = Buffer.alloc(12);
  outHeader.writeUInt32LE(0x46546C67, 0);
  outHeader.writeUInt32LE(2, 4);
  outHeader.writeUInt32LE(newTotalLen, 8);

  const outJsonHeader = Buffer.alloc(8);
  outJsonHeader.writeUInt32LE(newJsonBuf.length, 0);
  outJsonHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  const outBinHeader = Buffer.alloc(8);
  outBinHeader.writeUInt32LE(binBuf.length, 0);
  outBinHeader.writeUInt32LE(0x004E4942, 4); // 'BIN\0'

  const finalGlb = Buffer.concat([
    outHeader,
    outJsonHeader,
    newJsonBuf,
    outBinHeader,
    binBuf
  ]);

  fs.writeFileSync(filePath, finalGlb);
  console.log(`✅ Saved calibrated GLB: ${filePath} (${finalGlb.length} bytes, ${modifiedClips} combat clips calibrated)`);
}

// Calibrate all 3 woman GLB files
const files = [
  'client/assets/Characters/engi/Woman/woman.glb',
  'client/assets/Characters/engi/Woman/woman_body.glb',
  'client/assets/Characters/engi/Woman/woman_merged.glb'
];

files.forEach(f => {
  if (fs.existsSync(f)) {
    calibrateGlbFile(f);
  }
});

// Also copy to dist/gm
const gmDir = 'dist/gm/client/assets/Characters/engi/Woman';
if (fs.existsSync(gmDir)) {
  files.forEach(f => {
    const dest = path.join('dist/gm', f);
    if (fs.existsSync(f)) {
      fs.copyFileSync(f, dest);
      console.log(`Copied to GM: ${dest}`);
    }
  });
}

