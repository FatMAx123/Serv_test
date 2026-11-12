const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function test() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9315',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 5000));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9315/json/list', r => {
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
      // Click cam-weapon button in UI!
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
      const cam = sr.camera;
      const c = sr.controls;
      return {
        camPos: [cam.position.x, cam.position.y, cam.position.z],
        target: [c.target.x, c.target.y, c.target.z]
      };
    })()`,
    returnByValue: true
  });
  console.log('Result after clicking cam-weapon:', res.result.value);
  ws.close();
  edge.kill();
}
test().catch(console.error);

