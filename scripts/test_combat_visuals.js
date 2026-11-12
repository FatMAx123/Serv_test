const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sr_test_' + Date.now());
const PORT = 9232;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    'about:blank'
  ]);
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    try { await req('http://127.0.0.1:' + PORT + '/json/version'); break; } catch(_) {}
  }
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id = 1;
  const send = (m, p={}) => new Promise(res => {
    const i = id++;
    const h = msg => { const r = JSON.parse(msg); if (r.id === i) { ws.off('message', h); res(r.result); } };
    ws.on('message', h);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone spheres
  await send('Runtime.evaluate', {
    expression: `(() => { const c = document.getElementById('chk-bone-helpers'); if (c) { c.checked = false; c.dispatchEvent(new Event('change')); } })()`
  });

  const testClips = ['walk', 'sword_slash', 'boxing', 'fast_run'];
  for (const c of testClips) {
    await send('Runtime.evaluate', {
      expression: `(() => { const s = document.getElementById('sel-animation'); if (s) { s.value = '${c}'; s.dispatchEvent(new Event('change')); } })()`
    });
    await sleep(1500);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(__dirname, '..', 'screenshots', `test_verified_${c}.png`);
    fs.writeFileSync(p, Buffer.from(shot.data, 'base64'));
    console.log('Captured:', c, 'to', p);
  }
  edge.kill();
  process.exit(0);
}
run().catch(e => { console.error(e); process.exit(1); });

