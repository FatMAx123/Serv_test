const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = require('path').join(require('os').tmpdir(), 'edge_gameplay_' + Date.now());
const PORT = 9226;

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
  console.log('🚀 Запуск Edge для входа в 3D мир игры...');
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

  // Внедряем сессионные данные для беспрепятственного входа в игровой мир
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      try {
        const charData = {
          id: 1,
          name: 'AindieGus',
          race: 'human',
          gender: 'male',
          cls: 'operator',
          level: 25,
          maxHp: 950,
          hp: 950,
          maxEnergy: 350,
          energy: 350,
          pAtk: 65,
          pDef: 45,
          cAtk: 35,
          cDef: 30
        };
        const lid = 'test_guest_999';
        localStorage.setItem('ps_local_id', lid);
        sessionStorage.setItem('ps_local_id', lid);
        localStorage.setItem('ps_guest_token', 'guest_token_999');
        sessionStorage.setItem('ps_guest_token', 'guest_token_999');
        localStorage.setItem('ps_characters', JSON.stringify([charData]));
        sessionStorage.setItem('ps_characters', JSON.stringify([charData]));
        localStorage.setItem('ps_selected_char', JSON.stringify(charData));
        sessionStorage.setItem('ps_selected_char', JSON.stringify(charData));
        localStorage.setItem('ps_connect', '1');
        sessionStorage.setItem('ps_connect', '1');
        localStorage.setItem('ps_boot_ticket', '1');
        sessionStorage.setItem('ps_boot_ticket', '1');
        localStorage.setItem('ps_game_host', '93.77.168.135');
        sessionStorage.setItem('ps_game_host', '93.77.168.135');
      } catch(e) {}
    `
  });

  console.log('Навигация на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });

  console.log('Ожидаем загрузку Three.js и мира (10 сек)...');
  await sleep(10000);

  const curUrl = await send('Runtime.evaluate', { expression: 'location.href' });
  console.log('URL в браузере:', curUrl);

  const gameState = await send('Runtime.evaluate', {
    expression: `
      (function() {
        return {
          hasGame: !!window.game,
          gameStarted: window.game ? window.game._gameStarted : false,
          inMainMenu: window.game ? window.game.inMainMenu : null,
          hasPlayer: !!(window.game && window.game.player),
          playerPos: (window.game && window.game.player && window.game.player.pos) ? {
            x: Math.round(window.game.player.pos.x),
            y: Math.round(window.game.player.pos.y),
            z: Math.round(window.game.player.pos.z)
          } : null,
          remotesCount: (window.net && window.net.remote) ? window.net.remote.size : 0,
          netConnected: (window.net) ? window.net.connected : false
        };
      })()
    `
  });
  console.log('Состояние мира игры:', gameState);

  // Скриншот
  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  fs.writeFileSync('scratch_gameplay_live.jpg', Buffer.from(shot.data, 'base64'));
  console.log('Скриншот сохранен в scratch_gameplay_live.jpg');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

run().catch(console.error);
