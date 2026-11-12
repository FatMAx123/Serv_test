const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_th_' + Date.now());
const PORT = 9922;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
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

  // Setup Man with weapon and camera close up on right hand
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
    
    // Zoom close into right hand from front-side view
    window._sr.camera.position.set(-0.35, 1.05, 0.45);
    window._sr.controls.target.set(-0.30, 0.95, 0.05);
    window._sr.controls.update();
  })()`);
  await sleep(2500);

  // Candidate tests for thumb wrap
  const candidates = [
    {
      id: 'woman_thumb_style',
      t1: [15, -45, 30],
      t2: [25, 10, 45],
      t3: [10, 0, 40]
    },
    {
      id: 'tight_thumb_wrap',
      t1: [20, -50, 40],
      t2: [30, 15, 50],
      t3: [15, 0, 45]
    },
    {
      id: 'natural_clenched_thumb',
      t1: [15, -40, 35],
      t2: [20, 10, 40],
      t3: [10, 0, 35]
    },
    {
      id: 'deep_clasped_thumb',
      t1: [25, -55, 45],
      t2: [35, 20, 55],
      t3: [20, 5, 50]
    }
  ];

  for (const c of candidates) {
    await evalJs(`(() => {
      const m = window._sr.activeCharacterModel;
      const t1 = m.getObjectByName('mixamorigRightHandThumb1');
      const t2 = m.getObjectByName('mixamorigRightHandThumb2');
      const t3 = m.getObjectByName('mixamorigRightHandThumb3');
      const DEG2RAD = Math.PI / 180;
      function e2q(x, y, z) {
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
      }
      if (t1) t1.quaternion.copy(e2q(${c.t1[0]}, ${c.t1[1]}, ${c.t1[2]}));
      if (t2) t2.quaternion.copy(e2q(${c.t2[0]}, ${c.t2[1]}, ${c.t2[2]}));
      if (t3) t3.quaternion.copy(e2q(${c.t3[0]}, ${c.t3[1]}, ${c.t3[2]}));
      m.updateMatrixWorld(true);
    })()`);
    await sleep(200);
    await saveScreenshot(`test_man_${c.id}.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

