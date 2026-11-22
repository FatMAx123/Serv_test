// ============================================================
//  TESTS / L2-FORMULAS.TEST.JS — формулы и мобы по эталону L2 Classic:
//  интервал удара 470000/Atk.Spd (игроки и NPC), крит от DEX_bonus, оружие заменяет
//  базовый P.Atk, Spiritshot ×√2, шаблонные параметры мобов, SP из шаблона,
//  начальная часть MP списывается при старте каста.
// ============================================================
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L2 = require(path.join(ROOT, 'shared', 'l2-combat.js'));
const ET = require(path.join(ROOT, 'shared', 'l2-exp-table.js'));
const MOB_DB = require(path.join(ROOT, 'shared', 'mob-db.js'));
const G = require(path.join(ROOT, 'shared', 'game-rules.js'));
const ITEMS = require(path.join(ROOT, 'shared', 'item-db.js'));
const CS = require(path.join(ROOT, 'shared', 'class-system.js'));
const { createMobHandler } = require(path.join(ROOT, 'server', 'handlers', 'mob-handler.js'));
const { createSkillCaster } = require(path.join(ROOT, 'server', 'combat', 'skill-caster.js'));

module.exports = function (t) {
  t.suite('L2 формулы: интервал удара 470000 / Atk.Spd');
  t.eq(L2.BASE_SWING_REF, 470, 'опора L2J calcPAtkSpd = 470');
  t.near(L2.swingTimeSec(312), 1.506, 0.001, 'Atk.Spd 312 ≈ 1500 мс (замер L2J)');
  t.eq(L2.swingTimeMs(L2.NPC_BASE_ATK_SPD), 1900, 'NPC 253 → 1858 мс → 1900 мс на сетке 100 мс');

  t.suite('L2 формулы: клиент получает настоящий интервал, сервер — с допуском');
  {
    const P = require(path.join(ROOT, 'server', 'core', 'player.js'));
    const p = new P.Player(1, 'itest_formula', { name: 'Formula', cls: 'operator', level: 10, equip: {}, inv: {} }, {});
    const pack = p.combatPack;
    t.eq(pack.atkIntervalMs, L2.quantizeCombatMs(Math.max(120, Math.round(L2.swingTimeSec(pack.atkSpdL2) * 1000)), 100),
      'atkIntervalMs = 470000/Atk.Spd без допуска');
    t.ok(pack.atkCooldownMs < pack.atkIntervalMs, 'серверный кулдаун короче (допуск на джиттер)',
      pack.atkCooldownMs + ' < ' + pack.atkIntervalMs);
  }

  t.suite('L2 формулы: крит от DEX_bonus');
  t.eq(L2.critChancePct(21, 1, 0, 'dagger'), Math.floor(120 * L2.statBonus(21, 'DEX')), 'кинжал DEX21: 120 × 1.01');
  t.eq(L2.critChancePct(35, 1, 0, 'dagger'), Math.floor(120 * L2.statBonus(35, 'DEX')), 'кинжал DEX35: 120 × 1.15');
  t.ok(L2.critChancePct(35, 1, 0, 'dagger') <= 140, 'кинжал DEX35 не выше ~14 % (раньше 15.1 %)',
    'crit=' + L2.critChancePct(35, 1, 0, 'dagger'));

  t.suite('L2 формулы: оружие заменяет базовый P.Atk');
  const lm = L2.levelMod(1);
  const sb = L2.statBonus(40, 'STR');
  t.eq(L2.pAtkFromStats(40, 1, 8, 1, 4), Math.max(1, Math.round(8 * sb * lm)), 'P.Atk = P.Atk оружия × STR × levelMod (без +3)');
  t.eq(L2.pAtkFromStats(40, 1, 0, 1, 4), Math.max(1, Math.round(4 * sb * lm)), 'без оружия — база шаблона');

  t.suite('L2 формулы: Spiritshot ×√2, Blessed ×2');
  t.near(L2.SPIRITSHOT_MULT, Math.SQRT2, 1e-9, 'SPS = √2 (M.Atk×2 под корнем)');
  t.eq(L2.BLESSED_SPIRITSHOT_MULT, 2, 'BSPS = 2 (M.Atk×4 под корнем)');
  t.eq(G.CONSUMABLES.spiritshot_d.shotMult, 1.41, 'каталог показывает ×1.41');
  t.eq(ITEMS.get('spiritshot_no_grade').shotMult, 1.41, 'item-db показывает ×1.41');

  t.suite('L2 мобы: параметры шаблона доходят до инстанса');
  {
    const mh = createMobHandler({
      mobs: new Map(), players: new Map(), activeEvents: new Map(), respawnTimers: new Map(),
      spawnedSpots: new Set(), getServerSpots: () => [], getNextId: () => 1,
      GEO: { ready: () => false, standY: () => 0 }, MOB_DB, G, L2, LR: {}, EV: {}, WM: {},
      dist2: () => 0, send: () => {}, broadcastAOI: () => {}, playerNear: () => false,
      geoStepMob: () => false, mobDisplayNameServer: (id) => id, spawnMobDropPiles: () => {}
    });
    const tpl = MOB_DB.statsAtLevel('steam_hound', 10);
    const m = new mh.Mob(7, 'steam_hound', 10, 0, 0, null, {});
    t.eq([m.accuracy, m.evasion, m.critRate, m.sp], [tpl.accuracy, tpl.evasion, tpl.critRate, tpl.sp],
      'accuracy / evasion / critRate / sp из шаблона');
    t.eq(m.atkSpd, 253, 'Atk.Spd NPC по умолчанию 253');
  }

  t.suite('L2 мобы: SP — один источник (шаблон), шкала прежняя');
  t.eq(ET.spDivisor(5), 24, 'делитель SP 1–10 = 24');
  t.eq(ET.spDivisor(15), 28, 'делитель SP 11–20 = 28');
  const hound = MOB_DB.statsAtLevel('steam_hound', 10);
  t.eq(hound.sp, Math.round(hound.exp / 24), 'SP шаблона = EXP / 24 на 10 ур.');

  t.suite('L2 каст: начальная часть MP списывается сразу и сгорает при срыве');
  {
    const sent = [];
    const sc = createSkillCaster({ players: new Map(), mobs: new Map(), send: (p, m) => sent.push(m) });
    const mk = () => ({
      pid: 9, cls: 'engineer', level: 10, hp: 100, maxHp: 400, energy: 100, maxEnergy: 100,
      x: 0, z: 0, y: 0, cd: {}, skills: { eng_self_repair: 1 }, buffs: [], debuffs: [],
      devices: { nano: 3, circuit: 3 },
      equip: {
        weapon: { id: 'apprentice_wand', templateId: 'apprentice_wand' },
        bracelet: { id: 'engineer_nano_bracelet', templateId: 'engineer_nano_bracelet' }
      },
      combatPack: { weaponClass: '1h_blunt', cAtk: 20, primary: { WIT: 20, MEN: 30 }, atkSpdL2: 300 }
    });
    const cost = L2.mpCostFinal(14, '1h_blunt', 10, 1);
    const initial = Math.round(cost * 0.2);

    const p = mk();
    sc.doCastBegin(p, { skillId: 'eng_self_repair' });
    t.ok(p.casting && p.casting.mpPaid === initial, 'каст начат, начальная часть MP учтена', JSON.stringify(p.casting && { mpPaid: p.casting.mpPaid }));
    t.eq(p.energy, 100 - initial, 'начальная часть MP списана в cast_begin');
    sc.cancelPlayerCast(p, 'interrupted');
    t.eq(p.energy, 100 - initial, 'при срыве начальная часть не возвращается');

    const q = mk();
    sc.doCastBegin(q, { skillId: 'eng_self_repair' });
    q.casting.endsAt = Date.now() - 10;
    sc.doSkillCast(q, { skillId: 'eng_self_repair' });
    t.eq(q.energy, 100 - cost, 'за полный каст списана ровно полная стоимость (' + cost + ')');

    t.suite('L2 каст: откат идёт с начала каста (L2J beginCast)');
    const r = mk();
    const t0 = Date.now();
    sc.doCastBegin(r, { skillId: 'eng_self_repair' });
    const cdAtBegin = r.cd.sk_eng_self_repair || 0;
    t.ok(cdAtBegin >= t0 + 10000 - 50, 'откат взведён при начале каста (≥ 10 с от старта)', String(cdAtBegin - t0));
    r.casting.endsAt = Date.now() - 10;
    sent.length = 0;
    sc.doSkillCast(r, { skillId: 'eng_self_repair' });
    t.ok(sent.some((m) => m.t === 'skill_ok'), 'завершение своего каста откат не блокирует');
    t.eq(r.cd.sk_eng_self_repair, cdAtBegin, 'откат не перезапускается после завершения');
    const ok = sent.find((m) => m.t === 'skill_ok');
    t.ok(ok && ok.cooldown <= (cdAtBegin - t0) / 1000 + 0.01, 'клиенту уходит остаток отката, а не полный откат', ok && String(ok.cooldown));
    const s2 = mk();
    sc.doCastBegin(s2, { skillId: 'eng_self_repair' });
    sent.length = 0;
    sc.cancelPlayerCast(s2, 'interrupted');
    t.ok((s2.cd.sk_eng_self_repair || 0) > Date.now(), 'сорванный каст оставляет скилл на откате (L2)');
    const cc = sent.find((m) => m.t === 'cast_cancel');
    t.ok(cc && cc.cooldown > 9 && cc.cooldown <= 10.1, 'cast_cancel несёт остаток отката для панели скиллов',
      cc ? String(cc.cooldown) : 'нет cast_cancel');
  }
};
