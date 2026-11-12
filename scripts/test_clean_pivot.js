const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_clean_pivot_' + Date.now());
const PORT = 9360;
const BRAIN_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
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
  await send('Runtime.enable');

  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html?v=' + Date.now() });
  await sleep(4500);

  // Test the clean pivot logic in the browser directly
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const sr = window._sr;
      const loader = sr.fbxLoader;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      
      // Load novice.fbx fresh
      const fbx = await loader.loadAsync('assets/weapons/models/novice.fbx');
      
      // Clean local pivot implementation:
      // 1. Strip junk
      const junk = [];
      fbx.traverse(o => { if (o !== fbx && (o.name === 'Cube' || o.isCamera || o.isLight)) junk.push(o); });
      junk.forEach(j => { if (j.parent) j.parent.remove(j); });

      // 2. Local box before any hierarchy
      fbx.position.set(0, 0, 0);
      fbx.rotation.set(0, 0, 0);
      fbx.scale.set(1, 1, 1);
      fbx.updateMatrix();

      let box0 = new window.THREE.Box3().setFromObject(fbx);
      let sz0 = new window.THREE.Vector3();
      box0.getSize(sz0);

      // In novice.fbx, longest axis is Z (head at +Z, handle at -Z)
      // Rotate around X so head (+Z) stays head or handle
      if (sz0.z >= sz0.x && sz0.z >= sz0.y) {
        fbx.rotation.x = Math.PI * 0.5;
        fbx.updateMatrix();
      }
      
      box0.setFromObject(fbx);
      box0.getSize(sz0);

      // Scale to worldLen 0.94m
      const len = Math.max(sz0.x, sz0.y, sz0.z);
      const scale = 0.94 / len;
      fbx.scale.multiplyScalar(scale);
      fbx.updateMatrix();

      box0.setFromObject(fbx);
      box0.getSize(sz0);
      const center = new window.THREE.Vector3();
      box0.getCenter(center);

      // Grip point at fraction 0.22 along Y (handle)
      const gripPoint = new window.THREE.Vector3(
        center.x,
        box0.min.y + sz0.y * 0.22,
        center.z
      );

      // Shift fbx so gripPoint is at (0, 0, 0)
      fbx.position.set(-gripPoint.x, -gripPoint.y, -gripPoint.z);

      const pivot = new window.THREE.Group();
      pivot.name = 'test_pivot';
      pivot.add(fbx);

      const orient = new window.THREE.Group();
      orient.name = 'test_orient';
      orient.position.set(0.0, 0.065, 0.020);
      orient.rotation.set(0.12, 0.0, 0.22);
      orient.add(pivot);

      hand.add(orient);
      orient.updateMatrixWorld(true);

      const hWP = new window.THREE.Vector3();
      hand.getWorldPosition(hWP);

      const pWP = new window.THREE.Vector3();
      pivot.getWorldPosition(pWP);

      return {
        distToHand: pWP.distanceTo(hWP).toFixed(4),
        hWP: [hWP.x.toFixed(3), hWP.y.toFixed(3), hWP.z.toFixed(3)],
        pWP: [pWP.x.toFixed(3), pWP.y.toFixed(3), pWP.z.toFixed(3)],
        gripOffset: [gripPoint.x.toFixed(3), gripPoint.y.toFixed(3), gripPoint.z.toFixed(3)]
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Clean pivot test:', res.result.value);
  ws.close();
  edge.kill();
}

main().catch(console.error);

