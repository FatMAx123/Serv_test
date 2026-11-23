'use strict';

/**
 * server/handlers/craft-handler.js
 * ============================================================================
 * Крафт предметов по рецептам (craft) и изучение чертежей (learn).
 * ============================================================================
 */

const crypto = require('crypto');
const G = require('../../shared/game-rules.js');
const NPCS = require('../../shared/npc-services.js');
const SK = require('../../shared/skill-db.js');

function createCraftHandler(ctx) {
  const {
    send,
    checkRate,
    tableGet,
    wouldExceedWeight,
    bagPlus,
    pruneInv,
    questCollectChanged,
    saveProfileNow,
    pushWeight,
    playerStunned = () => false
  } = ctx;

  /**
   * Спойл и крафт — только ремесленная линия (Мастеровой). Уровень чертежа (1–4) не выше
   * уровня ремесла: «Ремесло» 1–3, D-снаряжение (4) — «Книга рецептов Гильдии» Котлового Кузнеца.
   */
  function recipeAccess(p, rid, failType) {
    const acc = G.canUseRecipe(p.cls, SK.craftLevel(p.skills), rid);
    if (acc.ok) return true;
    if (acc.reason === 'class') {
      send(p, { t: failType, reason: 'class', id: rid });
      send(p, { t: 'msg', text: 'Сборкой по чертежам занимаются только Мастеровые.' });
    } else if (acc.reason === 'craft_level') {
      send(p, { t: failType, reason: 'craft_level', id: rid, need: acc.need, have: acc.have });
      send(p, {
        t: 'msg',
        text: acc.need >= 4
          ? 'D-снаряжение собирает только Котловой Кузнец (книга рецептов Гильдии).'
          : 'Чертёж ' + acc.need + '-го уровня: нужно «Ремесло» не ниже ' + acc.need + '-го ранга.'
      });
    }
    return false;
  }

  function doCraft(p, msg) {
    if (p.dead || p.hp <= 0) return;
    if (playerStunned(p)) { send(p, { t: 'craft_fail', reason: 'stunned' }); return; }
    if (p.trade || p.store) { send(p, { t: 'craft_fail', reason: 'busy' }); return; }
    if (!checkRate(p, 'action')) return;
    const rid = String((msg && msg.id) || '');
    const rec = tableGet(G.RECIPES, rid);
    if (!rec || !Array.isArray(rec.mats)) return;
    if (!recipeAccess(p, rid, 'craft_fail')) return;
    if (!p.learned.has(rid)) { send(p, { t: 'msg', text: 'Чертеж не изучен.' }); return; }
    for (const m of rec.mats) {
      if ((p.inv[m.id] || 0) < m.n) { send(p, { t: 'msg', text: 'Недостаточно материалов.' }); return; }
    }
    const simInv = Object.assign({}, p.inv);
    for (const m of rec.mats) {
      simInv[m.id] = (simInv[m.id] || 0) - m.n;
      if (simInv[m.id] <= 0) delete simInv[m.id];
    }
    const cfit = NPCS.canFit(simInv, rec.result.id, rec.result.n, p.invSlots);
    if (!cfit.ok) { send(p, { t: 'msg', text: 'Нет места в сумке.' }); return; }
    const minus = {};
    for (const mat of rec.mats) minus[mat.id] = (minus[mat.id] | 0) + mat.n;
    const wCraft = wouldExceedWeight(p, minus, { [rec.result.id]: rec.result.n });
    if (!wCraft.ok) { send(p, { t: 'msg', text: 'Слишком тяжело.' }); return; }
    const bagPlusCraft = bagPlus(p, rec.result.id) > 0 && (p.inv[rec.result.id] | 0) > 0;
    if (bagPlusCraft) {
      send(p, { t: 'craft_fail', reason: 'enchanted', id: rid });
      send(p, { t: 'msg', text: 'У вас в сумке уже есть модифицированный предмет этого типа.' });
      return;
    }
    for (const m of rec.mats) p.inv[m.id] -= m.n;
    pruneInv(p);
    const rollVal = crypto.randomInt(0, 100000000) / 100000000;
    if (rollVal < rec.chance) {
      p.inv[rec.result.id] = (p.inv[rec.result.id] || 0) + rec.result.n;
      send(p, { t: 'craft_ok', id: rid, got: rec.result.id, n: rec.result.n, inv: p.inv, equip: p.equip });
      questCollectChanged(p, rec.result.id);
    } else {
      send(p, { t: 'craft_fail', id: rid, inv: p.inv, equip: p.equip });
    }
    saveProfileNow(p);
    pushWeight(p);
  }

  function doLearnRecipe(p, msg) {
    if (p.dead || p.hp <= 0) return;
    if (playerStunned(p)) { send(p, { t: 'msg', text: 'Вы оглушены!' }); return; }
    if (p.trade || p.store) { send(p, { t: 'msg', text: 'Заняты обменом или торговлей.' }); return; }
    if (!checkRate(p, 'action')) return;
    const rid = String((msg && msg.id) || '');
    if (!tableGet(G.RECIPES, rid)) return;
    if (!recipeAccess(p, rid, 'learn_fail')) return;
    const item = 'recipe_' + rid;
    if ((p.inv[item] || 0) < 1) { send(p, { t: 'msg', text: 'Нет чертежа в инвентаре.' }); return; }
    if (p.learned.has(rid)) { send(p, { t: 'msg', text: 'Уже изучено.' }); return; }
    p.inv[item] -= 1;
    p.learned.add(rid);
    if (p.inv[item] <= 0) delete p.inv[item];
    send(p, { t: 'learned', id: rid, learned: [...p.learned], inv: p.inv, equip: p.equip });
    saveProfileNow(p);
    pushWeight(p);
  }

  return {
    doCraft,
    doLearnRecipe
  };
}

module.exports = {
  createCraftHandler
};

