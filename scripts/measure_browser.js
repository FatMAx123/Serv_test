const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_meas_' + Date.now());
const PORT = 9332;

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
    'about:blank'
  ]);
  await sleep(1500);
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
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
  // Wait until weapon mesh is loaded
  await sleep(3000);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const fbx = sr.activeWeaponMesh;
      const root = sr.weaponRoot;
      if (!fbx) return { error: 'No weapon mesh' };

      const b = new THREE.Box3().setFromObject(fbx);
      const sz = new THREE.Vector3();
      b.getSize(sz);
      const ws = new THREE.Vector3();
      fbx.getWorldScale(ws);
      const wp = new THREE.Vector3();
      fbx.getWorldPosition(wp);

      const rws = new THREE.Vector3();
      root.getWorldScale(rws);

      const hand = root.parent;
      const hws = new THREE.Vector3();
      if (hand) hand.getWorldScale(hws);

      return {
        parentName: hand ? hand.name : null,
        handWorldScale: [hws.x, hws.y, hws.z],
        rootWorldScale: [rws.x, rws.y, rws.z],
        fbxWorldScale: [ws.x, ws.y, ws.z],
        fbxLocalScale: [fbx.scale.x, fbx.scale.y, fbx.scale.z],
        fbxWorldSize: [sz.x, sz.y, sz.z],
        fbxWorldPos: [wp.x, wp.y, wp.z]
      };
    })()`,
    returnByValue: true
  });

  console.log('MEASURE:', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

