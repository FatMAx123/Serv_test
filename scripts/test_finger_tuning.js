const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_hand_' + Date.now());
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

  // Turn off bone helpers, pause anim on frame 0, equip apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
      const sr = window._sr;
      if (sr && sr.activeMixer) {
        sr.activeMixer.timeScale = 0;
      }
    })()`
  });
  await sleep(2500);

  // Focus camera directly onto the RightHand bone close-up from side/front
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      if (hand && sr.controls && sr.camera) {
        const wp = new window.THREE.Vector3();
        hand.getWorldPosition(wp);
        // Look directly at hand from front-right
        sr.controls.target.copy(wp);
        sr.camera.position.set(wp.x + 0.35, wp.y + 0.1, wp.z + 0.35);
        sr.controls.update();
      }
    })()`
  });
  await sleep(1000);

  async function takeShot(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = `screenshots/hand_${name}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(out, `C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/hand_${name}.png`);
    console.log(`Saved hand_${name}.png`);
  }

  await takeShot('0_baseline');

  ws.close();
  edge.kill();
}

main().catch(console.error);

