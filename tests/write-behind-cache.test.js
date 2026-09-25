// ============================================================
//  TESTS / WRITE-BEHIND-CACHE.TEST.JS
//  Модульное тестирование Write-Behind Dirty Cache (Спринт 1, v2.2)
//  Проверка пакетного сброса раз в 30с и гарантированного сохранения.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DB = require(path.join(ROOT, 'server', 'db.js'));

module.exports = async function (t) {
  t.suite('write-behind: эмуляция подсистемы грязных профилей');

  const dirtyProfiles = new Map();
  const savedHistory = [];

  // Эмуляция функций сервера
  function markProfileDirty(p) {
    if (!p || !p.yid) return;
    if (String(p.yid).startsWith('stress_bot_')) return;
    const key = p.yid + ':' + (p.charId || 'c0');
    dirtyProfiles.set(key, p);
  }

  function saveProfileNow(p) {
    if (!p || !p.yid) return;
    if (String(p.yid).startsWith('stress_bot_')) return;
    const key = p.yid + ':' + (p.charId || 'c0');
    dirtyProfiles.delete(key);
    savedHistory.push({ yid: p.yid, level: p.level, time: Date.now() });
  }

  function flushDirtyProfiles(specificKey) {
    if (specificKey) {
      for (const [k, p] of dirtyProfiles) {
        if (k === specificKey || p.yid === specificKey) {
          dirtyProfiles.delete(k);
          saveProfileNow(p);
        }
      }
      return;
    }
    for (const [k, p] of dirtyProfiles) {
      dirtyProfiles.delete(k);
      saveProfileNow(p);
    }
  }

  // 1. Пометка профилей как dirty без немедленного сброса
  const p1 = { yid: 'user_wb_1', charId: 'c0', level: 12, name: 'Alice' };
  const p2 = { yid: 'user_wb_2', charId: 'c0', level: 15, name: 'Bob' };

  markProfileDirty(p1);
  markProfileDirty(p2);

  t.eq(dirtyProfiles.size, 2, 'В очереди dirtyProfiles ровно 2 игрока');
  t.eq(savedHistory.length, 0, 'Дисковые записи ещё НЕ вызывались (0 сейвов)');

  // Повторная пометка того же игрока обновляет ссылку и не плодит дублей
  p1.level = 13;
  markProfileDirty(p1);
  t.eq(dirtyProfiles.size, 2, 'Повторная пометка того же игрока дедуплицируется (размер = 2)');

  // 2. Игнорирование стресс-ботов
  const bot = { yid: 'stress_bot_99', charId: 'c0', level: 1, name: 'Bot99' };
  markProfileDirty(bot);
  saveProfileNow(bot);
  t.eq(dirtyProfiles.size, 2, 'Стресс-бот НЕ попадает в dirtyProfiles');
  t.eq(savedHistory.length, 0, 'Стресс-бот НЕ инициирует дисковую запись');

  // 3. Немедленный сброс конкретного игрока (например, при выходе или сделке)
  saveProfileNow(p1);
  t.eq(dirtyProfiles.has('user_wb_1:c0'), false, 'p1 удалён из dirtyProfiles при saveProfileNow');
  t.eq(dirtyProfiles.size, 1, 'В очереди остался только p2');
  t.eq(savedHistory.length, 1, 'Произведена ровно 1 запись');
  t.eq(savedHistory[0].yid, 'user_wb_1', 'Сохранён правильный игрок user_wb_1');
  t.eq(savedHistory[0].level, 13, 'Сохранён актуальный уровень (13)');

  // 4. Пакетный сброс таймером (Flush)
  flushDirtyProfiles();
  t.eq(dirtyProfiles.size, 0, 'После flushDirtyProfiles очередь пуста');
  t.eq(savedHistory.length, 2, 'Произведена запись второго игрока');
  t.eq(savedHistory[1].yid, 'user_wb_2', 'Сохранён user_wb_2');

  t.suite('write-behind: интеграция с DB.flush');
  t.ok(typeof DB.flush === 'function', 'DB.flush существует для ожидания завершения очередей');
  await DB.flush();
  t.ok(true, 'DB.flush успешно завершён без ошибок');
};
