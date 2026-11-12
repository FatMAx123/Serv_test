const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9982;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_tg_' + Date.now())}`,
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
    } catch (_) { }
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

  // Load man + apprentice_wand
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Position camera right at man's right hand (focus on fist & thumb)
  await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const hand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.setCameraPreset(wp.y, 0.40, 0.08, -0.45, wp.x, wp.z);
  })()`);
  await sleep(600);
  await snap('tune_thumb_baseline.png');

  // Test shifting the weapon along the grip!
  // In WEAPON_DEFINITIONS.apprentice_wand.manPos:
  // Currently [-0.005, 0.055, 0.022].
  // Let's see which axis shifts the weapon up/down along the wooden shaft!
  for (const shift of [-0.08, -0.04, 0.04, 0.08]) {
    await evalJs(`(() => {
      // In weaponOrient, let's test shifting local Y or Z:
      window._sr.weaponPivot.position.set(0, 0, ${shift});
      window._sr.weaponPivot.updateMatrix();
    })()`);
    await sleep(150);
    await snap(`tune_shift_pivot_z_${shift > 0 ? 'pos' : 'neg'}_${Math.abs(Math.round(shift * 100))}.png`);
  }

  // Also test shifting weaponPivot.position.y:
  for (const shift of [-0.08, 0.08]) {
    await evalJs(`(() => {
      window._sr.weaponPivot.position.set(0, ${shift}, 0);
      window._sr.weaponPivot.updateMatrix();
    })()`);
    await sleep(150);
    await snap(`tune_shift_pivot_y_${shift > 0 ? 'pos' : 'neg'}_${Math.abs(Math.round(shift * 100))}.png`);
  }

  // Reset weaponPivot
  await evalJs(`window._sr.weaponPivot.position.set(0, 0, 0); window._sr.weaponPivot.updateMatrix();`);

  // Now test candidate thumb rotations!
  // In candidate poses:
  const thumbCandidates = [
    {
      name: 'curl_fold_down',
      // Pitch thumb down across palm:
      t1: [45, -20, 10],
      t2: [45, 10, 40],
      t3: [30, 0, 30]
    },
    {
      name: 'curl_natural_boxer',
      t1: [35, -35, 15],
      t2: [40, 15, 45],
      t3: [25, 5, 35]
    },
    {
      name: 'curl_deep_wrap',
      t1: [55, -25, -10],
      t2: [50, 0, 35],
      t3: [35, 0, 25]
    },
    {
      name: 'curl_l2_warrior',
      t1: [40, -40, 20],
      t2: [35, 15, 50],
      t3: [20, 10, 40]
    },
    {
      name: 'curl_across_palm',
      t1: [25, -55, 30],
      t2: [30, 20, 45],
      t3: [15, 10, 35]
    }
  ];

  for (const c of thumbCandidates) {
    await evalJs(`(() => {
      const e2q = window._sr.eulerToQuat;
      const dict = window._sr.LOCKED_FIST_QUATERNIONS_MAN;
      dict.RightHandThumb1 = e2q(${c.t1[0]}, ${c.t1[1]}, ${c.t1[2]});
      dict.RightHandThumb2 = e2q(${c.t2[0]}, ${c.t2[1]}, ${c.t2[2]});
      dict.RightHandThumb3 = e2q(${c.t3[0]}, ${c.t3[1]}, ${c.t3[2]});
    })()`);
    await sleep(200);
    await snap(`cand_${c.name}.png`);
  }

  ws.close();
  edge.kill();
  console.log('Tune thumb grid finished!');
}

main().catch(console.error);
