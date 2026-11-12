const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_walk_backswing_' + Date.now());
const PORT = 9940;

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

  // Switch to engi_man, apprentice_wand, walk
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
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Apply natural walk kinematics
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._applyNaturalWalk = function() {
        const m = window._sr.activeCharacterModel;
        if (!m) return;
        const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
        const rForeArm = m.getObjectByName('mixamorigRightForeArm') || m.getObjectByName('mixamorig:RightForeArm');
        const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
        if (!rArm || !rForeArm) return;

        const DEG2RAD = Math.PI / 180;
        function eulerToQuat(x, y, z) {
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        }

        // Clamp swing and keep outward flare
        const armE = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
        armE.x = Math.max(-10 * DEG2RAD, Math.min(14 * DEG2RAD, armE.x * 0.55));
        armE.z = Math.max(12 * DEG2RAD, armE.z + 8 * DEG2RAD);
        rArm.quaternion.setFromEuler(armE);

        // Relax elbow: only 6 deg bend
        const foreArmQ = eulerToQuat(6, 0, 0);
        rForeArm.quaternion.slerp(foreArmQ, 0.85);

        // Keep wrist neutral
        if (rHand) {
          const neutralHandQ = eulerToQuat(4, 8, 4);
          rHand.quaternion.slerp(neutralHandQ, 0.70);
        }
      };

      const origUpdate = window._sr.activeMixer.update.bind(window._sr.activeMixer);
      window._sr.activeMixer.update = function(dt) {
        origUpdate(dt);
        window._applyNaturalWalk();
      };
    })()`
  });

  // Step through walk animation in 0.1s increments and take snapshots of all phases!
  for (let i = 0; i < 6; i++) {
    await sleep(180);
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
    });
    await sleep(50);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/walk_phase_${i}.png`, Buffer.from(snap.data, 'base64'));
  }
  console.log('Saved all 6 walk phases!');

  ws.close();
  edge.kill();
}
run().catch(console.error);

