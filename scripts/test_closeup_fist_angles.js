const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_' + Date.now());
const PORT = 9888;

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

  // Turn off bone helper spheres
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Define 3 camera views for the hand
  const views = [
    { name: 'right_side', cam: [-0.65, 0.90, 0.05], target: [-0.25, 0.85, 0.0] },
    { name: 'rear_right', cam: [-0.55, 0.95, -0.35], target: [-0.25, 0.85, 0.0] },
    { name: 'front_right', cam: [-0.55, 0.90, 0.35], target: [-0.25, 0.85, 0.0] }
  ];

  for (const v of views) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        sr.camera.position.set(${v.cam.join(',')});
        sr.controls.target.set(${v.target.join(',')});
        sr.controls.update();
      })()`
    });
    await sleep(800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_angle_${v.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/fist_angle_${v.name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
