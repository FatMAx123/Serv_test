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

function copyDirTree(srcDir, destDir, fileFilter) {
  if (!fs.existsSync(srcDir)) return;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  for (const it of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, it.name);
    const destPath = path.join(destDir, it.name);
    if (it.isDirectory()) {
      if (fileFilter && !fileFilter(it.name, srcPath, true)) continue;
      copyDirTree(srcPath, destPath, fileFilter);
    } else if (it.isFile()) {
      if (!fileFilter || fileFilter(it.name, srcPath, false)) {
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
    background: radial-gradient(circle at 50% 20%, #1c212a, #0b0d11 90%);
    color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "JetBrains Mono", monospace;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
  }
  .launcher-card {
    background: rgba(23, 27, 34, 0.9);
    border: 1px solid #333a48;
    border-radius: 14px;
    padding: 36px 40px;
    max-width: 780px;
    width: 100%;
    box-shadow: 0 20px 50px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06);
    backdrop-filter: blur(12px);
    text-align: center;
  }
  .badge-row {
    display: flex;
    gap: 8px;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .badge.primary {
    background: rgba(255, 170, 68, 0.15);
    color: #ffaa44;
    border: 1px solid rgba(255, 170, 68, 0.35);
  }
  .badge.server {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.35);
  }
  .badge.simd {
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.35);
  }
  h1 {
    font-size: 28px;
    font-weight: 800;
    letter-spacing: 1px;
    color: #f9fafb;
    margin-bottom: 8px;
    text-transform: uppercase;
  }
  p.sub {
    color: #9ca3af;
    font-size: 14px;
    margin-bottom: 24px;
    line-height: 1.5;
  }
  .server-box {
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 10px;
    padding: 16px 20px;
    margin-bottom: 24px;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .server-box-title {
    font-size: 13px;
    font-weight: 700;
    color: #38bdf8;
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .server-box-desc {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.5;
  }
  .server-box-code {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 6px 12px;
    font-family: monospace;
    font-size: 12px;
    color: #e2e8f0;
    display: inline-block;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 28px;
  }
  @media (max-width: 600px) {
    .grid { grid-template-columns: 1fr; }
    .launcher-card { padding: 24px 20px; }
  }
  .btn-choice {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 18px 20px;
    border-radius: 10px;
    text-decoration: none;
    background: #20252e;
    border: 1px solid #333a48;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    text-align: left;
  }
  .btn-choice:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
  }
  .btn-choice.editor {
    border-color: rgba(255, 170, 68, 0.4);
    background: linear-gradient(135deg, rgba(255, 170, 68, 0.08), #20252e 70%);
  }
  .btn-choice.editor:hover {
    border-color: #ffaa44;
    box-shadow: 0 10px 25px rgba(255, 170, 68, 0.2);
    background: linear-gradient(135deg, rgba(255, 170, 68, 0.16), #20252e 70%);
  }
  .btn-choice.local {
    border-color: rgba(74, 222, 128, 0.4);
    background: linear-gradient(135deg, rgba(74, 222, 128, 0.08), #20252e 70%);
  }
  .btn-choice.local:hover {
    border-color: #4ade80;
    box-shadow: 0 10px 25px rgba(74, 222, 128, 0.2);
    background: linear-gradient(135deg, rgba(74, 222, 128, 0.16), #20252e 70%);
  }
  .btn-choice.cloud {
    border-color: rgba(56, 189, 248, 0.4);
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.08), #20252e 70%);
  }
  .btn-choice.cloud:hover {
    border-color: #38bdf8;
    box-shadow: 0 10px 25px rgba(56, 189, 248, 0.2);
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.16), #20252e 70%);
  }
  .btn-choice.menu {
    border-color: rgba(168, 85, 247, 0.4);
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.08), #20252e 70%);
  }
  .btn-choice.menu:hover {
    border-color: #a855f7;
    box-shadow: 0 10px 25px rgba(168, 85, 247, 0.2);
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.16), #20252e 70%);
  }
  .btn-choice .icon {
    font-size: 26px;
    margin-bottom: 8px;
  }
  .btn-choice .title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    margin-bottom: 4px;
  }
  .btn-choice .desc {
    font-size: 12px;
    color: #9ca3af;
    line-height: 1.4;
  }
  .footer-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #6b7280;
    margin-bottom: 12px;
  }
  .footer-links {
    display: flex;
    justify-content: center;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
    color: #6b7280;
    border-top: 1px solid #282f3c;
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
    <div class="badge-row">
      <div class="badge primary">GM & Studio Suite</div>
      <div class="badge server">MMO Server Core</div>
      <div class="badge simd">C++ AVX2 SIMD Engine</div>
    </div>
    <h1>Project Steam: Origins</h1>
    <p class="sub">Полноценный автономный проект: 3D Редактор мира, Игровой клиент и MMO Сервер</p>

    <div class="server-box">
      <div class="server-box-title">
        <span>⚡ Локальный MMO Сервер</span>
      </div>
      <div class="server-box-desc">
        Сервер полностью включен в эту сборку (директория <code>server/</code> + нативный модуль <code>build/Release/project_steam_native.node</code> + <code>shared/</code>).
      </div>
      <div>
        <span style="font-size:12px;color:#94a3b8;">Запуск в 1 клик:</span>
        <span class="server-box-code">start-server.bat</span>
        <span style="font-size:12px;color:#94a3b8;margin-left:6px;">или</span>
        <span class="server-box-code">node server/server.js</span>
      </div>
    </div>

    <div class="grid">
      <a href="editor.html" class="btn-choice editor">
        <div class="icon">⚙️</div>
        <div class="title">3D Game Studio (Level Editor)</div>
        <div class="desc">Автономный 3D-редактор локаций (Unreal/Godot UI). 360+ моделей каталога, кисть леса, спавн мобов, трансформации.</div>
      </a>
      <a href="game.html?server=localhost:8080" class="btn-choice local">
        <div class="icon">🚀</div>
        <div class="title">Играть (Локальный сервер)</div>
        <div class="desc">Вход в игру с подключением к локальному серверу на <strong>localhost:8080</strong>. Нажмите F2 в игре для GM-редактора сцены.</div>
      </a>
      <a href="game.html?server=93.77.168.135.sslip.io" class="btn-choice cloud">
        <div class="icon">🌐</div>
        <div class="title">Играть (Боевой сервер VPS)</div>
        <div class="desc">Подключение к официальному облачному серверу Project Steam (<strong>93.77.168.135</strong>) по защищенному WSS.</div>
      </a>
      <a href="menu.html" class="btn-choice menu">
        <div class="icon">🎮</div>
        <div class="title">Главное меню игры</div>
        <div class="desc">Стартовое окно игры с выбором персонажа, новостями, переключением серверов и кнопкой входа в 3D Редактор.</div>
      </a>
    </div>

    <div class="footer-title">Базы знаний и ресурсы</div>
    <div class="footer-links">
      <a href="character-select.html">👤 Персонажи</a>
      <a href="weapons-database.html">⚔️ Оружие</a>
      <a href="armor-database.html">🛡️ Броня</a>
      <a href="mobs-database.html">👾 Мобы</a>
      <a href="crafting-database.html">🔨 Ремесло</a>
      <a href="skills-database.html">✨ Навыки</a>
      <a href="database.html">📖 Вся база</a>
      <a href="promo.html">📺 Промо</a>
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

// 15. Серверный модуль (server/)
console.log('🖥️ Копирование авторитетного MMO-сервера (server/)...');
const destServerDir = path.join(DIST_GM_DIR, 'server');
copyDirFiltered(path.join(ROOT, 'server'), destServerDir, (name) => {
  if (name.endsWith('.map') || name.endsWith('.tmp') || name.endsWith('.bak') || name === 'crash.log') return false;
  return true;
});

// 16. C++ AVX2 SIMD движок и скомпилированные бинарники (native/ + build/Release)
console.log('⚡ Копирование нативного C++ AVX2 SIMD движка и бинарников...');
const destNativeDir = path.join(DIST_GM_DIR, 'native');
copyDirFiltered(path.join(ROOT, 'native'), destNativeDir, (name) => {
  if (name.endsWith('.o') || name.endsWith('.obj') || name.endsWith('.tmp')) return false;
  return true;
});
if (fs.existsSync(path.join(ROOT, 'binding.gyp'))) {
  copyFileSafe(path.join(ROOT, 'binding.gyp'), path.join(DIST_GM_DIR, 'binding.gyp'));
}
const prebuiltNative = path.join(ROOT, 'build', 'Release', 'project_steam_native.node');
if (fs.existsSync(prebuiltNative)) {
  copyFileSafe(prebuiltNative, path.join(DIST_GM_DIR, 'build', 'Release', 'project_steam_native.node'));
  console.log('  ✓ Нативный бинарник C++ AVX2 скопирован (build/Release/project_steam_native.node)');
}

// 17. Серверные данные и ключи (data/)
console.log('💾 Копирование серверных ключей и реестров (data/)...');
const dataAccountKeys = path.join(ROOT, 'data', 'account_keys.json');
if (fs.existsSync(dataAccountKeys)) {
  copyFileSafe(dataAccountKeys, path.join(DIST_GM_DIR, 'data', 'account_keys.json'));
}
fs.mkdirSync(path.join(DIST_GM_DIR, 'data', 'moderation'), { recursive: true });

// 18. Конфигурация проекта (package.json, ecosystem.config.js)
console.log('⚙️ Копирование конфигурации проекта (package.json, ecosystem.config.js)...');
if (fs.existsSync(path.join(ROOT, 'package.json'))) {
  copyFileSafe(path.join(ROOT, 'package.json'), path.join(DIST_GM_DIR, 'package.json'));
}
if (fs.existsSync(path.join(ROOT, 'package-lock.json'))) {
  copyFileSafe(path.join(ROOT, 'package-lock.json'), path.join(DIST_GM_DIR, 'package-lock.json'));
}
if (fs.existsSync(path.join(ROOT, 'ecosystem.config.js'))) {
  copyFileSafe(path.join(ROOT, 'ecosystem.config.js'), path.join(DIST_GM_DIR, 'ecosystem.config.js'));
}

// 19. Зависимости node_modules (Zero Setup для немедленного запуска сервера)
const nodeModulesSrc = path.join(ROOT, 'node_modules');
if (fs.existsSync(nodeModulesSrc)) {
  console.log('📦 Копирование готовых node_modules для запуска сервера...');
  copyDirTree(nodeModulesSrc, path.join(DIST_GM_DIR, 'node_modules'), (name) => {
    if (name === '.cache' || name === '.git' || name === '.temp') return false;
    return true;
  });
}

// 20. Командные файлы запуска (.bat)
console.log('🚀 Создание командных скриптов запуска (.bat)...');
const batStartServer = `@echo off
chcp 65001 >nul
title Project Steam MMO - Local Server
cd /d "%~dp0"
echo ============================================================
echo   🚀 PROJECT STEAM: ORIGINS -- ЛОКАЛЬНЫЙ MMO СЕРВЕР
echo   C++ AVX2 SIMD Движок + Zero-GC uWebSockets.js
echo ============================================================
echo.
set ALLOW_INSECURE_DEV=1
set PORT=8080
echo [INFO] Запуск игрового сервера на порту 8080...
echo [INFO] В браузере: http://localhost:8080
echo [INFO] 3D Редактор сцены: http://localhost:8080/editor.html
echo.
node server\\server.js
pause
`;
fs.writeFileSync(path.join(DIST_GM_DIR, 'start-server.bat'), batStartServer, 'utf8');
totalFiles++;
totalBytes += Buffer.byteLength(batStartServer, 'utf8');

const batStartClient = `@echo off
chcp 65001 >nul
title Project Steam - Статический веб-сервер
cd /d "%~dp0"
echo ============================================================
echo   🌐 СТАТИЧЕСКИЙ ВЕБ-СЕРВЕР (Порт 3000)
echo ============================================================
echo.
node server\\static-http.js
pause
`;
fs.writeFileSync(path.join(DIST_GM_DIR, 'start-client.bat'), batStartClient, 'utf8');
totalFiles++;
totalBytes += Buffer.byteLength(batStartClient, 'utf8');

const batStartAll = `@echo off
chcp 65001 >nul
title Project Steam - Полный запуск
cd /d "%~dp0"
echo ============================================================
echo   🎮 PROJECT STEAM: ORIGINS (GM & STUDIO SUITE)
echo ============================================================
echo.
echo [1/2] Запуск локального MMO сервера на порту 8080...
start "Project Steam Server" cmd /c "chcp 65001 >nul && set ALLOW_INSECURE_DEV=1 && set PORT=8080 && node server\\server.js"
echo Ожидание инициализации сервера...
timeout /t 2 /nobreak >nul
echo [2/2] Открытие GM Лаунчера в браузере...
start "" "%~dp0index.html"
`;
fs.writeFileSync(path.join(DIST_GM_DIR, 'start-all.bat'), batStartAll, 'utf8');
totalFiles++;
totalBytes += Buffer.byteLength(batStartAll, 'utf8');

// 21. Документация README-LOCAL.md
const readmeLocal = `# Project Steam: Origins — Локальный автономный проект (GM Suite)

Полнофункциональная локальная среда разработки и тестирования Project Steam: Origins, объединяющая:
1. **Клиентскую часть и 3D Редактор уровней** (Level Editor Studio) с полной библиотекой из 360+ моделей пропсов.
2. **Авторитетный MMO-сервер** с нативным C++ AVX2 SIMD боевым движком и Zero-GC транспортом uWebSockets.js.
3. **Единые правила мира** (\`shared/\`), базы дропа, мобов, умений, классов и геодату.

---

## Быстрый запуск

### Вариант 1. Всё в один клик:
Запустите файл **\`start-all.bat\`** — он запустит локальный сервер на порту 8080 и откроет портал управления в браузере.

### Вариант 2. Раздельный запуск:
1. Запустите **\`start-server.bat\`** — стартует игровой сервер на порту \`8080\` (или выполните команду \`npm start\`).
2. Откройте **\`index.html\`** в браузере и выберите:
   - **3D Game Studio (\`editor.html\`)**: Полноэкранный редактор мира (F2, кисти леса, размещение спавнов, трансформация).
   - **Играть (Локальный сервер)**: Подключение к вашему серверу (\`game.html?server=localhost:8080\`).
   - **Играть (Боевой VPS)**: Подключение к облачному серверу (\`game.html?server=93.77.168.135.sslip.io\`).

---

## Консольные команды сервера (в терминале start-server):
- \`setgm <имя> [lvl]\` — выдать персонажу права GM (уровень 50–100)
- \`revokegm <имя>\` — снять права администратора
- \`setaura <имя> <cyan|blue|red|gold|hero|off>\` — сменить ауру
- \`list\` — список онлайн игроков
- \`announce <текст>\` — системное оповещение на весь мир
- \`kick <имя>\` — отключить игрока
- \`help\` — список всех команд
`;
fs.writeFileSync(path.join(DIST_GM_DIR, 'README-LOCAL.md'), readmeLocal, 'utf8');
totalFiles++;
totalBytes += Buffer.byteLength(readmeLocal, 'utf8');

const sizeMb = (totalBytes / 1024 / 1024).toFixed(2);
console.log('\n============================================================');
console.log('🎉 [BUILD-GM_OK] Полноценный проект (Клиент + 3D Редактор + Сервер) успешно собран!');
console.log(`   Файлов в билде: ${totalFiles}`);
console.log(`   Размер билда:   ${sizeMb} MB`);
console.log('   Папка билда:    dist/gm/');
console.log('   Точка входа:    dist/gm/index.html (GM Launcher)');
console.log('   3D Редактор:    dist/gm/editor.html');
console.log('   Игровой клиент: dist/gm/menu.html');
console.log('   Сервер игры:    dist/gm/server/server.js (запуск: start-server.bat)');
console.log('   Запуск всего:   dist/gm/start-all.bat');
console.log('============================================================\n');
