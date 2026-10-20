const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = require('path').join(require('os').tmpdir(), 'edge_gameplay_' + Date.now());
const PORT = 9227;

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
  console.log('🚀 Запуск Edge с отслеживанием консоли...');
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
        console.log('[Browser Console]', m.params.type, text);
      }
    } catch(e) {}
  });

  await send('Runtime.enable');
  await send('Page.enable');

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

  console.log('Переход на game.html...');
  await send('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });

  await sleep(7000);

  const curUrl = await send('Runtime.evaluate', { expression: 'location.href' });
  console.log('Текущий URL:', curUrl);

  ws.close();
  edge.kill();
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
}

run().catch(console.error);
