const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_check_' + Date.now());
const PORT = 9229;

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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return 'no _sr';
      const list = sr.loadedClipsList || [];
      const model = sr.activeCharacterModel;
      let hipBone = null;
      model.traverse(o => { if (o.isBone && o.name.includes('Hips')) hipBone = o; });
      
      const out = [];
      const sel = document.getElementById('sel-animation');
      for (const name of list) {
        sel.value = name;
        sel.dispatchEvent(new Event('change'));
        sr.activeMixer.update(0.1);
        model.updateMatrixWorld(true);
        const p = hipBone.position.clone();
        hipBone.getWorldPosition(p);
        out.push({ name, hipsY: p.y.toFixed(3), hipsX: p.x.toFixed(3), hipsZ: p.z.toFixed(3) });
      }
      return out;
    })()`,
    returnByValue: true
  });

  console.log('Result:', JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);
