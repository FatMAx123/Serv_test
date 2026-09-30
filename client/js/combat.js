// ============================================
// PROJECT STEAM: ORIGINS - COMBAT.JS
// Бой в точности по классическим правилам C1
// P.Damage / C.Damage (схемы), Hit, Crit, Block
// Источник формул: shared/l2-combat.js (combat-rules.js)
// ============================================

(function (root) {
  'use strict';

  function getL2() {
    if (typeof COMBAT_RULES !== 'undefined') return COMBAT_RULES;
    if (typeof L2_COMBAT !== 'undefined') return L2_COMBAT;
    if (root.COMBAT_RULES) return root.COMBAT_RULES;
    if (root.L2_COMBAT) return root.L2_COMBAT;
    return null;
  }

  /**
   * Собрать combat-пакет атакующего из player / mob / derived.
   */
  function packAttacker(entity) {
    if (!entity) return { pAtk: 1, cAtk: 1, accuracy: 20, critRate: 4, level: 1, dex: 20 };
    var d = entity.derived || {};
    var pAtk = entity.pAtk != null ? entity.pAtk
      : (entity.attackPower != null ? entity.attackPower
        : (d.pAtk != null ? d.pAtk : 10));
    var cAtk = entity.cAtk != null ? entity.cAtk
      : (entity.mAtk != null ? entity.mAtk
        : (d.cAtk != null ? d.cAtk : (d.mAtk != null ? d.mAtk : Math.floor(pAtk * 0.6))));
    var acc = entity.accuracy != null ? entity.accuracy
      : (d.accuracy != null ? d.accuracy : (20 + (entity.level || 1) * 1.5));
    var crit = entity.critRate != null ? entity.critRate
      : (entity.critChance != null ? entity.critChance
        : (d.critRate != null ? d.critRate : 15));
    // fraction → percent
    if (crit > 0 && crit <= 1) crit = crit * 100;

    var pb = entity.passiveBonuses || {};
    if (pb.attackPercent) pAtk = Math.floor(pAtk * (1 + pb.attackPercent));
    if (pb.critChance) crit += (pb.critChance <= 1 ? pb.critChance * 100 : pb.critChance);

    var primary = entity.primary || (entity.stats && entity.stats.primary) || {};
    return {
      pAtk: pAtk,
      cAtk: cAtk,
      mAtk: cAtk,
      accuracy: acc,
      critRate: crit,
      critDamage: (entity.critDamage || d.critDamage || 2.0) + (pb.critDamage || 0),
      level: entity.level || 1,
      dex: primary.DEX || entity.dex || 20,
      wit: primary.WIT || entity.wit || 20
    };
  }

  function packDefender(entity) {
    if (!entity) return { pDef: 0, cDef: 0, evasion: 15, level: 1 };
    var d = entity.derived || {};
    var pDef = entity.pDef != null ? entity.pDef
      : (entity.defense != null ? entity.defense
        : (d.pDef != null ? d.pDef : 0));
    var cDef = entity.cDef != null ? entity.cDef
      : (entity.mDef != null ? entity.mDef
        : (d.cDef != null ? d.cDef : (d.mDef != null ? d.mDef : Math.floor(pDef * 0.8))));
    var eva = entity.evasion != null ? entity.evasion
      : (d.evasion != null ? d.evasion : (15 + (entity.level || 1) * 1.2));
    var pb = entity.passiveBonuses || {};
    if (pb.defensePercent) pDef = Math.floor(pDef * (1 + pb.defensePercent));
    if (pb.evasion) eva += (pb.evasion <= 1 ? pb.evasion * 100 : pb.evasion);

    var hasShield = !!(entity.hasShield || entity.shieldDef || (d && d.hasShield));
    return {
      pDef: pDef,
      cDef: cDef,
      mDef: cDef,
      evasion: eva,
      hasShield: hasShield,
      shieldDef: entity.shieldDef || d.shieldDef || 0,
      blockBonus: entity.blockBonus || d.blockRate || 0,
      level: entity.level || 1
    };
  }

  class CombatSystem {
    constructor() {
      this.L2 = getL2();
    }

    /**
     * Автоатака / умение.
     * @param {object} attacker
     * @param {object} defender
     * @param {number|object} multOrOpts — skillPower (number) или { skillPower, damageType, ignoreDef, critBonus }
     */
    calculateDamage(attacker, defender, multOrOpts) {
      var opts = {};
      if (typeof multOrOpts === 'number') {
        opts.skillPower = multOrOpts;
        opts.damageType = 'physical';
      } else if (multOrOpts && typeof multOrOpts === 'object') {
        opts = multOrOpts;
      } else {
        opts = { skillPower: 1.0, damageType: 'physical' };
      }

      var atk = packAttacker(attacker);
      var def = packDefender(defender);

      if (opts.critBonus) {
        atk.critRate = (atk.critRate || 0) + (opts.critBonus <= 1 ? opts.critBonus * 100 : opts.critBonus);
      }

      // buffs на атаку
      if (attacker && attacker.buffs && attacker.buffs.forEach) {
        attacker.buffs.forEach(function (b) {
          if (b.effect && b.effect.attackMult) {
            atk.pAtk = Math.floor(atk.pAtk * b.effect.attackMult);
            atk.cAtk = Math.floor(atk.cAtk * b.effect.attackMult);
          }
        });
      }
      if (attacker && attacker.tempDamageBoost && attacker.tempDamageBoost !== 1) {
        atk.pAtk = Math.floor(atk.pAtk * attacker.tempDamageBoost);
        atk.cAtk = Math.floor(atk.cAtk * attacker.tempDamageBoost);
      }

      // defense buffs
      if (defender && defender.buffs && defender.buffs.forEach) {
        defender.buffs.forEach(function (b) {
          if (b.effect && b.effect.defenseMult) {
            def.pDef = Math.floor(def.pDef * b.effect.defenseMult);
            def.cDef = Math.floor(def.cDef * b.effect.defenseMult);
          }
          if (b.effect && b.effect.evasionBonus) {
            def.evasion += (b.effect.evasionBonus <= 1 ? b.effect.evasionBonus * 100 : b.effect.evasionBonus);
          }
        });
      }

      var L2 = this.L2 || getL2();
      if (L2 && L2.resolveHit) {
        var r = L2.resolveHit(atk, def, {
          skillPower: opts.skillPower != null ? opts.skillPower : 1.0,
          damageType: opts.damageType || 'physical',
          ignoreDef: opts.ignoreDef || 0
        });
        return {
          damage: r.damage,
          isCrit: r.crit,
          crit: r.crit,
          missed: r.missed,
          blocked: r.blocked,
          damageType: r.damageType
        };
      }

      // fallback (если shared не загружен)
      var base = (atk.pAtk || 10) * (opts.skillPower || 1);
      var dmg = base * (base / (base + (def.pDef || 0) + 1));
      var crit = Math.random() < ((atk.critRate || 15) / 100);
      if (crit) dmg *= 2;
      dmg *= 0.85 + Math.random() * 0.3;
      return { damage: Math.max(1, Math.floor(dmg)), isCrit: crit, crit: crit, missed: false, blocked: false };
    }

    /** Совместимость со старым API: mult = skill power */
    physicalHit(attacker, defender, skillPower) {
      return this.calculateDamage(attacker, defender, { skillPower: skillPower || 1, damageType: 'physical' });
    }

    circuitHit(attacker, defender, skillPower) {
      return this.calculateDamage(attacker, defender, { skillPower: skillPower || 1, damageType: 'circuit' });
    }

    hitChance(attacker, defender) {
      var L2 = this.L2 || getL2();
      var atk = packAttacker(attacker);
      var def = packDefender(defender);
      if (L2 && L2.hitChance) return L2.hitChance(atk.accuracy, def.evasion);
      return 80;
    }
  }

  root.CombatSystem = CombatSystem;
  root.packCombatAttacker = packAttacker;
  root.packCombatDefender = packDefender;
})(typeof window !== 'undefined' ? window : globalThis);
