// ============================================================
//  TESTS / L2-BALANCE-1-20.TEST.JS — баланс фазы 1 (кап 20):
//  соло-треш 6+ по своей кривой HP (бой с мобом своего уровня 15–25 с, а не 90 с),
//  EXP снижается вслед за HP (темп не ускоряется), пати/рейды не тронуты;
//  сюжет «Искра» 8/12/15/18 между главой 3 и сертификацией; награды по классу;
//  соло-мобы 18–20 в Котловых землях и Крепости.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const MOB_DB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const QD = require(path.join(ROOT, 'shared', 'quest-db.js'));
const NPCS = require(path.join(ROOT, 'shared', 'npc-services.js'));
const LT = require(path.join(ROOT, 'server', 'data', 'loot-tables.js'));
const { createQuestHandler } = require(path.join(ROOT, 'server', 'handlers', 'quest-handler.js'));

module.exports = function (t) {
  t.suite('Баланс 1–20: кривая HP соло-треша');
  const hp = (L) => MOB_DB.statsAtLevel('__solo_norm__', L).hp; // нет шаблона → solo_norm без uniq
  const base = (L) => MOB_DB.baseCurve(L);
  t.eq(MOB_DB.statsAtLevel('scrapper', 3).hp, Math.floor(base(3).hp * 0.82), '1–5: кривая таблицы не тронута');
  let mono = true;
  for (let L = 6; L <= 25; L++) if (hp(L) <= hp(L - 1)) mono = false;
  t.ok(mono, 'HP соло-треша растёт с каждым уровнем 5→25 (без плато)');
  t.near(hp(12), 500, 5, 'solo_norm 12 ур. ≈ 500 HP (было 964)');
  t.near(hp(20), 880, 5, 'solo_norm 20 ур. ≈ 880 HP (было 2800)');
  const k20 = MOB_DB.outdoorTrashMult(20), k25 = MOB_DB.outdoorTrashMult(25);
  t.near(k25.hp, k20.hp, 1e-9, 'выше 20 — та же доля от таблицы (фаза 2 продолжает кривую)');
  t.ok(MOB_DB.statsAtLevel('rust_sentry', 18).pAtk < base(18).pAtk * 0.8, 'P.Atk соло-треша 18 ур. снижен');

  t.suite('Баланс 1–20: EXP идёт вслед за HP, пати и рейды не тронуты');
  const k15 = MOB_DB.outdoorTrashMult(15);
  t.near(k15.exp, Math.min(1, k15.hp * 1.5), 1e-9, 'EXP-множитель = HP × 1.5');
  t.eq(MOB_DB.statsAtLevel('__solo_norm__', 15).exp, Math.max(1, Math.floor(base(15).exp * k15.exp)), 'EXP моба 15 ур. снижен тем же множителем');
  const wraith = MOB_DB.statsAtLevel('green_steam_wraith', 19);
  t.eq(wraith.hp, Math.max(1, Math.floor(base(19).hp * 1.55)), 'party: HP = таблица × роль (без снижения)');
  const worm = MOB_DB.statsAtLevel('drill_worm', 20);
  t.ok(worm.hp >= base(20).hp * 40 * 2.5 - 1, 'raid: HP не снижен (время рейда прежнее)', String(worm.hp));

  t.suite('Баланс 1–20: соло-мобы 18–20');
  const NEW = ['kettle_stalker', 'iron_crawler', 'gauge_warden', 'dryer_hound'];
  NEW.forEach((id) => {
    const m = MOB_DB.get(id);
    t.ok(m && /^(solo_norm|solo_aggro|pack)$/.test(m.role) && m.level[1] >= 20, id + ': соло-роль, до 20 ур.');
    t.ok(!!LT.MOB_LOOT_TABLES[id], id + ': своя таблица лута');
  });
  const boilerKit = MOB_DB.kitForEditorZone ? MOB_DB.kitForEditorZone('Котловые земли', 18, 20) : null;
  if (boilerKit) {
    const ids = boilerKit.map((e) => e.mob);
    t.ok(NEW.every((id) => ids.indexOf(id) >= 0), 'все новые соло-мобы в наборе Котловых земель');
  }

  t.suite('Баланс 1–20: сюжет «Искра» 8/12/15/18');
  t.eq(QD.validate(), [], 'quest-db без ошибок');
  const chain = ['main_03_machines', 'main_05_whisper', 'main_06_zero_cycle', 'main_07_field_memory', 'main_08_boiler_voice'];
  for (let i = 1; i < chain.length; i++) {
    t.eq(QD.prerequisiteOf(chain[i]), chain[i - 1], chain[i] + ' идёт после ' + chain[i - 1]);
    const prev = QD.get(chain[i - 1]);
    const talk = (prev.objectives || []).find((o) => o.type === 'talk');
    if (i > 1) t.eq(talk && talk.target, QD.get(chain[i]).npc, chain[i - 1] + ': talk ведёт к NPC следующей главы');
  }
  t.eq(chain.slice(1).map((id) => QD.get(id).levelReq), [8, 12, 15, 18], 'уровни глав 8 / 12 / 15 / 18');
  t.eq(QD.prerequisiteOf('main_04_certification'), 'main_03_machines', 'сертификация не ждёт сюжет «Искры»');
  chain.slice(1).forEach((id) => {
    QD.get(id).objectives.filter((o) => o.type === 'kill').forEach((o) => {
      const m = MOB_DB.get(o.target);
      t.ok(m && m.role !== 'party' && m.role !== 'party_elite', id + ': цель ' + o.target + ' — соло-моб');
    });
  });

  t.suite('Баланс 1–20: награда по классу (byClass)');
  const q3 = QD.get('main_03_machines');
  t.eq(q3.rewards.byClass.operator[0].id, 'iron_hammer', 'глава 3: оператору Iron Hammer');
  t.eq(q3.rewards.byClass.engineer[0].id, 'willow_coil', 'глава 3: инженеру Willow Coil');
  {
    const sent = [];
    const qh = createQuestHandler({
      QD, NPCS, EXP: require(path.join(ROOT, 'shared', 'l2-exp-table.js')),
      send: (p, m) => sent.push(m), invCount: (p, id) => (p.inv[id] | 0), giveCurrency: (p, n) => { p.copper = (p.copper | 0) + n; },
      grantExpSp: () => ({ exp: 0, sp: 0 }), applyPlayerBuff: () => { }, pushEffects: () => { }, pushCombatStats: () => { },
      saveProfileNow: () => { }, pruneInv: () => { }, pushWeight: () => { }
    });
    const npc = NPCS.getNpc(q3.npc);
    const mk = (cls) => ({
      pid: 93101, cls, level: 5, inv: { quest_hound_reel: 8 }, plusById: {},
      x: npc.position.x, z: npc.position.z,
      quests: { active: { main_03_machines: { p: [8, 8] } }, done: {}, completed: {} }
    });
    const op = mk('operator'), en = mk('engineer');
    qh.doQuestComplete(op, { questId: 'main_03_machines' });
    qh.doQuestComplete(en, { questId: 'main_03_machines' });
    t.ok((op.inv.iron_hammer | 0) === 1 && !en.inv.iron_hammer, 'оператор получил Iron Hammer, инженер — нет',
      JSON.stringify(sent.filter((m) => m.t === 'quest_fail')));
    t.ok((en.inv.willow_coil | 0) === 1 && !op.inv.willow_coil, 'инженер получил Willow Coil, оператор — нет');
  }
};
