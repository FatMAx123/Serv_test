const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_tune_' + Date.now());
const PORT = 9330;

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
    'about:blank'
  ]);
  await sleep(1500);
  const tabs = await req('http://127.0.0.1:' + PORT + '/json/list');
  const ws = new WebSocket(tabs[0].webSocketDebuggerUrl);
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
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Hide UI
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
    })()`
  });

  // Switch to novice
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  // Define test configurations for weapon mount
  // In Screenshot 10, weapon was hanging down along the leg, but shifted backwards (towards buttocks/spine)
  // Let's test varying Z offset and X offset inside handBone
  const candidates = [
    { label: 'pos_z_minus1', pos: [0.0, 7.2, -1.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_z_0',      pos: [0.0, 7.2,  0.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_z_plus1',  pos: [0.0, 7.2,  1.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_z_plus2',  pos: [0.0, 7.2,  2.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_z_plus3',  pos: [0.0, 7.2,  3.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_x_plus1',  pos: [1.0, 7.2,  1.0], rot: [0.0, 0.0, 0.0] },
    { label: 'pos_x_minus1', pos: [-1.0, 7.2, 1.0], rot: [0.0, 0.0, 0.0] }
  ];

  for (const c of candidates) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const THREE = window.THREE;
        const sr = window._sr;
        const root = sr.weaponRoot;
        const orient = root && root.children[0];
        const pivot = orient && orient.children[0];
        const fbx = sr.activeWeaponMesh;
        if (!orient || !pivot || !fbx) return;

        orient.position.set(${c.pos[0]}, ${c.pos[1]}, ${c.pos[2]});
        orient.rotation.set(${c.rot[0]}, ${c.rot[1]}, ${c.rot[2]});

        // Ensure scale is correct: 94 cm
        fbx.position.set(0, 0, 0);
        fbx.rotation.set(0, 0, 0);
        fbx.scale.set(1, 1, 1);
        fbx.updateMatrix();

        let b = new THREE.Box3().setFromObject(fbx);
        let sz = new THREE.Vector3();
        b.getSize(sz);
        if (sz.z >= sz.x && sz.z >= sz.y) {
          fbx.rotation.x = Math.PI * 0.5;
          fbx.updateMatrix();
        }
        b.setFromObject(fbx);
        b.getSize(sz);
        const s = 94.0 / Math.max(sz.x, sz.y, sz.z);
        fbx.scale.set(s, s, s);
        fbx.updateMatrix();

        b.setFromObject(fbx);
        b.getSize(sz);
        const center = new THREE.Vector3();
        b.getCenter(center);
        const gripY = b.min.y + sz.y * 0.28;
        fbx.position.set(-center.x, -gripY, -center.z);
      })()`
    });
    await sleep(400);

    // Frame camera on weapon
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
    await sleep(400);

    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/tune_${c.label}.png`, Buffer.from(shot.data, 'base64'));
    console.log(`Saved screenshots/tune_${c.label}.png`);
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

