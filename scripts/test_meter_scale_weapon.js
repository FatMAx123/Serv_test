const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_meter_' + Date.now());
const PORT = 9285;

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

  // Hide UI
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
    })()`
  });

  // Switch to novice
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Test weapon placement with counter-scaled weaponRoot
  const result = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const root = sr.weaponRoot;
      const orient = sr.weaponOrient || (root && root.children[0]);
      const pivot = sr.weaponPivot || (orient && orient.children[0]);
      const fbx = sr.activeWeaponMesh;
      if (!root || !root.parent || !orient || !pivot || !fbx) return 'missing nodes';

      // 1. Counteract hand bone scale
      const ws = new THREE.Vector3();
      root.parent.getWorldScale(ws);
      root.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
      root.updateMatrixWorld(true);

      // 2. Position orient in METERS inside root
      // In hand space (Mixamo):
      // +Y is down along hand towards fingers (knuckles at 0.07m - 0.08m)
      // +X is forward in front of palm
      // +Z is to the right
      orient.position.set(0.000, 0.068, 0.015);

      // Lineage 2 rotation: mace head points down-forward along leg
      orient.rotation.set(0.0, 0.0, 0.0);

      // Scale fbx to 0.94m
      // In fbx, length along longest axis:
      fbx.scale.set(1, 1, 1);
      fbx.rotation.set(0, 0, 0);
      fbx.position.set(0, 0, 0);
      fbx.updateMatrix();

      // Check longest axis
      let b = new THREE.Box3().setFromObject(fbx);
      let sz = new THREE.Vector3();
      b.getSize(sz);

      // If authored along Z (like novice.fbx), rotate around X by 90deg so length is along Y
      if (sz.z >= sz.x && sz.z >= sz.y) {
        fbx.rotation.x = Math.PI * 0.5;
        fbx.updateMatrix();
      }

      b.setFromObject(fbx);
      b.getSize(sz);
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      const targetLen = 0.94; // 94 cm
      const s = targetLen / maxDim;
      fbx.scale.set(s, s, s);
      fbx.updateMatrix();

      b.setFromObject(fbx);
      b.getSize(sz);
      const center = new THREE.Vector3();
      b.getCenter(center);

      // Grip at handle base: min.y + 18% of length
      const gripY = b.min.y + sz.y * 0.18;
      fbx.position.set(-center.x, -gripY, -center.z);
      fbx.updateMatrix();

      // Now check bounding box in world space
      const worldBox = new THREE.Box3().setFromObject(fbx);
      const worldSize = new THREE.Vector3();
      worldBox.getSize(worldSize);

      window._sr.frameCamera('weapon');

      return {
        worldSize: [worldSize.x.toFixed(3), worldSize.y.toFixed(3), worldSize.z.toFixed(3)],
        scale: s
      };
    })()`,
    returnByValue: true
  });
  console.log('Setup result:', result.result.value);
  await sleep(1000);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_meter_novice_closeup.png', Buffer.from(shot.data, 'base64'));

  // Test full body
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset('full')` });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_meter_novice_full.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

