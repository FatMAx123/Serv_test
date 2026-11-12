const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9989;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_clean_' + Date.now())}`,
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

  // Disable bone helpers
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
  })()`);

  // --- 1. Test Man Walk with track abduction only (NO render loop premultiply!) ---
  console.log('Testing Man Walk with pure track abduction...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // Set perfected fist and weapon pos
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
  })()`);
  await sleep(1500);

  // Calibrate track for man walk:
  await evalJs(`(() => {
    const action = window._sr.activeActions['walk'];
    const clip = action.getClip();
    const DEG2RAD = Math.PI / 180;
    const armTrack = clip.tracks.find(t => t.name.includes('RightArm.quaternion'));
    if (armTrack && !clip._cleanAbducted) {
      clip._cleanAbducted = true;
      const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6.0 * DEG2RAD);
      const tempQ = new THREE.Quaternion();
      for (let i = 0; i < armTrack.values.length; i += 4) {
        tempQ.fromArray(armTrack.values, i);
        tempQ.premultiply(qAbduct);
        tempQ.toArray(armTrack.values, i);
      }
    }
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  // Capture Man walking in real time
  await evalJs(`window._sr.setCameraPreset(0.85, 2.7, 0.08, 0.0)`);
  await sleep(300);
  await snap('clean_man_walk_front.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.7, 0.08, Math.PI * 0.5)`);
  await sleep(300);
  await snap('clean_man_walk_side.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.7, 0.12, 0.45)`);
  await sleep(300);
  await snap('clean_man_walk_iso.png');

  // Freeze at backward swing peak (t = 0.18s) to inspect shorts clearance
  await evalJs(`(() => {
    window._sr.activeMixer.timeScale = 0;
    window._sr.activeMixer.setTime(0.18);
    window._sr.activeMixer.update(0);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.85, 2.5, 0.08, Math.PI * 0.5);
  })()`);
  await sleep(300);
  await snap('clean_man_freeze_back_side.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.5, 0.08, 0.0)`);
  await sleep(200);
  await snap('clean_man_freeze_back_front.png');

  // Freeze at forward swing peak (t = 0.68s) to inspect weapon orientation
  await evalJs(`(() => {
    window._sr.activeMixer.setTime(0.68);
    window._sr.activeMixer.update(0);
    window._sr.activeCharacterModel.updateMatrixWorld(true);
    window._sr.setCameraPreset(0.85, 2.5, 0.08, 0.0)`);
  await sleep(300);
  await snap('clean_man_freeze_fwd_front.png');

  await evalJs(`window._sr.setCameraPreset(0.85, 2.5, 0.08, Math.PI * 0.5)`);
  await sleep(200);
  await snap('clean_man_freeze_fwd_side.png');

  // --- 2. Test Woman Walk with track abduction ---
  console.log('Testing Woman Walk with pure track abduction...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  // Calibrate woman walk clip track:
  await evalJs(`(() => {
    const action = window._sr.activeActions['walk'];
    const clip = action.getClip();
    const DEG2RAD = Math.PI / 180;
    const armTrack = clip.tracks.find(t => t.name.includes('RightArm.quaternion'));
    if (armTrack && !clip._cleanAbducted) {
      clip._cleanAbducted = true;
      // On woman rig: let's test a very subtle 4.5 degree abduction (0.078 rad)
      const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 4.5 * DEG2RAD);
      const tempQ = new THREE.Quaternion();
      for (let i = 0; i < armTrack.values.length; i += 4) {
        tempQ.fromArray(armTrack.values, i);
        tempQ.premultiply(qAbduct);
        tempQ.toArray(armTrack.values, i);
      }
    }
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(1500);

  // Capture Woman walking in real time
  await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.08, 0.0)`);
  await sleep(300);
  await snap('clean_woman_walk_front.png');

  await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.08, Math.PI * 0.5)`);
  await sleep(300);
  await snap('clean_woman_walk_side.png');

  await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.12, 0.45)`);
  await sleep(300);
  await snap('clean_woman_walk_iso.png');

  ws.close();
  edge.kill();
  console.log('Clean abduction tests finished!');
}

main().catch(console.error);

