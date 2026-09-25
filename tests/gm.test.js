// ============================================================
//  TESTS / GM.TEST.JS — База игроков L2 и управление GM вне игры.
//  - Реестр персонажей data/characters.json.
//  - Поиск по имени (case-insensitive) и по YID.
//  - Выдача/снятие accessLevel через PlayerDb.
//  - Консольная утилита server/gm-tool.js (list, set, revoke, info).
//  - Персистенция accessLevel и gm в файлах профилей.
//  - Подписка на live hot-sync (onGmChanged).
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PlayerDb = require(path.join(ROOT, 'server', 'player-db.js'));
const DB = require(path.join(ROOT, 'server', 'db.js'));

const TEST_YID = 'local_gmtest_' + Date.now().toString(36);
const TEST_CHAR_NAME = 'GM_Warrior_' + Math.floor(Math.random() * 1000);

module.exports = async function (t) {
  t.suite('player-db: инициализация и поиск');
  await PlayerDb.init();
  const allChars = PlayerDb.list();
  t.ok(Array.isArray(allChars) && allChars.length > 0, 'база игроков инициализирована и содержит персонажей');

  // Создаём тестовый профиль через DB.save
  const testProfile = {
    name: TEST_CHAR_NAME,
    level: 15,
    exp: 5000,
    cls: 'operator',
    classTier: 0,
    race: 'human',
    gender: 'male',
    hp: 200,
    maxHp: 200,
    energy: 50,
    maxEnergy: 50,
    accessLevel: 0,
    gm: false
  };

  await DB.save(TEST_YID, testProfile, 'c0');
  await PlayerDb.save();

  // Проверяем, что PlayerDb.touch сработал
  const foundByName = PlayerDb.getByName(TEST_CHAR_NAME);
  t.ok(foundByName, 'персонаж найден в базе по имени после DB.save');
  t.eq(foundByName.level, 15, 'уровень персонажа в базе корректен');
  t.eq(foundByName.accessLevel, 0, 'исходный accessLevel равен 0');
  t.eq(foundByName.gm, false, 'исходный GM статус равен false');

  // Проверка case-insensitive поиска
  const foundLower = PlayerDb.getByName(TEST_CHAR_NAME.toLowerCase());
  const foundUpper = PlayerDb.getByName(TEST_CHAR_NAME.toUpperCase());
  t.ok(foundLower && foundUpper, 'поиск персонажа по имени регистронезависим');
  t.eq(foundLower.name, TEST_CHAR_NAME, 'сохраняется оригинальный регистр имени');

  // Поиск по YID
  const byYid = PlayerDb.getByYid(TEST_YID);
  t.ok(Array.isArray(byYid) && byYid.length >= 1, 'персонаж найден по YID аккаунта');
  t.eq(byYid[0].name, TEST_CHAR_NAME, 'имя персонажа по YID совпадает');

  t.suite('player-db: назначение статуса GM вне игры');
  let gmEventFired = false;
  let gmEventData = null;
  const unsub = PlayerDb.onGmChanged((data) => {
    gmEventFired = true;
    gmEventData = data;
  });

  // Выдаём accessLevel 100 по имени персонажа
  const grantRes = await PlayerDb.setAccessLevel(TEST_CHAR_NAME, 100, 'test_grant');
  t.ok(grantRes.ok, 'setAccessLevel вернул успех');
  t.eq(grantRes.accessLevel, 100, 'уровень доступа установлен в 100');
  t.eq(grantRes.gm, true, 'gm flag установлен в true');
  t.ok(gmEventFired, 'событие onGmChanged сработало для живого сервера');
  t.eq(gmEventData.accessLevel, 100, 'событие передало accessLevel 100');

  // Проверяем в PlayerDb
  t.eq(PlayerDb.isGM(TEST_YID, TEST_CHAR_NAME), true, 'PlayerDb.isGM возвращает true');
  t.eq(PlayerDb.getAccessLevel(TEST_YID, TEST_CHAR_NAME), 100, 'PlayerDb.getAccessLevel возвращает 100');

  // Проверяем фильтр GM
  const gms = PlayerDb.list({ gmOnly: true });
  t.ok(gms.some(g => g.name.toLowerCase() === TEST_CHAR_NAME.toLowerCase()), 'персонаж присутствует в списке list({ gmOnly: true })');

  // Проверяем сохранение в файл профиля
  const reloaded = await DB.load(TEST_YID, 'c0');
  t.ok(reloaded, 'профиль читается из хранилища');
  t.eq(reloaded.accessLevel, 100, 'accessLevel записан в файл профиля');
  t.eq(reloaded.gm, true, 'gm: true записан в файл профиля');

  t.suite('player-db: снятие статуса GM вне игры');
  const revokeRes = await PlayerDb.revokeAccess(TEST_CHAR_NAME, 'test_revoke');
  t.ok(revokeRes.ok, 'revokeAccess вернул успех');
  t.eq(revokeRes.accessLevel, 0, 'accessLevel сброшен в 0');
  t.eq(revokeRes.gm, false, 'gm сброшен в false');
  t.eq(PlayerDb.isGM(TEST_YID, TEST_CHAR_NAME), false, 'PlayerDb.isGM после снятия возвращает false');
  t.eq(PlayerDb.getAccessLevel(TEST_YID, TEST_CHAR_NAME), 0, 'PlayerDb.getAccessLevel после снятия возвращает 0');

  unsub();

  t.suite('gm-tool: консольная утилита командной строки');
  // 1. Проверка команды list
  const listOut = execSync('node server/gm-tool.js list', { cwd: ROOT, encoding: 'utf8' });
  t.ok(listOut.includes('GM & PLAYER ADMINISTRATION TOOL'), 'gm-tool list выводит баннер');
  t.ok(listOut.includes(TEST_CHAR_NAME), 'gm-tool list находит созданного персонажа');

  // 2. Проверка команды set
  const setOut = execSync(`node server/gm-tool.js set "${TEST_CHAR_NAME}" 100`, { cwd: ROOT, encoding: 'utf8' });
  t.ok(setOut.includes('Статус GM обновлён'), 'gm-tool set сообщает об успехе');
  t.ok(setOut.includes('AccessLevel:  100'), 'gm-tool set подтверждает accessLevel 100');

  // 3. Проверка команды info
  const infoOut = execSync(`node server/gm-tool.js info "${TEST_CHAR_NAME}"`, { cwd: ROOT, encoding: 'utf8' });
  t.ok(infoOut.includes('Информация о персонаже: ' + TEST_CHAR_NAME), 'gm-tool info выводит карточку');
  t.ok(infoOut.includes('AccessLevel:  100 ★ [GM / Администратор]'), 'gm-tool info отображает GM статус');

  // 4. Проверка команды revoke
  const revokeOut = execSync(`node server/gm-tool.js revoke "${TEST_CHAR_NAME}"`, { cwd: ROOT, encoding: 'utf8' });
  t.ok(revokeOut.includes('Статус GM снят'), 'gm-tool revoke сообщает о снятии');
  t.ok(revokeOut.includes('AccessLevel:  0'), 'gm-tool revoke подтверждает accessLevel 0');

  t.suite('player-db: статус онлайна и очистка');
  PlayerDb.setOnline(TEST_YID, 'c0', true);
  const onlineRec = PlayerDb.getByName(TEST_CHAR_NAME);
  t.eq(onlineRec.online, true, 'setOnline(true) переводит персонажа в онлайн');

  PlayerDb.setOnline(TEST_YID, 'c0', false);
  const offlineRec = PlayerDb.getByName(TEST_CHAR_NAME);
  t.eq(offlineRec.online, false, 'setOnline(false) переводит персонажа в оффлайн');

  // Удаление тестового персонажа
  await DB.removeChar(TEST_YID, 'c0');
  t.eq(PlayerDb.getByName(TEST_CHAR_NAME), null, 'удалённый персонаж исчезает из базы');

  t.suite('gm-handler: безопасность и отсутствие бэкдоров в production (VULN-01)');
  const gmHandler = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    t.eq(gmHandler.isGM({ yid: 'itest_attacker', accessLevel: 0 }), false,
      'в production аккаунты itest_* НЕ получают права GM');
    process.env.NODE_ENV = 'test';
    t.eq(gmHandler.isGM({ yid: 'itest_tester', accessLevel: 0 }), true,
      'в тестовом окружении itest_* получают GM для раннера');
  } finally {
    process.env.NODE_ENV = origEnv;
  }
};
