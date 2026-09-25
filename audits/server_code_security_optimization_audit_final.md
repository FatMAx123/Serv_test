# Продакшен-Аудит Серверной Части, Безопасности и Оптимизации (Итоговый Отчет)
**Project Steam — MMORPG Lineage 2 C1 Steampunk Conversion**  
**Дата проведения:** 21 сентября 2026 г.  
**Статус:** `IMPLEMENTED`  
**Область аудита:** Серверное ядро (`server/server.js`), подсистемы обработчиков (`server/handlers/`), синхронизация состояний, защита от эксплойтов, утечки памяти и оптимизация GC.

---

## 1. Введение и Цели Аудита

Настоящий аудит проведен строго по активному коду проекта без внешних абстракций и обобщений.
Цель аудита — выявление скрытых логических багов, уязвимостей синхронизации и эксплойтов инвентаря/боя, а также устранение узких мест производительности (GC pressure) для обеспечения стабильной работы сервера под высокой нагрузкой (до 3000–5000 CCU).

---

## 2. Резюме Выявленных Дефектов

| ID | Категория | Файл и Строки | Описание Дефекта | Критичность |
|:---|:---:|:---|:---|:---:|
| **BUG-SRV-03** | **Logic / Bug** | `server/server.js`<br>`L6027-6040` | `Antidote` (`curePoison`) и бинты (`cureBleed`) не снимают эффекты из-за обращения к несуществующему свойству `p.effects` вместо `p.debuffs`. | **High** |
| **VULN-SRV-05** | **Exploit / Combat** | `server/server.js`<br>`L4965-5100` | Автоатака (`attack` / `attack_player`) не сбивает активный каст умения (`p.casting`), позволяя одновременно наносить урон автоатаками и кастовать мощные заклинания. | **High** |
| **VULN-SRV-06** | **Exploit / State** | `server/server.js`<br>`L5140-5837` | Операции экипировки (`equip`, `unequip`), крафта (`craft`) и заточки (`enchant`) не проверяют состояние `p.trade \|\| p.store`, допуская манипуляцию предметами во время активных торговых сессий. | **Medium** |
| **BUG-SRV-04** | **Logic / Sync** | `server/handlers/death-handler.js`<br>`L236-267` | При воскрешении в город (`revivePlayerToVillage`) клиенту не отправляются `pushCombatStats(p)` и `pushEffects(p)`, приводя к рассинхронизации боевых статов после смерти/делевела. | **Medium** |
| **PERF-SRV-03** | **Performance / GC** | `server/handlers/mob-handler.js`<br>`L1094-1128` | Создание анонимных стрелочных замыканий `sendDotDmg` в цикле `tickMobs` при каждом тике урона моба по DoT, вызывающее всплески аллокаций памяти и спайки сборщика мусора (GC). | **Medium** |
| **VULN-SRV-07** | **Exploit / PvP** | `server/handlers/clan-handler.js`<br>`L415-499`, `warehouse-handler.js` | Возможность сдачи предметов в личный или клановый склад во время боя или PvP-флага для избежания дропа при смерти. | **Medium** |

---

## 3. Детальный Анализ Дефектов в Кодовой Базе

### 3.1. BUG-SRV-03: Неработоспособность зелий нейтрализации яда и кровотечения

#### Фрагмент кода (`server/server.js`, строки 6027–6040):
```javascript
if (eff.curePoison) {
  if (Array.isArray(p.effects)) {
    p.effects = p.effects.filter(e => e && e.kind !== 'poison' && e.id !== 'poison');
    pushEffects(p);
    send(p, { t: 'msg', text: 'Яд нейтрализован.' });
  }
}
if (eff.cureBleed) {
  if (Array.isArray(p.effects)) {
    p.effects = p.effects.filter(e => e && e.kind !== 'bleed' && e.id !== 'bleed');
    pushEffects(p);
    send(p, { t: 'msg', text: 'Кровотечение остановлено.' });
  }
}
```

#### Механизм возникновения:
В архитектуре персонажа эффекты разделены на два массива: `p.buffs` (положительные эффекты) и `p.debuffs` (отрицательные эффекты, включая яд и кровотечение). Поля `p.effects` в объекте игрока не существует (`undefined`).
Вследствие этого условие `Array.isArray(p.effects)` всегда вычисляется как `false`. Игрок расходует `Antidote` или бинт, предмет списывается из инвентаря, но дебафф яда или кровотечения продолжает наносить урон, а подтверждающее сообщение в чат не приходит.

#### Решение:
Проверять и фильтровать `p.debuffs`:
```javascript
if (eff.curePoison) {
  if (Array.isArray(p.debuffs)) {
    p.debuffs = p.debuffs.filter(e => e && e.kind !== 'poison' && e.id !== 'poison');
    pushEffects(p);
    send(p, { t: 'msg', text: 'Яд нейтрализован.' });
  }
}
if (eff.cureBleed) {
  if (Array.isArray(p.debuffs)) {
    p.debuffs = p.debuffs.filter(e => e && e.kind !== 'bleed' && e.id !== 'bleed');
    pushEffects(p);
    send(p, { t: 'msg', text: 'Кровотечение остановлено.' });
  }
}
```

---

### 3.2. VULN-SRV-05: Эксплойт одновременного каста заклинаний и выполнения автоатак

#### Фрагмент кода (`server/server.js`, строки 4965–4975, 5054–5060):
```javascript
case 'attack': {
  if (p.dead || p.hp <= 0) return;
  if (p.sitting) p.sitting = false;
  p._lastCombatAt = Date.now();
  if (playerStunned(p)) return;
  if (!playerWeightState(p).canAttack) {
    send(p, { t: 'msg', text: 'Слишком тяжело — нельзя атаковать.' });
    return;
  }
  if (!checkRate(p, 'attack')) return;
  // ... выполнение автоатаки ...
}
```

#### Механизм возникновения:
При вызове `doCastBegin` устанавливается структура `p.casting = { skillId, endsAt, ... }`. В `case 'move'` каст сбивается при перемещении (`cancelPlayerCast(p, 'move')`). В `onPlayerHit` каст сбивается при получении урона.
Однако при выполнении автоатак (`case 'attack'` по мобам и `case 'attack_player'` по игрокам) проверка `p.casting` отсутствует. Игрок может запустить каст длительного заклинания (например, 4 секунды) и во время каста непрерывно наносить удары автоатакой ближнего боя или лука, после чего заклинание успешно завершается и наносит полный урон.

#### Решение:
Добавить вызов `cancelPlayerCast(p, 'attack')` в начале обоих обработчиков:
```javascript
if (p.casting) cancelPlayerCast(p, 'attack');
```

---

### 3.3. VULN-SRV-06: Отсутствие проверки занятости (`p.trade || p.store`) при экипировке, крафте и заточке

#### Фрагмент кода (`server/server.js`):
В `drop_item` (строка 5261) и `destroy_item` (строка 5369) присутствует проверка:
```javascript
if (p.trade || p.store) {
  send(p, { t: '...', reason: 'busy' });
  return;
}
```
Однако в:
- `case 'equip'` (строка 5140)
- `case 'unequip'` (строка 5225)
- `case 'craft'` (строка 5491)
- `case 'enchant'` (строка 5773)

Данная проверка отсутствует.

#### Механизм возникновения:
При активном трейде с другим игроком или при открытой личной лавке игрок может модифицировать предметы в инвентаре (надеть предмет, скрафтить расходник из предложенных ресурсов, заточить или сломать вещь на кристаллы). Хотя в `tradeExecute` есть проверка владения предметом, изменение слотов экипировки и модификация заточки во время открытой сессии могут приводить к рассинхронизации состояния и срыву транзакций.

#### Решение:
Внедрить единую проверку блокировки на время трейда и лавки:
```javascript
if (p.trade || p.store) {
  send(p, { t: '<action>_fail', reason: 'busy' });
  return;
}
```

---

### 3.4. BUG-SRV-04: Рассинхронизация боевых статов и эффектов при воскрешении в город

#### Фрагмент кода (`server/handlers/death-handler.js`, строки 236–267):
```javascript
function revivePlayerToVillage(p) {
  if (!p || !p.dead) return false;
  const sp = getSpawnPoint();
  p.dead = false;
  p.x = sp.x;
  p.z = sp.z;
  snapStandY(p);
  p.region = sp.region;
  p.flagUntil = 0;
  try {
    if (typeof p.applyClassStats === 'function') p.applyClassStats();
  } catch (e) { /* ignore */ }
  p.hp = p.maxHp;
  p.energy = p.maxEnergy;
  p.moving = false;
  resetMoveBudget(p);
  saveProfileNow(p);
  send(p, {
    t: 'you_revived',
    mode: 'village',
    self: deathSelfPayload(p)
  });
  broadcastAOI(p, {
    t: 'player_revived',
    pid: p.pid,
    x: p.x,
    z: p.z,
    mode: 'village'
  });
  ensureNearbyMobs(p);
  return true;
}
```

#### Механизм возникновения:
При смерти персонажа (`beginPlayerDeath`) баффы очищаются через `BR.clearDeath`, а при падении уровня или выпадении экипировки боевые статы изменяются. Функция `revivePlayerToVillage` вызывает `p.applyClassStats()`, но **не отправляет** клиенту пакет `combat_stats` (через `pushCombatStats(p)`) и пакет `effects` (через `pushEffects(p)`). Клиент получает только `you_revived`, и отображаемые параметры атаки/защиты остаются неактуальными до следующего действия с экипировкой.

#### Решение:
Добавить вызовы `pushCombatStats(p);` и `pushEffects(p);` перед сохранением профиля и отправкой пакета `you_revived`.

---

### 3.5. PERF-SRV-03: Утечка аллокаций и GC-спайки в DoT-цикле `tickMobs`

#### Фрагмент кода (`server/handlers/mob-handler.js`, строки 1104–1118):
```javascript
const sendDotDmg = (pl) => {
  if (!pl) return;
  if (dist2(pl.x, pl.z, m.x, m.z) < 80 * 80) {
    send(pl, {
      t: 'dmg', mid: m.mid, dmg: d.dmg, crit: false, by: d.by,
      skillId: d.skillId || 'dot',
      mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
    });
  }
};
if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
  spatialGrid.forEachCandidate(m.x, m.z, 80, sendDotDmg, null);
} else {
  for (const [, pl] of players) sendDotDmg(pl);
}
```

#### Механизм возникновения:
Функция `sendDotDmg` создается заново на каждый тик каждого активного DoT на каждом мобе в мире каждые 100 мс (10 раз в секунду). При массовом использовании скиллов отравления (например, `gun_poison_shot`) это порождает миллионы замыканий и объектов пакетов в секунду, приводя к частому вызову V8 Scavenge / Mark-Sweep и микрофризам серверного цикла.

#### Решение:
Использовать единую функцию рассылки урона по окрестностям с переиспользуемым контекстом, либо использовать `broadcastNear` без захвата замыканий в теле итератора.

---

### 3.6. VULN-SRV-07: Сдача предметов на склад во время боя или PvP-флага

#### Фрагмент кода (`server/handlers/clan-handler.js` и `server/handlers/warehouse-handler.js`):
В обработчиках `doClanWhPut`, `doClanWhTake`, `doWarehousePut`, `doWarehouseTake` проверяется только `p.dead`. Проверка на состояние боя (`p.inCombat` или `p._lastCombatAt`) и флаг PvP (`p.isFlagged`) отсутствует.

#### Механизм возникновения:
Игрок, начав бой или находясь под PvP-флагом рядом со складом (или в мирной зоне после удара по флагнутому противнику), может в критический момент переложить ценное снаряжение в личный или клановый склад, чтобы гарантированно не потерять его в случае гибели. В каноне Lineage 2 C1 любые складские операции во время боя строго запрещены.

#### Решение:
Добавить проверку:
```javascript
if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
  send(p, { t: '<wh_type>_fail', reason: 'combat' });
  send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
  return;
}
```

---

## 4. План Внедрения Исправлений

1. **Модификация `server/server.js`**:
   - Исправление очистки дебаффов в `case 'use'` (BUG-SRV-03).
   - Внедрение `cancelPlayerCast(p, 'attack')` в `case 'attack'` и `case 'attack_player'` (VULN-SRV-05).
   - Добавление проверки `if (p.trade || p.store)` в `case 'equip'`, `case 'unequip'`, `case 'craft'`, `case 'enchant'` (VULN-SRV-06).
2. **Модификация `server/handlers/death-handler.js`**:
   - Добавление `pushCombatStats(p)` и `pushEffects(p)` в `revivePlayerToVillage(p)` (BUG-SRV-04).
3. **Модификация `server/handlers/mob-handler.js`**:
   - Оптимизация рассылки урона от DoT без создания замыканий на каждый тик (PERF-SRV-03).
4. **Модификация `server/handlers/warehouse-handler.js` и `clan-handler.js`**:
   - Блокировка операций склада во время боя и при PvP-флаге (VULN-SRV-07).
5. **Верификация тестами**:
   - Прогон полного пакета регрессионных тестов `node tests/run.js` (3497+ тестов).

---

## 5. Фактическая Реализация в Кодовой Базе и Результаты Тестирования

Все пункты аудита успешно реализованы и верифицированы:

1. **`server/server.js`**:
   - `BUG-SRV-03`: В `case 'use'` фильтрация переведена на `p.debuffs` для `eff.curePoison` и `eff.cureBleed` с вызовом `pushEffects(p)`.
   - `VULN-SRV-05`: В `case 'attack'` и `case 'attack_player'` внедрен вызов `if (p.casting) cancelPlayerCast(p, 'attack');`.
   - `VULN-SRV-06`: В `case 'equip'`, `case 'unequip'`, `case 'craft'`, `case 'enchant'` добавлена строгая проверка `if (p.trade || p.store) { send(p, { t: '<action>_fail', reason: 'busy' }); return/break; }`.

2. **`server/handlers/death-handler.js`**:
   - `BUG-SRV-04`: В `revivePlayerToVillage(p)` добавлены обязательные вызовы `pushCombatStats(p)` и `pushEffects(p)`.

3. **`server/handlers/mob-handler.js`**:
   - `PERF-SRV-03`: Ликвидировано создание анонимных замыканий в DoT-цикле `tickMobs` — внедрен статический диспетчер `_sendDotCandidate` с переиспользуемым контекстом `_currentDotMob` / `_currentDotPkt`.

4. **`server/handlers/warehouse-handler.js` и `server/handlers/clan-handler.js`**:
   - `VULN-SRV-06` & `VULN-SRV-07`: В `doWarehouseOpen`, `doWarehousePut`, `doWarehouseTake`, `doClanWhOpen`, `doClanWhPut`, `doClanWhTake` внедрены проверки занятости торговлей (`p.trade || p.store`), а также блокировка при активном бое или PvP-флаге (`p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)`).

### Результаты автоматизированного тестирования:
- **Команда**: `node tests/run.js`
- **Результат**: **3497 пройдено, 0 провалено** (52 сьюта тестов).
- **Регрессии**: 0. Полная стабильность ядра.

