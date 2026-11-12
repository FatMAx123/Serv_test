const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sit_' + Date.now());
const PORT = 9229;

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
  for (let i = 0; i < 20; i++) {
    await sleep(300);
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
    return new Promise((resolve) => {
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

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Navigating to http://localhost:3000/showroom.html ...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });

  await sleep(4000);

  // Play sit_down, set camera behind character, turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      
      const sel = document.getElementById('sel-animation');
      if (sel) {
        sel.value = 'stand_up';
        sel.dispatchEvent(new Event('change'));
      }
      
      // Rotate camera to view back (azimuth = PI)
      if (window._sr && window._sr.setCameraPreset) {
        window._sr.setCameraPreset(0.50, 1.7, 0.25, Math.PI);
      }
    })()`,
    returnByValue: true
  });

  // Wait until mid-sit bend (approx 1.6 seconds into animation)
  await sleep(1600);

  // Pause animation and set back camera
  await send('Runtime.evaluate', {
    expression: `(() => {
      const pauseBtn = document.getElementById('btn-pause-anim');
      if (pauseBtn) pauseBtn.click();
      if (window._sr && window._sr.activeCharacterModel) {
        window._sr.activeCharacterModel.rotation.y = Math.PI;
      }
    })()`,
    returnByValue: true
  });

  await sleep(600);

  // Take screenshot
  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  const shotBuf = Buffer.from(shotRes.data, 'base64');
  const shotPath = path.join(__dirname, '..', 'screenshots', 'debug_stand_up_back.png');
  require('fs').writeFileSync(shotPath, shotBuf);
  console.log('Screenshot saved to:', shotPath);

  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
