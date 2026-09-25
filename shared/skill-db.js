// SHARED / SKILL-DB.JS — auto-built from client skills + L2 C1 names/SP
// Do not hand-edit bulk data; re-run tools/build-skill-db.js after client skill changes.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SKILL_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var SKILLS = {
  "op_power_strike": {
    "id": "op_power_strike",
    "name": "Силовой удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "operator",
    "levelReq": 1,
    "energyCost": 8,
    "cooldown": 3,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 1.5,
    "damageType": "physical",
    "free": true,
    "starter": true,
    "spCost": 50,
    "description": "Мощный удар гаечным ключом. Наносит полтора раза больше обычного физического урона",
    "icon": "assets/skills/operator/op_power_strike.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "skillPower": 0.12
    },
    "l2Name": "Power Strike",
    "l2Class": "Human Fighter"
  },
  "op_iron_punch": {
    "id": "op_iron_punch",
    "name": "Гидравлический кулак",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "operator",
    "levelReq": 5,
    "energyCost": 12,
    "cooldown": 5,
    "chargeTime": 0,
    "range": 2.5,
    "skillPower": 1.8,
    "damageType": "physical",
    "description": "Короткий гидравлический удар. Сильнее обычной атаки, но с большей затратой пара",
    "icon": "assets/skills/operator/op_iron_punch.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "skillPower": 0.14
    },
    "l2Name": "Iron Punch",
    "spCost": 320,
    "l2Class": "Human Fighter"
  },
  "op_steam_vent": {
    "id": "op_steam_vent",
    "name": "Паровой выброс",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "operator",
    "levelReq": 8,
    "energyCost": 16,
    "cooldown": 10,
    "chargeTime": 0.4,
    "range": 4,
    "aoeRadius": 3.5,
    "skillPower": 1.15,
    "damageType": "physical",
    "description": "Резкий выброс пара из клапана. Бьёт всех врагов рядом",
    "icon": "assets/skills/operator/op_steam_vent.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.1,
      "aoeRadius": 0.25
    },
    "l2Name": "Whirlwind",
    "spCost": 1100,
    "l2Class": "Human Fighter"
  },
  "op_oil_slick": {
    "id": "op_oil_slick",
    "name": "Масляная лужа",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "debuff",
    "target": "aoe",
    "class": "operator",
    "levelReq": 10,
    "energyCost": 12,
    "cooldown": 14,
    "chargeTime": 0.3,
    "range": 6,
    "aoeRadius": 3,
    "duration": 6,
    "slowPercent": 0.35,
    "description": "Разлив масла под ногами. Замедляет врагов в зоне",
    "icon": "assets/skills/operator/op_oil_slick.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "slowPercent": 0.08,
      "duration": 1
    },
    "l2Name": "Poison",
    "spCost": 1600,
    "l2Class": "Human Fighter"
  },
  "op_emergency_repair": {
    "id": "op_emergency_repair",
    "name": "Аварийный ремонт",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "heal",
    "target": "self",
    "class": "operator",
    "levelReq": 12,
    "energyCost": 18,
    "cooldown": 22,
    "chargeTime": 1,
    "healPercent": 0.22,
    "description": "Экстренный ремонт своего корпуса. Восстанавливает часть прочности",
    "icon": "assets/skills/operator/op_emergency_repair.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "healPercent": 0.04
    },
    "l2Name": "Battle Heal",
    "spCost": 2400,
    "l2Class": "Human Fighter"
  },
  "op_overclock": {
    "id": "op_overclock",
    "name": "Разгон",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "operator",
    "levelReq": 14,
    "energyCost": 20,
    "cooldown": 35,
    "chargeTime": 0,
    "duration": 20,
    "attackBoost": 0.15,
    "speedBoost": 0.1,
    "description": "Краткий разгон механизмов. Усиливает удары и скорость передвижения",
    "icon": "assets/skills/operator/op_overclock.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "attackBoost": 0.05,
      "duration": 3
    },
    "l2Name": "Might",
    "spCost": 3200,
    "l2Class": "Human Fighter"
  },
  "op_scrap_collect": {
    "id": "op_scrap_collect",
    "name": "Вскрытие корпуса",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "craft",
    "target": "target",
    "class": "operator",
    "levelReq": 16,
    "energyCost": 10,
    "cooldown": 6,
    "chargeTime": 1.2,
    "range": 2,
    "description": "Вскрытие поверженного механизма — добыча дополнительных деталей",
    "icon": "assets/skills/operator/op_scrap_collect.webp",
    "maxLevel": 3,
    "effectPerLevel": {},
    "l2Name": "Spoil",
    "spCost": 4500,
    "l2Class": "Human Fighter"
  },
  "op_weapon_mastery": {
    "id": "op_weapon_mastery",
    "name": "Мастерство инструмента",
    "type": "passive",
    "category": "buff",
    "class": "operator",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 70,
    "description": "Пассивно: каждый уровень умения усиливает ваши физические удары",
    "icon": "assets/skills/operator/op_weapon_mastery.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackPercent": 0.04
    },
    "l2Name": "Weapon Mastery",
    "l2Class": "Human Fighter"
  },
  "op_armor_mastery": {
    "id": "op_armor_mastery",
    "name": "Мастерство брони",
    "type": "passive",
    "category": "buff",
    "class": "operator",
    "levelReq": 5,
    "description": "Пассивно: каждый уровень умения повышает защиту и запас прочности",
    "icon": "assets/skills/operator/op_armor_mastery.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defensePercent": 0.05,
      "hpPercent": 0.03
    },
    "l2Name": "Armor Mastery",
    "spCost": 400,
    "l2Class": "Human Fighter"
  },
  "op_tough_frame": {
    "id": "op_tough_frame",
    "name": "Крепкая рама",
    "type": "passive",
    "category": "buff",
    "class": "operator",
    "levelReq": 10,
    "description": "Пассивно: каждый уровень умения увеличивает максимальный запас прочности",
    "icon": "assets/skills/operator/op_tough_frame.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "hpPercent": 0.06
    },
    "l2Name": "Vital Force",
    "spCost": 1800,
    "l2Class": "Human Fighter"
  },
  "op_quick_hands": {
    "id": "op_quick_hands",
    "name": "Быстрые руки",
    "type": "passive",
    "category": "buff",
    "class": "operator",
    "levelReq": 15,
    "description": "Пассивно: каждый уровень умения ускоряет темп ударов",
    "icon": "assets/skills/operator/op_quick_hands.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackSpeed": 0.03
    },
    "l2Name": "Quick Step",
    "spCost": 3800,
    "l2Class": "Human Fighter"
  },
  "op_expertise_d": {
    "id": "op_expertise_d",
    "name": "Экспертиза D",
    "type": "passive",
    "category": "buff",
    "class": "operator",
    "levelReq": 20,
    "free": true,
    "classChange": true,
    "expertise": 1,
    "spCost": 0,
    "description": "Экспертиза D. Снимает штраф грейда с D-оружия и D-брони (выдаётся с 1-й профессией).",
    "icon": "assets/skills/operator/op_expertise_d.webp",
    "maxLevel": 1,
    "l2Name": "Expertise D",
    "l2Class": "Human Fighter"
  },
  "eng_expertise_d": {
    "id": "eng_expertise_d",
    "name": "Экспертиза D",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 20,
    "free": true,
    "classChange": true,
    "expertise": 1,
    "spCost": 0,
    "description": "Экспертиза D. Снимает штраф грейда с D-оружия и D-брони (выдаётся с 1-й профессией).",
    "icon": "assets/skills/engineer/eng_expertise_d.webp",
    "maxLevel": 1,
    "l2Name": "Expertise D",
    "l2Class": "Human Mystic"
  },
  "op_sturdy_frame": {
    "id": "op_sturdy_frame",
    "name": "Удачливый каркас",
    "type": "passive",
    "category": "utility",
    "class": "operator",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 140,
    "description": "При смерти до 4-го уровня: теряется опыт, но вещи остаются при себе (Lucky)",
    "icon": "assets/skills/operator/op_sturdy_frame.webp",
    "maxLevel": 1,
    "effectPerLevel": {},
    "deathKeepItemsUntilLevel": 4,
    "ranks": [
      {
        "levelReq": 1,
        "spCost": 0,
        "lucky": true
      }
    ],
    "l2Name": "Tough Body",
    "l2Class": "Human Fighter"
  },
  "mech_aggression": {
    "id": "mech_aggression",
    "name": "Провокация",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "mechanic",
    "levelReq": 20,
    "energyCost": 10,
    "cooldown": 4,
    "chargeTime": 0,
    "range": 4,
    "duration": 8,
    "aggroBoost": 3,
    "skillPower": 0.5,
    "damageType": "physical",
    "description": "Провокация цели. Сильный агро + лёгкий урон",
    "icon": "assets/skills/mechanic/mech_aggression.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "aggroBoost": 0.4
    },
    "l2Name": "Aggression",
    "spCost": 3300,
    "l2Class": "Knight"
  },
  "mech_shield_bash": {
    "id": "mech_shield_bash",
    "name": "Удар щитом",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "mechanic",
    "weaponReq": "Щит",
    "shieldReq": true,
    "levelReq": 20,
    "energyCost": 12,
    "cooldown": 6,
    "chargeTime": 0,
    "range": 2.5,
    "skillPower": 1.6,
    "damageType": "physical",
    "stunChance": 0.35,
    "stunDuration": 2,
    "description": "Удар котловым щитом. Шанс оглушения",
    "icon": "assets/skills/mechanic/mech_shield_bash.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "skillPower": 0.12,
      "stunChance": 0.04
    },
    "l2Name": "Shield Stun",
    "spCost": 1500,
    "l2Class": "Knight"
  },
  "mech_defense_aura": {
    "id": "mech_defense_aura",
    "name": "Аура брони",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "party",
    "class": "mechanic",
    "levelReq": 22,
    "energyCost": 20,
    "cooldown": 30,
    "chargeTime": 0.5,
    "range": 12,
    "duration": 120,
    "defenseBoost": 0.12,
    "description": "Аура брони группе. +12% физ. защиты",
    "icon": "assets/skills/mechanic/mech_defense_aura.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defenseBoost": 0.03,
      "duration": 20
    },
    "l2Name": "Defense Aura",
    "spCost": 4700,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_steam_wall": {
    "id": "mech_steam_wall",
    "name": "Паровая стена",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "mechanic",
    "levelReq": 24,
    "energyCost": 25,
    "cooldown": 28,
    "chargeTime": 0.4,
    "duration": 12,
    "defenseBoost": 0.4,
    "aggroBoost": 1.5,
    "description": "Паровая завеса. +40% защиты, повышенный агро",
    "icon": "assets/skills/mechanic/mech_steam_wall.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defenseBoost": 0.08,
      "duration": 2
    },
    "l2Name": "Ultimate Defense",
    "spCost": 4700,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_repair_beam": {
    "id": "mech_repair_beam",
    "name": "Ремонтный луч",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "mechanic",
    "levelReq": 26,
    "energyCost": 22,
    "cooldown": 10,
    "chargeTime": 1,
    "range": 8,
    "healPercent": 0.14,
    "description": "Дистанционный ремонт союзника. 14% HP",
    "icon": "assets/skills/mechanic/mech_repair_beam.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "healPercent": 0.025
    },
    "l2Name": "Divine Heal",
    "spCost": 4000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_reinforced_edge": {
    "id": "mech_reinforced_edge",
    "name": "Усиленное лезвие",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "mechanic",
    "levelReq": 28,
    "energyCost": 18,
    "cooldown": 40,
    "chargeTime": 0.5,
    "duration": 120,
    "attackBoost": 0.1,
    "description": "Закалка кромки. +10% физ. урона на 2 мин",
    "icon": "assets/skills/mechanic/mech_reinforced_edge.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.03
    },
    "l2Name": "Holy Blade",
    "spCost": 18000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_hydraulic_slam": {
    "id": "mech_hydraulic_slam",
    "name": "Гидравлический удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "mechanic",
    "levelReq": 32,
    "energyCost": 30,
    "cooldown": 16,
    "chargeTime": 0.7,
    "range": 4,
    "aoeRadius": 4.5,
    "skillPower": 2,
    "damageType": "physical",
    "knockback": 2,
    "description": "Удар по земле. по площади 200% + отбрасывание",
    "icon": "assets/skills/mechanic/mech_hydraulic_slam.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.18,
      "aoeRadius": 0.4
    },
    "l2Name": "Shield Slam",
    "spCost": 34000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_emergency_shutdown": {
    "id": "mech_emergency_shutdown",
    "name": "Аварийная остановка",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "mechanic",
    "levelReq": 36,
    "energyCost": 35,
    "cooldown": 45,
    "chargeTime": 1.2,
    "range": 3,
    "duration": 4,
    "description": "Принудительное отключение. Стан 4 сек (не боссы)",
    "icon": "assets/skills/mechanic/mech_emergency_shutdown.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "duration": 0.5
    },
    "l2Name": "Arrest",
    "spCost": 55000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_pressure_aura": {
    "id": "mech_pressure_aura",
    "name": "Аура давления",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "toggle",
    "category": "buff",
    "target": "party",
    "class": "mechanic",
    "levelReq": 30,
    "energyCost": 3,
    "cooldown": 0,
    "chargeTime": 0,
    "range": 10,
    "attackBoost": 0.08,
    "defenseBoost": 0.08,
    "description": "Аура: +8% атаки и защиты группе. Расход пара/сек",
    "icon": "assets/skills/mechanic/mech_pressure_aura.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.02,
      "defenseBoost": 0.02
    },
    "l2Name": "Majesty",
    "spCost": 4700,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_reinforced_armor": {
    "id": "mech_reinforced_armor",
    "name": "Усиленная броня",
    "type": "passive",
    "category": "buff",
    "class": "mechanic",
    "levelReq": 21,
    "requiresHeavy": true,
    "description": "+8% физ. защиты за уровень (при надетой тяжёлой броне)",
    "icon": "assets/skills/mechanic/mech_reinforced_armor.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defensePercent": 0.08
    },
    "l2Name": "Heavy Armor Mastery",
    "spCost": 1500,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_shield_mastery": {
    "id": "mech_shield_mastery",
    "name": "Мастерство щита",
    "type": "passive",
    "category": "buff",
    "class": "mechanic",
    "levelReq": 23,
    "description": "+6% шанс блока и +4% физ. защиты за уровень",
    "icon": "assets/skills/mechanic/mech_shield_mastery.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "blockRate": 0.06,
      "defensePercent": 0.04
    },
    "l2Name": "Shield Mastery",
    "spCost": 4700,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_threat_generator": {
    "id": "mech_threat_generator",
    "name": "Генератор угрозы",
    "type": "passive",
    "category": "buff",
    "class": "mechanic",
    "levelReq": 28,
    "description": "+15% агро за уровень",
    "icon": "assets/skills/mechanic/mech_threat_generator.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "aggroBonus": 0.15
    },
    "l2Name": "Hate Aura",
    "spCost": 20000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_last_stand": {
    "id": "mech_last_stand",
    "name": "Последний рубеж",
    "type": "passive",
    "category": "buff",
    "class": "mechanic",
    "levelReq": 35,
    "description": "При HP < 20%: +25% защиты (+5% за ур.)",
    "icon": "assets/skills/mechanic/mech_last_stand.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "lowHpDefense": 0.05
    },
    "l2Name": "Ultimate Defense",
    "spCost": 48000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "mech_steam_reserve": {
    "id": "mech_steam_reserve",
    "name": "Резервный котёл",
    "type": "passive",
    "category": "buff",
    "class": "mechanic",
    "levelReq": 25,
    "description": "Пассивно: каждый уровень увеличивает запас пара.",
    "icon": "assets/skills/mechanic/mech_steam_reserve.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "energyPercent": 0.1
    },
    "l2Name": "Focus Mind",
    "spCost": 39000,
    "l2Class": "Knight",
    "futureUpdate": true
  },
  "dest_power_smash": {
    "id": "dest_power_smash",
    "name": "Сокрушение",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "destroyer",
    "weaponReq": "Оружие ближнего боя (мечи, молоты)",
    "weaponClassReq": "melee",
    "levelReq": 20,
    "energyCost": 14,
    "cooldown": 4,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 2.2,
    "damageType": "physical",
    "description": "Сокрушительный удар. 220% физ. урона",
    "icon": "assets/skills/destroyer/dest_power_smash.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "skillPower": 0.18
    },
    "l2Name": "Power Smash",
    "spCost": 1200,
    "l2Class": "Warrior"
  },
  "dest_stun_attack": {
    "id": "dest_stun_attack",
    "name": "Оглушающий удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "destroyer",
    "levelReq": 22,
    "energyCost": 16,
    "cooldown": 8,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 1.7,
    "damageType": "physical",
    "stunChance": 0.4,
    "stunDuration": 2.5,
    "description": "Удар с шансом оглушения",
    "icon": "assets/skills/destroyer/dest_stun_attack.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "skillPower": 0.12,
      "stunChance": 0.04
    },
    "l2Name": "Stun Attack",
    "spCost": 1200,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_demolish": {
    "id": "dest_demolish",
    "name": "Разрушение",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "destroyer",
    "levelReq": 20,
    "energyCost": 12,
    "cooldown": 4,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 2,
    "damageMult": 2,
    "damageType": "physical",
    "description": "Мощный удар. 200% урона",
    "icon": "assets/skills/destroyer/dest_demolish.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2,
      "damageMult": 0.2
    },
    "l2Name": "Fatal Strike",
    "spCost": 11000,
    "l2Class": "Warrior"
  },
  "dest_war_cry": {
    "id": "dest_war_cry",
    "name": "Боевой гудок",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "destroyer",
    "levelReq": 24,
    "energyCost": 18,
    "cooldown": 40,
    "chargeTime": 0,
    "duration": 30,
    "attackBoost": 0.2,
    "description": "Боевой гудок. +20% физ. урона",
    "icon": "assets/skills/destroyer/dest_war_cry.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.05,
      "duration": 5
    },
    "l2Name": "War Cry",
    "spCost": 3700,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_berserker_steam": {
    "id": "dest_berserker_steam",
    "name": "Пар берсерка",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "destroyer",
    "levelReq": 26,
    "energyCost": 25,
    "cooldown": 45,
    "chargeTime": 0,
    "duration": 20,
    "attackBoost": 0.35,
    "defensePenalty": 0.25,
    "description": "Ярость: +35% атаки, −25% защиты",
    "icon": "assets/skills/destroyer/dest_berserker_steam.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.06,
      "duration": 2
    },
    "l2Name": "Berserker Spirit",
    "spCost": 16000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_frag_grenade": {
    "id": "dest_frag_grenade",
    "name": "Осколочная граната",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "destroyer",
    "levelReq": 28,
    "energyCost": 20,
    "cooldown": 12,
    "chargeTime": 0.3,
    "range": 8,
    "aoeRadius": 4,
    "skillPower": 1.7,
    "damageType": "physical",
    "description": "Бросок гранаты. по площади 170%",
    "icon": "assets/skills/destroyer/dest_frag_grenade.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.15,
      "aoeRadius": 0.3
    },
    "l2Name": "Whirlwind",
    "spCost": 19000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_vicious_stance": {
    "id": "dest_vicious_stance",
    "name": "Жёсткая стойка",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "toggle",
    "category": "buff",
    "target": "self",
    "class": "destroyer",
    "levelReq": 30,
    "energyCost": 2,
    "cooldown": 0,
    "chargeTime": 0,
    "attackBoost": 0.12,
    "defensePenalty": 0.08,
    "description": "Стойка: +12% атаки, −8% защиты. Расход пара/сек",
    "icon": "assets/skills/destroyer/dest_vicious_stance.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.03
    },
    "l2Name": "Vicious Stance",
    "spCost": 3700,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_crushing_blow": {
    "id": "dest_crushing_blow",
    "name": "Сокрушительный удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "destroyer",
    "weaponReq": "Оружие ближнего боя (мечи, молоты)",
    "weaponClassReq": "melee",
    "levelReq": 34,
    "energyCost": 22,
    "cooldown": 10,
    "chargeTime": 0.6,
    "range": 3,
    "skillPower": 2.8,
    "damageType": "physical",
    "critBonus": 0.15,
    "description": "280% урона, +15% шанс крита",
    "icon": "assets/skills/destroyer/dest_crushing_blow.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.22,
      "critBonus": 0.03
    },
    "l2Name": "Hammer Crush",
    "spCost": 42000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_chain_detonation": {
    "id": "dest_chain_detonation",
    "name": "Цепная детонация",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "destroyer",
    "levelReq": 36,
    "energyCost": 32,
    "cooldown": 18,
    "chargeTime": 0.5,
    "range": 6,
    "aoeRadius": 5.5,
    "skillPower": 1.9,
    "damageType": "physical",
    "dotDamage": 12,
    "dotDuration": 5,
    "description": "Серия взрывов + горение 5 сек",
    "icon": "assets/skills/destroyer/dest_chain_detonation.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.15,
      "dotDamage": 4
    },
    "l2Name": "Thunder Storm",
    "spCost": 58000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_heavy_strikes": {
    "id": "dest_heavy_strikes",
    "name": "Тяжёлые удары",
    "type": "passive",
    "category": "buff",
    "class": "destroyer",
    "levelReq": 21,
    "description": "+10% физ. урона за уровень",
    "icon": "assets/skills/destroyer/dest_heavy_strikes.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackPercent": 0.1
    },
    "l2Name": "Sword / Blunt Mastery",
    "spCost": 3700,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_critical_mass": {
    "id": "dest_critical_mass",
    "name": "Критическая масса",
    "type": "passive",
    "category": "buff",
    "class": "destroyer",
    "levelReq": 25,
    "description": "+4% шанс крита за уровень",
    "icon": "assets/skills/destroyer/dest_critical_mass.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "critChance": 0.04
    },
    "l2Name": "Critical Chance",
    "spCost": 11000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_explosive_expert": {
    "id": "dest_explosive_expert",
    "name": "Эксперт-подрывник",
    "type": "passive",
    "category": "buff",
    "class": "destroyer",
    "levelReq": 30,
    "description": "+12% урона взрывов за уровень",
    "icon": "assets/skills/destroyer/dest_explosive_expert.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "explosiveDamage": 0.12
    },
    "l2Name": "Boost HP",
    "spCost": 3700,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "dest_adrenaline": {
    "id": "dest_adrenaline",
    "name": "Адреналин",
    "type": "passive",
    "category": "buff",
    "class": "destroyer",
    "levelReq": 35,
    "description": "При HP < 30%: +20% атаки (+4% за ур.)",
    "icon": "assets/skills/destroyer/dest_adrenaline.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "lowHpAttack": 0.04
    },
    "l2Name": "Adrenaline",
    "spCost": 50000,
    "l2Class": "Warrior",
    "futureUpdate": true
  },
  "gun_mortal_blow": {
    "id": "gun_mortal_blow",
    "name": "Смертельный выпад",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "gunner",
    "weaponReq": "Кинжал",
    "weaponClassReq": "dagger",
    "levelReq": 20,
    "energyCost": 14,
    "cooldown": 5,
    "chargeTime": 0.2,
    "range": 3,
    "skillPower": 2.4,
    "damageType": "physical",
    "critBonus": 0.25,
    "description": "Смертельный выпад кинжалом. Высокий шанс и множитель крита",
    "icon": "assets/skills/gunner/gun_mortal_blow.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "skillPower": 0.18,
      "critBonus": 0.03
    },
    "l2Name": "Mortal Blow",
    "spCost": 1400,
    "l2Class": "Rogue"
  },
  "gun_precision_shot": {
    "id": "gun_precision_shot",
    "name": "Точный выстрел",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "gunner",
    "weaponReq": "Лук",
    "weaponClassReq": "bow",
    "levelReq": 20,
    "energyCost": 10,
    "cooldown": 3,
    "chargeTime": 0.3,
    "range": 12,
    "skillPower": 1.8,
    "damageType": "physical",
    "critBonus": 0.15,
    "damageMult": 1.8,
    "description": "Прицельный выстрел. 180% + крит",
    "icon": "assets/skills/gunner/gun_precision_shot.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "skillPower": 0.14,
      "critBonus": 0.04
    },
    "l2Name": "Power Shot",
    "spCost": 1400,
    "l2Class": "Rogue"
  },
  "gun_dash": {
    "id": "gun_dash",
    "name": "Рывок",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "utility",
    "target": "self",
    "class": "gunner",
    "levelReq": 22,
    "energyCost": 12,
    "cooldown": 18,
    "chargeTime": 0,
    "duration": 3,
    "speedBoost": 0.6,
    "description": "Рывок. +60% скорости 3 сек",
    "icon": "assets/skills/gunner/gun_dash.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "duration": 0.5,
      "speedBoost": 0.1
    },
    "l2Name": "Dash",
    "spCost": 3400,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_rapid_fire": {
    "id": "gun_rapid_fire",
    "name": "Скорострельность",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "gunner",
    "weaponReq": "Лук",
    "weaponClassReq": "bow",
    "levelReq": 24,
    "energyCost": 20,
    "cooldown": 14,
    "chargeTime": 0,
    "duration": 5,
    "attackSpeedBoost": 0.8,
    "description": "Серия быстрых выстрелов",
    "icon": "assets/skills/gunner/gun_rapid_fire.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "duration": 0.8,
      "attackSpeedBoost": 0.15
    },
    "l2Name": "Double Shot",
    "spCost": 11000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_piercing_round": {
    "id": "gun_piercing_round",
    "name": "Бронебойный снаряд",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "gunner",
    "weaponReq": "Лук",
    "weaponClassReq": "bow",
    "levelReq": 26,
    "energyCost": 16,
    "cooldown": 9,
    "chargeTime": 0.4,
    "range": 12,
    "skillPower": 2,
    "damageType": "physical",
    "ignoreDefense": 0.4,
    "description": "200% урона, игнор 40% физ. защиты",
    "icon": "assets/skills/gunner/gun_piercing_round.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.15,
      "ignoreDefense": 0.08
    },
    "l2Name": "Bleed",
    "spCost": 5900,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_ultimate_evasion": {
    "id": "gun_ultimate_evasion",
    "name": "Максимальное уклонение",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "gunner",
    "levelReq": 28,
    "energyCost": 22,
    "cooldown": 50,
    "chargeTime": 0,
    "duration": 8,
    "evasionBoost": 0.5,
    "description": "На несколько секунд резко растёт уклонение — сложнее попасть по вам.",
    "icon": "assets/skills/gunner/gun_ultimate_evasion.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "evasionBoost": 0.1,
      "duration": 1
    },
    "l2Name": "Ultimate Evasion",
    "spCost": 11000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_smoke_screen": {
    "id": "gun_smoke_screen",
    "name": "Дымовая завеса",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "utility",
    "target": "self",
    "class": "gunner",
    "levelReq": 26,
    "energyCost": 15,
    "cooldown": 22,
    "chargeTime": 0,
    "duration": 6,
    "evasionBoost": 0.35,
    "description": "Дым. +35% уклонения",
    "icon": "assets/skills/gunner/gun_smoke_screen.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "evasionBoost": 0.08,
      "duration": 1
    },
    "l2Name": "Veil",
    "spCost": 16000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_explosive_trap": {
    "id": "gun_explosive_trap",
    "name": "Взрывная ловушка",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "gunner",
    "levelReq": 32,
    "energyCost": 22,
    "cooldown": 16,
    "chargeTime": 0.5,
    "range": 8,
    "aoeRadius": 3,
    "skillPower": 2.1,
    "damageType": "physical",
    "trapDuration": 30,
    "description": "Мина. Взрыв при приближении",
    "icon": "assets/skills/gunner/gun_explosive_trap.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.18,
      "aoeRadius": 0.3
    },
    "l2Name": "Blinding Blow",
    "spCost": 36000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_sniper_mode": {
    "id": "gun_sniper_mode",
    "name": "Режим снайпера",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "toggle",
    "category": "buff",
    "target": "self",
    "class": "gunner",
    "weaponReq": "Лук",
    "weaponClassReq": "bow",
    "levelReq": 34,
    "energyCost": 4,
    "cooldown": 0,
    "chargeTime": 0,
    "rangeBonus": 5,
    "damageBoost": 0.25,
    "speedPenalty": 0.45,
    "description": "+5 дальность, +25% урон, −45% скорость",
    "icon": "assets/skills/gunner/gun_sniper_mode.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "damageBoost": 0.05,
      "rangeBonus": 1
    },
    "l2Name": "Snipe",
    "spCost": 45000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_bullet_storm": {
    "id": "gun_bullet_storm",
    "name": "Шквал заклёпок",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "gunner",
    "weaponReq": "Лук",
    "weaponClassReq": "bow",
    "levelReq": 38,
    "energyCost": 40,
    "cooldown": 28,
    "chargeTime": 1,
    "range": 10,
    "aoeRadius": 5,
    "skillPower": 2.8,
    "damageType": "physical",
    "hits": 5,
    "description": "Залп по площади. Высокий суммарный урон",
    "icon": "assets/skills/gunner/gun_bullet_storm.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "skillPower": 0.25,
      "hits": 1
    },
    "l2Name": "Burst Shot",
    "spCost": 70000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_eagle_eye": {
    "id": "gun_eagle_eye",
    "name": "Глаз орла",
    "type": "passive",
    "category": "buff",
    "class": "gunner",
    "levelReq": 21,
    "description": "+1.5 дальность за уровень",
    "icon": "assets/skills/gunner/gun_eagle_eye.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "rangeBonus": 1.5
    },
    "l2Name": "Rapid Shot",
    "spCost": 18000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_deadly_aim": {
    "id": "gun_deadly_aim",
    "name": "Смертельная точность",
    "type": "passive",
    "category": "buff",
    "class": "gunner",
    "levelReq": 25,
    "description": "+5% шанс крита за уровень",
    "icon": "assets/skills/gunner/gun_deadly_aim.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "critChance": 0.05
    },
    "l2Name": "Critical Chance",
    "spCost": 11000,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_evasion_protocol": {
    "id": "gun_evasion_protocol",
    "name": "Протокол уклонения",
    "type": "passive",
    "category": "buff",
    "class": "gunner",
    "levelReq": 28,
    "requiresLight": true,
    "description": "+4% уклонения за уровень (при надетой лёгкой броне)",
    "icon": "assets/skills/gunner/gun_evasion_protocol.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "evasion": 0.04
    },
    "l2Name": "Light Armor Mastery",
    "spCost": 1700,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "gun_overcharge": {
    "id": "gun_overcharge",
    "name": "Перезаряд",
    "type": "passive",
    "category": "buff",
    "class": "gunner",
    "levelReq": 35,
    "description": "Криты +15% урона (+3% за ур.)",
    "icon": "assets/skills/gunner/gun_overcharge.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "critDamage": 0.03
    },
    "l2Name": "Bow Mastery",
    "spCost": 1100,
    "l2Class": "Rogue",
    "futureUpdate": true
  },
  "eng_lucky": {
    "id": "eng_lucky",
    "name": "Везение",
    "type": "passive",
    "category": "utility",
    "class": "engineer",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 0,
    "description": "При смерти до 4-го уровня: теряется опыт, но вещи остаются при себе",
    "icon": "assets/skills/engineer/eng_lucky.webp",
    "maxLevel": 1,
    "effectPerLevel": {},
    "deathKeepItemsUntilLevel": 4,
    "ranks": [
      {
        "levelReq": 1,
        "spCost": 0
      }
    ],
    "l2Name": "Lucky",
    "l2Class": "Human Mystic"
  },
  "eng_expert_tune": {
    "id": "eng_expert_tune",
    "name": "Искусная настройка",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 0,
    "description": "Пассивно: в полной робе (куртка и штаны) навыки готовятся вдвое быстрее. Некоторые полные сеты робы ускоряют ещё сильнее.",
    "icon": "assets/skills/engineer/eng_expert_tune.webp",
    "maxLevel": 1,
    "effectPerLevel": {},
    "requiresRobe": true,
    "requiresRobeSet": true,
    "ranks": [
      {
        "levelReq": 1,
        "spCost": 0,
        "chargeSpeed": 1
      }
    ],
    "l2Name": "Expert Casting",
    "l2Class": "Human Mystic"
  },
  "eng_robe_step": {
    "id": "eng_robe_step",
    "name": "Шаг мастера",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 0,
    "description": "Пассивно: +25% скорости атаки при комплекте робы (куртка+штаны)",
    "icon": "assets/skills/engineer/eng_robe_step.webp",
    "maxLevel": 1,
    "effectPerLevel": {},
    "requiresRobe": true,
    "requiresRobeSet": true,
    "ranks": [
      {
        "levelReq": 1,
        "spCost": 0,
        "attackSpeed": 0.25
      }
    ],
    "l2Name": "Magician Movement",
    "l2Class": "Human Mystic"
  },
  "eng_coolant_mind": {
    "id": "eng_coolant_mind",
    "name": "Восстановление пара",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 1,
    "free": true,
    "starter": true,
    "spCost": 0,
    "description": "Пассивно: в полной робе (куртка и штаны) пар восстанавливается быстрее",
    "icon": "assets/skills/engineer/eng_coolant_mind.webp",
    "maxLevel": 1,
    "effectPerLevel": {},
    "requiresRobe": true,
    "requiresRobeSet": true,
    "ranks": [
      {
        "levelReq": 1,
        "spCost": 0,
        "energyRegen": 0.2
      }
    ],
    "l2Name": "Mana Recovery",
    "l2Class": "Human Mystic"
  },
  "eng_pressure_bolt": {
    "id": "eng_pressure_bolt",
    "name": "Давящий импульс",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "engineer",
    "levelReq": 1,
    "energyCost": 9,
    "cooldown": 6,
    "chargeTime": 4,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "skillPower": 12,
    "damageType": "circuit",
    "free": true,
    "starter": true,
    "spCost": 50,
    "description": "Сгусток давления из резонатора. Основная атака инженера. Нужен резонатор и достаточный уровень контура. Тратит пар, долгая подготовка",
    "icon": "assets/skills/engineer/eng_pressure_bolt.webp",
    "maxLevel": 5,
    "ranks": [
      {
        "levelReq": 1,
        "energyCost": 9,
        "l2Power": 12,
        "spCost": 0
      },
      {
        "levelReq": 7,
        "energyCost": 10,
        "l2Power": 13,
        "spCost": 240
      },
      {
        "levelReq": 7,
        "energyCost": 11,
        "l2Power": 15,
        "spCost": 240
      },
      {
        "levelReq": 14,
        "energyCost": 13,
        "l2Power": 18,
        "spCost": 1100
      },
      {
        "levelReq": 14,
        "energyCost": 15,
        "l2Power": 21,
        "spCost": 1100
      }
    ],
    "l2Name": "Wind Strike",
    "l2Class": "Human Mystic"
  },
  "eng_self_repair": {
    "id": "eng_self_repair",
    "name": "Саморемонт",
    "type": "active",
    "category": "heal",
    "target": "self",
    "class": "engineer",
    "levelReq": 1,
    "energyCost": 14,
    "cooldown": 10,
    "chargeTime": 5,
    "healPower": 42,
    "free": true,
    "starter": true,
    "spCost": 0,
    "description": "Полевой ремонт собственного корпуса. Восстанавливает прочность за счёт пара",
    "icon": "assets/skills/engineer/eng_self_repair.webp",
    "maxLevel": 1,
    "ranks": [
      {
        "levelReq": 1,
        "energyCost": 14,
        "healPower": 42,
        "spCost": 0
      }
    ],
    "l2Name": "Self Heal",
    "l2Class": "Human Mystic"
  },
  "eng_weapon_mastery": {
    "id": "eng_weapon_mastery",
    "name": "Мастерство инструмента",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 7,
    "spCost": 470,
    "description": "Пассивно: усиливает физические удары и схемный урон от оружия",
    "icon": "assets/skills/engineer/eng_weapon_mastery.webp",
    "maxLevel": 2,
    "ranks": [
      {
        "levelReq": 7,
        "spCost": 470,
        "pAtkPercent": 0.45,
        "pAtkFlat": 1.5,
        "cAtkPercent": 0.17,
        "cAtkFlat": 1.9
      },
      {
        "levelReq": 14,
        "spCost": 2100,
        "pAtkPercent": 0.45,
        "pAtkFlat": 2.8,
        "cAtkPercent": 0.17,
        "cAtkFlat": 3.5
      }
    ],
    "l2Name": "Weapon Mastery",
    "l2Class": "Human Mystic"
  },
  "eng_armor_mastery": {
    "id": "eng_armor_mastery",
    "name": "Мастерство оболочки",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 7,
    "spCost": 470,
    "description": "Пассивно: укрепляет броню — меньше физического урона",
    "icon": "assets/skills/engineer/eng_armor_mastery.webp",
    "maxLevel": 3,
    "ranks": [
      {
        "levelReq": 7,
        "spCost": 470,
        "pDefFlat": 6.7
      },
      {
        "levelReq": 14,
        "spCost": 1100,
        "pDefFlat": 8
      },
      {
        "levelReq": 14,
        "spCost": 1100,
        "pDefFlat": 9.2
      }
    ],
    "l2Name": "Armor Mastery",
    "l2Class": "Human Mystic"
  },
  "eng_circuit_mastery": {
    "id": "eng_circuit_mastery",
    "name": "Изоляция контура",
    "type": "passive",
    "category": "buff",
    "class": "engineer",
    "levelReq": 7,
    "spCost": 240,
    "description": "Пассивно: усиливает защиту контура от схемных атак",
    "icon": "assets/skills/engineer/eng_circuit_mastery.webp",
    "maxLevel": 4,
    "ranks": [
      {
        "levelReq": 7,
        "spCost": 240,
        "cDefFlat": 10
      },
      {
        "levelReq": 7,
        "spCost": 240,
        "cDefFlat": 12
      },
      {
        "levelReq": 14,
        "spCost": 1100,
        "cDefFlat": 14
      },
      {
        "levelReq": 14,
        "spCost": 1100,
        "cDefFlat": 16
      }
    ],
    "l2Name": "Anti Magic",
    "l2Class": "Human Mystic"
  },
  "eng_pressure_seal": {
    "id": "eng_pressure_seal",
    "name": "Охлаждающий шип",
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 9,
    "cooldown": 2,
    "chargeTime": 3.1,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "skillPower": 8,
    "damageType": "circuit",
    "duration": 60,
    "slowPercent": 0.2,
    "spCost": 240,
    "description": "Холодный шип давления. Наносит схемный урон и замедляет цель на минуту",
    "icon": "assets/skills/engineer/eng_pressure_seal.webp",
    "maxLevel": 4,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 9,
        "l2Power": 8,
        "slowPercent": 0.2,
        "duration": 60,
        "spCost": 240
      },
      {
        "levelReq": 7,
        "energyCost": 10,
        "l2Power": 9,
        "slowPercent": 0.2,
        "duration": 60,
        "spCost": 240
      },
      {
        "levelReq": 14,
        "energyCost": 14,
        "l2Power": 11,
        "slowPercent": 0.2,
        "duration": 60,
        "spCost": 1100
      },
      {
        "levelReq": 14,
        "energyCost": 15,
        "l2Power": 13,
        "slowPercent": 0.2,
        "duration": 60,
        "spCost": 1100
      }
    ],
    "l2Name": "Ice Bolt",
    "l2Class": "Human Mystic"
  },
  "eng_field_repair": {
    "id": "eng_field_repair",
    "name": "Полевой ремонт",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 10,
    "cooldown": 10,
    "chargeTime": 5,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "healPower": 49,
    "spCost": 160,
    "description": "Ремонт выбранного союзника (или себя). Тратит пар, долгая подготовка",
    "icon": "assets/skills/engineer/eng_field_repair.webp",
    "maxLevel": 6,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 10,
        "healPower": 49,
        "spCost": 160
      },
      {
        "levelReq": 7,
        "energyCost": 15,
        "healPower": 58,
        "spCost": 160
      },
      {
        "levelReq": 7,
        "energyCost": 17,
        "healPower": 67,
        "spCost": 160
      },
      {
        "levelReq": 14,
        "energyCost": 20,
        "healPower": 76,
        "spCost": 700
      },
      {
        "levelReq": 14,
        "energyCost": 25,
        "healPower": 86,
        "spCost": 700
      },
      {
        "levelReq": 14,
        "energyCost": 31,
        "healPower": 95,
        "spCost": 700
      }
    ],
    "l2Name": "Heal",
    "l2Class": "Human Mystic"
  },
  "eng_might": {
    "id": "eng_might",
    "name": "Разгон привода",
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 8,
    "cooldown": 6,
    "chargeTime": 4,
    "range": 21,
    "effectRange": 38,
    "l2CastRange": 400,
    "l2EffectRange": 900,
    "duration": 1200,
    "attackBoost": 0.08,
    "spCost": 470,
    "description": "Разгоняет привод цели: сильнее физические удары на 20 минут",
    "icon": "assets/skills/engineer/eng_might.webp",
    "maxLevel": 3,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 8,
        "attackBoost": 0.08,
        "duration": 1200,
        "spCost": 470
      },
      {
        "levelReq": 20,
        "energyCost": 18,
        "attackBoost": 0.12,
        "duration": 1200,
        "spCost": 2000
      },
      {
        "levelReq": 40,
        "energyCost": 28,
        "attackBoost": 0.15,
        "duration": 1200,
        "spCost": 8000
      }
    ],
    "l2Name": "Might",
    "l2Class": "Human Mystic"
  },
  "eng_shield": {
    "id": "eng_shield",
    "name": "Кожух",
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 8,
    "cooldown": 6,
    "chargeTime": 4,
    "range": 21,
    "effectRange": 38,
    "l2CastRange": 400,
    "l2EffectRange": 900,
    "duration": 1200,
    "defenseBoost": 0.08,
    "spCost": 470,
    "description": "Надевает защитный кожух: выше физическая защита на 20 минут",
    "icon": "assets/skills/engineer/eng_shield.webp",
    "maxLevel": 3,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 8,
        "defenseBoost": 0.08,
        "duration": 1200,
        "spCost": 470
      },
      {
        "levelReq": 20,
        "energyCost": 20,
        "defenseBoost": 0.12,
        "duration": 1200,
        "spCost": 2000
      },
      {
        "levelReq": 40,
        "energyCost": 31,
        "defenseBoost": 0.15,
        "duration": 1200,
        "spCost": 8000
      }
    ],
    "l2Name": "Shield",
    "l2Class": "Human Mystic"
  },
  "eng_cure_toxin": {
    "id": "eng_cure_toxin",
    "name": "Промывка",
    "type": "active",
    "category": "utility",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 10,
    "cooldown": 2,
    "chargeTime": 0.5,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "curePoison": true,
    "spCost": 470,
    "description": "Промывка контура — снимает слабый яд с цели",
    "icon": "assets/skills/engineer/eng_cure_toxin.webp",
    "maxLevel": 1,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 10,
        "curePoison": true,
        "poisonPowerMax": 3,
        "spCost": 470
      }
    ],
    "l2Name": "Cure Poison",
    "l2Class": "Human Mystic"
  },
  "eng_curse_corrode": {
    "id": "eng_curse_corrode",
    "name": "Коррозия",
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "engineer",
    "levelReq": 7,
    "energyCost": 8,
    "cooldown": 2,
    "chargeTime": 3,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "duration": 30,
    "dotDamage": 21,
    "dotDuration": 30,
    "healReduction": 0.2,
    "landChance": 0.7,
    "spCost": 470,
    "description": "Запускает коррозию: цель теряет прочность со временем и хуже чинится",
    "icon": "assets/skills/engineer/eng_curse_corrode.webp",
    "maxLevel": 1,
    "ranks": [
      {
        "levelReq": 7,
        "energyCost": 8,
        "dotDamage": 21,
        "dotTicks": 30,
        "duration": 30,
        "healReduction": 0.2,
        "landChance": 0.7,
        "spCost": 470
      }
    ],
    "l2Name": "Curse: Poison",
    "l2Class": "Human Mystic"
  },
  "eng_pressure_drain": {
    "id": "eng_pressure_drain",
    "name": "Вытяжка давления",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "engineer",
    "levelReq": 14,
    "energyCost": 25,
    "cooldown": 12,
    "chargeTime": 4,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "skillPower": 18,
    "damageType": "circuit",
    "lifeSteal": 0.4,
    "spCost": 1100,
    "description": "Вытягивает давление из цели: схемный урон и часть урона возвращается вам как прочность",
    "icon": "assets/skills/engineer/eng_pressure_drain.webp",
    "maxLevel": 6,
    "ranks": [
      {
        "levelReq": 14,
        "energyCost": 25,
        "l2Power": 18,
        "lifeSteal": 0.4,
        "spCost": 1100
      },
      {
        "levelReq": 14,
        "energyCost": 28,
        "l2Power": 21,
        "lifeSteal": 0.4,
        "spCost": 1100
      },
      {
        "levelReq": 20,
        "energyCost": 30,
        "l2Power": 23,
        "lifeSteal": 0.4,
        "spCost": 3000
      },
      {
        "levelReq": 20,
        "energyCost": 32,
        "l2Power": 26,
        "lifeSteal": 0.4,
        "spCost": 3000
      },
      {
        "levelReq": 40,
        "energyCost": 36,
        "l2Power": 29,
        "lifeSteal": 0.4,
        "spCost": 12000
      },
      {
        "levelReq": 40,
        "energyCost": 40,
        "l2Power": 32,
        "lifeSteal": 0.4,
        "spCost": 12000
      }
    ],
    "l2Name": "Vampiric Touch",
    "l2Class": "Human Mystic"
  },
  "eng_battle_repair": {
    "id": "eng_battle_repair",
    "name": "Боевой ремонт",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "engineer",
    "levelReq": 14,
    "energyCost": 25,
    "cooldown": 3,
    "chargeTime": 2,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "healPower": 83,
    "spCost": 700,
    "description": "Быстрый ремонт в бою — меньше подготовки, чем у полевого ремонта",
    "icon": "assets/skills/engineer/eng_battle_repair.webp",
    "maxLevel": 1,
    "ranks": [
      {
        "levelReq": 14,
        "energyCost": 25,
        "healPower": 83,
        "spCost": 700
      }
    ],
    "l2Name": "Battle Heal",
    "l2Class": "Human Mystic"
  },
  "eng_group_repair": {
    "id": "eng_group_repair",
    "name": "Групповой ремонт",
    "type": "active",
    "category": "heal",
    "target": "party",
    "class": "engineer",
    "levelReq": 14,
    "energyCost": 40,
    "cooldown": 25,
    "chargeTime": 7,
    "range": 55,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "healPower": 66,
    "spCost": 700,
    "description": "Ремонт всей группы сразу. Долгая подготовка, большой расход пара",
    "icon": "assets/skills/engineer/eng_group_repair.webp",
    "maxLevel": 3,
    "ranks": [
      {
        "levelReq": 14,
        "energyCost": 40,
        "healPower": 66,
        "spCost": 700
      },
      {
        "levelReq": 14,
        "energyCost": 48,
        "healPower": 76,
        "spCost": 700
      },
      {
        "levelReq": 14,
        "energyCost": 56,
        "healPower": 86,
        "spCost": 700
      }
    ],
    "l2Name": "Group Heal",
    "l2Class": "Human Mystic"
  },
  "eng_curse_weak": {
    "id": "eng_curse_weak",
    "name": "Ослабление привода",
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "engineer",
    "levelReq": 14,
    "energyCost": 3,
    "cooldown": 2,
    "chargeTime": 1.5,
    "range": 30,
    "effectRange": 55,
    "l2CastRange": 600,
    "l2EffectRange": 1100,
    "duration": 30,
    "attackReduction": 0.17,
    "landChance": 0.8,
    "spCost": 2100,
    "description": "Ослабляет привод цели: её удары становятся слабее на полминуты",
    "icon": "assets/skills/engineer/eng_curse_weak.webp",
    "maxLevel": 1,
    "ranks": [
      {
        "levelReq": 14,
        "energyCost": 3,
        "attackReduction": 0.17,
        "duration": 30,
        "landChance": 0.8,
        "spCost": 2100
      }
    ],
    "l2Name": "Curse: Weakness",
    "l2Class": "Human Mystic"
  },
  "con_overload": {
    "id": "con_overload",
    "name": "Перегруз",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "constructor",
    "levelReq": 20,
    "energyCost": 28,
    "cooldown": 7,
    "chargeTime": 1,
    "range": 14,
    "skillPower": 2.3,
    "damageType": "circuit",
    "description": "Перегруз контура — сильный схемный разряд в одну цель",
    "icon": "assets/skills/constructor/con_overload.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "skillPower": 0.2
    },
    "l2Name": "Prominence",
    "spCost": 16000,
    "l2Class": "Wizard"
  },
  "con_coolant_bolt": {
    "id": "con_coolant_bolt",
    "name": "Охлаждающий болт",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "constructor",
    "levelReq": 22,
    "energyCost": 18,
    "cooldown": 4,
    "chargeTime": 0.6,
    "range": 13,
    "skillPower": 1.6,
    "damageType": "circuit",
    "duration": 5,
    "slowPercent": 0.3,
    "description": "Охлаждающий болт: схемный урон и замедление",
    "icon": "assets/skills/constructor/con_coolant_bolt.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "skillPower": 0.12,
      "slowPercent": 0.05
    },
    "l2Name": "Ice Bolt",
    "spCost": 1400,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "con_steam_nova": {
    "id": "con_steam_nova",
    "name": "Паровая нова",
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "constructor",
    "levelReq": 26,
    "energyCost": 36,
    "cooldown": 16,
    "chargeTime": 1.2,
    "range": 10,
    "aoeRadius": 5,
    "skillPower": 1.7,
    "damageType": "circuit",
    "description": "Взрыв пара вокруг цели — урон по площади",
    "icon": "assets/skills/constructor/con_steam_nova.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "skillPower": 0.15,
      "aoeRadius": 0.3
    },
    "l2Name": "Blaze",
    "spCost": 1400,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "con_surge": {
    "id": "con_surge",
    "name": "Скачок напряжения",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "constructor",
    "levelReq": 30,
    "energyCost": 32,
    "cooldown": 10,
    "chargeTime": 0.9,
    "range": 14,
    "skillPower": 2.6,
    "damageType": "circuit",
    "description": "Концентрированный разряд высокого напряжения",
    "icon": "assets/skills/constructor/con_surge.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2
    },
    "l2Name": "Aura Burn",
    "spCost": 1400,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "con_focus_protocol": {
    "id": "con_focus_protocol",
    "name": "Протокол фокуса",
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "constructor",
    "levelReq": 24,
    "energyCost": 20,
    "cooldown": 60,
    "chargeTime": 0.3,
    "duration": 120,
    "cancelResist": 0.4,
    "description": "Протокол фокуса: сложнее сбить вашу подготовку навыка",
    "icon": "assets/skills/constructor/con_focus_protocol.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "cancelResist": 0.1
    },
    "l2Name": "Concentration",
    "spCost": 2900,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "con_quick_charge": {
    "id": "con_quick_charge",
    "name": "Быстрая зарядка",
    "type": "passive",
    "category": "buff",
    "class": "constructor",
    "levelReq": 21,
    "description": "Пассивно: ускоряет подготовку навыков",
    "icon": "assets/skills/constructor/con_quick_charge.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "chargeSpeed": 0.06
    },
    "l2Name": "Quick Recovery",
    "spCost": 2900,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "con_high_pressure": {
    "id": "con_high_pressure",
    "name": "Высокое давление",
    "type": "passive",
    "category": "buff",
    "class": "constructor",
    "levelReq": 28,
    "description": "Пассивно: каждый уровень повышает схемный урон",
    "icon": "assets/skills/constructor/con_high_pressure.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "cAtkPercent": 0.08
    },
    "l2Name": "Empower",
    "spCost": 2900,
    "l2Class": "Wizard",
    "futureUpdate": true
  },
  "tec_repair": {
    "id": "tec_repair",
    "name": "Ремонт",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "technomancer",
    "levelReq": 20,
    "energyCost": 24,
    "cooldown": 4,
    "chargeTime": 1.2,
    "range": 12,
    "healPercent": 0.28,
    "description": "Ремонт выбранной цели — восстанавливает заметную часть прочности",
    "icon": "assets/skills/technomancer/tec_repair.webp",
    "maxLevel": 9,
    "effectPerLevel": {
      "healPercent": 0.04
    },
    "l2Name": "Heal",
    "spCost": 1100,
    "l2Class": "Cleric"
  },
  "tec_group_overhaul": {
    "id": "tec_group_overhaul",
    "name": "Групповая переборка",
    "type": "active",
    "category": "heal",
    "target": "party",
    "class": "technomancer",
    "levelReq": 24,
    "energyCost": 36,
    "cooldown": 16,
    "chargeTime": 1.4,
    "range": 12,
    "healPercent": 0.18,
    "description": "Лёгкий ремонт всей группы",
    "icon": "assets/skills/technomancer/tec_group_overhaul.webp",
    "maxLevel": 7,
    "effectPerLevel": {
      "healPercent": 0.03
    },
    "l2Name": "Group Heal",
    "spCost": 1100,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_might": {
    "id": "tec_might",
    "name": "Усиление привода",
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "technomancer",
    "levelReq": 20,
    "energyCost": 16,
    "cooldown": 8,
    "chargeTime": 0.6,
    "range": 12,
    "duration": 300,
    "attackBoost": 0.12,
    "description": "Усиливает привод цели: сильнее удары на несколько минут",
    "icon": "assets/skills/technomancer/tec_might.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.03
    },
    "l2Name": "Might",
    "spCost": 3300,
    "l2Class": "Cleric"
  },
  "tec_shield": {
    "id": "tec_shield",
    "name": "Экран брони",
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "technomancer",
    "levelReq": 22,
    "energyCost": 16,
    "cooldown": 8,
    "chargeTime": 0.6,
    "range": 12,
    "duration": 300,
    "defenseBoost": 0.12,
    "description": "Экран брони на цели: выше физическая защита",
    "icon": "assets/skills/technomancer/tec_shield.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defenseBoost": 0.03
    },
    "l2Name": "Shield",
    "spCost": 6900,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_servo_boost": {
    "id": "tec_servo_boost",
    "name": "Серво-ускорение",
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "technomancer",
    "levelReq": 26,
    "energyCost": 18,
    "cooldown": 10,
    "chargeTime": 0.5,
    "range": 12,
    "duration": 300,
    "speedBoost": 0.2,
    "description": "Разгоняет сервоприводы: цель бежит быстрее",
    "icon": "assets/skills/technomancer/tec_servo_boost.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "speedBoost": 0.05
    },
    "l2Name": "Wind Walk",
    "spCost": 3300,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_protocol_buff": {
    "id": "tec_protocol_buff",
    "name": "Протокол привода",
    "type": "active",
    "category": "buff",
    "target": "party",
    "class": "technomancer",
    "levelReq": 28,
    "energyCost": 28,
    "cooldown": 35,
    "chargeTime": 0.8,
    "range": 21,
    "duration": 1200,
    "attackBoost": 0.12,
    "description": "Протокол для всей группы: усиление ударов надолго",
    "icon": "assets/skills/technomancer/tec_protocol_buff.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.03
    },
    "l2Name": "Bless the Soul",
    "spCost": 20000,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_protocol_bless": {
    "id": "tec_protocol_bless",
    "name": "Протокол оболочки",
    "type": "active",
    "category": "buff",
    "target": "party",
    "class": "technomancer",
    "levelReq": 24,
    "energyCost": 25,
    "cooldown": 30,
    "chargeTime": 0.5,
    "range": 21,
    "duration": 1200,
    "defenseBoost": 0.12,
    "description": "Протокол для всей группы: усиление брони надолго",
    "icon": "assets/skills/technomancer/tec_protocol_bless.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "defenseBoost": 0.03
    },
    "l2Name": "Bless the Body",
    "spCost": 12000,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_battle_repair": {
    "id": "tec_battle_repair",
    "name": "Боевой ремонт",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "technomancer",
    "levelReq": 32,
    "energyCost": 30,
    "cooldown": 6,
    "chargeTime": 0.6,
    "range": 12,
    "healPercent": 0.2,
    "description": "Быстрый ремонт в бою",
    "icon": "assets/skills/technomancer/tec_battle_repair.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "healPercent": 0.035
    },
    "l2Name": "Greater Battle Heal",
    "spCost": 36000,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_quick_recovery": {
    "id": "tec_quick_recovery",
    "name": "Быстрое восстановление",
    "type": "passive",
    "category": "buff",
    "class": "technomancer",
    "levelReq": 21,
    "description": "Пассивно: сильнее ремонт и больше запас пара",
    "icon": "assets/skills/technomancer/tec_quick_recovery.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "healPower": 0.05,
      "energyPercent": 0.04
    },
    "l2Name": "Fast HP Recovery",
    "spCost": 21000,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "tec_resist_corrosion": {
    "id": "tec_resist_corrosion",
    "name": "Антикоррозия",
    "type": "passive",
    "category": "buff",
    "class": "technomancer",
    "levelReq": 28,
    "description": "Пассивно: лучше держит схемные атаки",
    "icon": "assets/skills/technomancer/tec_resist_corrosion.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "cDefPercent": 0.06
    },
    "l2Name": "Resist Poison",
    "spCost": 20000,
    "l2Class": "Cleric",
    "futureUpdate": true
  },
  "bg_iron_will": {
    "id": "bg_iron_will",
    "name": "Железная воля",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "boiler_guardian",
    "levelReq": 40,
    "energyCost": 40,
    "cooldown": 60,
    "chargeTime": 0,
    "duration": 20,
    "defenseBoost": 0.5,
    "immunityCC": true,
    "description": "Кратко: почти не сбивают с толку и сильно растёт защита",
    "icon": "assets/skills/boiler_guardian/bg_iron_will.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "defenseBoost": 0.1,
      "duration": 3
    },
    "l2Name": "Iron Will",
    "spCost": 115000,
    "l2Class": "Dark Avenger",
    "futureUpdate": true
  },
  "bg_drain_strike": {
    "id": "bg_drain_strike",
    "name": "Вытягивающий удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "boiler_guardian",
    "levelReq": 40,
    "energyCost": 28,
    "cooldown": 8,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 1.8,
    "damageType": "physical",
    "lifeSteal": 0.35,
    "description": "Физический удар, часть урона возвращается вам как прочность",
    "icon": "assets/skills/boiler_guardian/bg_drain_strike.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.15,
      "lifeSteal": 0.05
    },
    "l2Name": "Drain Health",
    "spCost": 125000,
    "l2Class": "Dark Avenger",
    "futureUpdate": true
  },
  "re_mass_repair": {
    "id": "re_mass_repair",
    "name": "Массовый ремонт",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "heal",
    "target": "party",
    "class": "repair_engineer",
    "levelReq": 40,
    "energyCost": 45,
    "cooldown": 18,
    "chargeTime": 1.5,
    "range": 14,
    "healPercent": 0.3,
    "description": "Мощный ремонт всей группы",
    "icon": "assets/skills/repair_engineer/re_mass_repair.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "healPercent": 0.05
    },
    "l2Name": "Greater Group Heal",
    "spCost": 120000,
    "l2Class": "Paladin",
    "futureUpdate": true
  },
  "re_fortress_plate": {
    "id": "re_fortress_plate",
    "name": "Крепостная плита",
    "deviceReq": {
      "type": "bracers",
      "slot": "bracelet",
      "name": "Наручи-компенсаторы"
    },
    "type": "active",
    "category": "buff",
    "target": "target",
    "class": "repair_engineer",
    "levelReq": 40,
    "energyCost": 30,
    "cooldown": 25,
    "chargeTime": 0.6,
    "range": 10,
    "duration": 60,
    "defenseBoost": 0.25,
    "hpRegen": 8,
    "description": "Укрепляет союзника: выше защита и лёгкое восстановление прочности",
    "icon": "assets/skills/repair_engineer/re_fortress_plate.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "defenseBoost": 0.08
    },
    "l2Name": "Holy Armor",
    "spCost": 110000,
    "l2Class": "Paladin",
    "futureUpdate": true
  },
  "dem_whirlwind": {
    "id": "dem_whirlwind",
    "name": "Вихрь молота",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "demolitionist",
    "levelReq": 40,
    "energyCost": 40,
    "cooldown": 12,
    "chargeTime": 0.8,
    "range": 0,
    "aoeRadius": 5,
    "skillPower": 2.4,
    "damageType": "physical",
    "description": "Круговой удар молотом по всем вокруг",
    "icon": "assets/skills/demolitionist/dem_whirlwind.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2,
      "aoeRadius": 0.4
    },
    "l2Name": "Whirlwind",
    "spCost": 130000,
    "l2Class": "Warlord",
    "futureUpdate": true
  },
  "sb_triple_slash": {
    "id": "sb_triple_slash",
    "name": "Тройной удар",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "steam_berserker",
    "levelReq": 40,
    "energyCost": 30,
    "cooldown": 8,
    "chargeTime": 0,
    "range": 3,
    "skillPower": 3,
    "damageType": "physical",
    "hits": 3,
    "description": "Три быстрых удара подряд по одной цели",
    "icon": "assets/skills/steam_berserker/sb_triple_slash.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.25
    },
    "l2Name": "Triple Slash",
    "spCost": 11000,
    "l2Class": "Gladiator",
    "futureUpdate": true
  },
  "ps_double_shot": {
    "id": "ps_double_shot",
    "name": "Двойной выстрел",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "pneumatic_sniper",
    "levelReq": 40,
    "energyCost": 28,
    "cooldown": 6,
    "chargeTime": 0.4,
    "range": 14,
    "skillPower": 2.6,
    "damageType": "physical",
    "hits": 2,
    "critBonus": 0.2,
    "description": "Два точных выстрела подряд",
    "icon": "assets/skills/pneumatic_sniper/ps_double_shot.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2
    },
    "l2Name": "Double Shot",
    "spCost": 125000,
    "l2Class": "Hawkeye",
    "futureUpdate": true
  },
  "ae_mortar": {
    "id": "ae_mortar",
    "name": "Миномётный залп",
    "deviceReq": {
      "type": "compressor",
      "slot": "necklace",
      "name": "Паровой нагнетатель"
    },
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "artillery_engineer",
    "levelReq": 40,
    "energyCost": 38,
    "cooldown": 14,
    "chargeTime": 1,
    "range": 16,
    "aoeRadius": 6,
    "skillPower": 2.5,
    "damageType": "physical",
    "description": "Дальний залп по площади",
    "icon": "assets/skills/artillery_engineer/ae_mortar.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2,
      "aoeRadius": 0.4
    },
    "l2Name": "Burst Shot",
    "spCost": 130000,
    "l2Class": "Hawkeye",
    "futureUpdate": true
  },
  "pm_pressure_storm": {
    "id": "pm_pressure_storm",
    "name": "Буря давления",
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "pressure_sorcerer",
    "levelReq": 40,
    "energyCost": 50,
    "cooldown": 14,
    "chargeTime": 1.4,
    "range": 12,
    "aoeRadius": 6,
    "skillPower": 2.4,
    "damageType": "circuit",
    "description": "Волна давления: схемный урон по площади",
    "icon": "assets/skills/pressure_sorcerer/pm_pressure_storm.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "skillPower": 0.2,
      "aoeRadius": 0.4
    },
    "l2Name": "Blazing Circle",
    "spCost": 16000,
    "l2Class": "Sorcerer",
    "futureUpdate": true
  },
  "do_deploy_drone": {
    "id": "do_deploy_drone",
    "name": "Выпуск дрона",
    "type": "active",
    "category": "utility",
    "target": "self",
    "class": "machine_warlock",
    "levelReq": 40,
    "energyCost": 45,
    "cooldown": 60,
    "chargeTime": 1.5,
    "duration": 120,
    "summonId": "combat_drone",
    "description": "Выпускает боевого дрона на ограниченное время",
    "icon": "assets/skills/machine_warlock/do_deploy_drone.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "duration": 30
    },
    "l2Name": "Summon Kat the Cat",
    "spCost": 135000,
    "l2Class": "Warlock",
    "futureUpdate": true
  },
  "cc_corrode": {
    "id": "cc_corrode",
    "name": "Коррозия контура",
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "circuit_necro",
    "levelReq": 40,
    "energyCost": 32,
    "cooldown": 8,
    "chargeTime": 0.8,
    "range": 12,
    "skillPower": 0.9,
    "damageType": "circuit",
    "dotDamage": 18,
    "dotDuration": 12,
    "defenseReduction": 0.15,
    "description": "Коррозия: урон со временем и ослабление брони цели",
    "icon": "assets/skills/circuit_necro/cc_corrode.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "dotDamage": 5,
      "defenseReduction": 0.03
    },
    "l2Name": "Curse: Poison",
    "spCost": 135000,
    "l2Class": "Necromancer",
    "futureUpdate": true
  },
  "om_reboot": {
    "id": "om_reboot",
    "name": "Перезапуск узла",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "overhaul_master",
    "levelReq": 40,
    "energyCost": 80,
    "cooldown": 120,
    "chargeTime": 3,
    "range": 10,
    "healPercent": 0.5,
    "resurrect": true,
    "description": "Перезапуск поверженного союзника (50% HP)",
    "icon": "assets/skills/overhaul_master/om_reboot.webp",
    "maxLevel": 3,
    "effectPerLevel": {
      "healPercent": 0.1
    },
    "l2Name": "Resurrection",
    "spCost": 150000,
    "l2Class": "Bishop",
    "futureUpdate": true
  },
  "pd_party_protocol": {
    "id": "pd_party_protocol",
    "name": "Групповой протокол",
    "type": "active",
    "category": "buff",
    "target": "party",
    "class": "protocol_prophet",
    "levelReq": 40,
    "energyCost": 40,
    "cooldown": 40,
    "chargeTime": 1,
    "range": 14,
    "duration": 180,
    "attackBoost": 0.15,
    "defenseBoost": 0.12,
    "speedBoost": 0.1,
    "description": "Полный боевой протокол группе на 3 мин",
    "icon": "assets/skills/protocol_prophet/pd_party_protocol.webp",
    "maxLevel": 5,
    "effectPerLevel": {
      "attackBoost": 0.03,
      "defenseBoost": 0.03
    },
    "l2Name": "Prophecy of Fire",
    "spCost": 140000,
    "l2Class": "Prophet",
    "futureUpdate": true
  },
  "br_skibidi_slam": {
    "id": "br_skibidi_slam",
    "name": "Skibidi Slam",
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "any",
    "levelReq": 1,
    "energyCost": 18,
    "cooldown": 18,
    "chargeTime": 0.6,
    "range": 5,
    "aoeRadius": 4.5,
    "skillPower": 1.65,
    "damageType": "physical",
    "free": true,
    "meme": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "Dop dop yes yes — паровой удар по площади. Мем-VFX. Свиток: Skibidi Steamino.",
    "icon": "assets/skills/special/br_skibidi_slam.webp",
    "l2Name": "Skibidi Slam"
  },
  "br_tralala_wave": {
    "id": "br_tralala_wave",
    "name": "Tralala Wave",
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "any",
    "levelReq": 1,
    "energyCost": 16,
    "cooldown": 16,
    "chargeTime": 0.5,
    "range": 6,
    "aoeRadius": 5,
    "skillPower": 1.45,
    "damageType": "circuit",
    "free": true,
    "meme": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "Радужная волна «tralalero tralala». Мем-VFX. Свиток: Toasterino.",
    "icon": "assets/skills/special/br_tralala_wave.webp",
    "l2Name": "Tralala Wave"
  },
  "br_bombardiro_dive": {
    "id": "br_bombardiro_dive",
    "name": "Bombardiro Dive",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "any",
    "levelReq": 1,
    "energyCost": 22,
    "cooldown": 20,
    "chargeTime": 0.8,
    "range": 8,
    "skillPower": 2.1,
    "damageType": "physical",
    "free": true,
    "meme": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "Пикирование-смузи. Яркий огненный VFX. Свиток: Blendodilo.",
    "icon": "assets/skills/special/br_bombardiro_dive.webp",
    "l2Name": "Bombardiro Dive"
  },
  "br_tung_suction": {
    "id": "br_tung_suction",
    "name": "Tung Suction",
    "type": "active",
    "category": "debuff",
    "target": "target",
    "class": "any",
    "levelReq": 1,
    "energyCost": 14,
    "cooldown": 14,
    "chargeTime": 0.4,
    "range": 10,
    "skillPower": 1.2,
    "damageType": "circuit",
    "duration": 5,
    "slowPercent": 0.4,
    "free": true,
    "meme": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "Tung tung tung — вакуумный притяг/замедление + VFX. Свиток: Vacuum Sahur.",
    "icon": "assets/skills/special/br_tung_suction.webp",
    "l2Name": "Tung Suction"
  },
  "br_cappuccino_spin": {
    "id": "br_cappuccino_spin",
    "name": "Cappuccino Spin",
    "type": "active",
    "category": "attack",
    "target": "aoe",
    "class": "any",
    "levelReq": 1,
    "energyCost": 24,
    "cooldown": 22,
    "chargeTime": 0.7,
    "range": 4,
    "aoeRadius": 4,
    "skillPower": 1.9,
    "damageType": "circuit",
    "free": true,
    "meme": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "Пируэт en pointe с золотой пенкой. Мем-VFX. Свиток: Ballerina Cappuccino.",
    "icon": "assets/skills/special/br_cappuccino_spin.webp",
    "l2Name": "Cappuccino Spin"
  },
  "test_immortal": {
    "id": "test_immortal",
    "name": "Бессмертие (тест)",
    "type": "active",
    "category": "buff",
    "target": "self",
    "class": "any",
    "levelReq": 1,
    "energyCost": 0,
    "cooldown": 2,
    "chargeTime": 0,
    "range": 0,
    "duration": 600,
    "immortal": true,
    "invulnerable": true,
    "fullHeal": true,
    "free": true,
    "starter": true,
    "test": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "ТЕСТ: полный иммунитет к урону на 10 мин + полное восстановление ОЗ. Для отладки.",
    "icon": "assets/skills/special/test_immortal.webp",
    "l2Name": "Бессмертие (тест)"
  },
  "gm_oneshot": {
    "id": "gm_oneshot",
    "name": "ГМ Ваншот",
    "type": "active",
    "category": "attack",
    "target": "target",
    "class": "any",
    "levelReq": 1,
    "energyCost": 0,
    "cooldown": 1,
    "chargeTime": 0,
    "range": 45,
    "effectRange": 60,
    "skillPower": 999999,
    "damageType": "physical",
    "oneshot": true,
    "gm": true,
    "free": true,
    "starter": true,
    "test": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "GM: Мгновенный ваншот цели (моба или игрока) с большой дистанции без расхода пара.",
    "icon": "assets/skills/special/gm_oneshot.webp",
    "l2Name": "GM One-Shot",
    "l2Class": "Game Master"
  },
  "gm_resurrect": {
    "id": "gm_resurrect",
    "name": "Благословение Возрождения",
    "type": "active",
    "category": "heal",
    "target": "target",
    "class": "any",
    "levelReq": 1,
    "energyCost": 0,
    "cooldown": 1,
    "chargeTime": 0,
    "range": 45,
    "effectRange": 60,
    "gm": true,
    "free": true,
    "starter": true,
    "test": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "GM: Мгновенное воскрешение павшего игрока на месте гибели со 100% ОЗ и пара (или полное восстановление живой цели).",
    "icon": "assets/skills/special/gm_resurrect.webp",
    "l2Name": "Blessed Resurrection (GM)",
    "l2Class": "Game Master"
  },
  "gm_speed": {
    "id": "gm_speed",
    "name": "Скорость Флэша",
    "type": "toggle",
    "category": "buff",
    "target": "self",
    "class": "any",
    "levelReq": 1,
    "energyCost": 0,
    "cooldown": 1,
    "chargeTime": 0,
    "range": 0,
    "speedBoost": 2.5,
    "gm": true,
    "free": true,
    "starter": true,
    "test": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "GM: Сверхчеловеческая скорость в стиле Флэша (3.5x). Молнии Спидфорса, фантомные следы и электрические дуги.",
    "icon": "assets/skills/special/gm_flash.webp",
    "l2Name": "Flash Speed (GM)",
    "l2Class": "Game Master"
  },
  "gm_flash": {
    "id": "gm_speed",
    "name": "Скорость Флэша",
    "type": "toggle",
    "category": "buff",
    "target": "self",
    "class": "any",
    "levelReq": 1,
    "energyCost": 0,
    "cooldown": 1,
    "chargeTime": 0,
    "range": 0,
    "speedBoost": 2.5,
    "gm": true,
    "free": true,
    "starter": true,
    "test": true,
    "maxLevel": 1,
    "spCost": 0,
    "description": "GM: Сверхчеловеческая скорость в стиле Флэша (3.5x). Молнии Спидфорса, фантомные следы и электрические дуги.",
    "icon": "assets/skills/special/gm_flash.webp",
    "l2Name": "Flash Speed (GM)",
    "l2Class": "Game Master",
    "aliasOf": "gm_speed"
  }
};

  function get(id) {
    if (!id) return null;
    return SKILLS[id] || SKILLS[String(id).toLowerCase()] || null;
  }
  function list() {
    var seen = new Set();
    return Object.keys(SKILLS).reduce(function (acc, k) {
      var s = SKILLS[k];
      if (s && !s.aliasOf && !seen.has(s.id)) {
        seen.add(s.id);
        acc.push(s);
      }
      return acc;
    }, []);
  }
  function listForClass(classId, lineage, maxPlayerLevel) {
    if (typeof lineage === 'number') {
      maxPlayerLevel = lineage;
      lineage = [classId];
    } else if (!Array.isArray(lineage)) {
      lineage = lineage ? [lineage] : [classId];
    }
    maxPlayerLevel = maxPlayerLevel != null ? maxPlayerLevel : 20;
    return list().filter(function (s) {
      if (s.class === 'any' || s.class === 'all' || s.class === '*') return true;
      if (lineage.indexOf(s.class) === -1) return false;
      if (s.futureUpdate && (s.levelReq || 1) > maxPlayerLevel) return false;
      return true;
    });
  }
  function rankData(tpl, level) {
    if (!tpl || !tpl.ranks || !tpl.ranks.length) return null;
    level = Math.max(1, level || 1);
    var idx = Math.min(level, tpl.ranks.length) - 1;
    return tpl.ranks[idx] || null;
  }
  /** Absolute C1 skilldata Power when ranks[].l2Power set; else relative mult (1.0=AA). */
  function skillPowerAtLevel(tpl, level) {
    level = Math.max(1, level || 1);
    var r = rankData(tpl, level);
    if (r && r.l2Power != null) return +r.l2Power;
    if (r && r.skillPower != null) return +r.skillPower;
    var p = tpl.skillPower != null ? tpl.skillPower
      : (tpl.damageMult != null ? tpl.damageMult : 1.0);
    var per = 0;
    if (tpl.effectPerLevel) {
      if (tpl.effectPerLevel.skillPower != null) per = tpl.effectPerLevel.skillPower;
      else if (tpl.effectPerLevel.damageMult != null) per = tpl.effectPerLevel.damageMult;
    }
    return p + per * (level - 1);
  }
  function spCost(tpl, nextLevel, expApi) {
    nextLevel = Math.max(1, nextLevel || 1);
    if (tpl.free === true && nextLevel === 1) return 0;
    var r = rankData(tpl, nextLevel);
    if (r && r.spCost != null) return r.spCost | 0;
    if (expApi && expApi.skillSpCost) {
      return expApi.skillSpCost(tpl.levelReq || 1, nextLevel, tpl.spCost, tpl.maxLevel);
    }
    var base = tpl.spCost != null ? tpl.spCost : Math.max(40, (tpl.levelReq || 1) * 35 + 20);
    var mult = 1;
    for (var i = 1; i < nextLevel; i++) mult *= 1.65;
    return Math.floor(base * mult);
  }
  function valueAtLevel(tpl, key, level) {
    level = Math.max(1, level || 1);
    var r = rankData(tpl, level);
    if (r && r[key] != null) return r[key];
    if (tpl[key] == null) return null;
    var per = (tpl.effectPerLevel && tpl.effectPerLevel[key]) || 0;
    return tpl[key] + per * (level - 1);
  }
  function isCombatSkill(tpl) {
    if (!tpl) return false;
    return tpl.type === 'active' || tpl.type === 'toggle';
  }
  return {
    TYPES: { ACTIVE: 'active', PASSIVE: 'passive', TOGGLE: 'toggle' },
    CAT: { ATTACK: 'attack', BUFF: 'buff', DEBUFF: 'debuff', HEAL: 'heal', UTILITY: 'utility', CRAFT: 'craft' },
    TARGET: { SELF: 'self', TARGET: 'target', AOE: 'aoe', PARTY: 'party' },
    SKILLS: SKILLS,
    get: get,
    list: list,
    listForClass: listForClass,
    rankData: rankData,
    skillPowerAtLevel: skillPowerAtLevel,
    spCost: spCost,
    valueAtLevel: valueAtLevel,
    isCombatSkill: isCombatSkill
  };
});
