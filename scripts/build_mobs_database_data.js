// SCRIPTS / BUILD_MOBS_DATABASE_DATA.JS
// Aggregates all 56 active in-game mobs with full stats, live spawns, zones, and loot tables.
const fs = require('fs');
const path = require('path');

const { MOBS } = require('../shared/mob-db.js');
const { MOB_LOOT_TABLES } = require('../shared/loot-rules.js');
const { ITEMS } = require('../shared/item-db.js');
const overrides = require('../shared/editor-overrides.json');

// Zone translations & clean names
const ZONE_NAMES = {
  'operators_yard': 'Территория операторов',
  'engineers_school': 'Школа инженерии',
  'astard_hills': 'Холмы Астарда',
  'scrapyard': 'Свалка',
  'western_lands': 'Западные земли',
  'riverspan': 'Междуречье',
  'cruna_yards': 'Дворы Круны',
  'field_of_oblivion': 'Поле забвения',
  'quiet_backwater': 'Тихая заводь',
  'steel_cliff': 'Стальной утёс',
  'lost_gardens': 'Затерянные сады',
  'apiary': 'Пасека',
  'boiler_lands': 'Котловые земли',
  'eastern_range': 'Восточный полигон',
  'chem_ruins': 'Руины химзавода',
  'bunker_gate': 'Врата бункера',
  'rezdiq_barracks': 'Бараки Рездика',
  'steel_limit_fort': 'Крепость стального предела',
  'cruna_tower': 'Башня Круны',
  'secret': 'Секретные закоулки',
  'secret_tralalero': 'Секретная площадка школы',
  'secret_cappuccino': 'Мыс Западных земель',
  'secret_tung': 'Излучина реки',
  'secret_skibidi': 'Заводь тихой воды',
  'secret_bombardiro': 'Химзаводской берег',
  'Территория операторов': 'Территория операторов',
  'Школа инженерии': 'Школа инженерии',
  'Восточные земли': 'Восточные земли',
  'Восточный полигон': 'Восточный полигон',
  'Котловые завои': 'Котловые земли',
  'Котловые земли': 'Котловые земли',
  'Крепость стального предела': 'Крепость стального предела',
  'Памятник павшим': 'Памятник павшим',
  'Руины химзавода': 'Руины химзавода',
  'Междуречье': 'Междуречье',
  'Холмы Астарда': 'Холмы Астарда',
  'Зетрянные сады': 'Затерянные Сады',
  'Затерянные сады': 'Затерянные Сады',
  'Затерянные Сады': 'Затерянные Сады',
  'Пасека': 'Пасека',
  'Тихая заводь': 'Тихая заводь',
  'Дворы Круны': 'Дворы Круны',
  'Западные земли': 'Западные земли',
  'Свалка': 'Свалка',
  'Поле забвения': 'Поле забвения',
  'Бараки Рездана': 'Бараки Рездика',
  'Бараки Рездика': 'Бараки Рездика',
  '※ Secret · School ledge': 'Секретная площадка школы',
  '※ Secret · River bend': 'Излучина реки',
  '※ Secret · West cape': 'Мыс Западных земель',
  '※ Secret · Backwater tip': 'Заводь тихой воды',
  '※ Secret · Chem shore': 'Химзаводской берег'
};

function formatChance(chance) {
  const pct = chance * 100;
  if (pct >= 10) return `${pct.toFixed(0)}%`;
  if (pct >= 1) return `${pct.toFixed(1)}%`;
  if (pct >= 0.1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
}

function resolveItem(id) {
  const it = ITEMS[id];
  if (!it) {
    return {
      id,
      name: id,
      icon: 'assets/inventar/icons/gear_fragment.webp',
      grade: 'No-Grade',
      gradeClass: 'ng'
    };
  }
  let gradeClass = 'ng';
  let gradeLabel = 'No-Grade';
  if (it.grade === 'd_grade' || it.grade === 'd') {
    gradeClass = 'd';
    gradeLabel = 'D-Grade';
  } else if (it.grade === 'c_grade' || it.grade === 'c') {
    gradeClass = 'c';
    gradeLabel = 'C-Grade';
  } else if (it.grade === 'b_grade' || it.grade === 'b') {
    gradeClass = 'b';
    gradeLabel = 'B-Grade';
  }
  return {
    id: it.id,
    name: it.name,
    icon: it.icon || 'assets/inventar/icons/gear_fragment.webp',
    grade: gradeLabel,
    gradeClass,
    slot: it.slot || it.type || ''
  };
}

// 1. Calculate live spawns and zones from editor-overrides
const mobSpawns = {};
const mobZones = {};

(overrides.mobSpots || []).forEach(spot => {
  const mId = spot.mob;
  const count = spot.n || spot.count || 1;
  mobSpawns[mId] = (mobSpawns[mId] || 0) + count;
  
  if (!mobZones[mId]) mobZones[mId] = new Set();
  if (spot.zone) {
    const cleanZ = ZONE_NAMES[spot.zone] || spot.zone;
    mobZones[mId].add(cleanZ);
  }
  if (spot.region && ZONE_NAMES[spot.region]) {
    mobZones[mId].add(ZONE_NAMES[spot.region]);
  }
});

const activeMobIds = Object.keys(mobSpawns);
console.log(`Found ${activeMobIds.length} active live mobs in editor-overrides.`);

const mobsDatabase = [];

activeMobIds.forEach(id => {
  const m = MOBS[id];
  if (!m) {
    console.warn(`Mob ${id} not found in MOBS dictionary!`);
    return;
  }
  
  const minLvl = Array.isArray(m.level) ? m.level[0] : (m.level || 1);
  const maxLvl = Array.isArray(m.level) ? m.level[1] : (m.level || 1);
  const levelStr = minLvl === maxLvl ? `${minLvl} ур.` : `${minLvl}–${maxLvl} ур.`;
  
  const isRaid = m.role === 'raid' || id === 'scrap_tyrant' || id === 'drill_worm' || id === 'press_hammer' || id === 'boiler_sovereign';
  const isBoss = isRaid || m.boss || m.role === 'field_rb' || false;
  const isSecret = Boolean(m.secret || id.startsWith('tralalero_') || id.startsWith('skibidi_') || id.startsWith('bombardiro_') || id.startsWith('tung_tung_') || id.startsWith('ballerina_'));
  const isAggressive = m.behavior === 'aggressive' || m.type === 'aggressive' || (m.aggroRange && m.aggroRange > 0);

  let levelTier = 'starter';
  if (isRaid) {
    levelTier = 'boss';
  } else if (maxLvl <= 10) {
    levelTier = 'starter';
  } else if (maxLvl <= 16) {
    levelTier = 'mid';
  } else {
    levelTier = 'high';
  }

  let roleLabel = 'Обычный (Пассивный)';
  let roleClass = 'passive';
  if (isRaid) {
    roleLabel = 'Рейд-Босс';
    roleClass = 'raid';
  } else if (isSecret) {
    roleLabel = 'Секретный Босс';
    roleClass = 'secret';
  } else if (isBoss) {
    roleLabel = 'Элитный Босс';
    roleClass = 'boss';
  } else if (isAggressive) {
    roleLabel = 'Агрессивный';
    roleClass = 'aggressive';
  }

  // Collect zones
  const zoneSet = mobZones[id] || new Set();
  (m.zones || [m.zone]).filter(Boolean).forEach(z => {
    zoneSet.add(ZONE_NAMES[z] || z);
  });
  const zonesList = Array.from(zoneSet).filter(Boolean);
  if (zonesList.length === 0) {
    zonesList.push('Неизведанные земли');
  }

  // Stats
  const st = m.statsMid || {};
  const stats = {
    hp: st.hp || (Array.isArray(m.hp) ? Math.round((m.hp[0] + m.hp[1]) / 2) : 100),
    pAtk: st.pAtk || (Array.isArray(m.damage) ? Math.round((m.damage[0] + m.damage[1]) / 2) : 10),
    pDef: st.pDef || (m.defense ? m.defense * 10 : 50),
    cAtk: st.cAtk || st.mAtk || 5,
    cDef: st.cDef || st.mDef || 50,
    exp: st.exp || (Array.isArray(m.exp) ? Math.round((m.exp[0] + m.exp[1]) / 2) : 50),
    sp: st.sp || Math.round((st.exp || 50) * 0.1),
    speed: st.speed || m.moveSpeed || 3.5,
    aggroRange: m.aggroRange || 0,
    respawnSec: m.respawnSec || st.respawn || 40
  };

  // Skills
  const skills = (m.skills || []).map(sk => ({
    id: sk.id,
    name: sk.name || sk.id,
    type: sk.type === 'physical' ? 'Физический' : (sk.type === 'circuit' ? 'Контурный' : (sk.type === 'control' ? 'Контроль' : 'Усиление')),
    desc: sk.desc || 'Атакующее умение боевого механизма.'
  }));

  // Loot table
  const lt = MOB_LOOT_TABLES[id];
  const loot = {
    adena: null,
    materials: [],
    equipment: [],
    recipes: [],
    rare: [],
    spoil: []
  };

  if (lt) {
    if (lt.adena && lt.adena.groups && lt.adena.groups[0]) {
      const g = lt.adena.groups[0];
      loot.adena = {
        min: g.min,
        max: g.max,
        chance: g.chance,
        chanceStr: formatChance(g.chance)
      };
    }

    // Common (materials & consumables)
    (lt.common?.groups || []).forEach(g => {
      g.items.forEach(it => {
        const itemInfo = resolveItem(it.id);
        loot.materials.push({
          ...itemInfo,
          min: it.min || 1,
          max: it.max || 1,
          chance: g.chance,
          chanceStr: formatChance(g.chance)
        });
      });
    });

    // Equipment
    (lt.equipment?.groups || []).forEach(g => {
      g.items.forEach(it => {
        const itemInfo = resolveItem(it.id);
        loot.equipment.push({
          ...itemInfo,
          min: 1,
          max: 1,
          chance: g.chance,
          chanceStr: formatChance(g.chance)
        });
      });
    });

    // Recipes / Blueprints
    (lt.recipes?.groups || []).forEach(g => {
      g.items.forEach(it => {
        const itemInfo = resolveItem(it.id);
        loot.recipes.push({
          ...itemInfo,
          min: 1,
          max: 1,
          chance: g.chance,
          chanceStr: formatChance(g.chance)
        });
      });
    });

    // Rare drops (cores, unique items)
    (lt.rare?.groups || []).forEach(g => {
      g.items.forEach(it => {
        const itemInfo = resolveItem(it.id);
        loot.rare.push({
          ...itemInfo,
          min: it.min || 1,
          max: it.max || 1,
          chance: g.chance,
          chanceStr: formatChance(g.chance)
        });
      });
    });

    // Spoil
    const spoilBaseChance = lt.spoil?.chance || 0.70;
    const spoilPool = [];
    (lt.spoil?.groups || []).forEach(g => {
      (g.items || []).forEach(it => spoilPool.push(it));
    });
    const totalSpoilWeight = spoilPool.reduce((sum, it) => sum + (it.weight || 1), 0) || 1;

    spoilPool.forEach(it => {
      const itemInfo = resolveItem(it.id);
      const itemWeight = it.weight || 1;
      const effectiveChance = spoilBaseChance * (itemWeight / totalSpoilWeight);
      loot.spoil.push({
        ...itemInfo,
        min: it.min || 1,
        max: it.max || 1,
        chance: effectiveChance,
        chanceStr: formatChance(effectiveChance)
      });
    });
  }

  // Count total loot items
  const totalDropItems = (loot.materials.length + loot.equipment.length + loot.recipes.length + loot.rare.length + loot.spoil.length) + (loot.adena ? 1 : 0);

  mobsDatabase.push({
    id,
    name: m.name,
    title: m.title || null,
    flavor: m.flavor || 'Автономный боевой механизм с поврежденным контуром управления.',
    minLvl,
    maxLvl,
    levelStr,
    levelTier,
    roleLabel,
    roleClass,
    isRaid,
    isBoss,
    isSecret,
    isAggressive,
    spawns: mobSpawns[id] || 0,
    zones: zonesList,
    stats,
    skills,
    loot,
    totalDropItems
  });
});

// Sort mobs: raids first, then by minLvl ascending, then name
mobsDatabase.sort((a, b) => {
  if (a.isRaid && !b.isRaid) return -1;
  if (!a.isRaid && b.isRaid) return 1;
  if (a.minLvl !== b.minLvl) return a.minLvl - b.minLvl;
  return a.name.localeCompare(b.name, 'ru');
});

const outputPath = path.join(__dirname, '../data/mobs_database_db.json');
fs.writeFileSync(outputPath, JSON.stringify(mobsDatabase, null, 2), 'utf8');
console.log(`Successfully built data/mobs_database_db.json with ${mobsDatabase.length} active live mobs.`);
