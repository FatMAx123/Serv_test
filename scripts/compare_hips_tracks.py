const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_hips_' + Date.now());
const PORT = 9232;

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
      
      const out = [];
      const list = sr.loadedClipsList || [];
      for (const name of list) {
        const action = sr.activeActions[name];
        if (!action) continue;
        const clip = action.getClip();
        const hipTrack = clip.tracks.find(t => t.name.includes('Hips.position'));
        if (hipTrack) {
          out.push({
            name,
            keys: hipTrack.times.length,
            firstKey: [
              Number(hipTrack.values[0].toFixed(3)),
              Number(hipTrack.values[1].toFixed(3)),
              Number(hipTrack.values[2].toFixed(3))
            ]
          });
        } else {
          out.push({ name, noHipTrack: true });
        }
      }
      return out;
    })()`,
    returnByValue: true
  });

  console.log('Hips positions across clips:\n', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);
