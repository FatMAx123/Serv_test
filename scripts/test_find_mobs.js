const { spawn } = require('child_process');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const p = 9285;
const u = path.join(require('os').tmpdir(), 'edge_mobs_test_' + Date.now());

const edge = spawn(EDGE, [
  '--remote-debugging-port=' + p,
  '--user-data-dir=' + u,
  '--headless=new',
  '--window-size=1920,1080',
  '--disable-extensions',
  'about:blank'
]);

setTimeout(async () => {
  try {
    const tabs = await new Promise((res, rej) => http.get('http://127.0.0.1:' + p + '/json/list', r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej));

    const tab = tabs.find(t => t.type === 'page' && !t.url.startsWith('chrome-extension')) || tabs[0];
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise(r => ws.on('open', r));

    let id = 1;
    function call(method, params = {}) {
      return new Promise(res => {
        const i = id++;
        function onMsg(m) {
          const d = JSON.parse(m);
          if (d.id === i) { ws.off('message', onMsg); res(d.result); }
        }
        ws.on('message', onMsg);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    }

    await call('Runtime.enable');
    await call('Page.enable');

    const lid = '8dc75cfeb46c';
    const token = 'f35a997e164feac53c74c7705afffcf59b12daf47e236245886cbe0d7a11ef35';
    const charData = {
      id: 'c0', name: 'AindieGus', level: 20, exp: 4500, sp: 320,
      cls: 'operator', className: 'Оператор', classTier: 0, classHistory: ['operator'],
      race: 'human', gender: 'male', hp: 850, maxHp: 850, energy: 280, maxEnergy: 280,
      pAtk: 75, pDef: 85, cAtk: 25, cDef: 60, karma: 0,
      appearance: { hairId: 'hair1', hairColor: '#e29b38', faceId: 'face1', weaponId: 'revolution_sword' }
    };

    await call('Page.addScriptToEvaluateOnNewDocument', {
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

    await call('Page.navigate', { url: 'http://127.0.0.1:3000/game.html' });
    console.log('Navigated, waiting 8s...');
    await new Promise(r => setTimeout(r, 8000));

    const res = await call('Runtime.evaluate', {
      expression: `
        (() => {
          const net = window.game && window.game.net;
          const p = window.game && window.game.player;
          const list = [];
          if (net && net.remote) {
            for (const [k, r] of net.remote) {
              list.push({ k, type: r.type, name: r.name, mobId: r.mobId, x: r.x, z: r.z, hp: r.hp, maxHp: r.maxHp });
            }
          }
          const mobs = list.filter(e => e.type === 'm');
          return {
            playerPos: p && p.mesh ? { x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z } : null,
            totalRemote: list.length,
            mobsCount: mobs.length,
            mobs: mobs.slice(0, 10),
            npcsCount: (window.game && window.game.npcManager && window.game.npcManager.npcs) ? window.game.npcManager.npcs.length : 0
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Remote entities:', JSON.stringify(res.result.value, null, 2));

    ws.close();
  } catch(e) {
    console.error(e);
  } finally {
    edge.kill();
  }
}, 2000);
