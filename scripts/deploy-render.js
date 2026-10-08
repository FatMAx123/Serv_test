// ============================================================
//  SCRIPTS / DEPLOY-RENDER.JS
//  Автоматическая сборка чистого игрового клиента и деплой на Render.com
//  Создает чистый релиз без редактора и пушит в ветку render-client на GitHub
// ============================================================
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'client');
const TARGET_BRANCH = 'render-client';

console.log('============================================================');
console.log('🚀 [DEPLOY-RENDER] Запуск деплоя клиента Project Steam на Render.com');
console.log('============================================================\n');

// 1. Сборка чистого клиента без редактора
console.log('📦 [1/4] Сборка релизного клиента без редактора и тяжелых исходников...');
execSync('node scripts/build-client.js', { cwd: ROOT, stdio: 'inherit' });

if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  console.error('❌ Ошибка: директория dist/client не создана или пуста!');
  process.exit(1);
}

// 2. Получение URL origin из основного репозитория
console.log('\n🔗 [2/4] Получение конфигурации git origin...');
let originUrl = '';
try {
  originUrl = execSync('git config --get remote.origin.url', { cwd: ROOT, encoding: 'utf8' }).trim();
} catch (e) {
  console.error('❌ Не удалось получить remote.origin.url:', e.message);
  process.exit(1);
}

// 3. Инициализация временного git в dist/client и пуш в ветку render-client
console.log(`\n📤 [3/4] Подготовка ветки ${TARGET_BRANCH} для Render.com...`);
const distGitDir = path.join(DIST_DIR, '.git');
if (fs.existsSync(distGitDir)) {
  fs.rmSync(distGitDir, { recursive: true, force: true });
}

// Создаем .nojekyll (чтобы Three.js и WebP файлы не фильтровались)
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

execSync('git init', { cwd: DIST_DIR, stdio: 'pipe' });
execSync('git config user.name "Project Steam Deployer"', { cwd: DIST_DIR, stdio: 'pipe' });
execSync('git config user.email "deploy@project-steam.local"', { cwd: DIST_DIR, stdio: 'pipe' });
execSync(`git remote add origin "${originUrl}"`, { cwd: DIST_DIR, stdio: 'pipe' });
execSync('git add -A', { cwd: DIST_DIR, stdio: 'pipe' });

const commitMsg = `Release client build [${new Date().toISOString()}] - no editor, pure game client`;
execSync(`git commit -m "${commitMsg}"`, { cwd: DIST_DIR, stdio: 'pipe' });

console.log(`🚀 Пуш релизного клиента в origin/${TARGET_BRANCH}...`);
try {
  execSync(`git push -f origin HEAD:${TARGET_BRANCH}`, { cwd: DIST_DIR, stdio: 'inherit' });
  console.log(`\n✅ Ветка ${TARGET_BRANCH} успешно обновлена на GitHub!`);
} catch (pushErr) {
  console.error('\n❌ Ошибка при пуше в GitHub:', pushErr.message);
  process.exit(1);
} finally {
  // Очистка .git из папки dist/client, чтобы локальный билд оставался чистым
  if (fs.existsSync(distGitDir)) {
    fs.rmSync(distGitDir, { recursive: true, force: true });
  }
}

// 4. Проверка и вызов Render Deploy Hook (если настроен)
console.log('\n🔔 [4/4] Проверка Render Deploy Hook...');
const hookUrl = process.env.RENDER_DEPLOY_HOOK || '';
if (hookUrl && hookUrl.startsWith('http')) {
  try {
    console.log('📡 Вызов Render Deploy Hook для мгновенного обновления...');
    execSync(`curl -fsS -X POST "${hookUrl}"`, { stdio: 'inherit' });
    console.log('✅ Render Deploy Hook успешно вызван! Сайт обновляется.');
  } catch (hookErr) {
    console.warn('⚠️ Ошибка вызова Render Deploy Hook:', hookErr.message);
  }
} else {
  console.log('ℹ️ Render Deploy Hook не задан в RENDER_DEPLOY_HOOK.');
  console.log('   (Если в Render включен "Auto-Deploy: Yes", деплой начнется автоматически от push на GitHub!)');
}

console.log('\n============================================================');
console.log('🎉 [DEPLOY-RENDER_OK] Деплой успешно завершен!');
console.log(`   Ветка:             ${TARGET_BRANCH}`);
console.log('   Dashboard Render:  https://dashboard.render.com/');
console.log('   Настройки Static Site в Render:');
console.log('     • Branch:             render-client');
console.log('     • Build Command:      (оставить пустым)');
console.log('     • Publish Directory:  .');
console.log('============================================================\n');
