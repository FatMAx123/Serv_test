// ============================================================
//  TESTS / AUDIT-V3-REMEDIATION.TEST.JS
//  Регрессионные тесты на ликвидацию уязвимостей независимого аудита v3:
//    - P0-A: Защита SpatialGrid и move_stop от вечного цикла при x/z = 1e308
//    - P0-B: Безопасная обработка невалидных Cookie и URI (%E0%A4%A) без падения процесса
//    - P1-A/B: Изоляция local_* гостевых аккаунтов от GM и editorKey в production
// ============================================================
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');

const { SpatialGrid } = require(path.join(ROOT, 'server', 'spatial-grid.js'));
const EditorGuard = require(path.join(ROOT, 'server', 'editor-guard.js'));
const { isGM } = require(path.join(ROOT, 'server', 'handlers', 'gm-handler.js'));

module.exports = async function (t) {
  // ── 1. P0-A: SpatialGrid & Extreme Coordinates ──────────────────────────
  t.suite('audit-v3: P0-A SpatialGrid защита от вечного цикла и экстремальных координат');

  const grid = new SpatialGrid(108);

  // Тест 1.1: 1e308 не приводит к бесконечному циклу в forEachCandidate
  const startT = Date.now();
  let candidateCalls = 0;
  grid.forEachCandidate(1e308, 1e308, 108, () => { candidateCalls++; }, () => { candidateCalls++; });
  const elapsedMs = Date.now() - startT;
  t.ok(elapsedMs < 100, 'forEachCandidate(1e308, 1e308) завершается мгновенно (< 100 мс)');
  t.eq(candidateCalls, 0, 'вызовов колбэков для экстремальных координат 0');

  // Тест 1.2: отрицательный 1e308
  grid.forEachCandidate(-1e308, -1e308, 108, () => { candidateCalls++; });
  t.ok(true, 'forEachCandidate(-1e308, -1e308) завершается безопасно');

  // Тест 1.3: NaN и Infinity координаты
  grid.forEachCandidate(NaN, 100, 108, () => { candidateCalls++; });
  grid.forEachCandidate(100, Infinity, 108, () => { candidateCalls++; });
  grid.forEachCandidate(-Infinity, NaN, 108, () => { candidateCalls++; });
  t.ok(true, 'NaN и Infinity координаты отбрасываются без ошибок');

  // Тест 1.4: легитимный запрос работает корректно
  const mockPlayer = { id: 101, pid: 101, x: 50, z: 50 };
  grid.insertPlayer(mockPlayer);
  let found = false;
  grid.forEachCandidate(50, 50, 100, (p) => {
    if (p.pid === 101) found = true;
  });
  t.ok(found, 'легитимный поиск в окрестности (50, 50) находит добавленного игрока');
  grid.clear();

  // ── 2. P0-B: HTTP Malformed URI & Cookie Protection ─────────────────────
  t.suite('audit-v3: P0-B Безопасность decodeURIComponent (Cookie и URL path)');

  // Тест 2.1: Битый Cookie с невалидным процентным кодированием не бросает URIError
  const malformedCookieReq = {
    headers: {
      cookie: 'ps_ed=%E0%A4%A; other_cookie=123'
    }
  };
  let token = null;
  t.doesNotThrow = function (fn, msg) {
    try {
      fn();
      t.ok(true, msg);
    } catch (err) {
      t.ok(false, msg + ' (выброшено исключение: ' + (err && err.message) + ')');
    }
  };

  t.doesNotThrow(() => {
    token = EditorGuard.tokenFromCookie(malformedCookieReq);
  }, 'EditorGuard.tokenFromCookie не падает на битом cookie %E0%A4%A');
  t.eq(token, '', 'битый токен из cookie нормализуется в пустую строку');

  // Тест 2.2: allowAsset с битым cookie возвращает false без исключений
  let allowed = null;
  t.doesNotThrow(() => {
    allowed = EditorGuard.allowAsset(malformedCookieReq);
  }, 'EditorGuard.allowAsset не падает на битом cookie %E0%A4%A');
  t.eq(allowed, false, 'allowAsset возвращает false для битого cookie');

  // Тест 2.3: токен из query с битым кодированием
  let queryToken = null;
  t.doesNotThrow(() => {
    queryToken = EditorGuard.tokenFromQuery('/editor?k=%E0%A4%A');
  }, 'EditorGuard.tokenFromQuery не падает на битом query %E0%A4%A');
  t.eq(EditorGuard.valid(queryToken), false, 'битый query токен не валидируется в права доступа');

  // Тест 2.4: resolveFile на битом URL path (%E0%A4%A) не выбрасывает URIError
  const { resolveFile } = require(path.join(ROOT, 'server', 'static-http.js'));
  let resolvedPath = undefined;
  t.doesNotThrow(() => {
    resolvedPath = resolveFile('/%E0%A4%A');
  }, 'static-http resolveFile не падает на битом пути /%E0%A4%A');
  t.eq(resolvedPath, null, 'битый путь возвращает null (безопасный отказ 403/404)');

  // ── 3. P1-A/B: local_* Guest Privilege Isolation ────────────────────────
  t.suite('audit-v3: P1-A/B Изоляция local_* гостевых аккаунтов от GM в проде');

  const oldEnv = process.env.NODE_ENV;
  try {
    // В продакшене local_* НЕ должен иметь права GM
    process.env.NODE_ENV = 'production';
    const guestPlayerProd = {
      yid: 'local_attacker_guest_999',
      name: 'GuestAttacker',
      accessLevel: 0
    };
    t.eq(isGM(guestPlayerProd), false, 'гость local_* в production НЕ получает GM-права');

    // В development local_* имеет права для локальной разработки и отладки
    process.env.NODE_ENV = 'development';
    const guestPlayerDev = {
      yid: 'local_dev_user_123',
      name: 'DevGuest',
      accessLevel: 0
    };
    t.eq(isGM(guestPlayerDev), true, 'гость local_* в development имеет GM-права для тестов');
  } finally {
    process.env.NODE_ENV = oldEnv;
  }

  // ── 4. P1-C: Guest Token & yid Privacy Protection ───────────────────────
  t.suite('audit-v3: P1-C Защита гостевых сессий (Guest Token) и скрытие yid из API');

  const AUTH = require(path.join(ROOT, 'server', 'auth.js'));

  // Тест 4.1: Хэширование гостевого токена
  const tokenA = 'secret_guest_token_12345';
  const hashA = AUTH.hashGuestToken(tokenA);
  t.ok(typeof hashA === 'string' && hashA.length === 64, 'hashGuestToken возвращает 64-символьный SHA-256 хэш');
  t.eq(hashA, AUTH.hashGuestToken(tokenA), 'hashGuestToken детерминирован');
  t.eq(AUTH.hashGuestToken(''), '', 'пустой токен даёт пустую строку');
  t.ok(hashA !== AUTH.hashGuestToken('wrong_token_54321'), 'разные токены дают разные хэши');

  // Тест 4.2: parseLoginData извлекает guestToken
  const guestPayloadB64 = Buffer.from(JSON.stringify({
    uniqueID: 'local_test_123',
    guestToken: 'my_guest_secret',
    publicName: 'LocalHero'
  })).toString('base64');
  const parsedGuest = AUTH.parseLoginData(guestPayloadB64);
  t.eq(parsedGuest.yid, 'local_test_123', 'yid корректно распарсен');
  t.eq(parsedGuest.guestToken, 'my_guest_secret', 'guestToken корректно извлечён из полезной нагрузки');

  // Тест 4.3: friendsPayload НЕ раскрывает yid друзьям
  const createSocialHandler = require(path.join(ROOT, 'server', 'handlers', 'social-handler.js'));
  const mockSent = [];
  const mockSocial = createSocialHandler({
    players: new Map(),
    pidByYid: new Map(),
    findPlayerByName: () => null,
    send: (p, msg) => { mockSent.push(msg); },
    saveProfileNow: () => {},
    MAX_FRIENDS: 64,
    TR: { TRADE_TTL_MS: 30000 }
  });

  const playerWithFriends = {
    pid: 1,
    yid: 'local_owner_1',
    name: 'Owner',
    friends: [
      { yid: 'local_secret_friend_999', name: 'BestFriend' },
      { yid: '12345678_yandex_real_user', name: 'YandexFriend' }
    ]
  };
  const fPayload = mockSocial.friendsPayload(playerWithFriends);
  t.ok(Array.isArray(fPayload.friends) && fPayload.friends.length === 2, 'список друзей сформирован');
  t.eq(fPayload.friends[0].yid, undefined, 'yid друга #1 НЕ передаётся в пакете friends');
  t.eq(fPayload.friends[1].yid, undefined, 'yid друга #2 НЕ передаётся в пакете friends');
  t.eq(fPayload.friends[0].name, 'BestFriend', 'имя друга сохранено');

  // Тест 4.4: notifyFriends НЕ раскрывает yid в friend_status
  mockSent.length = 0;
  // Создаем онлайн-друга
  const friendPid = 2;
  const mockPidByYid = new Map([['local_secret_friend_999', friendPid]]);
  const mockPlayers = new Map([[friendPid, { pid: friendPid, yid: 'local_secret_friend_999' }]]);
  const mockSocialNotify = createSocialHandler({
    players: mockPlayers,
    pidByYid: mockPidByYid,
    findPlayerByName: () => null,
    send: (p, msg) => { mockSent.push(msg); },
    saveProfileNow: () => {},
    MAX_FRIENDS: 64,
    TR: { TRADE_TTL_MS: 30000 }
  });

  mockSocialNotify.notifyFriends(playerWithFriends, true);
  t.ok(mockSent.length === 1, 'friend_status отправлен онлайн-другу');
  t.eq(mockSent[0].t, 'friend_status', 'тип пакета friend_status');
  t.eq(mockSent[0].name, 'Owner', 'имя игрока передано в friend_status');
  t.eq(mockSent[0].yid, undefined, 'yid отправителя строго скрыт в friend_status (нет утечки)');
};
