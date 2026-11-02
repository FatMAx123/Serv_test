const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO, 'screenshots', 'audit_ingame');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_audit_perfect_' + Date.now());
const PORT = 9298;

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

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
  console.log('🚀 1. Запуск статического веб-сервера...');
  const server = spawn('node', ['server/static-http.js'], { stdio: 'inherit' });

  let srvReady = false;
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    try {
      await new Promise((res, rej) => {
        http.get('http://127.0.0.1:3000/game.html', (r) => {
          if (r.statusCode === 200) res(); else rej();
        }).on('error', rej);
      });
      srvReady = true;
      break;
    } catch(e) {}
  }
  if (!srvReady) {
    console.error('Сервер не поднялся!');
    server.kill();
    return;
  }

  console.log('🎬 2. Запуск Microsoft Edge в режиме 1920x1080...');
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
    console.error('Edge CDP не ответил!');
    edge.kill();
    server.kill();
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
    id: 'c_hero_audit',
    name: 'AindieGus',
    race: 'human',
    gender: 'male',
    cls: 'operator',
    className: 'Оператор',
    level: 24,
    hp: 1250,
    maxHp: 1250,
    energy: 480,
    maxEnergy: 480,
    appearance: { hairId: 'hair1', hairColor: '#d4af37', weaponId: 'apprentice_wand' }
  };

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const lid = 'guest_audit_hero';
        localStorage.setItem('ps_local_id', lid);
        sessionStorage.setItem('ps_local_id', lid);
        localStorage.setItem('ps_guest_token', 'guest_token_audit');
        sessionStorage.setItem('ps_guest_token', 'guest_token_audit');
        localStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        sessionStorage.setItem('ps_characters', JSON.stringify([${JSON.stringify(charData)}]));
        localStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        sessionStorage.setItem('ps_selected_char', JSON.stringify(${JSON.stringify(charData)}));
        localStorage.setItem('ps_connect', '1');
        sessionStorage.setItem('ps_connect', '1');
        localStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_starter_greet_AindieGus', '1');
        let _netWS;
        Object.defineProperty(window, 'NetWS', {
          get: () => _netWS,
          set: (cls) => {
            _netWS = cls;
            cls.prototype.connectFromMenu = async function() {
              this.status = 'online';
              this.connected = true;
              return true;
            };
            cls.prototype._onServerLost = function() {};
            cls.prototype._showLostOverlay = function() {};
          },
          configurable: true
        });
      } catch(e) {}
    `
  });

  console.log('🌐 3. Навигация на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
  console.log('⏳ Ожидаем полную загрузку Three.js мира (9 сек)...');
  await sleep(9000);

  // Настройка съёмочной студии
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        // Жесткая зачистка всех паразитных окон и диалогов
        const style = document.createElement('style');
        style.id = 'ps-audit-studio-css';
        style.textContent = \`
          #loading-screen, #fatal-banner, #ps-starter-welcome-modal,
          #ps-starter-modal-overlay, .l2-starter-welcome-modal,
          #death-overlay, .l2-dialog, #dialog-overlay, #dungeon-banner,
          [id*="starter-welcome"], [class*="welcome-modal"],
          #gm-quick-bar, #editor-btn, #cs-debug-fps, #fps-counter,
          #mobile-controls, .mobile-controls {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
          #inventory-window {
            z-index: 999999 !important;
          }
        \`;
        document.head.appendChild(style);

        const badSelectors = [
          '#loading-screen', '#fatal-banner', '#ps-starter-welcome-modal',
          '#death-overlay', '.l2-dialog', '#ps-starter-modal-overlay',
          '#dialog-overlay', '[id*="starter-welcome"]', '[class*="welcome-modal"]'
        ];
        badSelectors.forEach(s => {
          document.querySelectorAll(s).forEach(el => el.remove());
        });

        if (window.game) {
          if (window.game.cameraRig) window.game.cameraRig.update = function() {};
          if (window.game.updateNPCInteractions) window.game.updateNPCInteractions = function() {};
        }

        if (window.game && window.game.renderer) {
          const r = window.game.renderer;
          r.toneMapping = THREE.ACESFilmicToneMapping;
          r.toneMappingExposure = 1.18;
          r.outputColorSpace = THREE.SRGBColorSpace;
        }

        window.getGroundY = function(x, z, fallback = 71.0) {
          if (window.Terrain && typeof window.Terrain.standY === 'function') {
            const gy = window.Terrain.standY(x, z);
            if (gy != null && isFinite(gy)) return gy;
          }
          if (window.TerrainHeight && typeof window.TerrainHeight.standYAt === 'function') {
            const gy = window.TerrainHeight.standYAt(x, z);
            if (gy != null && isFinite(gy)) return gy;
          }
          if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
            const gy = window.Terrain.heightAt(x, z);
            if (gy != null && isFinite(gy)) return gy;
          }
          return fallback;
        };

        window.placeHero = function(px, pz, rotY) {
          const p = window.game.player;
          if (!p) return { gy: 71, meshY: 71.95 };
          const gy = window.getGroundY(px, pz, 71.0);
          const meshY = gy + 0.95;

          p.x = px;
          p.y = meshY;
          p.z = pz;
          p.targetX = px;
          p.targetZ = pz;
          p.target = null;
          p.isMoving = false;
          p.autoAttacking = false;
          p.facing = rotY;

          if (p.mesh) {
            p.mesh.position.set(px, meshY, pz);
            p.mesh.rotation.y = rotY;
          }
          if (p.shadow) {
            p.shadow.position.set(px, gy + 0.02, pz);
          }
          if (p._auraRoot) {
            p._auraRoot.position.set(px, gy + 0.03, pz);
            p._auraRoot.rotation.y = rotY;
          }
          p.update = function() {};
          return { gy, meshY };
        };

        window.setupCamera = function(camPos, lookTarget, dutchTiltDeg = 0) {
          const cam = window.game.camera;
          cam.up.set(0, 1, 0);
          cam.position.set(camPos.x, camPos.y, camPos.z);
          cam.lookAt(lookTarget.x, lookTarget.y, lookTarget.z);

          if (dutchTiltDeg !== 0) {
            const rad = (dutchTiltDeg * Math.PI) / 180;
            const qTilt = new THREE.Quaternion();
            qTilt.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rad);
            cam.quaternion.multiply(qTilt);
          }

          cam.fov = 48;
          cam.updateProjectionMatrix();
          cam.updateMatrixWorld(true);
        };

        window.styleHero = async function(opts = {}) {
          const g = window.game;
          const p = g.player;
          if (!p) return;

          if (window.CharModel && p.mesh) {
            try {
              await window.CharModel.setHair(p.mesh, 'hair1', '#d4af37');
            } catch(e) {}
          }

          const weaponId = opts.weaponId || 'apprentice_wand';
          if (window.CharModel && p.mesh) {
            try {
              await window.CharModel.attachWeaponPart(p.mesh, weaponId, 4);
            } catch(e) {}
          }

          const auraId = opts.auraId || 'hero_aura';
          if (typeof p.setAura === 'function') {
            try { p.setAura(auraId); } catch(e) {}
          }

          if (opts.action === 'walk' && p._charModel && p._charModel.mixer) {
            p._charModel.setMoving && p._charModel.setMoving(true, 'walk');
            p._charModel.mixer.setTime(0.38);
            p._charModel.mixer.timeScale = 0;
          } else if (opts.action === 'attack' && p._charModel && p._charModel.mixer) {
            p._charModel.playAttack();
            p._charModel.mixer.setTime(0.42);
            p._charModel.mixer.timeScale = 0;
          } else if (opts.action === 'cast' && p._charModel && p._charModel.mixer) {
            p._charModel.playCast('skill');
            p._charModel.mixer.setTime(0.55);
            p._charModel.mixer.timeScale = 0;
          }

          if (opts.soulshot && g.ui && typeof g.ui.showSoulshotGlow === 'function') {
            g.ui.showSoulshotGlow();
          }
        };

        window.cleanOverlays = function() {
          const bad = document.querySelectorAll('#ps-starter-welcome-modal, [id*="starter-welcome"], .l2-starter-welcome-modal');
          bad.forEach(b => b.remove());
        };
      })()
    `
  });
  await sleep(1000);

  // ============================================================
  // КАДР 0: ОБЛОЖКА — ПЛОЩАДЬ ДЕРЕВНИ ПОЮЩЕЙ СТАЛИ
  // Вид на стимпанк-монумент, часовую башню и персонажа
  // ============================================================
  console.log('📸 [КАДР 0] Обложка: Площадь Деревни...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        window.cleanOverlays();
        const px = -106.0;
        const pz = -116.0;
        const hPos = window.placeHero(px, pz, -2.55);
        await window.styleHero({ weaponId: 'apprentice_wand', auraId: 'hero_aura', action: 'walk' });
        window.setupCamera(
          { x: -108.0, y: hPos.gy + 2.2, z: -109.0 },
          { x: -123.0, y: hPos.gy + 5.5, z: -136.0 }
        );
        return { ok: true };
      })()
    `
  });
  await sleep(1800);
  const shot0 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '00_audit_cover_village.jpg'), Buffer.from(shot0.data, 'base64'));
  console.log('✓ 00_audit_cover_village.jpg сохранен');

  // ============================================================
  // КАДР 1: РАЗДЕЛ 1 — ИНВЕНТАРЬ L2 C1 (ЭКИПИРОВКА ИЗ ВОЗДУХА)
  // Персонаж слева лицом/полубоком к камере в светящейся ауре,
  // а справа открыто стильное окно инвентаря с реальными предметами Lineage 2 C1
  // ============================================================
  console.log('📸 [КАДР 1] Раздел 1: Открытый инвентарь L2 C1...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        window.cleanOverlays();
        // Персонаж на площади перед фонтаном, повернут к камере
        const px = -105.0;
        const pz = -114.0;
        const hPos = window.placeHero(px, pz, 0.75); // повернут лицом к зрителю
        await window.styleHero({ weaponId: 'magic_mace', auraId: 'champion_gold' });

        // Ракурс камеры: персонаж смещен в левую треть экрана
        window.setupCamera(
          { x: px - 1.6, y: hPos.gy + 1.45, z: pz + 2.6 },
          { x: px + 0.5, y: hPos.gy + 1.25, z: pz - 0.2 }
        );

        // Наполняем инвентарь культовыми предметами
        const g = window.game;
        if (g && g.inventory) {
          g.inventory.addItem('wooden_breastplate', 1);
          g.inventory.addItem('wooden_gaiters', 1);
          g.inventory.addItem('apprentice_wand', 1);
          g.inventory.addItem('magic_mace', 1);
          g.inventory.addItem('copper_parts', 45);
          g.inventory.addItem('steam_valve', 12);
          g.inventory.addItem('boiler_plate', 8);
          g.inventory.addItem('leather_armor', 1);
          g.inventory.addItem('leather_pants', 1);
        }

        // Открываем и аккуратно позиционируем окно инвентаря справа
        if (g && g.inventoryUI) {
          g.inventoryUI.open();
          const win = document.getElementById('inventory-window');
          if (win) {
            win.style.display = 'block';
            win.style.visibility = 'visible';
            win.style.opacity = '1';
            win.style.left = '56%';
            win.style.top = '12%';
          }
        }
        return { ok: true };
      })()
    `
  });
  await sleep(1800);
  const shot1 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '01_audit_inventory_exploit.jpg'), Buffer.from(shot1.data, 'base64'));
  console.log('✓ 01_audit_inventory_exploit.jpg сохранен');

  // ============================================================
  // КАДР 2: РАЗДЕЛ 2 — ДВИЖЕНИЕ И ТЕРРЕЙН (ИЗУМРУДНЫЙ ПАРК)
  // Персонаж на живописной аллее парка среди реликтовых деревьев и природы
  // ============================================================
  console.log('📸 [КАДР 2] Раздел 2: Бег по парку острова...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        window.cleanOverlays();
        // Закрываем инвентарь
        if (window.game && window.game.inventoryUI) {
          window.game.inventoryUI.close();
        }
        const win = document.getElementById('inventory-window');
        if (win) win.style.display = 'none';

        // Позиция на красивой аллее Изумрудного парка
        const px = -148.0;
        const pz = -124.0;
        const hPos = window.placeHero(px, pz, -1.2);
        await window.styleHero({ weaponId: 'apprentice_wand', auraId: 'hero_aura', action: 'walk' });

        // Камера охватывает перспективу парковой аллеи и деревьев
        window.setupCamera(
          { x: -140.0, y: hPos.gy + 1.85, z: -118.0 },
          { x: -152.0, y: hPos.gy + 2.2, z: -128.0 }
        );
        return { ok: true };
      })()
    `
  });
  await sleep(1800);
  const shot2 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '02_audit_movement_terrain.jpg'), Buffer.from(shot2.data, 'base64'));
  console.log('✓ 02_audit_movement_terrain.jpg сохранен');

  // ============================================================
  // КАДР 3: РАЗДЕЛ 4 — БОЙ С МОБАМИ НА ОТКРЫТОЙ ПОЛЯНЕ
  // Атака с сияющим оружием, Тостер-Оверлорд и Кофемашина, окно таргета
  // ============================================================
  console.log('📸 [КАДР 3] Раздел 4: Боевая сцена на поляне...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        window.cleanOverlays();
        const net = window.net || window.game.net;
        if (net && net.remote) {
          for (const [k, v] of net.remote) {
            if (v.sprite && v.sprite.parent) v.sprite.parent.remove(v.sprite);
            if (v.nameTag && v.nameTag.parent) v.nameTag.parent.remove(v.nameTag);
            if (v.shadow && v.shadow.parent) v.shadow.parent.remove(v.shadow);
            net.remote.delete(k);
          }
        }

        // Открытая поляна (без стен на линии обзора!)
        const px = -95.0;
        const pz = -65.0;
        const hPos = window.placeHero(px, pz, 1.35);

        await window.styleHero({
          weaponId: 'magic_mace',
          auraId: 'champion_gold',
          action: 'attack',
          soulshot: true
        });

        // Спавним боевых роботов на поляне
        const m1x = px + 4.2, m1z = pz - 0.4;
        const m2x = px + 3.4, m2z = pz + 2.4;
        const m3x = px + 6.2, m3z = pz + 1.2;

        if (net && net.addRemote) {
          net.addRemote({
            t: 'm', mid: 88882, mobId: 'toaster_overlord',
            name: 'Тостер-Оверлорд', level: 12, hp: 680, maxHp: 850,
            x: m1x, z: m1z, boss: false
          });
          net.addRemote({
            t: 'm', mid: 88883, mobId: 'scrapper',
            name: 'Скраппер-Утилизатор', level: 5, hp: 210, maxHp: 210,
            x: m2x, z: m2z, boss: false
          });
          net.addRemote({
            t: 'm', mid: 88884, mobId: 'steam_hound',
            name: 'Кофемашина-Бешеная', level: 7, hp: 340, maxHp: 340,
            x: m3x, z: m3z, boss: false
          });
        }

        // Показываем таргет в интерфейсе сверху
        if (window.game.ui && typeof window.game.ui.showTargetStatus === 'function') {
          window.game.ui.showTargetStatus({
            name: 'Тостер-Оверлорд [Lvl 12]',
            hp: 680,
            maxHp: 850,
            level: 12
          });
        }

        // Камера с широким ракурсом (никаких стен перед объективом!)
        window.setupCamera(
          { x: px - 2.8, y: hPos.gy + 1.85, z: pz + 2.8 },
          { x: px + 3.8, y: hPos.gy + 1.6, z: pz + 0.6 },
          2.5
        );
        return { ok: true };
      })()
    `
  });
  await sleep(2200);
  const shot3 = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '03_audit_combat_target.jpg'), Buffer.from(shot3.data, 'base64'));
  console.log('✓ 03_audit_combat_target.jpg сохранен');

  // Завершение
  ws.close();
  edge.kill();
  server.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
  console.log('🎉 Все 4 снимка успешно созданы и обновлены!');
}

run().catch(console.error);

