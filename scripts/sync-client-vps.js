// ============================================================
//  SCRIPTS / SYNC-CLIENT-VPS.JS
//  Мгновенная синхронизация измененных клиентских файлов на боевой VPS (93.77.168.135)
//  с последующим горячим перезапуском PM2.
// ============================================================
'use strict';

const { execSync, spawnSync } = require('child_process');
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
  // Исключаем .map файлы и временные файлы, включаем оверрайды мира, сервер и shared
  const tarCmd = `tar --exclude="*.map" --exclude="*.tmp*" -czf "${localTarPath}" -C "${ROOT}" server shared client/js client/css client/*.html`;
  execSync(tarCmd, { stdio: 'pipe' });
  const szKb = (fs.statSync(localTarPath).size / 1024).toFixed(0);
  console.log(`  ✓ Архив подготовлен (${szKb} KB)`);
} catch (packErr) {
  console.error(`❌ Ошибка упаковки клиентских файлов: ${packErr.message}`);
  process.exit(1);
}

// Пауза перед передачей для сброса счетчика соединений sshd
execSync('node -e "setTimeout(() => {}, 12000)"');

// Передаем одним SCP-соединением (с повторной попыткой при сбросе порта)
console.log('📤 Передача пакета на VPS...');
let transferred = false;
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const scpCmd = `scp -i "${SSH_KEY}" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "${localTarPath}" ${VPS_USER}@${VPS_HOST}:/tmp/${BUNDLE_TAR}`;
    execSync(scpCmd, { stdio: 'inherit' });
    transferred = true;
    console.log('  ✓ Пакет доставлен на VPS');
    break;
  } catch (scpErr) {
    if (attempt < 3) {
      console.warn(`  ⚠️ Попытка ${attempt} не удалась, ожидание 15 секунд перед повтором...`);
      execSync('node -e "setTimeout(() => {}, 15000)"');
    } else {
      if (fs.existsSync(localTarPath)) fs.unlinkSync(localTarPath);
      console.error(`❌ Ошибка передачи на VPS: ${scpErr.message}`);
      process.exit(1);
    }
  }
}
if (fs.existsSync(localTarPath)) fs.unlinkSync(localTarPath);

// Пауза перед SSH для сброса счетчика соединений sshd
execSync('node -e "setTimeout(() => {}, 18000)"');

// Распаковываем на VPS и перезапускаем PM2
console.log('🔄 Распаковка на VPS и горячий рестарт PM2...');
const remoteCmd = [
  `tar -xzf /tmp/${BUNDLE_TAR} -C ${REMOTE_DIR}`,
  `rm -f /tmp/${BUNDLE_TAR}`,
  `pm2 reload ${REMOTE_DIR}/ecosystem.config.js || pm2 restart ${REMOTE_DIR}/ecosystem.config.js`
].join(' && ');

for (let attempt = 1; attempt <= 3; attempt++) {
  const res = spawnSync('ssh', ['-i', SSH_KEY, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', `${VPS_USER}@${VPS_HOST}`, remoteCmd], { stdio: 'inherit' });
  if (res.status === 0) {
    console.log('\n🎉 [SYNC-CLIENT-VPS] Успешно завершено! 100% клиентского кода на VPS обновлено.\n');
    process.exit(0);
  }
  if (attempt < 3) {
    console.warn(`  ⚠️ SSH попытка ${attempt} не удалась (код ${res.status}), ожидание 18 секунд перед повтором...`);
    execSync('node -e "setTimeout(() => {}, 18000)"');
  } else {
    console.error(`❌ Ошибка на VPS: SSH remote execution exited with code ${res.status}`);
    process.exit(1);
  }
}
