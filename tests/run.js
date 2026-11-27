// ============================================================
//  TESTS / RUN.JS — минимальный раннер без зависимостей.
//  Запуск: npm test           (все файлы tests/*.test.js)
//          npm test unit      (только tests/unit.test.js)
//  Нужен, потому что shared/* — чистые функции: BLOCK_CAP поймался бы
//  первым же тестом, а его не было полгода.
// ============================================================
'use strict';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
if (!process.env.ALLOW_INSECURE_DEV) process.env.ALLOW_INSECURE_DEV = '1';
if (!process.env.DEV_GUEST_GM) process.env.DEV_GUEST_GM = '1';
if (!process.env.METRICS_PUBLIC) process.env.METRICS_PUBLIC = '1';
if (!process.env.MOD_SECRET) process.env.MOD_SECRET = 'ps-stress-perf-2026';
if (!process.env.KEY_LEGACY_CREATE) process.env.KEY_LEGACY_CREATE = '1';
if (!process.env.ALLOW_DEFAULT_KEY_SECRETS) process.env.ALLOW_DEFAULT_KEY_SECRETS = '1';
if (!process.env.TRUST_PROXY) process.env.TRUST_PROXY = '1';
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  console.log('\n— ' + name);
}

function ok(cond, name, info) {
  if (cond) {
    passed++;
    console.log('  ok   ' + name + (info ? '  (' + info + ')' : ''));
  } else {
    failed++;
    failures.push(currentSuite + ' → ' + name + (info ? '  (' + info + ')' : ''));
    console.log('  FAIL ' + name + (info ? '  (' + info + ')' : ''));
  }
}

function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(a === e, name, a === e ? '' : 'получено ' + a + ', ожидалось ' + e);
}

/** Приблизительное равенство для формул с плавающей точкой. */
function near(actual, expected, eps, name) {
  const d = Math.abs(actual - expected);
  ok(d <= eps, name, d <= eps ? '' : 'получено ' + actual + ', ожидалось ' + expected + ' ±' + eps);
}

function throws(fn, name) {
  let thrown = false;
  try { fn(); } catch (e) { thrown = true; }
  ok(thrown, name);
}

function noThrow(fn, name) {
  try { fn(); ok(true, name); }
  catch (e) { ok(false, name, e && e.message); }
}

const api = { suite, ok, eq, near, throws, noThrow };

const filter = process.argv[2] || '';
const files = fs.readdirSync(HERE)
  .filter(f => /\.test\.js$/.test(f))
  .filter(f => !filter || f.indexOf(filter) >= 0)
  .sort();

if (!files.length) {
  console.error('Тестов не найдено' + (filter ? ' по фильтру "' + filter + '"' : ''));
  process.exit(1);
}

// Тесты гоняют server/db.js на настоящем data/ проекта. Реестр логинов разработчика
// (data/account_keys.json; его же копируют дев-сборки) после прогона оставался тестовым:
// локальные логины («bulka» → свой персонаж) пропадали, вход создавал пустой аккаунт.
// Снимок до тестов → после тестов (и после сброса очередей записи) файл возвращается байт в байт.
const PROTECTED = ['account_keys.json', 'account_keys.json.bak'].map(n => path.join(HERE, '..', 'data', n));
const protectedSnap = PROTECTED.map(f => { try { return fs.readFileSync(f); } catch (_) { return null; } });
async function restoreProtected() {
  try {
    const dbPath = require.resolve(path.join(HERE, '..', 'server', 'db.js'));
    const DB = require.cache[dbPath] && require.cache[dbPath].exports;
    if (DB && typeof DB.flush === 'function') await DB.flush();
  } catch (_) { /* db не грузился */ }
  restoreProtectedFiles();
}
function restoreProtectedFiles() {
  PROTECTED.forEach((f, i) => {
    try {
      const cur = fs.existsSync(f) ? fs.readFileSync(f) : null;
      if (protectedSnap[i] && (!cur || !cur.equals(protectedSnap[i]))) {
        fs.writeFileSync(f, protectedSnap[i]);
        console.log('↩ восстановлен после тестов: data/' + path.basename(f));
      } else if (!protectedSnap[i] && cur) {
        fs.unlinkSync(f);
      }
    } catch (e) { console.error('не удалось вернуть data/' + path.basename(f) + ':', e && e.message); }
  });
}
// Ctrl+C посреди прогона — тоже вернуть
process.on('SIGINT', () => { restoreProtectedFiles(); process.exit(130); });

(async () => {
  for (const f of files) {
    console.log('\n══ ' + f + ' ══');
    const mod = require(path.join(HERE, f));
    try {
      await mod(api);
    } catch (e) {
      failed++;
      const msg = f + ' (неперехваченное исключение: ' + (e && (e.stack || e.message) || e) + ')';
      failures.push(msg);
      console.error('  FAIL ' + msg);
    }
  }
  await restoreProtected();
  console.log('\n' + (failed ? 'ПРОВАЛЕНО' : 'OK') + ': ' + passed + ' пройдено, ' + failed + ' провалено');
  if (failures.length) {
    console.log('\nПровалившиеся проверки:');
    failures.forEach(f => console.log('  · ' + f));
  }
  process.exit(failed ? 1 : 0);
})().catch(async e => {
  console.error('\nОшибка раннера:', e && e.stack || e);
  await restoreProtected();
  process.exit(2);
});
