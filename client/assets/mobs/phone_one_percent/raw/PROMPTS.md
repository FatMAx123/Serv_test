# phone_one_percent — Смартфон «1%»

**id:** `phone_one_percent`  
**Уровень:** 17–19 · solo_aggro · Восточный полигон · соло  
**Вайб:** 1% заряда и ни одной розетки  
**Логика:** смартфон с треснутым экраном; на последних каплях бежит заряжаться  
**Стиль:** реалистичный (фотореал-рендер настоящего прибора), без мультяшного контура.  
**Scale в игре:** ~1.8

### Правила
- Один **base** → 16 кадров цепочкой edit от base
- Full body, ¾ / почти профиль, лицом **ВЛЕВО**, камера на уровне глаз
- Фон **#FF00AA**, без земли, тени, текста и логотипов; без дыма и частиц (VFX добавит движок)
- Death — разваливается на свои детали, **без крови**

### Куда
`client/assets/mobs/phone_one_percent/raw/` — `base` + `idle_0…3` `walk_0…3` `attack_0…3` `death_0…3` (`.jpg`/`.png`).
Готовые листы — `client/assets/mobs/phone_one_percent/{idle,walk,attack,death}_sheet.png` (4 кадра по 256 px), затем блок `sheets` в `shared/mob-db.js`.

---

## BASE → `base.jpg`

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view facing left, eye-level camera. Realistic style: photoreal 3D render of a real household device turned rogue machine, true-to-life proportions and materials — scratched plastic, painted and brushed steel, rubber, glass, dust, grime, light rust, worn stickers with no writing. Believable scavenged limbs bolted on: pipes, clamps, forks, cords. Face only from its own lamps, display or indicator LEDs. No organic parts, no flesh, no fur, no animal eyes, no teeth, no magic, no runes, no glowing orbs, no cartoon outlines. A small blank paper repair tag tied to the device with twine. Soft neutral studio lighting, sharp focus, high detail. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no logos, no brand names, no people. No smoke, no steam, no particles — solid materials only. A modern black touchscreen smartphone with a spider-web cracked screen, standing on bent charging-cable legs, the screen showing two red alert eyes and a nearly empty battery bar, the charging cable dragging behind it searching for a socket, the case scuffed, anxious pose. Medium.
```

## Префикс edit

```
Same exact device, materials, colors and proportions as the reference. Photoreal 3D render, full body three-quarter view facing left, eye-level camera, soft neutral studio light. Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text, no logos.
```

**Death suffix:**
```
Comic but realistic shutdown: device breaks apart into its own parts, no blood, no gore, family-friendly. Magenta #FF00AA background.
```

## IDLE `idle_0`…`3`

**idle_0**
```
[prefix] Idle 1 of 4: standing, screen flickering, battery bar blinking, rest pose, facing left.
```

**idle_1**
```
[prefix] Idle 2 of 4: standing, screen flickering, battery bar blinking, slightly higher bob, facing left.
```

**idle_2**
```
[prefix] Idle 3 of 4: standing, screen flickering, battery bar blinking, slightly lower bob, facing left.
```

**idle_3**
```
[prefix] Idle 4 of 4: back to rest pose, loopable to frame 1, facing left.
```

## WALK `walk_0`…`3`

**walk_0**
```
[prefix] Walk 1 of 4: hurrying forward, cable dragging behind, contact pose, facing left.
```

**walk_1**
```
[prefix] Walk 2 of 4: hurrying forward, cable dragging behind, passing pose, facing left.
```

**walk_2**
```
[prefix] Walk 3 of 4: hurrying forward, cable dragging behind, opposite contact pose, facing left.
```

**walk_3**
```
[prefix] Walk 4 of 4: hurrying forward, cable dragging behind, opposite passing pose, loopable, facing left.
```

## ATTACK `attack_0`…`3`

**attack_0**
```
[prefix] Attack 1 of 4: wind-up before the strike, screen flashing bright and firing a burst of light, facing left.
```

**attack_1**
```
[prefix] Attack 2 of 4: screen flashing bright and firing a burst of light, mid-motion, facing left.
```

**attack_2**
```
[prefix] Attack 3 of 4: screen flashing bright and firing a burst of light, full impact, facing left.
```

**attack_3**
```
[prefix] Attack 4 of 4: recovering to ready stance, facing left.
```

## DEATH `death_0`…`3`

**death_0**
```
[prefix] Death 1 of 4: first hit, sparks of failure, starting to tip over, facing left. [death suffix]
```

**death_1**
```
[prefix] Death 2 of 4: falling apart, parts loosening, facing left. [death suffix]
```

**death_2**
```
[prefix] Death 3 of 4: screen goes black, cable legs collapse, facing left. [death suffix]
```

**death_3**
```
[prefix] Death 4 of 4: final pose, broken parts lying still, facing left. [death suffix]
```
