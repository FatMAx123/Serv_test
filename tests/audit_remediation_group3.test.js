// ============================================================
//  TESTS / AUDIT_REMEDIATION_GROUP3.TEST.JS
//  Аудит сервера, группа 3 — решения по дизайну:
//   - HP-банки восстанавливают постепенно (HoT), MP-банки выведены из экономики;
//   - медь хранится на складе (плата за вклад — из той же меди);
//   - лук тратит стрелу грейда лука и энергию за выстрел;
//   - «крит-дроп» убран.
// ============================================================
'use strict';

const ITEMS = require('../shared/item-db.js');
const NPCS = require('../shared/npc-services.js');
const LR = require('../shared/loot-rules.js');
const G = require('../shared/game-rules.js');
const QD = require('../shared/quest-db.js');

const RETIRED_MP = ['pressure_canister', 'high_pressure_tank', 'coffee_grounds_oil', 'recipe_pressure_canister'];

module.exports = async function (t) {
  // ------------------------------------------------------------------
  t.suite('Группа 3.1: банки — HP постепенно, MP выведены из экономики');
  {
    const createItemUseHandler = require('../server/handlers/item-use-handler.js');
    const sent = [];
    const h = createItemUseHandler({
      players: new Map(), send: (_p, m) => sent.push(m), checkRate: () => true, isBadKey: () => false,
      pushEffects: () => {}, pushCombatStats: () => {}, pushWeight: () => {}, saveProfileNow: () => {},
      itemLookup: (id) => ITEMS.get(id),
      tableGet: (tbl, k) => (tbl && Object.prototype.hasOwnProperty.call(tbl, k) ? tbl[k] : null),
      applyPlayerBuff: (p, b) => { p.buffs = p.buffs || []; p.buffs.push(b); },
      playerStunned: () => false
    });
    const p = { pid: 1, name: 'Drinker', dead: false, hp: 40, maxHp: 200, energy: 50, maxEnergy: 100, inv: { synthetic_oil: 2 }, cd: {} };
    h.doItemUse(p, { id: 'synthetic_oil' });
    const hot = (p.buffs || []).find(b => b.id === 'potion_hp');
    t.eq(p.hp, 40, 'HP не прибавилось мгновенно');
    t.ok(hot && Math.abs(hot.hpRegenFlat * hot.duration - 50) < 1e-9, 'HoT-бафф несёт весь объём банки (50 HP)');
    t.ok(p.cd.potionHp - Date.now() > 14000, 'КД банки = длительности HoT');

    for (const id of RETIRED_MP) t.ok(ITEMS.get(id) && ITEMS.get(id).retired, id + ' помечен retired');
    let inShop = [];
    for (const n of NPCS.allNpcs()) {
      if (!Array.isArray(n.shop)) continue;
      for (const e of NPCS.shopCatalog(n.id)) if (RETIRED_MP.includes(e.itemId)) inShop.push(n.id + ':' + e.itemId);
    }
    t.eq(inShop, [], 'MP-банок нет ни в одном магазине');
    let dropped = 0;
    for (let i = 0; i < 400; i++) {
      const d = LR.rollMobLoot('boiler_exploder_b1', 6, 6, {});
      if (d.items.some(it => RETIRED_MP.includes(it.id))) dropped++;
    }
    t.eq(dropped, 0, 'MP-банки не выпадают (у моба был шанс 70%)');
    t.ok(!G.RECIPES.pressure_canister, 'рецепта MP-банки нет');
    let questMp = 0;
    JSON.stringify(QD, (k, v) => { if (v && RETIRED_MP.includes(v.id)) questMp++; return v; });
    t.eq(questMp, 0, 'в квестовых наградах нет MP-банок');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 3.2: медь на складе (плата за вклад из той же меди)');
  {
    const createWarehouseHandler = require('../server/handlers/warehouse-handler.js');
    const msgs = [];
    const inv = (pl, id) => (Number(pl.inv[id]) || 0);
    const wh = createWarehouseHandler({
      send: (_p, m) => msgs.push(m), isBadKey: () => false, invCount: inv,
      currencyOf: (pl) => inv(pl, 'copper_parts'),
      takeCurrency: (pl, n) => { if (inv(pl, 'copper_parts') < n) return false; pl.inv.copper_parts = inv(pl, 'copper_parts') - n; return true; },
      pruneInv: (pl) => { for (const k of Object.keys(pl.inv)) if (!pl.inv[k]) delete pl.inv[k]; },
      pruneCounts: (m) => { for (const k of Object.keys(m)) if (!m[k]) delete m[k]; },
      canCarryMore: () => ({ ok: true }), pushWeight: () => {}, saveProfileNow: () => {},
      npcForService: () => ({ id: 'wh', type: 'warehouse' })
    });
    const fee = NPCS.WH_FEE_PER_STACK;
    const p = { pid: 2, dead: false, inv: { copper_parts: 1000 }, wh: {}, plusById: {}, whPlusById: {} };
    wh.doWarehousePut(p, { npcId: 'wh', itemId: 'copper_parts', count: 100 });
    t.eq(p.wh.copper_parts, 100, 'на складе 100 меди');
    t.eq(p.inv.copper_parts, 1000 - 100 - fee, 'в сумке −100 и плата (раньше плата не списывалась)');
    wh.doWarehousePut(p, { npcId: 'wh', itemId: 'copper_parts', count: 99999 });
    t.eq(p.inv.copper_parts | 0, 0, 'вклад всей меди: плата удержана, в сумке 0');
    t.eq(p.wh.copper_parts, 100 + (1000 - 100 - fee) - fee, 'на склад ушло всё за вычетом платы');
    msgs.length = 0;
    p.inv.copper_parts = 20;
    wh.doWarehousePut(p, { npcId: 'wh', itemId: 'copper_parts', count: 10 });
    t.ok(msgs.some(m => m.t === 'wh_fail' && m.reason === 'funds') && p.inv.copper_parts === 20, 'меди меньше платы — вклад отклонён, ничего не списано');
    const before = p.wh.copper_parts;
    wh.doWarehouseTake(p, { npcId: 'wh', itemId: 'copper_parts', count: 50 });
    t.eq(p.inv.copper_parts, 70, 'выдача без платы');
    t.eq(p.wh.copper_parts, before - 50, 'со склада ушло 50');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 3.3: лук тратит стрелу и энергию за выстрел');
  {
    t.eq(ITEMS.bowAmmo({ templateId: 'spring_bow' }), { arrowId: 'wooden_arrow', mp: 1 }, 'NG лук: деревянная стрела + 1 MP');
    t.eq(ITEMS.bowAmmo({ templateId: 'reinforced_bow' }), { arrowId: 'iron_arrow', mp: 2 }, 'D лук: железная стрела + 2 MP');
    t.eq(ITEMS.bowAmmo({ templateId: 'operator_hammer_low' }), null, 'не лук — без расхода');

    const { createCombatResolver } = require('../server/combat/combat-resolver.js');
    const sent = [];
    const mob = { mid: 5, mobId: 'scrapper', hp: 500, maxHp: 500, pDef: 10, evasion: 0, level: 1, x: 10, z: 0 };
    const cr = createCombatResolver({
      mobs: new Map([[5, mob]]), players: new Map(),
      send: (_p, m) => sent.push(m), broadcastAOI: () => {},
      consumeArmedShot: () => ({ shotMod: 1, consumed: null })
    });
    const archer = {
      pid: 3, name: 'Archer', dead: false, hp: 100, maxHp: 100, energy: 10, maxEnergy: 50, level: 5, cls: 'gunner',
      inv: { wooden_arrow: 2 }, cd: {}, buffs: [],
      equip: { weapon: { id: 'spring_bow', templateId: 'spring_bow' } },
      combatPack: { pAtk: 30, accuracy: 999, critRate: 0, critDamage: 2, weaponClass: 'bow', atkIntervalMs: 1000, dex: 30, wit: 20, tier: 1 }
    };
    t.ok(cr.resolvePveAttack(archer, { mid: 5 }), 'выстрел прошёл');
    t.eq(archer.inv.wooden_arrow, 1, 'стрела списана');
    t.eq(archer.energy, 9, 'энергия списана (1 MP)');
    archer.cd = {};
    cr.resolvePveAttack(archer, { mid: 5 });
    t.ok(!archer.inv.wooden_arrow, 'последняя стрела ушла');
    archer.cd = {};
    sent.length = 0;
    t.eq(cr.resolvePveAttack(archer, { mid: 5 }), false, 'без стрел лук не стреляет');
    t.ok(sent.some(m => m.t === 'msg' && /стрел/i.test(m.text)), 'игрок получил сообщение «нет стрел»');
    archer.inv.wooden_arrow = 5; archer.energy = 0; archer.cd = {};
    t.eq(cr.resolvePveAttack(archer, { mid: 5 }), false, 'без энергии лук не стреляет');
    t.eq(archer.inv.wooden_arrow, 5, 'стрела при отказе не тратится');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 3.5: D-экип в магазинах не продаётся (только крафт/дроп)');
  {
    const dEquip = [];
    let dConsumable = 0;
    for (const n of NPCS.allNpcs()) {
      if (!Array.isArray(n.shop)) continue;
      for (const e of NPCS.shopCatalog(n.id)) {
        if (e.grade === 'no_grade') continue;
        if (['weapon', 'armor', 'shield', 'accessory', 'jewelry'].includes(e.type)) dEquip.push(n.id + ':' + e.itemId);
        else dConsumable++;
      }
    }
    t.eq(dEquip, [], 'ни в одном магазине нет экипировки выше No-Grade');
    t.ok(dConsumable > 0, 'D-расходники (соски, стрелы, усилитель, чертежи) в продаже остались');
    t.eq(NPCS.shopEntry('trader_dora', 'coral_earring'), null, 'покупка D-серьги у Доры невозможна');
  }

  // ------------------------------------------------------------------
  t.suite('Группа 3.4: «крит-дроп» убран');
  {
    t.eq(LR.LOOT_CONFIG.CRIT_DROP_CHANCE, 0, 'шанс крит-дропа 0');
    let crit = 0;
    for (let i = 0; i < 300; i++) if (LR.rollMobLoot('scrapper', 3, 3, {}).crit) crit++;
    t.eq(crit, 0, 'ни одного крит-дропа за 300 роллов');
  }
};
