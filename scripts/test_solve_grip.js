const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_solve_grip_' + Date.now());
const PORT = 9992;

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

  // Let's test solving for the exact target vector in world space:
  // Target direction: FORWARD (+Z) and DOWN (-Y)
  // Angle: roughly 35-40 deg from vertical down:
  // dir = (0, -cos(38 deg), sin(38 deg)) = (0, -0.788, +0.615)
  // Let's test a few variations of target angles and palm depths!
  const targetAngles = [
    { name: 'angle_30deg', deg: 30, zDepth: 0.022 },
    { name: 'angle_38deg', deg: 38, zDepth: 0.022 },
    { name: 'angle_45deg', deg: 45, zDepth: 0.022 },
    { name: 'angle_38deg_depth18', deg: 38, zDepth: 0.018 },
    { name: 'angle_38deg_depth25', deg: 38, zDepth: 0.026 }
  ];

  for (const t of targetAngles) {
    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        const wo = window._sr.weaponOrient;
        const root = window._sr.activeCharacterModel;
        const rHand = root.getObjectByName('mixamorig:RightHand') ||
                      root.getObjectByName('mixamorigRightHand') ||
                      root.getObjectByName('RightHand');

        if (!wo || !rHand) return { error: 'no orient or hand' };

        // 1. Position inside hand:
        // Center across knuckles (X=0), along palm (Y=0.044), into fist chamber (Z = ${t.zDepth})
        const scaleInv = 100.0;
        wo.position.set(0.002 * scaleInv, 0.044 * scaleInv, ${t.zDepth} * scaleInv);

        // 2. Compute local rotation so canonical +Y points in desired direction:
        // Target world direction: forward (+Z) and down (-Y)
        const rad = ${t.deg} * Math.PI / 180;
        const targetWorldDir = new THREE.Vector3(0.0, -Math.cos(rad), Math.sin(rad)).normalize();

        // Convert targetWorldDir to handBone local coordinates:
        const handWorldQuat = new THREE.Quaternion();
        rHand.getWorldQuaternion(handWorldQuat);
        const invHandQuat = handWorldQuat.clone().invert();
        const targetLocalDir = targetWorldDir.clone().applyQuaternion(invHandQuat);

        // Rotation from canonical +Y (0, 1, 0) to targetLocalDir:
        const canonicalDir = new THREE.Vector3(0, 1, 0);
        const rotQuat = new THREE.Quaternion().setFromUnitVectors(canonicalDir, targetLocalDir);
        wo.quaternion.copy(rotQuat);

        const euler = new THREE.Euler().setFromQuaternion(rotQuat, 'XYZ');
        return {
          euler: [euler.x, euler.y, euler.z],
          targetLocalDir: targetLocalDir,
          targetWorldDir: targetWorldDir
        };
      })()`,
      returnByValue: true
    });

    console.log(`Test ${t.name}:`, JSON.stringify(res ? res.result.value : null));

    await sleep(400);

    // 1. Rear-right view (like user's latest screenshot)
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.0, 0.15, -Math.PI * 0.75, 0, 0);`
    });
    await sleep(400);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/solve_${t.name}_rear.png`, Buffer.from(s.data, 'base64'));

    // 2. Right profile view
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.0, 0.05, -Math.PI * 0.5, 0, 0);`
    });
    await sleep(400);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/solve_${t.name}_side.png`, Buffer.from(s.data, 'base64'));

    // 3. Closeup view of hand
    await send('Runtime.evaluate', { expression: `document.getElementById('cam-weapon').click();` });
    await sleep(400);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/solve_${t.name}_close.png`, Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

