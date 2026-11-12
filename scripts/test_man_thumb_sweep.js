const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_thumb_' + Date.now());
const PORT = 9992;

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
    expression: "(() => { const chk = document.getElementById('chk-bone-helpers'); if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); } const selChar = document.getElementById('sel-character'); selChar.value = 'engi_man'; selChar.dispatchEvent(new Event('change')); const selW = document.getElementById('sel-weapon'); selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); window._sr.state.animPaused = true; window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05); })()"
  });
  await sleep(2500);

  // Test 1: Let animation play naturally for thumb (do not override thumb for man)
  // Let's test in a loop: disable thumb override, step mixer 1 frame
  await send('Runtime.evaluate', {
    expression: `(() => {
      // Temporarily delete thumb from locked quaternions
      window._savedThumbs = {
        RightHandThumb1: window.LOCKED_FIST_QUATERNIONS ? window.LOCKED_FIST_QUATERNIONS.RightHandThumb1 : null
      };
      // Let's see what bone rotations make man's thumb look good
    })()`
  });

  // Take screenshot with current
  let s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_thumb_before.png', Buffer.from(s.data, 'base64'));

  // Test various Euler rotations on mixamorigRightHandThumb1, 2, 3
  const tests = [
    { name: 'thumb_zero', r1: [0, 0, 0], r2: [0, 0, 0], r3: [0, 0, 0] },
    { name: 'thumb_curl_x', r1: [0.8, 0, 0], r2: [0.8, 0, 0], r3: [0.5, 0, 0] },
    { name: 'thumb_curl_z_pos', r1: [0, 0, 0.8], r2: [0, 0, 0.8], r3: [0, 0, 0.5] },
    { name: 'thumb_curl_z_neg', r1: [0, 0, -0.8], r2: [0, 0, -0.8], r3: [0, 0, -0.5] },
    { name: 'thumb_curl_y_pos', r1: [0, 0.8, 0], r2: [0, 0.8, 0], r3: [0, 0.5, 0] },
    { name: 'thumb_curl_y_neg', r1: [0, -0.8, 0], r2: [0, -0.8, 0], r3: [0, -0.5, 0] },
    { name: 'thumb_natural_fold', r1: [0.5, 0.3, -0.4], r2: [0.3, 0.2, -0.5], r3: [0.2, 0, -0.3] },
    { name: 'thumb_tuck', r1: [-0.2, 0.5, 0.8], r2: [0.1, 0.2, 0.9], r3: [0.1, 0, 0.7] }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const model = window._sr.activeCharacterModel;
        const b1 = model.getObjectByName('mixamorigRightHandThumb1');
        const b2 = model.getObjectByName('mixamorigRightHandThumb2');
        const b3 = model.getObjectByName('mixamorigRightHandThumb3');
        if (b1) b1.rotation.set(${t.r1[0]}, ${t.r1[1]}, ${t.r1[2]});
        if (b2) b2.rotation.set(${t.r2[0]}, ${t.r2[1]}, ${t.r2[2]});
        if (b3) b3.rotation.set(${t.r3[0]}, ${t.r3[1]}, ${t.r3[2]});
        model.updateMatrixWorld(true);
      })()`
    });
    await sleep(250);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/man_' + t.name + '.png', Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('MAN THUMB TESTS SAVED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

