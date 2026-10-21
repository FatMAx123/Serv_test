// SERVER / HANDLERS / MOVEMENT-HANDLER.JS
// Обработка сетевого движения персонажей, античит скорости и позиционирование (Dead Reckoning & GeoData)
'use strict';

const WM = require('../../shared/world-metrics.js');
const BR = require('../../shared/buff-rules.js');

const SPEED_MAX = 12;
const MOVE_TOLERANCE = 1.25;
const MOVE_BURST_SEC = 0.8;
const MOVE_CORRECT_EPS = 1.5;
const MOVE_CORRECT_MS = 300;

function createMovementHandler(ctx) {
  const {
    send,
    broadcastMoveVecStart,
    broadcastMoveVecStop,
    GEO,
    isSyntheticBot,
    isGM = () => false,
    checkRate = () => true,
    playerStunned = () => false,
    playerWeightState = () => ({ speedMult: 1 }),
    cancelPlayerCast = () => {},
    closeStore = () => {},
    entityTransforms = null,
    markProfileDirty = () => {},
    saveProfileNow = () => {},
    syncPlayerRegionSubscription = () => {},
    ensureNearbyMobs = () => {},
    isPeaceAt = () => false,
    zoneLabelAt = () => '',
    IS_CLUSTER = false,
    clusterIpc = null,
    ZS = null,
    TOTAL_WORKERS = 1,
    CURRENT_WORKER_ID = 0,
    initiateClusterHandoff = () => {},
    getTickMsLast = () => 0,
    getElHistogram = () => null
  } = ctx;

  /** Актуальная разрешённая скорость бега: база класса+уровня+экипа × баффы × slow */
  function playerSpeedNow(p) {
    let s = +p.speedBase;
    if (!Number.isFinite(s) || s <= 0) {
      s = (p.combatPack && +p.combatPack.speedBase) || 7.5;
      p.speedBase = s;
    }
    const now = Date.now();
    const buffs = p.buffs;
    if (buffs && buffs.length) {
      for (let i = 0; i < buffs.length; i++) {
        const b = buffs[i];
        if (b && b.speedMult > 0 && b.until > now) s *= b.speedMult;
      }
    }
    const slowM = BR.slowMult(p.debuffs, now);
    if (slowM < 1) s *= slowM;
    const wPen = playerWeightState(p);
    if (wPen && wPen.speedMult < 1) s *= wPen.speedMult;
    if ((p.gm || isGM(p)) && p.gmSpeedMul && p.gmSpeedMul > 1) {
      s *= p.gmSpeedMul;
      return Math.min(SPEED_MAX * p.gmSpeedMul, Math.max(0.5, s));
    }
    return Math.min(SPEED_MAX, Math.max(0.5, s));
  }

  /** Накопитель разрешённой дистанции (token bucket) с компенсацией джиттера */
  function moveBudget(p, now) {
    const spd = playerSpeedNow(p);
    const elHistogram = getElHistogram();
    const elLagMs = elHistogram ? (elHistogram.mean / 1e6) : 0;
    const tickMsLast = getTickMsLast();
    const lagMs = Math.max(typeof tickMsLast === 'number' ? tickMsLast : 0, elLagMs);
    const lagFactor = lagMs > 60 ? Math.min(4.0, lagMs / 60) : 1.0;
    const tolerance = MOVE_TOLERANCE * lagFactor;
    const last = p._moveBudgetAt || 0;
    let dt = last ? (now - last) / 1000 : MOVE_BURST_SEC;
    if (!(dt > 0)) dt = 0;
    if (dt < 0.04 && last > 0 && (+p._moveBudget || 0) < spd * tolerance * 0.1) {
      dt = 0.05;
    }
    const cap = spd * tolerance * MOVE_BURST_SEC;
    p._moveBudgetAt = now;
    let b = (+p._moveBudget || 0) + spd * tolerance * dt;
    if (b > cap) b = cap;
    p._moveBudget = b;
    return b;
  }

  /** Сбросить бюджет после телепорта или спавна с начальным burst-лимитом */
  function resetMoveBudget(p) {
    const spd = playerSpeedNow(p);
    p._moveBudget = spd * MOVE_TOLERANCE * MOVE_BURST_SEC;
    p._moveBudgetAt = Date.now();
    p._speedViol = 0;
    p._syncSentAt = Date.now();
  }

  /** Привязка к геодате пола */
  function snapStandY(ent) {
    if (!ent || !GEO || !GEO.ready()) return;
    ent.y = GEO.standY(ent.x, ent.z, ent.y);
  }

  /** После бюджета скорости — не сквозь меш/проп/стену острова */
  function geoClamp(p, tx, tz) {
    if (!GEO || !GEO.ready()) return { x: tx, z: tz };
    const g = GEO.moveAlong(p.x, p.z, tx, tz, p.y);
    p.y = g.y;
    return { x: g.x, z: g.z };
  }

  /** Проверка скорости и коллизий с геодатой */
  function clampSpeed(p, nx, nz) {
    // Стресс-боты: не тратим ресурсы CPU на античит и синхронизируем высоту только при отсутствии Y
    if (p && p.yid && isSyntheticBot(p.yid)) {
      if (p.y == null || !Number.isFinite(p.y)) {
        snapStandY(p);
      }
      return { x: nx, z: nz };
    }
    // NaN/Infinity: d = NaN, условие d > maxd ложно -> координаты уходили в игрока как есть.
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return { x: p.x, z: p.z };
    const now = Date.now();
    const maxd = moveBudget(p, now);
    const d = Math.hypot(nx - p.x, nz - p.z);
    let tx = nx, tz = nz;
    if (d <= maxd) {
      p._moveBudget = maxd - d;
      p._speedViol = 0;
    } else {
      p._moveBudget = 0;
      p._speedViol = (p._speedViol | 0) + 1;
      // Если клиент реально превышает подряд (>= 3 раз) и с прошлого hard-sync прошло > 1.2 с
      if (p._speedViol >= 3 && (now - (p._lastHardSyncAt || 0) > 1200)) {
        p._lastHardSyncAt = now;
        p._speedViol = 0; // Сбрасываем счетчик, чтобы не спамить hard self_sync на каждый последующий пакет!
        const spd = playerSpeedNow(p);
        p._moveBudget = spd * MOVE_TOLERANCE * 0.15; // Даем небольшой восстановительный запас для плавности
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z, hard: true });
      }
      // Лог не чаще раза в 10 с на игрока: иначе спидхак сам себе DoS по stderr.
      if (!isSyntheticBot(p.yid) && p._speedViol >= 20 && now - (p._speedVioLogAt || 0) > 10000) {
        p._speedVioLogAt = now;
        console.warn('[anticheat] speed clamp', p.name, 'pid=' + p.pid, 'yid=' + p.yid,
          'n=' + p._speedViol, 'd=' + d.toFixed(1), 'max=' + maxd.toFixed(1));
        p._speedViol = 0;
      }
      if (!(d > 0)) return { x: p.x, z: p.z };
      const k = maxd / d;
      tx = p.x + (nx - p.x) * k;
      tz = p.z + (nz - p.z) * k;
    }
    return geoClamp(p, tx, tz);
  }

  function doMove(p, msg) {
    if (p.dead) return;
    if (!checkRate(p, 'move')) return;
    // NaN проходил clampSpeed и делал игрока невидимым
    const nx = +msg.x, nz = +msg.z;
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    if (nx < -20000 || nx > 20000 || nz < -20000 || nz > 20000) return;
    // short stun/paralyze from mob skills
    if (playerStunned(p)) return;
    // L2: movement cancels sit -> run/walk regen
    if (p.sitting) p.sitting = false;
    if (p.store) closeStore(p, 'move');
    const prevX = p.x, prevZ = p.z;
    const c = clampSpeed(p, nx, nz);
    p.x = c.x; p.z = c.z;
    if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
    const nowMoveDirty = Date.now();
    if (!p._lastDirtyMoveAt || (nowMoveDirty - p._lastDirtyMoveAt > 2000) || Math.hypot(p.x - (p._lastDirtyX || p.x), p.z - (p._lastDirtyZ || p.z)) > 5) {
      p._lastDirtyMoveAt = nowMoveDirty;
      p._lastDirtyX = p.x;
      p._lastDirtyZ = p.z;
      markProfileDirty(p);
    }
    if (isSyntheticBot(p.yid)) {
      p.moving = true;
      p._lastMoveAt = Date.now();
      if (msg.walking != null) p.walking = !!msg.walking;
      const bdx = c.x - prevX;
      const bdz = c.z - prevZ;
      if (bdx * bdx + bdz * bdz > 0.0004) {
        p.facing = Math.atan2(bdx, bdz);
      }
    }
    if (IS_CLUSTER && clusterIpc && !isSyntheticBot(p.yid) && ZS) {
      const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
      if (targetWorker !== CURRENT_WORKER_ID) {
        initiateClusterHandoff(p, targetWorker);
        return;
      }
    }
    if (p.casting && Math.hypot(p.x - p.casting.startX, p.z - p.casting.startZ) > 1.2) {
      cancelPlayerCast(p, 'move');
    }

    // Dead Reckoning: отслеживание вектора и вещание MOVE_VEC_START (Спринт 1, v2.2)
    const moveDx = c.x - prevX;
    const moveDz = c.z - prevZ;
    const moveDist = Math.hypot(moveDx, moveDz);
    const nowMove = Date.now();
    if (moveDist > 0.05) {
      p.facing = Math.atan2(moveDx, moveDz);
      const spd = playerSpeedNow(p);
      const lastVec = p._moveVec;
      let destX = null, destZ = null;
      if (msg.destX != null && msg.destZ != null && Number.isFinite(+msg.destX) && Number.isFinite(+msg.destZ)) {
        const dToDest = Math.hypot(+msg.destX - c.x, +msg.destZ - c.z);
        if (dToDest > 0.5) {
          destX = +msg.destX;
          destZ = +msg.destZ;
        }
      }

      if (msg.walking != null) p.walking = !!msg.walking;
      const isWalking = !!p.walking;
      const effectiveSpeed = isWalking ? Math.max(1.0, spd * 0.55) : spd;

      // Если есть реальная целевая точка пути (клик мышью игрока или целевой вейпоинт бота):
      if (destX != null && destZ != null) {
        const destChanged = !lastVec || Math.hypot(destX - lastVec.targetX, destZ - lastVec.targetZ) > 1.2;
        const needsNewVec = destChanged || (nowMove - lastVec.timestamp > 6000);

        if (needsNewVec) {
          const totD = Math.hypot(destX - c.x, destZ - c.z);
          p._moveVec = {
            startX: c.x,
            startZ: c.z,
            targetX: destX,
            targetZ: destZ,
            speed: effectiveSpeed,
            timestamp: nowMove,
            walking: isWalking,
            totalD: totD,
            invTotalD: totD > 0.05 ? (1.0 / totD) : 0,
            predTick: -1,
            inRange: false
          };
          broadcastMoveVecStart(p, c.x, c.z, destX, destZ, effectiveSpeed, isWalking ? 1 : 0);
        }
      } else {
        if (lastVec) {
          p._moveVec = null;
          broadcastMoveVecStop(p, c.x, c.z);
        }
      }
    }

    // Сервер обрезал шаг — сказать об этом сразу
    {
      const off = Math.hypot(nx - c.x, nz - c.z);
      const nowSync = Date.now();
      if (off > MOVE_CORRECT_EPS && nowSync - (p._syncSentAt || 0) > MOVE_CORRECT_MS) {
        p._syncSentAt = nowSync;
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
      }
    }

    p.moving = true;
    p._lastMoveAt = Date.now();
    if (msg.walking != null) p.walking = !!msg.walking;
    if (isSyntheticBot(p.yid)) {
      return;
    }
    const r = (WM.regionAt(p.x, p.z) || {});
    const peace = isPeaceAt(p.x, p.z);
    const zoneLabel = zoneLabelAt(p.x, p.z);
    if (r.id && r.id !== p.region) {
      const oldReg = p.region;
      p.region = r.id;
      syncPlayerRegionSubscription(p, oldReg, r.id);
      send(p, { t: 'region', region: r.id, peace: peace, zoneName: zoneLabel });
    } else if (zoneLabel && p._lastZoneLabel !== zoneLabel) {
      p._lastZoneLabel = zoneLabel;
      send(p, { t: 'region', region: p.region, peace: peace, zoneName: zoneLabel });
    }
    ensureNearbyMobs(p);
  }

  function doMoveStop(p, msg) {
    if (p.dead) return;
    if (!checkRate(p, 'move')) return;
    const sx = Number.isFinite(+msg.x) ? +msg.x : p.x;
    const sz = Number.isFinite(+msg.z) ? +msg.z : p.z;
    if (sx < -20000 || sx > 20000 || sz < -20000 || sz > 20000) return;
    if (!playerStunned(p) && (sx !== p.x || sz !== p.z)) {
      const c = clampSpeed(p, sx, sz);
      p.x = c.x; p.z = c.z;
      if (Math.hypot(sx - c.x, sz - c.z) > MOVE_CORRECT_EPS) {
        p._syncSentAt = Date.now();
        send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
      }
    } else if (sx !== p.x || sz !== p.z) {
      send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
    }
    if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
    markProfileDirty(p);
    p.moving = false;
    if (IS_CLUSTER && clusterIpc && !isSyntheticBot(p.yid) && ZS) {
      const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
      if (targetWorker !== CURRENT_WORKER_ID) { initiateClusterHandoff(p, targetWorker); return; }
    }
    {
      const r = (WM.regionAt(p.x, p.z) || {});
      if (r.id && r.id !== p.region) {
        const oldReg = p.region; p.region = r.id;
        syncPlayerRegionSubscription(p, oldReg, r.id);
        send(p, { t: 'region', region: r.id, peace: isPeaceAt(p.x, p.z), zoneName: zoneLabelAt(p.x, p.z) });
      }
    }
    p._lastMoveAt = Date.now();
    if (p._moveVec) {
      p._moveVec = null;
      broadcastMoveVecStop(p, p.x, p.z);
    }
  }

  function doPose(p, msg) {
    if (p.dead) return;
    if (!checkRate(p, 'action')) return;
    if (msg.sitting != null) {
      if (msg.sitting) {
        const inCombat = !!(p.isFlagged || (p.flagUntil && p.flagUntil > Date.now()) || (p._lastCombatAt && Date.now() - p._lastCombatAt < 10000));
        if (inCombat) {
          p.sitting = false;
          send(p, { t: 'msg', text: 'Нельзя сесть в бою!' });
          return;
        }
        p.sitting = true;
        p.moving = false;
      } else {
        p.sitting = false;
      }
    }
    if (msg.walking != null) p.walking = !!msg.walking;
  }

  function doEditorSetPos(p, msg) {
    if (!isGM(p)) { send(p, { t: 'err', msg: 'editor_set_pos: только для GM' }); return; }
    const nx = +msg.x, nz = +msg.z;
    if (!Number.isFinite(nx) || !Number.isFinite(nz)) return;
    if (Math.abs(nx) > 20000 || Math.abs(nz) > 20000) return;
    p.x = nx; p.z = nz;
    if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
    snapStandY(p);
    resetMoveBudget(p);
    const r2 = (WM.regionAt(p.x, p.z) || {});
    if (r2.id && r2.id !== p.region) {
      const oldReg = p.region;
      p.region = r2.id;
      syncPlayerRegionSubscription(p, oldReg, r2.id);
    }
    ensureNearbyMobs(p);

    send(p, {
      t: 'region', region: p.region,
      peace: isPeaceAt(p.x, p.z),
      zoneName: zoneLabelAt(p.x, p.z)
    });
    saveProfileNow(p);
    send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
  }

  function handleMovementMessage(p, msg) {
    if (!msg || !msg.t) return false;
    switch (msg.t) {
      case 'move':
        doMove(p, msg);
        return true;
      case 'move_stop':
        doMoveStop(p, msg);
        return true;
      case 'pose':
        doPose(p, msg);
        return true;
      case 'editor_set_pos':
        doEditorSetPos(p, msg);
        return true;
      default:
        return false;
    }
  }

  return {
    playerSpeedNow,
    moveBudget,
    resetMoveBudget,
    snapStandY,
    geoClamp,
    clampSpeed,
    doMove,
    doMoveStop,
    doPose,
    doEditorSetPos,
    handleMovementMessage,
    SPEED_MAX,
    MOVE_TOLERANCE,
    MOVE_BURST_SEC,
    MOVE_CORRECT_EPS,
    MOVE_CORRECT_MS
  };
}

module.exports = createMovementHandler;
