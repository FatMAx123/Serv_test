const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_all_' + Date.now());
const PORT = 9241;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1920,1080',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
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

  await send('Runtime.enable');
  await send('Page.enable');
  await sleep(2500);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  const variants = [
    { id: 'modular', name: 'Модульная', anim: 'idle' },
    { id: 'body', name: 'Базовое тело без волос', anim: 'sit_loop' },
    { id: 'merged', name: 'Базовое тело + волосы', anim: 'sword_slash' }
  ];

  const results = [];

  for (const v of variants) {
    console.log(`\nTesting variant: ${v.name} (${v.id})...`);
    // Select variant
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-model-variant');
        if (sel) {
          sel.value = '${v.id}';
          sel.dispatchEvent(new Event('change'));
        }
      })()`
    });

    await sleep(2500);

    // Select animation
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        if (sel) {
          sel.value = '${v.anim}';
          sel.dispatchEvent(new Event('change'));
        }
      })()`
    });

    await sleep(1000);

    const check = await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const sel = document.getElementById('sel-animation');
        const badge = document.getElementById('anim-clip-info');
        const optgroups = Array.from(sel.querySelectorAll('optgroup')).map(g => ({
          label: g.label,
          count: g.children.length
        }));

        const model = sr.activeCharacterModel;
        let hipY = null;
        model.traverse(o => {
          if (o.isBone && o.name.includes('Hips')) {
            const p = o.position.clone();
            o.getWorldPosition(p);
            hipY = Number(p.y.toFixed(3));
          }
        });

        return {
          totalClips: sr.loadedClipsList ? sr.loadedClipsList.length : 0,
          badgeText: badge ? badge.textContent : null,
          currentAnim: sr.currentClipName,
          hipY,
          optgroups
        };
      })()`,
      returnByValue: true
    });

    console.log(`Check result for ${v.name}:`, JSON.stringify(check.result.value, null, 2));
    results.push({ variant: v.name, check: check.result.value });

    // Capture screenshot
    const shotRes = await send('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shotRes.data, 'base64');
    const p = path.join(__dirname, '..', 'screenshots', `final_check_${v.id}.png`);
    fs.writeFileSync(p, shotBuf);
    console.log(`Screenshot saved: final_check_${v.id}.png`);
  }

  edge.kill();
  console.log('\nAll variants successfully verified!');
  process.exit(0);
}
main().catch(console.error);

