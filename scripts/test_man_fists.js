const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_test_' + Date.now());
const PORT = 9988;

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

  // Switch to engi_man, apprentice_wand, pause
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

  // Focus camera directly on weapon and right hand
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.frameCamera('weapon');
    })()`
  });
  await sleep(500);

  // Candidate fist Euler angles for the man:
  // Note: All fingers curl along X axis!
  // Index, Middle, Ring, Pinky:
  // Knuckle 1: 75°
  // Knuckle 2: 85°
  // Knuckle 3: 75° (tight wrap)
  // For thumb:
  // In resting pose, thumb is at [16, -16, -42].
  // To fold across fingers:
  // Thumb1 needs: rotation around X to move forward, rotation around Y to move across palm, rotation around Z to align.
  const configs = [
    {
      name: 'fist_tuck_tight',
      t1: [25, -35, -20],
      t2: [35, -15, 20],
      t3: [25, 0, 25]
    },
    {
      name: 'fist_clasp_down',
      t1: [15, -40, -10],
      t2: [30, -15, 25],
      t3: [20, 0, 25]
    },
    {
      name: 'fist_clasp_natural',
      t1: [10, -30, -15],
      t2: [25, -15, 20],
      t3: [15, 0, 20]
    },
    {
      name: 'fist_rest_curled',
      t1: [20, -20, -35],
      t2: [25, -15, 30],
      t3: [15, 0, 25]
    }
  ];

  for (const cfg of configs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG2RAD = Math.PI / 180;
        const e2q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        const m = window._sr.activeCharacterModel;
        const setQ = (bName, x, y, z) => {
          const b = m.getObjectByName('mixamorig:' + bName) || m.getObjectByName('mixamorig' + bName);
          if (b) b.quaternion.copy(e2q(x, y, z));
        };

        // Tight finger curls
        setQ('RightHandIndex1', 75, 0, -5);
        setQ('RightHandIndex2', 85, 0, 0);
        setQ('RightHandIndex3', 75, 0, 0);

        setQ('RightHandMiddle1', 75, 0, 0);
        setQ('RightHandMiddle2', 90, 0, 0);
        setQ('RightHandMiddle3', 75, 0, 0);

        setQ('RightHandRing1', 80, 0, 3);
        setQ('RightHandRing2', 95, 0, 0);
        setQ('RightHandRing3', 75, 0, 0);

        setQ('RightHandPinky1', 85, 0, 8);
        setQ('RightHandPinky2', 95, 0, 0);
        setQ('RightHandPinky3', 75, 0, 0);

        // Thumb
        const t1 = ${JSON.stringify(cfg.t1)};
        const t2 = ${JSON.stringify(cfg.t2)};
        const t3 = ${JSON.stringify(cfg.t3)};
        setQ('RightHandThumb1', t1[0], t1[1], t1[2]);
        setQ('RightHandThumb2', t2[0], t2[1], t2[2]);
        setQ('RightHandThumb3', t3[0], t3[1], t3[2]);

        m.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    // Capture front / side / back
    // View 1: Weapon default framing
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon');` });
    await sleep(200);
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${cfg.name}_angle.png`, Buffer.from(snap.data, 'base64'));

    // View 2: From front
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, 0.05, -0.23, 0.03);`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${cfg.name}_front.png`, Buffer.from(snap.data, 'base64'));

    // View 3: From side
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, -Math.PI * 0.5, -0.23, 0.03);`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${cfg.name}_side.png`, Buffer.from(snap.data, 'base64'));

    console.log(`Captured ${cfg.name}`);
  }

  ws.close();
  edge.kill();
  console.log('Done!');
}

run().catch(console.error);

