# 🎵 Аудиосистема Project Steam: Origins

Папка аудиоресурсов для аутентичной средневеково-стимпанковой атмосферы в стиле Lineage 2.

## 📁 Структура каталогов

```
client/assets/audio/
├── bgm/                       # Фоновая музыка зон и локаций (BGM)
│   ├── village_theme.ogg      # Эмбиент стартовой деревни (Town / Village)
│   └── plains_ambient.ogg     # Эмбиент окрестных полей и равнин (Plains / Fields)
├── sfx/                       # Звуковые эффекты (SFX)
│   ├── soulshot.ogg
│   ├── hit.ogg
│   ├── crit.ogg
│   ├── spell_cast.ogg
│   ├── levelup.ogg
│   ├── death.ogg
│   └── loot.ogg
└── README.md
```

---

## 🎧 Текущие дорожки BGM (CC-BY 4.0 Kevin MacLeod / incompetech.com)

1. **`village_theme.ogg`** (`Village Consort`)
   * **Локация:** Деревня поющей стали / Торговая площадь.
   * **Настроение:** Уютный средневековый трактир, лютня, флейта, акустические струнные, мягкая перкуссия.
   * **Аттрибуция:** *"Village Consort" Kevin MacLeod (incompetech.com), Licensed under CC-BY 4.0.*

2. **`plains_ambient.ogg`** (`Skye Cuillin`)
   * **Локация:** Окрестные поля, Холмы Астарда, Междуречье.
   * **Настроение:** Атмосфера простора, кельтская флейта, воздушные струнные, медленный медитативный ритм (аналог Talking Island / Elven Village fields из Lineage 2).
   * **Аттрибуция:** *"Skye Cuillin" Kevin MacLeod (incompetech.com), Licensed under CC-BY 4.0.*

---

## 🤖 Промпты для генератора Google (MusicFX / Lyria / MusicLM)

Если вы хотите сгенерировать новые уникальные треки через **[Google MusicFX](https://aitestkitchen.withgoogle.com/tools/music-fx)** (нейросеть **Lyria / MusicLM** от Google DeepMind), используйте следующие оптимизированные промпты:

### 1. Стартовая Деревня (Starter Village Theme — L2 style):
> `peaceful fantasy mmorpg village theme, lineage 2 talking island nostalgic vibe, acoustic 12-string guitar arpeggio, soft celtic wooden flute, gentle orchestral strings, medieval fantasy town, warm lute, subtle steampunk clockwork mechanism ticking, 76 bpm, loopable, calm and relaxing, high fidelity studio recording`

### 2. Окрестные Поля и Холмы (Surrounding Fields Ambient — L2 style):
> `vast open green plains ambient, classic fantasy mmorpg exploration, lineage 2 gludio dion fields atmosphere, melancholic solo cello and violin, distant wind chime, airy harp, lush atmospheric pads, slow tempo 68 bpm, expansive adventure feeling, cinematic, clean mix`

### 3. Боевой режим / Босс (Combat & Boss Theme):
> `epic orchestral battle music, lineage 2 raid boss encounter, intense staccato strings, heavy brass horns, marching timpani war drums, dramatic choir, fast 132 bpm, heroic fantasy struggle, adrenaline pumping`

---

## ⚙️ Требования к звуковым файлам для WebGL / Three.js
* **Форматы:** только `.ogg` (Vorbis) — BGM и SFX.
* **Параметры:** BGM stereo ~q3; SFX mono.
* **Громкость:** нормализация до -14 LUFS для музыки (чтобы взрывы и удары читались отчетливо).
