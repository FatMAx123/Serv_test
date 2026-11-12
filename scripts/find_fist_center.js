const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_center_' + Date.now());
const PORT = 9944;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) { ws.off('message', handler); resolve(resp.result); }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(2500);

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      
      // Select novice weapon to trigger fist clenching
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));

      // Advance mixer to ensure fist clenching is 100% applied
      for (let i = 0; i < 10; i++) {
        sr.activeMixer.update(0.05);
      }
      model.updateMatrixWorld(true);

      const handBone = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      const invHandMatrix = new THREE.Matrix4().copy(handBone.matrixWorld).invert();

      // Find finger bones positions in hand bone local space
      const fingerBones = [
        'Index1', 'Index2', 'Index3',
        'Middle1', 'Middle2', 'Middle3',
        'Ring1', 'Ring2', 'Ring3',
        'Pinky1', 'Pinky2', 'Pinky3',
        'Thumb1', 'Thumb2', 'Thumb3'
      ];

      const bonePositions = {};
      fingerBones.forEach(name => {
        const b = model.getObjectByName('mixamorigRightHand' + name) || model.getObjectByName('mixamorig:RightHand' + name);
        if (b) {
          const wp = new THREE.Vector3();
          b.getWorldPosition(wp);
          wp.applyMatrix4(invHandMatrix); // in hand bone local space
          bonePositions[name] = [
            Number(wp.x.toFixed(3)),
            Number(wp.y.toFixed(3)),
            Number(wp.z.toFixed(3))
          ];
        }
      });

      return {
        handBoneLocalScale: [handBone.scale.x, handBone.scale.y, handBone.scale.z],
        fingerBonesInHandSpace: bonePositions
      };
    })()`,
    returnByValue: true
  });

  console.log('=== CLENCHED FIST ANATOMICAL COORDINATES ===');
  console.log(JSON.stringify(evalRes.result.value, null, 2));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

