const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rot_test_' + Date.now());
const PORT = 9922;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=sr-18'
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

  // Switch to engi_man, apprentice_wand
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
    })()`
  });
  await sleep(2500);

  // Set weaponOrient rotation to woman's rot: [1.5075, -1.1728, 1.1151]
  await send('Runtime.evaluate', {
    expression: `(() => {
      const wo = window._sr.weaponOrient;
      wo.rotation.set(1.5075, -1.1728, 1.1151);
      wo.position.set(-0.005 * 100, 0.044 * 100, 0.022 * 100);
      window._sr.activeCharacterModel.updateMatrixWorld(true);
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(400);

  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_man_with_woman_rot_idle.png', Buffer.from(snap.data, 'base64'));

  // Now test walk with woman's rot on man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(0.95, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(1000);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_man_with_woman_rot_walk.png', Buffer.from(snap.data, 'base64'));

  console.log('Saved test_man_with_woman_rot screenshots!');
  ws.close();
  edge.kill();
}
run().catch(console.error);

