// ============================================
// PROJECT STEAM: ORIGINS - DUNGEON.JS
// Система данжей в классическом MMO стиле
// Open / Instanced party / Vertical / Raid
// Комнаты по Тоттену: Threshold, Circulation,
// Landmark, Refuge. Мини-боссы, ловушки,
// лут-сундуки, таймер, прогресс, лимиты.
// ============================================

// Координатный "карман" мира для инстансов
// (эмуляция отдельной копии в рамках одного клиента)
const INSTANCE_POCKET = new THREE.Vector3(2000, 0, 0);

// ============================================
// ТИПЫ ДАНЖЕЙ
// ============================================
const DUNGEON_TYPES = {
    OPEN: 'open',                 // Открытый (фарм, общий мир)
    INSTANCED_PARTY: 'instanced', // Инстанс на пати
    VERTICAL: 'vertical',         // Вертикальная башня (ярусы)
    RAID: 'raid'                  // Рейдовый инстанс
};

// ============================================
// ТИПЫ КОМНАТ (архитектура по Тоттену)
// ============================================
const ROOM_TYPES = {
    ENTRANCE: 'entrance',     // Threshold — вход/порог
    HALL: 'hall',             // Prospect — зал с обзором
    CIRCULATION: 'circulation', // Циркуляция — коридор/спуск
    BOSS: 'boss',             // Landmark — комната босса
    REFUGE: 'refuge',         // Refuge — укрытие/реген
    TRAP: 'trap',             // Коридор с ловушками
    NAMED: 'named'            // Комната мини-босса
};

// ============================================
// БАЗА ДАННЫХ ДАНЖЕЙ
// ============================================
const DUNGEON_DATABASE = {

    // ==========================================
    // ЗАБРОШЕННЫЙ ДОК №3 (OPEN, аналог Elven Ruins)
    // Уже размечен в MAP_REGIONS + MOB_SPOTS.
    // DungeonManager НЕ спавнит рядовых мобов
    // (это делают чанки по спотам) — только
    // named-мобов, сундуки, ловушки, ворота.
    // ==========================================
    dock_3: {
        id: 'dock_3',
        name: 'Заброшенный Док №3',
        type: DUNGEON_TYPES.OPEN,
        levelReq: 10,
        levelMax: 0,            // 0 = без верхнего порога
        description: 'Данж открытого типа. Остов Колосса в центре хранит Пресс-Молот.',
        regionId: 'dock_3',     // связь с MAP_REGIONS
        entrance: { x: -62, z: -10 },
        exitPoint: { x: 0, z: 0 }, // куда выкидывает при смерти/выходе
        expMult: 1.2,           // +20% EXP внутри
        dropMult: 1.3,
        // Комнаты (подзоны открытого данжа)
        rooms: [
            { id: 'd3_gate', type: ROOM_TYPES.ENTRANCE, bounds: [-70, -18, -54, -2],
              label: 'Заклинившие ворота (45°)' },
            { id: 'd3_hall', type: ROOM_TYPES.HALL, bounds: [-95, -30, -55, 10],
              label: 'Главный зал (обзор сверху)' },
            { id: 'd3_stair', type: ROOM_TYPES.CIRCULATION, bounds: [-125, -50, -95, -25],
              label: 'Винтовой спуск вокруг поршня' },
            { id: 'd3_center', type: ROOM_TYPES.BOSS, bounds: [-122, -22, -98, 2],
              label: 'Остов Колосса (РБ)' },
            { id: 'd3_refuge1', type: ROOM_TYPES.REFUGE, bounds: [-158, -58, -142, -42],
              label: 'Техническая ниша (реген)' },
            { id: 'd3_refuge2', type: ROOM_TYPES.REFUGE, bounds: [-158, 22, -142, 38],
              label: 'Техническая ниша (реген)' }
        ],
        // Мини-боссы (named mobs)
        namedMobs: [
            { id: 'd3_named_rustclaw', templateId: 'rustclaw_overseer',
              x: -85, z: -10, respawn: 300, room: 'd3_hall' },
            { id: 'd3_named_sparkweld', templateId: 'sparkweld_elite',
              x: -110, z: -38, respawn: 300, room: 'd3_stair' }
        ],
        traps: [
            { id: 'd3_trap_steam1', kind: 'steam_vent', x: -100, z: -38, radius: 3,
              interval: 6, telegraph: 1.5, damage: 25, room: 'd3_stair' }
        ],
        chests: [
            { id: 'd3_chest1', x: -150, z: -50, loot: 'dungeon_common', room: 'd3_refuge1' },
            { id: 'd3_chest2', x: -110, z: -10, loot: 'dungeon_rare', room: 'd3_center', bossGuarded: true }
        ],
        // Условие завершения (для прогресс-бара открытого данжа)
        completion: { namedKills: 2, bossKill: true }
    },

    // ==========================================
    // ШКОЛА ТЁМНОЙ ИНЖЕНЕРИИ (OPEN + quest)
    // аналог School of Dark Arts
    // ==========================================
    dark_engineering: {
        id: 'dark_engineering',
        name: 'Школа Тёмной Инженерии',
        type: DUNGEON_TYPES.OPEN,
        levelReq: 20,
        description: 'Заброшенный исследовательский корпус. Нужен допуск-чертёж.',
        regionId: 'directive_sector',
        entrance: { x: 72, z: 62 },
        exitPoint: { x: 0, z: 0 },
        expMult: 1.3,
        dropMult: 1.4,
        questReq: 'main_04_certification', // активный/сданный квест
        rooms: [
            { id: 'de_gate', type: ROOM_TYPES.ENTRANCE, bounds: [66, 56, 80, 70], label: 'Шлюз допуска' },
            { id: 'de_lab', type: ROOM_TYPES.HALL, bounds: [80, 60, 120, 100], label: 'Опытный цех' },
            { id: 'de_core', type: ROOM_TYPES.BOSS, bounds: [120, 90, 150, 130], label: 'Ядро Директивы (РБ)' }
        ],
        namedMobs: [
            { id: 'de_named_logic', templateId: 'logic_corruptor', x: 100, z: 80, respawn: 360, room: 'de_lab' }
        ],
        traps: [
            { id: 'de_trap_turret1', kind: 'turret', x: 90, z: 70, radius: 8,
              interval: 4, telegraph: 1.0, damage: 35, room: 'de_lab' }
        ],
        chests: [
            { id: 'de_chest1', x: 135, z: 110, loot: 'dungeon_rare', room: 'de_core', bossGuarded: true }
        ],
        completion: { namedKills: 1, bossKill: true }
    },

    // ==========================================
    // КАТАКОМБЫ БРЕНДОВАНОГО КОТЛА (INSTANCED PARTY)
    // аналог Catacomb of the Branded
    // ==========================================
    branded_catacomb: {
        id: 'branded_catacomb',
        name: 'Катакомбы Брендованного Котла',
        type: DUNGEON_TYPES.INSTANCED_PARTY,
        levelReq: 25,
        description: 'Инстанс на группу. Затопленные паром катакомбы с клеймёными механизмами.',
        partyReq: 3,
        partyMax: 9,
        instanceDuration: 1800,   // 30 минут
        cooldown: 3600,           // 1 час между входами
        dailyLimit: 3,
        keyItem: 'catacomb_ticket', // расходуемый билет
        entranceFee: 2000,
        expMult: 1.5,
        dropMult: 1.6,
        // Комнаты раскладываются в INSTANCE_POCKET
        rooms: [
            { id: 'bc_r1', type: ROOM_TYPES.ENTRANCE,    offset: [0, 0],     size: [16, 16], label: 'Печать входа' },
            { id: 'bc_r2', type: ROOM_TYPES.HALL,        offset: [0, -30],   size: [24, 20], label: 'Зал Клейм' },
            { id: 'bc_r3', type: ROOM_TYPES.TRAP,        offset: [0, -55],   size: [10, 16], label: 'Паровой коридор' },
            { id: 'bc_r4', type: ROOM_TYPES.NAMED,       offset: [0, -80],   size: [18, 18], label: 'Гнездо Смотрителя' },
            { id: 'bc_r5', type: ROOM_TYPES.CIRCULATION, offset: [0, -105],  size: [10, 18], label: 'Спуск в котёл' },
            { id: 'bc_r6', type: ROOM_TYPES.BOSS,        offset: [0, -135],  size: [28, 28], label: 'Брендованный Котёл (РБ)' }
        ],
        namedMobs: [
            { id: 'bc_named_warden', templateId: 'branded_warden', room: 'bc_r4', respawn: 0 }
        ],
        traps: [
            { id: 'bc_trap1', kind: 'steam_vent', room: 'bc_r3', radius: 3, interval: 5, telegraph: 1.5, damage: 40 },
            { id: 'bc_trap2', kind: 'steam_vent', room: 'bc_r3', radius: 3, interval: 5, telegraph: 1.5, damage: 40 }
        ],
        chests: [
            { id: 'bc_chest_mid', room: 'bc_r4', loot: 'dungeon_rare' },
            { id: 'bc_chest_boss', room: 'bc_r6', loot: 'dungeon_epic', bossGuarded: true }
        ],
        boss: { templateId: 'branded_boiler', room: 'bc_r6' },
        completion: { bossKill: true }
    },

    // ==========================================
    // ПАРОВАЯ БАШНЯ КРУМА (VERTICAL)
    // аналог Cruma Tower — ярусы/вертикальность
    // ==========================================
    cruma_tower: {
        id: 'cruma_tower',
        name: 'Паровая Башня Крума',
        type: DUNGEON_TYPES.VERTICAL,
        levelReq: 30,
        description: 'Вертикальный инстанс. 4 яруса решётчатых настилов. Тактика высоты.',
        partyReq: 2,
        partyMax: 9,
        instanceDuration: 2400,
        cooldown: 7200,
        dailyLimit: 2,
        keyItem: 'tower_keycard',
        entranceFee: 5000,
        expMult: 1.6,
        dropMult: 1.8,
        floors: 4,              // вертикальность по дизайн-документу
        floorHeight: 12,        // юнитов между ярусами
        rooms: [
            { id: 'ct_f1', type: ROOM_TYPES.HALL,  floor: 1, offset: [0, 0],    size: [22, 22], label: 'Ярус 1 — Приёмный цех' },
            { id: 'ct_f2', type: ROOM_TYPES.TRAP,  floor: 2, offset: [0, -30],  size: [18, 18], label: 'Ярус 2 — Турельный пояс' },
            { id: 'ct_f3', type: ROOM_TYPES.NAMED, floor: 3, offset: [0, -60],  size: [20, 20], label: 'Ярус 3 — Диспетчерская' },
            { id: 'ct_f4', type: ROOM_TYPES.BOSS,  floor: 4, offset: [0, -90],  size: [26, 26], label: 'Ярус 4 — Вершина (РБ)' }
        ],
        namedMobs: [
            { id: 'ct_named_dispatcher', templateId: 'tower_dispatcher', room: 'ct_f3', respawn: 0 }
        ],
        traps: [
            { id: 'ct_trap_t1', kind: 'turret', room: 'ct_f2', radius: 10, interval: 3.5, telegraph: 1.0, damage: 55 },
            { id: 'ct_trap_t2', kind: 'turret', room: 'ct_f2', radius: 10, interval: 3.5, telegraph: 1.0, damage: 55 }
        ],
        chests: [
            { id: 'ct_chest3', room: 'ct_f3', loot: 'dungeon_rare' },
            { id: 'ct_chest4', room: 'ct_f4', loot: 'dungeon_epic', bossGuarded: true }
        ],
        boss: { templateId: 'cruma_core', room: 'ct_f4' },
        completion: { bossKill: true }
    },

    // ==========================================
    // ГНЕЗДО АВТОНОМНОЙ ДИРЕКТИВЫ (RAID)
    // аналог рейдовых логовищ
    // ==========================================
    directive_nest: {
        id: 'directive_nest',
        name: 'Гнездо Автономной Директивы',
        type: DUNGEON_TYPES.RAID,
        levelReq: 35,
        description: 'Рейдовый инстанс. Коллективный разум машин. 9 операторов минимум.',
        partyReq: 9,
        partyMax: 9,
        instanceDuration: 3600,
        cooldown: 86400,        // сутки
        weeklyLimit: 2,
        keyItem: 'directive_core_key',
        entranceFee: 20000,
        expMult: 2.0,
        dropMult: 2.5,
        rooms: [
            { id: 'dn_r1', type: ROOM_TYPES.ENTRANCE, offset: [0, 0],    size: [20, 20], label: 'Врата Разума' },
            { id: 'dn_r2', type: ROOM_TYPES.HALL,     offset: [0, -40],  size: [40, 40], label: 'Арена-Амфитеатр' },
            { id: 'dn_r3', type: ROOM_TYPES.BOSS,     offset: [0, -90],  size: [44, 44], label: 'Трон Коллектива (Рейд-РБ)' }
        ],
        namedMobs: [
            { id: 'dn_named_node1', templateId: 'directive_node', room: 'dn_r2', respawn: 0 },
            { id: 'dn_named_node2', templateId: 'directive_node', room: 'dn_r2', respawn: 0 }
        ],
        traps: [
            { id: 'dn_trap_aoe', kind: 'steam_vent', room: 'dn_r2', radius: 5, interval: 8, telegraph: 2.0, damage: 80 }
        ],
        chests: [
            { id: 'dn_chest_raid', room: 'dn_r3', loot: 'dungeon_legendary', bossGuarded: true }
        ],
        boss: { templateId: 'directive_overmind', room: 'dn_r3' },
        completion: { bossKill: true }
    }
};

// Инициализация мировых координат открытых данжей из WorldMetrics
(function () {
    if (typeof window !== 'undefined' && window.WorldMetrics && window.WorldMetrics.buildDungeonAnchors) {
        const anchors = window.WorldMetrics.buildDungeonAnchors();
        if (anchors.elven_ruins && DUNGEON_DATABASE.dock_3) {
            DUNGEON_DATABASE.dock_3.entrance = anchors.elven_ruins.entrance;
            DUNGEON_DATABASE.dock_3.rooms = anchors.elven_ruins.rooms;
            DUNGEON_DATABASE.dock_3.namedMobs = anchors.elven_ruins.namedMobs;
            DUNGEON_DATABASE.dock_3.traps = anchors.elven_ruins.traps;
            DUNGEON_DATABASE.dock_3.chests = anchors.elven_ruins.chests;
            DUNGEON_DATABASE.dock_3.regionId = 'elven_ruins';
        }
        if (anchors.orc_barracks && DUNGEON_DATABASE.dark_engineering) {
            DUNGEON_DATABASE.dark_engineering.entrance = anchors.orc_barracks.entrance;
            DUNGEON_DATABASE.dark_engineering.rooms = anchors.orc_barracks.rooms;
            DUNGEON_DATABASE.dark_engineering.namedMobs = anchors.orc_barracks.namedMobs;
            DUNGEON_DATABASE.dark_engineering.traps = anchors.orc_barracks.traps;
            DUNGEON_DATABASE.dark_engineering.chests = anchors.orc_barracks.chests;
            DUNGEON_DATABASE.dark_engineering.regionId = 'orc_barracks';
        }
    }
})();

// ============================================
// ШАБЛОНЫ NAMED-МОБОВ И БОССОВ ДАНЖЕЙ
// (расширение MOB_DATABASE из spawn.js)
// ============================================
const DUNGEON_MOB_TEMPLATES = {
    rustclaw_overseer: {
        id: 'rustclaw_overseer', name: 'Смотритель Ржавый Коготь', type: 'named',
        level: [12, 14], hp: [1200, 1600], damage: [22, 30], defense: 8, exp: [120, 160],
        moveSpeed: 3, aggroRange: 12, attackRange: 2.5, color: 0xff6600, scale: 3.2,
        sprite: { body: '#aa4400', accent: '#662200', eyes: '#ffaa00', heavy: true },
        named: true,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [80, 160] },
            { name: 'Усилитель давления', chance: 0.6, amount: [2, 4] },
            { name: 'Чертеж: Стальная пластина', chance: 0.2, amount: [1, 1] }
        ]
    },
    sparkweld_elite: {
        id: 'sparkweld_elite', name: 'Элита Искросварка', type: 'named',
        level: [14, 16], hp: [1500, 2000], damage: [26, 34], defense: 9, exp: [150, 200],
        moveSpeed: 4, aggroRange: 14, attackRange: 3, color: 0xffaa00, scale: 2.6,
        sprite: { body: '#aa8800', accent: '#665500', eyes: '#ffff00', flying: true },
        named: true, ranged: true, projectileColor: 0xffaa00,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [100, 200] },
            { name: 'Чертеж: Оптика', chance: 0.25, amount: [1, 1] },
            { name: 'Усилитель давления', chance: 0.5, amount: [2, 5] }
        ]
    },
    logic_corruptor: {
        id: 'logic_corruptor', name: 'Повреждатель Логики', type: 'named',
        level: [22, 26], hp: [3000, 4000], damage: [40, 55], defense: 14, exp: [400, 550],
        moveSpeed: 3, aggroRange: 16, attackRange: 4, color: 0xaa44ff, scale: 3.5,
        sprite: { body: '#6622aa', accent: '#331166', eyes: '#ff44ff', heavy: true },
        named: true, aoeAttacks: true,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [200, 400] },
            { name: 'Чертеж: Гидравлический доспех', chance: 0.15, amount: [1, 1] },
            { name: 'Усилитель давления', chance: 0.7, amount: [4, 8] }
        ]
    },
    branded_warden: {
        id: 'branded_warden', name: 'Клеймёный Смотритель', type: 'named',
        level: [27, 30], hp: [5000, 6500], damage: [55, 70], defense: 18, exp: [700, 900],
        moveSpeed: 3, aggroRange: 18, attackRange: 3, color: 0xff4400, scale: 4.0,
        sprite: { body: '#992200', accent: '#551100', eyes: '#ff8800', heavy: true },
        named: true, aoeAttacks: true, summonAdds: true,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [300, 600] },
            { name: 'Усилитель давления', chance: 0.8, amount: [5, 10] }
        ]
    },
    branded_boiler: {
        id: 'branded_boiler', name: 'Брендованный Котёл', type: 'boss',
        level: [30, 33], hp: [15000, 20000], damage: [80, 110], defense: 25, exp: [2500, 3500],
        moveSpeed: 2, aggroRange: 25, attackRange: 5, color: 0xff2200, scale: 6.5,
        sprite: { body: '#aa1100', accent: '#550000', eyes: '#ffff00', boss: true },
        named: true, boss: true, aoeAttacks: true, summonAdds: true, enrageAtHp: 0.2,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [1000, 2000] },
            { name: 'Ядро Пресс-Молота', chance: 0.5, amount: [1, 2] },
            { name: 'Чертеж: Гидравлический клинок', chance: 0.3, amount: [1, 1] }
        ]
    },
    tower_dispatcher: {
        id: 'tower_dispatcher', name: 'Диспетчер Башни', type: 'named',
        level: [32, 35], hp: [8000, 10000], damage: [70, 90], defense: 22, exp: [1200, 1600],
        moveSpeed: 3, aggroRange: 18, attackRange: 6, color: 0x44aaff, scale: 4.0,
        sprite: { body: '#2266aa', accent: '#113366', eyes: '#88ddff', flying: true },
        named: true, ranged: true, projectileColor: 0x44aaff, aoeAttacks: true,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [500, 900] },
            { name: 'Чертеж: Гидравлический доспех', chance: 0.25, amount: [1, 1] }
        ]
    },
    cruma_core: {
        id: 'cruma_core', name: 'Ядро Башни Крума', type: 'boss',
        level: [36, 38], hp: [25000, 32000], damage: [110, 150], defense: 32, exp: [5000, 7000],
        moveSpeed: 2, aggroRange: 25, attackRange: 6, color: 0xff6600, scale: 7.0,
        sprite: { body: '#aa4400', accent: '#552200', eyes: '#ffff44', boss: true },
        named: true, boss: true, aoeAttacks: true, summonAdds: true, enrageAtHp: 0.25,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [2000, 4000] },
            { name: 'Фрагмент Колосса', chance: 0.8, amount: [3, 6] },
            { name: 'Чертеж: Гидравлический клинок', chance: 0.4, amount: [1, 1] }
        ]
    },
    directive_node: {
        id: 'directive_node', name: 'Узел Коллектива', type: 'named',
        level: [36, 39], hp: [12000, 15000], damage: [90, 120], defense: 28, exp: [2000, 2600],
        moveSpeed: 4, aggroRange: 20, attackRange: 5, color: 0xff44aa, scale: 4.5,
        sprite: { body: '#aa2266', accent: '#551133', eyes: '#ffaadd', heavy: true },
        named: true, aoeAttacks: true,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [800, 1500] },
            { name: 'Ядро Босса-Бура', chance: 0.4, amount: [1, 1] }
        ]
    },
    directive_overmind: {
        id: 'directive_overmind', name: 'Коллективный Разум', type: 'boss',
        level: [40, 40], hp: [80000, 100000], damage: [180, 240], defense: 45, exp: [20000, 30000],
        moveSpeed: 2, aggroRange: 30, attackRange: 8, color: 0xff0044, scale: 9.0,
        sprite: { body: '#aa0022', accent: '#550011', eyes: '#ffffff', boss: true },
        named: true, boss: true, aoeAttacks: true, summonAdds: true, enrageAtHp: 0.3,
        loot: [
            { name: 'Медные детали', chance: 1.0, amount: [10000, 20000] },
            { name: 'Ядро Босса-Бура', chance: 1.0, amount: [2, 4] },
            { name: 'Фрагмент Колосса', chance: 1.0, amount: [5, 10] }
        ]
    }
};

// ============================================
// ТАБЛИЦЫ ЛУТА СУНДУКОВ
// ============================================
const CHEST_LOOT_TABLES = {
    dungeon_common: [
        { id: 'synthetic_oil', chance: 0.8, min: 5, max: 15 },
        { id: 'pressure_canister', chance: 0.7, min: 3, max: 10 },
        { id: 'soulshot_d', chance: 0.6, min: 20, max: 60 },
        { id: 'pressure_amplifier', chance: 0.4, min: 1, max: 3 },
        { id: 'copper_parts', chance: 1.0, min: 200, max: 600 }
    ],
    dungeon_rare: [
        { id: 'pressure_amplifier', chance: 0.9, min: 2, max: 5 },
        { id: 'pressure_amplifier_d', chance: 0.5, min: 1, max: 3 },
        { id: 'blessed_pressure_amplifier', chance: 0.2, min: 1, max: 1 },
        { id: 'recipe_steel_plate', chance: 0.3, min: 1, max: 1 },
        { id: 'copper_plate', chance: 0.25, min: 1, max: 1 },
        { id: 'copper_parts', chance: 1.0, min: 500, max: 1500 }
    ],
    dungeon_epic: [
        { id: 'blessed_pressure_amplifier', chance: 0.6, min: 1, max: 3 },
        { id: 'recipe_hydraulic_armor', chance: 0.4, min: 1, max: 1 },
        { id: 'recipe_hydraulic_blade', chance: 0.4, min: 1, max: 1 },
        { id: 'hydraulic_blade', chance: 0.15, min: 1, max: 1 },
        { id: 'hydraulic_armor', chance: 0.15, min: 1, max: 1 },
        { id: 'engine_necklace', chance: 0.2, min: 1, max: 1 },
        { id: 'copper_parts', chance: 1.0, min: 2000, max: 5000 }
    ],
    dungeon_legendary: [
        { id: 'blessed_pressure_amplifier', chance: 1.0, min: 3, max: 6 },
        { id: 'recipe_hydraulic_armor', chance: 0.7, min: 1, max: 2 },
        { id: 'hydraulic_blade', chance: 0.4, min: 1, max: 1 },
        { id: 'hydraulic_armor', chance: 0.4, min: 1, max: 1 },
        { id: 'engine_necklace', chance: 0.5, min: 1, max: 1 },
        { id: 'drill_worm_core', chance: 0.5, min: 1, max: 2 },
        { id: 'copper_parts', chance: 1.0, min: 10000, max: 25000 }
    ]
};

// ============================================
// МЕНЕДЖЕР ДАНЖЕЙ
// ============================================
class DungeonManager {
    constructor(scene) {
        this.scene = scene;
        this.gates = [];          // входные ворота в мире
        this.activeSession = null; // текущая сессия игрока (open или instance)
        this.instances = new Map(); // instanceId -> DungeonInstance
        this.namedMobs = [];      // живые named-мобы
        this.traps = [];          // активные ловушки
        this.chests = [];         // сундуки
        this.instanceCounter = 0;

        // Лимиты игрока: dungeonId -> { lastEntry, dailyCount, dailyDate, weeklyCount, weekStart }
        this.playerLimits = {};

        this.loadLimits();
        this.spawnGates();
        console.log('[Dungeon] Менеджер данжей инициализирован');
    }

    spawnGates() {
        Object.values(DUNGEON_DATABASE).forEach(d => {
            let config = d;
            if (window.WorldMetrics) {
                const regs = window.WorldMetrics.buildRegions();
                const matched = regs.find(r => r.id === d.regionId || r.legacy === d.regionId);
                if (matched && matched.entrance) {
                    config = Object.assign({}, d, { entrance: { x: matched.entrance.x, z: matched.entrance.z } });
                }
            }
            if (!config.entrance) return;
            const gate = new DungeonGate(this.scene, config);
            this.gates.push(gate);
        });
    }

    getGateAt(position, range = 4) {
        return this.gates.find(g =>
            g.mesh.position.distanceTo(position) < range
        );
    }

    // === ПРОВЕРКА УСЛОВИЙ ВХОДА ===
    canEnter(dungeonId, partySize = 1) {
        const d = DUNGEON_DATABASE[dungeonId];
        if (!d) return { ok: false, reason: 'Данж не найден.' };

        // Данжи целиком клиентские: мобы (ZoneEnemy), урон ловушек, лут сундуков
        // и награда за зачистку считаются локально, сервер о них не знает
        // (grep `dungeon` по server.js = 0). Из-за этого EXP и предметы
        // пропадали при следующей серверной синхронизации, а вход списывал
        // валюту и ключ безвозвратно. Вход закрыт до серверной реализации.
        if (!DungeonManager.SERVER_READY) {
            return { ok: false, reason: 'Данжи закрыты: идёт перенос на сервер.' };
        }

        const lvl = game.player.level;
        if (lvl < d.levelReq)
            return { ok: false, reason: `Требуется уровень ${d.levelReq}.` };
        if (d.levelMax && lvl > d.levelMax)
            return { ok: false, reason: `Макс. уровень для входа: ${d.levelMax}.` };

        // Пати
        if (d.partyReq && partySize < d.partyReq)
            return { ok: false, reason: `Нужна группа от ${d.partyReq} человек.` };
        if (d.partyMax && partySize > d.partyMax)
            return { ok: false, reason: `Группа переполнена (макс ${d.partyMax}).` };

        // Квест
        if (d.questReq && game.questManager) {
            const active = game.questManager.isActive ? game.questManager.isActive(d.questReq) : false;
            const done = game.questManager.isCompleted(d.questReq);
            if (!active && !done)
                return { ok: false, reason: 'Требуется квест-допуск.' };
        }

        // Ключ
        if (d.keyItem && !game.inventory.hasItem(d.keyItem, 1))
            return { ok: false, reason: `Нужен предмет: ${this.itemName(d.keyItem)}.` };

        // Плата
        if (d.entranceFee && game.inventory.currency < d.entranceFee)
            return { ok: false, reason: `Недостаточно деталей (${d.entranceFee}).` };

        // Кулдаун
        const lim = this.getLimits(dungeonId);
        if (lim.lastEntry) {
            const left = (d.cooldown || 0) - (Date.now() - lim.lastEntry) / 1000;
            if (left > 0)
                return { ok: false, reason: `Повторный вход через ${Math.ceil(left)}с.` };
        }

        // Дневной лимит
        this.rollDaily(dungeonId);
        if (d.dailyLimit && lim.dailyCount >= d.dailyLimit)
            return { ok: false, reason: 'Дневной лимит входов исчерпан.' };

        // Недельный лимит
        this.rollWeekly(dungeonId);
        if (d.weeklyLimit && lim.weeklyCount >= d.weeklyLimit)
            return { ok: false, reason: 'Недельный лимит исчерпан.' };

        return { ok: true };
    }

    // === ВХОД ===
    enter(dungeonId, partySize = 1) {
        const check = this.canEnter(dungeonId, partySize);
        if (!check.ok) {
            game.addChatMessage('⛔ ' + check.reason, 'system');
            return false;
        }
        const d = DUNGEON_DATABASE[dungeonId];

        // Списание ключа и платы — задача сервера (интент входа в данж).
        // Локально это создавало расхождение: предмет исчезал у клиента и
        // возвращался следующей синхронизацией сумки.
        if (DungeonManager.SERVER_READY) {
            if (d.keyItem) game.inventory.removeItem(d.keyItem, 1);
            if (d.entranceFee) game.inventory.spendCurrency(d.entranceFee);
        }
        this.recordEntry(dungeonId);

        if (d.type === DUNGEON_TYPES.OPEN) {
            this.startOpenSession(d);
        } else {
            this.startInstance(d);
        }
        return true;
    }

    // --- Открытый данж: телепорт в регион + трекинг ---
    startOpenSession(d) {
        this.clearSession();
        const _gh = window.Terrain ? window.Terrain.heightAt(d.entrance.x, d.entrance.z) : 0;
        game.player.mesh.position.set(d.entrance.x, 1.5 + Math.max(_gh, (window.Terrain ? window.Terrain.seaLevel : 2.2) - 0.3), d.entrance.z);

        this.activeSession = {
            type: 'open',
            dungeonId: d.id,
            startTime: Date.now(),
            progress: { namedKills: 0, bossKill: false, totalNamed: d.namedMobs.length },
            openedChests: new Set()
        };

        // Спавн named-мобов, ловушек, сундуков в мире (координаты региона)
        this.spawnDungeonEntities(d, null);

        game.addChatMessage(`⚙️ Вход в данж: ${d.name} (EXP x${d.expMult})`, 'system');
        if (game.dungeonUI) game.dungeonUI.onSessionStart(this.activeSession, d);
    }

    // --- Инстанс: копия в координатном кармане ---
    startInstance(d) {
        this.clearSession();
        const instanceId = 'inst_' + (++this.instanceCounter);
        const pocketOffset = new THREE.Vector3(
            INSTANCE_POCKET.x,
            0,
            INSTANCE_POCKET.z + this.instanceCounter * 400 // разводим копии по Z
        );

        const instance = new DungeonInstance(this.scene, d, instanceId, pocketOffset);
        instance.build();
        this.instances.set(instanceId, instance);

        // Телепорт игрока на вход инстанса
        const entr = instance.roomPositions[d.rooms[0].id];
        game.player.mesh.position.set(entr.x, 1.5 + (instance.floorYOffset || 0), entr.z);

        this.activeSession = {
            type: 'instance',
            instanceId: instanceId,
            dungeonId: d.id,
            startTime: Date.now(),
            duration: d.instanceDuration,
            progress: { namedKills: 0, bossKill: false, totalNamed: d.namedMobs.length },
            openedChests: new Set()
        };

        // Спавн сущностей инстанса (координаты = pocket + room offset)
        this.spawnDungeonEntities(d, instance);

        game.addChatMessage(`⚙️ Инстанс создан: ${d.name} (${this.formatTime(d.instanceDuration)})`, 'system');
        if (game.dungeonUI) game.dungeonUI.onSessionStart(this.activeSession, d);
    }

    // === СПАВН СУЩНОСТЕЙ ДАНЖА ===
    spawnDungeonEntities(d, instance) {
        // Открытые данжи: мобы с сервера. Локальный спавн — только pocket-инстанс.
        if (!instance) return;
        const resolve = (room, localX, localZ) => {
            // Для инстанса координаты = pocket + offset комнаты (+ локальные)
            if (instance) {
                const rp = instance.roomPositions[room];
                const floorY = instance.roomFloorY ? instance.roomFloorY[room] : 0;
                return {
                    x: (rp ? rp.x : INSTANCE_POCKET.x) + (localX || 0),
                    z: (rp ? rp.z : INSTANCE_POCKET.z) + (localZ || 0),
                    y: floorY
                };
            }
            // Для открытого данжа — абсолютные координаты из конфига
            return { x: localX, z: localZ, y: 0 };
        };

        const tag = instance ? instance.id : 'open_' + d.id;

        // Named-мобы
        (d.namedMobs || []).forEach((nm, i) => {
            const tpl = DUNGEON_MOB_TEMPLATES[nm.templateId];
            if (!tpl) return;
            let pos;
            if (instance) {
                const rp = instance.roomPositions[nm.room];
                pos = new THREE.Vector3(rp.x, (instance.roomFloorY[nm.room] || 0), rp.z);
            } else {
                pos = new THREE.Vector3(nm.x, 0, nm.z);
            }
            const lvl = tpl.level[0] + Math.floor(Math.random() * (tpl.level[1] - tpl.level[0] + 1));
            const hp = this.rng(tpl.hp);
            const dmg = this.rng(tpl.damage);
            const exp = this.rng(tpl.exp);
            const enemy = new ZoneEnemy(this.scene, tpl, lvl, hp, dmg, exp, pos, tag);
            enemy.dungeonTag = tag;
            enemy.dungeonNamed = nm;
            enemy.dungeonId = d.id;
            enemy.isNamed = true;
            this.namedMobs.push(enemy);
            if (game.spawnManager) game.spawnManager.enemies.push(enemy);
        });

        // Босс инстанса
        if (d.boss && instance) {
            const tpl = DUNGEON_MOB_TEMPLATES[d.boss.templateId];
            if (tpl) {
                const rp = instance.roomPositions[d.boss.room];
                const pos = new THREE.Vector3(rp.x, (instance.roomFloorY[d.boss.room] || 0), rp.z);
                const lvl = tpl.level[0];
                const enemy = new ZoneEnemy(this.scene, tpl, lvl, this.rng(tpl.hp), this.rng(tpl.damage), this.rng(tpl.exp), pos, tag);
                enemy.dungeonTag = tag;
                enemy.dungeonId = d.id;
                enemy.isNamed = true;
                enemy.isDungeonBoss = true;
                this.namedMobs.push(enemy);
                if (game.spawnManager) game.spawnManager.enemies.push(enemy);
            }
        }

        // Ловушки
        (d.traps || []).forEach((tr, i) => {
            let pos;
            if (instance) {
                const rp = instance.roomPositions[tr.room];
                // Разносим ловушки в комнате
                const jitter = (i % 2 === 0 ? -1 : 1) * 3;
                pos = new THREE.Vector3(rp.x + jitter, (instance.roomFloorY[tr.room] || 0), rp.z);
            } else {
                pos = new THREE.Vector3(tr.x, 0, tr.z);
            }
            const trap = new DungeonTrap(this.scene, tr, pos, tag);
            this.traps.push(trap);
        });

        // Сундуки
        (d.chests || []).forEach(ch => {
            let pos;
            if (instance) {
                const rp = instance.roomPositions[ch.room];
                pos = new THREE.Vector3(rp.x + 4, (instance.roomFloorY[ch.room] || 0), rp.z + 4);
            } else {
                pos = new THREE.Vector3(ch.x, 0, ch.z);
            }
            const chest = new LootChest(this.scene, ch, pos, tag);
            this.chests.push(chest);
        });
    }

    // === ОБНОВЛЕНИЕ (каждый кадр) ===
    update(delta, playerPosition, player) {
        if (!this.activeSession) {
            // Всё равно анимируем ворота
            this.gates.forEach(g => g.update(delta, playerPosition));
            return;
        }

        const d = DUNGEON_DATABASE[this.activeSession.dungeonId];

        // Таймер инстанса
        if (this.activeSession.type === 'instance' && this.activeSession.duration) {
            const elapsed = (Date.now() - this.activeSession.startTime) / 1000;
            const left = this.activeSession.duration - elapsed;
            if (left <= 0) {
                game.addChatMessage('⏳ Время инстанса истекло! Схлопывание...', 'damage');
                this.exit(true);
                return;
            }
            if (left <= 60 && Math.floor(left) % 10 === 0 && left !== this._lastWarn) {
                this._lastWarn = Math.floor(left);
                game.addChatMessage(`⚠️ Инстанс схлопнется через ${Math.floor(left)}с`, 'system');
            }
        }

        // Ловушки
        for (let i = this.traps.length - 1; i >= 0; i--) {
            const trap = this.traps[i];
            if (trap.tag !== this.currentTag()) continue;
            trap.update(delta, player);
        }

        // Сундуки (анимация)
        this.chests.forEach(c => { if (c.tag === this.currentTag()) c.update(delta); });

        // Проверка смерти named/босса
        this.checkNamedDeaths(d);

        // Ворота
        this.gates.forEach(g => g.update(delta, playerPosition));

        // UI
        if (game.dungeonUI) game.dungeonUI.updateSession(this.activeSession, d);
    }

    currentTag() {
        if (!this.activeSession) return null;
        return this.activeSession.type === 'instance'
            ? this.activeSession.instanceId
            : 'open_' + this.activeSession.dungeonId;
    }

    checkNamedDeaths(d) {
        for (let i = this.namedMobs.length - 1; i >= 0; i--) {
            const m = this.namedMobs[i];
            if (m.dungeonTag !== this.currentTag()) continue;
            if (m.hp <= 0) {
                // Дроп
                this.dropNamedLoot(m, d);
                // Прогресс
                if (m.isDungeonBoss) {
                    this.activeSession.progress.bossKill = true;
                    game.addChatMessage(`🏆 Босс данжа повержен: ${m.name}!`, 'loot');
                } else {
                    this.activeSession.progress.namedKills++;
                    game.addChatMessage(`💀 Мини-босс повержен: ${m.name}`, 'loot');
                }
                // Респавн named (не боссов) в открытых данжах
                if (!m.isDungeonBoss && m.dungeonNamed && m.dungeonNamed.respawn > 0
                    && this.activeSession.type === 'open') {
                    const nm = m.dungeonNamed;
                    const tpl = DUNGEON_MOB_TEMPLATES[nm.templateId];
                    setTimeout(() => {
                        if (!this.activeSession || this.activeSession.dungeonId !== d.id) return;
                        const pos = new THREE.Vector3(nm.x, 0, nm.z);
                        const lvl = tpl.level[0] + Math.floor(Math.random() * (tpl.level[1] - tpl.level[0] + 1));
                        const e = new ZoneEnemy(this.scene, tpl, lvl, this.rng(tpl.hp), this.rng(tpl.damage), this.rng(tpl.exp), pos, this.currentTag());
                        e.dungeonTag = this.currentTag();
                        e.dungeonNamed = nm; e.dungeonId = d.id; e.isNamed = true;
                        this.namedMobs.push(e);
                        if (game.spawnManager) game.spawnManager.enemies.push(e);
                    }, m.dungeonNamed.respawn * 1000);
                }
                // Удаление
                const gi = game.spawnManager ? game.spawnManager.enemies.indexOf(m) : -1;
                if (gi > -1) game.spawnManager.enemies.splice(gi, 1);
                this.namedMobs.splice(i, 1);

                this.checkCompletion(d);
            }
        }
    }

    dropNamedLoot(m, d) {
        const tpl = m.template;
        if (!tpl || !tpl.loot) return;
        // Лут выдаёт сервер (spawnGroundLoot). Локальный addItem создавал
        // предметы, которых нет в серверном инвентаре, — они исчезали при
        // следующем applyInv.
        if (!DungeonManager.SERVER_READY) return;
        const mult = d.dropMult || 1;
        tpl.loot.forEach(item => {
            if (Math.random() < item.chance) {
                const amount = Math.floor(this.rng(item.amount) * mult);
                const itemId = this.lootNameToId(item.name);
                game.inventory.addItem(itemId, amount);
                game.addChatMessage(`✨ ${item.name} x${amount}`, 'loot');
            }
        });
    }

    checkCompletion(d) {
        const p = this.activeSession.progress;
        const c = d.completion || {};
        const namedOk = !c.namedKills || p.namedKills >= c.namedKills;
        const bossOk = !c.bossKill || p.bossKill;
        if (namedOk && bossOk && !this.activeSession.completed) {
            this.activeSession.completed = true;
            game.addChatMessage(`✅ Данж зачищен: ${d.name}! Бонусная награда начислена.`, 'loot');
            this.grantCompletionReward(d);
            // Инстанс: авто-выход через 30 сек
            if (this.activeSession.type === 'instance') {
                setTimeout(() => { if (this.activeSession && this.activeSession.completed) this.exit(false); }, 30000);
            }
        }
    }

    grantCompletionReward(d) {
        // EXP и медные детали начисляет сервер. Локальные gainExp/addItem давали
        // «фантомную» награду: сервер её не знал и откатывал.
        if (!DungeonManager.SERVER_READY) {
            game.addChatMessage('Награда за зачистку будет начислена после переноса данжей на сервер.', 'system');
            return;
        }
        const bonusExp = Math.floor((game.player.levelSystem.expToNext || 1000) * 0.05);
        game.player.gainExp(bonusExp, game.player.level);
        const bonusAdena = 1000 * (d.levelReq || 10);
        game.inventory.addItem('copper_parts', bonusAdena);
        game.addChatMessage(`Награда за зачистку: +${bonusExp} EXP, +${bonusAdena}⚙️`, 'loot');
    }

    // === СУНДУКИ ===
    openChest(chest) {
        if (!this.activeSession) return;
        if (this.activeSession.openedChests.has(chest.config.id)) {
            game.addChatMessage('Сундук уже открыт.', 'system');
            return;
        }
        if (chest.config.bossGuarded && !this.activeSession.progress.bossKill) {
            game.addChatMessage('🔒 Сундук охраняется боссом.', 'system');
            return;
        }
        const table = CHEST_LOOT_TABLES[chest.config.loot];
        if (!table) return;
        this.activeSession.openedChests.add(chest.config.id);
        chest.opened = true;
        game.addChatMessage('📦 Сундук открыт!', 'loot');
        if (!DungeonManager.SERVER_READY) {
            game.addChatMessage('Содержимое выдаст сервер после переноса данжей.', 'system');
            return;
        }
        table.forEach(item => {
            if (Math.random() < item.chance) {
                const amount = this.rng([item.min, item.max]);
                game.inventory.addItem(item.id, amount);
                const t = (typeof ITEM_DATABASE !== 'undefined' && ITEM_DATABASE[item.id])
                    ? ITEM_DATABASE[item.id].name : item.id;
                game.addChatMessage(`  • ${t} x${amount}`, 'loot');
            }
        });
    }

    getChestAt(position, range = 3) {
        return this.chests.find(c =>
            c.tag === this.currentTag() && !c.opened &&
            c.mesh.position.distanceTo(position) < range
        );
    }

    // === ВЫХОД ===
    exit(forced = false) {
        if (!this.activeSession) return;
        const d = DUNGEON_DATABASE[this.activeSession.dungeonId];

        if (this.activeSession.type === 'instance') {
            const inst = this.instances.get(this.activeSession.instanceId);
            if (inst) {
                inst.dispose();
                this.instances.delete(this.activeSession.instanceId);
            }
        }

        // Чистим сущности сессии
        this.clearSessionEntities();

        // Телепорт наружу
        const ex = (d && d.exitPoint) ? d.exitPoint : { x: 0, z: 0 };
        game.player.mesh.position.set(ex.x, 1.5, ex.z);

        if (game.dungeonUI) game.dungeonUI.onSessionEnd();
        this.activeSession = null;
        if (!forced) game.addChatMessage('🚪 Вы покинули данж.', 'system');
    }

    clearSession() {
        if (this.activeSession) {
            if (this.activeSession.type === 'instance') {
                const inst = this.instances.get(this.activeSession.instanceId);
                if (inst) { inst.dispose(); this.instances.delete(this.activeSession.instanceId); }
            }
            this.clearSessionEntities();
        }
        this.activeSession = null;
    }

    clearSessionEntities() {
        const tag = this.currentTag();
        // Named
        for (let i = this.namedMobs.length - 1; i >= 0; i--) {
            if (this.namedMobs[i].dungeonTag === tag) {
                const m = this.namedMobs[i];
                const gi = game.spawnManager ? game.spawnManager.enemies.indexOf(m) : -1;
                if (gi > -1) game.spawnManager.enemies.splice(gi, 1);
                m.destroy();
                this.namedMobs.splice(i, 1);
            }
        }
        // Traps
        for (let i = this.traps.length - 1; i >= 0; i--) {
            if (this.traps[i].tag === tag) { this.traps[i].destroy(); this.traps.splice(i, 1); }
        }
        // Chests
        for (let i = this.chests.length - 1; i >= 0; i--) {
            if (this.chests[i].tag === tag) { this.chests[i].destroy(); this.chests.splice(i, 1); }
        }
    }

    // === СМЕРТЬ ИГРОКА В ДАНЖЕ ===
    onPlayerDeath() {
        if (!this.activeSession) return;
        // В инстансе смерть = выкидывает наружу (как возрождение в городе)
        if (this.activeSession.type === 'instance') {
            game.addChatMessage('💀 Вы пали в инстансе. Группа продолжает без вас.', 'damage');
            this.exit(true);
        }
        // В открытом данже — обычный штраф, остаёмся (возрождение в exitPoint)
    }

    // === ЛИМИТЫ ===
    getLimits(dungeonId) {
        if (!this.playerLimits[dungeonId]) {
            this.playerLimits[dungeonId] = {
                lastEntry: 0, dailyCount: 0, dailyDate: this.today(),
                weeklyCount: 0, weekStart: this.weekStart()
            };
        }
        return this.playerLimits[dungeonId];
    }
    recordEntry(dungeonId) {
        const lim = this.getLimits(dungeonId);
        lim.lastEntry = Date.now();
        lim.dailyCount++;
        lim.weeklyCount++;
        this.saveLimits();
    }
    rollDaily(dungeonId) {
        const lim = this.getLimits(dungeonId);
        if (lim.dailyDate !== this.today()) { lim.dailyCount = 0; lim.dailyDate = this.today(); }
    }
    rollWeekly(dungeonId) {
        const lim = this.getLimits(dungeonId);
        if (lim.weekStart !== this.weekStart()) { lim.weeklyCount = 0; lim.weekStart = this.weekStart(); }
    }
    today() { return new Date().toDateString(); }
    weekStart() {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - d.getDay());
        return d.toDateString();
    }
    saveLimits() {
        try { localStorage.setItem('ps_dungeon_limits', JSON.stringify(this.playerLimits)); } catch (e) {}
    }
    loadLimits() {
        try {
            const raw = localStorage.getItem('ps_dungeon_limits');
            if (raw) this.playerLimits = JSON.parse(raw);
        } catch (e) {}
    }

    // === УТИЛИТЫ ===
    rng(range) { return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0]; }
    formatTime(sec) {
        const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
    itemName(id) {
        return (typeof ITEM_DATABASE !== 'undefined' && ITEM_DATABASE[id]) ? ITEM_DATABASE[id].name : id;
    }
    lootNameToId(name) {
        const map = {
            'Медные детали': 'copper_parts', 'Обломок шестерни': 'gear_fragment',
            'Усилитель давления': 'pressure_amplifier', 'Чертеж: Поршень': 'blueprint_piston',
            'Чертеж: Стальная пластина': 'blueprint_steel_plate',
            'Чертеж: Оптика': 'blueprint_piston',
            'Чертеж: Гидравлический доспех': 'blueprint_hydraulic_armor',
            'Чертеж: Гидравлический клинок': 'blueprint_hydraulic_armor',
            'Ядро Пресс-Молота': 'press_hammer_core', 'Ядро Босса-Бура': 'drill_worm_core',
            'Фрагмент Колосса': 'colossus_fragment'
        };
        return map[name] || 'copper_parts';
    }
    isInDungeon() { return !!this.activeSession; }
}

// ============================================
// ИНСТАНС-КОПИЯ (геометрия комнат в кармане)
// ============================================
class DungeonInstance {
    constructor(scene, config, id, pocketOffset) {
        this.scene = scene;
        this.config = config;
        this.id = id;
        this.pocket = pocketOffset;
        this.meshes = [];
        this.roomPositions = {};   // roomId -> {x,z} центр
        this.roomFloorY = {};      // roomId -> высота яруса (vertical)
        this.floorYOffset = 0;
    }

    build() {
        const isVertical = this.config.type === DUNGEON_TYPES.VERTICAL;
        const floorH = this.config.floorHeight || 12;

        this.config.rooms.forEach(room => {
            let cx, cz, cy = 0;
            if (isVertical && room.floor) {
                cx = this.pocket.x + (room.offset ? room.offset[0] : 0);
                cz = this.pocket.z + (room.offset ? room.offset[1] : 0);
                cy = (room.floor - 1) * floorH;
            } else {
                cx = this.pocket.x + (room.offset ? room.offset[0] : 0);
                cz = this.pocket.z + (room.offset ? room.offset[1] : 0);
            }
            this.roomPositions[room.id] = { x: cx, z: cz };
            this.roomFloorY[room.id] = cy;

            const w = room.size ? room.size[0] : 20;
            const h = room.size ? room.size[1] : 20;

            // Пол комнаты
            const floorGeo = new THREE.PlaneGeometry(w, h);
            const floorMat = new THREE.MeshStandardMaterial({
                color: this.roomColor(room.type), roughness: 0.9, metalness: 0.2, flatShading: true
            });
            const floor = new THREE.Mesh(floorGeo, floorMat);
            floor.rotation.x = -Math.PI / 2;
            floor.position.set(cx, cy, cz);
            floor.receiveShadow = true;
            this.scene.add(floor); this.meshes.push(floor);

            // Стены комнаты
            this.addRoomWalls(cx, cy, cz, w, h, room);

            // Вертикальность: решётчатый настил-потолок/перила для башни
            if (isVertical && room.floor) {
                this.addRailing(cx, cy, cz, w, h);
            }

            // Освещение по типу (цветовое кодирование)
            const light = new THREE.PointLight(this.roomLight(room.type), 0.6, 30);
            light.position.set(cx, cy + 5, cz);
            this.scene.add(light); this.meshes.push(light);

            // Подпись-маркер типа комнаты (Weenie для босс-рума)
            if (room.type === ROOM_TYPES.BOSS) {
                this.addBossWeenie(cx, cy, cz);
            }
        });

        // Коридоры между комнатами (Circulation)
        this.buildCorridors();
    }

    addRoomWalls(cx, cy, cz, w, h, room) {
        const wallH = 6, t = 1;
        const mat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.85, metalness: 0.3 });
        const isEntrance = room.type === ROOM_TYPES.ENTRANCE;
        const isBoss = room.type === ROOM_TYPES.BOSS;

        // 4 стены, у entrance/циркуляции — проёмы
        const makeWall = (wx, wz, ww, wh, rotY) => {
            const g = new THREE.BoxGeometry(ww, wallH, t);
            const m = new THREE.Mesh(g, mat);
            m.position.set(wx, cy + wallH / 2, wz);
            m.rotation.y = rotY || 0;
            m.castShadow = true; m.receiveShadow = true;
            this.scene.add(m); this.meshes.push(m);
        };
        const gap = (isEntrance || room.type === ROOM_TYPES.CIRCULATION) ? 6 : 0;
        // Север/Юг с проёмом
        makeWall(cx - (w / 4 + gap / 4), cz - h / 2, w / 2 - gap / 2, wallH, 0);
        makeWall(cx + (w / 4 + gap / 4), cz - h / 2, w / 2 - gap / 2, wallH, 0);
        makeWall(cx - (w / 4 + gap / 4), cz + h / 2, w / 2 - gap / 2, wallH, 0);
        makeWall(cx + (w / 4 + gap / 4), cz + h / 2, w / 2 - gap / 2, wallH, 0);
        // Восток/Запад сплошные (кроме босс-рума — арена открыта)
        if (!isBoss) {
            makeWall(cx - w / 2, cz, t, wallH, Math.PI / 2);
            makeWall(cx + w / 2, cz, t, wallH, Math.PI / 2);
            // перпендикулярные стены через поворот ширины
            const g2 = new THREE.BoxGeometry(h, wallH, t);
            const mL = new THREE.Mesh(g2, mat); mL.position.set(cx - w / 2, cy + wallH / 2, cz); mL.rotation.y = Math.PI / 2; this.scene.add(mL); this.meshes.push(mL);
            const mR = new THREE.Mesh(g2, mat); mR.position.set(cx + w / 2, cy + wallH / 2, cz); mR.rotation.y = Math.PI / 2; this.scene.add(mR); this.meshes.push(mR);
        }
    }

    addRailing(cx, cy, cz, w, h) {
        const railMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6, roughness: 0.5 });
        const railH = 1.2;
        const g = new THREE.BoxGeometry(w, railH, 0.2);
        const r1 = new THREE.Mesh(g, railMat); r1.position.set(cx, cy + railH / 2, cz - h / 2); this.scene.add(r1); this.meshes.push(r1);
        const r2 = new THREE.Mesh(g, railMat); r2.position.set(cx, cy + railH / 2, cz + h / 2); this.scene.add(r2); this.meshes.push(r2);
    }

    buildCorridors() {
        const rooms = this.config.rooms;
        const mat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.9 });
        for (let i = 0; i < rooms.length - 1; i++) {
            const a = this.roomPositions[rooms[i].id];
            const b = this.roomPositions[rooms[i + 1].id];
            const ya = this.roomFloorY[rooms[i].id] || 0;
            const yb = this.roomFloorY[rooms[i + 1].id] || 0;
            const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            const ang = Math.atan2(b.x - a.x, b.z - a.z);
            const g = new THREE.PlaneGeometry(6, len);
            const m = new THREE.Mesh(g, mat);
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = -ang;
            m.position.set(mx, (ya + yb) / 2, mz);
            m.receiveShadow = true;
            this.scene.add(m); this.meshes.push(m);
        }
    }

    addBossWeenie(cx, cy, cz) {
        const geo = new THREE.CylinderGeometry(1.5, 2, 10, 10);
        const mat = new THREE.MeshStandardMaterial({ color: 0x552222, emissive: 0x330000, roughness: 0.8 });
        const m = new THREE.Mesh(geo, mat);
        m.position.set(cx, cy + 5, cz - 8);
        m.castShadow = true;
        this.scene.add(m); this.meshes.push(m);
        // Красные маяки
        const bGeo = new THREE.SphereGeometry(0.4, 8, 8);
        const bMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const b = new THREE.Mesh(bGeo, bMat); b.position.set(cx, cy + 10.5, cz - 8);
        this.scene.add(b); this.meshes.push(b);
    }

    roomColor(type) {
        return {
            entrance: 0x3a3a2a, hall: 0x2a2a30, circulation: 0x222228,
            boss: 0x2a1414, refuge: 0x2a3a2a, trap: 0x3a2a1a, named: 0x2a2030
        }[type] || 0x2a2a2a;
    }
    roomLight(type) {
        return {
            entrance: 0xffdd44, hall: 0x8888ff, circulation: 0x888888,
            boss: 0xff2200, refuge: 0x44ff88, trap: 0xff6600, named: 0xaa44ff
        }[type] || 0xaaaaaa;
    }

    dispose() {
        this.meshes.forEach(m => {
            this.scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) {
                (Array.isArray(m.material) ? m.material : [m.material]).forEach(mm => mm.dispose());
            }
        });
        this.meshes = [];
    }
}

// ============================================
// ВХОДНЫЕ ВОРОТА (объект в мире)
// ============================================
class DungeonGate {
    constructor(scene, config) {
        this.scene = scene;
        this.config = config;
        this.createMesh();
        this.pulse = Math.random() * Math.PI * 2;
    }
    createMesh() {
        const e = this.config.entrance;
        // Арка-ворота (Threshold по Тоттену — заклинившие под 45° для дока)
        const group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.8, metalness: 0.4 });
        const pillarGeo = new THREE.BoxGeometry(1, 6, 1);
        const pL = new THREE.Mesh(pillarGeo, mat); pL.position.set(-3, 3, 0); pL.castShadow = true; group.add(pL);
        const pR = new THREE.Mesh(pillarGeo, mat); pR.position.set(3, 3, 0); pR.castShadow = true; group.add(pR);
        const topGeo = new THREE.BoxGeometry(7, 1, 1);
        const top = new THREE.Mesh(topGeo, mat); top.position.set(0, 6, 0); top.castShadow = true;
        if (this.config.id === 'dock_3') top.rotation.z = Math.PI / 4; // заклинившие ворота
        group.add(top);

        // Светящийся портал (синее мерцание — точка интереса)
        const portalGeo = new THREE.PlaneGeometry(5, 5);
        const portalMat = new THREE.MeshBasicMaterial({
            color: 0x4488ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide
        });
        this.portal = new THREE.Mesh(portalGeo, portalMat);
        this.portal.position.set(0, 3, 0);
        group.add(this.portal);

        group.position.set(e.x, 0, e.z);
        this.scene.add(group);
        this.mesh = group;

        // Подпись
        const canvas = document.createElement('canvas');
        canvas.width = 256; canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#4488ff'; ctx.font = 'bold 16px Courier New'; ctx.textAlign = 'center';
        ctx.fillText('⛩ ' + this.config.name, 128, 20);
        ctx.fillStyle = '#ff8866'; ctx.font = '12px Courier New';
        ctx.fillText('Ур. ' + this.config.levelReq + '+', 128, 40);
        const tex = new THREE.CanvasTexture(canvas);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
        label.scale.set(8, 1.5, 1); label.position.set(0, 8, 0);
        group.add(label);
    }
    update(delta, playerPos) {
        this.pulse += delta * 3;
        this.portal.material.opacity = 0.25 + Math.sin(this.pulse) * 0.15;
        this.near = this.mesh.position.distanceTo(playerPos) < 5;
    }
}

// ============================================
// ЛОВУШКА (паровая струя / турель) с телеграфом
// ============================================
class DungeonTrap {
    constructor(scene, config, position, tag) {
        this.scene = scene;
        this.config = config;
        this.tag = tag;
        this.timer = Math.random() * config.interval;
        this.phase = 'idle'; // idle -> telegraph -> fire
        this.phaseTimer = 0;
        this.createMesh(position);
    }
    createMesh(position) {
        if (this.config.kind === 'steam_vent') {
            const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 8);
            const mat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.7 });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.position.copy(position); this.mesh.position.y += 0.15;
            this.scene.add(this.mesh);
            // Телеграф-зона (красный круг)
            const tGeo = new THREE.RingGeometry(0.3, this.config.radius, 24);
            const tMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: THREE.DoubleSide });
            this.telegraph = new THREE.Mesh(tGeo, tMat);
            this.telegraph.rotation.x = -Math.PI / 2;
            this.telegraph.position.copy(position); this.telegraph.position.y += 0.1;
            this.scene.add(this.telegraph);
            // Струя пара
            const sGeo = new THREE.CylinderGeometry(0.3, 0.8, 4, 8);
            const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
            this.steam = new THREE.Mesh(sGeo, sMat);
            this.steam.position.copy(position); this.steam.position.y += 2;
            this.scene.add(this.steam);
        } else { // turret
            const geo = new THREE.BoxGeometry(1, 1.5, 1);
            const mat = new THREE.MeshStandardMaterial({ color: 0x664422, metalness: 0.5 });
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.position.copy(position); this.mesh.position.y += 1;
            this.scene.add(this.mesh);
            const tGeo = new THREE.RingGeometry(0.3, this.config.radius, 24);
            const tMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0, side: THREE.DoubleSide });
            this.telegraph = new THREE.Mesh(tGeo, tMat);
            this.telegraph.rotation.x = -Math.PI / 2;
            this.telegraph.position.copy(position); this.telegraph.position.y += 0.1;
            this.scene.add(this.telegraph);
        }
    }
    update(delta, player) {
        this.timer += delta;
        if (this.phase === 'idle') {
            this.telegraph.material.opacity = 0;
            if (this.steam) this.steam.material.opacity = 0;
            if (this.timer >= this.config.interval) {
                this.phase = 'telegraph'; this.phaseTimer = 0; this.timer = 0;
            }
        } else if (this.phase === 'telegraph') {
            this.phaseTimer += delta;
            const p = this.phaseTimer / this.config.telegraph;
            this.telegraph.material.opacity = 0.2 + p * 0.5;
            if (this.phaseTimer >= this.config.telegraph) {
                this.phase = 'fire'; this.phaseTimer = 0;
                this.fire(player);
            }
        } else if (this.phase === 'fire') {
            this.phaseTimer += delta;
            if (this.steam) this.steam.material.opacity = 0.6 * (1 - this.phaseTimer / 0.6);
            this.telegraph.material.opacity = 0.7 * (1 - this.phaseTimer / 0.6);
            if (this.phaseTimer >= 0.6) { this.phase = 'idle'; }
        }
    }
    fire(player) {
        const dist = this.mesh.position.distanceTo(player.mesh.position);
        if (dist <= this.config.radius) {
            player.takeDamage(this.config.damage);
            game.addChatMessage(`⚠️ Ловушка! -${this.config.damage}`, 'damage');
            if (game.lootUI) game.lootUI.showDamageNumber(player.mesh.position, this.config.damage, 'normal');
        }
    }
    destroy() {
        [this.mesh, this.telegraph, this.steam].forEach(m => { if (m) this.scene.remove(m); });
    }
}

// ============================================
// ЛУТ-СУНДУК (синее мерцание)
// ============================================
class LootChest {
    constructor(scene, config, position, tag) {
        this.scene = scene;
        this.config = config;
        this.tag = tag;
        this.opened = false;
        this.bob = Math.random() * Math.PI * 2;
        this.createMesh(position);
    }
    createMesh(position) {
        const geo = new THREE.BoxGeometry(1.2, 0.9, 0.9);
        const mat = new THREE.MeshStandardMaterial({
            color: 0x886622, metalness: 0.6, roughness: 0.4,
            emissive: 0x224488, emissiveIntensity: 0.4
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(position); this.mesh.position.y += 0.5;
        this.mesh.castShadow = true;
        this.scene.add(this.mesh);
        // Синее свечение (точка интереса по дизайн-документу)
        const gGeo = new THREE.SphereGeometry(0.9, 12, 12);
        const gMat = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.2 });
        this.glow = new THREE.Mesh(gGeo, gMat);
        this.mesh.add(this.glow);
    }
    update(delta) {
        if (this.opened) { this.glow.material.opacity = 0; return; }
        this.bob += delta * 2;
        this.mesh.position.y = 0.5 + Math.sin(this.bob) * 0.1;
        this.mesh.rotation.y += delta;
        this.glow.material.opacity = 0.15 + Math.sin(this.bob * 1.5) * 0.1;
    }
    destroy() { this.scene.remove(this.mesh); }
}

// ============================================
// ЭКСПОРТ
// ============================================
/**
 * Данжи ещё не серверные: пока false, вход закрыт (canEnter), а локальные
 * выдачи наград отключены. Ставить true только вместе с серверными интентами
 * входа/наград — иначе EXP и предметы будут пропадать при синхронизации.
 */
DungeonManager.SERVER_READY = false;
window.DungeonManager = DungeonManager;
window.DungeonInstance = DungeonInstance;
window.DungeonGate = DungeonGate;
window.DungeonTrap = DungeonTrap;
window.LootChest = LootChest;
window.DUNGEON_DATABASE = DUNGEON_DATABASE;
window.DUNGEON_MOB_TEMPLATES = DUNGEON_MOB_TEMPLATES;
window.CHEST_LOOT_TABLES = CHEST_LOOT_TABLES;
window.DUNGEON_TYPES = DUNGEON_TYPES;
window.ROOM_TYPES = ROOM_TYPES;
window.INSTANCE_POCKET = INSTANCE_POCKET;