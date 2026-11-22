// SERVER / HANDLERS / ITEM-USE-HANDLER.JS
// Обработка применения расходников, свитков, зелий и косметики (L2 consumables & scrolls)
'use strict';

const G = require('../../shared/game-rules.js');
const COS = require('../../shared/cosmetics-db.js');
const SK = require('../../shared/skill-db.js');

/** Банки HP/MP восстанавливают объём постепенно за столько секунд (L2: HoT). */
const POTION_HOT_SEC = 15;

function createItemUseHandler(ctx) {
  const {
    players,
    send,
    broadcastAOI,
    snapStandY,
    isPeaceAt,
    zoneLabelAt,
    updatePlayerRegion,
    ensureNearbyMobs,
    resetMoveBudget,
    entityTransforms,
    saveProfileNow,
    markProfileDirty = null,
    pushEffects,
    pushCombatStats,
    applyPlayerBuff,
    resurrectPlayer,
    deathSelfPayload,
    grantSkillFree,
    cosmeticsPublic,
    tableGet,
    itemLookup,
    isBadKey,
    checkRate,
    playerStunned,
    dist2,
    toggleShotArm,
    ZS = null,
    IS_CLUSTER = false,
    TOTAL_WORKERS = 1,
    CURRENT_WORKER_ID = 1,
    initiateClusterHandoff = null,
    pushWeight = () => {}
  } = ctx;

  // MEDIUM-5: расходники (зелья, соски) — частые действия; в write-behind (сейв батчем ≤30 с),
  // а не полная запись профиля на каждый клик. Без markProfileDirty — немедленный сейв, как раньше.
  const deferSave = (pl) => (typeof markProfileDirty === 'function' ? markProfileDirty(pl) : saveProfileNow(pl));

  function doItemUse(p, msg) {
    if (p.dead || (p.hp != null && p.hp <= 0)) {
      const deadId = String(msg && (msg.id || msg.templateId) || '').toLowerCase() || undefined;
      send(p, { t: 'use_fail', reason: 'dead', id: deadId });
      send(p, { t: 'msg', text: 'Мёртвый персонаж не может использовать предметы.' });
      return;
    }
    if (p.trade || p.store) {
      send(p, { t: 'use_fail', reason: 'busy' });
      return;
    }
    if (typeof playerStunned === 'function' && playerStunned(p)) {
      send(p, { t: 'use_fail', reason: 'stunned', id: String(msg && (msg.id || msg.templateId) || '') });
      send(p, { t: 'msg', text: 'Вы оглушены и не можете использовать предметы!' });
      return;
    }
    if (typeof checkRate === 'function' && !checkRate(p, 'action')) return;
    const id = String(msg && (msg.id || msg.templateId) || '').toLowerCase();
    if (!id || (typeof isBadKey === 'function' && isBadKey(id))) {
      send(p, { t: 'use_fail', reason: 'args' });
      return;
    }
    // C1 Soulshot/Spiritshot: arm auto-consume (не списывать пачкой при клике)
    const shotToggle = typeof toggleShotArm === 'function' ? toggleShotArm(p, id) : null;
    if (shotToggle) {
      if (!shotToggle.ok) {
        send(p, { t: 'use_fail', reason: shotToggle.reason || 'empty', id, inv: p.inv });
        return;
      }
      deferSave(p);
      send(p, {
        t: 'use_ok',
        id,
        shotArmed: shotToggle.armed,
        armedShot: p.armedShot || null,
        shotKind: shotToggle.kind || null,
        shotMult: shotToggle.mult ? Math.round(shotToggle.mult * 100) / 100 : null,
        gradeOk: shotToggle.gradeOk,
        weaponGrade: shotToggle.weaponGrade || null,
        inv: p.inv,
        equip: p.equip || {},
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy
      });
      let armText = shotToggle.armed
        ? ('Заряды включены: ' + id + ' (×' + (shotToggle.mult || 2) + ')')
        : ('Заряды выключены: ' + id);
      if (shotToggle.armed && shotToggle.gradeOk === false) {
        armText += ' — грейд не совпадает с оружием (' + (shotToggle.weaponGrade || '?') + ')';
      }
      send(p, { t: 'msg', text: armText });
      return;
    }
    // G.CONSUMABLES['constructor'] возвращал функцию (truthy), из-за чего
    // проверки «неизвестный предмет» и «нет предмета» обходились.
    const eff = tableGet(G.CONSUMABLES, id);
    if (!eff || typeof eff !== 'object') {
      send(p, { t: 'use_fail', reason: 'unknown', id });
      return;
    }
    if ((p.inv[id] || 0) < 1) {
      send(p, { t: 'use_fail', reason: 'empty', id, inv: p.inv, equip: p.equip });
      return;
    }

    // Косметика / титулы / ауры / мем-свитки
    if (eff.cosmetic || tableGet(COS.ITEM_EFFECTS, id)) {
      const cosEff = tableGet(COS.ITEM_EFFECTS, id) || {};
      // skill scroll already known → don't consume
      if (cosEff.grantSkill) {
        const sid = String(cosEff.grantSkill).toLowerCase();
        if (p.skills && (p.skills[sid] || 0) >= 1) {
          send(p, { t: 'use_fail', reason: 'already_skill', id, inv: p.inv, equip: p.equip });
          send(p, { t: 'msg', text: 'Умение уже изучено: ' + (SK.get(sid) && SK.get(sid).name || sid) });
          return;
        }
      }
      p.inv[id] = (p.inv[id] || 0) - 1;
      if (p.inv[id] <= 0) delete p.inv[id];
      if (typeof pushWeight === 'function') pushWeight(p);
      const applied = COS.applyItemEffect(p.cosmetics, cosEff);
      p.cosmetics = applied.cosmetics;
      const auraId = cosEff.auraId || eff.auraId;
      if (auraId) {
        const now = Date.now();
        const dur = eff.duration || 1200;
        const itemObj = itemLookup(id);
        const buffName = (itemObj && itemObj.name) || 'Эликсир ауры';
        const buffObj = {
          id: id,
          name: buffName,
          kind: 'buff',
          auraId: auraId,
          stackGroup: 'aura_elixir',
          until: now + dur * 1000,
          duration: dur,
          priority: 30,
          persistOnDeath: true,
          icon: eff.icon || ('elixir_' + auraId)
        };
        if (eff.attackMult) buffObj.attackMult = eff.attackMult;
        if (eff.defenseMult) buffObj.defenseMult = eff.defenseMult;
        if (eff.speedMult) buffObj.speedMult = eff.speedMult;
        if (eff.atkSpdMult) buffObj.atkSpdMult = eff.atkSpdMult;
        if (eff.critDamageBoost) buffObj.critDamageBoost = eff.critDamageBoost;
        if (eff.vampiric) buffObj.vampiric = eff.vampiric;
        if (eff.stunResist) buffObj.stunResist = eff.stunResist;
        if (eff.maxEnergyBonus) buffObj.maxEnergyBonus = eff.maxEnergyBonus;
        if (eff.energyRegenMult) buffObj.energyRegenMult = eff.energyRegenMult;
        if (eff.hpRegenFlat) buffObj.hpRegenFlat = eff.hpRegenFlat;
        if (eff.energyRegenFlat) buffObj.energyRegenFlat = eff.energyRegenFlat;
        if (eff.adenaMult) buffObj.adenaMult = eff.adenaMult;
        if (eff.dropMult) buffObj.dropMult = eff.dropMult;

        applyPlayerBuff(p, buffObj, now);
        pushCombatStats(p);
        pushEffects(p);
      }
      let grantInfo = null;
      if (applied.grantSkill) {
        grantInfo = grantSkillFree(p, applied.grantSkill);
      }
      saveProfileNow(p);
      const cosPub = cosmeticsPublic(p);
      send(p, {
        t: 'use_ok',
        id,
        cosmetic: true,
        cosmetics: cosPub,
        cosmeticsFull: p.cosmetics,
        grantSkill: grantInfo,
        skills: p.skills || {},
        inv: p.inv,
        equip: p.equip || {},
        hp: Math.floor(p.hp),
        maxHp: p.maxHp,
        energy: Math.floor(p.energy),
        maxEnergy: p.maxEnergy
      });
      if (applied.msg) send(p, { t: 'msg', text: applied.msg });
      if (grantInfo && grantInfo.ok && !grantInfo.already) {
        send(p, {
          t: 'learn_skill_ok',
          skillId: grantInfo.skillId,
          level: 1,
          rank: 1,
          sp: p.sp || 0,
          spRemaining: p.sp || 0,
          cost: 0,
          spCost: 0,
          name: grantInfo.name,
          free: true,
          skills: p.skills
        });
      }
      // AOI: все видят новый титул/цвет/ауру
      broadcastAOI(p, {
        t: 'cosmetic',
        pid: p.pid,
        title: cosPub.title,
        titleName: cosPub.titleName,
        titleColor: cosPub.titleColor,
        nameColor: cosPub.nameColor,
        aura: cosPub.aura
      });
      if (auraId) {
        broadcastAOI(p, {
          t: 'cosmetic_burst',
          pid: p.pid,
          auraId: auraId
        });
      }
      return;
    }

    if (p.dead) {
      send(p, { t: 'use_fail', reason: 'dead', id });
      send(p, { t: 'msg', text: 'Мёртвый персонаж не может использовать предметы.' });
      return;
    }
    if (typeof playerStunned === 'function' && playerStunned(p)) {
      send(p, { t: 'use_fail', reason: 'stunned', id });
      send(p, { t: 'msg', text: 'Вы оглушены и не можете использовать предметы!' });
      return;
    }
    if (eff.escapeToCity && (p.isFlagged || p.duel || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000))) {
      send(p, { t: 'use_fail', reason: 'flagged', id });
      send(p, { t: 'msg', text: 'Нельзя телепортироваться во время боя, дуэли или PvP-флага!' });
      return;
    }
    if (eff.escapeToCity && (p.trade || p.store)) {
      send(p, { t: 'use_fail', reason: 'busy', id });
      send(p, { t: 'msg', text: 'Нельзя телепортироваться во время торговли или лавки!' });
      return;
    }
    p.cd = p.cd || {};
    const now = Date.now();
    if (eff.healHp && (p.cd.potionHp || 0) > now) {
      const remainSec = Math.ceil((p.cd.potionHp - now) / 1000);
      send(p, { t: 'use_fail', reason: 'cooldown', id, cdMs: p.cd.potionHp - now });
      send(p, { t: 'msg', text: `Зелье исцеления восстанавливается (${remainSec} сек).` });
      return;
    }
    if (eff.healEnergy && (p.cd.potionEnergy || 0) > now) {
      const remainSec = Math.ceil((p.cd.potionEnergy - now) / 1000);
      send(p, { t: 'use_fail', reason: 'cooldown', id, cdMs: p.cd.potionEnergy - now });
      send(p, { t: 'msg', text: `Зелье энергии восстанавливается (${remainSec} сек).` });
      return;
    }
    let resTgt = null;
    if (eff.resurrection) {
      const targetPid = msg.targetPid != null ? (msg.targetPid | 0) : (p.target ? (p.target.pid | 0) : null);
      resTgt = targetPid ? players.get(targetPid) : null;
      if (!resTgt || !resTgt.dead || resTgt.pid === p.pid) {
        send(p, { t: 'use_fail', reason: 'invalid_target', id });
        send(p, { t: 'msg', text: 'Выберите погибшего союзника для воскрешения.' });
        return;
      }
      if (dist2(p.x, p.z, resTgt.x, resTgt.z) > 400) {
        send(p, { t: 'use_fail', reason: 'range', id });
        send(p, { t: 'msg', text: 'Цель слишком далеко.' });
        return;
      }
    }

    p.inv[id] = (p.inv[id] || 0) - 1;
    if (p.inv[id] <= 0) delete p.inv[id];
    if (typeof pushWeight === 'function') pushWeight(p);
    // Актуальный maxHp/maxEnergy с экипа (без ratio-стирания хила — heal после)
    const pack = p.combatPack;
    if (pack) {
      p.maxHp = pack.maxHp;
      p.maxEnergy = pack.maxEnergy;
    }
    if (eff.escapeToCity) {
      p.x = -116.008;
      p.z = -138.057;
      if (entityTransforms && p.transformSlot >= 0) entityTransforms.updatePos(p.transformSlot, p.x, p.y, p.z);
      snapStandY(p);
      p.moving = false;
      resetMoveBudget(p);
      broadcastAOI(p, { t: 'player_teleport', pid: p.pid, x: p.x, y: p.y, z: p.z });
      send(p, {
        t: 'teleport_ok',
        name: 'Деревня поющей стали', x: p.x, y: p.y, z: p.z,
        region: p.region, peace: isPeaceAt(p.x, p.z), zoneName: zoneLabelAt(p.x, p.z),
        inv: p.inv
      });
      send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
      send(p, { t: 'msg', text: 'Вы вернулись в Деревню Поющей Стали.' });
      saveProfileNow(p);
      if (IS_CLUSTER && ZS && TOTAL_WORKERS > 1 && typeof initiateClusterHandoff === 'function') {
        const targetWorker = ZS.getWorkerForCoords(p.x, p.z, TOTAL_WORKERS, CURRENT_WORKER_ID);
        if (targetWorker !== CURRENT_WORKER_ID) {
          initiateClusterHandoff(p, targetWorker);
          return;
        }
      }
      updatePlayerRegion(p);
      ensureNearbyMobs(p);
    }
    if (eff.resurrection && resTgt) {
      resTgt._resPending = {
        byPid: p.pid,
        byName: p.name,
        at: now
      };
      send(resTgt, {
        t: 'resurrect_ask',
        from: p.pid,
        fromName: p.name,
        text: `Игрок ${p.name} предлагает вам воскрешение. Воскреснуть на месте?`
      });
      send(p, { t: 'msg', text: `Предложение воскрешения отправлено игроку ${resTgt.name}.` });
      if (msg.confirmed) {
        if (typeof resurrectPlayer === 'function') {
          resurrectPlayer(resTgt, p);
        } else {
          resTgt.dead = false;
          resTgt.hp = Math.max(1, Math.floor(resTgt.maxHp * 0.7));
          resTgt.energy = Math.max(1, Math.floor(resTgt.maxEnergy * 0.5));
          resTgt.moving = false;
          resetMoveBudget(resTgt);
          saveProfileNow(resTgt);
          send(resTgt, { t: 'you_revived', mode: 'resurrect', by: p.name, self: deathSelfPayload(resTgt) });
          broadcastAOI(resTgt, { t: 'player_revived', pid: resTgt.pid, x: resTgt.x, z: resTgt.z });
        }
        resTgt._resPending = null;
        send(p, { t: 'msg', text: `Вы воскресили игрока ${resTgt.name}!` });
      }
    }
    if (eff.curePoison) {
      if (Array.isArray(p.debuffs)) {
        p.debuffs = p.debuffs.filter(e => e && e.kind !== 'poison' && e.id !== 'poison');
        pushEffects(p);
        send(p, { t: 'msg', text: 'Яд нейтрализован.' });
      }
    }
    if (eff.cureBleed) {
      if (Array.isArray(p.debuffs)) {
        p.debuffs = p.debuffs.filter(e => e && e.kind !== 'bleed' && e.id !== 'bleed');
        pushEffects(p);
        send(p, { t: 'msg', text: 'Кровотечение остановлено.' });
      }
    }
    // L2: банки восстанавливают постепенно (HoT), а не мгновенно. Весь объём — за
    // POTION_HOT_SEC секунд через бафф hpRegenFlat/energyRegenFlat (в секунду), который
    // учитывает обработчик регена. КД = длительности, чтобы новая банка не обрывала прежнюю.
    // MP-банки выведены из экономики (retired в item-db); остатки в сумках работают так же.
    let buffApplied = false;
    if (eff.healHp) {
      p.cd.potionHp = now + POTION_HOT_SEC * 1000;
      applyPlayerBuff(p, {
        id: 'potion_hp', name: 'Восстановление прочности', kind: 'buff',
        stackGroup: 'potion_hp', until: now + POTION_HOT_SEC * 1000, duration: POTION_HOT_SEC,
        priority: 25, icon: eff.icon || id, hpRegenFlat: eff.healHp / POTION_HOT_SEC
      }, now);
      buffApplied = true;
    }
    if (eff.healEnergy) {
      p.cd.potionEnergy = now + POTION_HOT_SEC * 1000;
      applyPlayerBuff(p, {
        id: 'potion_energy', name: 'Восстановление энергии', kind: 'buff',
        stackGroup: 'potion_energy', until: now + POTION_HOT_SEC * 1000, duration: POTION_HOT_SEC,
        priority: 25, icon: eff.icon || id, energyRegenFlat: eff.healEnergy / POTION_HOT_SEC
      }, now);
      buffApplied = true;
    }
    const dur = eff.duration || 0;
    if (dur > 0 && (eff.damageBoost || eff.attackMult || eff.defenseMult || eff.speedMult || eff.atkSpdMult || eff.attackSpeedBoost)) {
      const now = Date.now();
      const itemObj = itemLookup(id);
      const buffName = (itemObj && itemObj.name) || id;
      const buffObj = {
        id: id,
        name: buffName,
        kind: 'buff',
        stackGroup: 'item_' + id,
        until: now + dur * 1000,
        duration: dur,
        priority: 25,
        icon: eff.icon || id
      };
      if (eff.damageBoost || eff.attackMult) {
        buffObj.attackMult = eff.damageBoost || eff.attackMult;
      }
      if (eff.defenseMult) {
        buffObj.defenseMult = eff.defenseMult;
      }
      if (eff.speedMult) {
        buffObj.speedMult = eff.speedMult;
      }
      if (eff.atkSpdMult || eff.attackSpeedBoost) {
        buffObj.atkSpdMult = eff.atkSpdMult || eff.attackSpeedBoost;
      }
      applyPlayerBuff(p, buffObj, now);
      buffApplied = true;
    }
    deferSave(p);
    send(p, {
      t: 'use_ok',
      id,
      hp: Math.floor(p.hp),
      maxHp: p.maxHp,
      energy: Math.floor(p.energy),
      maxEnergy: p.maxEnergy,
      healedHp: eff.healHp || 0,
      healedEnergy: eff.healEnergy || 0,
      damageBoost: eff.damageBoost || 0,
      duration: eff.duration || 0,
      inv: p.inv,
      equip: p.equip || {}
    });
    if (buffApplied) {
      pushEffects(p);
      pushCombatStats(p);
    }
  }

  return {
    doItemUse
  };
}

createItemUseHandler.createItemUseHandler = createItemUseHandler;
module.exports = createItemUseHandler;
