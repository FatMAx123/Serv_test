const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_walk_cycle_' + Date.now());
const PORT = 9928;

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
  await sleep(1500);

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
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Set side-view camera
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.95, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(300);

  // Check 6 key frames across the 1.07s walk cycle (t = 0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
  const duration = await send('Runtime.evaluate', {
    expression: `window._sr.activeActions['walk'].getClip().duration`,
    returnByValue: true
  });
  const clipDur = duration.result.value || 1.07;
  console.log('Walk duration:', clipDur);

  for (let i = 0; i < 6; i++) {
    const t = (i / 5) * clipDur;
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.activeMixer.setTime(${t});
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    const frameData = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand');
        const wp = window._sr.weaponPivot;
        const mesh = wp.children[0];

        const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
        // Find tip (coil)
        let pTip = pHand.clone(), maxD = 0;
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

        // Hips position to check clearance
        const hips = m.getObjectByName('mixamorigHips');
        const pHips = new THREE.Vector3(); hips.getWorldPosition(pHips);

        // Distance from tip to hips center in XZ plane
        const distToHipsXZ = Math.hypot(pTip.x - pHips.x, pTip.z - pHips.z);
        const lateralDist = Math.abs(pTip.x - pHips.x);

        const dir = pTip.clone().sub(pHand).normalize();
        return {
          time: +(${t}).toFixed(2),
          tipY: +pTip.y.toFixed(3),
          handY: +pHand.y.toFixed(3),
          pointingForward: dir.z > 0, // +Z is character forward
          tipZ: +pTip.z.toFixed(3),
          handZ: +pHand.z.toFixed(3),
          lateralClearanceCm: +(lateralDist * 100).toFixed(1)
        };
      })()`,
      returnByValue: true
    });
    console.log(`Phase ${i}:`, frameData.result.value);

    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/walk_phase_${i}.png`, Buffer.from(snap.data, 'base64'));
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);

