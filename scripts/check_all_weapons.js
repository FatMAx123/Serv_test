const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_all_weap_check_' + Date.now());
const PORT = 9977;

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
  await sleep(2000);

  await send('Runtime.evaluate', {
    expression: "document.getElementById('ui-overlay').style.display = 'none';"
  });

  const weapons = ['apprentice_wand', 'novice', 'magic_mace', 'atuba_mace', 'tears_fairy', 'demon_staff'];

  for (const w of weapons) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selChar = document.getElementById('sel-character');
        selChar.value = 'engi_woman';
        selChar.dispatchEvent(new Event('change'));
        const selW = document.getElementById('sel-weapon');
        selW.value = '${w}';
        selW.dispatchEvent(new Event('change'));
        window._sr.playAnimation('idle');
      })()`
    });
    await sleep(1200);

    // Profile view
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.0, 2.8, 0.05, -1.57, 0, 0);"
    });
    await sleep(200);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/check_weap_${w}.png`, Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('ALL WEAPONS CHECKED');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

