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
};
