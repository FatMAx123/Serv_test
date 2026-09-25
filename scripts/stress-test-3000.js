// ============================================================
//  SCRIPTS / STRESS-TEST-3000.JS
//  Сверхнагрузочный стресс-тест MMO-сервера на 3000 одновременных CCU.
//  Равномерно распределяет 3000 ботов по всем 4 зонам/воркерам кластера:
//    - Деревня и гавань (Worker 1: Town)
//    - Восточный полигон и равнины (Worker 2: East)
//    - Западная пустошь и карьеры (Worker 3: West)
//    - Северные холмы и руины (Worker 4: North)
//  Замеряет:
//    - RTT / джиттер с квантилями (p50, p95, p99, max)
//    - Время тика сервера и стабильность 10 Hz
//    - Исходящий/входящий трафик и Zero-Copy экономию
//    - Потребление памяти V8
// ============================================================
'use strict';

const http = require('http');
const path = require('path');
const child_process = require('child_process');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (_) {
  WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));
}
const NPB = require(path.join(__dirname, '..', 'shared', 'net-pack-binary.js'));

// Аргументы командной строки
const args = process.argv.slice(2);
function getArg(name, def) {
  for (const a of args) {
    if (a.startsWith(`--${name}=`)) return a.split('=')[1];
  }
  return def;
}

const USE_BINARY = !args.includes('--json') && (args.includes('--binary') || getArg('proto', process.env.PROTO || 'bin') === 'bin');
const TOTAL_BOTS = parseInt(getArg('bots', process.env.BOTS || '3000'), 10);
const DURATION_SEC = parseInt(getArg('duration', process.env.DURATION || '30'), 10);
const BATCH_SIZE = parseInt(getArg('batch', process.env.BATCH_SIZE || '20'), 10);
const BATCH_INTERVAL_MS = parseInt(getArg('interval', process.env.BATCH_INTERVAL || '200'), 10);
const PORT = parseInt(getArg('port', process.env.PORT || '80'), 10);
const HOST = getArg('host', process.env.HOST || '93.77.168.135');
const WORKERS = parseInt(getArg('workers', process.env.WORKERS || '1'), 10);
const WORKER_ID = parseInt(getArg('worker-id', '-1'), 10);
const BOT_OFFSET = parseInt(getArg('offset', '0'), 10);
const defaultTownBots = Math.min(120, Math.max(15, Math.floor(TOTAL_BOTS * 0.1)));
const TOWN_BOTS = parseInt(getArg('town-bots', process.env.TOWN_BOTS || String(defaultTownBots)), 10); // По умолчанию ~10% онлайна на площади города
const SAFE_TOWN_RADIUS = parseInt(getArg('safe-town-radius', process.env.SAFE_TOWN_RADIUS || '35'), 10); // Радиус мирной зоны площади (35м)
const OUTPUT_FILE = getArg('output', process.env.OUTPUT_FILE || '');

const WS_URL = PORT === 80 ? `ws://${HOST}` : (PORT === 443 ? `wss://${HOST}` : `ws://${HOST}:${PORT}`);
const METRICS_URL = PORT === 80 ? `http://${HOST}/metrics` : (PORT === 443 ? `https://${HOST}/metrics` : `http://${HOST}:${PORT}/metrics`);

const CENTER_ARG = getArg('center', '');
const ZONE_FILTER = getArg('zone', '').toLowerCase();
const CUSTOM_RADIUS = parseInt(getArg('radius', '0'), 10);

let targetCenter = null;
if (CENTER_ARG && CENTER_ARG.includes(',')) {
  const [cx, cz] = CENTER_ARG.split(',').map(Number);
  if (Number.isFinite(cx) && Number.isFinite(cz)) {
    targetCenter = { x: cx, z: cz, radius: CUSTOM_RADIUS > 0 ? CUSTOM_RADIUS : 35, name: 'Target Center', shard: 'West' };
  }
}

// 25 канонических географических зон острова
const ZONES = [
  { name: 'Деревня поющей стали', x: -113, z: -135, radius: 110, shard: 'Town' },
  { name: 'Территория операторов', x: 202, z: 186, radius: 110, shard: 'East' },
  { name: 'Школа инженерии', x: -142.6, z: 326.14, radius: 45, shard: 'West' },
  { name: 'Восточные земли', x: 485, z: -266, radius: 110, shard: 'East' },
  { name: 'Восточный полигон', x: 502, z: -647, radius: 110, shard: 'East' },
  { name: 'Котловые земли', x: 1376, z: -719, radius: 110, shard: 'East' },
  { name: 'Крепость стального предела', x: 1090, z: -1223, radius: 110, shard: 'North' },
  { name: 'Памятник павшим', x: 8, z: -1252, radius: 110, shard: 'North' },
  { name: 'Руины химзавода', x: 1099, z: 273, radius: 110, shard: 'East' },
  { name: 'Междуречье', x: 419, z: 764, radius: 95, shard: 'South' },
  { name: 'Холмы Астарда', x: 22, z: 733, radius: 110, shard: 'South' },
  { name: 'Затерянные Сады', x: -13, z: 1054, radius: 85, shard: 'South' },
  { name: 'Пасека', x: 415, z: 1064, radius: 65, shard: 'South' },
  { name: 'Тихая заводь', x: -1004, z: 1049, radius: 110, shard: 'West' },
  { name: 'Дворы Круны', x: -1284, z: -281, radius: 110, shard: 'West' },
  { name: 'Западные земли', x: -1310, z: 341, radius: 110, shard: 'West' },
  { name: 'Свалка', x: -771, z: 428, radius: 110, shard: 'West' },
  { name: 'Поле забвения', x: -798, z: -989, radius: 110, shard: 'North' },
  { name: 'Бараки Рездика', x: -826, z: -1530, radius: 110, shard: 'North' },
  { name: 'Деревня', x: -113, z: -193, radius: 110, shard: 'Town' },
  { name: 'Башня Круна', x: -1357, z: -645, radius: 110, shard: 'West' },
  { name: 'Гавань', x: -1328, z: 1183, radius: 110, shard: 'West' },
  { name: 'Лаборатория Астарда', x: 228, z: 971, radius: 85, shard: 'South' },
  { name: 'Порт', x: 132, z: 1356, radius: 110, shard: 'South' },
  { name: 'Утёс Стали', x: -1342, z: -1538, radius: 110, shard: 'North' }
];

// Загрузка всех 340 канонических спотов охоты острова
const fs = require('fs');
let ALL_SPOTS = [];
try {
  const WM = require(path.join(__dirname, '..', 'shared', 'world-metrics.js'));
  const overridesPath = path.join(__dirname, '..', 'shared', 'editor-overrides.json');
  if (fs.existsSync(overridesPath)) {
    const raw = fs.readFileSync(overridesPath, 'utf8');
    if (WM.applyEditorOverrides) WM.applyEditorOverrides(JSON.parse(raw));
    if (WM.rebuildMobSpotsFromEditor) WM.rebuildMobSpotsFromEditor();
  }
  ALL_SPOTS = WM.buildSpots();
} catch (e) {
  console.warn('[stress-test] Внимание: не удалось загрузить WM.buildSpots():', e && e.message);
}
if (!ALL_SPOTS || ALL_SPOTS.length === 0) {
  ALL_SPOTS = ZONES;
}

// Для полевых ботов исключаем споты прямо в фонтане мирной площади (r < SAFE_TOWN_RADIUS = 35)
const SAFE_SPOTS = (!ZONE_FILTER && !targetCenter)
  ? ALL_SPOTS.filter(s => {
      const sx = s.x || 0, sz = s.z || 0;
      const dTown = Math.hypot(sx - (-113), sz - (-135));
      return dTown > SAFE_TOWN_RADIUS;
    })
  : ALL_SPOTS;

const ACTIVE_SPOTS = ZONE_FILTER 
  ? ALL_SPOTS.filter(s => (s.zone || s.name || '').toLowerCase().includes(ZONE_FILTER))
  : (SAFE_SPOTS.length > 0 ? SAFE_SPOTS : ALL_SPOTS);
const EFFECTIVE_SPOTS = targetCenter ? [targetCenter] : (ACTIVE_SPOTS.length > 0 ? ACTIVE_SPOTS : ALL_SPOTS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function b64(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function fetchMetrics(retries = 3, timeoutMs = 4000) {
  return new Promise((resolve) => {
    function attempt(n, reqPath = '/metrics') {
      const req = http.get({
        host: HOST,
        port: PORT,
        path: reqPath,
        headers: { Accept: 'application/json' },
        timeout: timeoutMs
      }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed) {
              if (parsed.tickMs == null && parsed.tickMsAvg != null) parsed.tickMs = parsed.tickMsAvg;
              if (parsed.tickMsEma == null && parsed.tickMsAvg != null) parsed.tickMsEma = parsed.tickMsAvg;
            }
            resolve(parsed);
          } catch (_) {
            if (reqPath === '/metrics') attempt(n, '/healthz');
            else if (n > 1) setTimeout(() => attempt(n - 1), 1000);
            else resolve(null);
          }
        });
      });
      req.on('timeout', () => {
        req.destroy();
        if (reqPath === '/metrics') attempt(n, '/healthz');
        else if (n > 1) setTimeout(() => attempt(n - 1), 1000);
        else resolve(null);
      });
      req.on('error', () => {
        if (reqPath === '/metrics') attempt(n, '/healthz');
        else if (n > 1) setTimeout(() => attempt(n - 1), 1000);
        else resolve(null);
      });
    }
    attempt(retries);
  });
}


const NAME_PREFIXES = [
  'Aethel', 'Val', 'Bor', 'Ther', 'Kael', 'Lyan', 'Gar', 'Mor', 'Dar', 'Sel',
  'Van', 'Bran', 'Row', 'Ign', 'Zar', 'Fael', 'Tor', 'Elor', 'Ced', 'Alth',
  'Gid', 'Mir', 'Ald', 'Vesp', 'Cor', 'Kal', 'Ror', 'Tal', 'Orion', 'Balth',
  'Zeph', 'Krag', 'Ravn', 'Fen', 'Syl', 'Axe', 'Storm', 'Shadow', 'Iron', 'Frost',
  'Silver', 'Steel', 'Flame', 'Swift', 'Dark', 'Golden', 'Night', 'Brave', 'Grand', 'Nova'
];
const NAME_SUFFIXES = [
  'gard', 'eria', 'an', 'on', 'en', 'na', 'rick', 'rigan', 'ius', 'ene',
  'or', 'forge', 'ena', 'is', 'ek', 'ath', 'in', 'a', 'ric', 'ea',
  'eon', 'oth', 'el', 'er', 'yn', 'ista', 'y', 'ia', 'us', 'ar',
  'hunter', 'blade', 'knight', 'walker', 'slayer', 'shield', 'runner', 'smith', 'seeker', 'ranger',
  'warden', 'heart', 'storm', 'crest', 'fang', 'gale', 'claw', 'thorn', 'weaver', 'strider'
];
const RACES = ['human', 'elf', 'dark_elf', 'dwarf', 'orc'];
const GENDERS = ['male', 'female'];
const CLASSES = ['operator', 'engineer'];
const HAIR_IDS = ['hair1', 'hair2', 'hair3', 'hair4', 'hair5', 'hair6', 'hair7', 'hair8'];
const HAIR_COLORS = [
  '#c49a45', '#4a3319', '#1a1818', '#7b4426', '#8a8a8a', '#b33e20',
  '#3a4856', '#d4af37', '#e5e7eb', '#2c3e50', '#8e44ad', '#16a085'
];
const SKIN_TONES = [
  '#f5d0b5', '#e0b89b', '#c68b59', '#8d5524', '#e8c5b0', '#dfb196', '#6b4423', '#4a2c11'
];
const FACES = ['face1', 'face2', 'face3', 'face4', 'face5'];

// Архетипы симуляции реального онлайна MMO
const ARCHETYPE_TOWN_TRADER = 'town_trader';   // Торговцы с личными лавками (Private Stores)
const ARCHETYPE_TOWN_CITIZEN = 'town_citizen'; // Горожане: патруль, скамьи, визиты к NPC, дуэли, чат
const ARCHETYPE_FIELD_HUNTER = 'field_hunter'; // Полевые охотники: мобы, ротации скиллов, соулшоты, хилы
const ARCHETYPE_FIELD_PARTIER = 'field_partier'; // Групповые охотники: объединение в пати, ассист

// Торговые ряды и места лавок на площади Деревни поющей стали
const TOWN_MARKET_STALLS = [
  { x: -98.0,  z: -130.0, name: 'Восточный базар (Лавка 1)' },
  { x: -96.0,  z: -132.5, name: 'Восточный базар (Лавка 2)' },
  { x: -99.5,  z: -127.0, name: 'Восточный базар (Лавка 3)' },
  { x: -101.0, z: -134.0, name: 'Восточный базар (Лавка 4)' },
  { x: -128.0, z: -138.0, name: 'Кузница и мастерские (Лавка 5)' },
  { x: -126.0, z: -141.0, name: 'Кузница и мастерские (Лавка 6)' },
  { x: -106.0, z: -138.0, name: 'Восточные скамьи (Лавка 7)' },
  { x: -118.0, z: -132.0, name: 'Западные скамьи (Лавка 8)' },
  { x: -110.0, z: -142.0, name: 'Южный проход (Лавка 9)' },
  { x: -116.0, z: -124.0, name: 'Северная арка (Лавка 10)' }
];

// Канонические шаблоны личных торговых лавок (L2 Private Stores)
const PRIVATE_STORE_TEMPLATES = [
  {
    mode: 'sell',
    title: 'Заряды и Масла Дёшево!',
    items: {
      synthetic_oil: { count: 15, price: 45 },
      soulshot_no_grade: { count: 200, price: 12 },
      potion_alacrity: { count: 3, price: 350 }
    }
  },
  {
    mode: 'sell',
    title: 'Распродажа Расходников',
    items: {
      pressure_canister: { count: 15, price: 45 },
      spiritshot_no_grade: { count: 200, price: 18 },
      potion_wind_walk: { count: 3, price: 400 }
    }
  },
  {
    mode: 'sell',
    title: 'Сталь, Детали и Шестерни',
    items: {
      gear_scrap: { count: 10, price: 120 },
      copper_ore: { count: 8, price: 180 },
      synthetic_oil: { count: 10, price: 50 }
    }
  },
  {
    mode: 'buy',
    title: 'Скупка Шестерен и Руды',
    items: {
      gear_scrap: { count: 50, price: 90 },
      copper_ore: { count: 30, price: 140 }
    }
  },
  {
    mode: 'sell',
    title: 'Всё для кача: Масло+Заряды',
    items: {
      synthetic_oil: { count: 20, price: 42 },
      soulshot_no_grade: { count: 300, price: 11 },
      pressure_canister: { count: 20, price: 42 }
    }
  }
];

// Сервисные NPC города для интерактивного взаимодействия
const TOWN_INTERACTIVE_NPCS = [
  { id: 'biotin', name: 'Старший Техник Биотин', x: 35.8, z: -98.2, service: 'buff' },
  { id: 'trader_vex', name: 'Оружейник Векс', x: -298.0, z: -168.0, service: 'shop' },
  { id: 'trader_dora', name: 'Бронник Дора', x: -298.0, z: -144.0, service: 'shop' },
  { id: 'milly', name: 'Торговец Милли', x: -139.9, z: 84.0, service: 'shop' },
  { id: 'grocer_spark', name: 'Кладовщица Искра', x: -92.1, z: 84.0, service: 'warehouse' }
];

// Точки патрулирования и отдыха на площади Деревни поющей стали (центр [-113, -135])
const TOWN_SQUARE_WAYPOINTS = [
  { x: -113.0, z: -135.0, name: 'Стела Основателей' },
  { x: -108.2, z: -132.1, name: 'Дрон-помощник Бот-01' },
  { x: -123.8, z: -132.1, name: 'Гид-Дрон К-9' },
  { x: -98.0,  z: -130.0, name: 'Восточный базар' },
  { x: -128.0, z: -138.0, name: 'Кузница и мастерские' },
  { x: -113.0, z: -122.0, name: 'Северная арка площади' },
  { x: -113.0, z: -148.0, name: 'Южная аллея к воротам' },
  { x: -118.0, z: -132.0, name: 'Западные скамьи отдыха' },
  { x: -106.0, z: -138.0, name: 'Восточные скамьи' },
  { x: -119.0, z: -140.0, name: 'Сквер у ратуши' },
  { x: -104.0, z: -126.0, name: 'Фонтан шестерней' },
  { x: -122.0, z: -125.0, name: 'Уличные фонари' },
  { x: -115.0, z: -142.0, name: 'Доска объявлений' }
];

// Живые реплики локального чата (all)
const CHAT_ALL_PHRASES = [
  'Кузнец сегодня отличную сталь привез!',
  'Кто в восточные земли на охоту собирается?',
  'Шестеренки опять скрипят, пора смазывать механизм...',
  'Говорят, в руинах химзавода опять элиту видели.',
  'Отдохну немного на площади перед походом.',
  'Цены у торговцев растут с каждым днем.',
  'Дроны-помощники сегодня летают без сбоев.',
  'Деревня поющей стали прекрасна в это время.',
  'Кто-нибудь видел мастера Круна?',
  'Пополняю запасы пара перед рейдом.',
  'На площади сегодня людно, отличная погода.',
  'Слышали гул из шахт? Механизмы оживают.',
  'Проверьте давление в паровых клапанах перед выходом!',
  'У кого есть лишние соулшоты? Куплю немного.',
  'Отличный бой был на холмах, еле унёс ноги.',
  'Масло синтетическое здесь лучшее на острове.'
];

// Реплики глобального крика (shout, !)
const CHAT_SHOUT_PHRASES = [
  '!Ищу пати в Котловые земли на жуков и автоматонов!',
  '!Кто на босса в руинах химзавода? Нужен танк и хил!',
  '!Сбор у стелы основателей на пасеку через 5 минут!',
  '!Осторожно в районе башни Круна, там элитные мобы бродят!',
  '!Ищу инженера в группу для быстрой прокачки!',
  '!Где лучше качаться на 15 уровне, подскажите?'
];

// Торговые объявления (trade, +)
const CHAT_TRADE_PHRASES = [
  '+WTS Соулшоты No-Grade x500 по 12 деталей, сижу на базаре!',
  '+WTB Обломки шестерней и медную руду оптом, в ПМ!',
  '+WTS Синтетическое масло и баллоны пара со скидкой!',
  '+WTS Оружие D-грейда на Оператора, лавка у мастерских!',
  '+WTB Свитки телепорта и воскрешения, дорого!'
];
const TOWN_CHAT_PHRASES = CHAT_ALL_PHRASES;

function generateBotProfile(index) {
  // Биективное отображение для 100% гарантии уникальности имён без дубликатов
  const pIdx = index % NAME_PREFIXES.length;
  const sIdx = Math.floor(index / NAME_PREFIXES.length) % NAME_SUFFIXES.length;
  const cycle = Math.floor(index / (NAME_PREFIXES.length * NAME_SUFFIXES.length));
  const name = cycle === 0
    ? `${NAME_PREFIXES[pIdx]}${NAME_SUFFIXES[sIdx]}`
    : `${NAME_PREFIXES[pIdx]}${NAME_SUFFIXES[sIdx]}_${cycle + 1}`;

  const race = RACES[index % RACES.length];
  const gender = GENDERS[Math.floor(index / RACES.length) % GENDERS.length];
  const cls = CLASSES[(index + Math.floor(index / 7)) % CLASSES.length];
  const hairId = HAIR_IDS[(index * 3) % HAIR_IDS.length];
  const hairColor = HAIR_COLORS[(index * 7) % HAIR_COLORS.length];
  const skinTone = SKIN_TONES[(index * 5) % SKIN_TONES.length];
  const faceId = FACES[(index * 2) % FACES.length];
  const yid = `stress_bot_${String(index).padStart(5, '0')}`;

  return {
    yid,
    name,
    cls,
    race,
    gender,
    appearance: {
      hairId,
      hairColor,
      faceId,
      skinTone
    }
  };
}

const allRtts = [];

class StressBot3000 {
  constructor(index) {
    this.index = index;
    const profile = generateBotProfile(index);
    this.yid = profile.yid;
    this.name = profile.name;
    this.cls = profile.cls;
    this.race = profile.race;
    this.gender = profile.gender;
    this.appearance = profile.appearance;

    // Городской бот площади (только если явно задано через --town-bots > 0, иначе все боты вне города)
    this.isTownBot = (!ZONE_FILTER && !targetCenter) && (TOWN_BOTS > 0) && (index < TOWN_BOTS);
    if (this.isTownBot) {
      this.spot = { name: 'Деревня поющей стали (Площадь)', x: -113, z: -135, r: 22, shard: 'Town' };
      // 30% городских ботов — торговцы личных лавок (Private Store), 70% — активные горожане
      if (index % 10 < 3) {
        this.archetype = ARCHETYPE_TOWN_TRADER;
        this.stall = TOWN_MARKET_STALLS[index % TOWN_MARKET_STALLS.length];
        this.x = this.stall.x;
        this.z = this.stall.z;
        this.speed = 3.5;
        this.isWalking = true;
        this.idleMaxTicks = 1200; // остаётся сидеть в лавке
      } else {
        this.archetype = ARCHETYPE_TOWN_CITIZEN;
        const wp = TOWN_SQUARE_WAYPOINTS[index % TOWN_SQUARE_WAYPOINTS.length];
        this.x = wp.x + (Math.random() - 0.5) * 4;
        this.z = wp.z + (Math.random() - 0.5) * 4;
        this.speed = (index % 3 === 0) ? 3.2 : 5.6;
        this.isWalking = (this.speed <= 3.5);
        this.idleMaxTicks = 25 + Math.floor(Math.random() * 35);
      }
      this.spotRadius = 22;
      this.sitting = false;
    } else {
      // 25% полевых ботов — группы и пати-лидеры, 75% — соло-охотники
      if (index % 4 === 0) {
        this.archetype = ARCHETYPE_FIELD_PARTIER;
      } else {
        this.archetype = ARCHETYPE_FIELD_HUNTER;
      }
      const spotIdx = (TOWN_BOTS > 0 && index >= TOWN_BOTS) ? (index - TOWN_BOTS) : index;
      this.spot = EFFECTIVE_SPOTS[spotIdx % EFFECTIVE_SPOTS.length];
      const spotRadius = CUSTOM_RADIUS > 0 ? CUSTOM_RADIUS : Math.max(12, Math.min(30, (this.spot.r || 25)));
      this.spotRadius = spotRadius;

      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * spotRadius;
      this.x = (this.spot.x || 0) + Math.cos(angle) * dist;
      this.z = (this.spot.z || 0) + Math.sin(angle) * dist;
      this.speed = 6.0;
      this.isWalking = false;
      this.idleMaxTicks = 8;
      this.sitting = false;
    }

    this.targetX = this.x;
    this.targetZ = this.z;
    this.idleTicks = Math.floor(Math.random() * 10);
    this.lastMoveX = this.x;
    this.lastMoveZ = this.z;
    this.pickNewWaypoint();

    this.ws = null;
    this.connected = false;
    this.loggedIn = false;
    this.dead = false;
    this.seq = 0;
    this.connectTimeMs = 0;
    this.pid = null;

    // Списки видимых сущностей
    this.knownMobs = [];
    this.knownPlayers = [];
    this.knownLoots = [];

    // Характеристики и ресурсы персонажа
    this.hp = 100;
    this.maxHp = 100;
    this.energy = 50;
    this.maxEnergy = 50;

    // Боевые механики и расходники
    this.shotArmed = false;
    this.shotArmRequested = false;
    this.lastPotionUseTick = -999;
    this.lastCanisterUseTick = -999;
    this.resting = false;
    this.restTicks = 0;

    // Социальные механики: группы и дуэли
    this.partyId = null;
    this.partyLeader = null;
    this.partyMembers = [];
    this.lastPartyInviteTick = -999;
    this.inDuel = false;
    this.duelPeerPid = null;
    this.lastDuelChallengeTick = -999;

    // Торговля и NPC
    this.storeOpen = false;
    this.lastTradeChatTick = -999;
    this.lastNpcVisitTick = -999;
    this.targetNpc = null;

    // Сетевой трафик и пинг
    this.packetsReceived = 0;
    this.updReceived = 0;
    this.lastPingSent = 0;
    this.lastChatTick = -999;
  }

  pickNewWaypoint() {
    if (this.archetype === ARCHETYPE_TOWN_TRADER) {
      this.targetX = this.stall.x;
      this.targetZ = this.stall.z;
      this.speed = 3.5;
      this.isWalking = true;
      this.idleMaxTicks = 1200;
    } else if (this.archetype === ARCHETYPE_TOWN_CITIZEN) {
      if (Math.random() < 0.3) {
        // 30% шанс пойти к интерактивному NPC (баффер Биотин, магазин Векс/Дора/Милли)
        const npc = TOWN_INTERACTIVE_NPCS[Math.floor(Math.random() * TOWN_INTERACTIVE_NPCS.length)];
        this.targetNpc = npc;
        this.targetX = npc.x + (Math.random() - 0.5) * 1.5;
        this.targetZ = npc.z + (Math.random() - 0.5) * 1.5;
      } else {
        this.targetNpc = null;
        const curWp = this._curWpIndex || 0;
        let nextWp = (curWp + 1 + Math.floor(Math.random() * (TOWN_SQUARE_WAYPOINTS.length - 2))) % TOWN_SQUARE_WAYPOINTS.length;
        this._curWpIndex = nextWp;
        const wp = TOWN_SQUARE_WAYPOINTS[nextWp];
        this.targetX = wp.x + (Math.random() - 0.5) * 3;
        this.targetZ = wp.z + (Math.random() - 0.5) * 3;
      }
      this.speed = (Math.random() < 0.35) ? 3.2 : 5.6;
      this.isWalking = (this.speed <= 3.5);
      this.idleMaxTicks = 25 + Math.floor(Math.random() * 35);
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 3 + Math.random() * Math.max(8, this.spotRadius - 3);
      this.targetX = (this.spot.x || 0) + Math.cos(angle) * dist;
      this.targetZ = (this.spot.z || 0) + Math.sin(angle) * dist;
      this.idleMaxTicks = 8;
    }
    this.idleTicks = 0;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const t0 = Date.now();
      if (this.ws) {
        try {
          this.ws.removeAllListeners();
          this.ws.terminate();
        } catch (_) {}
        this.ws = null;
      }

      let settled = false;
      let timeoutId = null;

      const finish = (err) => {
        if (settled) return;
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (err) {
          try { if (this.ws) this.ws.terminate(); } catch (_) {}
          reject(err);
        } else {
          resolve();
        }
      };

      timeoutId = setTimeout(() => {
        if (!this.loggedIn) {
          finish(new Error(`Timeout for ${this.yid}`));
        }
      }, 60000);

      try {
        this.ws = new WebSocket(WS_URL, { handshakeTimeout: 45000, perMessageDeflate: false });
      } catch (err) {
        return finish(err);
      }

      this.ws.on('open', () => {
        this.connected = true;
        this.send({
          t: 'login',
          data: b64({
            uniqueID: this.yid,
            publicName: this.name,
            race: this.race,
            gender: this.gender,
            cls: this.cls,
            appearance: this.appearance,
            issuedAt: Date.now()
          }),
          signature: '',
          binary: USE_BINARY,
          char: {
            name: this.name,
            cls: this.cls,
            race: this.race,
            gender: this.gender,
            appearance: this.appearance,
            x: this.x,
            z: this.z
          }
        });
      });

      this.ws.on('message', (raw) => {
        this.packetsReceived++;
        let data = raw;
        if (Buffer.isBuffer(data)) {
          if (data.length > 0) {
            const op = data[0];
            // Парсим сущности из бинарного 0x01 (UPD)
            if (op === NPB.OP_UPD) {
              this.updReceived++;
              const now = Date.now();
              NPB.decodeUpd(data, (key, x, z, hp) => {
                if (!key) return;
                const kindChar = key.charCodeAt(0);
                if (kindChar === 109 /* 'm' */) {
                  const mid = parseInt(key.slice(1), 10);
                  if (mid > 0) {
                    if (hp > 0) {
                      const existing = this.knownMobs.find(m => m.mid === mid);
                      if (existing) {
                        existing.x = x;
                        existing.z = z;
                        existing.hp = hp;
                        existing.lastSeen = now;
                      } else if (this.knownMobs.length < 30) {
                        this.knownMobs.push({ mid, x, z, hp, isBoss: false, lastSeen: now });
                      }
                    } else {
                      const idx = this.knownMobs.findIndex(m => m.mid === mid);
                      if (idx >= 0) this.knownMobs.splice(idx, 1);
                    }
                  }
                } else if (kindChar === 112 /* 'p' */) {
                  const pid = parseInt(key.slice(1), 10);
                  if (pid > 0 && pid !== this.pid) {
                    if (hp > 0) {
                      const existing = this.knownPlayers.find(p => p.pid === pid);
                      if (existing) {
                        existing.x = x;
                        existing.z = z;
                        existing.hp = hp;
                        existing.lastSeen = now;
                      } else if (this.knownPlayers.length < 30) {
                        this.knownPlayers.push({ pid, x, z, hp, lastSeen: now });
                      }
                    } else {
                      const idx = this.knownPlayers.findIndex(p => p.pid === pid);
                      if (idx >= 0) this.knownPlayers.splice(idx, 1);
                    }
                  }
                }
              });
              return;
            }
            if (op === 0x02 || op === 0x03 || op === 0x04) {
              this.updReceived++;
              return;
            }
          }
          data = data.toString('utf8');
        } else if (typeof data !== 'string') {
          try {
            data = Buffer.from(data).toString('utf8');
          } catch (_) {
            return;
          }
        }
        let msg;
        try {
          msg = JSON.parse(data);
        } catch (_) {
          return;
        }

        if (msg.t === 'welcome') {
          this.loggedIn = true;
          this.connectTimeMs = Date.now() - t0;
          if (msg.self) {
            this.pid = msg.self.pid;
            this.x = msg.self.x;
            this.z = msg.self.z;
            if (msg.self.hp != null) this.hp = msg.self.hp;
            if (msg.self.maxHp != null) this.maxHp = msg.self.maxHp;
            if (msg.self.energy != null) this.energy = msg.self.energy;
            if (msg.self.maxEnergy != null) this.maxEnergy = msg.self.maxEnergy;
          }
          this.startSimulation();
          finish();
        } else if (msg.t === 'pong') {
          if (this.lastPingSent > 0) {
            const rtt = Date.now() - this.lastPingSent;
            allRtts.push(rtt);
            this.lastPingSent = 0;
          }
        } else if (msg.t === 'aoi') {
          if (Array.isArray(msg.enter)) {
            const now = Date.now();
            for (const item of msg.enter) {
              if (item) {
                if (item.t === 'm' && item.mid != null) {
                  const mid = item.mid | 0;
                  const isBoss = !!(item.boss || item.eliteRaid || item.epicRaid || (item.level && item.level > 5) || (item.mobId && item.mobId.toLowerCase().includes('berserk')));
                  const existing = this.knownMobs.find(m => m.mid === mid);
                  if (existing) {
                    existing.x = item.x || existing.x;
                    existing.z = item.z || existing.z;
                    existing.hp = item.hp || existing.hp;
                    existing.isBoss = isBoss;
                    existing.lastSeen = now;
                  } else if (this.knownMobs.length < 30) {
                    this.knownMobs.push({ mid, x: item.x || 0, z: item.z || 0, hp: item.hp || 100, isBoss, lastSeen: now });
                  }
                } else if ((item.t === 'p' || item.pid != null) && item.pid !== this.pid) {
                  const pid = item.pid | 0;
                  const existing = this.knownPlayers.find(p => p.pid === pid);
                  if (existing) {
                    existing.x = item.x || existing.x;
                    existing.z = item.z || existing.z;
                    existing.hp = item.hp || existing.hp;
                    existing.name = item.name || existing.name;
                    existing.store = item.store || existing.store;
                    existing.lastSeen = now;
                  } else if (this.knownPlayers.length < 30) {
                    this.knownPlayers.push({
                      pid,
                      name: item.name || '',
                      x: item.x || 0,
                      z: item.z || 0,
                      hp: item.hp || 100,
                      store: item.store || null,
                      lastSeen: now
                    });
                  }
                }
              }
            }
          }
          if (Array.isArray(msg.leave)) {
            for (const key of msg.leave) {
              if (key) {
                if (key.charCodeAt(0) === 109 /* 'm' */) {
                  const mid = parseInt(key.slice(1), 10);
                  const idx = this.knownMobs.findIndex(m => m.mid === mid);
                  if (idx >= 0) this.knownMobs.splice(idx, 1);
                  if (this._currentTargetMid === mid) {
                    this._currentTargetMid = null;
                    this._wasInCombat = false;
                    this.pickNewWaypoint();
                  }
                } else if (key.charCodeAt(0) === 112 /* 'p' */) {
                  const pid = parseInt(key.slice(1), 10);
                  const idx = this.knownPlayers.findIndex(p => p.pid === pid);
                  if (idx >= 0) this.knownPlayers.splice(idx, 1);
                }
              }
            }
          }
        } else if (msg.t === 'upd') {
          this.updReceived++;
          if (Array.isArray(msg.upd)) {
            const now = Date.now();
            for (let i = 0; i < msg.upd.length; i++) {
              const u = msg.upd[i];
              if (u && u.k) {
                if (u.k.charCodeAt(0) === 109 /* 'm' */) {
                  const mid = parseInt(u.k.slice(1), 10);
                  if (mid > 0) {
                    if (u.hp > 0) {
                      const existing = this.knownMobs.find(m => m.mid === mid);
                      if (existing) {
                        existing.x = u.x;
                        existing.z = u.z;
                        existing.hp = u.hp;
                        existing.lastSeen = now;
                      } else if (this.knownMobs.length < 30) {
                        this.knownMobs.push({ mid, x: u.x, z: u.z, hp: u.hp, isBoss: false, lastSeen: now });
                      }
                    } else {
                      const idx = this.knownMobs.findIndex(m => m.mid === mid);
                      if (idx >= 0) this.knownMobs.splice(idx, 1);
                      if (this._currentTargetMid === mid) {
                        this._currentTargetMid = null;
                        this._wasInCombat = false;
                        this.pickNewWaypoint();
                      }
                    }
                  }
                } else if (u.k.charCodeAt(0) === 112 /* 'p' */) {
                  const pid = parseInt(u.k.slice(1), 10);
                  if (pid > 0 && pid !== this.pid) {
                    const existing = this.knownPlayers.find(p => p.pid === pid);
                    if (existing) {
                      existing.x = u.x;
                      existing.z = u.z;
                      if (u.hp != null) existing.hp = u.hp;
                      existing.lastSeen = now;
                    } else if (this.knownPlayers.length < 30) {
                      this.knownPlayers.push({ pid, x: u.x, z: u.z, hp: u.hp || 100, lastSeen: now });
                    }
                  }
                }
              }
            }
          }
        } else if (msg.t === 'dmg') {
          if (msg.mid != null) {
            const mid = msg.mid | 0;
            if (msg.hp != null && msg.hp <= 0) {
              const idx = this.knownMobs.findIndex(m => m.mid === mid);
              if (idx >= 0) this.knownMobs.splice(idx, 1);
              if (this._currentTargetMid === mid) {
                this._currentTargetMid = null;
                this._wasInCombat = false;
                this.pickNewWaypoint();
              }
            } else if (msg.hp != null) {
              const m = this.knownMobs.find(m => m.mid === mid);
              if (m) {
                m.hp = msg.hp;
                m.lastSeen = Date.now();
              }
            }
          }
        } else if (msg.t === 'dmg_player') {
          if (msg.targetPid === this.pid) {
            if (msg.hp != null) this.hp = msg.hp;
          }
        } else if (msg.t === 'loot_spawn') {
          if (msg.lid != null && !this.knownLoots.some(l => l.lid === msg.lid)) {
            if (this.knownLoots.length < 30) {
              this.knownLoots.push({ lid: msg.lid, x: msg.x || 0, z: msg.z || 0, itemId: msg.itemId });
            }
          }
        } else if (msg.t === 'loot_remove' || msg.t === 'loot_pickup_ok') {
          const idx = this.knownLoots.findIndex(l => l.lid === msg.lid);
          if (idx >= 0) this.knownLoots.splice(idx, 1);
        } else if (msg.t === 'loot_snapshot' && Array.isArray(msg.loots)) {
          for (const l of msg.loots) {
            if (l && l.lid != null && !this.knownLoots.some(x => x.lid === l.lid)) {
              if (this.knownLoots.length < 30) {
                this.knownLoots.push({ lid: l.lid, x: l.x || 0, z: l.z || 0, itemId: l.itemId });
              }
            }
          }
        } else if (msg.t === 'mob_dead') {
          const mid = msg.mid | 0;
          const idx = this.knownMobs.findIndex(m => m.mid === mid);
          if (idx >= 0) this.knownMobs.splice(idx, 1);
          if (this._currentTargetMid === mid) {
            this._currentTargetMid = null;
            this._wasInCombat = false;
            this.pickNewWaypoint();
          }
        } else if (msg.t === 'store_state') {
          const pl = this.knownPlayers.find(x => x.pid === msg.pid);
          if (pl) pl.store = msg.store;
        } else if (msg.t === 'party_invite_dialog') {
          // Автоматически принимаем приглашение в группу
          this.send({ t: 'party_accept' });
        } else if (msg.t === 'party') {
          this.partyLeader = msg.leader;
          this.partyId = msg.leader ? 'party' : null;
          this.partyMembers = msg.members || [];
        } else if (msg.t === 'duel_invite') {
          if (this.archetype === ARCHETYPE_TOWN_CITIZEN && Math.random() < 0.5) {
            this.send({ t: 'duel_accept' });
          } else {
            this.send({ t: 'duel_decline' });
          }
        } else if (msg.t === 'duel_start') {
          this.inDuel = true;
          this.duelPeerPid = msg.peer;
        } else if (msg.t === 'duel_end' || msg.t === 'duel_finish') {
          this.inDuel = false;
          this.duelPeerPid = null;
        } else if (msg.t === 'use_ok') {
          if (msg.shotArmed != null) this.shotArmed = msg.shotArmed;
          if (msg.hp != null) this.hp = msg.hp;
          if (msg.energy != null) this.energy = msg.energy;
        } else if (msg.t === 'you_died') {
          this.dead = true;
          this.inDuel = false;
          this.storeOpen = false;
          setTimeout(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              const mode = (Math.random() < 0.75) ? 'village' : 'spot';
              this.send({ t: 'revive', mode: mode });
            }
          }, 1200 + Math.floor(Math.random() * 2000));
        } else if (msg.t === 'you_revived') {
          this.dead = false;
          if (msg.self) {
            this.x = msg.self.x;
            this.z = msg.self.z;
            this.hp = msg.self.hp || 100;
            this.energy = msg.self.energy || 50;
            this.lastMoveX = this.x;
            this.lastMoveZ = this.z;
          }
          if (msg.mode === 'village') {
            if (this.isTownBot) {
              this.pickNewWaypoint();
            } else {
              if (Math.random() < 0.4) {
                const wp = TOWN_SQUARE_WAYPOINTS[Math.floor(Math.random() * TOWN_SQUARE_WAYPOINTS.length)];
                this.targetX = wp.x + (Math.random() - 0.5) * 4;
                this.targetZ = wp.z + (Math.random() - 0.5) * 4;
                this.idleMaxTicks = 60 + Math.floor(Math.random() * 60);
              } else {
                this.pickNewWaypoint();
              }
            }
          } else {
            this.pickNewWaypoint();
          }
        }
      });

      this.ws.on('ping', (data) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          try { this.ws.pong(data); } catch (_) {}
        }
      });

      this.ws.on('error', (err) => {
        if (!this.loggedIn) finish(err);
      });

      this.ws.on('close', (code, reason) => {
        const wasLoggedIn = this.loggedIn;
        this.connected = false;
        this.loggedIn = false;
        this.stopSimulation();
        if (typeof global.onBotClosed === 'function') {
          global.onBotClosed(this, code, reason, wasLoggedIn);
        }
        if (!wasLoggedIn && !settled) finish(new Error(`Closed before login: ${this.yid} (code=${code}, reason=${reason})`));
        if (wasLoggedIn && !global.testFinished) {
          setTimeout(() => {
            if (!global.testFinished && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
              this.connectWithRetry().catch(() => {});
            }
          }, 2000 + Math.floor(Math.random() * 2000));
        }
      });
    });
  }

  connectWithRetry(maxRetries = 35) {
    let attempt = 0;
    const tryOnce = () => {
      return this.connect().catch((err) => {
        attempt++;
        if (attempt <= maxRetries) {
          const delay = Math.min(3000, 200 * attempt + Math.floor(Math.random() * 300));
          return sleep(delay).then(tryOnce);
        }
        throw err;
      });
    };
    return tryOnce();
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        obj.seq = ++this.seq;
        this.ws.send(JSON.stringify(obj));
      } catch (_) {}
    }
  }

  sendBinary(buf) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(buf, { binary: true });
      } catch (_) {}
    }
  }

  simulateStep(tick, dt = 0.1) {
    if (!this.loggedIn || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.dead) return;

    try {
      // 0. Очистка устаревших игроков (> 15 секунд без обновлений)
      const now = Date.now();
      if (this.knownPlayers.length > 0 && tick % 50 === 0) {
        this.knownPlayers = this.knownPlayers.filter(p => p && p.pid > 0 && (!p.lastSeen || now - p.lastSeen < 15000));
      }

      // ============================================================
      //  АРХЕТИП 1: ГОРОДСКИЕ ТОРГОВЦЫ С ЛИЧНЫМИ ЛАВКАМИ (Private Store)
      // ============================================================
      if (this.archetype === ARCHETYPE_TOWN_TRADER) {
        const dStall = Math.hypot(this.stall.x - this.x, this.stall.z - this.z);
        if (dStall > 0.8) {
          this.targetX = this.stall.x;
          this.targetZ = this.stall.z;
        } else {
          // Прибыли к лавке — садимся и разворачиваем торговую витрину
          if (!this.sitting) {
            this.sitting = true;
            this.send({ t: 'pose', sitting: true });
          } else if (!this.storeOpen) {
            const tpl = PRIVATE_STORE_TEMPLATES[this.index % PRIVATE_STORE_TEMPLATES.length];
            this.send({
              t: 'store_set',
              mode: tpl.mode,
              title: tpl.title,
              items: tpl.items
            });
            this.storeOpen = true;
          }

          // Периодическая реклама товаров/скупки в торговый чат (+ / trade)
          if (this.storeOpen && tick - this.lastTradeChatTick > 450 && Math.random() < 0.25) {
            this.lastTradeChatTick = tick;
            const ph = CHAT_TRADE_PHRASES[(this.index + tick) % CHAT_TRADE_PHRASES.length];
            this.send({ t: 'chat', ch: 'trade', text: ph });
          }
        }
      }

      // ============================================================
      //  АРХЕТИП 2: ГОРОЖАНЕ (Патруль, NPC, Benches, Duels, Chat)
      // ============================================================
      else if (this.archetype === ARCHETYPE_TOWN_CITIZEN) {
        if (this.inDuel && this.duelPeerPid) {
          if (this.sitting) {
            this.sitting = false;
            this.send({ t: 'pose', sitting: false });
          }
          const peer = this.knownPlayers.find(p => p.pid === this.duelPeerPid);
          if (peer) {
            if (tick % 15 === 0) {
              const ang = Math.random() * Math.PI * 2;
              this.targetX = peer.x + Math.cos(ang) * 2.2;
              this.targetZ = peer.z + Math.sin(ang) * 2.2;
            }
            if (tick % 10 === 0) {
              const isOp = this.cls === 'operator';
              const s = isOp ? 'op_power_strike' : 'eng_pressure_bolt';
              this.send({ t: 'skill', skillId: s, targetPid: peer.pid });
            }
          }
        } else {
          const distToWp = Math.hypot(this.targetX - this.x, this.targetZ - this.z);
          if (distToWp < 1.1) {
            if (this.idleTicks < this.idleMaxTicks) {
              this.idleTicks++;
              // Визит к интерактивному NPC (баффер Биотин или лавка)
              if (this.idleTicks === 4 && this.targetNpc && tick - this.lastNpcVisitTick > 400) {
                this.lastNpcVisitTick = tick;
                if (this.targetNpc.service === 'buff') {
                  this.send({ t: 'npc_buff_list', npcId: this.targetNpc.id });
                  setTimeout(() => {
                    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                      this.send({ t: 'npc_buff_buy', npcId: 'biotin', buffId: 'buff_haste_1' });
                    }
                  }, 400);
                } else if (this.targetNpc.service === 'shop') {
                  this.send({ t: 'shop_open', npcId: this.targetNpc.id });
                }
              }
              // Присаживаемся на скамью/землю
              if (this.idleTicks === 6 && (this.index % 3 === 0) && !this.sitting) {
                this.sitting = true;
                this.send({ t: 'pose', sitting: true });
              }
              // Реплика в локальный или шаут чат
              if (this.idleTicks === 9 && (this.index % 5 === 0) && tick - this.lastChatTick > 350 && Math.random() < 0.15) {
                this.lastChatTick = tick;
                const isShout = Math.random() < 0.2;
                const list = isShout ? CHAT_SHOUT_PHRASES : CHAT_ALL_PHRASES;
                const ch = isShout ? 'shout' : 'all';
                this.send({ t: 'chat', ch, text: list[(this.index + tick) % list.length] });
              }
              // Дружеский вызов на дуэль соседнего горожанина
              if (this.idleTicks === 12 && !this.sitting && tick - this.lastDuelChallengeTick > 300) {
                const mate = this.knownPlayers.find(p => p && Math.hypot(p.x - this.x, p.z - this.z) < 4.5 && !p.store);
                if (mate && Math.random() < 0.12) {
                  this.lastDuelChallengeTick = tick;
                  this.send({ t: 'duel_offer', pid: mate.pid });
                }
              }
              // Осмотр витрин торговцев
              if (this.idleTicks === 15) {
                const trader = this.knownPlayers.find(p => p && p.store && Math.hypot(p.x - this.x, p.z - this.z) < 4.0);
                if (trader && Math.random() < 0.2) {
                  this.send({ t: 'store_list', pid: trader.pid });
                }
              }
            } else {
              if (this.sitting) {
                this.sitting = false;
                this.send({ t: 'pose', sitting: false });
              }
              this.pickNewWaypoint();
            }
          }
        }
      }

      // ============================================================
      //  АРХЕТИПЫ 3 и 4: ПОЛЕВЫЕ ОХОТНИКИ И ГРУППЫ (Hunter & Partier)
      // ============================================================
      else {
        // 1. Активация соулшотов при входе в игру
        if (!this.shotArmed && !this.shotArmRequested) {
          this.shotArmRequested = true;
          this.send({ t: 'use', id: 'soulshot_no_grade' });
        }

        // 2. Использование боевых зелий при падении HP/Energy
        if (this.hp < 65 && tick - this.lastPotionUseTick > 80) {
          this.lastPotionUseTick = tick;
          this.send({ t: 'use', id: 'synthetic_oil' });
          this.hp = Math.min(this.maxHp, this.hp + 20);
        }
        if (this.energy < 20 && tick - this.lastCanisterUseTick > 80) {
          this.lastCanisterUseTick = tick;
          this.send({ t: 'use', id: 'pressure_canister' });
          this.energy = Math.min(this.maxEnergy, this.energy + 20);
        }

        // 3. Межбоевой отдых (Sitting Rest) для регенерации
        if (!this._currentTargetMid) {
          if ((this.hp < 65 || this.energy < 30) && !this.sitting && !this.resting) {
            this.sitting = true;
            this.resting = true;
            this.restTicks = 0;
            this.send({ t: 'pose', sitting: true });
          }
          if (this.resting) {
            this.restTicks++;
            this.hp = Math.min(this.maxHp, this.hp + 2.5);
            this.energy = Math.min(this.maxEnergy, this.energy + 2.0);
            if ((this.hp >= 95 && this.energy >= 80) || this.restTicks > 70) {
              this.sitting = false;
              this.resting = false;
              this.send({ t: 'pose', sitting: false });
              this.pickNewWaypoint();
            }
            return; // Во время отдыха не движемся и не агримся
          }
        }

        // 4. Поиск группы для Field Partier
        if (this.archetype === ARCHETYPE_FIELD_PARTIER && !this.partyId && tick - this.lastPartyInviteTick > 250) {
          const mate = this.knownPlayers.find(p => p && Math.hypot(p.x - this.x, p.z - this.z) < 25 && !p.store);
          if (mate && Math.random() < 0.3) {
            this.lastPartyInviteTick = tick;
            this.send({ t: 'party_invite', pid: mate.pid });
          }
        }

        // 5. Поиск ближайшего лута (до 16 метров)
        let targetLoot = null;
        let minLootDist = Infinity;
        if (this.knownLoots.length > 0) {
          for (let i = 0; i < this.knownLoots.length; i++) {
            const l = this.knownLoots[i];
            if (l) {
              const d = Math.hypot(l.x - this.x, l.z - this.z);
              if (d < minLootDist && d <= 16) {
                minLootDist = d;
                targetLoot = l;
              }
            }
          }
        }

        if (targetLoot) {
          if (this.sitting) {
            this.sitting = false;
            this.resting = false;
            this.send({ t: 'pose', sitting: false });
          }
          if (minLootDist > 2.2) {
            this.targetX = targetLoot.x;
            this.targetZ = targetLoot.z;
          } else {
            this.targetX = this.x;
            this.targetZ = this.z;
            if (tick % 3 === 0) {
              this.send({ t: 'loot_pickup', lid: targetLoot.lid });
              const idx = this.knownLoots.findIndex(l => l.lid === targetLoot.lid);
              if (idx >= 0) this.knownLoots.splice(idx, 1);
            }
          }
        } else {
          // Очистка устаревших мобов (> 12 сек или hp <= 0)
          if (this.knownMobs.length > 0) {
            this.knownMobs = this.knownMobs.filter(m => m && m.mid > 0 && m.hp > 0 && (!m.lastSeen || now - m.lastSeen < 12000));
          }

          // Поиск ближайшего живого моба
          let targetMob = null;
          let minMobDist = Infinity;
          if (this.knownMobs.length > 0) {
            for (let i = 0; i < this.knownMobs.length; i++) {
              const m = this.knownMobs[i];
              if (m && m.mid > 0 && m.hp > 0 && !m.isBoss) {
                const d = Math.hypot(m.x - this.x, m.z - this.z);
                if (d < minMobDist && d <= 35) {
                  minMobDist = d;
                  targetMob = m;
                }
              }
            }
          }

          if (targetMob) {
            this._currentTargetMid = targetMob.mid;
            this._wasInCombat = true;
            if (this.sitting) {
              this.sitting = false;
              this.resting = false;
              this.send({ t: 'pose', sitting: false });
            }
            const isOp = this.cls === 'operator';
            const attackRange = isOp ? 2.4 : 10.0;
            if (minMobDist > attackRange) {
              this.targetX = targetMob.x;
              this.targetZ = targetMob.z;
            } else {
              // В зоне боя — маневрируем и атакуем!
              if (tick % 15 === 0) {
                const ang = Math.random() * Math.PI * 2;
                const r = isOp ? (1.5 + Math.random() * 0.7) : (6.0 + Math.random() * 2.0);
                this.targetX = targetMob.x + Math.cos(ang) * r;
                this.targetZ = targetMob.z + Math.sin(ang) * r;
              }

              if (tick % 5 === 0) {
                if (isOp) {
                  // Ротация Оператора: Power Strike -> Steam Slash -> Overdrive
                  if (tick % 15 === 0) {
                    this.send({ t: 'skill', skillId: 'op_power_strike', mid: targetMob.mid });
                  } else if (tick % 25 === 0 && this.energy >= 20) {
                    this.send({ t: 'skill', skillId: 'op_steam_slash', mid: targetMob.mid });
                  } else {
                    this.send({ t: 'attack', mid: targetMob.mid });
                  }
                } else {
                  // Ротация Инженера: Pressure Bolt -> Steam Vent -> Aether Shield
                  if (tick % 10 === 0) {
                    this.send({ t: 'skill', skillId: 'eng_pressure_bolt', mid: targetMob.mid });
                  } else if (tick % 25 === 0 && this.energy >= 20) {
                    this.send({ t: 'skill', skillId: 'eng_steam_vent', mid: targetMob.mid });
                  } else {
                    this.send({ t: 'attack', mid: targetMob.mid });
                  }
                }
              }
            }
          } else {
            if (this._wasInCombat) {
              this._wasInCombat = false;
              this._currentTargetMid = null;
              this.pickNewWaypoint();
            }

            const distToWp = Math.hypot(this.targetX - this.x, this.targetZ - this.z);
            if (distToWp < 1.2) {
              if (this.idleTicks < 8) {
                this.idleTicks++;
              } else {
                this.pickNewWaypoint();
              }
            }
          }
        }
      }

      // ============================================================
      //  ФИНАЛ: ПЕРЕМЕЩЕНИЕ И DEAD RECKONING
      // ============================================================
      if (!this.sitting) {
        const toDx = this.targetX - this.x;
        const toDz = this.targetZ - this.z;
        const distToDest = Math.hypot(toDx, toDz);
        if (distToDest > 0.05) {
          const step = Math.min(this.speed * dt, distToDest);
          this.x += (toDx / distToDest) * step;
          this.z += (toDz / distToDest) * step;
        }

        const movedSinceLastPacket = Math.hypot(this.x - this.lastMoveX, this.z - this.lastMoveZ);
        if (movedSinceLastPacket >= 0.65 || (distToDest <= 0.05 && movedSinceLastPacket > 0.05)) {
          this.lastMoveX = this.x;
          this.lastMoveZ = this.z;
          if (USE_BINARY) {
            this.seq = (this.seq + 1) & 0xffff;
            const buf = NPB.encodeMove(this.x, this.z, this.isWalking, this.seq);
            this.sendBinary(buf);
          } else {
            this.send({ t: 'move', x: Math.round(this.x * 10) / 10, z: Math.round(this.z * 10) / 10 });
          }
        }
      }

      // Heartbeat каждые 12 секунд
      const pingIntervalTicks = (this.index % 10 === 0) ? 20 : 120;
      if (tick % pingIntervalTicks === (this.index % pingIntervalTicks) && this.lastPingSent === 0) {
        this.lastPingSent = Date.now();
        this.send({ t: 'ping', t0: this.lastPingSent });
      }
    } catch (_) {}
  }

  startSimulation() {
    // Вся симуляция координируется центральным таймером (ноль таймеров на бота!)
  }

  stopSimulation() {}

  disconnect() {
    this.stopSimulation();
    if (this.ws) {
      try {
        this.ws.on('error', () => {});
        this.ws.terminate();
        this.ws.removeAllListeners();
      } catch (_) {}
      this.ws = null;
    }
  }
}

function calcQuantiles(arr) {
  if (!arr || arr.length === 0) return { min: 0, avg: 0, p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const q = (pct) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * pct))];
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    min: sorted[0],
    avg: Math.round(sum / sorted.length),
    p50: q(0.50),
    p95: q(0.95),
    p99: q(0.99),
    max: sorted[sorted.length - 1]
  };
}

async function run() {
  if (WORKER_ID !== -1) {
    return runWorker(null);
  }

  console.log('============================================================');
  console.log(`  PROJECT STEAM: ORIGINS — СТРЕСС-ТЕСТ НА ${TOTAL_BOTS} CCU`);
  console.log(`  Целевой онлайн: ${TOTAL_BOTS} ботов`);
  console.log(`  Протокол: ${USE_BINARY ? '🟢 ZERO-COPY BINARY (0x01 UPD / 0x02 MOVE)' : '🟡 JSON'}`);
  console.log(`  Батчинг: ${BATCH_SIZE} ботов каждые ${BATCH_INTERVAL_MS} мс`);
  console.log(`  Длительность под нагрузкой: ${DURATION_SEC} сек`);
  console.log('============================================================\n');

  const initialMetrics = await fetchMetrics();
  if (!initialMetrics) {
    console.error(`❌ Ошибка: Сервер не отвечает по адресу ${METRICS_URL}. Запустите сервер!`);
    process.exit(1);
  }

  console.log(`[Baseline] Сервер активен. Игроков: ${initialMetrics.players || 0}, мобов: ${initialMetrics.mobs || 0}`);

  if (WORKERS > 1 && WORKER_ID === -1) {
    return runMaster(initialMetrics);
  }

  return runWorker(initialMetrics);
}

async function runMaster(initialMetrics) {
  console.log('============================================================');
  console.log(`  PROJECT STEAM: ORIGINS — КЛАСТЕРНЫЙ СТРЕСС-ТЕСТ НА ${TOTAL_BOTS} CCU`);
  console.log(`  Целевой онлайн: ${TOTAL_BOTS} ботов`);
  console.log(`  Воркеров генератора нагрузки: ${WORKERS} параллельных процессов`);
  const botsPerWorker = Math.ceil(TOTAL_BOTS / WORKERS);
  console.log(`  Ботов на процесс: ~${botsPerWorker}`);
  console.log(`  Протокол: ${USE_BINARY ? '🟢 ZERO-COPY BINARY' : '🟡 JSON'}`);
  console.log(`  Длительность под нагрузкой: ${DURATION_SEC} сек`);
  console.log('============================================================\n');

  const workers = [];
  const workerProgress = new Array(WORKERS).fill(null).map(() => ({ connected: 0, failed: 0 }));

  console.log(`🚀 Запуск ${WORKERS} воркеров для распределённой генерации нагрузки...`);

  for (let w = 0; w < WORKERS; w++) {
    const offset = w * botsPerWorker;
    const workerBots = Math.min(botsPerWorker, TOTAL_BOTS - offset);
    if (workerBots <= 0) break;

    const childHost = (HOST === '127.0.0.1' || HOST === 'localhost') ? `127.0.0.${(w % 8) + 1}` : HOST;
    const childArgs = [
      ...args.filter(a => !a.startsWith('--workers=') && !a.startsWith('--bots=') && !a.startsWith('--offset=') && !a.startsWith('--worker-id=') && !a.startsWith('--host=')),
      `--bots=${workerBots}`,
      `--offset=${offset}`,
      `--worker-id=${w}`,
      `--host=${childHost}`,
      `--workers=1`
    ];

    const cp = child_process.fork(__filename, childArgs, {
      stdio: ['inherit', 'pipe', 'inherit', 'ipc']
    });
    if (cp.stdout) cp.stdout.resume();

    const reportedErrors = new Set();
    cp.on('message', (msg) => {
      if (msg && msg.type === 'progress') {
        workerProgress[w] = { connected: msg.connected, active: msg.active || 0, failed: msg.failed };
        if (msg.lastError && !reportedErrors.has(msg.lastError)) {
          reportedErrors.add(msg.lastError);
          console.error(`\n[Worker ${w} Error] ${msg.lastError}`);
        }
        const totalConnected = workerProgress.reduce((s, p) => s + p.connected, 0);
        const totalActive = workerProgress.reduce((s, p) => s + (p.active || 0), 0);
        const totalFailed = workerProgress.reduce((s, p) => s + p.failed, 0);
        process.stdout.write(`\r  [Кластер] Подключено: ${totalConnected}/${TOTAL_BOTS} (Активно: ${totalActive}) | Ошибок: ${totalFailed}...`);
      }
    });

    cp.on('error', (err) => {
      console.error(`\n[Master] Worker ${w} error:`, err && err.message);
    });

    cp.on('exit', (code, sig) => {
      if (code !== 0 && code !== null) {
        console.error(`\n[Master] Worker ${w} exited with code ${code}, signal ${sig}`);
      }
    });

    workers.push(cp);
  }

  // Ожидание завершения подключения у всех воркеров (до 240с для 5000 ботов)
  const maxWaitSec = 240;
  let waitSec = 0;
  while (waitSec < maxWaitSec) {
    await sleep(1000);
    waitSec++;
    const totalConnected = workerProgress.reduce((s, p) => s + p.connected, 0);
    const totalFailed = workerProgress.reduce((s, p) => s + p.failed, 0);
    if (totalConnected >= TOTAL_BOTS) break;
    if (totalConnected + totalFailed >= TOTAL_BOTS) break;
  }

  const finalConnected = workerProgress.reduce((s, p) => s + p.connected, 0);
  const finalFailed = workerProgress.reduce((s, p) => s + p.failed, 0);
  console.log(`\n\n✅ Подключение завершено: ${finalConnected} из ${TOTAL_BOTS} (Успех: ${Math.round((finalConnected / TOTAL_BOTS) * 100)}%)`);

  console.log(`\n⏳ Фаза стабильной нагрузки: ${DURATION_SEC} сек (движение, AOI, combat)...`);
  const stepMs = 5000;
  const steps = Math.floor((DURATION_SEC * 1000) / stepMs);

  for (let step = 1; step <= steps; step++) {
    await sleep(stepMs);
    const m = await fetchMetrics();
    const totalActive = workerProgress.reduce((s, p) => s + (p.active || 0), 0);
    if (m) {
      console.log(
        `  [T+${step * 5}s] Онлайн на сервере: ${m.players} | Активных ботов: ${totalActive} | Тик: ${m.tickMs != null ? m.tickMs.toFixed(1) : '?'} мс (max: ${m.tickMsMax || '?'}) | ` +
        `EMA: ${m.tickMsEma != null ? m.tickMsEma.toFixed(1) : '?'} мс | Вых.трафик: ${Math.round((m.bytesOut || 0) / 1024)} КБ`
      );
    }
  }

  console.log('\n📊 Сбор финальных метрик сервера...');
  const finalMetrics = await fetchMetrics();

  console.log('\n🔌 Отключение воркеров...');
  for (const cp of workers) {
    try { cp.send({ type: 'stop' }); } catch (_) {}
  }
  await sleep(1500);
  for (const cp of workers) {
    try { cp.kill('SIGTERM'); } catch (_) {}
  }
  console.log('Все воркеры отключены.');

  // Итоговый отчёт
  console.log('\n============================================================');
  console.log(`  ИТОГОВЫЙ ОТЧЁТ НАГРУЗОЧНОГО ТЕСТИРОВАНИЯ (${TOTAL_BOTS} CCU)`);
  console.log('============================================================');
  console.log(`  Всего запрошено:      ${TOTAL_BOTS}`);
  console.log(`  Успешно подключено:   ${finalConnected} (${((finalConnected / TOTAL_BOTS) * 100).toFixed(1)}%)`);
  console.log(`  Ошибок подключения:   ${finalFailed}`);

  if (finalMetrics) {
    console.log('\n── Производительность сервера (Server Metrics) ──────────────');
    console.log(`  Пиковый онлайн:         ${finalMetrics.players || '?'}`);
    console.log(`  Время тика (последнее): ${finalMetrics.tickMs != null ? finalMetrics.tickMs.toFixed(2) : '?'} мс`);
    console.log(`  Пиковый выброс тика:    ${finalMetrics.tickMsMax || '?'} мс`);
    console.log(`  EMA тика (сглаженное):  ${finalMetrics.tickMsEma != null ? finalMetrics.tickMsEma.toFixed(2) : '?'} мс`);
    console.log(`  Всего пакетов OUT:      ${finalMetrics.packetsOut || '?'}`);
    console.log(`  Всего трафика OUT:      ${Math.round((finalMetrics.bytesOut || 0) / (1024 * 1024))} МБ`);
    console.log(`  AOI updSent:            ${finalMetrics.updSent || 0}`);
    console.log(`  AOI updSkip (дельта):   ${finalMetrics.updSkip || 0}`);
    const totalUpd = (finalMetrics.updSent || 0) + (finalMetrics.updSkip || 0);
    const eff = totalUpd > 0 ? ((finalMetrics.updSkip / totalUpd) * 100).toFixed(1) : 0;
    console.log(`  Эффективность дельты:   ${eff}% трафика сэкономлено`);
  }
  console.log('============================================================\n');

  if (OUTPUT_FILE) {
    try {
      const outDir = path.dirname(path.resolve(OUTPUT_FILE));
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const report = {
        timestamp: new Date().toISOString(),
        host: HOST,
        port: PORT,
        requestedBots: TOTAL_BOTS,
        connected: finalConnected,
        failed: finalFailed,
        tickMs: finalMetrics?.tickMs,
        tickMsMax: finalMetrics?.tickMsMax,
        tickMsEma: finalMetrics?.tickMsEma,
        bytesOut: finalMetrics?.bytesOut,
        durationSec: DURATION_SEC,
        workers: WORKERS
      };
      fs.writeFileSync(path.resolve(OUTPUT_FILE), JSON.stringify(report, null, 2), 'utf8');
      console.log(`[stress-test] Отчёт успешно сохранён в: ${OUTPUT_FILE}`);
    } catch (err) {
      console.error('[stress-test] Ошибка сохранения отчёта:', err.message);
    }
  }

  process.exit(0);
}

async function runWorker(initialMetrics) {
  const bots = [];
  let connectedCount = 0;
  let failCount = 0;

  const sendProgress = (lastErr) => {
    if (process.send) {
      let activeCount = 0;
      for (let k = 0; k < bots.length; k++) {
        if (bots[k].loggedIn && bots[k].ws && bots[k].ws.readyState === WebSocket.OPEN) activeCount++;
      }
      try { process.send({ type: 'progress', connected: connectedCount, active: activeCount, failed: failCount, lastError: lastErr }); } catch (_) {}
    }
  };

  global.onBotClosed = (bot, code, reason, wasLoggedIn) => {
    if (wasLoggedIn) {
      sendProgress();
    }
  };

  const connectStart = Date.now();

  for (let i = 0; i < TOTAL_BOTS; i += BATCH_SIZE) {
    const count = Math.min(BATCH_SIZE, TOTAL_BOTS - i);
    for (let j = 0; j < count; j++) {
      const bot = new StressBot3000(BOT_OFFSET + i + j);
      bots.push(bot);
      bot.connectWithRetry().then(
        () => {
          connectedCount++;
          sendProgress();
        },
        (err) => {
          failCount++;
          sendProgress(err && err.message);
          if (failCount <= 3) console.error(`[Worker ${WORKER_ID} Bot ${BOT_OFFSET + i + j}] Connect error: ${err.message}`);
        }
      );
    }
    const pct = Math.round(((i + count) / TOTAL_BOTS) * 100);
    if (WORKER_ID === -1) {
      process.stdout.write(`\r  [Воркер Standalone] ${i + count}/${TOTAL_BOTS} (${pct}%) [Подключено: ${connectedCount}, Ошибок: ${failCount}]...`);
    }
    if (i + count < TOTAL_BOTS) await sleep(BATCH_INTERVAL_MS);
  }

  // Ожидание завершения хэндшейков запущенных сокетов
  const maxWaitMs = 180000;
  const waitStart = Date.now();
  while (connectedCount + failCount < TOTAL_BOTS && Date.now() - waitStart < maxWaitMs) {
    await sleep(300);
    sendProgress();
  }

  // Единый глобальный диспетчер симуляции (10 Hz = каждые 100 мс для непрерывного плавного перемещения)
  let simTick = 0;
  const DT = 0.1;
  const simTimer = setInterval(() => {
    try {
      simTick++;
      const len = bots.length;
      if (!len) return;
      for (let k = 0; k < len; k++) {
        const b = bots[k];
        if (b && b.loggedIn) {
          try { b.simulateStep(simTick, DT); } catch (_) {}
        }
      }
    } catch (_) {}
  }, 100);

  process.on('uncaughtException', (err) => {
    if (WORKER_ID <= 0) console.error(`[Worker ${WORKER_ID}] uncaughtException:`, err && err.message);
  });
  process.on('unhandledRejection', () => {});

  if (WORKER_ID === -1) {
    const stepMs = 5000;
    const steps = Math.floor((DURATION_SEC * 1000) / stepMs);
    for (let step = 1; step <= steps; step++) {
      await sleep(stepMs);
      const m = await fetchMetrics();
      if (m) {
        const q = calcQuantiles(allRtts.slice(-100));
        console.log(
          `  [T+${step * 5}s] Онлайн: ${m.players} | Тик: ${m.tickMs != null ? m.tickMs.toFixed(1) : '?'} мс | RTT p50: ${q.p50}ms | Вых.трафик: ${Math.round((m.bytesOut || 0) / 1024)} КБ`
        );
      }
    }
    global.testFinished = true;
    clearInterval(simTimer);
    for (const b of bots) b.disconnect();
  } else {
    // В кластерном режиме воркер держит сокеты и симуляцию активными до сигнала мастера
    process.on('message', (msg) => {
      if (msg && msg.type === 'stop') {
        global.testFinished = true;
        clearInterval(simTimer);
        for (const b of bots) b.disconnect();
        process.exit(0);
      }
    });
    await new Promise(() => {});
  }

  if (WORKER_ID === -1) {
    const finalMetrics = await fetchMetrics();
    console.log('\n============================================================');
    console.log(`  ИТОГОВЫЙ ОТЧЁТ НАГРУЗОЧНОГО ТЕСТИРОВАНИЯ (${TOTAL_BOTS} CCU)`);
    console.log('============================================================');
    console.log(`  Всего запрошено:      ${TOTAL_BOTS}`);
    console.log(`  Успешно подключено:   ${connectedCount} (${((connectedCount / TOTAL_BOTS) * 100).toFixed(1)}%)`);
    console.log(`  Ошибок подключения:   ${failCount}`);
    const rttStats = calcQuantiles(allRtts);
    console.log(`  Медиана RTT (p50):    ${rttStats.p50} мс`);
    console.log(`  95-й перцентиль (p95): ${rttStats.p95} мс`);
    if (finalMetrics) {
      console.log(`  Время тика (последнее): ${finalMetrics.tickMs != null ? finalMetrics.tickMs.toFixed(2) : '?'} мс`);
      console.log(`  EMA тика (сглаженное):  ${finalMetrics.tickMsEma != null ? finalMetrics.tickMsEma.toFixed(2) : '?'} мс`);
      console.log(`  Всего трафика OUT:      ${Math.round((finalMetrics.bytesOut || 0) / (1024 * 1024))} МБ`);
      const totalUpd = (finalMetrics.updSent || 0) + (finalMetrics.updSkip || 0);
      const eff = totalUpd > 0 ? ((finalMetrics.updSkip / totalUpd) * 100).toFixed(1) : 0;
      console.log(`  Эффективность дельты:   ${eff}% трафика сэкономлено`);
    }
    console.log('============================================================\n');

    if (OUTPUT_FILE) {
      try {
        const outDir = path.dirname(path.resolve(OUTPUT_FILE));
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const report = {
          timestamp: new Date().toISOString(),
          host: HOST,
          port: PORT,
          requestedBots: TOTAL_BOTS,
          connected: connectedCount,
          failed: failCount,
          rttP50: rttStats.p50,
          rttP95: rttStats.p95,
          tickMs: finalMetrics?.tickMs,
          tickMsMax: finalMetrics?.tickMsMax,
          tickMsEma: finalMetrics?.tickMsEma,
          bytesOut: finalMetrics?.bytesOut,
          durationSec: DURATION_SEC,
          workers: 1
        };
        fs.writeFileSync(path.resolve(OUTPUT_FILE), JSON.stringify(report, null, 2), 'utf8');
        console.log(`[stress-test] Отчёт успешно сохранён в: ${OUTPUT_FILE}`);
      } catch (err) {
        console.error('[stress-test] Ошибка сохранения отчёта:', err.message);
      }
    }
  }

  process.exit(0);
}

run().catch((e) => {
  console.error('Fatal benchmark error:', e);
  process.exit(1);
});
