const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_arm_' + Date.now());
const PORT = 9977;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Failed to connect to Edge DevTools');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
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

  // Set engi_man, apprentice_wand, pause
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Full body front screenshot of current state
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full');` });
  await sleep(300);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/curr_man_full.png', Buffer.from(snap.data, 'base64'));

  // Let's inspect the world direction of the weapon right now
  const dirInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const wMesh = window._sr.weaponPivot ? window._sr.weaponPivot.children[0] : null;
      const hand = window._sr.charRoot.getObjectByName('mixamorigRightHand');
      const hPos = new THREE.Vector3(); hand.getWorldPosition(hPos);

      // Find weapon head
      let maxDist = 0, pHead = hPos.clone();
      wMesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          const p = new THREE.Vector3();
          for (let i = 0; i < pos.count; i += 20) {
            p.fromBufferAttribute(pos, i);
            p.applyMatrix4(o.matrixWorld);
            const d = p.distanceTo(hPos);
            if (d > maxDist) { maxDist = d; pHead = p.clone(); }
          }
        }
      });

      const dir = pHead.clone().sub(hPos).normalize();
      return {
        hPos: [hPos.x, hPos.y, hPos.z].map(v => +v.toFixed(3)),
        pHead: [pHead.x, pHead.y, pHead.z].map(v => +v.toFixed(3)),
        dir: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)),
        // In screen space (from front): character right hand is at -X.
        // If dir.x > 0, it points TOWARDS +X (towards the center/left leg, across the groin!).
        // If dir.x < 0, it points OUTWARD away from the body!
        lateralDir: dir.x > 0 ? 'CROSSING_GROIN_INWARD' : 'CLEARING_OUTWARD'
      };
    })()`,
    returnByValue: true
  });

  console.log('Current weapon direction:', dirInfo.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

