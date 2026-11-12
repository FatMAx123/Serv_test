const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function run() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9933',
    '--user-data-dir=' + path.join(os.tmpdir(), 'edge_inspect_' + Date.now()),
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  await new Promise(r => setTimeout(r, 3000));
  const tabs = await new Promise(res => http.get('http://127.0.0.1:9933/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) {
          ws.off('message', h);
          res(r.result);
        }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1000));

  // Let's inspect active character, bones, and current code state
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const char = window._sr.activeCharacterModel;
      if (!char) return { error: 'No active character' };
      const bones = [];
      char.traverse(o => {
        if (o.isBone || o.type === 'Bone') {
          bones.push({ name: o.name, pos: [o.position.x, o.position.y, o.position.z], rot: [o.rotation.x, o.rotation.y, o.rotation.z] });
        }
      });
      return {
        charName: char.name,
        boneCount: bones.length,
        armBone: char.getObjectByName('mixamorig:RightArm')?.name,
        foreArm: char.getObjectByName('mixamorig:RightForeArm')?.name,
        handBone: char.getObjectByName('mixamorig:RightHand')?.name,
        thumb1: char.getObjectByName('mixamorig:RightHandThumb1')?.name,
        clips: window._sr.loadedClipsList || []
      };
    })()`,
    returnByValue: true
  });

  console.log('Rig info:', JSON.stringify(evalRes.result?.value, null, 2));

  ws.close();
  edge.kill();
}

run().catch(console.error);

