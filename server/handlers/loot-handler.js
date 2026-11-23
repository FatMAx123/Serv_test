'use strict';

/**
 * server/handlers/loot-handler.js
 * ============================================================================
 * Дроп на землю (groundLoot), распределение лута в группе (random / turn / finders),
 * защита владельца/спойлера, подбор предметов и тик очистки устаревшего дропа.
 * ============================================================================
 */

const LR = require('../../shared/loot-rules.js');
const NPCS = require('../../shared/npc-services.js');

const PARTY_LOOT_MODES = new Set(['random', 'finders', 'turn']);

function createLootHandler(ctx) {
  const {
    players,
    parties,
    groundLoot,
    allocateLootId,
    LOOT_PROTECT_SEC = 30,
    LOOT_LIFE_SEC = 180,
    LOOT_PICKUP_R2 = 20.25,
    LOOT_VIS_R2 = 12996,
    PARTY_EXP_R2 = 2500,
    dist2,
    tableGet,
    send,
    sendPid,
    broadcastNear,
    canCarryMore,
    plusMoveOk,
    questCollectChanged,
    saveProfileNow,
    pushWeight
  } = ctx;

  function itemDisplayName(itemId) {
    try {
      const it = tableGet(LR.LOOT_ITEMS, itemId);
      if (it && it.name) return it.name;
    } catch (e) { /* ignore */ }
    return itemId || '?';
  }

  function lootPayload(L) {
    const payload = {
      t: 'loot_spawn',
      lid: L.lid,
      x: L.x,
      z: L.z,
      itemId: L.itemId,
      count: L.count,
      name: itemDisplayName(L.itemId),
      ownerPid: L.ownerPid,
      ownerPartyId: L.ownerPartyId || null,
      winnerPid: L.winnerPid != null ? L.winnerPid : null,
      protectUntil: L.protectUntil,
      expireAt: L.expireAt,
      spoil: !!L.spoil,
      mobId: L.mobId || null
    };
    if ((L.plus | 0) > 0) payload.plus = L.plus | 0;
    if (L.deathDrop) payload.deathDrop = true;
    return payload;
  }

  function pickLootWinner(pa, ownerPid) {
    if (!pa || pa.members.size <= 1) return null;
    const mode = pa.lootMode || 'random';
    const alive = [...pa.members].filter((id) => players.has(id));
    if (!alive.length) return null;
    if (mode === 'random') return alive[Math.floor(Math.random() * alive.length)];
    if (mode === 'turn') {
      pa.lootTurn = ((pa.lootTurn | 0) + 1) % alive.length;
      return alive[pa.lootTurn];
    }
    return ownerPid != null ? ownerPid : null;
  }

  const MAX_CURRENCY_CAP = 2147483647;

  function spawnGroundLoot(x, z, itemId, count, ownerPid, opts) {
    opts = opts || {};
    const n = Math.floor(+count) || 0;
    if (!itemId || n <= 0) return null;
    const ox = (Math.random() - 0.5) * 2.2;
    const oz = (Math.random() - 0.5) * 2.2;
    const now = Date.now();
    const L = {
      lid: allocateLootId(),
      x: x + ox,
      z: z + oz,
      itemId: String(itemId),
      count: n,
      ownerPid: ownerPid != null ? ownerPid : null,
      ownerPartyId: opts.ownerPartyId != null ? opts.ownerPartyId : null,
      winnerPid: null,
      protectUntil: now + LOOT_PROTECT_SEC * 1000,
      expireAt: now + LOOT_LIFE_SEC * 1000,
      spoil: !!opts.spoil,
      mobId: opts.mobId || null,
      deathDrop: !!opts.deathDrop,
      playerDrop: !!opts.playerDrop
    };
    if ((opts.plus | 0) > 0) L.plus = opts.plus | 0;
    if (L.ownerPid != null && !L.ownerPartyId && !L.playerDrop) {
      const ow = players.get(L.ownerPid);
      if (ow && ow.partyId) {
        L.ownerPartyId = ow.partyId;
      }
    }
    groundLoot.set(L.lid, L);
    const payload = lootPayload(L);
    payload.name = itemDisplayName(L.itemId);
    broadcastNear(L.x, L.z, payload);
    if (L.ownerPid != null) {
      const owner = players.get(L.ownerPid);
      if (owner) send(owner, payload);
    }
    return L;
  }

  function spawnMobDropPiles(x, z, drop, ownerPid, opts) {
    opts = opts || {};
    const spawned = [];
    if (drop && drop.adena > 0) {
      const g = spawnGroundLoot(x, z, 'copper_parts', drop.adena, ownerPid, opts);
      if (g) spawned.push(g);
    }
    (drop && drop.items || []).forEach((it) => {
      if (!it || !it.id) return;
      const g = spawnGroundLoot(x, z, it.id, it.count, ownerPid, opts);
      if (g) spawned.push(g);
    });
    return spawned;
  }

  function grantLootToPlayer(p, itemId, count) {
    const n = Math.floor(+count) || 0;
    if (!itemId || n <= 0) return;
    if (p) p._weightStateAt = 0;
    if (itemId === 'copper_parts') {
      const cur = Number(p.inv[itemId]) || 0;
      p.inv[itemId] = Math.min(MAX_CURRENCY_CAP, cur + n);
      return;
    }
    p.inv[itemId] = (p.inv[itemId] || 0) + n;
  }

  function canPickupLoot(p, L) {
    if (!p || !L) return { ok: false, reason: 'gone' };
    if (dist2(p.x, p.z, L.x, L.z) > LOOT_PICKUP_R2) return { ok: false, reason: 'range' };
    const now = Date.now();
    if (L.expireAt <= now) return { ok: false, reason: 'expired' };

    if (now < L.protectUntil) {
      if (L.spoil || L.playerDrop) {
        if (L.ownerPid != null && L.ownerPid !== p.pid) {
          return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
        }
      } else {
        const owner = L.ownerPid != null ? players.get(L.ownerPid) : null;
        const partyId = L.ownerPartyId || (owner && owner.partyId) || null;
        if (partyId) {
          if (!p.partyId || p.partyId !== partyId) {
            return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
          }
          const pa = parties.get(partyId);
          if (pa && pa.lootMode === 'finders' && L.ownerPid != null && L.ownerPid !== p.pid) {
            return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
          }
          return { ok: true };
        } else {
          if (L.ownerPid != null && L.ownerPid !== p.pid) {
            return { ok: false, reason: 'protected', ownerPid: L.ownerPid, protectUntil: L.protectUntil };
          }
        }
      }
    }

    return { ok: true };
  }

  function doLootPickup(p, lid) {
    if (p.dead || p.hp <= 0) return;
    lid = +lid;
    const L = groundLoot.get(lid);
    if (!L) {
      send(p, { t: 'loot_fail', lid, reason: 'gone' });
      return;
    }
    const chk = canPickupLoot(p, L);
    if (!chk.ok) {
      send(p, {
        t: 'loot_fail',
        lid,
        reason: chk.reason,
        protectUntil: chk.protectUntil || null
      });
      return;
    }

    const pa = p.partyId ? parties.get(p.partyId) : null;
    const isPartyDrop = pa && !L.playerDrop && (L.ownerPartyId === p.partyId || (L.ownerPid != null && pa.members.has(L.ownerPid)));

    if (isPartyDrop && L.itemId === 'copper_parts') {
      const nearby = [...pa.members]
        .map(id => players.get(id))
        .filter(m => m && !m.dead && (m.hp == null || m.hp > 0) && dist2(m.x, m.z, p.x, p.z) <= PARTY_EXP_R2);
      const eligible = nearby.length > 0 ? nearby : [p];

      if (eligible.length > 1) {
        // C-18: проверяем лимит веса и кап валюты (MAX_CURRENCY_CAP) перед дележом
        const baseShare = Math.floor(L.count / eligible.length);
        const baseRem = L.count % eligible.length;
        const receivers = [];
        let firstFailReason = null;
        let firstCarryFail = null;
        for (const m of eligible) {
          const want = (m.pid === p.pid) ? (baseShare + baseRem) : baseShare;
          if (want <= 0) continue;
          const capRoom = Math.max(0, MAX_CURRENCY_CAP - (Number(m.inv && m.inv.copper_parts) || 0));
          if (capRoom <= 0) {
            if (!firstFailReason) firstFailReason = 'currency_cap';
            continue;
          }
          const grantTry = Math.min(want, capRoom);
          const carry = canCarryMore(m, 'copper_parts', grantTry);
          if (!carry.ok) {
            if (!firstFailReason) {
              firstFailReason = 'weight';
              firstCarryFail = carry;
            }
            continue;
          }
          receivers.push({ m, capRoom });
        }
        if (receivers.length === 0) {
          send(p, {
            t: 'loot_fail',
            lid,
            reason: firstFailReason || 'currency_cap',
            weight: firstCarryFail ? firstCarryFail.load : undefined,
            maxWeight: firstCarryFail ? firstCarryFail.max : undefined
          });
          return;
        }

        const share = Math.floor(L.count / receivers.length);
        let remainder = L.count % receivers.length;
        let grantedTotal = 0;
        const grants = [];
        for (const r of receivers) {
          const isPicker = r.m.pid === p.pid;
          let want = share + (isPicker ? remainder : 0);
          if (isPicker) remainder = 0;
          const allowed = Math.min(want, r.capRoom);
          const carry = canCarryMore(r.m, 'copper_parts', allowed);
          const actual = carry.ok ? allowed : 0;
          if (actual > 0) {
            grants.push({ m: r.m, amount: actual });
            grantedTotal += actual;
          }
        }
        if (grantedTotal <= 0) {
          send(p, {
            t: 'loot_fail',
            lid,
            reason: firstFailReason || 'weight',
            weight: firstCarryFail ? firstCarryFail.load : undefined,
            maxWeight: firstCarryFail ? firstCarryFail.max : undefined
          });
          return;
        }

        const leftover = L.count - grantedTotal;
        if (leftover <= 0) {
          groundLoot.delete(lid);
          broadcastNear(L.x, L.z, { t: 'loot_remove', lid });
        } else {
          L.count = leftover;
        }

        for (const { m, amount } of grants) {
          grantLootToPlayer(m, 'copper_parts', amount);
          saveProfileNow(m);
          pushWeight(m);
          if (m.pid === p.pid) {
            send(m, {
              t: 'loot_pickup_ok',
              lid,
              itemId: 'copper_parts',
              count: amount,
              totalCount: grantedTotal,
              partyShare: true,
              inv: m.inv,
              equip: m.equip || {},
              invPlus: m.plusById
            });
          } else {
            send(m, {
              t: 'party_currency_share',
              itemId: 'copper_parts',
              count: amount,
              totalCount: grantedTotal,
              pickerName: p.name,
              inv: m.inv,
              equip: m.equip || {},
              invPlus: m.plusById
            });
          }
        }
        return;
      }
    }

    let recipient = p;
    if (isPartyDrop && !L.spoil) {
      const nearby = [...pa.members]
        .map(id => players.get(id))
        .filter(m => m && !m.dead && (m.hp == null || m.hp > 0) && dist2(m.x, m.z, p.x, p.z) <= PARTY_EXP_R2);
      const eligible = nearby.length > 0 ? nearby : [p];

      const mode = pa.lootMode || 'random';
      if (mode === 'random') {
        recipient = eligible[Math.floor(Math.random() * eligible.length)] || p;
      } else if (mode === 'turn') {
        pa.lootTurn = ((pa.lootTurn | 0) + 1) % eligible.length;
        recipient = eligible[pa.lootTurn] || p;
      } else {
        recipient = p;
      }
    }

    if (L.itemId === 'copper_parts') {
      const curGold = Number(recipient.inv && recipient.inv.copper_parts) || 0;
      if (curGold + L.count > MAX_CURRENCY_CAP) {
        send(p, { t: 'loot_fail', lid, reason: 'currency_cap' });
        return;
      }
    }

    const carry = canCarryMore(recipient, L.itemId, L.count);
    if (!carry.ok) {
      send(p, {
        t: 'loot_fail', lid, reason: 'weight',
        weight: carry.load, maxWeight: carry.max
      });
      if (recipient.pid !== p.pid) {
        send(recipient, { t: 'msg', text: 'Слишком тяжело — вы не можете принять лут группы.' });
      }
      return;
    }
    const fit = NPCS.canFit(recipient.inv, L.itemId, L.count, recipient.invSlots);
    if (!fit.ok) {
      send(p, {
        t: 'loot_fail', lid, reason: 'inv_full',
        need: fit.need, free: fit.free
      });
      if (recipient.pid !== p.pid) {
        send(recipient, { t: 'msg', text: 'Инвентарь полон — вы не можете принять лут группы.' });
      }
      return;
    }

    const lootPlus = L.plus | 0;
    const fromCounts = Object.create(null);
    fromCounts[L.itemId] = L.count;
    const fromPlus = Object.create(null);
    if (lootPlus > 0) fromPlus[L.itemId] = lootPlus;
    if (!plusMoveOk(fromCounts, fromPlus, recipient.inv, recipient.plusById, L.itemId, L.count, {})) {
      send(p, { t: 'loot_fail', lid, reason: 'enchanted' });
      send(p, { t: 'msg', text: 'В сумке уже есть этот предмет с другой заточкой — уберите его на склад.' });
      return;
    }

    grantLootToPlayer(recipient, L.itemId, L.count);
    if ((L.plus | 0) > 0) recipient.plusById[L.itemId] = L.plus | 0;
    Object.keys(recipient.inv).forEach((k) => {
      if (!recipient.inv[k] || recipient.inv[k] <= 0) delete recipient.inv[k];
    });

    groundLoot.delete(lid);
    broadcastNear(L.x, L.z, { t: 'loot_remove', lid });

    if (recipient.pid === p.pid) {
      send(p, {
        t: 'loot_pickup_ok',
        lid,
        itemId: L.itemId,
        count: L.count,
        plus: L.plus | 0,
        spoil: !!L.spoil,
        inv: p.inv,
        equip: p.equip || {},
        invPlus: p.plusById
      });
    } else {
      send(p, {
        t: 'loot_pickup_ok',
        lid,
        itemId: L.itemId,
        count: L.count,
        plus: L.plus | 0,
        spoil: !!L.spoil,
        recipientName: recipient.name,
        inv: p.inv,
        equip: p.equip || {},
        invPlus: p.plusById
      });
      send(recipient, {
        t: 'party_loot_received',
        lid,
        itemId: L.itemId,
        count: L.count,
        plus: L.plus | 0,
        pickerName: p.name,
        inv: recipient.inv,
        equip: recipient.equip || {},
        invPlus: recipient.plusById
      });
    }

    if (isPartyDrop) {
      for (const memId of pa.members) {
        if (memId !== p.pid && memId !== recipient.pid) {
          sendPid(memId, {
            t: 'msg',
            text: `${p.name} подобрал ${itemDisplayName(L.itemId)} x${L.count} (получил ${recipient.name}).`
          });
        }
      }
    }

    questCollectChanged(recipient, L.itemId);
    saveProfileNow(recipient);
    pushWeight(recipient);
    if (p.pid !== recipient.pid) {
      saveProfileNow(p);
      pushWeight(p);
    }
  }

  function tickGroundLoot() {
    if (groundLoot.size === 0) return;
    const now = Date.now();
    for (const [lid, L] of groundLoot) {
      if (L.expireAt <= now) {
        groundLoot.delete(lid);
        broadcastNear(L.x, L.z, { t: 'loot_remove', lid, reason: 'expired' });
      }
    }
  }

  function sendNearbyLoot(p) {
    if (groundLoot.size === 0) return;
    const list = [];
    for (const [, L] of groundLoot) {
      if (dist2(p.x, p.z, L.x, L.z) <= LOOT_VIS_R2) list.push(lootPayload(L));
    }
    if (list.length) send(p, { t: 'loot_snapshot', loots: list });
  }

  return {
    PARTY_LOOT_MODES,
    lootPayload,
    itemDisplayName,
    pickLootWinner,
    spawnGroundLoot,
    spawnMobDropPiles,
    grantLootToPlayer,
    canPickupLoot,
    doLootPickup,
    tickGroundLoot,
    sendNearbyLoot
  };
}

module.exports = {
  createLootHandler,
  PARTY_LOOT_MODES
};

