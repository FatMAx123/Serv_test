// Production-смоук этапа 3: /metrics, /healthz, Origin/CORS, GM по аккаунту, гомоглифы.
const WebSocket = require('/tmp/prod/node_modules/ws');
const PORT = 3920, base = 'http://127.0.0.1:' + PORT;
const MOD = 'mod_secret_for_tests_0123456789abcdef', MT = process.env.METRICS_TOKEN;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ok = 0, bad = 0;
const check = (n, c, i) => { (c ? ok++ : bad++); console.log((c ? 'OK   ' : 'FAIL ') + n + (i !== undefined ? '  → ' + JSON.stringify(i) : '')); };
function login(yid, token, char, origin) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT, { headers: origin === undefined ? {} : { origin } });
    const msgs = []; let done = false; const fin = (v) => { if (!done) { done = true; res(v); } };
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome' || m.t === 'login_fail') fin({ ws, welcome: m.t === 'welcome' ? m : null, fail: m.t === 'login_fail' ? m : null, msgs }); });
    ws.on('close', (c, r) => fin({ ws, closed: c, reason: String(r), msgs }));
    ws.on('error', (e) => fin({ ws, closed: 'err', reason: e.message, msgs }));
    ws.on('unexpected-response', (q, r) => fin({ ws, closed: 'http ' + r.statusCode }));
    ws.on('open', () => ws.send(JSON.stringify(Object.assign({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: char ? char.name : 'X' }), signature: '' }, char ? { char } : {}))));
    setTimeout(() => fin({ ws, closed: 'timeout', msgs }), 8000);
  });
}
const adminGm = (target, lvl) => fetch(base + '/api/admin/gm', { method: 'POST', headers: { 'content-type': 'application/json', 'x-mod-secret': MOD }, body: JSON.stringify({ target, accessLevel: lvl }) }).then(async r => ({ status: r.status, j: await r.json().catch(() => null) }));
(async () => {
  // H11
  let r = await fetch(base + '/metrics'); check('/metrics без токена → 403', r.status === 403, r.status);
  r = await fetch(base + '/metrics', { headers: { 'x-real-ip': '127.0.0.1' } }); check('/metrics с подделкой X-Real-IP → 403', r.status === 403, r.status);
  r = await fetch(base + '/metrics', { headers: { authorization: 'Bearer wrong' } }); check('/metrics с неверным токеном → 403', r.status === 403, r.status);
  r = await fetch(base + '/metrics', { headers: { authorization: 'Bearer ' + MT } }); const mj = await r.json().catch(() => null);
  check('/metrics с METRICS_TOKEN → 200 + данные', r.status === 200 && mj && mj.players != null, r.status);
  r = await fetch(base + '/healthz'); const hj = await r.json().catch(() => null);
  check('/healthz публично — только ok/status', r.status === 200 && hj && Object.keys(hj).sort().join() === 'ok,status', hj);
  // H12
  const ev = await login('local_origin0001', 'origin-token-aaaaaaaaaaaa', { name: 'OriginEvil' }, 'https://evil.example');
  check('WS с Origin https://evil.example — отклонён', !ev.welcome, ev.closed);
  const lh = await login('local_origin0001', 'origin-token-aaaaaaaaaaaa', { name: 'OriginEvil' }, 'https://localhost.evil.com');
  check('WS с Origin https://localhost.evil.com — отклонён', !lh.welcome, lh.closed);
  const ya = await login('local_origin0002', 'origin-token-bbbbbbbbbbbb', { name: 'OriginYa' }, 'https://app-100500.games.s3.yandex.net');
  check('WS с Origin Яндекс Игр — принят', !!ya.welcome, ya.closed || ya.fail);
  if (ya.ws) ya.ws.close();
  r = await fetch(base + '/api/status', { headers: { origin: 'https://evil.example' } });
  check('CORS: чужой Origin — без Access-Control-Allow-Origin', !r.headers.get('access-control-allow-origin'), r.headers.get('access-control-allow-origin'));
  r = await fetch(base + '/api/status', { headers: { origin: 'https://app-1.games.s3.yandex.net' } });
  check('CORS: Яндекс — ACAO = origin', r.headers.get('access-control-allow-origin') === 'https://app-1.games.s3.yandex.net', r.headers.get('access-control-allow-origin'));
  // H5
  const h = await login('local_hijack00001', 'hijack-token-aaaaaaaaaaaa', { name: 'HijackMe', race: 'human', gender: 'male', cls: 'operator' });
  check('имя из старого gm-access без владельца: новый владелец НЕ GM', h.welcome && !h.welcome.gm, h.welcome ? { gm: h.welcome.gm } : h);
  if (h.ws) h.ws.close(); await sleep(800);
  const g1 = await adminGm('HijackMe', 100); check('выдача GM по имени через admin', g1.status === 200 && g1.j && g1.j.ok, g1.j);
  const h2 = await login('local_hijack00001', 'hijack-token-aaaaaaaaaaaa', { name: 'HijackMe' });
  check('владелец имени после выдачи — GM', h2.welcome && h2.welcome.gm, h2.welcome && h2.welcome.gm);
  if (h2.ws) h2.ws.close(); await sleep(1500);
  const g0 = await adminGm('HijackMe', 0); check('revoke офлайн-игрока', g0.status === 200, g0.j);
  const h3 = await login('local_hijack00001', 'hijack-token-aaaaaaaaaaaa', { name: 'HijackMe' });
  check('после revoke (Postgres, флаг в профиле) — не GM', h3.welcome && !h3.welcome.gm, h3.welcome && h3.welcome.gm);
  if (h3.ws) h3.ws.close();
  const mx = await login('local_mixed000001', 'mixed-token-aaaaaaaaaaaa', { name: 'Аdmin', race: 'human', gender: 'male', cls: 'operator' });
  check('имя «Аdmin» (кирилл. А + латиница) — отказ', !mx.welcome, mx.fail || mx.closed);
  r = await fetch(base + '/api/chars/create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: b64({ uniqueID: 'local_mixed000001', guestToken: 'mixed-token-aaaaaaaaaaaa' }), signature: '', name: 'НijackMe' }) });
  const cj = await r.json().catch(() => null); check('HTTP-создание «НijackMe» — отказ', cj && !cj.ok, cj);
  console.log('\nИтого OK=' + ok + ' FAIL=' + bad);
  process.exit(bad ? 1 : 0);
})();
