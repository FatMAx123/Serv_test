// Смоук этапа 4.4: H7 — данные редактора только JSON (без генерации исполняемого JS);
// E13 — проверка и атомарная запись PNG покраски террейна.
// Сам поднимает сервер (file-DB, EDITOR_ENABLED=1) в копии steam/. Запуск: node tests/smoke-editor-json.js (порт 3953)
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'ej-'));
const STEAM = path.join(WORK, 'steam'), CLIENT = path.join(WORK, 'client');
const PORT = 3953, base = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const res = []; const check = (n, c, i) => res.push([c ? 'OK  ' : 'FAIL', n, i]);
function copyDir(a, b, skipBig) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); const st = fs.lstatSync(s); if (st.isDirectory()) { if (f === 'node_modules' || (f === 'data' && !skipBig) || (skipBig && (f === 'assets' || f === 'mesh' || f === 'textures' || f === 'libs'))) continue; copyDir(s, d, skipBig); } else fs.copyFileSync(s, d); } }
copyDir(path.join(ROOT, 'steam'), STEAM, false);
copyDir(path.join(ROOT, 'gm'), CLIENT, true); // клиент без тяжёлых ассетов
fs.symlinkSync(path.join(ROOT, 'steam', 'node_modules'), path.join(STEAM, 'node_modules'));
fs.symlinkSync(CLIENT, path.join(STEAM, 'client'));
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const CJSON = path.join(CLIENT, 'data', 'editor-overrides.json'), SJSON = path.join(STEAM, 'shared', 'editor-overrides.json');
const LOADER = path.join(CLIENT, 'js', 'editor-overrides-data.js');
let srv = null, log = '';
async function start(env) {
  log = '';
  srv = cp.spawn(process.execPath, ['server/server.js'], { cwd: STEAM, env: Object.assign({}, process.env, { PORT: String(PORT), ALLOW_INSECURE_DEV: '1', EDITOR_ENABLED: '1' }, env) });
  srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 60; i++) { await sleep(250); if (/\[AccountKeys\] loaded bindings/.test(log)) return true; if (srv.exitCode != null) return false; }
  return false;
}
async function stop() { if (srv && srv.exitCode == null) { srv.kill('SIGINT'); for (let i = 0; i < 40 && srv.exitCode == null; i++) await sleep(100); if (srv.exitCode == null) srv.kill('SIGKILL'); } await sleep(300); }
async function post(url, body) { const r = await fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) }); return { status: r.status, j: await r.json().catch(() => null) }; }
function tinyPng(color) { // валидный PNG 1x1
  const zlib = require('zlib');
  const crcTable = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.from([0, color, 0, 0, 255]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const tmpLeft = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter(f => f.includes('.tmp-')) : [];
(async () => {
  try {
    // старый сервер: клиентского JSON ещё нет — должен появиться из shared при старте
    fs.rmSync(CJSON, { force: true });
    check('старт', await start({}), log.slice(-300));
    check('client/data/editor-overrides.json создан из shared при старте', fs.existsSync(CJSON) && sha(CJSON) === sha(SJSON), /обновлён из shared/.test(log));
    let r = await fetch(base + '/data/editor-overrides.json');
    const body = await r.text();
    check('GET /data/editor-overrides.json — JSON, no-cache', r.status === 200 && /application\/json/.test(r.headers.get('content-type')) && /no-cache/.test(r.headers.get('cache-control')) && !/immutable/.test(r.headers.get('cache-control')) && !!JSON.parse(body), [r.status, r.headers.get('content-type'), r.headers.get('cache-control')]);
    r = await fetch(base + '/js/editor-overrides-data.js'); const lj = await r.text();
    check('загрузчик статический (без данных мира)', r.status === 200 && !/diskData/.test(lj) && /__PS_EDITOR_OVERRIDES_READY/.test(lj) && lj.length < 8000, lj.length);
    const loaderHash = sha(LOADER);
    const curRev = JSON.parse(fs.readFileSync(SJSON, 'utf8')).rev | 0;
    r = await post('/api/save-editor-data', { baseRev: curRev, windSettings: { enabled: true, strength: 0.42, speed: 1, turbulence: 0, angle: 10 } });
    const cj = JSON.parse(fs.readFileSync(CJSON, 'utf8'));
    check('сохранение сцены → client JSON = shared JSON, rev+1', r.j && r.j.ok && cj.rev === curRev + 1 && sha(CJSON) === sha(SJSON) && cj.windSettings.strength === 0.42, r.j);
    check('загрузчик не перезаписан сохранением', sha(LOADER) === loaderHash, '');
    r = await post('/api/save-editor-data', { baseRev: curRev + 1, windSettings: { enabled: true, strength: 1, speed: 1, turbulence: 0, angle: 0, x: '</script><script>alert(1)</script>' } });
    const r2 = await fetch(base + '/data/editor-overrides.json');
    check('строка с </script> — только данные JSON, отдаются как application/json', /application\/json/.test(r2.headers.get('content-type')) && !fs.readFileSync(LOADER, 'utf8').includes('alert(1)'), r.status);
    check('нет временных файлов (json)', tmpLeft(path.join(CLIENT, 'data')).length === 0 && tmpLeft(path.join(STEAM, 'shared')).length === 0, tmpLeft(path.join(CLIENT, 'data')));

    // E13: террейн
    const P1 = path.join(CLIENT, 'data', 'terrain-paint-1.png'), S1 = path.join(STEAM, 'shared', 'terrain-paint-1.png');
    const P2 = path.join(CLIENT, 'data', 'terrain-paint-2.png');
    const before1 = fs.existsSync(P1) ? sha(P1) : null, before2 = fs.existsSync(P2) ? sha(P2) : null;
    r = await post('/api/save-terrain-paint', { layer1: 'data:image/png;base64,' + Buffer.from('not a png at all, just text padding padding padding padding padding').toString('base64') });
    check('не-PNG → 400, файлы не тронуты', r.status === 400 && (fs.existsSync(P1) ? sha(P1) : null) === before1, [r.status, r.j && r.j.error]);
    r = await post('/api/save-terrain-paint', { layer1: 'data:image/png;base64,' + tinyPng(10).toString('base64'), layer2: 'data:image/png;base64,' + Buffer.from('garbage').toString('base64') });
    check('второй слой битый → 400, первый тоже не записан (всё или ничего)', r.status === 400 && (fs.existsSync(P1) ? sha(P1) : null) === before1 && (fs.existsSync(P2) ? sha(P2) : null) === before2, r.status);
    r = await post('/api/save-terrain-paint', '{bad json');
    check('битый JSON → 400', r.status === 400, r.status);
    const png1 = tinyPng(200), png2 = tinyPng(77);
    r = await post('/api/save-terrain-paint', { layer1: 'data:image/png;base64,' + png1.toString('base64'), layer2: 'data:image/png;base64,' + png2.toString('base64') });
    check('валидные PNG → 200, client/data и shared совпадают', r.status === 200 && fs.readFileSync(P1).equals(png1) && fs.readFileSync(S1).equals(png1) && fs.readFileSync(P2).equals(png2), r.status);
    check('нет временных файлов (png)', tmpLeft(path.join(CLIENT, 'data')).length === 0 && tmpLeft(path.join(STEAM, 'shared')).length === 0, '');
    r = await fetch(base + '/data/terrain-paint-1.png');
    check('PNG покраски отдаётся без immutable (раньше кэш на год)', /no-cache/.test(r.headers.get('cache-control')) && !/immutable/.test(r.headers.get('cache-control')), r.headers.get('cache-control'));
    await stop();
    // кэш как в production (SERVE_NO_CACHE=0)
    check('старт с SERVE_NO_CACHE=0', await start({ SERVE_NO_CACHE: '0' }), '');
    const cc = async (u) => (await fetch(base + u)).headers.get('cache-control');
    const c1 = await cc('/data/editor-overrides.json'), c2 = await cc('/data/terrain-paint-1.png'), c3 = await cc('/js/editor-overrides-data.js?v=json-1'), c4 = await cc('/js/menu-page.js?v=25');
    check('prod-кэш: JSON и PNG — no-cache, версионированные js — immutable', c1 === 'no-cache' && c2 === 'no-cache' && /immutable/.test(c4) && /no-cache|immutable/.test(c3), [c1, c2, c3, c4]);
    await stop();
  } catch (err) { check('исключение', false, err && err.stack); }
  await stop();
  for (const x of res) console.log(x[0], x[1], x[2] !== undefined && x[2] !== '' ? '→ ' + JSON.stringify(x[2]).slice(0, 200) : '');
  console.log('\nИтого OK=' + res.filter(x => x[0] === 'OK  ').length + ' FAIL=' + res.filter(x => x[0] !== 'OK  ').length);
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
})();
