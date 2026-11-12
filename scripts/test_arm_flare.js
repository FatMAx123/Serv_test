const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_flare_' + Date.now());
const PORT = 9918;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=sr-19'
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
      window._sr.frameCamera('full');
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Set walk time to the phase where arm is swung back (around t = 0.64s as in user screenshot)
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.activeMixer.setTime(0.64);
      window._sr.activeCharacterModel.updateMatrixWorld(true);
    })()`
  });
  await sleep(200);

  // Baseline screenshot (penetrating thigh as in user screenshot media_1794048186413_728f1090.jpg)
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/flare_baseline_penetrating.png', Buffer.from(snap.data, 'base64'));

  // Test abduction rotation in shoulder space:
  // In Mixamo rig, what local axis abducts the right arm away from the torso?
  // Let's test rotating around parent space or local axes:
  const tests = [
    { name: 'parent_z_flare12', axis: 'parent_z', deg: 12 },
    { name: 'parent_z_flare16', axis: 'parent_z', deg: 16 },
    { name: 'parent_z_flare20', axis: 'parent_z', deg: 20 },
    { name: 'local_z_flare12', axis: 'local_z', deg: 12 },
    { name: 'local_z_flare16', axis: 'local_z', deg: 16 }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const rArm = m.getObjectByName('mixamorigRightArm');
        const rShoulder = m.getObjectByName('mixamorigRightShoulder');
        
        // Reset animation frame
        window._sr.activeMixer.setTime(0.64);
        m.updateMatrixWorld(true);

        const rad = ${t.deg} * Math.PI / 180;
        if ('${t.axis}' === 'parent_z') {
          // Rotate in parent shoulder space around Z (or character world forward)
          const qFlare = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad);
          rArm.quaternion.premultiply(qFlare);
        } else if ('${t.axis}' === 'local_z') {
          const qFlare = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad);
          rArm.quaternion.multiply(qFlare);
        }
        m.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${t.name}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshots/test_${t.name}.png`);
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);

