const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_rot_calib_' + Date.now());
const PORT = 9228;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = ''; res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
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

  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try { await requestJson(`http://127.0.0.1:${PORT}/json/version`); break; } catch (_) {}
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
        if (resp.id === id) { ws.off('message', handler); resolve(resp.result); }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone helpers & switch camera to weapon preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  // Select magic_mace
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      if (sel) { sel.value = 'magic_mace'; sel.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(2000);

  // Try 4 orientations for magic_mace orient group
  const tests = [
    { name: 'mace_up_forward_1', rot: [Math.PI * 0.45, 0.2, Math.PI * 0.35] },
    { name: 'mace_up_forward_2', rot: [Math.PI * 0.5, 0, 0] },
    { name: 'mace_up_forward_3', rot: [0, Math.PI * 0.5, 0] },
    { name: 'mace_up_forward_4', rot: [0, 0, Math.PI * 0.5] }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const orient = sr.weaponRoot.getObjectByName('char_weapon_orient');
        if (orient) {
          orient.rotation.set(${t.rot[0]}, ${t.rot[1]}, ${t.rot[2]});
        }
      })()`
    });
    await sleep(400);

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = path.join(__dirname, '..', 'screenshots', `${t.name}.png`);
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    console.log(`Saved ${fn}`);
  }

  edge.kill();
  process.exit(0);
}
main();

