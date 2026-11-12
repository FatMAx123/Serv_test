const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_height_' + Date.now());
const PORT = 9978;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
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

  // Load man + apprentice wand with updated curled thumb
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));

      // Apply locked fist with authentic curled thumb
      const e2q = window._sr.eulerToQuat;
      const dict = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
      dict.RightHandPinky3 = e2q(65, 0, 0);
      dict.RightHandRing3 = e2q(65, 0, 0);
      dict.RightHandThumb1 = e2q(40, -40, 20);
      dict.RightHandThumb2 = e2q(35, 15, 50);
      dict.RightHandThumb3 = e2q(20, 10, 40);
    })()`
  });
  await sleep(2000);

  // Position camera on man's fist
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
      const wp = new THREE.Vector3();
      hand.getWorldPosition(wp);
      window._sr.setCameraPreset(wp.y, 0.45, 0.08, -0.45, wp.x, wp.z);
    })()`
  });
  await sleep(300);

  // Test manPos y values: 0.060, 0.075, 0.090, 0.105
  // Also test manPos z values: 0.015, 0.022, 0.030
  const yValues = [0.055, 0.070, 0.085, 0.100, 0.115];
  for (const y of yValues) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
        const s = new THREE.Vector3(); hand.getWorldScale(s);
        const scaleInv = 1.0 / s.x;
        wo.position.set(-0.005 * scaleInv, ${y} * scaleInv, 0.022 * scaleInv);
        wo.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/tune_man_weap_y_${Math.round(y * 1000)}.png`, Buffer.from(s.data, 'base64'));
    console.log(`Saved tune_man_weap_y_${Math.round(y * 1000)}.png`);
  }

  // Also test manRot fine tuning in idle
  // Let's see how the man holds the weapon in idle with canonical Lineage 2 warrior posture
  edge.kill();
  console.log('DONE HEIGHT TUNE');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

