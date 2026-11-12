const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_exact_fist_' + Date.now());
const PORT = 9991;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  // Switch to engi_man, apprentice_wand, pause anim, hide helpers
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

  // Focus camera directly on the right hand:
  // engi_man right hand is around x = -0.23, y = 0.87, z = 0.03
  await send('Runtime.evaluate', {
    expression: `(() => {
      // In showroom.js: setCameraPreset(targetY, dist, elevationAngle, azimuthAngle, targetX, targetZ)
      window._sr.setCameraPreset(0.85, 0.70, 0.15, 0.65, -0.23, 0.03);
    })()`
  });
  await sleep(300);

  // Test candidate fist configs
  const DEG2RAD = Math.PI / 180;
  function eulerToQuat(x, y, z) {
    return [x, y, z];
  }

  const candidates = [
    {
      name: 'fist_A',
      thumb: { t1: [10, -30, -10], t2: [20, -15, 25], t3: [15, 0, 30] },
      fingers: {
        i1: [70, 0, -5], i2: [85, 0, 0], i3: [70, 0, 0],
        m1: [70, 0, 0], m2: [90, 0, 0], m3: [70, 0, 0],
        r1: [75, 0, 3], r2: [95, 0, 0], r3: [75, 0, 0],
        p1: [80, 0, 8], p2: [95, 0, 0], p3: [75, 0, 0]
      }
    },
    {
      name: 'fist_B',
      thumb: { t1: [15, -45, -5], t2: [30, -10, 20], t3: [25, 0, 25] },
      fingers: {
        i1: [75, 0, -5], i2: [85, 0, 0], i3: [75, 0, 0],
        m1: [75, 0, 0], m2: [90, 0, 0], m3: [75, 0, 0],
        r1: [80, 0, 3], r2: [95, 0, 0], r3: [75, 0, 0],
        p1: [85, 0, 8], p2: [95, 0, 0], p3: [75, 0, 0]
      }
    },
    {
      name: 'fist_C',
      thumb: { t1: [25, -35, -20], t2: [35, -15, 15], t3: [25, 0, 20] },
      fingers: {
        i1: [75, 0, -5], i2: [85, 0, 0], i3: [75, 0, 0],
        m1: [75, 0, 0], m2: [90, 0, 0], m3: [75, 0, 0],
        r1: [80, 0, 3], r2: [95, 0, 0], r3: [75, 0, 0],
        p1: [85, 0, 8], p2: [95, 0, 0], p3: [75, 0, 0]
      }
    },
    {
      name: 'fist_D',
      thumb: { t1: [20, -25, -30], t2: [30, -10, 10], t3: [20, 0, 15] },
      fingers: {
        i1: [75, 0, -5], i2: [85, 0, 0], i3: [75, 0, 0],
        m1: [75, 0, 0], m2: [90, 0, 0], m3: [75, 0, 0],
        r1: [80, 0, 3], r2: [95, 0, 0], r3: [75, 0, 0],
        p1: [85, 0, 8], p2: [95, 0, 0], p3: [75, 0, 0]
      }
    }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG2RAD = Math.PI / 180;
        const e2q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        const m = window._sr.activeCharacterModel;
        const setQ = (bName, e) => {
          const b = m.getObjectByName('mixamorig:' + bName) || m.getObjectByName('mixamorig' + bName);
          if (b) b.quaternion.copy(e2q(e[0], e[1], e[2]));
        };

        const f = ${JSON.stringify(c.fingers)};
        const t = ${JSON.stringify(c.thumb)};

        setQ('RightHandIndex1', f.i1);
        setQ('RightHandIndex2', f.i2);
        setQ('RightHandIndex3', f.i3);

        setQ('RightHandMiddle1', f.m1);
        setQ('RightHandMiddle2', f.m2);
        setQ('RightHandMiddle3', f.m3);

        setQ('RightHandRing1', f.r1);
        setQ('RightHandRing2', f.r2);
        setQ('RightHandRing3', f.r3);

        setQ('RightHandPinky1', f.p1);
        setQ('RightHandPinky2', f.p2);
        setQ('RightHandPinky3', f.p3);

        setQ('RightHandThumb1', t.t1);
        setQ('RightHandThumb2', t.t2);
        setQ('RightHandThumb3', t.t3);

        m.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    // Front-ish view of hand
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.65, 0.15, 0.20, -0.23, 0.03)`
    });
    await sleep(200);
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${c.name}_front.png`, Buffer.from(snap.data, 'base64'));

    // Side view of hand
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.65, 0.15, -Math.PI * 0.5, -0.23, 0.03)`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${c.name}_side.png`, Buffer.from(snap.data, 'base64'));

    // Back-ish view of hand (to check finger curl from behind, like screenshot 9!)
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.65, 0.15, -Math.PI * 0.9, -0.23, 0.03)`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${c.name}_back.png`, Buffer.from(snap.data, 'base64'));

    console.log(`Saved screenshots for ${c.name}`);
  }

  ws.close();
  edge.kill();
}

run().catch(console.error);

