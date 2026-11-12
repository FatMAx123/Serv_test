const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_testman_' + Date.now());
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
  await sleep(2000);

  // Turn off bone helpers, select engi_man, apprentice_wand, pause animation
  await send('Runtime.evaluate', {
    expression: "(() => { const chk = document.getElementById('chk-bone-helpers'); if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); } const selChar = document.getElementById('sel-character'); selChar.value = 'engi_man'; selChar.dispatchEvent(new Event('change')); const selW = document.getElementById('sel-weapon'); selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); window._sr.state.animPaused = true; })()"
  });
  await sleep(2500);

  // Set close up on man's right hand from the side (same as user screenshot)
  await send('Runtime.evaluate', {
    expression: "(() => { window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05); })()"
  });
  await sleep(500);

  // Screenshot 1: CURRENT state (with thumb sticking out)
  let s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_hand_current.png', Buffer.from(s.data, 'base64'));

  // What is the native thumb rotation in man's idle animation clip?
  const nativeThumb = await send('Runtime.evaluate', {
    expression: `(() => {
      const model = window._sr.activeCharacterModel;
      const b1 = model.getObjectByName('mixamorigRightHandThumb1');
      const b2 = model.getObjectByName('mixamorigRightHandThumb2');
      const b3 = model.getObjectByName('mixamorigRightHandThumb3');
      return JSON.stringify({
        b1: [b1.rotation.x, b1.rotation.y, b1.rotation.z],
        b2: [b2.rotation.x, b2.rotation.y, b2.rotation.z],
        b3: [b3.rotation.x, b3.rotation.y, b3.rotation.z]
      });
    })()`
  });
  console.log('Current thumb rotation in scene:', nativeThumb.result.value);

  edge.kill();
  console.log('DONE');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

