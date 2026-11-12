const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_eval_' + Date.now());
const PORT = 9942;
const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 15; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('Edge connection failed');
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

  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(2000);

  // Apply outward arm calibration:
  // Z abduction: 8.5 deg (outward from torso)
  // Y external rotation: +6.5 deg (turns forearm & wand outward away from centerline)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const clips = window._sr.loadedClipsList || [];
      const walkClip = clips.find(c => c.name.toLowerCase().includes('walk') || c.name.includes('mixamo.com.002'));
      if (!walkClip) return;
      
      const armTrack = walkClip.tracks.find(t => t.name.includes('RightArm.quaternion'));
      if (!armTrack) return;
      if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

      const DEG2RAD = Math.PI / 180;
      // Rotation in parent shoulder space:
      // Z (8.5 deg) moves arm laterally outward
      // Y (6.5 deg) turns the arm outward so wand does not point between feet
      const euler = new THREE.Euler(0, 6.5 * DEG2RAD, 8.5 * DEG2RAD, 'XYZ');
      const qMod = new THREE.Quaternion().setFromEuler(euler);
      const tempQ = new THREE.Quaternion();

      for (let i = 0; i < armTrack.values.length; i += 4) {
        tempQ.fromArray(armTrack._origValues, i);
        tempQ.premultiply(qMod);
        tempQ.toArray(armTrack.values, i);
      }
    })()`
  });

  async function snap(filename) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(s.data, 'base64'));
    fs.writeFileSync(path.join('screenshots', filename), Buffer.from(s.data, 'base64'));
    console.log('Saved:', filename);
  }

  // Sample walk at 4 key phases:
  // 1. time = 0.25 (forward swing)
  // 2. time = 0.50 (passing mid)
  // 3. time = 0.80 (user's exact back swing phase)
  // 4. time = 1.00 (end of step)
  const phases = [
    { t: 0.25, name: 'phase_fwd' },
    { t: 0.50, name: 'phase_mid' },
    { t: 0.80, name: 'phase_back_user' },
    { t: 1.00, name: 'phase_end' }
  ];

  for (const p of phases) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.reset().play();
          action.paused = true;
          action.time = ${p.t};
          window._sr.activeMixer.update(0.0001);
        }
        window._sr.frameCamera('full');
      })()`
    });
    await sleep(200);
    await snap(`man_walk_calib_${p.name}_front.png`);

    // Back-quarter view to observe clearance around leg/shorts
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, -Math.PI * 0.85, 0, 0);`
    });
    await sleep(200);
    await snap(`man_walk_calib_${p.name}_backq.png`);
  }

  edge.kill();
  console.log('DONE EVALUATION');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

