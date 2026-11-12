const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9998;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_perfect_' + Date.now())}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      tabs = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) {
          ws.off('message', h);
          res(r.result);
        }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res && res.result && res.result.value !== undefined) return res.result.value;
    if (res && res.result) return res.result;
    return res;
  }

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(res.data, 'base64'));
    console.log('Saved:', filename);
  }

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  console.log('Testing integrated perfection on Man...');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // Apply perfected fist quaternions and socket position in showroom state
  await evalJs(`(() => {
    const e2q = window._sr.eulerToQuat;
    const dict = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
    dict.RightHandThumb1 = e2q(40, -40, 20);
    dict.RightHandThumb2 = e2q(35, 15, 50);
    dict.RightHandThumb3 = e2q(20, 10, 40);
    dict.RightHandPinky3 = e2q(65, 0, 0);
    dict.RightHandRing3 = e2q(65, 0, 0);

    window._sr.WEAPON_DEFINITIONS.apprentice_wand.manPos = [-0.005, 0.082, 0.022];

    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Take Idle Front View and Idle Side View
  await evalJs(`window._sr.setCameraPreset(0.95, 2.8, 0.05, 0.0)`);
  await sleep(400);
  await snap('perf_man_idle_front.png');

  await evalJs(`window._sr.setCameraPreset(0.95, 2.8, 0.05, Math.PI * 0.5)`);
  await sleep(400);
  await snap('perf_man_idle_side.png');

  // Take Hand Closeup
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.42, 0.08, -0.45, wp.x, wp.z);
  })()`);
  await sleep(400);
  await snap('perf_man_fist_closeup.png');

  // Now test Walk Animation with Wrist Stabilization and Adaptive Abduction:
  await evalJs(`(() => {
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  // Let's test procedural stabilization inside render loop via a custom test hook:
  await evalJs(`(() => {
    // Record idle wrist orientation as firm reference
    const m = window._sr.activeCharacterModel;
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
    const DEG2RAD = Math.PI / 180;

    // Firm wrist quat (prevents baton effect during forward swing)
    const firmWristEuler = new THREE.Euler(3 * DEG2RAD, -18 * DEG2RAD, 6 * DEG2RAD, 'XYZ');
    const firmWristQ = new THREE.Quaternion().setFromEuler(firmWristEuler);

    window._applyWalkTuning = () => {
      // 1. Stabilize wrist: blend wrist pitch so weapon stays naturally oriented forward-down
      rHand.quaternion.slerp(firmWristQ, 0.65);

      // 2. Subtle arm abduction (only 6.5 degrees, purely lateral)
      const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6.5 * DEG2RAD);
      rArm.quaternion.premultiply(qAbduct);
    };
  })()`);

  // Test at backward swing peak (t=0.18s)
  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(0.18);
    window._sr.activeMixer.update(0);
    window._applyWalkTuning();
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.85, 2.5, 0.05, Math.PI * 0.5);
  })()`);
  await sleep(300);
  await snap('perf_man_walk_back_side.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.5, 0.05, 0.0);`);
  await sleep(200);
  await snap('perf_man_walk_back_front.png');

  // Test at forward swing peak (t=0.68s)
  await evalJs(`(() => {
    window._sr.activeMixer.setTime(0.68);
    window._sr.activeMixer.update(0);
    window._applyWalkTuning();
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.85, 2.5, 0.05, 0.0);
  })()`);
  await sleep(300);
  await snap('perf_man_walk_fwd_front.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.5, 0.05, Math.PI * 0.5);`);
  await sleep(200);
  await snap('perf_man_walk_fwd_side.png');

  // Now test Woman Walk as well
  console.log('Testing integrated perfection on Woman...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
    const DEG2RAD = Math.PI / 180;

    const firmWristEuler = new THREE.Euler(5 * DEG2RAD, -20 * DEG2RAD, 8 * DEG2RAD, 'XYZ');
    const firmWristQ = new THREE.Quaternion().setFromEuler(firmWristEuler);

    window._applyWomanWalkTuning = () => {
      rHand.quaternion.slerp(firmWristQ, 0.55);
      const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 5.5 * DEG2RAD);
      rArm.quaternion.premultiply(qAbduct);
    };
  })()`);

  // Woman at backward swing (t = 0.25 * dur)
  const wDur = await evalJs(`window._sr.activeActions['walk'].getClip().duration`);
  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(${wDur * 0.25});
    window._sr.activeMixer.update(0);
    window._applyWomanWalkTuning();
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.52, 2.0, 0.05, 0.0);
  })()`);
  await sleep(300);
  await snap('perf_woman_walk_front.png');

  await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.05, Math.PI * 0.5);`);
  await sleep(200);
  await snap('perf_woman_walk_side.png');

  ws.close();
  edge.kill();
  console.log('All perfect evaluations finished!');
}

main().catch(console.error);

