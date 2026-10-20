const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = require('path').join(require('os').tmpdir(), 'edge_real_gameplay_' + Date.now());
const PORT = 9228;

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
  console.log('🚀 Запуск Edge с боевой сессией AindieGus...');
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

  ws.on('message', (msg) => {
    try {
      const m = JSON.parse(msg);
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = m.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        if (text.includes('[net]') || text.includes('welcome') || text.includes('connected') || text.includes('player')) {
          console.log('[Game Net]', text);
        }
      }
    } catch(e) {}
  });

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

  console.log('Переход на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });

  console.log('Ожидание подключения и загрузки 3D мира...');
  await sleep(10000);

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
  fs.writeFileSync('scratch_real_live_gameplay.jpg', Buffer.from(shot.data, 'base64'));
  console.log('Скриншот сохранен в scratch_real_live_gameplay.jpg');

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

run().catch(console.error);
