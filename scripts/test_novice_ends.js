const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function checkNovice() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9355',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4500));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9355/json/list', r => {
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
      const fbx = await loader.loadAsync('assets/weapons/models/novice.fbx');
      let mesh = null;
      fbx.traverse(o => { if (o.isMesh) mesh = o; });
      const pos = mesh.geometry.attributes.position;
      // Find average X, Y width for vertices near min.z vs max.z
      let minZ_count = 0, minZ_w = 0;
      let maxZ_count = 0, maxZ_w = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        if (z < -20) {
          minZ_count++;
          minZ_w += Math.sqrt(x*x + y*y);
        }
        if (z > 60) {
          maxZ_count++;
          maxZ_w += Math.sqrt(x*x + y*y);
        }
      }
      return {
        near_minZ_avg_radius: (minZ_w / minZ_count).toFixed(2),
        near_maxZ_avg_radius: (maxZ_w / maxZ_count).toFixed(2)
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Novice ends:', res.result.value);
  ws.close();
  edge.kill();
}
checkNovice().catch(console.error);

