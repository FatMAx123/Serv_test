const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rot_' + Date.now());
const PORT = 9290;

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

  const bestRotations = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      let hand = null;
      model.traverse(o => { if (o.isBone && o.name.includes('RightHand')) hand = o; });
      if (!hand) return 'no hand';

      // We want the weapon shaft in world coordinates to point down along the leg and slightly forward:
      // Desired shaft direction in WORLD coordinates:
      const targetDir1H = new THREE.Vector3(0.05, -0.92, 0.38).normalize(); // 1H: mace head down-forward
      const targetDirStaff = new THREE.Vector3(-0.05, 0.95, -0.30).normalize(); // 2H: staff head up-back

      // Let's find the orientation of hand in world:
      hand.updateMatrixWorld(true);
      const handWorldQuat = new THREE.Quaternion();
      hand.getWorldQuaternion(handWorldQuat);
      const invHandQuat = handWorldQuat.clone().invert();

      // Transform target direction into hand local coordinates
      const handLocalDir1H = targetDir1H.clone().applyQuaternion(invHandQuat);
      const handLocalDirStaff = targetDirStaff.clone().applyQuaternion(invHandQuat);

      // Weapon canonical shaft starts along +Y in weaponPivot (0, 1, 0)
      const shaftBase = new THREE.Vector3(0, 1, 0);

      const q1H = new THREE.Quaternion().setFromUnitVectors(shaftBase, handLocalDir1H);
      const e1H = new THREE.Euler().setFromQuaternion(q1H, 'XYZ');

      const qStaff = new THREE.Quaternion().setFromUnitVectors(shaftBase, handLocalDirStaff);
      const eStaff = new THREE.Euler().setFromQuaternion(qStaff, 'XYZ');

      return {
        oneHandRot: [e1H.x.toFixed(3), e1H.y.toFixed(3), e1H.z.toFixed(3)],
        staffRot: [eStaff.x.toFixed(3), eStaff.y.toFixed(3), eStaff.z.toFixed(3)],
        handLocalDir1H: [handLocalDir1H.x.toFixed(3), handLocalDir1H.y.toFixed(3), handLocalDir1H.z.toFixed(3)]
      };
    })()`,
    returnByValue: true
  });

  console.log('Rotation solutions:\n', JSON.stringify(bestRotations.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

