# spark_sprite — Миксер-Взбиватель

**Порядок:** base → edit-chain всех 16 кадров от base.  
**Стиль:** как `loose_bolt` / `scrapper` — толстый чёрный контур, cel-shade, мобильный RPG.  
**Ориентация:** full body, side / 3⁄4, **лицом ВЛЕВО** (голова слева кадра).  
**Фон:** только плоский **#FF00AA** (яркий magenta), без земли, тени, текста, UI.  
**Палитра:** корпус cyan `#66ccff` / teal `#2288aa`, искры electric blue-white, глаза white/cyan glow.  
**Размер:** мелкий летающий (в игре scale ~1.4) — силуэт читаемый.

Сохраняй файлы в эту папку с именами ниже.

---

## BASE (`base.jpg`)

```
Game character sprite, full body, side-three-quarter view facing left.
A cute escaped kitchen mixer whisk as a tiny flying robot enemy: long metal whisk wires form the body/tail spinning slightly, small cylindrical motor head on top with angry glowing cyan-white eyes, two tiny stub arms, teal and cyan metal plates, copper rivets, blue electric sparks around the wires.
Steampunk cartoon mobile RPG style like Lineage cartoon tech, thick black outlines, cel-shaded, clean silhouette, readable at small size.
Flat solid bright magenta background #FF00AA only, no ground, no shadow, no text, isolated centered, full body in frame with padding.
```

---

## IDLE (hover bob) — `idle_0.jpg` … `idle_3.jpg`

**Общий префикс (копируй в каждый edit):**
```
Same exact character design, colors, and proportions as the reference image. Full body side view facing left. Steampunk cartoon game sprite, thick black outlines, cel-shaded. Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text.
```

**idle_0**
```
[prefix] Idle frame 1 of 4: hovering calmly mid-air, whisk wires still, soft cyan glow in eyes, one tiny spark near motor, loopable rest pose.
```

**idle_1**
```
[prefix] Idle frame 2 of 4: body bobbed slightly higher, whisk wires twist a little, brighter eye glow, two small electric sparks, light steam wisp from motor vents.
```

**idle_2**
```
[prefix] Idle frame 3 of 4: body bobbed slightly lower than frame 1, whisk coils reverse a bit, eyes narrow playfully, one spark pops near tip of wires.
```

**idle_3**
```
[prefix] Idle frame 4 of 4: back toward rest height, whisk nearly still, soft blink-ready eyes, faint cyan halo, ready to loop to frame 1.
```

---

## WALK (fly-dash left) — `walk_0.jpg` … `walk_3.jpg`

**walk_0**
```
[prefix] Walk/fly cycle frame 1 of 4: flying left, body lean left, whisk wires trail right like a tail, arms back, motion lines subtle, cyan sparks stream backward.
```

**walk_1**
```
[prefix] Walk/fly cycle frame 2 of 4: flying left mid-stroke, body higher, whisk spinning more, one arm forward, stronger backward spark trail, dynamic pose.
```

**walk_2**
```
[prefix] Walk/fly cycle frame 3 of 4: flying left, body lower, whisk wires blur-swirl, opposite arm forward, electric arc crackle near motor.
```

**walk_3**
```
[prefix] Walk/fly cycle frame 4 of 4: flying left recovery, body level, whisk stretch back, sparks fade a bit, loopable to frame 1, still facing left.
```

---

## ATTACK (ranged spark shot) — `attack_0.jpg` … `attack_3.jpg`

**attack_0**
```
[prefix] Attack frame 1 of 4: wind-up facing left, body recoils right slightly, whisk coils tight, eyes charge bright cyan-white, small spark ball forming in front of head.
```

**attack_1**
```
[prefix] Attack frame 2 of 4: peak charge, body compressed, huge bright cyan-white energy ball in front of mouth/motor, whisk tense, strong glow, anticipates shot left.
```

**attack_2**
```
[prefix] Attack frame 3 of 4: fire! releases bolt of cyan lightning/spark shot shooting left, recoil body kick right, whisk fling open, impact flash near muzzle, dynamic hit frame.
```

**attack_3**
```
[prefix] Attack frame 4 of 4: follow-through, body settle, residual sparks, whisk half-loose, eyes still bright, ready pose after shot, facing left.
```

---

## DEATH (cute comic KO, NO blood) — `death_0.jpg` … `death_3.jpg`

**Общий death-суффикс (добавляй к каждому):**
```
Cute comic cartoon death KO, no blood no gore no wounds no horror, family-friendly slapstick, thick outlines game sprite, flat solid bright magenta #FF00AA background.
```

**death_0**
```
[prefix] Death frame 1 of 4: hit reaction, X-eyes or crossed dizzy eyes, soft white puff of steam from motor, whisk limp, tiny stars, still mostly upright facing left. [death suffix]
```

**death_1**
```
[prefix] Death frame 2 of 4: dazed hover failing, spiral dizzy eyes, pastel pink and blue soft smoke puffs, whisk drooping, comic Z starting to appear, no blood. [death suffix]
```

**death_2**
```
[prefix] Death frame 3 of 4: tips sideways softly mid-air falling, big X-eyes, rainbow-ish soft steam clouds, whisk tangled silly, slapstick KO not violent. [death suffix]
```

**death_3**
```
[prefix] Death frame 4 of 4: lying on side in air/settled, closed X sleepy eyes, big soft Zzz text bubbles, quiet pastel steam, peaceful cute KO, no blood. [death suffix]
```

---

## Чеклист перед сдачей

- [ ] 1× `base.jpg` + 16 кадров с точными именами  
- [ ] Все лицом **влево**  
- [ ] Фон **#FF00AA** везде  
- [ ] Одна и та же модель миксера на всех кадрах  
- [ ] Death без крови  
- [ ] Файлы в `client/assets/mobs/spark_sprite/raw/`

Когда готово — напиши «готово» (или кинь картинки в чат). Соберу sheets + вшью в `mob-db`.
