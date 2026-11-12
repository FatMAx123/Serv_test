const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_grip_' + Date.now());
const PORT = 9331;

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
  await sleep(3500);

  // Hide UI
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
    })()`
  });

  // Switch to novice weapon
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Position camera to exact right-side profile of character (looking at hand from right)
  // Character faces +Z or -Z in idle, right hand is on character's right side (x < 0 or x > 0)
  // Let's set camera target to hand and look from the side
  await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      // Right side profile view: azimuth = Math.PI * 0.5 (90 deg)
      sr.setCameraPreset(0.88, 0.75, 0.05, Math.PI * 0.48, -0.23, 0.0);
    })()`
  });
  await sleep(500);

  // Sweep Z offset: 0.0, 0.8, 1.4, 2.0, 2.6
  const zVals = [0.0, 0.8, 1.4, 2.0, 2.6];
  for (const z of zVals) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const THREE = window.THREE;
        const sr = window._sr;
        const root = sr.weaponRoot;
        const orient = root && root.children[0];
        const fbx = sr.activeWeaponMesh;
        if (!orient || !fbx) return;

        orient.position.set(0.0, 7.2, ${z});
        orient.rotation.set(0.0, 0.0, 0.0);

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
        const s = 94.0 / Math.max(sz.x, sz.y, sz.z);
        fbx.scale.set(s, s, s);
        fbx.updateMatrix();

        b.setFromObject(fbx);
        b.getSize(sz);
        const center = new THREE.Vector3();
        b.getCenter(center);
        const gripY = b.min.y + sz.y * 0.28;
        fbx.position.set(-center.x, -gripY, -center.z);
      })()`
    });
    await sleep(300);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/grip_z_${z}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/grip_z_${z}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
