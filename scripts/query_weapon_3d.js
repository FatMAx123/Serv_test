const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_scale_' + Date.now());
const PORT = 9255;

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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      let hand = null;
      model.traverse(o => { if (o.isBone && o.name.includes('RightHand')) hand = o; });
      const ws = new THREE.Vector3();
      hand.getWorldPosition(new THREE.Vector3());
      hand.getWorldScale(ws);
      const arm = model.getObjectByName('Armature');
      const armScale = arm ? [arm.scale.x, arm.scale.y, arm.scale.z] : 'no arm';
      return {
        handScale: [hand.scale.x, hand.scale.y, hand.scale.z],
        handWorldScale: [ws.x, ws.y, ws.z],
        armScale
      };
    })()`,
    returnByValue: true
  });

  console.log('Scale report:', res.result.value);
  edge.kill();
  process.exit(0);
}
main().catch(console.error);
