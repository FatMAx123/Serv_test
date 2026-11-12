const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

async function check() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    '--remote-debugging-port=9345',
    '--headless=new',
    'http://localhost:3000/showroom.html'
  ]);
  await new Promise(r => setTimeout(r, 4500));
  const tabs = await new Promise((res, rej) => {
    http.get('http://127.0.0.1:9345/json/list', r => {
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

  // Select atuba_mace and inspect coordinates
  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'atuba_mace';
      selW.dispatchEvent(new Event('change'));
      await new Promise(r => setTimeout(r, 1500));

      const sr = window._sr;
      const model = sr.activeCharacterModel;
      const hand = model.getObjectByName('mixamorigRightHand') || model.getObjectByName('mixamorig:RightHand');
      const wRoot = sr.weaponRoot;
      const wOrient = model.getObjectByName('char_weapon_orient');
      const wPivot = model.getObjectByName('char_weapon_pivot');
      const mesh = sr.activeWeaponMesh;

      hand.updateWorldMatrix(true, true);
      const handWP = new window.THREE.Vector3();
      hand.getWorldPosition(handWP);

      const orientWP = new window.THREE.Vector3();
      wOrient.getWorldPosition(orientWP);

      const pivotWP = new window.THREE.Vector3();
      wPivot.getWorldPosition(pivotWP);

      const meshBox = new window.THREE.Box3().setFromObject(mesh);
      const meshSize = new window.THREE.Vector3();
      meshBox.getSize(meshSize);
      const meshCenter = new window.THREE.Vector3();
      meshBox.getCenter(meshCenter);

      return {
        handWP: [handWP.x.toFixed(3), handWP.y.toFixed(3), handWP.z.toFixed(3)],
        orientWP: [orientWP.x.toFixed(3), orientWP.y.toFixed(3), orientWP.z.toFixed(3)],
        pivotWP: [pivotWP.x.toFixed(3), pivotWP.y.toFixed(3), pivotWP.z.toFixed(3)],
        wRootParent: wRoot.parent ? wRoot.parent.name : null,
        meshBox: {
          min: [meshBox.min.x.toFixed(3), meshBox.min.y.toFixed(3), meshBox.min.z.toFixed(3)],
          max: [meshBox.max.x.toFixed(3), meshBox.max.y.toFixed(3), meshBox.max.z.toFixed(3)],
          size: [meshSize.x.toFixed(3), meshSize.y.toFixed(3), meshSize.z.toFixed(3)],
          center: [meshCenter.x.toFixed(3), meshCenter.y.toFixed(3), meshCenter.z.toFixed(3)]
        }
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
  edge.kill();
}
check().catch(console.error);

