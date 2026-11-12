const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_perfect_' + Date.now());
const PORT = 9949;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
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
  await sleep(2000);

  // Switch to engi_man, apprentice_wand, pause
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
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Test sweep of weapon position in hand local space
  // wo.position: scaleInv is 100, so [x, y, z] in WEAPON_DEFINITIONS is multiplied by scaleInv
  // If basePos in WEAPON_DEFINITIONS is [px, py, pz]:
  // wo.position = [px * 100, py * 100, pz * 100]
  // Let's test py = 0.080, 0.090, 0.100, 0.105 with pz = 0.020, 0.025, 0.030
  // And let's test thumb curl wrapping over the index finger!
  const testPositions = [
    { name: 'y95_z25', pos: [0.005, 0.095, 0.025], t1: [25, -20, -50], t2: [55, 10, 25], t3: [45, 0, 15] },
    { name: 'y100_z25', pos: [0.005, 0.100, 0.025], t1: [25, -20, -50], t2: [55, 10, 25], t3: [45, 0, 15] },
    { name: 'y105_z28', pos: [0.005, 0.105, 0.028], t1: [28, -15, -55], t2: [60, 15, 20], t3: [50, 0, 10] },
    { name: 'y110_z30', pos: [0.005, 0.110, 0.030], t1: [28, -15, -55], t2: [60, 15, 20], t3: [50, 0, 10] }
  ];

  for (const t of testPositions) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const DEG2RAD = Math.PI / 180;
        function eulerToQuat(x, y, z) {
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        }

        // Apply thumb
        const bT1 = m.getObjectByName('mixamorigRightHandThumb1');
        const bT2 = m.getObjectByName('mixamorigRightHandThumb2');
        const bT3 = m.getObjectByName('mixamorigRightHandThumb3');
        if (bT1) bT1.quaternion.copy(eulerToQuat(${t.t1[0]}, ${t.t1[1]}, ${t.t1[2]}));
        if (bT2) bT2.quaternion.copy(eulerToQuat(${t.t2[0]}, ${t.t2[1]}, ${t.t2[2]}));
        if (bT3) bT3.quaternion.copy(eulerToQuat(${t.t3[0]}, ${t.t3[1]}, ${t.t3[2]}));

        // Apply weapon
        const wo = window._sr.weaponOrient;
        wo.rotation.set(0.7658, -0.8766, 0.3732);
        // hand scaleInv is 100
        wo.position.set(${t.pos[0] * 100}, ${t.pos[1] * 100}, ${t.pos[2] * 100});
        wo.updateMatrixWorld(true);

        // Frame camera on hand from front-right
        window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.50, -0.23, 0.04);
      })()`
    });
    await sleep(350);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_weap_pos_${t.name}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshots/test_weap_pos_${t.name}.png`);
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);

