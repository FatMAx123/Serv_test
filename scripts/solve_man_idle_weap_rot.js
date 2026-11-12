const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_idle_rot_' + Date.now());
const PORT = 9976;

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

  // Set engi_man, apprentice_wand, pause
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

  // In showroom:
  // weaponOrient is attached to mixamorigRightHand
  // In mixamorigRightHand local space:
  // Let's test rotations to point the shaft down and forward on the OUTSIDE of the right leg.
  // We want dir.x to be negative (outward, since right hand is at -X), dir.y negative (down), dir.z positive (forward).
  const evalRot = async (rx, ry, rz) => {
    return await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        if (!wo) return null;
        wo.rotation.set(${rx}, ${ry}, ${rz});
        wo.updateMatrixWorld(true);

        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand');
        const hPos = new THREE.Vector3(); hand.getWorldPosition(hPos);

        const wMesh = window._sr.weaponPivot.children[0];
        let maxDist = 0, pHead = hPos.clone();
        wMesh.traverse(o => {
          if (o.isMesh && o.geometry) {
            const pos = o.geometry.attributes.position;
            const p = new THREE.Vector3();
            for (let i = 0; i < pos.count; i += 20) {
              p.fromBufferAttribute(pos, i);
              p.applyMatrix4(o.matrixWorld);
              const d = p.distanceTo(hPos);
              if (d > maxDist) { maxDist = d; pHead = p.clone(); }
            }
          }
        });

        const dir = pHead.clone().sub(hPos).normalize();
        // Angle from horizontal
        const angleDeg = Math.asin(Math.abs(dir.y)) * 180 / Math.PI;

        return {
          rx: ${rx}, ry: ${ry}, rz: ${rz},
          dir: [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)),
          pHead: [pHead.x, pHead.y, pHead.z].map(v => +v.toFixed(3)),
          angleDeg: +angleDeg.toFixed(1),
          // We want: dir.x < 0 (pointing OUTWARD to the right), dir.y < 0 (down), dir.z > 0 (forward), angle ~25-30 deg
          isOutward: dir.x < -0.05,
          isForward: dir.z > 0.4,
          isDown: dir.y < -0.3
        };
      })()`,
      returnByValue: true
    });
  };

  // Search over Euler angles:
  // In local hand coords, let's test a grid
  const DEG2RAD = Math.PI / 180;
  const goodConfigs = [];

  for (let rxDeg of [0, 45, 90, 135, 180, -90, -45]) {
    for (let ryDeg of [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]) {
      for (let rzDeg of [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150]) {
        const res = await evalRot(rxDeg * DEG2RAD, ryDeg * DEG2RAD, rzDeg * DEG2RAD);
        const v = res.result.value;
        if (v && v.isOutward && v.isForward && v.isDown && v.angleDeg >= 20 && v.angleDeg <= 35) {
          goodConfigs.push({ rxDeg, ryDeg, rzDeg, ...v });
        }
      }
    }
  }

  console.log(`Found ${goodConfigs.length} outward forward-down configs!`);
  // Sort by how close angle is to 25 deg and how nicely it clears outward
  goodConfigs.sort((a, b) => Math.abs(a.angleDeg - 25) - Math.abs(b.angleDeg - 25));
  console.log('Top 5 configs:');
  console.table(goodConfigs.slice(0, 5));

  // Test top 3 configs visually
  for (let i = 0; i < Math.min(3, goodConfigs.length); i++) {
    const cfg = goodConfigs[i];
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        wo.rotation.set(${cfg.rxDeg} * Math.PI / 180, ${cfg.ryDeg} * Math.PI / 180, ${cfg.rzDeg} * Math.PI / 180);
        wo.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    // Capture full front view
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full');` });
    await sleep(200);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_outward_${i}_full.png`, Buffer.from(snap.data, 'base64'));
  }

  ws.close();
  edge.kill();
}

run().catch(console.error);

