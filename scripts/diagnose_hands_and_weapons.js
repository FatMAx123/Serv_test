const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_diag_' + Date.now());
const PORT = 9919;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html?v=diag_' + Date.now()
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

  async function takeSnap(filename) {
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(__dirname, '..', 'screenshots', filename);
    fs.writeFileSync(p, Buffer.from(snap.data, 'base64'));
    console.log(`Saved screenshot: ${p}`);
    return p;
  }

  // 1. Check Woman Idle with Apprentice Wand
  console.log('Testing Woman Idle with apprentice_wand...');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman';
    selC.dispatchEvent(new Event('change'));
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand';
    selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle';
    selA.dispatchEvent(new Event('change'));
    window._sr.frameCamera('full');
    window._sr.camera.position.set(-2.2, 0.95, 0.1);
    window._sr.controls.target.set(0, 0.95, 0);
    window._sr.controls.update();
  })()`);
  await sleep(2500);
  await takeSnap('diag_woman_idle_side_current.png');

  // Let's get the world position and forward vector of the weapon in woman's hand
  const womanWeapInfo = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const w = window._sr.weaponRoot;
    const orient = m.getObjectByName('char_weapon_orient');
    return {
      char: window._sr.state.character,
      weapPos: orient ? [orient.position.x, orient.position.y, orient.position.z] : null,
      weapRot: orient ? [orient.rotation.x, orient.rotation.y, orient.rotation.z] : null,
    };
  })()`);
  console.log('Woman weapon info:', womanWeapInfo);

  // 2. Check Man Hand in Idle
  console.log('Testing Man Hand in Idle...');
  await evalJs(`(() => {
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
  await takeSnap('diag_man_hand_current.png');

  ws.close();
  edge.kill();
}

run().catch(console.error);

