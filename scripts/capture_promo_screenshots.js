// ============================================================
//  PROJECT STEAM: ORIGINS — AAA CINEMATIC PHOTO STUDIO
//  Профессиональная художественная съемка по канонам фотографии:
//  - Правило третей (Rule of Thirds) и золотые силовые точки
//  - Крупная, стильная и контрастная типографика (AAA Movie Poster)
//  - Лаконичные и емкие промо-тексты без мусора и духоты
//  - Многоплановость: передний, средний и дальний план (Depth Layering)
//  - Низкие и динамичные ракурсы (Low-Angle / Dutch Angle)
//  - Полная ликвидация визуального мусора, UI, 2D текста и плейсхолдеров
//  - Персонаж с прической, оружием, сияющей аурой героя и боевыми позами
// ============================================================
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO, 'screenshots', 'promo_gallery');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_promo_photo_' + Date.now());
const PORT = 9289;

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

// Премиальные, КРУПНЫЕ и стильные промо-тексты без мусора и духоты (AAA Game Poster)
const CINEMATIC_TITLES = [
  {
    tag: 'МИРОВОЙ РЕЙД-БОСС',
    title: 'TRALALERO TOASTERINO',
    desc: 'Смертоносный тостер-акула и легендарные трофеи',
    specs: ['РЕЙД 8 LVL', '38 000 HP', 'УНИКАЛЬНЫЙ ДРОП']
  },
  {
    tag: 'БОЕВАЯ СИСТЕМА C1',
    title: 'СОКРУШИТЕЛЬНЫЕ КОМБО',
    desc: 'Заряды духа Soulshots, сокрушительный крит и чистый экшен',
    specs: ['SOULSHOTS C1', 'КРИТ X2.0', 'ZERO-GC ENGINE']
  },
  {
    tag: 'СТОЛИЦА ОСТРОВА',
    title: 'ПЛОЩАДЬ ПОЮЩЕЙ СТАЛИ',
    desc: 'Стимпанк-монумент, часовая башня и оживленный рынок',
    specs: ['МИРНАЯ ЗОНА', 'ТОРГОВЫЙ РЫНОК', 'ЧАСОВАЯ БАШНЯ']
  },
  {
    tag: 'ОТКРЫТЫЙ МИР',
    title: 'ИЗУМРУДНЫЙ ПАРК',
    desc: 'Вековые деревья, реликтовые аллеи и мягкий солнечный свет',
    specs: ['БЕСШОВНЫЙ МИР', 'LOD РЕЛЬЕФ', '60 FPS WEBGL']
  }
];

async function run() {
  console.log('🎬 Запуск кинематографичной фотостудии (1920x1080)...');
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
  for (let i = 0; i < 30; i++) {
    await sleep(350);
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

  const charData = {
    id: 'c_hero_master',
    name: 'AindieGus',
    race: 'human',
    gender: 'male',
    cls: 'operator',
    className: 'Оператор',
    level: 28,
    hp: 1450,
    maxHp: 1450,
    energy: 480,
    maxEnergy: 480,
    appearance: { hairId: 'hair1', hairColor: '#e5a528', weaponId: 'apprentice_wand' }
  };

  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const lid = 'guest_promo_master';
        localStorage.setItem('ps_local_id', lid);
        sessionStorage.setItem('ps_local_id', lid);
        localStorage.setItem('ps_guest_token', 'guest_token_promo');
        sessionStorage.setItem('ps_guest_token', 'guest_token_promo');
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

  console.log('Навигация на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
  console.log('⏳ Ожидаем полную загрузку Three.js мира (8.5 сек)...');
  await sleep(8500);

  // Инициализация профессиональной фотостудии в браузере
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        // 1. АБСОЛЮТНЫЙ ДЕМОНТАЖ ИГРОВОГО HUD
        const style = document.createElement('style');
        style.id = 'ps-photo-studio-css';
        style.textContent = \`
          #hud, #damage-layer, #death-overlay, #l2-ground-loot-hover, #loading-screen,
          .l2-chat, .l2-status-window, .l2-target-window, .l2-radar, .l2-skillbars, .l2-sys-menu,
          .mobile-controls, [id*="dialog"], [class*="dialog"], [id*="chat"], [class*="chat"],
          [id*="prompt"], [class*="prompt"], [id*="banner"], [id*="fps"], [id*="editor"],
          #ps-starter-welcome-modal, #gm-quick-bar, #editor-btn, #fatal-banner, #cs-debug-fps,
          #fps-counter, .l2-dialog, .target-card, #player-hud-bars, #player-card,
          .quickbar-wrap, .radar-wrap, #radar-box, #player-status, #target-status, #minimap,
          #l2-chat, #l2-skillbars, #l2-sys-menu, #mobile-controls {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
          }
        \`;
        document.head.appendChild(style);

        if (window.game) {
          if (window.game.npcHint) window.game.npcHint.style.display = 'none';
          window.game.updateNPCInteractions = function() {};
          if (window.game.cameraRig) window.game.cameraRig.update = function() {};
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

        // Зачистка видоискателя от 2D текста, бейджей, таргет-окошка и плейсхолдеров
        window.cleanSceneForPhoto = function() {
          const g = window.game;
          if (!g) return;

          // Нейтрализация target-status
          const ts = document.getElementById('target-status');
          if (ts) ts.remove();
          if (g.ui) {
            g.ui.targetStatus = null;
            g.ui.showTargetStatus = function() {};
            g.ui.hideTargetStatus = function() {};
          }

          // Нейтрализация целевого круга игры (_targetRing)
          if (g._targetRing) {
            g._targetRing.visible = false;
            g._targetRing.scale.set(0, 0, 0);
            g._targetRing.position.set(0, -9999, 0);
          }
          g._updateTargetRing = function() {};

          if (g.player) {
            g.player.target = null;
            g.player.isMoving = false;
            g.player.autoAttacking = false;
            if (g.player.targetRing) {
              g.player.targetRing.visible = false;
              g.player.targetRing.scale.set(0, 0, 0);
            }
            if (g.player.nameTag) {
              g.player.nameTag.visible = false;
              g.player.nameTag.scale.set(0, 0, 0);
            }
          }

          if (g.npcManager) {
            g.npcManager.update = function() {};
            if (g.npcManager.npcs) {
              g.npcManager.npcs.forEach(n => {
                if (n.mesh) { n.mesh.visible = false; n.mesh.scale.set(0, 0, 0); }
                if (n.nameTag) { n.nameTag.visible = false; n.nameTag.scale.set(0, 0, 0); }
                if (n.questIndicator) { n.questIndicator.visible = false; n.questIndicator.scale.set(0, 0, 0); }
                if (n.shadow) { n.shadow.visible = false; }
              });
            }
          }

          if (g.net) {
            g.net._refreshRemoteNameTag = function() {};
            if (g.net.remote) {
              g.net.remote.forEach(r => {
                if (r.nameTag) {
                  r.nameTag.visible = false;
                  r.nameTag.scale.set(0, 0, 0);
                  if (r.nameTag.material) r.nameTag.material.visible = false;
                }
                if (r.targetRing) {
                  r.targetRing.visible = false;
                  r.targetRing.scale.set(0, 0, 0);
                }
              });
            }
          }

          g.scene.traverse(obj => {
            if (obj.isSprite) {
              if (obj.renderOrder >= 900 || obj.name === 'nameTag' || (obj.userData && obj.userData.isNameTag)) {
                obj.visible = false;
                obj.scale.set(0, 0, 0);
              }
            }
            // Удаляем любые кольца таргетирования
            if (obj.isMesh && (
              obj.name.toLowerCase().includes('target') ||
              obj.name.toLowerCase().includes('ring') ||
              (obj.userData && obj.userData.isTargetRing) ||
              (obj.geometry && obj.geometry.type === 'RingGeometry')
            )) {
              obj.visible = false;
              obj.scale.set(0, 0, 0);
              obj.position.set(0, -9999, 0);
            }
          });
        };

        // Точное позиционирование персонажа с правильной высотой ног на земле
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

        // Экипировка и заморозка динамичных поз
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
            try {
              p.setAura(auraId);
            } catch(e) {}
          }

          if (p.nameTag) p.nameTag.visible = false;

          if (p._charModel && p._charModel.mixer) {
            const mixer = p._charModel.mixer;
            mixer.timeScale = 1.0;
            if (opts.action === 'attack') {
              p._charModel.playAttack();
              mixer.setTime(0.42);
              mixer.timeScale = 0;
            } else if (opts.action === 'skill') {
              p._charModel.playCast('skill');
              mixer.setTime(0.55);
              mixer.timeScale = 0;
            } else if (opts.action === 'walk') {
              p._charModel.setMoving && p._charModel.setMoving(true, 'walk');
              mixer.setTime(0.38);
              mixer.timeScale = 0;
            }
          }

          if (opts.soulshot && g.ui && typeof g.ui.showSoulshotGlow === 'function') {
            g.ui.showSoulshotGlow();
          }
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

        // Загрузка премиальных шрифтов
        if (!document.getElementById('ps-promo-fonts')) {
          const fLink = document.createElement('link');
          fLink.id = 'ps-promo-fonts';
          fLink.rel = 'stylesheet';
          fLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,700;0,800;0,900;1,900&family=Cinzel:wght@900&display=swap';
          document.head.appendChild(fLink);
        }

        // КРУПНЫЙ, СТИЛЬНЫЙ И ЧИТАЕМЫЙ ПОСТЕРНЫЙ ОВЕРЛЕЙ (AAA MOVIE POSTER)
        window.setPosterOverlay = function(info) {
          let el = document.getElementById('ps-cinematic-poster');
          if (!info) {
            if (el) el.remove();
            return;
          }
          if (!el) {
            el = document.createElement('div');
            el.id = 'ps-cinematic-poster';
            document.body.appendChild(el);
          }
          el.innerHTML = \`
            <!-- Глубокий кинематографичный градиент снизу -->
            <div style="
              position: fixed;
              bottom: 0;
              left: 0;
              width: 100vw;
              height: 320px;
              background: linear-gradient(0deg, rgba(3, 6, 14, 0.98) 0%, rgba(3, 6, 14, 0.88) 42%, rgba(3, 6, 14, 0.35) 78%, transparent 100%);
              pointer-events: none;
              z-index: 9990;
            "></div>

            <!-- Верхняя плашка бренда (Крупно, стильно, frosted glass) -->
            <div style="
              position: fixed;
              top: 36px;
              left: 48px;
              display: inline-flex;
              align-items: center;
              gap: 16px;
              background: rgba(8, 12, 22, 0.88);
              backdrop-filter: blur(16px);
              -webkit-backdrop-filter: blur(16px);
              padding: 12px 28px;
              border-radius: 999px;
              border: 1.5px solid rgba(212, 175, 55, 0.6);
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(212, 175, 55, 0.25);
              z-index: 9999;
              pointer-events: none;
            ">
              <span style="
                font-family: 'Cinzel', 'Montserrat', serif;
                color: #d4af37;
                font-size: 24px;
                font-weight: 900;
                letter-spacing: 5px;
                text-shadow: 0 0 16px rgba(212, 175, 55, 0.6);
              ">PROJECT STEAM</span>
              <span style="color: rgba(255, 255, 255, 0.35); font-size: 20px;">|</span>
              <span style="
                font-family: 'Montserrat', 'Segoe UI', sans-serif;
                color: #ffffff;
                font-size: 14px;
                font-weight: 800;
                letter-spacing: 3px;
                text-transform: uppercase;
              ">ORIGINS • 3D MMORPG</span>
            </div>

            <!-- Главный нижний блок титров: КРУПНО, СТИЛЬНО, БЕЗ МУСОРА -->
            <div style="
              position: fixed;
              bottom: 38px;
              left: 48px;
              right: 48px;
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              z-index: 9999;
              pointer-events: none;
            ">
              <div style="max-width: 1050px;">
                <!-- Категория (Kicker) -->
                <div style="
                  display: inline-flex;
                  align-items: center;
                  gap: 10px;
                  background: rgba(245, 158, 11, 0.18);
                  border: 1.5px solid rgba(245, 158, 11, 0.7);
                  padding: 6px 18px;
                  border-radius: 6px;
                  margin-bottom: 12px;
                ">
                  <span style="width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 10px #f59e0b;"></span>
                  <span style="
                    font-family: 'Montserrat', 'Segoe UI', sans-serif;
                    font-size: 15px;
                    font-weight: 900;
                    letter-spacing: 4px;
                    color: #fcd34d;
                    text-transform: uppercase;
                    text-shadow: 0 0 12px rgba(245, 158, 11, 0.5);
                  ">\${info.tag}</span>
                </div>

                <!-- Главный заголовок постера (Крупный, 68px, стильный) -->
                <h1 style="
                  font-family: 'Montserrat', 'Cinzel', 'Segoe UI', sans-serif;
                  font-size: 68px;
                  font-weight: 900;
                  letter-spacing: 2px;
                  color: #ffffff;
                  margin: 0 0 10px 0;
                  line-height: 1.05;
                  text-transform: uppercase;
                  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.95), 0 0 40px rgba(245, 158, 11, 0.35);
                ">
                  \${info.title}
                </h1>

                <!-- Емкий слоган без перегруза (26px, сверхчеткий) -->
                <p style="
                  margin: 0;
                  font-family: 'Montserrat', 'Segoe UI', sans-serif;
                  font-size: 26px;
                  font-weight: 600;
                  color: #f1f5f9;
                  line-height: 1.35;
                  letter-spacing: 0.5px;
                  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.95);
                ">
                  \${info.desc}
                </p>
              </div>

              <!-- Четкие, крупные бейджи -->
              <div style="
                display: flex;
                gap: 14px;
                align-items: center;
                margin-bottom: 8px;
              ">
                \${info.specs.map(s => \`
                  <div style="
                    background: rgba(12, 18, 32, 0.92);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border: 2px solid rgba(245, 158, 11, 0.75);
                    border-radius: 10px;
                    padding: 13px 24px;
                    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.75), inset 0 0 12px rgba(245, 158, 11, 0.15);
                  ">
                    <span style="
                      font-family: 'Montserrat', 'Segoe UI', sans-serif;
                      font-size: 15.5px;
                      font-weight: 900;
                      letter-spacing: 2px;
                      color: #ffffff;
                      text-transform: uppercase;
                      white-space: nowrap;
                      text-shadow: 0 2px 8px rgba(0,0,0,0.8);
                    ">\${s}</span>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        };
      })()
    `
  });

  // ============================================================
  // СЦЕНА 1: «ДАВИД ПРОТИВ ГОЛИАФА» — БОСС ТРОЛОЛЕЛО
  // Герой: Четко в левой трети кадра (px = -626.0), стойка заклинателя
  // Босс: Четко в правой трети кадра (bx = -608.0), колоссальный тостер-акула
  // Никакого наложения! Идеальное правило третей.
  // ============================================================
  console.log('📸 [СЦЕНА 1] Фотокомпозиция: Босс Трололело (Четкое разделение третей, стильный постер)...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        const net = window.net || window.game.net;
        window.setPosterOverlay(null);

        if (net && net.remote) {
          for (const [k, v] of net.remote) {
            if (v.sprite && v.sprite.parent) v.sprite.parent.remove(v.sprite);
            if (v.nameTag && v.nameTag.parent) v.nameTag.parent.remove(v.nameTag);
            if (v.shadow && v.shadow.parent) v.shadow.parent.remove(v.shadow);
            net.remote.delete(k);
          }
        }

        // 1. Позиция героя в ЛЕВОЙ части (смещен на 18м западнее босса)
        const px = -626.0;
        const pz = 1096.0;
        const hPos = window.placeHero(px, pz, -0.52);

        await window.styleHero({
          weaponId: 'apprentice_wand',
          auraId: 'hero_aura',
          action: 'skill',
          soulshot: true
        });

        // 2. Позиция босса в ПРАВОЙ части
        const bx = -608.0;
        const bz = 1084.0;
        const by = window.getGroundY(bx, bz, hPos.gy);

        if (net && net.addRemote) {
          net.addRemote({
            t: 'm', mid: 88881, mobId: 'tralalero_toasterino',
            name: 'Tralalero Toasterino',
            level: 8, hp: 38000, maxHp: 38000,
            x: bx, z: bz, boss: true, named: true
          });
        }

        const bossRec = net ? net.remote.get('m88881') : null;
        for (let i = 0; i < 40; i++) {
          if (bossRec && bossRec.useSheets) break;
          await new Promise(r => setTimeout(r, 100));
        }

        window.cleanSceneForPhoto();

        // 3. Камера смотрит между героем и боссом
        window.setupCamera(
          { x: -623.5, y: hPos.gy + 1.35, z: 1105.0 }, // точка съемки
          { x: -612.0, y: by + 5.5, z: 1087.0 },        // фокус в центр сцены
          0
        );

        return { ok: true, hPos, by };
      })()
    `
  });
  await sleep(1800);

  await send('Runtime.evaluate', { expression: `window.cleanSceneForPhoto();` });

  // Снимок 1A: Чистый арт
  const shot1Clean = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '01_boss_trololo_clean.jpg'), Buffer.from(shot1Clean.data, 'base64'));
  console.log('✓ 01_boss_trololo_clean.jpg сохранен');

  // Накладываем постерные титры
  await send('Runtime.evaluate', { expression: `window.setPosterOverlay(${JSON.stringify(CINEMATIC_TITLES[0])});` });
  await sleep(400);

  // Снимок 1B: Мастер постер
  const shot1Poster = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '01_boss_trololo_poster.jpg'), Buffer.from(shot1Poster.data, 'base64'));
  console.log('✓ 01_boss_trololo_poster.jpg сохранен');

  // ============================================================
  // СЦЕНА 2: ДИНАМИЧНЫЙ ЭКШЕН — БОЙ С МОБАМИ
  // ============================================================
  console.log('📸 [СЦЕНА 2] Фотокомпозиция: Бой с мобами (Голландский угол, глубина, экшен)...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        const net = window.net || window.game.net;
        window.setPosterOverlay(null);

        if (net && net.remote) {
          for (const [k, v] of net.remote) {
            if (v.sprite && v.sprite.parent) v.sprite.parent.remove(v.sprite);
            if (v.nameTag && v.nameTag.parent) v.nameTag.parent.remove(v.nameTag);
            if (v.shadow && v.shadow.parent) v.shadow.parent.remove(v.shadow);
            net.remote.delete(k);
          }
        }

        const px = -95.0;
        const pz = -65.0;
        const hPos = window.placeHero(px, pz, 1.35);

        await window.styleHero({
          weaponId: 'magic_mace',
          auraId: 'champion_gold',
          action: 'attack',
          soulshot: true
        });

        const m1x = px + 4.2, m1z = pz - 0.4;
        const m1y = window.getGroundY(m1x, m1z, hPos.gy);

        const m2x = px + 3.4, m2z = pz + 2.4;
        const m2y = window.getGroundY(m2x, m2z, hPos.gy);

        const m3x = px + 6.2, m3z = pz + 1.2;
        const m3y = window.getGroundY(m3x, m3z, hPos.gy);

        if (net && net.addRemote) {
          net.addRemote({
            t: 'm', mid: 88882, mobId: 'toaster_overlord',
            name: 'Тостер-Оверлорд', level: 12, hp: 850, maxHp: 850,
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

        await new Promise(r => setTimeout(r, 1000));
        window.cleanSceneForPhoto();

        window.setupCamera(
          { x: px - 2.8, y: hPos.gy + 1.85, z: pz + 2.8 },
          { x: px + 3.8, y: hPos.gy + 1.6, z: pz + 0.6 },
          2.8
        );

        return { ok: true, hPos };
      })()
    `
  });
  await sleep(1800);

  await send('Runtime.evaluate', { expression: `window.cleanSceneForPhoto();` });

  // Снимок 2A: Чистый арт
  const shot2Clean = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '02_mobs_combat_clean.jpg'), Buffer.from(shot2Clean.data, 'base64'));
  console.log('✓ 02_mobs_combat_clean.jpg сохранен');

  // Накладываем постерные титры
  await send('Runtime.evaluate', { expression: `window.setPosterOverlay(${JSON.stringify(CINEMATIC_TITLES[1])});` });
  await sleep(400);

  // Снимок 2B: Мастер постер
  const shot2Poster = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '02_mobs_combat_poster.jpg'), Buffer.from(shot2Poster.data, 'base64'));
  console.log('✓ 02_mobs_combat_poster.jpg сохранен');

  // ============================================================
  // СЦЕНА 3: АРХИТЕКТУРНОЕ ВЕЛИЧИЕ — ЦЕНТРАЛЬНАЯ ПЛОЩАДЬ
  // Герой: В правой трети кадра, любующийся городом
  // Центр и лево: Стимпанк-монумент и часовая башня
  // ============================================================
  console.log('📸 [СЦЕНА 3] Фотокомпозиция: Площадь деревни (Направляющие линии, монумент, башня)...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        const net = window.net || window.game.net;
        window.setPosterOverlay(null);

        if (net && net.remote) {
          for (const [k, v] of net.remote) {
            if (v.sprite && v.sprite.parent) v.sprite.parent.remove(v.sprite);
            if (v.nameTag && v.nameTag.parent) v.nameTag.parent.remove(v.nameTag);
            if (v.shadow && v.shadow.parent) v.shadow.parent.remove(v.shadow);
            net.remote.delete(k);
          }
        }

        // Позиция героя в правой части площади
        const px = -106.0;
        const pz = -116.0;
        const hPos = window.placeHero(px, pz, -2.55);

        await window.styleHero({
          weaponId: 'apprentice_wand',
          auraId: 'hero_aura',
          action: 'walk'
        });

        window.cleanSceneForPhoto();

        // Камера с широким охватом
        window.setupCamera(
          { x: -108.0, y: hPos.gy + 2.2, z: -109.0 },
          { x: -123.0, y: hPos.gy + 5.5, z: -136.0 },
          0
        );

        return { ok: true, hPos };
      })()
    `
  });
  await sleep(1800);

  await send('Runtime.evaluate', { expression: `window.cleanSceneForPhoto();` });

  // Снимок 3A: Чистый арт
  const shot3Clean = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '03_village_square_clean.jpg'), Buffer.from(shot3Clean.data, 'base64'));
  console.log('✓ 03_village_square_clean.jpg сохранен');

  // Накладываем постерные титры
  await send('Runtime.evaluate', { expression: `window.setPosterOverlay(${JSON.stringify(CINEMATIC_TITLES[2])});` });
  await sleep(400);

  // Снимок 3B: Мастер постер
  const shot3Poster = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '03_village_square_poster.jpg'), Buffer.from(shot3Poster.data, 'base64'));
  console.log('✓ 03_village_square_poster.jpg сохранен');

  // ============================================================
  // СЦЕНА 4: ПРИРОДНОЕ ОБРАМЛЕНИЕ — СКВЕР ДЕРЕВНИ
  // ============================================================
  console.log('📸 [СЦЕНА 4] Фотокомпозиция: Сквер деревни (Естественное обрамление, аллея, цветы)...');
  await send('Runtime.evaluate', {
    returnByValue: true,
    awaitPromise: true,
    expression: `
      (async function() {
        const net = window.net || window.game.net;
        window.setPosterOverlay(null);

        if (net && net.remote) {
          for (const [k, v] of net.remote) {
            if (v.sprite && v.sprite.parent) v.sprite.parent.remove(v.sprite);
            if (v.nameTag && v.nameTag.parent) v.nameTag.parent.remove(v.nameTag);
            if (v.shadow && v.shadow.parent) v.shadow.parent.remove(v.shadow);
            net.remote.delete(k);
          }
        }

        // Позиция героя на живописной аллее сквера
        const px = -148.0;
        const pz = -124.0;
        const hPos = window.placeHero(px, pz, -1.2);

        await window.styleHero({
          weaponId: 'apprentice_wand',
          auraId: 'hero_aura',
          action: 'walk'
        });

        window.cleanSceneForPhoto();

        window.setupCamera(
          { x: -140.0, y: hPos.gy + 1.85, z: -118.0 },
          { x: -152.0, y: hPos.gy + 2.2, z: -128.0 },
          0
        );

        return { ok: true, hPos };
      })()
    `
  });
  await sleep(1800);

  await send('Runtime.evaluate', { expression: `window.cleanSceneForPhoto();` });

  // Снимок 4A: Чистый арт
  const shot4Clean = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '04_village_park_clean.jpg'), Buffer.from(shot4Clean.data, 'base64'));
  console.log('✓ 04_village_park_clean.jpg сохранен');

  // Накладываем постерные титры
  await send('Runtime.evaluate', { expression: `window.setPosterOverlay(${JSON.stringify(CINEMATIC_TITLES[3])});` });
  await sleep(400);

  // Снимок 4B: Мастер постер
  const shot4Poster = await send('Page.captureScreenshot', { format: 'jpeg', quality: 96 });
  fs.writeFileSync(path.join(OUT_DIR, '04_village_park_poster.jpg'), Buffer.from(shot4Poster.data, 'base64'));
  console.log('✓ 04_village_park_poster.jpg сохранен');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}

  console.log('🎉 Фотосессия успешно завершена! Снимки сохранены в:', OUT_DIR);
}

run().catch(console.error);
