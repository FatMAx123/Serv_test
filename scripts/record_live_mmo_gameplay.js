// ============================================================
//  SCRIPTS / RECORD_LIVE_MMO_GAMEPLAY.JS
//  Прямая живая запись геймплея из запущенной 3D MMO через CDP
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_mmo_rec_' + Date.now());
const FRAMES_DIR = path.join(REPO, 'live_gameplay_frames');
const PORT = 9230;

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

async function run() {
  if (fs.existsSync(FRAMES_DIR)) {
    fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  console.log('🚀 Запуск Edge (1920x1080) для живой записи геймплея MMO...');
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
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      ready = true;
      break;
    } catch(e) {}
  }
  if (!ready) {
    console.error('Edge CDP не ответил');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.type === 'page') || tabs[0];
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

  await send('Runtime.enable');
  await send('Page.enable');

  const lid = '8dc75cfeb46c';
  const token = 'f35a997e164feac53c74c7705afffcf59b12daf47e236245886cbe0d7a11ef35';
  const charData = {
    id: 'c0',
    name: 'AindieGus',
    level: 1,
    exp: 0,
    sp: 0,
    cls: 'operator',
    className: 'Оператор',
    classTier: 0,
    classHistory: ['operator'],
    race: 'human',
    gender: 'male',
    hp: 126,
    maxHp: 126,
    energy: 38,
    maxEnergy: 38,
    pAtk: 10,
    pDef: 50,
    cAtk: 3,
    cDef: 47,
    karma: 0
  };

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        localStorage.setItem('ps_local_id', '${lid}');
        sessionStorage.setItem('ps_local_id', '${lid}');
        localStorage.setItem('ps_guest_token', '${token}');
        sessionStorage.setItem('ps_guest_token', '${token}');
        localStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        sessionStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        localStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        sessionStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        localStorage.setItem('ps_connect', '1');
        sessionStorage.setItem('ps_connect', '1');
        localStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_boot_ticket', '1');
        localStorage.setItem('ps_game_host', '93.77.168.135');
        sessionStorage.setItem('ps_game_host', '93.77.168.135');
        sessionStorage.setItem('ps_starter_greet_AindieGus', '1');
      } catch(e) {}
    `
  });

  console.log('Навигация на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
  console.log('⏳ Ожидание загрузки 3D мира и ассетов (8 сек)...');
  await sleep(8000);

  // Очистка оверлеев и настройка интерфейса
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const m = document.getElementById('ps-starter-welcome-modal');
        if (m) m.remove();
        const fps = document.getElementById('cs-debug-fps') || document.getElementById('fps-counter');
        if (fps) fps.style.display = 'none';
        // Убираем баннеры
        const banners = document.querySelectorAll('#fatal-banner, .starter-greeting-modal');
        banners.forEach(b => b.remove());
        window.dispatchEvent(new Event('resize'));
      })()
    `
  });
  await sleep(1000);

  let currentSceneDir = '';
  let sceneFrameCount = 0;

  function setSceneDir(name) {
    currentSceneDir = path.join(FRAMES_DIR, name);
    if (!fs.existsSync(currentSceneDir)) fs.mkdirSync(currentSceneDir, { recursive: true });
    sceneFrameCount = 0;
  }

  // Обработчик кадров Screencast
  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.method === 'Page.screencastFrame') {
        const frameBase64 = data.params.data;
        const sessionId = data.params.sessionId;
        if (currentSceneDir) {
          const idx = String(sceneFrameCount++).padStart(5, '0');
          fs.writeFileSync(path.join(currentSceneDir, `frame_${idx}.jpg`), Buffer.from(frameBase64, 'base64'));
        }
        ws.send(JSON.stringify({
          id: reqId++,
          method: 'Page.screencastFrameAck',
          params: { sessionId }
        }));
      }
    } catch(e) {}
  });

  console.log('🔴 СТАРТ SCREENCAST (1080p, quality 92)...');
  await send('Page.startScreencast', {
    format: 'jpeg',
    quality: 92,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1
  });

  // ============================================================
  // СЦЕНА 1: Эпичный ракурс персонажа в деревне у Котла (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 1] Кинематографичный ракурс и поворот камеры вокруг героя...');
  setSceneDir('scene1_hero_cinematic');
  for (let i = 0; i < 32; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.game && window.game.cameraRig) {
            const rig = window.game.cameraRig;
            rig.dist = 5.8;
            rig.pitch = 0.22;
            rig.yaw += 0.045; // круговой плавный облет
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 2: Стремительный бег персонажа по площади к воротам (3.5 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 2] Динамичный бег персонажа по мостовой...');
  setSceneDir('scene2_hero_running');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.player) {
          const p = window.game.player;
          // Отправляем персонажа на 70 метров вперед
          p.moveTo(new THREE.Vector3(p.pos.x + 55, p.pos.y, p.pos.z + 65));
          if (window.game.cameraRig) {
            window.game.cameraRig.dist = 7.5;
            window.game.cameraRig.pitch = 0.35;
          }
        }
      })()
    `
  });
  for (let i = 0; i < 35; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.game && window.game.cameraRig) {
            window.game.cameraRig.yaw += 0.015; // динамичное смещение ракурса при беге
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 3: Боевые удары, таргет и соулшот (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 3] Бой, взмахи молота, заряд соулшота и урон...');
  setSceneDir('scene3_hero_combat');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.player) {
          const p = window.game.player;
          p.isMoving = false;
          if (window.game.cameraRig) {
            window.game.cameraRig.dist = 5.2;
            window.game.cameraRig.pitch = 0.25;
            window.game.cameraRig.yaw = Math.PI * 0.2;
          }
          // Показываем соулшот
          if (window.game.ui && window.game.ui.showSoulshotGlow) {
            window.game.ui.showSoulshotGlow();
          }
        }
      })()
    `
  });

  for (let i = 0; i < 32; i++) {
    if (i % 8 === 0) {
      // Имитация удара оружием и урона
      await send('Runtime.evaluate', {
        expression: `
          (function() {
            if (window.game && window.game.player) {
              window.game.player.attack();
              if (window.game.ui && window.game.ui.showFloatingDamage) {
                window.game.ui.showFloatingDamage(
                  window.game.player.pos,
                  Math.floor(120 + Math.random() * 80),
                  true // critical!
                );
              }
            }
          })()
        `
      });
    }
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 4: Эффект Level Up / Мандала ауры / Свет (3.0 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 4] Золотая мандала Level Up и взмывающий столб света...');
  setSceneDir('scene4_hero_levelup');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.spawnAuraBurstVfx && window.game && window.game.player && window.game.player.mesh) {
          window.spawnAuraBurstVfx(window.game.scene, window.game.player.mesh.position, {
            innerHex: '#ffffff',
            hex: '#ffaa00',
            duration: 3.0
          });
        }
        if (window.game && window.game.cameraRig) {
          window.game.cameraRig.dist = 6.2;
          window.game.cameraRig.pitch = 0.32;
        }
      })()
    `
  });
  for (let i = 0; i < 30; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.game && window.game.cameraRig) {
            window.game.cameraRig.yaw += 0.025;
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 5: Пьедестал выбора героя Lineage 2 C1 (3.0 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 5] Переход в Зал Героев C1 (character-select)...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/character-select.html' });
  await sleep(4000);
  setSceneDir('scene5_char_select');
  for (let i = 0; i < 30; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.roomGroup) window.roomGroup.rotation.y += 0.04;
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 6: Линейка классов на лужайке (3.0 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 6] Создание и смена классов на лужайке...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const b = document.getElementById('cs-btn-create');
        if (b) b.click();
      })()
    `
  });
  await sleep(1500);
  setSceneDir('scene6_char_create');
  for (let step = 0; step < 3; step++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const arrow = document.querySelector('.l2create-arrow[data-spin="cls"][data-dir="1"]') || document.getElementById('cs-class-next');
          if (arrow) arrow.click();
        })()
      `
    });
    await sleep(900);
  }

  await send('Page.stopScreencast');
  console.log('⏹️ Запись всех живых сцен завершена!');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}

  console.log('Проверка записанных сцен:');
  const dirs = fs.readdirSync(FRAMES_DIR);
  dirs.forEach(d => {
    const p = path.join(FRAMES_DIR, d);
    if (fs.statSync(p).isDirectory()) {
      const count = fs.readdirSync(p).length;
      console.log(`  📁 ${d}: ${count} кадров`);
    }
  });
}

run().catch(console.error);
