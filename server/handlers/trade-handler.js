// SERVER / HANDLERS / TRADE-HANDLER.JS
// Обмен предметами и валютой между игроками (L2 Classic trade system)
'use strict';
const TR = require('../../shared/trade-rules.js');
const Mod = require('../moderation.js');
const {
  mapCount,
  playerPlusOpts,
  plusMoveOk,
  plusMove
} = require('./item-plus-utils.js');

module.exports = function createTradeHandler(ctx) {
  const {
    players,
    send,
    isBadKey,
    invCount,
    wouldExceedWeight,
    pruneInv,
    saveProfileNow,
    pushWeight
  } = ctx;

  function tradeSide(p) {
    return { offer: p.trade.offer, locked: !!p.trade.locked, confirmed: !!p.trade.confirmed };
  }

  function tradePayload(p, q, extra) {
    return Object.assign({
      peer: q.pid,
      peerName: q.name,
      mine: tradeSide(p),
      theirs: tradeSide(q),
      inv: p.inv,
      equip: p.equip || {},
      plusById: p.plusById,
      maxSlots: TR.MAX_TRADE_SLOTS
    }, extra || {});
  }

  function sendTradeUpdate(p, q) {
    send(p, tradePayload(p, q, { t: 'trade_update' }));
    send(q, tradePayload(q, p, { t: 'trade_update' }));
  }

  /** Закрыть сессию у обеих сторон. Причина уходит клиенту как есть. */
  function closeTrade(p, reason) {
    const t = p && p.trade;
    if (!t) return;
    const q = players.get(t.peer);
    p.trade = null;
    send(p, { t: 'trade_close', reason: reason || 'cancel' });
    if (q && q.trade && q.trade.peer === p.pid) {
      q.trade = null;
      send(q, { t: 'trade_close', reason: reason || 'cancel' });
    }
  }

  /** Партнёр по активной сессии или null (рассогласованную сессию закрываем). */
  function tradePeer(p) {
    const t = p.trade;
    if (!t) return null;
    const q = players.get(t.peer);
    if (!q || !q.trade || q.trade.peer !== p.pid) { closeTrade(p, 'peer_gone'); return null; }
    if (Date.now() - Math.min(t.at, q.trade.at) > TR.TRADE_TTL_MS) { closeTrade(p, 'timeout'); return null; }
    return q;
  }

  /** Общие условия обмена: оба живы, не в бою, рядом. */
  function tradeReady(p, q, failType) {
    if (p.dead || q.dead) { send(p, { t: failType, reason: 'dead' }); return false; }
    if (p.isFlagged || q.isFlagged) { send(p, { t: failType, reason: 'flagged' }); return false; }
    if (p.duel || q.duel || p.store || q.store) { send(p, { t: failType, reason: 'busy' }); return false; }
    if (!TR.inRange(p.x, p.z, q.x, q.z)) { send(p, { t: failType, reason: 'range' }); return false; }
    return true;
  }

  /** Изменилось содержимое — готовность обеих сторон сбрасывается. */
  function tradeTouch(p, q) {
    const now = Date.now();
    p.trade.locked = false; p.trade.confirmed = false; p.trade.at = now;
    q.trade.locked = false; q.trade.confirmed = false; q.trade.at = now;
  }

  function doTradeOffer(p, msg) {
    const q = players.get(msg.pid | 0);
    if (!q || q.pid === p.pid) {
      send(p, { t: 'trade_fail', reason: 'no_target' });
      return;
    }
    if (p.trade || q.trade) {
      send(p, { t: 'trade_fail', reason: 'busy' });
      return;
    }
    if (!tradeReady(p, q, 'trade_fail')) return;
    q._tradeFrom = { pid: p.pid, at: Date.now() };
    send(q, { t: 'trade_invite', from: p.pid, fromName: p.name });
    send(q, { t: 'msg', text: p.name + ' предлагает обмен. /trade_accept' });
    send(p, { t: 'msg', text: 'Предложение обмена отправлено: ' + q.name });
  }

  function doTradeAccept(p, msg) {
    const from = p._tradeFrom;
    const wantPid = (msg && msg.pid != null) ? (msg.pid | 0) : (from ? from.pid : null);
    if (!from || wantPid == null || from.pid !== wantPid || Date.now() - from.at > TR.TRADE_TTL_MS) {
      p._tradeFrom = null;
      send(p, { t: 'trade_fail', reason: 'no_invite' });
      return;
    }
    const q = players.get(wantPid);
    if (!q) {
      p._tradeFrom = null;
      send(p, { t: 'trade_fail', reason: 'no_target' });
      return;
    }
    if (p.trade || q.trade) {
      send(p, { t: 'trade_fail', reason: 'busy' });
      return;
    }
    if (!tradeReady(p, q, 'trade_fail')) return;
    p._tradeFrom = null;
    const now = Date.now();
    p.trade = { peer: q.pid, offer: Object.create(null), locked: false, confirmed: false, at: now };
    q.trade = { peer: p.pid, offer: Object.create(null), locked: false, confirmed: false, at: now };
    send(p, tradePayload(p, q, { t: 'trade_open' }));
    send(q, tradePayload(q, p, { t: 'trade_open' }));
  }

  function doTradeAdd(p, msg) {
    const q = tradePeer(p);
    if (!q) { send(p, { t: 'trade_fail', reason: 'no_trade' }); return; }
    if (!tradeReady(p, q, 'trade_fail')) return;
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) { send(p, { t: 'trade_fail', reason: 'args' }); return; }
    const can = TR.tradable(itemId);
    if (!can.ok) { send(p, { t: 'trade_fail', reason: can.reason, itemId }); return; }
    const have = invCount(p, itemId);
    const already = mapCount(p.trade.offer, itemId);
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (already + count > have) count = have - already;
    if (count < 1) { send(p, { t: 'trade_fail', reason: 'none', itemId }); return; }
    if (!already && TR.offerSlots(p.trade.offer) >= TR.MAX_TRADE_SLOTS) {
      send(p, { t: 'trade_fail', reason: 'offer_full' });
      return;
    }
    p.trade.offer[itemId] = already + count;
    tradeTouch(p, q);
    sendTradeUpdate(p, q);
  }

  function doTradeRemove(p, msg) {
    const q = tradePeer(p);
    if (!q) { send(p, { t: 'trade_fail', reason: 'no_trade' }); return; }
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) { send(p, { t: 'trade_fail', reason: 'args' }); return; }
    const already = mapCount(p.trade.offer, itemId);
    if (already < 1) { send(p, { t: 'trade_fail', reason: 'none', itemId }); return; }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count >= already) delete p.trade.offer[itemId];
    else p.trade.offer[itemId] = already - count;
    tradeTouch(p, q);
    sendTradeUpdate(p, q);
  }

  function doTradeLock(p) {
    const q = tradePeer(p);
    if (!q) { send(p, { t: 'trade_fail', reason: 'no_trade' }); return; }
    p.trade.locked = true;
    p.trade.at = Date.now();
    sendTradeUpdate(p, q);
  }

  function doTradeConfirm(p) {
    const q = tradePeer(p);
    if (!q) { send(p, { t: 'trade_fail', reason: 'no_trade' }); return; }
    if (!tradeReady(p, q, 'trade_fail')) return;
    if (!p.trade.locked || !q.trade.locked) {
      send(p, { t: 'trade_fail', reason: 'not_locked' });
      return;
    }
    p.trade.confirmed = true;
    p.trade.at = Date.now();
    if (!q.trade.confirmed) {
      sendTradeUpdate(p, q);
      return;
    }
    tradeExecute(p, q);
  }

  /** Перенос одной стороны предложения. Без проверок — они уже пройдены. */
  function tradeMoveItems(from, to, offer) {
    for (const id of Object.keys(offer)) {
      const n = Math.max(0, Math.floor(Number(offer[id]))) || 0;
      from.inv[id] = invCount(from, id) - n;
      to.inv[id] = invCount(to, id) + n;
      plusMove(from.plusById, to.plusById, id);
    }
  }

  /**
   * Транзакция «всё или ничего». Любая непройденная проверка — полный отказ:
   * ничего не переносим, сбрасываем готовность и оставляем окно открытым.
   */
  function tradeExecute(p, q) {
    if (!tradeReady(p, q, 'trade_fail')) {
      closeTrade(p, 'not_ready');
      return;
    }
    const give = p.trade.offer;
    const take = q.trade.offer;
    const fail = (reason, itemId) => {
      tradeTouch(p, q);
      const pack = { t: 'trade_fail', reason: reason, itemId: itemId || null };
      send(p, pack);
      send(q, pack);
      sendTradeUpdate(p, q);
    };

    // 1) Стороны всё ещё владеют обещанным (могли продать/выбросить после lock)
    const sides = [[p, give], [q, take]];
    for (const [owner, offer] of sides) {
      for (const id of Object.keys(offer)) {
        const n = Math.max(0, Math.floor(Number(offer[id]))) || 0;
        if (n <= 0) { fail('args', id); return; }
        const can = TR.tradable(id);
        if (!can.ok) { fail(can.reason, id); return; }
        if (invCount(owner, id) < n) { fail('gone', id); return; }
      }
    }
    // 2) Слоты после обмена: своё уходит, чужое приходит
    if (!TR.canSwap(p.inv, give, take).ok) { fail('inv_full_self'); return; }
    if (!TR.canSwap(q.inv, take, give).ok) { fail('inv_full_peer'); return; }
    const wP = wouldExceedWeight(p, give, take);
    if (!wP.ok) { fail('weight_self'); return; }
    const wQ = wouldExceedWeight(q, take, give);
    if (!wQ.ok) { fail('weight_peer'); return; }
    // 3) Заточка: реестр plus один на templateId, смешивать копии нельзя.
    for (const id of Object.keys(give)) {
      const n = Math.max(0, Math.floor(Number(give[id]))) || 0;
      if (!plusMoveOk(p.inv, p.plusById, q.inv, q.plusById, id, n, playerPlusOpts(p, q, id))) {
        fail('enchanted', id); return;
      }
    }
    for (const id of Object.keys(take)) {
      const n = Math.max(0, Math.floor(Number(take[id]))) || 0;
      if (!plusMoveOk(q.inv, q.plusById, p.inv, p.plusById, id, n, playerPlusOpts(q, p, id))) {
        fail('enchanted', id); return;
      }
    }

    // 4) Перенос. С этой строки и до конца — ни одного await.
    tradeMoveItems(p, q, give);
    tradeMoveItems(q, p, take);
    pruneInv(p);
    pruneInv(q);
    p.trade = null;
    q.trade = null;
    saveProfileNow(p);
    saveProfileNow(q);
    send(p, { t: 'trade_done', gave: give, got: take, inv: p.inv, equip: p.equip || {}, peerName: q.name });
    send(q, { t: 'trade_done', gave: take, got: give, inv: q.inv, equip: q.equip || {}, peerName: p.name });
    pushWeight(p);
    pushWeight(q);
    Mod.log('trade', { yid: p.yid, name: p.name, peer: q.yid, peerName: q.name, gave: give, got: take });
    const brief = (o) => Object.keys(o).map((id) => id + '×' + (Math.max(0, Math.floor(Number(o[id]))) || 0)).join(',') || '—';
    console.log('[trade]', p.name, '→', q.name, brief(give), '|', q.name, '→', p.name, brief(take));
  }

  return {
    tradeSide,
    tradePayload,
    sendTradeUpdate,
    closeTrade,
    tradePeer,
    tradeReady,
    tradeTouch,
    doTradeOffer,
    doTradeAccept,
    doTradeAdd,
    doTradeRemove,
    doTradeLock,
    doTradeConfirm,
    tradeMoveItems,
    tradeExecute
  };
};
