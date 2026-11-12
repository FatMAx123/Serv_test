const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_calib_all_' + Date.now());
const PORT = 9280;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
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
  const tabs = await requestJson('http://127.0.0.1:' + PORT + '/json/list');
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          resolve(resp.result);
        }
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

  // Test setup function that implements the canonical bone-scaled grip logic
  await send('Runtime.evaluate', {
    expression: `(() => {
      window._applyCanonicalGrip = async function(weaponId, opts) {
        const sr = window._sr;
        const THREE = window.THREE;
        const sel = document.getElementById('sel-weapon');
        sel.value = weaponId;
        sel.dispatchEvent(new Event('change'));
        await new Promise(r => setTimeout(r, 600));

        const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
        const pivot = sr.weaponPivot || (orient && orient.children[0]);
        const fbx = sr.activeWeaponMesh;
        if (!orient || !pivot || !fbx) return;

        // Position in bone centimeters
        orient.position.set(opts.pos[0], opts.pos[1], opts.pos[2]);
        orient.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);

        // Scale fbx so target world length in cm matches opts.len
        // Reset scale first
        fbx.scale.set(1, 1, 1);
        fbx.updateMatrix();
        const b = new THREE.Box3().setFromObject(fbx);
        const sz = new THREE.Vector3();
        b.getSize(sz);
        const maxDim = Math.max(sz.x, sz.y, sz.z);
        const s = opts.len / maxDim;
        fbx.scale.set(s, s, s);
        fbx.updateMatrix();

        // Grip offset
        b.setFromObject(fbx);
        b.getSize(sz);
        const center = new THREE.Vector3();
        b.getCenter(center);
        const gripY = b.min.y + sz.y * (opts.gripFraction || 0.18);
        fbx.position.set(-center.x, -gripY, -center.z);
        fbx.updateMatrix();
      };
    })()`
  });

  const WEAPON_TESTS = [
    {
      id: 'novice',
      opts: { pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, Math.PI * 0.5], len: 94, gripFraction: 0.18 }
    },
    {
      id: 'magic_mace',
      opts: { pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, Math.PI * 0.5], len: 88, gripFraction: 0.16 }
    },
    {
      id: 'atuba_mace',
      opts: { pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, Math.PI * 0.5], len: 96, gripFraction: 0.18 }
    },
    {
      id: 'demon_staff',
      opts: { pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, -Math.PI * 0.5], len: 165, gripFraction: 0.45 }
    },
    {
      id: 'tears_fairy',
      opts: { pos: [0.0, 7.0, 1.5], rot: [0.0, 0.0, Math.PI * 0.5], len: 90, gripFraction: 0.18 }
    }
  ];

  for (const w of WEAPON_TESTS) {
    console.log('Testing', w.id, '...');
    await send('Runtime.evaluate', {
      expression: `window._applyCanonicalGrip('${w.id}', ${JSON.stringify(w.opts)})`,
      awaitPromise: true
    });
    await sleep(400);

    // Full body
    await send('Runtime.evaluate', { expression: `window._sr.setCameraPreset('full')` });
    await sleep(400);
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/canon_${w.id}_full.png`, Buffer.from(shot.data, 'base64'));

    // Closeup
    await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
    await sleep(400);
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`screenshots/canon_${w.id}_closeup.png`, Buffer.from(shot.data, 'base64'));
  }

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

