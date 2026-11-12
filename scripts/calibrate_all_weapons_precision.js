const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_calib_' + Date.now());
const PORT = 9240;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
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
  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          resolve(resp.result);
        }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Hide UI so screenshots are crystal clear
  await send('Runtime.evaluate', {
    expression: `(() => {
      const topBar = document.getElementById('top-bar');
      const leftP = document.getElementById('left-panel');
      const rightP = document.getElementById('right-panel');
      const btm = document.getElementById('bottom-bar');
      if (topBar) topBar.style.display = 'none';
      if (leftP) leftP.style.display = 'none';
      if (rightP) rightP.style.display = 'none';
      if (btm) btm.style.display = 'none';
    })()`
  });

  // Evaluate weapon inspection
  const report = await send('Runtime.evaluate', {
    expression: `(async () => {
      const sr = window._sr;
      const THREE = window.THREE;
      const weapons = ['novice', 'magic_mace', 'atuba_mace', 'demon_staff', 'tears_fairy'];
      const out = {};

      for (const wId of weapons) {
        sr.state.weapon = wId;
        await sr.loadWeapon();
        sr.scene.updateMatrixWorld(true);

        const orient = sr.weaponOrient;
        const pivot = sr.weaponPivot;
        const mesh = sr.activeWeaponMesh;

        // Find hand bone world pos
        const hand = sr.handBone;
        const handWorld = new THREE.Vector3();
        hand.getWorldPosition(handWorld);

        // Weapon pivot world pos
        const pivotWorld = new THREE.Vector3();
        pivot.getWorldPosition(pivotWorld);

        // Weapon bounds
        const box = new THREE.Box3().setFromObject(mesh);
        const sz = new THREE.Vector3();
        box.getSize(sz);

        out[wId] = {
          distToHand: pivotWorld.distanceTo(handWorld),
          handWorld: [handWorld.x.toFixed(3), handWorld.y.toFixed(3), handWorld.z.toFixed(3)],
          pivotWorld: [pivotWorld.x.toFixed(3), pivotWorld.y.toFixed(3), pivotWorld.z.toFixed(3)],
          size: [sz.x.toFixed(3), sz.y.toFixed(3), sz.z.toFixed(3)]
        };
      }
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Precision report:', JSON.stringify(report.result.value, null, 2));

  // Take test screenshot of novice
  await send('Runtime.evaluate', {
    expression: `(async () => {
      window._sr.state.weapon = 'novice';
      await window._sr.loadWeapon();
      window._sr.setCameraPreset('full');
    })()`,
    awaitPromise: true
  });
  await sleep(500);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/calib_novice_full.png', Buffer.from(shot.data, 'base64'));

  // Close up of hand
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.setCameraPreset('weapon');
    })()`
  });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/calib_novice_closeup.png', Buffer.from(shot.data, 'base64'));

  // Take test screenshot of demon_staff
  await send('Runtime.evaluate', {
    expression: `(async () => {
      window._sr.state.weapon = 'demon_staff';
      await window._sr.loadWeapon();
      window._sr.setCameraPreset('full');
    })()`,
    awaitPromise: true
  });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/calib_demon_staff_full.png', Buffer.from(shot.data, 'base64'));

  // Take test screenshot of atuba_mace
  await send('Runtime.evaluate', {
    expression: `(async () => {
      window._sr.state.weapon = 'atuba_mace';
      await window._sr.loadWeapon();
      window._sr.setCameraPreset('full');
    })()`,
    awaitPromise: true
  });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/calib_atuba_mace_full.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

