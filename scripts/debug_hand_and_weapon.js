const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_hand_' + Date.now());
const PORT = 9250;

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

  // Turn off bone helpers & select apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
    })()`
  });
  await sleep(2000);

  // Inspect hand bones and local coordinates
  const handData = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const rHand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      if (!rHand) return { error: 'No RightHand bone' };

      rHand.updateWorldMatrix(true, true);
      const rHandWorldPos = new window.THREE.Vector3();
      rHand.getWorldPosition(rHandWorldPos);

      const bones = {};
      const fingerNames = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
      fingerNames.forEach(f => {
        bones[f] = [];
        for (let j = 1; j <= 3; j++) {
          const b = model.getObjectByName('mixamorigRightHand' + f + j) || model.getObjectByName('mixamorig:RightHand' + f + j);
          if (b) {
            b.updateWorldMatrix(true, false);
            const wp = new window.THREE.Vector3();
            b.getWorldPosition(wp);
            // Relative to RightHand in RightHand local space
            const lp = wp.clone();
            rHand.worldToLocal(lp);
            bones[f].push({
              name: b.name,
              localToHand: [lp.x.toFixed(4), lp.y.toFixed(4), lp.z.toFixed(4)],
              rot: [b.rotation.x.toFixed(3), b.rotation.y.toFixed(3), b.rotation.z.toFixed(3)],
              quat: [b.quaternion.x.toFixed(3), b.quaternion.y.toFixed(3), b.quaternion.z.toFixed(3), b.quaternion.w.toFixed(3)]
            });
          }
        }
      });

      // Weapon orient position and rotation
      const wOrient = model.getObjectByName('char_weapon_orient');
      let wOrientInfo = null;
      if (wOrient) {
        wOrientInfo = {
          pos: [wOrient.position.x.toFixed(4), wOrient.position.y.toFixed(4), wOrient.position.z.toFixed(4)],
          rot: [wOrient.rotation.x.toFixed(3), wOrient.rotation.y.toFixed(3), wOrient.rotation.z.toFixed(3)]
        };
      }

      return {
        rHandWorldPos: [rHandWorldPos.x.toFixed(3), rHandWorldPos.y.toFixed(3), rHandWorldPos.z.toFixed(3)],
        wOrientInfo,
        bones
      };
    })()`,
    returnByValue: true
  });

  console.log('Hand Data:', JSON.stringify(handData.result.value, null, 2));

  ws.close();
  edge.kill();
}

main().catch(console.error);

