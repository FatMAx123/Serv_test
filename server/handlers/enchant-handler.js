// SERVER / HANDLERS / ENCHANT-HANDLER.JS
// Заточка оружия и брони усилителями давления (L2 enchant & crystallization rules)
'use strict';

const crypto = require('crypto');
const ITEMS = require('../../shared/item-db.js');
const G = require('../../shared/game-rules.js');
const LR = require('../../shared/loot-rules.js');
const ER = require('../../shared/enchant-rules.js');
const NPCS = require('../../shared/npc-services.js');

function createEnchantHandler(ctx) {
  const {
    send,
    checkRate,
    isBadKey,
    pushCombatStats,
    pushWeight,
    saveProfileNow,
    invCount,
    canCarryMore,
    spawnGroundLoot
  } = ctx;

  function doEnchant(p, msg) {
    if (p.dead || p.hp <= 0) return;
    if (p.trade || p.store) { send(p, { t: 'enchant_fail', reason: 'busy' }); return; }
    if (!checkRate(p, 'action')) return;
    // slot='__proto__' раньше давал Object.prototype и запись item.plus
    // загрязняла прототип на весь процесс (все предметы становились +N).
    const slot = String(msg.slot || '');
    if (isBadKey(slot)) return;
    const item = Object.prototype.hasOwnProperty.call(p.equip, slot) ? p.equip[slot] : null;
    if (!item || typeof item !== 'object') return;
    const plus = Math.max(0, Math.floor(+item.plus || 0));
    // Верхняя граница: раньше plus рос бесконечно (и не влиял на статы).
    if (plus >= ITEMS.ENCHANT_MAX) {
      send(p, { t: 'enchant_fail', slot, plus, reason: 'max', max: ITEMS.ENCHANT_MAX, inv: p.inv, equip: p.equip });
      return;
    }
    // Приборы (резонатор/браслеты/компрессор/наручи) точить нельзя: у них своя линия прокачки
    // корпуса (device_upgrade), и plus на их статы не влияет.
    const tid = String(item.templateId || item.id || '').toLowerCase();
    const lootTpl = (LR && LR.itemById) ? LR.itemById(tid) : ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[tid] : null);
    const eTpl = ITEMS.get(tid) || lootTpl || null;
    if (slot === 'resonator' || slot === 'bracelet' ||
        (eTpl && (ITEMS.isResonatorTpl(eTpl) || ITEMS.isNanoBraceletTpl(eTpl) ||
                  eTpl.isCompressor || eTpl.isOperatorDevice || eTpl.isValveDevice ||
                  eTpl.isBracers || eTpl.isOperatorBracers || eTpl.isBraceletDevice || eTpl.isCircuitDevice))) {
      send(p, { t: 'enchant_fail', slot, plus, reason: 'device', inv: p.inv, equip: p.equip });
      return;
    }
    const ENCHANTABLE_SLOTS = new Set([
      'weapon', 'shield', 'lhand',
      'head', 'helmet', 'chest', 'legs', 'gloves', 'hands', 'feet', 'boots',
      'necklace', 'earring_l', 'earring_r', 'earring', 'ring_l', 'ring_r', 'ring'
    ]);
    if (!ENCHANTABLE_SLOTS.has(slot) || (eTpl && (eTpl.type === 'title' || eTpl.type === 'costume' || eTpl.slot === 'title' || eTpl.slot === 'costume'))) {
      send(p, { t: 'enchant_fail', slot, plus, reason: 'not_enchantable', inv: p.inv, equip: p.equip });
      return;
    }
    const itemGrade = ER.gradeKey(eTpl && eTpl.grade);
    const isWeaponSlot = (slot === 'weapon' || (eTpl && eTpl.type === 'weapon'));
    let scrollId = msg.scrollId ? String(msg.scrollId).toLowerCase() : '';
    if (scrollId) {
      if (isBadKey(scrollId)) return;
      const sTpl = ITEMS.get(scrollId) || ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[scrollId] : null);
      const isKnownScroll = scrollId === 'pressure_amplifier' || scrollId === 'pressure_amplifier_d' || scrollId === 'blessed_pressure_amplifier' || (sTpl && sTpl.type === 'enchant');
      if (!isKnownScroll) {
        send(p, { t: 'enchant_fail', slot, plus, reason: 'wrong_scroll', inv: p.inv, equip: p.equip });
        return;
      }
      const sGrade = (sTpl && sTpl.grade) ? ER.gradeKey(sTpl.grade) : (scrollId === 'pressure_amplifier_d' ? 'd' : 'no_grade');
      if (scrollId !== 'pressure_amplifier' && scrollId !== 'blessed_pressure_amplifier' && sGrade !== 'no_grade' && sGrade !== itemGrade) {
        send(p, { t: 'enchant_fail', slot, plus, reason: 'wrong_grade', inv: p.inv, equip: p.equip });
        return;
      }
      if (sTpl && sTpl.targetType && ((sTpl.targetType === 'weapon' && !isWeaponSlot) || (sTpl.targetType === 'armor' && isWeaponSlot))) {
        send(p, { t: 'enchant_fail', slot, plus, reason: 'wrong_scroll', inv: p.inv, equip: p.equip });
        return;
      }
      if ((p.inv[scrollId] || 0) < 1) {
        send(p, { t: 'msg', text: 'Нужен усилитель давления.' });
        return;
      }
    } else {
      if (itemGrade === 'd' && (p.inv.pressure_amplifier_d || 0) >= 1) {
        scrollId = 'pressure_amplifier_d';
      } else if ((p.inv.pressure_amplifier || 0) >= 1) {
        scrollId = 'pressure_amplifier';
      } else if ((p.inv.blessed_pressure_amplifier || 0) >= 1) {
        scrollId = 'blessed_pressure_amplifier';
      } else {
        send(p, { t: 'msg', text: 'Нужен усилитель давления.' });
        return;
      }
    }
    p.inv[scrollId] -= 1;
    if (p.inv[scrollId] <= 0) delete p.inv[scrollId];
    const isBlessed = scrollId === 'blessed_pressure_amplifier';
    const forceBreak = p.dev && String(msg.force || '') === 'break';
    const rollVal = crypto.randomInt(0, 100000000) / 100000000;
    const okRoll = !forceBreak && rollVal < G.enchantSuccess(plus);
    if (okRoll) {
      item.plus = plus + 1;
      // H10: plus живёт на надетом экземпляре; plusById — только сумка
      // (раньше запись сумки тоже менялась, и копия в сумке «точилась» даром).
      pushCombatStats(p);  // plus теперь влияет на статы (item-db)
      send(p, { t: 'enchant_ok', slot, plus: item.plus, inv: p.inv, equip: p.equip });
    } else if (plus >= G.ENCHANT_SAFE && !isBlessed) {
      const crySrc = Object.assign({}, eTpl || {}, lootTpl || {});
      const cry = ER.crystalize(crySrc, plus);
      delete p.equip[slot];
      // реестр сумки не трогаем: копия в сумке — другой экземпляр
      let crystals = null;
      let ground = false;
      if (cry && cry.count > 0) {
        const fit = NPCS.canFit(p.inv, cry.crystalId, cry.count);
        const carry = canCarryMore(p, cry.crystalId, cry.count);
        if (fit.ok && carry.ok) {
          p.inv[cry.crystalId] = invCount(p, cry.crystalId) + cry.count;
          crystals = { id: cry.crystalId, count: cry.count };
        } else {
          spawnGroundLoot(p.x, p.z, cry.crystalId, cry.count, p.pid, { spoil: false });
          crystals = { id: cry.crystalId, count: cry.count };
          ground = true;
        }
      }
      pushCombatStats(p);
      pushWeight(p);
      send(p, { t: 'enchant_break', slot, crystals: crystals, ground: ground, inv: p.inv, equip: p.equip });
    } else {
      if (isBlessed && plus >= G.ENCHANT_SAFE) {
        item.plus = 0;
        pushCombatStats(p);
      }
      send(p, { t: 'enchant_fail', slot, plus: item.plus | 0, blessedReset: isBlessed && plus >= G.ENCHANT_SAFE, inv: p.inv, equip: p.equip });
    }
    saveProfileNow(p);
  }

  return {
    doEnchant
  };
}

createEnchantHandler.createEnchantHandler = createEnchantHandler;
module.exports = createEnchantHandler;
