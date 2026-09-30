# Terrain (Project Steam)

## Материал (главное — не ломать)

**Источник правды для земли:**

```
map     = client/data/textures/terr_light.webp   ← нарисованная маска всего острова
UV      = TD.uvs из FBX (1:1 с маской)
details = тайлящиеся grass/dirt/rock/sand/lava/swamp
          tileUv = vMapUv * 96
Final   = baseCol(mask) * detailCol(weights from mask RGB) + glow
```

Сектора `T_col_row` / detail256 — **опциональный пайплайн нарезки**, не заменяют
`terr_light.webp` в рантайме. В `terrain.js` маска всегда полная `terr_light.webp`.

## Архитектура mesh

```
                world XZ ~ 3730 × 3745 m (FBX island)
  4×4 geometry chunks (culling only), ONE shared material + terr_light
```

| Слой | Что | Файлы |
|------|-----|--------|
| **Height / mesh** | FBX → `terrain-data.js` | `convert_terrain1_to_data.py` |
| **Painted mask** | Macro color map | `terr_light.webp` |
| **Detail tiles** | Seamless ground albedo | `data/textures/*_BaseColor.*` |
| **Runtime** | mask × tiled details shader | `client/js/terrain.js` |

### Шейдер (как было)

```
baseCol   = texture(terr_light, vMapUv)
tileUv    = vMapUv * 96
weights   = classify RGB(baseCol) → lava/swamp/dirt/rock/grass/sand
detailCol = sum(detailTex_i * weight_i)
Final     = baseCol * detailCol * 1.6  +  lava/swamp glow
```

## Команды пайплайна

```bash
# Из корня project-steam
python slice_terrain_tiles.py --grid 4 --detail-size 256

# Если появится настоящий 8K master:
# положить Terr.webp в client/data/textures/ и снова:
python slice_terrain_tiles.py --grid 4
# (скрипт сам предпочтёт Terr.webp над terr_light.webp)

# Пересборка меша/высот из FBX:
python convert_terrain1_to_data.py
```

## Runtime API (`window.Terrain`)

| API | Назначение |
|-----|------------|
| `build(scene)` | Разбить меш, создать 4×4 секторов, preload tiles |
| `update(t)` | uTime + streaming вокруг игрока |
| `heightAt(x,z)` | Физика / ноги / камера |
| `mesh` | `THREE.Group` (editorKey `terrain_ground`, raycast recursive) |
| `worldToSector(x,z)` | `{col,row,key}` |
| `updateStreaming(x,z)` | Явный stream |
| `getSectorMeshes()` | Массив mesh’ей для raycast |
| `GRID_SIZE` / `STREAM_RADIUS` | 4 / 2 |

## Настройки в `terrain.js`

```js
var GRID_SIZE = 4;             // = slice --grid
var STREAM_RADIUS = 2;         // Chebyshev: 5×5 textures around player
var DETAIL_WORLD_SCALE = 0.12; // ~8 m на один повтор detail
var SEA = -35.0;
```

## Почему не один 8K на весь остров

1. **Вблизи** 8K → каша пикселей; detail 256×256 даёт чёткость у ног.
2. **VRAM** — грузим только соседние `T_*` (на 4×4 сейчас preload всех 512px — дёшево).
3. **Аутентичность L2** — секторная модель `T_XX_YY`.

## Следующие улучшения (мир)

1. **Настоящий splatmap** (RGBA weight bake из painted / Blender) вместо color-classify.
2. **Сетка 8×8** при master 8K+ (`--grid 8`).
3. **LOD mesh** — low-poly far sectors.
4. **Нормали detail** (optional bump).
5. **Склейка швов** — slight UV pad уже есть; при артефактах — overlap 1–2 px при slice.

## Совместимость

- `main.js` raycast: `intersectObject(Terrain.mesh, true)` — Group OK.
- Editor: `editorKey: terrain_ground` на root + children.
- Heightfield / shore walls / walk — без изменений по API.
