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

// Ключевые файлы клиента для синхронизации
const clientFiles = [
  'client/menu.html',
  'client/character-select.html',
  'client/game.html',
  'client/index.html',
  'client/promo.html',
  'client/database.html',
  'client/js/menu-page.js',
  'client/js/char-select.js',
  'client/js/char-select-room.js',
  'client/js/boot.module.js',
  'client/js/main.js',
  'client/js/net-ws.js',
  'client/js/config.js',
  'client/js/char-model.js',
  'client/js/player.js',
  'client/js/ui.js',
  'client/css/menu.css',
  'client/css/game.css'
];

let syncedCount = 0;
for (const relPath of clientFiles) {
  const localFile = path.join(ROOT, relPath);
  if (!fs.existsSync(localFile)) continue;

  const remoteTarget = `${REMOTE_DIR}/${relPath.replace(/\\/g, '/')}`;
  try {
    const scpCmd = `scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${localFile}" ${VPS_USER}@${VPS_HOST}:${remoteTarget}`;
    execSync(scpCmd, { stdio: 'pipe' });
    console.log(`  ✓ ${relPath} → VPS`);
    syncedCount++;
  } catch (err) {
    console.warn(`  ⚠️ Ошибка при копировании ${relPath}: ${err.message}`);
  }
}

console.log(`\n✅ Синхронизировано файлов: ${syncedCount}`);
console.log('🔄 Перезапуск процессов PM2 на VPS...');
try {
  const restartCmd = `ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ${VPS_USER}@${VPS_HOST} "pm2 restart ${REMOTE_DIR}/ecosystem.config.js"`;
  execSync(restartCmd, { stdio: 'inherit' });
  console.log('🎉 [SYNC-CLIENT-VPS] Успешно завершено! Клиент на VPS обновлен.\n');
} catch (err) {
  console.error(`❌ Ошибка перезапуска PM2: ${err.message}`);
  process.exit(1);
}
