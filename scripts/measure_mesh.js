const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_measure_mesh_' + Date.now());
const PORT = 9913;

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
  await sleep(2000);

  const testWeapons = ['atuba_mace', 'apprentice_wand', 'tears_fairy', 'magic_mace'];
  for (const w of testWeapons) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selW = document.getElementById('sel-weapon');
        selW.value = '${w}';
        selW.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(1500);

    const b = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const wp = window._sr.weaponPivot;
        const mesh = wp.children[0];
        const bbox = new THREE.Box3().setFromObject(mesh);
        return {
          name: '${w}',
          min: { x: bbox.min.x.toFixed(3), y: bbox.min.y.toFixed(3), z: bbox.min.z.toFixed(3) },
          max: { x: bbox.max.x.toFixed(3), y: bbox.max.y.toFixed(3), z: bbox.max.z.toFixed(3) }
        };
      })()`
    });
    console.log('BBox in weaponPivot space:', b.result.value);
  }

  edge.kill();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

