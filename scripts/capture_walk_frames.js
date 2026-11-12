const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_walk_inspect_' + Date.now());
const PORT = 9916;

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

  await send('Runtime.evaluate', {
    expression: "document.getElementById('ui-overlay').style.display = 'none';"
  });

  // Switch to engi_man, apprentice_wand, walk
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Set pos
  await send('Runtime.evaluate', {
    expression: `(() => {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      let scaleInv = 1.0;
      if (hand) {
        const s = new THREE.Vector3();
        hand.getWorldScale(s);
        const maxS = Math.max(s.x, s.y, s.z);
        if (maxS > 1e-5) scaleInv = 1.0 / maxS;
      }
      window._sr.weaponOrient.position.set(0.010 * scaleInv, 0.075 * scaleInv, 0.020 * scaleInv);
      const sel = document.getElementById('sel-animation');
      sel.value = 'walk';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(500);

  // Sample walk at 4 keyframes: 0.1s, 0.35s, 0.6s, 0.85s
  const times = [0.1, 0.35, 0.6, 0.85];
  for (const t of times) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        action.time = ${t};
        window._sr.activeMixer.update(0);
        window._sr.state.animPaused = true;
      })()`
    });
    await sleep(150);

    // Profile view
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.0, 2.7, 0.05, -1.57, 0, 0);"
    });
    await sleep(150);
    let s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/walk_t_${Math.round(t*100)}_profile.png`, Buffer.from(s.data, 'base64'));

    // Front view
    await send('Runtime.evaluate', {
      expression: "window._sr.setCameraPreset(1.0, 2.7, 0.05, 0, 0, 0);"
    });
    await sleep(150);
    s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/walk_t_${Math.round(t*100)}_front.png`, Buffer.from(s.data, 'base64'));
  }

  edge.kill();
  console.log('WALK FRAMES CAPTURED');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

