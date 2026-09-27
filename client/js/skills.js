// ============================================
// PROJECT STEAM: ORIGINS - SKILLS.JS
// Активные / пассивные / toggle — Остров Стали
// Стимпанк-средневековье техноген. БЕЗ магии и магических слов.
// Ресурс: Energy (пар / давление)
// skillPower — множитель умения (1.0 = автоатака)
// damageType: 'physical' | 'circuit' (схемы = аналог M.Dmg)
// ============================================

const PLAYER_CLASSES = {
    OPERATOR: { id: 'operator', name: 'Оператор', path: 'fighter', levelReq: 1, parentClass: null },
    ENGINEER: { id: 'engineer', name: 'Инженер', path: 'tech', levelReq: 1, parentClass: null },
    MECHANIC: { id: 'mechanic', name: 'Механик', levelReq: 20, parentClass: 'operator' },
    DESTROYER: { id: 'destroyer', name: 'Разрушитель', levelReq: 20, parentClass: 'operator' },
    GUNNER: { id: 'gunner', name: 'Стрелок', levelReq: 20, parentClass: 'operator' },
    CONSTRUCTOR: { id: 'constructor', name: 'Конструктор', levelReq: 20, parentClass: 'engineer' },
    TECHNOMANCER: { id: 'technomancer', name: 'Наладчик', levelReq: 20, parentClass: 'engineer' }
};

const SKILL_TYPES = { ACTIVE: 'active', PASSIVE: 'passive', TOGGLE: 'toggle' };
const SKILL_CATEGORIES = {
    ATTACK: 'attack', BUFF: 'buff', DEBUFF: 'debuff',
    HEAL: 'heal', UTILITY: 'utility', CRAFT: 'craft'
};
const TARGET_TYPES = { SELF: 'self', TARGET: 'target', AOE: 'aoe', PARTY: 'party' };

/**
 * Радиусы — баланс под МЕТРИКИ ОСТРОВА, не «600 L2 = метры».
 *
 * Якоря боя:
 *   melee (player) ≈ 3.5
 *   aggro мобов    ≈ 10–14 (низ), 20–25 (выше)
 *   moveSpeed      ≈ 7.5–8
 *   bow            ≈ 22
 *
 * Interlude skilldata (600/1100/400) — только ПРОПОРЦИИ:
 *   magic : melee ≈ длиннее мили, но не 15× на нашей карте
 *   effect / cast ≈ 1100/600 ≈ 1.8
 *   buff  / magic ≈ 400/600 ≈ 0.67
 *
 * Итог (world units = метры острова):
 *   magic cast  30  (~8.5× melee, ~3.8 с бега)
 *   magic effect 55
 *   buff cast   21
 *   buff effect 38
 *   bow         30
 */
const GAME_MELEE = 3.5;
const GAME_MAGIC_CAST = 30;
const GAME_MAGIC_EFFECT = 55;
const GAME_BUFF_CAST = 21;
const GAME_BUFF_EFFECT = 38;
const GAME_BOW = 30;
// Алиасы для skill entries (старые имена L2_*)
const L2_MAGIC_CAST = GAME_MAGIC_CAST;
const L2_MAGIC_EFFECT = GAME_MAGIC_EFFECT;
const L2_BUFF_CAST = GAME_BUFF_CAST;
const L2_BUFF_EFFECT = GAME_BUFF_EFFECT;
/** @deprecated L2 units больше не масштабируем 1:1 — только пропорции в константах выше */
function fromL2CastRange(l2Cast) {
    const n = +l2Cast || 0;
    if (n >= 500) return GAME_MAGIC_CAST;
    if (n >= 350) return GAME_BUFF_CAST;
    return Math.max(GAME_MELEE, n * (GAME_MELEE / 40));
}
function fromL2EffectRange(l2Effect) {
    const n = +l2Effect || 0;
    if (n >= 1000) return GAME_MAGIC_EFFECT;
    if (n >= 800) return GAME_BUFF_EFFECT;
    return fromL2CastRange(n) * 1.8;
}

// skillPower / energy / CD / range — Interlude
// chargeTime = cast time (сек), 0 = мгновенно
// range = castRange (старт каста); effectRange = после каста (L2 effectRange)
const SKILL_DATABASE = {

    // ═══════════════════════════════════════════
    // ОПЕРАТОР (1–19)
    // 
    // ═══════════════════════════════════════════
    OP_POWER_STRIKE: {
        id: 'op_power_strike', name: 'Силовой удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'operator', levelReq: 1, energyCost: 8, cooldown: 3, chargeTime: 0, range: 3,
        skillPower: 1.5, damageType: 'physical', free: true, starter: true, spCost: 80,
        description: 'Мощный удар гаечным ключом. Наносит полтора раза больше обычного физического урона',
        icon: 'assets/skills/operator/op_power_strike.webp', maxLevel: 9, effectPerLevel: { skillPower: 0.12 },
    },
    OP_IRON_PUNCH: {
        id: 'op_iron_punch', name: 'Гидравлический кулак',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'operator', levelReq: 5, energyCost: 12, cooldown: 5, chargeTime: 0, range: 2.5,
        skillPower: 1.8, damageType: 'physical',
        description: 'Короткий гидравлический удар. Сильнее обычной атаки, но с большей затратой пара',
        icon: 'assets/skills/operator/op_iron_punch.webp', maxLevel: 9, effectPerLevel: { skillPower: 0.14 },
    },
    OP_STEAM_VENT: {
        id: 'op_steam_vent', name: 'Паровой выброс',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'operator', levelReq: 8, energyCost: 16, cooldown: 10, chargeTime: 0.4, range: 4,
        aoeRadius: 3.5, skillPower: 1.15, damageType: 'physical',
        description: 'Резкий выброс пара из клапана. Бьёт всех врагов рядом',
        icon: 'assets/skills/operator/op_steam_vent.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.1, aoeRadius: 0.25 }
    },
    OP_OIL_SLICK: {
        id: 'op_oil_slick', name: 'Масляная лужа',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.AOE,
        class: 'operator', levelReq: 10, energyCost: 12, cooldown: 14, chargeTime: 0.3, range: 6,
        aoeRadius: 3, duration: 6, slowPercent: 0.35,
        description: 'Разлив масла под ногами. Замедляет врагов в зоне',
        icon: 'assets/skills/operator/op_oil_slick.webp', maxLevel: 3, effectPerLevel: { slowPercent: 0.08, duration: 1 }
    },
    OP_EMERGENCY_REPAIR: {
        id: 'op_emergency_repair', name: 'Аварийный ремонт',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.SELF,
        class: 'operator', levelReq: 12, energyCost: 18, cooldown: 22, chargeTime: 1.0,
        healPercent: 0.22,
        description: 'Экстренный ремонт своего корпуса. Восстанавливает часть прочности',
        icon: 'assets/skills/operator/op_emergency_repair.webp', maxLevel: 5, effectPerLevel: { healPercent: 0.04 }
    },
    OP_OVERCLOCK: {
        id: 'op_overclock', name: 'Разгон',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'operator', levelReq: 14, energyCost: 20, cooldown: 35, chargeTime: 0,
        duration: 20, attackBoost: 0.15, speedBoost: 0.1,
        description: 'Краткий разгон механизмов. Усиливает удары и скорость передвижения',
        icon: 'assets/skills/operator/op_overclock.webp', maxLevel: 3, effectPerLevel: { attackBoost: 0.05, duration: 3 }
    },
    OP_SCRAP_COLLECT: {
        id: 'op_scrap_collect', name: 'Вскрытие корпуса',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.CRAFT, target: TARGET_TYPES.TARGET,
        class: 'operator', levelReq: 16, energyCost: 10, cooldown: 6, chargeTime: 1.2, range: 2,
        description: 'Вскрытие поверженного механизма — добыча дополнительных деталей',
        icon: 'assets/skills/operator/op_scrap_collect.webp', maxLevel: 3, effectPerLevel: {}
    },
   
    OP_WEAPON_MASTERY: {
        id: 'op_weapon_mastery', name: 'Мастерство инструмента',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'operator', levelReq: 1, free: true, starter: true, spCost: 60,
        description: 'Пассивно: каждый уровень умения усиливает ваши физические удары',
        icon: 'assets/skills/operator/op_weapon_mastery.webp', maxLevel: 5, effectPerLevel: { attackPercent: 0.04 },
    },
    OP_ARMOR_MASTERY: {
        id: 'op_armor_mastery', name: 'Мастерство брони',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'operator', levelReq: 5,
        description: 'Пассивно: каждый уровень умения повышает защиту и запас прочности',
        icon: 'assets/skills/operator/op_armor_mastery.webp', maxLevel: 5, effectPerLevel: { defensePercent: 0.05, hpPercent: 0.03 },
    },
    OP_TOUGH_FRAME: {
        id: 'op_tough_frame', name: 'Крепкая рама',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'operator', levelReq: 10,
        description: 'Пассивно: каждый уровень умения увеличивает максимальный запас прочности',
        icon: 'assets/skills/operator/op_tough_frame.webp', maxLevel: 5, effectPerLevel: { hpPercent: 0.06 },
    },
    OP_QUICK_HANDS: {
        id: 'op_quick_hands', name: 'Быстрые руки',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'operator', levelReq: 15,
        description: 'Пассивно: каждый уровень умения ускоряет темп ударов',
        icon: 'assets/skills/operator/op_quick_hands.webp', maxLevel: 5, effectPerLevel: { attackSpeed: 0.03 }
    },
    OP_EXPERTISE_D: {
        id: 'op_expertise_d', name: 'Экспертиза D',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'operator', levelReq: 20, free: true, classChange: true, expertise: 1, spCost: 0,
        description: 'Экспертиза D. Снимает штраф грейда с D-оружия и D-брони (выдаётся с 1-й профессией).',
        icon: 'assets/skills/operator/op_expertise_d.webp', maxLevel: 1
    },
    ENG_EXPERTISE_D: {
        id: 'eng_expertise_d', name: 'Экспертиза D',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 20, free: true, classChange: true, expertise: 1, spCost: 0,
        description: 'Экспертиза D. Снимает штраф грейда с D-оружия и D-брони (выдаётся с 1-й профессией).',
        icon: 'assets/skills/engineer/eng_expertise_d.webp', maxLevel: 1
    },

   

    OP_STURDY_FRAME: {
        id: 'op_sturdy_frame', name: 'Удачливый каркас',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.UTILITY,
        class: 'operator', levelReq: 1, free: true, starter: true, spCost: 0,
        description: 'При смерти до 4-го уровня: теряется опыт, но вещи остаются при себе (Lucky)',
        icon: 'assets/skills/operator/op_sturdy_frame.webp', maxLevel: 1, effectPerLevel: {},
        deathKeepItemsUntilLevel: 4,
        ranks: [{ levelReq: 1, spCost: 0, lucky: true }]
    },

    // ═══════════════════════════════════════════
    // МЕХАНИК (20–39)
    // Aggression, Shield Stun, Defense Aura, Holy Blade → Reinforced Edge
    // ═══════════════════════════════════════════
    MECH_AGGRESSION: {
        id: 'mech_aggression', name: 'Провокация',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'mechanic', levelReq: 20, energyCost: 10, cooldown: 4, chargeTime: 0, range: 4,
        duration: 8, aggroBoost: 3.0, skillPower: 0.5, damageType: 'physical',
        description: 'Провокация цели. Сильный агро + лёгкий урон',
        icon: 'assets/skills/mechanic/mech_aggression.webp', maxLevel: 5, effectPerLevel: { aggroBoost: 0.4 },
    },
    MECH_SHIELD_BASH: {
        id: 'mech_shield_bash', name: 'Удар щитом',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'mechanic', levelReq: 20, energyCost: 12, cooldown: 6, chargeTime: 0, range: 2.5,
        skillPower: 1.6, damageType: 'physical', stunChance: 0.35, stunDuration: 2,
        description: 'Удар котловым щитом. Шанс оглушения',
        icon: 'assets/skills/mechanic/mech_shield_bash.webp', maxLevel: 7, effectPerLevel: { skillPower: 0.12, stunChance: 0.04 },
    },
    MECH_DEFENSE_AURA: {
        id: 'mech_defense_aura', name: 'Аура брони',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.PARTY,
        class: 'mechanic', levelReq: 22, energyCost: 20, cooldown: 30, chargeTime: 0.5, range: 12,
        duration: 120, defenseBoost: 0.12,
        description: 'Аура брони группе. +12% физ. защиты',
        icon: 'assets/skills/mechanic/mech_defense_aura.webp', maxLevel: 5, effectPerLevel: { defenseBoost: 0.03, duration: 20 },
    },
    MECH_STEAM_WALL: {
        id: 'mech_steam_wall', name: 'Паровая стена',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'mechanic', levelReq: 24, energyCost: 25, cooldown: 28, chargeTime: 0.4,
        duration: 12, defenseBoost: 0.4, aggroBoost: 1.5,
        description: 'Паровая завеса. +40% защиты, повышенный агро',
        icon: 'assets/skills/mechanic/mech_steam_wall.webp', maxLevel: 5, effectPerLevel: { defenseBoost: 0.08, duration: 2 }
    },
    MECH_REPAIR_BEAM: {
        id: 'mech_repair_beam', name: 'Ремонтный луч',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'mechanic', levelReq: 26, energyCost: 22, cooldown: 10, chargeTime: 1.0, range: 8,
        healPercent: 0.14,
        description: 'Дистанционный ремонт союзника. 14% HP',
        icon: 'assets/skills/mechanic/mech_repair_beam.webp', maxLevel: 7, effectPerLevel: { healPercent: 0.025 }
    },
    MECH_REINFORCED_EDGE: {
        id: 'mech_reinforced_edge', name: 'Усиленное лезвие',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'mechanic', levelReq: 28, energyCost: 18, cooldown: 40, chargeTime: 0.5,
        duration: 120, attackBoost: 0.1,
        description: 'Закалка кромки. +10% физ. урона на 2 мин',
        icon: 'assets/skills/mechanic/mech_reinforced_edge.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.03 },
    },
    MECH_HYDRAULIC_SLAM: {
        id: 'mech_hydraulic_slam', name: 'Гидравлический удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'mechanic', levelReq: 32, energyCost: 30, cooldown: 16, chargeTime: 0.7, range: 4,
        aoeRadius: 4.5, skillPower: 2.0, damageType: 'physical', knockback: 2,
        description: 'Удар по земле. по площади 200% + отбрасывание',
        icon: 'assets/skills/mechanic/mech_hydraulic_slam.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.18, aoeRadius: 0.4 }
    },
    MECH_EMERGENCY_SHUTDOWN: {
        id: 'mech_emergency_shutdown', name: 'Аварийная остановка',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'mechanic', levelReq: 36, energyCost: 35, cooldown: 45, chargeTime: 1.2, range: 3,
        duration: 4,
        description: 'Принудительное отключение. Стан 4 сек (не боссы)',
        icon: 'assets/skills/mechanic/mech_emergency_shutdown.webp', maxLevel: 3, effectPerLevel: { duration: 0.5 }
    },
    MECH_PRESSURE_AURA: {
        id: 'mech_pressure_aura', name: 'Аура давления',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.TOGGLE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.PARTY,
        class: 'mechanic', levelReq: 30, energyCost: 3, cooldown: 0, chargeTime: 0, range: 10,
        attackBoost: 0.08, defenseBoost: 0.08,
        description: 'Аура: +8% атаки и защиты группе. Расход пара/сек',
        icon: 'assets/skills/mechanic/mech_pressure_aura.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.02, defenseBoost: 0.02 }
    },
    MECH_REINFORCED_ARMOR: {
        id: 'mech_reinforced_armor', name: 'Усиленная броня',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'mechanic', levelReq: 21,
        description: '+8% физ. защиты за уровень',
        icon: 'assets/skills/mechanic/mech_reinforced_armor.webp', maxLevel: 5, effectPerLevel: { defensePercent: 0.08 }
    },
    MECH_SHIELD_MASTERY: {
        id: 'mech_shield_mastery', name: 'Мастерство щита',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'mechanic', levelReq: 23,
        description: '+6% шанс блока и +4% физ. защиты за уровень',
        icon: 'assets/skills/mechanic/mech_shield_mastery.webp', maxLevel: 5, effectPerLevel: { blockRate: 0.06, defensePercent: 0.04 },
    },
    MECH_THREAT_GENERATOR: {
        id: 'mech_threat_generator', name: 'Генератор угрозы',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'mechanic', levelReq: 28,
        description: '+15% агро за уровень',
        icon: 'assets/skills/mechanic/mech_threat_generator.webp', maxLevel: 5, effectPerLevel: { aggroBonus: 0.15 }
    },
    MECH_LAST_STAND: {
        id: 'mech_last_stand', name: 'Последний рубеж',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'mechanic', levelReq: 35,
        description: 'При HP < 20%: +25% защиты (+5% за ур.)',
        icon: 'assets/skills/mechanic/mech_last_stand.webp', maxLevel: 5, effectPerLevel: { lowHpDefense: 0.05 }
    },
    MECH_STEAM_RESERVE: {
        id: 'mech_steam_reserve', name: 'Резервный котёл',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'mechanic', levelReq: 25,
        description: 'Пассивно: каждый уровень увеличивает запас пара.',
        icon: 'assets/skills/mechanic/mech_steam_reserve.webp', maxLevel: 5, effectPerLevel: { energyPercent: 0.10 }
    },

    // ═══════════════════════════════════════════
    // РАЗРУШИТЕЛЬ (20–39)
    // Power Smash, Stun Attack, War Cry, Vicious Stance
    // ═══════════════════════════════════════════
    DEST_POWER_SMASH: {
        id: 'dest_power_smash', name: 'Сокрушение',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'destroyer', levelReq: 20, energyCost: 14, cooldown: 4, chargeTime: 0, range: 3,
        skillPower: 2.2, damageType: 'physical',
        description: 'Сокрушительный удар. 220% физ. урона',
        icon: 'assets/skills/destroyer/dest_power_smash.webp', maxLevel: 9, effectPerLevel: { skillPower: 0.18 },
    },
    DEST_STUN_ATTACK: {
        id: 'dest_stun_attack', name: 'Оглушающий удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'destroyer', levelReq: 22, energyCost: 16, cooldown: 8, chargeTime: 0, range: 3,
        skillPower: 1.7, damageType: 'physical', stunChance: 0.4, stunDuration: 2.5,
        description: 'Удар с шансом оглушения',
        icon: 'assets/skills/destroyer/dest_stun_attack.webp', maxLevel: 7, effectPerLevel: { skillPower: 0.12, stunChance: 0.04 },
    },
    DEST_DEMOLISH: {
        id: 'dest_demolish', name: 'Разрушение',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'destroyer', levelReq: 20, energyCost: 12, cooldown: 4, chargeTime: 0, range: 3,
        skillPower: 2.0, damageMult: 2.0, damageType: 'physical',
        description: 'Мощный удар. 200% урона',
        icon: 'assets/skills/destroyer/dest_demolish.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2, damageMult: 0.2 }
    },
    DEST_WAR_CRY: {
        id: 'dest_war_cry', name: 'Боевой гудок',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'destroyer', levelReq: 24, energyCost: 18, cooldown: 40, chargeTime: 0,
        duration: 30, attackBoost: 0.2,
        description: 'Боевой гудок. +20% физ. урона',
        icon: 'assets/skills/destroyer/dest_war_cry.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.05, duration: 5 },
    },
    DEST_BERSERKER_STEAM: {
        id: 'dest_berserker_steam', name: 'Пар берсерка',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'destroyer', levelReq: 26, energyCost: 25, cooldown: 45, chargeTime: 0,
        duration: 20, attackBoost: 0.35, defensePenalty: 0.25,
        description: 'Ярость: +35% атаки, −25% защиты',
        icon: 'assets/skills/destroyer/dest_berserker_steam.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.06, duration: 2 }
    },
    DEST_FRAG_GRENADE: {
        id: 'dest_frag_grenade', name: 'Осколочная граната',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'destroyer', levelReq: 28, energyCost: 20, cooldown: 12, chargeTime: 0.3, range: 8,
        aoeRadius: 4, skillPower: 1.7, damageType: 'physical',
        description: 'Бросок гранаты. по площади 170%',
        icon: 'assets/skills/destroyer/dest_frag_grenade.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.15, aoeRadius: 0.3 }
    },
    DEST_VICIOUS_STANCE: {
        id: 'dest_vicious_stance', name: 'Жёсткая стойка',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.TOGGLE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'destroyer', levelReq: 30, energyCost: 2, cooldown: 0, chargeTime: 0,
        attackBoost: 0.12, defensePenalty: 0.08,
        description: 'Стойка: +12% атаки, −8% защиты. Расход пара/сек',
        icon: 'assets/skills/destroyer/dest_vicious_stance.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.03 },
    },
    DEST_CRUSHING_BLOW: {
        id: 'dest_crushing_blow', name: 'Сокрушительный удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'destroyer', levelReq: 34, energyCost: 22, cooldown: 10, chargeTime: 0.6, range: 3,
        skillPower: 2.8, damageType: 'physical', critBonus: 0.15,
        description: '280% урона, +15% шанс крита',
        icon: 'assets/skills/destroyer/dest_crushing_blow.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.22, critBonus: 0.03 }
    },
    DEST_CHAIN_DETONATION: {
        id: 'dest_chain_detonation', name: 'Цепная детонация',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'destroyer', levelReq: 36, energyCost: 32, cooldown: 18, chargeTime: 0.5, range: 6,
        aoeRadius: 5.5, skillPower: 1.9, damageType: 'physical',
        dotDamage: 12, dotDuration: 5,
        description: 'Серия взрывов + горение 5 сек',
        icon: 'assets/skills/destroyer/dest_chain_detonation.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.15, dotDamage: 4 }
    },
    DEST_HEAVY_STRIKES: {
        id: 'dest_heavy_strikes', name: 'Тяжёлые удары',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'destroyer', levelReq: 21,
        description: '+10% физ. урона за уровень',
        icon: 'assets/skills/destroyer/dest_heavy_strikes.webp', maxLevel: 5, effectPerLevel: { attackPercent: 0.10 }
    },
    DEST_CRITICAL_MASS: {
        id: 'dest_critical_mass', name: 'Критическая масса',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'destroyer', levelReq: 25,
        description: '+4% шанс крита за уровень',
        icon: 'assets/skills/destroyer/dest_critical_mass.webp', maxLevel: 5, effectPerLevel: { critChance: 0.04 }
    },
    DEST_EXPLOSIVE_EXPERT: {
        id: 'dest_explosive_expert', name: 'Эксперт-подрывник',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'destroyer', levelReq: 30,
        description: '+12% урона взрывов за уровень',
        icon: 'assets/skills/destroyer/dest_explosive_expert.webp', maxLevel: 5, effectPerLevel: { explosiveDamage: 0.12 }
    },
    DEST_ADRENALINE: {
        id: 'dest_adrenaline', name: 'Адреналин',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'destroyer', levelReq: 35,
        description: 'При HP < 30%: +20% атаки (+4% за ур.)',
        icon: 'assets/skills/destroyer/dest_adrenaline.webp', maxLevel: 5, effectPerLevel: { lowHpAttack: 0.04 }
    },

    // ═══════════════════════════════════════════
    // СТРЕЛОК (20–39)
    // Mortal Blow, Power Shot, Dash, Ultimate Evasion
    // ═══════════════════════════════════════════
    GUN_MORTAL_BLOW: {
        id: 'gun_mortal_blow', name: 'Смертельный выпад',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'gunner', levelReq: 20, energyCost: 14, cooldown: 5, chargeTime: 0.2, range: 3,
        skillPower: 2.4, damageType: 'physical', critBonus: 0.25,
        description: 'Смертельный выпад кинжалом. Высокий крит',
        icon: 'assets/skills/gunner/gun_mortal_blow.webp', maxLevel: 9, effectPerLevel: { skillPower: 0.18, critBonus: 0.03 },
    },
    GUN_PRECISION_SHOT: {
        id: 'gun_precision_shot', name: 'Точный выстрел',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'gunner', levelReq: 20, energyCost: 10, cooldown: 3, chargeTime: 0.3, range: 12,
        skillPower: 1.8, damageType: 'physical', critBonus: 0.15, damageMult: 1.8,
        description: 'Прицельный выстрел. 180% + крит',
        icon: 'assets/skills/gunner/gun_precision_shot.webp', maxLevel: 7, effectPerLevel: { skillPower: 0.14, critBonus: 0.04 }
    },
    GUN_DASH: {
        id: 'gun_dash', name: 'Рывок',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.UTILITY, target: TARGET_TYPES.SELF,
        class: 'gunner', levelReq: 22, energyCost: 12, cooldown: 18, chargeTime: 0,
        duration: 3, speedBoost: 0.6,
        description: 'Рывок. +60% скорости 3 сек',
        icon: 'assets/skills/gunner/gun_dash.webp', maxLevel: 3, effectPerLevel: { duration: 0.5, speedBoost: 0.1 },
    },
    GUN_RAPID_FIRE: {
        id: 'gun_rapid_fire', name: 'Скорострельность',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'gunner', levelReq: 24, energyCost: 20, cooldown: 14, chargeTime: 0,
        duration: 5, attackSpeedBoost: 0.8,
        description: 'Серия быстрых выстрелов',
        icon: 'assets/skills/gunner/gun_rapid_fire.webp', maxLevel: 5, effectPerLevel: { duration: 0.8, attackSpeedBoost: 0.15 }
    },
    GUN_PIERCING_ROUND: {
        id: 'gun_piercing_round', name: 'Бронебойный снаряд',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'gunner', levelReq: 26, energyCost: 16, cooldown: 9, chargeTime: 0.4, range: 12,
        skillPower: 2.0, damageType: 'physical', ignoreDefense: 0.4,
        description: '200% урона, игнор 40% физ. защиты',
        icon: 'assets/skills/gunner/gun_piercing_round.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.15, ignoreDefense: 0.08 }
    },
    GUN_ULTIMATE_EVASION: {
        id: 'gun_ultimate_evasion', name: 'Максимальное уклонение',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'gunner', levelReq: 28, energyCost: 22, cooldown: 50, chargeTime: 0,
        duration: 8, evasionBoost: 0.5,
        description: 'На несколько секунд резко растёт уклонение — сложнее попасть по вам.',
        icon: 'assets/skills/gunner/gun_ultimate_evasion.webp', maxLevel: 3, effectPerLevel: { evasionBoost: 0.1, duration: 1 },
    },
    GUN_SMOKE_SCREEN: {
        id: 'gun_smoke_screen', name: 'Дымовая завеса',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.UTILITY, target: TARGET_TYPES.SELF,
        class: 'gunner', levelReq: 26, energyCost: 15, cooldown: 22, chargeTime: 0,
        duration: 6, evasionBoost: 0.35,
        description: 'Дым. +35% уклонения',
        icon: 'assets/skills/gunner/gun_smoke_screen.webp', maxLevel: 3, effectPerLevel: { evasionBoost: 0.08, duration: 1 }
    },
    GUN_EXPLOSIVE_TRAP: {
        id: 'gun_explosive_trap', name: 'Взрывная ловушка',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'gunner', levelReq: 32, energyCost: 22, cooldown: 16, chargeTime: 0.5, range: 8,
        aoeRadius: 3, skillPower: 2.1, damageType: 'physical', trapDuration: 30,
        description: 'Мина. Взрыв при приближении',
        icon: 'assets/skills/gunner/gun_explosive_trap.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.18, aoeRadius: 0.3 }
    },
    GUN_SNIPER_MODE: {
        id: 'gun_sniper_mode', name: 'Режим снайпера',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.TOGGLE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'gunner', levelReq: 34, energyCost: 4, cooldown: 0, chargeTime: 0,
        rangeBonus: 5, damageBoost: 0.25, speedPenalty: 0.45,
        description: '+5 дальность, +25% урон, −45% скорость',
        icon: 'assets/skills/gunner/gun_sniper_mode.webp', maxLevel: 5, effectPerLevel: { damageBoost: 0.05, rangeBonus: 1 }
    },
    GUN_BULLET_STORM: {
        id: 'gun_bullet_storm', name: 'Шквал заклёпок',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'gunner', levelReq: 38, energyCost: 40, cooldown: 28, chargeTime: 1.0, range: 10,
        aoeRadius: 5, skillPower: 2.8, damageType: 'physical', hits: 5,
        description: 'Залп по площади. Высокий суммарный урон',
        icon: 'assets/skills/gunner/gun_bullet_storm.webp', maxLevel: 3, effectPerLevel: { skillPower: 0.25, hits: 1 }
    },
    GUN_EAGLE_EYE: {
        id: 'gun_eagle_eye', name: 'Глаз орла',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'gunner', levelReq: 21,
        description: '+1.5 дальность за уровень',
        icon: 'assets/skills/gunner/gun_eagle_eye.webp', maxLevel: 5, effectPerLevel: { rangeBonus: 1.5 },
    },
    GUN_DEADLY_AIM: {
        id: 'gun_deadly_aim', name: 'Смертельная точность',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'gunner', levelReq: 25,
        description: '+5% шанс крита за уровень',
        icon: 'assets/skills/gunner/gun_deadly_aim.webp', maxLevel: 5, effectPerLevel: { critChance: 0.05 }
    },
    GUN_EVASION_PROTOCOL: {
        id: 'gun_evasion_protocol', name: 'Протокол уклонения',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'gunner', levelReq: 28,
        description: '+4% уклонения за уровень',
        icon: 'assets/skills/gunner/gun_evasion_protocol.webp', maxLevel: 5, effectPerLevel: { evasion: 0.04 },
    },
    GUN_OVERCHARGE: {
        id: 'gun_overcharge', name: 'Перезаряд',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'gunner', levelReq: 35,
        description: 'Криты +15% урона (+3% за ур.)',
        icon: 'assets/skills/gunner/gun_overcharge.webp', maxLevel: 5, effectPerLevel: { critDamage: 0.03 }
    },

    // ═══════════════════════════════════════════
    // ИНЖЕНЕР (1–19) — Human Mystic → контур / давление
    // ranks[] = 100% C1 skilldata (L2Hub): levelReq, MP→energy, Power→l2Power, SP.
    // Урон: L2j magic  91×√C.Atk×Power/C.Def  (l2-combat.circuitDamage absolute)
    // Хил:  Power + √C.Atk×2                  (l2-combat.healAmount)
    // ═══════════════════════════════════════════

    // ─── Ур. 1 — стартовый набор (free) ───
    ENG_LUCKY: {
        id: 'eng_lucky', name: 'Везение',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.UTILITY,
        class: 'engineer', levelReq: 1, free: true, starter: true, spCost: 0,
        description: 'При смерти до 4-го уровня: теряется опыт, но вещи остаются при себе',
        icon: 'assets/skills/engineer/eng_lucky.webp', maxLevel: 1, effectPerLevel: {},
        deathKeepItemsUntilLevel: 4,
        ranks: [{ levelReq: 1, spCost: 0 }]
    },
    // Spellcraft C1: +100% Casting Spd (×2.0) при комплекте робы (куртка+штаны)
    // 166 bare → 332 robe set → 382 Devotion full set (+15% on top of Spellcraft)
    ENG_EXPERT_TUNE: {
        id: 'eng_expert_tune', name: 'Искусная настройка',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 1, free: true, starter: true, spCost: 0,
        description: 'Пассивно: в полной робе (куртка и штаны) навыки готовятся вдвое быстрее. Некоторые полные сеты робы ускоряют ещё сильнее.',
        icon: 'assets/skills/engineer/eng_expert_tune.webp', maxLevel: 1, effectPerLevel: {},
        requiresRobe: true,
        requiresRobeSet: true,
        ranks: [
            { levelReq: 1, spCost: 0, chargeSpeed: 1.0 }
        ]
    },
    // Magician's Movement: +25% Atk.Speed in robe set (chest+legs)
    ENG_ROBE_STEP: {
        id: 'eng_robe_step', name: 'Шаг мастера',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 1, free: true, starter: true, spCost: 0,
        description: 'Пассивно: +25% скорости атаки при комплекте робы (куртка+штаны)',
        icon: 'assets/skills/engineer/eng_robe_step.webp', maxLevel: 1, effectPerLevel: {},
        requiresRobe: true,
        requiresRobeSet: true,
        ranks: [{ levelReq: 1, spCost: 0, attackSpeed: 0.25 }]
    },
    // Mana Recovery: +20% Energy regen in robe set
    ENG_COOLANT_MIND: {
        id: 'eng_coolant_mind', name: 'Восстановление пара',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 1, free: true, starter: true, spCost: 0,
        description: 'Пассивно: в полной робе (куртка и штаны) пар восстанавливается быстрее',
        icon: 'assets/skills/engineer/eng_coolant_mind.webp', maxLevel: 1, effectPerLevel: {},
        requiresRobe: true,
        requiresRobeSet: true,
        ranks: [{ levelReq: 1, spCost: 0, energyRegen: 0.20 }]
    },
    // Wind Strike C1/Interlude: TOTAL MP = mpConsume + mpInitial (7+2 → 12+3).
    // Раньше ошибочно стоял только mpInitial (2→7) — пар почти не тратился.
    // Power 12→21 · hitTime 4.0с · reuse 6.0с · wand ×0.9 поверх base.
    // Naked 166 → ~8.0с; роба+Spellcraft 333 → 4.0с. Это C1, не спам.
    ENG_PRESSURE_BOLT: {
        id: 'eng_pressure_bolt', name: 'Давящий импульс',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 1, energyCost: 9, cooldown: 6.0, chargeTime: 4.0,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        skillPower: 12, damageType: 'circuit', free: true, starter: true, spCost: 0,
        description: 'Сгусток давления из резонатора. Основная атака инженера. Нужен резонатор и достаточный уровень контура. Тратит пар, долгая подготовка',
        icon: 'assets/skills/engineer/eng_pressure_bolt.webp', maxLevel: 5,
        ranks: [
            { levelReq: 1,  energyCost: 9,  l2Power: 12, spCost: 0 },
            { levelReq: 7,  energyCost: 10, l2Power: 13, spCost: 240 },
            { levelReq: 7,  energyCost: 11, l2Power: 15, spCost: 240 },
            { levelReq: 14, energyCost: 13, l2Power: 18, spCost: 1100 },
            { levelReq: 14, energyCost: 15, l2Power: 21, spCost: 1100 }
        ]
    },
    // Self Heal C1: Power 42 · total MP ≈ 14 (mpConsume+initial) · cast 5.0 · reuse 10.0
    ENG_SELF_REPAIR: {
        id: 'eng_self_repair', name: 'Саморемонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.SELF,
        class: 'engineer', levelReq: 1, energyCost: 14, cooldown: 10.0, chargeTime: 5.0,
        healPower: 42, free: true, starter: true, spCost: 0,
        description: 'Полевой ремонт собственного корпуса. Восстанавливает прочность за счёт пара',
        icon: 'assets/skills/engineer/eng_self_repair.webp', maxLevel: 1,
        ranks: [{ levelReq: 1, energyCost: 14, healPower: 42, spCost: 0 }]
    },

    // ─── Ур. 7 ───
    // Weapon Mastery aCis 249: mul 1.45 pAtk / 1.17 mAtk + flat table
    ENG_WEAPON_MASTERY: {
        id: 'eng_weapon_mastery', name: 'Мастерство инструмента',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 7, spCost: 470,
        description: 'Пассивно: усиливает физические удары и схемный урон от оружия',
        icon: 'assets/skills/engineer/eng_weapon_mastery.webp', maxLevel: 2,
        ranks: [
            { levelReq: 7,  spCost: 470,  pAtkPercent: 0.45, pAtkFlat: 1.5, cAtkPercent: 0.17, cAtkFlat: 1.9 },
            { levelReq: 14, spCost: 2100, pAtkPercent: 0.45, pAtkFlat: 2.8, cAtkPercent: 0.17, cAtkFlat: 3.5 }
        ]
    },
    // Armor Mastery aCis 244: +6.7 / 8.0 / 9.2 (minLvl 7 / 14 / 14)
    ENG_ARMOR_MASTERY: {
        id: 'eng_armor_mastery', name: 'Мастерство оболочки',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 7, spCost: 470,
        description: 'Пассивно: укрепляет броню — меньше физического урона',
        icon: 'assets/skills/engineer/eng_armor_mastery.webp', maxLevel: 3,
        ranks: [
            { levelReq: 7,  spCost: 470,  pDefFlat: 6.7 },
            { levelReq: 14, spCost: 1100, pDefFlat: 8.0 },
            { levelReq: 14, spCost: 1100, pDefFlat: 9.2 }
        ]
    },
    // Anti Magic aCis 146: +10/12/14/16 (minLvl 7×2, 14×2)
    ENG_CIRCUIT_MASTERY: {
        id: 'eng_circuit_mastery', name: 'Изоляция контура',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'engineer', levelReq: 7, spCost: 240,
        description: 'Пассивно: усиливает защиту контура от схемных атак',
        icon: 'assets/skills/engineer/eng_circuit_mastery.webp', maxLevel: 4,
        ranks: [
            { levelReq: 7,  spCost: 240,  cDefFlat: 10 },
            { levelReq: 7,  spCost: 240,  cDefFlat: 12 },
            { levelReq: 14, spCost: 1100, cDefFlat: 14 },
            { levelReq: 14, spCost: 1100, cDefFlat: 16 }
        ]
    },
    // Ice Bolt Interlude: hitTime 3100 · reuse 2000 · slow −20% · 60с · Power 8→13 · MP 9→15
    ENG_PRESSURE_SEAL: {
        id: 'eng_pressure_seal', name: 'Охлаждающий шип',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 9, cooldown: 2.0, chargeTime: 3.1,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        skillPower: 8, damageType: 'circuit', duration: 60, slowPercent: 0.20, spCost: 240,
        description: 'Холодный шип давления. Наносит схемный урон и замедляет цель на минуту',
        icon: 'assets/skills/engineer/eng_pressure_seal.webp', maxLevel: 4,
        ranks: [
            { levelReq: 7,  energyCost: 9,  l2Power: 8,  slowPercent: 0.20, duration: 60, spCost: 240 },
            { levelReq: 7,  energyCost: 10, l2Power: 9,  slowPercent: 0.20, duration: 60, spCost: 240 },
            { levelReq: 14, energyCost: 14, l2Power: 11, slowPercent: 0.20, duration: 60, spCost: 1100 },
            { levelReq: 14, energyCost: 15, l2Power: 13, slowPercent: 0.20, duration: 60, spCost: 1100 }
        ]
    },
    // Heal Interlude: cast 5000 · reuse 10000 · Power 49+ · total MP ≈ consume+initial
    ENG_FIELD_REPAIR: {
        id: 'eng_field_repair', name: 'Полевой ремонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 10, cooldown: 10.0, chargeTime: 5.0,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        healPower: 49, spCost: 160,
        description: 'Ремонт выбранного союзника (или себя). Тратит пар, долгая подготовка',
        icon: 'assets/skills/engineer/eng_field_repair.webp', maxLevel: 6,
        ranks: [
            { levelReq: 7,  energyCost: 10, healPower: 49, spCost: 160 },
            { levelReq: 7,  energyCost: 15, healPower: 58, spCost: 160 },
            { levelReq: 7,  energyCost: 17, healPower: 67, spCost: 160 },
            { levelReq: 14, energyCost: 20, healPower: 76, spCost: 700 },
            { levelReq: 14, energyCost: 25, healPower: 86, spCost: 700 },
            { levelReq: 14, energyCost: 31, healPower: 95, spCost: 700 }
        ]
    },
    // Might (full.md): cast 4000 · reuse 6000 · +8%→+15% · 1200с
    ENG_MIGHT: {
        id: 'eng_might', name: 'Разгон привода',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 8, cooldown: 6.0, chargeTime: 4.0,
        range: L2_BUFF_CAST, effectRange: L2_BUFF_EFFECT, l2CastRange: 400, l2EffectRange: 900,
        duration: 1200, attackBoost: 0.08, spCost: 470,
        description: 'Разгоняет привод цели: сильнее физические удары на 20 минут',
        icon: 'assets/skills/engineer/eng_might.webp', maxLevel: 3,
        ranks: [
            { levelReq: 7,  energyCost: 8,  attackBoost: 0.08, duration: 1200, spCost: 470 },
            { levelReq: 20, energyCost: 18, attackBoost: 0.12, duration: 1200, spCost: 2000 },
            { levelReq: 40, energyCost: 28, attackBoost: 0.15, duration: 1200, spCost: 8000 }
        ]
    },
    // Shield (full.md): cast 4000 · reuse 6000 · +8%→+15%
    ENG_SHIELD: {
        id: 'eng_shield', name: 'Кожух',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 8, cooldown: 6.0, chargeTime: 4.0,
        range: L2_BUFF_CAST, effectRange: L2_BUFF_EFFECT, l2CastRange: 400, l2EffectRange: 900,
        duration: 1200, defenseBoost: 0.08, spCost: 470,
        description: 'Надевает защитный кожух: выше физическая защита на 20 минут',
        icon: 'assets/skills/engineer/eng_shield.webp', maxLevel: 3,
        ranks: [
            { levelReq: 7,  energyCost: 8,  defenseBoost: 0.08, duration: 1200, spCost: 470 },
            { levelReq: 20, energyCost: 20, defenseBoost: 0.12, duration: 1200, spCost: 2000 },
            { levelReq: 40, energyCost: 31, defenseBoost: 0.15, duration: 1200, spCost: 8000 }
        ]
    },
    // Cure Poison Interlude: A1-like · MP 10 · power≤3 · short cast/reuse
    ENG_CURE_TOXIN: {
        id: 'eng_cure_toxin', name: 'Промывка',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.UTILITY, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 10, cooldown: 2.0, chargeTime: 0.5,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        curePoison: true, spCost: 470,
        description: 'Промывка контура — снимает слабый яд с цели',
        icon: 'assets/skills/engineer/eng_cure_toxin.webp', maxLevel: 1,
        ranks: [
            { levelReq: 7, energyCost: 10, curePoison: true, poisonPowerMax: 3, spCost: 470 }
        ]
    },
    // Curse:Poison Interlude: 21 HP/сек · 30с · −20% heal · land 70% · MP 8 · cast 3.0 · CD 2
    ENG_CURSE_CORRODE: {
        id: 'eng_curse_corrode', name: 'Коррозия',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 7, energyCost: 8, cooldown: 2.0, chargeTime: 3.0,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        duration: 30, dotDamage: 21, dotDuration: 30, healReduction: 0.20, landChance: 0.70, spCost: 470,
        description: 'Запускает коррозию: цель теряет прочность со временем и хуже чинится',
        icon: 'assets/skills/engineer/eng_curse_corrode.webp', maxLevel: 1,
        ranks: [
            {
                levelReq: 7, energyCost: 8, dotDamage: 21, dotTicks: 30, duration: 30,
                healReduction: 0.20, landChance: 0.70, spCost: 470
            }
        ]
    },

    // ─── Ур. 14 ───
    // Vampiric Touch: Power 18→32 · absorb 40% · cast 4.0 · reuse 12 · total MP 25→40 (20+5 → 32+8)
    ENG_PRESSURE_DRAIN: {
        id: 'eng_pressure_drain', name: 'Вытяжка давления',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 14, energyCost: 25, cooldown: 12.0, chargeTime: 4.0,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        skillPower: 18, damageType: 'circuit', lifeSteal: 0.40, spCost: 1100,
        description: 'Вытягивает давление из цели: схемный урон и часть урона возвращается вам как прочность',
        icon: 'assets/skills/engineer/eng_pressure_drain.webp', maxLevel: 6,
        ranks: [
            { levelReq: 14, energyCost: 25, l2Power: 18, lifeSteal: 0.40, spCost: 1100 },
            { levelReq: 14, energyCost: 28, l2Power: 21, lifeSteal: 0.40, spCost: 1100 },
            { levelReq: 20, energyCost: 30, l2Power: 23, lifeSteal: 0.40, spCost: 3000 },
            { levelReq: 20, energyCost: 32, l2Power: 26, lifeSteal: 0.40, spCost: 3000 },
            { levelReq: 40, energyCost: 36, l2Power: 29, lifeSteal: 0.40, spCost: 12000 },
            { levelReq: 40, energyCost: 40, l2Power: 32, lifeSteal: 0.40, spCost: 12000 }
        ]
    },
    // Battle Heal: cast 2000 · reuse 3000 · Power 83 · total MP 25 (20+5)
    ENG_BATTLE_REPAIR: {
        id: 'eng_battle_repair', name: 'Боевой ремонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 14, energyCost: 25, cooldown: 3.0, chargeTime: 2.0,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        healPower: 83, spCost: 700,
        description: 'Быстрый ремонт в бою — меньше подготовки, чем у полевого ремонта',
        icon: 'assets/skills/engineer/eng_battle_repair.webp', maxLevel: 1,
        ranks: [
            { levelReq: 14, energyCost: 25, healPower: 83, spCost: 700 }
        ]
    },
    // Group Heal (full.md): cast ~7.0 · reuse ~25 · party radius (approx low-rank)
    ENG_GROUP_REPAIR: {
        id: 'eng_group_repair', name: 'Групповой ремонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.PARTY,
        class: 'engineer', levelReq: 14, energyCost: 40, cooldown: 25.0, chargeTime: 7.0,
        range: L2_MAGIC_EFFECT, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        healPower: 66, spCost: 700,
        description: 'Ремонт всей группы сразу. Долгая подготовка, большой расход пара',
        icon: 'assets/skills/engineer/eng_group_repair.webp', maxLevel: 3,
        ranks: [
            { levelReq: 14, energyCost: 40, healPower: 66, spCost: 700 },
            { levelReq: 14, energyCost: 48, healPower: 76, spCost: 700 },
            { levelReq: 14, energyCost: 56, healPower: 86, spCost: 700 }
        ]
    },
    // Curse:Weakness Interlude: hitTime 1.5с · reuse 2с · −17% P.Atk · 30с · MP 3 · SP 2100
    ENG_CURSE_WEAK: {
        id: 'eng_curse_weak', name: 'Ослабление привода',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'engineer', levelReq: 14, energyCost: 3, cooldown: 2.0, chargeTime: 1.5,
        range: L2_MAGIC_CAST, effectRange: L2_MAGIC_EFFECT, l2CastRange: 600, l2EffectRange: 1100,
        duration: 30, attackReduction: 0.17, landChance: 0.80, spCost: 2100,
        description: 'Ослабляет привод цели: её удары становятся слабее на полминуты',
        icon: 'assets/skills/engineer/eng_curse_weak.webp', maxLevel: 1,
        ranks: [
            { levelReq: 14, energyCost: 3, attackReduction: 0.17, duration: 30, landChance: 0.80, spCost: 2100 }
        ]
    },

    // ═══════════════════════════════════════════
    // КОНСТРУКТОР (20–39)
    // ═══════════════════════════════════════════
    CON_OVERLOAD: {
        id: 'con_overload', name: 'Перегруз',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'constructor', levelReq: 20, energyCost: 28, cooldown: 7, chargeTime: 1.0, range: 14,
        skillPower: 2.3, damageType: 'circuit',
        description: 'Перегруз контура — сильный схемный разряд в одну цель',
        icon: 'assets/skills/constructor/con_overload.webp', maxLevel: 9, effectPerLevel: { skillPower: 0.2 },
    },
    CON_COOLANT_BOLT: {
        id: 'con_coolant_bolt', name: 'Охлаждающий болт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'constructor', levelReq: 22, energyCost: 18, cooldown: 4, chargeTime: 0.6, range: 13,
        skillPower: 1.6, damageType: 'circuit', duration: 5, slowPercent: 0.3,
        description: 'Охлаждающий болт: схемный урон и замедление',
        icon: 'assets/skills/constructor/con_coolant_bolt.webp', maxLevel: 7, effectPerLevel: { skillPower: 0.12, slowPercent: 0.05 },
    },
    CON_STEAM_NOVA: {
        id: 'con_steam_nova', name: 'Паровая нова',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'constructor', levelReq: 26, energyCost: 36, cooldown: 16, chargeTime: 1.2, range: 10,
        aoeRadius: 5, skillPower: 1.7, damageType: 'circuit',
        description: 'Взрыв пара вокруг цели — урон по площади',
        icon: 'assets/skills/constructor/con_steam_nova.webp', maxLevel: 7, effectPerLevel: { skillPower: 0.15, aoeRadius: 0.3 }
    },
    CON_SURGE: {
        id: 'con_surge', name: 'Скачок напряжения',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'constructor', levelReq: 30, energyCost: 32, cooldown: 10, chargeTime: 0.9, range: 14,
        skillPower: 2.6, damageType: 'circuit',
        description: 'Концентрированный разряд высокого напряжения',
        icon: 'assets/skills/constructor/con_surge.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2 }
    },
    CON_FOCUS_PROTOCOL: {
        id: 'con_focus_protocol', name: 'Протокол фокуса',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'constructor', levelReq: 24, energyCost: 20, cooldown: 60, chargeTime: 0.3,
        duration: 120, cancelResist: 0.4,
        description: 'Протокол фокуса: сложнее сбить вашу подготовку навыка',
        icon: 'assets/skills/constructor/con_focus_protocol.webp', maxLevel: 3, effectPerLevel: { cancelResist: 0.1 },
    },
    CON_QUICK_CHARGE: {
        id: 'con_quick_charge', name: 'Быстрая зарядка',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'constructor', levelReq: 21,
        description: 'Пассивно: ускоряет подготовку навыков',
        icon: 'assets/skills/constructor/con_quick_charge.webp', maxLevel: 5, effectPerLevel: { chargeSpeed: 0.06 },
    },
    CON_HIGH_PRESSURE: {
        id: 'con_high_pressure', name: 'Высокое давление',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'constructor', levelReq: 28,
        description: 'Пассивно: каждый уровень повышает схемный урон',
        icon: 'assets/skills/constructor/con_high_pressure.webp', maxLevel: 5, effectPerLevel: { cAtkPercent: 0.08 },
    },

    // ═══════════════════════════════════════════
    // НАЛАДЧИК (20–39)
    // Heal, Battle Heal, Might, Shield, Wind Walk
    // ═══════════════════════════════════════════
    TEC_REPAIR: {
        id: 'tec_repair', name: 'Ремонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'technomancer', levelReq: 20, energyCost: 24, cooldown: 4, chargeTime: 1.2, range: 12,
        healPercent: 0.28,
        description: 'Ремонт выбранной цели — восстанавливает заметную часть прочности',
        icon: 'assets/skills/technomancer/tec_repair.webp', maxLevel: 9, effectPerLevel: { healPercent: 0.04 },
    },
    TEC_GROUP_OVERHAUL: {
        id: 'tec_group_overhaul', name: 'Групповая переборка',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.PARTY,
        class: 'technomancer', levelReq: 24, energyCost: 36, cooldown: 16, chargeTime: 1.4, range: 12,
        healPercent: 0.18,
        description: 'Лёгкий ремонт всей группы',
        icon: 'assets/skills/technomancer/tec_group_overhaul.webp', maxLevel: 7, effectPerLevel: { healPercent: 0.03 },
    },
    TEC_MIGHT: {
        id: 'tec_might', name: 'Усиление привода',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'technomancer', levelReq: 20, energyCost: 16, cooldown: 8, chargeTime: 0.6, range: 12,
        duration: 300, attackBoost: 0.12,
        description: 'Усиливает привод цели: сильнее удары на несколько минут',
        icon: 'assets/skills/technomancer/tec_might.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.03 },
    },
    TEC_SHIELD: {
        id: 'tec_shield', name: 'Экран брони',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'technomancer', levelReq: 22, energyCost: 16, cooldown: 8, chargeTime: 0.6, range: 12,
        duration: 300, defenseBoost: 0.12,
        description: 'Экран брони на цели: выше физическая защита',
        icon: 'assets/skills/technomancer/tec_shield.webp', maxLevel: 5, effectPerLevel: { defenseBoost: 0.03 },
    },
    TEC_SERVO_BOOST: {
        id: 'tec_servo_boost', name: 'Серво-ускорение',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'technomancer', levelReq: 26, energyCost: 18, cooldown: 10, chargeTime: 0.5, range: 12,
        duration: 300, speedBoost: 0.2,
        description: 'Разгоняет сервоприводы: цель бежит быстрее',
        icon: 'assets/skills/technomancer/tec_servo_boost.webp', maxLevel: 3, effectPerLevel: { speedBoost: 0.05 },
    },
    TEC_PROTOCOL_BUFF: {
        id: 'tec_protocol_buff', name: 'Протокол привода',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.PARTY,
        class: 'technomancer', levelReq: 28, energyCost: 28, cooldown: 35, chargeTime: 0.8, range: 21,
        duration: 1200, attackBoost: 0.12,
        description: 'Протокол для всей группы: усиление ударов надолго',
        icon: 'assets/skills/technomancer/tec_protocol_buff.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.03 },
    },
    TEC_PROTOCOL_BLESS: {
        id: 'tec_protocol_bless', name: 'Протокол оболочки',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.PARTY,
        class: 'technomancer', levelReq: 24, energyCost: 25, cooldown: 30, chargeTime: 0.5, range: 21,
        duration: 1200, defenseBoost: 0.12,
        description: 'Протокол для всей группы: усиление брони надолго',
        icon: 'assets/skills/technomancer/tec_protocol_bless.webp', maxLevel: 5, effectPerLevel: { defenseBoost: 0.03 },
    },
    TEC_BATTLE_REPAIR: {
        id: 'tec_battle_repair', name: 'Боевой ремонт',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'technomancer', levelReq: 32, energyCost: 30, cooldown: 6, chargeTime: 0.6, range: 12,
        healPercent: 0.2,
        description: 'Быстрый ремонт в бою',
        icon: 'assets/skills/technomancer/tec_battle_repair.webp', maxLevel: 5, effectPerLevel: { healPercent: 0.035 },
    },
    TEC_QUICK_RECOVERY: {
        id: 'tec_quick_recovery', name: 'Быстрое восстановление',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'technomancer', levelReq: 21,
        description: 'Пассивно: сильнее ремонт и больше запас пара',
        icon: 'assets/skills/technomancer/tec_quick_recovery.webp', maxLevel: 5, effectPerLevel: { healPower: 0.05, energyPercent: 0.04 }
    },
    TEC_RESIST_CORROSION: {
        id: 'tec_resist_corrosion', name: 'Антикоррозия',
        type: SKILL_TYPES.PASSIVE, category: SKILL_CATEGORIES.BUFF,
        class: 'technomancer', levelReq: 28,
        description: 'Пассивно: лучше держит схемные атаки',
        icon: 'assets/skills/technomancer/tec_resist_corrosion.webp', maxLevel: 5, effectPerLevel: { cDefPercent: 0.06 }
    },

    // ═══════════════════════════════════════════
    // 2-я: Страж Котла / Инженер-Ремонтник (40)
    // ═══════════════════════════════════════════
    BG_IRON_WILL: {
        id: 'bg_iron_will', name: 'Железная воля',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'boiler_guardian', levelReq: 40, energyCost: 40, cooldown: 60, chargeTime: 0,
        duration: 20, defenseBoost: 0.5, immunityCC: true,
        description: 'Кратко: почти не сбивают с толку и сильно растёт защита',
        icon: 'assets/skills/boiler_guardian/bg_iron_will.webp', maxLevel: 3, effectPerLevel: { defenseBoost: 0.1, duration: 3 }
    },
    BG_DRAIN_STRIKE: {
        id: 'bg_drain_strike', name: 'Вытягивающий удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'boiler_guardian', levelReq: 40, energyCost: 28, cooldown: 8, chargeTime: 0, range: 3,
        skillPower: 1.8, damageType: 'physical', lifeSteal: 0.35,
        description: 'Физический удар, часть урона возвращается вам как прочность',
        icon: 'assets/skills/boiler_guardian/bg_drain_strike.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.15, lifeSteal: 0.05 }
    },
    RE_MASS_REPAIR: {
        id: 're_mass_repair', name: 'Массовый ремонт',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.PARTY,
        class: 'repair_engineer', levelReq: 40, energyCost: 45, cooldown: 18, chargeTime: 1.5, range: 14,
        healPercent: 0.3,
        description: 'Мощный ремонт всей группы',
        icon: 'assets/skills/repair_engineer/re_mass_repair.webp', maxLevel: 5, effectPerLevel: { healPercent: 0.05 }
    },
    RE_SACRED_ARMOR: {
        id: 're_fortress_plate', name: 'Крепостная плита',
        deviceReq: { type: 'bracers', slot: 'bracelet', name: 'Наручи-компенсаторы' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.TARGET,
        class: 'repair_engineer', levelReq: 40, energyCost: 30, cooldown: 25, chargeTime: 0.6, range: 10,
        duration: 60, defenseBoost: 0.25, hpRegen: 8,
        description: 'Укрепляет союзника: выше защита и лёгкое восстановление прочности',
        icon: 'assets/skills/repair_engineer/re_fortress_plate.webp', maxLevel: 3, effectPerLevel: { defenseBoost: 0.08 }
    },

    // ═══════════════════════════════════════════
    // 2-я: Подрывник / Берсерк / Снайпер / Артиллерист
    // ═══════════════════════════════════════════
    DEM_WHIRLWIND: {
        id: 'dem_whirlwind', name: 'Вихрь молота',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'demolitionist', levelReq: 40, energyCost: 40, cooldown: 12, chargeTime: 0.8, range: 0,
        aoeRadius: 5, skillPower: 2.4, damageType: 'physical',
        description: 'Круговой удар молотом по всем вокруг',
        icon: 'assets/skills/demolitionist/dem_whirlwind.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2, aoeRadius: 0.4 },
    },
    SB_TRIPLE_SLASH: {
        id: 'sb_triple_slash', name: 'Тройной удар',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'steam_berserker', levelReq: 40, energyCost: 30, cooldown: 8, chargeTime: 0, range: 3,
        skillPower: 3.0, damageType: 'physical', hits: 3,
        description: 'Три быстрых удара подряд по одной цели',
        icon: 'assets/skills/steam_berserker/sb_triple_slash.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.25 },
    },
    PS_DOUBLE_SHOT: {
        id: 'ps_double_shot', name: 'Двойной выстрел',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'pneumatic_sniper', levelReq: 40, energyCost: 28, cooldown: 6, chargeTime: 0.4, range: 14,
        skillPower: 2.6, damageType: 'physical', hits: 2, critBonus: 0.2,
        description: 'Два точных выстрела подряд',
        icon: 'assets/skills/pneumatic_sniper/ps_double_shot.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2 },
    },
    AE_MORTAR: {
        id: 'ae_mortar', name: 'Миномётный залп',
        deviceReq: { type: 'compressor', slot: 'necklace', name: 'Паровой нагнетатель' },
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'artillery_engineer', levelReq: 40, energyCost: 38, cooldown: 14, chargeTime: 1.0, range: 16,
        aoeRadius: 6, skillPower: 2.5, damageType: 'physical',
        description: 'Дальний залп по площади',
        icon: 'assets/skills/artillery_engineer/ae_mortar.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2, aoeRadius: 0.4 }
    },

    // ═══════════════════════════════════════════
    // 2-я: Мастер Давления / Дрон-Оператор / Коррозионист
    // ═══════════════════════════════════════════
    PM_PRESSURE_STORM: {
        id: 'pm_pressure_storm', name: 'Буря давления',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'pressure_sorcerer', levelReq: 40, energyCost: 50, cooldown: 14, chargeTime: 1.4, range: 12,
        aoeRadius: 6, skillPower: 2.4, damageType: 'circuit',
        description: 'Волна давления: схемный урон по площади',
        icon: 'assets/skills/pressure_sorcerer/pm_pressure_storm.webp', maxLevel: 5, effectPerLevel: { skillPower: 0.2, aoeRadius: 0.4 }
    },
    DO_DEPLOY_DRONE: {
        id: 'do_deploy_drone', name: 'Выпуск дрона',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.UTILITY, target: TARGET_TYPES.SELF,
        class: 'machine_warlock', levelReq: 40, energyCost: 45, cooldown: 60, chargeTime: 1.5,
        duration: 120, summonId: 'combat_drone',
        description: 'Выпускает боевого дрона на ограниченное время',
        icon: 'assets/skills/machine_warlock/do_deploy_drone.webp', maxLevel: 3, effectPerLevel: { duration: 30 }
    },
    CC_CORRODE: {
        id: 'cc_corrode', name: 'Коррозия контура',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'circuit_necro', levelReq: 40, energyCost: 32, cooldown: 8, chargeTime: 0.8, range: 12,
        skillPower: 0.9, damageType: 'circuit',
        dotDamage: 18, dotDuration: 12, defenseReduction: 0.15,
        description: 'Коррозия: урон со временем и ослабление брони цели',
        icon: 'assets/skills/circuit_necro/cc_corrode.webp', maxLevel: 5, effectPerLevel: { dotDamage: 5, defenseReduction: 0.03 }
    },
    OM_RESURRECT: {
        id: 'om_reboot', name: 'Перезапуск узла',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'overhaul_master', levelReq: 40, energyCost: 80, cooldown: 120, chargeTime: 3.0, range: 10,
        healPercent: 0.5, resurrect: true,
        description: 'Перезапуск поверженного союзника (50% HP)',
        icon: 'assets/skills/overhaul_master/om_reboot.webp', maxLevel: 3, effectPerLevel: { healPercent: 0.1 },
    },
    PD_PARTY_PROTOCOL: {
        id: 'pd_party_protocol', name: 'Групповой протокол',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.PARTY,
        class: 'protocol_prophet', levelReq: 40, energyCost: 40, cooldown: 40, chargeTime: 1.0, range: 14,
        duration: 180, attackBoost: 0.15, defenseBoost: 0.12, speedBoost: 0.1,
        description: 'Полный боевой протокол группе на 3 мин',
        icon: 'assets/skills/protocol_prophet/pd_party_protocol.webp', maxLevel: 5, effectPerLevel: { attackBoost: 0.03, defenseBoost: 0.03 }
    },

    // ═══════════════════════════════════════════
    // ITALIAN BRAINROT MEME SKILLS (class: any)
    // Свитки с secret-боссов. Видимый flex + урон.
    // ═══════════════════════════════════════════
    BR_SKIBIDI_SLAM: {
        id: 'br_skibidi_slam', name: 'Skibidi Slam',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'any', levelReq: 1, energyCost: 18, cooldown: 18, chargeTime: 0.6, range: 5,
        aoeRadius: 4.5, skillPower: 1.65, damageType: 'physical',
        free: true, meme: true, maxLevel: 1, spCost: 0,
        description: 'Dop dop yes yes — паровой удар по площади. Мем-VFX. Свиток: Skibidi Steamino.',
        icon: 'assets/skills/special/br_skibidi_slam.webp'
    },
    BR_TRALALA_WAVE: {
        id: 'br_tralala_wave', name: 'Tralala Wave',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'any', levelReq: 1, energyCost: 16, cooldown: 16, chargeTime: 0.5, range: 6,
        aoeRadius: 5, skillPower: 1.45, damageType: 'circuit',
        free: true, meme: true, maxLevel: 1, spCost: 0,
        description: 'Радужная волна «tralalero tralala». Мем-VFX. Свиток: Toasterino.',
        icon: 'assets/skills/special/br_tralala_wave.webp'
    },
    BR_BOMBARDIRO_DIVE: {
        id: 'br_bombardiro_dive', name: 'Bombardiro Dive',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'any', levelReq: 1, energyCost: 22, cooldown: 20, chargeTime: 0.8, range: 8,
        skillPower: 2.1, damageType: 'physical',
        free: true, meme: true, maxLevel: 1, spCost: 0,
        description: 'Пикирование-смузи. Яркий огненный VFX. Свиток: Blendodilo.',
        icon: 'assets/skills/special/br_bombardiro_dive.webp'
    },
    BR_TUNG_SUCTION: {
        id: 'br_tung_suction', name: 'Tung Suction',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.DEBUFF, target: TARGET_TYPES.TARGET,
        class: 'any', levelReq: 1, energyCost: 14, cooldown: 14, chargeTime: 0.4, range: 10,
        skillPower: 1.2, damageType: 'circuit', duration: 5, slowPercent: 0.4,
        free: true, meme: true, maxLevel: 1, spCost: 0,
        description: 'Tung tung tung — вакуумный притяг/замедление + VFX. Свиток: Vacuum Sahur.',
        icon: 'assets/skills/special/br_tung_suction.webp'
    },
    BR_CAPPUCCINO_SPIN: {
        id: 'br_cappuccino_spin', name: 'Cappuccino Spin',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.AOE,
        class: 'any', levelReq: 1, energyCost: 24, cooldown: 22, chargeTime: 0.7, range: 4,
        aoeRadius: 4, skillPower: 1.9, damageType: 'circuit',
        free: true, meme: true, maxLevel: 1, spCost: 0,
        description: 'Пируэт en pointe с золотой пенкой. Мем-VFX. Свиток: Ballerina Cappuccino.',
        icon: 'assets/skills/special/br_cappuccino_spin.webp'
    },

    // ═══════════════════════════════════════════
    // TEST / DEBUG
    // ═══════════════════════════════════════════
    TEST_IMMORTAL: {
        id: 'test_immortal', name: 'Бессмертие (тест)',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'any', levelReq: 1, energyCost: 0, cooldown: 2, chargeTime: 0, range: 0,
        duration: 600, immortal: true, invulnerable: true, fullHeal: true,
        free: true, starter: true, test: true, maxLevel: 1, spCost: 0,
        description: 'ТЕСТ: полный иммунитет к урону на 10 мин + полное восстановление ОЗ. Для отладки.',
        icon: 'assets/skills/special/test_immortal.webp'
    },
    GM_ONESHOT: {
        id: 'gm_oneshot', name: 'ГМ Ваншот',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.ATTACK, target: TARGET_TYPES.TARGET,
        class: 'any', levelReq: 1, energyCost: 0, cooldown: 1, chargeTime: 0, range: 45, effectRange: 60,
        skillPower: 999999, damageType: 'physical',
        oneshot: true, gm: true, free: true, starter: true, test: true, maxLevel: 1, spCost: 0,
        description: 'GM: Мгновенный ваншот цели (моба или игрока) с большой дистанции без расхода пара.',
        icon: 'assets/skills/special/gm_oneshot.webp'
    },
    GM_RESURRECT: {
        id: 'gm_resurrect', name: 'Благословение Возрождения',
        type: SKILL_TYPES.ACTIVE, category: SKILL_CATEGORIES.HEAL, target: TARGET_TYPES.TARGET,
        class: 'any', levelReq: 1, energyCost: 0, cooldown: 1, chargeTime: 0, range: 45, effectRange: 60,
        gm: true, free: true, starter: true, test: true, maxLevel: 1, spCost: 0,
        description: 'GM: Мгновенное воскрешение павшего игрока на месте гибели со 100% ОЗ и пара (или полное восстановление живой цели).',
        icon: 'assets/skills/special/gm_resurrect.webp'
    },
    GM_FLASH: {
        id: 'gm_flash', name: 'Скорость Флэша',
        type: SKILL_TYPES.TOGGLE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'any', levelReq: 1, energyCost: 0, cooldown: 0.5, chargeTime: 0, range: 0,
        speedBoost: 2.5, gm: true, free: true, starter: true, test: true, maxLevel: 1, spCost: 0,
        description: 'GM: Сверхчеловеческая скорость в стиле Флэша (3.5x). Молнии Спидфорса, фантомные следы и электрические дуги.',
        icon: 'assets/skills/special/gm_flash.webp'
    },
    GM_SPEED: {
        id: 'gm_speed', name: 'Скорость Флэша',
        type: SKILL_TYPES.TOGGLE, category: SKILL_CATEGORIES.BUFF, target: TARGET_TYPES.SELF,
        class: 'any', levelReq: 1, energyCost: 0, cooldown: 0.5, chargeTime: 0, range: 0,
        speedBoost: 2.5, gm: true, free: true, starter: true, test: true, maxLevel: 1, spCost: 0,
        description: 'GM: Сверхчеловеческая скорость в стиле Флэша (3.5x). Молнии Спидфорса, фантомные следы и электрические дуги.',
        icon: 'assets/skills/special/gm_flash.webp'
    }
};

// ─── Индекс ───
const SKILL_BY_ID = Object.create(null);
(function indexSkills() {
    Object.keys(SKILL_DATABASE).forEach(function (key) {
        const s = SKILL_DATABASE[key];
        if (!s) return;
        SKILL_BY_ID[key] = s;
        SKILL_BY_ID[key.toLowerCase()] = s;
        if (s.id) {
            SKILL_BY_ID[s.id] = s;
            SKILL_BY_ID[String(s.id).toLowerCase()] = s;
        }
    });
    // merge shared L2 C1 metadata (names, SP)
    if (typeof window !== 'undefined' && window.SKILL_DB && window.SKILL_DB.SKILLS) {
        Object.keys(window.SKILL_DB.SKILLS).forEach(function (id) {
            const shared = window.SKILL_DB.SKILLS[id];
            const local = SKILL_BY_ID[id];
            if (local) {
                // shared skill-db = C1 authority (ranks / l2Power / costs / passives)
                if (shared.l2Name) local.l2Name = shared.l2Name;
                if (shared.spCost != null) local.spCost = shared.spCost;
                if (shared.l2Class) local.l2Class = shared.l2Class;
                if (shared.ranks) local.ranks = shared.ranks;
                if (shared.skillPower != null) local.skillPower = shared.skillPower;
                if (shared.energyCost != null) local.energyCost = shared.energyCost;
                if (shared.cooldown != null) local.cooldown = shared.cooldown;
                if (shared.chargeTime != null) local.chargeTime = shared.chargeTime;
                if (shared.range != null) local.range = shared.range;
                if (shared.effectRange != null) local.effectRange = shared.effectRange;
                if (shared.l2CastRange != null) local.l2CastRange = shared.l2CastRange;
                if (shared.l2EffectRange != null) local.l2EffectRange = shared.l2EffectRange;
                if (shared.maxLevel != null) local.maxLevel = shared.maxLevel;
                if (shared.levelReq != null) local.levelReq = shared.levelReq;
                if (shared.description) local.description = shared.description;
                if (shared.effectPerLevel) local.effectPerLevel = shared.effectPerLevel;
                if (shared.free != null) local.free = shared.free;
                if (shared.starter != null) local.starter = shared.starter;
            } else if (shared) {
                SKILL_BY_ID[id] = shared;
                SKILL_DATABASE[id] = shared;
            }
        });
    }
    // full meta map (authoritative l2Name + SP)
    if (typeof window !== 'undefined' && window.L2_SKILL_META && window.L2_SKILL_META.applyToSkill) {
        Object.keys(SKILL_BY_ID).forEach(function (id) {
            const s = SKILL_BY_ID[id];
            if (s && s.id) window.L2_SKILL_META.applyToSkill(s);
        });
    }
})();

function resolveSkill(skillId) {
    if (!skillId) return null;
    return SKILL_BY_ID[skillId] || SKILL_BY_ID[String(skillId).toLowerCase()] || null;
}

/**
 * Ранг умения (1-based). ranks[] — точные C1-цифры из skilldata / L2Hub.
 * @returns {object|null}
 */
function skillRankData(template, level) {
    if (!template) return null;
    level = Math.max(1, level || 1);
    if (template.ranks && template.ranks.length) {
        const idx = Math.min(level, template.ranks.length) - 1;
        return template.ranks[idx] || null;
    }
    return null;
}

/** Значение поля с приоритетом ranks[] → effectPerLevel → base. */
function skillValueAtLevel(template, key, level) {
    if (!template) return null;
    level = Math.max(1, level || 1);
    const r = skillRankData(template, level);
    if (r && r[key] != null) return r[key];
    if (template[key] == null) return null;
    const per = (template.effectPerLevel && template.effectPerLevel[key]) || 0;
    return template[key] + per * (level - 1);
}

/**
 * Power умения для формулы урона.
 * Если ranks[].l2Power задан — возвращает АБСОЛЮТНЫЙ Power skilldata C1
 * (Wind Strike=12, Ice Bolt=8…) — без масштабирования.
 * Иначе — относительный множитель (1.0 = автоатака) для legacy-умений.
 */
function skillPowerAtLevel(template, level) {
    level = Math.max(1, level || 1);
    const r = skillRankData(template, level);
    if (r && r.l2Power != null) return +r.l2Power;
    if (r && r.skillPower != null) return +r.skillPower;
    let p = template.skillPower != null ? template.skillPower
        : (template.damageMult != null ? template.damageMult : 1.0);
    const per = (template.effectPerLevel && (template.effectPerLevel.skillPower != null
        ? template.effectPerLevel.skillPower
        : template.effectPerLevel.damageMult)) || 0;
    return p + per * (level - 1);
}

/**
 * C1 MP/Energy cost (L2 total = mpConsume + mpInitialConsume in skilldata):
 *   final = Round(base × equipMod × levelPenalty)
 * equipMod: mag wand/staff ≈ 0.90; fist/phys 1.0
 * levelPenalty if char level < skill levelReq
 */
function skillEnergyCost(template, level, player) {
    const v = skillValueAtLevel(template, 'energyCost', level);
    let base = v != null ? v : (template.energyCost || 0);
    // ranks may have lower C1 base MP
    const rank = skillRankData(template, level);
    if (rank && rank.energyCost != null) base = rank.energyCost;

    player = player || (typeof window !== 'undefined' && window.game && window.game.player) || null;
    let weaponClass = 'fist';
    let pl = 1;
    if (player) {
        pl = player.level || 1;
        if (player.getWeaponProfile) {
            const wp = player.getWeaponProfile();
            if (wp && wp.weaponClass) weaponClass = wp.weaponClass;
        } else if (player.weaponClass) {
            weaponClass = player.weaponClass;
        }
    }
    const skillReq = (rank && rank.levelReq != null)
        ? rank.levelReq
        : (template.levelReq || 1);

    if (window.L2_COMBAT && window.L2_COMBAT.mpCostFinal) {
        return window.L2_COMBAT.mpCostFinal(base, weaponClass, pl, skillReq);
    }
    // fallback: mag weapon −10%
    let equip = 1.0;
    if (weaponClass === '1h_blunt' || weaponClass === 'wand' ||
        weaponClass === '2h_staff' || weaponClass === 'blunt') equip = 0.90;
    let lvlPen = 1.0;
    if (pl < skillReq) lvlPen = 1 + Math.min(0.5, (skillReq - pl) * 0.1);
    return Math.max(1, Math.floor(base * equip * lvlPen));
}

/**
 * Числа для UI: пар, радиус, подготовка, перезарядка (по уровню умения).
 * @returns {{ energy: number, range: number|null, aoe: number|null, charge: number, cooldown: number, target: string }}
 */
function skillStatsAtLevel(template, level, player) {
    if (!template) {
        return { energy: 0, range: null, aoe: null, charge: 0, cooldown: 0, target: '' };
    }
    level = Math.max(1, level || 1);
    const energy = skillEnergyCost(template, level, player);
    let range = skillValueAtLevel(template, 'range', level);
    if (range == null) range = template.range;
    let aoe = skillValueAtLevel(template, 'aoeRadius', level);
    if (aoe == null) aoe = template.aoeRadius;
    let charge = skillValueAtLevel(template, 'chargeTime', level);
    if (charge == null) charge = template.chargeTime || 0;
    let cooldown = skillValueAtLevel(template, 'cooldown', level);
    if (cooldown == null) cooldown = template.cooldown || 0;
    const tgt = template.target || '';
    return {
        energy: energy | 0,
        range: range != null ? +range : null,
        aoe: aoe != null ? +aoe : null,
        charge: +charge || 0,
        cooldown: +cooldown || 0,
        target: tgt
    };
}

/**
 * Строка для тултипа / списка: «Пар: 9 · Радиус: 30 м · …»
 * @param {boolean} [includeDesc] — приклеить description в начало
 */
function formatSkillStatsLine(template, level, player, includeDesc) {
    if (!template) return '';
    level = Math.max(1, level || 1);
    const st = skillStatsAtLevel(template, level, player);
    const parts = [];
    if (includeDesc && template.description) parts.push(String(template.description).trim());

    const isPassive = template.type === SKILL_TYPES.PASSIVE || template.type === 'passive';
    const isSelf = st.target === TARGET_TYPES.SELF || st.target === 'self';
    const fmtM = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1)) + ' м';
    const fmtS = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1)) + ' с';

    if (!isPassive) {
        if (st.energy > 0) parts.push('Пар: ' + st.energy);
        else if (template.type === SKILL_TYPES.ACTIVE || template.type === 'active' ||
                 template.type === SKILL_TYPES.TOGGLE || template.type === 'toggle') {
            parts.push('Пар: 0');
        }
        if (isSelf) {
            parts.push('На себя');
        } else if (st.target === TARGET_TYPES.PARTY || st.target === 'party') {
            parts.push('На группу');
            if (st.range != null && st.range > 0) parts.push('Радиус: ' + fmtM(st.range));
        } else if (st.range != null && st.range > 0) {
            parts.push('Радиус: ' + fmtM(st.range));
        } else if (st.target === TARGET_TYPES.TARGET || st.target === 'target' ||
                   st.target === TARGET_TYPES.AOE || st.target === 'aoe') {
            parts.push('Радиус: ближний');
        }
        if (st.aoe != null && st.aoe > 0) parts.push('Область: ' + fmtM(st.aoe));
        if (st.charge > 0) parts.push('Подготовка: ' + fmtS(st.charge));
        if (st.cooldown > 0) parts.push('Перезарядка: ' + fmtS(st.cooldown));
    }
    return parts.join(' · ');
}

/**
 * Стоимость изучения/апгрейда умения в SP.
 * Если ranks[n].spCost задан — точное значение C1; иначе формула ×1.65.
 */
function skillSpCost(template, nextLevel) {
    if (!template) return 0;
    nextLevel = Math.max(1, nextLevel || 1);
    if (template.free === true && nextLevel === 1) return 0;
    const r = skillRankData(template, nextLevel);
    if (r && r.spCost != null) return r.spCost | 0;
    // shared C1 table
    if (window.SKILL_DB && window.SKILL_DB.spCost) {
        return window.SKILL_DB.spCost(template, nextLevel, window.L2_EXP_TABLE);
    }
    if (window.L2_EXP_TABLE && window.L2_EXP_TABLE.skillSpCost) {
        return window.L2_EXP_TABLE.skillSpCost(
            template.levelReq || 1, nextLevel, template.spCost, template.maxLevel
        );
    }
    const base = template.spCost != null
        ? template.spCost
        : Math.max(50, (template.levelReq || 1) * 40 + (template.type === 'passive' ? 30 : 50));
    let mult = 1;
    for (let i = 1; i < nextLevel; i++) mult *= 1.65;
    return Math.floor(base * mult);
}

/** Требуемый уровень персонажа для данного ранга. */
function skillLevelReqForRank(template, rank) {
    const r = skillRankData(template, rank);
    if (r && r.levelReq != null) return r.levelReq;
    return template.levelReq || 1;
}

// ============================================
// МЕНЕДЖЕР УМЕНИЙ
// ============================================
class SkillManager {
    constructor(player) {
        this.player = player;
        this.learnedSkills = {};
        this.cooldowns = {};
        this.activeToggles = new Set();
        this.skillPoints = 0;
        /** @type {null|{skillId,template,level,target,energyNeed,endsAt,totalMs,startX,startZ}} */
        this.casting = null;
        this.initStartingSkills();
    }

    /**
     * Эффективное время каста (сек) — Interlude:
     *   Current Cast Time = BaseCastTime × 333 / M.Spd
     */
    getEffectiveChargeTime(template, level) {
        if (!template) return 0;
        let base = skillValueAtLevel(template, 'chargeTime', level);
        if (base == null) base = template.chargeTime || 0;
        base = +base || 0;
        if (base <= 0) return 0;
        const mSpd = this.getMAtkSpd();
        if (window.L2_COMBAT && window.L2_COMBAT.castTimeSec) {
            return window.L2_COMBAT.castTimeSec(base, mSpd);
        }
        return base * 333 / Math.max(1, mSpd);
    }

    /**
     * Casting Spd C1: 166 bare | 208 robe (+25%) | 240 Devotion (+15% set)
     */
    getMAtkSpd() {
        const p = this.player;
        if (!p) return 166;
        const wit = (p.primary && p.primary.WIT != null)
            ? p.primary.WIT
            : ((p.stats && p.stats.WIT) || 20);
        const spellPct = (p.passiveBonuses && p.passiveBonuses.chargeSpeed) || 0;
        const setPct = (p.passiveBonuses && p.passiveBonuses.castSpeedSet) || 0;
        if (window.L2_COMBAT && window.L2_COMBAT.mAtkSpd) {
            return window.L2_COMBAT.mAtkSpd(wit, spellPct, setPct);
        }
        const base = Math.floor(183 * Math.pow(1.009, wit - 30.88));
        return Math.round(base * (1 + spellPct) * (1 + (spellPct > 0 ? setPct : 0)));
    }

    /** UI mult vs 333 (cast formula baseline) */
    getChargeSpeed() {
        return Math.max(0.1, this.getMAtkSpd() / 333);
    }

    cancelCast(reason) {
        if (!this.casting) return;
        const name = (this.casting.template && this.casting.template.name) || this.casting.skillId;
        this.casting = null;
        if (this.player && this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
        if (window.SkillVFX) window.SkillVFX.stopCast(true);
        if (window.game && window.game.addChatMessage) {
            window.game.addChatMessage('Каст прерван' + (reason ? ': ' + reason : '') + ' (' + name + ')', 'system');
        }
        if (window.game && window.game.ui && window.game.ui.hideCastBar) {
            window.game.ui.hideCastBar();
        }
        if (window.game && window.game.net && window.game.net.send) {
            window.game.net.send({ t: 'cast_cancel' });
        }
        // leave cast pose → idle
        this._stopSkillAnim();
    }

    /**
     * Map skill template → man.glb cast role:
     *   heal/buff → Heal [0]
     *   lifeSteal / drain → Vamp [14]
     *   attack/debuff/other → skil [13]
     * @param {object} template
     * @returns {'heal'|'skill'|'vamp'}
     */
    getSkillAnimKind(template) {
        if (!template) return 'skill';
        const cat = template.category;
        if (cat === SKILL_CATEGORIES.HEAL || cat === 'heal' ||
            cat === SKILL_CATEGORIES.BUFF || cat === 'buff') {
            return 'heal';
        }
        const ls = template.lifeSteal != null ? +template.lifeSteal : 0;
        if (ls > 0) return 'vamp';
        const id = String(template.id || '');
        if (/drain|vamp|absorb|leech/i.test(id)) return 'vamp';
        return 'skill';
    }

    /**
     * Play cast body anim on player char model.
     * @param {object} template
     * @param {{ hold?: boolean, durationSec?: number }} [opts]
     *   hold=true — charged cast (anim scaled to durationSec)
     *   hold=false — instant one-shot
     *   durationSec — effective cast time (anim timeScale = clipDur / durationSec)
     */
    _playSkillAnim(template, opts) {
        opts = opts || {};
        const p = this.player;
        if (!p || !p._charModel) return;
        const cm = p._charModel;
        if (typeof cm.playCast !== 'function') return;
        // AA punch must not fight cast clip — пауза, не выключение
        if (p.pauseAutoAttackForSkill) p.pauseAutoAttackForSkill();
        const kind = this.getSkillAnimKind(template);
        const hold = !!opts.hold;
        const durationSec = opts.durationSec != null ? +opts.durationSec : 0;
        try {
            cm.playCast(kind, function () {
                // Instant (LoopOnce): leave cast when clip ends
                if (!hold && cm.state === 'cast' && typeof cm.playIdle === 'function') {
                    cm.playIdle();
                }
            }, { hold: hold, durationSec: durationSec });
        } catch (e) {
            console.warn('[cast] playCast', kind, e);
        }
    }

    /** Soft leave cast pose after skill ends / cancel. */
    _stopSkillAnim() {
        const p = this.player;
        if (!p || !p._charModel) return;
        const cm = p._charModel;
        if (cm.state === 'cast' && typeof cm.playIdle === 'function') {
            try { cm.playIdle(); } catch (e) { /* ignore */ }
        }
    }

    getCastProgress() {
        if (!this.casting) return null;
        const now = performance.now();
        const left = Math.max(0, this.casting.endsAt - now);
        const pct = 1 - left / Math.max(1, this.casting.totalMs);
        return {
            skillId: this.casting.skillId,
            name: (this.casting.template && this.casting.template.name) || this.casting.skillId,
            progress: Math.min(1, Math.max(0, pct)),
            remaining: left / 1000
        };
    }

    initStartingSkills() {
        const cls = (this.player && this.player.playerClass) || 'operator';
        const root = (window.CLASS_SYSTEM && window.CLASS_SYSTEM.rootClass)
            ? window.CLASS_SYSTEM.rootClass(cls)
            : (cls === 'engineer' || cls === 'constructor' || cls === 'technomancer' ? 'engineer' : 'operator');
        // free=true: стартовый набор без SP (как выдаёт mentor на 1-м уровне)
        if (root === 'engineer') {
            // C1 Human Mystic starters: Lucky, Expert Casting, Magician Movement,
            // Mana Recovery, Wind Strike, Self Heal
            this.learnSkill('eng_lucky', true, true);
            this.learnSkill('eng_expert_tune', true, true);
            this.learnSkill('eng_robe_step', true, true);
            this.learnSkill('eng_coolant_mind', true, true);
            this.learnSkill('eng_pressure_bolt', true, true);
            this.learnSkill('eng_self_repair', true, true);
        } else {
            this.learnSkill('op_power_strike', true, true);
            this.learnSkill('op_weapon_mastery', true, true);
        }
        // debug test skill — always available
        this.learnSkill('test_immortal', true, true);
        this.learnSkill('gm_oneshot', true, true);
        this.learnSkill('gm_resurrect', true, true);
        this.learnSkill('gm_flash', true, true);
        this.learnSkill('gm_speed', true, true);
        this.recalculatePassives();
    }

    _skillAllowedForClass(templateClass) {
        if (!templateClass || templateClass === 'any' || templateClass === 'all' || templateClass === '*') {
            return true;
        }
        const playerClass = (this.player && this.player.playerClass) || 'operator';
        if (templateClass === playerClass) return true;
        if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.classLineage) {
            const line = window.CLASS_SYSTEM.classLineage(playerClass);
            if (line.indexOf(templateClass) !== -1) return true;
        }
        if (templateClass === 'operator' || templateClass === 'engineer') {
            const root = (window.CLASS_SYSTEM && window.CLASS_SYSTEM.rootClass)
                ? window.CLASS_SYSTEM.rootClass(playerClass)
                : playerClass;
            if (templateClass === root) return true;
        }
        return false;
    }

    /** Текущий SP (отображение; трата SP — сервер). */
    _getSp() {
        if (this.player.levelSystem && this.player.levelSystem.sp != null) {
            return this.player.levelSystem.sp;
        }
        return this.player.sp || this.skillPoints || 0;
    }

    _spendSp(amount) {
        amount = Math.max(0, amount | 0);
        if (amount <= 0) return true;
        if (this.player.levelSystem) {
            if (this.player.levelSystem.sp < amount) return false;
            this.player.levelSystem.sp -= amount;
            this.player.sp = this.player.levelSystem.sp;
            return true;
        }
        const cur = this.player.sp != null ? this.player.sp : this.skillPoints;
        if (cur < amount) return false;
        this.player.sp = cur - amount;
        this.skillPoints = this.player.sp;
        return true;
    }

    /**
     * Изучить / поднять ранг умения.
     * @param {string} skillId
     * @param {boolean} [silent]
     * @param {string} [npcId] — тренер умений
     */
    learnSkill(skillId, silent, free, npcId) {
        const template = resolveSkill(skillId);
        if (!template) {
            console.error('[Skills] Умение не найдено:', skillId);
            return false;
        }
        skillId = template.id || skillId;

        if (!this._skillAllowedForClass(template.class)) {
            if (!silent && window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Недоступно для вашего класса.', 'system');
            }
            return false;
        }
        const playerLevel = this.player.levelSystem
            ? this.player.levelSystem.level
            : (this.player.level || 1);

        const current = this.learnedSkills[skillId] ? this.learnedSkills[skillId].level : 0;
        const maxL = (template.ranks && template.ranks.length)
            ? template.ranks.length
            : (template.maxLevel || 1);
        if (current >= maxL) {
            if (!silent && window.game) window.game.addChatMessage('Умение уже максимального уровня.', 'system');
            return false;
        }
        const nextLevel = current + 1;
        const needLv = skillLevelReqForRank(template, nextLevel);
        if (playerLevel < needLv) {
            if (!silent && window.game) {
                window.game.addChatMessage('Требуется уровень ' + needLv + ' (ранг ' + nextLevel + ').', 'system');
            }
            return false;
        }
        // Контур/рой: нельзя ИЗУЧИТЬ умение, пока прибор ниже req (не только каст)
        if (!free && this.player && typeof this.player.skillDeviceGate === 'function') {
            const gate = this.player.skillDeviceGate(template);
            if (gate === 'resonator') {
                const need = typeof this.player.resonatorReqForSkill === 'function'
                    ? this.player.resonatorReqForSkill(template, nextLevel) : 1;
                const have = typeof this.player.getCircuitLevel === 'function'
                    ? this.player.getCircuitLevel() : 0;
                const hasRes = typeof this.player.hasCircuitResonatorEquipped === 'function'
                    && this.player.hasCircuitResonatorEquipped();
                if (!hasRes) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Нужен паровой резонатор, чтобы изучить «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
                if (have < need) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Контур Ур.' + have + ' · нужно Ур.' + need +
                            ' для «' + template.name + '» (прокачай резонатор).',
                            'system'
                        );
                    }
                    return false;
                }
            } else if (gate === 'bracelet') {
                const need = typeof this.player.nanoReqForSkill === 'function'
                    ? this.player.nanoReqForSkill(template, nextLevel) : 1;
                const have = typeof this.player.getNanoLevel === 'function'
                    ? this.player.getNanoLevel() : 0;
                const hasBr = typeof this.player.hasNanoBraceletEquipped === 'function'
                    && this.player.hasNanoBraceletEquipped();
                if (!hasBr) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Нужны нано-браслеты, чтобы изучить «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
                if (have < need) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Связь роя Ур.' + have + ' · нужно Ур.' + need +
                            ' для «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
            } else if (gate === 'compressor') {
                const hasComp = typeof this.player.hasCompressorEquipped === 'function'
                    && this.player.hasCompressorEquipped();
                if (!hasComp) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Нужен паровой нагнетатель давления, чтобы изучить «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
                const need = typeof this.player.resonatorReqForSkill === 'function'
                    ? this.player.resonatorReqForSkill(template, nextLevel)
                    : 1;
                const have = typeof this.player.getValveLevel === 'function'
                    ? this.player.getValveLevel()
                    : (typeof this.player.getCircuitLevel === 'function' ? this.player.getCircuitLevel() : 1);
                if (have < need) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Клапан нагнетателя Ур.' + have + ' · нужно Ур.' + need +
                            ' для «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
            } else if (gate === 'bracers') {
                const hasBr = typeof this.player.hasOperatorBracersEquipped === 'function'
                    && this.player.hasOperatorBracersEquipped();
                if (!hasBr) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Нужны наручи-компенсаторы, чтобы изучить «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
                const need = typeof this.player.nanoReqForSkill === 'function'
                    ? this.player.nanoReqForSkill(template, nextLevel)
                    : 1;
                const have = typeof this.player.getWristLevel === 'function'
                    ? this.player.getWristLevel()
                    : (typeof this.player.getNanoLevel === 'function' ? this.player.getNanoLevel() : 1);
                if (have < need) {
                    if (!silent && window.game) {
                        window.game.addChatMessage(
                            'Компенсаторы наручей Ур.' + have + ' · нужно Ур.' + need +
                            ' для «' + template.name + '».',
                            'system'
                        );
                    }
                    return false;
                }
            }
        }
        const cost = free ? 0 : skillSpCost(template, nextLevel);

        // Платное изучение — только сервер
        if (!free) {
            if (window.game && window.game.net && window.game.net.intentLearnSkill) {
                window.game.net.intentLearnSkill(skillId, npcId);
                return true;
            }
            if (!silent && window.game) {
                window.game.addChatMessage('Нет связи с сервером — нельзя изучить умение.', 'system');
            }
            return false;
        }

        // free: локальная выдача ранга (квест/профа/autoLearn после skill_ok)
        if (this.learnedSkills[skillId]) {
            this.learnedSkills[skillId].level = nextLevel;
        } else {
            this.learnedSkills[skillId] = { level: 1 };
        }

        if (!silent && window.game) {
            window.game.addChatMessage(
                'Изучено: ' + template.name + ' (Ур. ' + this.learnedSkills[skillId].level + ')',
                'loot'
            );
        }
        this.recalculatePassives();
        if (this.player.levelSystem && typeof this.player.levelSystem.recalculateStats === 'function') {
            this.player.levelSystem.recalculateStats();
        } else if (typeof this.player.pullL2Stats === 'function') {
            this.player.pullL2Stats();
        }
        return true;
    }

    /**
     * Авто-изучение при level-up / смене класса (стартовые free-ранги).
     * L2: основные skills покупаются за SP; free — только стартовый набор.
     * Здесь: бесплатно 1-й ранг умений с levelReq <= level, помеченных free
     * или starter; остальные только уведомление в чат.
     */
    autoLearnSkills() {
        const playerLevel = this.player.levelSystem
            ? this.player.levelSystem.level
            : (this.player.level || 1);
        const available = this.getAvailableSkills();
        let learned = 0;
        let newlyAvailable = 0;

        available.forEach((template) => {
            const id = template.id;
            const cur = this.learnedSkills[id] ? this.learnedSkills[id].level : 0;
            // бесплатный 1-й ранг: free / starter / levelReq совпал с level-up (пассивка base)
            const isFreeFirst = cur === 0 && (
                template.free === true ||
                template.starter === true ||
                (template.type === SKILL_TYPES.PASSIVE && template.levelReq <= 5 && playerLevel >= template.levelReq)
            );
            if (isFreeFirst) {
                if (this.learnSkill(id, true, true)) learned++;
            } else if (cur === 0 && playerLevel >= template.levelReq) {
                newlyAvailable++;
            }
        });

        if (learned > 0 && window.game && window.game.addChatMessage) {
            window.game.addChatMessage('Авто-изучено умений: ' + learned, 'system');
        }
        if (newlyAvailable > 0 && window.game && window.game.addChatMessage) {
            window.game.addChatMessage(
                'Доступно новых умений для изучения за SP: ' + newlyAvailable + ' (окно K / Skills).',
                'loot'
            );
        }
        this.recalculatePassives();
        return { learned: learned, available: newlyAvailable };
    }

    /** Стоимость следующего ранга (для UI). */
    getUpgradeSpCost(skillId) {
        const template = resolveSkill(skillId);
        if (!template) return 0;
        const cur = this.learnedSkills[template.id || skillId]
            ? this.learnedSkills[template.id || skillId].level
            : 0;
        if (cur >= (template.maxLevel || 1)) return 0;
        return skillSpCost(template, cur + 1);
    }

    useSkill(skillId, target) {
        if (this.player && (this.player.isDead || this.player.hp <= 0)) {
            if (window.game) window.game.addChatMessage('Сначала вызовите медиков.', 'system');
            return false;
        }
        const template = resolveSkill(skillId);
        if (!template) return false;
        skillId = template.id || skillId;

        const learned = this.learnedSkills[skillId];
        if (!learned) {
            if (window.game) window.game.addChatMessage('Умение не изучено.', 'system');
            return false;
        }

        // Инженер: активные/toggle — только с оружием инженера + приборы (резонатор/браслеты)
        // Мем-скиллы brainrot (class:any) — без гейтов
        const isMemeSkill = !!(template.meme || template.class === 'any' || template.class === 'all');
        if (!isMemeSkill && this.player && typeof this.player.isEngineerClass === 'function' && this.player.isEngineerClass()) {
            if (template.type === SKILL_TYPES.ACTIVE || template.type === SKILL_TYPES.TOGGLE) {
                // База: любое оружие инженера в слоте weapon
                if (!this.player.hasEngineerWeaponEquipped ||
                    !this.player.hasEngineerWeaponEquipped()) {
                    if (window.game && window.game.addChatMessage) {
                        window.game.addChatMessage(
                            '⚠️ Нужно оружие инженера (катушка / контурный инструмент).',
                            'system'
                        );
                    }
                    return false;
                }

                const gate = typeof this.player.skillDeviceGate === 'function'
                    ? this.player.skillDeviceGate(template)
                    : null;
                const skillLv = (learned && learned.level) || 1;

                if (gate === 'bracelet') {
                    if (!this.player.hasNanoBraceletEquipped ||
                        !this.player.hasNanoBraceletEquipped()) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Нужны нано-браслеты — рой на запястьях.',
                                'system'
                            );
                        }
                        return false;
                    }
                    const need = typeof this.player.nanoReqForSkill === 'function'
                        ? this.player.nanoReqForSkill(template, skillLv)
                        : 1;
                    const have = typeof this.player.getNanoLevel === 'function'
                        ? this.player.getNanoLevel() : 0;
                    if (have < need) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Связь роя Ур.' + have + ' · нужно Ур.' + need +
                                ' («' + (template.name || skillId) + '»).',
                                'system'
                            );
                        }
                        return false;
                    }
                } else if (gate === 'resonator') {
                    if (!this.player.hasCircuitResonatorEquipped ||
                        !this.player.hasCircuitResonatorEquipped()) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Нужен паровой резонатор.',
                                'system'
                            );
                        }
                        return false;
                    }
                    const need = typeof this.player.resonatorReqForSkill === 'function'
                        ? this.player.resonatorReqForSkill(template, skillLv)
                        : 1;
                    const have = typeof this.player.getCircuitLevel === 'function'
                        ? this.player.getCircuitLevel()
                        : (typeof this.player.getResonatorLevel === 'function'
                            ? this.player.getResonatorLevel() : 0);
                    if (have < need) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Контур Ур.' + have + ' · нужно Ур.' + need +
                                ' («' + (template.name || skillId) + '»).',
                                'system'
                            );
                        }
                        return false;
                    }
                }
                // utility / craft — без прибора
            }
        }

        // Оператор и все его профессии: активные/toggle — нагнетатель (ДД) vs наручи (бафы/хил/дебафы/стойки)
        if (!isMemeSkill && this.player && typeof this.player.isOperatorClass === 'function' && this.player.isOperatorClass()) {
            if (template.type === SKILL_TYPES.ACTIVE || template.type === SKILL_TYPES.TOGGLE) {
                const gate = typeof this.player.skillDeviceGate === 'function'
                    ? this.player.skillDeviceGate(template)
                    : null;
                if (gate === 'compressor') {
                    if (!this.player.hasCompressorEquipped || !this.player.hasCompressorEquipped()) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Для этого умения нужен установленный паровой нагнетатель (слот шеи).',
                                'system'
                            );
                        }
                        return false;
                    }
                    const need = typeof this.player.resonatorReqForSkill === 'function'
                        ? this.player.resonatorReqForSkill(template, this.skills[skillId] || 1)
                        : 1;
                    const have = typeof this.player.getValveLevel === 'function'
                        ? this.player.getValveLevel()
                        : (typeof this.player.getCircuitLevel === 'function' ? this.player.getCircuitLevel() : 1);
                    if (have < need) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Клапан нагнетателя Ур.' + have + ' · нужно Ур.' + need +
                                ' для «' + template.name + '».',
                                'system'
                            );
                        }
                        return false;
                    }
                } else if (gate === 'bracers') {
                    if (!this.player.hasOperatorBracersEquipped || !this.player.hasOperatorBracersEquipped()) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Для этого умения требуются гидравлические наручи-компенсаторы (слот запястья).',
                                'system'
                            );
                        }
                        return false;
                    }
                    const need = typeof this.player.nanoReqForSkill === 'function'
                        ? this.player.nanoReqForSkill(template, this.skills[skillId] || 1)
                        : 1;
                    const have = typeof this.player.getWristLevel === 'function'
                        ? this.player.getWristLevel()
                        : (typeof this.player.getNanoLevel === 'function' ? this.player.getNanoLevel() : 1);
                    if (have < need) {
                        if (window.game && window.game.addChatMessage) {
                            window.game.addChatMessage(
                                '⚠️ Компенсаторы наручей Ур.' + have + ' · нужно Ур.' + need +
                                ' для «' + template.name + '».',
                                'system'
                            );
                        }
                        return false;
                    }
                }
            }
        }

        if (template.type === SKILL_TYPES.TOGGLE) return this.toggleSkill(skillId);

        // уже кастуем: тот же скилл — игнор (не срывать key-repeat), другой — смена каста
        if (this.casting) {
            if (this.casting.skillId === skillId) return true;
            this.cancelCast('новое умение');
        }

        // C1: оружие не даёт Casting Spd. Одиночный удар — короткий hit-lock.
        // Автоатака: скилл прерывает свинг, иначе лок = весь цикл AA.
        if (this.player && this.player.getWeaponCastLockRemaining) {
            const lock = this.player.getWeaponCastLockRemaining();
            const aaOn = !!(this.player.autoAttacking || this.player._skillHoldAA);
            if (lock > 0.02 && aaOn) {
                this.player.castLockUntil = 0;
            } else if (lock > 0.02) {
                if (window.game) {
                    window.game.addChatMessage(
                        'Анимация оружия… ' + lock.toFixed(2) + 'с',
                        'system'
                    );
                }
                return false;
            }
        }

        if (this.isOnCooldown(skillId)) {
            const remaining = this.getCooldownRemaining(skillId);
            if (window.game) window.game.addChatMessage('Перезарядка: ' + remaining.toFixed(1) + 'с', 'system');
            return false;
        }
        const energyNeed = skillEnergyCost(template, learned.level, this.player);
        if (this.player.energy < energyNeed) {
            if (window.game) window.game.addChatMessage('Недостаточно пара!', 'system');
            return false;
        }
        if (template.target === TARGET_TYPES.TARGET && !target) {
            target = this.player.target;
            if (!target) {
                if (window.game) window.game.addChatMessage('Нет цели.', 'system');
                return false;
            }
        }
        if (target && template.range && target.mesh && this.player.mesh) {
            const dist = this._distXZ(this.player.mesh.position, target.mesh.position);
            const reqRange = this.getSkillRange(skillId);
            if (dist > reqRange) {
                // Канонический авто-каст: подбежать к цели на дистанцию скилла и автоматически начать каст.
                // AA не гасим — только пауза, после каста продолжится.
                if (this.player.pauseAutoAttackForSkill) this.player.pauseAutoAttackForSkill();
                if (this.player.moveTo) this.player.moveTo(target.mesh.position);
                this.pendingSkill = {
                    skillId: skillId,
                    target: target,
                    requiredRange: reqRange
                };
                return true;
            }
        }

        // Interlude: откат стартует в момент нажатия / начала каста (use)
        const cdSec = template.cooldown != null ? template.cooldown : 0;
        if (cdSec > 0) {
            this.setCooldown(skillId, cdSec);
        }

        if (this.player && this.player.pauseAutoAttackForSkill) {
            this.player.pauseAutoAttackForSkill();
        }

        const castSec = this.getEffectiveChargeTime(template, learned.level);
        if (castSec > 0.05) {
            const pos = this.player.mesh && this.player.mesh.position;
            this.casting = {
                skillId: skillId,
                template: template,
                level: learned.level,
                target: target || null,
                energyNeed: energyNeed,
                endsAt: performance.now() + castSec * 1000,
                totalMs: castSec * 1000,
                startX: pos ? pos.x : 0,
                startZ: pos ? pos.z : 0
            };
            // Body anim scaled to cast bar (Heal / skil / Vamp)
            this._playSkillAnim(template, { hold: true, durationSec: castSec });
            // L2-style cast circle / aura (SkillVFX)
            if (window.SkillVFX && window.SkillVFX.startCast) {
                try {
                    window.SkillVFX.startCast(skillId, this.player, target || null);
                } catch (e) {
                    console.warn('[cast] SkillVFX.startCast', e);
                }
            } else {
                console.warn('[cast] SkillVFX missing — no cast circle');
            }
            if (window.game && window.game.net && window.game.net.send) {
                const targetOpts = {};
                if (target) {
                    if (target.mid != null) targetOpts.mid = target.mid;
                    else if (target.pid != null) targetOpts.pid = target.pid;
                } else if (this.player && this.player.target) {
                    if (this.player.target.mid != null) targetOpts.mid = this.player.target.mid;
                    else if (this.player.target.pid != null) targetOpts.pid = this.player.target.pid;
                }
                window.game.net.send(Object.assign({ t: 'cast_begin', skillId: skillId }, targetOpts));
            }
            if (window.game && window.game.addChatMessage) {
                const cs = this.getChargeSpeed();
                window.game.addChatMessage(
                    'Каст: ' + template.name + ' ' + castSec.toFixed(2) + 'с' +
                    ' (скорость ' + cs.toFixed(2) + '×)',
                    'system'
                );
            }
            return true;
        }

        // Instant cast — snappy one-shot body anim, then complete effect
        this._playSkillAnim(template, { hold: false, durationSec: 0 });
        return this._completeCast(skillId, template, learned.level, target || null, energyNeed);
    }

    /**
     * Завершить каст / мгновенное умение: трата энергии, CD, эффект.
     * Online: intent после каста (сервер — урон/хил/энергия).
     * Клиент оптимистично списывает пар; skill_ok / skill_fail синхронизируют.
     */
    _completeCast(skillId, template, level, target, energyNeed) {
        energyNeed = Math.max(0, Math.floor(+energyNeed || 0));
        if (this.player.energy < energyNeed) {
            if (window.game) window.game.addChatMessage('Недостаточно пара!', 'system');
            if (this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
            return false;
        }
        // после каста — Interlude effectRange (L2 1100 → ~96), не castRange
        if (target && (template.range || template.effectRange) && target.mesh && this.player.mesh) {
            const dist = this._distXZ(this.player.mesh.position, target.mesh.position);
            if (dist > this.getSkillEffectRange(skillId)) {
                if (window.game) window.game.addChatMessage('Цель ушла из радиуса.', 'system');
                if (this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
                return false;
            }
        }

        // C1: «откат» после произнесения — зависит от Atk.Spd оружия, не от Casting Spd.
        // Кинжал: короче → быстрее следующий каст/удар. 2H: дольше «застревание».
        if (this.player && this.player.applyWeaponRecovery) {
            this.player.applyWeaponRecovery('cast');
        }

        // Сервер — авторитет по финальным vitals (skill_ok / skill_fail).
        if (!window.game || !window.game.net || !window.game.net.intentSkill) {
            if (window.game) window.game.addChatMessage('Нет связи с сервером.', 'system');
            if (window.SkillVFX) window.SkillVFX.stopCast(true);
            if (this.player && this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
            return false;
        }
        const opts = {};
        if (target) {
            if (target.mid != null) opts.mid = target.mid;
            else if (target.pid != null) opts.pid = target.pid;
        } else if (this.player.target) {
            if (this.player.target.mid != null) opts.mid = this.player.target.mid;
            else if (this.player.target.pid != null) opts.pid = this.player.target.pid;
        }
        if (opts.mid == null && opts.pid == null &&
            template.target === TARGET_TYPES.TARGET) {
            if (skillId === 'gm_resurrect') {
                opts.pid = this.player.pid;
            } else {
                if (window.game) window.game.addChatMessage('Нет цели (mid).', 'system');
                if (window.SkillVFX) window.SkillVFX.stopCast(true);
                if (this.player && this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
                return false;
            }
        }
        if (!this.isOnCooldown(skillId)) {
            this.setCooldown(skillId, Math.min(0.4, template.cooldown || 1));
        }
        // Оптимистичный расход пара (L2: MP уходит при срабатывании). skill_ok подтвердит.
        if (energyNeed > 0) {
            this.player.energy = Math.max(0, Math.floor(this.player.energy - energyNeed));
        }
        // Визуал предиктивный. Урон придёт в skill_ok.
        this.createSkillEffect(template, target || this.player.target || null);
        window.game.net.intentSkill(skillId, opts);
        if (this.player && this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
        return true;
    }

    toggleSkill(skillId) {
        const template = resolveSkill(skillId);
        const name = (template && template.name) || skillId;
        skillId = (template && template.id) || skillId;
        const willBeActive = !this.activeToggles.has(skillId);
        if (this.activeToggles.has(skillId)) {
            this.activeToggles.delete(skillId);
            if (window.game) window.game.addChatMessage(name + ': ВЫКЛ', 'system');
        } else {
            this.activeToggles.add(skillId);
            if (window.game) window.game.addChatMessage(name + ': ВКЛ', 'system');
        }
        if (window.game && window.game.net && typeof window.game.net.intentSkill === 'function') {
            window.game.net.intentSkill(skillId, { active: willBeActive });
        }
        return true;
    }

    // Клиентский расчёт урона (executeSkill и подметоды) вычищен (PLAN Раздел 6):
    // сервер — единственный авторитет расчёта урона, баффов и кулдаунов.

    setCooldown(skillId, duration) {
        this.cooldowns[skillId] = Date.now() + (duration || 0) * 1000;
    }
    isOnCooldown(skillId) {
        return this.cooldowns[skillId] && Date.now() < this.cooldowns[skillId];
    }
    getCooldownRemaining(skillId) {
        if (!this.cooldowns[skillId]) return 0;
        return Math.max(0, (this.cooldowns[skillId] - Date.now()) / 1000);
    }

    /** XZ-дистанция (метры мира = world units). */
    _distXZ(a, b) {
        if (window.L2_COMBAT && window.L2_COMBAT.distXZ) {
            return window.L2_COMBAT.distXZ(a.x, a.z, b.x, b.z);
        }
        const dx = a.x - b.x, dz = a.z - b.z;
        return Math.sqrt(dx * dx + dz * dz);
    }

    /** Cast range (Interlude castRange 600 → ~52.5) — можно начать каст */
    getSkillRange(skillId) {
        const template = resolveSkill(skillId);
        if (!template) return 3;
        let range = template.range != null ? template.range : 3;
        // l2CastRange → game, если range не задан явно
        if (template.range == null && template.l2CastRange != null) {
            range = fromL2CastRange(template.l2CastRange);
        }
        const eagleEye = this.learnedSkills['gun_eagle_eye'];
        const eagleTpl = resolveSkill('gun_eagle_eye');
        if (eagleEye && eagleTpl) {
            range += (eagleTpl.effectPerLevel.rangeBonus || 0) * eagleEye.level;
        }
        if (this.activeToggles.has('gun_sniper_mode')) {
            const sniper = this.learnedSkills['gun_sniper_mode'];
            const sniperTpl = resolveSkill('gun_sniper_mode');
            if (sniper && sniperTpl) {
                range += (sniperTpl.rangeBonus || 0) +
                    ((sniperTpl.effectPerLevel && sniperTpl.effectPerLevel.rangeBonus) || 0) * (sniper.level - 1);
            }
        }
        if (this.player.passiveBonuses && this.player.passiveBonuses.range) {
            range += this.player.passiveBonuses.range;
        }
        return range;
    }

    /**
     * Effect range (Interlude effectRange) — после каста цель может отойти дальше.
     * Обычно effectRange ≈ castRange × 1100/600.
     */
    getSkillEffectRange(skillId) {
        const template = resolveSkill(skillId);
        if (!template) return this.getSkillRange(skillId);
        if (template.effectRange != null) return template.effectRange;
        if (template.l2EffectRange != null) return fromL2EffectRange(template.l2EffectRange);
        // fallback: cast × 11/6 как 1100/600
        return this.getSkillRange(skillId) * (1100 / 600);
    }

    /**
     * C1 Spellcraft: комплект робы = chest + legs (armorType=robe).
     * Light/Heavy / один кусок → OFF (Casting Spd 166).
     */
    hasRobeArmorEquipped() {
        const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
            ? window.game.inventory
            : null;
        if (!inv || !inv.equipment) return false;
        if (window.ITEM_DB && typeof window.ITEM_DB.hasRobeSet === 'function') {
            return window.ITEM_DB.hasRobeSet(inv.equipment);
        }
        if (typeof window.hasRobeJacketAndPants === 'function') {
            return window.hasRobeJacketAndPants(inv.equipment);
        }
        const isRobe = (it) => it && ((it.template && it.template.armorType === 'robe') || it.armorType === 'robe');
        const chest = inv.equipment.chest;
        const ct = chest && (chest.template || chest);
        if (ct && ct.fullBody && isRobe(chest)) return true;
        return isRobe(inv.equipment.chest) && isRobe(inv.equipment.legs);
    }

    /**
     * Именной сет (Devotion / Кармиан / Авадон +15% cast) — только поверх робы + полный сет.
     * Источник: ITEM_DB.castSpeedSetBonus / evaluateSets.
     */
    getRobeSetCastBonus() {
        const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
            ? window.game.inventory
            : null;
        if (!inv || !inv.equipment) return 0;
        if (window.ITEM_DB && typeof window.ITEM_DB.castSpeedSetBonus === 'function') {
            return window.ITEM_DB.castSpeedSetBonus(inv.equipment);
        }
        if (typeof window.getDevotionCastBonus === 'function') {
            return window.getDevotionCastBonus(inv.equipment);
        }
        if (!this.hasRobeArmorEquipped()) return 0;
        let n = 0;
        Object.keys(inv.equipment).forEach((s) => {
            const it = inv.equipment[s];
            if (!it) return;
            const t = it.template || it;
            if (t.setId === 'devotion' || t.armorSet === 'devotion') n++;
        });
        return n >= 2 ? 0.15 : 0;
    }

    /** Полные бонусы именных сетов (Знание, Демон, Рок…). */
    getArmorSetBonuses() {
        const inv = (typeof window !== 'undefined' && window.game && window.game.inventory)
            ? window.game.inventory
            : null;
        if (!inv || !inv.equipment) return null;
        if (window.ITEM_DB && typeof window.ITEM_DB.evaluateSets === 'function') {
            return window.ITEM_DB.evaluateSets(inv.equipment);
        }
        return null;
    }

    recalculatePassives() {
        const player = this.player;
        let bonusHpPercent = 0, bonusEnergyPercent = 0, bonusAttackPercent = 0;
        let bonusDefensePercent = 0, bonusCritChance = 0, bonusEvasion = 0;
        let bonusAttackSpeed = 0, bonusMechDamage = 0, bonusExplosiveDamage = 0;
        let bonusCritDamage = 0, bonusRange = 0, bonusCAtk = 0, bonusCDef = 0;
        let bonusHealPower = 0, bonusBlock = 0, bonusEnergyFlat = 0;
        let bonusChargeSpeed = 0, bonusEnergyRegen = 0;
        let deathKeepItemsUntilLevel = 0;
        // C1 flat passives (Weapon/Armor/Anti Magic mastery)
        let pAtkFlat = 0, cAtkFlat = 0, pDefFlat = 0, cDefFlat = 0;
        const robeOk = this.hasRobeArmorEquipped(); // chest+legs robe OR fullBody
        const castSetBonus = this.getRobeSetCastBonus(); // cast % from sets
        const setB = this.getArmorSetBonuses() || {};

        Object.entries(this.learnedSkills).forEach(([skillId, data]) => {
            const template = resolveSkill(skillId);
            if (!template || template.type !== SKILL_TYPES.PASSIVE) return;
            const level = data.level;
            const eff = template.effectPerLevel || {};
            const r = skillRankData(template, level) || {};
            // Spellcraft / Magician's Movement / Mana Recovery: комплект робы
            const robeGated = !!(template.requiresRobe || template.requiresRobeSet);
            const robeActive = !robeGated || robeOk;
            if (eff.hpPercent) bonusHpPercent += eff.hpPercent * level;
            if (eff.energyPercent) bonusEnergyPercent += eff.energyPercent * level;
            if (eff.attackPercent) bonusAttackPercent += eff.attackPercent * level;
            if (eff.defensePercent) bonusDefensePercent += eff.defensePercent * level;
            if (eff.critChance) bonusCritChance += eff.critChance * level;
            if (eff.evasion) bonusEvasion += eff.evasion * level;
            // ranks[]: robe-set-gated — Spellcraft +100%, Magician's Movement, Mana Recovery
            if (robeActive) {
                if (r.attackSpeed != null) bonusAttackSpeed += r.attackSpeed;
                else if (eff.attackSpeed) bonusAttackSpeed += eff.attackSpeed * level;
                if (r.chargeSpeed != null) bonusChargeSpeed += r.chargeSpeed;
                else if (eff.chargeSpeed) bonusChargeSpeed += eff.chargeSpeed * level;
                if (r.energyRegen != null) bonusEnergyRegen += r.energyRegen;
                else if (eff.energyRegen) bonusEnergyRegen += eff.energyRegen * level;
            }
            if (eff.mechDamageBonus) bonusMechDamage += eff.mechDamageBonus * level;
            if (eff.explosiveDamage) bonusExplosiveDamage += eff.explosiveDamage * level;
            if (eff.critDamage) bonusCritDamage += eff.critDamage * level;
            if (eff.rangeBonus) bonusRange += eff.rangeBonus * level;
            if (eff.cAtkPercent) bonusCAtk += eff.cAtkPercent * level;
            if (eff.cDefPercent) bonusCDef += eff.cDefPercent * level;
            if (eff.healPower) bonusHealPower += eff.healPower * level;
            if (eff.blockRate) bonusBlock += eff.blockRate * level;
            if (eff.maxEnergy) bonusEnergyFlat += eff.maxEnergy * level;
            // Weapon Mastery etc: ranks % + flat (MUL first, then ADD)
            if (r.pAtkPercent != null) bonusAttackPercent += r.pAtkPercent;
            else if (r.attackPercent != null) bonusAttackPercent += r.attackPercent;
            if (r.cAtkPercent != null) bonusCAtk += r.cAtkPercent;
            if (r.pAtkFlat != null) pAtkFlat += r.pAtkFlat;
            if (r.cAtkFlat != null) cAtkFlat += r.cAtkFlat;
            if (r.pDefFlat != null) pDefFlat += r.pDefFlat;
            if (r.cDefFlat != null) cDefFlat += r.cDefFlat;
            if (template.deathKeepItemsUntilLevel) {
                deathKeepItemsUntilLevel = Math.max(
                    deathKeepItemsUntilLevel,
                    template.deathKeepItemsUntilLevel
                );
            }
        });

        // Armor set % / regen (Knowledge, Karmian, Demon, Doom, …)
        // hpFlat / energyFlat уже в gearFromEquip (gear.hpBonus / energyBonus) — не дублировать
        if (setB.cAtkPercent) bonusCAtk += setB.cAtkPercent;
        if (setB.pDefPercent) bonusDefensePercent += setB.pDefPercent;
        if (setB.energyPercent) bonusEnergyPercent += setB.energyPercent;
        // MP regen from sets stacks with Mana Recovery (robe-gated only for skill part)
        let setEnergyRegen = setB.energyRegen || 0;

        player.passiveBonuses = {
            hpPercent: bonusHpPercent,
            energyPercent: bonusEnergyPercent,
            attackPercent: bonusAttackPercent,
            defensePercent: bonusDefensePercent,
            critChance: bonusCritChance,
            evasion: bonusEvasion,
            attackSpeed: bonusAttackSpeed,
            mechDamage: bonusMechDamage,
            explosiveDamage: bonusExplosiveDamage,
            critDamage: bonusCritDamage,
            range: bonusRange,
            cAtkPercent: bonusCAtk,
            cDefPercent: bonusCDef,
            healPower: bonusHealPower,
            blockRate: bonusBlock,
            maxEnergyFlat: bonusEnergyFlat,
            // chargeSpeed = Spellcraft (1.0 = +100% only with robe set); castSpeedSet = Devotion/Karmian/Avadon
            chargeSpeed: robeOk ? bonusChargeSpeed : 0,
            castSpeedSet: robeOk ? castSetBonus : 0,
            energyRegen: (robeOk ? bonusEnergyRegen : 0) + setEnergyRegen,
            deathKeepItemsUntilLevel: deathKeepItemsUntilLevel,
            pAtkFlat: pAtkFlat,
            cAtkFlat: cAtkFlat,
            pDefFlat: pDefFlat,
            cDefFlat: cDefFlat,
            robeActive: robeOk,
            robeSetActive: robeOk,
            activeSets: setB.active || [],
            setLabels: setB.labels || []
        };

        // Пассивки влияют на боевые статы — сразу применить (без рекурсии levelSystem)
        if (player._applyingPassives) return;
        player._applyingPassives = true;
        try {
            if (typeof player.pullL2Stats === 'function') player.pullL2Stats();
        } finally {
            player._applyingPassives = false;
        }
    }

    update(delta) {
        // ─── Ожидание подбега на дистанцию каста (Run-to-Cast L2) ───
        if (this.pendingSkill && this.player && this.player.mesh) {
            const p = this.pendingSkill;
            const targetMesh = p.target && p.target.mesh;
            const isAlive = p.target && (p.target.hp == null || p.target.hp > 0);
            if (!targetMesh || !isAlive) {
                this.pendingSkill = null;
                if (this.player.releaseSkillHoldAA) this.player.releaseSkillHoldAA();
            } else {
                const dist = this._distXZ(this.player.mesh.position, targetMesh.position);
                // продолжаем вести игрока за двигающейся целью
                if (this.player.moveTo) this.player.moveTo(targetMesh.position);
                if (dist <= p.requiredRange + 0.5) {
                    const skillToCast = p.skillId;
                    const targetToCast = p.target;
                    this.pendingSkill = null;
                    if (this.player.isMoving !== undefined) this.player.isMoving = false;
                    this.useSkill(skillToCast, targetToCast);
                }
            }
        }

        // ─── Каст (C1 cast bar + 3D aura) ───
        if (this.casting) {
            const c = this.casting;
            // прерывание только заметным смещением (не isMoving — chase/auto-path не срывает)
            if (this.player && this.player.mesh) {
                const dx = this.player.mesh.position.x - c.startX;
                const dz = this.player.mesh.position.z - c.startZ;
                if (dx * dx + dz * dz > 2.5 * 2.5) {
                    this.cancelCast('движение');
                }
            }
            if (this.casting && window.SkillVFX) {
                const now = performance.now();
                const left = Math.max(0, this.casting.endsAt - now);
                const pct = 1 - left / Math.max(1, this.casting.totalMs);
                window.SkillVFX.updateCast(Math.min(1, Math.max(0, pct)));
            }
            if (this.casting && performance.now() >= this.casting.endsAt) {
                const done = this.casting;
                this.casting = null;
                // cast pose → idle (effect VFX plays separately)
                this._stopSkillAnim();
                this._completeCast(
                    done.skillId, done.template, done.level, done.target, done.energyNeed
                );
            }
        }

        if (this.activeToggles.size && this.player) {
            this.activeToggles.forEach((id) => {
                const t = resolveSkill(id);
                if (!t) return;
                const cost = (t.energyCost || 0) * delta;
                if (this.player.energy >= cost) this.player.energy -= cost;
                else this.activeToggles.delete(id);
            });
        }

        const now = Date.now();
        Object.keys(this.cooldowns).forEach((id) => {
            if (this.cooldowns[id] <= now) delete this.cooldowns[id];
        });
    }

    /**
     * 3D VFX скилла.
     * @param {object} template
     * @param {object|null} target
     * @param {{ skipHit?: boolean }} [opts]
     *   skipHit — online: снаряд сейчас, crush/удар на skill_ok
     */
    createSkillEffect(template, target, opts) {
        if (!window.game || !window.THREE || !this.player || !this.player.mesh) return;
        opts = opts || {};
        const skillId = (template && (template.id || template.skillId)) || '';
        try {
            if (window.SkillVFX) {
                if (skillId === 'eng_pressure_bolt' || String(skillId).indexOf('pressure_bolt') >= 0) {
                    window.SkillVFX.playPressureBolt(this.player, target, {
                        skipHit: !!(opts && opts.skipHit)
                    });
                    return;
                }
                if (skillId === 'eng_self_repair' || String(skillId).indexOf('self_repair') >= 0) {
                    // self-target heal VFX always on player
                    window.SkillVFX.playSelfRepair(this.player, opts);
                    return;
                }
                window.SkillVFX.playSkill(skillId, this.player, target, {
                    damageType: template && template.damageType
                });
                return;
            }
            console.warn('[SkillVFX] missing — fallback ring for', skillId);
            // legacy fallback (at correct height)
            const color = template.damageType === 'circuit' ? 0x44aaff : 0xffaa33;
            const pos = (target && target.mesh) ? target.mesh.position : this.player.mesh.position;
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(1.0, 2.0, 32),
                new THREE.MeshBasicMaterial({
                    color: color, transparent: true, opacity: 0.85,
                    side: THREE.DoubleSide, depthWrite: false, fog: false, toneMapped: false
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(pos.x, pos.y - 0.5, pos.z);
            window.game.scene.add(ring);
            let s = 1;
            const animate = () => {
                s += 0.12;
                ring.scale.set(s, s, s);
                ring.material.opacity -= 0.035;
                if (ring.material.opacity > 0) requestAnimationFrame(animate);
                else window.game.scene.remove(ring);
            };
            animate();
        } catch (e) {
            console.warn('[createSkillEffect] failed', skillId, e);
        }
    }

    getSkillsByClass(className) {
        return Object.values(SKILL_DATABASE).filter(s => s.class === className);
    }

    getLearnedSkills() {
        return Object.entries(this.learnedSkills).map(([id, data]) => ({
            ...(resolveSkill(id) || {}),
            currentLevel: data.level
        }));
    }

    _classLineage(className) {
        if (window.CLASS_SYSTEM && window.CLASS_SYSTEM.classLineage) {
            return window.CLASS_SYSTEM.classLineage(className);
        }
        return [className || 'operator'];
    }

    getAvailableSkills() {
        const className = (this.player.levelSystem && this.player.levelSystem.currentClass)
            || this.player.playerClass || 'operator';
        const playerLevel = (this.player.levelSystem && this.player.levelSystem.level)
            || this.player.level || 1;
        const lineage = this._classLineage(className);
        return Object.values(SKILL_DATABASE).filter(s => {
            if (lineage.indexOf(s.class) === -1) return false;
            if (playerLevel < s.levelReq) return false;
            const learned = this.learnedSkills[s.id];
            if (learned && learned.level >= s.maxLevel) return false;
            return true;
        });
    }

    serialize() {
        return {
            learnedSkills: this.learnedSkills,
            skillPoints: this.skillPoints,
            activeToggles: Array.from(this.activeToggles)
        };
    }

    deserialize(data) {
        this.learnedSkills = (data && data.learnedSkills) || {};
        this.skillPoints = (data && data.skillPoints) || 0;
        this.activeToggles = new Set((data && data.activeToggles) || []);
        this.recalculatePassives();
    }
}

window.SkillManager = SkillManager;
window.SKILL_DATABASE = SKILL_DATABASE;
window.SKILL_BY_ID = SKILL_BY_ID;
window.resolveSkill = resolveSkill;
window.skillPowerAtLevel = skillPowerAtLevel;
window.skillSpCost = skillSpCost;
window.skillRankData = skillRankData;
window.skillValueAtLevel = skillValueAtLevel;
window.skillEnergyCost = skillEnergyCost;
window.skillStatsAtLevel = skillStatsAtLevel;
window.formatSkillStatsLine = formatSkillStatsLine;
window.skillLevelReqForRank = skillLevelReqForRank;
window.PLAYER_CLASSES = PLAYER_CLASSES;
window.SKILL_TYPES = SKILL_TYPES;
window.SKILL_CATEGORIES = SKILL_CATEGORIES;
window.TARGET_TYPES = TARGET_TYPES;
