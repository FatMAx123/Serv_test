const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_fist_' + Date.now());
const PORT = 9998;

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

  // Set up engi_man, apprentice_wand, hide helpers
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
      const btnPause = document.getElementById('btn-pause-anim');
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2000);

  // Test function to set hand quaternions and capture 3 close-up views (front, profile, perspective)
  async function testFist(name, fistDefs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const defs = ${JSON.stringify(fistDefs)};
        const DEG2RAD = Math.PI / 180;
        window._activeFistOverride = {};
        for (const [k, v] of Object.entries(defs)) {
          const e = new THREE.Euler(v[0] * DEG2RAD, v[1] * DEG2RAD, v[2] * DEG2RAD, 'XYZ');
          window._activeFistOverride[k] = new THREE.Quaternion().setFromEuler(e);
        }

        // Monkey patch updateHandGrip
        window._origUpdateHandGrip = window._origUpdateHandGrip || window.updateHandGrip;
        window.updateHandGrip = function(delta) {
          const model = window._sr.activeCharacterModel;
          if (!model) return;
          for (const [boneName, fistQ] of Object.entries(window._activeFistOverride)) {
            const bone = model.getObjectByName('mixamorig:' + boneName) ||
                         model.getObjectByName('mixamorig' + boneName) ||
                         model.getObjectByName(boneName);
            if (bone) bone.quaternion.copy(fistQ);
          }
        };
      })()`
    });
    await sleep(200);

    // View 1: Close-up front of right hand
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(0.85, 0.90, 0.15, -0.22, 0.88, 0.05);
      })()`
    });
    await sleep(200);
    const snapFront = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${name}_front.png`, Buffer.from(snapFront.data, 'base64'));

    // View 2: Close-up profile of right hand (from side)
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(0.85, 0.90, -Math.PI / 2, -0.22, 0.88, 0.05);
      })()`
    });
    await sleep(200);
    const snapSide = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${name}_side.png`, Buffer.from(snapSide.data, 'base64'));

    // View 3: Full body profile
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(2.3, 0.95, -Math.PI / 2, 0, 0, 0);
      })()`
    });
    await sleep(200);
    const snapFull = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${name}_full.png`, Buffer.from(snapFull.data, 'base64'));
    console.log(`Saved screenshots for fist candidate: ${name}`);
  }

  // Baseline candidate 0: The current broken setting
  // Finger curl: Index ~70, 75, 60. Middle ~70, 80, 50. Ring ~70, 80, 50. Pinky ~70, 80, 50.
  // We need to find the correct thumb angles [T1, T2, T3]
  // On man:
  // Thumb rest is [16, -16, -42].
  // Let's test combinations of thumb curl:
  const baseFingers = {
    RightHandIndex1: [70, 0, -5],
    RightHandIndex2: [80, 0, 0],
    RightHandIndex3: [60, 0, 0],

    RightHandMiddle1: [70, 0, 0],
    RightHandMiddle2: [85, 0, 0],
    RightHandMiddle3: [60, 0, 0],

    RightHandRing1: [75, 0, 3],
    RightHandRing2: [85, 0, 0],
    RightHandRing3: [60, 0, 0],

    RightHandPinky1: [80, 0, 8],
    RightHandPinky2: [85, 0, 0],
    RightHandPinky3: [60, 0, 0]
  };

  const thumbCandidates = [
    // Variation A: Woman-like angles [15, -45, 30], [25, 10, 45], [10, 0, 40]
    { name: 'thumb_wom', t1: [15, -45, 30], t2: [25, 10, 45], t3: [10, 0, 40] },
    // Variation B: Inverted signs for man rig
    { name: 'thumb_inv_y', t1: [15, 45, 30], t2: [25, -10, 45], t3: [10, 0, 40] },
    // Variation C: Resting plus inward tuck
    { name: 'thumb_rest_tuck', t1: [25, -25, -40], t2: [10, -20, 20], t3: [0, 0, 30] },
    // Variation D: Natural clasp
    { name: 'thumb_clasp1', t1: [10, -30, -10], t2: [20, -15, 25], t3: [15, 0, 30] },
    // Variation E: Clasp 2
    { name: 'thumb_clasp2', t1: [0, -35, 10], t2: [30, 0, 30], t3: [20, 0, 30] },
    // Variation F: Clasp 3
    { name: 'thumb_clasp3', t1: [-10, -40, 20], t2: [35, 15, 40], t3: [25, 0, 35] },
    // Variation G: Clasp 4 (down & forward)
    { name: 'thumb_clasp4', t1: [20, -20, 15], t2: [40, 0, 20], t3: [30, 0, 20] },
    // Variation H: Clasp 5 (tight wrap)
    { name: 'thumb_clasp5', t1: [15, -50, 0], t2: [45, -10, 20], t3: [35, 0, 20] }
  ];

  for (const tc of thumbCandidates) {
    const candidate = {
      ...baseFingers,
      RightHandThumb1: tc.t1,
      RightHandThumb2: tc.t2,
      RightHandThumb3: tc.t3
    };
    await testFist(tc.name, candidate);
  }

  ws.close();
  edge.kill();
  console.log('All thumb candidates tested!');
}

run().catch(console.error);

