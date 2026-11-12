const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_diag_' + Date.now());
const PORT = 9935;

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
  await sleep(1500);

  const script = `
    (() => {
      const m = window._sr.activeCharacterModel;
      const rHand = m.getObjectByName('mixamorig:RightHand') || m.getObjectByName('mixamorigRightHand');
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      const mesh = wp.children[0];

      let minP = null, maxP = null;
      mesh.traverse(o => {
        if (o.isMesh && o.geometry) {
          const pos = o.geometry.attributes.position;
          const p = new window.THREE.Vector3();
          for (let j = 0; j < pos.count; j++) {
            p.fromBufferAttribute(pos, j);
            if (!minP || p.y < minP.y) minP = p.clone();
            if (!maxP || p.y > maxP.y) maxP = p.clone();
          }
        }
      });

      const pPommelWorld = minP ? minP.clone().applyMatrix4(mesh.matrixWorld) : null;
      const pTipWorld = maxP ? maxP.clone().applyMatrix4(mesh.matrixWorld) : null;
      const pHandWorld = new window.THREE.Vector3();
      rHand.getWorldPosition(pHandWorld);

      return {
        character: window._sr.state.character,
        weapon: window._sr.state.weapon,
        meshLocalShaftYRange: minP ? [minP.y, maxP.y] : null,
        world: {
          hand: pHandWorld,
          pommel: pPommelWorld,
          tip: pTipWorld,
          vectorFromPommelToTip: pTipWorld && pPommelWorld ? pTipWorld.clone().sub(pPommelWorld) : null
        },
        weaponOrientPos: wo ? wo.position : null,
        weaponOrientRot: wo ? [wo.rotation.x, wo.rotation.y, wo.rotation.z] : null
      };
    })()
  `;

  // Check Woman
  let diag = await send('Runtime.evaluate', { expression: script, returnByValue: true });
  console.log('=== WOMAN DIAGNOSTICS ===');
  console.log(JSON.stringify(diag.result.value, null, 2));

  // Switch to Man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  diag = await send('Runtime.evaluate', { expression: script, returnByValue: true });
  console.log('=== MAN DIAGNOSTICS ===');
  console.log(JSON.stringify(diag.result.value, null, 2));

  ws.close();
  edge.kill();
}
run().catch(console.error);

