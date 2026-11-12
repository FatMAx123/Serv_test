const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_dump_' + Date.now());
const PORT = 9990;

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

  // Select man engineer and apprentice wand
  await send('Runtime.evaluate', {
    expression: "(() => { const selChar = document.getElementById('sel-character'); selChar.value = 'engi_man'; selChar.dispatchEvent(new Event('change')); })()"
  });
  await sleep(2500);

  // Dump all objects in activeCharacterModel
  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const model = window._sr.activeCharacterModel;
      const list = [];
      model.traverse(o => {
        list.push({
          name: o.name,
          type: o.type,
          isMesh: !!o.isMesh,
          visible: o.visible,
          parent: o.parent ? o.parent.name : null,
          geomVerts: (o.isMesh && o.geometry) ? o.geometry.attributes.position.count : 0
        });
      });
      return JSON.stringify(list, null, 2);
    })()`
  });

  fs.writeFileSync('scratch/man_objects_dump.json', res.result.value);

  // Check what happens when updateHandGrip runs on man:
  const handCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const model = window._sr.activeCharacterModel;
      const bones = {};
      const thumbBones = ['RightHandThumb1', 'RightHandThumb2', 'RightHandThumb3'];
      thumbBones.forEach(b => {
        const obj = model.getObjectByName('mixamorig:' + b) || model.getObjectByName(b);
        if (obj) {
          bones[b] = {
            rot: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
            quat: [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w]
          };
        }
      });
      return JSON.stringify(bones, null, 2);
    })()`
  });

  fs.writeFileSync('scratch/man_thumb_bones.json', handCheck.result.value);

  edge.kill();
  console.log('DUMP DONE');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

