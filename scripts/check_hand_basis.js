const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_hand_basis_' + Date.now());
const PORT = 9975;

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
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  // Set engi_man, pause
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2000);

  // Let's inspect RightHand world matrix and axes
  const basis = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand');
      hand.updateMatrixWorld(true);

      const m4 = hand.matrixWorld;
      // Extract local X, Y, Z axes of hand in world space
      const localX = new THREE.Vector3(1, 0, 0).transformDirection(m4);
      const localY = new THREE.Vector3(0, 1, 0).transformDirection(m4);
      const localZ = new THREE.Vector3(0, 0, 1).transformDirection(m4);

      const handPos = new THREE.Vector3(); hand.getWorldPosition(handPos);

      return {
        handPos: [handPos.x, handPos.y, handPos.z].map(v => +v.toFixed(3)),
        localX_in_world: [localX.x, localX.y, localX.z].map(v => +v.toFixed(3)),
        localY_in_world: [localY.x, localY.y, localY.z].map(v => +v.toFixed(3)),
        localZ_in_world: [localZ.x, localZ.y, localZ.z].map(v => +v.toFixed(3))
      };
    })()`,
    returnByValue: true
  });

  console.log('Man RightHand basis in world coordinates:');
  console.log(basis.result.value);

  // Also check Woman RightHand basis
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_woman';
      selChar.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2000);

  const womBasis = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorig:RightHand');
      hand.updateMatrixWorld(true);

      const m4 = hand.matrixWorld;
      const localX = new THREE.Vector3(1, 0, 0).transformDirection(m4);
      const localY = new THREE.Vector3(0, 1, 0).transformDirection(m4);
      const localZ = new THREE.Vector3(0, 0, 1).transformDirection(m4);

      const handPos = new THREE.Vector3(); hand.getWorldPosition(handPos);

      return {
        handPos: [handPos.x, handPos.y, handPos.z].map(v => +v.toFixed(3)),
        localX_in_world: [localX.x, localX.y, localX.z].map(v => +v.toFixed(3)),
        localY_in_world: [localY.x, localY.y, localY.z].map(v => +v.toFixed(3)),
        localZ_in_world: [localZ.x, localZ.y, localZ.z].map(v => +v.toFixed(3))
      };
    })()`,
    returnByValue: true
  });

  console.log('Woman RightHand basis in world coordinates:');
  console.log(womBasis.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

