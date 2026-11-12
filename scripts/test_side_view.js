const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function test() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9930',
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge_side_' + Date.now()),
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 3500));
  const tabs = await new Promise(res => http.get('http://127.0.0.1:9930/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let reqId = 1;
  function send(m, p={}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) { const r = JSON.parse(msg); if (r.id === id) { ws.off('message', h); res(r.result); } }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1000));

  await send('Runtime.evaluate', { expression: `(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman';
    selC.dispatchEvent(new Event('change'));
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
    
    // Set camera to side view (azimuth PI/2)
    window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, Math.PI * 0.5);
  })()` });
  await new Promise(r => setTimeout(r, 2500));

  const snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/real_side_view_woman.png', Buffer.from(snap.data, 'base64'));
  console.log('Saved real_side_view_woman.png');
  ws.close();
  edge.kill();
}
test().catch(console.error);

