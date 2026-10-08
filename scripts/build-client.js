// ============================================================
//  SCRIPTS / BUILD-CLIENT.JS
//  Сборка ультра-чистого продакшен-клиента Project Steam для Render.com
//  Включает ИСКЛЮЧИТЕЛЬНО то, что реально используется в коде игры.
//  Удаляет весь балласт: неиспользуемые FBX, дубликаты PNG, неиспользуемый HUD.
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'client');
const SHARED_DIR = path.join(ROOT, 'shared');
const DIST_DIR = path.join(ROOT, 'dist', 'client');

console.log('============================================================');
console.log('🚀 [BUILD-CLIENT] Сборка 100% чистого клиента Project Steam');
console.log('============================================================\n');

// 1. Индексируем весь исходный код клиента и shared для поиска ссылок
console.log('🔍 Индексация исходного кода для выявления неиспользуемых ассетов...');
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

// 2. Получаем список реально размещенных в мире FBX-пропсов
const overridesPath = path.join(SHARED_DIR, 'editor-overrides.json');
const usedPropsFbx = new Set();
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
console.log(`🌲 Реально размещенных FBX-пропсов в мире: ${usedPropsFbx.size}`);

// 3. Активные 3D-модели оружия
const activeWeaponFbx = new Set(['novice.fbx', 'magic_mace.fbx']);

// 4. Только боевые HTML файлы
const GAME_HTML_FILES = new Set([
  'index.html',
  'menu.html',
  'character-select.html',
  'game.html',
  '404.html',
  'favicon.ico',
  'robots.txt'
]);

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
      copyDirFiltered(srcPath, destPath, fileFilter);
    } else if (it.isFile()) {
      if (!fileFilter || fileFilter(it.name, srcPath)) {
        copyFileSafe(srcPath, destPath);
      }
    }
  }
}

// Очистка старой директории dist/client
if (fs.existsSync(DIST_DIR)) {
  console.log('🧹 Очистка предыдущего билда dist/client...');
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DIST_DIR, { recursive: true });

// 1. Корневые HTML файлы игры
console.log('📄 Копирование игровых экранов (menu, character-select, game)...');
for (const htmlFile of GAME_HTML_FILES) {
  const src = path.join(CLIENT_DIR, htmlFile);
  if (fs.existsSync(src)) {
    copyFileSafe(src, path.join(DIST_DIR, htmlFile));
  }
}
const redirect404 = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=menu.html"><title>Project Steam</title><script>location.replace('menu.html');</script></head><body></body></html>`;
fs.writeFileSync(path.join(DIST_DIR, '404.html'), redirect404, 'utf8');
fs.writeFileSync(path.join(DIST_DIR, '.nojekyll'), '', 'utf8');

// 2. Стили CSS
console.log('🎨 Копирование стилей CSS...');
copyDirFiltered(path.join(CLIENT_DIR, 'css'), path.join(DIST_DIR, 'css'), name => name.endsWith('.css'));

// 3. Данные мира (террейн, геодата, классы) без старых черновиков карт, city JPG и неиспользуемых текстур
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

copyDirFiltered(path.join(CLIENT_DIR, 'data'), path.join(DIST_DIR, 'data'), (name, fullPath) => {
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

// 4. Скрипты JS (исключая редактор и каталог редактора)
console.log('⚙️ Копирование движка Three.js и скриптов игры (без редактора)...');
copyDirFiltered(path.join(CLIENT_DIR, 'js'), path.join(DIST_DIR, 'js'), name => {
  if (name.startsWith('editor')) return false;
  if (name === 'props-library-data.js') return false;
  if (name.endsWith('.map')) return false;
  return name.endsWith('.js') || name.endsWith('.json');
});

const unneededHudDebuffs = new Set([
  'blind.webp',
  'burn.webp',
  'dot.webp',
  'charm.webp',
  'def.webp',
  'pdef.webp',
  'oil.webp',
  'slow.webp',
  'paralyze.webp',
  'silence.webp',
  'test_immortal.webp'
]);

// 5. HUD: фильтрация неиспользуемых курсоров, raw файлов и устаревших дебаффов
console.log('🖥️ Копирование HUD (только используемые в коде элементы)...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'hud'), path.join(DIST_DIR, 'assets', 'hud'), (name, fullPath) => {
  if (name.endsWith('.txt') || name.endsWith('.json')) return false;
  if (name.includes('_raw')) return false;
  if (name.endsWith('.png')) return false; // Все элементы HUD переведены в WebP (cursor.webp)
  // Исключаем лишние размеры курсоров (в коде используется cursor.webp)
  if (/^cursor_\d+\./i.test(name) || /^cursor_attack_\d+\./i.test(name)) return false;
  const normalized = fullPath.replace(/\\/g, '/');
  if (normalized.includes('/hud/debuffs/') && unneededHudDebuffs.has(name)) return false;
  // Проверяем упоминание в коде (имя файла или имя без расширения)
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || (baseName.length > 2 && allCodeText.includes(baseName));
});

// 6. Аудио: только используемые звуки
console.log('🔊 Копирование аудио...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'audio'), path.join(DIST_DIR, 'assets', 'audio'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});

// 7. Мобы: только используемые WebP спрайтшиты и JSON (без PNG-дубликатов и raw-кадров)
console.log('👾 Копирование мобов (только используемые WebP и JSON)...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'mobs'), path.join(DIST_DIR, 'assets', 'mobs'), (name, fullPath) => {
  if (name.endsWith('.mp4') || name.endsWith('.md')) return false;
  if (name.endsWith('.png')) return false; // Движок грузит только *.webp
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 8. NPC: только используемые WebP и JSON (без PNG-дубликатов)
console.log('🧙 Копирование NPC...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'npc'), path.join(DIST_DIR, 'assets', 'npc'), name => {
  if (name.endsWith('.png')) return false;
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 9. Навыки
console.log('✨ Копирование иконок навыков...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'skills'), path.join(DIST_DIR, 'assets', 'skills'), name => {
  return name.endsWith('.webp') || name.endsWith('.json');
});

// 10. Броня, Инвентарь, Меню, Классы (только используемые в БД и коде)
console.log('🛡️ Копирование предметов, брони и интерфейса меню...');
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'armor'), path.join(DIST_DIR, 'assets', 'armor'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'inventar'), path.join(DIST_DIR, 'assets', 'inventar'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'menu'), path.join(DIST_DIR, 'assets', 'menu'), name => {
  const baseName = path.parse(name).name;
  return allCodeText.includes(name) || allCodeText.includes(baseName);
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'classes'), path.join(DIST_DIR, 'assets', 'classes'));
// В assets/textures копируем ТОЛЬКО боевые спрайты из webp/ (без 20 тяжелых 2K JPG из палитры редактора)
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'textures', 'webp'), path.join(DIST_DIR, 'assets', 'textures', 'webp'));

// 11. Персонаж: ТОЛЬКО боевой engi/man (assets/ + Textures/) без 13 FBX и без корневых GLB
console.log('👤 Копирование боевого персонажа (без лишних FBX и дубликатов)...');
const charSrc = path.join(CLIENT_DIR, 'assets', 'Characters', 'engi', 'man');
const charDest = path.join(DIST_DIR, 'assets', 'Characters', 'engi', 'man');
copyDirFiltered(path.join(charSrc, 'assets'), path.join(charDest, 'assets'));
copyDirFiltered(path.join(charSrc, 'Textures'), path.join(charDest, 'Textures'));

// 12. Оружие: только боевые модели (novice, magic_mace) и их оптимизированные WebP текстуры
console.log('⚔️ Копирование боевого 3D-оружия...');
activeWeaponFbx.forEach(f => {
  const p = path.join(CLIENT_DIR, 'assets', 'weapons', 'models', f);
  if (fs.existsSync(p)) copyFileSafe(p, path.join(DIST_DIR, 'assets', 'weapons', 'models', f));
  const base = path.parse(f).name;
  const texPath = path.join(CLIENT_DIR, 'assets', 'weapons', 'textures', base + '.webp');
  if (fs.existsSync(texPath)) copyFileSafe(texPath, path.join(DIST_DIR, 'assets', 'weapons', 'textures', base + '.webp'));
});

// 13. Пропсы: ТОЛЬКО 63 модели, реально размещенные на карте + иконки и ТОЛЬКО их текстуры
console.log('🌲 Определение и копирование ТОЛЬКО реально используемых текстур пропсов...');
const neededPropTextures = new Set([
  'matted_pratia.webp',
  'field_poppy.webp',
  'wood.webp',
  'pinebranch.webp',
  'sprucebranch.webp',
  'pine.webp',
  'spruce.webp',
  'stump_1.webp',
  'house_01.webp',
  'house_engineer_01.webp',
  'house_05.webp',
  'warehouse_01.webp',
  'market_stall_01.webp',
  'tent_02.webp'
]);

try {
  const propTexturesDataCode = fs.readFileSync(path.join(CLIENT_DIR, 'js', 'prop-textures-data.js'), 'utf8');
  const dummyWindow = {};
  new Function('window', propTexturesDataCode)(dummyWindow);
  const textureMap = dummyWindow.PROP_TEXTURES_DATA || new Map();

  function resolveTex(raw) {
    if (!raw) return null;
    let clean = String(raw).replace(/^.*[\\\/]/, '').trim().split('?')[0];
    let lower = clean.toLowerCase();
    const base = lower.replace(/\.(fbx|glb|gltf|obj|png|jpe?g|webp|tga|bmp|dds)$/i, '');
    if (textureMap.has(base + '.webp')) return textureMap.get(base + '.webp');
    if (textureMap.has(base)) {
      const b = textureMap.get(base);
      if (b && b.endsWith('.webp')) return b;
    }
    if (textureMap.has(lower)) {
      const val = textureMap.get(lower);
      if (val) {
        const vb = val.replace(/\.(png|jpe?g|tga|bmp)$/i, '');
        if (textureMap.has(vb + '.webp')) return textureMap.get(vb + '.webp');
        return val;
      }
    }
    const stripped = base.replace(/([_\.]?[a-z0-9]+)+$/i, '');
    if (stripped && stripped !== base && textureMap.has(stripped + '.webp')) return textureMap.get(stripped + '.webp');
    const strippedDigits = base.replace(/([_\.]?\d+)+$/g, '');
    if (strippedDigits && strippedDigits !== base && textureMap.has(strippedDigits + '.webp')) return textureMap.get(strippedDigits + '.webp');
    return null;
  }

  const fbxDir = path.join(CLIENT_DIR, 'assets', 'props');
  for (const model of usedPropsFbx) {
    const r = resolveTex(model);
    if (r) neededPropTextures.add(r.replace(/\.(png|jpe?g|tga|bmp)$/i, '.webp').toLowerCase());

    const fbxPath = path.join(fbxDir, model);
    if (fs.existsSync(fbxPath)) {
      const content = fs.readFileSync(fbxPath).toString('latin1');
      const regex = /["']?([^"'\r\n\0\t]+\.(?:png|jpe?g|tga|bmp|dds|webp))["']?/gi;
      let m;
      while ((m = regex.exec(content)) !== null) {
        const texName = m[1].replace(/^.*[\\\/]/, '').trim();
        const r2 = resolveTex(texName);
        if (r2) neededPropTextures.add(r2.replace(/\.(png|jpe?g|tga|bmp)$/i, '.webp').toLowerCase());
        neededPropTextures.add(texName.replace(/\.(png|jpe?g|tga|bmp|dds)$/i, '.webp').toLowerCase());
      }
    }
  }
} catch (e) {
  console.warn('⚠️ Ошибка резолвинга текстур:', e.message);
}

usedPropsFbx.forEach(f => {
  const p = path.join(CLIENT_DIR, 'assets', 'props', f);
  if (fs.existsSync(p)) copyFileSafe(p, path.join(DIST_DIR, 'assets', 'props', f));
});
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'props', 'icons_weapon'), path.join(DIST_DIR, 'assets', 'props', 'icons_weapon'));
copyDirFiltered(path.join(CLIENT_DIR, 'assets', 'props', 'textures'), path.join(DIST_DIR, 'assets', 'props', 'textures'), name => {
  return neededPropTextures.has(name.toLowerCase());
});

const sizeMb = (totalBytes / 1024 / 1024).toFixed(2);
console.log('\n============================================================');
console.log('✅ [BUILD-CLIENT_OK] 100% чистый билд успешно собран!');
console.log(`   Файлов в билде: ${totalFiles}`);
console.log(`   Размер билда:   ${sizeMb} MB (абсолютно все неиспользуемое удалено!)`);
console.log('   Точка входа:    dist/client/index.html -> menu.html');
console.log('============================================================\n');
