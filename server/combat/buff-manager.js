// SERVER / COMBAT / BUFF-MANAGER.JS
// Управление баффами, дебаффами, диспелом, статусами контроля и эффектами (DoT/Slow/Stun)
'use strict';

const BR = require('../../shared/buff-rules.js');

function createBuffManager(deps = {}) {
  const {
    send = () => {},
    broadcastAOI = () => {},
    invalidateCombatPack = () => {},
    cancelPlayerCast = () => {},
    pushCombatStats = () => {},
    playerCore = null
  } = deps;

  /** Применить бафф на игрока */
  function applyPlayerBuff(p, buff, now) {
    if (playerCore && typeof playerCore.applyPlayerBuff === 'function') {
      return playerCore.applyPlayerBuff(p, buff, now);
    }
    if (!p) return null;
    const n = now || Date.now();
    const r = BR.apply(p.buffs, Object.assign({ kind: 'buff' }, buff), n);
    p.buffs = r.list;
    invalidateCombatPack(p);
    return r;
  }

  /** Применить дебафф на игрока */
  function applyPlayerDebuff(p, deb, now) {
    if (playerCore && typeof playerCore.applyPlayerDebuff === 'function') {
      return playerCore.applyPlayerDebuff(p, deb, now, cancelPlayerCast);
    }
    if (!p) return null;
    const n = now || Date.now();
    const debPayload = Object.assign({ kind: 'debuff' }, deb);
    if (deb.kind === 'stun' || deb.stun) debPayload.stun = true;
    if (deb.kind === 'silence' || deb.silence) debPayload.silence = true;
    const r = BR.apply(p.debuffs, debPayload, n);
    p.debuffs = r.list;
    if (deb.stun || deb.silence || deb.kind === 'stun' || deb.kind === 'silence') {
      if (typeof cancelPlayerCast === 'function') {
        cancelPlayerCast(p, deb.kind || 'debuff');
      }
    }
    invalidateCombatPack(p);
    return r;
  }

  /** Сериализация снапшота активных эффектов для отправки клиенту */
  function effectsPayload(p) {
    if (playerCore && typeof playerCore.effectsPayload === 'function') {
      return playerCore.effectsPayload(p);
    }
    const now = Date.now();
    const buffs = BR.prune(p.buffs, now);
    const debuffs = BR.prune(p.debuffs, now);
    p.buffs = buffs;
    p.debuffs = debuffs;
    return {
      t: 'effects',
      buffs: buffs.map(b => ({
        id: b.id, name: b.name, icon: b.icon, until: b.until,
        duration: b.duration, speedMult: b.speedMult, attackMult: b.attackMult,
        defenseMult: b.defenseMult, atkSpdMult: b.atkSpdMult, immortal: !!b.immortal
      })),
      debuffs: debuffs.map(d => ({
        id: d.id, name: d.name, icon: d.icon, until: d.until,
        duration: d.duration, slowMult: d.slowMult, atkRedMult: d.atkRedMult,
        pDefMult: d.pDefMult, stun: !!d.stun, silence: !!d.silence, dps: d.dps
      }))
    };
  }

  /** Отправить актуальный пакет эффектов игроку */
  function pushEffects(p) {
    invalidateCombatPack(p);
    send(p, effectsPayload(p));
  }

  /** Проверка оглушения (стан блокирует действия) */
  function playerStunned(p, now) {
    if (playerCore && typeof playerCore.playerStunned === 'function') {
      return playerCore.playerStunned(p, now);
    }
    return BR.hasKind(p && p.debuffs, 'stun', now || Date.now());
  }

  /** Проверка немоты (silence блокирует скиллы) */
  function playerSilenced(p, now) {
    if (playerCore && typeof playerCore.playerSilenced === 'function') {
      return playerCore.playerSilenced(p, now);
    }
    return BR.hasKind(p && p.debuffs, 'silence', now || Date.now());
  }

  /** Проверка обездвиживания (root блокирует шаг) */
  function playerRooted(p, now) {
    return BR.hasKind(p && p.debuffs, 'root', now || Date.now());
  }

  /** Проверка бессмертия / неуязвимости */
  function isPlayerImmortal(p, now) {
    if (playerCore && typeof playerCore.isPlayerImmortal === 'function') {
      return playerCore.isPlayerImmortal(p, now);
    }
    if (!p) return false;
    const n = now || Date.now();
    if (p.buffs && p.buffs.length) {
      for (let i = 0; i < p.buffs.length; i++) {
        const b = p.buffs[i];
        if (b && (b.immortal || b.invulnerable) && b.until > n) return true;
      }
    }
    return false;
  }

  /** Снятие баффов или дебаффов (Cancel / Dispel / Cleanse) */
  function dispelPlayer(p, opts = {}) {
    if (!p) return { buffsRemoved: 0, debuffsRemoved: 0 };
    const now = opts.now || Date.now();
    const kind = opts.kind;
    let bRemoved = 0;
    let dRemoved = 0;

    if (!kind || kind === 'buff') {
      const db = BR.dispel(p.buffs, Object.assign({ kind: 'buff', now }, opts));
      p.buffs = db.list;
      bRemoved = db.removed ? db.removed.length : 0;
    }
    if (!kind || kind === 'debuff') {
      const dd = BR.dispel(p.debuffs, Object.assign({ kind: 'debuff', now }, opts));
      p.debuffs = dd.list;
      dRemoved = dd.removed ? dd.removed.length : 0;
    }

    if (bRemoved > 0 || dRemoved > 0) {
      pushEffects(p);
      if (typeof pushCombatStats === 'function') pushCombatStats(p);
    }

    return { buffsRemoved: bRemoved, debuffsRemoved: dRemoved };
  }

  /** Наложение эффекта на монстра */
  function applyMobEffect(m, eff, now) {
    if (!m) return;
    m.effects = m.effects || [];
    const n = now || Date.now();
    m.effects = m.effects.filter(e => e && e.until > n && e.id !== eff.id);
    m.effects.push(eff);
  }

  /** Снимок активных эффектов моба */
  function getMobEffects(m, now) {
    if (!m || !m.effects || !m.effects.length) return [];
    const n = now || Date.now();
    m.effects = m.effects.filter(e => e && e.until > n);
    return m.effects.map(e => ({
      id: e.id, name: e.name, kind: e.kind, until: e.until,
      duration: e.duration, icon: e.icon, slowMult: e.slowMult,
      atkRedMult: e.atkRedMult, pDefMult: e.pDefMult, stun: !!e.stun,
      dps: e.dps
    }));
  }

  /** Оповещение соседей в AOI об эффектах моба */
  function broadcastMobEffects(m) {
    if (!m) return;
    const effs = getMobEffects(m, Date.now());
    broadcastAOI(m, {
      t: 'mob_effects',
      mid: m.mid,
      effects: effs
    });
  }

  return {
    applyPlayerBuff,
    applyPlayerDebuff,
    effectsPayload,
    pushEffects,
    playerStunned,
    playerSilenced,
    playerRooted,
    isPlayerImmortal,
    dispelPlayer,
    applyMobEffect,
    getMobEffects,
    broadcastMobEffects
  };
}

module.exports = {
  createBuffManager
};
