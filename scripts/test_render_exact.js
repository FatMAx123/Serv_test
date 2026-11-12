const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_exact_' + Date.now());
const PORT = 9333;

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

  // Load novice weapon
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Apply correct math
  await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
      const fbx = sr.activeWeaponMesh;
      if (!orient || !fbx) return;

      // Position handle in clenched fist tunnel
      // pos: [X across palm, Y along fingers/palm, Z palm tunnel depth]
      orient.position.set(0.0, 7.2, 1.2);
      orient.rotation.set(0.0, 0.0, 0.0);

      // Re-scale properly to centimeters
      fbx.position.set(0, 0, 0);
      fbx.rotation.set(0, 0, 0);
      fbx.scale.set(1, 1, 1);
      fbx.updateMatrix();

      let b = new THREE.Box3().setFromObject(fbx);
      let sz = new THREE.Vector3();
      b.getSize(sz);
      if (sz.z >= sz.x && sz.z >= sz.y) {
        fbx.rotation.x = Math.PI * 0.5;
        fbx.updateMatrix();
      }

      b.setFromObject(fbx);
      b.getSize(sz);
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      // 94 cm
      const s = 94.0 / maxDim;
      fbx.scale.set(s, s, s);
      fbx.updateMatrix();

      b.setFromObject(fbx);
      b.getSize(sz);
      const center = new THREE.Vector3();
      b.getCenter(center);
      // Grip point on handle cylinder at 28% from bottom pommel
      const gripY = b.min.y + sz.y * 0.28;
      fbx.position.set(-center.x, -gripY, -center.z);
    })()`
  });
  await sleep(500);

  // 1. Full body view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
  await sleep(400);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/exact_novice_full.png', Buffer.from(shot.data, 'base64'));

  // 2. Weapon camera preset
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
  await sleep(400);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/exact_novice_weapon_cam.png', Buffer.from(shot.data, 'base64'));

  // 3. Right profile side view (exactly matching Screenshot 10!)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.70, 0.05, Math.PI * 0.5, -0.23, 0.0)`
  });
  await sleep(400);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/exact_novice_side_profile.png', Buffer.from(shot.data, 'base64'));

  console.log('Exact screenshots saved!');
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

