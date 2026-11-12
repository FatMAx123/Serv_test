const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_verify_weapons_' + Date.now());
const PORT = 9228;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function main() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch (_) {}
  }
  if (!ready) {
    console.error('Edge failed to start');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
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
  await send('Runtime.enable');

  console.log('Navigating to showroom.html...');
  await send('Page.navigate', { url: 'http://localhost:3000/showroom.html' });
  await sleep(4000);

  // Turn off bone helper spheres & switch camera to weapon preset
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      const btn = document.getElementById('cam-weapon');
      if (btn) btn.click();
    })()`
  });
  await sleep(1500);

  async function testWeapon(weaponId, shotName, animName) {
    console.log(`Testing weapon: [${weaponId}] anim: [${animName || 'idle'}]...`);
    if (animName) {
      await send('Runtime.evaluate', {
        expression: `(() => {
          const sel = document.getElementById('sel-animation');
          if (sel) { sel.value = '${animName}'; sel.dispatchEvent(new Event('change')); }
        })()`
      });
      await sleep(1000);
    }

    await send('Runtime.evaluate', {
      expression: `(() => {
        const sel = document.getElementById('sel-weapon');
        if (sel) { sel.value = '${weaponId}'; sel.dispatchEvent(new Event('change')); }
      })()`
    });
    // Wait for FBX load & grip transition
    await sleep(2500);

    const info = await send('Runtime.evaluate', {
      expression: `(() => {
        const sr = window._sr;
        const mesh = sr.activeWeaponMesh;
        let details = null;
        if (mesh) {
          const box = new window.THREE.Box3().setFromObject(mesh);
          const sz = new window.THREE.Vector3(); box.getSize(sz);
          details = {
            hasMesh: true,
            size: [sz.x.toFixed(3), sz.y.toFixed(3), sz.z.toFixed(3)],
            parentName: mesh.parent ? mesh.parent.name : null
          };
        }
        return { weapon: sr.state.weapon, details };
      })()`,
      returnByValue: true
    });
    console.log('  Weapon info:', JSON.stringify(info.result.value));

    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const fn = path.join(__dirname, '..', 'screenshots', shotName);
    fs.writeFileSync(fn, Buffer.from(shot.data, 'base64'));
    console.log(`  ✓ Saved ${fn}`);
  }

  // 1. Apprentice Wand
  await testWeapon('apprentice_wand', 'verify_apprentice_wand.png');

  // 2. Magic Mace
  await testWeapon('magic_mace', 'verify_magic_mace.png');

  // 3. Demon Staff (2H)
  await testWeapon('demon_staff', 'verify_demon_staff.png');

  // 4. Combat animation with weapon (sword_slash)
  await testWeapon('apprentice_wand', 'verify_weapon_sword_slash.png', 'sword_slash');

  // 5. Back to None (unarmed) - verify relaxed open hand
  await testWeapon('none', 'verify_unarmed_fist_opened.png', 'idle');

  edge.kill();
  console.log('All weapon verification tests finished successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

