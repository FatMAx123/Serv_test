// ============================================================
//  SCRIPTS / AUDIT-CLIENT-ASSETS.JS
//  Полный аудит всех ассетов клиента на фактическое использование в коде игры
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST_ASSETS = path.join(ROOT, 'dist', 'client', 'assets');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');

console.log('🔍 [ASSET-AUDIT] Сбор всех файлов исходного кода для поиска ссылок...');

// Собираем весь текст кода и JSON конфигураций в единую строку/буфер
let allCodeText = '';

function collectText(dir) {
  if (!fs.existsSync(dir)) return;
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const sp = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name === 'node_modules' || it.name === '.git' || it.name === 'assets') continue;
      collectText(sp);
    } else if (/\.(js|html|css|json)$/i.test(it.name)) {
      allCodeText += '\n' + fs.readFileSync(sp, 'utf8');
    }
  }
}

collectText(CLIENT_DIR);
collectText(SHARED_DIR);

console.log(`📚 Проиндексировано символов кода: ${allCodeText.length.toLocaleString()}`);

// Сканируем все файлы в dist/client/assets
function scanDir(dir) {
  let list = [];
  if (!fs.existsSync(dir)) return list;
  for (const it of fs.readdirSync(dir, { withFileTypes: true })) {
    const sp = path.join(dir, it.name);
    if (it.isDirectory()) {
      list = list.concat(scanDir(sp));
    } else if (it.isFile()) {
      list.push(sp);
    }
  }
  return list;
}

const allAssetFiles = scanDir(DIST_ASSETS);
console.log(`📦 Всего ассетов в dist/client/assets: ${allAssetFiles.length}`);

const report = {};
const toDelete = [];

for (const filePath of allAssetFiles) {
  const relPath = path.relative(DIST_ASSETS, filePath).replace(/\\/g, '/');
  const topFolder = relPath.split('/')[0];
  const fileName = path.basename(filePath);
  const baseName = path.parse(fileName).name;

  if (!report[topFolder]) {
    report[topFolder] = { total: 0, used: 0, unused: 0, unusedFiles: [], unusedBytes: 0 };
  }
  report[topFolder].total++;

  // Специальные правила для отдельных типов:
  // 1. engi/man: все FBX анимации и корневые GLB - балласт
  if (relPath.startsWith('Characters/engi/man/')) {
    if (fileName.endsWith('.fbx') || (!relPath.includes('/assets/') && fileName.endsWith('.glb'))) {
      report[topFolder].unused++;
      const sz = fs.statSync(filePath).size;
      report[topFolder].unusedBytes += sz;
      report[topFolder].unusedFiles.push(relPath);
      toDelete.push(filePath);
      continue;
    }
  }

  // 2. Проверка упоминания в коде:
  // Проверяем:
  // а) Полное имя файла (например 'icon_attack.webp')
  // б) Имя без расширения (например 'icon_attack' в id или ключах)
  const isUsed = allCodeText.includes(fileName) || (baseName.length > 2 && allCodeText.includes(baseName));

  if (isUsed) {
    report[topFolder].used++;
  } else {
    report[topFolder].unused++;
    const sz = fs.statSync(filePath).size;
    report[topFolder].unusedBytes += sz;
    report[topFolder].unusedFiles.push(relPath);
    toDelete.push(filePath);
  }
}

console.log('\n============================================================');
console.log('📊 РЕЗУЛЬТАТЫ АУДИТА ИСПОЛЬЗОВАНИЯ АССЕТОВ ПО ПАПКАМ');
console.log('============================================================');

for (const [folder, stat] of Object.entries(report)) {
  const mb = (stat.unusedBytes / 1024 / 1024).toFixed(2);
  console.log(`📁 ${folder.padEnd(15)} | Всего: ${String(stat.total).padStart(4)} | Используется: ${String(stat.used).padStart(4)} | НЕ используется: ${String(stat.unused).padStart(4)} (${mb} MB)`);
}

console.log('============================================================');
console.log(`🗑️ Всего кандидатов на удаление: ${toDelete.length} файлов`);
const totalUnusedMb = (toDelete.reduce((acc, f) => acc + fs.statSync(f).size, 0) / 1024 / 1024).toFixed(2);
console.log(`💾 Будет освобождено: ${totalUnusedMb} MB`);
console.log('============================================================\n');

// Сохраняем подробный JSON для инспекции
fs.writeFileSync(path.join(ROOT, 'scratch', 'unused-assets-report.json'), JSON.stringify(report, null, 2), 'utf8');
