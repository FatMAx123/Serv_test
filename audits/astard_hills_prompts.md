# Промты для Генерации Концепт-Арта Локации «Холмы Астарда» (Astard Hills)

> **Назначение:** Набор профессиональных промтов для генерации визуальных референсов и оверпейнтов в **Midjourney v6.1**, **Stable Diffusion XL / Flux**, **ComfyUI (ControlNet Depth/Canny)** и **DALL-E 3**.  
> **База:** 6 реальных скриншотов рельефа из Three.js движка игры (1600×900).  
> **Стиль:** *Пасторальный викторианский стимпанк + классическая MMORPG (Lineage 2 Classic aesthetic)*. Утреннее золотое солнце, клубы пара, чугунные клепаные паропроводы, латунные геодезические вешки, одичавшая бытовая техника.

---

## 📌 Сводная таблица референсных скриншотов

| № | Зона / Ракурс | Исходный скриншот движка | Ключевые POI и объекты |
|---|---|---|---|
| **0** | **Общая Панорама** | [`zone_overview_astard_hills.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_overview_astard_hills.png) | Холмистая долина, чугунная магистраль, клубы пара из карьера |
| **A** | **Северный Гребень** | [`zone_a_north_ridge.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_a_north_ridge.png) | Триангуляционный пик, лагерь картографов, скрапперы, пни |
| **B** | **Зеленые Террасы** | [`zone_b_green_terraces.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_b_green_terraces.png) | Опрокинутая тележка, стая кофемашин-гончих, косилки |
| **C** | **Карьерный Разлом** | [`zone_c_quarry_boiler_pit.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_c_quarry_boiler_pit.png) | Разорванный 1.5м паропровод, гейзеры пара, РБ Бойлер-Взрывник |
| **D** | **Скальный Перевал** | [`zone_d_east_rock_pass.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_d_east_rock_pass.png) | Базальтовый карниз, вентильная будка, стиралки-убийцы |
| **E** | **Южный Спуск** | [`zone_e_south_berserker_vale.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_e_south_berserker_vale.png) | Каменная подпорная стенка, чугунный фонарь, Кофе-Берсерк |

---

## 0. Общая Панорама: Холмы Астарда и Паровая Магистраль

* **Базовое изображение:** [`zone_overview_astard_hills.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_overview_astard_hills.png)
* **Роль в игре:** Первый панорамный вид, открывающийся игроку при выходе из школьного двора на юг.

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Video game environment concept art overpaint based on the landscape composition in the reference image. Pastoral Victorian steampunk MMORPG open world, rolling emerald-green hill terraces and lush grassy meadows stretching towards the ocean horizon. A massive industrial network of riveted cast-iron steam pipelines snaking across the valley floor with brass pressure valves, steam release vents, and bolted support pylons. In the middle depression, towering plumes of white pressurized steam and geysers rise into the morning sky. In the foreground hills, an abandoned surveyor expedition camp with canvas tents and brass optical triangulation tripods. Distant dirt roads and meandering paths cutting through the green hills. Soft atmospheric morning golden hour sunlight breaking through volumetric steam clouds, long shadows, Lineage 2 Classic pastoral spirit meets Victorian steampunk industrial fantasy, highly detailed digital painting, 8k resolution, cinematic lighting --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
modern asphalt, high-tech sci-fi, futuristic neon, cyberpunk, skyscrapers, plastic, anime cartoon, oversaturated, blurry, low resolution, ugly terrain, deformed geometry
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Depth Map (weight: 0.85, guidance end: 0.80) или Lineart.
* **Denoising Strength (Img2Img):** `0.58 – 0.65` (сохраняет силуэт холмов, но заменяет голую текстуру на сочную зелень, трубы и пар).

---

## 1. Зона A: Северный Гребень и Триангуляционный Пик

* **Базовое изображение:** [`zone_a_north_ridge.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_a_north_ridge.png)
* **Ключевой POI:** «Триангуляционный Пик» (u: 0.48, v: 0.61, Y: +15.0м), высшая точка для квеста *«Разведка Астарда»* (Бот-01).

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Environment concept art overpaint matching the hill and horizon geometry of the reference screenshot. Astard Hills North Ridge in a Victorian steampunk MMORPG. Foreground shows a gentle grassy slope with ancient tree stumps cleanly severed by steam buzzsaws, scattered bronze logging wedges, and wild red poppy flowers. In the midground, an abandoned Syndicate cartographer camp with weathered canvas tents, rolled parchment maps on wooden crates, and an ornate cast-iron waymarker pillar. On the prominent hill crest in the background stands the Triangulation Station: a tall brass surveying tripod with rotating glass prisms reflecting golden morning light. A solitary passive mechanical automaton scavenger (a brass scrap-vacuum drone on articulated tripod legs) wanders through the grass. Morning haze over the distant blue ocean, warm side-lighting, Lineage 2 starting zone atmosphere, painterly fantasy realism --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
modern technology, asphalt, concrete road, sci-fi lasers, digital screens, floating UI, flat lighting, oversaturation, blur, watermark
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Depth Map (weight: 0.90) — зафиксировать холм-пик справа и пологий гребень слева.
* **Denoising Strength:** `0.60`.

---

## 2. Зона B: Зеленые Террасы и Разбитая Экспедиция

* **Базовое изображение:** [`zone_b_green_terraces.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_b_green_terraces.png)
* **Ключевой POI:** «Разбитая Экспедиция» (u: 0.46, v: 0.59, Y: +10.0м), основная зона охоты на стаи гончих (6–8 ур.).

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Fantasy video game landscape concept art matching the camera angle and hill terraces of the reference image. Rolling green farming terraces and open meadows of Astard Hills. Running along the grass is a heavy riveted steam pipe with a leaking valve venting soft white steam. In the foreground: the POI 'Broken Expedition' featuring a shattered wooden surveying wagon with bronze cog wheels, wooden planks, and a rusted metal warning sign reading warning hazard. Roaming the emerald field is a pack of 7 feral steampunk mechanical monsters (steam_hound): quadrupedal espresso machines built of polished copper and brass, running on articulated piston legs with glowing red gauge dials, venting espresso steam from their twin portafilter snouts. In the distance, an aggressive steampunk lawnmower tractor with spinning blades patrols the trail. Morning golden sun filtering through dust and steam, Lineage 2 Classic mob grinding zone feeling, Victorian steampunk wildlife, dynamic and atmospheric --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
cyberpunk, modern cars, gasoline engines, anime, flat shading, ugly monsters, low resolution, blurry textures, deformed limbs
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Depth Map (weight: 0.85).
* **Denoising Strength:** `0.62`.

---

## 3. Зона C: Карьерный Разлом и Паровой Котлован (Арена РБ)

* **Базовое изображение:** [`zone_c_quarry_boiler_pit.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_c_quarry_boiler_pit.png)
* **Ключевой POI:** «Авария Магистрали» (u: 0.51, v: 0.63, Y: -5.0м), арена Рейд-Босса «Бойлер-Взрывник Б-1».

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Epic MMORPG boss arena concept art based on the terrain depression in the reference screenshot. A natural crater amphitheater quarry in Astard Hills. The basin is ringed by massive jagged basalt rock formations and dark earth. In the center of the pit lies a catastrophic pipeline rupture: a torn 1.5-meter cast-iron main pipe violently blasting roaring geysers of boiling water and massive billowing clouds of white pressurized steam into the air. Looming inside the steam plume is the Field Raid Boss 'Boiler-Exploder B-1': a massive 4-meter tall colossal steampunk boiler automaton made of dark riveted iron, glowing amber-orange furnace core behind a cast-iron grate, spitting hot steam from twin exhaust whistles, wielding a spiked steam hammer and boiler-plate shield. On the surrounding upper cliff edges stand brass survey beacon turrets with amber targeting lenses. Dramatic heat haze, volumetric steam god-rays, Lineage 2 raid boss confrontation, cinematic composition --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
peaceful meadow, modern factory, sci-fi plasma, magical wizardry, clean corporate render, low contrast, washed out colors, blur, distortion
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Canny Edge + Depth (weight: 0.80) — сохраняет форму чаши котлована, позволяя насытить центр фигурой босса и клубами пара.
* **Denoising Strength:** `0.65`.

---

## 4. Зона D: Восточный Скальный Перевал и Регулировочная Станция

* **Базовое изображение:** [`zone_d_east_rock_pass.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_d_east_rock_pass.png)
* **Ключевой POI:** «Регулировочная Станция Контура» (u: 0.53, v: 0.62, Y: +5.0м), опасный коридор (choke point).

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Atmospheric video game concept art based on the rocky pass in the reference image. Eastern Rocky Pass in Astard Hills: a narrow treacherous canyon choke point cut through dark basalt rock scree and jagged cliffs. Built against the rock face stands the 'Circuit Regulation Station': a heavy Victorian cast-iron valve house with large copper control wheels, pressure gauges, and reinforced copper pipes hissing steam. An overturned mining cart with basalt ore rests near rusted narrow-gauge rails. Prowling the narrow mountain ledge are heavy aggressive steampunk automatons (hill_presser): brutal walking industrial washing machines on mechanical iron legs, reinforced slamming doors, hydraulic piston crushers, venting steam as they stomp on the gravel. Chilly morning fog mingling with warm valve steam, dangerous mountain corridor, Lineage 2 Classic choke point gameplay, high detail, rich textures --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
lush tropical jungle, flat highway, futuristic hovercraft, neon lights, low poly, oversaturated, deformed proportions, blur
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Depth Map (weight: 0.85).
* **Denoising Strength:** `0.60`.

---

## 5. Зона E: Южный Склон и Лощина Берсерка

* **Базовое изображение:** [`zone_e_south_berserker_vale.png`](file:///C:/Users/Kulibyaka/.gemini/antigravity-ide/brain/f4710057-d411-470c-9de0-db3f8913ae8d/zone_e_south_berserker_vale.png)
* **Ключевой POI:** «Поляна Баристы-Мятежника» (u: 0.5055, v: 0.7461, Y: 0м), граница с зоной Междуречья.

### 🇬🇧 Prompt (Midjourney / SDXL / DALL-E)
```text
Video game environment concept art matching the slope composition of the reference image. Southern slope of Astard Hills descending towards the river marshes. On the left side of the slope is a rugged dry-stone retaining wall supporting a dirt road gradient, topped by an ornate antique cast-iron steam gas lamp glowing with faint morning light. On the right, nestled in a secluded sunken hollow surrounded by overgrown flowering bushes and wild thistle, lies 'The Rebel Barista's Clearing'. Lurking in the morning shadow is the elite mini-boss 'Coffee-Berserker': an aggressive heavy brass espresso automaton with blazing red optical burners, steam shooting from high-pressure safety valves, wielding twin oversized heavy bronze portafilter clubs. In the distant horizon, the gentle river valley of Riverspan begins to emerge under a golden dawn sky. Lineage 2 rare named-monster lair mood, Victorian pastoral steampunk, masterwork concept art --ar 16:9 --style raw --v 6.1
```

### 🚫 Negative Prompt
```text
modern asphalt, cars, cyberpunk neon, sci-fi energy weapons, blur, cartoonish, low resolution, bad anatomy, overexposed
```

### ⚙️ Рекомендуемые параметры ControlNet / Img2Img
* **ControlNet:** Depth Map (weight: 0.85).
* **Denoising Strength:** `0.60`.
