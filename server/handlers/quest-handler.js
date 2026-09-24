// SERVER / HANDLERS / QUEST-HANDLER.JS — Серверный авторитет квестов (1–20).
// Перенесён из server.js при декомпозиции монолита (Риск 1).
'use strict';

function createQuestHandler(deps) {
  const {
    QD,
    NPCS,
    EXP,
    send,
    invCount,
    giveCurrency,
    grantExpSp,
    applyPlayerBuff,
    pushEffects,
    pushCombatStats,
    saveProfileNow,
    pruneInv,
    pushWeight
  } = deps;

  /** Снапшот квестов игроку (после любого изменения). */
  function pushQuests(p, extra) {
    const snap = QD.snapshot(p.quests, p.level, Date.now(), p.cls);
    send(p, Object.assign({ t: 'quests', quests: snap }, extra || {}));
  }

  /** Пересчитать прогресс collect-целей активных квестов по инвентарю. */
  function syncQuestCollect(p) {
    let changed = false;
    for (const qid of Object.keys(p.quests.active)) {
      const q = QD.get(qid);
      if (!q) continue;
      const a = p.quests.active[qid];
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (o.type !== 'collect') continue;
        const have = Math.min(o.count, invCount(p, o.target));
        if (a.p[i] !== have) { a.p[i] = have; changed = true; }
      }
    }
    return changed;
  }

  /**
   * Уведомить игрока, если подобранный предмет продвинул collect-цель.
   * Зовётся из подбора лута и крафта — там инвентарь меняется вне квестов.
   */
  function questCollectChanged(p, itemId) {
    if (!p || !p.quests) return false;
    // Быстрый выход: предмет вообще не нужен ни одной цели.
    let relevant = false;
    for (const qid of Object.keys(p.quests.active)) {
      const q = QD.get(qid);
      if (!q) continue;
      if (q.objectives.some(o => o.type === 'collect' && o.target === itemId)) { relevant = true; break; }
    }
    if (!relevant) return false;
    if (!syncQuestCollect(p)) return false;
    pushQuests(p);
    for (const qid of Object.keys(p.quests.active)) {
      const q = QD.get(qid);
      if (!q) continue;
      const a = p.quests.active[qid];
      q.objectives.forEach((o, i) => {
        if (o.type !== 'collect' || o.target !== itemId) return;
        const done = a.p[i] >= o.count;
        send(p, {
          t: 'msg',
          text: 'Задание «' + q.name + '»: ' + a.p[i] + '/' + o.count + (done ? ' — собрано!' : '')
        });
      });
    }
    return true;
  }

  function doQuestList(p) {
    syncQuestCollect(p);
    pushQuests(p);
  }

  /** Принять квест. Требует разговора с NPC-выдающим (кроме мировых). */
  function doQuestAccept(p, msg) {
    const q = QD.get(msg.questId);
    const fail = (reason, extra) => send(p, Object.assign({ t: 'quest_fail', reason, questId: msg.questId || null }, extra || {}));
    if (!q) return fail('unknown');
    // NPC-выдающий должен быть рядом: иначе квесты берутся из любого места карты.
    if (q.npc) {
      const npc = NPCS.getNpc(q.npc);
      if (!npc) return fail('unknown_npc', { npcId: q.npc });
      if (!NPCS.inRange(npc, p.x, p.z)) {
        return fail('range', { npcId: npc.id, npcX: npc.position.x, npcZ: npc.position.z });
      }
    }
    const chk = QD.canAccept(p.quests, q, p.level, Date.now(), p.cls);
    if (!chk.ok) return fail(chk.reason, { need: chk.need });
    p.quests.active[q.id] = { p: q.objectives.map(() => 0), at: Date.now() };
    syncQuestCollect(p);
    saveProfileNow(p);
    pushQuests(p, { accepted: q.id });
    send(p, { t: 'msg', text: 'Задание принято: ' + q.name });
  }

  /** Отказаться от квеста (прогресс теряется). */
  function doQuestAbandon(p, msg) {
    const q = QD.get(msg.questId);
    if (!q || !p.quests.active[q.id]) {
      send(p, { t: 'quest_fail', reason: 'not_active', questId: msg.questId || null });
      return;
    }
    delete p.quests.active[q.id];
    saveProfileNow(p);
    pushQuests(p, { abandoned: q.id });
    send(p, { t: 'msg', text: 'Задание отменено: ' + q.name });
  }

  /**
   * Сдать квест. Проверяет цели, списывает collect-предметы, выдаёт награды.
   * Всё в одной функции без await — инвентарь не должен меняться между проверкой
   * и списанием.
   */
  function doQuestComplete(p, msg) {
    const q = QD.get(msg.questId);
    const fail = (reason, extra) => send(p, Object.assign({ t: 'quest_fail', reason, questId: msg.questId || null }, extra || {}));
    if (!q) return fail('unknown');
    const a = p.quests.active[q.id];
    if (!a) return fail('not_active');
    if (q.npc) {
      const npc = NPCS.getNpc(q.npc);
      if (!npc) return fail('unknown_npc', { npcId: q.npc });
      if (!NPCS.inRange(npc, p.x, p.z)) {
        return fail('range', { npcId: npc.id, npcX: npc.position.x, npcZ: npc.position.z });
      }
    }
    syncQuestCollect(p);
    if (!QD.isComplete(q, a.p)) {
      return fail('incomplete', { progress: a.p.slice() });
    }
    // Место под награды: если сумка полна, квест не сдаём (иначе предметы
    // пропадут молча).
    const rewards = q.rewards || {};
    let items = Array.isArray(rewards.items) ? rewards.items.slice() : [];
    if (rewards.choices && Array.isArray(rewards.choices) && rewards.choices.length > 0) {
      let chosen = null;
      if (typeof msg.rewardChoice === 'number') {
        chosen = rewards.choices[msg.rewardChoice];
      } else if (typeof msg.rewardChoice === 'string') {
        chosen = rewards.choices.find(c => c.id === msg.rewardChoice) ||
                 rewards.choices[parseInt(msg.rewardChoice, 10)];
      }
      if (!chosen) {
        if (msg.rewardChoice === undefined || msg.rewardChoice === null) {
          chosen = rewards.choices[0];
        } else {
          return fail('invalid_reward_choice');
        }
      }
      if (chosen && Array.isArray(chosen.items)) {
        items = items.concat(chosen.items);
      }
    }
    // Считаем на копии инвентаря: сначала минус collect, потом плюс награды.
    const projected = Object.assign(Object.create(null), p.inv);
    for (const o of q.objectives) {
      if (o.type !== 'collect') continue;
      projected[o.target] = Math.max(0, (projected[o.target] | 0) - o.count);
      if (projected[o.target] === 0) delete projected[o.target];
    }
    for (const it of items) {
      const fit = NPCS.canFit(projected, it.id, it.count);
      if (!fit.ok) return fail('inv_full', { itemId: it.id, need: fit.need, free: fit.free });
      projected[it.id] = (projected[it.id] | 0) + it.count;
    }
    // Списать квестовые предметы (L2: уходят NPC)
    for (const o of q.objectives) {
      if (o.type !== 'collect') continue;
      p.inv[o.target] = Math.max(0, invCount(p, o.target) - o.count);
      if (p.inv[o.target] <= 0) delete p.inv[o.target];
    }
    // Награды
    const granted = [];
    for (const it of items) {
      p.inv[it.id] = invCount(p, it.id) + it.count;
      granted.push({ id: it.id, count: it.count });
    }
    if (rewards.currency > 0) giveCurrency(p, rewards.currency);
    pruneInv(p);
    let gained = { exp: 0, sp: 0 };
    if (rewards.exp > 0) gained = grantExpSp(p, rewards.exp, p.level);
    if (rewards.sp > 0) p.sp = (p.sp || 0) + (rewards.sp | 0);
    // Бафф-награда: те же правила, что у NPC-баффов
    if (rewards.buff && rewards.buff.id) {
      const dur = Math.max(1, rewards.buff.duration | 0);
      const bid = 'quest_' + rewards.buff.id;
      applyPlayerBuff(p, { id: bid, until: Date.now() + dur * 1000, expMult: 1.15, priority: 8 });
      pushEffects(p);
    }
    // Закрыть квест
    const doneEntry = p.quests.done[q.id];
    p.quests.done[q.id] = { n: (doneEntry ? doneEntry.n : 0) + 1, at: Date.now() };
    delete p.quests.active[q.id];
    syncQuestCollect(p);
    pushCombatStats(p);
    saveProfileNow(p);
    send(p, {
      t: 'quest_complete_ok',
      questId: q.id, name: q.name,
      exp: gained.exp, sp: gained.sp + (rewards.sp | 0),
      currency: rewards.currency || 0,
      items: granted,
      classChange: !!rewards.classChange,
      nextQuest: q.nextQuest || null,
      level: p.level, selfExp: p.exp, expToNext: EXP.expToNext(p.level),
      inv: p.inv, equip: p.equip || {}
    });
    if (typeof pushWeight === 'function') pushWeight(p);
    pushQuests(p, { completed: q.id });
  }

  /** Прогресс talk-целей при разговоре с NPC. */
  function doQuestTalk(p, npcId) {
    const npc = NPCS.getNpc(npcId);
    if (!npc) {
      send(p, { t: 'quest_fail', reason: 'unknown_npc', npcId: String(npcId || '') });
      return;
    }
    if (!NPCS.inRange(npc, p.x, p.z)) {
      send(p, { t: 'quest_fail', reason: 'range', npcId: npc.id });
      return;
    }
    let changed = false;
    const advanced = [];
    for (const qid of Object.keys(p.quests.active)) {
      const q = QD.get(qid);
      if (!q) continue;
      const a = p.quests.active[qid];
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (o.type !== 'talk' || o.target !== npc.id) continue;
        if (a.p[i] >= o.count) continue;
        a.p[i] = Math.min(o.count, a.p[i] + 1);
        changed = true;
        advanced.push({ questId: qid, index: i, progress: a.p[i], count: o.count, name: q.name });
      }
    }
    if (changed) {
      saveProfileNow(p);
      pushQuests(p, { talk: npc.id, advanced });
      advanced.forEach((adv) => {
        send(p, { t: 'msg', text: 'Задание «' + adv.name + '»: разговор ' + adv.progress + '/' + adv.count });
      });
    }
  }

  /**
   * Прогресс kill. Зовётся из onMobDeath для убийцы и всей пати рядом
   * (L2: цель считается всем, кто в радиусе EXP).
   */
  function questOnKill(p, mobId) {
    if (!p || !p.quests) return false;
    let changed = false;
    const advanced = [];
    for (const qid of Object.keys(p.quests.active)) {
      const q = QD.get(qid);
      if (!q) continue;
      const a = p.quests.active[qid];
      for (let i = 0; i < q.objectives.length; i++) {
        const o = q.objectives[i];
        if (o.type !== 'kill' || o.target !== mobId) continue;
        if (a.p[i] >= o.count) continue;
        a.p[i] = Math.min(o.count, a.p[i] + 1);
        changed = true;
        advanced.push({ questId: qid, name: q.name, progress: a.p[i], count: o.count });
      }
    }
    if (!changed) return false;
    pushQuests(p, { advanced });
    advanced.forEach((adv) => {
      const done = adv.progress >= adv.count;
      send(p, {
        t: 'msg',
        text: 'Задание «' + adv.name + '»: ' + adv.progress + '/' + adv.count + (done ? ' — выполнено!' : '')
      });
    });
    return true;
  }

  return {
    pushQuests,
    syncQuestCollect,
    questCollectChanged,
    doQuestList,
    doQuestAccept,
    doQuestAbandon,
    doQuestComplete,
    doQuestTalk,
    questOnKill
  };
}

module.exports = { createQuestHandler };
