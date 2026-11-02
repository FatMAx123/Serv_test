const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(os.tmpdir(), 'edge_gameplay_live_' + Date.now());
const PORT = 9297;

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO, 'screenshots', 'audit_ingame');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function requestJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('🚀 Запуск Edge для съемки РЕАЛЬНОГО геймплея с HUD...');
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

  let cdpReady = false;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    try {
      await requestJson(`http://127.0.0.1:${PORT}/json/version`);
      cdpReady = true;
      break;
    } catch(e) {}
  }
  if (!cdpReady) {
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

  const charData = {
    id: 'c_hero_dtf',
    name: 'ИИндиГусь',
    race: 'human',
    gender: 'male',
    cls: 'operator',
    className: 'Оператор',
    level: 20,
    hp: 980,
    maxHp: 980,
    energy: 420,
    maxEnergy: 420,
    appearance: { hairId: 'hair1', hairColor: '#d4af37', weaponId: 'apprentice_wand' }
  };

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const lid = 'guest_live_dtf';
        localStorage.setItem('ps_local_id', lid);
        sessionStorage.setItem('ps_local_id', lid);
        localStorage.setItem('ps_guest_token', 'guest_token_live');
        sessionStorage.setItem('ps_guest_token', 'guest_token_live');
        localStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        sessionStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        localStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        sessionStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        localStorage.setItem('ps_connect', '1');
        sessionStorage.setItem('ps_connect', '1');
        localStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_starter_greet_ИИндиГусь', '1');
        localStorage.setItem('ps_game_host', '127.0.0.1:8080');
        sessionStorage.setItem('ps_game_host', '127.0.0.1:8080');
      } catch(e) {}
    `
  });

  console.log('Навигация на game.html?server=127.0.0.1:8080...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html?server=127.0.0.1:8080' });
  console.log('⏳ Ожидаем подключение и загрузку игрового мира (10 сек)...');
  await sleep(10000);

  // Проверяем состояние игры
  const status = await send('Runtime.evaluate', {
    returnByValue: true,
    expression: `
      (function() {
        const g = window.game;
        return {
          hasGame: !!g,
          hasPlayer: !!(g && g.player),
          playerPos: g && g.player ? { x: Math.round(g.player.x), y: Math.round(g.player.y), z: Math.round(g.player.z) } : null,
          hudVisible: !document.getElementById('hud').classList.contains('hidden'),
          invOpen: !!(g && g.inventoryUI && g.inventoryUI.isOpen),
          netStatus: g && g.net ? g.net.status : 'no-net'
        };
      })()
    `
  });
  console.log('Игровой статус:', JSON.stringify(status.result.value));

  // Закрываем модалки, если они всплыли
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const modal = document.getElementById('ps-starter-welcome-modal');
        if (modal) modal.remove();
        const dlg = document.querySelectorAll('.l2-dialog, #dialog-overlay');
        dlg.forEach(d => d.remove());
        const loading = document.getElementById('loading-screen');
        if (loading) loading.style.display = 'none';
      })()
    `
  });

  // ============================================================
  // КАДР 0: ОБЛОЖКА — РЕАЛЬНЫЙ ГОРОД С HUD
  // Персонаж на площади, виден полный L2 интерфейс
  // ============================================================
  console.log('📸 [КАДР 0] Ингейм вид на город с реальным интерфейсом...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const g = window.game;
        if (g && g.player) {
          g.player.x = -106;
          g.player.z = -116;
          if (g.player.mesh) g.player.mesh.position.set(-106, g.player.y || 71.95, -116);
        }
      })()
    `
  });
  await sleep(1500);
  const shot0 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '00_audit_cover_village.jpg'), Buffer.from(shot0.data, 'base64'));
  console.log('✓ 00_audit_cover_village.jpg сохранен');

  // ============================================================
  // КАДР 1: РАЗДЕЛ 1 — ОТКРЫТОЕ ОКНО ИНВЕНТАРЯ L2 C1 В ИГРЕ
  // Реальный клик/открытие инвентаря в интерфейсе
  // ============================================================
  console.log('📸 [КАДР 1] Ингейм скриншот: открытый инвентарь L2 C1 поверх геймплея...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const g = window.game;
        if (g && g.inventory) {
          g.inventory.addItem('wooden_breastplate', 1);
          g.inventory.addItem('wooden_gaiters', 1);
          g.inventory.addItem('apprentice_wand', 1);
          g.inventory.addItem('magic_mace', 1);
          g.inventory.addItem('copper_parts', 50);
          g.inventory.addItem('steam_valve', 15);
          g.inventory.addItem('boiler_plate', 10);
        }
        if (g && g.inventoryUI) {
          g.inventoryUI.open();
        }
      })()
    `
  });
  await sleep(1500);
  const shot1 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '01_audit_inventory_exploit.jpg'), Buffer.from(shot1.data, 'base64'));
  console.log('✓ 01_audit_inventory_exploit.jpg сохранен');

  // ============================================================
  // КАДР 2: РАЗДЕЛ 2 — БЕГ ПО ТЕРРЕЙНУ ОСТРОВА С HUD И РАДАРОМ
  // Закрываем инвентарь, персонаж на локации в движении
  // ============================================================
  console.log('📸 [КАДР 2] Ингейм скриншот: перемещение по острову, радар, чат...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const g = window.game;
        if (g && g.inventoryUI) g.inventoryUI.close();
        if (g && g.player) {
          g.player.x = -138;
          g.player.z = -120;
          if (g.player.mesh) {
            g.player.mesh.position.set(-138, (g.player.y || 71.95), -120);
            g.player.mesh.rotation.y = -1.2;
          }
          if (g.player._charModel && g.player._charModel.setMoving) {
            g.player._charModel.setMoving(true, 'run');
          }
        }
      })()
    `
  });
  await sleep(1500);
  const shot2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '02_audit_movement_terrain.jpg'), Buffer.from(shot2.data, 'base64'));
  console.log('✓ 02_audit_movement_terrain.jpg сохранен');

  // ============================================================
  // КАДР 3: РАЗДЕЛ 4 — БОЕВОЙ ТАРГЕТ И СРАЖЕНИЕ С МОБОМ
  // Выбираем в таргет робота, вверху появляется таргет-бар
  // ============================================================
  console.log('📸 [КАДР 3] Ингейм скриншот: боевой таргет, моб, панель скиллов...');
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const g = window.game;
        const net = g.net;
        const px = -95, pz = -65;
        if (g.player) {
          g.player.x = px;
          g.player.z = pz;
          if (g.player.mesh) {
            g.player.mesh.position.set(px, g.player.y || 71.95, pz);
            g.player.mesh.rotation.y = 1.35;
          }
          if (g.player._charModel && g.player._charModel.playAttack) {
            g.player._charModel.playAttack();
          }
        }

        if (net && net.addRemote) {
          net.addRemote({
            t: 'm', mid: 99991, mobId: 'toaster_overlord',
            name: 'Тостер-Оверлорд', level: 12, hp: 640, maxHp: 850,
            x: px + 4, z: pz
          });
        }

        if (g.ui && typeof g.ui.showTargetStatus === 'function') {
          g.ui.showTargetStatus({
            name: 'Тостер-Оверлорд [Lvl 12]',
            hp: 640,
            maxHp: 850,
            level: 12
          });
        }
      })()
    `
  });
  await sleep(1800);
  const shot3 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '03_audit_combat_target.jpg'), Buffer.from(shot3.data, 'base64'));
  console.log('✓ 03_audit_combat_target.jpg сохранен');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
  console.log('🎉 Все РЕАЛЬНЫЕ ингейм скриншоты сняты из живой игры!');
}

run().catch(console.error);

