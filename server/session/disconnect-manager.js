// SERVER / SESSION / DISCONNECT-MANAGER.JS
// Менеджер отключений игроков, anti-combat log и очистка сессионных структур
'use strict';

const { Player } = require('../core/player.js');

function fastIdFromKey(key) {
  if (!key) return 0;
  let id = 0;
  for (let i = 1, len = key.length; i < len; i++) {
    id = id * 10 + (key.charCodeAt(i) - 48);
  }
  return id;
}

function createDisconnectManager(ctx) {
  const {
    players,
    wsByPid,
    pidByYid,
    loggingIn = null,
    dirtyProfiles = null,
    mobs,
    parties,
    partyHandler = null,
    spatialGrid = null,
    nativeSpatialGrid = null,
    entityTransforms = null,
    isSyntheticBot = () => false,
    closeTrade = () => {},
    interruptDuel = () => {},
    broadcastStoreState = () => {},
    notifyFriends = () => {},
    notifyClan = () => {},
    partyOf = (p) => (parties && p && p.partyId ? parties.get(p.partyId) : null),
    pushParty = () => {},
    send = () => {},
    sendPid = () => {},
    EditorGuard = null,
    profileOf = (p) => p,
    lbTouch = () => {},
    onSaveFailed = null,
    DB = null,
    PlayerDb = null,
    IS_CLUSTER = false,
    clusterIpc = null,
    CURRENT_WORKER_ID = 0
  } = ctx;

  const _dcPBuf = new Int32Array(2048);
  const _dcMBuf = new Int32Array(2048);

  /**
   * Полное снятие игрока с сервера: пати, хейт мобов, knownlist наблюдателей, сейв.
   * Вынесено из ws.on('close'), потому что тем же путём выбрасывается старая
   * сессия при повторном логине одним yid.
   */
  async function detachPlayer(pid) {
    const p = players.get(pid);
    if (!p) return;
    if (p._combatLogoutTimer) {
      clearTimeout(p._combatLogoutTimer);
      p._combatLogoutTimer = null;
    }
    const isBot = isSyntheticBot(p.yid);
    if (!isBot) {
      // Обмен рвётся первым: партнёр должен узнать до того, как игрок исчезнет из
      // players, иначе его сессия зависнет в «занят обменом» до TTL.
      closeTrade(p, 'peer_gone');
      interruptDuel(p, 'disconnect');
      if (p.casting) p.casting = null;
      // Лавка исчезает вместе с владельцем: вывеска в AOI не должна остаться.
      if (p.store) { p.store = null; broadcastStoreState(p); }
      notifyFriends(p, false);
      notifyClan(p, false);
      const pa = partyOf(p);
      if (pa) {
        pa.members.delete(pid);
        if (pa.members.size <= 1) {
          for (const id of pa.members) {
            const rest = players.get(id);
            if (rest) { rest.partyId = null; send(rest, { t: 'party', leader: null, members: [] }); }
          }
          pa.members.clear();
          if (parties) parties.delete(pa.id);
          if (partyHandler && typeof partyHandler.broadcastPartyDisband === 'function') {
            partyHandler.broadcastPartyDisband(pa.id);
          }
        } else {
          if (pa.leader === pid) pa.leader = [...pa.members][0];
          pushParty(pa);
          if (partyHandler && typeof partyHandler.broadcastPartySync === 'function') {
            partyHandler.broadcastPartySync(pa);
          }
        }
      }
      p.partyId = null;
    } else {
      if (p.casting) p.casting = null;
      p.partyId = null;
    }

    // Снять хейт и таргет у мобов: если сетка заполнена, опрашиваем только мобов в радиусе 200м (O(1)), а не все 1300 мобов острова
    const hateKey = String(pid);
    if (nativeSpatialGrid && nativeSpatialGrid._populated && Number.isFinite(p.x) && Number.isFinite(p.z) && mobs) {
      const res = nativeSpatialGrid.queryRadius(p.x, p.z, 200, _dcPBuf, _dcMBuf);
      for (let i = 0; i < res.mobs; i++) {
        const m = mobs.get(_dcMBuf[i]);
        if (m && m.hate && m.hate[hateKey] != null) delete m.hate[hateKey];
        if (m && m.target === pid) m.target = null;
      }
    } else if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0 && Number.isFinite(p.x) && Number.isFinite(p.z)) {
      spatialGrid.forEachCandidate(p.x, p.z, 200, null, (m) => {
        if (m && m.hate && m.hate[hateKey] != null) delete m.hate[hateKey];
        if (m && m.target === pid) m.target = null;
      });
    } else if (mobs) {
      for (const [, m] of mobs) {
        if (m.hate && m.hate[hateKey] != null) delete m.hate[hateKey];
        if (m.target === pid) m.target = null;
      }
    }

    // Сбросить висящие приглашения от ушедшего игрока (O(1) прямые ссылки вместо O(P) цикла)
    if (p._duelTo) {
      const tgt = players.get(p._duelTo.pid);
      if (tgt && tgt._duelFrom && tgt._duelFrom.pid === pid) tgt._duelFrom = null;
      p._duelTo = null;
    }
    if (p._duelFrom) {
      const src = players.get(p._duelFrom.pid);
      if (src && src._duelTo && src._duelTo.pid === pid) src._duelTo = null;
      p._duelFrom = null;
    }

    if (p.knownBy) {
      if (p.knownBy.size > 0) {
        for (const obsPid of p.knownBy) {
          if (obsPid !== pid) {
            sendPid(obsPid, { t: 'aoi', enter: [], leave: ['p' + pid] });
            const o = players.get(obsPid);
            if (o && o.known) o.known.delete('p' + pid);
            if (o && o._lastUpd) o._lastUpd.delete('p' + pid);
          }
        }
        p.knownBy.clear();
      }
    } else {
      if (nativeSpatialGrid && nativeSpatialGrid._populated && Number.isFinite(p.x) && Number.isFinite(p.z)) {
        const resP = nativeSpatialGrid.queryRadius(p.x, p.z, 108, _dcPBuf, _dcMBuf);
        for (let i = 0; i < resP.players; i++) {
          const o = players.get(_dcPBuf[i]);
          if (o && o.pid !== pid && o.known && o.known.has('p' + pid)) {
            sendPid(o.pid, { t: 'aoi', enter: [], leave: ['p' + pid] });
            o.known.delete('p' + pid);
            if (o._lastUpd) o._lastUpd.delete('p' + pid);
          }
        }
      } else if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
        spatialGrid.forEachCandidate(p.x, p.z, 108, (o) => {
          if (o.pid !== pid && o.known && o.known.has('p' + pid)) {
            sendPid(o.pid, { t: 'aoi', enter: [], leave: ['p' + pid] });
            o.known.delete('p' + pid);
            if (o._lastUpd) o._lastUpd.delete('p' + pid);
          }
        }, null);
      } else {
        for (const [, o] of players) {
          if (o.pid !== pid && o.known && o.known.has('p' + pid)) {
            sendPid(o.pid, { t: 'aoi', enter: [], leave: ['p' + pid] });
            o.known.delete('p' + pid);
            if (o._lastUpd) o._lastUpd.delete('p' + pid);
          }
        }
      }
    }

    if (p.known && p.known.size > 0) {
      for (const k of p.known) {
        if (k.charCodeAt(0) === 112 /* 'p' */) {
          const targetP = players.get(fastIdFromKey(k));
          if (targetP && targetP.knownBy) targetP.knownBy.delete(pid);
        } else if (mobs) {
          const targetM = mobs.get(fastIdFromKey(k));
          if (targetM && targetM.knownBy) targetM.knownBy.delete(pid);
        }
      }
    }

    if (EditorGuard && typeof EditorGuard.revokePid === 'function') {
      try { EditorGuard.revokePid(pid); } catch (_) {}
    }

    if (entityTransforms && p.transformSlot >= 0) {
      entityTransforms.free(p.transformSlot);
      p.transformSlot = -1;
    }

    const acquiredLoginLock = Boolean(loggingIn && p.yid && !isBot && !loggingIn.has(p.yid));
    if (acquiredLoginLock) loggingIn.add(p.yid);
    try {
      players.delete(pid);
      if (wsByPid) wsByPid.delete(pid);
      if (pidByYid && pidByYid.get(p.yid) === pid) pidByYid.delete(p.yid);
      if (p._isStressBot || (p.yid && isSyntheticBot(p.yid))) {
        if (typeof Player.unmarkStressBot === 'function') Player.unmarkStressBot(p.yid);
      }
      if (dirtyProfiles && p.yid) {
        const dKey = p._profileKey || (p.yid + ':' + (p.charId || 'c0'));
        if (dirtyProfiles.get(dKey) === p) dirtyProfiles.delete(dKey);
      }

      if (!isBot) {
        let pr = null;
        try {
          pr = profileOf(p);
          lbTouch(p.yid, pr, p.charId);
          if (DB && typeof DB.save === 'function') {
            await DB.save(p.yid, pr, p.charId);
          }
        } catch (e) {
          console.error('[DB] save on detach', p.yid, e && e.message);
          // игрок уже вне мира — снимок уходит в очередь повторов, иначе прогресс сессии терялся
          if (pr && typeof onSaveFailed === 'function') {
            try { onSaveFailed({ yid: p.yid, charId: p.charId, data: pr }); } catch (_) {}
          }
        }
        if (PlayerDb && typeof PlayerDb.setOnline === 'function') {
          try { PlayerDb.setOnline(p.yid, p.charId, false); } catch (_) {}
        }
      }

      if (IS_CLUSTER && clusterIpc && p.yid) {
        clusterIpc.updatePlayerDirectory(p.yid, p.pid, p.name, false, CURRENT_WORKER_ID, p.charId);
      }
    } finally {
      if (acquiredLoginLock) loggingIn.delete(p.yid);
    }
  }

  /**
   * Обработка разрыва сокета с учетом Anti Combat-Log
   */
  async function handleSocketClose(ws, sessions) {
    const pid = ws.pid;
    if (sessions) sessions.delete(ws);
    if (wsByPid) wsByPid.delete(pid);
    if (pid == null) return;
    const p = players.get(pid);
    if (!p) return;
    if (p._combatLogoutTimer) {
      clearTimeout(p._combatLogoutTimer);
      p._combatLogoutTimer = null;
    }
    const isBot = isSyntheticBot(p.yid);
    const inCombat = !isBot && (
      p.isFlagged ||
      (p.flagUntil && p.flagUntil > Date.now()) ||
      (p._lastCombatAt && Date.now() - p._lastCombatAt < 15000) ||
      (p.duel && p.duel.peer)
    );
    if (inCombat && !p.dead) {
      // Игрок вышел в бою / под флагом (Anti Combat-Log):
      // Персонаж остаётся в мире "манекеном" на 15 секунд.
      p.moving = false;
      if (p.casting) p.casting = null;
      if (p.trade && typeof closeTrade === 'function') closeTrade(p, 'offline');
      if (p.store) { p.store = null; broadcastStoreState(p); }
      p._disconnectedAt = Date.now();
      p._combatLogoutTimer = setTimeout(async () => {
        p._combatLogoutTimer = null;
        try {
          await detachPlayer(pid);
        } catch (err) {
          console.error('[combat-logout] detachPlayer error:', err);
        }
      }, 15000);
      return;
    }
    try {
      await detachPlayer(pid);
    } catch (err) {
      console.error('[ws] detachPlayer error on close:', err && (err.stack || err.message) || err);
    }
  }

  return {
    detachPlayer,
    handleSocketClose,
    fastIdFromKey
  };
}

/**
 * Проход сборщика потерянных/зомби-сессий.
 * Игроки под защитой Anti-Combat-Log (_combatLogoutTimer) удерживаются в мире до истечения 15с.
 */
function sweepZombiePlayers({ players, wsByPid, sessions, detachPlayer }) {
  if (!players || typeof detachPlayer !== 'function') return [];
  const detached = [];
  for (const [pid, p] of players) {
    if (p && p._combatLogoutTimer) continue;
    const ws = wsByPid ? wsByPid.get(pid) : null;
    if (!ws || ws.readyState === 2 || ws.readyState === 3 || (sessions && !sessions.has(ws))) {
      detached.push(pid);
      Promise.resolve(detachPlayer(pid)).catch(() => {});
    }
  }
  return detached;
}

module.exports = {
  createDisconnectManager,
  sweepZombiePlayers,
  fastIdFromKey
};
