const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_solve_rot_' + Date.now());
const PORT = 9914;

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

  // 1. Load engi_man with atuba_mace
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selChar = document.getElementById('sel-character');
      selChar.value = 'engi_man';
      selChar.dispatchEvent(new Event('change'));
      const selW = document.getElementById('sel-weapon');
      selW.value = 'atuba_mace';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // Measure Atuba Mace: Find head center and grip center in world space
  const atubaAnalysis = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const wp = window._sr.weaponPivot;
      const orient = window._sr.weaponOrient;
      const hand = window._sr.activeCharacterModel.getObjectByName('mixamorigRightHand');

      // The weapon root is child of hand.
      // Get the world position of the grip point (orient position in world space)
      const gripWorld = new THREE.Vector3();
      orient.getWorldPosition(gripWorld);

      // In atuba_mace mesh, find the vertex furthest from grip
      const mesh = wp.children[0];
      let maxDistSq = 0;
      const headLocal = new THREE.Vector3();
      mesh.traverse(child => {
        if (child.isMesh && child.geometry) {
          const posAttr = child.geometry.attributes.position;
          for (let i = 0; i < posAttr.count; i++) {
            const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            v.applyMatrix4(child.matrixWorld);
            const d = v.distanceToSquared(gripWorld);
            if (d > maxDistSq) {
              maxDistSq = d;
              headLocal.copy(v);
            }
          }
        }
      });

      // Direction vector from grip to head in WORLD SPACE:
      const dirWorld = new THREE.Vector3().subVectors(headLocal, gripWorld).normalize();

      // Also get dir in HAND LOCAL SPACE:
      const handInvQuat = hand.getWorldQuaternion(new THREE.Quaternion()).invert();
      const dirHand = dirWorld.clone().applyQuaternion(handInvQuat);

      return {
        atubaWorldDir: { x: dirWorld.x, y: dirWorld.y, z: dirWorld.z },
        atubaHandDir: { x: dirHand.x, y: dirHand.y, z: dirHand.z }
      };
    })()`
  });
  console.log('ATUBA ANALYSIS:', atubaAnalysis.result.value);

  // 2. Now switch to apprentice_wand
  await send('Runtime.evaluate', {
    expression: `(() => {
      const selW = document.getElementById('sel-weapon');
      selW.value = 'apprentice_wand';
      selW.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(2000);

  // For apprentice_wand, find the shaft vector in weaponObj space
  const wandAnalysis = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const wp = window._sr.weaponPivot;
      const mesh = wp.children[0];
      // Find the vertex furthest from origin (0,0,0) in mesh local space
      let maxDistSq = 0;
      const headMeshLocal = new THREE.Vector3();
      mesh.traverse(child => {
        if (child.isMesh && child.geometry) {
          const posAttr = child.geometry.attributes.position;
          for (let i = 0; i < posAttr.count; i++) {
            const v = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
            const d = v.lengthSq();
            if (d > maxDistSq) {
              maxDistSq = d;
              headMeshLocal.copy(v);
            }
          }
        }
      });
      return {
        wandMeshLocalHead: { x: headMeshLocal.x, y: headMeshLocal.y, z: headMeshLocal.z }
      };
    })()`
  });
  console.log('WAND ANALYSIS:', wandAnalysis.result.value);

  // 3. Solve exact Quaternion / Euler that rotates wandMeshLocalHead into atubaHandDir!
  const solved = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const atubaHandDir = new THREE.Vector3(
        ${atubaAnalysis.result.value.atubaHandDir.x},
        ${atubaAnalysis.result.value.atubaHandDir.y},
        ${atubaAnalysis.result.value.atubaHandDir.z}
      );
      const wandLocalHead = new THREE.Vector3(
        ${wandAnalysis.result.value.wandMeshLocalHead.x},
        ${wandAnalysis.result.value.wandMeshLocalHead.y},
        ${wandAnalysis.result.value.wandMeshLocalHead.z}
      ).normalize();

      // We need a quaternion Q such that Q * wandLocalHead = atubaHandDir
      const q = new THREE.Quaternion().setFromUnitVectors(wandLocalHead, atubaHandDir);
      const euler = new THREE.Euler().setFromQuaternion(q, 'XYZ');

      // Test it on weaponOrient:
      window._sr.weaponOrient.quaternion.copy(q);

      return {
        eulerRad: [euler.x, euler.y, euler.z],
        eulerDeg: [euler.x * 180 / Math.PI, euler.y * 180 / Math.PI, euler.z * 180 / Math.PI]
      };
    })()`
  });
  console.log('SOLVED EULER:', solved.result.value);

  // Take screenshot with solved Euler
  await send('Runtime.evaluate', {
    expression: "document.getElementById('ui-overlay').style.display = 'none';"
  });
  await send('Runtime.evaluate', {
    expression: "window._sr.setCameraPreset(1.0, 2.7, 0.05, -1.57, 0, 0);"
  });
  await sleep(200);
  let s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/solved_wand_profile.png', Buffer.from(s.data, 'base64'));

  await send('Runtime.evaluate', {
    expression: "window._sr.setCameraPreset(1.0, 2.7, 0.05, 0.0, 0, 0);"
  });
  await sleep(200);
  s = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/solved_wand_front.png', Buffer.from(s.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });

