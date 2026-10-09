// Смоук этапа 4.3 (H2): логин отдельно от ключа, scrypt с солью на аккаунт, регистр ключа,
// перевод старых аккаунтов «только ключ» на логин, лимит неудач на логин.
// Сам поднимает сервер (file-DB) в отдельной копии steam/. Запуск: node tests/smoke-key-login.js (порт 3951)
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'kl-'));
const STEAM = path.join(WORK, 'steam');
const WebSocket = require(path.join(ROOT, 'steam', 'node_modules', 'ws'));
const PORT = 3951, base = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const res = []; const check = (n, c, i) => res.push([c ? 'OK  ' : 'FAIL', n, i]);
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); const st = fs.lstatSync(s); if (st.isDirectory()) { if (f === 'node_modules' || f === 'data') continue; copyDir(s, d); } else fs.copyFileSync(s, d); } }
copyDir(path.join(ROOT, 'steam'), STEAM);
fs.symlinkSync(path.join(ROOT, 'steam', 'node_modules'), path.join(STEAM, 'node_modules'));
fs.symlinkSync(path.join(ROOT, 'gm'), path.join(STEAM, 'client'));
const DATA = path.join(STEAM, 'data');
let srv = null, log = '';
async function start(env) {
  log = '';
  srv = cp.spawn(process.execPath, ['server/server.js'], { cwd: STEAM, env: Object.assign({}, process.env, { PORT: String(PORT), ALLOW_INSECURE_DEV: '1', KEY_ATTEMPTS_PER_10MIN: '100000' }, env) });
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { await sleep(250); if (/\[AccountKeys\] loaded bindings/.test(log)) return true; if (srv.exitCode != null) return false; }
  return false;
}
async function stop() { if (srv && srv.exitCode == null) { srv.kill('SIGINT'); for (let i = 0; i < 40 && srv.exitCode == null; i++) await sleep(100); if (srv.exitCode == null) srv.kill('SIGKILL'); } await sleep(300); }
let ipN = 1;
const freshIp = () => '10.9.' + Math.floor(ipN / 250) + '.' + (ipN++ % 250 + 1);
async function post(url, body, ip) { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': ip || freshIp() }, body: JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; }
const enter = (key, extra, ip) => post('/api/auth/enter-key', Object.assign({ key, mode: 'any' }, extra || {}), ip);
function wsLogin(yid, token) { return new Promise((resolve) => { const ws = new WebSocket('ws://127.0.0.1:' + PORT); let done = false; const fin = v => { if (done) return; done = true; try { ws.close(); } catch (_) {} resolve(v); }; ws.on('message', d => { let m; try { m = JSON.parse(d); } catch (_) { return; } if (m.t === 'welcome') fin({ ok: true, m }); if (m.t === 'login_fail') fin({ ok: false, reason: m.reason }); }); ws.on('close', c => fin({ ok: false, code: c })); ws.on('error', () => fin({ ok: false })); ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Kl' }), signature: '' }))); setTimeout(() => fin({ ok: false, timeout: true }), 8000); }); }
function registry() { const st = JSON.parse(fs.readFileSync(path.join(DATA, 'account_keys.json'), 'utf8')); const key = crypto.scryptSync('ps_vault_master_secret_2026_aes256gcm', 'ps_vault_storage_salt_2026', 32); const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(st.iv, 'hex')); d.setAuthTag(Buffer.from(st.tag, 'hex')); return JSON.parse(d.update(st.data, 'hex', 'utf8') + d.final('utf8')); }
const sfx = Date.now().toString(36).slice(-5);
(async () => {
  try {
    // A. старые аккаунты «только ключ» (как до этапа 4.3)
    check('A: старт (KEY_LEGACY_CREATE=1)', await start({ KEY_LEGACY_CREATE: '1' }), log.slice(-300));
    const OLDK = 'OldKeyAbc' + sfx, OLDK2 = 'OldKeyXyz' + sfx;
    const L1 = await enter(OLDK), L2 = await enter(OLDK2);
    check('A: два старых аккаунта созданы', L1.j && L1.j.ok && L2.j && L2.j.ok, [L1.status, L2.status]);
    const yidL1 = 'local_' + L1.j.localId, yidL2 = 'local_' + L2.j.localId;
    await stop();

    // B. обычный режим
    check('B: старт', await start({}), log.slice(-300));
    check('B: в логе статистика логинов', /аккаунтов с логином: 0 из 2/.test(log), log.match(/аккаунтов с логином[^\n]*/));
    let r = await enter('BrandNewKey' + sfx);
    check('B: новый аккаунт без логина не создаётся', !r.j.ok && r.j.error === 'login_required', r.j);
    r = await enter(OLDK.toLowerCase());
    check('B: старый ключ без логина входит (регистр не важен, как раньше), needLogin', r.j.ok && r.j.needLogin === true && r.j.yid === yidL1, r.j);
    const tokL1 = r.j.guestToken;
    r = await enter(OLDK, { login: 'oldplayer' + sfx, mode: 'link' });
    check('B: link — логин привязан к старому аккаунту', r.j.ok && r.j.migrated && r.j.yid === yidL1 && r.j.login === 'oldplayer' + sfx && !!r.j.guestToken, r.j);
    const tokL1b = r.j.guestToken;
    check('B: WS-вход с новым токеном', (await wsLogin(yidL1, tokL1b)).ok, '');
    check('B: токен до привязки тоже жив (до 5 устройств)', (await wsLogin(yidL1, tokL1)).ok, '');
    r = await enter(OLDK);
    check('B: после привязки вход только ключом не работает', !r.j.ok, r.j);
    r = await enter(OLDK.toLowerCase(), { login: 'OldPlayer' + sfx });
    check('B: регистр ключа теперь важен', !r.j.ok && r.j.error === 'invalid_credentials', r.j);
    r = await enter(OLDK, { login: 'OLDPLAYER' + sfx, mode: 'login' });
    check('B: логин без учёта регистра, верный ключ → вход', r.j.ok && r.j.yid === yidL1 && !r.j.needLogin, r.j);
    r = await enter(OLDK2, { login: 'p2' + sfx });
    check('B: any — свободный логин + старый ключ → перевод старого аккаунта', r.j.ok && r.j.migrated && r.j.yid === yidL2, r.j);

    // новые аккаунты
    const NK = 'NewKey#1' + sfx;
    r = await enter(NK, { login: 'newbie' + sfx });
    check('B: новый аккаунт с логином', r.j.ok && r.j.isNew && r.j.login === 'newbie' + sfx, r.j);
    const yidN = r.j.yid, tokN = r.j.guestToken;
    r = await enter(NK, { login: 'other' + sfx });
    check('B: тот же ключ под другим логином — отдельный аккаунт (нет code_taken)', r.j.ok && r.j.isNew && r.j.yid !== yidN, r.j);
    r = await enter(NK, { login: 'newbie' + sfx, mode: 'create' });
    check('B: create на занятый логин → login_taken', !r.j.ok && r.j.error === 'login_taken', r.j);
    r = await enter('Wrong#Key1', { login: 'newbie' + sfx });
    check('B: any + занятый логин + чужой ключ → ошибка, не новый аккаунт', !r.j.ok && r.j.error === 'invalid_credentials', r.j);
    r = await enter('Wrong#Key1', { login: 'newbie' + sfx, mode: 'link' });
    check('B: link на занятый логин → login_taken', !r.j.ok && r.j.error === 'login_taken', r.j);
    r = await enter('xx' + 'Abcdef' + 'zz', { login: 'abcdef' });
    check('B: ключ содержит логин → отказ', !r.j.ok && r.j.error === 'code_contains_login', r.j);
    r = await enter('nouppercase1', { login: 'nou' + sfx });
    check('B: без заглавной → отказ', !r.j.ok && r.j.error === 'code_no_uppercase', r.j);
    r = await enter('Good#Key12', { login: 'ab' });
    check('B: короткий логин → login_invalid', !r.j.ok && r.j.error === 'login_invalid', r.j);
    r = await post('/api/auth/login-codeword', { codeword: NK, login: 'newbie' + sfx });
    check('B: login-codeword с логином', r.j.ok && r.j.yid === yidN && !r.j.guestToken, r.j);

    // реестр
    const reg = registry();
    const aN = reg.accounts && reg.accounts['newbie' + sfx], aO = reg.accounts && reg.accounts['other' + sfx];
    check('B: реестр — v3 запись (соль, scrypt), не в byHash', aN && /^sc1\$\d+\$[0-9a-f]{64}$/.test(aN.h) && /^[0-9a-f]{32}$/.test(aN.salt) && !Object.values(reg.byHash).some(e => e.yid === yidN), aN);
    check('B: одинаковый ключ — разные соль и хэш', aN && aO && aN.salt !== aO.salt && aN.h !== aO.h, '');
    check('B: переведённые старые аккаунты убраны из byHash', !Object.values(reg.byHash).some(e => e.yid === yidL1 || e.yid === yidL2), Object.keys(reg.byHash).length);
    check('B: ключ в реестре не хранится', !JSON.stringify(reg).includes(NK) && !JSON.stringify(reg).includes(OLDK), '');

    // смена ключа
    const NK2 = 'Changed#2' + sfx;
    r = await post('/api/auth/set-codeword', { yid: yidN, codeword: NK2, oldCodeword: 'Bad#Old123', guestToken: tokN });
    check('B: set-codeword с неверным старым ключом → отказ', !r.j.ok && r.j.error === 'old_codeword_invalid', r.j);
    r = await post('/api/auth/set-codeword', { yid: yidN, codeword: NK2, oldCodeword: NK, guestToken: tokN });
    check('B: set-codeword — ключ сменён, выдан новый токен', r.j.ok && r.j.login === 'newbie' + sfx && !!r.j.guestToken, r.j);
    check('B: старый токен отозван', !(await wsLogin(yidN, tokN)).ok, '');
    r = await enter(NK, { login: 'newbie' + sfx, mode: 'login' });
    const r2 = await enter(NK2, { login: 'newbie' + sfx, mode: 'login' });
    check('B: старый ключ не подходит, новый подходит', !r.j.ok && r2.j.ok && r2.j.yid === yidN, [r.j.error, r2.j.ok]);

    // лимит неудач на логин (с разных IP)
    for (let i = 0; i < 10; i++) await enter('Brute#Key' + i, { login: 'newbie' + sfx, mode: 'login' });
    r = await enter(NK2, { login: 'newbie' + sfx, mode: 'login' });
    check('B: 10 неудач на логин с разных IP → блокировка логина', !r.j.ok && r.j.error === 'rate_limited', r.j);
    r = await enter(OLDK, { login: 'oldplayer' + sfx, mode: 'login' });
    check('B: другой логин не заблокирован', r.j.ok, r.j);
    await stop();

    // C. смена KEY_PEPPER: v3 по старому pepper принимается и перехэшируется
    const NEWPEP = crypto.randomBytes(32).toString('hex');
    check('C: старт с новым KEY_PEPPER', await start({ KEY_PEPPER: NEWPEP }), log.slice(-200));
    const ppBefore = registry().accounts['oldplayer' + sfx].pp;
    r = await enter(OLDK, { login: 'oldplayer' + sfx, mode: 'login' });
    const ppAfter = registry().accounts['oldplayer' + sfx].pp;
    check('C: вход по старому pepper + перехэширование', r.j.ok && ppBefore !== ppAfter, [r.j.ok, ppBefore, ppAfter]);
    await stop();
    check('C2: старт с новым KEY_PEPPER и KEY_ALLOW_OLD_HASHES=0', await start({ KEY_PEPPER: NEWPEP, KEY_ALLOW_OLD_HASHES: '0' }), '');
    r = await enter(OLDK, { login: 'oldplayer' + sfx, mode: 'login' });
    const r3 = await enter(OLDK2, { login: 'p2' + sfx, mode: 'login' });
    check('C2: перехэшированный входит, не перехэшированный — нет', r.j.ok && !r3.j.ok, [r.j.ok, r3.j.error]);
    await stop();

    // D. KEY_ALLOW_KEYONLY=0
    check('D: возврат и создание старого аккаунта', await start({ KEY_LEGACY_CREATE: '1' }), '');
    const OLDK3 = 'OldKeyQwe' + sfx;
    r = await enter(OLDK3);
    check('D: старый аккаунт создан', r.j.ok, r.j);
    await stop();
    check('D: старт с KEY_ALLOW_KEYONLY=0', await start({ KEY_ALLOW_KEYONLY: '0' }), '');
    r = await enter(OLDK3);
    check('D: вход без логина отключён', !r.j.ok && r.j.error === 'login_required', r.j);
  } catch (err) { check('исключение', false, err && err.stack); }
  await stop();
  for (const x of res) console.log(x[0], x[1], x[2] !== undefined && x[2] !== '' ? '→ ' + JSON.stringify(x[2]).slice(0, 220) : '');
  console.log('\nИтого OK=' + res.filter(x => x[0] === 'OK  ').length + ' FAIL=' + res.filter(x => x[0] !== 'OK  ').length);
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
})();
