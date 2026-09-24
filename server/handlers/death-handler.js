'use strict';

/**
 * Player Death, Penalties, Revive & Item Loss Handler (L2 C1)
 * 
 * Manages:
 * - Spawn point resolution (village center / default fallback)
 * - Death item loss: item deletion from bag/equip & ground loot spawn
 * - Death penalty: EXP loss (−4% of expToNext, delevel support), Lucky passive checks
 * - Player death state (corpse state, buffs clearing, trade/store interruption)
 * - Revive to village (HP restore, village teleport, nearby mobs wake-up)
 * - PvP death handling (Karma / PK counter increments)
 */

function createDeathHandler(deps) {
  const {
    WM,
    NPCS,
    itemLookup,
    equippedCount,
    spawnGroundLoot,
    pushCombatStats,
    pushWeight,
    L2,
    EXP,
    levelExpReq,
    ITEMS,
    CS,
    passiveBonuses,
    DR,
    SK,
    isPeaceAt,
    BR,
    pushEffects,
    closeTrade,
    closeStore,
    interruptDuel,
    Mod,
    saveProfileNow,
    send,
    broadcastAOI,
    snapStandY,
    resetMoveBudget,
    ensureNearbyMobs,
    cancelPlayerCast,
    checkRate,
    isSyntheticBot: depsIsSyntheticBot
  } = deps;

  const isSyntheticBot = depsIsSyntheticBot || ((yid) => {
    if (!yid) return false;
    const s = String(yid);
    return s.startsWith('stress_bot_') || s.startsWith('bot_uniq_') || s.startsWith('bot3k_');
  });

  function getSpawnPoint() {
    const v = WM.buildRegions().find(r => r.id === 'village');
    const x = v ? (v.bounds[0] + v.bounds[2]) / 2 : -107.5;
    const z = v ? (v.bounds[1] + v.bounds[3]) / 2 : -246.4;
    return { x, z, region: 'village' };
  }

  function deathItemMeta(id) {
    return NPCS.itemMeta(id) || itemLookup(id);
  }

  function applyDeathItemLoss(p, dropped) {
    if (!p || !Array.isArray(dropped) || !dropped.length) return;
    let lostEquip = false;
    for (let i = 0; i < dropped.length; i++) {
      const d = dropped[i];
      if (!d || !d.id) continue;
      if (d.equipped && d.slot) {
        delete p.equip[d.slot];
        lostEquip = true;
      } else if (p.inv) {
        delete p.inv[d.id];
      }
      const stillInv = (p.inv && (p.inv[d.id] | 0) > 0);
      const stillEq = equippedCount(p, d.id) > 0;
      if (!stillInv && !stillEq && p.plusById) delete p.plusById[d.id];
      try {
        spawnGroundLoot(p.x, p.z, d.id, d.count, null, {
          deathDrop: true,
          plus: d.plus | 0
        });
      } catch (eDrop) { /* ignore */ }
    }
    if (lostEquip) {
      try { pushCombatStats(p); } catch (eCs) { /* ignore */ }
      try { pushWeight(p); } catch (eW) { /* ignore */ }
    }
  }

  function applyDeathPenalty(p, ctx) {
    ctx = ctx || {};
    const levelBefore = Math.max(1, p.level | 0);
    const expBefore = Math.max(0, p.exp | 0);
    const pct = (L2 && L2.DEATH_EXP_LOSS_PCT != null) ? L2.DEATH_EXP_LOSS_PCT : 0.04;

    // Prefer shared EXP table (delevel-aware)
    let result;
    if (EXP && typeof EXP.applyDeathExpLoss === 'function') {
      result = EXP.applyDeathExpLoss(levelBefore, expBefore, pct);
    } else if (L2 && typeof L2.applyDeathExp === 'function') {
      result = L2.applyDeathExp(levelBefore, expBefore, pct, EXP);
    } else {
      const need = levelExpReq(levelBefore) || 0;
      const loss = Math.floor(need * pct);
      result = {
        level: levelBefore,
        exp: Math.max(0, expBefore - loss),
        loss: Math.min(loss, expBefore),
        delevels: 0,
        expToNext: need
      };
    }

    p.level = Math.max(1, result.level | 0);
    p.exp = Math.max(0, result.exp | 0);
    // Recalc stats / vitals after possible delevel
    if (result.delevels > 0 || p.level !== levelBefore) {
      try {
        if (typeof p.applyClassStats === 'function') p.applyClassStats();
        else {
          const gear = ITEMS.gearFromEquip(p.equip || {}, {
            isMagePath: CS.rootClass(p.cls) === 'engineer'
          });
          const st = CS.statsAtLevel(p.cls, p.level, gear);
          const pas = passiveBonuses(p);
          p.maxHp = Math.floor((st.maxHp || 100) * (1 + (pas.hpPercent || 0)) + (gear.hpBonus || 0));
          p.maxEnergy = Math.floor(
            (st.maxEnergy || 50) * (1 + (pas.energyPercent || 0)) + (pas.maxEnergyFlat || 0) + (gear.energyBonus || 0)
          );
        }
      } catch (e) { /* ignore */ }
    }

    const keepItemsUntil = DR.luckyUntil(
      p.skills,
      function (id) { return SK.get(id); },
      CS.rootClass(p.cls)
    );
    const roll = DR.rollDeathDrops({
      inv: p.inv,
      equip: p.equip,
      plusById: p.plusById,
      skills: p.skills,
      level: levelBefore,
      karma: p.karma,
      pk: p.pk
    }, {
      byMob: !!ctx.byMob,
      byPlayer: !!ctx.byPlayer,
      peace: isPeaceAt(p.x, p.z),
      skillGet: function (id) { return SK.get(id); },
      rootClass: CS.rootClass(p.cls),
      itemMeta: deathItemMeta
    }, ctx.rng || Math.random);
    applyDeathItemLoss(p, roll.dropped);

    return {
      loss: result.loss | 0,
      delevels: result.delevels | 0,
      droppedItems: (roll.dropped && roll.dropped.length) || 0,
      dropped: roll.dropped || [],
      table: roll.table || null,
      reason: roll.reason || null,
      keepItemsUntil: keepItemsUntil,
      levelBefore: levelBefore,
      levelAfter: p.level,
      exp: p.exp
    };
  }

  function deathSelfPayload(p) {
    return {
      x: p.x, z: p.z,
      hp: p.hp, maxHp: p.maxHp,
      energy: p.energy, maxEnergy: p.maxEnergy,
      level: p.level,
      exp: p.exp,
      sp: p.sp || 0,
      expToNext: levelExpReq(p.level),
      dead: !!p.dead
    };
  }

  function beginPlayerDeath(p, opts) {
    opts = opts || {};
    if (!p || p.dead) return null;
    p.dead = true;
    p.hp = 0;
    p.moving = false;
    p.sitting = false;
    p.flagUntil = 0;
    p.buffs = BR.clearDeath(p.buffs);
    p.debuffs = BR.clearDeath(p.debuffs);
    pushEffects(p);
    closeTrade(p, 'dead');
    closeStore(p, 'dead');
    interruptDuel(p, 'death');
    const isBot = p && p.yid && isSyntheticBot(p.yid);
    const pen = applyDeathPenalty(p, {
      byMob: !!opts.byMob,
      byPlayer: !!opts.byPlayer,
      rng: opts.rng
    });
    if (!isBot) {
      Mod.log('death', {
        yid: p.yid, name: p.name, x: p.x, z: p.z,
        killer: opts.killerName || null,
        level: p.level, loss: pen.loss, dropped: pen.droppedItems || 0,
        table: pen.table || null
      });
      saveProfileNow(p);
    }
    const payload = {
      t: 'you_died',
      loss: pen.loss,
      delevels: pen.delevels || 0,
      levelBefore: pen.levelBefore,
      dropped: pen.droppedItems || 0,
      droppedIds: (pen.dropped || []).map((d) => d && d.id).filter(Boolean),
      table: pen.table || null,
      keepItemsUntil: pen.keepItemsUntil,
      killer: opts.killerName || null,
      canVillage: true,
      villageName: 'Город',
      self: deathSelfPayload(p),
      inv: p.inv,
      equip: p.equip || {},
      invPlus: p.plusById
    };
    send(p, payload);
    broadcastAOI(p, {
      t: 'player_dead',
      pid: p.pid,
      killerPid: opts.killerPid || null,
      x: p.x,
      z: p.z
    });
    return pen;
  }

  function revivePlayerToVillage(p) {
    if (!p || !p.dead) return false;
    const sp = getSpawnPoint();
    p.dead = false;
    p.x = sp.x;
    p.z = sp.z;
    snapStandY(p);
    p.region = sp.region;
    p.flagUntil = 0;
    try {
      if (typeof p.applyClassStats === 'function') p.applyClassStats();
    } catch (e) { /* ignore */ }
    p.hp = p.maxHp;
    p.energy = p.maxEnergy;
    p.moving = false;
    resetMoveBudget(p);
    try {
      if (typeof pushCombatStats === 'function') pushCombatStats(p);
      if (typeof pushEffects === 'function') pushEffects(p);
    } catch (eStats) { /* ignore */ }
    saveProfileNow(p);
    send(p, {
      t: 'you_revived',
      mode: 'village',
      self: deathSelfPayload(p)
    });
    broadcastAOI(p, {
      t: 'player_revived',
      pid: p.pid,
      x: p.x,
      z: p.z,
      mode: 'village'
    });
    ensureNearbyMobs(p);
    return true;
  }

  function onPlayerDeath(p, opts) {
    opts = opts || {};
    cancelPlayerCast(p, 'dead');
    interruptDuel(p, 'death');
    beginPlayerDeath(p, {
      killerName: opts.killerName || null,
      killerPid: opts.killerPid || null,
      byMob: opts.byMob !== false,
      byPlayer: !!opts.byPlayer
    });
  }

  function onPlayerDeathByPlayer(victim, killer) {
    if (!victim.isFlagged && (victim.karma || 0) <= 0) {
      // Канон Lineage 2 C1 (audits/10_pvp_clans_social.md): базовая карма за PK от 2400 до 7200
      const currentPk = killer.pk || 0;
      const addKarma = Math.max(2400, Math.min(7200, 2400 + currentPk * 480));
      killer.karma = (killer.karma || 0) + addKarma;
      killer.pk = currentPk + 1;
      send(killer, { t: 'flag', flagged: killer.isFlagged, karma: killer.karma });
      send(killer, {
        t: 'msg',
        text: 'Убийство игрока! Карма: ' + killer.karma
      });
    }
    // Канон Lineage 2 C1: при гибели от руки другого игрока с ПК списывается существенная часть кармы (40%)
    if ((victim.karma || 0) > 0) {
      const lostKarma = Math.max(500, Math.floor(victim.karma * 0.4));
      victim.karma = Math.max(0, victim.karma - lostKarma);
    }
    beginPlayerDeath(victim, {
      killerName: killer.name,
      killerPid: killer.pid,
      byMob: false,
      byPlayer: true
    });
  }

  function handleReviveMessage(p, msg) {
    if (!checkRate(p, 'action')) return true;
    const mode = String(msg.mode || 'village').toLowerCase();
    if (mode === 'village' || mode === 'town' || mode === 'fort' || mode === 'spot') {
      if (!p.dead) {
        send(p, { t: 'msg', text: 'Вы не мертвы.' });
        return true;
      }
      if (mode === 'spot') {
        p.dead = false;
        p.hp = p.maxHp;
        p.energy = p.maxEnergy;
        p.moving = false;
        resetMoveBudget(p);
        send(p, { t: 'you_revived', mode: 'spot', self: deathSelfPayload(p) });
        broadcastAOI(p, { t: 'player_revived', pid: p.pid, x: p.x, z: p.z });
        return true;
      }
      revivePlayerToVillage(p);
    } else {
      send(p, { t: 'msg', text: 'Этот способ воскрешения пока недоступен.' });
    }
    return true;
  }

  function resurrectPlayer(tgt, caster) {
    if (!tgt) return false;
    const wasDead = !!tgt.dead;
    tgt.dead = false;
    try {
      if (typeof tgt.applyClassStats === 'function') tgt.applyClassStats();
    } catch (e) { /* ignore */ }
    tgt.hp = tgt.maxHp;
    tgt.energy = tgt.maxEnergy;
    tgt.moving = false;
    tgt.sitting = false;
    tgt.flagUntil = 0;
    resetMoveBudget(tgt);
    try {
      if (typeof pushCombatStats === 'function') pushCombatStats(tgt);
      if (typeof pushEffects === 'function') pushEffects(tgt);
    } catch (eStats) { /* ignore */ }
    saveProfileNow(tgt);

    send(tgt, {
      t: 'you_revived',
      mode: 'resurrect',
      by: caster ? caster.name : 'GM',
      self: deathSelfPayload(tgt)
    });
    broadcastAOI(tgt, {
      t: 'player_revived',
      pid: tgt.pid,
      x: tgt.x,
      z: tgt.z,
      mode: 'resurrect',
      casterPid: caster ? caster.pid : null,
      casterName: caster ? caster.name : null
    });
    broadcastAOI(tgt, {
      t: 'resurrect_fx',
      pid: tgt.pid,
      casterPid: caster ? caster.pid : null,
      casterName: caster ? caster.name : null,
      targetName: tgt.name,
      x: tgt.x,
      y: tgt.y,
      z: tgt.z
    });
    ensureNearbyMobs(tgt);

    if (wasDead) {
      send(tgt, {
        t: 'msg',
        text: `✨ Вы воскрешены силой благословения ${caster ? caster.name : 'GM'}!`
      });
      if (caster && caster !== tgt) {
        send(caster, {
          t: 'msg',
          text: `✨ Игрок ${tgt.name} успешно воскрешен.`
        });
      }
    } else {
      send(tgt, {
        t: 'msg',
        text: `✨ Благословение возрождения восстановило ваши силы до максимума!`
      });
      if (caster && caster !== tgt) {
        send(caster, {
          t: 'msg',
          text: `✨ Игрок ${tgt.name} полностью восстановлен благословением.`
        });
      }
    }
    return true;
  }

  return {
    getSpawnPoint,
    deathItemMeta,
    applyDeathItemLoss,
    applyDeathPenalty,
    deathSelfPayload,
    beginPlayerDeath,
    revivePlayerToVillage,
    resurrectPlayer,
    onPlayerDeath,
    onPlayerDeathByPlayer,
    handleReviveMessage
  };
}

module.exports = {
  createDeathHandler
};
