const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_hand_' + Date.now());
const PORT = 9996;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3500);

  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
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
  await sleep(1500);

  // Switch to engi_man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      selW.value = 'none';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const model = window._sr.activeCharacterModel;
      if (!model) return { error: 'no model' };
      const bones = {};
      model.traverse(o => {
        if (o.isBone && o.name.includes('RightHand')) {
          const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
          bones[o.name] = {
            q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map(v => +v.toFixed(4)),
            eulerDeg: [e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI].map(v => Math.round(v))
          };
        }
      });
      return bones;
    })()`,
    returnByValue: true
  });

  console.log('Man RightHand bones in showroom (weapon=none):');
  console.log(JSON.stringify(info.result.value, null, 2));

  // Now set weapon to apprentice_wand on man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1000);

  const infoWithWeapon = await send('Runtime.evaluate', {
    expression: `(() => {
      const model = window._sr.activeCharacterModel;
      const bones = {};
      model.traverse(o => {
        if (o.isBone && o.name.includes('RightHand')) {
          const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
          bones[o.name] = {
            q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map(v => +v.toFixed(4)),
            eulerDeg: [e.x * 180 / Math.PI, e.y * 180 / Math.PI, e.z * 180 / Math.PI].map(v => Math.round(v))
          };
        }
      });
      return bones;
    })()`,
    returnByValue: true
  });

  console.log('Man RightHand bones in showroom WITH WEAPON:');
  console.log(JSON.stringify(infoWithWeapon.result.value, null, 2));

  ws.close();
  edge.kill();
}

run().catch(console.error);
