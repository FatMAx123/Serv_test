// ============================================
// PROJECT STEAM: ORIGINS - SPAWN.JS
// Спавн мобов по зонам, чанкам и событиям
// Экология: shared/mob-db.js (solo / party / raid).
// Мировые события (прорыв трубы → Босс-Бур).
// ============================================

// ============================================
// БАЗА ДАННЫХ МОБОВ
// Источник истины: shared/mob-db.js → window.MOB_DB / MOB_DATABASE
// Fallback: минимальный набор, если mob-db не загрузился.
// ============================================
const MOB_DATABASE = (function () {
    if (typeof window !== 'undefined' && window.MOB_DB && window.MOB_DB.buildLegacyDatabase) {
        return window.MOB_DB.buildLegacyDatabase();
    }
    if (typeof window !== 'undefined' && window.MOB_DATABASE) {
        return window.MOB_DATABASE;
    }
    // minimal fallback если mob-db не загрузился
    return {
        SCRAPPER: {
            id: 'scrapper', name: 'Скраппер', type: 'passive', zone: 'HUB',
            level: [1, 5], hp: [55, 70], damage: [3, 6], defense: 1, exp: [28, 36],
            moveSpeed: 3, aggroRange: 0, attackRange: 1.5, color: 0x888888, scale: 1.8,
            sprite: { body: '#777777', accent: '#555555', eyes: '#44ff44', legs: 4 },
            fleeAtHp: 0.3, loot: [{ name: 'Медные детали', chance: 0.9, amount: [3, 8] }]
        },
        STEAM_HOUND: {
            id: 'steam_hound', name: 'Паровая Гончая', type: 'aggressive', zone: 'TRANSITION',
            level: [5, 10], hp: [150, 220], damage: [8, 14], defense: 3, exp: [120, 180],
            moveSpeed: 6, aggroRange: 12, attackRange: 2, color: 0xaa4444, scale: 2.2,
            sprite: { body: '#993333', accent: '#662222', eyes: '#ff0000', wheels: true },
            packSize: [2, 4], packLeader: true,
            loot: [{ name: 'Медные детали', chance: 0.85, amount: [8, 18] }]
        },
        WELDING_AUTOMATON: {
            id: 'welding_automaton', name: 'Сварочный Автомат', type: 'aggressive', zone: 'PROSPECT',
            level: [8, 15], hp: [280, 400], damage: [14, 22], defense: 6, exp: [250, 380],
            moveSpeed: 3.5, aggroRange: 10, attackRange: 2.5, color: 0x4444aa, scale: 2.8,
            sprite: { body: '#334499', accent: '#222266', eyes: '#ffaa00', heavy: true },
            enrageAtHp: 0.25, loot: [{ name: 'Медные детали', chance: 0.8, amount: [15, 30] }]
        },
        WELDING_DRONE: {
            id: 'welding_drone', name: 'Дрон-Сварщик', type: 'aggressive', zone: 'PROSPECT',
            level: [10, 16], hp: [200, 300], damage: [12, 18], defense: 4, exp: [220, 320],
            moveSpeed: 7, aggroRange: 14, attackRange: 3, color: 0xaaaa44, scale: 1.5,
            sprite: { body: '#999933', accent: '#666622', eyes: '#ff4444', flying: true },
            ranged: true, projectileColor: 0xffaa00,
            loot: [{ name: 'Медные детали', chance: 0.75, amount: [10, 20] }]
        },
        STEAM_CRANE_SPIDER: {
            id: 'steam_crane_spider', name: 'Кран-Паук', type: 'aggressive', zone: 'PROSPECT',
            level: [12, 19], hp: [400, 600], damage: [18, 28], defense: 8, exp: [350, 520],
            moveSpeed: 4, aggroRange: 12, attackRange: 3.5, color: 0x666699, scale: 3.2,
            sprite: { body: '#555588', accent: '#333366', eyes: '#ff8800', legs: 8, heavy: true },
            aoeAttacks: true, loot: [{ name: 'Медные детали', chance: 0.85, amount: [20, 40] }]
        },
        PRESS_HAMMER: {
            id: 'press_hammer', name: 'Автономный Пресс-Молот', type: 'boss', zone: 'LANDMARK',
            level: [20, 25], hp: [18000, 25000], damage: [40, 65], defense: 15, exp: [5000, 8000],
            moveSpeed: 2, aggroRange: 20, attackRange: 4, color: 0xff2200, scale: 6,
            sprite: { body: '#aa1100', accent: '#660000', eyes: '#ffff00', boss: true },
            boss: true, aoeAttacks: true, summonAdds: true, enrageAtHp: 0.15,
            loot: [{ name: 'Ядро Пресс-Молота', chance: 0.3, amount: [1, 1] }]
        },
        DRILL_WORM: {
            id: 'drill_worm', name: 'Босс-Бур', type: 'event_boss', zone: 'ANY',
            level: [18, 22], hp: [12000, 18000], damage: [30, 50], defense: 10, exp: [3500, 5500],
            moveSpeed: 5, aggroRange: 25, attackRange: 3, color: 0xff6600, scale: 5,
            sprite: { body: '#cc5500', accent: '#883300', eyes: '#ff0000', boss: true },
            boss: true, event: true, loot: [{ name: 'Буровое сверло', chance: 0.25, amount: [1, 1] }]
        }
    };
})();

// Синхронизация window для net-ws / UI
if (typeof window !== 'undefined') {
    window.MOB_DATABASE = MOB_DATABASE;
}

// ============================================
// МЕНЕДЖЕР СПАВНА
// ============================================
class SpawnManager {
    constructor(scene, chunkManager) {
        this.scene = scene;
        this.chunkManager = chunkManager;
        this.enemies = [];
        this.spawnPoints = new Map(); // chunkKey -> [spawnPoints]
        this.maxEnemiesPerChunk = 16;
        this.maxTotalEnemies = 160;
        // Споты с карты (WorldMetrics → map-data → window.MOB_SPOTS)
        this.spawnedSpotIdx = new Set();
        // Lazy L2: sync with server SPOT_LOAD_R / UNLOAD_R
        this.mapSpotLoadR = 115;
        this.mapSpotUnloadR = 155;
        
        // Мировые события
        this.eventTimer = 0;
        this.eventInterval = 4 * 60 * 60; // 4 часа (в секундах)
        this.activeEvent = null;
        
        // Для тестирования: ускоренное событие (каждые 2 минуты)
        this.debugEventInterval = 120;
        this.useDebugEvents = true;
        
        this.init();
    }
    
    init() {
        const n = (window.MOB_SPOTS && window.MOB_SPOTS.length) || 0;
        console.log('[Spawn] Менеджер спавна инициализирован, map spots:', n);
    }

    getMapSpots() {
        if (window.MOB_SPOTS && window.MOB_SPOTS.length) return window.MOB_SPOTS;
        if (window.WorldMetrics && window.WorldMetrics.buildSpots) return window.WorldMetrics.buildSpots();
        return [];
    }
    
    update(delta, playerPosition, player) {
        // Приоритет: споты с карты (solo/party/raid layout)
        if (this.getMapSpots().length) {
            this.updateMapSpotSpawns(playerPosition);
        } else {
            this.updateChunkSpawns(playerPosition);
        }
        
        // Обновление всех врагов
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            enemy.update(delta, player);
            
            // Удаление мёртвых
            if (enemy.hp <= 0 && !enemy.isDying) {
                enemy.isDying = true;
                this.onEnemyDeath(enemy);
                this.enemies.splice(i, 1);
            }
        }
        
        // Мировые события
        this.updateEvents(delta, playerPosition);
    }

    updateMapSpotSpawns(playerPosition) {
        const spots = this.getMapSpots();
        const loadR2 = this.mapSpotLoadR * this.mapSpotLoadR;
        const unloadR2 = this.mapSpotUnloadR * this.mapSpotUnloadR;

        for (let i = 0; i < spots.length; i++) {
            const sp = spots[i];
            const dx = sp.x - playerPosition.x;
            const dz = sp.z - playerPosition.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > loadR2) continue;
            if (this.spawnedSpotIdx.has(i)) continue;
            if (this.enemies.length >= this.maxTotalEnemies) break;
            this.spawnedSpotIdx.add(i);
            this.spawnFromMapSpot(sp, i);
        }

        // Деспавн: живые с дальних спотов (боссов не трогаем, если в бою)
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (e.spotIdx == null || e.spotIdx < 0) continue;
            if (e.state === 'chase' || e.state === 'attack') continue;
            const sp = spots[e.spotIdx];
            if (!sp) continue;
            const dx = sp.x - playerPosition.x;
            const dz = sp.z - playerPosition.z;
            if (dx * dx + dz * dz > unloadR2) {
                if (e.boss) continue;
                e.destroy();
                this.enemies.splice(i, 1);
            }
        }

        // Если у спота все умерли и игрок рядом — не респавним сразу (onEnemyDeath)
        // Очистка spawnedSpotIdx когда нет живых с этого спота и далеко
        const aliveBySpot = new Map();
        this.enemies.forEach((e) => {
            if (e.spotIdx != null) aliveBySpot.set(e.spotIdx, (aliveBySpot.get(e.spotIdx) || 0) + 1);
        });
        for (const idx of [...this.spawnedSpotIdx]) {
            if (aliveBySpot.get(idx)) continue;
            const sp = spots[idx];
            if (!sp) { this.spawnedSpotIdx.delete(idx); continue; }
            const dx = sp.x - playerPosition.x;
            const dz = sp.z - playerPosition.z;
            if (dx * dx + dz * dz > unloadR2) this.spawnedSpotIdx.delete(idx);
        }
    }

    spawnFromMapSpot(sp, spotIdx) {
        const mobId = sp.mob || 'scrapper';
        let template = null;
        if (window.MOB_DB && window.MOB_DB.get) template = window.MOB_DB.get(mobId);
        if (!template && MOB_DATABASE) {
            template = MOB_DATABASE[mobId] || MOB_DATABASE[String(mobId).toUpperCase()];
        }
        if (!template) {
            template = {
                id: mobId, name: mobId, level: sp.lvl || [1, 5],
                hp: [50, 80], damage: [4, 8], exp: [20, 40],
                moveSpeed: 3.5, aggroRange: sp.passive ? 0 : 10, attackRange: 2,
                color: 0x888888, scale: 2,
                sprite: { body: '#777', accent: '#444', eyes: '#0f0' },
                boss: !!sp.boss
            };
        }

        const n = Math.max(1, sp.n | 0);
        for (let i = 0; i < n; i++) {
            if (this.enemies.length >= this.maxTotalEnemies) break;
            const ang = Math.random() * Math.PI * 2;
            const rad = Math.sqrt(Math.random()) * (sp.r || 34);
            const x = sp.x + Math.cos(ang) * rad;
            const z = sp.z + Math.sin(ang) * rad;
            const lvl = this.randomInRange(sp.lvl || template.level || [1, 5]);
            const pos = new THREE.Vector3(x, 0, z);
            const enemy = this.createEnemy(template, lvl, pos, null);
            if (enemy) {
                enemy.spotIdx = spotIdx;
                enemy.chunkKey = 'spot_' + spotIdx;
                if (sp.boss) enemy.boss = true;
                if (sp.passive) enemy.aggroRange = 0;
            }
        }
    }
    
    updateChunkSpawns(playerPosition) {
        const playerChunkX = Math.floor(playerPosition.x / WORLD_CONFIG.CHUNK_SIZE);
        const playerChunkZ = Math.floor(playerPosition.z / WORLD_CONFIG.CHUNK_SIZE);
        
        // Проверяем активные чанки
        for (const [key, chunk] of this.chunkManager.chunks) {
            const dist = Math.max(
                Math.abs(chunk.cx - playerChunkX),
                Math.abs(chunk.cz - playerChunkZ)
            );
            
            // Спавним только в видимых чанках
            if (dist <= WORLD_CONFIG.VIEW_DISTANCE) {
                this.ensureChunkPopulation(chunk);
            }
        }
        
        // Деспавн далёких врагов
        this.despawnDistantEnemies(playerPosition);
    }
    
    ensureChunkPopulation(chunk) {
        const key = `${chunk.cx}_${chunk.cz}`;
        const chunkEnemies = this.enemies.filter(e => e.chunkKey === key);
        const currentCount = chunkEnemies.length;
        
        // Определяем лимит по типу зоны
        let maxCount;
        switch(chunk.zone) {
            case WORLD_CONFIG.ZONES.HUB:
                maxCount = 4; // Мирные, мало
                break;
            case WORLD_CONFIG.ZONES.TRANSITION:
                maxCount = 6; // Агрессивные, средне
                break;
            case WORLD_CONFIG.ZONES.PROSPECT:
                maxCount = 8; // Плотный гринд
                break;
            case WORLD_CONFIG.ZONES.LANDMARK:
                maxCount = 3; // РБ + адды
                break;
            default:
                maxCount = 5;
        }
        
        if (currentCount < maxCount && this.enemies.length < this.maxTotalEnemies) {
            const toSpawn = maxCount - currentCount;
            this.spawnInChunk(chunk, toSpawn);
        }
    }
    
    spawnInChunk(chunk, count) {
        const zone = chunk.zone;
        const mobTypes = this.getMobsForZone(zone);
        
        for (let i = 0; i < count; i++) {
            const mobTemplate = mobTypes[Math.floor(Math.random() * mobTypes.length)];
            const level = this.randomInRange(mobTemplate.level);
            
            // Позиция внутри чанка
            const x = chunk.originX + Math.random() * chunk.size;
            const z = chunk.originZ + Math.random() * chunk.size;
            const position = new THREE.Vector3(x, 0, z);
            
            // Спавн стаей (для Гончих)
            if (mobTemplate.packSize) {
                const packCount = this.randomInRange(mobTemplate.packSize);
                for (let p = 0; p < packCount; p++) {
                    const offset = new THREE.Vector3(
                        (Math.random() - 0.5) * 4,
                        0,
                        (Math.random() - 0.5) * 4
                    );
                    this.createEnemy(mobTemplate, level, position.clone().add(offset), chunk);
                }
            } else {
                this.createEnemy(mobTemplate, level, position, chunk);
            }
        }
    }
    
    createEnemy(template, level, position, chunk) {
        // Статы: MOB_DB.statsAtLevel (роль × кривая) → fallback на template.hp/damage/exp
        let hp, damage, exp, pDef, cDef;
        const mobId = template.id || template.mobId;
        if (window.MOB_DB && mobId && window.MOB_DB.statsAtLevel) {
            const st = window.MOB_DB.statsAtLevel(mobId, level);
            const jitter = 0.95 + Math.random() * 0.1;
            hp = Math.floor(st.hp * jitter);
            damage = Math.max(1, Math.floor(st.pAtk * 0.18 * jitter));
            exp = Math.floor(st.exp * jitter);
            pDef = st.pDef;
            cDef = st.cDef;
        } else {
            hp = Math.floor(this.randomInRange(template.hp) * (1 + level * 0.1));
            damage = Math.floor(this.randomInRange(template.damage) * (1 + level * 0.08));
            exp = Math.floor(this.randomInRange(template.exp) * (1 + level * 0.12));
        }

        const enemy = new ZoneEnemy(
            this.scene,
            template,
            level,
            hp,
            damage,
            exp,
            position,
            chunk ? `${chunk.cx}_${chunk.cz}` : 'event'
        );
        if (pDef != null) {
            enemy.pDef = pDef;
            enemy.cDef = cDef;
            enemy.mDef = cDef;
            enemy.defense = pDef;
        }
        // Скиллы с шаблона
        if (template.skills) enemy.skills = template.skills;
        if (template.skillIds) enemy.skillIds = template.skillIds;

        this.enemies.push(enemy);
        return enemy;
    }
    
    getMobsForZone(zone) {
        // Если есть охотничья зона карты — берём мобов из MOB_DB по place id
        if (window.MOB_DB && window.MOB_DB.listByZone) {
            const placeMap = {
                [WORLD_CONFIG.ZONES.HUB]: ['operators_yard', 'engineers_school'],
                [WORLD_CONFIG.ZONES.TRANSITION]: ['astard_hills', 'riverspan', 'scrapyard'],
                [WORLD_CONFIG.ZONES.PROSPECT]: ['western_lands', 'cruna_yards', 'quiet_backwater', 'field_of_oblivion'],
                [WORLD_CONFIG.ZONES.LANDMARK]: ['quiet_backwater', 'boiler_lands']
            };
            const places = placeMap[zone] || ['astard_hills'];
            const pool = [];
            places.forEach((pid) => {
                window.MOB_DB.listByZone(pid).forEach((m) => {
                    if (m.boss && zone !== WORLD_CONFIG.ZONES.LANDMARK) return;
                    if (m.role === 'raid') return;
                    pool.push(m);
                });
            });
            if (pool.length) return pool;
        }
        switch (zone) {
            case WORLD_CONFIG.ZONES.HUB:
                return [MOB_DATABASE.SCRAPPER].filter(Boolean);
            case WORLD_CONFIG.ZONES.TRANSITION:
                return [MOB_DATABASE.STEAM_HOUND, MOB_DATABASE.SCRAPPER].filter(Boolean);
            case WORLD_CONFIG.ZONES.PROSPECT:
                return [
                    MOB_DATABASE.WELDING_AUTOMATON,
                    MOB_DATABASE.WELDING_DRONE,
                    MOB_DATABASE.STEAM_CRANE_SPIDER
                ].filter(Boolean);
            case WORLD_CONFIG.ZONES.LANDMARK:
                return [MOB_DATABASE.PRESS_HAMMER, MOB_DATABASE.WELDING_DRONE].filter(Boolean);
            default:
                return [MOB_DATABASE.SCRAPPER].filter(Boolean);
        }
    }
    
    despawnDistantEnemies(playerPosition) {
        const despawnDistance = WORLD_CONFIG.CHUNK_SIZE * (WORLD_CONFIG.UNLOAD_DISTANCE + 1);
        
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const dist = enemy.mesh.position.distanceTo(playerPosition);
            
            if (dist > despawnDistance && !enemy.boss) {
                enemy.destroy();
                this.enemies.splice(i, 1);
            }
        }
    }
    
    onEnemyDeath(enemy) {
        // Дроп лута
        this.dropLoot(enemy);
        
        // Респавн map-spot
        if (enemy.spotIdx != null && enemy.spotIdx >= 0) {
            const spotIdx = enemy.spotIdx;
            const spots = this.getMapSpots();
            const sp = spots[spotIdx];
            const delay = (enemy.boss ? 60000 : 8000) + Math.random() * 4000;
            setTimeout(() => {
                if (!sp) return;
                // один моб на место убитого (пока игрок в радиусе)
                const stillAlive = this.enemies.filter((e) => e.spotIdx === spotIdx).length;
                if (stillAlive >= (sp.n || 1)) return;
                if (this.enemies.length >= this.maxTotalEnemies) return;
                this.spawnFromMapSpot(
                    Object.assign({}, sp, { n: 1 }),
                    spotIdx
                );
            }, delay);
            return;
        }

        // Респавн chunk (fallback)
        if (enemy.chunkKey && enemy.chunkKey !== 'event' && enemy.chunkKey.indexOf('spot_') !== 0) {
            setTimeout(() => {
                const chunk = this.chunkManager.chunks.get(enemy.chunkKey);
                if (chunk) {
                    this.spawnInChunk(chunk, 1);
                }
            }, 5000 + Math.random() * 5000);
        }
    }
    
    dropLoot(enemy) {
        const template = enemy.template;
        if (!template.loot) return;
        
        template.loot.forEach(item => {
            if (Math.random() < item.chance) {
                const amount = this.randomInRange(item.amount);
                game.addChatMessage(`Получено: ${item.name} x${amount}`, 'loot');
            }
        });
    }
    
    // ============================================
    // МИРОВЫЕ СОБЫТИЯ
    // ============================================
    updateEvents(delta, playerPosition) {
        // Онлайн: бур только полевой рейд на сервере. Локальный ивент плодил второго.
        if (window.game && window.game.net) return;
        const interval = this.useDebugEvents ? this.debugEventInterval : this.eventInterval;
        this.eventTimer += delta;
        
        if (this.eventTimer >= interval && !this.activeEvent) {
            this.triggerWorldEvent(playerPosition);
            this.eventTimer = 0;
        }
        
        // Обновление активного события
        if (this.activeEvent) {
            this.activeEvent.timer -= delta;
            if (this.activeEvent.timer <= 0) {
                this.endWorldEvent();
            }
        }
    }
    
    triggerWorldEvent(playerPosition) {
        // "Прорыв паровой трубы" — из нарративного дизайна
        game.addChatMessage('⚠️ ВНИМАНИЕ: Прорыв паровой трубы в секторе!', 'system');
        game.addChatMessage('Из-под земли вырывается Босс-Бур!', 'damage');
        
        // Спавн босса рядом с игроком
        const spawnPos = playerPosition.clone().add(
            new THREE.Vector3(
                (Math.random() - 0.5) * 20,
                0,
                (Math.random() - 0.5) * 20
            )
        );
        
        const boss = this.createEnemy(
            MOB_DATABASE.DRILL_WORM,
            this.randomInRange(MOB_DATABASE.DRILL_WORM.level),
            spawnPos,
            null
        );
        
        // Эффект появления
        this.createSpawnEffect(spawnPos);
        
        this.activeEvent = {
            type: 'pipe_burst',
            boss: boss,
            timer: 300 // 5 минут на убийство
        };
    }
    
    createSpawnEffect(position) {
        // Столб пара
        const geometry = new THREE.CylinderGeometry(1, 2, 10, 12);
        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.6
        });
        const steam = new THREE.Mesh(geometry, material);
        steam.position.copy(position);
        steam.position.y = 5;
        this.scene.add(steam);
        
        let frame = 0;
        const animate = () => {
            frame++;
            steam.scale.y += 0.1;
            steam.material.opacity -= 0.01;
            
            if (steam.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(steam);
            }
        };
        animate();
    }
    
    endWorldEvent() {
        if (this.activeEvent && this.activeEvent.boss) {
            if (this.activeEvent.boss.hp > 0) {
                // Босс не убит — уходит под землю
                game.addChatMessage('Босс-Бур скрылся под землёй...', 'system');
                this.activeEvent.boss.destroy();
                const idx = this.enemies.indexOf(this.activeEvent.boss);
                if (idx > -1) this.enemies.splice(idx, 1);
            }
        }
        this.activeEvent = null;
    }
    
    randomInRange(range) {
        return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    }
    
    getEnemyCount() {
        return this.enemies.length;
    }
}

// ============================================
// 2D MOB SPRITE SHEETS (Imagine → assets/mobs/<id>/)
// Horizontal sheets: N equal cells, transparent WebP.
// ============================================
const MobSheetCache = {
    _tex: new Map(), // url -> THREE.Texture | 'loading' | null(fail)
    _waiters: new Map(),

    load(url) {
        if (!url) return Promise.resolve(null);
        const hit = this._tex.get(url);
        if (hit && hit !== 'loading') return Promise.resolve(hit);
        if (hit === 'loading') {
            return new Promise((resolve) => {
                const list = this._waiters.get(url) || [];
                list.push(resolve);
                this._waiters.set(url, list);
            });
        }
        this._tex.set(url, 'loading');
        return new Promise((resolve) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                url,
                (tex) => {
                    // Kill magenta bleed: WebP often leaves RGB=pink on a=0 pixels.
                    // GPU filtering then draws a pink disk under feet during walk/death.
                    try {
                        this._scrubTextureAlpha(tex);
                    } catch (e) {
                        console.warn('[MobSheet] scrub failed', url, e);
                    }
                    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
                    // Nearest = crisp pixel art + cheaper than mips
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.NearestFilter;
                    tex.generateMipmaps = false;
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    // NEVER leave needsUpdate true in hot path after load
                    tex.needsUpdate = true;
                    this._tex.set(url, tex);
                    resolve(tex);
                    const ws = this._waiters.get(url);
                    if (ws) { ws.forEach((fn) => fn(tex)); this._waiters.delete(url); }
                },
                undefined,
                () => {
                    console.warn('[MobSheet] fail', url);
                    this._tex.set(url, null);
                    resolve(null);
                    const ws = this._waiters.get(url);
                    if (ws) { ws.forEach((fn) => fn(null)); this._waiters.delete(url); }
                }
            );
        });
    },

    /**
     * Zero RGB on transparent texels + strip residual chroma-key pink.
     * Must run once after decode, before GPU upload (needsUpdate).
     */
    _scrubTextureAlpha(tex) {
        const img = tex && tex.image;
        if (!img || !img.width) return;
        const w = img.width | 0;
        const h = img.height | 0;
        if (w < 1 || h < 1) return;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, w, h);
        const d = id.data;
        for (let i = 0; i < d.length; i += 4) {
            const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
            // Transparent texels: WebP/GPU leave non-zero RGB on a≈0 → pink disk under feet.
            // Do NOT punch holes in intentional pastel death steam (higher G / multi-hue).
            if (a < 16) {
                d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
                continue;
            }
            // Chroma-key leftover: #FF00AA + purple puddles under feet (opaque residual key)
            const hotPink = (r > 200 && g < 100 && b > 110);
            const magenta = (r > 150 && b > 100 && g < 110 && r > g + 40 && b > g + 25);
            const purplePuddle = (r > 100 && b > 85 && g < 95 && r > g + 25 && b > g + 15
                && (r + b) > (g * 2.4 + 30) && b >= r * 0.5);
            const softFringe = (a < 100 && r > 155 && b > 95 && g < 120 && r > g + 25);
            if (hotPink || magenta || purplePuddle || softFringe) {
                // keep green body / yellow eyes
                if (g > 120 && g >= r * 0.75) continue;
                d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
            }
        }
        ctx.putImageData(id, 0, 0);
        tex.image = c;
        tex.needsUpdate = true;
    },

    /**
     * Grid size for a sheet anim (horizontal strip or multi-row).
     * @returns {{ cols: number, rows: number }}
     */
    gridOf(frameCount, layout) {
        let cols = Math.max(1, frameCount | 0);
        let rows = 1;
        if (layout && layout.cols > 0) {
            cols = layout.cols | 0;
            rows = (layout.rows > 0) ? (layout.rows | 0) : Math.max(1, Math.ceil((frameCount | 0) / cols));
        }
        return { cols: Math.max(1, cols), rows: Math.max(1, rows) };
    },

    /**
     * Cell aspect ratio (width/height in texels).
     * Landscape cells (attack 260×183 → ~1.42) need scale.x = sc * aspect so
     * the square billboard doesn't squash the art.
     */
    cellAspect(src, frameCount, layout) {
        const img = src && src.image;
        const w = img ? ((img.width || img.videoWidth || 0) | 0) : 0;
        const h = img ? ((img.height || img.videoHeight || 0) | 0) : 0;
        if (!(w > 0 && h > 0)) return 1;
        const g = this.gridOf(frameCount, layout);
        const cellW = w / g.cols;
        const cellH = h / g.rows;
        if (!(cellW > 0 && cellH > 0)) return 1;
        return cellW / cellH;
    },

    /**
     * Per-entity clone so offset/repeat are independent.
     * Shares GPU image with src — only matrix state is unique.
     * PERF: do NOT set needsUpdate after clone (image already on GPU).
     *
     * @param {number} frameCount
     * @param {{cols?:number, rows?:number}} [layout]
     */
    cloneForAnim(src, frameCount, layout) {
        if (!src) return null;
        const t = src.clone();
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        const g = this.gridOf(frameCount, layout);
        t.repeat.set(1 / g.cols, 1 / g.rows);
        t.offset.set(0, 1 - 1 / g.rows); // top-left cell
        t.magFilter = THREE.NearestFilter;
        t.minFilter = THREE.NearestFilter;
        t.generateMipmaps = false;
        // image is shared; no re-upload
        t.needsUpdate = false;
        return t;
    },

    /**
     * Sheet cell + horizontal flip via UV only.
     * Supports:
     *  - horizontal strip: frames N → 1×N (default)
     *  - multi-row grid: layout { cols, rows } (e.g. 4×4 walk, 4×2 attack)
     * PERF: only mutates repeat/offset — never needsUpdate (not image data).
     * THREE.Sprite ignores negative scale.x (shader length()), so flip = UV.
     *
     * @param {object} [layout] - { cols, rows }; if omitted, single-row strip of `frames` cells
     */
    applyFrame(tex, frame, frames, facing, layout) {
        if (!tex) return;
        const n = Math.max(1, frames | 0);
        const f = Math.max(0, Math.min(n - 1, frame | 0));
        const face = facing >= 0 ? 1 : -1;

        let cols = n;
        let rows = 1;
        if (layout && layout.cols > 0) {
            cols = layout.cols | 0;
            rows = (layout.rows > 0) ? (layout.rows | 0) : Math.max(1, Math.ceil(n / cols));
        }
        cols = Math.max(1, cols);
        rows = Math.max(1, rows);

        const uCell = 1 / cols;
        const vCell = 1 / rows;
        const col = f % cols;
        const row = Math.floor(f / cols);

        // wrapS set once at clone/load; multi-row needs clamp on T
        tex.repeat.x = face * uCell;
        tex.repeat.y = vCell;
        // Three.js UV origin bottom-left → row 0 is top of texture
        tex.offset.x = face >= 0 ? col * uCell : (col + 1) * uCell;
        tex.offset.y = 1 - (row + 1) * vCell;
    },

    /** Flip a full (non-sheet) texture left/right — UV only, no needsUpdate. */
    applyFullFlip(tex, facing) {
        if (!tex) return;
        const face = facing >= 0 ? 1 : -1;
        tex.repeat.x = face;
        tex.repeat.y = 1;
        tex.offset.x = face >= 0 ? 0 : 1;
        tex.offset.y = 0;
    }
};

if (typeof window !== 'undefined') window.MobSheetCache = MobSheetCache;

// ============================================
// ЗОНАЛЬНЫЙ ВРАГ (расширенный Enemy)
// ============================================
class ZoneEnemy {
    constructor(scene, template, level, hp, damage, exp, position, chunkKey) {
        this.scene = scene;
        this.template = template;
        this.name = template.name;
        this.level = level;
        this.maxHp = hp;
        this.hp = hp;
        this.damage = damage;
        // C1-ish: high P.Def so mystic AA (P.Atk 2–6) hits ~4–8, not 50+
        // Если createEnemy уже проставил точные статы — не затираем (см. ниже init defaults)
        const L = Math.max(1, level | 0);
        this.pDef = Math.floor(48 + L * 1.9 + Math.pow(L, 1.22) * 0.85);
        this.cDef = Math.floor(52 + L * 1.55 + Math.pow(L, 1.12) * 0.72);
        this.mDef = this.cDef;
        this.defense = this.pDef; // packDefender fallback
        this.expReward = exp;
        this.chunkKey = chunkKey;
        this.boss = template.boss || false;
        this.named = template.named || false;
        this.mobId = template.id || null;
        this.mode = template.mode || 'solo';
        this.role = template.role || null;
        this.champion = !!(template.champion || template.role === 'elite' || template.role === 'party_elite');
        this.rank = (window.MOB_DB && window.MOB_DB.rankOf)
          ? window.MOB_DB.rankOf(template, {
            role: this.role, boss: this.boss, named: this.named, champion: this.champion
          })
          : { id: this.boss ? 'boss' : 'normal' };
        this.isDying = false;
        
        // AI
        this.state = 'idle';
        this.spawnPosition = position.clone();
        this.wanderTarget = new THREE.Vector3();
        this.stateTimer = 0;
        this.attackCooldown = 0;
        this.aggroRange = template.aggroRange;
        this.attackRange = template.attackRange;
        this.moveSpeed = template.moveSpeed;
        // L2-like leash: longer than aggro so short kites don't drop chase
        this.returnRange = template.boss
          ? 120
          : Math.max(90, (template.aggroRange || 10) * 6.5);
        this.chaseRange = template.boss
          ? 100
          : Math.max(70, (template.aggroRange || 10) * 5);
        
        // Специальные поведения
        this.fleeAtHp = template.fleeAtHp || 0;
        this.enrageAtHp = template.enrageAtHp || 0;
        this.isEnraged = false;
        this.ranged = template.ranged || false;
        this.projectiles = [];
        this.skills = template.skills || [];
        this.skillIds = template.skillIds || [];
        this.social = template.social || false;
        
        // Босс-механики
        this.summonedAdds = false;
        this.aoeCooldown = 0;

        // 2D sheet animation state
        this.useSheets = false;
        this.sheetAnims = null; // { idle:{tex,frames,fps}, ... }
        this.animName = 'idle';
        this.animFrame = 0;
        this.animTime = 0;
        this.facing = 1; // 1 = right, -1 = left (flip scale.x)
        
        this.createMesh(position);
    }

    /** Procedural placeholder (legacy colored blob). */
    _buildProceduralTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const sprite = this.template.sprite || {};

        ctx.fillStyle = sprite.body || '#777';
        if (sprite.boss) {
            ctx.fillRect(8, 16, 48, 40);
        } else if (sprite.heavy) {
            ctx.fillRect(12, 20, 40, 36);
        } else if (sprite.flying) {
            ctx.beginPath();
            ctx.arc(32, 32, 16, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(16, 24, 32, 28);
        }

        ctx.fillStyle = sprite.accent || '#555';
        if (sprite.wheels) {
            ctx.beginPath();
            ctx.arc(20, 52, 6, 0, Math.PI * 2);
            ctx.arc(44, 52, 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (sprite.legs) {
            for (let i = 0; i < sprite.legs; i++) {
                const angle = (i / sprite.legs) * Math.PI * 2;
                ctx.fillRect(
                    32 + Math.cos(angle) * 20 - 2,
                    32 + Math.sin(angle) * 20 - 2,
                    4, 4
                );
            }
        }

        ctx.fillStyle = sprite.eyes || '#0f0';
        if (sprite.boss) {
            ctx.fillRect(16, 20, 12, 8);
            ctx.fillRect(36, 20, 12, 8);
        } else {
            ctx.beginPath();
            ctx.arc(26, 28, 4, 0, Math.PI * 2);
            ctx.arc(38, 28, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        return new THREE.CanvasTexture(canvas);
    }

    _sheetsCfg() {
        return this.template.sheets || (this.template.sprite && this.template.sprite.sheets) || null;
    }
    
    createMesh(position) {
        const fallbackTex = this._buildProceduralTexture();
        const material = new THREE.SpriteMaterial({
            map: fallbackTex,
            transparent: true,
            alphaTest: 0.15,
            depthWrite: false,
            // straight-alpha sheets (chroma-key WebP); premult=true bleeds pink under feet
            premultipliedAlpha: false
        });
        
        this.mesh = new THREE.Sprite(material);
        this.mesh.scale.set(this.template.scale, this.template.scale, 1);
        this.mesh.position.copy(position);
        this.mesh.position.y = this.template.scale / 2;
        this.mesh.castShadow = true;
        this.mesh.userData.enemy = this;
        
        this.scene.add(this.mesh);
        
        // HP бар
        this.createHpBar();
        
        // Тень
        const shadowGeo = new THREE.CircleGeometry(this.template.scale * 0.4, 16);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.3
        });
        this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.copy(position);
        this.shadow.position.y = 0.01;
        this.scene.add(this.shadow);
        
        // L2 nameplate: имя + уровень всем; ранг X/босс/рейд
        this.createNameTag();
        if (this.rank && this.rank.id !== 'normal') this.createRankAura();

        // Async load Imagine sprite sheets when configured
        this._tryLoadSheets();
    }

    _tryLoadSheets() {
        const cfg = this._sheetsCfg();
        if (!cfg || !cfg.base) return;

        const base = cfg.base.replace(/\/$/, '');
        const names = ['idle', 'walk', 'attack', 'death'];
        const framesMap = cfg.frames || {};
        const fpsMap = cfg.fps || {};
        const layoutMap = cfg.layout || {};
        const fileMap = {
            idle: cfg.idle || 'idle_sheet.webp',
            walk: cfg.walk || 'walk_sheet.webp',
            attack: cfg.attack || 'attack_sheet.webp',
            death: cfg.death || 'death_sheet.webp'
        };
        const bust = (cfg.cacheBust != null ? String(cfg.cacheBust) : '1');
        const urlOf = (file) => base + '/' + file + (file.indexOf('?') >= 0 ? '&' : '?') + 'v=' + bust;

        Promise.all(names.map((n) => MobSheetCache.load(urlOf(fileMap[n])))).then((texList) => {
            if (!this.mesh || !this.mesh.material) return;
            const anims = {};
            let any = false;
            names.forEach((n, i) => {
                const src = texList[i];
                if (!src) return;
                const fc = (framesMap[n] != null ? framesMap[n] : 4) | 0;
                const layout = layoutMap[n] || null;
                const fps = (fpsMap[n] != null ? fpsMap[n]
                    : (n === 'idle' ? 6 : n === 'walk' ? 10 : n === 'death' ? 3 : 12));
                const tex = MobSheetCache.cloneForAnim(src, fc, layout);
                if (!tex) return;
                const aspect = MobSheetCache.cellAspect(src, fc, layout);
                anims[n] = { tex, frames: fc, fps, layout, aspect };
                any = true;
            });
            if (!any) return;
            this.sheetAnims = anims;
            this.useSheets = true;
            this.baseScale = this.template.scale || 1.6;
            const sheets = this._sheetsCfg() || {};
            this.faceInvert = !!(sheets.faceInvert || sheets.artFaces === 'right');
            if (this.mesh && this.mesh.material) {
                this.mesh.material.premultipliedAlpha = false;
                this.mesh.material.needsUpdate = true;
            }
            this.mesh.material.alphaTest = 0.28;
            this.mesh.material.depthWrite = false;
            this._uvKey = '';
            this.setAnim('idle', true);
        });
    }

    /** World scale for current sheet cell: height = baseScale, width = height × cellAspect. */
    _sheetScaleXY() {
        const sc = Math.abs(this.baseScale || this.template.scale || 1.8);
        let aspect = 1;
        if (this.useSheets && this.sheetAnims) {
            const a = this.sheetAnims[this.animName] || this.sheetAnims.idle;
            if (a && a.aspect > 0) aspect = a.aspect;
        }
        return { x: sc * aspect, y: sc };
    }

    /** THREE.Sprite: flip via UV, never negative scale.x */
    _applyFacingUV() {
        if (!this.mesh || !this.mesh.material) return;
        let face = this.facing >= 0 ? 1 : -1;
        if (this.faceInvert) face = -face;
        const xy = this._sheetScaleXY();
        this.mesh.scale.set(xy.x, xy.y, 1);
        if (this.useSheets && this.sheetAnims && window.MobSheetCache) {
            const a = this.sheetAnims[this.animName] || this.sheetAnims.idle;
            if (a && a.tex) {
                const key = this.animName + '|' + (this.animFrame | 0) + '|' + face + '|' + xy.x.toFixed(3);
                if (this._uvKey === key && this.mesh.material.map === a.tex) return;
                this._uvKey = key;
                if (this.mesh.material.map !== a.tex) this.mesh.material.map = a.tex;
                MobSheetCache.applyFrame(a.tex, this.animFrame || 0, a.frames, face, a.layout || null);
                return;
            }
        }
        const map = this.mesh.material.map;
        if (map && window.MobSheetCache) MobSheetCache.applyFullFlip(map, face);
    }

    setAnim(name, force) {
        if (!this.useSheets || !this.sheetAnims) return;
        if (!force && this.animName === name) return;
        const a = this.sheetAnims[name] || this.sheetAnims.idle;
        if (!a) return;
        this.animName = this.sheetAnims[name] ? name : 'idle';
        this.animFrame = 0;
        this.animTime = 0;
        this._uvKey = '';
        this.mesh.material.map = a.tex;
        this._applyFacingUV();
    }

    updateAnim(delta) {
        if (!this.useSheets || !this.sheetAnims) return;
        const a = this.sheetAnims[this.animName] || this.sheetAnims.idle;
        if (!a || a.frames < 1) return;
        this.animTime += delta;
        const spf = 1 / Math.max(1, a.fps);
        while (this.animTime >= spf) {
            this.animTime -= spf;
            if (this.animName === 'death') {
                this.animFrame++;
                if (this.animFrame >= a.frames - 1) {
                    this.animFrame = a.frames - 1;
                    this._applyFacingUV();
                    this._deathSheetDone = true;
                    return;
                }
            } else if (this.animName === 'attack') {
                this.animFrame++;
                if (this.animFrame >= a.frames) {
                    // attack one-shot → back to idle/walk based on AI state
                    const next = (this.state === 'chase' || this.state === 'wander' || this.state === 'flee' || this.state === 'return')
                        ? 'walk' : 'idle';
                    this.setAnim(next, true);
                    return;
                }
            } else {
                this.animFrame = (this.animFrame + 1) % a.frames;
            }
        }
        this._applyFacingUV();
    }

    _syncAnimFromState() {
        if (!this.useSheets) return;
        if (this.animName === 'attack' || this.animName === 'death' || this.isDying) return;
        let want = 'idle';
        if (this.state === 'wander' || this.state === 'chase' || this.state === 'return' || this.state === 'flee') {
            want = 'walk';
        } else if (this.state === 'attack') {
            want = 'idle'; // hold idle between swings; attackPlayer triggers attack anim
        }
        this.setAnim(want);
    }
    
    createHpBar() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 8;
        this.hpBarTexture = new THREE.CanvasTexture(canvas);
        
        const material = new THREE.SpriteMaterial({
            map: this.hpBarTexture,
            transparent: true
        });
        
        this.hpBar = new THREE.Sprite(material);
        this.hpBar.scale.set(this.template.scale * 1.2, 0.4, 1);
        this.hpBar.position.y = this.template.scale * 0.7;
        this.mesh.add(this.hpBar);
        
        this.updateHpBar();
    }
    
    updateHpBar() {
        const canvas = this.hpBarTexture.image;
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, 64, 8);
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, 64, 8);
        
        const hpPercent = this.hp / this.maxHp;
        ctx.fillStyle = hpPercent > 0.5 ? '#44ff44' : hpPercent > 0.25 ? '#ffaa00' : '#ff4444';
        ctx.fillRect(1, 1, 62 * hpPercent, 6);
        
        this.hpBarTexture.needsUpdate = true;
    }
    
    createNameTag() {
        const canvas = document.createElement('canvas');
        const DB = window.MOB_DB;
        const rank = this.rank || (DB && DB.rankOf && DB.rankOf(this.template, {
            role: this.role, boss: this.boss, named: this.named, champion: this.champion
        }));
        if (DB && typeof DB.paintMobNameplate === 'function') {
            DB.paintMobNameplate(canvas, {
                name: this.name,
                level: this.level,
                mobId: this.mobId,
                template: this.template,
                role: this.role,
                boss: this.boss,
                named: this.named,
                champion: this.champion,
                rank: rank
            });
        } else {
            canvas.width = 512;
            canvas.height = 120;
            const ctx = canvas.getContext('2d');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.font = 'bold 32px Segoe UI, Arial';
            ctx.fillStyle = '#e8e0c8';
            ctx.strokeText('Ур.' + this.level, 256, 38);
            ctx.fillText('Ур.' + this.level, 256, 38);
            ctx.font = 'bold 28px Segoe UI, Arial';
            ctx.fillStyle = this.boss ? '#ff6644' : '#f3efe4';
            ctx.strokeText(this.name, 256, 82);
            ctx.fillText(this.name, 256, 82);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });

        this.nameTag = new THREE.Sprite(material);
        const scN = (DB && DB.nameplateScale) ? DB.nameplateScale(rank) : { x: 10.8, y: 1.95 };
        this.nameTag.scale.set(scN.x, scN.y, 1);
        this.nameTag.position.y = (this.template.scale || 1.8) * 0.55 + 0.35;
        this.nameTag.renderOrder = (rank && rank.id !== 'normal') ? 998 : 996;
        this.mesh.add(this.nameTag);
    }

    createRankAura() {
        const rank = this.rank;
        if (!rank || rank.id === 'normal' || !window.THREE) return;
        const hex = rank.glow || '#ffaa22';
        const c = document.createElement('canvas');
        c.width = 128; c.height = 128;
        const x = c.getContext('2d');
        const g = x.createRadialGradient(64, 64, 10, 64, 64, 62);
        g.addColorStop(0, hex + '00');
        g.addColorStop(0.42, hex + '33');
        g.addColorStop(0.68, hex + '88');
        g.addColorStop(1, hex + '00');
        x.fillStyle = g;
        x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
        x.strokeStyle = hex;
        x.lineWidth = 3;
        x.beginPath(); x.arc(64, 64, 40, 0, Math.PI * 2); x.stroke();
        const size = rank.id === 'raid' ? 4.4 : rank.id === 'boss' ? 3.8 : 2.6;
        this.rankAura = new THREE.Mesh(
            new THREE.CircleGeometry(1, 32),
            new THREE.MeshBasicMaterial({
                map: new THREE.CanvasTexture(c),
                transparent: true,
                depthWrite: false,
                side: THREE.DoubleSide,
                opacity: 0.75
            })
        );
        this.rankAura.rotation.x = -Math.PI / 2;
        this.rankAura.scale.set(size, size, 1);
        this.rankAura.position.copy(this.mesh.position);
        this.rankAura.position.y = 0.06;
        this.scene.add(this.rankAura);
    }
    
    takeDamage(amount, isCrit = false) {
        this.hp -= amount;
        this.updateHpBar();
        
        // Агримся
        if (this.state === 'idle' || this.state === 'wander') {
            this.state = 'chase';
        }
        
        // Проверка специальных поведений
        const hpPercent = this.hp / this.maxHp;
        
        // Бегство (Скрапперы)
        if (this.fleeAtHp > 0 && hpPercent < this.fleeAtHp && this.state !== 'flee') {
            this.state = 'flee';
            game.addChatMessage(`${this.name} пытается сбежать!`, 'system');
        }
        
        // Ярость (Автоматы, Боссы)
        if (this.enrageAtHp > 0 && hpPercent < this.enrageAtHp && !this.isEnraged) {
            this.isEnraged = true;
            this.moveSpeed *= 1.5;
            this.damage = Math.floor(this.damage * 1.3);
            this.mesh.material.color.setHex(0xff0000);
            game.addChatMessage(`${this.name} ВПАДАЕТ В ЯРОСТЬ!`, 'damage');
        }
        
        // Босс: призыв аддов на 50% HP
        if (this.boss && this.template.summonAdds && hpPercent < 0.5 && !this.summonedAdds) {
            this.summonedAdds = true;
            this.summonAdds();
        }
        
        // Визуальный фидбек
        this.mesh.material.color.setHex(0xff4444);
        setTimeout(() => {
            if (!this.isEnraged) {
                this.mesh.material.color.setHex(0xffffff);
            }
        }, 100);
        
        if (this.hp <= 0) {
            this.die();
        }
    }
    
    summonAdds() {
        game.addChatMessage(`${this.name} призывает подкрепление!`, 'damage');
        
        for (let i = 0; i < 3; i++) {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 8,
                0,
                (Math.random() - 0.5) * 8
            );
            const addPos = this.mesh.position.clone().add(offset);
            
            const add = new ZoneEnemy(
                this.scene,
                MOB_DATABASE.WELDING_DRONE,
                this.level - 5,
                100,
                10,
                15,
                addPos,
                this.chunkKey
            );
            
            if (game.spawnManager) {
                game.spawnManager.enemies.push(add);
            }
        }
    }
    
    die() {
        if (this._deathStarted) return;
        this._deathStarted = true;
        this.isDying = true;
        this.state = 'dead';

        // Sheet death: slow frames → hold corpse → fade (~3s total)
        if (this.useSheets && this.sheetAnims && this.sheetAnims.death) {
            this.setAnim('death', true);
            // force slow death playback
            if (this.sheetAnims.death) this.sheetAnims.death.fps = Math.min(this.sheetAnims.death.fps || 3, 3);
            this._deathSheetDone = false;
            this._deathHoldTime = 0;
            this._deathFade = 0;
            const holdSec = 0.85;
            const fadeSec = 0.9;
            const tick = () => {
                if (!this.mesh) return;
                if (!this._deathSheetDone) {
                    this.updateAnim(1 / 30);
                    requestAnimationFrame(tick);
                    return;
                }
                // hold last frame (scrap pile) so death is readable
                this._deathHoldTime = (this._deathHoldTime || 0) + 1 / 30;
                if (this._deathHoldTime < holdSec) {
                    requestAnimationFrame(tick);
                    return;
                }
                this._deathFade += 1 / 30;
                const t = Math.min(1, this._deathFade / fadeSec);
                if (this.mesh.material) {
                    this.mesh.material.opacity = 1 - t;
                    this.mesh.material.transparent = true;
                }
                if (t < 1) requestAnimationFrame(tick);
                else {
                    this.createDeathEffect();
                    this.destroy();
                }
            };
            requestAnimationFrame(tick);
            return;
        }

        this.createDeathEffect();
        this.destroy();
    }
    
    createDeathEffect() {
        const particleCount = this.boss ? 50 : 20;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount * 3; i += 3) {
            positions[i] = this.mesh.position.x + (Math.random() - 0.5) * this.template.scale;
            positions[i + 1] = this.mesh.position.y + Math.random() * this.template.scale;
            positions[i + 2] = this.mesh.position.z + (Math.random() - 0.5) * this.template.scale;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const material = new THREE.PointsMaterial({
            color: this.template.color,
            size: this.boss ? 0.5 : 0.3,
            transparent: true
        });
        
        const particles = new THREE.Points(geometry, material);
        this.scene.add(particles);
        
        let frame = 0;
        const animate = () => {
            frame++;
            const pos = particles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] -= 0.15;
            }
            particles.geometry.attributes.position.needsUpdate = true;
            particles.material.opacity -= 0.02;
            
            if (particles.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(particles);
            }
        };
        animate();
    }
    
    update(delta, player) {
        this.stateTimer += delta;
        
        if (this.attackCooldown > 0) this.attackCooldown -= delta;
        if (this.aoeCooldown > 0) this.aoeCooldown -= delta;
        
        const distToPlayer = this.mesh.position.distanceTo(player.mesh.position);
        const distToSpawn = this.mesh.position.distanceTo(this.spawnPosition);
        
        switch(this.state) {
            case 'idle':
                if (this.aggroRange > 0 && distToPlayer < this.aggroRange) {
                    this.state = 'chase';
                } else if (this.stateTimer > 3) {
                    this.state = 'wander';
                    this.stateTimer = 0;
                    this.setWanderTarget();
                }
                break;
                
            case 'wander':
                this.moveTowards(this.wanderTarget, delta);
                if (this.mesh.position.distanceTo(this.wanderTarget) < 1) {
                    this.state = 'idle';
                    this.stateTimer = 0;
                }
                if (this.aggroRange > 0 && distToPlayer < this.aggroRange) {
                    this.state = 'chase';
                }
                break;
                
            case 'chase':
                // L2: chase while in chaseRange; only leash when far from spawn for a bit
                if (distToSpawn > this.returnRange) {
                    this._leashT = (this._leashT || 0) + delta;
                    if (this._leashT > 2.5) {
                        this.state = 'return';
                        this._leashT = 0;
                    }
                } else if (distToPlayer > (this.chaseRange || this.aggroRange * 5)) {
                    this._lostT = (this._lostT || 0) + delta;
                    if (this._lostT > 4.0) {
                        this.state = 'return';
                        this._lostT = 0;
                    }
                } else {
                    this._leashT = 0;
                    this._lostT = 0;
                }
                if (this.state !== 'return') {
                    if (distToPlayer <= this.attackRange) {
                        this.state = 'attack';
                    } else {
                        // catch runners slightly faster when far
                        const mult = distToPlayer > 14 ? 1.2 : (distToPlayer > 8 ? 1.1 : 1);
                        this.moveTowards(player.mesh.position, delta * mult);
                    }
                }
                break;
                
            case 'attack':
                // Face player while attacking (camera-relative — tracks run-behind)
                if (player && player.mesh) {
                    const pdx = player.mesh.position.x - this.mesh.position.x;
                    const pdz = player.mesh.position.z - this.mesh.position.z;
                    this.faceFromWorldMove(pdx, pdz);
                }
                if (distToPlayer > this.attackRange * 1.3) {
                    this.state = 'chase';
                } else if (this.attackCooldown <= 0) {
                    this.attackPlayer(player);
                    this.attackCooldown = this.boss ? 2.0 : 1.5;
                    
                    // Босс: AoE атака
                    if (this.boss && this.template.aoeAttacks && this.aoeCooldown <= 0) {
                        this.aoeAttack(player);
                        this.aoeCooldown = 8;
                    }
                }
                break;
                
            case 'return':
                this.moveTowards(this.spawnPosition, delta);
                if (distToSpawn < 2) {
                    this.state = 'idle';
                    this.hp = this.maxHp;
                    this.isEnraged = false;
                    this.mesh.material.color.setHex(0xffffff);
                    this.updateHpBar();
                }
                break;
                
            case 'flee':
                const fleeDir = new THREE.Vector3();
                fleeDir.subVectors(this.mesh.position, player.mesh.position).normalize();
                this.faceFromWorldMove(fleeDir.x, fleeDir.z);
                this.mesh.position.add(fleeDir.multiplyScalar(this.moveSpeed * 1.5 * delta));
                
                if (distToPlayer > this.aggroRange * 2) {
                    this.state = 'idle';
                }
                break;
        }

        this._syncAnimFromState();
        this.updateAnim(delta);
        
        // Высота по рельефу: standY (mesh) — bake alone sinks into hill textures
        if (window.Terrain) {
          const mx = this.mesh.position.x;
          const mz = this.mesh.position.z;
          let ground;
          let shadowY;
          if (typeof window.Terrain.standY === 'function') {
            const st = window.Terrain.standY(mx, mz);
            ground = st.ground;
            shadowY = st.shadowY != null ? st.shadowY : st.ground + 0.025;
          } else {
            const bake = window.Terrain.heightAt(mx, mz);
            let gh = bake;
            if (typeof window.Terrain.heightAtMax === 'function') {
              const peak = window.Terrain.heightAtMax(mx, mz, 2.4);
              gh = bake + Math.min(0.55, Math.max(0, peak - bake) * 0.45);
            }
            if (typeof window.Terrain.slopeAt === 'function') {
              gh += Math.min(0.45, (window.Terrain.slopeAt(mx, mz) || 0) * 0.65);
            }
            gh += 0.04;
            ground = Math.max(gh, (window.Terrain.seaLevel || 0) - 0.3);
            shadowY = ground + 0.025;
          }
          const sc = this.template.scale || this.baseScale || 1.8;
          const _ty = ground + sc * 0.5 + 0.04;
          this.mesh.position.y += (_ty - this.mesh.position.y) * Math.min(1, delta * 8);
          this.shadow.position.y = shadowY;
        }
        this.shadow.position.x = this.mesh.position.x;
        this.shadow.position.z = this.mesh.position.z;
        if (this.nameTag && window.MOB_DB && window.MOB_DB.nameplateCamScale) {
            const cam = window.game && (window.game.camera || window.game.cam);
            if (cam && cam.position) {
                const sc = window.MOB_DB.nameplateCamScale(
                    this.rank,
                    cam.position.distanceTo(this.mesh.position)
                );
                this.nameTag.scale.set(sc.x, sc.y, 1);
            }
        }
        if (this.rankAura) {
            this.rankAura.position.x = this.mesh.position.x;
            this.rankAura.position.z = this.mesh.position.z;
            this.rankAura.position.y = (typeof shadowY === 'number' ? shadowY : 0.06) + 0.02;
        }
    }

    setFacing(dir) {
        const d = dir >= 0 ? 1 : -1;
        if (this.facing === d) return;
        this.facing = d;
        // UV flip — THREE.Sprite ignores negative scale.x
        this._applyFacingUV();
    }

    /** Screen-relative face from world move (orbit camera safe). */
    faceFromWorldMove(dx, dz) {
        if (dx * dx + dz * dz < 1e-12) return;
        const cam = (window.game && (window.game.camera || window.game.cam)) || null;
        let side;
        if (cam && cam.matrixWorld && cam.matrixWorld.elements) {
            const e = cam.matrixWorld.elements;
            let rx = e[0];
            let rz = e[2];
            const len = Math.hypot(rx, rz);
            if (len > 1e-6) {
                rx /= len;
                rz /= len;
                side = dx * rx + dz * rz;
            }
        }
        if (side == null || !isFinite(side)) side = dx;
        if (side > 1e-8) this.setFacing(1);
        else if (side < -1e-8) this.setFacing(-1);
    }
    
    moveTowards(target, delta) {
        const direction = new THREE.Vector3();
        direction.subVectors(target, this.mesh.position);
        direction.y = 0;
        if (direction.lengthSq() > 1e-6) {
            direction.normalize();
            this.faceFromWorldMove(direction.x, direction.z);
            this.mesh.position.add(direction.multiplyScalar(this.moveSpeed * delta));
        }
    }
    
    setWanderTarget() {
        this.wanderTarget.set(
            this.spawnPosition.x + (Math.random() - 0.5) * 12,
            0,
            this.spawnPosition.z + (Math.random() - 0.5) * 12
        );
    }
    
    attackPlayer(player) {
        if (player && player.mesh) {
            const pdx = player.mesh.position.x - this.mesh.position.x;
            const pdz = player.mesh.position.z - this.mesh.position.z;
            this.faceFromWorldMove(pdx, pdz);
        }
        if (this.useSheets) this.setAnim('attack', true);
        if (this.ranged) {
            this.fireProjectile(player);
        } else {
            const damage = this.damage + Math.floor(Math.random() * 3);
            player.takeDamage(damage);
            this.createMeleeEffect(player);
        }
    }
    
    fireProjectile(player) {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: this.template.projectileColor || 0xffaa00
        });
        const projectile = new THREE.Mesh(geometry, material);
        projectile.position.copy(this.mesh.position);
        projectile.position.y = 1.5;
        
        const direction = new THREE.Vector3();
        direction.subVectors(player.mesh.position, projectile.position).normalize();
        
        projectile.userData = {
            direction: direction,
            speed: 15,
            damage: this.damage,
            target: player,
            life: 3
        };
        
        this.scene.add(projectile);
        this.projectiles.push(projectile);
    }
    
    updateProjectiles(delta) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const proj = this.projectiles[i];
            const data = proj.userData;
            
            proj.position.add(data.direction.clone().multiplyScalar(data.speed * delta));
            data.life -= delta;
            
            // Проверка попадания
            const dist = proj.position.distanceTo(data.target.mesh.position);
            if (dist < 1) {
                data.target.takeDamage(data.damage);
                this.scene.remove(proj);
                this.projectiles.splice(i, 1);
                continue;
            }
            
            if (data.life <= 0) {
                this.scene.remove(proj);
                this.projectiles.splice(i, 1);
            }
        }
    }
    
    aoeAttack(player) {
        game.addChatMessage(`${this.name} использует УДАР ПО ЗЕМЛЕ!`, 'damage');
        
        // Визуальный эффект AoE
        const ringGeo = new THREE.RingGeometry(0.5, this.attackRange * 2, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xff4400,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(this.mesh.position);
        ring.position.y = 0.1;
        this.scene.add(ring);
        
        // Урон по площади
        const dist = this.mesh.position.distanceTo(player.mesh.position);
        if (dist < this.attackRange * 2) {
            const aoeDamage = Math.floor(this.damage * 1.5);
            player.takeDamage(aoeDamage);
            game.addChatMessage(`AoE урон: ${aoeDamage}!`, 'damage');
        }
        
        // Анимация
        let scale = 1;
        const animate = () => {
            scale += 0.1;
            ring.scale.set(scale, scale, scale);
            ring.material.opacity -= 0.03;
            if (ring.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(ring);
            }
        };
        animate();
    }
    
    createMeleeEffect(player) {
        const geometry = new THREE.SphereGeometry(0.3, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.8
        });
        const effect = new THREE.Mesh(geometry, material);
        effect.position.copy(player.mesh.position);
        effect.position.y = 1.5;
        this.scene.add(effect);
        
        let scale = 1;
        const animate = () => {
            scale += 0.1;
            effect.scale.set(scale, scale, scale);
            effect.material.opacity -= 0.05;
            if (effect.material.opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                this.scene.remove(effect);
            }
        };
        animate();
    }
    
    destroy() {
        this.scene.remove(this.mesh);
        this.scene.remove(this.shadow);
        if (this.rankAura) {
            this.scene.remove(this.rankAura);
            if (this.rankAura.material) {
                if (this.rankAura.material.map) this.rankAura.material.map.dispose();
                this.rankAura.material.dispose();
            }
            this.rankAura = null;
        }
        this.projectiles.forEach(p => this.scene.remove(p));
        this.projectiles = [];
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.SpawnManager = SpawnManager;
window.MOB_DATABASE = MOB_DATABASE;
window.ZoneEnemy = ZoneEnemy;