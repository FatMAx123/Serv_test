const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_test_thumb_opt_' + Date.now());
const PORT = 9335;
const BRAIN_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          resolve(resp.result);
        }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html?v=' + Date.now() });
  await sleep(4000);

  // Turn off bone helpers & select apprentice wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const tt = document.getElementById('chk-turntable');
      if (tt && tt.checked) { tt.checked = false; tt.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      if (selW) { selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change')); }
      window._sr.state.animPaused = true;
    })()`
  });
  await sleep(2000);

  // Test thumb configs
  const thumbTests = [
    {
      name: 'thumb_wrap_A',
      t1: `t1.rotateX(0.40); t1.rotateY(-0.35); t1.rotateZ(0.50);`,
      t2: `t2.rotateX(0.50); t2.rotateZ(0.40);`,
      t3: `t3.rotateX(0.50);`
    },
    {
      name: 'thumb_wrap_B',
      t1: `t1.rotateX(0.25); t1.rotateY(-0.55); t1.rotateZ(0.65);`,
      t2: `t2.rotateZ(0.70); t2.rotateX(0.35);`,
      t3: `t3.rotateZ(0.60);`
    },
    {
      name: 'thumb_wrap_C',
      t1: `t1.rotateY(-0.65); t1.rotateX(0.35); t1.rotateZ(0.45);`,
      t2: `t2.rotateX(0.60); t2.rotateY(0.20);`,
      t3: `t3.rotateX(0.50);`
    }
  ];

  for (const tt of thumbTests) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const model = sr.activeCharacterModel;
        
        // Reset and apply finger curl with rotateX
        const fingers = ['Index', 'Middle', 'Ring', 'Pinky'];
        fingers.forEach((f, idx) => {
          const b1 = model.getObjectByName('mixamorigRightHand' + f + '1') || model.getObjectByName('mixamorig:RightHand' + f + '1');
          const b2 = model.getObjectByName('mixamorigRightHand' + f + '2') || model.getObjectByName('mixamorig:RightHand' + f + '2');
          const b3 = model.getObjectByName('mixamorigRightHand' + f + '3') || model.getObjectByName('mixamorig:RightHand' + f + '3');
          if (b1) { b1.rotateX(0.65 + idx * 0.04); if (f === 'Index') b1.rotateZ(-0.05); }
          if (b2) { b2.rotateX(0.90 + idx * 0.03); }
          if (b3) { b3.rotateX(0.75); }
        });

        const t1 = model.getObjectByName('mixamorigRightHandThumb1') || model.getObjectByName('mixamorig:RightHandThumb1');
        const t2 = model.getObjectByName('mixamorigRightHandThumb2') || model.getObjectByName('mixamorig:RightHandThumb2');
        const t3 = model.getObjectByName('mixamorigRightHandThumb3') || model.getObjectByName('mixamorig:RightHandThumb3');
        if (t1) { ${tt.t1} }
        if (t2) { ${tt.t2} }
        if (t3) { ${tt.t3} }
      })()`
    });

    // 1. View from right side
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(0.95, 0.40, 0.05, 1.57, -0.24, 0.02);
      })()`
    });
    await sleep(400);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    let localPath = `screenshots/${tt.name}_side.png`;
    fs.writeFileSync(localPath, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(localPath, path.join(BRAIN_DIR, `${tt.name}_side.png`));

    // 2. View from rear-right (user screenshot 5 angle!)
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(0.95, 0.40, 0.05, 2.35, -0.24, 0.02);
      })()`
    });
    await sleep(400);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    localPath = `screenshots/${tt.name}_rear.png`;
    fs.writeFileSync(localPath, Buffer.from(shot.data, 'base64'));
    fs.copyFileSync(localPath, path.join(BRAIN_DIR, `${tt.name}_rear.png`));
    console.log(`Saved ${tt.name} shots`);
  }

  ws.close();
  edge.kill();
}

main().catch(console.error);

