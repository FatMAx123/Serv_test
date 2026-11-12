const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9992;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_pwalk_' + Date.now())}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      tabs = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) {
          ws.off('message', h);
          res(r.result);
        }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res && res.result && res.result.value !== undefined) return res.result.value;
    if (res && res.result) return res.result;
    return res;
  }

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(res.data, 'base64'));
    console.log('Saved:', filename);
  }

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // First: Test Man Walk with fixed thumb and proper weapon grip height
  console.log('Testing Man Walk...');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  // Set man thumb quaternions & weapon position
  await evalJs(`(() => {
    const e2q = window._sr.eulerToQuat;
    const dict = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
    dict.RightHandThumb1 = e2q(40, -40, 20);
    dict.RightHandThumb2 = e2q(35, 15, 50);
    dict.RightHandThumb3 = e2q(20, 10, 40);

    // Tighter pinky/ring tips
    dict.RightHandPinky3 = e2q(65, 0, 0);
    dict.RightHandRing3 = e2q(65, 0, 0);

    // Adjusted manPos so weapon is held by wooden grip, not pommel
    window._sr.WEAPON_DEFINITIONS.apprentice_wand.manPos = [-0.005, 0.082, 0.022];

    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Let's test procedural clearance:
  // We want to test walk animation at backward swing peak and forward swing peak:
  // In the walk action:
  const clipDur = await evalJs(`window._sr.activeActions['walk'].getClip().duration`);
  console.log('Man walk duration:', clipDur);

  // Check 4 phases: t = 0.18s (backward swing), t = 0.45s (passing), t = 0.68s (forward swing), t = 0.95s
  const phases = [
    { name: 'man_walk_t_018_back', t: 0.18 },
    { name: 'man_walk_t_045_mid', t: 0.45 },
    { name: 'man_walk_t_068_fwd', t: 0.68 },
    { name: 'man_walk_t_095_mid', t: 0.95 }
  ];

  for (const p of phases) {
    await evalJs(`(() => {
      window._sr.activeMixer.timeScale = 0;
      window._sr.activeMixer.setTime(${p.t});
      window._sr.activeMixer.update(0);
      window._sr.activeCharacterModel.updateMatrixWorld(true);
      window._sr.setCameraPreset(0.85, 2.5, 0.08, Math.PI * 0.5);
    })()`);
    await sleep(200);
    await snap(`${p.name}_side.png`);

    await evalJs(`window._sr.setCameraPreset(0.85, 2.5, 0.08, 0.0);`);
    await sleep(100);
    await snap(`${p.name}_front.png`);
  }

  // Now test Woman Walk
  console.log('Testing Woman Walk...');
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  const womanDur = await evalJs(`window._sr.activeActions['walk'].getClip().duration`);
  console.log('Woman walk duration:', womanDur);

  const womanPhases = [
    { name: 'woman_walk_t_025', t: womanDur * 0.25 },
    { name: 'woman_walk_t_050', t: womanDur * 0.50 },
    { name: 'woman_walk_t_075', t: womanDur * 0.75 }
  ];

  for (const p of womanPhases) {
    await evalJs(`(() => {
      window._sr.activeMixer.timeScale = 0;
      window._sr.activeMixer.setTime(${p.t});
      window._sr.activeMixer.update(0);
      window._sr.activeCharacterModel.updateMatrixWorld(true);
      window._sr.setCameraPreset(0.52, 2.0, 0.08, Math.PI * 0.5);
    })()`);
    await sleep(200);
    await snap(`${p.name}_side.png`);

    await evalJs(`window._sr.setCameraPreset(0.52, 2.0, 0.08, 0.0);`);
    await sleep(100);
    await snap(`${p.name}_front.png`);
  }

  ws.close();
  edge.kill();
  console.log('Walk clearance tests complete!');
}

main().catch(console.error);

