'use strict';

/**
 * Player Dots, Vitals & Regeneration Handler (L2-like Formulas)
 * 
 * Manages:
 * - Active DoTs ticking on players (scaled by maxHp & level limit)
 * - Regeneration of HP & Energy based on:
 *   - Character template base values
 *   - CON / MEN modifiers
 *   - Pose multipliers: sit (1.5x), stand (1.1x), walk (1.0x), run (0.7x)
 *   - Passive skills & equipment bonuses
 *   - Weight penalty (no regen when overloaded >= 66.7%)
 *   - Night rest bonus (+20% while sitting at night)
 *   - Vitals state synchronization
 */

function createPlayerRegenHandler(deps) {
  const {
    BR,
    isPlayerImmortal,
    onPlayerHit,
    onPlayerDeath,
    send,
    broadcastAOI,
    cosmeticsPublic,
    saveProfileNow,
    playerWeightState,
    passiveBonuses,
    L2,
    isNight,
    invalidateCombatPack,
    pushEffects,
    pushCombatStats
  } = deps;

  function tickPlayerDots(p, dtSec) {
    if (!p || p.dead || p.hp <= 0) return;
    if (!p.debuffs || p.debuffs.length === 0) return;
    const now = Date.now();
    p.debuffs = BR.prune(p.debuffs, now);
    const list = BR.dots(p.debuffs, now);
    if (!list.length) return;
    if (isPlayerImmortal(p)) return;
    let total = 0;
    let last = null;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      e.tickAcc = (e.tickAcc || 0) + dtSec;
      if (e.tickAcc < 1) continue;
      e.tickAcc -= 1;
      const frac = Math.min(0.12, Math.max(0.01, +e.dps));
      let dmg = Math.max(1, Math.floor((p.maxHp || 100) * frac));
      if ((p.level || 1) <= 8) dmg = Math.min(dmg, 18);
      total += dmg;
      last = e;
    }
    if (total <= 0) return;
    p.hp = Math.max(0, p.hp - total);
    onPlayerHit(p, total);
    send(p, {
      t: 'hit',
      dmg: total,
      crit: false,
      by: 'dot',
      skillId: (last && last.id) || 'dot',
      skillName: (last && last.name) || 'DoT',
      effects: last ? [BR.publicView(last, now)] : undefined
    });
    if (p.hp <= 0) {
      onPlayerDeath(p, { byMob: true, killerName: (last && last.name) || 'DoT' });
    }
  }

  function tickPlayerRegen(p, dtSec) {
    if (!p || p.hp <= 0 || p.dead) return;
    // Zero-GC Fast-path (Tick-LOD): если здоровье, энергия и CP полные и нет активных эффектов, реген не требуется
    if (p.hp >= p.maxHp && p.energy >= p.maxEnergy && (!p.maxCp || p.cp >= p.maxCp) && (!p.debuffs || p.debuffs.length === 0) && (!p.buffs || p.buffs.length === 0)) return;
    tickPlayerDots(p, dtSec);
    const now = Date.now();
    let fxChanged = false;
    if (p.buffs && p.buffs.length > 0) {
      const prevBLen = p.buffs.length;
      const hadAuraBuff = p.buffs.some(b => b.auraId);
      p.buffs = BR.prune(p.buffs, now);
      if (p.buffs.length !== prevBLen) {
        fxChanged = true;
        if (hadAuraBuff && !p.buffs.some(b => b.auraId)) {
          // Aura elixir buff expired
          if (!p.dev && !p.gm && p.cosmetics && p.cosmetics.aura) {
            p.cosmetics.aura = null;
            if (typeof saveProfileNow === 'function') saveProfileNow(p);
            const cosPub = typeof cosmeticsPublic === 'function' ? cosmeticsPublic(p) : p.cosmetics;
            if (typeof send === 'function') {
              send(p, {
                t: 'cosmetic',
                pid: p.pid,
                aura: null,
                cosmetics: cosPub
              });
            }
            if (typeof broadcastAOI === 'function') {
              broadcastAOI(p, {
                t: 'cosmetic',
                pid: p.pid,
                aura: null
              });
            }
          }
        }
        if (typeof invalidateCombatPack === 'function') invalidateCombatPack(p);
        if (typeof pushCombatStats === 'function') pushCombatStats(p);
      }
    }
    if (p.debuffs && p.debuffs.length > 0) {
      const prevDLen = p.debuffs.length;
      p.debuffs = BR.prune(p.debuffs, now);
      if (p.debuffs.length !== prevDLen) {
        fxChanged = true;
        if (typeof invalidateCombatPack === 'function') invalidateCombatPack(p);
        if (typeof pushCombatStats === 'function') pushCombatStats(p);
      }
    }
    if (fxChanged && typeof pushEffects === 'function') {
      pushEffects(p);
    }
    if (playerWeightState(p).noRegen) return;
    const pas = passiveBonuses(p);
    const primary = (p.combatPack && p.combatPack.primary) || {};
    const con = primary.CON != null ? primary.CON : 27;
    const men = primary.MEN != null ? primary.MEN : 30;
    const lv = p.level || 1;
    const pack = p.combatPack || {};
    const baseHpReg = pack.baseHpReg != null ? pack.baseHpReg : 1.5;
    const baseMpReg = pack.baseMpReg != null ? pack.baseMpReg : 0.9;
    const combat = L2 || (typeof globalThis !== 'undefined' && globalThis.L2_COMBAT) || null;

    // clear run/walk pose if no move packet for 400ms (stand regen ×1.1)
    if (p.moving && p._lastMoveAt && Date.now() - p._lastMoveAt > 400) p.moving = false;
    // cannot sit while flagged moving (move packet already clears sitting)
    let pose = 'stand';
    if (p.sitting && !p.isFlagged) pose = 'sit';
    else if (p.moving || p.isMoving) pose = p.walking ? 'walk' : 'run';

    let hpPerSec = 0.5;
    let enPerSec = 0.3;
    let cpPerSec = 0.5;
    if (combat && combat.hpRegenPerSec) {
      hpPerSec = combat.hpRegenPerSec(baseHpReg, con, lv, pose);
      enPerSec = combat.mpRegenPerSec(baseMpReg, men, lv, pose);
      cpPerSec = combat.cpRegenPerSec ? combat.cpRegenPerSec(baseHpReg, con, lv, pose) : combat.hpRegenPerSec(baseHpReg, con, lv, pose);
    } else {
      const levelMod = (lv + 89) / 100;
      const levelBonus = lv > 10 ? (lv - 1) / 10 : 0.5;
      const poseM = pose === 'sit' ? 1.5 : pose === 'run' ? 0.7 : pose === 'walk' ? 1.0 : 1.1;
      let hpInit = (baseHpReg + levelBonus) * levelMod * 0.98;
      let mpInit = (baseMpReg + 0.3 * ((lv - 1) / 10)) * levelMod * 1.47;
      if (hpInit < 1) hpInit = 1;
      if (mpInit < 1) mpInit = 1;
      hpPerSec = (hpInit * poseM) / 3;
      enPerSec = (mpInit * poseM) / 3;
      cpPerSec = (hpInit * poseM) / 3;
    }
    // Mana Recovery / Coolant Mind / set energyRegen — % mul (L2 regMp)
    enPerSec *= (1 + (pas.energyRegen || 0));
    // HP regen % mul (Fast HP Recovery style)
    if (pas.hpRegenPercent) hpPerSec *= (1 + pas.hpRegenPercent);
    // Flat HP regen add (buff «Regeneration» hpRegen=N → +N per 3s tick)
    if (pas.hpRegen && pas.hpRegen > 0 && pas.hpRegen <= 1) {
      hpPerSec *= (1 + pas.hpRegen);
    } else if (pas.hpRegen) {
      hpPerSec += pas.hpRegen / 3;
    }
    // Vital Force (C1): flat HP/MP regen only while sitting
    if (pose === 'sit') {
      if (pas.hpRegenSit) hpPerSec += pas.hpRegenSit / 3;
      if (pas.mpRegenSit) enPerSec += pas.mpRegenSit / 3;
    }

    // Buff energy regen multiplier (e.g. Vacuum Void +25%)
    const buffEnMul = BR.foldMult ? BR.foldMult(p.buffs, 'energyRegenMult', now) : 1;
    if (buffEnMul > 0) enPerSec *= buffEnMul;

    // Flat HP / Energy buffs (e.g. Skibidi-Steam auto-repair +10 HP/s, +5 MP/s)
    const flatHpBuff = BR.foldAdd ? BR.foldAdd(p.buffs, 'hpRegenFlat', now) : 0;
    const flatMpBuff = BR.foldAdd ? BR.foldAdd(p.buffs, 'energyRegenFlat', now) : 0;
    if (flatHpBuff > 0) hpPerSec += flatHpBuff;
    if (flatMpBuff > 0) enPerSec += flatMpBuff;

    // Ночной отдых: в ночное время (22:00–06:00) сидячий реген ускоряется на 20% (L2 night rest)
    const night = typeof isNight === 'function' ? isNight() : false;
    if (night && pose === 'sit') {
      hpPerSec *= 1.2;
      enPerSec *= 1.2;
      cpPerSec *= 1.2;
    }

    const prevEn = p.energy;
    const prevHp = p.hp;
    const prevCp = p.cp != null ? p.cp : 0;
    if (p.energy < p.maxEnergy) {
      p.energy = Math.min(p.maxEnergy, p.energy + enPerSec * dtSec);
    }
    if (p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + hpPerSec * dtSec);
    }
    if (p.maxCp > 0 && p.cp < p.maxCp) {
      p.cp = Math.min(p.maxCp, p.cp + cpPerSec * dtSec);
    }
    if (!p._lastVitalsSync) p._lastVitalsSync = 0;
    const changed =
      Math.floor(p.energy) !== Math.floor(prevEn) ||
      Math.floor(p.hp) !== Math.floor(prevHp) ||
      (p.maxCp > 0 && Math.floor(p.cp) !== Math.floor(prevCp));
    // sync ~every tick-period so UI tracks L2-like regen feel
    if (changed && now - p._lastVitalsSync > 450) {
      p._lastVitalsSync = now;
      const vitals = {
        t: 'vitals',
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy
      };
      if (p.maxCp > 0) {
        vitals.cp = Math.floor(p.cp);
        vitals.maxCp = p.maxCp;
      }
      send(p, vitals);
    }
  }

  return {
    tickPlayerDots,
    tickPlayerRegen
  };
}

module.exports = {
  createPlayerRegenHandler
};
