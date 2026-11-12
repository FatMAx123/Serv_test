const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_diag2_' + Date.now());
const PORT = 9952;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    await sleep(400);
    try {
      tabs = await getJson(`http://127.0.0.1:${PORT}/json/list`);
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
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
  await send('Runtime.enable');
  await send('Log.enable');

  ws.on('message', m => {
    const msg = JSON.parse(m);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[Browser Console]', msg.params.type, msg.params.args.map(a => a.value || a.description).join(' '));
    }
  });

  await sleep(2000);

  // Check what weapon state is
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      return { weapon: window._sr.state.weapon, hasRootChildren: window._sr.weaponRoot ? window._sr.weaponRoot.children.length : 0 };
    })()`,
    returnByValue: true
  });
  console.log('Dispatched weapon change:', res.result.value);
  await sleep(2000);

  const res2 = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        weapon: window._sr.state.weapon,
        rootChildren: window._sr.weaponRoot ? window._sr.weaponRoot.children.map(c => c.name) : null,
        activeMesh: !!window._sr.activeWeaponMesh
      };
    })()`,
    returnByValue: true
  });
  console.log('After wait:', res2.result.value);

  const snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/check_woman_wand_loaded.png', Buffer.from(snap.data, 'base64'));
  console.log('Saved check_woman_wand_loaded.png');

  ws.close();
  edge.kill();
}

main().catch(console.error);

