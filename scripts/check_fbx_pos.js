const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_chk_' + Date.now());
const PORT = 9337;

async function main() {
  const edge = spawn(EDGE_PATH, ['--remote-debugging-port=' + PORT, '--user-data-dir=' + USER_DATA, '--headless=new', '--window-size=1600,1000', 'about:blank']);
  await new Promise(r => setTimeout(r, 1500));
  const tabs = await new Promise(res => http.get('http://127.0.0.1:' + PORT + '/json/list', r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(m, p = {}) {
    return new Promise(res => {
      const id = reqId++;
      function h(msg) {
        const r = JSON.parse(msg);
        if (r.id === id) { ws.off('message', h); res(r.result); }
      }
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });
  }

  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await new Promise(r => setTimeout(r, 4000));

  await send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('top-bar').style.display = 'none';
      document.getElementById('left-panel').style.display = 'none';
      document.getElementById('right-panel').style.display = 'none';
      document.getElementById('bottom-bar').style.display = 'none';
      const sel = document.getElementById('sel-weapon');
      sel.value = 'novice';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await new Promise(r => setTimeout(r, 2500));

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const orient = sr.weaponOrient || (sr.weaponRoot && sr.weaponRoot.children[0]);
      const pivot = orient && orient.children[0];
      const fbx = sr.activeWeaponMesh;
      if (!orient || !pivot || !fbx) return { error: 'missing' };

      // Set orient position in hand centimeters:
      orient.position.set(0.0, 7.2, 1.3);
      orient.rotation.set(0.0, 0.0, 0.0);

      // Measure raw unscaled bounds by temporarily removing fbx and measuring at origin
      const origParent = fbx.parent;
      origParent.remove(fbx);
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
      const maxDim = Math.max(sz.x, sz.y, sz.z);
      // Target length 94.0 cm in bone units!
      const s = 94.0 / maxDim;
      fbx.scale.set(s, s, s);
      fbx.updateMatrix();

      b.setFromObject(fbx);
      b.getSize(sz);
      const center = new THREE.Vector3();
      b.getCenter(center);
      const gripY = b.min.y + sz.y * 0.28;
      fbx.position.set(-center.x, -gripY, -center.z);

      // Re-attach to pivot
      origParent.add(fbx);
      sr.weaponRoot.updateMatrixWorld(true);

      const wp = new THREE.Vector3();
      const ws = new THREE.Vector3();
      fbx.getWorldPosition(wp);
      fbx.getWorldScale(ws);
      const wb = new THREE.Box3().setFromObject(fbx);
      const wsz = new THREE.Vector3();
      wb.getSize(wsz);

      return {
        wp: [wp.x, wp.y, wp.z],
        ws: [ws.x, ws.y, ws.z],
        worldSize: [wsz.x, wsz.y, wsz.z],
        wbMin: [wb.min.x, wb.min.y, wb.min.z],
        wbMax: [wb.max.x, wb.max.y, wb.max.z]
      };
    })()`,
    returnByValue: true
  });

  console.log('CORRECTED FBX WORLD:', JSON.stringify(res.result.value, null, 2));

  // Capture full screenshot
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('full')` });
  await new Promise(r => setTimeout(r, 400));
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_corrected_novice_full.png', Buffer.from(shot.data, 'base64'));

  // Capture closeup
  await send('Runtime.evaluate', { expression: `window._sr.frameCamera('weapon')` });
  await new Promise(r => setTimeout(r, 400));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/test_corrected_novice_closeup.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);
