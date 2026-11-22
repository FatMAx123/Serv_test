// SERVER / HANDLERS / ENCHANT-HANDLER.JS
// Заточка оружия и брони усилителями давления (L2 enchant & crystallization rules)
'use strict';

const crypto = require('crypto');
const ITEMS = require('../../shared/item-db.js');
const G = require('../../shared/game-rules.js');
const LR = require('../../shared/loot-rules.js');
const ER = require('../../shared/enchant-rules.js');
const NPCS = require('../../shared/npc-services.js');
const SEC = require('../security-config.js');

/** MEDIUM-3: обход грейда усилителя — dev-сессия; префикс itest_ — только в небезопасном dev-режиме. */
function isDevEnchanter(p) {
  if (!p) return false;
  if (p.dev) return true;
  return SEC.insecureDev() && !!p.yid && String(p.yid).startsWith('itest_');
}

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
    spawnGroundLoot,
    playerStunned = () => false
  } = ctx;

  /**
   * Заточка (L2): усилитель + предмет. Цель — надетый слот (msg.slot) или одиночный предмет
   * в сумке (msg.itemId). Окно заточки клиента шлёт { scrollId, slot | itemId }.
   * В сумке точится только одиночная копия: заточка в сумке хранится на шаблон (plusById),
   * и стопку из нескольких копий заточить нельзя — иначе +N достался бы всем.
   */
  function doEnchant(p, msg) {
    if (p.dead || p.hp <= 0) return;
    if (playerStunned(p)) { send(p, { t: 'enchant_fail', reason: 'stunned' }); return; }
    if (p.trade || p.store) { send(p, { t: 'enchant_fail', reason: 'busy' }); return; }
    if (!checkRate(p, 'action')) return;
    if (!p.plusById) p.plusById = Object.create(null);

    // slot='__proto__' раньше давал Object.prototype и запись item.plus
    // загрязняла прототип на весь процесс (все предметы становились +N).
    const slot = msg.slot != null ? String(msg.slot) : '';
    const bagId = (!slot && msg.itemId != null) ? String(msg.itemId).toLowerCase() : '';
    if (isBadKey(slot) || isBadKey(bagId)) return;
    let item = null; // надетый экземпляр (для слота)
    let tid = '';
    let plus = 0;
    if (slot) {
      item = Object.prototype.hasOwnProperty.call(p.equip, slot) ? p.equip[slot] : null;
      if (!item || typeof item !== 'object') return;
      tid = String(item.templateId || item.id || '').toLowerCase();
      plus = Math.max(0, Math.floor(+item.plus || 0));
    } else if (bagId) {
      const cnt = invCount(p, bagId);
      if (cnt < 1) { send(p, { t: 'enchant_fail', itemId: bagId, reason: 'none', inv: p.inv, equip: p.equip, invPlus: p.plusById }); return; }
      if (cnt > 1) {
        send(p, { t: 'enchant_fail', itemId: bagId, reason: 'stack', inv: p.inv, equip: p.equip, invPlus: p.plusById });
        send(p, { t: 'msg', text: 'Точить можно только одиночный предмет: уберите лишние копии на склад.' });
        return;
      }
      tid = bagId;
      plus = Math.max(0, Math.floor(Number(p.plusById[bagId]) || 0));
    } else {
      return;
    }
    const where = slot ? { slot } : { itemId: bagId };
    const fail = (reason, extra) => send(p, Object.assign({ t: 'enchant_fail', reason, plus, inv: p.inv, equip: p.equip, invPlus: p.plusById }, where, extra || {}));

    const lootTpl = (LR && LR.itemById) ? LR.itemById(tid) : ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[tid] : null);
    const eTpl = ITEMS.get(tid) || lootTpl || null;
    // Приборы (резонатор/браслеты/компрессор/наручи) точить нельзя: у них своя линия прокачки
    // корпуса (device_upgrade), и plus на их статы не влияет.
    if (slot === 'resonator' || slot === 'bracelet' ||
        (eTpl && (ITEMS.isResonatorTpl(eTpl) || ITEMS.isNanoBraceletTpl(eTpl) ||
                  eTpl.isCompressor || eTpl.isOperatorDevice || eTpl.isValveDevice ||
                  eTpl.isBracers || eTpl.isOperatorBracers || eTpl.isBraceletDevice || eTpl.isCircuitDevice))) {
      fail('device');
      return;
    }
    const ENCHANTABLE_SLOTS = new Set([
      'weapon', 'shield', 'lhand',
      'head', 'helmet', 'chest', 'legs', 'gloves', 'hands', 'feet', 'boots',
      'necklace', 'earring_l', 'earring_r', 'earring', 'ring_l', 'ring_r', 'ring'
    ]);
    const ENCHANTABLE_TYPES = { weapon: 1, armor: 1, shield: 1, accessory: 1, jewelry: 1 };
    const notEnchantable = !eTpl ||
      eTpl.type === 'title' || eTpl.type === 'costume' || eTpl.slot === 'title' || eTpl.slot === 'costume' ||
      (slot ? !ENCHANTABLE_SLOTS.has(slot) : !ENCHANTABLE_TYPES[String(eTpl.type || '').toLowerCase()]);
    if (notEnchantable) { fail('not_enchantable'); return; }

    // Верхняя граница по грейду (enchant-rules: NG +3, D и выше +16) и абсолютный потолок (item-db).
    const maxPlus = Math.min(ITEMS.ENCHANT_MAX, ER.maxLevel(eTpl));
    if (plus >= maxPlus) { fail('max', { max: maxPlus }); return; }
    // Safe: до него попытка всегда успешна; цельная броня — +4 (L2)
    const safePlus = ER.safeLevel(eTpl);
    const itemGrade = ER.gradeKey(eTpl.grade);
    const isWeaponSlot = ER.isWeaponTarget(eTpl, slot);
    // L2: оружие — Enchant Weapon, броня/щит/бижутерия — Enchant Armor
    const kindName = isWeaponSlot ? 'оружие' : 'броня';

    let scrollId = msg.scrollId ? String(msg.scrollId).toLowerCase() : '';
    let sTpl = null;
    if (scrollId) {
      if (isBadKey(scrollId)) return;
      sTpl = ITEMS.get(scrollId) || ((LR && LR.LOOT_ITEMS) ? LR.LOOT_ITEMS[scrollId] : null);
      if (!(sTpl && sTpl.type === 'enchant')) { fail('wrong_scroll'); return; }
      const sGrade = ER.gradeKey(sTpl.grade);
      // dev-обход грейда (MEDIUM-3): NG-усилитель своего типа точит предмет любого грейда
      const devBypass = isDevEnchanter(p) && (scrollId === 'pressure_amplifier' || scrollId === 'armor_pressure_amplifier');
      if (sGrade !== itemGrade && !devBypass) { fail('wrong_grade'); return; }
      if (sTpl.targetType && ((sTpl.targetType === 'weapon' && !isWeaponSlot) || (sTpl.targetType === 'armor' && isWeaponSlot))) {
        fail('wrong_scroll');
        send(p, { t: 'msg', text: 'Этот усилитель не подходит: нужен усилитель «' + kindName + '».' });
        return;
      }
      if ((p.inv[scrollId] || 0) < 1) {
        send(p, { t: 'msg', text: 'Нужен усилитель давления: ' + kindName + '.' });
        fail('no_scroll'); // окно заточки ждёт ответа
        return;
      }
    } else {
      const candidates = ER.scrollCandidates(eTpl, slot);
      if (!candidates.length) { fail('wrong_grade'); return; }
      scrollId = candidates.find((id) => (p.inv[id] || 0) >= 1) || '';
      if (!scrollId && itemGrade === 'd' && isWeaponSlot && isDevEnchanter(p) && (p.inv.pressure_amplifier || 0) >= 1) {
        scrollId = 'pressure_amplifier';
      }
      if (!scrollId) {
        send(p, { t: 'msg', text: 'Нужен усилитель давления: ' + kindName + (itemGrade === 'd' ? ' D' : '') + '.' });
        fail('no_scroll');
        return;
      }
      sTpl = ITEMS.get(scrollId) || null;
    }

    p.inv[scrollId] -= 1;
    if (p.inv[scrollId] <= 0) delete p.inv[scrollId];
    const isBlessed = ER.isBlessedScroll(scrollId, sTpl);
    const forceBreak = p.dev && String(msg.force || '') === 'break';
    const chance = ER.successChance(plus, eTpl, slot);
    const rollVal = crypto.randomInt(0, 100000000) / 100000000;
    const okRoll = !forceBreak && rollVal < chance;
    const setPlus = (v) => {
      if (item) item.plus = v;
      else if (v > 0) p.plusById[bagId] = v;
      else delete p.plusById[bagId];
    };
    const base = Object.assign({ inv: p.inv, equip: p.equip, invPlus: p.plusById, scrollId, templateId: tid }, where);

    if (okRoll) {
      setPlus(plus + 1);
      if (item) pushCombatStats(p); // plus влияет на статы надетого (item-db)
      if (typeof pushWeight === 'function') pushWeight(p);
      send(p, Object.assign({ t: 'enchant_ok', plus: plus + 1 }, base));
    } else if (plus >= safePlus && !isBlessed) {
      // L2: обычный усилитель выше safe — предмет кристаллизуется
      const cry = ER.crystalize(Object.assign({}, eTpl, lootTpl || {}), plus);
      if (item) delete p.equip[slot];
      else { delete p.inv[bagId]; delete p.plusById[bagId]; }
      let crystals = null;
      let ground = false;
      if (cry && cry.count > 0) {
        const fit = NPCS.canFit(p.inv, cry.crystalId, cry.count);
        const carry = canCarryMore(p, cry.crystalId, cry.count);
        if (fit.ok && carry.ok) {
          p.inv[cry.crystalId] = invCount(p, cry.crystalId) + cry.count;
        } else {
          spawnGroundLoot(p.x, p.z, cry.crystalId, cry.count, p.pid, { spoil: false });
          ground = true;
        }
        crystals = { id: cry.crystalId, count: cry.count };
      }
      if (item) pushCombatStats(p);
      pushWeight(p);
      send(p, Object.assign({ t: 'enchant_break', plus, crystals, ground }, base));
    } else {
      // Благословлённый усилитель выше safe: заточка сбрасывается до +0, вещь цела
      const blessedReset = isBlessed && plus >= safePlus;
      if (blessedReset) {
        setPlus(0);
        if (item) pushCombatStats(p);
      }
      if (typeof pushWeight === 'function') pushWeight(p);
      send(p, Object.assign({ t: 'enchant_fail', plus: blessedReset ? 0 : plus, blessedReset }, base));
    }
    saveProfileNow(p);
  }

  return {
    doEnchant
  };
}

createEnchantHandler.createEnchantHandler = createEnchantHandler;
module.exports = createEnchantHandler;
