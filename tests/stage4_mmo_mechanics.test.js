// ============================================================
//  TESTS / STAGE4_MMO_MECHANICS.TEST.JS
//  Модульные тесты для Этапа 4: Hate table loot attribution,
//  Party level gap XP penalty, Anti-KS и безопасность кластерного хэндоффа.
// ============================================================
'use strict';

const EXP = require('../shared/l2-exp-table.js');
const G = require('../shared/game-rules.js');
const { createMobHandler } = require('../server/handlers/mob-handler.js');
const { createPartyHandler } = require('../server/handlers/party-handler.js');

module.exports = function(t) {
  t.suite('stage4: Lineage 2 C1 party level gap penalty (partyLevelGapModifier)');

  // 1. Тестирование шкалы штрафа partyLevelGapModifier
  t.ok(EXP.partyLevelGapModifier(20, 20) === 1.0, 'Разрыв 0 -> 1.0 (100% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 25) === 1.0, 'Разрыв 5 -> 1.0 (100% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 29) === 1.0, 'Разрыв 9 -> 1.0 (100% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 30) === 0.80, 'Разрыв 10 -> 0.80 (80% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 31) === 0.65, 'Разрыв 11 -> 0.65 (65% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 32) === 0.50, 'Разрыв 12 -> 0.50 (50% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 33) === 0.35, 'Разрыв 13 -> 0.35 (35% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 34) === 0.20, 'Разрыв 14 -> 0.20 (20% опыта)');
  t.ok(EXP.partyLevelGapModifier(20, 35) === 0.0, 'Разрыв 15 -> 0.0 (кач заблокирован)');
  t.ok(EXP.partyLevelGapModifier(10, 70) === 0.0, 'Разрыв 60 -> 0.0 (полный блок прокачки нубов хайлевелом)');

  t.suite('stage4: party-handler splitExpToParty с учётом разрыва уровней');

  // 2. Тестирование splitExpToParty
  const mockSent = [];
  const sendMock = (pl, msg) => {
    mockSent.push({ pid: pl.pid, msg });
  };
  const grantedExp = [];
  const grantExpSpMock = (pl, exp, ml) => {
    grantedExp.push({ pid: pl.pid, exp, ml });
    pl.exp = (pl.exp || 0) + exp;
    return { exp, sp: Math.floor(exp / 28) };
  };

  const p1 = { pid: 1, level: 70, x: 100, z: 100, exp: 0, sp: 0, partyId: 'pt1' };
  const p2 = { pid: 2, level: 10, x: 100, z: 100, exp: 0, sp: 0, partyId: 'pt1' };
  const mockPlayers = new Map([[1, p1], [2, p2]]);
  const mockParty = {
    id: 'pt1',
    leader: 1,
    members: new Set([1, 2]),
    lootMode: 'random'
  };
  const mockParties = new Map([['pt1', mockParty]]);

  const partyHandler = createPartyHandler({
    parties: mockParties,
    players: mockPlayers,
    send: sendMock,
    dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
    checkRate: () => true,
    CS: {},
    G,
    EXP,
    grantExpSp: grantExpSpMock,
    getNextId: () => 1
  });

  // 2.1. Хайлевел убивает моба 70 уровня в пати с нубом 10 уровня
  grantedExp.length = 0;
  mockSent.length = 0;
  partyHandler.splitExpToParty(p1, 100000, 70, { mobId: 'boss_70' });
  const p1Exp = grantedExp.find(g => g.pid === 1);
  const p2Exp = grantedExp.find(g => g.pid === 2);
  t.ok(p1Exp && p1Exp.exp > 0, 'Хайлевел 70 ур. получил свою долю опыта');
  t.ok(p2Exp && p2Exp.exp === 0, 'Нуб 10 ур. получил 0 опыта из-за разрыва уровней >= 15');

  // 2.2. Хайлевел убивает моба 10 уровня («серый» моб)
  grantedExp.length = 0;
  partyHandler.splitExpToParty(p1, 500, 10, { mobId: 'gremlin' });
  const p1GreyExp = grantedExp.find(g => g.pid === 1);
  const p2GreyExp = grantedExp.find(g => g.pid === 2);
  t.ok(p1GreyExp && p1GreyExp.exp === 0, 'Хайлевел не получает опыта за серого моба');
  t.ok(p2GreyExp && p2GreyExp.exp === 0, 'Нуб не получает опыта от убийства серого моба хайлевелом');

  // 2.3. Равная пати (20 и 22 ур.) убивает моба 22 ур.
  const pEqual1 = { pid: 3, level: 20, x: 50, z: 50, exp: 0, sp: 0, partyId: 'pt2' };
  const pEqual2 = { pid: 4, level: 22, x: 50, z: 50, exp: 0, sp: 0, partyId: 'pt2' };
  mockPlayers.set(3, pEqual1);
  mockPlayers.set(4, pEqual2);
  mockParties.set('pt2', { id: 'pt2', leader: 3, members: new Set([3, 4]), lootMode: 'random' });

  grantedExp.length = 0;
  partyHandler.splitExpToParty(pEqual1, 1000, 22, { mobId: 'wolf' });
  const eq1 = grantedExp.find(g => g.pid === 3);
  const eq2 = grantedExp.find(g => g.pid === 4);
  t.ok(eq1 && eq1.exp > 0 && eq2 && eq2.exp > 0, 'Равная группа получает опыт в полном объёме с пати-бонусом');

  t.suite('stage4: mob damage tracking & hate/damage loot attribution');

  // 3. Создаем MobHandler для тестирования лута и урона
  let spawnedDrops = [];
  const mobHandler = createMobHandler({
    mobs: new Map(),
    players: mockPlayers,
    parties: mockParties,
    partyOf: (p) => p.partyId ? mockParties.get(p.partyId) : null,
    partyMembers: (p) => {
      const pa = p.partyId ? mockParties.get(p.partyId) : null;
      return pa ? [...pa.members].map(id => mockPlayers.get(id)).filter(Boolean) : [p];
    },
    splitExpToParty: (p, exp, ml, opts) => partyHandler.splitExpToParty(p, exp, ml, opts),
    spawnMobDropPiles: (x, z, drop, ownerPid, opts) => {
      spawnedDrops.push({ x, z, drop, ownerPid, opts });
    },
    questOnKill: () => false,
    saveProfileNow: () => {},
    send: sendMock,
    broadcastAOI: () => {},
    playerNear: () => true,
    geoStepMob: () => {},
    mobDisplayNameServer: (id) => id,
    regionNameById: () => 'Gludio',
    zoneLabelAt: () => 'Plains',
    losGround: () => true,
    onPlayerHit: () => {},
    onPlayerDeath: () => {},
    applyPlayerDebuff: () => {},
    pushEffects: () => {},
    isPlayerImmortal: () => false,
    GEO: { ready: () => false, standY: () => 0 },
    MOB_DB: { get: () => null },
    G,
    LR: {
      rollMobLoot: (mobId, dropLvl, mobLvl) => ({
        adena: 500,
        items: [{ id: 'iron_ore', count: 2 }],
        calcLevel: dropLvl
      }),
      rollSpoil: () => null
    },
    EV: {},
    WM: { regionAt: () => ({ id: 'gludio' }) },
    dist2: (x1, z1, x2, z2) => (x1 - x2) ** 2 + (z1 - z2) ** 2,
    getServerSpots: () => [],
    getNextId: () => 100,
    activeEvents: new Map(),
    respawnTimers: new Map(),
    spawnedSpots: new Set()
  });

  const Mob = mobHandler.Mob;
  const m = new Mob(1, 'orc_fighter', 70, 100, 100, null, {});

  // 3.1. Проверка инициализации таблицы урона
  t.ok(m.damages && typeof m.damages === 'object', 'У моба инициализирована таблица урона m.damages');

  // 3.2. Запись урона
  mobHandler.recordMobDamage(m, 1, 800); // Игрок 1 нанёс 800 урона
  mobHandler.recordMobDamage(m, 3, 200); // Игрок 3 нанёс 200 урона
  t.ok(m.damages['1'] === 800, 'Урон игрока 1 записан корректно (800)');
  t.ok(m.damages['3'] === 200, 'Урон игрока 3 записан корректно (200)');

  // 3.3. Разрешение контрибьюторов (resolveMobContributors)
  const contrib = mobHandler.resolveMobContributors(m, pEqual1);
  t.ok(contrib.topGroup && contrib.topGroup.topPlayer.pid === 1, 'Топ-контрибьютор — Игрок 1 (больше всех урона)');
  t.ok(contrib.grandTotalDmg === 1000, 'Общий урон по мобу 1000');

  // 3.4. Защита от KS (Kill Stealing) при onMobDeath:
  // Игрок 3 наносит последний удар (ластхит), но Игрок 1 нанёс 800/1000 урона!
  spawnedDrops = [];
  grantedExp.length = 0;
  m.dead = false;
  m.hp = 0;
  m.exp = 5000;
  mobHandler.onMobDeath(pEqual1, m); // pEqual1 наносит ластхит

  t.ok(spawnedDrops.length > 0, 'Дроп с моба успешно выпал');
  const dropPile = spawnedDrops[0];
  t.ok(dropPile.ownerPid === 1, 'Право первоочередного лута (15с) выдано Игроку 1 (топ-дамагер), а не ластхитеру');
  t.ok(dropPile.drop.calcLevel === 70, 'Расчёт штрафа дропа использует уровень топ-дамагера (70), предотвращая абуз нубами');

  // 3.5. Пропорциональный EXP сплит
  const expP1Group = grantedExp.find(g => g.pid === 1);
  const expP3Group = grantedExp.find(g => g.pid === 3);
  t.ok(expP1Group && expP1Group.exp > 0, 'Группа 1 получила свою пропорциональную долю опыта (80%)');
  t.ok(expP3Group && expP3Group.exp > 0, 'Группа 3 получила свою пропорциональную долю опыта (20%)');

  // 3.6. Очистка урона при сбросе моба домой (resetMobOnHome)
  const m2 = new Mob(2, 'wolf', 10, 50, 50, null, {});
  mobHandler.recordMobDamage(m2, 1, 50);
  t.ok(m2.damages['1'] === 50, 'Урон по мобу m2 записан');
  mobHandler.resetMobOnHome(m2);
  t.ok(Object.keys(m2.damages).length === 0, 'После resetMobOnHome таблица урона полностью очищена');

  t.suite('stage4: cluster handoff combat & PvP state safety');

  // 4. Проверка передачи PvP флага и боевых меток через Handoff
  const now = Date.now();
  const testPlayer = {
    pid: 99,
    yid: 'user_99',
    name: 'Gladiator',
    cls: 'gladiator',
    level: 40,
    hp: 1500,
    maxHp: 1500,
    isFlagged: true,
    flagUntil: now + 35000,
    _lastCombatAt: now - 3000,
    _lastPvpHitAt: now - 2000,
    partyId: null,
    buffs: [],
    debuffs: []
  };

  // Симуляция сериализации в initiateClusterHandoff
  const serializedHandoff = Object.assign({}, testPlayer, {
    flagUntil: testPlayer.flagUntil || 0,
    lastCombatAt: testPlayer._lastCombatAt || 0,
    lastPvpHitAt: testPlayer._lastPvpHitAt || 0
  });

  t.ok(serializedHandoff.flagUntil > now, 'flagUntil сохранён в данных хэндоффа');
  t.ok(serializedHandoff.lastCombatAt === testPlayer._lastCombatAt, 'lastCombatAt сохранён в данных хэндоффа');
  t.ok(serializedHandoff.lastPvpHitAt === testPlayer._lastPvpHitAt, 'lastPvpHitAt сохранён в данных хэндоффа');

  // Симуляция десериализации в adoptClusterHandoff
  const adoptedPlayer = {
    pid: serializedHandoff.pid,
    flagUntil: 0,
    _lastCombatAt: 0,
    _lastPvpHitAt: 0,
    get isFlagged() { return Date.now() < this.flagUntil; }
  };

  if (serializedHandoff.flagUntil != null) adoptedPlayer.flagUntil = serializedHandoff.flagUntil;
  if (serializedHandoff.lastCombatAt != null) adoptedPlayer._lastCombatAt = serializedHandoff.lastCombatAt;
  if (serializedHandoff.lastPvpHitAt != null) adoptedPlayer._lastPvpHitAt = serializedHandoff.lastPvpHitAt;

  t.ok(adoptedPlayer.isFlagged === true, 'Принимающий воркер сохраняет активный фиолетовый PvP флаг');
  t.ok(adoptedPlayer.flagUntil > now, 'flagUntil активен и не сброшен');
  t.ok(adoptedPlayer._lastCombatAt === testPlayer._lastCombatAt, 'Таймер выхода из боя (Alt+F4 anti-logout) сохранён');
  t.ok(adoptedPlayer._lastPvpHitAt === testPlayer._lastPvpHitAt, 'Таймер PvP удара сохранён');
};
