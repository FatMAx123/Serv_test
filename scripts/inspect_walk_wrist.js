const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9995;
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.join(os.tmpdir(), 'edge_wrist_' + Date.now())}`,
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

  for (let i = 0; i < 50; i++) {
    const ready = await evalJs(`!!(window._sr && window._sr.activeCharacterModel)`);
    if (ready === true) break;
    await sleep(200);
  }

  // Load man walk
  await evalJs(`(() => {
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

  const compare = await evalJs(`(() => {
    const deg = r => Math.round(r * 180 / Math.PI);
    const toEuler = q => {
      const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
      return [deg(e.x), deg(e.y), deg(e.z)];
    };

    const m = window._sr.activeCharacterModel;
    const rArm = m.getObjectByName('mixamorig:RightArm') || m.getObjectByName('mixamorigRightArm');
    const rForeArm = m.getObjectByName('mixamorig:RightForeArm') || m.getObjectByName('mixamorigRightForeArm');
    const rHand = m.getObjectByName('mixamorig:RightHand') || m.getObjectByName('mixamorigRightHand');
    const mixer = window._sr.activeMixer;

    mixer.timeScale = 0;

    // Sample at idle / rest (t=0 with idle clip)
    const idleAction = window._sr.activeActions['idle'];
    const idleHandQ = new THREE.Quaternion();
    const idleForeQ = new THREE.Quaternion();
    const idleArmQ = new THREE.Quaternion();
    if (idleAction) {
      idleAction.play();
      idleAction.time = 0;
      mixer.update(0);
      idleHandQ.copy(rHand.quaternion);
      idleForeQ.copy(rForeArm.quaternion);
      idleArmQ.copy(rArm.quaternion);
    }

    // Now switch back to walk at t=0.68s (arm forward peak)
    const walkAction = window._sr.activeActions['walk'];
    walkAction.play();
    walkAction.time = 0.68;
    mixer.update(0);

    return {
      idle: {
        arm: toEuler(idleArmQ),
        fore: toEuler(idleForeQ),
        hand: toEuler(idleHandQ)
      },
      walk_fwd_068: {
        arm: toEuler(rArm.quaternion),
        fore: toEuler(rForeArm.quaternion),
        hand: toEuler(rHand.quaternion)
      }
    };
  })()`);

  console.log('Bone rotation comparison:', JSON.stringify(compare, null, 2));

  ws.close();
  edge.kill();
}

main().catch(console.error);

