// SERVER / HANDLERS / WAREHOUSE-HANDLER.JS
// Персональный склад игрока (L2 Classic personal warehouse)
'use strict';
const NPCS = require('../../shared/npc-services.js');
const {
  equippedCount,
  equippedPlus,
  plusMoveOk,
  plusMove
} = require('./item-plus-utils.js');

const isWarehouseNpc = (npc) => npc && npc.type === 'warehouse';

module.exports = function createWarehouseHandler(ctx) {
  const {
    send,
    isBadKey,
    invCount,
    currencyOf,
    takeCurrency,
    pruneInv,
    pruneCounts,
    canCarryMore,
    pushWeight,
    saveProfileNow,
    npcForService,
    playerStunned = () => false
  } = ctx;

  /** Общая часть ответов склада: обе карты, занятость, плата, валюта, сумка. */
  function whPayload(p, npc, extra) {
    const base = {
      npcId: npc.id,
      wh: p.wh,
      whPlus: p.whPlusById,
      invPlus: p.plusById,
      slots: NPCS.invSlotsUsed(p.wh),
      cap: NPCS.MAX_WH_SLOTS,
      fee: NPCS.WH_FEE_PER_STACK,
      currency: currencyOf(p),
      inv: p.inv,
      equip: p.equip || {}
    };
    return Object.assign(base, extra || {});
  }

  /**
   * Можно ли переносить с учётом заточки в сторону dir.
   * @param dir 'put' — сумка → склад, 'take' — склад → сумка
   */
  function whPlusMoveOk(p, itemId, count, dir) {
    const put = (dir === 'put');
    // H10: надетые экземпляры — отдельная ёмкость со своим plus и в перенос
    // сумка ↔ склад не вмешиваются.
    const ok = plusMoveOk(
      put ? p.inv : p.wh, put ? p.plusById : p.whPlusById,
      put ? p.wh : p.inv, put ? p.whPlusById : p.plusById,
      itemId, count, {}
    );
    return ok ? { ok: true, reason: '' } : { ok: false, reason: 'enchanted' };
  }

  /** Перенести реестр заточки вслед за предметом (звать после переноса счётчиков). */
  function whPlusMove(p, itemId, dir) {
    const put = (dir === 'put');
    plusMove(put ? p.plusById : p.whPlusById, put ? p.whPlusById : p.plusById, itemId);
  }

  function doWarehouseOpen(p, npcId) {
    const npc = npcForService(p, npcId, 'wh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) {
      send(p, { t: 'wh_fail', reason: 'dead', npcId: npc.id });
      return;
    }
    if (playerStunned(p)) {
      send(p, { t: 'wh_fail', reason: 'stunned', npcId: npc.id });
      return;
    }
    if (p.trade || p.store) {
      send(p, { t: 'wh_fail', reason: 'busy', npcId: npc.id });
      return;
    }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'wh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    send(p, whPayload(p, npc, { t: 'wh_open', npcName: npc.name }));
  }

  function doWarehousePut(p, msg) {
    const npc = npcForService(p, msg.npcId, 'wh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) {
      send(p, { t: 'wh_fail', reason: 'dead', npcId: npc.id });
      return;
    }
    if (playerStunned(p)) {
      send(p, { t: 'wh_fail', reason: 'stunned', npcId: npc.id });
      return;
    }
    if (p.trade || p.store) {
      send(p, { t: 'wh_fail', reason: 'busy', npcId: npc.id });
      return;
    }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'wh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) {
      send(p, { t: 'wh_fail', reason: 'args', npcId: npc.id });
      return;
    }
    const storable = NPCS.whStorable(itemId);
    if (!storable.ok) {
      send(p, { t: 'wh_fail', reason: storable.reason, npcId: npc.id, itemId });
      return;
    }
    const have = invCount(p, itemId);
    if (have < 1) {
      send(p, { t: 'wh_fail', reason: 'none', npcId: npc.id, itemId });
      return;
    }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > have) count = have;
    const plusOk = whPlusMoveOk(p, itemId, count, 'put');
    if (!plusOk.ok) {
      send(p, { t: 'wh_fail', reason: plusOk.reason, npcId: npc.id, itemId });
      return;
    }
    const fit = NPCS.whCanFit(p.wh, itemId, count);
    if (!fit.ok) {
      send(p, { t: 'wh_fail', reason: 'wh_full', npcId: npc.id, itemId, need: fit.need, free: fit.free });
      return;
    }
    const fee = NPCS.whDepositFee(itemId, count);
    const isCur = NPCS.isCurrency ? NPCS.isCurrency(itemId) : itemId === 'copper_parts';
    if (isCur) {
      // Плата берётся из той же меди: вклад урезается до have − fee
      const dep = NPCS.whCurrencyDeposit(have, count, fee);
      if (!dep.ok) {
        send(p, { t: 'wh_fail', reason: 'funds', npcId: npc.id, itemId, need: fee + 1, have });
        return;
      }
      count = dep.count;
      const whCur = Math.max(0, Math.floor(Number(p.wh[itemId]))) || 0;
      if (whCur + count > 2147483647) {
        send(p, { t: 'wh_fail', reason: 'currency_cap', npcId: npc.id, itemId });
        return;
      }
    } else if (currencyOf(p) < fee) {
      send(p, { t: 'wh_fail', reason: 'funds', npcId: npc.id, itemId, need: fee, have: currencyOf(p) });
      return;
    }
    takeCurrency(p, fee);
    // Остаток считаем ПОСЛЕ платы: раньше при вкладе меди have брался до списания,
    // и плата фактически не взималась.
    p.inv[itemId] = invCount(p, itemId) - count;
    p.wh[itemId] = (Math.max(0, Math.floor(Number(p.wh[itemId]))) || 0) + count;
    pruneInv(p);
    pruneCounts(p.wh);
    whPlusMove(p, itemId, 'put');
    saveProfileNow(p);
    send(p, whPayload(p, npc, { t: 'wh_ok', op: 'put', itemId, count, fee }));
    if (typeof pushWeight === 'function') pushWeight(p);
  }

  function doWarehouseTake(p, msg) {
    const npc = npcForService(p, msg.npcId, 'wh_fail', isWarehouseNpc);
    if (!npc) return;
    if (p.dead) {
      send(p, { t: 'wh_fail', reason: 'dead', npcId: npc.id });
      return;
    }
    if (playerStunned(p)) {
      send(p, { t: 'wh_fail', reason: 'stunned', npcId: npc.id });
      return;
    }
    if (p.trade || p.store) {
      send(p, { t: 'wh_fail', reason: 'busy', npcId: npc.id });
      return;
    }
    if (p.isFlagged || (p._lastCombatAt && Date.now() - p._lastCombatAt < 5000)) {
      send(p, { t: 'wh_fail', reason: 'combat', npcId: npc.id });
      send(p, { t: 'msg', text: 'Нельзя пользоваться складом во время боя или PvP-флага!' });
      return;
    }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) {
      send(p, { t: 'wh_fail', reason: 'args', npcId: npc.id });
      return;
    }
    const have = Object.prototype.hasOwnProperty.call(p.wh, itemId) ? (Math.max(0, Math.floor(Number(p.wh[itemId]))) || 0) : 0;
    if (have < 1) {
      send(p, { t: 'wh_fail', reason: 'none', npcId: npc.id, itemId });
      return;
    }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > have) count = have;
    const plusOk = whPlusMoveOk(p, itemId, count, 'take');
    if (!plusOk.ok) {
      send(p, { t: 'wh_fail', reason: plusOk.reason, npcId: npc.id, itemId });
      return;
    }
    const fit = NPCS.canFit(p.inv, itemId, count, p.invSlots);
    if (!fit.ok) {
      send(p, { t: 'wh_fail', reason: 'inv_full', npcId: npc.id, itemId, need: fit.need, free: fit.free });
      return;
    }
    const carry = canCarryMore(p, itemId, count);
    if (!carry.ok) {
      send(p, { t: 'wh_fail', reason: 'weight', npcId: npc.id, itemId, weight: carry.load, maxWeight: carry.max });
      return;
    }
    const MAX_CURRENCY_CAP = 2147483647;
    const targetCount = invCount(p, itemId) + count;
    // Валюта сверх потолка раньше молча сгорала — теперь операция отклоняется целиком.
    if ((itemId === 'copper_parts' || itemId === 'adena') && targetCount > MAX_CURRENCY_CAP) {
      send(p, { t: 'wh_fail', reason: 'currency_cap', npcId: npc.id, itemId });
      return;
    }
    p.wh[itemId] = have - count;
    p.inv[itemId] = targetCount;
    pruneCounts(p.wh);
    pruneInv(p);
    whPlusMove(p, itemId, 'take');
    saveProfileNow(p);
    send(p, whPayload(p, npc, { t: 'wh_ok', op: 'take', itemId, count, fee: 0 }));
    pushWeight(p);
  }

  return {
    isWarehouseNpc,
    whPayload,
    whPlusMoveOk,
    whPlusMove,
    doWarehouseOpen,
    doWarehousePut,
    doWarehouseTake
  };
};
