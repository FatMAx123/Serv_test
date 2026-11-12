const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_exact_' + Date.now());
const PORT = 9954;

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

  // Let's solve the exact weaponOrient quaternion for Man so that:
  // - Weapon points FORWARD (+Z, cos(25 deg) = +0.906)
  // - Weapon points DOWN (-Y, -sin(25 deg) = -0.4226)
  // - Weapon points OUTWARD to the right (-X = -0.15), avoiding the right thigh and never crossing crotch!
  const manSolve = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand');
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      if (!hand || !wo || !wp) return { error: 'missing objects' };

      // Target world direction: pointing forward-down-outward
      // World coordinates: Right hand is at X = -0.23, Y = 0.87, Z = 0.04
      // Right thigh is at X = -0.10.
      // So weapon must point along negative X (outward), e.g. X = -0.14
      const targetWorldDir = new THREE.Vector3(-0.14, -Math.sin(25 * Math.PI / 180), Math.cos(25 * Math.PI / 180)).normalize();

      hand.updateMatrixWorld(true);
      const invHandRot = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const targetInHand = targetWorldDir.clone().applyQuaternion(invHandRot).normalize();

      const sourceLocal = new THREE.Vector3(0, 0, -1);
      const qOrient = new THREE.Quaternion().setFromUnitVectors(sourceLocal, targetInHand);
      const euler = new THREE.Euler().setFromQuaternion(qOrient, 'XYZ');

      wo.quaternion.copy(qOrient);
      wo.updateMatrixWorld(true);

      const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
      const mesh = wp.children[0];
      let pTip = pHand.clone(), maxD = 0;
      mesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          const p = new THREE.Vector3();
          for (let i = 0; i < pos.count; i += 20) {
            p.fromBufferAttribute(pos, i);
            p.applyMatrix4(o.matrixWorld);
            const d = p.distanceTo(pHand);
            if (d > maxD) { maxD = d; pTip = p.clone(); }
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
        pointingForward: actualWorldDir.z > 0,
        pointingOutward: actualWorldDir.x < 0
      };
    })()`,
    returnByValue: true
  });

  console.log('MAN solved weapon rotation:');
  console.log(manSolve.result.value);

  // Capture side view
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(1.0, 2.4, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(400);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_solved_side.png', Buffer.from(snap.data, 'base64'));

  // Capture front view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full');` });
  await sleep(400);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_solved_front.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}
run().catch(console.error);

