const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_compare_' + Date.now());
const PORT = 9942;

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

  // Switch to engi_man, apprentice_wand, pause
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
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Test 4 variations of fist & weapon height on man:
  // User asked:
  // 1. "что с его кулаком опять пальцы вывернуты" -> fix thumb & fingers so they are not twisted/sticking out
  // 2. "еще чуточку выше подними оружие в руке" -> raise weapon in hand slightly!
  // Current manPos was [0.005, 0.105, 0.028].
  // In local weapon space, moving along local +Z or changing position to raise it in the hand:
  // Let's test py = 0.075, 0.080, 0.085 (higher in the hand than 0.105)
  // And test different thumb configurations:
  const testSetups = [
    {
      id: 'varA_womangrip_h80',
      pos: [0.005, 0.080, 0.025],
      t1: [15, -45, 30], t2: [25, 10, 45], t3: [10, 0, 40]
    },
    {
      id: 'varB_naturalwrap_h85',
      pos: [0.005, 0.085, 0.026],
      t1: [20, -30, 10], t2: [35, 10, 35], t3: [25, 0, 25]
    },
    {
      id: 'varC_clasped_h75',
      pos: [0.005, 0.075, 0.025],
      t1: [15, -35, 0], t2: [40, 15, 30], t3: [30, 0, 20]
    },
    {
      id: 'varD_tightclasped_h80',
      pos: [0.005, 0.080, 0.026],
      t1: [10, -25, -15], t2: [45, 10, 30], t3: [35, 0, 20]
    }
  ];

  for (const s of testSetups) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const DEG2RAD = Math.PI / 180;
        function eulerToQuat(x, y, z) {
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        }

        // Apply fingers
        const fingers = {
          RightHandIndex1: eulerToQuat(65, 0, -5),
          RightHandIndex2: eulerToQuat(85, 0, 0),
          RightHandIndex3: eulerToQuat(70, 0, 0),
          RightHandMiddle1: eulerToQuat(70, 0, 0),
          RightHandMiddle2: eulerToQuat(90, 0, 0),
          RightHandMiddle3: eulerToQuat(70, 0, 0),
          RightHandRing1: eulerToQuat(75, 0, 3),
          RightHandRing2: eulerToQuat(95, 0, 0),
          RightHandRing3: eulerToQuat(75, 0, 0),
          RightHandPinky1: eulerToQuat(80, 0, 8),
          RightHandPinky2: eulerToQuat(95, 0, 0),
          RightHandPinky3: eulerToQuat(75, 0, 0),
          RightHandThumb1: eulerToQuat(${s.t1[0]}, ${s.t1[1]}, ${s.t1[2]}),
          RightHandThumb2: eulerToQuat(${s.t2[0]}, ${s.t2[1]}, ${s.t2[2]}),
          RightHandThumb3: eulerToQuat(${s.t3[0]}, ${s.t3[1]}, ${s.t3[2]})
        };
        for (const [k, q] of Object.entries(fingers)) {
          const b = m.getObjectByName('mixamorig' + k) || m.getObjectByName('mixamorig:' + k);
          if (b) b.quaternion.copy(q);
        }

        // Apply weapon
        const wo = window._sr.weaponOrient;
        wo.rotation.set(0.7658, -0.8766, 0.3732);
        wo.position.set(${s.pos[0] * 100}, ${s.pos[1] * 100}, ${s.pos[2] * 100});
        wo.updateMatrixWorld(true);

        // Frame camera: front angle matching user Image 1
        window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.40, -0.23, 0.04);
      })()`
    });
    await sleep(350);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_man_fist_${s.id}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshots/test_man_fist_${s.id}.png`);
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);

