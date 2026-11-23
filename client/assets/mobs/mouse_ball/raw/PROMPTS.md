# mouse_ball — Мышь-Шарик

**id:** `mouse_ball`  
**Уровень:** 6–8 · pack · Восточные земли, Междуречье · стая  
**Вайб:** офис в понедельник, только с проводом-хвостом  
**Логика:** шариковая мышь, в шарик которой въелась пыль 1998 года; бегает на скрепках  
**Стиль:** реалистичный (фотореал-рендер настоящего прибора), без мультяшного контура.  
**Scale в игре:** ~1.4

### Правила
- Один **base** → 16 кадров цепочкой edit от base
- Full body, ¾ / почти профиль, лицом **ВЛЕВО**, камера на уровне глаз
- Фон **#FF00AA**, без земли, тени, текста и логотипов; без дыма и частиц (VFX добавит движок)
- Death — разваливается на свои детали, **без крови**

### Куда
`client/assets/mobs/mouse_ball/raw/` — `base` + `idle_0…3` `walk_0…3` `attack_0…3` `death_0…3` (`.jpg`/`.png`).
Готовые листы — `client/assets/mobs/mouse_ball/{idle,walk,attack,death}_sheet.png` (4 кадра по 256 px), затем блок `sheets` в `shared/mob-db.js`.

---

## BASE → `base.jpg`

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view facing left, eye-level camera. Realistic style: photoreal 3D render of a real household device turned rogue machine, true-to-life proportions and materials — scratched plastic, painted and brushed steel, rubber, glass, dust, grime, light rust, worn stickers with no writing. Believable scavenged limbs bolted on: pipes, clamps, forks, cords. Face only from its own lamps, display or indicator LEDs. No organic parts, no flesh, no fur, no animal eyes, no teeth, no magic, no runes, no glowing orbs, no cartoon outlines. A small blank paper repair tag tied to the device with twine. Soft neutral studio lighting, sharp focus, high detail. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no logos, no brand names, no people. No smoke, no steam, no particles — solid materials only. An old two-button ball computer mouse in beige plastic, the size of a cat, scuttling on its rubber ball and four bent paperclip legs, its grey cable whipping behind like a tail with a cracked plug at the end, the scroll wheel spinning, two tiny red LEDs under the buttons as eyes, grime in the seams. Small critter, one member of a pack.
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
[prefix] Idle 1 of 4: crouched, scroll wheel slowly turning, cable tail twitching, rest pose, facing left.
```

**idle_1**
```
[prefix] Idle 2 of 4: crouched, scroll wheel slowly turning, cable tail twitching, slightly higher bob, facing left.
```

**idle_2**
```
[prefix] Idle 3 of 4: crouched, scroll wheel slowly turning, cable tail twitching, slightly lower bob, facing left.
```

**idle_3**
```
[prefix] Idle 4 of 4: back to rest pose, loopable to frame 1, facing left.
```

## WALK `walk_0`…`3`

**walk_0**
```
[prefix] Walk 1 of 4: scurrying forward on paperclip legs, cable tail lashing, contact pose, facing left.
```

**walk_1**
```
[prefix] Walk 2 of 4: scurrying forward on paperclip legs, cable tail lashing, passing pose, facing left.
```

**walk_2**
```
[prefix] Walk 3 of 4: scurrying forward on paperclip legs, cable tail lashing, opposite contact pose, facing left.
```

**walk_3**
```
[prefix] Walk 4 of 4: scurrying forward on paperclip legs, cable tail lashing, opposite passing pose, loopable, facing left.
```

## ATTACK `attack_0`…`3`

**attack_0**
```
[prefix] Attack 1 of 4: wind-up before the strike, rearing up and snapping both buttons down, cable tail whipping forward, facing left.
```

**attack_1**
```
[prefix] Attack 2 of 4: rearing up and snapping both buttons down, cable tail whipping forward, mid-motion, facing left.
```

**attack_2**
```
[prefix] Attack 3 of 4: rearing up and snapping both buttons down, cable tail whipping forward, full impact, facing left.
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
[prefix] Death 3 of 4: flipped on its back, ball rolling away, buttons popped off, facing left. [death suffix]
```

**death_3**
```
[prefix] Death 4 of 4: final pose, broken parts lying still, facing left. [death suffix]
```
