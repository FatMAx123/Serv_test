const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_arm_rot_' + Date.now());
const PORT = 9960;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 15; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(400);
  }
  throw new Error('Edge connection failed');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=' + Date.now()
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
  await sleep(2500);

  // Setup Man + Apprentice Wand + Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Front camera matching user's screenshot exactly
  await send('Runtime.evaluate', {
    expression: `window._sr.frameCamera('full');`
  });
  await sleep(300);

  // Pause at the exact frame shown in user's screenshot (right foot forward, left foot back, right arm down/back)
  // Let's sample frames of walk: duration is 1.07s
  // In user screenshot: right leg is forward, right arm is swinging down/back.
  // Let's pause at time = 0.35s, 0.45s, 0.55s to find the exact frame
  const frames = [0.35, 0.45, 0.55, 0.65];
  for (const t of frames) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.paused = true;
          action.time = ${t};
          window._sr.activeMixer.update(0.0001);
        }
      })()`
    });
    await sleep(150);
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/man_walk_frame_${Math.round(t * 100)}.png`, Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('DONE FRAME SCAN');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

