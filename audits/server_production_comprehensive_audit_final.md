# Комплексный Продакшен-Аудит Серверной Части, Безопасности и Оптимизации
**MMORPG Lineage 2 C1 Steampunk Conversion — Project Steam**

> **Дата аудита**: 2026-09-21  
> **Объект аудита**: Серверная часть (`server/`, `server/handlers/`, `server/http/`, сетевой транспорт, кластерное шардирование, боевая математика)  
> **Статус**: `IMPLEMENTED` (Все 8 дефектов устранены и верифицированы)  
> **Методология**: Сплошной статический и архитектурный анализ кода репозитория («от первой строки до последней»), анализ векторов атак, поиск багов состояния, проверка синхронизации веса/инвентаря, профилирование производительности и утечек памяти.  
> **Верификация**: Полный комплекс автоматических тестов (`node tests/run.js`) — **3497 пройдено, 0 провалено**.

---

## 1. Резюме Аудита и Карта Дефектов

В ходе сплошного анализа серверного кода проекта выявлено **8 критических и важных дефектов**, которые были успешно устранены:

| ID | Уязвимость / Дефект | Файлы и Строки | Категория | Влияние | Статус |
|:---|:---|:---|:---|:---:|:---:|
| **VULN-SRV-01** | **Действия мертвого персонажа (Отсутствие проверки `p.dead`)**: подбор дропа, смена профы, крафт, рецепты, заточка, экипировка | [`server/server.js:1947`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L1947)<br>[`server/handlers/skill-learn-handler.js:250`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/skill-learn-handler.js#L250) | Security / Logic Exploit | **CRITICAL** | **ИСПРАВЛЕНО** |
| **VULN-SRV-02** | **Обход ограничений PvP-боя (Стан и перегруз веса в `attack_player`)**: автоатака под станом и при весе >66.7% | [`server/server.js:5032`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5032) | PvP / Combat Exploit | **HIGH** | **ИСПРАВЛЕНО** |
| **VULN-SRV-03** | **Уязвимость AoE-умений к атаке на неограниченную дистанцию (Карточный хит через `msg.mid`)** | [`server/server.js:3642`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L3642) | Combat / Range Exploit | **CRITICAL** | **ИСПРАВЛЕНО** |
| **PERF-SRV-01** | **Линейный перебор всех мобов сервера $O(M)$ в AoE вместо Spatial Grid** | [`server/server.js:3652`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L3652) | Performance / CPU Bottleneck | **HIGH** | **ИСПРАВЛЕНО** |
| **VULN-SRV-04** | **Переполнение слотов инвентаря при замене надетого предмета (`equip`)** | [`server/server.js:5155`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5155) | Inventory / Slot Exploit | **MEDIUM** | **ИСПРАВЛЕНО** |
| **BUG-SRV-01** | **Рассинхронизация веса инвентаря (Missing `pushWeight`) в квестах, апгрейде приборов и уничтожении предметов** | [`server/handlers/quest-handler.js:214`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/quest-handler.js#L214)<br>[`server/handlers/skill-learn-handler.js:241`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/skill-learn-handler.js#L241)<br>[`server/server.js:5446`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5446) | Client-Server Desync | **MEDIUM** | **ИСПРАВЛЕНО** |
| **BUG-SRV-02** | **Повреждение структуры предметов в команде администратора `//give` для экипировки** | [`server/handlers/gm-handler.js:355`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/gm-handler.js#L355) | Data Corruption / GM Tool | **MEDIUM** | **ИСПРАВЛЕНО** |
| **PERF-SRV-02** | **Двойной учет рейт-лимита для сообщений группы (Double Token Consumption)** | [`server/handlers/party-handler.js:350`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/party-handler.js#L350) | Rate Limiter / UX Bug | **LOW** | **ИСПРАВЛЕНО** |

---

## 2. Детальный Разбор и Реализованные Исправления

---

### VULN-SRV-01: Эксплойт действий мертвого персонажа (Loot, Class Transfer, Craft, Enchant, Equip)

#### Проблема:
В диспетчере пакетов клиента и обработчиках отсутствовала валидация `if (p.dead || p.hp <= 0) return;`.
1. **Подбор дропа трупом**: Мертвый персонаж мог отправлять `loot_pickup` и собирать весь лут в радиусе 4.5м под ногами босса или врагов в PvP.
2. **Смена профессии трупом**: Пакет `class_transfer` сбрасывал HP и Energy на 100% (`p.hp = p.maxHp; p.energy = p.maxEnergy;`), когда игрок находился в мертвом состоянии (`p.dead = true`), рассинхронизируя состояние бойца.
3. **Крафт, заточка и экипировка**: Труп мог продолжать точить оружие, крафтить соулшоты и менять надетые предметы.

#### Реализованное решение:
Внедрены строгие проверки статуса смерти:
- [`server/server.js:1947`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L1947) (`doLootPickup`): `if (p.dead || p.hp <= 0) return;`.
- [`server/handlers/skill-learn-handler.js:250`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/skill-learn-handler.js#L250) (`doClassTransfer`): `if (p.dead || p.hp <= 0) { send(p, { t: 'class_transfer_fail', reason: 'dead', cls: p.cls }); return false; }`.
- [`server/server.js:5093`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5093) (`case 'equip'`): `if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); break; }`.
- [`server/server.js:5190`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5190) (`case 'unequip'`): `if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); break; }`.
- [`server/server.js:5454`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5454) (`case 'craft'`): `if (p.dead || p.hp <= 0) return;`.
- [`server/server.js:5481`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5481) (`case 'learn'`): `if (p.dead || p.hp <= 0) return;`.
- [`server/server.js:5493`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5493) (`case 'device_upgrade'`): `if (p.dead || p.hp <= 0) return;`.
- [`server/server.js:5733`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5733) (`case 'enchant'`): `if (p.dead || p.hp <= 0) return;`.

---

### VULN-SRV-02: Обход ограничений боя в PvP (`attack_player`) — Стан и Перегруз веса

#### Проблема:
В обработчике `case 'attack_player'` ([`server/server.js:5032`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5032)) отсутствовали проверки стана и лимита веса, присутствующие в PvE (`attack`):
- Персонаж под эффектом Shock/Shield Bash не мог атаковать мобов, но мог продолжать автоатаку в PvP.
- При перегрузе $\ge 66.7\%$ игрок не мог атаковать мобов, но атаковал игроков.

#### Реализованное решение:
В начало `case 'attack_player'` добавлены проверки:
```javascript
if (p.dead || p.hp <= 0) return;
if (playerStunned(p)) return;
if (!playerWeightState(p).canAttack) return;
if (!checkRate(p, 'pvp')) return;
```

---

### VULN-SRV-03: Уязвимость AoE-умений к атаке на неограниченную дистанцию

#### Проблема:
При касте AoE-скилла ([`server/server.js:3642`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L3642)), если клиент передавал `msg.mid`, сервер брал координаты цели `cx = tm.x; cz = tm.z` без проверки дистанции от игрока `p` до цели `tm`. Для мгновенных умений игрок мог поразить мобов в любой точке карты.

#### Реализованное решение:
Внедрена строгая валидация дистанции каста и линии видимости:
```javascript
if (msg.mid != null && mobs.get(msg.mid | 0)) {
  const tm = mobs.get(msg.mid | 0);
  const maxRange = (tpl.range || 15) + 3;
  if (dist2(p.x, p.z, tm.x, tm.z) <= maxRange * maxRange && losGround(p.x, p.z, tm.x, tm.z)) {
    cx = tm.x; cz = tm.z;
  } else {
    failSkill('range');
    return;
  }
}
```

---

### PERF-SRV-01: Линейный перебор всех мобов сервера $O(M)$ в AoE вместо Spatial Grid

#### Проблема:
В расчете поражения целей AoE-скиллами ([`server/server.js:3652`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L3652)) выполнялся полный перебор всей коллекции `for (const [, m] of mobs)`, что при 1000+ мобах создавало пиковые задержки тика сервера.

#### Реализованное решение:
Выборка переведена на `spatialGrid.forEachCandidate` с падением на полный перебор только в случае неинициализированной сетки:
```javascript
if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
  spatialGrid.forEachCandidate(cx, cz, radius, null, (m) => {
    if (!m || m.hp <= 0) return;
    if (dist2(cx, cz, m.x, m.z) > radius * radius) return;
    if (!losGround(p.x, p.z, m.x, m.z)) return;
    applyToMob(m);
  });
} else {
  for (const [, m] of mobs) {
    if (m.hp <= 0) continue;
    if (dist2(cx, cz, m.x, m.z) > radius * radius) continue;
    if (!losGround(p.x, p.z, m.x, m.z)) continue;
    applyToMob(m);
  }
}
```

---

### VULN-SRV-04: Переполнение лимита слотов инвентаря при замене надетого предмета (`equip`)

#### Проблема:
При замене экипированного предмета (`prevTid`) снятый предмет помещался в сумку (`p.inv[prevTid] = (p.inv[prevTid] || 0) + 1`) без проверки `NPCS.canFit`. При 80/80 слотах игрок получал 81-й слот.

#### Реализованное решение:
В `case 'equip'` ([`server/server.js:5155`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5155)) добавлена проверка вместимости перед сменой экипировки:
```javascript
if (prevTid) {
  const tempInv = Object.assign({}, p.inv);
  if (fromSlot == null) {
    tempInv[templateId] = (tempInv[templateId] | 0) - 1;
    if (tempInv[templateId] <= 0) delete tempInv[templateId];
  }
  const fit = NPCS.canFit(tempInv, prevTid, 1);
  if (!fit.ok) {
    send(p, { t: 'equip_fail', reason: 'inv_full', limit: NPCS.INVENTORY_SLOTS_LIMIT });
    send(p, { t: 'msg', text: 'Инвентарь полон.' });
    break;
  }
}
```

---

### BUG-SRV-01: Рассинхронизация веса инвентаря (Missing `pushWeight`)

#### Проблема:
При завершении квестов (`doQuestComplete`), апгрейде корпусов приборов (`doDeviceUpgrade`) и уничтожении предметов (`destroy_item`) состав инвентаря менялся, но клиенту не отправлялся пакет обновления веса `pushWeight(p)`.

#### Реализованное решение:
- Добавлен `pushWeight` в зависимости `createQuestHandler` ([`server/handlers/quest-handler.js:214`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/quest-handler.js#L214)) и вызов `if (typeof pushWeight === 'function') pushWeight(p);` в `doQuestComplete`.
- Добавлен `pushWeight` в зависимости `createSkillLearnHandler` ([`server/handlers/skill-learn-handler.js:241`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/skill-learn-handler.js#L241)) и вызов `pushWeight(p)` в `doDeviceUpgrade`.
- Добавлен вызов `pushWeight(p)` в `destroy_item` ([`server/server.js:5446`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L5446)).

---

### BUG-SRV-02: Повреждение структуры предметов в команде администратора `//give`

#### Проблема:
В [`server/handlers/gm-handler.js:355`](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/gm-handler.js#L355) команда `//give` записывала экипировку под составными ключами `itemId_timestamp_i = { id, templateId, plus }`, нарушая плоскую модель инвентаря (`inv[itemId] = count`, `plusById[itemId] = plus`).

#### Реализованное решение:
Приведено к каноническому формату инвентаря:
```javascript
tgt.inv[itemId] = (tgt.inv[itemId] || 0) + count;
if (tpl && (tpl.type === 'weapon' || tpl.type === 'armor' || tpl.type === 'shield') && plus > 0) {
  if (!tgt.plusById) tgt.plusById = {};
  tgt.plusById[itemId] = Math.max(tgt.plusById[itemId] || 0, plus);
}
if (typeof pushWeight === 'function') pushWeight(tgt);
send(tgt, { t: 'inv_sync', inv: tgt.inv, equip: tgt.equip, plusById: tgt.plusById });
```

---

### PERF-SRV-02: Двойной учет рейт-лимита для сообщений группы

#### Проблема:
Пакеты группы (`party_invite`, `party_accept`, `party_leave` и др.) проверяли рейт-лимит дважды: сначала в `server.js` ([L6172](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js#L6172)), затем повторно в `party-handler.js` ([L352](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/party-handler.js#L352)), списывая 2 токена за 1 клик.

#### Реализованное решение:
Удалены все дублирующие вызовы `checkRate(p, 'action')` из `handlePartyMessage` в `party-handler.js`.

---

## 3. Результаты Тестирования и Верификации

После внедрения исправлений был запущен полный комплекс автоматизированного регрессионного тестирования:
```powershell
node tests/run.js
```
**Результаты**:
- **Всего тестов пройдено**: `3497`
- **Провалено**: `0`
- **Ошибок раннера**: `0`
- **Протестированные подсистемы**: Боевая математика L2, инвентарь и слоты (80/80), система веса и перегруза, античит и тайминги тика сервера, геодата и поиск пути A*, квесты и смена профессии, безопасность аутентификации HMAC и Replay-защита, кластерный шардинг и межпроцессный обмен.
