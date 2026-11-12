const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_forward_coil_' + Date.now());
const PORT = 9972;

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

  // We want to test rotations that point the coil head FORWARD and DOWN
  // In world space:
  // Forward is +Z, Down is -Y, Right is -X (for engi_man right side).
  // Target vector for weapon tip in world space:
  // vTarget = (-0.15, -0.42, 0.90) (angle ~25 deg from ground, forward, slightly outward).
  // Let's compute the exact rotation matrix needed in weaponOrient!
  const solveRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand');
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      if (!hand || !wo || !wp) return { error: 'missing objects' };

      // In local weapon space, the weapon extends along local -Z from (0,0,0) to (0,0,-0.85)
      // We want this local vector (0, 0, -1) to point in world space along:
      // forward (+Z) and down (-Y, 25 deg from horizontal) and slightly outward (-X)
      const targetWorldDir = new THREE.Vector3(-0.08, -Math.sin(25 * Math.PI / 180), Math.cos(25 * Math.PI / 180)).normalize();

      // Transform targetWorldDir into hand local space
      hand.updateMatrixWorld(true);
      const invHandRot = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const targetInHand = targetWorldDir.clone().applyQuaternion(invHandRot).normalize();

      // We need a quaternion Q for weaponOrient such that:
      // (0, 0, -1).applyQuaternion(Q) == targetInHand
      const sourceLocal = new THREE.Vector3(0, 0, -1);
      const qOrient = new THREE.Quaternion().setFromUnitVectors(sourceLocal, targetInHand);

      const euler = new THREE.Euler().setFromQuaternion(qOrient, 'XYZ');

      // Apply this rotation and test
      wo.quaternion.copy(qOrient);
      wo.position.set(0.010, 0.055, 0.020);
      wo.updateMatrixWorld(true);

      // Verify world direction of tip
      const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
      const wMesh = wp.children[0];
      let maxDist = 0, pTip = pHand.clone();
      wMesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          const p = new THREE.Vector3();
          for (let i = 0; i < pos.count; i += 20) {
            p.fromBufferAttribute(pos, i);
            p.applyMatrix4(o.matrixWorld);
            const d = p.distanceTo(pHand);
            if (d > maxDist) { maxDist = d; pTip = p.clone(); }
          }
        }
      });

      const actualWorldDir = pTip.clone().sub(pHand).normalize();
      const angleFromGround = Math.asin(Math.abs(actualWorldDir.y)) * 180 / Math.PI;

      return {
        solvedEulerDeg: [euler.x * 180 / Math.PI, euler.y * 180 / Math.PI, euler.z * 180 / Math.PI].map(v => +v.toFixed(1)),
        solvedEulerRad: [euler.x, euler.y, euler.z].map(v => +v.toFixed(4)),
        actualWorldDir: [actualWorldDir.x, actualWorldDir.y, actualWorldDir.z].map(v => +v.toFixed(3)),
        angleFromGroundDeg: +angleFromGround.toFixed(1),
        pTipZ_is_positive: actualWorldDir.z > 0
      };
    })()`,
    returnByValue: true
  });

  console.log('Solved forward coil rotation:');
  console.log(solveRes.result.value);

  // Capture front view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full');` });
  await sleep(300);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/solved_forward_front.png', Buffer.from(snap.data, 'base64'));

  // Capture side view
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.2, 0.15, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/solved_forward_side.png', Buffer.from(snap.data, 'base64'));

  // Capture close-up hand
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon');` });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/solved_forward_hand.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}

run().catch(console.error);

