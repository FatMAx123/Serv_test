const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_' + Date.now());
const PORT = 9938;

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
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(500);
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
  await sleep(1500);

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  // Set woman, apprentice_wand, idle
  await evalJs(`(() => {
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
  })()`);
  await sleep(2500);

  // Inspect ALL objects in the entire scene!
  const allMeshes = await evalJs(`(() => {
    const meshes = [];
    window._sr.activeCharacterModel.traverse(o => {
      if (o.isMesh) {
        let pNames = [];
        let cur = o.parent;
        while (cur && cur !== window._sr.activeCharacterModel) {
          pNames.push(cur.name || cur.type);
          cur = cur.parent;
        }
        meshes.push({
          name: o.name,
          parentChain: pNames.join(' -> '),
          visible: o.visible
        });
      }
    });
    // Also check weaponRoot
    const wRoot = window._sr.weaponRoot;
    let wChildren = [];
    if (wRoot) {
      wRoot.traverse(o => {
        if (o.isMesh) {
          wChildren.push({ name: o.name, parent: o.parent ? o.parent.name : null });
        }
      });
    }
    return { characterMeshes: meshes, weaponRootMeshes: wChildren, wRootParent: wRoot ? wRoot.parent.name : null };
  })()`);

  console.log('Scene inspect result:\n', JSON.stringify(allMeshes, null, 2));

  ws.close();
  edge.kill();
}

main().catch(console.error);

