# Аудит №27 (Final): Нативный C++ Движок Боевой Математики (Node-API SIMD Combat Math)
**Project Steam — Серверное Ядро MMO (Lineage 2 C1 Steampunk Conversion)**
**Статус**: `IMPLEMENTED & VERIFIED`
**Дата**: 24 сентября 2026 г.
**Версия**: 1.0.0 (Production Release)

---

## 1. Введение и Архитектурная Цель

При масштабировании сервера до 1500–2000 CCU боевой контур становится ключевым потребителем бюджета тика V8 Event Loop (100 мс / 10 Hz).
Каждый тик сотни игроков и мобов выполняют автоатаки, кастуют скиллы (Power Strike, Wind Strike), применяют заряды душ (Soulshots / Spiritshots) и блокируют удары щитом.
В JavaScript-движке каждый удар создавал цепочку вызовов `Math.random()`, проверок шансов и микроаллокаций промежуточных объектов в V8 куче.

**Цель Аудита №27**:
1. Разработать нативный C++ модуль `NativeCombatEngine` на базе чистого Node-API (`node_api.h`).
2. Перенести расчет канонических формул боя Lineage 2 C1 (P.Atk, P.Def, разброс оружия, Soulshots 2.0x, криты, блоки щитом, формулы схем/магии) в компилируемый C++ машинный код.
3. Реализовать пакетную обработку атак (`resolveBatchAttacks`) через разделяемые TypedArray (`Float32Array` -> `Int32Array`) с автовекторизацией SIMD.
4. Обеспечить 100% каноническое соответствие правилам L2 C1 и прозрачный dual-engine fallback на чистый JavaScript.

---

## 2. Канонические Формулы Боя Lineage 2 C1 (Single Source of Truth)

Все формулы строго верифицированы с [`shared/l2-combat.js`](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/l2-combat.js):

### 1) Точность и Уклонение (Hit Chance)
$$\text{HitChance} = \text{clamp}(75 + (\text{Accuracy} - \text{Evasion}) \times 5, 5, 98)$$
- При $Acc = Eva$ базовый шанс попадания составляет **75%**.

### 2) Блок Щитом (Shield Block)
$$\text{BlockChance} = \text{clamp}\left(20 + \frac{\text{ShieldDef}}{\text{P.Def} + \text{ShieldDef}} \times 30 + \text{Bonus}, 0, 70\right)$$
- При успешном блоке урон снижается на величину защиты щита $\text{ShieldDef}$ (эффективный $P.Def = P.Def + ShieldDef$).

### 3) Физический Урон (Physical Damage)
- При абсолютном умении ($Power \ge 6$):
  $$D = \left\lfloor 70 \times \frac{P.Atk \times SS + Power \times SS}{P.Def} \times \text{Rand}(0.85 \dots 1.15) \times \text{CritMod} \right\rfloor$$
- При обычной автоатаке / относительном множителе ($Power < 6$):
  $$D = \left\lfloor 70 \times \frac{P.Atk \times Power \times SS}{P.Def} \times \text{Rand}(0.85 \dots 1.15) \times \text{CritMod} \right\rfloor$$
- Заряд Души ($SS$): строго $\times 2.0$.
- Физический Крит: $\times 2.0$ (или модификатор атакующего `critDamage`).

### 4) Контурный / Магический Урон (Circuit Damage)
$$D = \left\lfloor 91 \times Power \times \frac{\sqrt{C.Atk}}{C.Def} \times ShotMod \times ElementMod \times \text{Rand}(0.90 \dots 1.10) \times \text{CritMod} \right\rfloor$$
- Spiritshot: $\times 1.5$.
- Blessed Spiritshot: $\times 2.0$.
- Контурный Крит: строго $\times 3.0$ (шанс $1 \dots 3\%$, зависит от WIT).

### 5) Бонусы Первичных Статов (Stat Bonus)
$$\text{Bonus} = \text{floor}\left(\text{pow}(Base, Stat - Ref) \times 100 + 0.5\right) / 100$$
- **STR**: base 1.036, ref 34.845
- **INT**: base 1.020, ref 31.375
- **DEX**: base 1.009, ref 19.360
- **WIT**: base 1.050, ref 20.000
- **CON**: base 1.030, ref 27.632
- **MEN**: base 1.010, ref -0.060

---

## 3. Архитектура Нативного Движка C++

### 1) Компоненты (`native/src/combat_engine.h`)
- **Fast PRNG (xorshift64star)**: ультрабыстрый генератор случайных чисел без блокировок и накладных расходов libc `rand()`.
- **Fast Math**: интринсики и аппаратные инструкции корня (`std::sqrt`), `std::pow`, `std::clamp`.
- **Batch Processing (`resolveBatchAttacks`)**:
  - Входной буфер: `Float32Array` (stride 6: `pAtk, pDef, weaponBonus, ssEnabled, isCrit, shieldPDef`).
  - Выходной буфер: `Int32Array` (stride 4: `damage, isCrit, isBlocked, isMissed`).
  - Плотный векторный цикл (auto-vectorization GCC/Clang/MSVC) с нулевым числом аллокаций памяти V8 (Zero-GC).

### 2) Экспорт Node-API (`native/src/main.cpp`)
- `physicalDamage(pAtk, pDef, weaponBonus, ssEnabled, isCrit, shieldPDef)`
- `circuitDamage(mAtk, mDef, power, ssEnabled, isCrit)`
- `hitChance(accuracy, evasion)`
- `blockChance(shieldDef, pDef, bonusRate)`
- `critChancePct(critRate)`
- `statBonus(statName, value)`
- `levelMod(level)`
- `resolveBatchAttacks(inputF32, outputI32, count)`

### 3) Интеграция в Ядро (`shared/l2-combat.js`)
- Автоматическая попытка загрузки нативного модуля `build/Release/project_steam_native.node`.
- Прозрачный Dual-Engine Fallback: если нативный модуль недоступен (в браузере, при сборке клиента или в dev-окружении), движок бесшовно использует эквивалентные JavaScript-функции.

---

## 4. Результаты Бенчмарков (100 000 расчетов)

Запуск тестового сценария `scripts/bench-native-vs-js-combat.js`:

| Контур / Операция | JS Engine | C++ Scalar (N-API) | C++ Batch SIMD | Ускорение | Zero-GC |
|---|---|---|---|---|---|
| **Физический урон (100k)** (Локально Windows) | 5.50 мс (18.19M оп/сек) | 9.32 мс (10.73M оп/сек) | **0.20 мс** (505.05M оп/сек) | **27.8x** | **4 КБ** |
| **Физический урон (100k)** (VPS Linux x64) | 6.49 мс (15.41M оп/сек) | 9.14 мс (10.94M оп/сек) | **0.20 мс** (508.47M оп/сек) | **33.0x** | **4 КБ** |
| **Контурный урон (100k)** | 3.76 мс (26.57M оп/сек) | 10.24 мс (9.76M оп/сек) | — | — | 0 КБ |

> **Ключевой вывод**: Единичные вызовы N-API содержат накладные расходы на переход границы V8 / C++. Пакетный вызов `resolveBatchAttacks` нивелирует эти расходы, разгоняя боевой расчет до **508 миллионов операций в секунду** (в 33 раза быстрее JS) при нулевой нагрузке на сборщик мусора.

---

## 5. Верификация и Статус Тестов

1. **Юнит-тесты нативного боя (`tests/native-combat.test.js`)**: **29/29 OK**.
2. **Интеграционные тесты кластера и Master Gateway (`tests/cluster-gateway-sharding.test.js`)**: **142/142 OK**.
3. **Полный регрессионный сьют проекта (`tests/run.js`)**: **3 717 / 3 717 OK (100% green)**.
4. **Боевой деплой на VPS (`93.77.168.135`)**:
   - Нативная сборка C++ выполнена успешно через `node-gyp rebuild`.
   - Сервисы PM2 `project-steam-mmo` и `project-steam-watchdog` работают стабильно.
   - Эндпоинт `/healthz` отвечает: `{"ok":true,"lagMs":18,"lastTickAt":...,"db":{"mode":"file","activeWrites":0}}`.

---

## 6. Заключение

Аудит №27 полностью реализован, верифицирован и задеплоен на боевой сервер. Серверное ядро Project Steam получило высокопроизводительный нативный боевой движок L2 C1, способный обслуживать массивные замесы и клановые осады без просадки тика.
