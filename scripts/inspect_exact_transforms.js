const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_exact_' + Date.now());
const PORT = 9305;

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

  // Switch to novice
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  const exact = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
      const pivot = sr.weaponPivot || (orient && orient.children[0]);
      const fbx = sr.activeWeaponMesh;
      return {
        rootPos: [sr.weaponRoot.position.x, sr.weaponRoot.position.y, sr.weaponRoot.position.z],
        rootScale: [sr.weaponRoot.scale.x, sr.weaponRoot.scale.y, sr.weaponRoot.scale.z],
        orientPos: [orient.position.x, orient.position.y, orient.position.z],
        orientRot: [orient.rotation.x, orient.rotation.y, orient.rotation.z],
        fbxPos: [fbx.position.x, fbx.position.y, fbx.position.z],
        fbxRot: [fbx.rotation.x, fbx.rotation.y, fbx.rotation.z],
        fbxScale: [fbx.scale.x, fbx.scale.y, fbx.scale.z]
      };
    })()`,
    returnByValue: true
  });

  console.log('Exact initial transforms:\n', JSON.stringify(exact.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

