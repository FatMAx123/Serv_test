'use strict';

/**
 * server/world/spot-manager.js
 * ============================================================================
 * Стриминг спотов мобов (L2 lazy-spawn / despawn с гистерезисом LOAD/UNLOAD)
 * и географические хелперы регионов мира (isPeaceAt, zoneLabelAt, regionNameById).
 * ============================================================================
 */

const G = require('../../shared/game-rules.js');
const WM = require('../../shared/world-metrics.js');
const MOB_DB = require('../../shared/mob-db.js');

function createSpotManager(ctx) {
  const {
    Mob,
    players,
    mobs,
    spawnedSpots,
    respawnTimers,
    getServerSpots,
    allocateMobId,
    entityTransforms,
    spatialGrid,
    nativeSpatialGrid,
    SPOT_LOAD_R2,
    SPOT_UNLOAD_R2,
    dist2,
    isSyntheticBot,
    applyChampionRoll,
    announceRaidSpawn,
    mobInCombat,
    cancelRespawn,
    cancelRespawnsForSpot,
    despawnMobSilent
  } = ctx;

  function spawnSpot(sp, idx) {
    if (spawnedSpots.has(idx)) return;
    spawnedSpots.add(idx);

    let zoneLo = 1, zoneHi = 1;
    if (Array.isArray(sp.zoneLvl) && sp.zoneLvl.length >= 2) {
      zoneLo = Math.max(1, parseInt(sp.zoneLvl[0], 10) || 1);
      zoneHi = Math.max(zoneLo, parseInt(sp.zoneLvl[1], 10) || zoneLo);
    } else if (Array.isArray(sp.lvl) && sp.lvl.length >= 2) {
      zoneLo = Math.max(1, parseInt(sp.lvl[0], 10) || 1);
      zoneHi = Math.max(zoneLo, parseInt(sp.lvl[1], 10) || zoneLo);
    }

    let rollLo = zoneLo, rollHi = zoneHi;
    if (Array.isArray(sp.lvl) && sp.lvl.length >= 2) {
      const a = parseInt(sp.lvl[0], 10);
      const b = parseInt(sp.lvl[1], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        rollLo = Math.max(zoneLo, Math.min(zoneHi, a));
        rollHi = Math.max(rollLo, Math.min(zoneHi, b));
      }
    }
    if (!(rollHi >= rollLo) || !Number.isFinite(rollLo)) {
      rollLo = zoneLo; rollHi = zoneHi;
    }

    const nCount = Math.max(1, Math.min(12, parseInt(sp.n, 10) || 1));
    const spotR = Math.max(15, typeof sp.r === 'number' ? sp.r : 34);
    for (let i = 0; i < nCount; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spotR;
      const x = sp.x + Math.cos(ang) * rad;
      const z = sp.z + Math.sin(ang) * rad;
      const lvl = G.rng(rollLo, rollHi);
      const isBoss = !!sp.boss;
      const bossDef = isBoss ? (G.BOSSES[sp.mob] || null) : null;
      let bossRespawn;
      let spawnLvl = lvl;
      if (isBoss) {
        bossRespawn = 12 * 3600;
        try {
          const tpl = MOB_DB && MOB_DB.get && MOB_DB.get(sp.mob);
          if (tpl && tpl.respawnSec != null) bossRespawn = tpl.respawnSec;
          if (tpl && tpl.level && tpl.level.length >= 2) {
            const bLo = tpl.level[0] | 0;
            const bHi = Math.max(bLo, tpl.level[1] | 0);
            spawnLvl = G.rng(bLo, bHi);
          }
        } catch (eBossTpl) { /* keep 12h / zone lvl */ }
      }
      const passive = !sp.dangerZone && (!!sp.passive || zoneHi <= 5);
      const m = new Mob(allocateMobId(), sp.mob || 'scrapper', spawnLvl, x, z, bossDef, {
        passive: passive && !isBoss,
        boss: isBoss,
        respawnSec: isBoss ? bossRespawn : undefined,
        dangerZone: !!sp.dangerZone,
        huntZoneId: sp.huntZoneId || sp.region,
        zone: sp.zone || null
      });
      m.spotIdx = idx;
      m.huntZoneId = sp.huntZoneId || null;
      m.dangerZone = !!sp.dangerZone;
      m.level = Math.max(1, m.level | 0);
      applyChampionRoll(m);
      if (entityTransforms && m.transformSlot < 0) {
        m.transformSlot = entityTransforms.allocate(m.mid, 2 /* TYPE_MOB */, m.x, m.y, m.z, m.hp, m.maxHp, m.speed);
      }
      mobs.set(m.mid, m);
      if (isBoss) announceRaidSpawn(m);
    }
  }

  function isPeaceAt(x, z) {
    const r = WM.regionAt(x, z) || {};
    if (r.id === 'village') return true;
    if (r.kind === 'territory') return true;
    if (r.peace && !r.hunt) return true;
    return false;
  }

  function zoneLabelAt(x, z) {
    const r = WM.regionAt(x, z) || {};
    const name = r.name || null;
    if (!name) return null;
    if (r.hunt) {
      const l0 = (r.levelRange && r.levelRange[0] != null) ? r.levelRange[0]
        : (r.lvl && r.lvl[0] != null) ? r.lvl[0] : null;
      const l1 = (r.levelRange && r.levelRange[1] != null) ? r.levelRange[1]
        : (r.lvl && r.lvl[1] != null) ? r.lvl[1] : null;
      const isDanger = MOB_DB && typeof MOB_DB.isDangerZone === 'function' && (MOB_DB.isDangerZone(r.id) || MOB_DB.isDangerZone(name));
      const groupBadge = (isDanger || r.mode === 'party') ? ' [Групповая]' : '';
      if (l0 != null && l1 != null) return name + ' (ур.' + l0 + '–' + l1 + ')' + groupBadge;
      return name + groupBadge;
    }
    return name;
  }

  function regionNameById(id) {
    if (!id) return null;
    try {
      if (WM && WM.buildRegions) {
        const list = WM.buildRegions();
        for (let i = 0; i < list.length; i++) {
          if (list[i].id === id && list[i].name) return list[i].name;
        }
      }
    } catch (e) { /* ignore */ }
    if (id === 'village') return 'Деревня поющей стали';
    if (id === 'wild') return 'Остров поющей стали';
    return null;
  }

  function playerNear(x, z, r2, includeDead = false) {
    if (players.size === 0) return false;
    if (nativeSpatialGrid) {
      return nativeSpatialGrid.hasPlayerNear(x, z, Math.sqrt(r2), r2, includeDead);
    }
    if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
      if (typeof spatialGrid.hasPlayerNear === 'function') {
        const r = Math.sqrt(r2);
        return spatialGrid.hasPlayerNear(x, z, r, r2, includeDead);
      }
      const r = Math.sqrt(r2);
      let found = false;
      spatialGrid.forEachCandidate(x, z, r, (p) => {
        if (p && (includeDead || (!p.dead && (p.hp == null || p.hp > 0))) && dist2(p.x, p.z, x, z) <= r2) {
          found = true;
          return false;
        }
      }, null);
      return found;
    }
    for (const [, p] of players) {
      if (p && (includeDead || (!p.dead && (p.hp == null || p.hp > 0))) && dist2(p.x, p.z, x, z) <= r2) return true;
    }
    return false;
  }

  function spotHasBossRespawn(idx) {
    for (const [, rec] of respawnTimers) {
      if (rec && rec.spotIdx === idx && rec.boss) return true;
    }
    return false;
  }

  function spotShouldKeep(idx, sp, spotMobs) {
    if (!sp) return false;
    if (playerNear(sp.x, sp.z, SPOT_UNLOAD_R2, true)) return true;
    if (spotHasBossRespawn(idx)) return true;
    if (spotMobs && spotMobs.length > 0) {
      for (let i = 0; i < spotMobs.length; i++) {
        const m = spotMobs[i];
        if (m.eventId) return true;
        if (m.boss && m.hp > 0) return true;
        if (mobInCombat(m)) return true;
        if (playerNear(m.x, m.z, SPOT_UNLOAD_R2, true)) return true;
      }
    }
    return false;
  }

  function despawnSpot(idx) {
    const doomed = [];
    for (const [, m] of mobs) {
      if (m.spotIdx !== idx) continue;
      if (m.eventId) continue;
      if (m.boss && m.hp > 0) continue;
      doomed.push(m);
    }
    for (let i = 0; i < doomed.length; i++) {
      cancelRespawn(doomed[i].mid);
      despawnMobSilent(doomed[i]);
    }
    cancelRespawnsForSpot(idx);
    spawnedSpots.delete(idx);
  }

  function unloadFarSpots() {
    if (!spawnedSpots.size) return;
    const SERVER_SPOTS = getServerSpots();
    const spotMobsMap = new Map();
    for (const [, m] of mobs) {
      if (m.spotIdx == null) continue;
      let arr = spotMobsMap.get(m.spotIdx);
      if (!arr) {
        arr = [];
        spotMobsMap.set(m.spotIdx, arr);
      }
      arr.push(m);
    }
    let dropped = 0;
    for (const idx of [...spawnedSpots]) {
      const sp = SERVER_SPOTS[idx];
      if (spotShouldKeep(idx, sp, spotMobsMap.get(idx))) continue;
      despawnSpot(idx);
      dropped++;
    }
    if (dropped > 0) {
      console.log('[server] unload', dropped, 'spots, live mobs:', mobs.size);
    }
  }

  function ensureNearbyMobs(p) {
    if (!p) return;
    if (p.yid && isSyntheticBot(p.yid)) return;
    const SERVER_SPOTS = getServerSpots();
    if (spawnedSpots.size >= SERVER_SPOTS.length) return;
    let spawnedNow = 0;
    SERVER_SPOTS.forEach((sp, idx) => {
      if (spawnedSpots.has(idx)) return;
      if (dist2(p.x, p.z, sp.x, sp.z) > SPOT_LOAD_R2) return;
      spawnSpot(sp, idx);
      spawnedNow++;
    });
    if (spawnedNow > 0) {
      console.log('[server] nearby spawn +' + spawnedNow + ' spots, live mobs:', mobs.size);
    }
  }

  return {
    spawnSpot,
    isPeaceAt,
    zoneLabelAt,
    regionNameById,
    playerNear,
    spotHasBossRespawn,
    spotShouldKeep,
    despawnSpot,
    unloadFarSpots,
    ensureNearbyMobs
  };
}

module.exports = {
  createSpotManager
};

