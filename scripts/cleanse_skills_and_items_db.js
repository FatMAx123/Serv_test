const fs = require('fs');
const path = require('path');

console.log('=== 1. CLEANSING AND ENRICHING engineer_skills_db.json ===');
const skillsDbPath = path.join(__dirname, '..', 'data', 'engineer_skills_db.json');
const skillsDb = JSON.parse(fs.readFileSync(skillsDbPath, 'utf8'));

// Meta update - purely Project Steam lore
skillsDb.meta.classNameRu = 'Инженер';
skillsDb.meta.classNameEn = 'Engineer';
skillsDb.meta.archetype = 'circuit_engineer';
delete skillsDb.meta.l2EquivalentClass;
delete skillsDb.meta.l2Class;
skillsDb.meta.description = 'Базовый класс контурно-энергетической ветки развития Project Steam. Использует резонансные излучатели, импульсные жезлы, резонаторы и нано-браслеты. Мастер дальнего боя контурным уроном (C.Atk), полевого ремонта механизмов, форсирования приводов и наложения коррозийных нано-протоколов.';

skillsDb.meta.formulas = {
  circuitDamage: 'Damage = 91 * SQRT(C.Atk / C.Def) * SkillPower * AmplifierMod * CircuitCritMod',
  circuitCrit: 'Damage * 3.0 при критическом импульсе (базовый множитель), шанс: baseCrit * (WIT / 20)',
  activationTime: 'ActivationTime = HitTime * 333 / ModulationSpeed',
  modulationSpeed: 'ModulationSpeed = Base(166) * (WIT_bonus) * (Spellcraft: x2.0 в комбинезоне) * SetBonus',
  repairFlat: 'Repair = HealPower + SQRT(C.Atk) * (1 + passiveBonus) * (BlessedAmplifier: x1.5)',
  debuffLandRate: 'Rate = BaseLandRate * (INT_attacker / MEN_target) * (AttackerLvl / TargetLvl)',
  steamCost: 'Steam_Final = BaseCost * EquipMod(Wand: 0.90) * LevelPenaltyMod'
};

const skillUpdates = {
  eng_pressure_bolt: {
    icon: 'assets/skills/engineer/eng_pressure_bolt.webp',
    element: 'Pneumatic',
    weaponReq: 'Оружие инженера (Импульсный жезл / Резонансный излучатель)',
    description: 'Базовая дальнобойная программа инженера. Формирует направленную струю перегретого пара и электростатический разряд высокого давления через резонатор, нанося контурный урон на дистанции.',
    mechanics: 'Наносит контурный урон по формуле: 91 * SQRT(C.Atk / C.Def) * Power. Усиливается Усилителем Контура (x1.5) и Благословенным Усилителем Контура (x2.0). Время подготовки сокращается скоростью модуляции (WIT + комбинезон).'
  },
  eng_pressure_seal: {
    icon: 'assets/skills/engineer/eng_pressure_seal.webp',
    element: 'Cryo',
    weaponReq: 'Оружие инженера (Импульсный жезл / Резонансный излучатель)',
    description: 'Выпускает струю криогенного хладагента высокого давления. Наносит контурный урон и замораживает подвижные узлы приводов цели, снижая скорость бега на 20% на 1 минуту.',
    mechanics: 'Быстрый откат (2 сек) и короткое время активации (3.1 сек). Замедление цели фиксировано (-20% на 60 сек) на всех рангах; с повышением ранга увеличивается только мощность урона.'
  },
  eng_pressure_drain: {
    icon: 'assets/skills/engineer/eng_pressure_drain.webp',
    element: 'Vacuum',
    weaponReq: 'Оружие инженера (Импульсный жезл / Резонансный излучатель)',
    description: 'Создаёт вакуумно-энергетическую петлю обратной связи между целью и инженером. Наносит энергетический контурный урон и перекачивает 40% нанесённого ущерба в восстановление прочности инженера.',
    mechanics: 'Damage = 91 * SQRT(C.Atk / C.Def) * Power. Инженер восстанавливает HP в размере floor(Damage * 0.40). Требует нано-браслет.'
  },
  eng_self_repair: {
    icon: 'assets/skills/engineer/eng_self_repair.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Стартовая программа экстренной полевой починки 1-го уровня. Восстанавливает прочность корпуса за счёт сжатого пара и нанитов-ремонтников.',
    mechanics: 'Восстанавливает HP = HealPower(42) + SQRT(C.Atk). Применяется только на самого себя.'
  },
  eng_field_repair: {
    icon: 'assets/skills/engineer/eng_field_repair.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Основная восстановительная программа инженера. Направляет калиброванный поток ремонтных нанитов и стабилизирующего пара в выбранную цель или в себя.',
    mechanics: 'HP = HealPower + SQRT(C.Atk) * (1 + passiveBonus). При использовании Усилителя Контура эффективность возрастает на 50%.'
  },
  eng_battle_repair: {
    icon: 'assets/skills/engineer/eng_battle_repair.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Экстренный скоростной ремонт союзника непосредственно в бою. Активируется более чем в 2 раза быстрее стандартного ремонта (2 сек против 5 сек) с минимальным откатом (3 сек), но с повышенным расходом пара.',
    mechanics: 'Оптимален для спасения бойцов передовой линии под шквалом огня. Генерирует повышенный уровень угрозы у монстров (66 очков).'
  },
  eng_group_repair: {
    icon: 'assets/skills/engineer/eng_group_repair.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Массовая восстановительная программа всего отряда. Ремонтирует корпус всем членам группы в радиусе 55 метров. Требует длительной калибровки (7 сек) и высокого давления в котле.',
    mechanics: 'Восстанавливает прочность всех сопартийцев в радиусе действия. Не требует выбора цели. Откат 25 секунд.'
  },
  eng_might: {
    icon: 'assets/skills/engineer/eng_might.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Длительная тактическая оптимизация физических приводов на 20 минут. Форсирует сервомоторы и шестерни цели, увеличивая физическую атаку (P.Atk).',
    mechanics: 'Увеличивает P.Atk цели: ранг 1: +8% (x1.08), ранг 2: +12% (x1.12), ранг 3: +15% (x1.15). Длительность: 1200 секунд (20 минут). Стак-группа: pa_up.'
  },
  eng_shield: {
    icon: 'assets/skills/engineer/eng_shield.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Длительная защитная программа на 20 минут. Активирует силовую электромагнитную оболочку вокруг цели, увеличивая физическую броню (P.Def).',
    mechanics: 'Увеличивает P.Def цели: ранг 1: +8% (x1.08), ранг 2: +12% (x1.12), ранг 3: +15% (x1.15). Длительность: 1200 секунд (20 минут). Стак-группа: pd_up.'
  },
  eng_curse_corrode: {
    icon: 'assets/skills/engineer/eng_curse_corrode.webp',
    element: 'Chemical',
    weaponReq: 'Оружие инженера (Импульсный жезл / Резонансный излучатель)',
    description: 'Распыляет агрессивный кислотный состав с микро-термитами по корпусу противника. Наносит 21 ед. периодического урона каждую секунду в течение 30 секунд (суммарно 630 урона) и снижает эффективность входящего ремонта цели на 20%.',
    mechanics: 'Периодический урон (30 импульсов с шагом 1 сек). Базовый шанс внедрения: 70%. Снижает входящий ремонт цели на 20%. Нейтрализуется программой «Промывка» (ранг 1).'
  },
  eng_curse_weak: {
    icon: 'assets/skills/engineer/eng_curse_weak.webp',
    element: 'Resonance',
    weaponReq: 'Оружие инженера (Импульсный жезл / Резонансный излучатель)',
    description: 'Импульсная десинхронизация силовых редукторов противника. Снижает физическую атаку (P.Atk) цели на 17% на 30 секунд. Сверхбыстрая активация (1.5 сек) и минимальный расход пара.',
    mechanics: 'Базовый шанс применения: 80%. P.Atk цели умножается на 0.83. Длительность: 30 секунд. Стак-группа: pa_down.'
  },
  eng_cure_toxin: {
    icon: 'assets/skills/engineer/eng_cure_toxin.webp',
    weaponReq: 'Любое снаряжение',
    description: 'Экстренная продувка каналов контура нейтрализующим реагентом. Мгновенно устраняет эффекты коррозии и агрессивных химикатов начальной мощности с цели или себя.',
    mechanics: 'Мгновенная активация (0.5 сек). Снимает коррозийные эффекты монстров до 20 уровня. Стак-группа очистки: dot.'
  },
  eng_expert_tune: {
    icon: 'assets/skills/engineer/eng_expert_tune.webp',
    weaponReq: 'Комплект лёгкого комбинезона (робы)',
    description: 'Высокая точность модуляции контура. Удваивает скорость активации программ (Modulation Speed x2.0) при одновременном ношении куртки и штанов лёгкого защитного комбинезона (робы).',
    mechanics: 'При надетом полном комплекте комбинезона (куртка + штаны) скорость активации программ возрастает со 166 до 333 (x2.0). Без полного комплекта скорость остаётся базовой 166 (эффективный штраф -50%).'
  },
  eng_robe_step: {
    icon: 'assets/skills/engineer/eng_robe_step.webp',
    weaponReq: 'Комплект лёгкого комбинезона (робы)',
    description: 'Оптимальная развесовка снаряжения. Снижает инерцию экипировки и повышает темп физических ударов на 25% при ношении лёгкого комбинезона (робы).',
    mechanics: 'Работает только при надетом комплекте лёгкого комбинезона. Ускоряет темп ударов кулаками и оружием ближнего боя на 25%.'
  },
  eng_coolant_mind: {
    icon: 'assets/skills/engineer/eng_coolant_mind.webp',
    weaponReq: 'Комплект лёгкого комбинезона (робы)',
    description: 'Оптимизация парового теплообменника. Повышает естественную циркуляцию и скорость восполнения пара (MP) на 20% при ношении лёгкого комбинезона (робы).',
    mechanics: 'Даёт мультипликатор x1.20 к скорости восполнения пара во всех состояниях (покой, движение, сидя) при ношении защитного комбинезона.'
  },
  eng_weapon_mastery: {
    icon: 'assets/skills/engineer/eng_weapon_mastery.webp',
    weaponReq: 'Оружие инженера и ручной инструмент',
    description: 'Специализированная подготовка инженера к работе с импульсными излучателями и тяжелым инструментом. Увеличивает физическую атаку и контурную мощность.',
    mechanics: 'Формула: P.Atk * 1.45 + FlatBonus; C.Atk * 1.17 + FlatBonus. Множитель фиксирован (+45% P.Atk / +17% C.Atk), с рангом растёт плоская добавка.'
  },
  eng_armor_mastery: {
    icon: 'assets/skills/engineer/eng_armor_mastery.webp',
    weaponReq: 'Любая экипировка',
    description: 'Умение грамотно крепить защитные пластины. Плоско увеличивает физическую броню (P.Def).',
    mechanics: 'Добавляет прямое число к P.Def: ранг 1: +6.7, ранг 2: +8.0, ранг 3: +9.2.'
  },
  eng_circuit_mastery: {
    icon: 'assets/skills/engineer/eng_circuit_mastery.webp',
    weaponReq: 'Любая экипировка',
    description: 'Диэлектрическая и электромагнитная изоляция внутренних узлов от внешних разрядов и импульсов. Плоско увеличивает контурную защиту (C.Def).',
    mechanics: 'Добавляет прямое число к C.Def: ранг 1: +10, ранг 2: +12, ранг 3: +14, ранг 4: +16. Снижает входящий контурный урон.'
  },
  eng_lucky: {
    icon: 'assets/skills/engineer/eng_lucky.webp',
    weaponReq: 'Любая экипировка',
    description: 'Защитный протокол новичка. При аварийном отключении (гибели) персонажа до 4-го уровня включительно теряется опыт, но инвентарь и экипированные механизмы гарантированно сохраняются.',
    mechanics: 'Предотвращает потерю предметов из инвентаря при гибели персонажа до достижения 5-го уровня.'
  },
  eng_expertise_d: {
    icon: 'assets/skills/engineer/eng_expertise_d.webp',
    weaponReq: 'Экипировка D-ранга',
    description: 'Квалификация работы с технологиями D-ранга. Снимает штраф несоответствия при использовании оружия и брони грейда D. Присваивается при получении первой профессии на 20 уровне.',
    mechanics: 'Без квалификации экипировка грейда D снижает скорость атаки на 50%, точность на -16 и скорость бега на -20%. Данный навык полностью устраняет штрафы.'
  }
};

skillsDb.skills.forEach(s => {
  delete s.l2Name;
  delete s.l2SkillId;
  delete s.l2Class;

  // Rename range keys with L2 suffix to Units
  if (s.rangeL2 != null) {
    s.rangeUnits = s.rangeL2;
    delete s.rangeL2;
  }
  if (s.effectRangeL2 != null) {
    s.effectRangeUnits = s.effectRangeL2;
    delete s.effectRangeL2;
  }
  if (s.partyRadiusL2 != null) {
    s.partyRadiusUnits = s.partyRadiusL2;
    delete s.partyRadiusL2;
  }

  if (skillUpdates[s.id]) {
    Object.assign(s, skillUpdates[s.id]);
  }
  if (s.ranks) {
    s.ranks.forEach(r => {
      if (r.l2Power != null) {
        r.power = r.l2Power;
        delete r.l2Power;
      }
    });
  }
});

fs.writeFileSync(skillsDbPath, JSON.stringify(skillsDb, null, 2), 'utf8');

const skillsJsPath = path.join(__dirname, '..', 'shared', 'engineer-skills-db.js');
const skillsJsContent = '/* Generated clean Steampunk Engineer Skills DB */\n' +
  '(function(root, factory) {\n' +
  '  if (typeof module !== "undefined" && module.exports) module.exports = factory();\n' +
  '  else root.ENGINEER_SKILLS_DB = factory();\n' +
  '})(typeof window !== "undefined" ? window : globalThis, function() {\n' +
  '  return ' + JSON.stringify(skillsDb, null, 2) + ';\n' +
  '});\n';
fs.writeFileSync(skillsJsPath, skillsJsContent, 'utf8');

console.log('=== 2. CLEANSING AND ENRICHING item_buffs_db.json ===');
const itemsDbPath = path.join(__dirname, '..', 'data', 'item_buffs_db.json');
const itemsDb = JSON.parse(fs.readFileSync(itemsDbPath, 'utf8'));

itemsDb.meta.system = 'EffectList System';
itemsDb.meta.rules = {
  stacking: 'Эффекты одной группы (stackGroup) заменяют друг друга по приоритету (priority) или обновляют время действия (refresh).',
  death: 'Все временные эффекты сбрасываются при аварийной остановке (гибели), кроме эликсиров аур боссов с параметром persistOnDeath: true.',
  dispel: 'Импульсная дестабилизация (Dispel) снимает случайные незащищённые эффекты.'
};

// Precise webp icon mappings for all items
const projectItemIconMap = {
  synthetic_oil: 'assets/inventar/icons/synthetic_oil.webp',
  emergency_repair_kit: 'assets/inventar/icons/emergency_repair_kit.webp',
  rubber_duck_debug: 'assets/inventar/icons/rubber_duck_debug.webp',
  paper_jam_coupon: 'assets/inventar/icons/paper_jam_coupon.webp',
  pressure_canister: 'assets/inventar/icons/pressure_canister.webp',
  coffee_grounds_oil: 'assets/inventar/icons/coffee_grounds_oil.webp',
  high_pressure_tank: 'assets/inventar/icons/high_pressure_tank.webp',
  energy_drink_skibidi: 'assets/hud/debuffs/energy_skibidi.webp',
  bluetooth_pairing_charm: 'assets/hud/debuffs/bluetooth_charm.webp',
  soulshot_no_grade: 'assets/inventar/icons/pressure_amplifier.webp',
  soulshot_d: 'assets/inventar/icons/pressure_amplifier.webp',
  spiritshot_no_grade: 'assets/inventar/icons/blue_capacitor.webp',
  spiritshot_d: 'assets/inventar/icons/green_protocol_core.webp',
  blessed_spiritshot_no_grade: 'assets/inventar/icons/blessed_spiritshot_no_grade.webp',
  blessed_spiritshot_d: 'assets/inventar/icons/blessed_pressure_amplifier.webp',
  aura_tralala_neon: 'assets/hud/debuffs/elixir_tralala.webp',
  aura_bombardiro_fire: 'assets/hud/debuffs/elixir_bombardiro.webp',
  aura_vacuum_void: 'assets/hud/debuffs/elixir_vacuum.webp',
  aura_cappuccino_gold: 'assets/hud/debuffs/elixir_cappuccino.webp',
  aura_skibidi_steam: 'assets/hud/debuffs/elixir_skibidi.webp'
};

(itemsDb.project_steam_items || []).forEach(it => {
  delete it.l2Equivalent;
  if (projectItemIconMap[it.id]) {
    it.icon = projectItemIconMap[it.id];
  }
  if (it.buff) {
    if (projectItemIconMap[it.id]) {
      it.buff.icon = projectItemIconMap[it.id];
    }
    if (it.buff.adenaMult != null) {
      it.buff.dropPartsMult = it.buff.adenaMult;
      delete it.buff.adenaMult;
    }
  }

  // Cleanse descriptions
  if (it.id === 'aura_vacuum_void') {
    it.description = 'Вакуумный конденсат турбин Vacuum Sahur. На 20 минут: вакуумная защитная аура, +20% к физ. броне, +35 к макс. энергии пара, +25% к регенерации пара. Не спадает при смерти.';
  } else if (it.id === 'aura_cappuccino_gold') {
    it.description = 'Золотистая паровая смазка балерины Cappuccino. На 20 минут: золотая аура, +20% к добыче медных деталей, +15% к шансу дропа деталей, +10% к скорости бега. Не спадает при смерти.';
  }

  if (it.description) {
    it.description = it.description
      .replace(/астральная аура/g, 'вакуумная защитная аура')
      .replace(/к добыче адены/g, 'к добыче медных деталей')
      .replace(/Soulshot C1:/g, 'Пневмо-усилитель удара:')
      .replace(/Soulshot D C1:/g, 'Пневмо-усилитель D:')
      .replace(/Spiritshot C1:/g, 'Искровой усилитель контура:')
      .replace(/Spiritshot D C1:/g, 'Искровой усилитель D:')
      .replace(/Blessed Spiritshot C1:/g, 'Благословенный усилитель:')
      .replace(/Blessed Spiritshot D C1:/g, 'Благословенный усилитель D:')
      .replace(/магическому \(контурному\) урону/g, 'контурному урону')
      .replace(/магическому урону/g, 'контурному урону')
      .replace(/автопотребление/g, 'автоподача')
      .replace(/автопотребления/g, 'автоподачи');
  }
});

// Authentic Steampunk Tactical Manuals and Field Consumables with real WebP skill and item icons
const tacticalItems = [
  {
    id: 'tech_lesser_repair_salve',
    nameRu: 'Малая ремонтная присадка',
    nameEn: 'Lesser Repair Salve',
    type: 'consumable',
    durationSec: 15,
    icon: 'assets/inventar/icons/tech_repair_salve.webp',
    effect: 'Восстанавливает 175 HP в течение 15 секунд (тиками по 1.5 сек).'
  },
  {
    id: 'tech_repair_salve',
    nameRu: 'Ремонтная эмульсия',
    nameEn: 'Repair Emulsion',
    type: 'consumable',
    durationSec: 15,
    icon: 'assets/inventar/icons/tech_repair_salve.webp',
    effect: 'Восстанавливает 435 HP в течение 15 секунд (тиками по 1.5 сек).'
  },
  {
    id: 'tech_greater_repair_salve',
    nameRu: 'Концентрированная ремонтная эмульсия',
    nameEn: 'Concentrated Repair Emulsion',
    type: 'consumable',
    durationSec: 15,
    icon: 'assets/inventar/icons/tech_greater_repair_salve.webp',
    effect: 'Восстанавливает 875 HP в течение 15 секунд (тиками по 1.5 сек).'
  },
  {
    id: 'tech_instant_injector',
    nameRu: 'Пневмо-инъектор мгновенного ремонта',
    nameEn: 'Pneumo Instant Injector',
    type: 'consumable',
    durationSec: 0,
    icon: 'assets/inventar/icons/tech_instant_injector.webp',
    effect: 'Мгновенно восстанавливает 435 HP корпуса без задержки.'
  },
  {
    id: 'tech_steam_capacitor',
    nameRu: 'Конденсатор пара высокой ёмкости',
    nameEn: 'High-Capacity Steam Capacitor',
    type: 'consumable',
    durationSec: 0,
    icon: 'assets/inventar/icons/tech_steam_capacitor.webp',
    effect: 'Мгновенно восполняет 200 единиц энергии пара (MP).'
  },
  {
    id: 'tech_lubricant_haste',
    nameRu: 'Смазка быстрого хода шестерней',
    nameEn: 'Rapid Gear Lubricant',
    type: 'consumable',
    durationSec: 1200,
    icon: 'assets/inventar/icons/tech_lubricant_haste.webp',
    buff: {
      stackGroup: 'attack_time_down',
      atkSpdMult: 1.25,
      durationSec: 1200,
      priority: 15,
      icon: 'assets/hud/debuffs/tech_lubricant_haste.webp'
    },
    effect: 'Увеличивает скорость физической атаки (Atk.Spd) на 25% на 20 минут.'
  },
  {
    id: 'tech_resonator_overclock',
    nameRu: 'Катализатор разгона резонатора',
    nameEn: 'Resonator Overclock Catalyst',
    type: 'consumable',
    durationSec: 1200,
    icon: 'assets/inventar/icons/tech_resonator_overclock.webp',
    buff: {
      stackGroup: 'cast_speed_up',
      castSpdMult: 1.15,
      durationSec: 1200,
      priority: 15,
      icon: 'assets/hud/debuffs/tech_resonator_overclock.webp'
    },
    effect: 'Повышает скорость модуляции и активации программ контура на 15% на 20 минут.'
  },
  {
    id: 'tech_piston_accelerator',
    nameRu: 'Присадка ускорения поршней',
    nameEn: 'Piston Accelerator Tonic',
    type: 'consumable',
    durationSec: 1200,
    icon: 'assets/inventar/icons/tech_piston_accelerator.webp',
    buff: {
      stackGroup: 'speed_up',
      speedFlat: 20,
      durationSec: 1200,
      priority: 15,
      icon: 'assets/hud/debuffs/tech_piston_accelerator.webp'
    },
    effect: 'Увеличивает скорость перемещения на +20 на 20 минут.'
  },
  {
    id: 'tech_manual_forced_march',
    nameRu: 'Инструкция: Форсированный марш',
    nameEn: 'Tactical Blueprint: Forced March',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'speed_up',
      speedFlat: 33,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_forced_march.webp'
    },
    effect: 'Тактическая настройка гироскопов: увеличивает скорость бега на +33 на 20 минут.'
  },
  {
    id: 'tech_manual_reinforced_casing',
    nameRu: 'Инструкция: Усиленный кожух',
    nameEn: 'Tactical Blueprint: Reinforced Casing',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'pd_up',
      defenseMult: 1.12,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_reinforced_casing.webp'
    },
    effect: 'Тактическая калибровка бронепластин: увеличивает физическую броню на +12% на 20 минут.'
  },
  {
    id: 'tech_manual_gear_overdrive',
    nameRu: 'Инструкция: Разгон шестерней',
    nameEn: 'Tactical Blueprint: Gear Overdrive',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'pa_up',
      attackMult: 1.12,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_gear_overdrive.webp'
    },
    effect: 'Тактическое форсирование поршней: увеличивает физическую атаку на +12% на 20 минут.'
  },
  {
    id: 'tech_manual_circuit_overclock',
    nameRu: 'Инструкция: Разгон контура',
    nameEn: 'Tactical Blueprint: Circuit Overclock',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'cast_speed_up',
      castSpdMult: 1.30,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_circuit_overclock.webp'
    },
    effect: 'Тактическая оптимизация катушек: увеличивает скорость модуляции контура на +30% на 20 минут.'
  },
  {
    id: 'tech_manual_precision_optics',
    nameRu: 'Инструкция: Прецизионная оптика',
    nameEn: 'Tactical Blueprint: Precision Optics',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'focus_up',
      critChanceMult: 1.30,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_precision_optics.webp'
    },
    effect: 'Юстировка прицельной оптики: увеличивает шанс критического удара на +30% на 20 минут.'
  },
  {
    id: 'tech_manual_resonance_boost',
    nameRu: 'Инструкция: Резонанс энергии',
    nameEn: 'Tactical Blueprint: Energy Resonance',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'ca_up',
      circuitAttackMult: 1.55,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_resonance_boost.webp'
    },
    effect: 'Синхронизация генератора: увеличивает контурную атаку (C.Atk) на +55% на 20 минут.'
  },
  {
    id: 'tech_manual_frequency_shield',
    nameRu: 'Инструкция: Частотный барьер',
    nameEn: 'Tactical Blueprint: Frequency Barrier',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'mental_shield',
      resistanceMult: 1.50,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_frequency_shield.webp'
    },
    effect: 'Экранирование датчиков: повышает устойчивость к помехам, шоку и коррозии на +50% на 20 минут.'
  },
  {
    id: 'tech_manual_pressure_stability',
    nameRu: 'Инструкция: Стабилизация давления',
    nameEn: 'Tactical Blueprint: Pressure Stabilization',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'concentration',
      antiInterruptMult: 1.35,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_pressure_stability.webp'
    },
    effect: 'Демпфирование вибраций: снижает шанс прерывания модуляции при получении урона на 35% на 20 минут.'
  },
  {
    id: 'tech_manual_thermal_defense',
    nameRu: 'Инструкция: Тепловая изоляция',
    nameEn: 'Tactical Blueprint: Thermal Insulation',
    type: 'manual',
    durationSec: 1200,
    icon: 'assets/inventar/icons/scroll.webp',
    buff: {
      stackGroup: 'cd_up',
      circuitDefenseMult: 1.30,
      durationSec: 1200,
      priority: 20,
      icon: 'assets/hud/debuffs/tech_manual_thermal_defense.webp'
    },
    effect: 'Асбесто-керамическая термоизоляция: повышает контурную защиту (C.Def) на +30% на 20 минут.'
  },
  {
    id: 'tech_nanite_defibrillator',
    nameRu: 'Нано-дефибриллятор экстренного пуска',
    nameEn: 'Nanite Emergency Defibrillator',
    type: 'consumable',
    durationSec: 0,
    icon: 'assets/inventar/icons/tech_nanite_defibrillator.webp',
    effect: 'Мгновенно запускает павший паровой экзоскелет союзника со 100% сохранением накопленного опыта.'
  }
];

itemsDb.tactical_manuals_and_consumables = tacticalItems;
delete itemsDb.canonical_l2_reference_items;

fs.writeFileSync(itemsDbPath, JSON.stringify(itemsDb, null, 2), 'utf8');

const itemsJsPath = path.join(__dirname, '..', 'shared', 'item-buffs-db.js');
const itemsJsContent = '/* Generated clean Steampunk Item Buffs DB */\n' +
  '(function(root, factory) {\n' +
  '  if (typeof module !== "undefined" && module.exports) module.exports = factory();\n' +
  '  else root.ITEM_BUFFS_DB = factory();\n' +
  '})(typeof window !== "undefined" ? window : globalThis, function() {\n' +
  '  return ' + JSON.stringify(itemsDb, null, 2) + ';\n' +
  '});\n';
fs.writeFileSync(itemsJsPath, itemsJsContent, 'utf8');

console.log('Cleansing and enrichment script executed successfully!');
