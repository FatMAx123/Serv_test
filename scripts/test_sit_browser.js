const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sit2_' + Date.now());
const PORT = 9329;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'about:blank'
  ]);
  await sleep(1500);
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) { ws.off('message', handler); resolve(resp.result); }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Play sit_loop
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_sit_loop_played.png', Buffer.from(shot.data, 'base64'));

  // Also play sit_down
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_down';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  let shot2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_sit_down_played.png', Buffer.from(shot2.data, 'base64'));

  edge.kill();
  console.log('Screenshots saved!');
  process.exit(0);
}
main().catch(console.error);

