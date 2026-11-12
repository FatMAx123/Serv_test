const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_novice_' + Date.now());
const PORT = 9961;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
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

  // Load apprentice_wand on woman
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const wp = window._sr.weaponPivot;
      const mesh = wp.children[0];
      // In local coordinates of mesh (before weaponOrient transform):
      let minZ = Infinity, maxZ = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      let minX = Infinity, maxX = -Infinity;
      mesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
          }
        }
      });

      // Where are the vertices of the coil head vs pommel?
      // The coil head is wide (has larger X/Y radius). The pommel/shaft is narrow.
      let headZSum = 0, headCount = 0;
      let wideZ = [];
      mesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            const z = pos.getZ(i);
            const r = Math.sqrt(x*x + y*y);
            if (r > 0.08) { // wide parts like the coil or head ornament
              wideZ.push(z);
            }
          }
        }
      });
      wideZ.sort((a,b) => a - b);
      const medianWideZ = wideZ.length ? wideZ[Math.floor(wideZ.length / 2)] : null;

      // In world space where is minZ vertex and where is maxZ vertex?
      const pMinZ = new THREE.Vector3(0, 0, minZ).applyMatrix4(mesh.matrixWorld);
      const pMaxZ = new THREE.Vector3(0, 0, maxZ).applyMatrix4(mesh.matrixWorld);

      return {
        localBBox: { minX, maxX, minY, maxY, minZ, maxZ },
        medianWideZ, // if medianWideZ is near minZ -> head is at minZ! if near maxZ -> head is at maxZ!
        worldPosOf_minZ_vertex: [pMinZ.x, pMinZ.y, pMinZ.z].map(v => +v.toFixed(3)),
        worldPosOf_maxZ_vertex: [pMaxZ.x, pMaxZ.y, pMaxZ.z].map(v => +v.toFixed(3))
      };
    })()`,
    returnByValue: true
  });

  console.log('Novice local & world analysis:');
  console.log(info.result.value);

  // Take screenshot of woman side profile
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 2.2, 0.15, -Math.PI * 0.5, 0, 0);`
  });
  await sleep(400);
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/woman_side_current.png', Buffer.from(snap.data, 'base64'));
  console.log('Saved screenshots/woman_side_current.png');

  ws.close();
  edge.kill();
}
run().catch(console.error);

