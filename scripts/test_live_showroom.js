const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';

async function test() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9940',
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge_test_' + Date.now()),
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  await new Promise(r => setTimeout(r, 3000));
  const tabs = await new Promise(res => http.get('http://127.0.0.1:9940/json/list', r => {
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
  await new Promise(r => setTimeout(r, 2000));

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

  // Check initial state
  const initInfo = await evalJs(`(() => {
    return {
      char: window._sr.state.character,
      weapon: window._sr.state.weapon,
      weaponRootChildren: window._sr.weaponRoot.children.length,
      hasCharModel: !!window._sr.activeCharacterModel,
      activeWeaponMesh: !!window._sr.activeWeaponMesh
    };
  })()`);
  console.log('Initial state:', initInfo);

  // Set woman + apprentice_wand
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman';
    selC.dispatchEvent(new Event('change'));
  })()`);
  await new Promise(r => setTimeout(r, 2500));

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  const womanInfo = await evalJs(`(() => {
    return {
      char: window._sr.state.character,
      weapon: window._sr.state.weapon,
      weaponRootChildren: window._sr.weaponRoot.children.length,
      weaponParent: window._sr.weaponRoot.parent ? window._sr.weaponRoot.parent.name : null,
      activeWeaponMesh: !!window._sr.activeWeaponMesh,
      activeWeaponVisible: window._sr.activeWeaponMesh ? window._sr.activeWeaponMesh.visible : false
    };
  })()`);
  console.log('Woman weapon state:', womanInfo);

  // Take side snapshot of woman
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    window._sr.setCameraPreset(0.85, 2.5, Math.PI / 2.05, Math.PI * 0.5);
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await snap('test_woman_side_actual.png');

  // Now set Man + apprentice_wand
  await evalJs(`(() => {
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man';
    selC.dispatchEvent(new Event('change'));
  })()`);
  await new Promise(r => setTimeout(r, 2500));

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
  })()`);
  await new Promise(r => setTimeout(r, 2000));

  const manInfo = await evalJs(`(() => {
    return {
      char: window._sr.state.character,
      weapon: window._sr.state.weapon,
      weaponRootChildren: window._sr.weaponRoot.children.length,
      weaponParent: window._sr.weaponRoot.parent ? window._sr.weaponRoot.parent.name : null,
      activeWeaponMesh: !!window._sr.activeWeaponMesh
    };
  })()`);
  console.log('Man weapon state:', manInfo);

  // Take Man full snapshot and fist closeup
  await evalJs(`(() => {
    window._sr.setCameraPreset(0.85, 2.2, Math.PI / 2.05, 0.0);
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await snap('test_man_front_actual.png');

  // Closeup of man right fist
  await evalJs(`(() => {
    const hand = window._sr.activeCharacterModel.getObjectByName('mixamorig:RightHand') ||
                 window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
    const wp = new THREE.Vector3();
    hand.getWorldPosition(wp);
    window._sr.controls.target.copy(wp);
    window._sr.camera.position.set(wp.x + 0.25, wp.y - 0.02, wp.z + 0.35);
    window._sr.controls.update();
  })()`);
  await new Promise(r => setTimeout(r, 500));
  await snap('test_man_fist_actual.png');

  ws.close();
  edge.kill();
  console.log('Done test!');
}

test().catch(console.error);
