const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_exact_' + Date.now());
const PORT = 9940;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
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
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(500);
    try {
      tabs = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
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
  await send('Runtime.enable');
  await sleep(1500);

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  async function saveScreenshot(filename) {
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join('C:\\Users\\Kulibyaka\\.gemini\\antigravity\\brain\\d3dff332-87fe-4206-a4dc-9a5fc682711d', filename);
    fs.writeFileSync(p, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshot: ${filename}`);
  }

  console.log('--- Step 1: Solving Woman Weapon Rotation (Facing -Z) ---');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman';
    selC.dispatchEvent(new Event('change'));
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // Target world direction: facing forward is -Z! Downward is -Y!
  const womanRotResult = await evalJs(`(() => {
    const orient = window._sr.weaponOrient;
    const wObj = window._sr.activeWeaponMesh;
    
    let bestRot = null;
    let minErr = 999;
    
    // Target forward-down direction: X=0, Y=-0.374 (down ~22 deg), Z=-0.927 (forward!)
    const targetDir = new THREE.Vector3(0.0, -0.374, -0.927).normalize();
    
    const deg2rad = Math.PI / 180;
    for (let rx = -180; rx <= 180; rx += 5) {
      for (let ry = -180; ry <= 180; ry += 5) {
        for (let rz = -180; rz <= 180; rz += 5) {
          orient.rotation.set(rx * deg2rad, ry * deg2rad, rz * deg2rad);
          orient.updateMatrixWorld(true);
          
          const vStart = new THREE.Vector3();
          const vTip = new THREE.Vector3(0, 0, -0.85); // Tip is at -Z in novice.glb
          orient.getWorldPosition(vStart);
          wObj.localToWorld(vTip);
          const dir = new THREE.Vector3().subVectors(vTip, vStart).normalize();
          
          const err = dir.distanceTo(targetDir);
          if (err < minErr) {
            minErr = err;
            bestRot = {
              rot: [rx * deg2rad, ry * deg2rad, rz * deg2rad],
              deg: [rx, ry, rz],
              dir: [dir.x.toFixed(3), dir.y.toFixed(3), dir.z.toFixed(3)],
              err: err
            };
          }
        }
      }
    }
    orient.rotation.set(bestRot.rot[0], bestRot.rot[1], bestRot.rot[2]);
    orient.updateMatrixWorld(true);
    return bestRot;
  })()`);

  console.log('Optimized Woman Weapon Rotation (Pointing Forward):', womanRotResult);

  // Side camera
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.5, 0.15, Math.PI * 0.5);
  })()`);
  await sleep(1000);
  await saveScreenshot('woman_profile_TRUE_FORWARD.png');

  ws.close();
  edge.kill();
}

main().catch(console.error);
