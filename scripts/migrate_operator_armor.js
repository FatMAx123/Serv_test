// scripts/migrate_operator_armor.js
// Automates the integration of the Operator Armor ladder (1-20 lvl, No-Grade & Low D)
// across shared/item-db.js, client/js/inventory.js, and creates data/operator_armor_db.json & data/operator_sets_db.json.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const OPERATOR_ITEMS = {
  // ─── 1. Комплект «Клёпаный Каркас» (L2: Wooden Set, No-Grade, 1 ур.) ───
  wooden_breastplate: {
    id: "wooden_breastplate",
    name: "Клёпаный Нагрудник Каркаса",
    l2Name: "Wooden Breastplate",
    type: "armor",
    slot: "chest",
    grade: "no_grade",
    icon: "assets/inventar/icons/wooden_breastplate.webp",
    price: 1200,
    weight: 2200,
    description: "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Стартовый защитный панцирь оператора из армированного текстолита и стальных пластин на медных заклепках.",
    defense: 33,
    armorType: "heavy",
    setId: "wooden",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 1,
    crystalCount: 0
  },
  wooden_gaiters: {
    id: "wooden_gaiters",
    name: "Клёпаные Поножи Каркаса",
    l2Name: "Wooden Gaiters",
    type: "armor",
    slot: "legs",
    grade: "no_grade",
    icon: "assets/inventar/icons/wooden_gaiters.webp",
    price: 750,
    weight: 1400,
    description: "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Поножи из прочного прессованного текстолита с шарнирами на коленях.",
    defense: 21,
    armorType: "heavy",
    setId: "wooden",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 1,
    crystalCount: 0
  },
  wooden_helmet: {
    id: "wooden_helmet",
    name: "Клёпаный Подшлемник",
    l2Name: "Wooden Helmet",
    type: "armor",
    slot: "head",
    grade: "no_grade",
    icon: "assets/inventar/icons/wooden_helmet.webp",
    price: 500,
    weight: 600,
    description: "Легкий защитный шлем оператора из многослойного термостойкого каркаса.",
    defense: 12,
    armorType: "heavy",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 1,
    crystalCount: 0
  },

  // ─── 2. Комплект «Кожаная Броня» (L2: Leather Set, Light, No-Grade, 5 ур.) ───
  leather_armor: {
    id: "leather_armor",
    name: "Кожаная Кираса Механика",
    l2Name: "Leather Armor",
    type: "armor",
    slot: "chest",
    grade: "no_grade",
    icon: "assets/inventar/icons/leather_armor.webp",
    price: 3800,
    weight: 2800,
    description: "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Усиленная куртка из плотной дубленой кожи с наплечниками.",
    defense: 38,
    armorType: "light",
    setId: "leather",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 5,
    crystalCount: 0
  },
  leather_pants: {
    id: "leather_pants",
    name: "Кожаные Штаны Механика",
    l2Name: "Leather Gaiters",
    type: "armor",
    slot: "legs",
    grade: "no_grade",
    icon: "assets/inventar/icons/leather_pants.webp",
    price: 2400,
    weight: 1800,
    description: "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Удобные рабочие штаны с защитными накладками для высокой маневренности.",
    defense: 24,
    armorType: "light",
    setId: "leather",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 5,
    crystalCount: 0
  },

  // ─── 3. Комплект «Медная Кольчуга» (L2: Bronze Set, Heavy, No-Grade, 10 ур.) ───
  copper_chainmail_gaiters: {
    id: "copper_chainmail_gaiters",
    name: "Медные Кольчужные Поножи",
    l2Name: "Bronze Gaiters",
    type: "armor",
    slot: "legs",
    grade: "no_grade",
    icon: "assets/inventar/icons/copper_chainmail_gaiters.webp",
    price: 5500,
    weight: 2600,
    description: "Сет «Медная Кольчуга» (2): Физ. Защита +5.26%, HP +50. Кольчужные набедренники из сплетенных медных звеньев.",
    defense: 29,
    armorType: "heavy",
    setId: "bronze_ng",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 10,
    crystalCount: 0
  },
  iron_helmet: {
    id: "iron_helmet",
    name: "Железный Шлем Оператора",
    l2Name: "Iron Helmet",
    type: "armor",
    slot: "head",
    grade: "no_grade",
    icon: "assets/inventar/icons/iron_helmet.webp",
    price: 7000,
    weight: 800,
    description: "Литой железный шлем с лицевым забралом и вентиляционными щелями.",
    defense: 20,
    armorType: "heavy",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 10,
    crystalCount: 0
  },

  // ─── 4. Комплект «Карбоновый Каркас» (L2: Bone Set, Light, Top No-Grade, 15 ур.) ───
  bone_breastplate: {
    id: "bone_breastplate",
    name: "Карбоновый Нагрудник Свалки",
    l2Name: "Bone Breastplate",
    type: "armor",
    slot: "chest",
    grade: "no_grade",
    icon: "assets/inventar/icons/bone_breastplate.webp",
    price: 15000,
    weight: 3400,
    description: "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Легкий композитный нагрудник из термически обработанного углеволокна и броневых сегментов автоматонов.",
    defense: 52,
    armorType: "light",
    setId: "bone",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },
  bone_gaiters: {
    id: "bone_gaiters",
    name: "Карбоновые Набедренники Свалки",
    l2Name: "Bone Gaiters",
    type: "armor",
    slot: "legs",
    grade: "no_grade",
    icon: "assets/inventar/icons/bone_gaiters.webp",
    price: 9500,
    weight: 2200,
    description: "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Композитные набедренники с шарнирными щитками для защиты суставов.",
    defense: 32,
    armorType: "light",
    setId: "bone",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },

  // ─── 5. Комплект «Звеньевой Доспех» (L2: Ring Mail Set, Heavy, Top No-Grade, 15 ур.) ───
  ring_mail_breastplate: {
    id: "ring_mail_breastplate",
    name: "Звеньевой Панцирь Цеховика",
    l2Name: "Ring Mail Breastplate",
    type: "armor",
    slot: "chest",
    grade: "no_grade",
    icon: "assets/inventar/icons/ring_mail_breastplate.webp",
    price: 18000,
    weight: 5200,
    description: "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Тяжелый панцирь двойного кольчатого плетения с накладными титановыми пластинами.",
    defense: 58,
    armorType: "heavy",
    setId: "ring_mail",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },
  ring_mail_gaiters: {
    id: "ring_mail_gaiters",
    name: "Звеньевые Поножи Цеховика",
    l2Name: "Ring Mail Gaiters",
    type: "armor",
    slot: "legs",
    grade: "no_grade",
    icon: "assets/inventar/icons/ring_mail_gaiters.webp",
    price: 11500,
    weight: 3200,
    description: "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Массивные кольчатые поножи для защиты ног оператора при тяжелых столкновениях.",
    defense: 36,
    armorType: "heavy",
    setId: "ring_mail",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },
  ring_mail_boots: {
    id: "ring_mail_boots",
    name: "Звеньевые Сапоги",
    l2Name: "Ring Mail Boots",
    type: "armor",
    slot: "boots",
    grade: "no_grade",
    icon: "assets/inventar/icons/ring_mail_boots.webp",
    price: 8000,
    weight: 1400,
    description: "Сет «Звеньевой Доспех» (3): часть полного комплекта звеньевой брони. Кованые сапоги со стальными носками и звеньевой защитой подъема.",
    defense: 16,
    armorType: "heavy",
    setId: "ring_mail",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },
  ring_mail_gloves: {
    id: "ring_mail_gloves",
    name: "Звеньевые Перчатки",
    l2Name: "Ring Mail Gloves",
    type: "armor",
    slot: "gloves",
    grade: "no_grade",
    icon: "assets/inventar/icons/ring_mail_gloves.webp",
    price: 5000,
    weight: 140,
    description: "Плотные перчатки с кольчатой накладкой на пальцах и тыльной стороне ладони.",
    defense: 12,
    armorType: "heavy",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 15,
    crystalCount: 0
  },

  // ─── 6. Комплект «Усиленная Кожа» (L2: Reinforced Leather Set, Light, Low D, 20 ур.) ───
  reinforced_leather_shirt: {
    id: "reinforced_leather_shirt",
    name: "Усиленная Кожаная Куртка",
    l2Name: "Reinforced Leather Shirt",
    type: "armor",
    slot: "chest",
    grade: "d",
    icon: "assets/inventar/icons/reinforced_leather_shirt.webp",
    price: 40000,
    weight: 3200,
    description: "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Первоклассная куртка из дубленой кожи с титановым кордом и демпферами отдачи для стрелков.",
    defense: 71,
    armorType: "light",
    setId: "reinforced_leather",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 80
  },
  reinforced_leather_gaiters: {
    id: "reinforced_leather_gaiters",
    name: "Усиленные Кожаные Штаны",
    l2Name: "Reinforced Leather Gaiters",
    type: "armor",
    slot: "legs",
    grade: "d",
    icon: "assets/inventar/icons/reinforced_leather_gaiters.webp",
    price: 25000,
    weight: 2000,
    description: "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Прочные эластичные штаны с титановыми наколенниками.",
    defense: 44,
    armorType: "light",
    setId: "reinforced_leather",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 50
  },
  reinforced_leather_boots: {
    id: "reinforced_leather_boots",
    name: "Усиленные Сапоги",
    l2Name: "Reinforced Leather Boots",
    type: "armor",
    slot: "boots",
    grade: "d",
    icon: "assets/inventar/icons/reinforced_leather_boots.webp",
    price: 16000,
    weight: 1200,
    description: "Сет «Усиленная Кожа» (3): часть комплекта усиленной кожи. Легкие сапоги охотника на автоматонов с амортизирующей подошвой.",
    defense: 25,
    armorType: "light",
    setId: "reinforced_leather",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 32
  },

  // ─── 7. Комплект «Чешуйчатый Доспех» (L2: Scale Mail Set, Heavy, Low D, 20 ур.) ───
  scale_mail_breastplate: {
    id: "scale_mail_breastplate",
    name: "Чешуйчатая Кираса Регулятора",
    l2Name: "Scale Mail",
    type: "armor",
    slot: "chest",
    grade: "d",
    icon: "assets/inventar/icons/scale_mail_breastplate.webp",
    price: 42000,
    weight: 5800,
    description: "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Тяжелая штампованная кираса D-ранга из наборных пластин легированной стали с нахлестом.",
    defense: 81,
    armorType: "heavy",
    setId: "scale_mail",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 84
  },
  scale_mail_gaiters: {
    id: "scale_mail_gaiters",
    name: "Чешуйчатые Поножи Регулятора",
    l2Name: "Scale Mail Gaiters",
    type: "armor",
    slot: "legs",
    grade: "d",
    icon: "assets/inventar/icons/scale_mail_gaiters.webp",
    price: 26000,
    weight: 3600,
    description: "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Наборные поножи из закаленной чешуйчатой брони.",
    defense: 50,
    armorType: "heavy",
    setId: "scale_mail",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 52
  },
  scale_mail_shield: {
    id: "scale_mail_shield",
    name: "Чешуйчатый Щит Регулятора",
    l2Name: "Scale Mail Shield",
    type: "armor",
    slot: "shield",
    grade: "d",
    icon: "assets/inventar/icons/scale_mail_shield.webp",
    price: 18000,
    weight: 1200,
    description: "Массивный чешуйчатый щит D-ранга для блокирования атак тяжелых автоматонов.",
    defense: 75,
    armorType: "heavy",
    blockRate: 20,
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 36
  },
  operator_gauntlets_low: {
    id: "operator_gauntlets_low",
    name: "Тяжелые Рукавицы Оператора",
    l2Name: "Gauntlets",
    type: "armor",
    slot: "gloves",
    grade: "d",
    icon: "assets/inventar/icons/operator_gauntlets_low.webp",
    price: 18000,
    weight: 180,
    description: "Латные боевые рукавицы Low D ранга с шарнирными пластинами на фалангах пальцев.",
    defense: 22,
    armorType: "heavy",
    isOperatorArmor: true,
    isLivePhase1: true,
    levelReq: 20,
    crystalCount: 36
  }
};

const OPERATOR_SETS_CONFIG = {
  wooden: {
    id: 'wooden',
    name: 'Комплект «Клёпаный Каркас»',
    l2Ref: 'Wooden Set',
    grade: 'no_grade',
    gradeLabel: 'No-Grade',
    levelReq: 1,
    requiredPieces: 2,
    pieces: [
      { id: 'wooden_breastplate', name: 'Клёпаный Нагрудник Каркаса', slot: 'chest', slotLabel: 'Верх (Тело)', def: 33, weight: 2200, price: 1200 },
      { id: 'wooden_gaiters', name: 'Клёпаные Поножи Каркаса', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 21, weight: 1400, price: 750 }
    ],
    optionalPieces: [
      { id: 'wooden_helmet', name: 'Клёпаный Подшлемник', slot: 'head', slotLabel: 'Голова', def: 12, weight: 600, price: 500 }
    ],
    bonus: { pDefPercent: 0.0526, hpFlat: 41 },
    bonusBadge: '🛡️ +5.26% Физ. Защита (P.Def) | ❤️ +41 HP',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и добавляет +41 к максимальному запасу здоровья.',
    lore: 'Базовый защитный каркас из армированного текстолита и стальных пластин на медных заклепках. Предохраняет начинающего оператора от кинетических контузий при столкновении с тяжелыми механизмами.',
    tacticalRole: 'Стартовый комплект оператора для уверенного освоения ближнего боя и выживания в начальных локациях (1–10 ур.).'
  },
  leather: {
    id: 'leather',
    name: 'Комплект «Кожаная Броня»',
    l2Ref: 'Leather Set',
    grade: 'no_grade',
    gradeLabel: 'No-Grade',
    levelReq: 5,
    requiredPieces: 2,
    pieces: [
      { id: 'leather_armor', name: 'Кожаная Кираса Механика', slot: 'chest', slotLabel: 'Верх (Тело)', def: 38, weight: 2800, price: 3800 },
      { id: 'leather_pants', name: 'Кожаные Штаны Механика', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 24, weight: 1800, price: 2400 }
    ],
    bonus: { pDefPercent: 0.0526 },
    bonusBadge: '🛡️ +5.26% Физ. Защита (P.Def) | 💨 Высокая Подвижность',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% без штрафов к скорости перемещения и перегрузу.',
    lore: 'Костюм из толстой огнеупорной дубленой кожи, усиленный защитными наплечниками. Обеспечивает гибкость при обращении с луком и кинжалом.',
    tacticalRole: 'Легкий комплект для мобильного стрелкового боя и быстрого перемещения между цехами.'
  },
  bronze_ng: {
    id: 'bronze_ng',
    name: 'Комплект «Медная Кольчуга»',
    l2Ref: 'Bronze / Iron Set',
    grade: 'no_grade',
    gradeLabel: 'No-Grade',
    levelReq: 10,
    requiredPieces: 2,
    pieces: [
      { id: 'copper_chainmail', name: 'Медная Кольчуга', slot: 'chest', slotLabel: 'Верх (Тело)', def: 47, weight: 4200, price: 8500 },
      { id: 'copper_chainmail_gaiters', name: 'Медные Кольчужные Поножи', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 29, weight: 2600, price: 5500 }
    ],
    bonus: { pDefPercent: 0.0526, hpFlat: 50 },
    bonusBadge: '🛡️ +5.26% Физ. Защита (P.Def) | ❤️ +50 HP',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и увеличивает запас здоровья на +50 HP.',
    lore: 'Плотное кольчужное плетение из медных и стальных колец. Надежно отводит кинетическую энергию ударов молотов и тяжелых манипуляторов.',
    tacticalRole: 'Тяжелый комплект средней стадии прокачки для танкования опасных автоматонов.'
  },
  bone: {
    id: 'bone',
    name: 'Комплект «Карбоновый Каркас»',
    l2Ref: 'Bone Set',
    grade: 'no_grade',
    gradeLabel: 'No-Grade',
    levelReq: 15,
    requiredPieces: 2,
    pieces: [
      { id: 'bone_breastplate', name: 'Карбоновый Нагрудник Свалки', slot: 'chest', slotLabel: 'Верх (Тело)', def: 52, weight: 3400, price: 15000 },
      { id: 'bone_gaiters', name: 'Карбоновые Набедренники Свалки', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 32, weight: 2200, price: 9500 }
    ],
    bonus: { pDefPercent: 0.0526, hpFlat: 40 },
    bonusBadge: '🛡️ +5.26% Физ. Защита (P.Def) | ❤️ +40 HP',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и повышает максимальное здоровье на +40 HP.',
    lore: 'Легкий композитный доспех из закаленного углеволокна и броневых фрагментов автоматонов со Свалки. Высокая маневренность при солидной защите.',
    tacticalRole: 'Топовый легкий комплект No-Grade для даггерщиков и лучников.'
  },
  ring_mail: {
    id: 'ring_mail',
    name: 'Комплект «Звеньевой Доспех»',
    l2Ref: 'Ring Mail Set',
    grade: 'no_grade',
    gradeLabel: 'No-Grade',
    levelReq: 15,
    requiredPieces: 3,
    pieces: [
      { id: 'ring_mail_breastplate', name: 'Звеньевой Панцирь Цеховика', slot: 'chest', slotLabel: 'Верх (Тело)', def: 58, weight: 5200, price: 18000 },
      { id: 'ring_mail_gaiters', name: 'Звеньевые Поножи Цеховика', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 36, weight: 3200, price: 11500 },
      { id: 'ring_mail_boots', name: 'Звеньевые Сапоги', slot: 'boots', slotLabel: 'Обувь', def: 16, weight: 1400, price: 8000 }
    ],
    optionalPieces: [
      { id: 'ring_mail_gloves', name: 'Звеньевые Перчатки', slot: 'gloves', slotLabel: 'Перчатки', def: 12, weight: 140, price: 5000 }
    ],
    bonus: { pDefPercent: 0.0526, hpFlat: 30 },
    bonusBadge: '🛡️ +5.26% Физ. Защита (P.Def) | ❤️ +30 HP',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и добавляет +30 к максимальному здоровью.',
    lore: 'Тяжелая цеховая кольчуга двойного плетения с накладными титановыми звеньями. Лучшая защита для оператора перед получением первой профессии.',
    tacticalRole: 'Флагманский тяжелый доспех No-Grade ранга для штурма позиций элитных мобов и боссов.'
  },
  reinforced_leather: {
    id: 'reinforced_leather',
    name: 'Комплект «Усиленная Кожа»',
    l2Ref: 'Reinforced Leather Set',
    grade: 'd',
    gradeLabel: 'D-Ранг',
    levelReq: 20,
    requiredPieces: 3,
    pieces: [
      { id: 'reinforced_leather_shirt', name: 'Усиленная Кожаная Куртка', slot: 'chest', slotLabel: 'Верх (Тело)', def: 71, weight: 3200, price: 40000, crystals: 80 },
      { id: 'reinforced_leather_gaiters', name: 'Усиленные Кожаные Штаны', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 44, weight: 2000, price: 25000, crystals: 50 },
      { id: 'reinforced_leather_boots', name: 'Усиленные Сапоги', slot: 'boots', slotLabel: 'Обувь', def: 25, weight: 1200, price: 16000, crystals: 32 }
    ],
    bonus: { pDefPercent: 0.0526, energyFlat: 80 },
    bonusBadge: '🛡️ +5.26% Физ. Защита | ⚡ +80 Пар (Energy)',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и расширяет запас энергии пара на +80 единиц.',
    lore: 'Высококлассная дубленая кожа специальной закалки с кордом из сплетенной титановой проволоки. Идеальный баланс веса и подвижности для стрелков и следопытов.',
    tacticalRole: 'Основной комплект Low D для операторов с луками и кинжалами.'
  },
  scale_mail: {
    id: 'scale_mail',
    name: 'Комплект «Чешуйчатый Доспех»',
    l2Ref: 'Scale Mail Set',
    grade: 'd',
    gradeLabel: 'D-Ранг',
    levelReq: 20,
    requiredPieces: 2,
    pieces: [
      { id: 'scale_mail_breastplate', name: 'Чешуйчатая Кираса Регулятора', slot: 'chest', slotLabel: 'Верх (Тело)', def: 81, weight: 5800, price: 42000, crystals: 84 },
      { id: 'scale_mail_gaiters', name: 'Чешуйчатые Поножи Регулятора', slot: 'legs', slotLabel: 'Низ (Ноги)', def: 50, weight: 3600, price: 26000, crystals: 52 }
    ],
    optionalPieces: [
      { id: 'scale_mail_shield', name: 'Чешуйчатый Щит Регулятора', slot: 'shield', slotLabel: 'Щит', def: 75, weight: 1200, price: 18000, crystals: 36 }
    ],
    bonus: { pDefPercent: 0.0526, hpFlat: 80 },
    bonusBadge: '🛡️ +5.26% Физ. Защита | ❤️ +80 HP',
    bonusDescription: 'Увеличивает физическую защиту на +5.26% и повышает максимальное здоровье на +80 HP.',
    lore: 'Тяжелый латный комплект D-ранга из штампованной броневой чешуи с нахлестом. Выдерживает прямые попадания артиллерии и сокрушительные удары Босса-Бура.',
    tacticalRole: 'Тяжелый комплект максимальной физической брони и выживаемости в первой фазе.'
  }
};

// 1. UPDATE shared/item-db.js
function updateItemDb() {
  const itemDbPath = path.join(ROOT, 'shared', 'item-db.js');
  let content = fs.readFileSync(itemDbPath, 'utf8');

  // A. Add items to ITEMS map before "blueprint_hydraulic_armor" or at the end
  const needleItems = '    "blueprint_hydraulic_armor": {';
  let itemsStr = '';
  for (const [id, it] of Object.entries(OPERATOR_ITEMS)) {
    if (content.includes(`"${id}": {`)) continue;
    itemsStr += `    "${id}": ${JSON.stringify(it, null, 10).trim()},\n`;
  }
  
  if (itemsStr) {
    content = content.replace(needleItems, itemsStr + needleItems);
    console.log('Added operator items to shared/item-db.js ITEMS');
  }

  // Update copper_chainmail defense to 47 and setId to bronze_ng
  content = content.replace(
    /"copper_chainmail":\s*\{[\s\S]*?"defense":\s*\d+,/,
    `"copper_chainmail": {\n      "id": "copper_chainmail",\n      "name": "Медная кольчуга",\n      "type": "armor",\n      "slot": "chest",\n      "grade": "no_grade",\n      "icon": "assets/inventar/icons/copper_chainmail.webp",\n      "price": 8500,\n      "weight": 4200,\n      "description": "Сет «Медная Кольчуга» (2): Физ. Защита +5.26%, HP +50. Кольчуга из медных колец.",\n      "defense": 47,\n      "armorType": "heavy",\n      "setId": "bronze_ng",\n      "isOperatorArmor": true,\n      "isLivePhase1": true,\n      "levelReq": 10,\n      "crystalCount": 0,\n      "hpBonus": 35,`
  );

  // B. Add sets to ARMOR_SETS
  const needleArmorSets = '    mithril: {';
  let setsStr = '';
  for (const [sid, cfg] of Object.entries(OPERATOR_SETS_CONFIG)) {
    if (content.includes(`    ${sid}: {`)) continue;
    setsStr += `    ${sid}: {\n      id: '${sid}', name: '${cfg.name.replace('Комплект «', '').replace('»', '')}', required: ${cfg.requiredPieces},\n      bonus: ${JSON.stringify(cfg.bonus)}\n    },\n`;
  }

  if (setsStr) {
    content = content.replace(needleArmorSets, setsStr + needleArmorSets);
    console.log('Added operator sets to shared/item-db.js ARMOR_SETS');
  }

  fs.writeFileSync(itemDbPath, content, 'utf8');
  console.log('shared/item-db.js successfully updated.');
}

// 2. UPDATE client/js/inventory.js
function updateInventoryJs() {
  const invPath = path.join(ROOT, 'client', 'js', 'inventory.js');
  let content = fs.readFileSync(invPath, 'utf8');

  // Insert Operator items into ITEM_DATABASE right before "// ─── Оружие Оператора LIVE 1–20"
  const needleInv = '    // ─── Оружие Оператора LIVE 1–20 (эталон L2 C1) ───';
  let invItemsStr = '    // ─── Доспехи Оператора LIVE 1–20 (эталон L2 C1) ───\n';
  
  for (const [id, it] of Object.entries(OPERATOR_ITEMS)) {
    const constKey = id.toUpperCase();
    if (content.includes(`    ${constKey}: {`)) continue;
    const slotConst = `EQUIP_SLOTS.${it.slot.toUpperCase()}`;
    const itemObj = {
      id: it.id,
      name: it.name,
      l2Name: it.l2Name,
      type: it.type,
      slot: slotConst,
      grade: (it.grade || 'no_grade').toUpperCase(),
      defense: it.defense,
      weight: it.weight,
      price: it.price,
      levelReq: it.levelReq,
      crystalCount: it.crystalCount || 0,
      armorType: it.armorType,
      setId: it.setId || null,
      isOperatorArmor: true,
      isLivePhase1: true,
      description: it.description,
      icon: it.icon
    };
    if (it.blockRate) itemObj.blockRate = it.blockRate;

    // serialize with slotConst unquoted
    let jsonStr = JSON.stringify(itemObj, null, 8);
    jsonStr = jsonStr.replace(`"slot": "${slotConst}"`, `"slot": ${slotConst}`);
    invItemsStr += `    ${constKey}: ${jsonStr.trim()},\n`;
  }

  if (invItemsStr.length > 60) {
    content = content.replace(needleInv, invItemsStr + needleInv);
    fs.writeFileSync(invPath, content, 'utf8');
    console.log('client/js/inventory.js successfully updated with operator armor.');
  }
}

// 3. GENERATE data/operator_armor_db.json & data/operator_sets_db.json
function generateJsonDatabases() {
  const opArmorList = [];
  for (const [id, it] of Object.entries(OPERATOR_ITEMS)) {
    const slotLabelMap = {
      chest: 'Верх (Тело)',
      legs: 'Низ (Ноги)',
      head: 'Голова',
      gloves: 'Перчатки',
      boots: 'Обувь',
      shield: 'Щит'
    };
    const setCfg = it.setId ? OPERATOR_SETS_CONFIG[it.setId] : null;
    opArmorList.push({
      id: it.id,
      name: it.name,
      l2Name: it.l2Name,
      grade: it.grade,
      gradeLabel: it.grade === 'd' ? 'D-Ранг' : 'No-Grade',
      slot: it.slot,
      slotLabel: slotLabelMap[it.slot] || it.slot,
      armorType: it.armorType,
      armorTypeLabel: it.armorType === 'heavy' ? 'Тяжелая броня' : 'Легкая броня',
      defense: it.defense,
      price: it.price,
      weight: it.weight,
      levelReq: it.levelReq,
      crystalCount: it.crystalCount || 0,
      setId: it.setId || null,
      setName: setCfg ? setCfg.name : null,
      icon: it.icon,
      description: it.description
    });
  }

  // Also include copper_plate, steam_helmet, steam_boots, goggles, leather_cap, leather_gloves, work_boots, shields
  const extraItems = [
    {
      id: "copper_plate",
      name: "Медная Кираса Регулятора",
      grade: "d",
      gradeLabel: "D-Ранг",
      slot: "chest",
      slotLabel: "Верх (Тело)",
      armorType: "heavy",
      armorTypeLabel: "Тяжелая броня",
      defense: 75,
      price: 45000,
      weight: 830,
      levelReq: 20,
      crystalCount: 80,
      setId: null,
      setName: null,
      icon: "assets/inventar/icons/copper_plate.webp",
      description: "Тяжелая клёпаная кираса из чистой меди для защиты от мощных кинетических и паровых ударов. Базовый тяжелый доспех Регуляторов D-ранга."
    },
    {
      id: "steam_helmet",
      name: "Шлем Парового Давления",
      grade: "d",
      gradeLabel: "D-Ранг",
      slot: "head",
      slotLabel: "Голова",
      armorType: "heavy",
      armorTypeLabel: "Тяжелая броня",
      defense: 38,
      price: 18000,
      weight: 520,
      levelReq: 20,
      crystalCount: 30,
      setId: null,
      setName: null,
      icon: "assets/inventar/icons/steam_helmet.webp",
      description: "Кованый стальной шлем D-ранга с дыхательным фильтром и защитной решеткой. Высокая защита черепа при обрушении конструкций и выбросах пара."
    },
    {
      id: "steam_boots",
      name: "Поршневые Сапоги Инженера",
      grade: "d",
      gradeLabel: "D-Ранг",
      slot: "boots",
      slotLabel: "Обувь",
      armorType: "heavy",
      armorTypeLabel: "Тяжелая броня",
      defense: 25,
      price: 12000,
      weight: 400,
      levelReq: 20,
      crystalCount: 20,
      setId: null,
      setName: null,
      icon: "assets/inventar/icons/steam_boots.webp",
      description: "Усиленные сапоги со стальными накладками на голень D-ранга. Позволяют безопасно передвигаться по горячему шлаку и осколкам металла."
    },
    {
      id: "boiler_shield",
      name: "Котловой Щит",
      grade: "d",
      gradeLabel: "D-Ранг",
      slot: "shield",
      slotLabel: "Щит",
      armorType: "heavy",
      armorTypeLabel: "Тяжелая броня",
      defense: 75,
      price: 18000,
      weight: 1200,
      levelReq: 20,
      crystalCount: 36,
      setId: null,
      setName: null,
      icon: "assets/inventar/icons/boiler_shield.webp",
      description: "Тяжелый стальной щит с решеткой сброса давления пара."
    },
    {
      id: "hoplon",
      name: "Гоплон Давления",
      grade: "d",
      gradeLabel: "D-Ранг",
      slot: "shield",
      slotLabel: "Щит",
      armorType: "heavy",
      armorTypeLabel: "Тяжелая броня",
      defense: 75,
      price: 18000,
      weight: 1200,
      levelReq: 20,
      crystalCount: 36,
      setId: null,
      setName: null,
      icon: "assets/inventar/icons/hoplon.webp",
      description: "Круглый штампованный щит с латунным кантом."
    }
  ];

  for (const extra of extraItems) {
    if (!opArmorList.some(a => a.id === extra.id)) {
      opArmorList.push(extra);
    }
  }

  const opSetsList = [];
  for (const [sid, cfg] of Object.entries(OPERATOR_SETS_CONFIG)) {
    let totalDef = 0;
    let totalWeight = 0;
    let totalPrice = 0;
    let totalCrystals = 0;
    cfg.pieces.forEach(p => {
      totalDef += p.def || 0;
      totalWeight += p.weight || 0;
      totalPrice += p.price || 0;
      totalCrystals += p.crystals || 0;
    });
    opSetsList.push({
      id: cfg.id,
      name: cfg.name,
      l2Ref: cfg.l2Ref,
      grade: cfg.grade,
      gradeLabel: cfg.gradeLabel,
      levelReq: cfg.levelReq,
      requiredPieces: cfg.requiredPieces,
      pieces: cfg.pieces.map(p => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        slotLabel: p.slotLabel,
        icon: OPERATOR_ITEMS[p.id] ? OPERATOR_ITEMS[p.id].icon : 'assets/inventar/icons/engineer_jacket_low.webp',
        def: p.def,
        weight: p.weight,
        price: p.price,
        crystals: p.crystals || 0
      })),
      totalDef: totalDef,
      totalWeight: totalWeight,
      totalPrice: totalPrice,
      crystalCount: totalCrystals,
      bonusBadge: cfg.bonusBadge,
      bonusDescription: cfg.bonusDescription,
      lore: cfg.lore,
      tacticalRole: cfg.tacticalRole
    });
  }

  fs.writeFileSync(path.join(ROOT, 'data', 'operator_armor_db.json'), JSON.stringify(opArmorList, null, 2), 'utf8');
  console.log('Created data/operator_armor_db.json (' + opArmorList.length + ' items)');

  fs.writeFileSync(path.join(ROOT, 'data', 'operator_sets_db.json'), JSON.stringify(opSetsList, null, 2), 'utf8');
  console.log('Created data/operator_sets_db.json (' + opSetsList.length + ' sets)');
}

updateItemDb();
updateInventoryJs();
generateJsonDatabases();
console.log('Migration script complete!');
