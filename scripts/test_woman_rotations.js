const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_woman_' + Date.now());
const PORT = 9926;

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

  // Set woman, apprentice_wand, idle, and camera looking directly at woman's right profile
  // In user screenshot 1: woman is facing right!
  // To have woman facing right on screen: camera must be placed at woman's right side (x > 0)
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

  // Align camera exactly as in user screenshot 1
  await evalJs(`(() => {
    // In three.js showroom, character is centered at (0, 0, 0), facing -Z or +Z.
    // Let's find character forward direction:
    const charRoot = window._sr.activeCharacterModel;
    window._sr.camera.position.set(2.8, 0.95, 0.0);
    window._sr.controls.target.set(0, 0.85, 0.0);
    window._sr.controls.update();
  })()`);
  await sleep(500);

  await saveScreenshot('woman_profile_current.png');

  // Let's check what woman's orient rotation is:
  const curRot = await evalJs(`(() => {
    const orient = window._sr.weaponOrient;
    return orient ? [orient.rotation.x, orient.rotation.y, orient.rotation.z] : null;
  })()`);
  console.log('Current woman orient rot:', curRot);

  // If the wand points backward (down and to the left of the screen), rotating around the bone local axis or flipping yaw/pitch will point it FORWARD!
  // Let's test rotating orient:
  // To rotate 180 degrees or invert:
  // Let's test several candidate rotations for woman:
  const candidates = [
    { name: 'rot_cand_1', rot: [Math.PI * 0.5, 1.1728, -1.1151] },
    { name: 'rot_cand_2', rot: [-1.5075, 1.1728, 1.1151] },
    { name: 'rot_cand_3', rot: [1.5075, 1.1728, -1.1151] },
    { name: 'rot_cand_4', rot: [-0.11, -1.32, -1.08] }, // from char-model.js!
    { name: 'rot_cand_5', rot: [Math.PI * 0.5, -1.1345, 1.1345] },
    { name: 'rot_cand_6', rot: [-Math.PI * 0.5, 1.1345, -1.1345] },
    { name: 'rot_cand_7', rot: [1.5075, -1.1728 + Math.PI, 1.1151] },
    { name: 'rot_cand_8', rot: [1.5075, -1.1728, 1.1151 + Math.PI] }
  ];

  for (const c of candidates) {
    await evalJs(`(() => {
      const orient = window._sr.weaponOrient;
      if (orient) {
        orient.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});
      }
    })()`);
    await sleep(200);
    await saveScreenshot(`woman_${c.name}.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

