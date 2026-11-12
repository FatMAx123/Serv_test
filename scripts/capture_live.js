const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9965;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_cap_' + Date.now())}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      tabs = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  console.log('Connecting to tab:', tab.url);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) {
          ws.off('message', h);
          res(r.result);
        }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res && res.result && res.result.value !== undefined) return res.result.value;
    if (res && res.result) return res.result;
    return res;
  }

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(res.data, 'base64'));
    console.log('Saved:', filename);
  }

  // Wait until showroom is ready
  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }
  console.log('Showroom ready.');

  // Disable bone helpers for clean view
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
  })()`);

  // --- 1. Woman with Apprentice Wand ---
  console.log('Setting Woman + Apprentice Wand...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman';
    selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Woman Side View (elevation 0.05, azimuth PI*0.5)
  await evalJs(`window._sr.setCameraPreset(0.52, 1.85, 0.05, Math.PI * 0.5)`);
  await sleep(600);
  await snap('real_woman_idle_side.png');

  // Woman Isometric View (elevation 0.15, azimuth 0.5)
  await evalJs(`window._sr.setCameraPreset(0.52, 1.85, 0.15, 0.5)`);
  await sleep(600);
  await snap('real_woman_idle_iso.png');

  // Woman Walk Side View
  await evalJs(`(() => {
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk';
    selA.dispatchEvent(new Event('change'));
    window._sr.setCameraPreset(0.52, 2.0, 0.05, Math.PI * 0.5);
  })()`);
  await sleep(1500);
  await snap('real_woman_walk_side.png');

  // Woman Walk Front View
  await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.05, 0.0)`);
  await sleep(500);
  await snap('real_woman_walk_front.png');

  // --- 2. Man with Apprentice Wand ---
  console.log('Setting Man + Apprentice Wand...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man';
    selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Man Idle Front View
  await evalJs(`window._sr.setCameraPreset(0.95, 2.9, 0.05, 0.0)`);
  await sleep(600);
  await snap('real_man_idle_front.png');

  // Man Idle Side View
  await evalJs(`window._sr.setCameraPreset(0.95, 2.9, 0.05, Math.PI * 0.5)`);
  await sleep(600);
  await snap('real_man_idle_side.png');

  // Man Right Hand Closeup (cam-weapon preset: elevation 0.14, azimuth 0.65)
  await evalJs(`(() => {
    window._sr.frameCamera('weapon');
  })()`);
  await sleep(600);
  await snap('real_man_fist_closeup.png');

  // Man Walk
  console.log('Man Walk...');
  await evalJs(`(() => {
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk';
    selA.dispatchEvent(new Event('change'));
    window._sr.setCameraPreset(0.95, 2.8, 0.05, 0.0);
  })()`);
  await sleep(1500);
  await snap('real_man_walk_front.png');

  // Backward swing clearance (freeze at t=0.64s)
  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(0.64);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.95, 2.8, 0.05, Math.PI * 0.5);
  })()`);
  await sleep(500);
  await snap('real_man_walk_back_side.png');

  // Forward swing clearance (freeze at t=0.18s)
  await evalJs(`(() => {
    window._sr.activeMixer.setTime(0.18);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.95, 2.8, 0.05, Math.PI * 0.5);
  })()`);
  await sleep(500);
  await snap('real_man_walk_fwd_side.png');

  ws.close();
  edge.kill();
  console.log('Real captures complete!');
}

main().catch(console.error);
