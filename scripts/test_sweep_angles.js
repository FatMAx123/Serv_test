const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_ref25_' + Date.now());
const PORT = 9987;

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
  await sleep(2000);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: "(() => { const chk = document.getElementById('chk-bone-helpers'); if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); } const sel = document.getElementById('sel-weapon'); sel.value = 'apprentice_wand'; sel.dispatchEvent(new Event('change')); })()"
  });
  await sleep(1500);

  const angles = [
    { name: 'phi_1.1345_25deg_ground', phi: 1.1345 },
    { name: 'phi_1.2217_20deg_ground', phi: 1.2217 },
    { name: 'phi_1.3090_15deg_ground', phi: 1.3090 }
  ];

  for (const a of angles) {
    await send('Runtime.evaluate', {
      expression: "(() => { const wo = window._sr.weaponOrient; wo.rotation.set(Math.PI * 0.5, -" + a.phi + ", " + a.phi + "); window._sr.setCameraPreset(0.85, 2.2, 0.05, -1.57, 0, 0); })()"
    });
    await sleep(300);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/' + a.name + '_wand.png', Buffer.from(s.data, 'base64'));

    // Also switch to tears_fairy
    await send('Runtime.evaluate', {
      expression: "(() => { const sel = document.getElementById('sel-weapon'); sel.value = 'tears_fairy'; sel.dispatchEvent(new Event('change')); })()"
    });
    await sleep(1000);
    await send('Runtime.evaluate', {
      expression: "(() => { const wo = window._sr.weaponOrient; wo.rotation.set(Math.PI * 0.5, -" + a.phi + ", " + a.phi + "); })()"
    });
    await sleep(300);
    const sTears = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/' + a.name + '_tears.png', Buffer.from(sTears.data, 'base64'));

    // Back to apprentice_wand
    await send('Runtime.evaluate', {
      expression: "(() => { const sel = document.getElementById('sel-weapon'); sel.value = 'apprentice_wand'; sel.dispatchEvent(new Event('change')); })()"
    });
    await sleep(1000);
  }

  edge.kill();
  console.log('SWEEP DONE');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

