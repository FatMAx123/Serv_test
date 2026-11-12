const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9935',
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge_eval_' + Date.now()),
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  await new Promise(r => setTimeout(r, 3500));
  const tabs = await new Promise(res => http.get('http://127.0.0.1:9935/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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

  // Wait for _sr
  await send('Runtime.evaluate', {
    expression: `new Promise((resolve) => {
      const check = () => {
        if (window._sr && window._sr.activeCharacterModel) resolve(true);
        else setTimeout(check, 100);
      };
      check();
    })`,
    awaitPromise: true
  });
  console.log('Showroom ready.');

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(ARTIFACTS_DIR, filename);
    fs.writeFileSync(p, Buffer.from(res.data, 'base64'));
    console.log('Saved:', filename);
  }

  // 1. Man in Idle - Full body & Fist closeup
  console.log('Inspecting Man Idle...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  // Man Idle Front
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.2, Math.PI / 2.05, 0)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_man_idle_front.png');

  // Man Idle Right Flank (side view)
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.2, Math.PI / 2.05, Math.PI * 0.5)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_man_idle_side.png');

  // Man Idle Hand closeup (looking straight at right hand)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorig:RightHand') ||
                   window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      const wp = new THREE.Vector3();
      hand.getWorldPosition(wp);
      window._sr.controls.target.copy(wp);
      window._sr.camera.position.set(wp.x + 0.35, wp.y - 0.05, wp.z + 0.45);
      window._sr.controls.update();
    })()`
  });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_man_hand_closeup.png');

  // 2. Woman in Idle - Side view & Iso view
  console.log('Inspecting Woman Idle...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));

  // Woman Idle Side View (looking from right side, facing right)
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.2, Math.PI / 2.05, Math.PI * 0.5)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_woman_idle_side.png');

  // Woman Idle Front/Iso
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.2, Math.PI / 2.05, 0.4)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_woman_idle_iso.png');

  // 3. Woman in Walk - let's inspect the arm flaring and movement
  console.log('Inspecting Woman Walk...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selA = document.getElementById('sel-animation');
      for (let opt of selA.options) {
        if (opt.value.toLowerCase().includes('walk') || opt.text.toLowerCase().includes('шаг')) {
          selA.value = opt.value;
          selA.dispatchEvent(new Event('change'));
          break;
        }
      }
      window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, 0);
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));
  await snap('eval_woman_walk_front.png');

  // Woman walk side
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, Math.PI * 0.5)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_woman_walk_side.png');

  // 4. Man in Walk - let's inspect arm and weapon clearance
  console.log('Inspecting Man Walk...');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      for (let opt of selA.options) {
        if (opt.value.toLowerCase().includes('walk') || opt.text.toLowerCase().includes('шаг')) {
          selA.value = opt.value;
          selA.dispatchEvent(new Event('change'));
          break;
        }
      }
      window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, 0);
    })()`
  });
  await new Promise(r => setTimeout(r, 2000));
  await snap('eval_man_walk_front.png');

  // Man walk side
  await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, Math.PI * 0.5)` });
  await new Promise(r => setTimeout(r, 500));
  await snap('eval_man_walk_side.png');

  ws.close();
  edge.kill();
  console.log('All evaluations complete!');
}

main().catch(console.error);

