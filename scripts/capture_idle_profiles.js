const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_idle_side_views_' + Date.now());
const PORT = 9999;

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

  // Side view matching user image 2 & 3:
  // In user image 2 & 3: UI is visible, camera is full body side view.
  // Let's set camera preset matching user image 2:
  // User image shows character standing in profile from the right side!
  const chars = ['engi_woman', 'engi_man'];
  const weaps = ['apprentice_wand', 'tears_fairy', 'atuba_mace'];

  for (const c of chars) {
    for (const w of weaps) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          const selChar = document.getElementById('sel-character');
          selChar.value = '${c}';
          selChar.dispatchEvent(new Event('change'));
          const selW = document.getElementById('sel-weapon');
          selW.value = '${w}';
          selW.dispatchEvent(new Event('change'));
          window._sr.playAnimation('idle');
        })()`
      });
      await sleep(1500);

      // Camera preset matching user screenshot:
      // Click "Полный" ракурс (Full view button)
      await send('Runtime.evaluate', {
        expression: `(() => {
          document.getElementById('cam-full').click();
          // rotate camera to right profile (azimuth around -1.57)
          window._sr.setCameraPreset(1.0, 2.8, 0.05, -1.57, 0, 0);
        })()`
      });
      await sleep(300);

      let s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/idle_profile_${c}_${w}.png`, Buffer.from(s.data, 'base64'));
    }
  }

  edge.kill();
  console.log('IDLE PROFILES CAPTURED');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

