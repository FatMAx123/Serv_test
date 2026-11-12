const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function checkWeapons() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9340',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4000));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9340/json/list', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  function send(m, p={}) {
    return new Promise(res => {
      const id = Math.floor(Math.random()*100000);
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) { ws.off('message', h); res(r.result); }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({id, method: m, params: p}));
    });
  }

  // Load each FBX raw and inspect its mesh bounds
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const loader = window._sr.fbxLoader;
      const files = ['models/novice.fbx', 'models/magic_mace.fbx', 'models/atuba_mace.fbx', 'models/demon_staff.fbx'];
      const out = {};
      for (const f of files) {
        const fbx = await loader.loadAsync(f);
        fbx.updateMatrixWorld(true);
        const b = new window.THREE.Box3().setFromObject(fbx);
        const sz = new window.THREE.Vector3();
        b.getSize(sz);
        out[f] = {
          min: [b.min.x.toFixed(2), b.min.y.toFixed(2), b.min.z.toFixed(2)],
          max: [b.max.x.toFixed(2), b.max.y.toFixed(2), b.max.z.toFixed(2)],
          size: [sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2)]
        };
      }
      return out;
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
  edge.kill();
}
checkWeapons().catch(console.error);

