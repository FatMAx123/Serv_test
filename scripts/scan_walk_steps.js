const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_step_' + Date.now());
const PORT = 9952;

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
    'http://localhost:3000/showroom.html'
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
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(2000);

  // Sample every 0.1s from 0.0 to 1.0s
  for (let i = 0; i <= 10; i++) {
    const t = +(i * 0.1).toFixed(2);
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
    await sleep(80);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/walk_step_${Math.round(t * 100)}.png`, Buffer.from(snap.data, 'base64'));
  }

  edge.kill();
  console.log('DONE STEP SCAN');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

