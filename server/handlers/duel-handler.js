// SERVER / HANDLERS / DUEL-HANDLER.JS
// Система дуэлей 1v1 (L2 Interlude duel rules: 1 HP floor, мирная зона)
'use strict';
const DU = require('../../shared/duel-rules.js');

module.exports = function createDuelHandler(ctx) {
  const {
    players,
    send,
    broadcastAOI,
    isPeaceAt,
    saveProfileNow,
    onPlayerDeathByPlayer,
    findPlayerByName = () => null,
    checkRate = () => true,
    pushEffects = () => {},
    pushCombatStats = () => {},
    cancelPlayerCast = () => {}
  } = ctx;

  function duelView(p) {
    if (!p) return null;
    return {
      pid: p.pid,
      x: p.x, z: p.z,
      dead: !!(p.dead || p.hp <= 0),
      flagged: !!p.isFlagged,
      dueling: !!(p.duel && p.duel.peer),
      trading: !!p.trade,
      storing: !!p.store
    };
  }

  function areDuelists(a, b) {
    if (!a || !b || !a.duel || !b.duel) return false;
    return a.duel.peer === b.pid && b.duel.peer === a.pid;
  }

  function pvpPeaceBlocked(p, tgt) {
    if (areDuelists(p, tgt)) return false;
    return isPeaceAt(p.x, p.z) || isPeaceAt(tgt.x, tgt.z);
  }

  function maybeFlagPvp(p, tgt) {
    if (!p || !tgt || areDuelists(p, tgt)) return;
    if (isPeaceAt(p.x, p.z) || isPeaceAt(tgt.x, tgt.z)) return;
    p._lastCombatAt = Date.now();
    tgt._lastCombatAt = Date.now();
    // Канон Lineage 2 C1: атака хаотического игрока (PK с karma > 0) не вешает PvP-флаг
    if ((tgt.karma || 0) > 0) return;
    // Канон Lineage 2 C1 (audits/10_pvp_clans_social.md): флаг боя длится ровно 40 секунд
    p.flagUntil = Date.now() + 40000;
    send(p, { t: 'flag', flagged: true, flagUntil: p.flagUntil, karma: p.karma || 0, pk: p.pk || 0 });
    broadcastAOI(p, { t: 'player_flag', pid: p.pid, flagged: true, karma: p.karma || 0 });
  }

  function broadcastDuelFx(p) {
    if (!p) return;
    broadcastAOI(p, {
      t: 'duel_fx',
      pid: p.pid,
      dueling: !!(p.duel && p.duel.peer),
      peer: (p.duel && p.duel.peer) || null
    });
  }

  const activeDuelPlayers = new Set();

  function registerDuelPlayer(p) {
    if (p && p.pid != null) activeDuelPlayers.add(p.pid);
  }

  function clearDuelInvitesOf(pid) {
    const pl = players.get(pid);
    if (!pl || !pl.duel) activeDuelPlayers.delete(pid);
    for (const [, o] of players) {
      if (o._duelFrom && o._duelFrom.pid === pid) {
        o._duelFrom = null;
        if (!o.duel && !o._duelTo) activeDuelPlayers.delete(o.pid);
      }
      if (o._duelTo && o._duelTo.pid === pid) {
        o._duelTo = null;
        if (!o.duel && !o._duelFrom) activeDuelPlayers.delete(o.pid);
      }
    }
  }

  function clearDuelState(p) {
    if (!p) return;
    if (p.pid != null) activeDuelPlayers.delete(p.pid);
    p.duel = null;
    p._duelFrom = null;
    p._duelTo = null;
  }

  function interruptDuel(p, reason) {
    if (!p || !p.duel) return;
    const q = players.get(p.duel.peer);
    endDuel(p, q, 'interrupt', reason || 'interrupt');
  }

  function cleanseDuelDebuffs(target, peerPid) {
    if (!target || peerPid == null || !Array.isArray(target.debuffs) || target.debuffs.length === 0) return false;
    const before = target.debuffs.length;
    target.debuffs = target.debuffs.filter((d) => !d || d.sourcePid !== peerPid);
    if (target.debuffs.length !== before) {
      if (target._combatPack) {
        target._combatPack = null;
        target._combatPackExpiry = 0;
      }
      return true;
    }
    return false;
  }

  function endDuel(a, b, result, reason) {
    const pa = a || null;
    const pb = b || null;
    // C-13: запоминаем PID оппонентов до сброса p.duel, чтобы очистить дуэльные DoT/дебаффы
    // и не допустить смертельного тика после окончания дуэли (PK/карма/дроп).
    const peerOfA = (pb && pb.pid != null) ? pb.pid : (pa && pa.duel ? pa.duel.peer : null);
    const peerOfB = (pa && pa.pid != null) ? pa.pid : (pb && pb.duel ? pb.duel.peer : null);
    if (pa) clearDuelState(pa);
    if (pb) clearDuelState(pb);
    const cleanedA = cleanseDuelDebuffs(pa, peerOfA);
    const cleanedB = cleanseDuelDebuffs(pb, peerOfB);
    if (pa && pa.casting) cancelPlayerCast(pa, 'duel_end');
    if (pb && pb.casting) cancelPlayerCast(pb, 'duel_end');
    const payload = {
      t: 'duel_end',
      result: result || 'interrupt',
      reason: reason || result || 'interrupt',
      winner: result === 'win' && pa ? pa.pid : null,
      winnerName: result === 'win' && pa ? pa.name : null,
      loser: result === 'win' && pb ? pb.pid : null,
      loserName: result === 'win' && pb ? pb.name : null
    };
    if (pa) {
      if (cleanedA) { pushEffects(pa); pushCombatStats(pa); }
      send(pa, payload);
      broadcastDuelFx(pa);
    }
    if (pb) {
      if (cleanedB) { pushEffects(pb); pushCombatStats(pb); }
      send(pb, payload);
      broadcastDuelFx(pb);
    }
  }

  function finishDuel(winner, loser) {
    if (!winner || !loser) return;
    endDuel(winner, loser, 'win', 'win');
    loser.dead = false;
    loser.hp = DU.loserHp(loser.maxHp);
    loser.moving = false;
    loser._lastVitalsSync = Date.now();
    send(loser, {
      t: 'vitals',
      hp: Math.floor(loser.hp), maxHp: loser.maxHp,
      energy: Math.floor(loser.energy), maxEnergy: loser.maxEnergy
    });
    send(winner, { t: 'msg', text: 'Вы победили в дуэли против ' + loser.name + '!' });
    send(loser, { t: 'msg', text: 'Вы проиграли дуэль ' + winner.name + '.' });
    saveProfileNow(loser);
  }

  function tickDuels() {
    if (activeDuelPlayers.size === 0) return;
    const now = Date.now();
    for (const pid of activeDuelPlayers) {
      const p = players.get(pid);
      if (!p) { activeDuelPlayers.delete(pid); continue; }
      if (p._duelFrom && DU.inviteExpired(p._duelFrom.at, now)) p._duelFrom = null;
      if (p._duelTo && DU.inviteExpired(p._duelTo.at, now)) p._duelTo = null;
      if (!p.duel && !p._duelFrom && !p._duelTo) {
        activeDuelPlayers.delete(pid);
        continue;
      }
      if (!p.duel) continue;
      if (p.pid > p.duel.peer) {
        if (!players.has(p.duel.peer)) {
          endDuel(p, null, 'interrupt', 'offline');
        }
        continue;
      }
      const q = players.get(p.duel.peer);
      if (!q) {
        endDuel(p, null, 'interrupt', 'offline');
        continue;
      }
      const maxDist2 = DU.MAX_DIST2 || 14400;
      const dx = (p.x || 0) - (q.x || 0);
      const dz = (p.z || 0) - (q.z || 0);
      if (dx * dx + dz * dz > maxDist2) {
        endDuel(p, q, 'interrupt', 'range');
        send(p, { t: 'msg', text: 'Дуэль прервана: слишком большая дистанция.' });
        send(q, { t: 'msg', text: 'Дуэль прервана: слишком большая дистанция.' });
        continue;
      }
      if (!DU.duelExpired(p.duel.at, now)) continue;
      endDuel(p, q, 'timeout', 'timeout');
      if (p) send(p, { t: 'msg', text: 'Время дуэли истекло.' });
      if (q) send(q, { t: 'msg', text: 'Время дуэли истекло.' });
    }
  }

  function onPvpLethal(victim, killer) {
    if (areDuelists(victim, killer)) {
      finishDuel(killer, victim);
      return;
    }
    interruptDuel(victim, 'pvp');
    interruptDuel(killer, 'pvp');
    onPlayerDeathByPlayer(victim, killer);
  }

  function doDuelOffer(p, msg) {
    let tgt = msg.pid != null ? players.get(msg.pid | 0) : null;
    if (!tgt && msg.name) tgt = findPlayerByName(msg.name);
    const chk = DU.canChallenge(duelView(p), duelView(tgt));
    if (!chk.ok) {
      send(p, { t: 'duel_fail', reason: chk.reason });
      return;
    }
    if (p._duelTo && !DU.inviteExpired(p._duelTo.at) && p._duelTo.pid !== tgt.pid) {
      send(p, { t: 'duel_fail', reason: 'busy' });
      return;
    }
    const now = Date.now();
    tgt._duelFrom = { pid: p.pid, at: now };
    p._duelTo = { pid: tgt.pid, at: now };
    registerDuelPlayer(p);
    registerDuelPlayer(tgt);
    send(tgt, { t: 'duel_invite', from: p.pid, fromName: p.name });
    send(tgt, { t: 'msg', text: p.name + ' вызывает вас на дуэль. /duel_accept' });
    send(p, { t: 'msg', text: 'Вызов отправлен: ' + tgt.name });
  }

  function doDuelAccept(p, msg) {
    const from = p._duelFrom;
    const wantPid = (msg && msg.pid != null) ? (msg.pid | 0) : (from ? from.pid : null);
    if (!from || wantPid == null || from.pid !== wantPid || DU.inviteExpired(from.at)) {
      p._duelFrom = null;
      send(p, { t: 'duel_fail', reason: 'no_invite' });
      return;
    }
    const q = players.get(from.pid);
    if (!q) {
      p._duelFrom = null;
      send(p, { t: 'duel_fail', reason: 'offline' });
      return;
    }
    const chk = DU.canChallenge(duelView(p), duelView(q));
    if (!chk.ok) {
      send(p, { t: 'duel_fail', reason: chk.reason });
      return;
    }
    const now = Date.now();
    p._duelFrom = null;
    p._duelTo = null;
    q._duelFrom = null;
    q._duelTo = null;
    p.duel = { peer: q.pid, at: now };
    q.duel = { peer: p.pid, at: now };
    registerDuelPlayer(p);
    registerDuelPlayer(q);
    const until = now + DU.DUEL_TTL_MS;
    send(p, { t: 'duel_start', peer: q.pid, peerName: q.name, until: until });
    send(q, { t: 'duel_start', peer: p.pid, peerName: p.name, until: until });
    send(p, { t: 'msg', text: 'Дуэль с ' + q.name + ' началась!' });
    send(q, { t: 'msg', text: 'Дуэль с ' + p.name + ' началась!' });
    broadcastDuelFx(p);
    broadcastDuelFx(q);
  }

  function doDuelDecline(p, msg) {
    const from = p._duelFrom;
    p._duelFrom = null;
    if (from) {
      const q = players.get(from.pid);
      if (q) {
        if (q._duelTo && q._duelTo.pid === p.pid) q._duelTo = null;
        send(q, { t: 'duel_fail', reason: 'declined', name: p.name });
        send(q, { t: 'msg', text: p.name + ' отклонил дуэль.' });
      }
    }
    send(p, { t: 'msg', text: 'Вы отклонили дуэль.' });
  }

  function doDuelCancel(p, msg) {
    if (p.duel) {
      const q = players.get(p.duel.peer);
      interruptDuel(p, 'cancel');
      send(p, { t: 'msg', text: 'Дуэль отменена.' });
      if (q) send(q, { t: 'msg', text: p.name + ' отменил дуэль.' });
      return;
    }
    if (p._duelTo) {
      const q = players.get(p._duelTo.pid);
      if (q && q._duelFrom && q._duelFrom.pid === p.pid) q._duelFrom = null;
      p._duelTo = null;
      send(p, { t: 'msg', text: 'Вызов отозван.' });
      if (q) send(q, { t: 'msg', text: p.name + ' отозвал вызов на дуэль.' });
      return;
    }
    send(p, { t: 'duel_fail', reason: 'no_duel' });
  }

  function handleDuelMessage(p, msg) {
    if (!msg || !msg.t) return false;
    switch (msg.t) {
      case 'duel_offer':
        doDuelOffer(p, msg);
        return true;
      case 'duel_accept':
        doDuelAccept(p, msg);
        return true;
      case 'duel_decline':
        doDuelDecline(p, msg);
        return true;
      case 'duel_cancel':
        doDuelCancel(p, msg);
        return true;
      default:
        return false;
    }
  }

  return {
    duelView,
    areDuelists,
    pvpPeaceBlocked,
    maybeFlagPvp,
    broadcastDuelFx,
    clearDuelInvitesOf,
    clearDuelState,
    interruptDuel,
    endDuel,
    finishDuel,
    tickDuels,
    onPvpLethal,
    registerDuelPlayer,
    doDuelOffer,
    doDuelAccept,
    doDuelDecline,
    doDuelCancel,
    handleDuelMessage
  };
};
