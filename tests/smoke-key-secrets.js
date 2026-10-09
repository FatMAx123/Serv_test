// Смоук этапа 4.2 (H3): секреты ключей из env, автоперешифровка реестра, ленивая миграция хэшей.
// Сам поднимает сервер (file-DB) в отдельной копии steam/ несколько раз с разным env.
// Запуск: node tests/smoke-key-secrets.js   (нужен steam/node_modules; порт 3950)
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-'));
const STEAM = path.join(WORK, 'steam');
const WebSocket = require(path.join(ROOT, 'steam', 'node_modules', 'ws'));
const PORT = 3950, base = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const res = []; const check = (n, c, i) => res.push([c ? 'OK  ' : 'FAIL', n, i]);
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); const st = fs.lstatSync(s); if (st.isDirectory()) { if (f === 'node_modules' || f === 'data') continue; copyDir(s, d); } else fs.copyFileSync(s, d); } }
copyDir(path.join(ROOT, 'steam'), STEAM);
fs.symlinkSync(path.join(ROOT, 'steam', 'node_modules'), path.join(STEAM, 'node_modules'));
fs.symlinkSync(path.join(ROOT, 'gm'), path.join(STEAM, 'client'));
const DATA = path.join(STEAM, 'data');
const NEW_PEPPER = crypto.randomBytes(32).toString('hex'), NEW_VAULT = crypto.randomBytes(32).toString('hex');
let srv = null, log = '';
async function start(env) {
  log = '';
  srv = cp.spawn(process.execPath, ['server/server.js'], { cwd: STEAM, env: Object.assign({}, process.env, { PORT: String(PORT), ALLOW_INSECURE_DEV: '1', KEY_LEGACY_CREATE: '1' }, env) });
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { await sleep(250); if (/\[AccountKeys\] loaded bindings/.test(log)) return true; if (srv.exitCode != null) return false; }
  return false;
}
async function stop() { if (srv && srv.exitCode == null) { srv.kill('SIGINT'); for (let i = 0; i < 40 && srv.exitCode == null; i++) await sleep(100); if (srv.exitCode == null) srv.kill('SIGKILL'); } await sleep(300); }
async function enter(key, extra) { const r = await fetch(base + '/api/auth/enter-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ key, mode: 'any' }, extra || {})) }); return { status: r.status, j: await r.json().catch(() => null) }; }
function login(yid, token) { return new Promise((resolve) => { const ws = new WebSocket('ws://127.0.0.1:' + PORT); let done = false; const fin = v => { if (done) return; done = true; try { ws.close(); } catch (_) {} resolve(v); }; ws.on('message', d => { let m; try { m = JSON.parse(d); } catch (_) { return; } if (m.t === 'welcome') fin({ ok: true, m }); if (m.t === 'login_fail') fin({ ok: false, reason: m.reason }); }); ws.on('close', c => fin({ ok: false, code: c })); ws.on('error', () => fin({ ok: false })); ws.on('open', () => ws.send(JSON.stringify({ t: 'login', data: b64({ uniqueID: yid, guestToken: token, publicName: 'Ks' }), signature: '' }))); }); }
function vaultFile() { return path.join(DATA, 'account_keys.json'); }
function decryptWith(secret) { const st = JSON.parse(fs.readFileSync(vaultFile(), 'utf8')); const key = crypto.scryptSync(secret, 'ps_vault_storage_salt_2026', 32); try { const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(st.iv, 'hex')); d.setAuthTag(Buffer.from(st.tag, 'hex')); return JSON.parse(d.update(st.data, 'hex', 'utf8') + d.final('utf8')); } catch (_) { return null; } }
(async () => {
  try {
    // A. встроенные секреты (как на текущем проде)
    check('A: старт со встроенными секретами', await start({}), log.slice(-300));
    const K1 = 'MigrKeyOne' + Date.now().toString(36), K2 = 'MigrKeyTwo' + Date.now().toString(36);
    const a1 = await enter(K1), a2 = await enter(K2);
    check('A: два ключа созданы', a1.j && a1.j.ok && a2.j && a2.j.ok, [a1.status, a2.status]);
    const yid1 = 'local_' + a1.j.localId, yid2 = 'local_' + a2.j.localId;
    // legacy (вычисляемый) токен аккаунта 1 — от старого хэша
    const AUTH = require(path.join(STEAM, 'server', 'auth.js'));
    const oldReg = decryptWith('ps_vault_master_secret_2026_aes256gcm');
    check('A: реестр зашифрован встроенным ключом', !!oldReg, '');
    const oldHash1 = Object.keys(oldReg.byHash).find(h => oldReg.byHash[h].yid === yid1);
    const derived1 = AUTH.deriveGuestToken(oldHash1);
    const g1 = await login(yid1, 'guest-dev-token-' + 'x'.repeat(20)); // создаём персонажа токеном не из ключа → отказ
    check('A: чужой токен к аккаунту с ключом — отказ', !g1.ok, g1.reason || g1.code);
    const l1 = await login(yid1, a1.j.guestToken); check('A: вход выданным токеном', l1.ok, l1.reason);
    await stop();

    // B. задаём новые секреты на «живой» базе
    check('B: старт с новыми KEY_PEPPER / KEY_VAULT_SECRET', await start({ KEY_PEPPER: NEW_PEPPER, KEY_VAULT_SECRET: NEW_VAULT }), log.slice(-300));
    check('B: реестр перешифрован автоматически', /перешифрован текущим KEY_VAULT_SECRET \(был: builtin\)/.test(log), '');
    check('B: бэкап старого конверта', fs.existsSync(path.join(DATA, 'account_keys_backup_builtin.json')), '');
    check('B: реестр открывается новым ключом, старым — нет', !!decryptWith(NEW_VAULT) && !decryptWith('ps_vault_master_secret_2026_aes256gcm'), '');
    check('B: счётчик миграции 0 из 2', /ключей на текущих параметрах: 0 из 2/.test(log), (log.match(/ключей на текущих[^\n]*/) || [''])[0]);
    const b1 = await enter(K1);
    check('B: старый ключ входит в тот же аккаунт (хэш мигрировал)', b1.j && b1.j.ok && b1.j.action === 'login' && 'local_' + b1.j.localId === yid1, b1.j && (b1.j.action + ' ' + b1.j.localId));
    const reg = decryptWith(NEW_VAULT);
    const e1 = Object.entries(reg.byHash).find(([, e]) => e.yid === yid1);
    check('B: запись переписана на новый хэш с меткой параметров', e1 && e1[0] !== oldHash1 && !!e1[1].p && (e1[1].legacyKeyHashes || []).includes(oldHash1), e1 && e1[1].p);
    const lg = await login(yid1, derived1);
    check('B: legacy-токен от старого хэша ещё принимается и заменяется', lg.ok && lg.m.guestToken && lg.m.guestToken !== derived1, lg.reason);
    const l2 = await login(yid2, a2.j.guestToken); check('B: второй аккаунт (не мигрирован) входит своим токеном', l2.ok, l2.reason);
    const ks = await enter('MigrKeyNew' + Date.now().toString(36));
    const reg2 = decryptWith(NEW_VAULT);
    check('B: новый ключ сразу на новых параметрах', ks.j && ks.j.ok && Object.values(reg2.byHash).some(e => e.yid === 'local_' + ks.j.localId && e.p === e1[1].p), '');
    await stop();

    // C. KEY_ALLOW_OLD_HASHES=0 — мигрированный работает
    check('C: старт с KEY_ALLOW_OLD_HASHES=0', await start({ KEY_PEPPER: NEW_PEPPER, KEY_VAULT_SECRET: NEW_VAULT, KEY_ALLOW_OLD_HASHES: '0' }), log.slice(-200));
    check('C: счётчик 2 из 3', /ключей на текущих параметрах: 2 из 3/.test(log), (log.match(/ключей на текущих[^\n]*/) || [''])[0]);
    const c1 = await enter(K1, { mode: 'login' });
    check('C: мигрированный ключ входит', c1.j && c1.j.ok && 'local_' + c1.j.localId === yid1, c1.j && c1.j.error);
    const c2 = await enter(K2, { mode: 'login' });
    check('C: немигрированный ключ не принимается (ожидаемо при =0)', c2.j && !c2.j.ok, c2.j && c2.j.error);
    await stop();

    // D. неверный KEY_VAULT_SECRET — реестр не трогается
    const before = fs.readFileSync(vaultFile(), 'utf8');
    check('D: старт с неверным KEY_VAULT_SECRET', await start({ KEY_PEPPER: NEW_PEPPER, KEY_VAULT_SECRET: crypto.randomBytes(32).toString('hex') }), '');
    const d1 = await enter(K1); check('D: вход по ключу — busy, реестр не затёрт', d1.j && d1.j.error === 'busy' && fs.readFileSync(vaultFile(), 'utf8') === before, d1.j && d1.j.error);
    await stop();

    // E. production без секретов — не стартует
    const e = cp.spawnSync(process.execPath, ['-e', "require('./server/account-keys.js'); process.exit(0)"], { cwd: STEAM, env: Object.assign({}, process.env, { NODE_ENV: 'production', KEY_PEPPER: '', KEY_VAULT_SECRET: '' }), encoding: 'utf8' });
    check('E: production без KEY_PEPPER/KEY_VAULT_SECRET — FATAL', e.status === 1 && /FATAL/.test(e.stderr), e.status);
    const e2 = cp.spawnSync(process.execPath, ['-e', "require('./server/account-keys.js'); process.exit(0)"], { cwd: STEAM, env: Object.assign({}, process.env, { NODE_ENV: 'production', KEY_PEPPER: NEW_PEPPER, KEY_VAULT_SECRET: NEW_VAULT }), encoding: 'utf8' });
    check('E: production с секретами — модуль грузится', e2.status === 0, e2.stderr.slice(0, 200));
  } catch (err) { check('исключение', false, err && err.stack); }
  await stop();
  for (const r of res) console.log(r[0], r[1], r[2] !== undefined && r[2] !== '' ? '→ ' + JSON.stringify(r[2]).slice(0, 200) : '');
  console.log('\nИтого OK=' + res.filter(r => r[0] === 'OK  ').length + ' FAIL=' + res.filter(r => r[0] !== 'OK  ').length);
  process.exit(0);
})();
