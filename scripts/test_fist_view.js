const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_check_' + Date.now());
const PORT = 9270;

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

  // Equip weapon and set camera
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
      return 'equipped apprentice_wand';
    })()`
  });
  console.log('Equip result:', evalRes);
  await sleep(2000);

  async function focusAndShot(name, azi, ele, dist) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
        if (!hand) return { err: 'no hand' };
        
        hand.updateWorldMatrix(true, false);
        const wp = new window.THREE.Vector3();
        hand.getWorldPosition(wp);
        
        const controls = sr.controls;
        const camera = sr.camera;
        controls.target.copy(wp);
        
        const cosEle = Math.cos(${ele});
        const sinEle = Math.sin(${ele});
        const dist = ${dist};
        const azi = ${azi};
        camera.position.set(
          wp.x + dist * Math.sin(azi) * cosEle,
          wp.y + dist * sinEle,
          wp.z + dist * Math.cos(azi) * cosEle
        );
        camera.lookAt(wp);
        controls.update();
        return { ok: true, wp: [wp.x, wp.y, wp.z], cam: [camera.position.x, camera.position.y, camera.position.z] };
      })()`,
      returnByValue: true
    });
    console.log('Camera res:', r.result.value);
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = `screenshots/${name}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(out, `C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/${name}.png`);
    console.log(`Saved ${name}.png`);
  }

  // 1. Rear right angle (like user screenshot 5: azi ~ 2.4 rad = 135 deg, ele ~ 0.1, dist 0.45m)
  await focusAndShot('fist_rear_right', 2.4, 0.1, 0.45);

  // 2. Front angle (azi ~ 0.2 rad, ele ~ 0.1, dist 0.45m)
  await focusAndShot('fist_front', 0.2, 0.1, 0.45);

  // 3. Side right angle (azi ~ 1.57 rad = 90 deg, ele ~ 0.0, dist 0.45m)
  await focusAndShot('fist_side', 1.57, 0.0, 0.45);

  ws.close();
  edge.kill();
}

main().catch(console.error);
