const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_fist_' + Date.now());
const PORT = 9238;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          resolve(resp.result);
        }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Setup: uncheck helpers, equip apprentice_wand, pause anim
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
      const btnP = document.getElementById('btn-pause-anim');
      if (btnP && !window._sr.state.animPaused) btnP.click();
    })()`
  });
  await sleep(1500);

  // Call setCameraPreset to zoom in on hand from right-rear
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.setCameraPreset(0.95, 0.45, 0.05, -1.7);
    })()`
  });
  await sleep(1000);

  // Take screenshot of current state
  async function snap(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = `screenshots/tune_${name}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(out, `C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/tune_${name}.png`);
    console.log(`Saved tune_${name}.png`);
  }

  await snap('1_current_view');

  ws.close();
  edge.kill();
}

main().catch(console.error);
