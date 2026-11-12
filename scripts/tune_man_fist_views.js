const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_closeup_' + Date.now());
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

  const configs = [
    {
      id: 'curr',
      t1: [15, -40, -10], t2: [30, -15, 25], t3: [20, 0, 25],
      weapPos: [0.010, 0.055, 0.020]
    },
    {
      id: 'opt1_curled',
      t1: [25, -20, -45], t2: [45, 0, 30], t3: [40, 0, 20],
      weapPos: [0.008, 0.038, 0.012]
    },
    {
      id: 'opt2_tight_l2',
      t1: [32, -10, -55], t2: [55, 10, 20], t3: [50, 0, 10],
      weapPos: [0.008, 0.036, 0.012]
    },
    {
      id: 'opt3_locked_wrap',
      t1: [20, -30, -50], t2: [60, -10, 35], t3: [55, 0, 25],
      weapPos: [0.008, 0.036, 0.010]
    }
  ];

  for (const c of configs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const DEG2RAD = Math.PI / 180;
        function eulerToQuat(x, y, z) {
          return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
        }
        const bT1 = m.getObjectByName('mixamorigRightHandThumb1');
        const bT2 = m.getObjectByName('mixamorigRightHandThumb2');
        const bT3 = m.getObjectByName('mixamorigRightHandThumb3');
        if (bT1) bT1.quaternion.copy(eulerToQuat(${c.t1[0]}, ${c.t1[1]}, ${c.t1[2]}));
        if (bT2) bT2.quaternion.copy(eulerToQuat(${c.t2[0]}, ${c.t2[1]}, ${c.t2[2]}));
        if (bT3) bT3.quaternion.copy(eulerToQuat(${c.t3[0]}, ${c.t3[1]}, ${c.t3[2]}));

        const wo = window._sr.weaponOrient;
        wo.rotation.set(0.7658, -0.8766, 0.3732);
        wo.position.set(${c.weapPos[0]}, ${c.weapPos[1]}, ${c.weapPos[2]});
        wo.updateMatrixWorld(true);

        window._sr.setCameraPreset(0.87, 0.50, 0.12, 0.45, -0.23, 0.04);
      })()`
    });
    await sleep(350);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/man_fist_view_${c.id}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshots/man_fist_view_${c.id}.png`);
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);
