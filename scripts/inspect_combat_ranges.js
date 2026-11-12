const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_combat_' + Date.now());
const PORT = 9233;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
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

  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs.find(t => t.type === 'page');
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

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2000);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return { error: 'no _sr' };
      
      const COMBAT = [
        'idle', 'walk', 'fast_run', 'sword_run', 'boxing', 'sword_slash', 'power_up',
        'sword_cast_1', 'sword_cast_2', 'cast_1h', 'attack_1h', 'cast_2h', 'attack_2h',
        'area_attack_1', 'area_attack_2', 'great_sword_cast', 'death_back', 'death_front',
        'death_sword_1', 'death_sword_2'
      ];
      
      const out = {};
      for (const name of COMBAT) {
        const action = sr.activeActions[name];
        if (!action) continue;
        const clip = action.getClip();
        const hipTrack = clip.tracks.find(t => t.name.includes('Hips.position'));
        if (!hipTrack) { out[name] = 'no hip track'; continue; }
        
        const vals = hipTrack.values;
        const count = hipTrack.times.length;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < vals.length; i += 3) {
          const x = vals[i], y = vals[i+1], z = vals[i+2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        const start = [Number(vals[0].toFixed(3)), Number(vals[1].toFixed(3)), Number(vals[2].toFixed(3))];
        const end = [
          Number(vals[vals.length - 3].toFixed(3)),
          Number(vals[vals.length - 2].toFixed(3)),
          Number(vals[vals.length - 1].toFixed(3))
        ];
        out[name] = {
          start,
          end,
          deltaX: Number((maxX - minX).toFixed(3)),
          deltaY: Number((maxY - minY).toFixed(3)),
          deltaZ: Number((maxZ - minZ).toFixed(3)),
          rangeY: [Number(minY.toFixed(3)), Number(maxY.toFixed(3))]
        };
      }
      return out;
    })()`,
    returnByValue: true
  });

  console.log('Combat analysis:\n', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

