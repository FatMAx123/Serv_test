const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_wpn_test_' + Date.now());
const PORT = 9777;

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

  // Set camera to right-side profile viewing the right hand and leg
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      // Position camera to look directly at right side of character
      sr.camera.position.set(-1.8, 1.0, 0.4);
      sr.controls.target.set(-0.25, 0.85, 0.0);
      sr.controls.update();
      // Hide skeleton bone helper spheres
      if (sr.skeletonHelper) sr.skeletonHelper.visible = false;
      const sphereGroup = sr.scene.getObjectByName('bone_spheres_group');
      if (sphereGroup) sphereGroup.visible = false;
    })()`
  });

  const weapons = [
    'novice',
    'magic_mace',
    'atuba_mace',
    'demon_staff',
    'tears_fairy'
  ];

  for (const wId of weapons) {
    console.log('Testing weapon:', wId);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        sel.value = '${wId}';
        sel.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${wId}_current.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/test_${wId}_current.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
