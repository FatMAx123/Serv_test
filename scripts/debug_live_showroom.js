const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_' + Date.now());
const PORT = 9231;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
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

  // Check what clips are loaded
  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return { error: 'no _sr' };
      const sel = document.getElementById('sel-animation');
      const optList = Array.from(sel.options).map(o => ({ value: o.value, text: o.text }));
      return { optList, activeAction: sr.activeActionName };
    })()`,
    returnByValue: true
  });
  console.log('UI options:', JSON.stringify(info.result.value, null, 2));

  // Select sit_loop and wait 2 seconds
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/live_sit_loop.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/live_sit_loop.png');

  // Select sit_down at mid frame
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      sel.value = 'sit_down';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/live_sit_down.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/live_sit_down.png');

  // Select demon staff
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'demon_staff';
      sel.dispatchEvent(new Event('change'));
      const animSel = document.getElementById('sel-animation');
      animSel.value = 'idle';
      animSel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/live_demon_staff.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/live_demon_staff.png');

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

