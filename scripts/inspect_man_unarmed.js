const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_rest_hand_' + Date.now());
const PORT = 9944;

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

  // Switch to engi_man with weapon = 'none' to see the natural rest pose of the hand!
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'none';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Inspect rest quaternions of all fingers and thumb in idle without weapon
  const restBones = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const bones = {};
      m.traverse(o => {
        if (o.isBone && o.name.startsWith('mixamorigRightHand')) {
          const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
          bones[o.name] = {
            q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map(v => +v.toFixed(4)),
            eulerDeg: [e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI].map(v => +v.toFixed(1))
          };
        }
      });
      return bones;
    })()`,
    returnByValue: true
  });

  console.log('Man rest hand bones (NO weapon, pure idle):');
  console.log(JSON.stringify(restBones.result.value, null, 2));

  // Also take a screenshot of the hand in pure idle
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.50, -0.23, 0.04);`
  });
  await sleep(400);
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_hand_unarmed_idle.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}
run().catch(console.error);

