# meadow_mower — Бешеная Газонокосилка

**id:** `meadow_mower`  
**Уровень:** 6–10 · solo_aggro · Холмы Астарда  
**Идея:** жирная бензиновая косилка-бандит: «подстригу под ноль». Не техника со схемами — **персонаж** с мордой, характером, читаемым боковым силуэтом.  
**Стиль:** `loose_bolt` — толстый контур, cel-shade, tech-cartoon RPG.  
**Палитра:** зелёный корпус `#338833` / тёмный `#225522`, глаза lime `#aaff00`, хром, чёрные колёса, копоть, выхлоп.  
**Scale:** ~2.4

### Правила
- **Один base** → 16 кадров edit-chain
- Full body, **pure side / mild ¾**, лицом **ВЛЕВО**
- Камера **eye-level orthographic** — как стоящий спрайт, не снизу
- В промптах **только видимое сбоку**. Не писать: underside, inside, open deck internals, «ножи снизу», «внутри корпуса», «смотр. снизу»
- Фон **#FF00AA**, без земли/тени/текста
- Death — cute comic, **без крови**

### Куда
`client/assets/mobs/meadow_mower/raw/`  
`base` + `idle_0…3` `walk_0…3` `attack_0…3` `death_0…3` (`.jpg` / `.jpeg` / `.png`)

---

## BASE → `base.jpg`

```
Classic 2D side-view game sprite, full body, facing left, eye-level orthographic camera, flat cartoon (not low angle).
A mean cartoon lawn-mower thug: stout lime-and-forest green metal body like a chunky riding mower shell, big black knobby wheels, chrome steering handlebar bent into a grumpy head with glowing lime eyes and a scar-like rust stripe across the brow, tall grass stuck in the grill like a messy beard, a toothy chrome bumper grin, roaring exhaust stack belching black-grey smoke, oil stains and warning stickers as scars, small angry eyebrows, personality-first appliance monster, thick readable silhouette.
Steampunk cartoon mobile RPG style, thick black outlines, cel-shaded, clean edges, readable when small.
Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text, isolated centered, full body with padding.
```

**Если ракурс кривой:**
```
Same character. Pure side-view 2D game sprite only. Eye-level, orthographic. Facing left. No low angle. Magenta #FF00AA.
```

---

## Префикс edit

```
Same exact character design, colors, and proportions as the reference. Full body side view facing left, eye-level orthographic game sprite. Steampunk cartoon, thick black outlines, cel-shaded. Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text.
```

**Death suffix:**
```
Cute comic cartoon death KO, no blood no gore, family-friendly slapstick. Magenta #FF00AA background.
```

---

## IDLE `idle_0`…`3`

| # | Что видно |
|---|-----------|
| **0** | стоит, дымок, злой покой |
| **1** | чуть выше, глаза ярче, больше дыма |
| **2** | чуть ниже, фырк из трубы, трава-борода колыхнулась |
| **3** | обратно в покой → loop |

**idle_0**
```
[prefix] Idle 1 of 4: parked mean stance facing left, soft exhaust puff, glowing lime eyes half-lidded angry, grass-beard still, loopable rest.
```

**idle_1**
```
[prefix] Idle 2 of 4: body bob a little higher, eyes brighter lime, thicker smoke plume, eyebrows twitch, still facing left.
```

**idle_2**
```
[prefix] Idle 3 of 4: body bob lower, sharp exhaust snort, grass-beard jostles, toothy bumper scowl, facing left.
```

**idle_3**
```
[prefix] Idle 4 of 4: settle back to rest height, thin smoke, ready glare, loopable to frame 1, facing left.
```

---

## WALK `walk_0`…`3`

| # | Что видно |
|---|-----------|
| **0** | катит влево, lean, колёса |
| **1** | подскок выше, дымный шлейф назад |
| **2** | присед ниже, комки травы/грязи сбоку |
| **3** | выравнивание → loop |

**walk_0**
```
[prefix] Walk 1 of 4: rolling left, body lean left, front wheel planted, light speed lines, exhaust trails right, mean grin, facing left.
```

**walk_1**
```
[prefix] Walk 2 of 4: bounce higher on wheels, stronger lean left, thicker smoke trail behind, dynamic cartoon roll, facing left.
```

**walk_2**
```
[prefix] Walk 3 of 4: bounce lower, wheels squash comic, grass clumps and dirt flecks fly beside the body, facing left.
```

**walk_3**
```
[prefix] Walk 4 of 4: recover toward level roll, moderate smoke, loopable to frame 1, full body facing left.
```

---

## ATTACK `attack_0`…`3`  
(удар «под ноль»: рывок + дуга скоса / масляный шлепок **сбоку влево** — только эффекты, видимые в профиль)

| # | Что видно |
|---|-----------|
| **0** | замах: корпус назад, глаза заряд |
| **1** | пик: рёв дыма, хром блестит |
| **2** | **HIT:** рывок влево, зелёно-жёлтая slash-дуга + брызги масла влево, звёзды |
| **3** | отход, дымок, ready |

**attack_0**
```
[prefix] Attack 1 of 4: wind-up facing left, body leans back, lime eyes charge bright, exhaust stacks denser smoke, bumper teeth grit.
```

**attack_1**
```
[prefix] Attack 2 of 4: peak charge, body coiled, roaring black-grey smoke, chrome bumper flash, eyes max lime, about to lunge left.
```

**attack_2**
```
[prefix] Attack 3 of 4: HIT — lunges left hard, big curved green-yellow mow-slash arc and oily spray shooting left past the bumper, yellow impact stars, recoil squash, facing left.
```

**attack_3**
```
[prefix] Attack 4 of 4: follow-through settle on wheels, residual smoke and oil drips on the side of the body, smug ready glare, facing left.
```

**Коротко если плывёт:**
```
attack_0: Same character side view. Lean back, bright eyes, more smoke. Magenta #FF00AA.
attack_1: Same character. Roaring smoke, coiled lunge. Magenta #FF00AA.
attack_2: Same character. Slash arc and oil spray left, stars. Magenta #FF00AA.
attack_3: Same character. After hit, soft smoke, ready. Magenta #FF00AA.
```

---

## DEATH `death_0`…`3` (+ death suffix)

| # | Что видно |
|---|-----------|
| **0** | X-eyes, пуф дыма |
| **1** | спирали, пастельный дым, колёса шатаются |
| **2** | заваливается набок slapstick |
| **3** | на боку, **Zzz**, тихий пар |

**death_0**
```
[prefix] Death 1 of 4: hit reaction, X-eyes, soft white-grey steam puff from exhaust, tiny stars, mostly upright facing left. [death suffix]
```

**death_1**
```
[prefix] Death 2 of 4: spiral dizzy eyes, pastel pink-green smoke puffs, wheels wobble comic, grass-beard droops, no blood. [death suffix]
```

**death_2**
```
[prefix] Death 3 of 4: tips sideways slapstick, big X-eyes, soft pastel clouds, handlebar head flops silly. [death suffix]
```

**death_3**
```
[prefix] Death 4 of 4: lying on side, sleepy X-eyes, big soft Zzz bubbles, quiet pastel steam, cute KO. [death suffix]
```

---

## Чеклист

- [ ] base + 16 кадров, точные имена  
- [ ] лицом **влево**, eye-level side  
- [ ] фон **#FF00AA**  
- [ ] один дизайн (зелёный thug-mower, трава-борода, bumper-улыбка, handlebar-голова)  
- [ ] death без крови  

Когда файлы в `raw/` — **«готово»** → sheets + `mob-db`.
```bash
python tools/process_mob_sprites.py meadow_mower --cell 256 --keep-raw
```
