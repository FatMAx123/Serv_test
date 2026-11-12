const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_arm_debug_' + Date.now());
const PORT = 9945;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    'http://localhost:3000/showroom.html'
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
    } catch (_) { }
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

  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.reset().play();
          action.paused = true;
          action.time = 0.80;
          window._sr.activeMixer.update(0.0001);
          window._sr.activeCharacterModel.updateMatrixWorld(true);
        }
        
        const man = window._sr.activeCharacterModel;
        const rArm = man.getObjectByName('mixamorig:RightArm') || man.getObjectByName('mixamorigRightArm');
        const rForeArm = man.getObjectByName('mixamorig:RightForeArm') || man.getObjectByName('mixamorigRightForeArm');
        const rHand = man.getObjectByName('mixamorig:RightHand') || man.getObjectByName('mixamorigRightHand');
        const wand = window._sr.weaponOrient;
        
        const armWorldPos = new THREE.Vector3(); if (rArm) rArm.getWorldPosition(armWorldPos);
        const foreWorldPos = new THREE.Vector3(); if (rForeArm) rForeArm.getWorldPosition(foreWorldPos);
        const handWorldPos = new THREE.Vector3(); if (rHand) rHand.getWorldPosition(handWorldPos);
        const wandWorldPos = new THREE.Vector3(); if (wand) wand.getWorldPosition(wandWorldPos);

        const rUpLeg = man.getObjectByName('mixamorig:RightUpLeg') || man.getObjectByName('mixamorigRightUpLeg');
        const rFoot = man.getObjectByName('mixamorig:RightFoot') || man.getObjectByName('mixamorigRightFoot');
        const lFoot = man.getObjectByName('mixamorig:LeftFoot') || man.getObjectByName('mixamorigLeftFoot');
        
        const rFootPos = new THREE.Vector3(); if (rFoot) rFoot.getWorldPosition(rFootPos);
        const lFootPos = new THREE.Vector3(); if (lFoot) lFoot.getWorldPosition(lFootPos);
        const rUpLegPos = new THREE.Vector3(); if (rUpLeg) rUpLeg.getWorldPosition(rUpLegPos);

        // Find the lowest point of Apprentice wand (the coil):
        const mesh = window._sr.activeWeaponMesh;
        const box = new THREE.Box3().setFromObject(mesh);
        
        return {
          armWorldPos: armWorldPos.toArray(),
          foreWorldPos: foreWorldPos.toArray(),
          handWorldPos: handWorldPos.toArray(),
          rUpLegPos: rUpLegPos.toArray(),
          rFootPos: rFootPos.toArray(),
          lFootPos: lFootPos.toArray(),
          weaponBoxMin: box.min.toArray(),
          weaponBoxMax: box.max.toArray(),
          weaponCenter: box.getCenter(new THREE.Vector3()).toArray(),
          rArmEulerDeg: rArm ? [rArm.rotation.x * 180 / Math.PI, rArm.rotation.y * 180 / Math.PI, rArm.rotation.z * 180 / Math.PI] : null,
          rForeArmEulerDeg: rForeArm ? [rForeArm.rotation.x * 180 / Math.PI, rForeArm.rotation.y * 180 / Math.PI, rForeArm.rotation.z * 180 / Math.PI] : null,
          rHandEulerDeg: rHand ? [rHand.rotation.x * 180 / Math.PI, rHand.rotation.y * 180 / Math.PI, rHand.rotation.z * 180 / Math.PI] : null,
        };
      } catch (err) {
        return { error: err.message, stack: err.stack };
      }
    })()`,
    returnByValue: true
  });

  console.log('Bones info:', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
