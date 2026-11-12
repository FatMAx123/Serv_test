const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_curl_' + Date.now());
const PORT = 9330;
const BRAIN_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html?v=' + Date.now() });
  await sleep(4000);

  // Turn off bone helpers & select apprentice wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const tt = document.getElementById('chk-turntable');
      if (tt && tt.checked) { tt.checked = false; tt.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(2000);

  // Focus camera close to right hand
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.setCameraPreset(0.95, 0.40, 0.05, 1.57, -0.24, 0.02);
    })()`
  });
  await sleep(600);

  // Test purely X rotation vs purely Z rotation
  const tests = [
    { name: 'test_curl_rotX_pos', code: `b.rotateX(0.8);` },
    { name: 'test_curl_rotX_neg', code: `b.rotateX(-0.8);` },
    { name: 'test_curl_rotZ_pos', code: `b.rotateZ(0.8);` },
    { name: 'test_curl_rotZ_neg', code: `b.rotateZ(-0.8);` }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        // Pause mixer so we can inspect pure rotation
        sr.state.animPaused = true;
        const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
        fingers.forEach(f => {
          for (let j = 1; j <= 3; j++) {
            const b = model.getObjectByName('mixamorigRightHand' + f + j) ||
                      model.getObjectByName('mixamorig:RightHand' + f + j);
            if (b) {
              ${t.code}
            }
          }
        });
      })()`
    });
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const localPath = `screenshots/${t.name}.png`;
    fs.writeFileSync(localPath, Buffer.from(shot.data, 'base64'));
    const brainPath = path.join(BRAIN_DIR, `${t.name}.png`);
    fs.copyFileSync(localPath, brainPath);
    console.log(`Saved ${t.name}.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

