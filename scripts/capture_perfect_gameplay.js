// ============================================================
//  SCRIPTS / CAPTURE_PERFECT_GAMEPLAY.JS
//  Живая запись идеального геймплея из игры:
//  Экипированный персонаж с оружием, волосами, анимациями бега, боя и VFX
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_live_perf_' + Date.now());
const FRAMES_DIR = path.join(REPO, 'live_gameplay_frames');
const PORT = 9231;

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

  console.log('🚀 Запуск Edge (1920x1080) для записи идеального живого геймплея...');
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
  if (!ready) return edge.kill();

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
    level: 20,
    exp: 4500,
    sp: 320,
    cls: 'operator',
    className: 'Оператор',
    classTier: 0,
    classHistory: ['operator'],
    race: 'human',
    gender: 'male',
    hp: 850,
    maxHp: 850,
    energy: 280,
    maxEnergy: 280,
    pAtk: 75,
    pDef: 85,
    cAtk: 25,
    cDef: 60,
    karma: 0,
    appearance: {
      hairId: 'hair1',
      hairColor: '#e29b38',
      faceId: 'face1',
      weaponId: 'revolution_sword'
    }
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
  console.log('⏳ Ожидание загрузки 3D мира (8 сек)...');
  await sleep(8000);

  // Кастомизация и экипировка персонажа прямо в памяти игры
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const m = document.getElementById('ps-starter-welcome-modal');
        if (m) m.remove();
        const fps = document.getElementById('cs-debug-fps') || document.getElementById('fps-counter');
        if (fps) fps.style.display = 'none';

        if (window.game && window.game.player) {
          const p = window.game.player;
          // Добавляем оружие и броню в инвентарь если есть
          if (window.game.inventory) {
            window.game.inventory.addItem('revolution_sword', 1);
            window.game.inventory.addItem('wooden_breastplate', 1);
            window.game.inventory.addItem('wooden_gaiters', 1);
            const w = window.game.inventory.slots.find(s => s && s.templateId === 'revolution_sword');
            if (w) window.game.inventory.equipItem(w.uid);
          }
          // Обновляем визуальную модель персонажа с волосами и оружием
          if (window.CharModel && p.mesh) {
            try {
              window.CharModel.setHair(p.mesh, 'hair1', '#e29b38');
              window.CharModel.attachWeapon(p.mesh, 'revolution_sword');
            } catch(e) {}
          }
        }
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

  console.log('🔴 СТАРТ SCREENCAST (1080p, quality 95)...');
  await send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: 1920,
    maxHeight: 1080,
    everyNthFrame: 1
  });

  // ============================================================
  // СЦЕНА 1: Эпичный крупный план героя с мечом (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 1] Крупный план героя с мечом и облет камеры...');
  setSceneDir('scene1_hero_cinematic');
  for (let i = 0; i < 32; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.game && window.game.cameraRig) {
            const rig = window.game.cameraRig;
            rig.dist = 4.2; // Крупный план!
            rig.pitch = 0.20; // Чуть снизу вверх — эпичный ракурс
            rig.yaw += 0.045; // Плавное вращение вокруг героя
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 2: Динамичный бег по брусчатке к воротам форта (3.5 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 2] Динамичный бег героя по площади...');
  setSceneDir('scene2_hero_running');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.player) {
          const p = window.game.player;
          p.moveTo(new THREE.Vector3(p.pos.x + 60, p.pos.y, p.pos.z + 75));
          if (window.game.cameraRig) {
            window.game.cameraRig.dist = 5.8;
            window.game.cameraRig.pitch = 0.28;
            window.game.cameraRig.yaw = Math.PI * 0.18;
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
            window.game.cameraRig.yaw += 0.02;
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 3: Бой, соулшот, взмах клинка и криты (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 3] Бой, удары меча, сияние соулшота и урон...');
  setSceneDir('scene3_hero_combat');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.player) {
          const p = window.game.player;
          p.isMoving = false;
          if (window.game.cameraRig) {
            window.game.cameraRig.dist = 4.5;
            window.game.cameraRig.pitch = 0.22;
            window.game.cameraRig.yaw = Math.PI * 0.25;
          }
          if (window.game.ui && window.game.ui.showSoulshotGlow) {
            window.game.ui.showSoulshotGlow();
          }
        }
      })()
    `
  });

  for (let i = 0; i < 32; i++) {
    if (i % 8 === 0) {
      await send('Runtime.evaluate', {
        expression: `
          (function() {
            if (window.game && window.game.player) {
              window.game.player.attack();
              if (window.game.ui && window.game.ui.showFloatingDamage) {
                window.game.ui.showFloatingDamage(
                  window.game.player.pos,
                  Math.floor(210 + Math.random() * 95),
                  true
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
  // СЦЕНА 4: Золотой взрыв Level Up и сияние ауры (3.0 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 4] Сияющая мандала Level Up и восходящий свет...');
  setSceneDir('scene4_hero_levelup');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.spawnAuraBurstVfx && window.game && window.game.player && window.game.player.mesh) {
          window.spawnAuraBurstVfx(window.game.scene, window.game.player.mesh.position, {
            innerHex: '#ffffff',
            hex: '#ffbb00',
            duration: 3.2
          });
        }
        if (window.game && window.game.cameraRig) {
          window.game.cameraRig.dist = 5.2;
          window.game.cameraRig.pitch = 0.28;
        }
      })()
    `
  });
  for (let i = 0; i < 30; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.game && window.game.cameraRig) {
            window.game.cameraRig.yaw += 0.03;
          }
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 5: Зал выбора персонажа на пьедестале C1 (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 5] Переход в Зал Героев C1 (character-select)...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/character-select.html' });
  await sleep(4000);
  // Скрываем FPS дебаг
  await send('Runtime.evaluate', {
    expression: `
      const f = document.getElementById('cs-debug-fps');
      if (f) f.style.display = 'none';
    `
  });
  setSceneDir('scene5_char_select');
  for (let i = 0; i < 32; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          if (window.roomGroup) window.roomGroup.rotation.y += 0.045;
        })()
      `
    });
    await sleep(100);
  }

  // ============================================================
  // СЦЕНА 6: Линейка классов и кастомизация на лужайке (3.2 сек)
  // ============================================================
  console.log('🎬 [СЦЕНА 6] Смена классов и кастомизация на лужайке...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const b = document.getElementById('cs-btn-create');
        if (b) b.click();
        const f = document.getElementById('cs-debug-fps');
        if (f) f.style.display = 'none';
      })()
    `
  });
  await sleep(1500);
  setSceneDir('scene6_char_create');
  for (let step = 0; step < 4; step++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const arrow = document.querySelector('.l2create-arrow[data-spin="cls"][data-dir="1"]') || document.getElementById('cs-class-next');
          if (arrow) arrow.click();
          const f = document.getElementById('cs-debug-fps');
          if (f) f.style.display = 'none';
        })()
      `
    });
    await sleep(800);
  }

  await send('Page.stopScreencast');
  console.log('⏹️ Запись завершена!');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}

  console.log('Итог записанных кадров:');
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
