// ============================================================
//  SCRIPTS / CAPTURE_DYNAMIC_GAMEPLAY.JS
//  Запись живого сверхдинамичного геймплея Project Steam (1080x1920 VERTICAL)
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_dyn_rec_' + Date.now());
const FRAMES_DIR = path.join(REPO, 'dynamic_gameplay_frames');
const PORT = 9250;

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

  console.log('🚀 Запуск Edge в нативном вертикальном 1080x1920...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1080,1920',
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
  if (!ready) { edge.kill(); return; }

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

  console.log('Навигация на game.html в 1080x1920...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });

  console.log('⏳ Ожидание загрузки 3D мира и ассетов (8 сек)...');
  await sleep(8000);

  // Подготовка клиента: чистим лишние окна, настраиваем камеру и экипировку
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const m = document.getElementById('ps-starter-welcome-modal');
        if (m) m.remove();
        const fps = document.getElementById('cs-debug-fps') || document.getElementById('fps-counter');
        if (fps) fps.style.display = 'none';

        // Скрываем чат для чистого киношного кадра
        const chat = document.querySelector('.l2-chat') || document.getElementById('chat-window');
        if (chat) chat.style.display = 'none';

        if (window.game && window.game.player) {
          const p = window.game.player;
          if (window.game.inventory) {
            window.game.inventory.addItem('revolution_sword', 1);
            const w = window.game.inventory.slots.find(s => s && s.templateId === 'revolution_sword');
            if (w) window.game.inventory.equipItem(w.uid);
          }
          if (p.mesh) {
            p.mesh.position.set(-100, 0.9, -240); // Начало мощеной улицы
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

  console.log('🔴 СТАРТ SCREENCAST (1080x1920, quality 95)...');
  await send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    maxWidth: 1080,
    maxHeight: 1920,
    everyNthFrame: 1
  });

  // ============================================================
  // СЦЕНА 1: ДИНАМИЧНЫЙ БЕГ ГЕРОЯ ПО УЛИЦЕ (3.0 сек, 90 кадров)
  // Герой БЕЖИТ на полной скорости, ноги работают, камера летит за ним!
  // ============================================================
  console.log('🎬 [СЦЕНА 1] Стремительный спринт героя по мощеной улице...');
  setSceneDir('scene1_hero_sprint');
  for (let i = 0; i < 90; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const p = window.game && window.game.player;
          const rig = window.game && window.game.cameraRig;
          if (p && p.mesh) {
            // Герой реально перемещается вперед по площади!
            p.mesh.position.x += 0.35;
            p.mesh.position.z += 0.45;
            p.facing = Math.atan2(0.35, 0.45);
            p.isMoving = true;
            if (p._charModel && typeof p._charModel.playRun === 'function') {
              p._charModel.playRun();
            }
          }
          if (rig) {
            rig.dist = 3.6; // Близкая кинематографичная камера
            rig.pitch = 0.14; // Мужественный ракурс чуть снизу
            rig.yaw = Math.PI * 0.22 + Math.sin(${i} * 0.05) * 0.08; // Живое покачивание
          }
        })()
      `
    });
    await sleep(33); // ~30 FPS
  }

  // ============================================================
  // СЦЕНА 2: ЗАХВАТ ЦЕЛИ И ВСПЫШКА СОУЛШОТА (2.5 сек, 75 кадров)
  // Герой встречает врага, берет в таргет, клинок вспыхивает золотым сиянием!
  // ============================================================
  console.log('🎬 [СЦЕНА 2] Захват цели и вспышка соулшота...');
  setSceneDir('scene2_target_soulshot');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const p = window.game && window.game.player;
        const rig = window.game && window.game.cameraRig;
        if (p && p.mesh) {
          p.isMoving = false;
          if (p._charModel && typeof p._charModel.playIdle === 'function') {
            p._charModel.playIdle();
          }
          // Эффект вспышки соулшота
          if (window.game.ui && window.game.ui.showSoulshotGlow) {
            window.game.ui.showSoulshotGlow();
          }
          if (window.SkillVFX && window.SkillVFX.playFlashBurst) {
            window.SkillVFX.playFlashBurst(p);
          }
        }
        if (rig) {
          rig.dist = 3.2;
          rig.pitch = 0.16;
          rig.yaw = Math.PI * 0.45; // Сбоку-спереди — вид на оружие и лицо!
        }
      })()
    `
  });

  for (let i = 0; i < 75; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const rig = window.game && window.game.cameraRig;
          if (rig) {
            rig.yaw += 0.015; // Плавный облет
            rig.dist = 3.2 - Math.sin(${i} * 0.04) * 0.3; // Наезд камеры на клинок
          }
        })()
      `
    });
    await sleep(33);
  }

  // ============================================================
  // СЦЕНА 3: СЕРИЯ БОЕВЫХ УДАРОВ И ВЫЛЕТАЮЩИЕ КРИТИЧЕСКИЕ ЦИФРЫ (3.0 сек, 90 кадров)
  // Удары оружием, вспышки искр, соулшот, криты 💥 384!
  // ============================================================
  console.log('🎬 [СЦЕНА 3] Серия сокрушительных ударов и критический урон...');
  setSceneDir('scene3_combat_crits');
  for (let i = 0; i < 90; i++) {
    const isStrike = (i % 22 === 0);
    const isCrit = (i % 44 === 0);
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const p = window.game && window.game.player;
          const rig = window.game && window.game.cameraRig;
          const ui = window.game && window.game.ui;

          if (${isStrike} && p) {
            p.attack();
            if (p._charModel && typeof p._charModel.playAttack === 'function') {
              p._charModel.playAttack();
            }
            if (ui && ui.showFloatingDamage && p.mesh) {
              const dmg = ${isCrit} ? 485 : 210;
              const pos = p.mesh.position.clone();
              pos.x += 1.2;
              pos.y += 1.4;
              pos.z += 0.8;
              ui.showFloatingDamage(pos, dmg, ${isCrit});
            }
          }

          if (rig) {
            rig.dist = 3.1;
            rig.pitch = 0.18;
            rig.yaw = Math.PI * 0.70 + Math.sin(${i} * 0.08) * 0.12;
            // Тряска камеры при ударе
            if (${isStrike}) {
              rig.pitch += 0.03;
            }
          }
        })()
      `
    });
    await sleep(33);
  }

  // ============================================================
  // СЦЕНА 4: МАГИЧЕСКИЙ ВЗРЫВ И ЗОЛОТОЙ LEVEL UP ДО НЕБЕС (3.2 сек, 96 кадров)
  // Столб золотого света, искры ауры, вращающаяся мандала!
  // ============================================================
  console.log('🎬 [СЦЕНА 4] Магический всплеск и золотой Level Up...');
  setSceneDir('scene4_levelup_aura');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const p = window.game && window.game.player;
        if (p) {
          if (window.SkillVFX && window.SkillVFX.playLevelUp) {
            window.SkillVFX.playLevelUp(p, { level: 21 });
          }
          if (p._charModel && typeof p._charModel.playCastHeal === 'function') {
            p._charModel.playCastHeal();
          }
        }
      })()
    `
  });

  for (let i = 0; i < 96; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const rig = window.game && window.game.cameraRig;
          if (rig) {
            // Камера эффектно отъезжает и поднимается вверх, показывая столб света до неба
            rig.dist = 3.2 + (${i} * 0.035);
            rig.pitch = 0.15 + (${i} * 0.002);
            rig.yaw += 0.02;
          }
        })()
      `
    });
    await sleep(33);
  }

  // ============================================================
  // СЦЕНА 5: КИНЕМАТОГРАФИЧНЫЙ ОБЛЕТ ГЕРОЯ 360° (3.5 сек, 105 кадров)
  // Крупный план, ветер, волосы, сверкающий меч, эпичный вид
  // ============================================================
  console.log('🎬 [СЦЕНА 5] Кинематографичный 360° облет экипированного героя...');
  setSceneDir('scene5_hero_showcase');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const p = window.game && window.game.player;
        if (p && p._charModel && typeof p._charModel.playIdle === 'function') {
          p._charModel.playIdle();
        }
      })()
    `
  });

  for (let i = 0; i < 105; i++) {
    await send('Runtime.evaluate', {
      expression: `
        (function() {
          const rig = window.game && window.game.cameraRig;
          if (rig) {
            rig.dist = 2.8; // Крупный план героя
            rig.pitch = 0.12; // Взгляд на уровне груди снизу вверх
            rig.yaw += 0.035; // Быстрый кинематографичный облет на 360 градусов!
          }
        })()
      `
    });
    await sleep(33);
  }

  console.log('⏹️ Остановка screencast...');
  await send('Page.stopScreencast');
  await sleep(1000);

  ws.close();
  edge.kill();
  console.log('✅ Все живые сцены успешно записаны в', FRAMES_DIR);
}

run().catch(console.error);
