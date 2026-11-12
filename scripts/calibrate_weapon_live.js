const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_calib_' + Date.now());
const PORT = 9933;

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

  // Turn off bone helpers and click cam-weapon
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

  // Test Z offsets in meters: 0.013 (current), 0.025, 0.035, 0.045
  const zCandidates = [0.013, 0.025, 0.035, 0.045];
  for (const z of zCandidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        if (sr.weaponOrient) {
          // Hand bone scale is 0.01, so meters * 100
          sr.weaponOrient.position.z = ${z} * 100.0;
        }
      })()`
    });
    await sleep(600);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/calib_z_${z}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/calib_z_${z}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
