const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9988;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_axes_' + Date.now())}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      tabs = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) {
          ws.off('message', h);
          res(r.result);
        }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res && res.result && res.result.value !== undefined) return res.result.value;
    if (res && res.result) return res.result;
    return res;
  }

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // Inspect Woman Rig
  console.log('Inspecting Woman Rig...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  const womanBones = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
    const rForeArm = m.getObjectByName('mixamorigRightForeArm') || m.getObjectByName('mixamorig:RightForeArm');
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    
    // In rest / idle pose, calculate world direction of bone axes
    m.updateMatrixWorld(true);
    const armWorld = new THREE.Vector3(); rArm.getWorldPosition(armWorld);
    const foreWorld = new THREE.Vector3(); rForeArm.getWorldPosition(foreWorld);
    const handWorld = new THREE.Vector3(); rHand.getWorldPosition(handWorld);

    // Vector along upper arm (from shoulder to elbow)
    const upperArmVec = new THREE.Vector3().subVectors(foreWorld, armWorld).normalize();
    // Vector along forearm (from elbow to wrist)
    const foreArmVec = new THREE.Vector3().subVectors(handWorld, foreWorld).normalize();

    // In rArm local space: what axis points along the bone?
    const localForePos = rForeArm.position.clone().normalize();

    return {
      upperArmVec: upperArmVec.toArray(),
      foreArmVec: foreArmVec.toArray(),
      localForePos: localForePos.toArray(),
      rArmQuat: rArm.quaternion.toArray(),
      rForeArmQuat: rForeArm.quaternion.toArray()
    };
  })()`);
  console.log('Woman bone vectors:', womanBones);

  // Inspect Man Rig
  console.log('Inspecting Man Rig...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  const manBones = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const rArm = m.getObjectByName('mixamorigRightArm') || m.getObjectByName('mixamorig:RightArm');
    const rForeArm = m.getObjectByName('mixamorigRightForeArm') || m.getObjectByName('mixamorig:RightForeArm');
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    
    m.updateMatrixWorld(true);
    const armWorld = new THREE.Vector3(); rArm.getWorldPosition(armWorld);
    const foreWorld = new THREE.Vector3(); rForeArm.getWorldPosition(foreWorld);
    const handWorld = new THREE.Vector3(); rHand.getWorldPosition(handWorld);

    const upperArmVec = new THREE.Vector3().subVectors(foreWorld, armWorld).normalize();
    const foreArmVec = new THREE.Vector3().subVectors(handWorld, foreWorld).normalize();
    const localForePos = rForeArm.position.clone().normalize();

    return {
      upperArmVec: upperArmVec.toArray(),
      foreArmVec: foreArmVec.toArray(),
      localForePos: localForePos.toArray(),
      rArmQuat: rArm.quaternion.toArray(),
      rForeArmQuat: rForeArm.quaternion.toArray()
    };
  })()`);
  console.log('Man bone vectors:', manBones);

  ws.close();
  edge.kill();
}

main().catch(console.error);

