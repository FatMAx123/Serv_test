const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_rot_sweep_' + Date.now());
const PORT = 9933;

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
    expression: "document.getElementById('ui-overlay').style.display = 'none';"
  });

  // Switch to engi_man, apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Position: px: 0.015, py: 0.075, pz: 0.022
  // Test rotations on engi_man:
  // In Three.js, rotation order is XYZ.
  // We want the wand head to point forward and down at ~25 degrees from ground (~65 degrees from vertical).
  const tests = [
    { name: 'r1_base', rot: [Math.PI * 0.5, -1.1345, 1.1345] },
    { name: 'r2_neg_yz', rot: [Math.PI * 0.5, 1.1345, -1.1345] },
    { name: 'r3_neg_x', rot: [-Math.PI * 0.5, -1.1345, 1.1345] },
    { name: 'r4_neg_all', rot: [-Math.PI * 0.5, 1.1345, -1.1345] },
    { name: 'r5_swap_yz', rot: [Math.PI * 0.5, 1.1345, 1.1345] },
    { name: 'r6_neg_both_yz', rot: [Math.PI * 0.5, -1.1345, -1.1345] },
    { name: 'r7_euler_test_forward', rot: [-Math.PI * 0.5, 0.436, -0.436] },
    { name: 'r8_euler_test_forward2', rot: [-Math.PI * 0.5, -0.436, 0.436] }
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
        window._sr.weaponOrient.position.set(0.015 * scaleInv, 0.075 * scaleInv, 0.022 * scaleInv);
        window._sr.weaponOrient.rotation.set(${t.rot[0]}, ${t.rot[1]}, ${t.rot[2]});
      })()`
    });
    await sleep(200);

    // Profile view
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.0, 2.7, 0.05, -1.57, 0, 0);"
    });
    await sleep(200);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/man_rot_${t.name}.png`, Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('MAN ROT SWEEP COMPLETED');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

