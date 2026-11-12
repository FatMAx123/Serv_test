const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sr_verif_sit_' + Date.now());
const PORT = 9228;

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

  // Turn off bone helper spheres
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  const testList = [
    { clip: 'sit_loop', shot: 'fixed_sit_loop.png' },
    { clip: 'sit_down', shot: 'fixed_sit_down.png' },
    { clip: 'stand_up', shot: 'fixed_stand_up.png' }
  ];

  for (const item of testList) {
    console.log(`Setting animation to [${item.clip}]...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        if (sel) {
          sel.value = '${item.clip}';
          sel.dispatchEvent(new Event('change'));
        }
      })()`
    });

    await sleep(2000);

    // Read bone hips pos in browser
    const hipPos = await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        let pos = null;
        if (sr && sr.activeCharacterModel) {
          sr.activeCharacterModel.traverse(o => {
            if (o.isBone && o.name.includes('Hips')) {
              const p = new o.position.constructor();
              o.getWorldPosition(p);
              pos = [p.x, p.y, p.z];
            }
          });
        }
        return { clip: sr.currentClipName, hipWorld: pos };
      })()`,
      returnByValue: true
    });
    console.log(`  State:`, hipPos.result.value);

    const shotRes = await send('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shotRes.data, 'base64');
    const shotPath = path.join(__dirname, '..', 'screenshots', item.shot);
    fs.writeFileSync(shotPath, shotBuf);
    console.log(`  ✓ Saved screenshot: ${shotPath}`);
  }

  edge.kill();
  console.log('Finished capturing sit animations!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
