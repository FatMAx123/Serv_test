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
  // Клиент со всеми функциями разработчика: GM-сборка вырезает часть дев-страниц и данных —
  // докладываем из client/ весь код (js, css, shared, data) и все страницы-инструменты.
  // Без релизного флага __PS_RELEASE_BUILD: работают F2-редактор, F3 HUD, F4 инспектор, панель тестов.
  const SRC = path.join(ROOT, 'client'), DST = path.join(out, 'client');
  const JUNK = /\.(mp4|avi|mkv|webm|blend\d?|zip|rar|7z|bak|tmp|log|map)$/i;
  let extra = { files: 0, bytes: 0 };
  for (const dir of ['js', 'css', 'shared', 'data']) {
    if (!fs.existsSync(path.join(SRC, dir))) continue;
    const r = copyTree(path.join(SRC, dir), path.join(DST, dir), (n) => JUNK.test(n) || n === 'node_modules' || n === '.git');
    extra.files += r.files; extra.bytes += r.bytes;
  }
  const pages = [];
  for (const it of fs.readdirSync(SRC, { withFileTypes: true })) {
    if (!it.isFile() || JUNK.test(it.name) || !/\.(html|js|css|json|ico|webmanifest)$/i.test(it.name)) continue;
    fs.copyFileSync(path.join(SRC, it.name), path.join(DST, it.name));
    extra.files++; extra.bytes += fs.statSync(path.join(SRC, it.name)).size;
    if (/\.html$/i.test(it.name)) pages.push(it.name);
  }
  // локальные GM-профили (data/local_*.json с accessLevel ≥ 50): в дев-сборке сразу есть GM
  // для F2-редактора и GM-команд (например RepairTester → game.html?server=localhost:8080)
  const ROOT_DATA = path.join(ROOT, 'data');
  if (fs.existsSync(ROOT_DATA)) {
    for (const n of fs.readdirSync(ROOT_DATA)) {
      if (!/^local_.*\.json$/.test(n)) continue;
      try {
        const prof = JSON.parse(fs.readFileSync(path.join(ROOT_DATA, n), 'utf8'));
        if ((prof.accessLevel | 0) >= 50) { fs.mkdirSync(path.join(out, 'data'), { recursive: true }); fs.copyFileSync(path.join(ROOT_DATA, n), path.join(out, 'data', n)); }
      } catch (e) { /* не профиль */ }
    }
  }
  pages.sort();
  fs.writeFileSync(path.join(DST, 'dev-tools.html'), '<!doctype html><meta charset="utf-8"><title>Dev-инструменты</title>' +
    '<style>body{background:#0b1016;color:#e6edf3;font:14px Segoe UI,sans-serif;padding:24px}a{color:#ffbb55;display:block;padding:4px 0}h1{color:#ffdd88;font-size:18px}</style>' +
    '<h1>Project Steam — дев-сборка ' + VERSION + '</h1><p>Всё — на локальный сервер localhost:8080.</p>' +
    '<a href="menu.html?server=localhost:8080">▶ Меню → персонажи → игра (с дев-UI: F2 редактор, F3 HUD, F4 инспектор)</a>' +
    '<a href="editor.html">🛠 3D-редактор сцены</a><h1>Все страницы клиента</h1>' +
    pages.map(p => '<a href="' + p + (/^(game|menu|character-select|index)\.html$/.test(p) ? '?server=localhost:8080' : '') + '">' + p + '</a>').join('') + '\n');
  st.files += extra.files + 1; st.bytes += extra.bytes;
  // Старые батники и лаунчер GM-сборки ведут не туда (меню без ?server= уходит на боевой сервер,
  // ссылки client/... на сервере 404, редактор без EDITOR_ENABLED=1 закрыт) — заменяем своими
  for (const n of ['start-all.bat', 'start-server.bat', 'start-client.bat', 'launcher.html', 'index.html']) fs.rmSync(path.join(out, n), { force: true });
  const BAT_HEAD = ['@echo off', 'chcp 65001 >nul', 'setlocal', 'cd /d "%~dp0"'];
  const SERVER_CMD = 'set EDITOR_ENABLED=1&& set ALLOW_INSECURE_DEV=1&& set HOST=127.0.0.1&& set PORT=8080&& node server\\server.js';
  const URLS = ['echo   Игра (меню):     http://localhost:8080/menu.html?server=localhost:8080',
    'echo   3D-редактор:     http://localhost:8080/editor.html',
    'echo   Дев-инструменты: http://localhost:8080/dev-tools.html'];
  const bat = (lines) => BAT_HEAD.concat(lines, ['']).join('\r\n');
  fs.writeFileSync(path.join(out, 'start-dev-server.bat'), bat([
    'title Project Steam DEV server ' + VERSION,
    'netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1',
    'if not errorlevel 1 (', '  echo [ERROR] Порт 8080 уже занят: остановите другой сервер.', '  pause', '  exit /b 1', ')',
    'echo Дев-сервер ' + VERSION + ' на localhost:8080 (редактор включён)'].concat(URLS, [SERVER_CMD, 'pause'])));
  fs.writeFileSync(path.join(out, 'start-dev-client.bat'), bat([
    'netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1',
    'if errorlevel 1 (', '  echo [ERROR] Дев-сервер не запущен: сначала start-dev-server.bat', '  pause', '  exit /b 1', ')',
    'start "" "http://localhost:8080/menu.html?server=localhost:8080"'].concat(URLS)));
  fs.writeFileSync(path.join(out, 'start-dev.bat'), bat([
    'netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1',
    'if not errorlevel 1 (', '  echo [ERROR] Порт 8080 уже занят: остановите другой сервер.', '  pause', '  exit /b 1', ')',
    'start "Project Steam DEV server ' + VERSION + '" cmd /k "' + SERVER_CMD + '"',
    'echo Ожидание сервера...',
    'for /l %%i in (1,1,30) do (', '  netstat -ano | findstr ":8080" | findstr LISTENING >nul 2>&1 && goto :ready', '  ping -n 2 127.0.0.1 >nul', ')',
    'echo [ERROR] Сервер не поднялся за 30 с — смотрите окно сервера.', 'pause', 'exit /b 1',
    ':ready',
    'start "" "http://localhost:8080/menu.html?server=localhost:8080"'].concat(URLS)));
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
  'if not exist "%VER%\\start-dev.bat" (',
  '  echo [ERROR] Дев-сборка "%VER%" не найдена. Собрать: node scripts\\build-local.js --dev',
  '  echo Доступные версии:',
  '  dir /b /ad',
  '  pause',
  '  exit /b 1',
  ')',
  'call "%VER%\\start-dev.bat"',
  ''
].join('\r\n');
fs.mkdirSync(BUILDS, { recursive: true });
fs.writeFileSync(path.join(BUILDS, 'start-dev.bat'), START_DEV, 'utf8');
fs.writeFileSync(path.join(BUILDS, 'README.md'), [
  '# Локальные сборки (в git и продакшен не попадают)',
  '',
  '- `clean/<версия>/client/` — чистый клиент, ровно то, что уходит на Render. Редактора и дев-инструментов нет.',
  '- `dev/<версия>/` — дев-сборка: сервер, 3D-редактор, библиотеки, клиент с дев-UI. Внутри: `start-dev.bat` (сервер + игра), `start-dev-server.bat`, `start-dev-client.bat` — всё на localhost:8080.',
  '- `*/LATEST` — последняя версия; в каждой версии `BUILD-INFO.json` (коммит, дата, размер, незакоммиченные файлы).',
  '- Версия: `v<package.version>-<ГГГГММДД-ЧЧММ>-<коммит>[-dirty]`. Хранятся последние ' + KEEP + ' версий каждого вида.',
  '',
  'Собрать: `node scripts/build-local.js` (`--clean` / `--dev` — только одну).',
  'Запустить дев-сборку: `builds\\start-dev.bat` (последняя) или `builds\\start-dev.bat <версия>`.',
  ''
].join('\n'));
console.log('▶  Запуск дев-сборки: builds\\start-dev.bat  (или builds\\start-dev.bat <версия>)');
