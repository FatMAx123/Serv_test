const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_nat_motion_' + Date.now());
const PORT = 9925;

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
  await sleep(1500);

  // Switch to engi_man, apprentice_wand
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

  // Inject authentic punch fist quaternions into window._sr
  const authenticManFist = {
    RightHandIndex1: [0.57274, -0.03487, 0.03333, 0.81831],
    RightHandIndex2: [0.59608, -3e-05, 0.06191, 0.80054],
    RightHandIndex3: [0.47219, 2e-05, 0.04899, 0.88014],
    RightHandMiddle1: [0.5862, -0.02563, 0.03538, 0.80899],
    RightHandMiddle2: [0.66697, 0.00049, 0.07965, 0.74082],
    RightHandMiddle3: [0.30434, -0.00016, 0.03806, 0.9518],
    RightHandRing1: [0.58711, -0.01992, 0.03113, 0.80867],
    RightHandRing2: [0.66639, 8e-05, 0.08265, 0.74101],
    RightHandRing3: [0.34331, -4e-05, 0.04302, 0.93824],
    RightHandPinky1: [0.55405, -0.00686, 0.02055, 0.8322],
    RightHandPinky2: [0.66539, 0.0011, 0.09212, 0.74079],
    RightHandPinky3: [0.30364, -0.00051, 0.04486, 0.95173],
    RightHandThumb1: [0.40896, -0.09913, -0.29541, 0.8577],
    RightHandThumb2: [0.05805, -0.03473, 0.34418, 0.93646],
    RightHandThumb3: [0.01103, 0.13151, 0.60998, 0.78135]
  };

  // Override updateHandGrip in the browser session to test natural motion and authentic fist
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._authenticManFist = {};
      const raw = ${JSON.stringify(authenticManFist)};
      for (const [k, q] of Object.entries(raw)) {
        window._authenticManFist[k] = new THREE.Quaternion(q[0], q[1], q[2], q[3]);
      }

      // Raise weapon higher in man's hand:
      // In WEAPON_DEFINITIONS manPos was [0.005, 0.080, 0.025], let's set y to 0.065
      const wo = window._sr.weaponOrient;
      if (wo) {
        // scaleInv for man is roughly 100
        wo.position.y = 6.5; // raises weapon so pommel is ~2cm above fist
      }
    })()`
  });
  await sleep(500);

  // Take front close-up of hand with authentic fist
  // Note: temporarily hook into mixer update to apply _authenticManFist
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      for (const [bName, q] of Object.entries(window._authenticManFist)) {
        const b = m.getObjectByName('mixamorig:' + bName) || m.getObjectByName('mixamorig' + bName);
        if (b) b.quaternion.copy(q);
      }
      m.updateMatrixWorld(true);
      window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.40, -0.23, 0.04);
    })()`
  });
  await sleep(400);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/nat_man_fist_front.png', Buffer.from(snap.data, 'base64'));

  // Side closeup of hand
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.87, 0.45, 0.10, -Math.PI * 0.5, -0.23, 0.04);`
  });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/nat_man_fist_side.png', Buffer.from(snap.data, 'base64'));

  // Back closeup of hand (to see thumb wrap)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.87, 0.45, 0.10, -Math.PI * 0.85, -0.23, 0.04);`
  });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/nat_man_fist_back.png', Buffer.from(snap.data, 'base64'));

  console.log('Saved nat_man_fist screenshots!');
  ws.close();
  edge.kill();
}
run().catch(console.error);

