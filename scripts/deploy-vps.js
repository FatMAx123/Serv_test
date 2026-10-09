/**
 * Скрипт автоматического деплоя Project Steam на VPS Яндекс Облака.
 * Использование: node scripts/deploy-vps.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VPS_HOST = '93.77.168.135';
const VPS_USER = 'baldman';
const SSH_KEY = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519').replace(/\\/g, '/');
const REMOTE_DIR = '/var/www/project-steam';
const ARCHIVE_NAME = 'temp_deploy_package.tar.gz';

// ============================================================
// 0. СТРОГИЙ АНТИ-ОТКАТНЫЙ БАРЬЕР: ПРОВЕРКА ВСЕХ ИНВАРИАНТОВ
// ============================================================
console.log('🛡️ [DEPLOY] Запуск строгой проверки архитектурных инвариантов перед деплоем...');
try {
  execSync('node scripts/guard-anti-rollback.js', { stdio: 'inherit' });
} catch (guardErr) {
  console.error('\n❌ [DEPLOY_FATAL] Деплой категорически заблокирован guard-anti-rollback!');
  console.error('Обнаружены нарушения инвариантов C++, uWS, Worker Threads или рендеринга клиента.');
  process.exit(1);
}

console.log('🚀 [DEPLOY] Сборка ультра-компактного пакета для VPS ' + VPS_HOST + '...');

try {
  // Исключаем гигабайтные бэкапы внутри data, raw 3D модели, архивы и медиа
  const excludes = [
    '--exclude="data/*_backup*.json"',
    '--exclude="data/*_tmp*.json"',
    '--exclude="data/bot3k_*.json"',
    '--exclude="data/stress_bot_*.json"',
    '--exclude="data/account_keys*.json*"',
    '--exclude="data/account_keys*.bak"',
    '--exclude="client/js/*.map"',
    '--exclude="*.blend*"',
    '--exclude="*.zip"',
    '--exclude="*.mp4"',
    '--exclude="*.pdf"',
    '--exclude="*.fbx"',
    '--exclude="*.tga"',
    '--exclude="client/data/models"',
    '--exclude="client/assets/props"',
    '--exclude="client/assets/weapons"'
  ].join(' ');

  // Включаем файлы игрового сервера, геодату и полный набор клиентских ассетов
  const targets = [
    'server',
    'shared',
    'data',
    'native',
    'binding.gyp',
    'client/js',
    'client/css',
    'client/*.html',
    'client/data/textures',
    'client/data/mesh',
    'client/data/terrain-paint-*.png',
    'client/data/editor-overrides.json',
    'client/favicon.ico',
    'deploy',
    'scripts',
    'package.json',
    'package-lock.json',
    'ecosystem.config.js'
  ].join(' ');

  console.log('📦 [DEPLOY] Создание tar.gz архива...');
  const tarCmd = `tar ${excludes} -czf ${ARCHIVE_NAME} ${targets}`;
  execSync(tarCmd, { stdio: 'inherit' });

  const stats = fs.statSync(ARCHIVE_NAME);
  console.log(`📦 [DEPLOY] Размер архива: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

  // Пауза перед передачей для сброса счетчика соединений sshd
  execSync('node -e "setTimeout(() => {}, 6000)"');

  // 2. Передаем архив на VPS через scp (с повторной попыткой при сбросе соединения sshd)
  console.log('📤 [DEPLOY] Быстрая передача на VPS по SSH...');
  const scpCmd = `scp -o ConnectTimeout=20 -o ServerAliveInterval=10 -o ServerAliveCountMax=6 -o StrictHostKeyChecking=accept-new -i "${SSH_KEY}" ${ARCHIVE_NAME} ${VPS_USER}@${VPS_HOST}:/tmp/${ARCHIVE_NAME}`;
  let scpOk = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      execSync(scpCmd, { stdio: 'inherit' });
      scpOk = true;
      break;
    } catch (scpErr) {
      if (attempt < 2) {
        console.warn(`  ⚠️ Попытка SCP ${attempt} не удалась, ожидание 8 секунд перед повтором...`);
        execSync('node -e "setTimeout(() => {}, 8000)"');
      } else {
        throw scpErr;
      }
    }
  }

  // Пауза перед SSH для сброса счетчика соединений sshd
  execSync('node -e "setTimeout(() => {}, 7000)"');

  // 3. Распаковываем на VPS, устанавливаем зависимости и перезапускаем PM2
  console.log('⚙️ [DEPLOY] Распаковка и обновление приложения на VPS...');
  const remoteCmds = [
    `mkdir -p ${REMOTE_DIR} /var/log/project-steam`,
    `tar -xzf /tmp/${ARCHIVE_NAME} -C ${REMOTE_DIR}`,
    `rm -f /tmp/${ARCHIVE_NAME}`,
    `cd ${REMOTE_DIR}`,
    `npm install --omit=dev`,
    `if [ -f build/Release/project_steam_native.node ]; then npx node-gyp build; else npx node-gyp rebuild; fi`,
    `pm2 reload ecosystem.config.js --update-env || pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js`,
    `pm2 save`,
    `pm2 status`,
    `find ${REMOTE_DIR} -name "*копия*" -delete 2>/dev/null || true`,
    `find ${REMOTE_DIR} -name "*Copy*" -delete 2>/dev/null || true`,
    `find ${REMOTE_DIR} -name "*.zip" -delete 2>/dev/null || true`,
    `node scripts/guard-anti-rollback.js`
  ].join(' && ');

  const sshCmd = `ssh -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o StrictHostKeyChecking=accept-new -i "${SSH_KEY}" ${VPS_USER}@${VPS_HOST} "${remoteCmds}"`;
  
  let sshOk = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(sshCmd, { stdio: 'inherit' });
      sshOk = true;
      break;
    } catch (sshErr) {
      if (attempt < 3) {
        console.warn(`  ⚠️ SSH попытка ${attempt} не удалась, ожидание 8 секунд перед повтором...`);
        execSync('node -e "setTimeout(() => {}, 8000)"');
      } else {
        throw sshErr;
      }
    }
  }

  console.log('✅ [DEPLOY] Деплой успешно завершен! Сервер запущен в PM2 на VPS.');
} catch (err) {
  console.error('❌ [DEPLOY_ERROR]:', err && err.message);
  process.exit(1);
} finally {
  if (fs.existsSync(ARCHIVE_NAME)) {
    try { fs.unlinkSync(ARCHIVE_NAME); } catch (_) {}
  }
}
