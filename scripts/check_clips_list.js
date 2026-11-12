const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_clips_list_' + Date.now());
const PORT = 9947;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
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
  await send('Runtime.enable');
  await sleep(2000);

  // Woman clips
  const womanClips = await send('Runtime.evaluate', {
    expression: `(() => Object.keys(window._sr.activeActions))()`,
    returnByValue: true
  });
  console.log('WOMAN clips:', womanClips.result.value);

  // Switch to man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  const manClips = await send('Runtime.evaluate', {
    expression: `(() => Object.keys(window._sr.activeActions))()`,
    returnByValue: true
  });
  console.log('MAN clips:', manClips.result.value);

  ws.close();
  edge.kill();
}
run().catch(console.error);

