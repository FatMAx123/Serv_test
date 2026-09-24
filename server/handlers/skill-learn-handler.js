// SERVER / HANDLERS / SKILL-LEARN-HANDLER.JS — Обучение скиллам, апгрейд приборов, смена профессии.
// Перенесён из server.js при декомпозиции монолита (Риск 1).
'use strict';

function createSkillLearnHandler(deps) {
  const {
    SK,
    NPCS,
    CS,
    QD,
    ITEMS,
    send,
    broadcastAOI,
    saveProfileNow,
    pushCombatStats,
    npcForService,
    skillAllowedForClass,
    grantSkillFree,
    grantExpertiseSkills,
    safeDevices,
    syncDevicesToEquip,
    pushWeight
  } = deps;

  /** Learn / upgrade skill for SP (server authority). */
  function doLearnSkill(p, skillId, npcId) {
    skillId = String(skillId || '').toLowerCase();
    const tpl = SK.get(skillId);
    if (!tpl) {
      send(p, { t: 'learn_skill_fail', reason: 'unknown', skillId });
      return;
    }

    // Тренер умений: обучение только рядом с NPC-тренером (<= 7 м), как в магазине/складе
    let trainer = null;
    if (npcId) {
      trainer = npcForService(p, npcId, 'learn_skill_fail', (n) => n.type === 'trainer' || n.id === 'instructor_thorn');
      if (!trainer) return;
    } else {
      // Если npcId не передан, ищем любого тренера в радиусе 7 м
      const all = NPCS.allNpcs ? NPCS.allNpcs() : [];
      for (let i = 0; i < all.length; i++) {
        const n = all[i];
        if ((n.type === 'trainer' || n.id === 'instructor_thorn') && NPCS.inRange(n, p.x, p.z)) {
          trainer = n;
          break;
        }
      }
      if (!trainer) {
        send(p, { t: 'learn_skill_fail', reason: 'range', skillId });
        return;
      }
    }
    if (trainer && Array.isArray(trainer.trainerClasses) && trainer.trainerClasses.length > 0) {
      const rootCls = (CS.rootClass && CS.rootClass(p.cls)) || p.cls;
      if (!trainer.trainerClasses.includes(p.cls) && !trainer.trainerClasses.includes(rootCls)) {
        send(p, { t: 'learn_skill_fail', reason: 'class_trainer', skillId, npcId: trainer.id });
        return;
      }
    }

    if (tpl.meme || tpl.class === 'any' || tpl.class === 'all' || tpl.class === '*') {
      send(p, { t: 'learn_skill_fail', reason: 'class', skillId });
      return;
    }
    if (!skillAllowedForClass(p, tpl.class)) {
      send(p, { t: 'learn_skill_fail', reason: 'class', skillId });
      return;
    }
    if (tpl.classChange && (p.classTier | 0) < 1) {
      send(p, { t: 'learn_skill_fail', reason: 'class', skillId });
      return;
    }
    if (!p.skills) p.skills = {};
    const cur = p.skills[skillId] || 0;
    const max = (tpl.ranks && tpl.ranks.length) ? tpl.ranks.length : (tpl.maxLevel || 1);
    if (cur >= max) {
      send(p, { t: 'learn_skill_fail', reason: 'max', skillId });
      return;
    }
    const next = cur + 1;
    const nextRow = (tpl.ranks && tpl.ranks[next - 1]) || null;
    const needLv = (nextRow && nextRow.levelReq != null) ? nextRow.levelReq : (tpl.levelReq || 1);
    if (p.level < needLv) {
      send(p, { t: 'learn_skill_fail', reason: 'level', skillId, need: needLv });
      return;
    }
    // Проверка наличия модулей для оператора и уровня клапана/наручей
    const isOp = p.cls === 'operator' || (CS.rootClass && CS.rootClass(p.cls) === 'operator');
    if (isOp && tpl.type !== 'passive' && !tpl.meme) {
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
      if (devType === 'compressor') {
        const n = p.equip && p.equip.necklace;
        const nTid = n && String(n.templateId || n.id || '').toLowerCase();
        const isComp = n && (nTid === 'operator_compressor_low' ||
          (ITEMS.get(nTid) && (ITEMS.get(nTid).isCompressor || ITEMS.get(nTid).isOperatorDevice || ITEMS.get(nTid).isValveDevice)));
        if (!isComp) {
          send(p, { t: 'learn_skill_fail', reason: 'need_compressor', skillId });
          return;
        }
        const have = (p.devices ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : 1) | 0;
        if (have < need) {
          send(p, { t: 'learn_skill_fail', reason: 'valve_level', skillId, have, need });
          return;
        }
      } else if (devType === 'bracers') {
        const br = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
        const brTid = br && String(br.templateId || br.id || '').toLowerCase();
        const isBracers = br && (brTid === 'operator_bracers_low' ||
          (ITEMS.get(brTid) && (ITEMS.get(brTid).isBracers || ITEMS.get(brTid).isOperatorBracers || ITEMS.get(brTid).isBraceletDevice)));
        if (!isBracers) {
          send(p, { t: 'learn_skill_fail', reason: 'need_bracers', skillId });
          return;
        }
        const have = (p.devices ? (p.devices.wrist != null ? p.devices.wrist : p.devices.nano) : 1) | 0;
        if (have < need) {
          send(p, { t: 'learn_skill_fail', reason: 'wrist_level', skillId, have, need });
          return;
        }
      }
    }
    // Device gate: cannot LEARN attack skills until resonator circuit level is enough
    // (same ladder as cast gate — learn blocked early so SP isn't spent on unusable ranks)
    if (tpl.type === 'active_damage' || tpl.type === 'aoe_damage') {
      const dev = p.devices || {};
      const devLv = Math.max(0, dev.circuit | 0);
      let minCircuit = 0;
      if (next >= 4) minCircuit = 3;
      else if (next >= 3) minCircuit = 2;
      else if (next >= 2) minCircuit = 1;
      if (devLv < minCircuit) {
        send(p, { t: 'learn_skill_fail', reason: 'device_circuit', skillId, needCircuit: minCircuit, haveCircuit: devLv });
        return;
      }
    }
    const spCost = (nextRow && nextRow.spCost != null)
      ? nextRow.spCost
      : (tpl.spCost != null ? tpl.spCost : 100);
    const haveSp = p.sp || 0;
    if (haveSp < spCost) {
      send(p, { t: 'learn_skill_fail', reason: 'sp', skillId, need: spCost, have: haveSp });
      return;
    }
    p.sp = haveSp - spCost;
    p.skills[skillId] = next;
    saveProfileNow(p);
    pushCombatStats(p);
    send(p, {
      t: 'learn_skill_ok',
      skillId,
      level: next,
      spCost,
      spRemaining: p.sp,
      skills: p.skills
    });
  }

  function doDeviceUpgrade(p, track) {
    const fail = (reason, extra) => {
      send(p, Object.assign({ t: 'device_fail', track, reason }, extra || {}));
    };
    const ok = (extra) => {
      send(p, Object.assign({
        t: 'device_ok', track,
        devices: p.devices, sp: p.sp || 0, inv: p.inv, equip: p.equip
      }, extra || {}));
    };
    if (p.dead || (p.hp != null && p.hp <= 0)) return fail('dead');
    if (p.trade || p.store) return fail('busy');
    if (!p.devices) p.devices = safeDevices(null, p.equip, p.level);

    // Прибор должен быть надет: прокачивается конкретная вещь, не «аккаунт».
    const necklace = p.equip && p.equip.necklace;
    const nTpl = necklace && ITEMS.get(String(necklace.templateId || necklace.id || '').toLowerCase());
    const bracelet = p.equip && (p.equip.bracelet || p.equip.ring_l || p.equip.ring_r);
    const bTpl = bracelet && ITEMS.get(String(bracelet.templateId || bracelet.id || '').toLowerCase());

    if (track === 'circuit' || track === 'nano' || track === 'valve' || track === 'wrist') {
      const isCircuit = track === 'circuit' || track === 'valve';
      if (isCircuit && !ITEMS.isResonatorTpl(nTpl)) return fail(track === 'valve' ? 'need_compressor' : 'need_resonator');
      if (!isCircuit && !ITEMS.isNanoBraceletTpl(bTpl)) return fail(track === 'wrist' ? 'need_bracers' : 'need_bracelet');
      const cur = isCircuit ? (p.devices.valve != null ? p.devices.valve : p.devices.circuit) : (p.devices.wrist != null ? p.devices.wrist : p.devices.nano);
      const tplMax = isCircuit
        ? ((nTpl && (nTpl.circuitMaxLevel || nTpl.valveMaxLevel)) || ITEMS.DEVICE_MAX_LEVEL)
        : ((bTpl && (bTpl.nanoMaxLevel || bTpl.wristMaxLevel)) || ITEMS.DEVICE_MAX_LEVEL);
      const cap = Math.min(tplMax, ITEMS.deviceLevelCap(p.level));
      if (cur >= cap) return fail('max_level', { level: cur, cap });
      const next = cur + 1;
      const cost = ITEMS.circuitSpCost(next);
      if ((p.sp || 0) < cost) return fail('sp', { need: cost, sp: p.sp || 0, level: cur });
      p.sp -= cost;
      if (isCircuit) {
        p.devices.circuit = next;
        p.devices.valve = next;
      } else {
        p.devices.nano = next;
        p.devices.wrist = next;
      }
      syncDevicesToEquip(p);
      pushCombatStats(p);
      saveProfileNow(p);
      return ok({ level: next, spCost: cost });
    }

    if (track === 'shell' || track === 'casing') {
      const isShell = track === 'shell';
      if (isShell && !ITEMS.isResonatorTpl(nTpl)) return fail('need_resonator');
      if (!isShell && !ITEMS.isNanoBraceletTpl(bTpl)) return fail('need_bracelet');
      const ladder = isShell ? ITEMS.RESONATOR_SHELL_LADDER : ITEMS.NANO_CASING_LADDER;
      const cur = isShell ? p.devices.shell : p.devices.casing;
      if (cur >= ladder.length - 1) return fail('max_level', { index: cur });
      const next = cur + 1;
      const step = ladder[next];
      if (p.level < (step.playerLevel || 1)) {
        return fail('player_level', { needLevel: step.playerLevel, index: cur, label: step.label });
      }
      const mats = step.materials || {};
      for (const id of Object.keys(mats)) {
        const need = mats[id] | 0;
        if (need > 0 && (p.inv[id] | 0) < need) {
          return fail('no_mats', { matId: id, need, have: p.inv[id] | 0, index: cur, materials: mats });
        }
      }
      for (const id of Object.keys(mats)) {
        const need = mats[id] | 0;
        if (need <= 0) continue;
        p.inv[id] = (p.inv[id] | 0) - need;
        if (p.inv[id] <= 0) delete p.inv[id];
      }
      if (isShell) p.devices.shell = next; else p.devices.casing = next;
      syncDevicesToEquip(p);
      pushCombatStats(p);
      if (typeof pushWeight === 'function') pushWeight(p);
      saveProfileNow(p);
      return ok({ index: next, label: step.label, grade: step.grade });
    }

    fail('bad_track');
  }

  /** Смена профессии (1st @20, 2nd @40) — сервер авторитет. */
  function doClassTransfer(p, targetClassId) {
    if (p.dead || p.hp <= 0) {
      send(p, { t: 'class_transfer_fail', reason: 'dead', cls: p.cls });
      return false;
    }
    const toId = String(targetClassId || '').toLowerCase();
    if (!CS.canTransfer(p.cls, toId, p.level)) {
      send(p, { t: 'class_transfer_fail', reason: 'invalid', cls: p.cls, level: p.level });
      return false;
    }
    const from = CS.getClass(p.cls);
    const to = CS.getClass(toId);
    // Проверка квеста на смену профессии:
    // Целевой класс может требовать уникальный квест (to.transferQuest1st, например path_to_constructor / path_to_technomancer),
    // либо базовый квест сертификации (from.transferQuest, например main_04_certification_tech).
    const targetQuest = to && (to.transferQuest1st || (to.tier === 2 ? to.transferQuest : null));
    const baseQuest = from && from.transferQuest;
    const questsDone = (p.quests && p.quests.done) || {};

    let needQuest = null;
    if (targetQuest && QD.get(targetQuest)) {
      if (!questsDone[targetQuest] && (!baseQuest || !questsDone[baseQuest])) {
        needQuest = targetQuest;
      }
    } else if (baseQuest && QD.get(baseQuest)) {
      if (!questsDone[baseQuest]) {
        needQuest = baseQuest;
      }
    }

    if (needQuest) {
      send(p, { t: 'class_transfer_fail', reason: 'quest', cls: p.cls, need: needQuest });
      return false;
    }
    p.cls = to.id;
    p.classTier = to.tier;
    grantExpertiseSkills(p);
    if (!Array.isArray(p.classHistory)) p.classHistory = [];
    if (p.classHistory[p.classHistory.length - 1] !== to.id) p.classHistory.push(to.id);
    p.applyClassStats();
    p.hp = p.maxHp;
    p.energy = p.maxEnergy;
    send(p, {
      t: 'class_transfer_ok',
      cls: p.cls,
      className: to.name,
      classTier: p.classTier,
      classHistory: p.classHistory,
      level: p.level,
      maxHp: p.maxHp,
      maxEnergy: p.maxEnergy,
      description: to.description,
      path: to.path,
      role: to.role
    });
    // AOI: обновить cls у наблюдателей
    broadcastAOI(p, {
      t: 'p_update',
      pid: p.pid,
      cls: p.cls,
      name: p.name,
      level: p.level,
      gender: p.gender,
      race: p.race
    });
    // Смена профессии необратима — на диск немедленно.
    saveProfileNow(p);
    return true;
  }

  return {
    doLearnSkill,
    doDeviceUpgrade,
    doClassTransfer
  };
}

module.exports = { createSkillLearnHandler };
