const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_novice_mesh_' + Date.now());
const PORT = 9973;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs(retries = 10) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
          let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
        }).on('error', reject);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Failed to connect to Edge DevTools');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  // Inspect novice.glb vertices and see where the big coil is
  const inspectRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const wMesh = window._sr.activeWeaponMesh;
      if (!wMesh) return { error: 'no weapon' };

      // We want to find which Z has the widest geometry (the coil)
      let minZ = 1e9, maxZ = -1e9;
      let minZ_bbox = new THREE.Box3();
      let maxZ_bbox = new THREE.Box3();

      const samples = [];
      wMesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          for (let i = 0; i < pos.count; i += 5) {
            const z = pos.getZ(i);
            const x = pos.getX(i);
            const y = pos.getY(i);
            samples.push({ x, y, z });
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
          }
        }
      });

      // Filter near minZ (bottom 10%) vs near maxZ (top 10%)
      const range = maxZ - minZ;
      const nearMin = samples.filter(s => s.z < minZ + range * 0.15);
      const nearMax = samples.filter(s => s.z > maxZ - range * 0.15);

      function calcWidth(arr) {
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        arr.forEach(s => {
          if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
          if (s.y < minY) minY = s.y; if (s.y > maxY) maxY = s.y;
        });
        return { dx: maxX - minX, dy: maxY - minY };
      }

      return {
        totalSamples: samples.length,
        minZ: +minZ.toFixed(3),
        maxZ: +maxZ.toFixed(3),
        nearMin_bounds: calcWidth(nearMin),
        nearMax_bounds: calcWidth(nearMax),
        // If nearMin is wider, coil head is at minZ (-Z). If nearMax is wider, coil head is at maxZ (+Z).
        coilHeadIsAt: calcWidth(nearMin).dx > calcWidth(nearMax).dx ? 'NEGATIVE_Z (minZ)' : 'POSITIVE_Z (maxZ)'
      };
    })()`,
    returnByValue: true
  });

  console.log('Novice mesh coil analysis:');
  console.log(inspectRes.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

