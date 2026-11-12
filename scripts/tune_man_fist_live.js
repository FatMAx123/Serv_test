const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_tune_' + Date.now());
const PORT = 9953;

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

  // Apply solved weapon rotation and position:
  // manRot: [0.7658, -0.8766, 0.3732]
  // Lower weapon slightly as user asked: "еще у мужского персонажа оружие надо опустить чуть ниже чтобы он держал его в кулаке"
  // Let's test moving weapon along its shaft or Y/Z
  await send('Runtime.evaluate', {
    expression: `(() => {
      const wo = window._sr.weaponOrient;
      wo.rotation.set(0.7658, -0.8766, 0.3732);
      // Let's inspect current position
      console.log('Current wo.position:', wo.position);
    })()`
  });

  // Now let's test finger curl and thumb angles to create a solid fist
  // In Mixamo skeleton for man:
  // Each finger curls along X axis!
  // Thumb:
  // Let's test different thumb Euler rotations and take closeups!
  const testThumbConfigs = [
    { name: 'curr', t1: [15, -40, -10], t2: [30, -15, 25], t3: [20, 0, 25] },
    { name: 'wrap1', t1: [35, -25, -45], t2: [45, 0, 30], t3: [45, 0, 20] },
    { name: 'wrap2', t1: [45, -15, -55], t2: [55, 10, 20], t3: [50, 0, 10] },
    { name: 'wrap3', t1: [25, -35, -60], t2: [60, -10, 30], t3: [60, 0, 30] }
  ];

  for (const cfg of testThumbConfigs) {
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
        if (bT1) bT1.quaternion.copy(eulerToQuat(${cfg.t1[0]}, ${cfg.t1[1]}, ${cfg.t1[2]}));
        if (bT2) bT2.quaternion.copy(eulerToQuat(${cfg.t2[0]}, ${cfg.t2[1]}, ${cfg.t2[2]}));
        if (bT3) bT3.quaternion.copy(eulerToQuat(${cfg.t3[0]}, ${cfg.t3[1]}, ${cfg.t3[2]}));
      })()`
    });
    await sleep(200);

    // Frame camera on weapon / hand
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.45, 0.15, -Math.PI * 0.35, -0.22, 0.05);`
    });
    await sleep(300);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_thumb_${cfg.name}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshots/test_thumb_${cfg.name}.png`);
  }

  ws.close();
  edge.kill();
}
run().catch(console.error);

