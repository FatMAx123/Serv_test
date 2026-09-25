'use strict';

/**
 * Mob Lifecycle, AI, Aggro/Hate, Skills, Drops & World Simulation Handler (L2-like)
 * 
 * Manages:
 * - Mob instance instantiation with L2 stats and catalog overrides
 * - Hate / aggro targeting system (threat list, clan assist call, social aggro)
 * - Mob active skill casting & raid add minions management
 * - Mob death processing, loot generation, party EXP distribution, quest kill progression
 * - World events & periodic invasions
 * - Mob simulation loop (DoTs, movement, leash, roaming, return-to-spawn)
 */

function createMobHandler(deps) {
  const {
    mobs,
    players,
    spatialGrid = null,
    activeEvents,
    respawnTimers,
    spawnedSpots,
    getServerSpots,
    getNextId,
    GEO,
    MOB_DB,
    G,
    LR,
    EV,
    WM,
    dist2,
    send,
    broadcastAOI,
    playerNear,
    geoStepMob,
    mobDisplayNameServer,
    spawnMobDropPiles,
    splitExpToParty,
    partyMembers,
    questOnKill,
    saveProfileNow,
    regionNameById,
    zoneLabelAt,
    losGround,
    onPlayerHit,
    onPlayerDeath,
    applyPlayerDebuff,
    pushEffects,
    isPlayerImmortal,
    MELEE_RANGE = 4.0,
    MOB_RESPAWN_DEFAULT = 50,
    TICK_MS = 100,
    SPOT_LOAD_R2 = 400 * 400,
    SPOT_UNLOAD_R2 = 155 * 155,
    PARTY_EXP_R2 = 50 * 50,
    RAID_ADD_CAP = 4,
    CLAN_HELP_R2 = 26 * 26,
    DEBUG_EVENTS = false,
    entityTransforms = null
  } = deps;
  const L2 = deps.L2 || require('../../shared/l2-combat');
  const BR = deps.BR || require('../../shared/buff-rules');

class Mob {
  /**
   * @param {object|null} boss — BOSSES entry OR null
   * @param {object} [opts] — { passive, respawnSec }
   */
  constructor(mid, mobId, level, x, z, boss, opts) {
    opts = opts || {};
    const lv = Math.max(1, Math.min(80, (level | 0) || 1));
    // boss object = BOSSES entry; иначе кривая × роль из MOB_DB
    const s = boss && typeof boss === 'object' && boss.hp != null
      ? boss
      : G.mobStats(lv, mobId);
    this.mid = mid;
    this.entityKey = 'm' + mid;
    this.transformSlot = -1;
    this.mobId = mobId;
    this.level = lv;
    this.boss = !!(boss && boss.hp != null) || !!opts.boss;
    this.passive = !!opts.passive;
    this.x = x; this.z = z; this.spawnX = x; this.spawnZ = z;
    this.y = GEO.ready() ? GEO.standY(x, z) : 0;
    this.hp = s.hp; this.maxHp = s.hp;
    this.pAtk = s.pAtk; this.pDef = s.pDef;
    this.cAtk = s.cAtk != null ? s.cAtk : (s.mAtk != null ? s.mAtk : Math.floor(s.pAtk * 0.7));
    this.cDef = s.cDef != null ? s.cDef : (s.mDef != null ? s.mDef : Math.floor(s.pDef * 0.8));
    this.mAtk = this.cAtk; this.mDef = this.cDef;
    // L2: ≤5 ур. и passive — никогда не агрят сами
    this.aggro = this.passive ? 0 : (s.aggro != null ? +s.aggro : 0);
    if (!(this.aggro > 0)) this.aggro = 0;
    this.speed = s.speed != null ? s.speed : 3.2;
    this.attackRange = MELEE_RANGE; // override from mob-db ai below
    this.exp = s.exp != null ? s.exp : 20;
    // L2 outdoor respawn by level (sec)
    this.respawnSec = opts.respawnSec != null
      ? opts.respawnSec
      : (s.respawn != null ? s.respawn
        : (lv <= 8 ? 50 : lv <= 15 ? 75 : lv <= 25 ? 100 : 120));
    this.state = 'idle';
    this.wanderT = 0;
    this.atkCd = 0;
    this.spotIdx = -1;
    this.eventId = null;
    this.oocRegenT = 0; // out-of-combat soft regen timer
    this.navPath = null;
    this.navIdx = 0;
    this.navTargetX = 0;
    this.navTargetZ = 0;
    this.stuckTicks = 0;
    this.lastStepX = x;
    this.lastStepZ = z;
    // «коварные»: при низком HP убегают (mid+, не новички/боссы)
    // + ai overrides: aggroRange / moveSpeed / attackRange from mob-db
    let flee = opts.fleeAtHp;
    try {
      if (typeof MOB_DB !== 'undefined' && MOB_DB && MOB_DB.get) {
        const t = MOB_DB.get(mobId);
        if (t) {
          if (t.fleeAtHp > 0 && flee == null) flee = t.fleeAtHp;
          // mob-db passive/solo_passive always suppress self-aggro (even on high-lvl spots)
          if (t.behavior === 'passive' || t.role === 'solo_passive') {
            this.passive = true;
            this.aggro = 0;
          }
          if (!this.passive && t.aggroRange != null && +t.aggroRange > 0) {
            this.aggro = +t.aggroRange;
          }
          if (t.moveSpeed != null && +t.moveSpeed > 0) this.speed = +t.moveSpeed;
          if (t.attackRange != null && +t.attackRange > 0) this.attackRange = +t.attackRange;
          // C1: social ≠ «все в радиусе». Только pack / behavior=social.
          this.social = !this.boss && !!(t.social || t.role === 'pack' || t.behavior === 'social');
          if (t.enrageAtHp > 0) this.enrageAtHp = +t.enrageAtHp;
        }
      }
    } catch (e) { /* ignore */ }
    if (this.social == null) this.social = false;
    if (this.enrageAtHp == null) this.enrageAtHp = 0;
    this.enraged = false;
    this.addMids = [];
    this.summoned = !!opts.summoned;
    this.summonerMid = opts.summonerMid != null ? opts.summonerMid : null;
    if (flee == null && !this.boss && lv >= 12 && lv <= 30 && Math.random() < 0.22) {
      flee = 0.18 + Math.random() * 0.1; // 18–28% HP
    }
    this.fleeAtHp = flee > 0 ? +flee : 0;
    this.fleeUntil = 0;
    // L2 hate table: pid → hate score (boss re-aggro / tanking)
    this.hate = Object.create(null);
    this.hateDirty = false;
    // Mob skills from mob-db (bosses/named cast actively; trash sometimes)
    this.skillIds = [];
    this.skillCd = Object.create(null);
    this.named = false;
    this.role = null;
    this.champion = false;
    this.aoeAttacks = false;
    try {
      if (typeof MOB_DB !== 'undefined' && MOB_DB && MOB_DB.get) {
        const t = MOB_DB.get(mobId);
        if (t) {
          if (Array.isArray(t.skillIds) && t.skillIds.length) {
            this.skillIds = t.skillIds.filter(function (id) {
              return id && id !== 'bite_clamp';
            });
          }
          this.named = !!(t.named || t.behavior === 'named' || t.role === 'named');
          this.role = t.role || null;
          if (t.role === 'elite' || t.role === 'party_elite') this.champion = true;
          this.aoeAttacks = !!t.aoeAttacks;
        }
      }
    } catch (eSk) { /* ignore */ }
  }
}

/** Lookup mob skill def from mob-db catalog. */
function getMobSkillDef(skillId) {
  if (!skillId || !MOB_DB) return null;
  const cat = MOB_DB.SKILL_CATALOG;
  if (cat && cat[skillId]) return cat[skillId];
  return null;
}

function pruneAddMids(boss) {
  if (!boss || !boss.addMids) return 0;
  const keep = [];
  for (let i = 0; i < boss.addMids.length; i++) {
    const a = mobs.get(boss.addMids[i]);
    if (a && a.hp > 0) keep.push(boss.addMids[i]);
  }
  boss.addMids = keep;
  return keep.length;
}

let _removedMKey = '';
let _removedMid = 0;
let _removedX = 0, _removedZ = 0;
const _removedAoiPkt = { t: 'aoi', enter: [], leave: [''] };
const _removedDeadPkt = { t: 'mob_dead', mid: 0 };

function _notifyMobRemovedCandidate(pl) {
  if (!pl) return;
  if (pl.known && pl.known.has(_removedMKey)) {
    pl.known.delete(_removedMKey);
    _removedAoiPkt.leave[0] = _removedMKey;
    send(pl, _removedAoiPkt);
  } else if (_removedX != null && _removedZ != null) {
    const dx = pl.x - _removedX, dz = pl.z - _removedZ;
    if (dx * dx + dz * dz < 9025) { // 95 * 95
      _removedDeadPkt.mid = _removedMid;
      send(pl, _removedDeadPkt);
    }
  }
}

function notifyMobRemoved(mid, x, z) {
  _removedMKey = 'm' + mid;
  _removedMid = mid;
  _removedX = x;
  _removedZ = z;
  if (x != null && z != null && spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
    spatialGrid.forEachCandidate(x, z, 108, _notifyMobRemovedCandidate, null);
  } else {
    for (const [, pl] of players) _notifyMobRemovedCandidate(pl);
  }
  _removedMKey = '';
}

function despawnMobSilent(a) {
  if (!a) return;
  const mid = a.mid;
  const x = a.x, z = a.z;
  if (entityTransforms && a.transformSlot >= 0) {
    entityTransforms.free(a.transformSlot);
    a.transformSlot = -1;
  }
  mobs.delete(mid);
  notifyMobRemoved(mid, x, z);
}

function despawnAdds(boss) {
  if (!boss || !boss.addMids || !boss.addMids.length) return;
  const ids = boss.addMids.slice();
  boss.addMids = [];
  for (let i = 0; i < ids.length; i++) {
    despawnMobSilent(mobs.get(ids[i]));
  }
}

function spawnRaidAdds(boss, def, tankPid) {
  if (!boss || !def) return 0;
  const spec = def.summon || { mobId: 'welding_drone', count: [2, 3], levelOffset: -2 };
  const addId = spec.mobId || 'welding_drone';
  if (addId === boss.mobId) return 0;
  let addTpl = null;
  try { addTpl = MOB_DB && MOB_DB.get && MOB_DB.get(addId); } catch (e) { addTpl = null; }
  if (addTpl && (addTpl.role === 'raid' || addTpl.role === 'field_rb' || addTpl.boss)) return 0;
  const live = pruneAddMids(boss);
  const wantMin = Array.isArray(spec.count) ? (spec.count[0] | 0) : (spec.count | 0) || 2;
  const wantMax = Array.isArray(spec.count) ? (spec.count[1] | 0) : wantMin;
  const want = Math.max(1, G.rng ? G.rng(wantMin, wantMax) : wantMin);
  const room = Math.max(0, RAID_ADD_CAP - live);
  const n = Math.min(want, room);
  if (n <= 0) return 0;
  const off = spec.levelOffset != null ? +spec.levelOffset : -2;
  const addLvl = Math.max(1, (boss.level | 0) + off);
  let spawned = 0;
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 3.5 + Math.random() * 3;
    const ax = boss.x + Math.cos(ang) * rad;
    const az = boss.z + Math.sin(ang) * rad;
    const add = new Mob(getNextId(), addId, addLvl, ax, az, null, {
      passive: false,
      boss: false,
      summoned: true,
      summonerMid: boss.mid,
      respawnSec: 0
    });
    add.spotIdx = -1;
    add.huntZoneId = boss.huntZoneId || null;
    add.social = false;
    add.enrageAtHp = 0;
    if (add.skillIds && add.skillIds.length) {
      add.skillIds = add.skillIds.filter(function (sid) { return sid !== 'summon_drones'; });
    }
    if (tankPid != null) addMobHate(add, tankPid, 80, { force: true, assist: true });
    if (entityTransforms && add.transformSlot < 0) {
      add.transformSlot = entityTransforms.allocate(add.mid, 2 /* TYPE_MOB */, add.x, add.y, add.z, add.hp, add.maxHp, add.speed);
    }
    mobs.set(add.mid, add);
    if (!boss.addMids) boss.addMids = [];
    boss.addMids.push(add.mid);
    spawned++;
  }
  return spawned;
}

let _currentFxMob = null;
let _currentFxPkt = null;
const _sharedSkillFxPkt = {
  t: 'skill_fx',
  mid: 0,
  targetPid: undefined,
  skillId: '',
  skillName: '',
  name: '',
  mobId: '',
  fromMob: true
};

function _sendSkillFxCandidate(pl) {
  if (!pl || !_currentFxMob || !_currentFxPkt) return;
  const dx = pl.x - _currentFxMob.x, dz = pl.z - _currentFxMob.z;
  if (dx * dx + dz * dz > 9025) return; // 95 * 95
  send(pl, _currentFxPkt);
}

let _currentAoeMob = null;
let _currentAoeR2 = 0;
let _currentAoeTargets = null;

function _collectAoeCandidate(p) {
  if (!p || p.dead || p.hp <= 0 || !_currentAoeMob) return;
  const dx = p.x - _currentAoeMob.x, dz = p.z - _currentAoeMob.z;
  if (dx * dx + dz * dz <= _currentAoeR2) {
    _currentAoeTargets.push(p);
  }
}

let _enrageMob = null;
let _enrageFxPkt = null;
let _enrageMsgPkt = null;
const _sharedEnrageMsgPkt = { t: 'msg', text: '' };

function _sendEnrageCandidate(pl) {
  if (!pl || !_enrageMob) return;
  const dx = pl.x - _enrageMob.x, dz = pl.z - _enrageMob.z;
  if (dx * dx + dz * dz > 9025) return;
  send(pl, _enrageFxPkt);
  send(pl, _enrageMsgPkt);
}

let _aggroMob = null;
let _aggroBestDist2 = 0;
let _aggroBestPlayer = null;

function _checkAggroCandidate(p) {
  if (!p || p.dead || p.hp <= 0 || !_aggroMob) return;
  const dx = p.x - _aggroMob.x, dz = p.z - _aggroMob.z;
  const d = dx * dx + dz * dz;
  if (d < _aggroBestDist2) {
    _aggroBestDist2 = d;
    _aggroBestPlayer = p;
  }
}

/**
 * Try cast a skill from m.skillIds at player `near`.
 * Returns true if a skill was cast (skip AA this tick).
 */
function tryMobSkill(m, near, atkBase) {
  if (!m || !near || near.dead || near.hp <= 0) return false;
  if (!m.skillIds || !m.skillIds.length) return false;
  const now = Date.now();
  const elite = !!(m.boss || m.named);
  // trash: low chance to even attempt a skill roll
  if (!elite && !m.aoeAttacks && Math.random() > 0.18) return false;

  const dist = Math.hypot(near.x - m.x, near.z - m.z);
  const ready = [];
  for (let i = 0; i < m.skillIds.length; i++) {
    const id = m.skillIds[i];
    const def = getMobSkillDef(id);
    if (!def) continue;
    const cdMs = Math.max(2, +(def.cd != null ? def.cd : 8)) * 1000;
    if ((m.skillCd[id] || 0) > now) continue;
    // range: skill range, or attackRange for melee skills
    let skRange = def.range != null ? +def.range : (m.attackRange || MELEE_RANGE);
    if (skRange <= 0 && def.aoe) skRange = +def.aoe + 1;
    if (skRange <= 0) skRange = m.attackRange || MELEE_RANGE;
    if (dist > skRange + 0.75) continue;
    if (def.type !== 'buff' && def.type !== 'heal' && def.type !== 'summon' &&
        !losGround(m.x, m.z, near.x, near.z)) continue;
    // buff/heal are self — always "in range"
    if (def.type === 'summon' && pruneAddMids(m) >= RAID_ADD_CAP) continue;
    if (def.type === 'buff' || def.type === 'heal' || def.type === 'summon') {
      ready.push({ id: id, def: def });
      continue;
    }
    ready.push({ id: id, def: def });
  }
  if (!ready.length) return false;

  // prefer skills that pass chance; elite always keeps at least one
  const rolled = [];
  for (let j = 0; j < ready.length; j++) {
    const ch = ready[j].def.chance != null ? +ready[j].def.chance : (elite ? 0.55 : 0.32);
    if (Math.random() < Math.max(0.2, Math.min(0.9, ch))) rolled.push(ready[j]);
  }
  const pool = rolled.length ? rolled : (elite ? ready : []);
  if (!pool.length) return false;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const def = pick.def;
  const id = pick.id;

  m.skillCd[id] = now + Math.max(2, +(def.cd != null ? def.cd : 8)) * 1000;
  m.atkCd = elite ? 1100 : 1400;

  // VFX + skill name to AOI (skillName + name both set — client must not fall back to raw id)
  const skName = def.name || id;
  const targetPid = (near && near.pid != null) ? near.pid : undefined;
  _currentFxMob = m;
  _sharedSkillFxPkt.mid = m.mid;
  _sharedSkillFxPkt.targetPid = targetPid;
  _sharedSkillFxPkt.skillId = id;
  _sharedSkillFxPkt.skillName = skName;
  _sharedSkillFxPkt.name = skName;
  _sharedSkillFxPkt.mobId = m.mobId;
  _currentFxPkt = _sharedSkillFxPkt;

  if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
    spatialGrid.forEachCandidate(m.x, m.z, 95, _sendSkillFxCandidate, null);
  } else {
    for (const [, pl] of players) _sendSkillFxCandidate(pl);
  }
  _currentFxMob = null;
  _currentFxPkt = null;

  // Self buff / heal
  if (def.type === 'heal') {
    const heal = Math.max(1, Math.floor(m.maxHp * (def.power > 0 && def.power < 1 ? def.power : 0.1)));
    m.hp = Math.min(m.maxHp, m.hp + heal);
    if (entityTransforms && m.transformSlot >= 0) entityTransforms.updateHp(m.transformSlot, m.hp);
    return true;
  }
  if (def.type === 'buff') {
    m.buffAtkUntil = now + 8000;
    m.buffAtkMult = 1.28;
    m.buffSpdUntil = now + 8000;
    m.buffSpdMult = 1.2;
    return true;
  }
  if (def.type === 'summon' || def.type === 'social') {
    if (def.type === 'summon') {
      const tank = near && near.pid != null ? near.pid : (m.target != null ? m.target : null);
      spawnRaidAdds(m, def, tank);
    }
    return true;
  }

  const isCircuit = def.type === 'circuit';
  let baseAtk = isCircuit ? (m.cAtk || m.pAtk || atkBase) : atkBase;
  if (m.buffAtkUntil && m.buffAtkUntil > now && m.buffAtkMult) {
    baseAtk = Math.floor(baseAtk * m.buffAtkMult);
  }
  const power = def.power != null ? +def.power : 1.0;
  const aoeR = def.aoe != null ? +def.aoe : 0;
  const targets = [];
  if (aoeR > 0) {
    _currentAoeMob = m;
    _currentAoeR2 = aoeR * aoeR;
    _currentAoeTargets = targets;
    if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
      spatialGrid.forEachCandidate(m.x, m.z, aoeR, _collectAoeCandidate, null);
    } else {
      for (const [, p] of players) _collectAoeCandidate(p);
    }
    _currentAoeMob = null;
    _currentAoeTargets = null;
    if (!targets.length) targets.push(near);
  } else {
    targets.push(near);
  }

  for (let ti = 0; ti < targets.length; ti++) {
    const tgt = targets[ti];
    if (!tgt || tgt.dead || tgt.hp <= 0) continue;
    const tPack = tgt.combatPack || {};
    const defP = isCircuit
      ? (tPack.cDef || tgt.cDef || 40)
      : (tPack.pDef || tgt.pDef || 40);
    const scaled = Math.max(1, Math.floor(baseAtk * Math.max(0.15, power)));

    let dmg, isCrit = false, isBlocked = false;
    if (!isCircuit) {
      const hit = L2.resolveHit(
        {
          pAtk: scaled,
          accuracy: m.accuracy != null ? m.accuracy : (18 + (m.level || 1) * 1.4),
          critRate: 80,
          level: m.level || 1
        },
        {
          pDef: defP,
          evasion: tPack.evasion != null ? tPack.evasion : (tgt.evasion != null ? tgt.evasion : (15 + (tgt.level || 1) * 1.2)),
          hasShield: !!tPack.hasShield,
          shieldDef: tPack.shieldDef || 0,
          blockBonus: tPack.blockBonus || 0,
          level: tgt.level || 1
        },
        { skillPower: 1.0, damageType: 'physical' }
      );
      if (hit.missed) {
        send(tgt, {
          t: 'hit', dmg: 0, miss: true, crit: false, blocked: false, by: 'm' + m.mid,
          mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId), mobLevel: m.level,
          skillId: id, skillName: skName
        });
        continue;
      }
      dmg = hit.damage;
      isCrit = !!hit.crit;
      isBlocked = !!hit.blocked;
    } else {
      const r = G.rollDamage(scaled, Math.max(1, defP), 0.1, { damageType: 'circuit' });
      dmg = r.dmg;
      isCrit = !!(r.crit || r.isCrit);
    }
    if (def.type === 'debuff' || def.type === 'control') {
      dmg = Math.max(1, Math.floor(dmg * 0.4));
    }
    if ((m.level || 1) <= 5) dmg = Math.min(dmg, isCrit ? 30 : 22);
    if (isPlayerImmortal(tgt)) {
      dmg = 0;
      continue;
    }
    tgt.hp = Math.max(0, tgt.hp - dmg);
    onPlayerHit(tgt, dmg);

    // Apply effect → server state + client status icons (L2-like) with rollMagicLand
    const applied = [];
    if (def.effect) {
      const eff = def.effect;
      const durSec = Math.max(0.5, +(eff.duration != null ? eff.duration : 3));
      const durMs = Math.floor(durSec * 1000);
      const effId = String(eff.id || def.id || id);
      const effName = eff.name || def.name || id;

      const defLvl = tgt.level || 1;
      const atkLvl = m.level || 1;
      const atkInt = m.int != null ? m.int : (20 + atkLvl);
      const atkStr = m.str != null ? m.str : (22 + atkLvl);
      const tPrimary = (tPack && tPack.primary) || (tgt && tgt.primary) || {};
      const defMen = tPrimary.MEN || tgt.men || 20;
      const defCon = tPrimary.CON || tgt.con || 20;

      if (eff.speed != null && +eff.speed < 1) {
        const slowBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.75);
        const slowLand = L2.rollMagicLand
          ? L2.rollMagicLand(slowBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < slowBase);
        if (slowLand) {
          const slowMult = Math.max(0.35, +eff.speed);
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'slow', until: now + durMs,
            slowMult: slowMult, icon: effId || 'slow_oil', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'slow',
            duration: durSec, until: now + durMs, mult: slowMult,
            icon: effId || 'slow_oil'
          });
        }
      }
      if (eff.speed != null && +eff.speed > 1) {
        // rare haste debuff on self only — skip on players
      }
      if (eff.stun || eff.confuse || eff.paralyze || /stun|paralyze|confuse/i.test(effId)) {
        const stunBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.60);
        const stunLand = L2.rollMagicLand
          ? L2.rollMagicLand(stunBase, atkStr, defCon, atkLvl, defLvl)
          : (Math.random() < stunBase);
        const stunResisted = tPack.stunResist && Math.random() < Math.min(0.8, tPack.stunResist / 100);
        if (stunLand && !stunResisted) {
          const stunMs = Math.min(durMs, 2500);
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'stun', stun: true,
            until: now + stunMs, icon: effId || 'stun', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'stun',
            duration: stunMs / 1000, until: now + stunMs, icon: effId || 'stun'
          });
        }
      }
      if (eff.silence || /silence|mute|глуш/i.test(effId)) {
        const silenceBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.65);
        const silenceLand = L2.rollMagicLand
          ? L2.rollMagicLand(silenceBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < silenceBase);
        if (silenceLand) {
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'silence', silence: true,
            until: now + durMs, icon: effId || 'silence_circuit', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'silence',
            duration: durSec, until: now + durMs, icon: effId || 'silence_circuit'
          });
        }
      }
      if (eff.dps != null && +eff.dps > 0) {
        const dotBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.80);
        const dotLand = L2.rollMagicLand
          ? L2.rollMagicLand(dotBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < dotBase);
        if (dotLand) {
          const dps = +eff.dps;
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'dot', until: now + durMs,
            dps: dps, tickAcc: 0, icon: effId || 'scald', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'dot',
            duration: durSec, until: now + durMs, dps: dps, icon: effId || 'scald'
          });
        }
      }
      if (eff.pDef != null && +eff.pDef < 1) {
        const pDefBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.75);
        const pDefLand = L2.rollMagicLand
          ? L2.rollMagicLand(pDefBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < pDefBase);
        if (pDefLand) {
          const pDefMult = Math.max(0.5, +eff.pDef);
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'pdef', until: now + durMs,
            pDefMult: pDefMult, icon: effId || 'acid', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'pdef',
            duration: durSec, until: now + durMs, mult: pDefMult, icon: effId || 'acid'
          });
        }
      }
      if (eff.accuracy != null && +eff.accuracy < 0) {
        const blindBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.75);
        const blindLand = L2.rollMagicLand
          ? L2.rollMagicLand(blindBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < blindBase);
        if (blindLand) {
          applyPlayerDebuff(tgt, {
            id: effId, name: effName, kind: 'blind', until: now + durMs,
            accFlat: +eff.accuracy, icon: effId || 'blind_spark', priority: 10
          }, now);
          applied.push({
            id: effId, name: effName, kind: 'blind',
            duration: durSec, until: now + durMs, icon: effId || 'blind_spark'
          });
        }
      }
      // generic land for debuff/control without typed tags
      if (!applied.length && (def.type === 'debuff' || def.type === 'control')) {
        const genBase = eff.landRate != null ? +eff.landRate : (eff.chance != null ? +eff.chance : 0.70);
        const genLand = L2.rollMagicLand
          ? L2.rollMagicLand(genBase, atkInt, defMen, atkLvl, defLvl)
          : (Math.random() < genBase);
        if (genLand) {
          applied.push({
            id: effId, name: effName, kind: 'debuff',
            duration: durSec, until: now + durMs, icon: effId || 'debuff'
          });
        }
      }
    }
    send(tgt, {
      t: 'hit',
      dmg: dmg,
      crit: isCrit,
      blocked: isBlocked,
      by: 'm' + m.mid,
      mid: m.mid,
      mobId: m.mobId,
      mobName: mobDisplayNameServer(m.mobId),
      mobLevel: m.level,
      skillId: id,
      skillName: skName,
      effects: applied.length ? applied : undefined,
      resisted: (def.effect && !applied.length && (def.type === 'debuff' || def.type === 'control')) ? true : undefined
    });
    if (applied.length) {
      send(tgt, { t: 'status_fx', effects: applied, skillId: id, skillName: skName });
      pushEffects(tgt);
    }
    if (tgt.hp <= 0) {
      onPlayerDeath(tgt, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
      if (m.hate) delete m.hate[String(tgt.pid)];
    }
  }
  return true;
}

// ─── L2-like hate / re-aggro ─────────────────────────────────
/** Crits generate more hate (L2-style); bosses even more sticky on big crits. */
function hateFromHit(m, damage, opts) {
  opts = opts || {};
  const dmg = Math.max(0, Math.floor(+damage || 0));
  if (dmg <= 0 && !opts.flat) return 0;
  let h = dmg;
  if (opts.crit) h = Math.floor(h * (m && m.boss ? 2.0 : 1.5));
  if (opts.skill) h = Math.floor(h * 1.15); // active skills pull a bit more than AA
  if (opts.flat) h += Math.floor(+opts.flat || 0);
  // first punch / debuff-only: ensure non-zero aggro
  if (h < 1) h = opts.debuff ? 40 : 1;
  return h;
}

/**
 * Add hate and optionally retarget.
 * L2: switch only if new hate exceeds current by ~10% (anti thrash).
 */
function addMobHate(m, pid, amount, opts) {
  if (!m || m.hp <= 0 || pid == null) return;
  opts = opts || {};
  const add = Math.max(0, Math.floor(+amount || 0));
  if (add <= 0) return;
  if (!m.hate) m.hate = Object.create(null);
  const key = String(pid);
  m.hate[key] = (m.hate[key] || 0) + add;
  m.hateDirty = true;
  m.state = 'chase';
  m._sleepUntil = 0; // Мгновенное пробуждение из спящего режима
  // soft retarget: immediate if no target / dead target; else hysteresis
  retargetFromHate(m, { force: !!opts.force });
  if (!opts.assist && !opts.noAssist) callClanHelp(m, pid);
}

/**
 * C1 clan help: только social того же клана (mobId) на том же споте.
 * Пассивные / соло на пастбище не бегут. Две пачки рядом не склеиваются.
 */
function callClanHelp(m, pid) {
  if (!m || !m.social || m.boss || pid == null) return;
  if (m.spotIdx == null || m.spotIdx < 0) return;
  if (m.state === 'return') return;
  const si = m.spotIdx;
  const clan = m.mobId;
  for (const [, o] of mobs) {
    if (!o || o === m || o.hp <= 0 || o.boss) continue;
    if (!o.social || o.mobId !== clan) continue;
    if (o.spotIdx !== si) continue;
    if (o.state === 'return') continue;
    const dx = o.x - m.x, dz = o.z - m.z;
    if (dx * dx + dz * dz > CLAN_HELP_R2) continue;
    if (hateOf(o, pid) > 0) continue;
    addMobHate(o, pid, 40, { force: true, assist: true });
  }
}

function clearMobHate(m) {
  if (!m) return;
  m.hate = Object.create(null);
  m.hateDirty = false;
  m.target = null;
  m.navPath = null;
  m.navIdx = 0;
  m.stuckTicks = 0;
}

/**
 * C1 Attackable.returnHome: у спавна моб полностью сбрасывается.
 * Иначе можно снять 90% HP, увести на лиш и добить позже — в C1 так нельзя.
 */
function resetMobOnHome(m) {
  if (!m) return;
  despawnAdds(m);
  m.hp = m.maxHp;
  m.dots = [];
  m.slowUntil = 0;
  m.slowMult = 1;
  m.atkRedUntil = 0;
  m.atkRedMult = 1;
  m.healRedUntil = 0;
  m.healRedMult = 1;
  m.buffAtkUntil = 0;
  m.buffAtkMult = 1;
  m.buffSpdUntil = 0;
  m.buffSpdMult = 1;
  m.enraged = false;
  m.fleeUntil = 0;
  m.oocRegenT = 0;
  m.leashT = 0;
  m.lostTargetT = 0;
  clearMobHate(m);
}

function hateOf(m, pid) {
  if (!m || !m.hate || pid == null) return 0;
  return m.hate[String(pid)] || 0;
}

/**
 * Pick highest-hate living player in range.
 * Switch if best > current * HATE_SWITCH_RATIO (L2-like).
 */
function retargetFromHate(m, opts) {
  opts = opts || {};
  if (!m || !m.hate) return null;
  const HATE_SWITCH = m.boss ? 1.08 : 1.12; // bosses re-aggro a bit easier on big spikes
  let bestPid = null;
  let bestH = -1;
  for (const k in m.hate) {
    const pid = +k;
    const pl = players.get(pid);
    if (!pl || pl.dead || pl.hp <= 0) {
      delete m.hate[k];
      continue;
    }
    const h = m.hate[k] || 0;
    if (h > bestH) {
      bestH = h;
      bestPid = pid;
    }
  }
  if (bestPid == null) {
    m.target = null;
    return null;
  }
  const cur = m.target;
  if (cur == null || opts.force) {
    m.target = bestPid;
    return players.get(bestPid) || null;
  }
  if (cur === bestPid) return players.get(bestPid) || null;
  const curH = hateOf(m, cur);
  // need to beat current target by margin (crit tank / burst DPS re-aggro)
  if (bestH > curH * HATE_SWITCH || bestH > curH + (m.boss ? 80 : 40)) {
    m.target = bestPid;
  }
  return m.target != null ? (players.get(m.target) || null) : null;
}

/** Living top-hate player, ignoring range (boss long chase). */
function topHatePlayer(m) {
  if (!m || !m.hate) return null;
  retargetFromHate(m);
  if (m.target == null) return null;
  const p = players.get(m.target);
  if (!p || p.dead || p.hp <= 0) {
    delete m.hate[String(m.target)];
    m.target = null;
    return retargetFromHate(m, { force: true });
  }
  return p;
}

/**
 * L2 champion / иксовый: элита из шаблона уже помечена в конструкторе.
 * Обычный полевой моб с шансом ~1.2% становится X (C1 outdoor champion).
 */
function applyChampionRoll(m) {
  if (!m || m.boss || m.named) return false;
  const role = m.role || '';
  if (role === 'raid' || role === 'field_rb' || role === 'named') return false;
  if (role === 'elite' || role === 'party_elite') {
    m.champion = true;
    return true;
  }
  if (m.champion) return true;
  if (m.level < 6) return false;
  if (Math.random() > 0.012) return false;
  m.champion = true;
  m.hp = Math.max(1, Math.floor(m.hp * 2.2));
  m.maxHp = m.hp;
  m.pAtk = Math.max(1, Math.floor(m.pAtk * 1.28));
  m.cAtk = Math.max(1, Math.floor((m.cAtk || m.pAtk) * 1.2));
  m.mAtk = m.cAtk;
  m.exp = Math.max(1, Math.floor(m.exp * 2.4));
  if (m.aggro > 0) m.aggro = Math.max(m.aggro, Math.floor(m.aggro * 1.25));
  return true;
}

/** L2-like: outdoor respawn seconds by level (boss uses long table / flag). */
function mobRespawnSec(m) {
  if (!m) return MOB_RESPAWN_DEFAULT;
  if (m.boss) return m.respawnSec != null ? m.respawnSec : 3600;
  if (m.respawnSec != null) return m.respawnSec;
  const lv = m.level || 1;
  if (lv <= 8) return 50;
  if (lv <= 15) return 75;
  if (lv <= 25) return 100;
  if (lv <= 35) return 120;
  return 150;
}

let _deadNotifyPids = null;
let _deadNotifyPkt = null;

function _notifyMobDeadCandidate(pl) {
  if (!pl || pl.pid == null || !_deadNotifyPids || !_deadNotifyPkt) return;
  if (!_deadNotifyPids.has(pl.pid)) {
    _deadNotifyPids.add(pl.pid);
    send(pl, _deadNotifyPkt);
  }
}

function onMobDeath(p, m) {
  if (!m || m.dead) return;
  m.dead = true;
  m.hp = 0;
  m.state = 'dead';
  clearMobHate(m);
  if (entityTransforms && m.transformSlot >= 0) {
    entityTransforms.free(m.transformSlot);
    m.transformSlot = -1;
  }

  // Оповещаем всех игроков в радиусе видимости моба о его гибели
  const deadPkt = { t: 'mob_dead', mid: m.mid };
  const notifiedPids = new Set();
  if (p && p.pid != null) {
    send(p, deadPkt);
    notifiedPids.add(p.pid);
  }
  _deadNotifyPids = notifiedPids;
  _deadNotifyPkt = deadPkt;
  if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
    spatialGrid.forEachCandidate(m.x, m.z, 108, _notifyMobDeadCandidate, null);
  } else {
    for (const [, pl] of players) _notifyMobDeadCandidate(pl);
  }
  _deadNotifyPids = null;
  _deadNotifyPkt = null;

  // Расчёт лута, спойла, опыта и квестов (если есть игрок-убийца)
  if (p) {
    const drop = LR.rollMobLoot(m.mobId, p.level, m.level, {
      boss: !!m.boss, event: !!m.eventId, champion: !!m.champion
    });
    if (drop && drop.adena && p.buffs && BR.foldMult) {
      const adenaM = BR.foldMult(p.buffs, 'adenaMult', Date.now());
      if (adenaM > 1) {
        drop.adena = Math.round(drop.adena * adenaM);
      }
    }
    const mx = m.x, mz = m.z;
    spawnMobDropPiles(mx, mz, drop, p.pid, { mobId: m.mobId });

    // Spoil mark → ground loot owned by spoiler (not auto-inv)
    if (m.spoilMarked) {
      let spoiler = p;
      if (m.spoilBy != null && players.has(m.spoilBy)) {
        spoiler = players.get(m.spoilBy) || p;
      }
      const rolled = LR.rollSpoil(m.mobId, spoiler.level || p.level, m.level);
      if (rolled && rolled.length) {
        spawnMobDropPiles(mx, mz, { adena: 0, items: rolled }, spoiler.pid, {
          mobId: m.mobId,
          spoil: true
        });
        send(spoiler, { t: 'msg', text: 'Вскрытие: детали выпали на землю.' });
      } else if (rolled !== null) {
        send(spoiler, { t: 'msg', text: 'Вскрытие: пусто.' });
      }
    }

    // EXP only (loot is on ground — chat is per loot_spawn with item name)
    splitExpToParty(p, m.exp, m.level, {
      mobId: m.mobId,
      mobName: mobDisplayNameServer(m.mobId)
    });

    // Прогресс kill-целей: убийце и пати в радиусе EXP
    const questGetters = partyMembers(p).filter((m2) =>
      m2 && !m2.dead && dist2(m2.x, m2.z, p.x, p.z) <= PARTY_EXP_R2
    );
    if (!questGetters.length) questGetters.push(p);
    for (const g2 of questGetters) {
      if (questOnKill(g2, m.mobId)) saveProfileNow(g2);
    }

    if (p.karma > 0) {
      const mobExp = Math.max(10, Math.floor(m.exp || (m.level * 20)));
      const wash = Math.max(1, Math.min(p.karma, Math.floor((m.level || 1) * 8 + mobExp * 0.15)));
      p.karma = Math.max(0, p.karma - wash);
      send(p, { t: 'flag', flagged: p.isFlagged, karma: p.karma });
    }
  }

  if (m.eventId) maybeFinishInvasion(m.eventId);
  if (m.boss) announceRaidDeath(m);

  despawnAdds(m);

  // Мёртвый моб немедленно удаляется из реестра активных мобов сервера
  const mid = m.mid;
  mobs.delete(mid);

  if (!m.eventId && !m.summoned) {
    const mobId = m.mobId, lvl = m.level, sx = m.spawnX, sz = m.spawnZ;
    const si = m.spotIdx, boss = m.boss, passive = m.passive, rs = mobRespawnSec(m);
    const hz = m.huntZoneId;
    const rec = { spotIdx: si, boss: !!boss };
    rec.timer = setTimeout(() => {
      respawnTimers.delete(mid);
      // Никого рядом — не держим живого моба в пустоте (L2: регион без игроков спит).
      if (si != null && si >= 0) {
        const sp = getServerSpots()[si];
        if (!sp || !playerNear(sp.x, sp.z, SPOT_LOAD_R2, true)) {
          spawnedSpots.delete(si);
          return;
        }
      }
      const bd = boss ? (G.BOSSES[mobId] || null) : null;
      const nm = new Mob(getNextId(), mobId, lvl, sx, sz, bd, {
        passive: !!passive, boss: !!boss, respawnSec: rs
      });
      nm.spotIdx = si;
      nm.huntZoneId = hz || null;
      applyChampionRoll(nm);
      if (entityTransforms && nm.transformSlot < 0) {
        nm.transformSlot = entityTransforms.allocate(nm.mid, 2 /* TYPE_MOB */, nm.x, nm.y, nm.z, nm.hp, nm.maxHp, nm.speed);
      }
      mobs.set(nm.mid, nm);
      if (boss) announceRaidSpawn(nm);
    }, Math.max(8, rs) * 1000);
    if (si != null && si >= 0) respawnTimers.set(mid, rec);
  } else {
    mobs.delete(m.mid);
  }
}

function eventZoneName(regionId, x, z) {
  return regionNameById(regionId) || zoneLabelAt(x, z) || regionId || '';
}

function eventStartPayload(ae, extra) {
  extra = extra || {};
  const first = extra.mob || (ae && ae.bossMid != null ? mobs.get(ae.bossMid) : null);
  return {
    t: 'event_start',
    kind: (ae && ae.kind) || 'event',
    id: (ae && ae.id) || null,
    region: (ae && ae.regionId) || null,
    zoneName: (ae && ae.zoneName) || '',
    name: (ae && ae.name) || 'Событие',
    bossName: (ae && ae.bossName) || (first && mobDisplayNameServer(first.mobId)) || null,
    mobId: (ae && ae.mobId) || (first && first.mobId) || null,
    x: first ? first.x : (ae && ae.x),
    z: first ? first.z : (ae && ae.z),
    mid: first ? first.mid : (ae && ae.bossMid) || null,
    pack: (ae && ae.mids && ae.mids.length) || 0,
    endsAt: (ae && ae.endsAt) || 0
  };
}

function broadcastEvent(payload) {
  for (const [, pl] of players) send(pl, payload);
}

function announceRaidSpawn(m) {
  if (!m || !m.boss || !EV.isPhase1Raid(m.mobId)) return;
  const key = EV.raidKey(m.mobId);
  const ae = {
    kind: 'raid',
    id: m.mobId,
    key: key,
    bossMid: m.mid,
    mobId: m.mobId,
    regionId: m.huntZoneId || null,
    zoneName: eventZoneName(m.huntZoneId, m.x, m.z),
    name: (G.BOSSES[m.mobId] && G.BOSSES[m.mobId].name) || mobDisplayNameServer(m.mobId),
    bossName: (G.BOSSES[m.mobId] && G.BOSSES[m.mobId].name) || mobDisplayNameServer(m.mobId),
    x: m.x,
    z: m.z,
    endsAt: 0
  };
  activeEvents.set(key, ae);
  broadcastEvent(eventStartPayload(ae, { mob: m }));
}

function announceRaidDeath(m) {
  if (!m || !m.boss || !EV.isPhase1Raid(m.mobId)) return;
  const key = EV.raidKey(m.mobId);
  const ae = activeEvents.get(key);
  if (!ae || ae.bossMid !== m.mid) return;
  activeEvents.delete(key);
  broadcastEvent({
    t: 'event_end',
    kind: 'raid',
    id: m.mobId,
    region: ae.regionId || null,
    zoneName: ae.zoneName || eventZoneName(m.huntZoneId, m.x, m.z)
  });
}

function hasActiveInvasion() {
  for (const [, ae] of activeEvents) {
    if (ae && ae.kind === 'invasion') return true;
  }
  return false;
}

function liveEventMobs(eventId) {
  let n = 0;
  for (const [, m] of mobs) {
    if (m && m.eventId === eventId && m.hp > 0) n++;
  }
  return n;
}

function endInvasion(key, opts) {
  opts = opts || {};
  const ae = activeEvents.get(key);
  if (!ae || ae.kind !== 'invasion') return false;
  const mids = (ae.mids || []).slice();
  for (let i = 0; i < mids.length; i++) {
    const m = mobs.get(mids[i]);
    if (m && m.hp > 0) despawnMobSilent(m);
  }
  activeEvents.delete(key);
  if (!opts.silent) {
    broadcastEvent({
      t: 'event_end',
      kind: 'invasion',
      id: ae.id,
      region: ae.regionId || null,
      zoneName: ae.zoneName || ''
    });
  }
  return true;
}

function maybeFinishInvasion(eventId) {
  if (!eventId) return;
  const ae = activeEvents.get(eventId);
  if (!ae || ae.kind !== 'invasion') return;
  if (liveEventMobs(eventId) <= 0) endInvasion(eventId);
}

function startInvasion(ev, pick, opts) {
  opts = opts || {};
  if (!ev || !pick) return null;
  const key = EV.invasionKey(ev.id);
  if (activeEvents.has(key) && !opts.replace) return null;
  if (activeEvents.has(key)) endInvasion(key, { silent: true });
  const x = pick.x != null ? pick.x : (pick.bounds ? (pick.bounds[0] + pick.bounds[2]) / 2 : 0);
  const z = pick.z != null ? pick.z : (pick.bounds ? (pick.bounds[1] + pick.bounds[3]) / 2 : 0);
  const lv = EV.zoneLvl(pick);
  const rows = EV.expandPack(ev, lv[0], lv[1], function (a, b) { return G.rng(a, b); });
  if (!rows.length) return null;
  const radius = ev.packRadius || 16;
  const mids = [];
  let first = null;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const off = EV.packOffset(i, rows.length, radius, Math.random);
    const mx = x + off.dx;
    const mz = z + off.dz;
    const m = new Mob(getNextId(), row.mobId, row.level, mx, mz, null, { boss: false });
    m.eventId = key;
    m.huntZoneId = pick.id || null;
    m.spotIdx = -1;
    if (row.champion) m.champion = true;
    else applyChampionRoll(m);
    if (entityTransforms && m.transformSlot < 0) {
      m.transformSlot = entityTransforms.allocate(m.mid, 2 /* TYPE_MOB */, m.x, m.y, m.z, m.hp, m.maxHp, m.speed);
    }
    mobs.set(m.mid, m);
    mids.push(m.mid);
    if (!first) first = m;
  }
  const dur = EV.durationOf(ev, DEBUG_EVENTS);
  const ae = {
    kind: 'invasion',
    id: ev.id,
    key: key,
    regionId: pick.id,
    zoneName: eventZoneName(pick.id, x, z),
    name: ev.name,
    bossName: first ? mobDisplayNameServer(first.mobId) : null,
    mobId: first ? first.mobId : null,
    bossMid: first ? first.mid : null,
    mids: mids,
    x: x,
    z: z,
    endsAt: Date.now() + dur * 1000
  };
  activeEvents.set(key, ae);
  broadcastEvent(eventStartPayload(ae, { mob: first }));
  return ae;
}

function tickWorldEvents() {
  const now = Date.now();
  if (!tickWorldEvents._t) tickWorldEvents._t = now;
  for (const [key, ae] of [...activeEvents]) {
    if (ae && ae.kind === 'invasion' && ae.endsAt > 0 && now >= ae.endsAt) {
      endInvasion(key);
    }
  }
  const allEvents = (EV && EV.EVENTS) ? Object.values(EV.EVENTS) : [];
  if (!allEvents.length) return;
  if (!players.size) return;
  if (hasActiveInvasion()) return;
  if (!tickWorldEvents._evIdx) tickWorldEvents._evIdx = 0;
  const ev = allEvents[tickWorldEvents._evIdx % allEvents.length];
  const interval = EV.intervalOf(ev, DEBUG_EVENTS);
  if (!EV.shouldStart(now, tickWorldEvents._t, interval)) return;
  const hunts = (WM.buildHuntZones && WM.buildHuntZones()) || [];
  const pick = EV.pickHunt(hunts, ev, Math.random);
  if (!pick) return;
  tickWorldEvents._evIdx++;
  tickWorldEvents._t = now;
  startInvasion(ev, pick);
}

function mobInCombat(m) {
  if (!m || m.hp <= 0) return false;
  if (m.target != null && players.has(m.target)) {
    const t = players.get(m.target);
    if (t && !t.dead) return true;
  }
  if (m.hate) {
    for (const k in m.hate) {
      if (players.has(+k)) return true;
    }
  }
  return false;
}

let _currentDotMob = null;
let _currentDotPkt = null;

function _sendDotCandidate(pl) {
  if (!pl || !_currentDotMob || !_currentDotPkt) return;
  if (dist2(pl.x, pl.z, _currentDotMob.x, _currentDotMob.z) < 6400) { // 80 * 80
    send(pl, _currentDotPkt);
  }
}

let _mobTickCounter = 0;

function tickMobs() {
  _mobTickCounter = (_mobTickCounter + 1) | 0;
  const nowDot = Date.now();
  // DoT (Curse:Poison) — Interlude: тик каждые 3с
  for (const [, m] of mobs) {
    if (!m || m.hp <= 0 || !m.dots || !m.dots.length) continue;
    const keep = [];
    for (const d of m.dots) {
      if (d.next <= nowDot && d.left > 0) {
        m.hp = Math.max(0, m.hp - d.dmg);
        d.left -= 1;
        d.next = nowDot + (d.every || 3000);
        // DoT feeds hate (small) so poison doesn't drop aggro entirely
        if (d.by != null) addMobHate(m, d.by, hateFromHit(m, d.dmg, { skill: true }), { noAssist: true });
        _currentDotMob = m;
        _currentDotPkt = {
          t: 'dmg', mid: m.mid, dmg: d.dmg, crit: false, by: d.by,
          hp: m.hp, maxHp: m.maxHp,
          skillId: d.skillId || 'dot',
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        };
        if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
          spatialGrid.forEachCandidate(m.x, m.z, 80, _sendDotCandidate, null);
        } else {
          for (const [, pl] of players) _sendDotCandidate(pl);
        }
        _currentDotMob = null;
        _currentDotPkt = null;
        if (m.hp <= 0) {
          const killer = (d.by != null) ? players.get(d.by) : null;
          onMobDeath(killer || null, m);
          break;
        }
      }
      if (d.left > 0) keep.push(d);
    }
    m.dots = keep;
  }

  /**
   * Шаг моба к цели с поддержкой A* обхода вогнутых препятствий.
   * При свободном пути идёт напрямую, при застревании (stuckTicks >= 3)
   * строит A* маршрут с луч-сглаживанием (string pulling) вокруг углов.
   */
  function stepMobTowards(m, targetX, targetZ, speed, dt) {
    if (!m) return;
    // 1. Если уже есть рассчитанный маршрут обхода
    if (m.navPath && m.navPath.length > 0 && m.navIdx < m.navPath.length) {
      // Если цель сместилась более чем на 3м — пересчитываем путь
      if (Math.hypot(targetX - (m.navTargetX || 0), targetZ - (m.navTargetZ || 0)) > 3.0) {
        if (GEO && typeof GEO.findPath === 'function') {
          m.navPath = GEO.findPath(m.x, m.z, targetX, targetZ, { y: m.y });
          m.navIdx = 0;
          m.navTargetX = targetX;
          m.navTargetZ = targetZ;
        }
      }
      if (m.navPath && m.navIdx < m.navPath.length) {
        const wp = m.navPath[m.navIdx];
        const dWp = Math.hypot(wp.x - m.x, wp.z - m.z);
        if (dWp < Math.max(0.3, speed * dt * 0.75)) {
          m.navIdx++;
          if (m.navIdx >= m.navPath.length) {
            m.navPath = null;
          }
        }
        if (m.navPath && m.navIdx < m.navPath.length) {
          const curWp = m.navPath[m.navIdx];
          const wdx = curWp.x - m.x, wdz = curWp.z - m.z;
          const wlen = Math.hypot(wdx, wdz) || 1;
          const prevX = m.x, prevZ = m.z;
          const stepDist = Math.min(wlen, speed * dt);
          geoStepMob(m, m.x + (wdx / wlen) * stepDist, m.z + (wdz / wlen) * stepDist);
          const moved = Math.hypot(m.x - prevX, m.z - prevZ);
          if (moved < 0.02) {
            m.stuckTicks = (m.stuckTicks || 0) + 1;
            if (m.stuckTicks > 10) {
              m.navPath = null;
              m.stuckTicks = 0;
            }
          } else {
            m.stuckTicks = 0;
          }
          return;
        }
      }
    }

    // 2. Движение напрямую к цели
    const dx = targetX - m.x, dz = targetZ - m.z;
    const len = Math.hypot(dx, dz) || 1;
    const prevX = m.x, prevZ = m.z;
    const stepDist = Math.min(len, speed * dt);
    geoStepMob(m, m.x + (dx / len) * stepDist, m.z + (dz / len) * stepDist);
    const moved = Math.hypot(m.x - prevX, m.z - prevZ);

    if (moved < 0.02) {
      m.stuckTicks = (m.stuckTicks || 0) + 1;
      // При застревании на 3 тика (300 мс) запускаем A* обход
      if (m.stuckTicks >= 3) {
        if (GEO && typeof GEO.findPath === 'function') {
          m.navPath = GEO.findPath(m.x, m.z, targetX, targetZ, { y: m.y });
          m.navIdx = 0;
          m.navTargetX = targetX;
          m.navTargetZ = targetZ;
        }
        m.stuckTicks = 0;
      }
    } else {
      m.stuckTicks = 0;
    }
  }

  for (const [mid, m] of mobs) {
    if (m.hp <= 0) continue;
    if (m.summoned) {
      const owner = m.summonerMid != null ? mobs.get(m.summonerMid) : null;
      if (!owner || owner.hp <= 0 || owner.state === 'return' || owner.state === 'idle') {
        despawnMobSilent(m);
        continue;
      }
    }
    // Спящий режим мобов (Active Cells Sleep / Tier 2 LOD):
    // Дальние idle-мобы без игроков рядом (SPOT_UNLOAD_R = 155м) засыпают на 2500–3000 мс.
    // Смещение по mid ((mid * 37) % 500) равномерно распределяет проверки по временной шкале (Staggered).
    if (!m.eventId && !mobInCombat(m) && m.state !== 'return') {
      if (m._sleepUntil && nowDot < m._sleepUntil) {
        continue;
      }
      if (!playerNear(m.x, m.z, SPOT_UNLOAD_R2)) {
        if (m.state === 'chase' || m.state === 'flee') {
          m.state = 'return';
        } else {
          m._sleepUntil = nowDot + 2500 + ((mid * 37) % 500);
          continue;
        }
      } else {
        m._sleepUntil = 0;
      }
    }

    // Tier 1 Mob LOD (2 Hz = каждые 500 мс / 5 тактов):
    // Мобы вне боя в покое (idle) рядом с игроками выполняют поиск целей (агро) с тактом 2 Hz.
    // Снижает нагрузку на spatialGrid.forEachCandidate и геометрию карты высот на 80%.
    // Боссы, ивентовые мобы, мобы в бою (chase/flee/hate/DoT), возвращающиеся на спавн и ДВИЖУЩИЕСЯ (wander) ВСЕГДА идут на полной частоте 10 Hz!
    const isMovingOrCombat = m.boss || m.eventId || m.state === 'return' || m.state === 'chase' || m.state === 'flee' || m.state === 'wander' || mobInCombat(m);
    if (!isMovingOrCombat && ((_mobTickCounter + mid) % 5) !== 0) {
      continue;
    }
    const stepMs = isMovingOrCombat ? TICK_MS : (TICK_MS * 5);
    const dtMob = stepMs / 1000;
    if (!m.enraged && !m.summoned && m.enrageAtHp > 0 && m.maxHp > 0 &&
        m.hp <= m.maxHp * m.enrageAtHp) {
      m.enraged = true;
      m.buffAtkUntil = nowDot + 86400000;
      m.buffAtkMult = 1.5;
      m.buffSpdUntil = nowDot + 86400000;
      m.buffSpdMult = 1.3;
      const enName = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId) && MOB_DB.get(m.mobId).name) || m.mobId;
      _enrageMob = m;
      _sharedSkillFxPkt.mid = m.mid;
      _sharedSkillFxPkt.targetPid = undefined;
      _sharedSkillFxPkt.skillId = 'overclock';
      _sharedSkillFxPkt.skillName = 'Бешенство';
      _sharedSkillFxPkt.name = 'Бешенство';
      _sharedSkillFxPkt.mobId = m.mobId;
      _enrageFxPkt = _sharedSkillFxPkt;
      _sharedEnrageMsgPkt.text = enName + ' впадает в бешенство!';
      _enrageMsgPkt = _sharedEnrageMsgPkt;
      if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
        spatialGrid.forEachCandidate(m.x, m.z, 95, _sendEnrageCandidate, null);
      } else {
        for (const [, pl] of players) _sendEnrageCandidate(pl);
      }
      _enrageMob = null;
      _enrageFxPkt = null;
      _enrageMsgPkt = null;
    }
    if (m.atkCd > 0) m.atkCd -= stepMs;
    // Ice Bolt slow
    let spd = m.speed;
    if (m.slowUntil && m.slowUntil > nowDot && m.slowMult != null) spd *= m.slowMult;
    else { m.slowUntil = 0; m.slowMult = 1; }
    // Self overclock buff from mob skills
    if (m.buffSpdUntil && m.buffSpdUntil > nowDot && m.buffSpdMult) spd *= m.buffSpdMult;
    // Curse:Weakness — сниженный pAtk
    let atk = m.pAtk;
    if (m.atkRedUntil && m.atkRedUntil > nowDot && m.atkRedMult != null) atk = Math.floor(m.pAtk * m.atkRedMult);
    else { m.atkRedUntil = 0; m.atkRedMult = 1; }
    if (m.buffAtkUntil && m.buffAtkUntil > nowDot && m.buffAtkMult) {
      atk = Math.floor(atk * m.buffAtkMult);
    }

    // L2 outdoor: aggro short, chase long, leash only far from home — don't drop after a short kite
    // Bosses (RB-like): almost never leash while hate remains
    const isNight = typeof deps.isNight === "function" ? deps.isNight() : false;
    const nightAggroMult = (isNight && !m.boss) ? 1.2 : 1.0;
    const aggroR = (m.aggro > 0) ? (m.aggro * nightAggroMult) : 0;
    const chaseR = m.boss ? 220 : Math.max(aggroR * 5.0, 75);   // stick to target
    const leash = m.boss ? 280 : Math.max(aggroR * 6.5, 100);  // only then walk home
    const canAggro = !m.passive && aggroR > 0;
    let hasHate = false;
    if (m.hate) {
      for (const _ in m.hate) { hasHate = true; break; }
    }

    let near = null;

    // 1) Hate table (L2): always prefer top-hate living player
    if (hasHate || m.state === 'chase' || m.state === 'flee') {
      near = topHatePlayer(m);
      // drop a target only if they kited past leash from spawn (not just out of aggro radius)
      if (near && !m.boss && !m.summoned) {
        const dSpawnTarget = Math.hypot(near.x - m.spawnX, near.z - m.spawnZ);
        if (dSpawnTarget > leash * 1.15) {
          delete m.hate[String(near.pid)];
          near = topHatePlayer(m);
        }
      }
      // boss: keep chasing top hate across the field (only drop if absurdly far)
      if (near && m.boss) {
        const dSpawn = Math.hypot(near.x - m.spawnX, near.z - m.spawnZ);
        if (dSpawn > leash * 1.5) {
          delete m.hate[String(near.pid)];
          near = topHatePlayer(m);
        }
      }
    }

    // 2) Proximity aggro (not passive): first entry into hate (игнорируется в режиме return)
    if (!near && canAggro && m.state !== 'return') {
      let found = null;
      _aggroMob = m;
      _aggroBestDist2 = aggroR * aggroR;
      _aggroBestPlayer = null;
      if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
        spatialGrid.forEachCandidate(m.x, m.z, aggroR, _checkAggroCandidate, null);
      } else {
        for (const [, p] of players) _checkAggroCandidate(p);
      }
      found = _aggroBestPlayer;
      _aggroMob = null;
      _aggroBestPlayer = null;
      if (found) {
        // auto-aggro baseline hate so first player sticks until someone crits harder
        addMobHate(m, found.pid, m.boss ? 100 : 50, { force: true });
        near = players.get(m.target) || found;
      }
    }

    // 3) Passive retaliation already on hate via damage; if chase w/ target id only
    if (!near && m.target != null && m.state !== 'return') {
      const t = players.get(m.target);
      if (t && !t.dead && t.hp > 0) {
        if (m.boss || dist2(t.x, t.z, m.x, m.z) <= chaseR * chaseR) near = t;
      }
    }

    // Chase speed: catch runners (L2 outdoor mobs don't give up on a short kite)
    let chaseSpd = spd;
    if (near) {
      const dNear = Math.hypot(near.x - m.x, near.z - m.z);
      if (m.boss) {
        if (dNear > 12) chaseSpd = spd * 1.35;
        else if (dNear > 6) chaseSpd = spd * 1.15;
      } else if (dNear > 14) {
        chaseSpd = spd * 1.22;
      } else if (dNear > 8) {
        chaseSpd = spd * 1.1;
      }
    }

    // «коварные» — при малом HP бегут от игрока (боссы никогда)
    if (near && m.fleeAtHp > 0 && !m.boss && m.hp < m.maxHp * m.fleeAtHp) {
      m.state = 'flee';
      m.fleeUntil = nowDot + 9000;
      m.target = near.pid;
      m.oocRegenT = 0;
      m.lostTargetT = 0;
      m.leashT = 0;
      const dx = m.x - near.x, dz = m.z - near.z;
      const len = Math.hypot(dx, dz) || 1;
      geoStepMob(m,
        m.x + (dx / len) * chaseSpd * 1.25 * (TICK_MS / 1000),
        m.z + (dz / len) * chaseSpd * 1.25 * (TICK_MS / 1000));
      const dSp = Math.hypot(m.x - m.spawnX, m.z - m.spawnZ);
      if (!m.summoned && dSp > leash) {
        m.leashT = (m.leashT || 0) + TICK_MS;
        if (m.leashT > 2500) {
          m.state = 'return';
          clearMobHate(m);
        }
      } else m.leashT = 0;
    } else if (near) {
      m.state = 'chase';
      m.target = near.pid;
      m.oocRegenT = 0;
      m.lostTargetT = 0;
      const dx = near.x - m.x, dz = near.z - m.z, len = Math.hypot(dx, dz) || 1;
      const distFromSpawn = Math.hypot(m.x - m.spawnX, m.z - m.spawnZ);

      // Leash only after sustained out-of-home (not instant drop on first overshoot)
      if (!m.boss && !m.summoned && distFromSpawn > leash) {
        m.leashT = (m.leashT || 0) + TICK_MS;
        if (m.leashT > 2800) {
          m.state = 'return';
          clearMobHate(m);
          m.leashT = 0;
        }
      } else if (m.boss && distFromSpawn > leash && !hasHate) {
        m.leashT = (m.leashT || 0) + TICK_MS;
        if (m.leashT > 2000) {
          m.state = 'return';
          clearMobHate(m);
          m.leashT = 0;
        }
      } else {
        m.leashT = 0;
      }

      if (m.state === 'return') {
        // fell into return this tick — skip combat
      } else if (m.atkCd <= 0 && tryMobSkill(m, near, atk)) {
        // skill cast (any range in skill def); AA skipped this swing
        if (near.hp <= 0) {
          delete m.hate[String(near.pid)];
          topHatePlayer(m);
        }
      } else if (len > (m.attackRange > 0 ? m.attackRange : MELEE_RANGE) * 0.85) {
        // chase current hate target (per-mob attackRange from mob-db)
        stepMobTowards(m, near.x, near.z, chaseSpd, TICK_MS / 1000);
      } else if (m.atkCd <= 0) {
        // BUG-MOB-01: Проверка прямой видимости ДО списания кулдауна атаки моба.
        // Если игрок скрылся за укрытием, моб продолжает сближение и НЕ сжигает свой такт атаки впустую.
        if (!losGround(m.x, m.z, near.x, near.z)) {
          stepMobTowards(m, near.x, near.z, chaseSpd, TICK_MS / 1000);
          continue;
        }
        if (near.dead || near.hp <= 0) {
          delete m.hate[String(near.pid)];
          near = topHatePlayer(m);
          if (!near) {
            m.state = m.boss ? 'chase' : 'return';
            if (!m.boss) clearMobHate(m);
          }
          continue;
        }

        m.atkCd = m.boss ? 1200 : 1500;
        const tPack = near.combatPack || {};
        const pDef = tPack.pDef || near.pDef || 40;
        const evasion = tPack.evasion != null
          ? tPack.evasion
          : (near.evasion != null ? near.evasion : (15 + (near.level || 1) * 1.2));
        const hasShield = !!tPack.hasShield;
        const shieldDef = tPack.shieldDef || 0;
        const blockBonus = tPack.blockBonus || 0;

        const hit = L2.resolveHit(
          {
            pAtk: atk,
            accuracy: m.accuracy != null ? m.accuracy : (18 + (m.level || 1) * 1.4),
            critRate: m.critRate != null ? (m.critRate > 1 ? m.critRate * 10 : 80) : 80,
            level: m.level || 1
          },
          {
            pDef: pDef,
            evasion: evasion,
            hasShield: hasShield,
            shieldDef: shieldDef,
            blockBonus: blockBonus,
            level: near.level || 1
          },
          { skillPower: 1.0, damageType: 'physical' }
        );

        if (hit.missed) {
          send(near, {
            t: 'hit', dmg: 0, miss: true, crit: false, blocked: false, by: 'm' + mid,
            mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId), mobLevel: m.level
          });
          broadcastAOI(near, {
            t: 'dmg_player', pid: near.pid, dmg: 0, miss: true, crit: false, by: 'm' + mid,
            mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
          });
          continue;
        }

        let dmg = hit.damage;
        const isCrit = !!hit.crit;
        const isBlocked = !!hit.blocked;
        if ((m.level || 1) <= 5) dmg = Math.min(dmg, isCrit ? 24 : 18);

        if (isPlayerImmortal(near)) {
          // still swing for anim/FX, but no damage
          send(near, {
            t: 'hit', dmg: 0, immune: true, crit: false, blocked: isBlocked, by: 'm' + mid,
            mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId), mobLevel: m.level
          });
          broadcastAOI(near, {
            t: 'dmg_player', pid: near.pid, dmg: 0, immune: true, crit: false, blocked: isBlocked, by: 'm' + mid,
            mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
          });
          continue;
        }

        near.hp = Math.max(0, near.hp - dmg);
        onPlayerHit(near, dmg);
        send(near, {
          t: 'hit', dmg: dmg, crit: isCrit, blocked: isBlocked, by: 'm' + mid,
          mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId), mobLevel: m.level
        });
        broadcastAOI(near, {
          t: 'dmg_player', pid: near.pid, dmg: dmg, crit: isCrit, blocked: isBlocked, by: 'm' + mid,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        });
          if (near.hp <= 0) {
            onPlayerDeath(near, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
            delete m.hate[String(near.pid)];
            topHatePlayer(m); // switch to next tank/dps on hate
          }
        }
      } else if (m.state === 'chase' || m.state === 'flee') {
      // L2: don't instantly home — grace while re-acquiring / LoS-ish lag
      m.lostTargetT = (m.lostTargetT || 0) + TICK_MS;
      if (m.lostTargetT > 4500) {
        m.state = 'return';
        clearMobHate(m);
        m.lostTargetT = 0;
      }
    } else {
      m.lostTargetT = 0;
    }

    if (m.state === 'return') {
      const dx = m.spawnX - m.x, dz = m.spawnZ - m.z, len = Math.hypot(dx, dz);
      if (len > 1) {
        stepMobTowards(m, m.spawnX, m.spawnZ, spd, TICK_MS / 1000);
        // Защита от вечного застревания в возврате
        if (m.stuckTicks >= 30) {
          m.x = m.spawnX; m.z = m.spawnZ;
          resetMobOnHome(m);
          m.state = 'idle';
        }
      } else {
        // C1: дошёл до спавна — полный сброс HP / дебафов / хейта
        resetMobOnHome(m);
        m.state = 'idle';
      }
    } else if (m.state === 'idle') {
      // soft OOC regen like L2 (~1–2% maxHP / few sec) — not full restore
      if (m.hp < m.maxHp && !m.boss) {
        m.oocRegenT = (m.oocRegenT || 0) + stepMs;
        if (m.oocRegenT >= 3000) {
          m.oocRegenT = 0;
          m.hp = Math.min(m.maxHp, m.hp + Math.max(1, Math.floor(m.maxHp * 0.02)));
        }
      }
      m.wanderT -= stepMs;
      if (m.wanderT <= 0) {
        m.wanderT = 3000;
        m.state = 'wander';
        m.wanderDuration = 0;
        m.wx = m.spawnX + (Math.random() - 0.5) * 8;
        m.wz = m.spawnZ + (Math.random() - 0.5) * 8;
      }
    } else if (m.state === 'wander') {
      m.wanderDuration = (m.wanderDuration || 0) + stepMs;
      const dx = m.wx - m.x, dz = m.wz - m.z, len = Math.hypot(dx, dz);
      if (len > 0.5 && m.wanderDuration < 4000) {
        const stepDist = Math.min(len, spd * 0.5 * dtMob);
        geoStepMob(m,
          m.x + (dx / (len || 1)) * stepDist,
          m.z + (dz / (len || 1)) * stepDist);
      } else {
        m.state = 'idle';
        m.wanderDuration = 0;
      }
    }
  }
}

  function handleDebugEvent(p, msg) {
    if (!p.dev) { send(p, { t: 'err', msg: 'debug_event: только для dev' }); return true; }
    const eid = String(msg.id || 'pipe_burst');
    const key = EV.invasionKey(eid);
    if (msg.end) {
      const stopped = endInvasion(key);
      send(p, { t: 'debug_event_ok', id: eid, ended: !!stopped });
      return true;
    }
    const ev = EV.getEvent(eid);
    if (!ev || ev.kind !== 'invasion') {
      send(p, { t: 'debug_event_fail', reason: 'unknown', id: eid });
      return true;
    }
    const hunts = (WM.buildHuntZones && WM.buildHuntZones()) || [];
    const pick = EV.pickHunt(hunts, ev, Math.random);
    if (!pick) {
      send(p, { t: 'debug_event_fail', reason: 'no_zone', id: eid });
      return true;
    }
    tickWorldEvents._t = Date.now();
    const ae = startInvasion(ev, pick, { replace: true });
    send(p, {
      t: 'debug_event_ok',
      id: eid,
      region: ae && ae.regionId,
      zoneName: ae && ae.zoneName,
      pack: ae && ae.mids && ae.mids.length,
      mid: ae && ae.bossMid
    });
    return true;
  }


  return {
    Mob,
    getMobSkillDef,
    pruneAddMids,
    notifyMobRemoved,
    despawnMobSilent,
    despawnAdds,
    spawnRaidAdds,
    tryMobSkill,
    hateFromHit,
    addMobHate,
    callClanHelp,
    clearMobHate,
    resetMobOnHome,
    hateOf,
    retargetFromHate,
    topHatePlayer,
    applyChampionRoll,
    mobRespawnSec,
    onMobDeath,
    eventZoneName,
    eventStartPayload,
    broadcastEvent,
    announceRaidSpawn,
    announceRaidDeath,
    hasActiveInvasion,
    liveEventMobs,
    endInvasion,
    maybeFinishInvasion,
    startInvasion,
    tickWorldEvents,
    tickMobs,
    mobInCombat,
    handleDebugEvent
  };
}

module.exports = {
  createMobHandler
};
