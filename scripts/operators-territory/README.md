# Территория операторов — кит руин и Бастион

Происхождение: собственные процедурные модели и текстура проекта, сторонних ассетов нет.
Лицензия: та же, что у игры (весь контент свой).

- Модели: `scripts/operators-territory/build_kit.py` (headless Blender) → GLB + Draco, LOD в файле (`_LOD1`, `_LOD2`).
- Текстура: `scripts/operators-territory/atlas.py` → `../textures/opt_atlas.webp` (1024², WebP q82, один атлас на весь кит).
- Расстановка в мире: `scripts/operators-territory/layout.js` (пишет сцену редактора и запекает мир).

В релиз попадают только GLB, которые стоят в мире (scripts/build-client.js), этот файл туда не копируется.
