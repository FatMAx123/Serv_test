# hill_presser — Стиралка-Убийца

**id:** `hill_presser`  
**Уровень:** 9–12 · solo_aggro · Холмы Астарда / Западные земли  
**Flavor:** стиралка на 1400 об/мин с кирпичом внутри; скачет и лупит боковыми ударами.  
**Стиль:** `loose_bolt` / `meadow_mower` — толстый чёрный контур, cel-shade, tech-cartoon RPG.  
**Палитра:** body grey-blue `#555577` / dark `#333355`, eyes amber `#ffaa00`, chrome door ring, white enamel, soap suds, rust streaks.  
**Scale:** ~2.8 (heavy)

### Правила
- **Один base** → все 16 кадров **edit-chain** от него  
- Full body, **pure side / mild ¾**, лицом **ВЛЕВО**  
- Камера **eye-level orthographic** — не снизу, не worm’s-eye  
- В промптах **только видимое сбоку** — не «внутри барабана», не «снизу», не схемы  
- Фон только **#FF00AA**, без земли, тени, текста, UI  
- Death — cute comic KO, **без крови**  
- Персонаж: злая прыгающая стиралка-тяжеловес, не «фото бытовой техники»

### Куда
`client/assets/mobs/hill_presser/raw/`

| Файл | Что |
|------|-----|
| `base.jpg` | якорь |
| `idle_0`…`3` | idle |
| `walk_0`…`3` | walk (скачущий «отжим») |
| `attack_0`…`3` | attack (press_slam / боковой удар) |
| `death_0`…`3` | death |

Допустимы `.jpeg` / `.png` — стемы те же.

---

## BASE → `base.jpg` (image_gen)

```
Classic 2D side-view game sprite, full body, facing left, eye-level orthographic camera, flat cartoon (not low angle).
A furious cartoon top-load washing machine monster: chunky grey-blue enamel body, round chrome door ring facing left like a mouth, angry glowing amber eyes on the top panel, small metal feet stompers, rattling lid, soap foam flecks and rust scars, "spin cycle berserker" vibe, heavy and intimidating but readable silhouette, personality-first appliance thug.
Steampunk cartoon mobile RPG style like Lineage cartoon tech, thick black outlines, cel-shaded, clean edges, readable at small size.
Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text, isolated centered, full body with padding.
```

**Если ракурс кривой:**
```
Same character. Pure side-view 2D game sprite only. Eye-level, orthographic. Facing left. No low angle. No view inside the drum. Magenta #FF00AA.
```

---

## Префикс edit (копируй в каждый кадр)

```
Same exact character design, colors, and proportions as the reference. Full body pure side view facing left, eye-level orthographic game sprite camera (NOT low angle, NOT from below). Steampunk cartoon game sprite, thick black outlines, cel-shaded. Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text.
```

**Death suffix:**
```
Cute comic cartoon death KO, no blood no gore no wounds, family-friendly slapstick. Magenta #FF00AA background.
```

---

## IDLE `idle_0`…`3`

| # | Что видно |
|---|-----------|
| **0** | стоит на ножках, лёгкая дрожь, пена тихая |
| **1** | корпус чуть выше, глаза ярче, крышка дрогнула |
| **2** | чуть ниже, рывок пены/пара у шва, злой скан |
| **3** | settle → loop |

**idle_0**
```
[prefix] Idle frame 1 of 4: parked mean stance on metal feet facing left, soft soap foam flecks still, amber eyes half-lidded angry, loopable rest pose.
```

**idle_1**
```
[prefix] Idle frame 2 of 4: body bobbed slightly higher, eyes brighter amber, lid twitch, a bit more foam at the door ring, still facing left.
```

**idle_2**
```
[prefix] Idle frame 3 of 4: body bobbed slightly lower, sharp snort of white steam from a side seam, eyebrows furious, door ring grin, facing left.
```

**idle_3**
```
[prefix] Idle frame 4 of 4: settle back to rest height, thin foam, ready glare, loopable to frame 1, full body facing left.
```

---

## WALK `walk_0`…`3`  
(скачущий отжим влево — колёс нет, топот ножек)

| # | Что видно |
|---|-----------|
| **0** | прыжок влево, lean, ножки согнуты |
| **1** | в воздухе выше, пена шлейфом вправо |
| **2** | приземление ниже, squash, брызги пены |
| **3** | recovery → loop |

**walk_0**
```
[prefix] Walk hop frame 1 of 4: hopping left, body lean left, metal feet leave ground slightly, light motion lines, foam trails right, facing left, eye-level.
```

**walk_1**
```
[prefix] Walk hop frame 2 of 4: mid-air higher bounce left, body compressed for spin vibe, thicker foam trail right, dynamic but upright side view, facing left.
```

**walk_2**
```
[prefix] Walk hop frame 3 of 4: hard land squash, feet plant, comic soap splash flecks beside body, facing left, still pure side orthographic.
```

**walk_3**
```
[prefix] Walk hop frame 4 of 4: recovery hop toward level, moderate foam, loopable to frame 1, full body facing left, eye-level.
```

---

## ATTACK `attack_0`…`3`  
(press_slam: замах → заряд → **боковой удар влево** → follow)

| # | Что видно |
|---|-----------|
| **0** | wind-up: корпус назад, глаза заряд |
| **1** | peak charge: дрожь, пена, amber max |
| **2** | **HIT:** боковой slam влево, impact stars, squash |
| **3** | follow-through, residual foam, ready |

**attack_0**
```
[prefix] Attack frame 1 of 4: wind-up facing left, body leans slightly back, amber eyes charge bright, lid rattles, foam builds at door ring.
```

**attack_1**
```
[prefix] Attack frame 2 of 4: peak charge, body coiled, vibrating spin-cycle shake, eyes max amber glow, white foam burst at seams, about to slam left.
```

**attack_2**
```
[prefix] Attack frame 3 of 4: HIT — heavy body-check slam left, curved impact arcs and yellow stars near the door ring, squash-stretch, dynamic side view facing left.
```

**attack_3**
```
[prefix] Attack frame 4 of 4: follow-through settle on feet, residual foam and soft steam, smug ready glare, facing left, eye-level.
```

**Коротко если плывёт:**
```
attack_0: Same side-view character. Lean back, bright eyes, more foam. Magenta #FF00AA.
attack_1: Same side-view character. Spin-cycle shake, max glow. Magenta #FF00AA.
attack_2: Same side-view character. Slam left, impact stars. Magenta #FF00AA.
attack_3: Same side-view character. After slam, soft foam. Magenta #FF00AA.
```

---

## DEATH `death_0`…`3` (+ death suffix)

| # | Что видно |
|---|-----------|
| **0** | X-eyes, пуф пены/пара |
| **1** | спирали, пастельная пена, шатается |
| **2** | заваливается набок slapstick |
| **3** | на боку, **Zzz**, тихий пар |

**death_0**
```
[prefix] Death frame 1 of 4: hit reaction, X-eyes or crossed dizzy eyes, soft white foam puff from door ring, tiny stars, mostly upright facing left. [death suffix]
```

**death_1**
```
[prefix] Death frame 2 of 4: spiral dizzy eyes, pastel pink-blue foam puffs, lid floppy, wobbly feet, no blood. [death suffix]
```

**death_2**
```
[prefix] Death frame 3 of 4: tips sideways slapstick, big X-eyes, soft pastel soap clouds, handle flop silly. [death suffix]
```

**death_3**
```
[prefix] Death frame 4 of 4: lying on side, sleepy X-eyes, big soft Zzz bubbles, quiet pastel steam, cute KO, no blood. [death suffix]
```

---

## Чеклист

- [ ] `base` + 16 кадров, точные имена  
- [ ] лицом **влево**, eye-level side  
- [ ] фон **#FF00AA**  
- [ ] одна стиралка (серо-синий корпус, chrome door, amber eyes, ножки)  
- [ ] death без крови  
- [ ] файлы в `client/assets/mobs/hill_presser/raw/`

---

## Когда готово

Кинь исходники в `raw/` и напиши **«готово»** — сошью sheets:

```bash
python tools/process_mob_sprites.py hill_presser --cell 256 --keep-raw
```

и подключу `visual.sheets` в `mob-db`.
