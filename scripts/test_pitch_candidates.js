const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_pitch_' + Date.now());
const PORT = 9937;

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

  // Set woman, apprentice_wand, idle, side camera
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

  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.5, 0.15, Math.PI * 0.5);
  })()`);
  await sleep(1200);

  // We want the wand pointing forward (+Z) and DOWN (-Y) at 20-25 deg below horizontal.
  // In world coords: dir = (0, -sin(25°), cos(25°)) = (0, -0.42, 0.91)
  const pitchCandidates = [
    // Let's test rotating the orient group around character local X to pitch it down:
    { name: 'pitch_down_20', rot: [1.8326 - 0.35, 1.8326, -0.7854] },
    { name: 'pitch_down_35', rot: [1.8326 - 0.60, 1.8326, -0.7854] },
    { name: 'pitch_down_50', rot: [1.8326 - 0.85, 1.8326, -0.7854] },
    { name: 'pitch_down_65', rot: [1.8326 - 1.10, 1.8326, -0.7854] },
    // What if we vary Y?
    { name: 'var_y_plus', rot: [1.8326 - 0.60, 1.8326 + 0.3, -0.7854] },
    { name: 'var_y_minus', rot: [1.8326 - 0.60, 1.8326 - 0.3, -0.7854] },
    // What if we vary Z?
    { name: 'var_z_plus', rot: [1.8326 - 0.60, 1.8326, -0.7854 + 0.3] },
    { name: 'var_z_minus', rot: [1.8326 - 0.60, 1.8326, -0.7854 - 0.3] }
  ];

  for (const c of pitchCandidates) {
    await evalJs(`(() => {
      const orient = window._sr.weaponOrient;
      if (orient) orient.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});
    })()`);
    await sleep(200);
    await saveScreenshot(`woman_${c.name}.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

