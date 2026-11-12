const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_unif_' + Date.now());
const PORT = 9335;

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
    '--window-size=1600,1000',
    'about:blank'
  ]);
  await sleep(1500);
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Hide UI
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
    })()`
  });

  const WEAPONS = [
    { id: 'novice', name: 'Булава Послушника' },
    { id: 'magic_mace', name: 'Магическая булава' },
    { id: 'atuba_mace', name: 'Булава Атуба' },
    { id: 'demon_staff', name: 'Посох Демона' },
    { id: 'tears_fairy', name: 'Слёзы Феи' }
  ];

  // Helper function to mount weapon with bone-scale invariant
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._mountWeaponTest = function(weaponId) {
        const THREE = window.THREE;
        const sr = window._sr;
        const fbx = sr.activeWeaponMesh;
        const root = sr.weaponRoot;
        if (!fbx || !root) return;

        const handBone = sr.activeCharacterModel.getObjectByName('mixamorigRightHand') ||
                         sr.activeCharacterModel.getObjectByName('mixamorig:RightHand');
        const bws = new THREE.Vector3(1, 1, 1);
        if (handBone) handBone.getWorldScale(bws);
        const scaleInv = (bws.y > 1e-5) ? (1.0 / bws.y) : 100.0;

        // Strip previous orient/pivot
        root.clear();

        // 1. Normalize FBX at origin
        fbx.position.set(0, 0, 0);
        fbx.rotation.set(0, 0, 0);
        fbx.scale.set(1, 1, 1);
        fbx.updateMatrix();

        let b = new THREE.Box3().setFromObject(fbx);
        let sz = new THREE.Vector3();
        b.getSize(sz);

        // If authored along Z (novice.fbx), rotate X 90
        if (sz.z >= sz.x && sz.z >= sz.y) {
          fbx.rotation.x = Math.PI * 0.5;
          fbx.updateMatrix();
        }

        b.setFromObject(fbx);
        b.getSize(sz);
        const currentLen = Math.max(sz.x, sz.y, sz.z);

        // Target length in meters
        const targetLenM = (weaponId === 'demon_staff') ? 1.65 :
                           (weaponId === 'magic_mace') ? 0.88 :
                           (weaponId === 'atuba_mace') ? 0.96 :
                           (weaponId === 'tears_fairy') ? 0.90 : 0.94;
        
        const targetLenBoneUnits = targetLenM * scaleInv;
        const s = targetLenBoneUnits / currentLen;
        fbx.scale.set(s, s, s);
        fbx.updateMatrix();

        // Recompute bounds after scaling
        b.setFromObject(fbx);
        b.getSize(sz);
        const center = new THREE.Vector3();
        b.getCenter(center);

        // Grip fraction from base
        const gripFraction = (weaponId === 'demon_staff') ? 0.42 :
                             (weaponId === 'atuba_mace') ? 0.24 :
                             (weaponId === 'novice') ? 0.28 : 0.22;
        
        const gripY = b.min.y + sz.y * gripFraction;
        fbx.position.set(-center.x, -gripY, -center.z);

        const pivot = new THREE.Group();
        pivot.name = 'char_weapon_pivot';
        pivot.add(fbx);

        const orient = new THREE.Group();
        orient.name = 'char_weapon_orient';

        // Position in centimeters in handBone:
        // X = 0 (centered), Y = 7.2 cm (inside palm), Z = 1.3 cm (inside clenched fist tunnel)
        const posM = [0.0, 0.072, 0.013];
        orient.position.set(posM[0] * scaleInv, posM[1] * scaleInv, posM[2] * scaleInv);

        // Rotation: 1H weapons hang down along thigh; 2H staff stands upright
        if (weaponId === 'demon_staff') {
          // Flip 180 on Z to point upright, head towards shoulder/sky
          orient.rotation.set(Math.PI, 0.0, -0.08);
        } else {
          // Hang straight down along thigh
          orient.rotation.set(0.0, 0.0, 0.0);
        }
        orient.add(pivot);

        root.add(orient);
      };
    })()`
  });

  for (const w of WEAPONS) {
    console.log('Testing weapon:', w.id);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        sel.value = '${w.id}';
        sel.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    // Apply unified mount
    await send('Runtime.evaluate', {
      expression: `window._mountWeaponTest('${w.id}')`
    });
    await sleep(400);

    // Capture closeup
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.70, 0.05, Math.PI * 0.48, -0.23, 0.0)`
    });
    await sleep(400);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/unif_${w.id}_closeup.png`, Buffer.from(shot.data, 'base64'));

    // Capture full body
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
    await sleep(400);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/unif_${w.id}_full.png`, Buffer.from(shot.data, 'base64'));
  }

  // Also test sit_loop posture
  console.log('Testing sit_loop...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  let shotSit = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/unif_sit_loop.png', Buffer.from(shotSit.data, 'base64'));

  console.log('All tests finished successfully!');
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

