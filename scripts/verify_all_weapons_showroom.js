const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_wpn_' + Date.now());
const PORT = 9300;
const BRAIN_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

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
    '--hide-scrollbars',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
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

  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html?v=' + Date.now() });
  await sleep(4500);

  // Disable turntable, helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const tt = document.getElementById('chk-turntable');
      if (tt && tt.checked) { tt.checked = false; tt.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(1000);

  async function snap(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const localPath = `screenshots/${name}.png`;
    fs.writeFileSync(localPath, Buffer.from(shot.data, 'base64'));
    const brainPath = path.join(BRAIN_DIR, `${name}.png`);
    fs.copyFileSync(localPath, brainPath);
    console.log(`Saved ${name}.png`);
  }

  const weapons = [
    { id: 'apprentice_wand', name: 'wand' },
    { id: 'novice', name: 'novice_mace' },
    { id: 'magic_mace', name: 'magic_mace' },
    { id: 'atuba_mace', name: 'atuba_mace' },
    { id: 'demon_staff', name: 'demon_staff' }
  ];

  for (const w of weapons) {
    console.log(`Testing weapon: ${w.id}`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selW = document.getElementById('sel-weapon');
        if (selW) { selW.value = '${w.id}'; selW.dispatchEvent(new Event('change')); }
        window._sr.frameCamera('full');
      })()`
    });
    await sleep(1800);
    await snap(`verify_${w.name}_full`);

    // For apprentice wand and demon staff, also take a close-up weapon view
    if (w.id === 'apprentice_wand' || w.id === 'demon_staff') {
      await send('Runtime.evaluate', {
        expression: `(() => {
          window._sr.frameCamera('weapon');
        })()`
      });
      await sleep(1000);
      await snap(`verify_${w.name}_closeup`);
    }
  }

  ws.close();
  edge.kill();
  console.log('All verification screenshots complete.');
}

main().catch(console.error);

