const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function test() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9325',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4000));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9325/json/list', r => {
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

  // Inspect the rest pose (without updateHandGrip) of all finger bones
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const rHand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      
      const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
      const info = {};
      fingers.forEach(f => {
        info[f] = [];
        for (let j = 1; j <= 3; j++) {
          const b = model.getObjectByName('mixamorigRightHand' + f + j) || model.getObjectByName('mixamorig:RightHand' + f + j);
          if (b) {
            info[f].push({
              name: b.name,
              rot: [b.rotation.x.toFixed(3), b.rotation.y.toFixed(3), b.rotation.z.toFixed(3)]
            });
          }
        }
      });
      return info;
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
  edge.kill();
}
test().catch(console.error);

