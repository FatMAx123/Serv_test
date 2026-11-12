const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_wpn_' + Date.now());
const PORT = 9290;

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

  // Turn off bone helpers & disable turntable
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const tt = document.getElementById('chk-turntable');
      if (tt && tt.checked) { tt.checked = false; tt.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(1000);

  // Inject test updateHandGrip and test weapon positioning
  async function applyGripAndSocket(config) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        
        // Custom updateHandGrip implementation
        window._customHandGrip = function(w) {
          const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
          fingers.forEach((f, idx) => {
            for (let j = 1; j <= 3; j++) {
              const b = model.getObjectByName('mixamorigRightHand' + f + j) ||
                        model.getObjectByName('mixamorig:RightHand' + f + j);
              if (b) {
                // Positive Z rotation bends fingers into the palm!
                const curl = (${config.fingerCurl}) * w;
                b.rotateZ(curl);
                if (j === 1) {
                  // Slight spread/splay to wrap naturally around handle cylinder
                  b.rotateX((${config.fingerSplay || 0}) * (idx - 1.5) * w);
                }
              }
            }
          });

          // Thumb locks across index and middle fingers
          const t1 = model.getObjectByName('mixamorigRightHandThumb1') || model.getObjectByName('mixamorig:RightHandThumb1');
          const t2 = model.getObjectByName('mixamorigRightHandThumb2') || model.getObjectByName('mixamorig:RightHandThumb2');
          const t3 = model.getObjectByName('mixamorigRightHandThumb3') || model.getObjectByName('mixamorig:RightHandThumb3');
          if (t1) {
            t1.rotateZ((${config.thumbZ1}) * w);
            t1.rotateX((${config.thumbX1}) * w);
            t1.rotateY((${config.thumbY1}) * w);
          }
          if (t2) {
            t2.rotateZ((${config.thumbZ2}) * w);
          }
          if (t3) {
            t3.rotateZ((${config.thumbZ3}) * w);
          }
        };

        // Override weaponOrient position and rotation
        const wOrient = model.getObjectByName('char_weapon_orient');
        if (wOrient) {
          wOrient.position.set(${config.pos[0]}, ${config.pos[1]}, ${config.pos[2]});
          wOrient.rotation.set(${config.rot[0]}, ${config.rot[1]}, ${config.rot[2]});
        }
      })()`
    });
  }

  // Let's hook _customHandGrip into the animate loop by replacing window.updateHandGrip
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._origUpdateHandGrip = window.updateHandGrip;
      // We can patch window.animate or updateHandGrip directly
    })()`
  });

  // Let's test a weapon
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(1500);

  // Take full body screenshot
  async function takeScreenshot(filename) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const out = `screenshots/${filename}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(out, `C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d/${filename}.png`);
    console.log(`Saved ${filename}.png`);
  }

  await takeScreenshot('test_current_baseline');

  ws.close();
  edge.kill();
}

main().catch(console.error);

