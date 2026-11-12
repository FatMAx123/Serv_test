const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_fist_' + Date.now());
const PORT = 9942;

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

  // Load man with weapon
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man';
    selC.dispatchEvent(new Event('change'));
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // Test 3 thumb configurations:
  // We can inject a function override for updateHandGrip or mutate LOCKED_FIST_QUATERNIONS_MAN
  const thumbConfigs = [
    {
      name: 'thumb_natural_wrap_1',
      t1: [18, -45, 32],
      t2: [25, 12, 45],
      t3: [12, 5, 40]
    },
    {
      name: 'thumb_tight_wrap_2',
      t1: [22, -50, 38],
      t2: [28, 15, 50],
      t3: [15, 8, 45]
    },
    {
      name: 'thumb_clasped_wrap_3',
      t1: [25, -52, 44],
      t2: [32, 18, 55],
      t3: [18, 10, 48]
    }
  ];

  for (const tc of thumbConfigs) {
    await evalJs(`(() => {
      const DEG2RAD = Math.PI / 180;
      function e2q(x, y, z) {
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
      }
      // Inject thumb override into updateHandGrip by monkeypatching the bones in requestAnimationFrame
      window._customThumbQ = {
        RightHandThumb1: e2q(${tc.t1[0]}, ${tc.t1[1]}, ${tc.t1[2]}),
        RightHandThumb2: e2q(${tc.t2[0]}, ${tc.t2[1]}, ${tc.t2[2]}),
        RightHandThumb3: e2q(${tc.t3[0]}, ${tc.t3[1]}, ${tc.t3[2]})
      };
      if (!window._thumbPatched) {
        window._thumbPatched = true;
        const origUpdate = window.requestAnimationFrame;
      }
      // Apply immediately
      const m = window._sr.activeCharacterModel;
      for (const [k, q] of Object.entries(window._customThumbQ)) {
        const b = m.getObjectByName('mixamorig' + k) || m.getObjectByName(k);
        if (b) b.quaternion.copy(q);
      }
    })()`);
    
    // Zoom close onto the hand from front view (matching user Screenshot 7)
    await evalJs(`(() => {
      window._sr.setCameraPreset(0.95, 0.70, 0.12, 0.45, -0.28, 0.05);
    })()`);
    await sleep(400);
    await saveScreenshot(`man_${tc.name}_front.png`);

    // Zoom from side view (matching user Screenshot 2 and 5)
    await evalJs(`(() => {
      window._sr.setCameraPreset(0.95, 0.70, 0.12, 1.25, -0.28, 0.05);
    })()`);
    await sleep(400);
    await saveScreenshot(`man_${tc.name}_side.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

