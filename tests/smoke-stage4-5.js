// Смоук этапа 4.5: токен редактора не в URL (?k=), регион и подписка при телепорте, чистка репо.
// Сам поднимает dev-сервер (DEV_GUEST_GM=1) в копии steam/. Запуск: node tests/smoke-stage4-5.js (порт 3955)
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 's45-'));
const STEAM = path.join(WORK, 'steam');
const WebSocket = require(path.join(ROOT, 'steam', 'node_modules', 'ws'));
const PORT = 3955, base = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const res = []; const check = (n, c, i) => res.push([c ? 'OK  ' : 'FAIL', n, i]);
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); const st = fs.lstatSync(s); if (st.isDirectory()) { if (f === 'node_modules' || f === 'data') continue; copyDir(s, d); } else fs.copyFileSync(s, d); } }
copyDir(path.join(ROOT, 'steam'), STEAM);
fs.symlinkSync(path.join(ROOT, 'steam', 'node_modules'), path.join(STEAM, 'node_modules'));
fs.symlinkSync(path.join(ROOT, 'gm'), path.join(STEAM, 'client'));
let srv = null, log = '';
async function start(env) {
  srv = cp.spawn(process.execPath, ['server/server.js'], { cwd: STEAM, env: Object.assign({}, process.env, { PORT: String(PORT), ALLOW_INSECURE_DEV: '1', DEV_GUEST_GM: '1' }, env) });
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { await sleep(250); if (/\[AccountKeys\] loaded bindings/.test(log)) return true; if (srv.exitCode != null) return false; }
  return false;
}
async function stop() { if (srv && srv.exitCode == null) { srv.kill('SIGINT'); for (let i = 0; i < 40 && srv.exitCode == null; i++) await sleep(100); if (srv.exitCode == null) srv.kill('SIGKILL'); } await sleep(300); }
function login(yid, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT); const msgs = [];
    ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (_) { return; } msgs.push(m); if (m.t === 'welcome') resolve({ ws, welcome: m, msgs }); });
    ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Tp' + yid.slice(-3) }), signature: '' })));
    setTimeout(() => resolve({ ws, welcome: null, msgs }), 8000);
  });
}
(async () => {
  try {
    check('старт', await start({}), log.slice(-300));
    const a = await login('local_tptest01', 'tp-token-aaaaaaaaaaaaaaaa');
    const key = a.welcome && a.welcome.editorKey;
    check('GM получил editorKey в welcome', !!key && a.welcome.gm, a.welcome && a.welcome.gm);
    // ?k= больше не работает
    let r = await fetch(base + '/js/editor.js?v=1&k=' + encodeURIComponent(key));
    check('файл редактора по ?k= — 404', r.status === 404, r.status);
    r = await fetch(base + '/api/editor/session?k=' + encodeURIComponent(key));
    check('сессия по ?k= — 403', r.status === 403, r.status);
    r = await fetch(base + '/api/editor/session', { method: 'POST', headers: { 'X-Editor-Key': 'x'.repeat(48) } });
    check('сессия с чужим ключом — 403', r.status === 403, r.status);
    r = await fetch(base + '/api/editor/session', { method: 'POST', headers: { 'X-Editor-Key': key } });
    const sc = r.headers.get('set-cookie') || '';
    check('сессия по заголовку X-Editor-Key — 200 + HttpOnly cookie (без Secure по http)', r.status === 200 && /ps_ed=/.test(sc) && /HttpOnly/.test(sc) && !/Secure/.test(sc), sc.slice(0, 60));
    const r2 = await fetch(base + '/api/editor/session', { method: 'POST', headers: { 'X-Editor-Key': key, 'X-Forwarded-Proto': 'https' } });
    check('за https-прокси cookie с Secure', /Secure/.test(r2.headers.get('set-cookie') || ''), '');
    const cookie = sc.split(';')[0];
    r = await fetch(base + '/js/editor.js?v=1', { headers: { cookie } });
    check('файл редактора по cookie — 200, private no-store', r.status === 200 && /no-store/.test(r.headers.get('cache-control')), [r.status, r.headers.get('cache-control')]);
    r = await fetch(base + '/js/editor.js?v=1');
    check('файл редактора без cookie — 404', r.status === 404, r.status);
    // регион при GM-телепорте
    await sleep(300);
    const reg0 = a.msgs.filter(m => m.t === 'region').length;
    a.ws.send(JSON.stringify({ t: 'chat', text: '//teleport -3000 -3000' }));
    await sleep(800);
    const regs = a.msgs.filter(m => m.t === 'region').slice(reg0);
    check('//teleport в другую зону → пакет region (wild)', regs.some(m => m.region === 'wild'), regs.map(m => m.region));
    a.ws.send(JSON.stringify({ t: 'chat', text: '//teleport -116 -138' }));
    await sleep(800);
    const regs2 = a.msgs.filter(m => m.t === 'region').slice(reg0);
    check('//teleport обратно → снова пакет region (другая зона)', regs2.length >= 2 && regs2[regs2.length - 1].region !== 'wild', regs2.map(m => m.region));
    a.ws.close();
  } catch (err) { check('исключение', false, err && err.stack); }
  await stop();
  // чистка репозитория
  check('нет crash.log / *.bak', !fs.existsSync(path.join(ROOT, 'steam', 'server', 'crash.log')) && !fs.existsSync(path.join(ROOT, 'steam', 'shared', 'class-system.js.bak')), '');
  const srvFiles = ['security-config.js', 'static-http.js'].map(f => fs.readFileSync(path.join(ROOT, 'steam', 'server', f), 'utf8'));
  check('в серверном коде нет прод-IP', srvFiles.every(t => !/93\.77\.168\.135/.test(t)), '');
  for (const x of res) console.log(x[0], x[1], x[2] !== undefined && x[2] !== '' ? '→ ' + JSON.stringify(x[2]).slice(0, 200) : '');
  console.log('\nИтого OK=' + res.filter(x => x[0] === 'OK  ').length + ' FAIL=' + res.filter(x => x[0] !== 'OK  ').length);
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
})();
