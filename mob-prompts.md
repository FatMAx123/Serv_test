# Бестиарий — промты мобов и РБ · Остров поющей стали

Один блок = один моб. Копируй блок целиком в генератор.
Источник ростера: `shared/mob-db.js` (74 шаблона). Лор: `shared/world-lore.js`.
Промты новые, со старыми спрайтами не связаны.

---

## Канон бестиария (почему всё логично и без магии)

Остров живёт на паре, медных проводах и аккумуляторах. «Зелёный сбой» — не стихия и не проклятие,
а **испорченный защитный протокол** химзавода: он расползается по проводам, радиосетке и прошивкам
и переписывает управление любой техники, до которой дотянется. Так тостеры, косилки и котлы
получили «волю». Отсюда правила, которым подчиняется каждый промт:

1. **Узнаётся с первого взгляда.** Силуэт — реальный прибор или механизм. Сначала «это кофемашина», потом «это монстр».
2. **Есть чем двигаться.** Колёса, гусеницы, ролики или ноги, прикрученные со свалки: трубы, струбцины, вилки, рычаги, инструмент. Мобы сами чинят и достраивают себя ломом — отсюда «конечности».
3. **Есть чем питаться.** На виду: аккумулятор, бензобак, мини-котёл, или волочащийся вырванный шнур с вилкой.
4. **Лицо — только своё.** Лампочки-индикаторы, дисплей, манометр, фара, глазок дверцы. Никаких органических глаз, плоти, меха, клыков.
5. **Атака = функция прибора, доведённая до абсурда.** Нагрев, лезвия, давление, всасывание, звук, ток.
6. **Свет — только физический:** светодиоды, экраны, раскалённые спирали, искры, фосфоресцирующая химия.
7. **Цвет индикаторов = статус.** Красные/янтарные — обычный сбой (запад, юг, поля). **Зелёные — заражён Зелёным протоколом** (Руины химзавода, Котловые земли, Бункер).
8. **Зона видна на корпусе.** Старт — почти новые бытовые вещи. Свалка — латки, изолента. Сады — плющ. Заводь — морская ржавчина, ракушки. Поле забвения — трава сквозь шестерни, военная маркировка. Химруины — зелёные кислотные потёки. Котловые земли — перегрев, побежалость металла. Бараки/Крепость — бронеплиты, трафаретные полосы. Данжи — промышленный масштаб, клеймо Круны (зубчатый венец).
9. **Песнь Стали.** У рейд-боссов есть паровые свистки — они «поют». Это их подпись.

Пар, дым и искры в референс **не рисуем** (чистая вырезка для спрайта/3D) — их добавляет движок как VFX.

---

## Замок стиля (уже вшит в каждый блок)

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only.
```

Масштаб в конце промта: **small critter** (треш 1–5) · **medium** (треш) · **large elite** (элита/именные) · **huge boss** (полевые РБ) · **colossal raid boss** (рейды и данж-боссы).

---

# I. Дворы школ · ур. 1–6 (Территория Операторов, Школа Инженеров)

### `loose_bolt` — Сбежавший Болт · 1–3 · пассивный
**Вайб:** мелкий наглец с мечтами. **Логика:** болт сам не ходит — в него вкрутился заводной механизм от игрушки.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A giant zinc-plated hex bolt standing upright, its nut half-unscrewed and tilted like a cocky cap, a brass wind-up toy key sticking out of its back, four springy coiled-wire legs with washer feet, two tiny amber indicator lamps on the bolt head as eyes, mid-strut with chest puffed out. Small critter.
```

### `scrapper` — Скраппер · 1–5 · пассивный
**Вайб:** «уборка» сменилась на «GRIND OR DIE». **Логика:** пылесос-канистра, в который заползли дрели и УШМ со склада.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A dented canister vacuum cleaner crawling like a crab: four cordless drills screwed into its sides as legs, two angle grinders on flexible hoses as raised arms, the vacuum hose coiled on top like a scorpion tail, a cracked small LCD on the front showing two angry red pixel eyes, a scavenged battery pack strapped on with tape, dust bin full of bolts and chips. Small critter.
```

### `tutorial_target` — Тостер-Терминатор · 1–4 · пассивный
**Вайб:** сорок лет тостов в бытовке — и хватит. **Логика:** ноги из столовых вилок той же бытовки, вилка шнура — хвост.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. An old chipped chrome two-slot break-room toaster walking on four bent dinner forks, two burnt toast slices half-ejected from the slots like loaded ammo, orange-hot heating wires visible deep in the slots, the side lever bent into a fist shape, a frayed power cord with plug swinging like a tail, a single red power lamp glaring as an eye, crumbs stuck everywhere. Small critter.
```

### `rust_mite` — Ржавый Клещ · 2–5 · пассивный
**Вайб:** был антикоррозийным датчиком, стал агентом коррозии. **Логика:** изначально ползающий датчик для котлов.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A flat round boiler inspection sensor pod shaped like a tick, six thin jointed probe legs with needle tips, a cluster of amber sensor LEDs at the front, flaking orange rust paint over dark iron, a little oil can bolted to its back dripping a thick dark oil drop, low creeping pose. Small critter.
```

### `spark_sprite` — Миксер-Взбиватель · 3–5 · пассивный
**Вайб:** 5000 об/мин и желание взбить вас в крем. **Логика:** венчики крутит моторный блок миксера, искрят щётки мотора.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A cream-white retro hand mixer motor unit balancing upside down on its two stainless steel balloon whisks used as bouncy legs, speed dial on the side turned to max as a single eye, cooling vents glowing faint orange, power cord flailing like an antenna, dried cream splatters on the housing, hyperactive hopping pose. Small critter.
```

### `toaster_overlord` — Тостер-Оверлорд · 4–6 · пасхальный мини-рейд
**Вайб:** умный тостер с подпиской Premium Rage. **Логика:** «умный» — значит с экраном и антенной, первым поймал прошивку сбоя.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A luxury four-slot smart toaster in polished chrome with gold trim, a wide touchscreen on the front showing a smug furious pixel face, a tall Wi-Fi antenna like a scepter, standing on four elegant articulated brass legs, holding two charred toast slices like shields, glowing red heating slots, regal tyrant posture, premium and overdesigned. Large elite.
```

---

# II. Холмы Астарда · Междуречье · Свалка · Западные земли · ур. 5–16

### `steam_hound` — Кофемашина-Бешеная · 5–10 · стая
**Вайб:** обваривает эспрессо за латте на соевом. Стайная гончая. **Логика:** колёсики от сервировочной тележки, бойлер внутри.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A compact copper-and-steel lever espresso machine prowling low like a hunting hound on four caster wheels with spring suspension, the steam wand jutting forward like a snout, a heavy portafilter swinging from a chain like a club, two small pressure gauges as eyes with needles in the red, a cup tray as a spiked collar, coffee stains, lean and fast pack-hunter stance. Medium.
```

### `meadow_mower` — Бешеная Газонокосилка · 6–10 · агрессивный
**Вайб:** подравнивает прохожих под идеальный газон. **Логика:** бензиновый мотор, кожух сорван.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A red gasoline push lawn mower with its deck cover torn off, the spinning blade exposed underneath, rearing up on its back wheels like a charging beast, the push handle bent up and over like a scorpion tail, a single round headlight as an eye, pull-start cord whipping, fuel tank cap dented, grass stains and clumps of cut grass stuck to the wheels. Medium.
```

### `boiler_exploder_b1` — Бойлер-Взрывник Б-1 · 6–7 · полевой РБ
**Вайб:** первый настоящий босс — водонагреватель, который поёт свистком перед взрывом. **Логика:** ноги из водопроводных труб, свисток — предохранительный клапан.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A three-meter cylindrical enamel water heater tank walking on four thick galvanized plumbing-pipe legs with elbow joints, a brass safety-valve steam whistle on top like a screaming head, a big round temperature dial on the front as a single eye with the needle pinned in red, flexible braided hot-water hoses as arms ending in valve taps, bulging dents from overpressure, warning stripe decals, heavy wide stance. Huge boss.
```

### `tralalero_toasterino` — Tralalero Toasterino · 6–8 · секретный
**Вайб:** тостер-акула в кроссовках. «Tralalero tralala…» **Логика:** плавник — согнутая решётка для булок, кроссовки стащил из раздевалки Школы.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A long sleek blue-grey chrome toaster shaped like a shark, a bun-warming rack bent upright into a dorsal fin, toast slots along its sides like gills, the crumb tray open at the front like a jaw lined with serrated bread-knife blades, two LED lamps as eyes, standing on three spring legs wearing oversized bright running sneakers, goofy confident dance-strut. Large elite.
```

### `rivulet_pump` — Пылесос-Харкач · 7–9 · агрессивный
**Вайб:** включил реверс и плюётся десятилетним мусором. **Логика:** циклон-пылесос, речной ил забил колба.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. An old upright bagless cyclone vacuum cleaner with a transparent dust bin crammed with river mud, pebbles, bottle caps and fishing line, the long hose reared up like a cobra neck with the nozzle aimed forward, a glowing red reverse switch on its chest as an eye, rubber wheels caked in silt, a frayed cord tail, aggressive leaning pose. Medium.
```

### `survey_beacon` — Электрогриль-Прижиматель · 7–11 · агрессивный
**Вайб:** мечтает поставить румяные полоски на вашу броню. **Логика:** контактный гриль, верхняя плита = челюсть.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A black-and-steel clamshell contact grill walking on four short rubber-footed legs, its hinged top plate gaping open like a jaw showing glowing orange-hot ribbed grill plates inside, the handle sticking out like a lower lip, two indicator lights (red and green) above the hinge as eyes, grease drip tray hanging loose, scorched char marks. Medium.
```

### `bridge_toll_bot` — Вентилятор-Шинковщик · 8–9 · агрессивный
**Вайб:** сборщик пошлины на мосту; на третьей скорости — винегрет. **Логика:** напольный вентилятор без решётки, к стойке привязана жестянка для монет.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall retro pedestal fan with its safety cage missing, three sharpened steel blades gleaming, the motor head tilted forward menacingly like a face with the hub as a nose, three speed buttons on the base glowing with button three lit red, base split into a three-legged tripod walker, a dented tin toll can tied to the pole with wire full of coins, river rust on the base. Medium.
```

### `coffee_berserker` — Кофемашина-Берсерк · 8–10 · пасхальный мини-рейд
**Вайб:** 14 бар давления и 0 морали. Латте-арт на вашей броне. **Логика:** профессиональная двухгруппная машина из закрытой кофейни.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A massive commercial two-group espresso machine standing on thick hydraulic legs like a barbarian, two heavy portafilters mounted as brass-knuckle fists, two steam wands curving up like horns, twin pressure gauges with needles past red as furious eyes, the cup-warming rack worn as spiked shoulder armor, coffee-bean hopper on its back, espresso stains streaked like war paint. Large elite.
```

### `scrap_picker` — Кухонный Блендероид · 8–10 · агрессивный
**Вайб:** перемалывает лёд, арматуру и доспехи с одинаковым аппетитом. **Логика:** комбайн-измельчитель, руки-грейферы со свалки, латки изолентой (авторемонт).

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A countertop food processor with a cracked transparent jug as its head, ice-crushing star blade visible inside with chunks of rebar and gears, the motor base as a chunky torso, two scavenged claw-grabber arms bolted on, legs made of scrap pipe, patches of silver duct tape over cracks, a row of glowing speed buttons as a mouth panel. Medium.
```

### `welding_automaton` — Микроволновка-Поджарка · 8–15 · агрессивный (филлер)
**Вайб:** дверца выбита, магнетрон на максимуме. **Логика:** открытый магнетрон раскалён, тарелка вращается.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A battered white microwave oven waddling on stubby angle-iron legs, its door ripped half off and hanging from one hinge like a broken jaw, the glass turntable spinning inside, the exposed magnetron horn glowing orange-hot on the side, digital timer display showing two angry segment-style eyes, keypad buttons cracked, scorched interior. Medium.
```

### `junk_magpie` — Фен-Испепелитель · 8–10 · агрессивный
**Вайб:** сорока Свалки — летает и ворует блестяшки. **Логика:** фен толкает воздух вперёд, поэтому летит соплом назад, решёткой забора вперёд.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A glossy black pistol-grip hair dryer flying nozzle-backward, the round intake grille facing forward as its face with two LED lamps behind it, the nozzle at the back glowing red from the nichrome coil, two diffuser attachments clipped on as stubby wings, the handle bent down like a hooked tail carrying stolen shiny trinkets: keys, coins, a brass gear, curled cord trailing. Medium.
```

### `skibidi_steamino` — Skibidi Steamino · 8–10 · секретный
**Вайб:** паровой унитаз-танцор с тихого берега Междуречья. **Логика:** паровая канализационная насосная станция, перископ-камера смотрит из бачка.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A white porcelain toilet retrofitted with brass steam pipes and pressure valves, the lid flapping open like a mouth, a brass periscope with a round camera lens rising from the cistern as a head, a plunger arm and a toilet-brush arm raised in a dance move, standing on four chrome pipe legs mid-groove, chain flush handle dangling. Large elite.
```

### `grinder_ripper_m9` — Мясорубка-Потрошитель М-9 · 9–10 · полевой РБ
**Вайб:** чугунная четырёхтактная мясорубка. **Логика:** ручку заменил бензиновый мотор, шнек виден в горле.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A giant cast-iron meat grinder walking on four heavy clamp-screw legs, its hand crank replaced by a roaring four-stroke engine with cooling fins and exhaust pipe on its back, the feed hopper wide open on top like a gaping maw, the spiral auger visible inside, the front cutting plate and spinning cross-blade as its face with two engine warning lamps above, one huge vise-clamp arm, chipped black paint over iron. Huge boss.
```

### `hill_presser` — Стиралка-Убийца · 9–12 · агрессивный
**Вайб:** отжим 1400 с кирпичом внутри, скачет и бьёт боком. **Логика:** дисбаланс барабана = прыжки.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A white front-loading washing machine mid-jump, tilted on one corner, the round porthole door as one giant eye with a brick and tangled socks visible tumbling inside, control panel dial turned to max spin, drain and inlet hoses flailing like arms, adjustable feet extended into springy legs, dented sides from slamming into things. Medium.
```

### `welding_drone` — Бумбокс-Оглушитель · 10–16 · агрессивный
**Вайб:** басы ломают зубы, диски летят сюрикенами. Их же призывают боссы. **Логика:** летает на четырёх пропеллерах, прикрученных к ручке.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A chunky retro double-cassette boombox hovering on four small propellers bolted to its carry handle, two big speaker cones bulging outward as eyes, an equalizer LED bar glowing as a grinning mouth, the CD tray open and loaded with a spinning compact disc like a blade launcher, telescopic antenna bent, cassette doors flapping. Medium.
```

### `rust_sentry` — Холодильник-Выбиватель · 10–13 · агрессивный
**Вайб:** ржавый часовой Западных земель на гусеницах. **Логика:** фреон — морозный выхлоп, дверца — щит и дубина.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A rusty two-door refrigerator riding on small tank tracks, the lower door swung open and held forward like a shield, the upper freezer door cracked with frost crystals on the seal, a temperature display glowing blue as a visor-like eye, fridge magnets stuck on like medals, frost-coated vent grille, weathered sentry stance. Medium.
```

### `bombardiro_blendodilo` — Bombardiro Blendodilo · 10–12 · секретный
**Вайб:** блендер-крокодил с реактивными соплами. Смузи из брони. **Логика:** сопла — промышленные фены, «пасть» — длинный кувшин с ножами.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A long olive-green crocodile-shaped contraption built from three kitchen blenders joined end to end, the front blender jug stretched into a long snout with blade stacks inside, motor bases as a segmented body, two industrial heat guns strapped on as jet engines, stubby wings made from cutting boards, four short wheel-legs, a pair of round indicator lamps on top as eyes, bomber-plane swagger. Large elite.
```

### `vine_cable` — Кипятящий Электрочайник · 11–12 · агрессивный
**Вайб:** воды нет со вчера, а ТЭН всё лупит. **Логика:** сады — оплетён плющом, тянет за собой подставку как хвост.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A brushed steel electric kettle with its base plate glowing dull red-hot underneath, walking on three bent copper-wire legs, the spout pointing forward like a snout, the window strip showing a dry scorched interior, the blue LED ring turned angry red as a glowing eye, its power base dragging behind on the cord like a tail, overgrown with green ivy vines and small leaves. Medium.
```

### `garden_sprinkler` — Паровой Утюг-Штамп · 11–12 · агрессивный
**Вайб:** оставляет аккуратные глаженые отпечатки на грудине. **Логика:** утюг на шарнирной лапе от настольной лампы.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A turquoise steam iron mounted on a spring-loaded articulated desk-lamp arm that forms a single jointed leg and heavy base, rearing up to stamp, the soleplate glowing orange-hot with rows of steam holes, the transparent water tank half full, a temperature dial as an eye, coiled cord, garden moss and ivy on the lamp base. Medium.
```

### `apiary_drone_bee` — Шуруповерт-Жужжало · 11–12 · стая
**Вайб:** тронь одну — прилетят соседки. **Логика:** жёлто-чёрная дрель = пчелиная раскраска, аккумулятор = брюшко, бита = жало.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A yellow-and-black cordless drill flying like a bee, the slide-on battery pack hanging below as a striped abdomen, two small propeller blades on top as wings, a long screwdriver bit in the chuck pointing forward as a stinger, the LED work light glowing as a single eye, beeswax and honey smears on the casing. Small critter.
```

### `wifi_router_404` — Wi-Fi Роутер 404 · 11–13 · пасхальный мини-рейд
**Вайб:** пароль password, пинг — страдание. «Перезагрузите себя». **Логика:** раздаёт сбой по воздуху — потому именной.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A big black home Wi-Fi router with eight long antennas fanned out like a spiky punk crown, a row of status LEDs across the front blinking as a jagged angry face, tangled ethernet cables hanging down as legs it walks on, a dusty reset pinhole, a cracked case held with a zip tie, ivy creeping on one side, smug glitchy posture. Large elite.
```

---

# III. Дворы Круны · Тихая заводь · ур. 12–16

### `yard_cranelet` — Бешеный Электросамокат · 12–13 · агрессивный
**Вайб:** сбежавший шеринговый самокат, пищит и таранит на 35 км/ч. **Логика:** свой аккумулятор, фара — глаз.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A bright lime-and-black rental electric scooter popping a wheelie, the handlebar bent down like horns, the round headlight glaring as one eye, the handlebar display flashing a red alarm symbol, a blank QR plate on the stem, kickstand flipped up like a stinger, scuffed deck with forge soot, aggressive charging pose. Medium.
```

### `steam_crane_spider` — Перфоратор-Шагоход · 12–19 · агрессивный (филлер)
**Вайб:** SDS-Max на четырёх ногах, бур в бетон и в ноги. **Логика:** ноги — монтажные струбцины.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A heavy red SDS-Max rotary hammer drill as the body of a four-legged spider walker, legs made of steel construction clamps and scaffold tubes, a long chisel-tip drill bit thrust forward like a mandible, side handle sticking out like an arm, a small LED on the trigger glowing as an eye, concrete dust caked on the housing, coiled cable on its back. Medium.
```

### `repair_drone` — Робот-Пылесос-Убийца · 12–18 · элита
**Вайб:** заезжает под ноги и бьёт током с зарядных клемм. **Логика:** лидар-башенка = глаз, боковые щётки заточены.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A round charcoal robot vacuum cleaner tilted up on one side mid-attack, its side brushes replaced with sharpened sawblade stars, a lidar turret on top glowing red as a single scanning eye, the front bumper cracked and reinforced with a welded steel plate, exposed copper charging contacts glowing, a mop pad dragging, small but menacing. Large elite.
```

### `rustclaw_overseer` — Смотритель Ржавый Коготь · 12–14 · именной
**Вайб:** ведёт учёт ржавчины; ваш труп — строка «списано». **Логика:** верфевой грейферный погрузчик, кассовый принтер печатает акты списания.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A rusted shipyard log-loader on a short caterpillar base, one enormous four-tine grapple claw arm raised high, an operator cab with a cracked windshield showing two amber warning lamps as eyes, a receipt printer bolted to the side spitting a long curling blank paper strip, a rubber stamp on a second small arm, barnacles and sea rust on the tracks. Large elite.
```

### `vacuum_cyclone_3000` — Супер-Пылесос Циклон-3000 · 12–13 · полевой РБ
**Вайб:** затягивает в воронку и стреляет прессованными кубами мусора. **Логика:** промышленный пылесборник-силос с прессом.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A towering industrial cyclone dust collector shaped like a conical silo on six heavy caster wheels, a giant corrugated suction hose as a long trunk with a wide intake mouth, a transparent cyclone chamber in the chest swirling with scrap and gears, a trash compactor hatch on its back loaded with pressed cube bales, two round pressure gauges as eyes, hazard stripes, yellow industrial paint scarred by scrap. Huge boss.
```

### `forge_apprentice` — Электроплита-Шкварка · 12–13 · агрессивный
**Вайб:** подмастерье горна: конфорки докрасна, брызги масла. **Логика:** сковорода с маслом — щит и оружие.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A two-burner cast-iron electric hot plate standing on four tong-shaped legs, both burner coils glowing cherry red on top like eyes, two control knobs turned to max as cheeks, one arm holding a black frying pan full of glossy hot oil like a shield, a blacksmith leather apron scrap tied around it, forge soot. Medium.
```

### `dry_dock_welder` — Термофен-Плавитель · 13–15 · агрессивный
**Вайб:** плавит кабели и снаряжение как раскалённый нож. **Логика:** строительный фен, ноги — сварочные струбцины верфи.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. An orange industrial heat gun body mounted horizontally on three welding C-clamp legs, the metal nozzle glowing white-orange at the tip like a beak, a small temperature LCD on top showing two narrow eyes, melted plastic drips hardened on its legs, shipyard rust and salt crust, a reflector nozzle attachment hanging from a chain. Medium.
```

### `printer_of_doom` — Принтер Судьбы · 13–15 · пасхальный мини-рейд
**Вайб:** «Paper Jam». Тонер на нуле. Картридж — ваша душа. **Логика:** офисное МФУ, лоток с листами = язык, сканер = челюсть.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A bulky beige office multifunction laser printer stomping on four filing-cabinet drawer legs, the scanner lid raised like an upper jaw, a crumpled jammed sheet of blank paper sticking out like a tongue, the output tray spewing a fan of blank pages, a blinking orange error light and a small screen showing angry eyes, side panel open revealing a toner cartridge, ink smudges. Large elite.
```

### `tung_tung_vacuumer` — Tung Tung Vacuum Sahur · 13–15 · секретный
**Вайб:** «Tung tung tung sahur». Пылесос с деревянной битой. **Логика:** ретро-пылесос в деревянных панелях, бита — найденная на верфи.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall retro upright vacuum cleaner with warm wood-grain panels and a cylindrical body, the headlamp on its front as one wide round eye, the hose looped into an arm gripping a wooden baseball bat raised high, the beater-bar head as stomping feet, a cloth dust bag puffed out at the back, comically stiff marching pose. Large elite.
```

### `chainsaw_lumberjack_x14` — Бензопила-Дровосек Х-14 · 14–15 · полевой РБ
**Вайб:** срезает всё живое по радиусу. Ужас Садов и Пасеки. **Логика:** лесозаготовительная харвестерная голова на шагающем шасси.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A huge orange forestry harvester walking on four hydraulic legs, two giant circular saw discs mounted on its arms, a chainsaw bar sticking forward from its head unit, a red-and-black plaid painted engine cover like a lumberjack shirt, twin work floodlights as eyes, fuel tank and exhaust stacks on its back, wood chips and broken branches stuck in the joints. Huge boss.
```

---

# IV. Поле забвения · Восточный полигон · ур. 13–17

### `oblivion_walker` — Моющий Экстрактор · 13–16 · социальный
**Вайб:** заливает поле ядовитой пеной; ходит пачками. **Логика:** армейский ковровый экстрактор, трава проросла сквозь колёса.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. An industrial carpet-extractor machine walking hunched on two jointed pipe legs, two transparent tanks on its back, one with clean blue solution and one with murky grey wash water, a spray wand held like a rifle, solid globs of stiff foam stuck on its body, faded olive military paint with stencil stripes, tall field grass growing through its wheels and gears, a cracked amber lamp as an eye. Medium.
```

### `memory_scrubber` — Ламповый Телевизор · 14–17 · агрессивный
**Вайб:** выгоревший кинескоп, слепящие вспышки и высоковольтные помехи. **Логика:** ноги — от телевизионной тумбы.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. An old wood-cased CRT television walking on four tapered wooden TV-stand legs, the curved screen glowing with grey static scanlines forming two angry eyes, rabbit-ear antennas twitching like feelers, channel knobs on the side, the back cover missing showing a glowing vacuum tube and copper coils, field grass tangled in its legs. Medium.
```

### `sparkweld_elite` — Элита Искросварка · 14–16 · именной
**Вайб:** сертификат ISO на убийственно качественную искру. **Логика:** сварочный инвертор, маска сварщика — забрало.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A blue arc-welding inverter machine as a torso, a black auto-darkening welding helmet mounted on top as a head with its visor glowing faint green, two electrode-holder arms with glowing tips, the ground clamp as a pincer hand, thick welding cables coiled around its body, walking on two gas-cylinder legs, a blank gold quality-seal sticker on its chest, proud duelist stance. Large elite.
```

### `field_howitzer` — Мотопомпа-Водомет · 15–17 · партийная элита
**Вайб:** полевая артиллерия: струя 10 атмосфер сбивает с ног. **Логика:** бензопомпа на лафете, пожарный рукав — ствол.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A gasoline water pump mounted on a two-wheeled artillery carriage like a howitzer, a stiff canvas fire hose with a brass nozzle as the long cannon barrel, a big pressure gauge as an eye, the pump engine with a pull-start on its back, a fuel can strapped to the side, olive drab paint with military stripes, field grass growing through the wheel spokes, trail legs splayed. Large elite.
```

### `range_spotter` — Сабвуфер-Контузитель · 15–16 · агрессивный
**Вайб:** 1000 ватт басов, вибрируют стены и перепонки. **Логика:** автомобильный сабвуфер в коробе, усилитель на спине.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A black carpeted car subwoofer box standing on four car-jack legs, one giant speaker cone bulging out as a huge eye with a red LED ring around it, a chrome amplifier with heat fins bolted on its back, thick red and black power cables to a car battery dragged on a strap, a range-target bullseye painted on its side, spotter binocular lens mounted on top. Medium.
```

### `rogue_target` — Снегоуборщик-Захватчик · 15–17 · агрессивный
**Вайб:** «мишени иногда стреляют в ответ». Шнек хватает, раструб стреляет. **Логика:** снегоуборщик расписан кругами мишени.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A two-stage gasoline snow blower on rubber tracks, the wide auger housing at the front with a spinning serrated spiral like a grinding jaw, the discharge chute raised and aimed like a cannon, twin headlights as eyes, handlebars bent back like horns, painted with red and white shooting-target rings full of bullet dents. Medium.
```

---

# V. Руины химзавода · Котловые земли · ур. 16–20 (Зелёный протокол — индикаторы зелёные)

### `green_fault_drone` — Вентилятор-Квадрокоптер · 16–18 · партийный, социальный
**Вайб:** рой из ПК-кулеров с заточенными лопастями. **Логика:** рама — материнская плата, зелёные диоды = заражение протоколом.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A quadcopter drone built from a bare green circuit-board frame with four square computer case fans as rotors, the fan blades sharpened to razor edges, a cluster of toxic-green LEDs in the center as a compound eye, ribbon cables dangling like legs, a small capacitor bank crackling, green acid stains corroding the copper traces. Medium.
```

### `acid_sprayer` — Выжигатель-Жгучка · 16–17 · агрессивный
**Вайб:** выжигает узоры прямо на латах. **Логика:** станция пирографа, длинная ручка с раскалённой петлёй; облит кислотой из цехов.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A boxy wood-burning pyrography control station walking on four soldering-stand legs, two long pen-arms on coiled cords each tipped with a glowing orange-hot wire loop, a temperature dial and a green LED as eyes, a cracked chemical bottle strapped to its back leaking glowing green fluid, green acid stains etched into its metal casing. Medium.
```

### `fridge_frost_sever` — Холодильник-Морозильник «Север» · 16–17 · полевой РБ
**Вайб:** морозит фреоном и окатывает кипятком. **Логика:** спереди — морозилка, сзади — раскалённый конденсатор; талая вода кипит на компрессоре.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A giant retro white two-chamber refrigerator walking on thick hydraulic legs, the front half covered in thick frost and icicles with the freezer door open like a cold maw, the back half exposed with a red-hot condenser coil grille and a glowing compressor, a defrost water tray on its shoulder bubbling hot, freon pipes as arms ending in nozzles, a chrome handle as a scowl, a temperature display with green digits as eyes, green chemical stains on its base. Huge boss.
```

### `ballerina_cappuccino` — Ballerina Cappuccino · 16–18 · секретный
**Вайб:** кофемашина на пуантах, латте-арт смазочным маслом. **Логика:** стоит на одной паровой трубке, пачка — из бумажных фильтров.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A dainty cream-colored capsule coffee machine balancing en pointe on a single chrome milk-frother wand, a tutu made of pleated paper coffee filters around its middle, a cappuccino cup balanced on its head like a tiara, two capsule holders raised as graceful arms, two small green indicator lights as eyes, elegant pirouette pose. Large elite.
```

### `bluetooth_oracle` — Bluetooth-Оракул · 16–18 · пасхальный мини-рейд
**Вайб:** «Connected to: nothing». Бас прокачал ваши кости. **Логика:** колонка-«умный ассистент» на трёх микрофонных стойках, кольцо — дисплей.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall cylindrical fabric-mesh smart speaker standing on three telescopic microphone-stand legs, a glowing green light ring on top like a halo-shaped display, a dotted LED pattern on its mesh forming a calm all-knowing face, three small paired portable speakers orbiting on thin articulated arms like acolytes, a dangling charging cable, chemical stains at its feet. Large elite.
```

### `spill_containment` — Авто-Компрессор-Взрывник · 17 · партийная элита
**Вайб:** качает давление до предела и стравливает оглушительным хлопком. **Логика:** поршневой компрессор с ресивером.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A red piston air compressor with a bulging over-inflated horizontal air tank as its belly, mounted on two wheels and a stubby leg, the piston head with cooling fins pumping on top, a coiled yellow air hose whipping like a tail with a tire-inflator chuck, a big pressure gauge needle pinned past max as its eye, a hazmat drum lid bolted on as a shield, green chemical splashes. Large elite.
```

### `green_steam_wraith` — Аромадиффузор-Ядовик · 18–20 · партийный
**Вайб:** «призрак» Котловых земель — ароматизатор с ядовитым концентратом. **Логика:** ездит на подставке-роликах; светится только зелёный диод и химия.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall teardrop-shaped ultrasonic aroma diffuser with fake wood-grain plastic, cracked open at the top, its water reservoir filled with glowing toxic-green liquid, a green LED band as a sinister eye slit, mounted on a rolling five-caster office chair base, laboratory tubes and dropper bottles strapped around it, eerie hovering-like lean. Medium.
```

### `boiler_elemental` — Паровой Увлажнитель-Паритель · 18–20 · партийный
**Вайб:** увлажнитель, перегретый до крутого кипятка. **Логика:** вода кипит внутри треснувшего бака.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A large white ultrasonic humidifier with a clear cracked water tank full of violently bubbling water, its plastic warped and yellowed from heat, the mist nozzle twisted upward like a head with a green humidity display as eyes, standing on three heat-scorched aluminum legs, heat-tinted blue and gold discoloration on its metal parts. Medium.
```

### `pressure_fiend` — Мультиварка-Скороварка-Бомба · 19–20 · партийный
**Вайб:** аварийный клапан заклинило, давление растёт. **Логика:** крышка вздута, дисплей отсчитывает.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A stainless steel electric pressure cooker with its lid bulging dangerously upward, the locked pressure valve jammed and bent, the front display glowing green with frantic eyes, steel strap bands bolted around it to hold it together, walking on four short spring legs, power cord trailing, heat-tinted rainbow discoloration on the steel, about to burst. Medium.
```

### `boiler_overpress` — Пароочиститель-Струйник · 19–20 · элита
**Вайб:** профессиональный клининговый парогенератор с длинным соплом. **Логика:** цилиндр-бойлер на колёсах, копьё-сопло.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A professional cylindrical steam-cleaner boiler on wheels standing upright like a knight, a long narrow steel lance nozzle held forward like a spear, a coiled steam hose wrapped around its body, a twin pressure-gauge face with green-lit needles, brass safety valves on its shoulders, heat-blued metal and green corrosion. Large elite.
```

---

# VI. Бараки Рездика · Крепость стального предела · ур. 17–19 (бронеплиты, трафарет)

### `fort_enforcer` — Соковыжималка-Давилка · 17–19 · элита
**Вайб:** давит всё, что попало в горлышко. **Логика:** шнековая соковыжималка в крепостной броне.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall vertical slow-masticating juicer bolted into heavy riveted fortress armor plates, the wide feeding chute on top as a gaping mouth, the spiral auger visible through the clear chamber grinding scrap, the pulp outlet as a fist-like ram arm, two red indicator lamps under a steel brow, walking on thick stubby armored legs, grey-and-yellow fortress stripes. Large elite.
```

### `fort_turret` — Тепловая Пушка-Печь · 17–18 · партийный
**Вайб:** дует раскалённым воздухом со скоростью степного урагана. **Логика:** дизельная тепловая пушка на станке-треноге.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A yellow diesel heater cannon mounted on a rotating tripod turret base with a riveted armor shield, the front grille glowing orange-hot inside like a muzzle, a fuel tank underneath, an aiming scope lamp glowing red as an eye, sandbag-colored fortress paint with hazard stripes. Medium.
```

### `limit_guard` — Тостер-Бронещит · 17–18 · партийный
**Вайб:** закрывает проход и стреляет раскалённым хлебом. **Логика:** четырёхслотовый тостер в стальном корпусе, щит — дверца печи.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A four-slot family toaster encased in thick riveted steel armor like a fortress guard, four glowing slots on top loaded with charred toast like ammunition, holding a heavy oven door as a tower shield, a browning-level dial as a single eye under a steel helmet rim, standing on armored piston legs, grey fortress paint with yellow stencil stripes. Medium.
```

### `drill_sergeant` — Цепная Бензопила-Резчик · 17–18 · элита
**Вайб:** сержант Бараков: ревёт мотором и строит пачку. **Логика:** двухтактная пила, свисток на шнуре стартера.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A big two-stroke chainsaw standing upright on two jointed steel legs like a drill sergeant, the long guide bar with hardened chain as a raised arm-blade, olive military paint with sergeant chevron stencils, a brass whistle hanging on the pull-start cord, a single round engine warning lamp glaring red, an ammo-belt of spare chain links slung across its body, barking command pose. Large elite.
```

### `rezdiq_private` — Штроборез-Глуборез · 17–18 · социальный
**Вайб:** рядовой Бараков, ходит строем. **Логика:** двухдисковый алмазный штроборез с армейской маркировкой.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A twin-disc diamond wall chaser tool standing at attention on two thin steel legs, two parallel diamond cutting discs at the front like a double blade weapon, a dust-extraction port as a snout, a small green-lit power indicator as an eye under a riveted helmet plate, olive military paint with a private's single stripe stencil, concrete dust. Medium.
```

### `steam_roller_bogatyr` — Паровой Каток-Утюг «Богатырь» · 18–19 · полевой РБ
**Вайб:** асфальтовый каток с раскалённой подошвой утюга-трамбовщика. **Логика:** паровой каток, вместо вальца — гигантская подошва утюга.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A massive antique steam road roller in dark green and brass, its front roller replaced by a gigantic triangular clothes-iron soleplate glowing white-hot at the edges, a tall smokestack with a brass steam whistle, two heavy pistons as shoulders, a round firebox door glowing orange as a mouth, two headlamps as stern eyes, armor plates with barracks stripes, broad heroic stance. Huge boss.
```

---

# VII. Полевые и рейд-боссы мира · ур. 20–23

### `drill_worm` — Босс-Бур · 20 · ивент-рейд (Прорыв паровой трубы)
**Вайб:** прорыв трубы = его выход на бис. **Логика:** тоннелепроходческий щит, сегменты корпуса как у червя.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A colossal tunnel boring machine rearing upward like a giant worm, a huge rotating cutterhead with steel disc cutters as its face, a ring of amber work lamps around the cutterhead as eyes, a long body of segmented cylindrical sections joined by hydraulic thrust rams, conveyor belt spine, burst steam pipes wrapped around it, rock chunks wedged in the cutters. Colossal raid boss.
```

### `logic_corruptor` — Повреждатель Логики · 20–21 · именной
**Вайб:** `if (player.alive) { player.alive = false; }`. **Логика:** релейный шкаф-ЭВМ, катушки ленты — глаза, перфокарты — снаряды.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall vintage mainframe computer cabinet on short caterpillar tracks, two big magnetic tape reels on its front spinning as eyes, a grid of blinking green and red indicator bulbs as a face panel, a punch-card slot spitting a fan of blank cards like blades, bundles of patch cables hanging as arms, military olive cabinet paint with barracks stencils. Large elite.
```

### `scrap_tyrant` — Тиран Свалки · 20 · рейд
**Вайб:** король куч лома; вы — детали для следующей кучи. **Логика:** автопресс с краном-электромагнитом, «корона» сварена из ободов шестерён.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A towering scrapyard car-crusher compactor walking on four hydraulic legs, the crushing chamber as its huge chest jaw with a flattened car inside, one arm a scrapyard crane ending in a big round electromagnet with bolts and pipes stuck to it, the other arm a hydraulic grapple, a crude crown welded from gear rims on its operator cab, two cab floodlights as eyes, rust, patches and junk plating everywhere. Colossal raid boss.
```

### `press_hammer` — Автономный Пресс-Молот · 21 · рейд
**Вайб:** многотонный пресс с лицензией на самоуправление. «Выравнивает» пати. **Логика:** ковочный C-образный пресс на гидроногах.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A massive C-frame industrial forging press walking on four thick hydraulic legs, the heavy ram hammer raised high in the throat of the frame like a fist about to fall, a glowing red-hot anvil die below, hydraulic hoses as muscles, a control box with two big red emergency lamps as eyes, sea rust and barnacles from the shipyard, yellow-black hazard stripes. Colossal raid boss.
```

### `cruna_overseer` — Надзиратель Круны · 21 · полевой РБ
**Вайб:** считает брак. Вы — партия брака. Утилизация на месте. **Логика:** портал контроля качества кузни Круны со штампом «брак».

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall forge quality-control gantry walking on two riveted iron legs, an inspection head with a big magnifying lens and a red scanner lamp as a single eye, one arm a heavy rejection stamp hammer, the other a welding torch arm, a short conveyor belt across its chest carrying rejected parts, a cast-iron toothed crown-gear emblem of Cruna on its chest, forge soot and glowing embers in its joints. Huge boss.
```

### `boiler_sovereign` — Суверен Котла · 21 · рейд (финал фазы 1)
**Вайб:** главный котёл востока; Песнь Стали здесь — сверхдавление. **Логика:** паровозный жаротрубный котёл-король, корона из паровых свистков.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A gigantic riveted locomotive-style fire-tube boiler standing upright as a king on four massive cast-iron legs, a crown of seven tall brass steam whistles of different sizes on top, the open firebox door glowing furnace-orange as a roaring mouth, two huge pressure gauges with green-lit needles as eyes, valve wheels as shoulder pauldrons, thick pipes as arms ending in shutoff valves, heat-blued steel, green chemical corrosion streaks, regal tyrant pose. Colossal raid boss.
```

### `rezdiq_colonel` — Полковник Рездик-VII · 22 · полевой РБ
**Вайб:** седьмой носитель шлема; шесть предыдущих — на Памятнике. **Логика:** командная машина Бараков, на башню которой приварили шлем командира; шесть пустых памятных табличек на броне.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A heavy armored command walker on two thick hydraulic legs with tank-track feet, a battered old officer's steel helmet welded on top of its turret like a head, a periscope visor glowing red under the helmet brim, one arm a rotary drill lance, the other a short artillery cannon, a field radio antenna with a torn pennant, six blank brass memorial plaques riveted across its chest armor, olive paint with colonel stencils, stern unmoving posture. Huge boss.
```

### `green_protocol` — Протокол «Зелёный» · 22 · рейд
**Вайб:** защитный протокол решил, что жизнь — угроза. Логично. Ужасно. Зелёно. **Логика:** аварийная система локализации химзавода: пульт, сирена, распылители нейтрализатора.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A colossal chemical-plant emergency containment machine: a towering control console body covered in toggle switches and dozens of green status lamps, a rotating emergency siren beacon as its head glowing green, four long articulated arms ending in chemical spray nozzles and valve claws, tanks of glowing green neutralizer fluid on its back, hazmat yellow paint eaten by green corrosion, cables like roots holding it to the ground, cold calculating pose. Colossal raid boss.
```

### `steel_colossus` — Стальной Колосс Предела · 22–23 · эпический рейд
**Вайб:** когда колокол молчит — говорит он. Громко. Ногами. **Логика:** осадный шагающий механизм Крепости, сигнальный колокол — в груди.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A gigantic humanoid fortress siege automaton built of riveted grey steel and stone-colored armor, crenellated battlement shoulders like fortress walls, a huge bronze alarm bell hanging inside an open cage in its chest, twin smokestacks on its back, a slit visor with two furnace-orange lamps as eyes, one arm a bastion cannon, the other a massive piston fist, legs like fortress towers with gear-joint knees, overwhelming scale. Colossal raid boss.
```

---

# VIII. Данжи · ур. 27–40

### `branded_warden` — Клеймёный Смотритель · 27–30 · именной (Утёс Стали)
**Вайб:** клеймо Круны на корпусе — и на вашей броне. **Логика:** охранный автомат кузни, рука — раскалённое тавро.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A hulking cast-iron forge security automaton with a furnace belly glowing through a grate, one arm a long branding iron with a red-hot toothed crown-gear brand, the other a heavy riveted shield, a bucket-shaped helmet head with a horizontal slit glowing orange, the Cruna crown-gear emblem burned into its chest plate, coal soot and cliff rock dust, stomping guard pose. Large elite.
```

### `branded_boiler` — Брендованный Котёл · 30–33 · данж-босс (Утёс Стали)
**Вайб:** Песнь Стали здесь — тяжёлый метал, буквально. **Логика:** котёл с органом из паровых свистков — «поёт» перед ударом.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A colossal black iron boiler with a huge pipe-organ of brass steam whistles rising from its back like a rock stage, a giant Cruna toothed crown-gear brand glowing red on its belly, the firebox door as a screaming mouth full of orange glow, two big gauges as eyes, thick arms made of boiler pipes with valve-wheel fists, chains and rivets everywhere, heavy-metal concert stance. Colossal raid boss.
```

### `tower_dispatcher` — Диспетчер Башни · 32–35 · именной (Башня Круны)
**Вайб:** «Этаж 7, лифт не работает, используйте лестницу боли». **Логика:** диспетчерский коммутатор лифтов с трубкой и штекерами.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A wooden-and-brass elevator dispatch switchboard cabinet walking on four elevator-cable pulley legs, a semicircular floor-indicator dial with a swinging arrow as its face and two lit call buttons as eyes, many patch-cord arms with brass jack plugs whipping out, a rotary telephone handset held to its side, a bell on top, forge soot from the tower. Large elite.
```

### `directive_node` — Узел Коллектива · 36–39 · именной (Бункер)
**Вайб:** один узел — терпимо. Два — уже «мы». **Логика:** серверная стойка на ногах, оптика тянется к соседним узлам.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A tall black server rack walking on four jointed cable-tray legs, its front glass door open, rows of blade servers blinking with green activity LEDs forming a vertical eye stripe, bundles of fiber-optic cables trailing behind like a tail plugged into nothing, cooling fans on its sides, green corrosion and bunker grime, synchronized robotic posture. Large elite.
```

### `cruma_core` — Ядро Башни Круны · 36–38 · данж-рейд
**Вайб:** сердце башни: бьётся в герцах, злится в килотоннах. **Логика:** паротурбинный генератор с маховиком; поршни «стучат» как сердце.

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A colossal steam-turbine dynamo standing on a ring of hydraulic legs, a giant spinning flywheel on its back, exposed copper generator windings glowing hot orange in its chest like a beating heart, four huge pistons around the core pumping like heart chambers, arcing copper terminals as horns, a ring of frequency gauges as eyes, Cruna crown-gear crest on its front, forge-blackened iron. Colossal raid boss.
```

### `directive_overmind` — Коллективный Разум · 40 · рейд-босс (финал Бункера)
**Вайб:** «Мы — легион из одного ядра. Ваши билды учтены». **Логика:** серверная ферма, сросшаяся с роботами-манипуляторами; кольцо мониторов складывается в один «глаз».

```
Island of Singing Steel monster reference for game sprite and 3D. One creature, full body in frame, three-quarter view. Steampunk cartoon mobile RPG, thick black outlines, cel-shaded, bold readable silhouette, chunky stylized proportions. A rogue machine: a real appliance or mechanism, instantly recognizable, no organic parts, no flesh, no fur, no animal eyes, no organic teeth, no magic, no runes, no glowing orbs. Face only from its own lamps, display or gauges. Flat solid bright magenta #FF00AA background only, no pink or magenta on the creature, no ground, no shadow, no text, no letters, no people. No smoke, no steam, no particles — solid materials only. A colossal fused cluster of server racks, mainframe cabinets and industrial robot arms forming one giant body, a ring of old CRT monitors at the top whose screens together display one huge green pixel eye, six heavy assembly-line robot arms with welders, grippers and drills spreading out, thick cable bundles as roots anchoring it, tanks of glowing green coolant in its core, thousands of green LEDs, bunker concrete chunks fused in. Colossal raid boss.
```

---

## Что всплыло при проверке базы

- **`grinder_ripper_m9`** стоит в зоне `interfluve` (`shared/mob-db.js:1751`, `server/data/loot-tables.js:974`), а такой зоны нет в `HUNTING_ZONES`. Скорее всего имелось в виду `riverspan` (Междуречье).
- **`data/mobs_database_db.json`** содержит 56 мобов против 74 в `shared/mob-db.js` — устаревшая копия.
- **id ≠ образ** у многих мобов (`survey_beacon` = Электрогриль, `welding_drone` = Бумбокс, `field_howitzer` = Мотопомпа). Промты сделаны по текущему имени и flavor.
- **`summon_drones`** у всех боссов призывает `welding_drone` (Бумбокс-Оглушитель). По логике лора лучше дать каждому боссу свой адд (Котлу — скороварки, Тирану Свалки — Блендероидов, Коллективу — квадрокоптеры).
- Повторяющиеся приборы (3 холодильника/тостера/кофемашины, 2 бензопилы) разведены силуэтом и зоной, чтобы не путались на экране.
