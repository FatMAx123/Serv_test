const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_nat2_' + Date.now());
const PORT = 9934;

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

  // Play Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(0.95, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(800);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/curr_man_walk_side.png', Buffer.from(snap.data, 'base64'));

  // Play Run
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'run';
      selA.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(0.95, 2.5, 0.12, -Math.PI * 0.5, 0, 0);
    })()`
  });
  await sleep(800);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/curr_man_run_side.png', Buffer.from(snap.data, 'base64'));

  console.log('Saved curr_man_walk_side and curr_man_run_side!');
  ws.close();
  edge.kill();
}
run().catch(console.error);

