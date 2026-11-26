# Территория операторов — архитектура, руины, стимпанк-база и тренировочный лагерь

## Состав ассетов и лицензии (`client/assets/props/operators/LICENSES.txt`)

1. **Собственная процедурная архитектура, стимпанк и уникальные руины (CC0 / Project Original)**:
   - Скрипты: `scripts/operators-territory/build_kit.py` и `scripts/operators-territory/kit_unique.py` (headless Blender → GLB + Draco, единый материал `opt_atlas`).
   - Объекты архитектуры: `opt_bastion`, `opt_plaza_deck`, `opt_plaza_steps`, `opt_gate_steps`, `opt_bastion_parapet`, `opt_pennant_wall`, `opt_hero_monument`, `opt_arch` (ступенчатый облом правого пилона без острых граней), `opt_column*` (закрытые капители снизу на LOD0 и LOD2), `opt_ruin_tower`, `opt_ruin_bridge`, `opt_ruin_crater`, `opt_ruin_gear_wreck`, `opt_debris`, `opt_slab`, `opt_lamp`.
   - 20 уникальных стимпанк-узлов и руин (`kit_unique.py`): `opt_steam_boiler_tower`, `opt_steam_dynamo`, `opt_steam_cistern`, `opt_forge_hearth`, `opt_steam_brazier`, `opt_copper_tanks`, гладкие 14-сегментные медные трубы без децимации (`opt_pipe_bridge_east`, `opt_pipe_wall_manifold`, `opt_pipe_ground_riser`, `opt_pipe_arch_ground`) и не повторяющиеся руины (`opt_ruin_gate_pylon`, `opt_ruin_viaduct_east`, `opt_ruin_foundry_shell`, `opt_ruin_wall_breach`, `opt_ruin_wall_buttress`, `opt_ruin_wall_colonnade`, `opt_ruin_crane_wreck`, `opt_ruin_boiler_wreck`, `opt_ruin_rubble_a`, `opt_ruin_rubble_b`).
   - Атлас: `scripts/operators-territory/atlas.py` → `client/assets/props/textures/opt_atlas.webp` (1024×1024, WebP q82, добавлены `copper_strip` и манометр `gauge`).

2. **Бесплатные 3D-паки с itch.io и библиотека редактора (`scripts/operators-territory/build_itch_props.py`)**:
   - **Quaternius — Fantasy Props / Medieval Village / Stylized Nature (CC0)**: интерьерные и лагерные пропсы на `opt_quat_atlas.webp` (`opt_banner_hang` с `doubleSided: true`, манекены, мебель, кузня; мелкие предметы `opt_bench_camp`, `opt_chair`, `opt_anvil`, `opt_whetstone`, `opt_bookstand`, `opt_chest`, `opt_barrel`, `opt_crate`, `opt_crate_iron` без коллизий), а также обозы и сухие деревья (`opt_wreck_wagon`, `opt_wreck_pushcart`, `opt_dead_tree_a`, `opt_dead_tree_b`) на `opt_ruins_atlas.webp`.
   - **Библиотека проекта**: гранитные валуны `opt_boulder_s` (без коллизии), `opt_boulder_m`, `opt_boulder_l`, мелкие наборы `bazaar/*.glb` (`xdhhdfp`, `xf0kahv`, `xfxibbe`, `yccqdcq`, `yexjfhk`, `wlkiecl`, `tltvai3fa` без коллизий) и `monument_wheel.fbx`.
   - **Avramania (CC0) и 3dmodelscc0 (CC0)**: `opt_weapon_rack_b`, `opt_rubble_pile`, `opt_camp_rug`, `opt_cable_drum`, `opt_cannon`, `opt_sack_grain`, `opt_cart_wheel`, `opt_wheelbarrow`, `opt_signpost` → `opt_camp_atlas.webp`.
   - **Силовая и маховик**: `opt_boiler_station`, `opt_steam_wheel` → `opt_steam_atlas.webp` (удалены розовые крыши `opt_boiler_unit`, вентблоки `opt_roof_vent`, серая ткань `xdhhddo`, свод `opt_ruin_vault`, серые стены `opt_wall_stone`, жёлтые прожекторы/баллоны/щитки и старые децимированные трубы).

3. **Каталог, мир и запекание**:
   - Регистрация в каталоге и инстансинге: `scripts/operators-territory/register_catalog.js` → `client/js/props-library-data.js` (`82` записи `opt_*`), `client/js/prop-textures-data.js`.
   - Твёрдые плиты террас `opt_plaza_deck` под всей мебелью и мастерскими с автопроверкой отсутствия висящих пропсов `assertNoFloatingProps`, открытая 8-метровая южная лестница `opt_gate_steps`, отсутствие коллизий у мелких предметов, уникальные руины в окрестностях и мирная суб-зона `terr_operators_camp`: `scripts/operators-territory/layout.js` (rev 86 → `editor-overrides.json` + `bake-world.js` → `shared/world-data.json` + `dist/client/data/world.json`).

В релиз (`scripts/build-client.js`) попадают только `.glb` и `.webp`, используемые в мире (`client/assets/props/operators/`, `86` каталожных моделей v8, без устаревших `bazaar/*` и кукольных пропсов).

## v12: окрестности по дорогам автора, Ржавая река в исходном русле

Рельеф и покраска террейна скриптами **не меняются**: дороги и газоны рисует автор (террейн и карта M).

Порядок пересборки:
1. `python scripts/operators-territory/road_mask.py [--png обзор.png]` — маска нарисованных дорог → `road-mask.json`
   (клетки 2 м). Источник: красно-бурые полосы `terr_light.webp` (R − G ≥ 16, строка = v·N, как на карте)
   и слой брусчатки `terrain-paint-1.png` (строка = (1 − v)·N). Раскладка не ставит на дорогу ни пропсов, ни деревьев, ни кустов.
2. `node scripts/operators-territory/river-water.js [--dry] [--profile [--all]]` — вода в существующем русле по
   тальвегу `river-path-relief.json`: исток у прорванного водовода (где начинается бурое русло), уровень почти по бровкам,
   монотонно к морю; котловина перед устьем держится до естественного порога. Пишет `client/js/river-data.js`,
   `shared/river-data.json`, `river-path.json`. Полуширина разлива — 24 м в верхнем ущелье, до 32 м ниже.
3. Модели кита: `"D:/3d/Blernder/blender.exe" -b --factory-startup -P scripts/operators-territory/build_kit.py -- <детали>`,
   затем `node scripts/operators-territory/register_catalog.js`.
4. `node scripts/operators-territory/layout.js` — сцена: `layout-park.js` (Большой мост на переправе правой дороги,
   бывший парк у левой дороги — фонтан в кольце лип, аллея от дороги, беседка, оранжерея; берега; редкие рощи;
   хутор; промзона), контур зоны, `fixedSpots`, запекание мира.

- Глубокая вода (> 1.25 м) непроходима, как море: `shared/river-geo.js` (сервер: `shared/geo.js`, спавн мобов; клиент:
  `player.js`). Переправа — по настилу моста; створ моста подбирается так, чтобы оба въезда были проходимыми.
- Вода рисуется в `client/js/water.js` (`buildRivers`): 1 материал, uniform-ы общие с океаном.
- Споты зоны — `fixedSpots` у hunt-зоны (`shared/mob-db.js → buildSpotsFromEditorZones`), число спотов прежнее (20).
- Без оград, ворот, газонов и травяных «ковров» в окрестностях; всё — внутри контура зоны (запас 14 м).
