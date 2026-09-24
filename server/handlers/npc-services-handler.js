// SERVER / HANDLERS / NPC-SERVICES-HANDLER.JS — Услуги NPC (магазин, телепорт, баффы).
// Перенесён из server.js при декомпозиции монолита (Риск 1).
'use strict';
const {
  clearPlusIfGone,
  equippedCount,
  equippedPlus
} = require('./item-plus-utils.js');

function createNpcServicesHandler(deps) {
  const {
    NPCS,
    WM,
    send,
    broadcastAOI,
    currencyOf,
    takeCurrency,
    giveCurrency,
    invCount,
    pruneInv,
    canCarryMore,
    pushWeight,
    saveProfileNow,
    isBadKey,
    snapStandY,
    resetMoveBudget,
    ensureNearbyMobs,
    isPeaceAt,
    zoneLabelAt,
    applyPlayerBuff,
    pushEffects,
    pushCombatStats
  } = deps;

  /**
   * Найти NPC для услуги: существует, нужного вида и рядом с игроком.
   * @returns {object|null} NPC либо null (ответ об ошибке уже отправлен)
   */
  function npcForService(p, npcId, failType, needField) {
    const npc = NPCS.getNpc(npcId);
    if (!npc) {
      send(p, { t: failType, reason: 'unknown_npc', npcId: String(npcId || '') });
      return null;
    }
    // needField — имя поля услуги (shop / teleports / buffs) либо предикат:
    // у склада услуга задана типом NPC, а не отдельным массивом.
    if (needField) {
      const has = (typeof needField === 'function') ? !!needField(npc) : !!npc[needField];
      if (!has) {
        send(p, { t: failType, reason: 'no_service', npcId: npc.id });
        return null;
      }
    }
    if (!NPCS.inRange(npc, p.x, p.z)) {
      send(p, { t: failType, reason: 'range', npcId: npc.id, npcX: npc.position.x, npcZ: npc.position.z });
      return null;
    }
    return npc;
  }

  /** Каталог магазина по запросу клиента (цены авторитетны). */
  function doShopOpen(p, npcId) {
    const npc = npcForService(p, npcId, 'shop_fail', 'shop');
    if (!npc) return;
    send(p, {
      t: 'shop_open',
      npcId: npc.id,
      npcName: npc.name,
      items: NPCS.shopCatalog(npc.id),
      sellRate: NPCS.SELL_RATE,
      currency: currencyOf(p)
    });
  }

  function doShopBuy(p, msg) {
    const npc = npcForService(p, msg.npcId, 'shop_fail', 'shop');
    if (!npc) return;
    const itemId = String(msg.itemId || '').toLowerCase();
    // Цена ТОЛЬКО из каталога: раньше клиент передавал её аргументом buyItem.
    const entry = NPCS.shopEntry(npc.id, itemId);
    if (!entry) {
      send(p, { t: 'shop_fail', reason: 'not_sold', npcId: npc.id, itemId });
      return;
    }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > NPCS.MAX_BUY_COUNT) count = NPCS.MAX_BUY_COUNT;
    if (!entry.stackable && count > 1) count = 1;   // нестакуемое — по одному
    const total = entry.price * count;
    if (currencyOf(p) < total) {
      send(p, { t: 'shop_fail', reason: 'funds', npcId: npc.id, itemId, need: total, have: currencyOf(p) });
      return;
    }
    const fit = NPCS.canFit(p.inv, itemId, count);
    if (!fit.ok) {
      send(p, { t: 'shop_fail', reason: 'inv_full', npcId: npc.id, itemId, need: fit.need, free: fit.free });
      return;
    }
    const carry = canCarryMore(p, itemId, count);
    if (!carry.ok) {
      send(p, { t: 'shop_fail', reason: 'weight', npcId: npc.id, itemId, weight: carry.load, maxWeight: carry.max });
      return;
    }
    const bagPlus = (equippedCount(p, itemId) === 0) && (p.plusById && (p.plusById[itemId] | 0) > 0);
    if (bagPlus) {
      send(p, { t: 'shop_fail', reason: 'enchanted', npcId: npc.id, itemId });
      return;
    }
    takeCurrency(p, total);
    p.inv[itemId] = invCount(p, itemId) + count;
    saveProfileNow(p);
    send(p, {
      t: 'shop_buy_ok',
      npcId: npc.id, itemId, count, price: entry.price, total,
      currency: currencyOf(p), inv: p.inv, equip: p.equip || {}
    });
    pushWeight(p);
  }

  function doShopSell(p, msg) {
    const npc = npcForService(p, msg.npcId, 'shop_fail', 'shop');
    if (!npc) return;
    const itemId = String(msg.itemId || '').toLowerCase();
    if (!itemId || isBadKey(itemId)) {
      send(p, { t: 'shop_fail', reason: 'args', npcId: npc.id });
      return;
    }
    const unit = NPCS.sellPrice(itemId);
    if (unit <= 0) {
      // валюта, квестовые и предметы без цены не скупаются
      send(p, { t: 'shop_fail', reason: 'not_bought', npcId: npc.id, itemId });
      return;
    }
    const have = invCount(p, itemId);
    if (have < 1) {
      send(p, { t: 'shop_fail', reason: 'none', npcId: npc.id, itemId });
      return;
    }
    let count = Math.floor(+msg.count || 1);
    if (!Number.isFinite(count) || count < 1) count = 1;
    if (count > have) count = have;
    p.inv[itemId] = have - count;
    pruneInv(p);
    // Заточка проданной вещи не должна «вернуться» на новую копию того же id,
    // но если копия того же типа надета на персонаже — сохраняем реестр заточки.
    clearPlusIfGone(p, itemId);
    const total = unit * count;
    giveCurrency(p, total);
    saveProfileNow(p);
    send(p, {
      t: 'shop_sell_ok',
      npcId: npc.id, itemId, count, price: unit, total,
      currency: currencyOf(p), inv: p.inv, equip: p.equip || {}
    });
    pushWeight(p);
  }

  /** Список точек телепорта (клиент рисует меню по серверным ценам). */
  function doTeleportList(p, npcId) {
    const npc = npcForService(p, npcId, 'teleport_fail', 'teleports');
    if (!npc) return;
    send(p, {
      t: 'teleport_list',
      npcId: npc.id, npcName: npc.name,
      points: NPCS.teleportPoints(npc.id),
      currency: currencyOf(p)
    });
  }

  function doTeleport(p, msg) {
    if (p.dead) {
      send(p, { t: 'teleport_fail', reason: 'dead' });
      return;
    }
    const npc = npcForService(p, msg.npcId, 'teleport_fail', 'teleports');
    if (!npc) return;
    const pt = NPCS.teleportPoint(npc.id, msg.point != null ? msg.point : msg.index);
    if (!pt) {
      send(p, { t: 'teleport_fail', reason: 'unknown_point', npcId: npc.id });
      return;
    }
    // Бой не должен прерываться телепортом — иначе это бесплатный побег из PvP.
    if (p.isFlagged) {
      send(p, { t: 'teleport_fail', reason: 'flagged', npcId: npc.id });
      return;
    }
    if (currencyOf(p) < pt.cost) {
      send(p, { t: 'teleport_fail', reason: 'funds', npcId: npc.id, need: pt.cost, have: currencyOf(p) });
      return;
    }
    takeCurrency(p, pt.cost);
    p.x = pt.x;
    p.z = pt.z;
    snapStandY(p);
    p.moving = false;
    // Бюджет перемещения обнуляется: иначе «простой» у NPC превратится в рывок
    // на точке прибытия.
    resetMoveBudget(p);
    const r = WM.regionAt(p.x, p.z) || {};
    if (r.id) p.region = r.id;
    ensureNearbyMobs(p);
    // AOI пересчитается на следующем тике; наблюдателям сообщаем сразу, чтобы
    // модель не «ехала» через полкарты интерполяцией.
    broadcastAOI(p, { t: 'player_teleport', pid: p.pid, x: p.x, y: p.y, z: p.z });
    send(p, {
      t: 'teleport_ok',
      npcId: npc.id, name: pt.name, x: p.x, y: p.y, z: p.z,
      cost: pt.cost, currency: currencyOf(p),
      region: p.region, peace: isPeaceAt(p.x, p.z), zoneName: zoneLabelAt(p.x, p.z),
      inv: p.inv
    });
    send(p, { t: 'self_sync', x: p.x, y: p.y, z: p.z });
    saveProfileNow(p);
  }

  /** Список баффов NPC. */
  function doBuffList(p, npcId) {
    const npc = npcForService(p, npcId, 'npc_buff_fail', 'buffs');
    if (!npc) return;
    send(p, {
      t: 'npc_buff_list',
      npcId: npc.id, npcName: npc.name,
      buffs: NPCS.buffOffers(npc.id),
      currency: currencyOf(p)
    });
  }

  function doBuffBuy(p, msg) {
    if (p.dead) {
      send(p, { t: 'npc_buff_fail', reason: 'dead' });
      return;
    }
    const npc = npcForService(p, msg.npcId, 'npc_buff_fail', 'buffs');
    if (!npc) return;
    const offer = NPCS.buffOffer(npc.id, msg.buffId);
    if (!offer) {
      send(p, { t: 'npc_buff_fail', reason: 'unknown_buff', npcId: npc.id });
      return;
    }
    if (currencyOf(p) < offer.cost) {
      send(p, { t: 'npc_buff_fail', reason: 'funds', npcId: npc.id, need: offer.cost, have: currencyOf(p) });
      return;
    }
    takeCurrency(p, offer.cost);
    const now = Date.now();
    const buff = {
      id: 'npc_' + offer.id,
      name: offer.name || offer.id,
      icon: offer.id,
      until: now + offer.duration * 1000,
      npcBuff: true
    };
    // Эффекты — только известные множители и с клампом: данные приходят из
    // world-metrics, но редактор мира может записать туда что угодно.
    const eff = offer.effect || {};
    const mul = (v) => Math.min(3, Math.max(1, +v || 1));
    if (eff.attackMult > 0) buff.attackMult = mul(eff.attackMult);
    if (eff.defenseMult > 0) buff.defenseMult = mul(eff.defenseMult);
    if (eff.speedMult > 0) buff.speedMult = Math.min(1.5, Math.max(1, +eff.speedMult));
    if (eff.expMult > 0) buff.expMult = mul(eff.expMult);
    applyPlayerBuff(p, buff, now);
    pushEffects(p);
    pushCombatStats(p);
    saveProfileNow(p);
    send(p, {
      t: 'npc_buff_ok',
      npcId: npc.id, buffId: offer.id, name: offer.name,
      duration: offer.duration, effect: eff,
      cost: offer.cost, currency: currencyOf(p), inv: p.inv
    });
  }

  return {
    npcForService,
    doShopOpen,
    doShopBuy,
    doShopSell,
    doTeleportList,
    doTeleport,
    doBuffList,
    doBuffBuy
  };
}

module.exports = { createNpcServicesHandler };
