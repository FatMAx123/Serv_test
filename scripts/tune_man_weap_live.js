const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_weap_tune_' + Date.now());
const PORT = 9987;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Failed to connect to Edge DevTools');
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
  await sleep(2000);

  // Setup engi_man, apprentice_wand, pause
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  // Apply the solved fist_clasp_down quaternions to engi_man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const DEG2RAD = Math.PI / 180;
      const e2q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
      const m = window._sr.activeCharacterModel;
      const setQ = (bName, x, y, z) => {
        const b = m.getObjectByName('mixamorig:' + bName) || m.getObjectByName('mixamorig' + bName);
        if (b) b.quaternion.copy(e2q(x, y, z));
      };

      setQ('RightHandIndex1', 75, 0, -5);
      setQ('RightHandIndex2', 85, 0, 0);
      setQ('RightHandIndex3', 75, 0, 0);

      setQ('RightHandMiddle1', 75, 0, 0);
      setQ('RightHandMiddle2', 90, 0, 0);
      setQ('RightHandMiddle3', 75, 0, 0);

      setQ('RightHandRing1', 80, 0, 3);
      setQ('RightHandRing2', 95, 0, 0);
      setQ('RightHandRing3', 75, 0, 0);

      setQ('RightHandPinky1', 85, 0, 8);
      setQ('RightHandPinky2', 95, 0, 0);
      setQ('RightHandPinky3', 75, 0, 0);

      setQ('RightHandThumb1', 15, -40, -10);
      setQ('RightHandThumb2', 30, -15, 25);
      setQ('RightHandThumb3', 20, 0, 25);

      m.updateMatrixWorld(true);
    })()`
  });
  await sleep(200);

  // Now let's tune weaponOrient position and rotation on the man
  // Currently manPos was [0.010, 0.075, 0.020]
  // In Screenshot 10, the weapon is:
  // 1) Too high (the gold pommel is above the top knuckle, user asked to lower it so he holds it in the fist).
  // 2) Tilted inwards across the body (yaw angle needs adjustment so it points straight forward parallel to the leg).
  // Let's test pos variations:
  // In hand coordinates: Y is along forearm. To lower the weapon into the fist: decrease or increase Y?
  // Let's test Y = 0.050, 0.060, 0.075
  // Also Z moves along palm thickness, X moves laterally.
  // And for rotation:
  // def.rot was [Math.PI * 0.5, -1.1345, 1.1345] = [1.5708, -1.1345, 1.1345]
  // Let's sweep rotation to straighten X (make weapon point parallel to forward Z instead of inward +X)

  const candidates = [
    // Base with lowered pos
    { name: 'tune_p055_rBase', pos: [0.010, 0.055, 0.020], rot: [Math.PI * 0.5, -1.1345, 1.1345] },
    { name: 'tune_p060_rBase', pos: [0.010, 0.060, 0.020], rot: [Math.PI * 0.5, -1.1345, 1.1345] },
    // Adjust yaw (second angle) to point more straight forward
    { name: 'tune_yaw_neg100', pos: [0.010, 0.058, 0.020], rot: [Math.PI * 0.5, -1.00, 1.1345] },
    { name: 'tune_yaw_neg125', pos: [0.010, 0.058, 0.020], rot: [Math.PI * 0.5, -1.25, 1.1345] },
    // Adjust roll (third angle)
    { name: 'tune_roll_100', pos: [0.010, 0.058, 0.020], rot: [Math.PI * 0.5, -1.1345, 1.00] },
    { name: 'tune_roll_125', pos: [0.010, 0.058, 0.020], rot: [Math.PI * 0.5, -1.1345, 1.25] },
    // Combined adjustments
    { name: 'tune_combo1', pos: [0.008, 0.056, 0.022], rot: [Math.PI * 0.5, -1.20, 1.25] },
    { name: 'tune_combo2', pos: [0.008, 0.056, 0.022], rot: [Math.PI * 0.5, -1.05, 1.05] },
    { name: 'tune_combo3', pos: [0.012, 0.058, 0.022], rot: [Math.PI * 0.5, -1.30, 1.20] },
    { name: 'tune_combo4', pos: [0.005, 0.055, 0.022], rot: [Math.PI * 0.5, -1.18, 1.18] }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        if (!wo) return;
        const hand = window._sr.charRoot ? (window._sr.charRoot.getObjectByName('mixamorigRightHand')) : null;
        const boneWorldScale = new THREE.Vector3(1, 1, 1);
        if (hand) hand.getWorldScale(boneWorldScale);
        const boneScale = Math.max(boneWorldScale.x, boneWorldScale.y, boneWorldScale.z);
        const scaleInv = (boneScale > 1e-5) ? (1.0 / boneScale) : 100.0;

        const p = ${JSON.stringify(c.pos)};
        const r = ${JSON.stringify(c.rot)};
        wo.position.set(p[0] * scaleInv, p[1] * scaleInv, p[2] * scaleInv);
        wo.rotation.set(r[0], r[1], r[2]);
        wo.updateMatrixWorld(true);
      })()`
    });
    await sleep(150);

    // Front-3/4 view (exactly matching Screenshot 10!)
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, 0.08, -0.20, 0.05);`
    });
    await sleep(150);
    let snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/${c.name}_front10.png`, Buffer.from(snap.data, 'base64'));

    // Side view
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 0.70, 0.12, -Math.PI * 0.5, -0.20, 0.05);`
    });
    await sleep(150);
    snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/${c.name}_side.png`, Buffer.from(snap.data, 'base64'));

    console.log(`Captured ${c.name}`);
  }

  ws.close();
  edge.kill();
  console.log('All tunes captured!');
}

run().catch(console.error);

