---
name: continuous-deploy
description: >-
  Обязательный протокол непрерывного авто-коммита, локальной сборки билда (dist/client)
  и синхронного деплоя на Render.com (ветка render-client) и боевой VPS (93.77.168.135).
  Активируется при любых изменениях в коде клиента или сервера Project Steam.
---

# Continuous Deploy & Auto-Commit Protocol (Project Steam)

Регламент непрерывного деплоя, локальной сборки и коммитов для проекта **Project Steam: Origins**.

> [!IMPORTANT]
> **ЖЕЛЕЗНОЕ ПРАВИЛО:**
> Любое изменение в коде (как клиента, так и сервера) **обязано немедленно коммититься в git и деплоиться на целевые сервера** (Render.com и/или боевой VPS `93.77.168.135`), а также собираться в локальную папку билда `dist/client/`. Ни одна задача не считается завершенной без выполнения полного цикла деплоя.

---

## 1. Конвейер при изменении КЛИЕНТА (`client/`, `shared/`)

Когда редактируются HTML, CSS, JavaScript клиента или общие игровые базы:

1. **Локальная сборка в папку билда `dist/client/`**:
   ```bash
   node scripts/build-client.js
   ```
   *Создает ультра-чистый релизный клиент в `dist/client/` без редактора и мусора.*

2. **Коммит изменений в git (ветка `main`)**:
   ```bash
   git add <измененные_файлы>
   git commit -m "feat/fix(client): описание изменений"
   ```

3. **Деплой на Render.com**:
   ```bash
   node scripts/deploy-render.js
   ```
   *Собирает релиз и пушит в ветку `origin/render-client`, к которой привязан веб-сервис на Render.*

4. **Синхронизация на боевой VPS (`93.77.168.135`)**:
   ```bash
   node scripts/sync-client-vps.js
   ```
   *Мгновенно обновляет клиентские файлы в `/var/www/project-steam/client/` и делает мягкий рестарт PM2.*

5. **Пуш в основную ветку GitHub**:
   ```bash
   git push origin main
   ```

---

## 2. Конвейер при изменении СЕРВЕРА (`server/`, `data/`, `native/`, `shared/`)

Когда редактируется серверный код, баланс, БД, C++ модуль или сетевой транспорт:

1. **Проверка архитектурных инвариантов**:
   ```bash
   node scripts/guard-anti-rollback.js
   ```
   *Проверяет 22 инварианта Zero Rollback Policy (AVX2 SIMD, uWebSockets.js, Worker Threads, Bot Throttling).*

2. **Коммит изменений в git**:
   ```bash
   git add <измененные_файлы>
   git commit -m "feat/fix(server): описание изменений"
   ```

3. **Полный деплой на боевой VPS (`93.77.168.135`)**:
   ```bash
   node scripts/deploy-vps.js
   ```
   *Переносит сервер, выполняет сборку C++ нативного аддона `node-gyp rebuild`, перезапускает PM2 и проводит удаленную верификацию.*

4. **Пуш в основную ветку GitHub**:
   ```bash
   git push origin main
   ```

---

## 3. Универсальный запуск одной командой (All-in-One)

Для быстрого выполнения всех этапов сразу создан единый оркестратор:

```bash
node scripts/auto-deploy-all.js "Ваше сообщение коммита"
```

Команда автоматически выполняет:
1. `guard-anti-rollback.js` — контроль инвариантов
2. `build-client.js` — сборка в `dist/client`
3. `deploy-render.js` — деплой на Render (`render-client`)
4. `sync-client-vps.js` — синхронизация клиента на VPS и рестарт PM2
5. `git add -A && git commit` — фиксация изменений
6. `git push origin main` — пуш в GitHub

---

---

## 4. Конвейер 3D-ассетов (FBX → Draco GLB & Lineage WebP)

При добавлении любых новых 3D-моделей (оружие, броня, монстры, пропсы) действует строгий регламент подготовки:

1. **Конвертация в GLB с Draco-компрессией:**
   ```bash
   # Конвертация единичной модели:
   node scripts/convert-assets.js client/assets/weapons/models/new_weapon.fbx

   # Или пакетная обработка всей папки:
   node scripts/convert-assets.js client/assets/weapons/models/
   ```
   *Уменьшает размер геометрии в 10–30 раз через headless Blender 5.2 и Draco encoder.*

2. **Оптимизация текстур в Lineage-формат (WebP):**
   ```bash
   node scripts/convert-assets.js client/assets/weapons/textures/new_weapon.png
   ```
   *Ограничивает разрешение до 1024x1024 (оружие/персонажи) или 512x512 (пропсы), применяет WebP 82% качество и Lanczos-интерполяцию.*

3. **Изоляция Dev-исходников от Релиза (`dist/client/`):**
   - Сырые `.fbx`, исходники `.blend`, `.zip` архивы и видеозаписи `.mp4` остаются в dev-директории и исключаются из сборки.
   - Скрипт `scripts/build-client.js` гарантирует, что в `dist/client/` попадают только оптимизированные боевые ассеты, сохраняя размер архива < 100 МБ для Яндекс Игр.

---

## 5. Чек-лист проверки готовности

- [ ] Все новые 3D-модели сконвертированы в `.glb` с Draco (сырые FBX не попадают в билд).
- [ ] Все текстуры оптимизированы в `.webp` (макс. 1024x1024, без кириллицы и пробелов).
- [ ] В `git status` чисто (нет потерянных незакоммиченных правок).
- [ ] Папка `dist/client` содержит свежий собранный клиент (`index.html` и ассеты, размер < 100 МБ).
- [ ] Ветка `render-client` на GitHub обновлена (Render.com перезапустил статику).
- [ ] Боевой VPS `93.77.168.135` получил свежие файлы, статус PM2: `online`, память < 200MB.
- [ ] Ветка `main` на GitHub синхронизирована.

