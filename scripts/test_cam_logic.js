const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function testCam() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9285',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4000));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9285/json/list', r => {
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
    expression: `(() => {
      const sr = window._sr;
      const c = sr.controls;
      const cam = sr.camera;
      c.target.set(-0.23, 0.96, 0.0);
      cam.position.set(-0.23 + 0.3, 0.96 + 0.05, 0.0 + 0.3);
      c.enableDamping = false;
      c.update();
      c.enableDamping = true;
      const afterUpdate = [cam.position.x, cam.position.y, cam.position.z];
      return { afterUpdate };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
  edge.kill();
}
testCam().catch(console.error);
