const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_straight_' + Date.now());
const PORT = 9998;

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

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }
    })()`
  });

  const weapons = ['novice', 'magic_mace', 'atuba_mace', 'demon_staff', 'tears_fairy'];
  for (const w of weapons) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        sel.value = '${w}';
        sel.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    // Full view
    await send('Runtime.evaluate', { expression: `document.getElementById('cam-full').click();` });
    await sleep(800);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/perfect_${w}_full.png`, Buffer.from(shot.data, 'base64'));

    // Closeup view
    await send('Runtime.evaluate', { expression: `document.getElementById('cam-weapon').click();` });
    await sleep(800);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/perfect_${w}_closeup.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Rendered perfect_${w}`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

