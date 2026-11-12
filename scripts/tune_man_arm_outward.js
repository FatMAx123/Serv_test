const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_arm_out_' + Date.now());
const PORT = 9945;

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
    } catch (_) {}
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
      window._sr.frameCamera('full');
    })()`
  });
  await sleep(2000);

  // The user's exact camera perspective is Full view:
  // Let's test different outward rotations for the man's arm:
  // In Mixamo rig:
  // mixamorig:RightArm:
  // What rotates the arm outward?
  // Let's test:
  // 1. Z abduction: 7.5 deg, 9.5 deg, 11.5 deg
  // 2. Outward rotation around local bone axis (Y) or shoulder Z
  // 3. RightForeArm outward twist? Or RightArm?
  
  const options = [
    { name: 'opt1_abduct_8deg', armZ: 8.0, armY: 0, armX: 0 },
    { name: 'opt2_abduct_10deg', armZ: 10.0, armY: 0, armX: 0 },
    { name: 'opt3_abduct_12deg', armZ: 12.0, armY: 0, armX: 0 },
    { name: 'opt4_abduct_9deg_extrot_6deg', armZ: 9.0, armY: -6.0, armX: 0 },
    { name: 'opt5_abduct_9deg_extrot_plus6deg', armZ: 9.0, armY: 6.0, armX: 0 },
    { name: 'opt6_abduct_10deg_roll_minus6deg', armZ: 10.0, armY: 0, armX: -6.0 },
    { name: 'opt7_abduct_10deg_roll_plus6deg', armZ: 10.0, armY: 0, armX: 6.0 }
  ];

  for (const opt of options) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const clips = window._sr.loadedClipsList || [];
        const walkClip = clips.find(c => c.name.toLowerCase().includes('walk') || c.name.includes('mixamo.com.002'));
        if (!walkClip) return;
        
        const armTrack = walkClip.tracks.find(t => t.name.includes('RightArm.quaternion'));
        if (!armTrack) return;
        if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

        const DEG2RAD = Math.PI / 180;
        const euler = new THREE.Euler(${opt.armX} * DEG2RAD, ${opt.armY} * DEG2RAD, ${opt.armZ} * DEG2RAD, 'XYZ');
        const qMod = new THREE.Quaternion().setFromEuler(euler);
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
          // Exact time matching user screenshot (arm swung back)
          action.time = 0.82;
          window._sr.activeMixer.update(0.0001);
        }
      })()`
    });
    await sleep(200);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/man_arm_${opt.name}.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved man_arm_${opt.name}.png`);
  }

  edge.kill();
  console.log('DONE MAN ARM TUNE');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

