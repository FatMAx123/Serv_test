const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_find_rot_' + Date.now());
const PORT = 9931;

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
  await sleep(1500);

  // We want to test different rotations for Man and Woman holding apprentice_wand
  // Let's first test Man in Idle.
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // We want to inspect the current weaponOrient rotation and world direction
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      const rHand = m.getObjectByName('mixamorigRightHand');

      // Test rotating weaponOrient so shaft points FORWARD and DOWN:
      // Let's get the world position of the character forward vector:
      // In showroom, character stands on platform facing -Z or +Z?
      const hips = m.getObjectByName('mixamorigHips');
      const hipsPos = new THREE.Vector3(); hips.getWorldPosition(hipsPos);
      const spine = m.getObjectByName('mixamorigSpine2');
      const spinePos = new THREE.Vector3(); spine.getWorldPosition(spinePos);

      // Mixamo forward direction is usually (0, 0, 1) or (0, 0, -1) in hips/root space
      // Let's get character forward direction:
      const vForward = new THREE.Vector3(0, 0, 1).applyQuaternion(m.quaternion);

      return {
        manRot_current: [wo.rotation.x, wo.rotation.y, wo.rotation.z],
        charForward: vForward
      };
    })()`,
    returnByValue: true
  });

  console.log('Current Man Setup:', res.result.value);

  ws.close();
  edge.kill();
}
run().catch(console.error);

