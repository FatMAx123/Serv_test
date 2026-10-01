# Аудит 35: Ликвидация Уязвимостей Стороннего Независимого Аудита v3 (P0-A, P0-B, P1-A/B)
**Project Steam — Архитектурная Безопасность и Отказоустойчивость**

---

## 1. Введение и Контекст
В ходе независимого динамического аудита сервера Project Steam v3 (с фаззингом 94 типов WS-сообщений и эндпоинтов HTTP) были выявлены и подтверждены воспроизведением на живом процессе две критические уязвимости DoS (P0) и векторы эскалации привилегий гостевых аккаунтов (P1).

Все замечания стороннего аудита были сопоставлены с актуальной кодовой базой `project-steam1`, перепроверены и устранены с сохранением всех неизменяемых архитектурных инвариантов проекта (C++ SIMD AVX2, uWebSockets.js Zero-GC, Worker Threads persistence offload, zero-stutter rendering).

---

## 2. Верифицированные Уязвимости и Методы Исправления

### P0-A. Вечный цикл в AOI через `move_stop` (DoS всего мира одним пакетом)
* **Статус:** ИСПРАВЛЕНО И ВЕРИФИЦИРОВАНО
* **Затронутые файлы:** `server/server.js`, `server/spatial-grid.js`
* **Механика дефекта:**
  В обработчике `move` стояло строгое ограничение координат мира `[-20000, 20000]`. В обработчике `move_stop` проверка отсутствовала. Пакет `{t: 'move_stop', x: 1e308, z: 1e308}` записывал экстремальные значения в `p.x/p.z`. В `SpatialGrid.forEachCandidate` значение `minCx = Math.floor((1e308 - r)/108) ≈ 9.26e305`. В стандарте IEEE 754 при таких числах `cx + 1 === cx`, из-за чего цикл `cx++` зацикливался навсегда, подвешивая Event Loop на 100% CPU.
* **Внедрённое исправление:**
  1. В `server/server.js` в `case 'move_stop':` добавлен строгий кламп:
     ```javascript
     if (sx < -20000 || sx > 20000 || sz < -20000 || sz > 20000) return;
     ```
  2. В `server/spatial-grid.js` в `forEachCandidate` добавлен эшелон защиты (defense-in-depth):
     ```javascript
     if (!Number.isFinite(x) || !Number.isFinite(z)) return;
     if (!Number.isFinite(minCx) || !Number.isFinite(maxCx) || !Number.isFinite(minCz) || !Number.isFinite(maxCz)) return;
     if ((maxCx - minCx) > 100 || (maxCz - minCz) > 100 || (maxCx - minCx) < 0 || (maxCz - minCz) < 0) return;
     if (minCx < -2000 || maxCx > 2000 || minCz < -2000 || maxCz > 2000) return;
     ```

---

### P0-B. Падение HTTP-процесса на некорректном Cookie или URL (Unauthenticated Crash)
* **Статус:** ИСПРАВЛЕНО И ВЕРИФИЦИРОВАНО
* **Затронутые файлы:** `server/editor-guard.js`, `server/static-http.js`, `server/server.js`, `server/cluster-manager.js`
* **Механика дефекта:**
  Вызовы `decodeURIComponent` на строках с поврежденным процентным кодированием (например `Cookie: ps_ed=%E0%A4%A` или `GET /%E0%A4%A`) вызывали неперехваченное исключение `URIError: URI malformed`. В `server.js` оно перехватывалось `process.on('uncaughtException')`, провоцируя вызов `shutdown('uncaughtException')` и гибель игрового процесса. В `static-http.js` происходил моментальный краш процесса Node.js.
* **Внедрённое исправление:**
  1. В `server/editor-guard.js` функция `tokenFromCookie` обернута в безопасный `try/catch`, возвращая пустую строку при битых cookie.
  2. В `server/static-http.js` функция `resolveFile` обернута в `try/catch`, возвращая `null` (безопасный отказ 403/404) при невалидном пути.
  3. В `server/server.js` и `server/cluster-manager.js` парсинг `urlPath` в `serveStatic` снабжен перехватом `URIError` с возвратом HTTP 400 Bad Request.

---

### P1-A / P1-B. Изоляция `local_*` гостевых аккаунтов от GM-прав и утечки `editorKey`
* **Статус:** ИСПРАВЛЕНО И ВЕРИФИЦИРОВАНО
* **Затронутые файлы:** `server/handlers/gm-handler.js`, `server/handlers/world-time-handler.js`
* **Механика дефекта:**
  В `handlers/gm-handler.js` строка `if (p.yid && String(p.yid).startsWith('local_')) return true;` находилась вне блока `if (process.env.NODE_ENV !== 'production')`. В результате любой внешний клиент, указавший `uniqueID: "local_..."`, в боевом режиме получал статус GM, AccessLevel 100 и `editorKey` в welcome-пакете.
* **Внедрённое исправление:**
  1. Проверка префикса `local_` перенесена строго внутрь блока `if (process.env.NODE_ENV !== 'production')`.
  2. В `server/handlers/world-time-handler.js` команды управления временем для `local_*` также заблокированы в продакшене.
  3. В продакшене гостевой аккаунт имеет `accessLevel: 0`, `gm: false` и не получает ключ редактора.

---

### P1-C. Защита гостевых сессий от захвата/вытеснения (Guest Secret Token & yid Privacy)
* **Статус:** ИСПРАВЛЕНО И ВЕРИФИЦИРОВАНО
* **Затронутые файлы:** `server/auth.js`, `server/server.js`, `server/http/admin-api.js`, `server/handlers/social-handler.js`, `client/js/net-ws.js`, `client/js/char-select.js`
* **Механика дефекта:**
  Для реальных игроков Яндекс Игр подлинность входа гарантируется криптографической HMAC-SHA256 подписью (`YANDEX_APP_SECRET`). Однако для гостевых аккаунтов (`local_*`) проверка подписи отсутствовала. Зная чужой `yid` (который к тому же раскрывался в `friendsPayload` и `friend_status`), злоумышленник мог отправить пакет входа с чужим `uniqueID`, что приводило к вытеснению легитимного игрока (`4008: logged in elsewhere`) и захвату его персонажа.
* **Внедрённое исправление:**
  1. **Криптографический токен гостя (Guest Secret Token):**
     * В браузере гостя генерируется секретный ключ `ps_guest_token` (UUID / 32 байта криптографической энтропии), сохраняемый в `localStorage` и никогда не раскрываемый третьим лицам.
     * При создании гостевого профиля сервер сохраняет `pr.guestTokenHash = AUTH.hashGuestToken(token)`.
     * В `server.js:doLogin`: если игрок уже в сети (`prevPid != null`), перед вызовом `detachPlayer` сервер проверяет хэш токена. При несовпадении атакующий немедленно отклоняется с ошибкой `4003: bad guest token`, а онлайн-игрок **не вытесняется и продолжает играть**.
     * В `doLoginInner` и `admin-api.js`: доступ к персонажам и оффлайн-профилю без правильного токена блокируется.
  2. **Скрытие системного `yid` из публичного API:**
     * Из `friendsPayload` и `friend_status` полностью удалено поле `yid`. Обновления статусов друзей на клиенте сопоставляются по имени (`name`), предотвращая раскрытие идентификаторов аккаунтов посторонним.

---

## 3. Результаты Автоматизированного Тестирования
Создан отдельный регрессионный сьют `tests/audit-v3-remediation.test.js`:
* `SpatialGrid.forEachCandidate(1e308, 1e308)` — мгновенное завершение (< 1 мс), 0 зависаний.
* `SpatialGrid.forEachCandidate(-1e308, -1e308)` — безопасное завершение.
* `SpatialGrid.forEachCandidate(NaN, Infinity)` — безопасный отброс.
* `EditorGuard.tokenFromCookie` на `ps_ed=%E0%A4%A` — возвращает `''` без исключений.
* `EditorGuard.allowAsset` на невалидном cookie — безопасный `false`.
* `static-http resolveFile` на `/%E0%A4%A` — возвращает `null` (404), процесс жив.
* `isGM(local_*)` в `NODE_ENV=production` — строго `false`.
* `isGM(local_*)` в `NODE_ENV=development` — `true` (для локальной разработки).
* `AUTH.hashGuestToken` — 64-символьный детерминированный SHA-256 хэш.
* `parseLoginData` — извлекает `guestToken`.
* `friendsPayload` — гарантированно не содержит `yid` в объектах друзей.
* `notifyFriends` — скрывает `yid` отправителя в `friend_status`.

Все 22 инварианта `scripts/guard-anti-rollback.js` и 100% тестов безопасности пройдены успешно (**OK: 29/29 в сьюте remediation, 260/260 в client, 3772/3772 в регрессе проекта**).

