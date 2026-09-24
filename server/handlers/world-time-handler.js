'use strict';

/**
 * World Time & Day/Night Simulation Handler (L2-like)
 * 
 * Server is the sole authority for world time.
 * Cycles through 24 in-game hours with day (75%) and night (25%) phases.
 * Affects mob aggro radius and player resting regeneration.
 */

function createWorldTimeHandler(deps) {
  const { WT, send, TICK_MS } = deps;
  const getPlayers = () => typeof deps.players === 'function' ? deps.players() : (deps.players || []);

  const DAY_LENGTH_SEC = WT.DAY_LENGTH_SEC;
  let worldRealFrac = WT.gameHourToRealFrac(7.2); // старт ~утро 7:12
  let worldTod = WT.realFracToTod(worldRealFrac);
  let worldPhase = WT.phaseOfTod(worldTod);
  let lastTimeSync = 0;
  let timePaused = false; // admin pause

  function phaseOf(tod) {
    return WT.phaseOfTod(tod);
  }

  function worldTimePayload() {
    const h = WT.todToHour(worldTod);
    return {
      tod: worldTod,
      realFrac: worldRealFrac,
      dayLengthSec: DAY_LENGTH_SEC,
      dayRealFrac: WT.DAY_REAL_FRAC,
      phase: phaseOf(worldTod),
      hour: h,
      isNight: WT.isNightHour(h),
      paused: timePaused,
      server: true
    };
  }

  function wtSafe() {
    return worldTimePayload();
  }

  function broadcastTime(forcePhase) {
    const wt = worldTimePayload();
    const online = (typeof deps.getOnlineCount === 'function') ? deps.getOnlineCount() : null;
    for (const [, p] of getPlayers()) {
      send(p, { t: 'time', worldTime: wt, ...(online != null ? { online } : {}) });
    }
    if (forcePhase) {
      for (const [, p] of getPlayers()) {
        send(p, { t: 'time_phase', phase: wt.phase, isNight: wt.isNight });
      }
    }
  }

  function setWorldHour(hour) {
    worldRealFrac = WT.gameHourToRealFrac(hour);
    worldTod = WT.realFracToTod(worldRealFrac);
    const ph = phaseOf(worldTod);
    const changed = ph !== worldPhase;
    worldPhase = ph;
    broadcastTime(changed);
    return wtSafe();
  }

  function setWorldTod(tod) {
    worldRealFrac = WT.todToRealFrac(tod);
    worldTod = WT.realFracToTod(worldRealFrac);
    worldPhase = phaseOf(worldTod);
    broadcastTime(true);
    return wtSafe();
  }

  function setTimePaused(paused) {
    timePaused = !!paused;
    broadcastTime(false);
    return timePaused;
  }

  function isNight() {
    return WT.isNightHour(WT.todToHour(worldTod));
  }

  function getTod() {
    return worldTod;
  }

  function getHour() {
    return WT.todToHour(worldTod);
  }

  function getPhase() {
    return phaseOf(worldTod);
  }

  function isPaused() {
    return timePaused;
  }

  function tickDayNight() {
    if (!timePaused) {
      worldRealFrac = WT.advanceRealFrac(worldRealFrac, TICK_MS / 1000, DAY_LENGTH_SEC);
      worldTod = WT.realFracToTod(worldRealFrac);
    }
    const ph = phaseOf(worldTod);
    if (ph !== worldPhase) {
      worldPhase = ph;
      const isN = WT.isNightHour(WT.todToHour(worldTod));
      for (const [, p] of getPlayers()) {
        send(p, { t: 'time_phase', phase: ph, isNight: isN });
      }
    }
    const now = Date.now();
    const syncMs = WT.SYNC_INTERVAL_MS || 1000;
    if (now - lastTimeSync >= syncMs) {
      lastTimeSync = now;
      broadcastTime(false);
    }
  }

  function handleTimeMessage(p, msg, isGM) {
    if (msg.t === 'set_time') {
      const allowed = (typeof isGM === 'function' && isGM(p)) || (p && (p.dev || p.gm || (p.accessLevel >= 50) || p.editorKey || (p.yid && String(p.yid).startsWith('local_'))));
      if (!allowed) {
        send(p, { t: 'err', msg: 'set_time: только для GM' });
        return true;
      }
      if (typeof msg.hour === 'number' && isFinite(msg.hour)) {
        setWorldHour(msg.hour);
        if (!msg.silent) {
          send(p, { t: 'chat', name: 'Система', text: '⏱ Время мира: ' + WT.formatHour(WT.todToHour(worldTod)) });
        }
      } else if (typeof msg.tod === 'number' && isFinite(msg.tod)) {
        setWorldTod(msg.tod);
        if (!msg.silent) {
          send(p, { t: 'chat', name: 'Система', text: '⏱ Время мира (tod): ' + worldTod.toFixed(4) });
        }
      }
      return true;
    }

    if (msg.t === 'set_time_pause') {
      const allowed = (typeof isGM === 'function' && isGM(p)) || (p && (p.dev || p.gm || (p.accessLevel >= 50) || p.editorKey || (p.yid && String(p.yid).startsWith('local_'))));
      if (!allowed) {
        send(p, { t: 'err', msg: 'set_time_pause: только для GM' });
        return true;
      }
      setTimePaused(msg.paused);
      send(p, { t: 'chat', name: 'Система', text: timePaused ? '⏸ Время мира на паузе' : '▶ Время мира возобновлено' });
      return true;
    }

    return false;
  }

  return {
    DAY_LENGTH_SEC,
    worldTimePayload,
    wtSafe,
    broadcastTime,
    setWorldHour,
    setWorldTod,
    setTimePaused,
    isNight,
    getTod,
    getHour,
    getPhase,
    isPaused,
    tickDayNight,
    handleTimeMessage
  };
}

module.exports = {
  createWorldTimeHandler
};
