const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_fist_opt_' + Date.now());
const PORT = 9984;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Edge connection failed');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
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

  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  const options = [
    {
      name: 'opt_A_native_with_curl_thumb',
      setup: `(() => {
        const e2q = window._sr.eulerToQuat;
        const d = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
        d.RightHandThumb1 = e2q(40, -40, 20);
        d.RightHandThumb2 = e2q(35, 15, 50);
        d.RightHandThumb3 = e2q(20, 10, 40);
      })()`
    },
    {
      name: 'opt_B_woman_fist_on_man',
      setup: `(() => {
        const d = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
        const w = window._sr.LOCKED_FIST_QUATERNIONS_WOMAN;
        Object.assign(d, w);
        // tweak thumb slightly for man broader palm
        const e2q = window._sr.eulerToQuat;
        d.RightHandThumb1 = e2q(35, -42, 25);
        d.RightHandThumb2 = e2q(30, 15, 45);
        d.RightHandThumb3 = e2q(15, 5, 35);
      })()`
    },
    {
      name: 'opt_C_solid_closed_fist',
      setup: `(() => {
        const e2q = window._sr.eulerToQuat;
        const d = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
        d.RightHandIndex1 = e2q(65, 0, -3);
        d.RightHandIndex2 = e2q(85, 0, 0);
        d.RightHandIndex3 = e2q(70, 0, 0);

        d.RightHandMiddle1 = e2q(70, 0, 0);
        d.RightHandMiddle2 = e2q(90, 0, 0);
        d.RightHandMiddle3 = e2q(70, 0, 0);

        d.RightHandRing1 = e2q(75, 0, 2);
        d.RightHandRing2 = e2q(90, 0, 0);
        d.RightHandRing3 = e2q(70, 0, 0);

        d.RightHandPinky1 = e2q(75, 0, 5);
        d.RightHandPinky2 = e2q(90, 0, 0);
        d.RightHandPinky3 = e2q(70, 0, 0);

        d.RightHandThumb1 = e2q(30, -45, 25);
        d.RightHandThumb2 = e2q(35, 12, 45);
        d.RightHandThumb3 = e2q(20, 8, 38);
      })()`
    }
  ];

  for (const opt of options) {
    await send('Runtime.evaluate', { expression: opt.setup });
    await sleep(250);

    // Front-ish 3/4 camera
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
        const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
        window._sr.setCameraPreset(wp.y, 0.45, 0.08, -0.45, wp.x, wp.z);
      })()`
    });
    await sleep(200);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${opt.name}_3q.png`, Buffer.from(s.data, 'base64'));

    // Front view (like user image 7)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
        const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
        window._sr.setCameraPreset(wp.y, 0.45, 0.08, 0.05, wp.x, wp.z);
      })()`
    });
    await sleep(200);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${opt.name}_front.png`, Buffer.from(s.data, 'base64'));

    // Side view (like user image 5 & 6)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window._sr.activeCharacterModel;
        const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
        const wp = new THREE.Vector3(); hand.getWorldPosition(wp);
        window._sr.setCameraPreset(wp.y, 0.45, 0.08, -Math.PI * 0.5, wp.x, wp.z);
      })()`
    });
    await sleep(200);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/fist_${opt.name}_side.png`, Buffer.from(s.data, 'base64'));
    console.log(`Saved fist_${opt.name}`);
  }

  edge.kill();
  console.log('DONE FIST TEST');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

