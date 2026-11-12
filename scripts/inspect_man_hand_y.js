const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_hand_inspect_' + Date.now());
const PORT = 9994;

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

  const angles = [
    { name: 'front', theta: -0.2, phi: -0.15 },
    { name: 'side', theta: -1.57, phi: -0.1 },
    { name: 'iso', theta: -0.8, phi: -0.2 }
  ];

  const yValues = [0.044, 0.060, 0.070, 0.080];
  for (const y of yValues) {
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
        wo.position.set(-0.005 * scaleInv, ${y} * scaleInv, 0.022 * scaleInv);
      })()`
    });
    await sleep(200);

    for (const a of angles) {
      await send('Runtime.evaluate', {
        expression: `window._sr.setCameraPreset(0.85, 0.85, 0.0, ${a.theta}, ${a.phi}, 0.35);`
      });
      await sleep(200);
      const s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/hand_y_${Math.round(y*1000)}_${a.name}.png`, Buffer.from(s.data, 'base64'));
    }
  }

  edge.kill();
  console.log('HAND INSPECT COMPLETE');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

