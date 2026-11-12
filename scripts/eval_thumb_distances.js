const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_thumb_eval_' + Date.now());
const PORT = 9999;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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

  // Set engi_man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2000);

  const thumbCandidates = [
    { name: 'thumb_wom', t1: [15, -45, 30], t2: [25, 10, 45], t3: [10, 0, 40] },
    { name: 'thumb_inv_y', t1: [15, 45, 30], t2: [25, -10, 45], t3: [10, 0, 40] },
    { name: 'thumb_rest_tuck', t1: [25, -25, -40], t2: [10, -20, 20], t3: [0, 0, 30] },
    { name: 'thumb_clasp1', t1: [10, -30, -10], t2: [20, -15, 25], t3: [15, 0, 30] },
    { name: 'thumb_clasp2', t1: [0, -35, 10], t2: [30, 0, 30], t3: [20, 0, 30] },
    { name: 'thumb_clasp3', t1: [-10, -40, 20], t2: [35, 15, 40], t3: [25, 0, 35] },
    { name: 'thumb_clasp4', t1: [20, -20, 15], t2: [40, 0, 20], t3: [30, 0, 20] },
    { name: 'thumb_clasp5', t1: [15, -50, 0], t2: [45, -10, 20], t3: [35, 0, 20] }
  ];

  const results = [];
  for (const tc of thumbCandidates) {
    const evalRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG2RAD = Math.PI / 180;
        const e1 = new THREE.Euler(${tc.t1[0]} * DEG2RAD, ${tc.t1[1]} * DEG2RAD, ${tc.t1[2]} * DEG2RAD, 'XYZ');
        const e2 = new THREE.Euler(${tc.t2[0]} * DEG2RAD, ${tc.t2[1]} * DEG2RAD, ${tc.t2[2]} * DEG2RAD, 'XYZ');
        const e3 = new THREE.Euler(${tc.t3[0]} * DEG2RAD, ${tc.t3[1]} * DEG2RAD, ${tc.t3[2]} * DEG2RAD, 'XYZ');

        const m = window._sr.activeCharacterModel;
        const bHand = m.getObjectByName('mixamorigRightHand');
        const bT1 = m.getObjectByName('mixamorigRightHandThumb1');
        const bT2 = m.getObjectByName('mixamorigRightHandThumb2');
        const bT3 = m.getObjectByName('mixamorigRightHandThumb3');
        const bI1 = m.getObjectByName('mixamorigRightHandIndex1');
        const bI2 = m.getObjectByName('mixamorigRightHandIndex2');
        const bM2 = m.getObjectByName('mixamorigRightHandMiddle2');

        bT1.quaternion.setFromEuler(e1);
        bT2.quaternion.setFromEuler(e2);
        bT3.quaternion.setFromEuler(e3);
        m.updateMatrixWorld(true);

        const pHand = new THREE.Vector3(); bHand.getWorldPosition(pHand);
        const pT1 = new THREE.Vector3(); bT1.getWorldPosition(pT1);
        const pT3 = new THREE.Vector3(); bT3.getWorldPosition(pT3);
        const pI2 = new THREE.Vector3(); bI2.getWorldPosition(pI2);
        const pM2 = new THREE.Vector3(); bM2.getWorldPosition(pM2);

        // Vector from T1 to T3 (thumb direction in world space)
        const vThumb = pT3.clone().sub(pT1);
        // Distance to Index2 (thumb tip should be close to index second knuckle ~2-4 cm)
        const distToIndex2 = pT3.distanceTo(pI2);
        const distToMiddle2 = pT3.distanceTo(pM2);

        return {
          name: '${tc.name}',
          thumbWorldDir: [vThumb.x, vThumb.y, vThumb.z].map(v => +v.toFixed(3)),
          distToIndex2_cm: +(distToIndex2 * 100).toFixed(1),
          distToMiddle2_cm: +(distToMiddle2 * 100).toFixed(1)
        };
      })()`,
      returnByValue: true
    });
    results.push(evalRes.result.value);
  }

  console.table(results);

  // Also evaluate Woman's reference distances
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_woman';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(1500);

  const womEval = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const bT1 = m.getObjectByName('mixamorig:RightHandThumb1');
      const bT3 = m.getObjectByName('mixamorig:RightHandThumb3');
      const bI2 = m.getObjectByName('mixamorig:RightHandIndex2');
      const bM2 = m.getObjectByName('mixamorig:RightHandMiddle2');
      m.updateMatrixWorld(true);

      const pT1 = new THREE.Vector3(); bT1.getWorldPosition(pT1);
      const pT3 = new THREE.Vector3(); bT3.getWorldPosition(pT3);
      const pI2 = new THREE.Vector3(); bI2.getWorldPosition(pI2);
      const pM2 = new THREE.Vector3(); bM2.getWorldPosition(pM2);

      const vThumb = pT3.clone().sub(pT1);
      return {
        name: 'WOMAN_REFERENCE',
        thumbWorldDir: [vThumb.x, vThumb.y, vThumb.z].map(v => +v.toFixed(3)),
        distToIndex2_cm: +(pT3.distanceTo(pI2) * 100).toFixed(1),
        distToMiddle2_cm: +(pT3.distanceTo(pM2) * 100).toFixed(1)
      };
    })()`,
    returnByValue: true
  });

  console.log('WOMAN REFERENCE:');
  console.log(womEval.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

