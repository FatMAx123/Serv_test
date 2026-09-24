/* Generated clean Steampunk Item Buffs DB */
(function(root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ITEM_BUFFS_DB = factory();
})(typeof window !== "undefined" ? window : globalThis, function() {
  return {
  "meta": {
    "version": "1.0.0",
    "system": "EffectList System",
    "maxBuffs": 20,
    "maxDebuffs": 10,
    "rules": {
      "stacking": "Эффекты одной группы (stackGroup) заменяют друг друга по приоритету (priority) или обновляют время действия (refresh).",
      "death": "Все временные эффекты сбрасываются при аварийной остановке (гибели), кроме эликсиров аур боссов с параметром persistOnDeath: true.",
      "dispel": "Импульсная дестабилизация (Dispel) снимает случайные незащищённые эффекты."
    }
  },
  "project_steam_items": [
    {
      "id": "synthetic_oil",
      "nameRu": "Синтетическое масло",
      "nameEn": "Synthetic Oil",
      "type": "consumable",
      "description": "Восстанавливает 50 HP. На вкус как машинное масло.",
      "effects": {
        "healHpInstant": 50
      },
      "icon": "assets/inventar/icons/synthetic_oil.webp"
    },
    {
      "id": "emergency_repair_kit",
      "nameRu": "Аварийный ремкомплект",
      "nameEn": "Emergency Repair Kit",
      "type": "consumable",
      "description": "Аварийный ремонт корпуса. +150 HP.",
      "effects": {
        "healHpInstant": 150
      },
      "icon": "assets/inventar/icons/emergency_repair_kit.webp"
    },
    {
      "id": "rubber_duck_debug",
      "nameRu": "Резиновая уточка-отладчик",
      "nameEn": "Debug Rubber Duck",
      "type": "consumable",
      "description": "Классика: объясни баг уточке — +80 HP. С Тостер-Оверлорда.",
      "effects": {
        "healHpInstant": 80
      },
      "icon": "assets/inventar/icons/rubber_duck_debug.webp"
    },
    {
      "id": "paper_jam_coupon",
      "nameRu": "Купон «Paper Jam»",
      "nameEn": "Paper Jam Coupon",
      "type": "consumable",
      "description": "Обмен на жизнь: +120 HP. Принтер Судьбы одобряет.",
      "effects": {
        "healHpInstant": 120
      },
      "icon": "assets/inventar/icons/paper_jam_coupon.webp"
    },
    {
      "id": "pressure_canister",
      "nameRu": "Баллон давления",
      "nameEn": "Pressure Canister",
      "type": "consumable",
      "description": "Восстанавливает 30 энергии (пара).",
      "effects": {
        "healEnergyInstant": 30
      },
      "icon": "assets/inventar/icons/pressure_canister.webp"
    },
    {
      "id": "coffee_grounds_oil",
      "nameRu": "Масло из кофейной гущи",
      "nameEn": "Coffee Grounds Oil",
      "type": "consumable",
      "description": "Горько, чёрно, 14 бар. +45 энергии. Эспрессо для механизмов.",
      "effects": {
        "healEnergyInstant": 45
      },
      "icon": "assets/inventar/icons/coffee_grounds_oil.webp"
    },
    {
      "id": "high_pressure_tank",
      "nameRu": "Баллон высокого давления",
      "nameEn": "High Pressure Tank",
      "type": "consumable",
      "description": "Восстанавливает 80 энергии (пара).",
      "effects": {
        "healEnergyInstant": 80
      },
      "icon": "assets/inventar/icons/high_pressure_tank.webp"
    },
    {
      "id": "energy_drink_skibidi",
      "nameRu": "Энергетик «Скибиди-Пар»",
      "nameEn": "Energy Drink Skibidi Steam",
      "type": "consumable",
      "description": "Вкус: батарейка + сахар. Урон +25% на 60 сек.",
      "buff": {
        "id": "energy_drink_skibidi",
        "stackGroup": "item_energy_drink_skibidi",
        "durationSec": 60,
        "priority": 25,
        "attackMult": 1.25,
        "icon": "assets/hud/debuffs/energy_skibidi.webp"
      },
      "icon": "assets/hud/debuffs/energy_skibidi.webp"
    },
    {
      "id": "bluetooth_pairing_charm",
      "nameRu": "Амулет сопряжения Bluetooth",
      "nameEn": "Bluetooth Pairing Charm",
      "type": "consumable",
      "description": "«Connected to: you». Урон +35% на 90 сек. Басс бустит кости.",
      "buff": {
        "id": "bluetooth_pairing_charm",
        "stackGroup": "item_bluetooth_pairing_charm",
        "durationSec": 90,
        "priority": 25,
        "attackMult": 1.35,
        "icon": "assets/hud/debuffs/bluetooth_charm.webp"
      },
      "icon": "assets/hud/debuffs/bluetooth_charm.webp"
    },
    {
      "id": "soulshot_no_grade",
      "nameRu": "Заряд: Механизм",
      "nameEn": "Soulshot (No-Grade)",
      "type": "shot",
      "grade": "no_grade",
      "description": "Пневмо-усилитель удара: ×2.0 к физическому удару. ПКМ — включение автоподачи.",
      "mechanics": {
        "shotKind": "ss",
        "multiplier": 2,
        "consumedPerHit": 1
      },
      "icon": "assets/inventar/icons/pressure_amplifier.webp"
    },
    {
      "id": "soulshot_d",
      "nameRu": "Заряд: Паровой двигатель",
      "nameEn": "Soulshot (D-Grade)",
      "type": "shot",
      "grade": "d",
      "description": "Пневмо-усилитель D: ×2.0 к физическому удару оружия ранга D. ПКМ — автоподача.",
      "mechanics": {
        "shotKind": "ss",
        "multiplier": 2,
        "consumedPerHit": 1
      },
      "icon": "assets/inventar/icons/pressure_amplifier.webp"
    },
    {
      "id": "spiritshot_no_grade",
      "nameRu": "Искровой заряд: Механизм",
      "nameEn": "Spiritshot (No-Grade)",
      "type": "shot",
      "grade": "no_grade",
      "description": "Искровой усилитель контура: ×1.5 к контурному урону. ПКМ — автоподача.",
      "mechanics": {
        "shotKind": "sps",
        "multiplier": 1.5,
        "consumedPerCast": 1
      },
      "icon": "assets/inventar/icons/blue_capacitor.webp"
    },
    {
      "id": "spiritshot_d",
      "nameRu": "Искровой заряд: Паровой двигатель",
      "nameEn": "Spiritshot (D-Grade)",
      "type": "shot",
      "grade": "d",
      "description": "Искровой усилитель D: ×1.5 к контурному урону оружия ранга D. ПКМ — автоподача.",
      "mechanics": {
        "shotKind": "sps",
        "multiplier": 1.5,
        "consumedPerCast": 1
      },
      "icon": "assets/inventar/icons/green_protocol_core.webp"
    },
    {
      "id": "blessed_spiritshot_no_grade",
      "nameRu": "Благ. искровой заряд: Механизм",
      "nameEn": "Blessed Spiritshot (No-Grade)",
      "type": "shot",
      "grade": "no_grade",
      "description": "Blessed Искровой усилитель контура: ×2.0 к контурному урону. ПКМ — автоподача.",
      "mechanics": {
        "shotKind": "bsps",
        "multiplier": 2,
        "consumedPerCast": 1
      },
      "icon": "assets/inventar/icons/blessed_spiritshot_no_grade.webp"
    },
    {
      "id": "blessed_spiritshot_d",
      "nameRu": "Благ. искровой заряд: Паровой",
      "nameEn": "Blessed Spiritshot (D-Grade)",
      "type": "shot",
      "grade": "d",
      "description": "Blessed Искровой усилитель D: ×2.0 к контурному урону оружия ранга D. ПКМ — автоподача.",
      "mechanics": {
        "shotKind": "bsps",
        "multiplier": 2,
        "consumedPerCast": 1
      },
      "icon": "assets/inventar/icons/blessed_pressure_amplifier.webp"
    },
    {
      "id": "aura_tralala_neon",
      "nameRu": "Эликсир: Неон Tralala",
      "nameEn": "Elixir: Tralala Neon",
      "type": "elixir",
      "description": "Эссенция неоновых трубок шагающего тостера Toasterino. На 20 минут: неоновая аура, +12% к скорости атаки, +15% к силе крита, +8% к скорости бега. Не спадает при смерти.",
      "buff": {
        "id": "aura_tralala_neon",
        "name": "Эликсир: Неон Tralala",
        "auraId": "tralala_neon",
        "stackGroup": "aura_elixir",
        "durationSec": 1200,
        "priority": 30,
        "persistOnDeath": true,
        "atkSpdMult": 1.12,
        "critDamageBoost": 0.15,
        "speedMult": 1.08,
        "icon": "assets/hud/debuffs/elixir_tralala.webp"
      },
      "icon": "assets/hud/debuffs/elixir_tralala.webp"
    },
    {
      "id": "aura_bombardiro_fire",
      "nameRu": "Эликсир: Реактивный смузи",
      "nameEn": "Elixir: Reactive Smoothie",
      "type": "elixir",
      "description": "Ракетное биотопливо турбин Blendodilo. На 20 минут: пламенная аура, +15% к физ. атаке, 8% откачки масла (вампиризм), +25% защиты от оглушения. Не спадает при смерти.",
      "buff": {
        "id": "aura_bombardiro_fire",
        "name": "Эликсир: Реактивный смузи",
        "auraId": "bombardiro_fire",
        "stackGroup": "aura_elixir",
        "durationSec": 1200,
        "priority": 30,
        "persistOnDeath": true,
        "attackMult": 1.15,
        "vampiric": 0.08,
        "stunResist": 0.25,
        "icon": "assets/hud/debuffs/elixir_bombardiro.webp"
      },
      "icon": "assets/hud/debuffs/elixir_bombardiro.webp"
    },
    {
      "id": "aura_vacuum_void",
      "nameRu": "Эликсир: Вакуумная бездна",
      "nameEn": "Elixir: Vacuum Void",
      "type": "elixir",
      "description": "Вакуумный конденсат турбин Vacuum Sahur. На 20 минут: вакуумная защитная аура, +20% к физ. броне, +35 к макс. энергии пара, +25% к регенерации пара. Не спадает при смерти.",
      "buff": {
        "id": "aura_vacuum_void",
        "name": "Эликсир: Вакуумная бездна",
        "auraId": "vacuum_void",
        "stackGroup": "aura_elixir",
        "durationSec": 1200,
        "priority": 30,
        "persistOnDeath": true,
        "defenseMult": 1.2,
        "maxEnergyBonus": 35,
        "energyRegenMult": 1.25,
        "icon": "assets/hud/debuffs/elixir_vacuum.webp"
      },
      "icon": "assets/hud/debuffs/elixir_vacuum.webp"
    },
    {
      "id": "aura_cappuccino_gold",
      "nameRu": "Эликсир: Золотая пенка",
      "nameEn": "Elixir: Golden Foam",
      "type": "elixir",
      "description": "Золотистая паровая смазка балерины Cappuccino. На 20 минут: золотая аура, +20% к добыче медных деталей, +15% к шансу дропа деталей, +10% к скорости бега. Не спадает при смерти.",
      "buff": {
        "id": "aura_cappuccino_gold",
        "name": "Эликсир: Золотая пенка",
        "auraId": "cappuccino_gold",
        "stackGroup": "aura_elixir",
        "durationSec": 1200,
        "priority": 30,
        "persistOnDeath": true,
        "dropMult": 1.15,
        "speedMult": 1.1,
        "icon": "assets/hud/debuffs/elixir_cappuccino.webp",
        "dropPartsMult": 1.2
      },
      "icon": "assets/hud/debuffs/elixir_cappuccino.webp"
    },
    {
      "id": "aura_skibidi_steam",
      "nameRu": "Эликсир: Скибиди-пар",
      "nameEn": "Elixir: Skibidi Steam",
      "type": "elixir",
      "description": "Сверхкритический пар из котла Skibidi. На 20 минут: изумрудная паровая аура, +10 HP/сек авторемонт, +5 энергии/сек, +10% к физ. броне. Не спадает при смерти.",
      "buff": {
        "id": "aura_skibidi_steam",
        "name": "Эликсир: Скибиди-пар",
        "auraId": "skibidi_steam",
        "stackGroup": "aura_elixir",
        "durationSec": 1200,
        "priority": 30,
        "persistOnDeath": true,
        "hpRegenFlat": 10,
        "energyRegenFlat": 5,
        "defenseMult": 1.1,
        "icon": "assets/hud/debuffs/elixir_skibidi.webp"
      },
      "icon": "assets/hud/debuffs/elixir_skibidi.webp"
    }
  ],
  "tactical_manuals_and_consumables": [
    {
      "id": "tech_lesser_repair_salve",
      "nameRu": "Малая ремонтная присадка",
      "nameEn": "Lesser Repair Salve",
      "type": "consumable",
      "durationSec": 15,
      "icon": "assets/inventar/icons/tech_repair_salve.webp",
      "effect": "Восстанавливает 175 HP в течение 15 секунд (тиками по 1.5 сек)."
    },
    {
      "id": "tech_repair_salve",
      "nameRu": "Ремонтная эмульсия",
      "nameEn": "Repair Emulsion",
      "type": "consumable",
      "durationSec": 15,
      "icon": "assets/inventar/icons/tech_repair_salve.webp",
      "effect": "Восстанавливает 435 HP в течение 15 секунд (тиками по 1.5 сек)."
    },
    {
      "id": "tech_greater_repair_salve",
      "nameRu": "Концентрированная ремонтная эмульсия",
      "nameEn": "Concentrated Repair Emulsion",
      "type": "consumable",
      "durationSec": 15,
      "icon": "assets/inventar/icons/tech_greater_repair_salve.webp",
      "effect": "Восстанавливает 875 HP в течение 15 секунд (тиками по 1.5 сек)."
    },
    {
      "id": "tech_instant_injector",
      "nameRu": "Пневмо-инъектор мгновенного ремонта",
      "nameEn": "Pneumo Instant Injector",
      "type": "consumable",
      "durationSec": 0,
      "icon": "assets/inventar/icons/tech_instant_injector.webp",
      "effect": "Мгновенно восстанавливает 435 HP корпуса без задержки."
    },
    {
      "id": "tech_steam_capacitor",
      "nameRu": "Конденсатор пара высокой ёмкости",
      "nameEn": "High-Capacity Steam Capacitor",
      "type": "consumable",
      "durationSec": 0,
      "icon": "assets/inventar/icons/tech_steam_capacitor.webp",
      "effect": "Мгновенно восполняет 200 единиц энергии пара (MP)."
    },
    {
      "id": "tech_lubricant_haste",
      "nameRu": "Смазка быстрого хода шестерней",
      "nameEn": "Rapid Gear Lubricant",
      "type": "consumable",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/tech_lubricant_haste.webp",
      "buff": {
        "stackGroup": "attack_time_down",
        "atkSpdMult": 1.25,
        "durationSec": 1200,
        "priority": 15,
        "icon": "assets/hud/debuffs/tech_lubricant_haste.webp"
      },
      "effect": "Увеличивает скорость физической атаки (Atk.Spd) на 25% на 20 минут."
    },
    {
      "id": "tech_resonator_overclock",
      "nameRu": "Катализатор разгона резонатора",
      "nameEn": "Resonator Overclock Catalyst",
      "type": "consumable",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/tech_resonator_overclock.webp",
      "buff": {
        "stackGroup": "cast_speed_up",
        "castSpdMult": 1.15,
        "durationSec": 1200,
        "priority": 15,
        "icon": "assets/hud/debuffs/tech_resonator_overclock.webp"
      },
      "effect": "Повышает скорость модуляции и активации программ контура на 15% на 20 минут."
    },
    {
      "id": "tech_piston_accelerator",
      "nameRu": "Присадка ускорения поршней",
      "nameEn": "Piston Accelerator Tonic",
      "type": "consumable",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/tech_piston_accelerator.webp",
      "buff": {
        "stackGroup": "speed_up",
        "speedFlat": 20,
        "durationSec": 1200,
        "priority": 15,
        "icon": "assets/hud/debuffs/tech_piston_accelerator.webp"
      },
      "effect": "Увеличивает скорость перемещения на +20 на 20 минут."
    },
    {
      "id": "tech_manual_forced_march",
      "nameRu": "Инструкция: Форсированный марш",
      "nameEn": "Tactical Blueprint: Forced March",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "speed_up",
        "speedFlat": 33,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_forced_march.webp"
      },
      "effect": "Тактическая настройка гироскопов: увеличивает скорость бега на +33 на 20 минут."
    },
    {
      "id": "tech_manual_reinforced_casing",
      "nameRu": "Инструкция: Усиленный кожух",
      "nameEn": "Tactical Blueprint: Reinforced Casing",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "pd_up",
        "defenseMult": 1.12,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_reinforced_casing.webp"
      },
      "effect": "Тактическая калибровка бронепластин: увеличивает физическую броню на +12% на 20 минут."
    },
    {
      "id": "tech_manual_gear_overdrive",
      "nameRu": "Инструкция: Разгон шестерней",
      "nameEn": "Tactical Blueprint: Gear Overdrive",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "pa_up",
        "attackMult": 1.12,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_gear_overdrive.webp"
      },
      "effect": "Тактическое форсирование поршней: увеличивает физическую атаку на +12% на 20 минут."
    },
    {
      "id": "tech_manual_circuit_overclock",
      "nameRu": "Инструкция: Разгон контура",
      "nameEn": "Tactical Blueprint: Circuit Overclock",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "cast_speed_up",
        "castSpdMult": 1.3,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_circuit_overclock.webp"
      },
      "effect": "Тактическая оптимизация катушек: увеличивает скорость модуляции контура на +30% на 20 минут."
    },
    {
      "id": "tech_manual_precision_optics",
      "nameRu": "Инструкция: Прецизионная оптика",
      "nameEn": "Tactical Blueprint: Precision Optics",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "focus_up",
        "critChanceMult": 1.3,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_precision_optics.webp"
      },
      "effect": "Юстировка прицельной оптики: увеличивает шанс критического удара на +30% на 20 минут."
    },
    {
      "id": "tech_manual_resonance_boost",
      "nameRu": "Инструкция: Резонанс энергии",
      "nameEn": "Tactical Blueprint: Energy Resonance",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "ca_up",
        "circuitAttackMult": 1.55,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_resonance_boost.webp"
      },
      "effect": "Синхронизация генератора: увеличивает контурную атаку (C.Atk) на +55% на 20 минут."
    },
    {
      "id": "tech_manual_frequency_shield",
      "nameRu": "Инструкция: Частотный барьер",
      "nameEn": "Tactical Blueprint: Frequency Barrier",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "mental_shield",
        "resistanceMult": 1.5,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_frequency_shield.webp"
      },
      "effect": "Экранирование датчиков: повышает устойчивость к помехам, шоку и коррозии на +50% на 20 минут."
    },
    {
      "id": "tech_manual_pressure_stability",
      "nameRu": "Инструкция: Стабилизация давления",
      "nameEn": "Tactical Blueprint: Pressure Stabilization",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "concentration",
        "antiInterruptMult": 1.35,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_pressure_stability.webp"
      },
      "effect": "Демпфирование вибраций: снижает шанс прерывания модуляции при получении урона на 35% на 20 минут."
    },
    {
      "id": "tech_manual_thermal_defense",
      "nameRu": "Инструкция: Тепловая изоляция",
      "nameEn": "Tactical Blueprint: Thermal Insulation",
      "type": "manual",
      "durationSec": 1200,
      "icon": "assets/inventar/icons/scroll.webp",
      "buff": {
        "stackGroup": "cd_up",
        "circuitDefenseMult": 1.3,
        "durationSec": 1200,
        "priority": 20,
        "icon": "assets/hud/debuffs/tech_manual_thermal_defense.webp"
      },
      "effect": "Асбесто-керамическая термоизоляция: повышает контурную защиту (C.Def) на +30% на 20 минут."
    },
    {
      "id": "tech_nanite_defibrillator",
      "nameRu": "Нано-дефибриллятор экстренного пуска",
      "nameEn": "Nanite Emergency Defibrillator",
      "type": "consumable",
      "durationSec": 0,
      "icon": "assets/inventar/icons/tech_nanite_defibrillator.webp",
      "effect": "Мгновенно запускает павший паровой экзоскелет союзника со 100% сохранением накопленного опыта."
    }
  ]
};
});
