const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sit_test_' + Date.now());
const PORT = 9444;

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
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs.find(t => t.type === 'page');
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
  await sleep(2000);

  // 1. Check sit_loop
  const sitInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
      return { val: sel.value };
    })()`,
    returnByValue: true
  });
  console.log('Switched to sit_loop:', sitInfo.result.value);

  // Wait 1.5 seconds for animation to advance
  await sleep(1500);

  const hipsPos = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      let hipBone = null;
      sr.activeCharacterModel.traverse(o => { if (o.isBone && o.name.includes('Hips')) hipBone = o; });
      const p = new THREE.Vector3();
      hipBone.getWorldPosition(p);
      return { x: p.x, y: p.y, z: p.z };
    })()`,
    returnByValue: true
  });
  console.log('Hips World Position in sit_loop:', hipsPos.result.value);

  // Capture screenshot of sit_loop
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/curr_sit_loop.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/curr_sit_loop.png');

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

