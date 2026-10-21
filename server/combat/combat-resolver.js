// SERVER / COMBAT / COMBAT-RESOLVER.JS
// Авторитетные боевые расчеты (PvE и PvP), интеграция с C++ AVX2 SIMD и расчет урона/соулшотов
'use strict';

const L2 = require('../../shared/l2-combat.js');
const BR = require('../../shared/buff-rules.js');
const CS = require('../../shared/class-system.js');
const ITEMS = require('../../shared/item-db.js');

const BLOCK_CAP = 70; // % C1 shield block cap
const SOULSHOT_MULT = 2.0;
const SPIRITSHOT_MULT = 1.5;
const BLESSED_SPIRITSHOT_MULT = 2.0;
const MELEE_RANGE = 3.5;
const RANGED_RANGE = 30;

function createCombatResolver(deps = {}) {
  const {
    mobs,
    players,
    borderGhosts = new Set(),
    IS_CLUSTER = false,
    MOB_DB,
    dist2 = (x1, z1, x2, z2) => { const dx = x1 - x2, dz = z1 - z2; return dx * dx + dz * dz; },
    losGround = () => true,
    notifyLos = () => {},
    send = () => {},
    broadcastAOI = () => {},
    consumeArmedShot = () => ({ shotMod: 1.0, consumed: null }),
    onPlayerHit = () => {},
    onPlayerDeath = () => {},
    onPvpLethal = () => {},
    onMobDeath = () => {},
    recordMobDamage = () => {},
    addMobHate = () => {},
    hateFromHit = () => 0,
    mobDisplayNameServer = (id) => String(id),
    isSyntheticBot = () => false,
    pvpPeaceBlocked = () => false,
    maybeFlagPvp = () => {},
    isPlayerImmortal = () => false,
    playerStunned = () => false,
    playerWeightState = () => ({ canAttack: true }),
    checkRate = () => true,
    cancelPlayerCast = () => {}
  } = deps;

  /** Проверка активности нативного C++ SIMD движка */
  function hasNativeAcceleration() {
    return !!(L2 && L2.hasNative);
  }

  /**
   * Базовое разрешение попадания через L2-combat (C++ SIMD / Fast Math)
   */
  function resolveHit(attackerStats, defenderStats, options = {}) {
    return L2.resolveHit(attackerStats, defenderStats, options);
  }

  /**
   * Авторитетная PvE автоатака (игрок -> монстр)
   */
  function resolvePveAttack(p, msg) {
    if (!p || p.dead || p.hp <= 0) return false;
    if (p.sitting) p.sitting = false;
    if (p.casting) cancelPlayerCast(p, 'attack');
    if (playerStunned(p)) return false;
    if (!playerWeightState(p).canAttack) {
      send(p, { t: 'msg', text: 'Слишком тяжело — нельзя атаковать.' });
      return false;
    }
    if (!checkRate(p, 'attack')) return false;

    const m = mobs.get(msg.mid | 0);
    if (!m || m.hp <= 0) return false;

    const pack = p.combatPack;
    const wClass = pack.weaponClass || 'fist';
    const isBow = wClass === 'bow';
    const range = isBow ? RANGED_RANGE : MELEE_RANGE;

    if (dist2(p.x, p.z, m.x, m.z) > range * range) return false;
    if (!losGround(p.x, p.z, m.x, m.z)) {
      notifyLos(p);
      return false;
    }

    if ((p.cd.atk || 0) > Date.now()) return false;
    p._lastCombatAt = Date.now();
    p.cd.atk = Date.now() + (L2.quantizeCombatMs ? L2.quantizeCombatMs(pack.atkIntervalMs, 100) : pack.atkIntervalMs);

    const attackFacing = Math.atan2(m.x - p.x, m.z - p.z);
    p.facing = attackFacing;

    // C1 Soulshot: ×2 phys AA, consume 1 if armed
    const ss = consumeArmedShot(p, 'ss');
    const mobTpl = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId)) || null;

    const hit = L2.resolveHit(
      {
        pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate,
        level: p.level, dex: pack.dex, wit: pack.wit,
        classTier: pack.tier != null ? pack.tier : (CS.getClass(p.cls) ? CS.getClass(p.cls).tier : 0)
      },
      {
        pDef: m.pDef, cDef: m.cDef != null ? m.cDef : m.mDef,
        evasion: m.evasion != null ? m.evasion : (15 + m.level * 1.2), level: m.level,
        eliteRaid: !!(m.eliteRaid || (mobTpl && mobTpl.eliteRaid)),
        epicRaid: !!(m.epicRaid || (mobTpl && mobTpl.epicRaid))
      },
      { skillPower: 1.0, damageType: 'physical', shotMod: ss.shotMod }
    );

    if (hit.lethalFeedback) {
      const lethalDmg = hit.feedbackDamage || 99999;
      onPlayerHit(p, lethalDmg);
      send(p, {
        t: 'hit', dmg: lethalDmg, by: 'm' + m.mid, crit: true,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
      });
      broadcastAOI(p, {
        t: 'dmg_player', pid: p.pid, dmg: lethalDmg, crit: true,
        by: 'm' + m.mid, mobId: m.mobId
      });
      send(p, {
        t: 'msg',
        text: 'Аварийный разряд сверхдавления отражает удар! Смертельное отражение: требуется 1-я профессия!'
      });
      onPlayerDeath(p, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
      return true;
    }

    if (hit.missed) {
      broadcastAOI(p, {
        t: 'dmg', mid: m.mid, dmg: 0, crit: false, miss: true, by: p.pid,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
        facing: attackFacing, atkInterval: pack.atkIntervalMs
      });
      send(p, { t: 'msg', text: 'Промах!' });
      return true;
    }

    if (m.state === 'return') {
      broadcastAOI(p, {
        t: 'dmg', mid: m.mid, dmg: 0, crit: false, miss: true, evade: true, by: p.pid,
        mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
        facing: attackFacing, atkInterval: pack.atkIntervalMs
      });
      send(p, { t: 'msg', text: 'Монстр возвращается на базу (Уклонение / Evade)!' });
      return true;
    }

    m.hp = Math.max(0, m.hp - hit.damage);
    recordMobDamage(m, p.pid, hit.damage);

    const vampM = BR.foldAdd ? BR.foldAdd(p.buffs, 'vampiric', Date.now()) : 0;
    if (vampM > 0 && hit.damage > 0 && p.hp < p.maxHp) {
      const healAmt = Math.min(p.maxHp - p.hp, Math.floor(hit.damage * vampM));
      if (healAmt > 0) {
        p.hp += healAmt;
        send(p, { t: 'vitals', hp: Math.floor(p.hp), maxHp: p.maxHp, energy: Math.floor(p.energy), maxEnergy: p.maxEnergy });
      }
    }

    addMobHate(m, p.pid, hateFromHit(m, hit.damage, { crit: !!hit.crit, skill: false }));
    broadcastAOI(p, {
      t: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit, by: p.pid, ss: !!ss.consumed,
      hp: m.hp, maxHp: m.maxHp,
      mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
      facing: attackFacing, atkInterval: pack.atkIntervalMs
    });

    if (ss.consumed) {
      send(p, { t: 'shot_use', id: ss.consumed, inv: p.inv, armedShot: p.armedShot || null });
    }

    if (m.hp <= 0) onMobDeath(p, m);
    return true;
  }

  /**
   * Авторитетная PvP автоатака (игрок -> игрок)
   */
  function resolvePvpAttack(p, msg) {
    if (!p || p.dead || p.hp <= 0) return false;
    if (p.casting) cancelPlayerCast(p, 'attack');
    if (playerStunned(p)) return false;
    if (!playerWeightState(p).canAttack) return false;
    if (!checkRate(p, 'pvp')) return false;

    const tgt = players.get(msg.pid | 0);
    if (!tgt) {
      if (IS_CLUSTER && borderGhosts.has(msg.pid | 0)) {
        send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
      }
      return false;
    }

    if (tgt.hp <= 0 || tgt.dead) return false;
    if (tgt.pid === p.pid) return false;
    if (isSyntheticBot(p.yid) || isSyntheticBot(tgt.yid)) return false;

    if (pvpPeaceBlocked(p, tgt)) {
      send(p, { t: 'msg', text: 'В мирной зоне нельзя атаковать.' });
      return false;
    }

    const pvpPack = p.combatPack;
    const wClass = pvpPack.weaponClass || 'fist';
    const isBow = wClass === 'bow';
    const pvpRange = isBow ? RANGED_RANGE : MELEE_RANGE;

    if (dist2(p.x, p.z, tgt.x, tgt.z) > pvpRange * pvpRange) return false;
    if (!losGround(p.x, p.z, tgt.x, tgt.z)) {
      notifyLos(p);
      return false;
    }

    if ((p.cd.atk || 0) > Date.now()) return false;
    p._lastCombatAt = Date.now();
    tgt._lastCombatAt = Date.now();
    p.cd.atk = Date.now() + (L2.quantizeCombatMs ? L2.quantizeCombatMs(pvpPack.atkIntervalMs, 100) : pvpPack.atkIntervalMs);

    const attackFacing = Math.atan2(tgt.x - p.x, tgt.z - p.z);
    p.facing = attackFacing;

    maybeFlagPvp(p, tgt);

    const pack = pvpPack;
    const tPack = tgt.combatPack;
    const ssPvp = consumeArmedShot(p, 'ss');

    const hit = L2.resolveHit(
      {
        pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate,
        level: p.level, dex: pack.dex, wit: pack.wit
      },
      {
        pDef: tPack.pDef, cDef: tPack.cDef, evasion: tPack.evasion, level: tgt.level,
        hasShield: tPack.hasShield, shieldDef: tPack.shieldDef
      },
      { skillPower: 1.0, damageType: 'physical', shotMod: ssPvp.shotMod }
    );

    if (hit.missed) {
      broadcastAOI(tgt, {
        t: 'dmg_player', pid: tgt.pid, dmg: 0, crit: false, miss: true, by: p.pid,
        facing: attackFacing, atkInterval: pvpPack.atkIntervalMs
      });
      send(p, { t: 'msg', text: 'Промах!' });
      return true;
    }

    if (isPlayerImmortal(tgt)) {
      send(tgt, { t: 'hit', dmg: 0, immune: true, by: 'p' + p.pid });
      send(p, { t: 'msg', text: 'Цель неуязвима.' });
      return true;
    }

    tgt.hp = Math.max(0, tgt.hp - hit.damage);
    onPlayerHit(tgt, hit.damage);
    onPlayerHit(p, 0);

    send(tgt, { t: 'hit', dmg: hit.damage, by: 'p' + p.pid });
    broadcastAOI(tgt, {
      t: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit, by: p.pid, ss: !!ssPvp.consumed,
      facing: attackFacing, atkInterval: pvpPack.atkIntervalMs
    });

    if (ssPvp.consumed) {
      send(p, { t: 'shot_use', id: ssPvp.consumed, inv: p.inv, armedShot: p.armedShot || null });
    }

    if (tgt.hp <= 0) onPvpLethal(tgt, p);
    return true;
  }

  return {
    resolveHit,
    resolvePveAttack,
    resolvePvpAttack,
    hasNativeAcceleration,
    BLOCK_CAP,
    SOULSHOT_MULT,
    SPIRITSHOT_MULT,
    BLESSED_SPIRITSHOT_MULT,
    MELEE_RANGE,
    RANGED_RANGE
  };
}

module.exports = {
  createCombatResolver,
  BLOCK_CAP,
  SOULSHOT_MULT,
  SPIRITSHOT_MULT,
  BLESSED_SPIRITSHOT_MULT,
  MELEE_RANGE,
  RANGED_RANGE
};
