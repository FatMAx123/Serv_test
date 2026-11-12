const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9970;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_rot_' + Date.now())}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  let tabs = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      tabs = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (tabs && tabs.length > 0) break;
    } catch (_) {}
  }

  const tab = tabs.find(t => t.type === 'page' && t.url.includes('showroom')) || tabs[0];
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
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

  async function evalJs(expr) {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (res && res.result && res.result.value !== undefined) return res.result.value;
    if (res && res.result) return res.result;
    return res;
  }

  async function snap(filename) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACTS_DIR, filename), Buffer.from(res.data, 'base64'));
    console.log('Saved:', filename);
  }

  // Wait ready
  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // Set woman + apprentice_wand + idle
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'idle'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  // Measure woman character facing direction in world space
  const facingInfo = await evalJs(`(() => {
    const m = window._sr.activeCharacterModel;
    const forward = new THREE.Vector3(0, 0, 1);
    m.getWorldDirection(forward);
    
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const handWorldPos = new THREE.Vector3();
    rHand.getWorldPosition(handWorldPos);

    // Get current weapon tip position in world space
    const orient = window._sr.weaponOrient;
    const mesh = window._sr.activeWeaponMesh;
    const tipLocal = new THREE.Vector3(0, 0, -0.85); // tip is at -Z in local mesh space
    const tipWorld = tipLocal.clone();
    mesh.localToWorld(tipWorld);

    const dir = new THREE.Vector3().subVectors(tipWorld, handWorldPos).normalize();

    return {
      charFacing: forward.toArray(),
      handPos: handWorldPos.toArray(),
      tipPos: tipWorld.toArray(),
      weaponDirWorld: dir.toArray()
    };
  })()`);
  console.log('Woman facing and weapon dir:', facingInfo);

  // In user screenshot 1:
  // The camera was on the woman's RIGHT flank. She was facing to the RIGHT of the screen!
  // In our Three.js world, what axis does she face?
  // Let's check charFacing: is it (0, 0, 1) or (0, 0, -1) or something else?

  ws.close();
  edge.kill();
}

main().catch(console.error);

