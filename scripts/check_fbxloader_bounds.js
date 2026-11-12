const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_raw_check_' + Date.now());
const PORT = 9228;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''; res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    'about:blank'
  ]);

  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try { await requestJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch (_) {}
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  const rawInfo = await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      (async () => {
        try {
          const loader = window._sr.fbxLoader;
          const results = {};
          for (const w of ['novice', 'magic_mace', 'tears_fairy', 'demon_staff']) {
            try {
              const f = await loader.loadAsync('assets/weapons/models/' + w + '.fbx');
              f.updateMatrixWorld(true);
              const b = new window.THREE.Box3().setFromObject(f);
              const sz = new window.THREE.Vector3(); b.getSize(sz);
              const c = new window.THREE.Vector3(); b.getCenter(c);
              results[w] = { min: [b.min.x.toFixed(3), b.min.y.toFixed(3), b.min.z.toFixed(3)], max: [b.max.x.toFixed(3), b.max.y.toFixed(3), b.max.z.toFixed(3)], size: [sz.x.toFixed(3), sz.y.toFixed(3), sz.z.toFixed(3)] };
            } catch (e) {
              results[w] = { err: e.message };
            }
          }
          resolve(results);
        } catch (fatal) {
          resolve({ fatal: fatal.message, stack: fatal.stack });
        }
      })();
    })`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('FBXLoader Three.js bounds:', JSON.stringify(rawInfo.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main();
