const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_weapon_test_' + Date.now());
const PORT = 9228;

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
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          resolve(resp.result);
        }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

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

  // Switch camera to weapon preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  // Test curling directions: +X, -X, +Z, -Z
  const tests = [
    { name: 'rot_plus_X', fn: `b.rotateX(0.85);` },
    { name: 'rot_minus_X', fn: `b.rotateX(-0.85);` },
    { name: 'rot_plus_Z', fn: `b.rotateZ(0.85);` },
    { name: 'rot_minus_Z', fn: `b.rotateZ(-0.85);` }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        // Pause mixer so our curl stays
        sr.state.animPaused = true;
        const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
        fingers.forEach(f => {
          for (let j = 1; j <= 3; j++) {
            const b = model.getObjectByName('mixamorigRightHand' + f + j) || model.getObjectByName('mixamorig:RightHand' + f + j);
            if (b) {
              ${t.fn}
            }
          }
        });
      })()`
    });
    await sleep(500);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = `screenshots/test_curl_${t.name}.png`;
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${fn}`);

    // Reset by resuming mixer briefly
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        sr.state.animPaused = false;
      })()`
    });
    await sleep(300);
  }

  edge.kill();
  console.log('All tests captured!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
