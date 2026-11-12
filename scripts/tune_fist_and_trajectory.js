const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_' + Date.now());
const PORT = 9921;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=test_' + Date.now()
  ]);
  await sleep(3500);

  const tabs = await new Promise((res, rej) => {
    http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
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

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res && res.result ? res.result.value : null;
  }

  async function saveScreenshot(filename) {
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join('C:\\Users\\Kulibyaka\\.gemini\\antigravity\\brain\\d3dff332-87fe-4206-a4dc-9a5fc682711d', filename);
    fs.writeFileSync(p, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshot: ${filename}`);
  }

  // 1. Inspect man's thumb bones and current rotations
  console.log('Inspecting man thumb bones...');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man';
    selC.dispatchEvent(new Event('change'));
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
    window._sr.frameCamera('weapon');
  })()`);
  await sleep(2500);

  const thumbBonesInfo = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const t1 = m.getObjectByName('mixamorigRightHandThumb1');
    const t2 = m.getObjectByName('mixamorigRightHandThumb2');
    const t3 = m.getObjectByName('mixamorigRightHandThumb3');
    const i1 = m.getObjectByName('mixamorigRightHandIndex1');
    return {
      t1: t1 ? { q: t1.quaternion.toArray() } : null,
      t2: t2 ? { q: t2.quaternion.toArray() } : null,
      t3: t3 ? { q: t3.quaternion.toArray() } : null,
      i1: i1 ? { q: i1.quaternion.toArray() } : null,
    };
  })()`);
  console.log('Current man bones info:', thumbBonesInfo);

  // Take screenshot of current man hand close up
  await saveScreenshot('tune_man_hand_baseline.png');

  // Let's test folding the thumb inward!
  // In Mixamo rig, what local axes rotate the thumb into a clenched fist?
  // Let's try 3 candidate thumb poses:
  // Candidate A: Rotate Thumb1 more inward (towards palm) and curl Thumb2/Thumb3 over Index1
  const testThumbVariants = [
    {
      name: 'thumb_curl_A',
      // Curl thumb1 inward across palm, thumb2 and thumb3 bent around index
      t1: [0.35, -0.25, -0.15, 0.88], // slightly more yaw/pitch into palm
      t2: [0.15, 0.05, 0.45, 0.87],
      t3: [0.05, 0.20, 0.70, 0.68]
    },
    {
      name: 'thumb_curl_B',
      // Using Euler angles converted to quat
      eulerT1: [25, -45, 15],
      eulerT2: [20, 15, 45],
      eulerT3: [15, 10, 45]
    },
    {
      name: 'thumb_curl_C',
      // Tight wrap
      eulerT1: [30, -50, 20],
      eulerT2: [30, 20, 50],
      eulerT3: [20, 15, 50]
    }
  ];

  for (const v of testThumbVariants) {
    await evalJs(`(() => {
      const m = window._sr.activeCharacterModel;
      const t1 = m.getObjectByName('mixamorigRightHandThumb1');
      const t2 = m.getObjectByName('mixamorigRightHandThumb2');
      const t3 = m.getObjectByName('mixamorigRightHandThumb3');
      const DEG2RAD = Math.PI / 180;
      function e2q(x, y, z) {
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'XYZ'));
      }
      if ('${v.eulerT1 ? 'euler' : 'quat'}' === 'euler') {
        if (t1) t1.quaternion.copy(e2q(${v.eulerT1[0]}, ${v.eulerT1[1]}, ${v.eulerT1[2]}));
        if (t2) t2.quaternion.copy(e2q(${v.eulerT2[0]}, ${v.eulerT2[1]}, ${v.eulerT2[2]}));
        if (t3) t3.quaternion.copy(e2q(${v.eulerT3[0]}, ${v.eulerT3[1]}, ${v.eulerT3[2]}));
      } else {
        if (t1) t1.quaternion.set(${v.t1.join(',')});
        if (t2) t2.quaternion.set(${v.t2.join(',')});
        if (t3) t3.quaternion.set(${v.t3.join(',')});
      }
      m.updateMatrixWorld(true);
    })()`);
    await sleep(200);
    await saveScreenshot(`tune_${v.name}.png`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

