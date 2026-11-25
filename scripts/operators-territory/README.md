# Территория операторов — архитектура, руины, стимпанк-база и тренировочный лагерь

## Состав ассетов и лицензии (`client/assets/props/operators/LICENSES.txt`)

1. **Собственная процедурная архитектура, террасы и руины (CC0 / Project Original)**:
   - Скрипт: `scripts/operators-territory/build_kit.py` (headless Blender → GLB + Draco, единый материал `opt_atlas`).
   - Объекты: `opt_bastion` (открытый зал с подиумом Командора, 6-ступенчатой парадной лестницей `0.225 м/шаг` без z-fighting, частично обрушенными восточной башней и восточным скатом крыши), `opt_plaza_deck`, `opt_plaza_deck_cracked`, `opt_plaza_deck_edge` (целые, расколотые и обрушенные плиты террас `8×8 м` без нахлёста), `opt_plaza_steps` (6-ступенчатые лестницы переходов `8×4.2 м`), `opt_bastion_parapet` (крепостные парапеты), `opt_pennant_wall` (строгие двусторонние багровые вымпелы без эмблем), `opt_hero_monument`, `opt_arch` (с клиновыми зазорами без z-fighting), `opt_column*`, `opt_ruin*`, `opt_ruin_tower`, `opt_ruin_bridge`, `opt_ruin_crater`, `opt_ruin_gear_wreck`, `opt_debris`, `opt_block`, `opt_slab` (углублённые плиты мощения), `opt_lamp`.
   - Атлас: `scripts/operators-territory/atlas.py` → `client/assets/props/textures/opt_atlas.webp` (1024×1024, WebP q82).

2. **Бесплатные 3D-паки с itch.io, Poly Haven и библиотека редактора (`scripts/operators-territory/build_itch_props.py`)**:
   - **Quaternius — Fantasy Props / Medieval Village / Stylized Nature (CC0)**: интерьерные и лагерные пропсы на `opt_quat_atlas.webp` (`opt_banner_hang` с `doubleSided: true`, манекены, мебель, кузня), а также обозы и сухие деревья (`opt_wreck_wagon`, `opt_wreck_pushcart`, `opt_dead_tree_a`, `opt_dead_tree_b`) на `opt_ruins_atlas.webp`.
   - **Библиотека проекта (реалистичные валуны и лагерное снабжение)**: гранитные валуны `opt_boulder_s`, `opt_boulder_m`, `opt_boulder_l` (геометрия `SM_RP_Rock_*` с высветленным гранитом `T_RP_Rocks_2` в `opt_ruins_atlas.webp`), наборы `bazaar/*.glb` (`xdhhddo`, `xdhhdfp`, `xf0kahv`, `xfxibbe`, `yccqdcq`, `yexjfhk`, `wlkiecl`, `tltvai3fa`) и полузасыпанный `monument_wheel.fbx`.
   - **Avramania (CC0) и 3dmodelscc0 (CC0)**: `opt_wall_stone`, `opt_weapon_rack_b`, `opt_rubble_pile`, `opt_camp_rug`, `opt_gas_cylinder`, `opt_cable_drum`, `opt_work_light`, `opt_cannon`, `opt_sack_grain`, `opt_cart_wheel`, `opt_wheelbarrow`, `opt_signpost`, `opt_ruin_vault`, `opt_ruin_stair` → `opt_camp_atlas.webp`.
   - **Трубопроводы BioShock и стимпанк-узлы**: модульные трубы (Poly Haven CC0), герметичные цельносварные магистрали из Blender (`opt_pipe_arch`, `opt_pipe_mega_bend`, `opt_pipe_riser_big`, `opt_pipe_trench_run`), `opt_boiler_station`, `opt_boiler_unit`, `opt_steam_wheel`, `opt_roof_vent`, `opt_bench_grinder`, `opt_steam_condenser`, `opt_switch_box` → единый стимпанк-атлас `opt_steam_atlas.webp` (1024×1024, WebP q84).

3. **Каталог, мир и запекание**:
   - Регистрация в каталоге и инстансинге: `scripts/operators-territory/register_catalog.js` → `client/js/props-library-data.js` (`79` записей `opt_*`), `client/js/prop-textures-data.js`.
   - Хаотичная многотеррасная площадь (`T1_TOP`, `MEM_TOP`, `T2_TOP`) с обвалами и трещинами без `Tier 3`, короткая разреженная изогнутая тропа (`opt_slab`) мимо стен Деревни к долине, замкнутые паропроводы, лесной пояс и подлесок, мирная суб-зона `terr_operators_camp`: `scripts/operators-territory/layout.js` (rev 81 → `editor-overrides.json` + `bake-world.js` → `shared/world-data.json` + `dist/client/data/world.json`).

В релиз (`scripts/build-client.js`) попадают только `.glb` и `.webp`, используемые в мире.
