const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_final_' + Date.now());
const PORT = 9950;

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
  console.log('Starting verification browser...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=sol_' + Date.now()
  ]);

  let tabs = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(400);
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

  console.log('--- 1. Woman Idle Profile (Matches User Screenshot 1 with Red Arrow) ---');
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

  // Set side profile camera
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.5, 0.15, Math.PI * 0.5);
  })()`);
  await sleep(1000);
  await saveScreenshot('final_woman_idle_profile.png');

  // Woman Isometric View
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.7, 0.35, 0.75);
  })()`);
  await sleep(800);
  await saveScreenshot('final_woman_idle_iso.png');

  // Woman Walk
  console.log('--- 2. Woman Walk ---');
  await evalJs(`(() => {
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk';
    selA.dispatchEvent(new Event('change'));
    window._sr.setCameraPreset(0.85, 2.6, 0.20, 0.65);
  })()`);
  await sleep(2000);
  await saveScreenshot('final_woman_walk.png');

  // Man Setup: wait for load
  console.log('--- 3. Man Setup & Fist Optimization ---');
  await evalJs(`(() => {
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
  await sleep(3000);

  // Man Idle Full View
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.95, 2.8, 0.18, 0.0);
  })()`);
  await sleep(800);
  await saveScreenshot('final_man_idle_full.png');

  // Man Fist Closeup Front (Checks clenched fist & wrapped thumb)
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.95, 0.65, 0.12, 0.40, -0.28, 0.05);
  })()`);
  await sleep(800);
  await saveScreenshot('final_man_fist_front.png');

  // Man Fist Closeup Side (Checks thumb clasping over fingers)
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.95, 0.65, 0.12, 1.25, -0.28, 0.05);
  })()`);
  await sleep(800);
  await saveScreenshot('final_man_fist_side.png');

  // Man Walk backward swing (t = 0.64s, tests clearance from shorts/thigh)
  console.log('--- 4. Man Walk Clearance ---');
  await evalJs(`(() => {
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(0.64);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.90, 2.6, 0.20, 0.65);
  })()`);
  await sleep(500);
  await saveScreenshot('final_man_walk_back.png');

  // Side view at backward swing
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.5, 0.15, Math.PI * 0.5);
  })()`);
  await sleep(500);
  await saveScreenshot('final_man_walk_back_side.png');

  ws.close();
  edge.kill();
  console.log('Verification run complete!');
}

main().catch(console.error);

