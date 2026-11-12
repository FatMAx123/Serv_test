const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_walk_eval_' + Date.now());
const PORT = 9951;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  let tabs;
  for (let i = 0; i < 15; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) { tabs = data; break; }
    } catch (_) {}
    await sleep(400);
  }
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

  // Setup Man + Apprentice Wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Test variations of twist angle:
  // e.g. local Y twist = 10, 14, 18 deg combined with shoulder abduction Z = 5.5 deg
  const twistVariants = [10, 14, 18];

  for (const twistDeg of twistVariants) {
    console.log(`=== Testing twistDeg = ${twistDeg}° ===`);
    // Bake into track
    await send('Runtime.evaluate', {
      expression: `(() => {
        const clips = window._sr.loadedClipsList || [];
        const DEG2RAD = Math.PI / 180;
        const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6.5 * DEG2RAD);
        const qTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ${twistDeg} * DEG2RAD);
        const tempQ = new THREE.Quaternion();

        ['walk', 'run', 'mixamo.com.002', 'mixamo.com.003'].forEach(k => {
          const clip = clips.find(c => c.name.toLowerCase().includes(k));
          if (!clip) return;
          const armTrack = clip.tracks.find(t => t.name.includes('RightArm.quaternion'));
          if (!armTrack) return;
          if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

          for (let i = 0; i < armTrack.values.length; i += 4) {
            tempQ.fromArray(armTrack._origValues, i);
            tempQ.premultiply(qAbduct);   // Shoulder lateral abduction
            tempQ.multiply(qTwist);        // Local axial external rotation (outward turn)
            tempQ.toArray(armTrack.values, i);
          }
        });
      })()`
    });

    // Check Walk at 4 phases: 0.25 (fwd), 0.50 (mid), 0.80 (back user screenshot), 1.00 (end)
    for (const phase of [0.25, 0.50, 0.80, 1.00]) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          const selA = document.getElementById('sel-animation');
          selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
          const action = window._sr.activeActions['walk'];
          if (action) {
            action.reset().play();
            action.paused = true;
            action.time = ${phase};
            window._sr.activeMixer.update(0.0001);
            window._sr.activeCharacterModel.updateMatrixWorld(true);
          }
          window._sr.frameCamera('full');
        })()`
      });
      await sleep(150);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/walk_twist${twistDeg}_p${Math.round(phase*100)}_front.png`, Buffer.from(s.data, 'base64'));

      // Also back-quarter angle
      await send('Runtime.evaluate', {
        expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, -Math.PI * 0.85, 0, 0);`
      });
      await sleep(150);
      const sBack = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/walk_twist${twistDeg}_p${Math.round(phase*100)}_backq.png`, Buffer.from(sBack.data, 'base64'));
    }

    // Check Run at 0.40 (swing back)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selA = document.getElementById('sel-animation');
        selA.value = 'run'; selA.dispatchEvent(new Event('change'));
        const action = window._sr.activeActions['run'];
        if (action) {
          action.reset().play();
          action.paused = true;
          action.time = 0.40;
          window._sr.activeMixer.update(0.0001);
          window._sr.activeCharacterModel.updateMatrixWorld(true);
        }
        window._sr.frameCamera('full');
      })()`
    });
    await sleep(150);
    const sRun = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/run_twist${twistDeg}_front.png`, Buffer.from(sRun.data, 'base64'));
  }

  edge.kill();
  console.log('COMPLETE EVALUATION OF TWIST ANGLES');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

