// Смоук этапа 4.1 (C4/H3): случайные отзываемые гостевые токены, миграция legacy, TOFU, клан без yid.
// Запуск: сервер с ALLOW_INSECURE_DEV=1 KEY_LEGACY_CREATE=1 (старые аккаунты «только ключ») на PORT (по умолчанию 3940); PHASE=strict — сервер с
// GUEST_LEGACY_TOKENS=0 GUEST_TOFU=0 (проверяются отказы).
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const PORT = process.env.PORT || 3940, base = 'http://127.0.0.1:' + PORT;
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function post(p, body) { const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); let j = null; try { j = await r.json(); } catch (_) {} return { status: r.status, j }; }
function login(yid, token, keep) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT); let done = false;
    const fin = (v) => { if (done) return; done = true; if (!keep) { try { ws.close(); } catch (_) {} } res(v); };
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } if (m.t === 'welcome') fin({ ok: true, ws, welcome: m }); if (m.t === 'login_fail') fin({ ok: false, reason: m.reason }); });
    ws.on('close', (c) => fin({ ok: false, code: c }));
    ws.on('error', () => fin({ ok: false, code: 'err' }));
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Tok' + yid.slice(-4) }), signature: '' })));
  });
}
const res = []; const check = (name, cond, info) => { res.push([cond ? 'OK  ' : 'FAIL', name, info]); };
(async () => {
  const strict = process.env.PHASE === 'strict';
  const sfx = Date.now().toString(36);
  const KEY = 'TokKey' + sfx + 'Z9';
  // устройство A: гость с персонажем, затем вводит ключ (привязка preferredLocalId)
  const lidA = 'toka' + sfx, tokA0 = 'device-a-token-' + sfx + '-xxxxxxxx';
  let r0 = await login('local_' + lidA, tokA0);
  check('гость A создан', r0.ok, r0.reason || r0.code);
  await sleep(300);
  let e1 = await post('/api/auth/enter-key', { key: KEY, preferredLocalId: lidA, guestToken: tokA0, mode: 'any' });
  const yid = 'local_' + (e1.j && e1.j.localId);
  const tok1 = e1.j && e1.j.guestToken;
  check('ключ создан и привязан к гостю A', e1.status === 200 && e1.j.localId === lidA, e1.status + ' ' + (e1.j && (e1.j.error || e1.j.localId)));
  // derived (старый) токен — вычислим так же, как сервер
  const AK = require(path.join(__dirname, '..', 'server', 'account-keys.js'));
  const AUTH = require(path.join(__dirname, '..', 'server', 'auth.js'));
  const keyHash = await AK.hashAsync(KEY);
  const derived = AUTH.deriveGuestToken(keyHash);
  check('выданный токен случайный (не вычисляемый)', tok1 && tok1 !== derived && tok1.length === 64, tok1 && tok1.slice(0, 8));
  // устройство B
  const e2 = await post('/api/auth/enter-key', { key: KEY, mode: 'any' });
  const tok2 = e2.j && e2.j.guestToken;
  check('второе устройство получило другой токен', tok2 && tok2 !== tok1, e2.status);
  let a = await login(yid, tok1); check('вход токеном устройства 1', a.ok, a.reason || a.code);
  await sleep(200);
  let b = await login(yid, tok2); check('вход токеном устройства 2', b.ok, b.reason || b.code);
  await sleep(200);
  let o = await login(yid, tokA0); check('старый токен гостя A (до ключа) продолжает работать', o.ok, o.reason || o.code);
  await sleep(200);
  let bad = await login(yid, 'attacker-token-zzzzzzzzzzzz'); check('чужой токен — отказ', !bad.ok, bad.reason || bad.code);
  await sleep(200);
  // legacy derived
  let lg = await login(yid, derived);
  if (strict) {
    check('legacy-токен при GUEST_LEGACY_TOKENS=0 — отказ', !lg.ok, lg.reason || lg.code);
  } else {
    const nt = lg.welcome && lg.welcome.guestToken;
    check('legacy-токен принят и заменён случайным в welcome', lg.ok && nt && nt !== derived, lg.reason || (nt && nt.slice(0, 8)));
    await sleep(200);
    const lg2 = await login(yid, nt); check('вход выданным при ротации токеном', lg2.ok, lg2.reason || lg2.code);
    await sleep(200);
    const ch = await post('/api/chars', { data: b64({ uniqueID: yid, guestToken: derived }), signature: '' });
    check('chars API: legacy-токен → guestToken в ответе', ch.status === 200 && ch.j.guestToken && ch.j.guestToken !== derived, ch.status);
  }
  // онлайн-гонка: устройство 1 онлайн, устройство 3 вводит ключ, устройство 1 выходит (сохранение из памяти)
  const on = await login(yid, tok1, true);
  await sleep(300);
  const e3 = await post('/api/auth/enter-key', { key: KEY, mode: 'any' });
  const tok3 = e3.j && e3.j.guestToken;
  await sleep(200);
  try { on.ws.close(); } catch (_) {}
  await sleep(1500);
  const c3 = await login(yid, tok3); check('токен, выданный пока игрок онлайн, не затёрт его сохранением', c3.ok, c3.reason || c3.code);
  await sleep(300);
  // смена ключа отзывает все токены
  const KEY2 = 'TokKeyNew' + sfx + 'Q7';
  const sc = await post('/api/auth/set-codeword', { yid, codeword: KEY2, oldCodeword: KEY, guestToken: tok3, login: 'tok' + sfx });
  check('смена ключа', sc.status === 200 && sc.j.ok && sc.j.guestToken, sc.status + ' ' + (sc.j && (sc.j.error || sc.j.message)));
  await sleep(200);
  const old1 = await login(yid, tok1); check('после смены ключа старый токен отозван', !old1.ok, old1.reason || old1.code);
  await sleep(200);
  const oldA = await login(yid, tokA0); check('после смены ключа токен гостя A отозван', !oldA.ok, oldA.reason || oldA.code);
  await sleep(200);
  const nw = await login(yid, sc.j && sc.j.guestToken); check('новый токен после смены ключа работает', nw.ok, nw.reason || nw.code);
  await sleep(200);
  // TOFU: legacy-профиль без хэшей
  const lidL = 'tofu' + sfx, tokL = 'legacy-owner-token-' + sfx + '-yy';
  const l0 = await login('local_' + lidL, tokL); await sleep(1500);
  let stripped = 0;
  const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); const st = fs.statSync(p); if (st.isDirectory()) walk(p); else if (f.includes(lidL) && f.endsWith('.json')) { const j = JSON.parse(fs.readFileSync(p, 'utf8')); delete j.guestTokenHash; delete j.guestTokenHashes; fs.writeFileSync(p, JSON.stringify(j)); stripped++; } } };
  try { walk(DATA); } catch (e) { console.log('walk', e.message); }
  const t1 = await login('local_' + lidL, 'some-other-token-' + sfx + '-zzz');
  if (strict) check('TOFU для старого профиля при GUEST_TOFU=0 — отказ', l0.ok && stripped > 0 && !t1.ok, 'stripped=' + stripped + ' ' + (t1.reason || t1.code));
  else check('TOFU для старого профиля (по умолчанию разрешён)', l0.ok && stripped > 0 && t1.ok, 'stripped=' + stripped + ' ' + (t1.reason || t1.code));
  await sleep(200);
  const fresh = await login('local_fresh' + sfx, 'fresh-guest-token-' + sfx + '-ww');
  check('новый гость входит всегда', fresh.ok, fresh.reason || fresh.code);
  // клан без yid
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'handlers', 'clan-handler.js'), 'utf8');
  check('клановые пакеты без yid/leaderYid', !/yid: m\.yid|leaderYid: c\.leaderYid|t: 'clan_status',\s*yid/.test(src), '');
  for (const r of res) console.log(r[0], r[1], r[2] !== undefined && r[2] !== '' ? '→ ' + JSON.stringify(r[2]) : '');
  console.log('\nИтого OK=' + res.filter(r => r[0] === 'OK  ').length + ' FAIL=' + res.filter(r => r[0] !== 'OK  ').length);
  process.exit(0);
})();
