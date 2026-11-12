const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_v16_verify_' + Date.now());
const PORT = 9939;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  const consoleErrors = [];
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.method === 'Runtime.consoleAPICalled' && resp.params && resp.params.type === 'error') {
          consoleErrors.push(resp.params.args.map(a => a.value || a.description).join(' '));
        }
        if (resp.id === id) { ws.off('message', handler); resolve(resp.result); }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(2000);

  console.log('Testing Man in showroom with ?v=sr-16...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // 1. Man Hand Closeup in Idle (front-right view matching user Image 1)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.40, -0.23, 0.04);`
  });
  await sleep(400);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v16_man_hand_front.png', Buffer.from(snap.data, 'base64'));

  // 2. Man Full Body Idle
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full');` });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v16_man_idle_full.png', Buffer.from(snap.data, 'base64'));

  // 3. Man Walk Animation (Side Profile & Isometric matching user Image 2)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1000);

  // Isometric view (matching user Image 2)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.7, 0.15, 0.45, 0, 0);`
  });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v16_man_walk_iso.png', Buffer.from(snap.data, 'base64'));

  // Side view in Walk
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v16_man_walk_side.png', Buffer.from(snap.data, 'base64'));

  // 4. Man Run Animation (Side View)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'run';
      selA.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(1000);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v16_man_run_side.png', Buffer.from(snap.data, 'base64'));

  // Measure weapon angle in walk over multiple frames
  const walkAngles = [];
  for (let i = 0; i < 8; i++) {
    await sleep(100);
    const ang = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand');
        const wp = window._sr.weaponPivot;
        const mesh = wp.children[0];
        const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
        let pTip = pHand.clone(), maxD = 0;
        mesh.traverse(o => {
          if (o.isMesh && o.geometry) {
            const pos = o.geometry.attributes.position;
            const p = new THREE.Vector3();
            for (let j = 0; j < pos.count; j += 40) {
              p.fromBufferAttribute(pos, j);
              p.applyMatrix4(o.matrixWorld);
              const d = p.distanceTo(pHand);
              if (d > maxD) { maxD = d; pTip = p.clone(); }
            }
          }
        });
        const dir = pTip.clone().sub(pHand).normalize();
        return {
          tipY: +pTip.y.toFixed(3),
          handY: +pHand.y.toFixed(3),
          angleFromGroundDeg: +(Math.asin(Math.abs(dir.y)) * 180 / Math.PI).toFixed(1),
          pointingDown: pTip.y <= pHand.y,
          pointingForward: dir.z > 0
        };
      })()`,
      returnByValue: true
    });
    walkAngles.push(ang.result.value);
  }
  console.log('Walk angles verification:');
  console.log(JSON.stringify(walkAngles, null, 2));

  console.log('Console errors:', consoleErrors);
  console.log('All v16 verifications completed!');

  ws.close();
  edge.kill();
}
run().catch(console.error);

