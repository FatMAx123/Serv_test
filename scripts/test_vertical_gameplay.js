const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('os').tmpdir(), 'edge_test_vert_' + Date.now());
const PORT = 9245;

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
  console.log('🚀 Запуск Edge в 1080x1920...');
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

  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
  console.log('⏳ Ожидание загрузки (7 сек)...');
  await sleep(7000);

  const diag = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const m = document.getElementById('ps-starter-welcome-modal');
        if (m) m.remove();
        const fps = document.getElementById('cs-debug-fps') || document.getElementById('fps-counter');
        if (fps) fps.style.display = 'none';

        const p = window.game && window.game.player;
        const net = window.game && window.game.net;
        const cam = window.game && window.game.camera;
        const rig = window.game && window.game.cameraRig;

        let mobs = [];
        if (net && net.remote) {
          for (const [k, r] of net.remote.entries()) {
            if (r.mid != null) {
              mobs.push({ mid: r.mid, name: r.name, x: r.x, z: r.z, hp: r.hp, maxHp: r.maxHp });
            }
          }
        }

        return {
          windowW: window.innerWidth,
          windowH: window.innerHeight,
          camAspect: cam ? cam.aspect : null,
          hasPlayer: !!p,
          playerPos: p && p.mesh ? { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z } : null,
          isMoving: p ? p.isMoving : null,
          moveSpeed: p ? p.moveSpeed : null,
          mobsCount: mobs.length,
          mobsSample: mobs.slice(0, 5),
          hasNet: !!net,
          netConnected: net ? net.ws && net.ws.readyState === 1 : false
        };
      })()
    `,
    returnByValue: true
  });

  console.log('📊 Диагностика клиента:', JSON.stringify(diag.value, null, 2));

  // Тестируем движение и анимацию
  const moveRes = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const p = window.game && window.game.player;
        if (!p || !p.mesh) return 'no player';
        const startX = p.mesh.position.x;
        const startZ = p.mesh.position.z;
        p.moveTo(new THREE.Vector3(startX + 15, 0, startZ + 20));
        return { startX, startZ, isMoving: p.isMoving, target: { x: p.moveTarget.x, z: p.moveTarget.z } };
      })()
    `,
    returnByValue: true
  });
  console.log('🏃 Команда moveTo:', moveRes.value);

  // Ждем 1 секунду движения
  await sleep(1000);

  const moveAfter = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const p = window.game && window.game.player;
        if (!p || !p.mesh) return null;
        return { curX: p.mesh.position.x, curZ: p.mesh.position.z, isMoving: p.isMoving };
      })()
    `,
    returnByValue: true
  });
  console.log('🏃 Позиция через 1 сек:', moveAfter.value);

  // Делаем тестовый снимок экрана в вертикальном разрешении
  const ss = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  const testImgPath = path.join(path.resolve(__dirname, '..'), 'test_vert_shot.jpg');
  fs.writeFileSync(testImgPath, Buffer.from(ss.data, 'base64'));
  console.log('📸 Снимок сохранен в test_vert_shot.jpg');

  ws.close();
  edge.kill();
}

run().catch(console.error);
