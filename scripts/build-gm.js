// ============================================================
//  SCRIPTS / BUILD-GM.JS
//  Сборка ультра-чистого GM / Редакторского билда Project Steam
//  Включает полноценный 3D Level Editor Studio (editor.html),
//  клиент игры с правами GM (F2 редактор), полную библиотеку 360+ моделей
//  пропсов и иконок без сырца и мусора (без .blend, .mp4, дубликатов PNG).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');
const DIST_GM_DIR = path.join(ROOT, 'dist', 'gm');
const DIST_SHARED_DIR = path.join(ROOT, 'dist', 'shared');

console.log('============================================================');
console.log('🛠️ [BUILD-GM] Сборка чистого GM-билда с 3D Редактором сцены');
console.log('============================================================\n');

// 1. Индексация исходников для выявления используемых ассетов
console.log('🔍 Индексация исходного кода (клиент, редактор, shared)...');
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

// 2. Получаем список моделей пропсов: размещенные в мире + весь каталог редактора (363 модели)
const usedPropsFbx = new Set();

// 2.1. Размещенные в мире пропсы из editor-overrides.json
const overridesPath = path.join(SHARED_DIR, 'editor-overrides.json');
if (fs.existsSync(overridesPath)) {
  try {
    const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));
    (overrides.customProps || []).forEach(x => {
      const m = x.modelFile || (x.modelId ? (x.modelId.endsWith('.fbx') ? x.modelId : x.modelId + '.fbx') : x.meshType);
      if (m) usedPropsFbx.add(m.endsWith('.fbx') ? m : m + '.fbx');
    });
  } catch (e) {
    console.warn('⚠️ Ошибка чтения editor-overrides.json:', e.message);
  }
}

// 2.2. Модели из библиотеки PropsLibrary (Content Browser)
try {
  const lib = require(path.join(CLIENT_DIR, 'js', 'props-library-data.js'));
  const catalog = (typeof lib.getAll === 'function') ? lib.getAll() : [];
  catalog.forEach(item => {
    if (item.file) {
      usedPropsFbx.add(item.file.endsWith('.fbx') ? item.file : item.file + '.fbx');
    }
  });
  console.log(`📦 Всего доступно моделей в библиотеке редактора: ${catalog.length}`);
} catch (e) {
  console.warn('⚠️ Не удалось загрузить каталог props-library-data.js:', e.message);
}
console.log(`🌲 Всего включено 3D-моделей пропсов в GM-билд: ${usedPropsFbx.size}`);

// 3. Активные боевые модели оружия
const activeWeaponFbx = new Set(['novice.fbx', 'magic_mace.fbx']);

// 4. HTML файлы для GM билда (клиент + редактор + базы данных знаний)
const GM_HTML_FILES = [
  'editor.html',
  'game.html',
  'menu.html',
  'character-select.html',
  'database.html',
  'weapons-database.html',
  'armor-database.html',
  'skills-database.html',
  'crafting-database.html',
  'mobs-database.html',
  'promo.html',
  '404.html',
  'favicon.ico',
  'robots.txt'
];

let totalFiles = 0;
let totalBytes = 0;

function copyFileSafe(src, dest) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
  totalFiles++;
  totalBytes += fs.statSync(dest).size;
}

function copyDirFiltered(srcDir, destDir, fileFilter) {
  if (!fs.existsSync(srcDir)) return;
  for (const it of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, it.name);
    const destPath = path.join(destDir, it.name);
    if (it.isDirectory()) {
      if (it.name === '_raw' || it.name === 'node_modules' || it.name === '.git' || it.name.endsWith('.fbm') || it.name === 'raw') continue;
      // Пропускаем сырые исходники паков моделей в props
      if (it.name.startsWith('psx-plants') || it.name.startsWith('retro_nature') || it.name.startsWith('ultimate_retro') || it.name.includes('_low')) continue;
      copyDirFiltered(srcPath, destPath, fileFilter);
    } else if (it.isFile()) {
      if (!fileFilter || fileFilter(it.name, srcPath)) {
        copyFileSafe(srcPath, destPath);
      }
    }
  }
}

// Очистка старой директории dist/gm
if (fs.existsSync(DIST_GM_DIR)) {
  console.log('🧹 Очистка предыдущего GM-билда dist/gm...');
  fs.rmSync(DIST_GM_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_GM_DIR, { recursive: true });

// 1. Копирование HTML файлов
console.log('📄 Копирование экранов (editor.html, game.html, menu.html, БД)...');
for (const htmlFile of GM_HTML_FILES) {
  const src = path.join(CLIENT_DIR, htmlFile);
  if (fs.existsSync(src)) {
    if (htmlFile === 'menu.html') {
      // Модифицируем menu.html: добавляем кнопку быстрого входа в 3D Редактор для GM
      let menuContent = fs.readFileSync(src, 'utf8');
      if (!menuContent.includes('editor.html')) {
        menuContent = menuContent.replace(
          '<nav class="mm-nav">',
          '<nav class="mm-nav">\n      <a href="editor.html" class="mm-btn" style="text-decoration:none;display:flex;align-items:center;justify-content:center;color:#ffaa44;border-color:rgba(255,170,68,0.6);" title="3D Game Engine Studio (Level Editor)">⚙️ 3D Редактор (GM)</a>'
        );
      }
      const dest = path.join(DIST_GM_DIR, htmlFile);
      fs.writeFileSync(dest, menuContent, 'utf8');
      totalFiles++;
      totalBytes += fs.statSync(dest).size;
    } else {
      copyFileSafe(src, path.join(DIST_GM_DIR, htmlFile));
    }
  }
}

// Стильный GM Лаунчер-Портал в index.html
const gmIndexHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Project Steam — GM & Studio Launcher</title>
<link rel="icon" type="image/x-icon" href="favicon.ico">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: radial-gradient(circle at 50% 20%, #1c212a, #0d0f13 90%);
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .launcher-card {
    background: rgba(27, 30, 36, 0.85);
    border: 1px solid #323844;
    border-radius: 12px;
    padding: 32px 40px;
    max-width: 680px;
    width: 100%;
    box-shadow: 0 16px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08);
    backdrop-filter: blur(10px);
    text-align: center;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    background: rgba(255, 170, 68, 0.15);
    color: #ffaa44;
    border: 1px solid rgba(255, 170, 68, 0.3);
    margin-bottom: 16px;
  }
  h1 {
    font-size: 26px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #f3f4f6;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  p.sub {
    color: #9ca3af;
    font-size: 14px;
    margin-bottom: 28px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  @media (max-width: 580px) {
    .grid { grid-template-columns: 1fr; }
  }
  .btn-choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 20px;
    border-radius: 8px;
    text-decoration: none;
    background: #242830;
    border: 1px solid #383f4d;
    transition: all 0.2s ease;
    cursor: pointer;
    text-align: left;
  }
  .btn-choice:hover {
    transform: translateY(-2px);
    border-color: #ffaa44;
    box-shadow: 0 8px 24px rgba(255, 170, 68, 0.15);
  }
  .btn-choice.editor {
    border-color: rgba(255, 170, 68, 0.5);
    background: linear-gradient(135deg, rgba(255, 170, 68, 0.08), #242830 70%);
  }
  .btn-choice.editor:hover {
    border-color: #ffaa44;
    background: linear-gradient(135deg, rgba(255, 170, 68, 0.15), #242830 70%);
  }
  .btn-choice .icon {
    font-size: 28px;
    margin-bottom: 8px;
  }
  .btn-choice .title {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
  }
  .btn-choice .desc {
    font-size: 12px;
    color: #9ca3af;
    line-height: 1.4;
  }
  .footer-links {
    display: flex;
    justify-content: center;
    gap: 20px;
    font-size: 13px;
    color: #6b7280;
    border-top: 1px solid #232730;
    padding-top: 18px;
  }
  .footer-links a {
    color: #9ca3af;
    text-decoration: none;
    transition: color 0.15s;
  }
  .footer-links a:hover {
    color: #ffaa44;
  }
</style>
</head>
<body>
  <div class="launcher-card">
    <div class="badge">GM & Engine Studio Suite</div>
    <h1>Project Steam: Origins</h1>
    <p class="sub">Автономная среда разработки, редактора локаций и GM-клиента</p>

    <div class="grid">
      <a href="editor.html" class="btn-choice editor">
        <div class="icon">⚙️</div>
        <div class="title">3D Game Studio</div>
        <div class="desc">Полноэкранный редактор мира. 360+ моделей, кисть леса, спавн мобов, трансформация и свет.</div>
      </a>
      <a href="menu.html" class="btn-choice">
        <div class="icon">🎮</div>
        <div class="title">Игровой Клиент</div>
        <div class="desc">Полнофункциональная игра с правами GM. Нажмите F2 в игре для мгновенного редактора сцены.</div>
      </a>
    </div>

    <div class="footer-links">
      <a href="character-select.html">👤 Выбор персонажа</a>
      <a href="database.html">📖 База знаний</a>
      <a href="promo.html">📺 Промо / Devlog</a>
    </div>
  </div>
</body>
</html>`;
fs.writeFileSync(path.join(DIST_GM_DIR, 'index.html'), gmIndexHtml, 'utf8');
const redirect404 = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=index.html"><title>Project Steam GM</title><script>location.replace('index.html');</script></head><body></body></html>`;
fs.writeFileSync(path.join(DIST_GM_DIR, '404.html'), redirect404, 'utf8');
fs.writeFileSync(path.join(DIST_GM_DIR, '.nojekyll'), '', 'utf8');

// 2. Стили CSS (включая стили редактора editor-engine.css)
console.log('🎨 Копирование стилей CSS (включая Unreal/Godot UI редактора)...');
copyDirFiltered(path.join(CLIENT_DIR, 'css'), path.join(DIST_GM_DIR, 'css'), name => name.endsWith('.css'));

// 3. Данные мира (террейн, геодата, классы)
console.log('🗺️ Копирование данных террейна, мешей и классов...');
const unneededDataTextures = new Set([
  'Map.webp',
  'Map1.webp',
  'leaves.webp',
  'thatch.webp',
  'grass.webp',
  'bark.webp',
  'plaster.webp',
  'wood.webp',
  '{dlv_tapestry7c.webp',
  '{dlv_tapestry3d.webp',
  'dlv_stonebrk4d.webp',
  'dlv_stonebrk1b.webp',
  'volcano_rock_cliff.webp',
  'volcano_rock_slate.webp',
  'Forest_Floor_sfjmafua_1K_BaseColor.webp',
  'Ground_Roots_vliucgi_1K_BaseColor.webp'
]);

copyDirFiltered(path.join(CLIENT_DIR, 'data'), path.join(DIST_GM_DIR, 'data'), (name, fullPath) => {
  if (name.endsWith('.fbx')) return false;
  if (name === 'terrain-mesh.json') return false;
  if (name.startsWith('Путеводитель')) return false;
  if (name.startsWith('local_') && name.endsWith('.json')) return false;
  if (name.startsWith('Improve_world_map_')) return false;
  const normalized = fullPath.replace(/\\/g, '/');
  if (normalized.includes('/textures/city')) return false;
  if (normalized.includes('/data/textures/') && unneededDataTextures.has(name)) return false;
  return true;
});

// 4. Скрипты JS (ВКЛЮЧАЯ editor.js, editor-engine-layout.js, props-library-data.js)
console.log('⚙️ Копирование движка Three.js, скриптов игры и модулей РЕДАКТОРА...');
copyDirFiltered(path.join(CLIENT_DIR, 'js'), path.join(DIST_GM_DIR, 'js'), name => {
  if (name.endsWith('.map')) return false;
  return name.endsWith('.js') || name.endsWith('.json');
});

// 5. Shared-библиотеки мира и правил игры (копируем в dist/gm/shared и зеркалируем в dist/shared)
console.log('🌐 Копирование shared-библиотек (правила боя, дропа, статы мобов, оверрайды мира)...');
fs.mkdirSync(DIST_SHARED_DIR, { recursive: true });
fs.mkdirSync(path.join(DIST_GM_DIR, 'shared'), { recursive: true });

copyDirFiltered(SHARED_DIR, path.join(DIST_GM_DIR, 'shared'), name => {
  if (name.endsWith('.bak') || name.includes('.bak')) return false;
  return name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.png');
});
copyDirFiltered(SHARED_DIR, DIST_SHARED_DIR, name => {
  if (name.endsWith('.bak') || name.includes('.bak')) return false;
  return name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.png');
});

// 6. HUD
console.log('🖥️ Копирование HUD...');
const unneededHudDebuffs = new Set([
  'blind.webp', 'burn.webp', 'dot.webp', 'charm.webp', 'def.webp',
  'pdef.webp', 'oil.webp', 'slow.webp', 'paralyze.webp', 'silence.webp',
  'test_immortal.webp'
]);
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'hud'), path.join(DIST_GM_DIR, 'assets', 'hud'), (name, fullPath) => {
  if (name.endsWith('.txt') || name.endsWith('.json')) return false;
  if (name.includes('_raw')) return false;
  if (name.endsWith('.png')) return false;
  if (/^cursor_\d+\./i.test(name) || /^cursor_attack_\d+\./i.test(name)) return false;
  const normalized = fullPath.replace(/\\/g, '/');
  if (normalized.includes('/hud/debuffs/') && unneededHudDebuffs.has(name)) return false;
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || (baseName.length > 2 && allCodeText.includes(baseName));
});

// 7. Аудио
console.log('🔊 Копирование аудио...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'audio'), path.join(DIST_GM_DIR, 'assets', 'audio'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});

// 8. Мобы
console.log('👾 Копирование мобов...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'mobs'), path.join(DIST_GM_DIR, 'assets', 'mobs'), name => {
  if (name.endsWith('.mp4') || name.endsWith('.md')) return false;
  if (name.endsWith('.png')) return false;
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 9. NPC
console.log('🧙 Копирование NPC...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'npc'), path.join(DIST_GM_DIR, 'assets', 'npc'), name => {
  if (name.endsWith('.png')) return false;
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 10. Навыки
console.log('✨ Копирование навыков...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'skills'), path.join(DIST_GM_DIR, 'assets', 'skills'), name => {
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 11. Предметы, броня, меню, текстуры
console.log('🛡️ Копирование экипировки, инвентаря и текстур...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'armor'), path.join(DIST_GM_DIR, 'assets', 'armor'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'inventar'), path.join(DIST_GM_DIR, 'assets', 'inventar'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'menu'), path.join(DIST_GM_DIR, 'assets', 'menu'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'classes'), path.join(DIST_GM_DIR, 'assets', 'classes'));
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'textures', 'webp'), path.join(DIST_GM_DIR, 'assets', 'textures', 'webp'));

// 12. Персонаж engi/man
console.log('👤 Копирование боевого персонажа...');
const charSrc = path.join(CLIENT_DIR, 'assets', 'Characters', 'engi', 'man');
const charDest = path.join(DIST_GM_DIR, 'assets', 'Characters', 'engi', 'man');
copyDirFiltered(path.join(charSrc, 'assets'), path.join(charDest, 'assets'));
copyDirFiltered(path.join(charSrc, 'Textures'), path.join(charDest, 'Textures'));

// 13. Оружие
console.log('⚔️ Копирование 3D-оружия (GLB/FBX)...');
const wpModelsDir = path.join(CLIENT_DIR, 'assets', 'weapons', 'models');
if (fs.existsSync(wpModelsDir)) {
  for (const m of fs.readdirSync(wpModelsDir)) {
    if (m.endsWith('.glb') || activeWeaponFbx.has(m)) {
      copyFileSafe(path.join(wpModelsDir, m), path.join(DIST_GM_DIR, 'assets', 'weapons', 'models', m));
      const base = path.parse(m).name;
      const texPath = path.join(CLIENT_DIR, 'assets', 'weapons', 'textures', base + '.webp');
      if (fs.existsSync(texPath)) copyFileSafe(texPath, path.join(DIST_GM_DIR, 'assets', 'weapons', 'textures', base + '.webp'));
    }
  }
}

// 14. Пропсы и Редактор: ВСЕ 363 модели каталога + размещенные + ВСЕ иконки Content Browser
console.log('🌲 Копирование ВСЕХ 3D-моделей библиотеки редактора (360+ FBX)...');
let copiedFbx = 0;
usedPropsFbx.forEach(f => {
  const p = path.join(CLIENT_DIR, 'assets', 'props', f);
  if (fs.existsSync(p)) {
    copyFileSafe(p, path.join(DIST_GM_DIR, 'assets', 'props', f));
    copiedFbx++;
  }
});
console.log(`  ✓ Скопировано моделей FBX: ${copiedFbx}`);

console.log('🖼️ Копирование иконок каталога для Content Browser (370+ превью)...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'props', 'icons'), path.join(DIST_GM_DIR, 'assets', 'props', 'icons'));
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'props', 'icons_weapon'), path.join(DIST_GM_DIR, 'assets', 'props', 'icons_weapon'));

console.log('🎨 Копирование WebP-текстур пропсов (только оптимизированные WebP, без сырых PNG)...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'props', 'textures'), path.join(DIST_GM_DIR, 'assets', 'props', 'textures'), name => {
  return name.endsWith('.webp');
});

const sizeMb = (totalBytes / 1024 / 1024).toFixed(2);
console.log('\n============================================================');
console.log('🎉 [BUILD-GM_OK] Чистый GM / Редакторский билд успешно собран!');
console.log(`   Файлов в билде: ${totalFiles}`);
console.log(`   Размер билда:   ${sizeMb} MB (весь сырец, видео и мусор исключены)`);
console.log('   Папка билда:    dist/gm/');
console.log('   Точка входа:    dist/gm/index.html (GM Launcher)');
console.log('   3D Редактор:    dist/gm/editor.html');
console.log('   Игровой клиент: dist/gm/menu.html');
console.log('============================================================\n');
