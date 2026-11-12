const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_weap_calib_' + Date.now());
const PORT = 9228;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Switch camera to weapon preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  // Load and attach weapon with precise pivot & orientation
  const calibResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const THREE = window.THREE;
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      if (!hand) return { error: 'No hand' };

      // Apply fist pose
      sr.state.animPaused = true;
      const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
      fingers.forEach((f, idx) => {
        const baseAngle = -0.75 - (idx * 0.05);
        for (let j = 1; j <= 3; j++) {
          const b = model.getObjectByName('mixamorigRightHand' + f + j) || model.getObjectByName('mixamorig:RightHand' + f + j);
          if (b) {
            b.rotateZ(baseAngle);
            if (j === 1 && f === 'Pinky') b.rotateX(0.15);
          }
        }
      });
      const t1 = model.getObjectByName('mixamorigRightHandThumb1') || model.getObjectByName('mixamorig:RightHandThumb1');
      const t2 = model.getObjectByName('mixamorigRightHandThumb2') || model.getObjectByName('mixamorig:RightHandThumb2');
      const t3 = model.getObjectByName('mixamorigRightHandThumb3') || model.getObjectByName('mixamorig:RightHandThumb3');
      if (t1) { t1.rotateX(-0.4); t1.rotateZ(-0.45); }
      if (t2) { t2.rotateZ(-0.6); }
      if (t3) { t3.rotateZ(-0.5); }

      // Clean existing weaponRoot
      sr.weaponRoot.clear();

      // Load novice FBX
      const fbxLoader = new THREE.FBXLoader ? new THREE.FBXLoader() : null;
      // In showroom, fbxLoader is available
      let fbx;
      try {
        const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');
        const loader = new FBXLoader();
        fbx = await loader.loadAsync('assets/weapons/models/novice.fbx');
      } catch (e) {
        return { error: 'FBX load fail: ' + e.message };
      }

      // Load texture
      try {
        const texLoader = new THREE.TextureLoader();
        const tex = await texLoader.loadAsync('assets/weapons/textures/novice.webp');
        fbx.traverse(o => {
          if (o.isMesh) {
            o.castShadow = true;
            o.material = new THREE.MeshStandardMaterial({
              map: tex,
              roughness: 0.4,
              metalness: 0.7
            });
          }
        });
      } catch (_) {}

      // Measure dimensions
      fbx.updateMatrixWorld(true);
      const rawBox = new THREE.Box3().setFromObject(fbx);
      const rawSize = new THREE.Vector3(); rawBox.getSize(rawSize);
      const rawCenter = new THREE.Vector3(); rawBox.getCenter(rawCenter);

      // Target world length = 0.95m
      const targetLen = 0.95;
      const scaleMul = targetLen / rawSize.y;
      fbx.scale.setScalar(scaleMul);
      fbx.updateMatrixWorld(true);

      const scaledBox = new THREE.Box3().setFromObject(fbx);
      const scaledSize = new THREE.Vector3(); scaledBox.getSize(scaledSize);
      const scaledCenter = new THREE.Vector3(); scaledBox.getCenter(scaledCenter);

      // Handle grip is at ~22% from pommel (min Y)
      const gripY = scaledBox.min.y + scaledSize.y * 0.22;
      const gripX = scaledCenter.x;
      const gripZ = scaledCenter.z;

      // Create hierarchy: hand -> holder -> orient -> pivot -> fbx
      const holder = new THREE.Group();
      holder.name = 'char_weapon_holder';

      const orient = new THREE.Group();
      orient.name = 'char_weapon_orient';

      const pivot = new THREE.Group();
      pivot.name = 'char_weapon_pivot';
      pivot.position.set(-gripX, -gripY, -gripZ);
      pivot.add(fbx);

      orient.add(pivot);
      holder.add(orient);

      // Lineage 2 Right Hand Socket alignment:
      // Offset so grip is inside clenched fist:
      orient.position.set(0.045, 0.065, 0.0);
      // Rotation: blade points forward & upward (~45° up and forward, pommel down/back)
      // In hand bone space, Y is down the hand, X is across, Z is thickness
      orient.rotation.set(-Math.PI * 0.45, 0, Math.PI * 0.5);

      hand.add(holder);

      return {
        ok: true,
        rawSize: [rawSize.x, rawSize.y, rawSize.z],
        scaledSize: [scaledSize.x, scaledSize.y, scaledSize.z],
        grip: [gripX, gripY, gripZ]
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Calib result:', calibResult.result.value);
  await sleep(1000);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/weapon_calib_novice.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/weapon_calib_novice.png');

  edge.kill();
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

