const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_curl_' + Date.now());
const PORT = 9231;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    'about:blank'
  ]);

  for (let i = 0; i < 25; i++) {
    await sleep(200);
    try { await requestJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch (_) {}
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(3500);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Focus camera close up on the right hand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const hand = sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      if (hand) {
        const p = new THREE.Vector3();
        hand.getWorldPosition(p);
        sr.controls.target.copy(p);
        sr.camera.position.set(p.x + 0.35, p.y + 0.1, p.z + 0.55);
        sr.controls.update();
      }
    })()`
  });
  await sleep(1000);

  // Capture baseline open hand
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/hand_baseline_open.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/hand_baseline_open.png');

  // Test curling on local axes
  const curlTests = [
    { axis: 'x', angle: 1.2 },
    { axis: 'y', angle: 1.2 },
    { axis: 'z', angle: 1.2 }
  ];

  for (const t of curlTests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
        fingers.forEach(f => {
          for (let j = 1; j <= 3; j++) {
            const b = model.getObjectByName('mixamorigRightHand' + f + j);
            if (b) {
              b.rotation.set(0, 0, 0);
              b.rotation['${t.axis}'] = ${t.angle};
            }
          }
        });
        // thumb
        for (let j = 1; j <= 3; j++) {
          const b = model.getObjectByName('mixamorigRightHandThumb' + j);
          if (b) {
            b.rotation.set(0, 0, 0);
            b.rotation['${t.axis}'] = ${t.angle * 0.7};
          }
        }
      })()`
    });
    await sleep(400);

    shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = `screenshots/hand_curl_axis_${t.axis}.png`;
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${fn}`);
  }

  edge.kill();
  process.exit(0);
}
main();

