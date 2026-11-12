const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_penetration_' + Date.now());
const PORT = 9915;

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

  // Switch to engi_man, apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2500);

  // Set man-calibrated pos: px: 0.010, py: 0.075, pz: 0.020
  await send('Runtime.evaluate', {
    expression: `(() => {
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');
      let scaleInv = 1.0;
      if (hand) {
        const s = new THREE.Vector3();
        hand.getWorldScale(s);
        const maxS = Math.max(s.x, s.y, s.z);
        if (maxS > 1e-5) scaleInv = 1.0 / maxS;
      }
      window._sr.weaponOrient.position.set(0.010 * scaleInv, 0.075 * scaleInv, 0.020 * scaleInv);
    })()`
  });

  const animClips = ['idle', 'walk', 'run', 'stand', 'sitloop', 'punch', 'skill', 'heal', 'vamp', 'diy'];
  const report = {};

  for (const anim of animClips) {
    const res = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => {
        const sel = document.getElementById('sel-animation');
        sel.value = '${anim}';
        sel.dispatchEvent(new Event('change'));

        const mixer = window._sr.activeMixer;
        const action = window._sr.activeActions['${anim}'];
        if (!action || !mixer) return { error: 'no action' };

        const clip = action.getClip();
        const dur = clip.duration;
        const steps = 15;
        const collisions = [];

        // Sample points along the weapon
        const mesh = window._sr.weaponPivot.children[0];
        const bbox = new THREE.Box3().setFromObject(mesh);

        // Body meshes (torso, shorts, legs)
        const bodyMeshes = [];
        window._sr.activeCharacterModel.traverse(c => {
          if (c.isMesh && c !== mesh && !c.name.includes('weapon')) {
            bodyMeshes.push(c);
          }
        });

        // Test at different times
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * dur;
          action.time = t;
          mixer.update(0);
          window._sr.activeCharacterModel.updateMatrixWorld(true);

          // Get weapon tip and pommel in world space
          const tip = new THREE.Vector3(0, 0, -0.85).applyMatrix4(window._sr.weaponOrient.matrixWorld);
          const pommel = new THREE.Vector3(0, 0, 0.1).applyMatrix4(window._sr.weaponOrient.matrixWorld);

          // Check distance of weapon line to body center (x=0, z=0, y=0.5..1.2)
          // Specifically, check right leg and torso
          // Right thigh bone:
          const rUpLeg = window._sr.activeCharacterModel.getObjectByName('mixamorigRightUpLeg');
          const rLeg = window._sr.activeCharacterModel.getObjectByName('mixamorigRightLeg');
          const hips = window._sr.activeCharacterModel.getObjectByName('mixamorigHips');

          let minDist = 999;
          [rUpLeg, rLeg, hips].forEach(bone => {
            if (bone) {
              const bp = new THREE.Vector3();
              bone.getWorldPosition(bp);
              // Distance from bp to line segment tip-pommel
              const line = new THREE.Line3(pommel, tip);
              const closest = new THREE.Vector3();
              line.closestPointToPoint(bp, true, closest);
              const dist = closest.distanceTo(bp);
              if (dist < minDist) minDist = dist;
            }
          });

          if (minDist < 0.12) {
            collisions.push({ time: t.toFixed(2), minDist: minDist.toFixed(3) });
          }
        }

        return { anim: '${anim}', dur, collisionsCount: collisions.length, collisions };
      })()`
    });
    report[anim] = res.result.value;
    console.log(anim, res.result.value);
  }

  edge.kill();
  fs.writeFileSync('penetration_report.json', JSON.stringify(report, null, 2));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

