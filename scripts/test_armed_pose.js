const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_armed_pose_' + Date.now());
const PORT = 9974;

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

  // Setup engi_man, apprentice_wand
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
    })()`
  });
  await sleep(2500);

  // Let's inject a prototype of updateArmedPose into the running showroom
  await send('Runtime.evaluate', {
    expression: `(() => {
      const DEG2RAD = Math.PI / 180;
      const e2q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));

      // Test clean canonical weapon socket orientation:
      // In local hand space, shaft along Z:
      // rot: [0.0, 0.0, Math.PI * 0.5] aligns shaft with fist cylinder
      // To pitch forward by ~25 deg:
      const wo = window._sr.weaponOrient;
      if (wo) {
        // Let's test [0.44, 0.0, Math.PI * 0.5] or similar
        // Let's create a dedicated helper
        window._setTestWeapRot = (rx, ry, rz) => {
          wo.rotation.set(rx, ry, rz);
        };
      }

      // Monkey patch animate loop with armed arm adjustment
      window._armedArmEnabled = true;
      const oldUpdateHandGrip = window.updateHandGrip;
      window.updateHandGrip = function(delta) {
        oldUpdateHandGrip(delta);
        if (!window._armedArmEnabled) return;

        const m = window._sr.activeCharacterModel;
        if (!m) return;
        const hasWeapon = (window._sr.state.weapon && window._sr.state.weapon !== 'none');
        if (!hasWeapon) return;

        const rArm = m.getObjectByName('mixamorigRightArm');
        const rForeArm = m.getObjectByName('mixamorigRightForeArm');
        if (!rArm || !rForeArm) return;

        const curAnim = (window._sr.currentClipName || window._sr.state.animation || '').toLowerCase();

        if (curAnim.includes('walk')) {
          // In walk: flare arm outward away from thigh, and prevent swinging behind hip
          // Mixamo RightArm rotation: inspect Euler
          const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
          // Abduct outward: increase Z rotation away from body
          e.z = Math.max(e.z, 15 * DEG2RAD);
          // Clamp backward swing on X (if e.x is negative, clamp it so it doesn't swing behind)
          if (e.x < -5 * DEG2RAD) e.x = -5 * DEG2RAD;
          rArm.quaternion.setFromEuler(e);

          // Slightly bend forearm so weapon stays down and forward
          const ef = new THREE.Euler().setFromQuaternion(rForeArm.quaternion, 'XYZ');
          if (ef.y < 20 * DEG2RAD) ef.y = 20 * DEG2RAD;
          rForeArm.quaternion.setFromEuler(ef);
        } else if (curAnim.includes('run')) {
          // In run: Mixamo swings arm up to chin.
          // Override right arm to L2 armed run carry:
          // Lower upper arm, angle down and back alongside hip
          const qArmRun = e2q(35, 10, 22);
          const qForeArmRun = e2q(0, 45, 0);
          rArm.quaternion.copy(qArmRun);
          rForeArm.quaternion.copy(qForeArmRun);
        } else if (curAnim.includes('idle')) {
          // In idle: flare arm slightly outward so weapon doesn't touch thigh
          const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
          e.z += 8 * DEG2RAD; // 8 deg flare outward
          rArm.quaternion.setFromEuler(e);
        }
      };
    })()`
  });
  await sleep(300);

  // Test 1: Idle with weapon
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'idle';
      sel.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(600);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/armed_idle_test.png', Buffer.from(snap.data, 'base64'));

  // Test 2: Walk with weapon (capture at mid-swing)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'walk';
      sel.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.0, 2.3, 0.15, -Math.PI * 0.45, 0, 0);
    })()`
  });
  await sleep(800);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/armed_walk_test.png', Buffer.from(snap.data, 'base64'));

  // Test 3: Run with weapon (capture at mid-stride)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'run';
      sel.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.0, 2.3, 0.15, 0.35, 0, 0);
    })()`
  });
  await sleep(800);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/armed_run_test.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
  console.log('Saved armed tests!');
}

run().catch(console.error);

