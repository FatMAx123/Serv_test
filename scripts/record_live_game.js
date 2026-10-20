// ============================================================
//  SCRIPTS / RECORD_LIVE_GAME.JS
//  Живая запись геймплея из браузера Edge через MediaRecorder и CDP
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_record_profile_' + Date.now());
const PORT = 9222;

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
  console.log('🚀 Запуск Edge для живой записи игры...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--autoplay-policy=no-user-gesture-required',
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
    console.error('❌ Не удалось запустить Edge CDP');
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

    console.log('⏳ Ожидание загрузки 3D сцены (5 сек)...');
    await sleep(5000);

    // Скрываем FPS дебаг оверлей
    await send('Runtime.evaluate', {
      expression: `
        if (document.getElementById('cs-debug-fps')) {
          document.getElementById('cs-debug-fps').style.display = 'none';
        }
      `
    });

    // Инжектируем MediaRecorder
    console.log('🎥 Запуск записи холста Three.js...');
    await send('Runtime.evaluate', {
      expression: `
        window.__chunks = [];
        const c = document.querySelector('canvas');
        if (c) {
          const stream = c.captureStream(30);
          window.__rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 8000000 });
          window.__rec.ondataavailable = e => { if (e.data.size > 0) window.__chunks.push(e.data); };
          window.__rec.start(100);
          console.log('[Recorder] Started!');
        }
      `
    });

    // 1. Поворот персонажа в комнате выбора (3 сек)
    console.log('🎬 Сцена 1: Вращение персонажа в зале C1...');
    for (let i = 0; i < 30; i++) {
      await send('Runtime.evaluate', {
        expression: `
          if (window.roomGroup) window.roomGroup.rotation.y += 0.03;
        `
      });
      await sleep(100);
    }

    // 2. Клик на кнопку Создать
    console.log('🎬 Сцена 2: Переход в создание персонажа...');
    await send('Runtime.evaluate', {
      expression: `
        const b = document.getElementById('cs-btn-create');
        if (b) b.click();
      `
    });
    await sleep(2500);

    // 3. Переключение классов
    console.log('🎬 Сцена 3: Переключение классов (Оператор, Инженер, Мастеровой)...');
    for (let i = 0; i < 3; i++) {
      await send('Runtime.evaluate', {
        expression: `
          const arrow = document.querySelector('.l2create-arrow[data-spin="cls"][data-dir="1"]') || document.getElementById('cs-class-next');
          if (arrow) arrow.click();
        `
      });
      await sleep(1500);
    }

    // 4. Смена причесок
    for (let i = 0; i < 2; i++) {
      await send('Runtime.evaluate', {
        expression: `
          const hairArrow = document.querySelector('.l2create-arrow[data-spin="hair"][data-dir="1"]');
          if (hairArrow) hairArrow.click();
        `
      });
      await sleep(1000);
    }

    // Завершаем запись
    console.log('💾 Завершение записи и выгрузка WebM...');
    await send('Runtime.evaluate', {
      expression: `window.__rec.stop();`
    });
    await sleep(1000);

    const dataRes = await send('Runtime.evaluate', {
      expression: `
        new Promise(resolve => {
          const blob = new Blob(window.__chunks, { type: 'video/webm' });
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        })
      `,
      awaitPromise: true
    });

    if (dataRes && dataRes.result && dataRes.result.value) {
      const b64 = dataRes.result.value.split(',')[1];
      if (b64) {
        const buf = Buffer.from(b64, 'base64');
        const outPath = path.join(REPO, 'scratch_live_gameplay.webm');
        fs.writeFileSync(outPath, buf);
        console.log(`✅ Записано живое видео: ${outPath} (${buf.length} bytes, ${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
      }
    } else {
      console.warn('⚠️ Данные видео не получены');
    }

    ws.close();
  } catch(e) {
    console.error('Ошибка в процессе записи:', e);
  } finally {
    edge.kill();
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch(e) {}
  }
}

main();
