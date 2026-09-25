// ============================================================
//  TESTS / SERVER.TEST.JS — интеграционные проверки против живого сервера.
//  Поднимает свой процесс на изолированном порту с отдельным DATA_DIR,
//  проверяет античит-инварианты по WS. Не трогает рабочие профили.
// ============================================================
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const WebSocket = require(path.join(ROOT, 'node_modules', 'ws'));

const PORT = +(process.env.TEST_PORT || 18099);
const HOST = '127.0.0.1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function httpGet(p) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: HOST, port: PORT, path: p }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    }).on('error', reject);
  });
}
function httpPost(p, obj, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(obj || {});
    const req = http.request({
      hostname: HOST, port: PORT, path: p, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }, headers)
    }, (res) => {
      let b = '';
      res.on('data', (d) => { b += d; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.end(data);
  });
}
const b64 = (o) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url');

const DATA_DIR = path.join(ROOT, 'data');

function profileOnDisk(yid) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, yid + '.json'), 'utf8')); }
  catch (e) { return null; }
}
async function waitForProfile(yid, predicate, timeoutMs = 2500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const pr = profileOnDisk(yid);
    if (pr && (!predicate || predicate(pr))) return pr;
    await sleep(50);
  }
  return profileOnDisk(yid);
}
function wipe(prefix) {
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (f.indexOf(prefix) === 0) { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch (_) {} }
  }
}
function wipeTestSanctions() {
  const f = path.join(DATA_DIR, 'moderation', 'sanctions.json');
  try {
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    let changed = false;
    for (const k of Object.keys(raw || {})) {
      if (String(k).indexOf('itest_') === 0) { delete raw[k]; changed = true; }
    }
    if (changed) fs.writeFileSync(f, JSON.stringify(raw));
  } catch (_) {}
}
function wipeTestClans() {
  const dir = path.join(DATA_DIR, 'clans');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.json$/i.test(f)) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const ys = [c.leaderYid].concat((c.members || []).map((m) => m.yid || ''));
      if (ys.some((y) => String(y).indexOf('itest_') === 0)) fs.unlinkSync(path.join(dir, f));
    } catch (_) {}
  }
}
function seedChar(yid, extra) {
  extra = extra || {};
  const pr = {
    name: extra.name || 'Claner',
    level: extra.level != null ? extra.level : 10,
    exp: 0, cls: extra.cls || 'operator',
    inv: extra.inv || { copper_parts: 30000, synthetic_oil: 8 },
    x: extra.x != null ? extra.x : -107.5,
    z: extra.z != null ? extra.z : -246.4
  };
  if (extra.quests) pr.quests = extra.quests;
  if (extra.karma != null) pr.karma = extra.karma;
  if (extra.pk != null) pr.pk = extra.pk;
  if (extra.hp != null) pr.hp = extra.hp;
  if (extra.equip) pr.equip = extra.equip;
  if (extra.plusById) pr.plusById = extra.plusById;
  if (extra.nonGm != null) pr.nonGm = extra.nonGm;
  fs.writeFileSync(path.join(DATA_DIR, yid + '.json'), JSON.stringify(pr));
}

class Client {
  constructor(yid, char) {
    this.yid = yid; this.char = char || {};
    this.msgs = []; this.seq = 0; this.welcome = null; this.closed = null;
    this.knownMobs = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket('ws://' + HOST + ':' + PORT);
      this.ws = ws;
      ws.on('open', () => ws.send(JSON.stringify({
        t: 'login',
        data: b64({ uniqueID: this.yid, publicName: this.char.name || 'Tester' }),
        signature: '',
        char: this.char
      })));
      ws.on('message', (r) => {
        let m; try { m = JSON.parse(r); } catch (e) { return; }
        this.msgs.push(m);
        if (m.t === 'aoi' && Array.isArray(m.enter)) {
          for (const en of m.enter) {
            if (en && en.t === 'm' && en.mid != null) {
              this.knownMobs.set(en.mid, { mid: en.mid, hp: en.hp, x: en.x, z: en.z, mobId: en.mobId });
            }
          }
        }
        if (m.t === 'aoi' && Array.isArray(m.leave)) {
          for (const k of m.leave) {
            if (typeof k === 'string' && k[0] === 'm') this.knownMobs.delete(parseInt(k.slice(1), 10));
          }
        }
        if (m.t === 'upd' && Array.isArray(m.upd)) {
          for (const e of m.upd) {
            if (!e || typeof e.k !== 'string' || e.k[0] !== 'm') continue;
            const mid = parseInt(e.k.slice(1), 10);
            const cur = this.knownMobs.get(mid) || { mid };
            if (e.hp != null) cur.hp = e.hp;
            if (e.x != null) cur.x = e.x;
            if (e.z != null) cur.z = e.z;
            this.knownMobs.set(mid, cur);
          }
        }
        if (m.t === 'mob_dead' && m.mid != null) this.knownMobs.delete(m.mid);
        if (m.t === 'welcome') { this.welcome = m; resolve(m); }
        if (m.t === 'login_fail') reject(new Error('login_fail ' + m.reason));
      });
      ws.on('close', (c, r) => { this.closed = { code: c, reason: String(r || '') }; });
      ws.on('error', () => {});
      setTimeout(() => { if (!this.welcome) reject(new Error('welcome timeout ' + this.yid)); }, 10000);
    });
  }
  send(o) { o.seq = ++this.seq; if (this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  raw(v) { if (this.ws.readyState === 1) this.ws.send(typeof v === 'string' ? v : JSON.stringify(v)); }
  find(t) { return this.msgs.filter(m => m.t === t); }
  last(t) { const a = this.find(t); return a.length ? a[a.length - 1] : null; }
  clear() { this.msgs.length = 0; }
  close() { try { this.ws.close(1000); } catch (_) {} }
  /** Мобы, вошедшие в AOI. */
  aoiMobs() {
    const out = [];
    for (const m of this.msgs) {
      if (m.t !== 'aoi' || !Array.isArray(m.enter)) continue;
      for (const en of m.enter) if (en && en.t === 'm' && en.mid != null) out.push(en);
    }
    return out;
  }
  /** Мобы, живые на последний известный момент (по upd + mob_dead). */
  aliveMobs() {
    if (this.knownMobs && this.knownMobs.size > 0) {
      const out = [];
      for (const [, mob] of this.knownMobs) {
        if (mob && (mob.hp == null || mob.hp > 0)) out.push(Object.assign({}, mob));
      }
      if (out.length) return out;
    }
    const hp = new Map();
    const pos = new Map();
    for (const m of this.msgs) {
      if (m.t === 'aoi' && Array.isArray(m.enter)) {
        for (const en of m.enter) {
          if (en && en.t === 'm' && en.mid != null) { hp.set(en.mid, en.hp); pos.set(en.mid, { x: en.x, z: en.z, mobId: en.mobId }); }
        }
      }
      if (m.t === 'upd' && Array.isArray(m.upd)) {
        for (const e of m.upd) {
          if (!e || typeof e.k !== 'string' || e.k[0] !== 'm') continue;
          const mid = parseInt(e.k.slice(1), 10);
          hp.set(mid, e.hp);
          const p0 = pos.get(mid) || {};
          pos.set(mid, { x: e.x, z: e.z, mobId: p0.mobId });
        }
      }
      if (m.t === 'mob_dead' && m.mid != null) hp.set(m.mid, 0);
    }
    const out = [];
    for (const [mid, h] of hp) {
      if (h > 0 && pos.has(mid)) out.push(Object.assign({ mid, hp: h }, pos.get(mid)));
    }
    return out;
  }
  /** Умер ли игрок с последней очистки. */
  isDead() { return this.msgs.some(m => m.t === 'you_died'); }
  /** Позиция игрока pid в AOI/upd наблюдателя. */
  seen(pid) {
    let pos = null;
    for (const m of this.msgs) {
      if (m.t === 'aoi' && Array.isArray(m.enter)) {
        for (const e of m.enter) if (e && e.t === 'p' && e.pid === pid) pos = { x: e.x, z: e.z, name: e.name };
      }
      if (m.t === 'upd' && Array.isArray(m.upd)) {
        for (const e of m.upd) if (e && e.k === 'p' + pid) pos = Object.assign({}, pos || {}, { x: e.x, z: e.z });
      }
    }
    return pos;
  }
}

/**
 * Убедиться, что игрок жив. Тесты гоняют игрока dev-телепортами по хант-зонам,
 * и мобы успевают его убить — дальше все интенты отвечают reason:'dead'.
 */
async function ensureAlive(c) {
  if (!c.isDead()) return;
  c.send({ t: 'revive', mode: 'village' });
  for (let i = 0; i < 20; i++) {
    await sleep(150);
    if (c.msgs.some(m => m.t === 'you_revived')) break;
  }
  c.clear();
}

function startServer() {
  if (process.platform === 'win32') {
    try {
      const out = require('child_process').execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
      for (const line of out.trim().split('\n')) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && pid !== '0' && pid !== String(process.pid)) {
          try { require('child_process').execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' }); } catch (_) {}
        }
      }
    } catch (_) {}
  }
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, {
      PORT: String(PORT),
      DB: 'file',
      SERVE_CLIENT: '0',
      DEBUG_EVENTS: '0',
      NODE_ENV: 'development'
    });
    delete env.YANDEX_APP_SECRET;   // dev-логин без подписи
    delete env.EDITOR_ENABLED;
    const proc = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js')], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    const onData = (d) => {
      out += String(d);
      if (out.indexOf('на порту ' + PORT) >= 0) { cleanupListeners(); resolve(proc); }
    };
    const onErr = (d) => { out += String(d); };
    function cleanupListeners() {
      proc.stdout.off('data', onData);
      proc.stderr.off('data', onErr);
      const logPath = path.join(ROOT, 'tests', 'server.log');
      fs.writeFileSync(logPath, '');
      proc.stdout.on('data', (d) => {
        fs.appendFileSync(logPath, d);
      });
      proc.stderr.on('data', (d) => {
        fs.appendFileSync(logPath, '[STDERR] ' + d);
        console.error('[SERVER STDERR]', String(d));
      });
    }
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onErr);
    proc.on('exit', (code, sig) => {
      console.error('[SERVER EXITED]', code, sig);
      if (!proc._ready) reject(new Error('сервер завершился с кодом ' + code + '\n' + out.slice(-800)));
    });
    setTimeout(() => reject(new Error('сервер не поднялся за 20 с\n' + out.slice(-800))), 20000);
  });
}

module.exports = async function (t) {
  wipe('itest_');
  wipeTestClans();
  wipeTestSanctions();
  let proc;
  try {
    proc = await startServer();
    proc._ready = true;
  } catch (e) {
    t.ok(false, 'сервер поднялся на порту ' + PORT, e && e.message);
    return;
  }
  t.suite('server: старт');
  t.ok(true, 'сервер поднялся на порту ' + PORT);
  await sleep(200);
  const hz = await httpGet('/healthz');
  t.eq(hz.status, 200, '/healthz 200 пока тик жив');
  let hzBody = {};
  try { hzBody = JSON.parse(hz.body); } catch (_) {}
  t.ok(hzBody.ok === true && hzBody.lagMs < 1000, '/healthz смотрит lastTickAt, не HTTP-слой',
    JSON.stringify(hzBody));
  const met = await httpGet('/metrics');
  t.eq(met.status, 200, '/metrics отвечает');
  let metBody = {};
  try { metBody = JSON.parse(met.body); } catch (_) {}
  t.ok(metBody && typeof metBody.players === 'number' && typeof metBody.mobs === 'number',
    '/metrics: онлайн и размеры mobs/players', JSON.stringify({ players: metBody.players, mobs: metBody.mobs }));
  t.ok(typeof metBody.tickMs === 'number' && typeof metBody.adena === 'number',
    '/metrics: фактический tickMs и сумма адены', JSON.stringify({ tickMs: metBody.tickMs, adena: metBody.adena }));
  t.ok(typeof metBody.bytesOut === 'number' && typeof metBody.packetsOut === 'number',
    '/metrics: трафик', JSON.stringify({ bytesOut: metBody.bytesOut, packetsOut: metBody.packetsOut }));
  t.eq(metBody.deflate, true, '/metrics: perMessageDeflate включён');
  t.ok(typeof metBody.updSent === 'number' && typeof metBody.updSkip === 'number',
    '/metrics: счётчики дельты upd', JSON.stringify({ updSent: metBody.updSent, updSkip: metBody.updSkip }));
  t.ok(typeof metBody.eventLoopLagMs === 'number',
    '/metrics: eventLoopLagMs доступен', JSON.stringify({ lag: metBody.eventLoopLagMs }));

  const clients = [];
  const mk = (yid, char) => { const c = new Client(yid, char); clients.push(c); return c; };

  try {
    t.suite('server: файлы редактора закрыты');
    const edJs = await httpGet('/js/editor.js');
    t.eq(edJs.status, 404, 'GET /js/editor.js без cookie → 404');
    const edHtml = await httpGet('/editor.html');
    t.eq(edHtml.status, 404, 'GET /editor.html без cookie → 404');
    const edLay = await httpGet('/js/editor-engine-layout.js');
    t.eq(edLay.status, 404, 'GET /js/editor-engine-layout.js без cookie → 404');
    const edCss = await httpGet('/css/editor-engine.css');
    t.eq(edCss.status, 404, 'GET /css/editor-engine.css без cookie → 404');
    const sessBad = await httpGet('/api/editor/session?k=not-a-real-key');
    t.eq(sessBad.status, 403, 'session с мусорным ключом → 403');
    const regular = mk('itest_regular', { name: 'RegularGuy' });
    await regular.connect();
    t.ok(!regular.welcome.gm, 'itest_regular не GM');
    t.ok(!regular.welcome.editorKey, 'обычный игрок не получает editorKey');
    regular.close();
    const gmEd = mk('itest_edguard', { name: 'EdGm' });
    await gmEd.connect();
    t.ok(!!gmEd.welcome.gm, 'itest_* кроме regular — GM');
    t.ok(typeof gmEd.welcome.editorKey === 'string' && gmEd.welcome.editorKey.length >= 24,
      'GM получает editorKey в welcome');
    const sessOk = await httpGet('/api/editor/session?k=' + encodeURIComponent(gmEd.welcome.editorKey));
    t.eq(sessOk.status, 200, 'session по ключу GM → 200');
    gmEd.close();

    // ── Античит движения ────────────────────────────────────────────────────
    t.suite('server: античит движения (clampSpeed)');
    const hack = mk('itest_speed');
    await hack.connect();
    const s0 = { x: hack.welcome.self.x, z: hack.welcome.self.z };
    const tStart = Date.now();
    for (let i = 0; i < 100; i++) {
      hack.send({ t: 'move', x: s0.x + 50 * (i + 1), z: s0.z }); // цель всегда далеко
      await sleep(50);
    }
    await sleep(4200); // автосейв 3.75 с
    const elapsed = (Date.now() - tStart) / 1000;
    const prHack = profileOnDisk('itest_speed');
    const dist = prHack ? Math.hypot(prHack.x - s0.x, prHack.z - s0.z) : -1;
    const speed = dist / elapsed;
    t.ok(dist >= 0 && speed < 12, 'спидхак 20 пакетов/с зажат ниже 12 м/с',
      dist.toFixed(1) + ' м / ' + elapsed.toFixed(1) + ' с = ' + speed.toFixed(2) + ' м/с');

    const legit = mk('itest_legit');
    await legit.connect();
    const l0 = { x: legit.welcome.self.x, z: legit.welcome.self.z };
    let lx = l0.x;
    for (let i = 0; i < 40; i++) { lx += 7.0 * 0.1; legit.send({ t: 'move', x: lx, z: l0.z }); await sleep(100); }
    await sleep(4200);
    const prLegit = profileOnDisk('itest_legit');
    const wanted = lx - l0.x;
    const got = prLegit ? prLegit.x - l0.x : -1;
    t.ok(got >= wanted * 0.97, 'легитимные 7 м/с не зажимаются',
      'запрошено ' + wanted.toFixed(1) + ' м, прошло ' + got.toFixed(1) + ' м');
    t.eq(legit.find('self_sync').length, 0,
      'стрим позиции каждые 0.1 с не вызывает коррекций');

    // ── Коррекция позиции при клампе ───────────────────────────────────────
    // Регресс: клиент отправлял `move` только по прибытии, весь забег уходил
    // одним пакетом, сервер обрезал его бюджетом (≈6.6 м) и МОЛЧАЛ. Клиент
    // продолжал думать, что прошёл весь путь, а его снимок серверной позиции
    // оставался с логина — reconciliation дёргала игрока на спавн.
    t.suite('server: коррекция позиции при клампе');
    const jump = mk('itest_jump');
    await jump.connect();
    const j0 = { x: jump.welcome.self.x, z: jump.welcome.self.z };
    await sleep(1200);                                   // накопить полное ведро
    jump.clear();
    jump.send({ t: 'move', x: j0.x + 40, z: j0.z });      // весь путь одним пакетом
    await sleep(500);
    const corr = jump.last('self_sync');
    t.ok(corr, 'сервер сообщает о клампе пакетом self_sync',
      corr ? ('вернул x=' + corr.x.toFixed(1)) : 'нет пакета');
    t.ok(corr && Math.abs(corr.x - j0.x) < 10,
      'коррекция ставит игрока в пределах бюджета, а не на 40 м',
      corr ? ('прошло ' + (corr.x - j0.x).toFixed(1) + ' м из 40') : '');
    jump.clear();
    let jx = corr ? corr.x : j0.x;
    for (let i = 0; i < 20; i++) { jx += 0.85; jump.send({ t: 'move', x: jx, z: j0.z }); await sleep(120); }
    await sleep(300);
    t.eq(jump.find('self_sync').length, 0,
      'тот же путь стримом по 0.85 м проходит без коррекций');
    // Где сервер считает игрока — спрашиваем явным прыжком: ответная коррекция
    // несёт его авторитетную позицию (профиль на диск пишется автосейвом позже).
    jump.clear();
    jump.send({ t: 'move', x: jx + 200, z: j0.z });
    await sleep(400);
    const corr2 = jump.last('self_sync');
    t.ok(corr2 && corr2.x - j0.x > 12, 'сервер согласился с пройденным по стриму путём',
      corr2 ? ((corr2.x - j0.x).toFixed(1) + ' м от старта') : 'нет пакета');

    // ── seq ────────────────────────────────────────────────────────────────
    t.suite('server: дедупликация seq');
    legit.raw('{"t":"chat","text":"seq-inf","seq":1e999}');   // Infinity после парса
    await sleep(200);
    t.ok(!legit.closed, 'seq=Infinity не рвёт соединение');
    legit.clear();
    legit.send({ t: 'chat', text: 'kanal-zhiv' });
    await sleep(500);
    t.ok(legit.find('chat').some(m => String(m.text || '').indexOf('kanal-zhiv') >= 0),
      'канал жив после seq=Infinity (раньше глох навсегда)');
    legit.clear();
    legit.raw('{"t":"chat","text":"frac","seq":1.5}');
    legit.raw('{"t":"chat","text":"neg","seq":-5}');
    await sleep(400);
    t.ok(!legit.closed && !legit.find('chat').some(m => /frac|neg/.test(String(m.text || ''))),
      'дробный и отрицательный seq отброшены, соединение живо');

    // BUG-NET-01: перенос через границу 65535 в 16-битном протоколе
    const roll = mk('itest_seqroll');
    await roll.connect();
    // 1) Инициализируем seq на 65534
    roll.raw(JSON.stringify({ t: 'chat', text: 'seq-65534', seq: 65534 }));
    await sleep(400);
    t.ok(roll.find('chat').some(m => String(m.text || '').indexOf('seq-65534') >= 0),
      'пакет с начальным seq=65534 принят');
    // 2) Следующий seq=65535 (diff = 1 < 0x8000)
    roll.clear();
    roll.raw(JSON.stringify({ t: 'chat', text: 'seq-65535', seq: 65535 }));
    await sleep(400);
    t.ok(roll.find('chat').some(m => String(m.text || '').indexOf('seq-65535') >= 0),
      'пакет с seq=65535 принят');
    // 3) Попытка отправить устаревший seq=65534 (diff = 65535 >= 0x8000 -> отброшен)
    await sleep(1100); // пауза для rate-limit
    roll.clear();
    roll.raw(JSON.stringify({ t: 'chat', text: 'seq-old-65534', seq: 65534 }));
    await sleep(400);
    t.ok(!roll.find('chat').some(m => String(m.text || '').indexOf('seq-old-65534') >= 0),
      'устаревший seq=65534 отброшен');
    // 4) Перенос через границу 65535 -> 1 (diff = (1 - 65535) & 0xffff = 2 < 0x8000)
    roll.clear();
    roll.raw(JSON.stringify({ t: 'chat', text: 'seq-wrapped-1', seq: 1 }));
    await sleep(400);
    t.ok(roll.find('chat').some(m => String(m.text || '').indexOf('seq-wrapped-1') >= 0),
      'пакет после 16-битного переноса seq=1 успешно принят (BUG-NET-01)');
    await roll.close();

    // ── PvP со щитом ───────────────────────────────────────────────────────
    t.suite('server: PvP со щитом (BLOCK_CAP)');
    const atk = mk('itest_atk');
    const def = mk('itest_def');
    await atk.connect(); await def.connect();
    atk.send({ t: 'editor_set_pos', x: 300, z: 300 });
    def.send({ t: 'editor_set_pos', x: 301.5, z: 300 });
    await sleep(500);
    def.send({ t: 'debug_spawn_loot', itemId: 'buckler', count: 1 });
    await sleep(600);
    let lid = null;
    for (const m of def.msgs) if (m.lid != null) lid = m.lid;
    if (lid != null) {
      def.send({ t: 'loot_pickup', lid });
      await sleep(500);
      def.send({ t: 'equip', slot: 'shield', templateId: 'buckler' });
      await sleep(500);
    }
    const shieldOn = !!(((def.last('equip_ok') || {}).equip || {}).shield);
    t.ok(shieldOn, 'защитник надел щит (иначе проверка бессмысленна)');
    await ensureAlive(atk); await ensureAlive(def);
    atk.clear(); def.clear();
    for (let i = 0; i < 14; i++) {
      atk.send({ t: 'attack_player', pid: def.welcome.pid });
      await sleep(250);
      if (atk.find('dmg_player').length + def.find('hit').length > 0) break;
    }
    await sleep(400);
    t.ok(!atk.closed, 'атакующего не отключило (ReferenceError BLOCK_CAP)',
      atk.closed ? ('close=' + atk.closed.code + ' ' + atk.closed.reason) : 'соединение живо');
    t.ok(atk.find('dmg_player').length + def.find('hit').length > 0, 'PvP-урон проходит',
      'пакетов: ' + (atk.find('dmg_player').length + def.find('hit').length));

    // ── Приборы инженера ───────────────────────────────────────────────────
    t.suite('server: приборы инженера (device_upgrade)');
    const eng = mk('itest_eng', { cls: 'engineer', name: 'Enginer' });
    await eng.connect();
    const hp0 = eng.welcome.self.maxHp;
    eng.clear();
    eng.send({
      t: 'equip', slot: 'necklace', templateId: 'engineer_emitter_low',
      circuitLevel: 99, nanoLevel: 99, shellIndex: 13, casingIndex: 13
    });
    await sleep(600);
    const neck = ((eng.last('equip_ok') || {}).equip || {}).necklace || {};
    t.eq([neck.circuitLevel | 0, neck.shellIndex | 0], [1, 0],
      'уровни приборов из пакета equip игнорируются (было circuitLevel: 99)');

    eng.clear();
    eng.send({ t: 'device_upgrade', track: 'shell' });
    await sleep(500);
    const noMats = eng.last('device_fail');
    t.ok(noMats && noMats.reason === 'no_mats', 'прокачка корпуса требует материалы',
      noMats ? (noMats.reason + ' ' + (noMats.matId || '')) : 'нет ответа');

    eng.clear();
    eng.send({ t: 'debug_spawn_loot', itemId: 'copper_parts', count: 99 });
    await sleep(600);
    let clid = null;
    for (const m of eng.msgs) if (m.lid != null) clid = m.lid;
    if (clid != null) { eng.send({ t: 'loot_pickup', lid: clid }); await sleep(500); }
    eng.clear();
    eng.send({ t: 'device_upgrade', track: 'shell' });
    await sleep(600);
    const upOk = eng.last('device_ok');
    const cs = eng.last('combat_stats');
    t.ok(upOk && upOk.index === 1 && (upOk.inv.copper_parts | 0) === 59,
      'успешная прокачка списала 40 copper_parts',
      upOk ? ('index=' + upOk.index + ' copper=' + upOk.inv.copper_parts) : 'нет ответа');
    t.ok(cs && cs.maxHp === hp0 + 20, 'корпус ng2 дал +20 HP через gearFromEquip',
      cs ? (hp0 + ' → ' + cs.maxHp) : 'нет combat_stats');

    // персистентность после переподключения
    eng.close();
    await sleep(1200);
    const eng2 = mk('itest_eng', { cls: 'engineer', name: 'Enginer' });
    await eng2.connect();
    const prEng = profileOnDisk('itest_eng');
    t.ok(eng2.welcome.self.maxHp === hp0 + 20 && prEng && prEng.devices && prEng.devices.shell === 1,
      'уровень корпуса персистится в профиле',
      'maxHp=' + eng2.welcome.self.maxHp + ' devices=' + JSON.stringify(prEng && prEng.devices));

    // ── Кулдаун скилла ─────────────────────────────────────────────────────
    t.suite('server: кулдаун скилла');
    eng2.clear();
    eng2.send({ t: 'skill', skillId: 'eng_self_repair' });
    await sleep(400);
    const okCount = eng2.find('skill_ok').length;
    const cdSec = (eng2.last('skill_ok') || {}).cooldown;
    eng2.send({ t: 'skill', skillId: 'eng_self_repair' });
    await sleep(500);
    const repeat = eng2.find('skill_ok').length - okCount;
    const cdFails = eng2.find('skill_fail').filter(m => m.reason === 'cooldown').length;
    t.ok(okCount === 1 && repeat === 0 && cdFails > 0 && cdSec > 1,
      'серверный CD > 0 и держит спам (было cooldown − castTime ≤ 0)',
      'cooldown=' + cdSec + ' с, отказов=' + cdFails);

    // ── Имя и внешность ────────────────────────────────────────────────────
    t.suite('server: валидация имени и внешности');
    const obs = mk('itest_obs');
    await obs.connect();
    obs.send({ t: 'editor_set_pos', x: -500, z: -500 });
    await sleep(400);
    const bad = mk('itest_name', { name: '<img src=x onerror=alert(1)>' + 'A'.repeat(5000) });
    await bad.connect();
    bad.send({ t: 'editor_set_pos', x: -500, z: -498 });
    await sleep(900);
    const seenName = (obs.seen(bad.welcome.pid) || {}).name;
    const prName = profileOnDisk('itest_name');
    t.ok(seenName && seenName.length <= 16 && !/[<>]/.test(seenName),
      'имя в AOI-снапшоте обрезано и без HTML', JSON.stringify(seenName));
    t.ok(prName && prName.name.length <= 16 && !/[<>]/.test(prName.name),
      'имя в профиле обрезано и без HTML', JSON.stringify(prName && prName.name));

    const ap = mk('itest_appear', {
      name: 'Appear',
      appearance: {
        hairId: 'X'.repeat(20000), hairColor: 'javascript:1', faceId: 'face2',
        weaponId: '../../etc/passwd', junk: 'y'.repeat(20000)
      }
    });
    await ap.connect();
    const apOut = ap.welcome.self && ap.welcome.self.appearance;
    t.eq(apOut, { hairId: 'none', hairColor: '#121014', faceId: 'face2', weaponId: null },
      'appearance приведён к whitelist из 4 полей');

    // ── Дистанция melee ────────────────────────────────────────────────────
    t.suite('server: дистанция автоатаки');
    const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
    try {
      const ovr = path.join(ROOT, 'shared', 'editor-overrides.json');
      if (fs.existsSync(ovr) && WM.applyEditorOverrides) {
        WM.applyEditorOverrides(JSON.parse(fs.readFileSync(ovr, 'utf8')));
      } else if (WM.rebuildMobSpotsFromEditor) {
        WM.rebuildMobSpotsFromEditor();
      }
    } catch (_) {}
    const spots = (WM.buildSpots ? WM.buildSpots() : []).filter(s => !s.boss);
    const mv = mk('itest_melee');
    await mv.connect();
    let mid = null, mpos = null;
    for (const sp of spots.slice(0, 12)) {
      mv.clear();
      mv.send({ t: 'editor_set_pos', x: sp.x, z: sp.z });
      await sleep(300);
      mv.send({ t: 'move', x: sp.x + 0.4, z: sp.z });
      await sleep(800);
      const found = mv.aoiMobs();
      if (found.length) { mid = found[0].mid; mpos = { x: found[0].x, z: found[0].z }; break; }
    }
    if (mid != null) {
      mv.send({ t: 'editor_set_pos', x: mpos.x + 25, z: mpos.z });
      await sleep(400);
      mv.clear();
      for (let i = 0; i < 6; i++) { mv.send({ t: 'attack', mid, ranged: true }); await sleep(200); }
      await sleep(400);
      t.eq(mv.find('dmg').length, 0, 'melee с 25 м не бьёт (msg.ranged игнорируется)');

      // Контроль: моб мог сдвинуться (погоня/возврат домой) или умереть от
      // прошлых проверок — берём свежую живую цель из AOI.
      await ensureAlive(mv);
      mv.clear();
      mv.send({ t: 'editor_set_pos', x: mpos.x, z: mpos.z });
      await sleep(500);
      mv.send({ t: 'move', x: mpos.x + 0.4, z: mpos.z });
      for (let i = 0; i < 15; i++) {
        if (mv.aliveMobs().length) break;
        await sleep(100);
      }
      const alive = mv.aliveMobs();
      const target = alive[0] || (mid != null ? { mid, x: mpos.x, z: mpos.z } : null);
      if (target) {
        mv.send({ t: 'editor_set_pos', x: target.x + 1.5, z: target.z });
        await sleep(400);
        mv.clear();
        for (let i = 0; i < 12; i++) {
          mv.send({ t: 'attack', mid: target.mid });
          await sleep(220);
          if (mv.find('dmg').length) break;
        }
        await sleep(300);
        t.ok(mv.find('dmg').length > 0, 'контроль: melee вплотную бьёт',
          'пакетов dmg: ' + mv.find('dmg').length);
      } else {
        t.ok(false, 'контроль: melee вплотную бьёт', 'живых мобов в AOI не нашлось');
      }
    } else {
      t.ok(false, 'нашёлся моб для проверки дистанции', 'спотов: ' + spots.length);
    }

    // ── Услуги NPC: магазин / продажа / телепорт / баффы ────────────────────
    t.suite('server: услуги NPC');
    const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
    const TRR = require(path.join(ROOT, 'shared', 'trade-rules.js'));
    try {
      const ovr = path.join(ROOT, 'shared', 'editor-overrides.json');
      if (fs.existsSync(ovr) && WM.applyEditorOverrides) {
        WM.applyEditorOverrides(JSON.parse(fs.readFileSync(ovr, 'utf8')));
      }
      NPCS.rebuild();
    } catch (_) {}
    const vex = NPCS.getNpc('trader_vex');
    const roxy = NPCS.getNpc('dispatcher_roxy');
    const bio = NPCS.getNpc('biotin');
    const sh = mk('itest_shop');
    await sh.connect();

    sh.clear();
    sh.send({ t: 'shop_open', npcId: 'trader_vex' });
    await sleep(400);
    let fl = sh.last('shop_fail');
    t.ok(fl && fl.reason === 'range', 'магазин издалека отклонён по дистанции', fl && fl.reason);

    sh.send({ t: 'editor_set_pos', x: vex.position.x + 2, z: vex.position.z });
    await sleep(400);
    sh.clear();
    sh.send({ t: 'shop_open', npcId: 'trader_vex' });
    await sleep(400);
    const cat = sh.last('shop_open');
    t.ok(cat && cat.items.length >= 18, 'каталог пришёл с сервера (не менее 18 позиций)',
      cat ? ('позиций ' + cat.items.length) : 'нет ответа');
    const hammerEntry = cat && cat.items.find(i => i.itemId === 'operator_hammer_low');
    t.eq(hammerEntry && hammerEntry.price, 100, 'цена товара серверная');

    // денег хватит: стартовые 500 у оператора
    sh.clear();
    sh.send({ t: 'npc_buy', npcId: 'trader_vex', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    const bought = sh.last('shop_buy_ok');
    t.ok(bought && bought.total === 100 && (bought.inv.operator_hammer_low | 0) >= 1,
      'покупка списала цену и выдала предмет в серверный инвентарь',
      bought ? ('total=' + bought.total + ' curr=' + bought.currency) : JSON.stringify(sh.last('shop_fail')));

    sh.clear();
    sh.send({ t: 'npc_buy', npcId: 'trader_vex', itemId: 'buckler', count: 1 });
    await sleep(400);
    fl = sh.last('shop_fail');
    t.ok(fl && fl.reason === 'not_sold', 'товар вне каталога отклонён', fl && fl.reason);

    sh.clear();
    sh.send({ t: 'npc_sell', npcId: 'trader_vex', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    const sold = sh.last('shop_sell_ok');
    t.eq(sold && sold.total, 40, 'продажа даёт 40 % цены');
    sh.clear();
    sh.send({ t: 'npc_sell', npcId: 'trader_vex', itemId: 'copper_parts', count: 10 });
    await sleep(400);
    fl = sh.last('shop_fail');
    t.ok(fl && fl.reason === 'not_bought', 'валюту продать нельзя', fl && fl.reason);

    // Телепорт
    sh.send({ t: 'editor_set_pos', x: roxy.position.x + 2, z: roxy.position.z });
    await sleep(400);
    sh.clear();
    sh.send({ t: 'teleport_list', npcId: 'dispatcher_roxy' });
    await sleep(400);
    const tpList = sh.last('teleport_list');
    t.eq(tpList && tpList.points.length, 5, 'список точек телепорта с сервера');
    // накопить адены на телепорт
    for (let i = 0; i < 4; i++) {
      sh.clear();
      sh.send({ t: 'debug_spawn_loot', itemId: 'copper_parts', count: 99 });
      await sleep(400);
      let clid = null;
      for (const m of sh.msgs) if (m.lid != null) clid = m.lid;
      if (clid != null) { sh.send({ t: 'loot_pickup', lid: clid }); await sleep(300); }
    }
    const tp = tpList.points.find(p => p.cost === 300) || tpList.points[0];
    sh.clear();
    sh.send({ t: 'npc_teleport', npcId: 'dispatcher_roxy', point: tp.index });
    await sleep(700);
    const tpOk = sh.last('teleport_ok');
    t.ok(tpOk && Math.abs(tpOk.x - tp.x) < 0.01 && tpOk.cost === tp.cost,
      'телепорт переместил игрока и списал цену',
      tpOk ? (tp.name + ' cost=' + tpOk.cost) : JSON.stringify(sh.last('teleport_fail')));
    t.ok(sh.last('self_sync'), 'после телепорта пришёл self_sync');

    // Баффы
    sh.send({ t: 'editor_set_pos', x: bio.position.x + 2, z: bio.position.z });
    await sleep(400);
    // Точка телепорта — хант-зона: мобы могли добить игрока за время проверок.
    await ensureAlive(sh);
    sh.send({ t: 'editor_set_pos', x: bio.position.x + 2, z: bio.position.z });
    await sleep(400);
    sh.clear();
    sh.send({ t: 'npc_buff_list', npcId: 'biotin' });
    await sleep(400);
    const bl = sh.last('npc_buff_list');
    t.eq(bl && bl.buffs.length, 3, 'список баффов с сервера');
    sh.clear();
    sh.send({ t: 'npc_buff', npcId: 'biotin', buffId: 'overclock' });
    await sleep(500);
    const bOk = sh.last('npc_buff_ok');
    t.ok(bOk && bOk.cost === 300, 'бафф куплен, цена списана',
      bOk ? ('curr=' + bOk.currency) : JSON.stringify(sh.last('npc_buff_fail')));

    // ── Тренер умений (P2.2) ──
    const thorn = NPCS.getNpc('instructor_thorn');
    // 1) Издалека с npcId: range
    sh.clear();
    sh.send({ t: 'learn_skill', skillId: 'op_iron_punch', npcId: 'instructor_thorn' });
    await sleep(400);
    fl = sh.last('learn_skill_fail');
    t.ok(fl && fl.reason === 'range', 'тренер умений издалека отклонён по дистанции', fl && fl.reason);

    // 2) Издалека без npcId: range
    sh.clear();
    sh.send({ t: 'learn_skill', skillId: 'op_iron_punch' });
    await sleep(400);
    fl = sh.last('learn_skill_fail');
    t.ok(fl && fl.reason === 'range', 'обучение умения без NPC издалека отклонено по дистанции', fl && fl.reason);

    // 3) Неверный NPC (не тренер): no_service
    sh.clear();
    sh.send({ t: 'learn_skill', skillId: 'op_iron_punch', npcId: 'biotin' });
    await sleep(400);
    fl = sh.last('learn_skill_fail');
    t.ok(fl && fl.reason === 'no_service', 'попытка учить скилл у не-тренера отклонена с no_service', fl && fl.reason);

    // 4) Неизвестный NPC: unknown_npc
    sh.clear();
    sh.send({ t: 'learn_skill', skillId: 'op_iron_punch', npcId: 'ghost_npc' });
    await sleep(400);
    fl = sh.last('learn_skill_fail');
    t.ok(fl && fl.reason === 'unknown_npc', 'несуществующий тренер отклонён с unknown_npc', fl && fl.reason);

    // 5) Вплотную к Торну (<= 7 м)
    sh.send({ t: 'editor_set_pos', x: thorn.position.x + 1, z: thorn.position.z });
    await sleep(400);
    sh.clear();
    sh.send({ t: 'learn_skill', skillId: 'op_iron_punch', npcId: 'instructor_thorn' });
    await sleep(400);
    fl = sh.last('learn_skill_fail');
    const lOk = sh.last('learn_skill_ok');
    t.ok((fl && (fl.reason === 'level' || fl.reason === 'sp')) || lOk,
      'вплотную к тренеру дистанция валидирована (не range)', fl && fl.reason);

    // ── Квесты ─────────────────────────────────────────────────────────────
    t.suite('server: квесты');
    const bot = NPCS.getNpc('bot_01');
    const gil = NPCS.getNpc('gilbert');
    const qc = mk('itest_quest');
    await qc.connect();
    t.ok(qc.welcome.quests && qc.welcome.quests.available.indexOf('main_01_welcome') >= 0,
      'welcome содержит снапшот квестов с доступными');
    t.ok(qc.welcome.quests.available.indexOf('main_02_perimeter') < 0,
      'цепочка закрыта: main_02 недоступен');

    qc.clear();
    qc.send({ t: 'quest_accept', questId: 'main_01_welcome' });
    await sleep(400);
    let qf = qc.last('quest_fail');
    t.ok(qf && qf.reason === 'range', 'принятие квеста издалека отклонено', qf && qf.reason);

    qc.send({ t: 'editor_set_pos', x: bot.position.x + 2, z: bot.position.z });
    await sleep(400);
    qc.clear();
    qc.send({ t: 'quest_accept', questId: 'main_01_welcome' });
    await sleep(500);
    let qs = qc.last('quests');
    t.ok(qs && qs.accepted === 'main_01_welcome' && qs.quests.active.length === 1,
      'квест принят у NPC');

    qc.clear();
    qc.send({ t: 'quest_complete', questId: 'main_01_welcome' });
    await sleep(400);
    qf = qc.last('quest_fail');
    t.ok(qf && qf.reason === 'incomplete', 'сдача невыполненного отклонена', qf && qf.reason);

    qc.send({ t: 'editor_set_pos', x: gil.position.x + 2, z: gil.position.z });
    await sleep(400);
    qc.clear();
    qc.send({ t: 'npc_talk', npcId: 'gilbert' });
    await sleep(500);
    qs = qc.last('quests');
    const qact = qs && qs.quests.active.find(a => a.id === 'main_01_welcome');
    t.ok(qact && qact.progress[0] === 1 && qact.state === 'completable',
      'talk-цель продвинулась при разговоре с нужным NPC');

    qc.send({ t: 'editor_set_pos', x: bot.position.x + 2, z: bot.position.z });
    await sleep(400);
    qc.clear();
    qc.send({ t: 'quest_complete', questId: 'main_01_welcome' });
    await sleep(700);
    const qDone = qc.last('quest_complete_ok');
    t.ok(qDone && qDone.exp === 50 && qDone.currency === 200 && qDone.items.length === 2,
      'сдача выдала exp, адену и предметы',
      qDone ? ('exp=' + qDone.exp + ' cur=' + qDone.currency) : JSON.stringify(qc.last('quest_fail')));
    t.ok(qDone && (qDone.inv.synthetic_oil | 0) >= 5,
      'награда лежит в серверном инвентаре', 'synthetic_oil=' + (qDone && qDone.inv.synthetic_oil));
    qs = qc.last('quests');
    t.ok(qs && qs.quests.available.indexOf('main_02_perimeter') >= 0,
      'следующий квест цепочки открылся');

    // collect считается по инвентарю
    await ensureAlive(qc);
    qc.send({ t: 'editor_set_pos', x: gil.position.x + 2, z: gil.position.z });
    await sleep(400);
    qc.clear();
    qc.send({ t: 'quest_accept', questId: 'main_02_perimeter' });
    await sleep(500);
    qc.clear();
    qc.send({ t: 'debug_spawn_loot', itemId: 'coal_briquette', count: 5 });
    await sleep(600);
    let blid = null;
    for (const m of qc.msgs) if (m.lid != null) blid = m.lid;
    if (blid != null) { qc.send({ t: 'loot_pickup', lid: blid }); await sleep(600); }
    qs = qc.last('quests');
    const qa2 = qs && qs.quests.active.find(a => a.id === 'main_02_perimeter');
    t.ok(qa2 && qa2.progress[1] === 5, 'подбор предметов продвинул collect-цель',
      qa2 ? JSON.stringify(qa2.progress) : 'нет');

    // Персистентность
    qc.close();
    await sleep(1200);
    const qc2 = mk('itest_quest');
    await qc2.connect();
    const prQ = profileOnDisk('itest_quest');
    t.ok(qc2.welcome.quests.done.some(d => d.id === 'main_01_welcome') &&
      prQ && prQ.quests && prQ.quests.done && prQ.quests.done.main_01_welcome,
      'состояние квестов персистится в профиле');

    // ── Заточка ────────────────────────────────────────────────────────────
    t.suite('server: заточка (plus влияет на статы)');
    const en = mk('itest_ench');
    await en.connect();
    const atk0 = en.welcome.self.pAtk;
    // выдать усилители
    en.clear();
    en.send({ t: 'debug_spawn_loot', itemId: 'pressure_amplifier', count: 20 });
    await sleep(600);
    let alid = null;
    for (const m of en.msgs) if (m.lid != null) alid = m.lid;
    if (alid != null) { en.send({ t: 'loot_pickup', lid: alid }); await sleep(500); }
    // точим оружие до успеха (+0 → +1 всегда успешен: enchantSuccess(0) = 1)
    en.clear();
    en.send({ t: 'enchant', slot: 'weapon' });
    await sleep(600);
    const eOk = en.last('enchant_ok');
    const eCs = en.last('combat_stats');
    t.ok(eOk && eOk.plus === 1, '+0 → +1 успешен (шанс 100 %)',
      eOk ? ('plus=' + eOk.plus) : JSON.stringify(en.last('enchant_fail')));
    t.ok(eCs && eCs.pAtk > atk0, 'заточка увеличила pAtk (раньше plus ни на что не влиял)',
      atk0 + ' → ' + (eCs && eCs.pAtk));

    t.suite('server: заточка уходит с drop/destroy');
    const gh = mk('itest_plusghost', { name: 'GhostPlus' });
    await gh.connect();
    gh.clear();
    gh.send({ t: 'debug_spawn_loot', itemId: 'pressure_amplifier', count: 8 });
    await sleep(500);
    let plid = null;
    for (const m of gh.msgs) if (m.lid != null) plid = m.lid;
    if (plid != null) { gh.send({ t: 'loot_pickup', lid: plid }); await sleep(400); }
    gh.clear();
    gh.send({ t: 'enchant', slot: 'weapon' });
    await sleep(500);
    const enchOk = gh.last('enchant_ok');
    t.ok(enchOk && enchOk.plus >= 1, 'оружие заточено перед выбросом',
      enchOk ? ('plus=' + enchOk.plus) : 'нет enchant_ok');
    const plusNow = enchOk ? enchOk.plus : 1;
    gh.clear();
    gh.send({ t: 'unequip', slot: 'weapon' });
    await sleep(400);
    gh.clear();
    gh.send({ t: 'drop_item', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    const dropOk = gh.last('drop_ok');
    t.ok(dropOk && dropOk.lid != null, 'вещь выброшена на землю');
    t.eq(dropOk && (dropOk.plus | 0), plusNow, 'plus ушёл на пачку, не остался в реестре');
    t.ok(!dropOk.invPlus || !dropOk.invPlus.operator_hammer_low,
      'plusById очищен после drop последней копии',
      dropOk ? JSON.stringify(dropOk.invPlus) : 'нет drop_ok');
    const dropLid = dropOk && dropOk.lid;
    gh.clear();
    gh.send({ t: 'loot_pickup', lid: dropLid });
    await sleep(500);
    const pick = gh.last('loot_pickup_ok');
    t.ok(pick && (pick.plus | 0) === plusNow, 'подбор вернул ту же заточку',
      pick ? ('plus=' + pick.plus) : 'нет pickup');
    gh.clear();
    gh.send({ t: 'destroy_item', itemId: 'operator_hammer_low', count: 1 });
    await sleep(400);
    const dest = gh.last('destroy_ok');
    t.ok(dest, 'destroy прошёл');
    t.ok(!dest.invPlus || !dest.invPlus.operator_hammer_low,
      'plusById очищен после destroy',
      dest ? JSON.stringify(dest.invPlus) : 'нет destroy_ok');
    gh.clear();
    gh.send({ t: 'debug_spawn_loot', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    let nlid = null;
    for (const m of gh.msgs) if (m.lid != null) nlid = m.lid;
    if (nlid != null) { gh.send({ t: 'loot_pickup', lid: nlid }); await sleep(500); }
    const fresh = gh.last('loot_pickup_ok');
    t.ok(fresh && !(fresh.plus > 0) && !(fresh.invPlus && fresh.invPlus.operator_hammer_low),
      'новый NG того же id не наследует призрак +N',
      fresh ? JSON.stringify({ plus: fresh.plus, invPlus: fresh.invPlus }) : 'нет pickup');
    const prGh = profileOnDisk('itest_plusghost');
    t.ok(!prGh || !prGh.plusById || !prGh.plusById.operator_hammer_low,
      'в профиле нет призрачной заточки',
      prGh ? JSON.stringify(prGh.plusById) : 'нет профиля');

    // приборы точить нельзя
    const engEnch = mk('itest_ench_eng', { cls: 'engineer', name: 'Ench' });
    await engEnch.connect();
    engEnch.clear();
    engEnch.send({ t: 'debug_spawn_loot', itemId: 'pressure_amplifier', count: 5 });
    await sleep(600);
    let dlid = null;
    for (const m of engEnch.msgs) if (m.lid != null) dlid = m.lid;
    if (dlid != null) { engEnch.send({ t: 'loot_pickup', lid: dlid }); await sleep(500); }
    engEnch.clear();
    engEnch.send({ t: 'enchant', slot: 'necklace' });
    await sleep(500);
    const eFail = engEnch.last('enchant_fail');
    t.ok(eFail && eFail.reason === 'device', 'приборы инженера точить нельзя',
      eFail ? eFail.reason : 'нет отказа');

    t.suite('server: кристаллизация при сломе заточки');
    const ER = require(path.join(ROOT, 'shared', 'enchant-rules.js'));
    seedChar('itest_cry', { name: 'CryGuy', level: 20, cls: 'operator' });
    const cryP = mk('itest_cry', { name: 'CryGuy' });
    await cryP.connect();
    cryP.send({ t: 'debug_give', itemId: 'mace_prayer', count: 1, force: true });
    cryP.send({ t: 'debug_give', itemId: 'pressure_amplifier', count: 10, force: true });
    await sleep(400);
    cryP.send({ t: 'equip', slot: 'weapon', templateId: 'mace_prayer' });
    await sleep(400);
    t.ok(cryP.last('equip_ok'), 'D-булава надета на 20 ур.');
    for (let i = 0; i < 3; i++) {
      cryP.clear();
      cryP.send({ t: 'enchant', slot: 'weapon' });
      await sleep(350);
    }
    t.ok(cryP.last('enchant_ok') && cryP.last('enchant_ok').plus === 3, '+0…+2 безопасны, сейчас +3',
      cryP.last('enchant_ok') ? ('plus=' + cryP.last('enchant_ok').plus) : JSON.stringify(cryP.last('enchant_fail')));
    cryP.clear();
    cryP.send({ t: 'enchant', slot: 'weapon', force: 'break' });
    await sleep(400);
    const brk = cryP.last('enchant_break');
    t.ok(brk, 'слом выше safe пришёл enchant_break');
    t.ok(brk && brk.crystals && brk.crystals.id === 'crystal_d' && brk.crystals.count >= 80,
      'вместо пустоты — кристаллы D',
      brk && brk.crystals ? JSON.stringify(brk.crystals) : JSON.stringify(brk));
    t.ok(brk && brk.inv && (brk.inv.crystal_d | 0) >= 80, 'кристаллы в сумке');
    t.ok(brk && !(brk.equip && brk.equip.weapon), 'оружие снято со слота');
    const expectCry = ER.crystalize(
      Object.assign({}, require(path.join(ROOT, 'shared', 'item-db.js')).get('mace_prayer'),
        require(path.join(ROOT, 'shared', 'loot-rules.js')).LOOT_ITEMS.mace_prayer),
      3
    );
    t.eq(brk && brk.crystals && brk.crystals.count, expectCry && expectCry.count,
      'число кристаллов совпадает с enchant-rules');

    // ── Персональный склад ─────────────────────────────────────────────────
    t.suite('server: персональный склад');
    const whNpc = NPCS.getNpc('warehouse_w7');
    const wh = mk('itest_wh');
    await wh.connect();

    wh.clear();
    wh.send({ t: 'wh_open', npcId: 'warehouse_w7' });
    await sleep(400);
    let wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'range', 'склад издалека отклонён по дистанции', wf && wf.reason);

    wh.clear();
    wh.send({ t: 'wh_open', npcId: 'trader_vex' });
    await sleep(300);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'no_service', 'у торговца склада нет', wf && wf.reason);

    wh.send({ t: 'editor_set_pos', x: whNpc.position.x + 2, z: whNpc.position.z });
    await sleep(400);
    await ensureAlive(wh);
    wh.send({ t: 'editor_set_pos', x: whNpc.position.x + 2, z: whNpc.position.z });
    await sleep(300);
    wh.clear();
    wh.send({ t: 'wh_open', npcId: 'warehouse_w7' });
    await sleep(400);
    const whOpened = wh.last('wh_open');
    t.ok(whOpened && whOpened.cap === NPCS.MAX_WH_SLOTS && whOpened.fee === NPCS.WH_FEE_PER_STACK,
      'склад открылся: ёмкость и плата серверные',
      whOpened ? ('cap=' + whOpened.cap + ' fee=' + whOpened.fee) : JSON.stringify(wh.last('wh_fail')));
    t.eq(whOpened && Object.keys(whOpened.wh).length, 0, 'новый склад пуст');

    /** Выдать себе предмет dev-дропом и подобрать. */
    const grab = async (itemId, count) => {
      wh.clear();
      wh.send({ t: 'debug_spawn_loot', itemId, count });
      await sleep(600);
      let lid = null;
      for (const m of wh.msgs) if (m.lid != null) lid = m.lid;
      if (lid == null) return false;
      wh.send({ t: 'loot_pickup', lid });
      await sleep(500);
      return !!wh.last('loot_pickup_ok');
    };
    t.ok(await grab('synthetic_oil', 5), 'dev-дроп масла подобран');
    wh.clear();
    wh.send({ t: 'wh_open', npcId: 'warehouse_w7' });
    await sleep(400);
    const st0 = wh.last('wh_open');
    const oil0 = st0 ? (st0.inv.synthetic_oil | 0) : 0;
    const cur0 = st0 ? (st0.currency | 0) : 0;
    t.ok(oil0 >= 5, 'масло в серверной сумке', 'единиц: ' + oil0);

    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 3 });
    await sleep(500);
    const whPut = wh.last('wh_ok');
    t.ok(whPut && whPut.op === 'put' && (whPut.wh.synthetic_oil | 0) === 3 &&
      (whPut.inv.synthetic_oil | 0) === oil0 - 3,
      'вклад перенёс вещь из сумки на склад',
      whPut ? ('склад ' + whPut.wh.synthetic_oil + ', сумка ' + whPut.inv.synthetic_oil)
        : JSON.stringify(wh.last('wh_fail')));
    t.eq(whPut && whPut.fee, NPCS.WH_FEE_PER_STACK, 'плата за вклад = цена стака');
    t.eq(whPut && whPut.currency, cur0 - NPCS.WH_FEE_PER_STACK, 'плата списана с кошелька (money sink)');
    t.eq(whPut && ((whPut.inv.synthetic_oil | 0) + (whPut.wh.synthetic_oil | 0)), oil0,
      'сумка + склад = столько же единиц (одна единица не может лежать в двух местах)');
    t.eq(whPut && whPut.slots, 1, 'занятость склада пересчитана');

    wh.clear();
    wh.send({ t: 'wh_take', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 2 });
    await sleep(500);
    const whTake = wh.last('wh_ok');
    t.ok(whTake && whTake.op === 'take' && (whTake.wh.synthetic_oil | 0) === 1 &&
      (whTake.inv.synthetic_oil | 0) === oil0 - 1,
      'выдача вернула вещь в сумку',
      whTake ? ('склад ' + whTake.wh.synthetic_oil + ', сумка ' + whTake.inv.synthetic_oil)
        : JSON.stringify(wh.last('wh_fail')));
    t.eq(whTake && whTake.currency, cur0 - NPCS.WH_FEE_PER_STACK, 'за выдачу плата не берётся');

    // Пачка вкладов без ожидания ответа: перенос идёт в одном тике, суммарное
    // количество меняться не должно ни при какой очерёдности.
    wh.clear();
    for (let i = 0; i < 5; i++) wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 1 });
    await sleep(800);
    const burst = wh.last('wh_ok');
    t.eq(burst && ((burst.inv.synthetic_oil | 0) + (burst.wh.synthetic_oil | 0)), oil0,
      '5 вкладов подряд не изменили суммарное количество (нет дюпа)',
      burst ? ('сумка ' + (burst.inv.synthetic_oil | 0) + ' + склад ' + (burst.wh.synthetic_oil | 0)) : 'нет ответа');

    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'copper_parts', count: 10 });
    await sleep(300);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'currency', '⚙️ на складе не хранят', wf && wf.reason);

    t.ok(await grab('audio_log_01', 1), 'dev-дроп квестового предмета подобран');
    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'audio_log_01', count: 1 });
    await sleep(300);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'quest_item', 'квестовый предмет склад не принимает', wf && wf.reason);

    wh.clear();
    wh.send({ t: 'wh_take', npcId: 'warehouse_w7', itemId: 'steam_hammer', count: 1 });
    await sleep(300);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'none', 'нельзя забрать то, чего на складе нет', wf && wf.reason);

    // Заточка едет вместе с вещью: иначе +N «телепортируется» на другую копию
    // того же templateId.
    t.ok(await grab('pressure_amplifier', 5), 'dev-дроп усилителей подобран');
    wh.clear();
    wh.send({ t: 'enchant', slot: 'weapon' });
    await sleep(600);
    const whEnch = wh.last('enchant_ok');
    wh.send({ t: 'unequip', slot: 'weapon' });
    await sleep(500);
    const whUn = wh.last('unequip_ok');
    t.ok(whEnch && whEnch.plus === 1 && whUn && (whUn.inv.operator_hammer_low | 0) >= 1,
      'заточенный молот снят в сумку',
      whEnch ? ('+' + whEnch.plus) : JSON.stringify(wh.last('enchant_fail')));
    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    const putEnch = wh.last('wh_ok');
    t.eq(putEnch && putEnch.whPlus && putEnch.whPlus.operator_hammer_low, 1,
      'заточка уехала на склад вместе с вещью');
    const prWh = profileOnDisk('itest_wh');
    t.ok(prWh && prWh.wh && prWh.wh.operator_hammer_low === 1 &&
      prWh.whPlusById && prWh.whPlusById.operator_hammer_low === 1,
      'склад и его реестр заточки записаны в профиль',
      prWh ? JSON.stringify({ wh: prWh.wh, whPlusById: prWh.whPlusById }) : 'нет профиля');
    t.ok(prWh && !(prWh.plusById && prWh.plusById.operator_hammer_low),
      'в реестре сумки заточки больше нет (не размножилась)');

    wh.clear();
    wh.send({ t: 'wh_take', npcId: 'warehouse_w7', itemId: 'operator_hammer_low', count: 1 });
    await sleep(500);
    const takeEnch = wh.last('wh_ok');
    t.ok(takeEnch && !(takeEnch.whPlus && takeEnch.whPlus.operator_hammer_low),
      'после выдачи на складе заточки не осталось');
    const prWh2 = await waitForProfile('itest_wh', p => p && p.plusById && p.plusById.operator_hammer_low === 1);
    t.ok(prWh2 && prWh2.plusById && prWh2.plusById.operator_hammer_low === 1,
      'заточка вернулась в реестр сумки',
      prWh2 ? JSON.stringify(prWh2.plusById) : 'нет профиля');

    // Вторая копия того же предмета: реестр заточки один на templateId, поэтому
    // частичный перенос запрещён — иначе +1 достался бы обеим копиям.
    t.ok(await grab('operator_hammer_low', 1), 'вторая копия молота подобрана');
    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'operator_hammer_low', count: 1 });
    await sleep(400);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'enchanted',
      'нельзя положить одну из двух копий, когда вещь заточена', wf && wf.reason);

    // Надетый слот делит plusById с сумкой, но в inv его нет. Без этой проверки
    // вклад запасной копии уносил +N на склад, а экип оставался заточенным.
    wh.clear();
    wh.send({ t: 'equip', slot: 'weapon', templateId: 'operator_hammer_low' });
    await sleep(500);
    const eqWh = wh.last('equip_ok');
    t.ok(eqWh && eqWh.equip && eqWh.equip.weapon,
      'одна копия молота надета, вторая осталась в сумке',
      eqWh ? JSON.stringify(eqWh.equip && eqWh.equip.weapon) : JSON.stringify(wh.last('equip_fail')));
    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'operator_hammer_low', count: 1 });
    await sleep(400);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'enchanted',
      'нельзя положить копию, пока такая же заточенная надета', wf && wf.reason);
    const prEq = profileOnDisk('itest_wh');
    t.ok(prEq && prEq.plusById && prEq.plusById.operator_hammer_low === 1 &&
      !(prEq.whPlusById && prEq.whPlusById.operator_hammer_low) &&
      !(prEq.wh && prEq.wh.operator_hammer_low),
      'заточка осталась на персонаже, на склад не уехала',
      prEq ? JSON.stringify({ plus: prEq.plusById, wh: prEq.wh, whPlus: prEq.whPlusById }) : 'нет профиля');
    wh.send({ t: 'unequip', slot: 'weapon' });
    await sleep(400);

    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'нет_такого', count: 1 });
    await sleep(300);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'unknown_item', 'неизвестный предмет склад не принимает', wf && wf.reason);

    wh.clear();
    wh.send({ t: 'wh_open', npcId: 'warehouse_w7' });
    await sleep(400);
    const curNow = (wh.last('wh_open') && wh.last('wh_open').currency) | 0;
    const ampHave = (wh.last('wh_open') && wh.last('wh_open').inv &&
      (wh.last('wh_open').inv.pressure_amplifier | 0)) || 0;
    t.ok(ampHave >= 1, 'для проверки платы в сумке есть усилитель', 'единиц: ' + ampHave);
    if (curNow > 0) {
      wh.send({ t: 'drop_item', itemId: 'copper_parts', count: curNow });
      await sleep(400);
    }
    wh.clear();
    wh.send({ t: 'wh_put', npcId: 'warehouse_w7', itemId: 'pressure_amplifier', count: 1 });
    await sleep(400);
    wf = wh.last('wh_fail');
    t.ok(wf && wf.reason === 'funds', 'без ⚙️ вклад не проходит', wf && wf.reason);
    t.ok(await grab('copper_parts', 100), 'валюта возвращена после проверки платы');

    // Переподключение: склад — часть профиля, а не сессии
    const whLeft = (takeEnch && takeEnch.wh) ? Object.assign({}, takeEnch.wh) : null;
    wh.close();
    await sleep(600);
    const wh2 = mk('itest_wh');
    await wh2.connect();
    wh2.send({ t: 'editor_set_pos', x: whNpc.position.x + 2, z: whNpc.position.z });
    await sleep(400);
    wh2.clear();
    wh2.send({ t: 'wh_open', npcId: 'warehouse_w7' });
    await sleep(500);
    const reopened = wh2.last('wh_open');
    t.ok(reopened && whLeft && JSON.stringify(reopened.wh) === JSON.stringify(whLeft),
      'после переподключения на складе то же самое',
      reopened ? (JSON.stringify(reopened.wh) + ' vs ' + JSON.stringify(whLeft)) : 'нет ответа');

    // ── Обмен игрок ↔ игрок ────────────────────────────────────────────────
    t.suite('server: обмен игрок ↔ игрок');
    /** Выдать клиенту предмет dev-дропом и подобрать. */
    const grabFor = async (c, itemId, count) => {
      c.clear();
      c.send({ t: 'debug_spawn_loot', itemId, count });
      await sleep(600);
      let lid = null;
      for (const m of c.msgs) if (m.lid != null) lid = m.lid;
      if (lid == null) return false;
      c.send({ t: 'loot_pickup', lid });
      await sleep(500);
      return !!c.last('loot_pickup_ok');
    };
    const ta = mk('itest_trade_a');
    const tb = mk('itest_trade_b');
    await ta.connect();
    await tb.connect();
    const spot = { x: whNpc.position.x + 8, z: whNpc.position.z + 8 };
    ta.send({ t: 'editor_set_pos', x: spot.x, z: spot.z });
    tb.send({ t: 'editor_set_pos', x: spot.x + 2, z: spot.z });
    await sleep(500);
    t.ok(await grabFor(ta, 'synthetic_oil', 10), 'A получил масло');
    t.ok(await grabFor(tb, 'coal_briquette', 10), 'B получил брикеты');

    // Приглашение и открытие окна
    ta.clear(); tb.clear();
    ta.send({ t: 'trade_offer', pid: tb.welcome.pid });
    await sleep(400);
    const inv1 = tb.last('trade_invite');
    t.ok(inv1 && inv1.from === ta.welcome.pid, 'предложение обмена доставлено партнёру',
      inv1 ? inv1.fromName : JSON.stringify(ta.last('trade_fail')));
    tb.send({ t: 'trade_accept', pid: ta.welcome.pid });
    await sleep(400);
    const openA = ta.last('trade_open');
    const openB = tb.last('trade_open');
    t.ok(openA && openB && openA.peer === tb.welcome.pid && openB.peer === ta.welcome.pid,
      'окно обмена открылось у обоих', openA ? 'ok' : JSON.stringify(tb.last('trade_fail')));
    t.eq(openA && openA.maxSlots, TRR.MAX_TRADE_SLOTS, 'лимит позиций в окне серверный');

    // Наполнение предложений
    ta.clear(); tb.clear();
    ta.send({ t: 'trade_add', itemId: 'synthetic_oil', count: 3 });
    await sleep(300);
    let updB = tb.last('trade_update');
    t.eq(updB && (updB.theirs.offer.synthetic_oil | 0), 3, 'партнёр видит добавленный предмет');
    tb.send({ t: 'trade_add', itemId: 'coal_briquette', count: 5 });
    await sleep(300);
    let updA = ta.last('trade_update');
    t.eq(updA && (updA.theirs.offer.coal_briquette | 0), 5, 'обе стороны видят обе половины');

    // Квестовые предметы и чужие вещи
    t.ok(await grabFor(ta, 'audio_log_01', 1), 'A получил квестовый предмет');
    ta.clear();
    ta.send({ t: 'trade_add', itemId: 'audio_log_01', count: 1 });
    await sleep(300);
    let tf = ta.last('trade_fail');
    t.ok(tf && tf.reason === 'quest_item', 'квестовый предмет в обмен не кладётся', tf && tf.reason);
    ta.clear();
    ta.send({ t: 'trade_add', itemId: 'steam_hammer', count: 1 });
    await sleep(300);
    tf = ta.last('trade_fail');
    t.ok(tf && tf.reason === 'none', 'нельзя предложить то, чего нет в сумке', tf && tf.reason);

    // Подтверждение до готовности и сброс готовности при изменении
    ta.clear();
    ta.send({ t: 'trade_confirm' });
    await sleep(300);
    tf = ta.last('trade_fail');
    t.ok(tf && tf.reason === 'not_locked', 'подтвердить до «Готово» нельзя', tf && tf.reason);
    ta.send({ t: 'trade_lock' });
    tb.send({ t: 'trade_lock' });
    await sleep(400);
    ta.clear(); tb.clear();
    ta.send({ t: 'trade_add', itemId: 'synthetic_oil', count: 1 });
    await sleep(400);
    updA = ta.last('trade_update');
    updB = tb.last('trade_update');
    t.ok(updA && updB && updA.mine.locked === false && updB.mine.locked === false,
      'изменение предложения сбрасывает готовность ОБЕИХ сторон',
      updA ? ('A locked=' + updA.mine.locked + ' B locked=' + updB.mine.locked) : 'нет обновления');

    // Обмен целиком: суммарное количество в системе меняться не должно
    const invBefore = {
      a: Object.assign({}, updA.inv),
      b: Object.assign({}, updB.inv)
    };
    const total = (a, b, id) => ((a[id] | 0) + (b[id] | 0));
    ta.clear(); tb.clear();
    ta.send({ t: 'trade_lock' });
    tb.send({ t: 'trade_lock' });
    await sleep(400);
    ta.send({ t: 'trade_confirm' });
    await sleep(250);
    tb.send({ t: 'trade_confirm' });
    await sleep(600);
    const doneA = ta.last('trade_done');
    const doneB = tb.last('trade_done');
    t.ok(doneA && doneB, 'обмен завершён у обоих',
      doneA ? 'ok' : JSON.stringify(ta.last('trade_fail') || ta.last('trade_close')));
    if (doneA && doneB) {
      // Сравниваем ПРИРОСТ: у стартового оператора масло в сумке уже есть.
      t.eq((doneA.inv.coal_briquette | 0) - (invBefore.a.coal_briquette | 0), 5,
        'A получил брикеты партнёра');
      t.eq((doneB.inv.synthetic_oil | 0) - (invBefore.b.synthetic_oil | 0), 4,
        'B получил масло партнёра (3 + 1 добавленный)');
      t.eq((invBefore.a.synthetic_oil | 0) - (doneA.inv.synthetic_oil | 0), 4,
        'у A ровно столько же убыло');
      t.eq(total(doneA.inv, doneB.inv, 'synthetic_oil'),
        total(invBefore.a, invBefore.b, 'synthetic_oil'),
        'масла в системе столько же (нет дюпа)');
      t.eq(total(doneA.inv, doneB.inv, 'coal_briquette'),
        total(invBefore.a, invBefore.b, 'coal_briquette'),
        'брикетов в системе столько же');
      t.eq((doneA.inv.audio_log_01 | 0), 1, 'квестовый предмет остался у владельца');
    }
    // Повторное подтверждение по закрытой сессии ничего не переносит
    ta.clear();
    ta.send({ t: 'trade_confirm' });
    ta.send({ t: 'trade_confirm' });
    await sleep(400);
    tf = ta.last('trade_fail');
    t.ok(tf && tf.reason === 'no_trade', 'после завершения сессии подтверждать нечего', tf && tf.reason);

    // 20 обменов подряд: сумма в системе не меняется ни разу
    const cycleTotals = [];
    for (let i = 0; i < 20; i++) {
      ta.clear(); tb.clear();
      ta.send({ t: 'trade_offer', pid: tb.welcome.pid });
      await sleep(90);
      tb.send({ t: 'trade_accept', pid: ta.welcome.pid });
      await sleep(90);
      ta.send({ t: 'trade_add', itemId: 'synthetic_oil', count: 1 });
      tb.send({ t: 'trade_add', itemId: 'coal_briquette', count: 1 });
      await sleep(120);
      ta.send({ t: 'trade_lock' });
      tb.send({ t: 'trade_lock' });
      await sleep(120);
      ta.send({ t: 'trade_confirm' });
      tb.send({ t: 'trade_confirm' });
      await sleep(200);
      const dA = ta.last('trade_done');
      const dB = tb.last('trade_done');
      if (dA && dB) {
        cycleTotals.push(total(dA.inv, dB.inv, 'synthetic_oil') + ':' + total(dA.inv, dB.inv, 'coal_briquette'));
      } else {
        cycleTotals.push('fail:' + JSON.stringify(ta.last('trade_fail') || ta.last('trade_close') || {}));
      }
    }
    const uniqTotals = [...new Set(cycleTotals)];
    t.eq(uniqTotals.length, 1, '20 обменов подряд не изменили суммарное количество',
      uniqTotals.slice(0, 3).join(' | '));
    t.eq(uniqTotals[0],
      total(invBefore.a, invBefore.b, 'synthetic_oil') + ':' + total(invBefore.a, invBefore.b, 'coal_briquette'),
      'сумма та же, что до всех обменов');

    // Дистанция и занятость
    ta.send({ t: 'editor_set_pos', x: spot.x + 200, z: spot.z });
    await sleep(400);
    ta.clear();
    ta.send({ t: 'trade_offer', pid: tb.welcome.pid });
    await sleep(300);
    tf = ta.last('trade_fail');
    t.ok(tf && tf.reason === 'range', 'обмен через полкарты отклонён по дистанции', tf && tf.reason);
    ta.send({ t: 'editor_set_pos', x: spot.x, z: spot.z });
    await sleep(400);
    ta.clear(); tb.clear();
    ta.send({ t: 'trade_offer', pid: tb.welcome.pid });
    await sleep(200);
    tb.send({ t: 'trade_accept', pid: ta.welcome.pid });
    await sleep(300);
    const busy = mk('itest_trade_c');
    await busy.connect();
    busy.send({ t: 'editor_set_pos', x: spot.x + 3, z: spot.z });
    await sleep(400);
    busy.clear();
    busy.send({ t: 'trade_offer', pid: tb.welcome.pid });
    await sleep(300);
    tf = busy.last('trade_fail');
    t.ok(tf && tf.reason === 'busy', 'к занятому обменом не влезть', tf && tf.reason);
    // Разрыв соединения закрывает сессию у партнёра
    tb.close();
    await sleep(600);
    t.ok(ta.last('trade_close'), 'выход партнёра закрыл окно обмена',
      ta.last('trade_close') ? ta.last('trade_close').reason : 'нет пакета');
    ta.clear();
    ta.send({ t: 'trade_offer', pid: busy.welcome.pid });
    await sleep(300);
    t.ok(!ta.last('trade_fail'), 'после разрыва игрок снова может предлагать обмен',
      JSON.stringify(ta.last('trade_fail') || {}));

    // ── Каналы чата ────────────────────────────────────────────────────────
    // Регресс: сервер знал ОДИН тип чата (всё в broadcastAOI), а в UI было шесть
    // вкладок — «Группа» и «Личное» не работали вовсе.
    t.suite('server: каналы чата');
    const chA = mk('itest_chat_a', { name: 'ChatA' });
    const chB = mk('itest_chat_b', { name: 'ChatB' });
    const chFar = mk('itest_chat_far', { name: 'ChatFar' });
    await chA.connect();
    await chB.connect();
    await chFar.connect();
    const chSpot = { x: whNpc.position.x + 10, z: whNpc.position.z + 10 };
    const regionOf = (x, z) => ((WM.regionAt && WM.regionAt(x, z)) || {}).id || 'village';
    const homeRegion = regionOf(chSpot.x, chSpot.z);
    let farPt = null;
    for (const cand of [[600, 600], [-600, 600], [600, -600], [-900, -900], [1200, 200], [0, 900]]) {
      if (regionOf(cand[0], cand[1]) !== homeRegion) { farPt = { x: cand[0], z: cand[1] }; break; }
    }
    chA.send({ t: 'editor_set_pos', x: chSpot.x, z: chSpot.z });
    chB.send({ t: 'editor_set_pos', x: chSpot.x + 2, z: chSpot.z });
    if (farPt) chFar.send({ t: 'editor_set_pos', x: farPt.x, z: farPt.z });
    await sleep(600);
    t.ok(!!farPt, 'найдена точка в другом регионе для проверки крика',
      farPt ? (homeRegion + ' → ' + regionOf(farPt.x, farPt.z)) : 'все кандидаты в одном регионе');

    // all: слышно соседа в AOI, не слышно на другом конце карты
    chA.clear(); chB.clear(); chFar.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'all', text: 'privet-all' });
    await sleep(500);
    const gotAll = chB.find('chat').filter(m => String(m.text) === 'privet-all');
    t.eq(gotAll.length, 1, 'общий чат слышит сосед в AOI');
    t.eq(gotAll[0] && gotAll[0].ch, 'all', 'в пакете есть канал');
    t.eq(chFar.find('chat').filter(m => String(m.text) === 'privet-all').length, 0,
      'общий чат не слышно через полкарты');

    // shout: весь регион, но не соседний
    chA.clear(); chB.clear(); chFar.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'shout', text: 'krik-region' });
    await sleep(500);
    const gotShout = chB.find('chat').filter(m => String(m.text) === 'krik-region');
    t.eq(gotShout.length, 1, 'крик слышит весь регион');
    t.eq(gotShout[0] && gotShout[0].ch, 'shout', 'канал крика в пакете');
    if (farPt) {
      t.eq(chFar.find('chat').filter(m => String(m.text) === 'krik-region').length, 0,
        'крик не уходит в другой регион');
    }

    // party: только группа
    chA.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'party', text: 'gruppa-net' });
    await sleep(400);
    let chFail = chA.last('chat_fail');
    t.ok(chFail && chFail.reason === 'no_party', 'без группы канал группы отказывает', chFail && chFail.reason);
    chA.send({ t: 'party_invite', pid: chB.welcome.pid });
    await sleep(400);
    chB.send({ t: 'party_accept', pid: chA.welcome.pid });
    await sleep(500);
    chA.clear(); chB.clear(); chFar.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'party', text: 'gruppa-est' });
    await sleep(500);
    const gotParty = chB.find('chat').filter(m => String(m.text) === 'gruppa-est');
    t.eq(gotParty.length, 1, 'сопартиец получил сообщение группы');
    t.eq(gotParty[0] && gotParty[0].ch, 'party', 'канал группы в пакете');
    t.eq(chFar.find('chat').filter(m => String(m.text) === 'gruppa-est').length, 0,
      'чужой группы не слышит');

    // tell: адресно по имени, с эхом отправителю
    chA.clear(); chB.clear(); chFar.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'tell', to: 'ChatFar', text: 'lichnoe' });
    await sleep(500);
    const gotTell = chFar.find('chat').filter(m => String(m.text) === 'lichnoe');
    t.eq(gotTell.length, 1, 'личное дошло адресату через всю карту');
    t.eq(gotTell[0] && gotTell[0].ch, 'tell', 'канал личного в пакете');
    const echo = chA.find('chat').filter(m => String(m.text) === 'lichnoe' && m.out);
    t.eq(echo.length, 1, 'отправитель видит эхо своего личного');
    t.eq(chB.find('chat').filter(m => String(m.text) === 'lichnoe').length, 0,
      'личное не слышит сосед рядом');
    // Регистр имени не важен, но несуществующий адресат — внятный отказ
    chA.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'tell', to: 'chatfar', text: 'lichnoe-lower' });
    await sleep(400);
    t.eq(chFar.find('chat').filter(m => String(m.text) === 'lichnoe-lower').length, 1,
      'имя адресата не зависит от регистра');
    chA.clear();
    // Пауза: rate-limit чата 2/с, иначе следующий пакет просто не дойдёт.
    await sleep(700);
    chA.send({ t: 'chat', ch: 'tell', to: 'NetNikogo', text: 'v-pustotu' });
    await sleep(400);
    chFail = chA.last('chat_fail');
    t.ok(chFail && chFail.reason === 'offline', 'личное недоступному игроку — внятный отказ',
      chFail && chFail.reason);
    chA.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'tell', to: 'ChatA', text: 'sam-sebe' });
    await sleep(400);
    chFail = chA.last('chat_fail');
    t.ok(chFail && chFail.reason === 'self', 'самому себе писать нельзя', chFail && chFail.reason);

    // Лимит длины и rate-limit сохранены
    chA.clear(); chB.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'all', text: 'x'.repeat(300) });
    await sleep(400);
    const longMsg = chB.find('chat').find(m => String(m.text).startsWith('xxx'));
    t.ok(longMsg && longMsg.text.length === 120, 'текст режется до 120 символов',
      longMsg ? ('длина ' + longMsg.text.length) : 'нет сообщения');
    chA.clear(); chB.clear();
    for (let i = 0; i < 6; i++) chA.send({ t: 'chat', ch: 'all', text: 'flood' + i });
    await sleep(600);
    const flood = chB.find('chat').filter(m => String(m.text).startsWith('flood'));
    t.ok(flood.length > 0 && flood.length <= 3, 'rate-limit чата 2/с на месте',
      'дошло ' + flood.length + ' из 6');
    // Неизвестный канал не теряется, а уходит в общий (старые клиенты)
    chA.clear(); chB.clear();
    await sleep(700);
    chA.send({ t: 'chat', ch: 'alliance', text: 'neizvestnyj-kanal' });
    await sleep(500);
    t.eq(chB.find('chat').filter(m => String(m.text) === 'neizvestnyj-kanal').length, 1,
      'неизвестный канал деградирует в общий, а не пропадает');

    // ── Друзья ─────────────────────────────────────────────────────────────
    // Регресс: grep friends по серверу давал ноль — списка друзей не было вовсе,
    // при этом /tell из 2.3 бесполезен, если не видно, кто в сети.
    t.suite('server: список друзей');
    chA.clear(); chB.clear();
    chA.send({ t: 'friend_list' });
    await sleep(300);
    const fl0 = chA.last('friends');
    t.ok(fl0 && Array.isArray(fl0.friends) && fl0.friends.length === 0,
      'новый профиль без друзей', fl0 ? ('друзей ' + fl0.friends.length) : 'нет пакета');
    // Добавление только по согласию
    chA.send({ t: 'friend_add', name: 'ChatB' });
    await sleep(400);
    t.ok(chB.last('friend_request'), 'запрос дружбы доставлен');
    t.eq(chA.last('friends') && chA.last('friends').friends.length, 0,
      'до подтверждения друзей не появилось');
    chB.send({ t: 'friend_accept', pid: chA.welcome.pid });
    await sleep(500);
    const flA = chA.last('friends');
    const flB = chB.last('friends');
    t.ok(flA && flA.friends.length === 1 && flA.friends[0].name === 'ChatB' && flA.friends[0].online,
      'друг появился у инициатора и он в сети',
      flA ? JSON.stringify(flA.friends) : 'нет пакета');
    t.ok(flB && flB.friends.length === 1 && flB.friends[0].name === 'ChatA',
      'дружба взаимная', flB ? JSON.stringify(flB.friends) : 'нет пакета');
    const prFriendA = await waitForProfile('itest_chat_a', (p) => Array.isArray(p.friends) && p.friends.length > 0);
    t.ok(prFriendA && Array.isArray(prFriendA.friends) && prFriendA.friends[0] &&
      prFriendA.friends[0].yid === 'itest_chat_b',
      'список друзей в профиле хранится по yid, а не по имени',
      prFriendA ? JSON.stringify(prFriendA.friends) : 'нет профиля');
    // Повторное добавление и себя
    chA.clear();
    chA.send({ t: 'friend_add', name: 'ChatB' });
    await sleep(300);
    let ff = chA.last('friend_fail');
    t.ok(ff && ff.reason === 'already', 'повторное добавление отклонено', ff && ff.reason);
    chA.clear();
    chA.send({ t: 'friend_add', name: 'ChatA' });
    await sleep(300);
    ff = chA.last('friend_fail');
    t.ok(ff && ff.reason === 'self', 'себя в друзья не добавить', ff && ff.reason);
    chA.clear();
    chA.send({ t: 'friend_add', name: 'NetTakogo' });
    await sleep(300);
    ff = chA.last('friend_fail');
    t.ok(ff && ff.reason === 'offline', 'оффлайнового в друзья не позвать', ff && ff.reason);
    // Статус при выходе и входе
    chB.clear(); chA.clear();
    chFar.close();
    await sleep(400);
    chB.close();
    await sleep(700);
    const st = chA.find('friend_status').filter(s => s.online === false);
    t.ok(st.length >= 1, 'о выходе друга сообщают', 'пакетов: ' + st.length);
    const chB2 = mk('itest_chat_b', { name: 'ChatB' });
    await chB2.connect();
    await sleep(600);
    const stOn = chA.find('friend_status').filter(s => s.online === true);
    t.ok(stOn.length >= 1, 'о входе друга сообщают', 'пакетов: ' + stOn.length);
    const flB2 = chB2.last('friends');
    t.ok(flB2 && flB2.friends.length === 1 && flB2.friends[0].name === 'ChatA',
      'после переподключения список друзей на месте',
      flB2 ? JSON.stringify(flB2.friends) : 'нет пакета');
    // Удаление взаимное
    chA.clear(); chB2.clear();
    chA.send({ t: 'friend_remove', name: 'ChatB' });
    await sleep(500);
    t.eq(chA.last('friends') && chA.last('friends').friends.length, 0, 'друг удалён у инициатора');
    t.eq(chB2.last('friends') && chB2.last('friends').friends.length, 0,
      'и у второй стороны (пока он в сети)');
    chA.clear();
    chA.send({ t: 'friend_remove', name: 'ChatB' });
    await sleep(300);
    ff = chA.last('friend_fail');
    t.ok(ff && ff.reason === 'not_friend', 'удаление того, кого нет в списке, отклонено',
      ff && ff.reason);

    // ── Клан ────────────────────────────────────────────────────────────────
    t.suite('server: клан');
    const CL = require(path.join(ROOT, 'shared', 'clan-rules.js'));
    seedChar('itest_clan_a', { name: 'ClanA', level: 10 });
    seedChar('itest_clan_b', { name: 'ClanB', level: 10 });
    seedChar('itest_clan_low', { name: 'LowLvl', level: 1, inv: { copper_parts: 30000 } });
    const clA = mk('itest_clan_a', { name: 'ClanA' });
    const clB = mk('itest_clan_b', { name: 'ClanB' });
    const clLow = mk('itest_clan_low', { name: 'LowLvl' });
    await clA.connect();
    await clB.connect();
    await clLow.connect();

    clLow.clear();
    clLow.send({ t: 'clan_create', name: 'TooYoung' });
    await sleep(400);
    t.ok(clLow.last('clan_fail') && clLow.last('clan_fail').reason === 'level',
      'создание раньше 10 уровня отклонено', clLow.last('clan_fail') && clLow.last('clan_fail').reason);

    clA.clear();
    clA.send({ t: 'clan_create', name: '<>' });
    await sleep(300);
    t.ok(clA.last('clan_fail') && clA.last('clan_fail').reason === 'name',
      'мусорное имя клана отбито', clA.last('clan_fail') && clA.last('clan_fail').reason);

    clA.clear();
    clA.send({ t: 'clan_create', name: 'Iron Coil' });
    await sleep(500);
    const created = clA.last('clan');
    t.ok(created && created.clan && created.clan.name === 'Iron Coil' && created.clan.level === 0,
      'клан создан, уровень 0', created && created.clan && created.clan.name);
    t.eq(created && created.clan && created.clan.members && created.clan.members.length, 1,
      'создатель — единственный член');
    const prClanA = await waitForProfile('itest_clan_a', (p) => p && p.inv && (p.inv.copper_parts | 0) === 30000 - CL.CREATE_COST);
    t.ok(prClanA && (prClanA.inv.copper_parts | 0) === 30000 - CL.CREATE_COST,
      'плата за создание списана', prClanA && prClanA.inv && prClanA.inv.copper_parts);

    clB.clear();
    clB.send({ t: 'clan_create', name: 'Iron Coil' });
    await sleep(300);
    t.ok(clB.last('clan_fail') && clB.last('clan_fail').reason === 'taken',
      'имя клана уникально', clB.last('clan_fail') && clB.last('clan_fail').reason);

    clA.clear(); clB.clear();
    clA.send({ t: 'clan_invite', name: 'ClanB' });
    await sleep(400);
    const invC = clB.last('clan_invite');
    t.ok(invC && invC.clanName === 'Iron Coil', 'приглашение доставлено', invC && invC.clanName);
    clB.send({ t: 'clan_accept', pid: clA.welcome.pid });
    await sleep(500);
    const joined = clB.last('clan');
    t.ok(joined && joined.clan && joined.clan.members && joined.clan.members.length === 2,
      'после согласия в клане двое',
      joined && joined.clan && joined.clan.members && joined.clan.members.length);
    t.ok(clA.last('clan') && clA.last('clan').clan.members.length === 2, 'лидер видит второго члена');

    clA.clear(); clB.clear(); clLow.clear();
    clA.send({ t: 'chat', ch: 'clan', text: 'privet-klan' });
    await sleep(400);
    t.ok(clB.find('chat').some((m) => m.ch === 'clan' && m.text === 'privet-klan'),
      'клан-чат слышит соклановец');
    t.ok(!clLow.find('chat').some((m) => m.text === 'privet-klan'),
      'чужой клан-чат не слышит');

    const rgba = Buffer.alloc(16 * 12 * 4, 200).toString('base64');
    clB.clear();
    clB.send({ t: 'clan_crest', w: 16, h: 12, rgba: rgba });
    await sleep(400);
    t.ok(clB.last('clan_fail') && clB.last('clan_fail').reason === 'rank',
      'крест ставит только лидер', clB.last('clan_fail') && clB.last('clan_fail').reason);
    clA.clear();
    clA.send({ t: 'clan_crest', w: 8, h: 8, rgba: Buffer.alloc(8 * 8 * 4).toString('base64') });
    await sleep(400);
    t.ok(clA.last('clan_fail') && clA.last('clan_fail').reason === 'size',
      'произвольный размер креста отбит', clA.last('clan_fail') && clA.last('clan_fail').reason);
    clA.clear(); clB.clear();
    clA.send({ t: 'clan_crest', w: 16, h: 12, rgba: rgba });
    await sleep(500);
    const crestOk = clA.last('clan_ok');
    const crestPkt = clA.last('clan_crest') || clB.last('clan_crest');
    t.ok(crestOk && crestOk.op === 'crest', 'лидер сохранил крест');
    t.ok(crestPkt && crestPkt.w === 16 && crestPkt.h === 12 && crestPkt.hash,
      'пиксели креста ушли членам отдельным пакетом, не в AOI',
      crestPkt ? ('hash=' + crestPkt.hash) : 'нет пакета');

    const clanWhNpc = NPCS.getNpc('warehouse_w7');
    clA.send({ t: 'editor_set_pos', x: clanWhNpc.position.x + 2, z: clanWhNpc.position.z });
    clB.send({ t: 'editor_set_pos', x: clanWhNpc.position.x + 2, z: clanWhNpc.position.z });
    await sleep(400);
    await ensureAlive(clA); await ensureAlive(clB);
    clA.send({ t: 'editor_set_pos', x: clanWhNpc.position.x + 2, z: clanWhNpc.position.z });
    clB.send({ t: 'editor_set_pos', x: clanWhNpc.position.x + 2, z: clanWhNpc.position.z });
    await sleep(300);
    clA.clear();
    clA.send({ t: 'cwh_open', npcId: 'warehouse_w7' });
    await sleep(400);
    const cwh = clA.last('cwh_open');
    t.ok(cwh && cwh.cap === CL.whSlots(0) && cwh.scope === 'clan',
      'клан-склад открылся у NPC склада',
      cwh ? ('cap=' + cwh.cap) : JSON.stringify(clA.last('cwh_fail')));
    clA.clear();
    clA.send({ t: 'cwh_put', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 3 });
    await sleep(500);
    const cPut = clA.last('cwh_ok');
    t.ok(cPut && cPut.op === 'put' && (cPut.wh.synthetic_oil | 0) === 3,
      'вклад на клан-склад перенёс вещь',
      cPut ? ('wh=' + cPut.wh.synthetic_oil) : JSON.stringify(clA.last('cwh_fail')));
    clB.clear();
    clB.send({ t: 'cwh_take', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 1 });
    await sleep(400);
    const cFail = clB.last('cwh_fail');
    t.ok(cFail && cFail.reason === 'rank',
      'рядовой получает отказ при попытке забрать с клан-склада (rank)',
      cFail ? cFail.reason : 'нет cwh_fail');

    clA.clear();
    clA.send({ t: 'clan_promote', name: 'ClanB', rank: 'officer' });
    await sleep(400);
    t.ok(clA.last('clan_ok') && clA.last('clan_ok').op === 'promote',
      'лидер повысил соклановца до офицера');

    clB.clear();
    clB.send({ t: 'cwh_take', npcId: 'warehouse_w7', itemId: 'synthetic_oil', count: 1 });
    await sleep(500);
    const cTake = clB.last('cwh_ok');
    t.ok(cTake && cTake.op === 'take' && (cTake.wh.synthetic_oil | 0) === 2,
      'офицер забирает с клан-склада',
      cTake ? ('wh=' + cTake.wh.synthetic_oil) : JSON.stringify(clB.last('cwh_fail')));

    clB.clear();
    clB.send({ t: 'clan_leave' });
    await sleep(400);
    t.ok(clB.last('clan') && clB.last('clan').clan == null, 'рядовой покинул клан');
    clA.clear();
    clA.send({ t: 'clan_info' });
    await sleep(300);
    t.eq(clA.last('clan') && clA.last('clan').clan && clA.last('clan').clan.members.length, 1,
      'после ухода в клане остался лидер');

    clA.clear();
    clA.send({ t: 'clan_disband' });
    await sleep(400);
    t.ok(clA.last('clan') && clA.last('clan').clan == null, 'лидер распустил клан');

    // ── Лут-режимы пати ────────────────────────────────────────────────────
    // Регресс: DROP_CONFIG.PARTY_DROP_MODE и LootManager.distributePartyLoot были
    // мёртвым КЛИЕНТСКИМ кодом — режимы не работали, а внутри защиты пачку мог
    // взять любой сопартиец. Теперь победитель фиксируется на сервере при
    // падении и проверяется в canPickupLoot.
    t.suite('server: лут-режимы пати');
    const plA = mk('itest_loot_a', { name: 'LootA' });
    const plB = mk('itest_loot_b', { name: 'LootB' });
    await plA.connect();
    await plB.connect();
    const plSpot = { x: whNpc.position.x + 14, z: whNpc.position.z + 14 };
    plA.send({ t: 'editor_set_pos', x: plSpot.x, z: plSpot.z });
    plB.send({ t: 'editor_set_pos', x: plSpot.x + 1.5, z: plSpot.z });
    await sleep(500);
    plA.send({ t: 'party_invite', pid: plB.welcome.pid });
    await sleep(400);
    plB.send({ t: 'party_accept', pid: plA.welcome.pid });
    await sleep(500);
    const party0 = plA.last('party');
    t.eq(party0 && party0.lootMode, 'random', 'по умолчанию режим random');
    // Не лидер режим не меняет
    plB.clear();
    plB.send({ t: 'party_loot', mode: 'finders' });
    await sleep(300);
    t.ok(plB.find('msg').some(m => /только лидер/i.test(String(m.text))),
      'режим лута меняет только лидер');
    plA.clear(); plB.clear();
    plA.send({ t: 'party_loot', mode: 'turn' });
    await sleep(400);
    const partyTurn = plB.last('party');
    t.eq(partyTurn && partyTurn.lootMode, 'turn', 'режим «по очереди» разошёлся по группе');
    plA.clear();
    plA.send({ t: 'party_loot', mode: 'nonsense' });
    await sleep(300);
    t.ok(plA.find('msg').some(m => /Режимы лута/i.test(String(m.text))),
      'неизвестный режим отклонён с подсказкой');
    // В режиме turn пачка достаётся конкретному участнику: второй получает отказ
    plA.clear(); plB.clear();
    plA.send({ t: 'debug_spawn_loot', itemId: 'coal_briquette', count: 3 });
    await sleep(700);
    let plLid = null;
    for (const m of plA.msgs) if (m.lid != null) plLid = m.lid;
    t.ok(plLid != null, 'пачка лута появилась');
    if (plLid != null) {
      // В каноне L2 (turn/random): любой участник пати может поднять лут
      plB.clear();
      plB.send({ t: 'loot_pickup', lid: plLid });
      await sleep(600);
      const okB = plB.find('loot_pickup_ok').length > 0;
      t.ok(okB, 'сопартиец plB успешно подобрал пачку дропа группы');
    }
    // finders: пачка киллера снова принадлежит только ему
    plA.clear();
    plA.send({ t: 'party_loot', mode: 'finders' });
    await sleep(400);
    plA.clear(); plB.clear();
    plA.send({ t: 'debug_spawn_loot', itemId: 'coal_briquette', count: 2 });
    await sleep(700);
    let plLid2 = null;
    for (const m of plA.msgs) if (m.lid != null) plLid2 = m.lid;
    if (plLid2 != null) {
      plB.clear();
      plB.send({ t: 'loot_pickup', lid: plLid2 });
      await sleep(500);
      t.eq(plB.find('loot_pickup_ok').length, 0,
        'в режиме finders чужую пачку сопартиец не берёт');
      plA.clear();
      plA.send({ t: 'loot_pickup', lid: plLid2 });
      await sleep(500);
      t.ok(plA.find('loot_pickup_ok').length > 0, 'владелец забирает свою пачку');
    }

    // ── Личная лавка ───────────────────────────────────────────────────────
    // Регресс: private-store.js звал net.intentPrivateStore, которого не было ни
    // на клиенте, ни на сервере — модуль лавки был мёртвым кодом.
    t.suite('server: личная лавка');
    const stA = mk('itest_store_a', { name: 'StoreA' });
    const stB = mk('itest_store_b', { name: 'StoreB' });
    await stA.connect();
    await stB.connect();
    const stSpot = { x: whNpc.position.x + 18, z: whNpc.position.z + 18 };
    stA.send({ t: 'editor_set_pos', x: stSpot.x, z: stSpot.z });
    stB.send({ t: 'editor_set_pos', x: stSpot.x + 2, z: stSpot.z });
    await sleep(500);
    t.ok(await grabFor(stA, 'coal_briquette', 10), 'у продавца есть товар');
    // Квестовые и мусорные позиции отбиваются нормализацией
    stA.clear();
    stA.send({ t: 'store_set', mode: 'sell', title: 'Уголь', items: [{ itemId: 'audio_log_01', count: 1, price: 5 }] });
    await sleep(400);
    let sf = stA.last('store_fail');
    t.ok(sf && sf.reason === 'empty', 'лавка из одних квестовых предметов не открывается', sf && sf.reason);
    stA.clear();
    stA.send({ t: 'store_set', mode: 'sell', title: 'Уголь', items: [{ itemId: 'steam_hammer', count: 1, price: 100 }] });
    await sleep(400);
    sf = stA.last('store_fail');
    t.ok(sf && sf.reason === 'gone', 'нельзя выставить то, чего нет в сумке', sf && sf.reason);
    // Открытие лавки
    stA.clear();
    stA.send({ t: 'store_set', mode: 'sell', title: 'Уголь дёшево', items: [{ itemId: 'coal_briquette', count: 5, price: 25 }] });
    await sleep(400);
    const stOpen = stA.last('store_open');
    t.ok(stOpen && stOpen.items.length === 1 && stOpen.items[0].count === 5 && stOpen.items[0].price === 25,
      'лавка открылась с серверной витриной',
      stOpen ? JSON.stringify(stOpen.items) : JSON.stringify(stA.last('store_fail')));
    // Витрина видна соседу и в AOI приходит вывеска
    stB.clear();
    stB.send({ t: 'store_list', pid: stA.welcome.pid });
    await sleep(400);
    const stList = stB.last('store_list');
    t.ok(stList && stList.mode === 'sell' && stList.items.length === 1,
      'сосед видит витрину', stList ? JSON.stringify(stList.items) : 'нет пакета');
    t.eq(stList && stList.title, 'Уголь дёшево', 'заголовок лавки серверный');
    // Покупка: адена и предмет меняются местами, сумма в системе не меняется
    const beforeB = { coal: 0, money: 0 };
    stB.clear();
    stB.send({ t: 'store_buy', pid: stA.welcome.pid, itemId: 'coal_briquette', count: 2 });
    await sleep(600);
    const dealB = stB.last('store_deal');
    const dealA = stA.last('store_deal');
    t.ok(dealB && dealB.dir === 'buy' && dealB.total === 50, 'покупатель заплатил цену витрины',
      dealB ? ('total=' + dealB.total) : JSON.stringify(stB.last('store_fail')));
    t.ok(dealA && dealA.dir === 'sold' && dealA.total === 50, 'продавец получил адену',
      dealA ? ('total=' + dealA.total) : 'нет пакета');
    t.eq(dealB && (dealB.inv.coal_briquette | 0), 2, 'товар у покупателя');
    t.eq(dealA && (dealA.inv.coal_briquette | 0), 8, 'у продавца стало на 2 меньше');
    // Витрина уменьшилась
    stB.clear();
    stB.send({ t: 'store_list', pid: stA.welcome.pid });
    await sleep(400);
    const stList2 = stB.last('store_list');
    t.eq(stList2 && stList2.items[0] && stList2.items[0].count, 3, 'на витрине осталось 3');
    // Дистанция
    stB.send({ t: 'editor_set_pos', x: stSpot.x + 200, z: stSpot.z });
    await sleep(400);
    stB.clear();
    stB.send({ t: 'store_buy', pid: stA.welcome.pid, itemId: 'coal_briquette', count: 1 });
    await sleep(400);
    sf = stB.last('store_fail');
    t.ok(sf && sf.reason === 'range', 'покупка издалека отклонена', sf && sf.reason);
    stB.send({ t: 'editor_set_pos', x: stSpot.x + 2, z: stSpot.z });
    await sleep(400);
    // Не тот режим и распродажа
    stB.clear();
    stB.send({ t: 'store_sell', pid: stA.welcome.pid, itemId: 'coal_briquette', count: 1 });
    await sleep(400);
    sf = stB.last('store_fail');
    t.ok(sf && sf.reason === 'wrong_mode', 'в sell-лавку нельзя продавать', sf && sf.reason);
    stB.clear();
    stB.send({ t: 'store_buy', pid: stA.welcome.pid, itemId: 'coal_briquette', count: 99 });
    await sleep(600);
    const dealAll = stB.last('store_deal');
    t.ok(dealAll && dealAll.count === 3, 'количество зажато остатком витрины',
      dealAll ? ('count=' + dealAll.count) : JSON.stringify(stB.last('store_fail')));
    await sleep(300);
    t.ok(stA.find('store_close').some(c => c.reason === 'sold_out'),
      'распроданная лавка закрывается сама');
    // Закрытие руками и смерть
    stA.clear();
    t.ok(await grabFor(stA, 'coal_briquette', 3), 'товар для второй лавки получен');
    stA.send({ t: 'store_set', mode: 'sell', title: 'Ещё уголь', items: [{ itemId: 'coal_briquette', count: 1, price: 10 }] });
    await sleep(400);
    stA.clear();
    stA.send({ t: 'store_close' });
    await sleep(300);
    t.ok(stA.last('store_close'), 'лавка закрывается по команде');
    stB.clear();
    stB.send({ t: 'store_list', pid: stA.welcome.pid });
    await sleep(300);
    sf = stB.last('store_fail');
    t.ok(sf && sf.reason === 'no_store', 'закрытая лавка недоступна', sf && sf.reason);

    // Защита лавки покупки (VULN-13)
    stA.clear();
    stA.send({ t: 'store_set', mode: 'buy', title: 'Скупка угля', items: [{ itemId: 'coal_briquette', count: 10, price: 999999 }] });
    await sleep(400);
    const buyFail = stA.last('store_fail');
    t.ok(buyFail && buyFail.reason === 'funds', 'открытие скупки без достаточных средств отклонено (VULN-13)', buyFail && buyFail.reason);

    stA.clear();
    stA.send({ t: 'store_set', mode: 'buy', title: 'Скупка угля', items: [{ itemId: 'coal_briquette', count: 1, price: 10 }] });
    await sleep(400);
    const buyOk = stA.last('store_open');
    t.ok(buyOk && buyOk.mode === 'buy', 'скупка с достаточными средствами открывается');

    // Движение закрывает лавку (VULN-13)
    stA.clear();
    stA.send({ t: 'move', x: stSpot.x + 5, z: stSpot.z });
    await sleep(400);
    t.ok(stA.find('store_close').some(c => c.reason === 'move'), 'движение закрывает активную лавку (VULN-13)');

    // ── Скорость атаки ─────────────────────────────────────────────────────
    t.suite('server: скорость атаки зависит от оружия');
    const asp = mk('itest_atkspd');
    await asp.connect();
    t.ok(asp.welcome.self.atkIntervalMs > 0, 'welcome содержит atkIntervalMs',
      'кулаки/старт: ' + asp.welcome.self.atkIntervalMs + ' мс');
    /** Надеть оружие через dev-дроп и вернуть atkIntervalMs из combat_stats. */
    const intervalWith = async (templateId) => {
      asp.clear();
      asp.send({ t: 'debug_spawn_loot', itemId: templateId, count: 1 });
      await sleep(700);
      let lid2 = null;
      for (const m of asp.msgs) if (m.lid != null) lid2 = m.lid;
      if (lid2 == null) return { err: 'дроп не заспавнился' };
      asp.send({ t: 'loot_pickup', lid: lid2 });
      await sleep(600);
      const picked = asp.last('loot_pickup_ok');
      if (!picked) return { err: 'подбор не прошёл: ' + JSON.stringify(asp.last('loot_fail')) };
      asp.clear();
      asp.send({ t: 'equip', slot: 'weapon', templateId });
      await sleep(700);
      const cs2 = asp.last('combat_stats');
      if (!cs2) return { err: 'нет combat_stats: ' + JSON.stringify(asp.last('equip_fail')) };
      return { ms: cs2.atkIntervalMs, spd: cs2.atkSpdL2, cls: cs2.weaponClass };
    };
    // Порядок важен: operator_hammer_low надет со старта, и повторный equip
    // сервер обрабатывает идемпотентно (без combat_stats). Сначала меняем на
    // другое оружие, потом возвращаемся к молоту.
    const twoH = await intervalWith('steam_hammer');          // 2h_blunt, база 190
    const oneH = await intervalWith('operator_hammer_low');   // 1h_blunt, база 275
    const bow = await intervalWith('pneumatic_rifle');        // bow, база 293
    t.ok(oneH.ms && twoH.ms && bow.ms, 'combat_stats пришёл для всех трёх видов оружия',
      [oneH, twoH, bow].map(r => JSON.stringify(r)).join(' | '));
    if (oneH.ms && twoH.ms && bow.ms) {
      t.ok(oneH.ms < twoH.ms, 'молот 1H бьёт чаще парового молота 2H',
        oneH.ms + ' мс (' + oneH.cls + ') < ' + twoH.ms + ' мс (' + twoH.cls + ')');
      t.ok(bow.ms < oneH.ms, 'ружьё быстрее молота 1H',
        bow.ms + ' мс (' + bow.cls + ')');
      t.ok(oneH.spd > twoH.spd, 'Atk.Spd выше у быстрого оружия',
        oneH.spd + ' > ' + twoH.spd);
      // Раньше сервер ставил один интервал на всё оружие: 1000/(1+DEX/100)
      const flat = Math.max(400, Math.floor(1000 / (1 + 30 / 100)));
      t.ok(!(oneH.ms === twoH.ms && twoH.ms === bow.ms),
        'интервал больше не одинаков для всего оружия (было ' + flat + ' мс)');
    }

    // ── Модерация: бан/мут/репорт ──────────────────────────────────────────
    t.suite('server: модерация');
    const muted = mk('itest_mute');
    await muted.connect();
    const muteRes = await httpPost('/api/mod/mute', { yid: 'itest_mute', ttlSec: 600, reason: 'test' });
    t.eq(muteRes.status, 200, 'мут через HTTP с localhost в dev');
    muted.clear();
    muted.send({ t: 'chat', ch: 'all', text: 'muted-hello' });
    await sleep(400);
    const muteFail = muted.last('chat_fail');
    t.ok(muteFail && muteFail.reason === 'muted', 'мут блокирует чат', muteFail && muteFail.reason);
    await httpPost('/api/mod/unmute', { yid: 'itest_mute' });
    muted.clear();
    muted.send({ t: 'chat', ch: 'all', text: 'unmuted-hello' });
    await sleep(400);
    t.ok(muted.find('chat').some((m) => m.text === 'unmuted-hello'), 'после unmute чат снова идёт');

    const reporter = mk('itest_rep_a', { name: 'RepA' });
    const reported = mk('itest_rep_b', { name: 'RepB' });
    await reporter.connect();
    await reported.connect();
    reporter.clear();
    reporter.send({ t: 'report', name: 'RepB', text: 'spam' });
    await sleep(400);
    t.ok(reporter.last('report_ok'), 'репорт на онлайн-игрока принят');
    reporter.clear();
    reporter.send({ t: 'report', name: 'RepA', text: 'self' });
    await sleep(300);
    t.ok(reporter.last('report_fail') && reporter.last('report_fail').reason === 'self',
      'на себя пожаловаться нельзя');

    const banRes = await httpPost('/api/mod/ban', { yid: 'itest_banned', ttlSec: 600, reason: 'cheat' });
    t.eq(banRes.status, 200, 'бан через HTTP');
    const banned = mk('itest_banned');
    let banErr = null;
    try { await banned.connect(); } catch (e) { banErr = e; }
    t.ok(banErr || (banned.last && banned.last('login_fail')),
      'забаненный не входит', banErr ? String(banErr.message) : JSON.stringify(banned.last && banned.last('login_fail')));
    if (banned.ws) try { banned.close(); } catch (_) {}
    await httpPost('/api/mod/unban', { yid: 'itest_banned' });

    // ── Мультиперсонажность ────────────────────────────────────────────────
    t.suite('server: мультиперсонажность');
    seedChar('itest_multi', { name: 'MainHero', level: 5, inv: { copper_parts: 111 } });
    const mainHero = mk('itest_multi', { name: 'MainHero' });
    await mainHero.connect();
    t.eq(mainHero.welcome && mainHero.welcome.charId, 'c0', 'логин без charId → слот c0');
    t.eq(mainHero.welcome.inv && mainHero.welcome.inv.copper_parts, 111,
      'c0 читает существующий data/<yid>.json');
    t.ok(profileOnDisk('itest_multi') && profileOnDisk('itest_multi').inv.copper_parts === 111,
      'файл c0 остался data/<yid>.json, не data/<yid>.c0.json');

    const listed0 = await httpPost('/api/chars', { data: b64({ uniqueID: 'itest_multi' }) });
    t.eq(listed0.status, 200, 'POST /api/chars с localhost в dev');
    let listBody0 = {};
    try { listBody0 = JSON.parse(listed0.body); } catch (_) {}
    t.ok(listBody0.ok && Array.isArray(listBody0.chars) && listBody0.chars.length >= 1,
      'список слотов с сервера не пуст', JSON.stringify(listBody0.chars && listBody0.chars.map((c) => c.id)));

    const createdAlt = await httpPost('/api/chars/create', {
      data: b64({ uniqueID: 'itest_multi' }),
      name: 'AltHero', race: 'human', gender: 'female', cls: 'engineer'
    });
    t.eq(createdAlt.status, 200, 'POST /api/chars/create');
    let createdBody = {};
    try { createdBody = JSON.parse(createdAlt.body); } catch (_) {}
    t.ok(createdBody.ok && createdBody.char && createdBody.char.id && createdBody.char.id !== 'c0',
      'второй слот получает свой charId', createdBody.char && createdBody.char.id);
    t.eq(createdBody.char && createdBody.char.name, 'AltHero', 'имя второго слота с сервера');
    const altId = createdBody.char && createdBody.char.id;
    t.ok(fs.existsSync(path.join(DATA_DIR, 'itest_multi.' + altId + '.json')),
      'второй слот лежит в data/<yid>.<charId>.json');

    const altHero = mk('itest_multi', { id: altId, name: 'AltHero', cls: 'engineer' });
    await altHero.connect();
    t.eq(altHero.welcome && altHero.welcome.charId, altId, 'логин второго слота несёт его charId');
    t.ok(altHero.welcome.inv && altHero.welcome.inv.copper_parts !== 111,
      'инвентарь второго слота изолирован от c0',
      JSON.stringify(altHero.welcome.inv && { copper: altHero.welcome.inv.copper_parts }));
    await sleep(400);
    t.ok(mainHero.closed && mainHero.closed.code === 4008,
      'повторный вход того же аккаунта выкидывает предыдущий слот',
      mainHero.closed && JSON.stringify(mainHero.closed));

    altHero.close();
    await sleep(400);
    const mainAgain = mk('itest_multi', { name: 'MainHero' });
    await mainAgain.connect();
    t.eq(mainAgain.welcome.inv && mainAgain.welcome.inv.copper_parts, 111,
      'после смены слота c0 не потерял инвентарь');

    const listed2 = await httpPost('/api/chars', { data: b64({ uniqueID: 'itest_multi' }) });
    let listBody2 = {};
    try { listBody2 = JSON.parse(listed2.body); } catch (_) {}
    t.eq(listBody2.chars && listBody2.chars.length, 2, 'на аккаунте два слота');

    // ── Геометрия (PLAN 3.2) ───────────────────────────────────────────────
    t.suite('server: геометрия');
    const geoP = mk('itest_geo', { name: 'GeoGuy' });
    await geoP.connect();
    const g0 = { x: geoP.welcome.self.x, z: geoP.welcome.self.z };
    t.ok(geoP.welcome.self.y != null && geoP.welcome.self.y > -30,
      'welcome несёт Y с heightmap',
      'y=' + (geoP.welcome.self && geoP.welcome.self.y));
    geoP.clear();
    // Прыжок в океан одним пакетом после полного ведра: сервер не пускает на дно.
    await sleep(800);
    geoP.send({ t: 'move', x: g0.x, z: g0.z - 2500 });
    await sleep(500);
    const geoSync = geoP.last('self_sync') || {};
    const geoZ = geoSync.z != null ? geoSync.z : null;
    t.ok(geoZ == null || Math.abs(geoZ - (g0.z - 2500)) > 100,
      'ход в океан обрезается геометрией, а не только бюджетом',
      geoZ != null ? ('z=' + geoZ.toFixed(1) + ' старт ' + g0.z.toFixed(1)) : 'нет self_sync (короткий шаг)');
    // Стена острова: dev-ТП к сегменту Iwals и попытка пройти насквозь.
    geoP.send({ t: 'editor_set_pos', x: 132, z: -1688 });
    await sleep(400);
    geoP.clear();
    let wz = -1688;
    for (let i = 0; i < 25; i++) {
      wz += 1.0;
      geoP.send({ t: 'move', x: 132, z: wz });
      await sleep(80);
    }
    await sleep(1100);
    geoP.send({ t: 'move', x: 132, z: wz + 200 });
    for (let i = 0; i < 20; i++) {
      if (geoP.last('self_sync')) break;
      await sleep(100);
    }
    const wallSync = geoP.last('self_sync');
    t.ok(wallSync && wallSync.z > -1685 && wallSync.z < -1668,
      'через стену острова сервер не выпускает',
      wallSync ? ('z=' + wallSync.z.toFixed(1) + ' стена ≈ -1675') : 'нет self_sync');

    // ── Выгрузка мобов (PLAN 4.3) ──────────────────────────────────────────
    t.suite('server: выгрузка мобов');
    try { geoP.close(); } catch (_) {}
    const WMunload = require(path.join(ROOT, 'shared', 'world-metrics.js'));
    try {
      const ov = path.join(ROOT, 'shared', 'editor-overrides.json');
      if (fs.existsSync(ov)) WMunload.applyEditorOverrides(JSON.parse(fs.readFileSync(ov, 'utf8')));
    } catch (_) {}
    const avoid = [[-107.5, -246.4], [300, 300], [132, -1688]];
    try {
      const NPCSunl = require(path.join(ROOT, 'shared', 'npc-services.js'));
      const wh = NPCSunl.getNpc && NPCSunl.getNpc('warehouse_w7');
      if (wh && wh.position) avoid.push([wh.position.x, wh.position.z]);
    } catch (_) {}
    const huntSpots = (WMunload.buildSpots() || []).filter((s) => {
      if (!s || s.boss) return false;
      return avoid.every((p) => Math.hypot((s.x || 0) - p[0], (s.z || 0) - p[1]) > 400);
    });
    const hunt = huntSpots[0];
    t.ok(hunt, 'есть хант-спот дальше 400 м от деревни',
      hunt ? (hunt.mob + ' @ ' + Math.round(hunt.x) + ',' + Math.round(hunt.z)) : 'нет');
    if (hunt) {
      const unl = mk('itest_unload', { name: 'Unloader' });
      await unl.connect();
      unl.send({ t: 'editor_set_pos', x: hunt.x, z: hunt.z });
      await sleep(1500);
      const nearMet = await httpGet('/metrics');
      let nearBody = {};
      try { nearBody = JSON.parse(nearMet.body); } catch (_) {}
      t.ok((nearBody.mobs | 0) >= 1, 'у спота мобы заспавнились',
        JSON.stringify({ mobs: nearBody.mobs, spots: nearBody.spots }));
      const liveNear = nearBody.mobs | 0;
      unl.send({ t: 'editor_set_pos', x: -107.5, z: -246.4 });
      await sleep(1600);
      const farMet = await httpGet('/metrics');
      let farBody = {};
      try { farBody = JSON.parse(farMet.body); } catch (_) {}
      t.ok((farBody.mobs | 0) < liveNear, 'ушёл на 400+ м — пачка выгрузилась',
        'было ' + liveNear + ', стало ' + (farBody.mobs | 0) + ', spots=' + farBody.spots);
      unl.send({ t: 'editor_set_pos', x: hunt.x, z: hunt.z });
      await sleep(1500);
      const backMet = await httpGet('/metrics');
      let backBody = {};
      try { backBody = JSON.parse(backMet.body); } catch (_) {}
      t.ok((backBody.mobs | 0) >= 1, 'вернулся — спот снова загрузился',
        JSON.stringify({ mobs: backBody.mobs, spots: backBody.spots }));
    }

    // ── Грейд / Expertise (PLAN 5.1) ──────────────────────────────────────
    t.suite('server: levelReq и штраф грейда');
    const lowG = mk('itest_grade_low', { name: 'LowG' });
    await lowG.connect();
    lowG.send({ t: 'debug_spawn_loot', itemId: 'mace_prayer', count: 1 });
    await sleep(700);
    let gLid = null;
    for (const m of lowG.msgs) if (m.lid != null) gLid = m.lid;
    if (gLid != null) { lowG.send({ t: 'loot_pickup', lid: gLid }); await sleep(500); }
    lowG.clear();
    lowG.send({ t: 'equip', slot: 'weapon', templateId: 'mace_prayer' });
    await sleep(500);
    const lvFail = lowG.last('equip_fail');
    t.ok(lvFail && lvFail.reason === 'level', 'на 1 уровне D-булаву надеть нельзя',
      lvFail ? JSON.stringify(lvFail) : 'нет equip_fail');

    seedChar('itest_grade_hi', {
      name: 'HiG', level: 20, cls: 'operator',
      quests: { done: { main_04_certification: { n: 1, at: 1 } } }
    });
    const hiG = mk('itest_grade_hi', { name: 'HiG' });
    await hiG.connect();
    t.eq(hiG.welcome.self.level, 20, 'логин 20 уровня');
    hiG.send({ t: 'debug_spawn_loot', itemId: 'mace_prayer', count: 1 });
    await sleep(700);
    let gLid2 = null;
    for (const m of hiG.msgs) if (m.lid != null) gLid2 = m.lid;
    if (gLid2 != null) { hiG.send({ t: 'loot_pickup', lid: gLid2 }); await sleep(500); }
    hiG.clear();
    hiG.send({ t: 'equip', slot: 'weapon', templateId: 'mace_prayer' });
    await sleep(700);
    const eqOk = hiG.last('equip_ok');
    const csPen = hiG.last('combat_stats');
    t.ok(eqOk, 'на 20 уровне D-оружие надевается');
    t.ok(csPen && csPen.gradePenalty && csPen.gradePenalty.active && csPen.gradePenalty.weaponGap === 1,
      'без 1-й профессии — штраф грейда (нет Expertise D)',
      csPen && csPen.gradePenalty ? JSON.stringify(csPen.gradePenalty) : 'нет combat_stats');
    hiG.clear();
    hiG.send({ t: 'class_transfer', cls: 'mechanic' });
    await sleep(600);
    t.ok(hiG.last('class_transfer_ok'), 'смена на Механика прошла');
    hiG.send({ t: 'unequip', slot: 'weapon' });
    await sleep(400);
    hiG.clear();
    hiG.send({ t: 'equip', slot: 'weapon', templateId: 'mace_prayer' });
    await sleep(600);
    const csAfter = hiG.last('combat_stats');
    t.ok(csAfter && csAfter.gradePenalty && !csAfter.gradePenalty.active,
      'после 1-й профессии Expertise D снимает штраф',
      csAfter && csAfter.gradePenalty ? JSON.stringify(csAfter.gradePenalty) : 'нет combat_stats');

    // ── Сеть: дельта upd + квантизация (PLAN 4.4) ─────────────────────────
    t.suite('server: дельта upd');
    const NP = require(path.join(ROOT, 'shared', 'net-pack.js'));
    const netA = mk('itest_net_a', { name: 'NetA' });
    const netB = mk('itest_net_b', { name: 'NetB' });
    await netA.connect();
    await netB.connect();
    await sleep(500);
    t.ok(netB.seen(netA.welcome.pid), 'B видит A в AOI',
      JSON.stringify(netB.seen(netA.welcome.pid)));
    netB.clear();
    let skipBefore = 0;
    try { skipBefore = JSON.parse((await httpGet('/metrics')).body).updSkip | 0; } catch (_) {}
    await sleep(650);
    let idleHits = 0;
    for (const m of netB.msgs) {
      if (m.t !== 'upd' || !Array.isArray(m.upd)) continue;
      for (const e of m.upd) {
        if (e && e.k === 'p' + netA.welcome.pid) idleHits++;
      }
    }
    t.ok(idleHits <= 1, 'стоящий сосед не шлётся каждый тик (было 6+ за 0.6 с)',
      'раз: ' + idleHits);
    let skipAfter = skipBefore;
    try { skipAfter = JSON.parse((await httpGet('/metrics')).body).updSkip | 0; } catch (_) {}
    t.ok(skipAfter > skipBefore, 'простой AOI копится в updSkip',
      skipBefore + ' → ' + skipAfter);
    const destX = (netA.welcome.self.x || 0) + 8.12345;
    const destZ = netA.welcome.self.z;
    netA.send({ t: 'editor_set_pos', x: destX, z: destZ });
    await sleep(450);
    let moved = null;
    for (const m of netB.msgs) {
      if (m.t !== 'upd' || !Array.isArray(m.upd)) continue;
      for (const e of m.upd) {
        if (e && e.k === 'p' + netA.welcome.pid) moved = e;
      }
    }
    t.ok(moved, 'после ТП сосед приходит в upd',
      moved ? JSON.stringify(moved) : 'нет пакета по p' + netA.welcome.pid);
    if (moved) {
      t.eq(moved.x, NP.qCoord(destX), 'x квантован до сантиметра');
      t.eq(moved.z, NP.qCoord(destZ), 'z квантован до сантиметра');
    }

    // ── Баффы: слоты / диспел (PLAN 5.3) ──────────────────────────────────
    t.suite('server: слоты баффов');
    const bf = mk('itest_buff', { name: 'BuffGuy' });
    await bf.connect();
    t.ok(bf.welcome.effects && bf.welcome.effects.cap && bf.welcome.effects.cap.buffs === 20,
      'welcome несёт кап слотов C1',
      JSON.stringify(bf.welcome.effects && bf.welcome.effects.cap));
    for (let i = 0; i < 21; i++) {
      bf.send({ t: 'debug_buff', id: 'slot_' + i, duration: 120 });
    }
    await sleep(500);
    const fillOk = bf.find('debug_buff_ok');
    t.ok(fillOk.length >= 21, '21 apply дошли', 'ответов: ' + fillOk.length);
    const lastFill = fillOk[fillOk.length - 1];
    t.eq(lastFill && lastFill.buffs && lastFill.buffs.length, 20, 'кап 20 слотов');
    t.ok(lastFill && lastFill.dropped && lastFill.dropped.indexOf('slot_0') >= 0,
      '21-й выбил самый старый slot_0',
      JSON.stringify(lastFill && lastFill.dropped));
    bf.clear();
    bf.send({ t: 'debug_buff', id: 'slot_20', duration: 180 });
    await sleep(250);
    const recast = bf.last('debug_buff_ok');
    t.ok(recast && recast.ok && recast.replaced === 'slot_20' && recast.buffs.length === 20,
      'повтор того же id — refresh, не 21-й слот',
      recast ? JSON.stringify({ ok: recast.ok, replaced: recast.replaced, n: recast.buffs && recast.buffs.length }) : 'нет');
    bf.send({ t: 'debug_dispel', all: true });
    await sleep(250);
    t.eq((bf.last('debug_dispel_ok') || {}).buffs, [], 'диспел all снимает баффы');
    bf.clear();
    bf.send({ t: 'debug_buff', id: 'might_a', attackMult: 1.08, priority: 20, duration: 60 });
    await sleep(200);
    bf.send({ t: 'debug_buff', id: 'might_b', attackMult: 1.2, priority: 5, duration: 60 });
    await sleep(250);
    const stacked = bf.last('debug_buff_ok');
    t.ok(stacked && stacked.ok === false && stacked.reason === 'priority',
      'слабый PA_UP не вытесняет сильный',
      stacked ? JSON.stringify(stacked) : 'нет');
    t.ok(stacked && stacked.buffs && stacked.buffs.indexOf('might_a') >= 0 && stacked.buffs.indexOf('might_b') < 0,
      'в слотах остался might_a');
    bf.clear();
    bf.send({ t: 'debug_buff', id: 'oil', kind: 'debuff', slowMult: 0.5, duration: 30 });
    await sleep(250);
    const deb = bf.last('debug_buff_ok');
    t.ok(deb && deb.debuffs && deb.debuffs.indexOf('oil') >= 0, 'дебафф живёт в списке, не в slowUntil');
    const fxSnap = bf.last('effects');
    t.ok(fxSnap && Array.isArray(fxSnap.debuffs) && fxSnap.debuffs.some((e) => e && e.id === 'oil'),
      'снимок effects содержит slow',
      fxSnap ? JSON.stringify(fxSnap.debuffs) : 'нет');

    // ── Вес / перегруз (PLAN 5.2) ─────────────────────────────────────────
    t.suite('server: лимит веса');
    const wt = mk('itest_weight', { name: 'Heavy' });
    await wt.connect();
    t.ok(wt.welcome.self.maxWeight > 50000, 'welcome несёт MaxLoad из CON',
      'max=' + (wt.welcome.self && wt.welcome.self.maxWeight) +
      ' load=' + (wt.welcome.self && wt.welcome.self.weight));
    t.ok(wt.welcome.self.weight >= 0 && wt.welcome.self.weight < wt.welcome.self.maxWeight,
      'стартовая нагрузка меньше капа');
    wt.clear();
    wt.send({ t: 'debug_give', itemId: 'copper_parts', count: 8000000, force: true });
    await sleep(300);
    let wPkt = wt.last('weight') || wt.last('debug_give_ok');
    t.ok(wPkt && wPkt.noRegen, '≥2/3 нагрузки — реген стоп',
      wPkt ? JSON.stringify({ w: wPkt.weight, max: wPkt.maxWeight, noRegen: wPkt.noRegen }) : 'нет');
    t.ok(wPkt && wPkt.canAttack !== false, 'ещё не сверх капа — бить можно');
    wt.send({ t: 'debug_give', itemId: 'copper_parts', count: 20000000, force: true });
    await sleep(300);
    wPkt = wt.last('weight') || wt.last('debug_give_ok');
    t.ok(wPkt && wPkt.overloaded && wPkt.canAttack === false, 'сверх капа — нельзя атаковать',
      wPkt ? JSON.stringify({ w: wPkt.weight, max: wPkt.maxWeight, over: wPkt.overloaded }) : 'нет');
    wt.clear();
    wt.send({ t: 'attack', mid: 1 });
    await sleep(250);
    const heavyMsg = (wt.find('msg') || []).some((m) => String(m.text || '').indexOf('тяжело') >= 0);
    t.ok(heavyMsg, 'автоатака отказана по весу');
    wt.clear();
    wt.send({ t: 'debug_spawn_loot', itemId: 'steam_hammer', count: 1 });
    await sleep(500);
    let wlid = null;
    for (const m of wt.msgs) if (m.lid != null) wlid = m.lid;
    if (wlid != null) {
      wt.clear();
      wt.send({ t: 'loot_pickup', lid: wlid });
      await sleep(400);
      const lf = wt.last('loot_fail');
      t.ok(lf && lf.reason === 'weight', 'подбор сверх капа отклоняется',
        lf ? JSON.stringify(lf) : 'нет loot_fail');
    } else {
      t.ok(false, 'подбор сверх капа отклоняется', 'дроп не заспавнился');
    }

    // ── Дроп при смерти (PLAN 5.10) ────────────────────────────────────────
    t.suite('server: дроп при смерти C1');
    const huntX = 300, huntZ = 300;
    async function goHunt(c) {
      c.send({ t: 'skill', skillId: 'test_immortal' });
      await sleep(250);
      c.send({ t: 'editor_set_pos', x: huntX, z: huntZ });
      await sleep(350);
    }
    seedChar('itest_dd_mob', {
      name: 'DropMob', level: 10,
      inv: { copper_parts: 8000, synthetic_oil: 40, blue_capacitor: 3 }
    });
    const ddMob = mk('itest_dd_mob', { name: 'DropMob' });
    await ddMob.connect();
    await goHunt(ddMob);
    const ddReg = ddMob.last('region');
    t.ok(ddReg && ddReg.peace === false, 'хант 300,300 не мирный',
      ddReg ? JSON.stringify({ peace: ddReg.peace, zone: ddReg.zoneName }) : 'нет region');
    ddMob.clear();
    ddMob.send({ t: 'debug_die', by: 'mob', forceDrop: true });
    await sleep(500);
    const diedMob = ddMob.last('you_died');
    t.ok(diedMob, 'смерть от моба пришла you_died');
    t.eq(diedMob && diedMob.table, 'player', 'белая смерть от моба → PLAYER',
      diedMob ? JSON.stringify({ table: diedMob.table, dropped: diedMob.dropped, ids: diedMob.droppedIds }) : 'нет');
    t.ok(diedMob && diedMob.dropped >= 1, 'forceDrop снял хотя бы одну позицию');
    t.ok(diedMob && diedMob.inv && (diedMob.inv.copper_parts | 0) === 8000, 'адена на месте');
    t.ok(diedMob && diedMob.inv && (diedMob.inv.blue_capacitor | 0) === 3, 'квест на месте');
    const lostOil = !(diedMob && diedMob.inv && (diedMob.inv.synthetic_oil | 0) > 0);
    const lostGear = diedMob && Array.isArray(diedMob.droppedIds) && diedMob.droppedIds.length > 0;
    t.ok(lostOil || lostGear, 'потерян стак или экип (весь, не 10 %)',
      JSON.stringify({ ids: diedMob && diedMob.droppedIds, oil: diedMob && diedMob.inv && diedMob.inv.synthetic_oil }));
    const ddSpawns = ddMob.find('loot_spawn').filter((m) => m.deathDrop);
    t.ok(ddSpawns.length >= 1, 'пачки deathDrop лежат на земле', 'n=' + ddSpawns.length);
    t.ok(ddSpawns.every((m) => m.itemId !== 'copper_parts' && m.itemId !== 'blue_capacitor'),
      'среди deathDrop нет адены и квеста');

    seedChar('itest_dd_peace', {
      name: 'DropPeace', level: 10,
      inv: { copper_parts: 5000, synthetic_oil: 12 }
    });
    const ddPeace = mk('itest_dd_peace', { name: 'DropPeace' });
    await ddPeace.connect();
    ddPeace.clear();
    ddPeace.send({ t: 'debug_die', by: 'mob', forceDrop: true });
    await sleep(400);
    const diedPeace = ddPeace.last('you_died');
    t.ok(diedPeace && !diedPeace.table, 'в деревне таблицы дропа нет',
      diedPeace ? JSON.stringify({ table: diedPeace.table, dropped: diedPeace.dropped }) : 'нет');
    t.eq(diedPeace && diedPeace.inv && (diedPeace.inv.synthetic_oil | 0), 12, 'масло в мире не упало');

    seedChar('itest_dd_lucky', {
      name: 'DropLucky', level: 4,
      inv: { copper_parts: 1000, synthetic_oil: 9 }
    });
    const ddLucky = mk('itest_dd_lucky', { name: 'DropLucky' });
    await ddLucky.connect();
    await goHunt(ddLucky);
    ddLucky.clear();
    ddLucky.send({ t: 'debug_die', by: 'mob', forceDrop: true });
    await sleep(400);
    const diedLucky = ddLucky.last('you_died');
    t.ok(diedLucky && diedLucky.keepItemsUntil >= 4 && !diedLucky.table,
      'Lucky / ур.≤4 держит вещи даже от моба',
      diedLucky ? JSON.stringify({ keep: diedLucky.keepItemsUntil, table: diedLucky.table, dropped: diedLucky.dropped }) : 'нет');
    t.eq(diedLucky && diedLucky.inv && (diedLucky.inv.synthetic_oil | 0), 9, 'масло при Lucky на месте');

    seedChar('itest_dd_pvp', {
      name: 'DropPvp', level: 10,
      inv: { copper_parts: 7000, synthetic_oil: 15 }
    });
    const ddPvp = mk('itest_dd_pvp', { name: 'DropPvp' });
    await ddPvp.connect();
    await goHunt(ddPvp);
    ddPvp.clear();
    ddPvp.send({ t: 'debug_die', by: 'player', forceDrop: true });
    let diedPvp = null;
    for (let i = 0; i < 15; i++) {
      await sleep(100);
      diedPvp = ddPvp.last('you_died');
      if (diedPvp) break;
    }
    t.ok(diedPvp && !diedPvp.table && (diedPvp.dropped | 0) === 0,
      'белый PvP вещи не роняет',
      diedPvp ? JSON.stringify({ table: diedPvp.table, dropped: diedPvp.dropped }) : 'нет');
    t.eq(diedPvp && diedPvp.inv && (diedPvp.inv.copper_parts | 0), 7000,
      'адена не украдена убийцей');

    seedChar('itest_dd_karma', {
      name: 'DropKarma', level: 10, karma: 400, pk: 6,
      inv: { copper_parts: 4000, synthetic_oil: 20 }
    });
    const ddKar = mk('itest_dd_karma', { name: 'DropKarma' });
    await ddKar.connect();
    await goHunt(ddKar);
    ddKar.clear();
    ddKar.send({ t: 'debug_die', by: 'player', forceDrop: true });
    await sleep(500);
    const diedKar = ddKar.last('you_died');
    t.eq(diedKar && diedKar.table, 'karma', 'хаотик pk≥5 → KARMA даже от игрока',
      diedKar ? JSON.stringify({ table: diedKar.table, dropped: diedKar.dropped, ids: diedKar.droppedIds }) : 'нет');
    t.ok(diedKar && diedKar.dropped >= 1, 'KARMA forceDrop снял вещи');
    t.ok(diedKar && (diedKar.inv.copper_parts | 0) === 4000, 'адена хаотика не падает');

    // ── Мировые события (PLAN 5.9) ────────────────────────────────────────
    t.suite('server: мировые события');
    const evA = mk('itest_ev_a', { name: 'EvA' });
    const evB = mk('itest_ev_b', { name: 'EvB' });
    await evA.connect();
    await evB.connect();
    evB.send({ t: 'editor_set_pos', x: 300, z: 300 });
    await sleep(300);
    evA.clear();
    evB.clear();
    evA.send({ t: 'debug_event', id: 'pipe_burst' });
    await sleep(600);
    const evStartA = evA.last('event_start');
    const evStartB = evB.last('event_start');
    const evOk = evA.last('debug_event_ok');
    t.ok(evOk && (evOk.pack | 0) >= 6, 'debug_event поднял пачку',
      evOk ? JSON.stringify(evOk) : 'нет debug_event_ok');
    t.ok(evStartA && evStartA.kind === 'invasion' && evStartA.id === 'pipe_burst',
      'анонс набега (не уникальный рейд)',
      evStartA ? JSON.stringify({ kind: evStartA.kind, id: evStartA.id, mobId: evStartA.mobId, pack: evStartA.pack }) : 'нет');
    t.ok(evStartA && evStartA.mobId !== 'drill_worm', 'пачка не является вторым Босс-Буром');
    t.ok(evStartB && evStartB.kind === 'invasion', 'второй игрок в другой зоне тоже слышит анонс');
    evA.clear();
    evB.clear();
    evA.send({ t: 'debug_event', id: 'pipe_burst', end: true });
    await sleep(400);
    t.ok(evA.last('event_end') && evA.last('event_end').kind === 'invasion',
      'набег снимается по debug end');
    t.ok(evB.last('event_end'), 'окончание слышат все');

    let dwSpot = null;
    try {
      const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
      const ov = path.join(ROOT, 'shared', 'editor-overrides.json');
      if (fs.existsSync(ov)) {
        WM.applyEditorOverrides(JSON.parse(fs.readFileSync(ov, 'utf8')));
        if (WM.rebuildMobSpotsFromEditor) WM.rebuildMobSpotsFromEditor();
      }
      dwSpot = (WM.buildSpots() || []).find((s) => s && s.mob === 'drill_worm' && s.boss);
    } catch (_) { dwSpot = null; }
    if (dwSpot && dwSpot.x != null) {
      evA.send({ t: 'skill', skillId: 'test_immortal' });
      await sleep(200);
      evA.send({ t: 'editor_set_pos', x: dwSpot.x, z: dwSpot.z });
      await sleep(900);
      const raidPkt = evA.find('event_start').filter((m) => m.kind === 'raid' && m.id === 'drill_worm');
      const evC = mk('itest_ev_c', { name: 'EvC' });
      await evC.connect();
      const replay = evC.find('event_start').filter((m) => m.kind === 'raid');
      t.ok(raidPkt.length >= 1 || replay.length >= 1,
        'рейд фазы 1 анонсируется при спавне / на логине',
        'live=' + raidPkt.length + ' replay=' + replay.length);
    } else {
      t.ok(false, 'рейд фазы 1 анонсируется при спавне / на логине', 'нет спота drill_worm');
    }

    // ── Дуэль (PLAN 5.7) ──────────────────────────────────────────────────
    t.suite('server: дуэль');
    seedChar('itest_duel_a', { name: 'DuelA', level: 1 });
    seedChar('itest_duel_b', { name: 'DuelB', level: 1, hp: 12 });
    const duA = mk('itest_duel_a', { name: 'DuelA' });
    const duB = mk('itest_duel_b', { name: 'DuelB' });
    await duA.connect();
    await duB.connect();
    t.ok(duA.welcome && duA.welcome.peace, 'оба в деревне (мирная зона)');
    duA.clear();
    duA.send({ t: 'attack_player', pid: duB.welcome.pid });
    await sleep(300);
    const peaceHit = (duA.find('msg') || []).some((m) => String(m.text || '').indexOf('мирной') >= 0);
    t.ok(peaceHit, 'без дуэли удар в городе запрещён');
    t.eq(duA.find('dmg_player').length + duB.find('hit').length, 0, 'урона в мире не было');
    duA.clear();
    duB.clear();
    duA.send({ t: 'duel_offer', pid: duA.welcome.pid });
    await sleep(250);
    t.eq((duA.last('duel_fail') || {}).reason, 'self', 'нельзя вызвать себя');
    duA.send({ t: 'duel_offer', pid: duB.welcome.pid });
    await sleep(400);
    t.ok(duB.last('duel_invite') && duB.last('duel_invite').from === duA.welcome.pid,
      'цель получила вызов');
    duB.send({ t: 'duel_accept', pid: duA.welcome.pid });
    await sleep(400);
    t.ok(duA.last('duel_start') && duB.last('duel_start'), 'оба получили duel_start');
    duA.clear();
    duB.clear();
    for (let i = 0; i < 50; i++) {
      duA.send({ t: 'attack_player', pid: duB.welcome.pid });
      await sleep(180);
      if (duA.last('duel_end') || duB.last('duel_end')) break;
    }
    await sleep(300);
    const duelHits = duA.find('dmg_player').length + duB.find('hit').length;
    t.ok(duelHits > 0, 'в дуэли удар в городе проходит', 'хитов: ' + duelHits);
    t.ok(!duA.find('flag').some((m) => m.flagged === true), 'дуэль не вешает PvP-флаг');
    const ended = duA.last('duel_end') || duB.last('duel_end');
    t.ok(ended && ended.result === 'win', 'дуэль завершилась победой, не трупом',
      ended ? JSON.stringify(ended) : 'нет duel_end');
    t.ok(!duB.isDead() && !duB.last('you_died'), 'проигравший не в you_died');
    const vitB = duB.find('vitals').find((v) => (v.hp | 0) === 1) || duB.last('vitals');
    t.ok(vitB && (vitB.hp | 0) === 1, 'проигравший стоит с 1 HP',
      vitB ? ('hp=' + vitB.hp) : 'нет vitals');
    const prA = profileOnDisk('itest_duel_a');
    t.ok(!prA || !(prA.karma > 0), 'победитель без кармы',
      prA ? ('karma=' + prA.karma) : 'нет профиля');

    // ── Валидация каста ───────────────────────────────────────────────────
    t.suite('server: валидация каста (3.3)');
    const caster = mk('itest_caster', { cls: 'engineer', name: 'Caster' });
    await caster.connect();
    caster.clear();

    // 1. cast_begin на eng_self_repair (chargeTime 5.0с)
    caster.send({ t: 'cast_begin', skillId: 'eng_self_repair' });
    await sleep(200);
    const cStart = caster.last('cast_start');
    t.ok(cStart && cStart.skillId === 'eng_self_repair' && cStart.totalMs > 1000,
      'cast_begin запускает каст и возвращает cast_start с таймером',
      cStart ? ('totalMs=' + cStart.totalMs + ' castSec=' + cStart.castSec) : 'нет cast_start');

    // 2. Попытка завершить каст мгновенно (чит / модифицированный клиент)
    caster.send({ t: 'cast_complete', skillId: 'eng_self_repair' });
    await sleep(200);
    const earlyFail = caster.last('skill_fail');
    t.ok(earlyFail && earlyFail.reason === 'cast_in_progress',
      'попытка мгновенного завершения до таймера отклоняется (cast_in_progress)',
      earlyFail ? ('reason=' + earlyFail.reason + ' remainMs=' + earlyFail.remainMs) : 'нет fail');

    // 3. Срыв каста движением (> 1.2 м)
    caster.clear();
    caster.send({ t: 'cast_begin', skillId: 'eng_self_repair' });
    await sleep(150);
    caster.send({ t: 'move', x: (caster.welcome.self.x || 0) + 5.0, z: (caster.welcome.self.z || 0) + 5.0 });
    await sleep(300);
    const cancelMove = caster.last('cast_cancel');
    t.ok(cancelMove && cancelMove.reason === 'move',
      'движение персонажа прерывает каст (cast_cancel move)',
      cancelMove ? ('reason=' + cancelMove.reason) : 'нет cancel');

    // 4. Отмена каста клиентом (cast_cancel)
    caster.clear();
    caster.send({ t: 'cast_begin', skillId: 'eng_self_repair' });
    await sleep(150);
    caster.send({ t: 'cast_cancel' });
    await sleep(200);
    const cancelUser = caster.last('cast_cancel');
    t.ok(cancelUser && cancelUser.reason === 'user',
      'явная отмена клиентом прерывает каст (cast_cancel user)',
      cancelUser ? ('reason=' + cancelUser.reason) : 'нет cancel');

    // 5. Завершение каста без предварительного cast_begin при strictCast отклоняется
    caster.clear();
    caster.send({ t: 'test_set_require_cast' });
    await sleep(100);
    caster.send({ t: 'skill', skillId: 'eng_self_repair' });
    await sleep(200);
    const noCastFail = caster.last('skill_fail');
    t.ok(noCastFail && noCastFail.reason === 'no_cast',
      'прямой вызов заклинания без каста отклоняется (no_cast)',
      noCastFail ? ('reason=' + noCastFail.reason) : 'нет fail');

    // 6. Мгновенные умения (chargeTime <= 0.05) не требуют ожидания
    caster.clear();
    caster.send({ t: 'cast_begin', skillId: 'test_immortal' });
    await sleep(200);
    const instantOk = caster.last('skill_ok');
    t.ok(instantOk && instantOk.skillId === 'test_immortal',
      'мгновенные умения выполняются сразу без задержки таймера',
      instantOk ? instantOk.skillId : 'нет skill_ok');

    // ── GM-инструменты ───────────────────────────────────────────────────
    t.suite('server: GM-инструменты и аудит (3.5)');
    const gm = mk('itest_gm', { name: 'AdminGM' });
    await gm.connect();
    const user = mk('itest_regular', { name: 'RegularGuy' });
    await user.connect();

    // 1. Обычный игрок пытается выполнить GM-команду
    user.clear();
    user.send({ t: 'test_set_non_gm' });
    await sleep(100);
    user.send({ t: 'chat', text: '//kick AdminGM' });
    await sleep(200);
    const failGm = user.last('chat_fail');
    t.ok(failGm && failGm.reason === 'access_denied',
      'не-GM получает отказ access_denied при вызове // команды',
      failGm ? ('reason=' + failGm.reason) : 'нет chat_fail');

    // 1b. Обычный игрок пытается вызвать редакторские функции сервера
    t.ok(gm.welcome && gm.welcome.gm === true, 'welcome несёт gm: true для GM');
    t.eq(gm.welcome && gm.welcome.cosmetics && gm.welcome.cosmetics.aura, 'gm_champion',
      'GM по умолчанию получает сияющую ауру Чемпиона L2');
    t.eq(user.welcome && user.welcome.gm, false, 'обычный игрок создаётся с gm: false');
    t.eq(user.welcome && user.welcome.cosmetics && user.welcome.cosmetics.aura, null,
      'обычный игрок без ауры');
    t.eq(user.welcome && user.welcome.accessLevel, 0, 'обычный игрок создаётся с accessLevel: 0');
    user.clear();
    user.send({ t: 'editor_set_pos', x: 0, z: 0 });
    await sleep(200);
    const failSetPos = user.last('err');
    t.ok(failSetPos && failSetPos.msg && failSetPos.msg.includes('только для GM'),
      'не-GM получает отказ на editor_set_pos',
      failSetPos ? failSetPos.msg : 'нет err');

    user.clear();
    user.send({ t: 'debug_spawn_loot', itemId: 'buckler' });
    await sleep(200);
    const failLoot = user.last('err');
    t.ok(failLoot && failLoot.msg && failLoot.msg.includes('только для GM'),
      'не-GM получает отказ на debug_spawn_loot',
      failLoot ? failLoot.msg : 'нет err');

    user.clear();
    user.send({ t: 'save_editor_data', data: {} });
    await sleep(200);
    const failSave = user.last('err');
    t.ok(failSave && failSave.msg && failSave.msg.includes('только для GM'),
      'не-GM получает отказ на save_editor_data',
      failSave ? failSave.msg : 'нет err');

    // 2. GM объявление //announce
    user.clear();
    gm.clear();
    gm.send({ t: 'chat', text: '//announce Перезагрузка сервера через 15 минут' });
    await sleep(250);
    const annMsg = user.find('chat').find((m) => m.ch === 'announce');
    t.ok(annMsg && annMsg.text.includes('15 минут'),
      '//announce рассылает объявление всем игрокам',
      annMsg ? annMsg.text : 'нет анонса');

    // 2b. GM справка //help, скорость //speed, лечение //heal
    gm.clear();
    gm.send({ t: 'chat', text: '//help' });
    await sleep(150);
    const helpMsg = gm.find('msg').find((m) => m.text && m.text.includes('Команды GM'));
    t.ok(helpMsg, '//help выводит справку по GM-командам');

    gm.clear();
    gm.send({ t: 'chat', text: '//speed 2' });
    await sleep(150);
    const spdMsg = gm.find('msg').find((m) => m.text && m.text.includes('2x'));
    t.ok(spdMsg, '//speed устанавливает скорость перемещения GM');

    gm.clear();
    gm.send({ t: 'chat', text: '//heal' });
    await sleep(150);
    const healMsg = gm.find('msg').find((m) => m.text && m.text.includes('восстановлены'));
    t.ok(healMsg, '//heal восстанавливает здоровье и энергию GM');

    gm.clear();
    gm.send({ t: 'chat', text: '//aura red' });
    await sleep(150);
    const auraCos = gm.find('cosmetic').find((m) => m.aura === 'champion_red');
    t.ok(auraCos, '//aura red переключает ауру Чемпиона L2');

    gm.clear();
    gm.send({ t: 'chat', text: '//aura hero' });
    await sleep(150);
    const heroCos = gm.find('cosmetic').find((m) => m.aura === 'hero_aura');
    t.ok(heroCos, '//aura hero переключает на Аура Героя L2');

    // 2c. GM скилл ваншота gm_oneshot и команда //oneshot
    t.ok(gm.welcome && gm.welcome.skills && gm.welcome.skills.gm_oneshot === 1,
      'GM получает стартовое умение gm_oneshot');
    t.ok(user.welcome && (!user.welcome.skills || !user.welcome.skills.gm_oneshot),
      'обычный игрок не имеет умения gm_oneshot');

    user.clear();
    user.send({ t: 'skill', skillId: 'gm_oneshot' });
    await sleep(150);
    const userSkillFail = user.last('skill_fail');
    t.ok(userSkillFail && (userSkillFail.reason === 'access_denied' || userSkillFail.reason === 'not_learned'),
      'обычный игрок получает отказ при вызове gm_oneshot');

    gm.clear();
    gm.send({ t: 'chat', text: '//spawn rust_mite 1' });
    await sleep(250);
    gm.clear();
    gm.send({ t: 'chat', text: '//oneshot' });
    await sleep(250);
    const oneshotMsg = gm.find('msg').find((m) => m.text && m.text.includes('ваншотнут'));
    t.ok(oneshotMsg, '//oneshot мгновенно уничтожает моба');

    // 2c-2. GM скилл воскрешения gm_resurrect и команда //res
    t.ok(gm.welcome && gm.welcome.skills && gm.welcome.skills.gm_resurrect === 1,
      'GM получает стартовое умение gm_resurrect');
    t.ok(user.welcome && (!user.welcome.skills || !user.welcome.skills.gm_resurrect),
      'обычный игрок не имеет умения gm_resurrect');

    user.clear();
    user.send({ t: 'skill', skillId: 'gm_resurrect' });
    await sleep(150);
    const userResFail = user.last('skill_fail');
    t.ok(userResFail && (userResFail.reason === 'access_denied' || userResFail.reason === 'not_learned'),
      'обычный игрок получает отказ при вызове gm_resurrect');

    // Воскрешение через //res
    user.clear();
    gm.clear();
    gm.send({ t: 'chat', text: '//oneshot RegularGuy' });
    await sleep(250);
    gm.send({ t: 'chat', text: '//res RegularGuy' });
    await sleep(250);
    const userRevived = user.find('you_revived').find((m) => m.mode === 'resurrect');
    t.ok(userRevived, '//res RegularGuy воскрешает павшего игрока');

    // 3. Режим неуязвимости //invul
    gm.clear();
    gm.send({ t: 'chat', text: '//invul' });
    await sleep(200);
    const invMsg = gm.find('msg').find((m) => m.text && m.text.includes('Режим неуязвимости'));
    t.ok(invMsg && invMsg.text.includes('ВКЛ'),
      '//invul переключает режим неуязвимости',
      invMsg ? invMsg.text : 'нет msg');

    // 4. Телепорт к координатам //teleport
    gm.clear();
    gm.send({ t: 'chat', text: '//teleport -150 -250' });
    await sleep(250);
    const gmSync = gm.last('self_sync');
    t.ok(gmSync && Math.abs(gmSync.x - (-150)) < 1 && Math.abs(gmSync.z - (-250)) < 1,
      '//teleport x z перемещает персонажа и синхронизирует позицию',
      gmSync ? ('x=' + gmSync.x + ' z=' + gmSync.z) : 'нет sync');

    // 5. Выдача предмета //give
    user.clear();
    gm.clear();
    gm.send({ t: 'chat', text: '//give RegularGuy synthetic_oil 5' });
    await sleep(250);
    const invSync = user.last('inv_sync');
    t.ok(invSync && invSync.inv && invSync.inv.synthetic_oil >= 5,
      '//give выдаёт предмет в инвентарь игрока',
      invSync ? JSON.stringify(invSync.inv) : 'нет inv_sync');
    const prOnDisk = profileOnDisk('itest_regular');
    t.ok(prOnDisk && prOnDisk.inv && prOnDisk.inv.synthetic_oil >= 5,
      '//give немедленно персистит инвентарь цели на диск (BUG-DB-01)');

    // 6. Кик игрока //kick
    gm.clear();
    gm.send({ t: 'chat', text: '//kick RegularGuy' });
    await sleep(350);
    t.ok(user.closed && user.closed.code === 4011,
      '//kick отключает игрока от сервера с кодом 4011',
      user.closed ? ('code=' + user.closed.code) : 'сокет открыт');

    // 7. Аудит в JSONL
    await sleep(150);
    const dNow = new Date();
    const dStr = dNow.getUTCFullYear() + '-' + String(dNow.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dNow.getUTCDate()).padStart(2, '0');
    const logF = path.join(DATA_DIR, 'moderation', 'log-' + dStr + '.jsonl');
    let hasLog = false;
    try {
      const content = fs.readFileSync(logF, 'utf8');
      hasLog = content.includes('"t":"gm"') && content.includes('"cmd":"kick"');
    } catch (_) {}
    t.ok(hasLog, 'все GM-действия пишутся в audit log');

    // ── L2 Player Database и HTTP Admin API ──────────────────────────────
    t.suite('server: L2 Player Database и HTTP Admin API');
    const admPlayersRes = await httpGet('/api/admin/players');
    t.eq(admPlayersRes.status, 200, 'GET /api/admin/players возвращает 200');
    const admPlayers = JSON.parse(admPlayersRes.body);
    t.ok(admPlayers && Array.isArray(admPlayers.players), 'список игроков вернулся массивом');
    t.ok(admPlayers.players.some(p => p.name === 'AdminGM'), 'AdminGM присутствует в базе игроков');

    // Выдача GM статуса через HTTP Admin API
    const gmGrantRes = await httpPost('/api/admin/gm', { target: 'RegularGuy', accessLevel: 100 });
    t.eq(gmGrantRes.status, 200, 'POST /api/admin/gm возвращает 200');
    const gmGrantData = JSON.parse(gmGrantRes.body);
    t.ok(gmGrantData.ok && gmGrantData.accessLevel === 100, 'accessLevel успешно установлен через Admin API');

    // Снятие статуса GM через HTTP Admin API
    const gmRevokeRes = await httpPost('/api/admin/gm', { target: 'RegularGuy', accessLevel: 0 });
    t.eq(gmRevokeRes.status, 200, 'POST /api/admin/gm снятие возвращает 200');
    const gmRevokeData = JSON.parse(gmRevokeRes.body);
    t.ok(gmRevokeData.ok && gmRevokeData.accessLevel === 0, 'accessLevel успешно снят через Admin API');

    // VULN-SEC-01: Недопустимость использования YANDEX_APP_SECRET в заголовке X-Mod-Secret
    const yandexSecretAttempt = await httpPost('/api/admin/gm', { target: 'RegularGuy', accessLevel: 100 }, { 'x-mod-secret': 'some_yandex_app_secret' });
    t.eq(yandexSecretAttempt.status, 403, 'доступ с неавторизованным x-mod-secret строго отклонён (VULN-SEC-01)');

    // ── Враждебные пакеты ──────────────────────────────────────────────────
    t.suite('server: враждебные пакеты');
    const hos = mk('itest_hostile');
    await hos.connect();
    hos.raw('null');
    await sleep(150);
    t.ok(hos.closed && hos.closed.code === 4000, 'JSON "null" → close(4000)');
    const hos2 = mk('itest_hostile2');
    await hos2.connect();
    hos2.send({ t: 'equip', slot: '__proto__', templateId: '__proto__' });
    hos2.send({ t: 'enchant', slot: '__proto__' });
    hos2.send({ t: 'use', id: 'constructor' });
    hos2.send({ t: 'move', x: NaN, z: 'abc' });
    hos2.send({ t: 'drop_item', itemId: 'copper_parts', count: 1e999 });
    hos2.send({ t: 'wh_put', npcId: '__proto__', itemId: '__proto__', count: 1e999 });
    hos2.send({ t: 'wh_take', npcId: 'warehouse_w7', itemId: 'constructor', count: -5 });
    await sleep(600);
    t.ok(!hos2.closed, 'prototype-pollution и NaN-пакеты не рвут соединение');
    t.eq({}.plus, undefined, 'Object.prototype в процессе теста не загрязнён');

    // ── Поза sitting и реген в бою (P1.1) ──────────────────────────────────
    t.suite('server: поза sitting и реген в бою (P1.1)');
    const sitter = mk('itest_sitter', { name: 'Sitter' });
    const hitter = mk('itest_hitter', { name: 'Hitter' });
    await sitter.connect(); await hitter.connect();
    sitter.send({ t: 'editor_set_pos', x: 300, z: 300 });
    hitter.send({ t: 'editor_set_pos', x: 301.5, z: 300 });
    await sleep(400);

    // 1. Вне боя игрок может сесть
    sitter.clear();
    sitter.send({ t: 'pose', sitting: true });
    await sleep(200);

    // 2. Удар в PvP сбрасывает sitting
    sitter.clear(); hitter.clear();
    for (let i = 0; i < 14; i++) {
      hitter.send({ t: 'attack_player', pid: sitter.welcome.pid });
      await sleep(250);
      if (sitter.find('hit').length > 0) break;
    }
    t.ok(sitter.find('hit').length > 0, 'sitter получил удар в PvP');

    // 3. Во время боя сесть нельзя
    sitter.clear();
    sitter.send({ t: 'pose', sitting: true });
    await sleep(200);
    const failMsg = sitter.find('msg').find(m => m.text && m.text.includes('Нельзя сесть в бою'));
    t.ok(!!failMsg, 'персонаж в бою не может сесть (получен отказ)', failMsg ? failMsg.text : 'нет msg');

    // 4. Атакующий под флагом также не может сесть
    hitter.clear();
    hitter.send({ t: 'pose', sitting: true });
    await sleep(200);
    const failFlagMsg = hitter.find('msg').find(m => m.text && m.text.includes('Нельзя сесть в бою'));
    t.ok(!!failFlagMsg, 'флагнутый персонаж не может сесть (получен отказ)', failFlagMsg ? failFlagMsg.text : 'нет msg');

    // ── Сутки и ночь — агро и реген (P2.1) ──────────────────────────────────
    t.suite('server: сутки и ночь — агро и реген (P2.1)');
    // 1. Дневное время (12:00)
    gm.send({ t: 'set_time', hour: 12 });
    await sleep(300);
    const dayTimeRes = await httpGet('/api/world-time');
    const dayData = JSON.parse(dayTimeRes.body);
    t.eq(dayData.isNight, false, 'в 12:00 isNight = false');
    t.eq(dayData.phase, 'day', 'в 12:00 phase = day');

    // 2. Ночное время (23:00)
    gm.send({ t: 'set_time', hour: 23 });
    await sleep(300);
    const nightTimeRes = await httpGet('/api/world-time');
    const nightData = JSON.parse(nightTimeRes.body);
    t.eq(nightData.isNight, true, 'в 23:00 isNight = true');
    t.eq(nightData.phase, 'night', 'в 23:00 phase = night');

    // ── Защита от дюпа заточки (VULN-02) ──────────────────────────────────
    t.suite('server: защита от дюпа заточки (VULN-02)');
    seedChar('itest_dupe_check', {
      name: 'DupeChecker',
      level: 10,
      equip: { weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low', plus: 7 } },
      inv: { operator_hammer_low: 1 },
      plusById: { operator_hammer_low: 7 }
    });
    const dupeP = mk('itest_dupe_check', { name: 'DupeChecker' });
    await dupeP.connect();
    t.ok(dupeP.welcome && dupeP.welcome.equip && dupeP.welcome.equip.weapon && dupeP.welcome.equip.weapon.plus === 7,
      'персонаж зашёл с надетым оружием +7');
    t.ok(dupeP.welcome && dupeP.welcome.inv && dupeP.welcome.inv.operator_hammer_low === 1,
      'в инвентаре есть чистая копия того же оружия');

    dupeP.clear();
    dupeP.send({ t: 'drop_item', itemId: 'operator_hammer_low', count: 1 });
    await sleep(400);
    const dupeDropOk = dupeP.last('drop_ok');
    t.ok(dupeDropOk && dupeDropOk.itemId === 'operator_hammer_low', 'предмет из инвентаря сброшен на землю');
    t.eq(dupeDropOk && dupeDropOk.plus, 0, 'сброшенный из сумки предмет имеет заточку +0 (дюп закрыт)');
    const lootSpawn = dupeP.find('loot_spawn').find(m => m.itemId === 'operator_hammer_low');
    t.eq(lootSpawn && (lootSpawn.plus | 0), 0, 'дроп на земле имеет заточку +0');
    t.ok(dupeDropOk && dupeDropOk.equip && dupeDropOk.equip.weapon && dupeDropOk.equip.weapon.plus === 7, 'надетое оружие осталось +7');

    // ── Превышение лимита слотов инвентаря при unequip (VULN-14) ────────────
    t.suite('server: лимит слотов инвентаря при unequip (VULN-14)');
    const fullInv = {};
    for (let i = 0; i < 80; i++) {
      fullInv['unique_mat_' + i] = 1;
    }
    seedChar('itest_unequip_cap', {
      name: 'CapGuy',
      level: 10,
      inv: fullInv,
      equip: { weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' } }
    });
    const unP = mk('itest_unequip_cap', { name: 'CapGuy' });
    await unP.connect();
    t.eq(Object.keys(unP.welcome.inv || {}).length, 80, 'инвентарь персонажа заполнен на 80 слотов');
    t.ok(unP.welcome.equip && unP.welcome.equip.weapon, 'оружие надето');

    unP.clear();
    unP.send({ t: 'unequip', slot: 'weapon' });
    await sleep(400);
    const unFail = unP.last('equip_fail');
    t.ok(unFail && unFail.reason === 'inv_full', 'снятие оружия в заполненную сумку (80 слотов) отклонено (VULN-14)', unFail && unFail.reason);
    t.ok(!unP.last('unequip_ok'), 'пакет unequip_ok не был отправлен');

    // ── Титул: экипировка, снятие и выброс из слота title
    t.suite('server: экипировка, снятие и выброс титула');
    seedChar('itest_title_guy', {
      name: 'TitleGuy',
      level: 10,
      nonGm: true,
      inv: { title_tralalero: 1 },
      equip: {}
    });
    const titleP = mk('itest_title_guy', { name: 'TitleGuy' });
    await titleP.connect();
    titleP.send({ t: 'test_set_non_gm' });
    await sleep(200);
    t.ok(titleP.welcome.inv && titleP.welcome.inv.title_tralalero, 'титул в инвентаре');

    // Экипируем титул
    titleP.clear();
    titleP.send({ t: 'equip', slot: 'title', templateId: 'title_tralalero' });
    await sleep(400);
    const titleEqOk = titleP.last('equip_ok');
    t.ok(titleEqOk && titleEqOk.slot === 'title', 'титул успешно экипирован в слот title');
    const titleCosUpd = titleP.last('cosmetic');
    t.ok(titleCosUpd && titleCosUpd.titleName === 'Tralalero Toasterino', 'AOI оповещён о новом титуле', titleCosUpd ? JSON.stringify(titleCosUpd) : 'нет пакета cosmetic');

    // Снимаем титул
    titleP.clear();
    titleP.send({ t: 'unequip', slot: 'title' });
    await sleep(400);
    const titleUneqOk = titleP.last('unequip_ok');
    t.ok(titleUneqOk && titleUneqOk.slot === 'title', 'титул успешно снят из слота title');
    const titleCosOff = titleP.last('cosmetic');
    t.ok(titleCosOff && !titleCosOff.titleName, 'титул над головой очищен при снятии', titleCosOff ? JSON.stringify(titleCosOff) : 'нет пакета cosmetic');

    // Снова надеваем и выбрасываем на землю прямо из слота
    titleP.clear();
    titleP.send({ t: 'equip', slot: 'title', templateId: 'title_tralalero' });
    await sleep(400);
    titleP.clear();
    titleP.send({ t: 'drop_item', itemId: 'title_tralalero', count: 1 });
    await sleep(400);
    const titleDropOk = titleP.last('drop_ok');
    t.ok(titleDropOk && titleDropOk.itemId === 'title_tralalero', 'титул выброшен на землю из слота');
    t.ok(titleDropOk && titleDropOk.fromEquip === true, 'выброс зафиксирован из экипированного слота');
  } finally {
    clients.forEach(c => c.close());
    await sleep(400);
    try {
      if (proc && proc.pid) {
        if (process.platform === 'win32') {
          try { require('child_process').execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' }); } catch (_) {}
        }
        proc.kill();
      }
    } catch (_) {}
    await sleep(400);
    wipe('itest_');
    wipeTestClans();
    wipeTestSanctions();
  }
};
