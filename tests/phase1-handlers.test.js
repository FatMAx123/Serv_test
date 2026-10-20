// ============================================================
//  TESTS / PHASE1-HANDLERS.TEST.JS
//  Модульные тесты изолированных хэндлеров Фазы 1:
//  - ItemUseHandler (server/handlers/item-use-handler.js)
//  - EnchantHandler (server/handlers/enchant-handler.js)
//  - InventoryActionHandler (server/handlers/inventory-action-handler.js)
// ============================================================
'use strict';

const { createItemUseHandler } = require('../server/handlers/item-use-handler.js');
const { createEnchantHandler } = require('../server/handlers/enchant-handler.js');
const { createInventoryActionHandler } = require('../server/handlers/inventory-action-handler.js');
const ITEMS = require('../shared/item-db.js');
const ER = require('../shared/enchant-rules.js');
const DR = require('../shared/death-rules.js');

module.exports = function(t) {
  t.suite('phase1: ItemUseHandler isolation & mechanics');

  const sent = [];
  const fakeSend = (p, msg) => { sent.push(msg); };
  const fakeSave = () => {};

  const itemUseHandler = createItemUseHandler({
    players: new Map(),
    send: fakeSend,
    broadcastAOI: () => {},
    snapStandY: () => {},
    isPeaceAt: () => true,
    zoneLabelAt: () => 'Test Zone',
    updatePlayerRegion: () => {},
    ensureNearbyMobs: () => {},
    resetMoveBudget: () => {},
    entityTransforms: null,
    saveProfileNow: fakeSave,
    pushEffects: () => {},
    pushCombatStats: () => {},
    applyPlayerBuff: (p, b) => { p.buffs = p.buffs || []; p.buffs.push(b); },
    resurrectPlayer: () => {},
    deathSelfPayload: () => ({}),
    grantSkillFree: () => ({ ok: false }),
    cosmeticsPublic: () => ({}),
    tableGet: (tbl, k) => (tbl && typeof tbl === 'object' && Object.prototype.hasOwnProperty.call(tbl, k)) ? tbl[k] : null,
    itemLookup: (id) => ITEMS.get(id),
    checkRate: () => true,
    isBadKey: (k) => k === '__proto__',
    playerStunned: (p) => Array.isArray(p.debuffs) && p.debuffs.some(d => d && d.kind === 'stun'),
    dist2: (x1, z1, x2, z2) => ((x1 || 0) - (x2 || 0)) ** 2 + ((z1 || 0) - (z2 || 0)) ** 2,
    toggleShotArm: () => null
  });

  const pDead = { pid: 1, name: 'DeadPlayer', dead: true, inv: { synthetic_oil: 5 } };
  sent.length = 0;
  itemUseHandler.doItemUse(pDead, { id: 'synthetic_oil' });
  t.eq(sent[0].t, 'use_fail', 'мёртвый игрок получает use_fail');
  t.eq(sent[0].reason, 'dead', 'причина use_fail: dead');

  const pStunned = { pid: 2, name: 'StunnedPlayer', dead: false, debuffs: [{ kind: 'stun' }], inv: { synthetic_oil: 5 } };
  sent.length = 0;
  itemUseHandler.doItemUse(pStunned, { id: 'synthetic_oil' });
  t.eq(sent[0].t, 'use_fail', 'оглушённый игрок получает use_fail');
  t.eq(sent[0].reason, 'stunned', 'причина use_fail: stunned');

  const pCombat = { pid: 3, name: 'CombatPlayer', dead: false, isFlagged: true, inv: { scroll_escape: 1 } };
  sent.length = 0;
  itemUseHandler.doItemUse(pCombat, { id: 'scroll_escape' });
  t.eq(sent[0].t, 'use_fail', 'боевой игрок не может использовать свиток побега');
  t.eq(sent[0].reason, 'flagged', 'причина use_fail: flagged');

  // Успешное использование зелья исцеления
  const pHeal = { pid: 4, name: 'InjuredPlayer', dead: false, hp: 50, maxHp: 100, energy: 50, maxEnergy: 100, inv: { synthetic_oil: 2 }, cd: {} };
  sent.length = 0;
  itemUseHandler.doItemUse(pHeal, { id: 'synthetic_oil' });
  t.eq(pHeal.inv.synthetic_oil, 1, 'зелье списано из инвентаря');
  t.ok(pHeal.hp > 50, 'HP игрока восстановилось');
  t.ok(pHeal.cd.potionHp > Date.now(), 'кд на зелье исцеления выставлен');
  t.ok(sent.some(m => m.t === 'use_ok'), 'клиент получил пакет use_ok');

  t.suite('phase1: EnchantHandler validation & safe rules');

  const enchantHandler = createEnchantHandler({
    send: fakeSend,
    checkRate: () => true,
    isBadKey: (k) => k === '__proto__',
    pushCombatStats: () => {},
    pushWeight: () => {},
    saveProfileNow: fakeSave,
    invCount: (p, id) => (p && p.inv && p.inv[id]) || 0,
    canCarryMore: () => true,
    spawnGroundLoot: () => {}
  });

  const pEnchant = {
    pid: 5,
    name: 'Crafter',
    inv: {},
    equip: { weapon: { id: 'operator_hammer_low', plus: 0 } }
  };
  sent.length = 0;
  // Попытка заточки без усилителя давления
  enchantHandler.doEnchant(pEnchant, { slot: 'weapon' });
  t.eq(sent[0].t, 'msg', 'без усилителя давления выводится сообщение');
  t.ok(sent[0].text.includes('Нужен усилитель давления'), 'текст сообщения: Нужен усилитель давления');

  // Попытка заточить прибор (резонатор)
  const pResonator = {
    pid: 6,
    name: 'Tinkerer',
    inv: { pressure_amplifier: 2 },
    equip: { resonator: { id: 'engineer_emitter_low', plus: 0 } }
  };
  sent.length = 0;
  enchantHandler.doEnchant(pResonator, { slot: 'resonator' });
  t.eq(sent[0].t, 'enchant_fail', 'заточка прибора отклонена');
  t.eq(sent[0].reason, 'device', 'причина: device');

  // Слом предмета выше safe-лимита с принудительным break
  const pBreak = {
    pid: 7,
    name: 'RiskyPlayer',
    dev: true,
    inv: { pressure_amplifier: 1 },
    equip: { weapon: { id: 'operator_hammer_low', plus: 4, templateId: 'operator_hammer_low' } }
  };
  sent.length = 0;
  enchantHandler.doEnchant(pBreak, { slot: 'weapon', force: 'break' });
  t.eq(sent[0].t, 'enchant_break', 'слом оружия вызывает пакет enchant_break');
  t.eq(pBreak.equip.weapon, undefined, 'сломанное оружие снято');

  t.suite('phase1: InventoryActionHandler nodrop & equip');

  const invHandler = createInventoryActionHandler({
    send: fakeSend,
    checkRate: () => true,
    isBadKey: (k) => k === '__proto__',
    equipSlotForTpl: (tpl) => tpl.slot || tpl.type,
    stampDeviceFields: () => {},
    pushCombatStats: () => {},
    pushWeight: () => {},
    saveProfileNow: fakeSave,
    broadcastCosmeticsUpdate: () => {},
    invCount: (p, id) => (p && p.inv && p.inv[id]) || 0,
    spawnGroundLoot: () => {},
    itemLookup: (id) => ITEMS.get(id)
  });

  // Защита персональных и квестовых приборов от дропа и удаления
  const pDevice = {
    pid: 8,
    name: 'Mechanic',
    inv: { spark_resonator: 1, copper_parts: 100 },
    equip: {}
  };

  sent.length = 0;
  invHandler.doDropItem(pDevice, { id: 'spark_resonator', count: 1 });
  t.eq(sent[0].t, 'drop_fail', 'персональный прибор нельзя выбросить на землю');
  t.eq(sent[0].reason, 'nodrop', 'причина: nodrop');

  sent.length = 0;
  invHandler.doDestroyItem(pDevice, { id: 'spark_resonator', count: 1 });
  t.eq(sent[0].t, 'destroy_fail', 'персональный прибор нельзя уничтожить');
  t.eq(sent[0].reason, 'nodrop', 'причина: nodrop');

  // Обычный предмет успешно удаляется
  sent.length = 0;
  invHandler.doDestroyItem(pDevice, { id: 'copper_parts', count: 10 });
  t.eq(pDevice.inv.copper_parts, 90, '90 copper_parts осталось');
  t.ok(sent.some(m => m.t === 'destroy_ok'), 'destroy_ok отправлен при уничтожении');
};

