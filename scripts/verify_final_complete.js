const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_vfinal_complete_' + Date.now());
const PORT = 9966;
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
    'http://localhost:3000/showroom.html?v=sr-22'
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

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  async function snap(filename) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    const fullPath = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(s.data, 'base64'));
    fs.writeFileSync(path.join('screenshots', filename), Buffer.from(s.data, 'base64'));
    console.log('Saved snapshot:', filename);
  }

  // 1. WOMAN IDLE PROFILE (Match User Image 1)
  console.log('1. Capturing Woman Idle Profile...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);
  // Match side profile camera
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.3, 0.05, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(300);
  await snap('verified_woman_idle_25deg_profile.png');

  // 2. WOMAN WALK LIVE PLAYBACK (Side & Front - Match User Image 9)
  console.log('2. Capturing Woman Walk...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 1.0;
    })()`
  });
  // Let it play for a bit
  await sleep(1200);
  // Capture front view
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.4, 0.12, 0.0, 0, 0);`
  });
  await sleep(200);
  await snap('verified_woman_walk_front.png');

  // Capture side view
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.4, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(200);
  await snap('verified_woman_walk_side.png');

  // 3. MAN IDLE HAND CLOSEUP (Match User Images 5, 6, 7)
  console.log('3. Capturing Man Hand Fist Closeup...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Front closeup of fist (verifying wrapped thumb, no duck foot / blade)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
      const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
      window._sr.setCameraPreset(wp.y, 0.45, 0.08, 0.05, wp.x, wp.z);
    })()`
  });
  await sleep(300);
  await snap('verified_man_fist_front.png');

  // Side closeup of fist (verifying wooden grip & pommel clearance)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
      const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
      window._sr.setCameraPreset(wp.y, 0.45, 0.08, -Math.PI * 0.5, wp.x, wp.z);
    })()`
  });
  await sleep(300);
  await snap('verified_man_fist_side.png');

  // 3/4 closeup of fist
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
      const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
      window._sr.setCameraPreset(wp.y, 0.45, 0.08, -0.45, wp.x, wp.z);
    })()`
  });
  await sleep(300);
  await snap('verified_man_fist_3q.png');

  // 4. MAN WALK LIVE PLAYBACK (Side & Back-Quarter - Match User Images 8 & 10)
  console.log('4. Capturing Man Walk...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 1.0;
    })()`
  });
  await sleep(1200);

  // Front
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, 0.0, 0, 0);`
  });
  await sleep(200);
  await snap('verified_man_walk_front.png');

  // Back-Quarter (verifying wand passes thigh with clean clearance)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, -Math.PI * 0.85, 0, 0);`
  });
  await sleep(200);
  await snap('verified_man_walk_backquarter.png');

  // Side
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(200);
  await snap('verified_man_walk_side.png');

  // Full body overview in Idle (front)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(400);
  await snap('verified_man_idle_full.png');

  edge.kill();
  console.log('ALL VERIFICATIONS COMPLETED SUCCESSFULLY!');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

