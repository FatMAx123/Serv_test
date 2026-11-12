const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9975;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_hands_' + Date.now())}`,
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

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // --- Woman Hand Closeup ---
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Focus directly on woman right hand
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.45, 0.1, 0.8, wp.x, wp.z);
  })()`);
  await sleep(600);
  await snap('hand_woman_wand_closeup.png');

  // --- Man Hand Closeup (User's main issue: thumb protruding like a blade!) ---
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Focus directly on man right hand from outside (azimuth 0.8)
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.50, 0.1, 0.8, wp.x, wp.z);
  })()`);
  await sleep(600);
  await snap('hand_man_wand_outside.png');

  // Focus on man right hand from front (azimuth 0.0)
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.50, 0.1, 0.0, wp.x, wp.z);
  })()`);
  await sleep(600);
  await snap('hand_man_wand_front.png');

  // Focus on man right hand from thumb side (azimuth -0.5)
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.50, 0.1, -0.6, wp.x, wp.z);
  })()`);
  await sleep(600);
  await snap('hand_man_wand_thumbside.png');

  ws.close();
  edge.kill();
  console.log('Closeups captured!');
}

main().catch(console.error);

