// ============================================================
//  TESTS / PHASE1_EPIC_ENDGAME.TEST.JS
//  Полная верификация реализации финального аудита Фазы 1 (1–20 ур.):
//   1. Смертельное Отражение (Lethal Feedback) в l2-combat и server.
//   2. Бестиарий и дроп: 6 полевых РБ, 7 элитных хранителей, Стальной Колосс.
//   3. 8 квестов-мостиков (Bridge Quests) для сглаживания прогрессии.
//   4. Эпическая цепочка (7 ядер -> Ключ Цитадели -> Колосс -> Королевская награда).
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const IDB = require(path.join(ROOT, 'shared', 'item-db.js'));
const MOB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const LR = require(path.join(ROOT, 'shared', 'loot-rules.js'));
const L2Combat = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const EVENT_RULES = require(path.join(ROOT, 'shared', 'event-rules.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const { createQuestHandler } = require(path.join(ROOT, 'server', 'handlers', 'quest-handler.js'));

module.exports = function (t) {
  t.suite('phase1-endgame: Смертельное Отражение (Lethal Feedback)');

  // 1. Игрок БЕЗ 1-й профы (tier 0) атакует элитного босса -> мгновенная смерть (99999 урона)
  const eliteBossTpl = MOB.get('scrap_tyrant');
  t.ok(eliteBossTpl && eliteBossTpl.eliteRaid, 'scrap_tyrant отмечен как eliteRaid');

  const tier0Attacker = {
    pAtk: 100, level: 20, classTier: 0,
    acc: 50, critRate: 40, critDmgMult: 2.0, soulshotActive: false
  };
  const eliteDefender = {
    pDef: 300, level: 20, eva: 30, eliteRaid: true, epicRaid: false, hasShield: false
  };

  const hitTier0Elite = L2Combat.resolveHit(tier0Attacker, eliteDefender);
  t.eq(hitTier0Elite.lethalFeedback, true, 'tier 0 получает lethalFeedback от элитного босса');
  t.eq(hitTier0Elite.feedbackDamage, 99999, 'урон отражения равен 99 999');
  t.eq(hitTier0Elite.damage, 0, 'урон по боссу равен 0');

  // 2. Игрок tier 0 атакует эпического босса -> смертельное отражение
  const epicDefender = {
    pDef: 500, level: 22, eva: 30, eliteRaid: false, epicRaid: true, hasShield: false
  };
  const hitTier0Epic = L2Combat.resolveHit(tier0Attacker, epicDefender);
  t.eq(hitTier0Epic.lethalFeedback, true, 'tier 0 получает lethalFeedback от эпического босса');
  t.eq(hitTier0Epic.feedbackDamage, 99999, 'урон отражения от эпика равен 99 999');

  // 3. Игрок С 1-й профой (tier 1) атакует элитного/эпического босса -> обычный бой без отражения
  const tier1Attacker = Object.assign({}, tier0Attacker, { classTier: 1 });
  const hitTier1Elite = L2Combat.resolveHit(tier1Attacker, eliteDefender);
  t.eq(hitTier1Elite.lethalFeedback, false, 'tier 1 НЕ получает lethalFeedback');
  t.ok(hitTier1Elite.damage > 0 || hitTier1Elite.missed || hitTier1Elite.miss, 'tier 1 наносит нормальный урон или промахивается');

  const hitTier1Epic = L2Combat.resolveHit(tier1Attacker, epicDefender);
  t.eq(hitTier1Epic.lethalFeedback, false, 'tier 1 НЕ получает lethalFeedback от эпика');

  // 4. Игрок tier 0 атакует обычного полевого босса -> обычный бой
  const fieldBossDefender = {
    pDef: 150, level: 6, eva: 20, eliteRaid: false, epicRaid: false, hasShield: false
  };
  const hitTier0Field = L2Combat.resolveHit(tier0Attacker, fieldBossDefender);
  t.eq(hitTier0Field.lethalFeedback, false, 'tier 0 НЕ получает lethalFeedback от полевого РБ');
  t.ok(hitTier0Field.damage > 0, 'tier 0 наносит нормальный урон полевому РБ');


  t.suite('phase1-endgame: Бестиарий 6 полевых РБ (1–19 ур.)');

  const fieldBossIds = [
    'boiler_exploder_b1',
    'grinder_ripper_m9',
    'vacuum_cyclone_3000',
    'chainsaw_lumberjack_x14',
    'fridge_frost_sever',
    'steam_roller_bogatyr'
  ];

  fieldBossIds.forEach((bossId) => {
    const m = MOB.get(bossId);
    t.ok(m, 'полевой босс существует: ' + bossId);
    t.ok(m.level[0] >= 1 && m.level[1] <= 19, bossId + ' имеет уровень в рамках 1–19');
    t.eq(m.boss, true, bossId + ' помечен как босс');
    t.eq(m.eliteRaid, false, bossId + ' не является элитным');
    t.eq(m.epicRaid, false, bossId + ' не является эпическим');

    // Проверяем наличие лута в loot-rules
    const loot = LR.MOB_LOOT_TABLES[bossId];
    t.ok(loot, 'таблица лута существует для ' + bossId);
    t.ok(loot.adena && loot.adena.groups.length > 0, bossId + ' имеет дроп монет');

    // Проверяем наличие в фазе 1 рейдов
    t.ok(EVENT_RULES.PHASE1_RAIDS[bossId], bossId + ' включен в PHASE1_RAIDS');
  });


  t.suite('phase1-endgame: 7 Элитных Хранителей и Стальной Колосс');

  const eliteGuards = [
    { id: 'scrap_tyrant', core: 'scrap_tyrant_core', name: 'Тиран Свалки' },
    { id: 'drill_worm', core: 'drill_worm_core', name: 'Босс-Бур' },
    { id: 'cruna_overseer', core: 'cruna_overseer_core', name: 'Надзиратель Круны' },
    { id: 'press_hammer', core: 'press_hammer_core', name: 'Автономный Пресс-Молот' },
    { id: 'boiler_sovereign', core: 'boiler_sovereign_core', name: 'Суверен Котла' },
    { id: 'rezdiq_colonel', core: 'rezdiq_seal', name: 'Полковник Рездик-VII' },
    { id: 'green_protocol', core: 'green_protocol_core', name: 'Протокол «Зелёный»' }
  ];

  eliteGuards.forEach((g) => {
    const m = MOB.get(g.id);
    t.ok(m, 'элитный хранитель существует: ' + g.id);
    t.eq(m.eliteRaid, true, g.id + ' имеет eliteRaid: true');
    t.ok(m.level[0] >= 20 && m.level[1] <= 22, g.id + ' уровень в диапазоне 20–22');

    // Проверяем 100% дроп ядра
    const loot = LR.MOB_LOOT_TABLES[g.id];
    t.ok(loot && loot.rare && Array.isArray(loot.rare.groups), g.id + ' имеет rare-дроп');
    let coreDrop = null;
    loot.rare.groups.forEach(grp => {
      const it = grp.items.find(i => i.id === g.core);
      if (it) coreDrop = { chance: grp.chance, it };
    });
    t.ok(coreDrop, g.id + ' дропает ядро ' + g.core);
    t.eq(coreDrop ? coreDrop.chance : 0, 1.0, g.id + ' гарантированный шанс дропа ядра (1.0)');

    // Проверяем, что ядро существует в item-db
    const item = IDB.get(g.core);
    t.ok(item, 'ядро существует в item-db: ' + g.core);
  });

  // Эпический босс: Стальной Колосс Предела
  const colossus = MOB.get('steel_colossus');
  t.ok(colossus, 'Стальной Колосс существует в mob-db');
  t.eq(colossus.epicRaid, true, 'Колосс имеет epicRaid: true');
  t.eq(colossus.partySize, 24, 'Колосс рассчитан на рейд из 24 игроков');
  t.ok(colossus.level[0] >= 22, 'Уровень Колосса 22+');

  const colossusLoot = LR.MOB_LOOT_TABLES['steel_colossus'];
  t.ok(colossusLoot, 'таблица лута Колосса существует');
  let colossusCoreDrop = null;
  colossusLoot.rare.groups.forEach(grp => {
    const it = grp.items.find(i => i.id === 'steel_colossus_core');
    if (it) colossusCoreDrop = { chance: grp.chance, it };
  });
  t.ok(colossusCoreDrop, 'Колосс гарантированно дропает steel_colossus_core');
  t.eq(colossusCoreDrop ? colossusCoreDrop.chance : 0, 1.0, 'шанс дропа сверхъядра = 1.0');

  let crystalDrop = null;
  colossusLoot.crystals.groups.forEach(grp => {
    const it = grp.items.find(i => i.id === 'crystal_d');
    if (it) crystalDrop = it;
  });
  t.ok(crystalDrop, 'Колосс дропает D-кристаллы');
  t.ok(crystalDrop.min >= 150 && crystalDrop.max >= 300, 'Дроп кристаллов Колосса 150–300 шт.');


  t.suite('phase1-endgame: 8 Квестов-Мостиков (Bridge Quests)');

  const bridgeQuests = [
    { id: 'side_harbor_courier', lvl: 2, npc: 'milly' },
    { id: 'side_astard_survey', lvl: 4, npc: 'bot_01' },
    { id: 'side_western_patrol', lvl: 6, npc: 'guard_w' },
    { id: 'side_cruna_forges', lvl: 10, npc: 'smith_kran' },
    { id: 'side_fallen_memory', lvl: 13, npc: 'elias' },
    { id: 'side_chem_leak', lvl: 14, npc: 'grocer_spark' },
    { id: 'side_rezdiq_orders', lvl: 17, npc: 'gilbert' },
    { id: 'side_steel_limit', lvl: 17, npc: 'guard_n' }
  ];

  bridgeQuests.forEach((bq) => {
    const q = QD.get(bq.id);
    t.ok(q, 'квест-мостик существует: ' + bq.id);
    t.eq(q.levelReq, bq.lvl, bq.id + ' levelReq = ' + bq.lvl);
    t.eq(q.npc, bq.npc, bq.id + ' выдается NPC ' + bq.npc);
    t.ok(q.rewards.exp > 0, bq.id + ' дает EXP');
    t.ok(q.rewards.currency > 0, bq.id + ' дает currency');

    // Проверяем выдающего NPC
    const allNpcs = WM.CITY_NPCS.concat(WM.REGION_NPCS);
    const npcObj = allNpcs.find(n => n.id === bq.npc);
    t.ok(npcObj, 'NPC ' + bq.npc + ' найден в world-metrics');
    t.ok(Array.isArray(npcObj.quests) && npcObj.quests.indexOf(bq.id) >= 0, 'NPC ' + bq.npc + ' содержит квест ' + bq.id);
  });


  t.suite('phase1-endgame: Эпическая цепочка и Королевская Награда');

  // Капитан Морского Дозора
  const captainNpc = WM.REGION_NPCS.find(n => n.id === 'captain_sea_watch');
  t.ok(captainNpc, 'Капитан Морского Дозора найден в REGION_NPCS');
  t.ok(captainNpc.quests.indexOf('epic_seven_cores') >= 0, 'Капитан выдает epic_seven_cores');
  t.ok(captainNpc.quests.indexOf('epic_colossus_slayer') >= 0, 'Капитан выдает epic_colossus_slayer');

  // epic_seven_cores
  const epic1 = QD.get('epic_seven_cores');
  t.ok(epic1, 'epic_seven_cores существует в quest-db');
  t.eq(epic1.levelReq, 20, 'epic_seven_cores требует 20 уровень');
  t.eq(epic1.objectives.length, 7, 'epic_seven_cores имеет ровно 7 целей (7 ядер)');
  t.eq(epic1.nextQuest, 'epic_colossus_slayer', 'epic_seven_cores ведет к epic_colossus_slayer');
  t.ok(epic1.rewards.items.some(it => it.id === 'citadel_resonance_key'), 'награда содержит citadel_resonance_key');

  // epic_colossus_slayer
  const epic2 = QD.get('epic_colossus_slayer');
  t.ok(epic2, 'epic_colossus_slayer существует в quest-db');
  t.eq(epic2.requires, 'epic_seven_cores', 'epic_colossus_slayer требует завершения epic_seven_cores');
  // epic_colossus_slayer: награда пересмотрена (без шмота, чтобы не ломать прогрессию)
  t.eq(epic2.rewards.choices, undefined, 'epic_colossus_slayer больше НЕ имеет choices (шмот убран в дроп босса)');
  t.eq(epic2.rewards.exp, 100000, 'награда EXP = 100 000');
  t.eq(epic2.rewards.sp, 40000, 'награда SP = 40 000');
  t.eq(epic2.rewards.currency, 200000, 'награда валюты = 200 000');

  // Проверка дропа шмота с Колосса: группы "или или" без спама
  const colossusLootTables = LR.MOB_LOOT_TABLES['steel_colossus'];
  const weaponGroup = colossusLootTables.rare.groups.find(g => g.id === 'colossus_weapon_group');
  t.ok(weaponGroup, 'Колосс имеет группу оружия colossus_weapon_group');
  t.eq(weaponGroup ? weaponGroup.chance : 0, 0.50, 'шанс выпадения оружия = 50%');
  const weaponIds = weaponGroup ? weaponGroup.items.map(i => i.id) : [];
  t.ok(weaponIds.includes('revolution_sword'), 'в пуле оружия есть revolution_sword');
  t.ok(weaponIds.includes('heavy_doom_hammer'), 'в пуле оружия есть heavy_doom_hammer');
  t.ok(weaponIds.includes('reinforced_bow'), 'в пуле оружия есть reinforced_bow');
  t.ok(weaponIds.includes('prowler_dagger'), 'в пуле оружия есть prowler_dagger');
  t.ok(weaponIds.includes('magic_mace'), 'в пуле оружия есть magic_mace');

  const armorGroup = colossusLootTables.rare.groups.find(g => g.id === 'colossus_armor_group');
  t.ok(armorGroup, 'Колосс имеет группу брони colossus_armor_group');
  t.eq(armorGroup ? armorGroup.chance : 0, 0.60, 'шанс выпадения брони = 60%');
  const armorIds = armorGroup ? armorGroup.items.map(i => i.id) : [];
  t.ok(armorIds.includes('scale_mail_breastplate'), 'в пуле брони есть scale_mail_breastplate');
  t.ok(armorIds.includes('scale_mail_gaiters'), 'в пуле брони есть scale_mail_gaiters');
  t.ok(armorIds.includes('scale_mail_shield'), 'в пуле брони есть scale_mail_shield');
  t.ok(armorIds.includes('mithril_jacket'), 'в пуле брони есть mithril_jacket');
  t.ok(armorIds.includes('mithril_pants'), 'в пуле брони есть mithril_pants');
  t.ok(armorIds.includes('knowledge_jacket'), 'в пуле брони есть knowledge_jacket');
  t.ok(armorIds.includes('knowledge_pants'), 'в пуле брони есть knowledge_pants');
  t.ok(armorIds.includes('operator_gauntlets_low'), 'в пуле брони есть operator_gauntlets_low');

  // Симуляция сдачи epic_colossus_slayer через quest-handler (без передачи rewardChoice)
  let sentMessages = [];
  const fakeDeps = {
    QD,
    NPCS: {
      getNpc: (id) => ({ id, position: { x: 0, z: 0 } }),
      inRange: () => true,
      canFit: () => ({ ok: true })
    },
    EXP: { expToNext: () => 0 },
    send: (p, msg) => sentMessages.push(msg),
    invCount: (p, id) => (p.inv[id] || 0),
    giveCurrency: (p, amt) => { p.currency = (p.currency || 0) + amt; },
    grantExpSp: (p, exp, sp) => { p.exp = (p.exp || 0) + exp; p.sp = (p.sp || 0) + (sp || 0); return { exp, sp }; },
    applyPlayerBuff: () => {},
    pushEffects: () => {},
    pushCombatStats: () => {},
    saveProfileNow: () => {},
    pruneInv: () => {}
  };

  const handler = createQuestHandler(fakeDeps);

  // Тест сдачи квеста
  const mockPlayer = {
    level: 20,
    cls: 'operator',
    x: 0, z: 0,
    inv: { steel_colossus_core: 1 },
    quests: {
      active: {
        epic_colossus_slayer: { p: [1, 1], at: Date.now() }
      },
      done: {}
    }
  };

  sentMessages = [];
  handler.doQuestComplete(mockPlayer, { questId: 'epic_colossus_slayer' });

  const okMsg = sentMessages.find(m => m.t === 'quest_complete_ok');
  t.ok(okMsg, 'doQuestComplete вернул quest_complete_ok');
  t.eq(mockPlayer.inv.steel_colossus_core, undefined, 'steel_colossus_core списан из инвентаря');
  t.eq(mockPlayer.currency, 200000, 'получено 200 000 монет');
  t.eq(mockPlayer.exp, 100000, 'получено 100 000 EXP');
  t.eq(mockPlayer.inv.revolution_sword, undefined, 'шмот НЕ выдается из квеста (только дроп босса)');
  t.eq(mockPlayer.inv.scale_mail_breastplate, undefined, 'броня НЕ выдается из квеста');
};
