// ============================================
// PROJECT STEAM: ORIGINS - LOOT.JS
// Система дропа и лута в классическом MMO стиле
// Таблицы дропа, грейды, редкость, spoil,
// drop на землю, защита лута, party loot,
// death penalty drop
// ============================================

// ============================================
// РЕДКОСТЬ ПРЕДМЕТОВ (Classic C1)
// ============================================
const ITEM_RARITY = {
    COMMON: {
        id: 'common',
        name: 'Обычный',
        color: '#aaaaaa',
        dropMult: 1.0,
        glow: null
    },
    UNCOMMON: {
        id: 'uncommon',
        name: 'Необычный',
        color: '#44ff44',
        dropMult: 0.5,
        glow: 0x44ff44
    },
    RARE: {
        id: 'rare',
        name: 'Редкий',
        color: '#4488ff',
        dropMult: 0.15,
        glow: 0x4488ff
    },
    EPIC: {
        id: 'epic',
        name: 'Эпический',
        color: '#aa44ff',
        dropMult: 0.03,
        glow: 0xaa44ff
    },
    LEGENDARY: {
        id: 'legendary',
        name: 'Легендарный',
        color: '#ffaa44',
        dropMult: 0.005,
        glow: 0xffaa44
    },
    MYTHIC: {
        id: 'mythic',
        name: 'Мифический',
        color: '#ff4444',
        dropMult: 0.001,
        glow: 0xff4444
    }
};

// ============================================
// ТИПЫ ДРОПА
// ============================================
const DROP_TYPES = {
    ADENA: 'adena',           // Медные детали (валюта)
    ITEM: 'item',            // Предмет
    MATERIAL: 'material',    // Материалы для крафта
    RECIPE: 'recipe',        // Чертежи
    ENCHANT: 'enchant',      // Усилители давления
    CRYSTAL: 'crystal',      // Кристаллы пара (разборка)
    SPOIL: 'spoil',          // Доп. лут от Spoil
    EVENT: 'event'           // Событийный лут
};

// ============================================
// ГЛОБАЛЬНЫЕ МОДИФИКАТОРЫ ДРОПА
// Source of truth: shared/loot-rules.js LOOT_CONFIG.
// DROP_CONFIG — UI/ground-item knobs + mirror live rates.
// ============================================
function _lootCfg() {
    return (window.LOOT_RULES && window.LOOT_RULES.LOOT_CONFIG) || null;
}
const DROP_CONFIG = {
    BASE_DROP_RATE: 1.0,
    ADENA_DROP_RATE: 1.0,
    SPOIL_RATE: 0.7,
    DROP_PROTECTION_TIME: 30,
    DROP_LIFETIME: 180,          // sync LOOT_CONFIG (was 120)
    DROP_RADIUS: 2,
    // Pickup range (must match server LOOT_PICKUP_RANGE ~4.5). No client auto-inv.
    AUTO_LOOT_RANGE: 4.5,
    // false = manual only (click / action «Подобрать»). true = auto-intent in range.
    AUTO_PICKUP_INTENT: false,
    DEATH_DROP_CHANCE: 0.03,     // offline stub; online = shared/death-rules.js
    DEATH_DROP_PENALTY: 0.10,    // sync LOOT_CONFIG.DEATH_EXP_LOSS
    LEVEL_DIFF_PENALTY: 9,
    CRIT_DROP_CHANCE: 0.03,      // sync LOOT_CONFIG
    // Boss tables already final → mults 1.0 / rare luck 1.5 (see LOOT_CONFIG)
    BOSS_DROP_MULT: 1.0,
    BOSS_ADENA_MULT: 1.0,
    BOSS_RARE_MULT: 1.5,
    EVENT_DROP_MULT: 2.0,
    EVENT_ADENA_MULT: 2.0
};
// Pull live values if LOOT_RULES already loaded
(function syncDropConfigFromRules() {
    const C = _lootCfg();
    if (!C) return;
    DROP_CONFIG.BASE_DROP_RATE = C.BASE_DROP_RATE;
    DROP_CONFIG.ADENA_DROP_RATE = C.BASE_ADENA_RATE;
    DROP_CONFIG.SPOIL_RATE = C.SPOIL_BASE_CHANCE;
    DROP_CONFIG.DROP_PROTECTION_TIME = C.DROP_PROTECTION_TIME;
    DROP_CONFIG.DROP_LIFETIME = C.DROP_LIFETIME;
    DROP_CONFIG.DEATH_DROP_CHANCE = C.DEATH_ITEM_DROP;
    DROP_CONFIG.DEATH_DROP_PENALTY = C.DEATH_EXP_LOSS;
    DROP_CONFIG.CRIT_DROP_CHANCE = C.CRIT_DROP_CHANCE;
    DROP_CONFIG.BOSS_DROP_MULT = C.BOSS_DROP_MULT;
    DROP_CONFIG.BOSS_ADENA_MULT = C.BOSS_ADENA_MULT;
    DROP_CONFIG.BOSS_RARE_MULT = C.BOSS_RARE_MULT;
    DROP_CONFIG.EVENT_DROP_MULT = C.EVENT_DROP_MULT;
    DROP_CONFIG.EVENT_ADENA_MULT = C.EVENT_ADENA_MULT;
})();

// ============================================
// LEGACY MOB_DROP_TABLES — DEPRECATED (empty)
// Live tables: shared/loot-rules.js → LOOT_RULES.MOB_LOOT_TABLES
// generateDrop / attemptSpoil proxy to LOOT_RULES when available.
// ============================================
const MOB_DROP_TABLES = Object.create(null);

// ============================================
// МЕНЕДЖЕР ДРОПА
// ============================================
class LootManager {
    constructor(scene) {
        this.scene = scene;
        this.groundItems = []; // Предметы на земле (server-synced by lid)
        this.byLid = new Map(); // lid -> GroundItem
        this.pendingPickup = new Set(); // lids awaiting server ok
        this.lootProtection = new Map(); // mobId -> { playerId, timestamp }
        this.eventDropMult = 1.0;
        this.localPid = null;
        
        this.init();
    }
    
    init() {
        console.log('[Loot] Ground loot: server-authoritative (no auto-inv)');
    }

    setLocalPid(pid) {
        this.localPid = pid != null ? +pid : null;
    }

    /**
     * Server loot_spawn / snapshot entry.
     * @returns {boolean} true if a new pile was created (for chat dedupe)
     */
    applyServerSpawn(msg) {
        if (!msg || msg.lid == null) return false;
        const lid = +msg.lid;
        if (this.byLid.has(lid)) return false;
        if (!this.scene) {
            console.warn('[Loot] no scene, cannot spawn lid', lid);
            return false;
        }

        const x = +msg.x || 0;
        const z = +msg.z || 0;
        const y = this._groundY(x, z);
        const pos = new THREE.Vector3(x, y, z);
        const drop = {
            type: (msg.itemId === 'copper_parts') ? DROP_TYPES.ADENA : DROP_TYPES.ITEM,
            itemId: msg.itemId,
            amount: msg.count || 1,
            rarity: this._rarityGuess(msg.itemId),
            lid: lid,
            ownerPid: msg.ownerPid != null ? +msg.ownerPid : null,
            ownerPartyId: msg.ownerPartyId != null ? msg.ownerPartyId : null,
            winnerPid: msg.winnerPid != null ? +msg.winnerPid : null,
            protectUntil: msg.protectUntil || 0,
            expireAt: msg.expireAt || 0,
            spoil: !!msg.spoil,
            name: msg.name || null,
            plus: msg.plus | 0,
            deathDrop: !!msg.deathDrop
        };
        try {
            const gi = new GroundItem(this.scene, drop, pos, drop.ownerPid);
            gi.lid = lid;
            gi.serverSynced = true;
            gi.baseY = y;
            // tag mesh tree for raycast pick and hover
            gi.mesh.userData.groundLoot = true;
            gi.mesh.userData.lootLid = lid;
            gi.mesh.userData.groundItem = gi;
            gi.mesh.traverse((o) => {
                o.userData.groundLoot = true;
                o.userData.lootLid = lid;
                o.userData.groundItem = gi;
            });
            this.groundItems.push(gi);
            this.byLid.set(lid, gi);
            return true;
        } catch (e) {
            console.error('[Loot] spawn failed', lid, msg.itemId, e);
            return false;
        }
    }

    /** Raycast-friendly list of ground loot roots */
    getLootMeshes() {
        const out = [];
        for (let i = 0; i < this.groundItems.length; i++) {
            const gi = this.groundItems[i];
            if (gi && gi.mesh) out.push(gi.mesh);
        }
        return out;
    }

    /** Pick by lid (from raycast userData) */
    requestPickupByLid(lid) {
        const gi = this.byLid.get(+lid);
        if (gi) this.requestPickup(gi);
    }

    applyServerRemove(lid, opts) {
        opts = opts || {};
        lid = +lid;
        this.pendingPickup.delete(lid);
        const gi = this.byLid.get(lid);
        if (!gi) return;
        this.byLid.delete(lid);
        const idx = this.groundItems.indexOf(gi);
        if (idx >= 0) this.groundItems.splice(idx, 1);
        if (opts.effect !== false) {
            try { if (gi.createPickupEffect) gi.createPickupEffect(); } catch (e) { /* ignore */ }
        }
        if (window.game && typeof window.game.onLootRemoved === 'function') {
            window.game.onLootRemoved(lid);
        }
        gi.destroy();
    }

    /**
     * Lineage 2 classic drop display text: e.g. "Медные детали(21)" or "Железный лом".
     */
    getLootDisplayName(gi) {
        if (!gi || !gi.drop) return '';
        const drop = gi.drop;
        let name = drop.name;
        if (!name && drop.itemId) {
            if (drop.itemId === 'copper_parts' || drop.type === DROP_TYPES.ADENA) {
                name = 'Медные детали';
            } else if (window.game && window.game.net && typeof window.game.net._itemName === 'function') {
                name = window.game.net._itemName(drop.itemId);
            } else {
                const db = window.ITEM_DATABASE || {};
                const t = db[drop.itemId] || db[String(drop.itemId).toUpperCase()];
                name = (t && t.name) || null;
            }
        }
        if (!name) {
            if (drop.itemId === 'copper_parts' || drop.type === DROP_TYPES.ADENA) {
                name = 'Медные детали';
            } else {
                name = drop.itemId || 'Предмет';
            }
        }
        if (drop.plus && drop.plus > 0) {
            name = '+' + drop.plus + ' ' + name;
        }
        const amt = drop.amount != null ? drop.amount : 1;
        if (amt > 1) {
            return name + '(' + amt + ')';
        }
        return name;
    }

    applySnapshot(loots) {
        (loots || []).forEach((L) => this.applyServerSpawn(L));
    }

    _rarityGuess(itemId) {
        const tpl = (typeof ITEM_DATABASE !== 'undefined' && ITEM_DATABASE[itemId]) ||
            (typeof LOOT_ITEMS !== 'undefined' && LOOT_ITEMS[itemId]);
        if (!tpl) return 'common';
        const g = String(tpl.grade || '').toLowerCase();
        if (g === 'c' || g === 'b') return 'rare';
        if (g === 'a' || g === 's') return 'epic';
        if (tpl.type === 'recipe' || tpl.type === 'enchant') return 'uncommon';
        if (tpl.type === 'crystal') return 'uncommon';
        return 'common';
    }

    _groundY(x, z) {
        try {
            const T = window.Terrain;
            if (T) {
                if (typeof T.standY === 'function') {
                    const s = T.standY(x, z);
                    if (s != null && isFinite(s)) return s + 0.12;
                }
                if (typeof T.heightAt === 'function') {
                    const h = T.heightAt(x, z);
                    if (h != null && isFinite(h)) return h + 0.12;
                }
            }
            if (window.game && typeof window.game.heightAt === 'function') {
                const h2 = window.game.heightAt(x, z);
                if (h2 != null && isFinite(h2)) return h2 + 0.12;
            }
            // fallback: near local player feet
            if (window.game && game.player && game.player.mesh) {
                return game.player.mesh.position.y + 0.05;
            }
        } catch (e) { /* ignore */ }
        return 0.5;
    }

    /** Request server pickup (no local inventory mutation). */
    requestPickup(groundItem) {
        if (!groundItem) return;
        const lid = groundItem.lid != null ? groundItem.lid : (groundItem.drop && groundItem.drop.lid);
        if (lid == null) {
            // Offline/local-only drop (dev) — legacy local add
            this._legacyLocalPickup(groundItem);
            return;
        }
        if (this.pendingPickup.has(+lid)) return;
        if (!this._canLootLocal(groundItem)) {
            if (window.game && game.addChatMessage) {
                game.addChatMessage('Лут защищён. Подождите.', 'system');
            }
            return;
        }
        this.pendingPickup.add(+lid);
        if (window.game && game.net && game.net.intentLootPickup) {
            game.net.intentLootPickup(+lid);
        } else {
            this.pendingPickup.delete(+lid);
            if (window.game && game.addChatMessage) {
                game.addChatMessage('Нет связи с сервером — подбор невозможен.', 'system');
            }
        }
    }

    _canLootLocal(gi) {
        const drop = gi.drop || {};
        const localPid = this.localPid != null ? this.localPid : (window.game && window.game.net && window.game.net.pid);
        const owner = drop.ownerPid != null ? +drop.ownerPid : (gi.owner != null ? +gi.owner : null);
        const winner = drop.winnerPid != null ? +drop.winnerPid : null;

        // Если лут без владельца, либо мы владелец (киллер), либо победитель пати
        if (owner == null || owner === localPid || (winner != null && winner === localPid)) return true;

        // Если мы в пати с владельцем или победителем — разрешаем подбор/проверку на сервере
        const net = window.game && window.game.net;
        const party = (net && Array.isArray(net.party)) ? net.party : null;
        if (party && party.length > 0) {
            // Spoil защищён строго за спойлером
            if (drop.spoil) {
                if (owner !== localPid && drop.protectUntil && Date.now() < drop.protectUntil) {
                    return false;
                }
            }
            const isPartyDrop = party.some(m => m && (m.pid === owner || (winner != null && m.pid === winner))) ||
                                (drop.ownerPartyId != null && net.partyLeader != null);
            if (isPartyDrop) return true;
        }

        const until = drop.protectUntil || 0;
        if (until && Date.now() < until) return false;
        return true;
    }

    _legacyLocalPickup(groundItem) {
        // Offline fallback only
        this.pickupItem(groundItem, window.game && game.player);
        const idx = this.groundItems.indexOf(groundItem);
        if (idx >= 0) this.groundItems.splice(idx, 1);
        this.pendingPickup.delete(groundItem.lid);
    }
    
    // === ГЕНЕРАЦИЯ ДРОПА ПРИ УБИЙСТВЕ ===
    // Авторитет: server → LOOT_RULES.rollMobLoot. Клиентский generateDrop —
    // только offline/preview; те же таблицы и mults, без dual economy.
    
    generateDrop(mob, killer) {
        const template = mob.template || mob;
        const mobId = (template && template.id) || mob.mobId || mob.id;
        if (!mobId) return [];

        const LR = window.LOOT_RULES;
        if (LR && typeof LR.rollMobLoot === 'function') {
            const pl = (killer && (killer.level || (killer.levelSystem && killer.levelSystem.level))) || 1;
            const ml = mob.level || (template && template.level && template.level[0]) || pl;
            const rolled = LR.rollMobLoot(mobId, pl, ml, {
                boss: !!(mob.boss || template.boss || (template.role === 'raid') || (template.role === 'field_rb')),
                event: !!(mob.eventId || template.event)
            });
            const drops = [];
            if (rolled.adena > 0) {
                drops.push({
                    type: DROP_TYPES.ADENA,
                    itemId: 'copper_parts',
                    amount: rolled.adena,
                    rarity: 'common'
                });
            }
            (rolled.items || []).forEach((it) => {
                drops.push({
                    type: DROP_TYPES.ITEM,
                    itemId: it.id,
                    amount: it.count,
                    rarity: (LR.gradeOf && LR.gradeOf(it.id)) || 'common'
                });
            });
            if (rolled.crit && drops.length && typeof game !== 'undefined' && game.addChatMessage) {
                game.addChatMessage('✨ КРИТИЧЕСКИЙ ДРОП! x2 предметы!', 'loot');
            }
            return drops;
        }

        // Fallback: no LOOT_RULES loaded — empty (do not invent fat legacy tables)
        console.warn('[Loot] LOOT_RULES missing; generateDrop returns [] for', mobId);
        return [];
    }

    // === SPOIL (ВСКРЫТИЕ КОРПУСА) ===
    
    /**
     * Offline preview only. Online: skill op_scrap_collect marks live mob;
     * server grants spoil mats on death (reward.spoil).
     */
    attemptSpoil(mob, player) {
        const template = mob.template || mob;
        const mobId = (template && template.id) || mob.mobId || mob.id;
        if (!mobId) return null;

        // L2 Spoil: mark live target (server path is authoritative)
        if (mob.hp != null && mob.hp <= 0) {
            if (typeof game !== 'undefined' && game.addChatMessage) {
                game.addChatMessage('Помечайте живой механизм скиллом «Вскрытие корпуса».', 'system');
            }
            return null;
        }
        if (mob.spoilMarked || mob.spoiled) {
            if (typeof game !== 'undefined' && game.addChatMessage) {
                game.addChatMessage('Корпус уже помечен.', 'system');
            }
            return null;
        }

        const LR = window.LOOT_RULES;
        if (LR && LR.MOB_LOOT_TABLES && LR.MOB_LOOT_TABLES[mobId]) {
            const T = LR.MOB_LOOT_TABLES[mobId];
            if (!T.spoil || T.spoil.chance === 0) {
                if (typeof game !== 'undefined' && game.addChatMessage) {
                    game.addChatMessage('Этот механизм нельзя вскрыть.', 'system');
                }
                return null;
            }
            mob.spoilMarked = true;
            if (typeof game !== 'undefined' && game.addChatMessage) {
                game.addChatMessage('Корпус помечен. Добыча — после уничтожения.', 'loot');
            }
            return [];
        }

        if (typeof game !== 'undefined' && game.addChatMessage) {
            game.addChatMessage('Этот механизм нельзя вскрыть.', 'system');
        }
        return null;
    }

    // === СПАВН ПРЕДМЕТОВ НА ЗЕМЛЕ ===
    
    spawnDrops(drops, position, owner = null) {
        drops.forEach((drop, index) => {
            // Случайное смещение
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * DROP_CONFIG.DROP_RADIUS,
                0,
                (Math.random() - 0.5) * DROP_CONFIG.DROP_RADIUS
            );
            
            const itemPos = position.clone().add(offset);
            
            const groundItem = new GroundItem(
                this.scene,
                drop,
                itemPos,
                owner
            );
            groundItem.mesh.userData.groundLoot = true;
            groundItem.mesh.userData.groundItem = groundItem;
            groundItem.mesh.traverse((o) => {
                o.userData.groundLoot = true;
                o.userData.groundItem = groundItem;
            });
            this.groundItems.push(groundItem);
        });
    }
    
    // === ПОДБОР ПРЕДМЕТОВ (server authority) ===
    
    update(delta, playerPosition, player) {
        for (let i = this.groundItems.length - 1; i >= 0; i--) {
            const item = this.groundItems[i];
            if (!item || !item.mesh) {
                this.groundItems.splice(i, 1);
                continue;
            }

            item.update(delta);

            // Server owns despawn; client only removes on loot_remove.
            // Local expire is visual safety if packet lost.
            if (item.serverSynced && item.drop && item.drop.expireAt && Date.now() > item.drop.expireAt + 2000) {
                this.applyServerRemove(item.lid);
                continue;
            }

            // Auto-intent pickup when in range (still server-validated)
            if (!DROP_CONFIG.AUTO_PICKUP_INTENT) continue;
            if (!this._canLootLocal(item)) continue;
            const lid = item.lid;
            if (lid == null || this.pendingPickup.has(+lid)) continue;
            const dist = item.mesh.position.distanceTo(playerPosition);
            if (dist < DROP_CONFIG.AUTO_LOOT_RANGE) {
                this.requestPickup(item);
            }
        }
    }

    /**
     * Click / UI pickup — always goes through server when lid present.
     * Does NOT mutate inventory itself.
     */
    pickupItem(groundItem, player) {
        this.requestPickup(groundItem);
    }
    
    // === ЗАЩИТА ЛУТА (L2 Classic) ===
    
    setLootProtection(mobId, playerId) {
        this.lootProtection.set(mobId, {
            playerId: playerId,
            timestamp: Date.now()
        });
    }
    
    checkLootProtection(mobId, playerId) {
        const protection = this.lootProtection.get(mobId);
        if (!protection) return true;
        
        // Проверка времени
        const elapsed = (Date.now() - protection.timestamp) / 1000;
        if (elapsed > DROP_CONFIG.DROP_PROTECTION_TIME) {
            this.lootProtection.delete(mobId);
            return true;
        }
        
        // Тот же игрок
        return protection.playerId === playerId;
    }
    
    // === PARTY LOOT ===
    // Режим распределения считает СЕРВЕР: победитель пачки фиксируется в момент
    // падения (spawnGroundLoot → pickLootWinner) и проверяется в canPickupLoot.
    // Клиентские distributePartyLoot / roundRobinLoot / randomLoot / byDamageLoot
    // были мёртвым кодом — их никто не вызывал, а решать «кому лут» на клиенте в
    // server-authority модели нельзя. Режим приходит в пакете `party`
    // (net.partyLootMode), меняется командой /loot (только лидер).

    // === ДРОП ПРИ СМЕРТИ ИГРОКА ===
    // Онлайн: авторитет сервера (you_died + death-rules: PLAYER/KARMA).
    // Здесь — только offline/local stub.
    
    onPlayerDeath(player) {
        // Server authority: online death is handled by net-ws `you_died`
        const net = window.game && window.game.net;
        if (net && (net.status === 'online' || net.connected)) return;

        if (!player || !player.levelSystem) return;
        const inventory = game.inventory;
        const ls = player.levelSystem;
        const levelBefore = ls.level || player.level || 1;
        const pct = (window.L2_COMBAT && window.L2_COMBAT.DEATH_EXP_LOSS_PCT != null)
            ? window.L2_COMBAT.DEATH_EXP_LOSS_PCT
            : 0.04;

        // L2: 4% expToNext + delevel if bar insufficient
        let result = null;
        const ET = window.L2_EXP_TABLE;
        if (ET && typeof ET.applyDeathExpLoss === 'function') {
            result = ET.applyDeathExpLoss(levelBefore, ls.exp || 0, pct);
        } else if (window.L2_COMBAT && typeof window.L2_COMBAT.applyDeathExp === 'function') {
            result = window.L2_COMBAT.applyDeathExp(levelBefore, ls.exp || 0, pct, ET);
        }
        if (result) {
            ls.level = result.level;
            ls.exp = result.exp;
            if (result.expToNext != null) ls.expToNext = result.expToNext;
            else if (ET && ET.expToNext) ls.expToNext = ET.expToNext(result.level);
        } else {
            const expToNext = ls.expToNext || 0;
            let expLoss = Math.floor(expToNext * pct);
            expLoss = Math.min(expLoss, Math.max(0, ls.exp | 0));
            ls.exp = Math.max(0, (ls.exp | 0) - expLoss);
            result = { loss: expLoss, delevels: 0, level: ls.level };
        }
        if (typeof ls.recalculateStats === 'function') ls.recalculateStats();
        if (typeof player.syncFromLevelSystem === 'function') player.syncFromLevelSystem();

        const bits = [];
        if (result.loss > 0) bits.push('−' + result.loss.toLocaleString() + ' EXP');
        if (result.delevels > 0) bits.push('ур. ' + levelBefore + '→' + result.level);
        if (bits.length) game.addChatMessage('Штраф: ' + bits.join(' · '), 'damage');

        // Lucky: keep items until deathKeepItemsUntilLevel (default 4 → drop from 5+)
        const keepUntil = (player.passiveBonuses && player.passiveBonuses.deathKeepItemsUntilLevel) || 0;
        const canDropItems = levelBefore > keepUntil;
        if (canDropItems && inventory && Math.random() < DROP_CONFIG.DEATH_DROP_CHANCE) {
            this.dropRandomInventoryItem(player);
        } else if (!canDropItems && keepUntil > 0) {
            game.addChatMessage(
                `🍀 Везение: вещи сохранены (до ур.${keepUntil}).`,
                'system'
            );
        }

        // Карма
        if (ls.isFlagged && typeof ls.addKarma === 'function') {
            ls.addKarma(100);
        }
    }
    
    dropRandomInventoryItem(player) {
        const inventory = game.inventory;
        const items = inventory.slots.filter(s => s !== null);
        
        if (items.length === 0) return;
        
        // Случайный предмет (не экипировка)
        const randomItem = items[Math.floor(Math.random() * items.length)];
        
        // Удаляем из инвентаря
        inventory.removeItemByUID(randomItem.uid);
        
        // Спавним на земле
        const drop = {
            type: DROP_TYPES.ITEM,
            itemId: randomItem.templateId,
            amount: randomItem.count,
            rarity: 'common'
        };
        
        this.spawnDrops([drop], player.mesh.position, null);
        
        game.addChatMessage(
            `💥 Потерян предмет: ${randomItem.name}!`,
            'damage'
        );
    }
    
    // === МОДИФИКАТОРЫ ===
    
    getLevelDropModifier(playerLevel, mobLevel) {
        const diff = mobLevel - playerLevel;
        
        if (diff > DROP_CONFIG.LEVEL_DIFF_PENALTY) {
            return 1.5; // Бонус за сильного
        } else if (diff > 3) {
            return 1.2;
        } else if (diff >= -3) {
            return 1.0;
        } else if (diff >= -6) {
            return 0.7;
        } else if (diff >= -DROP_CONFIG.LEVEL_DIFF_PENALTY) {
            return 0.4;
        } else {
            return 0.1; // Почти нет дропа
        }
    }
    
    setEventDropMult(mult) {
        this.eventDropMult = mult;
        if (mult > 1.0) {
            game.addChatMessage(`🎉 Событие: дроп x${mult}!`, 'system');
        }
    }
    
    randomRange(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    getGroundItemCount() {
        return this.groundItems.length;
    }
}

// ============================================
// ПРЕДМЕТ НА ЗЕМЛЕ
// ============================================
class GroundItem {
    constructor(scene, drop, position, owner = null) {
        this.scene = scene;
        this.drop = drop;
        this.owner = owner;
        this.spawnTime = Date.now();
        this.lifetime = DROP_CONFIG.DROP_LIFETIME * 1000;
        this.protectionTime = DROP_CONFIG.DROP_PROTECTION_TIME * 1000;
        
        this.createMesh(position);
        this.label = null;
    }
    
    createMesh(position) {
        const rarity = ITEM_RARITY[this.drop.rarity] || ITEM_RARITY.COMMON;
        const itemId = this.drop.itemId ||
            (this.drop.type === DROP_TYPES.ADENA ? 'copper_parts' : null) ||
            'gear_fragment';

        const root = new THREE.Group();
        root.name = 'ground_loot_' + itemId;
        this.mesh = root;
        this.baseY = (position && isFinite(position.y)) ? position.y : 0.5;
        this.mesh.position.set(position.x, this.baseY, position.z);
        this.scene.add(this.mesh);

        // Невидимый хитбокс подбора и ховера (прозрачный, чтобы Three.js Raycaster корректно его находил)
        const pickHitbox = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.6, 0.9),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
        );
        pickHitbox.position.y = 0.3;
        pickHitbox.userData.groundLoot = true;
        pickHitbox.userData.lootLid = this.drop.lid;
        pickHitbox.userData.groundItem = this;
        this.mesh.add(pickHitbox);
        this.mesh.userData.groundItem = this;

        this.glow = null;
        this.beam = null;
        // ALL ground loot: static models, no spin/bob/glow
        this._staticDrop = true;

        const CM = (typeof window !== 'undefined') ? window.CharModel : null;
        const hasWeaponVisual = !!(CM && CM.WEAPON_VISUALS && CM.WEAPON_VISUALS[itemId]
            && CM.createWeaponWorldMesh);

        if (!hasWeaponVisual) {
            // Mats / consumables — procedural mesh on ground (no animation)
            let content = null;
            try {
                if (typeof DropModels !== 'undefined' && DropModels.create) {
                    content = DropModels.create(itemId, {
                        rarityColor: rarity.glow || 0xffcc44,
                        scale: 1.35
                    });
                }
            } catch (e) {
                console.warn('[Loot] DropModels.create failed', itemId, e);
            }
            if (!content) {
                content = new THREE.Mesh(
                    new THREE.BoxGeometry(0.4, 0.4, 0.4),
                    new THREE.MeshBasicMaterial({ color: rarity.glow || 0xffcc44 })
                );
                content.castShadow = true;
            }
            this._dropContent = content;
            this.mesh.add(content);
            return;
        }

        // Weapon: 3D mesh on ground, no glow/beam/spin
        const self = this;
        const gen = (this._weaponLoadGen = (this._weaponLoadGen || 0) + 1);
        CM.createWeaponWorldMesh(itemId, { scale: 1.0, aniso: 2 }).then((weapon) => {
            if (!weapon || !self.mesh || gen !== self._weaponLoadGen) return;
            if (self._dropContent && self._dropContent.parent) {
                self._dropContent.parent.remove(self._dropContent);
            }
            self._dropContent = weapon;
            self.mesh.add(weapon);
        }).catch((e) => {
            console.warn('[Loot] weapon drop mesh fail', itemId, e);
            try {
                if (typeof DropModels !== 'undefined' && DropModels.create) {
                    const crate = DropModels.create(itemId, {
                        rarityColor: rarity.glow || 0xffcc44,
                        scale: 1.35
                    });
                    if (crate && self.mesh && gen === self._weaponLoadGen) {
                        self._dropContent = crate;
                        self.mesh.add(crate);
                    }
                }
            } catch (e2) { /* ignore */ }
        });
    }
    
    createLabel() {
        // Канон Lineage 2: над дропом на земле нет висячих 2D/3D-надписей.
        // Предметы физически лежат на рельефе в виде 3D-моделей (кучки монет, оружие, ресурсы).
        // Название пишется в системный лог чата при выпадении и подборе.
        // Это экономит CPU/GPU и draw calls.
        this.label = null;
    }
    
    update(_delta) {
        if (!this.mesh || !this.mesh.visible) return;
        if (this._baseScale) {
            this.mesh.scale.set(this._baseScale.x, this._baseScale.y, this._baseScale.z);
        }
        // All drops sit still on terrain — no spin / bob / glow pulse
        const base = (this.baseY != null && isFinite(this.baseY)) ? this.baseY : 0.5;
        this.mesh.position.y = base;
    }
    
    isExpired() {
        return Date.now() - this.spawnTime > this.lifetime;
    }
    
    canLoot(player) {
        if (window.game && window.game.lootManager && typeof window.game.lootManager._canLootLocal === 'function') {
            return window.game.lootManager._canLootLocal(this);
        }
        return true;
    }
    
    createPickupEffect() {
        // Частицы подбора
        const particleCount = 10;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = this.mesh.position.x + (Math.random() - 0.5);
            positions[i + 1] = this.mesh.position.y + Math.random();
            positions[i + 2] = this.mesh.position.z + (Math.random() - 0.5);
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const rarity = ITEM_RARITY[this.drop.rarity];
        const material = new THREE.PointsMaterial({
            color: rarity.glow || 0xffffff,
            size: 0.15,
            transparent: true
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        let frame = 0;
        const animate = () => {
            frame++;
            const pos = particles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] += 0.1;
            }
            particles.geometry.attributes.position.needsUpdate = true;
            particles.material.opacity -= 0.05;
            
            if (particles.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
            }
        };
        animate();
    }
    
    destroy() {
        if (window.game && window.game._hoveredLootGi === this) {
            window.game._hideLootHover();
        }
        this.scene.remove(this.mesh);
        if (this.glow) this.scene.remove(this.glow);
        if (this.beam) this.scene.remove(this.beam);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.LootManager = LootManager;
window.GroundItem = GroundItem;
window.MOB_DROP_TABLES = MOB_DROP_TABLES;
window.ITEM_RARITY = ITEM_RARITY;
window.DROP_TYPES = DROP_TYPES;
window.DROP_CONFIG = DROP_CONFIG;

// Debug: DropModels.coverageReport() in console after load