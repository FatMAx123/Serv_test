// SERVER / HANDLERS / STORE-HANDLER.JS
// Личная лавка игрока на покупку/продажу (L2 Classic private store)
'use strict';
const TR = require('../../shared/trade-rules.js');
const NPCS = require('../../shared/npc-services.js');
const {
  mapCount,
  playerPlusOpts,
  plusMoveOk,
  plusMove
} = require('./item-plus-utils.js');

module.exports = function createStoreHandler(ctx) {
  const {
    players,
    send,
    broadcastAOI,
    currencyOf,
    takeCurrency,
    giveCurrency,
    invCount,
    isBadKey,
    canCarryMore,
    pruneInv,
    saveProfileNow,
    pushWeight
  } = ctx;

  function storePublic(p) {
    const s = p && p.store;
    if (!s) return null;
    return { mode: s.mode, title: s.title, count: Object.keys(s.items).length };
  }

  function storePayload(p, owner) {
    const s = owner.store;
    const items = Object.keys(s ? s.items : {}).map((id) => ({
      itemId: id,
      count: s.items[id].count,
      price: s.items[id].price,
      name: NPCS.itemMeta(id) ? NPCS.itemMeta(id).name : id
    }));
    return {
      t: 'store_list',
      pid: owner.pid,
      name: owner.name,
      mode: s ? s.mode : 'none',
      title: s ? s.title : '',
      items: items,
      currency: currencyOf(p)
    };
  }

  /** Сообщить AOI, что вывеска лавки появилась или исчезла. */
  function broadcastStoreState(p) {
    broadcastAOI(p, { t: 'store_state', pid: p.pid, store: storePublic(p) });
  }

  function closeStore(p, reason) {
    if (!p || !p.store) return;
    p.store = null;
    send(p, { t: 'store_close', reason: reason || 'cancel' });
    broadcastStoreState(p);
  }

  function doStoreSet(p, msg) {
    if (p.dead) { send(p, { t: 'store_fail', reason: 'dead' }); return; }
    if (p.isFlagged) { send(p, { t: 'store_fail', reason: 'flagged' }); return; }
    if (p.trade || p.duel) { send(p, { t: 'store_fail', reason: 'busy' }); return; }
    const mode = String(msg.mode || '').toLowerCase() === 'buy' ? 'buy' : 'sell';
    const norm = TR.normalizeStoreItems(msg.items || msg.sell || msg.buy);
    const ids = Object.keys(norm.items);
    if (!ids.length) {
      send(p, { t: 'store_fail', reason: 'empty', bad: norm.bad });
      return;
    }
    if (mode === 'sell') {
      for (const id of ids) {
        if (invCount(p, id) < norm.items[id].count) {
          send(p, { t: 'store_fail', reason: 'gone', itemId: id });
          return;
        }
        if (mapCount(p.plusById, id) > 0 && norm.items[id].count < invCount(p, id)) {
          send(p, { t: 'store_fail', reason: 'enchanted', itemId: id });
          return;
        }
      }
    } else if (mode === 'buy') {
      let totalNeeded = 0;
      for (const id of ids) {
        const it = norm.items[id];
        const price = Math.max(0, Math.floor(Number(it.price))) || 0;
        const count = Math.max(0, Math.floor(Number(it.count))) || 0;
        totalNeeded += price * count;
      }
      if (currencyOf(p) < totalNeeded) {
        send(p, { t: 'store_fail', reason: 'funds', need: totalNeeded, have: currencyOf(p) });
        return;
      }
    }
    p.store = {
      mode: mode,
      title: String(msg.title || '').slice(0, 29),
      items: norm.items,
      at: Date.now()
    };
    send(p, { t: 'store_open', mode: mode, title: p.store.title, items: storePayload(p, p).items });
    broadcastStoreState(p);
  }

  function doStoreList(p, msg) {
    const owner = players.get(msg.pid | 0);
    if (!owner || !owner.store) { send(p, { t: 'store_fail', reason: 'no_store' }); return; }
    if (!TR.inStoreRange(p.x, p.z, owner.x, owner.z)) {
      send(p, { t: 'store_fail', reason: 'range', pid: owner.pid });
      return;
    }
    send(p, storePayload(p, owner));
  }

  function doStoreDeal(p, msg, dir) {
    const owner = players.get(msg.pid | 0);
    const fail = (reason, extra) => send(p, Object.assign({ t: 'store_fail', reason: reason }, extra || {}));
    if (!owner || owner.pid === p.pid) { fail('no_store'); return; }
    const s = owner.store;
    if (!s) { fail('no_store'); return; }
    if (s.mode !== (dir === 'buy' ? 'sell' : 'buy')) { fail('wrong_mode'); return; }
    if (p.dead || owner.dead) { fail('dead'); return; }
    if (!TR.inStoreRange(p.x, p.z, owner.x, owner.z)) { fail('range', { pid: owner.pid }); return; }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) { fail('args'); return; }
    const pos = Object.prototype.hasOwnProperty.call(s.items, itemId) ? s.items[itemId] : null;
    if (!pos || pos.count < 1) { fail('sold_out', { itemId }); return; }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > pos.count) count = pos.count;
    const total = pos.price * count;
    if (!Number.isFinite(total) || total < 1) { fail('args'); return; }

    const giver = (dir === 'buy') ? owner : p;
    const taker = (dir === 'buy') ? p : owner;
    if (invCount(giver, itemId) < count) { fail('gone', { itemId }); return; }
    if (currencyOf(taker) < total) {
      fail(taker === p ? 'funds' : 'peer_funds', { need: total });
      return;
    }
    const give = {}; give[itemId] = count;
    if (!TR.canSwap(taker.inv, {}, give).ok) {
      fail(taker === p ? 'inv_full' : 'peer_inv_full');
      return;
    }
    const wStore = canCarryMore(taker, itemId, count);
    if (!wStore.ok) { fail(taker === p ? 'weight' : 'peer_weight'); return; }
    if (!plusMoveOk(giver.inv, giver.plusById, taker.inv, taker.plusById, itemId, count,
        playerPlusOpts(giver, taker, itemId))) {
      fail('enchanted', { itemId });
      return;
    }

    takeCurrency(taker, total);
    giveCurrency(giver, total);
    giver.inv[itemId] = invCount(giver, itemId) - count;
    taker.inv[itemId] = invCount(taker, itemId) + count;
    plusMove(giver.plusById, taker.plusById, itemId);
    pos.count -= count;
    if (pos.count <= 0) delete s.items[itemId];
    pruneInv(p);
    pruneInv(owner);
    saveProfileNow(p);
    saveProfileNow(owner);
    pushWeight(p);
    pushWeight(owner);
    const itemName = NPCS.itemMeta(itemId) ? NPCS.itemMeta(itemId).name : itemId;
    send(p, {
      t: 'store_deal', dir: dir, itemId, count, total, name: itemName,
      peerName: owner.name, inv: p.inv, equip: p.equip || {}, currency: currencyOf(p)
    });
    send(owner, {
      t: 'store_deal', dir: (dir === 'buy' ? 'sold' : 'bought'), itemId, count, total, name: itemName,
      peerName: p.name, inv: owner.inv, equip: owner.equip || {}, currency: currencyOf(owner)
    });
    send(p, storePayload(p, owner));
    send(owner, { t: 'store_open', mode: s.mode, title: s.title, items: storePayload(owner, owner).items });
    if (!Object.keys(s.items).length) closeStore(owner, 'sold_out');
    else broadcastStoreState(owner);
    console.log('[store]', owner.name, dir === 'buy' ? '→' : '←', p.name, itemId + '×' + count, total + '⚙');
  }

  return {
    storePublic,
    storePayload,
    broadcastStoreState,
    closeStore,
    doStoreSet,
    doStoreList,
    doStoreDeal
  };
};
