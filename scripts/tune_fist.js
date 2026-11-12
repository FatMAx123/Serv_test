const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_fist_' + Date.now());
const PORT = 9260;

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

  // Turn off bone helpers & select apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
      
      // Override updateHandGrip dynamically on window
      window._customGripFn = null;
      const origUpdateHandGrip = window.updateHandGrip;
    })()`
  });
  await sleep(2000);

  // Position camera exactly like screenshot 5: close to right hand from rear-right
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      const wp = new window.THREE.Vector3();
      hand.getWorldPosition(wp);
      
      // Camera view: rear-right close up
      sr.controls.target.set(wp.x, wp.y - 0.02, wp.z);
      // in world: character faces +Z (or -Z). wp.x is around -0.23, wp.y ~ 0.97, wp.z ~ 0.00
      // Rear right view: x: -0.23 - 0.25, y: 0.97 + 0.02, z: 0.00 - 0.35
      sr.camera.position.set(wp.x - 0.25, wp.y + 0.02, wp.z - 0.35);
      sr.controls.update();
    })()`
  });
  await sleep(500);

  const shotBase = await send('Page.captureScreenshot', { format: 'png' });
  const outBase = 'screenshots/fist_baseline.png';
  fs.writeFileSync(outBase, Buffer.from(shotBase.data, 'base64'));
  fs.copyFileSync(outBase, 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/fist_baseline.png');
  console.log('Saved fist_baseline.png');

  ws.close();
  edge.kill();
}

main().catch(console.error);

