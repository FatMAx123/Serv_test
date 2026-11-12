const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_thumb_grid_' + Date.now());
const PORT = 9999;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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

  // Setup showroom: select engi_man, apprentice_wand, zoom to right hand
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
      window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05);
    })()`
  });
  await sleep(2500);

  // Test various angles for mixamorigRightHandThumb1, 2, 3
  // We want the thumb to curl INWARD (toward palm and fingers), NOT outward
  const tests = [
    // Bending thumb inward across palm:
    { name: 'tuck_z_pos', t1: [0, 0, 50], t2: [0, 0, 40], t3: [0, 0, 20] },
    { name: 'tuck_z_neg', t1: [0, 0, -50], t2: [0, 0, -40], t3: [0, 0, -20] },
    { name: 'tuck_x_pos', t1: [50, 0, 0], t2: [40, 0, 0], t3: [20, 0, 0] },
    { name: 'tuck_x_neg', t1: [-50, 0, 0], t2: [-40, 0, 0], t3: [-20, 0, 0] },
    { name: 'tuck_y_pos', t1: [0, 50, 0], t2: [0, 40, 0], t3: [0, 20, 0] },
    { name: 'tuck_y_neg', t1: [0, -50, 0], t2: [0, -40, 0], t3: [0, -20, 0] },
    // Compound curls:
    { name: 'compound_1', t1: [30, -30, 40], t2: [40, 0, 30], t3: [20, 0, 20] },
    { name: 'compound_2', t1: [-30, 30, -40], t2: [-40, 0, -30], t3: [-20, 0, -20] },
    { name: 'compound_3', t1: [20, 45, -30], t2: [30, 20, -20], t3: [20, 0, -10] },
    { name: 'compound_4', t1: [-20, -45, 30], t2: [-30, -20, 20], t3: [-20, 0, 10] },
    // Extreme tuck into palm:
    { name: 'tight_fist_1', t1: [45, 30, 45], t2: [60, 0, 30], t3: [40, 0, 0] },
    { name: 'tight_fist_2', t1: [-45, -30, -45], t2: [-60, 0, -30], t3: [-40, 0, 0] }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG = Math.PI / 180;
        const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${t.t1[0]} * DEG, ${t.t1[1]} * DEG, ${t.t1[2]} * DEG, 'XYZ'));
        const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${t.t2[0]} * DEG, ${t.t2[1]} * DEG, ${t.t2[2]} * DEG, 'XYZ'));
        const q3 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${t.t3[0]} * DEG, ${t.t3[1]} * DEG, ${t.t3[2]} * DEG, 'XYZ'));
        window._activeManThumbQ = [q1, q2, q3];
      })()`
    });

    // Make sure hook updates them continuously
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (!window._manLoopHook) {
          window._manLoopHook = true;
          const origAnimate = window.requestAnimationFrame;
          setInterval(() => {
            if (window._activeManThumbQ && window._sr.activeCharacterModel) {
              const b1 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb1');
              const b2 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb2');
              const b3 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb3');
              if (b1) b1.quaternion.copy(window._activeManThumbQ[0]);
              if (b2) b2.quaternion.copy(window._activeManThumbQ[1]);
              if (b3) b3.quaternion.copy(window._activeManThumbQ[2]);
            }
          }, 15);
        }
      })()`
    });
    await sleep(250);

    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/man_grid_' + t.name + '.png', Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('MAN THUMB GRID TESTS SAVED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

