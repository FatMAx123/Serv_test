const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_walk_anim_' + Date.now());
const PORT = 9945;

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

  // Switch to engi_man, apprentice_wand, walk
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
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Take screenshot of walk as it is currently in showroom.js
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.7, 0.15, 0.45, 0, 0);`
  });
  await sleep(600);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/curr_man_walk_iso.png', Buffer.from(snap.data, 'base64'));

  // What does the weapon world direction do over time in walk?
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const d = await send('Runtime.evaluate', {
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
          dir: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)),
          handPos: [pHand.x, pHand.y, pHand.z].map(v => +v.toFixed(3)),
          tipPos: [pTip.x, pTip.y, pTip.z].map(v => +v.toFixed(3)),
          tipAboveHand: pTip.y > pHand.y
        };
      })()`,
      returnByValue: true
    });
    samples.push(d.result.value);
    await sleep(100);
  }

  console.log('Walk animation weapon samples:');
  console.log(JSON.stringify(samples, null, 2));

  ws.close();
  edge.kill();
}
run().catch(console.error);

