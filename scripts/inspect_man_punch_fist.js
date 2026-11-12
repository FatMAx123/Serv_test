const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_man_punch_' + Date.now());
const PORT = 9943;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
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
  await sleep(2000);

  // Switch to engi_man, weapon 'none', play 'punch' or 'attack'
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'none';
      selW.dispatchEvent(new Event('change'));
      const selA = document.getElementById('sel-animation');
      selA.value = 'punch';
      selA.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Find the frame where the right fist is formed in punch animation
  const punchBones = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const mixer = window._sr.activeMixer;
      // Pause mixer
      mixer.timeScale = 0;
      // Step through punch to find peak clenched fist (e.g. time 0.3 to 0.6s)
      let bestFist = null, maxIndexCurl = 0;
      for (let t = 0.05; t < 1.0; t += 0.05) {
        mixer.setTime(t);
        m.updateMatrixWorld(true);
        const idx1 = m.getObjectByName('mixamorigRightHandIndex1');
        const e = new THREE.Euler().setFromQuaternion(idx1.quaternion, 'XYZ');
        if (e.x > maxIndexCurl) {
          maxIndexCurl = e.x;
          const bones = {};
          m.traverse(o => {
            if (o.isBone && o.name.startsWith('mixamorigRightHand') && o.name !== 'mixamorigRightHand') {
              const bEuler = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
              bones[o.name.replace('mixamorig', '')] = {
                q: [o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w].map(v => +v.toFixed(4)),
                deg: [bEuler.x * 180 / Math.PI, bEuler.y * 180 / Math.PI, bEuler.z * 180 / Math.PI].map(v => Math.round(v))
              };
            }
          });
          bestFist = { time: t, indexCurlDeg: Math.round(maxIndexCurl * 180 / Math.PI), bones };
        }
      }
      return bestFist;
    })()`,
    returnByValue: true
  });

  console.log('Peak punch fist in model animations:');
  console.log(JSON.stringify(punchBones.result.value, null, 2));

  // Screenshot of punch fist
  await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const h = m.getObjectByName('mixamorigRightHand');
      const p = new THREE.Vector3(); h.getWorldPosition(p);
      window._sr.controls.target.copy(p);
      window._sr.camera.position.set(p.x + 0.15, p.y + 0.10, p.z + 0.45);
      window._sr.controls.update();
    })()`
  });
  await sleep(400);
  const snap = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/man_native_punch_fist.png', Buffer.from(snap.data, 'base64'));

  ws.close();
  edge.kill();
}
run().catch(console.error);

