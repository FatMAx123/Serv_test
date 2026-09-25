# Аудит дропа: элита, полевые РБ, хранители, рейды

Дата: 2026-09-20. Источники: `shared/mob-db.js`, `shared/loot-rules.js`, `client/assets/mobs/`.

## Покрытие

| Роль | Кол-во | Своя loot-таблица | PROMPTS.md (было → стало) | Спрайт-листы |
|---|---:|---:|---|---|
| elite / party_elite | 6 | 6 | 0 → 6 | нет |
| named (вкл. easter/secret) | 16 | 16 | 1 (`toaster_overlord`) → 16 | toaster + tralalero |
| field_rb | 9 | 9 | 0 → 9 | нет |
| raid (хранители + Колосс + high) | 8 | 8 | 0 → 8 | нет |

Всего фокус: **39**. Таблиц не хватало: **0**. Промптов не хватало: **38** — добавлены в `mobs-elite-boss-rb-prompts.md` и `client/assets/mobs/<id>/raw/PROMPTS.md`.

## Ядра хранителей (гарантия ch 1.0)

| Моб | Ядро | В таблице |
|---|---|---|
| scrap_tyrant | scrap_tyrant_core | да |
| drill_worm | drill_worm_core | да |
| press_hammer | press_hammer_core | да |
| boiler_sovereign | boiler_sovereign_core | да |
| cruna_overseer | cruna_overseer_core | да |
| rezdiq_colonel | rezdiq_seal | да |
| green_protocol | green_protocol_core | да |
| steel_colossus | steel_colossus_core | да |

## Что починено в дропе

1. **Утечка Top/High D на Фазе 1.** Фильтр banned-оружия в `_enrichPhase1Loot` был `maxLvl <= 20`. У `boiler_overpress` (19–22), `green_protocol` (22), `cruna_overseer` (21) в rare оставались `demon_staff` / `ghost_manifold` / `life_manifold`. Порог поднят до **≤ 22**. Колосс (22–23) не задет: у него уже Low-D группы.
2. **lootHint врал.** Подсказки Колосса (`sentinel_staff`, `goat_staff`, `blood_shield`) и несуществующие `wooden_shield` / `hunter_knife` заменены на реальные id таблиц.
3. **Пасхалки.** В rare добавлены обещанные уникали: уточка/кофе-масло (toaster), энергетик (кофемашина, bluetooth), QR (роутер), стикер (принтер).

## Остаточный риск

- Спрайт-листов нет почти ни у кого из боссов — только промпты. Генерация Imagine ещё не гонялась.
- `mobs-database.html` живёт своим JSON: там старые эмодзи-лут. Пересобрать `scripts/build_mobs_database_html.js`, когда понадобится страница.
- High-контент 27–40 (`branded_warden`, `cruma_core`, `directive_overmind`) намеренно держит C-грейд — не Фаза 1.
