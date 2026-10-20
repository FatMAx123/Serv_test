// ============================================================
//  SCRIPTS / RECORD_SMOOTH_SHORTS.JS
//  Абсолютно плавная запись непрерывного живого геймплея (1080x1920, 30 FPS)
//  через нативный GPU MediaRecorder + requestAnimationFrame
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_smooth_final_' + Date.now());
const PORT = 9280;

const OUT_WEBM = path.join(REPO, 'smooth_gameplay_raw.webm');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('🚀 Запуск Edge (нативный 1080x1920, MediaRecorder GPU)...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1080,1920',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ]);

  let ready = false;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    try {
      const v = await new Promise((res, rej) => http.get(`http://127.0.0.1:${PORT}/json/version`, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
      }).on('error', rej));
      ready = true;
      break;
    } catch(e) {}
  }
  if (!ready) { edge.kill(); return; }

  const tabs = await new Promise(res => http.get(`http://127.0.0.1:${PORT}/json/list`, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }));
  const tab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || tabs[0];
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
    id: 'c0', name: 'AindieGus', level: 20, exp: 4500, sp: 320,
    cls: 'operator', className: 'Оператор', classTier: 0, classHistory: ['operator'],
    race: 'human', gender: 'male', hp: 850, maxHp: 850, energy: 280, maxEnergy: 280,
    pAtk: 75, pDef: 85, cAtk: 25, cDef: 60, karma: 0,
    appearance: { hairId: 'hair1', hairColor: '#e29b38', faceId: 'face1', weaponId: 'revolution_sword' }
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
  console.log('⏳ Ожидание полной инициализации мира и 3D ассетов (8.5 сек)...');
  await sleep(8500);

  console.log('🎬 СТАРТ НЕПРЕРЫВНОЙ СИНЕМАТИК-ЗАПИСИ (14.0 сек)...');
  const recResult = await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `
      new Promise(async (resolve) => {
        try {
          // Чистка интерфейса для киношного кадра
          const m = document.getElementById('ps-starter-welcome-modal');
          if (m) m.remove();
          const fps = document.getElementById('cs-debug-fps') || document.getElementById('fps-counter');
          if (fps) fps.style.display = 'none';
          const chat = document.querySelector('.l2-chat') || document.getElementById('chat-window');
          if (chat) chat.style.display = 'none';

          const canvas = (window.game && window.game.renderer && window.game.renderer.domElement) || document.querySelector('canvas');
          if (!canvas) return resolve({ error: 'no canvas' });

          const stream = canvas.captureStream(30);
          const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm';
          const rec = new MediaRecorder(stream, {
            mimeType: mime,
            videoBitsPerSecond: 12000000
          });

          const chunks = [];
          rec.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

          rec.onstop = () => {
            const blob = new Blob(chunks, { type: mime });
            const reader = new FileReader();
            reader.onloadend = () => {
              const base64 = reader.result.split(',')[1];
              resolve({ ok: true, size: blob.size, base64: base64 });
            };
            reader.readAsDataURL(blob);
          };

          rec.start(100);

          const p = window.game && window.game.player;
          const rig = window.game && window.game.cameraRig;
          const ui = window.game && window.game.ui;

          // Скрываем громоздкий текст ника над головой для киношной чистоты
          if (p && p.nameTag) {
            p.nameTag.visible = false;
          }

          // Экипируем оружие
          if (window.game && window.game.inventory) {
            window.game.inventory.addItem('revolution_sword', 1);
            const w = window.game.inventory.slots.find(s => s && s.templateId === 'revolution_sword');
            if (w) window.game.inventory.equipItem(w.uid);
          }

          // Стартовая позиция в городе на мощеной дороге
          if (p && p.mesh) {
            p.mesh.position.set(-100, 0.9, -240);
          }

          let t0 = performance.now();
          let lastT = t0;

          // Состояния хореографии (каждое действие вызывается РОВНО ОДИН РАЗ!)
          let phase = -1;

          function director(now) {
            const dt = Math.min(0.05, (now - lastT) / 1000);
            lastT = now;
            const elapsed = (now - t0) / 1000;

            // ========================================================
            // ФАЗА 1 (0.0 - 3.2 сек): СТРЕМИТЕЛЬНЫЙ СПРИНТ ПО ГОРОДУ
            // ========================================================
            if (elapsed < 3.2) {
              if (phase !== 1) {
                phase = 1;
                if (p) {
                  p.isMoving = true;
                  if (p._charModel && p._charModel.playRun) p._charModel.playRun(); // ВЫЗЫВАЕМ ТОЛЬКО 1 РАЗ!
                }
              }
              if (p && p.mesh) {
                const spd = 6.8; // 6.8 м/с — реалистичный бег
                p.mesh.position.x += 0.5 * spd * dt;
                p.mesh.position.z += 0.866 * spd * dt;
                p.facing = Math.atan2(0.5, 0.866);
              }
              if (rig) {
                rig.dist = 3.6;
                rig.pitch = 0.14;
                rig.yaw = Math.PI * 0.20 + Math.sin(elapsed * 1.8) * 0.06;
              }
            }
            // ========================================================
            // ФАЗА 2 (3.2 - 5.6 сек): ЗАХВАТ ЦЕЛИ И ВСПЫШКА СОУЛШОТА
            // ========================================================
            else if (elapsed < 5.6) {
              if (phase !== 2) {
                phase = 2;
                if (p) {
                  p.isMoving = false;
                  if (p._charModel && p._charModel.playIdle) p._charModel.playIdle();
                }
                if (ui && ui.showSoulshotGlow) ui.showSoulshotGlow();
                if (window.SkillVFX && window.SkillVFX.playFlashBurst) window.SkillVFX.playFlashBurst(p);
              }
              if (rig) {
                const localT = (elapsed - 3.2) / 2.4;
                rig.dist = 3.6 - localT * 0.6; // Плавный наезд камеры на героя
                rig.pitch = 0.14 + localT * 0.02;
                rig.yaw += 0.22 * dt;
              }
            }
            // ========================================================
            // ФАЗА 3 (5.6 - 8.4 сек): СОКРУШИТЕЛЬНЫЙ УДАР И КРИТ 💥 485
            // ========================================================
            else if (elapsed < 8.4) {
              if (phase !== 3) {
                phase = 3;
                if (p) {
                  p.attack();
                  if (p._charModel && p._charModel.playAttack) p._charModel.playAttack();
                }
                setTimeout(() => {
                  if (ui && ui.showFloatingDamage && p && p.mesh) {
                    const pos = p.mesh.position.clone();
                    pos.x += 1.0; pos.y += 1.3; pos.z += 0.8;
                    ui.showFloatingDamage(pos, 485, true);
                  }
                }, 350);
              }
              if (rig) {
                rig.dist = 3.0;
                rig.pitch = 0.16;
                rig.yaw += 0.18 * dt;
              }
            }
            // ========================================================
            // ФАЗА 4 (8.4 - 11.0 сек): ЗОЛОТОЙ LEVEL UP ДО НЕБЕС
            // ========================================================
            else if (elapsed < 11.0) {
              if (phase !== 4) {
                phase = 4;
                if (p && p._charModel && p._charModel.playCastHeal) {
                  p._charModel.playCastHeal();
                }
                if (window.SkillVFX && window.SkillVFX.playLevelUp) {
                  window.SkillVFX.playLevelUp(p, { level: 21 });
                }
              }
              if (rig) {
                const localT = (elapsed - 8.4) / 2.6;
                // Камера плавно отъезжает и поднимается вверх, показывая столб света до небес
                rig.dist = 3.0 + localT * 1.5;
                rig.pitch = 0.16 + localT * 0.08;
                rig.yaw += 0.25 * dt;
              }
            }
            // ========================================================
            // ФАЗА 5 (11.0 - 14.0 сек): КИНЕМАТОГРАФИЧНЫЙ 360° ОБЛЕТ ГЕРОЯ
            // ========================================================
            else if (elapsed < 14.0) {
              if (phase !== 5) {
                phase = 5;
                if (p && p._charModel && p._charModel.playIdle) p._charModel.playIdle();
              }
              if (rig) {
                rig.dist = 2.8; // Крупный план
                rig.pitch = 0.12; // Мужественный ракурс на уровне груди
                rig.yaw += 0.85 * dt; // Быстрый непрерывный киношный облет
              }
            }
            // ========================================================
            // ФИНАЛ: ОСТАНОВКА ЗАПИСИ
            // ========================================================
            else {
              rec.stop();
              return;
            }

            requestAnimationFrame(director);
          }

          requestAnimationFrame(director);

        } catch(e) {
          resolve({ error: e.message });
        }
      });
    `,
    returnByValue: true
  });

  const val = recResult.result.value;
  console.log('Результат записи:', { ok: val.ok, size: val.size, error: val.error });

  if (val.ok && val.base64) {
    fs.writeFileSync(OUT_WEBM, Buffer.from(val.base64, 'base64'));
    const sizeMb = (val.size / (1024 * 1024)).toFixed(2);
    console.log(`✅ НЕПРЕРЫВНОЕ ПЛАВНОЕ ВИДЕО СОХРАНЕНО: ${OUT_WEBM} (${sizeMb} МБ)`);
  }

  ws.close();
  edge.kill();
}

run().catch(console.error);
