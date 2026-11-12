const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_sit_' + Date.now());
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone helper spheres & switch camera to full preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const btn = document.getElementById('cam-full');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  async function checkAnim(animName) {
    console.log(`\nTesting animation: [${animName}]...`);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        if (sel) { sel.value = '${animName}'; sel.dispatchEvent(new Event('change')); }
      })()`
    });
    await sleep(2000);

    const info = await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        if (!sr) return { err: 'no _sr' };
        const model = sr.activeCharacterModel;
        const hips = model ? (model.getObjectByName('mixamorigHips') || model.getObjectByName('mixamorig:Hips')) : null;
        const wp = new window.THREE.Vector3();
        if (hips) hips.getWorldPosition(wp);
        return {
          currentAnim: sr.state.animation,
          hipsWorldY: hips ? wp.y.toFixed(3) : null,
          hipsLocalY: hips ? hips.position.y.toFixed(3) : null,
          hipsLocalZ: hips ? hips.position.z.toFixed(3) : null
        };
      })()`,
      returnByValue: true
    });
    console.log('  State info:', JSON.stringify(info.result.value));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outPath = `screenshots/test_anim_${animName}.png`;
    fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ Saved ${outPath}`);
  }

  await checkAnim('sit_loop');
  await checkAnim('sit_down');
  await checkAnim('stand_up');
  await checkAnim('idle');

  ws.close();
  edge.kill();
}

main().catch(console.error);

