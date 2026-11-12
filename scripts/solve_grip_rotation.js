const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rot_solve_' + Date.now());
const PORT = 9988;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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

  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // We want to test rotations that align canonical Y with the grip tunnel.
  // The grip tunnel vector in hand bone space is approximately from
  // Index knuckle (3.8, 8.5, 0.5) to Pinky knuckle (-3.8, 8.6, 0.5) or slightly angled:
  // Tunnel direction V = normalize([-7.6, 0.5, 0.0]) -> roughly along -X!
  // To rotate canonical Y (0, 1, 0) into -X (-1, 0, 0):
  // rotation around Z by +90 deg (+Math.PI * 0.5) maps (0, 1, 0) to (-1, 0, 0)!
  // Or to +X (+Math.PI * 0.5) maps to (1, 0, 0)!
  // Let's test a sweep of rotations!
  
  const rotCandidates = [
    { name: 'rot_A', rot: [0, 0, 0], pos: [0, 7.2, 1.3] },
    { name: 'rot_B_L2', rot: [-0.25, 0.15, -1.45], pos: [0.5, 10.5, 2.2] },
    { name: 'rot_C', rot: [-0.15, 0.0, -1.57], pos: [0.0, 10.5, 2.0] },
    { name: 'rot_D', rot: [-0.35, 0.20, -1.35], pos: [0.8, 10.8, 2.4] },
    { name: 'rot_E', rot: [0.15, -0.15, 1.45], pos: [-0.5, 10.5, 2.2] },
    { name: 'rot_F', rot: [0.25, 0.0, 1.57], pos: [0.0, 10.5, 2.0] }
  ];

  for (const c of rotCandidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        if (sr.weaponOrient) {
          sr.weaponOrient.position.x = ${c.pos[0]};
          sr.weaponOrient.position.y = ${c.pos[1]};
          sr.weaponOrient.position.z = ${c.pos[2]};
          sr.weaponOrient.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});
        }
      })()`
    });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/calib_rot_${c.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/calib_rot_${c.name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

