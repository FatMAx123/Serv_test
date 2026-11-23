// ============================================================
//  TESTS / CRAFTSMAN-CLASS.TEST.JS — третий базовый класс «Мастеровой».
//  Только ремесленная линия (Мастеровой → Утилизатор / Котловой Кузнец)
//  вскрывает корпуса (спойл + «Демонтаж») и собирает предметы по чертежам.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const SK = require(path.join(ROOT, 'shared', 'skill-db.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const WR = require(path.join(ROOT, 'shared', 'weight-rules.js'));
const WM = require(path.join(ROOT, 'shared', 'world-metrics.js'));
const TR = require(path.join(ROOT, 'shared', 'trade-rules.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));
const playerCore = require(path.join(ROOT, 'server', 'core', 'player.js'));
const SpoilCorpses = require(path.join(ROOT, 'server', 'world', 'spoil-corpses.js'));
const { createSkillCaster } = require(path.join(ROOT, 'server', 'combat', 'skill-caster.js'));
const { createCraftHandler } = require(path.join(ROOT, 'server', 'handlers', 'craft-handler.js'));

function withRandom(fn, impl) {
  const orig = Math.random;
  Math.random = impl;
  try { return fn(); } finally { Math.random = orig; }
}

const LINE = ['craftsman', 'salvager', 'boiler_smith'];
const D_RECIPE = 'revolution_sword';

module.exports = function (t) {
  t.suite('Мастеровой: базовый класс и черты линии');
  t.ok(CS.isValidBaseClass('craftsman'), 'craftsman — допустимый базовый класс');
  t.ok(CS.RACES.human.baseClasses.indexOf('craftsman') !== -1, 'человек может стать Мастеровым');
  const v = CS.validateCreate({ name: 'Кузнец', race: 'human', gender: 'female', cls: 'craftsman' });
  t.ok(v.ok && v.cls === 'craftsman', 'создание Мастерового проходит валидацию', JSON.stringify(v.errors));
  t.eq(CS.primaryAtLevel('craftsman', 1), { STR: 39, DEX: 29, CON: 45, INT: 20, WIT: 10, MEN: 27 },
    'статы C1 Dwarven Fighter: CON 45 / STR 39 / DEX 29');
  t.eq(CS.primaryAtLevel('boiler_smith', 20).CON, 45, 'профессия не меняет базовые статы (C1)');
  t.eq(CS.getPathMeta('craft').name, 'Ремесленная линия', 'своя линия в UI');
  t.ok(CS.canTransfer('craftsman', 'salvager', 20) && CS.canTransfer('craftsman', 'boiler_smith', 20),
    'на 20 ур. — Утилизатор или Котловой Кузнец');
  t.ok(!CS.canTransfer('craftsman', 'salvager', 19), 'до 20 ур. профессию не сменить');
  t.ok(!CS.canTransfer('operator', 'salvager', 20), 'оператор не может стать Утилизатором');
  LINE.forEach((id) => {
    t.ok(CS.isCraftsman(id), id + ' — ремесленная линия');
    t.eq(CS.inventorySlots(id), 100, id + ': 100 ячеек сумки');
    t.near(CS.carryBonusPct(id), 0.8, 1e-9, id + ': +80% к весу');
    t.ok(CS.usesFighterDevices(id), id + ': приборы бойца (нагнетатель + наручи)');
  });
  ['operator', 'engineer', 'mechanic', 'technomancer'].forEach((id) => {
    t.ok(!CS.isCraftsman(id), id + ' не Мастеровой');
    t.eq(CS.inventorySlots(id), 80, id + ': 80 ячеек');
    t.eq(CS.carryBonusPct(id), 0, id + ': без бонуса веса');
  });
  t.ok(!CS.usesFighterDevices('engineer'), 'инженер — на резонаторе, не на нагнетателе');
  t.ok(WR.maxLoad(45, CS.carryBonusPct('craftsman')) > WR.maxLoad(43) * 1.8,
    'Мастеровой носит почти вдвое больше Оператора (CON 45 и +80%)');
  t.eq(TR.canSwap({}, {}, { synthetic_oil: 1 }, 100).cap, 100, 'обмен учитывает 100 ячеек получателя');

  t.suite('Мастеровой: стартовый набор и умения');
  const pr = G.newProfile('Кузнец', { cls: 'craftsman', race: 'human', gender: 'male' });
  t.eq(pr.cls, 'craftsman', 'профиль создан Мастеровым');
  t.eq(pr.equip.weapon.id, 'operator_hammer_low', 'стартовый молот');
  t.eq(pr.equip.necklace.id, 'operator_compressor_low', 'нагнетатель');
  t.eq(pr.equip.bracelet.id, 'operator_bracers_low', 'наручи');
  const fresh = { cls: 'craftsman', skills: {}, classTier: 0, level: 1 };
  playerCore.ensureStarterSkills(fresh);
  ['cr_hammer_strike', 'cr_weapon_mastery', 'cr_create_item'].forEach((id) => {
    t.eq(fresh.skills[id], 1, 'стартовое умение ' + id);
  });
  t.ok(!fresh.skills.op_power_strike, 'умений Оператора у Мастерового нет');
  const smith = { cls: 'boiler_smith', skills: {}, classTier: 1, level: 20 };
  playerCore.grantExpertiseSkills(smith);
  t.eq(smith.skills.cr_expertise_d, 1, 'Экспертиза D Мастерового выдаётся с профессией');
  t.eq(smith.skills.bs_guild_recipes, 1, 'Котловой Кузнец сразу получает книгу рецептов Гильдии');
  t.ok(!smith.skills.sv_keen_eye, 'чужое умение профессии не выдаётся');
  const salv = { cls: 'salvager', skills: {}, classTier: 1, level: 20 };
  playerCore.grantExpertiseSkills(salv);
  t.eq(salv.skills.sv_keen_eye, 1, 'Утилизатор сразу получает «Намётанный глаз»');
  t.ok(!salv.skills.bs_guild_recipes, 'Утилизатор не получает книгу рецептов');

  t.suite('Спойл и крафт — только у ремесленной линии');
  t.ok(!SK.get('op_scrap_collect'), 'спойл Оператора убран из базы умений');
  const offenders = SK.list().filter((s) =>
    (s.category === 'craft' || s.spoil || s.sweep || s.craftSkill) && LINE.indexOf(s.class) === -1
  ).map((s) => s.id);
  t.eq(offenders, [], 'умения спойла/крафта есть только у Мастерового и его профессий');
  t.ok(SK.get('cr_assess_nodes').spoil && SK.get('cr_dismantle').sweep, '«Оценка узлов» и «Демонтаж» на месте');
  t.eq(SK.craftLevel({}), 0, 'без «Ремесла» уровень ремесла 0');
  t.eq(SK.craftLevel({ cr_create_item: 1 }), 1, '«Ремесло» 1');
  t.eq(SK.craftLevel({ cr_create_item: 3 }), 3, '«Ремесло» 3');
  t.eq(SK.craftLevel({ cr_create_item: 3, bs_guild_recipes: 1 }), 4, 'книга Гильдии — уровень 4');
  t.near(SK.spoilChanceMult({ sv_keen_eye: 1 }), 1.3, 1e-9, '«Намётанный глаз» ×1.3');
  t.eq(SK.spoilChanceMult({}), 1, 'без пассивки ×1');
  t.eq(Object.keys(G.RECIPES).filter((id) => !(G.recipeLevel(id) >= 1 && G.recipeLevel(id) <= 4)), [],
    'у каждого чертежа уровень 1–4');
  t.eq(G.recipeLevel(D_RECIPE), 4, 'D-снаряжение — 4-й уровень');
  t.eq(G.canUseRecipe('operator', 4, 'synthetic_oil').reason, 'class', 'Оператор не крафтит');
  t.eq(G.canUseRecipe('engineer', 4, 'synthetic_oil').reason, 'class', 'Инженер не крафтит');
  t.ok(G.canUseRecipe('craftsman', 1, 'synthetic_oil').ok, 'Мастеровой собирает чертёж 1-го уровня');
  t.eq(G.canUseRecipe('salvager', 3, D_RECIPE).reason, 'craft_level', 'D-снаряжение не для Утилизатора');
  t.ok(G.canUseRecipe('boiler_smith', 4, D_RECIPE).ok, 'D-снаряжение собирает Котловой Кузнец');

  t.suite('Крафт-хендлер: изучение и сборка только Мастеровым');
  {
    const sent = [];
    const ch = createCraftHandler({
      send: (p, m) => sent.push(m),
      checkRate: () => true,
      tableGet: (tbl, k) => (Object.prototype.hasOwnProperty.call(tbl, k) ? tbl[k] : null),
      wouldExceedWeight: () => ({ ok: true }),
      bagPlus: () => 0,
      pruneInv: (p) => { for (const k of Object.keys(p.inv)) if (p.inv[k] <= 0) delete p.inv[k]; },
      questCollectChanged: () => {},
      saveProfileNow: () => {},
      pushWeight: () => {}
    });
    const mk = (cls, skills, recipe) => ({
      pid: 1, hp: 100, dead: false, cls, skills,
      inv: { ['recipe_' + recipe]: 1 }, equip: {}, plusById: {}, learned: new Set()
    });
    const op = mk('operator', { op_power_strike: 1 }, 'synthetic_oil');
    ch.doLearnRecipe(op, { id: 'synthetic_oil' });
    t.ok(!op.learned.has('synthetic_oil'), 'Оператор не может изучить чертёж');
    t.eq(op.inv.recipe_synthetic_oil, 1, 'чертёж у Оператора не сгорает');
    t.ok(sent.some((m) => m.t === 'learn_fail' && m.reason === 'class'), 'отказ с причиной class');
    op.learned.add('synthetic_oil');
    op.inv.gear_fragment = 2; op.inv.oil_filter = 1;
    sent.length = 0;
    ch.doCraft(op, { id: 'synthetic_oil' });
    t.ok(sent.some((m) => m.t === 'craft_fail' && m.reason === 'class'), 'Оператор не собирает даже изученный чертёж');
    t.eq(op.inv.gear_fragment, 2, 'материалы Оператора не списаны');

    const cr = mk('craftsman', { cr_create_item: 1 }, 'synthetic_oil');
    ch.doLearnRecipe(cr, { id: 'synthetic_oil' });
    t.ok(cr.learned.has('synthetic_oil'), 'Мастеровой изучает чертёж');
    cr.inv.gear_fragment = 2; cr.inv.oil_filter = 1;
    sent.length = 0;
    ch.doCraft(cr, { id: 'synthetic_oil' });
    t.ok(sent.some((m) => m.t === 'craft_ok'), 'Мастеровой собирает предмет (шанс 100%)');
    t.eq(cr.inv.synthetic_oil, 5, 'получено 5 синтетического масла');

    const lowD = mk('craftsman', { cr_create_item: 3 }, D_RECIPE);
    sent.length = 0;
    ch.doLearnRecipe(lowD, { id: D_RECIPE });
    t.ok(!lowD.learned.has(D_RECIPE), '«Ремесло» 3 не открывает D-чертёж');
    t.ok(sent.some((m) => m.reason === 'craft_level' && m.need === 4), 'отказ с нужным уровнем 4');
    const bs = mk('boiler_smith', { cr_create_item: 3, bs_guild_recipes: 1 }, D_RECIPE);
    ch.doLearnRecipe(bs, { id: D_RECIPE });
    t.ok(bs.learned.has(D_RECIPE), 'Котловой Кузнец изучает D-чертёж');
  }

  t.suite('Миграция старых персонажей');
  {
    const op = { cls: 'operator', sp: 100, skills: { op_scrap_collect: 2, op_power_strike: 1 }, inv: {},
      learned: new Set(['synthetic_oil', 'piston', 'no_such_recipe']) };
    const r = playerCore.migrateCraftExclusives(op);
    t.ok(!op.skills.op_scrap_collect, '«Вскрытие корпуса» снято с Оператора');
    t.eq(r.spRefund, 9000, 'возврат SP: 2 ранга × 4500');
    t.eq(op.sp, 9100, 'SP начислены');
    t.eq(op.learned.size, 0, 'изученные чертежи сброшены');
    t.eq(op.inv.recipe_synthetic_oil, 1, 'чертёж масла вернулся в сумку предметом');
    t.eq(op.inv.recipe_piston, 1, 'чертёж поршня вернулся в сумку предметом');
    t.eq(r.recipes, 2, 'неизвестный рецепт пропущен');
    const again = playerCore.migrateCraftExclusives(op);
    t.eq(again.spRefund + again.recipes, 0, 'повторная миграция ничего не дублирует');
    const cr = { cls: 'craftsman', sp: 0, skills: {}, inv: {}, learned: new Set(['synthetic_oil']) };
    playerCore.migrateCraftExclusives(cr);
    t.ok(cr.learned.has('synthetic_oil'), 'у Мастерового изученные чертежи остаются');
  }

  t.suite('«Оценка узлов» и «Демонтаж» на сервере');
  {
    const sent = [];
    const mob = { mid: 7, mobId: 'scrapper', level: 10, hp: 100, maxHp: 100, x: 1, z: 0, y: 0 };
    const sc = createSkillCaster({
      players: new Map(), mobs: new Map([[7, mob]]),
      send: (p, m) => sent.push(Object.assign({ to: p.pid }, m)),
      addMobHate: () => {}, hateFromHit: () => 40
    });
    const mk = (pid, cls, skills) => ({
      pid, cls, level: 20, hp: 300, maxHp: 300, energy: 100, maxEnergy: 100,
      x: 0, z: 0, y: 0, cd: {}, skills, buffs: [], debuffs: [], inv: {},
      devices: { wrist: 6, valve: 6 },
      equip: {
        weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low' },
        necklace: { id: 'operator_compressor_low', templateId: 'operator_compressor_low' },
        bracelet: { id: 'operator_bracers_low', templateId: 'operator_bracers_low' }
      },
      combatPack: { weaponClass: '1h_blunt', atkSpdL2: 300, primary: { WIT: 10, MEN: 27 } }
    });
    const cast = (p, skillId, mid) => {
      sc.doCastBegin(p, { skillId, mid });
      if (p.casting) p.casting.endsAt = Date.now() - 10;
      sc.doSkillCast(p, { skillId, mid });
    };
    // Оператор с «чужим» умением (старый сейв / подмена пакета) — сервер не даёт метить
    const op = mk(1, 'operator', { cr_assess_nodes: 1 });
    withRandom(() => cast(op, 'cr_assess_nodes', 7), () => 0);
    t.ok(!mob.spoilMarked, 'Оператор не может пометить корпус');
    const cr = mk(2, 'craftsman', { cr_assess_nodes: 1, cr_dismantle: 1 });
    withRandom(() => cast(cr, 'cr_assess_nodes', 7), () => 0);
    t.ok(mob.spoilMarked && mob.spoilBy === 2, 'Мастеровой метит корпус');

    SpoilCorpses.clear();
    SpoilCorpses.addCorpse(7, 'scrapper', 2, 1, 2, [{ id: 'gear_fragment', count: 3 }]);
    const thief = mk(3, 'craftsman', { cr_dismantle: 1 });
    sent.length = 0;
    cast(thief, 'cr_dismantle');
    t.ok(sent.some((m) => m.t === 'skill_fail' && m.reason === 'no_corpse'), 'чужой корпус не разобрать');
    t.eq(SpoilCorpses.size(), 1, 'корпус остался владельцу');
    const far = mk(2, 'craftsman', { cr_dismantle: 1 });
    far.x = 50;
    sent.length = 0;
    cast(far, 'cr_dismantle');
    t.ok(sent.some((m) => m.t === 'msg' && /далеко/.test(m.text)), 'издалека — подсказка подойти ближе');
    cr.cd = {};
    sent.length = 0;
    cast(cr, 'cr_dismantle', 99);
    t.eq(cr.inv.gear_fragment, 3, '«Демонтаж» кладёт детали в сумку (mid цели игнорируется)');
    t.ok(sent.some((m) => m.t === 'reward' && m.inv), 'клиент получает обновлённую сумку');
    t.eq(SpoilCorpses.size(), 0, 'разобранный корпус исчезает');

    SpoilCorpses.addCorpse(8, 'scrapper', 0, 0, 2, [{ id: 'gear_fragment', count: 1 }], Date.now() - SpoilCorpses.SWEEP_WINDOW_MS - 1);
    cr.cd = {};
    sent.length = 0;
    cast(cr, 'cr_dismantle');
    t.ok(sent.some((m) => m.t === 'skill_fail' && m.reason === 'no_corpse'), 'остывший корпус не разбирается');
    SpoilCorpses.clear();
  }

  t.suite('Шанс спойла и аттестация');
  {
    const chance = LT.MOB_LOOT_TABLES.scrapper.spoil.chance;
    const roll = Math.min(0.99, chance * 1.15);
    const plain = withRandom(() => LT.rollSpoil('scrapper', 5, 5), () => roll);
    t.eq(plain, [], 'без «Намётанного глаза» бросок выше шанса — пусто');
    const keen = withRandom(() => LT.rollSpoil('scrapper', 5, 5, { chanceMult: 1.3 }), () => roll);
    t.ok(Array.isArray(keen) && keen.length === 1, 'с «Намётанным глазом» тот же бросок даёт деталь');

    const q = QD.get('main_04_certification_craft');
    t.ok(q && q.classReq === 'craftsman' && q.rewards.classChange, 'аттестация Мастерового — квест смены профессии');
    t.eq(CS.getClass('craftsman').transferQuest, 'main_04_certification_craft', 'transferQuest указывает на живой квест');
    const st = QD.emptyState();
    st.done.main_03_machines = { n: 1, at: Date.now() };
    t.ok(QD.canAccept(st, q, 20, Date.now(), 'craftsman').ok, 'Мастеровой берёт аттестацию');
    t.eq(QD.canAccept(st, q, 20, Date.now(), 'operator').reason, 'class', 'Оператор не берёт аттестацию Цеха');
    const npcs = WM.CITY_NPCS || [];
    const vex = npcs.find((n) => n.id === 'trader_vex');
    const dora = npcs.find((n) => n.id === 'trader_dora');
    t.ok(vex && Array.isArray(vex.trainerClasses) && vex.trainerClasses.indexOf('craftsman') !== -1,
      'Оружейник Векс обучает Мастеровых');
    t.ok(dora && dora.quests.indexOf('main_04_certification_craft') !== -1, 'Бронник Дора выдаёт аттестацию');
  }
};
