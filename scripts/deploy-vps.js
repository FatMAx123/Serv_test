/**
 * Скрипт автоматического деплоя Project Steam на VPS Яндекс Облака.
 * Использование: node scripts/deploy-vps.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VPS_HOST = '217.179.49.236';
const VPS_USER = 'root';
const SSH_KEY = path.join(process.env.USERPROFILE || process.env.HOME, '.ssh', 'id_ed25519').replace(/\\/g, '/');
const REMOTE_DIR = '/var/www/project-steam';
const ARCHIVE_NAME = 'temp_deploy_package.tar.gz';

// Геодата, которую сервер читает из клиентской папки (server.js → loadWorldGeo):
// меш террейна, высоты, коллизии пропсов и стены. Остальной клиент серверу не нужен.
const SERVER_CLIENT_FILES = [
  'client/data/mesh/terrain.bin',
  'client/js/mesh-bin.js',
  'client/js/terrain-data.js',
  'client/js/terrain-height.js',
  'client/js/props-library-data.js',
  'client/js/props-collision.js',
  'client/js/walls-data.js'
];
// Служебные скрипты VPS: проверка инвариантов, healthcheck деплоя, watchdog (PM2-приложение)
const SERVER_SCRIPTS = [
  'scripts/guard-anti-rollback.js',
  'scripts/healthcheck.js',
  'scripts/watchdog.js'
];

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

if (process.env.SKIP_TESTS !== '1') {
  console.log('🧪 [DEPLOY] Прогон полного набора тестов перед упаковкой...');
  execSync('node tests/run.js', { stdio: 'inherit' });
}

console.log('🚀 [DEPLOY] Сборка ультра-компактного пакета для VPS ' + VPS_HOST + '...');

try {
  // Исключаем гигабайтные бэкапы внутри data, raw 3D модели, архивы, медиа и файлы секретов
  const excludes = [
    '--exclude="data/*_backup*.json"',
    '--exclude="data/*_tmp*.json"',
    '--exclude="data/bot3k_*.json"',
    '--exclude="data/stress_bot_*.json"',
    '--exclude="data/account_keys*.json*"',
    '--exclude="data/account_keys*.bak"',
    '--exclude="data/players.json*"',
    '--exclude="data/characters.json*"',
    '--exclude="data/clans.json*"',
    '--exclude="data/clans/*"',
    '--exclude="data/clans"', // и сам каталог (иначе в архив попадала пустая запись data/clans/)
    '--exclude="data/gm-access.json*"',
    '--exclude="data/moderation/*"',
    '--exclude="data/moderation"',
    // Журналы атомарных переносов — локальное состояние: на VPS их доиграл бы сервер поверх боевых профилей
    '--exclude="data/_txn/*"',
    '--exclude="data/_txn"',
    '--exclude="data/local_*.json*"',
    '--exclude="data/*.json"',
    '--exclude="data/*.json.*"',
    '--exclude="data/*.bak"',
    '--exclude="data/*.tmp*"',
    '--exclude="data/.secrets.env"',
    '--exclude="*.secrets.env"',
    '--exclude=".env*"',
    '--exclude="*.blend*"',
    '--exclude="*.zip"',
    '--exclude="*.rar"',
    '--exclude="*.mp4"',
    '--exclude="*.pdf"',
    '--exclude="*.fbx"',
    '--exclude="*.tga"',
    // Редактор мира — только локальная машина: его серверные модули, рабочий файл и бэкапы
    // на прод не едут. Сервер читает запечённый мир shared/world-data.json.
    '--exclude="server/editor-guard.js"',
    '--exclude="server/editor-overrides-writer.js"',
    '--exclude="server/http/editor-api.js"',
    '--exclude="server/static-http.js"',
    '--exclude="shared/editor-overrides*"',
    '--exclude="shared/terrain-paint-*"'
  ].join(' ');

  // ЧИСТЫЙ ПРОД-СЕРВЕР: только код сервера, C++ аддон, данные мира и геодата.
  // Клиент (HTML/JS/ассеты), редактор, шоурум, дев-меню, стресс-тесты и инструменты сборки
  // на VPS не едут: клиент раздаёт Render (SERVE_CLIENT=0), GM-сборка с редактором — только
  // на локальной машине (npm run build:gm).
  const targets = [
    'server',
    'shared',
    'data',
    'native',
    'binding.gyp',
    'deploy',
    'package.json',
    'package-lock.json',
    'ecosystem.config.js',
    ...SERVER_CLIENT_FILES,
    ...SERVER_SCRIPTS
  ].join(' ');

  // Созданное в редакторе — часть мира: перед упаковкой мир перепекается из рабочего файла
  execSync('node scripts/bake-world.js', { stdio: 'inherit' });

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

  // 3. Распаковываем во временный staging-каталог, ставим зависимости и собираем C++, затем атомарно обновляем и перезапускаем PM2
  console.log('⚙️ [DEPLOY] Сборка и атомарное обновление приложения на VPS...');
  const stageDir = '/var/www/.ps_deploy_stage';
  // ВАЖНО: в remoteCmds — только одинарные кавычки. Вся цепочка передаётся ssh в двойных кавычках,
  // и внутренние двойные кавычки (cmd.exe/bash) снимались: шаблоны find уходили без кавычек.
  // Цепочка идемпотентна (архив удаляется только в самом конце) — повтор после обрыва SSH безопасен.
  // Каждое «X || Y» — в скобках: в цепочке «a && b || true && c» `|| true` глотал ошибку ЛЮБОГО
  // предыдущего шага (не собрался аддон → деплой всё равно рапортовал успех).
  const pruneFind = (pattern) => `(find ${REMOTE_DIR} -path ${REMOTE_DIR}/node_modules -prune -o -type f -name '${pattern}' -exec rm -f {} + 2>/dev/null || true)`;
  const remoteCmds = [
    `mkdir -p ${REMOTE_DIR} /var/log/project-steam`,
    `rm -rf ${stageDir} && mkdir -p ${stageDir}`,
    `tar -xzf /tmp/${ARCHIVE_NAME} -C ${stageDir}`,
    `cd ${stageDir}`,
    `if [ -d ${REMOTE_DIR}/node_modules ] && cmp -s ${stageDir}/package-lock.json ${REMOTE_DIR}/package-lock.json 2>/dev/null && cmp -s ${stageDir}/package.json ${REMOTE_DIR}/package.json 2>/dev/null; then ln -sfn ${REMOTE_DIR}/node_modules ${stageDir}/node_modules; else npm install --omit=dev; fi`,
    `npx node-gyp rebuild`,
    // Инварианты проверяются на распакованном коде ДО подмены рабочего каталога и рестарта
    // (--server: на VPS нет клиента — его инварианты проверены локально перед упаковкой)
    `node scripts/guard-anti-rollback.js --server`,
    `if [ -L ${stageDir}/node_modules ]; then rm -f ${stageDir}/node_modules; elif [ -d ${stageDir}/node_modules ]; then rm -rf ${REMOTE_DIR}/node_modules && mv ${stageDir}/node_modules ${REMOTE_DIR}/node_modules; fi`,
    // Код сервера — точная копия репозитория: удалённые из git модули не остаются на VPS.
    // Серверный файл-состояние crash.log не трогаем.
    `rsync -a --delete --exclude crash.log ${stageDir}/server/ ${REMOTE_DIR}/server/`,
    // shared/ — точная копия пакета: рабочий файл редактора, его бэкапы и карты покраски
    // (остатки прошлых деплоев) удаляются — прод читает только shared/world-data.json
    `rsync -a --delete ${stageDir}/shared/ ${REMOTE_DIR}/shared/`,
    // client/ и scripts/ на VPS — ровно серверный набор: остатки прошлых деплоев (весь клиентский
    // JS, стресс-тест, CSV-доки, инструменты сборки/конвертации) удаляются
    `rsync -a --delete ${stageDir}/client/ ${REMOTE_DIR}/client/`,
    `rsync -a --delete ${stageDir}/scripts/ ${REMOTE_DIR}/scripts/`,
    // НЕ cp -rf: он перезаписывает файлы на месте (тот же inode), а запущенные воркеры держат
    // build/Release/project_steam_native.node отображённым в память — смена его кода под ними
    // давала SIGSEGV всех воркеров на каждом деплое ДО graceful-остановки (несохранённый прогресс
    // терялся). rsync пишет во временный файл и делает rename (новый inode) — процессы живут на
    // старой копии до штатного pm2 reload.
    `rsync -a ${stageDir}/ ${REMOTE_DIR}/`,
    `rm -rf ${stageDir}`,
    `cd ${REMOTE_DIR}`,
    // MEDIUM-6: игровой процесс — от пользователя steam (ecosystem.config.js: uid/gid), не от root.
    `(id -u steam >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin steam)`,
    `chown -R steam:steam ${REMOTE_DIR}/data`,
    `touch ${REMOTE_DIR}/server/crash.log && chown steam:steam ${REMOTE_DIR}/server/crash.log`,
    `(pm2 reload ecosystem.config.js --update-env || pm2 restart ecosystem.config.js --update-env || pm2 start ecosystem.config.js)`,
    // Деплой успешен только когда сервер реально поднялся (все зоны кластера в строю)
    `node scripts/healthcheck.js --timeout=150`,
    `pm2 save`,
    `pm2 status`,
    // чистка мусора — мимо node_modules (раньше find -name '*Copy*' удалял и файлы пакетов)
    pruneFind('*копия*'),
    pruneFind('*Copy*'),
    pruneFind('*.zip'),
    `node scripts/guard-anti-rollback.js --server`,
    `rm -f /tmp/${ARCHIVE_NAME}`
  ].join(' && ');

  const sshCmd = `ssh -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o StrictHostKeyChecking=accept-new -i "${SSH_KEY}" ${VPS_USER}@${VPS_HOST} "${remoteCmds}"`;

  let sshOk = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(sshCmd, { stdio: 'inherit' });
      sshOk = true;
      break;
    } catch (sshErr) {
      // Повтор только при сбое самого SSH (код 255: соединение/аутентификация). Ошибка шага
      // на сервере (сборка, guard, healthcheck) — не сетевой сбой: повтор её не исправит.
      const sshTransport = sshErr && sshErr.status === 255;
      if (attempt < 3 && sshTransport) {
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
    try { fs.unlinkSync(ARCHIVE_NAME); } catch (_) { }
  }
}
