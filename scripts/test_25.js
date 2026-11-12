const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test25_' + Date.now());
const PORT = 9985;

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

  // Turn off bone helpers & UI
  await send('Runtime.evaluate', {
    expression: "(() => { const chk = document.getElementById('chk-bone-helpers'); if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); } const sel = document.getElementById('sel-weapon'); sel.value = 'tears_fairy'; sel.dispatchEvent(new Event('change')); })()"
  });
  await sleep(1500);

  const tests = [
    { name: '25_from_ground', phi: (90 - 25) * Math.PI / 180 }, // 65 deg from vertical = 1.1345 rad
    { name: '25_from_vertical', phi: 25 * Math.PI / 180 }         // 25 deg from vertical = 0.4363 rad
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: "(() => { const wo = window._sr.weaponOrient; wo.rotation.set(Math.PI * 0.5, -" + t.phi + ", " + t.phi + "); window._sr.setCameraPreset(0.85, 2.2, 0.05, -1.57, 0, 0); })()"
    });
    await sleep(400);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/test_angle_' + t.name + '_tears.png', Buffer.from(s.data, 'base64'));

    // Also test apprentice_wand
    await send('Runtime.evaluate', {
      expression: "(() => { const sel = document.getElementById('sel-weapon'); sel.value = 'apprentice_wand'; sel.dispatchEvent(new Event('change')); })()"
    });
    await sleep(1000);
    await send('Runtime.evaluate', {
      expression: "(() => { const wo = window._sr.weaponOrient; wo.rotation.set(Math.PI * 0.5, -" + t.phi + ", " + t.phi + "); })()"
    });
    await sleep(300);
    const sWand = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/test_angle_' + t.name + '_wand.png', Buffer.from(sWand.data, 'base64'));

    // Back to tears_fairy
    await send('Runtime.evaluate', {
      expression: "(() => { const sel = document.getElementById('sel-weapon'); sel.value = 'tears_fairy'; sel.dispatchEvent(new Event('change')); })()"
    });
    await sleep(1000);
  }

  edge.kill();
  console.log('TEST 25 DONE');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

