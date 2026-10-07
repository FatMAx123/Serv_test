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
const STRESS_KEY = getArg('stress-key', process.env.STRESS_KEY || process.env.STRESS_SECRET || 'ps-stress-perf-2026');

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
  '#c49a45', '#4a3319', '#1a1818', '#7b4426', '#8a8a8a', '#8b5a2b',
  '#3a3328', '#d4af37', '#e5e7eb', '#2c251e', '#5c4033', '#6a4e32'
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

// Тематические валидированные маршруты Деревни поющей стали (100% canWalk)
const TOWN_CIRCUITS = {
  // 1. Центральный променад вокруг фонтана и стелы (Сердце города)
  plaza: [
    { x: -113.0, z: -135.0, name: 'Стела Основателей', action: 'dwell', dwellTicks: 35, text: 'Стела Основателей напоминает о первых поселенцах...' },
    { x: -108.2, z: -132.1, name: 'Дрон-помощник Бот-01', action: 'inspect', dwellTicks: 25, text: 'Дрон-помощник исправно сканирует периметр.' },
    { x: -104.0, z: -126.0, name: 'Фонтан шестерней', action: 'fountain', dwellTicks: 45, text: 'Фонтан шестерней работает как швейцарские часы.' },
    { x: -113.0, z: -122.0, name: 'Северная арка площади', action: 'inspect', dwellTicks: 30, text: 'Северная арка открывает путь к ратуше.', junction: { targetCircuit: 'north_hall', targetNode: 0 } },
    { x: -118.0, z: -132.0, name: 'Западные скамьи отдыха', action: 'bench', dwellTicks: 150, text: 'Присяду на западную скамью, переведу дух.', junction: { targetCircuit: 'west_craft', targetNode: 0 } },
    { x: -115.0, z: -142.0, name: 'Доска объявлений', action: 'inspect', dwellTicks: 35, text: 'На доске объявлений свежие контракты на охоту.', junction: { targetCircuit: 'south_tavern', targetNode: 0 } },
    { x: -106.0, z: -138.0, name: 'Восточные скамьи', action: 'bench', dwellTicks: 150, text: 'Восточные скамьи отлично освещены фонарями.', junction: { targetCircuit: 'east_academy', targetNode: 0 } }
  ],
  // 2. Дорога мастеров: Кузница, Мастерские и проход к Технику Биотину
  west_craft: [
    { x: -118.0, z: -132.0, name: 'Перекресток мастеров', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 4 } },
    { x: -122.0, z: -125.0, name: 'Уличные фонари', action: 'inspect', dwellTicks: 30, text: 'Уличные фонари светят ровным неоновым светом.' },
    { x: -128.0, z: -138.0, name: 'Кузница и мастерские', action: 'inspect', dwellTicks: 60, text: 'В кузнице кипит работа, металл льётся рекой!' },
    { x: -135.0, z: -142.0, name: 'Мастерской проход', action: 'inspect', dwellTicks: 25 },
    { x: -145.0, z: -148.0, name: 'Склад шестерен', action: 'inspect', dwellTicks: 30 },
    { x: -155.0, z: -152.0, name: 'Западная развилка', action: 'dwell', dwellTicks: 25 },
    { x: -168.0, z: -155.0, name: 'Паровой цех', action: 'inspect', dwellTicks: 50, text: 'Мастерские инженеров наполнены паром и гулом.' },
    { x: -155.0, z: -152.0, name: 'Западная развилка (обратно)', action: 'dwell', dwellTicks: 25 },
    { x: -145.0, z: -148.0, name: 'Склад шестерен (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -128.0, z: -138.0, name: 'Кузница (обратно)', action: 'inspect', dwellTicks: 35 },
    { x: -122.0, z: -125.0, name: 'Фонари у площади', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 4 } }
  ],
  // 3. Северный проспект к Ратуше и Северным Воротам
  north_hall: [
    { x: -113.0, z: -122.0, name: 'Северная арка', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 3 } },
    { x: -113.0, z: -112.0, name: 'Северный бульвар 1', action: 'inspect', dwellTicks: 25 },
    { x: -113.0, z: -100.0, name: 'Аллея ратуши', action: 'inspect', dwellTicks: 30, text: 'Главная аллея ратуши вымощена прочнейшей сталью.' },
    { x: -110.0, z: -88.0,  name: 'Сквер монолитов', action: 'inspect', dwellTicks: 25 },
    { x: -105.0, z: -76.0,  name: 'Тень монолитов', action: 'dwell', dwellTicks: 40, text: 'Здесь прохладно и спокойно в тени монолитов.' },
    { x: -98.0,  z: -68.0,  name: 'Подход к воротам', action: 'inspect', dwellTicks: 25 },
    { x: -92.0,  z: -60.0,  name: 'Северные ворота', action: 'inspect', dwellTicks: 50, text: 'Северные ворота охраняют покой города.' },
    { x: -98.0,  z: -68.0,  name: 'Подход к воротам (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -105.0, z: -76.0,  name: 'Тень монолитов (обратно)', action: 'dwell', dwellTicks: 25 },
    { x: -110.0, z: -88.0,  name: 'Сквер монолитов (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -113.0, z: -100.0, name: 'Аллея ратуши (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -113.0, z: -112.0, name: 'Северный бульвар (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -113.0, z: -122.0, name: 'Возврат к площади', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 3 } }
  ],
  // 4. Южный тракт к Торговым рядам и Южным Вратам
  south_tavern: [
    { x: -115.0, z: -142.0, name: 'Южный выход площади', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 5 } },
    { x: -113.0, z: -148.0, name: 'Южная аллея', action: 'inspect', dwellTicks: 30, text: 'Южная аллея ведет прямо к воротам гавани.' },
    { x: -113.0, z: -158.0, name: 'Трактирный переулок', action: 'inspect', dwellTicks: 25 },
    { x: -112.0, z: -170.0, name: 'У таверны', action: 'inspect', dwellTicks: 55, text: 'В таверне пахнет жареным мясом и элем!' },
    { x: -110.0, z: -182.0, name: 'Караванный тракт', action: 'dwell', dwellTicks: 30 },
    { x: -108.0, z: -192.0, name: 'Южные врата', action: 'inspect', dwellTicks: 45, text: 'Южные врата открыты для караванов.' },
    { x: -110.0, z: -182.0, name: 'Караванный тракт (обратно)', action: 'dwell', dwellTicks: 25 },
    { x: -112.0, z: -170.0, name: 'У таверны (обратно)', action: 'inspect', dwellTicks: 30 },
    { x: -113.0, z: -158.0, name: 'Трактирный переулок (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -113.0, z: -148.0, name: 'Подход к площади', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 5 } }
  ],
  // 5. Восточная аллея: Базар и Школа Операторов
  east_academy: [
    { x: -106.0, z: -138.0, name: 'Восточный выход площади', action: 'dwell', dwellTicks: 25, junction: { targetCircuit: 'plaza', targetNode: 6 } },
    { x: -98.0,  z: -130.0, name: 'Восточный базар', action: 'shop', dwellTicks: 55, text: 'Восточный базар шумит, торговцы зазывают покупателей.' },
    { x: -90.0,  z: -124.0, name: 'Путь к академии', action: 'inspect', dwellTicks: 25 },
    { x: -80.0,  z: -118.0, name: 'Тренировочный полигон', action: 'inspect', dwellTicks: 45, text: 'Тренировочный полигон: слышны удары молотов.' },
    { x: -72.0,  z: -112.0, name: 'Школа Операторов', action: 'dwell', dwellTicks: 30 },
    { x: -80.0,  z: -118.0, name: 'Тренировочный полигон (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -90.0,  z: -124.0, name: 'Путь к академии (обратно)', action: 'inspect', dwellTicks: 25 },
    { x: -98.0,  z: -130.0, name: 'Базар (обратно к площади)', action: 'shop', dwellTicks: 35, junction: { targetCircuit: 'plaza', targetNode: 6 } }
  ]
};

const TOWN_CIRCUIT_KEYS = Object.keys(TOWN_CIRCUITS);
const TOWN_SQUARE_WAYPOINTS = TOWN_CIRCUITS.plaza; // Обратная совместимость

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

// Живые боевые реплики в поле (all)
const CHAT_COMBAT_PHRASES = [
  'Минус один!',
  'Отличный удар соулшотом!',
  'Фух, еле пробил его панцирь.',
  'Шестерни скрипят, но держим строй!',
  'Паровые клапаны нагрелись, но победа за нами!',
  'Клинок не подвёл!',
  'Автоматон повержен, чисто сработано.',
  'Ещё один готов, идём дальше.'
];

// Реплики при подборе лута (all)
const CHAT_LOOT_PHRASES = [
  'Отличная добыча!',
  'Адена в кармане!',
  'О, полезные детали на крафт.',
  'Неплохой дроп выпал с этого моба.',
  'Шестерни и металлолом пригодятся кузнецу.'
];

// Реплики отдыха и привала (/sit)
const CHAT_REST_PHRASES = [
  'Переведу дух после боя...',
  'Надо остудить паровые поршни.',
  'Сделаем привал на пару минут.',
  'У кого есть лишнее масло? Смазать доспехи надо.',
  'Хорошая погодка для отдыха в поле.'
];

// Реплики приветствия при встрече других игроков
const CHAT_GREET_PHRASES = [
  'Привет, коллега!',
  'Удачного дропа на споте!',
  'Привет! В пати пойдёшь?',
  'Осторожней на севере, там элитные мобы бродят.',
  'Салют! Как охота сегодня?'
];

// Реплики при критическом уроне / отступлении
const CHAT_PANIC_PHRASES = [
  'Чёрт, броня трещит! Отступаем!',
  'Слишком сильный урон, пью масло!',
  'Нужно сбросить агро, держим дистанцию!',
  'Помогите, клапаны заклинило!'
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

  const weaponId = (cls === 'operator')
    ? ((index % 3 === 0) ? 'magic_mace' : 'operator_hammer_low')
    : ((index % 3 === 0) ? 'magic_mace' : 'apprentice_wand');

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
    },
    equip: {
      weapon: { id: weaponId, templateId: weaponId }
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
    this.equip = profile.equip;

    // Городской бот площади (только если явно задано через --town-bots > 0, иначе все боты вне города)
    this.isTownBot = (!ZONE_FILTER && !targetCenter) && (TOWN_BOTS > 0) && (index < TOWN_BOTS);
    if (this.isTownBot) {
      this.spot = { name: 'Деревня поющей стали (Площадь)', x: -113, z: -135, r: 22, shard: 'Town' };
      // 30% городских ботов — торговцы личных лавок (Private Store), 70% — активные горожане
      if (index % 10 < 3) {
        this.archetype = ARCHETYPE_TOWN_TRADER;
        this.stall = TOWN_MARKET_STALLS[index % TOWN_MARKET_STALLS.length];
        this.x = this.stall.x + (Math.random() - 0.5) * 2.5;
        this.z = this.stall.z + (Math.random() - 0.5) * 2.5;
        this.speed = 4.125;
        this.isWalking = true;
        this.idleMaxTicks = 1200; // остаётся сидеть в лавке
      } else {
        this.archetype = ARCHETYPE_TOWN_CITIZEN;
        const circuitKeys = TOWN_CIRCUIT_KEYS;
        this.circuitName = circuitKeys[index % circuitKeys.length];
        const circuit = TOWN_CIRCUITS[this.circuitName];
        this.circuitNodeIdx = index % circuit.length;
        const node = circuit[this.circuitNodeIdx];
        this.x = node.x;
        this.z = node.z;
        this.currentNode = node;
        this.speed = 4.125;
        this.isWalking = true;
        this.idleMaxTicks = node.dwellTicks || (35 + Math.floor(Math.random() * 45));
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
      this.y = (this.spot.y != null && Number.isFinite(+this.spot.y)) ? +this.spot.y : null;
      this.speed = 4.125;
      this.isWalking = true;
      this.idleMaxTicks = 15;
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
    this.lastCombatChatTick = -999;
    this.lastLootChatTick = -999;
    this.lastGreetChatTick = -999;
    this.fleeing = false;
    this.fleeTicks = 0;

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
      this.speed = 4.125;
      this.isWalking = true;
      this.idleMaxTicks = 1200;
    } else if (this.archetype === ARCHETYPE_TOWN_CITIZEN) {
      this.targetNpc = null;
      const circuit = TOWN_CIRCUITS[this.circuitName] || TOWN_CIRCUITS.plaza;
      const curIdx = this.circuitNodeIdx != null ? this.circuitNodeIdx : 0;
      const curNode = circuit[curIdx];

      // Проверяем перекрёсток (Junction): 25% шанс перейти на смежный маршрут
      if (curNode && curNode.junction && Math.random() < 0.25) {
        this.circuitName = curNode.junction.targetCircuit;
        const newCircuit = TOWN_CIRCUITS[this.circuitName] || TOWN_CIRCUITS.plaza;
        this.circuitNodeIdx = curNode.junction.targetNode % newCircuit.length;
      } else {
        this.circuitNodeIdx = (curIdx + 1) % circuit.length;
      }

      const nextNode = (TOWN_CIRCUITS[this.circuitName] || TOWN_CIRCUITS.plaza)[this.circuitNodeIdx];
      this.currentNode = nextNode;
      this.targetX = nextNode.x;
      this.targetZ = nextNode.z;
      this.speed = 4.125;
      this.isWalking = true;
      this.idleMaxTicks = nextNode.dwellTicks || (35 + Math.floor(Math.random() * 45));
    } else {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * Math.max(10, this.spotRadius - 4);
      this.targetX = (this.spot.x || 0) + Math.cos(angle) * dist;
      this.targetZ = (this.spot.z || 0) + Math.sin(angle) * dist;
      // Вне боя передвигаемся реалистичным шагом (4.125 м/с = 0.55 от базы)
      this.speed = (Math.random() < 0.7) ? 4.125 : 7.5;
      this.isWalking = (this.speed <= 4.5);
      this.idleMaxTicks = 20 + Math.floor(Math.random() * 30);
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
        const wsOpts = {
          handshakeTimeout: 45000,
          perMessageDeflate: false,
          headers: STRESS_KEY ? { 'x-stress-key': STRESS_KEY } : {}
        };
        this.ws = new WebSocket(WS_URL, wsOpts);
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
            equip: this.equip,
            x: this.x,
            y: this.y,
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
                  const isBoss = !!(item.boss || item.eliteRaid || item.epicRaid || (item.mobId && item.mobId.toLowerCase().includes('berserk')));
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
                // Anti-KS: если урон нанёс другой игрок/бот, помечаем моба как занятого
                if (msg.by != null && msg.by !== this.pid) {
                  m.claimedByPid = msg.by;
                  m.claimedUntil = Date.now() + 8000;
                }
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
          this.send({ t: 'duel_decline' });
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
              const mode = this.isTownBot ? 'village' : 'spot';
              this.send({ t: 'revive', mode: mode });
            }
          }, 1200 + Math.floor(Math.random() * 1500));
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
              this.pickNewWaypoint();
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
          const delay = (code === 4008 || code === 4009)
            ? (5000 + Math.floor(Math.random() * 3000))
            : (2500 + Math.floor(Math.random() * 2000));
          setTimeout(() => {
            if (!global.testFinished && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
              this.connectWithRetry().catch(() => {});
            }
          }, delay);
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
          if (distToWp < 0.3) {
            if (this.idleTicks < this.idleMaxTicks) {
              this.idleTicks++;
              const node = this.currentNode;
              const action = node ? node.action : null;

              // Действие: присесть на скамью
              if (action === 'bench' && this.idleTicks === 5 && !this.sitting) {
                this.sitting = true;
                this.send({ t: 'pose', sitting: true });
              }

              // Действие: осмотр витрин торговцев или визит в лавку
              if (action === 'shop' && this.idleTicks === 8) {
                const trader = this.knownPlayers.find(p => p && p.store && Math.hypot(p.x - this.x, p.z - this.z) < 5.0);
                if (trader) {
                  this.send({ t: 'store_list', pid: trader.pid });
                } else {
                  this.send({ t: 'shop_open', npcId: 'trader_vex' });
                }
              }

              // Действие: визит к Биотину за баффом
              if (action === 'buff' && this.idleTicks === 8) {
                this.send({ t: 'npc_buff_list', npcId: 'biotin' });
                setTimeout(() => {
                  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.send({ t: 'npc_buff_buy', npcId: 'biotin', buffId: 'buff_haste_1' });
                  }
                }, 400);
              }

              // Действие: реплика лора в чат
              if (node && node.text && this.idleTicks === 12 && tick - this.lastChatTick > 350 && Math.random() < 0.35) {
                this.lastChatTick = tick;
                this.send({ t: 'chat', ch: 'all', text: node.text });
              } else if (this.idleTicks === 15 && (this.index % 4 === 0) && tick - this.lastChatTick > 400 && Math.random() < 0.15) {
                this.lastChatTick = tick;
                const isShout = Math.random() < 0.2;
                const list = isShout ? CHAT_SHOUT_PHRASES : CHAT_ALL_PHRASES;
                const ch = isShout ? 'shout' : 'all';
                this.send({ t: 'chat', ch, text: list[(this.index + tick) % list.length] });
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
      //  АРХЕТИПЫ 3 и 4: ПОЛЕВЫЕ ОХОТНИКИ И ГРУППЫ (Smart AI Hunter & Partier)
      // ============================================================
      else {
        // 1. Автоматическая поддержка соулшотов (No-Grade Soulshots)
        if (tick % 25 === 0) {
          this.send({ t: 'use', id: 'soulshot_no_grade' });
        }

        // 2. Использование боевых зелий при падении HP/Energy
        if (this.hp < 65 && tick - this.lastPotionUseTick > 30) {
          this.lastPotionUseTick = tick;
          this.send({ t: 'use', id: 'synthetic_oil' });
          this.hp = Math.min(this.maxHp, this.hp + 25);
        }
        if (this.energy < 25 && tick - this.lastCanisterUseTick > 40) {
          this.lastCanisterUseTick = tick;
          this.send({ t: 'use', id: 'pressure_canister' });
          this.energy = Math.min(this.maxEnergy, this.energy + 25);
        }

        // 3. Тактическое отступление при критическом HP (< 25% в бою)
        if (this.hp < 25 && this._currentTargetMid && !this.fleeing) {
          this.fleeing = true;
          this.fleeTicks = 0;
          const targetMob = this.knownMobs.find(m => m.mid === this._currentTargetMid);
          if (targetMob) {
            const awayDx = this.x - targetMob.x;
            const awayDz = this.z - targetMob.z;
            const awayLen = Math.hypot(awayDx, awayDz) || 1;
            this.targetX = this.x + (awayDx / awayLen) * 16;
            this.targetZ = this.z + (awayDz / awayLen) * 16;
          }
          this.speed = 7.5;
          this.isWalking = false;
          if (tick - this.lastChatTick > 200) {
            this.lastChatTick = tick;
            this.send({ t: 'chat', ch: 'all', text: CHAT_PANIC_PHRASES[Math.floor(Math.random() * CHAT_PANIC_PHRASES.length)] });
          }
        }
        if (this.fleeing) {
          this.fleeTicks++;
          if (this.fleeTicks > 35 || this.hp >= 50) {
            this.fleeing = false;
            this._currentTargetMid = null;
          }
        }

        // 4. Межбоевой отдых (Sitting Rest) для регенерации
        if (!this._currentTargetMid && !this.fleeing) {
          if ((this.hp < 60 || this.energy < 30) && !this.sitting && !this.resting) {
            this.sitting = true;
            this.resting = true;
            this.restTicks = 0;
            this.send({ t: 'pose', sitting: true });
            if (tick - this.lastChatTick > 300 && Math.random() < 0.25) {
              this.lastChatTick = tick;
              this.send({ t: 'chat', ch: 'all', text: CHAT_REST_PHRASES[Math.floor(Math.random() * CHAT_REST_PHRASES.length)] });
            }
          }
          if (this.resting) {
            this.restTicks++;
            this.hp = Math.min(this.maxHp, this.hp + 2.5);
            this.energy = Math.min(this.maxEnergy, this.energy + 2.0);
            if ((this.hp >= 95 && this.energy >= 85) || this.restTicks > 80) {
              this.sitting = false;
              this.resting = false;
              this.send({ t: 'pose', sitting: false });
              this.pickNewWaypoint();
            }
            return; // Во время отдыха не движемся и не агримся
          }
        }

        // 5. Поиск группы для Field Partier
        if (this.archetype === ARCHETYPE_FIELD_PARTIER && !this.partyId && tick - this.lastPartyInviteTick > 250) {
          const mate = this.knownPlayers.find(p => p && Math.hypot(p.x - this.x, p.z - this.z) < 25 && !p.store);
          if (mate && Math.random() < 0.3) {
            this.lastPartyInviteTick = tick;
            this.send({ t: 'party_invite', pid: mate.pid });
          }
        }

        // 6. Поиск и сбор лута (до 18 метров)
        if (this.knownLoots.length > 0) {
          this.knownLoots = this.knownLoots.filter(l => l && (!l.lastSeen || now - l.lastSeen < 20000));
        }
        let targetLoot = null;
        let minLootDist = Infinity;
        if (this.knownLoots.length > 0) {
          for (let i = 0; i < this.knownLoots.length; i++) {
            const l = this.knownLoots[i];
            if (l) {
              const d = Math.hypot(l.x - this.x, l.z - this.z);
              if (d < minLootDist && d <= 18) {
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
          if (minLootDist > 1.6) {
            this.targetX = targetLoot.x;
            this.targetZ = targetLoot.z;
            this.speed = 7.5;
            this.isWalking = false;
          } else {
            if (this.isMoving) {
              this.isMoving = false;
              this.targetX = this.x;
              this.targetZ = this.z;
              if (USE_BINARY) {
                this.seq = (this.seq + 1) & 0xffff;
                this.sendBinary(NPB.encodeMove(this.x, this.z, false, this.seq, this.x, this.z));
              }
              this.send({ t: 'move_stop', x: Number(this.x.toFixed(2)), z: Number(this.z.toFixed(2)) });
            }
            this.targetX = this.x;
            this.targetZ = this.z;
            if (tick % 2 === 0) {
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

          // Поиск цели: приоритет текущему атакуемому мобу, иначе ближайшему свободному (Anti-Kill-Steal)
          let targetMob = null;
          let minMobDist = Infinity;
          if (this._currentTargetMid) {
            targetMob = this.knownMobs.find(m => m.mid === this._currentTargetMid && m.hp > 0);
            if (targetMob) minMobDist = Math.hypot(targetMob.x - this.x, targetMob.z - this.z);
          }
          if (!targetMob && this.knownMobs.length > 0) {
            for (let i = 0; i < this.knownMobs.length; i++) {
              const m = this.knownMobs[i];
              if (m && m.mid > 0 && m.hp > 0 && !m.isBoss) {
                // Anti-KS: если моба уже атакует другой игрок/бот, пропускаем его!
                if (m.claimedByPid && m.claimedByPid !== this.pid && now < m.claimedUntil) continue;
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
            targetMob.claimedByPid = this.pid;
            targetMob.claimedUntil = now + 8000;
            this._wasInCombat = true;
            if (this.sitting) {
              this.sitting = false;
              this.resting = false;
              this.send({ t: 'pose', sitting: false });
            }
            const isOp = this.cls === 'operator';

            if (isOp) {
              // === ОПЕРАТОР: ближний бой (Melee Stance) ===
              const inReach = minMobDist <= 2.3;
              const lostReach = minMobDist > 3.2; // 0.9м гистерезис: держим боевую стойку и бьем без рывков

              if (this._inMeleeReach ? lostReach : !inReach) {
                this._inMeleeReach = false;
                const mDx = this.x - targetMob.x;
                const mDz = this.z - targetMob.z;
                const mLen = Math.hypot(mDx, mDz) || 1;
                // Идем не в центр моба, а останавливаемся в 1.8м перед ним (как реальный игрок)
                const desiredX = targetMob.x + (mDx / mLen) * 1.8;
                const desiredZ = targetMob.z + (mDz / mLen) * 1.8;

                const curDestDist = Math.hypot(this.targetX - desiredX, this.targetZ - desiredZ);
                if (!this.isMoving || curDestDist > 1.2) {
                  this.targetX = desiredX;
                  this.targetZ = desiredZ;
                  this.speed = 7.5;
                  this.isWalking = false;
                }
              } else {
                // Прибыли в зону удара: фиксируем позицию и непрерывно атакуем
                this._inMeleeReach = true;
                if (this.isMoving) {
                  this.isMoving = false;
                  this.targetX = this.x;
                  this.targetZ = this.z;
                  if (USE_BINARY) {
                    this.seq = (this.seq + 1) & 0xffff;
                    this.sendBinary(NPB.encodeMove(this.x, this.z, false, this.seq, this.x, this.z));
                  }
                  this.send({ t: 'move_stop', x: Number(this.x.toFixed(2)), z: Number(this.z.toFixed(2)) });
                }
                this.targetX = this.x;
                this.targetZ = this.z;

                if (tick % 4 === 0) {
                  if (tick % 16 === 0) {
                    this.send({ t: 'skill', skillId: 'op_power_strike', mid: targetMob.mid });
                  } else if (tick % 24 === 0 && this.energy >= 20) {
                    this.send({ t: 'skill', skillId: 'op_iron_punch', mid: targetMob.mid });
                  } else {
                    this.send({ t: 'attack', mid: targetMob.mid });
                  }
                }
              }
            } else {
              // === ИНЖЕНЕР: дальний бой и кайтинг (Ranged & Tactical Kite) ===
              const maxRange = 8.5;
              const minKiteRange = 3.0;

              if (this._kitingUntil && tick < this._kitingUntil) {
                // Продолжаем плавный тактический отход без дерганий
                this.speed = 6.0;
                this.isWalking = false;
              } else if (minMobDist > maxRange) {
                // Сближение на дистанцию выстрела (6.0м)
                this._kitingUntil = 0;
                const mDx = this.x - targetMob.x;
                const mDz = this.z - targetMob.z;
                const mLen = Math.hypot(mDx, mDz) || 1;
                const desiredX = targetMob.x + (mDx / mLen) * 6.0;
                const desiredZ = targetMob.z + (mDz / mLen) * 6.0;
                if (!this.isMoving || Math.hypot(this.targetX - desiredX, this.targetZ - desiredZ) > 1.8) {
                  this.targetX = desiredX;
                  this.targetZ = desiredZ;
                  this.speed = 7.5;
                  this.isWalking = false;
                }
              } else if (minMobDist < minKiteRange) {
                // Тактический отход назад на 4.5м
                const awayDx = this.x - targetMob.x;
                const awayDz = this.z - targetMob.z;
                const awayLen = Math.hypot(awayDx, awayDz) || 1;
                this.targetX = this.x + (awayDx / awayLen) * 4.5;
                this.targetZ = this.z + (awayDz / awayLen) * 4.5;
                this.speed = 6.0;
                this.isWalking = false;
                this._kitingUntil = tick + 12; // 1.2с тактического отхода
                if (tick % 5 === 0) {
                  this.send({ t: 'skill', skillId: 'eng_pressure_bolt', mid: targetMob.mid });
                }
              } else {
                // Идеальная дистанция стрельбы: стоим на месте и стреляем
                this._kitingUntil = 0;
                if (this.isMoving) {
                  this.isMoving = false;
                  this.targetX = this.x;
                  this.targetZ = this.z;
                  if (USE_BINARY) {
                    this.seq = (this.seq + 1) & 0xffff;
                    this.sendBinary(NPB.encodeMove(this.x, this.z, false, this.seq, this.x, this.z));
                  }
                  this.send({ t: 'move_stop', x: Number(this.x.toFixed(2)), z: Number(this.z.toFixed(2)) });
                }
                this.targetX = this.x;
                this.targetZ = this.z;

                if (tick % 5 === 0) {
                  if (tick % 15 === 0) {
                    this.send({ t: 'skill', skillId: 'eng_pressure_bolt', mid: targetMob.mid });
                  } else if (tick % 25 === 0 && this.energy >= 20) {
                    this.send({ t: 'skill', skillId: 'eng_curse_corrode', mid: targetMob.mid });
                  } else {
                    this.send({ t: 'attack', mid: targetMob.mid });
                  }
                }
              }
            }
          } else {
            // Моб повержен или вышел из зоны видимости
            if (this._wasInCombat) {
              this._wasInCombat = false;
              this._inMeleeReach = false;
              this._kitingUntil = 0;
              this._currentTargetMid = null;
              this.pickNewWaypoint();
            }

            const distToWp = Math.hypot(this.targetX - this.x, this.targetZ - this.z);
            if (distToWp < 0.6) {
              if (this.idleTicks < this.idleMaxTicks) {
                this.idleTicks++;
                if (this.isMoving) {
                  this.isMoving = false;
                  this.targetX = this.x;
                  this.targetZ = this.z;
                  if (USE_BINARY) {
                    this.seq = (this.seq + 1) & 0xffff;
                    this.sendBinary(NPB.encodeMove(this.x, this.z, false, this.seq, this.x, this.z));
                  }
                  this.send({ t: 'move_stop', x: Number(this.x.toFixed(2)), z: Number(this.z.toFixed(2)) });
                }
                // 35% шанс сесть отдохнуть на привале (/sit) между мобами, восстанавливая силы
                if (!this.sitting && this.idleTicks === 2 && Math.random() < 0.35) {
                  this.sitting = true;
                  this.resting = true;
                  this.send({ t: 'pose', sitting: true });
                }
              } else {
                if (this.sitting) {
                  this.sitting = false;
                  this.resting = false;
                  this.send({ t: 'pose', sitting: false });
                }
                this.pickNewWaypoint();
              }
            }
          }
        }

        // 7. Приветствие ТОЛЬКО реальных игроков (человека), но не других ботов!
        if (this.knownPlayers.length > 0 && tick - this.lastGreetChatTick > 2500) {
          const peer = this.knownPlayers.find(p => {
            if (!p || !p.pid) return false;
            const name = String(p.name || '');
            const isBotName = name.startsWith('stress_bot_') || name.startsWith('bot3k_') || name.includes('_');
            if (isBotName) return false;
            return Math.hypot(p.x - this.x, p.z - this.z) < 8.0;
          });
          if (peer && Math.random() < 0.02) {
            this.lastGreetChatTick = tick;
            const greet = CHAT_GREET_PHRASES[Math.floor(Math.random() * CHAT_GREET_PHRASES.length)];
            this.send({ t: 'chat', ch: 'all', text: greet });
          }
        }
      }

      // ============================================================
      //  ФИНАЛ: ПЕРЕМЕЩЕНИЕ И ВЕКТОРНАЯ ПЕРЕДАЧА 10 Hz
      // ============================================================
      if (!this.sitting) {
        const toDx = this.targetX - this.x;
        const toDz = this.targetZ - this.z;
        const distToDest = Math.hypot(toDx, toDz);
        const wasMoving = !!this.isMoving;
        if (distToDest > 0.15) {
          this.isMoving = true;
          const step = Math.min(this.speed * dt, distToDest);
          this.x += (toDx / distToDest) * step;
          this.z += (toDz / distToDest) * step;

          // Отправка пакета движения:
          // 1) В момент начала шага (!wasMoving) — сразу передаем вектор цели
          // 2) В процессе движения — каждые 200 мс (tick % 2 === 0), что вдвое снижает сетевой оверхед
          //    и укладывается в 350 мс таймаут сервера
          if (!wasMoving || (tick % 2 === 0)) {
            this.lastMoveX = this.x;
            this.lastMoveZ = this.z;
            if (USE_BINARY) {
              this.seq = (this.seq + 1) & 0xffff;
              const buf = NPB.encodeMove(this.x, this.z, this.isWalking, this.seq, this.targetX, this.targetZ);
              this.sendBinary(buf);
            } else {
              this.send({
                t: 'move',
                x: Number(this.x.toFixed(2)),
                z: Number(this.z.toFixed(2)),
                destX: Number(this.targetX.toFixed(2)),
                destZ: Number(this.targetZ.toFixed(2)),
                walking: !!this.isWalking
              });
            }
          }
        } else if (wasMoving) {
          this.isMoving = false;
          this.x = this.targetX;
          this.z = this.targetZ;
          this.lastMoveX = this.x;
          this.lastMoveZ = this.z;
          if (USE_BINARY) {
            this.seq = (this.seq + 1) & 0xffff;
            const buf = NPB.encodeMove(this.x, this.z, this.isWalking, this.seq, this.x, this.z);
            this.sendBinary(buf);
          }
          this.send({ t: 'move_stop', x: Number(this.x.toFixed(2)), z: Number(this.z.toFixed(2)) });
        }
      }

      // Heartbeat каждые 12 секунд
      const pingIntervalTicks = (this.index % 10 === 0) ? 20 : 120;
      if (tick % pingIntervalTicks === (this.index % pingIntervalTicks)) {
        if (this.lastPingSent === 0 || Date.now() - this.lastPingSent > 15000) {
          this.lastPingSent = Date.now();
          this.send({ t: 'ping', t0: this.lastPingSent, time: this.lastPingSent });
        }
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

function cleanupZombieProcesses() {
  if (process.platform !== 'win32') return;
  try {
    const psScript = `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ProcessId -ne ${process.pid} -and $_.CommandLine -like '*stress-test-3000*' } | ForEach-Object { $_.ProcessId }`;
    const out = child_process.execFileSync('powershell.exe', ['-NoProfile', '-Command', psScript], { encoding: 'utf8', timeout: 7000 }).trim();
    if (out) {
      const pids = out.split(/\r?\n/).map(s => parseInt(s.trim(), 10)).filter(p => !isNaN(p) && p !== process.pid);
      for (const pid of pids) {
        try { child_process.execSync(`taskkill /F /PID ${pid} /T`, { stdio: 'ignore' }); } catch (_) {}
      }
    }
  } catch (_) {}
}

async function runMaster(initialMetrics) {
  cleanupZombieProcesses();

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
  let isTerminating = false;
  function terminateAllWorkers() {
    if (isTerminating) return;
    isTerminating = true;
    for (const cp of workers) {
      if (!cp) continue;
      try { cp.send({ type: 'stop' }); } catch (_) {}
      try {
        if (process.platform === 'win32' && cp.pid) {
          child_process.execSync(`taskkill /pid ${cp.pid} /T /F`, { stdio: 'ignore' });
        } else if (cp.kill) {
          cp.kill('SIGKILL');
        }
      } catch (_) {}
    }
  }

  process.on('SIGINT', () => {
    console.log('\n[Master] Получен сигнал прерывания (SIGINT). Принудительное завершение всех воркеров...');
    terminateAllWorkers();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    terminateAllWorkers();
    process.exit(0);
  });
  process.on('exit', () => {
    terminateAllWorkers();
  });

  const workerProgress = new Array(WORKERS).fill(null).map(() => ({ connected: 0, failed: 0 }));

  console.log(`🚀 Запуск ${WORKERS} воркеров для распределённой генерации нагрузки...`);

  for (let w = 0; w < WORKERS; w++) {
    const localOffset = w * botsPerWorker;
    const workerBots = Math.min(botsPerWorker, TOTAL_BOTS - localOffset);
    if (workerBots <= 0) break;
    const globalOffset = BOT_OFFSET + localOffset;

    const childHost = (HOST === '127.0.0.1' || HOST === 'localhost') ? `127.0.0.${(w % 8) + 1}` : HOST;
    const childArgs = [
      ...args.filter(a => !a.startsWith('--workers=') && !a.startsWith('--bots=') && !a.startsWith('--offset=') && !a.startsWith('--worker-id=') && !a.startsWith('--host=')),
      `--bots=${workerBots}`,
      `--offset=${globalOffset}`,
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

  const isInfinite = DURATION_SEC <= 0 || args.includes('--daemon');
  if (isInfinite) {
    console.log(`\n⏳ Бессрочный режим симуляции (Daemon / Живой мир Project Steam)...`);
    let step = 0;
    while (true) {
      await sleep(5000);
      step++;
      const m = await fetchMetrics();
      const totalActive = workerProgress.reduce((s, p) => s + (p.active || 0), 0);
      if (m && step % 4 === 0) {
        console.log(
          `  [T+${step * 5}s] Живой мир: Онлайн: ${m.players} | Активных ботов: ${totalActive} | Тик: ${m.tickMs != null ? m.tickMs.toFixed(1) : '?'} мс | ` +
          `EMA: ${m.tickMsEma != null ? m.tickMsEma.toFixed(1) : '?'} мс | Вых.трафик: ${Math.round((m.bytesOut || 0) / 1024)} КБ`
        );
      }
    }
  }

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
  terminateAllWorkers();
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

  // Единый глобальный диспетчер симуляции (10 Hz с учётом реального wall-clock dt при нагрузке на CPU воркера)
  let simTick = 0;
  let lastSimTime = Date.now();
  const simTimer = setInterval(() => {
    try {
      const nowTime = Date.now();
      const dt = Math.max(0.02, Math.min(0.35, (nowTime - lastSimTime) / 1000));
      lastSimTime = nowTime;
      simTick++;
      const len = bots.length;
      if (!len) return;
      for (let k = 0; k < len; k++) {
        const b = bots[k];
        if (b && b.loggedIn) {
          try { b.simulateStep(simTick, dt); } catch (_) {}
        }
      }
    } catch (_) {}
  }, 100);

  const cleanupAndExit = () => {
    global.testFinished = true;
    try { clearInterval(simTimer); } catch (_) {}
    for (const b of bots) {
      try { b.disconnect(); } catch (_) {}
    }
    process.exit(0);
  };

  process.on('disconnect', cleanupAndExit);
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);

  process.on('uncaughtException', (err) => {
    if (WORKER_ID <= 0) console.error(`[Worker ${WORKER_ID}] uncaughtException:`, err && err.message);
  });
  process.on('unhandledRejection', () => {});

  if (WORKER_ID === -1) {
    const isInfinite = DURATION_SEC <= 0 || args.includes('--daemon');
    if (isInfinite) {
      console.log(`\n⏳ Бессрочный режим симуляции (Daemon Standalone / Живой мир)...`);
      let step = 0;
      while (true) {
        await sleep(5000);
        step++;
        const m = await fetchMetrics();
        if (m && step % 4 === 0) {
          const q = calcQuantiles(allRtts.slice(-100));
          console.log(
            `  [T+${step * 5}s] Живой мир (Standalone): Онлайн: ${m.players} | Тик: ${m.tickMs != null ? m.tickMs.toFixed(1) : '?'} мс | RTT p50: ${q.p50}ms`
          );
        }
      }
    }
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
        cleanupAndExit();
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
