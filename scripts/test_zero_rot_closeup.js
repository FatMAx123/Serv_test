const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_closeup_0_' + Date.now());
const PORT = 9320;

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

  // Apply rot [0, 0, 0], test pos Y around 6.0..8.0
  const posYs = [6.0, 6.8, 7.5];
  for (const py of posYs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
        const fbx = sr.activeWeaponMesh;
        orient.position.set(0.0, ${py}, 1.5);
        orient.rotation.set(0.0, 0.0, 0.0);
        const s = 94 / 119.36;
        fbx.scale.set(s, s, s);
        window._sr.frameCamera('weapon');
      })()`
    });
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_zero_rot_y${py}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/test_zero_rot_y${py}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

