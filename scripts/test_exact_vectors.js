const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_exact_vec_' + Date.now());
const PORT = 9991;

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
  await sleep(2500);

  // Turn off bone helpers & select apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const sel = document.getElementById('sel-weapon');
      sel.value = 'apprentice_wand';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Let's test a sweep of forward vs down vectors:
  // Forward is +Z, Down is -Y, Slightly right is -X
  const vectorTests = [
    { name: 'fwd40_down75', dir: [-0.05, -0.75, 0.40] },
    { name: 'fwd55_down70', dir: [-0.05, -0.70, 0.55] },
    { name: 'fwd70_down60', dir: [-0.05, -0.60, 0.70] },
    { name: 'fwd50_down80', dir: [-0.05, -0.80, 0.50] }
  ];

  // Also let's test handle position offsets inside hand:
  // In hand local coordinates:
  // Knuckles are along X. Palm length is Y. Palm depth is Z.
  // Let's test depths: Z = 0.015, 0.022, 0.028, and X = -0.005, 0.0, +0.005
  const posTests = [
    { name: 'p_z20', pos: [0.0, 0.044, 0.020] },
    { name: 'p_z25', pos: [0.0, 0.044, 0.025] },
    { name: 'p_z30', pos: [0.0, 0.044, 0.030] },
    { name: 'p_xneg_z25', pos: [-0.006, 0.044, 0.025] },
    { name: 'p_xpos_z25', pos: [0.006, 0.044, 0.025] }
  ];

  for (const vt of vectorTests) {
    for (const pt of posTests.slice(0, 3)) {
      const tag = `${vt.name}_${pt.name}`;
      const evalRes = await send('Runtime.evaluate', {
        expression: `(() => {
          const wo = window._sr.weaponOrient;
          const root = window._sr.activeCharacterModel;
          const rHand = root.getObjectByName('mixamorig:RightHand') ||
                        root.getObjectByName('mixamorigRightHand') ||
                        root.getObjectByName('RightHand');

          if (!wo || !rHand) return { error: 'no hand' };

          // ScaleInv is 100
          const scaleInv = 100.0;
          wo.position.set(${pt.pos[0]} * scaleInv, ${pt.pos[1]} * scaleInv, ${pt.pos[2]} * scaleInv);

          // Target world direction
          const targetWorld = new THREE.Vector3(${vt.dir[0]}, ${vt.dir[1]}, ${vt.dir[2]}).normalize();

          // Transform into hand space
          const handQuat = new THREE.Quaternion();
          rHand.getWorldQuaternion(handQuat);
          const handInv = handQuat.clone().invert();
          const targetHand = targetWorld.clone().applyQuaternion(handInv);

          const rotQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), targetHand);
          wo.quaternion.copy(rotQuat);

          const e = new THREE.Euler().setFromQuaternion(rotQuat, 'XYZ');
          return { euler: [e.x, e.y, e.z], pos: [${pt.pos[0]}, ${pt.pos[1]}, ${pt.pos[2]}] };
        })()`,
        returnByValue: true
      });

      await sleep(300);

      // 1. Rear-right 3/4 view (EXACT angle from user's latest screenshot)
      await send('Runtime.evaluate', {
        expression: `window._sr.setCameraPreset(0.85, 2.0, 0.15, -Math.PI * 0.75, 0, 0);`
      });
      await sleep(300);
      let s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/test_${tag}_rear.png`, Buffer.from(s.data, 'base64'));

      // 2. Right profile view (exact side view from first user drawing)
      await send('Runtime.evaluate', {
        expression: `window._sr.setCameraPreset(0.85, 2.0, 0.05, -Math.PI * 0.5, 0, 0);`
      });
      await sleep(300);
      s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/test_${tag}_side.png`, Buffer.from(s.data, 'base64'));

      // 3. Hand closeup view
      await send('Runtime.evaluate', { expression: `document.getElementById('cam-weapon').click();` });
      await sleep(300);
      s = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshots/test_${tag}_close.png`, Buffer.from(s.data, 'base64'));

      console.log(`Rendered ${tag}:`, JSON.stringify(evalRes ? evalRes.result.value : null));
    }
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

