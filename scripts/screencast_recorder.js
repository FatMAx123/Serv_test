// ============================================================
//  SCRIPTS / SCREENCAST_RECORDER.JS
//  Профессиональная живая запись 1080p прямо из Three.js игры через CDP Screencast
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_screencast_' + Date.now());
const FRAMES_DIR = path.join(REPO, 'scratch_frames');
const PORT = 9222;

if (!fs.existsSync(FRAMES_DIR)) fs.mkdirSync(FRAMES_DIR, { recursive: true });

function sleep(ms) {
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
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Failed to parse: ${data}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // Clear old frames
  const oldFiles = fs.readdirSync(FRAMES_DIR);
  for (const f of oldFiles) fs.unlinkSync(path.join(FRAMES_DIR, f));

  console.log('🚀 Запуск Edge (1920x1080) для прямой записи игры...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'http://127.0.0.1:3000/character-select.html'
  ]);

  let ready = false;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch(e) {}
  }

  if (!ready) {
    console.error('❌ Edge CDP не запустился');
    edge.kill();
    return;
  }

  try {
    const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
    const tab = tabs.find(t => t.url.includes('character-select')) || tabs[0];
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
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

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    });

    console.log('⏳ Ожидание 3D загрузки (4 сек)...');
    await sleep(4000);

    // Скрываем FPS дебаг
    await send('Runtime.evaluate', {
      expression: `
        if (document.getElementById('cs-debug-fps')) document.getElementById('cs-debug-fps').style.display = 'none';
        window.dispatchEvent(new Event('resize'));
      `
    });
    await sleep(1000);

    let frameCount = 0;
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.method === 'Page.screencastFrame') {
          const frameBase64 = data.params.data;
          const sessionId = data.params.sessionId;
          const idx = String(frameCount++).padStart(5, '0');
          fs.writeFileSync(path.join(FRAMES_DIR, `frame_${idx}.jpg`), Buffer.from(frameBase64, 'base64'));
          ws.send(JSON.stringify({
            id: reqId++,
            method: 'Page.screencastFrameAck',
            params: { sessionId }
          }));
        }
      } catch(e) {}
    });

    console.log('🔴 НАЧАЛО ЖИВОЙ ЗАПИСИ (Page.startScreencast 1080p)...');
    await send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: 1920,
      maxHeight: 1080,
      everyNthFrame: 1
    });

    // 1. Поворот сцены в зале персонажей (4 секунды)
    console.log('  [1/4] Вращение персонажа в зале...');
    for (let i = 0; i < 40; i++) {
      await send('Runtime.evaluate', {
        expression: `
          if (window.roomGroup) window.roomGroup.rotation.y += 0.035;
        `
      });
      await sleep(100);
    }

    // 2. Открытие меню создания
    console.log('  [2/4] Клик по кнопке создания...');
    await send('Runtime.evaluate', {
      expression: `
        const b = document.getElementById('cs-btn-create');
        if (b) b.click();
      `
    });
    await sleep(2500);

    // 3. Динамичное переключение классов
    console.log('  [3/4] Переключение классов и оружия...');
    for (let i = 0; i < 4; i++) {
      await send('Runtime.evaluate', {
        expression: `
          const arrow = document.querySelector('.l2create-arrow[data-spin="cls"][data-dir="1"]') || document.getElementById('cs-class-next');
          if (arrow) arrow.click();
        `
      });
      await sleep(1200);
    }

    // 4. Смена причесок
    console.log('  [4/4] Смена причесок и кастомизация...');
    for (let i = 0; i < 3; i++) {
      await send('Runtime.evaluate', {
        expression: `
          const hairArrow = document.querySelector('.l2create-arrow[data-spin="hair"][data-dir="1"]');
          if (hairArrow) hairArrow.click();
        `
      });
      await sleep(1000);
    }

    await send('Page.stopScreencast');
    console.log(`⏹️ Запись завершена! Сохранено ${frameCount} живых 1080p кадров.`);
    ws.close();
  } catch(e) {
    console.error('Ошибка записи:', e);
  } finally {
    edge.kill();
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch(e) {}
  }
}

main();
