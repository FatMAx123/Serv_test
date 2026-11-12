const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rot_cm_' + Date.now());
const PORT = 9300;

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

  // Test setup helper
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testGrip = function(rotX, rotY, rotZ, gripFrac = 0.18, targetLen = 94, posX = 0.0, posY = 6.8, posZ = 1.5) {
        const THREE = window.THREE;
        const sr = window._sr;
        const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
        const pivot = sr.weaponPivot || (orient && orient.children[0]);
        const fbx = sr.activeWeaponMesh;
        if (!orient || !pivot || !fbx) return;

        orient.position.set(posX, posY, posZ);
        orient.rotation.set(rotX, rotY, rotZ);

        // Reset fbx transform
        fbx.position.set(0, 0, 0);
        fbx.rotation.set(0, 0, 0);
        fbx.scale.set(1, 1, 1);
        fbx.updateMatrix();

        let b = new THREE.Box3().setFromObject(fbx);
        let sz = new THREE.Vector3();
        b.getSize(sz);

        // If authored along Z (like novice.fbx), rotate around X to align with Y
        if (sz.z >= sz.x && sz.z >= sz.y) {
          fbx.rotation.x = Math.PI * 0.5;
          fbx.updateMatrix();
        }

        b.setFromObject(fbx);
        b.getSize(sz);
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const s = targetLen / maxDim;
        fbx.scale.set(s, s, s);
        fbx.updateMatrix();

        b.setFromObject(fbx);
        b.getSize(sz);
        const center = new THREE.Vector3();
        b.getCenter(center);

        const gripY = b.min.y + sz.y * gripFrac;
        fbx.position.set(-center.x, -gripY, -center.z);
        fbx.updateMatrix();
      };
    })()`
  });

  // 1. Switch to novice
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Test variations around rotZ = Math.PI * 0.5
  const novAngles = [
    { id: 'nov_1', rot: [0.0, 0.0, Math.PI * 0.5] },
    { id: 'nov_2', rot: [0.2, 0.0, Math.PI * 0.5] },
    { id: 'nov_3', rot: [-0.2, 0.0, Math.PI * 0.5] },
    { id: 'nov_4', rot: [0.0, 0.2, Math.PI * 0.5] },
    { id: 'nov_5', rot: [0.0, -0.2, Math.PI * 0.5] },
    { id: 'nov_6', rot: [0.15, 0.10, Math.PI * 0.45] },
    { id: 'nov_7', rot: [-0.15, -0.10, Math.PI * 0.55] }
  ];

  for (const a of novAngles) {
    await send('Runtime.evaluate', {
      expression: `window._testGrip(${a.rot[0]}, ${a.rot[1]}, ${a.rot[2]}, 0.18, 94); window._sr.frameCamera('weapon');`
    });
    await sleep(300);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${a.id}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/test_${a.id}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

