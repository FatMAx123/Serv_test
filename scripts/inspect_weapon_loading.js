const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_log_' + Date.now());
const PORT = 9230;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
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
    '--window-size=1920,1080',
    'about:blank'
  ]);

  for (let i = 0; i < 25; i++) {
    await sleep(200);
    try { await requestJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch (_) {}
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
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

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = (data.params.args || []).map(a => a.value !== undefined ? a.value : a.description);
      console.log(`[CONSOLE ${data.params.type}]`, ...args);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(3500);

  console.log('Selecting apprentice_wand...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'apprentice_wand';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(3000);

  const weaponMeshInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      let meshDetails = null;
      if (sr && sr.activeWeaponMesh) {
        const box = new sr.activeWeaponMesh.position.constructor();
        // check bounding box
        meshDetails = {
          name: sr.activeWeaponMesh.name,
          visible: sr.activeWeaponMesh.visible,
          scale: sr.activeWeaponMesh.scale.toArray(),
          pos: sr.activeWeaponMesh.position.toArray(),
          rot: sr.activeWeaponMesh.rotation.toArray(),
          parent: sr.activeWeaponMesh.parent ? sr.activeWeaponMesh.parent.name : null
        };
      }
      return {
        activeWeaponMesh: !!(sr && sr.activeWeaponMesh),
        meshDetails,
        weaponRootChildren: sr ? sr.weaponRoot.children.length : 0,
        weaponRootParent: (sr && sr.weaponRoot.parent) ? sr.weaponRoot.parent.name : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Weapon mesh info:', JSON.stringify(weaponMeshInfo.result.value, null, 2));

  edge.kill();
  process.exit(0);
}
main();

