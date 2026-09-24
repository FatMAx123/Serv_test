// SHARED / L2-COMBAT.JS
// Боевые формулы классических MMO C1 (сервер = авторитет, клиент = предсказание).
// Без магии: C.Atk / C.Def = сила и сопротивление СХЕМ (давление, ток, протоколы).
// P.Atk / P.Def = физика (молот, щит, пневматика).
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.L2_COMBAT = api; root.COMBAT_RULES = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  // ─── Константы C1 (канонические формулы / таблицы) ───
  var PHYS_NORM = 70;          // физ. авто: 70 × P.Atk × SS / P.Def
  var CIRCUIT_NORM = 91;       // маг: 91 × Power × √M.Atk × Sps / M.Def
  /**
   * Радиусы под метрики острова.
   * melee 3.5 | magicCast 30 | magicEffect 55 | buff 21 | bow 30
   */
  var GAME_MELEE_REF = 3.5;
  var GAME_MAGIC_CAST = 30;
  var GAME_MAGIC_EFFECT = 55;
  var GAME_BUFF_CAST = 21;
  var GAME_BUFF_EFFECT = 38;
  var GAME_BOW = 30;
  var L2_MELEE_REF = 40;
  var L2_RANGE_K = GAME_MELEE_REF / L2_MELEE_REF; // legacy
  function fromL2Range(l2Units) {
    var n = +l2Units || 0;
    if (n >= 1000) return GAME_MAGIC_EFFECT;
    if (n >= 800) return GAME_BUFF_EFFECT;
    if (n >= 500) return GAME_MAGIC_CAST;
    if (n >= 350) return GAME_BUFF_CAST;
    return Math.round(n * L2_RANGE_K * 10) / 10;
  }
  /** Горизонтальная дистанция XZ (высота рельефа не входит). */
  function distXZ(ax, az, bx, bz) {
    var dx = (+ax || 0) - (+bx || 0);
    var dz = (+az || 0) - (+bz || 0);
    return Math.sqrt(dx * dx + dz * dz);
  }
  var PHYS_RAND_MIN = 0.85;
  var PHYS_RAND_MAX = 1.15;
  var CIRCUIT_RAND_MIN = 0.90;
  var CIRCUIT_RAND_MAX = 1.10;
  // C1: физ. крит ×2; маг. крит ×3 (не ×4 как в поздних хрониках)
  var BASE_CRIT_MULT = 2.0;
  var MAGIC_CRIT_MULT = 3.0;
  var MAGIC_CRIT_PCT = 2.0;    // ~1–3% fixed-ish C1
  // C1 hit: 75 + (Acc−Eva)×5, clamp 5–98
  var HIT_BASE = 75;
  var HIT_PER_DIFF = 5;
  var HIT_MIN = 5;
  var HIT_MAX = 98;
  var CRIT_CAP = 80;           // %
  var BASE_CRIT_PCT = 40;      // Базовый крит L2 (40 = 4.4% при DEX21)
  var SHIELD_BASE_BLOCK = 20;  // % C1 front block if shield equipped
  // Верхняя граница блока. Без этой константы blockChance() бросал
  // ReferenceError, и любая автоатака по игроку со щитом рвала соединение
  // атакующему (ws.close 1011). PvE не падал только потому, что там щит
  // защитника вообще не передавался.
  var BLOCK_CAP = 70;          // % C1 shield block cap
  // Soulshot / Spiritshot C1
  var SOULSHOT_MULT = 2.0;           // SS → ×2 физ
  var SPIRITSHOT_MULT = 1.5;         // SPS → ×1.5 маг
  var BLESSED_SPIRITSHOT_MULT = 2.0; // BSPS → ×2 маг (НЕ cast spd в C1)
  // MP equip: mag weapon ~0.90 (10% off nukes)
  var MP_MOD_FIST_PHYS = 1.0;
  var MP_MOD_MAGIC_WEAPON = 0.90;
  /**
   * Порог: Power ≥ ABSOLUTE_POWER_MIN → skilldata C1 absolute Power
   * (Wind Strike=12…). Ниже — относительный множитель.
   * CIRCUIT_REL_POWER_REF: relative 1.0 ≈ Power 16 (чуть выше WS L1),
   *   2.3 (con_overload «230%») → effective Power 36.8.
   */
  var ABSOLUTE_POWER_MIN = 6;
  var CIRCUIT_REL_POWER_REF = 16;

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }

  /** true если Power из skilldata C1 (абсолютный), false если множитель 1.0=AA */
  function isAbsoluteSkillPower(power) {
    return power != null && +power >= ABSOLUTE_POWER_MIN;
  }

  /**
   * C1 физ. урон:
   *   AA:          70 × P.Atk × SS / P.Def
   *   Skill PDAM:  70 × (P.Atk×SS + Power×SSBoost) / P.Def
   * Power Strike Power=25…70, SSBoost=2.0 (при SS power тоже ×2).
   * skillPower ≥ ABSOLUTE_POWER_MIN → absolute skilldata Power.
   * skillPower < 6 → relative mult (1.0 = AA).
   * shotMod: 1.0 bare | 2.0 Soulshot
   */
  function physicalDamage(pAtk, pDef, skillPower, shotMod) {
    skillPower = skillPower == null ? 1.0 : +skillPower;
    pAtk = Math.max(1, +pAtk || 1);
    pDef = Math.max(1, +pDef || 1);
    shotMod = shotMod == null ? 1.0 : +shotMod;
    if (!(shotMod > 0)) shotMod = 1;
    var dmg;
    if (isAbsoluteSkillPower(skillPower)) {
      // (P.Atk × SS) + (Power × SSBoost); default SSBoost = shotMod for phys skills
      var atk = pAtk * shotMod;
      var power = skillPower * shotMod;
      dmg = PHYS_NORM * (atk + power) / pDef
        * randRange(PHYS_RAND_MIN, PHYS_RAND_MAX);
    } else {
      // AA / relative: skillPower as multiplier (1.0 = normal hit)
      dmg = PHYS_NORM * pAtk * skillPower * shotMod / pDef
        * randRange(PHYS_RAND_MIN, PHYS_RAND_MAX);
    }
    return Math.max(1, Math.floor(dmg));
  }

  /**
   * C1 магический урон (nuke):
   *   91 × Power × √M.Atk × Spiritshot / M.Def
   * SPS=1.5 | BSPS=2.0 (BSPS НЕ даёт Casting Spd в C1)
   * Absolute: Power из skilldata (Wind Strike 12…).
   * Relative (Power < 6): skillPower × CIRCUIT_REL_POWER_REF как effective Power
   *   (1.0 ≈ P16, 2.3 «230%» ≈ P37 — сильнее max WS, не слабее).
   */
  function circuitDamage(cAtk, cDef, skillPower, shotMod, elementMod) {
    skillPower = skillPower == null ? 1.0 : +skillPower;
    cAtk = Math.max(1, +cAtk || 1);
    cDef = Math.max(1, +cDef || 1);
    shotMod = shotMod == null ? 1.0 : +shotMod;
    elementMod = elementMod == null ? 1.0 : +elementMod;
    if (!(shotMod > 0)) shotMod = 1;
    var power = isAbsoluteSkillPower(skillPower)
      ? skillPower
      : skillPower * CIRCUIT_REL_POWER_REF;
    if (!(power > 0)) power = CIRCUIT_REL_POWER_REF;
    var dmg = CIRCUIT_NORM * power * Math.sqrt(cAtk) / cDef
      * shotMod * elementMod
      * randRange(CIRCUIT_RAND_MIN, CIRCUIT_RAND_MAX);
    return Math.max(1, Math.floor(dmg));
  }

  /** C1 физ. level mod ≈ 1 + Level/100 (для P.Atk от оружия). */
  function physLevelMod(level) {
    return 1 + Math.max(1, +level || 1) / 100;
  }

  /**
   * C1 MP cost: base × equipMod × levelPenalty
   * equip: fist/phys 1.0 | blunt/pole/2h (circuit tools, ex-wand/staff) ~0.90
   * levelPenalty: char < skillReq → up to +50%
   */
  function mpEquipMod(weaponClass) {
    var cls = (weaponClass && String(weaponClass)) || 'fist';
    if (cls === '1h_blunt' || cls === 'blunt' || cls === 'wand' ||
        cls === '2h_staff' || cls === '2h_blunt' || cls === '2h_sword' ||
        cls === 'pole' || cls === 'staff') {
      return MP_MOD_MAGIC_WEAPON;
    }
    return MP_MOD_FIST_PHYS;
  }

  function mpLevelPenalty(playerLevel, skillLevelReq) {
    var pl = Math.max(1, +playerLevel || 1);
    var req = Math.max(1, +skillLevelReq || 1);
    if (pl >= req) return 1.0;
    var diff = req - pl;
    return 1 + Math.min(0.5, diff * 0.1);
  }

  function mpCostFinal(baseMp, weaponClass, playerLevel, skillLevelReq) {
    baseMp = Math.max(0, +baseMp || 0);
    if (baseMp <= 0) return 0;
    var cost = baseMp * mpEquipMod(weaponClass) * mpLevelPenalty(playerLevel, skillLevelReq);
    // round: 11×0.9 → 10 (user example), not floor-to-9
    return Math.max(1, Math.round(cost));
  }

  /**
   * Канонические бонусы статов C1.
   * bonus = round(pow(BASE, stat − REF) × 100) / 100
   * Используются для HP/MP/CP регена (и levelMod-зависимых вещей).
   */
  var STAT_BONUS = {
    STR: { base: 1.036, ref: 34.845 },
    INT: { base: 1.020, ref: 31.375 },
    DEX: { base: 1.009, ref: 19.360 },
    WIT: { base: 1.050, ref: 20.000 },
    CON: { base: 1.030, ref: 27.632 },
    MEN: { base: 1.010, ref: -0.060 }
  };

  /** Формула бонуса стата: floor(pow(BASE, stat-REF)*100 + 0.5)/100 */
  function statBonus(value, key) {
    var s = STAT_BONUS[key];
    if (!s) return 1;
    var raw = Math.pow(s.base, (+value || 0) - s.ref);
    return Math.floor(raw * 100 + 0.5) / 100;
  }

  /**
   * Legacy statMod — C1 combat calibration (Casting Spd WIT, P.Atk STR…).
   * WIT20 → ~0.906 → Floor(183×mod)=166. Не путать с Formulas.java WIT 1.050.
   */
  var STAT_REF = {
    STR: 11.77, DEX: 11.99, CON: 11.21,
    INT: -5.20, WIT: 30.88, MEN: -3.85
  };
  function statMod(value, key) {
    var ref = STAT_REF[key] != null ? STAT_REF[key] : 12;
    return Math.pow(1.009, (+value || 0) - ref);
  }

  /** levelMod = (level + 89) / 100  → L1 = 0.9 */
  function levelMod(level) {
    return (Math.max(1, +level || 1) + 89) / 100;
  }

  /**
   * Множитель регена по позе:
   * sit ×1.5 | stand (не движется) ×1.1 | walk ×1.0 | run ×0.7
   */
  var REGEN_POSE = { sit: 1.5, stand: 1.1, walk: 1.0, run: 0.7 };
  var HP_REGEN_PERIOD_SEC = 3; // HP_REGENERATE_PERIOD = 3000 мс
  /** Канонические дефолты: hpRegen=1.5, mpRegen=0.9 */
  var DEFAULT_BASE_HP_REG = 1.5;
  var DEFAULT_BASE_MP_REG = 0.9;

  function regenPoseMult(pose) {
    pose = pose || 'stand';
    return REGEN_POSE[pose] != null ? REGEN_POSE[pose] : REGEN_POSE.stand;
  }

  /**
   * HP regen за 1 тик (3 с):
   * init = baseHpReg + levelBonus
   * levelBonus: lvl>10 → (lvl-1)/10.0, иначе 0.5
   * init *= levelMod × CON_bonus
   * if (init < 1) init = 1
   * tick = init × poseMult   (pose через hpRegenMultiplier)
   * baseHpReg PC default 1.5 (CharTemplate)
   */
  function hpRegenPerTick(baseHpReg, con, level, pose) {
    baseHpReg = baseHpReg != null ? +baseHpReg : DEFAULT_BASE_HP_REG;
    var lv = Math.max(1, +level || 1);
    var levelBonus = lv > 10 ? (lv - 1) / 10.0 : 0.5;
    var init = (baseHpReg + levelBonus) * levelMod(lv) * statBonus(con, 'CON');
    if (init < 1) init = 1;
    return init * regenPoseMult(pose);
  }

  /**
   * MP/Energy regen за 1 тик (3 с):
   * init = baseMpReg + 0.3×((level-1)/10.0)
   * init *= levelMod × MEN_bonus
   * if (init < 1) init = 1
   * tick = init × poseMult
   * baseMpReg PC default 0.9
   */
  function mpRegenPerTick(baseMpReg, men, level, pose) {
    baseMpReg = baseMpReg != null ? +baseMpReg : DEFAULT_BASE_MP_REG;
    var lv = Math.max(1, +level || 1);
    var init = (baseMpReg + 0.3 * ((lv - 1) / 10.0)) * levelMod(lv) * statBonus(men, 'MEN');
    if (init < 1) init = 1;
    return init * regenPoseMult(pose);
  }

  /** CP regen — та же база, что HP (Formulas). */
  function cpRegenPerTick(baseHpReg, con, level, pose) {
    return hpRegenPerTick(baseHpReg, con, level, pose);
  }

  /** HP/MP в секунду (для continuous regen: tick/3). */
  function hpRegenPerSec(baseHpReg, con, level, pose) {
    return hpRegenPerTick(baseHpReg, con, level, pose) / HP_REGEN_PERIOD_SEC;
  }
  function mpRegenPerSec(baseMpReg, men, level, pose) {
    return mpRegenPerTick(baseMpReg, men, level, pose) / HP_REGEN_PERIOD_SEC;
  }
  function cpRegenPerSec(baseHpReg, con, level, pose) {
    return cpRegenPerTick(baseHpReg, con, level, pose) / HP_REGEN_PERIOD_SEC;
  }

  /**
   * pose из флагов персонажа: sit | run | walk | stand
   */
  function poseFromFlags(flags) {
    flags = flags || {};
    if (flags.sitting || flags.isSitting || flags.sit) return 'sit';
    if (flags.isMoving || flags.moving || flags.running) {
      return flags.walking || flags.isWalking ? 'walk' : 'run';
    }
    return 'stand';
  }

  /**
   * Лечение Interlude: Heal Amount = Base Power + √M.Atk
   * (Self Heal Power 42, Heal r1 = 49…)
   */
  /**
   * Heal Power (flat): Power + √C.Atk  (Interlude-style).
   */
  function healAmount(healPower, cAtk, healBonusMult) {
    healPower = Math.max(0, +healPower || 0);
    cAtk = Math.max(0, +cAtk || 0);
    healBonusMult = healBonusMult == null ? 1 : +healBonusMult;
    var amount = healPower + Math.sqrt(cAtk);
    return Math.max(1, Math.floor(amount * healBonusMult));
  }

  /**
   * % HP heal (technomancer etc.): maxHp × pct × MEN_mod + √C.Atk × k.
   * MEN_mod soft: MEN30 → 1.0; MEN50 → ~1.08; MEN20 → ~0.96 (clamp 0.85–1.35).
   * Так %хилы наладчика растут от MEN и C.Atk, не только от maxHp цели.
   */
  function healPercentAmount(maxHp, pct, cAtk, men, healBonusMult) {
    maxHp = Math.max(1, +maxHp || 1);
    pct = Math.max(0, +pct || 0);
    cAtk = Math.max(0, +cAtk || 0);
    men = +men || 30;
    healBonusMult = healBonusMult == null ? 1 : +healBonusMult;
    var menMod = 1 + (men - 30) * 0.004;
    if (menMod < 0.85) menMod = 0.85;
    if (menMod > 1.35) menMod = 1.35;
    var base = maxHp * pct * menMod;
    var flat = Math.sqrt(cAtk) * 0.9;
    return Math.max(1, Math.floor((base + flat) * healBonusMult));
  }

  /** C1 hit %: 75 + (Accuracy − Evasion) × 5, clamp 5–98. Acc=Eva → 75%. */
  function hitChance(accuracy, evasion) {
    var chance = HIT_BASE + ((+accuracy || 0) - (+evasion || 0)) * HIT_PER_DIFF;
    return clamp(chance, HIT_MIN, HIT_MAX);
  }

  /** Бросок попадания */
  function rollHit(accuracy, evasion) {
    return Math.random() * 100 < hitChance(accuracy, evasion);
  }

  /**
   * Phys crit %: L2 UI Critical~40 → 4% base; soft DEX; weapon type later.
   */
  /**
   * Phys crit rate (L2 stat scale):
   * Fists/Blunt/Wand: 40 base (44 @ DEX21)
   * Sword/Dual: 80 base (89 @ DEX21)
   * Dagger/Bow: 120 base (134 @ DEX21)
   */
  function critChancePct(dex, level, bonusPct, weaponClass) {
    var wBase = BASE_CRIT_PCT;
    if (weaponClass) {
      var cls = String(weaponClass);
      if (cls.indexOf('dagger') >= 0 || cls.indexOf('bow') >= 0) wBase = 120;
      else if (cls.indexOf('sword') >= 0 || cls.indexOf('dual') >= 0) wBase = 80;
      else if (cls.indexOf('pole') >= 0) wBase = 80;
    }
    var mod = (wBase === 40 && (+dex || 20) <= 21) ? 1.0 : dexModAtkSpd(dex);
    var critL2 = Math.floor(wBase * mod + (+bonusPct || 0));
    return clamp(critL2, 10, 500);
  }

  /** C1 magic crit %: ~1–3%, weakly WIT-dependent. */
  function magicCritChancePct(wit, bonusPct) {
    var base = MAGIC_CRIT_PCT;
    var w = Math.max(0, (+wit || 20) - 20);
    return clamp(base + w * 0.05 + (+bonusPct || 0), 0.5, 10);
  }

  function rollCrit(critPct) {
    if (critPct == null) critPct = 44;
    // В шкале L2 critPct = 44 отвечает 4.4% шанса
    var chancePct = critPct > 1 ? critPct / 10 : critPct * 100;
    return Math.random() * 100 < chancePct;
  }

  function applyCrit(damage, critMult) {
    return Math.floor(damage * (critMult == null ? BASE_CRIT_MULT : critMult));
  }

  /**
   * C1 shield: ~20% base front block if shield equipped;
   * + ShieldDef/(P.Def+ShieldDef) soft bonus. Cap 70.
   */
  function blockChance(shieldDef, pDef, bonusPct) {
    shieldDef = +shieldDef || 0;
    pDef = +pDef || 0;
    if (shieldDef <= 0 && !(bonusPct > 0)) return 0;
    var base = SHIELD_BASE_BLOCK;
    if (shieldDef > 0 && pDef + shieldDef > 0) {
      base += (shieldDef / (pDef + shieldDef)) * 30; // soft extra
    }
    return clamp(base + (+bonusPct || 0), 0, BLOCK_CAP);
  }

  function rollBlock(shieldDef, pDef, bonusPct) {
    return Math.random() * 100 < blockChance(shieldDef, pDef, bonusPct);
  }

  /**
   * C1 Atk. Spd. — оружие ЗАМЕНЯЕТ базу (не «+64» к кулакам).
   *   Итоговая Atk.Spd = Floor(База_типа_оружия × DEX_Mod × buffMult)
   *
   * Human Mystic DEX21 → DEX_Mod ≈ 1.1153 (таблица/скрины: 217→242, 275→306, 333→371…)
   * Отдельный ref от общего STAT_REF.DEX (run/acc), чтобы совпасть с C1 Atk.Spd.
   *
   * Базы C1 (тип оружия):
   *   fist 217 | 1h_blunt/wand 275 (Fast) | dagger 333 (Very Fast)
   *   1h_sword 247 (Normal) | 2h_staff 190 (Slow)
   */
  var WEAPON_BASE_ATK_SPD = {
    fist: 217,
    dagger: 333,
    '1h_blunt': 275,
    blunt: 275,
    wand: 275,
    '1h_sword': 247,
    sword: 247,
    '2h_staff': 190,
    '2h_blunt': 190,
    '2h_sword': 190,
    pole: 190,
    bow: 293,
    dual: 325,
    dualfist: 325
  };
  /** DEX ref so DEX21 → mod ≈ 1.1154 (Floor: 217→242, 275→306, 333→371, 247→275, 190→211) */
  var DEX_ATK_SPD_REF = 8.826;

  function dexModAtkSpd(dex) {
    return Math.pow(1.009, (+dex || 20) - DEX_ATK_SPD_REF);
  }

  function weaponBaseAtkSpd(weaponClass) {
    if (typeof weaponClass === 'number' && isFinite(weaponClass)) {
      return Math.max(1, weaponClass | 0);
    }
    var key = (weaponClass && String(weaponClass)) || 'fist';
    return WEAPON_BASE_ATK_SPD[key] != null ? WEAPON_BASE_ATK_SPD[key] : WEAPON_BASE_ATK_SPD.fist;
  }

  /**
   * C1 display / combat Atk.Spd integer.
   * @param {string|number} weaponClassOrBase - 'dagger' | '1h_blunt' | raw base
   * @param {number} dex
   * @param {number} [buffMult=1] - e.g. Magician's Movement +25% → 1.25
   */
  function atkSpdL2(weaponClassOrBase, dex, buffMult) {
    buffMult = buffMult == null ? 1.0 : +buffMult;
    if (!(buffMult > 0)) buffMult = 1;
    var base = weaponBaseAtkSpd(weaponClassOrBase);
    var mod = dexModAtkSpd(dex);
    return Math.max(1, Math.floor(base * mod * buffMult));
  }

  /**
   * Normalized mult for game loop: Atk.Spd / 333 (dagger-class ≈ 1.0 @ DEX21 bare).
   * Legacy signature attackSpeed(baseSpeed, dex, buffMult) still works:
   *   if baseSpeed looks like old mult (≤3), treat as fists base 217.
   */
  function attackSpeed(baseSpeed, dex, buffMult) {
    buffMult = buffMult == null ? 1.0 : +buffMult;
    var wBase = 217;
    if (typeof baseSpeed === 'string') {
      wBase = weaponBaseAtkSpd(baseSpeed);
    } else if (+baseSpeed > 3) {
      wBase = +baseSpeed;
    }
    return atkSpdL2(wBase, dex, buffMult) / 333;
  }

  /**
   * C1 / Classic MMO swing duration (sec) from Atk.Spd.
   * Reference: 450 / Atk.Spd (L2 standard melee interval ~1.1–2.1s).
   * Dagger 371 → ~1.21s | 1H Blunt 306 → ~1.47s | 2H Staff 211 → ~2.13s (264 robe → ~1.70s).
   */
  var BASE_SWING_REF = 450;
  function swingTimeSec(atkSpd) {
    atkSpd = Math.max(1, +atkSpd || 242);
    return BASE_SWING_REF / atkSpd;
  }

  /**
   * Casting Spd — Interlude Human Mystic:
   *   base = Floor(183 × WIT_Mod) → naked WIT20 = 166
   *   Spellcraft L1 in Robe Jacket + Pants: ×2.0 (+100%) → 333
   *   Devotion set: +15% on top → 166 × 2.0 × 1.15 ≈ 383
   *   Light/Heavy / naked: Spellcraft OFF → 166
   *
   * Args: wit, spellPct (0 | 1.0), setPct (0 | 0.15)
   * Also: mAtkSpd(wit, true/false, setPct) — bool = hasRobe with default Spellcraft 1.0 (+100%)
   * Current_Cast_Time = Base_Cast_Time × 333 / Casting_Spd
   */
  function mAtkSpd(wit, spellPct, setPct) {
    var witMod = statMod(wit, 'WIT');
    var base = Math.floor(183 * witMod); // 166 @ WIT 20
    var sp = 0;
    var st = +setPct || 0;
    if (typeof spellPct === 'boolean') {
      sp = spellPct ? 1.0 : 0; // hasRobe → Spellcraft L1 (+100% / ×2.0)
    } else {
      sp = +spellPct || 0;
    }
    // set bonus only meaningful with robe/spellcraft active
    if (sp <= 0) return Math.max(1, base);
    return Math.max(1, Math.round(183.55 * witMod * (1 + sp) * (1 + st)));
  }

  function castTimeSec(baseCastSec, castingSpd) {
    baseCastSec = +baseCastSec || 0;
    if (baseCastSec <= 0) return 0;
    castingSpd = Math.max(1, +castingSpd || 166);
    return baseCastSec * 333 / castingSpd;
  }

  // ─── Квантование боевых эффектов тиком 100 мс (10 Hz) ───
  var COMBAT_TICK_MS = 100;

  /**
   * Квантование миллисекунд к сетке тика (100 мс по умолчанию).
   * Округляет вверх (Math.ceil), гарантируя, что кулдауны и таймеры не истекут раньше тика.
   */
  function quantizeCombatMs(ms, tickMs) {
    var t = tickMs != null && +tickMs > 0 ? +tickMs : COMBAT_TICK_MS;
    var val = +ms || 0;
    if (val <= 0) return 0;
    return Math.max(t, Math.ceil(val / t) * t);
  }

  /**
   * Квантование секунд к сетке тика с возвратом в секундах.
   */
  function quantizeCombatSec(sec, tickMs) {
    var s = +sec || 0;
    if (s <= 0) return 0;
    return quantizeCombatMs(s * 1000, tickMs) / 1000;
  }

  /**
   * Квантованное время каста в миллисекундах (шаг 100 мс).
   */
  function castTimeMs(baseCastSec, castingSpd, tickMs) {
    var sec = castTimeSec(baseCastSec, castingSpd);
    return quantizeCombatMs(sec * 1000, tickMs);
  }

  /**
   * Квантованный интервал замаха/автоатаки оружия в миллисекундах (шаг 100 мс).
   */
  function swingTimeMs(atkSpd, tickMs) {
    var sec = swingTimeSec(atkSpd);
    return quantizeCombatMs(sec * 1000, tickMs);
  }

  /**
   * Расписание тиков DoT / HoT эффекта, квантованное шагом 100 мс.
   */
  function dotTickSchedule(durationMs, count, tickMs) {
    var dur = quantizeCombatMs(durationMs, tickMs);
    var cnt = Math.max(1, Math.floor(+count || 1));
    var rawEvery = Math.floor(dur / cnt);
    var every = quantizeCombatMs(rawEvery, tickMs);
    return {
      durationMs: dur,
      ticks: cnt,
      everyMs: every
    };
  }

  /**
   * Расчет шанса срыва каста при уроне (НЕ 100%).
   *   init = 15 + sqrt(13 × dmg) − (MEN_bonus×100 − 100)
   *   chance = clamp(init, 1, 99)%
   * MEN_bonus = 1.010^(MEN+0.060).
   * Слабый AA моба 1–5 почти не сбивает мага с MEN.
   */
  function calcCastCancel(dmg, men, maxHp) {
    dmg = Math.max(0, +dmg || 0);
    men = +men || 20;
    if (dmg <= 0) return { cancel: false, chance: 0 };

    // Расчет срыва каста, адаптированный под Project Steam:
    // higher baseline so low-level mobs actually pressure casters.
    var init = 22 + Math.sqrt(16 * dmg);
    var menBonus = statBonus(men, 'MEN');
    // MEN помогает снизить срыв каста
    init -= (menBonus * 100 - 100) * 0.55;

    // Tiny chips only: slight damp (curve stays increasing with dmg)
    if (maxHp > 0) {
      var pct = dmg / maxHp;
      if (pct < 0.015) init *= 0.75;
      else if (pct < 0.03) init *= 0.9;
    }

    // Floor scales with damage so low hits ~25–35%, mid ~40–55%, hard ~60%+
    var floor = 18 + Math.sqrt(Math.max(1, dmg)) * 4.2;
    init = Math.max(init, floor);

    var chance = Math.max(1, Math.min(88, init));
    return {
      cancel: Math.random() * 100 < chance,
      chance: chance
    };
  }

  function rollCastCancel(dmg, men, maxHp) {
    return calcCastCancel(dmg, men, maxHp).cancel;
  }

  function chargeSpeed(baseSpeed, wit, spellPct) {
    return mAtkSpd(wit, spellPct || 0, 0) / 333;
  }

  /** Run Speed L2: Floor(112 * DEX_Mod) → 121 @ DEX21 */
  function runSpeedL2(dex) {
    return Math.floor(112 * statMod(dex, 'DEX'));
  }

  /**
   * Шанс ленда дебафа (Interlude guide):
   *   Chance = Base_Chance × (INT_Mod / MEN_Mod) × (1 + (Lvl_atk − Lvl_tgt) / 10)
   * Base Curse:Weakness = 0.80. INT/MEN_Mod ≈ 0.8 + stat×0.005.
   * @returns {number} 0..1
   */
  function magicLandChance(baseChance, atkInt, defMen, atkLvl, defLvl) {
    baseChance = baseChance == null ? 0.8 : +baseChance;
    var intMod = Math.max(0.4, 0.8 + (+atkInt || 0) * 0.005);
    var menMod = Math.max(0.4, 0.8 + (+defMen || 0) * 0.005);
    var lvlFactor = 1 + ((+atkLvl || 1) - (+defLvl || 1)) / 10;
    return clamp(baseChance * (intMod / menMod) * lvlFactor, 0.05, 0.95);
  }

  function rollMagicLand(baseChance, atkInt, defMen, atkLvl, defLvl) {
    return Math.random() < magicLandChance(baseChance, atkInt, defMen, atkLvl, defLvl);
  }

  /**
   * Полный расчёт удара (авто / skill) — C1.
   * attacker: { pAtk, cAtk, accuracy, critRate, critDamage, dex, wit, level }
   * defender: { pDef, cDef, evasion, shieldDef, blockBonus, hasShield }
   * opts: {
   *   skillPower, damageType: 'physical'|'circuit',
   *   ignoreDef, forceCrit,
   *   shotMod (SS 2 / SPS 1.5 / BSPS 2),
   *   soulshot, spiritshot, blessedSpiritshot (bool → shotMod)
   * }
   */
  function resolveHit(attacker, defender, opts) {
    opts = opts || {};
    attacker = attacker || {};
    defender = defender || {};

    var dtype = opts.damageType || 'physical';

    // Механика «Смертельного Отражения» (Аудит Фазы 1: quests_and_gamedesign_final.md)
    // Персонаж БЕЗ 1-Й ПРОФЕССИИ (classTier < 1) не способен нанести урон боссам 2-го и 3-го эшелона.
    // Любой удар отражается аварийным разрядом сверхдавления — 99 999 урона атакующему.
    var isHighTierRaid = !!(defender.eliteRaid || defender.epicRaid || defender.isEliteRaid || defender.isEpicRaid);
    var attackerTier = attacker.classTier != null ? +attacker.classTier : (attacker.tier != null ? +attacker.tier : null);
    if (isHighTierRaid && attackerTier != null && attackerTier < 1) {
      return {
        damage: 0,
        missed: false,
        crit: false,
        blocked: false,
        damageType: dtype,
        lethalFeedback: true,
        feedbackDamage: 99999
      };
    }
    // Magical skills: no Accuracy check in classic L2 (always "hit" then resist land)
    var acc = attacker.accuracy != null ? attacker.accuracy : (20 + (attacker.level || 1) * 1.5);
    var eva = defender.evasion != null ? defender.evasion : (15 + (defender.level || 1) * 1.2);

    if (dtype !== 'circuit' && dtype !== 'magic') {
      if (!rollHit(acc, eva)) {
        return { damage: 0, missed: true, crit: false, blocked: false, damageType: dtype, lethalFeedback: false };
      }
    }

    var power = opts.skillPower != null ? opts.skillPower : 1.0;
    var ignore = clamp(+opts.ignoreDef || 0, 0, 0.95);

    // Shot mult C1
    var shotMod = opts.shotMod != null ? +opts.shotMod : 1.0;
    if (opts.soulshot) shotMod = SOULSHOT_MULT;
    if (opts.spiritshot) shotMod = SPIRITSHOT_MULT;
    if (opts.blessedSpiritshot) shotMod = BLESSED_SPIRITSHOT_MULT;

    var dmg;
    var pDefEff = (defender.pDef || 0) * (1 - ignore);

    // Shield block first for physical (C1: ~20% + shield def)
    var blocked = false;
    var hasShield = !!(defender.hasShield || defender.shieldDef > 0);
    if (dtype === 'physical' && hasShield) {
      if (rollBlock(defender.shieldDef || 1, defender.pDef || 0, defender.blockBonus || 0)) {
        blocked = true;
        // Damage uses P.Def + Shield P.Def
        pDefEff = ((defender.pDef || 0) + (defender.shieldDef || 0)) * (1 - ignore);
      }
    }

    if (dtype === 'circuit' || dtype === 'magic') {
      var cAtk = attacker.cAtk != null ? attacker.cAtk : (attacker.mAtk != null ? attacker.mAtk : attacker.pAtk || 1);
      var cDef = defender.cDef != null ? defender.cDef : (defender.mDef != null ? defender.mDef : defender.pDef || 1);
      cDef = Math.max(1, cDef * (1 - ignore));
      dmg = circuitDamage(cAtk, cDef, power, shotMod);
    } else {
      var pAtk = attacker.pAtk || 1;
      dmg = physicalDamage(pAtk, Math.max(1, pDefEff), power, shotMod);
    }

    // Crit: phys ×2 (DEX), magic ×3 (~1–3%)
    var isCrit = false;
    if (opts.forceCrit === true) isCrit = true;
    else if (opts.forceCrit === false) isCrit = false;
    else if (dtype === 'circuit' || dtype === 'magic') {
      var mCrit = attacker.magicCritRate != null
        ? attacker.magicCritRate
        : magicCritChancePct(attacker.wit, attacker.magicCritBonus || 0);
      if (mCrit > 0 && mCrit <= 1) mCrit *= 100;
      isCrit = rollCrit(mCrit);
      if (isCrit) dmg = applyCrit(dmg, MAGIC_CRIT_MULT);
    } else {
      var critPct = attacker.critRate;
      if (critPct == null) {
        critPct = critChancePct(attacker.dex, attacker.level, attacker.critBonus || 0);
      }
      if (critPct > 0 && critPct <= 1) critPct = critPct * 100;
      isCrit = rollCrit(critPct);
      if (isCrit) {
        dmg = applyCrit(dmg, attacker.critDamage != null ? attacker.critDamage : BASE_CRIT_MULT);
      }
    }

    return {
      damage: Math.max(1, dmg),
      missed: false,
      crit: isCrit,
      blocked: blocked,
      damageType: dtype,
      skillPower: power,
      shotMod: shotMod,
      shieldBlockDelay: blocked, // client/server: cancel cast on shield block
      lethalFeedback: false
    };
  }

  /**
   * Упрощённый бросок (совместимость с game-rules.rollDamage).
   */
  function rollDamage(aAtk, dDef, critChance, opts) {
    opts = opts || {};
    var dtype = opts.damageType || 'physical';
    var power = opts.skillPower != null ? opts.skillPower : 1.0;
    var shot = opts.shotMod != null ? opts.shotMod : 1.0;
    var dmg = dtype === 'circuit'
      ? circuitDamage(aAtk, dDef, power, shot)
      : physicalDamage(aAtk, dDef, power, shot);

    var critPct = critChance;
    if (critPct == null) critPct = dtype === 'circuit' ? MAGIC_CRIT_PCT : 15;
    if (critPct > 0 && critPct <= 1) critPct = critPct * 100;

    var crit = rollCrit(critPct);
    if (crit) {
      dmg = applyCrit(dmg, opts.critMult || (dtype === 'circuit' ? MAGIC_CRIT_MULT : BASE_CRIT_MULT));
    }

    return { dmg: Math.max(1, dmg), crit: crit, damage: Math.max(1, dmg), isCrit: crit };
  }

  /**
   * Конверсия PRIMARY → combat (C1 Human scale).
   * Fighter L1 (STR40 CON43): P.Atk ~18–22, HP ~140–160.
   * Mystic L1 (INT41 MEN39): C.Atk ~9–12 bare, C.Def ~35–45
   *   (под L2j magic: 91×√M.Atk×Power/M.Def — иначе oneshot при M.Atk 30+).
   */
  /**
   * Accuracy / Evasion (Interlude JSON): Floor(Sqrt(DEX) * 6) + Level
   * L1 DEX21 → 28.
   */
  function accuracyFromStats(dex, level, bonus) {
    return Math.floor(Math.sqrt(Math.max(1, +dex || 1)) * 6) + Math.max(1, +level || 1) + (+bonus || 0);
  }

  function evasionFromStats(dex, level, bonus) {
    return Math.floor(Math.sqrt(Math.max(1, +dex || 1)) * 6) + Math.max(1, +level || 1) + (+bonus || 0);
  }

  /**
   * Расчет P.Atk:
   *   weapon SET pAtk (0x08) replaces class base when equipped
   *   P.Atk = floor( baseOrWeapon × STR_bonus × levelMod × mastery% )
   * basePAtk: Human Mage 3 / Fighter 4
   */
  function pAtkFromStats(str, level, weaponAtk, mult, basePAtk) {
    mult = mult == null ? 1 : +mult;
    basePAtk = basePAtk != null ? +basePAtk : 3;
    weaponAtk = +weaponAtk || 0;
    var base = weaponAtk > 0 ? (basePAtk - 1 + weaponAtk) : basePAtk;
    var v = base * statBonus(str, 'STR') * levelMod(level) * mult;
    return Math.max(1, Math.round(v));
  }

  /**
   * Расчет P.Def:
   *   init = basePDef − nakedBodyPartsEquipped + ΣarmorPDef
   *   P.Def = floor(init × levelMod)
   * CON не множит. Naked sub: head12, chest 15/31, legs 8/18, gloves8, feet7.
   * armorDef здесь уже = Σitem − nakedSub (если gearFromEquip), иначе raw + nakedSubArg.
   * basePDef: Mage 54 / Fighter 80
   */
  function pDefFromStats(con, str, level, armorDef, mult, basePDef, nakedSub) {
    mult = mult == null ? 1 : +mult;
    basePDef = basePDef != null ? +basePDef : 54;
    armorDef = +armorDef || 0;
    nakedSub = +nakedSub || 0;
    // con/str reserved for API compat
    var init = basePDef - nakedSub + armorDef;
    if (init < 1) init = 1;
    var v = init * levelMod(level) * mult;
    return Math.max(1, Math.floor(v));
  }

  /**
   * Расчет M.Atk / C.Atk:
   *   weapon SET mAtk replaces base; × levelMod² × INT_bonus²
   * baseMAtk: Human Mage/Fighter 6
   */
  function cAtkFromStats(intStat, level, toolAtk, mult, baseMAtk) {
    mult = mult == null ? 1 : +mult;
    baseMAtk = baseMAtk != null ? +baseMAtk : 6;
    toolAtk = +toolAtk || 0;
    var base = toolAtk > 0 ? toolAtk : baseMAtk;
    var lm = levelMod(level);
    var ib = statBonus(intStat, 'INT');
    var v = base * lm * lm * ib * ib * mult;
    return Math.max(1, Math.floor(v));
  }

  /**
   * Расчет M.Def / C.Def:
   *   init = baseMDef − nakedJewelry + ΣgearMDef
   *   M.Def = floor(init × MEN_bonus × levelMod)
   * Jewelry naked: neck13, ear9×2, ring5×2. baseMDef: 41
   */
  function cDefFromStats(men, intStat, level, armor, mult, baseMDef, nakedSub) {
    mult = mult == null ? 1 : +mult;
    baseMDef = baseMDef != null ? +baseMDef : 41;
    armor = +armor || 0;
    nakedSub = +nakedSub || 0;
    var init = baseMDef - nakedSub + armor;
    if (init < 1) init = 1;
    var v = init * statBonus(men, 'MEN') * levelMod(level) * mult;
    return Math.max(1, Math.floor(v));
  }

  /**
   * Канонические таблицы hpTable/mpTable L1–40.
   * maxHp = floor(hpTable[lv-1] × CON_bonus)
   * maxMp = floor(mpTable[lv-1] × MEN_bonus)
   * До 20 лвл таблицы 1-й профессии = base; с 21 — разветвление (Warrior/Knight/…).
   */
  var VITALS_TABLES = {
    // Human Fighter (id 0) — Оператор
    fighter: {
      hp: [80,91.83,103.79,115.88,128.1,140.45,152.93,165.54,178.28,191.15,204.15,217.28,230.54,243.93,257.45,271.1,284.88,298.79,312.83,327,341.3,355.73,370.29,384.98,399.8,414.75,429.83,445.04,460.38,475.85,491.45,507.18,523.04,539.03,555.15,571.4,587.78,604.29,620.93,637.7],
      mp: [30,35.46,40.98,46.56,52.2,57.9,63.66,69.48,75.36,81.3,87.3,93.36,99.48,105.66,111.9,118.2,124.56,130.98,137.46,144,150.6,157.26,163.98,170.76,177.6,184.5,191.46,198.48,205.56,212.7,219.9,227.16,234.48,241.86,249.3,256.8,264.36,271.98,279.66,287.4]
    },
    // Warrior (id 1) — Разрушитель / DD
    warrior: {
      hp: [80,91.83,103.79,115.88,128.1,140.45,152.93,165.54,178.28,191.15,204.15,217.28,230.54,243.93,257.45,271.1,284.88,298.79,312.83,327,360,393.3,426.9,460.8,495,529.5,564.3,599.4,634.8,670.5,706.5,742.8,779.4,816.3,853.5,891,928.8,966.9,1005.3,1044],
      mp: [30,35.46,40.98,46.56,52.2,57.9,63.66,69.48,75.36,81.3,87.3,93.36,99.48,105.66,111.9,118.2,124.56,130.98,137.46,144,153.9,163.89,173.97,184.14,194.4,204.75,215.19,225.72,236.34,247.05,257.85,268.74,279.72,290.79,301.95,313.2,324.54,335.97,347.49,359.1]
    },
    // Human Knight (id 4) — Механик / tank
    knight: {
      hp: [80,91.83,103.79,115.88,128.1,140.45,152.93,165.54,178.28,191.15,204.15,217.28,230.54,243.93,257.45,271.1,284.88,298.79,312.83,327,356.7,386.67,416.91,447.42,478.2,509.25,540.57,572.16,604.02,636.15,668.55,701.22,734.16,767.37,800.85,834.6,868.62,902.91,937.47,972.3],
      mp: [30,35.46,40.98,46.56,52.2,57.9,63.66,69.48,75.36,81.3,87.3,93.36,99.48,105.66,111.9,118.2,124.56,130.98,137.46,144,153.9,163.89,173.97,184.14,194.4,204.75,215.19,225.72,236.34,247.05,257.85,268.74,279.72,290.79,301.95,313.2,324.54,335.97,347.49,359.1]
    },
    // Rogue (id 7) — Стрелок
    rogue: {
      hp: [80,91.83,103.79,115.88,128.1,140.45,152.93,165.54,178.28,191.15,204.15,217.28,230.54,243.93,257.45,271.1,284.88,298.79,312.83,327,354.5,382.25,410.25,438.5,467,495.75,524.75,554,583.5,613.25,643.25,673.5,704,734.75,765.75,797,828.5,860.25,892.25,924.5],
      mp: [30,35.46,40.98,46.56,52.2,57.9,63.66,69.48,75.36,81.3,87.3,93.36,99.48,105.66,111.9,118.2,124.56,130.98,137.46,144,153.9,163.89,173.97,184.14,194.4,204.75,215.19,225.72,236.34,247.05,257.85,268.74,279.72,290.79,301.95,313.2,324.54,335.97,347.49,359.1]
    },
    // Human Mage (id 10) — Инженер
    mage: {
      hp: [101,116.47,132.11,147.92,163.9,178.0,196.37,212.86,229.52,246.35,263.35,280.52,297.86,315.37,333.05,350.9,368.92,387.11,405.47,424,442.7,461.57,480.61,499.82,519.2,538.75,558.47,578.36,598.42,618.65,639.05,659.62,680.36,701.27,722.35,743.6,765.02,786.61,808.37,830.3],
      mp: [40,47.28,54.64,62.08,69.6,97.28,105.48,113.64,121.48,129.4,137.4,145.48,153.64,161.88,170.2,178.6,187.08,195.64,204.28,213,221.8,230.68,239.64,248.68,257.8,267,276.28,285.64,295.08,304.6,314.2,323.88,333.64,343.48,353.4,363.4,373.48,383.64,393.88,404.2]
    },
    // Human Wizard (id 11) — Конструктор
    wizard: {
      hp: [101,116.47,132.11,147.92,163.9,180.05,196.37,212.86,229.52,246.35,263.35,280.52,297.86,315.37,333.05,350.9,368.92,387.11,405.47,424,451.5,479.25,507.25,535.5,564,592.75,621.75,651,680.5,710.25,740.25,770.5,801,831.75,862.75,894,925.5,957.25,989.25,1021.5],
      mp: [40,47.28,54.64,62.08,69.6,77.2,84.88,92.64,100.48,108.4,116.4,124.48,132.64,140.88,149.2,157.6,166.08,174.64,183.28,192,205.2,218.52,231.96,245.52,259.2,273,286.92,300.96,315.12,329.4,343.8,358.32,372.96,387.72,402.6,417.6,432.72,447.96,463.32,478.8]
    },
    // Cleric (id 15) — Наладчик / healer
    cleric: {
      hp: [101,116.47,132.11,147.92,163.9,180.05,196.37,212.86,229.52,246.35,263.35,280.52,297.86,315.37,333.05,350.9,368.92,387.11,405.47,424,458.1,492.51,527.23,562.26,597.6,633.25,669.21,705.48,742.06,778.95,816.15,853.66,891.48,929.61,968.05,1006.8,1045.86,1085.23,1124.91,1164.9],
      mp: [40,47.28,54.64,62.08,69.6,77.2,84.88,92.64,100.48,108.4,116.4,124.48,132.64,140.88,149.2,157.6,166.08,174.64,183.28,192,205.2,218.52,231.96,245.52,259.2,273,286.92,300.96,315.12,329.4,343.8,358.32,372.96,387.72,402.6,417.6,432.72,447.96,463.32,478.8]
    }
  };

  /** База HP/MP из канонической таблицы (до CON/MEN mul). level 1-based. */
  function tableBaseAtLevel(tableKey, level, kind) {
    var t = VITALS_TABLES[tableKey] || VITALS_TABLES.fighter;
    var arr = kind === 'mp' ? t.mp : t.hp;
    if (!arr || !arr.length) return kind === 'mp' ? 30 : 80;
    var idx = Math.max(0, Math.min(arr.length - 1, (Math.max(1, +level || 1) | 0) - 1));
    return +arr[idx] || 0;
  }

  /** Расчет Max HP: floor(baseHp × CON_bonus) */
  function maxHpFromTable(baseHp, con) {
    return Math.max(1, Math.floor((+baseHp || 0) * statBonus(con, 'CON')));
  }

  /** Расчет Max MP: floor(baseMp × MEN_bonus) */
  function maxMpFromTable(baseMp, men) {
    return Math.max(1, Math.floor((+baseMp || 0) * statBonus(men, 'MEN')));
  }

  /**
   * Max HP (C1 tables preferred).
   * opts.tableKey: fighter|warrior|knight|rogue|mage|wizard|cleric
   * mult ignored when tableKey set (tables already class-specific).
   */
  function maxHpFromStats(con, level, mult, tableKey) {
    if (tableKey && VITALS_TABLES[tableKey]) {
      return maxHpFromTable(tableBaseAtLevel(tableKey, level, 'hp'), con);
    }
    mult = mult == null ? 1 : mult;
    // legacy fallback (не C1)
    return Math.floor((50 + (+con || 0) * 2.2 + (+level || 1) * 10) * mult);
  }

  /** Max Energy/MP — mpTable × MEN. */
  function maxEnergyFromStats(men, level, mult, tableKey) {
    if (tableKey && VITALS_TABLES[tableKey]) {
      return maxMpFromTable(tableBaseAtLevel(tableKey, level, 'mp'), men);
    }
    mult = mult == null ? 1 : mult;
    return Math.floor((28 + (+men || 0) * 1.15 + (+level || 1) * 4.2) * mult);
  }

  /**
   * EXP по разнице уровней (hp_mp_sp_exp_formulas.md).
   * d = mobLevel − playerLevel:
   *  - моб выше: полный (или лёгкий бонус)
   *  - перс выше моба на 1–5: 100%; 6→83.3%; …; 11+ → 0%
   */
  function expModifier(playerLevel, mobLevel) {
    var pl = +playerLevel || 1;
    var ml = +mobLevel || 1;
    var above = pl - ml; // перс выше моба
    if (above >= 11) return 0;
    if (above >= 10) return 0.402;
    if (above >= 9) return 0.482;
    if (above >= 8) return 0.579;
    if (above >= 7) return 0.694;
    if (above >= 6) return 0.833;
    if (above >= 1) return 1.0;
    // моб выше или равный
    var d = ml - pl;
    if (d >= 9) return 1.50;
    if (d >= 6) return 1.30;
    if (d >= 3) return 1.10;
    return 1.0;
  }

  /** Смерть: −4% от EXP до следующего уровня (не от total). Может вызвать delevel. */
  var DEATH_EXP_LOSS_PCT = 0.04;
  function deathExpLoss(expToNext) {
    return Math.floor(Math.max(0, +expToNext || 0) * DEATH_EXP_LOSS_PCT);
  }

  /**
   * Full L2 death EXP apply with delevel (prefer EXP table helper when available).
   * @param {number} level
   * @param {number} exp - current bar
   * @param {number} [pct]
   * @param {{ expToNextRaw?: function, applyDeathExpLoss?: function }|null} [expTable]
   */
  function applyDeathExp(level, exp, pct, expTable) {
    var rate = pct != null ? +pct : DEATH_EXP_LOSS_PCT;
    if (expTable && typeof expTable.applyDeathExpLoss === 'function') {
      return expTable.applyDeathExpLoss(level, exp, rate);
    }
    // fallback without table: lose from bar only (no delevel data)
    var loss = deathExpLoss(0); // unknown toNext
    var bar = Math.max(0, Math.floor(+exp || 0));
    var taken = Math.min(bar, Math.max(0, Math.floor(bar * rate)));
    return {
      level: Math.max(1, level | 0),
      exp: Math.max(0, bar - taken),
      loss: taken,
      delevels: 0,
      expToNext: 0
    };
  }

  return {
    PHYS_NORM: PHYS_NORM,
    CIRCUIT_NORM: CIRCUIT_NORM,
    ABSOLUTE_POWER_MIN: ABSOLUTE_POWER_MIN,
    CIRCUIT_REL_POWER_REF: CIRCUIT_REL_POWER_REF,
    BASE_CRIT_MULT: BASE_CRIT_MULT,
    MAGIC_CRIT_MULT: MAGIC_CRIT_MULT,
    MAGIC_CRIT_PCT: MAGIC_CRIT_PCT,
    BASE_CRIT_PCT: BASE_CRIT_PCT,
    SOULSHOT_MULT: SOULSHOT_MULT,
    SPIRITSHOT_MULT: SPIRITSHOT_MULT,
    BLESSED_SPIRITSHOT_MULT: BLESSED_SPIRITSHOT_MULT,
    SHIELD_BASE_BLOCK: SHIELD_BASE_BLOCK,
    BLOCK_CAP: BLOCK_CAP,
    isAbsoluteSkillPower: isAbsoluteSkillPower,
    physicalDamage: physicalDamage,
    circuitDamage: circuitDamage,
    physLevelMod: physLevelMod,
    mpEquipMod: mpEquipMod,
    mpLevelPenalty: mpLevelPenalty,
    mpCostFinal: mpCostFinal,
    magicCritChancePct: magicCritChancePct,
    healAmount: healAmount,
    healPercentAmount: healPercentAmount,
    // aliases (legacy / L2 naming in comments only)
    magicDamage: circuitDamage,
    hitChance: hitChance,
    rollHit: rollHit,
    critChancePct: critChancePct,
    rollCrit: rollCrit,
    applyCrit: applyCrit,
    blockChance: blockChance,
    rollBlock: rollBlock,
    attackSpeed: attackSpeed,
    atkSpdL2: atkSpdL2,
    weaponBaseAtkSpd: weaponBaseAtkSpd,
    dexModAtkSpd: dexModAtkSpd,
    swingTimeSec: swingTimeSec,
    WEAPON_BASE_ATK_SPD: WEAPON_BASE_ATK_SPD,
    chargeSpeed: chargeSpeed,
    mAtkSpd: mAtkSpd,
    castingSpd: mAtkSpd,
    castTimeSec: castTimeSec,
    COMBAT_TICK_MS: COMBAT_TICK_MS,
    quantizeCombatMs: quantizeCombatMs,
    quantizeCombatSec: quantizeCombatSec,
    castTimeMs: castTimeMs,
    swingTimeMs: swingTimeMs,
    dotTickSchedule: dotTickSchedule,
    calcCastCancel: calcCastCancel,
    rollCastCancel: rollCastCancel,
    statMod: statMod,
    statBonus: statBonus,
    STAT_REF: STAT_REF,
    STAT_BONUS: STAT_BONUS,
    levelMod: levelMod,
    regenPoseMult: regenPoseMult,
    poseFromFlags: poseFromFlags,
    hpRegenPerTick: hpRegenPerTick,
    mpRegenPerTick: mpRegenPerTick,
    cpRegenPerTick: cpRegenPerTick,
    hpRegenPerSec: hpRegenPerSec,
    mpRegenPerSec: mpRegenPerSec,
    cpRegenPerSec: cpRegenPerSec,
    REGEN_POSE: REGEN_POSE,
    HP_REGEN_PERIOD_SEC: HP_REGEN_PERIOD_SEC,
    DEFAULT_BASE_HP_REG: DEFAULT_BASE_HP_REG,
    DEFAULT_BASE_MP_REG: DEFAULT_BASE_MP_REG,
    DEX_ATK_SPD_REF: DEX_ATK_SPD_REF,
    expModifier: expModifier,
    deathExpLoss: deathExpLoss,
    applyDeathExp: applyDeathExp,
    DEATH_EXP_LOSS_PCT: DEATH_EXP_LOSS_PCT,
    runSpeedL2: runSpeedL2,
    magicLandChance: magicLandChance,
    rollMagicLand: rollMagicLand,
    resolveHit: resolveHit,
    rollDamage: rollDamage,
    accuracyFromStats: accuracyFromStats,
    evasionFromStats: evasionFromStats,
    pAtkFromStats: pAtkFromStats,
    pDefFromStats: pDefFromStats,
    cAtkFromStats: cAtkFromStats,
    cDefFromStats: cDefFromStats,
    maxHpFromStats: maxHpFromStats,
    maxEnergyFromStats: maxEnergyFromStats,
    maxHpFromTable: maxHpFromTable,
    maxMpFromTable: maxMpFromTable,
    tableBaseAtLevel: tableBaseAtLevel,
    VITALS_TABLES: VITALS_TABLES,
    clamp: clamp,
    L2_MELEE_REF: L2_MELEE_REF,
    GAME_MELEE_REF: GAME_MELEE_REF,
    GAME_MAGIC_CAST: GAME_MAGIC_CAST,
    GAME_MAGIC_EFFECT: GAME_MAGIC_EFFECT,
    GAME_BUFF_CAST: GAME_BUFF_CAST,
    GAME_BUFF_EFFECT: GAME_BUFF_EFFECT,
    GAME_BOW: GAME_BOW,
    L2_RANGE_K: L2_RANGE_K,
    fromL2Range: fromL2Range,
    distXZ: distXZ
  };
});
