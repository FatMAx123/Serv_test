// Production-смоук: NODE_ENV=production, uWebSockets.js, PostgreSQL.
const crypto = require('crypto');
const WebSocket = require('/tmp/prod/node_modules/ws');
const PORT = 3920, base = 'http://169.254.0.2:' + PORT;
const SECRET = 'test_yandex_secret_123', MOD = 'mod_secret_for_tests_0123456789abcdef';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const signed = (o) => { const d = b64(o); return { data: d, signature: crypto.createHmac('sha256', SECRET).update(d).digest('base64url') }; };
function login(payload, sig, char) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT, { headers: { origin: 'http://127.0.0.1:' + PORT } }); const msgs = []; let done = false;
    const fin = (v) => { if (!done) { done = true; res(v); } };
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome') fin({ ws, welcome: m, msgs }); });
    ws.on('close', (c, r) => fin({ ws, closed: c, reason: String(r), msgs }));
    ws.on('error', (e) => fin({ ws, closed: 'err', reason: e.message, msgs }));
    ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'login' }, sig ? signed(payload) : { data: b64(payload), signature: '' }, char ? { char } : {}))));
    setTimeout(() => fin({ ws, closed: 'timeout', msgs }), 8000);
  });
}
async function post(path, body, headers = {}) {
  const r = await fetch(base + path, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, headers), body: JSON.stringify(body) });
  let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (_) { j = t.slice(0, 80); }
  return { status: r.status, j };
}
const out = (...a) => console.log(...a);
(async () => {
  const g = await login({ uniqueID: 'local_prodguest01', guestToken: 'guest-token-prod-aaaaaaaa', publicName: 'ProdGuest' }, false, { name: 'ProdGuest', race: 'human', gender: 'male', cls: 'operator' });
  out('1 гость (uWS):', g.welcome ? 'вошёл, gm=' + g.welcome.gm + ' dev=' + g.welcome.dev : 'отказ ' + g.closed + ' ' + g.reason);
  g.ws.send(JSON.stringify({ t: 'move_stop', x: 4000, z: 4000 })); await sleep(400);
  const ss = g.msgs.filter(m => m.t === 'self_sync').pop(); out('2 телепорт move_stop(4000,4000) → позиция', ss ? [Math.round(ss.x), Math.round(ss.z)] : 'нет self_sync');
  g.ws.send(JSON.stringify({ t: 'debug_give', itemId: 'gold', count: 1e6 })); await sleep(300);
  out('3 debug_give:', (g.msgs.filter(m => m.t === 'err').pop() || {}).msg);
  const unsigned = await login({ uniqueID: 'ya_user_1', publicName: 'Ya' }, false);
  out('4 Яндекс-вход без подписи:', unsigned.welcome ? 'ВОШЁЛ (плохо)' : 'отказ ' + unsigned.closed);
  const ya = await login({ uniqueID: 'ya_user_1', publicName: 'YaUser', issuedAt: Date.now() }, true, { name: 'YaUser', race: 'human', gender: 'male', cls: 'operator' });
  out('5 Яндекс-вход с подписью:', ya.welcome ? 'вошёл' : 'отказ ' + ya.closed + ' ' + ya.reason);
  out('6 admin со старым литералом:', (await post('/api/admin/gm', { name: 'YaUser' }, { 'x-mod-secret': 'ps-stress-perf-2026' })).status);
  const adm = await post('/api/admin/gm', { target: 'YaUser', accessLevel: 100 }, { 'x-mod-secret': MOD });
  out('7 admin с MOD_SECRET:', adm.status, adm.j && adm.j.ok);
  await sleep(500);
  out('8 GM пришёл онлайн-игроку:', ya.msgs.some(m => m.gm === true || (m.t === 'gm_status' && m.gm)));
  ya.ws.send(JSON.stringify({ t: 'save_editor_data', reqId: 'p1', data: { windSettings: { enabled: true } } })); await sleep(500);
  out('9 GM save_editor_data в prod:', JSON.stringify(ya.msgs.filter(m => m.t === 'editor_save_result').map(m => [m.ok, m.code])));
  out('10 HTTP save-editor-data в prod:', (await post('/api/save-editor-data', { windSettings: {} }, { 'x-mod-secret': MOD })).status);
  let r = await fetch(base + '/data/editor-overrides.json'); out('11 Cache-Control данных редактора (JSON):', r.headers.get('cache-control'), r.headers.get('content-type'));
  r = await fetch(base + '/js/net-ws.js'); out('   Cache-Control прочего js:', r.headers.get('cache-control'));
  // ключи: создание + вход с другого «устройства»
  const tok = 'guest-token-prod-aaaaaaaa';
  let k = await post('/api/auth/enter-key', { key: 'Prod#Secret77key', login: 'prodplayer01', preferredLocalId: 'prodguest01', guestToken: tok, mode: 'any' });
  out('12 создание ключа с привязкой гостя:', k.status, k.j.action, 'localId=' + k.j.localId, 'персонажей=' + (k.j.chars || []).length);
  let k2 = await post('/api/auth/enter-key', { key: 'Prod#Secret77key', login: 'prodplayer01', mode: 'any' });
  out('13 вход по ключу с другого устройства:', k2.status, k2.j.action, 'персонажей=' + (k2.j.chars || []).length);
  g.ws.close(); await sleep(300);
  const g2 = await login({ uniqueID: 'local_' + k2.j.localId, guestToken: k2.j.guestToken, publicName: 'x' }, false, { id: (k2.j.chars[0] || {}).id });
  out('14 вход в игру по токену из ключа:', g2.welcome ? 'вошёл как ' + (g2.welcome.name || (g2.welcome.self && g2.welcome.self.name) || '?') : 'отказ ' + g2.closed);
  const old = await login({ uniqueID: 'local_prodguest01', guestToken: 'attacker-token-zzzzzzzzzz', publicName: 'x' }, false);
  out('15 чужой токен на аккаунт с ключом:', old.welcome ? 'ВОШЁЛ (плохо)' : 'отказ ' + old.closed);
  // спуфинг IP против лимита /api/auth (20/мин)
  let lim = 0; for (let i = 0; i < 25; i++) { const x = await post('/api/auth/codeword-status', { yid: 'local_x' }, { 'x-forwarded-for': '10.0.0.' + i, 'x-real-ip': '10.0.1.' + i }); if (x.status === 429) lim++; }
  out('16 подмена X-Forwarded-For, 25 запросов → 429 получено:', lim);
  const m = await fetch(base + '/metrics'); out('17 /metrics без авторизации:', m.status);
  process.exit(0);
})();
