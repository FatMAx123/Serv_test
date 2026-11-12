const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_sit_' + Date.now());
const PORT = 9328;

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

  const res = await send('Runtime.evaluate', {
    expression: `(() => {
      const sr = window._sr;
      const clips = sr.loadedClipsList || [];
      const sitClip = clips.find(c => c.name.indexOf('sit_loop') !== -1 || c.name === 'sit_loop');
      if (!sitClip) return { error: 'No sit clip', clips: clips.map(c => c.name) };

      const tracks = sitClip.tracks.map(t => ({
        name: t.name,
        type: t.ValueTypeName,
        minY: t.name.indexOf('.position') !== -1 ? Math.min(...Array.from(t.values).filter((_, i) => i % 3 === 1)) : null,
        maxY: t.name.indexOf('.position') !== -1 ? Math.max(...Array.from(t.values).filter((_, i) => i % 3 === 1)) : null
      })).filter(t => t.name.indexOf('Hips') !== -1 || t.name.indexOf('hips') !== -1);

      return {
        sitClipName: sitClip.name,
        duration: sitClip.duration,
        tracks: tracks
      };
    })()`,
    returnByValue: true
  });
  console.log('Clip tracks:', JSON.stringify(res.result.value, null, 2));

  // Now trigger play sit_loop and measure hips world position
  await send('Runtime.evaluate', {
    expression: `(() => {
      const sel = document.getElementById('sel-anim');
      sel.value = 'sit_loop';
      sel.dispatchEvent(new Event('change'));
    })()`
  });
  await sleep(1500);

  const hipsPos = await send('Runtime.evaluate', {
    expression: `(() => {
      const THREE = window.THREE;
      const sr = window._sr;
      const hips = sr.activeCharacterModel.getObjectByName('mixamorig:Hips') ||
                   sr.activeCharacterModel.getObjectByName('mixamorigHips');
      const wp = new THREE.Vector3();
      if (hips) hips.getWorldPosition(wp);
      return {
        hipsName: hips ? hips.name : null,
        hipsLocal: hips ? [hips.position.x, hips.position.y, hips.position.z] : null,
        hipsWorld: [wp.x, wp.y, wp.z]
      };
    })()`,
    returnByValue: true
  });
  console.log('Hips during sit_loop:', JSON.stringify(hipsPos.result.value, null, 2));

  // Take screenshot of sit_loop
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('screenshots/debug_sit_loop_fresh.png', Buffer.from(shot.data, 'base64'));

  edge.kill();
  process.exit(0);
}
main().catch(console.error);

