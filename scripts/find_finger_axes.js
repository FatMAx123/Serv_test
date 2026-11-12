const fs = require('fs');

// We can load woman.glb or run in Edge to inspect the local bone matrix
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function testAxes() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9280',
    '--headless=new',
    '--window-size=1280,720',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4000));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9280/json/list', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  function send(m, p={}) {
    return new Promise(res => {
      const id = Math.floor(Math.random()*100000);
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) { ws.off('message', h); res(r.result); }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({id, method: m, params: p}));
    });
  }

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const rHand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      const idx1 = model.getObjectByName('mixamorigRightHandIndex1') || model.getObjectByName('mixamorig:RightHandIndex1');
      const idx2 = model.getObjectByName('mixamorigRightHandIndex2') || model.getObjectByName('mixamorig:RightHandIndex2');
      const th1 = model.getObjectByName('mixamorigRightHandThumb1') || model.getObjectByName('mixamorig:RightHandThumb1');
      const th2 = model.getObjectByName('mixamorigRightHandThumb2') || model.getObjectByName('mixamorig:RightHandThumb2');

      // Test rotating idx1 around X, Y, Z by +0.5 rad and check where idx2 moves relative to idx1
      function getDelta(bone, child, axis, angle) {
        const origRot = bone.rotation.clone();
        child.updateWorldMatrix(true, false);
        const p0 = new window.THREE.Vector3();
        child.getWorldPosition(p0);

        if (axis === 'x') bone.rotateX(angle);
        if (axis === 'y') bone.rotateY(angle);
        if (axis === 'z') bone.rotateZ(angle);
        child.updateWorldMatrix(true, false);
        const p1 = new window.THREE.Vector3();
        child.getWorldPosition(p1);

        bone.rotation.copy(origRot);
        child.updateWorldMatrix(true, false);

        // Vector p1 - p0 in rHand space
        const diffWorld = p1.clone().sub(p0);
        const invHand = rHand.matrixWorld.clone().invert();
        const diffHand = diffWorld.clone().transformDirection(invHand);
        return {
          worldDiff: [diffWorld.x.toFixed(4), diffWorld.y.toFixed(4), diffWorld.z.toFixed(4)],
          handDiff: [diffHand.x.toFixed(4), diffHand.y.toFixed(4), diffHand.z.toFixed(4)]
        };
      }

      return {
        idx_rotX_pos: getDelta(idx1, idx2, 'x', 0.5),
        idx_rotX_neg: getDelta(idx1, idx2, 'x', -0.5),
        idx_rotY_pos: getDelta(idx1, idx2, 'y', 0.5),
        idx_rotY_neg: getDelta(idx1, idx2, 'y', -0.5),
        idx_rotZ_pos: getDelta(idx1, idx2, 'z', 0.5),
        idx_rotZ_neg: getDelta(idx1, idx2, 'z', -0.5),

        th_rotX_pos: getDelta(th1, th2, 'x', 0.5),
        th_rotX_neg: getDelta(th1, th2, 'x', -0.5),
        th_rotY_pos: getDelta(th1, th2, 'y', 0.5),
        th_rotY_neg: getDelta(th1, th2, 'y', -0.5),
        th_rotZ_pos: getDelta(th1, th2, 'z', 0.5),
        th_rotZ_neg: getDelta(th1, th2, 'z', -0.5)
      };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
  edge.kill();
}

testAxes().catch(console.error);

