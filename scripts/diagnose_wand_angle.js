const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_diag_' + Date.now());
const PORT = 9970;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Edge connection failed');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
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
  await sleep(2500);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Camera side view matching user's Image 1
  // In Image 1: Side profile, woman facing right.
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.3, 0.05, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(300);

  // Current showroom rotation
  const currRot = await send('Runtime.evaluate', {
    expression: `(() => {
      const wo = window._sr.weaponOrient;
      return wo ? [wo.rotation.x, wo.rotation.y, wo.rotation.z] : null;
    })()`,
    returnByValue: true
  });
  console.log('Current weaponOrient rotation:', currRot.result.value);

  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/woman_diag_current_profile.png', Buffer.from(snap.data, 'base64'));

  // Test candidate angles:
  // We want the wand tip to point FORWARD and DOWN at ~25 degrees below horizontal.
  // In Three.js woman hand coordinate space:
  // Let's test phi values:
  // For tears_fairy / novice / apprentice_wand:
  // Math.PI * 0.5, -phi, phi:
  // When phi = 25 * Math.PI / 180 (0.436 rad) -> points ~25 deg from vertical
  // When phi = 65 * Math.PI / 180 (1.134 rad) -> points 65 deg from vertical = 25 deg from HORIZONTAL!
  // Let's test phi = 1.05, 1.13, 1.22, 1.30, and also check sign:
  const phis = [
    { name: 'phi_65deg_horiz', rot: [Math.PI * 0.5, -1.1345, 1.1345] },
    { name: 'phi_55deg', rot: [Math.PI * 0.5, -0.96, 0.96] },
    { name: 'phi_75deg', rot: [Math.PI * 0.5, -1.309, 1.309] },
    { name: 'phi_45deg', rot: [Math.PI * 0.5, -0.785, 0.785] },
    { name: 'current_in_file', rot: [1.7453, -1.1868, -0.0698] },
    { name: 'forward_flat', rot: [Math.PI * 0.5, -1.57, 1.57] }
  ];

  for (const c of phis) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        wo.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});
        wo.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/woman_angle_${c.name}.png`, Buffer.from(s.data, 'base64'));
    console.log(`Saved woman_angle_${c.name}.png`);
  }

  edge.kill();
  console.log('DONE DIAGNOSE');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

