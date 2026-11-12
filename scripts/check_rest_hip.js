const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rest_' + Date.now());
const PORT = 9237;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((res, rej) => {
    http.get(url, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + USER_DATA, '--headless=new', 'http://localhost:3000/showroom.html']);
  await sleep(3500);
  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
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
  await send('Runtime.enable');
  await sleep(2000);
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      let hip = null;
      model.traverse(o => { if (o.isBone && o.name.includes('Hips')) hip = o; });
      return {
        hipLocalPos: [hip.position.x, hip.position.y, hip.position.z],
        modelPos: [model.position.x, model.position.y, model.position.z],
        hipParent: hip.parent ? hip.parent.name : null,
        hipParentPos: hip.parent ? [hip.parent.position.x, hip.parent.position.y, hip.parent.position.z] : null
      };
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  edge.kill();
  process.exit(0);
}
main().catch(console.error);

