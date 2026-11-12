const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_anims_clearance_' + Date.now());
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

  // We want to test how the procedural kinematic arm layer in updateHandGrip works!
  // In updateHandGrip(delta), we should apply:
  // 1. Solid Fist Quaternions (Right hand fingers locked)
  // 2. Armed Arm Kinematics for walk & run:
  //    - Idle: slight abduction flare (+8 deg on RightArm Z)
  //    - Walk: abduction flare (+12 deg on RightArm Z) and clamp back swing (clamp RightArm X to >= -10 deg)
  //    - Run: Lineage 2 Armed Run carry pose: RightArm at (28, 8, 18), RightForeArm at (0, 35, 0)
  // Let's test this in browser by defining and injecting this layer!
  console.log('Testing animation clearances...');

  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testArmedLayer = function() {
        const m = window._sr.activeCharacterModel;
        if (!m) return;
        const clip = (window._sr.currentClipName || '').toLowerCase();
        const isMan = (window._sr.state.character === 'engi_man');

        const rArm = m.getObjectByName('mixamorig:RightArm') || m.getObjectByName('mixamorigRightArm');
        const rForeArm = m.getObjectByName('mixamorig:RightForeArm') || m.getObjectByName('mixamorigRightForeArm');
        const DEG2RAD = Math.PI / 180;
        function eulerToQuat(x, y, z) {
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        }

        if (rArm && rForeArm) {
          if (clip.includes('run') || clip.includes('fast_run') || clip.includes('sword_run')) {
            // Lineage 2 Armed Run posture: arm lowered by flank, pointed forward in open air
            const targetArmQ = eulerToQuat(26, 6, 16);
            const targetForeArmQ = eulerToQuat(0, 30, 0);
            rArm.quaternion.slerp(targetArmQ, 0.90);
            rForeArm.quaternion.slerp(targetForeArmQ, 0.90);
          } else if (clip.includes('walk')) {
            // Armed Walk: upper arm abducted outward so weapon clears thigh, back swing clamped
            const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
            e.x = Math.max(e.x, -8 * DEG2RAD);
            e.z = Math.max(e.z, 14 * DEG2RAD);
            rArm.quaternion.setFromEuler(e);
            const ef = new THREE.Euler().setFromQuaternion(rForeArm.quaternion, 'XYZ');
            ef.y = Math.max(ef.y, 22 * DEG2RAD);
            rForeArm.quaternion.setFromEuler(ef);
          } else {
            // Idle / Stand: gentle outward flare (+7 deg)
            const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
            e.z += 7 * DEG2RAD;
            rArm.quaternion.setFromEuler(e);
          }
        }
      };

      // Hook into render loop or ticker
      window._oldUpdate = window._sr.activeMixer ? window._sr.activeMixer.update : null;
    })()`
  });

  // Let's test on WOMAN: Walk, Run, Idle
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Setup solved rotation for woman in WEAPON_DEFINITIONS live
  await send('Runtime.evaluate', {
    expression: `(() => {
      const wo = window._sr.weaponOrient;
      wo.rotation.set(1.5075, -1.1728, 1.1151);
      wo.updateMatrixWorld(true);
    })()`
  });

  // 1. Woman Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(800);
  // Apply layer and capture frame
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testArmedLayer();
      window._sr.setCameraPreset(0.85, 2.3, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(300);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/woman_walk_side.png', Buffer.from(snap.data, 'base64'));

  // 2. Woman Run
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'fast_run';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(800);
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testArmedLayer();
      window._sr.setCameraPreset(0.85, 2.3, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/woman_run_side.png', Buffer.from(snap.data, 'base64'));

  // 3. Switch to MAN: Walk, Run, Idle
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Setup solved rotation & position for man live
  await send('Runtime.evaluate', {
    expression: `(() => {
      const wo = window._sr.weaponOrient;
      wo.rotation.set(0.7658, -0.8766, 0.3732);
      // scaleInv is 100
      wo.position.set(0.005 * 100, 0.105 * 100, 0.028 * 100);
      wo.updateMatrixWorld(true);

      // Lock fingers to solid fist
      const m = window._sr.activeCharacterModel;
      const DEG2RAD = Math.PI / 180;
      function eulerToQuat(x, y, z) {
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
      }
      const bT1 = m.getObjectByName('mixamorigRightHandThumb1');
      const bT2 = m.getObjectByName('mixamorigRightHandThumb2');
      const bT3 = m.getObjectByName('mixamorigRightHandThumb3');
      if (bT1) bT1.quaternion.copy(eulerToQuat(28, -15, -55));
      if (bT2) bT2.quaternion.copy(eulerToQuat(60, 15, 20));
      if (bT3) bT3.quaternion.copy(eulerToQuat(50, 0, 10));
    })()`
  });

  // Man Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(800);
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testArmedLayer();
      window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_walk_side.png', Buffer.from(snap.data, 'base64'));

  // Man Run
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'fast_run';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(800);
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testArmedLayer();
      window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_run_side.png', Buffer.from(snap.data, 'base64'));

  console.log('Captured all walk & run side screenshots!');

  ws.close();
  edge.kill();
}
run().catch(console.error);

