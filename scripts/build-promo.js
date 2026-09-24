const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLIENT = path.join(ROOT, 'client');
const DIST = path.join(ROOT, 'dist');

console.log('🚀 Начинаем сборку лендинга Остров Стали: Истоки...');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      // Исключаем гигантские отладочные скриншоты
      if (entry.name === 'landing_full.png' || entry.name.endsWith('.tmp')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// 1. Очистка и создание dist/
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true, force: true });
}
fs.mkdirSync(DIST, { recursive: true });

// 2. Копирование promo.html -> dist/index.html и dist/promo.html
fs.copyFileSync(path.join(CLIENT, 'promo.html'), path.join(DIST, 'index.html'));
fs.copyFileSync(path.join(CLIENT, 'promo.html'), path.join(DIST, 'promo.html'));
console.log('✓ index.html и promo.html скопированы');

// 3. Копирование стилей
fs.mkdirSync(path.join(DIST, 'css'), { recursive: true });
fs.copyFileSync(path.join(CLIENT, 'css', 'promo.css'), path.join(DIST, 'css', 'promo.css'));
console.log('✓ css/promo.css скопирован');

// 4. Копирование скрипта
fs.mkdirSync(path.join(DIST, 'js'), { recursive: true });
fs.copyFileSync(path.join(CLIENT, 'js', 'promo.js'), path.join(DIST, 'js', 'promo.js'));
console.log('✓ js/promo.js скопирован');

// 5. Копирование данных
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
fs.copyFileSync(path.join(CLIENT, 'data', 'youtube-stats.json'), path.join(DIST, 'data', 'youtube-stats.json'));
console.log('✓ data/youtube-stats.json скопирован');

// 6. Копирование фавиконки, robots.txt и sitemap.xml
if (fs.existsSync(path.join(CLIENT, 'favicon.ico'))) {
  fs.copyFileSync(path.join(CLIENT, 'favicon.ico'), path.join(DIST, 'favicon.ico'));
  console.log('✓ favicon.ico скопирован');
}
if (fs.existsSync(path.join(CLIENT, 'robots.txt'))) {
  fs.copyFileSync(path.join(CLIENT, 'robots.txt'), path.join(DIST, 'robots.txt'));
  console.log('✓ robots.txt скопирован');
}
if (fs.existsSync(path.join(CLIENT, 'sitemap.xml'))) {
  fs.copyFileSync(path.join(CLIENT, 'sitemap.xml'), path.join(DIST, 'sitemap.xml'));
  console.log('✓ sitemap.xml скопирован');
}

// 7. Копирование картинок промо
copyDir(path.join(CLIENT, 'assets', 'promo_gen'), path.join(DIST, 'assets', 'promo_gen'));
console.log('✓ assets/promo_gen скопированы');

// 8. Копирование аудио
const audioDest = path.join(DIST, 'assets', 'audio', 'bgm');
fs.mkdirSync(audioDest, { recursive: true });
fs.copyFileSync(
  path.join(CLIENT, 'assets', 'audio', 'bgm', 'village_theme.ogg'),
  path.join(audioDest, 'village_theme.ogg')
);
console.log('✓ assets/audio/bgm/village_theme.ogg скопирован');

function getDirSize(dir) {
  let total = 0;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      total += getDirSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

const totalBytes = getDirSize(DIST);
const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
console.log(`🎉 Сборка завершена успешно! Папка dist/: ${totalMb} МБ`);
