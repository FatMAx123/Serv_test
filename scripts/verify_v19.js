const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_v19_verify_' + Date.now());
const PORT = 9921;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=sr-19'
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
  const consoleErrors = [];
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.method === 'Runtime.consoleAPICalled' && resp.params && resp.params.type === 'error') {
          consoleErrors.push(resp.params.args.map(a => a.value || a.description).join(' '));
        }
        if (resp.id === id) { ws.off('message', handler); resolve(resp.result); }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1500);

  console.log('Testing v19: Woman and Man with zero arm hackery and unified canon rotation...');

  // 1. Woman Walk Front (verifying natural arm, zero abduction flare)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(1500);
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_woman_walk_front.png', Buffer.from(snap.data, 'base64'));

  // 2. Woman Walk Side
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.3, 0.08, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(500);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_woman_walk_side.png', Buffer.from(snap.data, 'base64'));

  // 3. Woman Idle Side (checking match with user's red arrow)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(600);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_woman_idle_side.png', Buffer.from(snap.data, 'base64'));

  // 4. Man Idle Full Front
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle';
      selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(2000);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_man_idle_front.png', Buffer.from(snap.data, 'base64'));

  // 5. Man Hand Closeup
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.87, 0.45, 0.10, 0.40, -0.23, 0.04);`
  });
  await sleep(500);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_man_hand_closeup.png', Buffer.from(snap.data, 'base64'));

  // 6. Man Walk Front
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk';
      selA.dispatchEvent(new Event('change'));
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(1500);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_man_walk_front.png', Buffer.from(snap.data, 'base64'));

  // 7. Man Walk Side
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.95, 2.5, 0.12, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(500);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_man_walk_side.png', Buffer.from(snap.data, 'base64'));

  // 8. Man Run Side
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      selA.value = 'run';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1000);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/v19_man_run_side.png', Buffer.from(snap.data, 'base64'));

  console.log('Console errors:', consoleErrors);
  console.log('All v19 verifications completed successfully!');

  ws.close();
  edge.kill();
}
run().catch(console.error);

