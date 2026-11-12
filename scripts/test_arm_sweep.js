const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sweep_rot_' + Date.now());
const PORT = 9948;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  let tabs;
  for (let i = 0; i < 15; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) { tabs = data; break; }
    } catch (_) {}
    await sleep(400);
  }
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
  await sleep(2500);

  // Setup Man + Apprentice Wand + Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(2000);

  // We want to test different arm rotation adjustments at time 0.80s (and full walk)
  // Let's test direct manipulation of the bone at time 0.80s first to find the PERFECT angle!
  // In Three.js, with action paused at 0.80s:
  // rArm.quaternion can be modified directly, then updateMatrixWorld(true) called, and screenshot taken!
  
  const testAngles = [
    { label: 'baseline', armAddEuler: [0, 0, 0] },
    // Test pure Y rotations (local twist)
    { label: 'arm_local_Y_plus15', armAddLocalEuler: [0, 15, 0] },
    { label: 'arm_local_Y_minus15', armAddLocalEuler: [0, -15, 0] },
    // Test pure X rotations
    { label: 'arm_local_X_plus15', armAddLocalEuler: [15, 0, 0] },
    { label: 'arm_local_X_minus15', armAddLocalEuler: [-15, 0, 0] },
    // Test pure Z rotations
    { label: 'arm_local_Z_plus15', armAddLocalEuler: [0, 0, 15] },
    { label: 'arm_local_Z_minus15', armAddLocalEuler: [0, 0, -15] },
    // Test forearm twist
    { label: 'forearm_local_Y_plus20', foreAddLocalEuler: [0, 20, 0] },
    { label: 'forearm_local_Y_minus20', foreAddLocalEuler: [0, -20, 0] },
    // Test combined shoulder outward turn
    { label: 'combo_arm_abduct_and_twist1', armAddLocalEuler: [0, -20, 15] },
    { label: 'combo_arm_abduct_and_twist2', armAddLocalEuler: [0, 20, 15] },
    { label: 'combo_arm_abduct_and_twist3', armAddLocalEuler: [15, 0, 15] },
    { label: 'combo_arm_abduct_and_twist4', armAddLocalEuler: [-15, 0, 15] },
  ];

  for (const t of testAngles) {
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        action.reset().play();
        action.paused = true;
        action.time = 0.80;
        window._sr.activeMixer.update(0.0001);
        
        const man = window._sr.activeCharacterModel;
        const rArm = man.getObjectByName('mixamorig:RightArm') || man.getObjectByName('mixamorigRightArm');
        const rFore = man.getObjectByName('mixamorig:RightForeArm') || man.getObjectByName('mixamorigRightForeArm');
        
        const DEG2RAD = Math.PI / 180;
        if (${JSON.stringify(t.armAddLocalEuler || null)}) {
          const e = ${JSON.stringify(t.armAddLocalEuler)};
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0]*DEG2RAD, e[1]*DEG2RAD, e[2]*DEG2RAD, 'XYZ'));
          rArm.quaternion.multiply(q);
        }
        if (${JSON.stringify(t.foreAddLocalEuler || null)}) {
          const e = ${JSON.stringify(t.foreAddLocalEuler)};
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0]*DEG2RAD, e[1]*DEG2RAD, e[2]*DEG2RAD, 'XYZ'));
          rFore.quaternion.multiply(q);
        }
        man.updateMatrixWorld(true);
        
        const mesh = window._sr.activeWeaponMesh;
        const box = new THREE.Box3().setFromObject(mesh);
        return {
          weaponMinX: box.min.x,
          weaponMaxX: box.max.x,
          weaponCenterX: (box.min.x + box.max.x) / 2
        };
      })()`,
      returnByValue: true
    });

    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${t.label}.png`, Buffer.from(s.data, 'base64'));
    console.log(`Test [${t.label}]:`, res.result.value);
  }

  edge.kill();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

