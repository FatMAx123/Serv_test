// SHARED / ITEM-DB.JS — combat-relevant item templates (server + client authority)
// Full flavour/UI stays in client/js/inventory.js; combat stats live here.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ITEM_DB = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var GR = null;
  var WR = null;
  var ER = null;
  try { if (typeof require !== 'undefined') GR = require('./grade-rules.js'); } catch (eGr) { GR = null; }
  try { if (typeof require !== 'undefined') WR = require('./weight-rules.js'); } catch (eWr) { WR = null; }
  try { if (typeof require !== 'undefined') ER = require('./enchant-rules.js'); } catch (eEr) { ER = null; }
  if (!GR || !WR || !ER) {
    var _g = (typeof window !== 'undefined') ? window : globalThis;
    if (!GR) GR = _g.GRADE_RULES || null;
    if (!WR) WR = _g.WEIGHT_RULES || null;
    if (!ER) ER = _g.ENCHANT_RULES || null;
  }

  /** Combat fields only. id is the lookup key. */
  var ITEMS = {
    "engineer_emitter_low": {
      "id": "engineer_emitter_low",
      "name": "Паровой резонатор ученика",
      "type": "accessory",
      "slot": "necklace",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/engineer_emitter_low.webp",
      "price": 110,
      "weight": 150,
      "description": "Нагрудный прибор наладчика: ловит и усиливает импульс контура. Через него инженер бьёт давлением и схемами по врагу. Контур растёт с опытом, корпус — с деталями и металлом.",
      "isCircuit": true,
      "isResonator": true,
      "isCircuitDevice": true,
      "nodrop": true,
      "noDrop": true,
      "undroppable": true,
      "notDropable": true,
      "bound": true,
      "circuitLevel": 1,
      "circuitMaxLevel": 10,
      "shellIndex": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "engineer_nano_bracelet": {
      "id": "engineer_nano_bracelet",
      "name": "Нано-браслеты ученика",
      "type": "accessory",
      "slot": "bracelet",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_ring.webp",
      "price": 110,
      "weight": 150,
      "description": "Пара наручных манжет с роем микромеханизмов. Пока они на запястьях, рой сшивает корпус, вытягивает давление из чужой машины и сеет сбои в схемах противника — тихая работа, в отличие от удара резонатора. Связь роя растёт с опытом, оболочка — с деталями.",
      "isNanoBracelet": true,
      "isBraceletDevice": true,
      "nodrop": true,
      "noDrop": true,
      "undroppable": true,
      "notDropable": true,
      "bound": true,
      "nanoLevel": 1,
      "nanoMaxLevel": 10,
      "casingIndex": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "operator_compressor_low": {
      "id": "operator_compressor_low",
      "name": "Нагрудный нагнетатель бойца",
      "type": "accessory",
      "slot": "necklace",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/steam_valve.webp",
      "price": 110,
      "weight": 150,
      "description": "Нагрудный паровой редуктор-нагнетатель бойца: накапливает давление пара и подает кинетический импульс в оружие. Позволяет оператору проводить сокрушительные удары и паровые выбросы без магии. Корпус улучшается деталями, клапан калибруется с боевым опытом.",
      "isCompressor": true,
      "isOperatorDevice": true,
      "isValveDevice": true,
      "nodrop": true,
      "noDrop": true,
      "undroppable": true,
      "notDropable": true,
      "bound": true,
      "valveLevel": 1,
      "circuitLevel": 1,
      "valveMaxLevel": 10,
      "circuitMaxLevel": 10,
      "shellIndex": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "operator_bracers_low": {
      "id": "operator_bracers_low",
      "name": "Наручи-компенсаторы бойца",
      "type": "accessory",
      "slot": "bracelet",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_gauge.webp",
      "price": 110,
      "weight": 150,
      "description": "Пара клепаных наручей с гидравлическими демпферами. Гасят отдачу парового молота и натягивают тетиву блочных луков. Необходимы для аварийного ремонта, разгона приводов и распыления масел. Прочность растет с деталями, синхронизация — с опытом.",
      "isBracers": true,
      "isOperatorBracers": true,
      "isBraceletDevice": true,
      "nodrop": true,
      "noDrop": true,
      "undroppable": true,
      "notDropable": true,
      "bound": true,
      "wristLevel": 1,
      "nanoLevel": 1,
      "wristMaxLevel": 10,
      "nanoMaxLevel": 10,
      "casingIndex": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "engineer_jacket_low": {
      "id": "engineer_jacket_low",
      "name": "Куртка Ученика",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/engineer_jacket_low.webp",
      "price": 90,
      "weight": 430,
      "description": "Куртка Ученика (No-Grade). Базовая роба ученика.",
      "defense": 14,
      "cDef": 0,
      "armorType": "robe",
      "hpBonus": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "engineer_pants_low": {
      "id": "engineer_pants_low",
      "name": "Штаны Ученика",
      "type": "armor",
      "slot": "legs",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/engineer_pants_low.webp",
      "price": 70,
      "weight": 280,
      "description": "Штаны Ученика (No-Grade). Базовые штаны ученика.",
      "defense": 9,
      "cDef": 0,
      "armorType": "robe",
      "hpBonus": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "operator_hammer_low": {
          "id": "operator_hammer_low",
          "name": "Рычажный Молот Ученика",
          "l2Name": "Apprentice's Hammer",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/operator_hammer_low.webp",
          "price": 100,
          "weight": 1200,
          "description": "Базовый одноручный рычажный молот ученика-оператора. Прочный кованый инструмент с удобной рукоятью для начального освоения ближнего боя и ударов по броне автоматонов.",
          "attack": 8,
          "cAtk": 6,
          "weaponClass": "1h_blunt",
          "baseAtkSpd": 275,
          "atkSpdGrade": "Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "short_sword": {
          "id": "short_sword",
          "name": "Меч Ученика",
          "l2Name": "Short Sword",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/short_sword.webp",
          "price": 138,
          "weight": 1400,
          "description": "Легкий одноручный стальной меч ученика-оператора. Сбалансированный прямой клинок для изучения основ фехтования и эффективной защиты в паре с тактическим щитом.",
          "attack": 8,
          "cAtk": 6,
          "weaponClass": "1h_sword",
          "baseAtkSpd": 247,
          "atkSpdGrade": "Normal",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "mage_dagger": {
          "id": "mage_dagger",
          "name": "Кинжал Наладчика",
          "l2Name": "Dagger",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/mage_dagger.webp",
          "price": 138,
          "weight": 1150,
          "description": "Компактный стилет для нанесения быстрых ударов по уязвимым соединениям, гидравлическим трубкам и шарнирам вражеских машин.",
          "attack": 6,
          "cAtk": 6,
          "weaponClass": "dagger",
          "baseAtkSpd": 333,
          "atkSpdGrade": "Very Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "copper_pipe": {
          "id": "copper_pipe",
          "name": "Медная Труба",
          "l2Name": "Willow Staff",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/copper_pipe.webp",
          "price": 350,
          "weight": 1200,
          "description": "Отрезок толстостенной медной трубы высокого давления со следами сварки. Наносит глухие увесистые дробящие повреждения.",
          "attack": 10,
          "cAtk": 7,
          "weaponClass": "1h_blunt",
          "baseAtkSpd": 275,
          "atkSpdGrade": "Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "long_sword": {
          "id": "long_sword",
          "name": "Рычажный Меч",
          "l2Name": "Long Sword",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/long_sword.webp",
          "price": 38000,
          "weight": 1400,
          "description": "Удлиненный одноручный стальной меч с противовесом на гарде. Позволяет оператору наносить сильные рубящие удары со щитом.",
          "attack": 17,
          "cAtk": 12,
          "weaponClass": "1h_sword",
          "baseAtkSpd": 247,
          "atkSpdGrade": "Normal",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "iron_hammer": {
          "id": "iron_hammer",
          "name": "Железный Молот",
          "l2Name": "Heavy Club",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/iron_hammer.webp",
          "price": 32000,
          "weight": 1650,
          "description": "Тяжелый кованый молот для разбивания броневых листов и деформации защитных кожухов автоматонов.",
          "attack": 15,
          "cAtk": 11,
          "weaponClass": "1h_blunt",
          "baseAtkSpd": 275,
          "atkSpdGrade": "Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "dirk": {
          "id": "dirk",
          "name": "Штамповочный Кортик",
          "l2Name": "Dirk",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/dirk.webp",
          "price": 26000,
          "weight": 1150,
          "description": "Острый клинок со штампованным долом для высокой скорости ударов и точечного поражения проводки механизмов.",
          "attack": 12,
          "cAtk": 9,
          "weaponClass": "dagger",
          "baseAtkSpd": 333,
          "atkSpdGrade": "Very Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "spring_bow": {
          "id": "spring_bow",
          "name": "Рессорный Лук",
          "l2Name": "Short Bow",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/spring_bow.webp",
          "price": 32000,
          "weight": 1750,
          "description": "Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.",
          "attack": 18,
          "cAtk": 10,
          "weaponClass": "bow",
          "baseAtkSpd": 293,
          "atkSpdGrade": "Normal",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "bastard_sword": {
          "id": "bastard_sword",
          "name": "Силовой Палаш",
          "l2Name": "Bastard Sword",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/bastard_sword.webp",
          "price": 136000,
          "weight": 1400,
          "description": "Топовый полуторный меч No-Grade ранга. Выкован из закаленной стали, идеально сбалансирован для сокрушительных выпадов.",
          "attack": 24,
          "cAtk": 17,
          "weaponClass": "1h_sword",
          "baseAtkSpd": 247,
          "atkSpdGrade": "Normal",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "steam_hammer": {
          "id": "steam_hammer",
          "name": "Паровой Молот",
          "l2Name": "Morning Star",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/steam_hammer.webp",
          "price": 136000,
          "weight": 2000,
          "description": "Топовый двуручный боевой молот No-Grade ранга с пневматической камерой для сокрушительных ударов по площади.",
          "attack": 28,
          "cAtk": 17,
          "weaponClass": "2h_blunt",
          "baseAtkSpd": 190,
          "atkSpdGrade": "Slow",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "assassin_knife": {
          "id": "assassin_knife",
          "name": "Стилет Сбоя",
          "l2Name": "Assassin Knife",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/assassin_knife.webp",
          "price": 136000,
          "weight": 1100,
          "description": "Топовый кинжал No-Grade ранга с граненой заточкой из титанового сплава для быстрых критических ударов.",
          "attack": 19,
          "cAtk": 14,
          "weaponClass": "dagger",
          "baseAtkSpd": 333,
          "atkSpdGrade": "Very Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 1,
          "spiritshotUse": 1
    },
    "composite_bow": {
          "id": "composite_bow",
          "name": "Композитный Лук",
          "l2Name": "Composite Bow",
          "type": "weapon",
          "slot": "weapon",
          "grade": "no_grade",
          "icon": "assets/props/icons_weapon/composite_bow.webp",
          "price": 136000,
          "weight": 2000,
          "description": "Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.",
          "attack": 42,
          "cAtk": 17,
          "weaponClass": "bow",
          "baseAtkSpd": 293,
          "atkSpdGrade": "Normal",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0,
          "soulshotUse": 2,
          "spiritshotUse": 1
    },
    "revolution_sword": {
          "id": "revolution_sword",
          "name": "Меч Революции",
          "l2Name": "Sword of Revolution",
          "type": "weapon",
          "slot": "weapon",
          "grade": "d",
          "icon": "assets/props/icons_weapon/revolution_sword.webp",
          "price": 409000,
          "weight": 1400,
          "description": "Легендарный одноручный меч ранга Low D. Изготовлен оружейниками цехового сопротивления из многослойной стали. Обладает высочайшим уроном среди доступных одноручных мечей первой фазы.",
          "attack": 36,
          "cAtk": 26,
          "weaponClass": "1h_sword",
          "baseAtkSpd": 247,
          "atkSpdGrade": "Normal",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 818,
          "soulshotUse": 2,
          "spiritshotUse": 1
    },
    "heavy_doom_hammer": {
          "id": "heavy_doom_hammer",
          "name": "Тяжелый Молот Рока",
          "l2Name": "Heavy Doom Hammer",
          "type": "weapon",
          "slot": "weapon",
          "grade": "d",
          "icon": "assets/props/icons_weapon/heavy_doom_hammer.webp",
          "price": 409000,
          "weight": 1650,
          "description": "Сокрушительный одноручный боевой молот ранга Low D с утяжеленным чугунным оголовком и гидрокомпенсатором отдачи.",
          "attack": 36,
          "cAtk": 26,
          "weaponClass": "1h_blunt",
          "baseAtkSpd": 275,
          "atkSpdGrade": "Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 818,
          "soulshotUse": 2,
          "spiritshotUse": 1
    },
    "prowler_dagger": {
          "id": "prowler_dagger",
          "name": "Кинжал Теней",
          "l2Name": "Prowler",
          "type": "weapon",
          "slot": "weapon",
          "grade": "d",
          "icon": "assets/props/icons_weapon/prowler_dagger.webp",
          "price": 409000,
          "weight": 1100,
          "description": "Пронзающий боевой кинжал ранга Low D с алмазной заточкой и полимерным антибликовым покрытием лезвия.",
          "attack": 30,
          "cAtk": 26,
          "weaponClass": "dagger",
          "baseAtkSpd": 333,
          "atkSpdGrade": "Very Fast",
          "twoHanded": false,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 818,
          "soulshotUse": 2,
          "spiritshotUse": 1
    },
    "reinforced_bow": {
          "id": "reinforced_bow",
          "name": "Усиленный Пневмолук",
          "l2Name": "Reinforced Bow",
          "type": "weapon",
          "slot": "weapon",
          "grade": "d",
          "icon": "assets/props/icons_weapon/reinforced_bow.webp",
          "price": 409000,
          "weight": 2000,
          "description": "Тяжелый блочный лук ранга Low D с усиленными титановыми рессорами и вспомогательным пневматическим натяжителем.",
          "attack": 71,
          "cAtk": 26,
          "weaponClass": "bow",
          "baseAtkSpd": 293,
          "atkSpdGrade": "Normal",
          "twoHanded": true,
          "isOperatorWeapon": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 818,
          "soulshotUse": 3,
          "spiritshotUse": 1
    },
    "worker_overalls": {
      "id": "worker_overalls",
      "name": "Рабочий комбинезон",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/worker_overalls.webp",
      "price": 200,
      "weight": 430,
      "description": "Простая роба. Без сета.",
      "defense": 33,
      "armorType": "robe",
      "hpBonus": 0,
      "levelReq": 1,
      "crystalCount": 0
    },
    "apprentice_wand": {
      "id": "apprentice_wand",
      "name": "Ударник Ученика",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/apprentice_wand.webp",
      "price": 138,
      "weight": 1350,
      "description": "Магический жезл ученика (No-Grade, 1H). Быстрая атака. Снижает расход маны на заклинания.",
      "l2Name": "Apprentice's Wand",
      "attack": 5,
      "cAtk": 7,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 343,
      "atkSpdGrade": "Fast",
      "twoHanded": false,
      "accuracyBonus": 5,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "willow_coil": {
      "id": "willow_coil",
      "name": "Пружина Астарда",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/willow_coil.webp",
      "price": 12500,
      "weight": 1200,
      "description": "1H+щит. P15 / схем. 20.",
      "attack": 15,
      "cAtk": 20,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "cedar_manifold": {
      "id": "cedar_manifold",
      "name": "Труболом Междуречья",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/cedar_manifold.webp",
      "price": 54100,
      "weight": 2000,
      "description": "2H. P17 / схем. 25.",
      "attack": 17,
      "cAtk": 25,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "mage_staff": {
      "id": "mage_staff",
      "name": "Калибратор Цеха",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/mage_staff.webp",
      "price": 136000,
      "weight": 2000,
      "description": "2H топ NG. Калибровка цеха. P22 / схем. 32.",
      "attack": 22,
      "cAtk": 32,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "crucifix_blood": {
      "id": "crucifix_blood",
      "name": "X-Узел Давления",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/crucifix_blood.webp",
      "price": 136000,
      "weight": 1200,
      "description": "1H+щит топ NG. X-рама клапана. P22 / схем. 32.",
      "attack": 22,
      "cAtk": 32,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "voodoo_doll": {
      "id": "voodoo_doll",
      "name": "Кукла-Сбой",
      "type": "weapon",
      "slot": "weapon",
      "grade": "no_grade",
      "icon": "assets/props/icons_weapon/voodoo_doll.webp",
      "price": 136000,
      "weight": 1200,
      "description": "1H+щит топ NG. P22 / схем. 32.",
      "attack": 22,
      "cAtk": 32,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "mace_prayer": {
      "id": "mace_prayer",
      "name": "Булава-Манометр",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/mace_prayer.webp",
      "price": 409000,
      "weight": 1400,
      "description": "1H low D. Манометр-голова. P26 / схем. 38.",
      "attack": 26,
      "cAtk": 38,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 20,
      "crystalCount": 90
    },
    "magic_mace": {
      "id": "magic_mace",
      "name": "Импульсная Булава",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/magic_mace.webp",
      "price": 409000,
      "weight": 1400,
      "description": "1H low D. Импульсный тупой узел. P26 / схем. 38.",
      "attack": 26,
      "cAtk": 38,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": true,
      "levelReq": 20,
      "crystalCount": 90
    },
    "demon_fangs": {
      "id": "demon_fangs",
      "name": "Клыки Сбоя",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/demon_fangs.webp",
      "price": 716000,
      "weight": 1400,
      "description": "1H+щит mid D. Двойные клыки-пила. P32 / схем. 46. (Отключено для Фазы 1).",
      "attack": 32,
      "cAtk": 46,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "tears_fairy": {
      "id": "tears_fairy",
      "name": "Слёзы Искры",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/tears_fairy.webp",
      "price": 716000,
      "weight": 1400,
      "description": "1H mid D. Капля охлаждённого сплава. P32 / схем. 46. (Отключено для Фазы 1).",
      "attack": 32,
      "cAtk": 46,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "bone_resonator": {
      "id": "bone_resonator",
      "name": "Костяной Дробитель",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/bone_resonator.webp",
      "price": 967000,
      "weight": 2300,
      "description": "2H high-mid D. P39 / схем. 55. (Отключено для Фазы 1).",
      "attack": 39,
      "cAtk": 55,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "life_manifold": {
      "id": "life_manifold",
      "name": "Ульевой Молот",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/life_manifold.webp",
      "price": 967000,
      "weight": 2300,
      "description": "2H high-mid D. P39 / схем. 55. (Отключено для Фазы 1).",
      "attack": 39,
      "cAtk": 55,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "ghost_manifold": {
      "id": "ghost_manifold",
      "name": "Глефа Тишины",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/ghost_manifold.webp",
      "price": 1400000,
      "weight": 2300,
      "description": "2H high D. P47 / схем. 64. (Отключено для Фазы 1).",
      "attack": 47,
      "cAtk": 64,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "atuba_mace": {
      "id": "atuba_mace",
      "name": "Булава Атубы",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/atuba_mace.webp",
      "price": 1400000,
      "weight": 1400,
      "description": "1H high D+щит. P47 / схем. 64. (Отключено для Фазы 1).",
      "attack": 47,
      "cAtk": 64,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "demon_staff": {
      "id": "demon_staff",
      "name": "Сверхпресс",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/demon_staff.webp",
      "price": 1800000,
      "weight": 2300,
      "description": "2H TOP D @20. Сверхдавление, макс. схем. урон. P53 / схем. 72. (Отключено для Фазы 1).",
      "attack": 53,
      "cAtk": 72,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "sentinel_staff": {
      "id": "sentinel_staff",
      "name": "Молот Оплота",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/sentinel_staff.webp",
      "price": 1800000,
      "weight": 2300,
      "description": "2H TOP D @20. P53 / схем. 72. (Отключено для Фазы 1).",
      "attack": 53,
      "cAtk": 72,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "goat_staff": {
      "id": "goat_staff",
      "name": "Вилочный Крушитель",
      "type": "weapon",
      "slot": "weapon",
      "grade": "d",
      "icon": "assets/props/icons_weapon/goat_staff.webp",
      "price": 1800000,
      "weight": 2300,
      "description": "2H TOP D @20. P53 / схем. 72. (Отключено для Фазы 1).",
      "attack": 53,
      "cAtk": 72,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 90
    },
    "mystic_manifold": {
      "id": "mystic_manifold",
      "name": "Круна-Калибр",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/mystic_manifold.webp",
      "price": 2290000,
      "weight": 2000,
      "description": "C future [FUTURE 40+]",
      "attack": 103,
      "cAtk": 81,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "crystal_manifold": {
      "id": "crystal_manifold",
      "name": "Кристалл Полигона",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/crystal_manifold.webp",
      "price": 2290000,
      "weight": 2000,
      "description": "C future [FUTURE 40+]",
      "attack": 103,
      "cAtk": 81,
      "weaponClass": "2h_sword",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "faith_rod": {
      "id": "faith_rod",
      "name": "Шток Рездика",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/faith_rod.webp",
      "price": 2290000,
      "weight": 1200,
      "description": "C future [FUTURE 40+]",
      "attack": 85,
      "cAtk": 81,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "ghoul_manifold": {
      "id": "ghoul_manifold",
      "name": "Коса Порчи",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/ghoul_manifold.webp",
      "price": 2870000,
      "weight": 2000,
      "description": "C future [FUTURE 40+]",
      "attack": 119,
      "cAtk": 91,
      "weaponClass": "pole",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "sage_manifold": {
      "id": "sage_manifold",
      "name": "Молот Предела",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/sage_manifold.webp",
      "price": 4300000,
      "weight": 2000,
      "description": "C future [FUTURE 40+]",
      "attack": 135,
      "cAtk": 101,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "demon_manifold": {
      "id": "demon_manifold",
      "name": "Котловой Резонатор",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/demon_manifold.webp",
      "price": 4300000,
      "weight": 2000,
      "description": "C future Inferno [FUTURE 40+]",
      "attack": 135,
      "cAtk": 101,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "nature_club": {
      "id": "nature_club",
      "name": "Садовый Регулятор",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/nature_club.webp",
      "price": 4300000,
      "weight": 1200,
      "description": "C future [FUTURE 40+]",
      "attack": 111,
      "cAtk": 101,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "eternity_rod": {
      "id": "eternity_rod",
      "name": "Шток Вечности",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/eternity_rod.webp",
      "price": 4300000,
      "weight": 1200,
      "description": "C future [FUTURE 40+]",
      "attack": 111,
      "cAtk": 101,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "homunculus_blade": {
      "id": "homunculus_blade",
      "name": "Клинок Круны",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/homunculus_blade.webp",
      "price": 4300000,
      "weight": 1200,
      "description": "C future [FUTURE 40+]",
      "attack": 111,
      "cAtk": 101,
      "weaponClass": "1h_sword",
      "baseAtkSpd": 247,
      "atkSpdGrade": "Normal",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "death_whisper": {
      "id": "death_whisper",
      "name": "Клинок Шёпота",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/death_whisper.webp",
      "price": 4300000,
      "weight": 1200,
      "description": "C future [FUTURE 40+]",
      "attack": 111,
      "cAtk": 101,
      "weaponClass": "1h_sword",
      "baseAtkSpd": 247,
      "atkSpdGrade": "Normal",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 40,
      "crystalCount": 0
    },
    "sprites_staff": {
      "id": "sprites_staff",
      "name": "Резонатор Искры",
      "type": "weapon",
      "slot": "weapon",
      "grade": "b",
      "icon": "assets/props/icons_weapon/sprites_staff.webp",
      "price": 8680000,
      "weight": 2000,
      "description": "B future [FUTURE 40+]",
      "attack": 170,
      "cAtk": 122,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 52,
      "crystalCount": 0
    },
    "soes_manifold": {
      "id": "soes_manifold",
      "name": "Резонатор Утёса",
      "type": "weapon",
      "slot": "weapon",
      "grade": "b",
      "icon": "assets/props/icons_weapon/soes_manifold.webp",
      "price": 13100000,
      "weight": 2000,
      "description": "B future [FUTURE 40+]",
      "attack": 189,
      "cAtk": 132,
      "weaponClass": "2h_blunt",
      "baseAtkSpd": 190,
      "atkSpdGrade": "Slow",
      "twoHanded": true,
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 52,
      "crystalCount": 0
    },
    "valhalla_blade": {
      "id": "valhalla_blade",
      "name": "Клинок Предела",
      "type": "weapon",
      "slot": "weapon",
      "grade": "b",
      "icon": "assets/props/icons_weapon/valhalla_blade.webp",
      "price": 8680000,
      "weight": 1200,
      "description": "B future [FUTURE 40+]",
      "attack": 140,
      "cAtk": 122,
      "weaponClass": "1h_sword",
      "baseAtkSpd": 247,
      "atkSpdGrade": "Normal",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 52,
      "crystalCount": 0
    },
    "repent_tear": {
      "id": "repent_tear",
      "name": "Слеза Павших",
      "type": "weapon",
      "slot": "weapon",
      "grade": "b",
      "icon": "assets/props/icons_weapon/repent_tear.webp",
      "price": 8680000,
      "weight": 1200,
      "description": "B future [FUTURE 40+]",
      "attack": 140,
      "cAtk": 122,
      "weaponClass": "1h_blunt",
      "baseAtkSpd": 275,
      "atkSpdGrade": "Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 52,
      "crystalCount": 0
    },
    "hell_knife": {
      "id": "hell_knife",
      "name": "Нож Зелёного Сбоя",
      "type": "weapon",
      "slot": "weapon",
      "grade": "b",
      "icon": "assets/props/icons_weapon/hell_knife.webp",
      "price": 8680000,
      "weight": 1200,
      "description": "B future [FUTURE 40+]",
      "attack": 122,
      "cAtk": 122,
      "weaponClass": "dagger",
      "baseAtkSpd": 333,
      "atkSpdGrade": "Very Fast",
      "isMagical": true,
      "isCircuit": true,
      "isEngineerWeapon": true,
      "isLivePhase1": false,
      "levelReq": 52,
      "crystalCount": 0
    },
    "hydraulic_blade": {
      "id": "hydraulic_blade",
      "name": "Гидравлический Клинок",
      "type": "weapon",
      "slot": "weapon",
      "grade": "c",
      "icon": "assets/props/icons_weapon/hydraulic_blade.webp",
      "price": 85000,
      "weight": 1200,
      "description": "1H sword. Atk.Spd base 247. Casting Spd не меняет.",
      "attack": 45,
      "weaponClass": "1h_sword",
      "baseAtkSpd": 247,
      "atkSpdGrade": "Normal",
      "levelReq": 40,
      "crystalCount": 0
    },
    "colossus_fist": {
      "id": "colossus_fist",
      "name": "Кулак Колосса",
      "type": "weapon",
      "slot": "weapon",
      "grade": "s",
      "icon": "assets/props/icons_weapon/colossus_fist.webp",
      "price": 30000000,
      "weight": 1200,
      "description": "Кулаки. Atk.Spd base 217 → ~242 @DEX21.",
      "attack": 120,
      "weaponClass": "fist",
      "baseAtkSpd": 217,
      "atkSpdGrade": "Normal",
      "levelReq": 76,
      "crystalCount": 350
    },
    "circuit_robe_jacket": {
      "id": "circuit_robe_jacket",
      "name": "Контурная Куртка",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/circuit_robe_jacket.webp",
      "price": 150,
      "weight": 430,
      "description": "Сет «Контур» (2): без сетового бонуса.",
      "defense": 17,
      "cDef": 16,
      "armorType": "robe",
      "setId": "magic",
      "energyBonus": 40,
      "levelReq": 1,
      "crystalCount": 0
    },
    "circuit_robe_pants": {
      "id": "circuit_robe_pants",
      "name": "Контурные Штаны",
      "type": "armor",
      "slot": "legs",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/circuit_robe_pants.webp",
      "price": 120,
      "weight": 280,
      "description": "Сет «Контур» (2): без сетового бонуса.",
      "defense": 11,
      "cDef": 10,
      "armorType": "robe",
      "setId": "magic",
      "energyBonus": 25,
      "levelReq": 1,
      "crystalCount": 0
    },
    "devotion_jacket": {
      "id": "devotion_jacket",
      "name": "Куртка Усердия",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/devotion_jacket.webp",
      "price": 800,
      "weight": 430,
      "description": "Сет «Усердие» (2): Casting Spd +15% поверх Spellcraft.",
      "defense": 30,
      "cDef": 28,
      "armorType": "robe",
      "setId": "devotion",
      "energyBonus": 80,
      "levelReq": 1,
      "crystalCount": 0
    },
    "devotion_pants": {
      "id": "devotion_pants",
      "name": "Штаны Усердия",
      "type": "armor",
      "slot": "legs",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/devotion_pants.webp",
      "price": 600,
      "weight": 280,
      "description": "Сет «Усердие» (2): Casting Spd +15%.",
      "defense": 19,
      "cDef": 18,
      "armorType": "robe",
      "setId": "devotion",
      "energyBonus": 50,
      "levelReq": 1,
      "crystalCount": 0
    },
    "knowledge_jacket": {
      "id": "knowledge_jacket",
      "name": "Куртка Знания",
      "type": "armor",
      "slot": "chest",
      "grade": "d",
      "icon": "assets/inventar/icons/knowledge_jacket.webp",
      "price": 42000,
      "weight": 430,
      "description": "Сет «Знание» (3): Схем. Атк +10%, реген пара −5%.",
      "defense": 49,
      "cDef": 46,
      "armorType": "robe",
      "setId": "knowledge",
      "energyBonus": 120,
      "levelReq": 20,
      "crystalCount": 84
    },
    "knowledge_pants": {
      "id": "knowledge_pants",
      "name": "Штаны Знания",
      "type": "armor",
      "slot": "legs",
      "grade": "d",
      "icon": "assets/inventar/icons/knowledge_pants.webp",
      "price": 26000,
      "weight": 280,
      "description": "Сет «Знание» (3).",
      "defense": 30,
      "cDef": 28,
      "armorType": "robe",
      "setId": "knowledge",
      "energyBonus": 75,
      "levelReq": 20,
      "crystalCount": 52
    },
    "knowledge_gloves": {
      "id": "knowledge_gloves",
      "name": "Перчатки Знания",
      "type": "armor",
      "slot": "gloves",
      "grade": "d",
      "icon": "assets/inventar/icons/knowledge_gloves.webp",
      "price": 18000,
      "weight": 180,
      "description": "Сет «Знание» (3).",
      "defense": 22,
      "cDef": 20,
      "armorType": "robe",
      "setId": "knowledge",
      "levelReq": 20,
      "crystalCount": 36
    },
    "mithril_jacket": {
      "id": "mithril_jacket",
      "name": "Мифриловая Куртка",
      "type": "armor",
      "slot": "chest",
      "grade": "d",
      "icon": "assets/inventar/icons/mithril_jacket.webp",
      "price": 40000,
      "weight": 430,
      "description": "Сет «Мифрил» (2): без сетового бонуса (C1).",
      "defense": 49,
      "cDef": 46,
      "armorType": "robe",
      "setId": "mithril",
      "energyBonus": 120,
      "levelReq": 20,
      "crystalCount": 80
    },
    "mithril_pants": {
      "id": "mithril_pants",
      "name": "Мифриловые Штаны",
      "type": "armor",
      "slot": "legs",
      "grade": "d",
      "icon": "assets/inventar/icons/mithril_pants.webp",
      "price": 25000,
      "weight": 280,
      "description": "Сет «Мифрил» (2): без сетового бонуса (C1).",
      "defense": 30,
      "cDef": 28,
      "armorType": "robe",
      "setId": "mithril",
      "energyBonus": 75,
      "levelReq": 20,
      "crystalCount": 50
    },
    "karmian_jacket": {
      "id": "karmian_jacket",
      "name": "Куртка Гармонии",
      "type": "armor",
      "slot": "chest",
      "grade": "c",
      "icon": "assets/inventar/icons/karmian_jacket.webp",
      "price": 380000,
      "weight": 430,
      "description": "Сет «Гармония» (3): Cast +15%, P.Def +5.26%.",
      "defense": 60,
      "cDef": 56,
      "armorType": "robe",
      "setId": "karmian",
      "energyBonus": 180,
      "levelReq": 40,
      "crystalCount": 150
    },
    "karmian_pants": {
      "id": "karmian_pants",
      "name": "Штаны Гармонии",
      "type": "armor",
      "slot": "legs",
      "grade": "c",
      "icon": "assets/inventar/icons/karmian_pants.webp",
      "price": 240000,
      "weight": 280,
      "description": "Сет «Гармония» (3).",
      "defense": 37,
      "cDef": 35,
      "armorType": "robe",
      "setId": "karmian",
      "energyBonus": 110,
      "levelReq": 40,
      "crystalCount": 95
    },
    "karmian_gloves": {
      "id": "karmian_gloves",
      "name": "Перчатки Гармонии",
      "type": "armor",
      "slot": "gloves",
      "grade": "c",
      "icon": "assets/inventar/icons/karmian_gloves.webp",
      "price": 160000,
      "weight": 180,
      "description": "Сет «Гармония» (3).",
      "defense": 32,
      "cDef": 30,
      "armorType": "robe",
      "setId": "karmian",
      "levelReq": 40,
      "crystalCount": 60
    },
    "demon_jacket": {
      "id": "demon_jacket",
      "name": "Куртка Порчи",
      "type": "armor",
      "slot": "chest",
      "grade": "c",
      "icon": "assets/inventar/icons/demon_jacket.webp",
      "price": 520000,
      "weight": 430,
      "description": "Сет «Порча» (3): INT +4, WIT −1, Max HP −270.",
      "defense": 69,
      "cDef": 64,
      "armorType": "robe",
      "setId": "demon",
      "energyBonus": 200,
      "levelReq": 40,
      "crystalCount": 150
    },
    "demon_pants": {
      "id": "demon_pants",
      "name": "Штаны Порчи",
      "type": "armor",
      "slot": "legs",
      "grade": "c",
      "icon": "assets/inventar/icons/demon_pants.webp",
      "price": 320000,
      "weight": 280,
      "description": "Сет «Порча» (3).",
      "defense": 43,
      "cDef": 40,
      "armorType": "robe",
      "setId": "demon",
      "energyBonus": 125,
      "levelReq": 40,
      "crystalCount": 95
    },
    "demon_gloves": {
      "id": "demon_gloves",
      "name": "Перчатки Порчи",
      "type": "armor",
      "slot": "gloves",
      "grade": "c",
      "icon": "assets/inventar/icons/demon_gloves.webp",
      "price": 200000,
      "weight": 180,
      "description": "Сет «Порча» (3).",
      "defense": 36,
      "cDef": 33,
      "armorType": "robe",
      "setId": "demon",
      "levelReq": 40,
      "crystalCount": 60
    },
    "divine_jacket": {
      "id": "divine_jacket",
      "name": "Божественная Куртка",
      "type": "armor",
      "slot": "chest",
      "grade": "c",
      "icon": "assets/inventar/icons/divine_jacket.webp",
      "price": 480000,
      "weight": 430,
      "description": "Сет «Божественный» (3): Max Пар +5.24%.",
      "defense": 69,
      "cDef": 64,
      "armorType": "robe",
      "setId": "divine",
      "energyBonus": 220,
      "levelReq": 40,
      "crystalCount": 150
    },
    "divine_pants": {
      "id": "divine_pants",
      "name": "Божественные Штаны",
      "type": "armor",
      "slot": "legs",
      "grade": "c",
      "icon": "assets/inventar/icons/divine_pants.webp",
      "price": 300000,
      "weight": 280,
      "description": "Сет «Божественный» (3).",
      "defense": 43,
      "cDef": 40,
      "armorType": "robe",
      "setId": "divine",
      "energyBonus": 140,
      "levelReq": 40,
      "crystalCount": 95
    },
    "divine_gloves": {
      "id": "divine_gloves",
      "name": "Божественные Перчатки",
      "type": "armor",
      "slot": "gloves",
      "grade": "c",
      "icon": "assets/inventar/icons/divine_gloves.webp",
      "price": 190000,
      "weight": 180,
      "description": "Сет «Божественный» (3).",
      "defense": 36,
      "cDef": 33,
      "armorType": "robe",
      "setId": "divine",
      "levelReq": 40,
      "crystalCount": 60
    },
    "avadon_robe": {
      "id": "avadon_robe",
      "name": "Роба Оплота",
      "type": "armor",
      "slot": "chest",
      "grade": "b",
      "icon": "assets/inventar/icons/avadon_robe.webp",
      "price": 4200000,
      "weight": 430,
      "description": "Цельная роба. Сет «Оплот» (4): Cast +15%, P.Def +5.25%.",
      "defense": 92,
      "cDef": 86,
      "armorType": "robe",
      "setId": "avadon",
      "fullBody": true,
      "energyBonus": 320,
      "levelReq": 52,
      "crystalCount": 350
    },
    "avadon_circlet": {
      "id": "avadon_circlet",
      "name": "Венец Оплота",
      "type": "armor",
      "slot": "head",
      "grade": "b",
      "icon": "assets/inventar/icons/avadon_circlet.webp",
      "price": 1800000,
      "weight": 420,
      "description": "Сет «Оплот» (4).",
      "defense": 55,
      "cDef": 50,
      "armorType": "robe",
      "setId": "avadon",
      "levelReq": 52,
      "crystalCount": 140
    },
    "avadon_gloves": {
      "id": "avadon_gloves",
      "name": "Перчатки Оплота",
      "type": "armor",
      "slot": "gloves",
      "grade": "b",
      "icon": "assets/inventar/icons/avadon_gloves.webp",
      "price": 1400000,
      "weight": 180,
      "description": "Сет «Оплот» (4).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "avadon",
      "levelReq": 52,
      "crystalCount": 125
    },
    "avadon_boots": {
      "id": "avadon_boots",
      "name": "Сапоги Оплота",
      "type": "armor",
      "slot": "boots",
      "grade": "b",
      "icon": "assets/inventar/icons/avadon_boots.webp",
      "price": 1400000,
      "weight": 180,
      "description": "Сет «Оплот» (4).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "avadon",
      "levelReq": 52,
      "crystalCount": 125
    },
    "zubei_jacket": {
      "id": "zubei_jacket",
      "name": "Куртка Закалки",
      "type": "armor",
      "slot": "chest",
      "grade": "b",
      "icon": "assets/inventar/icons/zubei_jacket.webp",
      "price": 3800000,
      "weight": 430,
      "description": "Сет «Закалка» (3): Схем. Атк +10%, реген пара −5%.",
      "defense": 83,
      "cDef": 78,
      "armorType": "robe",
      "setId": "zubei",
      "energyBonus": 280,
      "levelReq": 52,
      "crystalCount": 340
    },
    "zubei_pants": {
      "id": "zubei_pants",
      "name": "Штаны Закалки",
      "type": "armor",
      "slot": "legs",
      "grade": "b",
      "icon": "assets/inventar/icons/zubei_pants.webp",
      "price": 2400000,
      "weight": 280,
      "description": "Сет «Закалка» (3).",
      "defense": 52,
      "cDef": 48,
      "armorType": "robe",
      "setId": "zubei",
      "energyBonus": 170,
      "levelReq": 52,
      "crystalCount": 215
    },
    "zubei_circlet": {
      "id": "zubei_circlet",
      "name": "Венец Закалки",
      "type": "armor",
      "slot": "head",
      "grade": "b",
      "icon": "assets/inventar/icons/zubei_circlet.webp",
      "price": 1600000,
      "weight": 420,
      "description": "Сет «Закалка» (3).",
      "defense": 55,
      "cDef": 50,
      "armorType": "robe",
      "setId": "zubei",
      "levelReq": 52,
      "crystalCount": 140
    },
    "doom_jacket": {
      "id": "doom_jacket",
      "name": "Куртка Рока",
      "type": "armor",
      "slot": "chest",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_jacket.webp",
      "price": 4000000,
      "weight": 430,
      "description": "Сет «Рок» (5): Speed +7, реген +5.26%, INT +2, MEN −1, WIT −2.",
      "defense": 83,
      "cDef": 78,
      "armorType": "robe",
      "setId": "doom",
      "energyBonus": 280,
      "levelReq": 52,
      "crystalCount": 350
    },
    "doom_pants": {
      "id": "doom_pants",
      "name": "Штаны Рока",
      "type": "armor",
      "slot": "legs",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_pants.webp",
      "price": 2500000,
      "weight": 280,
      "description": "Сет «Рок» (5).",
      "defense": 52,
      "cDef": 48,
      "armorType": "robe",
      "setId": "doom",
      "energyBonus": 170,
      "levelReq": 52,
      "crystalCount": 220
    },
    "doom_circlet": {
      "id": "doom_circlet",
      "name": "Венец Рока",
      "type": "armor",
      "slot": "head",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_circlet.webp",
      "price": 1700000,
      "weight": 420,
      "description": "Сет «Рок» (5).",
      "defense": 55,
      "cDef": 50,
      "armorType": "robe",
      "setId": "doom",
      "levelReq": 52,
      "crystalCount": 140
    },
    "doom_gloves": {
      "id": "doom_gloves",
      "name": "Перчатки Рока",
      "type": "armor",
      "slot": "gloves",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_gloves.webp",
      "price": 1500000,
      "weight": 180,
      "description": "Сет «Рок» (5).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "doom",
      "levelReq": 52,
      "crystalCount": 125
    },
    "doom_boots": {
      "id": "doom_boots",
      "name": "Сапоги Рока",
      "type": "armor",
      "slot": "boots",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_boots.webp",
      "price": 1500000,
      "weight": 180,
      "description": "Сет «Рок» (5).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "doom",
      "levelReq": 52,
      "crystalCount": 125
    },
    "blue_wolf_jacket": {
      "id": "blue_wolf_jacket",
      "name": "Куртка Стального Волка",
      "type": "armor",
      "slot": "chest",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_jacket.webp",
      "price": 4000000,
      "weight": 430,
      "description": "Сет «Стальной Волк» (5): Max Пар +206, реген +5.26%, INT −2, MEN +3, WIT −1.",
      "defense": 83,
      "cDef": 78,
      "armorType": "robe",
      "setId": "blue_wolf",
      "energyBonus": 280,
      "levelReq": 52,
      "crystalCount": 350
    },
    "blue_wolf_pants": {
      "id": "blue_wolf_pants",
      "name": "Штаны Стального Волка",
      "type": "armor",
      "slot": "legs",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_pants.webp",
      "price": 2500000,
      "weight": 280,
      "description": "Сет «Стальной Волк» (5).",
      "defense": 52,
      "cDef": 48,
      "armorType": "robe",
      "setId": "blue_wolf",
      "energyBonus": 170,
      "levelReq": 52,
      "crystalCount": 205
    },
    "blue_wolf_circlet": {
      "id": "blue_wolf_circlet",
      "name": "Венец Стального Волка",
      "type": "armor",
      "slot": "head",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_circlet.webp",
      "price": 1700000,
      "weight": 420,
      "description": "Сет «Стальной Волк» (5).",
      "defense": 55,
      "cDef": 50,
      "armorType": "robe",
      "setId": "blue_wolf",
      "levelReq": 52,
      "crystalCount": 140
    },
    "blue_wolf_gloves": {
      "id": "blue_wolf_gloves",
      "name": "Перчатки Стального Волка",
      "type": "armor",
      "slot": "gloves",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_gloves.webp",
      "price": 1500000,
      "weight": 180,
      "description": "Сет «Стальной Волк» (5).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "blue_wolf",
      "levelReq": 52,
      "crystalCount": 125
    },
    "blue_wolf_boots": {
      "id": "blue_wolf_boots",
      "name": "Сапоги Стального Волка",
      "type": "armor",
      "slot": "boots",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_boots.webp",
      "price": 1500000,
      "weight": 180,
      "description": "Сет «Стальной Волк» (5).",
      "defense": 41,
      "cDef": 38,
      "armorType": "robe",
      "setId": "blue_wolf",
      "levelReq": 52,
      "crystalCount": 125
    },
    "copper_plate": {
      "id": "copper_plate",
      "name": "Медная кираса",
      "type": "armor",
      "slot": "chest",
      "grade": "d",
      "icon": "assets/inventar/icons/copper_plate.webp",
      "price": 45000,
      "weight": 830,
      "description": "Клёпаная медная кираса. Тяжёлая защита Регуляторов D-ранга.",
      "defense": 75,
      "armorType": "heavy",
      "hpBonus": 80,
      "levelReq": 20,
      "crystalCount": 80
    },
    "hydraulic_armor": {
      "id": "hydraulic_armor",
      "name": "Гидравлический доспех",
      "type": "armor",
      "slot": "chest",
      "grade": "c",
      "icon": "assets/inventar/icons/hydraulic_armor.webp",
      "price": 120000,
      "weight": 830,
      "description": "Экзоскелет с сервоприводами и гидравлическими усилителями.",
      "defense": 113,
      "armorType": "heavy",
      "hpBonus": 200,
      "energyBonus": 30,
      "levelReq": 40,
      "crystalCount": 140
    },
    "colossus_plating": {
      "id": "colossus_plating",
      "name": "Броня Колосса",
      "type": "armor",
      "slot": "chest",
      "grade": "s",
      "icon": "assets/inventar/icons/colossus_plating.webp",
      "price": 30000000,
      "weight": 830,
      "description": "Обшивка недостроенного стального гиганта.",
      "defense": 180,
      "armorType": "heavy",
      "hpBonus": 800,
      "energyBonus": 100,
      "levelReq": 76,
      "crystalCount": 350
    },
    "goggles": {
      "id": "goggles",
      "name": "Защитные очки",
      "type": "armor",
      "slot": "head",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/goggles.webp",
      "price": 80,
      "weight": 420,
      "description": "Очки с медной оправой. Защищают от искр.",
      "defense": 12,
      "armorType": "light",
      "levelReq": 1,
      "crystalCount": 0
    },
    "steam_helmet": {
      "id": "steam_helmet",
      "name": "Паровой шлем",
      "type": "armor",
      "slot": "head",
      "grade": "d",
      "icon": "assets/inventar/icons/steam_helmet.webp",
      "price": 18000,
      "weight": 420,
      "description": "Шлем с вентиляционными клапанами. Защита черепа D-ранга.",
      "defense": 38,
      "armorType": "heavy",
      "hpBonus": 30,
      "levelReq": 20,
      "crystalCount": 30
    },
    "leather_gloves": {
      "id": "leather_gloves",
      "name": "Кожаные перчатки",
      "type": "armor",
      "slot": "gloves",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/leather_gloves.webp",
      "price": 50,
      "weight": 180,
      "description": "Перчатки для работы с горячими деталями.",
      "defense": 8,
      "armorType": "light",
      "levelReq": 1,
      "crystalCount": 0
    },
    "piston_gauntlets": {
      "id": "piston_gauntlets",
      "name": "Поршневые латные перчатки",
      "type": "armor",
      "slot": "gloves",
      "grade": "c",
      "icon": "assets/inventar/icons/piston_gauntlets.webp",
      "price": 45000,
      "weight": 180,
      "description": "Усиливают хват и удар.",
      "defense": 32,
      "armorType": "heavy",
      "levelReq": 40,
      "crystalCount": 45
    },
    "work_boots": {
      "id": "work_boots",
      "name": "Рабочие ботинки",
      "type": "armor",
      "slot": "boots",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/work_boots.webp",
      "price": 60,
      "weight": 180,
      "description": "Тяжёлые ботинки с металлическим носком.",
      "defense": 7,
      "armorType": "light",
      "levelReq": 1,
      "crystalCount": 0
    },
    "steam_boots": {
      "id": "steam_boots",
      "name": "Паровые сапоги",
      "type": "armor",
      "slot": "boots",
      "grade": "d",
      "icon": "assets/inventar/icons/steam_boots.webp",
      "price": 12000,
      "weight": 180,
      "description": "Мини-поршни в подошве ускоряют шаг. Защита ног D-ранга.",
      "defense": 25,
      "armorType": "heavy",
      "levelReq": 20,
      "crystalCount": 20
    },
    "buckler": {
      "id": "buckler",
      "name": "Малый Баклер",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/buckler.webp",
      "price": 200,
      "weight": 1210,
      "description": "Стартовый щит. No-Grade.",
      "defense": 16,
      "armorType": "heavy",
      "blockRate": 0,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "wood_block": {
      "id": "wood_block",
      "name": "Деревянный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/wood_block.webp",
      "price": 1200,
      "weight": 1210,
      "description": "Промежуточный No-Grade.",
      "defense": 26,
      "armorType": "heavy",
      "blockRate": 0,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "reflection_shield": {
      "id": "reflection_shield",
      "name": "Щит Отражения",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/reflection_shield.webp",
      "price": 4500,
      "weight": 1210,
      "description": "No-Grade, 10–15 ур.",
      "defense": 43,
      "armorType": "heavy",
      "blockRate": 1,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "kite_shield_ng": {
      "id": "kite_shield_ng",
      "name": "Каплевидный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/kite_shield_ng.webp",
      "price": 9000,
      "weight": 1210,
      "description": "Сильный магазинный No-Grade.",
      "defense": 52,
      "armorType": "heavy",
      "blockRate": 1,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "square_shield": {
      "id": "square_shield",
      "name": "Квадратный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/square_shield.webp",
      "price": 16000,
      "weight": 1210,
      "description": "Топ No-Grade.",
      "defense": 63,
      "armorType": "heavy",
      "blockRate": 2,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "bone_shield": {
      "id": "bone_shield",
      "name": "Костяной Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/bone_shield.webp",
      "price": 16000,
      "weight": 1210,
      "description": "Топ No-Grade. Аналог Квадратного.",
      "defense": 63,
      "armorType": "heavy",
      "blockRate": 2,
      "isShield": true,
      "levelReq": 1,
      "crystalCount": 0
    },
    "boiler_shield": {
      "id": "boiler_shield",
      "name": "Котловой Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/boiler_shield.webp",
      "price": 28000,
      "weight": 1210,
      "description": "Стартовый D. Блок срывает каст (C1).",
      "defense": 75,
      "armorType": "heavy",
      "blockRate": 2,
      "isShield": true,
      "levelReq": 20,
      "crystalCount": 56
    },
    "hoplon": {
      "id": "hoplon",
      "name": "Гоплон Давления",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/hoplon.webp",
      "price": 32000,
      "weight": 1210,
      "description": "Входной D-грейд.",
      "defense": 75,
      "armorType": "heavy",
      "blockRate": 2,
      "isShield": true,
      "levelReq": 20,
      "crystalCount": 64
    },
    "iron_shield": {
      "id": "iron_shield",
      "name": "Железный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/iron_shield.webp",
      "price": 55000,
      "weight": 1210,
      "description": "Середняк D, 25–30 ур.",
      "defense": 88,
      "armorType": "heavy",
      "blockRate": 2,
      "isShield": true,
      "levelReq": 20,
      "crystalCount": 110
    },
    "elven_shield": {
      "id": "elven_shield",
      "name": "Сплавной Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/elven_shield.webp",
      "price": 95000,
      "weight": 1210,
      "description": "Предтоповый D. (Отключено для Фазы 1).",
      "defense": 101,
      "armorType": "heavy",
      "blockRate": 3,
      "isShield": true,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 190
    },
    "kite_shield_d": {
      "id": "kite_shield_d",
      "name": "Большой Каплевидный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/kite_shield_d.webp",
      "price": 95000,
      "weight": 1210,
      "description": "D-грейд. Как Сплавной по P.Def. (Отключено для Фазы 1).",
      "defense": 101,
      "armorType": "heavy",
      "blockRate": 3,
      "isShield": true,
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 190
    },
    "blood_shield": {
      "id": "blood_shield",
      "name": "Щит Забвения",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/blood_shield.webp",
      "price": 160000,
      "weight": 1210,
      "description": "Топ D. (Отключено для Фазы 1).",
      "defense": 116,
      "armorType": "heavy",
      "blockRate": 3,
      "isShield": true,
      "setId": "blood",
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 320
    },
    "lion_shield": {
      "id": "lion_shield",
      "name": "Щит Рездика",
      "type": "armor",
      "slot": "shield",
      "grade": "d",
      "icon": "assets/inventar/icons/lion_shield.webp",
      "price": 160000,
      "weight": 1210,
      "description": "Топ D. (Отключено для Фазы 1).",
      "defense": 116,
      "armorType": "heavy",
      "blockRate": 3,
      "isShield": true,
      "setId": "lion",
      "disabled": true,
      "phase": 2,
      "levelReq": 20,
      "crystalCount": 320
    },
    "dwarven_shield": {
      "id": "dwarven_shield",
      "name": "Кузнечный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "c",
      "icon": "assets/inventar/icons/dwarven_shield.webp",
      "price": 380000,
      "weight": 1210,
      "description": "Входной C.",
      "defense": 129,
      "armorType": "heavy",
      "blockRate": 3,
      "isShield": true,
      "levelReq": 40,
      "crystalCount": 80
    },
    "tower_shield": {
      "id": "tower_shield",
      "name": "Башенный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "c",
      "icon": "assets/inventar/icons/tower_shield.webp",
      "price": 620000,
      "weight": 1210,
      "description": "Средний C.",
      "defense": 141,
      "armorType": "heavy",
      "blockRate": 4,
      "isShield": true,
      "levelReq": 40,
      "crystalCount": 130
    },
    "composite_shield": {
      "id": "composite_shield",
      "name": "Композитный Щит",
      "type": "armor",
      "slot": "shield",
      "grade": "c",
      "icon": "assets/inventar/icons/composite_shield.webp",
      "price": 1100000,
      "weight": 1210,
      "description": "Предтоп C. Сет composite.",
      "defense": 153,
      "armorType": "heavy",
      "blockRate": 4,
      "isShield": true,
      "setId": "composite",
      "levelReq": 40,
      "crystalCount": 220
    },
    "full_plate_shield": {
      "id": "full_plate_shield",
      "name": "Щит Полных Лат",
      "type": "armor",
      "slot": "shield",
      "grade": "c",
      "icon": "assets/inventar/icons/full_plate_shield.webp",
      "price": 1300000,
      "weight": 1210,
      "description": "Топ C. Сет full_plate (HP).",
      "defense": 153,
      "armorType": "heavy",
      "blockRate": 4,
      "isShield": true,
      "setId": "full_plate",
      "levelReq": 40,
      "crystalCount": 260
    },
    "zubei_shield": {
      "id": "zubei_shield",
      "name": "Щит Закалки",
      "type": "armor",
      "slot": "shield",
      "grade": "b",
      "icon": "assets/inventar/icons/zubei_shield.webp",
      "price": 4200000,
      "weight": 1210,
      "description": "Низший B-рейд. Сет zubei.",
      "defense": 176,
      "armorType": "heavy",
      "blockRate": 4,
      "isShield": true,
      "setId": "zubei",
      "levelReq": 52,
      "crystalCount": 210
    },
    "avadon_shield": {
      "id": "avadon_shield",
      "name": "Щит Оплота",
      "type": "armor",
      "slot": "shield",
      "grade": "b",
      "icon": "assets/inventar/icons/avadon_shield.webp",
      "price": 5500000,
      "weight": 1210,
      "description": "Средний B. +блок. Сет avadon.",
      "defense": 183,
      "armorType": "heavy",
      "blockRate": 6,
      "isShield": true,
      "setId": "avadon",
      "levelReq": 52,
      "crystalCount": 275
    },
    "blue_wolf_shield": {
      "id": "blue_wolf_shield",
      "name": "Щит Стального Волка",
      "type": "armor",
      "slot": "shield",
      "grade": "b",
      "icon": "assets/inventar/icons/blue_wolf_shield.webp",
      "price": 7200000,
      "weight": 1210,
      "description": "Топ B. Сет blue_wolf.",
      "defense": 190,
      "armorType": "heavy",
      "blockRate": 5,
      "isShield": true,
      "setId": "blue_wolf",
      "levelReq": 52,
      "crystalCount": 360
    },
    "doom_shield": {
      "id": "doom_shield",
      "name": "Щит Рока",
      "type": "armor",
      "slot": "shield",
      "grade": "b",
      "icon": "assets/inventar/icons/doom_shield.webp",
      "price": 7500000,
      "weight": 1210,
      "description": "Топ B. Танк-мета.",
      "defense": 190,
      "armorType": "heavy",
      "blockRate": 5,
      "isShield": true,
      "setId": "doom",
      "levelReq": 52,
      "crystalCount": 375
    },
    "copper_earring": {
      "id": "copper_earring",
      "name": "Медная серьга",
      "type": "accessory",
      "slot": "earring",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_earring.webp",
      "price": 300,
      "weight": 150,
      "description": "Простое украшение из медной проволоки.",
      "defense": 9,
      "cDef": 9,
      "energyBonus": 5,
      "levelReq": 1,
      "crystalCount": 0
    },
    "pressure_ring": {
      "id": "pressure_ring",
      "name": "Кольцо давления (устар.)",
      "type": "accessory",
      "slot": "bracelet",
      "grade": "d",
      "icon": "assets/inventar/icons/pressure_ring.webp",
      "price": 15000,
      "weight": 150,
      "description": "Устаревшее украшение. Слоты колец заменены нано-браслетами инженера.",
      "critBonus": 2,
      "levelReq": 20,
      "crystalCount": 30
    },
        "copper_necklace": {
      "id": "copper_necklace",
      "name": "Медное Ожерелье",
      "l2Name": "Necklace of Anguish",
      "type": "accessory",
      "slot": "necklace",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/engine_necklace.webp",
      "price": 600,
      "weight": 150,
      "description": "Простое медное ожерелье с заземляющей пластиной для защиты от магических импульсов.",
      "defense": 12,
      "cDef": 12,
      "levelReq": 1,
      "crystalCount": 0
    },
    "copper_ring": {
      "id": "copper_ring",
      "name": "Медный Фиксатор",
      "l2Name": "Blue Coral Ring",
      "type": "accessory",
      "slot": "bracelet",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_ring.webp",
      "price": 250,
      "weight": 100,
      "description": "Наручный фиксатор из медного сплава, поглощающий остаточные токи контуров.",
      "defense": 6,
      "cDef": 6,
      "levelReq": 1,
      "crystalCount": 0
    },
    "coral_earring": {
      "id": "coral_earring",
      "name": "Фреоновая Серьга",
      "l2Name": "Coral Earring",
      "type": "accessory",
      "slot": "earring",
      "grade": "d",
      "icon": "assets/inventar/icons/copper_earring.webp",
      "price": 8500,
      "weight": 150,
      "description": "Элегантная серьга с каплей очищенного хладагента. Существенно снижает урон от чужих заклинаний.",
      "defense": 18,
      "cDef": 18,
      "levelReq": 20,
      "crystalCount": 18
    },
    "iron_necklace": {
      "id": "iron_necklace",
      "name": "Штампованное Ожерелье",
      "l2Name": "Necklace of Darkness",
      "type": "accessory",
      "slot": "necklace",
      "grade": "d",
      "icon": "assets/inventar/icons/directive_seal.webp",
      "price": 14000,
      "weight": 200,
      "description": "Массивное кованое ожерелье ранга D с экранирующим напылением для надежной защиты от магии.",
      "defense": 24,
      "cDef": 24,
      "levelReq": 20,
      "crystalCount": 30
    },
    "engine_necklace": {
      "id": "engine_necklace",
      "name": "Ожерелье Двигателя",
      "type": "accessory",
      "slot": "necklace",
      "grade": "c",
      "icon": "assets/inventar/icons/engine_necklace.webp",
      "price": 90000,
      "weight": 255,
      "description": "Миниатюрный паровой двигатель в кулоне.",
      "hpBonus": 50,
      "energyBonus": 20,
      "levelReq": 40,
      "crystalCount": 40
    },
    "copper_parts": {
      "id": "copper_parts",
      "name": "Медные детали",
      "type": "adena",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_parts.webp",
      "price": 1,
      "weight": 0,
      "description": "Основная валюта Острова поющей стали.",
      "stackable": true,
      "maxStack": 999999999
    },
    "synthetic_oil": {
      "id": "synthetic_oil",
      "name": "Синтетическое масло",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/synthetic_oil.webp",
      "price": 20,
      "weight": 80,
      "description": "Восстанавливает 50 HP. На вкус как машинное масло.",
      "stackable": true,
      "maxStack": 999,
      "healHp": 50
    },
    "pressure_canister": {
      "id": "pressure_canister",
      "name": "Баллон давления",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_canister.webp",
      "price": 30,
      "weight": 80,
      "description": "Восстанавливает 30 энергии (пара).",
      "stackable": true,
      "maxStack": 999
    },
    "soulshot_no_grade": {
      "id": "soulshot_no_grade",
      "name": "Заряд: Механизм",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/soulshot_no_grade.webp",
      "price": 15,
      "weight": 4,
      "description": "Soulshot C1: ×2 физ. удар. ПКМ — вкл. авто, 1 шт. за удар.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "ss",
      "shotMult": 2
    },
    "soulshot_d": {
      "id": "soulshot_d",
      "name": "Заряд: Паровой двигатель",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/soulshot_d.webp",
      "price": 30,
      "weight": 4,
      "description": "Усиливает следующую физическую атаку на 50%.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "ss",
      "shotMult": 2,
      "levelReq": 20
    },
    "spiritshot_no_grade": {
      "id": "spiritshot_no_grade",
      "name": "Искровой заряд: Механизм",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/spiritshot_no_grade.webp",
      "price": 25,
      "weight": 4,
      "description": "Spiritshot C1: ×1.5 маг. умения. ПКМ — авто, 1 шт. за каст.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "sps",
      "shotMult": 1.5
    },
    "spiritshot_d": {
      "id": "spiritshot_d",
      "name": "Искровой заряд: Паровой двигатель",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/spiritshot_no_grade.webp",
      "price": 80,
      "weight": 4,
      "description": "Spiritshot D C1: ×1.5 маг. умения. ПКМ — авто, 1 шт. за каст.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "sps",
      "shotMult": 1.5,
      "levelReq": 20
    },
    "blessed_spiritshot_no_grade": {
      "id": "blessed_spiritshot_no_grade",
      "name": "Благ. искровой заряд: Механизм",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/blessed_spiritshot_no_grade.webp",
      "price": 60,
      "weight": 4,
      "description": "Blessed Spiritshot C1: ×2 маг. умения. ПКМ — авто, 1 шт. за каст.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "bsps",
      "shotMult": 2
    },
    "blessed_spiritshot_d": {
      "id": "blessed_spiritshot_d",
      "name": "Благ. искровой заряд: Паровой",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/spiritshot_no_grade.webp",
      "price": 180,
      "weight": 4,
      "description": "Blessed Spiritshot D C1: ×2 маг. умения. ПКМ — авто, 1 шт. за каст.",
      "stackable": true,
      "maxStack": 9999,
      "shotKind": "bsps",
      "shotMult": 2,
      "levelReq": 20
    },
    "emergency_repair_kit": {
      "id": "emergency_repair_kit",
      "name": "Аварийный ремкомплект",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/emergency_repair_kit.webp",
      "price": 80,
      "weight": 80,
      "description": "Аварийный ремонт корпуса. +150 HP.",
      "stackable": true,
      "maxStack": 99,
      "healHp": 150
    },
    "high_pressure_tank": {
      "id": "high_pressure_tank",
      "name": "Баллон высокого давления",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/high_pressure_tank.webp",
      "price": 90,
      "weight": 80,
      "description": "Восстанавливает 80 энергии (пара).",
      "stackable": true,
      "maxStack": 99,
      "levelReq": 20
    },
    "wooden_arrow": {
      "id": "wooden_arrow",
      "name": "Деревянная стрела",
      "l2Name": "Wooden Arrow",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/gear_fragment.webp",
      "price": 1,
      "weight": 1,
      "description": "Стандартная деревянная стрела No-Grade со стальным наконечником для луков.",
      "stackable": true,
      "maxStack": 99999
    },
    "iron_arrow": {
      "id": "iron_arrow",
      "name": "Кованая стрела (D)",
      "l2Name": "Bone Arrow",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/iron_scrap.webp",
      "price": 3,
      "weight": 1,
      "description": "Тяжелая кованая стрела ранга D повышенной кинетической энергии для луков.",
      "stackable": true,
      "maxStack": 99999,
      "levelReq": 20
    },
    "scroll_escape": {
      "id": "scroll_escape",
      "name": "Аварийный радиомаяк (SOE)",
      "l2Name": "Scroll of Escape",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 650,
      "weight": 30,
      "description": "Активирует аварийный телепорт и немедленно возвращает игрока на площадь Деревни Поющей Стали.",
      "stackable": true,
      "maxStack": 100
    },
    "scroll_resurrection": {
      "id": "scroll_resurrection",
      "name": "Полевой дефибриллятор",
      "l2Name": "Scroll of Resurrection",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 2800,
      "weight": 30,
      "description": "Реанимирует павшего союзника на поле боя, восстанавливая 20% утраченного опыта.",
      "stackable": true,
      "maxStack": 100
    },
    "antidote": {
      "id": "antidote",
      "name": "Очищающий фильтр (Антидот)",
      "l2Name": "Antidote",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/steam_valve.webp",
      "price": 60,
      "weight": 20,
      "description": "Нейтрализует ядовитые и кислотные испарения в контурах брони.",
      "stackable": true,
      "maxStack": 100
    },
    "bandage": {
      "id": "bandage",
      "name": "Герметизирующий пластырь (Бинт)",
      "l2Name": "Bandage",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_cable.webp",
      "price": 40,
      "weight": 20,
      "description": "Быстро герметизирует пробоины и останавливает утечку давления/крови.",
      "stackable": true,
      "maxStack": 100
    },
    "potion_alacrity": {
      "id": "potion_alacrity",
      "name": "Машинный форсаж (Alacrity)",
      "l2Name": "Potion of Alacrity",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/synthetic_oil.webp",
      "price": 1200,
      "weight": 50,
      "description": "Разгоняет приводы механизмов: +15% к скорости атаки на 20 минут.",
      "stackable": true,
      "maxStack": 50
    },
    "potion_wind_walk": {
      "id": "potion_wind_walk",
      "name": "Турбинная смазка (Wind Walk)",
      "l2Name": "Potion of Wind Walk",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/synthetic_oil.webp",
      "price": 1500,
      "weight": 50,
      "description": "Снижает сопротивление суставов: +20% к скорости перемещения на 20 минут.",
      "stackable": true,
      "maxStack": 50
    },
    "gear_fragment": {
      "id": "gear_fragment",
      "name": "Обломок шестерни",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/gear_fragment.webp",
      "price": 5,
      "weight": 20,
      "description": "На ней выгравировано: \"Сделано до Великой Остановки\".",
      "stackable": true,
      "maxStack": 9999
    },
    "copper_cable": {
      "id": "copper_cable",
      "name": "Медный кабель",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_cable.webp",
      "price": 8,
      "weight": 20,
      "description": "Провод в изоляции из вулканизированной резины.",
      "stackable": true,
      "maxStack": 9999
    },
    "iron_scrap": {
      "id": "iron_scrap",
      "name": "Железный лом",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/iron_scrap.webp",
      "price": 3,
      "weight": 20,
      "description": "Кусок ржавого железа. Переплавляется в слитки.",
      "stackable": true,
      "maxStack": 9999
    },
    "steam_valve": {
      "id": "steam_valve",
      "name": "Паровой клапан",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/steam_valve.webp",
      "price": 15,
      "weight": 20,
      "description": "Регулирует подачу пара в механизмах.",
      "stackable": true,
      "maxStack": 9999
    },
    "pressure_gauge": {
      "id": "pressure_gauge",
      "name": "Манометр",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_gauge.webp",
      "price": 20,
      "weight": 20,
      "description": "Измеряет давление в котлах. Стрелка застыла на красной зоне.",
      "stackable": true,
      "maxStack": 9999
    },
    "piston_ring": {
      "id": "piston_ring",
      "name": "Поршневое кольцо",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/piston_ring.webp",
      "price": 18,
      "weight": 20,
      "description": "Уплотнение для паровых цилиндров.",
      "stackable": true,
      "maxStack": 9999
    },
    "spark_plug": {
      "id": "spark_plug",
      "name": "Свеча зажигания",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/spark_plug.webp",
      "price": 20,
      "weight": 20,
      "description": "Искра в котле — жизнь в машине.",
      "stackable": true,
      "maxStack": 9999
    },
    "oil_filter": {
      "id": "oil_filter",
      "name": "Масляный фильтр",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/oil_filter.webp",
      "price": 12,
      "weight": 20,
      "description": "Отсеивает ржавчину из контуров.",
      "stackable": true,
      "maxStack": 9999
    },
    "boiler_plate": {
      "id": "boiler_plate",
      "name": "Котловая пластина",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/boiler_plate.webp",
      "price": 50,
      "weight": 20,
      "description": "Толстый лист стали для обшивки котлов.",
      "stackable": true,
      "maxStack": 9999,
      "levelReq": 20
    },
    "hydraulic_fluid": {
      "id": "hydraulic_fluid",
      "name": "Гидравлическая жидкость",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/hydraulic_fluid.webp",
      "price": 40,
      "weight": 20,
      "description": "Специальная жидкость для гидравлических систем.",
      "stackable": true,
      "maxStack": 9999,
      "levelReq": 20
    },
    "pressure_amplifier": {
      "id": "pressure_amplifier",
      "name": "Усилитель давления",
      "type": "enchant",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pressure_amplifier.webp",
      "price": 500,
      "weight": 120,
      "description": "Используется для заточки экипировки.",
      "stackable": true,
      "maxStack": 9999
    },
    "pressure_amplifier_d": {
      "id": "pressure_amplifier_d",
      "name": "Усилитель давления D",
      "type": "enchant",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/pressure_amplifier.webp",
      "price": 2000,
      "weight": 120,
      "description": "Повышает характеристики предметов D-Grade.",
      "stackable": true,
      "maxStack": 9999,
      "levelReq": 20
    },
    "blessed_pressure_amplifier": {
      "id": "blessed_pressure_amplifier",
      "name": "Благословлённый усилитель",
      "type": "enchant",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/blessed_pressure_amplifier.webp",
      "price": 5000,
      "weight": 120,
      "description": "Обеспечивает безопасное усиление: при сбое предмет не ломается.",
      "stackable": true,
      "maxStack": 9999
    },
    "crystal_no_grade": {
      "id": "crystal_no_grade",
      "name": "Кристалл: Механизм",
      "type": "crystal",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/crystal_no_grade.webp",
      "price": 10,
      "weight": 20,
      "description": "Осколок кристаллизованного пара. Используется в крафте.",
      "stackable": true,
      "maxStack": 99999
    },
    "crystal_d": {
      "id": "crystal_d",
      "name": "Кристалл: Паровой двигатель",
      "type": "crystal",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/crystal_d.webp",
      "price": 50,
      "weight": 20,
      "description": "Кристалл с энергией парового двигателя.",
      "stackable": true,
      "maxStack": 99999,
      "levelReq": 20
    },
    "crystal_c": {
      "id": "crystal_c",
      "name": "Кристалл: Гидравлика",
      "type": "crystal",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/crystal_c.webp",
      "price": 200,
      "weight": 20,
      "description": "Кристалл с энергией гидравлических систем.",
      "stackable": true,
      "maxStack": 99999
    },
    "recipe_leather_gloves": {
          "id": "recipe_leather_gloves",
          "name": "Чертеж: Кожаные перчатки",
          "type": "recipe",
          "slot": null,
          "grade": "no_grade",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 400,
          "weight": 100,
          "description": "Схема раскроя и клепки легких кожаных перчаток наладчика.",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "rubber_skin",
                      "count": 8
                },
                {
                      "id": "gasket_suede",
                      "count": 4
                },
                {
                      "id": "copper_cable",
                      "count": 2
                }
          ],
          "craftResult": "leather_gloves",
          "levelReq": 1
    },
    "recipe_work_boots": {
          "id": "recipe_work_boots",
          "name": "Чертеж: Рабочие ботинки",
          "type": "recipe",
          "slot": null,
          "grade": "no_grade",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 600,
          "weight": 100,
          "description": "Схема усиления подошвы тяжелых рабочих ботинок со стальным носком.",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "rubber_skin",
                      "count": 10
                },
                {
                      "id": "coal_briquette",
                      "count": 5
                },
                {
                      "id": "iron_scrap",
                      "count": 4
                }
          ],
          "craftResult": "work_boots",
          "levelReq": 1
    },
    "recipe_copper_shield": {
          "id": "recipe_copper_shield",
          "name": "Чертеж: Медный щит",
          "type": "recipe",
          "slot": null,
          "grade": "no_grade",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 1500,
          "weight": 120,
          "description": "Чертеж штамповки и клепки тяжелого медного защитного щита.",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "iron_scrap",
                      "count": 15
                },
                {
                      "id": "copper_cable",
                      "count": 8
                },
                {
                      "id": "coal_briquette",
                      "count": 6
                }
          ],
          "craftResult": "copper_shield",
          "levelReq": 5
    },
    "recipe_pressure_amplifier": {
          "id": "recipe_pressure_amplifier",
          "name": "Чертеж: Усилитель давления",
          "type": "recipe",
          "slot": null,
          "grade": "no_grade",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 2000,
          "weight": 120,
          "description": "Схема калибровки и сборки базового усилителя давления контура (заточка NG).",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "steam_valve",
                      "count": 2
                },
                {
                      "id": "pressure_gauge",
                      "count": 1
                },
                {
                      "id": "crystal_no_grade",
                      "count": 3
                },
                {
                      "id": "varnish_seal",
                      "count": 2
                }
          ],
          "craftResult": "pressure_amplifier",
          "levelReq": 10
    },
    "recipe_soulshot_d": {
          "id": "recipe_soulshot_d",
          "name": "Чертеж: Заряды Души (D)",
          "type": "recipe",
          "slot": null,
          "grade": "d",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 5000,
          "weight": 120,
          "description": "Технологический регламент прессования боевых зарядов души D-грейда.",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "crystal_d",
                      "count": 1
                },
                {
                      "id": "spark_plug",
                      "count": 2
                },
                {
                      "id": "varnish_seal",
                      "count": 3
                }
          ],
          "craftResult": "soulshot_d",
          "levelReq": 20
    },
    "recipe_hydraulic_fluid": {
          "id": "recipe_hydraulic_fluid",
          "name": "Чертеж: Гидравлическая жидкость",
          "type": "recipe",
          "slot": null,
          "grade": "d",
          "icon": "assets/inventar/icons/scroll.webp",
          "price": 6000,
          "weight": 120,
          "description": "Рецепт химической дистилляции огнеупорной гидравлической жидкости.",
          "stackable": true,
          "maxStack": 100,
          "craftMaterials": [
                {
                      "id": "varnish_seal",
                      "count": 4
                },
                {
                      "id": "oil_filter",
                      "count": 3
                },
                {
                      "id": "drive_bone",
                      "count": 2
                }
          ],
          "craftResult": "hydraulic_fluid",
          "levelReq": 20
    },
    "piston_component": {
          "id": "piston_component",
          "name": "Поршневой узел высокого давления",
          "type": "material",
          "slot": null,
          "grade": "d",
          "icon": "assets/inventar/icons/piston_ring.webp",
          "price": 4500,
          "weight": 50,
          "description": "Высокоточный механический поршневой узел в сборе для гидравлических приводов и паровых машин.",
          "stackable": true,
          "maxStack": 9999,
          "levelReq": 20,
          "crystalCount": 0
    },
    "recipe_synthetic_oil": {
      "id": "recipe_synthetic_oil",
      "name": "Чертеж: Синтетическое масло",
      "type": "recipe",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 100,
      "weight": 120,
      "description": "Схема синтеза масла из подручных материалов.",
      "stackable": true,
      "maxStack": 100,
      "craftMaterials": [
        {
          "id": "gear_fragment",
          "count": 2
        },
        {
          "id": "oil_filter",
          "count": 1
        }
      ],
      "craftResult": "synthetic_oil"
    },
    "recipe_pressure_canister": {
      "id": "recipe_pressure_canister",
      "name": "Чертеж: Баллон давления",
      "type": "recipe",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 150,
      "weight": 120,
      "description": "Схема сборки баллона для хранения пара.",
      "stackable": true,
      "maxStack": 100,
      "craftMaterials": [
        {
          "id": "iron_scrap",
          "count": 3
        },
        {
          "id": "steam_valve",
          "count": 1
        }
      ],
      "craftResult": "pressure_canister"
    },
    "recipe_soulshot_no_grade": {
      "id": "recipe_soulshot_no_grade",
      "name": "Чертеж: Заряд Механизма",
      "type": "recipe",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 200,
      "weight": 120,
      "description": "Схема создания боевых зарядов.",
      "stackable": true,
      "maxStack": 100,
      "craftMaterials": [
        {
          "id": "crystal_no_grade",
          "count": 1
        },
        {
          "id": "spark_plug",
          "count": 1
        }
      ],
      "craftResult": "soulshot_no_grade"
    },
    "recipe_piston": {
      "id": "recipe_piston",
      "name": "Чертеж: Поршень",
      "type": "recipe",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 2000,
      "weight": 120,
      "description": "Схема поршня высокого давления.",
      "stackable": true,
      "maxStack": 100,
      "craftMaterials": [
        {
          "id": "iron_scrap",
          "count": 10
        },
        {
          "id": "piston_ring",
          "count": 2
        },
        {
          "id": "crystal_d",
          "count": 1
        }
      ],
      "craftResult": "piston_component",
      "levelReq": 20
    },
    "recipe_steel_plate": {
      "id": "recipe_steel_plate",
      "name": "Чертеж: Стальная пластина",
      "type": "recipe",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 5000,
      "weight": 120,
      "description": "Схема катки стальной брони.",
      "stackable": true,
      "maxStack": 100,
      "craftMaterials": [
        {
          "id": "iron_scrap",
          "count": 20
        },
        {
          "id": "boiler_plate",
          "count": 2
        },
        {
          "id": "crystal_d",
          "count": 3
        }
      ],
      "craftResult": "steel_plate",
      "levelReq": 20
    },
    "recipe_hydraulic_armor": {
      "id": "recipe_hydraulic_armor",
      "name": "Чертеж: Гидравлический доспех",
      "type": "recipe",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 50000,
      "weight": 120,
      "description": "Секретная схема экзоскелета Регуляторов.",
      "stackable": true,
      "maxStack": 10,
      "craftMaterials": [
        {
          "id": "steel_plate",
          "count": 5
        },
        {
          "id": "hydraulic_fluid",
          "count": 10
        },
        {
          "id": "crystal_c",
          "count": 5
        },
        {
          "id": "pressure_amplifier_d",
          "count": 3
        }
      ],
      "craftResult": "hydraulic_armor"
    },
    "recipe_hydraulic_blade": {
      "id": "recipe_hydraulic_blade",
      "name": "Чертеж: Гидравлический клинок",
      "type": "recipe",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 55000,
      "weight": 120,
      "description": "Схема клинка с гидравлическим приводом.",
      "stackable": true,
      "maxStack": 10,
      "craftMaterials": [
        {
          "id": "steel_plate",
          "count": 3
        },
        {
          "id": "hydraulic_fluid",
          "count": 8
        },
        {
          "id": "crystal_c",
          "count": 5
        },
        {
          "id": "pressure_amplifier_d",
          "count": 3
        }
      ],
      "craftResult": "hydraulic_blade"
    },
    "leather_vest": {
      "id": "leather_vest",
      "name": "Кожаный жилет",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/leather_vest.webp",
      "price": 400,
      "weight": 830,
      "description": "Жилет из вулканизированной кожи.",
      "defense": 15,
      "armorType": "light",
      "hpBonus": 25
    },
    "copper_chainmail": {
      "id": "copper_chainmail",
      "name": "Медная кольчуга",
      "type": "armor",
      "slot": "chest",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_chainmail.webp",
      "price": 8500,
      "weight": 4200,
      "description": "Сет «Медная Кольчуга» (2): Физ. Защита +5.26%, HP +50. Кольчуга из медных колец.",
      "defense": 47,
      "armorType": "heavy",
      "setId": "bronze_ng",
      "isOperatorArmor": true,
      "isLivePhase1": true,
      "levelReq": 10,
      "crystalCount": 0,
      "armorType": "heavy",

    },
    "leather_cap": {
      "id": "leather_cap",
      "name": "Кожаная кепка",
      "type": "armor",
      "slot": "head",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/leather_cap.webp",
      "price": 120,
      "weight": 420,
      "description": "Кепка с металлической вставкой.",
      "defense": 12,
      "armorType": "light",
      "hpBonus": 10,
      "levelReq": 1,
      "crystalCount": 0
    },
    "copper_shield": {
      "id": "copper_shield",
      "name": "Медный щит",
      "type": "armor",
      "slot": "shield",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/copper_shield.webp",
      "price": 300,
      "weight": 1210,
      "description": "Щит из листовой меди.",
      "defense": 20,
      "armorType": "heavy",
      "blockRate": 10
    },
    "audio_log_01": {
      "id": "audio_log_01",
      "name": "Аудио-лог: Инженер #12",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/audio_log_01.webp",
      "price": 0,
      "weight": 0,
      "description": "Запись с помехами: \"...Сбой Нулевого Цикла не был случайным...\""
    },
    "superheated_core": {
      "id": "superheated_core",
      "name": "Раскаленный ТЭН",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/superheated_core.webp",
      "price": 0,
      "weight": 0,
      "description": "Спиральный вольфрамовый нагревательный элемент из плиты-шкварки. Хранит мощный тепловой заряд для термо-контура."
    },
    "pure_condensate": {
      "id": "pure_condensate",
      "name": "Чистый конденсат",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/pure_condensate.webp",
      "price": 0,
      "weight": 0,
      "description": "Очищенная деминерализованная фреон-эмульсия из поливной турели для гидро-контура охлаждения."
    },
    "kinetic_valve": {
      "id": "kinetic_valve",
      "name": "Клапан сверхдавления",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/kinetic_valve.webp",
      "price": 0,
      "weight": 0,
      "description": "Титановый акустический клапан сабвуфера-контузителя, выдерживающий ультразвуковые колебания пневмо-контура."
    },
    "spark_resonator": {
      "id": "spark_resonator",
      "name": "Искровой резонатор",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/spark_resonator.webp",
      "price": 0,
      "weight": 0,
      "description": "Высоковольтный преобразователь ремонтного дрона, генерирующий дуговой импульс в миллион вольт."
    },
    "mark_of_constructor": {
      "id": "mark_of_constructor",
      "name": "Знак Конструктора",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/mark_of_constructor.webp",
      "price": 0,
      "weight": 0,
      "description": "Официальный патент Синдиката, подтверждающий звание Конструктора боевых контуров (L2 C1 Wizard prototype)."
    },
    "protocol_punchcards": {
      "id": "protocol_punchcards",
      "name": "Перфокарты Искры",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/protocol_punchcards.webp",
      "price": 0,
      "weight": 0,
      "description": "Перфорированные металлические ленты с зашифрованным кодом Первой Искры и алгоритмами восстановления."
    },
    "oil_crystal": {
      "id": "oil_crystal",
      "name": "Кристалл Наладчика",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/oil_crystal.webp",
      "price": 0,
      "weight": 0,
      "description": "Масляный калибровочный кристалл — семейная реликвия механиков, вибрирующая в резонанс с Искрой."
    },
    "mark_of_technomancer": {
      "id": "mark_of_technomancer",
      "name": "Знак Наладчика",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/mark_of_technomancer.webp",
      "price": 0,
      "weight": 0,
      "description": "Священная эмблема Ордена Искры, удостоверяющая звание Наладчика и полевого медика (L2 C1 Cleric prototype)."
    },
    "drill_worm_core": {
      "id": "drill_worm_core",
      "name": "Ядро Босса-Бура",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/drill_worm_core.webp",
      "price": 100000,
      "weight": 20,
      "description": "Пульсирующее ядро механизма, вырвавшегося из-под земли.",
      "stackable": true,
      "maxStack": 10
    },
    "press_hammer_core": {
      "id": "press_hammer_core",
      "name": "Ядро Пресс-Молота",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/press_hammer_core.webp",
      "price": 80000,
      "weight": 20,
      "description": "Тяжёлое ядро Автономного Пресс-Молота.",
      "stackable": true,
      "maxStack": 10
    },
    "scrap_tyrant_core": {
      "id": "scrap_tyrant_core",
      "name": "Ядро Тирана Свалки",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/scrap_tyrant_core.webp",
      "price": 45000,
      "weight": 20,
      "description": "Сжатый узел власти над ломом. Рейд phase 1 (~14–16).",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "boiler_sovereign_core": {
      "id": "boiler_sovereign_core",
      "name": "Ядро Суверена Котла",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/boiler_sovereign_core.webp",
      "price": 120000,
      "weight": 20,
      "description": "Сердце восточного котла. Эпик-рейд phase 1 (~19–20).",
      "stackable": true,
      "maxStack": 10
    },
    "cruna_overseer_core": {
      "id": "cruna_overseer_core",
      "name": "Ядро Смотрителя Круны",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/cruna_overseer_core.webp",
      "price": 90000,
      "weight": 20,
      "description": "Резонансное ядро Смотрителя Дворов Круны. Элитный хранитель 20 ур.",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "rezdiq_seal": {
      "id": "rezdiq_seal",
      "name": "Печать Полковника Рездика",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/rezdiq_seal.webp",
      "price": 110000,
      "weight": 20,
      "description": "Командная печать Полковника Рездика-VII. Элитный хранитель 22 ур.",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "green_protocol_core": {
      "id": "green_protocol_core",
      "name": "Ядро Протокола «Зелёный»",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/green_protocol_core.webp",
      "price": 130000,
      "weight": 20,
      "description": "Токсичное ядро защитного автомата химзавода. Элитный хранитель 22 ур.",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "citadel_resonance_key": {
      "id": "citadel_resonance_key",
      "name": "Резонансный Ключ Цитадели",
      "type": "quest",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/citadel_resonance_key.webp",
      "price": 0,
      "weight": 0,
      "description": "Выкован механиками Дозора из 7 ядер Хранителей Острова. Отпирает врата Крепости стального предела.",
      "stackable": false,
      "maxStack": 1
    },
    "steel_colossus_core": {
      "id": "steel_colossus_core",
      "name": "Сверхъядро Колосса",
      "type": "quest",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/steel_colossus_core.webp",
      "price": 0,
      "weight": 0,
      "description": "Сверхъядро поверженного Стального Колосса Предела. Финальный трофей первой фазы.",
      "stackable": false,
      "maxStack": 1
    },
    "harbor_courier_parcel": {
      "id": "harbor_courier_parcel",
      "name": "Посылка в Гавань",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/harbor_courier_parcel.webp",
      "price": 0,
      "weight": 0,
      "description": "Опечатанный ящик со смазкой и деталями от Милли для старателя Грога в Гавани.",
      "stackable": false,
      "maxStack": 1
    },
    "astard_survey_token": {
      "id": "astard_survey_token",
      "name": "Вешка Геодезиста",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/astard_survey_token.webp",
      "price": 0,
      "weight": 0,
      "description": "Калибровочный маячок геодезистов Синдиката с предгорий Астарда.",
      "stackable": true,
      "maxStack": 20
    },
    "fallen_memorial_dogtag": {
      "id": "fallen_memorial_dogtag",
      "name": "Жетон Павшего Дозора",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/fallen_memorial_dogtag.webp",
      "price": 0,
      "weight": 0,
      "description": "Именной стальной жетон павшего солдата Дозора с Поля Забвения.",
      "stackable": true,
      "maxStack": 20
    },
    "chem_toxic_sample": {
      "id": "chem_toxic_sample",
      "name": "Проба Зеленой Порчи",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/chem_toxic_sample.webp",
      "price": 0,
      "weight": 0,
      "description": "Герметичная ампула с кислотным конденсатом Руин Химзавода.",
      "stackable": true,
      "maxStack": 20
    },
    "rezdiq_dispatch_orders": {
      "id": "rezdiq_dispatch_orders",
      "name": "Пакет Приказов Рездика",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/rezdiq_dispatch_orders.webp",
      "price": 0,
      "weight": 0,
      "description": "Секретные полевые директивы для Бараков Рездика от Инспектора Гилберта.",
      "stackable": false,
      "maxStack": 1
    },
    "cruna_forges_alloy": {
      "id": "cruna_forges_alloy",
      "name": "Слиток Дворов Круны",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/cruna_forges_alloy.webp",
      "price": 0,
      "weight": 0,
      "description": "Экспериментальный жаропрочный сплав из плавилен Башни Круна.",
      "stackable": true,
      "maxStack": 20
    },
    "steel_limit_beacon": {
      "id": "steel_limit_beacon",
      "name": "Метка Рубежа",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/steel_limit_beacon.webp",
      "price": 0,
      "weight": 0,
      "description": "Маяк координатной сетки перед бастионом Крепости стального предела.",
      "stackable": true,
      "maxStack": 20
    },
    "rubber_duck_debug": {
      "id": "rubber_duck_debug",
      "name": "Резиновая уточка-отладчик",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/rubber_duck_debug.webp",
      "price": 120,
      "weight": 80,
      "description": "Классика: объясни баг уточке — +80 HP. С Тостер-Оверлорда.",
      "stackable": true,
      "maxStack": 99,
      "healHp": 80
    },
    "coffee_grounds_oil": {
      "id": "coffee_grounds_oil",
      "name": "Масло из кофейной гущи",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/coffee_grounds_oil.webp",
      "price": 90,
      "weight": 80,
      "description": "Горько, чёрно, 14 бар. +45 энергии. Эспрессо для механизмов.",
      "stackable": true,
      "maxStack": 99
    },
    "energy_drink_skibidi": {
      "id": "energy_drink_skibidi",
      "name": "Энергетик «Скибиди-Пар»",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/hud/debuffs/energy_skibidi.webp",
      "price": 350,
      "weight": 50,
      "description": "Вкус: батарейка + сахар. Урон +25% на 60 сек. Brainrot fuel.",
      "stackable": true,
      "maxStack": 50
    },
    "broken_airpods_one": {
      "id": "broken_airpods_one",
      "name": "Сломанный AirPod (один)",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/broken_airpods_one.webp",
      "price": 800,
      "weight": 20,
      "description": "Всегда только левый. Слышит Wi-Fi 404. На продажу / коллекция.",
      "stackable": true,
      "maxStack": 99
    },
    "qr_code_of_chaos": {
      "id": "qr_code_of_chaos",
      "name": "QR-код Хаоса",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/qr_code_of_chaos.webp",
      "price": 1500,
      "weight": 20,
      "description": "Сканируешь — «404 Not Found». Мемный трофей с Роутера 404.",
      "stackable": true,
      "maxStack": 20
    },
    "meme_usb_16gb": {
      "id": "meme_usb_16gb",
      "name": "Флешка «16 ГБ мемов»",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/meme_usb_16gb.webp",
      "price": 4200,
      "weight": 20,
      "description": "На деле 14.8. Полная рикроллов и скибиди. Трофей / на продажу.",
      "stackable": true,
      "maxStack": 20,
      "levelReq": 20
    },
    "paper_jam_coupon": {
      "id": "paper_jam_coupon",
      "name": "Купон «Paper Jam»",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/paper_jam_coupon.webp",
      "price": 200,
      "weight": 80,
      "description": "Обмен на жизнь: +120 HP. Принтер Судьбы одобряет.",
      "stackable": true,
      "maxStack": 50,
      "healHp": 120
    },
    "sticky_note_urgent": {
      "id": "sticky_note_urgent",
      "name": "Стикер «СРОЧНО!!!»",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/sticky_note_urgent.webp",
      "price": 40,
      "weight": 20,
      "description": "Жёлтый. Три восклицательных. Никто не читает. С Принтера Судьбы.",
      "stackable": true,
      "maxStack": 99
    },
    "bluetooth_pairing_charm": {
      "id": "bluetooth_pairing_charm",
      "name": "Амулет сопряжения Bluetooth",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/hud/debuffs/bluetooth_charm.webp",
      "price": 900,
      "weight": 50,
      "description": "«Connected to: you». Урон +35% на 90 сек. Басс бустит кости.",
      "stackable": true,
      "maxStack": 30,
      "levelReq": 20
    },
    "toaster_crumb_core": {
      "id": "toaster_crumb_core",
      "name": "Ядро крошек Тостера",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/toaster_crumb_core.webp",
      "price": 600,
      "weight": 20,
      "description": "Сгоревший хлеб как доказательство. Easter mini-raid (4–6).",
      "stackable": true,
      "maxStack": 20
    },
    "coffee_berserk_filter": {
      "id": "coffee_berserk_filter",
      "name": "Фильтр Берсерка",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/coffee_berserk_filter.webp",
      "price": 1200,
      "weight": 20,
      "description": "Забит кофеином и яростью. Easter mini-raid (8–10).",
      "stackable": true,
      "maxStack": 20
    },
    "wifi_antenna_broken": {
      "id": "wifi_antenna_broken",
      "name": "Сломанная антенна 404",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/wifi_antenna_broken.webp",
      "price": 2800,
      "weight": 20,
      "description": "Ловит только грусть. Easter mini-raid (11–13).",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "printer_toner_soul": {
      "id": "printer_toner_soul",
      "name": "Тонер «Душа»",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/printer_toner_soul.webp",
      "price": 3500,
      "weight": 20,
      "description": "Картридж на нуле, но душа полна. Easter mini-raid (13–15).",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "bluetooth_oracle_chip": {
      "id": "bluetooth_oracle_chip",
      "name": "Чип Bluetooth-Оракула",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/bluetooth_oracle_chip.webp",
      "price": 5500,
      "weight": 20,
      "description": "Connected to: nothing. Bass boosted. Easter mini-raid (16–18).",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "title_tralalero": {
      "id": "title_tralalero",
      "name": "Титул: Tralalero Toasterino",
      "type": "title",
      "slot": "title",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/title_tralalero.webp",
      "price": 1200,
      "weight": 20,
      "titleText": "Tralalero Toasterino",
      "titleColor": "#ff88cc",
      "description": "Экипируемый титул над персонажем. Можно надеть в слот титула, снять, выкинуть или продать.",
      "stackable": false,
      "maxStack": 1
    },
    "title_bombardiro": {
      "id": "title_bombardiro",
      "name": "Титул: Bombardiro Blendodilo",
      "type": "title",
      "slot": "title",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/title_bombardiro.webp",
      "price": 1500,
      "weight": 20,
      "titleText": "Bombardiro Blendodilo",
      "titleColor": "#ff8844",
      "description": "Экипируемый титул над персонажем. Можно надеть в слот титула, снять, выкинуть или продать.",
      "stackable": false,
      "maxStack": 1
    },
    "title_tung_tung": {
      "id": "title_tung_tung",
      "name": "Титул: Tung Tung Vacuum Sahur",
      "type": "title",
      "slot": "title",
      "grade": "d",
      "icon": "assets/inventar/icons/title_tung_tung.webp",
      "price": 2500,
      "weight": 20,
      "titleText": "Tung Tung Vacuum Sahur",
      "titleColor": "#aa88ff",
      "description": "Экипируемый титул над персонажем. Можно надеть в слот титула, снять, выкинуть или продать.",
      "stackable": false,
      "maxStack": 1,
      "levelReq": 20
    },
    "title_ballerina_cap": {
      "id": "title_ballerina_cap",
      "name": "Титул: Ballerina Cappuccino",
      "type": "title",
      "slot": "title",
      "grade": "d",
      "icon": "assets/inventar/icons/title_ballerina_cap.webp",
      "price": 3000,
      "weight": 20,
      "titleText": "Ballerina Cappuccino",
      "titleColor": "#ffd700",
      "description": "Экипируемый титул над персонажем. Можно надеть в слот титула, снять, выкинуть или продать.",
      "stackable": false,
      "maxStack": 1,
      "levelReq": 20
    },
    "title_skibidi_steam": {
      "id": "title_skibidi_steam",
      "name": "Титул: Skibidi Steamino",
      "type": "title",
      "slot": "title",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/title_skibidi_steam.webp",
      "price": 1200,
      "weight": 20,
      "titleText": "Skibidi Steamino",
      "titleColor": "#66ffaa",
      "description": "Экипируемый титул над персонажем. Можно надеть в слот титула, снять, выкинуть или продать.",
      "stackable": false,
      "maxStack": 1
    },
    "title_pioneer": {
      "id": "title_pioneer",
      "name": "Титул: Первопроходец",
      "type": "title",
      "slot": "title",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/title_pioneer.webp",
      "price": 500,
      "weight": 10,
      "titleText": "Первопроходец",
      "titleColor": "#60d0ff",
      "description": "Свиток титула первопроходца паровых пустошей. Надевается в слот титула.",
      "stackable": false,
      "maxStack": 1
    },
    "title_master": {
      "id": "title_master",
      "name": "Титул: Мастер Механики",
      "type": "title",
      "slot": "title",
      "grade": "d",
      "icon": "assets/inventar/icons/title_master.webp",
      "price": 2000,
      "weight": 10,
      "titleText": "Мастер Механики",
      "titleColor": "#ffd700",
      "description": "Почётный титул признанного мастера паровых технологий. Надевается в слот титула.",
      "stackable": false,
      "maxStack": 1,
      "levelReq": 20
    },
    "title_steam_lord": {
      "id": "title_steam_lord",
      "name": "Титул: Укротитель Котла",
      "type": "title",
      "slot": "title",
      "grade": "d",
      "icon": "assets/inventar/icons/title_steam_lord.webp",
      "price": 5000,
      "weight": 10,
      "titleText": "Укротитель Котла",
      "titleColor": "#ff6600",
      "description": "Почётный титул героя, сокрушившего Суверена Котла и спасшего паровые магистрали острова. Надевается в слот титула.",
      "stackable": false,
      "maxStack": 1,
      "levelReq": 20
    },
    "costume_apprentice": {
      "id": "costume_apprentice",
      "name": "Костюм Подмастерья",
      "type": "costume",
      "slot": "costume",
      "grade": "no_grade",
      "icon": "assets/inventar/icons/costume_apprentice.webp",
      "price": 800,
      "weight": 30,
      "description": "Декоративный костюм подмастерья паровых цехов. Надевается в слот костюма.",
      "stackable": false,
      "maxStack": 1
    },
    "dye_pink_brainrot": {
      "id": "dye_pink_brainrot",
      "name": "Краска ника: Мем-розовый",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/dye_pink_brainrot.webp",
      "price": 800,
      "weight": 50,
      "description": "ПКМ: ник становится мем-розовым. Видно в мире и в HUD.",
      "stackable": true,
      "maxStack": 10
    },
    "dye_fire_blend": {
      "id": "dye_fire_blend",
      "name": "Краска ника: Блендер-огонь",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/dye_fire_blend.webp",
      "price": 1200,
      "weight": 50,
      "description": "ПКМ: огненно-оранжевый ник. Bombardiro certified.",
      "stackable": true,
      "maxStack": 10
    },
    "dye_vacuum_violet": {
      "id": "dye_vacuum_violet",
      "name": "Краска ника: Вакуум-фиолет",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/dye_vacuum_violet.webp",
      "price": 1800,
      "weight": 50,
      "description": "ПКМ: фиолетовый ник. Tung tung style.",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "dye_cappuccino_gold": {
      "id": "dye_cappuccino_gold",
      "name": "Краска ника: Капучино-золото",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/dye_cappuccino_gold.webp",
      "price": 2500,
      "weight": 50,
      "description": "ПКМ: золотой ник балерины-кофемашины.",
      "stackable": true,
      "maxStack": 10,
      "levelReq": 20
    },
    "dye_skibidi_green": {
      "id": "dye_skibidi_green",
      "name": "Краска ника: Скибиди-зелёный",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/dye_skibidi_green.webp",
      "price": 1000,
      "weight": 50,
      "description": "ПКМ: кислотно-зелёный ник. Yes yes.",
      "stackable": true,
      "maxStack": 10
    },
    "aura_tralala_neon": {
      "id": "aura_tralala_neon",
      "name": "Эликсир: Неон Tralala",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/hud/debuffs/elixir_tralala.webp",
      "price": 1,
      "weight": 50,
      "description": "Эссенция неоновых трубок шагающего тостера Toasterino. На 20 минут: неоновая аура, +12% к скорости атаки, +15% к силе крита, +8% к скорости бега. Не спадает при смерти.",
      "stackable": true,
      "maxStack": 5
    },
    "aura_bombardiro_fire": {
      "id": "aura_bombardiro_fire",
      "name": "Эликсир: Реактивный смузи",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/hud/debuffs/elixir_bombardiro.webp",
      "price": 1,
      "weight": 50,
      "description": "Ракетное биотопливо турбин Blendodilo. На 20 минут: пламенная аура, +15% к физ. атаке, 8% откачки масла (вампиризм), +25% защиты от оглушения. Не спадает при смерти.",
      "stackable": true,
      "maxStack": 5
    },
    "aura_vacuum_void": {
      "id": "aura_vacuum_void",
      "name": "Эликсир: Вакуумная бездна",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/hud/debuffs/elixir_vacuum.webp",
      "price": 1,
      "weight": 50,
      "description": "Вакуумный конденсат турбин Vacuum Sahur. На 20 минут: астральная аура, +20% к физ. броне, +35 к макс. энергии пара, +25% к регенерации пара. Не спадает при смерти.",
      "stackable": true,
      "maxStack": 5,
      "levelReq": 20
    },
    "aura_cappuccino_gold": {
      "id": "aura_cappuccino_gold",
      "name": "Эликсир: Золотая пенка",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/hud/debuffs/elixir_cappuccino.webp",
      "price": 1,
      "weight": 50,
      "description": "Золотистая паровая смазка балерины Cappuccino. На 20 минут: золотая аура, +20% к добыче медных деталей, +15% к шансу дропа деталей, +10% к скорости бега. Не спадает при смерти.",
      "stackable": true,
      "maxStack": 5,
      "levelReq": 20
    },
    "aura_skibidi_steam": {
      "id": "aura_skibidi_steam",
      "name": "Эликсир: Скибиди-пар",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/hud/debuffs/elixir_skibidi.webp",
      "price": 1,
      "weight": 50,
      "description": "Сверхкритический пар из котла Skibidi. На 20 минут: изумрудная паровая аура, +10 HP/сек авторемонт, +5 энергии/сек, +10% к физ. броне. Не спадает при смерти.",
      "stackable": true,
      "maxStack": 5
    },
    "scroll_br_tralala_wave": {
      "id": "scroll_br_tralala_wave",
      "name": "Свиток: Tralala Wave",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/skills/special/br_tralala_wave.webp",
      "price": 1,
      "weight": 50,
      "description": "ПКМ: изучить мем-умение «Tralala Wave» (радужная волна + VFX).",
      "stackable": true,
      "maxStack": 5
    },
    "scroll_br_bombardiro_dive": {
      "id": "scroll_br_bombardiro_dive",
      "name": "Свиток: Bombardiro Dive",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/skills/special/br_bombardiro_dive.webp",
      "price": 1,
      "weight": 50,
      "description": "ПКМ: изучить «Bombardiro Dive» — пикирование-смузи с анимацией.",
      "stackable": true,
      "maxStack": 5
    },
    "scroll_br_tung_suction": {
      "id": "scroll_br_tung_suction",
      "name": "Свиток: Tung Suction",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/skills/special/br_tung_suction.webp",
      "price": 1,
      "weight": 50,
      "description": "ПКМ: изучить «Tung Suction» — вакуумный притяг + VFX.",
      "stackable": true,
      "maxStack": 5,
      "levelReq": 20
    },
    "scroll_br_cappuccino_spin": {
      "id": "scroll_br_cappuccino_spin",
      "name": "Свиток: Cappuccino Spin",
      "type": "consumable",
      "slot": null,
      "grade": "d",
      "icon": "assets/skills/special/br_cappuccino_spin.webp",
      "price": 1,
      "weight": 50,
      "description": "ПКМ: изучить «Cappuccino Spin» — пируэт с пенкой и уроном.",
      "stackable": true,
      "maxStack": 5,
      "levelReq": 20
    },
    "scroll_br_skibidi_slam": {
      "id": "scroll_br_skibidi_slam",
      "name": "Свиток: Skibidi Slam",
      "type": "consumable",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/skills/special/br_skibidi_slam.webp",
      "price": 1,
      "weight": 50,
      "description": "ПКМ: изучить «Skibidi Slam» — dop dop yes yes по площади.",
      "stackable": true,
      "maxStack": 5
    },
    "blue_capacitor": {
      "id": "blue_capacitor",
      "name": "Синий конденсатор",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/blue_capacitor.webp",
      "price": 25,
      "weight": 0,
      "description": "Квестовый / на продажу. Аналог Blue Gem — частый дроп с самых слабых.",
      "stackable": true,
      "maxStack": 9999
    },
    "coal_briquette": {
      "id": "coal_briquette",
      "name": "Угольный брикет",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/coal_briquette.webp",
      "price": 6,
      "weight": 20,
      "description": "Топливо горна. Аналог Charcoal / Coal. Нужен для mid-крафта.",
      "stackable": true,
      "maxStack": 9999
    },
    "gasket_suede": {
      "id": "gasket_suede",
      "name": "Замшевая прокладка",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/gasket_suede.webp",
      "price": 12,
      "weight": 20,
      "description": "Уплотнение брони и шлангов. Аналог Suede.",
      "stackable": true,
      "maxStack": 9999
    },
    "rubber_skin": {
      "id": "rubber_skin",
      "name": "Резиновая обшивка",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/rubber_skin.webp",
      "price": 10,
      "weight": 20,
      "description": "Сырьё перчаток/сапог. Аналог Animal Skin.",
      "stackable": true,
      "maxStack": 9999
    },
    "varnish_seal": {
      "id": "varnish_seal",
      "name": "Лаковая изоляция",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/varnish_seal.webp",
      "price": 18,
      "weight": 20,
      "description": "Покрытие контактов. Аналог Varnish. Mid-крафт.",
      "stackable": true,
      "maxStack": 9999
    },
    "drive_bone": {
      "id": "drive_bone",
      "name": "Кость привода",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/drive_bone.webp",
      "price": 14,
      "weight": 20,
      "description": "Биометалл-шарнир. Аналог Animal Bone / Piece of Bone.",
      "stackable": true,
      "maxStack": 9999
    },
    "boiler_heart": {
      "id": "boiler_heart",
      "name": "Сердце котла",
      "type": "quest",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/boiler_heart.webp",
      "price": 120,
      "weight": 0,
      "description": "Квест/продажа. Аналог Stone Heart — фарм-доход mid-зоны.",
      "stackable": true,
      "maxStack": 9999
    },
    "silver_flux": {
      "id": "silver_flux",
      "name": "Серебряный флюс",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/silver_flux.webp",
      "price": 80,
      "weight": 20,
      "description": "Припой D-grade. Аналог Silver Nuance.",
      "stackable": true,
      "maxStack": 9999,
      "levelReq": 20
    },
    "rivet_pack": {
      "id": "rivet_pack",
      "name": "Пачка заклёпок",
      "type": "material",
      "slot": null,
      "grade": "no_grade",
      "icon": "assets/inventar/icons/rivet_pack.webp",
      "price": 2,
      "weight": 20,
      "description": "Стек сырья. Аналог Bone Arrow — часто и пачкой.",
      "stackable": true,
      "maxStack": 9999
    },
    "colossus_fragment": {
      "id": "colossus_fragment",
      "name": "Фрагмент Колосса",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/colossus_fragment.webp",
      "price": 5000,
      "weight": 20,
      "description": "Осколок недостроенного стального гиганта.",
      "stackable": true,
      "maxStack": 100
    },
    "green_protocol_core": {
      "id": "green_protocol_core",
      "name": "Ядро Протокола «Зелёный»",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/green_protocol_core.webp",
      "price": 65000,
      "weight": 20,
      "description": "Испорченный защитный модуль. Пахнет озоном и плохими решениями.",
      "stackable": true,
      "maxStack": 10
    },
    "toxic_plating": {
      "id": "toxic_plating",
      "name": "Токсичная обшивка",
      "type": "armor",
      "slot": "chest",
      "grade": "c",
      "icon": "assets/inventar/icons/toxic_plating.webp",
      "price": 95000,
      "weight": 1411,
      "description": "Броня, пропитанная зелёным сбоем. Носить с перчатками.",
      "defense": 42,
      "armorType": "heavy",
      "hpBonus": 80
    },
    "colossus_gauntlets": {
      "id": "colossus_gauntlets",
      "name": "Перчатки Колосса",
      "type": "armor",
      "slot": "gloves",
      "grade": "c",
      "icon": "assets/inventar/icons/colossus_gauntlets.webp",
      "price": 70000,
      "weight": 306,
      "description": "Хват, которым колосс топтал ворота.",
      "defense": 18,
      "armorType": "heavy"
    },
    "cruma_core_shard": {
      "id": "cruma_core_shard",
      "name": "Осколок Ядра Круны",
      "type": "material",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/cruma_core_shard.webp",
      "price": 150000,
      "weight": 20,
      "description": "Сердечный осколок Башни. Всё ещё щёлкает герцами.",
      "stackable": true,
      "maxStack": 20
    },
    "tower_circuit_ring": {
      "id": "tower_circuit_ring",
      "name": "Кольцо Башенной Схемы",
      "type": "accessory",
      "slot": "ring",
      "grade": "c",
      "icon": "assets/inventar/icons/tower_circuit_ring.webp",
      "price": 88000,
      "weight": 255,
      "description": "Проводник этажей. Не для слабых контуров.",
      "critBonus": 3,
      "energyBonus": 15
    },
    "overmind_chip": {
      "id": "overmind_chip",
      "name": "Чип Коллективного Разума",
      "type": "material",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/overmind_chip.webp",
      "price": 200000,
      "weight": 20,
      "description": "Один чип — ещё не «мы». Два — уже опасно.",
      "stackable": true,
      "maxStack": 5
    },
    "directive_seal": {
      "id": "directive_seal",
      "name": "Печать Директивы",
      "type": "accessory",
      "slot": "necklace",
      "grade": "c",
      "icon": "assets/inventar/icons/directive_seal.webp",
      "price": 140000,
      "weight": 255,
      "description": "Печать «мы решаем». Ваше «я» — опционально.",
      "hpBonus": 70,
      "energyBonus": 25
    },
    "branded_boiler_core": {
      "id": "branded_boiler_core",
      "name": "Ядро Брендованного Котла",
      "type": "material",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/branded_boiler_core.webp",
      "price": 130000,
      "weight": 20,
      "description": "Клеймо Круны на раскалённом сердце котла.",
      "stackable": true,
      "maxStack": 10
    },
    "steel_plate": {
      "id": "steel_plate",
      "name": "Стальная пластина",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/steel_plate.webp",
      "price": 400,
      "weight": 20,
      "description": "Катаная сталь для D/C-крафта.",
      "stackable": true,
      "maxStack": 999,
      "levelReq": 20
    },
    "recipe_colossus_plating": {
      "id": "recipe_colossus_plating",
      "name": "Чертеж: Обшивка Колосса",
      "type": "recipe",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 60000,
      "weight": 120,
      "description": "Схема плит Крепости предела.",
      "stackable": true,
      "maxStack": 10,
      "craftMaterials": [
        {
          "id": "colossus_fragment",
          "count": 8
        },
        {
          "id": "steel_plate",
          "count": 4
        },
        {
          "id": "crystal_c",
          "count": 4
        }
      ],
      "craftResult": "colossus_plating"
    },
    "recipe_toxic_plating": {
      "id": "recipe_toxic_plating",
      "name": "Чертеж: Токсичная обшивка",
      "type": "recipe",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 55000,
      "weight": 120,
      "description": "Схема брони из зелёного сбоя.",
      "stackable": true,
      "maxStack": 10,
      "craftMaterials": [
        {
          "id": "green_protocol_core",
          "count": 1
        },
        {
          "id": "boiler_plate",
          "count": 6
        },
        {
          "id": "hydraulic_fluid",
          "count": 8
        },
        {
          "id": "crystal_c",
          "count": 3
        }
      ],
      "craftResult": "toxic_plating"
    },
    "blueprint_piston": {
      "id": "blueprint_piston",
      "name": "Чертеж: Поршень",
      "type": "material",
      "slot": null,
      "grade": "d",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 2000,
      "weight": 0,
      "description": "Схема изготовления поршня высокого давления.",
      "stackable": true,
      "maxStack": 100,
      "levelReq": 20
    },
    "blueprint_steel_plate": {
      "id": "blueprint_steel_plate",
      "name": "Чертеж: Стальная пластина",
      "type": "material",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 8000,
      "weight": 0,
      "description": "Схема катки стальной брони.",
      "stackable": true,
      "maxStack": 100
    },
    "wooden_breastplate": {
          "id": "wooden_breastplate",
          "name": "Клёпаный Нагрудник Каркаса",
          "l2Name": "Wooden Breastplate",
          "type": "armor",
          "slot": "chest",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/wooden_breastplate.webp",
          "price": 1200,
          "weight": 2200,
          "description": "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Стартовый защитный панцирь оператора из армированного текстолита и стальных пластин на медных заклепках.",
          "defense": 33,
          "armorType": "heavy",
          "setId": "wooden",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0
},
    "wooden_gaiters": {
          "id": "wooden_gaiters",
          "name": "Клёпаные Поножи Каркаса",
          "l2Name": "Wooden Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/wooden_gaiters.webp",
          "price": 750,
          "weight": 1400,
          "description": "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Поножи из прочного прессованного текстолита с шарнирами на коленях.",
          "defense": 21,
          "armorType": "heavy",
          "setId": "wooden",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0
},
    "wooden_helmet": {
          "id": "wooden_helmet",
          "name": "Клёпаный Подшлемник",
          "l2Name": "Wooden Helmet",
          "type": "armor",
          "slot": "head",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/wooden_helmet.webp",
          "price": 500,
          "weight": 600,
          "description": "Легкий защитный шлем оператора из многослойного термостойкого каркаса.",
          "defense": 12,
          "armorType": "heavy",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 1,
          "crystalCount": 0
},
    "leather_armor": {
          "id": "leather_armor",
          "name": "Кожаная Кираса Механика",
          "l2Name": "Leather Armor",
          "type": "armor",
          "slot": "chest",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/leather_armor.webp",
          "price": 3800,
          "weight": 2800,
          "description": "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Усиленная куртка из плотной дубленой кожи с наплечниками.",
          "defense": 38,
          "armorType": "light",
          "setId": "leather",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 5,
          "crystalCount": 0
},
    "leather_pants": {
          "id": "leather_pants",
          "name": "Кожаные Штаны Механика",
          "l2Name": "Leather Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/leather_pants.webp",
          "price": 2400,
          "weight": 1800,
          "description": "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Удобные рабочие штаны с защитными накладками для высокой маневренности.",
          "defense": 24,
          "armorType": "light",
          "setId": "leather",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 5,
          "crystalCount": 0
},
    "copper_chainmail_gaiters": {
          "id": "copper_chainmail_gaiters",
          "name": "Медные Кольчужные Поножи",
          "l2Name": "Bronze Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/copper_chainmail_gaiters.webp",
          "price": 5500,
          "weight": 2600,
          "description": "Сет «Медная Кольчуга» (2): Физ. Защита +5.26%, HP +50. Кольчужные набедренники из сплетенных медных звеньев.",
          "defense": 29,
          "armorType": "heavy",
          "setId": "bronze_ng",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 10,
          "crystalCount": 0
},
    "iron_helmet": {
          "id": "iron_helmet",
          "name": "Железный Шлем Оператора",
          "l2Name": "Iron Helmet",
          "type": "armor",
          "slot": "head",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/iron_helmet.webp",
          "price": 7000,
          "weight": 800,
          "description": "Литой железный шлем с лицевым забралом и вентиляционными щелями.",
          "defense": 20,
          "armorType": "heavy",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 10,
          "crystalCount": 0
},
    "bone_breastplate": {
          "id": "bone_breastplate",
          "name": "Карбоновый Нагрудник Свалки",
          "l2Name": "Bone Breastplate",
          "type": "armor",
          "slot": "chest",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/bone_breastplate.webp",
          "price": 15000,
          "weight": 3400,
          "description": "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Легкий композитный нагрудник из термически обработанного углеволокна и броневых сегментов автоматонов.",
          "defense": 52,
          "armorType": "light",
          "setId": "bone",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "bone_gaiters": {
          "id": "bone_gaiters",
          "name": "Карбоновые Набедренники Свалки",
          "l2Name": "Bone Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/bone_gaiters.webp",
          "price": 9500,
          "weight": 2200,
          "description": "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Композитные набедренники с шарнирными щитками для защиты суставов.",
          "defense": 32,
          "armorType": "light",
          "setId": "bone",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "ring_mail_breastplate": {
          "id": "ring_mail_breastplate",
          "name": "Звеньевой Панцирь Цеховика",
          "l2Name": "Ring Mail Breastplate",
          "type": "armor",
          "slot": "chest",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/ring_mail_breastplate.webp",
          "price": 18000,
          "weight": 5200,
          "description": "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Тяжелый панцирь двойного кольчатого плетения с накладными титановыми пластинами.",
          "defense": 58,
          "armorType": "heavy",
          "setId": "ring_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "ring_mail_gaiters": {
          "id": "ring_mail_gaiters",
          "name": "Звеньевые Поножи Цеховика",
          "l2Name": "Ring Mail Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/ring_mail_gaiters.webp",
          "price": 11500,
          "weight": 3200,
          "description": "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Массивные кольчатые поножи для защиты ног оператора при тяжелых столкновениях.",
          "defense": 36,
          "armorType": "heavy",
          "setId": "ring_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "ring_mail_boots": {
          "id": "ring_mail_boots",
          "name": "Звеньевые Сапоги",
          "l2Name": "Ring Mail Boots",
          "type": "armor",
          "slot": "boots",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/ring_mail_boots.webp",
          "price": 8000,
          "weight": 1400,
          "description": "Сет «Звеньевой Доспех» (3): часть полного комплекта звеньевой брони. Кованые сапоги со стальными носками и звеньевой защитой подъема.",
          "defense": 16,
          "armorType": "heavy",
          "setId": "ring_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "ring_mail_gloves": {
          "id": "ring_mail_gloves",
          "name": "Звеньевые Перчатки",
          "l2Name": "Ring Mail Gloves",
          "type": "armor",
          "slot": "gloves",
          "grade": "no_grade",
          "icon": "assets/inventar/icons/ring_mail_gloves.webp",
          "price": 5000,
          "weight": 140,
          "description": "Плотные перчатки с кольчатой накладкой на пальцах и тыльной стороне ладони.",
          "defense": 12,
          "armorType": "heavy",
          "setId": "ring_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 15,
          "crystalCount": 0
},
    "reinforced_leather_shirt": {
          "id": "reinforced_leather_shirt",
          "name": "Усиленная Кожаная Куртка",
          "l2Name": "Reinforced Leather Shirt",
          "type": "armor",
          "slot": "chest",
          "grade": "d",
          "icon": "assets/inventar/icons/reinforced_leather_shirt.webp",
          "price": 40000,
          "weight": 3200,
          "description": "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Первоклассная куртка из дубленой кожи с титановым кордом и демпферами отдачи для стрелков.",
          "defense": 71,
          "armorType": "light",
          "setId": "reinforced_leather",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 80
},
    "reinforced_leather_gaiters": {
          "id": "reinforced_leather_gaiters",
          "name": "Усиленные Кожаные Штаны",
          "l2Name": "Reinforced Leather Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "d",
          "icon": "assets/inventar/icons/reinforced_leather_gaiters.webp",
          "price": 25000,
          "weight": 2000,
          "description": "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Прочные эластичные штаны с титановыми наколенниками.",
          "defense": 44,
          "armorType": "light",
          "setId": "reinforced_leather",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 50
},
    "reinforced_leather_boots": {
          "id": "reinforced_leather_boots",
          "name": "Усиленные Сапоги",
          "l2Name": "Reinforced Leather Boots",
          "type": "armor",
          "slot": "boots",
          "grade": "d",
          "icon": "assets/inventar/icons/reinforced_leather_boots.webp",
          "price": 16000,
          "weight": 1200,
          "description": "Сет «Усиленная Кожа» (3): часть комплекта усиленной кожи. Легкие сапоги охотника на автоматонов с амортизирующей подошвой.",
          "defense": 25,
          "armorType": "light",
          "setId": "reinforced_leather",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 32
},
    "scale_mail_breastplate": {
          "id": "scale_mail_breastplate",
          "name": "Чешуйчатая Кираса Регулятора",
          "l2Name": "Scale Mail",
          "type": "armor",
          "slot": "chest",
          "grade": "d",
          "icon": "assets/inventar/icons/scale_mail_breastplate.webp",
          "price": 42000,
          "weight": 5800,
          "description": "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Тяжелая штампованная кираса D-ранга из наборных пластин легированной стали с нахлестом.",
          "defense": 81,
          "armorType": "heavy",
          "setId": "scale_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 84
},
    "scale_mail_gaiters": {
          "id": "scale_mail_gaiters",
          "name": "Чешуйчатые Поножи Регулятора",
          "l2Name": "Scale Mail Gaiters",
          "type": "armor",
          "slot": "legs",
          "grade": "d",
          "icon": "assets/inventar/icons/scale_mail_gaiters.webp",
          "price": 26000,
          "weight": 3600,
          "description": "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Наборные поножи из закаленной чешуйчатой брони.",
          "defense": 50,
          "armorType": "heavy",
          "setId": "scale_mail",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 52
},
    "scale_mail_shield": {
          "id": "scale_mail_shield",
          "name": "Чешуйчатый Щит Регулятора",
          "l2Name": "Scale Mail Shield",
          "type": "armor",
          "slot": "shield",
          "grade": "d",
          "icon": "assets/inventar/icons/scale_mail_shield.webp",
          "price": 18000,
          "weight": 1200,
          "description": "Массивный чешуйчатый щит D-ранга для блокирования атак тяжелых автоматонов.",
          "defense": 75,
          "armorType": "heavy",
          "blockRate": 20,
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 36
},
    "rezdiq_shield": {
          "id": "rezdiq_shield",
          "name": "Щит Рездика",
          "l2Name": "Rezdiq Shield",
          "type": "armor",
          "slot": "shield",
          "grade": "d",
          "icon": "assets/inventar/icons/rezdiq_shield.webp",
          "price": 28000,
          "weight": 1300,
          "description": "Тяжелый фортификационный щит D-ранга гарнизона Полковника Рездика.",
          "defense": 82,
          "armorType": "heavy",
          "blockRate": 20,
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 44
},
    "operator_gauntlets_low": {
          "id": "operator_gauntlets_low",
          "name": "Тяжелые Рукавицы Оператора",
          "l2Name": "Gauntlets",
          "type": "armor",
          "slot": "gloves",
          "grade": "d",
          "icon": "assets/inventar/icons/operator_gauntlets_low.webp",
          "price": 18000,
          "weight": 180,
          "description": "Латные боевые рукавицы Low D ранга с шарнирными пластинами на фалангах пальцев.",
          "defense": 22,
          "armorType": "heavy",
          "isOperatorArmor": true,
          "isLivePhase1": true,
          "levelReq": 20,
          "crystalCount": 36
},
    "blueprint_hydraulic_armor": {
      "id": "blueprint_hydraulic_armor",
      "name": "Чертеж: Гидравлический доспех",
      "type": "material",
      "slot": null,
      "grade": "c",
      "icon": "assets/inventar/icons/scroll.webp",
      "price": 50000,
      "weight": 0,
      "description": "Секретная схема экзоскелета Регуляторов.",
      "stackable": true,
      "maxStack": 10
    }
  };

  // Backwards compatibility aliases for tests and legacy saves
  ITEMS['steam_pistol'] = ITEMS['spring_bow'];
  ITEMS['pneumatic_rifle'] = ITEMS['composite_bow'];

  if (GR && GR.stampMap) GR.stampMap(ITEMS);
  if (WR && WR.stampMap) WR.stampMap(ITEMS);
  if (ER && ER.stampMap) ER.stampMap(ITEMS);

  function get(id) {
    if (!id) return null;
    var key = String(id).toLowerCase();
    var it = ITEMS[key] || null;
    if (it && GR && it.levelReq == null) GR.stampLevelReq(it);
    if (it && WR && it.weight == null) WR.stampWeight(it);
    return it;
  }

  /** Resolve equip piece → template (inline stats win over catalog). */
  function resolveTemplate(piece) {
    if (!piece) return null;
    if (typeof piece === 'string') piece = { id: piece };
    if (piece.template && typeof piece.template === 'object') {
      var merged = Object.assign({}, get(piece.template.id || piece.templateId || piece.id) || {}, piece.template);
      return merged;
    }
    var tid = piece.templateId || piece.id;
    var base = get(tid);
    if (!base) {
      // raw piece may already carry combat fields
      if (piece.attack != null || piece.defense != null || piece.cAtk != null || piece.armorType) {
        return piece;
      }
      return null;
    }
    // allow instance overrides (enchant flat etc.)
    return Object.assign({}, base, {
      attack: piece.attack != null ? piece.attack : base.attack,
      cAtk: piece.cAtk != null ? piece.cAtk : base.cAtk,
      defense: piece.defense != null ? piece.defense : base.defense,
      cDef: piece.cDef != null ? piece.cDef : base.cDef,
      mDef: piece.mDef != null ? piece.mDef : base.mDef,
      attackBonus: piece.attackBonus != null ? piece.attackBonus : base.attackBonus,
      hpBonus: piece.hpBonus != null ? piece.hpBonus : base.hpBonus,
      energyBonus: piece.energyBonus != null ? piece.energyBonus : base.energyBonus
    });
  }

  /**
   * Build gear opts for CLASS_SYSTEM.statsAtLevel / L2 formulas.
   * equip: { weapon: {id|templateId}, chest: ..., ... }
   */
  /**
   * FuncPDefMod / FuncMDefMod — «голые» слоты, вычитаемые при экипе.
   * Mage (robe path): chest 15, legs 8. Fighter: chest 31, legs 18.
   * Head/gloves/feet одинаковы. Jewelry → M.Def.
   */
  var NAKED_PDEF = {
    mage:    { head: 0, chest: 0, legs: 0, gloves: 0, feet: 0 },
    fighter: { head: 0, chest: 0, legs: 0, gloves: 0, feet: 0 }
  };
  var NAKED_MDEF = {
    necklace: 13, ear: 9, earring: 9, ring: 5,
    lfinger: 5, rfinger: 5, lear: 9, rear: 9, neck: 13,
    bracelet: 0 // non-retail slot — no naked sub
  };

  function normalizeArmorSlot(slot, tpl) {
    slot = String(slot || '').toLowerCase();
    var tslot = tpl && tpl.slot ? String(tpl.slot).toLowerCase() : '';
    var s = tslot || slot;
    if (s === 'helmet' || s === 'hat') return 'head';
    if (s === 'body' || s === 'armor' || s === 'fullbody') return 'chest';
    if (s === 'leg' || s === 'pants') return 'legs';
    if (s === 'glove' || s === 'hands') return 'gloves';
    if (s === 'boot' || s === 'boots' || s === 'shoes') return 'feet';
    if (s === 'neck' || s === 'necklace') return 'necklace';
    if (s === 'ear' || s === 'earring' || s === 'earrings') return 'ear';
    if (s === 'finger' || s === 'ring') return 'ring';
    return s;
  }

  // ============================================================
  //  ЗАТОЧКА (plus / enchantLevel)
  //  Раньше plus писался в профиль и персистился, но НЕ учитывался в статах
  //  (проверено: weaponAtk при plus0 и plus9 совпадал), и верхней границы не
  //  было — значение росло бесконечно.
  //  C1: прибавка за уровень заточки зависит от грейда предмета.
  //  ENCHANT_MAX = 6 по границе фазы 1 (ITEM_GRADE_CONFIG.D.enchantMax в
  //  shared/loot-rules.js).
  // ============================================================
  var ENCHANT_MAX = 6;
  var ENCHANT_STEP = {
    no_grade: { atk: 2, def: 1 },
    d: { atk: 3, def: 1 },
    c: { atk: 4, def: 2 },
    b: { atk: 5, def: 2 },
    a: { atk: 6, def: 3 },
    s: { atk: 7, def: 3 }
  };

  /** Прибавка к атаке/защите за заточку +plus у предмета данного грейда. */
  function enchantBonus(grade, plus, isWeapon) {
    var p = Math.max(0, Math.min(ENCHANT_MAX, Math.floor(+plus || 0)));
    if (!p) return 0;
    var step = ENCHANT_STEP[String(grade || 'no_grade').toLowerCase()] || ENCHANT_STEP.no_grade;
    return (isWeapon ? step.atk : step.def) * p;
  }

  /**
   * isMagePath: true → robe/mystic naked body (engineer line).
   * Returns gear with armorDef = ΣitemPDef − nakedSub (can be used as add to basePDef).
   */
  function gearFromEquip(equip, opts) {
    opts = opts || {};
    var isMagePath = opts.isMagePath === true || opts.mage === true;
    var gear = {
      weaponAtk: 0,
      armorDef: 0,
      toolAtk: 0,
      armorCDef: 0,
      nakedPDefSub: 0,
      nakedMDefSub: 0,
      speedBonus: 0,
      critBonus: 0,
      accuracyBonus: 0,
      evasionBonus: 0,
      hpBonus: 0,
      energyBonus: 0,
      weaponClass: 'fist',
      weaponAtkBase: null,
      hasShield: false,
      shieldDef: 0,
      blockBonus: 0,
      primary: null,
      isMagePath: isMagePath
    };
    if (!equip || typeof equip !== 'object') return gear;

    var prim = { STR: 0, DEX: 0, CON: 0, INT: 0, WIT: 0, MEN: 0 };
    var hasPrim = false;
    var nakedP = isMagePath ? NAKED_PDEF.mage : NAKED_PDEF.fighter;
    var slotsSeen = {};

    // 2H weapon disables shield bonuses (even if shield still present in save)
    var weaponTpl = resolveTemplate(equip.weapon || equip.WEAPON);
    var twoHandedWeapon = !!(weaponTpl && (
      weaponTpl.twoHanded ||
      weaponTpl.weaponClass === '2h_staff' ||
      weaponTpl.weaponClass === '2h_blunt' ||
      weaponTpl.weaponClass === '2h_sword' ||
      weaponTpl.weaponClass === 'pole'
    ));

    Object.keys(equip).forEach(function (slot) {
      var piece = equip[slot];
      if (!piece) return;
      var tpl = resolveTemplate(piece);
      if (!tpl) return;

      // Заточка. Раньше plus хранился и персистился, но НЕ учитывался нигде:
      // проверено, weaponAtk при plus0 и plus9 был одинаковым.
      // C1: оружие +N даёт линейную прибавку к атаке, броня — к защите.
      var plus = Math.max(0, Math.min(ENCHANT_MAX, Math.floor(+piece.plus || 0)));
      var atk = (+tpl.attack || 0) + (+tpl.attackBonus || 0) + (+piece.attackBonus || 0);
      var def = +tpl.defense || 0;
      var isWeapon = slot === 'weapon' || slot === 'ranged' || tpl.type === 'weapon';
      var isShield = slot === 'shield' || tpl.isShield || tpl.slot === 'shield';
      var aslot = normalizeArmorSlot(slot, tpl);
      var enchAtk = 0, enchDef = 0, enchCDef = 0;
      if (plus > 0) {
        enchAtk = enchantBonus(tpl.grade, plus, true);
        enchDef = enchantBonus(tpl.grade, plus, false);
        enchCDef = enchDef;
        if (isWeapon) { enchDef = 0; enchCDef = 0; } else { enchAtk = 0; }
      }
      atk += enchAtk;
      def += enchDef;

      if (isWeapon) {
        gear.weaponAtk += atk;
        if (slot === 'weapon' || gear.weaponClass === 'fist') {
          gear.weaponClass = tpl.weaponClass || (tpl.ranged ? 'bow' : '1h_blunt');
          if (tpl.baseAtkSpd != null) gear.weaponAtkBase = tpl.baseAtkSpd;
        }
        if (tpl.isCircuit || tpl.isMagical || piece.isCircuit || piece.damageType === 'circuit') {
          // Схемное оружие: заточка растит и cAtk (иначе +N бесполезен инженеру)
          gear.toolAtk += (tpl.cAtk != null ? (+tpl.cAtk + enchAtk) : atk);
        }
      } else if (tpl.type === 'tool' || slot === 'tool') {
        gear.toolAtk += atk;
      } else if (isShield) {
        if (twoHandedWeapon) return; // 2H: no shield block/def
        gear.hasShield = true;
        gear.shieldDef += def;
        // L2 Canon: shield P.Def applies ONLY on successful shield block in combat (rollBlock)
        // shields: P.Def only unless cDef/mDef set explicitly
        gear.armorCDef += (+tpl.cDef || +tpl.mDef || 0) + enchCDef;
        gear.blockBonus += +tpl.blockRate || 0;
      } else {
        var isJewelry = (aslot === 'necklace' || aslot === 'ear' || aslot === 'ring' || tpl.type === 'accessory');
        if (isJewelry && !isResonatorTpl(tpl) && !isNanoBraceletTpl(tpl)) {
          // Jewelry in L2 gives M.Def (routed to armorCDef), NOT P.Def (armorDef)
          var jewelCDef = tpl.cDef != null ? +tpl.cDef : (+tpl.mDef || def || 0);
          gear.armorCDef += jewelCDef + enchCDef;
        } else {
          gear.armorDef += def;
          var cDefAdd = +tpl.cDef || +tpl.mDef || 0;
          gear.armorCDef += cDefAdd + enchCDef;
        }

        // Subtract naked body/jewelry when slot equipped (once per logical slot)
        if (nakedP[aslot] != null && !slotsSeen['p_' + aslot]) {
          gear.nakedPDefSub += nakedP[aslot];
          slotsSeen['p_' + aslot] = true;
        }
        var mSub = NAKED_MDEF[aslot];
        if (mSub != null && mSub > 0) {
          // pair jewelry: two rings / two ears allowed with separate counters
          var mKey = aslot === 'ring' || aslot === 'ear'
            ? (aslot + '_' + (slotsSeen[aslot] || 0))
            : aslot;
          if (!slotsSeen['m_' + mKey]) {
            gear.nakedMDefSub += mSub;
            slotsSeen['m_' + mKey] = true;
            slotsSeen[aslot] = (slotsSeen[aslot] || 0) + 1;
          }
        }

        // accessory attackBonus → physical
        if (atk > 0 && tpl.type === 'accessory') gear.weaponAtk += atk;
      }

      // Корпус прибора (shell / casing): cDef + HP + пар по ступени лестницы.
      // Уровень контура (circuit / nano) статов НЕ даёт — это только гейт скиллов.
      // Индекс корпуса берётся из piece (авторитет сервера), tpl — как дефолт.
      if (isResonatorTpl(tpl)) {
        var sh = resonatorShell(piece.shellIndex != null ? piece.shellIndex : tpl.shellIndex);
        gear.armorCDef += +sh.cDef || 0;
        gear.hpBonus += +sh.hpBonus || 0;
        gear.energyBonus += +sh.energyBonus || 0;
      } else if (isNanoBraceletTpl(tpl)) {
        var cs = nanoCasing(piece.casingIndex != null ? piece.casingIndex : tpl.casingIndex);
        gear.armorCDef += +cs.cDef || 0;
        gear.hpBonus += +cs.hpBonus || 0;
        gear.energyBonus += +cs.energyBonus || 0;
      }

      gear.hpBonus += +tpl.hpBonus || 0;
      gear.energyBonus += +tpl.energyBonus || 0;
      gear.speedBonus += +tpl.speedBonus || 0;
      gear.critBonus += +tpl.critBonus || 0;
      gear.accuracyBonus += +tpl.accuracyBonus || 0;
      gear.evasionBonus += +tpl.evasionBonus || 0;

      if (tpl.statBonuses) {
        Object.keys(prim).forEach(function (k) {
          if (tpl.statBonuses[k]) {
            prim[k] += tpl.statBonuses[k];
            hasPrim = true;
          }
        });
      }
    });

    if (hasPrim) gear.primary = prim;

    // Named armor set bonuses (C1) — merge primary/flats into gear; % live in gear.setBonuses
    var sets = evaluateSets(equip);
    gear.setBonuses = sets;
    gear.activeSets = sets.active || [];
    if (sets.primary) {
      Object.keys(sets.primary).forEach(function (k) {
        if (!sets.primary[k]) return;
        prim[k] = (prim[k] || 0) + sets.primary[k];
        hasPrim = true;
      });
      gear.primary = prim;
    }
    // flat HP/MP from sets (Demon −270 HP, Blue Wolf +206 MP)
    gear.hpBonus += +sets.hpFlat || 0;
    gear.energyBonus += +sets.energyFlat || 0;
    // Doom Speed +7 (L2 run units) → game speed ≈ /16
    if (sets.speedL2) gear.speedBonus += sets.speedL2 / 16;

    return gear;
  }

  /**
   * C1 robe sets — bonuses apply only when enough pieces with matching setId are equipped.
   * castSpeedSet requires Spellcraft base (robe chest+legs) — caller gates that.
   */
  var ARMOR_SETS = {
    magic: {
      id: 'magic', name: 'Контур', required: 2,
      bonus: {} // no set bonus in C1
    },
    devotion: {
      id: 'devotion', name: 'Усердие', required: 2,
      bonus: { castSpeedSet: 0.15 }
    },
    knowledge: {
      id: 'knowledge', name: 'Знание', required: 3,
      bonus: { cAtkPercent: 0.10, energyRegen: -0.05 }
    },
    wooden: {
      id: 'wooden', name: 'Клёпаный Каркас', required: 2,
      bonus: {"pDefPercent":0.0526,"hpFlat":41}
    },
    leather: {
      id: 'leather', name: 'Кожаная Броня', required: 2,
      bonus: {"pDefPercent":0.0526}
    },
    bronze_ng: {
      id: 'bronze_ng', name: 'Медная Кольчуга', required: 2,
      bonus: {"pDefPercent":0.0526,"hpFlat":50}
    },
    bone: {
      id: 'bone', name: 'Карбоновый Каркас', required: 2,
      bonus: {"pDefPercent":0.0526,"hpFlat":40}
    },
    ring_mail: {
      id: 'ring_mail', name: 'Звеньевой Доспех', required: 3,
      bonus: {"pDefPercent":0.0526,"hpFlat":30}
    },
    reinforced_leather: {
      id: 'reinforced_leather', name: 'Усиленная Кожа', required: 3,
      bonus: {"pDefPercent":0.0526,"energyFlat":80}
    },
    scale_mail: {
      id: 'scale_mail', name: 'Чешуйчатый Доспех', required: 2,
      bonus: {"pDefPercent":0.0526,"hpFlat":80}
    },
    mithril: {
      id: 'mithril', name: 'Мифрил', required: 2,
      bonus: { energyFlat: 80, speedL2: 2 }
    },
    karmian: {
      id: 'karmian', name: 'Гармония', required: 3,
      bonus: { castSpeedSet: 0.15, pDefPercent: 0.0526 }
    },
    demon: {
      id: 'demon', name: 'Порча', required: 3,
      bonus: { primary: { INT: 4, WIT: -1 }, hpFlat: -270 }
    },
    divine: {
      id: 'divine', name: 'Божественный', required: 3,
      bonus: { energyPercent: 0.0524 }
    },
    avadon: {
      id: 'avadon', name: 'Оплот', required: 4,
      bonus: { castSpeedSet: 0.15, pDefPercent: 0.0525 }
    },
    zubei: {
      id: 'zubei', name: 'Закалка', required: 3,
      bonus: { cAtkPercent: 0.10, energyRegen: -0.05 }
    },
    doom: {
      id: 'doom', name: 'Рок', required: 5,
      bonus: {
        speedL2: 7, energyRegen: 0.0526,
        primary: { INT: 2, MEN: -1, WIT: -2 }
      }
    },
    blue_wolf: {
      id: 'blue_wolf', name: 'Стальной Волк', required: 5,
      bonus: {
        energyFlat: 206, energyRegen: 0.0526,
        primary: { INT: -2, MEN: 3, WIT: -1 }
      }
    }
  };

  function emptySetBonus() {
    return {
      active: [],
      castSpeedSet: 0,
      cAtkPercent: 0,
      pDefPercent: 0,
      energyPercent: 0,
      energyRegen: 0,
      energyFlat: 0,
      hpFlat: 0,
      speedL2: 0,
      primary: null,
      labels: []
    };
  }

  function isRobeTpl(tpl) {
    return !!(tpl && (tpl.armorType === 'robe' || tpl.armorSet === 'robe'));
  }

  function isHeavyTpl(tpl) {
    return !!(tpl && (tpl.armorType === 'heavy' || tpl.armorSet === 'heavy'));
  }

  function isLightTpl(tpl) {
    return !!(tpl && (tpl.armorType === 'light' || tpl.armorSet === 'light'));
  }

  /** Хотя бы один слот с armorType=robe (диагностика / UI). */
  function hasAnyRobe(equip) {
    if (!equip) return false;
    return Object.keys(equip).some(function (s) {
      return isRobeTpl(resolveTemplate(equip[s]));
    });
  }

  /**
   * C1 Spellcraft / Magician's Movement / Mana Recovery:
   * куртка + штаны робы, ИЛИ fullBody роба (Avadon Robe).
   */
  function hasRobeSet(equip) {
    if (!equip) return false;
    var chest = resolveTemplate(equip.chest || equip.CHEST);
    if (chest && chest.fullBody && isRobeTpl(chest)) return true;
    var legs = resolveTemplate(equip.legs || equip.LEGS);
    return isRobeTpl(chest) && isRobeTpl(legs);
  }

  /** Тяжелая броня: надета ли тяжелая кираса. */
  function hasHeavyArmor(equip) {
    if (!equip) return false;
    var chest = resolveTemplate(equip.chest || equip.CHEST);
    if (chest && chest.fullBody && isHeavyTpl(chest)) return true;
    var legs = resolveTemplate(equip.legs || equip.LEGS);
    return isHeavyTpl(chest) && (!legs || isHeavyTpl(legs));
  }

  /** Легкая броня: надета ли легкая кираса. */
  function hasLightArmor(equip) {
    if (!equip) return false;
    var chest = resolveTemplate(equip.chest || equip.CHEST);
    if (chest && chest.fullBody && isLightTpl(chest)) return true;
    var legs = resolveTemplate(equip.legs || equip.LEGS);
    return isLightTpl(chest) && (!legs || isLightTpl(legs));
  }

  /** @deprecated use hasRobeSet */
  function hasRobe(equip) { return hasRobeSet(equip); }

  /** Сколько частей сета setId надето. */
  function countSetPieces(equip, setId) {
    if (!equip || !setId) return 0;
    var n = 0;
    var sid = String(setId).toLowerCase();
    Object.keys(equip).forEach(function (s) {
      var tpl = resolveTemplate(equip[s]);
      if (!tpl) return;
      if (s === 'shield' || tpl.isShield || tpl.slot === 'shield') return;
      var id = (tpl.setId || tpl.armorSet || '').toString().toLowerCase();
      if (id === sid) n += (tpl.setPieceWeight != null ? +tpl.setPieceWeight : 1);
    });
    return n;
  }

  /**
   * Evaluate all named armor sets. Returns merged bonuses + active set ids.
   * Does NOT gate castSpeedSet on robe — caller (Spellcraft) must check hasRobeSet.
   */
  function evaluateSets(equip) {
    var out = emptySetBonus();
    if (!equip || typeof equip !== 'object') return out;

    var counts = {};
    Object.keys(equip).forEach(function (s) {
      var tpl = resolveTemplate(equip[s]);
      if (!tpl) return;
      if (s === 'shield' || tpl.isShield || tpl.slot === 'shield') return;
      var sid = (tpl.setId || tpl.armorSet || '').toString().toLowerCase();
      if (!sid || !ARMOR_SETS[sid]) return;
      counts[sid] = (counts[sid] || 0) + (tpl.setPieceWeight != null ? +tpl.setPieceWeight : 1);
    });

    var prim = { STR: 0, DEX: 0, CON: 0, INT: 0, WIT: 0, MEN: 0 };
    var hasPrim = false;

    Object.keys(ARMOR_SETS).forEach(function (sid) {
      var def = ARMOR_SETS[sid];
      var need = def.required || 99;
      if ((counts[sid] || 0) < need) return;
      var b = def.bonus || {};
      out.active.push(sid);
      out.labels.push(def.name || sid);
      if (b.castSpeedSet) out.castSpeedSet = Math.max(out.castSpeedSet, +b.castSpeedSet);
      if (b.cAtkPercent) out.cAtkPercent += +b.cAtkPercent;
      if (b.pDefPercent) out.pDefPercent += +b.pDefPercent;
      if (b.energyPercent) out.energyPercent += +b.energyPercent;
      if (b.energyRegen) out.energyRegen += +b.energyRegen;
      if (b.energyFlat) out.energyFlat += +b.energyFlat;
      if (b.hpFlat) out.hpFlat += +b.hpFlat;
      if (b.speedL2) out.speedL2 += +b.speedL2;
      if (b.primary) {
        Object.keys(b.primary).forEach(function (k) {
          if (b.primary[k]) {
            prim[k] += b.primary[k];
            hasPrim = true;
          }
        });
      }
    });

    if (hasPrim) out.primary = prim;
    return out;
  }

  /**
   * Cast set bonus (Devotion / Karmian / Avadon +15%) only on top of Spellcraft robe.
   */
  function castSpeedSetBonus(equip) {
    if (!hasRobeSet(equip)) return 0;
    return evaluateSets(equip).castSpeedSet || 0;
  }

  function fullSetBonus(equip, setId, requiredParts, bonusPct) {
    requiredParts = requiredParts != null ? requiredParts : 2;
    bonusPct = bonusPct != null ? bonusPct : 0.15;
    if (!hasRobeSet(equip)) return 0;
    return countSetPieces(equip, setId) >= requiredParts ? bonusPct : 0;
  }

  function devotionSetPct(equip) {
    return castSpeedSetBonus(equip);
  }

  // ============================================================
  //  ПРИБОРЫ ИНЖЕНЕРА (резонатор / нано-браслеты)
  //  Две независимые линии на каждом приборе:
  //    circuit / nano  — уровень контура: гейт обучения и каста скиллов, за SP;
  //    shell / casing  — корпус: cDef / HP / пар, за материалы + уровень.
  //  Лестницы жили только в client/js/inventory.js, поэтому сервер не мог ни
  //  проверить прокачку, ни начислить статы: клиент присылал circuitLevel в
  //  пакете equip, и `circuitLevel: 99` открывал любые скиллы.
  // ============================================================
  var RESONATOR_SHELL_LADDER = [
    { id: 'ng1', grade: 'NO_GRADE', label: 'NG I',   playerLevel: 1,  cDef: 15, hpBonus: 0,   energyBonus: 0,  materials: {} },
    { id: 'ng2', grade: 'NO_GRADE', label: 'NG II',  playerLevel: 1,  cDef: 18, hpBonus: 20,  energyBonus: 0,  materials: { copper_parts: 40 } },
    { id: 'ng3', grade: 'NO_GRADE', label: 'NG III', playerLevel: 5,  cDef: 21, hpBonus: 40,  energyBonus: 10, materials: { copper_parts: 80, synthetic_oil: 2 } },
    { id: 'ng4', grade: 'NO_GRADE', label: 'NG IV',  playerLevel: 10, cDef: 25, hpBonus: 60,  energyBonus: 15, materials: { copper_parts: 150, synthetic_oil: 4 } },
    { id: 'ng5', grade: 'NO_GRADE', label: 'NG V',   playerLevel: 15, cDef: 28, hpBonus: 80,  energyBonus: 20, materials: { copper_parts: 250, synthetic_oil: 6 } },
    { id: 'd1',  grade: 'D',        label: 'D I',    playerLevel: 20, cDef: 36, hpBonus: 120, energyBonus: 30, materials: { copper_parts: 400, synthetic_oil: 10, pressure_amplifier: 1 } },
    { id: 'd2',  grade: 'D',        label: 'D II',   playerLevel: 24, cDef: 42, hpBonus: 160, energyBonus: 40, materials: { copper_parts: 600, synthetic_oil: 14, pressure_amplifier: 2 } },
    { id: 'd3',  grade: 'D',        label: 'D III',  playerLevel: 28, cDef: 48, hpBonus: 200, energyBonus: 50, materials: { copper_parts: 900, synthetic_oil: 20, pressure_amplifier: 3 } },
    { id: 'c1',  grade: 'C',        label: 'C I',    playerLevel: 40, cDef: 58, hpBonus: 280, energyBonus: 70, materials: { copper_parts: 1500, synthetic_oil: 30, pressure_amplifier: 5 } },
    { id: 'c2',  grade: 'C',        label: 'C II',   playerLevel: 46, cDef: 68, hpBonus: 360, energyBonus: 90, materials: { copper_parts: 2200, synthetic_oil: 40, pressure_amplifier: 8 } },
    { id: 'b1',  grade: 'B',        label: 'B I',    playerLevel: 52, cDef: 82, hpBonus: 480, energyBonus: 120, materials: { copper_parts: 3500, synthetic_oil: 55, pressure_amplifier: 12 } },
    { id: 'b2',  grade: 'B',        label: 'B II',   playerLevel: 56, cDef: 96, hpBonus: 600, energyBonus: 150, materials: { copper_parts: 5000, synthetic_oil: 70, pressure_amplifier: 16 } },
    { id: 'a1',  grade: 'A',        label: 'A I',    playerLevel: 61, cDef: 115, hpBonus: 780, energyBonus: 200, materials: { copper_parts: 8000, synthetic_oil: 100, pressure_amplifier: 25 } },
    { id: 'a2',  grade: 'A',        label: 'A II',   playerLevel: 64, cDef: 135, hpBonus: 960, energyBonus: 250, materials: { copper_parts: 12000, synthetic_oil: 140, pressure_amplifier: 35 } }
  ];

  var NANO_CASING_LADDER = [
    { id: 'ng1', grade: 'NO_GRADE', label: 'NG I',   playerLevel: 1,  cDef: 8,  hpBonus: 0,   energyBonus: 0,  materials: {} },
    { id: 'ng2', grade: 'NO_GRADE', label: 'NG II',  playerLevel: 1,  cDef: 10, hpBonus: 25,  energyBonus: 25, materials: { copper_parts: 40 } },
    { id: 'ng3', grade: 'NO_GRADE', label: 'NG III', playerLevel: 5,  cDef: 12, hpBonus: 40,  energyBonus: 40, materials: { copper_parts: 80, synthetic_oil: 2 } },
    { id: 'ng4', grade: 'NO_GRADE', label: 'NG IV',  playerLevel: 10, cDef: 14, hpBonus: 55,  energyBonus: 55, materials: { copper_parts: 150, synthetic_oil: 4 } },
    { id: 'ng5', grade: 'NO_GRADE', label: 'NG V',   playerLevel: 15, cDef: 16, hpBonus: 70,  energyBonus: 70, materials: { copper_parts: 250, synthetic_oil: 6 } },
    { id: 'd1',  grade: 'D',        label: 'D I',    playerLevel: 20, cDef: 20, hpBonus: 100, energyBonus: 100, materials: { copper_parts: 400, synthetic_oil: 10, pressure_amplifier: 1 } },
    { id: 'd2',  grade: 'D',        label: 'D II',   playerLevel: 24, cDef: 24, hpBonus: 130, energyBonus: 120, materials: { copper_parts: 600, synthetic_oil: 14, pressure_amplifier: 2 } },
    { id: 'd3',  grade: 'D',        label: 'D III',  playerLevel: 28, cDef: 28, hpBonus: 160, energyBonus: 140, materials: { copper_parts: 900, synthetic_oil: 20, pressure_amplifier: 3 } },
    { id: 'c1',  grade: 'C',        label: 'C I',    playerLevel: 40, cDef: 34, hpBonus: 220, energyBonus: 180, materials: { copper_parts: 1500, synthetic_oil: 30, pressure_amplifier: 5 } },
    { id: 'c2',  grade: 'C',        label: 'C II',   playerLevel: 46, cDef: 40, hpBonus: 280, energyBonus: 220, materials: { copper_parts: 2200, synthetic_oil: 40, pressure_amplifier: 8 } },
    { id: 'b1',  grade: 'B',        label: 'B I',    playerLevel: 52, cDef: 48, hpBonus: 360, energyBonus: 280, materials: { copper_parts: 3500, synthetic_oil: 55, pressure_amplifier: 12 } },
    { id: 'b2',  grade: 'B',        label: 'B II',   playerLevel: 56, cDef: 56, hpBonus: 450, energyBonus: 340, materials: { copper_parts: 5000, synthetic_oil: 70, pressure_amplifier: 16 } },
    { id: 'a1',  grade: 'A',        label: 'A I',    playerLevel: 61, cDef: 68, hpBonus: 580, energyBonus: 420, materials: { copper_parts: 8000, synthetic_oil: 100, pressure_amplifier: 25 } },
    { id: 'a2',  grade: 'A',        label: 'A II',   playerLevel: 64, cDef: 80, hpBonus: 720, energyBonus: 500, materials: { copper_parts: 12000, synthetic_oil: 140, pressure_amplifier: 35 } }
  ];

  var DEVICE_MAX_LEVEL = 10;

  function resonatorShell(index) {
    var i = Math.max(0, Math.min(RESONATOR_SHELL_LADDER.length - 1, index | 0));
    return RESONATOR_SHELL_LADDER[i];
  }
  function nanoCasing(index) {
    var i = Math.max(0, Math.min(NANO_CASING_LADDER.length - 1, index | 0));
    return NANO_CASING_LADDER[i];
  }
  /** SP за следующий уровень контура/нано-сети (клиентская формула 40·n²). */
  function circuitSpCost(nextLevel) {
    var n = Math.max(1, nextLevel | 0);
    return 40 * n * n;
  }
  /**
   * C1-подобная лестница «уровень персонажа → максимальный уровень прибора».
   * Тот же порог, что у deviceReq в гейте скиллов: скилл с levelReq ≤ 7
   * требует прибор 2, ≤ 14 — 3, ≤ 20 — 4. Прибор выше цели бесполезен, а
   * потолок закрывает мусор из старых профилей (circuitLevel: 99).
   */
  function deviceLevelCap(playerLevel) {
    var lv = Math.max(1, playerLevel | 0);
    if (lv <= 1) return 1;
    if (lv <= 7) return 2;
    if (lv <= 14) return 3;
    if (lv <= 20) return 4;
    if (lv <= 28) return 5;
    if (lv <= 40) return 6;
    if (lv <= 52) return 8;
    return DEVICE_MAX_LEVEL;
  }
  /** Максимальный индекс корпуса, доступный по уровню персонажа. */
  function shellIndexCap(ladder, playerLevel) {
    var lv = Math.max(1, playerLevel | 0);
    var cap = 0;
    for (var i = 0; i < ladder.length; i++) {
      if ((ladder[i].playerLevel || 1) <= lv) cap = i;
      else break;
    }
    return cap;
  }
  function isResonatorTpl(tpl) {
    return !!(tpl && (tpl.isResonator || tpl.isCircuitDevice || tpl.isCompressor || tpl.isOperatorDevice));
  }
  function isNanoBraceletTpl(tpl) {
    return !!(tpl && (tpl.isNanoBracelet || tpl.isBraceletDevice || tpl.isBracers || tpl.isOperatorBracers));
  }

  return {
    ITEMS: ITEMS,
    ARMOR_SETS: ARMOR_SETS,
    get: get,
    resolveTemplate: resolveTemplate,
    gearFromEquip: gearFromEquip,
    RESONATOR_SHELL_LADDER: RESONATOR_SHELL_LADDER,
    NANO_CASING_LADDER: NANO_CASING_LADDER,
    DEVICE_MAX_LEVEL: DEVICE_MAX_LEVEL,
    ENCHANT_MAX: ENCHANT_MAX,
    ENCHANT_STEP: ENCHANT_STEP,
    enchantBonus: enchantBonus,
    resonatorShell: resonatorShell,
    nanoCasing: nanoCasing,
    circuitSpCost: circuitSpCost,
    deviceLevelCap: deviceLevelCap,
    shellIndexCap: shellIndexCap,
    isResonatorTpl: isResonatorTpl,
    isNanoBraceletTpl: isNanoBraceletTpl,
    isOperatorDevice: function(tpl) { return !!(tpl && (tpl.isOperatorDevice || tpl.isCompressor || tpl.isOperatorBracers || tpl.isBracers)); },
    isCompressorTpl: function(tpl) { return !!(tpl && (tpl.isCompressor || tpl.isOperatorDevice)); },
    isBracersTpl: function(tpl) { return !!(tpl && (tpl.isBracers || tpl.isOperatorBracers)); },
    isClassDevice: function(tpl) {
      if (!tpl) return false;
      var id = String(tpl.id || tpl.templateId || '').toLowerCase();
      if (id === 'engineer_emitter_low' || id === 'engineer_nano_bracelet' ||
          id === 'operator_compressor_low' || id === 'operator_bracers_low') {
        return true;
      }
      return !!(tpl.isResonator || tpl.isCircuitDevice || tpl.isCompressor || tpl.isOperatorDevice ||
                tpl.isNanoBracelet || tpl.isBraceletDevice || tpl.isBracers || tpl.isOperatorBracers ||
                tpl.isValveDevice || tpl.isCircuit);
    },
    NAKED_PDEF: NAKED_PDEF,
    NAKED_MDEF: NAKED_MDEF,
    normalizeArmorSlot: normalizeArmorSlot,
    evaluateSets: evaluateSets,
    castSpeedSetBonus: castSpeedSetBonus,
    isRobeTpl: isRobeTpl,
    hasAnyRobe: hasAnyRobe,
    hasRobe: hasRobe,
    hasRobeSet: hasRobeSet,
    hasHeavyArmor: hasHeavyArmor,
    hasLightArmor: hasLightArmor,
    countSetPieces: countSetPieces,
    fullSetBonus: fullSetBonus,
    devotionSetPct: devotionSetPct,
    itemLevelReq: function (tpl) { return GR ? GR.itemLevelReq(tpl) : 1; }
  };
});
