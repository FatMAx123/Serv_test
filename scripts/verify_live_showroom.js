const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verif_' + Date.now());
const PORT = 9338;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
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
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html?v=' + Date.now() });
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

  const weapons = [
    { id: 'novice', name: 'Булава Послушника' },
    { id: 'magic_mace', name: 'Магическая булава' },
    { id: 'atuba_mace', name: 'Булава Атуба' },
    { id: 'demon_staff', name: 'Посох Демона' },
    { id: 'tears_fairy', name: 'Слёзы Феи' }
  ];

  for (const w of weapons) {
    console.log('Testing live weapon:', w.id);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        sel.value = '${w.id}';
        sel.dispatchEvent(new Event('change'));
      })()`
    });
    // Wait for loadWeapon to load and position mesh
    await sleep(2500);

    const metrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const THREE = window.THREE;
        const sr = window._sr;
        const fbx = sr.activeWeaponMesh;
        if (!fbx) return { error: 'none' };
        const wp = new THREE.Vector3(); fbx.getWorldPosition(wp);
        const ws = new THREE.Vector3(); fbx.getWorldScale(ws);
        const b = new THREE.Box3().setFromObject(fbx);
        const sz = new THREE.Vector3(); b.getSize(sz);
        return {
          worldPos: [wp.x, wp.y, wp.z],
          worldScale: [ws.x, ws.y, ws.z],
          worldSize: [sz.x, sz.y, sz.z]
        };
      })()`,
      returnByValue: true
    });
    console.log(`Metrics for ${w.id}:`, JSON.stringify(metrics.result.value));

    // Full body shot
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
    await sleep(400);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/live_verif_${w.id}_full.png`, Buffer.from(shot.data, 'base64'));

    // Closeup shot
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
    await sleep(400);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/live_verif_${w.id}_closeup.png`, Buffer.from(shot.data, 'base64'));
  }

  // Test Sitting Animation
  console.log('Testing sit_loop...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
  await sleep(400);
  let shotSit = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/live_verif_sit_loop.png', Buffer.from(shotSit.data, 'base64'));

  console.log('All live verifications done!');
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

