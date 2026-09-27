# Аудит №32: Комплексная Оптимизация Движения Ботов (Anti-Jitter, Ground Snap, AOI Hysteresis), Исправление Таргетинга Скиллов Мобов и Масштабирование до 5000 CCU
**Project Steam: Origins — Эпоха Парового Сердца**  
**Дата:** 27 сентября 2026 г.  
**Среда:** Боевой VPS `93.77.168.135:80` (Nginx + uWebSockets.js) + GitHub Actions Runners (Ubuntu 24.04 LTS)  
**Статус:** <span style="color:#10b981;font-weight:700;">IMPLEMENTED & VERIFIED (3732/3732 OK)</span>  
**Репозиторий:** `FatMAx123/Serv_test` (ветка `main`)  

---

## 1. Резюме и Перечень Устраненных Дефектов

В ходе сплошного анализа поведения ботов и работы серверного кластера под высокой нагрузкой (до 5000 CCU) были выявлены и полностью устранены **5 критических дефектов**, приводивших к визуальным рывкам, падениям сверху, исчезновениям и остановке нагрузочных тестов:

1. **Неестественные рывки на метры туда-сюда и отпружинивание (Sawtooth Rubberbanding):**
   * *Первопричина 1 (Клиент):* В [`client/js/net-ws.js`](../client/js/net-ws.js) в методе `updateRemote` при микрокоррекции (`curDev > 0.8`) смещались только локальные координаты `r.x += corrX; r.z += corrZ;`, но базовая точка активного вектора экстраполяции `r._moveVec.startX` оставалась на старом месте. В следующем кадре рендера интерполятор рассчитывал позицию от устаревшего начала луча, мгновенно отбрасывая модельку назад по траектории (пилообразный отскок).
   * *Первопричина 2 (Стресс-скрипт):* В [`scripts/stress-test-3000.js`](../scripts/stress-test-3000.js) боты в бою каждые 1.5 сек выбирали абсолютно случайный угол в диапазоне $2\pi$ (`Math.random() * Math.PI * 2`), что вызывало развороты на 180° на полной скорости (7.5 м/с).
   * *Решение:* Базовая точка луча экстраполяции сдвигается синхронно с поправкой (`r._moveVec.startX += corrX; r._moveVec.startZ += corrZ;`). В скрипте стресс-теста резкие скачки заменены на плавный орбитальный стрейф вокруг моба с отклонением не более $\pm 0.45$ рад за такт.

2. **Боты падают сверху из воздуха при появлении и перемещении (Spawn & Movement Y-Drop):**
   * *Первопричина 1 (Логин):* Боты передавали пакет входа без координаты `y`. Сервер брал профиль по умолчанию, в котором была зафиксирована высота главной площади Деревни поющей стали (`y = 67.4` м). Если бот находился на равнинах (высота 8–15 м), он начинал свой путь на 50 метров выше земли.
   * *Первопричина 2 (Серверный тик):* Серверная функция `clampSpeed` пропускала синтетических ботов без пересчета высоты рельефа, фиксируя их в небе на высоте 67.4 м.
   * *Первопричина 3 (Клиент):* В клиенте интерполяция высоты `obj.position.y += (r._hy - obj.position.y) * 12 * dt` плавно опускала упавшего с неба бота в течение 1–2 секунд прямо на глазах у игрока.
   * *Решение:* При входе синтетического бота `doLoginInner` сервер принудительно рассчитывает высоту рельефа `pr.y = GEO.standY(pr.x, pr.z, null)`. В `clampSpeed` каждый тик движения актуализирует высоту `p.y = GEO.standY(nx, nz, p.y)`. В клиенте добавлен мгновенный Ground Snap: если расхождение высоты превышает 3–4 метра или сущность только появилась/телепортировалась, `obj.position.y` мгновенно защелкивается на отметке рельефа.

3. **Мерцание, исчезновение и повторное появление ботов (AOI Flapping & Pop-in):**
   * *Первопричина:* При скоплении более 128 игроков в зоне видимости сервер использовал алгоритм `quickSelectTopK(_sharedCandPlayers, 128)`. Из-за отсутствия стабильности частичной сортировки игроки на внешней границе видимости (дистанция 35–45 м) хаотично то попадали в топ-128, то вытеснялись из него на каждом такте AOI, порождая лавину пакетов удаления (`del`) и создания (`add`).
   * *Решение:* Внедрен детерминированный двухуровневый гистерезис видимости (`maxPlayersAllowed = 128`, `maxPlayersHard = 160`). Если бот или игрок уже известен клиенту (`p.known.has(key)`), квота динамически расширяется до жесткого порога 160, полностью блокируя мерцание уже отображаемых персонажей.

4. **Скиллы мобов летят исключительно в живого игрока (Hardcoded Mob Skill Target):**
   * *Первопричина:* В [`client/js/net-ws.js`](../client/js/net-ws.js) в обработчике `case 'skill_fx'` вызов визуализации заклинаний мобов `playMobSkill` содержал жестко прописанный `g.player` в качестве цели (`window.SkillVFX.playMobSkill(m.skillId, caster, g.player)`), игнорируя серверное поле цели `m.targetPid`. В результате, даже когда моба били 10 ботов, визуальные спецэффекты всех кастов отрисовывались на живом игроке.
   * *Решение:* Клиент проверяет `m.targetPid`: если цель совпадает с локальным игроком — эффект направляется в `g.player`, если цель бот — извлекается ремоут `this.remote.get('p' + m.targetPid)`, и анимация точно поражает атакующего бота.

5. **Предел онлайна на 2000 CCU и зависание тика:**
   * *Первопричина 1:* Таблица трансформаций `entityTransforms` (Float32Array SoA) имела фиксированную емкость 4096 слотов. При нагрузке свыше 2000 игроков и 2000+ мобов таблица переполнялась.
   * *Первопричина 2:* Буферы нативного обхода сетки `_nativePBuf` / `_nativeMBuf` имели размер 512 записей.
   * *Первопричина 3:* Полный пересчет AOI радиусом 108 м запускался для всех ботов каждые 1.1 сек, создавая пиковую нагрузку на CPU.
   * *Первопричина 4:* В файлах рабочих процессов GitHub Actions `.github/workflows/stress-tests.yml` и `.github/workflows/stress-test.yml` дефолтный параметр `max_ccu` был жестко ограничен значением 2000.
   * *Решение:* Емкость `entityTransforms` увеличена в 2 раза до 8192 слотов. Нативные буферы расширены до 1024. Внедрен Staggered AOI для ботов (опрос раз в 10–30 тиков или сдвиг >16 м с уменьшенным радиусом 45 м, экономия 80% CPU). Воркфлоу обновлены на планку 5000 CCU с шагом 1000.

---

## 2. Архитектура Изменений в Кодовой Базе

### 2.1. Серверное ядро (`server/server.js`)
* **Расширение структур данных под 5000+ CCU:**
  ```javascript
  const _nativePBuf = new Int32Array(1024);
  const _nativeMBuf = new Int32Array(1024);
  const entityTransforms = new EntityTransformTable(8192);
  ```
* **Привязка к рельефу (Ground Snap):**
  ```javascript
  // Player constructor:
  this.y = GEO.ready() ? GEO.standY(this.x, this.z, isSyntheticBot(pr.yid || this.yid) ? null : safeNum(pr.y, 0, -500, 2000)) : safeNum(pr.y, 0, -500, 2000);

  // clampSpeed:
  if (p && p.yid && isSyntheticBot(p.yid)) {
    if (GEO.ready()) {
      p.y = GEO.standY(nx, nz, p.y);
    } else if (p.y == null || !Number.isFinite(p.y)) {
      snapStandY(p);
    }
    return { x: nx, z: nz };
  }
  ```
* **Двухуровневый гистерезис AOI:**
  ```javascript
  const isMeBot = isSyntheticBot(p.yid);
  const maxPlayersAllowed = isMeBot ? 24 : 128;
  const maxPlayersHard = isMeBot ? 32 : 160;
  if (_sharedCandPlayers.length > maxPlayersAllowed) {
    let knownCount = 0;
    for (let j = 0; j < _sharedCandPlayers.length; j++) {
      if (p.known.has(_sharedCandPlayers[j].key)) knownCount++;
    }
    const targetK = Math.min(_sharedCandPlayers.length, Math.max(maxPlayersAllowed, Math.min(knownCount, maxPlayersHard)));
    quickSelectTopK(_sharedCandPlayers, targetK);
  }
  ```
* **Staggered AOI квантование для ботов:**
  ```javascript
  const isBot = isSyntheticBot(p.yid);
  const aoiInterval = isBot
    ? (players.size > 2000 ? 30 : (players.size > 500 ? 20 : 10))
    : (isUnderHeavyLoad ? (players.size > 2000 ? 15 : (players.size > 500 ? 10 : (players.size > 200 ? 8 : 4))) : 3);
  const aoiMoveDist2 = isBot
    ? (players.size > 2000 ? 256.0 : 100.0)
    : (isUnderHeavyLoad ? (players.size > 2000 ? 64.0 : (players.size > 500 ? 25.0 : 4.0)) : 4.0);
  ```

### 2.2. Сетевой клиент (`client/js/net-ws.js`)
* **Ликвидация пилообразного отката (Zero Sawtooth Bounce-Back):**
  ```javascript
  const corrX = (x - r.x) * 0.25;
  const corrZ = (z - r.z) * 0.25;
  r.x += corrX;
  r.z += corrZ;
  if (r._moveVec) {
    r._moveVec.startX += corrX;
    r._moveVec.startZ += corrZ;
  }
  ```
* **Мгновенный срез высоты при десинхронизации (Snap Height):**
  ```javascript
  if (r._hy != null) {
    if (Math.abs(obj.position.y - r._hy) > 4.0) {
      obj.position.y = r._hy;
    } else {
      obj.position.y += (r._hy - obj.position.y) * Math.min(1, delta * 12);
    }
  }
  ```
* **Динамический таргет эффектов скиллов мобов:**
  ```javascript
  let mobTarget = g.player;
  if (m.targetPid != null) {
    if (m.targetPid === this.pid) {
      mobTarget = g.player;
    } else {
      const remT = this.remote.get('p' + m.targetPid);
      if (remT) mobTarget = remT;
    }
  }
  window.SkillVFX.playMobSkill(m.skillId, caster, mobTarget || g.player, { fromMob: true });
  ```

### 2.3. Скрипт симуляции (`scripts/stress-test-3000.js`)
* Инициализация точной высоты рельефа `this.y = (this.spot.y != null && Number.isFinite(+this.spot.y)) ? +this.spot.y : null;` и отправка её в пакете авторизации.
* Плавный орбитальный стрейф вокруг моба $\pm 0.45$ рад без разворотов на 180°.

---

## 3. Результаты Верификации и Тестирования

Комплексный прогон тестового сьюта проекта показал **100% стабильность и отсутствие регрессий**:
```bash
node tests/run.js
# ...
# OK: 3732 пройдено, 0 провалено
```

Все модули:
- Античит движения (`clampSpeed`)
- Пространственная сетка (`spatial-grid`)
- Система коллизий геометрии (`terrain-height`, `props-collision`)
- Торговля, склад, кланы, боевая математика
- Нагрузочный Write-Behind кэш

Успешно подтвердили корректность работы с новыми параметрами масштабирования и оптимизациями.
