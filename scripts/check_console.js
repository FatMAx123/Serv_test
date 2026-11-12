const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_err_' + Date.now());
const PORT = 9994;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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

  const logs = [];
  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if (data.method === 'Runtime.consoleAPICalled') {
      logs.push(data.params.args.map(a => a.value || a.description).join(' '));
    }
    if (data.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + JSON.stringify(data.params.exceptionDetails));
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(4000);

  console.log('--- CONSOLE LOGS ---');
  logs.forEach(l => console.log(l));

  const check = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        model: !!window._sr.activeCharacterModel,
        char: window._sr.state.character,
        weap: window._sr.state.weapon,
        childrenCount: window._sr.activeCharacterModel ? window._sr.activeCharacterModel.children.length : 0
      };
    })()`,
    returnByValue: true
  });
  console.log('Check state:', check.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

