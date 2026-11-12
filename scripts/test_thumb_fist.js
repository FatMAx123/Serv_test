const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_thumb_test_' + Date.now());
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
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
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

  // Turn off bone helpers
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    })()`
  });

  // Switch camera to weapon preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  // Apply complete fist pose (4 fingers + thumb)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      sr.state.animPaused = true;
      
      const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
      fingers.forEach((f, idx) => {
        // Stagger angles slightly for anatomical realism
        const baseAngle = -0.75 - (idx * 0.05);
        for (let j = 1; j <= 3; j++) {
          const b = model.getObjectByName('mixamorigRightHand' + f + j) || model.getObjectByName('mixamorig:RightHand' + f + j);
          if (b) {
            b.rotateZ(baseAngle);
            if (j === 1 && f === 'Pinky') b.rotateX(0.15); // slight cup
          }
        }
      });

      // Thumb: curls across the fingers
      const t1 = model.getObjectByName('mixamorigRightHandThumb1') || model.getObjectByName('mixamorig:RightHandThumb1');
      const t2 = model.getObjectByName('mixamorigRightHandThumb2') || model.getObjectByName('mixamorig:RightHandThumb2');
      const t3 = model.getObjectByName('mixamorigRightHandThumb3') || model.getObjectByName('mixamorig:RightHandThumb3');
      if (t1) { t1.rotateX(-0.4); t1.rotateZ(-0.45); }
      if (t2) { t2.rotateZ(-0.6); }
      if (t3) { t3.rotateZ(-0.5); }
    })()`
  });
  await sleep(600);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_complete_fist.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved screenshots/test_complete_fist.png');

  edge.kill();
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

