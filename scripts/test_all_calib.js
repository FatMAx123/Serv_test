const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_all_calib_' + Date.now());
const PORT = 9239;

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
  await sleep(2000);

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Apply master calibration to all clips in showroom
  const calibRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return 'no _sr';

      const EMOJI_CLIPS = new Set([
        'sit_down', 'sit_loop', 'stand_up', 'bow', 'clap', 'dance',
        'heart_pose', 'laugh', 'complain', 'afraid', 'warm_up'
      ]);

      const RUN_WALK = new Set(['walk', 'fast_run', 'sword_run']);

      const targetX = 0.002;
      const targetY = 0.564;
      const targetZ = -0.002;

      for (const [name, action] of Object.entries(sr.activeActions)) {
        if (EMOJI_CLIPS.has(name)) continue; // Emoji clips are already pristine!
        const clip = action.getClip();
        if (!clip) continue;

        // Remove any rogue Armature translation tracks
        clip.tracks = clip.tracks.filter(t => !t.name.includes('Armature.position'));

        const hipTrack = clip.tracks.find(t => t.name.includes('Hips.position'));
        if (!hipTrack) continue;

        const startX = hipTrack.values[0];
        const startY = hipTrack.values[1];
        const startZ = hipTrack.values[2];

        // Is it run/walk treadmill?
        const isRunWalk = RUN_WALK.has(name);

        for (let i = 0; i < hipTrack.values.length; i += 3) {
          const rawDx = hipTrack.values[i] - startX;
          const rawDy = hipTrack.values[i+1] - startY;
          const rawDz = hipTrack.values[i+2] - startZ;

          // Scale: if delta is huge (> 5.0), it's in centimeters -> scale by 0.01
          // If delta is small (< 1.0), it's already in meters.
          const maxRawDelta = Math.max(Math.abs(rawDx), Math.abs(rawDy), Math.abs(rawDz));
          const scale = maxRawDelta > 3.0 ? 0.01 : 1.0;

          if (isRunWalk) {
            // Keep X and Z locked in-place for seamless treadmill loop
            hipTrack.values[i] = targetX;
            hipTrack.values[i+1] = targetY + rawDy * scale;
            hipTrack.values[i+2] = targetZ;
          } else {
            hipTrack.values[i] = targetX + rawDx * scale;
            hipTrack.values[i+1] = targetY + rawDy * scale;
            hipTrack.values[i+2] = targetZ + rawDz * scale;
          }
        }
      }

      return 'Calibrated all 20 combat clips successfully';
    })()`,
    returnByValue: true
  });

  console.log('Master calibration result:', calibRes);

  const testList = [
    'idle', 'walk', 'fast_run', 'sword_slash', 'boxing', 'power_up',
    'sword_cast_1', 'cast_1h', 'death_back', 'dance', 'sit_loop'
  ];

  for (const name of testList) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        if (sel) {
          sel.value = '${name}';
          sel.dispatchEvent(new Event('change'));
        }
      })()`
    });
    await sleep(700);

    const shotRes = await send('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shotRes.data, 'base64');
    const p = path.join(__dirname, '..', 'screenshots', `calib_${name}.png`);
    fs.writeFileSync(p, shotBuf);
    console.log(`Saved screenshot: calib_${name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

