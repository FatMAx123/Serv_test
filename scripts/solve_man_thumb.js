const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_thumb_solve_' + Date.now());
const PORT = 9995;

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

  // Now let's monkey patch updateHandGrip to allow dynamic thumb overrides
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._testManThumb = null;
      const oldUpdate = window.updateHandGrip;
      // We will override the bones directly in requestAnimationFrame
      window._customManThumb = (q1, q2, q3) => {
        window._manThumbQ = [q1, q2, q3];
      };
    })()`
  });

  // Test candidates for man thumb quaternions:
  // Note: DEG2RAD = Math.PI / 180
  const candidates = [
    // Woman was: Thumb1: (15, -45, 30), Thumb2: (25, 10, 45), Thumb3: (10, 0, 40)
    // Try reversing sign on Y and Z for man:
    { name: 'cand1_neg_yz', e1: [15, 45, -30], e2: [25, -10, -45], e3: [10, 0, -40] },
    { name: 'cand2_neg_all', e1: [-15, 45, -30], e2: [-25, -10, -45], e3: [-10, 0, -40] },
    { name: 'cand3_curl_in', e1: [30, 20, 10], e2: [40, 0, 0], e3: [30, 0, 0] },
    { name: 'cand4_curl_x_neg', e1: [-30, 20, 10], e2: [-40, 0, 0], e3: [-30, 0, 0] },
    { name: 'cand5_curl_y', e1: [0, 45, 0], e2: [0, 45, 0], e3: [0, 30, 0] },
    { name: 'cand6_curl_y_neg', e1: [0, -45, 0], e2: [0, -45, 0], e3: [0, -30, 0] },
    { name: 'cand7_curl_z', e1: [0, 0, 45], e2: [0, 0, 45], e3: [0, 0, 30] },
    { name: 'cand8_curl_z_neg', e1: [0, 0, -45], e2: [0, 0, -45], e3: [0, 0, -30] },
    { name: 'cand9_tuck', e1: [25, -20, -10], e2: [35, -15, 0], e3: [20, 0, 0] },
    { name: 'cand10_fold', e1: [45, -15, -35], e2: [30, 0, -20], e3: [20, 0, 0] }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const DEG = Math.PI / 180;
        const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${c.e1[0]} * DEG, ${c.e1[1]} * DEG, ${c.e1[2]} * DEG, 'XYZ'));
        const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${c.e2[0]} * DEG, ${c.e2[1]} * DEG, ${c.e2[2]} * DEG, 'XYZ'));
        const q3 = new THREE.Quaternion().setFromEuler(new THREE.Euler(${c.e3[0]} * DEG, ${c.e3[1]} * DEG, ${c.e3[2]} * DEG, 'XYZ'));
        
        // Temporarily patch LOCKED_FIST_QUATERNIONS in window._sr scope
        // In showroom.js, LOCKED_FIST_QUATERNIONS is in closure, but we can hook into animate
        window._thumbOverride = { q1, q2, q3 };
      })()`
    });

    // Wait a couple frames
    await send('Runtime.evaluate', {
      expression: `(() => {
        const model = window._sr.activeCharacterModel;
        const b1 = model.getObjectByName('mixamorigRightHandThumb1');
        const b2 = model.getObjectByName('mixamorigRightHandThumb2');
        const b3 = model.getObjectByName('mixamorigRightHandThumb3');
        if (b1) b1.quaternion.copy(window._thumbOverride.q1);
        if (b2) b2.quaternion.copy(window._thumbOverride.q2);
        if (b3) b3.quaternion.copy(window._thumbOverride.q3);
        model.updateMatrixWorld(true);
      })()`
    });
    await sleep(200);

    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshots/man_' + c.name + '.png', Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('MAN THUMB CANDIDATES DONE');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

