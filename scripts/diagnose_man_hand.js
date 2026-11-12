const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_fist_' + Date.now());
const PORT = 9972;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Edge connection failed');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
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

  // Turn off bone helpers & switch to engi_man + apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Set close-up camera on man's right hand (front view)
  // Target right hand position in idle: around x = -0.22, y = 0.85, z = 0.05
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.65, 0.10, 0.0, -0.22, 0.05);`
  });
  await sleep(300);

  // Capture current state front
  let snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_fist_diag_current_front.png', Buffer.from(snap.data, 'base64'));

  // Capture current state side
  await send('Runtime.evaluate', {
    expression: `window._sr.setCameraPreset(0.85, 0.65, 0.10, -Math.PI * 0.5, -0.22, 0.05);`
  });
  await sleep(300);
  snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_fist_diag_current_side.png', Buffer.from(snap.data, 'base64'));

  // Now inspect native punch animation fist!
  // In punch animation, what are the hand and thumb bone quaternions?
  const punchQuats = await send('Runtime.evaluate', {
    expression: `(() => {
      const clips = window._sr.loadedClipsList || [];
      const punchClip = clips.find(c => c.name.toLowerCase().includes('punch') || c.name.toLowerCase().includes('attack'));
      if (!punchClip) return { error: 'No punch clip found', clips: clips.map(c => c.name) };

      const fingerBones = [
        'RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3',
        'RightHandIndex1', 'RightHandIndex2', 'RightHandIndex3',
        'RightHandMiddle1', 'RightHandMiddle2', 'RightHandMiddle3',
        'RightHandRing1', 'RightHandRing2', 'RightHandRing3',
        'RightHandPinky1', 'RightHandPinky2', 'RightHandPinky3'
      ];
      const res = {};
      fingerBones.forEach(b => {
        const track = punchClip.tracks.find(t => t.name.includes(b + '.quaternion'));
        if (track) {
          // Take mid frame
          const midIdx = Math.floor(track.times.length / 2) * 4;
          res[b] = [
            +track.values[midIdx].toFixed(5),
            +track.values[midIdx + 1].toFixed(5),
            +track.values[midIdx + 2].toFixed(5),
            +track.values[midIdx + 3].toFixed(5)
          ];
        }
      });
      return res;
    })()`,
    returnByValue: true
  });
  console.log('Punch anim quaternions:', JSON.stringify(punchQuats.result.value, null, 2));

  edge.kill();
  console.log('DONE MAN FIST DIAG');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

