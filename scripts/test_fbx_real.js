const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function check() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9350',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4500));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9350/json/list', r => {
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

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const loader = window._sr.fbxLoader;
      const list = [
        'assets/weapons/models/novice.fbx',
        'assets/weapons/models/magic_mace.fbx',
        'assets/weapons/models/atuba_mace.fbx',
        'assets/weapons/models/demon_staff.fbx'
      ];
      const out = {};
      for (const p of list) {
        const fbx = await loader.loadAsync(p);
        const b = new window.THREE.Box3().setFromObject(fbx);
        const sz = new window.THREE.Vector3();
        b.getSize(sz);
        // Find center of vertices with max coord vs min coord on dominant axis
        let meshCount = 0;
        let vCount = 0;
        fbx.traverse(o => {
          if (o.isMesh) {
            meshCount++;
            vCount += o.geometry.attributes.position.count;
          }
        });
        out[p] = {
          min: [b.min.x.toFixed(2), b.min.y.toFixed(2), b.min.z.toFixed(2)],
          max: [b.max.x.toFixed(2), b.max.y.toFixed(2), b.max.z.toFixed(2)],
          size: [sz.x.toFixed(2), sz.y.toFixed(2), sz.z.toFixed(2)],
          meshCount,
          vCount
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
check().catch(console.error);

