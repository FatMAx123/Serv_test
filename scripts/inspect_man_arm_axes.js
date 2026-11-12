const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_arm_axes_' + Date.now());
const PORT = 9955;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 15; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) { }
    await sleep(400);
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

  // Setup Man + Apprentice Wand + Walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  await send('Runtime.evaluate', {
    expression: `window._sr.frameCamera('full');`
  });
  await sleep(300);

  // In user screenshot: timer is around 0.85s (slider near 80%, right leg back, left leg forward)
  // Let's test different rotations inside browser:
  const candidates = [
    { name: 'baseline_curr', flareZ: 5.5, twistY: 0 },
    { name: 'flare_7.5deg', flareZ: 7.5, twistY: 0 },
    { name: 'flare_9.0deg', flareZ: 9.0, twistY: 0 },
    { name: 'flare_7deg_extrot_6deg', flareZ: 7.0, twistY: -6.0 },
    { name: 'flare_8deg_extrot_8deg', flareZ: 8.0, twistY: -8.0 },
    { name: 'flare_8deg_extrot_12deg', flareZ: 8.0, twistY: -12.0 },
    { name: 'flare_9deg_extrot_10deg', flareZ: 9.0, twistY: -10.0 }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const clips = window._sr.loadedClipsList || [];
        const walkClip = clips.find(c => c.name.toLowerCase().includes('walk'));
        if (!walkClip) return;
        
        const armTrack = walkClip.tracks.find(t => t.name.includes('RightArm.quaternion'));
        if (!armTrack) return;
        if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

        const DEG2RAD = Math.PI / 180;
        const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ${c.flareZ} * DEG2RAD);
        const qTwist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ${c.twistY} * DEG2RAD);
        const qMod = qAbduct.clone().multiply(qTwist);
        const tempQ = new THREE.Quaternion();

        for (let i = 0; i < armTrack.values.length; i += 4) {
          tempQ.fromArray(armTrack._origValues, i);
          tempQ.premultiply(qMod);
          tempQ.toArray(armTrack.values, i);
        }

        const action = window._sr.activeActions['walk'];
        if (action) {
          action.reset().play();
          action.paused = true;
          action.time = 0.85;
          window._sr.activeMixer.update(0.0001);
        }
      })()`
    });
    await sleep(200);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_man_rot_${c.name}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved test_man_rot_${c.name}.png`);
  }

  edge.kill();
  console.log('DONE AXES EVAL');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
