const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_wpn_raw_' + Date.now());
const PORT = 9555;

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

  const weapons = ['novice', 'magic_mace', 'atuba_mace', 'demon_staff', 'tears_fairy', 'apprentice_wand'];
  
  const evalRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      const THREE = window.THREE;
      const fbxLoader = new THREE.FBXLoader();
      const results = {};

      for (const wId of ${JSON.stringify(weapons)}) {
        const url = 'assets/weapons/' + wId + '.fbx';
        try {
          const fbx = await fbxLoader.loadAsync(url);
          // remove junk
          const junk = [];
          fbx.traverse(o => {
            if (o !== fbx && (o.name === 'Cube' || o.isCamera || o.isLight || /camera|light/i.test(o.name))) {
              junk.push(o);
            }
          });
          junk.forEach(j => { if (j.parent) j.parent.remove(j); });

          // Local bounds
          const box = new THREE.Box3().setFromObject(fbx);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          // Find primary axis
          const dims = { x: size.x, y: size.y, z: size.z };
          let mainAxis = 'y';
          if (size.x >= size.y && size.x >= size.z) mainAxis = 'x';
          if (size.z >= size.x && size.z >= size.y) mainAxis = 'z';

          // Sample vertices along mainAxis to determine which end has larger volume (the head)
          let minEndVol = 0, maxEndVol = 0;
          let minCount = 0, maxCount = 0;
          const axisMin = box.min[mainAxis];
          const axisMax = box.max[mainAxis];
          const axisRange = axisMax - axisMin;

          fbx.traverse(o => {
            if (o.isMesh && o.geometry) {
              const posAttr = o.geometry.attributes.position;
              const v = new THREE.Vector3();
              for (let i = 0; i < posAttr.count; i += 5) {
                v.fromBufferAttribute(posAttr, i);
                o.localToWorld(v); // in fbx space
                const frac = (v[mainAxis] - axisMin) / axisRange;
                // perpendicular distance from center
                const perpDist = Math.hypot(
                  mainAxis === 'x' ? 0 : v.x - center.x,
                  mainAxis === 'y' ? 0 : v.y - center.y,
                  mainAxis === 'z' ? 0 : v.z - center.z
                );
                if (frac < 0.3) { minEndVol += perpDist; minCount++; }
                else if (frac > 0.7) { maxEndVol += perpDist; maxCount++; }
              }
            }
          });

          const avgMinRadius = minCount ? (minEndVol / minCount) : 0;
          const avgMaxRadius = maxCount ? (maxEndVol / maxCount) : 0;
          const headEnd = avgMaxRadius > avgMinRadius ? '+ ' + mainAxis : '- ' + mainAxis;
          const handleEnd = avgMaxRadius > avgMinRadius ? '- ' + mainAxis : '+ ' + mainAxis;

          results[wId] = {
            boxMin: [box.min.x, box.min.y, box.min.z],
            boxMax: [box.max.x, box.max.y, box.max.z],
            size: [size.x, size.y, size.z],
            mainAxis,
            headEnd,
            handleEnd,
            avgMinRadius: avgMinRadius.toFixed(2),
            avgMaxRadius: avgMaxRadius.toFixed(2)
          };
        } catch (e) {
          results[wId] = { error: e.message };
        }
      }
      return results;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('=== WEAPON RAW ANALYSIS ===');
  console.log(JSON.stringify(evalRes.result.value, null, 2));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
