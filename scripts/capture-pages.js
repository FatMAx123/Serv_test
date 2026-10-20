const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// 1. Copy existing in-game screenshots with clean names
const SKRINY = path.join(__dirname, '..', 'скрины');
const gameShots = [
  { src: 'image.png_20261007180354.jpg', dest: '03_в_городе_деревня_поющей_стали.jpg' },
  { src: 'image.png_20261007180336.jpg', dest: '04_восточный_полигон_мобы_и_интерфейс.jpg' },
  { src: 'image.png_20261007180359.jpg', dest: '05_холмы_астарда_рейд_событие.jpg' }
];

for (const item of gameShots) {
  const srcPath = path.join(SKRINY, item.src);
  if (fs.existsSync(srcPath)) {
    const destPath = path.join(SCREENSHOTS_DIR, item.dest);
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied: ${item.dest}`);
  }
}

// 2. Launch Edge to capture menu.html and character-select.html via CDP
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_cdp_profile_' + Date.now());
const PORT = 9222;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function requestJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: method
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Failed to parse JSON: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function captureUrl(edge, pageUrl, savePath, waitSec = 3, evalBefore = null) {
  console.log(`Capturing: ${pageUrl} -> ${path.basename(savePath)}`);
  
  // Create target (PUT)
  const target = await requestJson(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(pageUrl)}`, 'PUT');
  const wsUrl = target.webSocketDebuggerUrl;
  
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  let reqId = 1;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = reqId++;
      function handler(msg) {
        const resp = JSON.parse(msg);
        if (resp.id === id) {
          ws.off('message', handler);
          if (resp.error) reject(new Error(resp.error.message));
          else resolve(resp.result);
        }
      }
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Set viewport
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false
  });

  await sleep(waitSec * 1000);

  if (evalBefore) {
    try {
      await send('Runtime.evaluate', { expression: evalBefore });
      await sleep(2000);
    } catch(e) {
      console.warn('evalBefore warning:', e.message);
    }
  }

  const res = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(savePath, Buffer.from(res.data, 'base64'));
  console.log(`Saved: ${savePath}`);

  ws.close();
  // Close target
  try {
    await requestJson(`http://127.0.0.1:${PORT}/json/close/${target.id}`, 'PUT');
  } catch(e) {}
}

async function main() {
  console.log('Spawning Edge...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--hide-scrollbars',
    '--window-size=1920,1080',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  edge.stderr.on('data', () => {}); // silence

  // Wait for CDP to be ready
  let ready = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`, 'GET');
      ready = true;
      break;
    } catch(e) {}
  }

  if (!ready) {
    console.error('Edge CDP failed to start');
    edge.kill();
    return;
  }

  try {
    // 1. Главное меню
    await captureUrl(
      edge,
      'http://127.0.0.1:3000/menu.html',
      path.join(SCREENSHOTS_DIR, '01_главное_меню.png'),
      3,
      "localStorage.setItem('ps_local_id', 'demo_player'); localStorage.setItem('ps_has_key', 'true'); sessionStorage.setItem('ps_local_id', 'demo_player');"
    );

    // 2. Создание персонажа (переходим в режим создания и выбираем женский пол)
    await captureUrl(
      edge,
      'http://127.0.0.1:3000/character-select.html',
      path.join(SCREENSHOTS_DIR, '02_создание_персонажа.png'),
      3,
      `
        try {
          if (typeof openCreate === 'function') {
            openCreate();
          } else {
            const btn = document.getElementById('cs-btn-create');
            if (btn) btn.click();
          }
          if (typeof setCreateGender === 'function') {
            setCreateGender('female');
          }
        } catch(e) {
          document.body.classList.add('cs-mode-create');
        }
      `
    );

    console.log('All screenshots captured successfully!');
  } catch (err) {
    console.error('Error during capture:', err);
  } finally {
    edge.kill();
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch(e) {}
  }
}

main();
