const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_canon_' + Date.now());
const PORT = 9995;

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

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(2500);

  // Inject the universal canonical weapon loader
  const injectRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const THREE = window.THREE;

      // Define canonical weapon configs
      window.CANON_WEAPONS = {
        novice: {
          worldLen: 0.95,
          gripFromPommel: 0.14, // 14 cm from pommel to center of palm
          pos: [0.035, 0.082, 0.018],
          rot: [0.0, 0.0, 0.0],
          isStaff: false
        },
        magic_mace: {
          worldLen: 0.90,
          gripFromPommel: 0.14,
          pos: [0.035, 0.082, 0.018],
          rot: [0.0, 0.0, 0.0],
          isStaff: false
        },
        atuba_mace: {
          worldLen: 0.95,
          gripFromPommel: 0.14,
          pos: [0.035, 0.082, 0.018],
          rot: [0.0, 0.0, 0.0],
          isStaff: false
        },
        tears_fairy: {
          worldLen: 0.90,
          gripFromPommel: 0.14,
          pos: [0.035, 0.082, 0.018],
          rot: [0.0, 0.0, 0.0],
          isStaff: false
        },
        demon_staff: {
          worldLen: 1.70,
          gripFromPommel: 0.65, // 65 cm from bottom tip (middle-upper shaft)
          pos: [0.035, 0.082, 0.018],
          rot: [Math.PI, 0.0, 0.0], // Staff head points UP
          isStaff: true
        }
      };

      // Uncheck bone helpers
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }

      return 'injected';
    })()`,
    returnByValue: true
  });
  console.log('Injected:', injectRes.result.value);

  // Now test each weapon and take both full view and closeup screenshots
  const weapons = ['novice', 'magic_mace', 'atuba_mace', 'demon_staff', 'tears_fairy'];
  for (const wId of weapons) {
    console.log('Testing canonical weapon:', wId);
    
    // Switch weapon
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        sel.value = '${wId}';
        sel.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    // 1. Full camera view
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('cam-full');
        if (btn) btn.click();
      })()`
    });
    await sleep(600);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/canon_${wId}_full.png`, Buffer.from(shot.data, 'base64'));

    // 2. Weapon closeup view
    await send('Runtime.evaluate', {
      expression: `(() => {
        const btn = document.getElementById('cam-weapon');
        if (btn) btn.click();
      })()`
    });
    await sleep(600);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/canon_${wId}_closeup.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved canon_${wId}_full.png and canon_${wId}_closeup.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

