const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_punch_fist_' + Date.now());
const PORT = 9991;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

const MAN_PUNCH_FIST_QUATS = {
  RightHandIndex1: [0.57274, -0.03487, 0.03333, 0.81831],
  RightHandIndex2: [0.59608, -0.00003, 0.06191, 0.80054],
  RightHandIndex3: [0.47219, 0.00002, 0.04899, 0.88014],
  RightHandMiddle1: [0.5862, -0.02563, 0.03538, 0.80899],
  RightHandMiddle2: [0.66697, 0.00049, 0.07965, 0.74082],
  RightHandMiddle3: [0.30434, -0.00016, 0.03806, 0.9518],
  RightHandPinky1: [0.55405, -0.00686, 0.02055, 0.8322],
  RightHandPinky2: [0.66539, 0.0011, 0.09212, 0.74079],
  RightHandPinky3: [0.30364, -0.00051, 0.04486, 0.95173],
  RightHandRing1: [0.58711, -0.01992, 0.03113, 0.80867],
  RightHandRing2: [0.66639, 0.00008, 0.08265, 0.74101],
  RightHandRing3: [0.34331, -0.00004, 0.04302, 0.93824],
  RightHandThumb1: [0.40896, -0.09913, -0.29541, 0.8577],
  RightHandThumb2: [0.05805, -0.03473, 0.34418, 0.93646],
  RightHandThumb3: [0.01103, 0.13151, 0.60998, 0.78135]
};

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

  // Turn off bone helpers, select engi_man, apprentice_wand, WALK animation
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
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'walk';
      selAnim.dispatchEvent(new Event('change'));
      // Exactly match the user screenshot camera:
      window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05);
    })()`
  });
  await sleep(2500);

  // Install hook to apply MAN_PUNCH_FIST_QUATS on every frame:
  await send('Runtime.evaluate', {
    expression: `(() => {
      const qMap = ${JSON.stringify(MAN_PUNCH_FIST_QUATS)};
      const threeQMap = {};
      for (const [k, v] of Object.entries(qMap)) {
        threeQMap[k] = new THREE.Quaternion(v[0], v[1], v[2], v[3]);
      }
      setInterval(() => {
        if (!window._sr || !window._sr.activeCharacterModel) return;
        const model = window._sr.activeCharacterModel;
        for (const [boneName, q] of Object.entries(threeQMap)) {
          const bone = model.getObjectByName('mixamorig' + boneName) || model.getObjectByName('mixamorig:' + boneName);
          if (bone) {
            bone.quaternion.copy(q);
          }
        }
      }, 15);
    })()`
  });
  await sleep(1000);

  let s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_walk_perfect_punch_fist.png', Buffer.from(s.data, 'base64'));

  // Also test idle animation
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'idle';
      selAnim.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1000);
  let sIdle = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_idle_perfect_punch_fist.png', Buffer.from(sIdle.data, 'base64'));

  edge.kill();
  console.log('MAN PERFECT PUNCH FIST TEST SAVED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

