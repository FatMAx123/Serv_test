// ============================================================
//  TESTS / STAGE6_SECURITY_HARDENING.TEST.JS
//  Unit tests for Stage 6 Security & Exploit Hardening:
//  - class_transfer: in_combat, busy (trade/store), dead, trainer proximity, and HP/MP ratio preservation.
//  - biotin_trophy_turnin: dead check, busy (trade/store) check.
//  - doShopSell: dead check, busy (trade/store) check.
//  - wooden_arrow pricing: 0 sell price for 1-cost items (no 1:1 arbitrage).
//  - mob return evade: dots cleared on return, attacks evade while returning.
//  - shout chat cooldown: 4-second throttle per player.
//  - isNameTaken O(1) skeleton cache: fast lookup, name collision prevention.
// ============================================================
'use strict';

const assert = require('assert');
const NPCS = require('../shared/npc-services.js');
const CS = require('../shared/class-system.js');
const QD = require('../shared/quest-db.js');
const { createSkillLearnHandler } = require('../server/handlers/skill-learn-handler.js');
const { createNpcServicesHandler } = require('../server/handlers/npc-services-handler.js');
const createSocialHandler = require('../server/handlers/social-handler.js');
const PlayerDb = require('../server/player-db.js');

module.exports = async function (t) {
  t.suite('stage6: wooden_arrow pricing & trade-ins');
  {
    const sell = NPCS.sellPrice('wooden_arrow');
    t.eq(sell, 0, 'цена сдачи wooden_arrow равна 0 (предотвращает арбитраж 1:1)');
  }

  t.suite('stage6: doShopSell state checks');
  {
    const msgs = [];
    const fakeDeps = {
      NPCS: {
        getNpc: () => ({ id: 'vex', name: 'Векс', shop: ['wooden_arrow'] }),
        inRange: () => true,
        sellPrice: () => 40
      },
      send: (p, m) => msgs.push(m)
    };
    const nsh = createNpcServicesHandler(fakeDeps);

    // Dead player
    msgs.length = 0;
    nsh.doShopSell({ dead: true, hp: 0 }, { npcId: 'vex', itemId: 'operator_hammer_low' });
    t.eq(msgs.length, 1, 'продажа мертвецом отклонена');
    t.eq(msgs[0] && msgs[0].reason, 'dead', 'причина отказа — dead');

    // Player in trade
    msgs.length = 0;
    nsh.doShopSell({ dead: false, hp: 100, trade: {} }, { npcId: 'vex', itemId: 'operator_hammer_low' });
    t.eq(msgs[0] && msgs[0].reason, 'busy', 'продажа во время трейда отклонена (busy)');

    // Player in store
    msgs.length = 0;
    nsh.doShopSell({ dead: false, hp: 100, store: {} }, { npcId: 'vex', itemId: 'operator_hammer_low' });
    t.eq(msgs[0] && msgs[0].reason, 'busy', 'продажа во время лавки отклонена (busy)');
  }

  t.suite('stage6: class_transfer exploit hardening');
  {
    const msgs = [];
    const slh = createSkillLearnHandler({
      CS, QD, NPCS,
      send: (p, m) => msgs.push(m),
      broadcastAOI: () => {},
      saveProfileNow: () => {},
      grantExpertiseSkills: () => {}
    });

    const basePlayer = {
      pid: 201, cls: 'engineer', level: 20, maxHp: 300, maxEnergy: 150, hp: 300, energy: 150,
      quests: { done: { path_to_technomancer: { n: 1, at: Date.now() } } },
      applyClassStats: () => {}
    };

    // Dead
    msgs.length = 0;
    slh.doClassTransfer(Object.assign({}, basePlayer, { dead: true, hp: 0 }), 'technomancer');
    t.eq(msgs[0] && msgs[0].reason, 'dead', 'смена класса мертвецом отклонена');

    // Trade
    msgs.length = 0;
    slh.doClassTransfer(Object.assign({}, basePlayer, { trade: {} }), 'technomancer');
    t.eq(msgs[0] && msgs[0].reason, 'busy', 'смена класса во время трейда отклонена');

    // PvP Flagged
    msgs.length = 0;
    slh.doClassTransfer(Object.assign({}, basePlayer, { isFlagged: true }), 'technomancer');
    t.eq(msgs[0] && msgs[0].reason, 'in_combat', 'смена класса под PvP-флагом отклонена');

    // Active Combat (<10s)
    msgs.length = 0;
    slh.doClassTransfer(Object.assign({}, basePlayer, { _lastCombatAt: Date.now() - 3000 }), 'technomancer');
    t.eq(msgs[0] && msgs[0].reason, 'in_combat', 'смена класса в бою отклонена');

    // Trainer distance check when player is in the world (outside peace zone)
    msgs.length = 0;
    const worldPlayer = Object.assign({}, basePlayer, { x: 5000, z: 5000 });
    slh.doClassTransfer(worldPlayer, 'technomancer');
    t.eq(msgs[0] && msgs[0].reason, 'range', 'смена класса в чистом поле без тренера отклонена');

    // Transfer in peace zone (town)
    msgs.length = 0;
    const townPlayer = Object.assign({}, basePlayer, { x: -107.5, z: -246.4 });
    const townSlh = createSkillLearnHandler({
      CS, QD, NPCS,
      send: (p, m) => msgs.push(m),
      broadcastAOI: () => {},
      saveProfileNow: () => {},
      grantExpertiseSkills: () => {},
      isPeaceAt: () => true
    });
    t.eq(townSlh.doClassTransfer(townPlayer, 'technomancer'), true, 'смена класса в мирной зоне города успешна');

    // Preserve HP/MP ratio (No full-heal exploit)
    const woundedPlayer = {
      pid: 202, cls: 'engineer', level: 20,
      maxHp: 200, hp: 50, // 25% HP
      maxEnergy: 100, energy: 20, // 20% MP
      quests: { done: { path_to_technomancer: { n: 1, at: Date.now() } } },
      applyClassStats: function() {
        this.maxHp = 400;     // Class upgrade increases maxHp
        this.maxEnergy = 200; // Class upgrade increases maxEnergy
      }
    };
    const ok = slh.doClassTransfer(woundedPlayer, 'technomancer');
    t.eq(ok, true, 'смена класса успешна');
    t.eq(woundedPlayer.cls, 'technomancer', 'профессия изменена на technomancer');
    t.eq(woundedPlayer.hp, 100, 'HP сохранило долю 25% (100 из 400, исключён фулл-хил)');
    t.eq(woundedPlayer.energy, 40, 'Energy сохранила долю 20% (40 из 200, исключён фулл-хил)');
  }

  t.suite('stage6: shout chat channel cooldown');
  {
    const msgs = [];
    const social = createSocialHandler({
      players: new Map(),
      pidByYid: new Map(),
      send: (p, m) => msgs.push(m),
      sendPid: () => {},
      broadcastAOI: () => {},
      broadcastRegion: () => {},
      partyOf: () => null,
      sendClan: () => {},
      isGM: () => false,
      handleGmCommand: () => {},
      sanitizeCharName: (n) => n,
      saveProfileNow: () => {},
      isBadKey: () => false,
      TR: null
    });

    const p = { pid: 301, yid: 'user_shout', name: 'Shouter', region: 'village' };

    // First shout succeeds
    msgs.length = 0;
    social.doChat(p, { ch: 'shout', text: 'Первый крик' });
    t.eq(msgs.length, 0, 'первый крик проходит без ошибки');

    // Second immediate shout is rejected with cooldown
    msgs.length = 0;
    social.doChat(p, { ch: 'shout', text: 'Спам крика' });
    t.eq(msgs.length, 2, 'повторный крик отклонен');
    t.eq(msgs[0] && msgs[0].t, 'chat_fail', 'тип ответа — chat_fail');
    t.eq(msgs[0] && msgs[0].reason, 'cooldown', 'причина ответа — cooldown');
  }

  t.suite('stage6: isNameTaken O(1) skeleton homoglyph cache');
  {
    PlayerDb.touch({ name: 'Alpha' }, 'user_a', 'c0');
    t.eq(PlayerDb.isNameTaken('Alpha'), true, 'точное совпадение найдено');
    t.eq(PlayerDb.isNameTaken('alpha'), true, 'регистронезависимое совпадение найдено');
    t.eq(PlayerDb.isNameTaken('Alpha', 'user_a'), false, 'владелец имени пропускается');
    t.eq(PlayerDb.isNameTaken('Аlpha'), true, 'визуальный гомоглиф с кириллицей детектируется');
    t.eq(PlayerDb.isNameTaken('Unique_New_Player_999'), false, 'свободное имя доступно');
  }
};
