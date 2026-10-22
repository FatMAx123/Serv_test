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
    if (gm.characters) {
      for (const k of Object.keys(gm.characters)) {
        if (k === OLD_KEY || k === OLD_NAME || k === 'фыфва') {
          const entry = gm.characters[k];
          delete gm.characters[k];
          gm.characters[NEW_KEY] = entry;
          console.log(`✅ gm-access.json: ключ '${k}' -> '${NEW_KEY}'`);
        }
      }
      fs.writeFileSync(gmFile, JSON.stringify(gm, null, 2), 'utf8');
      console.log('✅ gm-access.json сохранен');
    }
  } catch (e) {
    console.error('Ошибка gm-access.json:', e.message);
  }
}

// 2. characters.json
const charsFile = path.join(DATA_DIR, 'characters.json');
if (fs.existsSync(charsFile)) {
  try {
    const raw = JSON.parse(fs.readFileSync(charsFile, 'utf8'));
    const map = (raw && raw.characters && typeof raw.characters === 'object') ? raw.characters : raw;
    let updatedChars = false;
    for (const k of Object.keys(map)) {
      const rec = map[k];
      if (k === OLD_KEY || k === OLD_NAME || k === 'фыфва' || (rec && (rec.charId === 'c_mtrezvp23fpe' || rec.name === OLD_NAME || rec.name === 'фыфва'))) {
        delete map[k];
        rec.name = NEW_NAME;
        map[NEW_KEY] = rec;
        updatedChars = true;
        console.log(`✅ characters.json: запись '${k}' переименована в '${NEW_KEY}', name='${NEW_NAME}'`);
      }
    }
    if (updatedChars) {
      raw.updatedAt = Date.now();
      fs.writeFileSync(charsFile, JSON.stringify(raw, null, 2), 'utf8');
      console.log('✅ characters.json сохранен');
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
    const content = fs.readFileSync(fp, 'utf8');
    if (content.includes(OLD_NAME) || content.includes('фыфва') || content.includes('c_mtrezvp23fpe')) {
      const obj = JSON.parse(content);
      if (obj && (obj.name === OLD_NAME || obj.name === 'фыфва' || obj.charId === 'c_mtrezvp23fpe')) {
        obj.name = NEW_NAME;
        fs.writeFileSync(fp, JSON.stringify(obj), 'utf8');
        console.log(`✅ Профиль обновлен: ${file}`);
        updatedProfiles++;
      }
    }
  } catch (_) {}
}

console.log(`[RENAME] Завершено. Профилей обновлено: ${updatedProfiles}`);
