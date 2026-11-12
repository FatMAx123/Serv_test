const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_' + Date.now());
const PORT = 9940;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + USER_DATA,
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:3000/showroom.html?v=sr-16'
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      try {
        const res = await new Promise((resolve, reject) => {
          http.get('http://127.0.0.1:' + PORT + '/json', (r) => {
            let data = '';
            r.on('data', chunk => data += chunk);
            r.on('end', () => resolve(JSON.parse(data)));
          }).on('error', reject);
        });
        if (res && res[0] && res[0].webSocketDebuggerUrl) {
          wsUrl = res[0].webSocketDebuggerUrl;
          break;
        }
      } catch (e) {}
    }

    if (!wsUrl) throw new Error('Could not get wsUrl');

    const ws = new WebSocket(wsUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const msgId = id++;
        const handler = (data) => {
          const msg = JSON.parse(data);
          if (msg.id === msgId) {
            ws.off('message', handler);
            if (msg.error) reject(msg.error);
            else resolve(msg.result);
          }
        };
        ws.on('message', handler);
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    }

    async function evaluate(expr) {
      const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      return res.result ? res.result.value : null;
    }

    async function snap(name) {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync('screenshots/' + name + '.png', Buffer.from(res.data, 'base64'));
      console.log('Saved: screenshots/' + name + '.png');
    }

    // Wait for showroom to load
    await sleep(3500);

    // Switch to Man
    await evaluate(`(function() {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
    })()`);
    await sleep(2500);

    // Set weapon apprentice_wand
    await evaluate(`(function() {
      const selWeap = document.getElementById('sel-weapon');
      selWeap.value = 'apprentice_wand';
      selWeap.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1500);

    // Frame camera on man right hand - closeup front
    await evaluate(`(function() {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorig:RightHand') ||
                   window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      const wp = new window.THREE.Vector3();
      hand.getWorldPosition(wp);
      window._sr.controls.target.copy(wp);
      window._sr.camera.position.set(wp.x + 0.35, wp.y + 0.05, wp.z + 0.45);
      window._sr.controls.update();
    })()`);
    await sleep(800);
    await snap('curr_man_fist_front');

    // Camera from side to check weapon angle and pommel
    await evaluate(`(function() {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorig:RightHand') ||
                   window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      const wp = new window.THREE.Vector3();
      hand.getWorldPosition(wp);
      window._sr.camera.position.set(wp.x + 0.6, wp.y, wp.z);
      window._sr.controls.target.copy(wp);
      window._sr.controls.update();
    })()`);
    await sleep(500);
    await snap('curr_man_fist_side');

    // Full body Idle
    await evaluate(`window._sr.setCameraPreset(0.95, 2.7, 0.15, 0.8)`);
    await sleep(500);
    await snap('curr_man_idle_full');

    // Walk animation
    await evaluate(`(function() {
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'walk';
      selAnim.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1200);
    await snap('curr_man_walk_full');

    // Now test Woman
    await evaluate(`(function() {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_woman';
      selChar.dispatchEvent(new Event('change'));
    })()`);
    await sleep(2500);

    await evaluate(`(function() {
      const selWeap = document.getElementById('sel-weapon');
      selWeap.value = 'apprentice_wand';
      selWeap.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1500);

    // Woman Idle side
    await evaluate(`(function() {
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'idle';
      selAnim.dispatchEvent(new Event('change'));
      window._sr.setCameraPreset(0.85, 2.3, 0.05, Math.PI / 2);
    })()`);
    await sleep(800);
    await snap('curr_woman_idle_side');

    // Woman Walk side
    await evaluate(`(function() {
      const selAnim = document.getElementById('sel-animation');
      selAnim.value = 'walk';
      selAnim.dispatchEvent(new Event('change'));
    })()`);
    await sleep(1200);
    await snap('curr_woman_walk_side');

    console.log('ALL SNAPSHOTS TAKEN!');
    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    edge.kill();
  }
}
run();

