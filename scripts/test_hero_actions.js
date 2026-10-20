const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = require('path').join(require('os').tmpdir(), 'edge_test_anim_' + Date.now());
const PORT = 9229;

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
  console.log('🚀 Тестирование интерактивности и анимаций в игре...');
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
  for (let i = 0; i < 20; i++) {
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
      } catch(e) {}
    `
  });

  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
  console.log('Ожидание входа в 3D мир (7 сек)...');
  await sleep(7000);

  // 1. Закрываем диалог приветствия
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const d = document.querySelector('.starter-greeting-modal, .l2-dialog, #starter-modal');
        if (d) d.style.display = 'none';
        const btns = Array.from(document.querySelectorAll('button'));
        const b = btns.find(x => x.textContent.includes('К БОТУ') || x.textContent.includes('Закрыть'));
        if (b) b.click();
        // Скрываем FPS дебаг если есть
        const fps = document.getElementById('debug-fps') || document.getElementById('fps-counter');
        if (fps) fps.style.display = 'none';
      })()
    `
  });
  await sleep(1000);

  // 2. Настраиваем камеру на персонажа под кинематографичным углом (Lineage 2 Cinematic)
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.cameraRig) {
          window.game.cameraRig.dist = 6.5; // поближе к персонажу
          window.game.cameraRig.pitch = 0.28; // чуть снизу вверх, герой выглядит монументально
          window.game.cameraRig.yaw = Math.PI * 0.15; // вид с плеча в 3/4
        }
      })()
    `
  });
  await sleep(500);

  // Снимок 1: Кинематографичный вид персонажа
  let shot1 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  fs.writeFileSync('scratch_cinematic_hero.jpg', Buffer.from(shot1.data, 'base64'));
  console.log('Кадр 1: scratch_cinematic_hero.jpg');

  // 3. Отправляем персонажа в динамичный бег вперед
  console.log('Запуск бега персонажа...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.game && window.game.player) {
          const p = window.game.player;
          const targetPos = new THREE.Vector3(p.pos.x + 35, p.pos.y, p.pos.z + 45);
          p.moveTo(targetPos);
        }
      })()
    `
  });
  await sleep(1500);

  // Снимок 2: Бег персонажа
  let shot2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  fs.writeFileSync('scratch_hero_running.jpg', Buffer.from(shot2.data, 'base64'));
  console.log('Кадр 2: scratch_hero_running.jpg');

  // 4. Запуск Level Up эффекта и соулшота
  console.log('Запуск спецэффекта Level Up & Soulshot...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (window.spawnAuraBurstVfx && window.game && window.game.player && window.game.player.mesh) {
          window.spawnAuraBurstVfx(window.game.scene, window.game.player.mesh.position, {
            innerHex: '#ffffff',
            hex: '#ffaa00',
            duration: 2.5
          });
        }
        if (window.game && window.game.ui && window.game.ui.showSoulshotGlow) {
          window.game.ui.showSoulshotGlow();
        }
      })()
    `
  });
  await sleep(400);

  // Снимок 3: Вспышка ауры / Level Up
  let shot3 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 95 });
  fs.writeFileSync('scratch_hero_vfx.jpg', Buffer.from(shot3.data, 'base64'));
  console.log('Кадр 3: scratch_hero_vfx.jpg');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

run().catch(console.error);
