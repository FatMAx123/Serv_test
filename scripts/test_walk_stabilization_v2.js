const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_walk_test_' + Date.now());
const PORT = 9946;

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

  // Load man with apprentice wand and walk animation
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
    selA.value = 'walk';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // In walk animation: test forward swing and backward swing with:
  // 1. Arm lateral flare: premultiply parent Z by +11° (0.19 rad)
  // 2. Wrist stabilization: damp wrist pitch
  await evalJs(`(() => {
    window._applyWalkStabilization = (flareRad) => {
      const m = window._sr.activeCharacterModel;
      const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('RightArm');
      const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('RightHand');
      if (rArm) {
        const qFlare = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), flareRad);
        rArm.quaternion.premultiply(qFlare);
      }
      m.updateMatrixWorld(true);
    };
  })()`);

  // Pause mixer and set to forward swing t = 0.18s
  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(0.18);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._applyWalkStabilization(11 * Math.PI / 180);
    window._sr.setCameraPreset(0.95, 2.8, 0.25, 0.65);
  })()`);
  await sleep(400);
  await saveScreenshot('walk_man_stabilized_fwd.png');

  // Set to backward swing t = 0.64s
  await evalJs(`(() => {
    window._sr.activeMixer.setTime(0.64);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._applyWalkStabilization(11 * Math.PI / 180);
    window._sr.setCameraPreset(0.95, 2.8, 0.25, 0.65);
  })()`);
  await sleep(400);
  await saveScreenshot('walk_man_stabilized_back.png');

  // Also check side view at backward swing t = 0.64s
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.5, 0.15, Math.PI * 0.5);
  })()`);
  await sleep(400);
  await saveScreenshot('walk_man_stabilized_back_side.png');

  ws.close();
  edge.kill();
}

main().catch(console.error);

