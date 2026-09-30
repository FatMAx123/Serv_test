// ============================================================
//  CHAR-SELECT.JS — выбор и создание персонажа (Остров поющей стали)
//  Раса: Человек · Пол: М/Ж · База: Оператор | Инженер
// ============================================================

const STORAGE_KEY = 'ps_characters';
const MAX_SLOTS = (window.CHAR_RULES && window.CHAR_RULES.MAX_SLOTS) || 7;

const PROD_HOST = '93.77.168.135';

function getResolvedGameHost() {
  let host = PROD_HOST;
  try {
    const s = location.search || '';
    const m = s.match(/[?&](?:server|host)[=-]([^&]+)/i);
    if (m && m[1]) host = decodeURIComponent(m[1]).trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    else {
      const mIp = s.match(/[?&](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?)/);
      if (mIp && mIp[1]) host = mIp[1].trim();
      else {
        const q = new URLSearchParams(s).get('server');
        if (q) host = q.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
        else {
          const saved = sessionStorage.getItem('ps_game_host') || localStorage.getItem('ps_game_host');
          if (saved) host = saved;
          else if (window.STEAM_CONFIG && window.STEAM_CONFIG.serverHost) host = window.STEAM_CONFIG.serverHost;
        }
      }
    }
  } catch (_) {}
  const res = String(host || PROD_HOST).trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (res.indexOf('localhost:3000') !== -1 || res.indexOf('127.0.0.1:3000') !== -1) return res;
  return res.replace(/:\d+$/, '');
}

function apiBase() {
  if (location.origin && location.origin.indexOf('localhost:3000') !== -1) {
    return location.origin;
  }
  let host = getResolvedGameHost();
  const proto = location.protocol === 'https:' ? 'https:' : 'http:';
  if (String(host).indexOf('://') >= 0) return String(host).replace(/\/$/, '');
  return proto + '//' + host;
}

async function getAuthPayload() {
  let data = '', signature = '';
  const ysdk = window.ysdk;
  if (ysdk && typeof ysdk.getPlayer === 'function') {
    try {
      const pl = await ysdk.getPlayer({ scopes: false });
      const s = await pl.getSignedData();
      data = s.data;
      signature = s.signature;
      return { data: data, signature: signature };
    } catch (e) { /* fallback local */ }
  }
  let lid = localStorage.getItem('ps_local_id');
  if (!lid) {
    lid = Math.random().toString(36).slice(2);
    localStorage.setItem('ps_local_id', lid);
  }
  const payload = { uniqueID: 'local_' + lid, publicName: 'Operator' };
  try {
    data = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).replace(/=+$/, '');
  } catch (e) {
    data = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  }
  return { data: data, signature: signature };
}

async function charsApi(path, extra) {
  const auth = await getAuthPayload();
  const body = Object.assign({ data: auth.data, signature: auth.signature }, extra || {});
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (e) {} }, 8000) : null;
  const res = await fetch(apiBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctrl ? ctrl.signal : undefined
  });
  if (t) clearTimeout(t);
  let json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!json || typeof json !== 'object') throw new Error('bad response');
  return json;
}

function applyServerList(chars) {
  const list = Array.isArray(chars) ? chars.map(migrateChar) : [];
  state.chars = list;
  saveChars(list);
  return list;
}

function CS() {
  return window.CLASS_SYSTEM || null;
}
function Lore() {
  return window.WORLD_LORE || null;
}

const FALLBACK_BASE = {
  operator: {
    id: 'operator', name: 'Оператор', path: 'fighter',
    pathSubtitle: 'ближний бой и тяжелая броня',
    description:
      'Специалист ближнего боя и тяжелых силовых установок. Экипируется силовыми ключами, молотами и котловыми щитами. Сочетает высокий физический урон, прочную броню и отличную выживаемость. Дальнейший выбор: Механик, Разрушитель или Стрелок.',
    baseStats: { hp: 100, energy: 40, attack: 10, defense: 5, cAtk: 5, cDef: 5 }
  },
  engineer: {
    id: 'engineer', name: 'Инженер', path: 'tech',
    pathSubtitle: 'энергоцепи и импульсное оружие',
    description:
      'Мастер обращения с гидравликой и энергоцепями. Использует Паровые импульсники для атаки высокими температурами и давлением на дистанции, а также выполняет быстрый полевой ремонт. Дальнейший выбор: Конструктор или Наладчик.',
    baseStats: { hp: 80, energy: 80, attack: 6, defense: 4, cAtk: 12, cDef: 8 }
  }
};

function listBaseClasses() {
  const sys = CS();
  if (sys && sys.listBaseClasses) return sys.listBaseClasses();
  return [FALLBACK_BASE.operator, FALLBACK_BASE.engineer];
}

function getClassData(id) {
  const sys = CS();
  if (sys && sys.getClass) {
    const c = sys.getClass(id);
    if (c) return c;
  }
  return FALLBACK_BASE[id] || FALLBACK_BASE.operator;
}

function classNameOf(id) {
  return getClassData(id).name || id;
}

/**
 * Боевые статы с уровня/класса — единый источник (CLASS_SYSTEM.statsAtLevel).
 * Не «замораживаем» 100/50: всегда пересчитываем под актуальные формулы C1.
 */
function liveStatsFor(ch) {
  if (!ch) return null;
  const sys = CS();
  const cls = ch.cls || 'operator';
  const lv = Math.max(1, ch.level | 0 || 1);
  if (sys && typeof sys.statsAtLevel === 'function') {
    return sys.statsAtLevel(cls, lv);
  }
  // fallback: baseStats класса (устаревшие)
  const cd = getClassData(cls);
  const bs = cd.baseStats || {};
  return {
    maxHp: bs.hp || 100,
    maxEnergy: bs.energy || 50,
    pAtk: bs.attack || 10,
    pDef: bs.defense || 5,
    cAtk: bs.cAtk != null ? bs.cAtk : (bs.mAtk || 6),
    cDef: bs.cDef != null ? bs.cDef : (bs.mDef || 5),
    mAtk: bs.cAtk != null ? bs.cAtk : (bs.mAtk || 6),
    mDef: bs.cDef != null ? bs.cDef : (bs.mDef || 5),
    speed: bs.speed || 8,
    critRate: bs.critRate || 15,
    primary: null
  };
}

/** Записать live-статы в объект персонажа (сохраняет % HP/Пар). */
function applyCombatStats(ch) {
  if (!ch || typeof ch !== 'object') return ch;
  const st = liveStatsFor(ch);
  if (!st) return ch;

  const prevMaxHp = Math.max(1, ch.maxHp || st.maxHp || 1);
  const prevMaxEn = Math.max(1, ch.maxEnergy || st.maxEnergy || 1);
  const hpRatio = ch.hp != null ? Math.min(1, Math.max(0, ch.hp / prevMaxHp)) : 1;
  const enRatio = ch.energy != null ? Math.min(1, Math.max(0, ch.energy / prevMaxEn)) : 1;

  ch.maxHp = st.maxHp;
  ch.maxEnergy = st.maxEnergy;
  ch.hp = Math.max(1, Math.floor(st.maxHp * hpRatio));
  ch.energy = Math.max(0, Math.floor(st.maxEnergy * enRatio));
  ch.attack = st.pAtk;
  ch.defense = st.pDef;
  ch.pAtk = st.pAtk;
  ch.pDef = st.pDef;
  ch.cAtk = st.cAtk != null ? st.cAtk : st.mAtk;
  ch.cDef = st.cDef != null ? st.cDef : st.mDef;
  ch.mAtk = ch.cAtk;
  ch.mDef = ch.cDef;
  ch.speed = st.speed != null ? st.speed : ch.speed;
  ch.critRate = st.critRate != null ? st.critRate : ch.critRate;
  if (st.primary) ch.primary = st.primary;

  // exp table C1
  if (window.L2_EXP_TABLE && window.L2_EXP_TABLE.expToNext) {
    ch.expToNext = window.L2_EXP_TABLE.expToNext(ch.level || 1);
  }
  return ch;
}

function loadChars() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    let dirty = false;
    const list = arr.map((c) => {
      const before = JSON.stringify({
        m: c && c.maxHp, e: c && c.maxEnergy, a: c && c.attack, d: c && c.defense
      });
      const m = migrateChar(c);
      const after = JSON.stringify({
        m: m && m.maxHp, e: m && m.maxEnergy, a: m && m.attack, d: m && m.defense
      });
      if (before !== after) dirty = true;
      return m;
    });
    if (dirty) saveChars(list);
    return list;
  } catch (e) {
    return [];
  }
}

function migrateChar(ch) {
  if (!ch || typeof ch !== 'object') return ch;
  if (!ch.race) ch.race = 'human';
  if (!ch.gender) ch.gender = 'male';
  if (!ch.cls) ch.cls = 'operator';
  if (!ch.className) ch.className = classNameOf(ch.cls);
  if (!ch.classHistory) ch.classHistory = [ch.cls];
  if (!ch.level) ch.level = 1;
  if (!ch.appearance || typeof ch.appearance !== 'object') {
    ch.appearance = { hairId: 'none', hairColor: HAIR_COLOR_HEX[0] };
  }
  // Starter equip snapshot if missing (so select hall can show weapon before first login)
  if (!ch.equip || typeof ch.equip !== 'object') {
    const root = ch.cls === 'engi' ? 'engineer' : ch.cls;
    if (root === 'engineer') {
      ch.equip = {
        weapon: { id: 'apprentice_wand', templateId: 'apprentice_wand' },
        necklace: { id: 'engineer_emitter_low', templateId: 'engineer_emitter_low' },
        bracelet: { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' },
        chest: { id: 'engineer_jacket_low', templateId: 'engineer_jacket_low' },
        legs: { id: 'engineer_pants_low', templateId: 'engineer_pants_low' }
      };
    } else {
      ch.equip = {
        weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
        necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
        bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' },
        chest: { id: 'wooden_breastplate', templateId: 'wooden_breastplate' },
        legs: { id: 'wooden_gaiters', templateId: 'wooden_gaiters' }
      };
    }
  }
  // 3D weapon on hand: prefer saved equip, else starter for class
  const resolvedW = resolveWeaponVisualId(ch, ch.cls, ch.gender);
  if (resolvedW) ch.appearance.weaponId = resolvedW;
  else if (ch.appearance) delete ch.appearance.weaponId;
  // Keep saved combat stats (from last session / server). Only fill if missing.
  if (ch.maxHp == null || ch.pAtk == null || ch.pDef == null) {
    applyCombatStats(ch);
  } else if (window.L2_EXP_TABLE && window.L2_EXP_TABLE.expToNext) {
    ch.expToNext = window.L2_EXP_TABLE.expToNext(ch.level || 1);
  }
  return ch;
}

function saveChars(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function $(id) { return document.getElementById(id); }

function toast(msg) {
  const el = $('cs-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// Must match CharModel.HAIR_STYLES order (none, hair1, …). Labels like L2 constructor (no names).
const HAIR_STYLES = ['Тип A', 'Тип B'];
const HAIR_STYLE_IDS = ['none', 'hair1'];
/** Labels + vivid dyes (grayscale hair map × color → clear differences). */
const HAIR_COLORS = ['Чёрный', 'Каштан', 'Рыжий', 'Блонд', 'Пепельный'];
const HAIR_COLOR_HEX = [
  '#121014', // чёрный
  '#6b3210', // каштан (насыщенный)
  '#e03a12', // рыжий (яркий)
  '#f2d060', // блонд
  '#c4c4d0'  // пепельный / седой
];
/** Face labels — must match CharModel.FACE_STYLES order (face1, face2, face3). */
const FACE_TYPES = ['Тип 1', 'Тип 2', 'Тип 3'];
const FACE_STYLE_IDS = ['face1', 'face2', 'face3'];
const CLASS_ORDER = ['operator', 'engineer'];
const GENDER_ORDER = ['male', 'female'];

const createState = {
  race: 'human',
  gender: 'male',
  cls: 'operator',
  hair: 1, // default: loaded hair1
  hairColor: 0,
  face: 0,
  open: false
};

/** 3D hand weapon for engineer starter (apprentice_wand / Ударник Ученика). Resonator = necklace, no mesh. */
function defaultWeaponIdFor(cls, gender) {
  const c = cls === 'engi' ? 'engineer' : cls;
  if (c === 'engineer') return 'apprentice_wand';
  return null;
}

/**
 * Resolve 3D weapon id for char-select hall / create preview.
 * Priority: equip.weapon → appearance.weaponId → class starter.
 * If equip snapshot exists and weapon slot empty → bare hands.
 * Resonator (engineer_emitter_low) has no hand mesh.
 */
function resolveWeaponVisualId(chOrApp, cls, gender) {
  let equip = null;
  let app = null;
  let c = cls;
  let g = gender;
  if (chOrApp && (chOrApp.cls || chOrApp.equip || chOrApp.appearance || chOrApp.id)) {
    equip = chOrApp.equip || null;
    app = chOrApp.appearance || null;
    c = chOrApp.cls || cls;
    g = chOrApp.gender || gender;
  } else if (chOrApp && typeof chOrApp === 'object') {
    app = chOrApp;
  }
  if (equip && typeof equip === 'object') {
    const fromEquip = equip.weapon;
    if (fromEquip) {
      const tid = String(fromEquip.templateId || fromEquip.id || '').toLowerCase();
      if (tid && tid !== 'engineer_emitter_low') return tid;
      return null;
    }
    // equip known, no weapon → unequipped
    return null;
  }
  if (app && app.weaponId && app.weaponId !== 'engineer_emitter_low') {
    return app.weaponId;
  }
  return defaultWeaponIdFor(c, g);
}

/** Appearance payload for 3D select/create (hair/face + hand weapon). */
function appearanceForDisplay(ch) {
  const base = Object.assign({}, (ch && ch.appearance) || {});
  const wid = resolveWeaponVisualId(ch, ch && ch.cls, ch && ch.gender);
  if (wid) base.weaponId = wid;
  else delete base.weaponId;
  return base;
}

function getCreateAppearance() {
  const hairId = HAIR_STYLE_IDS[createState.hair] || HAIR_STYLE_IDS[0];
  const hairColor = HAIR_COLOR_HEX[createState.hairColor] || HAIR_COLOR_HEX[0];
  const faceId = FACE_STYLE_IDS[createState.face] || FACE_STYLE_IDS[0];
  const out = { hairId: hairId, hairColor: hairColor, faceId: faceId };
  // Save class starter hand weapon (engineer → Ударник Ученика)
  const weaponId = defaultWeaponIdFor(createState.cls, createState.gender);
  if (weaponId) out.weaponId = weaponId;
  return out;
}

function cycleIndex(i, dir, len) {
  return (i + dir + len) % len;
}

function createCharacter(name) {
  const n = String(name || '').trim();
  if (n.length < 2) return { err: 'Имя слишком короткое (мин. 2).' };
  if (n.length > 16) return { err: 'Имя слишком длинное (макс. 16).' };
  if (!/^[\w\u0400-\u04FF\- ]+$/i.test(n)) return { err: 'Недопустимые символы в имени.' };

  const sys = CS();
  let race = createState.race || 'human';
  let gender = createState.gender || 'male';
  let cls = createState.cls || 'operator';

  if (sys && sys.validateCreate) {
    const v = sys.validateCreate({ name: n, race, gender, cls });
    if (!v.ok) {
      const map = {
        name_short: 'Имя слишком короткое.',
        name_long: 'Имя слишком длинное.',
        name_invalid: 'Недопустимые символы.',
        race_invalid: 'Недопустимая раса.',
        gender_invalid: 'Недопустимый пол.',
        class_invalid: 'Недопустимый класс.',
        gender_not_for_race: 'Пол недоступен для расы.',
        class_not_for_race: 'Класс недоступен для расы.'
      };
      return { err: map[v.errors[0]] || 'Ошибка создания.' };
    }
    race = v.race; gender = v.gender; cls = v.cls;
  }

  if (state.chars.length >= MAX_SLOTS) return { err: 'Нет свободных слотов (' + MAX_SLOTS + ').' };
  if (state.chars.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
    return { err: 'Имя уже занято.' };
  }

  const app = getCreateAppearance();
  if (!app.weaponId && defaultWeaponIdFor(cls, gender)) {
    app.weaponId = defaultWeaponIdFor(cls, gender);
  }
  return {
    ok: true,
    payload: { name: n, race: race, gender: gender, cls: cls, appearance: app }
  };
}

function createReasonText(code) {
  const map = {
    name: 'Недопустимое имя.',
    name_short: 'Имя слишком короткое.',
    name_long: 'Имя слишком длинное.',
    name_invalid: 'Недопустимые символы.',
    taken: 'Имя уже занято.',
    slots: 'Нет свободных слотов (' + MAX_SLOTS + ').',
    banned: 'Аккаунт заблокирован.',
    busy: 'Подождите, идёт вход.',
    forbidden: 'Нет доступа к серверу.',
    clan_leader: 'Сначала передайте клан или распустите его.',
    no_char: 'Персонаж не найден.'
  };
  return map[code] || 'Ошибка сервера.';
}

const state = {
  chars: [],
  selectedId: null,
  room: null,
  ddOpen: false
};

function selected() {
  return state.chars.find((c) => c.id === state.selectedId) || null;
}

function genderLabel(g) {
  if (g === 'female') return 'Ж';
  return 'М';
}

function raceLabel(r) {
  if (r === 'human') return 'Человек';
  return r || 'Человек';
}

function renderSlots() {
  const box = $('cs-slots');
  if (!box) return;
  box.innerHTML = '';
  const list = state.chars;
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'cs-slot cs-slot-empty';
    empty.textContent = '— пусто —';
    box.appendChild(empty);
    return;
  }
  for (let i = 0; i < list.length; i++) {
    const ch = list[i];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs-slot' + (ch.id === state.selectedId ? ' active' : '');
    btn.textContent = ch.name;
    btn.addEventListener('click', () => {
      selectChar(ch.id);
      closeDropdown();
    });
    box.appendChild(btn);
  }
}

function selectChar(id) {
  state.selectedId = id;
  const ch = selected();
  renderSlots();
  renderInfo(ch);
  updateButtons();
  if (window.CharSelectRoom) {
    if (ch) {
      window.CharSelectRoom.setCharacter(
        ch.cls || 'operator',
        ch.gender || 'male',
        appearanceForDisplay(ch)
      );
    } else {
      window.CharSelectRoom.clearCharacter();
    }
  }
  const plate = $('cs-nameplate');
  const nameBtn = $('cs-name-current');
  if (plate) {
    if (ch) {
      plate.textContent = ch.name;
      plate.classList.remove('hidden');
    } else {
      plate.classList.add('hidden');
    }
  }
  if (nameBtn) nameBtn.textContent = ch ? ch.name : '—';
}

function renderInfo(ch) {
  const empty = $('cs-info-empty');
  const body = $('cs-info-body');
  if (!ch) {
    empty.classList.remove('hidden');
    body.classList.add('hidden');
    return;
  }
  empty.classList.add('hidden');
  body.classList.remove('hidden');

  // Show saved character stats (not fresh template). Fill gaps only.
  if (ch.maxHp == null || ch.pAtk == null) applyCombatStats(ch);

  $('cs-level').textContent = String(ch.level || 1);
  $('cs-class').textContent = ch.className || classNameOf(ch.cls);

  const raceEl = $('cs-race');
  const genderEl = $('cs-gender');
  if (raceEl) raceEl.textContent = raceLabel(ch.race);
  if (genderEl) genderEl.textContent = genderLabel(ch.gender);

  const exp = ch.exp || 0;
  const expNeed = ch.expToNext || 100;
  const pct = Math.min(100, (exp / expNeed) * 100);
  $('cs-exp-pct').textContent = pct.toFixed(2) + '%';
  const expFill = $('cs-exp-fill');
  if (expFill) expFill.style.width = pct.toFixed(2) + '%';

  const mhp = ch.maxHp || 100;
  const men = ch.maxEnergy || 50;
  const hp = ch.hp != null ? ch.hp : mhp;
  const en = ch.energy != null ? ch.energy : men;
  $('cs-hp-text').textContent = hp + ' / ' + mhp;
  $('cs-en-text').textContent = en + ' / ' + men;
  $('cs-hp-fill').style.width = Math.round((hp / Math.max(1, mhp)) * 100) + '%';
  $('cs-en-fill').style.width = Math.round((en / Math.max(1, men)) * 100) + '%';
  $('cs-karma').textContent = String(ch.karma != null ? ch.karma : 0);
  $('cs-sp').textContent = String(ch.sp != null ? ch.sp : 0);

  // боевые (как в игре)
  const setTxt = (id, v) => { const el = $(id); if (el) el.textContent = String(v != null ? v : '—'); };
  setTxt('cs-patk', ch.pAtk != null ? ch.pAtk : ch.attack);
  setTxt('cs-pdef', ch.pDef != null ? ch.pDef : ch.defense);
  setTxt('cs-catk', ch.cAtk != null ? ch.cAtk : ch.mAtk);
  setTxt('cs-cdef', ch.cDef != null ? ch.cDef : ch.mDef);
}

function updateButtons() {
  const has = !!selected();
  const full = state.chars.length >= MAX_SLOTS;
  $('cs-btn-delete').disabled = !has;
  $('cs-btn-start').disabled = !has;
  $('cs-btn-create').disabled = full;
}

function openDropdown() {
  state.ddOpen = true;
  $('cs-slots').classList.remove('hidden');
}
function closeDropdown() {
  state.ddOpen = false;
  $('cs-slots').classList.add('hidden');
}
function toggleDropdown() {
  if (state.ddOpen) closeDropdown();
  else openDropdown();
}

function setCreateGender(g) {
  createState.gender = g === 'female' ? 'female' : 'male';
  syncCreateForm();
  previewCreateVisual();
}

function setCreateClass(cls) {
  createState.cls = cls === 'engineer' ? 'engineer' : 'operator';
  syncCreateForm();
  previewCreateVisual();
}

function updateCreateClassPanel() {
  const cd = getClassData(createState.cls);
  const descEl = $('cs-create-class-desc');
  const statsEl = $('cs-create-class-stats');
  if (descEl) {
    let pathLine = '';
    const sys = CS();
    if (sys && sys.pathLabel) pathLine = sys.pathLabel(cd);
    else {
      const isTech = cd.path === 'tech' || cd.path === 'mystic';
      pathLine = isTech
        ? 'Контурная линия · ' + (cd.pathSubtitle || 'давление, схемы, протоколы')
        : 'Силовая линия · ' + (cd.pathSubtitle || 'молот, щит, пневматика');
    }
    descEl.textContent = (cd.description || cd.name || createState.cls) + ' — ' + pathLine;
  }
  if (statsEl) {
    const st = liveStatsFor({ cls: createState.cls, level: 1 });
    if (st) {
      statsEl.textContent =
        'HP ' + st.maxHp +
        ' · Пар ' + st.maxEnergy +
        ' · Удар ' + st.pAtk +
        ' · Броня ' + st.pDef +
        ' · Схемы ' + (st.cAtk != null ? st.cAtk : '—') +
        ' · Контур ' + (st.cDef != null ? st.cDef : '—');
    } else {
      statsEl.textContent = '—';
    }
  }
}

function syncCreateForm() {
  const raceEl = $('cs-create-race');
  const clsEl = $('cs-create-cls');
  const genderEl = $('cs-create-gender');
  const hairEl = $('cs-create-hair');
  const hairColorEl = $('cs-create-hair-color');
  const faceEl = $('cs-create-face');
  if (raceEl) raceEl.textContent = 'Человек';
  if (clsEl) clsEl.textContent = classNameOf(createState.cls);
  if (genderEl) genderEl.textContent = createState.gender === 'female' ? 'Женский' : 'Мужской';
  if (hairEl) hairEl.textContent = HAIR_STYLES[createState.hair] || HAIR_STYLES[0];
  if (hairColorEl) hairColorEl.textContent = HAIR_COLORS[createState.hairColor] || HAIR_COLORS[0];
  if (faceEl) faceEl.textContent = FACE_TYPES[createState.face] || FACE_TYPES[0];
  updateCreateClassPanel();
  const label = $('cs-lineup-label');
  if (label && createState.open) {
    label.textContent = classNameOf(createState.cls) + ' · ' +
      (createState.gender === 'female' ? 'Ж' : 'М');
    label.classList.add('show');
  }
}

function previewCreateVisual() {
  const room = window.CharSelectRoom;
  if (!room) return;
  if (room.setCreateSelection) {
    room.setCreateSelection(createState.cls, createState.gender);
  } else if (room.setCharacter) {
    room.setCharacter(createState.cls, createState.gender);
  }
  // 3D engi hair / color (only male engineer has modular hair for now)
  if (room.setCreateAppearance) {
    room.setCreateAppearance(getCreateAppearance());
  }
}

function openModal() {
  createState.open = true;
  createState.race = 'human';
  createState.gender = 'male';
  createState.cls = 'operator';
  createState.hair = 1; // Причёска 1 by default
  createState.hairColor = 0;
  createState.face = 0;
  document.body.classList.add('cs-mode-create');
  const err = $('cs-modal-err');
  if (err) err.textContent = '';
  const input = $('cs-input-name');
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
  syncCreateForm();
  if (window.CharSelectRoom) {
    if (window.CharSelectRoom.setCreateMode) window.CharSelectRoom.setCreateMode(true);
    else if (window.CharSelectRoom.clearCharacter) window.CharSelectRoom.clearCharacter();
    previewCreateVisual();
    // hair apply after lineup is visible (engi_m may load async)
    setTimeout(() => {
      if (window.CharSelectRoom && window.CharSelectRoom.setCreateAppearance) {
        window.CharSelectRoom.setCreateAppearance(getCreateAppearance());
      }
    }, 100);
  }
}

function closeModal() {
  // no saved chars → back to main menu (L2 "Previous")
  if (!state.chars.length) {
    location.href = 'menu.html';
    return;
  }
  createState.open = false;
  document.body.classList.remove('cs-mode-create');
  const label = $('cs-lineup-label');
  if (label) label.classList.remove('show');
  const ch = selected();
  if (window.CharSelectRoom) {
    if (ch) {
      window.CharSelectRoom.setCharacter(
        ch.cls || 'operator',
        ch.gender || 'male',
        appearanceForDisplay(ch)
      );
    } else if (window.CharSelectRoom.clearCharacter) {
      window.CharSelectRoom.clearCharacter();
    }
  }
}

async function onCreate() {
  const err = $('cs-modal-err');
  const res = createCharacter($('cs-input-name') ? $('cs-input-name').value : '');
  if (res.err) {
    if (err) err.textContent = res.err;
    return;
  }
  if (err) err.textContent = '';
  const okBtn = $('cs-modal-ok');
  if (okBtn) okBtn.disabled = true;
  try {
    const r = await charsApi('/api/chars/create', res.payload);
    if (!r.ok) {
      if (err) err.textContent = createReasonText(r.error);
      return;
    }
    applyServerList(r.chars);
    closeModal();
    const ch = r.char ? migrateChar(r.char) : selected();
    if (ch && ch.id) selectChar(ch.id);
    else if (state.chars[0]) selectChar(state.chars[0].id);
    toast('Создан: ' + (ch && ch.name ? ch.name : '') + (ch ? ' · ' + classNameOf(ch.cls) : ''));
  } catch (e) {
    if (err) err.textContent = 'Сервер недоступен.';
  } finally {
    if (okBtn) okBtn.disabled = false;
  }
}

function onSpin(kind, dir) {
  const d = dir < 0 ? -1 : 1;
  if (kind === 'cls') {
    const i = CLASS_ORDER.indexOf(createState.cls);
    createState.cls = CLASS_ORDER[cycleIndex(i < 0 ? 0 : i, d, CLASS_ORDER.length)];
  } else if (kind === 'gender') {
    const i = GENDER_ORDER.indexOf(createState.gender);
    createState.gender = GENDER_ORDER[cycleIndex(i < 0 ? 0 : i, d, GENDER_ORDER.length)];
  } else if (kind === 'hair') {
    createState.hair = cycleIndex(createState.hair, d, HAIR_STYLES.length);
  } else if (kind === 'hairColor') {
    createState.hairColor = cycleIndex(createState.hairColor, d, HAIR_COLORS.length);
  } else if (kind === 'face') {
    createState.face = cycleIndex(createState.face, d, FACE_TYPES.length);
  }
  syncCreateForm();
  if (kind === 'cls' || kind === 'gender' || kind === 'hair' || kind === 'hairColor' || kind === 'face') {
    previewCreateVisual();
  }
}

function onScenePick(pick) {
  if (!createState.open || !pick) return;
  if (pick.cls) createState.cls = pick.cls === 'engineer' ? 'engineer' : 'operator';
  if (pick.gender) createState.gender = pick.gender === 'female' ? 'female' : 'male';
  syncCreateForm();
  // Only highlight selection — do NOT re-run setHair (blink)
  const room = window.CharSelectRoom;
  if (room && room.setCreateSelection) {
    room.setCreateSelection(createState.cls, createState.gender);
  }
}

async function onDelete() {
  const ch = selected();
  if (!ch) return;
  let ok = false;
  if (window.GameDialog && window.GameDialog.confirm) {
    ok = await window.GameDialog.confirm(
      'Удалить персонажа «' + ch.name + '»?',
      { title: 'Удаление персонажа', okLabel: 'Удалить', cancelLabel: 'Отмена', danger: true }
    );
  }
  if (!ok) return;
  $('cs-btn-delete').disabled = true;
  try {
    const r = await charsApi('/api/chars/delete', { charId: ch.id, id: ch.id });
    if (!r.ok) {
      toast(createReasonText(r.error));
      return;
    }
    applyServerList(r.chars);
    state.selectedId = state.chars[0] ? state.chars[0].id : null;
    selectChar(state.selectedId);
    toast('Удалён');
  } catch (e) {
    toast('Сервер недоступен.');
  } finally {
    updateButtons();
  }
}

function onStart() {
  const ch = selected();
  if (!ch) return;
  // Keep saved stats; only compute if slot never had combat fields
  if (ch.maxHp == null || ch.pAtk == null) applyCombatStats(ch);
  const host = getResolvedGameHost();
  try {
    const list = loadChars().map((c) => (c.id === ch.id ? ch : c));
    const idx = list.findIndex((c) => c.id === ch.id);
    if (idx >= 0) list[idx] = ch;
    saveChars(list);
    sessionStorage.setItem('ps_selected_char', JSON.stringify(ch));
    localStorage.setItem('ps_selected_char', JSON.stringify(ch));
    sessionStorage.setItem('ps_connect', '1');
    localStorage.setItem('ps_connect', '1');
    sessionStorage.setItem('ps_game_host', host);
    localStorage.setItem('ps_game_host', host);
  } catch (e) {}
  location.href = 'game.html?server=' + encodeURIComponent(host);
}

function onPrev() {
  const host = getResolvedGameHost();
  location.href = 'menu.html?server=' + encodeURIComponent(host);
}

function bind() {
  const btnCreate = $('cs-btn-create');
  if (btnCreate) btnCreate.addEventListener('click', openModal);
  const btnDel = $('cs-btn-delete');
  if (btnDel) btnDel.addEventListener('click', onDelete);
  const btnStart = $('cs-btn-start');
  if (btnStart) btnStart.addEventListener('click', onStart);
  const btnPrev = $('cs-btn-prev');
  if (btnPrev) btnPrev.addEventListener('click', onPrev);
  const modalOk = $('cs-modal-ok');
  if (modalOk) modalOk.addEventListener('click', onCreate);
  const modalCancel = $('cs-modal-cancel');
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  const input = $('cs-input-name');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') onCreate();
      if (e.key === 'Escape') closeModal();
    });
  }

  document.querySelectorAll('.l2create-arrow[data-spin]').forEach((el) => {
    el.addEventListener('click', () => {
      const kind = el.getAttribute('data-spin');
      const dir = parseInt(el.getAttribute('data-dir') || '1', 10);
      onSpin(kind, dir);
    });
  });

  const nameBtn = $('cs-name-btn');
  if (nameBtn) nameBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });
  document.addEventListener('click', (e) => {
    const dd = $('cs-name-dd');
    if (dd && !dd.contains(e.target)) closeDropdown();
  });

  // Make windows draggable with mouse and touch
  makeDraggable($('cs-info'), ($('cs-info') && $('cs-info').querySelector('.l2c1-titlebar')) || $('cs-info'));
  makeDraggable($('cs-create-panel'), ($('cs-create-panel') && $('cs-create-panel').querySelector('.l2create-titlebar')) || $('cs-create-panel'));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (createState.open) closeModal();
      else if (state.ddOpen) closeDropdown();
      else onPrev();
    }
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    return false;
  }, { capture: true, passive: false });

  document.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length > 1) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    const scrollable = e.target.closest('.l2c1-body, .cs-modal-box, [data-scrollable]');
    if (!scrollable) {
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false });
}

function makeDraggable(el, handle) {
  if (!el || !handle) return;
  handle.style.cursor = 'grab';
  let dragging = false, startX = 0, startY = 0, initL = 0, initT = 0, moved = false;

  const onStart = (cx, cy, target) => {
    if (target.closest('button, input, select, a, [data-nodrag]')) return;
    dragging = true;
    moved = false;
    handle.style.cursor = 'grabbing';
    const r = el.getBoundingClientRect();
    el.style.left = r.left + 'px';
    el.style.top = r.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
    startX = cx;
    startY = cy;
    initL = r.left;
    initT = r.top;
  };

  const onMove = (cx, cy) => {
    if (!dragging) return;
    const dx = cx - startX, dy = cy - startY;
    if (!moved && Math.hypot(dx, dy) > 4) moved = true;
    if (moved) {
      const w = window.innerWidth, h = window.innerHeight;
      const ew = el.offsetWidth || 100, eh = el.offsetHeight || 50;
      el.style.left = Math.max(0, Math.min(w - ew, initL + dx)) + 'px';
      el.style.top = Math.max(0, Math.min(h - eh, initT + dy)) + 'px';
    }
  };

  const onEnd = () => {
    if (dragging) {
      dragging = false;
      handle.style.cursor = 'grab';
    }
  };

  handle.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY, e.target));
  window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onEnd);

  handle.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY, e.target);
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches.length === 1 && dragging) onMove(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  window.addEventListener('touchend', onEnd);
}

function attachRoom(room) {
  if (!room) return;
  state.room = room;
  if (room.onCharacterPick) room.onCharacterPick(onScenePick);
  if (createState.open) {
    if (room.setCreateMode) room.setCreateMode(true);
    previewCreateVisual();
  } else {
    const ch = selected();
    if (ch) {
      // select mode: castle hall + character with appearance + equip weapon
      if (room.setCreateMode) room.setCreateMode(false);
      room.setCharacter(ch.cls || 'operator', ch.gender || 'male', appearanceForDisplay(ch));
    } else if (room.clearCharacter) {
      room.clearCharacter();
    }
  }
}

function showSelectList() {
  closeDropdown();
  if (state.chars.length) {
    const keep = state.chars.find((c) => c.id === state.selectedId);
    selectChar(keep ? keep.id : state.chars[0].id);
  } else {
    state.selectedId = null;
    renderSlots();
    renderInfo(null);
    updateButtons();
    if ($('cs-name-current')) $('cs-name-current').textContent = '—';
    document.body.classList.add('cs-mode-create');
    createState.open = true;
    syncCreateForm();
  }
}

async function boot() {
  // Требуется авторизация по ключу: без ключа не пускаем создавать безымянных сирот
  if (localStorage.getItem('ps_has_key') !== 'true' || !localStorage.getItem('ps_local_id')) {
    location.href = 'menu.html';
    return;
  }

  bind();
  closeDropdown();
  state.chars = loadChars();
  if (state.chars.length) selectChar(state.chars[0].id);
  else showSelectList();

  window.addEventListener('cs-room-ready', () => attachRoom(window.CharSelectRoom));
  if (window.CharSelectRoom) attachRoom(window.CharSelectRoom);

  try {
    const r = await charsApi('/api/chars', {});
    if (r && r.ok && Array.isArray(r.chars)) {
      applyServerList(r.chars);
      showSelectList();
    }
  } catch (e) {
    if (state.chars.length) toast('Сервер недоступен, показан кэш');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
