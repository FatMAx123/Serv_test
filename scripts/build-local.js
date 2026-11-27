#!/usr/bin/env node
// ============================================================
//  SCRIPTS / BUILD-LOCAL.JS
//  Две локальные сборки с версиями (в продакшен не уходят):
//   1. builds/clean/<версия>/ — чистый клиент, ровно то, что уходит на Render (build-client.js);
//   2. builds/dev/<версия>/   — дев-сборка со всеми возможностями разработчика: сервер,
//      3D-редактор сцены, библиотеки моделей, GM-лаунчер (build-gm.js).
//  Запуск дев-сборки: builds/start-dev.bat [версия] (без версии — последняя).
//
//  node scripts/build-local.js            — обе сборки
//  node scripts/build-local.js --clean    — только чистый клиент
//  node scripts/build-local.js --dev      — только дев-сборка
//  KEEP_BUILDS=N — сколько версий каждого вида хранить (по умолчанию 5; старые удаляются).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BUILDS = path.join(ROOT, 'builds');
const KEEP = Math.max(1, parseInt(process.env.KEEP_BUILDS || '5', 10) || 5);
const onlyClean = process.argv.includes('--clean');
const onlyDev = process.argv.includes('--dev');
const doClean = !onlyDev || onlyClean;
const doDev = !onlyClean || onlyDev;

function git(args) {
  try { return execSync('git ' + args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; }
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const sha = git('rev-parse --short HEAD') || 'nogit';
const changed = git('status --porcelain').split(/\r?\n/).filter(Boolean);
const d = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const stamp = d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
const VERSION = 'v' + pkg.version + '-' + stamp + '-' + sha + (changed.length ? '-dirty' : '');

function copyTree(src, dst, skip) {
  let files = 0, bytes = 0;
  (function walk(s, t) {
    fs.mkdirSync(t, { recursive: true });
    for (const it of fs.readdirSync(s, { withFileTypes: true })) {
      if (skip && skip(it.name, s)) continue;
      const sp = path.join(s, it.name), tp = path.join(t, it.name);
      if (it.isDirectory()) walk(sp, tp);
      else if (it.isFile()) { fs.copyFileSync(sp, tp); files++; bytes += fs.statSync(sp).size; }
    }
  })(src, dst);
  return { files, bytes };
}
function writeInfo(dir, kind, stats, extra) {
  const info = Object.assign({
    kind, version: VERSION, builtAt: d.toISOString(), git: { commit: git('rev-parse HEAD'), branch: git('rev-parse --abbrev-ref HEAD') },
    uncommitted: changed, files: stats.files, sizeMB: +(stats.bytes / 1048576).toFixed(1)
  }, extra || {});
  fs.writeFileSync(path.join(dir, 'BUILD-INFO.json'), JSON.stringify(info, null, 2));
}
function finish(kind) {
  const base = path.join(BUILDS, kind);
  fs.writeFileSync(path.join(base, 'LATEST'), VERSION);
  const vers = fs.readdirSync(base, { withFileTypes: true }).filter(e => e.isDirectory() && /^v/.test(e.name)).map(e => e.name)
    .sort((a, b) => fs.statSync(path.join(base, a)).mtimeMs - fs.statSync(path.join(base, b)).mtimeMs);
  for (const old of vers.slice(0, Math.max(0, vers.length - KEEP))) {
    fs.rmSync(path.join(base, old), { recursive: true, force: true });
    console.log('🧹 [build-local] удалена старая сборка ' + kind + '/' + old);
  }
}
function run(script) { execFileSync(process.execPath, [path.join(ROOT, 'scripts', script)], { cwd: ROOT, stdio: 'inherit' }); }

console.log('============================================================');
console.log('📦 [BUILD-LOCAL] Локальные сборки ' + VERSION + (changed.length ? ' (есть незакоммиченные изменения: ' + changed.length + ')' : ''));
console.log('============================================================');

if (doClean) {
  run('build-client.js');
  const out = path.join(BUILDS, 'clean', VERSION, 'client');
  const st = copyTree(path.join(ROOT, 'dist', 'client'), out, (n) => n === '.git');
  writeInfo(path.dirname(out), 'clean', st, { note: 'Чистый клиент — то же, что уходит на Render (scripts/build-client.js). Редактора и дев-инструментов нет.' });
  finish('clean');
  console.log('✅ [build-local] чистый клиент: builds/clean/' + VERSION + '/client (' + (st.bytes / 1048576).toFixed(1) + ' МБ, ' + st.files + ' файлов)');
}

if (doDev) {
  run('build-gm.js');
  const out = path.join(BUILDS, 'dev', VERSION);
  // node_modules не копируем: Node находит их в корне проекта (builds/ лежит внутри него)
  const st = copyTree(path.join(ROOT, 'dist', 'gm'), out, (n, dir) => n === 'node_modules' && path.resolve(dir) === path.join(ROOT, 'dist', 'gm'));
  writeInfo(out, 'dev', st, { note: 'Дев-сборка: сервер + 3D-редактор сцены + библиотеки моделей + GM-лаунчер. Только локально. Запуск: builds/start-dev.bat' });
  finish('dev');
  console.log('✅ [build-local] дев-сборка: builds/dev/' + VERSION + ' (' + (st.bytes / 1048576).toFixed(1) + ' МБ, ' + st.files + ' файлов)');
}

// Запуск дев-сборки: последняя версия или указанная аргументом
const START_DEV = [
  '@echo off',
  'chcp 65001 >nul',
  'setlocal',
  'cd /d "%~dp0dev"',
  'set "VER=%~1"',
  'if "%VER%"=="" set /p VER=<LATEST',
  'if not exist "%VER%\\server\\server.js" (',
  '  echo [ERROR] Дев-сборка "%VER%" не найдена. Собрать: node scripts\\build-local.js --dev',
  '  echo Доступные версии:',
  '  dir /b /ad',
  '  pause',
  '  exit /b 1',
  ')',
  'title Project Steam DEV %VER%',
  'echo ============================================================',
  'echo   PROJECT STEAM: ORIGINS -- ДЕВ-СБОРКА %VER%',
  'echo   Сервер 127.0.0.1:8080 + 3D-редактор + библиотеки моделей',
  'echo ============================================================',
  'netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1',
  'if not errorlevel 1 (',
  '  echo [ERROR] Порт 8080 занят: остановите другой сервер и запустите снова.',
  '  pause',
  '  exit /b 1',
  ')',
  'cd /d "%~dp0dev\\%VER%"',
  'start "Project Steam DEV server %VER%" cmd /k "set EDITOR_ENABLED=1&& set ALLOW_INSECURE_DEV=1&& set HOST=127.0.0.1&& set PORT=8080&& node server\\server.js"',
  'echo Ожидание сервера...',
  'ping -n 4 127.0.0.1 >nul',
  'start "" "http://127.0.0.1:8080/launcher.html"',
  'echo Лаунчер:   http://127.0.0.1:8080/launcher.html',
  'echo Редактор:  http://127.0.0.1:8080/editor.html',
  'echo Игра:      http://127.0.0.1:8080/game.html?server=localhost:8080',
  'exit /b 0',
  ''
].join('\r\n');
fs.mkdirSync(BUILDS, { recursive: true });
fs.writeFileSync(path.join(BUILDS, 'start-dev.bat'), START_DEV, 'utf8');
fs.writeFileSync(path.join(BUILDS, 'README.md'), [
  '# Локальные сборки (в git и продакшен не попадают)',
  '',
  '- `clean/<версия>/client/` — чистый клиент, ровно то, что уходит на Render. Редактора и дев-инструментов нет.',
  '- `dev/<версия>/` — дев-сборка: сервер, 3D-редактор сцены, библиотеки моделей, GM-лаунчер.',
  '- `*/LATEST` — последняя версия; в каждой версии `BUILD-INFO.json` (коммит, дата, размер, незакоммиченные файлы).',
  '- Версия: `v<package.version>-<ГГГГММДД-ЧЧММ>-<коммит>[-dirty]`. Хранятся последние ' + KEEP + ' версий каждого вида.',
  '',
  'Собрать: `node scripts/build-local.js` (`--clean` / `--dev` — только одну).',
  'Запустить дев-сборку: `builds\\start-dev.bat` (последняя) или `builds\\start-dev.bat <версия>`.',
  ''
].join('\n'));
console.log('▶  Запуск дев-сборки: builds\\start-dev.bat  (или builds\\start-dev.bat <версия>)');
