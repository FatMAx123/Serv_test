const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_hand_worldpos_' + Date.now());
const PORT = 9995;

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

  // Switch to engi_man, apprentice_wand, hide UI overlay
  const info = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      document.getElementById('ui-overlay').style.display = 'none';
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      window._sr.state.animPaused = true;
      return true;
    })()`
  });
  await sleep(2500);

  const handPos = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      const wp = new THREE.Vector3();
      hand.getWorldPosition(wp);
      return { x: wp.x, y: wp.y, z: wp.z };
    })()`
  });
  console.log('RightHand WorldPos:', handPos.result.value);

  // Now focus camera on RightHand WorldPos!
  const hp = handPos.result.value;
  // Let's test camera pointing at (hp.x, hp.y, hp.z) with radius 0.65
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._sr.setCameraPreset(0.65, ${hp.y}, ${hp.z}, -0.5, -0.2, ${hp.x});
    })()`
  });
  await sleep(300);

  let s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/righthand_focused.png', Buffer.from(s.data, 'base64'));

  edge.kill();
  console.log('FOCUSED SCREENSHOT SAVED');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

