/* Generated clean Steampunk Engineer Skills DB */
(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ENGINEER_SKILLS_DB = factory();
})(typeof window !== "undefined" ? window : globalThis, function() {
  return {
  "meta": {
    "version": "1.0.0",
    "classId": "engineer",
    "classNameRu": "Инженер",
    "classNameEn": "Engineer",
    "tier": 0,
    "path": "tech",
    "levelRange": "1-20",
    "primaryStats": {
      "STR": 22,
      "DEX": 21,
      "CON": 27,
      "INT": 41,
      "WIT": 20,
      "MEN": 39
    },
    "description": "Базовый класс контурно-энергетической ветки развития Project Steam. Использует резонансные излучатели, импульсные жезлы, резонаторы и нано-браслеты. Мастер дальнего боя контурным уроном (C.Atk), полевого ремонта механизмов, форсирования приводов и наложения коррозийных нано-протоколов.",
    "formulas": {
      "circuitDamage": "Damage = 91 * SQRT(C.Atk / C.Def) * SkillPower * AmplifierMod * CircuitCritMod",
      "circuitCrit": "Damage * 3.0 при критическом импульсе (базовый множитель), шанс: baseCrit * (WIT / 20)",
      "activationTime": "ActivationTime = HitTime * 333 / ModulationSpeed",
      "modulationSpeed": "ModulationSpeed = Base(166) * (WIT_bonus) * (Spellcraft: x2.0 в комбинезоне) * SetBonus",
      "repairFlat": "Repair = HealPower + SQRT(C.Atk) * (1 + passiveBonus) * (BlessedAmplifier: x1.5)",
      "debuffLandRate": "Rate = BaseLandRate * (INT_attacker / MEN_target) * (AttackerLvl / TargetLvl)",
      "steamCost": "Steam_Final = BaseCost * EquipMod(Wand: 0.90) * LevelPenaltyMod"
    },
    "archetype": "circuit_engineer"
  },
  "skills": [
    {
      "id": "eng_pressure_bolt",
      "nameRu": "Давящий импульс",
      "nameEn": "Pressure Bolt",
      "type": "active",
      "category": "attack",
      "target": "target",
      "damageType": "circuit",
      "element": "Pneumatic",
      "levelReq": 1,
      "maxLevel": 5,
      "free": true,
      "starter": true,
      "deviceReq": {
        "type": "necklace",
        "slot": "necklace",
        "name": "Резонатор контура (Engineer Emitter)",
        "minLevel": 1
      },
      "weaponReq": "Оружие инженера (Импульсный жезл / Резонансный излучатель)",
      "castTimeBaseSec": 4,
      "cooldownBaseSec": 6,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "icon": "assets/skills/engineer/eng_pressure_bolt.webp",
      "description": "Базовая дальнобойная программа инженера. Формирует направленную струю перегретого пара и электростатический разряд высокого давления через резонатор, нанося контурный урон на дистанции.",
      "mechanics": "Наносит контурный урон по формуле: 91 * SQRT(C.Atk / C.Def) * Power. Усиливается Усилителем Контура (x1.5) и Благословенным Усилителем Контура (x2.0). Время подготовки сокращается скоростью модуляции (WIT + комбинезон).",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "mpCostTotal": 9,
          "mpInitialConsume": 2,
          "mpConsume": 7,
          "minCircuitLevel": 1
        },
        {
          "rank": 2,
          "charLevelReq": 7,
          "spCost": 240,
          "mpCostTotal": 10,
          "mpInitialConsume": 2,
          "mpConsume": 8,
          "minCircuitLevel": 1
        },
        {
          "rank": 3,
          "charLevelReq": 7,
          "spCost": 240,
          "mpCostTotal": 11,
          "mpInitialConsume": 2,
          "mpConsume": 9,
          "minCircuitLevel": 2
        },
        {
          "rank": 4,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 13,
          "mpInitialConsume": 3,
          "mpConsume": 10,
          "minCircuitLevel": 2
        },
        {
          "rank": 5,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 15,
          "mpInitialConsume": 3,
          "mpConsume": 12,
          "minCircuitLevel": 3
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_pressure_seal",
      "nameRu": "Охлаждающий шип",
      "nameEn": "Coolant Spike",
      "type": "active",
      "category": "debuff",
      "target": "target",
      "damageType": "circuit",
      "element": "Cryo",
      "levelReq": 7,
      "maxLevel": 4,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "necklace",
        "slot": "necklace",
        "name": "Резонатор контура (Engineer Emitter)",
        "minLevel": 2
      },
      "weaponReq": "Оружие инженера (Импульсный жезл / Резонансный излучатель)",
      "castTimeBaseSec": 3.1,
      "cooldownBaseSec": 2,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "debuffDurationSec": 60,
      "slowPercent": 0.2,
      "icon": "assets/skills/engineer/eng_pressure_seal.webp",
      "description": "Выпускает струю криогенного хладагента высокого давления. Наносит контурный урон и замораживает подвижные узлы приводов цели, снижая скорость бега на 20% на 1 минуту.",
      "mechanics": "Быстрый откат (2 сек) и короткое время активации (3.1 сек). Замедление цели фиксировано (-20% на 60 сек) на всех рангах; с повышением ранга увеличивается только мощность урона.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 240,
          "mpCostTotal": 9,
          "mpInitialConsume": 2,
          "mpConsume": 7,
          "slowPercent": 0.2,
          "duration": 60,
          "minCircuitLevel": 2
        },
        {
          "rank": 2,
          "charLevelReq": 7,
          "spCost": 240,
          "mpCostTotal": 10,
          "mpInitialConsume": 2,
          "mpConsume": 8,
          "slowPercent": 0.2,
          "duration": 60,
          "minCircuitLevel": 2
        },
        {
          "rank": 3,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 14,
          "mpInitialConsume": 3,
          "mpConsume": 11,
          "slowPercent": 0.2,
          "duration": 60,
          "minCircuitLevel": 3
        },
        {
          "rank": 4,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 15,
          "mpInitialConsume": 3,
          "mpConsume": 12,
          "slowPercent": 0.2,
          "duration": 60,
          "minCircuitLevel": 3
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_pressure_drain",
      "nameRu": "Вытяжка давления",
      "nameEn": "Pressure Drain",
      "type": "active",
      "category": "attack",
      "target": "target",
      "damageType": "circuit",
      "element": "Vacuum",
      "levelReq": 14,
      "maxLevel": 6,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера (Engineer Nano Bracelet)",
        "minLevel": 3
      },
      "weaponReq": "Оружие инженера (Импульсный жезл / Резонансный излучатель)",
      "castTimeBaseSec": 4,
      "cooldownBaseSec": 12,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "lifeSteal": 0.4,
      "icon": "assets/skills/engineer/eng_pressure_drain.webp",
      "description": "Создаёт вакуумно-энергетическую петлю обратной связи между целью и инженером. Наносит энергетический контурный урон и перекачивает 40% нанесённого ущерба в восстановление прочности инженера.",
      "mechanics": "Damage = 91 * SQRT(C.Atk / C.Def) * Power. Инженер восстанавливает HP в размере floor(Damage * 0.40). Требует нано-браслет.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 25,
          "mpInitialConsume": 5,
          "mpConsume": 20,
          "lifeSteal": 0.4,
          "minNanoLevel": 3
        },
        {
          "rank": 2,
          "charLevelReq": 14,
          "spCost": 1100,
          "mpCostTotal": 28,
          "mpInitialConsume": 6,
          "mpConsume": 22,
          "lifeSteal": 0.4,
          "minNanoLevel": 3
        },
        {
          "rank": 3,
          "charLevelReq": 20,
          "spCost": 3000,
          "mpCostTotal": 30,
          "mpInitialConsume": 6,
          "mpConsume": 24,
          "lifeSteal": 0.4,
          "minNanoLevel": 4
        },
        {
          "rank": 4,
          "charLevelReq": 20,
          "spCost": 3000,
          "mpCostTotal": 32,
          "mpInitialConsume": 7,
          "mpConsume": 25,
          "lifeSteal": 0.4,
          "minNanoLevel": 4
        },
        {
          "rank": 5,
          "charLevelReq": 40,
          "spCost": 12000,
          "mpCostTotal": 36,
          "mpInitialConsume": 7,
          "mpConsume": 29,
          "lifeSteal": 0.4,
          "minNanoLevel": 5
        },
        {
          "rank": 6,
          "charLevelReq": 40,
          "spCost": 12000,
          "mpCostTotal": 40,
          "mpInitialConsume": 8,
          "mpConsume": 32,
          "lifeSteal": 0.4,
          "minNanoLevel": 5
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_self_repair",
      "nameRu": "Саморемонт",
      "nameEn": "Self Repair",
      "type": "active",
      "category": "heal",
      "target": "self",
      "levelReq": 1,
      "maxLevel": 1,
      "free": true,
      "starter": true,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 1
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 5,
      "cooldownBaseSec": 10,
      "healPower": 42,
      "icon": "assets/skills/engineer/eng_self_repair.webp",
      "description": "Стартовая программа экстренной полевой починки 1-го уровня. Восстанавливает прочность корпуса за счёт сжатого пара и нанитов-ремонтников.",
      "mechanics": "Восстанавливает HP = HealPower(42) + SQRT(C.Atk). Применяется только на самого себя.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "healPower": 42,
          "mpCostTotal": 14,
          "mpInitialConsume": 3,
          "mpConsume": 11,
          "minNanoLevel": 1
        }
      ]
    },
    {
      "id": "eng_field_repair",
      "nameRu": "Полевой ремонт",
      "nameEn": "Field Repair",
      "type": "active",
      "category": "heal",
      "target": "target",
      "levelReq": 7,
      "maxLevel": 6,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 2
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 5,
      "cooldownBaseSec": 10,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "icon": "assets/skills/engineer/eng_field_repair.webp",
      "description": "Основная восстановительная программа инженера. Направляет калиброванный поток ремонтных нанитов и стабилизирующего пара в выбранную цель или в себя.",
      "mechanics": "HP = HealPower + SQRT(C.Atk) * (1 + passiveBonus). При использовании Усилителя Контура эффективность возрастает на 50%.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 160,
          "healPower": 49,
          "mpCostTotal": 10,
          "mpInitialConsume": 2,
          "mpConsume": 8,
          "minNanoLevel": 2
        },
        {
          "rank": 2,
          "charLevelReq": 7,
          "spCost": 160,
          "healPower": 58,
          "mpCostTotal": 15,
          "mpInitialConsume": 3,
          "mpConsume": 12,
          "minNanoLevel": 2
        },
        {
          "rank": 3,
          "charLevelReq": 7,
          "spCost": 160,
          "healPower": 67,
          "mpCostTotal": 17,
          "mpInitialConsume": 4,
          "mpConsume": 13,
          "minNanoLevel": 2
        },
        {
          "rank": 4,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 76,
          "mpCostTotal": 20,
          "mpInitialConsume": 4,
          "mpConsume": 16,
          "minNanoLevel": 3
        },
        {
          "rank": 5,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 86,
          "mpCostTotal": 25,
          "mpInitialConsume": 5,
          "mpConsume": 20,
          "minNanoLevel": 3
        },
        {
          "rank": 6,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 95,
          "mpCostTotal": 31,
          "mpInitialConsume": 6,
          "mpConsume": 25,
          "minNanoLevel": 3
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_battle_repair",
      "nameRu": "Боевой ремонт",
      "nameEn": "Battle Repair",
      "type": "active",
      "category": "heal",
      "target": "target",
      "levelReq": 14,
      "maxLevel": 1,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 3
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 2,
      "cooldownBaseSec": 3,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "healPower": 83,
      "icon": "assets/skills/engineer/eng_battle_repair.webp",
      "description": "Экстренный скоростной ремонт союзника непосредственно в бою. Активируется более чем в 2 раза быстрее стандартного ремонта (2 сек против 5 сек) с минимальным откатом (3 сек), но с повышенным расходом пара.",
      "mechanics": "Оптимален для спасения бойцов передовой линии под шквалом огня. Генерирует повышенный уровень угрозы у монстров (66 очков).",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 83,
          "mpCostTotal": 25,
          "mpInitialConsume": 5,
          "mpConsume": 20,
          "minNanoLevel": 3
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_group_repair",
      "nameRu": "Групповой ремонт",
      "nameEn": "Group Repair",
      "type": "active",
      "category": "heal",
      "target": "party",
      "levelReq": 14,
      "maxLevel": 3,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 3
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 7,
      "cooldownBaseSec": 25,
      "partyRadiusGame": 55,
      "icon": "assets/skills/engineer/eng_group_repair.webp",
      "description": "Массовая восстановительная программа всего отряда. Ремонтирует корпус всем членам группы в радиусе 55 метров. Требует длительной калибровки (7 сек) и высокого давления в котле.",
      "mechanics": "Восстанавливает прочность всех сопартийцев в радиусе действия. Не требует выбора цели. Откат 25 секунд.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 66,
          "mpCostTotal": 40,
          "mpInitialConsume": 8,
          "mpConsume": 32,
          "minNanoLevel": 3
        },
        {
          "rank": 2,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 76,
          "mpCostTotal": 48,
          "mpInitialConsume": 10,
          "mpConsume": 38,
          "minNanoLevel": 3
        },
        {
          "rank": 3,
          "charLevelReq": 14,
          "spCost": 700,
          "healPower": 86,
          "mpCostTotal": 56,
          "mpInitialConsume": 12,
          "mpConsume": 44,
          "minNanoLevel": 3
        }
      ],
      "partyRadiusUnits": 1000
    },
    {
      "id": "eng_might",
      "nameRu": "Разгон привода",
      "nameEn": "Drive Overclock",
      "type": "active",
      "category": "buff",
      "target": "target",
      "levelReq": 7,
      "maxLevel": 3,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 2
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 4,
      "cooldownBaseSec": 6,
      "rangeGame": 21,
      "effectRangeGame": 38,
      "durationSec": 1200,
      "icon": "assets/skills/engineer/eng_might.webp",
      "description": "Длительная тактическая оптимизация физических приводов на 20 минут. Форсирует сервомоторы и шестерни цели, увеличивая физическую атаку (P.Atk).",
      "mechanics": "Увеличивает P.Atk цели: ранг 1: +8% (x1.08), ранг 2: +12% (x1.12), ранг 3: +15% (x1.15). Длительность: 1200 секунд (20 минут). Стак-группа: pa_up.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "attackBoost": 0.08,
          "duration": 1200,
          "mpCostTotal": 8,
          "mpInitialConsume": 2,
          "mpConsume": 6,
          "minNanoLevel": 2
        },
        {
          "rank": 2,
          "charLevelReq": 20,
          "spCost": 2000,
          "attackBoost": 0.12,
          "duration": 1200,
          "mpCostTotal": 18,
          "mpInitialConsume": 4,
          "mpConsume": 14,
          "minNanoLevel": 4
        },
        {
          "rank": 3,
          "charLevelReq": 40,
          "spCost": 8000,
          "attackBoost": 0.15,
          "duration": 1200,
          "mpCostTotal": 28,
          "mpInitialConsume": 7,
          "mpConsume": 21,
          "minNanoLevel": 5
        }
      ],
      "rangeUnits": 400,
      "effectRangeUnits": 900
    },
    {
      "id": "eng_shield",
      "nameRu": "Кожух",
      "nameEn": "Protective Casing",
      "type": "active",
      "category": "buff",
      "target": "target",
      "levelReq": 7,
      "maxLevel": 3,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 2
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 4,
      "cooldownBaseSec": 6,
      "rangeGame": 21,
      "effectRangeGame": 38,
      "durationSec": 1200,
      "icon": "assets/skills/engineer/eng_shield.webp",
      "description": "Длительная защитная программа на 20 минут. Активирует силовую электромагнитную оболочку вокруг цели, увеличивая физическую броню (P.Def).",
      "mechanics": "Увеличивает P.Def цели: ранг 1: +8% (x1.08), ранг 2: +12% (x1.12), ранг 3: +15% (x1.15). Длительность: 1200 секунд (20 минут). Стак-группа: pd_up.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "defenseBoost": 0.08,
          "duration": 1200,
          "mpCostTotal": 8,
          "mpInitialConsume": 2,
          "mpConsume": 6,
          "minNanoLevel": 2
        },
        {
          "rank": 2,
          "charLevelReq": 20,
          "spCost": 2000,
          "defenseBoost": 0.12,
          "duration": 1200,
          "mpCostTotal": 20,
          "mpInitialConsume": 4,
          "mpConsume": 16,
          "minNanoLevel": 4
        },
        {
          "rank": 3,
          "charLevelReq": 40,
          "spCost": 8000,
          "defenseBoost": 0.15,
          "duration": 1200,
          "mpCostTotal": 31,
          "mpInitialConsume": 8,
          "mpConsume": 23,
          "minNanoLevel": 5
        }
      ],
      "rangeUnits": 400,
      "effectRangeUnits": 900
    },
    {
      "id": "eng_curse_corrode",
      "nameRu": "Коррозия",
      "nameEn": "Circuit Corrosion",
      "type": "active",
      "category": "debuff",
      "target": "target",
      "levelReq": 7,
      "maxLevel": 1,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 2
      },
      "weaponReq": "Оружие инженера (Импульсный жезл / Резонансный излучатель)",
      "castTimeBaseSec": 3,
      "cooldownBaseSec": 2,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "durationSec": 30,
      "dotDamagePerSec": 21,
      "healReduction": 0.2,
      "baseLandChance": 0.7,
      "icon": "assets/skills/engineer/eng_curse_corrode.webp",
      "description": "Распыляет агрессивный кислотный состав с микро-термитами по корпусу противника. Наносит 21 ед. периодического урона каждую секунду в течение 30 секунд (суммарно 630 урона) и снижает эффективность входящего ремонта цели на 20%.",
      "mechanics": "Периодический урон (30 импульсов с шагом 1 сек). Базовый шанс внедрения: 70%. Снижает входящий ремонт цели на 20%. Нейтрализуется программой «Промывка» (ранг 1).",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "dotDamage": 21,
          "dotTicks": 30,
          "duration": 30,
          "healReduction": 0.2,
          "landChance": 0.7,
          "mpCostTotal": 8,
          "mpInitialConsume": 2,
          "mpConsume": 6,
          "minNanoLevel": 2
        }
      ],
      "element": "Chemical",
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_curse_weak",
      "nameRu": "Ослабление привода",
      "nameEn": "Drive Weakness",
      "type": "active",
      "category": "debuff",
      "target": "target",
      "levelReq": 14,
      "maxLevel": 1,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 3
      },
      "weaponReq": "Оружие инженера (Импульсный жезл / Резонансный излучатель)",
      "castTimeBaseSec": 1.5,
      "cooldownBaseSec": 2,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "durationSec": 30,
      "attackReduction": 0.17,
      "baseLandChance": 0.8,
      "icon": "assets/skills/engineer/eng_curse_weak.webp",
      "description": "Импульсная десинхронизация силовых редукторов противника. Снижает физическую атаку (P.Atk) цели на 17% на 30 секунд. Сверхбыстрая активация (1.5 сек) и минимальный расход пара.",
      "mechanics": "Базовый шанс применения: 80%. P.Atk цели умножается на 0.83. Длительность: 30 секунд. Стак-группа: pa_down.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 14,
          "spCost": 2100,
          "attackReduction": 0.17,
          "duration": 30,
          "landChance": 0.8,
          "mpCostTotal": 3,
          "mpInitialConsume": 1,
          "mpConsume": 2,
          "minNanoLevel": 3
        }
      ],
      "element": "Resonance",
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_cure_toxin",
      "nameRu": "Промывка",
      "nameEn": "System Flush",
      "type": "active",
      "category": "utility",
      "target": "target",
      "levelReq": 7,
      "maxLevel": 1,
      "free": false,
      "starter": false,
      "deviceReq": {
        "type": "bracelet",
        "slot": "bracelet",
        "name": "Нано-браслет инженера",
        "minLevel": 2
      },
      "weaponReq": "Любое снаряжение",
      "castTimeBaseSec": 0.5,
      "cooldownBaseSec": 2,
      "rangeGame": 30,
      "effectRangeGame": 55,
      "poisonPowerMax": 3,
      "icon": "assets/skills/engineer/eng_cure_toxin.webp",
      "description": "Экстренная продувка каналов контура нейтрализующим реагентом. Мгновенно устраняет эффекты коррозии и агрессивных химикатов начальной мощности с цели или себя.",
      "mechanics": "Мгновенная активация (0.5 сек). Снимает коррозийные эффекты монстров до 20 уровня. Стак-группа очистки: dot.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "curePoison": true,
          "poisonPowerMax": 3,
          "mpCostTotal": 10,
          "mpInitialConsume": 2,
          "mpConsume": 8,
          "minNanoLevel": 2
        }
      ],
      "rangeUnits": 600,
      "effectRangeUnits": 1100
    },
    {
      "id": "eng_expert_tune",
      "nameRu": "Искусная настройка",
      "nameEn": "Expert Casting",
      "type": "passive",
      "category": "buff",
      "levelReq": 1,
      "maxLevel": 1,
      "free": true,
      "starter": true,
      "requiresRobeSet": true,
      "castingSpeedMultiplier": 2,
      "icon": "assets/skills/engineer/eng_expert_tune.webp",
      "description": "Высокая точность модуляции контура. Удваивает скорость активации программ (Modulation Speed x2.0) при одновременном ношении куртки и штанов лёгкого защитного комбинезона (робы).",
      "mechanics": "При надетом полном комплекте комбинезона (куртка + штаны) скорость активации программ возрастает со 166 до 333 (x2.0). Без полного комплекта скорость остаётся базовой 166 (эффективный штраф -50%).",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "chargeSpeed": 1,
          "requiresRobeSet": true
        }
      ],
      "weaponReq": "Комплект лёгкого комбинезона (робы)"
    },
    {
      "id": "eng_robe_step",
      "nameRu": "Шаг мастера",
      "nameEn": "Magician Movement",
      "type": "passive",
      "category": "buff",
      "levelReq": 1,
      "maxLevel": 1,
      "free": true,
      "starter": true,
      "requiresRobeSet": true,
      "attackSpeedBonus": 0.25,
      "icon": "assets/skills/engineer/eng_robe_step.webp",
      "description": "Оптимальная развесовка снаряжения. Снижает инерцию экипировки и повышает темп физических ударов на 25% при ношении лёгкого комбинезона (робы).",
      "mechanics": "Работает только при надетом комплекте лёгкого комбинезона. Ускоряет темп ударов кулаками и оружием ближнего боя на 25%.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "attackSpeed": 0.25,
          "requiresRobeSet": true
        }
      ],
      "weaponReq": "Комплект лёгкого комбинезона (робы)"
    },
    {
      "id": "eng_coolant_mind",
      "nameRu": "Восстановление пара",
      "nameEn": "Coolant Mind",
      "type": "passive",
      "category": "buff",
      "levelReq": 1,
      "maxLevel": 1,
      "free": true,
      "starter": true,
      "requiresRobeSet": true,
      "energyRegenBonus": 0.2,
      "icon": "assets/skills/engineer/eng_coolant_mind.webp",
      "description": "Оптимизация парового теплообменника. Повышает естественную циркуляцию и скорость восполнения пара (MP) на 20% при ношении лёгкого комбинезона (робы).",
      "mechanics": "Даёт мультипликатор x1.20 к скорости восполнения пара во всех состояниях (покой, движение, сидя) при ношении защитного комбинезона.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "energyRegen": 0.2,
          "requiresRobeSet": true
        }
      ],
      "weaponReq": "Комплект лёгкого комбинезона (робы)"
    },
    {
      "id": "eng_weapon_mastery",
      "nameRu": "Мастерство инструмента",
      "nameEn": "Tool Mastery",
      "type": "passive",
      "category": "buff",
      "levelReq": 7,
      "maxLevel": 2,
      "free": false,
      "starter": false,
      "icon": "assets/skills/engineer/eng_weapon_mastery.webp",
      "description": "Специализированная подготовка инженера к работе с импульсными излучателями и тяжелым инструментом. Увеличивает физическую атаку и контурную мощность.",
      "mechanics": "Формула: P.Atk * 1.45 + FlatBonus; C.Atk * 1.17 + FlatBonus. Множитель фиксирован (+45% P.Atk / +17% C.Atk), с рангом растёт плоская добавка.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "pAtkPercent": 0.45,
          "pAtkFlat": 1.5,
          "cAtkPercent": 0.17,
          "cAtkFlat": 1.9
        },
        {
          "rank": 2,
          "charLevelReq": 14,
          "spCost": 2100,
          "pAtkPercent": 0.45,
          "pAtkFlat": 2.8,
          "cAtkPercent": 0.17,
          "cAtkFlat": 3.5
        }
      ],
      "weaponReq": "Оружие инженера и ручной инструмент"
    },
    {
      "id": "eng_armor_mastery",
      "nameRu": "Мастерство оболочки",
      "nameEn": "Casing Mastery",
      "type": "passive",
      "category": "buff",
      "levelReq": 7,
      "maxLevel": 3,
      "free": false,
      "starter": false,
      "icon": "assets/skills/engineer/eng_armor_mastery.webp",
      "description": "Умение грамотно крепить защитные пластины. Плоско увеличивает физическую броню (P.Def).",
      "mechanics": "Добавляет прямое число к P.Def: ранг 1: +6.7, ранг 2: +8.0, ранг 3: +9.2.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 470,
          "pDefFlat": 6.7
        },
        {
          "rank": 2,
          "charLevelReq": 11,
          "spCost": 1100,
          "pDefFlat": 8
        },
        {
          "rank": 3,
          "charLevelReq": 14,
          "spCost": 1100,
          "pDefFlat": 9.2
        }
      ],
      "weaponReq": "Любая экипировка"
    },
    {
      "id": "eng_circuit_mastery",
      "nameRu": "Изоляция контура",
      "nameEn": "Circuit Insulation",
      "type": "passive",
      "category": "buff",
      "levelReq": 7,
      "maxLevel": 4,
      "free": false,
      "starter": false,
      "icon": "assets/skills/engineer/eng_circuit_mastery.webp",
      "description": "Диэлектрическая и электромагнитная изоляция внутренних узлов от внешних разрядов и импульсов. Плоско увеличивает контурную защиту (C.Def).",
      "mechanics": "Добавляет прямое число к C.Def: ранг 1: +10, ранг 2: +12, ранг 3: +14, ранг 4: +16. Снижает входящий контурный урон.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 7,
          "spCost": 240,
          "cDefFlat": 10
        },
        {
          "rank": 2,
          "charLevelReq": 7,
          "spCost": 240,
          "cDefFlat": 12
        },
        {
          "rank": 3,
          "charLevelReq": 14,
          "spCost": 1100,
          "cDefFlat": 14
        },
        {
          "rank": 4,
          "charLevelReq": 14,
          "spCost": 1100,
          "cDefFlat": 16
        }
      ],
      "weaponReq": "Любая экипировка"
    },
    {
      "id": "eng_lucky",
      "nameRu": "Везение",
      "nameEn": "Lucky",
      "type": "passive",
      "category": "utility",
      "levelReq": 1,
      "maxLevel": 1,
      "free": true,
      "starter": true,
      "deathKeepItemsUntilLevel": 4,
      "icon": "assets/skills/engineer/eng_lucky.webp",
      "description": "Защитный протокол новичка. При аварийном отключении (гибели) персонажа до 4-го уровня включительно теряется опыт, но инвентарь и экипированные механизмы гарантированно сохраняются.",
      "mechanics": "Предотвращает потерю предметов из инвентаря при гибели персонажа до достижения 5-го уровня.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 1,
          "spCost": 0,
          "deathKeepItemsUntilLevel": 4
        }
      ],
      "weaponReq": "Любая экипировка"
    },
    {
      "id": "eng_expertise_d",
      "nameRu": "Экспертиза D",
      "nameEn": "Expertise D",
      "type": "passive",
      "category": "buff",
      "levelReq": 20,
      "maxLevel": 1,
      "free": true,
      "classChange": true,
      "expertise": 1,
      "icon": "assets/skills/engineer/eng_expertise_d.webp",
      "description": "Квалификация работы с технологиями D-ранга. Снимает штраф несоответствия при использовании оружия и брони грейда D. Присваивается при получении первой профессии на 20 уровне.",
      "mechanics": "Без квалификации экипировка грейда D снижает скорость атаки на 50%, точность на -16 и скорость бега на -20%. Данный навык полностью устраняет штрафы.",
      "ranks": [
        {
          "rank": 1,
          "charLevelReq": 20,
          "spCost": 0,
          "expertise": 1
        }
      ],
      "weaponReq": "Экипировка D-ранга"
    }
  ]
};
});
