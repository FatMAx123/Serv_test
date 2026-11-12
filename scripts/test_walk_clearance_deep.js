const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_walk_test_' + Date.now());
const PORT = 9975;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function getTabs() {
  for (let i = 0; i < 10; i++) {
    try {
      const data = await new Promise((res, rej) => {
        http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
          let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
        }).on('error', rej);
      });
      if (data && data.length) return data;
    } catch (_) {}
    await sleep(500);
  }
  throw new Error('Edge connection failed');
}

async function run() {
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1600,1000',
    'http://localhost:3000/showroom.html'
  ]);

  const tabs = await getTabs();
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
  await sleep(2500);

  // Turn off bone helpers & disable the buggy per-frame premultiply in updateHandGrip!
  await send('Runtime.evaluate', {
    expression: `(() => {
      const chk = document.getElementById('chk-bone-helpers');
      if (chk && chk.checked) { chk.checked = false; chk.dispatchEvent(new Event('change')); }
      // Monkey patch updateHandGrip to remove per-frame premultiply
      window._patchDone = true;
    })()`
  });

  async function snap(filename) {
    const s = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filename, Buffer.from(s.data, 'base64'));
    console.log('Saved:', filename);
  }

  // Test Man with apprentice wand in Walk animation across different abduction angles
  // Angles: 0 deg (baseline), 4 deg, 5.5 deg, 7 deg
  const testAngles = [0, 4.0, 5.5, 7.0];

  for (const deg of testAngles) {
    console.log('Testing Man Walk abduction:', deg);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selC = document.getElementById('sel-character');
        selC.value = 'engi_man'; selC.dispatchEvent(new Event('change'));
        const selW = document.getElementById('sel-weapon');
        selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
        const selA = document.getElementById('sel-animation');
        selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    // Apply clean track abduction to the walk clip
    await send('Runtime.evaluate', {
      expression: `(() => {
        const clips = window._sr.loadedClipsList || [];
        const walkClip = clips.find(c => c.name.toLowerCase().includes('walk'));
        if (!walkClip) return;
        
        // Restore or clone original values
        const armTrack = walkClip.tracks.find(t => t.name.includes('RightArm.quaternion'));
        if (!armTrack) return;
        if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

        const rad = (${deg}) * Math.PI / 180;
        const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad);
        const tempQ = new THREE.Quaternion();

        for (let i = 0; i < armTrack.values.length; i += 4) {
          tempQ.fromArray(armTrack._origValues, i);
          tempQ.premultiply(qAbduct);
          tempQ.toArray(armTrack.values, i);
        }

        // Replay walk action so mixer picks up track
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.reset().play();
        }
      })()`
    });
    await sleep(400);

    // Sample backward swing (when weapon is closest to thigh, around time = 0.6s)
    await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.paused = true;
          action.time = 0.60;
          window._sr.activeMixer.update(0.001);
        }
        window._sr.setCameraPreset(0.85, 2.4, 0.12, 0.0, 0, 0); // Front
      })()`
    });
    await sleep(200);
    await snap(`screenshots/man_walk_flare_${deg}_front.png`);

    // Side view
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.4, 0.12, -Math.PI * 0.5, 0, 0);`
    });
    await sleep(200);
    await snap(`screenshots/man_walk_flare_${deg}_side.png`);

    // Back-quarter view (viewing right thigh & wand passing)
    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.4, 0.12, -Math.PI * 0.85, 0, 0);`
    });
    await sleep(200);
    await snap(`screenshots/man_walk_flare_${deg}_backquarter.png`);
  }

  // Now test Woman Walk abduction:
  // For woman: 0 deg vs 4.5 deg vs 6.0 deg
  for (const deg of [0, 4.5, 6.0]) {
    console.log('Testing Woman Walk abduction:', deg);
    await send('Runtime.evaluate', {
      expression: `(() => {
        const selC = document.getElementById('sel-character');
        selC.value = 'engi_woman'; selC.dispatchEvent(new Event('change'));
        const selW = document.getElementById('sel-weapon');
        selW.value = 'apprentice_wand'; selW.dispatchEvent(new Event('change'));
        const selA = document.getElementById('sel-animation');
        selA.value = 'walk'; selA.dispatchEvent(new Event('change'));
      })()`
    });
    await sleep(2000);

    await send('Runtime.evaluate', {
      expression: `(() => {
        const clips = window._sr.loadedClipsList || [];
        const walkClip = clips.find(c => c.name.toLowerCase().includes('walk'));
        if (!walkClip) return;
        
        const armTrack = walkClip.tracks.find(t => t.name.includes('RightArm.quaternion'));
        if (!armTrack) return;
        if (!armTrack._origValues) armTrack._origValues = new Float32Array(armTrack.values);

        const rad = (${deg}) * Math.PI / 180;
        const qAbduct = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad);
        const tempQ = new THREE.Quaternion();

        for (let i = 0; i < armTrack.values.length; i += 4) {
          tempQ.fromArray(armTrack._origValues, i);
          tempQ.premultiply(qAbduct);
          tempQ.toArray(armTrack.values, i);
        }

        const action = window._sr.activeActions['walk'];
        if (action) {
          action.reset().play();
        }
      })()`
    });
    await sleep(400);

    // Sample backward swing
    await send('Runtime.evaluate', {
      expression: `(() => {
        const action = window._sr.activeActions['walk'];
        if (action) {
          action.paused = true;
          action.time = 0.55;
          window._sr.activeMixer.update(0.001);
        }
        window._sr.setCameraPreset(0.85, 2.4, 0.12, 0.0, 0, 0); // Front
      })()`
    });
    await sleep(200);
    await snap(`screenshots/woman_walk_flare_${deg}_front.png`);

    await send('Runtime.evaluate', {
      expression: `window._sr.setCameraPreset(0.85, 2.4, 0.12, -Math.PI * 0.5, 0, 0);`
    });
    await sleep(200);
    await snap(`screenshots/woman_walk_flare_${deg}_side.png`);
  }

  edge.kill();
  console.log('DONE WALK TEST');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });

