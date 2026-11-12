const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_both_' + Date.now());
const PORT = 9999;

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
    expression: "(() => { const chk = document.getElementById('chk-bone-helpers'); if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); } })()"
  });

  async function snap(filename) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filename, Buffer.from(s.data, 'base64'));
  }

  // 1. Man engineer with apprentice wand (same viewpoint as user screenshot)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05);
    })()`
  });
  await sleep(2500);
  await snap('screenshots/verify_man_hand_fixed.png');

  // 2. Man engineer walk animation
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'walk';
      selAnim.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1000);
  await snap('screenshots/verify_man_walk_fixed.png');

  // 3. Woman engineer with apprentice wand (side view)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_woman';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(0.85, 2.2, 0.05, -1.57, 0, 0);
    })()`
  });
  await sleep(2500);
  await snap('screenshots/verify_woman_hand_unchanged.png');

  edge.kill();
  console.log('VERIFICATION BOTH COMPLETED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

