const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_hands_' + Date.now());
const PORT = 9956;

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
  await sleep(2500);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const m = window._sr.activeCharacterModel;
        if (!m) return { err: 'no active model' };
        let rh = null, lh = null;
        m.traverse(o => {
          if (!o.isBone) return;
          const n = o.name.toLowerCase();
          if (n.includes('righthand') && !n.includes('index') && !n.includes('thumb')) rh = o;
          if (n.includes('lefthand') && !n.includes('index') && !n.includes('thumb')) lh = o;
        });
        const pr = new THREE.Vector3(); if (rh) rh.getWorldPosition(pr);
        const pl = new THREE.Vector3(); if (lh) lh.getWorldPosition(pl);
        return {
          rhName: rh ? rh.name : null,
          lhName: lh ? lh.name : null,
          rightHand: [pr.x, pr.y, pr.z].map(v => +v.toFixed(3)),
          leftHand: [pl.x, pl.y, pl.z].map(v => +v.toFixed(3))
        };
      } catch (e) {
        return { exception: e.message };
      }
    })()`,
    returnByValue: true
  });

  console.log('HAND POSITIONS:', res.result ? res.result.value : res);

  ws.close();
  edge.kill();
}
run().catch(console.error);
