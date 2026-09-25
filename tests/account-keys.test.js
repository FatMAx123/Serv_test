// ============================================================
//  TESTS / ACCOUNT-KEYS.TEST.JS — Тесты кодовых слов для гостевых аккаунтов.
//  Проверка: 1:1 привязка, отсутствие дублей, удаление старых хэшей при смене,
//  rate limiting от брутфорса, извлечение localId для кросс-браузерного входа.
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const AccountKeys = require(path.join(ROOT, 'server', 'account-keys.js'));

const DB = require(path.join(ROOT, 'server', 'db.js'));

module.exports = async function (t) {
  t.suite('account-keys: валидация и привязка');

  const realStateBackup = await DB.loadSystemState('account_keys');
  try {
    await AccountKeys.resetForTesting();

  // 1. Валидация входных данных
  const shortRes = await AccountKeys.setCodeword('local_user1', '12345');
  t.eq(shortRes.ok, false, 'код короче 6 символов отклоняется');
  t.eq(shortRes.error, 'code_too_short', 'код ошибки code_too_short');

  const weak1 = await AccountKeys.setCodeword('local_user1', '123456');
  t.eq(weak1.ok, false, 'пароль 123456 отклоняется');
  t.eq(weak1.error, 'code_too_weak', 'код ошибки code_too_weak для 123456');

  const weak2 = await AccountKeys.setCodeword('local_user1', 'qwerty');
  t.eq(weak2.ok, false, 'пароль qwerty отклоняется');
  t.eq(weak2.error, 'code_too_weak', 'код ошибки code_too_weak для qwerty');

  const weak3 = await AccountKeys.setCodeword('local_user1', '111111');
  t.eq(weak3.ok, false, 'пароль 111111 отклоняется');
  t.eq(weak3.error, 'code_too_weak', 'код ошибки code_too_weak для повторяющихся символов');

  const noUpperRes = await AccountKeys.setCodeword('local_user1', 'secretpass123!');
  t.eq(noUpperRes.ok, false, 'код без заглавной буквы отклоняется');
  t.eq(noUpperRes.error, 'code_no_uppercase', 'код ошибки code_no_uppercase для setCodeword');

  const badYidRes = await AccountKeys.setCodeword('', 'Secretpass123');
  t.eq(badYidRes.ok, false, 'пустой yid отклоняется');

  // 2. Успешная установка кодового слова
  const setRes1 = await AccountKeys.setCodeword('local_alpha1', 'DragonHunter99');
  t.eq(setRes1.ok, true, 'успешная установка слова для local_alpha1');
  t.eq(setRes1.yid, 'local_alpha1', 'возвращён корректный yid');

  // 3. Статус привязки
  const stAlpha = await AccountKeys.getCodewordStatus('local_alpha1');
  t.eq(stAlpha.ok, true, 'статус получен');
  t.eq(stAlpha.hasCodeword, true, 'аккаунт local_alpha1 имеет кодовое слово');

  const stBeta = await AccountKeys.getCodewordStatus('local_beta2');
  t.eq(stBeta.hasCodeword, false, 'аккаунт local_beta2 пока не привязан');

  t.suite('account-keys: строго без дублей (1:1 связка)');

  // 4. Попытка другого аккаунта занять то же кодовое слово
  const dupRes = await AccountKeys.setCodeword('local_beta2', 'DragonHunter99');
  t.eq(dupRes.ok, false, 'чужое кодовое слово нельзя занять');
  t.eq(dupRes.error, 'code_taken', 'ошибка code_taken');

  // Регистронезависимая и пробельная проверка дубликата
  const dupResSpaced = await AccountKeys.setCodeword('local_beta2', '  dragonhunter99  ');
  t.eq(dupResSpaced.ok, false, 'дубликат в другом регистре и с пробелами тоже отклоняется');
  t.eq(dupResSpaced.error, 'code_taken', 'ошибка code_taken при нечувствительности к регистру');

  // 5. Смена кодового слова аккаунтом: старый хэш удаляется начисто (ноль дублей)
  const changeRes = await AccountKeys.setCodeword('local_alpha1', 'NewSecretSteel777');
  t.eq(changeRes.ok, true, 'успешная смена кодового слова для local_alpha1');

  // Теперь старое слово DragonHunter99 освободилось!
  const claimOldRes = await AccountKeys.setCodeword('local_beta2', 'DragonHunter99');
  t.eq(claimOldRes.ok, true, 'освободившееся слово успешно занято другим аккаунтом без сиротских дублей');

  t.suite('account-keys: вход по кодовому слову и кросс-браузерный перенос');

  // 6. Успешный вход
  const loginSuccess = await AccountKeys.loginByCodeword('NewSecretSteel777', '192.168.1.10');
  t.eq(loginSuccess.ok, true, 'успешный вход по кодовому слову');
  t.eq(loginSuccess.yid, 'local_alpha1', 'найден правильный yid');
  t.eq(loginSuccess.localId, 'alpha1', 'корректно извлечён localId для localStorage');
  t.ok(Array.isArray(loginSuccess.chars), 'loginByCodeword возвращает массив персонажей');

  // Регистронезависимый вход с пробелами
  const loginTrimCase = await AccountKeys.loginByCodeword('  newsecretsteel777  ', '192.168.1.10');
  t.eq(loginTrimCase.ok, true, 'вход работает с пробелами и любым регистром');
  t.eq(loginTrimCase.localId, 'alpha1', 'localId совпадает');

  // 7. Вход с неверным словом
  const loginFail = await AccountKeys.loginByCodeword('WrongPassword999', '192.168.1.20');
  t.eq(loginFail.ok, false, 'вход с неверным словом отклонён');
  t.eq(loginFail.error, 'invalid_codeword', 'ошибка invalid_codeword');

  t.suite('account-keys: защита от перебора (rate limiting по IP)');

  // 8. Брутфорс защита: 5 ошибок блокируют IP
  const bruteIp = '10.0.0.99';
  for (let i = 0; i < 4; i++) {
    const r = await AccountKeys.loginByCodeword('BadGuess_' + i, bruteIp);
    t.eq(r.ok, false, 'неудачная попытка ' + (i + 1));
  }
  // 5-я попытка
  const r5 = await AccountKeys.loginByCodeword('BadGuess_5', bruteIp);
  t.eq(r5.ok, false, '5-я неудачная попытка');

  // 6-я попытка — IP уже заблокирован
  const r6 = await AccountKeys.loginByCodeword('NewSecretSteel777', bruteIp);
  t.eq(r6.ok, false, '6-я попытка заблокирована rate limiter');
  t.eq(r6.error, 'rate_limited', 'ошибка rate_limited');

  // Разные IP не блокируют друг друга
  const cleanIpRes = await AccountKeys.loginByCodeword('NewSecretSteel777', '10.0.0.100');
  t.eq(cleanIpRes.ok, true, 'другой IP не заблокирован');

  t.suite('account-keys: HTTP API маршрутизация (/api/auth/*)');

  const createHttpRouter = require(path.join(ROOT, 'server', 'http', 'admin-api.js'));
  const httpRouter = createHttpRouter({
    getLastTickAt: () => Date.now(),
    metricsPayload: () => ({}),
    worldTimePayload: () => ({}),
    buildLeaderboard: () => [],
    players: new Map(),
    pidByYid: new Map(),
    wsByPid: new Map(),
    loggingIn: new Set(),
    lbTouch: () => {},
    lbDrop: () => {},
    clanLeaveOnCharDelete: () => ({ ok: true }),
    send: () => {},
    detachPlayer: () => {},
    kickYid: () => {},
    isGM: () => false,
    rebuildServerSpots: () => {},
    sanitizeCharName: (n) => n,
    isBadKey: () => false,
    YANDEX_SECRET: '',
    EDITOR_ENABLED: false,
    CLIENT_DIR: '',
    SHARED_DIR: ''
  });

  function testRoute(router, url, method, bodyJson) {
    return new Promise((resolve) => {
      const EventEmitter = require('events');
      const req = new EventEmitter();
      req.url = url;
      req.method = method;
      req.headers = { 'content-type': 'application/json' };
      req.socket = { remoteAddress: '127.0.0.1' };

      let statusCode = 200;
      let headers = {};
      let responseData = '';
      const res = {
        setHeader(k, v) { headers[k.toLowerCase()] = v; },
        writeHead(code, h) {
          statusCode = code;
          if (h) Object.assign(headers, h);
        },
        end(chunk) {
          if (chunk) responseData += chunk;
          let parsed = null;
          try { parsed = JSON.parse(responseData); } catch (_) {}
          resolve({ status: statusCode, headers, body: responseData, json: parsed });
        }
      };

      const handled = router.handleRequest(req, res);
      if (!handled) {
        resolve({ status: 404, notHandled: true });
        return;
      }

      if (bodyJson != null) {
        const payload = typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson);
        process.nextTick(() => {
          req.emit('data', Buffer.from(payload));
          req.emit('end');
        });
      } else {
        process.nextTick(() => {
          req.emit('end');
        });
      }
    });
  }

  // 9. Тест POST /api/auth/codeword-status
  const httpSt1 = await testRoute(httpRouter, '/api/auth/codeword-status', 'POST', { yid: 'local_gamma3' });
  t.eq(httpSt1.status, 200, 'HTTP статус 200 для проверки статуса');
  t.eq(httpSt1.json && httpSt1.json.ok, true, 'json.ok === true');
  t.eq(httpSt1.json && httpSt1.json.hasCodeword, false, 'hasCodeword === false для нового аккаунта');

  // 10. Тест POST /api/auth/set-codeword
  const httpSet = await testRoute(httpRouter, '/api/auth/set-codeword', 'POST', { yid: 'local_gamma3', codeword: 'SuperSafePass55' });
  t.eq(httpSet.status, 200, 'HTTP статус 200 для установки кодового слова');
  t.eq(httpSet.json && httpSet.json.ok, true, 'json.ok === true при установке');

  // Проверяем статус повторно
  const httpSt2 = await testRoute(httpRouter, '/api/auth/codeword-status', 'POST', { yid: 'local_gamma3' });
  t.eq(httpSt2.json && httpSt2.json.hasCodeword, true, 'hasCodeword стал true после установки');

  // 11. Тест POST /api/auth/login-codeword
  const httpLogin = await testRoute(httpRouter, '/api/auth/login-codeword', 'POST', { codeword: 'SuperSafePass55' });
  t.eq(httpLogin.status, 200, 'HTTP статус 200 для логина');
  t.eq(httpLogin.json && httpLogin.json.ok, true, 'логин успешен');
  t.eq(httpLogin.json && httpLogin.json.yid, 'local_gamma3', 'yid совпадает');
  t.eq(httpLogin.json && httpLogin.json.localId, 'gamma3', 'localId корректно извлечён');

  t.suite('account-keys: единый вход enterKey (вход или регистрация)');

  // 12. Регистрация нового аккаунта по ключу
  const regRes = await AccountKeys.enterKey('MySpecialKey999', '10.0.0.1');
  t.eq(regRes.ok, true, 'enterKey успешно создал новый аккаунт');
  t.eq(regRes.isNew, true, 'isNew === true для нового ключа');
  t.eq(regRes.action, 'created', 'action === "created"');
  t.ok(regRes.localId && regRes.yid, 'присвоены localId и yid');

  // 13. Вход по тому же ключу (с другого IP/браузера)
  const loginRes2 = await AccountKeys.enterKey('MySpecialKey999', '10.0.0.2');
  t.eq(loginRes2.ok, true, 'enterKey успешно вошёл по существующему ключу');
  t.eq(loginRes2.isNew, false, 'isNew === false для существующего ключа');
  t.eq(loginRes2.action, 'login', 'action === "login"');
  t.eq(loginRes2.yid, regRes.yid, 'yid полностью совпадает с созданным');
  t.eq(loginRes2.localId, regRes.localId, 'localId полностью совпадает');

  // 14. Отклонение слабого ключа при создании нового
  const weakNew = await AccountKeys.enterKey('111111', '10.0.0.3');
  t.eq(weakNew.ok, false, 'слабый ключ 111111 отклонён');
  t.eq(weakNew.error, 'code_too_weak', 'ошибка code_too_weak');

  // 15. Отклонение слишком короткого ключа (< 6)
  const shortKey = await AccountKeys.enterKey('Ab1!', '10.0.0.3');
  t.eq(shortKey.ok, false, 'ключ короче 6 символов отклонён');
  t.eq(shortKey.error, 'code_too_short', 'ошибка code_too_short для ключа < 6');

  // 15b. Отклонение ключа без заглавной буквы при регистрации
  const noUpperKey = await AccountKeys.enterKey('secretkey123!', '10.0.0.3');
  t.eq(noUpperKey.ok, false, 'ключ без заглавной буквы отклонён');
  t.eq(noUpperKey.error, 'code_no_uppercase', 'ошибка code_no_uppercase для enterKey');

  // 15c. Режимы mode: login и mode: create
  const modeLoginFail = await AccountKeys.enterKey('NonExistentKey99!', '10.0.0.3', '', 'login');
  t.eq(modeLoginFail.ok, false, 'режим login отклоняет несуществующий ключ');
  t.eq(modeLoginFail.error, 'key_not_found', 'ошибка key_not_found в режиме login');

  const modeCreateDup = await AccountKeys.enterKey('MySpecialKey999', '10.0.0.3', '', 'create');
  t.eq(modeCreateDup.ok, false, 'режим create отклоняет уже занятый ключ');
  t.eq(modeCreateDup.error, 'code_taken', 'ошибка code_taken в режиме create');

  // 15d. Вход из новой локации с восстановлением персонажей
  await DB.save(regRes.yid, { name: 'KnightOfSteel', level: 15 }, 'c0');
  const crossLocLogin = await AccountKeys.enterKey('MySpecialKey999', '172.16.0.88', '', 'login');
  t.eq(crossLocLogin.ok, true, 'успешный вход из новой локации по ключу');
  t.eq(crossLocLogin.yid, regRes.yid, 'yid совпадает с созданным на первой локации');
  t.ok(crossLocLogin.chars.some(c => c.name === 'KnightOfSteel'), 'персонажи из новой локации успешно получены');
  await DB.removeChar(regRes.yid, 'c0');

  // 16. HTTP тест POST /api/auth/enter-key
  const httpEnter = await testRoute(httpRouter, '/api/auth/enter-key', 'POST', { key: 'MySpecialKey999' });
  t.eq(httpEnter.status, 200, 'HTTP 200 для POST /api/auth/enter-key');
  t.eq(httpEnter.json && httpEnter.json.ok, true, 'HTTP json.ok === true');
  t.eq(httpEnter.json && httpEnter.json.localId, regRes.localId, 'HTTP вернул правильный localId');

  t.suite('account-keys: только английские буквы, цифры и спецсимволы (без русских)');

  // 17. Отклонение русских букв в enterKey
  const ruKey1 = await AccountKeys.enterKey('РусскийКлюч123', '10.0.0.4');
  t.eq(ruKey1.ok, false, 'ключ с русскими буквами отклонён');
  t.eq(ruKey1.error, 'code_invalid_chars', 'ошибка code_invalid_chars');

  // 18. Отклонение смеси англ + русские
  const ruKey2 = await AccountKeys.enterKey('SteamПароль_99', '10.0.0.4');
  t.eq(ruKey2.ok, false, 'смешанный ключ с кириллицей отклонён');
  t.eq(ruKey2.error, 'code_invalid_chars', 'ошибка code_invalid_chars');

  // 19. Отклонение русских букв в setCodeword и loginByCodeword
  const ruSet = await AccountKeys.setCodeword('local_alpha1', 'СекретноеСлово99');
  t.eq(ruSet.ok, false, 'setCodeword с русскими буквами отклонён');
  t.eq(ruSet.error, 'code_invalid_chars', 'ошибка code_invalid_chars для setCodeword');

  const ruLogin = await AccountKeys.loginByCodeword('СекретноеСлово99', '10.0.0.5');
  t.eq(ruLogin.ok, false, 'loginByCodeword с русскими буквами отклонён');
  t.eq(ruLogin.error, 'code_invalid_chars', 'ошибка code_invalid_chars для loginByCodeword');

  // 20. Успешный ключ с английскими буквами, цифрами и спецсимволами
  const engSymbolKey = await AccountKeys.enterKey('Alpha_Steel#2026!$', '10.0.0.6');
  t.eq(engSymbolKey.ok, true, 'ключ с англ. буквами и символами успешно принят');
  t.eq(engSymbolKey.action, 'created', 'новый аккаунт успешно создан');

  t.suite('account-keys: 4-этапное криптографическое шифрование и Envelope AES-256-GCM');

  // 21. Проверка формата многоэтапного хэша
  const testHash = AccountKeys.multiStageHash('MyVaultPassword2026!');
  t.ok(testHash.startsWith('ms4_'), 'хэш начинается с префикса 4-этапной защиты ms4_');
  t.eq(testHash.length, 68, 'длина хэша 68 символов (префикс + 64 hex SHA256 pepper)');

  // 22. Проверка зашифрованного конверта на диске
  const diskState = await DB.loadSystemState('account_keys');
  t.eq(diskState && diskState.v, 2, 'версия схемы хранилища v: 2');
  t.eq(diskState && diskState.enc, 'aes-256-gcm', 'алгоритм шифрования хранилища aes-256-gcm');
  t.ok(diskState && diskState.iv && diskState.iv.length === 24, 'присутствует 96-битный IV (24 hex)');
  t.ok(diskState && diskState.tag && diskState.tag.length === 32, 'присутствует 128-битный GCM Auth Tag (32 hex)');
  t.ok(diskState && diskState.data && typeof diskState.data === 'string', 'данные сохранены в виде шифротекста');
  t.eq(diskState && diskState.byHash, undefined, 'на диске НЕТ открытых незашифрованных структур byHash');

  // 23. Защита от модификации и подделки файла на диске (Tamper Detection)
  const tamperedState = {
    v: 2,
    enc: 'aes-256-gcm',
    iv: diskState.iv,
    tag: diskState.tag,
    data: diskState.data.slice(0, -2) + 'ff', // портим последний байт шифротекста
    updatedAt: Date.now()
  };
  await DB.saveSystemState('account_keys', tamperedState);
  const corruptedInit = await AccountKeys.init();
  t.eq(corruptedInit.ok, false, 'подделка или повреждение файла хранилища блокируется');
  t.eq(corruptedInit.error, 'vault_corrupted', 'ошибка vault_corrupted при неверном Auth Tag');

  // 24. Бесшовная миграция: загрузка устаревшего открытого формата sha256 и авто-апгрейд
  const legacyKey = 'OldLegacyKey#123';
  const legacyPlainHash = AccountKeys.legacyHash(legacyKey);
  const legacyStore = {
    byHash: {
      [legacyPlainHash]: {
        yid: 'local_migrated_user',
        createdAt: Date.now() - 100000,
        updatedAt: Date.now() - 100000
      }
    }
  };
  // Сохраняем как legacy JSON
  await DB.saveSystemState('account_keys', legacyStore);
  const initMigrated = await AccountKeys.init();
  t.eq(initMigrated.ok, true, 'legacy база успешно прочитана');
  t.ok(AccountKeys.byHash.has(legacyPlainHash), 'legacy хэш найден в памяти');

  // Игрок входит по своему старому ключу
  const migLogin = await AccountKeys.enterKey(legacyKey, '10.0.0.7');
  t.eq(migLogin.ok, true, 'вход по старому ключу прошёл успешно');
  t.eq(migLogin.yid, 'local_migrated_user', 'yid аккаунта совпал');
  t.eq(migLogin.action, 'login', 'действие login');

  // Проверяем, что хэш автоматически обновился на ms4_
  t.eq(AccountKeys.byHash.has(legacyPlainHash), false, 'старый sha256 хэш удалён из базы');
  const modernMigratedHash = AccountKeys.multiStageHash(legacyKey);
  t.ok(AccountKeys.byHash.has(modernMigratedHash), 'аккаунт переведён на 4-этапный хэш ms4_');

  // И файл на диске зашифрован в AES-256-GCM
  const postMigrateDisk = await DB.loadSystemState('account_keys');
  t.eq(postMigrateDisk.v, 2, 'файл на диске автоматически зашифрован в AES-256-GCM');
  t.eq(postMigrateDisk.enc, 'aes-256-gcm', 'алгоритм aes-256-gcm');

  } finally {
    if (realStateBackup && typeof realStateBackup === 'object') {
      await DB.saveSystemState('account_keys', realStateBackup);
      await AccountKeys.init();
    } else {
      await AccountKeys.resetForTesting();
    }
  }
};
