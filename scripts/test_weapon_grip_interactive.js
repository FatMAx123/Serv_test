const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sr_grip_' + Date.now());
const PORT = 9235;

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

  for (let i = 0; i < 30; i++) {
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
  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone helper spheres
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Focus camera close up on right hand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const hand = sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      if (hand) {
        const p = new window.THREE.Vector3();
        hand.getWorldPosition(p);
        sr.controls.target.copy(p);
        sr.camera.position.set(p.x + 0.25, p.y + 0.1, p.z + 0.85);
        sr.controls.update();
      }
    })()`
  });
  await sleep(1000);

  // Inject weapon test function into browser
  const setupResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const THREE = window.THREE;
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand');
      if (!hand) return { error: 'No mixamorigRightHand' };

      // Load novice FBX directly
      const loader = new THREE.FBXLoader ? new THREE.FBXLoader() : null;
      // We can use the existing fbxLoader
      return { ok: true, handName: hand.name };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Hand check:', setupResult.result.value);

  // Take screenshot of open hand
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/hand_open_closeup.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/hand_open_closeup.png');

  edge.kill();
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

