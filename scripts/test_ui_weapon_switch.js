const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_ui_test_' + Date.now());
const PORT = 9245;

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

  // Switch to Novice Mace
  console.log('Selecting novice...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Check state and weapon mesh in scene
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const mesh = sr.activeWeaponMesh;
      const root = sr.weaponRoot;
      return {
        hasMesh: !!mesh,
        hasRoot: !!root,
        rootParent: root && root.parent ? root.parent.name : null,
        meshVisible: mesh ? mesh.visible : null,
        childrenCount: root ? root.children.length : 0
      };
    })()`,
    returnByValue: true
  });
  console.log('Novice status:', info.result.value);

  // Focus camera on weapon
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.frameCamera('weapon');
    })()`
  });
  await sleep(1000);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/ui_test_novice.png', Buffer.from(shot.data, 'base64'));

  // Switch to demon_staff
  console.log('Selecting demon_staff...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'demon_staff';
      sel.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset('full');
    })()`
  });
  await sleep(2000);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/ui_test_demon_staff.png', Buffer.from(shot.data, 'base64'));

  // Switch to atuba_mace
  console.log('Selecting atuba_mace...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'atuba_mace';
      sel.dispatchEvent(new Event('change'));
      window._sr.frameCamera('weapon');
    })()`
  });
  await sleep(2000);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/ui_test_atuba_mace.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

