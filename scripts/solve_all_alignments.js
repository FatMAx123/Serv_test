const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_solve_' + Date.now());
const PORT = 9935;

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
  console.log('Launching headless Edge...');
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

  if (!tabs || !tabs[0]) {
    console.error('Failed to connect to Edge debug port.');
    edge.kill();
    return;
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

  console.log('--- Step 1: Investigating Woman Weapon Forward Rotation ---');
  // Load Woman, apprentice_wand, idle
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
    window._sr.controls.autoRotate = false;
  })()`);
  await sleep(2500);

  // Position camera on Woman's right profile:
  // Character stands at origin, facing +Z.
  // Camera placed at X = 2.4, Y = 0.9, Z = 0 looking at (0, 0.85, 0) sees character's right side.
  // Face points to the RIGHT (+Z), back points to the LEFT (-Z).
  await evalJs(`(() => {
    window._sr.camera.position.set(2.4, 0.9, 0.0);
    window._sr.controls.target.set(0, 0.85, 0.0);
    window._sr.controls.update();
  })()`);
  await sleep(500);

  // Measure current weapon tip world direction:
  const dirInfo = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const orient = window._sr.weaponOrient;
    const wObj = window._sr.activeWeaponMesh;
    const vStart = new THREE.Vector3();
    const vEnd = new THREE.Vector3(0, 0, 0.8);
    orient.localToWorld(vStart);
    wObj.localToWorld(vEnd);
    const dir = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
    return {
      dir: [dir.x.toFixed(3), dir.y.toFixed(3), dir.z.toFixed(3)],
      orientRot: [orient.rotation.x.toFixed(3), orient.rotation.y.toFixed(3), orient.rotation.z.toFixed(3)]
    };
  })()`);
  console.log('Woman weapon direction in world (Z > 0 is forward, Y < 0 is down):', dirInfo);

  // In world space:
  // Character faces +Z.
  // User's red arrow requests weapon pointing FORWARD (+Z) and DOWN (-Y at ~25 deg, so dir.y ≈ -0.42, dir.z ≈ +0.90, dir.x ≈ 0).
  // Currently, dir.z < 0 means it points BACKWARDS!
  // Let's test rotations to get dir.z ≈ +0.85 to +0.92, dir.y ≈ -0.35 to -0.45.
  
  // Test a grid of Euler rotations for weaponOrient:
  const searchResults = await evalJs(`(() => {
    const orient = window._sr.weaponOrient;
    const wObj = window._sr.activeWeaponMesh;
    const origRot = orient.rotation.clone();
    
    const candidates = [];
    const step = 15 * Math.PI / 180;
    
    // We want the tip (along +Z of weaponObj) to point towards world +Z and world -Y
    for (let rx = -Math.PI; rx <= Math.PI; rx += step) {
      for (let ry = -Math.PI; ry <= Math.PI; ry += step) {
        for (let rz = -Math.PI; rz <= Math.PI; rz += step) {
          orient.rotation.set(rx, ry, rz);
          orient.updateMatrixWorld(true);
          
          const vStart = new THREE.Vector3();
          const vEnd = new THREE.Vector3(0, 0, 0.8);
          orient.getWorldPosition(vStart);
          wObj.localToWorld(vEnd);
          const dir = new THREE.Vector3().subVectors(vEnd, vStart).normalize();
          
          // Desired: dir.z between 0.70 and 0.95 (pointing forward), dir.y between -0.55 and -0.25 (down 20-30 deg), dir.x between -0.35 and 0.15 (close to sagittal plane)
          if (dir.z > 0.80 && dir.y < -0.25 && dir.y > -0.55 && Math.abs(dir.x) < 0.25) {
            candidates.push({
              rot: [rx, ry, rz],
              deg: [Math.round(rx * 180 / Math.PI), Math.round(ry * 180 / Math.PI), Math.round(rz * 180 / Math.PI)],
              dir: [dir.x.toFixed(3), dir.y.toFixed(3), dir.z.toFixed(3)],
              score: dir.z - Math.abs(dir.x)
            });
          }
        }
      }
    }
    orient.rotation.copy(origRot);
    orient.updateMatrixWorld(true);
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 5);
  })()`);

  console.log('Best candidate rotations for woman forward-pointing weapon:', searchResults);

  if (searchResults && searchResults.length > 0) {
    const best = searchResults[0];
    await evalJs(`(() => {
      const orient = window._sr.weaponOrient;
      orient.rotation.set(${best.rot[0]}, ${best.rot[1]}, ${best.rot[2]});
      window._sr.camera.position.set(2.4, 0.9, 0.0);
      window._sr.controls.target.set(0, 0.85, 0.0);
      window._sr.controls.update();
    })()`);
    await sleep(300);
    await saveScreenshot('sol_woman_idle_side_forward.png');
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

