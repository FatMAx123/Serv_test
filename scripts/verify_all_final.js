const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_final_' + Date.now());
const PORT = 9980;

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
  await sleep(2500);

  // Disable bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // 1. TEST ENGI_MAN CLOSE-UPS
  console.log('Testing engi_man close-ups...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Hand close-up from front-3/4 (like user screenshot 10)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, 0.08, -0.20, 0.05);`
  });
  await sleep(300);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/final_man_wand_front.png', Buffer.from(snap.data, 'base64'));

  // Hand close-up from side (profile)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, -Math.PI * 0.5, -0.20, 0.05);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/final_man_wand_side.png', Buffer.from(snap.data, 'base64'));

  // Hand close-up from behind/side (like user screenshot 9)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, -Math.PI * 0.85, -0.20, 0.05);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/final_man_wand_back.png', Buffer.from(snap.data, 'base64'));

  // Full body profile (like user screenshot 7)
  await send('Runtime.evaluate', {
    expression: `window._sr.frameCamera('full');`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/final_man_wand_full.png', Buffer.from(snap.data, 'base64'));

  // 2. TEST ALL MAN ANIMATIONS FOR PENETRATION / CLIPPING
  console.log('Testing all animations on engi_man...');
  const anims = ['idle', 'walk', 'run', 'stand', 'sitloop', 'punch', 'skill', 'heal', 'vamp', 'diy'];
  const animResults = [];

  for (const anim of anims) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        sel.value = '${anim}';
        sel.dispatchEvent(new Event('change'));
        if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 1.0;
      })()`
    });
    // Let animation play for a moment, then sample 3 frames
    await sleep(600);

    const audit = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const wMesh = window._sr.weaponPivot ? window._sr.weaponPivot.children[0] : null;
        if (!m || !wMesh) return { error: 'missing model or weapon' };

        const hand = m.getObjectByName('mixamorigRightHand');
        const rUpLeg = m.getObjectByName('mixamorigRightUpLeg');
        const rLeg = m.getObjectByName('mixamorigRightLeg');
        const hips = m.getObjectByName('mixamorigHips');

        // Sample weapon head and hand position
        const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
        const vertices = [];
        wMesh.traverse(o => {
          if (o.isMesh && o.geometry) {
            const pos = o.geometry.attributes.position;
            const p = new THREE.Vector3();
            for (let i = 0; i < pos.count; i += 30) {
              p.fromBufferAttribute(pos, i);
              p.applyMatrix4(o.matrixWorld);
              vertices.push(p.clone());
            }
          }
        });

        let maxDist = 0, pHead = pHand.clone();
        for (const v of vertices) {
          const d = v.distanceTo(pHand);
          if (d > maxDist) { maxDist = d; pHead = v; }
        }

        // Distance from weapon segment [pHand, pHead] to thigh bone [pUpLeg, pLeg]
        const pUpLeg = new THREE.Vector3(); rUpLeg.getWorldPosition(pUpLeg);
        const pKnee = new THREE.Vector3(); rLeg.getWorldPosition(pKnee);
        const pHips = new THREE.Vector3(); hips.getWorldPosition(pHips);

        // Distance function segment to segment
        function distSegToSeg(p1, p2, p3, p4) {
          const u = p2.clone().sub(p1);
          const v = p4.clone().sub(p3);
          const w = p1.clone().sub(p3);
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
          const dP = w.add(u.multiplyScalar(sc)).sub(v.multiplyScalar(tc));
          return dP.length();
        }

        const distThigh = distSegToSeg(pHand, pHead, pUpLeg, pKnee);
        const distHips = pHead.distanceTo(pHips);

        return {
          anim: '${anim}',
          distThigh_cm: +(distThigh * 100).toFixed(1),
          distHips_cm: +(distHips * 100).toFixed(1),
          clearance: distThigh > 0.08 ? 'CLEAR' : (distThigh > 0.05 ? 'CLOSE' : 'PENETRATING')
        };
      })()`,
      returnByValue: true
    });

    animResults.push(audit.result.value);

    // Capture profile screenshot for animation
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(1.0, 2.2, 0.15, -Math.PI * 0.45, 0, 0);`
    });
    await sleep(150);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/final_man_anim_${anim}.png`, Buffer.from(snap.data, 'base64'));
  }

  console.table(animResults);

  // 3. TEST WOMAN WEAPONS ORIENTATION (Apprentice Wand, Tears of Fairy, Atuba Mace)
  console.log('Testing engi_woman weapons...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_woman';
      selChar.dispatchEvent(new Event('change'));
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'idle';
      selAnim.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  const womWeaps = ['apprentice_wand', 'tears_fairy', 'atuba_mace', 'demon_staff'];
  for (const w of womWeaps) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selW = document.getElementById('sel-weapon');
        selW.value = '${w}';
        selW.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(800);

    // Side view
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(1.0, 2.1, 0.15, -Math.PI * 0.5, 0, 0);`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/final_woman_${w}_side.png`, Buffer.from(snap.data, 'base64'));

    // Front-3/4 view
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(1.0, 2.1, 0.15, 0.25, 0, 0);`
    });
    await sleep(200);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/final_woman_${w}_front.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Captured woman with ${w}`);
  }

  ws.close();
  edge.kill();
  console.log('All verifications completed successfully!');
}

run().catch(console.error);

