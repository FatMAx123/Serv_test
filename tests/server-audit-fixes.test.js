// ============================================================
//  TESTS / SERVER-AUDIT-FIXES.TEST.JS
//  Регрессии по живому аудиту сервера (2026-11): лимит создания гостей,
//  возврат handoff при недоступной зоне, fail-closed проверка владения гостем,
//  кластерный прокси БД без второго писателя, роль владельца кланового склада,
//  цепочка команд деплоя.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const ROOT = path.join(__dirname, '..');

function withEnv(vars, fn) {
  const prev = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] == null) delete process.env[k];
    else process.env[k] = vars[k];
  }
  const restore = () => {
    for (const k of Object.keys(vars)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.finally(restore);
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

module.exports = async function (t) {
  // ---------------------------------------------------------------
  t.suite('audit-fixes: лимит создания персонажей/гостей (creation-limiter)');
  {
    const CL = require('../server/creation-limiter.js');
    withEnv({ NEW_CHARS_PER_IP_10MIN: '3', NEW_CHARS_GLOBAL_PER_MIN: '0' }, () => {
      CL.resetForTesting();
      const now = 1000000;
      t.ok(CL.check('203.0.113.7', { now }).ok, '1-е создание с IP разрешено');
      t.ok(CL.check('203.0.113.7', { now }).ok, '2-е создание разрешено');
      t.ok(CL.check('203.0.113.7', { now }).ok, '3-е создание разрешено');
      const r4 = CL.check('203.0.113.7', { now });
      t.ok(!r4.ok && r4.reason === 'create_rate', '4-е создание с того же IP отклонено (create_rate)');
      t.ok(CL.check('198.51.100.9', { now }).ok, 'другой IP не затронут');
      t.ok(CL.check('203.0.113.7', { now: now + 10 * 60 * 1000 + 1 }).ok, 'после окна 10 минут снова можно');
      for (let i = 0; i < 10; i++) CL.check('127.0.0.1', { now });
      t.ok(CL.check('127.0.0.1', { now }).ok, 'loopback не лимитируется per-IP (прокси без X-Real-IP)');
    });
    withEnv({ NEW_CHARS_PER_IP_10MIN: '100', NEW_CHARS_GLOBAL_PER_MIN: '2' }, () => {
      CL.resetForTesting();
      const now = 2000000;
      CL.check('127.0.0.1', { now });
      CL.check('203.0.113.8', { now });
      const g = CL.check('127.0.0.1', { now });
      t.ok(!g.ok && g.reason === 'create_busy', 'глобальный потолок действует и для loopback');
      CL.resetForTesting();
    });
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: handoff в недоступную зону возвращается источнику');
  {
    const { IpcHub, MSG_HANDOFF } = require('../server/ipc-hub.js');
    const hub = new IpcHub({ isPrimary: true });
    function fakeWorker(connected) {
      const w = new EventEmitter();
      w.sent = [];
      w.isConnected = () => connected;
      w.send = (m, cb) => { w.sent.push(m); if (cb) cb(); return true; };
      return w;
    }
    const w1 = fakeWorker(true);
    const w2 = fakeWorker(false); // целевой воркер: канал закрыт
    hub.registerWorker(1, w1);
    hub.registerWorker(2, w2);
    let route = null;
    hub.on('handoff_route', (r) => { route = r; });
    hub._handleWorkerMessage(1, { ipcType: MSG_HANDOFF, targetWorkerId: 2, payload: { pid: 10000005, connId: 77, playerData: { pid: 10000005 } } });
    t.eq(w2.sent.length, 0, 'недоступному воркеру ничего не отправлено');
    t.eq(w1.sent.length, 1, 'handoff вернулся воркеру-источнику');
    t.ok(w1.sent[0] && w1.sent[0].payload && w1.sent[0].payload.bounced === true, 'возврат помечен bounced');
    t.eq(w1.sent[0] && w1.sent[0].payload && w1.sent[0].payload.bouncedFrom, 2, 'bouncedFrom = недоступный воркер');
    t.eq(route && route.targetWorkerId, 1, 'маршрут шлюза указывает на источник, а не на мёртвую зону');

    const w3 = fakeWorker(true);
    hub.registerWorker(3, w3);
    hub._handleWorkerMessage(1, { ipcType: MSG_HANDOFF, targetWorkerId: 3, payload: { pid: 10000006, connId: 78 } });
    t.eq(w3.sent.length, 1, 'доступному воркеру handoff доставлен как раньше');
    t.eq(route && route.targetWorkerId, 3, 'маршрут на целевой воркер');

    const srv = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
    t.ok(/payload\.bounced[\s\S]{0,200}_handoffRetryAt/.test(srv), 'server.js: при возврате ставится пауза повторного перехода');
    t.ok(/_handoffRetryAt && Date\.now\(\) < p\._handoffRetryAt\) return;/.test(srv), 'initiateClusterHandoff уважает паузу');
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: проверка владения гостем закрыта при ошибках БД');
  {
    const GuestAuth = require('../server/guest-auth.js');
    const yid = 'local_auditfix' + Date.now().toString(36);
    const token = 'a'.repeat(40);
    const noKeys = { byYid: new Map(), tokenHashesFor: () => [], hasExplicitTokens: () => false };

    const dbListFails = { listChars: async () => { throw new Error('EMFILE'); }, load: async () => null };
    const r1 = await GuestAuth.verifyGuestOwnership(dbListFails, noKeys, yid, token);
    t.ok(!r1.ok && r1.reason === 'db_error', 'ошибка listChars → отказ (раньше: пустой список и TOFU-вход)');

    const dbLoadFails = { listChars: async () => [{ id: 'c0' }], load: async () => { throw new Error('timeout'); } };
    const r2 = await withEnv({ GUEST_TOFU: '1' }, () => GuestAuth.verifyGuestOwnership(dbLoadFails, noKeys, yid, token));
    t.ok(!r2.ok, 'нечитаемый профиль считается защищённым — TOFU с чужим токеном не проходит');

    const dbEmpty = { listChars: async () => [], load: async () => null };
    const r3 = await GuestAuth.verifyGuestOwnership(dbEmpty, noKeys, yid, token);
    t.ok(r3.ok && r3.tofu, 'действительно новый гость по-прежнему создаётся (TOFU)');
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: прокси БД кластера — без локальной записи при живом мастере');
  {
    const { IpcHub } = require('../server/ipc-hub.js');
    const hadSend = Object.prototype.hasOwnProperty.call(process, 'send');
    const origSend = process.send;
    process.send = () => true; // канал «есть», мастер молчит
    try {
      const hub = new IpcHub({ isPrimary: false, workerId: 2 });
      let err = null;
      const keepAlive = setTimeout(() => {}, 2000); // таймер dbRequest — unref: держим цикл событий
      try { await hub.dbRequest('saveProfile', ['local_x', {}, 'c0'], 30); } catch (e) { err = e; }
      clearTimeout(keepAlive);
      t.ok(err && err.code === 'ERR_DB_PROXY_TIMEOUT', 'таймаут запроса к мастеру помечен ERR_DB_PROXY_TIMEOUT');
      t.ok(err && err.remote === true, 'remote=true → db.js не делает локальную запись (второго писателя нет)');
    } finally {
      if (hadSend) process.send = origSend; else delete process.send;
    }
    const db = fs.readFileSync(path.join(ROOT, 'server', 'db.js'), 'utf8');
    t.ok(/if \(e && e\.remote\) throw e;/.test(db), 'viaMaster пробрасывает remote-ошибки без фоллбэка');
    t.ok(/e\.code === 'ENOENT'\) return out;\s*throw e;/.test(db), 'listChars: ошибка readdir пробрасывается (не «персонажей нет»)');
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: владелец кланового склада при унаследованном IS_CLUSTER_MASTER');
  {
    const Clans = require('../server/clans-store.js');
    withEnv({ IS_CLUSTER_MASTER: '1', IS_CLUSTER_WORKER: '1', WORKER_INDEX: '1', WORKER_ID: '1' }, () => {
      t.ok(Clans.isCwhOwner() === true, 'воркер #1 — владелец, даже если флаг мастера унаследован');
    });
    withEnv({ IS_CLUSTER_MASTER: '1', IS_CLUSTER_WORKER: '1', WORKER_INDEX: '3', WORKER_ID: '3' }, () => {
      t.ok(Clans.isCwhOwner() === false, 'воркер #3 — не владелец');
    });
    withEnv({ IS_CLUSTER_MASTER: '1', IS_CLUSTER_WORKER: null, WORKER_INDEX: null, WORKER_ID: null }, () => {
      t.ok(Clans.isCwhOwner() === false, 'мастер — не владелец');
    });
    const cm = fs.readFileSync(path.join(ROOT, 'server', 'cluster-manager.js'), 'utf8');
    t.ok(/delete env\.IS_CLUSTER_MASTER;/.test(cm), 'forkWorker не передаёт воркерам флаг мастера');
    t.ok(/process\.exit\(1\)[\s\S]{0,40}\}\);\s*\n\s*let isShuttingDown/.test(cm) || /FATAL: ошибка запуска шлюза/.test(cm), 'ошибка запуска шлюза завершает мастер (fail-fast)');
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: реестр ключей пишет только мастер');
  {
    const ak = fs.readFileSync(path.join(ROOT, 'server', 'account-keys.js'), 'utf8');
    t.ok(/async _persist\(\) \{[\s\S]{0,700}IS_CLUSTER_WORKER === '1'\) return;/.test(ak), '_persist в воркере кластера ничего не пишет');
    t.ok(/fromWorker && process\.env\.IS_CLUSTER_MASTER === '1'/.test(ak), 'мастер сохраняет токены, пришедшие от воркера');
  }

  // ---------------------------------------------------------------
  t.suite('audit-fixes: цепочка команд деплоя');
  {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-vps.js'), 'utf8');
    const block = (src.match(/const remoteCmds = \[([\s\S]*?)\]\.join\(' && '\);/) || [])[1] || '';
    t.ok(block.length > 0, 'remoteCmds найден');
    const lines = block.split('\n').map(s => s.trim()).filter(s => s.startsWith('`') || s.startsWith('pruneFind'));
    const bad = lines.filter(l => l.startsWith('`') && /\|\|/.test(l) && !/^`\(/.test(l) && !/^`if /.test(l));
    t.eq(bad.length, 0, 'каждое «X || Y» в цепочке взято в скобки (|| true не глотает ошибки шагов)');
    t.ok(!/"/.test(block.replace(/\$\{[^}]*\}/g, '')), 'внутри цепочки нет двойных кавычек');
    const rmIdx = block.indexOf('rm -f /tmp/${ARCHIVE_NAME}');
    const reloadIdx = block.indexOf('pm2 reload');
    t.ok(rmIdx > reloadIdx && reloadIdx > 0, 'архив удаляется в самом конце (повтор после обрыва SSH возможен)');
    t.ok(block.indexOf('guard-anti-rollback') < block.indexOf('rsync -a --delete'), 'guard проверяет код до подмены каталога');
    t.ok(/healthcheck\.js/.test(block), 'после рестарта ждём /healthz');
    t.ok(/status === 255/.test(src), 'повтор SSH — только при сбое соединения');
    t.ok(/-path \$\{REMOTE_DIR\}\/node_modules -prune/.test(src), 'чистка find не заходит в node_modules');
  }
};
