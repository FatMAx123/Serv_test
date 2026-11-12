const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_hole_' + Date.now());
const PORT = 9950;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
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

  // Measure finger positions in hand local coordinates
  const fingerData = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand');
      hand.updateMatrixWorld(true);
      const invHand = hand.matrixWorld.clone().invert();

      const fingers = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
      const pts = {};
      fingers.forEach(f => {
        for (let i = 1; i <= 3; i++) {
          const b = m.getObjectByName('mixamorigRightHand' + f + i);
          if (b) {
            const wp = new THREE.Vector3(); b.getWorldPosition(wp);
            wp.applyMatrix4(invHand);
            pts[f + i] = [wp.x, wp.y, wp.z].map(v => +v.toFixed(4));
          }
        }
      });

      // Also check where weaponOrient is in hand local space
      const wo = window._sr.weaponOrient;
      return { pts, woPos: [wo.position.x, wo.position.y, wo.position.z].map(v => +v.toFixed(4)) };
    })()`,
    returnByValue: true
  });

  console.log('Man finger points in hand local space:');
  console.log(JSON.stringify(fingerData.result.value, null, 2));

  ws.close();
  edge.kill();
}
run().catch(console.error);

