const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9985;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_slide_' + Date.now())}`,
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

  // Load man + apprentice_wand
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
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

  // Set thumb to curl_l2_warrior
  await evalJs(`(() => {
    const e2q = window._sr.eulerToQuat;
    const dict = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
    dict.RightHandThumb1 = e2q(40, -40, 20);
    dict.RightHandThumb2 = e2q(35, 15, 50);
    dict.RightHandThumb3 = e2q(20, 10, 40);

    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.45, 0.08, -0.45, wp.x, wp.z);
  })()`);
  await sleep(500);

  // Test modifying manPos
  // Baseline is [-0.005, 0.055, 0.022]
  const tests = [
    { name: 'base', pos: [-0.005, 0.055, 0.022] },
    { name: 'posY_085', pos: [-0.005, 0.085, 0.022] },
    { name: 'posY_025', pos: [-0.005, 0.025, 0.022] },
    { name: 'posZ_055', pos: [-0.005, 0.055, 0.055] },
    { name: 'posZ_neg010', pos: [-0.005, 0.055, -0.010] },
    { name: 'posX_025', pos: [0.025, 0.055, 0.022] },
    { name: 'posX_neg035', pos: [-0.035, 0.055, 0.022] }
  ];

  for (const t of tests) {
    await evalJs(`(() => {
      window._sr.WEAPON_DEFINITIONS.apprentice_wand.manPos = [${t.pos.join(',')}];
      window._sr.loadWeapon();
    })()`);
    await sleep(600);
    await snap(`slide_${t.name}.png`);
  }

  ws.close();
  edge.kill();
  console.log('Slide test finished!');
}

main().catch(console.error);

