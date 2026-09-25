// ============================================================
//  TESTS / CHARS.TEST.JS — ключ профиля yid:charId (PLAN 5.5).
//  Регресс: 7 слотов в localStorage открывали один data/<yid>.json.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CH = require(path.join(ROOT, 'shared', 'char-rules.js'));

module.exports = function (t) {
  t.suite('char-rules: слоты и ключи');
  t.eq(CH.MAX_SLOTS, 7, '7 слотов, как на экране выбора');
  t.eq(CH.DEFAULT_CHAR_ID, 'c0', 'пустой charId = c0 (старый data/<yid>.json)');
  t.eq(CH.normalizeCharId(undefined), 'c0', 'нет charId → c0');
  t.eq(CH.normalizeCharId(''), 'c0', 'пустая строка → c0');
  t.eq(CH.normalizeCharId('c_alt'), 'c_alt', 'клиентский c_* сохраняется');
  t.eq(CH.normalizeCharId('../etc/passwd'), 'etcpasswd', 'путь вычищен');
  t.eq(CH.normalizeCharId('__proto__'), 'c0', '__proto__ не становится ключом');
  t.eq(CH.normalizeCharId('constructor'), 'c0', 'constructor не становится ключом');

  t.eq(CH.profileStem('acc', 'c0'), 'acc', 'c0 не меняет имя файла');
  t.eq(CH.profileStem('acc', 'c_alt'), 'acc.c_alt', 'доп. слот — суффикс в имени файла');
  t.eq(CH.profileKey('acc', 'c0'), 'acc', 'postgres: c0 = старый pkey yid');
  t.eq(CH.profileKey('acc', 'c_alt'), 'acc:c_alt', 'postgres: прочие слоты yid:charId');
  t.eq(CH.memberKey('acc', 'c_alt'), 'acc:c_alt', 'клан различает персонажей одного аккаунта');
  t.eq(CH.parseProfileStem('acc').charId, 'c0', 'файл без точки — слот c0');
  t.eq(CH.parseProfileStem('acc.c_alt'), { yid: 'acc', charId: 'c_alt' },
    'файл yid.charId разбирается обратно');

  t.ok(CH.sameChar({ yid: 'a', charId: 'c0' }, { yid: 'a' }), 'sameChar: пустой charId = c0');
  t.ok(!CH.sameChar({ yid: 'a', charId: 'c0' }, { yid: 'a', charId: 'c_alt' }),
    'разные слоты одного yid — разные персонажи');

  const sum = CH.summarize({ name: 'Hero', level: 12, cls: 'operator', inv: { secret: 1 } }, 'c_alt');
  t.eq(sum && sum.id, 'c_alt', 'сводка несёт id слота');
  t.eq(sum && sum.level, 12, 'сводка несёт уровень');
  t.ok(sum && sum.inv == null, 'инвентарь в список слотов не утекает');
};
