// ============================================================
//  SCRIPTS / AUTO-DEPLOY-ALL.JS
//  Единый конвейер авто-коммита, локальной сборки билда и деплоя:
//  - Сборка клиента в локальную папку dist/client/
//  - Деплой клиента на Render.com (ветка render-client)
//  - Синхронизация клиента и/или сервера на боевой VPS (217.179.49.236)
//  - Коммит и пуш в ветку main на GitHub
// ============================================================
'use strict';

const { execSync, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const msgArg = process.argv.slice(2).join(' ').trim();
const commitMessage = msgArg || `Auto-deploy: client & server updates [${new Date().toISOString().slice(0, 19).replace('T', ' ')}]`;

console.log('============================================================');
console.log('🚀 [AUTO-DEPLOY-ALL] Запуск полного цикла коммита и деплоя');
console.log('============================================================\n');

// 1. Проверка архитектурных инвариантов и тестов
console.log('🛡️  [1/6] Проверка инвариантов Zero Rollback Policy...');
execFileSync(process.execPath, ['scripts/guard-anti-rollback.js'], { cwd: ROOT, stdio: 'inherit' });
if (process.env.SKIP_TESTS !== '1') {
  console.log('🧪 [1b/6] Прогон полного набора тестов...');
  execFileSync(process.execPath, ['tests/run.js'], { cwd: ROOT, stdio: 'inherit' });
}

// 2. Определение затронутых компонентов (рабочая копия + локальные коммиты относительно origin/main)
const gitStatusRaw = (function() {
  try { return execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }) || ''; } catch (_) { return ''; }
})();
const gitDiffCommittedRaw = (function() {
  try { return execSync('git diff --name-only origin/main..HEAD', { cwd: ROOT, encoding: 'utf8' }) || ''; } catch (_) { return ''; }
})();
const serverTriggers = ['server/', 'data/', 'native/', 'shared/', 'binding.gyp', 'ecosystem.config.js', 'package.json'];
const changedFiles = [
  ...gitStatusRaw.split('\n').map(line => line.slice(3).trim()).filter(Boolean),
  ...gitDiffCommittedRaw.split('\n').map(line => line.trim()).filter(Boolean)
];
const hasServerMods = changedFiles.some(file =>
  serverTriggers.some(t => file.startsWith(t))
);

// 3. Коммит изменений в git (ветка main)
console.log('\n💾 [2/6] Коммит изменений в git (ветка main)...');
try {
  execFileSync('git', ['add', '-A'], { cwd: ROOT, stdio: 'inherit' });
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (status) {
    execFileSync('git', ['commit', '-m', commitMessage], { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ✓ Закоммичено: "${commitMessage}"`);
  } else {
    console.log('  ✓ Нет незакоммиченных изменений в рабочей копии');
  }
} catch (e) {
  console.error('❌ Ошибка при git commit:', e.message);
  process.exit(1);
}

// 4. Локальная сборка релизного клиента (dist/client) и GM-билда (dist/gm)
console.log('\n📦 [3/6] Локальная сборка релизного клиента (dist/client) и GM-билда (dist/gm)...');
execFileSync(process.execPath, ['scripts/build-client.js'], { cwd: ROOT, stdio: 'inherit' });
if (fs.existsSync(path.join(ROOT, 'scripts', 'build-gm.js'))) {
  execFileSync(process.execPath, ['scripts/build-gm.js'], { cwd: ROOT, stdio: 'inherit' });
}

// 5. Деплой клиента на Render.com
console.log('\n🌐 [4/6] Деплой релизного клиента на Render.com (ветка render-client)...');
try {
  execFileSync(process.execPath, ['scripts/deploy-render.js', commitMessage], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('❌ Ошибка деплоя на Render:', e.message);
  process.exit(1);
}

// 6. Синхронизация или полный деплой на боевой VPS (217.179.49.236)
console.log('\n🖥️  [5/6] Деплой/синхронизация на боевой VPS (217.179.49.236)...');
try {
  if (hasServerMods) {
    console.log('⚡ Обнаружены изменения сервера/C++/БД — выполняется полный деплой VPS (deploy-vps.js)...');
    execFileSync(process.execPath, ['scripts/deploy-vps.js'], { cwd: ROOT, stdio: 'inherit', env: Object.assign({}, process.env, { SKIP_TESTS: '1' }) });
  } else {
    console.log('⚡ Изменения только в клиенте — выполняется быстрая синхронизация клиента (sync-client-vps.js)...');
    execFileSync(process.execPath, ['scripts/sync-client-vps.js'], { cwd: ROOT, stdio: 'inherit' });
  }
} catch (e) {
  console.error('❌ Ошибка деплоя на VPS:', e.message);
  process.exit(1);
}

// 7. Пуш в git main
console.log('\n⬆️  [6/6] Пуш изменений в GitHub (origin main)...');
try {
  execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
  console.log('  ✓ origin/main успешно обновлен');
} catch (e) {
  console.error('❌ Ошибка при git push origin main:', e.message);
  process.exit(1);
}

console.log('\n🎉 [AUTO-DEPLOY-ALL] Полный цикл сборки, коммита и двойного деплоя завершен на 100%!\n');
