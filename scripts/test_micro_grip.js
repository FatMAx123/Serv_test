const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_micro_' + Date.now());
const PORT = 9991;

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

  // We test 8 precision variants around the vertical alignment:
  // pos: [x, y, z] in bone units (cm)
  // rot: [rx, ry, rz] in radians (small tilt forward/lateral)
  const candidates = [
    { name: 'cand_1', pos: [0.0, 6.8, 2.2], rot: [0.0, 0.0, 0.0] },
    { name: 'cand_2', pos: [0.8, 6.8, 2.4], rot: [0.0, 0.0, 0.0] },
    { name: 'cand_3', pos: [1.5, 6.8, 2.2], rot: [0.0, 0.0, 0.0] },
    { name: 'cand_4', pos: [0.8, 6.8, 2.8], rot: [0.0, 0.0, 0.0] },
    { name: 'cand_5', pos: [0.8, 7.5, 2.4], rot: [-0.08, 0.0, 0.0] },
    { name: 'cand_6', pos: [0.8, 7.5, 2.4], rot: [0.08, 0.0, 0.0] },
    { name: 'cand_7', pos: [0.8, 7.5, 2.4], rot: [0.0, 0.0, -0.08] },
    { name: 'cand_8', pos: [0.8, 7.5, 2.4], rot: [0.0, 0.0, 0.08] }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        if (sr.weaponOrient) {
          sr.weaponOrient.position.set(${c.pos[0]}, ${c.pos[1]}, ${c.pos[2]});
          sr.weaponOrient.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});
        }
      })()`
    });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_cand_${c.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/test_cand_${c.name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
