const WebSocket = require('ws');
const PORT = 3913, base = 'http://127.0.0.1:' + PORT;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const cur = () => JSON.parse(fs.readFileSync('/tmp/t2/shared/editor-overrides.json', 'utf8'));
async function post(body) { const r = await fetch(base + '/api/save-editor-data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return [r.status, await r.json()]; }
function login(yid, token) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT); const msgs = [];
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome') res({ ws, welcome: m, msgs }); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Ed' + yid.slice(-3) }), signature: '' })));
  });
}
(async () => {
  const full = cur(); delete full.savedAt;
  console.log('исходно rev=', full.rev, 'customProps=', full.customProps.length, 'grips=', Object.keys(full.weaponGrips));
  let [s, j] = await post(Object.assign({}, full, { baseRev: 0 })); console.log('1 полная запись baseRev=0:', s, j.ok, 'rev', j.rev);
  [s, j] = await post(Object.assign({}, full, { baseRev: 0 })); console.log('2 устаревшая вкладка baseRev=0:', s, j.code, j.currentRev);
  [s, j] = await post({ baseRev: 1, windSettings: { enabled: true, strength: 0.7, speed: 1, turbulence: 0.2, angle: 45 } });
  let c = cur(); console.log('3 частичный payload:', s, 'rev', j.rev, 'customProps сохранены=', c.customProps.length, 'wind=', c.windSettings.strength);
  [s, j] = await post({ baseRev: 2, customProps: [] }); console.log('4 вайп customProps:', s, j.code);
  [s, j] = await post({ baseRev: 2, weaponGrips: { new_gun: { pos: [0, 1, 2] } } });
  c = cur(); console.log('5 grips merge:', s, Object.keys(c.weaponGrips));
  [s, j] = await post({ baseRev: 3, __proto__x: 1, customProps: 'oops' }); console.log('6 неверный тип:', s, j.code);
  const savedAtFresh = Math.abs(c.savedAt - Date.now()) < 10000; console.log('7 savedAt свежий:', savedAtFresh, 'hash', c.hash);
  console.log('8 бэкапов:', fs.readdirSync('/tmp/t2/shared/editor-overrides.backups').length);
  const cj = JSON.parse(fs.readFileSync('/tmp/t2/client/data/editor-overrides.json', 'utf8')); const js = fs.readFileSync('/tmp/t2/client/js/editor-overrides-data.js', 'utf8');
  console.log('9 клиентский JSON rev=3 и загрузчик без данных:', cj.rev === 3, !/diskData/.test(js) && /editor-overrides\.json/.test(js));
  // WS: GM-редактор и игрок-наблюдатель
  const ed = await login('local_editor01', 'editor-token-aaaaaaaaaaaa');
  const pl = await login('local_player01', 'player-token-bbbbbbbbbbbb');
  console.log('10 gm редактора =', ed.welcome.gm);
  ed.ws.send(JSON.stringify({ t: 'save_editor_data', reqId: 'r1', baseRev: 3, data: { windSettings: { enabled: false, strength: 0.1, speed: 1, turbulence: 0, angle: 0 } } }));
  ed.ws.send(JSON.stringify({ t: 'save_editor_data', reqId: 'r2', baseRev: 3, data: { windSettings: { enabled: true, strength: 0.9, speed: 1, turbulence: 0, angle: 0 } } }));
  await sleep(800);
  console.log('11 ack редактору:', ed.msgs.filter(m => m.t === 'editor_save_result').map(m => [m.reqId, m.ok, m.rev || m.code]));
  console.log('12 игрок получил:', pl.msgs.filter(m => m.t === 'editor_overrides_updated').map(m => m.rev));
  const r = await fetch(base + '/data/editor-overrides.json'); console.log('13 Cache-Control:', r.headers.get('cache-control'), r.headers.get('content-type'));
  process.exit(0);
})();
