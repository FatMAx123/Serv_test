// ============================================================
//  SCRIPTS / SYNC-CLIENT-VPS.JS
//  Мгновенная синхронизация измененных клиентских файлов на боевой VPS (93.77.168.135)
//  с последующим горячим перезапуском PM2.
// ============================================================
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SSH_KEY = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519').replace(/\\/g, '/');
const VPS_HOST = '93.77.168.135';
const VPS_USER = 'baldman';
const REMOTE_DIR = '/var/www/project-steam';

console.log('============================================================');
console.log('⚡ [SYNC-CLIENT-VPS] Быстрая синхронизация клиента на VPS');
console.log('============================================================\n');

if (!fs.existsSync(SSH_KEY)) {
  console.error(`❌ SSH-ключ не найден по пути: ${SSH_KEY}`);
  process.exit(1);
}

// Упаковываем все активные клиентские скрипты, стили и HTML страницы во временный архив
const BUNDLE_TAR = 'temp_client_sync.tar.gz';
const localTarPath = path.join(ROOT, BUNDLE_TAR);

console.log('📦 Упаковка клиентских скриптов (js/), стилей (css/) и HTML страниц...');
try {
  // Исключаем .map файлы и временные файлы, включаем оверрайды мира
  const tarCmd = `tar --exclude="*.map" --exclude="*.tmp*" -czf "${localTarPath}" -C "${ROOT}" client/js client/css client/*.html shared/editor-overrides.json`;
  execSync(tarCmd, { stdio: 'pipe' });
  const szKb = (fs.statSync(localTarPath).size / 1024).toFixed(0);
  console.log(`  ✓ Архив подготовлен (${szKb} KB)`);
} catch (packErr) {
  console.error(`❌ Ошибка упаковки клиентских файлов: ${packErr.message}`);
  process.exit(1);
}

// Передаем одним SCP-соединением
console.log('📤 Передача пакета на VPS...');
try {
  const scpCmd = `scp -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new "${localTarPath}" ${VPS_USER}@${VPS_HOST}:/tmp/${BUNDLE_TAR}`;
  execSync(scpCmd, { stdio: 'pipe' });
  console.log('  ✓ Пакет доставлен на VPS');
} catch (scpErr) {
  if (fs.existsSync(localTarPath)) fs.unlinkSync(localTarPath);
  console.error(`❌ Ошибка передачи на VPS: ${scpErr.message}`);
  process.exit(1);
} finally {
  if (fs.existsSync(localTarPath)) fs.unlinkSync(localTarPath);
}

// Небольшая пауза для сброса счетчика соединений sshd
execSync('node -e "setTimeout(() => {}, 3000)"');

// Распаковываем на VPS и перезапускаем PM2
console.log('🔄 Распаковка на VPS и горячий рестарт PM2...');
try {
  const remoteCmd = [
    `tar -xzf /tmp/${BUNDLE_TAR} -C ${REMOTE_DIR}`,
    `rm -f /tmp/${BUNDLE_TAR}`,
    `pm2 reload ${REMOTE_DIR}/ecosystem.config.js || pm2 restart ${REMOTE_DIR}/ecosystem.config.js`
  ].join(' && ');

  const sshCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new ${VPS_USER}@${VPS_HOST} "${remoteCmd}"`;
  execSync(sshCmd, { stdio: 'inherit' });
  console.log('\n🎉 [SYNC-CLIENT-VPS] Успешно завершено! 100% клиентского кода на VPS обновлено.\n');
} catch (err) {
  console.error(`❌ Ошибка на VPS: ${err.message}`);
  process.exit(1);
}
