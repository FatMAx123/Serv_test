// ============================================================
//  SCRIPTS / RENAME-CHAR.JS
//  Скрипт переименования персонажа в базе данных
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');

const OLD_NAME = 'фывфа';
const NEW_NAME = 'ИИндиГусь';
const OLD_KEY = OLD_NAME.toLowerCase();
const NEW_KEY = NEW_NAME.toLowerCase();

const DATA_DIR = path.resolve(__dirname, '..', 'data');

console.log(`[RENAME] Переименование '${OLD_NAME}' -> '${NEW_NAME}' в ${DATA_DIR}...`);

// 1. gm-access.json
const gmFile = path.join(DATA_DIR, 'gm-access.json');
if (fs.existsSync(gmFile)) {
  try {
    const gm = JSON.parse(fs.readFileSync(gmFile, 'utf8'));
    if (gm.characters && (gm.characters[OLD_KEY] || gm.characters[OLD_NAME])) {
      const entry = gm.characters[OLD_KEY] || gm.characters[OLD_NAME];
      delete gm.characters[OLD_KEY];
      delete gm.characters[OLD_NAME];
      gm.characters[NEW_KEY] = entry;
      fs.writeFileSync(gmFile, JSON.stringify(gm, null, 2), 'utf8');
      console.log('✅ gm-access.json обновлен');
    }
  } catch (e) {
    console.error('Ошибка gm-access.json:', e.message);
  }
}

// 2. characters.json
const charsFile = path.join(DATA_DIR, 'characters.json');
if (fs.existsSync(charsFile)) {
  try {
    const chars = JSON.parse(fs.readFileSync(charsFile, 'utf8'));
    if (chars[OLD_KEY] || chars[OLD_NAME]) {
      const rec = chars[OLD_KEY] || chars[OLD_NAME];
      delete chars[OLD_KEY];
      delete chars[OLD_NAME];
      rec.name = NEW_NAME;
      chars[NEW_KEY] = rec;
      fs.writeFileSync(charsFile, JSON.stringify(chars, null, 2), 'utf8');
      console.log('✅ characters.json обновлен');
    }
  } catch (e) {
    console.error('Ошибка characters.json:', e.message);
  }
}

// 3. Сканирование профилей
const files = fs.readdirSync(DATA_DIR);
let updatedProfiles = 0;
for (const file of files) {
  if (!file.endsWith('.json')) continue;
  if (file === 'characters.json' || file === 'gm-access.json') continue;
  const fp = path.join(DATA_DIR, file);
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    if (raw.includes(OLD_NAME)) {
      const obj = JSON.parse(raw);
      if (obj && obj.name === OLD_NAME) {
        obj.name = NEW_NAME;
        fs.writeFileSync(fp, JSON.stringify(obj), 'utf8');
        console.log(`✅ Профиль обновлен: ${file}`);
        updatedProfiles++;
      }
    }
  } catch (_) {}
}

console.log(`[RENAME] Завершено. Профилей обновлено: ${updatedProfiles}`);
