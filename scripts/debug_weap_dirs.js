const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_debug_weap_' + Date.now());
const PORT = 9997;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function req(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
}

async function run() {
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
  await sleep(1500);

  async function checkWeapon(char, weap) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const chk = document.getElementById('chk-bone-helpers');
        if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
        const selChar = document.getElementById('sel-character');
        selChar.value = '${char}';
        selChar.dispatchEvent(new Event('change'));
        const selW = document.getElementById('sel-weapon');
        selW.value = '${weap}';
        selW.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(1200);

    const res = await send('Runtime.evaluate', {
      expression: `(() => {
        try {
          const model = window._sr.activeCharacterModel;
          if (!model) return { error: 'no model' };
          const wMesh = window._sr.weaponPivot ? window._sr.weaponPivot.children[0] : null;
          if (!wMesh) return { error: 'no weapon mesh' };
          wMesh.updateMatrixWorld(true);
          const hand = model.getObjectByName('mixamorig:RightHand') ||
                       model.getObjectByName('mixamorigRightHand') ||
                       model.getObjectByName('RightHand');
          if (!hand) return { error: 'no hand bone' };
          const hPos = new THREE.Vector3();
          hand.getWorldPosition(hPos);

          const vertices = [];
          wMesh.traverse(o => {
            if (o.isMesh && o.geometry) {
              const pos = o.geometry.attributes.position;
              const p = new THREE.Vector3();
              for (let i = 0; i < pos.count; i += 20) {
                p.fromBufferAttribute(pos, i);
                p.applyMatrix4(o.matrixWorld);
                vertices.push(p.clone());
              }
            }
          });

          let maxDist = 0;
          let headPos = null;
          for (const v of vertices) {
            const d = v.distanceTo(hPos);
            if (d > maxDist) {
              maxDist = d;
              headPos = v;
            }
          }

          const dir = headPos ? headPos.clone().sub(hPos).normalize() : null;
          return {
            char: '${char}',
            weap: '${weap}',
            handPos: [hPos.x, hPos.y, hPos.z].map(v => +v.toFixed(3)),
            headPos: headPos ? [headPos.x, headPos.y, headPos.z].map(v => +v.toFixed(3)) : null,
            dirFromHand: dir ? [dir.x, dir.y, dir.z].map(v => +v.toFixed(3)) : null,
            angleFromGroundDeg: dir ? +(Math.asin(Math.abs(dir.y)) * 180 / Math.PI).toFixed(1) : null,
            forwardZ: dir ? +dir.z.toFixed(3) : null
          };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      returnByValue: true
    });

    // Profile screenshot
    await send('Runtime.evaluate', {
      expression: `(() => {
        window._sr.setCameraPreset(2.3, 0.95, -Math.PI / 2, 0, 0, 0);
      })()`
    });
    await sleep(200);
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/test_${char}_${weap}_side.png`, Buffer.from(snap.data, 'base64'));

    return res.result.value;
  }

  const weapons = ['apprentice_wand', 'atuba_mace', 'tears_fairy', 'demon_staff'];
  console.log('=== WOMAN WEAPONS ===');
  for (const w of weapons) {
    console.log(await checkWeapon('engi_woman', w));
  }

  console.log('=== MAN WEAPONS ===');
  for (const w of weapons) {
    console.log(await checkWeapon('engi_man', w));
  }

  ws.close();
  edge.kill();
}

run().catch(console.error);
