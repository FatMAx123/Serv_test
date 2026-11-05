// ============================================
// PROJECT STEAM: ORIGINS - LEVEL-SYSTEM.JS
// Система уровней Острова Стали
// Макс. уровень: 40
// EXP/SP кривая, штрафы, профессии (20, 40)
// ============================================

// ============================================
// ТАБЛИЦА ОПЫТА — Classic C1 (1–40)
// Источник: shared/l2-exp-table.js (единый с сервером)
// ============================================
const EXP_TABLE = (() => {
    if (typeof window !== 'undefined' && window.L2_EXP_TABLE && window.L2_EXP_TABLE.buildClientTable) {
        return window.L2_EXP_TABLE.buildClientTable();
    }
    // fallback если shared не загружен
    const table = [];
    let cumulative = 0;
    const FALLBACK = {
        1: 68, 2: 296, 3: 805, 4: 1716, 5: 3154, 6: 5249, 7: 8136, 8: 11955,
        9: 16851, 10: 22973, 11: 30475, 12: 39516, 13: 50261, 14: 62876,
        15: 77537, 16: 94421, 17: 113712, 18: 135596, 19: 160267, 20: 187921
    };
    for (let level = 1; level <= 40; level++) {
        const expForLevel = FALLBACK[level] != null ? FALLBACK[level]
            : Math.floor(100 * Math.pow(level, 2.8));
        table.push({
            level: level,
            expToNext: level >= 40 ? 0 : expForLevel,
            cumulativeExp: cumulative,
            spReward: 0,
            hpBonus: 0,
            mpBonus: 0,
            statPoints: 0
        });
        cumulative += (level >= 40 ? 0 : expForLevel);
    }
    return table;
})();

// ============================================
// ПРОФЕССИИ (Class Tree) — ключи = id (lowercase)
// Источник истины: shared/class-system.js (CLASS_SYSTEM)
// ============================================
function _buildClassTree() {
    if (typeof window !== 'undefined' && window.CLASS_SYSTEM && window.CLASS_SYSTEM.CLASS_TREE) {
        return window.CLASS_SYSTEM.CLASS_TREE;
    }
    // Fallback: operator + engineer base only (полный tree в shared)
    return {
        operator: {
            id: 'operator', name: 'Оператор', tier: 0, levelReq: 1, path: 'fighter',
            description: 'Новобранец Силовых цехов.',
            baseStats: { hp: 100, energy: 50, attack: 10, defense: 5, speed: 8, critRate: 15 },
            growthPerLevel: { hp: 22, energy: 8, attack: 3, defense: 2, speed: 0.1 },
            nextClasses: ['mechanic', 'destroyer', 'gunner'], parentClass: null
        },
        engineer: {
            id: 'engineer', name: 'Инженер', tier: 0, levelReq: 1, path: 'tech',
            description: 'Базовый схемный класс (Tech).',
            baseStats: { hp: 80, energy: 80, attack: 6, defense: 4, speed: 7.5, critRate: 10 },
            growthPerLevel: { hp: 16, energy: 14, attack: 1.5, defense: 1.5, speed: 0.08 },
            nextClasses: ['constructor', 'technomancer'], parentClass: null
        },
        mechanic: {
            id: 'mechanic', name: 'Механик', tier: 1, levelReq: 20, parentClass: 'operator',
            description: 'Танк/поддержка (Knight).',
            baseStats: { hp: 320, energy: 85, attack: 28, defense: 22, speed: 7, critRate: 12 },
            growthPerLevel: { hp: 38, energy: 10, attack: 4, defense: 5, speed: 0.05 },
            nextClasses: ['repair_engineer', 'boiler_guardian']
        },
        destroyer: {
            id: 'destroyer', name: 'Разрушитель', tier: 1, levelReq: 20, parentClass: 'operator',
            description: 'Ближний ДД (Warrior).',
            baseStats: { hp: 240, energy: 70, attack: 45, defense: 12, speed: 9, critRate: 18 },
            growthPerLevel: { hp: 28, energy: 8, attack: 7, defense: 2, speed: 0.1 },
            nextClasses: ['demolitionist', 'steam_berserker']
        },
        gunner: {
            id: 'gunner', name: 'Стрелок', tier: 1, levelReq: 20, parentClass: 'operator',
            description: 'Дальний бой (Rogue).',
            baseStats: { hp: 200, energy: 95, attack: 38, defense: 9, speed: 10, critRate: 22 },
            growthPerLevel: { hp: 22, energy: 12, attack: 6, defense: 1, speed: 0.15 },
            nextClasses: ['pneumatic_sniper', 'artillery_engineer']
        },
        repair_engineer: {
            id: 'repair_engineer', name: 'Инженер-Ремонтник', tier: 2, levelReq: 40, parentClass: 'mechanic',
            description: 'Поддержка (Paladin).',
            baseStats: { hp: 850, energy: 180, attack: 65, defense: 85, speed: 7.5, critRate: 12 },
            growthPerLevel: { hp: 40, energy: 12, attack: 5, defense: 6, speed: 0.05 },
            nextClasses: []
        },
        boiler_guardian: {
            id: 'boiler_guardian', name: 'Страж Котла', tier: 2, levelReq: 40, parentClass: 'mechanic',
            description: 'Танк (Dark Avenger).',
            baseStats: { hp: 1100, energy: 150, attack: 55, defense: 110, speed: 6.5, critRate: 10 },
            growthPerLevel: { hp: 55, energy: 10, attack: 4, defense: 8, speed: 0.03 },
            nextClasses: []
        },
        demolitionist: {
            id: 'demolitionist', name: 'Подрывник', tier: 2, levelReq: 40, parentClass: 'destroyer',
            description: 'AoE (Warlord).',
            baseStats: { hp: 620, energy: 140, attack: 120, defense: 35, speed: 9, critRate: 20 },
            growthPerLevel: { hp: 30, energy: 10, attack: 9, defense: 3, speed: 0.1 },
            nextClasses: []
        },
        steam_berserker: {
            id: 'steam_berserker', name: 'Берсерк Парового Молота', tier: 2, levelReq: 40, parentClass: 'destroyer',
            description: 'Melee DD (Gladiator).',
            baseStats: { hp: 780, energy: 120, attack: 105, defense: 45, speed: 10, critRate: 25 },
            growthPerLevel: { hp: 35, energy: 8, attack: 8, defense: 4, speed: 0.12 },
            nextClasses: []
        },
        pneumatic_sniper: {
            id: 'pneumatic_sniper', name: 'Снайпер-Пневматик', tier: 2, levelReq: 40, parentClass: 'gunner',
            description: 'Ranged (Hawkeye).',
            baseStats: { hp: 520, energy: 190, attack: 95, defense: 25, speed: 11, critRate: 35 },
            growthPerLevel: { hp: 24, energy: 14, attack: 8, defense: 2, speed: 0.15 },
            nextClasses: []
        },
        artillery_engineer: {
            id: 'artillery_engineer', name: 'Инженер-Артиллерист', tier: 2, levelReq: 40, parentClass: 'gunner',
            description: 'AoE ranged.',
            baseStats: { hp: 580, energy: 170, attack: 85, defense: 30, speed: 9, critRate: 20 },
            growthPerLevel: { hp: 26, energy: 12, attack: 7, defense: 3, speed: 0.1 },
            nextClasses: []
        },
        constructor: {
            id: 'constructor', name: 'Конструктор', tier: 1, levelReq: 20, parentClass: 'engineer',
            description: 'Боевой схемщик (Wizard).',
            baseStats: { hp: 180, energy: 160, attack: 18, defense: 10, speed: 7.5, critRate: 12 },
            growthPerLevel: { hp: 18, energy: 16, attack: 2, defense: 1.5, speed: 0.08 },
            nextClasses: ['pressure_sorcerer', 'machine_warlock', 'circuit_necro']
        },
        technomancer: {
            id: 'technomancer', name: 'Наладчик', tier: 1, levelReq: 20, parentClass: 'engineer',
            description: 'Ремонт/бафф (Cleric).',
            baseStats: { hp: 210, energy: 150, attack: 16, defense: 14, speed: 7.2, critRate: 10 },
            growthPerLevel: { hp: 24, energy: 14, attack: 2, defense: 2.5, speed: 0.07 },
            nextClasses: ['overhaul_master', 'protocol_prophet']
        },
        pressure_sorcerer: {
            id: 'pressure_sorcerer', name: 'Мастер Давления', tier: 2, levelReq: 40, parentClass: 'constructor',
            description: 'AoE схемы (Sorcerer).',
            baseStats: { hp: 480, energy: 320, attack: 35, defense: 28, speed: 8, critRate: 15 },
            growthPerLevel: { hp: 20, energy: 18, attack: 2, defense: 2, speed: 0.08 },
            nextClasses: []
        },
        machine_warlock: {
            id: 'machine_warlock', name: 'Дрон-Оператор', tier: 2, levelReq: 40, parentClass: 'constructor',
            description: 'Призыв машин (Warlock).',
            baseStats: { hp: 520, energy: 300, attack: 40, defense: 32, speed: 7.8, critRate: 12 },
            growthPerLevel: { hp: 22, energy: 16, attack: 2.5, defense: 2.2, speed: 0.08 },
            nextClasses: []
        },
        circuit_necro: {
            id: 'circuit_necro', name: 'Коррозионист', tier: 2, levelReq: 40, parentClass: 'constructor',
            description: 'DoT/коррозия (Necromancer).',
            baseStats: { hp: 500, energy: 310, attack: 38, defense: 30, speed: 7.6, critRate: 14 },
            growthPerLevel: { hp: 21, energy: 17, attack: 2.2, defense: 2, speed: 0.07 },
            nextClasses: []
        },
        overhaul_master: {
            id: 'overhaul_master', name: 'Мастер Переборки', tier: 2, levelReq: 40, parentClass: 'technomancer',
            description: 'Главный ремонтёр (Bishop).',
            baseStats: { hp: 600, energy: 340, attack: 30, defense: 40, speed: 7.5, critRate: 10 },
            growthPerLevel: { hp: 28, energy: 18, attack: 2, defense: 3, speed: 0.07 },
            nextClasses: []
        },
        protocol_prophet: {
            id: 'protocol_prophet', name: 'Диспетчер Протоколов', tier: 2, levelReq: 40, parentClass: 'technomancer',
            description: 'Buffer (Prophet).',
            baseStats: { hp: 560, energy: 330, attack: 32, defense: 36, speed: 7.6, critRate: 11 },
            growthPerLevel: { hp: 26, energy: 17, attack: 2, defense: 2.8, speed: 0.08 },
            nextClasses: []
        }
    };
}
const CLASS_TREE = _buildClassTree();

// ============================================
// СИСТЕМА УРОВНЕЙ
// ============================================
class LevelSystem {
    constructor(player) {
        this.player = player;
        
        // Текущее состояние
        this.level = 1;
        this.exp = 0;
        this.sp = 0;
        this.expToNext = EXP_TABLE[0].expToNext;
        this.cumulativeExp = 0;
        
        // Класс
        this.currentClass = 'operator';
        this.classTier = 0;
        this.classHistory = ['operator'];
        this.pendingTransfer = null; // важно: null, не undefined (canTransfer)
        
        // Штрафы
        this.expLossOnDeath = 0.04; // 4% от EXP до след. уровня (Formulas / C1)
        this.itemDropOnDeath = 0.05; // 5% шанс дропа предмета
        this.karma = 0;
        this.isFlagged = false;
        this.flagTimer = 0;
        
        // Бонусы
        this.expMultiplier = 1.0;
        this.spMultiplier = 1.0;
        this.restBonus = 0; // Бонус за отдых
        
        // Статистика
        this.stats = {
            totalExpGained: 0,
            totalSpGained: 0,
            deaths: 0,
            kills: 0,
            maxLevelReached: 1
        };
        
        this.init();
    }
    
    init() {
        this.recalculateStats();
        const cn = this.getClassName();
        console.log('[LevelSystem] Инициализирована. Класс: ' + cn + ', Уровень: ' + this.level);
    }
    
    // === ПОЛУЧЕНИЕ ОПЫТА ===
    
    gainExp(baseExp, mobLevel = null) {
        // Штраф/бонус по разнице уровней (hp_mp_sp_exp_formulas.md)
        let levelModifier = 1.0;
        if (mobLevel !== null) {
            if (window.L2_COMBAT && window.L2_COMBAT.expModifier) {
                levelModifier = window.L2_COMBAT.expModifier(this.level, mobLevel);
            } else {
                const above = this.level - mobLevel; // перс выше моба
                if (above >= 11) levelModifier = 0;
                else if (above >= 10) levelModifier = 0.402;
                else if (above >= 9) levelModifier = 0.482;
                else if (above >= 8) levelModifier = 0.579;
                else if (above >= 7) levelModifier = 0.694;
                else if (above >= 6) levelModifier = 0.833;
                else if (above >= 1) levelModifier = 1.0;
                else {
                    const d = mobLevel - this.level;
                    if (d >= 9) levelModifier = 1.5;
                    else if (d >= 6) levelModifier = 1.3;
                    else if (d >= 3) levelModifier = 1.1;
                    else levelModifier = 1.0;
                }
            }
        }
        
        // Бонус отдыха (L2: после отдыха +50% к опыту)
        let restModifier = 1.0;
        if (this.restBonus > 0) {
            restModifier = 1.5;
            this.restBonus--;
        }
        
        // Итоговый EXP
        const finalExp = Math.floor(
            baseExp * levelModifier * restModifier * this.expMultiplier
        );
        
        // SP — C1: с мобов, не % от level-up (shared/l2-exp-table)
        let finalSp = 0;
        if (window.L2_EXP_TABLE && window.L2_EXP_TABLE.spFromKill) {
            finalSp = Math.floor(
                window.L2_EXP_TABLE.spFromKill(finalExp, this.level, mobLevel) * this.spMultiplier
            );
        } else {
            finalSp = Math.floor(finalExp / 28 * this.spMultiplier); // ~1 SP / 28 EXP
        }

        this.exp += finalExp;
        this.sp += finalSp;
        this.cumulativeExp += finalExp;
        this.stats.totalExpGained += finalExp;
        this.stats.totalSpGained += finalSp;
        
        // Проверка уровня
        this.checkLevelUp();
        
        return { exp: finalExp, sp: finalSp, modifier: levelModifier };
    }
    
    checkLevelUp() {
        let leveled = false;
        
        while (this.level < 40 && this.exp >= this.expToNext) {
            this.exp -= this.expToNext;
            this.level++;
            leveled = true;
            
            // Обновляем EXP таблицу
            if (this.level <= 40) {
                this.expToNext = EXP_TABLE[this.level - 1].expToNext;
            }
            
            // Обновляем статистику
            this.stats.maxLevelReached = Math.max(this.stats.maxLevelReached, this.level);
            
            // Проверяем смену класса
            this.checkClassTransfer();
            
            // Пересчёт статов
            this.recalculateStats();
            
            // Изучение умений
            if (this.player.skillManager) {
                this.player.skillManager.autoLearnSkills();
                this.player.skillManager.recalculatePassives();
            }
            
            // Уведомления
            if (typeof game !== 'undefined' && game.addChatMessage) {
                game.addChatMessage(`🎉 УРОВЕНЬ ${this.level}!`, 'system');
                // L2: primary растут автоматически по классу; SP — на умения
                const spGain = EXP_TABLE[this.level - 1] ? EXP_TABLE[this.level - 1].spReward : 0;
                if (spGain > 0) {
                    game.addChatMessage('SP за уровень: проверьте окно умений (прокачка за SP).', 'loot');
                }
            }
            
            // L2 level-up VFX
            if (this.player.createLevelUpEffect) {
                this.player.createLevelUpEffect(this.level);
            }
        }
        
        // Максимальный уровень
        if (this.level >= 40) {
            this.exp = Math.min(this.exp, this.expToNext);
        }
        
        return leveled;
    }
    
    // === СМЕНА КЛАССА ===
    
    checkClassTransfer() {
        const classData = CLASS_TREE[this.currentClass];
        if (!classData) return;
        
        // 1st профессия на 20 уровне
        if (this.level === 20 && classData.tier === 0) {
            this.promptFirstTransfer();
        }
        
        // 2nd профессия на 40 уровне
        if (this.level === 40 && classData.tier === 1) {
            this.promptSecondTransfer();
        }
    }
    
    promptFirstTransfer() {
        const classData = CLASS_TREE[this.currentClass];
        const options = classData.nextClasses;
        
        game.addChatMessage('⚙️ СЕРТИФИКАЦИЯ ДОСТУПНА!', 'system');
        game.addChatMessage('Выберите профессию:', 'system');
        
        options.forEach((classId, i) => {
            const cls = CLASS_TREE[classId];
            game.addChatMessage(`  [${i + 1}] ${cls.name} — ${cls.description}`, 'system');
        });
        
        this.pendingTransfer = {
            tier: 1,
            options: options
        };
    }
    
    promptSecondTransfer() {
        const classData = CLASS_TREE[this.currentClass];
        const options = classData.nextClasses;
        
        game.addChatMessage('⚙️ ВТОРАЯ СЕРТИФИКАЦИЯ!', 'system');
        game.addChatMessage('Выберите финальную специализацию:', 'system');
        
        options.forEach((classId, i) => {
            const cls = CLASS_TREE[classId];
            game.addChatMessage(`  [${i + 1}] ${cls.name} — ${cls.description}`, 'system');
        });
        
        this.pendingTransfer = {
            tier: 2,
            options: options
        };
    }
    
    performClassTransfer(choiceIndex) {
        if (!this.pendingTransfer) return false;
        
        const options = this.pendingTransfer.options;
        if (choiceIndex < 0 || choiceIndex >= options.length) return false;
        
        const newClassId = options[choiceIndex];
        const newClass = CLASS_TREE[newClassId];
        if (!newClass) return false;

        // Смена класса — только сервер (применение приходит пакетом)
        if (window.game && window.game.net && window.game.net.intentClassTransfer) {
            window.game.net.intentClassTransfer(newClassId);
            return true;
        }
        if (window.game && window.game.addChatMessage) {
            window.game.addChatMessage('Нет связи с сервером — смена класса недоступна.', 'system');
        }
        return false;
    }
    
    // === ШТРАФЫ ЗА СМЕРТЬ (L2 Classic) ===
    
    onDeath() {
        // Online: server applies death penalty via you_died. Do not double-penalize.
        const net = window.game && window.game.net;
        if (net && (net.status === 'online' || net.connected)) {
            this.stats.deaths++;
            return;
        }

        this.stats.deaths++;

        const levelBefore = this.level;
        const pct = (window.L2_COMBAT && window.L2_COMBAT.DEATH_EXP_LOSS_PCT != null)
          ? window.L2_COMBAT.DEATH_EXP_LOSS_PCT : this.expLossOnDeath;

        // L2: −4% expToNext + delevel if bar insufficient
        let result = null;
        const ET = window.L2_EXP_TABLE;
        if (ET && typeof ET.applyDeathExpLoss === 'function') {
            result = ET.applyDeathExpLoss(this.level, this.exp, pct);
        } else if (window.L2_COMBAT && typeof window.L2_COMBAT.applyDeathExp === 'function') {
            result = window.L2_COMBAT.applyDeathExp(this.level, this.exp, pct, ET);
        }
        if (result) {
            this.level = result.level;
            this.exp = result.exp;
            this.expToNext = result.expToNext != null
              ? result.expToNext
              : (ET && ET.expToNext ? ET.expToNext(this.level) : this.expToNext);
        } else {
            let expLoss = Math.floor(this.expToNext * pct);
            this.exp = Math.max(0, this.exp - expLoss);
            result = { loss: expLoss, delevels: 0 };
        }

        const bits = [];
        if (result.loss > 0) bits.push('−' + result.loss.toLocaleString() + ' EXP');
        if (result.delevels > 0) bits.push('ур. ' + levelBefore + '→' + this.level);
        if (bits.length) {
            game.addChatMessage('Штраф: ' + bits.join(' · '), 'damage');
        }

        // Item drop only after Lucky range (check pre-death level)
        const keepUntil = (window.game && window.game.player && window.game.player.passiveBonuses
          && window.game.player.passiveBonuses.deathKeepItemsUntilLevel) || 0;
        if (levelBefore > keepUntil && Math.random() < this.itemDropOnDeath) {
            this.dropRandomItem();
        }
        
        // Карма (если был флаг)
        if (this.isFlagged) {
            this.karma += 100;
            game.addChatMessage(`Карма: +100 (Всего: ${this.karma})`, 'damage');
        }
        
        // Сброс флагов
        this.isFlagged = false;
        this.flagTimer = 0;
        
        // Пересчёт статов
        this.recalculateStats();
    }
    
    dropRandomItem() {
        // Дроп случайного предмета из инвентаря (не экипировка)
        const inventory = game.inventory;
        if (!inventory) return;
        
        const items = inventory.slots.filter(s => s !== null);
        if (items.length === 0) return;
        
        const randomItem = items[Math.floor(Math.random() * items.length)];
        
        // Удаляем предмет
        inventory.removeItemByUID(randomItem.uid);
        
        game.addChatMessage(
            `💥 Потерян предмет: ${randomItem.name}!`,
            'damage'
        );
    }
    
    // === KARMA & FLAG (PvP) ===
    
    setFlagged(duration = 300) {
        this.isFlagged = true;
        this.flagTimer = duration;
        game.addChatMessage('🚩 Вы атаковали игрока! Флаг на 5 минут.', 'damage');
    }
    
    addKarma(amount) {
        this.karma += amount;
        game.addChatMessage(`Карма: +${amount} (Всего: ${this.karma})`, 'damage');
    }
    
    reduceKarma(amount) {
        this.karma = Math.max(0, this.karma - amount);
        if (this.karma === 0) {
            game.addChatMessage('Карма очищена.', 'loot');
        }
    }
    
    update(delta) {
        // Флаг таймер
        if (this.isFlagged) {
            this.flagTimer -= delta;
            if (this.flagTimer <= 0) {
                this.isFlagged = false;
                game.addChatMessage('Флаг снят.', 'system');
            }
        }
    }
    
    // === РАСЧЁТ СТАТОВ ===
    // Источник истины: CLASS_SYSTEM.statsAtLevel (PRIMARY → combat как L2).
    // Инвентарь только добавляет gear; НЕ затирает классовые статы.
    
    recalculateStats() {
        // Синхронизируем класс/уровень на player до пересчёта
        if (this.player) {
            this.player.level = this.level;
            this.player.playerClass = this.currentClass;
            this.player.sp = this.sp;
        }

        // 1) пассивки → 2) pullL2Stats (primary + gear + passives)
        if (this.player && this.player.skillManager) {
            this.player.skillManager.recalculatePassives();
        }
        if (this.player && typeof this.player.pullL2Stats === 'function') {
            this.player.pullL2Stats();
        } else {
            // fallback без pullL2Stats
            const classData = CLASS_TREE[this.currentClass];
            if (classData && window.CLASS_SYSTEM && window.CLASS_SYSTEM.statsAtLevel) {
                const st = window.CLASS_SYSTEM.statsAtLevel(this.currentClass, this.level);
                this.player.maxHp = st.maxHp;
                this.player.maxEnergy = st.maxEnergy;
                this.player.pAtk = st.pAtk;
                this.player.pDef = st.pDef;
                this.player.cAtk = st.cAtk;
                this.player.cDef = st.cDef;
                this.player.attackPower = st.pAtk;
                this.player.defense = st.pDef;
                this.player.primary = st.primary;
                this.player.critRate = st.critRate;
                this.player.critChance = (st.critRate || 4) / 100;
                this.player.accuracy = st.accuracy;
                this.player.evasion = st.evasion;
                this.player.moveSpeed = st.speed;
            }
        }

        // Инвентарь: только пересчитать gear-бонусы через pullL2Stats (если есть hook)
        if (typeof game !== 'undefined' && game.inventory && typeof game.inventory.applyGearToPlayer === 'function') {
            game.inventory.applyGearToPlayer();
        }

        this.player.hp = Math.min(this.player.hp, this.player.maxHp);
        this.player.energy = Math.min(this.player.energy, this.player.maxEnergy);
    }
    
    // === ОТДЫХ (L2 Classic) ===
    
    startRest() {
        this.restBonus = 100; // 100 мобов с бонусом
        game.addChatMessage('Отдых начат. Следующие 100 мобов дадут +50% опыта.', 'system');
    }
    
    // === ПОЛУЧЕНИЕ ИНФОРМАЦИИ ===
    
    getExpPercent() {
        return (this.exp / this.expToNext) * 100;
    }
    
    getClassData() {
        return CLASS_TREE[this.currentClass];
    }
    
    getClassName() {
        const c = CLASS_TREE[this.currentClass];
        return (c && c.name) || this.currentClass || '—';
    }
    
    canTransfer() {
        return !!(this.pendingTransfer && Array.isArray(this.pendingTransfer.options) && this.pendingTransfer.options.length);
    }
    
    getAvailableClasses() {
        // pending transfer options (сервер / prompt) — приоритет
        if (this.pendingTransfer && Array.isArray(this.pendingTransfer.options)) {
            return this.pendingTransfer.options
                .map(id => CLASS_TREE[id] || (window.CLASS_SYSTEM && window.CLASS_SYSTEM.getClass(id)))
                .filter(Boolean);
        }
        const classData = CLASS_TREE[this.currentClass];
        if (!classData || !classData.nextClasses) return [];
        return classData.nextClasses.map(id => CLASS_TREE[id]).filter(Boolean);
    }
    
    // === СЕРИАЛИЗАЦИЯ ===
    
    serialize() {
        return {
            level: this.level,
            exp: this.exp,
            sp: this.sp,
            expToNext: this.expToNext,
            cumulativeExp: this.cumulativeExp,
            currentClass: this.currentClass,
            classTier: this.classTier,
            classHistory: this.classHistory,
            karma: this.karma,
            stats: this.stats,
            restBonus: this.restBonus
        };
    }
    
    deserialize(data) {
        this.level = data.level || 1;
        this.exp = data.exp || 0;
        this.sp = data.sp || 0;
        this.expToNext = data.expToNext || EXP_TABLE[0].expToNext;
        this.cumulativeExp = data.cumulativeExp || 0;
        this.currentClass = data.currentClass || 'operator';
        this.classTier = data.classTier || 0;
        this.classHistory = data.classHistory || ['operator'];
        this.karma = data.karma || 0;
        this.stats = data.stats || this.stats;
        this.restBonus = data.restBonus || 0;
        
        this.recalculateStats();
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.LevelSystem = LevelSystem;
window.EXP_TABLE = EXP_TABLE;
window.CLASS_TREE = CLASS_TREE;