const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_clips_' + Date.now());
const PORT = 9235;

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
  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs.find(t => t.type === 'page');
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

  // Turn off bone helper spheres
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Test script: apply hips translation calibration to combat clips
  const fixRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      if (!sr) return 'no _sr';

      const EMOJI_CLIPS = new Set([
        'sit_down', 'sit_loop', 'stand_up', 'bow', 'clap', 'dance',
        'heart_pose', 'laugh', 'complain', 'afraid', 'warm_up'
      ]);

      const model = sr.activeCharacterModel;
      let hipsBone = null;
      model.traverse(o => { if (o.isBone && o.name.includes('Hips')) hipsBone = o; });
      const restY = 0.564;

      // For every clip:
      // If it's an emoji clip, keep as is!
      // If it's a combat clip:
      // Strip Hips.position or calibrate:
      // For in-place combat clips (idle, boxing, slash, runs, casts), strip Hips.position so it stays at rest pose (0, 0.564, 0).
      for (const [name, action] of Object.entries(sr.activeActions)) {
        if (EMOJI_CLIPS.has(name)) continue;
        const clip = action.getClip();
        if (!clip) continue;
        
        clip.tracks = clip.tracks.filter(t => {
          if (t.name.includes('Hips.position') || t.name.includes('Armature.position')) return false;
          return true;
        });
      }

      return 'Hips position tracks stripped for combat clips';
    })()`,
    returnByValue: true
  });

  console.log('Fix applied in memory:', fixRes);

  const testClips = ['idle', 'walk', 'fast_run', 'sword_slash', 'boxing', 'dance', 'sit_down', 'sit_loop'];
  for (const name of testClips) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        if (sel) {
          sel.value = '${name}';
          sel.dispatchEvent(new Event('change'));
        }
      })()`
    });
    await sleep(600);

    const shotRes = await send('Page.captureScreenshot', { format: 'png' });
    const shotBuf = Buffer.from(shotRes.data, 'base64');
    const p = path.join(__dirname, '..', 'screenshots', `test_${name}.png`);
    fs.writeFileSync(p, shotBuf);
    console.log(`Saved screenshot: test_${name}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

