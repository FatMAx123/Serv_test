// SHARED / CLASS-SYSTEM.JS
// Раса, пол, базовые классы и дерево профессий — Остров поющей стали.
// Силовая линия (молот/щит/пневматика) · Контурная линия (схемы/давление/ремонт).
// C.Atk / C.Def = сила и сопротивление схем. Сервер = авторитет.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CLASS_SYSTEM = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var RACES = {
    human: {
      id: 'human',
      name: 'Человек',
      nameEn: 'Human',
      subtitle: 'Народ поющей стали',
      description:
        'Единственная раса на Острове поющей стали. Универсальны: держат и молот, и манометр. ' +
        'Предки услышали Песнь Первого Котла у реки и выстроили вокруг неё Деревню поющей стали.',
      genders: ['male', 'female'],
      baseClasses: ['operator', 'engineer']
    }
  };

  var GENDERS = {
    male:   { id: 'male',   name: 'Мужской', nameEn: 'Male',   short: 'М' },
    female: { id: 'female', name: 'Женский', nameEn: 'Female', short: 'Ж' }
  };

  var BASE_CLASS_IDS = ['operator', 'engineer'];

  var PATH_META = {
    fighter: {
      id: 'fighter',
      name: 'Силовая линия',
      short: 'Сила',
      subtitle: 'тяжелые орудия и броня'
    },
    tech: {
      id: 'tech',
      name: 'Контурная линия',
      short: 'Контур',
      subtitle: 'энергоцепи и импульсное оружие'
    }
  };

  // ─── Канонические базовые характеристики Lineage 2 C1 (Human Fighter / Human Mystic) ───
  // В C1 базовые характеристики фиксированы по стартовой расе/архетипу и НЕ растут с уровнем;
  // они не меняются при смене профессии на 20 или 40 уровне.
  var C1_FIGHTER_PRIMARY = Object.freeze({ STR: 40, DEX: 30, CON: 43, INT: 21, WIT: 11, MEN: 25 });
  var C1_MYSTIC_PRIMARY  = Object.freeze({ STR: 22, DEX: 21, CON: 27, INT: 41, WIT: 20, MEN: 39 });

  /**
   * Дерево профессий.
   * tier 0 = база (1–19), tier 1 = 1-я профессия (20–39), tier 2 = 2-я (40).
   * path: 'fighter' | 'tech'
   */
  var CLASS_TREE = {
    // ═══════════════════════════════════════════
    //  СИЛОВАЯ ЛИНИЯ — Оператор
    // ═══════════════════════════════════════════
    operator: {
      id: 'operator',
      name: 'Оператор',
      nameEn: 'Operator',
      tier: 0,
      levelReq: 1,
      path: 'fighter',
      pathSubtitle: 'ближний бой и тяжелая броня',
      parentClass: null,
      description:
        'Специалист ближнего боя и тяжелых силовых установок. Экипируется силовыми ключами, молотами и котловыми щитами. Сочетает высокий физический урон, прочную броню и отличную выживаемость. Дальнейший выбор: Механик, Разрушитель или Стрелок.',
      lore:
        'Операторов готовят на восточном дворе деревни. Пока инженеры сидят над чертежами в своей школе, оператор учится чувствовать вибрацию магистрали ногой. На 20-м уровне клятва делит путь: щит, молот или пневматика.',
      role: 'hybrid',
      icon: 'assets/classes/operator.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      // Канонические дефолты регенерации (все PC без override)
      baseHpReg: 1.5,
      baseMpReg: 0.9,
      templateBase: { pAtk: 4, pDef: 56, mAtk: 6, mDef: 41, runSpd: 115, walkSpd: 78 },
      acisBase: { pAtk: 4, pDef: 56, mAtk: 6, mDef: 41, runSpd: 115, walkSpd: 78 },
      baseStats: { hp: 80, energy: 30, attack: 4, defense: 80, speed: 7.2, critRate: 40, cAtk: 6, cDef: 41 },
      growthPerLevel: { hp: 22, energy: 6, attack: 3, defense: 2, speed: 0.1, cAtk: 0.5, cDef: 0.8 },
      nextClasses: ['mechanic', 'destroyer', 'gunner'],
      transferQuest: 'main_04_certification',
      primary: ['STR', 'CON', 'DEX']
    },

    mechanic: {
      id: 'mechanic',
      name: 'Механик',
      nameEn: 'Mechanic',
      tier: 1,
      levelReq: 20,
      path: 'fighter',
      pathSubtitle: 'котловой щит и выживание',
      parentClass: 'operator',
      description:
        'Инженерная защита и выдержка. Механик удерживает передовую: носит тяжелый котловой щит, провоцирует врагов на себя и чинит броню союзников.',
      lore:
        'После клятвы Механика на ладонь ставят клеймо шестерни. Долг — не бежать первым. В деревне говорят: «Пока Механик стоит — отряд дышит».',
      role: 'tank',
      icon: 'assets/classes/mechanic.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 320, energy: 85, attack: 28, defense: 22, speed: 7, critRate: 12, cAtk: 12, cDef: 18 },
      growthPerLevel: { hp: 38, energy: 10, attack: 4, defense: 5, speed: 0.05, cAtk: 1, cDef: 2 },
      nextClasses: ['repair_engineer', 'boiler_guardian'],
      transferQuest: 'class_2nd_mechanic',
      primary: ['CON', 'STR']
    },

    destroyer: {
      id: 'destroyer',
      name: 'Разрушитель',
      nameEn: 'Destroyer',
      tier: 1,
      levelReq: 20,
      path: 'fighter',
      pathSubtitle: 'сокрушительный ближний бой',
      parentClass: 'operator',
      description:
        'Мастер сокрушительного ближнего боя. Использует тяжелые двуручные молоты и энергию перегретого пара, нанося огромный урон ценой собственной защиты.',
      lore:
        'Разрушителей набирают из тех, кто на Полигоне слишком сильно бил по манекенам. Их девиз на табличке над входом в кузницу: «Сломал — значит, понял».',
      role: 'melee_dd',
      icon: 'assets/classes/destroyer.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 240, energy: 70, attack: 45, defense: 12, speed: 9, critRate: 18, cAtk: 8, cDef: 10 },
      growthPerLevel: { hp: 28, energy: 8, attack: 7, defense: 2, speed: 0.1, cAtk: 0.5, cDef: 1 },
      nextClasses: ['demolitionist', 'steam_berserker'],
      transferQuest: 'class_2nd_destroyer',
      primary: ['STR', 'DEX']
    },

    gunner: {
      id: 'gunner',
      name: 'Стрелок',
      nameEn: 'Gunner',
      tier: 1,
      levelReq: 20,
      path: 'fighter',
      pathSubtitle: 'пневматика и дистанция',
      parentClass: 'operator',
      description:
        'Специалист дальнего боя на сжатом воздухе. Использует высокоточную пневматику, находит уязвимые швы в броне противника и мгновенно держит дистанцию.',
      lore:
        'Пневматические цеха стоят на ветру у доков: там сушат трубки и калибруют прицелы. Стрелка узнают по звону клапана на бедре и по привычке мерить расстояние глазом.',
      role: 'ranged_dd',
      icon: 'assets/classes/gunner.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 200, energy: 95, attack: 38, defense: 9, speed: 10, critRate: 22, cAtk: 10, cDef: 9 },
      growthPerLevel: { hp: 22, energy: 12, attack: 6, defense: 1, speed: 0.15, cAtk: 1, cDef: 0.8 },
      nextClasses: ['pneumatic_sniper', 'artillery_engineer'],
      transferQuest: 'class_2nd_gunner',
      primary: ['DEX', 'STR']
    },

    repair_engineer: {
      id: 'repair_engineer',
      name: 'Инженер-Ремонтник',
      nameEn: 'Repair Engineer',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'поддержка и полевой ремонт',
      parentClass: 'mechanic',
      description:
        'Мастер полного полевого обслуживания. Укрепляет конструкцию брони отряда, восстанавливает сбойные узлы и держит строй в критических ситуациях.',
      lore:
        'Ремонтников зовут «вторым сердцем отряда». Их набор — не только молоток, но и переносной компрессор, запасные плиты и протоколы экстренной переборки.',
      role: 'support',
      icon: 'assets/classes/repair_engineer.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 850, energy: 180, attack: 65, defense: 85, speed: 7.5, critRate: 12, cAtk: 40, cDef: 70 },
      growthPerLevel: { hp: 40, energy: 12, attack: 5, defense: 6, speed: 0.05, cAtk: 2, cDef: 3 },
      nextClasses: [],
      transferQuest: null,
      primary: ['CON', 'MEN']
    },

    boiler_guardian: {
      id: 'boiler_guardian',
      name: 'Страж Котла',
      nameEn: 'Boiler Guardian',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'несокрушимый щит',
      parentClass: 'mechanic',
      description:
        'Живая фортификация. Обладает максимальными показателями защиты, создает ауры гидравлического давления и контролирует врагов на поле боя.',
      lore:
        'Титул дают тем, кто выстоял сутки у главного котла Деревни, когда с Поля забвения гнали дронов на стены.',
      role: 'tank',
      icon: 'assets/classes/boiler_guardian.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 1100, energy: 150, attack: 55, defense: 110, speed: 6.5, critRate: 10, cAtk: 25, cDef: 80 },
      growthPerLevel: { hp: 55, energy: 10, attack: 4, defense: 8, speed: 0.03, cAtk: 1, cDef: 4 },
      nextClasses: [],
      transferQuest: null,
      primary: ['CON', 'STR']
    },

    demolitionist: {
      id: 'demolitionist',
      name: 'Подрывник',
      nameEn: 'Demolitionist',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'массовые взрывы',
      parentClass: 'destroyer',
      description:
        'Специалист по подрывному делу. Использует минные закладки, цепные детонации и размашистые удары молота, уничтожая группы противников.',
      lore:
        'У Подрывников отдельный склад за стеной — туда без пропуска не пускают.',
      role: 'aoe_dd',
      icon: 'assets/classes/demolitionist.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 620, energy: 140, attack: 120, defense: 35, speed: 9, critRate: 20, cAtk: 20, cDef: 30 },
      growthPerLevel: { hp: 30, energy: 10, attack: 9, defense: 3, speed: 0.1, cAtk: 1, cDef: 1.5 },
      nextClasses: [],
      transferQuest: null,
      primary: ['STR', 'CON']
    },

    steam_berserker: {
      id: 'steam_berserker',
      name: 'Берсерк Парового Молота',
      nameEn: 'Steam Berserker',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'ярость пара',
      parentClass: 'destroyer',
      description:
        'Шквалистый ближний бой. Использует ярость перегретого котла, вампиризм давления и стремительные серии сокрушительных ударов.',
      lore:
        'Берсерки клянутся на горячем молоте. Их доспех нарочно оставляют с открытыми клапанами: пар должен выходить вместе с криком.',
      role: 'melee_dd',
      icon: 'assets/classes/steam_berserker.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 780, energy: 120, attack: 105, defense: 45, speed: 10, critRate: 25, cAtk: 15, cDef: 28 },
      growthPerLevel: { hp: 35, energy: 8, attack: 8, defense: 4, speed: 0.12, cAtk: 0.8, cDef: 1.2 },
      nextClasses: [],
      transferQuest: null,
      primary: ['STR', 'DEX']
    },

    pneumatic_sniper: {
      id: 'pneumatic_sniper',
      name: 'Снайпер-Пневматик',
      nameEn: 'Pneumatic Sniper',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'высокоточная стрельба',
      parentClass: 'gunner',
      description:
        'Мастер одного выстрела. Ведет огонь из тяжелой пневматики на предельной дистанции, нанося критический урон по ключевым узлам цели.',
      lore:
        'Лучших Снайперов отправляют на вышки периметра. Там ветер, ржавые перила и долгие смены.',
      role: 'ranged_dd',
      icon: 'assets/classes/pneumatic_sniper.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 520, energy: 190, attack: 95, defense: 25, speed: 11, critRate: 35, cAtk: 22, cDef: 22 },
      growthPerLevel: { hp: 24, energy: 14, attack: 8, defense: 2, speed: 0.15, cAtk: 1.5, cDef: 1 },
      nextClasses: [],
      transferQuest: null,
      primary: ['DEX', 'WIT']
    },

    artillery_engineer: {
      id: 'artillery_engineer',
      name: 'Инженер-Артиллерист',
      nameEn: 'Artillery Engineer',
      tier: 2,
      levelReq: 40,
      path: 'fighter',
      pathSubtitle: 'огневая поддержка',
      parentClass: 'gunner',
      description:
        'Специалист тяжелой артподдержки. Развертывает полевые турели, мортиры и ракетные установки, накрывая площади сплошным огнем.',
      lore:
        'Артиллерийский двор пахнет селитрой и машинным маслом. Здесь считают траектории на песке.',
      role: 'aoe_ranged',
      icon: 'assets/classes/artillery_engineer.webp',
      primaryBase: C1_FIGHTER_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 580, energy: 170, attack: 85, defense: 30, speed: 9, critRate: 20, cAtk: 30, cDef: 25 },
      growthPerLevel: { hp: 26, energy: 12, attack: 7, defense: 3, speed: 0.1, cAtk: 2, cDef: 1.2 },
      nextClasses: [],
      transferQuest: null,
      primary: ['DEX', 'INT']
    },

    // ═══════════════════════════════════════════
    //  КОНТУРНАЯ ЛИНИЯ — Инженер
    // ═══════════════════════════════════════════
    engineer: {
      id: 'engineer',
      name: 'Инженер',
      nameEn: 'Engineer',
      tier: 0,
      levelReq: 1,
      path: 'tech',
      pathSubtitle: 'энергоцепи и импульсное оружие',
      parentClass: null,
      description:
        'Мастер обращения с гидравликой и энергоцепями. Использует Паровые импульсники для атаки высокими температурами и давлением на дистанции, а также выполняет быстрый полевой ремонт. Дальнейший выбор: Конструктор или Наладчик.',
      lore:
        'В Школе Инженеров стены обклеены схемами Первого Котла. Новичкам твердят: «Пар без ума — взрыв. Ум без пара — тишина». Дорога школы ведёт к Садам, химзаводу и бункеру.',
      role: 'circuit',
      icon: 'assets/classes/engineer.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      // Канонические дефолты регенерации
      baseHpReg: 1.5,
      baseMpReg: 0.9,
      baseStats: { hp: 101, energy: 40, attack: 3, defense: 54, speed: 7.5, critRate: 4, cAtk: 6, cDef: 41 },
      growthPerLevel: { hp: 15, energy: 7.3, attack: 0, defense: 0, speed: 0, cAtk: 0, cDef: 0 },
      templateBase: { pAtk: 3, pDef: 35, mAtk: 6, mDef: 41, runSpd: 121, walkSpd: 78 },
      acisBase: { pAtk: 3, pDef: 35, mAtk: 6, mDef: 41, runSpd: 121, walkSpd: 78 },
      nextClasses: ['constructor', 'technomancer'],
      transferQuest: 'main_04_certification_tech',
      primary: ['INT', 'MEN', 'WIT']
    },

    constructor: {
      id: 'constructor',
      name: 'Конструктор',
      nameEn: 'Constructor',
      tier: 1,
      levelReq: 20,
      path: 'tech',
      pathSubtitle: 'боевые энергоцепи',
      parentClass: 'engineer',
      description:
        'Боевой схемщик. Атакует волнами высоковольтного напряжения и гидравлическими импульсами, уничтожая контуры противников на расстоянии.',
      lore:
        'Конструкторы носят перчатки с вплетёнными медными жилами. По вечерам в мастерских слышен треск пробных разрядов.',
      role: 'circuit_dd',
      icon: 'assets/classes/constructor.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 180, energy: 160, attack: 18, defense: 10, speed: 7.5, critRate: 12, cAtk: 55, cDef: 22 },
      growthPerLevel: { hp: 18, energy: 16, attack: 2, defense: 1.5, speed: 0.08, cAtk: 7, cDef: 2 },
      nextClasses: ['pressure_sorcerer', 'machine_warlock', 'circuit_necro'],
      transferQuest1st: 'path_to_constructor',
      transferQuest: 'class_2nd_constructor',
      primary: ['INT', 'WIT']
    },

    technomancer: {
      id: 'technomancer',
      name: 'Наладчик',
      nameEn: 'System Adjuster',
      tier: 1,
      levelReq: 20,
      path: 'tech',
      pathSubtitle: 'протоколы и сопровождение',
      parentClass: 'engineer',
      description:
        'Сердце поддержки отряда. Занимается ремонтом узлов, усилением сервоприводов и установкой защитных экранов.',
      lore:
        'Наладчиков любят все цеха. Их сумка всегда тяжелее, чем кажется: запасные клапаны и таблички с боевыми протоколами.',
      role: 'healer',
      icon: 'assets/classes/technomancer.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 210, energy: 150, attack: 16, defense: 14, speed: 7.2, critRate: 10, cAtk: 42, cDef: 28 },
      growthPerLevel: { hp: 24, energy: 14, attack: 2, defense: 2.5, speed: 0.07, cAtk: 5, cDef: 3 },
      nextClasses: ['overhaul_master', 'protocol_prophet'],
      transferQuest1st: 'path_to_technomancer',
      transferQuest: 'class_2nd_technomancer',
      primary: ['MEN', 'WIT']
    },

    pressure_sorcerer: {
      id: 'pressure_sorcerer',
      name: 'Мастер Давления',
      nameEn: 'Pressure Master',
      tier: 2,
      levelReq: 40,
      path: 'tech',
      pathSubtitle: 'волны сверхдавления',
      parentClass: 'constructor',
      description:
        'Мастер сверхдавления. Генерирует паровые шквалы и волны сжатого воздуха, нанося колоссальный урон по площадям.',
      lore:
        'Их учат на полигоне с усиленными стенками. Символ профессии — манометр, стрелка которого намеренно зашкаливает.',
      role: 'circuit_aoe',
      icon: 'assets/classes/pressure_sorcerer.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 480, energy: 320, attack: 35, defense: 28, speed: 8, critRate: 15, cAtk: 140, cDef: 50 },
      growthPerLevel: { hp: 20, energy: 18, attack: 2, defense: 2, speed: 0.08, cAtk: 10, cDef: 2.5 },
      nextClasses: [],
      transferQuest: null,
      primary: ['INT', 'WIT']
    },

    machine_warlock: {
      id: 'machine_warlock',
      name: 'Дрон-Оператор',
      nameEn: 'Drone Operator',
      tier: 2,
      levelReq: 40,
      path: 'tech',
      pathSubtitle: 'управление дронами',
      parentClass: 'constructor',
      description:
        'Оператор автономных механизмов. Призывает боевых дронов и турели, координируя их действия и подавляя врага числом.',
      lore:
        'Официально приручение машин Зелёного сбоя запрещено. Неофициально — Дрон-Операторы единственный шанс выстоять у бункера.',
      role: 'summoner',
      icon: 'assets/classes/machine_warlock.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 520, energy: 300, attack: 40, defense: 32, speed: 7.8, critRate: 12, cAtk: 120, cDef: 55 },
      growthPerLevel: { hp: 22, energy: 16, attack: 2.5, defense: 2.2, speed: 0.08, cAtk: 8, cDef: 2.8 },
      nextClasses: [],
      transferQuest: null,
      primary: ['INT', 'MEN']
    },

    circuit_necro: {
      id: 'circuit_necro',
      name: 'Коррозионист',
      nameEn: 'Circuit Corroder',
      tier: 2,
      levelReq: 40,
      path: 'tech',
      pathSubtitle: 'коррозия схем',
      parentClass: 'constructor',
      description:
        'Мастер коррозийных процессов. Поражает электронные и механические контуры кислотными растворами и истощением энергии.',
      lore:
        'Их лаборатории пахнут кислотой и озоном. «Не протягивай Коррозионисту кабель — отдашь вместе с рукой».',
      role: 'dot_circuit',
      icon: 'assets/classes/circuit_necro.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 500, energy: 310, attack: 38, defense: 30, speed: 7.6, critRate: 14, cAtk: 130, cDef: 48 },
      growthPerLevel: { hp: 21, energy: 17, attack: 2.2, defense: 2, speed: 0.07, cAtk: 9, cDef: 2.4 },
      nextClasses: [],
      transferQuest: null,
      primary: ['INT', 'MEN']
    },

    overhaul_master: {
      id: 'overhaul_master',
      name: 'Мастер Переборки',
      nameEn: 'Overhaul Master',
      tier: 2,
      levelReq: 40,
      path: 'tech',
      pathSubtitle: 'капитальный ремонт',
      parentClass: 'technomancer',
      description:
        'Высшая школа восстановления. Выполняет экстренную капитальную переборку узлов и моментально перезапускает системы павших союзников.',
      lore:
        'Титул редкий. На нагрудном знаке — разомкнутое кольцо, которое можно снова сомкнуть.',
      role: 'healer',
      icon: 'assets/classes/overhaul_master.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 600, energy: 340, attack: 30, defense: 40, speed: 7.5, critRate: 10, cAtk: 100, cDef: 70 },
      growthPerLevel: { hp: 28, energy: 18, attack: 2, defense: 3, speed: 0.07, cAtk: 7, cDef: 3.5 },
      nextClasses: [],
      transferQuest: null,
      primary: ['MEN', 'WIT']
    },

    protocol_prophet: {
      id: 'protocol_prophet',
      name: 'Диспетчер Протоколов',
      nameEn: 'Protocol Dispatcher',
      tier: 2,
      levelReq: 40,
      path: 'tech',
      pathSubtitle: 'тактические протоколы',
      parentClass: 'technomancer',
      description:
        'Тактический диспетчер. Раздает боевые протоколы, кардинально повышающие характеристики группы и дезориентирующие противника.',
      lore:
        'Диспетчеры носят планшеты из воронёной стали. Их речь коротка: «Протокол три. Клапан влево. Не спорить».',
      role: 'buffer',
      icon: 'assets/classes/protocol_prophet.webp',
      primaryBase: C1_MYSTIC_PRIMARY,
      primaryGrowth: null,
      baseStats: { hp: 560, energy: 330, attack: 32, defense: 36, speed: 7.6, critRate: 11, cAtk: 95, cDef: 65 },
      growthPerLevel: { hp: 26, energy: 17, attack: 2, defense: 2.8, speed: 0.08, cAtk: 6.5, cDef: 3.2 },
      nextClasses: [],
      transferQuest: null,
      primary: ['WIT', 'MEN']
    }
  };

  // ─── Helpers ───
  function getClass(id) {
    if (!id) return null;
    return CLASS_TREE[String(id).toLowerCase()] || null;
  }

  function getClassName(id) {
    var c = getClass(id);
    return c ? c.name : '—';
  }

  function getPathMeta(path) {
    if (path === 'tech' || path === 'mystic') return PATH_META.tech;
    return PATH_META.fighter;
  }

  /** Строка пути для UI (без внешних ссылок). */
  function pathLabel(classIdOrData) {
    var c = typeof classIdOrData === 'string' ? getClass(classIdOrData) : classIdOrData;
    if (!c) return '';
    var meta = getPathMeta(c.path);
    var sub = c.pathSubtitle || meta.subtitle;
    return meta.name + ' · ' + sub;
  }

  function isBaseClass(id) {
    var c = getClass(id);
    return !!(c && c.tier === 0);
  }

  function isValidBaseClass(id) {
    return BASE_CLASS_IDS.indexOf(String(id || '').toLowerCase()) !== -1;
  }

  function isValidRace(id) {
    return !!RACES[String(id || '').toLowerCase()];
  }

  function isValidGender(id) {
    return !!GENDERS[String(id || '').toLowerCase()];
  }

  function normalizeRace(id) {
    var r = String(id || 'human').toLowerCase();
    return isValidRace(r) ? r : 'human';
  }

  function normalizeGender(id) {
    var g = String(id || 'male').toLowerCase();
    return isValidGender(g) ? g : 'male';
  }

  function normalizeBaseClass(id) {
    var c = String(id || 'operator').toLowerCase();
    return isValidBaseClass(c) ? c : 'operator';
  }

  function canTransfer(fromId, toId, level) {
    var from = getClass(fromId);
    var to = getClass(toId);
    if (!from || !to) return false;
    if (to.parentClass !== from.id) return false;
    if (from.nextClasses.indexOf(to.id) === -1) return false;
    if (level < to.levelReq) return false;
    return true;
  }

  function availableTransfers(classId, level) {
    var c = getClass(classId);
    if (!c || !c.nextClasses || !c.nextClasses.length) return [];
    return c.nextClasses
      .map(getClass)
      .filter(function (n) { return n && level >= n.levelReq; });
  }

  /**
   * Ролевые множители — C1: все 1.0.
   * Разница классов = primary + templateBase (pAtk/pDef/mAtk/mDef) + vitalsTable, не «role DPS mult».
   * (Пассивки Weapon/Armor Mastery дают flat/%% отдельно.)
   */
  var ROLE_ONE = { pAtk: 1, pDef: 1, cAtk: 1, cDef: 1, maxHp: 1, maxEnergy: 1 };
  var ROLE_COMBAT_MULT = {
    hybrid: ROLE_ONE, tank: ROLE_ONE, melee_dd: ROLE_ONE, ranged_dd: ROLE_ONE,
    aoe_dd: ROLE_ONE, aoe_ranged: ROLE_ONE, support: ROLE_ONE,
    circuit: ROLE_ONE, circuit_dd: ROLE_ONE, circuit_aoe: ROLE_ONE,
    summoner: ROLE_ONE, dot_circuit: ROLE_ONE, healer: ROLE_ONE, buffer: ROLE_ONE
  };

  /** Базовые шаблоны боевых параметров (Fighter / Tech Mage) */
  var TEMPLATE_BASE_FIGHTER = { pAtk: 4, pDef: 56, mAtk: 6, mDef: 41, runSpd: 115, walkSpd: 78 };
  var TEMPLATE_BASE_MAGE    = { pAtk: 3, pDef: 35, mAtk: 6, mDef: 41, runSpd: 121, walkSpd: 78 };
  var ACIS_BASE_FIGHTER     = TEMPLATE_BASE_FIGHTER;
  var ACIS_BASE_MAGE        = TEMPLATE_BASE_MAGE;

  function getTemplateBase(classIdOrData) {
    var c = typeof classIdOrData === 'string' ? getClass(classIdOrData) : classIdOrData;
    // ALWAYS return immutable templates.
    if (c && c.path === 'tech') return TEMPLATE_BASE_MAGE;
    return TEMPLATE_BASE_FIGHTER;
  }
  var getAcisBase = getTemplateBase;

  /**
   * Таблицы здоровья/энергии по классам (C1 канон).
   * fighter | warrior | knight | rogue | mage | wizard | cleric
   */
  var VITALS_TABLE_BY_CLASS = {
    operator: 'fighter',
    mechanic: 'knight',
    repair_engineer: 'knight',
    boiler_guardian: 'knight',
    destroyer: 'warrior',
    demolitionist: 'warrior',
    steam_berserker: 'warrior',
    gunner: 'rogue',
    pneumatic_sniper: 'rogue',
    artillery_engineer: 'rogue',
    engineer: 'mage',
    constructor: 'wizard',
    pressure_sorcerer: 'wizard',
    machine_warlock: 'wizard',
    circuit_necro: 'wizard',
    technomancer: 'cleric',
    overhaul_master: 'cleric',
    protocol_prophet: 'cleric'
  };

  function vitalsTableKey(classId) {
    var id = String(classId || '').toLowerCase();
    if (VITALS_TABLE_BY_CLASS[id]) return VITALS_TABLE_BY_CLASS[id];
    var c = getClass(id);
    if (c && c.path === 'tech') return 'mage';
    return 'fighter';
  }

  function getCombatMult(classData) {
    if (classData && classData.combatMult) return classData.combatMult;
    var role = (classData && classData.role) || 'hybrid';
    return ROLE_COMBAT_MULT[role] || ROLE_COMBAT_MULT.hybrid;
  }

  /** Подтянуть L2_COMBAT если доступен (Node require / browser global). */
  function getL2() {
    try {
      if (typeof require !== 'undefined') {
        return require('./l2-combat.js');
      }
    } catch (e) { /* browser */ }
    var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
    return (g && g.L2_COMBAT) || null;
  }

  /**
   * Primary (STR/DEX/CON/INT/WIT/MEN) — C1 identity.
   * В C1 базовые статы фиксированы по стартовой линии (Human Fighter / Human Mystic)
   * и НЕ растут с уровнем; меняются только от экипа/баффов (bonusPrimary).
   * Таблица HP/MP профессии (vitalsTable) растёт с уровнем отдельно.
   */
  function primaryAtLevel(classId, level, bonusPrimary) {
    var c = getClass(classId);
    if (!c) c = CLASS_TREE.operator;
    var b = c.primaryBase || (c.path === 'tech' ? C1_MYSTIC_PRIMARY : C1_FIGHTER_PRIMARY);
    var bonus = bonusPrimary || {};
    function f(k) {
      return Math.floor((b[k] || 20) + (bonus[k] || 0));
    }
    return { STR: f('STR'), DEX: f('DEX'), CON: f('CON'), INT: f('INT'), WIT: f('WIT'), MEN: f('MEN') };
  }

  /**
   * Полный боевой пакет от PRIMARY + роль класса + опциональный gear.
   * gear: { weaponAtk, armorDef, toolAtk, armorCDef, primary, speedBonus, critBonus }
   *
   * КАЖДЫЙ primary влияет:
   *  STR → P.Atk, P.Def(частично)
   *  DEX → Accuracy, Evasion, Crit%, AtkSpeed, moveSpeed
   *  CON → MaxHP, P.Def
   *  INT → C.Atk, C.Def (частично, ×0.12)
   *  WIT → Casting Spd, magic crit (weak)
   *  MEN → MaxEnergy, C.Def, MP regen
   *
   * gear.spellPct: 0 bare | 1.0 Spellcraft (+100% cast) when robe+passive active.
   * gear.setPct: e.g. 0.15 Devotion. Applied only with spellPct > 0.
   */
  function statsAtLevel(classId, level, gear) {
    gear = gear || {};
    var c = getClass(classId);
    if (!c) c = CLASS_TREE.operator;
    var lv = Math.max(1, Math.min(40, level | 0));
    var primary = primaryAtLevel(classId, lv, gear.primary);
    var mult = getCombatMult(c);
    var L2 = getL2();

    var weaponAtk = +gear.weaponAtk || 0;
    var armorDef = +gear.armorDef || 0;
    var toolAtk = +gear.toolAtk || 0;
    var armorCDef = +gear.armorCDef || 0;

    var pAtk, pDef, cAtk, cDef, maxHp, maxEnergy, accuracy, evasion, critRate;

    // C1 bare Casting Spd: Floor(183×WIT_mod) → 166 @ WIT20. Spellcraft is NOT free.
    var castingSpd = 166;
    var castingSpdBare = 166;
    var castingSpdSpellcraft = 333;
    var spellPct = gear.spellPct != null ? +gear.spellPct
      : (gear.spellcraft === true || gear.hasSpellcraft === true ? 1.0 : 0);
    var setPct = gear.setPct != null ? +gear.setPct : 0;
    if (spellPct <= 0) setPct = 0;

    // C1: fists base 217 × DEX_Mod → 242 @ DEX21 (weapon replaces base, not +N)
    var weaponClass = gear.weaponClass || 'fist';
    var weaponAtkBase = gear.weaponAtkBase != null ? gear.weaponAtkBase : null;
    var atkSpdL2Val = 242;
    var speedL2 = 121;

    // Таблица hpTable/mpTable (C1) + template base combat
    var tableKey = vitalsTableKey(c.id);
    var tmpl = getTemplateBase(c);

    var nakedP = +gear.nakedPDefSub || 0;
    var nakedM = +gear.nakedMDefSub || 0;

    if (L2) {
      // Расчет PAtk/PDef/CAtk/CDef: база шаблона; броня = экип − «голые» слоты
      pAtk = L2.pAtkFromStats(primary.STR, lv, weaponAtk, mult.pAtk, tmpl.pAtk);
      pDef = L2.pDefFromStats(primary.CON, primary.STR, lv, armorDef, mult.pDef, tmpl.pDef, nakedP);
      cAtk = L2.cAtkFromStats(primary.INT, lv, toolAtk, mult.cAtk, tmpl.mAtk);
      cDef = L2.cDefFromStats(primary.MEN, primary.INT, lv, armorCDef, mult.cDef, tmpl.mDef, nakedM);
      // Max HP/MP: floor(table[lv] × CON/MEN_bonus)
      maxHp = L2.maxHpFromStats(primary.CON, lv, 1, tableKey);
      maxEnergy = L2.maxEnergyFromStats(primary.MEN, lv, 1, tableKey);
      accuracy = L2.accuracyFromStats(primary.DEX, lv, gear.accuracyBonus || 0);
      evasion = L2.evasionFromStats(primary.DEX, lv, gear.evasionBonus || 0);
      critRate = L2.critChancePct(primary.DEX, lv, gear.critBonus || 0, weaponClass);
      castingSpdBare = L2.mAtkSpd(primary.WIT, 0, 0);
      castingSpdSpellcraft = L2.mAtkSpd(primary.WIT, 1.0, setPct > 0 ? setPct : 0);
      castingSpd = L2.mAtkSpd(primary.WIT, spellPct, setPct);
      if (L2.atkSpdL2) {
        atkSpdL2Val = L2.atkSpdL2(weaponAtkBase != null ? weaponAtkBase : weaponClass, primary.DEX, 1.0);
      } else {
        atkSpdL2Val = Math.floor(217 * (L2.statMod ? L2.statMod(primary.DEX, 'DEX') : 1.115));
      }
      speedL2 = L2.runSpeedL2 ? L2.runSpeedL2(primary.DEX) : 121;
    } else {
      pAtk = Math.floor((primary.STR * 0.45 + lv * 1.6 + weaponAtk) * mult.pAtk);
      pDef = Math.floor((primary.CON * 0.35 + primary.STR * 0.12 + lv * 1.1 + armorDef) * mult.pDef);
      cAtk = Math.floor((2.2 + primary.INT * 0.17 + lv * 1.05 + toolAtk) * mult.cAtk);
      cDef = Math.floor((10 + primary.MEN * 0.55 + primary.INT * 0.12 + lv * 1.15 + armorCDef) * mult.cDef);
      // fallback approx C1 table×bonus without L2 module
      var baseHp = tableKey === 'mage' || tableKey === 'wizard' || tableKey === 'cleric' ? 101 + (lv - 1) * 16.5 : 80 + (lv - 1) * 13.5;
      var baseMp = tableKey === 'mage' || tableKey === 'wizard' || tableKey === 'cleric' ? 40 + (lv - 1) * 8 : 30 + (lv - 1) * 6;
      maxHp = Math.max(1, Math.floor(baseHp * (0.98 + (primary.CON - 27) * 0.03)));
      maxEnergy = Math.max(1, Math.floor(baseMp * (1.0 + (primary.MEN - 20) * 0.01)));
      accuracy = Math.floor(Math.sqrt(primary.DEX) * 6) + lv;
      evasion = Math.floor(Math.sqrt(primary.DEX) * 6) + lv;
      critRate = Math.floor(40 * Math.pow(1.009, primary.DEX - 8.826)) + (+gear.critBonus || 0);
      castingSpdBare = 166;
      castingSpdSpellcraft = 333;
      castingSpd = spellPct > 0 ? Math.round(166 * (1 + spellPct) * (1 + setPct)) : 166;
    }

    // World moveSpeed: L2 Speed 121 → ~7.5 game units (÷16)
    var speed = speedL2 / 16 + (+gear.speedBonus || 0);
    // Normalized mult: Atk.Spd/333 (dagger ~1.0 @ DEX21)
    var atkSpeed = atkSpdL2Val / 333;
    // chargeSpeed mult = Casting_Spd / 333 (UI)
    var chargeSpeed = castingSpd / 333;
    if (L2 && L2.attackSpeed && !L2.atkSpdL2) {
      atkSpeed = L2.attackSpeed(weaponClass, primary.DEX, 1.0);
    }

    return {
      maxHp: maxHp,
      maxEnergy: maxEnergy,
      pAtk: pAtk,
      pDef: pDef,
      cAtk: cAtk,
      cDef: cDef,
      mAtk: cAtk,
      mDef: cDef,
      speed: speed,
      speedL2: speedL2,
      critRate: critRate,
      primary: primary,
      accuracy: accuracy,
      evasion: evasion,
      atkSpeed: atkSpeed,
      atkSpdL2: atkSpdL2Val,
      weaponClass: weaponClass,
      chargeSpeed: chargeSpeed,
      castingSpd: castingSpd,
      castingSpdBare: castingSpdBare,
      castingSpdSpellcraft: castingSpdSpellcraft,
      spellPct: spellPct,
      baseHpReg: c.baseHpReg != null ? c.baseHpReg : 1.5,
      baseMpReg: c.baseMpReg != null ? c.baseMpReg : 0.9,
      vitalsTable: tableKey,
      templateBase: tmpl,
      acisBase: tmpl,
      combatMult: mult,
      level: lv,
      classId: c.id
    };
  }

  /**
   * Пересчитать устаревшие baseStats / growthPerLevel из живых L2-формул.
   * UI/чар-селект, которые ещё читают baseStats, видят правду.
   */
  function syncLegacyDisplayStats() {
    var ids = Object.keys(CLASS_TREE);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var c = CLASS_TREE[id];
      if (!c) continue;
      var lv0 = Math.max(1, c.levelReq || 1);
      var lv1 = Math.min(40, lv0 + 10);
      var s0 = statsAtLevel(id, lv0);
      var s1 = statsAtLevel(id, lv1);
      var n = Math.max(1, lv1 - lv0);
      c.baseStats = {
        hp: s0.maxHp,
        energy: s0.maxEnergy,
        attack: s0.pAtk,
        defense: s0.pDef,
        speed: Math.round(s0.speed * 10) / 10,
        critRate: s0.critRate,
        cAtk: s0.cAtk,
        cDef: s0.cDef
      };
      c.growthPerLevel = {
        hp: Math.round(((s1.maxHp - s0.maxHp) / n) * 10) / 10,
        energy: Math.round(((s1.maxEnergy - s0.maxEnergy) / n) * 10) / 10,
        attack: Math.round(((s1.pAtk - s0.pAtk) / n) * 100) / 100,
        defense: Math.round(((s1.pDef - s0.pDef) / n) * 100) / 100,
        speed: Math.round(((s1.speed - s0.speed) / n) * 1000) / 1000,
        cAtk: Math.round(((s1.cAtk - s0.cAtk) / n) * 100) / 100,
        cDef: Math.round(((s1.cDef - s0.cDef) / n) * 100) / 100
      };
      // Keep c.templateBase / c.acisBase as immutable template (pAtk 3/4, pDef 54/80…) — do NOT write computed stats.
      // Display combat values live in baseStats above.
    }
    return true;
  }
  // fill once at load (L2 may be available via require)
  try { syncLegacyDisplayStats(); } catch (eSync) { /* L2 not ready yet */ }

  function baseClassForPath(path) {
    if (path === 'tech' || path === 'mystic') return 'engineer';
    return 'operator';
  }

  function classLineage(classId) {
    var out = [];
    var cur = getClass(classId);
    while (cur) {
      out.unshift(cur.id);
      cur = cur.parentClass ? getClass(cur.parentClass) : null;
    }
    return out;
  }

  function rootClass(classId) {
    var line = classLineage(classId);
    return line[0] || 'operator';
  }

  function listBaseClasses() {
    return BASE_CLASS_IDS.map(getClass).filter(Boolean);
  }

  function listRaces() {
    return Object.keys(RACES).map(function (k) { return RACES[k]; });
  }

  function listGenders() {
    return Object.keys(GENDERS).map(function (k) { return GENDERS[k]; });
  }

  function validateCreate(opts) {
    opts = opts || {};
    var errors = [];
    var name = String(opts.name || '').trim();
    if (name.length < 2) errors.push('name_short');
    if (name.length > 16) errors.push('name_long');
    if (name && !/^[\w\u0400-\u04FF\- ]+$/i.test(name)) errors.push('name_invalid');

    var race = normalizeRace(opts.race);
    var gender = normalizeGender(opts.gender);
    var cls = normalizeBaseClass(opts.cls || opts.classId);

    if (!isValidRace(opts.race || 'human')) errors.push('race_invalid');
    if (!isValidGender(opts.gender || 'male')) errors.push('gender_invalid');
    if (!isValidBaseClass(opts.cls || opts.classId || 'operator')) errors.push('class_invalid');

    var raceData = RACES[race];
    if (raceData && raceData.genders.indexOf(gender) === -1) errors.push('gender_not_for_race');
    if (raceData && raceData.baseClasses.indexOf(cls) === -1) errors.push('class_not_for_race');

    return {
      ok: errors.length === 0,
      errors: errors,
      name: name,
      race: race,
      gender: gender,
      cls: cls
    };
  }

  function createIdentity(opts) {
    var v = validateCreate(opts);
    var cls = v.cls;
    var stats = statsAtLevel(cls, 1);
    return {
      name: v.name || 'Operator',
      race: v.race,
      gender: v.gender,
      cls: cls,
      classTier: 0,
      classHistory: [cls],
      level: 1,
      exp: 0,
      sp: 0,
      maxHp: stats.maxHp,
      hp: stats.maxHp,
      maxEnergy: stats.maxEnergy,
      energy: stats.maxEnergy,
      pAtk: stats.pAtk,
      pDef: stats.pDef,
      cAtk: stats.cAtk,
      cDef: stats.cDef,
      mAtk: stats.cAtk,
      mDef: stats.cDef,
      accuracy: stats.accuracy,
      evasion: stats.evasion,
      primary: stats.primary
    };
  }

  function formatTreeText() {
    var lines = [];
    function walk(id, prefix, isLast) {
      var c = getClass(id);
      if (!c) return;
      var branch = prefix + (isLast ? '└── ' : '├── ');
      var range = c.tier === 0 ? '(1–19)' : (c.tier === 1 ? '(20–39)' : '(40)');
      var role = c.pathSubtitle ? ' — ' + c.pathSubtitle : '';
      lines.push((c.tier === 0 ? '' : branch) + (c.tier === 0 ? c.name + ' ' + range : c.name + ' ' + range) + role);
      var kids = c.nextClasses || [];
      for (var i = 0; i < kids.length; i++) {
        walk(kids[i], c.tier === 0 ? '' : prefix + (isLast ? '    ' : '│   '), i === kids.length - 1);
      }
    }
    lines.push('=== СИЛОВАЯ ЛИНИЯ (Оператор) ===');
    walk('operator', '', true);
    lines.push('');
    lines.push('=== КОНТУРНАЯ ЛИНИЯ (Инженер) ===');
    walk('engineer', '', true);
    return lines.join('\n');
  }

  return {
    RACES: RACES,
    GENDERS: GENDERS,
    BASE_CLASS_IDS: BASE_CLASS_IDS,
    PATH_META: PATH_META,
    CLASS_TREE: CLASS_TREE,
    ROLE_COMBAT_MULT: ROLE_COMBAT_MULT,
    getClass: getClass,
    getClassName: getClassName,
    getPathMeta: getPathMeta,
    pathLabel: pathLabel,
    getCombatMult: getCombatMult,
    getTemplateBase: getTemplateBase,
    getAcisBase: getAcisBase,
    vitalsTableKey: vitalsTableKey,
    VITALS_TABLE_BY_CLASS: VITALS_TABLE_BY_CLASS,
    TEMPLATE_BASE_FIGHTER: TEMPLATE_BASE_FIGHTER,
    TEMPLATE_BASE_MAGE: TEMPLATE_BASE_MAGE,
    ACIS_BASE_FIGHTER: ACIS_BASE_FIGHTER,
    ACIS_BASE_MAGE: ACIS_BASE_MAGE,
    isBaseClass: isBaseClass,
    isValidBaseClass: isValidBaseClass,
    isValidRace: isValidRace,
    isValidGender: isValidGender,
    normalizeRace: normalizeRace,
    normalizeGender: normalizeGender,
    normalizeBaseClass: normalizeBaseClass,
    canTransfer: canTransfer,
    availableTransfers: availableTransfers,
    primaryAtLevel: primaryAtLevel,
    statsAtLevel: statsAtLevel,
    syncLegacyDisplayStats: syncLegacyDisplayStats,
    baseClassForPath: baseClassForPath,
    classLineage: classLineage,
    rootClass: rootClass,
    listBaseClasses: listBaseClasses,
    listRaces: listRaces,
    listGenders: listGenders,
    validateCreate: validateCreate,
    createIdentity: createIdentity,
    formatTreeText: formatTreeText,
    C1_FIGHTER_PRIMARY: C1_FIGHTER_PRIMARY,
    C1_MYSTIC_PRIMARY: C1_MYSTIC_PRIMARY
  };
});
