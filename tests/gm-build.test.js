// ============================================================
//  TESTS / GM-BUILD.TEST.JS
//  Автоматизированная проверка целостности GM / Редакторского билда
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (t) {
  t.suite('gm-build: проверка целостности билда с 3D-редактором');

  const root = path.resolve(__dirname, '..');
  const gmDir = path.join(root, 'dist', 'gm');

  t.ok(fs.existsSync(gmDir), 'dist/gm директория присутствует');

  // HTML экраны
  t.ok(fs.existsSync(path.join(gmDir, 'editor.html')), 'editor.html на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'game.html')), 'game.html на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'menu.html')), 'menu.html на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'index.html')), 'index.html (GM Launcher) на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'database.html')), 'database.html на месте');

  // Скрипты редактора
  t.ok(fs.existsSync(path.join(gmDir, 'js', 'editor.js')), 'js/editor.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'js', 'editor-engine-layout.js')), 'js/editor-engine-layout.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'js', 'props-library-data.js')), 'js/props-library-data.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'js', 'prop-textures-data.js')), 'js/prop-textures-data.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'js', 'editor-overrides-data.js')), 'js/editor-overrides-data.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'css', 'editor-engine.css')), 'css/editor-engine.css на месте');

  // Пропсы и иконки
  const propsDir = path.join(gmDir, 'assets', 'props');
  t.ok(fs.existsSync(propsDir), 'assets/props на месте');

  const fbxFiles = fs.readdirSync(propsDir).filter(f => f.endsWith('.fbx'));
  t.ok(fbxFiles.length >= 360, `в билде ${fbxFiles.length} FBX моделей (полный каталог редактора)`);

  const iconsDir = path.join(propsDir, 'icons');
  t.ok(fs.existsSync(iconsDir), 'assets/props/icons на месте');
  const iconFiles = fs.readdirSync(iconsDir).filter(f => f.endsWith('.webp') || f.endsWith('.png'));
  t.ok(iconFiles.length >= 350, `в билде ${iconFiles.length} иконок каталога для Content Browser`);

  const texDir = path.join(propsDir, 'textures');
  t.ok(fs.existsSync(texDir), 'assets/props/textures на месте');
  const texFiles = fs.readdirSync(texDir);
  const rawPngs = texFiles.filter(f => f.endsWith('.png') || f.endsWith('.jpg'));
  t.eq(rawPngs.length, 0, 'в текстурах пропсов отсутствуют дубликаты сырых PNG/JPG (только WebP)');
  const webpFiles = texFiles.filter(f => f.endsWith('.webp'));
  t.ok(webpFiles.length >= 400, `в билде ${webpFiles.length} WebP текстур пропсов`);

  // Shared библиотеки
  t.ok(fs.existsSync(path.join(gmDir, 'shared', 'mob-db.js')), 'gm/shared/mob-db.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'shared', 'world-metrics.js')), 'gm/shared/world-metrics.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'shared', 'editor-overrides.json')), 'gm/shared/editor-overrides.json на месте');
  t.ok(fs.existsSync(path.join(root, 'dist', 'shared', 'mob-db.js')), 'dist/shared/mob-db.js (зеркало) на месте');

  // Проверка скриптов из boot.module.js
  const bootContent = fs.readFileSync(path.join(gmDir, 'js', 'boot.module.js'), 'utf8');
  const scriptsMatch = bootContent.match(/const SCRIPTS = \[([\s\S]*?)\];/);
  const editorScriptsMatch = bootContent.match(/const EDITOR_SCRIPTS = \[([\s\S]*?)\];/);

  const re = /['"]([^'"]+)['"]/g;
  const paths = [];
  let m;
  const combined = (scriptsMatch ? scriptsMatch[1] : '') + '\n' + (editorScriptsMatch ? editorScriptsMatch[1] : '');
  while ((m = re.exec(combined)) !== null) {
    paths.push(m[1].split('?')[0]);
  }

  t.ok(paths.length > 50, `проверено ${paths.length} путей скриптов`);
  let missingCount = 0;
  paths.forEach(p => {
    let full;
    if (p.startsWith('../shared/')) {
      const sub = p.replace('../shared/', '');
      const target1 = path.join(gmDir, 'shared', sub);
      const target2 = path.join(root, 'dist', 'shared', sub);
      if (!fs.existsSync(target1) && !fs.existsSync(target2)) {
        missingCount++;
      }
    } else {
      full = path.join(gmDir, p);
      if (!fs.existsSync(full)) {
        missingCount++;
      }
    }
  });
  t.eq(missingCount, 0, 'все загружаемые через boot.module скрипты найдены в билде без пропусков');

  // Серверная часть и нативный C++ SIMD движок
  t.ok(fs.existsSync(path.join(gmDir, 'server', 'server.js')), 'gm/server/server.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'server', 'net-transport.js')), 'gm/server/net-transport.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'server', 'spatial-grid.js')), 'gm/server/spatial-grid.js на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'native', 'src', 'main.cpp')), 'gm/native/src/main.cpp на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'binding.gyp')), 'gm/binding.gyp на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'build', 'Release', 'project_steam_native.node')), 'gm/build/Release/project_steam_native.node на месте');

  // Батники запуска и документация
  t.ok(fs.existsSync(path.join(gmDir, 'start-server.bat')), 'gm/start-server.bat на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'start-all.bat')), 'gm/start-all.bat на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'README-LOCAL.md')), 'gm/README-LOCAL.md на месте');
  t.ok(fs.existsSync(path.join(gmDir, 'package.json')), 'gm/package.json на месте');
};
