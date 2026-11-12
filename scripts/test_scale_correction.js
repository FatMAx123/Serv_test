const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fix_' + Date.now());
const PORT = 9260;

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

  // Switch to novice mace, and apply weaponRoot scale correction
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Apply scale correction
  await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const root = sr.weaponRoot;
      const mesh = sr.activeWeaponMesh;
      if (!root || !root.parent) return 'no root';

      // Counteract bone scale so weaponRoot is 1.0 in world meters
      const ws = new THREE.Vector3();
      root.parent.getWorldScale(ws);
      root.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
      root.updateMatrixWorld(true);

      const b = new THREE.Box3().setFromObject(mesh);
      const sz = new THREE.Vector3();
      b.getSize(sz);

      window._sr.frameCamera('weapon');

      return {
        counterScale: [root.scale.x, root.scale.y, root.scale.z],
        boxSize: [sz.x.toFixed(3), sz.y.toFixed(3), sz.z.toFixed(3)]
      };
    })()`,
    returnByValue: true
  });
  await sleep(1000);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_fixed_scale_novice.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/test_fixed_scale_novice.png');

  // Also full body shot
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.setCameraPreset('full');
    })()`
  });
  await sleep(500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_fixed_scale_novice_full.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

