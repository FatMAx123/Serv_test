const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_hand_axes_' + Date.now());
const PORT = 9666;

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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      let hand = null;
      model.traverse(o => {
        if (o.isBone && /RightHand$/i.test(o.name)) hand = o;
      });

      // Get hand bone axes in world space during idle frame 0
      const m = hand.matrixWorld;
      const xAxis = new THREE.Vector3(m.elements[0], m.elements[1], m.elements[2]).normalize();
      const yAxis = new THREE.Vector3(m.elements[4], m.elements[5], m.elements[6]).normalize();
      const zAxis = new THREE.Vector3(m.elements[8], m.elements[9], m.elements[10]).normalize();
      const pos = new THREE.Vector3(m.elements[12], m.elements[13], m.elements[14]);

      // Check finger knuckle positions in hand bone local space
      const fingers = ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'];
      const knucklePos = {};
      fingers.forEach(f => {
        const b = model.getObjectByName('mixamorigRightHand' + f + '1') || model.getObjectByName('mixamorig:RightHand' + f + '1');
        if (b) {
          knucklePos[f] = [b.position.x, b.position.y, b.position.z];
        }
      });

      return {
        handWorldPos: [pos.x, pos.y, pos.z],
        localX_inWorld: [xAxis.x, xAxis.y, xAxis.z],
        localY_inWorld: [yAxis.x, yAxis.y, yAxis.z],
        localZ_inWorld: [zAxis.x, zAxis.y, zAxis.z],
        knucklePosInHandSpace: knucklePos
      };
    })()`,
    returnByValue: true
  });

  console.log('=== HAND BONE AXES IN IDLE ===');
  console.log(JSON.stringify(res.result.value, null, 2));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
