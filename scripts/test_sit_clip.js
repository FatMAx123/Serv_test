const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_sit_' + Date.now());
const PORT = 9230;

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

  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const sr = window._sr;
        if (!sr) return { error: 'No _sr' };
        const clips = sr.loadedClipsList || [];
        const sitClips = clips.filter(c => c.name.includes('sit') || c.name.includes('stand'));
        
        const details = sitClips.map(c => {
          const hipsTrack = c.tracks.find(t => t.name.includes('Hips.position'));
          return {
            name: c.name,
            duration: c.duration,
            tracks: c.tracks.length,
            hipsTrack: hipsTrack ? {
              name: hipsTrack.name,
              timesCount: hipsTrack.times.length,
              first3: Array.from(hipsTrack.values.slice(0, 3)),
              last3: Array.from(hipsTrack.values.slice(-3))
            } : 'NO HIPS TRACK'
          };
        });
        return { totalClips: clips.length, details };
      } catch (e) {
        return { err: e.message, stack: e.stack };
      }
    })()`,
    returnByValue: true
  });

  console.log('SIT CLIPS EVAL:', JSON.stringify(evalRes, null, 2));

  // Select sit_loop
  console.log('Selecting sit_loop...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-animation');
      if (sel) { sel.value = 'sit_loop'; sel.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(1500);

  // Check character bone positions when sit_loop is playing
  const bonePos = await send('Runtime.evaluate', {
    expression: `(() => {
      try {
        const sr = window._sr;
        const hips = sr.activeCharacterModel ? (sr.activeCharacterModel.getObjectByName('mixamorigHips') || sr.activeCharacterModel.getObjectByName('mixamorig:Hips')) : null;
        const wp = new window.THREE.Vector3();
        if (hips) hips.getWorldPosition(wp);
        return {
          hipsWorldPos: hips ? [wp.x.toFixed(3), wp.y.toFixed(3), wp.z.toFixed(3)] : null,
          hipsLocalPos: hips ? [hips.position.x.toFixed(3), hips.position.y.toFixed(3), hips.position.z.toFixed(3)] : null
        };
      } catch (e) {
        return { err: e.message };
      }
    })()`,
    returnByValue: true
  });
  console.log('BONE POS IN SIT_LOOP:', JSON.stringify(bonePos, null, 2));

  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  if (shotRes && shotRes.data) {
    fs.writeFileSync('screenshots/test_sit_loop_shot.png', Buffer.from(shotRes.data, 'base64'));
    console.log('Screenshot saved to screenshots/test_sit_loop_shot.png');
  } else {
    console.log('No screenshot data:', shotRes);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);
