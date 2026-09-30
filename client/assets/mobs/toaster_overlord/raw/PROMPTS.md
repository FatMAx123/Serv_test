# toaster_overlord — Тостер-Оверлорд (Easter Mini-Raid)

**id:** `toaster_overlord`  
**Референс стиля:** `tutorial_target` (красный TOAST-BOT), но это **босс** — крупнее, злее, «Premium Rage».  
**Палитра:** copper/orange `#c45c26`, dark metal `#222`, angry red-orange eyes, chrome slots, scorched toast.

**Правила:**  
- edit-chain от **одного base**  
- full body, side / 3⁄4, **лицом ВЛЕВО**  
- фон только **#FF00AA**  
- death cute/comic, **без крови**

Папка: `client/assets/mobs/toaster_overlord/raw/`  
Имена: `base.jpg`, `idle_0`…`3`, `walk_0`…`3`, `attack_0`…`3`, `death_0`…`3` (`.jpg` / `.jpeg`)

---

## BASE → `base.jpg`

```
Game character sprite, full body, side-three-quarter view facing left.
A furious boss kitchen toaster robot: large copper-orange metal toaster body with dual toast slots on top, angry glowing orange-red eyes, gritted metal mouth, chrome levers, scorched black scorch marks, tank treads or heavy rubber tracks, small mechanical arms, wisps of smoke and burnt toast crumbs, Premium Rage overlord vibe, chunky and intimidating but cartoon.
Steampunk cartoon mobile RPG style like Lineage cartoon tech, thick black outlines, cel-shaded, clean silhouette, readable at small size.
Flat solid bright magenta background #FF00AA only, no ground, no shadow, no text, isolated centered, full body with padding.
```

## Префикс edit

```
Same exact character design, colors, and proportions as the reference. Full body side view facing left. Steampunk cartoon game sprite, thick black outlines, cel-shaded. Flat solid bright magenta #FF00AA background only, no ground, no shadow, no text.
```

**Death suffix:**
```
Cute comic cartoon death KO, no blood no gore no wounds, family-friendly slapstick. Magenta #FF00AA background.
```

---

## IDLE `idle_0`…`3`

| | |
|--|--|
| **0** | rest on treads, soft smoke from slots, angry idle |
| **1** | body bob up, brighter eyes, more smoke, lever twitch |
| **2** | bob down, snort smoke from slots, mouth snarl |
| **3** | settle, thin smoke, ready → loop |

```
[prefix] Idle frame N of 4: [pose]. Facing left.
```

## WALK `walk_0`…`3`

| | |
|--|--|
| **0** | roll left on treads, lean left, smoke trail right |
| **1** | bounce high, treads blur, more smoke |
| **2** | bounce low, toast crumbs comic, facing left |
| **3** | recovery → loop |

## ATTACK `attack_0`…`3`  
(простая цепочка: **ref = base/idle_0**, потом соседний кадр)

| | |
|--|--|
| **0** | wind-up: body lean back, slots glow, smoke builds |
| **1** | charge: eyes max glow, hot glow in slots |
| **2** | **HIT:** shoot burning toast / steam jet LEFT, recoil, small impact stars |
| **3** | follow-through, residual smoke, ready |

**Коротко если плывёт:**
```
attack_0: Same character. Lean back, slots glow. Magenta #FF00AA.
attack_1: Same character. Brighter eyes, more heat in slots. Magenta #FF00AA.
attack_2: Same character. Shoot hot toast and steam left, small stars. Magenta #FF00AA.
attack_3: Same character. After shot, soft smoke. Magenta #FF00AA.
```

## DEATH `death_0`…`3` (+ death suffix)

| | |
|--|--|
| **0** | X-eyes, soft smoke puff, toast flops out |
| **1** | dizzy spirals, pastel smoke, wobbly |
| **2** | tips sideways slapstick, toast on ground |
| **3** | on side, **Zzz**, quiet steam, cute KO |

---

Когда 16+base в `raw/` — пиши **«готово»**. Соберу sheets + `mob-db` (scale ~3.4, named boss).
