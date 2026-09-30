// ============================================================
//  CLIENT / JS / PROPS-LIBRARY-DATA.JS
//  Каталог и библиотека 3D-моделей (props) для редактора сцены
//  Содержит 99 моделей FBX (деревья, кусты, здания, декор)
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
        const noExt = f.replace(/\.fbx$/i, '');
        if (noExt !== f && !m.has(noExt)) m.set(noExt, p);
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
      return idx.get(key + '.fbx') || null;
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
