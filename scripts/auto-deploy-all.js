// ============================================================
//  SCRIPTS / AUTO-DEPLOY-ALL.JS
//  Единый конвейер авто-коммита, локальной сборки билда и деплоя:
//  - Сборка клиента в локальную папку dist/client/
//  - Деплой клиента на Render.com (ветка render-client)
//  - Синхронизация клиента и/или сервера на боевой VPS (93.77.168.135)
//  - Коммит и пуш в ветку main на GitHub
// ============================================================
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const msgArg = process.argv.slice(2).join(' ').trim();
const commitMessage = msgArg || `Auto-deploy: client & server updates [${new Date().toISOString().slice(0, 19).replace('T', ' ')}]`;

console.log('============================================================');
console.log('🚀 [AUTO-DEPLOY-ALL] Запуск полного цикла коммита и деплоя');
console.log('============================================================\n');

// 1. Проверка архитектурных инвариантов
console.log('🛡️  [1/6] Проверка инвариантов Zero Rollback Policy...');
execSync('node scripts/guard-anti-rollback.js', { cwd: ROOT, stdio: 'inherit' });

// 2. Локальная сборка клиента в dist/client
console.log('\n📦 [2/6] Локальная сборка релизного клиента (dist/client)...');
execSync('node scripts/build-client.js', { cwd: ROOT, stdio: 'inherit' });

// 3. Деплой клиента на Render.com
console.log('\n🌐 [3/6] Деплой релизного клиента на Render.com (ветка render-client)...');
try {
  execSync('node scripts/deploy-render.js', { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.warn('⚠️ Ошибка деплоя на Render:', e.message);
}

// 4. Синхронизация или полный деплой на боевой VPS (93.77.168.135)
console.log('\n🖥️  [4/6] Деплой/синхронизация на боевой VPS (93.77.168.135)...');
try {
  const gitStatusRaw = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }) || '';
  const serverTriggers = ['server/', 'data/', 'native/', 'shared/', 'binding.gyp', 'ecosystem.config.js', 'package.json'];
  const hasServerMods = gitStatusRaw.split('\n').some(line => {
    const file = line.slice(3).trim();
    return serverTriggers.some(t => file.startsWith(t));
  });

  if (hasServerMods) {
    console.log('⚡ Обнаружены изменения сервера/C++/БД — выполняется полный деплой VPS (deploy-vps.js)...');
    execSync('node scripts/deploy-vps.js', { cwd: ROOT, stdio: 'inherit' });
  } else {
    console.log('⚡ Изменения только в клиенте — выполняется быстрая синхронизация клиента (sync-client-vps.js)...');
    execSync('node scripts/sync-client-vps.js', { cwd: ROOT, stdio: 'inherit' });
  }
} catch (e) {
  console.warn('⚠️ Ошибка деплоя на VPS:', e.message);
}

// 5. Коммит в git main
console.log('\n💾 [5/6] Коммит изменений в git (ветка main)...');
try {
  execSync('git add -A', { cwd: ROOT, stdio: 'inherit' });
  const status = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8' }).trim();
  if (status) {
    execSync(`git commit -m "${commitMessage}"`, { cwd: ROOT, stdio: 'inherit' });
    console.log(`  ✓ Закоммичено: "${commitMessage}"`);
  } else {
    console.log('  ✓ Нет незакоммиченных изменений в рабочей копии');
  }
} catch (e) {
  console.warn('⚠️ Замечание при git commit:', e.message);
}

// 6. Пуш в git main
console.log('\n⬆️  [6/6] Пуш изменений в GitHub (origin main)...');
try {
  execSync('git push origin main', { cwd: ROOT, stdio: 'inherit' });
  console.log('  ✓ origin/main успешно обновлен');
} catch (e) {
  console.error('❌ Ошибка при git push origin main:', e.message);
  process.exit(1);
}

console.log('\n🎉 [AUTO-DEPLOY-ALL] Полный цикл сборки, коммита и двойного деплоя завершен на 100%!\n');
