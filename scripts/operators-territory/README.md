# Территория операторов — архитектура, руины и тренировочный лагерь

## Состав ассетов и лицензии (`client/assets/props/operators/LICENSES.txt`)

1. **Собственная процедурная архитектура и руины (CC0 / Project Original)**:
   - Скрипт: `scripts/operators-territory/build_kit.py` (headless Blender → GLB + Draco, LOD в файле `_LOD1` / `_LOD2` где оправдано, по одному материалу на модель).
   - Главные объекты: `opt_bastion` (проходимый зал с открытым арочным порталом, 3 лестницами, подиумом командира, паровым котлом и балками перекрытий), `opt_hero_monument` (Монумент Героя вместо прежнего святилища), `opt_arch`, `opt_column*`, `opt_ruin*`, `opt_debris`, `opt_block`, `opt_slab`, `opt_lamp`.
   - Атлас: `scripts/operators-territory/atlas.py` → `client/assets/props/textures/opt_atlas.webp` (1024×1024, WebP q82).

2. **Бесплатные 3D-паки с itch.io (все CC0 1.0 — коммерческое использование разрешено)**:
   - **Quaternius — Fantasy Props MegaKit** (`https://quaternius.itch.io/fantasy-props-megakit`): 19 моделей (`opt_dummy`, `opt_weapon_rack`, `opt_anvil`, `opt_whetstone`, `opt_workbench`, `opt_table_long`, `opt_bench_camp`, `opt_chair`, `opt_bookcase`, `opt_bookstand`, `opt_cabinet`, `opt_chandelier`, `opt_lantern_indoor`, `opt_chest`, `opt_barrel`, `opt_crate`, `opt_crate_iron`, `opt_banner_stand`, `opt_banner_hang`), запечённых через Cycles EMIT в общий одноматериальный атлас `opt_quat_atlas.webp` (1024×1024, WebP q85).
   - **Avramania Asset Library** (4 пака CC0): `opt_palisade`, `opt_weapon_rack_b`, `opt_rubble_pile`, `opt_camp_rug`.
   - **3dmodelscc0 — Industrial & Medieval Props** (2 пака CC0): `opt_gas_cylinder`, `opt_cable_drum`, `opt_work_light`, `opt_cannon`, `opt_sack_grain`.
   - Конвейер импорта и упаковки атласа `opt_camp_atlas.webp` (1024×1024, WebP q84): `scripts/operators-territory/build_itch_props.py` → манифест `itch-manifest.json` + файл лицензий `LICENSES.txt`.

3. **Каталог, мир и запекание**:
   - Регистрация в каталоге редактора и профилях инстансинга (`InstancedMesh`): `scripts/operators-territory/register_catalog.js` → `client/js/props-library-data.js` и `client/js/prop-textures-data.js`.
   - Компоновка лагеря, интерьера Бастиона, мирной подзоны `terr_operators_camp` («База операторов»), руин и коллайдеров: `scripts/operators-territory/layout.js` (пишет `editor-overrides.json` и запекает `shared/world-data.json` + `dist/client/data/world.json`).

В релиз (`scripts/build-client.js`) попадают только `.glb` и `.webp`, используемые в мире; этот файл и исходники пайплайна в релиз не копируются.
