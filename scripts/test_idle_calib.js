const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_idle_calib_' + Date.now());
const PORT = 9238;

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

  // Apply calibration in memory to idle clip
  const calibRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const action = sr.activeActions['idle'];
      const clip = action.getClip();
      const hipTrack = clip.tracks.find(t => t.name.includes('Hips.position'));
      
      const startX = hipTrack.values[0];
      const startY = hipTrack.values[1];
      const startZ = hipTrack.values[2];

      const targetX = 0.002;
      const targetY = 0.564;
      const targetZ = -0.002;

      for (let i = 0; i < hipTrack.values.length; i += 3) {
        const dx = hipTrack.values[i] - startX;
        const dy = hipTrack.values[i+1] - startY;
        const dz = hipTrack.values[i+2] - startZ;
        hipTrack.values[i] = targetX + dx;
        hipTrack.values[i+1] = targetY + dy;
        hipTrack.values[i+2] = targetZ + dz;
      }

      // Re-trigger idle
      const sel = document.getElementById('sel-animation');
      sel.value = 'idle';
      sel.dispatchEvent(new Event('change'));
      return { startX, startY, startZ, firstNew: [hipTrack.values[0], hipTrack.values[1], hipTrack.values[2]] };
    })()`,
    returnByValue: true
  });

  console.log('Calib result:', calibRes);

  await sleep(1000);

  // Check world position of feet and hips
  const boneCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      let hipPos = null;
      let footPos = null;
      model.traverse(o => {
        if (o.isBone && o.name.includes('Hips')) {
          const p = o.position.clone();
          o.getWorldPosition(p);
          hipPos = [p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3)];
        }
        if (o.isBone && o.name.includes('LeftFoot')) {
          const p = o.position.clone();
          o.getWorldPosition(p);
          footPos = [p.x.toFixed(3), p.y.toFixed(3), p.z.toFixed(3)];
        }
      });
      return { hipPos, footPos };
    })()`,
    returnByValue: true
  });
  console.log('Bone positions during calibrated idle:', boneCheck);

  const shotRes = await send('Page.captureScreenshot', { format: 'png' });
  const shotBuf = Buffer.from(shotRes.data, 'base64');
  const p = path.join(__dirname, '..', 'screenshots', `test_idle_calibrated.png`);
  fs.writeFileSync(p, shotBuf);
  console.log(`Saved screenshot: test_idle_calibrated.png`);

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
