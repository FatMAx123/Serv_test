# Phase 1: контент 1–20

Цель текущего этапа — **играбельный open world 1–20**, 1-я смена класса @20.  
Всё выше — **данные на будущее**, не целевой live-контент.

## Капы

| Параметр | Значение | Файл |
|----------|----------|------|
| MAX_LEVEL (EXP) | **20** | `shared/l2-exp-table.js` |
| 1-я профессия | 20 | `constructor` / `technomancer` (инженер), mechanic/destroyer/gunner (оператор) |
| 2-я профессия | 40 | FUTURE |
| Circuit gear live | **NG + D** | shop + drop 1–20 |
| Circuit gear future | C, B | `item-db` / inventory / loot-items, без шопа 1–20 |
| **Рейды и боссы phase 1** | **9 боссов (до 23 ур.)** | `mob-db` + `game-rules.BOSSES` + loot |

## Боссы и Рейды phase 1 (live, до 23 ур.)

### Рейды и Полевые РБ (14–20 ур.)
| id | Имя | Ур. | Пати | Зона | Ядро | Оружие и Экипировка (шансы) |
|----|-----|-----|------|------|------|-----------------------------|
| `scrap_tyrant` | **Тиран Свалки** | 14–16 | 7 | Свалка / Запад | scrap_tyrant_core (D) ~55% | **Low D** mace_prayer/magic_mace ~14%, copper_shield ~14%, bastard_sword, steam_hammer, copper_chainmail |
| `drill_worm` | **Босс-Бур** | 16–18 | 9 | Забвение / холмы | drill_worm_core (D) ~55% | **Low D** heavy_doom_hammer, bastard_sword, spring_bow, bone_breastplate, ring_mail сет |
| `press_hammer` | **Автономный Пресс-Молот** | 18–20 | 12 | Тихая заводь | press_hammer_core (D) ~60% | **Low D** revolution_sword, heavy_doom_hammer, prowler_dagger, ring_mail сет |
| `boiler_sovereign` | **Суверен Котла** | 19–20 | 14 | Котловые земли | boiler_sovereign_core (D) ~70% | **Low D** copper_plate, revolution_sword, heavy_doom_hammer, scale_mail сет, reinforced_leather сет |

### Вершинные Боссы Фазы 1 (20–23 ур. — эндгейм контент для игроков 20 ур.)
| id | Имя | Ур. | Роль | Зона | Ключевой дроп (D-Grade) |
|----|-----|-----|------|------|-------------------------|
| `cruna_overseer` | **Надзиратель Круны** | 20–21 | Field RB | Дворы Круны | **Mid/HiMid D** bone_resonator, life_manifold, boiler_shield, press_hammer_core, crystal_d (6–12) |
| `logic_corruptor` | **Повреждатель Логики** | 20–21 | Named | Бараки Рездика | **High D** ghost_manifold, pressure_amplifier_d, crystal_d (1–4) |
| `rezdiq_colonel` | **Полковник Рездик-VII** | 21–22 | Field RB | Бараки Рездика | **High D** lion_shield, atuba_mace, scale_mail_breastplate/gaiters, drill_worm_core, crystal_d (8–16) |
| `green_protocol` | **Протокол «Зелёный»** | 22–23 | Raid Boss | Руины химзавода | **Top D / High D** demon_staff, ghost_manifold, green_protocol_core (D), pressure_amplifier_d, crystal_d (12–24) |
| `steel_colossus` | **Стальной Колосс Предела** | 22–23 | Apex Raid | Крепость стального предела | **Top D** sentinel_staff, goat_staff, blood_shield, scale_mail сет, operator_gauntlets_low, pressure_amplifier_d, crystal_d (16–32) |

Скиллы: AoE, stun, summon drones, silence (valve_lock), enrage (overclock), colossus stomp.  
Статы: role `raid` (×40 HP от mid-curve) и `field_rb` (×18 HP) + override в `G.BOSSES` через `_bossFromDb`.

## Зоны live (1–20)

| Ур. | Зоны |
|-----|------|
| 1–5 | Школа / двор операторов |
| 5–12 | Холмы Астарда, Междуречье, Свалка, Запад |
| 11–15 | Сады, Пасека, Дворы Круны, Тихая заводь |
| 15–18 | Полигон, Поле забвения, Химзавод, Бараки, Крепость |
| 18–20 | **Котловые земли** (мобы 18–20 ур.) |

### FUTURE (не баланс 1–20)

- Утёс Стали 24+, Башня Круны 28+, Бункер 34–40  
- Боссы Фазы 2: `branded_warden` (27–30), `tower_dispatcher` (32–35), `directive_node` (36–39), `cruma_core` (36–38), `directive_overmind` (40)

## Оружие инженера (mag ladder 1:1)

### Live (17 шт.) — до **Top D @20**

| Тир | id | L2 ref | руки | atk/cAtk | Источник в Фазе 1 |
|-----|-----|--------|------|----------|-------------------|
| Low NG | apprentice_wand | Apprentice's Wand | 2H | 12/15 | Стартовое / Шоп |
| Mid NG | willow_coil | Willow Wand | 1H | 15/20 | Шоп |
| Mid NG | cedar_manifold | Cedar Staff | 2H | 17/25 | Шоп / Дроп 5–10 |
| Top NG | mage_staff | **Калибратор Цеха** | 2H | 22/32 | Шоп / Дроп 10–15 |
| Top NG | crucifix_blood | X-Узел Давления | 1H | 22/32 | Шоп / Дроп 10–15 |
| Top NG | voodoo_doll | Кукла-Сбой | 1H | 22/32 | Шоп / Дроп 10–15 |
| Low D | mace_prayer | Булава-Манометр | 1H | 26/38 | Шоп / РБ 14–20 |
| Low D | magic_mace | Импульсная Булава | 1H | 26/38 | Шоп / РБ 14–20 |
| Mid D | demon_fangs | Клыки Сбоя | 1H | 32/46 | РБ 18–21 |
| Mid D | tears_fairy | Слёзы Искры | 1H | 32/46 | РБ 18–21 |
| HiMid D | bone_resonator | Костяной Дробитель | 2H | 39/55 | РБ Cruna Overseer (20–21) |
| HiMid D | life_manifold | Ульевой Молот | 2H | 39/55 | РБ Cruna Overseer (20–21) |
| High D | ghost_manifold | Глефа Тишины | 2H | 47/64 | Logic Corruptor (20–21), Green Protocol (22–23) |
| High D | atuba_mace | Булава Атубы | 1H | 47/64 | Rezdiq Colonel (21–22) |
| **Top D** | demon_staff | **Сверхпресс** | 2H | **53/72** | Green Protocol (22–23) |
| **Top D** | sentinel_staff | Молот Оплота | 2H | **53/72** | Steel Colossus (22–23) |
| **Top D** | goat_staff | Вилочный Крушитель | 2H | **53/72** | Steel Colossus (22–23) |

### Шоп (Векс и Дора)

- Оружие: NG все + Low D (`mace_prayer`, `magic_mace`, `operator_hammer_low`, `iron_hammer`, `copper_pipe`, `spring_bow`, `steam_hammer`, `composite_bow`, `reinforced_bow`)
- Броня: NG все + Low D (`copper_plate`, `steam_helmet`, `steam_boots`, `boiler_shield`, сеты «Первичный Контур», «Турбо-Контур», «Сверхдавление», «Армированный Сплав»)

### Дроп 1–20
- Solo мобы: NG → Low D по зонам
- **party_elite / элита:** Low D экипировка и оружие
- **Рейд-боссы 14–20 ур.:** Low D оружие и сеты брони
- **Вершинные Боссы 20–23 ур.:** эксклюзивный источник Mid D, High D и Top D экипировки
- C/B/A/S ранги и `crystal_c` **не** падают ни с одного моба или босса Фазы 1

### Future (15 шт., isLivePhase1:false)

C/B ladder — item-db/inventory, без шопа phase 1  


## Классы

| Live | Future |
|------|--------|
| engineer, operator (1) | 2nd @40 |
| constructor, technomancer @20 | pressure_sorcerer, machine_warlock, … |
| mechanic, destroyer, gunner @20 | repair_engineer, … |

## Чеклист перед расширением 20–40

1. `MAX_LEVEL` → 40  
2. Шоп/дроп C (40–51), B (52+)  
3. Данжи Утёс / Башня / Бункер в ротацию  
4. 2-я профессия + скиллы  
5. `weapon.txt` — перенести C/B в ACTIVE  

## Файлы-источники

- EXP: `shared/l2-exp-table.js`  
- Combat weapons: `shared/item-db.js`  
- UI names: `client/js/inventory.js`  
- Shop: `shared/world-metrics.js` → `trader_vex`  
- Drop: `shared/loot-rules.js`  
- Сводка: `client/assets/weapons/weapon.txt`  
