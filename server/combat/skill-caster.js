// SERVER / COMBAT / SKILL-CASTER.JS
// Авторитетный каст умений, расчет времени каста, прерывание уроном/контролем и применение эффектов
'use strict';

const SK = require('../../shared/skill-db.js');
const CS = require('../../shared/class-system.js');
const ITEMS = require('../../shared/item-db.js');
const L2 = require('../../shared/l2-combat.js');
const BR = require('../../shared/buff-rules.js');

const MAGIC_RANGE_DEFAULT = 30;
const MAGIC_EFFECT_RANGE_DEFAULT = 40;

function createSkillCaster(deps = {}) {
  const {
    send = () => {},
    broadcastAOI = () => {},
    players,
    mobs,
    borderGhosts = new Set(),
    IS_CLUSTER = false,
    spatialGrid = null,
    partyMembers = (p) => [p],
    isGM = () => false,
    checkRate = () => true,
    dist2 = (x1, z1, x2, z2) => { const dx = x1 - x2, dz = z1 - z2; return dx * dx + dz * dz; },
    losGround = () => true,
    notifyLos = () => {},
    playerStunned = () => false,
    playerSilenced = () => false,
    playerWeightState = () => ({ canAttack: true }),
    skillAllowedForClass = () => true,
    passiveBonuses = () => ({}),
    consumeArmedShot = () => ({ shotMod: 1.0, consumed: null }),
    applyPlayerBuff = () => {},
    applyPlayerDebuff = () => {},
    pushEffects = () => {},
    pushCombatStats = () => {},
    applyMobEffect = () => {},
    getMobEffects = () => [],
    broadcastMobEffects = () => {},
    isPlayerImmortal = () => false,
    recordMobDamage = () => {},
    addMobHate = () => {},
    hateFromHit = () => 0,
    mobDisplayNameServer = (id) => String(id),
    onMobDeath = () => {},
    pvpPeaceBlocked = () => false,
    maybeFlagPvp = () => {},
    onPvpLethal = () => {},
    onPlayerDeath = () => {},
    deathHandler = null,
    resetMoveBudget = () => {},
    MOB_DB = null,
    DEBUG_EVENTS = false,
    isSyntheticBot = () => false
  } = deps;

  /** Прервать каст персонажа и уведомить AOI (3.3). */
  function cancelPlayerCast(p, reason) {
    if (!p || !p.casting) return;
    const c = p.casting;
    p.casting = null;
    const pkt = {
      t: 'cast_cancel',
      pid: p.pid,
      skillId: c.skillId,
      reason: reason || 'interrupted'
    };
    send(p, pkt);
    broadcastAOI(p, pkt);
    if (reason === 'interrupted') {
      send(p, { t: 'msg', text: 'Каст сбит уроном!' });
    } else if (reason === 'move') {
      send(p, { t: 'msg', text: 'Каст прерван движением.' });
    }
  }

  /** Проверка срыва каста при получении урона по формуле L2.calcCastCancel (3.3). */
  function checkCastCancelOnDamage(p, dmg) {
    if (!p || !p.casting || !dmg || dmg <= 0) return;
    const men = (p.combatPack && p.combatPack.primary && p.combatPack.primary.MEN) || (p.primary && p.primary.MEN) || 20;
    const maxHp = p.maxHp || 100;
    const res = (L2 && L2.calcCastCancel) ? L2.calcCastCancel(dmg, men, maxHp) : { cancel: false };
    let cancel = res.cancel;
    if (cancel && p.combatPack && p.combatPack.cancelResist) {
      if (Math.random() < p.combatPack.cancelResist) {
        cancel = false;
      }
    }
    if (cancel) {
      cancelPlayerCast(p, 'interrupted');
    }
  }

  /** Сброс позы отдыха, обновление таймера боя и проверка срыва каста при ударе. */
  function onPlayerHit(p, dmg) {
    if (!p) return;
    if (p.sitting) p.sitting = false;
    p._lastCombatAt = Date.now();
    if (dmg && dmg > 0) {
      checkCastCancelOnDamage(p, dmg);
    }
  }

  /**
   * Начало каста умения с задержкой (chargeTime / Cast Time)
   */
  function doCastBegin(p, msg) {
    if (p.sitting) p.sitting = false;
    p._lastCombatAt = Date.now();
    const skillId = String(msg.skillId || msg.id || '').toLowerCase();
    const failCast = (reason, extra) => {
      const out = Object.assign({
        t: 'skill_fail',
        reason: reason,
        skillId: skillId,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp
      }, extra || {});
      send(p, out);
    };

    if (playerStunned(p)) { failCast('stun'); return; }
    if (!playerWeightState(p).canAttack) {
      failCast('weight');
      send(p, { t: 'msg', text: 'Слишком тяжело — нельзя использовать умения.' });
      return;
    }
    if (playerSilenced(p)) {
      failCast('silence');
      send(p, { t: 'msg', text: 'Схемы глушатся — нельзя использовать умения.' });
      return;
    }
    const tpl = SK.get(skillId);
    if (!tpl) { failCast('unknown'); return; }
    if (tpl.type === 'passive') { failCast('passive'); return; }
    if (!skillAllowedForClass(p, tpl.class)) { failCast('class'); return; }
    const rank = (p.skills && p.skills[skillId]) || 0;
    if (rank < 1) { failCast('not_learned'); return; }
    const rankRow = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
    const needLv = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);

    const isMemeSkill = !!(tpl.meme || tpl.class === 'any' || tpl.class === 'all');
    try {
      const isEng = p.cls === 'engineer' || (CS.rootClass && CS.rootClass(p.cls) === 'engineer');
      if (isEng && tpl.type !== 'passive' && !isMemeSkill) {
        const w = p.equip && (p.equip.weapon || p.equip.WEAPON);
        const wTid = w && String(w.templateId || w.id || '').toLowerCase();
        const wTpl = wTid ? ITEMS.get(wTid) : null;
        const isEngWeapon = !!(w && wTpl && (
          wTpl.isEngineerWeapon ||
          (wTpl.type === 'weapon' && (wTpl.isCircuit || wTpl.isMagical) &&
            !wTpl.isResonator && !wTpl.isCircuitDevice)
        ));
        if (tpl.type === 'active' || tpl.type === 'toggle') {
          if (!isEngWeapon) { failCast('need_engineer_weapon'); return; }
        }
        const cat = tpl.category || '';
        const ls = (rankRow && rankRow.lifeSteal != null) ? +rankRow.lifeSteal
          : (tpl.lifeSteal != null ? +tpl.lifeSteal : 0);
        const isDrain = ls > 0 || /drain|vamp|absorb|leech/i.test(skillId);
        const needsBracelet = cat === 'heal' || cat === 'buff' || cat === 'debuff' || isDrain;
        const needsResonator = !needsBracelet && cat === 'attack';

        const deviceReq = (lr) => {
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);

        if (needsBracelet) {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isNano = br && (brTid === 'engineer_nano_bracelet' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isNanoBracelet || ITEMS.get(brTid).isBraceletDevice)));
          if (!isNano) { failCast('need_bracelet'); return; }
          const have = (p.devices ? p.devices.nano : 1) | 0;
          if (have < need) { failCast('nano_level', { have: have, need: need }); return; }
        } else if (needsResonator) {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isRes = n && (nTid === 'engineer_emitter_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isResonator || ITEMS.get(nTid).isCircuitDevice)));
          if (!isRes) { failCast('need_resonator'); return; }
          const have = (p.devices ? p.devices.circuit : 1) | 0;
          if (have < need) { failCast('circuit_level', { have: have, need: need }); return; }
        }
      }
      const isOp = p.cls === 'operator' || (CS.rootClass && CS.rootClass(p.cls) === 'operator');
      if (isOp && tpl.type !== 'passive' && !isMemeSkill) {
        const cat = tpl.category || '';
        const devType = (tpl.deviceReq && tpl.deviceReq.type) || (cat === 'attack' ? 'compressor' : 'bracers');
        const deviceReq = (lr) => {
          if (tpl.valveReq != null) return tpl.valveReq | 0;
          if (tpl.wristReq != null) return tpl.wristReq | 0;
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);
        if (devType === 'bracers') {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isBracers = br && (brTid === 'operator_bracers_low' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isBracers || ITEMS.get(brTid).isOperatorBracers || ITEMS.get(brTid).isBraceletDevice)));
          if (!isBracers) { failCast('need_bracers'); return; }
          const have = (p.devices ? (p.devices.wrist != null ? p.devices.wrist : p.devices.nano) : 1) | 0;
          if (have < need) { failCast('wrist_level', { have: have, need: need }); return; }
        } else if (devType === 'compressor') {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isComp = n && (nTid === 'operator_compressor_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isCompressor || ITEMS.get(nTid).isOperatorDevice || ITEMS.get(nTid).isValveDevice)));
          if (!isComp) { failCast('need_compressor'); return; }
          const have = (p.devices ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : 1) | 0;
          if (have < need) { failCast('valve_level', { have: have, need: need }); return; }
        }
      }
    } catch (eDev) {
      failCast('device_error');
      return;
    }

    const cdKey = 'sk_' + skillId;
    const now = Date.now();
    if ((p.cd[cdKey] || 0) > now) {
      failCast('cooldown', { remainMs: p.cd[cdKey] - now });
      return;
    }

    let energyBase = (rankRow && rankRow.energyCost != null)
      ? rankRow.energyCost
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'energyCost', rank) : null) != null
        ? SK.valueAtLevel(tpl, 'energyCost', rank)
        : (tpl.energyCost || 0);
    const skillReq = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);
    let wClass = 'fist';
    try {
      const packW = p.combatPack && p.combatPack.weaponClass;
      if (packW) wClass = packW;
      else {
        const eq = p.equip || {};
        const w = eq.weapon || eq.WEAPON;
        const wTpl = w ? (ITEMS.get(w.templateId || w.id) || (ITEMS.resolveTemplate && ITEMS.resolveTemplate(w))) : null;
        if (wTpl && wTpl.weaponClass) wClass = wTpl.weaponClass;
        else if (w) {
          const tid = String(w.id || w.templateId || '');
          if (/dagger|knife/i.test(tid)) wClass = 'dagger';
          else if (/bow/i.test(tid)) wClass = 'bow';
        }
      }
    } catch (eW) {}

    // Валидация профильного оружия для физических умений
    if (skillId === 'gun_mortal_blow' && wClass !== 'dagger') {
      failCast('need_dagger');
      send(p, { t: 'msg', text: 'Для умения «Смертельный выпад» требуется кинжал.' });
      return;
    }
    if ((skillId === 'gun_precision_shot' || skillId === 'gun_rapid_fire' ||
         skillId === 'gun_sniper_mode' || skillId === 'gun_bullet_storm' || skillId === 'gun_piercing_round') && wClass !== 'bow') {
      failCast('need_bow');
      send(p, { t: 'msg', text: 'Для этого стрелкового умения требуется экипированный лук.' });
      return;
    }
    if (skillId === 'mech_shield_bash') {
      const sh = p.equip && (p.equip.shield || p.equip.lhand || p.equip.SHIELD);
      const shTid = sh && String(sh.templateId || sh.id || '').toLowerCase();
      const shTpl = shTid ? ITEMS.get(shTid) : null;
      const hasShield = !!(sh && (shTpl ? (shTpl.type === 'shield' || shTpl.slot === 'shield') : /shield/i.test(shTid)));
      if (!hasShield) {
        failCast('need_shield');
        send(p, { t: 'msg', text: 'Для умения «Удар щитом» требуется экипированный щит.' });
        return;
      }
    }
    if ((skillId === 'dest_power_smash' || skillId === 'dest_crushing_blow') && wClass === 'bow') {
      failCast('wrong_weapon');
      send(p, { t: 'msg', text: 'Это сокрушительное умение нельзя использовать с луком.' });
      return;
    }

    const energyCost = L2.mpCostFinal
      ? L2.mpCostFinal(energyBase, wClass, p.level || 1, skillReq)
      : Math.max(1, Math.floor(energyBase * (wClass === 'fist' || wClass === 'dagger' || wClass === '1h_sword' ? 1 : 0.9)));
    if (p.energy < energyCost) {
      failCast('energy', { need: energyCost });
      return;
    }

    const pack = p.combatPack;
    const pas = passiveBonuses(p);
    let baseCastSec = (rankRow && rankRow.chargeTime != null) ? rankRow.chargeTime : (tpl.chargeTime || 0);
    let castSec = 0;
    if (baseCastSec > 0 && L2.castTimeSec) {
      const wit = (pack.primary && pack.primary.WIT) || 20;
      const mSpd = L2.mAtkSpd(wit, pas.chargeSpeed, pas.castSpeedSet)
        * ((pack.gradePenalty && pack.gradePenalty.castSpdMult) || 1);
      castSec = L2.castTimeSec(baseCastSec, mSpd);
    }

    if (castSec <= 0.05) {
      doSkillCast(p, msg);
      return;
    }

    const isMagic = tpl.damageType === 'circuit' || tpl.category === 'heal' ||
      tpl.category === 'buff' || tpl.category === 'debuff' || tpl.class === 'engineer' ||
      tpl.class === 'constructor' || tpl.class === 'technomancer';
    const baseRange = tpl.range != null ? tpl.range : (isMagic ? MAGIC_RANGE_DEFAULT : 3);
    const rangeWithSlack = baseRange + 0.5;

    const isSingleTarget = !tpl.radius && (tpl.category === 'attack' || tpl.category === 'debuff');
    if (isSingleTarget && msg.mid == null && msg.pid == null) {
      failCast('target');
      return;
    }

    if (msg.mid != null) {
      const m = mobs.get(+msg.mid);
      if (m && !m.dead && m.hp > 0) {
        if (dist2(p.x, p.z, m.x, m.z) > rangeWithSlack * rangeWithSlack) {
          failCast('range');
          return;
        }
        if (!losGround(p.x, p.z, m.x, m.z)) {
          failCast('los');
          notifyLos(p);
          return;
        }
      }
    } else if (msg.pid != null) {
      const tgt = players.get(+msg.pid);
      if (!tgt && IS_CLUSTER && borderGhosts.has(+msg.pid)) {
        failCast('cross_zone');
        send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
        return;
      }
      if (tgt && !tgt.dead && tgt.hp > 0) {
        if (dist2(p.x, p.z, tgt.x, tgt.z) > rangeWithSlack * rangeWithSlack) {
          failCast('range');
          return;
        }
        if (!losGround(p.x, p.z, tgt.x, tgt.z)) {
          failCast('los');
          notifyLos(p);
          return;
        }
      }
    }

    if (p.casting) cancelPlayerCast(p, 'new_skill');

    const totalMs = L2.quantizeCombatMs ? L2.quantizeCombatMs(castSec * 1000, 100) : Math.floor(castSec * 1000);
    p.casting = {
      skillId: skillId,
      mid: msg.mid || null,
      pid: msg.pid || null,
      startedAt: now,
      endsAt: now + totalMs,
      totalMs: totalMs,
      startX: p.x,
      startZ: p.z,
      energyCost: energyCost,
      rank: rank
    };

    let castFacing = null;
    if (msg.mid != null) {
      const tm = mobs.get(msg.mid | 0);
      if (tm) castFacing = Math.atan2(tm.x - p.x, tm.z - p.z);
    } else if (msg.pid != null) {
      const tp = players.get(msg.pid | 0);
      if (tp) castFacing = Math.atan2(tp.x - p.x, tp.z - p.z);
    }
    if (castFacing != null) p.facing = castFacing;

    const castPkt = {
      t: 'cast_start',
      pid: p.pid,
      skillId: skillId,
      skillName: tpl.name || skillId,
      mid: msg.mid || null,
      targetPid: msg.pid || null,
      castSec: totalMs / 1000,
      totalMs: totalMs,
      facing: castFacing
    };
    send(p, castPkt);
    broadcastAOI(p, castPkt);
  }

  /**
   * Серверный cast умения (авторитет).
   * msg: { skillId, mid?, pid?, x?, z? }
   */
  function doSkillCast(p, msg) {
    if (p.sitting) p.sitting = false;
    p._lastCombatAt = Date.now();
    const skillId = String(msg.skillId || msg.id || '').toLowerCase();
    const failSkill = (reason, extra) => {
      const out = Object.assign({
        t: 'skill_fail',
        reason: reason,
        skillId: skillId,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp
      }, extra || {});
      send(p, out);
    };

    if (playerStunned(p)) {
      failSkill('stun');
      return;
    }
    if (!playerWeightState(p).canAttack) {
      failSkill('weight');
      send(p, { t: 'msg', text: 'Слишком тяжело — нельзя использовать умения.' });
      return;
    }
    if (playerSilenced(p)) {
      failSkill('silence');
      send(p, { t: 'msg', text: 'Схемы глушатся — нельзя использовать умения.' });
      return;
    }
    const tpl = SK.get(skillId);
    if (!tpl) {
      failSkill('unknown');
      return;
    }
    if (tpl.type === 'passive') {
      failSkill('passive');
      return;
    }
    if (skillId === 'gm_oneshot' || skillId === 'gm_resurrect' || skillId === 'gm_flash' || skillId === 'gm_speed' || tpl.gm || tpl.gmOnly) {
      if (!isGM(p)) {
        failSkill('access_denied');
        send(p, { t: 'msg', text: 'Умение доступно только Game Master.' });
        return;
      }
    }
    if (!skillAllowedForClass(p, tpl.class)) {
      failSkill('class');
      return;
    }
    let rank = (p.skills && (p.skills[skillId] || (skillId === 'gm_flash' ? p.skills.gm_speed : 0))) || 0;
    if (rank < 1 && isGM(p) && (skillId === 'gm_flash' || skillId === 'gm_speed' || skillId === 'test_immortal' || skillId === 'gm_oneshot' || skillId === 'gm_resurrect')) {
      rank = 1;
      if (p.skills) {
        if (skillId === 'gm_flash' || skillId === 'gm_speed') {
          p.skills.gm_speed = 1;
          delete p.skills.gm_flash;
        } else {
          p.skills[skillId] = 1;
        }
      }
    }
    if (rank < 1) {
      failSkill('not_learned');
      return;
    }
    const rankRow = (tpl.ranks && tpl.ranks[Math.min(rank, tpl.ranks.length) - 1]) || null;
    const needLv = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);

    const isMemeSkill = !!(tpl.meme || tpl.class === 'any' || tpl.class === 'all');

    // Инженер / Оператор: проверка приборов
    try {
      const isEng = p.cls === 'engineer' || (CS.rootClass && CS.rootClass(p.cls) === 'engineer');
      if (isEng && tpl.type !== 'passive' && !isMemeSkill) {
        const w = p.equip && (p.equip.weapon || p.equip.WEAPON);
        const wTid = w && String(w.templateId || w.id || '').toLowerCase();
        const wTpl = wTid ? ITEMS.get(wTid) : null;
        const isEngWeapon = !!(w && wTpl && (
          wTpl.isEngineerWeapon ||
          (wTpl.type === 'weapon' && (wTpl.isCircuit || wTpl.isMagical) &&
            !wTpl.isResonator && !wTpl.isCircuitDevice)
        ));
        if (tpl.type === 'active' || tpl.type === 'toggle') {
          if (!isEngWeapon) {
            failSkill('need_engineer_weapon');
            return;
          }
        }

        const cat = tpl.category || '';
        const ls = (rankRow && rankRow.lifeSteal != null) ? +rankRow.lifeSteal
          : (tpl.lifeSteal != null ? +tpl.lifeSteal : 0);
        const isDrain = ls > 0 || /drain|vamp|absorb|leech/i.test(skillId);
        const needsBracelet = cat === 'heal' || cat === 'buff' || cat === 'debuff' || isDrain;
        const needsResonator = !needsBracelet && cat === 'attack';

        const deviceReq = (lr) => {
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);

        if (needsBracelet) {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isNano = br && (brTid === 'engineer_nano_bracelet' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isNanoBracelet || ITEMS.get(brTid).isBraceletDevice)));
          if (!isNano) { failSkill('need_bracelet'); return; }
          const have = (p.devices ? p.devices.nano : 1) | 0;
          if (have < need) { failSkill('nano_level', { have: have, need: need }); return; }
        } else if (needsResonator) {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isRes = n && (nTid === 'engineer_emitter_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isResonator || ITEMS.get(nTid).isCircuitDevice)));
          if (!isRes) { failSkill('need_resonator'); return; }
          const have = (p.devices ? p.devices.circuit : 1) | 0;
          if (have < need) { failSkill('circuit_level', { have: have, need: need }); return; }
        }
      }

      const isOp = p.cls === 'operator' || (CS.rootClass && CS.rootClass(p.cls) === 'operator');
      if (isOp && tpl.type !== 'passive' && !isMemeSkill) {
        const cat = tpl.category || '';
        const devType = (tpl.deviceReq && tpl.deviceReq.type) || (cat === 'attack' ? 'compressor' : 'bracers');
        const deviceReq = (lr) => {
          if (tpl.valveReq != null) return tpl.valveReq | 0;
          if (tpl.wristReq != null) return tpl.wristReq | 0;
          if (tpl.nanoReq != null) return tpl.nanoReq | 0;
          if (tpl.braceletReq != null) return tpl.braceletReq | 0;
          if (tpl.resonatorReq != null) return tpl.resonatorReq | 0;
          if (tpl.circuitReq != null) return tpl.circuitReq | 0;
          if (lr <= 1) return 1; if (lr <= 7) return 2; if (lr <= 14) return 3;
          if (lr <= 20) return 4; if (lr <= 28) return 5; return 6;
        };
        const need = deviceReq(needLv);
        if (devType === 'bracers') {
          const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
          const brTid = br && String(br.templateId || br.id || '').toLowerCase();
          const isBracers = br && (brTid === 'operator_bracers_low' ||
            (ITEMS.get(brTid) && (ITEMS.get(brTid).isBracers || ITEMS.get(brTid).isOperatorBracers || ITEMS.get(brTid).isBraceletDevice)));
          if (!isBracers) { failSkill('need_bracers'); return; }
          const have = (p.devices ? (p.devices.wrist != null ? p.devices.wrist : p.devices.nano) : 1) | 0;
          if (have < need) { failSkill('wrist_level', { have: have, need: need }); return; }
        } else if (devType === 'compressor') {
          const n = p.equip && p.equip.necklace;
          const nTid = n && String(n.templateId || n.id || '').toLowerCase();
          const isComp = n && (nTid === 'operator_compressor_low' ||
            (ITEMS.get(nTid) && (ITEMS.get(nTid).isCompressor || ITEMS.get(nTid).isOperatorDevice || ITEMS.get(nTid).isValveDevice)));
          if (!isComp) { failSkill('need_compressor'); return; }
          const have = (p.devices ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : 1) | 0;
          if (have < need) { failSkill('valve_level', { have: have, need: need }); return; }
        }
      }
    } catch (eDev) {
      if (DEBUG_EVENTS) console.warn('[doSkillCast] device gate', eDev && eDev.message);
      failSkill('device_error');
      return;
    }

    const cdKey = 'sk_' + skillId;
    const now = Date.now();
    if ((p.cd[cdKey] || 0) > now) {
      failSkill('cooldown', { remainMs: p.cd[cdKey] - now });
      return;
    }

    let energyBase = (rankRow && rankRow.energyCost != null)
      ? rankRow.energyCost
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'energyCost', rank) : null) != null
        ? SK.valueAtLevel(tpl, 'energyCost', rank)
        : (tpl.energyCost || 0);
    const skillReq = (rankRow && rankRow.levelReq != null) ? rankRow.levelReq : (tpl.levelReq || 1);
    let wClass = 'fist';
    try {
      const packW = p.combatPack && p.combatPack.weaponClass;
      if (packW) wClass = packW;
      else {
        const eq = p.equip || {};
        const w = eq.weapon || eq.WEAPON;
        const wTpl = w ? ITEMS.resolveTemplate(w) : null;
        if (wTpl && wTpl.weaponClass) wClass = wTpl.weaponClass;
        else if (w) {
          const tid = String(w.id || w.templateId || '');
          if (/dagger|knife/i.test(tid)) wClass = 'dagger';
          else if (/soes|crystal_manifold|blade/i.test(tid) && /soes|crystal|homunculus|valhalla|hydraulic/i.test(tid)) {
            wClass = /soes|crystal/i.test(tid) ? '2h_sword' : '1h_sword';
          } else if (/manifold|staff|branch|rod|spear|pole|scythe|glaive|cleaver/i.test(tid)) wClass = 'pole';
          else if (/resonator|hammer|mace|maul|gauge|club|baton|apprentice/i.test(tid)) wClass = '1h_blunt';
          else if (/coil|sword/i.test(tid)) wClass = '1h_sword';
        }
      }
    } catch (e) {}

    // Валидация профильного оружия для физических умений
    if (skillId === 'gun_mortal_blow' && wClass !== 'dagger') {
      failSkill('need_dagger');
      send(p, { t: 'msg', text: 'Для умения «Смертельный выпад» требуется кинжал.' });
      return;
    }
    if ((skillId === 'gun_precision_shot' || skillId === 'gun_rapid_fire' ||
         skillId === 'gun_sniper_mode' || skillId === 'gun_bullet_storm' || skillId === 'gun_piercing_round') && wClass !== 'bow') {
      failSkill('need_bow');
      send(p, { t: 'msg', text: 'Для этого стрелкового умения требуется экипированный лук.' });
      return;
    }
    if (skillId === 'mech_shield_bash') {
      const sh = p.equip && (p.equip.shield || p.equip.lhand || p.equip.SHIELD);
      const shTid = sh && String(sh.templateId || sh.id || '').toLowerCase();
      const shTpl = shTid ? ITEMS.get(shTid) : null;
      const hasShield = !!(sh && (shTpl ? (shTpl.type === 'shield' || shTpl.slot === 'shield') : /shield/i.test(shTid)));
      if (!hasShield) {
        failSkill('need_shield');
        send(p, { t: 'msg', text: 'Для умения «Удар щитом» требуется экипированный щит.' });
        return;
      }
    }
    if ((skillId === 'dest_power_smash' || skillId === 'dest_crushing_blow') && wClass === 'bow') {
      failSkill('wrong_weapon');
      send(p, { t: 'msg', text: 'Это сокрушительное умение нельзя использовать с луком.' });
      return;
    }

    const energyCost = L2.mpCostFinal
      ? L2.mpCostFinal(energyBase, wClass, p.level || 1, skillReq)
      : Math.max(1, Math.floor(energyBase * (wClass === 'fist' || wClass === 'dagger' || wClass === '1h_sword' ? 1 : 0.9)));
    if (p.energy < energyCost) {
      failSkill('energy', { need: energyCost });
      return;
    }

    const pack = p.combatPack;
    const pas = passiveBonuses(p);

    let baseCastSec = (rankRow && rankRow.chargeTime != null) ? rankRow.chargeTime : (tpl.chargeTime || 0);
    let castSec = 0;
    if (baseCastSec > 0 && L2.castTimeSec) {
      const wit = (pack.primary && pack.primary.WIT) || 20;
      const mSpd = L2.mAtkSpd(wit, pas.chargeSpeed, pas.castSpeedSet)
        * ((pack.gradePenalty && pack.gradePenalty.castSpdMult) || 1);
      castSec = L2.castTimeSec(baseCastSec, mSpd);
    }

    // Валидация каста (3.3): скилл с chargeTime требует cast_begin и ожидания таймера
    if (baseCastSec > 0.05) {
      if (!p.casting || p.casting.skillId !== skillId) {
        if (!p.dev || p.requireCast) {
          failSkill('no_cast');
          return;
        }
      } else {
        const nowTs = Date.now();
        if (nowTs < p.casting.endsAt - 150) {
          failSkill('cast_in_progress', { remainMs: p.casting.endsAt - nowTs });
          return;
        }
        const origMid = p.casting.mid != null ? (p.casting.mid | 0) : null;
        const curMid = msg.mid != null ? (msg.mid | 0) : null;
        const origPid = p.casting.pid != null ? (p.casting.pid | 0) : null;
        const curPid = msg.pid != null ? (msg.pid | 0) : null;
        if (origMid !== curMid || origPid !== curPid) {
          failSkill('target_changed');
          return;
        }
        p.casting = null;
      }
    }

    const power = SK.skillPowerAtLevel(tpl, rank);
    const dtype = tpl.damageType || 'physical';
    const isMagic = tpl.damageType === 'circuit' || tpl.category === 'heal' ||
      tpl.category === 'buff' || tpl.category === 'debuff' || tpl.class === 'engineer' ||
      tpl.class === 'constructor' || tpl.class === 'technomancer';
    const baseRange = tpl.range != null ? tpl.range : (isMagic ? MAGIC_RANGE_DEFAULT : 3);
    const effectBase = tpl.effectRange != null ? tpl.effectRange : (isMagic ? MAGIC_EFFECT_RANGE_DEFAULT : baseRange);
    const range = baseRange + 0.5;
    const effectRange = effectBase + 0.5;
    const results = [];

    // GM Resurrect
    if (skillId === 'gm_resurrect') {
      let tgt = null;
      if (msg.pid != null && players.get(msg.pid | 0)) {
        tgt = players.get(msg.pid | 0);
      } else if (p.target && p.target.pid != null && players.get(p.target.pid | 0)) {
        tgt = players.get(p.target.pid | 0);
      } else if (p.dead) {
        tgt = p;
      } else {
        let bestDist = effectRange;
        for (const other of players.values()) {
          if (!other || other.pid === p.pid || !other.dead) continue;
          const d = Math.hypot((other.x || 0) - p.x, (other.z || 0) - p.z);
          if (d < bestDist) {
            bestDist = d;
            tgt = other;
          }
        }
        if (!tgt) tgt = p;
      }

      if (dist2(p.x, p.z, tgt.x, tgt.z) > effectRange * effectRange) {
        failSkill('range');
        return;
      }

      if (deathHandler && deathHandler.resurrectPlayer) {
        deathHandler.resurrectPlayer(tgt, p);
      } else {
        tgt.dead = false;
        tgt.hp = tgt.maxHp;
        tgt.energy = tgt.maxEnergy;
        send(tgt, { t: 'you_revived', mode: 'resurrect', by: p.name });
        broadcastAOI(tgt, { t: 'player_revived', pid: tgt.pid, x: tgt.x, z: tgt.z, mode: 'resurrect' });
        broadcastAOI(tgt, { t: 'resurrect_fx', pid: tgt.pid, casterPid: p.pid, x: tgt.x, y: tgt.y, z: tgt.z });
      }
      results.push({ kind: 'resurrect', pid: tgt.pid, targetName: tgt.name, hp: tgt.hp });

      p.energy = Math.max(0, Math.floor(p.energy - energyCost));
      const fullCdSec = tpl.cooldown != null ? tpl.cooldown : 1;
      p.cd[cdKey] = now + Math.floor(fullCdSec * 900);

      send(p, {
        t: 'skill_ok',
        skillId,
        rank,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        results,
        cooldown: fullCdSec
      });
      broadcastAOI(p, {
        t: 'skill_fx', pid: p.pid, fromPid: p.pid, skillId, targetPid: tgt.pid, name: tpl.name,
        x: tgt.x, y: tgt.y, z: tgt.z
      });
      return;
    }

    // GM Flash Speed
    if (skillId === 'gm_flash' || skillId === 'gm_speed') {
      const isCurrentlyFast = p.gmSpeedMul && p.gmSpeedMul > 1;
      if (isCurrentlyFast) {
        p.gmSpeedMul = 1;
        p.flashSpeed = false;
        resetMoveBudget(p);
        send(p, { t: 'msg', text: '⚡ Скорость Флэша: ВЫКЛ (1.0x)' });
        send(p, { t: 'self_sync', gmSpeedMul: 1, flashSpeed: false });
        broadcastAOI(p, { t: 'flash_fx', pid: p.pid, active: false, speedMul: 1 });
        results.push({ kind: 'toggle', active: false, skillId: 'gm_speed' });
      } else {
        p.gmSpeedMul = 3.5;
        p.flashSpeed = true;
        resetMoveBudget(p);
        send(p, { t: 'msg', text: '⚡ СКОРОСТЬ ФЛЭША АКТИВИРОВАНА: 3.5x (Спидфорс ВКЛ)' });
        send(p, { t: 'self_sync', gmSpeedMul: 3.5, flashSpeed: true });
        broadcastAOI(p, { t: 'flash_fx', pid: p.pid, active: true, speedMul: 3.5, burst: true, x: p.x, y: p.y, z: p.z });
        results.push({ kind: 'toggle', active: true, skillId: 'gm_speed' });
      }
      p.energy = Math.max(0, Math.floor(p.energy - energyCost));
      send(p, {
        t: 'skill_ok',
        skillId,
        rank: 1,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        results,
        cooldown: 0.5
      });
      return;
    }

    // SELF / PARTY / TARGET buffs, heals & cures
    const isSupportSkill = tpl.target === 'self' || tpl.target === 'party' || tpl.category === 'heal' || tpl.category === 'buff' || !!tpl.curePoison;
    if (isSupportSkill) {
      let recipients = [p];
      if (tpl.target === 'party') {
        const pRadius = tpl.range != null ? tpl.range : (tpl.effectRange != null ? tpl.effectRange : 30);
        const members = typeof partyMembers === 'function' ? partyMembers(p) : [p];
        recipients = members.filter(m => m && !m.dead && m.hp > 0 && dist2(p.x, p.z, m.x, m.z) <= (pRadius + 0.5) * (pRadius + 0.5));
        if (!recipients.length) recipients = [p];
      } else if (tpl.target === 'target' && msg.pid != null && (msg.pid | 0) !== p.pid) {
        const ally = players.get(msg.pid | 0);
        if (!ally || ally.dead || ally.hp <= 0) {
          failSkill('target');
          return;
        }
        if (dist2(p.x, p.z, ally.x, ally.z) > effectRange * effectRange) {
          failSkill('range');
          return;
        }
        if (typeof losGround === 'function' && !losGround(p.x, p.z, ally.x, ally.z)) {
          failSkill('los');
          return;
        }
        recipients = [ally];
      }

      for (const tgtP of recipients) {
        if (!tgtP || tgtP.dead) continue;

        if (tpl.category === 'heal' || tpl.healPercent != null || tpl.healPower != null ||
            (rankRow && rankRow.healPower != null)) {
          let heal;
          const flat = (rankRow && rankRow.healPower != null)
            ? rankRow.healPower
            : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'healPower', rank) : tpl.healPower);
          const healBonus = 1 + ((pas && pas.healPower) || 0);
          if (flat != null) {
            heal = L2.healAmount
              ? L2.healAmount(flat, pack.cAtk || 0, healBonus)
              : Math.max(1, Math.floor((flat + Math.sqrt(pack.cAtk || 0)) * healBonus));
          } else {
            let hpct = SK.valueAtLevel(tpl, 'healPercent', rank);
            if (hpct == null) hpct = 0.2;
            const men = (pack.primary && pack.primary.MEN) || 30;
            heal = L2.healPercentAmount
              ? L2.healPercentAmount(tgtP.maxHp, hpct, pack.cAtk || 0, men, healBonus)
              : Math.max(1, Math.floor(tgtP.maxHp * hpct * healBonus + Math.sqrt(pack.cAtk || 0) * 0.9));
          }
          tgtP.hp = Math.min(tgtP.maxHp, tgtP.hp + heal);
          results.push({ kind: 'heal', target: tgtP.pid === p.pid ? 'self' : 'target', targetPid: tgtP.pid, amount: heal, hp: tgtP.hp });
          if (tgtP.pid !== p.pid) {
            send(tgtP, { t: 'healed', amount: heal, hp: tgtP.hp, by: p.name });
            broadcastAOI(tgtP, { t: 'heal_fx', pid: tgtP.pid, casterPid: p.pid, amount: heal });
          }
        }

        if (tpl.category === 'buff' || tpl.attackBoost != null || tpl.defenseBoost != null || tpl.speedBoost != null ||
            tpl.attackSpeedBoost != null ||
            tpl.immortal || tpl.invulnerable ||
            (rankRow && (rankRow.attackBoost != null || rankRow.defenseBoost != null))) {
          const rawDur = ((rankRow && rankRow.duration != null) ? rankRow.duration
            : (SK.valueAtLevel(tpl, 'duration', rank) || tpl.duration || 20)) * 1000;
          const dur = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawDur, 100) : rawDur;
          const buff = { id: skillId, until: now + dur, priority: 20, name: tpl.name || skillId, icon: tpl.icon || skillId };
          const atkB = (rankRow && rankRow.attackBoost != null) ? rankRow.attackBoost
            : (SK.valueAtLevel(tpl, 'attackBoost', rank) || tpl.attackBoost);
          const defB = (rankRow && rankRow.defenseBoost != null) ? rankRow.defenseBoost
            : (SK.valueAtLevel(tpl, 'defenseBoost', rank) || tpl.defenseBoost);
          if (atkB != null) buff.attackMult = 1 + atkB;
          if (defB != null) buff.defenseMult = 1 + defB;
          if (tpl.speedBoost != null) buff.speedMult = 1 + tpl.speedBoost;
          if (tpl.attackSpeedBoost != null) {
            buff.atkSpdMult = 1 + Math.max(0, Math.min(2, +tpl.attackSpeedBoost || 0));
          }
          if (tpl.immortal || tpl.invulnerable || skillId === 'test_immortal') {
            buff.immortal = true;
            buff.invulnerable = true;
          }
          applyPlayerBuff(tgtP, buff, now);
          pushEffects(tgtP);
          pushCombatStats(tgtP);
          results.push({ kind: 'buff', target: tgtP.pid === p.pid ? 'self' : 'target', targetPid: tgtP.pid, buffId: skillId, duration: dur / 1000, immortal: !!buff.immortal });
          if (tpl.fullHeal || buff.immortal) {
            const before = tgtP.hp;
            tgtP.hp = tgtP.maxHp;
            const healed = Math.max(0, tgtP.hp - before);
            if (healed > 0) results.push({ kind: 'heal', target: tgtP.pid === p.pid ? 'self' : 'target', targetPid: tgtP.pid, amount: healed, hp: tgtP.hp });
          }
          if (buff.immortal) {
            send(tgtP, {
              t: 'status_fx',
              effects: [{
                id: skillId,
                name: tpl.name || 'Бессмертие',
                kind: 'buff',
                duration: dur / 1000,
                until: now + dur,
                icon: 'immortal'
              }]
            });
          }
        }

        // Cure Poison / Toxin / Corrosion
        if (tpl.curePoison || (tpl.id && (tpl.id === 'eng_cure_toxin' || tpl.id.includes('cure_poison')))) {
          if (tgtP.debuffs && tgtP.debuffs.length > 0) {
            const prevLen = tgtP.debuffs.length;
            tgtP.debuffs = tgtP.debuffs.filter(e => {
              if (!e) return false;
              const isDot = e.kind === 'dot' || e.kind === 'poison' || +e.dps > 0;
              const isPoisonId = e.id === 'poison' || e.id === 'corrode' || e.id === 'eng_curse_corrode' || e.id === 'cc_corrode' || (e.stackGroup && e.stackGroup.startsWith('dot'));
              return !(isDot || isPoisonId);
            });
            const removed = prevLen - tgtP.debuffs.length;
            if (removed > 0) {
              pushEffects(tgtP);
              pushCombatStats(tgtP);
              results.push({ kind: 'cure', target: tgtP.pid === p.pid ? 'self' : 'target', targetPid: tgtP.pid, count: removed });
            }
          }
        }

        const nBuffDisp = (tpl.dispelBuffs | 0) || (rankRow && rankRow.dispelBuffs) || 0;
        const nDebDisp = (tpl.dispelDebuffs | 0) || (rankRow && rankRow.dispelDebuffs) || 0;
        if (tpl.category === 'dispel' || nBuffDisp > 0 || nDebDisp > 0) {
          if (nBuffDisp > 0 || tpl.category === 'dispel') {
            const db = BR.dispel(tgtP.buffs, { kind: 'buff', n: nBuffDisp > 0 ? nBuffDisp : 3, now: now });
            tgtP.buffs = db.list;
            results.push({ kind: 'dispel', target: tgtP.pid === p.pid ? 'self' : 'target', what: 'buff', n: db.removed.length });
          }
          if (nDebDisp > 0) {
            const dd = BR.dispel(tgtP.debuffs, { kind: 'debuff', n: nDebDisp, now: now });
            tgtP.debuffs = dd.list;
            results.push({ kind: 'dispel', target: tgtP.pid === p.pid ? 'self' : 'target', what: 'debuff', n: dd.removed.length });
          }
          pushEffects(tgtP);
          pushCombatStats(tgtP);
        }
      }

      if (tpl.category === 'utility' && !tpl.skillPower) {
        results.push({ kind: 'utility', skillId });
      }
    }

    // TARGET / AOE damage & debuff
    const needsTarget = !isSupportSkill && (tpl.target === 'target' || tpl.target === 'aoe' ||
      tpl.category === 'attack' || tpl.category === 'debuff');
    const hasDmg = (rankRow && rankRow.l2Power != null) ||
      (tpl.skillPower != null && +tpl.skillPower > 0) ||
      (tpl.damageMult != null) ||
      tpl.category === 'attack';
    const slowPct = (rankRow && rankRow.slowPercent != null) ? rankRow.slowPercent
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'slowPercent', rank) : tpl.slowPercent);
    const atkRed = (rankRow && rankRow.attackReduction != null) ? rankRow.attackReduction
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'attackReduction', rank) : tpl.attackReduction);
    const dotDmg = (rankRow && rankRow.dotDamage != null) ? rankRow.dotDamage
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'dotDamage', rank) : tpl.dotDamage);
    const defRed = (rankRow && rankRow.defenseReduction != null) ? rankRow.defenseReduction
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'defenseReduction', rank) : tpl.defenseReduction);
    const stunDurSec = (rankRow && rankRow.stunDuration != null) ? rankRow.stunDuration
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'stunDuration', rank) : (tpl.stunDuration || (tpl.category === 'debuff' && /arrest|shutdown/i.test(skillId) ? tpl.duration : 0)));
    const stunCh = (rankRow && rankRow.stunChance != null) ? rankRow.stunChance
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'stunChance', rank) : (tpl.stunChance || (stunDurSec > 0 ? (tpl.landChance || 0.40) : 0)));
    const hasDebuffFx = (slowPct != null && +slowPct > 0) ||
      (atkRed != null && +atkRed > 0) ||
      (dotDmg != null && +dotDmg > 0) ||
      (defRed != null && +defRed > 0) ||
      (stunDurSec != null && +stunDurSec > 0);
    const rawDebuffDur = ((rankRow && rankRow.duration != null) ? rankRow.duration
      : (SK.valueAtLevel ? SK.valueAtLevel(tpl, 'duration', rank) : null) || tpl.duration || 30) * 1000;
    const debuffDur = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawDebuffDur, 100) : rawDebuffDur;
    const landBase = tpl.landChance != null ? tpl.landChance : 0.80;
    const atkInt = (pack.primary && pack.primary.INT) || 41;
    const atkStr = (pack.primary && pack.primary.STR) || 22;

    // Spoil / «Вскрытие корпуса» (L2 Spoil)
    const isSpoil = skillId === 'op_scrap_collect' || tpl.l2Name === 'Spoil' ||
      (tpl.category === 'craft' && /spoil|scrap|вскрыт/i.test(String(tpl.name || '') + skillId));
    if (isSpoil) {
      const mid = msg.mid != null ? +msg.mid : null;
      const m = mid != null ? mobs.get(mid) : null;
      if (!m) { failSkill('no_target'); return; }
      if (m.hp <= 0) { failSkill('target_dead'); return; }
      if (m.spoilMarked) { failSkill('already_spoiled'); return; }
      const dx = (m.x || 0) - p.x;
      const dz = (m.z || 0) - p.z;
      if (Math.hypot(dx, dz) > range) { failSkill('range'); return; }
      if (!losGround(p.x, p.z, m.x, m.z)) { failSkill('los'); return; }

      m.spoilMarked = true;
      m.spoilBy = p.pid;
      results.push({ kind: 'spoil_mark', mid: m.mid, mobId: m.mobId });
      p.energy = Math.max(0, Math.floor(p.energy - energyCost));
      const fullCdSecS = tpl.cooldown != null ? tpl.cooldown : 6;
      p.cd[cdKey] = now + (L2.quantizeCombatMs ? L2.quantizeCombatMs(fullCdSecS * 1000, 100) : Math.floor(fullCdSecS * 1000));
      send(p, {
        t: 'skill_ok',
        skillId,
        rank,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy,
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        results,
        cooldown: fullCdSecS
      });
      broadcastAOI(p, {
        t: 'skill_fx', pid: p.pid, fromPid: p.pid, skillId, mid: m.mid, name: tpl.name
      });
      send(p, { t: 'msg', text: 'Корпус помечен для вскрытия.' });
      return;
    }

    if (needsTarget && (hasDmg || hasDebuffFx)) {
      const isCircSkill = dtype === 'circuit' || dtype === 'magic';
      let skillShotMod = 1.0;
      if (hasDmg || hasDebuffFx) {
        const shotOnce = isCircSkill ? consumeArmedShot(p, 'sps') : consumeArmedShot(p, 'ss');
        skillShotMod = shotOnce.shotMod;
        if (shotOnce.consumed) {
          send(p, { t: 'shot_use', id: shotOnce.consumed, inv: p.inv, armedShot: p.armedShot || null });
        }
      }

      const applyDebuffFx = (m) => {
        if (!m || m.hp <= 0) return false;
        const defMen = m.men != null ? m.men : (20 + (m.level || 1));
        const defCon = m.con != null ? m.con : (20 + (m.level || 1));
        const mobTpl = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId)) || null;
        const isRaid = !!(m.eliteRaid || m.epicRaid || (mobTpl && (mobTpl.eliteRaid || mobTpl.epicRaid)));
        const isStun = stunDurSec != null && +stunDurSec > 0;
        const baseLand = isStun ? (stunCh || 0.50) : landBase;
        const ok = L2.rollMagicLand
          ? L2.rollMagicLand(baseLand, atkInt, defMen, p.level, m.level || 1, {
              cAtk: pack.cAtk,
              cDef: m.cDef != null ? m.cDef : (m.mDef || 0),
              shotMod: skillShotMod,
              isRaid,
              isStun,
              atkStr,
              defCon,
              resistMod: (m.stunResist && isStun) ? (m.stunResist / 100) : 0
            })
          : Math.random() < baseLand;
        if (!ok) {
          results.push({ kind: 'resist', mid: m.mid });
          return false;
        }
        if (slowPct != null && +slowPct > 0) {
          m.slowUntil = now + debuffDur;
          m.slowMult = 1 - (+slowPct);
          applyMobEffect(m, {
            id: skillId,
            name: tpl.name || skillId,
            kind: 'slow',
            until: now + debuffDur,
            duration: debuffDur / 1000,
            slowMult: m.slowMult,
            icon: tpl.icon || skillId
          }, now);
          results.push({ kind: 'slow', mid: m.mid, pct: slowPct, duration: debuffDur / 1000, icon: tpl.icon || skillId });
        }
        if (atkRed != null && +atkRed > 0) {
          m.atkRedUntil = now + debuffDur;
          m.atkRedMult = 1 - (+atkRed);
          applyMobEffect(m, {
            id: skillId,
            name: tpl.name || skillId,
            kind: 'weakness',
            until: now + debuffDur,
            duration: debuffDur / 1000,
            atkRedMult: m.atkRedMult,
            icon: tpl.icon || skillId
          }, now);
          results.push({ kind: 'weakness', mid: m.mid, pct: atkRed, duration: debuffDur / 1000, icon: tpl.icon || skillId });
        }
        if (dotDmg != null && +dotDmg > 0) {
          const ticks = (rankRow && rankRow.dotTicks != null) ? rankRow.dotTicks : 30;
          const rawEvery = Math.max(100, Math.floor(debuffDur / Math.max(1, ticks)));
          const every = L2.quantizeCombatMs ? L2.quantizeCombatMs(rawEvery, 100) : Math.max(200, rawEvery);
          m.dots = m.dots || [];
          m.dots.push({
            dmg: +dotDmg, left: ticks, every: every, next: now + every, by: p.pid, skillId
          });
          const healRed = (rankRow && rankRow.healReduction != null)
            ? rankRow.healReduction
            : (tpl.healReduction || 0);
          if (healRed > 0) {
            m.healRedUntil = now + debuffDur;
            m.healRedMult = 1 - healRed;
          }
          applyMobEffect(m, {
            id: skillId,
            name: tpl.name || skillId,
            kind: 'dot',
            until: now + debuffDur,
            duration: debuffDur / 1000,
            dps: +dotDmg,
            icon: tpl.icon || skillId
          }, now);
          results.push({ kind: 'poison', mid: m.mid, dmg: +dotDmg, ticks, duration: debuffDur / 1000, icon: tpl.icon || skillId });
        }
        if (defRed != null && +defRed > 0) {
          m.defRedUntil = now + debuffDur;
          m.defRedMult = 1 - (+defRed);
          applyMobEffect(m, {
            id: skillId,
            name: tpl.name || skillId,
            kind: 'pdef',
            until: now + debuffDur,
            duration: debuffDur / 1000,
            pDefMult: m.defRedMult,
            icon: tpl.icon || skillId
          }, now);
          results.push({ kind: 'pdef', mid: m.mid, pct: defRed, duration: debuffDur / 1000, icon: tpl.icon || skillId });
        }
        if (isStun) {
          const sDurMs = Math.round(+stunDurSec * 1000);
          m.stunUntil = Math.max(m.stunUntil || 0, now + sDurMs);
          applyMobEffect(m, {
            id: skillId,
            name: tpl.name || skillId,
            kind: 'stun',
            stun: true,
            until: now + sDurMs,
            duration: +stunDurSec,
            icon: tpl.icon || skillId
          }, now);
          results.push({ kind: 'stun', mid: m.mid, duration: +stunDurSec, icon: tpl.icon || skillId });
        }
        return true;
      };

      const applyToMob = (m) => {
        if (!m || m.hp <= 0) return;
        if (tpl.oneshot || skillId === 'gm_oneshot') {
          const lethalDmg = Math.max(9999999, (m.maxHp || 1000) * 10);
          m.hp = 0;
          recordMobDamage(m, p.pid, lethalDmg);
          results.push({
            kind: 'dmg', mid: m.mid, dmg: lethalDmg, crit: true,
            blocked: false, damageType: 'physical', hp: 0,
            mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
            oneshot: true
          });
          broadcastAOI(p, {
            t: 'dmg', mid: m.mid, dmg: lethalDmg, crit: true,
            by: p.pid, skillId, damageType: 'physical',
            mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
          });
          onMobDeath(p, m);
          return;
        }

        if (!hasDmg && hasDebuffFx) {
          applyDebuffFx(m);
          addMobHate(m, p.pid, hateFromHit(m, 0, { debuff: true, flat: 50 }), { force: false });
          broadcastMobEffects(m);
          return;
        }

        const mobTpl = (MOB_DB && MOB_DB.get && MOB_DB.get(m.mobId)) || null;
        const atk = {
          pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy,
          critRate: pack.critRate + ((tpl.critBonus || 0) * 100),
          critDamage: pack.critDamage, level: p.level, dex: pack.dex,
          classTier: pack.tier != null ? pack.tier : (CS.getClass(p.cls) ? CS.getClass(p.cls).tier : 0)
        };
        const def = {
          pDef: m.pDef || 0, cDef: m.cDef != null ? m.cDef : (m.mDef || 0),
          evasion: m.evasion != null ? m.evasion : (15 + (m.level || 1) * 1.2),
          level: m.level || 1,
          eliteRaid: !!(m.eliteRaid || (mobTpl && mobTpl.eliteRaid)),
          epicRaid: !!(m.epicRaid || (mobTpl && mobTpl.epicRaid))
        };
        const ignore = tpl.ignoreDefense || 0;
        const hit = L2.resolveHit(atk, def, {
          skillPower: power,
          damageType: dtype,
          ignoreDef: ignore,
          shotMod: skillShotMod
        });

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
          results.push({ kind: 'lethal_feedback', mid: m.mid, mobId: m.mobId });
          onPlayerDeath(p, { byMob: true, killerName: mobDisplayNameServer(m.mobId) });
          return;
        }

        if (hit.missed) {
          results.push({ kind: 'miss', mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId) });
          return;
        }
        if (m.state === 'return') {
          results.push({ kind: 'evade', mid: m.mid, mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId) });
          broadcastAOI(p, {
            t: 'dmg', mid: m.mid, dmg: 0, crit: false, miss: true, evade: true,
            by: p.pid, skillId, hp: m.hp, maxHp: m.maxHp,
            mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
          });
          send(p, { t: 'msg', text: 'Монстр возвращается на базу (Уклонение / Evade)!' });
          return;
        }

        m.hp = Math.max(0, m.hp - hit.damage);
        recordMobDamage(m, p.pid, hit.damage);
        addMobHate(m, p.pid, hateFromHit(m, hit.damage, {
          crit: !!hit.crit, skill: true, debuff: hasDebuffFx
        }));

        if (hasDebuffFx) {
          applyDebuffFx(m);
          addMobHate(m, p.pid, hateFromHit(m, 0, { debuff: true, flat: 30 }));
        }

        results.push({
          kind: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit,
          blocked: hit.blocked, damageType: hit.damageType, hp: m.hp,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId)
        });
        broadcastAOI(p, {
          t: 'dmg', mid: m.mid, dmg: hit.damage, crit: hit.crit,
          by: p.pid, skillId, damageType: hit.damageType,
          hp: m.hp, maxHp: m.maxHp,
          mobId: m.mobId, mobName: mobDisplayNameServer(m.mobId),
          effects: getMobEffects(m, now)
        });

        const ls = (rankRow && rankRow.lifeSteal != null) ? rankRow.lifeSteal : tpl.lifeSteal;
        if (ls) {
          const heal = Math.floor(hit.damage * ls);
          p.hp = Math.min(p.maxHp, p.hp + heal);
          results.push({ kind: 'lifesteal', amount: heal, hp: p.hp });
        }
        if (m.hp <= 0) onMobDeath(p, m);
      };

      if (tpl.target === 'aoe') {
        const radius = (SK.valueAtLevel(tpl, 'aoeRadius', rank) || tpl.aoeRadius || 4);
        let cx = p.x, cz = p.z;
        if (msg.mid != null && mobs.get(msg.mid | 0)) {
          const tm = mobs.get(msg.mid | 0);
          const maxRange = (tpl.range || 15) + 3;
          if (dist2(p.x, p.z, tm.x, tm.z) <= maxRange * maxRange && losGround(p.x, p.z, tm.x, tm.z)) {
            cx = tm.x; cz = tm.z;
          } else {
            failSkill('range');
            return;
          }
        }
        if (spatialGrid && spatialGrid.activeKeys && spatialGrid.activeKeys.length > 0) {
          spatialGrid.forEachCandidate(cx, cz, radius, null, (m) => {
            if (!m || m.hp <= 0) return;
            if (dist2(cx, cz, m.x, m.z) > radius * radius) return;
            if (!losGround(p.x, p.z, m.x, m.z)) return;
            applyToMob(m);
          });
        } else {
          for (const [, m] of mobs) {
            if (m.hp <= 0) continue;
            if (dist2(cx, cz, m.x, m.z) > radius * radius) continue;
            if (!losGround(p.x, p.z, m.x, m.z)) continue;
            applyToMob(m);
          }
        }
      } else if (msg.mid != null) {
        const m = mobs.get(msg.mid | 0);
        if (!m || m.hp <= 0) {
          failSkill('target');
          return;
        }
        if (dist2(p.x, p.z, m.x, m.z) > effectRange * effectRange) {
          failSkill('range');
          return;
        }
        if (!losGround(p.x, p.z, m.x, m.z)) {
          failSkill('los');
          return;
        }
        applyToMob(m);
      } else if (msg.pid != null && tpl.category !== 'heal') {
        // PvP skill
        const tgt = players.get(msg.pid | 0);
        if (!tgt) {
          if (IS_CLUSTER && borderGhosts.has(msg.pid | 0)) {
            failSkill('cross_zone');
            send(p, { t: 'msg', text: 'Цель находится в другой зоне. Подойдите ближе.' });
          } else {
            failSkill('target');
          }
          return;
        }
        if (tgt.hp <= 0) {
          failSkill('target');
          return;
        }
        if (isSyntheticBot(p.yid) || isSyntheticBot(tgt.yid)) {
          failSkill('peace');
          return;
        }
        if (pvpPeaceBlocked(p, tgt)) {
          if (!isGM(p)) {
            failSkill('peace');
            send(p, { t: 'msg', text: 'В мирной зоне нельзя атаковать.' });
            return;
          }
        }
        if (dist2(p.x, p.z, tgt.x, tgt.z) > effectRange * effectRange) {
          failSkill('range');
          return;
        }
        if (!losGround(p.x, p.z, tgt.x, tgt.z)) {
          failSkill('los');
          return;
        }
        maybeFlagPvp(p, tgt);
        p._lastCombatAt = Date.now();
        tgt._lastCombatAt = Date.now();
        const tPack = tgt.combatPack;
        const hit = hasDmg ? L2.resolveHit(
          { pAtk: pack.pAtk, cAtk: pack.cAtk, accuracy: pack.accuracy, critRate: pack.critRate, level: p.level, dex: pack.dex },
          { pDef: tPack.pDef, cDef: tPack.cDef, evasion: tPack.evasion, level: tgt.level },
          { skillPower: power, damageType: dtype, shotMod: skillShotMod }
        ) : { missed: false, damage: 0, crit: false, blocked: false, damageType: dtype };

        if (tpl.oneshot || skillId === 'gm_oneshot') {
          const lethalDmg = Math.max(9999999, (tgt.maxHp || 1000) * 10);
          tgt.hp = 0;
          tgt.dead = true;
          onPlayerHit(tgt, lethalDmg);
          onPlayerHit(p, 0);
          send(tgt, { t: 'hit', dmg: lethalDmg, by: 'p' + p.pid, skillId, crit: true });
          broadcastAOI(tgt, { t: 'dmg_player', pid: tgt.pid, dmg: lethalDmg, crit: true, by: p.pid, skillId });
          results.push({ kind: 'dmg_player', pid: tgt.pid, dmg: lethalDmg, crit: true, oneshot: true });
          if (onPvpLethal) onPvpLethal(tgt, p);
        } else if (!hit.missed) {
          if (isPlayerImmortal(tgt)) {
            results.push({ kind: 'immune', pid: tgt.pid });
            send(tgt, { t: 'hit', dmg: 0, immune: true, by: 'p' + p.pid, skillId });
          } else {
            if (hasDmg && hit.damage > 0) {
              tgt.hp = Math.max(0, tgt.hp - hit.damage);
              onPlayerHit(tgt, hit.damage);
              onPlayerHit(p, 0);
              send(tgt, { t: 'hit', dmg: hit.damage, by: 'p' + p.pid, skillId });
              broadcastAOI(tgt, { t: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit, by: p.pid, skillId });
              results.push({ kind: 'dmg_player', pid: tgt.pid, dmg: hit.damage, crit: hit.crit });
              if (tgt.hp <= 0) onPvpLethal(tgt, p);
            } else if (!hasDmg) {
              onPlayerHit(tgt, 0);
              onPlayerHit(p, 0);
            }
            if (hasDebuffFx && tgt.hp > 0) {
              const tPrim = (tPack && tPack.primary) || {};
              const defMen = tPrim.MEN != null ? +tPrim.MEN : 25;
              const defCon = tPrim.CON != null ? +tPrim.CON : 27;
              const isStun = stunDurSec != null && +stunDurSec > 0;
              const baseLand = isStun ? (stunCh || 0.50) : landBase;
              const stunResistMod = (tPack.stunResist && isStun) ? Math.min(0.8, tPack.stunResist / 100) : 0;
              const ok = L2.rollMagicLand
                ? L2.rollMagicLand(baseLand, atkInt, defMen, p.level, tgt.level, {
                    cAtk: pack.cAtk,
                    cDef: tPack.cDef,
                    shotMod: skillShotMod,
                    isStun,
                    atkStr,
                    defCon,
                    resistMod: stunResistMod
                  })
                : Math.random() < baseLand;

              if (ok) {
                const appliedPvp = [];
                if (slowPct != null && +slowPct > 0) {
                  const slowMult = Math.max(0.35, 1 - (+slowPct));
                  applyPlayerDebuff(tgt, {
                    id: skillId, name: tpl.name || skillId, kind: 'slow', until: now + debuffDur,
                    slowMult: slowMult, icon: tpl.icon || 'slow_oil', priority: 10,
                    sourcePid: p.pid, sourceName: p.name
                  }, now);
                  appliedPvp.push({ id: skillId, name: tpl.name || skillId, kind: 'slow', duration: debuffDur / 1000, until: now + debuffDur, mult: slowMult, icon: tpl.icon || 'slow_oil' });
                  results.push({ kind: 'slow', pid: tgt.pid, pct: slowPct, duration: debuffDur / 1000, icon: tpl.icon || skillId });
                }
                if (atkRed != null && +atkRed > 0) {
                  const atkRedMult = Math.max(0.35, 1 - (+atkRed));
                  applyPlayerDebuff(tgt, {
                    id: skillId, name: tpl.name || skillId, kind: 'weakness', until: now + debuffDur,
                    atkRedMult: atkRedMult, icon: tpl.icon || skillId, priority: 10,
                    sourcePid: p.pid, sourceName: p.name
                  }, now);
                  appliedPvp.push({ id: skillId, name: tpl.name || skillId, kind: 'weakness', duration: debuffDur / 1000, until: now + debuffDur, mult: atkRedMult, icon: tpl.icon || skillId });
                  results.push({ kind: 'weakness', pid: tgt.pid, pct: atkRed, duration: debuffDur / 1000, icon: tpl.icon || skillId });
                }
                if (dotDmg != null && +dotDmg > 0) {
                  const dps = +dotDmg;
                  applyPlayerDebuff(tgt, {
                    id: skillId, name: tpl.name || skillId, kind: 'dot', until: now + debuffDur,
                    dps: dps, tickAcc: 0, icon: tpl.icon || skillId, priority: 10,
                    sourcePid: p.pid, sourceName: p.name
                  }, now);
                  appliedPvp.push({ id: skillId, name: tpl.name || skillId, kind: 'dot', duration: debuffDur / 1000, until: now + debuffDur, dps: dps, icon: tpl.icon || skillId });
                  results.push({ kind: 'poison', pid: tgt.pid, dmg: dps, duration: debuffDur / 1000, icon: tpl.icon || skillId });
                }
                if (defRed != null && +defRed > 0) {
                  const pDefMult = Math.max(0.35, 1 - (+defRed));
                  applyPlayerDebuff(tgt, {
                    id: skillId, name: tpl.name || skillId, kind: 'pdef', until: now + debuffDur,
                    pDefMult: pDefMult, icon: tpl.icon || skillId, priority: 10,
                    sourcePid: p.pid, sourceName: p.name
                  }, now);
                  appliedPvp.push({ id: skillId, name: tpl.name || skillId, kind: 'pdef', duration: debuffDur / 1000, until: now + debuffDur, mult: pDefMult, icon: tpl.icon || skillId });
                  results.push({ kind: 'pdef', pid: tgt.pid, pct: defRed, duration: debuffDur / 1000, icon: tpl.icon || skillId });
                }
                if (isStun) {
                  const sDurMs = Math.min(debuffDur, Math.round(+stunDurSec * 1000));
                  applyPlayerDebuff(tgt, {
                    id: skillId, name: tpl.name || skillId, kind: 'stun', stun: true,
                    until: now + sDurMs, icon: tpl.icon || 'stun', priority: 10,
                    sourcePid: p.pid, sourceName: p.name
                  }, now);
                  appliedPvp.push({ id: skillId, name: tpl.name || skillId, kind: 'stun', duration: sDurMs / 1000, until: now + sDurMs, icon: tpl.icon || 'stun' });
                  results.push({ kind: 'stun', pid: tgt.pid, duration: sDurMs / 1000, icon: tpl.icon || skillId });
                }
                if (appliedPvp.length) {
                  send(tgt, { t: 'status_fx', effects: appliedPvp, skillId, skillName: tpl.name || skillId });
                  pushEffects(tgt);
                  pushCombatStats(tgt);
                }
              } else {
                results.push({ kind: 'resist', pid: tgt.pid });
                send(tgt, { t: 'msg', text: 'Вы сопротивлялись эффекту умения!' });
              }
            }
          }
        } else {
          results.push({ kind: 'miss', pid: tgt.pid });
        }
      } else if (tpl.category === 'attack' || tpl.category === 'debuff' || tpl.skillPower) {
        if (!results.length) {
          failSkill('no_target');
          return;
        }
      }
    }

    p.energy = Math.max(0, Math.floor(p.energy - energyCost));

    const fullCdSec = tpl.cooldown != null ? tpl.cooldown : 0;
    const effCdSec = Math.max(fullCdSec, castSec);
    p.cd[cdKey] = now + (L2.quantizeCombatMs ? L2.quantizeCombatMs(effCdSec * 900, 100) : Math.floor(effCdSec * 900));

    send(p, {
      t: 'skill_ok',
      skillId,
      rank,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      results,
      cooldown: effCdSec
    });
    broadcastAOI(p, {
      t: 'skill_fx',
      pid: p.pid,
      fromPid: p.pid,
      skillId,
      mid: msg.mid || null,
      targetPid: msg.pid || null,
      name: tpl.name
    });
  }

  return {
    cancelPlayerCast,
    checkCastCancelOnDamage,
    onPlayerHit,
    doCastBegin,
    doSkillCast
  };
}

module.exports = {
  createSkillCaster,
  MAGIC_RANGE_DEFAULT,
  MAGIC_EFFECT_RANGE_DEFAULT
};
