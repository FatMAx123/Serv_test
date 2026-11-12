const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ARTIFACTS_DIR = 'C:/Users/Kulibyaka/.gemini/antigravity/brain/d3dff332-87fe-4206-a4dc-9a5fc682711d';
const PORT = 9990;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_walk_' + Date.now())}`,
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

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // Measure Man walk cycle
  console.log('Measuring Man walk cycle...');
  await evalJs(`(() => {
    const chk = document.getElementById('chk-bone-helpers');
    if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
    const selC = document.getElementById('sel-character');
    selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2500);

  await evalJs(`(() => {
    const selW = document.getElementById('sel-weapon');
    selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
    const selA = document.getElementById('sel-animation');
    selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
  })()`);
  await sleep(2000);

  const manWalkData = await evalJs(`(() => {
    const mixer = window._sr.activeMixer;
    const action = window._sr.activeActions['walk'];
    const clip = action.getClip();
    const dur = clip.duration;
    mixer.timeScale = 0;

    const m = window._sr.activeCharacterModel;
    const rHand = m.getObjectByName('mixamorigRightHand') || m.getObjectByName('mixamorig:RightHand');
    const rThigh = m.getObjectByName('mixamorigRightUpLeg') || m.getObjectByName('mixamorig:RightUpLeg');
    const rCalf = m.getObjectByName('mixamorigRightLeg') || m.getObjectByName('mixamorig:RightLeg');
    const mesh = window._sr.activeWeaponMesh;

    const steps = 20;
    const records = [];

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * dur;
      mixer.setTime(t);
      m.updateMatrixWorld(true);

      const handPos = new THREE.Vector3(); rHand.getWorldPosition(handPos);
      const thighPos = new THREE.Vector3(); rThigh.getWorldPosition(thighPos);
      const calfPos = new THREE.Vector3(); rCalf.getWorldPosition(calfPos);

      // Tip position of wand
      const tipLocal = new THREE.Vector3(0, 0, -0.85);
      const tipWorld = tipLocal.clone();
      mesh.localToWorld(tipWorld);

      // Distance from tip to thigh and calf
      const distThigh = tipWorld.distanceTo(thighPos);
      const distCalf = tipWorld.distanceTo(calfPos);

      // X coordinate difference (lateral separation: positive means tip is outside the leg)
      // On man, right leg is at positive X (~0.12..0.15)
      // Tip should be further outward (+X)
      records.push({
        t: Number(t.toFixed(2)),
        handZ: Number(handPos.z.toFixed(3)),
        tipPos: [Number(tipWorld.x.toFixed(3)), Number(tipWorld.y.toFixed(3)), Number(tipWorld.z.toFixed(3))],
        legX: Number(thighPos.x.toFixed(3)),
        distThigh: Number(distThigh.toFixed(3)),
        distCalf: Number(distCalf.toFixed(3))
      });
    }

    return { dur, records };
  })()`);

  console.log('Man walk analysis:');
  manWalkData.records.forEach(r => {
    console.log(`t=${r.t}s | handZ=${r.handZ} | tip=[${r.tipPos}] | legX=${r.legX} | distThigh=${r.distThigh} | distCalf=${r.distCalf}`);
  });

  ws.close();
  edge.kill();
}

main().catch(console.error);

