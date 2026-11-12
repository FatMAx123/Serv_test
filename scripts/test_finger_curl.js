const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_fingers_' + Date.now());
const PORT = 9229;

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
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 25; i++) {
    await sleep(250);
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
    return new Promise((resolve) => {
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Switch camera to weapon focus
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1000);

  // Inspect all bone names
  const testInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const allBones = [];
      model.traverse(o => {
        if (o.isBone) allBones.push(o.name);
      });
      return { totalBones: allBones.length, handBones: allBones.filter(n => n.toLowerCase().includes('hand') || n.toLowerCase().includes('index') || n.toLowerCase().includes('thumb')) };
    })()`,
    returnByValue: true
  });

  console.log('Bone search info:', JSON.stringify(testInfo.result.value, null, 2));

  // Select apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      if (sel) {
        sel.value = 'apprentice_wand';
        sel.dispatchEvent(new Event('change'));
      }
    })()`
  });
  await sleep(2500);

  // Take screenshot of hand with current weapon
  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  const shotBuf = Buffer.from(shotRes.data, 'base64');
  const shotPath = path.join(__dirname, '..', 'screenshots', 'test_weapon_current.png');
  fs.writeFileSync(shotPath, shotBuf);
  console.log('Saved screenshot to:', shotPath);

  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
