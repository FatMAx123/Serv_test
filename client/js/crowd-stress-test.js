// ============================================================
//  CROWD-STRESS-TEST.JS — High-Performance 3D Character Swarm & AI Brain
//  Полноценные 3D персонажи (man.glb) с контроллером движения как у игрока,
//  FSM-мозгом (патруль по маршрутам, скамьи, визиты к NPC, осмотр памятников, чат),
//  100% canWalk коллизиями (BspBrushes, PropsCollision, Walls, VillageFort)
//  и полной синхронизацией с L2 Visibility и рендером Three.js.
// ============================================================
(function (root, factory) {
  'use strict';
  if (typeof define === 'function' && define.amd) {
    define(['three'], factory);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('three'));
  } else {
    root.CrowdStressTest = factory(root.THREE);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (THREE) {
  'use strict';

  const HAIR_PALETTE = [
    '#c49a45', // golden blonde
    '#4a3319', // dark brown
    '#1a1818', // raven black
    '#7b4426', // chestnut
    '#8a8a8a', // silver grey
    '#b33e20', // red/copper
    '#3a4856'  // slate
  ];

  const CITIZEN_NAMES = [
    'Маркус', 'Эдвин', 'Гарольд', 'Бран', 'Седрик', 'Торин', 'Роланд', 'Валтер',
    'Лидия', 'Хелена', 'Мира', 'Элора', 'Сэра', 'Астрид', 'Катарина', 'Изольда',
    'Ольгерд', 'Дариус', 'Феликс', 'Валерий', 'Рагнар', 'Аллен', 'Гилберт', 'Артур',
    'Беатрис', 'Сильвия', 'Диана', 'Тереза', 'Матильда', 'Эмма', 'Алиса', 'Клара'
  ];

  const LORE_PHRASES = [
    'Слышали гул в паровом цехе? Давление сегодня на пределе!',
    'У Старшего Техника Биотина лучшие шестерни во всей округе.',
    'Говорят, в Котловых землях мобы стали куда агрессивнее.',
    'Хорошо присесть на скамью у фонтана после смены в шахте.',
    'Паровые клапаны на башне работают без сбоев уже третий месяц.',
    'Векс опять повысил цены на длинные мечи, пойду к Доре за щитом.',
    'Красивый закат над Островом. Сталь сверкает на горизонте.'
  ];

  // Валидированные тематические маршруты Деревни поющей стали (100% canWalk)
  const TOWN_CIRCUITS = {
    plaza: [
      { x: -113.0, z: -135.0, name: 'Стела Основателей', action: 'dwell', dwellSec: 3.5, text: 'Стела Основателей напоминает о первых поселенцах...' },
      { x: -108.2, z: -132.1, name: 'Дрон-помощник', action: 'inspect', dwellSec: 2.5, text: 'Дрон-помощник исправно сканирует периметр.' },
      { x: -104.0, z: -126.0, name: 'Фонтан шестерней', action: 'fountain', dwellSec: 4.5, text: 'Фонтан шестерней работает как швейцарские часы.' },
      { x: -113.0, z: -122.0, name: 'Северная арка', action: 'inspect', dwellSec: 3.0, junction: { targetCircuit: 'north_hall', targetNode: 0 } },
      { x: -118.0, z: -132.0, name: 'Западные скамьи', action: 'bench', dwellSec: 15.0, text: 'Присяду на скамью, переведу дух.', junction: { targetCircuit: 'west_craft', targetNode: 0 } },
      { x: -115.0, z: -142.0, name: 'Доска объявлений', action: 'inspect', dwellSec: 3.5, text: 'На доске свежие контракты на охоту.', junction: { targetCircuit: 'south_tavern', targetNode: 0 } },
      { x: -106.0, z: -138.0, name: 'Восточные скамьи', action: 'bench', dwellSec: 15.0, text: 'Восточные скамьи отлично освещены.', junction: { targetCircuit: 'east_academy', targetNode: 0 } }
    ],
    west_craft: [
      { x: -118.0, z: -132.0, name: 'Перекресток мастеров', action: 'dwell', dwellSec: 2.5, junction: { targetCircuit: 'plaza', targetNode: 4 } },
      { x: -122.0, z: -125.0, name: 'Уличные фонари', action: 'inspect', dwellSec: 3.0 },
      { x: -128.0, z: -138.0, name: 'Кузница и мастерские', action: 'inspect', dwellSec: 6.0, text: 'В кузнице кипит работа, пар валит столбом!' },
      { x: -135.0, z: -142.0, name: 'Мастерской проход', action: 'inspect', dwellSec: 2.5 },
      { x: -145.0, z: -148.0, name: 'Склад шестерен', action: 'inspect', dwellSec: 3.0 },
      { x: -155.0, z: -152.0, name: 'Западная развилка', action: 'dwell', dwellSec: 2.5 },
      { x: -168.0, z: -155.0, name: 'Паровой цех', action: 'inspect', dwellSec: 5.0, text: 'Паровые двигатели работают на полную мощность.' },
      { x: -155.0, z: -152.0, name: 'Западная развилка (обратно)', action: 'dwell', dwellSec: 2.5 },
      { x: -145.0, z: -148.0, name: 'Склад шестерен (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -128.0, z: -138.0, name: 'Кузница (обратно)', action: 'inspect', dwellSec: 3.5 },
      { x: -122.0, z: -125.0, name: 'Фонари у площади', action: 'dwell', dwellSec: 2.5, junction: { targetCircuit: 'plaza', targetNode: 4 } }
    ],
    north_hall: [
      { x: -113.0, z: -122.0, name: 'Северная арка', action: 'dwell', dwellSec: 2.5, junction: { targetCircuit: 'plaza', targetNode: 3 } },
      { x: -113.0, z: -112.0, name: 'Северный бульвар 1', action: 'inspect', dwellSec: 2.5 },
      { x: -113.0, z: -100.0, name: 'Аллея ратуши', action: 'inspect', dwellSec: 3.0, text: 'Главная аллея ратуши вымощена прочнейшей сталью.' },
      { x: -110.0, z: -88.0,  name: 'Сквер монолитов', action: 'inspect', dwellSec: 2.5 },
      { x: -105.0, z: -76.0,  name: 'Тень монолитов', action: 'dwell', dwellSec: 4.0, text: 'Здесь прохладно и спокойно в тени монолитов.' },
      { x: -98.0,  z: -68.0,  name: 'Подход к воротам', action: 'inspect', dwellSec: 2.5 },
      { x: -92.0,  z: -60.0,  name: 'Северные ворота', action: 'inspect', dwellSec: 5.0, text: 'Северные ворота охраняют покой города.' },
      { x: -98.0,  z: -68.0,  name: 'Подход к воротам (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -105.0, z: -76.0,  name: 'Тень монолитов (обратно)', action: 'dwell', dwellSec: 2.5 },
      { x: -110.0, z: -88.0,  name: 'Сквер монолитов (обратно)', action: 'inspect', dwellSec: 2.5 }
    ],
    south_tavern: [
      { x: -115.0, z: -142.0, name: 'Южный сход с площади', action: 'dwell', dwellSec: 2.5, junction: { targetCircuit: 'plaza', targetNode: 5 } },
      { x: -115.0, z: -152.0, name: 'Трактирный переулок 1', action: 'inspect', dwellSec: 2.5 },
      { x: -112.0, z: -162.0, name: 'Аллея фонарей', action: 'inspect', dwellSec: 3.0 },
      { x: -108.0, z: -172.0, name: 'Терраса таверны', action: 'bench', dwellSec: 15.0, text: 'В таверне пахнет жареным мясом и элем.' },
      { x: -102.0, z: -182.0, name: 'Склад провизии', action: 'inspect', dwellSec: 3.0 },
      { x: -95.0,  z: -192.0, name: 'Караванный тракт', action: 'inspect', dwellSec: 4.0, text: 'Караваны привозят детали с восточных карьеров.' },
      { x: -90.0,  z: -202.0, name: 'Южные городские ворота', action: 'inspect', dwellSec: 5.0 },
      { x: -95.0,  z: -192.0, name: 'Караванный тракт (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -102.0, z: -182.0, name: 'Склад провизии (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -112.0, z: -162.0, name: 'Аллея фонарей (обратно)', action: 'inspect', dwellSec: 2.5 }
    ],
    east_academy: [
      { x: -106.0, z: -138.0, name: 'Восточный проход площади', action: 'dwell', dwellSec: 2.5, junction: { targetCircuit: 'plaza', targetNode: 6 } },
      { x: -98.0,  z: -135.0, name: 'Восточный базар', action: 'inspect', dwellSec: 4.0, text: 'На восточном базаре всегда оживленная торговля.' },
      { x: -88.0,  z: -132.0, name: 'Улица изобретателей', action: 'inspect', dwellSec: 3.0 },
      { x: -78.0,  z: -130.0, name: 'Манометрическая арка', action: 'inspect', dwellSec: 3.0 },
      { x: -68.0,  z: -128.0, name: 'Тренировочный плац', action: 'inspect', dwellSec: 5.0, text: 'Здесь молодые инженеры обучаются стрельбе.' },
      { x: -78.0,  z: -130.0, name: 'Манометрическая арка (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -88.0,  z: -132.0, name: 'Улица изобретателей (обратно)', action: 'inspect', dwellSec: 2.5 },
      { x: -98.0,  z: -135.0, name: 'Восточный базар (обратно)', action: 'inspect', dwellSec: 3.0 }
    ]
  };

  const CIRCUIT_KEYS = Object.keys(TOWN_CIRCUITS);

  // FSM Состояния AI Мозга бота
  const FSM_PATROL   = 'patrol';
  const FSM_DWELL    = 'dwell';
  const FSM_BENCH    = 'bench';
  const FSM_INSPECT  = 'inspect';
  const FSM_COMBAT   = 'combat';

  class CrowdStressTestManager {
    constructor() {
      this.activeBots = new Map(); // pid -> botRecord
      this.defaultRadius = 30; // meters
      this.defaultCount = 60;
      this.currentBehavior = 'mixed'; // 'mixed' | 'idle' | 'walk' | 'run' | 'combat'
      this.showNames = true;
      this.isUncapped = false;
      this._nextBotPid = 980000;
      this._tickTimer = 0;
      this.enabled = true;
      this._nameTexCache = new Map();
    }

    /**
     * Кэшированная отрисовка L2-неймплейта без лишней GC-нагрузки.
     */
    _getOrCreateNameplateTexture(name, level) {
      const key = `${name}_${level}`;
      let tex = this._nameTexCache.get(key);
      if (!tex) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.font = 'bold 20px "Segoe UI", Tahoma, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.fillText(`${name} · Lv.${level}`, 128, 32);

        tex = new THREE.CanvasTexture(canvas);
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this._nameTexCache.set(key, tex);
      }
      return tex;
    }

    /**
     * Контроллер движения: проверка блокировки шага коллизиями мешей, стен и воды (как у игрока).
     */
    _stepBlocked(ox, oz, nx, nz, py) {
      if (window.Terrain && window.Terrain.canWalkAt && !window.Terrain.canWalkAt(nx, nz)) return true;
      if (window.Walls && window.Walls.hitsBarrier && window.Walls.hitsBarrier(ox, oz, nx, nz)) return true;
      if (window.VillageFort && window.VillageFort.hitsBarrier && window.VillageFort.hitsBarrier(ox, oz, nx, nz)) return true;
      if (window.BspBrushes && window.BspBrushes.hitsBrushXZ && window.BspBrushes.hitsBrushXZ(ox, oz, nx, nz, (py || 0) + 0.5)) return true;
      if (window.PropsCollision && window.PropsCollision.hitsPropXZ && window.PropsCollision.hitsPropXZ(ox, oz, nx, nz, (py || 0) + 0.5)) return true;
      return false;
    }

    /**
     * Бинарный поиск максимального свободного шага до препятствия.
     */
    _maxFreeStep(ox, oz, dx, dz, maxDist, py) {
      const nx = ox + dx * maxDist;
      const nz = oz + dz * maxDist;
      if (!this._stepBlocked(ox, oz, nx, nz, py)) return maxDist;
      let lo = 0, hi = maxDist;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) * 0.5;
        const mx = ox + dx * mid, mz = oz + dz * mid;
        if (this._stepBlocked(ox, oz, mx, mz, py)) hi = mid;
        else lo = mid;
      }
      return lo;
    }

    /**
     * Вычисление высоты грунта с учетом террейна и BSP-платформ города.
     */
    _getStandY(x, z) {
      let gh = 0;
      if (window.Terrain && typeof window.Terrain.heightAt === 'function') {
        gh = window.Terrain.heightAt(x, z);
      }
      if (window.BspBrushes && typeof window.BspBrushes.standYAt === 'function') {
        const by = window.BspBrushes.standYAt(x, z);
        if (by != null && Number.isFinite(by) && by > gh) gh = by;
      }
      return { y: gh + 0.95, shadowY: gh + 0.02 };
    }

    /**
     * Спавн N ботов с контроллером игрока и FSM-мозгом.
     */
    async spawn(count, options) {
      options = options || {};
      const total = Math.max(1, parseInt(count, 10) || this.defaultCount);
      const radius = Math.max(5, parseFloat(options.radius) || (total <= 50 ? 20 : (total <= 100 ? 32 : 50)));
      const behavior = options.behavior || this.currentBehavior;
      const clearPrev = options.clearPrevious !== false;

      if (clearPrev) {
        this.clear();
      }

      const g = window.game;
      if (!g || !g.scene) {
        console.warn('[CrowdStressTest] Game scene not ready');
        return 0;
      }

      const CM = window.CharModel;
      if (!CM || typeof CM.fastClonePlayerModel !== 'function') {
        console.warn('[CrowdStressTest] CharModel.fastClonePlayerModel not available');
        return 0;
      }

      // Центр спавна: позиция игрока
      let cx = -113, cz = -135;
      if (g.player && g.player.mesh && g.player.mesh.position) {
        cx = g.player.mesh.position.x;
        cz = g.player.mesh.position.z;
      }

      // Проверяем, находится ли игрок в пределах города (r < 220м)
      const distToTown = Math.hypot(cx - (-113), cz - (-135));
      const inTown = distToTown < 220;

      // Разогрев шаблона CharModel
      try {
        if (typeof CM.getMasterEngineerTemplate === 'function') {
          await CM.getMasterEngineerTemplate();
        }
      } catch (e) {
        console.warn('[CrowdStressTest] Pre-warm failed:', e);
      }

      const vis = window.L2VisibilityManager || window.L2Vis;
      if (options.uncapped || this.isUncapped) {
        if (vis && vis.setCharacterLimit) vis.setCharacterLimit(Math.max(350, total + 50));
      } else if (vis && vis.setCharacterLimit) {
        if (vis.config && vis.config.massPvp && vis.config.massPvp.characterLimit > 60) {
          vis.setCharacterLimit(60);
        }
      }

      let spawnedCount = 0;

      for (let i = 0; i < total; i++) {
        const pid = ++this._nextBotPid;
        const key = 'p' + pid;

        // Распределение по маршрутам города или по радиусу в поле
        let circuitName = CIRCUIT_KEYS[i % CIRCUIT_KEYS.length];
        let circuit = TOWN_CIRCUITS[circuitName];
        let nodeIdx = i % circuit.length;
        let node = circuit[nodeIdx];

        let x = node.x;
        let z = node.z;

        // Если ботов много или мы в поле — распределяем вокруг точек с проверкой canWalk
        if (!inTown) {
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * radius;
          const testX = cx + Math.cos(ang) * r;
          const testZ = cz + Math.sin(ang) * r;
          if (!this._stepBlocked(cx, cz, testX, testZ, 0)) {
            x = testX;
            z = testZ;
          } else {
            x = cx;
            z = cz;
          }
        } else if (i >= CIRCUIT_KEYS.length * 8) {
          // Легкий джиттер вокруг узлов маршрута для плотной толпы
          const jAng = Math.random() * Math.PI * 2;
          const jR = 0.5 + Math.random() * 2.0;
          const jx = node.x + Math.cos(jAng) * jR;
          const jz = node.z + Math.sin(jAng) * jR;
          if (!this._stepBlocked(node.x, node.z, jx, jz, 0)) {
            x = jx;
            z = jz;
          }
        }

        const stand = this._getStandY(x, z);
        const y = stand.y;
        const shadowY = stand.shadowY;

        // Контейнер персонажа Three.js
        const group = new THREE.Group();
        group.name = 'stress_bot_' + pid;
        group.position.set(x, y, z);
        group.userData.remoteKey = key;
        group.userData.pid = pid;
        group.userData.isStressBot = true;
        g.scene.add(group);

        // Имя и уровень жителя
        const citizenName = CITIZEN_NAMES[i % CITIZEN_NAMES.length] + ` [${i + 1}]`;
        const level = 20 + (i % 25);
        const ttex = this._getOrCreateNameplateTexture(citizenName, level);

        const tag = new THREE.Sprite(new THREE.SpriteMaterial({
          map: ttex,
          transparent: true,
          depthTest: false,
          depthWrite: false
        }));
        tag.scale.set(3.0, 0.56, 1);
        tag.position.set(x, y + 2.05, z);
        tag.renderOrder = 999;
        tag.visible = false;
        tag.userData._ownsMaterial = true;
        g.scene.add(tag);

        // Клонирование 3D модели (<1мс)
        const hairColor = HAIR_PALETTE[i % HAIR_PALETTE.length];
        const isWalker = (i % 5 !== 0); // 80% ходят спокойным шагом, 20% бегают
        const initialAnim = isWalker ? 'walk' : 'run';

        const inst = await CM.fastClonePlayerModel(group, {
          hairColor: hairColor,
          initialAnim: initialAnim,
          staggerPhase: i % 12
        });

        const initialFacing = Math.random() * Math.PI * 2;
        if (inst && typeof inst.setFacing === 'function') {
          inst.setFacing(initialFacing);
        }

        // Запись в CrowdStressTest и net.remote с FSM мозгом
        const botRecord = {
          meshGroup: group,
          shadow: null,
          nameTag: tag,
          _charModel: inst,
          x: x,
          y: y,
          z: z,
          hp: 1250,
          maxHp: 1250,
          name: citizenName,
          pid: pid,
          type: 'p',
          cls: (i % 2 === 0 ? 'operator' : 'engineer'),
          gender: 'male',
          level: level,
          titleName: inTown ? '[Горожанин]' : '[Следопыт]',
          titleColor: '#88ddff',
          nameColor: '#ffffff',
          facing: initialFacing,
          baseScale: 1.85,
          isStressBot: true,
          _behavior: behavior,

          // ─── AI BRAIN & FSM ───
          _fsmState: FSM_PATROL,
          _circuitName: circuitName,
          _nodeIdx: nodeIdx,
          _targetNode: node,
          _dwellTimer: 0,
          _moveSpeed: isWalker ? 3.8 : 6.5,
          _isWalking: isWalker,
          _targetX: node.x,
          _targetZ: node.z,
          _lastChatTime: 0,

          _hx: x,
          _hz: z,
          _hy: y,
          _shy: shadowY
        };

        if (g.net && g.net.remote) {
          g.net.remote.set(key, botRecord);
        }
        this.activeBots.set(pid, botRecord);
        spawnedCount++;
      }

      console.log(`[CrowdStressTest] ✅ Успешно заспавнено ${spawnedCount} 3D горожан с ИИ-мозгом и маршрутами.`);
      return spawnedCount;
    }

    /**
     * Очистка ботов из сцены и памяти.
     */
    clear() {
      const g = window.game;
      let count = 0;

      for (const [pid, bot] of this.activeBots) {
        const key = 'p' + pid;
        if (bot._charModel && typeof bot._charModel.dispose === 'function') {
          try { bot._charModel.dispose(); } catch (e) {}
        }
        if (bot.meshGroup) {
          if (g && g.scene) g.scene.remove(bot.meshGroup);
          bot.meshGroup.traverse((o) => {
            if (o.geometry) try { o.geometry.dispose(); } catch (e) {}
            if (o.material) {
              const mats = Array.isArray(o.material) ? o.material : [o.material];
              mats.forEach(m => {
                if (m.map) try { m.map.dispose(); } catch (e) {}
                try { m.dispose(); } catch (e) {}
              });
            }
          });
        }
        if (bot.nameTag) {
          if (g && g.scene) g.scene.remove(bot.nameTag);
          if (bot.nameTag.material) {
            try { bot.nameTag.material.dispose(); } catch (e) {}
          }
        }
        if (g && g.net && g.net.remote) {
          g.net.remote.delete(key);
        }
        count++;
      }

      this.activeBots.clear();
      console.log(`[CrowdStressTest] 🧹 Очищено ${count} 3D моделей стресс-теста.`);
      return count;
    }

    setBehavior(behavior) {
      this.currentBehavior = behavior || 'mixed';
      for (const [, bot] of this.activeBots) {
        if (!bot._charModel) continue;
        bot._behavior = this.currentBehavior;
      }
    }

    toggleNames(forceVal) {
      this.showNames = forceVal != null ? !!forceVal : !this.showNames;
      return this.showNames;
    }

    toggleUncapped(forceVal) {
      this.isUncapped = forceVal != null ? !!forceVal : !this.isUncapped;
      const vis = window.L2VisibilityManager || window.L2Vis;
      if (vis && vis.setCharacterLimit) {
        if (this.isUncapped) {
          vis.setCharacterLimit(Math.max(350, this.activeBots.size + 50));
        } else {
          vis.setCharacterLimit(60);
        }
      }
      return this.isUncapped;
    }

    /**
     * Главный цикл обновления: ИИ-мозг, движение по маршрутам, коллизии и анимации.
     */
    update(dt) {
      if (!this.enabled || this.activeBots.size === 0) return;

      this._tickTimer = (this._tickTimer || 0) + 1;
      const tick = this._tickTimer;
      const g = window.game;

      for (const [pid, bot] of this.activeBots) {
        const cm = bot._charModel;
        if (!cm) continue;

        // LOD / Frustum culling: если бот не виден, обновляем реже (1 раз в 8 кадров)
        const isVisible = (bot._visState === 'visible_near' || bot._visState === 'visible_far');
        if (!isVisible && ((tick + pid) % 8 !== 0)) continue;

        const effectiveDt = isVisible ? dt : (dt * 8);

        // ════════════════════════════════════════════════════════════
        // FSM ИИ МОЗГ БОТА
        // ════════════════════════════════════════════════════════════

        // 1. Состояние: ОТДЫХ НА СКАМЬЕ (BENCH REST)
        if (bot._fsmState === FSM_BENCH) {
          bot._dwellTimer -= effectiveDt;
          if (bot._dwellTimer <= 0) {
            // Встаем со скамьи и продолжаем патруль
            bot._fsmState = FSM_PATROL;
            if (isVisible && typeof cm.playStand === 'function') cm.playStand();
            else if (isVisible && typeof cm.playIdle === 'function') cm.playIdle();
            this._advanceBotToNextNode(bot);
          }
          continue;
        }

        // 2. Состояние: ОСМОТР ДОСТОПРИМЕЧАТЕЛЬНОСТИ (DWELL / INSPECT)
        if (bot._fsmState === FSM_DWELL || bot._fsmState === FSM_INSPECT) {
          bot._dwellTimer -= effectiveDt;
          if (bot._dwellTimer <= 0) {
            bot._fsmState = FSM_PATROL;
            if (isVisible) {
              if (bot._isWalking && typeof cm.playWalk === 'function') cm.playWalk();
              else if (typeof cm.playRun === 'function') cm.playRun();
            }
            this._advanceBotToNextNode(bot);
          }
          continue;
        }

        // 3. Состояние: ПАТРУЛЬ ПО МАРШРУТУ (PATROL)
        if (bot._fsmState === FSM_PATROL) {
          const dx = bot._targetX - bot.x;
          const dz = bot._targetZ - bot.z;
          const dist = Math.hypot(dx, dz);

          if (dist > 0.35) {
            // Шаг к цели с проверкой коллизий как у реального игрока (_maxFreeStep)
            const dirX = dx / dist;
            const dirZ = dz / dist;
            const wantStep = Math.min(dist, (bot._moveSpeed || 3.8) * effectiveDt);
            const freeStep = this._maxFreeStep(bot.x, bot.z, dirX, dirZ, wantStep, bot.y);

            if (freeStep > 0.01) {
              bot.x += dirX * freeStep;
              bot.z += dirZ * freeStep;
              bot.facing = Math.atan2(dirX, dirZ);
              if (isVisible && typeof cm.setFacing === 'function') cm.setFacing(bot.facing);

              if (isVisible) {
                if (bot._isWalking && typeof cm.playWalk === 'function') cm.playWalk();
                else if (typeof cm.playRun === 'function') cm.playRun();
              }
            } else {
              // Уперлись в препятствие — переходим к следующему узлу
              this._advanceBotToNextNode(bot);
            }

            // Плавное обновление высоты с учетом террейна и мостовых
            const stand = this._getStandY(bot.x, bot.z);
            bot.y += (stand.y - bot.y) * Math.min(1, effectiveDt * 10);
            bot._hy = bot.y;
            bot._shy = stand.shadowY;

            if (bot.meshGroup) {
              bot.meshGroup.position.set(bot.x, bot.y, bot.z);
            }
          } else {
            // Прибыли в целевой узел маршрута! Выполняем контекстное действие
            const node = bot._targetNode;
            const action = node ? node.action : null;

            if (action === 'bench') {
              bot._fsmState = FSM_BENCH;
              bot._dwellTimer = node.dwellSec || 15.0;
              if (isVisible && typeof cm.playSit === 'function') cm.playSit();
              else if (isVisible && typeof cm.playIdle === 'function') cm.playIdle();
            } else if (action === 'fountain' || action === 'inspect') {
              bot._fsmState = FSM_INSPECT;
              bot._dwellTimer = node.dwellSec || 3.5;
              if (isVisible && typeof cm.playIdle === 'function') cm.playIdle();
            } else {
              bot._fsmState = FSM_DWELL;
              bot._dwellTimer = (node && node.dwellSec) || (1.5 + Math.random() * 2.0);
              if (isVisible && typeof cm.playIdle === 'function') cm.playIdle();
            }

            // Случайные лорные реплики в общий чат от горожан
            const now = Date.now();
            if (node && node.text && now - bot._lastChatTime > 45000 && Math.random() < 0.25) {
              bot._lastChatTime = now;
              if (g && g.ui && typeof g.ui.addChatMessage === 'function') {
                g.ui.addChatMessage(`[${bot.name}]: ${node.text}`, 'all');
              }
            }
          }
        }
      }
    }

    /**
     * Продвижение бота к следующему узлу маршрута (с поддержкой перекрёстков Junctions).
     */
    _advanceBotToNextNode(bot) {
      const curCircuit = TOWN_CIRCUITS[bot._circuitName] || TOWN_CIRCUITS.plaza;
      const curNode = curCircuit[bot._nodeIdx];

      // Проверка развилки (Junction): 25% шанс сменить маршрут
      if (curNode && curNode.junction && Math.random() < 0.25) {
        bot._circuitName = curNode.junction.targetCircuit;
        const newCircuit = TOWN_CIRCUITS[bot._circuitName] || TOWN_CIRCUITS.plaza;
        bot._nodeIdx = curNode.junction.targetNode % newCircuit.length;
      } else {
        bot._nodeIdx = (bot._nodeIdx + 1) % curCircuit.length;
      }

      const nextNode = (TOWN_CIRCUITS[bot._circuitName] || TOWN_CIRCUITS.plaza)[bot._nodeIdx];
      bot._targetNode = nextNode;
      bot._targetX = nextNode.x;
      bot._targetZ = nextNode.z;
    }
  }

  const instance = new CrowdStressTestManager();

  if (typeof window !== 'undefined') {
    window.CrowdStressTest = instance;
    if (window.game) {
      window.game.crowdStressTest = instance;
      window.game.spawnStressCrowd = (cnt, rad, beh) => instance.spawn(cnt, { radius: rad, behavior: beh });
      window.game.clearStressCrowd = () => instance.clear();
    }
  }

  return instance;
});
