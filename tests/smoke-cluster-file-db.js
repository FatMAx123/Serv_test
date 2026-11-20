// ============================================================
//  TESTS / SMOKE-CLUSTER-FILE-DB.JS — живой прогон кластера (4 воркера, DB=file).
//  Запуск: node tests/smoke-cluster-file-db.js [rootDir]
//    rootDir — корень проекта с папкой data/ (по умолчанию — этот репозиторий).
//    Для изоляции от рабочих данных можно указать отдельную копию/ссылку на проект.
//  Проверяет:
//   1) кластер поднимается с 4 зонами-воркерами на файловой БД;
//   2) гость входит (handoff при логине из города в зону воркера #2);
//   3) переход границы обратно в город (handoff #2 → #1) во время движения;
//   4) все операции БД воркеров исполняет мастер (DEBUG_DB_PROXY), локальных фоллбэков нет;
//   5) после выхода профиль на диске содержит последнюю позицию, повторный вход её видит.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const WebSocket = require('ws');

const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const DATA = path.join(ROOT, 'data');
const PORT = 18000 + Math.floor(Math.random() * 900);
const YID = 'local_e2e' + crypto.randomBytes(5).toString('hex');
const TOKEN = crypto.randomBytes(24).toString('hex');
const START_X = 270;      // за городом (радиус 350 вокруг -107.5): восточная зона → воркер #2
const START_Z = -246.4;
const TARGET_X = 225;     // обратно в город → воркер #1

const results = [];
function check(cond, name, info) {
  results.push({ ok: !!cond, name, info });
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (info ? '  (' + info + ')' : ''));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seedProfile() {
  const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
  const AUTH = require(path.join(ROOT, 'server', 'auth.js'));
  const pr = G.newProfile('E2EWalker', { race: 'human', gender: 'male', cls: 'operator' });
  pr.charId = 'c0';
  pr.createdAt = Date.now();
  pr.x = START_X; pr.z = START_Z;
  pr.level = 5;
  pr.saveRev = 1;
  pr.starterGranted = true;
  pr.guestTokenHashes = [AUTH.hashGuestToken(TOKEN)];
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(path.join(DATA, YID + '.json'), JSON.stringify(pr));
}

function cleanup() {
  for (const f of fs.readdirSync(DATA)) {
    if (f.startsWith(YID)) { try { fs.unlinkSync(path.join(DATA, f)); } catch (_) { } }
  }
}

function startCluster(logLines) {
  const env = Object.assign({}, process.env, {
    PORT: String(PORT), HOST: '127.0.0.1', NODE_ENV: 'test',
    CLUSTER_WORKERS: '4', DB: 'file', CLUSTER_FILE_DB_PROXY: '1',
    ALLOW_INSECURE_DEV: '1', ALLOW_DEFAULT_KEY_SECRETS: '1', METRICS_PUBLIC: '1',
    EDITOR_ENABLED: '0', SERVE_CLIENT: '0', STRESS_TEST: '0', DEBUG_DB_PROXY: '1',
    NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --preserve-symlinks --preserve-symlinks-main').trim()
  });
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'cluster-manager.js')], { cwd: ROOT, env });
  const onData = (buf) => {
    for (const line of String(buf).split(/\r?\n/)) if (line.trim()) logLines.push(line);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  return child;
}

function killTree(child) {
  if (!child || child.exitCode != null) return;
  try {
    if (process.platform === 'win32') execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch (_) { try { child.kill('SIGKILL'); } catch (__) { } }
}

async function waitFor(pred, ms, stepMs) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (pred()) return true;
    await sleep(stepMs || 100);
  }
  return !!pred();
}

function loginData() {
  return Buffer.from(JSON.stringify({ uniqueID: YID, publicName: 'E2EWalker', guestToken: TOKEN, charId: 'c0' })).toString('base64url');
}

async function connectAndLogin(inbox) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT);
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return;
    try { inbox.push(JSON.parse(String(raw))); } catch (_) { }
  });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  ws.send(JSON.stringify({ t: 'login', data: loginData(), signature: '' }));
  return ws;
}

(async () => {
  const log = [];
  let child = null;
  seedProfile();
  try {
    child = startCluster(log);
    const up = await waitFor(() => log.some((l) => /Zone Worker #4 ready/.test(l)) && log.some((l) => /Master Gateway запущен/.test(l)), 60000, 200);
    check(up, 'кластер поднялся: Master Gateway + 4 зоны-воркера');
    check(log.some((l) => /единственный писатель профилей \(4/.test(l)), 'мастер объявил себя единственным писателем файловой БД');
    if (!up) throw new Error('cluster did not start');

    // --- 1. Вход: город → воркер #1 принимает сокет, профиль в зоне воркера #2 → initial handoff
    const inbox = [];
    const ws = await connectAndLogin(inbox);
    const welcomed = await waitFor(() => inbox.some((m) => m.t === 'welcome'), 15000);
    const welcome = inbox.find((m) => m.t === 'welcome');
    check(welcomed && welcome && welcome.pid, 'гость вошёл (welcome)', welcome ? 'pid=' + welcome.pid : '');
    const pid = welcome && welcome.pid;
    const startSelf = welcome && welcome.self;
    check(startSelf && Math.abs(startSelf.x - START_X) < 2, 'позиция из профиля восстановлена при входе', startSelf ? 'x=' + startSelf.x : '');
    await sleep(1500);
    check(log.some((l) => /\[DB-PROXY\] worker#1 (loadProfile|listChars) local_e2e/.test(l)), 'загрузка профиля при входе выполнена мастером по запросу воркера #1');

    // --- 2. Идём на запад, пересекая границу города (воркер #2 → #1)
    let x = START_X;
    while (x > TARGET_X) {
      x = Math.max(TARGET_X, x - 0.7);
      ws.send(JSON.stringify({ t: 'move', x, z: START_Z, destX: TARGET_X, destZ: START_Z }));
      await sleep(100);
    }
    ws.send(JSON.stringify({ t: 'move_stop', x: TARGET_X, z: START_Z }));
    await sleep(1500);
    const hardSyncs = inbox.filter((m) => m.t === 'self_sync' && m.hard).length;
    check(hardSyncs === 0, 'античит не откатывал движение (hard self_sync отсутствуют)', 'hard=' + hardSyncs);
    const regionMsgs = inbox.filter((m) => m.t === 'region');
    check(regionMsgs.length >= 1, 'после перехода зоны клиент получил region от нового воркера', 'region×' + regionMsgs.length);

    // --- 3. Выход: профиль сохраняется (через мастер)
    ws.close();
    await sleep(2500);
    const prOnDisk = JSON.parse(fs.readFileSync(path.join(DATA, YID + '.json'), 'utf8'));
    check(Math.abs(prOnDisk.x - TARGET_X) < 1.5, 'на диске последняя позиция после перехода границы', 'x=' + prOnDisk.x);
    check(prOnDisk.saveRev > 1, 'ревизия профиля выросла', 'saveRev=' + prOnDisk.saveRev);
    const proxied = log.filter((l) => /\[DB-PROXY\] worker#\d saveProfile local_e2e/.test(l));
    const writers = new Set(proxied.map((l) => (/worker#(\d)/.exec(l) || [])[1]));
    check(proxied.length > 0, 'сохранения профиля шли через мастер', proxied.length + ' запросов');
    check(writers.has('1') && writers.has('2'), 'профиль сохраняли оба воркера (до и после handoff) — но писал только мастер', 'воркеры: ' + [...writers].join(','));
    check(!log.some((l) => /мастер недоступен/.test(l)), 'локальных фоллбэков записи не было');

    // --- 4. Повторный вход видит сохранённое
    const inbox2 = [];
    const ws2 = await connectAndLogin(inbox2);
    await waitFor(() => inbox2.some((m) => m.t === 'welcome'), 15000);
    const w2 = inbox2.find((m) => m.t === 'welcome');
    check(w2 && w2.self && Math.abs(w2.self.x - TARGET_X) < 1.5, 'повторный вход загрузил последнюю позицию', w2 && w2.self ? 'x=' + w2.self.x : '');
    ws2.close();
    await sleep(1500);

    const fatal = log.filter((l) => /\[fatal\]|uncaughtException|unhandledRejection|TypeError/.test(l));
    check(fatal.length === 0, 'в логах кластера нет фатальных ошибок', fatal.slice(0, 2).join(' | '));
    void pid;
  } catch (e) {
    check(false, 'смоук завершился без исключений', e && e.message);
  } finally {
    killTree(child);
    await sleep(500);
    cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log('\n' + (failed.length ? 'ПРОВАЛЕНО' : 'OK') + ': ' + (results.length - failed.length) + ' пройдено, ' + failed.length + ' провалено');
    if (failed.length) {
      console.log('\nПоследние строки лога кластера:');
      for (const l of log.slice(-40)) console.log('  | ' + l);
    }
    process.exit(failed.length ? 1 : 0);
  }
})();
