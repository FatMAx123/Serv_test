// ============================================================
//  TESTS / RUN.JS — минимальный раннер без зависимостей.
//  Запуск: npm test           (все файлы tests/*.test.js)
//          npm test unit      (только tests/unit.test.js)
//  Нужен, потому что shared/* — чистые функции: BLOCK_CAP поймался бы
//  первым же тестом, а его не было полгода.
// ============================================================
'use strict';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
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
  console.log('\n' + (failed ? 'ПРОВАЛЕНО' : 'OK') + ': ' + passed + ' пройдено, ' + failed + ' провалено');
  if (failures.length) {
    console.log('\nПровалившиеся проверки:');
    failures.forEach(f => console.log('  · ' + f));
  }
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('\nОшибка раннера:', e && e.stack || e);
  process.exit(2);
});
