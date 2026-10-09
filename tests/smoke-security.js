const WebSocket = require('ws');
const PORT = process.env.PORT || 3911;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function login(yid, token) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT);
    const msgs = []; let welcome = null;
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome') { welcome = m; res({ ws, welcome, msgs }); } });
    ws.on('close', (c, r) => res({ ws, closed: c, reason: String(r), msgs }));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Tester' }), signature: '' })));
  });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function post(path, body, headers = {}) {
  const r = await fetch('http://127.0.0.1:' + PORT + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body) });
  return { status: r.status, body: await r.text() };
}
(async () => {
  const out = [];
  const A = await login('local_victim01', 'victim-token-aaaaaaaaaaaa');
  out.push(['гость залогинен', !!A.welcome, 'gm=' + (A.welcome && A.welcome.gm), 'dev=' + (A.welcome && A.welcome.dev), 'editorKey=' + !!(A.welcome && A.welcome.editorKey)]);
  // GM-команда
  A.ws.send(JSON.stringify({ t: 'chat', text: '//setgm Tester 100' }));
  A.ws.send(JSON.stringify({ t: 'debug_give', itemId: 'gold', count: 1000000 }));
  await sleep(500);
  out.push(['ответы на GM/debug', A.msgs.filter(m => m.t === 'err' || m.t === 'msg').map(m => m.msg || m.text).slice(-3)]);
  // телепорт
  const x0 = A.welcome && (A.welcome.x ?? (A.welcome.self && A.welcome.self.x));
  A.ws.send(JSON.stringify({ t: 'move_stop', x: 5000, z: 5000 }));
  await sleep(400);
  const sync = A.msgs.filter(m => m.t === 'self_sync').pop();
  out.push(['move_stop(5000,5000) → self_sync', sync ? [Math.round(sync.x), Math.round(sync.z)] : 'нет']);
  // угон: тот же yid, другой токен
  const B = await login('local_victim01', 'attacker-token-bbbbbbbbbbb');
  out.push(['чужой токен тот же yid', B.welcome ? 'ВОШЁЛ (плохо)' : 'отказ ' + B.closed + ' ' + B.reason]);
  // неканоничный yid
  const C = await login('local_victim01.', 'attacker-token-bbbbbbbbbbb');
  out.push(['yid local_victim01.', C.welcome ? 'ВОШЁЛ (плохо)' : 'отказ ' + C.closed]);
  // set-codeword без токена
  out.push(['set-codeword без токена', (await post('/api/auth/set-codeword', { yid: 'local_victim01', codeword: 'Attacker#Key99' })).status]);
  out.push(['codeword-status без токена', (await post('/api/auth/codeword-status', { yid: 'local_victim01' })).status]);
  out.push(['admin с ps-stress-perf-2026', (await post('/api/admin/gm', { name: 'Tester', level: 100 }, { 'x-mod-secret': 'ps-stress-perf-2026', 'x-forwarded-for': '1.2.3.4' })).status]);
  out.push(['chars без токена', (await post('/api/chars', { data: b64({ uniqueID: 'local_victim01' }), signature: '' })).status]);
  for (const o of out) console.log(JSON.stringify(o));
  process.exit(0);
})();
