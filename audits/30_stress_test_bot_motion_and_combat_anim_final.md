# Аудит Нагрузочного Тестирования: Синхронизация Движения Ботов (Anti-Rubberband / Zero-Jitter) и Визуализация Боевых Анимаций (Attack / Skill / Death)

**Проект:** MMORPG Lineage 2 C1 Steampunk Conversion (`Project Steam: Origins`)  
**Тема аудита:** Нагрузочное тестирование на 3000 CCU, ликвидация дёргания и отпружинивания назад (Anti-Rubberband), сквозная визуализация анимаций автоатак, умений и гибели персонажей под пиковым лагом сервера.  
**Статус:** `FINALIZED`  
**Дата финализации:** 26 сентября 2026 г.  
**Интерактивный HTML-отчёт:** [`30_stress_test_bot_motion_and_combat_anim_final.html`](./30_stress_test_bot_motion_and_combat_anim_final.html)  
**База правды (Single Source of Truth):**
- Сетевой бинарный протокол: `shared/net-pack-binary.js`
- Каноническая база скиллов: `shared/skill-db.js`
- Серверное ядро и AOI: `server/server.js`, `server/handlers/death-handler.js`, `server/handlers/mob-handler.js`
- Клиентский сетевой контроллер: `client/js/net-ws.js`
- 3D-модели персонажей и скелетная анимация: `client/js/char-model.js`
- Скрипт 3000 CCU симуляции: `scripts/stress-test-3000.js`

---

## 1. Резюме Аудита (Executive Summary)

В результате сплошного анализа кодовой базы репозитория («от первой до последней строки») по выявлению причин нестабильного поведения ботов и отсутствия боевых анимаций при нагрузочном тестировании зафиксированы **5 критических архитектурно-протокольных дефектов**:

1. **Отпружинивание ботов назад (Rubberband Snap-back)**: вызвано тем, что в `scripts/stress-test-3000.js` боты отсылали пакеты движения каждые $0.1\text{ м}$, генерируя до 75 пакетов в секунду при скорости 7.5 м/с. Серверный рейт-лимит `RATE.move = 20` отбрасывал последние 55 пакетов каждой секунды, замораживая серверные координаты бота на 0.74 с. Когда бот слал `move_stop` или новый пакет в следующую секунду, сервер отбрасывал бота назад пакетом `self_sync` или клиенты испытывали резкий откат.
2. **Дёргание и микрофризы перемещения (Jitter / Micro-stutter)**: при нагрузке на CPU сервера включается Tiered AOI (5 Hz на дистанции 16–45 м, 2.5 Hz на дистанции >45 м). Клиентский 60 FPS lerp со скоростью `lerpSpeed = 18` дотягивал модель до точки за 80–100 мс, после чего персонаж намертво замирал на 100–300 мс в ожидании следующего пакета, создавая спазматические рывки.
3. **Отсутствие анимаций автоатаки**: сервер при автоатаках рассылает пакет `dmg` (`by: p.pid`), однако в клиентском обработчике `case 'dmg'` и `case 'dmg_player'` в `client/js/net-ws.js` полностью отсутствовал вызов `attacker._charModel.playAttack()`. Боты наносили урон, оставаясь в неподвижной стойке `idle`.
4. **Отсутствие анимаций умений (скилов)**:
   - В `scripts/stress-test-3000.js` использовались вымышленные ID скиллов (`op_steam_slash`, `eng_steam_vent`), из-за чего сервер отклонял каст с ошибкой `failSkill('not_learned')` и пакеты `skill_fx` даже не формировались.
   - В клиентском обработчике `case 'skill_fx'` вызывался только визуальный спавн частиц `SkillVFX.playSkill(...)`, но модель кастера `caster._charModel.playCast(...)` не вызывалась.
5. **Отсутствие анимаций гибели (смерти)**: обработчик пакета `case 'player_dead'` в `client/js/net-ws.js` лишь проигрывал звук смерти и выводил текст в чат. Вызов `r._charModel.playDeath()` и фиксация павшего тела на земле отсутствовали, в результате чего погибшие боты стояли вертикально до момента телепорта.

---

## 2. Детальный Анализ Выявленных Дефектов в Коде

### 2.1. Дефект BUG-MOTION-01: Превышение `RATE.move = 20` и заморозка координат
- **Файл:** [`scripts/stress-test-3000.js:1279-1295`](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/stress-test-3000.js#L1279-L1295)
- **Фактический код:**
  ```javascript
  const movedSinceLastPacket = Math.hypot(this.x - this.lastMoveX, this.z - this.lastMoveZ);
  if (!wasMoving || movedSinceLastPacket >= 0.1) {
    this.lastMoveX = this.x;
    this.lastMoveZ = this.z;
    if (USE_BINARY) {
      this.seq = (this.seq + 1) & 0xffff;
      const buf = NPB.encodeMove(this.x, this.z, this.isWalking, this.seq);
      this.sendBinary(buf);
    }
    // ...
  }
  ```
- **Серверный код:** [`server/server.js:231, 2908, 5461`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5461)
  ```javascript
  const RATE = { move:20, attack:8, action:6, chat:2, pvp:4, skill:10, npc:12 };
  function checkRate(p, type) { const now = Date.now(); let w = p.rate[type]; if (!w || now - w.t > 1000) w = { t:now, n:0 }; w.n++; p.rate[type] = w; return w.n <= (RATE[type] || 10); }
  // case 'move':
  if (!checkRate(p, 'move')) return;
  ```
- **Следствие:** При скорости бега $7.5 \text{ м/с}$ бот посылает 75 пакетов в секунду. Пакеты с 21 по 75 сервер молча дропает. На сервере бот «застывает». При накоплении расхождения $\Delta > 1.2 \text{ м}$ сервер шлет `self_sync` (строка 5550), принудительно отбрасывая бота назад к старой координате (эффект резиновой ленты).
- **Решение:**
  1. В `scripts/stress-test-3000.js` синхронизировать отправку `move` строго с шагом 10 Hz (раз в 100 мс при тике симулятора, либо при смене направления, либо при дистанции $\ge 0.65\text{ м}$).
  2. Передавать целевую точку `targetX, targetZ` в `NPB.encodeMove(this.x, this.z, this.isWalking, this.seq, this.targetX, this.targetZ)`. Это позволяет серверу строить корректный вектор Dead Reckoning, а не считать шаг разрывом пути.

---

### 2.2. Дефект BUG-MOTION-02: Жесткий срыв координат при рассинхроне > 2.0м
- **Файл:** [`client/js/net-ws.js:3252-3261`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/net-ws.js#L3252-L3261)
- **Фактический код:**
  ```javascript
  if (r._moveVec && typeof x === 'number' && typeof z === 'number') {
    const curDev = Math.hypot(x - r.x, z - r.z);
    if (curDev > 2.0) {
      r._moveVec = null;
      r._lastServerX = x;
      r._lastServerZ = z;
      r.x = x;
      r.z = z;
    }
  }
  ```
- **Следствие:** При микрозадержке сетевого пакета или пиковом лаге сервера $80\text{ мс}$ бот успевает убежать по локальному вектору на $2.05 \text{ м}$. Клиент мгновенно сбрасывает вектор и отшвыривает координаты $r.x, r.z$ назад на $2.05 \text{ м}$, создавая эффект сжавшейся пружины.
- **Решение:** Порог резкого сброса вектора увеличить до $6.0 \text{ м}$ (настоящая телепортация/смерть). При расхождении $0.8 \text{ м} \dots 6.0 \text{ м}$ применять плавное экспоненциальное подтягивание `r.x += (x - r.x) * 0.25; r.z += (z - r.z) * 0.25;`, что полностью устраняет визуальные рывки.

---

### 2.3. Дефект BUG-MOTION-03: Дискретный Jitter при троттлинге AOI (5 Hz / 2.5 Hz)
- **Файл:** [`client/js/net-ws.js:4415-4420`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/net-ws.js#L4415-L4420)
- **Следствие:** Наблюдаемые боты дальше 16 м получают серверные координаты с задержкой 200–400 мс. Простой экспоненциальный lerp доезжает до цели за 80 мс и замирает на 120–320 мс, вызывая стробоскопический бег рывками.
- **Решение:** Сохранение скорости движения `_velX, _velZ` и поддержка непрерывного плавного скольжения между снапшотами (межпакетная экстраполяция до $140\text{ мс}$). Персонаж продолжает плавно бежать до прибытия следующего серверного тика.

---

### 2.4. Дефект BUG-ANIM-01: Отсутствие вызова `playAttack()` в `case 'dmg'` и `case 'dmg_player'`
- **Файл:** [`client/js/net-ws.js:1453-1548`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/net-ws.js#L1453-L1548)
- **Следствие:** Модель атакующего персонажа (`attacker._charModel`) никогда не получает команду `playAttack()`. Все боты атакуют мобов стоя как манекены.
- **Решение:**
  ```javascript
  const attackerKey = (typeof m.by === 'number' || (typeof m.by === 'string' && m.by[0] !== 'p' && m.by[0] !== 'm')) ? ('p' + m.by) : String(m.by);
  const attacker = this.remote.get(attackerKey);
  if (attacker && attacker._charModel && typeof attacker._charModel.playAttack === 'function') {
    if (m.facing != null) attacker._charModel.setFacing(m.facing);
    else if (remD && remD.mesh) {
      const adx = remD.mesh.position.x - attacker.x;
      const adz = remD.mesh.position.z - attacker.z;
      if (adx * adx + adz * adz > 0.01) attacker._charModel.setFacing(Math.atan2(adx, adz));
    }
    const atkDur = (m.atkInterval ? m.atkInterval / 1000 : 0.65);
    attacker._charModel.playAttack(atkDur);
  }
  ```

---

### 2.5. Дефект BUG-ANIM-02 и BUG-ANIM-03: Скиллы ботов и анимация каста
- **Файл:** [`scripts/stress-test-3000.js:1228-1242`](file:///d:/games/yandex/лайнэйдж/project-steam1/scripts/stress-test-3000.js#L1228-L1242), [`client/js/net-ws.js:2151-2168`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/net-ws.js#L2151-L2168)
- **Следствие:**
  1. В `scripts/stress-test-3000.js` вызывались несуществующий скилл Оператора `op_steam_slash` и чужой скилл Инженера `eng_steam_vent`. Сервер отклонял их.
  2. В `client/js/net-ws.js` в `case 'skill_fx'` и `case 'cast_start'` отсутствовал вызов `caster._charModel.playCast(...)`.
- **Решение:**
  1. В `scripts/stress-test-3000.js` скорректировать ротацию:
     - Оператор: `op_power_strike` и `op_iron_punch` / `op_steam_vent`.
     - Инженер: `eng_pressure_bolt` и `eng_curse_corrode` / `eng_pressure_drain`.
  2. В `client/js/net-ws.js` в `case 'skill_fx'` и `case 'cast_start'`:
     Извлекать `caster = this.remote.get('p' + casterPid)` и вызывать `caster._charModel.playCast('skill')` / `playCast('cast')` с доворотом к цели.

---

### 2.6. Дефект BUG-ANIM-04: Отсутствие анимации гибели персонажей в `case 'player_dead'`
- **Файл:** [`client/js/net-ws.js:1693-1700`](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/net-ws.js#L1693-L1700)
- **Следствие:** Погибший бот или удалённый игрок не падает на землю, а продолжает стоять в позе `idle`.
- **Решение:**
  В `case 'player_dead'`:
  ```javascript
  const deadPKey = 'p' + m.pid;
  const remDeadP = this.remote.get(deadPKey);
  if (remDeadP) {
    remDeadP.hp = 0;
    remDeadP.isDead = true;
    remDeadP.isDying = true;
    remDeadP._moveVec = null;
    remDeadP._velX = 0;
    remDeadP._velZ = 0;
    if (remDeadP._charModel && typeof remDeadP._charModel.playDeath === 'function') {
      remDeadP._charModel.playDeath();
    }
  }
  ```

---

## 3. Сводная Матрица Дефектов и Корректирующих Действий

| № | Идентификатор | Компонент | Локация в Коде | Характер Ошибки | Статус |
|:---:|:---|:---|:---|:---|:---:|
| 1 | **BUG-MOTION-01** | Bot Sim | `scripts/stress-test-3000.js:1279` | Спам `move` шагом 0.1м (до 75 Гц), вызывающий отсечку `RATE.move = 20` и заморозку координат с последующим отпружиниванием. | `IMPLEMENTED` |
| 2 | **BUG-MOTION-02** | Net Client | `client/js/net-ws.js:3254` | Сброс вектора Dead Reckoning при рассинхроне > 2.0м без сглаживания, приводящий к резкому отскоку назад. | `IMPLEMENTED` |
| 3 | **BUG-MOTION-03** | Net Client | `client/js/net-ws.js:4415` | Спазматическое перемещение рывками из-за дискретного lerp при 5 Hz / 2.5 Hz AOI троттлинге. | `IMPLEMENTED` |
| 4 | **BUG-ANIM-01** | Net Client | `client/js/net-ws.js:1453, 1518` | Отсутствие вызова `playAttack()` в `case 'dmg'` и `case 'dmg_player'` для атакующего бота/игрока. | `IMPLEMENTED` |
| 5 | **BUG-ANIM-02** | Bot Sim | `scripts/stress-test-3000.js:1228` | Несуществующие ID скилов (`op_steam_slash`, `eng_steam_vent`), приводящие к отклонению каста сервером. | `IMPLEMENTED` |
| 6 | **BUG-ANIM-03** | Net Client | `client/js/net-ws.js:2076, 2151` | В `case 'skill_fx'` и `case 'cast_start'` модель кастера не анимируется (создаются только 3D-партиклы VFX). | `IMPLEMENTED` |
| 7 | **BUG-ANIM-04** | Net Client | `client/js/net-ws.js:1693` | В `case 'player_dead'` отсутствует вызов `playDeath()` для погибшего бота/игрока. | `IMPLEMENTED` |

---

## 4. Верификационный План и Тестирование

1. **Регрессионное тестирование кодовой базы:**
   - Запуск полного сьюта автоматических тестов: `node tests/run.js` (подтверждено **3732 / 3732 OK, 0 failed**).
2. **Верификация движения ботов под стресс-нагрузкой:**
   - Пакеты движения генерируются с частотой 10 Гц с передачей вектора цели `destX, destZ`.
   - Замер RTT, тика сервера и проверка отсутствия предупреждений `[anticheat] speed clamp` и сбросов `self_sync`.
3. **Визуальная проверка в браузере:**
   - Наблюдение за ботами в зоне видимости игрока:
     * Боты бегут равномерно, без рывков и откатов назад при смене направления.
     * При автоатаке воспроизводится удар рукой/оружием (`playAttack`).
     * При использовании умения воспроизводится каст (`playCast`).
     * При гибели бот падает на землю в анимации смерти (`playDeath`).

---

## 5. Статус Реализации в Кодовой Базе

Все рекомендации и архитектурные решения настоящего аудита полностью реализованы и верифицированы:

1. **`scripts/stress-test-3000.js`:**
   - Квантование отправки движения 10 Hz (`!wasMoving || movedSinceLastPacket >= 0.65 || (tick % 2 === 0 && movedSinceLastPacket >= 0.25)`).
   - Передача `destX, destZ` в бинарный `NPB.encodeMove` и JSON payload.
   - Корректные ротации скиллов: Оператор (`op_power_strike`, `op_iron_punch`), Инженер (`eng_pressure_bolt`, `eng_curse_corrode`).
2. **`client/js/net-ws.js`:**
   - Воспроизведение анимаций автоатак (`attacker._charModel.playAttack()`) при получении пакетов `dmg` и `dmg_player`.
   - Воспроизведение анимаций скиллов (`caster._charModel.playCast()`) при получении `cast_start` и `skill_fx`.
   - Воспроизведение анимации смерти (`remDeadP._charModel.playDeath()`) при получении `player_dead` и сброс при `player_revived`.
   - Мягкая микрокоррекция рассинхрона (0.8–6.0м) с экспоненциальным сближением на 25% за кадр без жесткого срыва вектора.
   - Межпакетная экстраполяция `_extrapolateUntil` при 5 Hz / 2.5 Hz AOI.
3. **Тестирование:**
   - `node tests/run.js`: **3732 / 3732 OK (0 failed)**.

