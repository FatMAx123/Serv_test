const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_inspect_setup_' + Date.now());
const PORT = 9964;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);
  await sleep(3000);

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

  // Turn off bone helpers & set woman with apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(1500);

  const womanInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorig:RightHand');
      const hips = m.getObjectByName('mixamorig:Hips');
      const head = m.getObjectByName('mixamorig:Head');
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      const mesh = wp ? wp.children[0] : null;

      const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
      const pHips = new THREE.Vector3(); hips.getWorldPosition(pHips);
      const pHead = new THREE.Vector3(); head.getWorldPosition(pHead);

      // Weapon tip position
      let pTip = pHand.clone(), maxD = 0;
      if (mesh) {
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
      }

      const wandDir = pTip.clone().sub(pHand).normalize();
      const wandLen = pTip.distanceTo(pHand);
      return {
        pHips: [pHips.x, pHips.y, pHips.z].map(v => +v.toFixed(3)),
        pHead: [pHead.x, pHead.y, pHead.z].map(v => +v.toFixed(3)),
        pHand: [pHand.x, pHand.y, pHand.z].map(v => +v.toFixed(3)),
        pTip: [pTip.x, pTip.y, pTip.z].map(v => +v.toFixed(3)),
        wandDir: [wandDir.x, wandDir.y, wandDir.z].map(v => +v.toFixed(3)),
        wandLen: +wandLen.toFixed(3),
        facingZ: pHead.z > pHips.z ? 'towards +Z' : 'towards -Z'
      };
    })()`,
    returnByValue: true
  });

  console.log('WOMAN current in showroom:');
  console.log(womanInfo.result.value);

  // Switch to engi_man
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selC = document.getElementById('sel-character');
      selC.value = 'engi_man';
      selC.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
      if (window._sr.activeMixer) window._sr.activeMixer.timeScale = 0;
    })()`
  });
  await sleep(2500);

  const manInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const m = window._sr.activeCharacterModel;
      const hand = m.getObjectByName('mixamorigRightHand');
      const hips = m.getObjectByName('mixamorigHips');
      const head = m.getObjectByName('mixamorigHead');
      const wo = window._sr.weaponOrient;
      const wp = window._sr.weaponPivot;
      const mesh = wp ? wp.children[0] : null;

      const pHand = new THREE.Vector3(); hand.getWorldPosition(pHand);
      const pHips = new THREE.Vector3(); hips.getWorldPosition(pHips);
      const pHead = new THREE.Vector3(); head.getWorldPosition(pHead);

      let pTip = pHand.clone(), maxD = 0;
      if (mesh) {
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
      }

      const wandDir = pTip.clone().sub(pHand).normalize();
      const wandLen = pTip.distanceTo(pHand);
      return {
        pHips: [pHips.x, pHips.y, pHips.z].map(v => +v.toFixed(3)),
        pHead: [pHead.x, pHead.y, pHead.z].map(v => +v.toFixed(3)),
        pHand: [pHand.x, pHand.y, pHand.z].map(v => +v.toFixed(3)),
        pTip: [pTip.x, pTip.y, pTip.z].map(v => +v.toFixed(3)),
        wandDir: [wandDir.x, wandDir.y, wandDir.z].map(v => +v.toFixed(3)),
        wandLen: +wandLen.toFixed(3),
        facingZ: pHead.z > pHips.z ? 'towards +Z' : 'towards -Z'
      };
    })()`,
    returnByValue: true
  });

  console.log('MAN current in showroom:');
  console.log(manInfo.result.value);

  ws.close();
  edge.kill();
}

run().catch(console.error);

