// ============================================================
//  CLIENT / JS / PROPS-LIBRARY-DATA.JS
//  Каталог и библиотека 3D-моделей (props) для редактора сцены
//  Модели FBX/GLB (деревья, кусты, здания, декор, руины)
// ============================================================
(function (global) {
  'use strict';

  const CATEGORIES = [
    {
        "id": "all",
        "nameRu": "Все модели",
        "nameEn": "All Models",
        "icon": "📦",
        "color": "#ffaa44"
    },
    {
        "id": "trees",
        "nameRu": "Деревья & Лес",
        "nameEn": "Trees & Forest",
        "icon": "🌲",
        "color": "#33aa55"
    },
    {
        "id": "bushes",
        "nameRu": "Кусты & Трава",
        "nameEn": "Bushes & Plants",
        "icon": "🌿",
        "color": "#66cc44"
    },
    {
        "id": "dead_trees",
        "nameRu": "Мертвые деревья",
        "nameEn": "Dead Trees",
        "icon": "🪵",
        "color": "#aa8855"
    },
    {
        "id": "houses",
        "nameRu": "Жилые дома",
        "nameEn": "Houses",
        "icon": "🏠",
        "color": "#66bb66"
    },
    {
        "id": "engineer_houses",
        "nameRu": "Дома инженеров",
        "nameEn": "Engineer Houses",
        "icon": "⚙️",
        "color": "#44aaff"
    },
    {
        "id": "forges",
        "nameRu": "Кузницы & Мастерские",
        "nameEn": "Forges & Smithies",
        "icon": "🔨",
        "color": "#ff7733"
    },
    {
        "id": "shops_stalls",
        "nameRu": "Магазины & Лавки",
        "nameEn": "Shops & Stalls",
        "icon": "🏪",
        "color": "#eebb33"
    },
    {
        "id": "warehouses",
        "nameRu": "Склады & Ангары",
        "nameEn": "Warehouses",
        "icon": "📦",
        "color": "#aa77dd"
    },
    {
        "id": "tents",
        "nameRu": "Палатки & Навесы",
        "nameEn": "Tents & Canopies",
        "icon": "⛺",
        "color": "#55ccbb"
    },
    {
        "id": "steampunk",
        "nameRu": "Стимпанк & Оборудование",
        "nameEn": "Steampunk & Tech",
        "icon": "🏭",
        "color": "#ff5577"
    },
    {
        "id": "transport",
        "nameRu": "Дирижабли & Причалы",
        "nameEn": "Airships & Docks",
        "icon": "🛸",
        "color": "#33ccff"
    },
    {
        "id": "monuments",
        "nameRu": "Монументы & Храмы",
        "nameEn": "Monuments & Shrines",
        "icon": "🏛️",
        "color": "#ffdd66"
    },
    {
        "id": "rocks",
        "nameRu": "Камни & Скалы",
        "nameEn": "Rocks & Boulders",
        "icon": "🪨",
        "color": "#778899"
    },
    {
        "id": "forest_decor",
        "nameRu": "Лесной декор",
        "nameEn": "Forest Decor",
        "icon": "🍄",
        "color": "#55aa44"
    },
    {
        "id": "market",
        "nameRu": "Средневековый рынок",
        "nameEn": "Medieval Market",
        "icon": "🏪",
        "color": "#cc8844"
    },
    {
        "id": "bazaar",
        "nameRu": "Восточный базар (GLB)",
        "nameEn": "Oriental Bazaar (GLB)",
        "icon": "🏺",
        "color": "#f59e0b"
    },
    {
        "id": "ruins",
        "nameRu": "Руины & Колонны",
        "nameEn": "Ruins & Columns",
        "icon": "🏛️",
        "color": "#d8ccb0"
    },
    {
        "id": "custom",
        "nameRu": "Пользовательские",
        "nameEn": "Custom Uploads",
        "icon": "✨",
        "color": "#ff44aa"
    }
];

  const PROPS_CATALOG = [

    {
        "id": "field_poppy_a",
        "nameRu": "Мак полевой (Вариант A)",
        "nameEn": "Field Poppy A",
        "category": "bushes",
        "file": "field_poppy_a.fbx",
        "defaultScale": 0.0202,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак A"
        ]
    },
    {
        "id": "field_poppy_b",
        "nameRu": "Мак полевой (Вариант B)",
        "nameEn": "Field Poppy B",
        "category": "bushes",
        "file": "field_poppy_b.fbx",
        "defaultScale": 0.0274,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак B"
        ]
    },
    {
        "id": "field_poppy_c",
        "nameRu": "Мак полевой (Вариант C)",
        "nameEn": "Field Poppy C",
        "category": "bushes",
        "file": "field_poppy_c.fbx",
        "defaultScale": 0.0191,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак C"
        ]
    },
    {
        "id": "field_poppy_d",
        "nameRu": "Мак полевой (Вариант D)",
        "nameEn": "Field Poppy D",
        "category": "bushes",
        "file": "field_poppy_d.fbx",
        "defaultScale": 0.0309,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак D"
        ]
    },
    {
        "id": "field_poppy_e",
        "nameRu": "Мак полевой (Вариант E)",
        "nameEn": "Field Poppy E",
        "category": "bushes",
        "file": "field_poppy_e.fbx",
        "defaultScale": 0.0176,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак E"
        ]
    },
    {
        "id": "field_poppy_f",
        "nameRu": "Мак полевой (Вариант F)",
        "nameEn": "Field Poppy F",
        "category": "bushes",
        "file": "field_poppy_f.fbx",
        "defaultScale": 0.0265,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак F"
        ]
    },
    {
        "id": "field_poppy_g",
        "nameRu": "Мак полевой (Вариант G)",
        "nameEn": "Field Poppy G",
        "category": "bushes",
        "file": "field_poppy_g.fbx",
        "defaultScale": 0.0331,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак G"
        ]
    },
    {
        "id": "field_poppy_h",
        "nameRu": "Мак полевой (Вариант H)",
        "nameEn": "Field Poppy H",
        "category": "bushes",
        "file": "field_poppy_h.fbx",
        "defaultScale": 0.0203,
        "estimatedHeight": 1.35,
        "tags": [
            "мак",
            "маки",
            "цветы",
            "куст",
            "полевой мак",
            "красный",
            "растение",
            "зелень",
            "poppy",
            "field poppy",
            "flowers",
            "red",
            "plant",
            "foliage",
            "мак H"
        ]
    }
,


    {
        "id": "matted_pratia_a",
        "nameRu": "Пратия стелющаяся (Ковер A)",
        "nameEn": "Matted Pratia A",
        "category": "bushes",
        "file": "matted_pratia_a.fbx",
        "defaultScale": 0.0959,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер A"
        ]
    },
    {
        "id": "matted_pratia_b",
        "nameRu": "Пратия стелющаяся (Ковер B)",
        "nameEn": "Matted Pratia B",
        "category": "bushes",
        "file": "matted_pratia_b.fbx",
        "defaultScale": 0.0714,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер B"
        ]
    },
    {
        "id": "matted_pratia_c",
        "nameRu": "Пратия стелющаяся (Ковер C)",
        "nameEn": "Matted Pratia C",
        "category": "bushes",
        "file": "matted_pratia_c.fbx",
        "defaultScale": 0.1186,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер C"
        ]
    },
    {
        "id": "matted_pratia_d",
        "nameRu": "Пратия стелющаяся (Ковер D)",
        "nameEn": "Matted Pratia D",
        "category": "bushes",
        "file": "matted_pratia_d.fbx",
        "defaultScale": 0.0839,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер D"
        ]
    },
    {
        "id": "matted_pratia_e",
        "nameRu": "Пратия стелющаяся (Ковер E)",
        "nameEn": "Matted Pratia E",
        "category": "bushes",
        "file": "matted_pratia_e.fbx",
        "defaultScale": 0.0834,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер E"
        ]
    },
    {
        "id": "matted_pratia_f",
        "nameRu": "Пратия стелющаяся (Ковер F)",
        "nameEn": "Matted Pratia F",
        "category": "bushes",
        "file": "matted_pratia_f.fbx",
        "defaultScale": 0.0737,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер F"
        ]
    },
    {
        "id": "matted_pratia_g",
        "nameRu": "Пратия стелющаяся (Ковер G)",
        "nameEn": "Matted Pratia G",
        "category": "bushes",
        "file": "matted_pratia_g.fbx",
        "defaultScale": 0.0732,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер G"
        ]
    },
    {
        "id": "matted_pratia_h",
        "nameRu": "Пратия стелющаяся (Ковер H)",
        "nameEn": "Matted Pratia H",
        "category": "bushes",
        "file": "matted_pratia_h.fbx",
        "defaultScale": 0.0838,
        "estimatedHeight": 0.65,
        "tags": [
            "пратия",
            "трава",
            "цветы",
            "куст",
            "почвопокровные",
            "растение",
            "зелень",
            "matted pratia",
            "pratia",
            "flowers",
            "groundcover",
            "foliage",
            "ковер H"
        ]
    }
,


    {
        "id": "retro_bush1_fall",
        "nameRu": "Кустарник №1 (Осенний)",
        "nameEn": "Autumn Bush 1",
        "category": "bushes",
        "file": "retro_bush1_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 1",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush1_spring",
        "nameRu": "Кустарник №1 (Весенний)",
        "nameEn": "Spring Bush 1",
        "category": "bushes",
        "file": "retro_bush1_spring.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 1",
            "весна",
            "весенний",
            "spring"
        ]
    },
    {
        "id": "retro_bush1_summer",
        "nameRu": "Кустарник №1 (Летний)",
        "nameEn": "Summer Bush 1",
        "category": "bushes",
        "file": "retro_bush1_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 1",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush1_winter",
        "nameRu": "Кустарник №1 (Зимний)",
        "nameEn": "Winter Bush 1",
        "category": "bushes",
        "file": "retro_bush1_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 1",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush2_fall",
        "nameRu": "Кустарник №2 (Осенний)",
        "nameEn": "Autumn Bush 2",
        "category": "bushes",
        "file": "retro_bush2_fall.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush2_spring1",
        "nameRu": "Цветущий куст №2 (Цветы 1)",
        "nameEn": "Blossoming Bush 2 (Flowers 1)",
        "category": "bushes",
        "file": "retro_bush2_spring1.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 1"
        ]
    },
    {
        "id": "retro_bush2_spring2",
        "nameRu": "Цветущий куст №2 (Цветы 2)",
        "nameEn": "Blossoming Bush 2 (Flowers 2)",
        "category": "bushes",
        "file": "retro_bush2_spring2.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 2"
        ]
    },
    {
        "id": "retro_bush2_spring3",
        "nameRu": "Цветущий куст №2 (Цветы 3)",
        "nameEn": "Blossoming Bush 2 (Flowers 3)",
        "category": "bushes",
        "file": "retro_bush2_spring3.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 3"
        ]
    },
    {
        "id": "retro_bush2_spring4",
        "nameRu": "Цветущий куст №2 (Цветы 4)",
        "nameEn": "Blossoming Bush 2 (Flowers 4)",
        "category": "bushes",
        "file": "retro_bush2_spring4.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 4"
        ]
    },
    {
        "id": "retro_bush2_spring5",
        "nameRu": "Цветущий куст №2 (Цветы 5)",
        "nameEn": "Blossoming Bush 2 (Flowers 5)",
        "category": "bushes",
        "file": "retro_bush2_spring5.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 5"
        ]
    },
    {
        "id": "retro_bush2_spring6",
        "nameRu": "Цветущий куст №2 (Цветы 6)",
        "nameEn": "Blossoming Bush 2 (Flowers 6)",
        "category": "bushes",
        "file": "retro_bush2_spring6.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 6"
        ]
    },
    {
        "id": "retro_bush2_summer",
        "nameRu": "Кустарник №2 (Летний)",
        "nameEn": "Summer Bush 2",
        "category": "bushes",
        "file": "retro_bush2_summer.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush2_winter",
        "nameRu": "Кустарник №2 (Зимний)",
        "nameEn": "Winter Bush 2",
        "category": "bushes",
        "file": "retro_bush2_winter.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 2",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush3_fall",
        "nameRu": "Кустарник №3 (Осенний)",
        "nameEn": "Autumn Bush 3",
        "category": "bushes",
        "file": "retro_bush3_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush3_spring1",
        "nameRu": "Цветущий куст №3 (Цветы 1)",
        "nameEn": "Blossoming Bush 3 (Flowers 1)",
        "category": "bushes",
        "file": "retro_bush3_spring1.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 1"
        ]
    },
    {
        "id": "retro_bush3_spring2",
        "nameRu": "Цветущий куст №3 (Цветы 2)",
        "nameEn": "Blossoming Bush 3 (Flowers 2)",
        "category": "bushes",
        "file": "retro_bush3_spring2.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 2"
        ]
    },
    {
        "id": "retro_bush3_spring3",
        "nameRu": "Цветущий куст №3 (Цветы 3)",
        "nameEn": "Blossoming Bush 3 (Flowers 3)",
        "category": "bushes",
        "file": "retro_bush3_spring3.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 3"
        ]
    },
    {
        "id": "retro_bush3_spring4",
        "nameRu": "Цветущий куст №3 (Цветы 4)",
        "nameEn": "Blossoming Bush 3 (Flowers 4)",
        "category": "bushes",
        "file": "retro_bush3_spring4.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 4"
        ]
    },
    {
        "id": "retro_bush3_spring5",
        "nameRu": "Цветущий куст №3 (Цветы 5)",
        "nameEn": "Blossoming Bush 3 (Flowers 5)",
        "category": "bushes",
        "file": "retro_bush3_spring5.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 5"
        ]
    },
    {
        "id": "retro_bush3_spring6",
        "nameRu": "Цветущий куст №3 (Цветы 6)",
        "nameEn": "Blossoming Bush 3 (Flowers 6)",
        "category": "bushes",
        "file": "retro_bush3_spring6.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 6"
        ]
    },
    {
        "id": "retro_bush3_summer",
        "nameRu": "Кустарник №3 (Летний)",
        "nameEn": "Summer Bush 3",
        "category": "bushes",
        "file": "retro_bush3_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush3_winter",
        "nameRu": "Кустарник №3 (Зимний)",
        "nameEn": "Winter Bush 3",
        "category": "bushes",
        "file": "retro_bush3_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 3",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush4_fall",
        "nameRu": "Кустарник №4 (Осенний)",
        "nameEn": "Autumn Bush 4",
        "category": "bushes",
        "file": "retro_bush4_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush4_spring1",
        "nameRu": "Цветущий куст №4 (Цветы 1)",
        "nameEn": "Blossoming Bush 4 (Flowers 1)",
        "category": "bushes",
        "file": "retro_bush4_spring1.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 1"
        ]
    },
    {
        "id": "retro_bush4_spring2",
        "nameRu": "Цветущий куст №4 (Цветы 2)",
        "nameEn": "Blossoming Bush 4 (Flowers 2)",
        "category": "bushes",
        "file": "retro_bush4_spring2.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 2"
        ]
    },
    {
        "id": "retro_bush4_spring3",
        "nameRu": "Цветущий куст №4 (Цветы 3)",
        "nameEn": "Blossoming Bush 4 (Flowers 3)",
        "category": "bushes",
        "file": "retro_bush4_spring3.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 3"
        ]
    },
    {
        "id": "retro_bush4_spring4",
        "nameRu": "Цветущий куст №4 (Цветы 4)",
        "nameEn": "Blossoming Bush 4 (Flowers 4)",
        "category": "bushes",
        "file": "retro_bush4_spring4.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 4"
        ]
    },
    {
        "id": "retro_bush4_spring5",
        "nameRu": "Цветущий куст №4 (Цветы 5)",
        "nameEn": "Blossoming Bush 4 (Flowers 5)",
        "category": "bushes",
        "file": "retro_bush4_spring5.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 5"
        ]
    },
    {
        "id": "retro_bush4_spring6",
        "nameRu": "Цветущий куст №4 (Цветы 6)",
        "nameEn": "Blossoming Bush 4 (Flowers 6)",
        "category": "bushes",
        "file": "retro_bush4_spring6.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 6"
        ]
    },
    {
        "id": "retro_bush4_summer",
        "nameRu": "Кустарник №4 (Летний)",
        "nameEn": "Summer Bush 4",
        "category": "bushes",
        "file": "retro_bush4_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush4_winter",
        "nameRu": "Кустарник №4 (Зимний)",
        "nameEn": "Winter Bush 4",
        "category": "bushes",
        "file": "retro_bush4_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 4",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush5_fall",
        "nameRu": "Кустарник №5 (Осенний)",
        "nameEn": "Autumn Bush 5",
        "category": "bushes",
        "file": "retro_bush5_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush5_spring1",
        "nameRu": "Цветущий куст №5 (Цветы 1)",
        "nameEn": "Blossoming Bush 5 (Flowers 1)",
        "category": "bushes",
        "file": "retro_bush5_spring1.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 1"
        ]
    },
    {
        "id": "retro_bush5_spring2",
        "nameRu": "Цветущий куст №5 (Цветы 2)",
        "nameEn": "Blossoming Bush 5 (Flowers 2)",
        "category": "bushes",
        "file": "retro_bush5_spring2.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 2"
        ]
    },
    {
        "id": "retro_bush5_spring3",
        "nameRu": "Цветущий куст №5 (Цветы 3)",
        "nameEn": "Blossoming Bush 5 (Flowers 3)",
        "category": "bushes",
        "file": "retro_bush5_spring3.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 3"
        ]
    },
    {
        "id": "retro_bush5_spring4",
        "nameRu": "Цветущий куст №5 (Цветы 4)",
        "nameEn": "Blossoming Bush 5 (Flowers 4)",
        "category": "bushes",
        "file": "retro_bush5_spring4.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 4"
        ]
    },
    {
        "id": "retro_bush5_spring5",
        "nameRu": "Цветущий куст №5 (Цветы 5)",
        "nameEn": "Blossoming Bush 5 (Flowers 5)",
        "category": "bushes",
        "file": "retro_bush5_spring5.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 5"
        ]
    },
    {
        "id": "retro_bush5_spring6",
        "nameRu": "Цветущий куст №5 (Цветы 6)",
        "nameEn": "Blossoming Bush 5 (Flowers 6)",
        "category": "bushes",
        "file": "retro_bush5_spring6.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 6"
        ]
    },
    {
        "id": "retro_bush5_summer",
        "nameRu": "Кустарник №5 (Летний)",
        "nameEn": "Summer Bush 5",
        "category": "bushes",
        "file": "retro_bush5_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush5_winter",
        "nameRu": "Кустарник №5 (Зимний)",
        "nameEn": "Winter Bush 5",
        "category": "bushes",
        "file": "retro_bush5_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 5",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush6_fall",
        "nameRu": "Кустарник №6 (Осенний)",
        "nameEn": "Autumn Bush 6",
        "category": "bushes",
        "file": "retro_bush6_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush6_spring1",
        "nameRu": "Цветущий куст №6 (Цветы 1)",
        "nameEn": "Blossoming Bush 6 (Flowers 1)",
        "category": "bushes",
        "file": "retro_bush6_spring1.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 1"
        ]
    },
    {
        "id": "retro_bush6_spring2",
        "nameRu": "Цветущий куст №6 (Цветы 2)",
        "nameEn": "Blossoming Bush 6 (Flowers 2)",
        "category": "bushes",
        "file": "retro_bush6_spring2.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 2"
        ]
    },
    {
        "id": "retro_bush6_spring3",
        "nameRu": "Цветущий куст №6 (Цветы 3)",
        "nameEn": "Blossoming Bush 6 (Flowers 3)",
        "category": "bushes",
        "file": "retro_bush6_spring3.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 3"
        ]
    },
    {
        "id": "retro_bush6_spring4",
        "nameRu": "Цветущий куст №6 (Цветы 4)",
        "nameEn": "Blossoming Bush 6 (Flowers 4)",
        "category": "bushes",
        "file": "retro_bush6_spring4.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 4"
        ]
    },
    {
        "id": "retro_bush6_spring5",
        "nameRu": "Цветущий куст №6 (Цветы 5)",
        "nameEn": "Blossoming Bush 6 (Flowers 5)",
        "category": "bushes",
        "file": "retro_bush6_spring5.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 5"
        ]
    },
    {
        "id": "retro_bush6_spring6",
        "nameRu": "Цветущий куст №6 (Цветы 6)",
        "nameEn": "Blossoming Bush 6 (Flowers 6)",
        "category": "bushes",
        "file": "retro_bush6_spring6.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "цветущий",
            "цветы",
            "весна",
            "flowers",
            "blossom",
            "spring",
            "цветы 6"
        ]
    },
    {
        "id": "retro_bush6_summer",
        "nameRu": "Кустарник №6 (Летний)",
        "nameEn": "Summer Bush 6",
        "category": "bushes",
        "file": "retro_bush6_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush6_winter",
        "nameRu": "Кустарник №6 (Зимний)",
        "nameEn": "Winter Bush 6",
        "category": "bushes",
        "file": "retro_bush6_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 6",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush7_fall",
        "nameRu": "Кустарник №7 (Осенний)",
        "nameEn": "Autumn Bush 7",
        "category": "bushes",
        "file": "retro_bush7_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 7",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush7_spring",
        "nameRu": "Кустарник №7 (Весенний)",
        "nameEn": "Spring Bush 7",
        "category": "bushes",
        "file": "retro_bush7_spring.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 7",
            "весна",
            "весенний",
            "spring"
        ]
    },
    {
        "id": "retro_bush7_summer",
        "nameRu": "Кустарник №7 (Летний)",
        "nameEn": "Summer Bush 7",
        "category": "bushes",
        "file": "retro_bush7_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 7",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush7_winter",
        "nameRu": "Кустарник №7 (Зимний)",
        "nameEn": "Winter Bush 7",
        "category": "bushes",
        "file": "retro_bush7_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 7",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    },
    {
        "id": "retro_bush8_fall",
        "nameRu": "Кустарник №8 (Осенний)",
        "nameEn": "Autumn Bush 8",
        "category": "bushes",
        "file": "retro_bush8_fall.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 8",
            "осень",
            "осенний",
            "fall",
            "autumn",
            "золотой"
        ]
    },
    {
        "id": "retro_bush8_spring",
        "nameRu": "Кустарник №8 (Весенний)",
        "nameEn": "Spring Bush 8",
        "category": "bushes",
        "file": "retro_bush8_spring.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 8",
            "весна",
            "весенний",
            "spring"
        ]
    },
    {
        "id": "retro_bush8_summer",
        "nameRu": "Кустарник №8 (Летний)",
        "nameEn": "Summer Bush 8",
        "category": "bushes",
        "file": "retro_bush8_summer.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 8",
            "лето",
            "летний",
            "summer"
        ]
    },
    {
        "id": "retro_bush8_winter",
        "nameRu": "Кустарник №8 (Зимний)",
        "nameEn": "Winter Bush 8",
        "category": "bushes",
        "file": "retro_bush8_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "ретро",
            "куст 8",
            "зима",
            "зимний",
            "winter",
            "снег"
        ]
    }
,


    {
        "id": "grass01",
        "nameRu": "Трава лесная №1",
        "nameEn": "Forest Grass 01",
        "category": "bushes",
        "file": "grass01.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "01"
        ]
    },
    {
        "id": "grass02",
        "nameRu": "Трава лесная №2",
        "nameEn": "Forest Grass 02",
        "category": "bushes",
        "file": "grass02.fbx",
        "defaultScale": 0.038,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "02"
        ]
    },
    {
        "id": "grass03",
        "nameRu": "Трава лесная №3",
        "nameEn": "Forest Grass 03",
        "category": "bushes",
        "file": "grass03.fbx",
        "defaultScale": 0.0224,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "03"
        ]
    },
    {
        "id": "grass04",
        "nameRu": "Трава лесная №4",
        "nameEn": "Forest Grass 04",
        "category": "bushes",
        "file": "grass04.fbx",
        "defaultScale": 0.0222,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "04"
        ]
    },
    {
        "id": "grass05",
        "nameRu": "Трава лесная №5",
        "nameEn": "Forest Grass 05",
        "category": "bushes",
        "file": "grass05.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "05"
        ]
    },
    {
        "id": "grass06",
        "nameRu": "Трава лесная №6",
        "nameEn": "Forest Grass 06",
        "category": "bushes",
        "file": "grass06.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "06"
        ]
    },
    {
        "id": "grass07",
        "nameRu": "Трава лесная №7",
        "nameEn": "Forest Grass 07",
        "category": "bushes",
        "file": "grass07.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "07"
        ]
    },
    {
        "id": "grass08",
        "nameRu": "Трава лесная №8",
        "nameEn": "Forest Grass 08",
        "category": "bushes",
        "file": "grass08.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "08"
        ]
    },
    {
        "id": "grass09",
        "nameRu": "Трава лесная №9",
        "nameEn": "Forest Grass 09",
        "category": "bushes",
        "file": "grass09.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "grass",
            "зелень",
            "поле",
            "растение",
            "plant",
            "foliage",
            "09"
        ]
    },
    {
        "id": "grass_bush",
        "nameRu": "Травяной куст",
        "nameEn": "Grass Bush",
        "category": "bushes",
        "file": "grass_bush.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "куст",
            "grass",
            "bush",
            "зелень",
            "растение"
        ]
    },
    {
        "id": "grass_patch",
        "nameRu": "Травяная поляна",
        "nameEn": "Grass Patch",
        "category": "bushes",
        "file": "grass_patch.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "поляна",
            "grass",
            "patch",
            "поле",
            "зелень"
        ]
    },
    {
        "id": "grass_patch_corner",
        "nameRu": "Травяной угол поляны",
        "nameEn": "Grass Patch Corner",
        "category": "bushes",
        "file": "grass_patch_corner.fbx",
        "defaultScale": 0.019,
        "estimatedHeight": 0.95,
        "tags": [
            "трава",
            "угол",
            "grass",
            "patch",
            "corner",
            "поле"
        ]
    },
    {
        "id": "retro_bush01",
        "nameRu": "Ретро кустарник №1",
        "nameEn": "Retro Bush 01",
        "category": "bushes",
        "file": "retro_bush01.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "01"
        ]
    },
    {
        "id": "retro_bush02",
        "nameRu": "Ретро кустарник №2",
        "nameEn": "Retro Bush 02",
        "category": "bushes",
        "file": "retro_bush02.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "02"
        ]
    },
    {
        "id": "retro_bush03",
        "nameRu": "Ретро кустарник №3",
        "nameEn": "Retro Bush 03",
        "category": "bushes",
        "file": "retro_bush03.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "03"
        ]
    },
    {
        "id": "retro_bush04",
        "nameRu": "Ретро кустарник №4",
        "nameEn": "Retro Bush 04",
        "category": "bushes",
        "file": "retro_bush04.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "04"
        ]
    },
    {
        "id": "retro_bush05",
        "nameRu": "Ретро кустарник №5",
        "nameEn": "Retro Bush 05",
        "category": "bushes",
        "file": "retro_bush05.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "05"
        ]
    },
    {
        "id": "retro_bush06",
        "nameRu": "Ретро кустарник №6",
        "nameEn": "Retro Bush 06",
        "category": "bushes",
        "file": "retro_bush06.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "06"
        ]
    },
    {
        "id": "retro_bush07",
        "nameRu": "Ретро кустарник №7",
        "nameEn": "Retro Bush 07",
        "category": "bushes",
        "file": "retro_bush07.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "07"
        ]
    },
    {
        "id": "retro_bush08",
        "nameRu": "Ретро кустарник №8",
        "nameEn": "Retro Bush 08",
        "category": "bushes",
        "file": "retro_bush08.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "трава",
            "растение",
            "зелень",
            "plant",
            "foliage",
            "shrub",
            "ретро",
            "08"
        ]
    },
    {
        "id": "bush01_winter",
        "nameRu": "Зимний кустарник №1",
        "nameEn": "Winter Bush 01",
        "category": "bushes",
        "file": "bush01_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "01"
        ]
    },
    {
        "id": "bush02_winter",
        "nameRu": "Зимний кустарник №2",
        "nameEn": "Winter Bush 02",
        "category": "bushes",
        "file": "bush02_winter.fbx",
        "defaultScale": 0.0357,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "02"
        ]
    },
    {
        "id": "bush03_winter",
        "nameRu": "Зимний кустарник №3",
        "nameEn": "Winter Bush 03",
        "category": "bushes",
        "file": "bush03_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "03"
        ]
    },
    {
        "id": "bush04_winter",
        "nameRu": "Зимний кустарник №4",
        "nameEn": "Winter Bush 04",
        "category": "bushes",
        "file": "bush04_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "04"
        ]
    },
    {
        "id": "bush05_winter",
        "nameRu": "Зимний кустарник №5",
        "nameEn": "Winter Bush 05",
        "category": "bushes",
        "file": "bush05_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "05"
        ]
    },
    {
        "id": "bush06_winter",
        "nameRu": "Зимний кустарник №6",
        "nameEn": "Winter Bush 06",
        "category": "bushes",
        "file": "bush06_winter.fbx",
        "defaultScale": 0.025,
        "estimatedHeight": 2.5,
        "tags": [
            "куст",
            "bush",
            "зима",
            "зимний",
            "winter",
            "снег",
            "растение",
            "06"
        ]
    },
    {
        "id": "tree01_winter",
        "nameRu": "Зимнее дерево №1",
        "nameEn": "Winter Tree 01",
        "category": "trees",
        "file": "tree01_winter.fbx",
        "defaultScale": 0.0396,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "01"
        ]
    },
    {
        "id": "tree02_winter",
        "nameRu": "Зимнее дерево №2",
        "nameEn": "Winter Tree 02",
        "category": "trees",
        "file": "tree02_winter.fbx",
        "defaultScale": 0.0128,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "02"
        ]
    },
    {
        "id": "tree03_winter",
        "nameRu": "Зимнее дерево №3",
        "nameEn": "Winter Tree 03",
        "category": "trees",
        "file": "tree03_winter.fbx",
        "defaultScale": 0.0406,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "03"
        ]
    },
    {
        "id": "tree04_winter",
        "nameRu": "Зимнее дерево №4",
        "nameEn": "Winter Tree 04",
        "category": "trees",
        "file": "tree04_winter.fbx",
        "defaultScale": 0.037,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "04"
        ]
    },
    {
        "id": "tree05_winter",
        "nameRu": "Зимнее дерево №5",
        "nameEn": "Winter Tree 05",
        "category": "trees",
        "file": "tree05_winter.fbx",
        "defaultScale": 0.0381,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "05"
        ]
    },
    {
        "id": "tree06_winter",
        "nameRu": "Зимнее дерево №6",
        "nameEn": "Winter Tree 06",
        "category": "trees",
        "file": "tree06_winter.fbx",
        "defaultScale": 0.0387,
        "estimatedHeight": 16.0,
        "tags": [
            "дерево",
            "tree",
            "зима",
            "зимнее",
            "winter",
            "снег",
            "лес",
            "06"
        ]
    }
,


    {
        "id": "tree001",
        "nameRu": "Ретро дерево №001",
        "nameEn": "Retro Tree 001",
        "category": "trees",
        "file": "tree001.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "001"
        ]
    },
    {
        "id": "tree002",
        "nameRu": "Ретро дерево №002",
        "nameEn": "Retro Tree 002",
        "category": "trees",
        "file": "tree002.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "002"
        ]
    },
    {
        "id": "tree003",
        "nameRu": "Ретро дерево №003",
        "nameEn": "Retro Tree 003",
        "category": "trees",
        "file": "tree003.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "003"
        ]
    },
    {
        "id": "tree004",
        "nameRu": "Ретро дерево №004",
        "nameEn": "Retro Tree 004",
        "category": "trees",
        "file": "tree004.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "004"
        ]
    },
    {
        "id": "tree005",
        "nameRu": "Ретро дерево №005",
        "nameEn": "Retro Tree 005",
        "category": "trees",
        "file": "tree005.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "005"
        ]
    },
    {
        "id": "tree006",
        "nameRu": "Ретро дерево №006",
        "nameEn": "Retro Tree 006",
        "category": "trees",
        "file": "tree006.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "006"
        ]
    },
    {
        "id": "tree007",
        "nameRu": "Ретро дерево №007",
        "nameEn": "Retro Tree 007",
        "category": "trees",
        "file": "tree007.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "007"
        ]
    },
    {
        "id": "tree008",
        "nameRu": "Ретро дерево №008",
        "nameEn": "Retro Tree 008",
        "category": "trees",
        "file": "tree008.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "008"
        ]
    },
    {
        "id": "tree009",
        "nameRu": "Ретро дерево №009",
        "nameEn": "Retro Tree 009",
        "category": "trees",
        "file": "tree009.fbx",
        "defaultScale": 0.0484,
        "estimatedHeight": 15.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "009"
        ]
    },
    {
        "id": "tree010",
        "nameRu": "Ретро дерево №010",
        "nameEn": "Retro Tree 010",
        "category": "trees",
        "file": "tree010.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "010"
        ]
    },
    {
        "id": "tree011",
        "nameRu": "Ретро дерево №011",
        "nameEn": "Retro Tree 011",
        "category": "trees",
        "file": "tree011.fbx",
        "defaultScale": 0.0414,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "011"
        ]
    },
    {
        "id": "tree012",
        "nameRu": "Ретро дерево №012",
        "nameEn": "Retro Tree 012",
        "category": "trees",
        "file": "tree012.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "012"
        ]
    },
    {
        "id": "tree013",
        "nameRu": "Ретро дерево №013",
        "nameEn": "Retro Tree 013",
        "category": "trees",
        "file": "tree013.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "013"
        ]
    },
    {
        "id": "tree014",
        "nameRu": "Ретро дерево №014",
        "nameEn": "Retro Tree 014",
        "category": "trees",
        "file": "tree014.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "014"
        ]
    },
    {
        "id": "tree015",
        "nameRu": "Ретро дерево №015",
        "nameEn": "Retro Tree 015",
        "category": "trees",
        "file": "tree015.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "015"
        ]
    },
    {
        "id": "tree016",
        "nameRu": "Ретро дерево №016",
        "nameEn": "Retro Tree 016",
        "category": "trees",
        "file": "tree016.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "016"
        ]
    },
    {
        "id": "tree017",
        "nameRu": "Ретро дерево №017",
        "nameEn": "Retro Tree 017",
        "category": "trees",
        "file": "tree017.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "017"
        ]
    },
    {
        "id": "tree018",
        "nameRu": "Ретро дерево №018",
        "nameEn": "Retro Tree 018",
        "category": "trees",
        "file": "tree018.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "018"
        ]
    },
    {
        "id": "tree019",
        "nameRu": "Ретро дерево №019",
        "nameEn": "Retro Tree 019",
        "category": "trees",
        "file": "tree019.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "019"
        ]
    },
    {
        "id": "tree020",
        "nameRu": "Ретро дерево №020",
        "nameEn": "Retro Tree 020",
        "category": "trees",
        "file": "tree020.fbx",
        "defaultScale": 0.055,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "020"
        ]
    },
    {
        "id": "tree021",
        "nameRu": "Ретро дерево №021",
        "nameEn": "Retro Tree 021",
        "category": "trees",
        "file": "tree021.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "021"
        ]
    },
    {
        "id": "tree022",
        "nameRu": "Ретро дерево №022",
        "nameEn": "Retro Tree 022",
        "category": "trees",
        "file": "tree022.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "022"
        ]
    },
    {
        "id": "tree023",
        "nameRu": "Ретро дерево №023",
        "nameEn": "Retro Tree 023",
        "category": "trees",
        "file": "tree023.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "023"
        ]
    },
    {
        "id": "tree024",
        "nameRu": "Ретро дерево №024",
        "nameEn": "Retro Tree 024",
        "category": "trees",
        "file": "tree024.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "024"
        ]
    },
    {
        "id": "tree025",
        "nameRu": "Ретро дерево №025",
        "nameEn": "Retro Tree 025",
        "category": "trees",
        "file": "tree025.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "025"
        ]
    },
    {
        "id": "tree026",
        "nameRu": "Ретро дерево №026",
        "nameEn": "Retro Tree 026",
        "category": "trees",
        "file": "tree026.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "026"
        ]
    },
    {
        "id": "tree027",
        "nameRu": "Ретро дерево №027",
        "nameEn": "Retro Tree 027",
        "category": "trees",
        "file": "tree027.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "027"
        ]
    },
    {
        "id": "tree028",
        "nameRu": "Ретро дерево №028",
        "nameEn": "Retro Tree 028",
        "category": "trees",
        "file": "tree028.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "028"
        ]
    },
    {
        "id": "tree029",
        "nameRu": "Ретро дерево №029",
        "nameEn": "Retro Tree 029",
        "category": "trees",
        "file": "tree029.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "029"
        ]
    },
    {
        "id": "tree030",
        "nameRu": "Ретро дерево №030",
        "nameEn": "Retro Tree 030",
        "category": "trees",
        "file": "tree030.fbx",
        "defaultScale": 0.0548,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "030"
        ]
    },
    {
        "id": "tree031",
        "nameRu": "Ретро дерево №031",
        "nameEn": "Retro Tree 031",
        "category": "trees",
        "file": "tree031.fbx",
        "defaultScale": 0.0333,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "031"
        ]
    },
    {
        "id": "tree032",
        "nameRu": "Ретро дерево №032",
        "nameEn": "Retro Tree 032",
        "category": "trees",
        "file": "tree032.fbx",
        "defaultScale": 0.0333,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "032"
        ]
    },
    {
        "id": "tree033",
        "nameRu": "Ретро дерево №033",
        "nameEn": "Retro Tree 033",
        "category": "trees",
        "file": "tree033.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "033"
        ]
    },
    {
        "id": "tree034",
        "nameRu": "Ретро дерево №034",
        "nameEn": "Retro Tree 034",
        "category": "trees",
        "file": "tree034.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "034"
        ]
    },
    {
        "id": "tree035",
        "nameRu": "Ретро дерево №035",
        "nameEn": "Retro Tree 035",
        "category": "trees",
        "file": "tree035.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "035"
        ]
    },
    {
        "id": "tree036",
        "nameRu": "Ретро дерево №036",
        "nameEn": "Retro Tree 036",
        "category": "trees",
        "file": "tree036.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "036"
        ]
    },
    {
        "id": "tree037",
        "nameRu": "Ретро дерево №037",
        "nameEn": "Retro Tree 037",
        "category": "trees",
        "file": "tree037.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "037"
        ]
    },
    {
        "id": "tree038",
        "nameRu": "Ретро дерево №038",
        "nameEn": "Retro Tree 038",
        "category": "trees",
        "file": "tree038.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "038"
        ]
    },
    {
        "id": "tree039",
        "nameRu": "Ретро дерево №039",
        "nameEn": "Retro Tree 039",
        "category": "trees",
        "file": "tree039.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "039"
        ]
    },
    {
        "id": "tree040",
        "nameRu": "Ретро дерево №040",
        "nameEn": "Retro Tree 040",
        "category": "trees",
        "file": "tree040.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "040"
        ]
    },
    {
        "id": "tree041",
        "nameRu": "Ретро дерево №041",
        "nameEn": "Retro Tree 041",
        "category": "trees",
        "file": "tree041.fbx",
        "defaultScale": 0.0334,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "041"
        ]
    },
    {
        "id": "tree042",
        "nameRu": "Ретро дерево №042",
        "nameEn": "Retro Tree 042",
        "category": "trees",
        "file": "tree042.fbx",
        "defaultScale": 0.0509,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "042"
        ]
    },
    {
        "id": "tree043",
        "nameRu": "Ретро дерево №043",
        "nameEn": "Retro Tree 043",
        "category": "trees",
        "file": "tree043.fbx",
        "defaultScale": 0.0509,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "043"
        ]
    },
    {
        "id": "tree044",
        "nameRu": "Ретро дерево №044",
        "nameEn": "Retro Tree 044",
        "category": "trees",
        "file": "tree044.fbx",
        "defaultScale": 0.0509,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "044"
        ]
    },
    {
        "id": "tree045",
        "nameRu": "Ретро дерево №045",
        "nameEn": "Retro Tree 045",
        "category": "trees",
        "file": "tree045.fbx",
        "defaultScale": 0.0426,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "045"
        ]
    },
    {
        "id": "tree046",
        "nameRu": "Ретро дерево №046",
        "nameEn": "Retro Tree 046",
        "category": "trees",
        "file": "tree046.fbx",
        "defaultScale": 0.0426,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "046"
        ]
    },
    {
        "id": "tree047",
        "nameRu": "Ретро дерево №047",
        "nameEn": "Retro Tree 047",
        "category": "trees",
        "file": "tree047.fbx",
        "defaultScale": 0.0426,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "047"
        ]
    },
    {
        "id": "tree048",
        "nameRu": "Ретро дерево №048",
        "nameEn": "Retro Tree 048",
        "category": "trees",
        "file": "tree048.fbx",
        "defaultScale": 0.0426,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "048"
        ]
    },
    {
        "id": "tree049",
        "nameRu": "Ретро дерево №049",
        "nameEn": "Retro Tree 049",
        "category": "trees",
        "file": "tree049.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "049"
        ]
    },
    {
        "id": "tree050",
        "nameRu": "Ретро дерево №050",
        "nameEn": "Retro Tree 050",
        "category": "trees",
        "file": "tree050.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "050"
        ]
    },
    {
        "id": "tree051",
        "nameRu": "Ретро дерево №051",
        "nameEn": "Retro Tree 051",
        "category": "trees",
        "file": "tree051.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "051"
        ]
    },
    {
        "id": "tree052",
        "nameRu": "Ретро дерево №052",
        "nameEn": "Retro Tree 052",
        "category": "trees",
        "file": "tree052.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "052"
        ]
    },
    {
        "id": "tree053",
        "nameRu": "Ретро дерево №053",
        "nameEn": "Retro Tree 053",
        "category": "trees",
        "file": "tree053.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "053"
        ]
    },
    {
        "id": "tree054",
        "nameRu": "Ретро дерево №054",
        "nameEn": "Retro Tree 054",
        "category": "trees",
        "file": "tree054.fbx",
        "defaultScale": 0.0602,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "054"
        ]
    },
    {
        "id": "tree055",
        "nameRu": "Ретро дерево №055",
        "nameEn": "Retro Tree 055",
        "category": "trees",
        "file": "tree055.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "055"
        ]
    },
    {
        "id": "tree056",
        "nameRu": "Ретро дерево №056",
        "nameEn": "Retro Tree 056",
        "category": "trees",
        "file": "tree056.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "056"
        ]
    },
    {
        "id": "tree057",
        "nameRu": "Ретро дерево №057",
        "nameEn": "Retro Tree 057",
        "category": "trees",
        "file": "tree057.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "057"
        ]
    },
    {
        "id": "tree058",
        "nameRu": "Ретро дерево №058",
        "nameEn": "Retro Tree 058",
        "category": "trees",
        "file": "tree058.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "058"
        ]
    },
    {
        "id": "tree059",
        "nameRu": "Ретро дерево №059",
        "nameEn": "Retro Tree 059",
        "category": "trees",
        "file": "tree059.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "059"
        ]
    },
    {
        "id": "tree060",
        "nameRu": "Ретро дерево №060",
        "nameEn": "Retro Tree 060",
        "category": "trees",
        "file": "tree060.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "060"
        ]
    },
    {
        "id": "tree061",
        "nameRu": "Ретро дерево №061",
        "nameEn": "Retro Tree 061",
        "category": "trees",
        "file": "tree061.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "061"
        ]
    },
    {
        "id": "tree062",
        "nameRu": "Ретро дерево №062",
        "nameEn": "Retro Tree 062",
        "category": "trees",
        "file": "tree062.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "062"
        ]
    },
    {
        "id": "tree063",
        "nameRu": "Ретро дерево №063",
        "nameEn": "Retro Tree 063",
        "category": "trees",
        "file": "tree063.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "063"
        ]
    },
    {
        "id": "tree064",
        "nameRu": "Ретро дерево №064",
        "nameEn": "Retro Tree 064",
        "category": "trees",
        "file": "tree064.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "064"
        ]
    },
    {
        "id": "tree065",
        "nameRu": "Ретро дерево №065",
        "nameEn": "Retro Tree 065",
        "category": "trees",
        "file": "tree065.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "065"
        ]
    },
    {
        "id": "tree066",
        "nameRu": "Ретро дерево №066",
        "nameEn": "Retro Tree 066",
        "category": "trees",
        "file": "tree066.fbx",
        "defaultScale": 0.0339,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "066"
        ]
    },
    {
        "id": "tree067",
        "nameRu": "Ретро дерево №067",
        "nameEn": "Retro Tree 067",
        "category": "trees",
        "file": "tree067.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "067"
        ]
    },
    {
        "id": "tree068",
        "nameRu": "Ретро дерево №068",
        "nameEn": "Retro Tree 068",
        "category": "trees",
        "file": "tree068.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "068"
        ]
    },
    {
        "id": "tree069",
        "nameRu": "Ретро дерево №069",
        "nameEn": "Retro Tree 069",
        "category": "trees",
        "file": "tree069.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "069"
        ]
    },
    {
        "id": "tree070",
        "nameRu": "Ретро дерево №070",
        "nameEn": "Retro Tree 070",
        "category": "trees",
        "file": "tree070.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "070"
        ]
    },
    {
        "id": "tree071",
        "nameRu": "Ретро дерево №071",
        "nameEn": "Retro Tree 071",
        "category": "trees",
        "file": "tree071.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "071"
        ]
    },
    {
        "id": "tree072",
        "nameRu": "Ретро дерево №072",
        "nameEn": "Retro Tree 072",
        "category": "trees",
        "file": "tree072.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "072"
        ]
    },
    {
        "id": "tree073",
        "nameRu": "Ретро дерево №073",
        "nameEn": "Retro Tree 073",
        "category": "trees",
        "file": "tree073.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "073"
        ]
    },
    {
        "id": "tree074",
        "nameRu": "Ретро дерево №074",
        "nameEn": "Retro Tree 074",
        "category": "trees",
        "file": "tree074.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "074"
        ]
    },
    {
        "id": "tree075",
        "nameRu": "Ретро дерево №075",
        "nameEn": "Retro Tree 075",
        "category": "trees",
        "file": "tree075.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "075"
        ]
    },
    {
        "id": "tree076",
        "nameRu": "Ретро дерево №076",
        "nameEn": "Retro Tree 076",
        "category": "trees",
        "file": "tree076.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "076"
        ]
    },
    {
        "id": "tree077",
        "nameRu": "Ретро дерево №077",
        "nameEn": "Retro Tree 077",
        "category": "trees",
        "file": "tree077.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "077"
        ]
    },
    {
        "id": "tree078",
        "nameRu": "Ретро дерево №078",
        "nameEn": "Retro Tree 078",
        "category": "trees",
        "file": "tree078.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "078"
        ]
    },
    {
        "id": "tree079",
        "nameRu": "Ретро дерево №079",
        "nameEn": "Retro Tree 079",
        "category": "trees",
        "file": "tree079.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "079"
        ]
    },
    {
        "id": "tree080",
        "nameRu": "Ретро дерево №080",
        "nameEn": "Retro Tree 080",
        "category": "trees",
        "file": "tree080.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "080"
        ]
    },
    {
        "id": "tree081",
        "nameRu": "Ретро дерево №081",
        "nameEn": "Retro Tree 081",
        "category": "trees",
        "file": "tree081.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "081"
        ]
    },
    {
        "id": "tree082",
        "nameRu": "Ретро дерево №082",
        "nameEn": "Retro Tree 082",
        "category": "trees",
        "file": "tree082.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "082"
        ]
    },
    {
        "id": "tree083",
        "nameRu": "Ретро дерево №083",
        "nameEn": "Retro Tree 083",
        "category": "trees",
        "file": "tree083.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "083"
        ]
    },
    {
        "id": "tree084",
        "nameRu": "Ретро дерево №084",
        "nameEn": "Retro Tree 084",
        "category": "trees",
        "file": "tree084.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "084"
        ]
    },
    {
        "id": "tree085",
        "nameRu": "Ретро дерево №085",
        "nameEn": "Retro Tree 085",
        "category": "trees",
        "file": "tree085.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "085"
        ]
    },
    {
        "id": "tree086",
        "nameRu": "Ретро дерево №086",
        "nameEn": "Retro Tree 086",
        "category": "trees",
        "file": "tree086.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "086"
        ]
    },
    {
        "id": "tree087",
        "nameRu": "Ретро дерево №087",
        "nameEn": "Retro Tree 087",
        "category": "trees",
        "file": "tree087.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "087"
        ]
    },
    {
        "id": "tree088",
        "nameRu": "Ретро дерево №088",
        "nameEn": "Retro Tree 088",
        "category": "trees",
        "file": "tree088.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "088"
        ]
    },
    {
        "id": "tree089",
        "nameRu": "Ретро дерево №089",
        "nameEn": "Retro Tree 089",
        "category": "trees",
        "file": "tree089.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "089"
        ]
    },
    {
        "id": "tree090",
        "nameRu": "Ретро дерево №090",
        "nameEn": "Retro Tree 090",
        "category": "trees",
        "file": "tree090.fbx",
        "defaultScale": 0.0366,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "090"
        ]
    },
    {
        "id": "tree091",
        "nameRu": "Ретро дерево №091",
        "nameEn": "Retro Tree 091",
        "category": "trees",
        "file": "tree091.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "091"
        ]
    },
    {
        "id": "tree092",
        "nameRu": "Ретро дерево №092",
        "nameEn": "Retro Tree 092",
        "category": "trees",
        "file": "tree092.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "092"
        ]
    },
    {
        "id": "tree093",
        "nameRu": "Ретро дерево №093",
        "nameEn": "Retro Tree 093",
        "category": "trees",
        "file": "tree093.fbx",
        "defaultScale": 0.0507,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "093"
        ]
    },
    {
        "id": "tree094",
        "nameRu": "Ретро дерево №094",
        "nameEn": "Retro Tree 094",
        "category": "trees",
        "file": "tree094.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "094"
        ]
    },
    {
        "id": "tree095",
        "nameRu": "Ретро дерево №095",
        "nameEn": "Retro Tree 095",
        "category": "trees",
        "file": "tree095.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "095"
        ]
    },
    {
        "id": "tree096",
        "nameRu": "Ретро дерево №096",
        "nameEn": "Retro Tree 096",
        "category": "trees",
        "file": "tree096.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "096"
        ]
    },
    {
        "id": "tree097",
        "nameRu": "Ретро дерево №097",
        "nameEn": "Retro Tree 097",
        "category": "trees",
        "file": "tree097.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "097"
        ]
    },
    {
        "id": "tree098",
        "nameRu": "Ретро дерево №098",
        "nameEn": "Retro Tree 098",
        "category": "trees",
        "file": "tree098.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "098"
        ]
    },
    {
        "id": "tree099",
        "nameRu": "Ретро дерево №099",
        "nameEn": "Retro Tree 099",
        "category": "trees",
        "file": "tree099.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "099"
        ]
    },
    {
        "id": "tree100",
        "nameRu": "Ретро дерево №100",
        "nameEn": "Retro Tree 100",
        "category": "trees",
        "file": "tree100.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "100"
        ]
    },
    {
        "id": "tree101",
        "nameRu": "Ретро дерево №101",
        "nameEn": "Retro Tree 101",
        "category": "trees",
        "file": "tree101.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "101"
        ]
    },
    {
        "id": "tree102",
        "nameRu": "Ретро дерево №102",
        "nameEn": "Retro Tree 102",
        "category": "trees",
        "file": "tree102.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "102"
        ]
    },
    {
        "id": "tree103",
        "nameRu": "Ретро дерево №103",
        "nameEn": "Retro Tree 103",
        "category": "trees",
        "file": "tree103.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "103"
        ]
    },
    {
        "id": "tree104",
        "nameRu": "Ретро дерево №104",
        "nameEn": "Retro Tree 104",
        "category": "trees",
        "file": "tree104.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "104"
        ]
    },
    {
        "id": "tree105",
        "nameRu": "Ретро дерево №105",
        "nameEn": "Retro Tree 105",
        "category": "trees",
        "file": "tree105.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "105"
        ]
    },
    {
        "id": "tree106",
        "nameRu": "Ретро дерево №106",
        "nameEn": "Retro Tree 106",
        "category": "trees",
        "file": "tree106.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "106"
        ]
    },
    {
        "id": "tree107",
        "nameRu": "Ретро дерево №107",
        "nameEn": "Retro Tree 107",
        "category": "trees",
        "file": "tree107.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "107"
        ]
    },
    {
        "id": "tree108",
        "nameRu": "Ретро дерево №108",
        "nameEn": "Retro Tree 108",
        "category": "trees",
        "file": "tree108.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "108"
        ]
    },
    {
        "id": "tree109",
        "nameRu": "Ретро дерево №109",
        "nameEn": "Retro Tree 109",
        "category": "trees",
        "file": "tree109.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "109"
        ]
    },
    {
        "id": "tree110",
        "nameRu": "Ретро дерево №110",
        "nameEn": "Retro Tree 110",
        "category": "trees",
        "file": "tree110.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "110"
        ]
    },
    {
        "id": "tree111",
        "nameRu": "Ретро дерево №111",
        "nameEn": "Retro Tree 111",
        "category": "trees",
        "file": "tree111.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "111"
        ]
    },
    {
        "id": "tree112",
        "nameRu": "Ретро дерево №112",
        "nameEn": "Retro Tree 112",
        "category": "trees",
        "file": "tree112.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "112"
        ]
    },
    {
        "id": "tree113",
        "nameRu": "Ретро дерево №113",
        "nameEn": "Retro Tree 113",
        "category": "trees",
        "file": "tree113.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "113"
        ]
    },
    {
        "id": "tree114",
        "nameRu": "Ретро дерево №114",
        "nameEn": "Retro Tree 114",
        "category": "trees",
        "file": "tree114.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "114"
        ]
    },
    {
        "id": "tree115",
        "nameRu": "Ретро дерево №115",
        "nameEn": "Retro Tree 115",
        "category": "trees",
        "file": "tree115.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "115"
        ]
    },
    {
        "id": "tree116",
        "nameRu": "Ретро дерево №116",
        "nameEn": "Retro Tree 116",
        "category": "trees",
        "file": "tree116.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "116"
        ]
    },
    {
        "id": "tree117",
        "nameRu": "Ретро дерево №117",
        "nameEn": "Retro Tree 117",
        "category": "trees",
        "file": "tree117.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "117"
        ]
    },
    {
        "id": "tree118",
        "nameRu": "Ретро дерево №118",
        "nameEn": "Retro Tree 118",
        "category": "trees",
        "file": "tree118.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "118"
        ]
    },
    {
        "id": "tree119",
        "nameRu": "Ретро дерево №119",
        "nameEn": "Retro Tree 119",
        "category": "trees",
        "file": "tree119.fbx",
        "defaultScale": 0.0425,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "119"
        ]
    },
    {
        "id": "tree120",
        "nameRu": "Ретро дерево №120",
        "nameEn": "Retro Tree 120",
        "category": "trees",
        "file": "tree120.fbx",
        "defaultScale": 0.0426,
        "estimatedHeight": 17.0,
        "tags": [
            "дерево",
            "tree",
            "лес",
            "forest",
            "ретро",
            "retro",
            "ultimate",
            "120"
        ]
    }
,

    // ------------------------------------------------------------
    // 0. ДЕРЕВЬЯ, КУСТЫ И РАСТЕНИЯ (Trees & Foliage)
    // ------------------------------------------------------------
    {
      id: 'bush01',
      nameRu: 'Кустарник №1',
      nameEn: 'Foliage Bush 01',
      category: 'bushes',
      file: 'bush01.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "01"]
    },
    {
      id: 'bush02',
      nameRu: 'Кустарник №2',
      nameEn: 'Foliage Bush 02',
      category: 'bushes',
      file: 'bush02.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "02"]
    },
    {
      id: 'bush03',
      nameRu: 'Кустарник №3',
      nameEn: 'Foliage Bush 03',
      category: 'bushes',
      file: 'bush03.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "03"]
    },
    {
      id: 'bush04',
      nameRu: 'Кустарник №4',
      nameEn: 'Foliage Bush 04',
      category: 'bushes',
      file: 'bush04.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "04"]
    },
    {
      id: 'bush05',
      nameRu: 'Кустарник №5',
      nameEn: 'Foliage Bush 05',
      category: 'bushes',
      file: 'bush05.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "05"]
    },
    {
      id: 'bush06',
      nameRu: 'Кустарник №6',
      nameEn: 'Foliage Bush 06',
      category: 'bushes',
      file: 'bush06.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "06"]
    },
    {
      id: 'bush07',
      nameRu: 'Кустарник №7',
      nameEn: 'Foliage Bush 07',
      category: 'bushes',
      file: 'bush07.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "07"]
    },
    {
      id: 'bush08',
      nameRu: 'Кустарник №8',
      nameEn: 'Foliage Bush 08',
      category: 'bushes',
      file: 'bush08.fbx',
      "defaultScale": 0.3733,
        "estimatedHeight": 2.8,
      tags: ["куст", "bush", "трава", "растение", "зелень", "plant", "foliage", "shrub", "08"]
    },
    {
      id: 'dead_tree_rt_1',
      nameRu: 'Мертвое древо №1',
      nameEn: 'Dead Tree RT 1',
      category: 'dead_trees',
      file: 'dead_tree_rt_1.fbx',
      "defaultScale": 2.2796,
        "estimatedHeight": 15.0,
      tags: ["мертвое", "сухое", "коряга", "dead tree", "дерево", "ствол", "01"]
    },
    {
      id: 'dead_tree_rt_2',
      nameRu: 'Мертвое древо №2',
      nameEn: 'Dead Tree RT 2',
      category: 'dead_trees',
      file: 'dead_tree_rt_2.fbx',
      "defaultScale": 4.2722,
        "estimatedHeight": 13.5,
      tags: ["мертвое", "сухое", "коряга", "dead tree", "дерево", "ствол", "02"]
    },
    {
      id: 'small_tree_rt_1',
      nameRu: 'Молодое деревце RT',
      nameEn: 'Small Tree RT 1',
      category: 'trees',
      file: 'small_tree_rt_1.fbx',
      "defaultScale": 4.7541,
        "estimatedHeight": 5.8,
      tags: ["дерево", "маленькое", "молодое", "tree", "small tree", "росток"]
    },
    {
      id: 'tree01',
      nameRu: 'Дерево лесное №1',
      nameEn: 'Forest Tree 01',
      category: 'trees',
      file: 'tree01.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "01"]
    },
    {
      id: 'tree02',
      nameRu: 'Дерево лесное №2',
      nameEn: 'Forest Tree 02',
      category: 'trees',
      file: 'tree02.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "02"]
    },
    {
      id: 'tree03',
      nameRu: 'Дерево лесное №3',
      nameEn: 'Forest Tree 03',
      category: 'trees',
      file: 'tree03.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "03"]
    },
    {
      id: 'tree04',
      nameRu: 'Дерево лесное №4',
      nameEn: 'Forest Tree 04',
      category: 'trees',
      file: 'tree04.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "04"]
    },
    {
      id: 'tree05',
      nameRu: 'Дерево лесное №5',
      nameEn: 'Forest Tree 05',
      category: 'trees',
      file: 'tree05.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "05"]
    },
    {
      id: 'tree06',
      nameRu: 'Дерево лесное №6',
      nameEn: 'Forest Tree 06',
      category: 'trees',
      file: 'tree06.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "06"]
    },
    {
      id: 'tree07',
      nameRu: 'Дерево лесное №7',
      nameEn: 'Forest Tree 07',
      category: 'trees',
      file: 'tree07.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "07"]
    },
    {
      id: 'tree08',
      nameRu: 'Дерево лесное №8',
      nameEn: 'Forest Tree 08',
      category: 'trees',
      file: 'tree08.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "08"]
    },
    {
      id: 'tree09',
      nameRu: 'Дерево лесное №9',
      nameEn: 'Forest Tree 09',
      category: 'trees',
      file: 'tree09.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "09"]
    },
    {
      id: 'tree10',
      nameRu: 'Дерево лесное №10',
      nameEn: 'Forest Tree 10',
      category: 'trees',
      file: 'tree10.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "10"]
    },
    {
      id: 'tree11',
      nameRu: 'Дерево лесное №11',
      nameEn: 'Forest Tree 11',
      category: 'trees',
      file: 'tree11.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "11"]
    },
    {
      id: 'tree12',
      nameRu: 'Дерево лесное №12',
      nameEn: 'Forest Tree 12',
      category: 'trees',
      file: 'tree12.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "12"]
    },
    {
      id: 'tree13',
      nameRu: 'Дерево лесное №13',
      nameEn: 'Forest Tree 13',
      category: 'trees',
      file: 'tree13.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "13"]
    },
    {
      id: 'tree14',
      nameRu: 'Дерево лесное №14',
      nameEn: 'Forest Tree 14',
      category: 'trees',
      file: 'tree14.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "14"]
    },
    {
      id: 'tree15',
      nameRu: 'Дерево лесное №15',
      nameEn: 'Forest Tree 15',
      category: 'trees',
      file: 'tree15.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "15"]
    },
    {
      id: 'tree16',
      nameRu: 'Дерево лесное №16',
      nameEn: 'Forest Tree 16',
      category: 'trees',
      file: 'tree16.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "16"]
    },
    {
      id: 'tree17',
      nameRu: 'Дерево лесное №17',
      nameEn: 'Forest Tree 17',
      category: 'trees',
      file: 'tree17.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "17"]
    },
    {
      id: 'tree18',
      nameRu: 'Дерево лесное №18',
      nameEn: 'Forest Tree 18',
      category: 'trees',
      file: 'tree18.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "18"]
    },
    {
      id: 'tree19',
      nameRu: 'Дерево лесное №19',
      nameEn: 'Forest Tree 19',
      category: 'trees',
      file: 'tree19.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "19"]
    },
    {
      id: 'tree20',
      nameRu: 'Дерево лесное №20',
      nameEn: 'Forest Tree 20',
      category: 'trees',
      file: 'tree20.fbx',
      "defaultScale": 1.3077,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "20"]
    },
    {
      id: 'tree21',
      nameRu: 'Дерево лесное №21',
      nameEn: 'Forest Tree 21',
      category: 'trees',
      file: 'tree21.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "21"]
    },
    {
      id: 'tree22',
      nameRu: 'Дерево лесное №22',
      nameEn: 'Forest Tree 22',
      category: 'trees',
      file: 'tree22.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "22"]
    },
    {
      id: 'tree23',
      nameRu: 'Дерево лесное №23',
      nameEn: 'Forest Tree 23',
      category: 'trees',
      file: 'tree23.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "23"]
    },
    {
      id: 'tree24',
      nameRu: 'Дерево лесное №24',
      nameEn: 'Forest Tree 24',
      category: 'trees',
      file: 'tree24.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "24"]
    },
    {
      id: 'tree25',
      nameRu: 'Дерево лесное №25',
      nameEn: 'Forest Tree 25',
      category: 'trees',
      file: 'tree25.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "25"]
    },
    {
      id: 'tree26',
      nameRu: 'Дерево лесное №26',
      nameEn: 'Forest Tree 26',
      category: 'trees',
      file: 'tree26.fbx',
      "defaultScale": 1.223,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "26"]
    },
    {
      id: 'tree27',
      nameRu: 'Дерево лесное №27',
      nameEn: 'Forest Tree 27',
      category: 'trees',
      file: 'tree27.fbx',
      "defaultScale": 1.8889,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "27"]
    },
    {
      id: 'tree28',
      nameRu: 'Дерево лесное №28',
      nameEn: 'Forest Tree 28',
      category: 'trees',
      file: 'tree28.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "28"]
    },
    {
      id: 'tree29',
      nameRu: 'Дерево лесное №29',
      nameEn: 'Forest Tree 29',
      category: 'trees',
      file: 'tree29.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "29"]
    },
    {
      id: 'tree30',
      nameRu: 'Дерево лесное №30',
      nameEn: 'Forest Tree 30',
      category: 'trees',
      file: 'tree30.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "30"]
    },
    {
      id: 'tree31',
      nameRu: 'Дерево лесное №31',
      nameEn: 'Forest Tree 31',
      category: 'trees',
      file: 'tree31.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "31"]
    },
    {
      id: 'tree32',
      nameRu: 'Дерево лесное №32',
      nameEn: 'Forest Tree 32',
      category: 'trees',
      file: 'tree32.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "32"]
    },
    {
      id: 'tree33',
      nameRu: 'Дерево лесное №33',
      nameEn: 'Forest Tree 33',
      category: 'trees',
      file: 'tree33.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "33"]
    },
    {
      id: 'tree34',
      nameRu: 'Дерево лесное №34',
      nameEn: 'Forest Tree 34',
      category: 'trees',
      file: 'tree34.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "34"]
    },
    {
      id: 'tree35',
      nameRu: 'Дерево лесное №35',
      nameEn: 'Forest Tree 35',
      category: 'trees',
      file: 'tree35.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "35"]
    },
    {
      id: 'tree36',
      nameRu: 'Дерево лесное №36',
      nameEn: 'Forest Tree 36',
      category: 'trees',
      file: 'tree36.fbx',
      "defaultScale": 1.36,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "лес", "forest", "дуб", "сосна", "эльфийское", "nature", "листва", "36"]
    },
    {
      id: 'tree_rt_1',
      nameRu: 'Реликтовое древо RT 1',
      nameEn: 'Relic Tree RT 1',
      category: 'trees',
      file: 'tree_rt_1.fbx',
      "defaultScale": 7.3661,
        "estimatedHeight": 16.5,
      tags: ["дерево", "tree", "реликтовое", "вековое", "дуб", "эльфийское", "гигант", "relic", "nature"]
    },
    {
      id: 'tree_rt_2',
      nameRu: 'Реликтовое древо RT 2',
      nameEn: 'Relic Tree RT 2',
      category: 'trees',
      file: 'tree_rt_2.fbx',
      "defaultScale": 3.5642,
        "estimatedHeight": 17.5,
      tags: ["дерево", "tree", "реликтовое", "вековое", "дуб", "эльфийское", "гигант", "relic", "nature"]
    },
    {
      id: 'tree_rt_2_1',
      nameRu: 'Реликтовое древо RT 2 (вар. 2)',
      nameEn: 'Relic Tree RT 2 Variant',
      category: 'trees',
      file: 'tree_rt_2_1.fbx',
      "defaultScale": 3.4585,
        "estimatedHeight": 17.5,
      tags: ["дерево", "tree", "реликтовое", "вековое", "дуб", "эльфийское", "гигант", "relic", "nature"]
    },
    {
      id: 'tree_rt_3',
      nameRu: 'Реликтовое древо RT 3',
      nameEn: 'Relic Tree RT 3',
      category: 'trees',
      file: 'tree_rt_3.fbx',
      "defaultScale": 4.3257,
        "estimatedHeight": 17.0,
      tags: ["дерево", "tree", "реликтовое", "вековое", "дуб", "эльфийское", "гигант", "relic", "nature"]
    },
    {
      id: 'tree_rt_4',
      nameRu: 'Реликтовое древо RT 4 (Гигант)',
      nameEn: 'Relic Tree RT 4 Giant',
      category: 'trees',
      file: 'tree_rt_4.fbx',
      "defaultScale": 3.5072,
        "estimatedHeight": 19.5,
      tags: ["дерево", "tree", "реликтовое", "вековое", "дуб", "эльфийское", "гигант", "relic", "nature"]
    },

    // ------------------------------------------------------------
    // 1. АРХИТЕКТУРА И ПОСТРОЙКИ (Buildings & Props)
    // ------------------------------------------------------------
    // 1. ЖИЛЫЕ ДОМА (Houses)
    // ------------------------------------------------------------
    {
      id: 'house_01',
      nameRu: 'Жилой дом №1',
      nameEn: 'Residential House 01',
      category: 'houses',
      file: 'house_01.fbx',
      "defaultScale": 0.0866,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', 'cottage', '01']
    },
    {
      id: 'house_02',
      nameRu: 'Жилой дом №2',
      nameEn: 'Residential House 02',
      category: 'houses',
      file: 'house_02.fbx',
      "defaultScale": 0.0929,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '02']
    },
    {
      id: 'house_03',
      nameRu: 'Жилой дом №3',
      nameEn: 'Residential House 03',
      category: 'houses',
      file: 'house_03.fbx',
      "defaultScale": 0.08,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '03']
    },
    {
      id: 'house_04',
      nameRu: 'Жилой дом №4',
      nameEn: 'Residential House 04',
      category: 'houses',
      file: 'house_04.fbx',
      "defaultScale": 0.0803,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '04']
    },
    {
      id: 'house_05',
      nameRu: 'Жилой дом №5',
      nameEn: 'Residential House 05',
      category: 'houses',
      file: 'house_05.fbx',
      "defaultScale": 0.08,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '05']
    },
    {
      id: 'house_06',
      nameRu: 'Жилой дом №6',
      nameEn: 'Residential House 06',
      category: 'houses',
      file: 'house_06.fbx',
      "defaultScale": 0.08,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '06']
    },
    {
      id: 'house_07',
      nameRu: 'Жилой дом №7',
      nameEn: 'Residential House 07',
      category: 'houses',
      file: 'house_07.fbx',
      "defaultScale": 0.1888,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '07']
    },
    {
      id: 'house_08',
      nameRu: 'Жилой дом №8',
      nameEn: 'Residential House 08',
      category: 'houses',
      file: 'house_08.fbx',
      "defaultScale": 0.0927,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '08']
    },
    {
      id: 'house_09',
      nameRu: 'Жилой дом №9',
      nameEn: 'Residential House 09',
      category: 'houses',
      file: 'house_09.fbx',
      "defaultScale": 0.0945,
        "estimatedHeight": 8.0,
      tags: ['дом', 'house', 'жилье', 'деревня', 'village', '09']
    },

    // ------------------------------------------------------------
    // 2. ДОМА ИНЖЕНЕРОВ (Engineer Houses)
    // ------------------------------------------------------------
    {
      id: 'house_engineer_01',
      nameRu: 'Дом инженера №1',
      nameEn: 'Engineer House 01',
      category: 'engineer_houses',
      file: 'house_engineer_01.fbx',
      "defaultScale": 0.0942,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '01']
    },
    {
      id: 'house_engineer_02',
      nameRu: 'Дом инженера №2',
      nameEn: 'Engineer House 02',
      category: 'engineer_houses',
      file: 'house_engineer_02.fbx',
      "defaultScale": 0.085,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '02']
    },
    {
      id: 'house_engineer_03',
      nameRu: 'Дом инженера №3',
      nameEn: 'Engineer House 03',
      category: 'engineer_houses',
      file: 'house_engineer_03.fbx',
      "defaultScale": 0.1573,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '03']
    },
    {
      id: 'house_engineer_04',
      nameRu: 'Дом инженера №4',
      nameEn: 'Engineer House 04',
      category: 'engineer_houses',
      file: 'house_engineer_04.fbx',
      "defaultScale": 0.1241,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '04']
    },
    {
      id: 'house_engineer_05',
      nameRu: 'Дом инженера №5',
      nameEn: 'Engineer House 05',
      category: 'engineer_houses',
      file: 'house_engineer_05.fbx',
      "defaultScale": 0.1183,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '05']
    },
    {
      id: 'house_engineer_06',
      nameRu: 'Дом инженера №6',
      nameEn: 'Engineer House 06',
      category: 'engineer_houses',
      file: 'house_engineer_06.fbx',
      "defaultScale": 0.1085,
        "estimatedHeight": 8.5,
      tags: ['инженер', 'engineer', 'стимпанк', 'дом', 'house', '06']
    },

    // ------------------------------------------------------------
    // 3. КУЗНИЦЫ (Forges)
    // ------------------------------------------------------------
    {
      id: 'forge_01',
      nameRu: 'Кузница №1',
      nameEn: 'Smithy & Forge 01',
      category: 'forges',
      file: 'forge_01.fbx',
      "defaultScale": 0.1018,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '01']
    },
    {
      id: 'forge_02',
      nameRu: 'Кузница №2',
      nameEn: 'Smithy & Forge 02',
      category: 'forges',
      file: 'forge_02.fbx',
      "defaultScale": 0.1073,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '02']
    },
    {
      id: 'forge_03',
      nameRu: 'Кузница №3',
      nameEn: 'Smithy & Forge 03',
      category: 'forges',
      file: 'forge_03.fbx',
      "defaultScale": 0.0901,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '03']
    },
    {
      id: 'forge_04',
      nameRu: 'Кузница №4',
      nameEn: 'Smithy & Forge 04',
      category: 'forges',
      file: 'forge_04.fbx',
      "defaultScale": 0.1257,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '04']
    },
    {
      id: 'forge_05',
      nameRu: 'Кузница №5',
      nameEn: 'Smithy & Forge 05',
      category: 'forges',
      file: 'forge_05.fbx',
      "defaultScale": 0.1002,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '05']
    },
    {
      id: 'forge_06',
      nameRu: 'Кузница №6',
      nameEn: 'Smithy & Forge 06',
      category: 'forges',
      file: 'forge_06.fbx',
      "defaultScale": 0.08,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '06']
    },
    {
      id: 'forge_07',
      nameRu: 'Кузница №7',
      nameEn: 'Smithy & Forge 07',
      category: 'forges',
      file: 'forge_07.fbx',
      "defaultScale": 0.08,
        "estimatedHeight": 8.0,
      tags: ['кузня', 'forge', 'smithy', 'наковальня', 'мастерская', '07']
    },

    // ------------------------------------------------------------
    // 4. МАГАЗИНЫ И ЛАВКИ (Shops & Stalls)
    // ------------------------------------------------------------
    {
      id: 'grocery_shop',
      nameRu: 'Бакалея / Магазин магии',
      nameEn: 'Grocery & Magic Shop',
      category: 'shops_stalls',
      file: 'grocery_shop.fbx',
      "defaultScale": 0.0878,
        "estimatedHeight": 6.5,
      tags: ['магазин', 'shop', 'гросери', 'бакалея', 'зелья', 'торговля']
    },
    {
      id: 'grocery_shop_large',
      nameRu: 'Большая бакалея (Grocery)',
      nameEn: 'Grand Grocery Shop',
      category: 'shops_stalls',
      file: 'grocery_shop_large.fbx',
      "defaultScale": 0.4712,
        "estimatedHeight": 9.0,
      tags: ['магазин', 'shop', 'гросери', 'бакалея', 'большой']
    },
    {
      id: 'warrior_shop_large',
      nameRu: 'Оружейная лавка воинов',
      nameEn: 'Warrior Weapon Shop',
      category: 'shops_stalls',
      file: 'warrior_shop_large.fbx',
      "defaultScale": 0.5165,
        "estimatedHeight": 8.5,
      tags: ['оружие', 'warrior', 'shop', 'арсенал', 'лавка', 'броня']
    },
    {
      id: 'market_stall_01',
      nameRu: 'Торговая лавка №1',
      nameEn: 'Market Stall 01',
      category: 'shops_stalls',
      file: 'market_stall_01.fbx',
      "defaultScale": 0.0458,
        "estimatedHeight": 3.5,
      tags: ['лавка', 'stall', 'рынок', 'market', 'прилавок', '01']
    },
    {
      id: 'market_stall_02',
      nameRu: 'Торговая лавка №2',
      nameEn: 'Market Stall 02',
      category: 'shops_stalls',
      file: 'market_stall_02.fbx',
      "defaultScale": 0.035,
        "estimatedHeight": 3.5,
      tags: ['лавка', 'stall', 'рынок', 'market', 'прилавок', '02']
    },
    {
      id: 'market_stall_03',
      nameRu: 'Торговая лавка №3',
      nameEn: 'Market Stall 03',
      category: 'shops_stalls',
      file: 'market_stall_03.fbx',
      "defaultScale": 0.0379,
        "estimatedHeight": 3.5,
      tags: ['лавка', 'stall', 'рынок', 'market', 'прилавок', '03']
    },
    {
      id: 'market_stall_04',
      nameRu: 'Торговая лавка №4',
      nameEn: 'Market Stall 04',
      category: 'shops_stalls',
      file: 'market_stall_04.fbx',
      "defaultScale": 0.0404,
        "estimatedHeight": 3.5,
      tags: ['лавка', 'stall', 'рынок', 'market', 'прилавок', '04']
    },

    // ------------------------------------------------------------
    // 5. СКЛАДЫ (Warehouses)
    // ------------------------------------------------------------
    {
      id: 'warehouse_01',
      nameRu: 'Складской ангар №1',
      nameEn: 'Warehouse 01',
      category: 'warehouses',
      file: 'warehouse_01.fbx',
      "defaultScale": 0.1127,
        "estimatedHeight": 7.5,
      tags: ['склад', 'warehouse', 'хранилище', 'storage', '01']
    },
    {
      id: 'warehouse_03',
      nameRu: 'Складской ангар №3',
      nameEn: 'Warehouse 03',
      category: 'warehouses',
      file: 'warehouse_03.fbx',
      "defaultScale": 0.1889,
        "estimatedHeight": 7.5,
      tags: ['склад', 'warehouse', 'хранилище', 'storage', '03']
    },
    {
      id: 'warehouse_04',
      nameRu: 'Складской ангар №4',
      nameEn: 'Warehouse 04',
      category: 'warehouses',
      file: 'warehouse_04.fbx',
      "defaultScale": 0.1365,
        "estimatedHeight": 7.5,
      tags: ['склад', 'warehouse', 'хранилище', 'storage', '04']
    },
    {
      id: 'warehouse_05',
      nameRu: 'Складской ангар №5',
      nameEn: 'Warehouse 05',
      category: 'warehouses',
      file: 'warehouse_05.fbx',
      "defaultScale": 0.0867,
        "estimatedHeight": 7.5,
      tags: ['склад', 'warehouse', 'хранилище', 'storage', '05']
    },
    {
      id: 'warehouse_06',
      nameRu: 'Складской ангар №6',
      nameEn: 'Warehouse 06',
      category: 'warehouses',
      file: 'warehouse_06.fbx',
      "defaultScale": 0.0873,
        "estimatedHeight": 7.5,
      tags: ['склад', 'warehouse', 'хранилище', 'storage', '06']
    },

    // ------------------------------------------------------------
    // 6. ПАЛАТКИ (Tents)
    // ------------------------------------------------------------
    {
      id: 'tent_01',
      nameRu: 'Палатка №1',
      nameEn: 'Camp Tent 01',
      category: 'tents',
      file: 'tent_01.fbx',
      "defaultScale": 0.0498,
        "estimatedHeight": 3.0,
      tags: ['палатка', 'tent', 'лагерь', 'навес', 'тент', '01']
    },
    {
      id: 'tent_02',
      nameRu: 'Палатка №2',
      nameEn: 'Camp Tent 02',
      category: 'tents',
      file: 'tent_02.fbx',
      "defaultScale": 0.0449,
        "estimatedHeight": 3.0,
      tags: ['палатка', 'tent', 'лагерь', 'навес', 'тент', '02']
    },
    {
      id: 'tent_03',
      nameRu: 'Палатка №3',
      nameEn: 'Camp Tent 03',
      category: 'tents',
      file: 'tent_03.fbx',
      "defaultScale": 0.0389,
        "estimatedHeight": 3.0,
      tags: ['палатка', 'tent', 'лагерь', 'навес', 'тент', '03']
    },
    {
      id: 'tent_04',
      nameRu: 'Палатка №4',
      nameEn: 'Camp Tent 04',
      category: 'tents',
      file: 'tent_04.fbx',
      "defaultScale": 0.031,
        "estimatedHeight": 3.0,
      tags: ['палатка', 'tent', 'лагерь', 'навес', 'тент', '04']
    },

    // ------------------------------------------------------------
    // 7. СТИМПАНК И ОБОРУДОВАНИЕ (Steampunk)
    // ------------------------------------------------------------
    {
      id: 'boiler',
      nameRu: 'Паровой котёл / Бойлер',
      nameEn: 'Steam Boiler Unit',
      category: 'steampunk',
      file: 'boiler.fbx',
      "defaultScale": 0.0653,
        "estimatedHeight": 6.5,
      tags: ['бойлер', 'boiler', 'стимпанк', 'пар', 'steam', 'котел', 'трубы']
    },
    {
      id: 'boiler_room',
      nameRu: 'Бойлерная станция',
      nameEn: 'Boiler Room Plant',
      category: 'steampunk',
      file: 'boiler_room.fbx',
      "defaultScale": 0.069,
        "estimatedHeight": 6.5,
      tags: ['бойлерная', 'boiler', 'завод', 'станция', 'стимпанк', 'энергия']
    },

    // ------------------------------------------------------------
    // 8. ТРАНСПОРТ И ИНФРАСТРУКТУРА (Transport)
    // ------------------------------------------------------------
    {
      id: 'airship',
      nameRu: 'Дирижабль (Цеппелин)',
      nameEn: 'Steampunk Airship',
      category: 'transport',
      file: 'airship.fbx',
      "defaultScale": 0.1347,
        "estimatedHeight": 12.0,
      tags: ['дирижабль', 'airship', 'корабль', 'полет', 'транспорт', 'стимпанк']
    },
    {
      id: 'airship_mooring_mast',
      nameRu: 'Причальная мачта дирижабля',
      nameEn: 'Airship Mooring Mast',
      category: 'transport',
      file: 'airship_mooring_mast.fbx',
      "defaultScale": 0.2401,
        "estimatedHeight": 24.0,
      tags: ['мачта', 'причал', 'mast', 'dock', 'дирижабль', 'вышка', 'маяк']
    },

    // ------------------------------------------------------------
    // 9. МОНУМЕНТЫ, ХРАМЫ И ЗОНЫ (Monuments)
    // ------------------------------------------------------------
    {
      id: 'monument_central',
      nameRu: 'Центральный монумент площади',
      nameEn: 'Plaza Central Monument',
      category: 'monuments',
      file: 'monument_central.fbx',
      "defaultScale": 0.1601,
        "estimatedHeight": 16.0,
      tags: ['монумент', 'monument', 'площадь', 'статуя', 'центр', 'фонтан']
    },
    {
      id: 'monument_wheel',
      nameRu: 'Монумент «Шестерня»',
      nameEn: 'Great Gear Monument',
      category: 'monuments',
      file: 'monument_wheel.fbx',
      "defaultScale": 0.1201,
        "estimatedHeight": 12.0,
      tags: ['колесо', 'шестерня', 'gear', 'монумент', 'стимпанк']
    },
    {
      id: 'chapel',
      nameRu: 'Часовня / Храм Эйнхасад',
      nameEn: 'Town Chapel',
      category: 'monuments',
      file: 'chapel.fbx',
      "defaultScale": 0.1807,
        "estimatedHeight": 18.0,
      tags: ['часовня', 'chapel', 'храм', 'церковь', 'church', 'святилище']
    },
    {
      id: 'tp_zone',
      nameRu: 'Платформа телепортации',
      nameEn: 'Teleport Pad Zone',
      category: 'monuments',
      file: 'tp_zone.fbx',
      "defaultScale": 0.008,
        "estimatedHeight": 0.8,
      tags: ['телепорт', 'tp', 'zone', 'портал', 'круг', 'руна']
    },
    {
      id: 'sh1',
      nameRu: 'Особое строение SH1',
      nameEn: 'Special Structure SH1',
      category: 'monuments',
      file: 'sh1.fbx',
      "defaultScale": 0.0881,
        "estimatedHeight": 8.0,
      tags: ['sh1', 'башня', 'строение', 'особое']
    },

    // ------------------------------------------------------------
    // MEDIEVAL MARKET (Средневековый рынок)
    // ------------------------------------------------------------
    {
      id: 'medieval_market',
      nameRu: 'Средневековый рынок',
      nameEn: 'Medieval Market',
      category: 'market',
      file: 'medieval_market.fbx',
      "defaultScale": 2.1014,
        "estimatedHeight": 7.5,
      tags: ['рынок', 'market', 'лавка', 'средневековый', 'торговля', 'палатка', 'medieval']
    },

    // ------------------------------------------------------------
    // PSX LARGE TERRAIN ROCKS (Камни и скалы)
    // ------------------------------------------------------------
    {
      id: 'SM_RP_Rock_2m_0',
      nameRu: 'Камень 2м №0',
      nameEn: 'Rock 2m #0',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_0.fbx',
      "defaultScale": 0.9259,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', 'скала', 'валун', 'boulder', '2m']
    },
    {
      id: 'SM_RP_Rock_2m_1',
      nameRu: 'Камень 2м №1',
      nameEn: 'Rock 2m #1',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_1.fbx',
      "defaultScale": 0.9398,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', 'скала', 'валун', '2m']
    },
    {
      id: 'SM_RP_Rock_2m_2',
      nameRu: 'Камень 2м №2',
      nameEn: 'Rock 2m #2',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_2.fbx',
      "defaultScale": 0.9398,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', 'скала', '2m']
    },
    {
      id: 'SM_RP_Rock_2m_3',
      nameRu: 'Камень 2м №3',
      nameEn: 'Rock 2m #3',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_3.fbx',
      "defaultScale": 0.8532,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', '2m']
    },
    {
      id: 'SM_RP_Rock_2m_4',
      nameRu: 'Камень 2м №4',
      nameEn: 'Rock 2m #4',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_4.fbx',
      "defaultScale": 0.8591,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', '2m']
    },
    {
      id: 'SM_RP_Rock_2m_5',
      nameRu: 'Камень 2м №5',
      nameEn: 'Rock 2m #5',
      category: 'rocks',
      file: 'SM_RP_Rock_2m_5.fbx',
      "defaultScale": 0.9124,
        "estimatedHeight": 2.5,
      tags: ['камень', 'rock', '2m']
    },
    {
      id: 'SM_RP_Rock_4m_0',
      nameRu: 'Скала 4м №0',
      nameEn: 'Rock 4m #0',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_0.fbx',
      "defaultScale": 1.0798,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', 'камень', '4m', 'большой']
    },
    {
      id: 'SM_RP_Rock_4m_1',
      nameRu: 'Скала 4м №1',
      nameEn: 'Rock 4m #1',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_1.fbx',
      "defaultScale": 1.1058,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_2',
      nameRu: 'Скала 4м №2',
      nameEn: 'Rock 4m #2',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_2.fbx',
      "defaultScale": 1.0624,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_3',
      nameRu: 'Скала 4м №3',
      nameEn: 'Rock 4m #3',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_3.fbx',
      "defaultScale": 0.9725,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_4',
      nameRu: 'Скала 4м №4',
      nameEn: 'Rock 4m #4',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_4.fbx',
      "defaultScale": 0.9524,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_5',
      nameRu: 'Скала 4м №5',
      nameEn: 'Rock 4m #5',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_5.fbx',
      "defaultScale": 1.02,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_6',
      nameRu: 'Скала 4м №6',
      nameEn: 'Rock 4m #6',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_6.fbx',
      "defaultScale": 1.0798,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_7',
      nameRu: 'Скала 4м №7',
      nameEn: 'Rock 4m #7',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_7.fbx',
      "defaultScale": 1.1031,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_8',
      nameRu: 'Скала 4м №8',
      nameEn: 'Rock 4m #8',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_8.fbx',
      "defaultScale": 1.0624,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_9',
      nameRu: 'Скала 4м №9',
      nameEn: 'Rock 4m #9',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_9.fbx',
      "defaultScale": 0.9705,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_10',
      nameRu: 'Скала 4м №10',
      nameEn: 'Rock 4m #10',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_10.fbx',
      "defaultScale": 0.9504,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_4m_11',
      nameRu: 'Скала 4м №11',
      nameEn: 'Rock 4m #11',
      category: 'rocks',
      file: 'SM_RP_Rock_4m_11.fbx',
      "defaultScale": 1.0177,
        "estimatedHeight": 4.6,
      tags: ['скала', 'rock', '4m']
    },
    {
      id: 'SM_RP_Rock_8m_0',
      nameRu: 'Глыба 8м №0',
      nameEn: 'Rock 8m #0',
      category: 'rocks',
      file: 'SM_RP_Rock_8m_0.fbx',
      "defaultScale": 0.9475,
        "estimatedHeight": 9.2,
      tags: ['глыба', 'rock', 'скала', '8m', 'огромный']
    },
    {
      id: 'SM_RP_Rock_8m_1',
      nameRu: 'Глыба 8м №1',
      nameEn: 'Rock 8m #1',
      category: 'rocks',
      file: 'SM_RP_Rock_8m_1.fbx',
      "defaultScale": 0.9664,
        "estimatedHeight": 9.2,
      tags: ['глыба', 'rock', '8m']
    },
    {
      id: 'SM_RP_Rock_8m_3',
      nameRu: 'Глыба 8м №3',
      nameEn: 'Rock 8m #3',
      category: 'rocks',
      file: 'SM_RP_Rock_8m_3.fbx',
      "defaultScale": 0.8647,
        "estimatedHeight": 9.2,
      tags: ['глыба', 'rock', '8m']
    },
    {
      id: 'SM_RP_Rock_8m_4',
      nameRu: 'Глыба 8м №4',
      nameEn: 'Rock 8m #4',
      category: 'rocks',
      file: 'SM_RP_Rock_8m_4.fbx',
      "defaultScale": 0.859,
        "estimatedHeight": 9.2,
      tags: ['глыба', 'rock', '8m']
    },
    {
      id: 'SM_RP_Rock_8m_5',
      nameRu: 'Глыба 8м №5',
      nameEn: 'Rock 8m #5',
      category: 'rocks',
      file: 'SM_RP_Rock_8m_5.fbx',
      "defaultScale": 0.9163,
        "estimatedHeight": 9.2,
      tags: ['глыба', 'rock', '8m']
    },

    // ------------------------------------------------------------
    // FOREST MODEL PACK (Лесной декор)
    // ------------------------------------------------------------
    {
      id: 'BlueberryBush',
      nameRu: 'Черничный куст',
      nameEn: 'Blueberry Bush',
      category: 'bushes',
      file: 'BlueberryBush.fbx',
      "defaultScale": 2.3729,
        "estimatedHeight": 1.4,
      tags: ['куст', 'ягода', 'черника', 'blueberry', 'bush', 'лес', 'forest']
    },
    {
      id: 'BracketFungus',
      nameRu: 'Трутовик (гриб на дереве)',
      nameEn: 'Bracket Fungus',
      category: 'forest_decor',
      file: 'BracketFungus.fbx',
      "defaultScale": 5.625,
        "estimatedHeight": 0.45,
      tags: ['гриб', 'трутовик', 'fungus', 'mushroom', 'лес', 'forest']
    },
    {
      id: 'Fern',
      nameRu: 'Папоротник',
      nameEn: 'Fern',
      category: 'bushes',
      file: 'Fern.fbx',
      "defaultScale": 1.7647,
        "estimatedHeight": 1.5,
      tags: ['папоротник', 'fern', 'растение', 'лес', 'forest', 'трава']
    },
    {
      id: 'forest_Log_1',
      nameRu: 'Бревно №1',
      nameEn: 'Log #1',
      category: 'forest_decor',
      file: 'Log_1.fbx',
      "defaultScale": 3.3929,
        "estimatedHeight": 3.8,
      tags: ['бревно', 'log', 'дерево', 'лес', 'forest']
    },
    {
      id: 'forest_Log_2',
      nameRu: 'Бревно №2',
      nameEn: 'Log #2',
      category: 'forest_decor',
      file: 'Log_2.fbx',
      "defaultScale": 1.7925,
        "estimatedHeight": 3.8,
      tags: ['бревно', 'log', 'лес', 'forest']
    },
    {
      id: 'forest_Log_3',
      nameRu: 'Бревно №3',
      nameEn: 'Log #3',
      category: 'forest_decor',
      file: 'Log_3.fbx',
      "defaultScale": 3.2203,
        "estimatedHeight": 3.8,
      tags: ['бревно', 'log', 'лес', 'forest']
    },
    {
      id: 'forest_Log_4',
      nameRu: 'Бревно №4',
      nameEn: 'Log #4',
      category: 'forest_decor',
      file: 'Log_4.fbx',
      "defaultScale": 3.4545,
        "estimatedHeight": 1.0,
      tags: ['бревно', 'log', 'лес', 'forest']
    },
    {
      id: 'Mushroom',
      nameRu: 'Гриб',
      nameEn: 'Mushroom',
      category: 'forest_decor',
      file: 'Mushroom.fbx',
      "defaultScale": 4.0,
        "estimatedHeight": 0.6,
      tags: ['гриб', 'mushroom', 'лес', 'forest']
    },
    {
      id: 'PieceOfWood',
      nameRu: 'Обрубок дерева',
      nameEn: 'Piece of Wood',
      category: 'forest_decor',
      file: 'PieceOfWood.fbx',
      "defaultScale": 5.625,
        "estimatedHeight": 0.45,
      tags: ['дерево', 'обрубок', 'wood', 'лес', 'forest']
    },
    
    
    {
      id: 'Plank',
      nameRu: 'Доска',
      nameEn: 'Plank',
      category: 'forest_decor',
      file: 'Plank.fbx',
      "defaultScale": 0.2809,
        "estimatedHeight": 0.25,
      tags: ['доска', 'plank', 'дерево', 'wood', 'лес']
    },
    
    
    
    {
      id: 'StumpWithMushroom',
      nameRu: 'Пень с грибами',
      nameEn: 'Stump with Mushroom',
      category: 'forest_decor',
      file: 'StumpWithMushroom.fbx',
      "defaultScale": 1.8056,
        "estimatedHeight": 1.3,
      tags: ['пень', 'stump', 'гриб', 'mushroom', 'лес', 'forest']
    },
    {
      id: 'forest_Stump_1',
      nameRu: 'Пень №1',
      nameEn: 'Stump #1',
      category: 'forest_decor',
      file: 'Stump_1.fbx',
      "defaultScale": 4.5833,
        "estimatedHeight": 1.1,
      tags: ['пень', 'stump', 'лес', 'forest']
    },
    {
      id: 'forest_Stump_2',
      nameRu: 'Пень №2',
      nameEn: 'Stump #2',
      category: 'forest_decor',
      file: 'Stump_2.fbx',
      "defaultScale": 3.3333,
        "estimatedHeight": 1.1,
      tags: ['пень', 'stump', 'лес', 'forest']
    },
    {
      id: 'forest_Stump_3',
      nameRu: 'Пень №3',
      nameEn: 'Stump #3',
      category: 'forest_decor',
      file: 'Stump_3.fbx',
      "defaultScale": 4.5833,
        "estimatedHeight": 1.1,
      tags: ['пень', 'stump', 'лес', 'forest']
    },
    {
      id: 'forest_Stump_4',
      nameRu: 'Пень №4',
      nameEn: 'Stump #4',
      category: 'forest_decor',
      file: 'Stump_4.fbx',
      "defaultScale": 12.2222,
        "estimatedHeight": 1.1,
      tags: ['пень', 'stump', 'лес', 'forest']
    },
    {
          "id": "riiveayqx",
          "nameRu": "Бурдюк кожаный",
          "nameEn": "Leather Waterskin",
          "category": "bazaar",
          "file": "bazaar/riiveayqx.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.271,
                "y": 0.067,
                "z": 0.15
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "бурдюк",
                "кожа",
                "фляга",
                "waterskin",
                "leather",
                "riiveayqx"
          ]
    },
    {
          "id": "rlctbdhqx",
          "nameRu": "Каркас прилавка",
          "nameEn": "Wooden Stall Frame",
          "category": "bazaar",
          "file": "bazaar/rlctbdhqx.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 2.12,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 2.335,
                "y": 2.125,
                "z": 1.079
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "прилавок",
                "каркас",
                "палатка",
                "навес",
                "stall",
                "frame",
                "wood",
                "rlctbdhqx"
          ]
    },
    {
          "id": "tgmsdc0fa",
          "nameRu": "Деревянный брус",
          "nameEn": "Timber Beam Post",
          "category": "bazaar",
          "file": "bazaar/tgmsdc0fa.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 2.5,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.237,
                "y": 2.503,
                "z": 0.23
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "брус",
                "столб",
                "дерево",
                "beam",
                "post",
                "timber",
                "tgmsdc0fa"
          ]
    },
    {
          "id": "tltvai3fa",
          "nameRu": "Деревянная бочка (базар)",
          "nameEn": "Wooden Barrel",
          "category": "bazaar",
          "file": "bazaar/tltvai3fa.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.82,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.586,
                "y": 0.82,
                "z": 0.583
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "бочка",
                "дерево",
                "barrel",
                "wood",
                "tltvai3fa"
          ]
    },
    {
          "id": "tlwlachjw",
          "nameRu": "Головка чеснока",
          "nameEn": "Garlic Bulb",
          "category": "bazaar",
          "file": "bazaar/tlwlachjw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.06,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.07,
                "y": 0.06,
                "z": 0.07
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "чеснок",
                "овощи",
                "еда",
                "garlic",
                "vegetable",
                "food",
                "tlwlachjw"
          ]
    },
    {
          "id": "tlzleaihw",
          "nameRu": "Зубчик чеснока",
          "nameEn": "Garlic Clove",
          "category": "bazaar",
          "file": "bazaar/tlzleaihw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.02,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.038,
                "y": 0.02,
                "z": 0.029
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "чеснок",
                "долька",
                "овощи",
                "еда",
                "garlic",
                "clove",
                "food",
                "tlzleaihw"
          ]
    },
    {
          "id": "ueihbhefa",
          "nameRu": "Плетёный кувшин-корзина",
          "nameEn": "Woven Basket Jar",
          "category": "bazaar",
          "file": "bazaar/ueihbhefa.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.43,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.426,
                "y": 0.431,
                "z": 0.347
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "корзина",
                "кувшин",
                "плетёный",
                "basket",
                "jar",
                "woven",
                "ueihbhefa"
          ]
    },
    {
          "id": "ueqfdi0ga",
          "nameRu": "Длинная деревянная жердь",
          "nameEn": "Long Wooden Pole",
          "category": "bazaar",
          "file": "bazaar/ueqfdi0ga.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.18,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.22,
                "y": 0.177,
                "z": 4.715
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "жердь",
                "балка",
                "навес",
                "дерево",
                "pole",
                "wood",
                "ueqfdi0ga"
          ]
    },
    {
          "id": "ukqpfhsaw",
          "nameRu": "Низкая плетёная корзина",
          "nameEn": "Low Woven Basket",
          "category": "bazaar",
          "file": "bazaar/ukqpfhsaw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.301,
                "y": 0.11,
                "z": 0.293
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "корзина",
                "миска",
                "плетёная",
                "basket",
                "woven",
                "ukqpfhsaw"
          ]
    },
    {
          "id": "vd4kbcljw",
          "nameRu": "Огурец зелёный",
          "nameEn": "Green Cucumber",
          "category": "bazaar",
          "file": "bazaar/vd4kbcljw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.05,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.23,
                "y": 0.049,
                "z": 0.066
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "огурец",
                "овощи",
                "еда",
                "cucumber",
                "vegetable",
                "food",
                "vd4kbcljw"
          ]
    },
    {
          "id": "vdsicd0jw",
          "nameRu": "Кабачок цуккини",
          "nameEn": "Zucchini Squash",
          "category": "bazaar",
          "file": "bazaar/vdsicd0jw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.05,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.216,
                "y": 0.05,
                "z": 0.049
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "кабачок",
                "цуккини",
                "овощи",
                "еда",
                "zucchini",
                "vegetable",
                "food",
                "vdsicd0jw"
          ]
    },
    {
          "id": "veujfawjw",
          "nameRu": "Корень пастернака",
          "nameEn": "Parsnip Root",
          "category": "bazaar",
          "file": "bazaar/veujfawjw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.03,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.19,
                "y": 0.029,
                "z": 0.046
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "пастернак",
                "корень",
                "овощи",
                "еда",
                "parsnip",
                "root",
                "food",
                "veujfawjw"
          ]
    },
    {
          "id": "vewlad1iw",
          "nameRu": "Айва / жёлтый плод",
          "nameEn": "Quince Fruit",
          "category": "bazaar",
          "file": "bazaar/vewlad1iw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.08,
                "y": 0.075,
                "z": 0.074
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "айва",
                "фрукт",
                "плод",
                "еда",
                "quince",
                "fruit",
                "food",
                "vewlad1iw"
          ]
    },
    {
          "id": "vfvjccaqx",
          "nameRu": "Резная курильница-фонарь",
          "nameEn": "Ornate Incense Lantern",
          "category": "bazaar",
          "file": "bazaar/vfvjccaqx.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.28,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.249,
                "y": 0.281,
                "z": 0.243
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "фонарь",
                "курильница",
                "бронза",
                "декор",
                "lantern",
                "incense",
                "vfvjccaqx"
          ]
    },
    {
          "id": "vhnmbdcs",
          "nameRu": "Бухта толстой верёвки",
          "nameEn": "Thick Rope Coil",
          "category": "bazaar",
          "file": "bazaar/vhnmbdcs.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.13,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.389,
                "y": 0.128,
                "z": 0.287
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "верёвка",
                "канат",
                "бухта",
                "rope",
                "coil",
                "vhnmbdcs"
          ]
    },
    {
          "id": "vhnofbds",
          "nameRu": "Моток тонкой верёвки",
          "nameEn": "Thin Rope Loop",
          "category": "bazaar",
          "file": "bazaar/vhnofbds.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.04,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.162,
                "y": 0.042,
                "z": 0.839
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "верёвка",
                "моток",
                "бечёвка",
                "rope",
                "cord",
                "vhnofbds"
          ]
    },
    {
          "id": "vlrjcdc",
          "nameRu": "Деревянная миска-лоток",
          "nameEn": "Wooden Tray Bowl",
          "category": "bazaar",
          "file": "bazaar/vlrjcdc.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.255,
                "y": 0.07,
                "z": 0.255
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "миска",
                "лоток",
                "посуда",
                "дерево",
                "bowl",
                "tray",
                "wood",
                "vlrjcdc"
          ]
    },
    {
          "id": "wldidao",
          "nameRu": "Прессованный красный блок",
          "nameEn": "Pressed Spice Brick",
          "category": "bazaar",
          "file": "bazaar/wldidao.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.12,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.185,
                "y": 0.118,
                "z": 0.184
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "брусок",
                "кирпич",
                "чай",
                "специи",
                "brick",
                "block",
                "wldidao"
          ]
    },
    {
          "id": "wldjacu",
          "nameRu": "Деревянные носилки с лотком",
          "nameEn": "Wooden Carrying Litter",
          "category": "bazaar",
          "file": "bazaar/wldjacu.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.57,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.121,
                "y": 0.567,
                "z": 0.708
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "носилки",
                "лоток",
                "ящик",
                "дерево",
                "litter",
                "crate",
                "wood",
                "wldjacu"
          ]
    },
    {
          "id": "wlkiecl",
          "nameRu": "Деревянный короб квадратный",
          "nameEn": "Square Wooden Crate",
          "category": "bazaar",
          "file": "bazaar/wlkiecl.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.41,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.408,
                "y": 0.405,
                "z": 0.41
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "короб",
                "ящик",
                "дерево",
                "crate",
                "box",
                "wood",
                "wlkiecl"
          ]
    },
    {
          "id": "wmfiaaldw",
          "nameRu": "Арка входная глинобитная",
          "nameEn": "Clay Archway Facade",
          "category": "bazaar",
          "file": "bazaar/wmfiaaldw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 4.25,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 4.001,
                "y": 4.251,
                "z": 1.975
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "арка",
                "дверь",
                "стена",
                "фасад",
                "дом",
                "archway",
                "wall",
                "door",
                "wmfiaaldw"
          ]
    },
    {
          "id": "xcondhk",
          "nameRu": "Сундук с заклёпками",
          "nameEn": "Studded Wooden Chest",
          "category": "bazaar",
          "file": "bazaar/xcondhk.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.37,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.489,
                "y": 0.374,
                "z": 0.324
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "сундук",
                "ящик",
                "дерево",
                "chest",
                "wood",
                "xcondhk"
          ]
    },
    {
          "id": "xcxodhv",
          "nameRu": "Мешок высокий узкий",
          "nameEn": "Tall Narrow Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xcxodhv.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.71,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.349,
                "y": 0.711,
                "z": 0.242
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "зерно",
                "товар",
                "sack",
                "bag",
                "burlap",
                "xcxodhv"
          ]
    },
    {
          "id": "xcxodjn",
          "nameRu": "Мешок завязанный высокий",
          "nameEn": "Tall Tied Grain Sack",
          "category": "bazaar",
          "file": "bazaar/xcxodjn.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.73,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.328,
                "y": 0.73,
                "z": 0.24
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "зерно",
                "завязанный",
                "sack",
                "bag",
                "grain",
                "xcxodjn"
          ]
    },
    {
          "id": "xcxoead",
          "nameRu": "Мешок средний открытый",
          "nameEn": "Medium Open Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xcxoead.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.46,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.334,
                "y": 0.461,
                "z": 0.233
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "открытый",
                "sack",
                "bag",
                "burlap",
                "xcxoead"
          ]
    },
    {
          "id": "xcxoec2",
          "nameRu": "Мешок приземистый закатаный",
          "nameEn": "Rolled Open Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xcxoec2.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.35,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.356,
                "y": 0.348,
                "z": 0.245
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "открытый",
                "sack",
                "bag",
                "xcxoec2"
          ]
    },
    {
          "id": "xcxoed3",
          "nameRu": "Мешок низкий открытый",
          "nameEn": "Low Open Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xcxoed3.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.29,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.331,
                "y": 0.29,
                "z": 0.241
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "низкий",
                "открытый",
                "sack",
                "bag",
                "xcxoed3"
          ]
    },
    {
          "id": "xcxoeek",
          "nameRu": "Широкий мешок открытый",
          "nameEn": "Wide Open Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xcxoeek.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.45,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.681,
                "y": 0.445,
                "z": 0.49
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "широкий",
                "sack",
                "bag",
                "xcxoeek"
          ]
    },
    {
          "id": "xcylcc0",
          "nameRu": "Расписная терракотовая тарелка",
          "nameEn": "Painted Terracotta Plate",
          "category": "bazaar",
          "file": "bazaar/xcylcc0.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.267,
                "y": 0.066,
                "z": 0.268
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "тарелка",
                "керамика",
                "узор",
                "посуда",
                "plate",
                "terracotta",
                "xcylcc0"
          ]
    },
    {
          "id": "xd0pbbt",
          "nameRu": "Сине-белая керамическая тарелка",
          "nameEn": "Blue Ceramic Plate",
          "category": "bazaar",
          "file": "bazaar/xd0pbbt.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.251,
                "y": 0.065,
                "z": 0.258
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "тарелка",
                "керамика",
                "синяя",
                "узор",
                "посуда",
                "plate",
                "ceramic",
                "xd0pbbt"
          ]
    },
    {
          "id": "xdggege",
          "nameRu": "Деревянная скамья длинная",
          "nameEn": "Long Wooden Bench",
          "category": "bazaar",
          "file": "bazaar/xdggege.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.69,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 2.535,
                "y": 0.688,
                "z": 0.661
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "скамья",
                "лавка",
                "мебель",
                "дерево",
                "bench",
                "wood",
                "xdggege"
          ]
    },
    {
          "id": "xdghefg",
          "nameRu": "Стол-прилавок с полками",
          "nameEn": "Wooden Merchant Table",
          "category": "bazaar",
          "file": "bazaar/xdghefg.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.79,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.25,
                "y": 0.79,
                "z": 0.822
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "стол",
                "прилавок",
                "полки",
                "мебель",
                "дерево",
                "table",
                "merchant",
                "xdghefg"
          ]
    },
    {
          "id": "xdgjfjk",
          "nameRu": "Мешок пузатый завязанный",
          "nameEn": "Plump Tied Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xdgjfjk.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.71,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.502,
                "y": 0.708,
                "z": 0.396
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "завязанный",
                "sack",
                "bag",
                "xdgjfjk"
          ]
    },
    {
          "id": "xdhhddo",
          "nameRu": "Поклажа под тканью",
          "nameEn": "Draped Cargo Pile",
          "category": "bazaar",
          "file": "bazaar/xdhhddo.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 1.63,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.989,
                "y": 1.634,
                "z": 1.785
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "поклажа",
                "груз",
                "тюк",
                "ткань",
                "cargo",
                "pile",
                "xdhhddo"
          ]
    },
    {
          "id": "xdhhdfp",
          "nameRu": "Деревянный настил-поддон",
          "nameEn": "Low Wooden Pallet Deck",
          "category": "bazaar",
          "file": "bazaar/xdhhdfp.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.48,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.896,
                "y": 0.479,
                "z": 0.904
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "настил",
                "поддон",
                "подиум",
                "дерево",
                "pallet",
                "deck",
                "wood",
                "xdhhdfp"
          ]
    },
    {
          "id": "xdhlbde",
          "nameRu": "Мешок тёмный завязанный",
          "nameEn": "Dark Tied Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xdhlbde.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.77,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.513,
                "y": 0.765,
                "z": 0.386
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "тёмный",
                "sack",
                "bag",
                "xdhlbde"
          ]
    },
    {
          "id": "xdhlbij",
          "nameRu": "Мешок светлый завязанный",
          "nameEn": "Light Tied Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xdhlbij.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.54,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.441,
                "y": 0.535,
                "z": 0.323
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "светлый",
                "sack",
                "bag",
                "xdhlbij"
          ]
    },
    {
          "id": "xdhlccu",
          "nameRu": "Большой мешок с мукой",
          "nameEn": "Large Open Flour Sack",
          "category": "bazaar",
          "file": "bazaar/xdhlccu.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.9,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.68,
                "y": 0.898,
                "z": 0.538
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "мука",
                "крупа",
                "большой",
                "sack",
                "flour",
                "xdhlccu"
          ]
    },
    {
          "id": "xdhlcfc",
          "nameRu": "Мешок полный с белой мукой",
          "nameEn": "Full Flour Sack",
          "category": "bazaar",
          "file": "bazaar/xdhlcfc.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.64,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.59,
                "y": 0.641,
                "z": 0.405
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "мука",
                "еда",
                "sack",
                "flour",
                "xdhlcfc"
          ]
    },
    {
          "id": "xdjhbig",
          "nameRu": "Узкий высокий мешок завязанный",
          "nameEn": "Slim Tied Burlap Sack",
          "category": "bazaar",
          "file": "bazaar/xdjhbig.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.7,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.354,
                "y": 0.699,
                "z": 0.247
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "высокий",
                "sack",
                "bag",
                "xdjhbig"
          ]
    },
    {
          "id": "xdjkbcy",
          "nameRu": "Средний мешок с крупой",
          "nameEn": "Medium Grain Sack",
          "category": "bazaar",
          "file": "bazaar/xdjkbcy.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.43,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.35,
                "y": 0.428,
                "z": 0.249
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "крупа",
                "мука",
                "sack",
                "grain",
                "xdjkbcy"
          ]
    },
    {
          "id": "xdjladd",
          "nameRu": "Широкий мешок с мукой",
          "nameEn": "Wide Open Flour Sack",
          "category": "bazaar",
          "file": "bazaar/xdjladd.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.3,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.572,
                "y": 0.305,
                "z": 0.425
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "широкий",
                "мука",
                "sack",
                "flour",
                "xdjladd"
          ]
    },
    {
          "id": "xdjldi0",
          "nameRu": "Приземистый мешок с мукой",
          "nameEn": "Low Wide Flour Sack",
          "category": "bazaar",
          "file": "bazaar/xdjldi0.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.25,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.497,
                "y": 0.252,
                "z": 0.339
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "мука",
                "низкий",
                "sack",
                "flour",
                "xdjldi0"
          ]
    },
    {
          "id": "xdjlfbl",
          "nameRu": "Малый мешочек открытый",
          "nameEn": "Small Open Flour Sack",
          "category": "bazaar",
          "file": "bazaar/xdjlfbl.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.26,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.33,
                "y": 0.257,
                "z": 0.251
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "малый",
                "мука",
                "sack",
                "flour",
                "xdjlfbl"
          ]
    },
    {
          "id": "xdjlfcw",
          "nameRu": "Средний мешок открытый",
          "nameEn": "Medium Full Sack",
          "category": "bazaar",
          "file": "bazaar/xdjlfcw.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.46,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.499,
                "y": 0.461,
                "z": 0.39
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "открытый",
                "полный",
                "sack",
                "bag",
                "xdjlfcw"
          ]
    },
    {
          "id": "xdjlfdx",
          "nameRu": "Светлый высокий открытый мешок",
          "nameEn": "Tall Light Open Sack",
          "category": "bazaar",
          "file": "bazaar/xdjlfdx.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.49,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.422,
                "y": 0.489,
                "z": 0.327
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "светлый",
                "открытый",
                "sack",
                "bag",
                "xdjlfdx"
          ]
    },
    {
          "id": "xdjmdc1",
          "nameRu": "Объёмный мешок с крупой",
          "nameEn": "Large Bulky Grain Sack",
          "category": "bazaar",
          "file": "bazaar/xdjmdc1.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.62,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.678,
                "y": 0.619,
                "z": 0.542
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешок",
                "крупа",
                "большой",
                "sack",
                "grain",
                "xdjmdc1"
          ]
    },
    {
          "id": "xdwjafm",
          "nameRu": "Малая плетёная корзинка",
          "nameEn": "Small Woven Basket",
          "category": "bazaar",
          "file": "bazaar/xdwjafm.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.08,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.133,
                "y": 0.078,
                "z": 0.131
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "корзинка",
                "корзина",
                "малая",
                "basket",
                "woven",
                "xdwjafm"
          ]
    },
    {
          "id": "xdwkajr",
          "nameRu": "Расписная чаша-пиала",
          "nameEn": "Ornate Terracotta Bowl",
          "category": "bazaar",
          "file": "bazaar/xdwkajr.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.218,
                "y": 0.075,
                "z": 0.222
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "пиала",
                "чаша",
                "керамика",
                "узор",
                "посуда",
                "bowl",
                "xdwkajr"
          ]
    },
    {
          "id": "xdwkber",
          "nameRu": "Восточный ковёр средний",
          "nameEn": "Woven Oriental Rug",
          "category": "bazaar",
          "file": "bazaar/xdwkber.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.05,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.643,
                "y": 0.046,
                "z": 0.957
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ковёр",
                "ткань",
                "узор",
                "rug",
                "carpet",
                "xdwkber"
          ]
    },
    {
          "id": "xdwkbin",
          "nameRu": "Деревянный лоток с узором",
          "nameEn": "Decorative Wooden Tray",
          "category": "bazaar",
          "file": "bazaar/xdwkbin.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.05,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.2,
                "y": 0.054,
                "z": 0.113
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "лоток",
                "поднос",
                "узор",
                "дерево",
                "tray",
                "box",
                "xdwkbin"
          ]
    },
    {
          "id": "xdwlcar",
          "nameRu": "Свёрнутый коричневый ковёр",
          "nameEn": "Rolled Brown Rug",
          "category": "bazaar",
          "file": "bazaar/xdwlcar.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.1,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.847,
                "y": 0.099,
                "z": 0.114
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ковёр",
                "рулон",
                "ткань",
                "rug",
                "rolled",
                "xdwlcar"
          ]
    },
    {
          "id": "xdyibgr",
          "nameRu": "Бордовый восточный коврик",
          "nameEn": "Small Ornate Carpet",
          "category": "bazaar",
          "file": "bazaar/xdyibgr.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.02,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.055,
                "y": 0.016,
                "z": 0.76
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ковёр",
                "коврик",
                "бордовый",
                "узор",
                "carpet",
                "rug",
                "xdyibgr"
          ]
    },
    {
          "id": "xdyjaex",
          "nameRu": "Свёрнутый светлый холст",
          "nameEn": "Rolled Light Cloth",
          "category": "bazaar",
          "file": "bazaar/xdyjaex.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.1,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.002,
                "y": 0.095,
                "z": 0.105
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "рулон",
                "холст",
                "ткань",
                "ковёр",
                "cloth",
                "rolled",
                "xdyjaex"
          ]
    },
    {
          "id": "xehlfh1",
          "nameRu": "Восточная лепёшка лаваш",
          "nameEn": "Baked Flatbread",
          "category": "bazaar",
          "file": "bazaar/xehlfh1.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.03,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.262,
                "y": 0.027,
                "z": 0.257
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "хлеб",
                "лепёшка",
                "лаваш",
                "выпечка",
                "еда",
                "bread",
                "flatbread",
                "food",
                "xehlfh1"
          ]
    },
    {
          "id": "xelkaan",
          "nameRu": "Миска с горкой муки",
          "nameEn": "Terracotta Bowl of Flour",
          "category": "bazaar",
          "file": "bazaar/xelkaan.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.158,
                "y": 0.065,
                "z": 0.158
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "миска",
                "мука",
                "тесто",
                "еда",
                "bowl",
                "flour",
                "food",
                "xelkaan"
          ]
    },
    {
          "id": "xelvejo",
          "nameRu": "Плетёный квадратный лоток",
          "nameEn": "Square Wicker Tray",
          "category": "bazaar",
          "file": "bazaar/xelvejo.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.15,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.353,
                "y": 0.147,
                "z": 0.309
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "лоток",
                "корзина",
                "поднос",
                "wicker",
                "tray",
                "basket",
                "xelvejo"
          ]
    },
    {
          "id": "xemiagp",
          "nameRu": "Тонкая белая лепёшка",
          "nameEn": "Thin White Flatbread",
          "category": "bazaar",
          "file": "bazaar/xemiagp.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.02,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.12,
                "y": 0.014,
                "z": 0.105
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "лепёшка",
                "хлеб",
                "пита",
                "еда",
                "flatbread",
                "bread",
                "food",
                "xemiagp"
          ]
    },
    {
          "id": "xemmcdc",
          "nameRu": "Малая горка паприки",
          "nameEn": "Small Orange Spice Pile",
          "category": "bazaar",
          "file": "bazaar/xemmcdc.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.243,
                "y": 0.109,
                "z": 0.251
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "паприка",
                "приправа",
                "еда",
                "spice",
                "paprika",
                "food",
                "xemmcdc"
          ]
    },
    {
          "id": "xemmcdz",
          "nameRu": "Большая горка паприки",
          "nameEn": "Large Paprika Spice Mound",
          "category": "bazaar",
          "file": "bazaar/xemmcdz.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.14,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.318,
                "y": 0.135,
                "z": 0.317
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "паприка",
                "приправа",
                "еда",
                "spice",
                "paprika",
                "food",
                "xemmcdz"
          ]
    },
    {
          "id": "xemnbiu",
          "nameRu": "Терракотовая глубокая миска",
          "nameEn": "Terracotta Deep Bowl",
          "category": "bazaar",
          "file": "bazaar/xemnbiu.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.26,
                "y": 0.072,
                "z": 0.262
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "миска",
                "глина",
                "терракота",
                "посуда",
                "bowl",
                "terracotta",
                "xemnbiu"
          ]
    },
    {
          "id": "xesjeay",
          "nameRu": "Горка золотистой куркумы",
          "nameEn": "Turmeric Spice Pile",
          "category": "bazaar",
          "file": "bazaar/xesjeay.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.09,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.185,
                "y": 0.09,
                "z": 0.183
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "куркума",
                "шафран",
                "еда",
                "spice",
                "turmeric",
                "food",
                "xesjeay"
          ]
    },
    {
          "id": "xetncfm",
          "nameRu": "Россыпь белого риса",
          "nameEn": "Scattered White Grain Pile",
          "category": "bazaar",
          "file": "bazaar/xetncfm.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.08,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.35,
                "y": 0.078,
                "z": 0.354
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "рис",
                "кунжут",
                "крупа",
                "зерно",
                "еда",
                "grain",
                "rice",
                "food",
                "xetncfm"
          ]
    },
    {
          "id": "xetodbs",
          "nameRu": "Плоская кучка специй",
          "nameEn": "Flat Terracotta Spice Pile",
          "category": "bazaar",
          "file": "bazaar/xetodbs.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.05,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.25,
                "y": 0.054,
                "z": 0.249
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "приправа",
                "горка",
                "еда",
                "spice",
                "food",
                "xetodbs"
          ]
    },
    {
          "id": "xf0kahv",
          "nameRu": "Стопка мешков (4 шт.)",
          "nameEn": "Stacked Burlap Sacks (4)",
          "category": "bazaar",
          "file": "bazaar/xf0kahv.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.78,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.856,
                "y": 0.776,
                "z": 0.765
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешки",
                "стопка",
                "штабель",
                "товар",
                "sacks",
                "stack",
                "xf0kahv"
          ]
    },
    {
          "id": "xfelabr",
          "nameRu": "Длинная изогнутая жердь",
          "nameEn": "Long Wooden Log Pole",
          "category": "bazaar",
          "file": "bazaar/xfelabr.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 3.18,
                "y": 0.11,
                "z": 0.155
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "жердь",
                "бревно",
                "навес",
                "дерево",
                "pole",
                "log",
                "xfelabr"
          ]
    },
    {
          "id": "xfihaa0",
          "nameRu": "Балка навеса средняя",
          "nameEn": "Canopy Wooden Pole",
          "category": "bazaar",
          "file": "bazaar/xfihaa0.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 2.633,
                "y": 0.112,
                "z": 0.143
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "балка",
                "жердь",
                "навес",
                "дерево",
                "pole",
                "beam",
                "xfihaa0"
          ]
    },
    {
          "id": "xfihcfn",
          "nameRu": "Длинная балка навеса",
          "nameEn": "Long Canopy Pole",
          "category": "bazaar",
          "file": "bazaar/xfihcfn.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 3.036,
                "y": 0.114,
                "z": 0.147
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "балка",
                "жердь",
                "навес",
                "дерево",
                "pole",
                "canopy",
                "xfihcfn"
          ]
    },
    {
          "id": "xfiheex",
          "nameRu": "Короткая перекладина",
          "nameEn": "Short Wooden Pole",
          "category": "bazaar",
          "file": "bazaar/xfiheex.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.08,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.254,
                "y": 0.079,
                "z": 0.077
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "жердь",
                "палка",
                "перекладина",
                "дерево",
                "pole",
                "wood",
                "xfiheex"
          ]
    },
    {
          "id": "xfpkdfc",
          "nameRu": "Горка чёрного перца",
          "nameEn": "Dark Peppercorn Pile",
          "category": "bazaar",
          "file": "bazaar/xfpkdfc.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.1,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.249,
                "y": 0.098,
                "z": 0.256
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "перец",
                "кофе",
                "зёрна",
                "еда",
                "spice",
                "pepper",
                "food",
                "xfpkdfc"
          ]
    },
    {
          "id": "xfpkdhe",
          "nameRu": "Горка орехов и нута",
          "nameEn": "Chickpea & Nut Mound",
          "category": "bazaar",
          "file": "bazaar/xfpkdhe.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.18,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.361,
                "y": 0.18,
                "z": 0.372
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "орехи",
                "нут",
                "горох",
                "еда",
                "nuts",
                "chickpea",
                "food",
                "xfpkdhe"
          ]
    },
    {
          "id": "xfthfgf",
          "nameRu": "Подушка восточная узорчатая",
          "nameEn": "Embroidered Cushion Pillow",
          "category": "bazaar",
          "file": "bazaar/xfthfgf.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.15,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.395,
                "y": 0.154,
                "z": 0.388
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "подушка",
                "текстиль",
                "узор",
                "cushion",
                "pillow",
                "xfthfgf"
          ]
    },
    {
          "id": "xftjbbv",
          "nameRu": "Бамбуковая циновка",
          "nameEn": "Bamboo Mat Tray",
          "category": "bazaar",
          "file": "bazaar/xftjbbv.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.14,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.571,
                "y": 0.135,
                "z": 0.421
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "циновка",
                "бамбук",
                "лоток",
                "bamboo",
                "mat",
                "tray",
                "xftjbbv"
          ]
    },
    {
          "id": "xfxfeao",
          "nameRu": "Маленький мешочек специй",
          "nameEn": "Tiny Spice Pouch",
          "category": "bazaar",
          "file": "bazaar/xfxfeao.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.07,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.082,
                "y": 0.067,
                "z": 0.09
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешочек",
                "специи",
                "кисет",
                "pouch",
                "spice",
                "xfxfeao"
          ]
    },
    {
          "id": "xfxibbe",
          "nameRu": "Высокая стопка мешков (6 шт.)",
          "nameEn": "Tall Stack of Sacks (6)",
          "category": "bazaar",
          "file": "bazaar/xfxibbe.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.94,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.89,
                "y": 0.937,
                "z": 0.499
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "мешки",
                "стопка",
                "штабель",
                "товар",
                "sacks",
                "stack",
                "xfxibbe"
          ]
    },
    {
          "id": "xhllfcq",
          "nameRu": "Светлый кувшинчик с ручкой",
          "nameEn": "White Ceramic Pitcher",
          "category": "bazaar",
          "file": "bazaar/xhllfcq.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.15,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.172,
                "y": 0.154,
                "z": 0.138
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "кувшин",
                "керамика",
                "сосуд",
                "посуда",
                "pitcher",
                "jug",
                "xhllfcq"
          ]
    },
    {
          "id": "xhllfjb",
          "nameRu": "Терракотовая амфора малая",
          "nameEn": "Small Terracotta Amphora",
          "category": "bazaar",
          "file": "bazaar/xhllfjb.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.23,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.192,
                "y": 0.227,
                "z": 0.166
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "амфора",
                "кувшин",
                "глина",
                "сосуд",
                "посуда",
                "amphora",
                "jug",
                "xhllfjb"
          ]
    },
    {
          "id": "xhtobeb",
          "nameRu": "Высокий глиняный сосуд",
          "nameEn": "Tall Clay Jar",
          "category": "bazaar",
          "file": "bazaar/xhtobeb.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.26,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.163,
                "y": 0.264,
                "z": 0.164
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "кувшин",
                "сосуд",
                "глина",
                "банка",
                "jar",
                "clay",
                "xhtobeb"
          ]
    },
    {
          "id": "xihlde1",
          "nameRu": "Горка сушёных ягод и чили",
          "nameEn": "Crushed Chili & Berry Mound",
          "category": "bazaar",
          "file": "bazaar/xihlde1.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.1,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.263,
                "y": 0.102,
                "z": 0.264
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "чили",
                "ягоды",
                "барбарис",
                "еда",
                "spice",
                "chili",
                "food",
                "xihlde1"
          ]
    },
    {
          "id": "xiihday",
          "nameRu": "Горка молотого кориандра",
          "nameEn": "Ground Coriander Pile",
          "category": "bazaar",
          "file": "bazaar/xiihday.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.11,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.296,
                "y": 0.112,
                "z": 0.298
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "кориандр",
                "приправа",
                "еда",
                "spice",
                "coriander",
                "food",
                "xiihday"
          ]
    },
    {
          "id": "xiiiajn",
          "nameRu": "Горка молотого тмина",
          "nameEn": "Ground Cumin Pile",
          "category": "bazaar",
          "file": "bazaar/xiiiajn.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.12,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.287,
                "y": 0.121,
                "z": 0.284
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "специи",
                "тмин",
                "зира",
                "приправа",
                "еда",
                "spice",
                "cumin",
                "food",
                "xiiiajn"
          ]
    },
    {
          "id": "xj0kbig",
          "nameRu": "Свисающая зелёная ткань",
          "nameEn": "Hanging Green Drapery",
          "category": "bazaar",
          "file": "bazaar/xj0kbig.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 1.51,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.522,
                "y": 1.511,
                "z": 0.118
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ткань",
                "полог",
                "штора",
                "драпировка",
                "зелёная",
                "drapery",
                "cloth",
                "xj0kbig"
          ]
    },
    {
          "id": "xj1iehq",
          "nameRu": "Смятая зелёная ткань",
          "nameEn": "Crumpled Green Cloth",
          "category": "bazaar",
          "file": "bazaar/xj1iehq.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.17,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.675,
                "y": 0.166,
                "z": 0.639
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ткань",
                "тряпка",
                "зелёная",
                "cloth",
                "fabric",
                "xj1iehq"
          ]
    },
    {
          "id": "xkjoadyqx",
          "nameRu": "Расписная чаша с крышкой",
          "nameEn": "Ornate Lidded Pot",
          "category": "bazaar",
          "file": "bazaar/xkjoadyqx.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.14,
          "collision": false,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.201,
                "y": 0.135,
                "z": 0.204
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "шкатулка",
                "горшок",
                "крышка",
                "керамика",
                "посуда",
                "pot",
                "lidded",
                "xkjoadyqx"
          ]
    },
    {
          "id": "yccqdcq",
          "nameRu": "Деревянный закрытый ящик",
          "nameEn": "Closed Wooden Crate",
          "category": "bazaar",
          "file": "bazaar/yccqdcq.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.33,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 0.713,
                "y": 0.326,
                "z": 0.45
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ящик",
                "дерево",
                "груз",
                "crate",
                "box",
                "wood",
                "yccqdcq"
          ]
    },
    {
          "id": "yexjfhk",
          "nameRu": "Длинный реечный ящик",
          "nameEn": "Long Slatted Crate",
          "category": "bazaar",
          "file": "bazaar/yexjfhk.glb",
          "format": "glb",
          "defaultScale": 1.0,
          "estimatedHeight": 0.31,
          "collision": true,
          "collisionShape": "box",
          "collisionSize": {
                "x": 1.305,
                "y": 0.311,
                "z": 0.689
          },
          "tags": [
                "базар",
                "bazaar",
                "восток",
                "рынок",
                "glb",
                "ящик",
                "реечный",
                "поддон",
                "дерево",
                "crate",
                "slatted",
                "wood",
                "yexjfhk"
          ]
    },
    // Территория операторов: кит руин, Бастион с интерьером, Монумент Героя и CC0 пропсы лагеря.
    // Коллизии для многосоставных зданий (opt_bastion, opt_arch) ставит scripts/operators-territory/layout.js.
    {
      "id": "opt_bastion",
      "nameRu": "Бастион операторов",
      "nameEn": "Operators Bastion",
      "category": "ruins",
      "file": "operators/opt_bastion.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 31.37,
      "instanced": true,
      "distClass": "building",
      "drawDist": 1000,
      "lodDist": [
        110,
        280
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_bastion",
        "бастион операторов",
        "operators bastion"
      ]
    },
    {
      "id": "opt_plaza_deck",
      "nameRu": "Терраса каменной площади",
      "nameEn": "Flagstone Terrace Deck",
      "category": "ruins",
      "file": "operators/opt_plaza_deck.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.826,
      "instanced": true,
      "distClass": "building",
      "drawDist": 560,
      "lodDist": [
        80,
        200
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_plaza_deck",
        "терраса каменной площади",
        "flagstone terrace deck"
      ]
    },
    {
      "id": "opt_plaza_deck_cracked",
      "nameRu": "Треснувшая плита площади",
      "nameEn": "Cracked Plaza Terrace Deck",
      "category": "ruins",
      "file": "operators/opt_plaza_deck_cracked.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.8,
      "instanced": true,
      "distClass": "building",
      "drawDist": 560,
      "lodDist": [
        80,
        200
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_plaza_deck_cracked",
        "треснувшая плита площади",
        "cracked plaza terrace deck"
      ]
    },
    {
      "id": "opt_plaza_deck_edge",
      "nameRu": "Обрушенный край площади",
      "nameEn": "Broken Plaza Terrace Edge",
      "category": "ruins",
      "file": "operators/opt_plaza_deck_edge.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.8,
      "instanced": true,
      "distClass": "building",
      "drawDist": 560,
      "lodDist": [
        80,
        200
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_plaza_deck_edge",
        "обрушенный край площади",
        "broken plaza terrace edge"
      ]
    },
    {
      "id": "opt_plaza_steps",
      "nameRu": "Лестница каменной площади",
      "nameEn": "Plaza Grand Steps",
      "category": "ruins",
      "file": "operators/opt_plaza_steps.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.35,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 460,
      "lodDist": [
        70,
        170
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_plaza_steps",
        "лестница каменной площади",
        "plaza grand steps"
      ]
    },
    {
      "id": "opt_gate_steps",
      "nameRu": "Входная лестница ворот",
      "nameEn": "Gate Approach Steps",
      "category": "ruins",
      "file": "operators/opt_gate_steps.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.75,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 460,
      "lodDist": [
        70,
        170
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_gate_steps",
        "входная лестница ворот",
        "gate approach steps"
      ]
    },
    {
      "id": "opt_bastion_parapet",
      "nameRu": "Крепостной парапет",
      "nameEn": "Bastion Stone Parapet",
      "category": "ruins",
      "file": "operators/opt_bastion_parapet.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.26,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 440,
      "lodDist": [
        75,
        165
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 4,
        "y": 3.2,
        "z": 0.95
      },
      "collisionOffset": {
        "x": 0,
        "y": 0.08,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_bastion_parapet",
        "крепостной парапет",
        "bastion stone parapet"
      ]
    },
    {
      "id": "opt_banner_wall",
      "nameRu": "Настенный стяг операторов",
      "nameEn": "Operator Wall Banner",
      "category": "monuments",
      "file": "operators/opt_banner_wall.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.56,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 340,
      "lodDist": [
        80,
        180
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_banner_wall",
        "настенный стяг операторов",
        "operator wall banner"
      ]
    },
    {
      "id": "opt_pennant_wall",
      "nameRu": "Вымпел операторов настенный",
      "nameEn": "Operator Crimson Pennant",
      "category": "monuments",
      "file": "operators/opt_pennant_wall.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.755,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 340,
      "lodDist": [
        80,
        180
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_pennant_wall",
        "вымпел операторов настенный",
        "operator crimson pennant"
      ]
    },
    {
      "id": "opt_column",
      "nameRu": "Колонна (руины)",
      "nameEn": "Ruin Column",
      "category": "ruins",
      "file": "operators/opt_column.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 7.44,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 520,
      "lodDist": [
        60,
        150
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 1,
        "y": 7.5,
        "z": 1
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_column",
        "колонна (руины)",
        "ruin column"
      ]
    },
    {
      "id": "opt_column_broken",
      "nameRu": "Сломанная колонна",
      "nameEn": "Broken Column",
      "category": "ruins",
      "file": "operators/opt_column_broken.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.05,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 480,
      "lodDist": [
        55,
        140
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 1,
        "y": 4.2,
        "z": 1
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_column_broken",
        "сломанная колонна",
        "broken column"
      ]
    },
    {
      "id": "opt_column_stump",
      "nameRu": "Обрубок колонны",
      "nameEn": "Column Stump",
      "category": "ruins",
      "file": "operators/opt_column_stump.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.65,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 300,
      "lodDist": [
        45,
        110
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 1.5,
        "y": 1.8,
        "z": 1.5
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_column_stump",
        "обрубок колонны",
        "column stump"
      ]
    },
    {
      "id": "opt_column_fallen",
      "nameRu": "Упавшая колонна",
      "nameEn": "Fallen Column",
      "category": "ruins",
      "file": "operators/opt_column_fallen.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.543,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 320,
      "lodDist": [
        45,
        110
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 7.443,
        "y": 1.6,
        "z": 1.3
      },
      "collisionOffset": {
        "x": 0.015,
        "y": 0.079,
        "z": 0.099
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_column_fallen",
        "упавшая колонна",
        "fallen column"
      ]
    },
    {
      "id": "opt_arch",
      "nameRu": "Арка-руина",
      "nameEn": "Ruined Arch",
      "category": "ruins",
      "file": "operators/opt_arch.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 8.576,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 520,
      "lodDist": [
        60,
        150
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_arch",
        "арка-руина",
        "ruined arch"
      ]
    },
    {
      "id": "opt_ruin_long",
      "nameRu": "Руина стены",
      "nameEn": "Ruined Wall",
      "category": "ruins",
      "file": "operators/opt_ruin_long.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.301,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 480,
      "lodDist": [
        55,
        140
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 8,
        "y": 4.6,
        "z": 0.9
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_long",
        "руина стены",
        "ruined wall"
      ]
    },
    {
      "id": "opt_ruin_corner",
      "nameRu": "Угол руины",
      "nameEn": "Ruined Wall Corner",
      "category": "ruins",
      "file": "operators/opt_ruin_corner.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.2,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 360,
      "lodDist": [
        50,
        120
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_corner",
        "угол руины",
        "ruined wall corner"
      ]
    },
    {
      "id": "opt_ruin_tower",
      "nameRu": "Обрушенная башня бастиона",
      "nameEn": "Collapsed Bastion Tower",
      "category": "ruins",
      "file": "operators/opt_ruin_tower.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 12.1,
      "instanced": true,
      "distClass": "building",
      "drawDist": 520,
      "lodDist": [
        70,
        175
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_tower",
        "обрушенная башня бастиона",
        "collapsed bastion tower"
      ]
    },
    {
      "id": "opt_ruin_bridge",
      "nameRu": "Разрушенный акведук-мост",
      "nameEn": "Shattered Viaduct Bridge",
      "category": "ruins",
      "file": "operators/opt_ruin_bridge.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 5.399,
      "instanced": true,
      "distClass": "building",
      "drawDist": 520,
      "lodDist": [
        70,
        175
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_bridge",
        "разрушенный акведук-мост",
        "shattered viaduct bridge"
      ]
    },
    {
      "id": "opt_ruin_gear_wreck",
      "nameRu": "Вбитая в кратер шестерня",
      "nameEn": "Shattered Colossal Gear",
      "category": "ruins",
      "file": "operators/opt_ruin_gear_wreck.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.261,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 380,
      "lodDist": [
        60,
        145
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 4.4,
        "y": 3.8,
        "z": 4.4
      },
      "collisionOffset": {
        "x": 0,
        "y": 0.28,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_gear_wreck",
        "вбитая в кратер шестерня",
        "shattered colossal gear"
      ]
    },
    {
      "id": "opt_ruin_crater",
      "nameRu": "Воронка разрушения",
      "nameEn": "Blasted Masonry Crater",
      "category": "ruins",
      "file": "operators/opt_ruin_crater.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.181,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 340,
      "lodDist": [
        55,
        130
      ],
      "castShadow": false,
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 5.4,
        "y": 1.1,
        "z": 5.4
      },
      "collisionOffset": {
        "x": -0.041,
        "y": 0.282,
        "z": 0.081
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_crater",
        "воронка разрушения",
        "blasted masonry crater"
      ]
    },
    {
      "id": "opt_debris",
      "nameRu": "Обломки кладки",
      "nameEn": "Rubble Debris",
      "category": "ruins",
      "file": "operators/opt_debris.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.114,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        40,
        100
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_debris",
        "обломки кладки",
        "rubble debris"
      ]
    },
    {
      "id": "opt_block",
      "nameRu": "Блок кладки",
      "nameEn": "Ashlar Block",
      "category": "ruins",
      "file": "operators/opt_block.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.55,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        40,
        100
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_block",
        "блок кладки",
        "ashlar block"
      ]
    },
    {
      "id": "opt_slab",
      "nameRu": "Плиты мощения",
      "nameEn": "Paving Slabs",
      "category": "ruins",
      "file": "operators/opt_slab.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.491,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        35,
        90
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_slab",
        "плиты мощения",
        "paving slabs"
      ]
    },
    {
      "id": "opt_hero_monument",
      "nameRu": "Монумент Героя",
      "nameEn": "Monument of Hero",
      "category": "monuments",
      "file": "operators/opt_hero_monument.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 6.547,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 460,
      "lodDist": [
        65,
        160
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 2.2,
        "y": 5.8,
        "z": 2.2
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_hero_monument",
        "монумент героя",
        "monument of hero"
      ]
    },
    {
      "id": "opt_lamp",
      "nameRu": "Паровой фонарь операторов",
      "nameEn": "Operators Steam Lamp",
      "category": "steampunk",
      "file": "operators/opt_lamp.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.51,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 260,
      "lodDist": [
        40,
        100
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_lamp",
        "паровой фонарь операторов",
        "operators steam lamp"
      ]
    },
    {
      "id": "opt_steam_boiler_tower",
      "nameRu": "Башня парового котла",
      "nameEn": "Steam Boiler Tower",
      "category": "steampunk",
      "file": "operators/opt_steam_boiler_tower.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 6.85,
      "instanced": true,
      "distClass": "building",
      "drawDist": 420,
      "lodDist": [
        90,
        190
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 2.8,
        "y": 6.6,
        "z": 2.8
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_steam_boiler_tower",
        "башня парового котла",
        "steam boiler tower"
      ]
    },
    {
      "id": "opt_steam_dynamo",
      "nameRu": "Паровой динамо-генератор",
      "nameEn": "Steam Dynamo Generator",
      "category": "steampunk",
      "file": "operators/opt_steam_dynamo.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.85,
      "instanced": true,
      "distClass": "building",
      "drawDist": 360,
      "lodDist": [
        80,
        170
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 3.6,
        "y": 2.9,
        "z": 2.2
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_steam_dynamo",
        "паровой динамо-генератор",
        "steam dynamo generator"
      ]
    },
    {
      "id": "opt_steam_cistern",
      "nameRu": "Клёпаная водонапорная цистерна",
      "nameEn": "Riveted Steam Cistern",
      "category": "steampunk",
      "file": "operators/opt_steam_cistern.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 5.15,
      "instanced": true,
      "distClass": "building",
      "drawDist": 400,
      "lodDist": [
        85,
        180
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 2.9,
        "y": 4.8,
        "z": 2.9
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_steam_cistern",
        "клёпаная водонапорная цистерна",
        "riveted steam cistern"
      ]
    },
    {
      "id": "opt_forge_hearth",
      "nameRu": "Полевой паровой горн кузни",
      "nameEn": "Field Forge Hearth",
      "category": "forges",
      "file": "operators/opt_forge_hearth.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.9,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 340,
      "lodDist": [
        75,
        160
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 2.6,
        "y": 3.6,
        "z": 1.9
      },
      "collisionOffset": {
        "x": -0.148,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_forge_hearth",
        "полевой паровой горн кузни",
        "field forge hearth"
      ]
    },
    {
      "id": "opt_steam_brazier",
      "nameRu": "Кованый треножный светильник",
      "nameEn": "Wrought Tripod Brazier",
      "category": "steampunk",
      "file": "operators/opt_steam_brazier.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.18,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        55,
        120
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_steam_brazier",
        "кованый треножный светильник",
        "wrought tripod brazier"
      ]
    },
    {
      "id": "opt_copper_tanks",
      "nameRu": "Парные медные баллоны давления",
      "nameEn": "Twin Copper Pressure Vessels",
      "category": "steampunk",
      "file": "operators/opt_copper_tanks.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.44,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        55,
        120
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_copper_tanks",
        "парные медные баллоны давления",
        "twin copper pressure vessels"
      ]
    },
    {
      "id": "opt_pipe_bridge_east",
      "nameRu": "Надземная медная арка-паропровод",
      "nameEn": "Copper Steam Pipeline Arch",
      "category": "steampunk",
      "file": "operators/opt_pipe_bridge_east.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 5.035,
      "instanced": true,
      "distClass": "building",
      "drawDist": 420,
      "lodDist": [
        95,
        185
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_pipe_bridge_east",
        "надземная медная арка-паропровод",
        "copper steam pipeline arch"
      ]
    },
    {
      "id": "opt_pipe_wall_manifold",
      "nameRu": "Наземный медный коллектор пара",
      "nameEn": "Copper Ground Steam Manifold",
      "category": "steampunk",
      "file": "operators/opt_pipe_wall_manifold.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.188,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 340,
      "lodDist": [
        80,
        165
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 4.4,
        "y": 1.25,
        "z": 0.95
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_pipe_wall_manifold",
        "наземный медный коллектор пара",
        "copper ground steam manifold"
      ]
    },
    {
      "id": "opt_pipe_ground_riser",
      "nameRu": "Медный паровой стояк из грунта",
      "nameEn": "Copper Ground Steam Riser",
      "category": "steampunk",
      "file": "operators/opt_pipe_ground_riser.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.39,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 380,
      "lodDist": [
        90,
        175
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 1.15,
        "y": 3.2,
        "z": 1.15
      },
      "collisionOffset": {
        "x": -0.905,
        "y": 0,
        "z": 0.08
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_pipe_ground_riser",
        "медный паровой стояк из грунта",
        "copper ground steam riser"
      ]
    },
    {
      "id": "opt_pipe_arch_ground",
      "nameRu": "Магистральная медная дуга пара",
      "nameEn": "Copper Grounded Steam Arch",
      "category": "steampunk",
      "file": "operators/opt_pipe_arch_ground.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.549,
      "instanced": true,
      "distClass": "building",
      "drawDist": 420,
      "lodDist": [
        95,
        185
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_pipe_arch_ground",
        "магистральная медная дуга пара",
        "copper grounded steam arch"
      ]
    },
    {
      "id": "opt_ruin_gate_pylon",
      "nameRu": "Разбитый пилон южных ворот",
      "nameEn": "Shattered Gate Pylon",
      "category": "ruins",
      "file": "operators/opt_ruin_gate_pylon.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 8.314,
      "instanced": true,
      "distClass": "building",
      "drawDist": 520,
      "lodDist": [
        75,
        180
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_gate_pylon",
        "разбитый пилон южных ворот",
        "shattered gate pylon"
      ]
    },
    {
      "id": "opt_ruin_viaduct_east",
      "nameRu": "Рухнувший пролёт акведука",
      "nameEn": "Collapsed Viaduct Span",
      "category": "ruins",
      "file": "operators/opt_ruin_viaduct_east.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.64,
      "instanced": true,
      "distClass": "building",
      "drawDist": 520,
      "lodDist": [
        75,
        180
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_viaduct_east",
        "рухнувший пролёт акведука",
        "collapsed viaduct span"
      ]
    },
    {
      "id": "opt_ruin_foundry_shell",
      "nameRu": "Остов разрушенной котельной",
      "nameEn": "Ruined Foundry Shell",
      "category": "ruins",
      "file": "operators/opt_ruin_foundry_shell.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 5.348,
      "instanced": true,
      "distClass": "building",
      "drawDist": 480,
      "lodDist": [
        70,
        170
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_foundry_shell",
        "остов разрушенной котельной",
        "ruined foundry shell"
      ]
    },
    {
      "id": "opt_ruin_wall_breach",
      "nameRu": "Проломленная крепостная стена",
      "nameEn": "Breached Fortress Wall",
      "category": "ruins",
      "file": "operators/opt_ruin_wall_breach.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.843,
      "instanced": true,
      "distClass": "building",
      "drawDist": 480,
      "lodDist": [
        65,
        160
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_wall_breach",
        "проломленная крепостная стена",
        "breached fortress wall"
      ]
    },
    {
      "id": "opt_ruin_wall_buttress",
      "nameRu": "Руина стены с контрфорсами",
      "nameEn": "Buttressed Ruin Wall",
      "category": "ruins",
      "file": "operators/opt_ruin_wall_buttress.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.599,
      "instanced": true,
      "distClass": "building",
      "drawDist": 460,
      "lodDist": [
        60,
        150
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 8,
        "y": 3.8,
        "z": 1.5
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": -0.277
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_wall_buttress",
        "руина стены с контрфорсами",
        "buttressed ruin wall"
      ]
    },
    {
      "id": "opt_ruin_wall_colonnade",
      "nameRu": "Уцелевшая колонна в руине стены",
      "nameEn": "Engaged Column Wall Ruin",
      "category": "ruins",
      "file": "operators/opt_ruin_wall_colonnade.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 5.13,
      "instanced": true,
      "distClass": "building",
      "drawDist": 480,
      "lodDist": [
        65,
        160
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 8.2,
        "y": 5.1,
        "z": 1.4
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": -0.137
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_wall_colonnade",
        "уцелевшая колонна в руине стены",
        "engaged column wall ruin"
      ]
    },
    {
      "id": "opt_ruin_crane_wreck",
      "nameRu": "Опрокинутая стрела подъёмника",
      "nameEn": "Wrecked Hoist Crane Base",
      "category": "ruins",
      "file": "operators/opt_ruin_crane_wreck.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.8,
      "instanced": true,
      "distClass": "building",
      "drawDist": 420,
      "lodDist": [
        65,
        150
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 3.2,
        "y": 4.5,
        "z": 2.6
      },
      "collisionOffset": {
        "x": -0.957,
        "y": 0,
        "z": 0.198
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_crane_wreck",
        "опрокинутая стрела подъёмника",
        "wrecked hoist crane base"
      ]
    },
    {
      "id": "opt_ruin_boiler_wreck",
      "nameRu": "Взорванный котёл на плите",
      "nameEn": "Blasted Copper Boiler Wreck",
      "category": "ruins",
      "file": "operators/opt_ruin_boiler_wreck.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.92,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 380,
      "lodDist": [
        60,
        145
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 3.8,
        "y": 2.8,
        "z": 3.4
      },
      "collisionOffset": {
        "x": 0.091,
        "y": 0.348,
        "z": 0.029
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_boiler_wreck",
        "взорванный котёл на плите",
        "blasted copper boiler wreck"
      ]
    },
    {
      "id": "opt_ruin_rubble_a",
      "nameRu": "Гранитный завал А",
      "nameEn": "Ashlar Rubble Cluster A",
      "category": "ruins",
      "file": "operators/opt_ruin_rubble_a.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.924,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        45,
        105
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_rubble_a",
        "гранитный завал а",
        "ashlar rubble cluster a"
      ]
    },
    {
      "id": "opt_ruin_rubble_b",
      "nameRu": "Трубный завал руин Б",
      "nameEn": "Masonry Pipe Rubble B",
      "category": "ruins",
      "file": "operators/opt_ruin_rubble_b.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.974,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        45,
        105
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_ruin_rubble_b",
        "трубный завал руин б",
        "masonry pipe rubble b"
      ]
    },
    {
      "id": "opt_dummy",
      "nameRu": "Тренировочный манекен",
      "nameEn": "Training Dummy",
      "category": "forges",
      "file": "operators/opt_dummy.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.863,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 260,
      "lodDist": [
        75,
        130
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 0.9,
        "y": 1.9,
        "z": 0.9
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_dummy",
        "тренировочный манекен",
        "training dummy"
      ]
    },
    {
      "id": "opt_weapon_rack",
      "nameRu": "Стойка с оружием",
      "nameEn": "Weapon Stand",
      "category": "forges",
      "file": "operators/opt_weapon_rack.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.165,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        75,
        130
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.5,
        "y": 1.3,
        "z": 1
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_weapon_rack",
        "стойка с оружием",
        "weapon stand"
      ]
    },
    {
      "id": "opt_anvil",
      "nameRu": "Наковальня полевой кузни",
      "nameEn": "Field Anvil",
      "category": "forges",
      "file": "operators/opt_anvil.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.127,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        75,
        120
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_anvil",
        "наковальня полевой кузни",
        "field anvil"
      ]
    },
    {
      "id": "opt_whetstone",
      "nameRu": "Точильный станок",
      "nameEn": "Whetstone Wheel",
      "category": "forges",
      "file": "operators/opt_whetstone.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.228,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_whetstone",
        "точильный станок",
        "whetstone wheel"
      ]
    },
    {
      "id": "opt_workbench",
      "nameRu": "Верстак механика",
      "nameEn": "Mechanic Workbench",
      "category": "forges",
      "file": "operators/opt_workbench.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.895,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 2.05,
        "y": 1.05,
        "z": 1.05
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_workbench",
        "верстак механика",
        "mechanic workbench"
      ]
    },
    {
      "id": "opt_table_long",
      "nameRu": "Штабной стол",
      "nameEn": "Staff Table",
      "category": "market",
      "file": "operators/opt_table_long.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.813,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 2.85,
        "y": 0.95,
        "z": 1.1
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_table_long",
        "штабной стол",
        "staff table"
      ]
    },
    {
      "id": "opt_bench_camp",
      "nameRu": "Деревянная скамья",
      "nameEn": "Camp Bench",
      "category": "market",
      "file": "operators/opt_bench_camp.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.533,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_bench_camp",
        "деревянная скамья",
        "camp bench"
      ]
    },
    {
      "id": "opt_chair",
      "nameRu": "Стул штаба",
      "nameEn": "Officer Chair",
      "category": "market",
      "file": "operators/opt_chair.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.179,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 140,
      "lodDist": [
        80,
        120
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_chair",
        "стул штаба",
        "officer chair"
      ]
    },
    {
      "id": "opt_bookcase",
      "nameRu": "Шкаф уставов и чертежей",
      "nameEn": "Charter Bookcase",
      "category": "market",
      "file": "operators/opt_bookcase.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.545,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.48,
        "y": 2.55,
        "z": 0.48
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_bookcase",
        "шкаф уставов и чертежей",
        "charter bookcase"
      ]
    },
    {
      "id": "opt_bookstand",
      "nameRu": "Пюпитр с уставом",
      "nameEn": "Charter Lectern",
      "category": "market",
      "file": "operators/opt_bookstand.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.519,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 160,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_bookstand",
        "пюпитр с уставом",
        "charter lectern"
      ]
    },
    {
      "id": "opt_cabinet",
      "nameRu": "Шкаф снабжения",
      "nameEn": "Supply Cabinet",
      "category": "market",
      "file": "operators/opt_cabinet.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.047,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 160,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.45,
        "y": 1.1,
        "z": 0.45
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_cabinet",
        "шкаф снабжения",
        "supply cabinet"
      ]
    },
    {
      "id": "opt_chandelier",
      "nameRu": "Люстра бастиона",
      "nameEn": "Bastion Chandelier",
      "category": "market",
      "file": "operators/opt_chandelier.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.114,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_chandelier",
        "люстра бастиона",
        "bastion chandelier"
      ]
    },
    {
      "id": "opt_lantern_indoor",
      "nameRu": "Настенный фонарь",
      "nameEn": "Wall Lantern",
      "category": "steampunk",
      "file": "operators/opt_lantern_indoor.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.136,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_lantern_indoor",
        "настенный фонарь",
        "wall lantern"
      ]
    },
    {
      "id": "opt_chest",
      "nameRu": "Сундук снаряжения",
      "nameEn": "Supply Chest",
      "category": "warehouses",
      "file": "operators/opt_chest.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.558,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_chest",
        "сундук снаряжения",
        "supply chest"
      ]
    },
    {
      "id": "opt_barrel",
      "nameRu": "Дубовая бочка",
      "nameEn": "Oak Barrel",
      "category": "warehouses",
      "file": "operators/opt_barrel.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.943,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_barrel",
        "дубовая бочка",
        "oak barrel"
      ]
    },
    {
      "id": "opt_crate",
      "nameRu": "Ящик припасов",
      "nameEn": "Wooden Crate",
      "category": "warehouses",
      "file": "operators/opt_crate.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.977,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_crate",
        "ящик припасов",
        "wooden crate"
      ]
    },
    {
      "id": "opt_crate_iron",
      "nameRu": "Клёпаный железный контейнер",
      "nameEn": "Riveted Iron Crate",
      "category": "steampunk",
      "file": "operators/opt_crate_iron.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.955,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_crate_iron",
        "клёпаный железный контейнер",
        "riveted iron crate"
      ]
    },
    {
      "id": "opt_banner_hang",
      "nameRu": "Настенный стяг на кронштейне",
      "nameEn": "Cantilever Guild Banner",
      "category": "monuments",
      "file": "operators/opt_banner_hang.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.569,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 320,
      "lodDist": [
        95,
        160
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_banner_hang",
        "настенный стяг на кронштейне",
        "cantilever guild banner"
      ]
    },
    {
      "id": "opt_wall_stone",
      "nameRu": "Каменная стена лагеря",
      "nameEn": "Operator Stone Rampart",
      "category": "ruins",
      "file": "operators/opt_wall_stone.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.989,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 400,
      "lodDist": [
        95,
        180
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 3.2,
        "y": 2,
        "z": 0.72
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_wall_stone",
        "каменная стена лагеря",
        "operator stone rampart"
      ]
    },
    {
      "id": "opt_weapon_rack_b",
      "nameRu": "Пирамида клинков и копий",
      "nameEn": "Blade & Spear Rack",
      "category": "forges",
      "file": "operators/opt_weapon_rack_b.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.619,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        85,
        140
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.32,
        "y": 1.65,
        "z": 0.5
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_weapon_rack_b",
        "пирамида клинков и копий",
        "blade & spear rack"
      ]
    },
    {
      "id": "opt_rubble_pile",
      "nameRu": "Каменная осыпь руин",
      "nameEn": "Stone Rubble Mound",
      "category": "ruins",
      "file": "operators/opt_rubble_pile.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.677,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        80,
        130
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_rubble_pile",
        "каменная осыпь руин",
        "stone rubble mound"
      ]
    },
    {
      "id": "opt_camp_rug",
      "nameRu": "Ковёр штабного зала",
      "nameEn": "Bastion Hall Runner Rug",
      "category": "market",
      "file": "operators/opt_camp_rug.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.028,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 160,
      "lodDist": [
        80,
        130
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_camp_rug",
        "ковёр штабного зала",
        "bastion hall runner rug"
      ]
    },
    {
      "id": "opt_cable_drum",
      "nameRu": "Катушка парового привода",
      "nameEn": "Conduit Cable Drum",
      "category": "steampunk",
      "file": "operators/opt_cable_drum.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.059,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 220,
      "lodDist": [
        90,
        140
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_cable_drum",
        "катушка парового привода",
        "conduit cable drum"
      ]
    },
    {
      "id": "opt_cannon",
      "nameRu": "Паровое орудие бастиона",
      "nameEn": "Steam Bastion Cannon",
      "category": "forges",
      "file": "operators/opt_cannon.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.336,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 320,
      "lodDist": [
        85,
        145
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.55,
        "y": 1.45,
        "z": 2.6
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_cannon",
        "паровое орудие бастиона",
        "steam bastion cannon"
      ]
    },
    {
      "id": "opt_sack_grain",
      "nameRu": "Мешок снабжения",
      "nameEn": "Supply Sack",
      "category": "warehouses",
      "file": "operators/opt_sack_grain.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.677,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 180,
      "lodDist": [
        85,
        130
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_sack_grain",
        "мешок снабжения",
        "supply sack"
      ]
    },
    {
      "id": "opt_boiler_station",
      "nameRu": "Паровая силовая установка",
      "nameEn": "Steam Powerhouse Module",
      "category": "steampunk",
      "file": "operators/opt_boiler_station.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 4.239,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 400,
      "lodDist": [
        100,
        200
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 4.4,
        "y": 4.1,
        "z": 4.2
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_boiler_station",
        "паровая силовая установка",
        "steam powerhouse module"
      ]
    },
    {
      "id": "opt_steam_wheel",
      "nameRu": "Маховик парового привода",
      "nameEn": "Brass Drive Flywheel",
      "category": "steampunk",
      "file": "operators/opt_steam_wheel.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.899,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 340,
      "lodDist": [
        90,
        170
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 1.9,
        "y": 2.9,
        "z": 1.8
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_steam_wheel",
        "маховик парового привода",
        "brass drive flywheel"
      ]
    },
    {
      "id": "opt_wreck_wagon",
      "nameRu": "Разбитая обозная повозка",
      "nameEn": "Wrecked Medieval Supply Wagon",
      "category": "ruins",
      "file": "operators/opt_wreck_wagon.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.055,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 320,
      "lodDist": [
        80,
        150
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 2.2,
        "y": 1.8,
        "z": 3.4
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_wreck_wagon",
        "разбитая обозная повозка",
        "wrecked medieval supply wagon"
      ]
    },
    {
      "id": "opt_wreck_pushcart",
      "nameRu": "Перевёрнутая ручная тележка",
      "nameEn": "Overturned Handcart Wreck",
      "category": "ruins",
      "file": "operators/opt_wreck_pushcart.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.695,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 280,
      "lodDist": [
        75,
        140
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_wreck_pushcart",
        "перевёрнутая ручная тележка",
        "overturned handcart wreck"
      ]
    },
    {
      "id": "opt_dead_tree_a",
      "nameRu": "Иссушённое корявое дерево",
      "nameEn": "Charred Dead Tree Large",
      "category": "ruins",
      "file": "operators/opt_dead_tree_a.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 9.021,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 340,
      "lodDist": [
        75,
        150
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 0.95,
        "y": 5.5,
        "z": 0.95
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_dead_tree_a",
        "иссушённое корявое дерево",
        "charred dead tree large"
      ]
    },
    {
      "id": "opt_dead_tree_b",
      "nameRu": "Сломленное сухое дерево",
      "nameEn": "Gnarled Dead Tree Snag",
      "category": "ruins",
      "file": "operators/opt_dead_tree_b.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 10.624,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 330,
      "lodDist": [
        75,
        145
      ],
      "collision": true,
      "collisionShape": "cylinder",
      "collisionSize": {
        "x": 0.85,
        "y": 4.5,
        "z": 0.85
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_dead_tree_b",
        "сломленное сухое дерево",
        "gnarled dead tree snag"
      ]
    },
    {
      "id": "opt_boulder_s",
      "nameRu": "Гранитный валун малый",
      "nameEn": "Granite Outcrop Small",
      "category": "ruins",
      "file": "operators/opt_boulder_s.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.675,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 280,
      "lodDist": [
        70,
        140
      ],
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_boulder_s",
        "гранитный валун малый",
        "granite outcrop small"
      ]
    },
    {
      "id": "opt_boulder_m",
      "nameRu": "Гранитная скала средняя",
      "nameEn": "Granite Crag Medium",
      "category": "ruins",
      "file": "operators/opt_boulder_m.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.846,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 360,
      "lodDist": [
        85,
        165
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 4.2,
        "y": 2.7,
        "z": 3.8
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_boulder_m",
        "гранитная скала средняя",
        "granite crag medium"
      ]
    },
    {
      "id": "opt_boulder_l",
      "nameRu": "Монолитная гранитная глыба",
      "nameEn": "Granite Cliff Monolith",
      "category": "ruins",
      "file": "operators/opt_boulder_l.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 3.625,
      "instanced": true,
      "distClass": "prop",
      "drawDist": 420,
      "lodDist": [
        95,
        190
      ],
      "collision": true,
      "collisionShape": "box",
      "collisionSize": {
        "x": 6.4,
        "y": 3.4,
        "z": 4.5
      },
      "collisionOffset": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_boulder_l",
        "монолитная гранитная глыба",
        "granite cliff monolith"
      ]
    },
    {
      "id": "opt_cart_wheel",
      "nameRu": "Сломанное колесо повозки",
      "nameEn": "Broken Wooden Cart Wheel",
      "category": "ruins",
      "file": "operators/opt_cart_wheel.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 1.012,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        70,
        120
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_cart_wheel",
        "сломанное колесо повозки",
        "broken wooden cart wheel"
      ]
    },
    {
      "id": "opt_wheelbarrow",
      "nameRu": "Брошенная тачка",
      "nameEn": "Abandoned Ruin Wheelbarrow",
      "category": "ruins",
      "file": "operators/opt_wheelbarrow.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 0.89,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 200,
      "lodDist": [
        70,
        120
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_wheelbarrow",
        "брошенная тачка",
        "abandoned ruin wheelbarrow"
      ]
    },
    {
      "id": "opt_signpost",
      "nameRu": "Покосившийся дорожный указатель",
      "nameEn": "Crooked Road Signpost",
      "category": "ruins",
      "file": "operators/opt_signpost.glb",
      "format": "glb",
      "defaultScale": 1,
      "estimatedHeight": 2.673,
      "instanced": true,
      "distClass": "doodad",
      "drawDist": 240,
      "lodDist": [
        75,
        130
      ],
      "castShadow": false,
      "collision": false,
      "tags": [
        "территория операторов",
        "operators",
        "glb",
        "instanced",
        "opt_signpost",
        "покосившийся дорожный указатель",
        "crooked road signpost"
      ]
    }
  ];

  /**
   * Индекс каталога: id → запись, file → запись, file без .fbx → запись.
   * Каталог задан литералом и не меняется в рантайме, поэтому строится лениво
   * один раз (проверка по длине массива — страховка на случай правок).
   */
  let _byKey = null;
  let _byKeyLen = -1;
  function ensureIndex() {
    if (_byKey && _byKeyLen === PROPS_CATALOG.length) return _byKey;
    const m = new Map();
    for (let i = 0; i < PROPS_CATALOG.length; i++) {
      const p = PROPS_CATALOG[i];
      if (!p) continue;
      if (p.id != null && !m.has(String(p.id))) m.set(String(p.id), p);
      if (p.file != null) {
        const f = String(p.file);
        if (!m.has(f)) m.set(f, p);
        const noExt = f.replace(/\.(fbx|glb|gltf|obj)$/i, '');
        if (noExt !== f && !m.has(noExt)) m.set(noExt, p);
        const base = f.split('/').pop();
        if (base && !m.has(base)) m.set(base, p);
        const baseNoExt = base ? base.replace(/\.(fbx|glb|gltf|obj)$/i, '') : '';
        if (baseNoExt && !m.has(baseNoExt)) m.set(baseNoExt, p);
      }
    }
    _byKey = m;
    _byKeyLen = PROPS_CATALOG.length;
    return m;
  }

  const PropsLibrary = {
    getCategories: function () {
      return CATEGORIES.slice();
    },

    getAll: function () {
      return PROPS_CATALOG.slice();
    },

    getById: function (id) {
      if (!id) return null;
      // Линейный find по 363 записям здесь стоил 0.016 мс, а вызывался внутри
      // цикла коллизий по 576 пропсам на каждый кадр — до 9 мс только на поиск.
      // Индекс строится один раз: каталог статичен.
      const key = String(id);
      const idx = ensureIndex();
      const hit = idx.get(key);
      if (hit) return hit;
      return idx.get(key + '.fbx') || idx.get(key + '.glb') || idx.get('bazaar/' + key + '.glb') || null;
    },

    getByCategory: function (catId) {
      if (!catId || catId === 'all') return this.getAll();
      return PROPS_CATALOG.filter(p => p.category === catId);
    },

    search: function (query, catId) {
      let list = (catId && catId !== 'all') ? this.getByCategory(catId) : this.getAll();
      if (!query || !query.trim()) return list;
      const q = query.trim().toLowerCase();
      return list.filter(p => {
        if (p.id.toLowerCase().includes(q)) return true;
        if (p.nameRu && p.nameRu.toLowerCase().includes(q)) return true;
        if (p.nameEn && p.nameEn.toLowerCase().includes(q)) return true;
        if (p.file && p.file.toLowerCase().includes(q)) return true;
        if (p.tags && p.tags.some(t => t.toLowerCase().includes(q))) return true;
        return false;
      });
    },

    registerProp: function (propItem) {
      if (!propItem || !propItem.id || !propItem.file) return null;
      const cleanItem = {
        id: String(propItem.id),
        category: propItem.category || 'custom',
        nameRu: propItem.nameRu || propItem.name || propItem.id,
        nameEn: propItem.nameEn || propItem.name || propItem.id,
        file: String(propItem.file),
        format: propItem.format || (propItem.file.endsWith('.glb') ? 'glb' : (propItem.file.endsWith('.gltf') ? 'gltf' : 'fbx')),
        defaultScale: typeof propItem.defaultScale === 'number' ? propItem.defaultScale : 1.0,
        estimatedHeight: typeof propItem.estimatedHeight === 'number' ? propItem.estimatedHeight : 3.0,
        collision: propItem.collision !== false,
        collisionShape: propItem.collisionShape || 'box',
        collisionRadius: propItem.collisionRadius || 1.5,
        collisionHeight: propItem.collisionHeight || 3.0,
        collisionSize: propItem.collisionSize || { x: 3.0, y: 3.0, z: 3.0 },
        tags: Array.isArray(propItem.tags) ? propItem.tags : ['custom', 'user_added']
      };
      const existingIdx = PROPS_CATALOG.findIndex(p => p.id === cleanItem.id || p.file === cleanItem.file);
      if (existingIdx !== -1) {
        PROPS_CATALOG[existingIdx] = cleanItem;
      } else {
        PROPS_CATALOG.push(cleanItem);
      }
      _byKey = null;
      ensureIndex();
      return cleanItem;
    }
  };

  global.PropsLibrary = PropsLibrary;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PropsLibrary;
  }
})(typeof window !== 'undefined' ? window : globalThis);
