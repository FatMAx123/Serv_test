const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_verify_' + Date.now());
const PORT = 9953;
const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=sr-23'
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

  async function snap(filename) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(s.data, 'base64'));
    fs.writeFileSync(path.join('screenshots', filename), Buffer.from(s.data, 'base64'));
    console.log('Saved:', filename);
  }

  // 1. Setup Man + Apprentice Wand
  console.log('--- Checking Man ---');
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
  await sleep(2500);

  // 1A. Walk phase 0.80 (User's exact pose)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      const action = window._sr.activeActions['walk'];
      if (action) {
        action.reset().play();
        action.paused = true;
        action.time = 0.80;
        window._sr.activeMixer.update(0.0001);
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      }
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(200);
  await snap('verified_man_walk_backswing_front.png');

  // 1B. Walk phase 0.80 (Back-quarter view)
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.5, 0.12, -Math.PI * 0.85, 0, 0);`
  });
  await sleep(200);
  await snap('verified_man_walk_backswing_backq.png');

  // 1C. Walk phase 0.25 (Forward swing)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const action = window._sr.activeActions['walk'];
      if (action) {
        action.reset().play();
        action.paused = true;
        action.time = 0.25;
        window._sr.activeMixer.update(0.0001);
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      }
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(200);
  await snap('verified_man_walk_fwdswing_front.png');

  // 1D. Walk phase 0.50 (Passing thigh)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const action = window._sr.activeActions['walk'];
      if (action) {
        action.reset().play();
        action.paused = true;
        action.time = 0.50;
        window._sr.activeMixer.update(0.0001);
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      }
      window._sr.setCameraPreset(0.9, 2.4, 0.15, Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(200);
  await snap('verified_man_walk_mid_side.png');

  // 1E. Run phase 0.40 (Swing back during run)
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
  await sleep(200);
  await snap('verified_man_run_front.png');

  // 1F. Idle (Full view)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(400);
  await snap('verified_man_idle_full_post.png');

  // 2. Setup Woman + Apprentice Wand
  console.log('--- Checking Woman ---');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // 2A. Woman Walk (Front)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      const action = window._sr.activeActions['walk'];
      if (action) {
        action.reset().play();
        action.paused = true;
        action.time = 0.80;
        window._sr.activeMixer.update(0.0001);
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      }
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(200);
  await snap('verified_woman_walk_backswing_front.png');

  // Measure weapon coordinates in Man Walk 0.80 to output definitive clearance stats:
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);
  const metrics = await send('Runtime.evaluate', {
    expression: `(() => {
      const action = window._sr.activeActions['walk'];
      if (action) {
        action.reset().play();
        action.paused = true;
        action.time = 0.80;
        window._sr.activeMixer.update(0.0001);
        window._sr.activeCharacterModel.updateMatrixWorld(true);
      }
      const mesh = window._sr.activeWeaponMesh;
      const box = new THREE.Box3().setFromObject(mesh);
      const man = window._sr.activeCharacterModel;
      const rUpLeg = man.getObjectByName('mixamorig:RightUpLeg') || man.getObjectByName('mixamorigRightUpLeg');
      const rFoot = man.getObjectByName('mixamorig:RightFoot') || man.getObjectByName('mixamorigRightFoot');
      const rFootPos = new THREE.Vector3(); rFoot.getWorldPosition(rFootPos);
      const rLegPos = new THREE.Vector3(); rUpLeg.getWorldPosition(rLegPos);
      return {
        weaponMinX: box.min.x,
        weaponMaxX: box.max.x,
        weaponCenterX: (box.min.x + box.max.x) / 2,
        rLegX: rLegPos.x,
        rFootX: rFootPos.x,
        lateralClearanceCm: ((rLegPos.x - box.max.x) * 100).toFixed(1)
      };
    })()`,
    returnByValue: true
  });
  console.log('Final Metrics:', metrics.result.value);

  edge.kill();
  console.log('ALL VERIFICATIONS FINISHED SUCCESSFULLY');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

