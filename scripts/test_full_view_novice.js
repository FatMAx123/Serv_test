const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_full_nov_' + Date.now());
const PORT = 9310;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'about:blank'
  ]);
  await sleep(1500);
  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Hide UI
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
    })()`
  });

  // Switch to novice
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
      const fbx = sr.activeWeaponMesh;
      orient.position.set(0.0, 7.0, 1.5);
      orient.rotation.set(0.0, 0.0, Math.PI * 0.5);
      const s = 94 / 119.36;
      fbx.scale.set(s, s, s);
    })()`
  });
  await sleep(500);

  // Full front view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
  await sleep(600);
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/novice_full_front.png', Buffer.from(shot.data, 'base64'));

  // Close weapon view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
  await sleep(600);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/novice_close_hand.png', Buffer.from(shot.data, 'base64'));

  // Isometric / angle view
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('iso')` });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/novice_full_iso.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
