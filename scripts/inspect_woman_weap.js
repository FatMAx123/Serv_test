const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_woman2_' + Date.now());
const PORT = 9962;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
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
  await sleep(2500);

  // Select weapon apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m ? (m.getObjectByName('mixamorig:RightHand') || m.getObjectByName('mixamorigRightHand')) : null;
      const wp = window._sr.weaponPivot;
      const wo = window._sr.weaponOrient;
      const mesh = wp ? wp.children[0] : null;
      if (!hand || !wp || !wo || !mesh) return { error: 'no objects', hasHand: !!hand, hasMesh: !!mesh };

      const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
      let pTip = pHand.clone(), maxD = 0;
      mesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          const p = new THREE.Vector3();
          for (let i = 0; i < pos.count; i += 20) {
            p.fromBufferAttribute(pos, i);
            p.applyMatrix4(o.matrixWorld);
            const d = p.distanceTo(pHand);
            if (d > maxD) { maxD = d; pTip = p.clone(); }
          }
        }
      });
      const wandDir = pTip.clone().sub(pHand).normalize();
      const wandLen = pTip.distanceTo(pHand);
      const angleFromGround = Math.asin(Math.abs(wandDir.y)) * 180 / Math.PI;
      return {
        pHand: [pHand.x, pHand.y, pHand.z].map(v => +v.toFixed(3)),
        pTip: [pTip.x, pTip.y, pTip.z].map(v => +v.toFixed(3)),
        wandDir: [wandDir.x, wandDir.y, wandDir.z].map(v => +v.toFixed(3)),
        wandLen: +wandLen.toFixed(3),
        pointingZ: wandDir.z > 0 ? 'FORWARD (+Z)' : 'BACKWARD (-Z)',
        pointingX: wandDir.x > 0 ? 'LEFT / INWARD (+X)' : 'RIGHT / OUTWARD (-X)',
        angleFromGroundDeg: +angleFromGround.toFixed(1)
      };
    })()`,
    returnByValue: true
  });

  console.log('WOMAN apprentice_wand result:');
  console.log(res.result.value);

  ws.close();
  edge.kill();
}
run().catch(console.error);
