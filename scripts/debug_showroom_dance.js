const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sr_' + Date.now());
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
  for (let i = 0; i < 20; i++) {
    await sleep(300);
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

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.method === 'Runtime.consoleAPICalled') {
      const args = data.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      console.log(`[BROWSER ${data.params.type.toUpperCase()}]`, args);
    } else if (data.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', data.params.exceptionDetails.text, data.params.exceptionDetails.exception?.description);
    }
  });

  await send('Runtime.enable');
  await send('Page.enable');

  console.log('Navigating to http://localhost:3000/showroom.html ...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });

  await sleep(4000);

  // Play sit_loop animation
  await send('Runtime.evaluate', {
    expression: `(() => {
      if (window._sr && window._sr.activeActions['dance']) {
        const sel = document.getElementById('sel-animation');
        if (sel) {
          sel.value = 'dance';
          sel.dispatchEvent(new Event('change'));
        }
      }
    })()`,
    returnByValue: true
  });

  await sleep(1500);

  // Evaluate state in browser
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return { error: 'no _sr' };
      const model = sr.activeCharacterModel;
      const mixer = sr.activeMixer;
      let modelPos = null;
      if (model) {
        modelPos = [model.position.x, model.position.y, model.position.z];
        model.traverse(o => {
          if (o.isBone && o.name.includes('Hips')) {
            const p = new o.position.constructor();
            o.getWorldPosition(p);
            console.log('Bone Hips world pos: ' + p.x.toFixed(3) + ', ' + p.y.toFixed(3) + ', ' + p.z.toFixed(3));
          }
        });
      }
      return {
        hasModel: !!model,
        hasMixer: !!mixer,
        mixerTime: mixer ? mixer.time : null,
        currentClipName: sr.currentClipName,
        totalClipsLoaded: sr.loadedClipsList ? sr.loadedClipsList.length : 0,
        modelPos: modelPos,
        actionKeysCount: Object.keys(sr.activeActions || {}).length,
        loadedClips: sr.loadedClipsList
      };
    })()`,
    returnByValue: true
  });

  console.log('Evaluation result:', JSON.stringify(evalRes, null, 2));

  // Turn off bone helper spheres
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) {
        chk.checked = false;
        chk.dispatchEvent(new Event('change'));
      }
    })()`,
    returnByValue: true
  });

  await sleep(1000);

  // Take screenshot
  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  const shotBuf = Buffer.from(shotRes.data, 'base64');
  const shotPath = path.join(__dirname, '..', 'screenshots', 'debug_sr_dance.png');
  require('fs').writeFileSync(shotPath, shotBuf);
  console.log('Screenshot saved to:', shotPath);

  edge.kill();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
