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
    onPlayerDeathByPlayer
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
    if (!tgt.isFlagged) {
      // Канон Lineage 2 C1 (audits/10_pvp_clans_social.md): флаг боя длится ровно 40 секунд
      p.flagUntil = Date.now() + 40000;
      send(p, { t: 'flag', flagged: true, karma: p.karma });
    }
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
    activeDuelPlayers.delete(pid);
    for (const [, o] of players) {
      if (o._duelFrom && o._duelFrom.pid === pid) { o._duelFrom = null; activeDuelPlayers.delete(o.pid); }
      if (o._duelTo && o._duelTo.pid === pid) { o._duelTo = null; activeDuelPlayers.delete(o.pid); }
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

  function endDuel(a, b, result, reason) {
    const pa = a || null;
    const pb = b || null;
    if (pa) clearDuelState(pa);
    if (pb) clearDuelState(pb);
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
      send(pa, payload);
      broadcastDuelFx(pa);
    }
    if (pb) {
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
      if (p.pid > p.duel.peer) continue;
      if (!DU.duelExpired(p.duel.at, now)) continue;
      const q = players.get(p.duel.peer);
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
    registerDuelPlayer
  };
};
