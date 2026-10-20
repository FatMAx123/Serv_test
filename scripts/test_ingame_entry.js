const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = require('path').join(require('os').tmpdir(), 'edge_test_' + Date.now());
const PORT = 9225;

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
  console.log('🚀 Запуск Edge для проверки входа в игру...');
  const edge = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA}`,
    '--headless=new',
    '--window-size=1920,1080',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    'http://127.0.0.1:3000/character-select.html'
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

  if (!ready) {
    console.error('Edge CDP не ответил');
    edge.kill();
    return;
  }

  const tabs = await requestJson(`http://127.0.0.1:${PORT}/json/list`);
  const tab = tabs.find(t => t.url && t.url.includes('3000')) || tabs.find(t => t.type === 'page') || tabs[0];
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

  console.log('⏳ Ожидание character-select...');
  await sleep(3000);

  // Предустанавливаем персонажа и нажимаем старт
  console.log('Задаем персонажа и вызываем onStart()...');
  const res = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const charData = {
          id: 1,
          name: 'AindieGus',
          race: 'human',
          gender: 'male',
          cls: 'operator',
          level: 20,
          maxHp: 850,
          hp: 850,
          maxEnergy: 320,
          energy: 320,
          pAtk: 45,
          pDef: 30,
          cAtk: 25,
          cDef: 20
        };
        localStorage.setItem('ps_characters', JSON.stringify([charData]));
        localStorage.setItem('ps_selected_char', JSON.stringify(charData));
        sessionStorage.setItem('ps_selected_char', JSON.stringify(charData));
        localStorage.setItem('ps_connect', '1');
        sessionStorage.setItem('ps_connect', '1');

        if (typeof onStart === 'function') {
          onStart();
          return 'onStart called';
        }
        const b = document.getElementById('cs-btn-start');
        if (b) {
          b.disabled = false;
          b.click();
          return 'start clicked';
        }
        return 'no start';
      })()
    `
  });
  console.log('Результат старта:', res);

  console.log('Ожидаем переход и загрузку 3D мира game.html (8 сек)...');
  await sleep(8000);

  const curUrl = await send('Runtime.evaluate', {
    expression: 'location.href'
  });
  console.log('Текущий URL:', curUrl);

  const gameState = await send('Runtime.evaluate', {
    expression: `
      (function() {
        return {
          hasGame: !!window.game,
          gameStarted: window.game ? window.game._gameStarted : false,
          inMainMenu: window.game ? window.game.inMainMenu : null,
          hasPlayer: !!(window.game && window.game.player),
          playerPos: (window.game && window.game.player && window.game.player.pos) ? {
            x: window.game.player.pos.x,
            y: window.game.player.pos.y,
            z: window.game.player.pos.z
          } : null,
          remotesCount: (window.net && window.net.remote) ? window.net.remote.size : 0
        };
      })()
    `
  });
  console.log('Состояние игры:', gameState);

  // Возьмем скриншот
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  fs.writeFileSync('scratch_ingame_test.jpg', Buffer.from(shot.data, 'base64'));
  console.log('Скриншот сохранен в scratch_ingame_test.jpg');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

run().catch(console.error);
