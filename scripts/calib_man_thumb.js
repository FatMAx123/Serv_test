const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_thumb_calib_' + Date.now());
const PORT = 9998;

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

  // Select engi_man, apprentice_wand, pause animation
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
      window._sr.setCameraPreset(1.05, 1.3, 0.1, -0.6, -0.3, 0.05);
    })()`
  });
  await sleep(2500);

  // We want to test rotations on mixamorigRightHandThumb1, 2, 3
  // To do that, we hook directly into the render loop right after updateHandGrip:
  // Let's add a post-grip hook in window._sr:
  const sweepConfigs = [
    // Try rotating Thumb1 around Y and Z in different directions:
    { name: 't1_y_pos', rx: 0, ry: 60, rz: 0 },
    { name: 't1_y_neg', rx: 0, ry: -60, rz: 0 },
    { name: 't1_z_pos', rx: 0, ry: 0, rz: 60 },
    { name: 't1_z_neg', rx: 0, ry: 0, rz: -60 },
    { name: 't1_x_pos', rx: 60, ry: 0, rz: 0 },
    { name: 't1_x_neg', rx: -60, ry: 0, rz: 0 },
    // Combinations of curling in
    { name: 't_curl_1', rx: 30, ry: 45, rz: 30 },
    { name: 't_curl_2', rx: -30, ry: -45, rz: -30 },
    { name: 't_curl_3', rx: 30, ry: -45, rz: 30 },
    { name: 't_curl_4', rx: -30, ry: 45, rz: -30 }
  ];

  for (const cfg of sweepConfigs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG = Math.PI / 180;
        window._manThumbOverride = {
          b1: new THREE.Euler(${cfg.rx} * DEG, ${cfg.ry} * DEG, ${cfg.rz} * DEG, 'XYZ'),
          b2: new THREE.Euler(${cfg.rx * 0.5} * DEG, ${cfg.ry * 0.5} * DEG, ${cfg.rz * 0.5} * DEG, 'XYZ'),
          b3: new THREE.Euler(0, 0, 0, 'XYZ')
        };
      })()`
    });

    // Apply every frame hook
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (!window._manHookInstalled) {
          window._manHookInstalled = true;
          const origUpdate = window.requestAnimationFrame;
          const model = window._sr.activeCharacterModel;
          setInterval(() => {
            if (window._manThumbOverride && window._sr.activeCharacterModel) {
              const b1 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb1');
              const b2 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb2');
              const b3 = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHandThumb3');
              if (b1) b1.quaternion.setFromEuler(window._manThumbOverride.b1);
              if (b2) b2.quaternion.setFromEuler(window._manThumbOverride.b2);
              if (b3) b3.quaternion.setFromEuler(window._manThumbOverride.b3);
            }
          }, 16);
        }
      })()`
    });
    await sleep(250);

    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/man_sweep_' + cfg.name + '.png', Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('SWEEP FINISHED');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

