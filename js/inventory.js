// ============================================
// PROJECT STEAM: ORIGINS - INVENTORY.JS
// Инвентарь, экипировка, грейды, заточка
// По GDD: No-grade → D → C → B → A → S
// Заточка: "усилители давления", ломается выше +3
// Валюта: Медные детали
// ============================================

// ============================================
// ГРЕЙДЫ ПРЕДМЕТОВ
// ============================================
const ITEM_GRADES = {
    NO_GRADE: {
        id: 'no_grade',
        name: 'No-Grade',
        color: '#aaaaaa',
        levelReq: 1,
        enchantBonus: 1.0,
        crystalCount: 0
    },
    D: {
        id: 'd',
        name: 'D-Grade',
        color: '#44ff44',
        levelReq: 20,
        enchantBonus: 1.2,
        crystalCount: 1
    },
    C: {
        id: 'c',
        name: 'C-Grade',
        color: '#4488ff',
        levelReq: 40,
        enchantBonus: 1.5,
        crystalCount: 3
    },
    B: {
        id: 'b',
        name: 'B-Grade',
        color: '#aa44ff',
        levelReq: 52,
        enchantBonus: 1.8,
        crystalCount: 6
    },
    A: {
        id: 'a',
        name: 'A-Grade',
        color: '#ffaa44',
        levelReq: 61,
        enchantBonus: 2.2,
        crystalCount: 10
    },
    S: {
        id: 's',
        name: 'S-Grade',
        color: '#ff4444',
        levelReq: 76,
        enchantBonus: 3.0,
        crystalCount: 15
    }
};

// ============================================
// ТИПЫ СЛОТОВ ЭКИПИРОВКИ
// ============================================
const EQUIP_SLOTS = {
    WEAPON: 'weapon',
    CHEST: 'chest',   // robe jacket / upper
    LEGS: 'legs',     // robe pants / lower (Spellcraft / Magician's Movement)
    HEAD: 'head',
    GLOVES: 'gloves',
    BOOTS: 'boots',
    SHIELD: 'shield',
    EARRING_L: 'earring_l',
    EARRING_R: 'earring_r',
    /** Пара нано-браслетов — один слот (вместо ring_l + ring_r) */
    BRACELET: 'bracelet',
    NECKLACE: 'necklace',
    TITLE: 'title',
    COSTUME: 'costume'
};

/** Legacy jewelry slots removed from paperdoll (rings → bracelet). */
const LEGACY_RING_SLOTS = ['ring_l', 'ring_r'];

/** L2: robe jacket + robe pants → Spellcraft / Magician's Movement / Mana Recovery */
function isRobeArmorItem(item) {
    if (!item) return false;
    const t = item.template || item;
    return t.armorType === 'robe' || t.armorSet === 'robe';
}

/** Хотя бы один слот робы (для UI). */
function hasAnyRobeArmor(equipment) {
    if (!equipment) return false;
    return Object.keys(equipment).some((s) => isRobeArmorItem(equipment[s]));
}

/**
 * C1 Spellcraft: нужны КУРТКА + ШТАНЫ робы (chest + legs).
 * Light/Heavy / один кусок — Casting Spd остаётся 166.
 */
function hasRobeJacketAndPants(equipment) {
    if (!equipment) return false;
    // Avadon-style fullBody robe counts as full robe set for Spellcraft
    const chest = equipment.chest;
    const ct = chest && (chest.template || chest);
    if (ct && (ct.fullBody || ct.armorType === 'robe') && ct.fullBody) return true;
    return isRobeArmorItem(equipment.chest) && isRobeArmorItem(equipment.legs);
}

/** Полный именной сет (например devotion) — count частей с setId. */
function countNamedSetPieces(equipment, setId) {
    if (!equipment || !setId) return 0;
    let n = 0;
    const sid = String(setId).toLowerCase();
    Object.keys(equipment).forEach((s) => {
        const it = equipment[s];
        if (!it) return;
        const t = it.template || it;
        const id = String(t.setId || t.armorSet || '').toLowerCase();
        if (id === sid) n++;
    });
    return n;
}

/**
 * Devotion (+15% cast) только если:
 *  1) надет комплект робы (куртка+штаны) — база Spellcraft
 *  2) надет полный сет devotion (2+ части)
 */
function getDevotionCastBonus(equipment) {
    if (typeof window !== 'undefined' && window.ITEM_DB && window.ITEM_DB.castSpeedSetBonus) {
        return window.ITEM_DB.castSpeedSetBonus(equipment);
    }
    if (!hasRobeJacketAndPants(equipment)) return 0;
    // fallback: Devotion / any set with cast handled only devotion here
    if (countNamedSetPieces(equipment, 'devotion') >= 2) return 0.15;
    if (countNamedSetPieces(equipment, 'karmian') >= 3) return 0.15;
    if (countNamedSetPieces(equipment, 'avadon') >= 4) return 0.15;
    return 0;
}

/** Активные сеты брони (для UI). */
function getActiveArmorSets(equipment) {
    if (typeof window !== 'undefined' && window.ITEM_DB && window.ITEM_DB.evaluateSets) {
        return window.ITEM_DB.evaluateSets(equipment);
    }
    return { active: [], labels: [] };
}

// ============================================
// БАЗА ДАННЫХ ПРЕДМЕТОВ
// ============================================
const ITEM_DATABASE = {
    // === ОРУЖИЕ ===
    // C1: оружие НЕ даёт Casting Spd. Atk.Spd = Floor(baseAtkSpd × DEX_Mod).
    // Базы: fist 217 | blunt 275 | dagger 333 | sword 247 | 2h/pole 190
    // DEX21 → 242 / 306 / 371 / 275 / 211. Casting Spd не трогается.
    // weaponClass + baseAtkSpd — источник истины для Atk.Spd (не «+N» к кулакам).
    // === СТАРТОВЫЙ НАБОР ИНЖЕНЕРА (Low No-Grade) ===
    OPERATOR_COMPRESSOR_LOW: {
        id: 'operator_compressor_low',
        name: 'Нагрудный нагнетатель бойца',
        type: 'accessory',
        slot: EQUIP_SLOTS.NECKLACE,
        grade: 'NO_GRADE',
        description: 'Нагрудный паровой редуктор-нагнетатель бойца: накапливает давление пара и подает кинетический импульс в оружие. Позволяет оператору проводить сокрушительные удары и паровые выбросы без магии.',
        icon: 'assets/inventar/icons/steam_valve.webp',
        price: 110,
        weight: 150,
        isCompressor: true,
        isOperatorDevice: true,
        valveLevel: 1,
        shellIndex: 0,
        levelReq: 1
    },
    OPERATOR_BRACERS_LOW: {
        id: 'operator_bracers_low',
        name: 'Наручи-компенсаторы бойца',
        type: 'accessory',
        slot: EQUIP_SLOTS.BRACELET,
        grade: 'NO_GRADE',
        description: 'Пара клепаных наручей с гидравлическими демпферами. Гасят отдачу парового молота и натягивают тетиву блочных луков. Необходимы для аварийного ремонта, разгона приводов и распыления масел.',
        icon: 'assets/inventar/icons/pressure_gauge.webp',
        price: 110,
        weight: 150,
        isBracers: true,
        isOperatorBracers: true,
        isBraceletDevice: true,
        wristLevel: 1,
        casingIndex: 0,
        levelReq: 1
    },
    ENGINEER_JACKET_LOW: {
        id: 'engineer_jacket_low',
        name: 'Куртка Ученика',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        grade: 'NO_GRADE',
        defense: 14,
        cDef: 0,
        hpBonus: 0,
        description: 'Куртка Ученика (No-Grade). Базовая роба ученика.',
        icon: 'assets/inventar/icons/engineer_jacket_low.webp',
        price: 90
    },
    ENGINEER_PANTS_LOW: {
        id: 'engineer_pants_low',
        name: 'Штаны Ученика',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        grade: 'NO_GRADE',
        defense: 9,
        cDef: 0,
        hpBonus: 0,
        description: 'Штаны Ученика (No-Grade). Базовые штаны ученика.',
        icon: 'assets/inventar/icons/engineer_pants_low.webp',
        price: 70
    },
    ENGINEER_EMITTER_LOW: {
        id: 'engineer_emitter_low',
        name: 'Паровой резонатор ученика',
        type: 'accessory',
        slot: EQUIP_SLOTS.NECKLACE,
        grade: 'NO_GRADE',
        // Статы только от ветки «корпус» (shell), не с базы шаблона
        isCircuit: true,
        isResonator: true,
        isCircuitDevice: true,
        circuitLevel: 1,
        circuitMaxLevel: 10,
        shellIndex: 0,
        description:
          'Нагрудный прибор наладчика: ловит и усиливает импульс контура. Через него инженер бьёт давлением и схемами по врагу. Контур растёт с опытом, корпус — с деталями и металлом.',
        icon: 'assets/props/icons_weapon/engineer_emitter_low.webp',
        price: 110
    },
    // Нано-браслеты: поддержка / вмешательство (зеркало резонатора)
    ENGINEER_NANO_BRACELET: {
        id: 'engineer_nano_bracelet',
        name: 'Нано-браслеты ученика',
        type: 'accessory',
        slot: EQUIP_SLOTS.BRACELET,
        grade: 'NO_GRADE',
        isNanoBracelet: true,
        isBraceletDevice: true,
        nanoLevel: 1,
        nanoMaxLevel: 10,
        casingIndex: 0,
        description:
          'Пара наручных манжет с роем микромеханизмов. Пока они на запястьях, рой сшивает корпус, вытягивает давление из чужой машины и сеет сбои в схемах противника — тихая работа, в отличие от удара резонатора. Связь роя растёт с опытом, оболочка — с деталями.',
        icon: 'assets/inventar/icons/pressure_ring.webp',
        price: 110
    },

    // ─── Контурное оружие LIVE 1–20: mag ladder 1:1 (топ D @20) ───
    APPRENTICE_WAND: {
        id: 'apprentice_wand',
        name: 'Ударник Ученика',
        l2Name: "Apprentice's Wand",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 5,
        cAtk: 7,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 343,
        atkSpdGrade: 'Fast',
        twoHanded: false,
        accuracyBonus: 5,
        weight: 1350,
        description: 'Резонансный жезл инженера (No-Grade, 1H). Быстрый темп импульсов. Снижает расход пара на активацию программ на 10%.',
        icon: 'assets/props/icons_weapon/apprentice_wand.webp',
        price: 138
    },
    WILLOW_COIL: {
        id: 'willow_coil',
        name: 'Пружина Астарда',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 15,
        cAtk: 20,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H+щит. P15 / схем. 20.',
        icon: 'assets/props/icons_weapon/willow_coil.webp',
        price: 12500
    },
    CEDAR_MANIFOLD: {
        id: 'cedar_manifold',
        name: 'Труболом Междуречья',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 17,
        cAtk: 25,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H. P17 / схем. 25.',
        icon: 'assets/props/icons_weapon/cedar_manifold.webp',
        price: 54100
    },
    MAGE_STAFF: {
        id: 'mage_staff',
        name: 'Калибратор Цеха',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 22,
        cAtk: 32,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H топ NG. Калибровка цеха. P22 / схем. 32.',
        icon: 'assets/props/icons_weapon/mage_staff.webp',
        price: 136000
    },
    CRUCIFIX_BLOOD: {
        id: 'crucifix_blood',
        name: 'X-Узел Давления',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 22,
        cAtk: 32,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H+щит топ NG. X-рама клапана. P22 / схем. 32.',
        icon: 'assets/props/icons_weapon/crucifix_blood.webp',
        price: 136000
    },
    VOODOO_DOLL: {
        id: 'voodoo_doll',
        name: 'Кукла-Сбой',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 22,
        cAtk: 32,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H+щит топ NG. P22 / схем. 32.',
        icon: 'assets/props/icons_weapon/voodoo_doll.webp',
        price: 136000
    },
    // D-Grade
    MACE_PRAYER: {
        id: 'mace_prayer',
        name: 'Булава-Манометр',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 26,
        cAtk: 38,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H low D. Манометр-голова. P26 / схем. 38.',
        icon: 'assets/props/icons_weapon/mace_prayer.webp',
        price: 409000
    },
    MAGIC_MACE: {
        id: 'magic_mace',
        name: 'Импульсная Булава',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 26,
        cAtk: 38,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H low D. Импульсный тупой узел. P26 / схем. 38.',
        icon: 'assets/props/icons_weapon/magic_mace.webp',
        price: 409000
    },
    DEMON_FANGS: {
        id: 'demon_fangs',
        name: 'Клыки Сбоя',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 32,
        cAtk: 46,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H+щит mid D. Двойные клыки-пила. P32 / схем. 46.',
        icon: 'assets/props/icons_weapon/demon_fangs.webp',
        price: 716000
    },
    TEARS_FAIRY: {
        id: 'tears_fairy',
        name: 'Слёзы Искры',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 32,
        cAtk: 46,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H mid D. Капля охлаждённого сплава. P32 / схем. 46.',
        icon: 'assets/props/icons_weapon/tears_fairy.webp',
        price: 716000
    },
    BONE_RESONATOR: {
        id: 'bone_resonator',
        name: 'Костяной Дробитель',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 39,
        cAtk: 55,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H high-mid D. P39 / схем. 55.',
        icon: 'assets/props/icons_weapon/bone_resonator.webp',
        price: 967000
    },
    LIFE_MANIFOLD: {
        id: 'life_manifold',
        name: 'Ульевой Молот',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 39,
        cAtk: 55,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H high-mid D. P39 / схем. 55.',
        icon: 'assets/props/icons_weapon/life_manifold.webp',
        price: 967000
    },
    GHOST_MANIFOLD: {
        id: 'ghost_manifold',
        name: 'Глефа Тишины',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 47,
        cAtk: 64,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H high D. P47 / схем. 64.',
        icon: 'assets/props/icons_weapon/ghost_manifold.webp',
        price: 1400000
    },
    ATUBA_MACE: {
        id: 'atuba_mace',
        name: 'Булава Атубы',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 47,
        cAtk: 64,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: '1H high D+щит. P47 / схем. 64.',
        icon: 'assets/props/icons_weapon/atuba_mace.webp',
        price: 1400000
    },
    // Top D — топ для 20 лвл
    DEMON_STAFF: {
        id: 'demon_staff',
        name: 'Сверхпресс',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 53,
        cAtk: 72,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H TOP D @20. Сверхдавление, макс. схем. урон. P53 / схем. 72.',
        icon: 'assets/props/icons_weapon/demon_staff.webp',
        price: 1800000
    },
    SENTINEL_STAFF: {
        id: 'sentinel_staff',
        name: 'Молот Оплота',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 53,
        cAtk: 72,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H TOP D @20. P53 / схем. 72.',
        icon: 'assets/props/icons_weapon/sentinel_staff.webp',
        price: 1800000
    },
    GOAT_STAFF: {
        id: 'goat_staff',
        name: 'Вилочный Крушитель',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 53,
        cAtk: 72,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: true,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: '2H TOP D @20. P53 / схем. 72.',
        icon: 'assets/props/icons_weapon/goat_staff.webp',
        price: 1800000
    },
    // FUTURE C/B (не live 1–20)
    MYSTIC_MANIFOLD: {
        id: 'mystic_manifold',
        name: 'Круна-Калибр',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 103,
        cAtk: 81,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/mystic_manifold.webp',
        price: 2290000
    },
    CRYSTAL_MANIFOLD: {
        id: 'crystal_manifold',
        name: 'Кристалл Полигона',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 103,
        cAtk: 81,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_sword',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/crystal_manifold.webp',
        price: 2290000
    },
    FAITH_ROD: {
        id: 'faith_rod',
        name: 'Шток Рездика',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 85,
        cAtk: 81,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/faith_rod.webp',
        price: 2290000
    },
    GHOUL_MANIFOLD: {
        id: 'ghoul_manifold',
        name: 'Коса Порчи',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 119,
        cAtk: 91,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: 'pole',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/ghoul_manifold.webp',
        price: 2870000
    },
    SAGE_MANIFOLD: {
        id: 'sage_manifold',
        name: 'Молот Предела',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 135,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/sage_manifold.webp',
        price: 4300000
    },
    DEMON_MANIFOLD: {
        id: 'demon_manifold',
        name: 'Котловой Резонатор',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 135,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'C future Inferno [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/demon_manifold.webp',
        price: 4300000
    },
    NATURE_CLUB: {
        id: 'nature_club',
        name: 'Садовый Регулятор',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 111,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/nature_club.webp',
        price: 4300000
    },
    ETERNITY_ROD: {
        id: 'eternity_rod',
        name: 'Шток Вечности',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 111,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/eternity_rod.webp',
        price: 4300000
    },
    HOMUNCULUS_BLADE: {
        id: 'homunculus_blade',
        name: 'Клинок Круны',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 111,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/homunculus_blade.webp',
        price: 4300000
    },
    DEATH_WHISPER: {
        id: 'death_whisper',
        name: 'Клинок Шёпота',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 111,
        cAtk: 101,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        description: 'C future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/death_whisper.webp',
        price: 4300000
    },
    SPRITES_STAFF: {
        id: 'sprites_staff',
        name: 'Резонатор Искры',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'B',
        attack: 170,
        cAtk: 122,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'B future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/sprites_staff.webp',
        price: 8680000
    },
    SOES_MANIFOLD: {
        id: 'soes_manifold',
        name: 'Резонатор Утёса',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'B',
        attack: 189,
        cAtk: 132,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        description: 'B future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/soes_manifold.webp',
        price: 13100000
    },
    VALHALLA_BLADE: {
        id: 'valhalla_blade',
        name: 'Клинок Предела',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'B',
        attack: 140,
        cAtk: 122,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        description: 'B future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/valhalla_blade.webp',
        price: 8680000
    },
    REPENT_TEAR: {
        id: 'repent_tear',
        name: 'Слеза Павших',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'B',
        attack: 140,
        cAtk: 122,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        description: 'B future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/repent_tear.webp',
        price: 8680000
    },
    HELL_KNIFE: {
        id: 'hell_knife',
        name: 'Нож Зелёного Сбоя',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'B',
        attack: 122,
        cAtk: 122,
        isMagical: true,
        isCircuit: true,
        isEngineerWeapon: true,
        isLivePhase1: false,
        weaponClass: 'dagger',
        baseAtkSpd: 333,
        atkSpdGrade: 'Very Fast',
        description: 'B future [FUTURE 40+]',
        icon: 'assets/props/icons_weapon/hell_knife.webp',
        price: 8680000
    },
    // ─── Доспехи Оператора LIVE 1–20 (эталон L2 C1) ───
    WOODEN_BREASTPLATE: {
        "id": "wooden_breastplate",
        "name": "Клёпаный Нагрудник Каркаса",
        "l2Name": "Wooden Breastplate",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "NO_GRADE",
        "defense": 33,
        "weight": 2200,
        "price": 1200,
        "levelReq": 1,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "wooden",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Стартовый защитный панцирь оператора из армированного текстолита и стальных пластин на медных заклепках.",
        "icon": "assets/inventar/icons/wooden_breastplate.webp"
},
    WOODEN_GAITERS: {
        "id": "wooden_gaiters",
        "name": "Клёпаные Поножи Каркаса",
        "l2Name": "Wooden Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "NO_GRADE",
        "defense": 21,
        "weight": 1400,
        "price": 750,
        "levelReq": 1,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "wooden",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Клёпаный Каркас» (2): Физ. Защита +5.26%, HP +41. Поножи из прочного прессованного текстолита с шарнирами на коленях.",
        "icon": "assets/inventar/icons/wooden_gaiters.webp"
},
    WOODEN_HELMET: {
        "id": "wooden_helmet",
        "name": "Клёпаный Подшлемник",
        "l2Name": "Wooden Helmet",
        "type": "armor",
        "slot": EQUIP_SLOTS.HEAD,
        "grade": "NO_GRADE",
        "defense": 12,
        "weight": 600,
        "price": 500,
        "levelReq": 1,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": null,
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Легкий защитный шлем оператора из многослойного термостойкого каркаса.",
        "icon": "assets/inventar/icons/wooden_helmet.webp"
},
    LEATHER_ARMOR: {
        "id": "leather_armor",
        "name": "Кожаная Кираса Механика",
        "l2Name": "Leather Armor",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "NO_GRADE",
        "defense": 38,
        "weight": 2800,
        "price": 3800,
        "levelReq": 5,
        "crystalCount": 0,
        "armorType": "light",
        "setId": "leather",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Усиленная куртка из плотной дубленой кожи с наплечниками.",
        "icon": "assets/inventar/icons/leather_armor.webp"
},
    LEATHER_PANTS: {
        "id": "leather_pants",
        "name": "Кожаные Штаны Механика",
        "l2Name": "Leather Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "NO_GRADE",
        "defense": 24,
        "weight": 1800,
        "price": 2400,
        "levelReq": 5,
        "crystalCount": 0,
        "armorType": "light",
        "setId": "leather",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Кожаная Броня» (2): Физ. Защита +5.26%. Удобные рабочие штаны с защитными накладками для высокой маневренности.",
        "icon": "assets/inventar/icons/leather_pants.webp"
},
    COPPER_CHAINMAIL_GAITERS: {
        "id": "copper_chainmail_gaiters",
        "name": "Медные Кольчужные Поножи",
        "l2Name": "Bronze Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "NO_GRADE",
        "defense": 29,
        "weight": 2600,
        "price": 5500,
        "levelReq": 10,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "bronze_ng",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Медная Кольчуга» (2): Физ. Защита +5.26%, HP +50. Кольчужные набедренники из сплетенных медных звеньев.",
        "icon": "assets/inventar/icons/copper_chainmail_gaiters.webp"
},
    IRON_HELMET: {
        "id": "iron_helmet",
        "name": "Железный Шлем Оператора",
        "l2Name": "Iron Helmet",
        "type": "armor",
        "slot": EQUIP_SLOTS.HEAD,
        "grade": "NO_GRADE",
        "defense": 20,
        "weight": 800,
        "price": 7000,
        "levelReq": 10,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": null,
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Литой железный шлем с лицевым забралом и вентиляционными щелями.",
        "icon": "assets/inventar/icons/iron_helmet.webp"
},
    BONE_BREASTPLATE: {
        "id": "bone_breastplate",
        "name": "Карбоновый Нагрудник Свалки",
        "l2Name": "Bone Breastplate",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "NO_GRADE",
        "defense": 52,
        "weight": 3400,
        "price": 15000,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "light",
        "setId": "bone",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Легкий композитный нагрудник из термически обработанного углеволокна и броневых сегментов автоматонов.",
        "icon": "assets/inventar/icons/bone_breastplate.webp"
},
    BONE_GAITERS: {
        "id": "bone_gaiters",
        "name": "Карбоновые Набедренники Свалки",
        "l2Name": "Bone Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "NO_GRADE",
        "defense": 32,
        "weight": 2200,
        "price": 9500,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "light",
        "setId": "bone",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Карбоновый Каркас» (2): Физ. Защита +5.26%, HP +40. Композитные набедренники с шарнирными щитками для защиты суставов.",
        "icon": "assets/inventar/icons/bone_gaiters.webp"
},
    RING_MAIL_BREASTPLATE: {
        "id": "ring_mail_breastplate",
        "name": "Звеньевой Панцирь Цеховика",
        "l2Name": "Ring Mail Breastplate",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "NO_GRADE",
        "defense": 58,
        "weight": 5200,
        "price": 18000,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "ring_mail",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Тяжелый панцирь двойного кольчатого плетения с накладными титановыми пластинами.",
        "icon": "assets/inventar/icons/ring_mail_breastplate.webp"
},
    RING_MAIL_GAITERS: {
        "id": "ring_mail_gaiters",
        "name": "Звеньевые Поножи Цеховика",
        "l2Name": "Ring Mail Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "NO_GRADE",
        "defense": 36,
        "weight": 3200,
        "price": 11500,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "ring_mail",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Звеньевой Доспех» (3): Физ. Защита +5.26%, HP +30. Массивные кольчатые поножи для защиты ног оператора при тяжелых столкновениях.",
        "icon": "assets/inventar/icons/ring_mail_gaiters.webp"
},
    RING_MAIL_BOOTS: {
        "id": "ring_mail_boots",
        "name": "Звеньевые Сапоги",
        "l2Name": "Ring Mail Boots",
        "type": "armor",
        "slot": EQUIP_SLOTS.BOOTS,
        "grade": "NO_GRADE",
        "defense": 16,
        "weight": 1400,
        "price": 8000,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": "ring_mail",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Звеньевой Доспех» (3): часть полного комплекта звеньевой брони. Кованые сапоги со стальными носками и звеньевой защитой подъема.",
        "icon": "assets/inventar/icons/ring_mail_boots.webp"
},
    RING_MAIL_GLOVES: {
        "id": "ring_mail_gloves",
        "name": "Звеньевые Перчатки",
        "l2Name": "Ring Mail Gloves",
        "type": "armor",
        "slot": EQUIP_SLOTS.GLOVES,
        "grade": "NO_GRADE",
        "defense": 12,
        "weight": 140,
        "price": 5000,
        "levelReq": 15,
        "crystalCount": 0,
        "armorType": "heavy",
        "setId": null,
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Плотные перчатки с кольчатой накладкой на пальцах и тыльной стороне ладони.",
        "icon": "assets/inventar/icons/ring_mail_gloves.webp"
},
    REINFORCED_LEATHER_SHIRT: {
        "id": "reinforced_leather_shirt",
        "name": "Усиленная Кожаная Куртка",
        "l2Name": "Reinforced Leather Shirt",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "D",
        "defense": 71,
        "weight": 3200,
        "price": 40000,
        "levelReq": 20,
        "crystalCount": 80,
        "armorType": "light",
        "setId": "reinforced_leather",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Первоклассная куртка из дубленой кожи с титановым кордом и демпферами отдачи для стрелков.",
        "icon": "assets/inventar/icons/reinforced_leather_shirt.webp"
},
    REINFORCED_LEATHER_GAITERS: {
        "id": "reinforced_leather_gaiters",
        "name": "Усиленные Кожаные Штаны",
        "l2Name": "Reinforced Leather Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "D",
        "defense": 44,
        "weight": 2000,
        "price": 25000,
        "levelReq": 20,
        "crystalCount": 50,
        "armorType": "light",
        "setId": "reinforced_leather",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Усиленная Кожа» (3): Физ. Защита +5.26%, Пар (Energy) +80. Прочные эластичные штаны с титановыми наколенниками.",
        "icon": "assets/inventar/icons/reinforced_leather_gaiters.webp"
},
    REINFORCED_LEATHER_BOOTS: {
        "id": "reinforced_leather_boots",
        "name": "Усиленные Сапоги",
        "l2Name": "Reinforced Leather Boots",
        "type": "armor",
        "slot": EQUIP_SLOTS.BOOTS,
        "grade": "D",
        "defense": 25,
        "weight": 1200,
        "price": 16000,
        "levelReq": 20,
        "crystalCount": 32,
        "armorType": "light",
        "setId": "reinforced_leather",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Усиленная Кожа» (3): часть комплекта усиленной кожи. Легкие сапоги охотника на автоматонов с амортизирующей подошвой.",
        "icon": "assets/inventar/icons/reinforced_leather_boots.webp"
},
    SCALE_MAIL_BREASTPLATE: {
        "id": "scale_mail_breastplate",
        "name": "Чешуйчатая Кираса Регулятора",
        "l2Name": "Scale Mail",
        "type": "armor",
        "slot": EQUIP_SLOTS.CHEST,
        "grade": "D",
        "defense": 81,
        "weight": 5800,
        "price": 42000,
        "levelReq": 20,
        "crystalCount": 84,
        "armorType": "heavy",
        "setId": "scale_mail",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Тяжелая штампованная кираса D-ранга из наборных пластин легированной стали с нахлестом.",
        "icon": "assets/inventar/icons/scale_mail_breastplate.webp"
},
    SCALE_MAIL_GAITERS: {
        "id": "scale_mail_gaiters",
        "name": "Чешуйчатые Поножи Регулятора",
        "l2Name": "Scale Mail Gaiters",
        "type": "armor",
        "slot": EQUIP_SLOTS.LEGS,
        "grade": "D",
        "defense": 50,
        "weight": 3600,
        "price": 26000,
        "levelReq": 20,
        "crystalCount": 52,
        "armorType": "heavy",
        "setId": "scale_mail",
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Сет «Чешуйчатый Доспех» (2): Физ. Защита +5.26%, HP +80. Наборные поножи из закаленной чешуйчатой брони.",
        "icon": "assets/inventar/icons/scale_mail_gaiters.webp"
},
    SCALE_MAIL_SHIELD: {
        "id": "scale_mail_shield",
        "name": "Чешуйчатый Щит Регулятора",
        "l2Name": "Scale Mail Shield",
        "type": "armor",
        "slot": EQUIP_SLOTS.SHIELD,
        "grade": "D",
        "defense": 75,
        "weight": 1200,
        "price": 18000,
        "levelReq": 20,
        "crystalCount": 36,
        "armorType": "heavy",
        "setId": null,
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Массивный чешуйчатый щит D-ранга для блокирования атак тяжелых автоматонов.",
        "icon": "assets/inventar/icons/scale_mail_shield.webp",
        "blockRate": 20
},
    OPERATOR_GAUNTLETS_LOW: {
        "id": "operator_gauntlets_low",
        "name": "Тяжелые Рукавицы Оператора",
        "l2Name": "Gauntlets",
        "type": "armor",
        "slot": EQUIP_SLOTS.GLOVES,
        "grade": "D",
        "defense": 22,
        "weight": 180,
        "price": 18000,
        "levelReq": 20,
        "crystalCount": 36,
        "armorType": "heavy",
        "setId": null,
        "isOperatorArmor": true,
        "isLivePhase1": true,
        "description": "Латные боевые рукавицы Low D ранга с шарнирными пластинами на фалангах пальцев.",
        "icon": "assets/inventar/icons/operator_gauntlets_low.webp"
},
    // ─── Оружие Оператора LIVE 1–20 (эталон L2 C1) ───
    OPERATOR_HAMMER_LOW: {
        id: 'operator_hammer_low',
        name: 'Рычажный Молот Ученика',
        l2Name: "Apprentice's Hammer",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 8,
        cAtk: 6,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        weight: 1200,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Базовый одноручный рычажный молот ученика-оператора. Прочный кованый инструмент с удобной рукоятью для начального освоения ближнего боя и ударов по броне автоматонов.',
        icon: 'assets/props/icons_weapon/operator_hammer_low.webp',
        price: 100
    },
    SHORT_SWORD: {
        id: 'short_sword',
        name: 'Меч Ученика',
        l2Name: "Short Sword",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 8,
        cAtk: 6,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        weight: 1400,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легкий одноручный стальной меч ученика-оператора. Сбалансированный прямой клинок для изучения основ фехтования и эффективной защиты в паре с тактическим щитом.',
        icon: 'assets/props/icons_weapon/short_sword.webp',
        price: 138
    },
    MAGE_DAGGER: {
        id: 'mage_dagger',
        name: 'Кинжал Наладчика',
        l2Name: "Dagger",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 6,
        cAtk: 6,
        weaponClass: 'dagger',
        baseAtkSpd: 333,
        atkSpdGrade: 'Very Fast',
        weight: 1150,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Компактный стилет для нанесения быстрых ударов по уязвимым соединениям, гидравлическим трубкам и шарнирам вражеских машин.',
        icon: 'assets/props/icons_weapon/mage_dagger.webp',
        price: 138
    },
    COPPER_PIPE: {
        id: 'copper_pipe',
        name: 'Медная Труба',
        l2Name: "Willow Staff",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 10,
        cAtk: 7,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        weight: 1200,
        levelReq: 1,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Отрезок толстостенной медной трубы высокого давления со следами сварки. Наносит глухие увесистые дробящие повреждения.',
        icon: 'assets/props/icons_weapon/copper_pipe.webp',
        price: 350
    },
    LONG_SWORD: {
        id: 'long_sword',
        name: 'Рычажный Меч',
        l2Name: "Long Sword",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 17,
        cAtk: 12,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        weight: 1400,
        levelReq: 5,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Удлиненный одноручный стальной меч с противовесом на гарде. Позволяет оператору наносить сильные рубящие удары со щитом.',
        icon: 'assets/props/icons_weapon/long_sword.webp',
        price: 38000
    },
    IRON_HAMMER: {
        id: 'iron_hammer',
        name: 'Железный Молот',
        l2Name: "Heavy Club",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 15,
        cAtk: 11,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        weight: 1650,
        levelReq: 5,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый кованый молот для разбивания броневых листов и деформации защитных кожухов автоматонов.',
        icon: 'assets/props/icons_weapon/iron_hammer.webp',
        price: 32000
    },
    DIRK: {
        id: 'dirk',
        name: 'Штамповочный Кортик',
        l2Name: "Dirk",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 12,
        cAtk: 9,
        weaponClass: 'dagger',
        baseAtkSpd: 333,
        atkSpdGrade: 'Very Fast',
        weight: 1150,
        levelReq: 5,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Острый клинок со штампованным долом для высокой скорости ударов и точечного поражения проводки механизмов.',
        icon: 'assets/props/icons_weapon/dirk.webp',
        price: 26000
    },
    SPRING_BOW: {
        id: 'spring_bow',
        name: 'Рессорный Лук',
        l2Name: "Short Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 18,
        cAtk: 10,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 1750,
        levelReq: 1,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.',
        icon: 'assets/props/icons_weapon/spring_bow.webp',
        price: 32000
    },
    STEAM_PISTOL: {
        id: 'steam_pistol',
        name: 'Рессорный Лук',
        l2Name: "Short Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 18,
        cAtk: 10,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 1750,
        levelReq: 1,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легкий механический лук с плечами из закаленных стальных рессор. Позволяет оператору вести быстрый темповый обстрел позиций автоматонов со средней дистанции.',
        icon: 'assets/props/icons_weapon/spring_bow.webp',
        price: 32000
    },
    BASTARD_SWORD: {
        id: 'bastard_sword',
        name: 'Силовой Палаш',
        l2Name: "Bastard Sword",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 24,
        cAtk: 17,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        weight: 1400,
        levelReq: 15,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Топовый полуторный меч No-Grade ранга. Выкован из закаленной стали, идеально сбалансирован для сокрушительных выпадов.',
        icon: 'assets/props/icons_weapon/bastard_sword.webp',
        price: 136000
    },
    STEAM_HAMMER: {
        id: 'steam_hammer',
        name: 'Паровой Молот',
        l2Name: "Morning Star",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 28,
        cAtk: 17,
        weaponClass: '2h_blunt',
        baseAtkSpd: 190,
        atkSpdGrade: 'Slow',
        twoHanded: true,
        weight: 2000,
        levelReq: 1,
        soulshotUse: 3,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Топовый двуручный боевой молот No-Grade ранга с пневматической камерой для сокрушительных ударов по площади.',
        icon: 'assets/props/icons_weapon/steam_hammer.webp',
        price: 136000
    },
    ASSASSIN_KNIFE: {
        id: 'assassin_knife',
        name: 'Стилет Сбоя',
        l2Name: "Assassin Knife",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 19,
        cAtk: 14,
        weaponClass: 'dagger',
        baseAtkSpd: 333,
        atkSpdGrade: 'Very Fast',
        weight: 1100,
        levelReq: 15,
        soulshotUse: 1,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Топовый кинжал No-Grade ранга с граненой заточкой из титанового сплава для быстрых критических ударов.',
        icon: 'assets/props/icons_weapon/assassin_knife.webp',
        price: 136000
    },
    COMPOSITE_BOW: {
        id: 'composite_bow',
        name: 'Композитный Лук',
        l2Name: "Composite Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 42,
        cAtk: 17,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 2000,
        levelReq: 1,
        soulshotUse: 4,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.',
        icon: 'assets/props/icons_weapon/composite_bow.webp',
        price: 136000
    },
    PNEUMATIC_RIFLE: {
        id: 'pneumatic_rifle',
        name: 'Композитный Лук',
        l2Name: "Composite Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'NO_GRADE',
        attack: 42,
        cAtk: 17,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        weight: 2000,
        levelReq: 1,
        soulshotUse: 4,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый композитный лук No-Grade ранга с многослойными стале-титановыми плечами и вспомогательным пневматическим натяжителем тетивы.',
        icon: 'assets/props/icons_weapon/composite_bow.webp',
        price: 136000
    },
    REVOLUTION_SWORD: {
        id: 'revolution_sword',
        name: 'Меч Революции',
        l2Name: "Sword of Revolution",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 36,
        cAtk: 26,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        crystalCount: 818,
        crystalId: 'crystal_d',
        weight: 1400,
        levelReq: 20,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Легендарный одноручный меч ранга Low D. Изготовлен оружейниками цехового сопротивления из многослойной стали. Обладает высочайшим уроном среди доступных одноручных мечей первой фазы.',
        icon: 'assets/props/icons_weapon/revolution_sword.webp',
        price: 409000
    },
    HEAVY_DOOM_HAMMER: {
        id: 'heavy_doom_hammer',
        name: 'Тяжелый Молот Рока',
        l2Name: "Heavy Doom Hammer",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 36,
        cAtk: 26,
        weaponClass: '1h_blunt',
        baseAtkSpd: 275,
        atkSpdGrade: 'Fast',
        crystalCount: 818,
        crystalId: 'crystal_d',
        weight: 1650,
        levelReq: 20,
        soulshotUse: 3,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Сокрушительный одноручный боевой молот ранга Low D с утяжеленным чугунным оголовком и гидрокомпенсатором отдачи.',
        icon: 'assets/props/icons_weapon/heavy_doom_hammer.webp',
        price: 409000
    },
    PROWLER_DAGGER: {
        id: 'prowler_dagger',
        name: 'Кинжал Теней',
        l2Name: "Prowler",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 30,
        cAtk: 26,
        weaponClass: 'dagger',
        baseAtkSpd: 333,
        atkSpdGrade: 'Very Fast',
        crystalCount: 818,
        crystalId: 'crystal_d',
        weight: 1100,
        levelReq: 20,
        soulshotUse: 2,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Пронзающий боевой кинжал ранга Low D с алмазной заточкой и полимерным антибликовым покрытием лезвия.',
        icon: 'assets/props/icons_weapon/prowler_dagger.webp',
        price: 409000
    },
    REINFORCED_BOW: {
        id: 'reinforced_bow',
        name: 'Усиленный Пневмолук',
        l2Name: "Reinforced Bow",
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'D',
        attack: 71,
        cAtk: 26,
        weaponClass: 'bow',
        baseAtkSpd: 293,
        atkSpdGrade: 'Normal',
        ranged: true,
        twoHanded: true,
        crystalCount: 818,
        crystalId: 'crystal_d',
        weight: 2000,
        levelReq: 20,
        soulshotUse: 6,
        spiritshotUse: 1,
        isOperatorWeapon: true,
        isLivePhase1: true,
        description: 'Тяжелый блочный лук ранга Low D с усиленными титановыми рессорами и вспомогательным пневматическим натяжителем.',
        icon: 'assets/props/icons_weapon/reinforced_bow.webp',
        price: 409000
    },
    HYDRAULIC_BLADE: {
        id: 'hydraulic_blade',
        name: 'Гидравлический Клинок',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'C',
        attack: 45,
        weaponClass: '1h_sword',
        baseAtkSpd: 247,
        atkSpdGrade: 'Normal',
        description: '1H sword. Atk.Spd base 247. Casting Spd не меняет.',
        icon: 'assets/props/icons_weapon/hydraulic_blade.webp',
        price: 85000
    },
    COLOSSUS_FIST: {
        id: 'colossus_fist',
        name: 'Кулак Колосса',
        type: 'weapon',
        slot: EQUIP_SLOTS.WEAPON,
        grade: 'S',
        attack: 120,
        weaponClass: 'fist',
        baseAtkSpd: 217,
        atkSpdGrade: 'Normal',
        description: 'Кулаки. Atk.Spd base 217 → ~242 @DEX21.',
        icon: 'assets/props/icons_weapon/colossus_fist.webp',
        price: 2500000
    },
    
    // === БРОНЯ (контурные робы C1) — статы = L2 P.Def, сеты в ITEM_DB.ARMOR_SETS ===
    // Spellcraft: chest+legs robe ИЛИ fullBody. Сет-бонусы — только при полном наборе частей.

    // No-Grade: Контур (без сета) + Клятва (+15% cast)
    CIRCUIT_ROBE_JACKET: {
        id: 'circuit_robe_jacket',
        name: 'Куртка Первичного Контура',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'magic',
        grade: 'NO_GRADE',
        defense: 17,
        cDef: 16,
        energyBonus: 40,
        description: 'Сет «Первичный Контур» (2): без сетового бонуса.',
        icon: 'assets/inventar/icons/circuit_robe_jacket.webp',
        price: 150
    },
    CIRCUIT_ROBE_PANTS: {
        id: 'circuit_robe_pants',
        name: 'Штаны Первичного Контура',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'magic',
        grade: 'NO_GRADE',
        defense: 11,
        cDef: 10,
        energyBonus: 25,
        description: 'Сет «Первичный Контур» (2): без сетового бонуса.',
        icon: 'assets/inventar/icons/circuit_robe_pants.webp',
        price: 120
    },
    DEVOTION_JACKET: {
        id: 'devotion_jacket',
        name: 'Куртка Турбо-Контура',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'devotion',
        grade: 'NO_GRADE',
        defense: 30,
        cDef: 28,
        energyBonus: 80,
        description: 'Сет «Турбо-Контур» (2): Casting Spd +15% поверх Spellcraft.',
        icon: 'assets/inventar/icons/devotion_jacket.webp',
        price: 800
    },
    DEVOTION_PANTS: {
        id: 'devotion_pants',
        name: 'Штаны Турбо-Контура',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'devotion',
        grade: 'NO_GRADE',
        defense: 19,
        cDef: 18,
        energyBonus: 50,
        description: 'Сет «Турбо-Контур» (2): Casting Spd +15%.',
        icon: 'assets/inventar/icons/devotion_pants.webp',
        price: 600
    },
    // D-Grade: Чертёж (+10% cAtk, −5% MP regen) + Сплав (без сета)
    KNOWLEDGE_JACKET: {
        id: 'knowledge_jacket',
        name: 'Куртка Сверхдавления',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'knowledge',
        grade: 'D',
        defense: 49,
        cDef: 46,
        energyBonus: 120,
        description: 'Сет «Сверхдавление» (3): Схем. Атк +10%, реген пара −5%.',
        icon: 'assets/inventar/icons/knowledge_jacket.webp',
        price: 42000
    },
    KNOWLEDGE_PANTS: {
        id: 'knowledge_pants',
        name: 'Штаны Сверхдавления',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'knowledge',
        grade: 'D',
        defense: 30,
        cDef: 28,
        energyBonus: 75,
        description: 'Сет «Сверхдавление» (3).',
        icon: 'assets/inventar/icons/knowledge_pants.webp',
        price: 26000
    },
    KNOWLEDGE_GLOVES: {
        id: 'knowledge_gloves',
        name: 'Перчатки Сверхдавления',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'knowledge',
        grade: 'D',
        defense: 22,
        cDef: 20,
        description: 'Сет «Сверхдавление» (3).',
        icon: 'assets/inventar/icons/knowledge_gloves.webp',
        price: 18000
    },
    MITHRIL_JACKET: {
        id: 'mithril_jacket',
        name: 'Куртка Армированного Сплава',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'mithril',
        grade: 'D',
        defense: 49,
        cDef: 46,
        energyBonus: 120,
        description: 'Сет «Армированный Сплав» (2): без сетового бонуса .',
        icon: 'assets/inventar/icons/mithril_jacket.webp',
        price: 40000
    },
    MITHRIL_PANTS: {
        id: 'mithril_pants',
        name: 'Штаны Армированного Сплава',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'mithril',
        grade: 'D',
        defense: 30,
        cDef: 28,
        energyBonus: 75,
        description: 'Сет «Армированный Сплав» (2): без сетового бонуса .',
        icon: 'assets/inventar/icons/mithril_pants.webp',
        price: 25000
    },
    // C-Grade: Наладка / Порча / Песнь
    KARMIAN_JACKET: {
        id: 'karmian_jacket',
        name: 'Куртка Гармонии',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'karmian',
        grade: 'C',
        defense: 60,
        cDef: 56,
        energyBonus: 180,
        description: 'Сет «Гармония» (3): Cast +15%, P.Def +5.26%.',
        icon: 'assets/inventar/icons/karmian_jacket.webp',
        price: 380000
    },
    KARMIAN_PANTS: {
        id: 'karmian_pants',
        name: 'Штаны Гармонии',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'karmian',
        grade: 'C',
        defense: 37,
        cDef: 35,
        energyBonus: 110,
        description: 'Сет «Гармония» (3).',
        icon: 'assets/inventar/icons/karmian_pants.webp',
        price: 240000
    },
    KARMIAN_GLOVES: {
        id: 'karmian_gloves',
        name: 'Перчатки Гармонии',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'karmian',
        grade: 'C',
        defense: 32,
        cDef: 30,
        description: 'Сет «Гармония» (3).',
        icon: 'assets/inventar/icons/karmian_gloves.webp',
        price: 160000
    },
    DEMON_JACKET: {
        id: 'demon_jacket',
        name: 'Куртка Порчи',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'demon',
        grade: 'C',
        defense: 69,
        cDef: 64,
        energyBonus: 200,
        description: 'Сет «Порча» (3): INT +4, WIT −1, Max HP −270.',
        icon: 'assets/inventar/icons/demon_jacket.webp',
        price: 520000
    },
    DEMON_PANTS: {
        id: 'demon_pants',
        name: 'Штаны Порчи',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'demon',
        grade: 'C',
        defense: 43,
        cDef: 40,
        energyBonus: 125,
        description: 'Сет «Порча» (3).',
        icon: 'assets/inventar/icons/demon_pants.webp',
        price: 320000
    },
    DEMON_GLOVES: {
        id: 'demon_gloves',
        name: 'Перчатки Порчи',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'demon',
        grade: 'C',
        defense: 36,
        cDef: 33,
        description: 'Сет «Порча» (3).',
        icon: 'assets/inventar/icons/demon_gloves.webp',
        price: 200000
    },
    DIVINE_JACKET: {
        id: 'divine_jacket',
        name: 'Божественная Куртка',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'divine',
        grade: 'C',
        defense: 69,
        cDef: 64,
        energyBonus: 220,
        description: 'Сет «Божественный» (3): Max Пар +5.24%.',
        icon: 'assets/inventar/icons/divine_jacket.webp',
        price: 480000
    },
    DIVINE_PANTS: {
        id: 'divine_pants',
        name: 'Божественные Штаны',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'divine',
        grade: 'C',
        defense: 43,
        cDef: 40,
        energyBonus: 140,
        description: 'Сет «Божественный» (3).',
        icon: 'assets/inventar/icons/divine_pants.webp',
        price: 300000
    },
    DIVINE_GLOVES: {
        id: 'divine_gloves',
        name: 'Божественные Перчатки',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'divine',
        grade: 'C',
        defense: 36,
        cDef: 33,
        description: 'Сет «Божественный» (3).',
        icon: 'assets/inventar/icons/divine_gloves.webp',
        price: 190000
    },
    // B-Grade
    AVADON_ROBE: {
        id: 'avadon_robe',
        name: 'Роба Оплота',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'avadon',
        fullBody: true,
        grade: 'B',
        defense: 92,
        cDef: 86,
        energyBonus: 320,
        description: 'Цельная роба. Сет «Оплот» (4): Cast +15%, P.Def +5.25%.',
        icon: 'assets/inventar/icons/avadon_robe.webp',
        price: 4200000
    },
    AVADON_CIRCLET: {
        id: 'avadon_circlet',
        name: 'Венец Оплота',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'robe',
        setId: 'avadon',
        grade: 'B',
        defense: 55,
        cDef: 50,
        description: 'Сет «Оплот» (4).',
        icon: 'assets/inventar/icons/avadon_circlet.webp',
        price: 1800000
    },
    AVADON_GLOVES: {
        id: 'avadon_gloves',
        name: 'Перчатки Оплота',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'avadon',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Оплот» (4).',
        icon: 'assets/inventar/icons/avadon_gloves.webp',
        price: 1400000
    },
    AVADON_BOOTS: {
        id: 'avadon_boots',
        name: 'Сапоги Оплота',
        type: 'armor',
        slot: EQUIP_SLOTS.BOOTS,
        armorType: 'robe',
        setId: 'avadon',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Оплот» (4).',
        icon: 'assets/inventar/icons/avadon_boots.webp',
        price: 1400000
    },
    ZUBEI_JACKET: {
        id: 'zubei_jacket',
        name: 'Куртка Закалки',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'zubei',
        grade: 'B',
        defense: 83,
        cDef: 78,
        energyBonus: 280,
        description: 'Сет «Закалка» (3): Схем. Атк +10%, реген пара −5%.',
        icon: 'assets/inventar/icons/zubei_jacket.webp',
        price: 3800000
    },
    ZUBEI_PANTS: {
        id: 'zubei_pants',
        name: 'Штаны Закалки',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'zubei',
        grade: 'B',
        defense: 52,
        cDef: 48,
        energyBonus: 170,
        description: 'Сет «Закалка» (3).',
        icon: 'assets/inventar/icons/zubei_pants.webp',
        price: 2400000
    },
    ZUBEI_CIRCLET: {
        id: 'zubei_circlet',
        name: 'Венец Закалки',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'robe',
        setId: 'zubei',
        grade: 'B',
        defense: 55,
        cDef: 50,
        description: 'Сет «Закалка» (3).',
        icon: 'assets/inventar/icons/zubei_circlet.webp',
        price: 1600000
    },
    DOOM_JACKET: {
        id: 'doom_jacket',
        name: 'Куртка Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'doom',
        grade: 'B',
        defense: 83,
        cDef: 78,
        energyBonus: 280,
        description: 'Сет «Рок» (5): Speed +7, реген +5.26%, INT +2, MEN −1, WIT −2.',
        icon: 'assets/inventar/icons/doom_jacket.webp',
        price: 4000000
    },
    DOOM_PANTS: {
        id: 'doom_pants',
        name: 'Штаны Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'doom',
        grade: 'B',
        defense: 52,
        cDef: 48,
        energyBonus: 170,
        description: 'Сет «Рок» (5).',
        icon: 'assets/inventar/icons/doom_pants.webp',
        price: 2500000
    },
    DOOM_CIRCLET: {
        id: 'doom_circlet',
        name: 'Венец Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'robe',
        setId: 'doom',
        grade: 'B',
        defense: 55,
        cDef: 50,
        description: 'Сет «Рок» (5).',
        icon: 'assets/inventar/icons/doom_circlet.webp',
        price: 1700000
    },
    DOOM_GLOVES: {
        id: 'doom_gloves',
        name: 'Перчатки Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'doom',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Рок» (5).',
        icon: 'assets/inventar/icons/doom_gloves.webp',
        price: 1500000
    },
    DOOM_BOOTS: {
        id: 'doom_boots',
        name: 'Сапоги Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.BOOTS,
        armorType: 'robe',
        setId: 'doom',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Рок» (5).',
        icon: 'assets/inventar/icons/doom_boots.webp',
        price: 1500000
    },
    BLUE_WOLF_JACKET: {
        id: 'blue_wolf_jacket',
        name: 'Куртка Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        setId: 'blue_wolf',
        grade: 'B',
        defense: 83,
        cDef: 78,
        energyBonus: 280,
        description: 'Сет «Стальной Волк» (5): Max Пар +206, реген +5.26%, INT −2, MEN +3, WIT −1.',
        icon: 'assets/inventar/icons/blue_wolf_jacket.webp',
        price: 4000000
    },
    BLUE_WOLF_PANTS: {
        id: 'blue_wolf_pants',
        name: 'Штаны Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.LEGS,
        armorType: 'robe',
        setId: 'blue_wolf',
        grade: 'B',
        defense: 52,
        cDef: 48,
        energyBonus: 170,
        description: 'Сет «Стальной Волк» (5).',
        icon: 'assets/inventar/icons/blue_wolf_pants.webp',
        price: 2500000
    },
    BLUE_WOLF_CIRCLET: {
        id: 'blue_wolf_circlet',
        name: 'Венец Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'robe',
        setId: 'blue_wolf',
        grade: 'B',
        defense: 55,
        cDef: 50,
        description: 'Сет «Стальной Волк» (5).',
        icon: 'assets/inventar/icons/blue_wolf_circlet.webp',
        price: 1700000
    },
    BLUE_WOLF_GLOVES: {
        id: 'blue_wolf_gloves',
        name: 'Перчатки Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'robe',
        setId: 'blue_wolf',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Стальной Волк» (5).',
        icon: 'assets/inventar/icons/blue_wolf_gloves.webp',
        price: 1500000
    },
    BLUE_WOLF_BOOTS: {
        id: 'blue_wolf_boots',
        name: 'Сапоги Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.BOOTS,
        armorType: 'robe',
        setId: 'blue_wolf',
        grade: 'B',
        defense: 41,
        cDef: 38,
        description: 'Сет «Стальной Волк» (5).',
        icon: 'assets/inventar/icons/blue_wolf_boots.webp',
        price: 1500000
    },
    WORKER_OVERALLS: {
        id: 'worker_overalls',
        name: 'Рабочий комбинезон',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'robe',
        grade: 'NO_GRADE',
        defense: 33,
        hpBonus: 0,
        description: 'Простая роба. Без сета.',
        icon: 'assets/inventar/icons/worker_overalls.webp',
        price: 200
    },
    COPPER_PLATE: {
        id: 'copper_plate',
        name: 'Медная кираса',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'heavy',
        grade: 'D',
        defense: 75,
        hpBonus: 80,
        description: 'Клёпаная медная кираса. Тяжёлая защита Регуляторов D-ранга.',
        icon: 'assets/inventar/icons/copper_plate.webp',
        price: 45000
    },
    HYDRAULIC_ARMOR: {
        id: 'hydraulic_armor',
        name: 'Гидравлический доспех',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'heavy',
        grade: 'C',
        defense: 113,
        hpBonus: 200,
        energyBonus: 30,
        description: 'Экзоскелет с сервоприводами и гидравлическими усилителями.',
        icon: 'assets/inventar/icons/hydraulic_armor.webp',
        price: 120000
    },
    COLOSSUS_PLATING: {
        id: 'colossus_plating',
        name: 'Броня Колосса',
        type: 'armor',
        slot: EQUIP_SLOTS.CHEST,
        armorType: 'heavy',
        grade: 'S',
        defense: 180,
        hpBonus: 800,
        energyBonus: 100,
        description: 'Обшивка недостроенного стального гиганта.',
        icon: 'assets/inventar/icons/colossus_plating.webp',
        price: 3000000
    },
    
    // === ШЛЕМЫ ===
    GOGGLES: {
        id: 'goggles',
        name: 'Защитные очки',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'light',
        grade: 'NO_GRADE',
        defense: 12,
        description: 'Очки с медной оправой. Защищают от искр.',
        icon: 'assets/inventar/icons/goggles.webp',
        price: 80
    },
    STEAM_HELMET: {
        id: 'steam_helmet',
        name: 'Паровой шлем',
        type: 'armor',
        slot: EQUIP_SLOTS.HEAD,
        armorType: 'heavy',
        grade: 'D',
        defense: 38,
        hpBonus: 30,
        description: 'Шлем с вентиляционными клапанами. Защита черепа D-ранга.',
        icon: 'assets/inventar/icons/steam_helmet.webp',
        price: 18000
    },
    
    // === ПЕРЧАТКИ ===
    LEATHER_GLOVES: {
        id: 'leather_gloves',
        name: 'Кожаные перчатки',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'light',
        grade: 'NO_GRADE',
        defense: 8,
        description: 'Перчатки для работы с горячими деталями.',
        icon: 'assets/inventar/icons/leather_gloves.webp',
        price: 50
    },
    PISTON_GAUNTLETS: {
        id: 'piston_gauntlets',
        name: 'Поршневые латные перчатки',
        type: 'armor',
        slot: EQUIP_SLOTS.GLOVES,
        armorType: 'heavy',
        grade: 'C',
        defense: 32,
        attackBonus: 8,
        description: 'Усиливают хват и удар.',
        icon: 'assets/inventar/icons/piston_gauntlets.webp',
        price: 45000
    },
    
    // === САПОГИ ===
    WORK_BOOTS: {
        id: 'work_boots',
        name: 'Рабочие ботинки',
        type: 'armor',
        slot: EQUIP_SLOTS.BOOTS,
        armorType: 'light',
        grade: 'NO_GRADE',
        defense: 7,
        speedBonus: 0.5,
        description: 'Тяжёлые ботинки с металлическим носком.',
        icon: 'assets/inventar/icons/work_boots.webp',
        price: 60
    },
    STEAM_BOOTS: {
        id: 'steam_boots',
        name: 'Паровые сапоги',
        type: 'armor',
        slot: EQUIP_SLOTS.BOOTS,
        armorType: 'heavy',
        grade: 'D',
        defense: 25,
        speedBonus: 2,
        description: 'Мини-поршни в подошве ускоряют шаг. Защита ног D-ранга.',
        icon: 'assets/inventar/icons/steam_boots.webp',
        price: 14000
    },
    
    // === ЩИТЫ (P.Def = L2 C1, см. assets/weapons/Shields.txt) ===
    // No-Grade 1–19
    BUCKLER: {
        id: 'buckler',
        name: 'Малый Баклер',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 16,
        blockRate: 0,
        isShield: true,
        description: 'Стартовый щит. No-Grade.',
        icon: 'assets/inventar/icons/buckler.webp',
        price: 200
    },
    WOOD_BLOCK: {
        id: 'wood_block',
        name: 'Деревянный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 26,
        blockRate: 0,
        isShield: true,
        description: 'Промежуточный No-Grade.',
        icon: 'assets/inventar/icons/wood_block.webp',
        price: 1200
    },
    REFLECTION_SHIELD: {
        id: 'reflection_shield',
        name: 'Щит Отражения',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 43,
        blockRate: 1,
        isShield: true,
        description: 'No-Grade, 10–15 ур.',
        icon: 'assets/inventar/icons/reflection_shield.webp',
        price: 4500
    },
    KITE_SHIELD_NG: {
        id: 'kite_shield_ng',
        name: 'Каплевидный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 52,
        blockRate: 1,
        isShield: true,
        description: 'Сильный магазинный No-Grade.',
        icon: 'assets/inventar/icons/kite_shield_ng.webp',
        price: 9000
    },
    SQUARE_SHIELD: {
        id: 'square_shield',
        name: 'Квадратный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 63,
        blockRate: 2,
        isShield: true,
        description: 'Топ No-Grade.',
        icon: 'assets/inventar/icons/square_shield.webp',
        price: 16000
    },
    BONE_SHIELD: {
        id: 'bone_shield',
        name: 'Костяной Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 63,
        blockRate: 2,
        isShield: true,
        description: 'Топ No-Grade. Аналог Квадратного.',
        icon: 'assets/inventar/icons/bone_shield.webp',
        price: 16000
    },
    COPPER_SHIELD: {
        id: 'copper_shield',
        name: 'Медный щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'NO_GRADE',
        defense: 8,
        blockRate: 10,
        isShield: true,
        description: 'Тактический щит из толстой листовой меди с внутренней заклепочной рамой.',
        icon: 'assets/inventar/icons/copper_shield.webp',
        price: 300
    },
    // D-Grade 20–39
    BOILER_SHIELD: {
        id: 'boiler_shield',
        name: 'Котловой Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 75,
        blockRate: 2,
        isShield: true,
        description: 'Стартовый D. Блок срывает каст .',
        icon: 'assets/inventar/icons/boiler_shield.webp',
        price: 28000
    },
    HOPLON: {
        id: 'hoplon',
        name: 'Гоплон Давления',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 75,
        blockRate: 2,
        isShield: true,
        description: 'Входной D-грейд.',
        icon: 'assets/inventar/icons/hoplon.webp',
        price: 32000
    },
    IRON_SHIELD: {
        id: 'iron_shield',
        name: 'Железный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 88,
        blockRate: 2,
        isShield: true,
        description: 'Середняк D, 25–30 ур.',
        icon: 'assets/inventar/icons/iron_shield.webp',
        price: 55000
    },
    ELVEN_SHIELD: {
        id: 'elven_shield',
        name: 'Сплавной Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 101,
        blockRate: 3,
        isShield: true,
        description: 'Предтоповый D.',
        icon: 'assets/inventar/icons/elven_shield.webp',
        price: 95000
    },
    KITE_SHIELD_D: {
        id: 'kite_shield_d',
        name: 'Большой Каплевидный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 101,
        blockRate: 3,
        isShield: true,
        description: 'D-грейд. Как Сплавной по P.Def.',
        icon: 'assets/inventar/icons/kite_shield_d.webp',
        price: 95000
    },
    BLOOD_SHIELD: {
        id: 'blood_shield',
        name: 'Щит Забвения',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 116,
        blockRate: 3,
        isShield: true,
        setId: 'blood',
        description: 'Топ D. Сет blood.',
        icon: 'assets/inventar/icons/blood_shield.webp',
        price: 160000
    },
    LION_SHIELD: {
        id: 'lion_shield',
        name: 'Щит Рездика',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'D',
        defense: 116,
        blockRate: 3,
        isShield: true,
        setId: 'lion',
        description: 'Топ D. Сет lion.',
        icon: 'assets/inventar/icons/lion_shield.webp',
        price: 160000
    },
    // C-Grade 40–51
    DWARVEN_SHIELD: {
        id: 'dwarven_shield',
        name: 'Кузнечный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'C',
        defense: 129,
        blockRate: 3,
        isShield: true,
        description: 'Входной C.',
        icon: 'assets/inventar/icons/dwarven_shield.webp',
        price: 380000
    },
    TOWER_SHIELD: {
        id: 'tower_shield',
        name: 'Башенный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'C',
        defense: 141,
        blockRate: 4,
        isShield: true,
        description: 'Средний C.',
        icon: 'assets/inventar/icons/tower_shield.webp',
        price: 620000
    },
    COMPOSITE_SHIELD: {
        id: 'composite_shield',
        name: 'Композитный Щит',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'C',
        defense: 153,
        blockRate: 4,
        isShield: true,
        setId: 'composite',
        description: 'Предтоп C. Сет composite.',
        icon: 'assets/inventar/icons/composite_shield.webp',
        price: 1100000
    },
    FULL_PLATE_SHIELD: {
        id: 'full_plate_shield',
        name: 'Щит Полных Лат',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'C',
        defense: 153,
        blockRate: 4,
        isShield: true,
        setId: 'full_plate',
        description: 'Топ C. Сет full_plate (HP).',
        icon: 'assets/inventar/icons/full_plate_shield.webp',
        price: 1300000
    },
    // B-Grade 52+
    ZUBEI_SHIELD: {
        id: 'zubei_shield',
        name: 'Щит Закалки',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'B',
        defense: 176,
        blockRate: 4,
        isShield: true,
        setId: 'zubei',
        description: 'Низший B-рейд. Сет zubei.',
        icon: 'assets/inventar/icons/zubei_shield.webp',
        price: 4200000
    },
    AVADON_SHIELD: {
        id: 'avadon_shield',
        name: 'Щит Оплота',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'B',
        defense: 183,
        blockRate: 6,
        isShield: true,
        setId: 'avadon',
        description: 'Средний B. +блок. Сет avadon.',
        icon: 'assets/inventar/icons/avadon_shield.webp',
        price: 5500000
    },
    BLUE_WOLF_SHIELD: {
        id: 'blue_wolf_shield',
        name: 'Щит Стального Волка',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'B',
        defense: 190,
        blockRate: 5,
        isShield: true,
        setId: 'blue_wolf',
        description: 'Топ B. Сет blue_wolf.',
        icon: 'assets/inventar/icons/blue_wolf_shield.webp',
        price: 7200000
    },
    DOOM_SHIELD: {
        id: 'doom_shield',
        name: 'Щит Рока',
        type: 'armor',
        slot: EQUIP_SLOTS.SHIELD,
        armorType: 'heavy',
        grade: 'B',
        defense: 190,
        blockRate: 5,
        isShield: true,
        setId: 'doom',
        description: 'Топ B. Танк-мета.',
        icon: 'assets/inventar/icons/doom_shield.webp',
        price: 7500000
    },

    // === АКСЕССУАРЫ ===
    COPPER_EARRING: {
        id: 'copper_earring',
        name: 'Медная серьга',
        type: 'accessory',
        slot: EQUIP_SLOTS.EARRING_L,
        grade: 'NO_GRADE',
        defense: 9,
        cDef: 9,
        energyBonus: 5,
        description: 'Простое украшение из медной проволоки.',
        icon: 'assets/inventar/icons/copper_earring.webp',
        price: 300
    },
    COPPER_NECKLACE: {
        id: 'copper_necklace',
        name: 'Медное Ожерелье',
        type: 'accessory',
        slot: EQUIP_SLOTS.NECKLACE,
        grade: 'NO_GRADE',
        defense: 12,
        cDef: 12,
        description: 'Простое медное ожерелье с заземляющей пластиной для защиты от магических импульсов.',
        icon: 'assets/inventar/icons/engine_necklace.webp',
        price: 600
    },
    COPPER_RING: {
        id: 'copper_ring',
        name: 'Медный Фиксатор',
        type: 'accessory',
        slot: EQUIP_SLOTS.BRACELET,
        grade: 'NO_GRADE',
        defense: 6,
        cDef: 6,
        description: 'Наручный фиксатор из медного сплава, поглощающий остаточные токи контуров.',
        icon: 'assets/inventar/icons/pressure_ring.webp',
        price: 250
    },
    CORAL_EARRING: {
        id: 'coral_earring',
        name: 'Фреоновая Серьга',
        type: 'accessory',
        slot: EQUIP_SLOTS.EARRING_L,
        grade: 'D',
        defense: 18,
        cDef: 18,
        description: 'Элегантная серьга с каплей очищенного хладагента. Защита от магии.',
        icon: 'assets/inventar/icons/copper_earring.webp',
        price: 8500
    },
    IRON_NECKLACE: {
        id: 'iron_necklace',
        name: 'Штампованное Ожерелье',
        type: 'accessory',
        slot: EQUIP_SLOTS.NECKLACE,
        grade: 'D',
        defense: 24,
        cDef: 24,
        description: 'Массивное кованое ожерелье ранга D с экранирующим напылением.',
        icon: 'assets/inventar/icons/directive_seal.webp',
        price: 14000
    },
    PRESSURE_RING: {
        id: 'pressure_ring',
        name: 'Кольцо давления (устар.)',
        type: 'accessory',
        // Кольца объединены в слот браслетов — предмет больше не экипится как ring
        slot: EQUIP_SLOTS.BRACELET,
        grade: 'D',
        attackBonus: 5,
        critBonus: 2,
        description: 'Устаревшее украшение. Слоты колец заменены нано-браслетами инженера.',
        icon: 'assets/inventar/icons/pressure_ring.webp',
        price: 15000
    },
    ENGINE_NECKLACE: {
        id: 'engine_necklace',
        name: 'Ожерелье Двигателя',
        type: 'accessory',
        slot: EQUIP_SLOTS.NECKLACE,
        grade: 'C',
        attackBonus: 12,
        hpBonus: 50,
        energyBonus: 20,
        description: 'Миниатюрный паровой двигатель в кулоне.',
        icon: 'assets/inventar/icons/engine_necklace.webp',
        price: 90000
    },
    
    // === РАСХОДНИКИ ===
    SYNTHETIC_OIL: {
        id: 'synthetic_oil',
        name: 'Синтетическое масло',
        type: 'consumable',
        grade: 'NO_GRADE',
        healHp: 50,
        description: 'Восстанавливает 50 HP. На вкус как машинное масло.',
        icon: 'assets/inventar/icons/synthetic_oil.webp',
        price: 20,
        stackable: true,
        maxStack: 999
    },
    PRESSURE_CANISTER: {
        id: 'pressure_canister',
        name: 'Баллон давления',
        type: 'consumable',
        grade: 'NO_GRADE',
        healEnergy: 30,
        description: 'Восстанавливает 30 энергии (пара).',
        icon: 'assets/inventar/icons/pressure_canister.webp',
        price: 30,
        stackable: true,
        maxStack: 999
    },
    SOULSHOT_D: {
        id: 'soulshot_d',
        name: 'Заряд: Паровой двигатель',
        type: 'consumable',
        grade: 'D',
        damageBoost: 1.5,
        duration: 30,
        description: 'Усиливает следующую физическую атаку на 50%.',
        icon: 'assets/inventar/icons/soulshot_d.webp',
        price: 30,
        stackable: true,
        maxStack: 9999
    },
    EMERGENCY_REPAIR_KIT: {
        id: 'emergency_repair_kit',
        name: 'Аварийный ремкомплект',
        type: 'consumable',
        grade: 'NO_GRADE',
        healHp: 150,
        description: 'Аварийный ремонт корпуса. +150 HP.',
        icon: 'assets/inventar/icons/emergency_repair_kit.webp',
        price: 80,
        stackable: true,
        maxStack: 999
    },
    WOODEN_ARROW: {
        id: 'wooden_arrow',
        name: 'Деревянная стрела',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Стандартная деревянная стрела No-Grade со стальным наконечником для луков.',
        icon: 'assets/inventar/icons/gear_fragment.webp',
        price: 1,
        stackable: true,
        maxStack: 99999
    },
    IRON_ARROW: {
        id: 'iron_arrow',
        name: 'Кованая стрела (D)',
        type: 'consumable',
        grade: 'D',
        description: 'Тяжелая кованая стрела ранга D повышенной кинетической энергии для луков.',
        icon: 'assets/inventar/icons/iron_scrap.webp',
        price: 3,
        stackable: true,
        maxStack: 99999
    },
    SCROLL_ESCAPE: {
        id: 'scroll_escape',
        name: 'Аварийный радиомаяк (SOE)',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Активирует аварийный телепорт и немедленно возвращает в Деревню Поющей Стали.',
        icon: 'assets/inventar/icons/scroll.webp',
        price: 650,
        stackable: true,
        maxStack: 100
    },
    SCROLL_RESURRECTION: {
        id: 'scroll_resurrection',
        name: 'Полевой дефибриллятор',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Реанимирует павшего союзника на поле боя.',
        icon: 'assets/inventar/icons/scroll.webp',
        price: 2800,
        stackable: true,
        maxStack: 100
    },
    ANTIDOTE: {
        id: 'antidote',
        name: 'Очищающий фильтр (Антидот)',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Нейтрализует ядовитые и кислотные испарения.',
        icon: 'assets/inventar/icons/steam_valve.webp',
        price: 60,
        stackable: true,
        maxStack: 100
    },
    BANDAGE: {
        id: 'bandage',
        name: 'Герметизирующий пластырь (Бинт)',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Быстро герметизирует пробоины и останавливает утечку давления/крови.',
        icon: 'assets/inventar/icons/copper_cable.webp',
        price: 40,
        stackable: true,
        maxStack: 100
    },
    POTION_ALACRITY: {
        id: 'potion_alacrity',
        name: 'Машинный форсаж (Alacrity)',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Разгоняет приводы: +15% к скорости атаки на 20 минут.',
        icon: 'assets/inventar/icons/synthetic_oil.webp',
        price: 1200,
        stackable: true,
        maxStack: 50
    },
    POTION_WIND_WALK: {
        id: 'potion_wind_walk',
        name: 'Турбинная смазка (Wind Walk)',
        type: 'consumable',
        grade: 'NO_GRADE',
        description: 'Снижает сопротивление суставов: +20% к скорости бега на 20 минут.',
        icon: 'assets/inventar/icons/synthetic_oil.webp',
        price: 1500,
        stackable: true,
        maxStack: 50
    },
    HIGH_PRESSURE_TANK: {
        id: 'high_pressure_tank',
        name: 'Баллон высокого давления',
        type: 'consumable',
        grade: 'NO_GRADE',
        healEnergy: 80,
        description: 'Восстанавливает 80 энергии (пара).',
        icon: 'assets/inventar/icons/high_pressure_tank.webp',
        price: 90,
        stackable: true,
        maxStack: 999
    },
    
    // === МАТЕРИАЛЫ ДЛЯ КРАФТА / ЛУТ ===
    COPPER_PARTS: {
        id: 'copper_parts',
        name: 'Медные детали',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Основная валюта Острова поющей стали.',
        icon: 'assets/inventar/icons/copper_parts.webp',
        price: 1,
        stackable: true,
        maxStack: 999999999
    },
    IRON_SCRAP: {
        id: 'iron_scrap',
        name: 'Железный лом',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Кусок ржавого железа. Переплавляется в слитки.',
        icon: 'assets/inventar/icons/iron_scrap.webp',
        price: 3,
        stackable: true,
        maxStack: 9999
    },
    COPPER_CABLE: {
        id: 'copper_cable',
        name: 'Медный кабель',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Провод в изоляции из вулканизированной резины.',
        icon: 'assets/inventar/icons/copper_cable.webp',
        price: 8,
        stackable: true,
        maxStack: 9999
    },
    STEAM_VALVE: {
        id: 'steam_valve',
        name: 'Паровой клапан',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Регулирует подачу пара в механизмах.',
        icon: 'assets/inventar/icons/steam_valve.webp',
        price: 15,
        stackable: true,
        maxStack: 9999
    },
    OIL_FILTER: {
        id: 'oil_filter',
        name: 'Масляный фильтр',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Отсеивает ржавчину из контуров.',
        icon: 'assets/inventar/icons/oil_filter.webp',
        price: 12,
        stackable: true,
        maxStack: 9999
    },
    PISTON_RING: {
        id: 'piston_ring',
        name: 'Поршневое кольцо',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Уплотнение для паровых цилиндров.',
        icon: 'assets/inventar/icons/piston_ring.webp',
        price: 18,
        stackable: true,
        maxStack: 9999
    },
    SPARK_PLUG: {
        id: 'spark_plug',
        name: 'Свеча зажигания',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'Искра в котле — жизнь в машине.',
        icon: 'assets/inventar/icons/spark_plug.webp',
        price: 20,
        stackable: true,
        maxStack: 9999
    },
    GEAR_FRAGMENT: {
        id: 'gear_fragment',
        name: 'Обломок шестерни',
        type: 'material',
        grade: 'NO_GRADE',
        description: 'На ней выгравировано: "Сделано до Великой Остановки".',
        icon: 'assets/inventar/icons/gear_fragment.webp',
        price: 5,
        stackable: true,
        maxStack: 9999
    },
    PRESSURE_AMPLIFIER: {
        id: 'pressure_amplifier',
        name: 'Усилитель давления',
        type: 'material',
        grade: 'D',
        description: 'Используется для заточки экипировки.',
        icon: 'assets/inventar/icons/pressure_amplifier.webp',
        price: 500,
        stackable: true,
        maxStack: 9999
    },
    BLUEPRINT_PISTON: {
        id: 'blueprint_piston',
        name: 'Чертеж: Поршень',
        type: 'material',
        grade: 'D',
        description: 'Схема изготовления поршня высокого давления.',
        icon: 'assets/inventar/icons/scroll.webp',
        price: 2000,
        stackable: true,
        maxStack: 100
    },
    BLUEPRINT_STEEL_PLATE: {
        id: 'blueprint_steel_plate',
        name: 'Чертеж: Стальная пластина',
        type: 'material',
        grade: 'C',
        description: 'Схема катки стальной брони.',
        icon: 'assets/inventar/icons/scroll.webp',
        price: 8000,
        stackable: true,
        maxStack: 100
    },
    BLUEPRINT_HYDRAULIC_ARMOR: {
        id: 'blueprint_hydraulic_armor',
        name: 'Чертеж: Гидравлический доспех',
        type: 'material',
        grade: 'C',
        description: 'Секретная схема экзоскелета Регуляторов.',
        icon: 'assets/inventar/icons/scroll.webp',
        price: 50000,
        stackable: true,
        maxStack: 10
    },
    DRILL_WORM_CORE: {
        id: 'drill_worm_core',
        name: 'Ядро Босса-Бура',
        type: 'material',
        grade: 'B',
        description: 'Пульсирующее ядро механизма, вырвавшегося из-под земли.',
        icon: 'assets/inventar/icons/drill_worm_core.webp',
        price: 100000,
        stackable: true,
        maxStack: 10
    }
};

/**
 * Лестницы корпусов приборов. ИСТОЧНИК ИСТИНЫ — shared/item-db.js: сервер
 * считает по ним статы (gearFromEquip) и стоимость прокачки, поэтому вторая
 * копия в клиенте гарантированно разъехалась бы с балансом.
 * Локальный фолбэк оставлен только на случай, если item-db не загрузился.
 */
const RESONATOR_SHELL_LADDER = (window.ITEM_DB && window.ITEM_DB.RESONATOR_SHELL_LADDER) || [
    { id: 'ng1', grade: 'NO_GRADE', label: 'NG I', playerLevel: 1, cDef: 15, hpBonus: 0, energyBonus: 0, materials: {} }
];

function getResonatorShell(index) {
    if (window.ITEM_DB && window.ITEM_DB.resonatorShell) return window.ITEM_DB.resonatorShell(index);
    const i = Math.max(0, Math.min(RESONATOR_SHELL_LADDER.length - 1, index | 0));
    return RESONATOR_SHELL_LADDER[i];
}

const NANO_CASING_LADDER = (window.ITEM_DB && window.ITEM_DB.NANO_CASING_LADDER) || [
    { id: 'ng1', grade: 'NO_GRADE', label: 'NG I', playerLevel: 1, cDef: 8, hpBonus: 10, energyBonus: 15, materials: {} }
];

function getNanoCasing(index) {
    if (window.ITEM_DB && window.ITEM_DB.nanoCasing) return window.ITEM_DB.nanoCasing(index);
    const i = Math.max(0, Math.min(NANO_CASING_LADDER.length - 1, index | 0));
    return NANO_CASING_LADDER[i];
}

// ============================================
// КЛАСС ПРЕДМЕТА (экземпляр)
// ============================================
class ItemInstance {
    constructor(templateId, count = 1) {
        this.uid = this.generateUID();
        this.templateId = templateId;
        this.template = ITEM_DATABASE[templateId];
        this.count = count;
        this.enchantLevel = 0;
        this.isEquipped = false;
        // Резонатор / Нагнетатель: две линии — контур/клапан (скиллы) и корпус (прочность/HP)
        if (this.template && (this.template.isResonator || this.template.isCircuitDevice || this.template.isCompressor || this.template.isOperatorDevice || this.template.id === 'operator_compressor_low')) {
            this.circuitLevel = this.template.circuitLevel || this.template.valveLevel || 1;
            this.shellIndex = this.template.shellIndex != null ? this.template.shellIndex : 0;
            // legacy migrate
            if (this.resonatorLevel != null && this.circuitLevel == null) {
                this.circuitLevel = this.resonatorLevel;
            }
            if (this.valveLevel != null && this.circuitLevel == null) {
                this.circuitLevel = this.valveLevel;
            }
        }
        // Нано-браслеты / Наручи: нано-сеть/компенсаторы (heal/drain/buff/skills) + оболочка (пар/HP)
        if (this.template && (this.template.isNanoBracelet || this.template.isBraceletDevice || this.template.isBracers || this.template.isOperatorBracers || this.template.id === 'operator_bracers_low')) {
            this.nanoLevel = this.template.nanoLevel || this.template.wristLevel || 1;
            this.casingIndex = this.template.casingIndex != null ? this.template.casingIndex : 0;
            if (this.wristLevel != null && this.nanoLevel == null) {
                this.nanoLevel = this.wristLevel;
            }
        }
        
        if (!this.template) {
            console.error(`[Inventory] Неизвестный предмет: ${templateId}`);
        }
    }
    
    generateUID() {
        return 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    get name() {
        if (!this.template) return this.templateId || '?';
        let name = this.template.name;
        if (this.enchantLevel > 0 && !this._isResonator() && !this._isNanoBracelet()) {
            name = `+${this.enchantLevel} ${name}`;
        }
        return name;
    }

    _isResonator() {
        return !!(this.template && (this.template.isResonator || this.template.isCircuitDevice || this.template.isCompressor || this.template.isOperatorDevice || this.template.id === 'operator_compressor_low'));
    }

    _isNanoBracelet() {
        return !!(this.template && (this.template.isNanoBracelet || this.template.isBraceletDevice || this.template.isBracers || this.template.isOperatorBracers || this.template.id === 'operator_bracers_low'));
    }

    getValveLevel() {
        return this.getCircuitLevel();
    }

    getWristLevel() {
        return this.getNanoLevel();
    }

    upgradeValve() {
        return this.upgradeCircuit();
    }

    upgradeWrist() {
        return this.upgradeNano();
    }

    /** Линия A: контур — только открытие атакующих скиллов (1..max). */
    getCircuitLevel() {
        if (!this._isResonator()) return 0;
        const max = this.template.circuitMaxLevel || 10;
        let lv = this.circuitLevel != null ? this.circuitLevel
            : (this.resonatorLevel != null ? this.resonatorLevel : 1);
        return Math.max(1, Math.min(max, lv | 0));
    }

    /** @deprecated alias → getCircuitLevel */
    getResonatorLevel() {
        return this.getCircuitLevel();
    }

    getShellIndex() {
        if (!this._isResonator()) return 0;
        const max = RESONATOR_SHELL_LADDER.length - 1;
        let i = this.shellIndex != null ? this.shellIndex : 0;
        return Math.max(0, Math.min(max, i | 0));
    }

    getShell() {
        return getResonatorShell(this.getShellIndex());
    }

    /** Статы только от корпуса, не от контура. */
    getShellStats() {
        if (!this._isResonator()) return { cDef: 0, hpBonus: 0, energyBonus: 0, grade: 'NO_GRADE', label: '' };
        const s = this.getShell();
        return {
            cDef: s.cDef || 0,
            hpBonus: s.hpBonus || 0,
            energyBonus: s.energyBonus || 0,
            grade: s.grade || 'NO_GRADE',
            label: s.label || ''
        };
    }

    /** Нано-сеть — heal / drain / buff (1..max). */
    getNanoLevel() {
        if (!this._isNanoBracelet()) return 0;
        const max = this.template.nanoMaxLevel || 10;
        let lv = this.nanoLevel != null ? this.nanoLevel : 1;
        return Math.max(1, Math.min(max, lv | 0));
    }

    getCasingIndex() {
        if (!this._isNanoBracelet()) return 0;
        const max = NANO_CASING_LADDER.length - 1;
        let i = this.casingIndex != null ? this.casingIndex : 0;
        return Math.max(0, Math.min(max, i | 0));
    }

    getCasing() {
        return getNanoCasing(this.getCasingIndex());
    }

    getCasingStats() {
        if (!this._isNanoBracelet()) return { cDef: 0, hpBonus: 0, energyBonus: 0, grade: 'NO_GRADE', label: '' };
        const s = this.getCasing();
        return {
            cDef: s.cDef || 0,
            hpBonus: s.hpBonus || 0,
            energyBonus: s.energyBonus || 0,
            grade: s.grade || 'NO_GRADE',
            label: s.label || ''
        };
    }

    /**
     * Прокачка приборов. Раньше SP/материалы списывались ЛОКАЛЬНО, а уровень
     * уезжал на сервер полем пакета equip — сервер принимал любое значение,
     * и circuitLevel: 99 обходил гейт скиллов целиком.
     * Теперь это запрос: проверка и списание на сервере, ответ приходит
     * пакетом device_ok / device_fail (см. net-ws.js).
     * @param {string} track - circuit | shell | nano | casing
     */
    requestDeviceUpgrade(track) {
        const net = (typeof window !== 'undefined' && window.game) ? window.game.net : null;
        if (!net || typeof net.intentDeviceUpgrade !== 'function') {
            return { ok: false, err: 'offline', track: track };
        }
        net.intentDeviceUpgrade(track);
        return { ok: false, pending: true, track: track };
    }

    /** Линия A — контур резонатора (SP): гейт скиллов, статов не даёт. */
    upgradeCircuit() {
        if (!this._isResonator()) return { ok: false, err: 'not_resonator', track: 'circuit' };
        return this.requestDeviceUpgrade('circuit');
    }

    /** Линия B — корпус резонатора (материалы + уровень): cDef / HP / пар. */
    upgradeShell() {
        if (!this._isResonator()) return { ok: false, err: 'not_resonator', track: 'shell' };
        return this.requestDeviceUpgrade('shell');
    }

    /** Нано-сеть браслетов (SP) — открывает heal / drain / buff. */
    upgradeNano() {
        if (!this._isNanoBracelet()) return { ok: false, err: 'not_bracelet', track: 'nano' };
        return this.requestDeviceUpgrade('nano');
    }

    /** Оболочка браслетов (материалы + уровень) — пар / HP. */
    upgradeCasing() {
        if (!this._isNanoBracelet()) return { ok: false, err: 'not_bracelet', track: 'casing' };
        return this.requestDeviceUpgrade('casing');
    }

    /** @deprecated → upgradeCircuit */
    upgradeResonator(opts) {
        return this.upgradeCircuit(opts);
    }
    
    get grade() {
        if (this._isResonator()) {
            const g = this.getShellStats().grade;
            return ITEM_GRADES[g] || ITEM_GRADES.NO_GRADE;
        }
        if (this._isNanoBracelet()) {
            const g = this.getCasingStats().grade;
            return ITEM_GRADES[g] || ITEM_GRADES.NO_GRADE;
        }
        if (!this.template) return ITEM_GRADES.NO_GRADE;
        const key = typeof normalizeItemGrade === 'function'
            ? normalizeItemGrade(this.template.grade)
            : this.template.grade;
        return ITEM_GRADES[key] || ITEM_GRADES.NO_GRADE;
    }
    
    /** Прибавка заточки — из shared (тот же расчёт, что у сервера). */
    _enchantBonus(isWeapon) {
        const DB = window.ITEM_DB;
        if (DB && typeof DB.enchantBonus === 'function') {
            return DB.enchantBonus(this.template && this.template.grade, this.enchantLevel, isWeapon);
        }
        return 0;
    }

    get attack() {
        if (this._isResonator() || this._isNanoBracelet()) return 0;
        // Заточка — плоская прибавка по грейду (item-db ENCHANT_STEP), а не
        // множитель: у сервера свой расчёт, и они расходились.
        return (this.template.attack || 0) + this._enchantBonus(true);
    }

    /** Схемная атака — резонатор НЕ даёт cAtk (только корпус: cDef/HP). */
    get cAtk() {
        if (this._isResonator() || this._isNanoBracelet()) return 0;
        const base = this.template.cAtk || 0;
        if (!base) return 0;
        return base + this._enchantBonus(true);
    }

    get defense() {
        if (this._isResonator() || this._isNanoBracelet()) return 0;
        return (this.template.defense || 0) + this._enchantBonus(false);
    }

    get cDef() {
        if (this._isResonator()) return this.getShellStats().cDef;
        if (this._isNanoBracelet()) return this.getCasingStats().cDef;
        return (this.template.cDef || this.template.mDef || 0) + this._enchantBonus(false);
    }
    
    get hpBonus() {
        if (this._isResonator()) return this.getShellStats().hpBonus;
        if (this._isNanoBracelet()) return this.getCasingStats().hpBonus;
        // Заточка HP/пар не даёт: сервер её не начисляет (item-db учитывает
        // только атаку и защиту), а расхождение показывало бы неверный maxHp.
        return this.template.hpBonus || 0;
    }

    get energyBonus() {
        if (this._isResonator()) return this.getShellStats().energyBonus;
        if (this._isNanoBracelet()) return this.getCasingStats().energyBonus;
        return this.template.energyBonus || 0;
    }

    get speedBonus() {
        return this.template.speedBonus || 0;
    }

    get attackBonus() {
        // Прибавка заточки уже учтена в геттере attack — здесь только шаблон,
        // иначе бонус считался бы дважды (gearFromEquip складывает оба поля).
        return this.template.attackBonus || 0;
    }
    
    get critBonus() {
        return this.template.critBonus || 0;
    }
    
    get blockRate() {
        return this.template.blockRate || 0;
    }
    
    get isStackable() {
        return this.template.stackable || false;
    }
    
    get maxStack() {
        return this.template.maxStack || 1;
    }
    
    get icon() {
        return this.template.icon || '❓';
    }
    
    get description() {
        return this.template.description || '';
    }
    
    get price() {
        return this.template.price || 0;
    }
    
    canStackWith(other) {
        return this.isStackable && 
               other.templateId === this.templateId && 
               this.count < this.maxStack;
    }
}

// ============================================
// ИНВЕНТАРЬ
// ============================================
class Inventory {
    constructor(maxSlots = 80) {
        this.slots = new Array(maxSlots).fill(null);
        this.maxSlots = maxSlots;
        this.currency = 0; // Медные детали
        this.weight = 0;
        this.maxWeight = 10000;
        
        // Экипировка
        this.equipment = {};
        Object.values(EQUIP_SLOTS).forEach(slot => {
            this.equipment[slot] = null;
        });
        // Снести legacy ring slots из paperdoll
        LEGACY_RING_SLOTS.forEach((s) => {
            if (this.equipment[s] !== undefined) delete this.equipment[s];
        });
    }

    /**
     * Кольца → один слот браслетов. Старые ring_l/ring_r снимаются в сумку.
     */
    migrateRingSlotsToBracelet() {
        const rings = [];
        LEGACY_RING_SLOTS.forEach((s) => {
            if (this.equipment[s]) {
                rings.push(this.equipment[s]);
                this.equipment[s] = null;
                delete this.equipment[s];
            }
        });
        rings.forEach((it) => {
            if (!it) return;
            it.isEquipped = false;
            const empty = this.slots.indexOf(null);
            if (empty >= 0) this.slots[empty] = it;
            else if (typeof this.addSingleItem === 'function') {
                // last resort: drop into currency-less void log
                console.warn('[Inventory] ring migrate: bag full, item lost?', it.templateId);
            }
        });
        if (!this.equipment[EQUIP_SLOTS.BRACELET]) {
            this.equipment[EQUIP_SLOTS.BRACELET] = null;
        }
    }
    
    // === БАЗОВЫЕ ОПЕРАЦИИ ===
    
    addItem(templateId, count = 1) {
        let template = ITEM_DATABASE[templateId];
        if (!template && typeof ensureItemTemplate === 'function') {
            template = ensureItemTemplate(templateId);
        }
        if (!template) {
            console.error(`[Inventory] Предмет не найден: ${templateId}`);
            return false;
        }
        
        // Валюта
        if (templateId === 'copper_parts') {
            this.currency += count;
            return true;
        }
        
        // Стекающиеся предметы
        if (template.stackable) {
            return this.addStackable(templateId, count);
        }
        
        // Обычные предметы
        for (let i = 0; i < count; i++) {
            if (!this.addSingleItem(templateId)) {
                return false;
            }
        }
        return true;
    }
    
    addStackable(templateId, count) {
        // Ищем существующий стек
        for (let i = 0; i < this.maxSlots; i++) {
            const item = this.slots[i];
            if (item && item.templateId === templateId && item.count < item.maxStack) {
                const canAdd = Math.min(count, item.maxStack - item.count);
                item.count += canAdd;
                count -= canAdd;
                if (count <= 0) return true;
            }
        }
        
        // Создаём новые стеки
        while (count > 0) {
            const emptySlot = this.slots.indexOf(null);
            if (emptySlot === -1) {
                game.addChatMessage('Инвентарь полон!', 'system');
                return false;
            }
            
            const stackSize = Math.min(count, ITEM_DATABASE[templateId].maxStack);
            this.slots[emptySlot] = new ItemInstance(templateId, stackSize);
            count -= stackSize;
        }
        
        return true;
    }
    
    addSingleItem(templateId) {
        const emptySlot = this.slots.indexOf(null);
        if (emptySlot === -1) {
            game.addChatMessage('Инвентарь полон!', 'system');
            return false;
        }
        
        this.slots[emptySlot] = new ItemInstance(templateId, 1);
        return true;
    }
    
    removeItem(templateId, count = 1) {
        let remaining = count;
        
        for (let i = 0; i < this.maxSlots; i++) {
            const item = this.slots[i];
            if (item && item.templateId === templateId) {
                if (item.count <= remaining) {
                    remaining -= item.count;
                    this.slots[i] = null;
                } else {
                    item.count -= remaining;
                    remaining = 0;
                }
                
                if (remaining <= 0) return true;
            }
        }
        
        return remaining <= 0;
    }
    
    removeItemByUID(uid) {
        for (let i = 0; i < this.maxSlots; i++) {
            if (this.slots[i] && this.slots[i].uid === uid) {
                this.slots[i] = null;
                return true;
            }
        }
        return false;
    }
    
    getItemCount(templateId) {
        let count = 0;
        for (const item of this.slots) {
            if (item && item.templateId === templateId) {
                count += item.count;
            }
        }
        return count;
    }
    
    hasItem(templateId, count = 1) {
        return this.getItemCount(templateId) >= count;
    }
    
    spendCurrency(amount) {
        if (this.currency >= amount) {
            this.currency -= amount;
            return true;
        }
        return false;
    }
    
    // === ЭКИПИРОВКА ===
    
    equipItem(itemUID, opts) {
        opts = opts || {};
        const silent = !!opts.silent; // server-driven apply — no net echo
        // Находим предмет в инвентаре
        let item = null;
        let slotIndex = -1;
        
        for (let i = 0; i < this.maxSlots; i++) {
            if (this.slots[i] && this.slots[i].uid === itemUID) {
                item = this.slots[i];
                slotIndex = i;
                break;
            }
        }
        
        if (!item) {
            console.error('[Inventory] Предмет не найден для экипировки');
            return false;
        }
        
        // Проверяем, можно ли экипировать
        if (!item.template) {
            console.error('[Inventory] Нет шаблона у предмета', item.templateId);
            return false;
        }
        if (item.template.type === 'consumable' || item.template.type === 'material' ||
            item.template.type === 'crystal' || item.template.type === 'recipe' ||
            item.template.type === 'enchant' || item.template.type === 'quest') {
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage('Этот предмет нельзя экипировать.', 'system');
            }
            return false;
        }
        
        // Проверяем требования уровня
        const playerLevel = (game && game.player && game.player.level) || 1;
        const gradeInfo = item.grade || ITEM_GRADES.NO_GRADE;
        if (gradeInfo && playerLevel < (gradeInfo.levelReq || 1)) {
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage(
                    `Требуется уровень ${gradeInfo.levelReq} для ${gradeInfo.name}`,
                    'system'
                );
            }
            return false;
        }
        
        let targetSlot = item.template.slot;
        // Резонатор / Нагнетатель всегда necklace (даже если старый сейв/клиент думал weapon)
        if (item.template.isResonator || item.template.isCircuitDevice || item.template.isCompressor || item.template.isOperatorDevice ||
            item.templateId === 'engineer_emitter_low' || item.templateId === 'operator_compressor_low') {
            targetSlot = EQUIP_SLOTS.NECKLACE;
        }
        // Нано-браслеты / Наручи — единый слот (вместо ring_l / ring_r)
        if (item.template.isNanoBracelet || item.template.isBraceletDevice || item.template.isBracers || item.template.isOperatorBracers ||
            item.templateId === 'engineer_nano_bracelet' || item.templateId === 'operator_bracers_low') {
            targetSlot = EQUIP_SLOTS.BRACELET;
        }
        // Legacy ring slots collapsed
        if (targetSlot === 'ring_l' || targetSlot === 'ring_r' || targetSlot === 'ring') {
            targetSlot = EQUIP_SLOTS.BRACELET;
        }
        if (!targetSlot) {
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage('У предмета нет слота экипировки.', 'system');
            }
            return false;
        }
        const tpl = item.template;
        const isTwoHanded = !!(tpl.twoHanded ||
            tpl.weaponClass === '2h_staff' ||
            tpl.weaponClass === '2h_blunt' ||
            tpl.weaponClass === '2h_sword');

        // Щит нельзя надеть при двуручном оружии
        if (targetSlot === EQUIP_SLOTS.SHIELD || tpl.isShield) {
            const w = this.equipment[EQUIP_SLOTS.WEAPON];
            const wt = w && (w.template || w);
            const w2h = !!(wt && (wt.twoHanded ||
                wt.weaponClass === '2h_staff' ||
                wt.weaponClass === '2h_blunt' ||
                wt.weaponClass === '2h_sword'));
            if (w2h) {
                if (!silent && game && game.addChatMessage) {
                    game.addChatMessage('Двуручное оружие — щит недоступен.', 'system');
                }
                return false;
            }
        }
        
        // Снимаем текущий предмет
        const currentEquipped = this.equipment[targetSlot];
        if (currentEquipped) {
            this.unequipItem(targetSlot, { silent: true });
        }

        // 2H оружие снимает щит
        if (targetSlot === EQUIP_SLOTS.WEAPON && isTwoHanded && this.equipment[EQUIP_SLOTS.SHIELD]) {
            this.unequipItem(EQUIP_SLOTS.SHIELD, { silent: true });
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage('Щит снят: оружие двуручное.', 'system');
            }
        }

        // fullBody роба (Авадон) занимает chest — снимаем legs
        if (targetSlot === EQUIP_SLOTS.CHEST && tpl.fullBody && this.equipment[EQUIP_SLOTS.LEGS]) {
            this.unequipItem(EQUIP_SLOTS.LEGS, { silent: true });
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage('Штаны сняты: цельная роба.', 'system');
            }
        }
        // Штаны нельзя надеть поверх fullBody
        if (targetSlot === EQUIP_SLOTS.LEGS) {
            const ch = this.equipment[EQUIP_SLOTS.CHEST];
            const ct = ch && (ch.template || ch);
            if (ct && ct.fullBody) {
                if (!silent && game && game.addChatMessage) {
                    game.addChatMessage('Надета цельная роба — штаны не нужны.', 'system');
                }
                return false;
            }
        }
        
        // Экипируем
        this.slots[slotIndex] = null;
        item.isEquipped = true;
        this.equipment[targetSlot] = item;
        
        if (!silent && game && game.addChatMessage) {
            game.addChatMessage(`Экипировано: ${item.name}`, 'loot');
        }
        this.recalculateStats();

        // 3D gear visual (weapon hand / resonator necklace)
        if ((targetSlot === EQUIP_SLOTS.WEAPON || targetSlot === EQUIP_SLOTS.NECKLACE) &&
            game && game.player && typeof game.player.syncWeaponVisual === 'function') {
            game.player.syncWeaponVisual();
        }

        // Обновление титула над головой при экипировке в слот title
        if (targetSlot === EQUIP_SLOTS.TITLE) {
            const titleText = tpl.titleText || tpl.name || '';
            const titleColor = tpl.titleColor || null;
            if (game && game.player) {
                game.player.cosmetics = game.player.cosmetics || {};
                game.player.cosmetics.titleName = titleText;
                if (titleColor) game.player.cosmetics.titleColor = titleColor;
                if (typeof game.player.refreshNameplate === 'function') {
                    game.player.refreshNameplate();
                }
            }
        }

        // Авторитет сервера: подтверждаем экип. Уровни приборов НЕ отправляем —
        // сервер держит их сам (p.devices) и вернёт в equip_ok.
        if (!silent && window.game && window.game.net) {
            const tid = item.templateId || (item.template && item.template.id);
            window.game.net.intentEquip(targetSlot, tid, item.enchantLevel || 0);
        }
        
        return true;
    }

    
    unequipItem(slot, opts) {
        opts = opts || {};
        const silent = !!opts.silent;
        const item = this.equipment[slot];
        if (!item) return false;
        
        // Ищем свободный слот
        const emptySlot = this.slots.indexOf(null);
        if (emptySlot === -1) {
            if (!silent && game && game.addChatMessage) {
                game.addChatMessage('Нет места в инвентаре!', 'system');
            }
            return false;
        }
        
        item.isEquipped = false;
        this.slots[emptySlot] = item;
        this.equipment[slot] = null;
        
        if (!silent && game && game.addChatMessage) {
            game.addChatMessage(`Снято: ${item.name}`, 'system');
        }
        this.recalculateStats();

        // 3D gear off
        if ((slot === EQUIP_SLOTS.WEAPON || slot === EQUIP_SLOTS.NECKLACE) &&
            game && game.player && typeof game.player.syncWeaponVisual === 'function') {
            game.player.syncWeaponVisual();
        }

        // Снятие титула над головой при снятии из слота title
        if (slot === EQUIP_SLOTS.TITLE) {
            if (game && game.player) {
                game.player.cosmetics = game.player.cosmetics || {};
                game.player.cosmetics.titleName = null;
                if (typeof game.player.refreshNameplate === 'function') {
                    game.player.refreshNameplate();
                }
            }
        }

        if (!silent && window.game && window.game.net) {
            window.game.net.intentUnequip(slot);
        }
        
        return true;
    }
    
    /**
     * Пересчёт статов после экипировки.
     * НЕ затирает классовые/primary статы — только передаёт gear в pullL2Stats.
     * (Раньше здесь стояли hardcoded 10+level*3, что ломало всю систему L2.)
     */
    recalculateStats() {
        this.applyGearToPlayer();
    }

    /** Применить gear-бонусы поверх PRIMARY→combat (CLASS_SYSTEM). */
    applyGearToPlayer() {
        const player = (typeof game !== 'undefined' && game.player) ? game.player
            : (typeof window !== 'undefined' && window.game && window.game.player) ? window.game.player
            : null;
        if (!player) return;

        // Пассивки актуальны до pull
        if (player.skillManager && typeof player.skillManager.recalculatePassives === 'function') {
            player.skillManager.recalculatePassives();
        }
        if (typeof player.pullL2Stats === 'function') {
            player.pullL2Stats();
        } else {
            // минимальный fallback: суммируем atk/def с текущего
            let bonusAttack = 0, bonusDefense = 0, bonusCDef = 0, bonusHp = 0, bonusEnergy = 0;
            Object.values(this.equipment).forEach(item => {
                if (!item) return;
                const tpl = item.template || item;
                const isJewelry = (tpl.type === 'accessory' || item.type === 'accessory') && !tpl.isResonator && !tpl.isCircuitDevice && !tpl.isNanoBracelet;
                bonusAttack += (item.attack || 0) + (item.attackBonus || 0);
                if (isJewelry) {
                    bonusCDef += (item.cDef != null ? item.cDef : (tpl.cDef != null ? tpl.cDef : (item.defense || tpl.defense || 0)));
                } else {
                    bonusDefense += item.defense || 0;
                    bonusCDef += item.cDef || tpl.cDef || 0;
                }
                bonusHp += item.hpBonus || 0;
                bonusEnergy += item.energyBonus || 0;
            });
            player.attackPower = (player.baseAttackPower || player.pAtk || 10) + bonusAttack;
            player.defense = (player.baseDefense || player.pDef || 2) + bonusDefense;
            player.pAtk = player.attackPower;
            player.pDef = player.defense;
            if (player.cDef != null) {
                player.cDef = (player.baseCDef || 5) + bonusCDef;
                player.mDef = player.cDef;
            }
            player.maxHp = (player.maxHp || 100) + bonusHp;
            player.maxEnergy = (player.maxEnergy || 50) + bonusEnergy;
        }

        player.hp = Math.min(player.hp, player.maxHp);
        player.energy = Math.min(player.energy, player.maxEnergy);
    }
    
    // === ЗАТОЧКА (ENCHANT) ===
    
    /**
     * Заточка. Раньше здесь была ПОЛНОСТЬЮ локальная реализация: своя
     * таблица шансов (100/90/80/60/50 против серверной ENCHANT_RATE),
     * локальный расход усилителя и локальный item.enchantLevel++. Сервер об
     * этом не знал, а intentEnchant не вызывался ниоткуда — заточка
     * откатывалась первой же синхронизацией сумки.
     * Теперь это запрос: авторитет шанса, расхода и результата на сервере
     * (ответ: enchant_ok / enchant_fail / enchant_break).
     */
    enchantItem(itemUID) {
        const item = this.findItemByUID ? this.findItemByUID(itemUID) : null;
        if (!item) {
            if (window.game) window.game.addChatMessage('Предмет не найден.', 'system');
            return false;
        }
        if (!item.isEquipped) {
            // Сервер точит по СЛОТУ экипировки: p.equip[slot].plus.
            if (window.game) window.game.addChatMessage('Сначала наденьте предмет.', 'system');
            return false;
        }
        const slot = Object.keys(this.equipment || {}).find((k) => this.equipment[k] === item);
        if (!slot) {
            if (window.game) window.game.addChatMessage('Предмет не в слоте экипировки.', 'system');
            return false;
        }
        const net = window.game && window.game.net;
        if (!net || typeof net.intentEnchant !== 'function') {
            if (window.game) window.game.addChatMessage('Нет связи с сервером.', 'system');
            return false;
        }
        net.intentEnchant(slot);
        return true;
    }

    /** Найти предмет по uid в сумке или экипировке. */
    findItemByUID(itemUID) {
        for (let i = 0; i < this.maxSlots; i++) {
            if (this.slots[i] && this.slots[i].uid === itemUID) return this.slots[i];
        }
        const eq = this.equipment || {};
        const keys = Object.keys(eq);
        for (let i = 0; i < keys.length; i++) {
            if (eq[keys[i]] && eq[keys[i]].uid === itemUID) return eq[keys[i]];
        }
        return null;
    }

    /** Шанс успеха заточки — из shared (тот же расчёт, что у сервера). */
    getEnchantSuccessRate(currentLevel) {
        const G = window.GAME_RULES || window.G;
        if (G && typeof G.enchantSuccess === 'function') {
            return Math.round(G.enchantSuccess(currentLevel | 0) * 100);
        }
        return 0;
    }

    // === ИСПОЛЬЗОВАНИЕ ПРЕДМЕТОВ И БЫСТРЫЙ ЮЗ (HOTBAR) ===

    findItemByTemplate(templateId) {
        if (!templateId) return null;
        const tid = String(templateId).toLowerCase();
        for (let i = 0; i < this.maxSlots; i++) {
            const it = this.slots[i];
            if (it && it.count > 0) {
                const curId = String(it.templateId || (it.template && it.template.id) || '').toLowerCase();
                if (curId === tid) return it;
            }
        }
        return null;
    }

    getItemCount(templateId) {
        if (!templateId) return 0;
        const tid = String(templateId).toLowerCase();
        let total = 0;
        for (let i = 0; i < this.maxSlots; i++) {
            const it = this.slots[i];
            if (it) {
                const curId = String(it.templateId || (it.template && it.template.id) || '').toLowerCase();
                if (curId === tid) total += (it.count || 0);
            }
        }
        return total;
    }

    useItemByTemplate(templateId) {
        const it = this.findItemByTemplate(templateId);
        if (!it) {
            if (typeof window !== 'undefined' && window.game && window.game.addChatMessage) {
                window.game.addChatMessage('Предмет закончился в инвентаре', 'system');
            }
            return false;
        }
        const ttype = (it.template && it.template.type) || it.type;
        if (ttype === 'weapon' || ttype === 'armor' || ttype === 'accessory' || ttype === 'title' || ttype === 'costume') {
            return this.equipItem(it.uid);
        }
        return this.useItem(it.uid);
    }
    
    useItem(itemUID) {
        let item = null;
        let slotIndex = -1;

        for (let i = 0; i < this.maxSlots; i++) {
            if (this.slots[i] && String(this.slots[i].uid) === String(itemUID)) {
                item = this.slots[i];
                slotIndex = i;
                break;
            }
        }

        if (!item) {
            item = this.findItemByTemplate(itemUID);
            if (item) {
                slotIndex = this.slots.indexOf(item);
            }
        }

        if (!item) return false;

        const template = item.template;
        if (!template) return false;

        // Расходники — при онлайне авторитет сервера (иначе reward/vitals откатывают)
        if (template.type === 'consumable') {
            const tid = item.templateId || template.id;
            const net = (typeof window !== 'undefined' && window.game && window.game.net)
                ? window.game.net : null;
            const online = !!(net && net.status === 'online' && typeof net.intentUse === 'function');

            if (online) {
                // Только запрос; use_ok → applyInv + hp/energy. Без локального «фейка».
                net.intentUse(tid);
                return true;
            }

            // Оффлайн / без net — локально
            const COSDB = window.COSMETICS_DB;
            const cosEff = COSDB && COSDB.ITEM_EFFECTS && COSDB.ITEM_EFFECTS[tid];
            if (cosEff && game.player) {
                const applied = COSDB.applyItemEffect(game.player.cosmeticsFull || game.player.cosmetics, cosEff);
                game.player.cosmeticsFull = applied.cosmetics;
                if (typeof game.player.applyCosmetics === 'function') {
                    game.player.applyCosmetics(Object.assign({}, applied.cosmetics, {
                        title: applied.cosmetics.title,
                        nameColor: applied.cosmetics.nameColor,
                        aura: applied.cosmetics.aura
                    }));
                }
                if (applied.grantSkill && game.player.skillManager) {
                    game.player.skillManager.learnSkill(applied.grantSkill, false, true);
                }
                game.addChatMessage('✦ Внешка: ' + (applied.msg || item.name), 'loot');
                item.count--;
                if (item.count <= 0) this.slots[slotIndex] = null;
                return true;
            }
            if (template.healHp) {
                game.player.hp = Math.min(game.player.maxHp, game.player.hp + template.healHp);
                game.addChatMessage(`Использовано: ${item.name} (+${template.healHp} HP)`, 'loot');
            }
            if (template.healEnergy) {
                game.player.energy = Math.min(
                    game.player.maxEnergy,
                    game.player.energy + template.healEnergy
                );
                game.addChatMessage(
                    `Использовано: ${item.name} (+${template.healEnergy} Energy)`,
                    'loot'
                );
            }
            if (template.damageBoost) {
                game.player.tempDamageBoost = template.damageBoost;
                game.player.tempBoostTimer = template.duration;
                game.addChatMessage(
                    `${item.name}: урон +${(template.damageBoost - 1) * 100}% на ${template.duration}с`,
                    'system'
                );
            }
            item.count--;
            if (item.count <= 0) this.slots[slotIndex] = null;
            return true;
        }

        // Экипировка
        if (template.type === 'weapon' || template.type === 'armor' || template.type === 'accessory' ||
            template.type === 'title' || template.type === 'costume' ||
            template.slot === 'title' || template.slot === 'costume') {
            return this.equipItem(itemUID);
        }

        return false;
    }
    
    // === СОХРАНЕНИЕ / ЗАГРУЗКА ===
    
    serialize() {
        return {
            currency: this.currency,
            slots: this.slots.map(item => {
                if (!item) return null;
                return {
                    templateId: item.templateId,
                    count: item.count,
                    enchantLevel: item.enchantLevel
                };
            }),
            equipment: Object.fromEntries(
                Object.entries(this.equipment).map(([slot, item]) => {
                    if (!item) return [slot, null];
                    return [slot, {
                        templateId: item.templateId,
                        count: item.count,
                        enchantLevel: item.enchantLevel
                    }];
                })
            )
        };
    }
    
    deserialize(data) {
        this.currency = data.currency || 0;
        
        this.slots = data.slots.map(itemData => {
            if (!itemData) return null;
            const item = new ItemInstance(itemData.templateId, itemData.count);
            item.enchantLevel = itemData.enchantLevel || 0;
            return item;
        });
        
        Object.entries(data.equipment || {}).forEach(([slot, itemData]) => {
            if (!itemData) {
                this.equipment[slot] = null;
            } else {
                const item = new ItemInstance(itemData.templateId, itemData.count);
                item.enchantLevel = itemData.enchantLevel || 0;
                item.isEquipped = true;
                this.equipment[slot] = item;
            }
        });
        
        this.recalculateStats();
    }
}

// Индекс по id (lookup 'operator_hammer_low' и 'OPERATOR_HAMMER_LOW')
(function indexItemsById() {
    Object.keys(ITEM_DATABASE).forEach(function (key) {
        var it = ITEM_DATABASE[key];
        if (it && it.id && !ITEM_DATABASE[it.id]) {
            ITEM_DATABASE[it.id] = it;
        }
    });
})();

/** Нормализация grade из loot-rules ('no_grade'/'d') → ITEM_GRADES keys. */
function normalizeItemGrade(g) {
    if (!g) return 'NO_GRADE';
    const s = String(g).toUpperCase().replace(/-/g, '_');
    if (s === 'NO_GRADE' || s === 'NOGRADE') return 'NO_GRADE';
    if (ITEM_GRADES[s]) return s;
    return 'NO_GRADE';
}

/**
 * Слить шаблон из LOOT_ITEMS / LOOT_RULES в ITEM_DATABASE.
 * Без этого addItem() молча дропает server loot (crystal_*, recipe_*, boiler_plate…).
 */
function mergeLootItemTemplate(src) {
    if (!src) return null;
    const id = src.id || src.templateId;
    if (!id) return null;
    if (ITEM_DATABASE[id]) return ITEM_DATABASE[id];

    const type = src.type || 'material';
    const stackable = src.stackable != null
        ? !!src.stackable
        : (type === 'material' || type === 'consumable' || type === 'crystal' ||
           type === 'recipe' || type === 'enchant' || type === 'ammo');

    const tpl = {
        id: id,
        name: src.name || id,
        type: type,
        slot: src.slot || null,
        grade: normalizeItemGrade(src.grade),
        description: src.description || '',
        icon: src.icon || '📦',
        price: src.price || 0,
        stackable: stackable,
        maxStack: src.maxStack || (stackable ? 9999 : 1),
        attack: src.attack || 0,
        attackBonus: src.attackBonus || 0,
        defense: src.defense || 0,
        cAtk: src.cAtk || src.mAtk || 0,
        cDef: src.cDef || src.mDef || 0,
        hpBonus: src.hpBonus || 0,
        energyBonus: src.energyBonus || 0,
        critBonus: src.critBonus || 0,
        blockRate: src.blockRate || 0,
        armorType: src.armorType || null,
        weaponClass: src.weaponClass || null,
        twoHanded: !!src.twoHanded,
        ranged: !!src.ranged,
        isShield: !!(src.isShield || src.slot === 'shield'),
        craftResult: src.craftResult || null,
        craftMaterials: src.craftMaterials || null
    };

    // ring / earring: кольца → браслет; серьги — L по умолчанию
    if (tpl.slot === 'ring' || tpl.slot === 'ring_l' || tpl.slot === 'ring_r') {
        tpl.slot = EQUIP_SLOTS.BRACELET;
    }
    if (tpl.slot === 'earring') tpl.slot = EQUIP_SLOTS.EARRING_L;

    ITEM_DATABASE[id] = tpl;
    return tpl;
}

function mergeAllLootTemplates() {
    if (typeof window !== 'undefined' && window.ITEM_DB && window.ITEM_DB.ITEMS) {
        Object.keys(window.ITEM_DB.ITEMS).forEach(function (id) {
            const low = String(id).toLowerCase();
            if (!ITEM_DATABASE[low]) {
                ITEM_DATABASE[low] = Object.assign({}, window.ITEM_DB.ITEMS[id]);
            }
        });
    }
    const loot = (typeof window !== 'undefined' && (
        window.LOOT_ITEMS ||
        (window.LOOT_RULES && window.LOOT_RULES.LOOT_ITEMS)
    )) || null;
    if (!loot) return 0;
    let n = 0;
    Object.keys(loot).forEach(function (id) {
        if (!ITEM_DATABASE[id]) {
            mergeLootItemTemplate(loot[id]);
            n++;
        }
    });
    return n;
}

/** Публичный helper: net-ws / reward / craft — гарантировать шаблон. */
function ensureItemTemplate(templateId) {
    if (!templateId) return null;
    templateId = String(templateId).toLowerCase();
    if (ITEM_DATABASE[templateId]) return ITEM_DATABASE[templateId];
    if (typeof window !== 'undefined' && window.ITEM_DB && typeof window.ITEM_DB.get === 'function') {
        const t = window.ITEM_DB.get(templateId);
        if (t) {
            ITEM_DATABASE[templateId] = Object.assign({}, t);
            return ITEM_DATABASE[templateId];
        }
    }
    const loot = (typeof window !== 'undefined' && (
        window.LOOT_ITEMS ||
        (window.LOOT_RULES && window.LOOT_RULES.LOOT_ITEMS)
    )) || null;
    if (loot && loot[templateId]) return mergeLootItemTemplate(loot[templateId]);
    // last resort — объект в инвентаре лучше «потерянного» лута
    ITEM_DATABASE[templateId] = {
        id: templateId,
        name: templateId,
        type: 'material',
        grade: 'NO_GRADE',
        stackable: true,
        maxStack: 9999,
        icon: '📦',
        description: 'Предмет с сервера (шаблон создан автоматически).'
    };
    return ITEM_DATABASE[templateId];
}

// Подтянуть LOOT_ITEMS если скрипт уже загружен; иначе boot вызовет merge после loot-rules
mergeAllLootTemplates();

// ============================================
// ЭКСПОРТ
// ============================================
window.Inventory = Inventory;
window.ItemInstance = ItemInstance;
window.ITEM_DATABASE = ITEM_DATABASE;
window.ITEM_GRADES = ITEM_GRADES;
window.EQUIP_SLOTS = EQUIP_SLOTS;
window.RESONATOR_SHELL_LADDER = RESONATOR_SHELL_LADDER;
window.NANO_CASING_LADDER = NANO_CASING_LADDER;
window.LEGACY_RING_SLOTS = LEGACY_RING_SLOTS;
window.isRobeArmorItem = isRobeArmorItem;
window.hasAnyRobeArmor = hasAnyRobeArmor;
window.hasRobeJacketAndPants = hasRobeJacketAndPants;
window.countNamedSetPieces = countNamedSetPieces;
window.getDevotionCastBonus = getDevotionCastBonus;
window.getActiveArmorSets = getActiveArmorSets;
window.ensureItemTemplate = ensureItemTemplate;
window.mergeAllLootTemplates = mergeAllLootTemplates;
window.mergeLootItemTemplate = mergeLootItemTemplate;
window.normalizeItemGrade = normalizeItemGrade;
