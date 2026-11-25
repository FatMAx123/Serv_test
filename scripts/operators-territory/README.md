# Территория операторов — архитектура, руины, стимпанк-база и тренировочный лагерь

## Состав ассетов и лицензии (`client/assets/props/operators/LICENSES.txt`)

1. **Собственная процедурная архитектура, террасы и руины (CC0 / Project Original)**:
   - Скрипт: `scripts/operators-territory/build_kit.py` (headless Blender → GLB + Draco, единый материал `opt_atlas`).
   - Объекты: `opt_bastion` (открытый зал с подиумом Командора, 6-ступенчатой парадной лестницей `0.225 м/шаг`, фасадной/боковой паровой обвязкой), `opt_plaza_deck` (каменные плиты террас `8×8 м`), `opt_plaza_steps` (6-ступенчатые лестницы переходов `8×4.2 м`), `opt_bastion_parapet` (крепостные парапеты с паровым поручнем), `opt_banner_wall` (плоские настенные/башенные стяги с гербом), `opt_hero_monument`, `opt_arch`, `opt_column*`, `opt_ruin*`, `opt_debris`, `opt_block`, `opt_slab`, `opt_lamp`.
   - Атлас: `scripts/operators-territory/atlas.py` → `client/assets/props/textures/opt_atlas.webp` (1024×1024, WebP q82).

2. **Бесплатные 3D-паки с itch.io и Poly Haven (`scripts/operators-territory/build_itch_props.py`)**:
   - **Quaternius — Fantasy Props MegaKit (CC0)**: 18 моделей (`opt_dummy`, `opt_weapon_rack`, `opt_anvil`, `opt_whetstone`, `opt_workbench`, `opt_table_long`, `opt_bench_camp`, `opt_chair`, `opt_bookcase`, `opt_bookstand`, `opt_cabinet`, `opt_chandelier`, `opt_lantern_indoor`, `opt_chest`, `opt_barrel`, `opt_crate`, `opt_crate_iron`, `opt_banner_hang` с металлической скобой крепления и багрово-бронзовым полотнищем) → общий атлас `opt_quat_atlas.webp`.
   - **Avramania (CC0) и 3dmodelscc0 (CC0)**: `opt_wall_stone` (вместо деревянных оград), `opt_weapon_rack_b`, `opt_rubble_pile`, `opt_camp_rug`, `opt_gas_cylinder`, `opt_cable_drum`, `opt_work_light`, `opt_cannon`, `opt_sack_grain` → `opt_camp_atlas.webp`.
   - **Poly Haven Modular Industrial Pipes 01 (CC0) + SKC-Shop Free Sampler (Commercial OK) + Репозиторий + 3dmodelscc0**: `opt_boiler_station`, `opt_boiler_unit`, `opt_steam_wheel`, `opt_pipe_straight`, `opt_pipe_vertical`, `opt_pipe_elbow`, `opt_pipe_tee`, `opt_pipe_valve`, `opt_pipe_arch` (составная надпроездная паровая арка-магистраль), `opt_roof_vent`, `opt_bench_grinder`, `opt_steam_condenser`, `opt_switch_box` → единый стимпанк-атлас `opt_steam_atlas.webp` (1024×1024, WebP q84).

3. **Каталог, мир и запекание**:
   - Регистрация в каталоге и инстансинге: `scripts/operators-territory/register_catalog.js` → `client/js/props-library-data.js`, `client/js/prop-textures-data.js`.
   - Многотеррасная компоновка (`T1_TOP`, `MEM_TOP` для Монумента Героя, `T2_TOP`, `T3_TOP`), монолитные walkable-плиты без швов, башенные/колонные штандарты, паровая котельная и мирная зона `terr_operators_camp`: `scripts/operators-territory/layout.js` (rev → `editor-overrides.json` + `bake-world.js` → `shared/world-data.json` + `dist/client/data/world.json`).

В релиз (`scripts/build-client.js`) попадают только `.glb` и `.webp`, используемые в мире.
