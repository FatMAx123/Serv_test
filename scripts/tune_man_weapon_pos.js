const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_man_pos_' + Date.now());
const PORT = 9993;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function main() {
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
  await sleep(2000);

  // Turn off bone helpers, select engi_man, apprentice_wand, pause idle animation
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      window._sr.state.animPaused = true;
    })()`
  });
  await sleep(2500);

  // Test offsets for pos on engi_man:
  // Base was: pos: [-0.005, 0.044, 0.022]
  // In hand coordinates, let's see which axis moves it into the fist:
  // We can test:
  // py from 0.044 down to 0.070 (along fingers) or 0.020
  // pz from 0.022 to 0.040 or 0.000
  // px from -0.005 to 0.010 or -0.020
  const tests = [
    { name: 'base', pos: [-0.005, 0.044, 0.022] },
    // test Y (along hand length toward curled fingers)
    { name: 'y_plus_2cm', pos: [-0.005, 0.064, 0.022] },
    { name: 'y_plus_4cm', pos: [-0.005, 0.084, 0.022] },
    { name: 'y_minus_2cm', pos: [-0.005, 0.024, 0.022] },
    // test Z (depth through palm)
    { name: 'z_plus_2cm', pos: [-0.005, 0.064, 0.042] },
    { name: 'z_minus_2cm', pos: [-0.005, 0.064, 0.002] },
    // test X (lateral across palm)
    { name: 'x_plus_1cm', pos: [0.005, 0.064, 0.022] },
    { name: 'x_minus_1cm', pos: [-0.015, 0.064, 0.022] }
  ];

  for (const t of tests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
        let scaleInv = 1.0;
        if (hand) {
          const s = new THREE.Vector3();
          hand.getWorldScale(s);
          const maxS = Math.max(s.x, s.y, s.z);
          if (maxS > 1e-5) scaleInv = 1.0 / maxS;
        }
        const wo = window._sr.weaponOrient;
        wo.position.set(${t.pos[0]} * scaleInv, ${t.pos[1]} * scaleInv, ${t.pos[2]} * scaleInv);
      })()`
    });
    await sleep(200);

    // Front-side view (matches user image 2)
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05);"
    });
    await sleep(200);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/tune_man_front_' + t.name + '.png', Buffer.from(s.data, 'base64'));

    // Rear-side view (matches user image 1)
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.05, 1.3, 0.1, -2.4, -0.3, 0.05);"
    });
    await sleep(200);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/tune_man_rear_' + t.name + '.png', Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('TUNE POS COMPLETED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

