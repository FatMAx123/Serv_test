// SERVER / HANDLERS / INVENTORY-ACTION-HANDLER.JS
// Обработка экипировки, снятия, выброса и уничтожения предметов (equip, unequip, drop_item, destroy_item)
'use strict';

const ITEMS = require('../../shared/item-db.js');
const GR = require('../../shared/grade-rules.js');
const NPCS = require('../../shared/npc-services.js');
const DR = require('../../shared/death-rules.js');
const {
  bagPlus,
  clearPlusIfGone
} = require('./item-plus-utils.js');

function createInventoryActionHandler(ctx) {
  const {
    send,
    checkRate,
    isBadKey,
    equipSlotForTpl,
    stampDeviceFields,
    pushCombatStats,
    pushWeight,
    saveProfileNow,
    broadcastCosmeticsUpdate,
    invCount,
    spawnGroundLoot,
    itemLookup
  } = ctx;

  function doEquip(p, msg) {
    if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); return; }
    if (p.trade || p.store) { send(p, { t: 'equip_fail', reason: 'busy' }); return; }
    if (!checkRate(p, 'action')) return;
    const templateId = String(msg.templateId || msg.id || '').toLowerCase();
    if (!templateId || isBadKey(templateId)) {
      send(p, { t: 'equip_fail', reason: 'args' });
      return;
    }
    const tpl = ITEMS.get(templateId);
    if (!tpl) {
      send(p, { t: 'equip_fail', reason: 'unknown', templateId });
      return;
    }
    // H9: слот — ТОЛЬКО из шаблона и только из белого списка.
    const slot = equipSlotForTpl(tpl);
    if (!slot) {
      send(p, { t: 'equip_fail', reason: 'slot', templateId });
      send(p, { t: 'msg', text: 'Этот предмет нельзя надеть.' });
      return;
    }
    const needLv = ITEMS.itemLevelReq ? ITEMS.itemLevelReq(tpl) : GR.itemLevelReq(tpl);
    if ((p.level | 0) < needLv) {
      send(p, { t: 'equip_fail', reason: 'level', templateId, need: needLv, have: p.level | 0 });
      send(p, { t: 'msg', text: 'Требуется ' + needLv + ' уровень.' });
      return;
    }
    if (!p.equip) p.equip = Object.create(null);
    let fromSlot = null;
    for (const s of Object.keys(p.equip)) {
      const e = p.equip[s];
      const tid = e && String(e.templateId || e.id || '').toLowerCase();
      if (tid === templateId) { fromSlot = s; break; }
    }
    const inBag = (p.inv[templateId] | 0) >= 1;
    if (!inBag && fromSlot == null) {
      send(p, { t: 'equip_fail', reason: 'none', templateId, inv: p.inv, equip: p.equip });
      send(p, { t: 'msg', text: 'Нет такого предмета.' });
      return;
    }
    const prev = Object.prototype.hasOwnProperty.call(p.equip, slot) ? p.equip[slot] : null;
    const prevTid = prev && String(prev.templateId || prev.id || '').toLowerCase();
    const bagPl = bagPlus(p, templateId);
    if (prevTid === templateId) {
      const prevPl = (prev.plus | 0);
      if (inBag && prevPl !== bagPl) {
        if ((p.inv[templateId] | 0) !== 1) {
          send(p, { t: 'equip_fail', reason: 'enchanted', templateId });
          send(p, { t: 'msg', text: 'В сумке несколько таких предметов — сначала уберите лишние.' });
          return;
        }
        prev.plus = bagPl;
        if (prevPl > 0) p.plusById[templateId] = prevPl;
        else delete p.plusById[templateId];
        pushCombatStats(p);
        saveProfileNow(p);
        send(p, { t: 'equip_ok', slot, templateId, equip: p.equip, inv: p.inv, invPlus: p.plusById });
        return;
      }
      send(p, { t: 'equip_ok', slot, templateId, equip: p.equip, inv: p.inv, invPlus: p.plusById });
      return;
    }
    if (prevTid) {
      const prevPl = (prev.plus | 0);
      if ((p.inv[prevTid] | 0) > 0 && bagPlus(p, prevTid) !== prevPl) {
        send(p, { t: 'equip_fail', reason: 'enchanted', templateId: prevTid });
        send(p, { t: 'msg', text: 'В сумке уже есть такой предмет с другой заточкой — сначала уберите его.' });
        return;
      }
      const tempInv = Object.assign({}, p.inv);
      if (fromSlot == null) {
        tempInv[templateId] = (tempInv[templateId] | 0) - 1;
        if (tempInv[templateId] <= 0) delete tempInv[templateId];
      }
      const fit = NPCS.canFit(tempInv, prevTid, 1);
      if (!fit.ok) {
        send(p, { t: 'equip_fail', reason: 'inv_full', limit: NPCS.INVENTORY_SLOTS_LIMIT });
        send(p, { t: 'msg', text: 'Инвентарь полон.' });
        return;
      }
    }
    let keptPlus = 0;
    if (fromSlot != null) {
      const moved = p.equip[fromSlot];
      keptPlus = (moved && moved.plus | 0) || 0;
      delete p.equip[fromSlot];
    } else {
      keptPlus = bagPl;
      p.inv[templateId] = (p.inv[templateId] | 0) - 1;
      if (p.inv[templateId] <= 0) delete p.inv[templateId];
      delete p.plusById[templateId];
    }
    if (prevTid) {
      p.inv[prevTid] = (p.inv[prevTid] | 0) + 1;
      if ((prev.plus | 0) > 0) p.plusById[prevTid] = prev.plus | 0;
    }
    const eq = Object.create(null);
    eq.id = templateId;
    eq.templateId = templateId;
    eq.plus = keptPlus > 0 ? keptPlus : 0;
    stampDeviceFields(p, eq, tpl);
    p.equip[slot] = eq;
    if (p.equip.ring_l) delete p.equip.ring_l;
    if (p.equip.ring_r) delete p.equip.ring_r;
    pushCombatStats(p);
    saveProfileNow(p);
    send(p, { t: 'equip_ok', slot, templateId, equip: p.equip, inv: p.inv, invPlus: p.plusById });
    const pen = p.combatPack && p.combatPack.gradePenalty;
    if (pen && pen.active) {
      send(p, { t: 'msg', text: 'Штраф грейда: нет экспертизы для этого кристалла.' });
    }
    if (slot === 'title') {
      broadcastCosmeticsUpdate(p);
    }
  }

  function doUnequip(p, msg) {
    if (p.dead || p.hp <= 0) { send(p, { t: 'equip_fail', reason: 'dead' }); return; }
    if (p.trade || p.store) { send(p, { t: 'equip_fail', reason: 'busy' }); return; }
    if (!checkRate(p, 'action')) return;
    const slot = String(msg.slot || '').toLowerCase();
    if (!slot || isBadKey(slot) || !p.equip || !Object.prototype.hasOwnProperty.call(p.equip, slot)) {
      send(p, { t: 'equip_fail', reason: 'empty', slot });
      return;
    }
    const off = p.equip[slot];
    const offTid = off && String(off.templateId || off.id || '').toLowerCase();
    if (offTid && (p.inv[offTid] | 0) > 0 && bagPlus(p, offTid) !== ((off.plus | 0) || 0)) {
      send(p, { t: 'equip_fail', reason: 'enchanted', slot });
      send(p, { t: 'msg', text: 'В сумке уже есть такой предмет с другой заточкой — сначала уберите его.' });
      return;
    }
    if (offTid) {
      const fit = NPCS.canFit(p.inv, offTid, 1);
      const uniqueKeys = Object.keys(p.inv || {}).length;
      if (!fit.ok || (uniqueKeys >= (NPCS.MAX_INV_SLOTS || 80) && !p.inv[offTid])) {
        send(p, { t: 'equip_fail', reason: 'inv_full', slot });
        send(p, { t: 'msg', text: 'Инвентарь переполнен!' });
        return;
      }
    }
    delete p.equip[slot];
    if (offTid) {
      p.inv[offTid] = (p.inv[offTid] | 0) + 1;
      if ((off.plus | 0) > 0) p.plusById[offTid] = off.plus | 0;
    }
    pushCombatStats(p);
    saveProfileNow(p);
    send(p, { t: 'unequip_ok', slot, equip: p.equip, inv: p.inv, invPlus: p.plusById });
    if (slot === 'title') {
      broadcastCosmeticsUpdate(p);
    }
  }

  function doDropItem(p, msg) {
    if (p.dead) return;
    if (p.trade || p.store) {
      send(p, { t: 'drop_fail', reason: 'busy' });
      return;
    }
    if (!checkRate(p, 'action')) return;
    const itemId = String(msg.itemId || msg.id || '').toLowerCase();
    if (!itemId) {
      send(p, { t: 'drop_fail', reason: 'args' });
      return;
    }
    const itemMeta = itemLookup(itemId);
    const isStarter = NPCS && typeof NPCS.isStarterEquip === 'function' && NPCS.isStarterEquip(itemId);
    const isUndroppable = !isStarter && (DR.isDevice(itemId, itemMeta) ||
      !!(itemMeta && (itemMeta.nodrop || itemMeta.noDrop || itemMeta.undroppable || itemMeta.notDropable || itemMeta.bound || itemMeta.type === 'quest' || itemMeta.quest)));
    if (isUndroppable) {
      send(p, { t: 'drop_fail', reason: 'nodrop', itemId });
      send(p, { t: 'msg', text: 'Этот предмет персональный и не может быть выброшен.' });
      return;
    }
    let n = Math.floor(+msg.count || 1);
    if (n < 1) n = 1;
    if (n > 9999) n = 9999;

    let have = invCount(p, itemId);
    let fromEquipSlot = null;
    if (have < 1 && p.equip) {
      Object.keys(p.equip).forEach((s) => {
        if (fromEquipSlot) return;
        const e = p.equip[s];
        const tid = e && String(e.templateId || e.id || '').toLowerCase();
        if (tid === itemId) fromEquipSlot = s;
      });
    }

    if (have < 1 && !fromEquipSlot) {
      send(p, { t: 'drop_fail', reason: 'none', itemId });
      send(p, { t: 'msg', text: 'Нет такого предмета.' });
      return;
    }

    let dropPlus = 0;
    if (fromEquipSlot) {
      const piece = p.equip[fromEquipSlot];
      dropPlus = (piece && piece.plus | 0) || 0;
      n = 1;
      delete p.equip[fromEquipSlot];
      pushCombatStats(p);
      if (fromEquipSlot === 'title') {
        broadcastCosmeticsUpdate(p);
      }
    } else {
      if (n > have) n = have;
      const bagPl = bagPlus(p, itemId);
      if (bagPl > 0 && n < have) {
        send(p, { t: 'drop_fail', reason: 'enchanted', itemId });
        return;
      }
      dropPlus = (n >= have) ? bagPl : 0;
      p.inv[itemId] = have - n;
      if (p.inv[itemId] <= 0) delete p.inv[itemId];
    }

    const ox = p.x + (Math.random() - 0.5) * 1.4 + 0.6;
    const oz = p.z + (Math.random() - 0.5) * 1.4 + 0.6;
    const L = spawnGroundLoot(ox, oz, itemId, n, p.pid, {
      spoil: false, playerDrop: true, plus: dropPlus
    });
    Object.keys(p.inv || {}).forEach((k) => {
      if (!p.inv[k] || p.inv[k] <= 0) delete p.inv[k];
    });
    clearPlusIfGone(p, itemId);
    saveProfileNow(p);
    send(p, {
      t: 'drop_ok',
      itemId: itemId,
      count: n,
      plus: dropPlus,
      lid: L ? L.lid : null,
      inv: p.inv,
      equip: p.equip || {},
      invPlus: p.plusById,
      fromEquip: !!fromEquipSlot,
      slot: fromEquipSlot || null
    });
    pushWeight(p);
  }

  function doDestroyItem(p, msg) {
    if (p.dead) {
      send(p, { t: 'destroy_fail', reason: 'dead' });
      return;
    }
    if (p.trade || p.store) {
      send(p, { t: 'destroy_fail', reason: 'busy' });
      return;
    }
    if (!checkRate(p, 'action')) return;
    const itemId = String(msg.itemId || msg.id || '').toLowerCase();
    if (!itemId) {
      send(p, { t: 'destroy_fail', reason: 'args' });
      return;
    }
    const itemMeta = itemLookup(itemId);
    const isStarter = NPCS && typeof NPCS.isStarterEquip === 'function' && NPCS.isStarterEquip(itemId);
    const isUndestroyable = !isStarter && (DR.isDevice(itemId, itemMeta) ||
      !!(itemMeta && (itemMeta.nodrop || itemMeta.noDrop || itemMeta.undroppable || itemMeta.notDropable || itemMeta.bound || itemMeta.type === 'quest' || itemMeta.quest)));
    if (isUndestroyable) {
      send(p, { t: 'destroy_fail', reason: 'nodrop', itemId });
      send(p, { t: 'msg', text: 'Этот предмет персональный и не может быть уничтожен.' });
      return;
    }
    let n = Math.floor(+msg.count || 1);
    if (n < 1) n = 1;
    if (n > 9999) n = 9999;

    let have = invCount(p, itemId);
    let fromEquipSlot = null;
    if (have < 1 && p.equip) {
      Object.keys(p.equip).forEach((s) => {
        if (fromEquipSlot) return;
        const e = p.equip[s];
        const tid = e && String(e.templateId || e.id || '').toLowerCase();
        if (tid === itemId) fromEquipSlot = s;
      });
    }

    if (have < 1 && !fromEquipSlot) {
      send(p, { t: 'destroy_fail', reason: 'none', itemId });
      send(p, { t: 'msg', text: 'Нет такого предмета.' });
      return;
    }

    if (fromEquipSlot) {
      const piece = p.equip[fromEquipSlot];
      n = 1;
      delete p.equip[fromEquipSlot];
      pushCombatStats(p);
      if (fromEquipSlot === 'title') {
        broadcastCosmeticsUpdate(p);
      }
    } else {
      if (n > have) n = have;
      if (bagPlus(p, itemId) > 0 && n < have) {
        send(p, { t: 'destroy_fail', reason: 'enchanted', itemId });
        return;
      }
      p.inv[itemId] = have - n;
      if (p.inv[itemId] <= 0) delete p.inv[itemId];
    }

    Object.keys(p.inv || {}).forEach((k) => {
      if (!p.inv[k] || p.inv[k] <= 0) delete p.inv[k];
    });
    clearPlusIfGone(p, itemId);
    saveProfileNow(p);
    pushWeight(p);
    send(p, {
      t: 'destroy_ok',
      itemId: itemId,
      count: n,
      inv: p.inv,
      equip: p.equip || {},
      invPlus: p.plusById,
      fromEquip: !!fromEquipSlot,
      slot: fromEquipSlot || null
    });
  }

  return {
    doEquip,
    doUnequip,
    doDropItem,
    doDestroyItem
  };
}

createInventoryActionHandler.createInventoryActionHandler = createInventoryActionHandler;
module.exports = createInventoryActionHandler;
