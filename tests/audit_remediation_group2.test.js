// ============================================================
//  TESTS / AUDIT_REMEDIATION_GROUP2.TEST.JS
//  Аудит сервера, группа 2 — приведение механик к принципам L2 Classic
//  (не копия: свои предметы и классы, правила — как в L2).
// ============================================================
'use strict';

const L2 = require('../shared/l2-combat.js');
const G = require('../shared/game-rules.js');
const LR = require('../shared/loot-rules.js');

module.exports = async function (t) {
  // ------------------------------------------------------------------
  t.suite('Группа 2.1: EXP по разнице уровней (L2: (5/6)^(diff−5))');
  {
    t.eq(L2.expModifier(20, 20), 1, 'равный уровень — 100%');
    t.eq(L2.expModifier(20, 15), 1, 'игрок выше на 5 — 100%');
    t.near(L2.expModifier(20, 14), 5 / 6, 1e-9, 'выше на 6 — 83.3%');
    t.near(L2.expModifier(20, 13), Math.pow(5 / 6, 2), 1e-9, 'выше на 7 — 69.4%');
    t.near(L2.expModifier(20, 9), Math.pow(5 / 6, 6), 1e-9, 'выше на 11 — 33.5% (без обнуления)');
    t.eq(L2.expModifier(10, 20), 1, 'моб выше на 10 — 100% (без бонуса)');
    t.eq(L2.expModifier(10, 13), 1, 'моб выше на 3 — 100% (без бонуса)');
    t.eq(G.expModifier(20, 14), L2.expModifier(20, 14), 'game-rules делегирует ту же формулу');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 2.2: штраф дропа и адены — правило deep blue (9+ уровней)');
  {
    t.eq(LR.levelMod(20, 20), { drop: 1, adena: 1 }, 'равный уровень — без штрафа');
    t.eq(LR.levelMod(20, 19), { drop: 1, adena: 1 }, 'игрок выше на 1 — без штрафа (раньше ×0.8)');
    t.eq(LR.levelMod(20, 12), { drop: 1, adena: 1 }, 'выше на 8 — без штрафа');
    t.near(LR.levelMod(20, 11).drop, (1 - 0.09) / 3, 1e-9, 'выше на 9 — (1 − 9%) / 3');
    t.near(LR.levelMod(20, 10).adena, (1 - 0.18) / 3, 1e-9, 'выше на 10 — (1 − 18%) / 3 для адены');
    t.eq(LR.levelMod(30, 10).drop, 0, 'выше на 20 — шанс 0');
    t.eq(LR.levelMod(10, 20), { drop: 1, adena: 1 }, 'моб выше — без бонуса (раньше до ×1.5)');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 2.3: срыв каста (L2: 15 + √(13·dmg) − (MEN_bonus·100 − 100))');
  {
    const want = (dmg, men) => Math.max(1, Math.min(99, 15 + Math.sqrt(13 * dmg) - (L2.statBonus(men, 'MEN') * 100 - 100)));
    t.eq(L2.calcCastCancel(1, 39).chance, 1, 'MEN 39, урон 1 — минимум 1% (раньше ~22%)');
    t.near(L2.calcCastCancel(100, 39).chance, want(100, 39), 1e-9, 'MEN 39, урон 100 — по формуле L2');
    t.near(L2.calcCastCancel(400, 20).chance, want(400, 20), 1e-9, 'MEN 20, урон 400 — по формуле L2');
    t.eq(L2.calcCastCancel(1e6, 20).chance, 99, 'огромный урон — потолок 99%');
    t.eq(L2.calcCastCancel(0, 20).cancel, false, 'без урона срыва нет');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 2.4: шанс попадания (L2: 80 + 2·Δ, 20–98%), JS и C++ совпадают');
  {
    t.eq(L2.hitChance(20, 20), 80, 'Acc = Eva — 80%');
    t.eq(L2.hitChance(25, 20), 90, '+5 точности — 90% (2% за пункт)');
    t.eq(L2.hitChance(0, 100), 20, 'нижняя граница 20%');
    t.eq(L2.hitChance(100, 0), 98, 'верхняя граница 98%');
    if (L2.native && typeof L2.native.hitChance === 'function') {
      let same = true;
      for (let d = -40; d <= 40; d += 3) if (L2.native.hitChance(50 + d, 50) !== Math.max(20, Math.min(98, 80 + 2 * d))) same = false;
      t.ok(same, 'нативный C++ hitChance совпадает с формулой');
    }
    t.eq(L2.evasionBonusToPoints(0.04), 2, '«+4% уклонения» = 2 пункта Evasion при 2% за пункт');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 2.5: заточка — потолок по грейду, safe, постоянный шанс, шаг L2');
  {
    const ER = require('../shared/enchant-rules.js');
    const ITEMS = require('../shared/item-db.js');
    t.eq(ER.maxLevel({ grade: 'no_grade' }), 3, 'No-Grade — максимум +3');
    t.eq(ER.maxLevel({ grade: 'd' }), 6, 'D — максимум +6');
    t.eq(ER.safeLevel({ grade: 'd' }), 3, 'safe +3');
    t.eq(ER.safeLevel({ grade: 'b', fullBody: true }), 4, 'цельная броня — safe +4');
    t.eq(ER.successChance(2, {}), 1, '+2 → +3 всегда успешно');
    t.near(ER.successChance(3, {}), 2 / 3, 1e-9, '+3 → +4 — 2/3');
    t.near(ER.successChance(5, {}), 2 / 3, 1e-9, '+5 → +6 — тоже 2/3 (не падает)');
    t.eq(ER.successChance(3, { fullBody: true }), 1, 'цельная броня: +3 → +4 безопасно');

    // Шаг прибавки: D — +2 P.Atk / +2 M.Atk, лук +4, с +4 — вдвое; броня +1, с +4 — +3
    t.eq(ITEMS.enchantBonus('d', 3, true), 6, 'D оружие +3: P.Atk +6');
    t.eq(ITEMS.enchantBonus('d', 5, true), 2 * 3 + 4 * 2, 'D оружие +5: P.Atk +14 (over-enchant ×2)');
    t.eq(ITEMS.enchantBonus('d', 5, true, { bow: true }), 4 * 3 + 8 * 2, 'D лук +5: P.Atk +28');
    t.eq(ITEMS.enchantBonus('d', 4, true, { matk: true }), 2 * 3 + 4, 'D оружие +4: M.Atk +10');
    t.eq(ITEMS.enchantBonus('d', 5, false), 3 + 3 * 2, 'D броня +5: защита +9');

    // gearFromEquip: заточка брони — только P.Def, бижутерии — только M.Def
    const g0 = ITEMS.gearFromEquip({ chest: { templateId: 'knowledge_jacket', plus: 0 }, earring_l: { templateId: 'coral_earring', plus: 0 } });
    const g1 = ITEMS.gearFromEquip({ chest: { templateId: 'knowledge_jacket', plus: 4 }, earring_l: { templateId: 'coral_earring', plus: 2 } });
    t.eq(g1.armorDef - g0.armorDef, 3 + 3, 'нагрудник +4: P.Def +6');
    t.eq(g1.armorCDef - g0.armorCDef, 2, 'серьга +2: M.Def +2, нагрудник M.Def не поднимает');
    const w0 = ITEMS.gearFromEquip({ weapon: { templateId: 'apprentice_wand', plus: 0 } });
    const w2 = ITEMS.gearFromEquip({ weapon: { templateId: 'apprentice_wand', plus: 2 } });
    t.eq(w2.toolAtk - w0.toolAtk, 2, 'NG жезл +2: M.Atk +2 (шаг M.Atk)');
    t.eq(w2.weaponAtk - w0.weaponAtk, 2, 'NG жезл +2: P.Atk +2');

    // Обработчик: потолок NG, поломка D выше safe, цельная броня безопасна на +3
    const createEnchantHandler = require('../server/handlers/enchant-handler.js');
    const mk = (msgs) => createEnchantHandler({
      send: (_p, m) => msgs.push(m), checkRate: () => true, isBadKey: () => false,
      pushCombatStats: () => {}, pushWeight: () => {}, saveProfileNow: () => {},
      invCount: (pl, id) => (pl.inv[id] | 0), canCarryMore: () => ({ ok: true }), spawnGroundLoot: () => null
    });
    {
      const msgs = [];
      const pl = { pid: 1, dead: false, hp: 100, inv: { pressure_amplifier: 3 }, equip: { weapon: { id: 'operator_hammer_low', templateId: 'operator_hammer_low', plus: 3 } } };
      mk(msgs).doEnchant(pl, { slot: 'weapon' });
      const f = msgs.find(m => m.t === 'enchant_fail');
      t.ok(f && f.reason === 'max' && f.max === 3, 'NG на +3 — потолок, усилитель не тратится');
      t.eq(pl.inv.pressure_amplifier, 3, 'усилитель цел');
    }
    {
      const msgs = [];
      const pl = { pid: 2, dev: true, dead: false, hp: 100, inv: { pressure_amplifier_d: 1 }, equip: { weapon: { id: 'revolution_sword', templateId: 'revolution_sword', plus: 3 } } };
      mk(msgs).doEnchant(pl, { slot: 'weapon', force: 'break' });
      t.ok(msgs.some(m => m.t === 'enchant_break') && !pl.equip.weapon, 'D оружие +3 при неудаче ломается');
    }
    {
      let allOk = true;
      for (let i = 0; i < 30; i++) {
        const msgs = [];
        const pl = { pid: 3, dev: true, dead: false, hp: 100, inv: { pressure_amplifier: 1 }, equip: { chest: { id: 'avadon_robe', templateId: 'avadon_robe', plus: 3 } } };
        mk(msgs).doEnchant(pl, { slot: 'chest', scrollId: 'pressure_amplifier' }); // dev-обход грейда свитка
        if (!(pl.equip.chest && pl.equip.chest.plus === 4)) allOk = false;
      }
      t.ok(allOk, 'цельная броня +3 → +4 — 30 из 30 успешно (safe +4)');
    }
  }
};
