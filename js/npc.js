// ============================================
// PROJECT STEAM: ORIGINS - NPC.JS
// NPC: Гилберт, Биотин, Милли, Бот-01
// Функции: квесты, торговля, баффы, сертификация
// ============================================

// ============================================
// БАЗА ДАННЫХ NPC
// ============================================
const NPC_DATABASE = {
    BOT_01: {
        id: 'bot_01',
        name: 'Бот-01',
        title: 'Дрон-помощник',
        type: 'quest',
        position: { x: 5, z: 5 },
        color: 0x44ff44,
        scale: 1.2,
        sprite: {
            body: '#44aa44',
            eyes: '#ffffff',
            flying: true
        },
        quests: ['main_01_welcome'],
        dialogue: {
            idle: [
                'Пип-боп! Площадь Котла приветствует нового жителя. Диагностика завершена: пульс стабилен, винтики на месте.',
                'Служебная заметка: скрип в шарнирах лечится свежей смазкой, а не ударом молота. Загляни к Милли на рынок!',
                'Ошибка 404: Страх не обнаружен. Превосходный показатель для службы на Острове.'
            ]
        }
    },
    
    GILBERT: {
        id: 'gilbert',
        name: 'Инспектор Гилберт',
        title: 'Главный Инспектор Регуляторов',
        type: 'quest',
        position: { x: 0, z: -10 },
        color: 0xffaa44,
        scale: 2.5,
        sprite: {
            body: '#aa6622',
            accent: '#664411',
            eyes: '#ffdd44',
            heavy: true
        },
        sheet: {
            json: 'assets/npc/gilbert_idle.json?v=gilbert-anim-1',
            image: 'assets/npc/gilbert_idle.webp?v=gilbert-anim-1',
            fps: 8.4,
            portrait: 'assets/npc/gilbert_icon.webp?v=icon-3'
        },
        portrait: 'assets/npc/gilbert_icon.webp?v=icon-3',
        quests: ['main_02_perimeter', 'main_04_certification', 'daily_scrapper_hunt', 'side_gilbert_watch'],
        dialogue: {
            idle: [
                'Остров стонет под весом ржавчины. Слышишь этот мерный гул?',
                'Дисциплина — не выбор. Это единственный способ выжить среди пара и шестерен.',
                'Каждый винтик должен быть на своем месте. Готовься к исполнению долга.'
            ],
            angry: [
                'Ты ещё здесь? Работа сама себя не сделает!',
                'Я видел механизмы надёжнее тебя.'
            ]
        }
    },
    
    BIOTIN: {
        id: 'biotin',
        name: 'Старший Техник Биотин',
        title: 'Хранитель Машинного Зала',
        type: 'buff',
        position: { x: -15, z: 0 },
        color: 0x4488ff,
        scale: 2.2,
        sprite: {
            body: '#3366aa',
            accent: '#224488',
            eyes: '#88ccff'
        },
        quests: ['main_03_machines', 'side_audio_log_01', 'main_04_certification_tech', 'path_to_technomancer'],
        buffs: [
            {
                id: 'pressure_boost',
                name: 'Повышенное давление',
                description: '+20% к атаке на 30 минут',
                cost: 500,
                duration: 1800,
                effect: { attackMult: 1.2 }
            },
            {
                id: 'spark_blessing',
                name: 'Благословение Искры',
                description: '+15% к опыту на 1 час',
                cost: 800,
                duration: 3600,
                effect: { expMult: 1.15 }
            },
            {
                id: 'overclock',
                name: 'Разгон',
                description: '+30% к скорости на 10 минут',
                cost: 300,
                duration: 600,
                effect: { speedMult: 1.3 }
            }
        ],
        dialogue: {
            idle: [
                'В каждом механизме бьется Искра. Нужно лишь уметь слушать мерный ритм ее биения.',
                'Машины не виновны в безумии. Их древний протокол комфорта пережил создателей и заблудился в руинах.',
                'Тик-так... слышишь ровный гул в стальных переборках? Это бьется сердце Острова.'
            ],
            buff: [
                'Позволь мне настроить твои распределительные клапаны. Давление выровнено, механизмы смазаны — ступай с миром.',
                'Давление стабильно. Можешь идти.'
            ]
        }
    },
    
    MILLY: {
        id: 'milly',
        name: 'Торговец Милли',
        title: 'Изобретательница и торговец запчастями',
        type: 'shop',
        position: { x: 15, z: -5 },
        color: 0xff44aa,
        scale: 2.0,
        sprite: {
            body: '#aa3366',
            accent: '#662244',
            eyes: '#ffaacc'
        },
        quests: ['side_milly_parts'],
        shop: [
            { itemId: 'synthetic_oil', price: 20 },
            { itemId: 'pressure_canister', price: 30 },
            { itemId: 'soulshot_d', price: 100 },
            { itemId: 'pressure_amplifier', price: 500 },
            { itemId: 'operator_hammer_low', price: 100 },
            { itemId: 'worker_overalls', price: 200 },
            { itemId: 'goggles', price: 80 },
            { itemId: 'leather_gloves', price: 50 },
            { itemId: 'work_boots', price: 60 },
            { itemId: 'copper_earring', price: 300 },
            { itemId: 'steam_hammer', price: 15000 },
            { itemId: 'pneumatic_rifle', price: 18000 },
            { itemId: 'copper_plate', price: 25000 },
            { itemId: 'steam_helmet', price: 12000 },
            { itemId: 'steam_boots', price: 14000 },
            { itemId: 'boiler_shield', price: 20000 },
            { itemId: 'pressure_ring', price: 15000 }
        ],
        dialogue: {
            idle: [
                'О, новый клиент! Или доброволец для проверки конденсаторов? Шучу-шучу! У меня лучшее очищенное масло и оружейные заряды на всем рынке.',
                'Не трогай вон тот синий тумблер! А, ладно, трогай... предохранитель вроде держал. Тебе соулшотов для боя отсыпать или запасных канистр?',
                'Шестерни вертятся, клапаны свистят, поставки идут по плану. Запасайся припасами, пока реактор не чихнул!'
            ],
            shop: [
                'Что нужно? Есть запчасти, расходники, немного безумия.',
                'Цены честные. Ну, почти. Ладно, не очень.'
            ]
        }
    }
};

// L2-like NPC draw distance (match server AOI ≈ 90 / leave ≈ 108)
const NPC_VIS_ENTER = 90;
const NPC_VIS_LEAVE = 108;

// ============================================
// КЭШ И ЗАГРУЗЧИК СПРАЙТ-ШИТОВ ДЛЯ NPC
// ============================================
const NpcSheetCache = {
    _json: new Map(),
    _tex: new Map(),

    loadJson(url) {
        if (!url) return Promise.resolve(null);
        const fetchUrl = url.includes('?v=') ? url : (url + '?v=anim-48-v3');
        if (this._json.has(fetchUrl)) return Promise.resolve(this._json.get(fetchUrl));
        return fetch(fetchUrl)
            .then(res => {
                if (!res.ok) throw new Error('HTTP ' + res.status);
                return res.json();
            })
            .then(data => {
                this._json.set(fetchUrl, data);
                return data;
            })
            .catch(err => {
                console.warn('[NpcSheet] JSON load error', fetchUrl, err);
                this._json.set(fetchUrl, null);
                return null;
            });
    },

    loadTexture(url) {
        if (!url) return Promise.resolve(null);
        const fetchUrl = url.includes('?v=') ? url : (url + '?v=anim-48-v3');
        if (this._tex.has(fetchUrl)) return Promise.resolve(this._tex.get(fetchUrl));
        return new Promise((resolve) => {
            const loader = new THREE.TextureLoader();
            loader.load(
                fetchUrl,
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
                    tex.magFilter = THREE.NearestFilter;
                    tex.minFilter = THREE.LinearFilter;
                    tex.generateMipmaps = false;
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.ClampToEdgeWrapping;
                    tex.matrixAutoUpdate = true;
                    this._tex.set(fetchUrl, tex);
                    resolve(tex);
                },
                undefined,
                (err) => {
                    console.warn('[NpcSheet] Texture load error', fetchUrl, err);
                    this._tex.set(fetchUrl, null);
                    resolve(null);
                }
            );
        });
    }
};

if (typeof window !== 'undefined') window.NpcSheetCache = NpcSheetCache;

// ============================================
// МЕНЕДЖЕР NPC
// ============================================
class NPCManager {
    constructor(scene) {
        this.scene = scene;
        this.npcs = [];
        this.activeNPC = null;
        
        this.init();
    }
    
    init() {
        const templates = window.WorldMetrics ? window.WorldMetrics.buildCityNPCs().concat(window.WorldMetrics.buildRegionNPCs()) : Object.values(NPC_DATABASE);
        templates.forEach(template => {
            this.createNPC(template);
        });
        
        console.log('[NPC] Менеджер NPC инициализирован (' + this.npcs.length + ' NPC)');
    }
    
    createNPC(template) {
        const npc = new NPC(this.scene, template);
        this.npcs.push(npc);
        return npc;
    }
    
    update(delta, playerPosition) {
        this.npcs.forEach(npc => npc.update(delta, playerPosition));
    }
    
    getNPCById(id) {
        return this.npcs.find(n => (n.template.id === id || n.template.legacyId === id));
    }
    
    interactWithNPC(npc) {
        this.activeNPC = npc;

        // Прогресс talk-целей считает сервер: он же проверяет дистанцию до NPC.
        // Раньше это был локальный updateTalkProgress по localStorage.
        const net = game && game.net;
        if (net && typeof net.intentNpcTalk === 'function') {
            net.intentNpcTalk(npc.template.id);
        }

        // Показываем UI взаимодействия
        game.npcUI.showNPC(npc);
    }

    /** Перекрасить индикаторы квестов у всех NPC (после пакета `quests`). */
    refreshQuestIndicators() {
        for (let i = 0; i < this.npcs.length; i++) {
            const n = this.npcs[i];
            if (n && typeof n.updateQuestIndicator === 'function') n.updateQuestIndicator();
        }
    }
    
    getNPCsInRange(position, range = 5) {
        return this.npcs.filter(npc => 
            npc.mesh && npc.mesh.position && npc.mesh.position.distanceTo(position) < range
        );
    }

    getNPCMeshes() {
        const list = [];
        for (let i = 0; i < this.npcs.length; i++) {
            const npc = this.npcs[i];
            if (npc.mesh && npc.mesh.visible !== false) {
                list.push(npc.mesh);
            }
        }
        return list;
    }

    getNPCByMesh(mesh) {
        if (!mesh) return null;
        let curr = mesh;
        while (curr) {
            const found = this.npcs.find(n => n.mesh === curr);
            if (found) return found;
            curr = curr.parent;
        }
        return null;
    }

    findNPCUnderRay(raycaster, maxRange = 140) {
        if (!raycaster || !raycaster.ray) return null;
        const ray = raycaster.ray;
        let closestNpc = null;
        let closestDist = Infinity;

        // 1. Попытка стандартного Three.js raycasting по спрайтам
        const meshes = this.getNPCMeshes();
        if (meshes.length) {
            const hits = raycaster.intersectObjects(meshes, true);
            if (hits.length && hits[0].distance < maxRange) {
                const hitNpc = this.getNPCByMesh(hits[0].object);
                if (hitNpc) return hitNpc;
            }
        }

        // 2. Fallback: Proximity ray-to-cylinder/point hit test (щедрый клик-бокс)
        for (let i = 0; i < this.npcs.length; i++) {
            const npc = this.npcs[i];
            if (!npc.mesh || npc.mesh.visible === false) continue;
            const pos = npc.mesh.position;
            const scale = (npc.template && npc.template.scale) || 2.4;
            const radius = Math.max(1.1, scale * 0.5);
            const center = new THREE.Vector3(pos.x, pos.y, pos.z);

            const dOrigin = ray.origin.distanceTo(center);
            if (dOrigin > maxRange) continue;

            const distToRay = ray.distanceToPoint(center);
            if (distToRay <= radius) {
                if (dOrigin < closestDist) {
                    closestDist = dOrigin;
                    closestNpc = npc;
                }
            }
        }
        return closestNpc;
    }
}

// ============================================
// КЛАСС NPC
// ============================================
class NPC {
    constructor(scene, template) {
        this.scene = scene;
        this.template = template;
        this.name = template.name;
        this.title = template.title;
        
        this.animTimer = 0;
        this.currentFrameIdx = -1;
        this.sheetFrames = null;
        this.sheetTexture = null;
        this.sheetFps = 8.4;
        
        this.createMesh();
        this.createNameTag();
        this.createInteractionIndicator();
        
        this.bobTimer = Math.random() * Math.PI * 2;

        // Попытка асинхронной загрузки полноценного анимированного спрайт-шита
        this._tryLoadSheet();
    }
    
    createMesh() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const sprite = this.template.sprite || { body: '#5566aa', eyes: '#aaccff' };
        
        // Тело
        ctx.fillStyle = sprite.body || '#5566aa';
        if (sprite.flying) {
            ctx.beginPath();
            ctx.arc(32, 32, 14, 0, Math.PI * 2);
            ctx.fill();
        } else if (sprite.heavy) {
            ctx.fillRect(12, 16, 40, 40);
        } else {
            ctx.fillRect(16, 20, 32, 36);
        }
        
        // Акценты
        if (sprite.accent) {
            ctx.fillStyle = sprite.accent;
            ctx.fillRect(20, 40, 24, 12);
        }
        
        // Глаза
        ctx.fillStyle = sprite.eyes || '#ffffff';
        ctx.beginPath();
        ctx.arc(26, 28, 4, 0, Math.PI * 2);
        ctx.arc(38, 28, 4, 0, Math.PI * 2);
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });
        
        let px = this.template.position ? this.template.position.x : 0;
        let pz = this.template.position ? this.template.position.z : 0;

        if (window.WorldMetrics) {
            const WM = window.WorldMetrics;
            const match = WM.buildCityNPCs().concat(WM.buildRegionNPCs()).find(n => n.id === this.template.id);
            if (match && match.position) {
                px = match.position.x;
                pz = match.position.z;
            }
        }

        const gh = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
        const scale = this.template.scale || 2.0;

        this.mesh = new THREE.Sprite(material);
        this.mesh.scale.set(scale, scale, 1);
        this.baseY = Math.max(gh, (window.Terrain ? window.Terrain.seaLevel - 0.3 : 0)) + scale / 2;
        this.mesh.position.set(px, this.baseY, pz);
        this.mesh.castShadow = true;
        
        this.scene.add(this.mesh);
        
        // Тень
        const shadowGeo = new THREE.CircleGeometry(scale * 0.35, 16);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.3
        });
        this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
        this.shadow.rotation.x = -Math.PI / 2;
        this.shadow.position.set(px, gh + 0.02, pz);
        this.scene.add(this.shadow);
    }

    _resolveSheetConfig() {
        const t = this.template || {};
        if (t.sheet && (t.sheet.json || t.sheet.image)) {
            return {
                json: t.sheet.json,
                image: t.sheet.image,
                fps: t.sheet.fps || 12,
                scale: t.scale || 2.5
            };
        }
        // Автоопределение для известных NPC с готовыми ассетами
        if (t.id === 'gilbert') {
            return {
                json: 'assets/npc/gilbert_idle.json?v=gilbert-anim-1',
                image: 'assets/npc/gilbert_idle.webp?v=gilbert-anim-1',
                fps: 8.4,
                scale: t.scale || 2.5
            };
        }
        return null;
    }

    _setupSingleTexture(tex) {
        if (!this.mesh) return;
        this.mesh.material.map = tex;
        this.mesh.material.transparent = true;
        this.mesh.material.alphaTest = 0.18;
        this.mesh.material.depthWrite = false;
        this.mesh.material.needsUpdate = true;
    }

    _tryLoadSheet() {
        const cfg = this._resolveSheetConfig();
        if (!cfg) return;

        const jsonUrl = cfg.json;
        const imgUrl = cfg.image || (jsonUrl ? jsonUrl.replace(/\.json(\?.*)?$/i, '.webp$1') : null);

        if (jsonUrl) {
            NpcSheetCache.loadJson(jsonUrl).then(jsonData => {
                if (!jsonData || !jsonData.frames) {
                    console.warn('[NPC] JSON data invalid or empty for', jsonUrl, jsonData);
                    return;
                }
                let imgToLoad = cfg.image;
                if (!imgToLoad && jsonData.meta && jsonData.meta.image) {
                    const cleanJsonUrl = jsonUrl.split('?')[0];
                    const dir = cleanJsonUrl.substring(0, cleanJsonUrl.lastIndexOf('/') + 1);
                    const query = jsonUrl.includes('?') ? jsonUrl.substring(jsonUrl.indexOf('?')) : '';
                    imgToLoad = dir + jsonData.meta.image + query;
                }
                if (!imgToLoad) imgToLoad = imgUrl;
                NpcSheetCache.loadTexture(imgToLoad).then(tex => {
                    if (!tex || !this.mesh) return;
                    this._setupSheetAnimation(jsonData, tex, cfg.fps || 12);
                });
            });
        } else if (imgUrl) {
            NpcSheetCache.loadTexture(imgUrl).then(tex => {
                if (!tex || !this.mesh) return;
                this._setupSingleTexture(tex);
            });
        }
    }

    _setupSheetAnimation(jsonData, tex, fps) {
        if (!this.mesh) return;
        const meta = jsonData.meta || {};
        const imgW = (meta.size && meta.size.w) || (tex.image && tex.image.width) || 945;
        const imgH = (meta.size && meta.size.h) || (tex.image && tex.image.height) || 1820;

        const rawFrames = jsonData.frames;
        let framesList = [];
        if (Array.isArray(rawFrames)) {
            framesList = rawFrames;
        } else if (typeof rawFrames === 'object') {
            const keys = Object.keys(rawFrames).sort();
            framesList = keys.map(k => rawFrames[k]);
        }

        if (!framesList.length) return;

        const animTex = tex.clone();
        animTex.wrapS = THREE.RepeatWrapping;
        animTex.wrapT = THREE.ClampToEdgeWrapping;
        animTex.colorSpace = THREE.SRGBColorSpace || animTex.colorSpace;
        animTex.magFilter = THREE.NearestFilter;
        animTex.minFilter = THREE.LinearFilter;
        animTex.generateMipmaps = false;
        animTex.matrixAutoUpdate = true;

        this.sheetTexture = animTex;
        this.sheetFrames = framesList;
        this.sheetWidth = imgW;
        this.sheetHeight = imgH;
        this.sheetFps = fps || 12;
        this.animTimer = 0;
        this.currentFrameIdx = -1;

        const f0 = (framesList[0].frame || framesList[0]);
        const frameW = f0.w || 131;
        const frameH = f0.h || 256;
        const aspect = frameW / frameH;
        const scaleY = this.template.scale || 2.5;
        const scaleX = scaleY * aspect;

        this.mesh.scale.set(scaleX, scaleY, 1);
        
        const px = this.mesh.position.x;
        const pz = this.mesh.position.z;
        const gh = window.Terrain ? window.Terrain.heightAt(px, pz) : 0;
        this.baseY = Math.max(gh, (window.Terrain ? window.Terrain.seaLevel - 0.3 : 0)) + scaleY / 2;
        this.mesh.position.y = this.baseY;

        if (this.shadow) {
            this.shadow.scale.set(scaleX * 0.7, scaleX * 0.7, 1);
        }

        this.nameTagOffsetY = scaleY * 0.58 + (this.title ? 0.8 : 0.45);
        this.questOffsetY = scaleY * 0.58 + (this.title ? 1.9 : 1.4);

        this.mesh.material.map = animTex;
        this.mesh.material.transparent = true;
        this.mesh.material.alphaTest = 0.18;
        this.mesh.material.depthWrite = false;
        this.mesh.material.needsUpdate = true;

        this._applyFrameUV(0);
        console.log(`[NPC] Загружен анимированный лист для NPC ${this.template.id} (${framesList.length} кадров)`);
    }

    _applyFrameUV(idx) {
        if (!this.sheetTexture || !this.sheetFrames || !this.sheetFrames.length) return;
        const fData = this.sheetFrames[idx % this.sheetFrames.length];
        const f = fData.frame || fData;
        if (!f) return;

        const uCell = f.w / this.sheetWidth;
        const vCell = f.h / this.sheetHeight;
        const uOffset = f.x / this.sheetWidth;
        const vOffset = 1.0 - (f.y + f.h) / this.sheetHeight;

        this.sheetTexture.repeat.set(uCell, vCell);
        this.sheetTexture.offset.set(uOffset, vOffset);
        this.sheetTexture.updateMatrix();
    }
    
    createNameTag() {
        const name = this.name || (this.template && this.template.name) || '';
        const rawTitle = this.title || (this.template && this.template.title) || '';
        const title = rawTitle ? (rawTitle.startsWith('<') ? rawTitle : `< ${rawTitle} >`) : '';
        const hasTitle = !!title;

        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = hasTitle ? 256 : 128;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Аутентичные цвета классических неймплейтов:
        // Титул: Небесно-голубой (#55c8ff / #60d0ff)
        // Имя: Золотисто-желтый (#ffe066 / #ffd866)
        const nameColor = this.template && this.template.color
            ? ('#' + this.template.color.toString(16).padStart(6, '0'))
            : '#ffe066';
        const titleColor = this.template && this.template.titleColor
            ? this.template.titleColor
            : '#55c8ff';

        if (hasTitle) {
            // Титул (сверху): крупный четкий шрифт 50px с глубоким контуром 8px
            ctx.font = 'bold 50px "Segoe UI", Tahoma, Arial, sans-serif';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 8;
            ctx.strokeText(title, 512, 68);
            ctx.fillStyle = titleColor;
            ctx.fillText(title, 512, 68);

            // Имя (снизу): золотой крупный шрифт 72px с контуром 10px
            ctx.font = 'bold 72px "Segoe UI", Tahoma, Arial, sans-serif';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 10;
            ctx.strokeText(name, 512, 175);
            ctx.fillStyle = nameColor;
            ctx.fillText(name, 512, 175);
        } else {
            // Только имя по центру
            ctx.font = 'bold 76px "Segoe UI", Tahoma, Arial, sans-serif';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 10;
            ctx.strokeText(name, 512, 64);
            ctx.fillStyle = nameColor;
            ctx.fillText(name, 512, 64);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        
        // Крупный масштаб в 3D мире (6.0м x 1.5м) с идеальными пропорциями 1:1
        const worldHeight = hasTitle ? 1.5 : 0.85;
        const worldWidth = worldHeight * (canvas.width / canvas.height); // 1.5 * (1024/256) = 6.0м
        
        this.nameTag = new THREE.Sprite(material);
        this.nameTag.scale.set(worldWidth, worldHeight, 1);
        this.nameTagOffsetY = (this.template.scale || 2.0) * 0.58 + (hasTitle ? 0.8 : 0.45);
        this.nameTag.position.set(this.mesh.position.x, this.mesh.position.y + this.nameTagOffsetY, this.mesh.position.z);
        this.nameTag.renderOrder = 997;
        this.scene.add(this.nameTag);
    }
    
    createInteractionIndicator() {
        // Восклицательный знак над NPC с квестами (High DPI + Glow)
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Свечение
        const radGrad = ctx.createRadialGradient(64, 64, 8, 64, 64, 56);
        radGrad.addColorStop(0, 'rgba(255, 235, 100, 0.95)');
        radGrad.addColorStop(0.5, 'rgba(255, 185, 40, 0.4)');
        radGrad.addColorStop(1, 'rgba(255, 185, 40, 0)');
        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(64, 64, 56, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '900 64px "Segoe UI", Tahoma, Arial, sans-serif';
        ctx.strokeStyle = '#2a1a00';
        ctx.lineWidth = 7;
        ctx.strokeText('!', 64, 64);
        ctx.fillStyle = '#fff066';
        ctx.fillText('!', 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false
        });
        
        this.questIndicator = new THREE.Sprite(material);
        this.questIndicator.scale.set(1.4, 1.4, 1);
        this.questOffsetY = (this.template.scale || 2.0) * 0.58 + (this.title ? 1.9 : 1.4);
        this.questIndicator.position.set(this.mesh.position.x, this.mesh.position.y + this.questOffsetY, this.mesh.position.z);
        this.questIndicator.renderOrder = 998;
        this.scene.add(this.questIndicator);
        
        // Пульсация
        this.indicatorPulse = 0;
    }

    _setNpcOpacity(alpha) {
        if (!this.mesh) return;
        const a = Math.max(0.0, Math.min(1.0, alpha));
        this.mesh.traverse(child => {
            if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                for (let mIdx = 0; mIdx < mats.length; mIdx++) {
                    const m = mats[mIdx];
                    if (!m) continue;
                    if (m.userData && m.userData._l2OrigTrans === undefined) {
                        m.userData._l2OrigTrans = m.transparent;
                        m.userData._l2OrigDepthWrite = m.depthWrite;
                    }
                    if (a < 0.99) {
                        m.transparent = true;
                        m.depthWrite = true;
                        m.opacity = a;
                    } else {
                        m.transparent = m.userData ? !!m.userData._l2OrigTrans : false;
                        m.depthWrite = m.userData ? !!m.userData._l2OrigDepthWrite : true;
                        m.opacity = 1.0;
                    }
                }
            } else if (child.isSprite && child.material && child !== this.nameTag && child !== this.questIndicator) {
                child.material.opacity = a;
            }
        });
    }
    
    update(delta, playerPosition) {
        if (!this.mesh) return;
        const g = window.game;
        const vis = window.L2VisibilityManager || window.L2Vis;
        const pp = playerPosition || (g && g.player && g.player.mesh ? g.player.mesh.position : null);

        let inFrustum = true;
        let dist = 0;
        let npAlpha = 1;
        let culledDist = false;

        const clip = (vis && vis.config && vis.config.clippingRange) ? vis.config.clippingRange : { actorsMax: 140, nameplate: 40, nameplateFade: 8 };
        const maxDist = clip.actorsMax || 140.0;
        const nameDist = clip.nameplate || 40.0;
        const nameFade = clip.nameplateFade || 8.0;
        const nearImmunity = (vis && vis.config && vis.config.frustum && vis.config.frustum.nearImmunityRadius != null)
            ? vis.config.frustum.nearImmunityRadius
            : 18.0;

        if (pp) {
            const dx = this.mesh.position.x - pp.x;
            const dz = this.mesh.position.z - pp.z;
            dist = Math.hypot(dx, dz);
            this._l2Dist = dist;

            if (dist > maxDist) {
                culledDist = true;
                this._visState = 'culled_distance';
                this._inFrustum = false;
            } else if (dist <= nearImmunity) {
                inFrustum = true;
                this._inFrustum = true;
                this._visState = (dist <= 40 ? 'visible_near' : 'visible_far');
            } else if (vis && typeof vis.isSphereInFrustum === 'function') {
                inFrustum = vis.isSphereInFrustum(this.mesh.position.x, (this.mesh.position.y || 0) + 1.2, this.mesh.position.z, 2.0);
                this._inFrustum = inFrustum;
                this._visState = inFrustum ? (dist <= 40 ? 'visible_near' : 'visible_far') : 'culled_frustum';
            }

            // Канон L2: надписи имён и индикаторы квестов скрыты вдали и плавно проявляются ближе nameDist (40м)
            if (dist <= nameDist) {
                if (dist > nameDist - nameFade) {
                    npAlpha = 1.0 - (dist - (nameDist - nameFade)) / nameFade;
                } else {
                    npAlpha = 1.0;
                }
            } else {
                npAlpha = 0;
            }
        }
        this._nameplateAlpha = npAlpha;

        const isVis = inFrustum && !culledDist;

        // Плавный фейд прозрачности (Alpha Fade In / Out)
        if (this._alphaFade == null) this._alphaFade = isVis ? 1.0 : 0.0;
        if (isVis) {
            this._alphaFade = Math.min(1.0, this._alphaFade + delta * 3.5);
        } else {
            this._alphaFade = Math.max(0.0, this._alphaFade - delta * 4.0);
        }

        if (this._alphaFade <= 0.01) {
            if (this.mesh.visible) this.mesh.visible = false;
            if (this.shadow) this.shadow.visible = false;
            if (this.nameTag) this.nameTag.visible = false;
            if (this.questIndicator) this.questIndicator.visible = false;
            return;
        }

        if (!this.mesh.visible) this.mesh.visible = true;
        if (this.shadow) {
            this.shadow.visible = this._alphaFade > 0.05;
            if (this.shadow.material) this.shadow.material.opacity = 0.6 * this._alphaFade;
        }

        this._setNpcOpacity(this._alphaFade);

        if (this.nameTag) {
            const npA = npAlpha * this._alphaFade;
            if (npA > 0.02) {
                this.nameTag.visible = true;
                this.nameTag.position.set(this.mesh.position.x, this.mesh.position.y + this.nameTagOffsetY, this.mesh.position.z);
                if (this.nameTag.material) this.nameTag.material.opacity = npA;
            } else {
                this.nameTag.visible = false;
            }
        }

        if (this.questIndicator) {
            const isVis = (npAlpha > 0.08 && this._alphaFade > 0.1);
            this.questIndicator.visible = isVis;
            if (isVis) {
                const pulse = (1 + Math.sin(this.indicatorPulse) * 0.12) * 0.85;
                this.questIndicator.scale.set(pulse, pulse, 1);
                this.questIndicator.position.set(this.mesh.position.x, this.mesh.position.y + this.questOffsetY, this.mesh.position.z);
            }
        }

        // Анимация кадров спрайт-шита или покачивание болванки
        if (this.sheetFrames && this.sheetFrames.length > 0) {
            this.animTimer += delta;
            const frameIdx = Math.floor(this.animTimer * (this.sheetFps || 8.4)) % this.sheetFrames.length;
            if (frameIdx !== this.currentFrameIdx) {
                this.currentFrameIdx = frameIdx;
                this._applyFrameUV(frameIdx);
            }
            // Для анимированного NPC фиксируем точное стояние на земле без дрожания
            this.mesh.position.y = this.baseY;
        } else {
            // Покачивание (idle анимация для базовых NPC без текстурного шита)
            this.bobTimer += delta * 2;
            this.mesh.position.y = this.baseY + Math.sin(this.bobTimer) * 0.1;
        }
        
        // Пульсация индикатора квеста
        this.indicatorPulse += delta * 3;
        
        // Проверка доступных квестов
        this.updateQuestIndicator();
    }
    
    updateQuestIndicator() {
        if (!this.questIndicator) return;
        const qm = game && game.questManager;
        if (!qm) {
            this.questIndicator.material.color.setHex(0x888888);
            return;
        }

        const quests = (this.template && this.template.quests) || [];
        if (!quests.length) {
            this.questIndicator.material.color.setHex(0x888888);
            return;
        }

        // Доступность считает сервер (уровень, цепочка, daily-сброс) и
        // присылает списком available в пакете `quests`.
        const hasAvailableQuest = quests.some(qId => qm.isAvailable(qId));
        const hasCompletableQuest = quests.some(qId => {
            const doneState = (typeof QUEST_STATES !== 'undefined' && QUEST_STATES.COMPLETABLE) || 'completable';
            return qm.stateOf(qId) === doneState;
        });

        if (hasCompletableQuest) {
            this.questIndicator.material.color.setHex(0x44ff44);
        } else if (hasAvailableQuest) {
            this.questIndicator.material.color.setHex(0xffdd44);
        } else {
            this.questIndicator.material.color.setHex(0x888888);
        }
    }

    getAvailableQuests() {
        const qm = game && game.questManager;
        if (!qm) return [];
        const quests = (this.template && this.template.quests) || [];
        return quests.filter(qId => qm.isAvailable(qId));
    }

    getCompletableQuests() {
        const qm = game && game.questManager;
        if (!qm) return [];
        const quests = (this.template && this.template.quests) || [];
        const doneState = (typeof QUEST_STATES !== 'undefined' && QUEST_STATES.COMPLETABLE) || 'completable';
        return quests.filter(qId => qm.stateOf(qId) === doneState);
    }
    
    getRandomIdleDialogue() {
        const dialogues = this.template.dialogue.idle;
        return dialogues[Math.floor(Math.random() * dialogues.length)];
    }
    
    destroy() {
        this.scene.remove(this.mesh);
        this.scene.remove(this.shadow);
    }
}

// ============================================
// ЭКСПОРТ
// ============================================
window.NPCManager = NPCManager;
window.NPC = NPC;
window.NPC_DATABASE = NPC_DATABASE;