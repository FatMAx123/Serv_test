# 38. Генеральный План: Прокачка Classic x1, Экономика Зарядов и Эндгейм-Крафт D-ранга
**Project Steam: Origins — Комплексная Спецификация Баланса, Ремесла и Квестов Фазы 1 (Кап 20 Ур.)**

---

## 1. Концептуальный Манифест: D-ранг как Абсолютный Эндгейм

В MMORPG со стандартным развитием до 80+ уровней ранг D является промежуточным этапом, который проскакивают за пару часов.  
**В Project Steam (Фаза 1 с жестким капом 20-го уровня) ранг Low-D — это аналог S-грейда и священный Грааль всего доступного мира:**

* **Меч Революции (`revolution_sword`)** и **Тяжелый Молот Рока (`heavy_doom_hammer`)** — это «Infinity Blade» и «Draconic Bow» Острова Круна.
* **Чешуйчатый Сет (`scale_mail`)** и **Сет Знания (`knowledge`)** — это броня высшей лиги, эквивалент сетов «Imperial Crusader» и «Major Arcana».
* **Запрет на обесценивание:** Если игрок может просто накопить монеты за квесты и купить эти артефакты на полке у обычного NPC-торговца, весь эндгейм первой фазы обесценивается в день релиза.
* **Иерархия престижа:** К 20 уровню большинство активных игроков одеты в **Top No-Grade** (`Bastard Sword`, `Spring Bow`, `Ring Mail`, `Devotion`), активно точат его на **+4..+7** и лишь поэтапно, через сложный крафт, спойл заготовок и рейды на Хранителей собирают свои первые D-вещи.

---

## 2. Иерархия Снаряжения и Роль Top No-Grade

| Тир Экипировки | Доступный Уровень | Роль в Игровом Мире | Способ Получения | Заточка и Потенциал |
|:---|:---:|:---|:---|:---|
| **Starter No-Grade** | 1–6 | Первичное ознакомление с миром, обучение механике ударов. | Стартовая выдача, магазины Деревни Круна. | Не точится. |
| **Mid No-Grade** | 6–12 | Переходная экипировка для зачистки Дворов и Холмов Астарда. | Магазины Векса и Доры, базовый дроп с мобов. | Безопасная заточка до +3. |
| **Top No-Grade** | 12–20 | **Основная рабочая лошадка Фазы 1.** В ней проходит весь фарм 15–20 уровней и битвы с полевыми боссами. | Магазины Деревни Круна, базовый крафт, дроп. | **Глубокая заточка +4..+8.** `Bastard Sword +6` сравнивается по силе с чистым D-мечом! |
| **Low D-Grade** | **20 (Endgame)** | **Реликтовый эндгейм.** Доступен только элите, топ-крафтерам и рейдовым экспедициям. | **Строго Craft-Only (60%)** и дроп с 7 Хранителей / Стального Колосса. | Предел совершенства первой фазы. |

---

## 3. Ревизия Магазинов Деревни Круна: Тотальное Изъятие D-ранга

В `shared/world-metrics.js` витрины торговцев приводятся в соответствие с концепцией хардкорного мира.

### 3.1. Изъятие из продажи у Оружейника Векса (`trader_vex`)
Из файла `shared/world-metrics.js` (строки 284–287) навсегда удаляются:
* ❌ `revolution_sword` (Меч Революции)
* ❌ `heavy_doom_hammer` (Тяжелый Молот Рока)
* ❌ `reinforced_bow` (Усиленный Пневмолук)
* ❌ `prowler_dagger` (Кинжал Теней)
* ❌ `mace_prayer` (Булава Молитвы)
* ❌ `magic_mace` (Импульсная Булава)

**Что остаётся у Векса:** Исключительно No-Grade оружие:
* `operator_hammer_low`, `short_sword`, `mage_dagger`, `copper_pipe`
* `long_sword`, `iron_hammer`, `dirk`, `spring_bow`
* `bastard_sword`, `steam_hammer`, `assassin_knife`, `composite_bow`
* `apprentice_wand`, `willow_coil`, `cedar_manifold`, `mage_staff`, `crucifix_blood`

### 3.2. Изъятие из продажи у Бронника Доры (`trader_dora`)
Из файла `shared/world-metrics.js` (строки 296–308) удаляются все сетовые части D-ранга:
* ❌ `scale_mail_breastplate`, `scale_mail_gaiters`, `scale_mail_shield`
* ❌ `reinforced_leather_shirt`, `reinforced_leather_gaiters`, `reinforced_leather_boots`
* ❌ `knowledge_jacket`, `knowledge_pants`, `knowledge_gloves`
* ❌ `mithril_jacket`, `mithril_pants`
* ❌ `boiler_shield`, `hoplon`, `iron_shield`, `elven_shield`

**Что остаётся у Доры:** Начальные робы (`circuit_robe`), деревянный каркас (`wooden_*`), кожа механикера (`leather_*`), медная кольчуга (`copper_chainmail_*`), звеньевой доспех (`ring_mail_*`), костяной панцирь (`bone_*`), базовые щиты (`wood_block`, `buckler`, `copper_shield`).

---

## 4. Хардкорная Система Крафта D-ранга (60% High-Stakes)

Крафт D-ранга создается как многоступенчатый клановый и соло-челлендж.

### 4.1. Каталог Рецептов и Ключевых Заготовок (`shared/item-db.js`)
В базу предметов добавляются канонические чертежи и составные части:

| Создаваемый Предмет | Необходимый Рецепт | Ключевая Составная Часть (Blades / Parts) | Требуемые Ресурсы | Шанс |
|:---|:---|:---|:---|:---:|
| **Меч Революции** (`revolution_sword`) | `recipe_revolution_sword` | **Клинок Меча Революции** (`blade_revolution_sword`) $\times 4$ | Котловая плита $\times 12$, D-кристаллы $\times 45$, Пломбы $\times 15$ | **60%** |
| **Тяжелый Молот Рока** (`heavy_doom_hammer`)| `recipe_heavy_doom_hammer` | **Обух Молота Рока** (`parts_heavy_doom_hammer`) $\times 4$ | Поршневой узел $\times 3$, Котловая плита $\times 14$, D-кристаллы $\times 45$ | **60%** |
| **Усиленный Пневмолук** (`reinforced_bow`) | `recipe_reinforced_bow` | **Плечо Пневмолука** (`parts_reinforced_bow`) $\times 4$ | Клапан сверхдавления $\times 6$, Медный кабель $\times 25$, D-кристаллы $\times 45$ | **60%** |
| **Кинжал Теней** (`prowler_dagger`) | `recipe_prowler_dagger` | **Лезвие Кинжала Теней** (`blade_prowler_dagger`) $\times 4$ | Лаковая пломба $\times 12$, Свечи зажигания $\times 15$, D-кристаллы $\times 40$ | **60%** |
| **Булава Молитвы** (`mace_prayer`) | `recipe_mace_prayer` | **Сердечник Булавы Молитвы** (`parts_mace_prayer`) $\times 4$ | Серебряный флюс $\times 8$, Котловая плита $\times 8$, D-кристаллы $\times 45$ | **60%** |
| **Чешуйчатая Кираса** (`scale_mail_breastplate`)| `recipe_scale_mail_breastplate`| **Паттерн Чешуйчатой Кирасы** (`pattern_scale_mail_breastplate`) $\times 3$ | Котловая плита $\times 8$, D-кристаллы $\times 20$, Заклепки $\times 30$ | **60%** |
| **Чешуйчатые Поножи** (`scale_mail_gaiters`)| `recipe_scale_mail_gaiters`| **Паттерн Чешуйчатых Поножей** (`pattern_scale_mail_gaiters`) $\times 3$ | Котловая плита $\times 5$, D-кристаллы $\times 14$, Заклепки $\times 20$ | **60%** |
| **Куртка Знания** (`knowledge_jacket`) | `recipe_knowledge_jacket` | **Выкройка Куртки Знания** (`pattern_knowledge_jacket`) $\times 3$ | Каучуковая обшивка $\times 15$, D-кристаллы $\times 20$, Флюс $\times 6$ | **60%** |
| **Усиленная Куртка** (`reinforced_leather_shirt`)| `recipe_reinforced_leather_shirt`| **Основа Усиленной Куртки** (`pattern_reinforced_leather`) $\times 3$ | Каучуковая обшивка $\times 18$, D-кристаллы $\times 18$, Пломбы $\times 10$ | **60%** |

### 4.2. Места Спойла и Редкого Дропа Составных Частей:
* **`welding_automaton`** (Свалка / Западные земли, 12–14 ур.): куски чешуйчатой брони и щита (шанс спойла 4%).
* **`forge_apprentice`** & **`yard_cranelet`** (Кузницы Круны, 12–13 ур.): обух Молота Рока и плиты.
* **`dry_dock_welder`** (Тихая заводь, 14–15 ур.): плечи Пневмолука и выкройки легкой брони.
* **`oblivion_walker`** & **`memory_scrubber`** (Поле Забвения, 15–17 ур.): клинки Кинжала Теней и сердечники Булавы.
* **`rezdiq_private`** & **`limit_guard`** (Бараки Рездика и Предел, 18–20 ур.): Клинки Меча Революции (шанс спойла 5%).
* **Кристаллы D (`crystal_d`):** Добываются кристаллизацией сломанных D-вещей при овер-энчанте (+4 и выше) либо редким дропом с рейдов.

---

## 5. Экономика Зарядов: Убыточный Кач (Money Sink)

В соответствии с каноном Lineage 2 C1, соулшоты превращаются в тактический ресурс:

1. **Розничная цена у NPC:**
   * No-Grade Soulshot: **15 ⚙️** / шт.
   * D-Grade Soulshot: **30 ⚙️** / шт. (двуручные молоты расходуют 3 шт./удар, луки — 4–6 шт./выстрел!).
2. **Баланс монеты с моба:**
   * На 10–12 уровне моб дропает в среднем 20–35 ⚙️.
   * За бой боец тратит 3–4 соулшота = **45–60 ⚙️**.
   * Чистый итог боя на покупных соулшотах: **-25 .. -40 ⚙️ убытка на каждом мобе!**
3. **Геймплейная модель сбережения капитала:**
   * **Гринд «на сухую» (без сосок):** 100% прибыль с дропа меди и лута. Скорость ниже, но карман наполняется.
   * **Чередование:** Использование соулшотов только на добивание или в критический момент.
   * **Крафт соулшотов:** Создание партий по 100 шт. снижает себестоимость до ~0.5–2.0 ⚙️ за выстрел, выводя кач в безубыточный ноль при условии самостоятельной добычи руды и угля.
   * **D-соулшоты:** Дорогое оружие победы. Заряжаются в Меч Революции только на Эпическом Колоссе, Хранителях и в дуэлях за споты.

---

## 6. Прокачка Classic x1: Возврат 25–28 Часов (Канон C1)

В `shared/mob-db.js` устраняется искусственный буст опыта:
* **Удаление множителей:** Из `tuneOutdoorTrash` вырезаются коэффициенты `st.exp * 1.25 * 1.15` и `st.hp * 0.82`.
* **Возврат канонического EXP:**
  * Ур. 1–5: 40–110 EXP за моба.
  * Ур. 6–10: 180–420 EXP за моба.
  * Ур. 11–15: 450–780 EXP за моба.
  * Ур. 16–20: 820–1 240 EXP за моба (`oblivion_walker` = 820, `rezdiq_private` = 1240).
* **Метрика прохождения:**
  * Общее количество убийств для достижения 20 уровня: **~1 700–1 900 мобов**.
  * Суммарное время первой фазы: **25–28 часов** вдумчивого, глубокого геймплея.

---

## 7. Четыре Циклических (Repeatable) Квеста на Фарм Трофеев

Гринд мобов получает постоянную осмысленную цель через сдачу трофеев (аналоги *Grim Collector*, *Fungus Spores*, *Lizardman Teeth*):

### 7.1. Квест «Расхитители Кабелей» (Ур. 6–10, Холмы Астарда и Речной Пролёт)
* **Квестодатель:** Капитан Гилберт (`gilbert`), Деревня Круна.
* **Цели:** Охота на `steam_hound`, `meadow_mower`, `survey_beacon`, `bridge_toll_bot`.
* **Квестовый предмет:** Отрезок медного кабеля (`quest_copper_wire`, падает со 100% шансом).
* **Сдача:** Каждые 25 шт. $\to$ **2 500 ⚙️**, 10 банок масла (`synthetic_oil`), 5 свечей зажигания.

### 7.2. Квест «Утилизация Тяжелых Узлов» (Ур. 10–14, Западные Земли и Свалка)
* **Квестодатель:** Торговец Векс (`trader_vex`), Деревня Круна.
* **Цели:** Охота на `hill_presser`, `welding_automaton`, `welding_drone`, `rust_sentry`.
* **Квестовый предмет:** Деформированный поршень (`quest_bent_piston`, шанс 80%).
* **Сдача:** Каждые 20 шт. $\to$ **6 500 ⚙️**, 50 шт. `soulshot_no_grade`, 2 поршневых кольца.

### 7.3. Квест «Коллекционер Шестерней Забвения» (Ур. 14–17, Поле Забвения и Химзавод)
* **Стимпанк-аналог Grim Collector:** NPC Смотритель Биотин (`biotin`).
* **Цели:** Охота на `oblivion_walker`, `memory_scrubber`, `rogue_target`, `acid_sprayer`.
* **Квестовые предметы:**
  * Шестерня памяти (`quest_memory_gear`) — сдача по 120 ⚙️ за штуку.
  * Кислотный редуктор (`quest_acid_valve`) — сдача по 180 ⚙️ за штуку.
  * Чип протокола сбоя (`quest_corrupted_chip`, редкий) — сдача по 500 ⚙️ за штуку.
* **Комплектная сдача (по 10 шт. каждого):** Бонус **15 000 ⚙️** + 3 шт. `crystal_d` (важнейший источник кристаллов для будущего крафта!).

### 7.4. Квест «Жетоны Мятежного Гарнизона» (Ур. 17–20, Бараки Рездика и Вал Предела)
* **Квестодатель:** Интендант Рид (`intendant_rid`), Деревня Круна.
* **Цели:** Охота на солдат мятежного полка: `rezdiq_private`, `drill_sergeant`, `limit_guard`.
* **Квестовый предмет:** Стальной армейский жетон Рездика (`quest_rezdiq_dogtag`, шанс 75%).
* **Сдача:** Каждые 20 шт. $\to$ **25 000 ⚙️**, 2 усилителя давления `pressure_amplifier`, шанс получить случайный рецепт D-брони.

---

## 8. Итоговая Экономическая Модель Персонажа 20 Уровня

```
[ДОХОДЫ К 20 УРОВНЮ]
├── Одноразовые сюжетные и побочные квесты (23 шт.): ................ ~244 000 ⚙️
├── Чистый дроп меди с мобов (при бережном каче без сосок): ........ ~140 000 ⚙️
├── Сдача трофеев по 4 циклическим квестам (8–10 заходов): ........ ~180 000 ⚙️
└── Спойл и продажа излишков базовых ресурсов: ....................... ~90 000 ⚙️
ИТОГО НАКОПЛЕНО: ..................................................... ~654 000 ⚙️

[РАСХОДЫ НА ПРОКАЧКУ 1–20]
├── Покупка и апгрейд No-Grade экипировки (оружие, кольчуга): ....... ~45 000 ⚙️
├── Расходники (масла, банки, стрелы, свитки возврата, телепорты): .. ~35 000 ⚙️
├── Заряды души для походов на боссов и сложных моментов: ........... ~40 000 ⚙️
└── Изучение классовых умений и пошлины: ............................. ~15 000 ⚙️
ИТОГО ЗАТРАТЫ: ....................................................... ~135 000 ⚙️

[СВОБОДНЫЙ КАПИТАЛ НА 20 УРОВНЕ]: .................................... ~519 000 ⚙️
```

**Куда идет этот капитал:**
Этот свободный капитал в **~519 000 ⚙️** игрок не несет в магазин за готовым мечом (их там нет!).  
Он тратит его на:
1. Покупку недостающих кусков и рецептов у других игроков через личные лавки (`store`).
2. Оплату услуг ремесленников за попытки 60% крафта.
3. Покупку заточек D (`pressure_amplifier_d`) и подготовку к рейду на Стального Колосса Предела.

---

## 9. Пошаговая Дорожная Карта Реализации в Коде

1. **`shared/mob-db.js`**: Нормализация функции `tuneOutdoorTrash` (удаление $\times 1.25 \times 1.15$ EXP и $\times 0.82$ HP).
2. **`shared/world-metrics.js`**: Полная зачистка магазинов Оружейника Векса и Бронника Доры от всех предметов Low-D.
3. **`shared/item-db.js`**: Добавление чертежей D-оружия (`recipe_revolution_sword`, `recipe_heavy_doom_hammer` и т.д.), составных частей (клинки, обухи) и паттернов брони.
4. **`shared/game-rules.js`**: Регистрация новых рецептов в таблице `RECIPES` с шансом успеха 0.60 (60%).
5. **`shared/loot-rules.js`**: Интеграция спойла кусков D-оружия и рецептов в мобов 14–20 уровней.
6. **`shared/quest-db.js`**: Внедрение 4 циклических (repeatable) квестов на сдачу трофеев с привязкой к дропу.
7. **Тестирование**: Прогон `node tests/run.js` (подтверждение 100% pass) и верификация `node scripts/guard-anti-rollback.js` (22/22 OK).

---

## 10. Отчет о Реализации и Верификации (Post-Implementation Report)

**Статус:** **РЕАЛИЗОВАНО В КОДЕ (100% PASS)**  
**Дата реализации:** 2026-10-02  
**Соответствие архитектурным инвариантам:** Полное (`AGENTS.md`, Zero Rollback Policy).

### 10.1. Внесенные изменения по компонентам
1. **[shared/mob-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/mob-db.js):**
   - Устранены завышающие коэффициенты опыта и заниженное HP мобов в `tuneOutdoorTrash()`. Восстановлена каноническая прогрессия L2 C1 (25–28 часов, 1 700–1 900 мобов до 20 уровня).
2. **[shared/world-metrics.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/world-metrics.js):**
   - Из магазина `trader_vex` исключены все 6 Low-D орудий. Оставлено ровно 18 No-Grade позиций.
   - Из магазина `trader_dora` исключены все 12 предметов сетов Low-D. Оставлен No-Grade ассортимент (31 позиция).
   - К NPC `gilbert`, `trader_vex`, `biotin`, `intendant_rid` привязаны 4 циклических квеста.
3. **[shared/item-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/item-db.js):**
   - Добавлены 9 ключевых заготовок: `blade_revolution_sword`, `parts_heavy_doom_hammer`, `parts_reinforced_bow`, `blade_prowler_dagger`, `parts_mace_prayer`, `pattern_scale_mail_breastplate`, `pattern_scale_mail_gaiters`, `pattern_knowledge_jacket`, `pattern_reinforced_leather`.
   - Добавлены 9 свитков рецептов: `recipe_revolution_sword`, `recipe_heavy_doom_hammer`, `recipe_reinforced_bow`, `recipe_prowler_dagger`, `recipe_mace_prayer`, `recipe_scale_mail_breastplate`, `recipe_scale_mail_gaiters`, `recipe_knowledge_jacket`, `recipe_reinforced_leather_shirt`.
   - Добавлены 6 квестовых трофеев: `quest_copper_wire`, `quest_bent_piston`, `quest_memory_gear`, `quest_acid_valve`, `quest_corrupted_chip`, `quest_rezdiq_dogtag`.
4. **[shared/game-rules.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/game-rules.js) & [data/crafting_recipes_db.json](file:///d:/games/yandex/лайнэйдж/project-steam1/data/crafting_recipes_db.json):**
   - Зарегистрированы все 9 рецептов D-ранга с шансом крафта 60% (`chance: 0.6`).
5. **[data/crafting_materials_db.json](file:///d:/games/yandex/лайнэйдж/project-steam1/data/crafting_materials_db.json):**
   - В каталог внесены все 9 частей оружия и выкроек брони с привязкой к категориям и источникам спойла.
6. **[shared/loot-rules.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/loot-rules.js):**
   - Настроен спойл заготовок (шансы 4–5%), дроп свитков чертежей (шансы 0.3–0.4%) и дроп квестовых предметов для всех 4 циклических квестов.
7. **[shared/quest-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/quest-db.js):**
   - Реализованы квесты: `repeatable_cable_raiders`, `repeatable_heavy_nodes`, `repeatable_oblivion_collector`, `repeatable_rezdiq_tags`. Валидация базы: 0 ошибок.
8. **Тестовые спецификации ([tests/phase1_weapon_audit.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/phase1_weapon_audit.test.js), [tests/phase1_shops_audit.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/phase1_shops_audit.test.js), [tests/phase1_boss_drop_audit.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/phase1_boss_drop_audit.test.js)):**
   - Синхронизированы с правилом No-Grade магазинов и D-Grade Craft/Drop Only.

9. **Динамический расход зарядов Soulshots / Spiritshots ([server/server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js), [shared/item-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/item-db.js), [data/weapons_db.json](file:///d:/games/yandex/лайнэйдж/project-steam1/data/weapons_db.json), [client/js/inventory.js](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/inventory.js)):**
   - Реализована функция `equippedWeaponShotCount(p, shotKind)`. Луки NG тратят 2 (`spring_bow`) / 4 (`composite_bow`), D-лук 6 (`reinforced_bow`); двуручные молоты тратят 3 (`steam_hammer`, `heavy_doom_hammer`); магические жезлы и булавы инженера 1–3 SPS/BSPS; одноручные мечи/кинжалы — 1.
   - `consumeArmedShot` и `toggleShotArm` с авторитарным серверным списанием точного количества зарядов за выстрел/каст, сбросом вооружения при нехватке и синхронизацией `shot_use` в PvE и PvP.
10. **Поштучная сдача трофеев Смотрителю Биотину ([shared/npc-services.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/npc-services.js), [server/server.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/server.js), [client/js/npc-ui.js](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/npc-ui.js), [client/js/i18n.js](file:///d:/games/yandex/лайнэйдж/project-steam1/client/js/i18n.js)):**
    - В `NPCS.sellPrice` разрешен выкуп: `quest_memory_gear` (120 ⚙️), `quest_acid_valve` (180 ⚙️), `quest_corrupted_chip` (500 ⚙️).
    - В `server.js` добавлен обработчик `biotin_trophy_turnin` для мгновенной оптовой сдачи всей партии трофеев в диалоге Биотина.
    - В `client/js/npc-ui.js` добавлена кнопка «Сдать трофеи и детали Смотрителю» с двуязычной локализацией.
11. **Случайный выбор рецепта D-брони в квесте Жетонов ([shared/quest-db.js](file:///d:/games/yandex/лайнэйдж/project-steam1/shared/quest-db.js), [server/handlers/quest-handler.js](file:///d:/games/yandex/лайнэйдж/project-steam1/server/handlers/quest-handler.js)):**
    - В `repeatable_rezdiq_tags` заменена фиксированная кираса на `randomPick` из 4 рецептов D-брони (чешуйчатая кираса, чешуйчатые поножи, куртка знания, усиленная кожаная куртка).
    - `QD.validate()` валидирует `rewards.randomPick`, а `doQuestComplete` выбирает случайный рецепт с проверкой вместимости сумки.
12. **Тестовые спецификации ([tests/shots_c1_canon.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/shots_c1_canon.test.js), [tests/quest.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/quest.test.js), [tests/npc.test.js](file:///d:/games/yandex/лайнэйдж/project-steam1/tests/npc.test.js)):**
    - Добавлен комплексный юнит-тест `shots_c1_canon.test.js` и расширены проверки `quest.test.js` и `npc.test.js`.

### 10.2. Результаты тестов
- **Zero Rollback Guard (`node scripts/guard-anti-rollback.js`):**
  `ИТОГ ПРОВЕРКИ: 22 пройдено, 0 провалено. Все инварианты производительности соблюдены на 100%! [OK]`
- **Тесты канона зарядов и трофеев (`node tests/shots_c1_canon.test.js`):**
  `100% PASS (все проверки оружия, расхода зарядов и выкупа трофеев пройдены)`
- **Тесты квестов и NPC (`node tests/quest.test.js`, `node tests/npc.test.js`):**
  `100% PASS`

---
*Спецификация сформирована и верифицирована в соответствии с правилами `AGENTS.md` и регламентом `audit-lifecycle-manager`.*
