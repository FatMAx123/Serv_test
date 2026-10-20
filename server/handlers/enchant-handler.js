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
    // Приборы (резонатор/браслеты) точить нельзя: у них своя линия прокачки
    // корпуса (device_upgrade), и plus на их статы не влияет.
    const eTpl = ITEMS.get(String(item.templateId || item.id || '').toLowerCase());
    if (eTpl && (ITEMS.isResonatorTpl(eTpl) || ITEMS.isNanoBraceletTpl(eTpl))) {
      send(p, { t: 'enchant_fail', slot, plus, reason: 'device', inv: p.inv, equip: p.equip });
      return;
    }
    if ((p.inv.pressure_amplifier || 0) < 1) { send(p, { t:'msg', text:'Нужен усилитель давления.' }); return; }
    p.inv.pressure_amplifier -= 1;
    if (p.inv.pressure_amplifier <= 0) delete p.inv.pressure_amplifier;
    const forceBreak = p.dev && String(msg.force || '') === 'break';
    const rollVal = crypto.randomInt(0, 100000000) / 100000000;
    const okRoll = !forceBreak && rollVal < G.enchantSuccess(plus);
    if (okRoll) {
      item.plus = plus + 1;
      // H10: plus живёт на надетом экземпляре; plusById — только сумка
      // (раньше запись сумки тоже менялась, и копия в сумке «точилась» даром).
      pushCombatStats(p);  // plus теперь влияет на статы (item-db)
      send(p, { t: 'enchant_ok', slot, plus: item.plus, inv: p.inv, equip: p.equip });
    } else if (plus >= G.ENCHANT_SAFE) {
      const tid = String(item.templateId || item.id || '').toLowerCase();
      const lootTpl = (LR && LR.itemById) ? LR.itemById(tid) : ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[tid] : null);
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
      send(p, { t: 'enchant_fail', slot, plus, inv: p.inv, equip: p.equip });
    }
    saveProfileNow(p);
  }

  return {
    doEnchant
  };
}

createEnchantHandler.createEnchantHandler = createEnchantHandler;
module.exports = createEnchantHandler;
