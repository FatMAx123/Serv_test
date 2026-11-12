const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_full_suite_' + Date.now());
const PORT = 9971;

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

  // Install complete armed posture & orientation logic:
  await send('Runtime.evaluate', {
    expression: `(() => {
      const DEG2RAD = Math.PI / 180;
      const e2q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));

      // Solved forward orientation for apprentice wand:
      // [47.1, -52.9, 24.4] deg
      const wo = window._sr.weaponOrient;
      if (wo) {
        wo.rotation.set(47.1 * DEG2RAD, -52.9 * DEG2RAD, 24.4 * DEG2RAD);
        wo.position.set(0.010, 0.055, 0.020);
        wo.updateMatrixWorld(true);
      }

      // Armed Arm Layer
      const oldUpdate = window.updateHandGrip;
      window.updateHandGrip = function(delta) {
        oldUpdate(delta);

        const m = window._sr.activeCharacterModel;
        if (!m) return;
        const hasWeapon = (window._sr.state.weapon && window._sr.state.weapon !== 'none');
        if (!hasWeapon) return;

        const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
        const rForeArm = m.getObjectByName('mixamorigRightForeArm') || m.getObjectByName('mixamorig:RightForeArm');
        if (!rArm || !rForeArm) return;

        const curAnim = (window._sr.currentClipName || window._sr.state.animation || '').toLowerCase();

        if (curAnim.includes('walk')) {
          // In walk: dampen backward arm swing, flare arm outward so weapon clears hip and thigh
          const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
          // Flare outward (+Z in mixamo upper arm)
          e.z = Math.max(e.z, 14 * DEG2RAD);
          // When swinging backward (negative X), limit to -8 deg max so weapon never touches hip
          if (e.x < -8 * DEG2RAD) e.x = -8 * DEG2RAD;
          rArm.quaternion.setFromEuler(e);

          // Forearm: keep slight elbow bend so wand stays forward
          const ef = new THREE.Euler().setFromQuaternion(rForeArm.quaternion, 'XYZ');
          if (ef.y < 25 * DEG2RAD) ef.y = 25 * DEG2RAD;
          rForeArm.quaternion.setFromEuler(ef);
        } else if (curAnim.includes('run')) {
          // In run: L2 authentic weapon carry pose
          // Right arm is held down by the right hip, weapon points forward and down clearing chest/head completely
          rArm.quaternion.copy(e2q(28, 8, 18));
          rForeArm.quaternion.copy(e2q(0, 35, 0));
        } else if (curAnim.includes('idle') || curAnim.includes('stand')) {
          // In idle: flare arm slightly outward by 6 deg so weapon has ample air clearance
          const e = new THREE.Euler().setFromQuaternion(rArm.quaternion, 'XYZ');
          e.z += 6 * DEG2RAD;
          rArm.quaternion.setFromEuler(e);
        }
      };
    })()`
  });
  await sleep(300);

  // Function to audit collision across animation frames
  async function auditAnim(animName, frameSteps = 6) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        sel.value = '${animName}';
        sel.dispatchEvent(new Event('change'));
        if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 1.0;
      })()`
    });
    await sleep(400);

    const frameChecks = [];
    for (let f = 0; f < frameSteps; f++) {
      await sleep(150);
      const res = await send('Runtime.evaluate', {
        expression: `(() => {
          const m = window._sr.activeCharacterModel;
          const wMesh = window._sr.weaponPivot ? window._sr.weaponPivot.children[0] : null;
          const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
          const rUpLeg = m.getObjectByName('mixamorigRightUpLeg') || m.getObjectByName('mixamorig:RightUpLeg');
          const rLeg = m.getObjectByName('mixamorigRightLeg') || m.getObjectByName('mixamorig:RightLeg');
          const head = m.getObjectByName('mixamorigHead') || m.getObjectByName('mixamorig:Head');

          const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
          const pUpLeg = new THREE.Vector3(); rUpLeg.getWorldPosition(pUpLeg);
          const pKnee = new THREE.Vector3(); rLeg.getWorldPosition(pKnee);
          const pHeadBone = new THREE.Vector3(); head.getWorldPosition(pHeadBone);

          let maxDist = 0, pTip = pHand.clone();
          wMesh.traverse(o => {
            if (o.isMesh && o.geometry) {
              const pos = o.geometry.attributes.position;
              const p = new THREE.Vector3();
              for (let i = 0; i < pos.count; i += 30) {
                p.fromBufferAttribute(pos, i);
                p.applyMatrix4(o.matrixWorld);
                if (p.distanceTo(pHand) > maxDist) { maxDist = p.distanceTo(pHand); pTip = p.clone(); }
              }
            }
          });

          // Check distance from weapon segment to thigh segment
          function distSegToSeg(p1, p2, p3, p4) {
            const u = p2.clone().sub(p1), v = p4.clone().sub(p3), w = p1.clone().sub(p3);
            const a = u.dot(u), b = u.dot(v), c = v.dot(v), d = u.dot(w), e = v.dot(w);
            const D = a * c - b * b;
            let sN, sD = D, tN, tD = D;
            if (D < 1e-6) { sN = 0.0; sD = 1.0; tN = e; tD = c; }
            else {
              sN = (b * e - c * d); tN = (a * e - b * d);
              if (sN < 0.0) { sN = 0.0; tN = e; tD = c; }
              else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
            }
            if (tN < 0.0) { tN = 0.0; if (-d < 0.0) sN = 0.0; else if (-d > a) sN = sD; else { sN = -d; sD = a; } }
            else if (tN > tD) { tN = tD; if ((-d + b) < 0.0) sN = 0.0; else if ((-d + b) > a) sN = sD; else { sN = (-d + b); sD = a; } }
            const sc = Math.abs(sN) < 1e-6 ? 0.0 : sN / sD;
            const tc = Math.abs(tN) < 1e-6 ? 0.0 : tN / tD;
            return w.add(u.multiplyScalar(sc)).sub(v.multiplyScalar(tc)).length();
          }

          const distThigh = distSegToSeg(pHand, pTip, pUpLeg, pKnee);
          const distHead = pTip.distanceTo(pHeadBone);

          return {
            distThigh_cm: +(distThigh * 100).toFixed(1),
            distHead_cm: +(distHead * 100).toFixed(1)
          };
        })()`,
        returnByValue: true
      });
      frameChecks.push(res.result.value);
    }

    // Min distance across all sampled frames
    const minThigh = Math.min(...frameChecks.map(c => c.distThigh_cm));
    const minHead = Math.min(...frameChecks.map(c => c.distHead_cm));
    return { anim: animName, minThigh_cm: minThigh, minHead_cm: minHead };
  }

  const tests = ['idle', 'walk', 'run', 'stand', 'sitloop', 'punch', 'skill', 'heal', 'vamp', 'diy'];
  const summary = [];
  for (const t of tests) {
    const s = await auditAnim(t);
    summary.push({
      ...s,
      status: (s.minThigh_cm > 6.0 && s.minHead_cm > 15.0) ? '100% CLEAR' : 'COLLISION'
    });
  }

  console.table(summary);

  // Capture clean verification snapshots:
  // 1. Idle full front
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('sel-animation').value = 'idle';
      document.getElementById('sel-animation').dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(400);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/verif_idle_front.png', Buffer.from(snap.data, 'base64'));

  // 2. Idle side
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.2, 0.15, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/verif_idle_side.png', Buffer.from(snap.data, 'base64'));

  // 3. Walk side
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('sel-animation').value = 'walk';
      document.getElementById('sel-animation').dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.0, 2.3, 0.15, -Math.PI * 0.45, 0, 0);
    })()`
  });
  await sleep(600);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/verif_walk_side.png', Buffer.from(snap.data, 'base64'));

  // 4. Run side
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('sel-animation').value = 'run';
      document.getElementById('sel-animation').dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(1.0, 2.3, 0.15, -Math.PI * 0.45, 0, 0);
    })()`
  });
  await sleep(600);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/verif_run_side.png', Buffer.from(snap.data, 'base64'));

  // 5. Run front
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.3, 0.15, 0.25, 0, 0);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/verif_run_front.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}

run().catch(console.error);

