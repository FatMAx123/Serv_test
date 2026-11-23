'use strict';

/**
 * server/handlers/craft-handler.js
 * ============================================================================
 * Крафт по чертежам. Три пути, одна попытка сборки (craftAttempt):
 *  - craft        — Мастеровой собирает себе где угодно (изученный чертёж, свой шанс);
 *  - store_craft  — Мастерская: Мастеровой собирает для покупателя из его материалов за плату;
 *  - forge_craft  — Паровой Горн (NPC-крафтер у Кузнеца Крана) для всех классов, когда нет
 *                   Мастеровых: чертёж-предмет сгорает, шанс ≤50%, плата не ниже порога и на 50%
 *                   выше средней платы живых Мастерских (shared/game-rules.js forgeFee).
 * Плюс learn — изучение чертежа Мастеровым.
 * ============================================================================
 */

const crypto = require('crypto');
const G = require('../../shared/game-rules.js');
const NPCS = require('../../shared/npc-services.js');
const SK = require('../../shared/skill-db.js');
const TR = require('../../shared/trade-rules.js');

const MAX_CURRENCY_CAP = 2147483647;

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
    playerStunned = () => false,
    // Горн и Мастерская
    players = new Map(),
    npcForService = null,
    currencyOf = (p) => (p.inv && (p.inv.copper_parts | 0)) || 0,
    takeCurrency = (p, n) => { if (currencyOf(p) < n) return false; p.inv.copper_parts = currencyOf(p) - n; return true; },
    giveCurrency = (p, n) => { p.inv.copper_parts = currencyOf(p) + n; },
    saveTransferAtomic = null,
    storePayload = null,
    Mod = ctx.Mod || require('../moderation.js')
  } = ctx;

  const priceOf = (id) => { const m = NPCS.itemMeta(id); return (m && +m.price) || 0; };

  /**
   * Спойл и крафт — только ремесленная линия (Мастеровой). Уровень чертежа (1–4) не выше
   * уровня ремесла: «Ремесло» 1–3, D-снаряжение (4) — «Книга рецептов Гильдии» Котлового Кузнеца.
   * notify — кому слать отказ (у Мастерской это покупатель).
   */
  function recipeAccess(p, rid, failType, notify) {
    const to = notify || p;
    const acc = G.canUseRecipe(p.cls, SK.craftLevel(p.skills), rid);
    if (acc.ok) return true;
    if (acc.reason === 'class') {
      send(to, { t: failType, reason: 'class', id: rid });
      send(to, { t: 'msg', text: 'Сборкой по чертежам занимаются только Мастеровые.' });
    } else if (acc.reason === 'craft_level') {
      send(to, { t: failType, reason: 'craft_level', id: rid, need: acc.need, have: acc.have });
      send(to, {
        t: 'msg',
        text: acc.need >= 4
          ? 'D-снаряжение собирает только Котловой Кузнец (книга рецептов Гильдии).'
          : 'Чертёж ' + acc.need + '-го уровня: нужно «Ремесло» не ниже ' + acc.need + '-го ранга.'
      });
    }
    return false;
  }

  /**
   * Проверка до любых списаний: материалы, место, вес, заточенный дубль.
   * extraMinus — что ещё уйдёт из сумки покупателя (чертёж Горна, плата медью).
   * @returns {object|null} карта списаний или null (отказ уже отправлен)
   */
  function checkCraftable(buyer, rid, rec, extraMinus, failType) {
    const fail = (reason, text) => {
      send(buyer, { t: failType, reason, id: rid });
      if (text) send(buyer, { t: 'msg', text });
      return null;
    };
    const minus = Object.assign({}, extraMinus || {});
    for (const m of rec.mats) minus[m.id] = (minus[m.id] | 0) + m.n;
    for (const id of Object.keys(minus)) {
      if ((buyer.inv[id] | 0) < minus[id]) {
        return fail(id === 'recipe_' + rid ? 'no_recipe' : (id === 'copper_parts' ? 'funds' : 'mats'),
          id === 'recipe_' + rid ? 'Нужен чертёж в сумке.'
            : (id === 'copper_parts' ? 'Недостаточно медных деталей.' : 'Недостаточно материалов.'));
      }
    }
    const simInv = Object.assign({}, buyer.inv);
    for (const id of Object.keys(minus)) {
      simInv[id] = (simInv[id] | 0) - minus[id];
      if (simInv[id] <= 0) delete simInv[id];
    }
    const cfit = NPCS.canFit(simInv, rec.result.id, rec.result.n, buyer.invSlots);
    if (!cfit.ok) return fail('inv_full', 'Нет места в сумке.');
    const w = wouldExceedWeight(buyer, minus, { [rec.result.id]: rec.result.n });
    if (w && !w.ok) return fail('weight', 'Слишком тяжело.');
    if (bagPlus(buyer, rec.result.id) > 0 && (buyer.inv[rec.result.id] | 0) > 0) {
      return fail('enchanted', 'У вас в сумке уже есть модифицированный предмет этого типа.');
    }
    return minus;
  }

  /** Списать materials (карта minus без валюты), бросить шанс, выдать результат. */
  function craftAttempt(buyer, rec, minus, chance) {
    for (const id of Object.keys(minus)) {
      if (id === 'copper_parts') continue;
      buyer.inv[id] = (buyer.inv[id] | 0) - minus[id];
    }
    pruneInv(buyer);
    const rollVal = crypto.randomInt(0, 100000000) / 100000000;
    const ok = rollVal < chance;
    if (ok) {
      buyer.inv[rec.result.id] = (buyer.inv[rec.result.id] || 0) + rec.result.n;
      questCollectChanged(buyer, rec.result.id);
    }
    return ok;
  }

  function busyCheck(p, failType) {
    if (p.dead || p.hp <= 0) return false;
    if (playerStunned(p)) { send(p, { t: failType, reason: 'stunned' }); return false; }
    if (p.trade || p.store) { send(p, { t: failType, reason: 'busy' }); return false; }
    return true;
  }

  function doCraft(p, msg) {
    if (!busyCheck(p, 'craft_fail')) return;
    if (!checkRate(p, 'action')) return;
    const rid = String((msg && msg.id) || '');
    const rec = tableGet(G.RECIPES, rid);
    if (!rec || !Array.isArray(rec.mats)) return;
    if (!recipeAccess(p, rid, 'craft_fail')) return;
    if (!p.learned.has(rid)) { send(p, { t: 'msg', text: 'Чертеж не изучен.' }); return; }
    const minus = checkCraftable(p, rid, rec, null, 'craft_fail');
    if (!minus) return;
    if (craftAttempt(p, rec, minus, rec.chance)) {
      send(p, { t: 'craft_ok', id: rid, got: rec.result.id, n: rec.result.n, inv: p.inv, equip: p.equip });
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

  // ─── Паровой Горн ────────────────────────────────────────────────────────────

  /** Платы открытых сейчас Мастерских (живых Мастеровых) за рецепт. */
  function workshopFees(rid) {
    const fees = [];
    for (const o of players.values()) {
      const s = o && o.store;
      if (!s || s.mode !== 'craft' || !s.items) continue;
      if (!Object.prototype.hasOwnProperty.call(s.items, rid)) continue;
      const f = Math.floor(+s.items[rid].price);
      if (f > 0) fees.push(f);
    }
    return fees;
  }

  function forgeQuote(rid) {
    const fees = workshopFees(rid);
    return {
      recipeId: rid,
      fee: G.forgeFee(rid, priceOf, fees),
      minFee: G.forgeMinFee(rid, priceOf),
      chance: G.forgeChance(rid),
      workshops: fees.length
    };
  }

  function forgeNpc(p, msg, failType) {
    if (typeof npcForService !== 'function') return null;
    return npcForService(p, msg && msg.npcId, failType, (n) => !!(n && n.forge));
  }

  /** Прейскурант Горна: плата зависит от живых Мастерских, поэтому её считает сервер. */
  function doForgeList(p, msg) {
    if (!checkRate(p, 'npc')) return;
    const npc = forgeNpc(p, msg, 'forge_fail');
    if (!npc) return;
    const list = Object.keys(G.RECIPES).map(forgeQuote);
    send(p, { t: 'forge_list', npcId: npc.id, recipes: list });
  }

  function doForgeCraft(p, msg) {
    if (!busyCheck(p, 'craft_fail')) return;
    if (!checkRate(p, 'action')) return;
    const npc = forgeNpc(p, msg, 'craft_fail');
    if (!npc) return;
    const rid = String((msg && msg.id) || '');
    const rec = tableGet(G.RECIPES, rid);
    if (!rec || !Array.isArray(rec.mats)) return;
    const q = forgeQuote(rid);
    const exp = Math.floor(Number(msg && msg.expectedFee));
    if (!Number.isFinite(exp) || exp !== q.fee) {
      send(p, { t: 'craft_fail', reason: 'price_changed', via: 'forge', id: rid, fee: q.fee });
      send(p, { t: 'forge_list', npcId: npc.id, recipes: [q] });
      send(p, { t: 'msg', text: 'Цена Горна изменилась — проверьте новую плату.' });
      return;
    }
    const minus = checkCraftable(p, rid, rec, { ['recipe_' + rid]: 1, copper_parts: q.fee }, 'craft_fail');
    if (!minus) return;
    if (!takeCurrency(p, q.fee)) { send(p, { t: 'craft_fail', reason: 'funds', id: rid }); return; }
    const ok = craftAttempt(p, rec, minus, q.chance);
    const base = { id: rid, via: 'forge', fee: q.fee, inv: p.inv, equip: p.equip };
    if (ok) send(p, Object.assign({ t: 'craft_ok', got: rec.result.id, n: rec.result.n }, base));
    else send(p, Object.assign({ t: 'craft_fail' }, base));
    saveProfileNow(p);
    pushWeight(p);
  }

  // ─── Мастерская (лавка-заказ Мастерового) ────────────────────────────────────

  function doManufacture(p, msg) {
    const fail = (reason, extra) => send(p, Object.assign({ t: 'store_fail', reason }, extra || {}));
    if (!checkRate(p, 'npc')) return;
    const owner = players.get((msg && msg.pid) | 0);
    if (!owner || owner.pid === p.pid) { fail('no_store'); return; }
    const s = owner.store;
    if (!s || s.mode !== 'craft') { fail(s ? 'wrong_mode' : 'no_store'); return; }
    if (p.dead || owner.dead) { fail('dead'); return; }
    if (p.trade || p.store) { fail('busy'); return; }
    if (playerStunned(p)) { fail('stunned'); return; }
    if (!TR.inStoreRange(p.x, p.z, owner.x, owner.z)) { fail('range', { pid: owner.pid }); return; }
    const rid = String((msg && msg.recipeId) || '');
    const pos = Object.prototype.hasOwnProperty.call(s.items, rid) ? s.items[rid] : null;
    const rec = pos ? tableGet(G.RECIPES, rid) : null;
    if (!pos || !rec) { fail('sold_out', { recipeId: rid }); return; }
    const exp = Math.floor(Number(msg.expectedPrice != null ? msg.expectedPrice : msg.price));
    if (!Number.isFinite(exp) || exp !== pos.price) {
      fail('price_changed', { expected: exp, current: pos.price });
      send(p, { t: 'msg', text: 'Плата Мастерской изменилась! Заказ отменён.' });
      return;
    }
    // Хозяин мог потерять доступ (не должен, но сервер — авторитет)
    if (!owner.learned || !owner.learned.has(rid) || !recipeAccess(owner, rid, 'store_fail', p)) {
      fail('sold_out', { recipeId: rid });
      return;
    }
    if (currencyOf(owner) + pos.price > MAX_CURRENCY_CAP) { fail('currency_cap'); return; }
    const minus = checkCraftable(p, rid, rec, { copper_parts: pos.price }, 'store_fail');
    if (!minus) return;
    if (!takeCurrency(p, pos.price)) { fail('funds', { need: pos.price }); return; }
    giveCurrency(owner, pos.price);
    const ok = craftAttempt(p, rec, minus, rec.chance);
    pruneInv(owner);
    // Покупатель и Мастеровой — одной операцией (атомарный перенос)
    if (typeof saveTransferAtomic === 'function') saveTransferAtomic([p, owner]);
    else { saveProfileNow(p); saveProfileNow(owner); }
    pushWeight(p);
    pushWeight(owner);
    const resName = (NPCS.itemMeta(rec.result.id) || {}).name || rec.result.id;
    send(p, {
      t: 'store_deal', dir: 'craft', ok, recipeId: rid, itemId: rec.result.id, count: ok ? rec.result.n : 0,
      total: pos.price, name: resName, peerName: owner.name, inv: p.inv, equip: p.equip || {}, currency: currencyOf(p)
    });
    send(owner, {
      t: 'store_deal', dir: 'crafted', ok, recipeId: rid, itemId: rec.result.id, count: ok ? rec.result.n : 0,
      total: pos.price, name: resName, peerName: p.name, inv: owner.inv, equip: owner.equip || {}, currency: currencyOf(owner)
    });
    if (typeof storePayload === 'function') send(p, storePayload(p, owner));
    if (Mod && typeof Mod.log === 'function') {
      Mod.log('store', { seller: owner.name, sellerYid: owner.yid, buyer: p.name, buyerYid: p.yid, recipeId: rid, ok, total: pos.price, dir: 'craft' });
    }
  }

  /** Маршрутизатор пакетов крафта (держит server.js коротким). */
  function handleCraftMessage(p, msg) {
    switch (msg && msg.t) {
      case 'craft': return doCraft(p, msg);
      case 'learn': return doLearnRecipe(p, msg);
      case 'forge_list': return doForgeList(p, msg);
      case 'forge_craft': return doForgeCraft(p, msg);
      case 'store_craft': return doManufacture(p, msg);
      default: return undefined;
    }
  }

  return {
    doCraft,
    doLearnRecipe,
    doForgeList,
    doForgeCraft,
    doManufacture,
    forgeQuote,
    handleCraftMessage
  };
}

module.exports = {
  createCraftHandler
};
