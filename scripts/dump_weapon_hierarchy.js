const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tree_' + Date.now());
const PORT = 9265;

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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const root = sr.weaponRoot;
      function dump(obj) {
        const wp = new THREE.Vector3();
        const ws = new THREE.Vector3();
        obj.getWorldPosition(wp);
        obj.getWorldScale(ws);
        return {
          name: obj.name,
          type: obj.type,
          pos: [obj.position.x.toFixed(4), obj.position.y.toFixed(4), obj.position.z.toFixed(4)],
          scale: [obj.scale.x.toFixed(4), obj.scale.y.toFixed(4), obj.scale.z.toFixed(4)],
          rot: [obj.rotation.x.toFixed(3), obj.rotation.y.toFixed(3), obj.rotation.z.toFixed(3)],
          worldPos: [wp.x.toFixed(4), wp.y.toFixed(4), wp.z.toFixed(4)],
          worldScale: [ws.x.toFixed(4), ws.y.toFixed(4), ws.z.toFixed(4)],
          children: obj.children.map(dump)
        };
      }
      return dump(root.parent || root);
    })()`,
    returnByValue: true
  });

  console.log('Hierarchy dump:', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

