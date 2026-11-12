const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_nat_walk_' + Date.now());
const PORT = 9941;

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

  // Let's test a natural armed walk posture function
  // What we want:
  // 1. Arm has a gentle, natural swing, but forearm stays relaxed pointing downward (not curled up like a torch!)
  // 2. The weapon tip stays LOWER than the hand at all times (angle ~20-30 deg down from horizontal).
  // 3. Clear the thigh/buttock on back swing.
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

        // Dampen upper arm forward/back swing to a gentle natural range [-12 deg, +14 deg]
        // and keep outward abduction (+10 deg) so it never touches the leg
        const armE = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
        armE.x = Math.max(-12 * DEG2RAD, Math.min(15 * DEG2RAD, armE.x * 0.55));
        armE.z = Math.max(10 * DEG2RAD, armE.z + 8 * DEG2RAD);
        rArm.quaternion.setFromEuler(armE);

        // Forearm: in natural armed walk, elbow is only slightly bent (5-12 deg),
        // NEVER bent 45-60 deg pointing up!
        const foreArmQ = eulerToQuat(8, 0, 0);
        rForeArm.quaternion.slerp(foreArmQ, 0.85);

        // Wrist: align firmly in line with forearm so weapon does not flick upward
        if (rHand) {
          const neutralHandQ = eulerToQuat(4, 8, 4);
          rHand.quaternion.slerp(neutralHandQ, 0.70);
        }
      };

      // Hook into mixer update
      const origUpdate = window._sr.activeMixer.update.bind(window._sr.activeMixer);
      window._sr.activeMixer.update = function(dt) {
        origUpdate(dt);
        window._applyNaturalWalk();
      };
    })()`
  });

  // Now let's sample the walk animation over 1.2 seconds (one full walk cycle is ~1.07s)
  // and measure the weapon tip height vs hand height!
  const walkCycleStats = [];
  for (let i = 0; i < 12; i++) {
    await sleep(90);
    const stat = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
        const wp = window._sr.weaponPivot;
        const mesh = wp ? wp.children[0] : null;
        const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
        let pTip = pHand.clone(), maxD = 0;
        if (mesh) {
          mesh.traverse(o => {
            if (o.isMesh && o.geometry) {
              const pos = o.geometry.attributes.position;
              const p = new THREE.Vector3();
              for (let j = 0; j < pos.count; j += 40) {
                p.fromBufferAttribute(pos, j);
                p.applyMatrix4(o.matrixWorld);
                const d = p.distanceTo(pHand);
                if (d > maxD) { maxD = d; pTip = p.clone(); }
              }
            }
          });
        }
        const dir = pTip.clone().sub(pHand).normalize();
        const angleFromGround = Math.asin(dir.y) * 180 / Math.PI; // negative means pointing down!
        return {
          frame: ${i},
          handY: +pHand.y.toFixed(3),
          tipY: +pTip.y.toFixed(3),
          angleFromGroundDeg: +angleFromGround.toFixed(1),
          pointingDown: pTip.y < pHand.y,
          pointingForward: dir.z > 0
        };
      })()`,
      returnByValue: true
    });
    walkCycleStats.push(stat.result.value);
  }

  console.log('Natural Walk cycle stats:');
  console.log(JSON.stringify(walkCycleStats, null, 2));

  // Take screenshot at forward swing
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.7, 0.15, 0.45, 0, 0);`
  });
  await sleep(200);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/natural_walk_iso.png', Buffer.from(snap.data, 'base64'));

  // Side view
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(200);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/natural_walk_side.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}
run().catch(console.error);

