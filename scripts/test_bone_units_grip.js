const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_grip_' + Date.now());
const PORT = 9270;

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

  // Select novice weapon and test live positioning
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Now test different weaponOrient rotations and positions in cm units
  const testRotations = [
    { name: 'rot_down_forward_1', pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, 0.0], len: 94 },
    { name: 'rot_down_forward_2', pos: [0.0, 7.0, 1.5], rot: [Math.PI * 0.5, 0.0, 0.0], len: 94 },
    { name: 'rot_down_forward_3', pos: [0.0, 7.0, 1.5], rot: [-Math.PI * 0.5, 0.0, 0.0], len: 94 },
    { name: 'rot_down_forward_4', pos: [0.0, 7.0, 1.5], rot: [0.0, Math.PI * 0.5, 0.0], len: 94 },
    { name: 'rot_down_forward_5', pos: [0.0, 7.0, 1.5], rot: [0.0, -Math.PI * 0.5, 0.0], len: 94 },
    { name: 'rot_down_forward_6', pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, Math.PI * 0.5], len: 94 },
    { name: 'rot_down_forward_7', pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, -Math.PI * 0.5], len: 94 }
  ];

  for (const t of testRotations) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
        const fbx = sr.activeWeaponMesh;
        if (!orient || !fbx) return;

        orient.position.set(${t.pos[0]}, ${t.pos[1]}, ${t.pos[2]});
        orient.rotation.set(${t.rot[0]}, ${t.rot[1]}, ${t.rot[2]});

        // Set fbx scale in cm units (target cm / raw cm)
        // Raw novice length is ~119.36
        const rawLen = 119.36;
        const s = ${t.len} / rawLen;
        fbx.scale.set(s, s, s);

        window._sr.frameCamera('weapon');
      })()`
    });
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${t.name}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/test_${t.name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

